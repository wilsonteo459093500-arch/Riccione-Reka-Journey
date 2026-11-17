// ============================================================
// 卧室：放了衣柜之后还放不放得下床？（纯函数，mm，房间框 / 矩形都是 [x0, y0, x1, y1]，x0 < x1、y0 < y1）
//
// 规则（用户定：先留床位再放衣柜）：
//   · 床头贴一面墙（四面墙轮流试），沿墙每 50 mm 滑
//   · 床尾留 0.6 m 走道；左右至少一边留 0.6 m（另一边可以贴墙）
//   · 床本身不能压到 bedAvoid（衣柜占地 + 柜门前 0.6 m、门口开门的地方）
//   · 走道只要不压到 walkAvoid（衣柜本身）—— 走道可以经过门口、衣柜前面（本来就是走路的地方）
// 床的大小：主卧 1.8 × 2.0，卧室 1.5 × 2.0；房间本来就放不下大床就退一级（主卧 1.5、卧室 1.0）。
// 连最小的床在空房间都放不下 → 不判断（房间框可能读错，别乱拦）。
// ============================================================

export const WALK = 600;          // 床尾 / 床边走道
export const WARDROBE_FRONT = 600; // 衣柜门前要留的开门空间
export const DOOR_SWING = 800;     // 门口往房里留的开门区
export const BED_SIZES = { master: [[1800, 2000], [1500, 2000]], bedroom: [[1500, 2000], [1000, 2000]] };
const STEP = 50;
const EPS = 20; // 贴边 2 cm 内不算压到（AI 的框、贴墙后的柜子都有误差）

export function overlaps(a, b, eps = EPS) {
  return Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > eps && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > eps;
}
const inside = (r, room) => r[0] >= room[0] - 1 && r[1] >= room[1] - 1 && r[2] <= room[2] + 1 && r[3] <= room[3] + 1;
export const normRect = (r) => [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])];

// 床头贴 wall（'top' | 'bottom' | 'left' | 'right'），沿墙位置 s（床的起点）→ { bed, foot, sides:[左, 右] }
function bedAt(room, wall, s, [bw, bl], walk) {
  if (wall === 'top' || wall === 'bottom') {
    const y0 = wall === 'top' ? room[1] : room[3] - bl;
    const bed = [s, y0, s + bw, y0 + bl];
    const foot = wall === 'top' ? [s, bed[3], s + bw, bed[3] + walk] : [s, bed[1] - walk, s + bw, bed[1]];
    return { bed, foot, sides: [[s - walk, bed[1], s, bed[3]], [bed[2], bed[1], bed[2] + walk, bed[3]]] };
  }
  const x0 = wall === 'left' ? room[0] : room[2] - bl;
  const bed = [x0, s, x0 + bl, s + bw];
  const foot = wall === 'left' ? [bed[2], s, bed[2] + walk, s + bw] : [bed[0] - walk, s, bed[0], s + bw];
  return { bed, foot, sides: [[bed[0], s - walk, bed[2], s], [bed[0], bed[3], bed[2], bed[3] + walk]] };
}

// 两个矩形之间的空隙（重叠 = 0）
const gap = (a, b) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));

