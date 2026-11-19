// 走进去 · 飞进去 / 飞回来 —— docs/walk/SPEC.md §3（flight.js）、§4（进出时存什么、退出时按什么顺序放回去）
//
// entryPlan(navData, nav)：纯函数。从大门（furnish.mainEntrance；「外面」= 没有室内房间的那一边，车廊 / 前院算外面）飞进去：
//   approach（门外、整栋楼外框再出去 1.5m，和 P1 一样高）→ P1（门外 3.2m、2.2m 高）→ P2（门外 1.2m、眼睛高）→ P3（门里 1.0m、眼睛高、走得过去）。
//   车廊上面盖着楼板 / 屋顶：镜头先在楼外面降到 2.2m，再平着从街那边飞进车廊（不会穿过屋顶）。
//   趟门从「避开竖框的那一扇」正中穿过去（nav.doorCross）。没有大门 → 落到最大的客厅类房间正中（fallback）。
// flyIn / flyOut：引擎的 onTick 驱动的补间（返回 Promise），镜头走一条转角倒圆的折线，按弧长匀顺地走（单调三次插值，起止速度 0）。
//   进：t0 setWalk（墙全立、楼上不藏）→ 飞到 P1（视角 28°→48°、主点偏移归零）→ 开门 → P2 → 跨过门槛时盖上天花 → P3（视角 → walkFov）。
//   出：门扇拿掉、天花掀掉、藏起人头上的楼层 → 升起来 → 滑回进来前的位置 → restoreOrbit 一模一样放回去（§4）。
//   系统「减少动态效果」：两种飞行都换成 250ms 淡出到纸色再淡入。
// 坐标：平面图 x → 世界 x、平面 y → 世界 z；yaw 和相机同一个约定（'YXZ'）：看的方向 = (−sin yaw, −cos yaw)。

import * as THREE from 'three';
import { ROOM_TYPES } from '../plan/model.js';
import { mainEntrance } from '../engine/furnish.js';
import { doorCross, passable, nearest } from './nav.js';
import { levelOf } from './doors.js';

export const EYE = 1.55; // 眼睛离地面
export const WALK_FOV = 62; // 横屏：竖直视角
const ORBIT_FOV = 28; // 鸟瞰的竖直视角（Engine 的 BASE_FOV）
const MID_FOV = 48; // 飞到 P1 时的视角
const PORTRAIT_HFOV = 70; // 竖屏：大约给这么宽的水平视角
const MAX_FOV = 82;
const OUT1 = 3.2; // P1：门外多远
const UP1 = 2.2; // P1：多高
const OUT2 = 1.2; // P2：门外多远（眼睛高）
const IN3 = 1.0; // P3：门里多远
const IN_MAX = 2.5; // P3 走不过去：沿着进门的方向最多往里找到这里
const CLEAR = 1.5; // 楼顶 / 外框再留这么多
const LOOK = 2.5; // 看的点：眼睛前面这么远（和控制器的 controls.target 一样）
const FILLET = 1.2; // 折线转角倒圆的最大半径
const FADE = 250; // 减少动态效果：淡出 + 淡入一共多少毫秒
// 飞进去的时间表（秒）：到 P1、到 P2、到 P3
const T_IN = [1.6, 2.3, 3.0];
const T_DROP = [1.6, 3.0]; // 没有大门：到房间正上方、落到眼睛高
const T_OUT = [0.9, 2.5]; // 飞回来：升起来、滑回去
const RISE = 1.6; // 飞回来先升到这一层天花上面这么多

const LIVING = ['living', 'family', 'dining'];
const indoor = (r) => !!r && !ROOM_TYPES[r.type]?.outdoor;
const isHole = (r) => !!(r?.stairId || ROOM_TYPES[r?.type]?.stair || ROOM_TYPES[r?.type]?.void);
const yawOf = (dx, dz) => Math.atan2(-dx, -dz) + 0;
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const lerp = (a, b, k) => a + (b - a) * k;
const v3 = (p) => new THREE.Vector3(p.x, p.y, p.z);

