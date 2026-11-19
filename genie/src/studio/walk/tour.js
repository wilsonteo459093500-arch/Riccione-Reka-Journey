// 走进去 · 潘吉带逛 —— docs/walk/SPEC.md §2（tourStops）、§7（台词在 shared/i18n/voice-lines.js 的 walk 组）
//
// tourStops(plan, items, nav)：纯函数，Node 可测。一站 = { id, fi, x, z, yaw, line, room }：
//   大门里面（walk.hello）→ 客厅（walk.living；有电视墙就站在看得到整面墙的地方，原地再说 walk.tv）→ 厨房（有橱柜才去，对着最长那段 walk.kitchen）
//   → 主卧（有衣柜就对着衣柜 walk.wardrobe，没有就说小提示 walk.paint）→ 楼梯口（walk.stairs）→ 楼上（主卧在楼上就在这里）
//   → 小提示（刷颜色，还没说过的话）→ 结束（walk.bye，原地不动）。
//   规则：每一句最多一站；功能那几句（电视墙 / 厨房 / 衣柜）只在那个房间真的有那件东西时才说；
//         除了大门那一站（= nav.start），每一站都是「从大门走得到」的格子中心（nav 的 reach）；都在房间里面，不在楼梯间 / 挑空里。
//   没有大门（nav.start = null）→ 从最大的客厅类房间开始。楼上只去楼梯连着的那一层；没有楼梯连接就不上楼。
// createTour({ stops, walkTo, say, onStop, … })：给控制器用的小播放器 ——
//   走到一站（等 walkTo 的 Promise：到了 → true，被客人自己走 / 摇杆打断 → false）→ 说这一站的话（voice.say）
//   → 停一下（没声音也让字幕读得完）→ 下一站。next() 马上去下一站，stop() 结束（「跳过」）。
// yaw：和相机一样的 three.js 'YXZ'：看的方向 = 平面上的 (−sin yaw, −cos yaw)（平面 y = 世界 z），即 yaw = atan2(−dx, −dz)。

import { ROOM_TYPES } from '../plan/model.js';
import { buildNav, navDataOf } from './nav.js';
import { voice, lineOf, lineText, speechTimeline } from '../../shared/voice.js';
import { getLang } from '../../shared/i18n.js';

/** 带逛用到的台词（voice-lines.js 的 walk 组），按出场顺序 */
export const TOUR_LINES = ['walk.hello', 'walk.living', 'walk.tv', 'walk.kitchen', 'walk.wardrobe', 'walk.stairs', 'walk.paint', 'walk.bye'];

// 站在离柜面多远看（米）：电视墙要看得到整面，厨房 / 衣柜站近一点
const VIEW = { tvWall: 2.3, kitchenRun: 1.1, wardrobe: 1.4 };
const IN = 0.05; // 格子中心至少在房间里面这么多
const OPEN = 0.6; // 「房间中间」的那一站：离障碍至少这么远（房间太挤就取最宽的地方）
const ROOMY = 0.45; // 站在功能前面：离障碍不到这个距离的格子扣分
const HOP = 1.0; // 两站离得比这个近 → 后一站原地转身，不挪那一小步
const STAIR_R = 0.8; // 楼梯口那一站离楼梯口最多多远
const LIVING_LIKE = ['living', 'family', 'dining', 'foyer'];

