// 走进去 · 切口换成批荡（src/studio/walk/plaster.js —— docs/walk/SPEC.md §10）：
//   鸟瞰里楼板外露的边、墙体的上下两面是墨色切口（house.js houseKit().cap）；走进去以后从屋里看是黑的（semid2 楼梯口的黑楔子、
//   门窗过梁底下的黑边）。盖上天花时每一层的楼板 / 墙体换一份新的材质数组（切口 → 天花批荡 / 墙面），掀掉天花时原样放回。
//   ① 假网格：swapCaps / restoreCaps —— 新数组、共用的材质不动、调几次都一样、放回的是原来那个对象、别人又换过的不动；
//   ② plasterEdges(engine)：只换楼层的壳和楼板（家具、底座不动）、重建过的楼层（engine.floors 换了）新的换上旧的放回、关掉全放回；
//   ③ 真的楼（floors.buildStack + MatLib，semid2 / terrace2）：换完一个切口都不剩，关掉以后每个网格的材质和换之前是同一个对象；
//   ④ flight.js：flyIn 盖天花时换上，flyOut / restoreOrbit 放回；控制器每帧调 plasterEdges(engine)（楼层重建过才会做事）。
// 纯 Node（canvas 用假的），不需要浏览器。跑法：node test/walk-plaster.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { swapCaps, restoreCaps, plasterEdges, plastered } from '../src/studio/walk/plaster.js';
import { flyIn, flyOut, restoreOrbit, saveOrbit } from '../src/studio/walk/flight.js';
import { templatePlan } from '../src/studio/plan/model.js';
import { MatLib } from '../src/studio/engine/matlib.js';
import { buildStack } from '../src/studio/engine/floors.js';
import { houseKit } from '../src/studio/engine/house.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

// 假的 canvas：house.js 的底座石纹（createImageData / putImageData）、字牌（measureText、fillText…：别的方法都是空的）
const ctx2d = new Proxy(
  {
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    measureText: (s) => ({ width: 10 * String(s).length, actualBoundingBoxAscent: 7, actualBoundingBoxDescent: 2 }),
  },
  { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => ((o[k] = v), true) },
);
globalThis.document = globalThis.document || { documentElement: {}, createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d }) };

console.log('走进去 · 切口换成批荡（walk-plaster）');

// ───────────────────────── ① 假网格 ─────────────────────────

/** 假材质：冻住（谁改了它就报错） */
const mat = (name, extra = {}) => Object.freeze({ name, userData: Object.freeze({ ...extra }) });
const CAP = mat('cap', { fixed: 'cap' });
const LIBCAP = mat('lib-cap', { fixed: 'cap' }); // matlib 的 lib.fixed.cap（家具的深色衬底）
const CEIL = mat('ceiling', { fixed: 'ceiling' });
const WALLS = mat('walls', { slot: 'walls' });
const TILE = mat('tile', { slot: 'tile' });
const EXT = mat('exterior', { fixed: 'exterior' });
const WOOD = mat('wood', { slot: 'floor' });
/** 假网格 / 组（有 traverse，像 three.js 的 Object3D） */
const mesh = (material, userData = {}) => ({ isMesh: true, material, userData, children: [], traverse(f) { f(this); } });
const group = (...children) => ({
  isGroup: true,
  children,
  userData: {},
  traverse(f) {
    f(this);
    for (const c of this.children) c.traverse(f);
  },
});
const isCap = (m) => m === CAP;
const pick = (o) => (o.userData.plate ? CEIL : o.userData.slot === 'walls' ? WALLS : null);

