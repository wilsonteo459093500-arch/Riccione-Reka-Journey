// 平面图数据模型（纯函数，Node 可测）
//
// plan = {
//   v: 1, name, wallH: 2.8, north: 0,          // north：北方在平面图上的角度（0 = 图纸上方），用于日照
//   rooms:    [{ id, type, name, x, y, w, d }], // 米；x 向右、y 向下（= 3D 的 z，朝向镜头）
//   openings: [{ id, kind, x1, y1, x2, y2 }],   // 落在墙线上的一段：door 门 / window 窗 / slider 落地趟门 / open 打通
// }
//
// 房间只用矩形（L 形房间 = 两个同类型矩形）。概念阶段够用，也让 AI 识别 + 人工校正都很快。

export const ROOM_TYPES = {
  living: { zh: '客厅', en: 'Living', color: '#E9C9A1', floor: 'floor', open: true },
  dining: { zh: '餐厅', en: 'Dining', color: '#EBD6A8', floor: 'floor', open: true },
  kitchen: { zh: '厨房', en: 'Kitchen', color: '#C9D9C2', floor: 'tile' },
  master: { zh: '主卧', en: 'Master bedroom', color: '#D8C7E8', floor: 'floor' },
  bedroom: { zh: '卧室', en: 'Bedroom', color: '#C9D3EC', floor: 'floor' },
  kids: { zh: '儿童房', en: 'Kids room', color: '#F2CFC9', floor: 'floor' },
  study: { zh: '书房', en: 'Study', color: '#D9E3C7', floor: 'floor' },
  bath: { zh: '浴室', en: 'Bathroom', color: '#BFDDE6', floor: 'tile', wet: true },
  foyer: { zh: '玄关', en: 'Foyer', color: '#E6DCCB', floor: 'floor', open: true },
  corridor: { zh: '走廊', en: 'Corridor', color: '#E3DED5', floor: 'floor', open: true },
  balcony: { zh: '阳台', en: 'Balcony', color: '#CFE3D3', floor: 'tile', outdoor: true },
  porch: { zh: '车廊 / 前院', en: 'Car porch', color: '#DAD6CC', floor: 'tile', outdoor: true },
  utility: { zh: '晒衣处', en: 'Yard', color: '#D3DADC', floor: 'tile', wet: true },
  walkin: { zh: '衣帽间', en: 'Walk-in', color: '#E7D3E0', floor: 'floor' },
  store: { zh: '储物间', en: 'Store', color: '#D9D4CC', floor: 'floor' },
};

export const OPENING_KINDS = {
  door: { zh: '门', en: 'Door', width: 0.9, head: 2.1 },
  window: { zh: '窗', en: 'Window', width: 1.5, sill: 0.9, head: 2.2 },
  slider: { zh: '落地趟门', en: 'Sliding door', width: 2.4, sill: 0, head: 2.4 },
  open: { zh: '打通', en: 'Open', width: 1.2 },
};

export const EXT_T = 0.2;
export const INT_T = 0.12;
const EPS = 0.03;

export const uid = (p = 'r') => `${p}${Math.random().toString(36).slice(2, 8)}`;
const r2 = (v) => Math.round(v * 100) / 100;

