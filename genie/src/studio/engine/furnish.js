// 自动摆家具 —— 用设计师的经验规则，而不是随机：
//   门：每扇门前面留出门扇的范围（深 = 门宽）；落地趟门 / 打通 / 开放边至少留一条 0.9m 宽的路；大门整段留空。
//       宁可少摆一件，也不挡门、不穿墙（主件挡到门会沿墙每次挪 0.3m 再试，挪不开就不摆）。
//   客厅：电视墙选「最长、没窗、没门」的整面墙；沙发在对面，离电视 2.7–3.3m；茶几离沙发 35–45cm。
//   卧室：床头靠「没窗」的墙，不背浴室 / 厨房 / 晒衣处（噪音、湿气、油烟）；床尾留 ≥ 60cm；
//         衣柜放在另一面墙，前面留 ≥ 60cm 更衣；放不下就把床挪到一边再试；衣柜短于 max(1.2m, 目标一半) 就不画，写进收纳对账。
//   厨房：沿最长墙（有窗优先：水槽对窗）做一字，够大就做 L；冰箱在不是转角的那一头；
//         灶台离冰箱 / 台面尽头 ≥ 0.75m、不进转角；水槽离冰箱 ≥ 0.5m；水槽和灶台之间 ≥ 0.6m 台面；岛台走道 1.05m（爆炒 1.2m）。
//   浴室：淋浴放离门最远的角 → 马桶（前面留 60cm、中心离两边 ≥ 40cm）→ 浴室柜最后。
//   餐厅：椅子后面要 0.9m；放不下就退到 4 人 / 0.9m 桌；年货节庆 → 放得下就摆 8 人圆桌。
//   神台：不靠浴室 / 厨房那面墙（湿气、油烟），也不放在大门那面墙。朝向不在这里定。
//   玄关 / 车廊：鞋柜长度 = 许愿之旅里数出来的鞋子换算；没有玄关也没有车廊，鞋柜放在客厅大门边。
//   多层：每一层照样摆；只摆一次的（神台、鞋柜 + 换鞋凳、宠物窝）只在一楼；大门只在一楼找。
//         起居厅 = 小一号的客厅（两人沙发、电视墙或书架、地毯、植物）；有小孩的玩具柜、在家上班的书桌（没有书房时）放这里。
//         楼梯间 / 挑空不放东西；楼梯上下口外面 1m 整段留空（下层的起步、上层的出口）。
// 纯函数（只读 plan / walls / profile），Node 里可测。plan 可以是 v1 或 v2；walls 可以是一层的数组、{ floorId: walls } 或不给。
// furnishReport() 给设计师「收纳对账」。

import { roomSides, uid, ROOM_TYPES, EXT_T, migratePlan, buildWalls, stairFlights } from '../plan/model.js';
import { storagePlan } from '../../shared/profile.js';
import { APPLIANCES } from '../../quiz/flow.js';

const SIDE_ROT = { N: 0, S: 180, W: 90, E: 270 };
const EPS = 0.03;
const PASSAGE = 0.9; // 落地趟门 / 打通 / 开放边：至少留一条 0.9m 宽的路
const TOUCH = 0.02; // 贴着门前禁区边上 2cm 以内不算压到
const WET_BEHIND = 8; // 床头背靠浴室 / 厨房 / 晒衣处：重罚

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

/** 靠墙摆：along = 沿墙方向的坐标，dist = 离墙线（墙中心）的距离 */
function at(room, side, along, dist) {
  if (side.side === 'N') return { x: along, z: room.y + dist, rot: 0 };
  if (side.side === 'S') return { x: along, z: room.y + room.d - dist, rot: 180 };
  if (side.side === 'W') return { x: room.x + dist, z: along, rot: 90 };
  return { x: room.x + room.w - dist, z: along, rot: 270 };
}

function footprint(item, w, d) {
  const swap = item.rot === 90 || item.rot === 270;
  const fw = swap ? d : w;
  const fd = swap ? w : d;
  return { x0: item.x - fw / 2, x1: item.x + fw / 2, z0: item.z - fd / 2, z1: item.z + fd / 2 };
}

/** 家具本体 + 前方通道（朝 rot 方向延伸 front 米） */
function frontBox(item, w, d, front) {
  const f = footprint(item, w, d + front);
  const r = (item.rot * Math.PI) / 180;
  const fx = Math.sin(r) * (front / 2);
  const fz = Math.cos(r) * (front / 2);
  return { x0: f.x0 + fx, x1: f.x1 + fx, z0: f.z0 + fz, z1: f.z1 + fz };
}

function overlap(a, b, m = 0) {
  return a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;
}

function inside(r, f, m = 0.02) {
  return f.x0 >= r.x0 - m && f.x1 <= r.x1 + m && f.z0 >= r.z0 - m && f.z1 <= r.z1 + m;
}

/** [lo, hi] 扣掉 blocks（[a, b] 列表）后剩下的空档 */
function subtract(lo, hi, blocks) {
  const bs = blocks.filter(([p, q]) => q > lo && p < hi).sort((x, y) => x[0] - y[0]);
  const out = [];
  let cur = lo;
  for (const [p, q] of bs) {
    if (p > cur) out.push({ a: cur, b: Math.min(p, hi) });
    cur = Math.max(cur, q);
    if (cur >= hi) break;
  }
  if (hi > cur) out.push({ a: cur, b: hi });
  return out.map((r) => ({ ...r, len: r.b - r.a })).filter((r) => r.len > 0.05);
}

/** 开口 [a, b] 被 blocked 挡掉一部分后，最长还剩多宽 */
function maxFree(a, b, blocked) {
  const bs = blocked.filter((x) => x.b > a && x.a < b).sort((p, q) => p.a - q.a);
  let cur = a;
  let best = 0;
  for (const x of bs) {
    best = Math.max(best, x.a - cur);
    cur = Math.max(cur, x.b);
  }
  return Math.max(best, b - cur);
}

const distRun = (r, t) => Math.round((t < r.a ? r.a - t : t > r.b ? t - r.b : 0) * 100) / 100;
/** 离 t 最近的段在前；一样近就长的在前 */
const byNear = (t) => (p, q) => distRun(p, t) - distRun(q, t) || q.len - p.len;

function wallsOn(side, walls) {
  return walls.filter((w) => w.axis === side.axis && Math.abs(w.c - side.c) < EPS && w.b > side.a + EPS && w.a < side.b - EPS);
}

// ───────────────────────── 房间的「框」：内墙面、门前禁区 ─────────────────────────

function innerRect(room, sides, walls) {
  const t = {};
  for (const s of sides) t[s.side] = wallsOn(s, walls).length ? s.thick : 0;
  return { x0: room.x + t.W, x1: room.x + room.w - t.E, z0: room.y + t.N, z1: room.y + room.d - t.S };
}

/** 某房间所在那一层的房间（plan 是一层 / v1 → 它自己的 rooms；v2 → 找房间在哪一层） */
function roomsAround(src, room) {
  if (Array.isArray(src?.rooms)) return src.rooms;
  for (const f of src?.floors || []) if (f.rooms.some((r) => r.id === room.id)) return f.rooms;
  return [];
}

/** 隔着某面墙（墙线两侧 EXT_T 以内）的房间（同一层） */
export function behind(plan, room, side, a = side.a, b = side.b) {
  const out = [];
  for (const r of roomsAround(plan, room)) {
    if (r.id === room.id) continue;
    let lo;
    let hi;
    if (side.side === 'N' || side.side === 'S') {
      const edge = side.side === 'N' ? r.y + r.d : r.y;
      if (Math.abs(edge - side.c) > EXT_T) continue;
      lo = r.x;
      hi = r.x + r.w;
    } else {
      const edge = side.side === 'W' ? r.x + r.w : r.x;
      if (Math.abs(edge - side.c) > EXT_T) continue;
      lo = r.y;
      hi = r.y + r.d;
    }
    if (Math.min(hi, b) - Math.max(lo, a) > 0.05) out.push(r);
  }
  return out;
}

/** 这段墙后面是浴室 / 晒衣处 / 厨房吗（噪音、湿气、油烟） */
function backsWet(plan, room, side, a, b) {
  return behind(plan, room, side, a, b).some((r) => ROOM_TYPES[r.type]?.wet || r.type === 'kitchen' || r.type === 'utility');
}

/** 大门（只在一楼）：模板里叫 d-main；AI 识别的图按「玄关外墙 > 车廊进屋 > 客厅外墙 > 走廊外墙」猜。plan 传一层（或 v2 → 一楼） */
export function mainEntrance(src, walls0) {
  let fl = src;
  let walls = walls0;
  if (fl && Array.isArray(fl.floors) && !Array.isArray(fl.rooms)) {
    fl = fl.floors[0];
    walls = Array.isArray(walls0) ? walls0 : walls0?.[fl?.id];
  }
  if (!fl) return null;
  if (!Array.isArray(walls)) walls = buildWalls(fl);
  const ops = fl.openings || [];
  const wallOf = (o) => walls.find((w) => w.pieces.some((p) => p.openingId === o.id));
  let o = ops.find((x) => x.id === 'd-main' && wallOf(x));
  if (!o) {
    const rank = (op) => {
      if (op.kind !== 'door' && op.kind !== 'slider') return -1;
      const w = wallOf(op);
      if (!w) return -1;
      const types = [w.neg?.type, w.pos?.type];
      if (w.exterior && types.includes('foyer')) return 5;
      if (!w.exterior && types.includes('porch') && types.some((t) => t && !ROOM_TYPES[t]?.outdoor)) return 4;
      if (w.exterior && types.includes('living')) return 3;
      if (w.exterior && types.includes('corridor')) return 2;
      return -1;
    };
    o = ops.filter((x) => rank(x) >= 0).sort((a, b) => rank(b) - rank(a))[0];
  }
  if (!o) return null;
  const w = wallOf(o);
  const p = w.pieces.find((x) => x.openingId === o.id);
  const m = (p.a + p.b) / 2;
  return { id: o.id, kind: o.kind, axis: w.axis, c: w.c, a: p.a, b: p.b, x: w.axis === 'x' ? m : w.c, z: w.axis === 'x' ? w.c : m, rooms: [w.neg?.id, w.pos?.id].filter(Boolean) };
}

/**
 * 门前禁区：门 = 整段、深度 = 门宽（不知道往哪边开，两边都留）；
 * 落地趟门 / 打通（≥ 1.5m 宽）深 0.9m，可以挡一部分，但要留一条 ≥ 0.9m 的路；大门整段都不能挡；
 * 没有墙的开放边（客厅 ↔ 餐厅 / 玄关 / 走廊）深 0.6m，同样要留 0.9m 的路。
 */