await test('① swapCaps：切口那一格换成批荡（新数组），原来的数组和共用的材质都不动；pick 给 null 的不换', () => {
  const plateArr = Object.freeze([CAP, CEIL]);
  const wallArr = Object.freeze([WALLS, CAP, TILE, EXT]);
  const plate = mesh(plateArr, { plate: true });
  const wall = mesh(wallArr, { slot: 'walls' });
  const lone = mesh(CAP, { slot: 'walls' }); // 单个材质的切口
  const other = mesh([CAP, WOOD], { slot: 'floor' }); // pick → null：不换
  const plain = mesh([WALLS, TILE], { slot: 'walls' }); // 没有切口
  const root = group(plate, group(wall, lone), other, plain);
  const rec = swapCaps([root], { isCap, pick });
  assert.equal(rec.length, 3);
  assert.deepEqual(plate.material, [CEIL, CEIL]);
  assert.notEqual(plate.material, plateArr, '换的是一份新的数组');
  assert.deepEqual(wall.material, [WALLS, WALLS, TILE, EXT], '只换切口那一格，别的格子、顺序都不变（几何体的 groups 不用动）');
  assert.equal(lone.material, WALLS);
  assert.deepEqual(other.material, [CAP, WOOD], 'pick 给 null：不换');
  assert.deepEqual(plain.material, [WALLS, TILE]);
  assert.deepEqual(plateArr, [CAP, CEIL], '原来的数组不动');
  assert.deepEqual(wallArr, [WALLS, CAP, TILE, EXT]);
});

await test('① swapCaps 调几次都一样（已经换过的跳过、不会把批荡再记成「原来的」）；restoreCaps 放回同一个对象', () => {
  const plateArr = [CAP, CEIL];
  const wallArr = [WALLS, CAP, TILE];
  const lone = mesh(CAP, { slot: 'walls' });
  const plate = mesh(plateArr, { plate: true });
  const wall = mesh(wallArr, { slot: 'walls' });
  const root = group(plate, wall, lone);
  const rec = swapCaps([root], { isCap, pick });
  const after = [plate.material, wall.material, lone.material];
  swapCaps([root], { isCap, pick, records: rec });
  swapCaps([root, plate], { isCap, pick, records: rec });
  assert.equal(rec.length, 3, '第二、三次什么都没加');
  assert.deepEqual([plate.material, wall.material, lone.material], after);
  assert.equal(plate.material, after[0], '还是第一次换上的那一份数组');
  restoreCaps(rec);
  assert.equal(plate.material, plateArr, '放回的就是原来那个数组（===）');
  assert.equal(wall.material, wallArr);
  assert.equal(lone.material, CAP);
  assert.equal(rec.length, 0, 'records 清空');
  restoreCaps(rec); // 再放一次：什么都不做
  assert.equal(plate.material, plateArr);
});

await test('① restoreCaps：网格的材质已经被别人换过（不是我们换上的那一份）→ 不动它', () => {
  const arr = [CAP, CEIL];
  const plate = mesh(arr, { plate: true });
  const rec = swapCaps([plate], { isCap, pick });
  const theirs = [WOOD, WOOD];
  plate.material = theirs;
  restoreCaps(rec);
  assert.equal(plate.material, theirs);
});

// ───────────────────────── ② plasterEdges(engine) ─────────────────────────

/** 假的一层：壳（墙体、地板、门扇）+ 楼板 + 家具（家具不在壳里：不该被换） */
function fakeFloor(k) {
  const wallArr = [WALLS, CAP, TILE, EXT];
  const cutArr = [WALLS, CAP];
  const body = mesh(wallArr, { slot: 'walls' });
  const cut = mesh(cutArr, { slot: 'walls' });
  const floor = mesh(WOOD, { slot: 'floor' });
  const shell = { group: group(group(body), group(cut), floor) };
  const plate = k > 0 ? mesh([CAP, CEIL], { plate: true }) : null;
  const sofaBack = mesh([LIBCAP, WOOD], { slot: 'walls' }); // 家具里的深色衬底：lib.fixed.cap
  const furnCap = mesh([CAP, WOOD], { slot: 'walls' }); // 就算家具里有 house 的 cap，也不在壳里 → 不换
  const furn = group(sofaBack, furnCap);
  return { id: `f${k}`, shell, plate, furn, group: group(shell.group, ...(plate ? [plate] : []), furn), parts: { body, cut, floor, plate, sofaBack, furnCap }, orig: { body: wallArr, cut: cutArr, plate: plate?.material, sofaBack: sofaBack.material, furnCap: furnCap.material } };
}
const fakeLib = () => ({ fixed: { ceiling: CEIL, cap: LIBCAP }, slot: (id) => (id === 'walls' ? WALLS : id === 'tile' ? TILE : null) });

