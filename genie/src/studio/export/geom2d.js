// 二维几何（DXF 用，整数毫米、Y 向上）：一堆矩形的并集轮廓、点在不在多边形里、文字大概多宽。

const uniq = (a) => [...new Set(a)].sort((p, q) => p - q);

/** 矩形 [{ x0, y0, x1, y1 }]（整数毫米）切成网格，标出被盖住的格子 */
export function cells(rects) {
  const rs = rects.filter((r) => r.x1 > r.x0 && r.y1 > r.y0);
  const xs = uniq(rs.flatMap((r) => [r.x0, r.x1]));
  const ys = uniq(rs.flatMap((r) => [r.y0, r.y1]));
  const ix = new Map(xs.map((v, i) => [v, i]));
  const iy = new Map(ys.map((v, i) => [v, i]));
  const W = Math.max(0, xs.length - 1);
  const H = Math.max(0, ys.length - 1);
  const grid = new Uint8Array(W * H);
  for (const r of rs) {
    const a = ix.get(r.x0);
    const b = ix.get(r.x1);
    const c = iy.get(r.y0);
    const d = iy.get(r.y1);
    for (let j = c; j < d; j++) for (let i = a; i < b; i++) grid[j * W + i] = 1;
  }
  const on = (i, j) => i >= 0 && j >= 0 && i < W && j < H && grid[j * W + i] === 1;
  return { xs, ys, W, H, on };
}

/**
 * 并集的边界环：每条有向边的左边是实心 → 外轮廓逆时针（面积 > 0）、洞顺时针（面积 < 0）。
 * 两个格子只在对角相碰的点（夹点）取最左转，环不会自交；共线的点合并掉。
 * @returns {Array<Array<[number, number]>>}
 */
export function unionLoops(rects) {
  const { xs, ys, W, H, on } = cells(rects);
  const out = new Map();
  const add = (a, b) => {
    const k = a[0] * 65536 + a[1];
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(b);
  };
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (!on(i, j)) continue;
      if (!on(i, j - 1)) add([i, j], [i + 1, j]);
      if (!on(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
      if (!on(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
      if (!on(i - 1, j)) add([i, j + 1], [i, j]);
    }
  const res = [];
  const dirOf = (a, b) => [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
  // 起点按顺序取（不依赖 Map 的插入顺序以外的东西）：输出可重复
  const starts = [...out.keys()].sort((a, b) => a - b);
  for (const k0 of starts) {
    while (out.has(k0)) {
      const ends0 = out.get(k0);
      let cur = [Math.floor(k0 / 65536), k0 % 65536];
      let next = ends0.shift();
      if (!ends0.length) out.delete(k0);
      const pts = [cur];
      let d = dirOf(cur, next);
      for (let guard = 0; guard < 1e7; guard++) {
        cur = next;
        const k = cur[0] * 65536 + cur[1];
        // 回到起点 = 这一环闭合（起点是夹点时不能接着走另一环，否则两环连成一个自相接触的环）
        if (k === k0) break;
        const ends = out.get(k);
        if (!ends) break;
        let pick = 0;
        if (ends.length > 1) {
          let best = -2;
          ends.forEach((e, i) => {
            const nd = dirOf(cur, e);
            const cross = d[0] * nd[1] - d[1] * nd[0];
            if (cross > best) {
              best = cross;
              pick = i;
            }
          });
        }
        const nx = ends.splice(pick, 1)[0];
        if (!ends.length) out.delete(k);
        pts.push(cur);
        d = dirOf(cur, nx);
        next = nx;
      }
      const P = pts.map(([i, j]) => [xs[i], ys[j]]);
      const simp = [];
      for (let i = 0; i < P.length; i++) {
        const a = P[(i - 1 + P.length) % P.length];
        const b = P[i];
        const c = P[(i + 1) % P.length];
        const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (cross !== 0) simp.push(b);
      }
      if (simp.length >= 4) res.push(simp);
    }
  }
  return res;
}

/** 有向面积（逆时针 > 0） */
export const area2 = (loop) => loop.reduce((s, p, i) => s + p[0] * loop[(i + 1) % loop.length][1] - loop[(i + 1) % loop.length][0] * p[1], 0) / 2;

/** 奇偶规则：点在所有环围出来的区域里吗 */
export function insideLoops(pt, loops) {
  let inside = false;
  const [x, y] = pt;
  for (const L of loops)
    for (let i = 0, j = L.length - 1; i < L.length; j = i++) {
      const [xi, yi] = L[i];
      const [xj, yj] = L[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}

/** 两个点、绕圆心 c 正好差 90° → 逆时针的 [起角, 止角]（度） */
export function quarter(c, p, q) {
  const ang = (v) => ((Math.round((Math.atan2(v[1] - c[1], v[0] - c[0]) * 180) / Math.PI) % 360) + 360) % 360;
  const a = ang(p);
  const b = ang(q);
  return (b - a + 360) % 360 === 90 ? [a, b] : [b, a];
}

const CJK = /[⺀-鿿豈-﫿＀-￯]/;
/** 文字大概多宽（单行）：中文一个字 = 1.0 字高，其他 = 0.6 字高 */
export function textWidth(s, h) {
  let w = 0;
  for (const ch of String(s)) w += CJK.test(ch) ? 1 : 0.6;
  return w * h;
}

/** 点绕原点转 deg 度（逆时针） */
export function rot([x, y], deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}