function keepOuts(room, sides, walls, plan, main) {
  const out = [];
  const boxFor = (s, a, b, depth) => {
    if (s.side === 'N') return { x0: a, x1: b, z0: room.y, z1: room.y + depth };
    if (s.side === 'S') return { x0: a, x1: b, z0: room.y + room.d - depth, z1: room.y + room.d };
    if (s.side === 'W') return { x0: room.x, x1: room.x + depth, z0: a, z1: b };
    return { x0: room.x + room.w - depth, x1: room.x + room.w, z0: a, z1: b };
  };
  for (const s of sides) {
    const mine = wallsOn(s, walls);
    for (const w of mine)
      for (const p of w.pieces) {
        if (p.kind !== 'door' && p.kind !== 'slider' && p.kind !== 'open') continue;
        const a = Math.max(p.a, s.a);
        const b = Math.min(p.b, s.b);
        if (b - a < 0.05) continue;
        const width = p.b - p.a;
        const isMain = !!main && p.openingId === main.id;
        const full = p.kind === 'door' || isMain || width < 1.5;
        const depth = s.thick + (p.kind === 'door' ? width : PASSAGE);
        out.push({ box: boxFor(s, a, b, depth), full, axis: s.axis, a, b, kind: p.kind, id: p.openingId, side: s.side, main: isMain, blocked: [] });
      }
    for (const g of subtract(s.a, s.b, mine.map((w) => [w.a, w.b]))) {
      if (g.len < PASSAGE || !behind(plan, room, s, g.a, g.b).length) continue;
      out.push({ box: boxFor(s, g.a, g.b, 0.6), full: false, axis: s.axis, a: g.a, b: g.b, kind: 'pass', id: null, side: s.side, main: false, blocked: [] });
    }
  }
  return out;
}

const STAIR_KEEP = 1.0; // 楼梯口外面整段留空的深度

/**
 * 楼梯上下口的禁区：{ [floorId]: [keep…] } —— 下层起步那一段、上层出口那一段，往外 1m（full：一点都不能压）
 */
function stairKeeps(plan) {
  const out = {};
  for (const s of plan.stairs || []) {
    const g = stairFlights(plan, s.id);
    if (!g) continue;
    for (const [fid, mouth] of [
      [s.from, g.entry],
      [s.to, g.exit],
    ]) {
      const { seg, edge } = mouth;
      const horiz = Math.abs(seg.y0 - seg.y1) < EPS;
      const k = STAIR_KEEP;
      const box = horiz
        ? { x0: seg.x0, x1: seg.x1, z0: edge === 'N' ? seg.y0 - k : seg.y0, z1: edge === 'N' ? seg.y0 : seg.y0 + k }
        : { x0: edge === 'W' ? seg.x0 - k : seg.x0, x1: edge === 'W' ? seg.x0 : seg.x0 + k, z0: seg.y0, z1: seg.y1 };
      (out[fid] ||= []).push({ box, full: true, axis: horiz ? 'x' : 'z', a: horiz ? seg.x0 : seg.y0, b: horiz ? seg.x1 : seg.y1, kind: 'stair', id: `${s.id}-${fid}`, side: null, main: false, blocked: [] });
    }
  }
  return out;
}

function frame(room, walls, plan, main, extraKeep = []) {
  const sides = roomSides(room, walls);
  const inner = innerRect(room, sides, walls);
  const keep = keepOuts(room, sides, walls, plan, main);
  const r = { x0: room.x, x1: room.x + room.w, z0: room.y, z1: room.y + room.d };
  for (const k of extraKeep) if (overlap(k.box, r, -0.05)) keep.push({ ...k, blocked: [] });
  let mainSide = null;
  if (main && main.rooms.includes(room.id)) mainSide = sides.find((s) => s.axis === main.axis && Math.abs(s.c - main.c) < EPS)?.side || null;
  return { room, sides, inner, keep, walls, mainSide };
}

/** 给测试 / 设计师叠图用：房间的内墙面框 + 门前禁区（v2 plan：含楼梯口；walls = 这个房间那一层的墙） */
export function roomFrame(src, walls0, room) {
  let fl = src;
  let walls = walls0;
  let main;
  let extra = [];
  if (fl && Array.isArray(fl.floors) && !Array.isArray(fl.rooms)) {
    const v2 = migratePlan(src);
    fl = v2.floors.find((x) => x.rooms.some((r) => r.id === room.id)) || v2.floors[0];
    if (!Array.isArray(walls)) walls = walls0?.[fl.id] || buildWalls(fl);
    main = fl.level === 0 ? mainEntrance(fl, walls) : null;
    extra = stairKeeps(v2)[fl.id] || [];
  } else main = mainEntrance(fl, walls);
  const f = frame(room, walls, fl, main, extra);
  const keep = f.keep.map((k) => {
    const o = { ...k };
    delete o.blocked;
    return o;
  });
  return { inner: f.inner, keep, mainSide: f.mainSide };
}

/** 家具实际占的地（含床头 / 椅子这些看不见的余量） */
export function footprintOf(item) {
  return item._box || footprint(item, item.w || 0.5, item.d || 0.5);
}

/** 墙线 → 对面内墙面的距离 */
function reach(rc, s) {
  const { room, inner } = rc;
  if (s.side === 'N') return inner.z1 - room.y;
  if (s.side === 'S') return room.y + room.d - inner.z0;
  if (s.side === 'W') return inner.x1 - room.x;
  return room.x + room.w - inner.x0;
}

// ───────────────────────── 摆放器 ─────────────────────────

class Layout {
  constructor() {
    this.items = [];
    this.boxes = [];
    this.rooms = new Map();
    this.floor = null; // 现在摆的是哪一层（每件家具都记下来）
  }
  room(room, rc) {
    this.rooms.set(room.id, rc);
  }
  mark() {
    return this.items.length;
  }
  reset(m) {
    this.items.length = m;
    this.boxes.length = m;
    for (const rc of this.rooms.values()) for (const k of rc.keep) k.blocked = k.blocked.filter((x) => x.i < m);
  }
  /** 能不能放（不真的放）：在房间里、不压门、（非 force）不和别的家具 / 它们前面的通道打架 */
  check(room, pos, w, d, { front = 0, margin = 0.02, force = false, strict = false } = {}) {
    const rc = this.rooms.get(room.id);
    const probe = { x: pos.x, z: pos.z, rot: pos.rot };
    const core = footprint(probe, w, d);
    const f = front ? frontBox(probe, w, d, front) : core;
    const box = rc ? rc.inner : { x0: room.x, x1: room.x + room.w, z0: room.y, z1: room.y + room.d };
    if (!inside(box, core) || (front && !inside(box, f))) return null;
    const hits = [];
    for (const k of rc?.keep || []) {
      if (!overlap(core, k.box, -TOUCH)) continue;
      if (k.full || strict) return null;
      const iv = k.axis === 'x' ? { a: Math.max(core.x0, k.a), b: Math.min(core.x1, k.b) } : { a: Math.max(core.z0, k.a), b: Math.min(core.z1, k.b) };
      if (maxFree(k.a, k.b, [...k.blocked, iv]) < PASSAGE - 0.01) return null;
      hits.push([k, iv]);
    }
    if (!force && this.boxes.some((b) => !b.flat && b.room === room.id && (overlap(core, b.f, margin) || (front && overlap(f, b.core, 0))))) return null;
    return { core, f, hits };
  }
  /** 放一件；front = 前方要留的通道（米）。force = 主件：不管别的家具，但照样不压门、不出房间，挡到就沿墙挪 0.3m 再试 */
  try(room, kind, pos, w, d, extra = {}, opts = {}) {
    let ok = this.check(room, pos, w, d, opts);
    let p = pos;
    if (!ok && opts.force) {
      const alongX = pos.rot === 0 || pos.rot === 180;
      const moves = [];
      for (const s of [0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2, 1.5, -1.5]) moves.push(alongX ? [s, 0] : [0, s]);
      if (opts.both) for (const s of [0.3, -0.3, 0.6, -0.6, 0.9, -0.9]) moves.push(alongX ? [0, s] : [s, 0]);
      for (const [dx, dz] of moves) {
        const q = { ...pos, x: pos.x + dx, z: pos.z + dz };
        if (opts.span) {
          const c = alongX ? q.x : q.z;
          if (c - w / 2 < opts.span[0] - 0.02 || c + w / 2 > opts.span[1] + 0.02) continue;
        }
        ok = this.check(room, q, w, d, opts);
        if (ok) {
          p = q;
          break;
        }
      }
    }
    if (!ok) return null;
    const item = { id: uid('f'), kind, room: room.id, floor: this.floor, x: +p.x.toFixed(3), z: +p.z.toFixed(3), rot: p.rot, w, d, ...extra };
    Object.defineProperty(item, '_box', { value: ok.core, enumerable: false });
    const i = this.items.length;
    this.items.push(item);
    this.boxes.push({ room: room.id, f: ok.f, core: ok.core, flat: false });
    for (const [k, iv] of ok.hits) k.blocked.push({ ...iv, i });
    return item;
  }
  /** 地毯这种可以压在家具下的 */
  flat(room, kind, pos, w, d, extra = {}) {
    const item = { id: uid('f'), kind, room: room.id, floor: this.floor, x: +pos.x.toFixed(3), z: +pos.z.toFixed(3), rot: pos.rot, w, d, ...extra };
    this.items.push(item);
    this.boxes.push({ room: room.id, flat: true });
    return item;
  }
}

/** 沿某面墙这一段，深 d（前面再留 front）放得下的空档：扣掉门前禁区、别的家具和它们的通道 */
function freeRuns(L, rc, side, st, d, front = 0, margin = 0.02) {
  const { room, inner, keep } = rc;
  const ax = side.axis === 'x';
  const lo = Math.max(st.a, ax ? inner.x0 : inner.z0);
  const hi = Math.min(st.b, ax ? inner.x1 : inner.z1);
  if (hi - lo < 0.1) return [];
  const band = (d0, d1) => {
    const p = at(room, side, 0, d0);
    const q = at(room, side, 0, d1);
    const u = ax ? p.z : p.x;
    const v = ax ? q.z : q.x;
    return [Math.min(u, v), Math.max(u, v)];
  };
  const core = band(side.thick, side.thick + d);
  const fr = front ? band(side.thick + d, side.thick + d + front) : null;
  const [i0, i1] = ax ? [inner.z0, inner.z1] : [inner.x0, inner.x1];
  if (core[0] < i0 - 0.02 || core[1] > i1 + 0.02) return [];
  if (fr && (fr[0] < i0 - 0.02 || fr[1] > i1 + 0.02)) return [];
  const across = (b) => (ax ? [b.z0, b.z1] : [b.x0, b.x1]);
  const along = (b) => (ax ? [b.x0, b.x1] : [b.z0, b.z1]);
  const hits = (b, bd, m) => {
    const [p, q] = across(b);
    return p < bd[1] + m && q > bd[0] - m;
  };
  const blocks = [];
  for (const k of keep) {
    if (!hits(k.box, core, -TOUCH)) continue;
    if (!k.full && k.axis !== side.axis) {
      // 垂直墙上的宽开口：柜子只占开口的一头，还留得下 0.9m 的路就不算挡
      const iv = { a: Math.max(core[0], k.a), b: Math.min(core[1], k.b) };
      if (maxFree(k.a, k.b, [...k.blocked, iv]) >= PASSAGE - 0.01) continue;
    }
    blocks.push(along(k.box));
  }
  for (const b of L.boxes) {
    if (b.flat || b.room !== room.id) continue;
    if (hits(b.f, core, margin)) {
      const [p, q] = along(b.f);
      blocks.push([p - margin, q + margin]);
    }
    if (fr && hits(b.core, fr, 0)) blocks.push(along(b.core));
  }
  return subtract(lo, hi, blocks);
}

/**
 * 靠墙放一件：在这面墙这一段的空档里找位置。宽度 = min(maxW, 空档)，≥ minW 才放。
 * prefer：目标中心（沿墙坐标）或 'a' | 'b' | 'mid'；rank 'near' = 离目标最近的空档优先，否则最宽的优先。
 * ok(a, b)：额外条件（例如神台那一段墙后面不能是厨房）。
 */