await test('② plasterEdges(engine, true)：每一层楼板 → 天花批荡、墙体 → 墙面；家具不动；调几次都一样；dirty', () => {
  const floors = [fakeFloor(0), fakeFloor(1)];
  const e = { floors, lib: fakeLib(), dirty: false };
  assert.equal(plasterEdges(e, true), true);
  assert.equal(e.dirty, true);
  assert.equal(plastered(e), 5, '两层的墙体 + 切低的墙 + 二楼的楼板');
  for (const F of floors) {
    assert.deepEqual(F.parts.body.material, [WALLS, WALLS, TILE, EXT]);
    assert.deepEqual(F.parts.cut.material, [WALLS, WALLS]);
    assert.equal(F.parts.floor.material, WOOD);
    assert.equal(F.parts.sofaBack.material, F.orig.sofaBack, 'lib.fixed.cap 不是切口');
    assert.equal(F.parts.furnCap.material, F.orig.furnCap, '家具不在壳里');
  }
  assert.deepEqual(floors[1].parts.plate.material, [CEIL, CEIL]);
  const now = floors.map((F) => [F.parts.body.material, F.parts.plate?.material]);
  e.dirty = false;
  assert.equal(plasterEdges(e, true), false, '已经换好、楼层没重建：什么都不做');
  assert.equal(plasterEdges(e), false, '默认 on = true');
  assert.equal(e.dirty, false);
  assert.deepEqual(floors.map((F) => [F.parts.body.material, F.parts.plate?.material]), now);
  assert.ok(floors.every((F, i) => F.parts.body.material === now[i][0]), '同一份数组，没有每帧新建');
});

await test('② plasterEdges(engine, false)：放回原来的材质对象（===）；再关一次 → false', () => {
  const floors = [fakeFloor(0), fakeFloor(1)];
  const e = { floors, lib: fakeLib(), dirty: false };
  plasterEdges(e, true);
  e.dirty = false;
  assert.equal(plasterEdges(e, false), true);
  assert.equal(e.dirty, true);
  assert.equal(plastered(e), 0);
  for (const F of floors) {
    assert.equal(F.parts.body.material, F.orig.body);
    assert.equal(F.parts.cut.material, F.orig.cut);
    if (F.parts.plate) assert.equal(F.parts.plate.material, F.orig.plate);
  }
  assert.equal(plasterEdges(e, false), false);
  // 再进去一次：又换上（新的数组），再放回还是原来的
  plasterEdges(e, true);
  assert.deepEqual(floors[1].parts.plate.material, [CEIL, CEIL]);
  plasterEdges(e, false);
  assert.equal(floors[1].parts.plate.material, floors[1].orig.plate);
});

await test('② 走着的时候楼层重建了（engine.floors 换了一个新数组）：新的楼板 / 墙换上，旧的放回去；出来全是原样', () => {
  const old = [fakeFloor(0), fakeFloor(1)];
  const e = { floors: old, lib: fakeLib(), dirty: false };
  plasterEdges(e, true);
  const fresh = [fakeFloor(0), fakeFloor(1)];
  e.floors = fresh;
  e.dirty = false;
  assert.equal(plasterEdges(e), true, '控制器每帧调：看出楼层换了');
  assert.equal(e.dirty, true);
  for (const F of old) {
    assert.equal(F.parts.body.material, F.orig.body, '旧的（已经不在场景里）放回原样');
    if (F.parts.plate) assert.equal(F.parts.plate.material, F.orig.plate);
  }
  assert.deepEqual(fresh[1].parts.plate.material, [CEIL, CEIL], '新建的楼板也是批荡的边');
  assert.deepEqual(fresh[0].parts.body.material, [WALLS, WALLS, TILE, EXT]);
  assert.equal(plasterEdges(e), false, '之后每帧：只比一下');
  plasterEdges(e, false);
  for (const F of fresh) {
    assert.equal(F.parts.body.material, F.orig.body, '退出：新建的也放回原样，不会留着批荡');
    assert.equal(F.parts.cut.material, F.orig.cut);
    if (F.parts.plate) assert.equal(F.parts.plate.material, F.orig.plate);
  }
});

