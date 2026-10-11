// 自动摆家具 —— 用设计师的经验规则，而不是随机：
//   客厅：电视墙选「最长、没窗、没门」的整面墙；沙发在对面，离电视 2.7–3.3m；茶几离沙发 35–45cm。
//   卧室：床头靠「没窗」的墙，两侧留 ≥ 50cm；衣柜放在另一面墙，前面留 ≥ 60cm 更衣。
//   厨房：沿最长墙做一字，够大就做 L；吊柜避开窗户；冰箱放在动线端头。
//   玄关：鞋柜长度 = 占卜里数出来的鞋子换算。主卧衣柜长度 = 占卜里的衣柜目标。
// 纯函数（只读 plan / walls / profile），Node 里可测。

import { roomSides, uid, ROOM_TYPES } from '../plan/model.js';
import { storagePlan } from '../../shared/profile.js';
import { APPLIANCES } from '../../quiz/flow.js';

const SIDE_ROT = { N: 0, S: 180, W: 90, E: 270 };

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

function overlap(a, b, m = 0) {
  return a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;
}

function inside(room, f, m = 0.02) {
  return f.x0 >= room.x - m && f.x1 <= room.x + room.w + m && f.z0 >= room.y - m && f.z1 <= room.y + room.d + m;
}

class Layout {
  constructor() {
    this.items = [];
    this.boxes = [];
  }
  /** 放一件；front = 前方要留的通道（米），会和别的家具检查 */
  try(room, kind, pos, w, d, extra = {}, { front = 0, margin = 0.02, force = false } = {}) {
    const item = { id: uid('f'), kind, room: room.id, x: +pos.x.toFixed(3), z: +pos.z.toFixed(3), rot: pos.rot, w, d, ...extra };
    const f = footprint(item, w, d + front);
    // 通道往前方延伸
    if (front) {
      const r = (item.rot * Math.PI) / 180;
      const fx = Math.sin(r) * (front / 2);
      const fz = Math.cos(r) * (front / 2);
      f.x0 += fx;
      f.x1 += fx;
      f.z0 += fz;
      f.z1 += fz;
    }
    const core = footprint(item, w, d);
    if (!force) {
      if (!inside(room, core)) return null;
      if (this.boxes.some((b) => b.room === room.id && (overlap(core, b.f, margin) || (front && overlap(f, b.core, 0))))) return null;
    }
    this.items.push(item);
    this.boxes.push({ room: room.id, f, core, flat: !!extra.flat });
    return item;
  }
  /** 地毯这种可以压在家具下的 */
  flat(room, kind, pos, w, d, extra = {}) {
    const item = { id: uid('f'), kind, room: room.id, x: +pos.x.toFixed(3), z: +pos.z.toFixed(3), rot: pos.rot, w, d, ...extra };
    this.items.push(item);
    return item;
  }
}

const score = (s, { noWindow = 3, noDoor = 1 } = {}) => (s.stretches[0]?.len || 0) - s.windows * noWindow - s.doors * noDoor;
const opposite = (sides, s) => sides.find((x) => x.side === { N: 'S', S: 'N', W: 'E', E: 'W' }[s.side]);
const depthOf = (room, s) => (s.axis === 'x' ? room.d : room.w);
const mid = (st) => (st.a + st.b) / 2;

function windowsOn(side, walls) {
  const out = [];
  for (const w of walls) {
    if (w.axis !== side.axis || Math.abs(w.c - side.c) > 0.03) continue;
    for (const p of w.pieces) if ((p.kind === 'window' || p.kind === 'slider') && p.b > side.a && p.a < side.b) out.push({ a: Math.max(p.a, side.a), b: Math.min(p.b, side.b), kind: p.kind });
  }
  return out;
}

// ───────────────────────── 每种房间 ─────────────────────────