function hug(L, rc, side, st, kind, o) {
  const { d, minW, maxW, front = 0, margin = 0.02, gap = 0.02, prefer = 'mid', rank = 'wide', ok = null, extra = null } = o;
  const runs = freeRuns(L, rc, side, st, d, front, margin);
  const want = (r) => Math.min(maxW, r.len - 2 * gap);
  const cs = runs.filter((r) => want(r) >= minW - 1e-6);
  if (rank === 'near' && typeof prefer === 'number') cs.sort((p, q) => distRun(p, prefer) - distRun(q, prefer) || want(q) - want(p));
  else cs.sort((p, q) => want(q) - want(p));
  for (const r of cs) {
    for (let w = want(r); w >= minW - 1e-6; w -= 0.1) {
      const lo = r.a + gap + w / 2;
      const hi = r.b - gap - w / 2;
      const c0 = clamp(typeof prefer === 'number' ? prefer : prefer === 'a' ? lo : prefer === 'b' ? hi : (lo + hi) / 2, lo, hi);
      const steps = [c0];
      if (ok) for (let t = lo; t <= hi + 1e-6; t += 0.05) steps.push(t);
      else steps.push(lo, hi);
      steps.sort((p, q) => Math.abs(p - c0) - Math.abs(q - c0));
      for (const c of steps) {
        if (ok && !ok(c - w / 2, c + w / 2)) continue;
        const it = L.try(rc.room, kind, at(rc.room, side, c, side.thick + d / 2), +w.toFixed(3), d, extra ? extra(+w.toFixed(3)) : {}, { front, margin });
        if (it) return it;
      }
    }
  }
  return null;
}

/** 在几面墙里挑「放得最长」的那一段再放 */
function bestHug(L, rc, sideList, kind, o) {
  let best = null;
  for (const s of sideList)
    for (const st of s.stretches) {
      const runs = freeRuns(L, rc, s, st, o.d, o.front || 0, o.margin ?? 0.02);
      const w = Math.min(o.maxW, Math.max(0, ...runs.map((r) => r.len - 0.04)));
      if (w >= o.minW - 1e-6 && (!best || w > best.w + 0.01)) best = { s, st, w };
    }
  return best ? hug(L, rc, best.s, best.st, kind, o) : null;
}

const score = (s, { noWindow = 3, noDoor = 1 } = {}) => (s.stretches[0]?.len || 0) - s.windows * noWindow - s.doors * noDoor;
const opposite = (sides, s) => sides.find((x) => x.side === { N: 'S', S: 'N', W: 'E', E: 'W' }[s.side]);
const depthOf = (room, s) => (s.axis === 'x' ? room.d : room.w);
const mid = (st) => (st.a + st.b) / 2;

// ───────────────────────── 目标（摆家具和收纳对账共用） ─────────────────────────

function wardrobeTarget(kind, ctx) {
  if (kind === 'master') return ctx.hasWalkin ? 1.8 : Math.max(1.8, ctx.wardrobeMM / 1000);
  if (kind === 'kids') return ctx.teen ? 1.8 : 1.2;
  return 1.8;
}
const minWardrobe = (target) => Math.max(1.2, target * 0.5);

function diningWant(ctx) {
  return ctx.festive ? 8 : ctx.social > 60 || ctx.people >= 4 ? 6 : 4;
}

/** 餐桌：椅子后面（shortDim/2 − 半径）要 ≥ 0.9m，不够就退一号 */
function tableOptions(room, ctx) {
  const shortDim = Math.min(room.w, room.d);
  const longDim = Math.max(room.w, room.d);
  const want = diningWant(ctx);
  const round = shortDim < 2.7 || ctx.curve > 90;
  const opts = [];
  if (want >= 8) opts.push({ seats: 8, variant: 'round', w: 1.5 });
  if (want >= 6) opts.push(round ? { seats: 6, variant: 'round', w: 1.3 } : { seats: 6, variant: 'rect', w: 1.8, d: 0.9 });
  opts.push(round ? { seats: 4, variant: 'round', w: 1.1 } : { seats: 4, variant: 'rect', w: 1.4, d: 0.9 });
  opts.push(round ? { seats: 4, variant: 'round', w: 0.9 } : { seats: 4, variant: 'rect', w: 0.9, d: 0.9 });
  const clear = (o) => (o.variant === 'round' ? shortDim / 2 - o.w / 2 : Math.min((shortDim - o.d) / 2, (longDim - o.w) / 2 + 0.3));
  const i = opts.findIndex((o) => clear(o) >= 0.9 - 1e-9);
  return { want, opts: i < 0 ? opts.slice(-1) : opts.slice(i) };
}

// ───────────────────────── 每种房间 ─────────────────────────

/** 神台：不靠背后是浴室 / 厨房 / 晒衣处的墙，不放在大门那面墙 */
function placeAltar(L, rc, ctx, s, st, margin = 0.02, front = 0.8) {
  if (!st || s.side === rc.mainSide) return null;
  const it = hug(L, rc, s, st, 'altar', { d: 0.5, minW: 1.2, maxW: 1.2, front, margin, prefer: mid(st), rank: 'near', ok: (a, b) => !backsWet(ctx.plan, rc.room, s, a, b), extra: () => ({}) });
  if (it) ctx.placedAltar = true;
  return it;
}

/** 电视墙 + 沙发 + 茶几：沙发挡到门 / 通道就沿墙挪一点、换小一号，最后才离墙。compact = 起居厅（小电视墙、两人沙发） */
function sofaGroup(L, rc, ctx, tvSide, compact = false) {
  const { room } = rc;
  const st = tvSide.stretches[0];
  const tvW = Math.min(st.len - 0.1, compact ? 2.4 : 3.2);
  const tv = L.try(room, 'tvWall', at(room, tvSide, mid(st), tvSide.thick + 0.23), tvW, 0.45, { h: ctx.wallH }, { force: true, span: [st.a, st.b] });
  const tvAlong = tv ? (tvSide.axis === 'x' ? tv.x : tv.z) : mid(st);
  const D = depthOf(room, tvSide);
  const R = reach(rc, tvSide);
  const variant0 = compact ? (ctx.curve > 62 ? 'curvy' : 'classic') : ctx.curve > 62 ? 'curvy' : ctx.social > 65 && D > 3.8 && st.len > 3 ? 'lshape' : 'classic';
  const sofaW0 = compact ? 1.7 : Math.min(variant0 === 'lshape' ? 2.6 : 2.3, Math.max(1.8, tvW));
  const sofaD = 0.92;
  const back = D - tvSide.thick * 2 - 0.05 <= (compact ? 3.8 : 4.6);
  const far = Math.min(compact ? 2.6 : 3.3, D - 1.2) + 0.45;
  const dists = back ? [R - sofaD / 2, R - sofaD / 2 - 0.9] : [far, far - 0.3];
  const tvFace = tvSide.thick + 0.455;
  const rot = (SIDE_ROT[tvSide.side] + 180) % 360;
  const widths = compact ? [1.7, 1.5] : [...new Set([sofaW0, Math.min(sofaW0, 2.0), 1.8])];
  for (const sd of dists) {
    if (sd - sofaD / 2 - tvFace < (compact ? 1.5 : 1.9)) continue;
    for (const w of widths)
      for (const sh of [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6, 0.75, -0.75]) {
        const along = tvAlong + sh;
        const variant = variant0 === 'lshape' && w < 2.2 ? 'classic' : variant0;
        const sofa = L.try(room, 'sofa', { ...at(room, tvSide, along, sd), rot }, w, sofaD, { variant });
        if (!sofa) continue;
        const ctDist = sd - sofaD / 2 - 0.4 - 0.3;
        const ctVar = ctx.refined ? 'stone' : ctx.curve > 55 ? 'round' : 'rect';
        (!compact && L.try(room, 'coffeeTable', at(room, tvSide, along, ctDist), 1.0, 0.6, { variant: ctVar })) || L.try(room, 'coffeeTable', at(room, tvSide, along, ctDist + 0.05), 0.8, 0.5, { variant: ctVar });
        const rugD = Math.max(1.6, sd - tvSide.thick - 0.7);
        L.flat(room, 'rug', at(room, tvSide, along, sd - rugD / 2 + 0.25), w + 0.6, rugD, { variant: ctx.curve > 90 ? 'round' : 'rect' });
        return { st, along, w, sd, ctDist, back: back && sd === dists[0] };
      }
  }
  return { st, along: tvAlong, w: 0, sd: 0, back: false, none: true };
}

/** 没有玄关、也没有车廊：鞋柜放在客厅大门边 */
function shoeByDoor(L, rc, ctx) {
  const me = ctx.main;
  const s = rc.sides.find((x) => x.side === rc.mainSide);
  if (!s || !me) return;
  const t = s.axis === 'x' ? me.x : me.z;
  const h = Math.min(2.6, ctx.wallH - 0.1);
  for (const st of [...s.stretches].sort(byNear(t)))
    if (hug(L, rc, s, st, 'shoeCabinet', { d: 0.38, minW: 0.6, maxW: Math.max(1.2, ctx.shoeMM / 1000), front: 0.5, prefer: t, rank: 'near', extra: (w) => ({ w, h }) })) {
      ctx.placedShoe = true;
      return;
    }
}