await test('② 没有材质库 / 没有壳的假引擎（别的测试里的）：不报错、什么都不换', () => {
  assert.equal(plasterEdges(null), false);
  const e = { floors: [{ id: 'gf' }, { id: 'ff' }], dirty: false };
  assert.equal(plasterEdges(e, true), false);
  assert.equal(e.dirty, false);
  assert.equal(plasterEdges(e, false), false);
  const F = fakeFloor(1);
  const e2 = { floors: [F], lib: { slot: () => WALLS, fixed: {} }, dirty: false }; // 没有 ceiling
  plasterEdges(e2, true);
  assert.equal(F.parts.plate.material, F.orig.plate);
  plasterEdges(e2, false);
});

// ───────────────────────── ③ 真的楼 ─────────────────────────

const renderer = { capabilities: { getMaxAnisotropy: () => 16 }, initTexture() {} };
const lib = new MatLib(renderer, 'fast');
const K = houseKit(lib);

/** 场景里每个网格 → 它现在的 material（引用） */
const snapshot = (root) => {
  const m = new Map();
  root.traverse((o) => o.isMesh && m.set(o, o.material));
  return m;
};
const capFaces = (o) => {
  const arr = Array.isArray(o.material) ? o.material : [o.material];
  return o.geometry.groups.length ? o.geometry.groups.filter((g) => arr[g.materialIndex] === K.cap).length : arr.includes(K.cap) ? 1 : 0;
};

for (const id of ['semid2', 'terrace2']) {
  await test(`③ ${id}（真的 buildStack）：换完楼层里一个墨色切口都不剩（楼梯口那一圈楼板的边 = 天花批荡），关掉后每个网格都是原来的材质对象`, () => {
    const plan = id === 'semid2' ? JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/walk/semid2.json'), 'utf8')).plan || templatePlan(id) : templatePlan(id);
    const stack = buildStack(plan, lib, { title: 'T', subtitle: 'S' });
    assert.ok(stack.floors.length > 1, '要两层以上（有楼板、有楼梯口）');
    const e = { floors: stack.floors, lib, dirty: false };
    const before = snapshot(stack.group);
    const capBefore = { color: K.cap.color.getHex(), rough: K.cap.roughness, version: K.cap.version };
    // 进去之前：楼板外露的边、墙的上下两面确实是切口
    const plates = stack.floors.map((F) => F.plate).filter(Boolean);
    assert.ok(plates.length >= 1 && plates.every((p) => p.material[0] === K.cap && p.material[1] === lib.fixed.ceiling), '楼板 = [切口, 天花批荡]');
    let walls0 = 0;
    for (const F of stack.floors) F.shell.group.traverse((o) => o.isMesh && (walls0 += capFaces(o)));
    assert.ok(walls0 > 0, '墙体上有切口（墙头、门窗过梁的底面）');

    assert.equal(plasterEdges(e, true), true);
    for (const F of stack.floors) {
      const left = [];
      for (const root of [F.shell.group, F.plate].filter(Boolean)) root.traverse((o) => o.isMesh && capFaces(o) && left.push(o.userData));
      assert.deepEqual(left, [], `${F.id}：壳和楼板里没有切口了`);
      if (F.plate) {
        assert.deepEqual(F.plate.material, [lib.fixed.ceiling, lib.fixed.ceiling], `${F.id}：楼板的边 = 天花批荡`);
        assert.notEqual(F.plate.material, before.get(F.plate));
      }
    }
    // 墙体：切口那一格 = 墙面（刷墙跟着变）
    let wallsNow = 0;
    for (const F of stack.floors)
      F.shell.group.traverse((o) => {
        if (!o.isMesh || !Array.isArray(before.get(o)) || !before.get(o).includes(K.cap)) return;
        const was = before.get(o);
        was.forEach((m, i) => assert.equal(o.material[i], m === K.cap ? lib.slot('walls') : m));
        wallsNow++;
      });
    assert.ok(wallsNow > 0);
    // 楼层外面的（底座、树）不动；共用的切口材质本身不动
    stack.plinth.traverse((o) => o.isMesh && assert.equal(o.material, before.get(o)));
    assert.deepEqual({ color: K.cap.color.getHex(), rough: K.cap.roughness, version: K.cap.version }, capBefore, 'K.cap 一点没改');
    assert.equal(houseKit(lib).cap, K.cap);

    assert.equal(plasterEdges(e, false), true);
    const after = snapshot(stack.group);
    assert.equal(after.size, before.size);
    const diff = [...before].filter(([o, m]) => after.get(o) !== m);
    assert.equal(diff.length, 0, '每个网格的 material 都是原来那个对象（===）');
  });
}