function living(L, room, sides, ctx) {
  const cands = sides.filter((s) => s.walled && (s.stretches[0]?.len || 0) >= 1.8).sort((a, b) => score(b, { noWindow: 2 }) - score(a, { noWindow: 2 }));
  const tvSide = cands[0];
  if (!tvSide) return;
  const st = tvSide.stretches[0];
  const tvW = Math.min(st.len - 0.1, 3.2);
  const along = mid(st);
  const tv = L.try(room, 'tvWall', at(room, tvSide, along, tvSide.thick + 0.23), tvW, 0.45, { h: ctx.wallH }, { force: true });
  const D = depthOf(room, tvSide);
  const sofaVariant = ctx.curve > 62 ? 'curvy' : ctx.social > 65 && D > 3.8 && st.len > 3 ? 'lshape' : 'classic';
  const sofaW = Math.min(sofaVariant === 'lshape' ? 2.6 : 2.3, Math.max(1.8, tvW));
  const sofaD = 0.92;
  const back = D - tvSide.thick * 2 - 0.05 <= 4.6;
  const sofaDist = back ? D - (opposite(sides, tvSide)?.thick || 0.06) - sofaD / 2 : Math.min(3.3, D - 1.2) + 0.45;
  const sofa = L.try(room, 'sofa', { ...at(room, tvSide, along, sofaDist), rot: (SIDE_ROT[tvSide.side] + 180) % 360 }, sofaW, sofaD, { variant: sofaVariant }, { force: true });
  if (!sofa || !tv) return;
  const ctDist = sofaDist - sofaD / 2 - 0.4 - 0.3;
  L.try(room, 'coffeeTable', at(room, tvSide, along, ctDist), 1.0, 0.6, { variant: ctx.refined ? 'stone' : ctx.curve > 55 ? 'round' : 'rect' }, { force: true });
  const rugD = Math.max(1.6, sofaDist - tvSide.thick - 0.7);
  L.flat(room, 'rug', at(room, tvSide, along, sofaDist - rugD / 2 + 0.25), sofaW + 0.6, rugD, { variant: ctx.curve > 70 ? 'round' : 'rect' });
  // 单椅 / 落地灯 / 植物
  // 单椅斜放、面向茶几；另一侧落地灯
  const ct = at(room, tvSide, along, ctDist);
  const p = at(room, tvSide, along + sofaW / 2 + 0.6, ctDist + 0.15);
  const face = Math.round((Math.atan2(ct.x - p.x, ct.z - p.z) * 180) / Math.PI);
  if (!L.try(room, 'armchair', { ...p, rot: (face + 360) % 360 }, 0.8, 0.8, { variant: ctx.natural ? 'lounge' : 'classic' }))
    L.try(room, 'floorLamp', at(room, tvSide, along + sofaW / 2 + 0.3, sofaDist), 0.4, 0.4);
  L.try(room, 'floorLamp', at(room, tvSide, along - sofaW / 2 - 0.3, sofaDist), 0.4, 0.4) || L.try(room, 'sideTable', at(room, tvSide, along - sofaW / 2 - 0.3, sofaDist), 0.45, 0.45);
  // 侧墙：展示柜 / 书墙 / 神台
  // 侧墙（含只有一段实墙的开放边，例如客厅和厨房之间那一段）
  const others = sides.filter((s) => s !== tvSide && s !== opposite(sides, tvSide) && (s.stretches[0]?.len || 0) >= 1.3).sort((a, b) => score(b) - score(a));
  const wantDisplay = ctx.displayPct >= 35 && !ctx.avoid.has('glassdoor');
  for (const s of others) {
    const sst = s.stretches[0];
    if (!sst || sst.len < 1.3) continue;
    if (ctx.altar && !ctx.placedAltar) {
      if (L.try(room, 'altar', at(room, s, mid(sst), s.thick + 0.25), 1.2, 0.5, {}, { front: 0.8 })) {
        ctx.placedAltar = true;
        continue;
      }
    }
    if (wantDisplay) {
      const w = Math.min(2.4, sst.len - 0.2);
      if (L.try(room, 'displayCabinet', at(room, s, mid(sst), s.thick + 0.21), w, 0.42, { h: Math.min(2.4, ctx.wallH - 0.2) }, { front: 0.6 })) continue;
    }
    if (ctx.books >= 6 && !ctx.hasStudy && !ctx.avoid.has('openshelf')) {
      const w = Math.min(2.4, sst.len - 0.2, Math.max(1.2, ctx.books * 0.16));
      if (L.try(room, 'bookshelf', at(room, s, mid(sst), s.thick + 0.17), w, 0.34, { h: Math.min(2.4, ctx.wallH - 0.2), key: 'woodwork' }, { front: 0.6 })) continue;
    }
    L.try(room, 'plant', at(room, s, sst.a + 0.35 > sst.b ? mid(sst) : sst.b - 0.35, s.thick + 0.3), 0.45, 0.45, { variant: 'tall', seed: 7 });
  }
  if (ctx.pets && !ctx.placedPet) {
    // 沙发两端、电视墙两角、房间四角，哪里空放哪里
    const tries = [
      at(room, tvSide, along - sofaW / 2 - 0.65, sofaDist - 0.7),
      at(room, tvSide, along + sofaW / 2 + 0.65, sofaDist - 0.7),
      at(room, tvSide, st.a + 0.55, tvSide.thick + 0.75),
      at(room, tvSide, st.b - 0.55, tvSide.thick + 0.75),
      { x: room.x + 0.55, z: room.y + 0.55, rot: 0 },
      { x: room.x + room.w - 0.55, z: room.y + room.d - 0.55, rot: 0 },
      { x: room.x + 0.55, z: room.y + room.d - 0.55, rot: 0 },
      { x: room.x + room.w - 0.55, z: room.y + 0.55, rot: 0 },
    ];
    for (const p of tries) if (L.try(room, 'petBed', { ...p, rot: 0 }, 0.8, 0.8)) {
      ctx.placedPet = true;
      break;
    }
  }
  if (ctx.kids && !ctx.hasKidsRoom && others[0]?.stretches[0]?.len > 1.4) {
    const s = others[others.length - 1];
    if (s?.stretches[0]) L.try(room, 'toyStorage', at(room, s, mid(s.stretches[0]), s.thick + 0.19), Math.min(1.4, s.stretches[0].len - 0.2), 0.38);
  }
  const oppo = opposite(sides, tvSide);
  if (back && oppo?.walled) L.flat(room, 'art', { ...at(room, oppo, along, oppo.thick + 0.03), rot: (SIDE_ROT[tvSide.side] + 180) % 360 }, 1.2, 0.04, { y: 1.35, w: 1.2, h: 0.75 });
}

