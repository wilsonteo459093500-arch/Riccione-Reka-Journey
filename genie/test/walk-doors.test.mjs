// 走进去 · 门和飞进飞出（src/studio/walk/doors.js、flight.js —— docs/walk/SPEC.md §3、§4）：
//   doorList 和 house.js 一模一样（每一个模板、每一层：门扇的数目、轴、开向哪边 —— 拿我们的门扇摆到 house.js 的 75° 和合并的门扇逐个顶点比）；
//   开关门：1.6m 以内 / 前面 2m 的路要穿过 → 开，2.2m 以外满 3 秒 → 关，中间那一段不变；没有路 → 开向离人远的那一边；别的楼层不算；
//   门扇不挡路：有路就挑门扇让得开的那一边、路变了换边、楼梯上先不开；沿着 N.path 像控制器那样走一遍每个模板的每一段房间到房间的路；
//   门轴放在哪一头：a 端两边都让不开 → b 端（镜像的门扇和 leafSeg 对得上、关着两头一样）；开着的门 → 关上换门轴再开（不扫到人）；
//   大门往外开（flyIn 用真的门：门扇不扫进门口、镜头离门扇 ≥ 0.4m）；saveOrbit 在补间里只在飞到对好的取景时才算 framed；
//   落地趟门的玻璃走近藏、走开放回；dispose 全部放回去、缓存的几何体不释放；
//   entryPlan（每一个模板，再转 90° / 镜像成四个朝向）：P3 走得过去、P1 在屋子外面（或室外的房间里）、从门洞穿过去的那一点离门框 / 竖框够远；
//   walkFov 横屏 / 竖屏；restoreOrbit 在假的引擎上把镜头 / 目标点 / 主点偏移一点不差地放回去（§4 的顺序）；
//   flyIn / flyOut 用假的 onTick 跑完：落点、开门、跨门槛才盖天花、飞行路线不穿屋顶、飞回来一模一样。
// 纯 Node（three.js 可以在 Node 里跑；canvas 用假的）。跑法：node test/walk-doors.test.mjs

import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as M from '../src/studio/plan/model.js';
import { furnish } from '../src/studio/engine/furnish.js';
import { MatLib } from '../src/studio/engine/matlib.js';
import { useLib } from '../src/studio/engine/furniture.js';
import { buildFloorShell } from '../src/studio/engine/house.js';
import * as N from '../src/studio/walk/nav.js';
import { doorList, createDoors, leafAngle, sideOf, doorDist, pathCrosses, levelOf } from '../src/studio/walk/doors.js';
import { walkFov, entryPlan, frontDoor, flyIn, flyOut, saveOrbit, restoreOrbit, cancelFlight, fadeCanvas, EYE, WALK_FOV } from '../src/studio/walk/flight.js';