// ───────────────────────── ④ flight.js / 控制器 ─────────────────────────

/** 最小的假引擎：flyIn（减少动态效果、没有大门 → 落到房间里）/ flyOut / restoreOrbit 要用的 */
function flightEngine() {
  const floors = [fakeFloor(0), fakeFloor(1)];
  floors.forEach((F, i) => Object.assign(F, { elev: i * 3.2, ceil: 2.8 }));
  const camera = new THREE.PerspectiveCamera(28, 1.4, 0.1, 400);
  camera.position.set(20, 14, 26);
  const e = {
    log: [],
    floors,
    lib: fakeLib(),
    camera,
    controls: { target: new THREE.Vector3(4, 1.2, 6), enabled: true },
    container: { clientWidth: 1180, clientHeight: 820 },
    insets: {},
    vo: { x: 0, y: 0 },
    voTo: { x: 0, y: 0 },
    floorView: 'all',
    lastView: 'iso',
    walk: null,
    onTick: null,
    dirty: false,
    day: { exposure: 1 },
    renderer: { toneMappingExposure: 1, shadowMap: { needsUpdate: false } },
    isFramed: () => false,
    setCeilings(on) {
      this.log.push(`setCeilings:${on}:${plastered(this)}`);
      this.ceilingsOn = on;
    },
    setWalk(w) {
      this.walk = w || null;
    },
    setFloorView(v) {
      this.floorView = v;
    },
    applyView() {},
    updateViewTarget() {},
    frame() {},
    placeFill() {},
  };
  return e;
}
const fallback = () => ({ fallback: { fi: 0, x: 4, y: 1.55, z: 6, yaw: 0 } });
const sync = (swap) => {
  swap();
  return Promise.resolve();
};

await test('④ flyIn 盖上天花时换上批荡的边；flyOut 掀掉天花时放回（同一个对象）', async () => {
  const e = flightEngine();
  const saved = saveOrbit(e);
  assert.equal(plastered(e), 0, '飞之前（鸟瞰）不换');
  const r = await flyIn(e, fallback(), { walk: { ev: 1 }, reduced: true, fade: sync });
  assert.equal(r, 'done');
  assert.equal(e.ceilingsOn, true);
  assert.equal(plastered(e), 5);
  assert.deepEqual(e.floors[1].parts.plate.material, [CEIL, CEIL]);
  await flyOut(e, saved, { reduced: true, fade: sync });
  assert.equal(plastered(e), 0);
  assert.ok(e.log.includes('setCeilings:false:5'), '掀天花的那一下还换着');
  for (const F of e.floors) {
    assert.equal(F.parts.body.material, F.orig.body);
    if (F.parts.plate) assert.equal(F.parts.plate.material, F.orig.plate);
  }
});

await test('④ 一下子回去（restoreOrbit：出错、卸载、飞进去被打断）也放回', async () => {
  const e = flightEngine();
  const saved = saveOrbit(e);
  await flyIn(e, fallback(), { walk: { ev: 1 }, reduced: true, fade: sync });
  assert.equal(plastered(e), 5);
  restoreOrbit(e, saved, {});
  assert.equal(plastered(e), 0);
  for (const F of e.floors) if (F.parts.plate) assert.equal(F.parts.plate.material, F.orig.plate);
  // 给了 hooks.ceilings（界面自己盖天花）也照样换
  const e2 = flightEngine();
  await flyIn(e2, fallback(), { walk: { ev: 1 }, reduced: true, fade: sync, ceilings: () => {} });
  assert.equal(plastered(e2), 5);
  restoreOrbit(e2, null, {});
  assert.equal(plastered(e2), 0);
});

