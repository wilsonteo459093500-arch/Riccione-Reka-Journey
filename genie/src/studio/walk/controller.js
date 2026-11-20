// 走进去 · 控制器 —— docs/walk/SPEC.md §3（controller.js）、§4（进出）、§10（门和飞行怎么用）
//
// createWalk(engine, { project, api, wish, onEvent }) → 控制器（window.__genieWalk 也指着它，脚本用）。
// 进去：先存下鸟瞰（saveOrbit）→ 导航 / 从哪进去 / 门 → 飞进去（flyIn）→ 接管 engine.onTick。
// 出来：飞回去（flyOut）；卸载、出错 = 一下子回去（restoreOrbit）。出来以后 engine.walk、engine.onTick 都是 null。
// 走路：点地板走过去（A* 的路，一段一段走；楼梯那一段按折线插值，眼睛 = 出发那层的地面 + y + 1.55，走过一半的高度换楼层）；
//   摇杆 / WASD（Q / E 转身）按看的方向走，贴着墙滑（nav 的 clearance 是连续的）；开着 / 在动的门扇也是一块薄墙（doors.clearOf，
//   和墙一样离一个半径）；拖动 = 转头（俯仰 ±1.2）。
//   转身缓一缓，不晃头。沿路走时看着路上往前 1.5m（看得见的）那一点：拐弯之前就转过去，不是走到拐角 / 门边才转（§10）。
//   客人自己动了（摇杆、按键、点地板走、带逛走路时拖动）→ 带逛停下。
// 工具：点一下按现在的工具算 —— 走（灯光、拍照也是）/ 刷颜色、地板（'pick'）/ 家具（'item'，按住选中的那件拖 = 搬）/ 量尺（两下 = 一条线）。
// 每帧：镜头、controls.target = 眼睛前面 2.5m、补光、门（开关 → 影子重画）、换房间 → 夜灯按人在哪排 + 'room'、
//   家具只画人在的这一层（楼梯 / 挑空 3m 以内再加上下那一层）。每帧不建新对象。
// 坐标：平面图 x → 世界 x、平面 y → 世界 z；yaw 和相机同一个约定（'YXZ'）：看的方向 = (−sin yaw, −cos yaw)。

import * as THREE from 'three';
import { ROOM_TYPES } from '../plan/model.js';
import { footprintOf } from '../engine/furnish.js';
import { CATALOG } from '../engine/furniture.js';
import { buildNav, rebuildFloor, path as findPath, nearest, roomAt, clearance } from './nav.js';
import { createDoors, sideOf } from './doors.js';
import { walkFov, walkVo, entryPlan, flyIn, flyOut, saveOrbit, restoreOrbit, fadeCanvas, EYE } from './flight.js';
import { slotOfHit, floorSlotOf } from './paint.js';
import { measureText, wallDims } from './measure.js';
import { tourStops, createTour } from './tour.js';
import { createMarks } from './marks3d.js';
import { plasterEdges } from './plaster.js';

export const TOOLS = ['walk', 'paint', 'floor', 'furnish', 'light', 'measure', 'photo'];
export const WALK_EV = 1.3; // 屋里比鸟瞰暗：白天曝光再乘这么多（看截图调的：1.15 时墙和天花发灰）
const NIGHT_EV = 0.3; // 晚上再乘 (1 + 这么多 × 夜色)：屋里的灯要亮、要暖，不是黑乎乎一片
export const SPEED = 1.3; // 走路（米 / 秒）
const STAIR_K = 0.75; // 楼梯上慢一点
const ACCEL = 2.6; // 起步 / 停下（米 / 秒²）
const STICK_K = 10; // 摇杆：速度跟上去有多快
const TURN_K = 7; // 转身缓动
const AHEAD = 1.5; // 沿路走：看沿着路往前这么远（米，只算水平）的那一点 —— 拐弯之前就慢慢转过去，不是走到拐角 / 门边才转（那时整个画面是墙）
const AHEAD_STAIR = 2.0; // 楼梯上先只看这一段楼梯、往前这么远：U 形楼梯走到第一跑上头就开始转向下一跑；这一段楼梯剩下不到这么长 → 照 AHEAD 接着看后面的路
const LEAD = 1.2; // 沿路走：看的方向最多比走的方向偏这么多（弧度，约 70°）—— 不扭着头走
const LEAD_STAIR = 2.0; // 看的那一点还在这一段楼梯上时可以偏这么多（约 115°）：U 形楼梯的平台上一边绕一边回头看下一跑，不是一直对着平台的墙
const SEE = 0.12; // 沿路走：看的那一点和眼睛之间的直线离墙 / 家具至少这么远（米）—— 不隔着墙角 / 门框看
const SIDE = 0.45; // 沿路走：看的方向和走的方向差这么多（弧度）以内照常走；再多就慢下来（差 90° → ×0.25），不横着快走
const FACE_STAIR = 0.65; // 楼梯上最多慢到 ×这么多（平台上回头看下一跑是常事，楼梯本来就慢 STAIR_K；0.5 时 semid2 上下楼慢 8%）
const SEE_MAX = 160; // 沿路走：sees 每帧最多看这么多下（每下 = 一次 clearance 双线性插值，很便宜；五个模板 975 条路实测每帧平均 9 下、最多 109 下）
const END_EASE = 0.4; // 沿路走：离终点不到这么远（米；路很短就是后一半）转头就越来越少（到终点 = 不转）；到了要转的朝向照旧转
const ARRIVE = 1.2; // 有要转到的朝向（yaw）：离终点不到这么远（米；路很短就是后一半）看的方向慢慢偏向它 —— 走进房间就转过去看床 / 柜子，不是对着前面的墙走到头、停下再转身
const TAIL = 0.2; // ARRIVE 往哪偏按「走进终点的方向」算：终点前不到这么长（米）的小折线（A* 格子中心 → 真正的终点，常常朝着别处甚至朝后）不算
const OPEN = 1.5; // ARRIVE 偏过去的方向（终点上：走的方向往要转到的朝向偏，最多 LEAD）这么远（米）以内有墙 / 洞 → 不提前偏（到了再转身）：免得侧过头对着一面墙走
const PITCH_K = 4; // 走路时视线慢慢回到平视
const KEY_TURN = 1.7; // Q / E 转身（弧度 / 秒）
const PITCH_MAX = 1.2;
const LOOK = 2.5; // controls.target = 眼睛前面这么远
const DRAG_TOUCH = 9; // 手指挪过这么多像素才算拖
const DRAG_MOUSE = 5;
const TAP_MS = 700; // 按下到抬起不超过这么久才算点
const NEAR_HOLE = 3; // 离楼梯间 / 挑空这么近：上下那一层的家具也画
const POSE_MS = 100; // 'pose' 最多这么密
const FLOOR_EPS = 0.12; // 点到的地方离地面这么近 = 点到地板
const BACK_STEP = 0.1; // 点到墙 / 家具：往镜头那边一步步退回来
const THROUGH = 0.8; // 点到门扇：走到门那一边这么远
const SUB = 0.1; // 摇杆一步最多走多远（再长就分几步：不会一下跨过墙）
const DRAG_FAR = 15; // 搬家具：手指指到的地面离眼睛超过这么远（地平线附近）就不跟（差一点点就跳很远）
const FADE_MS = 240; // 跳到收藏的角度 / 没有楼梯的楼层：淡出 + 淡入一共多少毫秒

const isHole = (r) => !!(r?.stairId || ROOM_TYPES[r?.type]?.stair || ROOM_TYPES[r?.type]?.void);
const isStair = (r) => !!(r?.stairId || ROOM_TYPES[r?.type]?.stair);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
/** 从 b 转到 a 最近的那个方向（−π … π） */
export const angleDiff = (a, b) => wrap(a - b);
/** 走路时的曝光倍数（walk.ev）：跟着时段，夜色 day.night 0–1（engine.day） */
export const walkEv = (day) => WALK_EV * (1 + NIGHT_EV * (Number(day?.night) || 0));
const rectGap = (r, x, z) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - z, 0, z - (r.y + r.d)));
const isUnder = (o, root) => {
  for (let p = o; p; p = p.parent) if (p === root) return true;
  return false;
};

// ───────────────────────── 纯函数（Node 测试） ─────────────────────────

const _q = { fi: 0, x: 0, z: 0 };
const clr = (nav, fi, x, z) => {
  _q.fi = fi;
  _q.x = x;
  _q.z = z;
  return clearance(nav, _q);
};

/** (x, z) 离墙 / 家具（导航的 clearance）、离开着 / 在动的门扇（block.clearOf：门扇当一块薄墙）多远，取近的 */
function room(nav, fi, x, z, block) {
  const c = clr(nav, fi, x, z);
  if (!block) return c;
  const d = block.clearOf(fi, x, z);
  return d < c ? d : c;
}

/** 能不能站到 (x, z)：离墙 / 家具 / 门扇 ≥ 半径；本来就卡在里面（c0 < 半径）只许往更空的地方挪 */
function canStand(nav, fi, x, z, c0, block) {
  const c = room(nav, fi, x, z, block);
  return c >= nav.radius - 1e-6 || (c0 < nav.radius - 1e-6 && c > c0 + 1e-6);
}