function living(L, rc, ctx) {
  const { room, sides } = rc;
  const cands = sides.filter((s) => s.walled && (s.stretches[0]?.len || 0) >= 1.8).sort((a, b) => score(b, { noWindow: 2 }) - score(a, { noWindow: 2 }));
  const tvSide = cands[0];
  const grp = tvSide ? sofaGroup(L, rc, ctx, tvSide) : null;
  if (ctx.shoeInLiving && rc.mainSide && !ctx.placedShoe) shoeByDoor(L, rc, ctx);
  // 神台比单椅、展示柜重要：先找墙
  const oppo0 = tvSide ? opposite(sides, tvSide) : null;
  if (ctx.altar && ctx.ground && !ctx.placedAltar)
    for (const s of sides.filter((x) => x !== tvSide && x !== oppo0 && (x.stretches[0]?.len || 0) >= 1.3).sort((a, b) => score(b) - score(a))) if (placeAltar(L, rc, ctx, s, s.stretches[0])) break;
  if (grp && !grp.none) {
    // 单椅斜放、面向茶几；另一侧落地灯
    const { along, w, sd, ctDist } = grp;
    const ct = at(room, tvSide, along, ctDist);
    const p = at(room, tvSide, along + w / 2 + 0.6, ctDist + 0.15);
    const face = Math.round((Math.atan2(ct.x - p.x, ct.z - p.z) * 180) / Math.PI);
    if (!L.try(room, 'armchair', { ...p, rot: (face + 360) % 360 }, 0.8, 0.8, { variant: ctx.natural ? 'lounge' : 'classic' }))
      L.try(room, 'floorLamp', at(room, tvSide, along + w / 2 + 0.3, sd), 0.4, 0.4);
    L.try(room, 'floorLamp', at(room, tvSide, along - w / 2 - 0.3, sd), 0.4, 0.4) || L.try(room, 'sideTable', at(room, tvSide, along - w / 2 - 0.3, sd), 0.45, 0.45);
  }
  // 侧墙（含只有一段实墙的开放边，例如客厅和厨房之间那一段）：神台 / 展示柜 / 书墙 / 植物
  const oppo = tvSide ? opposite(sides, tvSide) : null;
  const others = sides.filter((s) => s !== tvSide && s !== oppo && (s.stretches[0]?.len || 0) >= 1.3).sort((a, b) => score(b) - score(a));
  const wantDisplay = ctx.displayPct >= 35 && !ctx.avoid.has('glassdoor');
  for (const s of others) {
    const sst = s.stretches[0];
    if (!sst || sst.len < 1.3) continue;
    if (wantDisplay) {
      const maxW = Math.min(2.4, sst.len - 0.2);
      if (hug(L, rc, s, sst, 'displayCabinet', { d: 0.42, minW: Math.min(1.0, maxW), maxW, front: 0.6, extra: () => ({ h: Math.min(2.4, ctx.wallH - 0.2) }) })) continue;
    }
    if (ctx.books >= 6 && !ctx.hasStudy && !ctx.avoid.has('openshelf')) {
      const maxW = Math.min(2.4, sst.len - 0.2, Math.max(1.2, ctx.books * 0.16));
      if (hug(L, rc, s, sst, 'bookshelf', { d: 0.34, minW: Math.min(1.0, maxW), maxW, front: 0.6, extra: () => ({ h: Math.min(2.4, ctx.wallH - 0.2), key: 'woodwork' }) })) continue;
    }
    L.try(room, 'plant', at(room, s, sst.a + 0.35 > sst.b ? mid(sst) : sst.b - 0.35, s.thick + 0.3), 0.45, 0.45, { variant: 'tall', seed: 7 });
  }
  if (ctx.pets && ctx.ground && !ctx.placedPet) {
    // 沙发两端、电视墙两角、房间四角，哪里空放哪里
    const tries = [];
    if (grp && !grp.none) {
      const { along, w, sd, st } = grp;
      tries.push(at(room, tvSide, along - w / 2 - 0.65, sd - 0.7), at(room, tvSide, along + w / 2 + 0.65, sd - 0.7), at(room, tvSide, st.a + 0.55, tvSide.thick + 0.75), at(room, tvSide, st.b - 0.55, tvSide.thick + 0.75));
    }
    tries.push({ x: room.x + 0.55, z: room.y + 0.55 }, { x: room.x + room.w - 0.55, z: room.y + room.d - 0.55 }, { x: room.x + 0.55, z: room.y + room.d - 0.55 }, { x: room.x + room.w - 0.55, z: room.y + 0.55 });
    for (const p of tries)
      if (L.try(room, 'petBed', { ...p, rot: 0 }, 0.8, 0.8)) {
        ctx.placedPet = true;
        break;
      }
  }
  if (ctx.kids && !ctx.hasKidsRoom && !ctx.hasFamily && others[0]?.stretches[0]?.len > 1.4) {
    const s = others[others.length - 1];
    const sst = s?.stretches[0];
    if (sst) hug(L, rc, s, sst, 'toyStorage', { d: 0.38, minW: 0.8, maxW: Math.min(1.4, sst.len - 0.2) });
  }
  if (grp?.back && oppo?.walled) L.flat(room, 'art', { ...at(room, oppo, grp.along, oppo.thick + 0.03), rot: (SIDE_ROT[tvSide.side] + 180) % 360 }, 1.2, 0.04, { y: 1.35, w: 1.2, h: 0.75 });
}

/** 起居厅（楼上的家庭厅）：小一号的客厅 —— 电视墙 + 两人沙发 + 小茶几 + 地毯；没有像样的电视墙就沙发靠墙（窗下也行）；
 *  玩具柜（有小孩）、书桌（在家上班、没有书房）、书架（书多、没有书房）、植物。不放神台、鞋柜、宠物窝。 */
function family(L, rc, ctx) {
  const { room, sides } = rc;
  const cands = sides.filter((s) => s.walled && (s.stretches[0]?.len || 0) >= 1.6).sort((a, b) => score(b, { noWindow: 2 }) - score(a, { noWindow: 2 }));
  const tvSide = cands[0];
  const grp = tvSide ? sofaGroup(L, rc, ctx, tvSide, true) : null;
  let sofaSide = null;
  if (!grp || grp.none) {
    const ws = roomSides(room, rc.walls, { allowWindow: true })
      .filter((s) => s.walled)
      .sort((a, b) => (b.stretches[0]?.len || 0) - (a.stretches[0]?.len || 0));
    for (const s of ws) {
      const st = s.stretches[0];
      if (!st || st.len < 1.6) continue;
      const sofa = hug(L, rc, s, st, 'sofa', { d: 0.92, minW: 1.4, maxW: 1.7, front: 0.9, extra: () => ({ variant: ctx.curve > 62 ? 'curvy' : 'classic' }) });
      if (!sofa) continue;
      sofaSide = sides.find((x) => x.side === s.side);
      const c = s.axis === 'x' ? sofa.x : sofa.z;
      L.try(room, 'coffeeTable', at(room, s, c, s.thick + 0.92 + 0.4 + 0.25), 0.8, 0.5, { variant: ctx.curve > 55 ? 'round' : 'rect' });
      L.flat(room, 'rug', at(room, s, c, s.thick + 0.92), sofa.w + 0.6, 1.6, { variant: 'rect' });
      break;
    }
  }
  const others = sides
    .filter((s) => s !== tvSide && s !== sofaSide && s.walled)
    .flatMap((s) => s.stretches.map((x) => ({ s, x })))
    .filter((o) => o.x.len >= 1.0)
    .sort((p, q) => q.x.len - p.x.len);
  const want = [];
  if (ctx.kids) want.push(['toyStorage', { d: 0.38, minW: 0.8, maxW: 1.4, front: 0.6, extra: () => ({}) }]);
  if (ctx.wfh && !ctx.hasStudy) want.push(['desk', { d: 0.6, minW: 1.2, maxW: 1.2, front: 0.6, extra: () => ({ w: 1.2, d: 0.6 }) }]);
  if (ctx.books >= 6 && !ctx.hasStudy && !ctx.avoid.has('openshelf')) want.push(['bookshelf', { d: 0.34, minW: 1.0, maxW: Math.min(2.0, Math.max(1.2, ctx.books * 0.16)), front: 0.6, extra: () => ({ h: Math.min(2.4, ctx.wallH - 0.2), key: 'woodwork' }) }]);
  for (const [kind, o] of want) for (const { s, x } of others) if (x.len >= o.minW + 0.05 && hug(L, rc, s, x, kind, o)) break;
  for (const { s, x } of [...others].reverse()) if (L.try(room, 'plant', at(room, s, x.b - 0.35 > x.a ? x.b - 0.35 : mid(x), s.thick + 0.3), 0.45, 0.45, { variant: 'tall', seed: 13 })) break;
}

/** 餐桌实在放不下：靠墙放一张两人桌 */
function wallTable(L, rc) {
  const { room, sides, inner } = rc;
  const ws = sides.filter((x) => x.walled).sort((a, b) => (b.stretches[0]?.len || 0) - (a.stretches[0]?.len || 0));
  for (const s of ws) {
    const ax = s.axis === 'x';
    for (const st of s.stretches) {
      const lo = Math.max(st.a, ax ? inner.x0 : inner.z0);
      const hi = Math.min(st.b, ax ? inner.x1 : inner.z1);
      const c0 = (lo + hi) / 2;
      for (let k = 0; k < 60; k++) {
        const c = c0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.05;
        if (c - 0.825 < lo - 0.01 || c + 0.825 > hi + 0.01) continue;
        const it = L.try(room, 'diningTable', { ...at(room, s, c, s.thick + 0.4), rot: ax ? 90 : 0 }, 0.8, 1.65, { variant: 'rect', w: 0.8, d: 0.75, seats: 2 });
        if (it) return it;
      }
    }
  }
  return null;
}

function dining(L, rc, ctx) {
  const { room, sides } = rc;
  const long = room.w >= room.d ? 'x' : 'z';
  const cx = room.x + room.w / 2;
  const cz = room.y + room.d / 2;
  const walls = sides.filter((x) => x.stretches[0]?.len >= 1.3).sort((a, b) => score(b) - score(a));
  // 客厅放不下神台的话，放餐厅：神台先占墙（前面留 0.6m），餐桌再让位 / 退小一号；连桌子都放不下就先放桌子
  const m0 = L.mark();
  const altarFirst = ctx.altar && ctx.ground && !ctx.placedAltar;
  if (altarFirst) for (const s of walls) if (placeAltar(L, rc, ctx, s, s.stretches[0], 0.3, 0.6)) break;
  let tbl = placeTable(L, rc, ctx, long, cx, cz);
  if (!tbl && altarFirst && ctx.placedAltar) {
    L.reset(m0);
    ctx.placedAltar = false;
    tbl = placeTable(L, rc, ctx, long, cx, cz);
    for (const s of walls) if (placeAltar(L, rc, ctx, s, s.stretches[0], 0.3, 0.6)) break;
  }
  L.flat(room, 'pendant', { x: tbl ? tbl.x : cx, z: tbl ? tbl.z : cz, rot: 0 }, 0.5, 0.5, { drop: 1.0 });
  for (const s of walls.filter((x) => x.stretches[0].len >= 1.6))
    if (hug(L, rc, s, s.stretches[0], 'sideboard', { d: 0.45, minW: 1.2, maxW: Math.min(1.8, s.stretches[0].len - 0.2), margin: 0.75, extra: () => ({}) })) break;
}

/** 餐桌：从居中开始，前后左右挪一点；放不下退小一号；最后靠墙放两人桌 */
function placeTable(L, rc, ctx, long, cx, cz) {
  const { room } = rc;
  const moves = [];
  for (const dx of [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6, 0.75, -0.75, 0.9, -0.9])
    for (const dz of [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6, 0.75, -0.75, 0.9, -0.9]) moves.push([dx, dz]);
  moves.sort((p, q) => Math.hypot(...p) - Math.hypot(...q));
  let tbl = null;
  for (const o of tableOptions(room, ctx).opts) {
    const ends = o.w < 1.2 && o.seats >= 4 ? 0.7 : 0; // 0.9m 方桌四边各一张椅子：两头也要留出椅子的位置
    for (const [dx, dz] of moves) {
      const pos = { x: cx + dx, z: cz + dz };
      tbl =
        o.variant === 'round'
          ? L.try(room, 'diningTable', { ...pos, rot: 0 }, o.w + 0.7, o.w + 0.7, { variant: 'round', w: o.w, seats: o.seats })
          : L.try(room, 'diningTable', { ...pos, rot: long === 'x' ? 0 : 90 }, o.w + ends, o.d + 0.9, { variant: 'rect', w: o.w, d: o.d, seats: o.seats });
      if (tbl) break;
    }
    if (tbl) break;
  }
  return tbl || wallTable(L, rc);
}

