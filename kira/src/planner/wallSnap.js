// ============================================================
// AI 识图：把 AI 给的墙线段贴到图上真正的墙（纯函数，Node 测试）
//
// AI 看图给的坐标常常差十几 px（压在墙线上、跑到墙外）。这里在送去 AI 的那张图上找墙：
//   dark = { w, h, data: Uint8Array(w*h) }，1 = 深色像素（墙 / 字 / 线），由浏览器用同一个 canvas 算（darkGrid）
//   1. 线段接近水平 / 垂直（< 10°）先扶正；斜的不处理
//   2. 在线段两侧找一条平行、够长的深色带（墙）——离 AI 线最近的那条
//   3. 把线段移到这条墙「朝房间中心那一面」的边上
//   4. 两端：碰到垂直的墙（房间角落）就停；衣柜 / 鞋柜 / 电视遇到门口（墙断开）也停
// 找不到墙 → 原样回传、snapped:false（画面注明「位置请确认」）
// 坐标一律是送去那张图的 px：[x0, y0, x1, y1]；roomBox = [x0, y0, x1, y1] 或 null
// ============================================================

// 比这暗的算「深色」（黑 / 深灰的墙）；有颜色的墙（发展商图常用浅绿、浅蓝）颜色够浓也算；浅灰的填色、斜线不算
const DARK_LUMA = 185;
const COLOUR_LUMA = 215, COLOUR_SAT = 40;

// RGBA 像素（canvas getImageData）→ 深色格
export function darkGrid(rgba, w, h, luma = DARK_LUMA) {
  const data = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    const a = rgba[j + 3] / 255;
    // 透明当白
    const r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
    const y = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
    const sat = (Math.max(r, g, b) - Math.min(r, g, b)) * a;
    data[i] = y < luma || (sat > COLOUR_SAT && y < COLOUR_LUMA) ? 1 : 0;
  }
  return { w, h, data };
}

const at = (g, x, y) => (x >= 0 && y >= 0 && x < g.w && y < g.h ? g.data[(y | 0) * g.w + (x | 0)] : 0);
// 横的：第 y 行、x 从 a 到 b 的深色比例（竖的：把 x / y 对调）
const coverage = (g, horiz, line, a, b) => {
  let n = 0, d = 0;
  for (let t = Math.ceil(a); t <= Math.floor(b); t++) { n++; d += horiz ? at(g, t, line) : at(g, line, t); }
  return n ? d / n : 0;
};
const px = (g, horiz, along, line) => (horiz ? at(g, along, line) : at(g, line, along));