/**
 * 摇杆走一步：从 p（{ fi, x, z }）挪 (dx, dz)，碰到墙 / 家具（/ 门扇）就贴着滑（去掉往墙里的那一分量，再不行只走 x 或 z）。
 * 走得过去 = 离墙 / 家具 ≥ 半径；block（可以不给）= 别的障碍：block.clearOf(fi, x, z) → 离它多远（门：开着 / 在动的门扇，doors.clearOf），
 * 也要 ≥ 半径。本来就卡在里面（家具刚搬过来、门扇转过来）只许往空的地方挪。每 10cm 一小步（不会一下跨过墙）。
 * → out { x, z, moved }（每帧都跑：不建新对象）
 */
export function slideMove(nav, p, dx, dz, out = { x: 0, z: 0, moved: false }, block = null) {
  out.x = p.x;
  out.z = p.z;
  out.moved = false;
  const len = Math.hypot(dx, dz);
  if (!nav || !(len > 1e-9)) return out;
  const fi = p.fi;
  const n = Math.ceil(len / SUB);
  const sx = dx / n;
  const sz = dz / n;
  const h = 0.03;
  for (let i = 0; i < n; i++) {
    const x = out.x;
    const z = out.z;
    const c0 = room(nav, fi, x, z, block);
    let nx = x + sx;
    let nz = z + sz;
    let ok = canStand(nav, fi, nx, nz, c0, block);
    if (!ok) {
      // 贴着滑：clearance 的梯度 = 离开障碍的方向，去掉往里的那一分量
      let gx = room(nav, fi, nx + h, nz, block) - room(nav, fi, nx - h, nz, block);
      let gz = room(nav, fi, nx, nz + h, block) - room(nav, fi, nx, nz - h, block);
      const gl = Math.hypot(gx, gz);
      if (gl > 1e-9) {
        gx /= gl;
        gz /= gl;
        const dot = sx * gx + sz * gz;
        if (dot < 0) {
          nx = x + sx - dot * gx;
          nz = z + sz - dot * gz;
          ok = canStand(nav, fi, nx, nz, c0, block);
        }
      }
    }
    // 再不行：只走 x 或只走 z（大的那一分量先试）
    const xFirst = Math.abs(sx) >= Math.abs(sz);
    for (let k = 0; k < 2 && !ok; k++) {
      const alongX = xFirst === (k === 0);
      if (alongX ? !sx : !sz) continue;
      nx = alongX ? x + sx : x;
      nz = alongX ? z : z + sz;
      ok = canStand(nav, fi, nx, nz, c0, block);
    }
    if (!ok) break;
    out.x = nx;
    out.z = nz;
    out.moved = true;
  }
  return out;
}

/**
 * 哪几层的家具要画（位掩码，第 i 位 = 第 i 层）：人在的这一层；离这一层的楼梯间 / 挑空 ≤ R → 再加上下那一层；
 * 离楼上那一层的挑空 / 楼梯洞 ≤ R（从下面往上看得见）→ 再加楼上。
 */
export function furnitureMask(navData, fi, x, z, R = NEAR_HOLE) {
  const floors = navData?.floors || [];
  let m = 1 << fi;
  for (const r of floors[fi]?.rooms || [])
    if (isHole(r) && rectGap(r, x, z) <= R) {
      if (fi > 0) m |= 1 << (fi - 1);
      if (fi + 1 < floors.length) m |= 1 << (fi + 1);
    }
  for (const r of floors[fi + 1]?.rooms || []) if (isHole(r) && rectGap(r, x, z) <= R) m |= 1 << (fi + 1);
  return m;
}

/** 世界高度 y 在哪一层：地面不高于 y（留一点）的楼层里最高的那一层 */
export function floorAtY(floors, y) {
  let fi = 0;
  let best = -Infinity;
  (floors || []).forEach((f, i) => {
    const e = f.elev || 0;
    if (y >= e - FLOOR_EPS && e > best) [fi, best] = [i, e];
  });
  return fi;
}

// ───────────────────────── 控制器 ─────────────────────────

/**
 * createWalk(engine, { project, api, wish, onEvent }) → {
 *   enter() → Promise<boolean>        飞进去（落地 → true；中途被退出 → false）
 *   exit({ instant }) → Promise        飞回去 / 一下子回去；之后 engine.walk、engine.onTick = null
 *   dispose()                          卸载：没出来就一下子出来，拿掉监听
 *   setTool(id)                        'walk' | 'paint' | 'floor' | 'furnish' | 'light' | 'measure' | 'photo'
 *   joystick(x, y)                     −1…1：y > 0 = 往前（摇杆往上推，Joystick.jsx 的 joyVector），x > 0 = 往右；0, 0 停
 *   walkTo({ fi, x, z, yaw? }) → Promise<boolean>   走到了（给了 yaw 就再转过去）→ true；被打断 / 走不到 → false
 *   goFloor(fi) → Promise<boolean>     走到那一层（经过楼梯；没有楼梯连着就淡出淡入过去）
 *   pose() → { fi, floor, x, z, yaw, pitch, room }   z = 平面 y；room = 房间 id
 *   project(v3) → { x, y, visible }    世界坐标 → 画布上的像素（DOM 叠层用）
 *   photo() → { floor, x, z, yaw, pitch, hour, room }   给 marks.addMark
 *   goto(mark) → Promise<boolean>      淡出淡入跳到收藏的角度（几点钟也回去）；连点两下只淡一次（见 fade）
 *   select(id | null)                  家具工具：选中 / 取消（面板删掉、关掉时用）
 *   clearMeasure()                     量尺：清掉
 *   tour: { start(from), stop(), next(), running, state() }
 *   on(evt, fn) → off                  事件见下；也都转给 onEvent(evt, payload)
 *   update(project)                    project 变了（WalkMode 每次都调）：家具 → 重建那一层的导航；时间 → 夜灯
 *   resize()                           画布变了尺寸（自己会听，也可以手动调）
 *   phase, tool, nav
 * }
 * 事件：'state' { phase: 'flying-in' | 'walking' | 'flying-out' | 'out' } · 'pose' pose() · 'room' { room, id } · 'floor' { fi, id }
 *   · 'pick' { slot, matId, hit, room }（slot = null：点到的不能换）· 'item' { id | null }
 *   · 'measure' { a, b, mm, text, wall }（第一下：b = null，点到墙 wall = wallDims；第二下：a、b、mm、text；清掉：全是 null）
 *   · 'tour' { stop, line }（结束：都是 null）· 'tourState' tour.state() · 'error' { error }
 */