// 放得下 → { bed:[…], wall }；放不下 → null
//   放得下的位置里挑最像样的：两边都有走道 > 离衣柜 / 门远一点（最多算 1.2 m）> 在墙中间
//   avoid：{ bedAvoid:[矩形…], walkAvoid:[矩形…] }（也可以直接给一个阵列 = 两样都不能压）
export function findBed(room, avoid = [], size = [1500, 2000], { walk = WALK } = {}) {
  const r = normRect(room);
  const bedAvoid = Array.isArray(avoid) ? avoid : avoid.bedAvoid || [];
  const walkAvoid = Array.isArray(avoid) ? avoid : avoid.walkAvoid || [];
  const freeBed = (x) => inside(x, r) && !bedAvoid.some((b) => overlaps(x, b));
  const freeWalk = (x) => inside(x, r) && !walkAvoid.some((b) => overlaps(x, b));
  let best = null;
  for (const wall of ['top', 'bottom', 'left', 'right']) {
    const along = wall === 'top' || wall === 'bottom' ? [r[0], r[2]] : [r[1], r[3]];
    const mid = (along[0] + along[1]) / 2;
    for (let s = along[0]; s + size[0] <= along[1] + 1; s += STEP) {
      const p = bedAt(r, wall, s, size, walk);
      if (!(freeBed(p.bed) && freeWalk(p.foot) && p.sides.some(freeWalk))) continue;
      const both = p.sides.every(freeWalk) ? 1 : 0;
      const room = bedAvoid.length ? Math.min(1200, ...bedAvoid.map((b) => gap(p.bed, b))) : 1200;
      const score = both * 1e4 + room - Math.abs(s + size[0] / 2 - mid) / 10;
      if (!best || score > best.score) best = { score, bed: p.bed.map(Math.round), wall };
    }
  }
  return best && { bed: best.bed, wall: best.wall };
}

// 这间房要用多大的床：空房间（只扣门口）放得下的最大那张；都放不下 → null（不判断）
export function bedSizeFor(room, { master = false, doors = [] } = {}) {
  return (master ? BED_SIZES.master : BED_SIZES.bedroom).find((sz) => findBed(room, { bedAvoid: doors, walkAvoid: [] }, sz)) || null;
}

// 衣柜占地（地上那块）+ 柜门前的开门空间。front = 柜门朝的方向（[0,1] 朝下…）
export function wardrobeZone(rect, front, depth = WARDROBE_FRONT) {
  const [x0, y0, x1, y1] = normRect(rect);
  if (front?.[1] > 0) return [x0, y0, x1, y1 + depth];
  if (front?.[1] < 0) return [x0, y0 - depth, x1, y1];
  if (front?.[0] > 0) return [x0, y0, x1 + depth, y1];
  if (front?.[0] < 0) return [x0 - depth, y0, x1, y1];
  return [x0, y0, x1, y1];
}

// 门洞线段（mm）→ 房里的开门区：沿门洞宽、往房间中心那边 DOOR_SWING 深；离房间墙太远（不是这间房的门）→ null
export function doorZone(room, seg, swing = DOOR_SWING) {
  const r = normRect(room);
  const [ax, ay, bx, by] = seg;
  const horiz = Math.abs(bx - ax) >= Math.abs(by - ay);
  const near = 400;
  if (horiz) {
    const y = (ay + by) / 2, xa = Math.max(r[0], Math.min(ax, bx)), xb = Math.min(r[2], Math.max(ax, bx));
    if (xb - xa < 200) return null;
    if (Math.abs(y - r[1]) <= near) return [xa, r[1], xb, r[1] + swing];
    if (Math.abs(y - r[3]) <= near) return [xa, r[3] - swing, xb, r[3]];
    return null;
  }
  const x = (ax + bx) / 2, ya = Math.max(r[1], Math.min(ay, by)), yb = Math.min(r[3], Math.max(ay, by));
  if (yb - ya < 200) return null;
  if (Math.abs(x - r[0]) <= near) return [r[0], ya, r[0] + swing, yb];
  if (Math.abs(x - r[2]) <= near) return [r[2] - swing, ya, r[2], yb];
  return null;
}

// 窗段（mm）→ 贴着墙的一条带（±250），用来看衣柜是不是挡到窗
export function windowBand(seg, half = 250) {
  const [ax, ay, bx, by] = seg;
  return Math.abs(bx - ax) >= Math.abs(by - ay)
    ? [Math.min(ax, bx), (ay + by) / 2 - half, Math.max(ax, bx), (ay + by) / 2 + half]
    : [(ax + bx) / 2 - half, Math.min(ay, by), (ax + bx) / 2 + half, Math.max(ay, by)];
}
