// 纯几何 helper —— 所有坐标都是「图片像素坐标」，与缩放/平移无关。

export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export function segments(points = []) {
  const out = [];
  for (let i = 1; i < points.length; i++) out.push({ a: points[i - 1], b: points[i], len: dist(points[i - 1], points[i]) });
  return out;
}

export function pathLength(points = []) {
  return segments(points).reduce((s, seg) => s + seg.len, 0);
}

export const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * 正交吸附：户型图基本都是横平竖直的。
 * 只有当这一段与最近的坐标轴夹角 ≤ tolDeg 时才拉直，斜墙照样能量。
 */
export function orthoSnap(anchor, p, tolDeg = 15) {
  const dx = p.x - anchor.x;
  const dy = p.y - anchor.y;
  if (!dx && !dy) return p;
  const angle = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI); // 0..180
  const offAxis = Math.min(angle, Math.abs(angle - 90), Math.abs(angle - 180));
  if (offAxis > tolDeg) return p;
  return Math.abs(dx) >= Math.abs(dy) ? { x: p.x, y: anchor.y } : { x: anchor.x, y: p.y };
}

/** 端点吸附：靠近已画过的点就咬上去，L 型转角不会有缝 */
export function snapToVertices(p, vertices, tolPx) {
  let best = null;
  let bestD = tolPx;
  for (const v of vertices) {
    const d = dist(p, v);
    if (d <= bestD) {
      bestD = d;
      best = v;
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** 点到线段的距离，用于点选已有测量 */
export function distToSegment(p, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

export function distToPath(p, points = []) {
  if (points.length === 1) return dist(p, points[0]);
  let best = Infinity;
  for (const s of segments(points)) best = Math.min(best, distToSegment(p, s.a, s.b));
  return best;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