/** 台面可以穿过窗台 ≥ 0.85m 的窗；门 / 落地窗 / 打通 断开 */
function counterRuns(side, walls) {
  const ps = [];
  for (const w of wallsOn(side, walls))
    for (const p of w.pieces) {
      const a = Math.max(p.a, side.a);
      const b = Math.min(p.b, side.b);
      if (b - a < EPS) continue;
      if (p.kind === 'solid' || (p.kind === 'window' && (p.sill ?? 0.9) >= 0.85)) ps.push({ a, b, win: p.kind === 'window' });
    }
  ps.sort((p, q) => p.a - q.a);
  const out = [];
  for (const p of ps) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.b - p.a) < EPS) last.b = p.b;
    else out.push({ a: p.a, b: p.b, wins: [] });
    if (p.win) out[out.length - 1].wins.push({ a: p.a, b: p.b });
  }
  return out.map((x) => ({ ...x, len: x.b - x.a })).sort((x, y) => y.len - x.len);
}

/**
 * 水槽 / 灶台放哪（米，从主台面 a 端量起）：
 *   灶台中心离冰箱 / 台面尽头 ≥ 0.75m、离转角 ≥ 0.6 + 0.35m、不在窗下（烟机）；
 *   水槽在窗下（有窗的话），否则边缘离冰箱 ≥ 0.5m；不进转角；水槽和灶台之间 ≥ 0.6m 台面。
 *   主台面不到 2.4m 又有 L：灶台放 L 那一段。做不到全部就挑违反最少的。
 */
function sinkHob({ len, corner, fridge, wins, leg }) {
  const S = 0.3;
  const H = 0.35;
  const endGap = (u, end) => (end === 'a' ? u : len - u);
  const under = (u, half, ws) => ws.some((w) => u + half > w.a + 0.02 && u - half < w.b - 0.02);
  const sinks = [];
  for (let u = S + 0.05; u <= len - S - 0.05 + 1e-9; u += 0.05) sinks.push(u);
  const hobsMain = [];
  if (leg || len >= 1.6) for (let u = H + 0.05; u <= len - H - 0.05 + 1e-9; u += 0.05) hobsMain.push(u);
  const hobsLeg = [];
  if (leg) for (let u = H + 0.1; u <= leg.len - H - 0.05 + 1e-9; u += 0.05) hobsLeg.push(u);
  const winC = (u) => wins.reduce((best, w) => Math.min(best, Math.abs(u - (w.a + w.b) / 2)), Infinity);
  let best = null;
  for (const us of sinks) {
    let ps = 0;
    if (wins.length) {
      if (!wins.some((w) => us - S >= w.a - 0.05 && us + S <= w.b + 0.05)) ps += 100;
      ps += winC(us) * 0.5;
    }
    if (fridge && endGap(us, fridge) - S < 0.5) ps += 50;
    if (corner && endGap(us, corner) - S < 0.6) ps += 60;
    for (const uh of hobsMain) {
      let p = ps;
      const between = Math.abs(uh - us) - S - H;
      if (between < 0.6) p += 80;
      if (endGap(uh, 'a') < (corner === 'a' ? 0.95 : 0.75)) p += 80;
      if (endGap(uh, 'b') < (corner === 'b' ? 0.95 : 0.75)) p += 80;
      // 短台面两头都不够 0.75 时：至少一头留 0.45（灶台半宽 0.35 + 0.1 台面），不然锅柄伸出台面
      if (Math.min(endGap(uh, 'a'), endGap(uh, 'b')) < H + 0.1 - 1e-9) p += 40;
      if (under(uh, 0.45, wins)) p += 70;
      if (leg && len < 2.4) p += 30;
      if (fridge) {
        const f = fridge === 'a' ? 0 : len;
        if (!((f <= us && us <= uh) || (uh <= us && us <= f))) p += 2;
      }
      p -= Math.min(between, 1.2);
      if (!best || p < best.pen) best = { pen: p, sink: us, hob: uh, on: 'main' };
    }
    for (const uh of hobsLeg) {
      let p = ps + 0.5;
      const path = endGap(us, corner) - S + (uh - H);
      if (path < 0.6) p += 80;
      if (leg.len - uh < 0.75) p += 80;
      if (under(uh, 0.45, leg.wins)) p += 70;
      if (uh < 0.75) p += 0.5 * (0.75 - uh) * 4; // 离转角也留点台面（软）
      p += Math.max(0, path - 1.8); // 别离水槽太远（软）
      p -= Math.min(path, 1.2);
      if (!best || p < best.pen) best = { pen: p, sink: us, hob: uh, on: 'leg' };
    }
    if (!hobsMain.length && !hobsLeg.length && (!best || ps < best.pen)) best = { pen: ps, sink: us, hob: null, on: null };
  }
  return best;
}

function kitchen(L, rc, ctx) {
  const { room, sides, walls } = rc;
  const cands = sides
    .filter((s) => s.walled)
    .map((s) => ({ s, st: counterRuns(s, walls)[0] }))
    .filter((c) => c.st && c.st.len >= 1.5)
    .sort((p, q) => q.st.len + (q.st.wins.length ? 0.6 : 0) - (p.st.len + (p.st.wins.length ? 0.6 : 0)));
  let main = null;
  let legSide = null;
  for (const c of cands) {
    const R = freeRuns(L, rc, c.s, c.st, 0.6, 0).sort((p, q) => q.len - p.len)[0];
    if (!R || R.len < 1.5) continue;
    main = c.s;
    legSide = buildKitchen(L, rc, ctx, c.s, c.st, R);
    break;
  }
  ctx.kitchensLeft--;
  if (!main) return;
  const hasFridge = () => L.items.some((i) => i.kind === 'fridge' && i.room === room.id);
  // 最后一间厨房还没有冰箱（前面的湿厨房让出来了、或台面不够长）：靠另一面墙单独放，前面留 0.9m
  if (!hasFridge() && !ctx.placedFridge && ctx.kitchensLeft <= 0)
    for (const s of sides.filter((x) => x.walled && x !== main && x !== legSide)) if (s.stretches.some((st) => st.len >= 0.95 && hug(L, rc, s, st, 'fridge', { d: 0.7, minW: 0.86, maxW: 0.86, front: 0.9, prefer: 'a', extra: () => ({}) }))) break;
  if (hasFridge()) ctx.placedFridge = true;
  // 电器高柜：对面墙优先，再其它墙；前面留 1m
  if (ctx.applianceTall) {
    const oppo = opposite(sides, main);
    const order = [oppo, ...sides.filter((s) => s !== main && s !== oppo && s !== legSide)].filter((s) => s?.walled);
    const h = Math.min(2.4, ctx.wallH - 0.1);
    for (const s of order) if (s.stretches.some((st) => hug(L, rc, s, st, 'tallUnit', { d: 0.6, minW: 0.6, maxW: 0.6, front: 1.0, prefer: 'a', extra: () => ({ h }) }))) break;
  }
  // 岛台：四周走道 1.05m（天天爆炒 1.2m），不压门口 / 通道
  if (room.w >= 3.6 && room.d >= 3.6) {
    const m = ctx.cook === 'heavy' ? 1.2 : 1.05;
    const away = { N: [0, 0.3], S: [0, -0.3], W: [0.3, 0], E: [-0.3, 0] }[main.side];
    const cx = room.x + room.w / 2 + away[0];
    const cz = room.y + room.d / 2 + away[1];
    const pts = [];
    for (let dx = -0.6; dx <= 0.6 + 1e-9; dx += 0.1) for (let dz = -0.6; dz <= 0.6 + 1e-9; dz += 0.1) pts.push({ x: cx + dx, z: cz + dz });
    pts.sort((p, q) => Math.hypot(p.x - cx, p.z - cz) - Math.hypot(q.x - cx, q.z - cz));
    for (const p of pts) if (L.try(room, 'island', { ...p, rot: SIDE_ROT[main.side] }, 1.8, 0.9, {}, { margin: m, strict: true })) break;
  }
}

/** 主台面 + 冰箱 + L 形 + 水槽 / 灶台。返回 L 那一面墙（没有就 null） */
function buildKitchen(L, rc, ctx, main, st, R) {
  const { room, sides, walls, inner } = rc;
  const ax = main.axis === 'x';
  const lo = ax ? inner.x0 : inner.z0;
  const hi = ax ? inner.x1 : inner.z1;
  const near = main.side === 'N' || main.side === 'W'; // 主墙在垂直墙的 a 端
  const face = near ? (ax ? inner.z0 : inner.x0) + 0.6 : (ax ? inner.z1 : inner.x1) - 0.6;
  // L 形：主台面碰到的垂直墙，从主台面前沿开始做
  const legOf = (end) => {
    if (end === 'a' ? R.a > lo + 0.05 : R.b < hi - 0.05) return null;
    const ps = sides.find((x) => x.axis !== main.axis && x.side === (ax ? (end === 'a' ? 'W' : 'E') : end === 'a' ? 'N' : 'S'));
    if (!ps?.walled) return null;
    let best = null;
    for (const cst of counterRuns(ps, walls))
      for (const r of freeRuns(L, rc, ps, cst, 0.6, 0)) {
        const touches = near ? r.a <= face + 0.05 : r.b >= face - 0.05;
        const a = near ? Math.max(r.a, face) : r.a;
        const b = near ? r.b : Math.min(r.b, face);
        if (!touches || b - a < 0.9) continue;
        if (!best || b - a > best.len) best = { s: ps, st: cst, a, b, len: b - a };
      }
    return best;
  };
  const legA = legOf('a');
  const legB = legOf('b');
  let leg = null;
  let corner = null;
  if (legA && (!legB || legA.len >= legB.len)) {
    leg = legA;
    corner = 'a';
  } else if (legB) {
    leg = legB;
    corner = 'b';
  }
  // 冰箱：放在不是转角的那一头（不挡窗，压到窗边 20cm 以内算了）；主台面不够就放 L 的尽头
  const winHit = (a, b, wins) => wins.reduce((t, w) => t + Math.max(0, Math.min(b, w.b) - Math.max(a, w.a)), 0);
  let ra = R.a;
  let rb = R.b;
  let fridge = null;
  let fEnd = corner === 'b' ? 'a' : 'b';
  // 一间屋子一台冰箱；有两间厨房（干 / 湿）时，放了冰箱就摆不下水槽 + 灶台（中间 0.6m，至少要 2.05m 台面）的那一间让给后面的厨房
  const wantFridge = !ctx.placedFridge && !(ctx.kitchensLeft > 1 && !leg && R.len - 0.9 < 2.05);
  if (wantFridge && R.len >= 2.4) {
    const ends = [fEnd, ...(corner ? [] : [fEnd === 'b' ? 'a' : 'b'])].filter((e) => winHit(e === 'b' ? rb - 0.9 : ra, e === 'b' ? rb : ra + 0.9, st.wins) <= 0.2);
    for (const e of ends) {
      fridge = L.try(room, 'fridge', at(room, main, e === 'b' ? rb - 0.45 : ra + 0.45, main.thick + 0.36), 0.86, 0.7, {});
      if (fridge) {
        fEnd = e;
        if (e === 'b') rb -= 0.9;
        else ra += 0.9;
        break;
      }
    }
  }
  let fridgeOnLeg = false;
  if (wantFridge && !fridge && leg && leg.len >= 2.0 && winHit(near ? leg.b - 0.9 : leg.a, near ? leg.b : leg.a + 0.9, leg.st.wins) <= 0.2) {
    const c = near ? leg.b - 0.45 : leg.a + 0.45;
    if (L.try(room, 'fridge', at(room, leg.s, c, leg.s.thick + 0.36), 0.86, 0.7, {})) {
      fridgeOnLeg = true;
      if (near) leg.b -= 0.9;
      else leg.a += 0.9;
      leg.len -= 0.9;
    }
  }
  // 实在没别的地方：还是放在主台面那一头（挡一点窗也比没有冰箱好）
  if (wantFridge && !fridge && !fridgeOnLeg && R.len >= 2.4) {
    fridge = L.try(room, 'fridge', at(room, main, fEnd === 'b' ? rb - 0.45 : ra + 0.45, main.thick + 0.36), 0.86, 0.7, {});
    if (fridge) {
      if (fEnd === 'b') rb -= 0.9;
      else ra += 0.9;
    }
  }
  const len = rb - ra;
  const flip = main.side === 'S' || main.side === 'W'; // 家具本地 +x 朝世界 −x / −z 的两面墙（rotation.y = rot）
  const wins = st.wins.map((w) => ({ a: Math.max(w.a, ra) - ra, b: Math.min(w.b, rb) - ra })).filter((w) => w.b - w.a > 0.05);
  let legInfo = null;
  let legOffs = [];
  if (leg) {
    legOffs = leg.st.wins.map((w) => ({ a: Math.max(w.a, leg.a) - leg.a, b: Math.min(w.b, leg.b) - leg.a })).filter((w) => w.b - w.a > 0.05);
    // L 上的坐标从转角量起
    legInfo = { len: leg.len, wins: near ? legOffs : legOffs.map((w) => ({ a: leg.len - w.b, b: leg.len - w.a })), fridgeEnd: fridgeOnLeg };
  }
  const plan = sinkHob({ len, corner, fridge: fridge ? fEnd : null, wins, leg: legInfo });
  const frac = (u, n, fl) => (u == null ? null : +((fl ? n - u : u) / n).toFixed(4));
  const sinkAt = frac(plan?.sink ?? null, len, flip);
  const hobAt = plan?.on === 'main' ? frac(plan.hob, len, flip) : null;
  const gaps = wins.map((w) => (flip ? { a: +(len - w.b).toFixed(3), b: +(len - w.a).toFixed(3) } : { a: +w.a.toFixed(3), b: +w.b.toFixed(3) }));
  L.try(room, 'kitchenRun', at(room, main, (ra + rb) / 2, main.thick + 0.3), +len.toFixed(3), 0.6, { w: +len.toFixed(3), h: ctx.wallH, sink: sinkAt, hob: hobAt, sinkAt, hobAt, gaps, upper: true }, { force: true, span: [ra, rb] });
  if (!leg) return null;
  const ll = leg.len;
  const flip2 = leg.s.side === 'S' || leg.s.side === 'W';
  const off = plan?.on === 'leg' ? (near ? plan.hob : ll - plan.hob) : null; // 从 leg.a 量起
  const hob2 = off == null ? null : +((flip2 ? ll - off : off) / ll).toFixed(4);
  const gaps2 = legOffs.map((w) => (flip2 ? { a: +(ll - w.b).toFixed(3), b: +(ll - w.a).toFixed(3) } : { a: +w.a.toFixed(3), b: +w.b.toFixed(3) }));
  L.try(room, 'kitchenRun', at(room, leg.s, (leg.a + leg.b) / 2, leg.s.thick + 0.3), +ll.toFixed(3), 0.6, { w: +ll.toFixed(3), h: ctx.wallH, sink: null, hob: hob2, sinkAt: null, hobAt: hob2, gaps: gaps2, upper: true }, { force: true, span: [leg.a, leg.b] });
  return leg.s;
}