function dining(L, room, sides, ctx) {
  const long = room.w >= room.d ? 'x' : 'z';
  const shortDim = Math.min(room.w, room.d);
  const seats = ctx.social > 60 || ctx.people >= 4 ? 6 : 4;
  const round = shortDim < 2.7 || ctx.curve > 66;
  const cx = room.x + room.w / 2;
  const cz = room.y + room.d / 2;
  if (round) L.try(room, 'diningTable', { x: cx, z: cz, rot: 0 }, 1.9, 1.9, { variant: 'round', w: seats > 4 ? 1.3 : 1.1, seats }, { force: true });
  else {
    const tw = seats > 4 ? 1.8 : 1.4;
    L.try(room, 'diningTable', { x: cx, z: cz, rot: long === 'x' ? 0 : 90 }, tw, 1.8, { variant: 'rect', w: tw, d: 0.9, seats }, { force: true });
  }
  L.flat(room, 'pendant', { x: cx, z: cz, rot: 0 }, 0.5, 0.5, { drop: 1.0 });
  const walls = sides.filter((x) => x.stretches[0]?.len >= 1.3).sort((a, b) => score(b) - score(a));
  // 客厅放不下神台的话，放餐厅
  if (ctx.altar && !ctx.placedAltar)
    for (const s of walls) if (L.try(room, 'altar', at(room, s, mid(s.stretches[0]), s.thick + 0.25), 1.2, 0.5, {}, { front: 0.8, margin: 0.6 })) {
      ctx.placedAltar = true;
      break;
    }
  const s = walls.find((x) => x.stretches[0]?.len >= 1.6);
  if (s) L.try(room, 'sideboard', at(room, s, mid(s.stretches[0]), s.thick + 0.23), Math.min(1.8, s.stretches[0].len - 0.2), 0.45, {}, { margin: 0.75 });
}

