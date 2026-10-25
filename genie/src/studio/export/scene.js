// 方案 → 导出用的「场景」（纯函数，Node 可测；SPEC §2.3）。DXF、DAE、OBJ、README、清单都只读这一份。
// 只读 project.plan / furniture / materials / name / id / createdAt / updatedAt；不改方案；不读客人档案（profile）。
//
// 坐标：平面图是米、x 向右、y 向下；导出的坐标系是 X 向右、Y 向上（= −平面 y）、Z 向上，
// 原点 = 整栋楼（所有楼层合起来）左下角的外墙外皮。DXF 用毫米（tx / ty），3D 用米（X / Y）。

import { migratePlan, bounds, buildWalls, roomSides, ROOM_TYPES, EXT_T, elevations, floorName, stairFlights, stairPath, voidEdges, floorPlate, porchRoofs } from '../plan/model.js';
import { CATALOG } from '../engine/furniture.js';
import { SLOTS, MATERIALS, MAT_BY_ID, fits } from '../../shared/materials.js';
import { bi, projectName, floorCode, packName } from './names.js';
import { catOf, nominal, blockKey, MAIN_SLOT, SOURCED, slotName, slotShort } from './catalog.js';
import { massing } from './massing.js';
import { FIXED, FALLBACK_HEX } from './palette.js';

const HAN = /[一-鿿]/;
const mm = (v) => Math.round(v * 1000);

/** 只在室外一侧有房间的边（阳台栏杆、车廊矮墙 / 门柱）：3D 里不是墙（和 house.js 一样的判断） */
export const isOutdoorEdge = (w) => !!((w.neg && ROOM_TYPES[w.neg.type]?.outdoor && !w.pos) || (w.pos && ROOM_TYPES[w.pos.type]?.outdoor && !w.neg));

const OPP = { N: 'S', S: 'N', W: 'E', E: 'W' };
const sideOf = (room, w) => (w.axis === 'x' ? (Math.abs(w.c - room.y) < 0.05 ? 'N' : 'S') : Math.abs(w.c - room.x) < 0.05 ? 'W' : 'E');

/** 车廊哪几条边挨着室内（house.js houseSides 的同一个判断） */
function houseSides(room, walls) {
  const s = new Set();
  for (const w of walls) {
    const other = w.neg?.id === room.id ? w.pos : w.pos?.id === room.id ? w.neg : null;
    if (other && !ROOM_TYPES[other.type]?.outdoor) s.add(sideOf(room, w));
  }
  return s;
}

/** 车廊临街的一边（floors.js 私有的 streetSide 的同一个判断）：挨着屋子那一边的对面；说不清 → null */
export function streetSide(porch, walls) {
  const house = houseSides(porch, walls);
  return house.size === 1 ? OPP[[...house][0]] : null;
}

/** 房间的名字（两种语言）：设计师取的名字优先；词典里没有就用房间类型的英文（「奶奶房」→ Bedroom） */
export function roomName(r) {
  const t = ROOM_TYPES[r?.type];
  const zh = (r?.name && String(r.name).trim()) || t?.zh || '';
  const b = bi(zh);
  if (b.en === b.zh && HAN.test(zh) && t) {
    const tail = /\s*(\d+)$/.exec(zh);
    b.en = tail ? `${t.en} ${tail[1]}` : t.en;
  }
  return b;
}

/** 净尺寸（墙内皮到内皮，米）和面积（m²） */
export function netSize(room, walls) {
  const sides = roomSides(room, walls);
  const inset = Object.fromEntries(sides.map((s) => [s.side, s.walled ? s.thick : 0]));
  const w = room.w - inset.W - inset.E;
  const d = room.d - inset.N - inset.S;
  return { w, d, area: w * d, inner: { x0: room.x + inset.W, x1: room.x + room.w - inset.E, y0: room.y + inset.N, y1: room.y + room.d - inset.S } };
}

/** 每个表面用的材质：方案里有就用（找不到这个 id → 第一个放得进的） */
export function sceneMaterials(materials = {}) {
  const out = {};
  for (const s of SLOTS) {
    const id0 = materials?.[s.id];
    const mat = MAT_BY_ID[id0] || MATERIALS.find((m) => fits(m.id, s.id)) || MATERIALS[0];
    out[s.id] = { id: mat.id, mat, slot: s, hex: mat.color };
  }
  return out;
}