function bedCands(rc, ctx, bw, bd, isKids) {
  const { room, sides, inner } = rc;
  const fw = bw + 0.16;
  const out = [];
  for (const s of sides) {
    if (!s.walled) continue;
    if (reach(rc, s) - s.thick < bd + 0.1 + 0.6 - 1e-6) continue; // 床尾要留 60cm
    const ax = s.axis === 'x';
    const roomMid = ax ? room.x + room.w / 2 : room.y + room.d / 2;
    for (const st of s.stretches) {
      const lo = Math.max(st.a, ax ? inner.x0 : inner.z0);
      const hi = Math.min(st.b, ax ? inner.x1 : inner.z1);
      if (hi - lo < fw + 0.04) continue;
      const raw = isKids
        ? [lo + fw / 2 + 0.02, hi - fw / 2 - 0.02]
        : [clamp(roomMid, lo + bw / 2 + 0.55, hi - bw / 2 - 0.55), lo + bw / 2 + 0.55, hi - bw / 2 - 0.55, lo + fw / 2 + 0.02, hi - fw / 2 - 0.02];
      const alongs = [];
      for (const c of raw) if (c - fw / 2 >= lo - 0.02 && c + fw / 2 <= hi + 0.02 && !alongs.some((x) => Math.abs(x.c - c) < 0.05)) alongs.push({ c, pen: backsWet(ctx.plan, room, s, c - fw / 2, c + fw / 2) ? WET_BEHIND : 0 });
      if (!alongs.length) continue;
      // 床头背后是浴室 / 厨房 / 晒衣处的位置往后排（按床实际占的那一段算）
      alongs.sort((p, q) => p.pen - q.pen);
      const sc = score(s, { noWindow: 4, noDoor: 1.5 }) - alongs[0].pen - (hi - lo >= fw + (isKids ? 0.2 : 0.9) ? 0 : 0.5);
      out.push({ s, st, sc, alongs: alongs.filter((a) => a.pen === alongs[0].pen).map((a) => a.c), wet: alongs.filter((a) => a.pen !== alongs[0].pen).map((a) => a.c) });
    }
  }
  // 同一段墙上背靠湿区的床位，单独当一个（重罚过的）候选
  for (const c of [...out]) if (c.wet.length) out.push({ ...c, sc: c.sc - WET_BEHIND, alongs: c.wet, wet: [] });
  return out.sort((p, q) => q.sc - p.sc);
}

function placeBed(L, rc, s, bw, bd, along, isKids) {
  const { room } = rc;
  const bed = L.try(room, isKids ? 'kidsBed' : 'bed', at(room, s, along, s.thick + (bd + 0.1) / 2), bw + 0.16, bd + 0.1, { w: bw, d: bd }, { front: 0.6 });
  if (!bed) return null;
  if (!isKids) for (const sg of [-1, 1]) L.try(room, 'nightstand', at(room, s, along + sg * (bw / 2 + 0.1 + 0.25), s.thick + 0.22), 0.5, 0.42);
  L.flat(room, 'rug', at(room, s, along, s.thick + bd * 0.62), bw + 1.0, 1.5, {});
  return bed;
}

function bedroom(L, rc, ctx, kind) {
  const { room, sides } = rc;
  const isMaster = kind === 'master';
  const isKids = kind === 'kids';
  const shortDim = Math.min(room.w, room.d);
  const bw0 = isKids ? 1.0 : isMaster ? (shortDim >= 3.8 ? 1.8 : 1.6) : shortDim >= 3.2 ? 1.5 : 1.2;
  const bd = isKids ? 2.0 : 2.05;
  const target = wardrobeTarget(kind, ctx);
  const minW = minWardrobe(target);
  const sizes = [bw0, 1.2, 0.9].filter((w, i, a) => w <= bw0 && a.indexOf(w) === i);
  const h = Math.min(2.6, ctx.wallH - 0.08);
  const wardrobe = (bedSide) =>
    bestHug(L, rc, [...sides.filter((s) => s.walled && s !== bedSide), bedSide], 'wardrobe', { d: 0.6, minW, maxW: target, front: 0.6, prefer: 'a', extra: (w) => ({ w, h, handle: ctx.handle }) });
  // 床：先试正常尺寸的每面墙（床尾不够就换垂直的墙）、居中 → 偏一边；放不下衣柜就再试下一个；次卧可以退到 1.2 / 0.9 的床
  let first = null;
  for (const bw of sizes) {
    for (const c of bedCands(rc, ctx, bw, bd, isKids)) {
      // 这面墙上每个床位都试一次，留衣柜最长的（一样长就留床头柜多的、再按顺序：居中优先）
      let best = null;
      for (const along of c.alongs) {
        const m = L.mark();
        if (placeBed(L, rc, c.s, bw, bd, along, isKids)) {
          const stands = L.items.slice(m).filter((i) => i.kind === 'nightstand').length;
          const ward = wardrobe(c.s);
          const sc = (ward ? Math.round(ward.w * 20) : 0) * 10 + stands;
          if (!first) first = { s: c.s, bw, along };
          if (ward && (!best || sc > best.sc)) best = { along, sc };
        }
        L.reset(m);
      }
      if (best) {
        placeBed(L, rc, c.s, bw, bd, best.along, isKids);
        wardrobe(c.s);
        return bedroomExtras(L, rc, ctx, kind, c.s);
      }
    }
    if (first && isMaster) break; // 主卧不为了塞衣柜缩床
  }
  if (!first) return;
  placeBed(L, rc, first.s, first.bw, bd, first.along, isKids);
  bedroomExtras(L, rc, ctx, kind, first.s);
}

function bedroomExtras(L, rc, ctx, kind, bedSide) {
  const isMaster = kind === 'master';
  const isKids = kind === 'kids';
  const rest = rc.sides
    .filter((s) => s.walled)
    .flatMap((s) => s.stretches.map((x) => ({ s, x })))
    .sort((p, q) => (p.s === bedSide) - (q.s === bedSide) || q.x.len - p.x.len);
  const list = isKids ? ['toyStorage', 'desk'] : isMaster ? (ctx.wfh && !ctx.hasStudy && !ctx.hasFamily ? ['desk', 'plant'] : ['dresser', 'plant']) : ['desk'];
  for (const k of list) {
    const [w, d] = { desk: [isKids ? (ctx.teen ? 1.2 : 1.0) : 1.2, 0.6], dresser: [1.1, 0.45], toyStorage: [1.2, 0.38], plant: [0.45, 0.45] }[k];
    const extra = () => (k === 'desk' ? { w, d } : k === 'plant' ? { variant: 'tall', seed: 11 } : {});
    for (const { s, x } of rest) if (x.len >= w + 0.05 && hug(L, rc, s, x, k, { d, minW: w, maxW: w, front: k === 'plant' ? 0 : 0.6, extra })) break;
  }
}

function study(L, rc, ctx) {
  const { room, sides } = rc;
  const winSide = sides.filter((s) => s.windows > 0.5).sort((a, b) => b.windows - a.windows)[0];
  const deskSide = winSide || sides.filter((s) => s.walled).sort((a, b) => score(b) - score(a))[0];
  if (!deskSide) return;
  const along = deskSide.axis === 'x' ? room.x + room.w / 2 : room.y + room.d / 2;
  L.try(room, 'desk', at(room, deskSide, along, deskSide.thick + 0.36), 1.4, 0.65, { w: 1.4, d: 0.65 }, { force: true, front: 0.6 });
  const shelfSides = sides.filter((s) => s !== deskSide && s.walled).flatMap((s) => s.stretches.map((x) => ({ s, x }))).sort((p, q) => q.x.len - p.x.len);
  const want = Math.max(1.2, Math.min(3.2, (ctx.books * 0.8) / 5));
  const kind = ctx.avoid.has('openshelf') ? 'tallUnit' : 'bookshelf';
  const h = Math.min(2.4, ctx.wallH - 0.2);
  for (const { s, x } of shelfSides) if (hug(L, rc, s, x, kind, { d: 0.34, minW: 0.8, maxW: want, front: 0.6, extra: (w) => ({ w, h, key: 'woodwork', seed: 4 }) })) break;
  const sp = shelfSides[shelfSides.length - 1];
  if (sp) L.try(room, 'plant', at(room, sp.s, mid(sp.x), sp.s.thick + 0.3), 0.45, 0.45, { variant: 'tall', seed: 21 });
}