function kitchen(L, room, sides, ctx, walls) {
  const cands = sides.filter((s) => s.walled && s.stretches[0]?.len >= 1.5).sort((a, b) => (b.stretches[0]?.len || 0) - (a.stretches[0]?.len || 0));
  const main = cands[0];
  if (!main) return;
  const st = main.stretches[0];
  let runA = st.a;
  let runB = st.b;
  const fridgeFits = st.len >= 2.6;
  if (fridgeFits) {
    runB -= 0.9;
    L.try(room, 'fridge', at(room, main, runB + 0.45, main.thick + 0.36), 0.86, 0.7, {}, { force: true });
  }
  const len = runB - runA;
  const wins = windowsOn(main, walls).map((w) => ({ a: w.a - runA, b: w.b - runA }));
  const flip = main.side === 'S' || main.side === 'E';
  const local = flip ? wins.map((w) => ({ a: len - w.b, b: len - w.a })) : wins;
  L.try(room, 'kitchenRun', at(room, main, runA + len / 2, main.thick + 0.3), len, 0.6, { w: len, h: ctx.wallH, sink: 0.25, hob: len > 1.6 ? 0.72 : null, gaps: local, upper: true }, { force: true });
  // L 形：从主墙的端头沿垂直墙再做一段
  const perp = sides.filter((s) => s.axis !== main.axis && s.walled);
  for (const s of perp) {
    const corner = main.axis === 'x' ? (s.side === 'W' ? room.x : room.x + room.w) : s.side === 'N' ? room.y : room.y + room.d;
    const touches = Math.abs(corner - st.a) < 0.05 || Math.abs(corner - st.b) < 0.05;
    if (!touches) continue;
    const near = main.side === 'N' || main.side === 'W' ? s.a : s.b;
    const seg = s.stretches.find((x) => Math.abs(x.a - near) < 0.05 || Math.abs(x.b - near) < 0.05);
    if (!seg || seg.len < 1.4) continue;
    const startFromA = Math.abs(seg.a - near) < 0.05;
    const a = startFromA ? seg.a + 0.6 + main.thick : seg.a;
    const b = startFromA ? seg.b : seg.b - 0.6 - main.thick;
    if (b - a < 0.9) continue;
    const ws = windowsOn(s, walls).map((w) => ({ a: w.a - a, b: w.b - a }));
    const ll = b - a;
    const flip2 = s.side === 'S' || s.side === 'E';
    L.try(room, 'kitchenRun', at(room, s, (a + b) / 2, s.thick + 0.3), ll, 0.6, { w: ll, h: ctx.wallH, sink: null, hob: null, gaps: flip2 ? ws.map((w) => ({ a: ll - w.b, b: ll - w.a })) : ws, upper: true }, { force: true });
    break;
  }
  if (room.w >= 3.6 && room.d >= 3.6) L.try(room, 'island', { x: room.x + room.w / 2, z: room.y + room.d / 2 + 0.3, rot: SIDE_ROT[main.side] }, 1.8, 0.9, {}, { margin: 0.9 });
  if (ctx.applianceTall) {
    const s2 = cands.find((s) => s !== main && s.axis === main.axis);
    if (s2) L.try(room, 'tallUnit', at(room, s2, s2.stretches[0].a + 0.35, s2.thick + 0.3), 0.6, 0.6, { h: Math.min(2.4, ctx.wallH - 0.1) });
  }
}