// ───────────────────────── 视角 ─────────────────────────

/** 走路时的竖直视角（度）：横屏 62°；竖屏取 62° 和「水平 ~70°」那个竖直视角里大的，最多 82° */
export function walkFov(W, H) {
  if (!(W > 0 && H > 0) || W >= H) return WALK_FOV;
  const half = Math.tan(THREE.MathUtils.degToRad(PORTRAIT_HFOV / 2)) * (H / W);
  return Math.min(MAX_FOV, Math.max(WALK_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(half))));
}

// ───────────────────────── 从哪里进去（纯函数） ─────────────────────────

/** 大门：{ id, kind, fi: 0, wall, piece, axis, c, a, b, width, inward: ±1（室内在墙线的哪一边）, cross（从哪里穿过去，沿墙坐标） } */
export function frontDoor(navData, nav = null) {
  const f0 = navData?.floors?.[0];
  if (!f0) return null;
  let wall;
  let piece;
  let inward;
  let id;
  let kind;
  if (nav?.door) ({ wall, piece, inward, id, kind } = nav.door);
  else {
    const m = mainEntrance(f0, f0.walls);
    wall = m && f0.walls.find((w) => w.pieces.some((p) => p.openingId === m.id));
    piece = wall?.pieces.find((p) => p.openingId === m.id);
    if (!piece) return null;
    ({ id, kind } = m);
    const negIn = indoor(wall.neg);
    const posIn = indoor(wall.pos);
    if (negIn !== posIn) inward = negIn ? -1 : 1;
    else if (!negIn) inward = wall.outward ? -wall.outward : -1;
    else inward = ['foyer', 'living'].includes(wall.pos.type) ? 1 : -1;
  }
  return { id, kind, fi: 0, wall, piece, axis: wall.axis, c: wall.c, a: piece.a, b: piece.b, width: piece.b - piece.a, inward, cross: doorCross(piece) };
}

/** 整栋楼（所有楼层的房间）的平面外框 */
function boundsOf(navData) {
  const bb = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (const f of navData?.floors || [])
    for (const r of f.rooms || []) {
      bb.x0 = Math.min(bb.x0, r.x);
      bb.z0 = Math.min(bb.z0, r.y);
      bb.x1 = Math.max(bb.x1, r.x + r.w);
      bb.z1 = Math.max(bb.z1, r.y + r.d);
    }
  return Number.isFinite(bb.x0) ? bb : { x0: 0, z0: 0, x1: 0, z1: 0 };
}

/** 飞过楼顶要多高（世界 y）：最高那一层的天花 / 层高 + 1.5m */
export function clearHeight(navData) {
  let top = 0;
  for (const f of navData?.floors || []) top = Math.max(top, (f.elev || 0) + Math.max(f.ceil || 0, f.height || 0, 2.8));
  return top + CLEAR;
}

/**
 * 飞进去的路线：{ door, out: {x, z}, P1, P2, P3, yaw, approach, high } —— P1 / P2 / P3 / approach 是世界坐标 {x, y, z}；
 * out = 往门外的单位向量（平面）；yaw = 站在 P3 朝屋里看；high = 飞过楼顶的高度。
 * 没有大门：{ fallback: { fi, x, z, y, yaw, room }, high }（最大的客厅类房间正中，走得过去的点）。
 */
