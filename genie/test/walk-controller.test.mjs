// 走进去 · 控制器（src/studio/walk/controller.js、marks3d.js —— docs/walk/SPEC.md §3、§4、§10）：
//   假的引擎（和 Engine 一样的接口，只记下调用）+ 真的 nav / 门 / 飞行 / 带逛，onTick 用假的 rAF 一帧一帧跑：
//   进去（state 的顺序、onTick、window.__genieWalk、落在 P3）→ 出来（飞回去 / 一下子回去：engine.walk、engine.onTick 都是 null、镜头一点不差）；
//   点一下按工具分（走 / 刷颜色 / 地板 / 家具 / 量尺；灯光、拍照也是走）；摇杆贴着墙滑、永远不走进走不过去的格子；
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
 * hitAt / itemAt / groundAt：测试自己给（engine.pick = (x, y) => hit）。
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
    groundAt(x, y) {
      const h = this.pick?.(x, y);
      return h ? { x: h.point.x, z: h.point.z, floorId: floors[this.activeIdx].id } : { x: 0, z: 0, floorId: null };
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
  // 搬沙发：按在沙发上（地面上的一点跟着手指）
  ctl.setTool('furnish');
  const it = project.furniture.find((q) => q.kind === 'sofa');
  const g = engine.items.get(it.id);
  engine.pick = (x) => hitOf({ x: it.x + (x - 500) / 100, y: 0.4, z: it.z }, { itemId: it.id });
  tapAt(engine, 500, 400);
  const drag = (pid, to, end) => {
    el.fire('pointerdown', { pointerId: pid, pointerType: 'touch', clientX: 500, clientY: 400, timeStamp: 100 });
    el.fire('pointermove', { pointerId: pid, pointerType: 'touch', clientX: 520, clientY: 400, timeStamp: 120 });
    el.fire('pointermove', { pointerId: pid, pointerType: 'touch', clientX: to, clientY: 400, timeStamp: 140 });
    const live = g.position.x;
    el.fire(end, { pointerId: pid, pointerType: 'touch', clientX: to, clientY: 400, timeStamp: 160 });
    return live;
  };
  const live = drag(2, 560, 'pointercancel');
  assert.ok(Math.abs(live - Math.round((it.x + 0.6) * 20) / 20) < 1e-9, `跟着手指（${live}）`);
  assert.equal(g.position.x, it.x, '取消 → 放回去');
  assert.deepEqual(api.moves, []);
  const live2 = drag(3, 540, 'pointerup');
  assert.ok(Math.abs(live2 - Math.round((it.x + 0.4) * 20) / 20) < 1e-9);
  assert.equal(api.moves.length, 1, '松手提交一次');
  assert.equal(api.moves[0].id, it.id);
  assert.ok(Math.abs(api.moves[0].x - live2) < 1e-9 && Math.abs(api.moves[0].z - it.z) < 1e-9);
  // 拖出房间：停在房间里（客厅 x 0–6.6）
  api.moves.length = 0;
  drag(4, 5000, 'pointerup');
  const room = ctl.nav.data.floors[0].rooms.find((r) => r.id === it.room);
  const fp = (x) => {
    const swap = it.rot === 90 || it.rot === 270;
    return (swap ? it.d : it.w) / 2 + x;
  };
  assert.ok(api.moves[0].x <= room.x + room.w - fp(0) + 1e-9, `没出客厅（${api.moves[0].x}）`);
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