/** 浴室：淋浴先放离门最远的角 → 马桶（前面 60cm、中心离两边 ≥ 40cm）→ 浴室柜（离门近的位置）。放不全就退：不要淋浴 / 不要浴室柜 */
function bath(L, rc) {
  const { room, sides, inner, keep } = rc;
  const doorPts = keep.filter((k) => k.kind !== 'pass').map((k) => ({ x: (k.box.x0 + k.box.x1) / 2, z: (k.box.z0 + k.box.z1) / 2 }));
  const pts = doorPts.length ? doorPts : [{ x: (inner.x0 + inner.x1) / 2, z: (inner.z0 + inner.z1) / 2 }];
  const dDoor = (p) => Math.min(...pts.map((d) => Math.hypot(d.x - p.x, d.z - p.z)));
  const walled = new Set(sides.filter((s) => s.walled).map((s) => s.side));
  // 淋浴的玻璃在本地 +z / +x 两面，所以每个角配一个朝向：背靠的两面墙正好是那个角
  const corners = [
    { x: inner.x0 + 0.45, z: inner.z0 + 0.45, rot: 0, need: ['N', 'W'] },
    { x: inner.x1 - 0.45, z: inner.z0 + 0.45, rot: 270, need: ['N', 'E'] },
    { x: inner.x1 - 0.45, z: inner.z1 - 0.45, rot: 180, need: ['S', 'E'] },
    { x: inner.x0 + 0.45, z: inner.z1 - 0.45, rot: 90, need: ['S', 'W'] },
  ]
    .filter((c) => c.need.every((k) => walled.has(k)))
    .sort((p, q) => dDoor(q) - dDoor(p));
  const slots = (w, d) => {
    const out = [];
    for (const s of sides) {
      if (!s.walled) continue;
      const ax = s.axis === 'x';
      for (const st of s.stretches) {
        const lo = Math.max(st.a, ax ? inner.x0 : inner.z0);
        const hi = Math.min(st.b, ax ? inner.x1 : inner.z1);
        for (let c = lo + w / 2; c <= hi - w / 2 + 1e-6; c += 0.05) out.push(at(room, s, c, s.thick + d / 2));
      }
    }
    return out;
  };
  // 马桶按 0.8 宽检查 = 中心离两边的墙 / 柜子各 ≥ 0.4m；模型本身 0.45 宽
  const toilets = slots(0.8, 0.7).sort((p, q) => dDoor(q) - dDoor(p));
  const vanW = [0.9, 0.75, 0.6];
  const vans = vanW.map((w) => slots(w, 0.5).sort((p, q) => dDoor(p) - dDoor(q)));
  const attempt = (corner, withVanity) => {
    const m = L.mark();
    if (corner && !L.try(room, 'shower', corner, 0.9, 0.9, { w: 0.9, d: 0.9 }, { front: 0.5 })) return false;
    let tried = 0;
    for (const tp of toilets) {
      const m2 = L.mark();
      if (!L.try(room, 'toilet', tp, 0.8, 0.7, { w: 0.45, d: 0.7 }, { front: 0.6 })) continue;
      if (!withVanity) return true;
      for (let i = 0; i < vanW.length; i++) for (const vp of vans[i]) if (L.try(room, 'vanity', vp, vanW[i], 0.5, { w: vanW[i] }, { front: 0.5 })) return true;
      L.reset(m2);
      if (++tried >= 30) break;
    }
    L.reset(m);
    return false;
  };
  for (const c of corners) if (attempt(c, true)) return;
  if (attempt(null, true)) return;
  for (const c of corners) if (attempt(c, false)) return;
  attempt(null, false);
}

function foyer(L, rc, ctx) {
  if (!ctx.ground) return; // 鞋柜 + 换鞋凳只在一楼（楼上的「玄关」是楼梯口的过道）
  const ws = rc.sides.filter((s) => s.walled && s.stretches[0]?.len >= 0.9);
  const h = Math.min(2.6, ctx.wallH - 0.1);
  const cab = bestHug(L, rc, ws, 'shoeCabinet', { d: 0.38, minW: 0.6, maxW: Math.max(1.2, ctx.shoeMM / 1000), front: 0.5, prefer: 'a', extra: (w) => ({ w, h }) });
  if (cab) ctx.placedShoe = true;
  bestHug(L, rc, ws, 'bench', { d: 0.38, minW: 1.0, maxW: 1.0, front: 0.4, prefer: 'b', extra: () => ({ w: 1.0 }) });
}

/** 车廊 / 前院：鞋柜 + 换鞋凳，放在离大门最近、有墙的那一边；不放躺椅（要停车） */
function porch(L, rc, ctx) {
  if (!ctx.ground) return;
  const { room, sides } = rc;
  const me = ctx.main;
  const px = me ? me.x : room.x + room.w / 2;
  const pz = me ? me.z : room.y;
  const dSide = (s) => (s.axis === 'x' ? Math.hypot(px - clamp(px, s.a, s.b), pz - s.c) : Math.hypot(px - s.c, pz - clamp(pz, s.a, s.b)));
  // 3D 里车廊朝外的边是 0.9m 的矮墙：先靠「后面是屋子」的墙；只能靠矮墙时，高柜改成 1m 高
  const houseSide = (s) => behind(ctx.plan, room, s).some((r) => !ROOM_TYPES[r.type]?.outdoor && r.type !== 'balcony');
  const ws = sides.filter((s) => s.walled).sort((p, q) => houseSide(q) - houseSide(p) || dSide(p) - dSide(q));
  const h = Math.min(2.6, ctx.wallH - 0.1);
  const put = (kind, o) => {
    for (const s of ws) {
      const t = s.axis === 'x' ? px : pz;
      const low = !houseSide(s);
      const extra = (w) => {
        const e = o.extra(w);
        return low && e.h > 1 ? { ...e, h: 1.0 } : e;
      };
      for (const st of [...s.stretches].sort(byNear(t))) {
        const it = hug(L, rc, s, st, kind, { ...o, extra, prefer: t, rank: 'near' });
        if (it) return it;
      }
    }
    return null;
  };
  if (put('shoeCabinet', { d: 0.38, minW: 0.6, maxW: Math.max(1.2, ctx.shoeMM / 1000), front: 0.5, extra: (w) => ({ w, h }) })) ctx.placedShoe = true;
  put('bench', { d: 0.38, minW: 1.0, maxW: 1.0, front: 0.4, extra: () => ({ w: 1.0 }) });
}

function balcony(L, rc) {
  const { room, inner } = rc;
  const cx = room.x + room.w / 2;
  const cz = room.y + room.d / 2;
  // 躺椅先试居中两张；挡到门前通道就从一头开始找位置
  const lounge = (pos, rot) => L.try(room, 'lounger', { ...pos, rot }, 0.7, 0.75);
  if (room.w >= room.d) {
    let n = 0;
    for (const x of [cx - 0.55, cx + 0.55]) if (lounge({ x, z: cz }, 0)) n++;
    for (let x = inner.x0 + 0.4; n < 2 && x <= inner.x1 - 0.4 + 1e-6; x += 0.1) if (lounge({ x, z: cz }, 0)) n++;
    L.try(room, 'plant', { x: room.x + 0.35, z: cz, rot: 0 }, 0.45, 0.45, { variant: 'tall', seed: 2 });
    L.try(room, 'plant', { x: room.x + room.w - 0.35, z: cz, rot: 0 }, 0.45, 0.45, { variant: 'small', seed: 5 });
  } else {
    if (!lounge({ x: cx, z: cz }, 90)) for (let z = inner.z0 + 0.4; z <= inner.z1 - 0.4 + 1e-6; z += 0.1) if (lounge({ x: cx, z }, 90)) break;
    L.try(room, 'plant', { x: cx, z: room.y + 0.35, rot: 0 }, 0.45, 0.45, { variant: 'tall', seed: 2 });
  }
}

function walkin(L, rc, ctx) {
  const c = rc.sides
    .filter((s) => s.walled)
    .flatMap((s) => s.stretches.map((x) => ({ s, x })))
    .sort((p, q) => q.x.len - p.x.len);
  const h = Math.min(2.6, ctx.wallH - 0.08);
  for (const { s, x } of c.slice(0, 2)) if (x.len >= 0.9) hug(L, rc, s, x, 'wardrobe', { d: 0.6, minW: 0.9, maxW: x.len - 0.04, extra: (w) => ({ w, h, handle: ctx.handle }) });
}

function utility(L, rc, ctx) {
  const s = rc.sides.filter((x) => x.walled && x.stretches[0]?.len >= 1.3)[0];
  if (!s) return;
  const st = s.stretches[0];
  hug(L, rc, s, st, 'washer', { d: 0.6, minW: 0.6, maxW: 0.6, front: 0.6, prefer: 'a', extra: () => ({}) });
  hug(L, rc, s, st, 'tallUnit', { d: 0.6, minW: 0.6, maxW: 0.6, front: 0.6, prefer: 'a', extra: () => ({ h: Math.min(2.4, ctx.wallH - 0.1) }) });
}

function store(L, rc, ctx) {
  const ws = rc.sides.filter((x) => x.walled && x.stretches[0]?.len >= 0.9);
  const h = Math.min(2.4, ctx.wallH - 0.2);
  bestHug(L, rc, ws, 'bookshelf', { d: 0.4, minW: 0.8, maxW: 2.4, front: 0.6, extra: (w) => ({ w, h, key: 'cabinetry', seed: 9 }) });
}

/** 窗帘：每扇窗 / 落地趟门（卫浴、厨房、阳台除外） */
function curtains(L, room, sides, walls, ctx) {
  const t = ROOM_TYPES[room.type];
  if (t?.wet || t?.nofurn || room.type === 'kitchen' || t?.outdoor || room.type === 'corridor' || room.type === 'foyer') return;
  for (const s of sides) {
    for (const w of walls) {
      if (w.axis !== s.axis || Math.abs(w.c - s.c) > 0.03 || !w.exterior) continue;
      for (const p of w.pieces) {
        if (p.kind !== 'window' && p.kind !== 'slider') continue;
        const a = Math.max(p.a, s.a);
        const b = Math.min(p.b, s.b);
        if (b - a < 0.5) continue;
        L.flat(room, 'curtains', at(room, s, (a + b) / 2, s.thick + 0.1), b - a, 0.1, { w: b - a, h: ctx.wallH });
      }
    }
  }
}

/** plan（v1 / v2 / 一层）+ walls（一层的数组 / { floorId: walls } / 不给）→ { plan: v2, walls: { floorId: walls } } */
function prep(plan0, walls0) {
  const plan = migratePlan(plan0);
  const walls = {};
  plan.floors.forEach((f, i) => {
    if (Array.isArray(walls0) && i === 0) walls[f.id] = walls0;
    else if (walls0 && !Array.isArray(walls0) && Array.isArray(walls0[f.id])) walls[f.id] = walls0[f.id];
    else walls[f.id] = buildWalls(f);
  });
  return { plan, walls };
}