await test('④ 减少动态效果：淡出那一下还没换画面就一下子回去了（卸载）→ 那一下作废，鸟瞰里不留天花、批荡，镜头不动', async () => {
  // 界面自己的淡出淡入（hooks.fade）：换画面那一下先攒着，等测试放行
  let held = null;
  const hold = (swap) =>
    new Promise((res) => {
      held = () => {
        swap();
        res();
      };
    });
  const e = flightEngine();
  const saved = saveOrbit(e);
  const pos0 = e.camera.position.clone();
  const p = flyIn(e, fallback(), { walk: { ev: 1 }, reduced: true, fade: hold });
  restoreOrbit(e, saved, {}); // WalkMode 卸载：exit({ instant }) → restoreOrbit
  assert.equal(typeof held, 'function', '换画面那一下还攒着');
  held();
  assert.equal(await p, 'cancelled');
  assert.equal(plastered(e), 0, '没有换上批荡');
  assert.equal(e.ceilingsOn, false, '天花没有盖上');
  assert.equal(e.walk, null);
  assert.equal(e.camera.position.distanceTo(pos0), 0, '镜头没被挪走');
  for (const F of e.floors) {
    assert.equal(F.parts.body.material, F.orig.body);
    if (F.parts.plate) assert.equal(F.parts.plate.material, F.orig.plate);
  }
  // 引擎下一次飞进去照常（作废的只是那一次）
  const r = await flyIn(e, fallback(), { walk: { ev: 1 }, reduced: true, fade: sync });
  assert.equal(r, 'done');
  assert.equal(e.ceilingsOn, true);
  assert.equal(plastered(e), 5);
  restoreOrbit(e, saved, {});
  assert.equal(plastered(e), 0);
});

await test('④ 同一件事走画布自己的淡出（fadeCanvas，有 setTimeout）：一样作废；换画面以后才回去 → 正常放回', async () => {
  const e = flightEngine();
  e.renderer.domElement = { style: { opacity: '', transition: '' } };
  const saved = saveOrbit(e);
  const pos0 = e.camera.position.clone();
  const p = flyIn(e, fallback(), { walk: { ev: 1 }, reduced: true });
  restoreOrbit(e, saved, {});
  assert.equal(await p, 'cancelled');
  assert.equal(plastered(e), 0);
  assert.equal(e.ceilingsOn, false);
  assert.equal(e.camera.position.distanceTo(pos0), 0);
  // 落地以后再回去：'done'，回去时放回
  const r = await flyIn(e, fallback(), { walk: { ev: 1 }, reduced: true });
  assert.equal(r, 'done');
  assert.equal(plastered(e), 5);
  restoreOrbit(e, saved, {});
  assert.equal(plastered(e), 0);
  assert.equal(e.ceilingsOn, false);
});

await test('④ 控制器每帧调 plasterEdges(engine)（楼层重建过才会做事），进 / 出只在 flight.js 里', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/studio/walk/controller.js'), 'utf8');
  const frame = src.slice(src.indexOf('function frame('), src.indexOf('function fail('));
  assert.match(frame, /plasterEdges\(engine\)/, 'frame() 里要有 plasterEdges(engine)');
  assert.equal((src.match(/plasterEdges\(/g) || []).length, 1, '控制器只有这一处');
  const fl = fs.readFileSync(path.join(ROOT, 'src/studio/walk/flight.js'), 'utf8');
  const ro = fl.slice(fl.indexOf('export function restoreOrbit('), fl.indexOf('// ───', fl.indexOf('export function restoreOrbit(')));
  assert.match(ro, /setCeilings\(false\);\s*\n\s*plasterEdges\(engine, false\)/, 'restoreOrbit：掀掉天花紧接着放回切口');
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