let n = 0;
let failed = 0;
async function test(name, fn) {
  n++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 5).join('\n    ')}`);
  }
}

console.log('走进去 · 门和飞进飞出（walk-doors）');

// 假的 canvas：house.js 的底座石纹只用 createImageData / putImageData
const ctx2d = { createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} };
globalThis.document = { documentElement: {}, createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d }) };

// 假的显卡（像 boards-engine.test.mjs）：只要各向异性 + initTexture
const renderer = { capabilities: { getMaxAnisotropy: () => 16 }, initTexture() {} };
const lib = new MatLib(renderer, 'fast');
useLib(lib);

const TPL = M.TEMPLATES.map((t) => t.id);
const indoor = (r) => !!r && !M.ROOM_TYPES[r.type]?.outdoor;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ───────────────────────── 场景：每一层一个壳（house.buildFloorShell），像 floors.js 那样挂在楼层组里 ─────────────────────────

function sceneOf(plan) {
  const nd = N.navDataOf(plan);
  const floors = nd.floors.map((f) => {
    const shell = buildFloorShell({ rooms: f.rooms, openings: f.openings, ceil: f.ceil }, f.walls, lib, { elev: f.elev });
    const group = new THREE.Group();
    group.position.y = f.elev;
    group.add(shell.group);
    group.updateMatrixWorld(true);
    return { id: f.id, level: f.level, elev: f.elev, ceil: f.ceil, group, shell, wallSets: shell.wallSets };
  });
  return { nd, floors };
}

/** createDoors 用到的那一点引擎 */
function doorEngine(floors) {
  return {
    floors,
    lib,
    renderer: { shadowMap: { needsUpdate: false } },
    dirty: false,
    picks: 0,
    collectPickables() {
      this.picks++;
    },
  };
}

const scenes = new Map();
const sceneFor = (id) => {
  if (!scenes.has(id)) scenes.set(id, sceneOf(M.templatePlan(id)));
  return scenes.get(id);
};

/** 门洞外 dist 米、在墙线 side 那一边（+1 = pos）的一点：{ x, y, z }（y = 这一层的眼睛高） */
function eyeAt(L, side, dist, along = (L.a + L.b) / 2, elev = 0) {
  return L.axis === 'x' ? { x: along, y: elev + EYE, z: L.c + side * dist } : { x: L.c + side * dist, y: elev + EYE, z: along };
}
const run = (doors, eye, secs, path = null, step = 0.1) => {
  let changed = false;
  for (let t = 0; t < secs - 1e-9; t += step) changed = doors.update(eye, path, step) || changed;
  return changed;
};

// ───────────────────────── doorList ↔ house.js ─────────────────────────

/** 一个网格的顶点（按索引展开、乘上 matrix）→ Float32 一样的平铺数组 */
function verts(mesh, matrix) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const idx = g.index;
  const out = [];
  const v = new THREE.Vector3();
  const cnt = idx ? idx.count : pos.count;
  for (let i = 0; i < cnt; i++) {
    v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(matrix);
    out.push(v.x, v.y, v.z);
  }
  return out;
}

await test('doorList 和 house.js 一模一样：每个模板每一层的门扇逐个顶点对得上（75° 的鸟瞰门扇 = 我们的门扇摆到同一个角度）', () => {
  let total = 0;
  for (const id of TPL) {
    const { nd, floors } = sceneFor(id);
    const list = doorList(nd);
    const engine = doorEngine(floors);
    const doors = createDoors(engine, nd);
    assert.equal(doors.leaves.length, list.length, `${id}：每一扇都建出来了`);
    floors.forEach((F, fi) => {
      const ours = doors.leaves.filter((L) => L.fi === fi);
      const merged = F.shell.group.children.filter((o) => o.userData.doorLeaves);
      const leafM = merged.find((o) => o.userData.slot === 'cabinetry');
      const handleM = merged.find((o) => o.userData.slot === 'metal');
      if (!ours.length) {
        assert.ok(!leafM && !handleM, `${id}/${F.id}：没有门扇 → 也没有合并的门扇`);
        return;
      }
      const lp = leafM.geometry.attributes.position.array;
      const hp = handleM.geometry.attributes.position.array;
      assert.equal(lp.length, ours.length * 36 * 3, `${id}/${F.id}：合并的门扇有 ${lp.length / 108} 扇，doorList 有 ${ours.length} 扇`);
      ours.forEach((L, i) => {
        // house.js：开向 pos 那边（没有 pos 房间就开向 neg 那边）75°
        assert.equal(L.into, L.wall.pos ? 1 : -1);
        L.pivot.rotation.y = leafAngle(L, (L.into * 75) / 90);
        L.pivot.updateMatrix();
        const leaf = L.pivot.children.find((m) => m.userData.slot === 'cabinetry');
        const handle = L.pivot.children.find((m) => m.userData.slot === 'metal');
        leaf.updateMatrix();
        handle.updateMatrix();
        const mine = verts(leaf, new THREE.Matrix4().multiplyMatrices(L.pivot.matrix, leaf.matrix));
        const mineH = verts(handle, new THREE.Matrix4().multiplyMatrices(L.pivot.matrix, handle.matrix));
        for (let k = 0; k < mine.length; k++) assert.ok(near(mine[k], lp[i * 108 + k], 1e-4), `${id}/${F.id} 第 ${i} 扇门扇的顶点 ${k}：${mine[k]} ≠ ${lp[i * 108 + k]}`);
        for (let k = 0; k < mineH.length; k++) assert.ok(near(mineH[k], hp[i * 108 + k], 1e-4), `${id}/${F.id} 第 ${i} 扇的把手`);
        // 轴 = 门洞 a 端往里 1cm、在墙线上
        assert.ok(near(L.pivot.position.x, L.hinge.x) && near(L.pivot.position.z, L.hinge.z));
        assert.ok(near(L.axis === 'x' ? L.hinge.x : L.hinge.z, L.a + 0.01) && near(L.axis === 'x' ? L.hinge.z : L.hinge.x, L.c));
        assert.ok(L.width <= 1.3 && L.piece.kind === 'door');
      });
      total += ours.length;
    });
    doors.dispose();
  }
  assert.ok(total >= 30, `一共才 ${total} 扇门`);
});

await test('doorList 的规则：宽 > 1.3m 的门洞、只有一边是室外的墙（阳台栏杆）上的门不放门扇；关着的门扇在门洞里', () => {
  const floor = {
    id: 'f0',
    level: 0,
    ceil: 2.8,
    height: 3.15,
    rooms: [
      { id: 'liv', type: 'living', x: 0, y: 0, w: 4, d: 4 },
      { id: 'bed', type: 'bedroom', x: 4, y: 0, w: 3, d: 4 },
      { id: 'bal', type: 'balcony', x: 0, y: 4, w: 4, d: 1.5 },
    ],
    openings: [
      { id: 'd1', kind: 'door', x1: 4, y1: 1, x2: 4, y2: 1.9 }, // 客厅 | 卧室（竖墙）：有门扇
      { id: 'd2', kind: 'door', x1: 4, y1: 2.2, x2: 4, y2: 3.7 }, // 1.5m 宽：没有
      { id: 'd3', kind: 'door', x1: 1, y1: 4, x2: 1.9, y2: 4 }, // 客厅 | 阳台（横墙，两边都有房间）：有
      { id: 'd4', kind: 'door', x1: 1, y1: 5.5, x2: 1.9, y2: 5.5 }, // 阳台外沿（栏杆）：没有
      { id: 'w1', kind: 'window', x1: 5, y1: 0, x2: 6, y2: 0 },
    ],
  };
  const walls = M.buildWalls(floor);
  const nd = { floors: [{ ...floor, elev: 0, walls }], stairs: [] };
  const list = doorList(nd);
  assert.deepEqual(list.map((d) => d.opening).sort(), ['d1', 'd3']);
  const d1 = list.find((d) => d.opening === 'd1');
  assert.equal(d1.axis, 'z');
  assert.ok(near(d1.closedAngle, -Math.PI / 2) && near(d1.width, 0.9));
  assert.equal(list.find((d) => d.opening === 'd3').closedAngle, 0);
  // 和 house.js 画出来的一样多
  const shell = buildFloorShell(floor, walls, lib, {});
  const leafM = shell.group.children.find((o) => o.userData.doorLeaves && o.userData.slot === 'cabinetry');
  assert.equal(leafM.geometry.attributes.position.count / 36, 2);
  // 关着：门扇的外框贴在墙线上、在门洞 a…b 里面
  const group = new THREE.Group();
  group.add(shell.group);
  const doors = createDoors(doorEngine([{ id: 'f0', elev: 0, group, shell, wallSets: shell.wallSets }]), nd);
  for (const L of doors.leaves) {
    L.pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(L.pivot.children.find((m) => m.userData.slot === 'cabinetry'));
    const [u0, u1, v0, v1] = L.axis === 'x' ? [box.min.x, box.max.x, box.min.z, box.max.z] : [box.min.z, box.max.z, box.min.x, box.max.x];
    assert.ok(u0 >= L.a - 1e-6 && u1 <= L.b + 1e-6, `${L.opening}：沿墙 ${u0}…${u1} 不在 ${L.a}…${L.b} 里`);
    assert.ok(v0 >= L.c - 0.03 && v1 <= L.c + 0.03, `${L.opening}：离墙线 ${v0}…${v1}`);
  }
  doors.dispose();
});

// ───────────────────────── 开门 / 关门 ─────────────────────────

/** 一扇两边都是室内房间的门（axis 'x' 或 'z'） */
function interiorDoor(doors, axis, fi = 0) {
  return doors.leaves.find((L) => L.fi === fi && L.axis === axis && indoor(L.wall.neg) && indoor(L.wall.pos) && L.width >= 0.7);
}

/** 门扇的中心在墙线的哪一边、离墙线多远 */
function leafOffset(L) {
  const leaf = L.pivot.children.find((m) => m.userData.slot === 'cabinetry');
  L.pivot.parent.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(leaf);
  const c = box.getCenter(new THREE.Vector3());
  return (L.axis === 'x' ? c.z : c.x) - L.c;
}

await test('开门：1.6m 以内开到 90°、开向离人远的那一边（两种朝向的墙、两边都试）；动的时候 changed，停了不 changed', () => {
  const { nd, floors } = sceneFor('condo3');
  for (const axis of ['x', 'z']) {
    for (const side of [1, -1]) {
      const engine = doorEngine(floors);
      const doors = createDoors(engine, nd);
      const L = interiorDoor(doors, axis);
      assert.ok(L, `condo3 要有一扇 ${axis} 方向的室内门`);
      assert.equal(L.s, 0);
      assert.ok(near(L.pivot.rotation.y, L.closedAngle), '一开始关着');
      const eye = eyeAt(L, side, 1.0);
      assert.equal(doors.update(eye, null, 0.1), true, '开始动 → changed');
      assert.equal(L.target, -side, '开向离人远的那一边');
      run(doors, eye, 0.2);
      assert.ok(Math.abs(L.s) > 0 && Math.abs(L.s) < 1, '0.3 秒还在动（~0.45 秒开完）');
      run(doors, eye, 0.3);
      assert.equal(L.s, -side, '0.6 秒开完');
      assert.ok(near(L.pivot.rotation.y, leafAngle(L, -side)), '90°');
      assert.equal(doors.update(eye, null, 0.1), false, '停了 → 不 changed');
      const off = leafOffset(L);
      assert.equal(Math.sign(off), -side, `门扇在人的另一边（${off}）`);
      assert.ok(near(Math.abs(off), (L.width - 0.02) / 2, 0.05), `门扇垂直于墙（中心离墙线 ${off}）`);
      doors.dispose();
    }
  }
});

await test('关门的滞后：1.6–2.2m 之间不变；2.2m 以外满 3 秒才关（中途回来计时重来）；关好回到关着的角度', () => {
  const { nd, floors } = sceneFor('condo3');
  const doors = createDoors(doorEngine(floors), nd);
  const L = interiorDoor(doors, 'x');
  const side = 1;
  // 1.9m：不开
  run(doors, eyeAt(L, side, 1.9), 1);
  assert.equal(L.target, 0);
  assert.equal(L.s, 0);
  run(doors, eyeAt(L, side, 1.0), 0.6);
  assert.equal(L.s, -side);
  // 2.0m（中间那一段）：一直开着
  run(doors, eyeAt(L, side, 2.0), 6);
  assert.equal(L.target, -side);
  // 走远 2s → 回到 2.0m 0.5s → 又走远 2s：计时重来，还开着
  run(doors, eyeAt(L, side, 3.0), 2);
  run(doors, eyeAt(L, side, 2.0), 0.5);
  run(doors, eyeAt(L, side, 3.0), 2);
  assert.equal(L.target, -side, '中途回来过，计时重来');
  // 再远 0.9s（这一段连续 2.9s）：还开着；再 0.2s：开始关
  run(doors, eyeAt(L, side, 3.0), 0.9);
  assert.equal(L.target, -side, '2.9 秒还开着');
  run(doors, eyeAt(L, side, 3.0), 0.2);
  assert.equal(L.target, 0, '超过 3 秒开始关');
  assert.ok(L.s !== 0, '关要一点时间');
  run(doors, eyeAt(L, side, 3.0), 0.5);
  assert.equal(L.s, 0);
  assert.ok(near(L.pivot.rotation.y, L.closedAngle));
  // 从另一边走近：开向另一边
  run(doors, eyeAt(L, -side, 1.2), 0.6);
  assert.equal(L.s, side, '从另一边来 → 开向另一边');
  doors.dispose();
});

await test('前面 2m 的路要穿过门 → 先开（开向离人远的那一边）；穿过的地方在 2m 以外 / 不穿过 → 不开', () => {
  const { nd, floors } = sceneFor('condo3');
  for (const axis of ['x', 'z']) {
    const doors = createDoors(doorEngine(floors), nd);
    const L = interiorDoor(doors, axis);
    const mid = (L.a + L.b) / 2;
    const eye = eyeAt(L, 1, 1.9);
    const other = eyeAt(L, -1, 0.5);
    // 不穿过（顺着墙走）
    const along = eyeAt(L, 1, 1.9, mid + 1.5);
    assert.equal(pathCrosses(L, eye, [along]), false);
    run(doors, eye, 0.5, [along]);
    assert.equal(L.target, 0, '路不穿过门 → 不开');
    // 先顺着墙走 1.5m、再拐回来穿过：穿过的那一点在 2m 以外
    const late = [eyeAt(L, 1, 1.9, mid + 1.5), eyeAt(L, 1, 0.2, mid + 1.5), eyeAt(L, -1, 0.5, mid)];
    assert.equal(pathCrosses(L, eye, late), false, '2m 以内没穿过');
    // 直直穿过去：1.9m 就开，开向另一边
    assert.equal(pathCrosses(L, eye, [other]), true);
    run(doors, eye, 0.6, { pts: [other] });
    assert.equal(L.target, -1);
    assert.equal(L.s, -1);
    // 穿过墙线但在门洞旁边（实墙那一段）：不算
    const beside = [eyeAt(L, -1, 0.5, L.b + 0.6)];
    assert.equal(pathCrosses(L, eyeAt(L, 1, 0.5, L.b + 0.6), beside), false);
    doors.dispose();
  }
});

await test('别的楼层的门不开；openAll 全开、一直开着，放开以后照常关；open(instant) 一下子开好', () => {
  const { nd, floors } = sceneFor('terrace2');
  const doors = createDoors(doorEngine(floors), nd);
  const up = doors.leaves.find((L) => L.fi === 1);
  assert.ok(up, 'terrace2 楼上有门');
  const e1 = nd.floors[1].elev;
  assert.equal(levelOf(nd.floors, e1 + EYE), 1);
  assert.equal(levelOf(nd.floors, EYE), 0);
  assert.equal(levelOf(nd.floors, EYE + 1.5), 0, '楼梯走到一半还算楼下');
  // 同一个平面位置、在楼下：不开
  run(doors, eyeAt(up, 1, 0.8, undefined, 0), 1);
  assert.equal(up.target, 0, '人在楼下 → 楼上的门不开');
  run(doors, eyeAt(up, 1, 0.8, undefined, e1), 0.6);
  assert.equal(up.s, -1, '人在楼上 → 开');
  // openAll：远处也一直开着
  doors.openAll();
  const far = { x: -50, y: EYE, z: -50 };
  run(doors, far, 1);
  assert.ok(doors.leaves.every((L) => L.held && L.s !== 0 && Math.abs(L.target) === 1));
  run(doors, far, 10);
  assert.ok(
    doors.leaves.every((L) => Math.abs(L.s) === 1),
    'openAll：10 秒以后还都开着',
  );
  doors.openAll(false);
  run(doors, far, 4);
  assert.ok(
    doors.leaves.every((L) => L.s === 0),
    '放开以后满 3 秒关上',
  );
  // open(instant)：开某一个开口，开向离 from 远的那一边
  const L = doors.leaves.find((x) => x.fi === 0 && x.opening);
  const from = eyeAt(L, -1, 2);
  assert.equal(doors.open(L.opening, { fi: 0, from, instant: true }), true);
  assert.equal(L.s, 1);
  assert.ok(near(L.pivot.rotation.y, leafAngle(L, 1)));
  assert.equal(doors.open('no-such-door'), false);
  doors.dispose();
});

await test('落地趟门：人在这一层、1.2m 以内 → 那一套墙的玻璃藏起来，走开放回去；dispose 全部放回去、不释放缓存的几何体', () => {
  const { nd, floors } = sceneFor('terrace');
  const engine = doorEngine(floors);
  const F = floors[0];
  const mergedBefore = F.group.children[0].children.filter((o) => o.userData.doorLeaves);
  assert.ok(mergedBefore.length >= 1);
  const pivotsBefore = F.group.children.length;
  const doors = createDoors(engine, nd);
  assert.ok(
    mergedBefore.every((o) => o.visible === false),
    '合并的门扇藏起来',
  );
  assert.equal(F.group.children.length, pivotsBefore + doors.leaves.filter((L) => L.fi === 0).length, '门扇挂在楼层组里');
  assert.ok(engine.picks >= 1, '点得到的东西重新收一遍');
  const door = frontDoor(nd);
  assert.equal(door.kind, 'slider');
  const set = F.wallSets.find((s) => s.wall === door.wall);
  const glass = set.full.children.find((m) => m.isMesh && m.material === lib.fixed.glass);
  assert.ok(glass?.visible, '趟门的玻璃一开始看得见');
  const P = (d) => (door.axis === 'x' ? { x: door.cross, y: EYE, z: door.c - door.inward * d } : { x: door.c - door.inward * d, y: EYE, z: door.cross });
  assert.equal(doors.update(P(2), null, 0.1), false);
  assert.equal(glass.visible, true, '2m：玻璃还在');
  assert.equal(doors.update(P(1.0), null, 0.1), true, '玻璃藏起来 → changed');
  assert.equal(glass.visible, false, '1.0m：玻璃藏起来');
  doors.update(P(1.5), null, 0.1);
  assert.equal(glass.visible, true, '1.5m：放回去');
  doors.update(P(-0.8), null, 0.1);
  assert.equal(glass.visible, false, '屋里那一边 0.8m：也藏');
  doors.update(P(0.5), null, 0.1);
  assert.equal(glass.visible, false);
  // dispose：缓存的几何体一个都不释放
  const disposed = [];
  const orig = THREE.BufferGeometry.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function () {
    disposed.push(this);
    return orig.call(this);
  };
  const picks = engine.picks;
  try {
    doors.dispose();
    doors.dispose();
  } finally {
    THREE.BufferGeometry.prototype.dispose = orig;
  }
  assert.deepEqual(
    disposed.filter((g) => g.userData?.cached),
    [],
    '缓存的几何体不能释放',
  );
  assert.equal(glass.visible, true, '玻璃放回去');
  assert.ok(
    mergedBefore.every((o) => o.visible === true),
    '合并的门扇放回去',
  );
  assert.equal(F.group.children.length, pivotsBefore, '门扇拿掉了');
  assert.equal(engine.picks, picks + 1, 'dispose 只做一次');
  assert.equal(doors.update(P(0.5), null, 0.1), false, 'dispose 以后 update 什么都不做');
  assert.equal(glass.visible, true);
});

await test('落地趟门的玻璃只看人在的那一层（terrace2 楼下客厅、楼上主卧的趟门叠在一起）', () => {
  const { nd, floors } = sceneFor('terrace2');
  const doors = createDoors(doorEngine(floors), nd);
  const glassOf = (fi) => {
    const w = nd.floors[fi].walls.find((x) => x.pieces.some((p) => p.kind === 'slider'));
    const set = floors[fi].wallSets.find((s) => s.wall === w);
    return { w, mesh: set.full.children.find((m) => m.isMesh && m.material === lib.fixed.glass) };
  };
  const g0 = glassOf(0);
  const g1 = glassOf(1);
  assert.ok(g0.mesh && g1.mesh && g0.mesh !== g1.mesh);
  const p = g1.w.pieces.find((x) => x.kind === 'slider');
  const at = (y) => ({ x: (p.a + p.b) / 2, y, z: g1.w.c - 0.6 });
  doors.update(at(EYE), null, 0.1);
  assert.deepEqual([g0.mesh.visible, g1.mesh.visible], [false, true], '人在楼下：只藏楼下的');
  doors.update(at(nd.floors[1].elev + EYE), null, 0.1);
  assert.deepEqual([g0.mesh.visible, g1.mesh.visible], [true, false], '人在楼上：只藏楼上的');
  doors.dispose();
  assert.deepEqual([g0.mesh.visible, g1.mesh.visible], [true, true]);
});

await test('小工具：sideOf / doorDist', () => {
  const d = { axis: 'x', c: 2, a: 1, b: 2 };
  assert.equal(sideOf(d, { x: 0, z: 3 }), 1);
  assert.equal(sideOf(d, { x: 0, z: 1 }), -1);
  assert.equal(sideOf(d, { x: 0, z: 2 }), 0);
  assert.ok(near(doorDist(d, { x: 1.5, z: 3 }), 1));
  assert.ok(near(doorDist(d, { x: 3, z: 2 }), 1));
  assert.ok(near(doorDist({ axis: 'z', c: 0, a: 0, b: 1 }, { x: 3, z: 5 }), 5));
});

// ───────────────────────── 门扇开向哪一边：不挡路（unit doors · review core-door-leaf-in-path） ─────────────────────────
// 开好的门扇不在导航里（门洞整个算走得过去、pull 会斜着拉直穿过门扇扫的那一块），所以开向哪一边要看路：
// 门扇（伸出墙面的那一截）离眼睛 / 这一层接下来的路 ≥ 0.3m、转过去的时候不扫到人；两边都行 → 路走过去的那一边（不穿过 → 离人远的那一边）。
// 下面像 controller.js 那样一帧一帧沿路走（起步加速、快到了减速、楼梯慢一点、楼梯走过一半高度换楼层、只给这一层这一段走路的点），
// 每帧 doors.update(眼睛, 接下来的点, dt)，量眼睛离门扇（按门扇这一帧真的角度 —— 从 pivot.rotation.y 读）多远。

const DX = await import('../src/studio/walk/doors.js'); // 量距离的小工具（门扇的线段、线段之间的距离……）
const WALK = { SPEED: 1.3, ACCEL: 2.6, STAIR_K: 0.75 }; // 和 controller.js 的 SPEED / ACCEL / STAIR_K 一样
const LEAF_CLEAR = 0.25; // 走路的时候眼睛离门扇至少这么远（导航半径 0.22 + 一点）
const OPEN_OK = 0.3; // 静态：开好的门扇（某一边）离整段路这么远 = 这条路「有一边让得开」

const walkScenes = new Map();
/** sceneFor(id) 的楼层 / navData + 带家具的导航 + 大门（entryPlan） */
function walkScene(id) {
  if (!walkScenes.has(id)) {
    const plan = M.templatePlan(id);
    const { nd, floors } = sceneFor(id);
    const nav = N.buildNav(nd, furnish(plan, M.buildAllWalls(plan)));
    walkScenes.set(id, { id, plan, nd, floors, nav, ep: entryPlan(nd, nav) });
  }
  return walkScenes.get(id);
}

/** 门扇这一帧真的角度（带符号的弧度，+ = 开向 pos 那边）：从 pivot.rotation.y 反算（leafAngle 的逆；b 端的门轴反过来转） */
const leafPhi = (L) => (L.pivot.rotation.y - L.closedAngle) * (L.axis === 'x' ? -1 : 1) * (L.dir || 1);
/** 门扇伸出墙面的那一截（门洞里贴着门框的那一截和门框齐平，导航本来就离门框一个半径） */
const leafOut = (L, phi = leafPhi(L)) => DX.leafSeg(L, phi, Math.min(L.width - 0.02, L.wall.t / 2), L.width - 0.02);
const distTo = (p, g) => DX.segDist(p.x, p.z, g[0], g[1], g[2], g[3]);

/** 一条路（N.path 的结果）在 fi 层走路的那几段（第一段从 from 开始）离 g 多远 */
function pathDist(p, fi, g, from = null) {
  let m = Infinity;
  p.legs.forEach((l, li) => {
    if (l.kind !== 'walk' || l.fi !== fi) return;
    const pts = li === 0 && from ? [from, ...l.pts] : l.pts;
    if (pts.length === 1) m = Math.min(m, distTo(pts[0], g));
    for (let i = 1; i < pts.length; i++) m = Math.min(m, DX.segSeg(pts[i - 1], pts[i], g[0], g[1], g[2], g[3]));
  });
  return m;
}
/** 这扇门开好（90°，side 那一边）的门扇离这条路多远；四个里（门轴 a 端 / b 端 × 两边）让得多的那一个 */
const sideRoom = (L, p, from, side) => pathDist(p, L.fi, leafOut(L, (side * Math.PI) / 2), from);
const otherHinge = (L) => DX.hingeTo({ ...L, hinge: { ...L.hinge } }, -(L.dir || 1));
const bestRoom = (L, p, from) => Math.max(...[L, otherHinge(L)].flatMap((H) => [sideRoom(H, p, from, 1), sideRoom(H, p, from, -1)]));

/** 门轴换到 dir 那一头（和 createDoors 里一样：pivot 挪过去、门扇和把手镜像）—— 测试把门恢复到某个样子用 */
function setHinge(L, dir) {
  if ((L.dir || 1) === dir) return;
  DX.hingeTo(L, dir);
  for (const m of L.pivot.children) m.position.x = -m.position.x;
  L.pivot.position.x = L.hinge.x;
  L.pivot.position.z = L.hinge.z;
}
const smooth = (x) => x * x * (3 - 2 * x);

/**
 * 像 controller.js（start / advance / nextLeg / frame）那样从 P 走到 to：每帧 doors.update(眼睛, 这一层这一段接下来的点, dt)、onFrame(眼睛)；
 * 到了再站 1 秒（门扇可能还在转）。P 会被改成走到的地方。→ 路（N.path 的结果）| null
 */
function walkLeg(S, doors, P, to, onFrame, dt = 1 / 60) {
  const p = N.path(S.nav, { fi: P.fi, x: P.x, z: P.z }, to);
  if (!p) return null;
  const legs = p.legs.map((l) => ({ ...l, switched: false }));
  const elev = (fi) => S.nd.floors[fi].elev;
  const first = legs[0].pts[0];
  const total = p.length + Math.hypot(first.x - P.x, first.z - P.z);
  const R = { li: 0, pi: 0, v: 0, walked: 0, arrived: false };
  const nextLeg = () => {
    const leg = legs[R.li];
    if (leg.kind === 'stair' && !leg.switched) {
      leg.switched = true;
      P.fi = leg.to;
    }
    if (R.li + 1 >= legs.length) {
      R.arrived = true;
      return;
    }
    R.li++;
    R.pi = 1;
    const nl = legs[R.li];
    if (nl.kind === 'walk') {
      P.fi = nl.fi;
      P.y = elev(nl.fi) + EYE;
    }
  };
  const ahead = [];
  const frame = () => {
    const eye = { x: P.x, y: P.y, z: P.z };
    doors.update(eye, ahead, dt);
    onFrame?.(eye);
  };
  for (let f = 0; f < 120 / dt && !R.arrived; f++) {
    const left = Math.max(0, total - R.walked);
    R.v = Math.min(WALK.SPEED, R.v + WALK.ACCEL * dt, Math.sqrt(2 * WALK.ACCEL * left) + 0.05);
    let dist = R.v * dt * (legs[R.li].kind === 'stair' ? WALK.STAIR_K : 1);
    while (dist > 1e-9 && !R.arrived) {
      const leg = legs[R.li];
      const q = leg.pts[R.pi];
      if (!q) {
        nextLeg();
        continue;
      }
      const stair = leg.kind === 'stair';
      const ty = stair ? elev(leg.from) + q.y + EYE : P.y;
      const d = Math.hypot(q.x - P.x, q.z - P.z, ty - P.y);
      if (d <= dist) {
        [P.x, P.z, P.y] = [q.x, q.z, ty];
        dist -= d;
        R.walked += d;
        R.pi++;
      } else {
        const k = dist / d;
        P.x += (q.x - P.x) * k;
        P.z += (q.z - P.z) * k;
        P.y += (ty - P.y) * k;
        R.walked += dist;
        dist = 0;
      }
      if (stair && !leg.switched && Math.abs(P.y - EYE - elev(leg.from)) >= Math.abs(leg.pts[leg.pts.length - 1].y) / 2 - 1e-9) {
        leg.switched = true;
        P.fi = leg.to;
      }
      if (R.pi >= leg.pts.length) nextLeg();
    }
    ahead.length = 0;
    const leg = legs[R.li];
    if (!R.arrived && leg.kind === 'walk' && leg.fi === P.fi) for (let i = R.pi; i < leg.pts.length; i++) ahead.push(leg.pts[i]);
    frame();
  }
  ahead.length = 0;
  for (let k = 0; k < 1 / dt; k++) frame();
  return p;
}

/** 每一扇门：这一段路上眼睛离（开着 / 在动的）门扇最近多远、开到过多大 */
function leafWatch(doors, nd) {
  const near = new Map();
  const open = new Map();
  return {
    near,
    open,
    onFrame(eye) {
      const fi = levelOf(nd.floors, eye.y);
      for (const L of doors.leaves) {
        if (L.fi !== fi || !L.s) continue;
        near.set(L.id, Math.min(near.get(L.id) ?? Infinity, distTo(eye, leafOut(L))));
        if (Math.abs(L.s) > Math.abs(open.get(L.id) ?? 0)) open.set(L.id, L.s);
      }
    },
  };
}

/** 从大门进来（像 flight：开好大门 —— 往外开，不扫进门那一块 —— 站在 P3）的新一套门 + 人 */
function enter(S) {
  const doors = createDoors(doorEngine(S.floors), S.nd);
  if (S.ep.door) doors.open(S.ep.door.id, { fi: S.ep.door.fi, from: S.ep.P3, instant: true });
  const P = { fi: 0, x: S.ep.P3.x, y: S.nd.floors[0].elev + EYE, z: S.ep.P3.z };
  doors.update(P, null, 0);
  return { doors, P };
}

/** 一个房间要去的点（和 tour / 小地图一样：房间正中，挪到最近走得到的地方） */
function roomGoal(S, fi, id) {
  const r = S.nd.floors[fi].rooms.find((x) => x.id === id);
  return N.nearest(S.nav, { fi, x: r.x + r.w / 2, z: r.y + r.d / 2 });
}

await test('门扇不挡路（review 的例子）：semid2 从大门走到楼上 f-bd3 / f-bd2 / f-cbth，门 1/w11/1、1/w14/1 开好的门扇不压在路上，一路离眼睛 ≥ 0.25m', () => {
  const S = walkScene('semid2');
  const cases = [
    ['f-bd3', '1/w11/1'],
    ['f-bd2', '1/w14/1'],
    ['f-cbth', '1/w11/1'],
  ];
  for (const [room, id] of cases) {
    const { doors, P } = enter(S);
    const w = leafWatch(doors, S.nd);
    const from = { x: P.x, z: P.z };
    const p = walkLeg(S, doors, P, roomGoal(S, 1, room), w.onFrame);
    assert.ok(p, `走得到 ${room}`);
    const L = doors.leaves.find((x) => x.id === id);
    if (room !== 'f-cbth') {
      assert.ok(DX.pathCrosses(L, { x: 3.9, z: 4.58 }, p.legs[p.legs.length - 1].pts, 99), `去 ${room} 的路要穿过门 ${id}`);
      assert.equal(Math.abs(w.open.get(id) ?? 0), 1, `${room}：门 ${id} 开好了`);
    }
    // 开好的那一边（走完以后门还开着）：门扇离整段楼上的路 ≥ 0.3m（原来开向路走过去的那一边，压在 (2.97, 2.63) / (6.37, 2.63)）
    if (L.s) assert.ok(sideRoom(L, p, from, Math.sign(L.s)) >= OPEN_OK, `${room}：门 ${id} 开向 ${Math.sign(L.s)}，门扇离路只有 ${sideRoom(L, p, from, Math.sign(L.s)).toFixed(3)}m`);
    for (const [d, m] of w.near) assert.ok(m >= LEAF_CLEAR, `${room}：走的时候眼睛离门 ${d} 的门扇只有 ${m.toFixed(3)}m`);
    doors.dispose();
  }
});

await test('门扇不挡路（review 的例子）：condo3 从大门走到每一个卧室 / 书房 / 走廊 / 卫生间，卫生间门 0/w26/1 不开到走廊里挡路', () => {
  const S = walkScene('condo3');
  for (const room of ['bd2', 'std', 'mst', 'cor', 'bth']) {
    const { doors, P } = enter(S);
    const w = leafWatch(doors, S.nd);
    const from = { x: P.x, z: P.z };
    const p = walkLeg(S, doors, P, roomGoal(S, 0, room), w.onFrame);
    const L = doors.leaves.find((x) => x.id === '0/w26/1');
    assert.ok(w.open.has(L.id), `${room}：路过卫生间门，门开了`);
    // 走廊那一边的门扇（x = 6.86、z 3.42–4.14）会压在沿走廊走的路上：一定开向卫生间那一边
    assert.ok(sideRoom(L, p, from, -1) < LEAF_CLEAR, `${room}：这条路本来就会穿过走廊那一边的门扇（例子没变）`);
    assert.equal(Math.sign(w.open.get(L.id)), 1, `${room}：卫生间门开向卫生间（+），不是走廊`);
    for (const [d, m] of w.near) assert.ok(m >= LEAF_CLEAR, `${room}：走的时候眼睛离门 ${d} 的门扇只有 ${m.toFixed(3)}m`);
    doors.dispose();
  }
});

await test('门扇不挡路（扫一遍）：condo3 / semid2 / terrace2 从大门走到每个房间、再从那里走到每个别的房间 —— 只要开好的门扇有一边让得开整段路，眼睛离门扇就一直 ≥ 0.25m', () => {
  const dt = 1 / 30;
  const report = [];
  for (const id of ['condo3', 'semid2', 'terrace2']) {
    const S = walkScene(id);
    const rooms = [];
    S.nd.floors.forEach((f, fi) => {
      for (const r of f.rooms) {
        if (!indoor(r) || r.stairId || M.ROOM_TYPES[r.type]?.stair || M.ROOM_TYPES[r.type]?.void) continue;
        const q = roomGoal(S, fi, r.id);
        if (q) rooms.push({ fi, id: r.id, q });
      }
    });
    let legs = 0;
    let checked = 0;
    const rehung = [];
    const bad = [];
    const blocked = [];
    const stuck = [];
    /**
     * 这一段路上每一扇碰到的门：有一种开法让得开（门轴 a 端 / b 端 × 两边）→ 一定要 ≥ LEAF_CLEAR。不算的两种（记下来）：
     *  · 怎么开都让不开（户型本身：门扇 90° 怎么开都碰路）；
     *  · 出发的时候门已经开在挡路的那一边、人就站在它转过去会扫到的地方（门轴 len + 0.25m 以内）—— 换边会扫到人，不换就只能擦过去。
     * 出发的时候门开着、现在的门轴两边都让不开（要关上换门轴再开）的，另外数一下（rehung）。
     */
    const judge = (tag, p, from, w, doors, start) => {
      legs++;
      for (const [d, m] of w.near) {
        const L = doors.leaves.find((x) => x.id === d);
        const s0 = start.get(d);
        // 出发时的门轴
        const H0 = (L.dir || 1) === s0.dir ? L : otherHinge(L);
        const best = bestRoom(L, p, from);
        if (s0.s && Math.max(sideRoom(H0, p, from, 1), sideRoom(H0, p, from, -1)) < OPEN_OK && best >= OPEN_OK) rehung.push(`${tag} ${d} ${m.toFixed(2)}`);
        const len = L.width - 0.02;
        const pinned = s0.s && sideRoom(H0, p, from, Math.sign(s0.s)) < OPEN_OK && Math.hypot(from.x - H0.hinge.x, from.z - H0.hinge.z) < len + LEAF_CLEAR;
        if (best >= OPEN_OK && !pinned) {
          checked++;
          if (m < LEAF_CLEAR) bad.push(`${tag} 门 ${d}：离眼睛 ${m.toFixed(3)}m（开好的门扇有一边离路 ${best.toFixed(2)}m）`);
        } else if (m < LEAF_CLEAR) (best < OPEN_OK ? blocked : stuck).push(`${tag} ${d} ${m.toFixed(2)}/${best.toFixed(2)}`);
      }
    };
    const states = (doors) => new Map(doors.leaves.map((L) => [L.id, { s: L.s, dir: L.dir }]));
    for (const A of rooms) {
      const { doors, P } = enter(S);
      let w = leafWatch(doors, S.nd);
      let from = { x: P.x, z: P.z };
      let start = states(doors);
      const pa = walkLeg(S, doors, P, A.q, w.onFrame, dt);
      if (!pa) continue;
      judge(`${id} 大门→${A.id}`, pa, from, w, doors, start);
      // 到了 A：记下门的样子，每一个 B 都从这里出发
      const at = { ...P };
      const snap = doors.leaves.map((L) => [L.s, L.target, L.far, L.held, L.dir, L.rehang]);
      for (const B of rooms) {
        if (B === A) continue;
        doors.leaves.forEach((L, i) => {
          [L.s, L.target, L.far, L.held, , L.rehang] = snap[i];
          setHinge(L, snap[i][4]);
          L.pivot.rotation.y = leafAngle(L, Math.sign(L.s) * smooth(Math.abs(L.s)));
        });
        Object.assign(P, at);
        doors.update(P, null, 0);
        w = leafWatch(doors, S.nd);
        from = { x: P.x, z: P.z };
        start = states(doors);
        const pb = walkLeg(S, doors, P, B.q, w.onFrame, dt);
        if (pb) judge(`${id} ${A.id}→${B.id}`, pb, from, w, doors, start);
      }
      doors.dispose();
    }
    assert.deepEqual(bad.slice(0, 8), [], `${id}：${bad.length} 段路穿过 / 擦过了让得开的门扇`);
    assert.ok(legs > rooms.length * (rooms.length - 1) * 0.9 && checked > legs / 2, `${id}：只走了 ${legs} 段路、量了 ${checked} 扇门`);
    const eg = (a) => (a.length ? `（${a.slice(0, 2).join('，')}${a.length > 2 ? '…' : ''}）` : '');
    report.push(`${id} ${legs} 段路、${checked} 次门扇让得开（全部 ≥ ${LEAF_CLEAR}m）、${blocked.length} 次户型本身两边都让不开${eg(blocked)}、${stuck.length} 次门已经开在挡路那边换不了${eg(stuck)}、${rehung.length} 次开着的门要换门轴才让得开${eg(rehung)}`);
  }
  for (const r of report) console.log(`    ${r}`);
});

/** 眼睛 + 路 → leafRoom 用的 (route, n, v0 = 0) */
function routeOf(eye, pts) {
  const r = [];
  return [r, DX.clipPath(eye, pts, Infinity, r), 0];
}

await test('开着的门：客人改了路（新的路要撞上门扇）、人离得远 → 换到另一边；人站在门扇转过去会扫到的地方 → 不换', () => {
  const S = walkScene('condo3');
  const doors = createDoors(doorEngine(S.floors), S.nd);
  const L = doors.leaves.find((x) => x.id === '0/w26/1'); // 卫生间门：墙 z = 4.2，轴 (6.86, 4.2)，pos = 卫生间
  // 门开向走廊（−）
  const corridor = (x) => ({ x, y: EYE, z: 3.75 });
  doors.open(L.opening, { fi: 0, from: { x: 7.3, z: 5.4 }, instant: true });
  assert.equal(L.s, -1);
  // 人在走廊东头（离门 2m 多），要沿走廊往西走：路穿过走廊里的门扇 → 换到卫生间那一边
  const east = corridor(9.3);
  const west = [{ x: 5.2, z: 3.8 }, { x: 3.7, z: 5.0 }];
  assert.ok(DX.leafRoom(L, -1, ...routeOf(east, west)) < 0.3, '走廊那一边挡路');
  run(doors, east, 0.1, west);
  assert.equal(L.target, 1, '换到卫生间那一边');
  run(doors, east, 1.0, west);
  assert.equal(L.s, 1);
  // 再开回走廊（−）；人站在走廊里、就在门扇转回去会扫到的地方（离门轴 0.6m）→ 不换（宁可从门扇旁边挤过去）
  L.s = -1;
  L.target = -1;
  L.pivot.rotation.y = leafAngle(L, -1);
  const inSweep = { x: 7.3, y: EYE, z: 3.75 };
  run(doors, inSweep, 0.2, west);
  assert.equal(L.target, -1, '人在扫得到的地方：不换');
  doors.dispose();
});

await test('开门挑边：两边都让得开 → 路走过去的那一边（门扇进那一个房间，走回来也不挡）；路不穿过 → 离人远的那一边；没有路 → 离人远的那一边', () => {
  const S = walkScene('condo3');
  for (const axis of ['x', 'z']) {
    for (const side of [1, -1]) {
      const doors = createDoors(doorEngine(S.floors), S.nd);
      const L = interiorDoor(doors, axis);
      const mid = (L.a + L.b) / 2;
      // 正对着门、穿过去：开向路走过去的那一边（= 离人远的那一边）
      run(doors, eyeAt(L, side, 1.9), 0.6, [eyeAt(L, -side, 1.2)]);
      assert.equal(L.s, -side, `${axis}/${side}：开向路走过去的那一边`);
      doors.dispose();
      // 人在门旁边（1.2m）、路顺着墙走不穿过：离人远的那一边
      const d2 = createDoors(doorEngine(S.floors), S.nd);
      const L2 = interiorDoor(d2, axis);
      run(d2, eyeAt(L2, side, 1.2, mid), 0.6, [eyeAt(L2, side, 1.2, mid + 2)]);
      assert.equal(L2.s, -side, `${axis}/${side}：不穿过 → 离人远的那一边`);
      d2.dispose();
    }
  }
});

await test('楼梯上（眼睛在上下、没有路）先不开门，下了楼梯有了路再挑边：不会先开一边再换边；一下子换到别的楼层不算走楼梯', () => {
  const S = walkScene('semid2');
  const doors = createDoors(doorEngine(S.floors), S.nd);
  const L = doors.leaves.find((x) => x.id === '1/w11/1'); // 楼梯口旁边的 f-bd3 门（轴 (3.6, 2.61)）
  const e1 = S.nd.floors[1].elev;
  // 走楼梯后半段：眼睛往上走（~0.6m/s；过了楼上地面 + 0.5m 才算楼上）、离门 1.1m（1.6m 以内），没有路（控制器在楼梯那一段不给路）
  for (let y = e1 + 0.2; y <= e1 + EYE + 1e-9; y += 0.01) doors.update({ x: 3.9, y, z: 4.58 }, [], 1 / 60);
  for (let k = 0; k < 10; k++) doors.update({ x: 3.6 + k * 0.03, y: e1 + EYE, z: 4.58 }, [], 1 / 60);
  assert.equal(L.target, 0, '楼梯上 / 刚走完楼梯：先不开');
  // 下了楼梯、有了去 f-bd3 的路：门开向走廊那一边（f-bd3 那一边的门扇压在路上），一次开好、不换边
  const pts = [{ x: 4.05, z: 3.25 }, { x: 3.05, z: 2.75 }, { x: 2.65, z: 2.15 }, { x: 2.55, z: 1.95 }];
  const eye = { x: 3.9, y: e1 + EYE, z: 4.56 };
  doors.update(eye, pts, 1 / 60);
  assert.equal(L.target, 1, '有了路：开向走廊（+）');
  assert.ok(DX.leafRoom(L, -1, ...routeOf(eye, pts)) < 0.05, 'f-bd3 那一边（−）的门扇压在路上');
  // 一下子挪上楼（像 place 换楼层）：不算走楼梯，照常开
  const d2 = createDoors(doorEngine(S.floors), S.nd);
  const L2 = d2.leaves.find((x) => x.id === '1/w11/1');
  d2.update({ x: 4.5, y: EYE, z: 3.0 }, null, 0.1);
  run(d2, { x: 4.5, y: e1 + EYE, z: 3.0 }, 0.6);
  assert.equal(L2.s, -1, '挪上楼：照常开（离人远的那一边）');
  doors.dispose();
  d2.dispose();
});

await test('小工具：crossing（穿过门洞走到哪一边）/ segSeg / leafSeg 和真的门扇对得上 / sweptDist / reach / clearOf', () => {
  const d = { axis: 'x', c: 2, a: 1, b: 2, hinge: { x: 1.01, z: 2 }, width: 1, wall: { t: 0.12 } };
  assert.equal(DX.crossing(d, { x: 1.5, z: 3 }, [{ x: 1.5, z: 1 }], 9), -1);
  assert.equal(DX.crossing(d, { x: 1.5, z: 1 }, [{ x: 1.5, z: 3 }], 9), 1);
  assert.equal(DX.crossing(d, { x: 1.5, z: 1 }, [{ x: 1.5, z: 2 }], 9), 1, '停在墙线上：算走到另一边');
  assert.equal(DX.crossing(d, { x: 3.5, z: 1 }, [{ x: 3.5, z: 3 }], 9), 0, '墙上别的地方');
  assert.equal(DX.crossing(d, { x: 1.5, z: 3 }, [{ x: 1.5, z: 2.5 }, { x: 1.5, z: 1 }], 0.4), 0, '0.4m 以内没穿过');
  assert.equal(DX.pathCrosses(d, { x: 1.5, z: 3 }, [{ x: 1.5, z: 1 }]), true);
  assert.equal(DX.segSeg({ x: 0, z: 0 }, { x: 2, z: 2 }, 0, 2, 2, 0), 0, '相交');
  assert.ok(near(DX.segSeg({ x: 0, z: 0 }, { x: 1, z: 0 }, 0, 1, 1, 1), 1));
  assert.ok(near(DX.segSeg({ x: 0, z: 0 }, { x: 1, z: 0 }, 2, 0, 3, 0), 1));
  // leafSeg ↔ 真的门扇：开到 ±90°，门扇网格的包围盒中心 = leafSeg 的中点（两种朝向的墙）
  const { nd, floors } = sceneFor('condo3');
  const doors = createDoors(doorEngine(floors), nd);
  for (const axis of ['x', 'z'])
    for (const side of [1, -1]) {
      const L = interiorDoor(doors, axis);
      L.pivot.rotation.y = leafAngle(L, side);
      L.pivot.parent.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(L.pivot.children.find((m) => m.userData.slot === 'cabinetry'));
      const g = DX.leafSeg(L, (side * Math.PI) / 2);
      assert.ok(near((box.min.x + box.max.x) / 2, (g[0] + g[2]) / 2, 0.03) && near((box.min.z + box.max.z) / 2, (g[1] + g[3]) / 2, 0.03), `${axis}/${side}：leafSeg 和门扇对不上`);
      // clearOf：开着 → 门扇外面一点点离它很近；关上 → Infinity
      L.s = side;
      const mid = { x: (g[0] + g[2]) / 2, z: (g[1] + g[3]) / 2 };
      assert.ok(doors.clearOf(0, mid.x, mid.z) < 0, '门扇上：负数（在门板里）');
      assert.ok(near(doors.clearOf(0, mid.x + (axis === 'x' ? 0.3 : 0), mid.z + (axis === 'z' ? 0.3 : 0)), 0.28, 1e-6), '门扇旁边 0.3m：0.28（门板 2cm 厚）');
      assert.equal(doors.clearOf(1, mid.x, mid.z), Infinity, '别的楼层');
      L.s = 0;
      L.pivot.rotation.y = leafAngle(L, 0);
    }
  assert.ok(doors.leaves.every((L) => !L.s) && doors.clearOf(0, 5, 5) === Infinity, '都关着 → Infinity');
  doors.dispose();
  // sweptDist：扇环里 = 0；外面 = 到边的距离
  assert.equal(DX.sweptDist(d, 1.31, 2.3, 0, Math.PI / 2), 0, '扇环里面');
  assert.ok(near(DX.sweptDist(d, 1.01, 3.48, 0, Math.PI / 2), 0.5, 1e-6), '门扇长 0.98，外面 0.5');
  assert.ok(near(DX.sweptDist(d, 0.51, 2.5, 0, Math.PI / 2), 0.5, 1e-6), '门轴后面：到 90° 那一条边');
  // reach：起步加速到 1.3m/s
  assert.ok(near(DX.reach(0, 0.5), 0.325, 1e-9) && near(DX.reach(0, 1), 0.325 + 0.65, 1e-9) && near(DX.reach(1.3, 1), 1.3, 1e-9));
});

// ───────────────────────── 门轴放在哪一头（unit doors2）：a 端两边都让不开 → 换到 b 端；开着的门 → 关上换门轴再开 ─────────────────────────

/** 门扇网格（门板）的平面包围盒中心 */
function leafCentre(L) {
  L.pivot.parent.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(L.pivot.children.find((m) => m.userData.slot === 'cabinetry'));
  return { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2, box };
}
/** 门洞里贴着 a 端门框的一条路：从 side 那一边 v 米外直直穿到另一边 —— a 端的门扇开到哪一边都压在路上（离路 ~0.24m） */
function nearA(L, side, v) {
  const u = L.a + 0.25;
  const P = (vv) => (L.axis === 'x' ? { x: u, z: L.c + vv } : { x: L.c + vv, z: u });
  return { eye: { ...P(side * v), y: EYE }, pts: [P(-side * 1.2)] };
}

await test('门轴放在哪一头：路贴着 a 端穿过门洞（a 端的门扇两边都压在路上）→ 门轴换到 b 端（pivot 挪过去、门扇镜像）、开向路走过去的那一边，门扇离路 ≥ 0.3m；关着的样子两头一样；没有路 → 不换门轴', () => {
  const { nd, floors } = sceneFor('condo3');
  for (const axis of ['x', 'z'])
    for (const side of [1, -1]) {
      const doors = createDoors(doorEngine(floors), nd);
      const L = interiorDoor(doors, axis);
      assert.equal(L.dir, 1, '一开始门轴在 a 端（和鸟瞰一样）');
      const closedA = leafCentre(L).box.clone();
      const { eye, pts } = nearA(L, side, 1.2);
      const R = routeOf(eye, pts);
      assert.ok(DX.leafRoom(L, 1, ...R) < 0.3 && DX.leafRoom(L, -1, ...R) < 0.3, `${axis}/${side}：a 端两边都压在路上（例子没变）`);
      doors.update(eye, pts, 0.1);
      assert.equal(L.dir, -1, `${axis}/${side}：门轴换到 b 端`);
      assert.equal(L.target, -side, '开向路走过去的那一边');
      assert.ok(near(L.axis === 'x' ? L.pivot.position.x : L.pivot.position.z, L.b - 0.01) && near(L.axis === 'x' ? L.pivot.position.z : L.pivot.position.x, L.c), 'pivot 在 b 端');
      assert.ok(near(L.hinge.x, L.pivot.position.x) && near(L.hinge.z, L.pivot.position.z), 'hinge = pivot');
      // 换门轴的那一下门还关着：门板还在门洞里原来那一块（看不出来换了）
      assert.ok(Math.abs(L.s) < 0.25, '换的时候门几乎还关着');
      run(doors, eye, 0.6, pts);
      assert.equal(L.s, -side);
      // 真的门扇（网格）和 leafSeg（b 端）对得上，在门洞 b 端那一头、离路 ≥ 0.3m
      const c = leafCentre(L);
      const g = DX.leafSeg(L, (-side * Math.PI) / 2);
      assert.ok(near(c.x, (g[0] + g[2]) / 2, 0.03) && near(c.z, (g[1] + g[3]) / 2, 0.03), `${axis}/${side}：门扇网格和 leafSeg 对不上`);
      assert.ok(near(leafPhi(L), (-side * Math.PI) / 2, 1e-9), 'leafPhi（测试反算的角度）对');
      assert.ok(Math.abs((L.axis === 'x' ? c.x : c.z) - (L.b - 0.01)) < 0.03, '门扇贴着 b 端门框');
      assert.ok(DX.leafRoom(L, -side, ...routeOf(eye, pts)) >= 0.3, '门扇离路 ≥ 0.3m');
      // 走远、关上：关好的门板就在门洞里，和 a 端关着的时候一样
      run(doors, eyeAt(L, side, 3.5), 4);
      assert.equal(L.s, 0);
      assert.equal(L.dir, -1, '关上不换回来（不用换）');
      const closedB = leafCentre(L).box;
      assert.ok(closedB.min.distanceTo(closedA.min) < 1e-6 && closedB.max.distanceTo(closedA.max) < 1e-6, `${axis}/${side}：关着的门板两头一样`);
      // 没有路（摇杆）：离人远的那一边，门轴不换
      run(doors, eyeAt(L, -side, 1.0), 0.6);
      assert.equal(L.s, side);
      assert.equal(L.dir, -1);
      // dispose：拿掉的是我们的门扇，合并的门扇放回去
      doors.dispose();
      assert.equal(L.pivot.parent, null);
    }
});

await test('开着的门两边都让不开（新的路贴着 a 端穿过）：先关上、换到 b 端、再开 —— 一路不扫到人；人站在门扇关回去会扫到的地方 → 不换', () => {
  const { nd, floors } = sceneFor('condo3');
  for (const axis of ['x', 'z']) {
    const doors = createDoors(doorEngine(floors), nd);
    const L = interiorDoor(doors, axis);
    // 门开在 + 那一边（a 端），人在 + 那边 1.6m（不在门扇扫得到的地方），路贴着 a 端穿到 − 那边
    doors.open(L.opening, { fi: 0, from: eyeAt(L, -1, 1), instant: true });
    assert.ok(L.s === 1 && L.dir === 1);
    const { eye, pts } = nearA(L, 1, 1.6);
    const R = routeOf(eye, pts);
    assert.ok(DX.leafRoom(L, 1, ...R) < 0.3 && DX.leafRoom(L, -1, ...R) < 0.3, `${axis}：a 端两边都让不开`);
    const len = L.width - 0.02;
    const r0 = Math.min(len, L.wall.t / 2);
    let minEye = Infinity;
    let rehung = false;
    for (let t = 0; t < 1.5; t += 1 / 60) {
      doors.update(eye, pts, 1 / 60);
      rehung ||= L.rehang;
      const g = DX.leafSeg(L, leafPhi(L), r0, len);
      minEye = Math.min(minEye, distTo(eye, g));
    }
    assert.ok(rehung, `${axis}：关上换门轴（rehang）`);
    assert.equal(L.dir, -1, `${axis}：换到 b 端`);
    assert.equal(L.s, -1, `${axis}：再开到路走过去的那一边`);
    assert.ok(DX.leafRoom(L, -1, ...routeOf(eye, pts)) >= 0.3, '门扇离路 ≥ 0.3m');
    assert.ok(minEye > 0.5, `一路离人 ${minEye.toFixed(2)}m`);
    doors.dispose();
    // 人站在门扇关回去会扫到的地方（门扇和门洞之间）：不换，也不关
    const d2 = createDoors(doorEngine(floors), nd);
    const L2 = interiorDoor(d2, axis);
    d2.open(L2.opening, { fi: 0, from: eyeAt(L2, -1, 1), instant: true });
    const P = (u, v) => (L2.axis === 'x' ? { x: u, y: EYE, z: L2.c + v } : { x: L2.c + v, y: EYE, z: u });
    const inSweep = P(L2.a + 0.45, 0.45);
    const pts2 = [P(L2.a + 0.25, 0.3), P(L2.a + 0.25, -1.2)];
    run(d2, inSweep, 0.5, pts2);
    assert.ok(L2.target === 1 && L2.dir === 1 && !L2.rehang, `${axis}：人在扫得到的地方 → 不动`);
    d2.dispose();
  }
});

// ───────────────────────── （门扇开向哪一边：到这里） ─────────────────────────

// ───────────────────────── entryPlan ─────────────────────────

/** 一个单层方案转 90°（x ↔ y）/ 上下镜像：大门换到另外三个朝向 */
function transpose(plan) {
  const p = structuredClone(plan);
  for (const f of p.floors) {
    f.rooms = f.rooms.map((r) => ({ ...r, x: r.y, y: r.x, w: r.d, d: r.w }));
    f.openings = f.openings.map((o) => ({ ...o, x1: o.y1, y1: o.x1, x2: o.y2, y2: o.x2 }));
  }
  return p;
}
function flipY(plan) {
  const p = structuredClone(plan);
  const D = Math.max(...p.floors.flatMap((f) => f.rooms.map((r) => r.y + r.d)));
  for (const f of p.floors) {
    f.rooms = f.rooms.map((r) => ({ ...r, y: Math.round((D - r.y - r.d) * 1000) / 1000 }));
    f.openings = f.openings.map((o) => ({ ...o, y1: Math.round((D - o.y1) * 1000) / 1000, y2: Math.round((D - o.y2) * 1000) / 1000 }));
  }
  return p;
}

/** 每一个模板 + 单层模板转出来的三个朝向 */
const entryCases = [];
for (const id of TPL) {
  const plan = M.templatePlan(id);
  entryCases.push({ id, plan });
  if (plan.floors.length === 1 && !(plan.stairs || []).length)
    for (const [tag, fn] of [
      ['flip', flipY],
      ['turn', transpose],
      ['turn+flip', (p) => transpose(flipY(p))],
    ])
      entryCases.push({ id: `${id}/${tag}`, plan: fn(plan) });
}

const navs = new Map();
function navCase(c) {
  if (!navs.has(c.id)) {
    const nd = N.navDataOf(c.plan);
    navs.set(c.id, { nd, nav: N.buildNav(nd, furnish(c.plan, M.buildAllWalls(c.plan))) });
  }
  return navs.get(c.id);
}

const inRect = (r, x, z, m = 0) => x > r.x - m && x < r.x + r.w + m && z > r.y - m && z < r.y + r.d + m;

await test('entryPlan：每个模板（单层的再转三个朝向）P3 走得过去、P1 在屋子外面（或室外的房间里）、P1/P2/P3 在门洞的法线上、高度对', () => {
  const axes = new Set();
  for (const c of entryCases) {
    const { nd, nav } = navCase(c);
    const ep = entryPlan(nd, nav);
    assert.ok(!ep.fallback, `${c.id}：有大门`);
    const { door, P1, P2, P3, approach, out } = ep;
    axes.add(`${door.axis}${out.x + out.z > 0 ? '+' : '-'}`);
    const f0 = nd.floors[0];
    // P3：走得过去、在室内房间里
    assert.ok(N.passable(nav, { fi: 0, x: P3.x, z: P3.z }), `${c.id}：P3 (${P3.x}, ${P3.z}) 走不过去`);
    assert.ok(indoor(N.roomAt(nav, { fi: 0, x: P3.x, z: P3.z })), `${c.id}：P3 在室内`);
    // P1 / P2 / approach：不在任何室内房间里（车廊 / 阳台这种室外的可以）
    for (const [name, p] of [
      ['P1', P1],
      ['P2', P2],
      ['approach', approach],
    ]) {
      const hit = f0.rooms.find((r) => indoor(r) && inRect(r, p.x, p.z));
      assert.ok(!hit, `${c.id}：${name} (${p.x}, ${p.z}) 在室内房间 ${hit?.id} 里`);
    }
    // approach 在整栋楼外框外面（降下来的时候不会碰到车廊屋顶 / 楼上挑出去的部分）
    for (const f of nd.floors) for (const r of f.rooms) assert.ok(!inRect(r, approach.x, approach.z, 0.5), `${c.id}：approach 离 ${r.id} 太近`);
    // 高度：P1 2.2m、P2 / P3 眼睛高
    assert.ok(near(P1.y, f0.elev + 2.2) && near(P2.y, f0.elev + EYE) && near(P3.y, f0.elev + EYE));
    // 都在门洞的法线上，P1 / P2 在外面（离墙 3.2 / 1.2m）、P3 在里面
    const off = (p) => (door.axis === 'x' ? (p.z - door.c) * -door.inward : (p.x - door.c) * -door.inward);
    const along = (p) => (door.axis === 'x' ? p.x : p.z);
    assert.ok(near(off(P1), 3.2) && near(off(P2), 1.2) && off(P3) < -0.5, `${c.id}：P1/P2/P3 离墙 ${off(P1)} / ${off(P2)} / ${off(P3)}`);
    for (const p of [P1, P2, P3, approach]) assert.ok(near(along(p), door.cross), `${c.id}：不在门洞的法线上`);
    // out = 往门外；yaw = 朝屋里看
    assert.ok(near(out.x, door.axis === 'z' ? -door.inward : 0) && near(out.z, door.axis === 'x' ? -door.inward : 0));
    assert.ok(near(-Math.sin(ep.yaw), -out.x) && near(-Math.cos(ep.yaw), -out.z), `${c.id}：yaw 不是朝屋里`);
    // 外面那一边没有室内房间（车廊算外面），里面那一边有
    const outRoom = door.inward > 0 ? door.wall.neg : door.wall.pos;
    const inRoom = door.inward > 0 ? door.wall.pos : door.wall.neg;
    assert.ok(!indoor(outRoom) && indoor(inRoom), `${c.id}：门外是 ${outRoom?.type}，门里是 ${inRoom?.type}`);
    assert.ok(ep.high > Math.max(...nd.floors.map((f) => f.elev + f.ceil)), 'high 高过楼顶');
  }
  assert.deepEqual([...axes].sort(), ['x+', 'x-', 'z+', 'z-'], '四个朝向都测到了');
});

await test('entryPlan：从门洞穿过去的那一点离门框、趟门的竖框都够远（terrace 的 3m 趟门从中间那一扇的正中过）', () => {
  let slider = 0;
  for (const c of entryCases) {
    const { nd, nav } = navCase(c);
    const { door, P2, P3 } = entryPlan(nd, nav);
    // P2 → P3 和墙线的交点
    const [u2, v2, u3, v3] = door.axis === 'x' ? [P2.x, P2.z, P3.x, P3.z] : [P2.z, P2.x, P3.z, P3.x];
    const k = (door.c - v2) / (v3 - v2);
    assert.ok(k > 0 && k < 1, `${c.id}：P2→P3 要穿过墙线`);
    const u = u2 + (u3 - u2) * k;
    const p = door.piece;
    const R = nav.radius;
    assert.ok(u - p.a >= R + 0.05 && p.b - u >= R + 0.05, `${c.id}：穿过的地方 ${u} 离门框（${p.a}…${p.b}）不到 ${R + 0.05}`);
    if (p.kind === 'slider') {
      slider++;
      const len = p.b - p.a;
      const panes = Math.max(1, Math.round(len / 1.0));
      for (let i = 1; i < panes; i++) {
        const m = p.a + (len / panes) * i;
        assert.ok(Math.abs(u - m) >= R + 0.05, `${c.id}：离竖框 ${m} 只有 ${Math.abs(u - m)}`);
      }
      // 穿过的那一条线（每 2cm）都走得过去（离竖框 / 门框 ≥ 半径）
      for (let s = -0.6; s <= 0.6 + 1e-9; s += 0.02) {
        const q = door.axis === 'x' ? { fi: 0, x: u, z: door.c + s } : { fi: 0, x: door.c + s, z: u };
        assert.ok(N.clearance(nav, q) >= R - 1e-6, `${c.id}：门洞里 ${s} 处离障碍 ${N.clearance(nav, q)}`);
      }
    }
  }
  assert.ok(slider >= 4, 'terrace 的趟门（四个朝向）都测到了');
});

await test('entryPlan：没有大门 → 落到最大的客厅类房间正中（走得过去的点）', () => {
  for (const id of TPL) {
    const plan = structuredClone(M.templatePlan(id));
    const f0 = plan.floors[0];
    f0.openings = f0.openings.filter((o) => o.kind !== 'door' && o.kind !== 'slider');
    const nd = N.navDataOf(plan);
    const nav = N.buildNav(nd, furnish(plan, M.buildAllWalls(plan)));
    assert.equal(frontDoor(nd, nav), null, `${id}：拿掉门以后没有大门`);
    const ep = entryPlan(nd, nav);
    const fb = ep.fallback;
    assert.ok(fb, `${id}：fallback`);
    const living = nd.floors.flatMap((f, fi) => f.rooms.filter((r) => ['living', 'family', 'dining'].includes(r.type)).map((r) => ({ r, fi })));
    const big = living.sort((a, b) => b.r.w * b.r.d - a.r.w * a.r.d)[0];
    assert.equal(fb.room, big.r.id, `${id}：最大的客厅类房间`);
    assert.equal(fb.fi, big.fi);
    assert.ok(inRect(big.r, fb.x, fb.z), `${id}：在那个房间里`);
    assert.ok(N.passable(nav, { fi: fb.fi, x: fb.x, z: fb.z }), `${id}：走得过去`);
    assert.ok(near(fb.y, nd.floors[fb.fi].elev + EYE));
    assert.ok(Number.isFinite(fb.yaw));
  }
});

// ───────────────────────── walkFov ─────────────────────────

await test('walkFov：横屏 62°；竖屏 = max(62°, 水平 ~70° 的竖直视角)，最多 82°', () => {
  assert.equal(walkFov(1180, 820), WALK_FOV);
  assert.equal(walkFov(1440, 900), 62);
  assert.equal(walkFov(1000, 1000), 62, '正方形算横屏');
  assert.equal(walkFov(820, 1180), 82, 'iPad 竖着：顶到 82°');
  assert.equal(walkFov(412, 860), 82, '手机竖着：82°');
  assert.equal(walkFov(0, 0), 62);
  // 不顶格的竖屏：水平正好 70°
  const W = 900;
  const H = 1000;
  const v = walkFov(W, H);
  assert.ok(v > 62 && v < 82);
  const h = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(v / 2)) * (W / H));
  assert.ok(near(THREE.MathUtils.radToDeg(h), 70, 1e-9), `水平视角 ${THREE.MathUtils.radToDeg(h)}`);
  // 只是比正方形高一点点：竖屏 → 水平 ~70°（竖直视角比 62° 大）
  assert.ok(walkFov(1000, 1010) > 70 && walkFov(1000, 1010) < 71);
  // 越竖越宽，不会变窄
  let last = 0;
  for (let w = 1000; w >= 300; w -= 25) {
    const f = walkFov(w, 1000);
    assert.ok(f >= last - 1e-12);
    last = f;
  }
});

// ───────────────────────── 假的引擎（restoreOrbit / flyIn / flyOut） ─────────────────────────

/** 和 Engine 一样的接口（只记下调用、照着改状态）；floors 给 flyIn / flyOut 用（楼层组、标高、天花） */
function fakeEngine({ floors = [], W = 1180, H = 820 } = {}) {
  const log = [];
  const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 400);
  const e = {
    log,
    camera,
    controls: { target: new THREE.Vector3(), enabled: true, _sphericalDelta: new THREE.Spherical(0, 0, 0), _panOffset: new THREE.Vector3() },
    container: { clientWidth: W, clientHeight: H },
    insets: { left: 300, right: 0, top: 184, bottom: 160 },
    vo: { x: 150, y: 12 },
    voTo: { x: 150, y: 12 },
    floorView: floors.length > 1 ? floors[0].id : 'all',
    lastView: 'iso',
    framed: true,
    walk: null,
    onTick: null,
    lastCut: { x: 1 },
    dirty: false,
    floors,
    day: { exposure: 1.1 },
    renderer: { toneMappingExposure: 1.1, shadowMap: { needsUpdate: false } },
    applyViews: 0,
    fills: 0,
    isFramed() {
      return !this.walk && this.framed;
    },
    setCeilings(on) {
      log.push(`setCeilings:${on}`);
      this.ceilings = on;
    },
    setWalk(w) {
      log.push(w ? `setWalk:fov=${w.fov},vo=${w.vo.x},${w.vo.y},ev=${w.ev}` : 'setWalk:null');
      this.walk = w || null;
      if (this.day) this.renderer.toneMappingExposure = this.day.exposure * (w?.ev || 1);
    },
    setFloorView(v, o) {
      log.push(`setFloorView:${v}:${!!o?.instant}:${!!o?.quiet}`);
      this.floorView = v;
    },
    applyView() {
      this.applyViews++;
    },
    updateViewTarget(snap) {
      log.push(`updateViewTarget:${!!snap}`);
      this.voTo = { x: (this.insets.left - this.insets.right) / 2, y: (this.insets.top - this.insets.bottom) / 2 };
      if (snap) this.vo = { ...this.voTo };
    },
    frame(view, animate) {
      log.push(`frame:${view}:${animate}`);
    },
    highlightSlot(s) {
      log.push(`highlightSlot:${s}`);
    },
    placeFill() {
      this.fills++;
    },
  };
  // 鸟瞰的镜头：从斜上方看着目标点（OrbitControls 也是 lookAt 目标点）
  e.controls.target.set(4, 1.2, 6);
  camera.position.set(20, 14, 26);
  camera.lookAt(e.controls.target);
  return e;
}

/** 假的 rAF：每 16ms 调一次 onTick，跑 secs 秒（或直到 stop() 说停） */
function ticks(engine, secs, { t0 = 1000, step = 16, each } = {}) {
  let t = t0;
  for (; t <= t0 + secs * 1000; t += step) {
    if (!engine.onTick) break;
    engine.onTick(t);
    each?.(t);
  }
  return t;
}

await test('saveOrbit / restoreOrbit：镜头、目标点、主点偏移一点不差地放回去；按 §4 的顺序；惯性清零', () => {
  const e = fakeEngine({ floors: [{ id: 'gf' }, { id: 'ff' }] });
  e.floorView = 'ff';
  const saved = saveOrbit(e);
  const pos = e.camera.position.clone();
  const quat = e.camera.quaternion.clone();
  const target = e.controls.target.clone();
  assert.equal(saved.framed, true);
  assert.equal(saved.W, 1180);
  assert.equal(saved.insets, JSON.stringify(e.insets));
  // 走路的时候什么都变了
  e.walk = { fov: 62, vo: { x: 0, y: 0 } };
  e.camera.position.set(3, 1.55, 4);
  e.camera.quaternion.setFromEuler(new THREE.Euler(0.2, 1.1, 0, 'YXZ'));
  e.controls.target.set(3, 1.55, 1.5);
  e.controls._sphericalDelta.set(1, 0.2, 0.3);
  e.controls._panOffset.set(0.5, 0, 0.1);
  e.vo.x = 99; // 存的是拷贝
  e.vo = { x: 0, y: 0 };
  e.voTo = { x: 1, y: 2 };
  e.floorView = 'gf';
  e.onTick = () => true;
  e.lastCut = { x: 2 };
  const disposed = [];
  restoreOrbit(e, saved, { doors: { dispose: () => (disposed.push(1), e.log.push('doors.dispose')) } });
  assert.deepEqual(e.log, ['doors.dispose', 'setCeilings:false', 'setWalk:null', 'setFloorView:ff:true:true', 'highlightSlot:null']);
  assert.ok(e.camera.position.equals(pos) && e.camera.quaternion.equals(quat) && e.controls.target.equals(target), '镜头一点不差');
  assert.deepEqual(e.vo, { x: 150, y: 12 });
  assert.deepEqual(e.voTo, { x: 150, y: 12 });
  assert.ok(e.vo !== saved.vo, '放回去的是拷贝');
  assert.equal(e.controls._sphericalDelta.radius + e.controls._sphericalDelta.phi + e.controls._sphericalDelta.theta, 0, '旋转惯性清零');
  assert.ok(e.controls._panOffset.equals(new THREE.Vector3()), '平移惯性清零');
  assert.equal(e.walk, null);
  assert.equal(e.onTick, null);
  assert.equal(e.lastCut, null);
  assert.equal(e.dirty, true);
  assert.ok(e.applyViews >= 1, '主点套回相机');
  assert.ok(e.fills >= 1, '补光跟着镜头重新摆');
  // 没给 doors 也行
  restoreOrbit(e, saved);
  assert.ok(e.camera.position.equals(pos));
});

await test('restoreOrbit：画布尺寸 / 面板留白变了 → 重新算主点；原来是对好的就重新对一次，不是就不对', () => {
  for (const change of ['W', 'H', 'insets']) {
    for (const framed of [true, false]) {
      const e = fakeEngine();
      e.framed = framed;
      const saved = saveOrbit(e);
      if (change === 'W') e.container.clientWidth = 820;
      else if (change === 'H') e.container.clientHeight = 1180;
      else e.insets = { ...e.insets, left: 0 };
      e.walk = {};
      e.log.length = 0;
      restoreOrbit(e, saved);
      const tail = e.log.slice(2);
      assert.deepEqual(tail, ['setFloorView:all:true:true', 'updateViewTarget:true', ...(framed ? ['frame:iso:false'] : []), 'highlightSlot:null'], `${change} / framed=${framed}`);
      assert.deepEqual(e.vo, e.voTo, '主点直接到新的位置');
    }
  }
});

/** flyIn 用的假引擎：楼层组来自 sceneOf（hideAbove 要用）、onTick 由 ticks() 驱动 */
function flightCase(id, plan = M.templatePlan(id)) {
  const { nd, floors } = sceneOf(plan);
  const nav = N.buildNav(nd, furnish(plan, M.buildAllWalls(plan)));
  const engine = fakeEngine({ floors });
  const ep = entryPlan(nd, nav);
  return { nd, nav, engine, ep, floors };
}

/** 假的门：记下 open / update / dispose */
function fakeDoors(log) {
  return {
    opened: [],
    updates: 0,
    open(id, o) {
      this.opened.push({ id, ...o });
      log.push(`doors.open:${id}`);
      return true;
    },
    update() {
      this.updates++;
      return false;
    },
    dispose() {
      log.push('doors.dispose');
    },
  };
}

await test('flyIn：t0 进走路模式（视角 / 主点不变）→ 到 P1 开大门 → 跨过门槛才盖天花 → 正好停在 P3、朝屋里看，walkFov、主点归零', async () => {
  for (const id of TPL) {
    const { engine, ep, floors } = flightCase(id);
    const saved = saveOrbit(engine);
    const log = engine.log;
    const doors = fakeDoors(log);
    const walk = { fov: 0, vo: { x: 0, y: 0 }, ev: 1.25, pr: 1.5 };
    const prevTick = engine.onTick;
    const evAtStart = engine.renderer.toneMappingExposure;
    let ceilAt = null;
    let doorAt = null;
    let k0 = null;
    const p = flyIn(engine, ep, {
      walk,
      doors,
      reduced: false,
      ceilings: (on) => {
        log.push(`ceilings:${on}`);
        ceilAt = engine.camera.position.clone();
      },
    });
    assert.equal(log[0], 'setWalk:fov=28,vo=150,12,ev=1', `${id}：t0 视角 28°、主点不变、曝光不跳`);
    assert.equal(engine.renderer.toneMappingExposure, evAtStart);
    assert.equal(log[1], `setFloorView:${floors[0].id}:true:true`);
    assert.equal(engine.walk, walk);
    const each = (t) => {
      k0 ??= t;
      if (doorAt == null && doors.opened.length) doorAt = (t - k0) / 1000;
    };
    ticks(engine, 3.2, { each });
    assert.equal(await p, 'done');
    assert.equal(engine.onTick, prevTick, 'onTick 还回去');
    // 开门：一次、在飞到 P1 的时候（1.6 秒）
    assert.equal(doors.opened.length, 1);
    assert.equal(doors.opened[0].id, ep.door.id);
    // 开向离 P3 远的那一边（往外）：门扇不扫进门那一块（P3、带逛的第一站「门口」）
    assert.deepEqual(doors.opened[0].from, ep.P3);
    assert.ok(doorAt >= 1.6 - 0.02 && doorAt < 1.7, `${id}：开门在 ${doorAt}s`);
    assert.ok(doors.updates > 100, '每一帧都更新门');
    // 天花：一次，跨过门槛的时候（镜头在墙线里面）
    assert.equal(log.filter((x) => x.startsWith('ceilings')).length, 1);
    const inward = (q) => (ep.door.axis === 'x' ? (q.z - ep.door.c) * ep.door.inward : (q.x - ep.door.c) * ep.door.inward);
    assert.ok(inward(ceilAt) >= 0 && inward(ceilAt) < 0.3, `${id}：盖天花时镜头在门槛里 ${inward(ceilAt)}`);
    // 落点
    assert.ok(engine.camera.position.distanceTo(new THREE.Vector3(ep.P3.x, ep.P3.y, ep.P3.z)) < 1e-9, `${id}：停在 P3`);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(engine.camera.quaternion);
    assert.ok(near(fwd.x, -Math.sin(ep.yaw), 1e-9) && near(fwd.z, -Math.cos(ep.yaw), 1e-9) && near(fwd.y, 0, 1e-9), `${id}：朝屋里平着看`);
    assert.ok(engine.controls.target.distanceTo(engine.camera.position.clone().addScaledVector(fwd, 2.5)) < 1e-9, '目标点 = 眼睛前面 2.5m');
    assert.equal(walk.fov, walkFov(1180, 820));
    assert.deepEqual(walk.vo, { x: 0, y: 0 });
    assert.equal(walk.ev, 1.25, '曝光到控制器要的值');
    assert.ok(near(engine.renderer.toneMappingExposure, 1.1 * 1.25));
    assert.equal(walk.pr, 1.5, 'pr 不动');
    // 飞回去：一模一样
    log.length = 0;
    const q = flyOut(engine, saved, { doors, reduced: false });
    assert.equal(log[0], 'doors.dispose');
    assert.equal(log[1], 'setCeilings:false');
    ticks(engine, 2.7);
    assert.equal(await q, 'done');
    assert.ok(engine.camera.position.equals(saved.pos) && engine.camera.quaternion.equals(saved.quat) && engine.controls.target.equals(saved.target), `${id}：飞回来一模一样`);
    assert.deepEqual(engine.vo, saved.vo);
    assert.equal(engine.walk, null);
    assert.equal(engine.onTick, null);
    assert.ok(
      floors.every((F) => F.group.visible),
      '楼层都放回来',
    );
    assert.ok(log.includes('setWalk:null') && log.includes(`setFloorView:${saved.floorView}:true:true`));
  }
});

/** 屋子里「实心」的几块（平面矩形 + 高度范围）：每一层的室内房间（墙、楼板、天花）、楼上的阳台楼板、车廊屋顶 */
function solidsOf(plan, nd) {
  const out = [];
  nd.floors.forEach((f, fi) => {
    for (const r of f.rooms) {
      if (indoor(r)) out.push({ r, lo: f.elev - (fi ? 0.5 : 0), hi: f.elev + f.ceil + 0.2, what: `${f.id}/${r.id}` });
      else if (fi) out.push({ r, lo: f.elev - 0.5, hi: f.elev + 1.2, what: `${f.id}/${r.id}（楼板 + 栏杆）` });
    }
    if (fi) for (const q of M.porchRoofs(plan, f.id)) out.push({ r: q, lo: f.elev - 0.45, hi: f.elev + 0.1, what: `${f.id} 车廊屋顶` });
  });
  return out;
}

await test('flyIn 用真的门：大门往外开（离 P3 远的那一边），门扇不扫进门那一块（P3 → 带逛的第一站「门口」→ 屋里）；飞进来镜头离门扇 ≥ 0.4m', async () => {
  let hinged = 0;
  for (const id of TPL) {
    const { engine, ep, floors, nd, nav } = flightCase(id);
    if (!ep.door) continue;
    const doors = createDoors(doorEngine(floors), nd);
    const L = doors.leaves.find((x) => x.fi === ep.door.fi && x.opening === ep.door.id);
    const p = flyIn(engine, ep, { walk: { fov: 0, vo: { x: 0, y: 0 }, ev: 1, pr: 0 }, doors, reduced: false, ceilings: () => {} });
    let minCam = Infinity;
    const each = () => {
      const c = engine.camera.position;
      for (const D of doors.leaves) if (D.s && D.fi === levelOf(nd.floors, c.y)) minCam = Math.min(minCam, distTo(c, leafOut(D)));
    };
    ticks(engine, 3.2, { each });
    assert.equal(await p, 'done');
    if (!L) {
      doors.dispose();
      continue; // 趟门（terrace）：没有门扇
    }
    hinged++;
    assert.equal(L.s, -ep.door.inward, `${id}：大门往外开`);
    assert.ok(minCam >= 0.4, `${id}：飞进来镜头离门扇只有 ${minCam.toFixed(3)}m`);
    // 门扇整个在外面：离 P3、离门里 0.6m 那一点（带逛的第一站一带）、离从那里往屋里走的路都 ≥ 0.3m
    const g = leafOut(L);
    const inside = (d) => (ep.door.axis === 'x' ? { x: ep.door.cross, z: ep.door.c + ep.door.inward * d } : { x: ep.door.c + ep.door.inward * d, z: ep.door.cross });
    for (const q of [ep.P3, inside(0.6), inside(0.3), nav.start]) assert.ok(distTo(q, g) >= 0.3, `${id}：门扇离屋里 (${q.x.toFixed(2)}, ${q.z.toFixed(2)}) 只有 ${distTo(q, g).toFixed(3)}m`);
    doors.dispose();
  }
  assert.ok(hinged >= 3, `${hinged} 个模板的大门有门扇`);
});

await test('flyIn 的路线不穿屋子：飞到 P2 之前不碰任何实心的部分（室内房间、楼上的楼板、车廊屋顶）；从屋子后面低低地起飞也一样', async () => {
  for (const id of TPL) {
    for (const back of [false, true]) {
      const plan = M.templatePlan(id);
      const { engine, ep, nd } = flightCase(id, plan);
      const solids = solidsOf(plan, nd);
      if (back) {
        // 从门的另一边、低一点起飞：一定要从楼顶上面绕过去
        const all = nd.floors.flatMap((f) => f.rooms);
        const c = { x: (Math.min(...all.map((r) => r.x)) + Math.max(...all.map((r) => r.x + r.w))) / 2, z: (Math.min(...all.map((r) => r.y)) + Math.max(...all.map((r) => r.y + r.d))) / 2 };
        engine.controls.target.set(c.x, 1, c.z);
        engine.camera.position.set(c.x - ep.out.x * 18, 6, c.z - ep.out.z * 18);
        engine.camera.lookAt(engine.controls.target);
      }
      const p = flyIn(engine, ep, { walk: { ev: 1 }, reduced: false, ceilings() {} });
      let k = 0;
      let minY = Infinity;
      let lowOut = 0;
      ticks(engine, 3.2, {
        each: () => {
          k += 0.016;
          const q = engine.camera.position;
          minY = Math.min(minY, q.y);
          if (k >= 2.3) return; // 过了 P2：穿过门洞进屋（门洞本身就是墙上的洞）
          for (const s of solids) {
            const hit = inRect(s.r, q.x, q.z, 0.15) && q.y > s.lo && q.y < s.hi;
            assert.ok(!hit, `${id}${back ? '（背面起飞）' : ''}：${k.toFixed(2)}s 镜头 (${q.x.toFixed(2)}, ${q.y.toFixed(2)}, ${q.z.toFixed(2)}) 钻进了 ${s.what}`);
          }
          if (q.y < ep.high - 1.6) lowOut++;
        },
      });
      assert.equal(await p, 'done');
      assert.ok(minY >= nd.floors[0].elev + EYE - 1e-6, `${id}：最低飞到 ${minY}（不钻地）`);
      assert.ok(lowOut > 5, `${id}：最后一段是在门外低低地飞进来的`);
    }
  }
});

await test('flyIn 没有大门：从楼上往下降（先藏起楼上、降到天花下面再放回来）→ 最大的客厅正中', async () => {
  const plan = structuredClone(M.templatePlan('terrace2'));
  plan.floors[0].openings = plan.floors[0].openings.filter((o) => o.kind !== 'door' && o.kind !== 'slider');
  const { engine, ep, floors, nd } = flightCase('terrace2', plan);
  assert.ok(ep.fallback);
  const fb = ep.fallback;
  let hiddenSeen = false;
  let ceilY = null;
  const p = flyIn(engine, ep, {
    walk: { ev: 1 },
    reduced: false,
    ceilings: () => {
      ceilY = engine.camera.position.y;
      assert.ok(floors[1].group.visible, '盖天花的时候楼上放回来了');
    },
  });
  ticks(engine, 3.2, {
    each: () => {
      if (!floors[1].group.visible) hiddenSeen = true;
    },
  });
  assert.equal(await p, 'done');
  assert.ok(hiddenSeen, '降下来的时候楼上藏着');
  assert.ok(floors.every((F) => F.group.visible));
  const F = nd.floors[fb.fi];
  assert.ok(ceilY != null && ceilY < F.elev + F.ceil, `天花在降到 ${ceilY} 时才盖上`);
  assert.ok(engine.camera.position.distanceTo(new THREE.Vector3(fb.x, fb.y, fb.z)) < 1e-9);
});

await test('减少动态效果：淡入淡出代替飞行，一下子到 P3 / 回到原样；cancelFlight 停下来、onTick 还回去', async () => {
  const { engine, ep } = flightCase('condo3');
  const saved = saveOrbit(engine);
  const doors = fakeDoors(engine.log);
  const fades = [];
  const fade = (swap, ms) => {
    fades.push(ms);
    swap();
  };
  const walk = { ev: 1 };
  assert.equal(await flyIn(engine, ep, { walk, doors, reduced: true, fade }), 'done');
  assert.deepEqual(fades, [250]);
  assert.equal(doors.opened[0].instant, true, '门一下子开好');
  assert.ok(engine.camera.position.distanceTo(new THREE.Vector3(ep.P3.x, ep.P3.y, ep.P3.z)) < 1e-9);
  assert.equal(engine.ceilings, true);
  assert.equal(walk.fov, 62);
  assert.equal(engine.onTick, null, '没有用 onTick');
  assert.equal(await flyOut(engine, saved, { doors, reduced: true, fade }), 'done');
  assert.ok(engine.camera.position.equals(saved.pos) && engine.camera.quaternion.equals(saved.quat));
  assert.deepEqual(fades, [250, 250]);
  // cancelFlight：飞到一半停下来，onTick 还回去
  const e2 = flightCase('condo3').engine;
  const mine = () => false;
  e2.onTick = mine;
  const p = flyIn(e2, ep, { walk: { ev: 1 }, reduced: false, ceilings() {} });
  ticks(e2, 0.5);
  assert.equal(cancelFlight(e2), true);
  assert.equal(await p, 'cancelled');
  assert.equal(e2.onTick, mine);
  assert.equal(cancelFlight(e2), false, '没在飞');
  // 飞回来的时候被打断：马上放回原样
  const s2 = saveOrbit(flightCase('condo3').engine);
  const p2 = flyOut(e2, s2, { reduced: false });
  ticks(e2, 0.4);
  cancelFlight(e2);
  assert.equal(await p2, 'cancelled');
  assert.ok(e2.camera.position.equals(s2.pos) && e2.walk === null && e2.onTick === null, '打断也放回原样');
});

await test('saveOrbit 时鸟瞰的镜头正在飞（换楼层 / 重新取景的 engine.tween）：存它要飞到的那一下（朝向 = 看着目标点），镜头本身不动；没在飞 → 和以前一模一样', () => {
  const e = fakeEngine();
  const plain = saveOrbit(e);
  // 没在飞：就是现在的镜头（拷贝）
  assert.ok(plain.pos.equals(e.camera.position) && plain.quat.equals(e.camera.quaternion) && plain.target.equals(e.controls.target));
  assert.ok(plain.pos !== e.camera.position && plain.quat !== e.camera.quaternion && plain.target !== e.controls.target);
  e.tween = null;
  assert.deepEqual(saveOrbit(e), plain, 'tween = null 也一样');
  // 飞到一半（Engine.frame / setFloorView 的补间：fromP / fromT → toP / toT）
  const toP = new THREE.Vector3(14, 22, 30);
  const toT = new THREE.Vector3(3, 4.2, 5);
  e.tween = { t0: 0, dur: 900, fromP: e.camera.position.clone(), fromT: e.controls.target.clone(), toP, toT };
  e.camera.position.lerp(toP, 0.5);
  e.controls.target.lerp(toT, 0.5);
  e.camera.lookAt(e.controls.target);
  const live = { pos: e.camera.position.clone(), quat: e.camera.quaternion.clone(), target: e.controls.target.clone() };
  const saved = saveOrbit(e);
  assert.ok(saved.pos.equals(toP) && saved.pos !== toP, '存的是要飞到的位置（拷贝）');
  assert.ok(saved.target.equals(toT) && saved.target !== toT, '存的是要飞到的目标点（拷贝）');
  const cam = new THREE.PerspectiveCamera();
  cam.position.copy(toP);
  cam.lookAt(toT);
  assert.ok(Math.abs(saved.quat.dot(cam.quaternion)) > 1 - 1e-12, '朝向 = 从那里看着目标点（和补间结束时 OrbitControls 的 lookAt 一样）');
  // 飞着的时候 isFramed() 总是 true：要看飞到的那一下是不是 frame() 对好的取景（Engine._framed）
  assert.equal(saved.framed, false, '没有对好的取景（_framed = null）→ 不算对好');
  e._framed = { pos: toP.clone().addScalar(0.01), target: toT.clone() };
  assert.equal(saveOrbit(e).framed, true, '重新取景的补间（飞到 _framed）→ 对好的');
  e._framed = { pos: toP.clone().setY(toP.y - 3), target: toT.clone().setY(toT.y - 3) };
  assert.equal(saveOrbit(e).framed, false, '换楼层的补间（没对好的时候只是上下平移，不飞到 _framed）→ 不算对好');
  e._framed = null;
  assert.ok(e.camera.position.equals(live.pos) && e.camera.quaternion.equals(live.quat) && e.controls.target.equals(live.target), '镜头本身不动（飞进去从现在的位置起飞）');
  // 出来：回到补间的终点，不是半路
  e.walk = {};
  e.tween = null;
  restoreOrbit(e, saved);
  assert.ok(e.camera.position.equals(toP) && e.controls.target.equals(toT));
  assert.ok(e.camera.quaternion.equals(saved.quat));
});

await test('画布淡出淡入（fadeCanvas，减少动态效果的飞行也用它）：叠在一起只淡一次 / 等它淡完再淡；画布最后回到淡之前的样子；swap 出错也淡回来；restoreOrbit 保险一下（没淡过不碰）', async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const e = fakeEngine();
  const style = { opacity: '', transition: '' };
  e.renderer.domElement = { style };
  // 淡出的时候又来一个：一起换（按来的顺序），只淡一次
  const ran = [];
  const p1 = fadeCanvas(e, () => ran.push('a'), 40);
  assert.equal(style.opacity, '0');
  assert.match(style.transition, /opacity 20ms/);
  const p2 = fadeCanvas(e, () => ran.push('b'), 40);
  assert.deepEqual(await Promise.all([p1, p2]), [true, true]);
  assert.deepEqual(ran, ['a', 'b']);
  assert.equal(style.opacity, '');
  assert.equal(style.transition, '');
  // 已经在淡入：等它淡完再淡一次（swap 一定会跑：飞回去的 restoreOrbit 不能丢）
  ran.length = 0;
  const q1 = fadeCanvas(e, () => ran.push('a'), 40);
  await sleep(28);
  assert.deepEqual(ran, ['a']);
  let q2Done = false;
  const q2 = fadeCanvas(e, () => ran.push('b'), 40).then((v) => ((q2Done = true), v));
  await q1;
  assert.equal(q2Done, false);
  assert.equal(await q2, true);
  assert.deepEqual(ran, ['a', 'b']);
  assert.equal(style.opacity, '');
  assert.equal(style.transition, '');
  // swap 出错：照样淡回来，Promise 报错
  await assert.rejects(fadeCanvas(e, () => {
    throw new Error('boom');
  }, 20), /boom/);
  assert.equal(style.opacity, '');
  // 减少动态效果飞回去（flyOut → fadeSwap，没给 hooks.fade）：撞上控制器跳到收藏角度的淡出淡入 → 一起换；回到鸟瞰、画布回到原来的样子
  e.walk = { fov: 62, vo: { x: 0, y: 0 }, ev: 1.3 };
  const saved = { ...saveOrbit(e), pos: new THREE.Vector3(9, 9, 9) };
  const jumped = fadeCanvas(e, () => ran.push('goto'), 240);
  await sleep(10);
  const out = flyOut(e, saved, { reduced: true });
  assert.equal(await out, 'done');
  await jumped;
  assert.ok(e.camera.position.equals(saved.pos) && e.walk === null);
  assert.equal(style.opacity, '');
  assert.equal(style.transition, '');
  // restoreOrbit 保险：淡过、现在没在淡，画布却还是 0 → 放回淡之前的样子
  style.opacity = '0';
  restoreOrbit(e, saved);
  assert.equal(style.opacity, '');
  // 从来没淡过的引擎：一点不碰（鸟瞰一模一样）
  const e2 = fakeEngine();
  const st2 = { opacity: '0.5', transition: 'x' };
  e2.renderer.domElement = { style: st2 };
  restoreOrbit(e2, saveOrbit(e2));
  assert.deepEqual(st2, { opacity: '0.5', transition: 'x' });
  // 没有画布样式（Node）：直接换
  let direct = 0;
  assert.equal(await fadeCanvas(fakeEngine(), () => direct++), true);
  assert.equal(direct, 1);
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