/** 材质符号（slot id 或 fixed__name）→ { zh, en, id, hex, opacity } */
export function matInfo(sym, materials) {
  if (sym.startsWith('fixed__')) {
    const k = sym.slice(7);
    const f = FIXED[k];
    const b = bi(f?.zh || k);
    return { sym, id: sym, slotZh: b.zh, slotEn: b.en, zh: b.zh, en: b.en, hex: f?.hex || FALLBACK_HEX, opacity: f?.opacity ?? 1, fixed: true };
  }
  const m = materials[sym];
  const sb = slotName(sym);
  return { sym, id: m?.id || sym, slotZh: sb.zh, slotEn: sb.en, zh: m?.mat?.zh || '', en: m?.mat?.en || '', hex: m?.hex || FALLBACK_HEX, opacity: 1, fixed: false, sourced: !!SOURCED[sym] };
}

/** 地毯不能压到墙：轴对齐（0 / 90 / 180 / 270°）的地毯裁到房间的内皮矩形里（圆地毯缩小直径） */
function clipRug(it, inner) {
  if (!inner) return it;
  const rot = (((it.rot || 0) % 360) + 360) % 360;
  const q = Math.round(rot / 90);
  if (Math.abs(rot - q * 90) > 0.5) return it;
  const turned = q % 2 === 1;
  const w = +it.w || 2.4;
  const d = +it.d || 1.7;
  if (it.variant === 'round') {
    const r = Math.min(w / 2, it.x - inner.x0, inner.x1 - it.x, it.z - inner.y0, inner.y1 - it.z);
    return r > 0.2 && r < w / 2 - 0.001 ? { ...it, w: 2 * r, d: 2 * r, clipped: true } : it;
  }
  const hx = (turned ? d : w) / 2;
  const hz = (turned ? w : d) / 2;
  const x0 = Math.max(it.x - hx, inner.x0);
  const x1 = Math.min(it.x + hx, inner.x1);
  const z0 = Math.max(it.z - hz, inner.y0);
  const z1 = Math.min(it.z + hz, inner.y1);
  if (x1 - x0 < 0.3 || z1 - z0 < 0.3) return it;
  if (x0 <= it.x - hx + 1e-6 && x1 >= it.x + hx - 1e-6 && z0 <= it.z - hz + 1e-6 && z1 >= it.z + hz - 1e-6) return it;
  const nw = turned ? z1 - z0 : x1 - x0;
  const nd = turned ? x1 - x0 : z1 - z0;
  return { ...it, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: Math.round(nw * 1000) / 1000, d: Math.round(nd * 1000) / 1000, clipped: true };
}

/**
 * 门窗洞：buildWalls 在另一道墙接进来的地方（T 字口）把墙断成两段，跨过接口的一扇门 / 窗就变成两块
 * （读进来的户型常有：1m 的门 → 330 + 670、0.86m 的窗 → 120 + 740）。同一条墙线上、首尾相接、
 * 同一个 openingId（或同一种）的几块合成一扇；还剩下比墙厚还短的碎块，并进同一条线上隔着不到一个墙厚的邻居。
 * 合起来的那扇用最长那块的墙（墙厚、开向、房间）。DXF 的图块和 3D 的门扇都用这一份。
 */
export function mergeOpenings(pieces) {
  const EPS = 0.005;
  const lines = new Map();
  for (const o of pieces) {
    const k = `${o.wall.axis}:${Math.round(o.wall.c * 100)}`;
    if (!lines.has(k)) lines.set(k, []);
    lines.get(k).push(o);
  }
  // 两块合成一扇：范围取并集；墙、墙厚、开向、房间、种类、id 用长的那块
  const join = (x, y) => {
    const main = y.b - y.a > x.b - x.a ? y : x;
    const a = Math.min(x.a, y.a);
    return { ...main, a, b: Math.max(x.b, y.b), hinge: a, oid: main.oid || x.oid || y.oid };
  };
  const out = [];
  for (const list of lines.values()) {
    list.sort((p, q) => p.a - q.a);
    // 1) 首尾相接、同一个 openingId 或同一种 → 一扇
    const run = [];
    for (const o of list) {
      const last = run[run.length - 1];
      if (last && Math.abs(o.a - last.b) < EPS && (last.kind === o.kind || (last.oid && last.oid === o.oid))) run[run.length - 1] = join(last, o);
      else run.push(o);
    }
    // 2) 还比墙厚短的碎块 → 并进隔着不到一个墙厚的邻居（近的那个）
    for (let i = 0; i < run.length; ) {
      const o = run[i];
      const gp = i > 0 ? o.a - run[i - 1].b : Infinity;
      const gn = i < run.length - 1 ? run[i + 1].a - o.b : Infinity;
      if (o.b - o.a >= o.t - EPS || Math.min(gp, gn) > o.t + EPS) {
        i++;
        continue;
      }
      const lo = gp <= gn ? i - 1 : i;
      run.splice(lo, 2, join(run[lo], run[lo + 1]));
      i = lo;
    }
    for (const { oid, ...o } of run) out.push(o);
  }
  return out;
}