export function entryPlan(navData, nav = null) {
  const high = clearHeight(navData);
  const door = frontDoor(navData, nav);
  if (!door) return { fallback: fallbackSpot(navData, nav), high };
  const { wall, inward, cross } = door;
  const out = -inward;
  const elev = navData.floors[0].elev || 0;
  const at = (side, d, y) => (wall.axis === 'x' ? { x: cross, y, z: wall.c + side * d } : { x: wall.c + side * d, y, z: cross });
  const P1 = at(out, OUT1, elev + UP1);
  const P2 = at(out, OUT2, elev + EYE);
  // P3：门里 1.0m；被家具挡住就沿着进门的方向往里找（再不行往回找到 0.6m），还不行取最近的走得到的点
  let P3 = null;
  const tries = [];
  for (let d = IN3; d <= IN_MAX + 1e-9; d += 0.1) tries.push(d);
  for (let d = IN3 - 0.1; d >= 0.6 - 1e-9; d -= 0.1) tries.push(d);
  for (const d of tries) {
    const p = at(inward, d, elev + EYE);
    if (!nav || passable(nav, { fi: 0, x: p.x, z: p.z })) {
      P3 = p;
      break;
    }
  }
  if (!P3) {
    const p = at(inward, IN3, elev + EYE);
    const q = nearest(nav, { fi: 0, x: p.x, z: p.z }) || { x: p.x, z: p.z };
    P3 = { x: q.x, y: elev + EYE, z: q.z };
  }
  // 门外先降下来的那一点：整栋楼外框（车廊、楼上挑出去的部分都算）再出去 1.5m
  const bb = boundsOf(navData);
  const edge = Math.max(0, wall.axis === 'x' ? (out > 0 ? bb.z1 - wall.c : wall.c - bb.z0) : out > 0 ? bb.x1 - wall.c : wall.c - bb.x0);
  const approach = at(out, Math.max(OUT1 + CLEAR, edge + CLEAR), elev + UP1);
  const outV = wall.axis === 'x' ? { x: 0, z: out } : { x: out, z: 0 };
  return { door, out: outV, P1, P2, P3, yaw: yawOf(-outV.x, -outV.z), approach, high };
}

/** 没有大门：最大的客厅类房间（客厅 → 起居厅 → 餐厅；都没有就最大的室内房间）正中 */
function fallbackSpot(navData, nav) {
  const floors = navData?.floors || [];
  const area = (r) => r.w * r.d;
  let pick = null;
  for (const want of [(r) => LIVING.includes(r.type), (r) => indoor(r) && !isHole(r), (r) => !isHole(r)]) {
    floors.forEach((f, fi) => {
      for (const r of f.rooms || []) if (want(r) && (!pick || area(r) > area(pick.r) + 1e-9)) pick = { r, fi };
    });
    if (pick) break;
  }
  if (!pick) return { fi: 0, x: 0, z: 0, y: (floors[0]?.elev || 0) + EYE, yaw: 0, room: null };
  const { r, fi } = pick;
  const c = { x: r.x + r.w / 2, z: r.y + r.d / 2 };
  const q = (nav && nearest(nav, { fi, ...c })) || { ...c };
  const moved = Math.hypot(q.x - c.x, q.z - c.z) > 0.3;
  // 正中走得过去：顺着房间长的那一边看；被挪开了：看回房间正中
  const yaw = moved ? yawOf(c.x - q.x, c.z - q.z) : r.w >= r.d ? yawOf(1, 0) : yawOf(0, 1);
  return { fi, x: q.x, z: q.z, y: (floors[fi].elev || 0) + EYE, yaw, room: r.id };
}

// ───────────────────────── 进出时的状态（§4） ─────────────────────────

/** 进去之前存下鸟瞰的样子：{ pos, quat, target, vo, voTo, floorView, lastView, framed, W, H, insets（JSON） } */
export function saveOrbit(engine) {
  return {
    pos: engine.camera.position.clone(),
    quat: engine.camera.quaternion.clone(),
    target: engine.controls.target.clone(),
    vo: { ...engine.vo },
    voTo: { ...engine.voTo },
    floorView: engine.floorView,
    lastView: engine.lastView,
    framed: !!engine.isFramed?.(),
    W: engine.container?.clientWidth || 1,
    H: engine.container?.clientHeight || 1,
    insets: JSON.stringify(engine.insets || {}),
  };
}

/**
 * 一下子回到鸟瞰，和进去之前一模一样（§4 的顺序）：
 * ① 门扇拿掉（合并的门扇、趟门玻璃放回去）② 掀掉天花 ③ setWalk(null) ④ 回到原来看的楼层（instant、quiet）
 * ⑤ 镜头位置 / 朝向 / 目标点原样放回，OrbitControls 的惯性清零（补光跟着镜头重新摆，走路时它被挪过）
 * ⑥ 画布尺寸和面板留白都没变 → 主点偏移原样放回；变了 → 重新算，原来是对好的就重新对一次
 * ⑦ lastCut、高亮、onTick 清掉，重画。
 */
