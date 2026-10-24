// R 屏的小平面：纯函数（Node 测试得到；test/home.test.mjs）。
//   · L 形的房间读出来是好几块（id、id-2…）—— 算一间、画成一个形状、只写一个名字（和 readPlan.planSummary 同一个规则：
//     类型 + 去掉 -数字 的 id）；改名字 / 不是房间 也是整间一起（readPlan.relabelRoom / removeRoom 的 sameRoom）。
//   · 房名按房间的大小排：放不下就用短的（Master / Bath），再放不下就不写（颜色还在，点一下就看得到它是什么）。

import { ROOM_TYPES } from '../../studio/plan/model.js';

export const baseId = (id) => String(id ?? '').replace(/-\d+$/, '');
const BED = new Set(['master', 'bedroom', 'kids']);
const SQFT_PER_M2 = 10.7639;

/** 一层里的房间 → 一间一组 [{ key, base, id, type, parts:[room…], main:最大的那一块 }]（楼梯间不算房间） */
export function roomGroups(rooms) {
  const m = new Map();
  for (const r of rooms || []) {
    if (!r || r.stairId) continue;
    const base = baseId(r.id);
    const key = `${r.type}:${base}`;
    if (!m.has(key)) m.set(key, { key, base, id: r.id, type: r.type, parts: [] });
    const g = m.get(key);
    g.parts.push(r);
    if (String(r.id) === base) g.id = r.id; // 没有 -2 的那一块当这一间的 id
  }
  for (const g of m.values()) g.main = g.parts.reduce((a, b) => ((b.w || 0) * (b.d || 0) > (a.w || 0) * (a.d || 0) ? b : a));
  return [...m.values()];
}

/** 现在的平面（改过名字以后）几层、几个房间、几房几卫、多大 —— L 形的几块算一间 */
export function planFacts(plan) {
  const floors = plan?.floors || [];
  const groups = floors.flatMap((f) => roomGroups(f.rooms));
  const T = (type) => ROOM_TYPES[type] || {};
  const indoor = floors.flatMap((f) => f.rooms || []).filter((r) => !T(r.type).outdoor && !T(r.type).void);
  return {
    floors: floors.filter((f) => (f.rooms || []).length).length || 1,
    // 「几个房间」：室内、真的是一间（走廊、楼梯、挑空、晒衣处、车廊 / 阳台这些室外的不算）
    rooms: groups.filter((g) => !T(g.type).stair && !T(g.type).void && !T(g.type).outdoor && g.type !== 'corridor' && g.type !== 'utility').length,
    bedrooms: groups.filter((g) => BED.has(g.type)).length,
    bathrooms: groups.filter((g) => g.type === 'bath').length,
    areaSqft: Math.round(indoor.reduce((s, r) => s + (r.w || 0) * (r.d || 0), 0) * SQFT_PER_M2),
  };
}

/** 一串坐标：彼此相差不到 eps 的并成一个（读图 / 叠层时取整会让两块之间差 1–2 毫米） */
function snapper(vals, eps) {
  const map = new Map();
  let rep = null;
  let last = null;
  for (const v of [...new Set(vals)].sort((a, b) => a - b)) {
    if (rep === null || v - last > eps) rep = v;
    map.set(v, rep);
    last = v;
  }
  return (v) => map.get(v) ?? v;
}

/**
 * 几个长方形合起来的外框（SVG path，y 向下、顺时针）：L 形画成一个形状，中间没有分隔线。
 * 坐标先取到毫米，再把相差不到 2.5 厘米的边并在一起（读图的两块常常差一点点）。
 */