/**
 * @param {object} project 方案（store.js 的形状）
 * @param {{ now?: Date, name?: string }} opts now = 导出时间（测试注入，输出可重复）；name = 文件包名称（没传 → defaultPackName）
 */
export function buildScene(project, { now = new Date(), name } = {}) {
  const plan = migratePlan(project.plan);
  const B = bounds(plan);
  const O = { x: B.x0 - EXT_T / 2, y: B.y1 + EXT_T / 2 };
  const tx = (x) => Math.round((x - O.x) * 1000);
  const ty = (y) => Math.round((O.y - y) * 1000);
  const X = (x) => x - O.x;
  const Y = (y) => O.y - y;
  const materials = sceneMaterials(project.materials);
  const elev = elevations(plan);
  const stats = { rooms: 0, openings: { door: 0, window: 0, slider: 0, open: 0 }, items: 0, byCategory: { case: 0, furn: 0, soft: 0, fix: 0 }, skipped: 0 };
  const furniture = Array.isArray(project.furniture) ? project.furniture : [];
  const floorIds = new Set(plan.floors.map((f) => f.id));

  const floors = plan.floors.map((f, i) => {
    const walls = buildWalls(f);
    const prev = plan.floors[i - 1];
    const below = prev ? Math.max(0.05, (prev.height || prev.ceil + 0.35) - prev.ceil) : 0;
    const upStairs = new Set((plan.stairs || []).filter((s) => s.to === f.id).map((s) => s.id));
    const holes = new Set(f.rooms.filter((r) => ROOM_TYPES[r.type]?.void || (r.stairId && upStairs.has(r.stairId))).map((r) => r.id));
    const roomById = new Map(f.rooms.map((r) => [r.id, r]));

    const rooms = f.rooms.map((r) => {
      const t = ROOM_TYPES[r.type] || {};
      const plain = !t.stair && !t.void;
      const ns = plain ? netSize(r, walls) : null;
      if (plain) stats.rooms++;
      return {
        id: r.id,
        type: r.type,
        name: roomName(r),
        rect: { x: r.x, y: r.y, w: r.w, d: r.d },
        net: ns ? { w: ns.w, d: ns.d } : null,
        area: ns ? ns.area : null,
        inner: ns ? ns.inner : null,
        label: [r.x + r.w / 2, r.y + r.d / 2],
        stair: !!t.stair,
        void: !!t.void,
        outdoor: !!t.outdoor,
        hole: holes.has(r.id),
      };
    });
    const roomOf = new Map(rooms.map((r) => [r.id, r]));

    const pieces = [];
    const lowEdges = [];
    for (const w of walls) {
      if (isOutdoorEdge(w)) {
        const ref = w.neg || w.pos;
        const room = roomById.get(ref.id);
        let kind = 'parapet';
        if (ref.type === 'porch' && room) kind = houseSides(room, walls).has(OPP[sideOf(room, w)]) ? 'porch-street' : 'porch-side';
        lowEdges.push({ wall: w, kind });
        continue;
      }
      for (const p of w.pieces) {
        if (p.kind === 'solid') continue;
        const kind = ['door', 'window', 'slider', 'open'].includes(p.kind) ? p.kind : 'door';
        const near = roomOf.get(w.pos?.id) || roomOf.get(w.neg?.id);
        pieces.push({ id: p.openingId || `${w.id}-${pieces.length}`, oid: p.openingId || null, kind, wall: w, a: p.a, b: p.b, t: w.t, sill: p.sill ?? 0, head: p.head ?? 2.1, hinge: p.a, swing: w.pos ? 1 : -1, room: near ? near.name : null });
      }
    }
    const openings = mergeOpenings(pieces);
    for (const o of openings) stats.openings[o.kind]++;

    const stairs = (plan.stairs || [])
      .filter((s) => s.from === f.id || s.to === f.id)
      .map((s) => {
        const fl = stairFlights(plan, s.id);
        return { id: s.id, role: s.from === f.id ? 'up' : 'down', stair: s, flights: fl?.flights || [], landings: fl?.landings || [], rise: fl?.rise || 0, risers: fl?.risers || 0, path: stairPath(plan, s.id) };
      });

    const items = [];
    for (const it0 of furniture) {
      const fid = it0.floor && floorIds.has(it0.floor) ? it0.floor : it0.floor ? null : plan.floors[0].id;
      if (fid !== f.id) continue;
      const def = CATALOG[it0.kind];
      const cat = catOf(it0.kind);
      if (!def || !cat) {
        stats.skipped++;
        continue;
      }
      // 房间先看位置（设计师拖过去的家具 item.room 不会跟着改）；中心正好在墙线上的（窗帘）才用存着的 item.room
      const room = rooms.find((r) => !r.stair && !r.void && it0.x > r.rect.x && it0.x < r.rect.x + r.rect.w && it0.z > r.rect.y && it0.z < r.rect.y + r.rect.d) || roomOf.get(it0.room) || null;
      const it = it0.kind === 'rug' ? clipRug(it0, room?.inner) : it0;
      const n = nominal(it, f.ceil);
      const parts = massing(it, n, f.ceil);
      if (!parts || !parts.length) {
        stats.skipped++;
        continue;
      }
      const slots = [...new Set(parts.map((p) => p.m))];
      const main0 = it.kind === 'bookshelf' ? it.key || 'woodwork' : it.kind === 'dresser' && it.key ? it.key : MAIN_SLOT[it.kind] || def.slot;
      const main = main0.startsWith('fixed__') ? main0 : materials[main0]?.id || main0;
      const mats = slots.filter((s) => !s.startsWith('fixed__')).map((s) => ({ slot: s, id: materials[s].id, zh: materials[s].mat.zh, en: materials[s].mat.en, slotZh: slotShort(s).zh, slotEn: slotShort(s).en, sourced: !!SOURCED[s] }));
      stats.items++;
      stats.byCategory[cat]++;
      items.push({
        ...it,
        floor: f.id,
        cat,
        name: bi(def.zh),
        room: room ? room.name : bi(''),
        roomId: room?.id || null,
        n,
        W: mm(n.W),
        D: mm(n.D),
        H: mm(n.H),
        rot: +it.rot || 0,
        y: +it.y || 0,
        parts,
        slots,
        main,
        mats,
        key: blockKey(it, n),
      });
    }

    return {
      id: f.id,
      level: i,
      code: floorCode(i),
      name: bi(floorName(plan, f.id)),
      elev: elev[f.id] || 0,
      ceil: f.ceil,
      height: f.height,
      below,
      walls,
      rooms,
      openings,
      lowEdges,
      stairs,
      rails: holes.size ? voidEdges(plan, f.id, walls) : [],
      plates: i > 0 ? floorPlate(plan, f.id) : [],
      porchRoofs: i > 0 ? porchRoofs(plan, f.id) : [],
      prevWalls: i > 0 ? buildWalls(prev) : null,
      prevRooms: i > 0 ? prev.rooms : null,
      items,
    };
  });

  // 家具写着一层不存在的楼层：跳过（README 里写出跳过了几件）
  stats.skipped += furniture.filter((it) => it?.floor && !floorIds.has(it.floor)).length;

  return {
    name: projectName(packName(project, name)),
    id: project.id || '',
    createdAt: project.createdAt || null,
    updatedAt: project.updatedAt || null,
    now: new Date(now),
    plan,
    north: plan.north || 0,
    O,
    B,
    W: mm(B.w + EXT_T),
    D: mm(B.d + EXT_T),
    tx,
    ty,
    X,
    Y,
    materials,
    floors,
    stats,
  };
}