export function restoreOrbit(engine, saved, { doors = null } = {}) {
  cancelFlight(engine);
  doors?.dispose?.();
  engine.setCeilings(false);
  engine.setWalk(null);
  if (saved) {
    engine.setFloorView(saved.floorView, { instant: true, quiet: true });
    engine.camera.position.copy(saved.pos);
    engine.camera.quaternion.copy(saved.quat);
    engine.controls.target.copy(saved.target);
    engine.controls._sphericalDelta?.set(0, 0, 0);
    engine.controls._panOffset?.set(0, 0, 0);
    engine.placeFill?.();
    const W = engine.container?.clientWidth || 1;
    const H = engine.container?.clientHeight || 1;
    if (W === saved.W && H === saved.H && JSON.stringify(engine.insets || {}) === saved.insets) {
      engine.vo = { ...saved.vo };
      engine.voTo = { ...saved.voTo };
      engine.applyView();
    } else {
      engine.updateViewTarget(true);
      if (saved.framed) engine.frame(saved.lastView, false);
    }
  }
  engine.lastCut = null;
  engine.highlightSlot?.(null);
  engine.onTick = null;
  engine.dirty = true;
}

// ───────────────────────── 补间 ─────────────────────────

const flights = new WeakMap();

/** 正在飞的那一段停下来（Promise 以 'cancelled' 结束）；没在飞 → false */
export function cancelFlight(engine) {
  const job = engine && flights.get(engine);
  if (!job) return false;
  job.finish('cancelled');
  return true;
}

/** 系统设置了「减少动态效果」 */
export function prefersReducedMotion() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * 用 engine.onTick 跑 dur 秒：frame(k 秒, dt 秒)。结束 / 取消时先（同步地）调 end(reason)，再把 onTick 还回去
 * → Promise<'done' | 'cancelled'>。同步收尾：取消以后马上开始的下一段不会被上一段迟到的收尾打乱。
 */
function drive(engine, dur, frame, end) {
  cancelFlight(engine);
  return new Promise((resolve) => {
    const prev = engine.onTick;
    let t0 = null;
    let last = 0;
    const job = {
      finish(reason) {
        if (flights.get(engine) !== job) return;
        flights.delete(engine);
        end?.(reason);
        if (engine.onTick === tick) engine.onTick = prev;
        resolve(reason);
      },
    };
    const tick = (t) => {
      if (t0 == null) [t0, last] = [t, t];
      const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
      last = t;
      const k = Math.min(dur, (t - t0) / 1000);
      frame(k, dt);
      if (k >= dur) job.finish('done');
      return true;
    };
    flights.set(engine, job);
    engine.onTick = tick;
  });
}

/** 淡出到纸色 → swap() → 淡入（界面给了 hooks.fade 就用它；没有画布样式（Node）就直接换） */
async function fadeSwap(engine, hooks, swap) {
  if (hooks.fade) return hooks.fade(swap, FADE);
  const style = engine.renderer?.domElement?.style;
  if (!style) return swap();
  const prev = { o: style.opacity, tr: style.transition };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  style.transition = `opacity ${FADE / 2}ms ease`;
  style.opacity = '0';
  await wait(FADE / 2);
  swap();
  engine.dirty = true;
  style.opacity = prev.o;
  await wait(FADE / 2);
  style.transition = prev.tr;
}

/**
 * 转角倒圆的折线（转角 = 二次贝塞尔，半径 ≤ FILLET、≤ 两边各一半）→ { at(s) → Vector3, length, marks（每个路点对应的弧长） }。
 * 直的那几段是精确的；倒圆的那一段采 10 个点。
 */