export function createWalk(engine, { project = null, api = null, wish = false, onEvent = null, tourOpts = null } = {}) {
  const subs = new Map();
  const win = typeof window !== 'undefined' ? window : null;
  let proj = project;
  let phase = 'out';
  let tool = 'walk';
  let disposed = false;
  let saved = null;
  let nd = null;
  let nav = null;
  let doors = null;
  let marks = null;
  let walk = null;
  let entering = null;
  let exiting = null;
  let last = null; // 上一帧的时间（毫秒）
  let fMask = -1; // 现在画了哪几层的家具
  let room = null; // 人在的房间
  let poseAt = -Infinity;
  let posePending = false;
  let tourInst = null;
  let tourStale = true;
  let jump = null; // goto / goFloor 正在淡出淡入：{ swapped, promise }

  // 人：fi 楼层下标、平面 x / z、眼睛的世界 y、朝向
  const P = { fi: 0, x: 0, z: 0, y: EYE };
  let yaw = 0;
  let pitch = 0;
  let route = null; // 正在走的路
  const stick = { x: 0, y: 0 };
  const keys = { f: 0, b: 0, l: 0, r: 0, tl: 0, tr: 0 };
  const vel = { x: 0, z: 0 };
  const moved = { x: 0, z: 0, moved: false };
  const ahead = []; // 这一层接下来要走的点（给门）
  let ptr = null; // 按下的那一根指针
  let selected = null; // 家具工具选中的
  let drag = null; // 正在搬的家具
  const meas = { a: null, b: null };

  const _f = new THREE.Vector3();
  const _v = new THREE.Vector3();
  const _aim = { x: 0, z: 0, next: false, short: false }; // aimAt 的结果（每帧不建新对象）；next = 那一点已经在后面的段上了，short = 路不够 L 长（那一点 = 终点）
  let seeLeft = 0; // 这一帧 sees 还能看几下（aimAt 开头 = SEE_MAX）

  const items = () => (Array.isArray(proj?.furniture) ? proj.furniture : []);
  const elevOf = (fi) => nd?.floors?.[fi]?.elev || 0;
  const floorId = (fi) => nd?.floors?.[fi]?.id ?? engine.floors?.[fi]?.id ?? null;
  const shadow = () => {
    if (engine.renderer?.shadowMap) engine.renderer.shadowMap.needsUpdate = true;
    engine.dirty = true;
  };

  // ── 事件 ──
  function emit(evt, payload) {
    const set = subs.get(evt);
    if (set)
      for (const fn of [...set]) {
        try {
          fn(payload);
        } catch (e) {
          if (import.meta.env?.DEV) console.error('[walk]', evt, e);
        }
      }
    try {
      onEvent?.(evt, payload);
    } catch (e) {
      if (import.meta.env?.DEV) console.error('[walk]', evt, e);
    }
  }
  function setPhase(p) {
    if (phase === p) return;
    phase = p;
    emit('state', { phase: p });
  }

  // ── 姿势 ──
  function pose() {
    return { fi: P.fi, floor: floorId(P.fi), x: P.x, z: P.z, yaw, pitch, room: room?.id ?? null };
  }
  function applyCamera() {
    const cam = engine.camera;
    cam.position.set(P.x, P.y, P.z);
    // 和 Euler(pitch, yaw, 0, 'YXZ') 同一个四元数（three 的 setFromEuler 公式）：不 import Euler（第一块少一个导出），
    // 也不改 camera.rotation 的轴序（回到鸟瞰后 OrbitControls 照旧）
    const ca = Math.cos(pitch / 2);
    const sa = Math.sin(pitch / 2);
    const cb = Math.cos(yaw / 2);
    const sb = Math.sin(yaw / 2);
    cam.quaternion.set(sa * cb, ca * sb, -sa * sb, ca * cb);
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    engine.controls.target.copy(cam.position).addScaledVector(_f, LOOK);
    cam.updateMatrixWorld();
    engine.placeFill?.();
    posePending = true;
  }
  /** 家具：只画人在的这一层（+ 楼梯 / 挑空旁边的上下层）；变了 → 影子重画 */
  function applyFurniture(force = false) {
    const m = furnitureMask(nd, P.fi, P.x, P.z);
    if (m === fMask && !force) return false;
    fMask = m;
    let changed = false;
    (engine.floors || []).forEach((F, i) => {
      const vis = !!(m & (1 << i));
      if (F.furn && F.furn.visible !== vis) {
        F.furn.visible = vis;
        changed = true;
      }
    });
    if (changed || force) shadow();
    return changed;
  }
  /** 换房间：夜灯按人在哪排（近的先拿到灯）+ 'room' */
  function checkRoom(force = false) {
    const r = nav ? roomAt(nav, P) : null;
    if (r === room && !force) return;
    room = r;
    engine.placeRoomLights?.({ x: P.x, z: P.z });
    emit('room', { room: r, id: r?.id ?? null });
  }
  /** 换到第 fi 层（楼梯走过一半、跳到收藏的角度）：引擎看那一层（每层的家具都会被打开）→ 再按规则藏 */
  function switchFloor(fi) {
    if (fi === P.fi && engine.activeIdx === fi) return;
    P.fi = fi;
    const id = floorId(fi);
    if (id != null) engine.setFloorView(id, { instant: true, quiet: true });
    applyFurniture(true);
    emit('floor', { fi, id });
  }
  function fit() {
    if (phase !== 'walking' || !walk) return;
    const W = engine.container?.clientWidth || 1;
    const H = engine.container?.clientHeight || 1;
    walk.fov = walkFov(W, H);
    walk.vo = walkVo(W, H);
    engine.applyView();
    engine.dirty = true;
  }

  // ── 走一条路 ──
  /** 路走完 / 停下：要去的那一圈和路淡掉，Promise 给结果 */
  function endRoute(ok) {
    const R = route;
    if (!R) return;
    route = null;
    marks?.target(null);
    marks?.path(null);
    posePending = true;
    R.resolve?.(ok);
    if (R.then) start(R.then.to, R.then.yaw, R.then.resolve);
  }
  /** 停下脚步（客人自己动了、带逛跳过）。在楼梯上：先走完这一段楼梯再停（不停在半空），Promise 马上给 false */
  function halt() {
    vel.x = 0;
    vel.z = 0;
    const R = route;
    if (!R) return;
    if (R.legs[R.li]?.kind === 'stair' && !R.arrived) {
      R.resolve?.(false);
      R.resolve = null;
      R.then?.resolve?.(false);
      R.then = null;
      R.cut = true;
      return;
    }
    endRoute(false);
  }
  /** 一段路开始：走路那一段画地上的路 */
  function legStart(R) {
    const leg = R.legs[R.li];
    R.legDone = 0;
    if (leg.kind === 'walk') {
      if (leg.fi !== P.fi) switchFloor(leg.fi);
      P.y = elevOf(leg.fi) + EYE;
      const y = elevOf(leg.fi);
      marks?.path(leg.pts.map((p) => ({ x: p.x, y, z: p.z })));
    } else marks?.path(null);
  }
  /** 沿着路往前走 dist 米 → 实际走了多少 */
  function advance(R, dist) {
    let went = 0;
    while (dist > 1e-9 && !R.arrived) {
      const leg = R.legs[R.li];
      const q = leg.pts[R.pi];
      const stair = leg.kind === 'stair';
      if (!q) {
        nextLeg(R);
        continue;
      }
      const ty = stair ? elevOf(leg.from) + q.y + EYE : P.y;
      const dx = q.x - P.x;
      const dz = q.z - P.z;
      const dy = ty - P.y;
      const d = Math.hypot(dx, dz, dy);
      if (d <= dist) {
        P.x = q.x;
        P.z = q.z;
        P.y = ty;
        dist -= d;
        went += d;
        R.legDone += d;
        R.pi++;
      } else {
        const k = dist / d;
        P.x += dx * k;
        P.z += dz * k;
        P.y += dy * k;
        went += dist;
        R.legDone += dist;
        dist = 0;
      }
      // 楼梯走过一半的高度：换到要去的那一层
      if (stair && !leg.switched && Math.abs(P.y - EYE - elevOf(leg.from)) >= Math.abs(leg.rise) / 2 - 1e-9) {
        leg.switched = true;
        switchFloor(leg.to);
      }
      if (R.pi >= leg.pts.length) nextLeg(R);
    }
    return went;
  }
  function nextLeg(R) {
    const leg = R.legs[R.li];
    if (leg?.kind === 'stair' && !leg.switched) {
      leg.switched = true;
      switchFloor(leg.to);
    }
    // 楼梯走完了、客人刚才要停 / 要去别的地方
    if (R.cut) {
      R.arrived = true;
      R.yaw = null;
      return;
    }
    if (R.li + 1 >= R.legs.length) {
      R.arrived = true;
      marks?.target(null);
      marks?.path(null);
      return;
    }
    R.li++;
    R.pi = 1;
    legStart(R);
  }
  /**
   * 从眼睛（P）到这一层的 (x, z)：直线上离墙 / 家具都有 SEE 以上（每 10cm 看一下）= 看得见，不是隔着墙角 / 门框。
   * 每帧最多看 SEE_MAX 下（aimAt 开头重置 seeLeft）：看够了就当看不见（看近一点，不会更糟）—— iPad 上每帧的花销有个顶
   */
  function sees(x, z) {
    const dx = x - P.x;
    const dz = z - P.z;
    const n = Math.ceil(Math.hypot(dx, dz) / 0.1);
    if (n > seeLeft) return false;
    seeLeft -= n;
    for (let i = 1; i <= n; i++) if (clr(nav, P.fi, P.x + (dx * i) / n, P.z + (dz * i) / n) < SEE) return false;
    return true;
  }
  /**
   * 看哪里 → _aim：沿着还没走的路往前 L 米（只算水平 x / z）的那一点。从现在的位置经过 leg.pts[R.pi…]，这一段走完接着下一段
   * （下一段从 pts[1] 起，和 advance 一样）；楼梯走完就停（R.cut）→ 只到这一段的头；路不够长 → 终点（快到了就看着最后一段）。
   * 人在平地这一段上：只到看得见的地方（sees；拐过墙角 / 门框以后的那一截还看不见 → 停在这一截上最远看得见的那一点）；
   * 脚下这一截（P → pts[R.pi]）就是要走的直线，不用查；楼梯、楼上楼下不查。only = 只看这一段（楼梯）。
   */
  function aimAt(R, L, only = false) {
    let px = P.x;
    let pz = P.z;
    let rem = L;
    seeLeft = SEE_MAX;
    _aim.short = false;
    const cur = R.legs[R.li];
    const look = cur.kind === 'walk' && cur.fi === P.fi;
    const end = R.cut || only ? R.li : R.legs.length - 1;
    for (let li = R.li; li <= end; li++) {
      const pts = R.legs[li].pts;
      for (let i = li === R.li ? R.pi : 1; i < pts.length; i++) {
        const dx = pts[i].x - px;
        const dz = pts[i].z - pz;
        const d = Math.hypot(dx, dz);
        const k = d > rem ? rem / d : 1;
        const tx = px + dx * k;
        const tz = pz + dz * k;
        if (look && li === R.li && i > R.pi && !sees(tx, tz)) {
          let lo = 0;
          let hi = 1;
          for (let s = 0; s < 5; s++) {
            const m = (lo + hi) / 2;
            if (sees(px + (tx - px) * m, pz + (tz - pz) * m)) lo = m;
            else hi = m;
          }
          _aim.x = px + (tx - px) * lo;
          _aim.z = pz + (tz - pz) * lo;
          _aim.next = false;
          return _aim;
        }
        if (d >= rem) {
          _aim.x = tx;
          _aim.z = tz;
          _aim.next = li > R.li;
          return _aim;
        }
        rem -= d;
        px = pts[i].x;
        pz = pts[i].z;
      }
    }
    _aim.x = px;
    _aim.z = pz;
    _aim.next = end > R.li;
    _aim.short = true;
    return _aim;
  }
  /**
   * 楼梯上走到平的一截（平台），后面还有一跑：看下一跑的尽头 → _aim。U 形楼梯的平台上，往前 AHEAD_STAIR 米正好是下一跑的第一级
   * （比眼睛低一米多，在画面下面）—— 画面里只剩对面的墙；顺着下一跑看上去（下楼：看下去）才看得到台阶、扶手和楼上。
   * 不在平的一截上 / 后面没有下一跑（楼梯顶上那一小截）→ null（照 aimAt）
   */
  function landingAim(R) {
    const pts = R.legs[R.li].pts;
    const n = pts.length;
    const flat = (a, b) => Math.abs((pts[b].y || 0) - (pts[a].y || 0)) < 1e-3;
    let j = R.pi;
    if (j < 1 || j >= n || !flat(j - 1, j)) return null;
    while (j < n - 1 && flat(j, j + 1)) j++;
    if (j >= n - 1) return null;
    while (j < n - 1 && !flat(j, j + 1)) j++;
    _aim.x = pts[j].x;
    _aim.z = pts[j].z;
    _aim.next = false;
    _aim.short = false;
    return _aim;
  }
  /** 从 (x, z) 沿 yaw 到第一面墙 / 洞 / 屋外（不算家具：家具正是要看的）多远；最多 max */
  function wallRay(fi, x, z, yaw, max) {
    const F = nav.floors[fi];
    const dx = -Math.sin(yaw);
    const dz = -Math.cos(yaw);
    for (let s = 0; s < max; s += F.cell / 2) {
      const i = Math.floor((x + dx * s - F.x0) / F.cell);
      const j = Math.floor((z + dz * s - F.z0) / F.cell);
      if (i < 0 || j < 0 || i >= F.nx || j >= F.nz || F.base[j * F.nx + i]) return s;
    }
    return max;
  }
  /**
   * 最后 ARRIVE 米往哪个方向偏（每条路只算一次）：走进终点的方向（跳过终点前不到 TAIL 的小折线）往要转到的朝向偏，最多 LEAD
   * （要转到的朝向在背后：往近的那边偏）。站在终点朝那个方向 OPEN 以内就是墙 / 洞 → false（不偏，到了再转身）；最后一段是楼梯 → false。
   * 顺便记下走进终点的方向（R.arriveMv）和跳过的那一小截有多长（R.hook）：走那一小截的时候按 R.arriveMv 夹，不跟着折线扭头
   */
  function arriveYaw(R) {
    const leg = R.legs[R.legs.length - 1];
    const pts = leg.pts;
    if (leg.kind !== 'walk' || !nav?.floors[leg.fi]) return false;
    let hook = 0;
    for (let k = pts.length - 1; k > 0; k--) {
      const dx = pts[k].x - pts[k - 1].x;
      const dz = pts[k].z - pts[k - 1].z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1e-6 || (d2 < TAIL * TAIL && k > 1)) {
        hook += Math.sqrt(d2);
        continue;
      }
      const mv = Math.atan2(-dx, -dz);
      R.arriveMv = mv;
      R.hook = hook;
      const c = wrap(mv + clamp(angleDiff(R.yaw, mv), -LEAD, LEAD));
      const e = pts[pts.length - 1];
      return wallRay(leg.fi, e.x, e.z, c, OPEN) >= OPEN ? c : false;
    }
    return false;
  }
  /** 每帧：沿路走（起步加速、快到了减速；看着前面 AHEAD 米的那一点，拐弯之前就转过去；看的方向和走的方向差太多就慢一点），到了再转到 yaw */
  function follow(R, dt) {
    if (R.arrived) {
      // 不用转身，或者客人自己拖着转了头：到了就算
      if (R.yaw == null || R.free) {
        endRoute(true);
        return true;
      }
      const d = angleDiff(R.yaw, yaw);
      const dp = -pitch;
      if (Math.abs(d) < 0.01 && Math.abs(dp) < 0.01) {
        yaw = wrap(R.yaw);
        pitch = 0;
        endRoute(true);
        return true;
      }
      const k = 1 - Math.exp(-dt * TURN_K);
      yaw = wrap(yaw + (Math.abs(d) < 0.01 ? d : d * k));
      pitch += Math.abs(dp) < 0.01 ? dp : dp * k;
      return true;
    }
    const leg = R.legs[R.li];
    const stair = leg.kind === 'stair';
    const left = Math.max(0, R.total - R.walked);
    R.v = Math.min(SPEED, R.v + ACCEL * dt, Math.sqrt(2 * ACCEL * left) + 0.05);
    let face = 1;
    if (!R.free) {
      // 走的方向：朝着下一个点（贴着脚下的跳过）
      let qi = Math.min(R.pi, leg.pts.length - 1);
      while (qi < leg.pts.length - 1 && (leg.pts[qi].x - P.x) ** 2 + (leg.pts[qi].z - P.z) ** 2 <= 1e-4) qi++;
      const dx = leg.pts[qi].x - P.x;
      const dz = leg.pts[qi].z - P.z;
      const mv = dx * dx + dz * dz > 1e-4 ? Math.atan2(-dx, -dz) : null;
      // 看的方向：路上往前 AHEAD 米（楼梯上先看这一段楼梯往前 AHEAD_STAIR 米）、看得见的那一点（aimAt），最多比走的方向偏 LEAD
      // （那一点还在这一段楼梯上：LEAD_STAIR；已经到楼梯外面了还用 LEAD —— 不然走下楼梯的那一下偏的上限变小，头会往回扭一下）
      // 楼梯的平台上：看下一跑的尽头（landingAim）
      let a = stair ? landingAim(R) || aimAt(R, AHEAD_STAIR, true) : null;
      if (!a || a.short) a = aimAt(R, AHEAD);
      const ax = a.x - P.x;
      const az = a.z - P.z;
      const lead = stair && !a.next ? LEAD_STAIR : LEAD;
      let aimYaw = ax * ax + az * az > 1e-4 ? Math.atan2(-ax, -az) : mv;
      // 有要转到的朝向：最后 ARRIVE 米慢慢偏过去（arriveYaw：最多比走的方向偏 LEAD；那边是墙就不偏）。
      // 从 0 慢慢加：路很短 → 后一半；楼梯下来最后那一段比 ARRIVE 短 → 从踏下楼梯那一下开始（不是一下子偏一大半，头往回扭）。
      let w = 0;
      if (aimYaw != null && R.yaw != null && !stair) {
        w = 1 - Math.min(1, left / Math.min(ARRIVE, R.total / 2, R.tail));
        if (w > 0 && R.arrive == null) R.arrive = arriveYaw(R);
      }
      const blend = w > 0 && R.arrive != null && R.arrive !== false;
      // 按走的方向 ± lead 夹住；偏过去的时候走到终点前那一小截折线上（拐角前 5cm 起：走的方向贴着拐角就已经换成折线的了）：
      // 按走进终点的方向夹（不跟着折线扭头、到了再扭回来）
      const m = blend && left <= R.hook + 0.05 ? R.arriveMv : mv;
      if (aimYaw != null && m != null) aimYaw = m + clamp(angleDiff(aimYaw, m), -lead, lead);
      if (blend) {
        // 偏多少接着上一帧的那一边算（R.arriveD 不在 ±π 那里跳到另一边），夹的时候也不绕 ±π
        let d = angleDiff(R.arrive, aimYaw);
        if (R.arriveD != null && Math.abs(d - R.arriveD) > Math.PI) d -= Math.sign(d - R.arriveD) * 2 * Math.PI;
        R.arriveD = d;
        aimYaw = m != null ? m + clamp(angleDiff(aimYaw, m) + d * w, -lead, lead) : wrap(aimYaw + d * w);
      }
      // 最后 END_EASE 米（很短的路：后一半）越转越少：终点前常有一小截折线（A* 格子中心 → 真正的终点），朝着它看会在停下的那一下甩头
      if (aimYaw != null) yaw = wrap(yaw + angleDiff(aimYaw, yaw) * (1 - Math.exp(-dt * TURN_K)) * Math.min(1, left / Math.min(END_EASE, R.total / 2)));
      // 看的方向和走的方向差 SIDE 以上就慢下来（差 90° → ×0.25，楼梯上最多 ×FACE_STAIR）：不横着快走
      if (mv != null) {
        const off = Math.abs(angleDiff(mv, yaw));
        if (off > SIDE) face = Math.max(stair ? FACE_STAIR : 0.25, Math.cos((Math.min(off, Math.PI / 2) - SIDE) * (Math.PI / 2 / (Math.PI / 2 - SIDE))));
      }
      // 楼梯：往上只抬一点头（看得到前面的台阶，不是对着一面墙 / 楼板底）、往下稍微低头；平地：回到平视
      const want = stair ? clamp((leg.rise > 0 ? 0.2 : 0.7) * Math.atan2(leg.rise, leg.run || 1), -0.45, 0.3) : 0;
      pitch += (want - pitch) * (1 - Math.exp(-dt * PITCH_K));
    }
    R.walked += advance(R, R.v * dt * face * (stair ? STAIR_K : 1));
    if (!R.arrived) {
      const cur = R.legs[R.li];
      if (cur.kind === 'walk') marks?.progress(R.legDone / (cur.len || 1), R.total - R.walked);
    }
    return true;
  }
  /** 站在 p（fi 层）看这个房间的中间：yaw；离中间不到 0.6m（本来就在中间）或者不在房间里 → null（不转） */
  function faceRoom(fi, p) {
    const r = nav ? roomAt(nav, { fi, x: p.x, z: p.z }) : null;
    if (!r) return null;
    const dx = r.x + r.w / 2 - p.x;
    const dz = r.y + r.d / 2 - p.z;
    return dx * dx + dz * dz < 0.36 ? null : Math.atan2(-dx, -dz);
  }
  /** 开始走：从现在的位置找路 → route；走不到 → resolve(false) */
  function start(to, wantYaw, resolve) {
    const fi = clamp(Math.round(Number(to?.fi) || 0), 0, Math.max(0, (nav?.floors?.length || 1) - 1));
    const p = nav && Number.isFinite(+to?.x) && Number.isFinite(+to?.z) ? findPath(nav, { fi: P.fi, x: P.x, z: P.z }, { fi, x: +to.x, z: +to.z }) : null;
    if (!p) return resolve?.(false);
    const legs = p.legs.map((l) => {
      const leg = { ...l, len: 0, rise: 0, run: 0, switched: false };
      for (let i = 1; i < l.pts.length; i++) {
        const h = Math.hypot(l.pts[i].x - l.pts[i - 1].x, l.pts[i].z - l.pts[i - 1].z);
        leg.run += h;
        leg.len += Math.hypot(h, (l.pts[i].y || 0) - (l.pts[i - 1].y || 0));
      }
      if (l.kind === 'stair') leg.rise = l.pts[l.pts.length - 1].y;
      return leg;
    });
    const first = legs[0].pts[0];
    const lead = Math.hypot(first.x - P.x, first.z - P.z);
    if (legs[0].kind === 'walk') legs[0].len += lead;
    const tail = legs[legs.length - 1]; // 最后一段：走路 → ARRIVE 最多从它的头上开始偏
    const R = { legs, li: 0, pi: 0, total: p.length + lead, walked: 0, v: 0, yaw: Number.isFinite(wantYaw) ? wantYaw : null, resolve, free: false, arrived: false, cut: false, then: null, legDone: 0, arrive: null, arriveD: null, arriveMv: null, hook: 0, tail: tail.kind === 'walk' ? tail.len : 0 };
    route = R;
    const end = legs[legs.length - 1];
    const fe = end.kind === 'walk' ? end.fi : end.to;
    const ep = end.pts[end.pts.length - 1];
    // 没说朝哪边、又换了楼层（上楼 / 下楼）：到了转向这个房间的中间 —— 不然朝着最后一段路，常常是一面空墙
    if (R.yaw == null && legs.some((l) => l.kind === 'stair')) R.yaw = faceRoom(fe, ep);
    if (R.total < 0.03) {
      R.arrived = true;
      P.x = ep.x;
      P.z = ep.z;
      return;
    }
    marks?.target({ x: ep.x, y: elevOf(fe), z: ep.z });
    legStart(R);
  }
  /** 走过去（同时只有一条路：新的来了，旧的 → false；在楼梯上就等这一段楼梯走完再去） */
  function go(to, wantYaw = null) {
    if (phase !== 'walking' || !nav) return Promise.resolve(false);
    return new Promise((resolve) => {
      const R = route;
      if (R && !R.arrived && R.legs[R.li]?.kind === 'stair') {
        R.resolve?.(false);
        R.resolve = null;
        R.then?.resolve?.(false);
        R.cut = true;
        R.then = { to, yaw: wantYaw, resolve };
        return;
      }
      if (R) endRoute(false);
      start(to, wantYaw, resolve);
    });
  }
  /** 客人自己动了：带逛停下、路不走了 */
  function guest() {
    if (tourInst?.running) tourInst.stop();
    halt();
  }

  // ── 一下子挪过去（收藏的角度、没有楼梯连着的楼层） ──
  function place(fi, x, z, y0 = yaw, p0 = 0) {
    if (route) {
      const R = route;
      route = null;
      R.resolve?.(false);
      R.then?.resolve?.(false);
      marks?.target(null);
      marks?.path(null);
    }
    if (fi !== P.fi || engine.activeIdx !== fi) switchFloor(fi);
    P.x = x;
    P.z = z;
    P.y = elevOf(fi) + EYE;
    yaw = wrap(Number(y0) || 0);
    pitch = clamp(Number(p0) || 0, -PITCH_MAX, PITCH_MAX);
    applyCamera();
    applyFurniture();
    checkRoom();
    if (doors?.update(engine.camera.position, null, 0)) shadow();
    engine.dirty = true;
  }
  /**
   * 淡出到纸色 → swap() → 淡入 → after() 的结果（flight.js fadeCanvas：一块画布同时只有一次淡出淡入，淡完回到画布本来的样子）。
   * 连点两下（收藏的角度、楼层）：还在淡出 → 一起换（后点的最后换）；已经换过去、正在淡入 → 这一下不算，给正在跑的那一下的结果。
   * 没有画布样式（Node）就直接换。
   */
  function fade(swap, after) {
    const style = engine.renderer?.domElement?.style;
    if (!style || typeof setTimeout !== 'function') {
      swap();
      return Promise.resolve().then(after);
    }
    if (jump?.swapped) return jump.promise;
    const J = jump || (jump = { swapped: false, promise: null });
    const done = () => {
      if (jump === J) jump = null;
    };
    J.promise = fadeCanvas(
      engine,
      () => {
        J.swapped = true;
        swap();
      },
      FADE_MS,
    ).then(
      () => {
        done();
        return after();
      },
      (e) => {
        done();
        throw e;
      },
    );
    return J.promise;
  }

  // ── 点一下 ──
  /** 点到的东西在哪一层：天花 = 它自己那一层；其余按高度 */
  function floorOfHit(hit) {
    const o = hit.object;
    const floors = engine.floors || [];
    for (let i = 0; i < floors.length; i++) if (floors[i].ceiling && isUnder(o, floors[i].ceiling)) return i;
    return floorAtY(nd?.floors, hit.point.y);
  }
  function leafOf(o) {
    for (let p = o; p; p = p.parent) if (p.userData?.walkDoor != null) return doors?.leaves?.find((L) => L.id === p.userData.walkDoor) || null;
    return null;
  }
  /** 楼梯（梯段 / 楼上的洞）→ 楼梯另一头那一层的楼梯口 */
  function stairGoal(r, hf) {
    const links = nav?.stairs || [];
    const link = links.find((s) => s.stair === r.stairId) || links.find((s) => s.from === hf || s.to === hf) || null;
    if (!link) return null;
    if (P.fi === link.from) return { fi: link.to, ...link.exit };
    if (P.fi === link.to) return { fi: link.from, ...link.entry };
    return hf === link.from ? { fi: link.from, ...link.entry } : { fi: link.to, ...link.exit };
  }
  /** 走路工具：点到哪里 → 要去的地方 { fi, x, z } | null */
  function walkGoal(hit) {
    if (!hit?.point || !nav) return null;
    const pt = hit.point;
    // 门扇：穿过去，到门那一边
    const L = leafOf(hit.object);
    if (L) {
      const side = L.fi === P.fi ? sideOf(L, P) : 0;
      const far = side ? -side : 1;
      const u = (L.a + L.b) / 2;
      const q = L.axis === 'x' ? { x: u, z: L.c + far * THROUGH } : { x: L.c + far * THROUGH, z: u };
      return nearest(nav, { fi: L.fi, ...q });
    }
    const hf = floorOfHit(hit);
    const r = roomAt(nav, { fi: hf, x: pt.x, z: pt.z });
    if (r && isStair(r)) {
      const g = stairGoal(r, hf);
      if (g) return nearest(nav, { fi: g.fi, x: g.x, z: g.z });
    }
    let x = pt.x;
    let z = pt.z;
    // 墙 / 家具 / 天花：从点到的地方往镜头那边退，退到第一个走得过去的地方（它前面）
    if (pt.y - elevOf(hf) > FLOOR_EPS) {
      const dx = P.x - x;
      const dz = P.z - z;
      const d = Math.hypot(dx, dz);
      for (let s = 0; s <= d; s += BACK_STEP) {
        const qx = x + (dx / (d || 1)) * s;
        const qz = z + (dz / (d || 1)) * s;
        if (clr(nav, hf, qx, qz) >= nav.radius) {
          x = qx;
          z = qz;
          break;
        }
      }
    }
    return nearest(nav, { fi: hf, x, z });
  }
  /** 点到的那一面墙（navData 的墙段）；没有 → null */
  function wallOf(hit, hf) {
    if (hit.object?.userData?.itemId || leafOf(hit.object)) return null;
    const f = nd?.floors?.[hf];
    const pt = hit.point;
    const y = pt.y - (f?.elev || 0);
    if (!f || y < 0.05 || y > (f.ceil || 2.8) - 0.05) return null;
    let best = null;
    let bd = Infinity;
    for (const w of f.walls || []) {
      const along = w.axis === 'x' ? pt.x : pt.z;
      const off = Math.abs((w.axis === 'x' ? pt.z : pt.x) - w.c);
      if (along < w.a - 0.04 || along > w.b + 0.04 || off > (w.t || 0.1) / 2 + 0.04) continue;
      if (off < bd) [best, bd] = [w, off];
    }
    return best;
  }
  function measureTap(hit) {
    if (!hit?.point) return;
    const p = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
    if (!meas.a || meas.b) {
      meas.a = p;
      meas.b = null;
      marks?.measure(p, null);
      const hf = floorOfHit(hit);
      const w = wallOf(hit, hf);
      emit('measure', { a: p, b: null, mm: null, text: null, wall: w ? { id: w.id ?? null, ...wallDims(w, nd.floors[hf].ceil || 2.8) } : null });
    } else {
      meas.b = p;
      marks?.measure(meas.a, p);
      const m = measureText(meas.a, p);
      emit('measure', { a: meas.a, b: p, mm: m.mm, text: m.text, wall: null });
    }
    engine.dirty = true;
  }
  function clearMeasure() {
    const had = meas.a || meas.b;
    meas.a = null;
    meas.b = null;
    marks?.clearMeasure();
    if (had) emit('measure', { a: null, b: null, mm: null, text: null, wall: null });
    engine.dirty = true;
  }
  /** 选中的家具脚下一圈 */
  function ringFor(id) {
    const it = id && engine.itemData?.get(id);
    const g = id && engine.items?.get(id);
    if (!it || !g) return marks?.select(null);
    const b = footprintOf({ ...it, x: g.position.x, z: g.position.z });
    const r = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2 + 0.08;
    marks?.select({ x: (b.x0 + b.x1) / 2, y: g.userData?.elev ?? elevOf(P.fi), z: (b.z0 + b.z1) / 2, r });
  }
  function select(id) {
    const next = id || null;
    if (next === selected) return;
    selected = next;
    ringFor(selected);
    emit('item', { id: selected });
    engine.dirty = true;
  }
  /** 点一下：按现在的工具 */
  function tap(cx, cy) {
    if (phase !== 'walking') return;
    if (tool === 'paint' || tool === 'floor') {
      const hit = engine.hitAt(cx, cy);
      if (!hit) return;
      const hf = floorOfHit(hit);
      const at = nav ? roomAt(nav, { fi: hf, x: hit.point.x, z: hit.point.z }) : null;
      const r = tool === 'floor' ? (at && !isHole(at) ? at : room) : at;
      const slot = tool === 'floor' ? floorSlotOf(r?.type) : slotOfHit(hit);
      emit('pick', { slot, matId: slot ? (proj?.materials?.[slot] ?? null) : null, hit, room: r || null });
      return;
    }
    if (tool === 'furnish') return select(engine.itemAt(cx, cy));
    if (tool === 'measure') return measureTap(engine.hitAt(cx, cy));
    // 走（灯光、拍照也是）
    const goal = walkGoal(engine.hitAt(cx, cy));
    if (!goal) return;
    guest();
    go(goal);
  }

  // ── 搬家具（家具工具：按住选中的那件拖） ──
  const draggable = (id) => {
    const it = engine.itemData?.get(id);
    return !!(it && engine.items?.get(id) && !CATALOG[it.kind]?.wall);
  };
  const _gPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _gPt = new THREE.Vector3();
  /**
   * 屏幕上这一点落在 g 那一层地面的哪里 → _gPt | null：指到天上（地平线以上，走路时就在画面中间）没有交点、
   * 交点离眼睛 > DRAG_FAR（地平线附近差一点点就跳很远）→ null（engine.groundAt 这时给的是这一层的中心，搬家具不能用）
   */
  function floorPoint(cx, cy, g) {
    const ray = engine.rayAt?.(cx, cy)?.ray;
    if (!ray) return null;
    _gPlane.constant = -(g.userData?.elev ?? elevOf(engine.activeIdx ?? P.fi));
    if (!ray.intersectPlane(_gPlane, _gPt) || _gPt.distanceTo(ray.origin) > DRAG_FAR) return null;
    return _gPt;
  }
  function dragStart(cx, cy) {
    const g = engine.items?.get(selected);
    const it = engine.itemData?.get(selected);
    if (!g || !it) {
      drag = null;
      return false;
    }
    // 按下的那一点指不到地面（高的家具按在眼睛以上）：先不定抓手，第一次指到地面时再定（不跳）
    const p = floorPoint(cx, cy, g);
    drag = { id: selected, g, it, ox: p ? g.position.x - p.x : null, oz: p ? g.position.z - p.z : null, x: g.position.x, z: g.position.z, moved: false };
    return true;
  }
  function dragMove(cx, cy) {
    const d = drag;
    if (!d) return;
    // 指到天上 / 太远：家具停在上一个位置
    const p = floorPoint(cx, cy, d.g);
    if (!p) return;
    if (d.ox == null) {
      d.ox = d.g.position.x - p.x;
      d.oz = d.g.position.z - p.z;
    }
    let x = Math.round((p.x + d.ox) * 20) / 20;
    let z = Math.round((p.z + d.oz) * 20) / 20;
    // 不出它的房间
    const fi = engine.activeIdx ?? P.fi;
    const r = (nd?.floors?.[fi]?.rooms || []).find((q) => q.id === d.it.room);
    if (r) {
      const b = footprintOf({ ...d.it, x: 0, z: 0 });
      const hx = (b.x1 - b.x0) / 2;
      const hz = (b.z1 - b.z0) / 2;
      const cx0 = (b.x0 + b.x1) / 2;
      const cz0 = (b.z0 + b.z1) / 2;
      x = 2 * hx >= r.w ? r.x + r.w / 2 - cx0 : clamp(x, r.x + hx - cx0, r.x + r.w - hx - cx0);
      z = 2 * hz >= r.d ? r.y + r.d / 2 - cz0 : clamp(z, r.y + hz - cz0, r.y + r.d - hz - cz0);
    }
    if (x === d.x && z === d.z) return;
    d.x = x;
    d.z = z;
    d.moved = true;
    d.g.position.x = x;
    d.g.position.z = z;
    ringFor(d.id);
    // 走路时影子不自己重画（setWalk：autoUpdate = false）：影子跟着家具走，不留在原地
    shadow();
  }
  function dragEnd(commit) {
    const d = drag;
    drag = null;
    if (!d) return;
    if (commit && d.moved && (d.x !== d.it.x || d.z !== d.it.z)) {
      api?.moveItem?.(d.id, { x: d.x, z: d.z });
      shadow();
    } else {
      const back = d.g.position.x !== d.it.x || d.g.position.z !== d.it.z;
      d.g.position.x = d.it.x;
      d.g.position.z = d.it.z;
      ringFor(d.id);
      // 放回去了：影子也回去
      if (back) shadow();
      else engine.dirty = true;
    }
  }

  // ── 指针 ──
  const el = engine.renderer?.domElement || null;
  function look(dx, dy) {
    const H = engine.container?.clientHeight || 800;
    const k = (((walk?.fov || 62) * Math.PI) / 180) / H;
    yaw = wrap(yaw + dx * k);
    pitch = clamp(pitch + dy * k, -PITCH_MAX, PITCH_MAX);
    if (route) route.free = true;
    applyCamera();
    engine.dirty = true;
  }
  const onDown = (e) => {
    if (phase !== 'walking' || ptr) return;
    if (e.pointerType === 'mouse' && e.button != null && e.button !== 0) return;
    const now = e.timeStamp || Date.now();
    ptr = { id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: now, mode: null, item: null };
    if (tool === 'furnish' && selected && draggable(selected) && engine.itemAt(e.clientX, e.clientY) === selected) ptr.item = selected;
    try {
      el?.setPointerCapture?.(e.pointerId);
    } catch {
      /* 有的浏览器在合成的事件上不让抓 */
    }
  };
  const onMove = (e) => {
    if (!ptr || e.pointerId !== ptr.id || phase !== 'walking') return;
    if (!ptr.mode) {
      const lim = ptr.type === 'mouse' ? DRAG_MOUSE : DRAG_TOUCH;
      if (Math.hypot(e.clientX - ptr.x0, e.clientY - ptr.y0) <= lim) return;
      // 按在选中的家具上 = 搬（那件刚好没了就当转头）
      ptr.mode = ptr.item && dragStart(ptr.x0, ptr.y0) ? 'move' : 'look';
      // 带逛正在走：客人自己转头 = 接手
      if (ptr.mode === 'look' && tourInst?.running && tourInst.state().phase === 'walking') guest();
    }
    if (ptr.mode === 'look') look(e.clientX - ptr.x, e.clientY - ptr.y);
    else dragMove(e.clientX, e.clientY);
    ptr.x = e.clientX;
    ptr.y = e.clientY;
  };
  const onUp = (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const p = ptr;
    ptr = null;
    if (p.mode === 'move') return dragEnd(true);
    if (!p.mode && (e.timeStamp || Date.now()) - p.t0 < TAP_MS) tap(e.clientX, e.clientY);
  };
  const onCancel = (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    if (ptr.mode === 'move') dragEnd(false);
    ptr = null;
  };

  // ── 键盘（WASD / 方向键走、Q / E 转身；在输入框里打字不算） ──
  const KEYS = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', KeyQ: 'tl', KeyE: 'tr' };
  const BY_KEY = { w: 'f', s: 'b', a: 'l', d: 'r', q: 'tl', e: 'tr' };
  const keyOf = (e) => KEYS[e.code] || BY_KEY[String(e.key || '').toLowerCase()] || null;
  const typing = (t) => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '') || !!t.closest?.('input,textarea,select,[contenteditable="true"]'));
  const onKey = (e) => {
    const k = keyOf(e);
    if (!k) return;
    const down = e.type === 'keydown';
    if (down && (phase !== 'walking' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target))) return;
    if (!down) {
      keys[k] = 0;
      return;
    }
    e.preventDefault?.();
    // 从不动到动的那一下才算客人接手（W 按着再按 A：不停一下）
    if (!keys[k] && !steering()) guest();
    keys[k] = 1;
  };
  const clearKeys = () => {
    for (const k in keys) keys[k] = 0;
  };
  /** 客人正推着摇杆 / 按着键 */
  const steering = () => !!(keys.f || keys.b || keys.l || keys.r || keys.tl || keys.tr) || Math.hypot(stick.x, stick.y) > 1e-3;

  if (el) {
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('lostpointercapture', onCancel);
  }
  if (win) {
    win.addEventListener('keydown', onKey);
    win.addEventListener('keyup', onKey);
    win.addEventListener('blur', clearKeys);
  }
  const ro = typeof ResizeObserver === 'function' && engine.container ? new ResizeObserver(() => fit()) : null;
  if (ro) ro.observe(engine.container);
  else win?.addEventListener('resize', fit);

  // ── 每帧 ──
  function tick(t) {
    if (phase !== 'walking') return false;
    const dt = last == null ? 1 / 60 : clamp((t - last) / 1000, 0, 0.25);
    last = t;
    try {
      return frame(dt, t);
    } catch (e) {
      fail(e);
      return false;
    }
  }
  function frame(dt, t) {
    let changed = false;
    let movedNow = false;
    const onStair = route && !route.arrived && route.legs[route.li]?.kind === 'stair';
    // 摇杆 + 按键（y > 0 = 往前，和 Joystick.jsx 一样）→ 按看的方向走，速度缓一缓
    let ix = stick.x + keys.r - keys.l;
    let iy = stick.y + keys.f - keys.b;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }
    let wx = 0;
    let wz = 0;
    if (mag > 1e-3 && !onStair) {
      if (route) halt();
      const s = Math.sin(yaw);
      const c = Math.cos(yaw);
      // 右 = (cos yaw, −sin yaw)，前 = (−sin yaw, −cos yaw)
      wx = (c * ix - s * iy) * SPEED;
      wz = (-s * ix - c * iy) * SPEED;
    }
    const kv = 1 - Math.exp(-dt * STICK_K);
    vel.x += (wx - vel.x) * kv;
    vel.z += (wz - vel.z) * kv;
    // 放开了：慢到 5cm/s 就停住（不一直滑）
    if (!wx && !wz && Math.hypot(vel.x, vel.z) < 0.05) {
      vel.x = 0;
      vel.z = 0;
    } else if (!onStair) {
      // 开着 / 在动的门扇也挡路（上一帧的样子；门照常在下面 doors.update 里开关）
      slideMove(nav, P, vel.x * dt, vel.z * dt, moved, doors);
      if (moved.moved) {
        P.x = moved.x;
        P.z = moved.z;
        movedNow = true;
      } else {
        vel.x = 0;
        vel.z = 0;
      }
    }
    // Q / E 转身
    const turn = keys.tl - keys.tr;
    if (turn) {
      yaw = wrap(yaw + turn * KEY_TURN * dt);
      changed = true;
    }
    // 沿路走
    if (route && follow(route, dt)) movedNow = true;
    if (movedNow || changed) {
      applyCamera();
      changed = true;
    }
    // 门：这一层接下来要走的点
    ahead.length = 0;
    const R = route;
    if (R && !R.arrived) {
      const leg = R.legs[R.li];
      if (leg.kind === 'walk' && leg.fi === P.fi) for (let i = R.pi; i < leg.pts.length; i++) ahead.push(leg.pts[i]);
    }
    if (doors?.update(engine.camera.position, ahead, dt)) {
      shadow();
      changed = true;
    }
    if (movedNow) {
      checkRoom();
      applyFurniture();
    }
    if (marks?.update(dt)) changed = true;
    // 楼板 / 墙的边是批荡（flight.js 盖天花时换上）；楼层重建过（engine.floors 换了）→ 新的也换上（plaster.js；平时只比一下）
    if (plasterEdges(engine)) changed = true;
    if (posePending && t - poseAt >= POSE_MS) {
      posePending = false;
      poseAt = t;
      emit('pose', pose());
    }
    if (changed) engine.dirty = true;
    return changed;
  }
  function fail(e) {
    if (import.meta.env?.DEV) console.error('[walk]', e);
    emit('error', { error: e });
    exit({ instant: true });
  }

  // ── 带逛 ──
  function ensureTour() {
    if (tourInst?.running || (tourInst && !tourStale)) return tourInst;
    const stops = nav ? tourStops(proj?.plan, items(), nav, { materials: proj?.materials, locked: proj?.locked }) : [];
    tourStale = false;
    tourInst = createTour({
      ...(tourOpts || {}),
      stops,
      walkTo: (s) => go({ fi: s.fi, x: s.x, z: s.z }, s.yaw),
      halt,
      onStop: ({ stop, line }) => emit('tour', { stop, line }),
      onState: (s) => emit('tourState', s),
      onEnd: () => emit('tour', { stop: null, line: null }),
    });
    return tourInst;
  }
  const tour = {
    start(from = 0) {
      if (phase !== 'walking') return Promise.resolve('empty');
      return ensureTour().start(from);
    },
    stop() {
      tourInst?.stop();
    },
    next() {
      tourInst?.next();
    },
    get running() {
      return !!tourInst?.running;
    },
    state() {
      return tourInst ? tourInst.state() : { running: false, index: -1, total: 0, stop: null, line: null, phase: 'idle' };
    },
  };

  // ── 进 / 出 ──
  async function enter() {
    if (disposed) return false;
    if (phase === 'flying-in' && entering) return entering;
    if (phase !== 'out') return phase === 'walking';
    setPhase('flying-in');
    entering = (async () => {
      try {
        saved = saveOrbit(engine);
        nd = engine.navData();
        nav = buildNav(nd, items());
        tourStale = true;
        const plan = entryPlan(nd, nav);
        doors = createDoors(engine, nd);
        walk = { fov: walkFov(engine.container?.clientWidth || 1, engine.container?.clientHeight || 1), vo: { x: 0, y: 0 }, ev: walkEv(engine.day), pr: 0 }; // fov / vo 由 flyIn 管（落地时 = walkFov / walkVo）
        const r = await flyIn(engine, plan, { walk, doors });
        if (phase !== 'flying-in') return false;
        // 别人把飞行停了（不是我们的退出）：一下子回到鸟瞰
        if (r !== 'done') {
          finishOut(true);
          return false;
        }
        const fb = plan.fallback || null;
        P.fi = fb ? fb.fi : (plan.door?.fi ?? 0);
        P.x = fb ? fb.x : plan.P3.x;
        P.z = fb ? fb.z : plan.P3.z;
        P.y = elevOf(P.fi) + EYE;
        yaw = wrap(fb ? fb.yaw : plan.yaw);
        pitch = 0;
        marks = createMarks(engine);
        last = null;
        fMask = -1;
        room = null;
        engine.onTick = tick;
        // 先把一切摆好，最后才说「走着了」（听的人可能马上 walkTo / 开始带逛）
        phase = 'walking';
        fit();
        applyCamera();
        applyFurniture(true);
        checkRoom(true);
        emit('floor', { fi: P.fi, id: floorId(P.fi) });
        emit('state', { phase });
        posePending = false;
        emit('pose', pose());
        return phase === 'walking';
      } catch (e) {
        if (import.meta.env?.DEV) console.error('[walk]', e);
        if (phase === 'flying-in') finishOut(true);
        throw e;
      } finally {
        entering = null;
      }
    })();
    return entering;
  }
  /** 收尾：门、记号、路、带逛、键盘都放下；instant → 镜头一下子放回去 */
  function teardown() {
    if (tourInst?.running) tourInst.stop();
    if (drag) dragEnd(false);
    ptr = null;
    clearKeys();
    stick.x = 0;
    stick.y = 0;
    vel.x = 0;
    vel.z = 0;
    if (route) {
      const R = route;
      route = null;
      R.resolve?.(false);
      R.then?.resolve?.(false);
    }
    if (selected) {
      selected = null;
      emit('item', { id: null });
    }
    meas.a = null;
    meas.b = null;
    marks?.dispose();
    marks = null;
  }
  function finishOut(instant) {
    if (instant) restoreOrbit(engine, saved, { doors });
    doors = null;
    walk = null;
    setPhase('out');
  }
  function exit({ instant = false } = {}) {
    if (phase === 'out') return Promise.resolve();
    if (phase === 'flying-out' && exiting && !instant) return exiting;
    teardown();
    if (engine.onTick === tick) engine.onTick = null;
    // 飞出去的路上从楼上看得见楼下：家具全部打开（restoreOrbit 里 setFloorView 会照鸟瞰的样子重新开关）
    for (const F of engine.floors || []) if (F.furn) F.furn.visible = true;
    shadow();
    setPhase('flying-out');
    if (instant || !saved) {
      finishOut(true);
      exiting = null;
      return Promise.resolve();
    }
    exiting = flyOut(engine, saved, { doors }).then(
      () => {
        exiting = null;
        if (phase === 'flying-out') finishOut(false);
      },
      (e) => {
        exiting = null;
        if (import.meta.env?.DEV) console.error('[walk]', e);
        finishOut(true);
      },
    );
    return exiting;
  }

  const ctl = {
    enter,
    exit,
    dispose() {
      if (disposed) return;
      if (phase !== 'out') exit({ instant: true });
      disposed = true;
      if (el) {
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onCancel);
        el.removeEventListener('lostpointercapture', onCancel);
      }
      if (win) {
        win.removeEventListener('keydown', onKey);
        win.removeEventListener('keyup', onKey);
        win.removeEventListener('blur', clearKeys);
        if (!ro) win.removeEventListener('resize', fit);
        if (win.__genieWalk === ctl) win.__genieWalk = null;
      }
      ro?.disconnect();
      subs.clear();
    },
    setTool(id) {
      const next = TOOLS.includes(id) ? id : 'walk';
      if (next === tool) return;
      if (tool === 'measure') clearMeasure();
      if (tool === 'furnish') {
        if (drag) dragEnd(false);
        select(null);
      }
      tool = next;
    },
    joystick(x, y) {
      const nx = clamp(Number(x) || 0, -1, 1);
      const ny = clamp(Number(y) || 0, -1, 1);
      // 只在从不动到动的那一下停带逛、停路：手指推着摇杆一直在微微动，几乎每帧都来一个新的值 ——
      // 每次都 guest()（halt 把速度清零）会走得一卡一卡、慢好几倍。推着的时候有路：frame() 自己会停
      const was = steering();
      stick.x = nx;
      stick.y = ny;
      if (!was && Math.hypot(nx, ny) > 1e-3 && phase === 'walking') guest();
    },
    walkTo(to) {
      return go(to, to?.yaw);
    },
    goFloor(fi) {
      if (phase !== 'walking' || !nav?.floors?.[fi]) return Promise.resolve(false);
      if (fi === P.fi) return Promise.resolve(true);
      const links = nav.stairs || [];
      const link = links.find((s) => (s.from === fi && s.to === P.fi) || (s.to === fi && s.from === P.fi)) || links.find((s) => s.from === fi || s.to === fi);
      if (link) {
        const m = link.to === fi ? link.exit : link.entry;
        guest();
        return go({ fi, x: m.x, z: m.z });
      }
      // 没有楼梯连着：淡出淡入到那一层最大的房间
      const rooms = (nd.floors[fi]?.rooms || []).filter((r) => !isHole(r)).sort((a, b) => b.w * b.d - a.w * a.d);
      const q = rooms[0] && nearest(nav, { fi, x: rooms[0].x + rooms[0].w / 2, z: rooms[0].y + rooms[0].d / 2 });
      if (!q) return Promise.resolve(false);
      guest();
      return fade(
        () => phase === 'walking' && place(fi, q.x, q.z, yaw, 0),
        () => phase === 'walking',
      );
    },
    pose,
    project(v) {
      const W = engine.container?.clientWidth || 1;
      const H = engine.container?.clientHeight || 1;
      _v.set(+v?.x || 0, +v?.y || 0, +v?.z || 0).project(engine.camera);
      const visible = _v.z > -1 && _v.z < 1 && Math.abs(_v.x) <= 1 && Math.abs(_v.y) <= 1;
      return { x: ((_v.x + 1) / 2) * W, y: ((1 - _v.y) / 2) * H, visible };
    },
    photo() {
      return { floor: floorId(P.fi), x: P.x, z: P.z, yaw, pitch, hour: engine.time, room: room?.id ?? null };
    },
    goto(mark) {
      if (phase !== 'walking' || !mark || !nav) return Promise.resolve(false);
      const fi = (nd?.floors || []).findIndex((f) => f.id === mark.floor);
      if (fi < 0) return Promise.resolve(false);
      const q = nearest(nav, { fi, x: +mark.x, z: +mark.z });
      if (!q) return Promise.resolve(false);
      guest();
      return fade(
        () => phase === 'walking' && place(fi, q.x, q.z, +mark.yaw, +mark.pitch),
        () => {
          if (phase !== 'walking') return false;
          const h = Number(mark.hour);
          if (Number.isFinite(h) && Math.abs(h - (engine.time ?? h)) > 0.01) api?.setTime?.(h);
          return true;
        },
      );
    },
    select,
    clearMeasure,
    tour,
    on(evt, fn) {
      if (typeof fn !== 'function') return () => {};
      if (!subs.has(evt)) subs.set(evt, new Set());
      subs.get(evt).add(fn);
      return () => subs.get(evt)?.delete(fn);
    },
    update(next) {
      if (!next) return;
      const prev = proj;
      proj = next;
      if (!prev || !nav || phase === 'out') return;
      if (next.furniture !== prev.furniture) {
        const fis = changedFloors(nd, prev.furniture, next.furniture);
        for (const fi of fis) rebuildFloor(nav, fi, items());
        tourStale = true;
        applyFurniture(true);
        shadow();
        if (selected && !items().some((it) => it.id === selected)) select(null);
        else if (selected) ringFor(selected);
      }
      // 带逛只介绍「我们做」的：材质、锁住的那几面变了 → 下次重新挑站
      if (next.materials !== prev.materials || next.locked !== prev.locked) tourStale = true;
      if (next.time !== prev.time && phase === 'walking') {
        engine.placeRoomLights?.({ x: P.x, z: P.z });
        // 曝光跟着时段（晚上亮一点）：引擎的 setTime 刚按旧的 walk.ev 乘过，换成这个钟点的
        if (walk && engine.day && engine.renderer) {
          walk.ev = walkEv(engine.day);
          engine.renderer.toneMappingExposure = engine.day.exposure * walk.ev;
          engine.dirty = true;
        }
      }
    },
    resize: fit,
    get phase() {
      return phase;
    },
    get tool() {
      return tool;
    },
    get nav() {
      return nav;
    },
    /** 门（createDoors 的结果；没走进去 = null）：脚本看门开了没有 */
    get doors() {
      return doors;
    },
    get wish() {
      return !!wish;
    },
  };
  if (win) win.__genieWalk = ctl;
  return ctl;
}

