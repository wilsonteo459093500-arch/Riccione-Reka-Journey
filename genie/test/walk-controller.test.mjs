// 走进去 · 控制器（src/studio/walk/controller.js、marks3d.js —— docs/walk/SPEC.md §3、§4、§10）：
//   假的引擎（和 Engine 一样的接口，只记下调用）+ 真的 nav / 门 / 飞行 / 带逛，onTick 用假的 rAF 一帧一帧跑：
//   进去（state 的顺序、onTick、window.__genieWalk、落在 P3）→ 出来（飞回去 / 一下子回去：engine.walk、engine.onTick 都是 null、镜头一点不差）；
//   点一下按工具分（走 / 刷颜色 / 地板 / 家具 / 量尺；灯光、拍照也是走）；摇杆贴着墙滑、永远不走进走不过去的格子；
//   摇杆把开着的门扇当墙（停在门扇前；从门扇后面推 → 门扇转开）；带逛一路不穿门扇；
//   楼梯那一段：眼睛 = 出发那层的地面 + y + 1.55，走过一半的高度才换楼层（setFloorView instant + quiet），换完家具照规则藏；
//   家具只画人在的那一层（楼梯 / 挑空 3m 以内加上下层）；拍照的形状、跳回收藏的角度；带逛的 walkTo 到了 → true、客人接手 → false；
//   update(project) 只重建家具变了的那一层；拖动转头、按住选中的家具拖 = 搬（松手才提交一次）；键盘；地上的记号（marks3d）全部能拿掉。
// 纯 Node（three.js 可以在 Node 里跑；画布、窗口都是假的）。跑法：node test/walk-controller.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import * as M from '../src/studio/plan/model.js';
import { furnish } from '../src/studio/engine/furnish.js';
import { fromStoredProject } from '../src/studio/store.js';
import * as N from '../src/studio/walk/nav.js';
import { entryPlan, saveOrbit, EYE } from '../src/studio/walk/flight.js';
import { addMark } from '../src/studio/walk/marks.js';
import { floorSlotOf } from '../src/studio/walk/paint.js';
import { createWalk, slideMove, furnitureMask, floorAtY, changedFloors, angleDiff, TOOLS, SPEED } from '../src/studio/walk/controller.js';
import { tourStops } from '../src/studio/walk/tour.js';
import { createMarks } from '../src/studio/walk/marks3d.js';
import { PALETTE } from '../src/shared/palette.js';

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
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 6).join('\n    ')}`);
  }
}

console.log('走进去 · 控制器（walk-controller）');

// ───────────────────────── 假的窗口 / 画布 / 引擎 ─────────────────────────

/** 假的事件目标：记下监听，fire(type, event) 发出去 */
function target(extra = {}) {
  const L = new Map();
  return {
    L,
    addEventListener(t, f) {
      if (!L.has(t)) L.set(t, new Set());
      L.get(t).add(f);
    },
    removeEventListener(t, f) {
      L.get(t)?.delete(f);
    },
    fire(t, e = {}) {
      for (const f of [...(L.get(t) || [])]) f({ type: t, preventDefault() {}, ...e });
    },
    count() {
      let c = 0;
      for (const s of L.values()) c += s.size;
      return c;
    },
    ...extra,
  };
}
globalThis.window = target();

const fixture = (name) => fromStoredProject(JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/walk', `${name}.json`), 'utf8')));
const PROJ = { condo3: fixture('condo3'), semid2: fixture('semid2') };

// house.doorLeaf 只要材质（lib.slot）；趟门玻璃按 lib.fixed.glass 找
const lib = { slot: () => new THREE.MeshBasicMaterial(), fixed: { glass: new THREE.MeshBasicMaterial() } };

/**
 * 和 Engine 一样的接口（只记下调用、照着改状态）。floors：每层一个组（家具组、天花挂在里面）。
 * hitAt / itemAt：测试自己给（engine.pick = (x, y) => hit）；rayAt：真的射线（从相机穿过画布上这一点，搬家具用）。
 */
function fakeEngine(project, { W = 1180, H = 820 } = {}) {
  const nd = N.navDataOf(project.plan);
  const scene = new THREE.Scene();
  const floors = nd.floors.map((f) => {
    const group = new THREE.Group();
    group.position.y = f.elev;
    const furn = new THREE.Group();
    furn.userData.floorFurniture = f.id;
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    ceiling.userData.ceiling = true;
    ceiling.visible = false;
    group.add(furn, ceiling);
    scene.add(group);
    return { id: f.id, level: f.level, elev: f.elev, ceil: f.ceil, height: f.height, group, furn, ceiling, wallSets: [] };
  });
  const log = [];
  const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 400);
  const el = target({ style: undefined, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }) });
  const e = {
    log,
    plan: project.plan,
    scene,
    floors,
    camera,
    controls: { target: new THREE.Vector3(4, 1.2, 6), enabled: true, _sphericalDelta: new THREE.Spherical(0, 0, 0), _panOffset: new THREE.Vector3() },
    container: { clientWidth: W, clientHeight: H },
    insets: { left: 300, right: 0, top: 184, bottom: 160 },
    vo: { x: 150, y: 12 },
    voTo: { x: 150, y: 12 },
    floorView: 'all',
    activeIdx: floors.length - 1,
    lastView: 'iso',
    framed: true,
    walk: null,
    onTick: null,
    lastCut: { x: 1 },
    dirty: false,
    day: { exposure: 1.1 },
    time: 10,
    renderer: { domElement: el, toneMappingExposure: 1.1, shadowMap: { needsUpdate: false, autoUpdate: true } },
    lib,
    items: new Map(),
    itemData: new Map(),
    applyViews: 0,
    fills: 0,
    lights: [],
    pick: null,
    navData: () => nd,
    isFramed() {
      return !this.walk && this.framed;
    },
    setCeilings(on) {
      log.push(`setCeilings:${on}`);
      this.ceilingsOn = on;
    },
    setWalk(w) {
      log.push(w ? 'setWalk' : 'setWalk:null');
      this.walk = w || null;
      this.renderer.shadowMap.autoUpdate = !w;
    },
    // 和 Engine 一样：走着的时候每一层的家具都打开（控制器要自己再按规则藏）
    setFloorView(v, o) {
      log.push(`setFloorView:${v}:${!!o?.instant}:${!!o?.quiet}`);
      this.floorView = v;
      const idx = v === 'all' ? floors.length - 1 : floors.findIndex((F) => F.id === v);
      this.activeIdx = idx < 0 ? floors.length - 1 : idx;
      floors.forEach((F, i) => (F.furn.visible = this.walk ? true : i <= this.activeIdx));
      this.renderer.shadowMap.needsUpdate = true;
    },
    applyView() {
      this.applyViews++;
    },
    updateViewTarget() {},
    frame() {},
    highlightSlot() {},
    collectPickables() {},
    placeFill() {
      this.fills++;
    },
    placeRoomLights(near) {
      this.lights.push(near ? { ...near } : null);
    },
    hitAt(x, y) {
      return this.pick?.(x, y) ?? null;
    },
    itemAt(x, y) {
      return this.hitAt(x, y)?.object?.userData?.itemId || null;
    },
    raycaster: new THREE.Raycaster(),
    rayAt(x, y) {
      this.raycaster.setFromCamera(new THREE.Vector2((x / W) * 2 - 1, -(y / H) * 2 + 1), this.camera);
      return this.raycaster;
    },
  };
  e.camera.position.set(20, 14, 26);
  e.camera.lookAt(e.controls.target);
  // 家具：每件一个组，挂在它那一层的家具组里（像 Engine.setFurniture）
  for (const it of project.furniture || []) {
    const F = floors.find((q) => q.id === it.floor) || floors[0];
    const g = new THREE.Group();
    g.position.set(it.x, 0, it.z);
    g.userData = { itemId: it.id, kind: it.kind, elev: F.elev };
    F.furn.add(g);
    e.items.set(it.id, g);
    e.itemData.set(it.id, it);
  }
  return e;
}

/** 假的 rAF：每 step 毫秒调一次 onTick，跑 secs 秒（或 until() 说停） */
let clock = 1000;
function ticks(engine, secs, { step = 16, until } = {}) {
  const end = clock + secs * 1000;
  for (; clock <= end; clock += step) {
    if (!engine.onTick) break;
    engine.onTick(clock);
    if (until?.()) break;
  }
}
/** 等 Promise（假的 rAF 跑着）：它 settle 了就停 */
async function tickUntil(engine, promise, secs = 120) {
  let done = false;
  let val;
  promise.then((v) => {
    done = true;
    val = v;
  });
  const end = clock + secs * 1000;
  while (!done && clock < end) {
    ticks(engine, 0.5);
    await null;
    await null;
  }
  assert.ok(done, `${secs} 秒还没完`);
  return val;
}

/** 走进去：飞完（假的 rAF）→ 控制器 */
async function walkIn(name = 'condo3', opts = {}) {
  const project = opts.project || PROJ[name];
  const engine = fakeEngine(project, opts);
  const events = [];
  const api = { moves: [], times: [], moveItem: (id, p) => api.moves.push({ id, ...p }), setTime: (h) => api.times.push(h) };
  const ctl = createWalk(engine, { project, api, wish: false, onEvent: (evt, p) => events.push({ evt, p }), tourOpts: opts.tourOpts });
  const p = ctl.enter();
  const ok = await tickUntil(engine, p, 10);
  assert.equal(ok, true, '落地了');
  return { engine, ctl, events, api, project, nd: engine.navData() };
}
const of = (events, evt) => events.filter((e) => e.evt === evt).map((e) => e.p);

// ───────────────────────── 进 / 出 ─────────────────────────

await test('进去：flying-in → walking；onTick 是控制器的；window.__genieWalk；落在 P3、朝屋里；视角 = walkFov、曝光 × ev', async () => {
  const { engine, ctl, events, nd } = await walkIn('condo3');
  assert.deepEqual(of(events, 'state').map((s) => s.phase), ['flying-in', 'walking']);
  assert.equal(ctl.phase, 'walking');
  assert.equal(window.__genieWalk, ctl);
  assert.ok(engine.walk && typeof engine.onTick === 'function');
  const plan = entryPlan(nd, N.buildNav(nd, PROJ.condo3.furniture));
  const pose = ctl.pose();
  assert.ok(Math.abs(pose.x - plan.P3.x) < 1e-9 && Math.abs(pose.z - plan.P3.z) < 1e-9, '落在 P3');
  assert.ok(Math.abs(angleDiff(pose.yaw, plan.yaw)) < 1e-9);
  assert.equal(pose.pitch, 0);
  assert.equal(pose.fi, 0);
  assert.equal(pose.floor, nd.floors[0].id);
  assert.ok(Math.abs(engine.camera.position.y - (nd.floors[0].elev + EYE)) < 1e-9);
  assert.equal(engine.walk.fov, 62);
  assert.ok(engine.walk.ev > 1);
  assert.equal(engine.ceilingsOn, true);
  // controls.target = 眼睛前面 2.5m
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(engine.camera.quaternion);
  assert.ok(engine.controls.target.clone().sub(engine.camera.position).distanceTo(fwd.multiplyScalar(2.5)) < 1e-9);
  assert.ok(of(events, 'room').length >= 1, '进门就有房间');
  ctl.dispose();
});

await test('出来（飞回去 / 一下子回去）：engine.walk、engine.onTick 都是 null；镜头、主点一点不差；state 到 out；dispose 清掉 __genieWalk 和监听', async () => {
  for (const instant of [false, true]) {
    const { engine, ctl, events } = await walkIn('semid2');
    // 进去之前的镜头（saveOrbit 存的那一份）
    const before = { pos: new THREE.Vector3(20, 14, 26), target: new THREE.Vector3(4, 1.2, 6) };
    ctl.joystick(0, 1);
    ticks(engine, 1);
    ctl.joystick(0, 0);
    const p = ctl.exit({ instant });
    assert.equal(ctl.phase, instant ? 'out' : 'flying-out');
    await tickUntil(engine, p, 10);
    assert.equal(ctl.phase, 'out');
    assert.equal(engine.walk, null, 'engine.walk = null');
    assert.equal(engine.onTick, null, 'engine.onTick = null');
    assert.ok(engine.camera.position.equals(before.pos), '镜头放回去');
    assert.ok(engine.controls.target.equals(before.target), '目标点放回去');
    assert.deepEqual(engine.vo, { x: 150, y: 12 });
    assert.equal(engine.ceilingsOn, false);
    assert.deepEqual(of(events, 'state').map((s) => s.phase), ['flying-in', 'walking', 'flying-out', 'out']);
    // 鸟瞰：家具按 setFloorView('all') 全开
    assert.ok(engine.floors.every((F) => F.furn.visible));
    assert.equal(engine.scene.getObjectByName('walk-marks'), undefined, '地上的记号拿掉了');
    const el = engine.renderer.domElement;
    assert.ok(el.count() > 0);
    ctl.dispose();
    assert.equal(el.count(), 0, '画布上的监听拿掉了');
    assert.equal(window.__genieWalk, null);
    assert.equal(window.count(), 0, '窗口上的监听拿掉了');
  }
});

await test('飞到一半就退出 / dispose：一下子回去，enter() 给 false', async () => {
  const project = PROJ.condo3;
  const engine = fakeEngine(project);
  const ctl = createWalk(engine, { project, api: {} });
  const p = ctl.enter();
  ticks(engine, 1);
  assert.equal(ctl.phase, 'flying-in');
  ctl.dispose();
  assert.equal(await p, false);
  assert.equal(ctl.phase, 'out');
  assert.equal(engine.walk, null);
  assert.equal(engine.onTick, null);
  assert.ok(engine.camera.position.equals(new THREE.Vector3(20, 14, 26)));
});

// ───────────────────────── 点一下 ─────────────────────────

/** 像 Engine.hitAt 的结果：{ object, point, material }（material.userData.slot / fixed；家具网格带 itemId） */
function hitOf(p, { slot = 'walls', fixed = null, itemId = null } = {}) {
  const material = new THREE.MeshBasicMaterial();
  material.userData = fixed ? { slot, fixed } : { slot };
  const object = new THREE.Mesh(new THREE.BufferGeometry(), material);
  if (itemId) object.userData.itemId = itemId;
  return { object, point: new THREE.Vector3(p.x, p.y, p.z), material };
}
let tapT = 10;
function tapAt(engine, x = 500, y = 400, type = 'touch') {
  const el = engine.renderer.domElement;
  tapT += 1000;
  el.fire('pointerdown', { pointerId: 7, pointerType: type, button: 0, clientX: x, clientY: y, timeStamp: tapT });
  el.fire('pointerup', { pointerId: 7, pointerType: type, button: 0, clientX: x, clientY: y, timeStamp: tapT + 80 });
}
/** 走到停下（没有路了、而且不再动） */
async function settle(engine, ctl, secs = 60) {
  let last = null;
  let still = 0;
  const end = clock + secs * 1000;
  while (clock < end) {
    ticks(engine, 0.25);
    await null;
    const p = ctl.pose();
    const same = last && Math.hypot(p.x - last.x, p.z - last.z) < 1e-9 && Math.abs(p.yaw - last.yaw) < 1e-9 && p.fi === last.fi;
    still = same ? still + 1 : 0;
    last = p;
    if (still >= 4) return p;
  }
  throw new Error(`${secs} 秒还没停下`);
}

await test('点一下按工具分：刷颜色 → pick（这一面的 slot、现在的材质；固定的 → null）、地板 → 这个房间的地面（厨房 = 砖）、家具 → item、量尺 → 两下一条线（第一下点到墙 = 墙的长和高）', async () => {
  const { engine, ctl, events, nd, project } = await walkIn('condo3');
  const last = (evt) => of(events, evt).at(-1);
  assert.deepEqual(TOOLS, ['walk', 'paint', 'floor', 'furnish', 'light', 'measure', 'photo']);
  ctl.setTool('paint');
  engine.pick = () => hitOf({ x: 1.07, y: 0.9, z: 0.7 }, { slot: 'cabinetry' });
  tapAt(engine);
  let pk = last('pick');
  assert.equal(pk.slot, 'cabinetry');
  assert.equal(pk.matId, project.materials.cabinetry);
  assert.equal(pk.room?.id, 'kit');
  assert.ok(pk.hit?.point, '带着点到的那一下');
  engine.pick = () => hitOf({ x: 0, y: 1.2, z: 5 }, { slot: 'walls', fixed: 'exterior' });
  tapAt(engine);
  pk = last('pick');
  assert.equal(pk.slot, null, '外墙不能换');
  assert.equal(pk.matId, null);
  // 地板：点到哪个房间就换哪个房间的地面
  ctl.setTool('floor');
  engine.pick = () => hitOf({ x: 1.5, y: 0, z: 2 }, { slot: 'tile' });
  tapAt(engine);
  assert.equal(last('pick').slot, floorSlotOf('kitchen'));
  assert.equal(last('pick').slot, 'tile');
  engine.pick = () => hitOf({ x: 2, y: 0, z: 4 }, { slot: 'floor' });
  tapAt(engine);
  assert.equal(last('pick').slot, 'floor');
  assert.equal(last('pick').matId, project.materials.floor);
  assert.equal(last('pick').room.id, 'liv');
  // 家具
  ctl.setTool('furnish');
  engine.pick = () => hitOf({ x: 2.85, y: 0.4, z: 5.85 }, { slot: 'upholstery', itemId: 'fkmuezz' });
  tapAt(engine);
  assert.deepEqual(last('item'), { id: 'fkmuezz' });
  engine.pick = () => null;
  tapAt(engine);
  assert.deepEqual(last('item'), { id: null });
  // 量尺：第一下点到客厅的西墙（x = 0）→ 墙的长和高；第二下 → 两点的距离
  ctl.setTool('measure');
  const w = nd.floors[0].walls.find((q) => q.axis === 'z' && q.c === 0 && q.a <= 5 && q.b >= 5);
  const a = { x: w.c + w.t / 2, y: 1.2, z: 5 };
  engine.pick = () => hitOf(a);
  tapAt(engine);
  let m = last('measure');
  assert.deepEqual(m.a, a);
  assert.equal(m.b, null);
  assert.equal(m.wall.lengthMm, Math.round((w.b - w.a) * 100) * 10);
  assert.equal(m.wall.heightMm, Math.round(nd.floors[0].ceil * 100) * 10);
  assert.ok(m.wall.text.length > 0);
  const b = { x: 3.1, y: 0, z: 5.5 };
  engine.pick = () => hitOf(b, { slot: 'floor' });
  tapAt(engine);
  m = last('measure');
  assert.deepEqual([m.a, m.b], [a, b]);
  assert.equal(m.mm, Math.round(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 100) * 10);
  assert.ok(m.text.length > 0);
  assert.equal(m.wall, null);
  // 第三下 = 重新开始（点在地板上：没有墙）
  tapAt(engine);
  assert.equal(last('measure').b, null);
  assert.equal(last('measure').wall, null);
  ctl.clearMeasure();
  assert.deepEqual(last('measure'), { a: null, b: null, mm: null, text: null, wall: null });
  // 量尺工具没有走
  assert.equal(of(events, 'pose').length, 1, '刷颜色 / 地板 / 家具 / 量尺都不走路');
  ctl.dispose();
});

await test('走路工具（灯光、拍照也是）：点地板 → 走到最近的走得到的点；点墙 → 停在墙前面（镜头这一边）；拖动不算点', async () => {
  for (const tool of ['walk', 'light', 'photo']) {
    const { engine, ctl, events } = await walkIn('condo3');
    ctl.setTool(tool);
    const goal = { x: 1.6, z: 4.2 };
    engine.pick = () => hitOf({ x: goal.x, y: 0, z: goal.z }, { slot: 'floor' });
    tapAt(engine);
    const want = N.nearest(ctl.nav, { fi: 0, ...goal });
    const p = await settle(engine, ctl);
    assert.ok(Math.hypot(p.x - want.x, p.z - want.z) < 1e-6, `${tool}：走到了（${p.x}, ${p.z}）`);
    assert.ok(N.passable(ctl.nav, p));
    assert.ok(of(events, 'pose').length > 2, `${tool}：一路发 pose`);
    ctl.dispose();
  }
  // 点到客厅的西墙（1.2m 高）：停在墙前面，从墙那里往镜头退回来的第一个走得过去的点附近
  const { engine, ctl, nd } = await walkIn('condo3');
  const w = nd.floors[0].walls.find((q) => q.axis === 'z' && q.c === 0 && q.a <= 4 && q.b >= 4);
  engine.pick = () => hitOf({ x: w.c + w.t / 2, y: 1.2, z: 4 });
  tapAt(engine);
  const p = await settle(engine, ctl);
  assert.ok(p.x > w.c && p.x < w.c + 0.6, `墙前面（x = ${p.x}）`);
  assert.ok(Math.abs(p.z - 4) < 0.6, `正对着点到的地方（z = ${p.z}）`);
  // 拖动（超过 9px）= 转头，不走
  const before = ctl.pose();
  const el = engine.renderer.domElement;
  el.fire('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 400, clientY: 400, timeStamp: 1 });
  el.fire('pointermove', { pointerId: 3, pointerType: 'touch', clientX: 500, clientY: 400, timeStamp: 30 });
  el.fire('pointerup', { pointerId: 3, pointerType: 'touch', clientX: 500, clientY: 400, timeStamp: 60 });
  ticks(engine, 0.5);
  const after = ctl.pose();
  assert.equal(after.x, before.x);
  assert.equal(after.z, before.z);
  assert.ok(after.yaw !== before.yaw, '转了头');
  ctl.dispose();
});

await test('点到楼梯 → 去楼梯另一头的那一层（semid2：楼下点梯段 → 上楼；楼上点楼梯洞 → 下楼）', async () => {
  const { engine, ctl, nd } = await walkIn('semid2');
  const link = ctl.nav.stairs[0];
  // 楼梯间（一楼的梯段）里、半高的一点
  engine.pick = () => hitOf({ x: 1.8, y: 1.2, z: 5.2 }, { slot: 'woodwork' });
  tapAt(engine);
  let p = await settle(engine, ctl, 120);
  assert.equal(p.fi, 1, '上楼了');
  const up = N.nearest(ctl.nav, { fi: 1, ...link.exit });
  assert.ok(Math.hypot(p.x - up.x, p.z - up.z) < 1e-6);
  // 楼上：往下看楼梯洞，点到一楼的梯段
  engine.pick = () => hitOf({ x: 1.8, y: nd.floors[0].elev + 0.6, z: 5.2 }, { slot: 'woodwork' });
  tapAt(engine);
  p = await settle(engine, ctl, 120);
  assert.equal(p.fi, 0, '下楼了');
  const down = N.nearest(ctl.nav, { fi: 0, ...link.entry });
  assert.ok(Math.hypot(p.x - down.x, p.z - down.z) < 1e-6);
  ctl.dispose();
});

// ───────────────────────── 摇杆 ─────────────────────────

await test('摇杆一步（slideMove）：随便怎么推，永远不走进走不过去的格子、不比要的走得多；斜着推墙 → 贴着墙滑', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const name of ['condo3', 'semid2']) {
    const pr = PROJ[name];
    const nav = N.buildNav(N.navDataOf(pr.plan), pr.furniture);
    const out = { x: 0, z: 0, moved: false };
    for (let run = 0; run < 8; run++) {
      const p = { ...nav.start };
      for (let i = 0; i < 1500; i++) {
        const a = rnd() * Math.PI * 2;
        const len = 0.01 + rnd() * 0.32;
        slideMove(nav, p, Math.cos(a) * len, Math.sin(a) * len, out);
        assert.ok(Math.hypot(out.x - p.x, out.z - p.z) <= len + 1e-9, '不比要的走得多');
        p.x = out.x;
        p.z = out.z;
        assert.ok(N.passable(nav, p), `${name}：第 ${i} 步走进了走不过去的地方（${p.x}, ${p.z}）`);
      }
    }
  }
  // condo3 客厅的西墙（x = 0）：斜着往墙里推 → x 停在墙前、z 一直往前
  const nav = N.buildNav(N.navDataOf(PROJ.condo3.plan), PROJ.condo3.furniture);
  const p = N.nearest(nav, { fi: 0, x: 0.6, z: 3.8 });
  const out = { x: 0, z: 0, moved: false };
  const x0 = p.x;
  const z0 = p.z;
  for (let i = 0; i < 40; i++) {
    slideMove(nav, p, -0.03, 0.03, out);
    p.x = out.x;
    p.z = out.z;
  }
  assert.ok(N.passable(nav, p));
  assert.ok(p.x < x0 && p.x > 0.2, `贴到墙前（x = ${p.x}）`);
  assert.ok(p.z - z0 > 0.6, `沿着墙滑过去了（z ${z0} → ${p.z}）`);
});

await test('摇杆一步（slideMove）+ 别的障碍（block.clearOf，门扇）：推着往一块薄板上走 → 停在离它一个半径的地方、斜着推 → 贴着它滑；本来就贴得太近只许往外挪', () => {
  const pr = PROJ.condo3;
  const nav = N.buildNav(N.navDataOf(pr.plan), pr.furniture);
  // condo3 客厅 / 餐厅之间空的那一块里一块横着的薄板（像开着的门扇）：x 4.5–5.3、z = 3.4
  const seg = [4.5, 3.4, 5.3, 3.4];
  const segDist = (x, z) => Math.hypot(x - Math.min(seg[2], Math.max(seg[0], x)), z - seg[1]);
  let calls = 0;
  const block = {
    clearOf(fi, x, z) {
      calls++;
      return fi === 0 ? segDist(x, z) - 0.02 : Infinity;
    },
  };
  const start = { fi: 0, x: 4.9, z: 4.4 };
  assert.ok(N.passable(nav, start) && N.passable(nav, { fi: 0, x: 4.9, z: 2.9 }), '例子：板子两边都走得过去');
  const out = { x: 0, z: 0, moved: false };
  // 正对着推（−z）：停在板子前面一个半径（门板 2cm 厚算进去）
  const p = { ...start };
  for (let i = 0; i < 60; i++) {
    slideMove(nav, p, 0, -0.03, out, block);
    p.x = out.x;
    p.z = out.z;
  }
  assert.ok(calls > 0, '问了 block');
  assert.ok(block.clearOf(0, p.x, p.z) >= nav.radius - 1e-6, `进了门扇的半径（离它 ${block.clearOf(0, p.x, p.z)}）`);
  assert.ok(block.clearOf(0, p.x, p.z) < nav.radius + 0.04 && Math.abs(p.x - 4.9) < 1e-9, `停在门扇前（z = ${p.z}）`);
  // 没有 block：直直穿过去（和以前一样）
  const q = { ...start };
  for (let i = 0; i < 60; i++) {
    slideMove(nav, q, 0, -0.03, out);
    q.x = out.x;
    q.z = out.z;
  }
  assert.ok(q.z < 3.1, `没有 block 的话穿过去了（z = ${q.z}）`);
  // 斜着推（−z 和 +x）：贴着板子往 +x 滑，过了板子的那一头再往前
  const r = { ...start };
  let minC = Infinity;
  for (let i = 0; i < 60; i++) {
    slideMove(nav, r, 0.015, -0.03, out, block);
    r.x = out.x;
    r.z = out.z;
    minC = Math.min(minC, block.clearOf(0, r.x, r.z));
  }
  assert.ok(minC >= nav.radius - 1e-6, `贴着滑也没进半径（最近 ${minC}）`);
  assert.ok(r.x > 5.3 && r.z < 3.4, `滑过了板子那一头（${r.x}, ${r.z}）`);
  // 本来就贴得太近（门扇转过来了）：往里走不动、往外可以
  const t = { fi: 0, x: 4.9, z: 3.55 };
  slideMove(nav, t, 0, -0.05, out, block);
  assert.equal(out.moved, false, '往门扇里走不动');
  slideMove(nav, t, 0, 0.05, out, block);
  assert.ok(out.moved && out.z > t.z, '往外挪得动');
});

await test('摇杆把开着的门扇当墙（真的门，condo3 卫生间门开在走廊里）：在门扇和门洞之间往门扇上推 → 停在门扇前、门扇不动（转过去会扫到人）；从门扇后面推 → 门扇转到另一边（离人远）、人走过去；关着的门不挡', async () => {
  const { engine, ctl, nd } = await walkIn('condo3');
  const doors = ctl.doors;
  const nav = ctl.nav;
  const L = doors.leaves.find((x) => x.id === '0/w26/1');
  assert.ok(L && L.axis === 'x', '卫生间门（x 向的墙）');
  const s = -1; // 走廊那一边
  const at = (u, v) => (L.axis === 'x' ? { x: u, z: L.c + s * v } : { x: L.c + s * v, z: u });
  const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
  const floor = nd.floors[L.fi].id;
  const leafGap = () => doors.clearOf(L.fi, ctl.pose().x, ctl.pose().z);
  const openToCorridor = () => {
    L.target = 0;
    L.s = 0;
    assert.equal(doors.open(L.opening, { fi: L.fi, from: at((L.a + L.b) / 2, -1), instant: true }), true);
    assert.equal(L.s, s, '门扇开在走廊里');
  };
  // ① 在门扇和门洞之间（门扇转回去会扫过的地方），朝着门扇推
  openToCorridor();
  const p = at(L.a + 0.56, 0.5);
  assert.equal(await ctl.goto({ floor, x: p.x, z: p.z, yaw: yawTo(-1, 0), pitch: 0 }), true);
  assert.ok(Math.abs(ctl.pose().x - p.x) < 1e-9, '站好了');
  let minGap = Infinity;
  ctl.joystick(0, 1);
  ticks(engine, 2, { until: () => void (minGap = Math.min(minGap, leafGap())) });
  ctl.joystick(0, 0);
  ticks(engine, 0.5);
  const q = ctl.pose();
  assert.ok(minGap >= nav.radius - 1e-6, `一路离门扇 ≥ 半径（最近 ${minGap.toFixed(3)}）`);
  assert.ok(q.x < p.x - 0.2 && leafGap() < nav.radius + 0.04, `走到门扇前停下（x ${p.x.toFixed(2)} → ${q.x.toFixed(2)}，离门扇 ${leafGap().toFixed(3)}）`);
  assert.ok(L.s === s && L.target === s, '门扇不动（人在它转过去会扫到的地方）');
  // ② 从门扇后面（走廊里、门轴那一头）沿着走廊推过去：门扇转到卫生间那一边，人走过去，一路不进门扇
  openToCorridor();
  const b = at(L.a - 0.6, 0.5);
  assert.equal(await ctl.goto({ floor, x: b.x, z: b.z, yaw: yawTo(1, 0), pitch: 0 }), true);
  minGap = Infinity;
  ctl.joystick(0, 1);
  ticks(engine, 3, { until: () => void (minGap = Math.min(minGap, leafGap())) });
  ctl.joystick(0, 0);
  ticks(engine, 0.5);
  assert.equal(L.target, -s, '门扇转到卫生间那一边（离人远）');
  assert.ok(minGap >= nav.radius - 1e-6, `一路离门扇 ≥ 半径（最近 ${minGap.toFixed(3)}）`);
  assert.ok(ctl.pose().x > L.a + 0.3, `沿着走廊走过了门（x = ${ctl.pose().x.toFixed(2)}）`);
  // ③ 关着的门不挡（门洞整个走得过去）：都关上 → clearOf = Infinity
  for (const D of doors.leaves) [D.s, D.target] = [0, 0];
  assert.equal(doors.clearOf(L.fi, b.x, b.z), Infinity);
  ctl.dispose();
});

await test('摇杆（按看的方向走，y > 0 = 往前）、WASD / 方向键、Q / E 转身；在输入框里打字不算；客人一动带逛就停', async () => {
  const { engine, ctl } = await walkIn('semid2');
  const p0 = ctl.pose();
  ctl.joystick(0, 1);
  ticks(engine, 0.6);
  ctl.joystick(0, 0);
  ticks(engine, 0.5);
  const p1 = ctl.pose();
  const d = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  assert.ok(d > 0.4 && d < SPEED * 1.2, `往前走了 ${d}m`);
  const dir = { x: (p1.x - p0.x) / d, z: (p1.z - p0.z) / d };
  assert.ok(dir.x * -Math.sin(p0.yaw) + dir.z * -Math.cos(p0.yaw) > 0.98, '朝着看的方向');
  ticks(engine, 0.5);
  assert.deepEqual(ctl.pose(), p1, '放开就停');
  // 往右：x > 0
  ctl.joystick(1, 0);
  ticks(engine, 0.4);
  ctl.joystick(0, 0);
  ticks(engine, 0.5);
  const p2 = ctl.pose();
  const r = { x: Math.cos(p1.yaw), z: -Math.sin(p1.yaw) };
  assert.ok((p2.x - p1.x) * r.x + (p2.z - p1.z) * r.z > 0.15, '往右');
  // 键盘：W 往前；在输入框里不算；Q 转身
  window.fire('keydown', { code: 'KeyW', key: 'w', target: { tagName: 'INPUT' } });
  ticks(engine, 0.4);
  assert.deepEqual(ctl.pose(), p2, '在输入框里打字不走');
  window.fire('keydown', { code: 'KeyW', key: 'w', target: { tagName: 'DIV' } });
  ticks(engine, 0.4);
  window.fire('keyup', { code: 'KeyW', key: 'w' });
  ticks(engine, 0.5);
  const p3 = ctl.pose();
  assert.ok((p3.x - p2.x) * -Math.sin(p2.yaw) + (p3.z - p2.z) * -Math.cos(p2.yaw) > 0.2, 'W 往前');
  window.fire('keydown', { code: 'KeyQ', key: 'q', target: null });
  ticks(engine, 0.5);
  window.fire('keyup', { code: 'KeyQ', key: 'q' });
  const p4 = ctl.pose();
  assert.ok(angleDiff(p4.yaw, p3.yaw) > 0.5, 'Q 往左转');
  assert.equal(p4.x, p3.x);
  ctl.dispose();
});

// ───────────────────────── 楼梯、家具只画这一层 ─────────────────────────

await test('楼梯（semid2 一楼 → 二楼主卧）：眼睛在楼梯折线上（出发那层地面 + y + 1.55）、走过一半的高度才换楼层（instant + quiet），换完家具照规则藏', async () => {
  const { engine, ctl, events, nd } = await walkIn('semid2');
  const goal = { fi: 1, x: 2.9, z: 12.4 };
  const from = ctl.pose();
  const route = N.path(ctl.nav, { fi: from.fi, x: from.x, z: from.z }, goal);
  const stairLeg = route.legs.find((l) => l.kind === 'stair');
  assert.ok(stairLeg && stairLeg.from === 0 && stairLeg.to === 1);
  const rise = stairLeg.pts.at(-1).y;
  const e0 = nd.floors[0].elev;
  const e1 = nd.floors[1].elev;
  const poly = stairLeg.pts.map((q) => new THREE.Vector3(q.x, e0 + q.y + EYE, q.z));
  const onPoly = (v) => {
    let best = Infinity;
    const seg = new THREE.Line3();
    const c = new THREE.Vector3();
    for (let i = 1; i < poly.length; i++) {
      seg.set(poly[i - 1], poly[i]);
      seg.closestPointToPoint(v, true, c);
      best = Math.min(best, c.distanceTo(v));
    }
    return best;
  };
  const samples = [];
  const p = ctl.walkTo(goal);
  let done = false;
  p.then(() => (done = true));
  const end = clock + 120e3;
  while (!done && clock < end) {
    ticks(engine, 0.016, { step: 16 });
    samples.push({ fi: ctl.pose().fi, pos: engine.camera.position.clone(), furn: engine.floors.map((F) => F.furn.visible), mask: furnitureMask(nd, ctl.pose().fi, ctl.pose().x, ctl.pose().z) });
    await null;
  }
  assert.equal(await p, true, 'walkTo 到了 → true');
  const k = samples.findIndex((s) => s.fi === 1);
  assert.ok(k > 0, '换到二楼了');
  const h = (s) => s.pos.y - e0 - EYE;
  assert.ok(h(samples[k - 1]) < rise / 2 && h(samples[k]) >= rise / 2 - 1e-9, `走过一半的高度才换（${h(samples[k - 1])} → ${h(samples[k])}，一半 = ${rise / 2}）`);
  assert.ok(engine.log.includes('setFloorView:ff:true:true'), '换楼层是 instant + quiet');
  assert.deepEqual(of(events, 'floor').at(-1), { fi: 1, id: 'ff' });
  // 楼梯上的每一帧：眼睛就在楼梯折线上（出发那层地面 + y + 1.55），只往上
  let prevY = -Infinity;
  let onStairs = 0;
  for (const s of samples) {
    if (s.pos.y > e0 + EYE + 1e-6 && s.pos.y < e1 + EYE - 1e-6) {
      onStairs++;
      assert.ok(onPoly(s.pos) < 1e-6, `楼梯上的眼睛不在折线上（${onPoly(s.pos)}）`);
    }
    assert.ok(s.pos.y >= prevY - 1e-9, '上楼只往上');
    prevY = s.pos.y;
    // 每一帧：画的家具 = 规则
    s.furn.forEach((vis, i) => assert.equal(vis, !!(s.mask & (1 << i)), `第 ${i} 层的家具（掩码 ${s.mask}）`));
  }
  assert.ok(onStairs > 20, '楼梯上走了好几帧');
  const fin = ctl.pose();
  assert.equal(fin.fi, 1);
  assert.ok(Math.abs(engine.camera.position.y - (e1 + EYE)) < 1e-9, '二楼的眼睛高度');
  assert.deepEqual(engine.floors.map((F) => F.furn.visible), [false, true], '主卧离楼梯洞远：只画二楼的家具');
  ctl.dispose();
});

await test('没给朝向、换了楼层（上楼）：到了转向这个房间的中间，不是朝着最后一段路（常常是空墙）；同一层走不转', async () => {
  const { engine, ctl } = await walkIn('semid2');
  const room = N.roomAt(ctl.nav, { fi: 1, x: 2.9, z: 12.4 });
  assert.ok(room, '二楼主卧');
  // 主卧里离中间远的一角（往里 0.7m），走得到的最近一点
  const goal = N.nearest(ctl.nav, { fi: 1, x: room.x + 0.7, z: room.y + room.d - 0.7 });
  const p = ctl.walkTo(goal);
  let done = false;
  p.then(() => (done = true));
  const end = clock + 120e3;
  while (!done && clock < end) {
    ticks(engine, 0.016, { step: 16 });
    await null;
  }
  assert.equal(await p, true);
  const fin = ctl.pose();
  assert.equal(fin.fi, 1);
  const cx = room.x + room.w / 2 - fin.x;
  const cz = room.y + room.d / 2 - fin.z;
  assert.ok(cx * cx + cz * cz >= 0.36, '离房间中间够远');
  assert.ok(Math.abs(angleDiff(fin.yaw, Math.atan2(-cx, -cz))) < 0.02, `朝房间中间（yaw ${fin.yaw}）`);
  assert.ok(Math.abs(fin.pitch) < 0.02, '平视');
  // 同一层走过去：不转（还是朝着走的方向）
  const here = ctl.pose();
  const g2 = N.nearest(ctl.nav, { fi: 1, x: room.x + room.w - 0.7, z: room.y + 0.7 });
  const q = ctl.walkTo(g2);
  let d2 = false;
  q.then(() => (d2 = true));
  const end2 = clock + 120e3;
  while (!d2 && clock < end2) {
    ticks(engine, 0.016, { step: 16 });
    await null;
  }
  assert.equal(await q, true);
  const f2 = ctl.pose();
  const room2 = N.roomAt(ctl.nav, { fi: 1, x: f2.x, z: f2.z });
  const c2x = room2.x + room2.w / 2 - f2.x;
  const c2z = room2.y + room2.d / 2 - f2.z;
  assert.ok(Math.hypot(f2.x - here.x, f2.z - here.z) > 1, '走了一段');
  assert.ok(c2x * c2x + c2z * c2z < 0.36 || Math.abs(angleDiff(f2.yaw, Math.atan2(-c2x, -c2z))) > 0.02, '同一层：不特地转向房间中间');
  ctl.dispose();
});

// ───────────────────────── 沿路走：看沿着路往前一点（拐弯之前就转过去） ─────────────────────────

const yawOf = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z));
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** 一帧一帧跑（16ms），每帧 onFrame(pose)，Promise settle 了就停 → 结果 */
async function walkFrames(engine, ctl, promise, onFrame, secs = 60) {
  let done = false;
  let val;
  promise.then((v) => {
    done = true;
    val = v;
  });
  const end = clock + secs * 1000;
  while (!done && clock < end) {
    clock += 16;
    engine.onTick(clock);
    onFrame?.(ctl.pose());
    await null;
  }
  assert.ok(done, `${secs} 秒还没完`);
  return val;
}
/** semid2 二楼：公卫 → 卧室 4 的路是一个 L（先往南走 6m 多，再往东拐约 66°）。站到起点、朝着第一段 → { ctl, engine, pts, goal } */
async function lRoute() {
  const w = await walkIn('semid2');
  const { ctl, nd } = w;
  const centre = (id) => {
    const r = nd.floors[1].rooms.find((q) => q.id === id);
    return N.nearest(ctl.nav, { fi: 1, x: r.x + r.w / 2, z: r.y + r.d / 2 });
  };
  const a = centre('f-cbth');
  const goal = centre('f-bd4');
  const pts0 = N.path(ctl.nav, a, goal).legs[0].pts;
  assert.equal(await ctl.goto({ floor: nd.floors[1].id, x: a.x, z: a.z, yaw: yawOf(pts0[0], pts0[1]), pitch: 0, hour: w.engine.time }), true);
  const p = ctl.pose();
  const route = N.path(ctl.nav, { fi: 1, x: p.x, z: p.z }, goal);
  assert.equal(route.legs.length, 1);
  const pts = route.legs[0].pts;
  assert.equal(pts.length, 3, '一个 L：两段');
  assert.ok(Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z) > 4 && Math.hypot(pts[2].x - pts[1].x, pts[2].z - pts[1].z) > 1.5, '两段都够长');
  assert.ok(Math.abs(angleDiff(yawOf(pts[1], pts[2]), yawOf(pts[0], pts[1]))) > 0.8, '拐得够多');
  return { ...w, pts, goal };
}
/** 离折线多远（只算水平） */
function offPath(pts, p) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const ux = b.x - a.x;
    const uz = b.z - a.z;
    const L2 = ux * ux + uz * uz || 1;
    const t = clamp01(((p.x - a.x) * ux + (p.z - a.z) * uz) / L2);
    best = Math.min(best, Math.hypot(a.x + ux * t - p.x, a.z + uz * t - p.z));
  }
  return best;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

await test('沿路走：L 形的路，走到拐角之前头就开始往第二段转（看沿着路往前 1.5m 的那一点）；脚下的路一点不变；看的方向和走的方向差得多就慢下来，不横着快走；最后看着最后一段', async () => {
  const { engine, ctl, pts, goal } = await lRoute();
  const [p0, c, p2] = pts;
  const y1 = yawOf(p0, c);
  const y2 = yawOf(c, p2);
  const sgn = Math.sign(angleDiff(y2, y1));
  const l1 = Math.hypot(c.x - p0.x, c.z - p0.z);
  let first = null; // 头往第二段转过 0.15 的第一帧：离拐角还有多远
  let atCorner = null; // 走到拐角那一帧：头已经转了多少
  let maxOff = 0;
  let prev = ctl.pose();
  let crab = 0;
  const ok = await walkFrames(engine, ctl, ctl.walkTo(goal), (q) => {
    maxOff = Math.max(maxOff, offPath(pts, q));
    // 还在第一段上：离拐角多远
    const t = ((q.x - p0.x) * (c.x - p0.x) + (q.z - p0.z) * (c.z - p0.z)) / (l1 * l1);
    const onFirst = t < 1 - 1e-9 && Math.hypot(p0.x + (c.x - p0.x) * t - q.x, p0.z + (c.z - p0.z) * t - q.z) < 1e-6;
    const dev = angleDiff(q.yaw, y1) * sgn;
    if (onFirst && dev > 0.15 && !first) first = { left: (1 - t) * l1, dev };
    if (!onFirst && !atCorner) atCorner = { dev };
    // 不横着快走：这一帧走的方向和看的方向差 70° 以上 → 速度 < 0.75 × SPEED
    const mx = q.x - prev.x;
    const mz = q.z - prev.z;
    const v = Math.hypot(mx, mz) / 0.016;
    if (v > 1e-3 && Math.abs(angleDiff(Math.atan2(-mx, -mz), q.yaw)) > (70 * Math.PI) / 180 && v > 0.75 * SPEED) crab++;
    prev = q;
  });
  assert.equal(ok, true, '走到了');
  assert.ok(maxOff < 1e-6, `脚下的路不变（离 A* 的折线最远 ${maxOff}）`);
  assert.ok(first, '在第一段上头就开始往第二段转');
  assert.ok(first.left > 0.6, `离拐角还有 ${first.left.toFixed(2)}m 就开始转（不是走到拐角才转）`);
  assert.ok(atCorner && atCorner.dev > 0.4, `走到拐角时头已经转了 ${atCorner?.dev.toFixed(2)}（整个拐角 ${Math.abs(angleDiff(y2, y1)).toFixed(2)}）`);
  assert.equal(crab, 0, '没有横着快走的帧');
  const fin = ctl.pose();
  assert.ok(Math.hypot(fin.x - goal.x, fin.z - goal.z) < 1e-6, '停在终点');
  assert.ok(Math.abs(angleDiff(fin.yaw, y2)) < 0.02, `最后看着最后一段（差 ${angleDiff(fin.yaw, y2).toFixed(3)}）`);
  ctl.dispose();
});

await test('沿路走：给了朝向的路（同一层 L 形、上楼）到了一样准准地转到那个朝向（yaw 一点不差、平视）', async () => {
  const { engine, ctl, pts, goal } = await lRoute();
  const want = wrapPi(yawOf(pts[1], pts[2]) + 2);
  assert.equal(await walkFrames(engine, ctl, ctl.walkTo({ ...goal, yaw: want })), true);
  let fin = ctl.pose();
  assert.ok(Math.hypot(fin.x - goal.x, fin.z - goal.z) < 1e-6, '停在终点');
  assert.ok(Math.abs(angleDiff(fin.yaw, want)) < 1e-9, `转到给的朝向（差 ${angleDiff(fin.yaw, want)}）`);
  assert.equal(fin.pitch, 0);
  // 下楼（经过楼梯：看的那一点沿着楼梯、再接着楼下那一段）→ 一样准
  const down = N.nearest(ctl.nav, { fi: 0, x: 4.8, z: 12.4 });
  const want2 = -2.5;
  assert.equal(await walkFrames(engine, ctl, ctl.walkTo({ ...down, yaw: want2 }), null, 120), true);
  fin = ctl.pose();
  assert.equal(fin.fi, 0, '到了楼下');
  assert.ok(Math.hypot(fin.x - down.x, fin.z - down.z) < 1e-6, '停在终点');
  assert.ok(Math.abs(angleDiff(fin.yaw, want2)) < 1e-9, `转到给的朝向（差 ${angleDiff(fin.yaw, want2)}）`);
  assert.equal(fin.pitch, 0);
  ctl.dispose();
});

await test('沿路走：客人拖着转了头（R.free）→ 不再自动转头（拐弯也不转、到了也不转到给的朝向），照样按路走到、速度不打折', async () => {
  const { engine, ctl, pts, goal } = await lRoute();
  const el = engine.renderer.domElement;
  const p = ctl.walkTo({ ...goal, yaw: wrapPi(yawOf(pts[1], pts[2]) + 2) });
  let settled = false;
  p.then(() => (settled = true));
  for (let i = 0; i < 40; i++) {
    clock += 16;
    engine.onTick(clock);
  }
  assert.equal(settled, false, '还在第一段上走着');
  el.fire('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: 400, clientY: 400, timeStamp: 1 });
  el.fire('pointermove', { pointerId: 7, pointerType: 'touch', clientX: 330, clientY: 380, timeStamp: 30 });
  el.fire('pointerup', { pointerId: 7, pointerType: 'touch', clientX: 330, clientY: 380, timeStamp: 60 });
  const held = ctl.pose();
  assert.ok(Math.abs(angleDiff(held.yaw, yawOf(pts[0], pts[1]))) > 0.05, '拖着转了头');
  const [, c, p2] = pts;
  const l2 = Math.hypot(p2.x - c.x, p2.z - c.z);
  let turned = 0;
  let maxOff = 0;
  let prev = held;
  let vMax = 0; // 第二段上（看的方向和走的方向差一个拐角）最快多快
  const ok = await walkFrames(engine, ctl, p, (q) => {
    if (q.yaw !== held.yaw || q.pitch !== held.pitch) turned++;
    maxOff = Math.max(maxOff, offPath(pts, q));
    const t = ((q.x - c.x) * (p2.x - c.x) + (q.z - c.z) * (p2.z - c.z)) / (l2 * l2);
    const pt = ((prev.x - c.x) * (p2.x - c.x) + (prev.z - c.z) * (p2.z - c.z)) / (l2 * l2);
    if (pt > 1e-9 && t < 1 && Math.hypot(c.x + (p2.x - c.x) * t - q.x, c.z + (p2.z - c.z) * t - q.z) < 1e-6) vMax = Math.max(vMax, Math.hypot(q.x - prev.x, q.z - prev.z) / 0.016);
    prev = q;
  });
  assert.equal(ok, true, '照样走到了（拖着看不算打断）');
  assert.equal(turned, 0, '拖过以后一帧也没自动转头');
  assert.ok(maxOff < 1e-6, '照样按路走');
  assert.ok(Math.abs(angleDiff(held.yaw, yawOf(c, p2))) > 0.8, '第二段上看的方向和走的方向差得多');
  assert.ok(vMax > 0.95 * SPEED, `客人自己看着别处：不减速（第二段上最快 ${vMax.toFixed(2)} m/s）`);
  const fin = ctl.pose();
  assert.ok(Math.hypot(fin.x - goal.x, fin.z - goal.z) < 1e-6, '停在终点');
  assert.equal(fin.yaw, held.yaw, '到了也不转到给的朝向');
  ctl.dispose();
});

await test('家具只画人在的这一层（furnitureMask）：楼梯 / 挑空 3m 以内加上下层；floorAtY', () => {
  const nd = N.navDataOf(PROJ.semid2.plan);
  assert.equal(furnitureMask(nd, 0, 5, 12.4), 0b01, '一楼客厅：只画一楼');
  assert.equal(furnitureMask(nd, 0, 1.8, 7.5), 0b11, '一楼、楼梯旁边：楼上也画');
  assert.equal(furnitureMask(nd, 1, 2.9, 12.4), 0b10, '二楼主卧：只画二楼');
  assert.equal(furnitureMask(nd, 1, 1.8, 8.2), 0b11, '二楼、楼梯洞旁边：楼下也画');
  assert.equal(furnitureMask(nd, 0, 1.8, 6.4 + 3.01), 0b01, '刚好 3m 外');
  const c3 = N.navDataOf(PROJ.condo3.plan);
  assert.equal(furnitureMask(c3, 0, 3, 5), 0b1, '单层');
  assert.equal(floorAtY(nd.floors, 0), 0);
  assert.equal(floorAtY(nd.floors, 2.9), 0, '一楼的天花');
  assert.equal(floorAtY(nd.floors, nd.floors[1].elev), 1, '二楼的地面');
  assert.equal(floorAtY(nd.floors, nd.floors[1].elev - 0.05), 1, '比二楼地面低一点点（地毯、误差）');
  assert.equal(floorAtY(nd.floors, -0.5), 0);
});

// ───────────────────────── 拍照 / 跳回去 ─────────────────────────

await test('photo() 的形状（给 addMark）；goto(mark)：换楼层、站到最近的走得到的点、朝向、几点钟也回去', async () => {
  const { engine, ctl, events, nd } = await walkIn('semid2');
  const ph = ctl.photo();
  assert.deepEqual(Object.keys(ph).sort(), ['floor', 'hour', 'pitch', 'room', 'x', 'yaw', 'z']);
  assert.equal(ph.floor, 'gf');
  assert.equal(ph.hour, engine.time);
  const pose = ctl.pose();
  assert.equal(ph.room, pose.room);
  assert.ok(typeof ph.room === 'string', '房间 id');
  const marks = addMark([], ph);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].floor, 'gf');
  assert.equal(marks[0].room, ph.room);
  const mark = { id: 'm1', floor: 'ff', x: 2.9, z: 12.4, yaw: 1, pitch: -0.2, hour: 20.5, room: 'f-mst' };
  assert.equal(await ctl.goto(mark), true);
  const p = ctl.pose();
  assert.equal(p.fi, 1);
  assert.equal(p.floor, 'ff');
  const want = N.nearest(ctl.nav, { fi: 1, x: 2.9, z: 12.4 });
  assert.ok(Math.hypot(p.x - want.x, p.z - want.z) < 1e-9);
  assert.ok(Math.abs(p.yaw - 1) < 1e-9 && Math.abs(p.pitch + 0.2) < 1e-9);
  assert.equal(p.room, 'f-mst');
  assert.ok(Math.abs(engine.camera.position.y - (nd.floors[1].elev + EYE)) < 1e-9);
  assert.ok(engine.log.includes('setFloorView:ff:true:true'));
  assert.deepEqual(engine.floors.map((F) => F.furn.visible), [false, true]);
  assert.deepEqual(of(events, 'floor').at(-1), { fi: 1, id: 'ff' });
  assert.equal(await ctl.goto({ ...mark, floor: 'nope' }), false, '没有这一层');
  ctl.dispose();
});

await test('goto 的几点钟走 api.setTime；一样的时间不调', async () => {
  const { engine, ctl, api } = await walkIn('condo3');
  const ph = ctl.photo();
  await ctl.goto({ ...ph, id: 'a' });
  assert.deepEqual(api.times, []);
  await ctl.goto({ ...ph, id: 'b', hour: 21 });
  assert.deepEqual(api.times, [21]);
  void engine;
  ctl.dispose();
});

// ───────────────────────── 带逛 ─────────────────────────

const FAST_TOUR = { say: () => Promise.resolve(), wait: () => Promise.resolve(), read: () => 0, dwell: 0 };

await test('带逛：每一站都是走到了、转过去了才说（walkTo → true）；逛完 → done；tour / tourState 事件', async () => {
  const { engine, ctl, events } = await walkIn('semid2', { tourOpts: FAST_TOUR });
  const at = [];
  ctl.on('tour', (e) => e.stop && at.push({ stop: e.stop, line: e.line, pose: ctl.pose() }));
  const reason = await tickUntil(engine, ctl.tour.start(), 600);
  assert.equal(reason, 'done');
  assert.ok(at.length >= 5, `${at.length} 站`);
  for (const { stop, line, pose } of at) {
    assert.equal(line, stop.line);
    assert.equal(pose.fi, stop.fi, `${stop.id}：楼层`);
    assert.ok(Math.hypot(pose.x - stop.x, pose.z - stop.z) < 1e-6, `${stop.id}：站在那一站（差 ${Math.hypot(pose.x - stop.x, pose.z - stop.z)}）`);
    assert.ok(Math.abs(angleDiff(pose.yaw, stop.yaw)) < 0.011, `${stop.id}：转过去了`);
  }
  assert.ok(at.some((a) => a.stop.fi === 1), '上楼了');
  assert.deepEqual(of(events, 'tour').at(-1), { stop: null, line: null }, '逛完：tour 事件给 null');
  assert.equal(of(events, 'tourState').at(-1).running, false);
  assert.equal(ctl.tour.running, false);
  ctl.dispose();
});

await test('带逛一路不穿门扇（condo3 / semid2，再加 terrace2 / studio 模板）：镜头离开着 / 在动的门扇一直 ≥ 0.2m —— 大门往外开、不扫进「门口」那一站往屋里走的路；门轴挑得开', async () => {
  const tpl = (id) => {
    const plan = M.templatePlan(id);
    return { plan, furniture: furnish(plan, M.buildAllWalls(plan)) };
  };
  for (const [name, project] of [
    ['condo3', PROJ.condo3],
    ['semid2', PROJ.semid2],
    ['terrace2', tpl('terrace2')],
    ['studio', tpl('studio')],
  ]) {
    const { engine, ctl } = await walkIn(name, { project, tourOpts: FAST_TOUR });
    let min = Infinity;
    let opened = 0;
    let done = null;
    ctl.tour.start().then((r) => (done = r));
    const watch = () => {
      const q = ctl.pose();
      min = Math.min(min, ctl.doors.clearOf(q.fi, q.x, q.z));
      opened = Math.max(opened, ctl.doors.leaves.filter((L) => L.s).length);
    };
    const end = clock + 600e3;
    while (done == null && clock < end) {
      ticks(engine, 0.5, { until: () => void watch() });
      await null;
      await null;
    }
    assert.equal(done, 'done', `${name}：逛完了`);
    assert.ok(opened > 0, `${name}：路上开过门`);
    assert.ok(min >= 0.2, `${name}：镜头离门扇只有 ${min.toFixed(3)}m`);
    ctl.dispose();
  }
});

await test('客人接手：带逛走着的时候推摇杆 → 带逛停下（stopped）；walkTo 被摇杆 / 点地板打断 → false', async () => {
  const { engine, ctl, events } = await walkIn('semid2', { tourOpts: FAST_TOUR });
  const end = ctl.tour.start(1);
  ticks(engine, 0.6);
  assert.equal(ctl.tour.state().phase, 'walking');
  ctl.joystick(0.3, 1);
  assert.equal(await end, 'stopped');
  assert.equal(ctl.tour.running, false);
  assert.deepEqual(of(events, 'tour').at(-1), { stop: null, line: null });
  ctl.joystick(0, 0);
  ticks(engine, 0.5);
  // walkTo：走着的时候推摇杆 → false
  const p1 = ctl.walkTo({ fi: 0, x: 5, z: 12.4, yaw: 0.5 });
  ticks(engine, 0.4);
  ctl.joystick(1, 0);
  assert.equal(await p1, false);
  ctl.joystick(0, 0);
  ticks(engine, 0.5);
  // walkTo：再点一下地板（新的路）→ 旧的 false，新的到了 → true
  const p2 = ctl.walkTo({ fi: 0, x: 5, z: 12.4 });
  ticks(engine, 0.3);
  engine.pick = () => hitOf({ x: 7, y: 0, z: 13 }, { slot: 'floor' });
  tapAt(engine);
  assert.equal(await p2, false);
  // walkTo 带 yaw：到了、转过去了才 true
  const p3 = ctl.walkTo({ fi: 0, x: 5, z: 12.4, yaw: 2 });
  assert.equal(await tickUntil(engine, p3, 60), true);
  assert.ok(Math.abs(angleDiff(ctl.pose().yaw, 2)) < 0.011);
  ctl.dispose();
});

await test('拖动转头：带逛站着说话时不打断；带逛走着的时候拖 = 客人接手（停下）', async () => {
  let release = null;
  const tourOpts = { ...FAST_TOUR, say: () => new Promise((r) => (release = r)) };
  const { engine, ctl } = await walkIn('semid2', { tourOpts });
  const el = engine.renderer.domElement;
  const look = (pid) => {
    el.fire('pointerdown', { pointerId: pid, pointerType: 'touch', clientX: 400, clientY: 400, timeStamp: 1 });
    el.fire('pointermove', { pointerId: pid, pointerType: 'touch', clientX: 460, clientY: 400, timeStamp: 30 });
    el.fire('pointerup', { pointerId: pid, pointerType: 'touch', clientX: 460, clientY: 400, timeStamp: 60 });
  };
  const end = ctl.tour.start(0);
  await tickUntil(engine, new Promise((r) => ctl.on('tour', (e) => e.stop && r())), 60);
  assert.equal(ctl.tour.state().phase, 'talking');
  const y0 = ctl.pose().yaw;
  look(1);
  assert.ok(ctl.pose().yaw !== y0, '转了头');
  assert.equal(ctl.tour.running, true, '站着说话：不打断');
  release();
  await null;
  await null;
  ticks(engine, 0.3);
  assert.equal(ctl.tour.state().phase, 'walking');
  look(2);
  assert.equal(await end, 'stopped', '走着的时候拖 = 接手');
  ctl.dispose();
});

// ───────────────────────── update(project) ─────────────────────────

await test('update(project)：只重建家具变了的那一层的导航；家具照规则藏、影子重画；选中的那件删了 → item null；时间变了 → 夜灯按人在哪排', async () => {
  const { engine, ctl, events, project } = await walkIn('semid2');
  const nav = ctl.nav;
  const g0 = nav.floors[0].grid.slice();
  const g1 = nav.floors[1].grid.slice();
  const it = project.furniture.find((q) => q.floor === 'ff' && q.kind === 'bed');
  assert.ok(it, '二楼有床');
  const moved = project.furniture.map((q) => (q.id === it.id ? { ...q, x: q.x + 0.6 } : q));
  assert.deepEqual(changedFloors(engine.navData(), project.furniture, moved), [1]);
  engine.renderer.shadowMap.needsUpdate = false;
  ctl.update({ ...project, furniture: moved });
  assert.equal(ctl.nav, nav, '同一个 nav，就地重建');
  assert.deepEqual(nav.floors[0].grid, g0, '一楼没动');
  assert.notDeepEqual(nav.floors[1].grid, g1, '二楼重画了');
  assert.equal(engine.renderer.shadowMap.needsUpdate, true);
  assert.deepEqual(engine.floors.map((F) => F.furn.visible), [true, false]);
  // 选中的那件被删掉
  ctl.setTool('furnish');
  const gfItem = project.furniture.find((q) => q.floor === 'gf' && q.kind === 'sofa');
  engine.pick = () => hitOf({ x: gfItem.x, y: 0.4, z: gfItem.z }, { itemId: gfItem.id });
  tapAt(engine);
  assert.deepEqual(of(events, 'item').at(-1), { id: gfItem.id });
  const gone = moved.filter((q) => q.id !== gfItem.id);
  assert.deepEqual(changedFloors(engine.navData(), moved, gone), [0]);
  ctl.update({ ...project, furniture: gone });
  assert.deepEqual(of(events, 'item').at(-1), { id: null });
  // 时间
  const n0 = engine.lights.length;
  ctl.update({ ...project, furniture: gone, time: 21 });
  assert.equal(engine.lights.length, n0 + 1);
  const p = ctl.pose();
  assert.deepEqual(engine.lights.at(-1), { x: p.x, z: p.z });
  // 新加 / 换尺寸也算；没变 → 不重建
  assert.deepEqual(changedFloors(engine.navData(), gone, gone), []);
  assert.deepEqual(changedFloors(engine.navData(), gone, [...gone, { id: 'new', kind: 'plant', floor: 'ff', x: 1, z: 1 }]), [1]);
  ctl.dispose();
});

// ───────────────────────── 拖动 ─────────────────────────

await test('拖动转头：灵敏度 = 竖直视角 / 画布高；俯仰最多 ±1.2；家具工具按住选中的那件拖 = 搬（跟着走、松手提交一次；取消 → 放回去）', async () => {
  const { engine, ctl, api, project } = await walkIn('condo3');
  const el = engine.renderer.domElement;
  const y0 = ctl.pose().yaw;
  el.fire('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 300, clientY: 300, timeStamp: 1 });
  el.fire('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 310, clientY: 300, timeStamp: 2 });
  el.fire('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 410, clientY: 300, timeStamp: 3 });
  const k = ((62 * Math.PI) / 180) / 820;
  assert.ok(Math.abs(angleDiff(ctl.pose().yaw, y0) - 110 * k) < 1e-9, '往右拖 = 往左转（抓着画面）');
  el.fire('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 410, clientY: 400, timeStamp: 4 });
  // 镜头 = Euler(pitch, yaw, 0, 'YXZ')；相机自己的轴序不动（回到鸟瞰 OrbitControls 照旧）
  const ps = ctl.pose();
  assert.ok(ps.pitch > 0.05, '往下拖 = 抬头');
  const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(ps.pitch, ps.yaw, 0, 'YXZ'));
  assert.ok(Math.abs(engine.camera.quaternion.dot(want)) > 1 - 1e-12, '镜头朝向 = YXZ(pitch, yaw)');
  assert.equal(engine.camera.rotation.order, 'XYZ');
  el.fire('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 410, clientY: 5000, timeStamp: 4 });
  assert.equal(ctl.pose().pitch, 1.2);
  el.fire('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 410, clientY: -9000, timeStamp: 5 });
  assert.equal(ctl.pose().pitch, -1.2);
  el.fire('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 410, clientY: -9000, timeStamp: 6 });
  // 搬沙发：站在沙发前面 2.5m、稍微低头看着它（走路时的视角 62°：地平线在画面上面一点）。
  // 手指按在哪、那一点的地面（rayAt 和这一层地面的交点）就跟着手指走
  ctl.setTool('furnish');
  const it = project.furniture.find((q) => q.kind === 'sofa');
  const g = engine.items.get(it.id);
  const f0 = engine.navData().floors[0];
  assert.equal(await ctl.goto({ floor: f0.id, x: it.x + 2.5, z: it.z, yaw: Math.PI / 2, pitch: -0.35, hour: engine.time }), true);
  assert.ok(Math.abs(ctl.pose().x - (it.x + 2.5)) < 1e-9 && Math.abs(ctl.pose().z - it.z) < 1e-9, '站在沙发前面');
  engine.camera.fov = 62; // 和 Engine.applyView 一样：走路时用 walk.fov
  engine.camera.updateProjectionMatrix();
  const S = (x, z) => ctl.project({ x, y: f0.elev, z });
  const at = S(it.x, it.z);
  assert.ok(at.visible, '看得见沙发');
  engine.pick = () => hitOf({ x: it.x, y: 0.4, z: it.z }, { itemId: it.id });
  tapAt(engine, at.x, at.y);
  let pid = 10;
  /** 按在 from（默认沙发），挪过 path 里的每一点（画布像素），记下每一步之后沙发在哪，最后 end（pointerup / pointercancel） */
  const drag = (path, end, from = at) => {
    pid++;
    el.fire('pointerdown', { pointerId: pid, pointerType: 'touch', clientX: from.x, clientY: from.y, timeStamp: 100 });
    const seen = [];
    for (const q of path) {
      el.fire('pointermove', { pointerId: pid, pointerType: 'touch', clientX: q.x, clientY: q.y, timeStamp: 120 });
      seen.push({ x: g.position.x, z: g.position.z });
    }
    const last = path.at(-1);
    el.fire(end, { pointerId: pid, pointerType: 'touch', clientX: last.x, clientY: last.y, timeStamp: 160 });
    return seen;
  };
  const near = (a, x, z) => Math.abs(a.x - x) < 1e-9 && Math.abs(a.z - z) < 1e-9;
  const sm = engine.renderer.shadowMap;
  // 跟着手指；走路时影子不自己重画 → 每挪一下都要影子重画（不留一个影子在原地）；取消 → 放回去、影子也回去
  sm.needsUpdate = false;
  let seen = drag([S(it.x - 0.3, it.z), S(it.x - 0.6, it.z - 0.4)], 'pointercancel');
  assert.ok(near(seen[1], 2.25, 5.45), `跟着手指（${JSON.stringify(seen[1])}）`);
  assert.ok(near(g.position, it.x, it.z), '取消 → 放回去');
  assert.deepEqual(api.moves, []);
  for (const [i, x] of [0.3, 0.6].entries()) {
    sm.needsUpdate = false;
    drag([S(it.x - x, it.z)], 'pointercancel');
    assert.equal(sm.needsUpdate, true, `搬的时候 / 放回去影子重画（${i}）`);
  }
  el.fire('pointerdown', { pointerId: 99, pointerType: 'touch', clientX: at.x, clientY: at.y, timeStamp: 100 });
  el.fire('pointermove', { pointerId: 99, pointerType: 'touch', clientX: S(it.x - 0.5, it.z).x, clientY: S(it.x - 0.5, it.z).y, timeStamp: 120 });
  sm.needsUpdate = false;
  el.fire('pointermove', { pointerId: 99, pointerType: 'touch', clientX: S(it.x - 0.5, it.z).x + 0.01, clientY: S(it.x - 0.5, it.z).y, timeStamp: 130 });
  assert.equal(sm.needsUpdate, false, '没挪动（同一个 5cm 格子）：影子不重画');
  el.fire('pointermove', { pointerId: 99, pointerType: 'touch', clientX: S(it.x - 0.7, it.z).x, clientY: S(it.x - 0.7, it.z).y, timeStamp: 140 });
  assert.equal(sm.needsUpdate, true, '挪了：影子重画');
  sm.needsUpdate = false;
  el.fire('pointercancel', { pointerId: 99, pointerType: 'touch', clientX: 0, clientY: 0, timeStamp: 150 });
  assert.equal(sm.needsUpdate, true, '取消：影子跟着放回去');
  assert.ok(near(g.position, it.x, it.z));
  // 松手提交一次
  seen = drag([S(it.x - 0.2, it.z), S(it.x - 0.4, it.z)], 'pointerup');
  assert.ok(near(seen[1], 2.45, it.z));
  assert.equal(api.moves.length, 1, '松手提交一次');
  assert.equal(api.moves[0].id, it.id);
  assert.ok(near(api.moves[0], 2.45, it.z));
  // 拖出房间：停在房间里（客厅 x 0–6.6）
  g.position.set(it.x, 0, it.z);
  api.moves.length = 0;
  drag([S(it.x - 1, it.z), S(-3, it.z)], 'pointerup');
  const room = ctl.nav.data.floors[0].rooms.find((r) => r.id === it.room);
  const fp = (it.rot === 90 || it.rot === 270 ? it.d : it.w) / 2;
  assert.ok(Math.abs(api.moves[0].x - (room.x + fp)) < 1e-9, `没出客厅（${api.moves[0].x}）`);
  // 往远处推、手指过了地平线（走路时地平线就在画面中间附近）：没有交点 / 交点太远（> 15m）→ 停在上一个位置，松手提交的也是它
  // （以前 engine.groundAt 给这一层的中心：沙发跳到不相干的地方、松手就提交了）
  g.position.set(it.x, 0, it.z);
  api.moves.length = 0;
  const hz = ctl.project({ x: it.x - 5000, y: f0.elev, z: it.z }).y; // 地平线（画布 y）
  assert.ok(hz > 20 && hz < at.y - 100, `地平线在画面里（${hz}）`);
  const sky = { x: at.x, y: hz - 40 };
  const edge = { x: at.x, y: hz + 2 };
  const far = S(it.x - 17.5, it.z); // 离眼睛 20m
  seen = drag([S(it.x - 0.5, it.z), sky, edge, far], 'pointerup');
  assert.ok(near(seen[0], 2.35, it.z));
  for (const q of seen.slice(1)) assert.ok(near(q, 2.35, it.z), `指到天上 / 太远：不动（${JSON.stringify(q)}）`);
  assert.equal(api.moves.length, 1);
  assert.ok(near(api.moves[0], 2.35, it.z), '提交的是最后一个指到地面的位置');
  // 高的家具按在地平线以上（按下那一点指不到地面）：先不动，第一次指到地面时定抓手（不跳），之后跟着手指挪
  g.position.set(it.x, 0, it.z);
  api.moves.length = 0;
  const high = { x: at.x, y: hz - 60 };
  seen = drag([{ x: at.x, y: hz - 75 }, S(it.x + 1, it.z), S(it.x + 0.5, it.z)], 'pointercancel', high);
  assert.ok(near(seen[0], it.x, it.z), '还指着天上：不动');
  assert.ok(near(seen[1], it.x, it.z), '第一次指到地面：不跳');
  assert.ok(near(seen[2], 2.35, it.z), `之后跟着手指（${JSON.stringify(seen[2])}）`);
  assert.ok(near(g.position, it.x, it.z), '取消 → 放回去');
  assert.deepEqual(api.moves, []);
  ctl.dispose();
});

// ───────────────────────── 摇杆一直在微微动、换键、淡出淡入叠在一起、带逛挑站 ─────────────────────────

await test('摇杆推着、手指一直微微动（几乎每帧一个新的值）：照样按 SPEED 走，不是每次都停一下；推着的时候有路 → frame 自己停', async () => {
  const { engine, ctl } = await walkIn('semid2');
  const p0 = ctl.pose();
  const t0 = clock;
  for (let i = 0; i < 63; i++) {
    ctl.joystick(0.002 * (i % 3), 0.9 + 0.001 * (i % 2));
    engine.onTick(clock);
    clock += 16;
  }
  const secs = (clock - 16 - t0) / 1000;
  const p1 = ctl.pose();
  const d = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  // 0.9 × SPEED、起步 ~0.1 秒 → ≈ 1.05m；每次 joystick 都 halt（速度清零）的话只有 ~0.17m
  assert.ok(d > 0.8 * 0.9 * SPEED * secs, `走了 ${d.toFixed(3)}m（${secs.toFixed(2)} 秒）`);
  // 推着摇杆的时候来了一条路（另一根手指点了地板 / walkTo）：frame 停掉它，路给 false
  const r = ctl.walkTo({ fi: 0, x: p0.x, z: p0.z });
  ctl.joystick(0.001, 0.9);
  ticks(engine, 0.1);
  assert.equal(await r, false);
  ctl.joystick(0, 0);
  ticks(engine, 0.5);
  ctl.dispose();
});

await test('键盘：W 按着再按 A（或 Q）不停一下（速度不清零）；从不动到动的那一下才算接手', async () => {
  for (const second of [{ code: 'KeyA', key: 'a' }, { code: 'KeyQ', key: 'q' }]) {
    const { engine, ctl } = await walkIn('semid2');
    window.fire('keydown', { code: 'KeyW', key: 'w', target: { tagName: 'DIV' } });
    ticks(engine, 0.4);
    const a = ctl.pose();
    window.fire('keydown', { ...second, target: { tagName: 'DIV' } });
    engine.onTick(clock);
    clock += 16;
    const b = ctl.pose();
    const step = Math.hypot(b.x - a.x, b.z - a.z);
    // 一帧 16ms、~1.3m/s ≈ 2cm；速度被清零的话只有 ~0.3cm
    assert.ok(step > 0.012, `${second.key}：这一帧走了 ${step.toFixed(4)}m`);
    window.fire('keyup', { code: 'KeyW', key: 'w' });
    window.fire('keyup', { ...second });
    ticks(engine, 0.5);
    ctl.dispose();
  }
});

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

await test('跳到收藏的角度连点两下（淡出淡入叠在一起）：只淡一次，画布最后回到原来的样子（不会一直是 opacity 0）', async () => {
  const { engine, ctl, project } = await walkIn('semid2');
  const style = { opacity: '', transition: '' };
  engine.renderer.domElement.style = style;
  const f0 = engine.navData().floors[0].id;
  const A = { floor: f0, x: 5, z: 12.4, yaw: 0.3, pitch: 0, hour: engine.time };
  const B = { floor: f0, x: 7, z: 13, yaw: 1.2, pitch: 0, hour: engine.time };
  // ① 还在淡出：两下一起换（后点的最后换），都 true
  const a1 = ctl.goto(A);
  assert.equal(style.opacity, '0');
  const a2 = ctl.goto(B);
  assert.deepEqual(await Promise.all([a1, a2]), [true, true]);
  assert.equal(style.opacity, '', '回到原来的 opacity');
  assert.equal(style.transition, '', '回到原来的 transition');
  assert.ok(Math.abs(angleDiff(ctl.pose().yaw, 1.2)) < 1e-9, '后点的那个');
  // ② 已经换过去、正在淡入：这一下不算（给正在跑的那一下的结果），画布照样回到原来的样子
  const b1 = ctl.goto(A);
  await sleepMs(170);
  assert.equal(style.opacity, '', '淡入中');
  const b2 = ctl.goto(B);
  assert.deepEqual(await Promise.all([b1, b2]), [true, true]);
  assert.ok(Math.abs(angleDiff(ctl.pose().yaw, 0.3)) < 1e-9, '淡入中再点：不算');
  assert.equal(style.opacity, '');
  assert.equal(style.transition, '');
  // ③ 画布本来就不是 ''（别的地方设过）：淡完回到它
  style.opacity = '0.9';
  await ctl.goto(B);
  await Promise.all([ctl.goto(A), ctl.goto(B)]);
  assert.equal(style.opacity, '0.9');
  ctl.dispose();
});

await test('淡出淡入的半路退出（减少动态效果：飞回去也是淡出淡入）：一起换 / 等它淡完再淡；回到鸟瞰，画布回到原来的样子', async () => {
  globalThis.matchMedia = (q) => ({ matches: /reduce/.test(q) });
  try {
    for (const wait of [30, 170]) {
      const { engine, ctl, project } = await walkIn('semid2');
      const style = { opacity: '', transition: '' };
      engine.renderer.domElement.style = style;
      const f0 = engine.navData().floors[0].id;
      const g = ctl.goto({ floor: f0, x: 7, z: 13, yaw: 1.2, pitch: 0, hour: engine.time });
      await sleepMs(wait);
      const out = ctl.exit();
      assert.equal(ctl.phase, 'flying-out');
      await Promise.all([g, out]);
      assert.equal(ctl.phase, 'out', `${wait}ms`);
      assert.equal(engine.walk, null);
      assert.ok(engine.camera.position.equals(new THREE.Vector3(20, 14, 26)), '镜头放回去');
      assert.equal(style.opacity, '', `${wait}ms：画布回到原来的 opacity`);
      assert.equal(style.transition, '');
      ctl.dispose();
    }
  } finally {
    delete globalThis.matchMedia;
  }
});

await test('带逛挑站按「我们做」的（tourStops 的 offer = 材质 + 锁住的那几面）；材质 / 锁住的变了 → 重新挑', async () => {
  const { ctl, project } = await walkIn('semid2', { tourOpts: FAST_TOUR });
  const totalNow = async () => {
    const end = ctl.tour.start();
    const n = ctl.tour.state().total;
    ctl.tour.stop();
    await end;
    return n;
  };
  const want = (p) => tourStops(p.plan, p.furniture, ctl.nav, { materials: p.materials, locked: p.locked }).length;
  assert.equal(await totalNow(), want(project));
  const kept = { ...project, locked: { cabinetry: true } };
  assert.ok(want(kept) < want(project), '柜子是客人留下来的：少了厨房 / 衣柜那几站');
  ctl.update(kept);
  assert.equal(await totalNow(), want(kept), '锁住的变了 → 重新挑站');
  const back = { ...kept, locked: null, materials: { ...project.materials } };
  ctl.update(back);
  assert.equal(await totalNow(), want(back), '材质变了 → 重新挑站');
  ctl.dispose();
});

// ───────────────────────── 地上的记号 ─────────────────────────

await test('marks3d：要去的一圈、路（走过的收起来、最后淡掉）、选中的一圈、量尺的点和线；颜色来自 PALETTE；dispose 全部拿掉、几何体和材质都释放', () => {
  const scene = new THREE.Scene();
  const mk = createMarks({ scene });
  assert.equal(scene.getObjectByName('walk-marks'), mk.group);
  assert.equal(mk.group.userData.noAO, true);
  mk.target({ x: 1, y: 0, z: 2 });
  mk.path([
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
    { x: 2, y: 0, z: 3 },
  ]);
  mk.select({ x: 1, y: 0, z: 1, r: 0.8 });
  mk.measure({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 2 });
  for (let i = 0; i < 30; i++) mk.update(0.016);
  assert.equal(mk.update(0.016), false, '淡入完了就不再变');
  const meshes = [];
  mk.group.traverse((o) => o.isMesh && meshes.push(o));
  assert.ok(meshes.every((m) => m.material.isMeshBasicMaterial && m.material.depthTest && !m.material.depthWrite));
  assert.ok(meshes.filter((m) => m.visible).length >= 6);
  const tube = meshes.find((m) => m.geometry.type === 'TubeGeometry');
  assert.ok(tube, '路是 TubeGeometry');
  const box = new THREE.Box3().setFromBufferAttribute(tube.geometry.attributes.position);
  assert.ok(box.min.y > 0 && box.max.y < 0.05, `贴着地面（${box.min.y}–${box.max.y}）`);
  const total = tube.geometry.index.count;
  mk.progress(0.5, 2.5);
  assert.ok(tube.geometry.drawRange.start > total * 0.4 && tube.geometry.drawRange.start < total * 0.6, '走过的一半收起来了');
  assert.ok(Math.abs(tube.material.opacity - tube.material.userData.base) < 1e-9);
  mk.progress(0.9, 0.6);
  assert.ok(tube.material.opacity < tube.material.userData.base * 0.6, '快到了：淡掉');
  const line = meshes.find((m) => m.geometry.type === 'CylinderGeometry');
  assert.ok(Math.abs(line.scale.y - 2) < 1e-9 && Math.abs(line.position.z - 1) < 1e-9, '量尺的线从 a 到 b');
  assert.ok(line.material.color.equals(new THREE.Color(PALETTE.amber)));
  mk.target(null);
  mk.path(null);
  for (let i = 0; i < 40; i++) mk.update(0.016);
  assert.equal(meshes.find((m) => m.geometry.type === 'RingGeometry' && m.scale.x === 1).visible, false, '要去的一圈淡掉了');
  assert.equal(tube.visible, false, '路淡掉了');
  assert.equal(line.visible, true, '量尺还在');
  let disposed = 0;
  const geos = new Set();
  const mats = new Set();
  mk.group.traverse((o) => {
    if (!o.isMesh) return;
    geos.add(o.geometry);
    mats.add(o.material);
  });
  for (const x of [...geos, ...mats]) x.addEventListener('dispose', () => disposed++);
  mk.dispose();
  assert.equal(scene.getObjectByName('walk-marks'), undefined);
  assert.equal(disposed, geos.size + mats.size, '几何体和材质都释放了');
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