// → { seg, snapped, moved, reason? }
export function snapSegment(dark, seg, roomBox = null, { cutGaps = true, minCover = 0.55 } = {}) {
  const s = (Array.isArray(seg) ? seg : []).map(Number);
  if (!dark || !dark.data || s.length !== 4 || !s.every(Number.isFinite)) return { seg, snapped: false, moved: 0, reason: 'input' };
  const [x0, y0, x1, y1] = s;
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (len < 4) return { seg, snapped: false, moved: 0, reason: 'short' };
  const ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI) % 180;
  const horiz = ang < 10 || ang > 170;
  const vert = Math.abs(ang - 90) < 10;
  if (!horiz && !vert) return { seg, snapped: false, moved: 0, reason: 'slanted' };
  // 扶正：横的用平均 y，竖的用平均 x；along = 沿墙方向的坐标
  const line0 = horiz ? (y0 + y1) / 2 : (x0 + x1) / 2;
  const a0 = Math.min(horiz ? x0 : y0, horiz ? x1 : y1), b0 = Math.max(horiz ? x0 : y0, horiz ? x1 : y1);
  const box = Array.isArray(roomBox) && roomBox.length === 4 && roomBox.every((v) => Number.isFinite(Number(v)))
    ? [Math.min(roomBox[0], roomBox[2]), Math.min(roomBox[1], roomBox[3]), Math.max(roomBox[0], roomBox[2]), Math.max(roomBox[1], roomBox[3])].map(Number) : null;
  const roomShort = box ? Math.min(box[2] - box[0], box[3] - box[1]) : len;
  const R = Math.round(Math.min(80, Math.max(12, roomShort * 0.15)));
  const maxLine = horiz ? dark.h - 1 : dark.w - 1;

  // 找墙：线段中间 80% 的深色比例 ≥ minCover 的连续几行 = 一条墙带
  const ia = a0 + (b0 - a0) * 0.1, ib = b0 - (b0 - a0) * 0.1;
  const bands = [];
  let cur = null;
  for (let L = Math.max(0, Math.round(line0 - R)); L <= Math.min(maxLine, Math.round(line0 + R)); L++) {
    const on = coverage(dark, horiz, L, ia, ib) >= minCover;
    if (on) { if (cur && cur.end === L - 1) cur.end = L; else { cur = { start: L, end: L }; bands.push(cur); } }
  }
  // 墙带太厚（一大块深色，例如黑色填满的区域）不算
  const walls = bands.filter((b) => b.end - b.start + 1 <= Math.max(6, R));
  if (!walls.length) return { seg: s, snapped: false, moved: 0, reason: 'no_wall' };
  const mid = (b) => (b.start + b.end) / 2;
  walls.sort((p, q) => Math.abs(mid(p) - line0) - Math.abs(mid(q) - line0));
  let wall = walls[0];

  // 房间在哪一边：有房间框用框的中心；没有就看 AI 的线在墙的哪一边（AI 给的是「房间里面那一面」）
  const roomSide = box
    ? ((horiz ? (box[1] + box[3]) / 2 : (box[0] + box[2]) / 2) >= mid(wall) ? 1 : -1)
    : (line0 >= mid(wall) ? 1 : -1);
  // 双线画法的墙（两条细线中间空白）：房间那一侧 12 px 内还有一条细线 → 用里面那条（实心的厚墙不算）
  while (wall.end - wall.start + 1 <= 2) {
    const w = wall;
    const next = walls.filter((b) => (roomSide > 0 ? b.start > w.end && b.start - w.end <= 12 : b.end < w.start && w.start - b.end <= 12))
      .sort((p, q) => (roomSide > 0 ? p.start - q.start : q.end - p.end))[0];
    if (!next) break;
    wall = next;
  }
  const face = roomSide > 0 ? wall.end + 1 : wall.start - 1;
  const inner = face + roomSide * 2, inner2 = face + roomSide * 6; // 墙面往房间里 2 / 6 px：拿来找垂直的墙（角落）

  // 两端：从线段中点往两边走，碰到垂直的墙就停；门口（墙带上一段空白）也停
  const center = Math.round((a0 + b0) / 2);
  const gapMax = Math.max(6, Math.round(len * 0.08));
  const wallLine = Math.round(mid(wall));
  const minPerp = Math.max(2, Math.round((wall.end - wall.start + 1) * 0.6));
  const walk = (dir, limit) => {
    let t = center, gap = 0;
    while (dir > 0 ? t < limit : t > limit) {
      const n = t + dir;
      // 垂直的墙要够厚（≥ 这道墙厚度的 6 成）：家具的细线（靠墙的床、柜）不算角落
      const perp = (u) => px(dark, horiz, u, inner) && px(dark, horiz, u, inner2);
      if (perp(n)) {
        let th = 0;
        while (th < minPerp && perp(n + dir * th)) th++;
        if (th >= minPerp) return { t, hit: 'corner' };
      }
      if (cutGaps) {
        const onWall = px(dark, horiz, n, wallLine) || px(dark, horiz, n, wall.start) || px(dark, horiz, n, wall.end);
        gap = onWall ? 0 : gap + 1;
        if (gap >= gapMax) return { t: n - dir * gap, hit: 'gap' };
      }
      t = n;
    }
    return { t: limit, hit: null };
  };
  // 往外最多多走一点（AI 给短了也不拉长：只裁不加）
  const lo = walk(-1, Math.round(a0)), hi = walk(1, Math.round(b0));
  let a = lo.t, b = hi.t;
  if (box) { a = Math.max(a, horiz ? box[0] : box[1]); b = Math.min(b, horiz ? box[2] : box[3]); }
  if (b - a < (b0 - a0) * 0.4) return { seg: s, snapped: false, moved: 0, reason: 'too_short' };
  const out = horiz ? [a, face, b, face] : [face, a, face, b];
  // 维持 AI 原本的方向（厨房 L / U 的顺序要用）
  const fwd = horiz ? x1 >= x0 : y1 >= y0;
  const segOut = fwd ? out : [out[2], out[3], out[0], out[1]];
  return { seg: segOut, snapped: true, moved: Math.abs(face - line0), trimmed: [lo.hit, hi.hit] };
}

// ---------------- 去边：手机截图的黑边、PDF / 扫描的白边 ----------------
// gray = 灰阶 Uint8Array(w*h)（小张的分析图就好）→ [x0, y0, x1, y1]（含），整张都是边就回整张
// 一行 / 一列「几乎全是同一个很黑或很白的颜色」就算边，从四边往里裁
export function trimBorders(gray, w, h, { tol = 18, frac = 0.985 } = {}) {
  const plain = (get, n) => {
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) hist[get(i)]++;
    let acc = 0, med = 0;
    for (; med < 256; med++) { acc += hist[med]; if (acc * 2 >= n) break; }
    if (!(med < 50 || med > 205)) return false;
    let near = 0;
    for (let v = Math.max(0, med - tol); v <= Math.min(255, med + tol); v++) near += hist[v];
    return near >= n * frac;
  };
  let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1;
  // 只看还没裁掉的那一段（黑边 + 白纸并排时，第二轮才裁得到白纸的上下边）
  const row = (y) => plain((i) => gray[y * w + x0 + i], x1 - x0 + 1);
  const col = (x) => plain((i) => gray[(y0 + i) * w + x], y1 - y0 + 1);
  for (let pass = 0; pass < 3; pass++) {
    const before = `${x0},${y0},${x1},${y1}`;
    while (y0 < y1 && row(y0)) y0++;
    while (y1 > y0 && row(y1)) y1--;
    while (x0 < x1 && col(x0)) x0++;
    while (x1 > x0 && col(x1)) x1--;
    if (before === `${x0},${y0},${x1},${y1}`) break;
  }
  if (x1 - x0 < w * 0.2 || y1 - y0 < h * 0.2) return [0, 0, w - 1, h - 1];
  return [x0, y0, x1, y1];
}