function filleted(points) {
  const P = [];
  for (const p of points) if (!P.length || P[P.length - 1].distanceTo(p) > 1e-6) P.push(p.clone());
  const pts = [P[0]];
  const marks = [0];
  const len = [0];
  const push = (q) => {
    const prev = pts[pts.length - 1];
    len.push(len[len.length - 1] + prev.distanceTo(q));
    pts.push(q);
  };
  for (let i = 1; i < P.length; i++) {
    if (i === P.length - 1) {
      push(P[i]);
      marks.push(len[len.length - 1]);
      continue;
    }
    const a = P[i - 1];
    const b = P[i];
    const c = P[i + 1];
    const r = Math.min(FILLET, a.distanceTo(b) / 2, b.distanceTo(c) / 2);
    const A = b.clone().addScaledVector(a.clone().sub(b).normalize(), r);
    const C = b.clone().addScaledVector(c.clone().sub(b).normalize(), r);
    push(A);
    for (let k = 1; k <= 10; k++) {
      const u = k / 10;
      const q = A.clone()
        .multiplyScalar((1 - u) * (1 - u))
        .addScaledVector(b, 2 * u * (1 - u))
        .addScaledVector(C, u * u);
      push(q);
      if (k === 5) marks.push(len[len.length - 1]);
    }
  }
  const length = len[len.length - 1];
  const at = (s) => {
    if (pts.length < 2 || s <= 0) return pts[0].clone();
    if (s >= length) return pts[pts.length - 1].clone();
    let lo = 0;
    let hi = len.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (len[m] <= s) lo = m;
      else hi = m;
    }
    const seg = len[hi] - len[lo] || 1;
    return pts[lo].clone().lerp(pts[hi], (s - len[lo]) / seg);
  };
  return { at, length, marks };
}

/** 单调三次插值（Fritsch–Carlson：内点斜率取调和平均，两端斜率 0）：时间 → 弧长，不会倒退、速度连续 */
function monotone(xs, ys) {
  const n = xs.length;
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1));
  const m = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] > 0 && d[i] > 0 ? 2 / (1 / d[i - 1] + 1 / d[i]) : 0;
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/** 曝光跟着 walk.ev（引擎 setTime 也是这么乘的） */
function exposure(engine, w) {
  if (engine.day && engine.renderer) engine.renderer.toneMappingExposure = engine.day.exposure * (w.ev || 1);
}

function place(engine, pos, target) {
  engine.camera.position.copy(pos);
  engine.camera.lookAt(target);
  engine.controls.target.copy(target);
}

/** 藏起 fi 以上的楼层（往下降 / 往上升的时候镜头要穿过楼板）→ 放回去的函数 */
function hideAbove(engine, fi) {
  const hidden = [];
  (engine.floors || []).forEach((F, i) => {
    if (i > fi && F.group && F.group.visible) {
      F.group.visible = false;
      hidden.push(F.group);
    }
  });
  return () => {
    for (const g of hidden.splice(0)) g.visible = true;
  };
}

/**
 * 飞进去。plan = entryPlan(...)；hooks：
 *  walk（控制器的 walk 对象；ev / pr 是要到的值，fov / vo 由这里管）、doors（createDoors 的结果：每帧更新、到 P1 开大门）、
 *  openDoor()（代替默认的开门）、ceilings(on)（代替 engine.setCeilings）、tick(dt, k)（每帧另外要做的）、
 *  reduced（代替系统设置）、fade(swap, ms)（界面自己的淡入淡出）。
 * → Promise<'done' | 'cancelled'>；'done' 时镜头正好在落点，walk.fov = walkFov、walk.vo = 0。
 */