/** 家具变了的那几层（新加 / 删掉 / 挪了 / 转了 / 换了尺寸）：旧的那一层和新的那一层都算 */
export function changedFloors(navData, before = [], after = []) {
  const floors = navData?.floors || [];
  const fIdx = new Map(floors.map((f, i) => [f.id, i]));
  const roomF = new Map();
  floors.forEach((f, i) => (f.rooms || []).forEach((r) => roomF.set(r.id, i)));
  const fOf = (it) => (it.floor != null && fIdx.has(it.floor) ? fIdx.get(it.floor) : roomF.has(it.room) ? roomF.get(it.room) : 0);
  const KEYS = ['x', 'z', 'rot', 'w', 'd', 'kind', 'floor', 'room'];
  const old = new Map((before || []).filter(Boolean).map((it) => [it.id, it]));
  const out = new Set();
  for (const it of after || []) {
    if (!it) continue;
    const o = old.get(it.id);
    old.delete(it.id);
    if (o === it) continue;
    if (!o || KEYS.some((k) => o[k] !== it[k])) {
      out.add(fOf(it));
      if (o) out.add(fOf(o));
    }
  }
  for (const o of old.values()) out.add(fOf(o));
  return [...out].filter((fi) => fi >= 0 && fi < Math.max(1, floors.length)).sort((a, b) => a - b);
}