export function bounds(plan) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of plan.rooms || []) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.d);
  }
  if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 10, y1: 8, w: 10, d: 8, cx: 5, cy: 4 };
  return { x0, y0, x1, y1, w: x1 - x0, d: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** 吸附：相近的边对齐（AI 识别 / 手画后用），让墙线干净 */
export function snapPlan(plan, tol = 0.12) {
  const xs = [];
  const ys = [];
  for (const r of plan.rooms) {
    xs.push(r.x, r.x + r.w);
    ys.push(r.y, r.y + r.d);
  }
  const cluster = (vals) => {
    const sorted = [...vals].sort((a, b) => a - b);
    const groups = [];
    for (const v of sorted) {
      const g = groups[groups.length - 1];
      if (g && v - g[g.length - 1] <= tol) g.push(v);
      else groups.push([v]);
    }
    return (v) => {
      const g = groups.find((gg) => v >= gg[0] - 1e-9 && v <= gg[gg.length - 1] + 1e-9);
      return g ? Math.round((g.reduce((a, b) => a + b, 0) / g.length) * 20) / 20 : v;
    };
  };
  const sx = cluster(xs);
  const sy = cluster(ys);
  const rooms = plan.rooms.map((r) => {
    const x = sx(r.x);
    const y = sy(r.y);
    const x2 = sx(r.x + r.w);
    const y2 = sy(r.y + r.d);
    return { ...r, x: r2(x), y: r2(y), w: r2(Math.max(0.6, x2 - x)), d: r2(Math.max(0.6, y2 - y)) };
  });
  // 开口吸到最近的墙线上
  const lines = { h: [...new Set(rooms.flatMap((r) => [r.y, r.y + r.d]).map(r2))], v: [...new Set(rooms.flatMap((r) => [r.x, r.x + r.w]).map(r2))] };
  const near = (arr, v) => arr.reduce((best, a) => (Math.abs(a - v) < Math.abs(best - v) ? a : best), arr[0] ?? v);
  const openings = (plan.openings || []).map((o) => {
    if (Math.abs(o.y1 - o.y2) < Math.abs(o.x1 - o.x2)) {
      const y = near(lines.h, (o.y1 + o.y2) / 2);
      return { ...o, y1: y, y2: y, x1: r2(o.x1), x2: r2(o.x2) };
    }
    const x = near(lines.v, (o.x1 + o.x2) / 2);
    return { ...o, x1: x, x2: x, y1: r2(o.y1), y2: r2(o.y2) };
  });
  return { ...plan, rooms, openings };
}

/**
 * 由房间矩形生成墙。每段墙：
 * { id, axis:'x'|'z', c, a, b, t, exterior, neg: room|null, pos: room|null, outward: -1|1|0, pieces:[{a,b,kind,sill,head,openingId}] }
 * axis 'x' = 沿 x 方向的墙（平面图上的横线，y = c）；neg = 线上方的房间，pos = 线下方的房间。
 * axis 'z' = 沿 y 方向的墙（竖线，x = c）；neg = 线左边，pos = 线右边。
 */
export function buildWalls(plan) {
  const lines = new Map();
  const push = (axis, c, a, b, room, side) => {
    const key = `${axis}:${Math.round(c * 100)}`;
    if (!lines.has(key)) lines.set(key, { axis, c: r2(c), edges: [] });
    lines.get(key).edges.push({ a: Math.min(a, b), b: Math.max(a, b), room, side });
  };
  for (const r of plan.rooms) {
    push('x', r.y, r.x, r.x + r.w, r, 'pos');
    push('x', r.y + r.d, r.x, r.x + r.w, r, 'neg');
    push('z', r.x, r.y, r.y + r.d, r, 'pos');
    push('z', r.x + r.w, r.y, r.y + r.d, r, 'neg');
  }
  const openType = (r) => !!ROOM_TYPES[r?.type]?.open;
  const walls = [];
  for (const line of lines.values()) {
    const pts = [...new Set(line.edges.flatMap((e) => [e.a, e.b]).map(r2))].sort((a, b) => a - b);
    let cur = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      if (q - p < EPS) continue;
      const cover = (side) => line.edges.find((e) => e.side === side && e.a <= p + EPS && e.b >= q - EPS)?.room || null;
      const neg = cover('neg');
      const pos = cover('pos');
      if (!neg && !pos) {
        cur = null;
        continue;
      }
      const exists = !(neg && pos && openType(neg) && openType(pos));
      const key = `${neg?.id || '-'}|${pos?.id || '-'}|${exists}`;
      if (cur && cur.key === key && Math.abs(cur.b - p) < EPS) {
        cur.b = q;
      } else {
        cur = { key, axis: line.axis, c: line.c, a: p, b: q, neg, pos, exists };
        walls.push(cur);
      }
    }
  }
  const openings = plan.openings || [];
  return walls
    .filter((w) => w.exists)
    .map((w, i) => {
      const exterior = !w.neg || !w.pos;
      const outward = exterior ? (w.neg ? 1 : -1) : 0;
      const ops = openings
        .filter((o) => {
          const horiz = Math.abs(o.y1 - o.y2) < EPS;
          if (w.axis === 'x' && !(horiz && Math.abs(o.y1 - w.c) < EPS)) return false;
          if (w.axis === 'z' && !(!horiz && Math.abs(o.x1 - w.c) < EPS)) return false;
          const [oa, ob] = w.axis === 'x' ? [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)] : [Math.min(o.y1, o.y2), Math.max(o.y1, o.y2)];
          return ob > w.a + EPS && oa < w.b - EPS;
        })
        .map((o) => {
          const [oa, ob] = w.axis === 'x' ? [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)] : [Math.min(o.y1, o.y2), Math.max(o.y1, o.y2)];
          const k = OPENING_KINDS[o.kind] || OPENING_KINDS.door;
          return { a: Math.max(w.a, oa), b: Math.min(w.b, ob), kind: o.kind, sill: o.sill ?? k.sill ?? 0, head: o.head ?? k.head ?? 2.1, openingId: o.id };
        })
        .sort((x, y) => x.a - y.a);
      const pieces = [];
      let at = w.a;
      for (const o of ops) {
        if (o.a > at + EPS) pieces.push({ a: at, b: o.a, kind: 'solid' });
        pieces.push(o);
        at = Math.max(at, o.b);
      }
      if (w.b > at + EPS) pieces.push({ a: at, b: w.b, kind: 'solid' });
      return {
        id: `w${i}`,
        axis: w.axis,
        c: w.c,
        a: r2(w.a),
        b: r2(w.b),
        t: exterior ? EXT_T : INT_T,
        exterior,
        outward,
        neg: w.neg ? { id: w.neg.id, type: w.neg.type } : null,
        pos: w.pos ? { id: w.pos.id, type: w.pos.type } : null,
        pieces,
      };
    });
}