function bedroom(L, room, sides, ctx, kind) {
  const isMaster = kind === 'master';
  const isKids = kind === 'kids';
  const shortDim = Math.min(room.w, room.d);
  const bw = isKids ? 1.0 : isMaster ? (shortDim >= 3.8 ? 1.8 : 1.6) : shortDim >= 3.2 ? 1.5 : 1.2;
  const bd = isKids ? 2.0 : 2.05;
  const cands = sides.filter((s) => s.walled && s.stretches[0]?.len >= bw + (isKids ? 0.2 : 0.4)).sort((a, b) => score(b, { noWindow: 4, noDoor: 1.5 }) - score(a, { noWindow: 4, noDoor: 1.5 }));
  const bedSide = cands[0];
  if (!bedSide) return;
  const st = bedSide.stretches[0];
  const roomMid = bedSide.axis === 'x' ? room.x + room.w / 2 : room.y + room.d / 2;
  const along = isKids ? st.a + bw / 2 + 0.15 : Math.min(Math.max(roomMid, st.a + bw / 2 + 0.55), st.b - bw / 2 - 0.55);
  const bed = L.try(room, isKids ? 'kidsBed' : 'bed', at(room, bedSide, along, bedSide.thick + bd / 2 + 0.04), bw + (isKids ? 0.8 : 0.16), bd + 0.1, { w: bw, d: bd }, { force: true });
  if (!bed) return;
  if (!isKids)
    for (const s of [-1, 1]) {
      const p = at(room, bedSide, along + s * (bw / 2 + 0.4), bedSide.thick + 0.24);
      L.try(room, 'nightstand', p, 0.5, 0.42);
    }
  L.flat(room, 'rug', at(room, bedSide, along, bedSide.thick + bd * 0.62), bw + 1.0, 1.5, {});
  // 衣柜
  const target = isMaster ? Math.max(1.8, (ctx.wardrobeMM || 2400) / 1000) : isKids ? 1.2 : 1.8;
  const wc = sides
    .filter((s) => s !== bedSide && s.walled)
    .flatMap((s) => s.stretches.filter((x) => x.len >= 1.0).map((x) => ({ s, x })))
    .sort((p, q) => q.x.len - p.x.len);
  let placed = false;
  for (const { s, x } of wc) {
    const len = Math.min(x.len - 0.04, target);
    const centers = [x.a + len / 2 + 0.02, x.b - len / 2 - 0.02, mid(x)];
    for (const c of centers) {
      if (L.try(room, 'wardrobe', at(room, s, c, s.thick + 0.3), len, 0.6, { w: len, h: Math.min(2.6, ctx.wallH - 0.08), handle: ctx.handle }, { front: 0.6 })) {
        placed = true;
        break;
      }
    }
    if (placed) break;
  }
  // 梳妆台 / 书桌 / 玩具
  const rest = sides.filter((s) => s.walled && s !== bedSide).flatMap((s) => s.stretches.map((x) => ({ s, x }))).sort((p, q) => q.x.len - p.x.len);
  const extra = isKids ? ['toyStorage', 'desk'] : isMaster ? (ctx.wfh && !ctx.hasStudy ? ['desk', 'plant'] : ['dresser', 'plant']) : ['desk'];
  for (const kindX of extra) {
    const dims = { desk: [isKids ? 1.0 : 1.2, 0.6], dresser: [1.1, 0.45], toyStorage: [1.2, 0.38], plant: [0.45, 0.45] }[kindX];
    for (const { s, x } of rest) {
      if (x.len < dims[0] + 0.1) continue;
      const p = at(room, s, mid(x), s.thick + dims[1] / 2 + 0.02);
      if (L.try(room, kindX, p, dims[0], dims[1], kindX === 'desk' ? { w: dims[0], d: dims[1] } : kindX === 'plant' ? { variant: 'tall', seed: 11 } : {}, { front: kindX === 'plant' ? 0 : 0.6 })) break;
    }
  }
}

function study(L, room, sides, ctx) {
  const winSide = sides.filter((s) => s.windows > 0.5).sort((a, b) => b.windows - a.windows)[0];
  const deskSide = winSide || sides.filter((s) => s.walled).sort((a, b) => score(b) - score(a))[0];
  if (!deskSide) return;
  const along = deskSide.axis === 'x' ? room.x + room.w / 2 : room.y + room.d / 2;
  L.try(room, 'desk', at(room, deskSide, along, deskSide.thick + 0.36), 1.4, 0.65, { w: 1.4, d: 0.65 }, { force: true });
  const shelfSides = sides.filter((s) => s !== deskSide && s.walled).flatMap((s) => s.stretches.map((x) => ({ s, x }))).sort((p, q) => q.x.len - p.x.len);
  const want = Math.max(1.2, Math.min(3.2, (ctx.books * 0.8) / 5));
  for (const { s, x } of shelfSides) {
    const w = Math.min(x.len - 0.1, want);
    if (w < 0.8) continue;
    if (L.try(room, ctx.avoid.has('openshelf') ? 'tallUnit' : 'bookshelf', at(room, s, mid(x), s.thick + 0.18), w, 0.34, { w, h: Math.min(2.4, ctx.wallH - 0.2), key: 'woodwork', seed: 4 }, { front: 0.6 })) break;
  }
  const sp = shelfSides[shelfSides.length - 1];
  if (sp) L.try(room, 'plant', at(room, sp.s, mid(sp.x), sp.s.thick + 0.3), 0.45, 0.45, { variant: 'tall', seed: 21 });
}