export function outlinePath(parts) {
  const rs0 = (parts || []).filter((r) => r && r.w > 0 && r.d > 0);
  if (!rs0.length) return '';
  const q = (v) => Math.round(v * 1000) / 1000;
  const sx = snapper(rs0.flatMap((r) => [q(r.x), q(r.x + r.w)]), 0.025);
  const sy = snapper(rs0.flatMap((r) => [q(r.y), q(r.y + r.d)]), 0.025);
  const rs = rs0.map((r) => {
    const x0 = sx(q(r.x));
    const y0 = sy(q(r.y));
    return { x: x0, y: y0, w: sx(q(r.x + r.w)) - x0, d: sy(q(r.y + r.d)) - y0 };
  });
  const xs = [...new Set(rs.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  const ys = [...new Set(rs.flatMap((r) => [r.y, r.y + r.d]))].sort((a, b) => a - b);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const grid = [];
  for (let i = 0; i < nx; i++) {
    grid.push([]);
    for (let j = 0; j < ny; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      grid[i].push(rs.some((r) => cx > q(r.x) && cx < q(r.x + r.w) && cy > q(r.y) && cy < q(r.y + r.d)));
    }
  }
  const cov = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && grid[i][j];
  const edges = new Map(); // 起点 → [终点…]（被盖住的格子在右手边）
  const add = (a, b) => {
    const k = `${a[0]},${a[1]}`;
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push(b);
  };
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      if (!grid[i][j]) continue;
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const y0 = ys[j];
      const y1 = ys[j + 1];
      if (!cov(i, j - 1)) add([x0, y0], [x1, y0]);
      if (!cov(i + 1, j)) add([x1, y0], [x1, y1]);
      if (!cov(i, j + 1)) add([x1, y1], [x0, y1]);
      if (!cov(i - 1, j)) add([x0, y1], [x0, y0]);
    }
  let d = '';
  for (let guard = 0; edges.size && guard < 64; guard++) {
    const k0 = edges.keys().next().value;
    const pts = [k0.split(',').map(Number)];
    let cur = k0;
    for (let s = 0; s < 4096; s++) {
      const list = edges.get(cur);
      if (!list?.length) break;
      const nx2 = list.shift();
      if (!list.length) edges.delete(cur);
      const nk = `${nx2[0]},${nx2[1]}`;
      if (nk === k0) break;
      pts.push(nx2);
      cur = nk;
    }
    // 一条直线上的中间点拿掉
    const keep = pts.filter((p, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[(i + 1) % pts.length];
      return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
    });
    if (keep.length >= 3) d += `M${keep.map((p) => `${p[0]} ${p[1]}`).join('L')}Z`;
  }
  return d;
}

/** 英文的短名字（小房间用；中文本来就短） */
export const SHORT_EN = { master: 'Master', bedroom: 'Bed', kids: 'Kids', bath: 'Bath', corridor: 'Hall', family: 'Family', balcony: 'Balc.', porch: 'Porch', walkin: 'Walk-in', living: 'Living', dining: 'Dining', kitchen: 'Kitchen', utility: 'Yard', study: 'Study', store: 'Store', foyer: 'Foyer' };

/** 字有多宽（单位 = 一个字号）：中文一个字 = 1，英文大写 ≈ 0.68、小写 ≈ 0.56、空格 0.3 */
export function textUnits(s) {
  let n = 0;
  for (const ch of String(s || '')) n += /[⺀-鿿豈-﫿＀-￯]/.test(ch) ? 1 : ch === ' ' ? 0.3 : /[A-Z]/.test(ch) ? 0.68 : /[.\-']/.test(ch) ? 0.3 : 0.56;
  return n;
}

/**
 * 房名放进 w × d 的房间（单位：米；fs = 这张平面的标准字号）→ { text, size } | null（放不下 → 不写）。
 * 先用完整的名字（字号不小于 0.8 fs），再用短的，最后完整的也可以小到 0.62 fs。
 */
export function fitLabel(full, short, w, d, fs) {
  const fit = (s) => Math.min(fs, (w * 0.84) / Math.max(1, textUnits(s)), d * 0.5);
  const min = fs * 0.62;
  const a = fit(full);
  if (a >= fs * 0.8) return { text: full, size: a };
  if (short && short !== full) {
    const b = fit(short);
    if (b >= min) return { text: short, size: b };
  }
  if (a >= min) return { text: full, size: a };
  return null;
}