/** 某房间四条边上「可以靠墙放家具」的整段（扣掉门、窗、打通） */
export function roomSides(room, walls, { allowWindow = false } = {}) {
  const sides = [
    { side: 'N', axis: 'x', c: room.y, a: room.x, b: room.x + room.w, inward: [0, 1] },
    { side: 'S', axis: 'x', c: room.y + room.d, a: room.x, b: room.x + room.w, inward: [0, -1] },
    { side: 'W', axis: 'z', c: room.x, a: room.y, b: room.y + room.d, inward: [1, 0] },
    { side: 'E', axis: 'z', c: room.x + room.w, a: room.y, b: room.y + room.d, inward: [-1, 0] },
  ];
  return sides.map((s) => {
    const mine = walls.filter((w) => w.axis === s.axis && Math.abs(w.c - s.c) < EPS && w.b > s.a + EPS && w.a < s.b - EPS);
    const stretches = [];
    let windows = 0;
    let doors = 0;
    let thick = INT_T;
    for (const w of mine) {
      thick = Math.max(thick, w.t);
      for (const p of w.pieces) {
        const a = Math.max(p.a, s.a);
        const b = Math.min(p.b, s.b);
        if (b - a < EPS) continue;
        if (p.kind === 'window') windows += b - a;
        if (p.kind === 'door' || p.kind === 'slider' || p.kind === 'open') doors += b - a;
        const ok = p.kind === 'solid' || (allowWindow && p.kind === 'window');
        if (!ok) continue;
        const last = stretches[stretches.length - 1];
        if (last && Math.abs(last.b - a) < EPS) last.b = b;
        else stretches.push({ a, b });
      }
    }
    const covered = mine.reduce((t, w) => t + Math.max(0, Math.min(w.b, s.b) - Math.max(w.a, s.a)), 0);
    return {
      ...s,
      len: s.b - s.a,
      walled: covered > (s.b - s.a) * 0.5,
      windows,
      doors,
      thick: thick / 2,
      stretches: stretches.map((x) => ({ ...x, len: x.b - x.a })).sort((x, y) => y.len - x.len),
    };
  });
}