const isHole = (r) => !!(r?.stairId || ROOM_TYPES[r?.type]?.stair || ROOM_TYPES[r?.type]?.void);
const area = (r) => r.w * r.d;
const byArea = (rs) => [...rs].sort((a, b) => area(b) - area(a));
const centre = (r) => ({ x: r.x + r.w / 2, z: r.y + r.d / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inRect = (r, x, z, m = 0) => x > r.x + m && x < r.x + r.w - m && z > r.y + m && z < r.y + r.d - m;
const r3 = (v) => Math.round(v * 1000) / 1000 || 0; // 顺便把 −0 变成 0
const longest = (its) => its.reduce((a, b) => (!a || (b.w || 0) > (a.w || 0) ? b : a), null);
const total = (its) => its.reduce((s, it) => s + (it.w || 0), 0);

/** yaw（弧度）：朝平面方向 (dx, dz) 看 */
export const yawOf = (dx, dz) => Math.atan2(-dx, -dz) + 0; // + 0：−0 → 0
/** yaw：从 from 看向 to（{ x, z }，平面坐标） */
export const yawToward = (from, to) => yawOf(to.x - from.x, to.z - from.z);
/** 家具正面朝哪（rot 0 = +z，90 = +x，和 furnish.js 一样） */
function facing(it) {
  const r = ((Number(it.rot) || 0) * Math.PI) / 180;
  return { x: Math.sin(r), z: Math.cos(r) };
}
/** 家具正面前方 gap 米的那一点 */
function before(it, gap) {
  const f = facing(it);
  const k = (it.d || 0.5) / 2 + gap;
  return { x: it.x + f.x * k, z: it.z + f.z * k };
}

// ───────────────────────── 站的位置 ─────────────────────────

/**
 * 这一层走得到的格子中心（nav 的 reach；老的 nav 没有 reach 就用 pass）：
 * 给 room → 在那个房间里；不给 → 在任何一个不是楼梯间 / 挑空的房间里、离 near 不超过 R。→ [{ x, z, c（clearance） }]
 */
function spots(nav, fi, { room = null, near = null, R = Infinity } = {}) {
  const F = nav.floors[fi];
  const ok = F?.reach || F?.pass;
  if (!ok) return [];
  const rooms = room ? [room] : (nav.data?.floors?.[fi]?.rooms || []).filter((r) => !isHole(r));
  const box = room ? { x0: room.x, x1: room.x + room.w, z0: room.y, z1: room.y + room.d } : { x0: near.x - R, x1: near.x + R, z0: near.z - R, z1: near.z + R };
  const i0 = Math.max(0, Math.floor((box.x0 - F.x0) / F.cell));
  const i1 = Math.min(F.nx - 1, Math.floor((box.x1 - F.x0) / F.cell));
  const j0 = Math.max(0, Math.floor((box.z0 - F.z0) / F.cell));
  const j1 = Math.min(F.nz - 1, Math.floor((box.z1 - F.z0) / F.cell));
  const out = [];
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const k = j * F.nx + i;
      if (!ok[k]) continue;
      const p = { x: F.x0 + (i + 0.5) * F.cell, z: F.z0 + (j + 0.5) * F.cell };
      if (near && R < Infinity && dist(p, near) > R) continue;
      if (!rooms.some((r) => inRect(r, p.x, p.z, IN))) continue;
      out.push({ ...p, c: F.clear[k] });
    }
  return out;
}

/** 离 target 最近、又不太挤的那一格 */
function pickNear(cands, target) {
  let best = null;
  let bs = Infinity;
  for (const p of cands) {
    const s = dist(p, target) + 0.8 * Math.max(0, ROOMY - p.c);
    if (s < bs - 1e-9) [best, bs] = [p, s];
  }
  return best;
}

/** 对着一件东西站：在它正面前方（离柜面 ≥ 0.6m），尽量正对（左右偏出它宽度的 1/4 才扣分）、离柜面 gap 米、不太挤 */
function pickFacing(cands, it, gap) {
  const f = facing(it);
  const half = (it.d || 0.5) / 2;
  const free = (it.w || 0) / 4;
  let best = null;
  let bs = Infinity;
  for (const p of cands) {
    const dx = p.x - it.x;
    const dz = p.z - it.z;
    const depth = dx * f.x + dz * f.z - half;
    if (depth < 0.6) continue;
    const side = Math.max(0, Math.abs(dx * f.z - dz * f.x) - free);
    const s = 0.6 * Math.abs(depth - gap) + side + 1.5 * Math.max(0, ROOMY - p.c);
    if (s < bs - 1e-9) [best, bs] = [p, s];
  }
  return best || pickNear(cands, before(it, gap));
}

/** 房间里够宽敞（clearance ≥ OPEN，或者这个房间最宽的地方）里离房间中心最近的那一格 */
function pickCentre(cands, room) {
  if (!cands.length) return null;
  const top = Math.min(OPEN, Math.max(...cands.map((p) => p.c)));
  return pickNear(
    cands.filter((p) => p.c >= top - 1e-6),
    centre(room),
  );
}

// ───────────────────────── 站 ─────────────────────────

/**
 * 潘吉带逛的每一站。plan：方案（没有 nav 时拿来建 nav）；items：家具；nav：walk/nav.js buildNav 的结果（同一份 plan + items）。
 * → [{ id, fi, x, z, yaw, line, room }]（room = 房间 id），走不进去的方案 → []
 */
export function tourStops(plan, items = [], nav = null) {
  const its = Array.isArray(items) ? items : [];
  if (!nav) {
    if (!plan) return [];
    nav = buildNav(navDataOf(plan), its);
  }
  const nds = nav?.data?.floors || [];
  if (!nav?.floors?.length || !nds.length) return [];

  const fIdx = new Map(nav.floors.map((F, i) => [F.id, i]));
  const roomsOn = (fi) => (nds[fi]?.rooms || []).filter((r) => !isHole(r));
  /** 家具在哪一层、哪个房间（item.room 对不上就看它的位置） */
  const floorOf = (it) => (it.floor == null ? 0 : fIdx.has(it.floor) ? fIdx.get(it.floor) : -1);
  const roomOf = (it, fi) => roomsOn(fi).find((r) => r.id === it.room && inRect(r, it.x, it.z)) || roomsOn(fi).find((r) => inRect(r, it.x, it.z)) || null;
  const inRoom = (kind, fi, room) => its.filter((it) => it.kind === kind && Number.isFinite(it.x) && Number.isFinite(it.z) && floorOf(it) === fi && roomOf(it, fi)?.id === room.id);

  const stops = [];
  const said = new Set();
  const last = () => stops[stops.length - 1] || null;
  const add = (id, fi, p, yaw, line, room) => {
    stops.push({ id, fi, x: p.x, z: p.z, yaw: r3(yaw), line, room: room?.id ?? null });
    said.add(line);
  };
  /** 没有要对着看的东西：看房间中间（站在中间附近就顺着走进来的方向） */
  const looking = (p, room) => {
    const prev = last();
    if (room && dist(p, centre(room)) > 0.8) return yawToward(p, centre(room));
    if (prev && dist(prev, p) > 0.3) return yawToward(prev, p);
    return prev ? prev.yaw : 0;
  };
  /** 和上一站在同一个房间、离得很近 → 就站在上一站那里转身（隔着墙的不算） */
  const settle = (fi, p, room) => {
    const prev = last();
    return prev && prev.fi === fi && room && prev.room === room.id && dist(prev, p) < HOP ? { x: prev.x, z: prev.z } : p;
  };
  /** 对着一件东西的那一站 */
  const facingStop = (id, fi, room, it, gap, line) => {
    const p0 = pickFacing(spots(nav, fi, { room }), it, gap);
    if (!p0) return false;
    const p = settle(fi, p0, room);
    add(id, fi, p, yawToward(p, it), line, room);
    return true;
  };

  // 1. 大门里面（没有大门：最大的客厅类房间中间）
  const f0 = nav.start?.fi ?? 0;
  if (nav.start) {
    const w = nav.door?.wall;
    const inward = nav.door?.inward || 1;
    const yaw = w ? (w.axis === 'x' ? yawOf(0, inward) : yawOf(inward, 0)) : 0;
    const room = roomsOn(f0).find((r) => inRect(r, nav.start.x, nav.start.z, -1e-6)) || null;
    add('entrance', f0, { x: nav.start.x, z: nav.start.z }, yaw, 'walk.hello', room);
  } else {
    const order = (r) => (LIVING_LIKE.includes(r.type) ? LIVING_LIKE.indexOf(r.type) : ROOM_TYPES[r.type]?.outdoor ? 9 : 5);
    const rooms = byArea(roomsOn(f0)).sort((a, b) => order(a) - order(b));
    for (const r of rooms) {
      const p = pickCentre(spots(nav, f0, { room: r }), r);
      if (!p) continue;
      add('entrance', f0, p, yawToward(p, centre(r)), 'walk.hello', r);
      break;
    }
  }
  if (!stops.length) return [];

  // 要去的楼上：楼梯连着大门那一层的那一道（有好几道就先要去上一层的那道）
  const links = (nav.stairs || []).filter((s) => s.from === f0 || s.to === f0);
  const link = links.find((s) => (s.from === f0 ? s.to : s.from) === f0 + 1) || links[0] || null;
  const fu = link ? (link.from === f0 ? link.to : link.from) : -1;

  // 要去的卧室（只在会去的两层里找）：最大的主卧（走得到的）；没有主卧 → 最大的、有衣柜的卧室 / 儿童房
  const bedroom = (() => {
    const all = [f0, fu].filter((fi) => fi >= 0).flatMap((fi) => roomsOn(fi).map((room) => ({ fi, room })));
    const reachable = (b) => spots(nav, b.fi, { room: b.room }).length > 0;
    const big = (list) => list.sort((a, b) => area(b.room) - area(a.room)).find(reachable) || null;
    const withWardrobe = (b) => ({ ...b, wardrobe: longest(inRoom('wardrobe', b.fi, b.room)) });
    const m = big(all.filter((b) => b.room.type === 'master'));
    if (m) return withWardrobe(m);
    const o = big(all.filter((b) => ['bedroom', 'kids'].includes(b.room.type)).filter((b) => inRoom('wardrobe', b.fi, b.room).length));
    return o ? withWardrobe(o) : null;
  })();

  /** 一层里的几站：客厅（+ 电视墙）→ 厨房 → 卧室；已经说过的那句不再说 */
  const section = (fi) => {
    const n0 = stops.length;
    // 客厅 + 电视墙：有电视墙就站在看电视墙的地方（两句在同一个地方说，不来回走），没有就站在客厅中间
    let tv = null;
    if (!said.has('walk.living')) {
      for (const room of byArea(roomsOn(fi).filter((r) => r.type === 'living'))) {
        const cands = spots(nav, fi, { room });
        if (!cands.length) continue;
        const it = longest(inRoom('tvWall', fi, room));
        const at = settle(fi, it ? pickFacing(cands, it, VIEW.tvWall) : pickCentre(cands, room), room);
        add('living', fi, at, it ? yawToward(at, it) : looking(at, room), 'walk.living', room);
        if (it) tv = { room, it };
        break;
      }
    }
    // 没有客厅，或客厅没有电视墙：起居厅的电视墙
    if (!tv && !said.has('walk.tv')) {
      for (const room of byArea(roomsOn(fi).filter((r) => r.type === 'family'))) {
        const it = longest(inRoom('tvWall', fi, room));
        if (it && spots(nav, fi, { room }).length) {
          tv = { room, it };
          break;
        }
      }
    }
    if (tv && !said.has('walk.tv')) facingStop('tv', fi, tv.room, tv.it, VIEW.tvWall, 'walk.tv');
    // 厨房：橱柜加起来最长的那一间，对着最长的那一段
    if (!said.has('walk.kitchen')) {
      const ks = roomsOn(fi)
        .filter((r) => r.type === 'kitchen')
        .map((room) => ({ room, runs: inRoom('kitchenRun', fi, room) }))
        .filter((k) => k.runs.length)
        .sort((a, b) => total(b.runs) - total(a.runs));
      for (const k of ks) if (facingStop('kitchen', fi, k.room, longest(k.runs), VIEW.kitchenRun, 'walk.kitchen')) break;
    }
    // 卧室：有衣柜就对着衣柜，没有就在房间中间说小提示
    if (bedroom && bedroom.fi === fi && !stops.some((s) => s.id === 'bedroom')) {
      const { room, wardrobe } = bedroom;
      if (wardrobe && !said.has('walk.wardrobe')) facingStop('bedroom', fi, room, wardrobe, VIEW.wardrobe, 'walk.wardrobe');
      else if (!wardrobe && !said.has('walk.paint')) {
        const p = pickCentre(spots(nav, fi, { room }), room);
        if (p) {
          const at = settle(fi, p, room);
          add('bedroom', fi, at, looking(at, room), 'walk.paint', room);
        }
      }
    }
    return stops.length - n0;
  };

  section(f0);

  // 2. 楼梯 → 楼上
  if (link) {
    const mouth = link.from === f0 ? link.entry : link.exit;
    const pts = link.from === f0 ? link.pts : [...link.pts].reverse();
    const upRooms = byArea(roomsOn(fu)).filter((r) => spots(nav, fu, { room: r }).length);
    const p0 = upRooms.length ? pickNear(spots(nav, f0, { near: mouth, R: STAIR_R }), mouth) : null;
    if (p0) {
      // 看着楼梯往上：从楼梯口看向第一段梯段上 ≥ 0.25m 远的那一点
      const far = pts.find((q) => dist(q, mouth) >= 0.25) || pts[pts.length - 1];
      const room = roomsOn(f0).find((r) => inRect(r, p0.x, p0.z)) || null;
      const p = settle(f0, p0, room);
      add('stairs', f0, p, far ? yawToward(mouth, far) : looking(p, room), 'walk.stairs', room);
      if (!section(fu)) {
        // 楼上没有要介绍的：去最大的室内房间，说还没说的那句（小提示；说过了就在那里结束）
        const indoor = upRooms.filter((r) => !ROOM_TYPES[r.type]?.outdoor);
        const room2 = (indoor.length ? indoor : upRooms)[0];
        const q = pickCentre(spots(nav, fu, { room: room2 }), room2);
        add('upstairs', fu, q, looking(q, room2), said.has('walk.paint') ? 'walk.bye' : 'walk.paint', room2);
      }
    }
  }

  // 3. 小提示（还没说过）→ 结束：原地，不再走
  const end = last();
  const here = { x: end.x, z: end.z };
  if (!said.has('walk.paint')) add('tip', end.fi, here, end.yaw, 'walk.paint', { id: end.room });
  if (!said.has('walk.bye')) add('end', end.fi, here, end.yaw, 'walk.bye', { id: end.room });
  return stops;
}

// ───────────────────────── 播放器 ─────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 字幕至少留多久（毫秒）：照她说话的速度估（speechTimeline），没有声音的时候客人也读得完 */
export function readMs(id, lang = getLang()) {
  const text = lineText(id, lang);
  if (!text) return 0;
  return Math.round(Math.max(1600, speechTimeline(text, lang).dur * 1000 * 1.1 + 600));
}

/** 用台词表里这一句建议的 delay / mode 说（voice.say 在 Node 里安静地 resolve） */
function sayLine(id) {
  const l = lineOf(id);
  return voice.say(id, { delay: l?.delay ?? 0, mode: l?.mode || 'interrupt' });
}

/**
 * createTour({ stops, walkTo, say, hush, halt, onStop, onState, onEnd, dwell, read, wait, now })
 *   walkTo(stop) → Promise：走到这一站、转到 stop.yaw；到了 → true，被客人打断 → false（带逛就结束，reason 'interrupted'）
 *   say(id) → Promise：说完（或说不了）就 resolve。默认 voice.say（用台词表里这一句的 delay / mode）
 *   hush(id)：别说这一句了（默认 voice.stopIf）；halt()：stop() 时让控制器停下脚步
 *   onStop({ stop, index, total, line })：到了一站、开始说话（控制器发 'tour' 事件）
 *   onState({ running, index, total, stop, line, phase })：phase = 'walking' | 'talking' | 'idle'；line = 最近说的那一句
 *   onEnd(reason)：'done' | 'stopped' | 'interrupted' | 'error'
 *   dwell：说完以后停多久（毫秒）；read(id)：字幕至少留多久（默认 readMs）
 * → { start(from) → Promise<reason>, stop(), next(), running, index, current, total, stops, state() }
 */
export function createTour({ stops = [], walkTo, say = sayLine, hush = (id) => voice.stopIf(id), halt, onStop, onState, onEnd, dwell = 1200, read = readMs, wait = sleep, now = () => Date.now() } = {}) {
  const list = Array.isArray(stops) ? stops.filter(Boolean) : [];
  let gen = 0;
  let running = false;
  let index = -1;
  let phase = 'idle';
  let line = null;
  let ended = null; // 这一趟的 Promise（逛完 / 结束时 resolve 原因）
  let settleEnd = null;

  const state = () => ({ running, index, total: list.length, stop: list[index] || null, line, phase });
  const emit = () => onState?.(state());
  const quiet = () => line && hush?.(line);

  function finish(reason) {
    if (!running) return;
    running = false;
    phase = 'idle';
    emit();
    onEnd?.(reason);
    const r = settleEnd;
    settleEnd = null;
    ended = null;
    r?.(reason);
  }

  async function run(from, my) {
    try {
      for (let i = from; i < list.length; i++) {
        const s = list[i];
        index = i;
        phase = 'walking';
        emit();
        const ok = walkTo ? await walkTo(s) : true;
        if (my !== gen) return;
        if (ok === false) return finish('interrupted');
        line = s.line;
        phase = 'talking';
        emit();
        onStop?.({ stop: s, index: i, total: list.length, line: s.line });
        const t0 = now();
        await say(s.line);
        if (my !== gen) return;
        const left = read(s.line) - (now() - t0);
        await wait(Math.max(dwell, left) + (i === list.length - 1 ? dwell : 0));
        if (my !== gen) return;
      }
      finish('done');
    } catch {
      if (my === gen) finish('error');
    }
  }

  return {
    /** 从第 from 站开始（正在逛就重新开始）→ 逛完 / 结束时 resolve 原因 */
    start(from = 0) {
      if (!list.length) return Promise.resolve('empty');
      quiet();
      const my = ++gen;
      if (!running || !ended) ended = new Promise((r) => (settleEnd = r));
      const done = ended;
      running = true;
      line = null;
      run(Math.max(0, Math.min(list.length - 1, Math.floor(Number(from) || 0))), my);
      return done;
    },
    /** 结束（「跳过」）：她不说了、脚步停下 */
    stop() {
      if (!running) return;
      gen++;
      quiet();
      halt?.();
      finish('stopped');
    },
    /** 马上去下一站（这一句不说完）；已经是最后一站 → 结束 */
    next() {
      if (!running) return;
      quiet();
      const my = ++gen;
      if (index + 1 >= list.length) return finish('done');
      run(index + 1, my);
    },
    get running() {
      return running;
    },
    get index() {
      return index;
    },
    get current() {
      return list[index] || null;
    },
    get total() {
      return list.length;
    },
    get stops() {
      return list.slice();
    },
    state,
  };
}