function bath(L, room, sides) {
  const walled = sides.filter((s) => s.walled).sort((a, b) => score(b, { noWindow: 2, noDoor: 2 }) - score(a, { noWindow: 2, noDoor: 2 }));
  const s = walled[0];
  if (!s) return;
  const st = s.stretches[0];
  if (st.len >= 0.95) L.try(room, 'vanity', at(room, s, st.a + 0.48, s.thick + 0.25), 0.9, 0.5, {}, { force: true });
  if (st.len >= 1.9) L.try(room, 'toilet', at(room, s, st.b - 0.35, s.thick + 0.35), 0.45, 0.7);
  const o = opposite(sides, s);
  if (o?.walled && o.stretches[0]) {
    const ost = o.stretches[0];
    L.try(room, 'shower', at(room, o, ost.len > 1 ? ost.b - 0.46 : mid(ost), o.thick + 0.46), 0.9, 0.9) || L.try(room, 'shower', at(room, o, ost.a + 0.46, o.thick + 0.46), 0.9, 0.9);
  }
  if (st.len < 1.9) {
    const p = sides.find((x) => x.axis !== s.axis && x.walled && x.stretches[0]?.len >= 0.6);
    if (p) L.try(room, 'toilet', at(room, p, mid(p.stretches[0]), p.thick + 0.35), 0.45, 0.7);
  }
}

function foyer(L, room, sides, ctx) {
  const c = sides.filter((s) => s.walled && s.stretches[0]?.len >= 0.9).sort((a, b) => b.stretches[0].len - a.stretches[0].len)[0];
  if (!c) return;
  const st = c.stretches[0];
  const len = Math.min(st.len - 0.05, Math.max(1.2, (ctx.shoeMM || 1500) / 1000));
  L.try(room, 'shoeCabinet', at(room, c, st.a + len / 2 + 0.02, c.thick + 0.19), len, 0.38, { w: len, h: Math.min(2.6, ctx.wallH - 0.1) }, { force: true });
  if (st.len - len > 1.1) L.try(room, 'bench', at(room, c, st.b - 0.55, c.thick + 0.2), 1.0, 0.38, { w: 1.0 });
  else {
    const o = sides.find((s) => s !== c && s.walled && s.stretches[0]?.len >= 1.1);
    if (o) L.try(room, 'bench', at(room, o, mid(o.stretches[0]), o.thick + 0.2), 1.0, 0.38, { w: 1.0 });
  }
}

function balcony(L, room, sides) {
  const cx = room.x + room.w / 2;
  const cz = room.y + room.d / 2;
  if (room.w >= room.d) {
    L.try(room, 'lounger', { x: cx - 0.55, z: cz, rot: 0 }, 0.7, 0.75);
    L.try(room, 'lounger', { x: cx + 0.55, z: cz, rot: 0 }, 0.7, 0.75);
    L.try(room, 'plant', { x: room.x + 0.35, z: cz, rot: 0 }, 0.45, 0.45, { variant: 'tall', seed: 2 });
    L.try(room, 'plant', { x: room.x + room.w - 0.35, z: cz, rot: 0 }, 0.45, 0.45, { variant: 'small', seed: 5 });
  } else {
    L.try(room, 'lounger', { x: cx, z: cz, rot: 90 }, 0.7, 0.75);
    L.try(room, 'plant', { x: cx, z: room.y + 0.35, rot: 0 }, 0.45, 0.45, { variant: 'tall', seed: 2 });
  }
  void sides;
}

function walkin(L, room, sides, ctx) {
  const c = sides.filter((s) => s.walled).flatMap((s) => s.stretches.map((x) => ({ s, x }))).sort((p, q) => q.x.len - p.x.len);
  for (const { s, x } of c.slice(0, 2)) if (x.len >= 0.9) L.try(room, 'wardrobe', at(room, s, mid(x), s.thick + 0.3), x.len - 0.04, 0.6, { w: x.len - 0.04, h: Math.min(2.6, ctx.wallH - 0.08), handle: ctx.handle });
}