export function flyIn(engine, plan, hooks = {}) {
  cancelFlight(engine);
  const w = hooks.walk || { fov: ORBIT_FOV, vo: { x: 0, y: 0 }, ev: 1, pr: 0 };
  const W = engine.container?.clientWidth || 1;
  const H = engine.container?.clientHeight || 1;
  const fov1 = walkFov(W, H);
  const ev1 = w.ev || 1;
  const vo0 = { x: engine.vo?.x || 0, y: engine.vo?.y || 0 };
  const fb = plan?.fallback || null;
  const fi = fb ? fb.fi : (plan?.door?.fi ?? 0);
  const F = engine.floors?.[fi];
  const spot = v3(fb ? { x: fb.x, y: fb.y, z: fb.z } : plan.P3);
  const elev = F?.elev ?? spot.y - EYE;
  const ceil = elev + (F?.ceil || 2.8);
  const yaw = fb ? fb.yaw : plan.yaw;
  const look1 = spot.clone().add(new THREE.Vector3(-Math.sin(yaw) * LOOK, 0, -Math.cos(yaw) * LOOK));
  const ceilings = (on) => (hooks.ceilings ? hooks.ceilings(on) : engine.setCeilings(on));
  const doors = hooks.doors || null;
  const openDoor = () => {
    if (hooks.openDoor) hooks.openDoor();
    else if (plan?.door) doors?.open(plan.door.id, { fi: plan.door.fi, from: plan.P1 });
  };

  // t0：进走路模式（墙全立、楼上不藏、主点和视角先不变 → 第一帧和鸟瞰一样）
  w.fov = ORBIT_FOV;
  w.vo = { ...vo0 };
  w.ev = 1;
  engine.setWalk(w);
  if (F) engine.setFloorView(F.id, { instant: true, quiet: true });
  // 从楼上往下降：先藏起这一层以上的楼层，降到天花下面再放回来
  const unhide = fb ? hideAbove(engine, fi) : () => {};
  const land = () => {
    w.fov = fov1;
    w.vo = { x: 0, y: 0 };
    w.ev = ev1;
    exposure(engine, w);
    engine.applyView();
    place(engine, spot, look1);
    engine.dirty = true;
  };

  if (hooks.reduced ?? prefersReducedMotion()) {
    return Promise.resolve(
      fadeSwap(engine, hooks, () => {
        if (plan?.door) {
          if (hooks.openDoor) hooks.openDoor();
          else doors?.open(plan.door.id, { fi: plan.door.fi, from: plan.P1, instant: true });
        }
        unhide();
        ceilings(true);
        land();
      }),
    ).then(() => 'done');
  }

  const P0 = engine.camera.position.clone();
  const T0 = engine.controls.target.clone();
  const high = plan?.high ?? ceil + CLEAR;
  const pts = [P0];
  if (P0.y < high) pts.push(new THREE.Vector3(P0.x, high, P0.z));
  let times;
  let look0;
  let door = null;
  if (fb) {
    pts.push(new THREE.Vector3(spot.x, Math.max(high, P0.y), spot.z), spot);
    times = T_DROP;
    look0 = look1;
  } else {
    const A = v3(plan.approach);
    // 先飞到 approach 外面一点的高处（再斜着降下来，倒圆的那一段也在楼外面）
    const outV = new THREE.Vector3(plan.out.x, 0, plan.out.z);
    pts.push(A.clone().addScaledVector(outV, 2).setY(Math.max(high, A.y)), A, v3(plan.P1), v3(plan.P2), spot);
    times = T_IN;
    door = plan.door;
    // 飞到 P1 的时候看着门里面 2.5m（离镜头永远有一段距离，不会在门槛上看到脚下）
    const inV = outV.clone().negate();
    look0 = v3({ ...(door.axis === 'x' ? { x: door.cross, z: door.c } : { x: door.c, z: door.cross }), y: elev + 1.2 }).addScaledVector(inV, LOOK);
  }
  const path = filleted(pts);
  const mark = (back) => path.marks[path.marks.length - 1 - back] ?? 0;
  const sOf = monotone([0, ...times], fb ? [0, mark(1), path.length] : [0, mark(2), mark(1), path.length]);
  const T1 = times[0];
  const TT = times[times.length - 1];
  let opened = false;
  let covered = false;
  // 跨过门槛：过了 P2、到了墙线里面（起点可能在屋子后面的高处，也在「墙线里面」——所以要先过 P2）
  const crossed = (p, k) => k >= times[1] && (door.axis === 'x' ? (p.z - door.c) * door.inward : (p.x - door.c) * door.inward) >= 0;
  const target = new THREE.Vector3();
  const wrapUp = (reason) => {
    if (reason !== 'done') return unhide();
    if (!covered) {
      unhide();
      ceilings(true);
    }
    if (door && !opened) openDoor();
    land();
  };

  return drive(
    engine,
    TT,
    (k, dt) => {
      const pos = path.at(sOf(k));
      if (k <= T1) target.lerpVectors(T0, look0, ease(k / T1));
      else target.lerpVectors(look0, look1, ease((k - T1) / (TT - T1)));
      place(engine, pos, target);
      w.fov = k <= T1 ? lerp(ORBIT_FOV, MID_FOV, ease(k / T1)) : lerp(MID_FOV, fov1, ease((k - T1) / (TT - T1)));
      const kv = ease(k / T1);
      w.vo = { x: lerp(vo0.x, 0, kv), y: lerp(vo0.y, 0, kv) };
      w.ev = lerp(1, ev1, ease(k / TT));
      exposure(engine, w);
      engine.applyView();
      if (door && !opened && k >= T1) {
        opened = true;
        openDoor();
      }
      if (!covered && (door ? crossed(pos, k) : pos.y < ceil - 0.05)) {
        covered = true;
        unhide();
        ceilings(true);
      }
      if (doors?.update(pos, null, dt) && engine.renderer?.shadowMap) engine.renderer.shadowMap.needsUpdate = true;
      hooks.tick?.(dt, k);
      engine.dirty = true;
    },
    wrapUp,
  );
}