// ───────────────────────── 户型模板 ─────────────────────────

const R = (id, type, x, y, w, d, name) => ({ id, type, name: name || ROOM_TYPES[type].zh, x, y, w, d });
const O = (id, kind, x1, y1, x2, y2, extra = {}) => ({ id, kind, x1, y1, x2, y2, ...extra });

export const TEMPLATES = [
  {
    id: 'condo3',
    zh: '公寓 · 3 房 2 卫',
    en: 'Condo · 3R2B · ~1,100 sqft',
    plan: {
      v: 1,
      name: '公寓 · 3 房 2 卫',
      wallH: 2.8,
      north: 0,
      rooms: [
        R('kit', 'kitchen', 0, 0, 3.0, 3.0),
        R('din', 'dining', 3.0, 0, 3.6, 3.0),
        R('liv', 'living', 0, 3.0, 6.6, 4.5),
        R('bal', 'balcony', 0, 7.5, 4.2, 1.5),
        R('foy', 'foyer', 4.2, 7.5, 2.4, 1.5),
        R('bd2', 'bedroom', 6.6, 0, 3.0, 3.2, '次卧'),
        R('std', 'study', 9.6, 0, 2.4, 3.2),
        R('cor', 'corridor', 6.6, 3.2, 5.4, 1.0),
        R('bth', 'bath', 6.6, 4.2, 1.8, 2.4, '公共浴室'),
        R('mst', 'master', 8.4, 4.2, 3.6, 4.8),
        R('mbt', 'bath', 6.6, 6.6, 1.8, 2.4, '主卧浴室'),
      ],
      openings: [
        O('d-main', 'door', 4.95, 9.0, 5.95, 9.0),
        O('d-kit', 'door', 3.0, 1.6, 3.0, 2.5),
        O('s-bal', 'slider', 0.5, 7.5, 3.7, 7.5),
        O('d-bd2', 'door', 6.85, 3.2, 7.75, 3.2),
        O('d-std', 'door', 10.6, 3.2, 11.5, 3.2),
        O('d-bth', 'door', 6.85, 4.2, 7.65, 4.2),
        O('d-mst', 'door', 8.7, 4.2, 9.6, 4.2),
        O('d-mbt', 'door', 8.4, 7.9, 8.4, 8.7),
        O('w-kit', 'window', 0.7, 0, 2.2, 0),
        O('w-din', 'window', 3.9, 0, 5.7, 0),
        O('w-liv', 'window', 0, 3.6, 0, 6.6, { sill: 0.45 }),
        O('w-bd2', 'window', 7.4, 0, 8.9, 0),
        O('w-std', 'window', 12.0, 0.6, 12.0, 2.4),
        O('w-mst', 'window', 12.0, 5.0, 12.0, 7.8, { sill: 0.45 }),
        O('w-mst2', 'window', 9.4, 9.0, 11.2, 9.0),
      ],
    },
  },
  {
    id: 'terrace',
    zh: '排屋一楼 · 22×70',
    en: 'Terrace house · Ground floor',
    plan: {
      v: 1,
      name: '排屋一楼',
      wallH: 3.0,
      north: 90,
      rooms: [
        R('por', 'porch', 0, 12.4, 6.6, 1.8, '前院 / 车廊'),
        R('liv', 'living', 0, 7.2, 6.6, 5.2),
        R('din', 'dining', 0, 3.8, 4.2, 3.4),
        // 客房 2.4 × 3.0：床（2.05 + 床尾 0.6）放得下，床头靠楼梯那面墙、不背浴室
        R('stair', 'store', 4.2, 4.8, 2.4, 2.4, '楼梯 / 储物'),
        R('kit', 'kitchen', 0, 0, 4.2, 3.8, '干湿厨房'),
        R('bth', 'bath', 4.2, 0, 2.4, 1.8, '浴室'),
        R('gst', 'bedroom', 4.2, 1.8, 2.4, 3.0, '客房'),
      ],
      openings: [
        O('d-main', 'slider', 1.6, 12.4, 4.6, 12.4),
        O('o-dk', 'open', 0.6, 3.8, 3.6, 3.8),
        O('d-stair', 'open', 4.4, 7.2, 6.2, 7.2),
        O('d-gst', 'door', 4.2, 3.9, 4.2, 4.7),
        O('d-bth', 'door', 4.2, 0.9, 4.2, 1.7),
        O('w-kit', 'window', 0.8, 0, 3.4, 0),
        O('w-gst', 'window', 6.6, 2.2, 6.6, 3.4, { sill: 1.2 }),
      ],
    },
  },
  {
    id: 'studio',
    zh: '小公寓 · 1 房',
    en: 'Studio · 1R1B · ~650 sqft',
    plan: {
      v: 1,
      name: '小公寓 · 1 房',
      wallH: 2.8,
      north: 0,
      rooms: [
        R('kit', 'kitchen', 0, 0, 2.6, 2.6, '开放厨房'),
        R('din', 'dining', 2.6, 0, 2.2, 2.6),
        R('liv', 'living', 0, 2.6, 4.8, 4.0, '客厅'),
        R('mst', 'master', 4.8, 0, 3.6, 4.0, '卧室'),
        R('foy', 'foyer', 4.8, 4.0, 1.8, 2.6),
        R('bth', 'bath', 6.6, 4.0, 1.8, 2.6),
      ],
      openings: [
        O('o-kit', 'open', 0.3, 2.6, 2.3, 2.6),
        O('o-kd', 'open', 2.6, 0.3, 2.6, 2.3),
        O('d-main', 'door', 5.25, 6.6, 6.15, 6.6),
        O('d-mst', 'door', 5.25, 4.0, 6.15, 4.0),
        O('d-bth', 'door', 6.6, 4.6, 6.6, 5.4),
        O('w-liv', 'slider', 0, 3.2, 0, 6.0),
        O('w-mst', 'window', 5.4, 0, 7.8, 0, { sill: 0.45 }),
        O('w-mst2', 'window', 8.4, 1.0, 8.4, 3.0),
        O('w-kit', 'window', 0.5, 0, 2.0, 0),
        O('w-bth', 'window', 8.4, 4.6, 8.4, 5.4, { sill: 1.5 }),
      ],
    },
  },
];

export function templatePlan(id) {
  const t = TEMPLATES.find((x) => x.id === id) || TEMPLATES[0];
  return JSON.parse(JSON.stringify(t.plan));
}

export function emptyPlan() {
  return { v: 1, name: '新方案', wallH: 2.8, north: 0, rooms: [], openings: [] };
}

/** 基本检查：重叠、太小 —— 编辑器里提示，不阻止 */
export function checkPlan(plan) {
  const issues = [];
  const rs = plan.rooms || [];
  for (let i = 0; i < rs.length; i++) {
    const a = rs[i];
    if (a.w < 0.8 || a.d < 0.8) issues.push(`${a.name} 太小了`);
    for (let j = i + 1; j < rs.length; j++) {
      const b = rs[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
      if (ox > 0.1 && oy > 0.1) issues.push(`${a.name} 和 ${b.name} 重叠了`);
    }
  }
  return issues;
}