function context(plan, walls, profile) {
  const who = new Set(profile?.life?.who || []);
  const sp = profile ? storagePlan(profile.storage || {}, APPLIANCES) : null;
  const g = plan.floors[0];
  const types = new Set(plan.floors.flatMap((f) => f.rooms.map((r) => r.type)));
  const gTypes = new Set(g.rooms.map((r) => r.type));
  return {
    plan: g,
    v2: plan,
    sp,
    wallH: g.ceil || 2.8,
    ground: true,
    curve: profile?.hidden?.curve ?? 45,
    social: profile?.hidden?.social ?? 50,
    refined: (profile?.axes?.texture ?? 60) < 50,
    natural: (profile?.axes?.texture ?? 60) >= 60,
    displayPct: sp?.displayPct ?? 20,
    books: profile?.storage?.books ?? 4,
    wardrobeMM: sp?.wardrobeMM || 2400,
    shoeMM: sp?.shoeCabinetMM || 1500,
    applianceTall: !!sp?.applianceTallCabinet,
    people: 2 + (who.has('kids') ? 2 : 0) + (who.has('elder') ? 1 : 0) + (who.has('teen') ? 1 : 0),
    kids: who.has('kids') || who.has('baby'),
    teen: who.has('teen'),
    pets: who.has('dog') || who.has('cat'),
    altar: who.has('altar'),
    wfh: who.has('wfh'),
    festive: (profile?.storage?.bulky || []).includes('festive'),
    cook: profile?.life?.cook || '',
    avoid: new Set(profile?.avoid || []),
    handle: profile && (profile.axes?.texture ?? 60) < 50 && (profile.axes?.temp ?? 50) >= 50 ? 'bar' : 'none',
    hasStudy: types.has('study'),
    hasKidsRoom: types.has('kids'),
    hasWalkin: types.has('walkin'),
    hasFamily: types.has('family'),
    shoeInLiving: !gTypes.has('foyer') && !gTypes.has('porch'),
    kitchensLeft: plan.floors.reduce((t, f) => t + f.rooms.filter((r) => r.type === 'kitchen').length, 0),
    placedFridge: false,
    main: mainEntrance(g, walls[g.id]),
  };
}

/** 主入口：plan（v1 / v2）+ walls + 档案 → 家具清单（每件都有 floor） */
export function furnish(plan0, walls0, profile = null) {
  const { plan, walls } = prep(plan0, walls0);
  const L = new Layout();
  const ctx = context(plan, walls, profile);
  const keeps = stairKeeps(plan);
  // 先摆大房间（客厅、主卧），神台 / 宠物窝这种只摆一次的优先给它们；同一种房间一楼先摆
  const order = ['living', 'master', 'dining', 'family', 'kitchen', 'bedroom', 'kids', 'study', 'foyer', 'porch', 'bath', 'walkin', 'utility', 'store', 'balcony', 'corridor'];
  const rank = (t) => (order.includes(t) ? order.indexOf(t) : order.length);
  const rooms = plan.floors.flatMap((f) => f.rooms.map((room) => ({ room, f }))).sort((a, b) => rank(a.room.type) - rank(b.room.type));
  for (const { room, f } of rooms) {
    if (ROOM_TYPES[room.type]?.nofurn) continue; // 楼梯间、挑空
    ctx.plan = f;
    ctx.wallH = f.ceil || 2.8;
    ctx.ground = f.level === 0;
    L.floor = f.id;
    const rc = frame(room, walls[f.id], f, ctx.ground ? ctx.main : null, keeps[f.id]);
    L.room(room, rc);
    const t = room.type;
    if (t === 'living') living(L, rc, ctx);
    else if (t === 'family') family(L, rc, ctx);
    else if (t === 'dining') dining(L, rc, ctx);
    else if (t === 'kitchen') kitchen(L, rc, ctx);
    else if (t === 'master' || t === 'bedroom' || t === 'kids') bedroom(L, rc, ctx, t);
    else if (t === 'study') study(L, rc, ctx);
    else if (t === 'bath') bath(L, rc);
    else if (t === 'foyer') foyer(L, rc, ctx);
    else if (t === 'porch') porch(L, rc, ctx);
    else if (t === 'balcony') balcony(L, rc);
    else if (t === 'walkin') walkin(L, rc, ctx);
    else if (t === 'utility') utility(L, rc, ctx);
    else if (t === 'store') store(L, rc, ctx);
    curtains(L, room, rc.sides, walls[f.id], ctx);
  }
  return L.items;
}

// ───────────────────────── 收纳对账 ─────────────────────────

const HINTS = {
  master: '墙面不够：考虑走入式衣帽间，或把一间次卧改成衣帽间',
  room: '墙面不够：床换小一号，或做床头 / 床尾柜补收纳',
  shoe: '鞋柜放不下全部：做顶天立地，或在门边 / 车廊再补一组',
  tall: '没有合适的墙放电器高柜：和冰箱并排做一整面高柜',
  store: '没有储物间：做一组 600 深的通高柜放行李箱、棉被',
  books: '书墙不够：书房、走廊或电视墙两侧再做一段',
  counter: '台面不够放台面家电：电器做进高柜，或加一个家电收纳柜',
  dining: '椅子后面不够 900mm 通行：先摆小一号的桌，节日用可伸缩圆桌加折叠椅',
  altar: '没有合适的墙放神台（背后不能是浴室 / 厨房，也不在大门那面墙）：见面再定位置',
};

/**
 * 收纳对账：客人数出来的收纳，3D 里实际放进去了多少。
 * 返回 [{ key, kind, room, unit, need, target, placed, gap, hint, itemIds }]
 *   unit 'mm' | 'seats' | 'count'；need = 客人数出来的（没数的项是 null）；target = 自动摆家具的目标；
 *   gap = max(0, target − placed)；hint = 差了的话给设计师的建议（中文，界面用 t() 翻）；itemIds = 算进去的家具。
 * items 可以是设计师改过的清单（拖动、删除后再对账）。
 */
export function furnishReport(plan0, walls0, profile = null, items = null) {
  const { plan, walls } = prep(plan0, walls0);
  const its = items || furnish(plan, walls, profile);
  const ctx = context(plan, walls, profile);
  const sp = ctx.sp;
  const rows = [];
  const mm = (m) => Math.round(m * 1000);
  const allRooms = plan.floors.flatMap((f) => f.rooms.map((r) => ({ r, f: f.id })));
  const floorOf = (roomId) => allRooms.find((x) => x.r.id === roomId)?.f ?? null;
  const add = (r) => {
    const gap = Math.max(0, r.target - r.placed);
    const room = r.room ?? null;
    rows.push({ key: r.key, kind: r.kind, room, floor: room ? floorOf(room) : null, unit: r.unit, need: r.need ?? null, target: r.target, placed: r.placed, gap, hint: gap > 0 ? r.hint : null, itemIds: r.items.map((i) => i.id) });
  };
  const ofType = (...types) => allRooms.filter((x) => types.includes(x.r.type)).map((x) => x.r);
  const pick = (rooms, pred) => {
    const ids = new Set(rooms.map((r) => r.id));
    return its.filter((i) => ids.has(i.room) && pred(i));
  };
  const sumW = (list) => mm(list.reduce((t, i) => t + (i.w || 0), 0));
  // 主卧衣柜（含衣帽间） vs 客人数的衣柜
  const masters = ofType('master');
  const walkins = ofType('walkin');
  if (masters.length || walkins.length) {
    const list = pick([...masters, ...walkins], (i) => i.kind === 'wardrobe');
    add({ key: 'wardrobe:master', kind: 'wardrobe', room: (masters[0] || walkins[0]).id, unit: 'mm', need: sp?.wardrobeMM || null, target: mm(Math.max(1.8, ctx.wardrobeMM / 1000)), placed: sumW(list), hint: HINTS.master, items: list });
  }
  // 每间卧室 / 儿童房（没数，按 1.8m / 1.2m；有青少年 1.8m）
  for (const r of ofType('bedroom', 'kids')) {
    const list = pick([r], (i) => i.kind === 'wardrobe');
    add({ key: `wardrobe:${r.id}`, kind: 'wardrobe', room: r.id, unit: 'mm', need: null, target: mm(wardrobeTarget(r.type, ctx)), placed: sumW(list), hint: HINTS.room, items: list });
  }
  // 鞋柜
  {
    // 鞋柜只算一楼的（楼上的柜子不是放鞋的）
    const g = new Set(plan.floors[0].rooms.map((r) => r.id));
    const list = its.filter((i) => i.kind === 'shoeCabinet' && g.has(i.room));
    add({ key: 'shoe', kind: 'shoeCabinet', room: list[0]?.room, unit: 'mm', need: sp ? sp.shoeCabinetMM : null, target: ctx.shoeMM, placed: sumW(list), hint: HINTS.shoe, items: list });
  }
  // 电器高柜（厨房里）
  {
    const list = pick(ofType('kitchen'), (i) => i.kind === 'tallUnit');
    const need = sp?.applianceTallCabinet ? 1 : 0;
    if (need || list.length) add({ key: 'tall', kind: 'tallUnit', room: list[0]?.room, unit: 'count', need: sp ? need : null, target: need, placed: list.length, hint: HINTS.tall, items: list });
  }
  // 储物间
  {
    const rooms = ofType('store');
    const need = sp?.needsStoreroom ? 1 : 0;
    if (need || rooms.length) add({ key: 'store', kind: 'store', room: rooms[0]?.id, unit: 'count', need: sp ? need : null, target: need, placed: rooms.length, hint: HINTS.store, items: pick(rooms, () => true) });
  }
  // 书墙（储物间的层架不算）
  {
    const list = its.filter((i) => i.kind === 'bookshelf' && i.key !== 'cabinetry');
    const need = sp?.bookshelfMM || 0;
    if (need || list.length) add({ key: 'books', kind: 'bookshelf', room: list[0]?.room, unit: 'mm', need: sp ? need : null, target: need, placed: sumW(list), hint: HINTS.books, items: list });
  }
  // 台面：橱柜总长 − 水槽 0.8 − 灶台 0.9 − 备餐 0.6 = 能放台面家电的长度
  {
    const list = its.filter((i) => i.kind === 'kitchenRun');
    const need = sp?.counterMM || 0;
    const free = list.length ? Math.max(0, sumW(list) - 800 - 900 - 600) : 0;
    if (need || list.length) add({ key: 'counter', kind: 'kitchenRun', room: list[0]?.room, unit: 'mm', need: sp ? need : null, target: need, placed: free, hint: HINTS.counter, items: list });
  }
  // 餐位：想要的（6 人 / 年货节庆 8 人）vs 摆进去的
  {
    const list = its.filter((i) => i.kind === 'diningTable');
    if (list.length || ofType('dining').length) {
      const want = diningWant(ctx);
      add({ key: 'dining', kind: 'diningTable', room: list[0]?.room ?? ofType('dining')[0]?.id, unit: 'seats', need: profile ? want : null, target: want, placed: list.reduce((t, i) => t + (i.seats || 0), 0), hint: HINTS.dining, items: list });
    }
  }
  // 神台（不是收纳，但放不下要让设计师知道）
  if (ctx.altar) {
    const list = its.filter((i) => i.kind === 'altar');
    add({ key: 'altar', kind: 'altar', room: list[0]?.room, unit: 'count', need: 1, target: 1, placed: list.length, hint: HINTS.altar, items: list });
  }
  return rows;
}