/**
 * 飞回鸟瞰：门扇拿掉、掀掉天花、藏起人头上的楼层 → 升到这一层的天花上面 → 滑到进来前的位置，
 * 视角 / 主点 / 曝光一路变回去 → restoreOrbit（§4）。中途被 cancelFlight 打断也会马上放回去。
 * hooks：doors、tick(dt, k)、reduced、fade(swap, ms)。→ Promise<'done' | 'cancelled'>。
 */
export function flyOut(engine, saved, hooks = {}) {
  cancelFlight(engine);
  hooks.doors?.dispose?.();
  engine.setCeilings(false);
  const w = engine.walk;
  const finish = () => restoreOrbit(engine, saved, hooks);
  if (!w || !saved) {
    finish();
    return Promise.resolve('done');
  }
  if (hooks.reduced ?? prefersReducedMotion()) return Promise.resolve(fadeSwap(engine, hooks, finish)).then(() => 'done');

  const floors = engine.floors || [];
  const Q0 = engine.camera.position.clone();
  const fi = levelOf(floors, Q0.y);
  const unhide = hideAbove(engine, fi);
  const F = floors[fi];
  const top = (F?.elev || 0) + (F?.ceil || 2.8) + RISE;
  const Q1 = new THREE.Vector3(Q0.x, Math.max(top, Q0.y + 1), Q0.z);
  const path = filleted([Q0, Q1, saved.pos]);
  const sOf = monotone([0, ...T_OUT], [0, path.marks[1], path.length]);
  const TT = T_OUT[T_OUT.length - 1];
  // 起点看的方向 = 现在镜头的朝向（看前面 4m 的一点：升起来的时候不会一下子低头看脚下）
  const T0 = Q0.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(engine.camera.quaternion).multiplyScalar(4));
  const fov0 = w.fov;
  const vo0 = { x: w.vo?.x || 0, y: w.vo?.y || 0 };
  const ev0 = w.ev || 1;
  const target = new THREE.Vector3();
  return drive(
    engine,
    TT,
    (k, dt) => {
      const e = ease(k / TT);
      target.lerpVectors(T0, saved.target, e);
      place(engine, path.at(sOf(k)), target);
      w.fov = lerp(fov0, ORBIT_FOV, e);
      w.vo = { x: lerp(vo0.x, saved.vo.x, e), y: lerp(vo0.y, saved.vo.y, e) };
      w.ev = lerp(ev0, 1, e);
      exposure(engine, w);
      engine.applyView();
      hooks.tick?.(dt, k);
      engine.dirty = true;
    },
    () => {
      unhide();
      finish();
    },
  );
}