function utility(L, room, sides, ctx) {
  const s = sides.filter((x) => x.walled && x.stretches[0]?.len >= 1.3)[0];
  if (!s) return;
  const st = s.stretches[0];
  L.try(room, 'washer', at(room, s, st.a + 0.35, s.thick + 0.32), 0.6, 0.6);
  L.try(room, 'tallUnit', at(room, s, st.a + 1.0, s.thick + 0.32), 0.6, 0.6, { h: Math.min(2.4, ctx.wallH - 0.1) });
}

function store(L, room, sides, ctx) {
  const s = sides.filter((x) => x.walled && x.stretches[0]?.len >= 0.9).sort((a, b) => b.stretches[0].len - a.stretches[0].len)[0];
  if (s) L.try(room, 'bookshelf', at(room, s, mid(s.stretches[0]), s.thick + 0.2), Math.min(2.4, s.stretches[0].len - 0.1), 0.4, { w: Math.min(2.4, s.stretches[0].len - 0.1), h: Math.min(2.4, ctx.wallH - 0.2), key: 'cabinetry', seed: 9 });
}

/** 窗帘：每扇窗 / 落地趟门（卫浴、厨房、阳台除外） */
function curtains(L, room, sides, walls, ctx) {
  const t = ROOM_TYPES[room.type];
  if (t?.wet || room.type === 'kitchen' || t?.outdoor || room.type === 'corridor' || room.type === 'foyer') return;
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

/** 主入口：plan + walls + 档案 → 家具清单 */
export function furnish(plan, walls, profile = null) {
  const L = new Layout();
  const who = new Set(profile?.life?.who || []);
  const sp = profile ? storagePlan(profile.storage || {}, APPLIANCES) : null;
  const types = new Set(plan.rooms.map((r) => r.type));
  const ctx = {
    wallH: plan.wallH || 2.8,
    curve: profile?.hidden?.curve ?? 45,
    social: profile?.hidden?.social ?? 50,
    refined: (profile?.axes?.texture ?? 60) < 50,
    natural: (profile?.axes?.texture ?? 60) >= 60,
    displayPct: sp?.displayPct ?? 20,
    books: profile?.storage?.books ?? 4,
    wardrobeMM: sp?.wardrobeMM || 2400,
    shoeMM: sp?.shoeCabinetMM || 1500,
    applianceTall: !!sp?.applianceTallCabinet,
    people: 2 + (who.has('kids') ? 2 : 0) + (who.has('elder') ? 1 : 0),
    kids: who.has('kids') || who.has('baby'),
    pets: who.has('dog') || who.has('cat'),
    altar: who.has('altar'),
    wfh: who.has('wfh'),
    avoid: new Set(profile?.avoid || []),
    handle: profile && (profile.axes?.texture ?? 60) < 50 && (profile.axes?.temp ?? 50) >= 50 ? 'bar' : 'none',
    hasStudy: types.has('study'),
    hasKidsRoom: types.has('kids'),
  };
  // 先摆大房间（客厅、主卧），神台 / 宠物窝这种只摆一次的优先给它们
  const order = ['living', 'master', 'dining', 'kitchen', 'bedroom', 'kids', 'study', 'foyer', 'bath', 'walkin', 'utility', 'store', 'balcony', 'corridor'];
  const rooms = [...plan.rooms].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  for (const room of rooms) {
    const sides = roomSides(room, walls);
    if (room.type === 'living') living(L, room, sides, ctx);
    else if (room.type === 'dining') dining(L, room, sides, ctx);
    else if (room.type === 'kitchen') kitchen(L, room, sides, ctx, walls);
    else if (room.type === 'master' || room.type === 'bedroom' || room.type === 'kids') bedroom(L, room, sides, ctx, room.type);
    else if (room.type === 'study') study(L, room, sides, ctx);
    else if (room.type === 'bath') bath(L, room, sides);
    else if (room.type === 'foyer') foyer(L, room, sides, ctx);
    else if (room.type === 'balcony') balcony(L, room, sides);
    else if (room.type === 'walkin') walkin(L, room, sides, ctx);
    else if (room.type === 'utility') utility(L, room, sides, ctx);
    else if (room.type === 'store') store(L, room, sides, ctx);
    curtains(L, room, sides, walls, ctx);
  }
  return L.items;
}
