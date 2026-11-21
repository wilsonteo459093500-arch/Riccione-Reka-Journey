// 走进去 · 门 —— docs/walk/SPEC.md §3
//
// 鸟瞰里的门扇是整层合并的一块（house.js，开 75° 不动）。走进去时把它藏起来（userData.doorLeaves），
// 用 house.doorLeaf 给每一扇门另建一扇能开关的门：一开始关着；人走近（1.6m 以内）或接下来 2m 的路要穿过它 → 开到 90°；
// 人走远（2.2m 以外）满 3 秒 → 关上。开 / 关大约 0.45 秒（缓入缓出）。
// 开向哪一边（镜头不能穿过门板）：开好的门扇是从门轴垂直伸出去的一块板，导航不知道它在哪（门洞整个算走得过去），
// 所以两边都试：门扇离眼睛、离这一层接下来的整段路都要 ≥ 0.3m（半径 + 近裁剪面），转过去的时候也不能扫到人（leafRoom）；
// 两边都让得开 → 路要穿过这扇门就开进路走过去的那一边（走回来也不挡），不穿过 → 离人远的那一边；
// 只有一边让得开 → 那一边；都不行（户型本身：门扇 90° 怎么开都碰路）→ 让得多的那一边。没有路（摇杆、open / openAll）→ 离人远的那一边。
// 开着的门：接下来的路要撞上它、另一边让得开、转过去扫不到人 → 换到另一边（客人点了别的地方、路变了）；
//   没有路、人贴着门扇（摇杆推着它）也一样：门扇转到离人远的那一边（转过去会扫到人就不动）。
// 门轴放在哪一头：关着的门要开（有路）→ 门轴在门洞 a 端 / b 端 × 开向哪一边，四个里挑：现在的门轴（一开始 = a 端，和鸟瞰一样）
//   有一边让得开 → 不换门轴；两边都让不开 → 换到另一头再挑一次，让得开（或让得多）就换过去。关着的门扇两头一样（就是门洞里那一块），
//   换门轴看不出来（只有把手换到另一头）；开着 / 在动的门不直接换门轴。b 端的门扇 = 同一块门扇镜像过去（pivot 挪到 b 端、子网格的 x 取反）。
//   开着的门接下来的路要撞上它、另一边也让不开 → 先关上（rehang）、关好换门轴、再照「关着的门要开」挑（关回去、再开过去都不能扫到人）。
// 楼梯上（眼睛在上下、控制器不给路）先不开，下了楼梯有了路再挑边。
// 哪些门有门扇和 house.js 一模一样（doorList）：门洞是 door、宽 ≤ 1.3m、不在「只有一边是室外」的墙上（阳台栏杆 / 车廊矮墙）。
// 落地趟门：人在这一层、离趟门 1.2m 以内 → 那一套墙的玻璃先藏起来（v1），走开再放回去。
// 角度：门扇的轴 = 门洞 a 端（house.js 的 pivot；dir = +1）或 b 端（dir = −1）；s = 开了几分之几个 90°，带符号 = 开向墙的哪一边（+ = pos 那边）。
// 摇杆走路把开着 / 在动的门扇当成一块薄墙（clearOf，controller.slideMove）。

import { doorLeaf } from '../engine/house.js';
import { ROOM_TYPES } from '../plan/model.js';

const OPEN_R = 1.6; // 走到离门这么近就开
const CLOSE_R = 2.2; // 走到这么远以外……
const CLOSE_AFTER = 3; // ……满这么多秒才关
const AHEAD = 2; // 前面这么长的路要穿过门 → 先开
const SWING = 0.45; // 开 / 关一次的时间（秒）
const GLASS_R = 1.2; // 离落地趟门这么近 → 玻璃先藏起来
const LOW_SILL = 0.3; // 和 nav.js 一样：窗台 ≤ 这个高度的趟门走得过去
const LEVEL = 0.5; // 眼睛比这一层的地面高过这么多 → 算在这一层
const WIDE = 1.3; // 和 house.doorLeaf 一样：更宽的门洞不放门扇
const CLEAR = 0.3; // 开好的门扇离眼睛 / 这段路至少这么远（半径 0.22 + 近裁剪面）
const SWEEP_CLEAR = 0.25; // 门扇转过去的时候，离那时人可能在的地方至少这么远
const SWEEP_N = 24; // 转过去的那一会儿分成几小段（每段门扇最多转 ~11°、人最多走 ~5cm）
const STEP = 0.05; // 那一段路上每隔这么远取一个点（再多取一个点：两个点之间的地方也算到）
const CLIMB = 0.1; // 眼睛上下动得比这个快（米 / 秒）= 在走楼梯……
const CLIMB_MAX = 2; // ……比这个快 = 一下子挪到别的楼层，不算
const CLIMB_HOLD = 0.5; // 楼梯走完（最后一小段是平的）这么多秒以内还算在楼梯上
const FLIP_GAIN = 0.1; // 两边都让不开：另一边多让出这么多才换过去（不来回换）
const WALK_V = 1.3; // 和 controller.js 的 SPEED / ACCEL 一样：人最快走多快、起步加速多快（算门扇转过去的时候人最远走到哪）
const WALK_A = 2.6;
const HALF_PI = Math.PI / 2;

const outdoor = (r) => !!r && !!ROOM_TYPES[r.type]?.outdoor;
/** house.js：只有一边有房间、那一边是室外 → 画成栏杆 / 矮墙 / 门柱，墙上的开口不管 */
const outdoorSide = (w) => (outdoor(w.neg) && !w.pos) || (outdoor(w.pos) && !w.neg);
const smooth = (x) => x * x * (3 - 2 * x);

/**
 * house.js 给哪些门放门扇：[{ id, fi, opening, wall, piece, hinge: {x, z}, dir, axis, c, a, b, width, closedAngle, into }]
 * hinge = 门轴（平面图米，z = 平面 y）；dir = 门轴在哪一头（+1 = a 端，house.js 的门扇都是；−1 = b 端）；
 * closedAngle = 关着时 pivot 的 rotation.y；into = house.js 鸟瞰里开向哪边（±1）。
 */
export function doorList(navData) {
  const out = [];
  (navData?.floors || []).forEach((f, fi) => {
    for (const wall of f.walls || []) {
      if (outdoorSide(wall)) continue;
      wall.pieces.forEach((piece, k) => {
        if (piece.kind !== 'door') return;
        const width = piece.b - piece.a;
        if (width > WIDE) return;
        const along = piece.a + 0.01;
        out.push({
          id: `${fi}/${wall.id}/${k}`,
          fi,
          opening: piece.openingId ?? null,
          wall,
          piece,
          hinge: wall.axis === 'x' ? { x: along, z: wall.c } : { x: wall.c, z: along },
          dir: 1,
          axis: wall.axis,
          c: wall.c,
          a: piece.a,
          b: piece.b,
          width,
          closedAngle: wall.axis === 'x' ? 0 : -HALF_PI,
          into: wall.pos ? 1 : -1,
        });
      });
    }
  });
  return out;
}

/** 开了 s（带符号的几分之几个 90°）时 pivot 的 rotation.y —— a 端的门轴和 house.doorLeaf 的 75° 同一个算法；b 端（镜像的门扇）反过来转 */
export function leafAngle(d, s) {
  return d.closedAngle + (d.axis === 'x' ? -1 : 1) * (d.dir || 1) * s * HALF_PI;
}

/** 门轴挪到 dir 那一头（+1 = a 端、−1 = b 端）：只改 d.dir、d.hinge（原地改，不建新对象）；门扇的 pivot 由 createDoors 摆 */
export function hingeTo(d, dir) {
  d.dir = dir;
  const along = dir > 0 ? d.a + 0.01 : d.b - 0.01;
  d.hinge.x = d.axis === 'x' ? along : d.c;
  d.hinge.z = d.axis === 'x' ? d.c : along;
  return d;
}

/** 点 p（{x, z}）在墙线的哪一边：+1 = pos、−1 = neg、0 = 正好在线上 */
export function sideOf(d, p) {
  const v = (d.axis === 'x' ? p.z : p.x) - d.c;
  return v > 1e-6 ? 1 : v < -1e-6 ? -1 : 0;
}

/** 点到门洞（墙线上 a…b 那一段）的平面距离 */
export function doorDist(d, p) {
  const u = d.axis === 'x' ? p.x : p.z;
  const v = (d.axis === 'x' ? p.z : p.x) - d.c;
  const du = Math.max(d.a - u, 0, u - d.b);
  return Math.hypot(du, v);
}

/** 从 p0 出发、沿着 pts 走前面 len 米，第一次穿过门洞是走到哪一边去：+1 = pos 那边、−1 = neg 那边；不穿过 → 0 */
export function crossing(d, p0, pts, len = AHEAD) {
  if (!pts?.length) return 0;
  let left = len;
  let P = p0;
  for (let i = 0; i < pts.length && left > 0; i++) {
    let Q = pts[i];
    const seg = Math.hypot(Q.x - P.x, Q.z - P.z);
    if (seg < 1e-9) continue;
    if (seg > left) {
      const k = left / seg;
      Q = { x: P.x + (Q.x - P.x) * k, z: P.z + (Q.z - P.z) * k };
    }
    left -= seg;
    const vp = (d.axis === 'x' ? P.z : P.x) - d.c;
    const vq = (d.axis === 'x' ? Q.z : Q.x) - d.c;
    if (vp * vq <= 0 && (vp !== 0 || vq !== 0)) {
      const up = d.axis === 'x' ? P.x : P.z;
      const uq = d.axis === 'x' ? Q.x : Q.z;
      const u = vp === vq ? up : up + ((uq - up) * vp) / (vp - vq);
      if (u >= d.a - 0.05 && u <= d.b + 0.05) return vq > 0 || (vq === 0 && vp < 0) ? 1 : -1;
    }
    P = Q;
  }
  return 0;
}

/** 从 p0 出发、沿着 pts 走前面 len 米，会不会穿过门洞 */
export function pathCrosses(d, p0, pts, len = AHEAD) {
  return crossing(d, p0, pts, len) !== 0;
}

/** 点 (px, pz) 到线段 (ax, az)–(bx, bz) 的平面距离 */
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 1e-12 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}

const cross = (ox, oz, ux, uz, vx, vz) => (ux - ox) * (vz - oz) - (uz - oz) * (vx - ox);
/** 两条线段 p–q（{x, z}）、(ax, az)–(bx, bz) 的平面距离（相交 = 0） */
export function segSeg(p, q, ax, az, bx, bz) {
  const d1 = cross(p.x, p.z, q.x, q.z, ax, az);
  const d2 = cross(p.x, p.z, q.x, q.z, bx, bz);
  const d3 = cross(ax, az, bx, bz, p.x, p.z);
  const d4 = cross(ax, az, bx, bz, q.x, q.z);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(segDist(p.x, p.z, ax, az, bx, bz), segDist(q.x, q.z, ax, az, bx, bz), segDist(ax, az, p.x, p.z, q.x, q.z), segDist(bx, bz, p.x, p.z, q.x, q.z));
}

/**
 * 门扇转到 phi（带符号的弧度：+ = 开向 pos 那边，0 = 关着，±π/2 = 开好）时，从门轴往外 r0…r1 米那一截 → out [ax, az, bx, bz]（平面米）。
 * 门扇长 width − 0.02（house.doorLeaf）；关着的时候从门轴指向门洞另一头（a 端的门轴往 +、b 端往 −）。
 */
export function leafSeg(d, phi, r0 = 0, r1 = d.width - 0.02, out = [0, 0, 0, 0]) {
  const cu = Math.cos(phi) * (d.dir || 1);
  const sv = Math.sin(phi);
  const { x, z } = d.hinge;
  if (d.axis === 'x') {
    out[0] = x + cu * r0;
    out[1] = z + sv * r0;
    out[2] = x + cu * r1;
    out[3] = z + sv * r1;
  } else {
    out[0] = x + sv * r0;
    out[1] = z + cu * r0;
    out[2] = x + sv * r1;
    out[3] = z + cu * r1;
  }
  return out;
}

/** 开了 s（带符号的几分之几个 90°）时门扇的角度（带符号的弧度，和 pose 一样缓入缓出） */
const phiOf = (s) => Math.sign(s) * smooth(Math.abs(s)) * HALF_PI;

/** 从现在起 t 秒，人沿着路最多走出多远（现在的速度 v0，按 WALK_A 加速到 WALK_V） */
export function reach(v0, t) {
  const v = Math.min(Math.max(v0 || 0, 0), WALK_V);
  const t1 = (WALK_V - v) / WALK_A;
  if (t <= t1) return v * t + 0.5 * WALK_A * t * t;
  return v * t1 + 0.5 * WALK_A * t1 * t1 + WALK_V * (t - t1);
}

/** 从 p0 出发沿 pts 走 len 米那一段折线（含 p0）→ 写进 out（{ x, z, d }，d = 从 p0 走了多远；out 里原来的点对象接着用），返回点数 */
export function clipPath(p0, pts, len, out = []) {
  const put = (k, x, z, d) => {
    const o = out[k] || (out[k] = { x: 0, z: 0, d: 0 });
    o.x = x;
    o.z = z;
    o.d = d;
    return o;
  };
  let P = put(0, p0.x, p0.z, 0);
  let n = 1;
  for (let i = 0; i < (pts?.length || 0) && P.d < len - 1e-9; i++) {
    const Q = pts[i];
    const seg = Math.hypot(Q.x - P.x, Q.z - P.z);
    if (seg < 1e-9) continue;
    const k = Math.min(1, (len - P.d) / seg);
    P = put(n++, P.x + (Q.x - P.x) * k, P.z + (Q.z - P.z) * k, P.d + seg * k);
  }
  return n;
}

/** 线段 s（[ax, az, bx, bz]）离折线 route（n 个点）开头 upto 米那一段多远 */
function routeDist(route, n, upto, s) {
  let m = segDist(route[0].x, route[0].z, s[0], s[1], s[2], s[3]);
  for (let i = 1; i < n && route[i - 1].d < upto; i++) {
    const P = route[i - 1];
    let Q = route[i];
    if (Q.d > upto) {
      const k = (upto - P.d) / (Q.d - P.d);
      Q = _q;
      Q.x = P.x + (route[i].x - P.x) * k;
      Q.z = P.z + (route[i].z - P.z) * k;
    }
    m = Math.min(m, segSeg(P, Q, s[0], s[1], s[2], s[3]));
  }
  return m;
}
const _q = { x: 0, z: 0 };
const _seg = [0, 0, 0, 0];

/** 点 (px, pz) 到门扇从 phiA 转到 phiB 扫过的那一块（门轴为圆心、半径 r0…r1、两个角度之间的扇环）多远 */
export function sweptDist(d, px, pz, phiA, phiB, r0 = 0, r1 = d.width - 0.02) {
  const u = (d.axis === 'x' ? px - d.hinge.x : pz - d.hinge.z) * (d.dir || 1);
  const v = d.axis === 'x' ? pz - d.hinge.z : px - d.hinge.x;
  const th = Math.atan2(v, u);
  if (th >= Math.min(phiA, phiB) && th <= Math.max(phiA, phiB)) {
    const r = Math.hypot(u, v);
    return r < r0 ? r0 - r : r > r1 ? r - r1 : 0;
  }
  const A = leafSeg(d, phiA, r0, r1, _seg);
  const da = segDist(px, pz, A[0], A[1], A[2], A[3]);
  const B = leafSeg(d, phiB, r0, r1, _seg);
  return Math.min(da, segDist(px, pz, B[0], B[1], B[2], B[3]));
}

/** 折线 route（n 个点）开头 upto 米以内、每 step 米一个点（含起点；路短于 upto 就到终点为止）→ out（{ x, z, d }，out 自己的对象），返回点数 */
function sampleRoute(route, n, upto, step, out) {
  const put = (k, x, z, d) => {
    const o = out[k] || (out[k] = { x: 0, z: 0, d: 0 });
    o.x = x;
    o.z = z;
    o.d = d;
  };
  put(0, route[0].x, route[0].z, 0);
  let k = 1;
  let i = 1;
  for (let d = step; d <= upto + 1e-9; d += step) {
    while (i < n && route[i].d < d) i++;
    if (i >= n) {
      const E = route[n - 1];
      if (E.d > out[k - 1].d + 1e-9) put(k++, E.x, E.z, E.d);
      break;
    }
    const P = route[i - 1];
    const Q = route[i];
    const t = (d - P.d) / (Q.d - P.d || 1);
    put(k++, P.x + (Q.x - P.x) * t, P.z + (Q.z - P.z) * t, d);
  }
  return k;
}
const _smp = [];

/** 门扇（伸出墙面的那一截，r0…len）现在（开了 s0）离眼睛（route[0]）多远 */
function eyeDist(L, s0, route, r0, len) {
  const now = leafSeg(L, phiOf(s0), r0, len, _seg);
  return segDist(route[0].x, route[0].z, now[0], now[1], now[2], now[3]);
}

/**
 * 门扇从 s0 转到 s1（t0 秒以后才开始转）会不会扫到人：把这一会儿分成 SWEEP_N 小段，每一小段门扇扫过的扇环 ↔ 到那时人最远走得到的
 * 那一段路（v0 起步、按 WALK_A 加速；人也可能停着不动，所以从眼睛算起）上每 STEP 一个点；扫过去比 d0（门扇现在离眼睛）还近、
 * 近过 SWEEP_CLEAR → 最近的那个距离；扫不到 → Infinity
 */
function sweepRoom(L, s0, s1, t0, route, n, v0, d0, r0, len) {
  if (s0 === s1) return Infinity;
  const T = Math.abs(s1 - s0) * SWING;
  const m = sampleRoute(route, n, reach(v0, t0 + T) + STEP, STEP, _smp);
  let best = Infinity;
  let prev = phiOf(s0);
  for (let k = 1; k <= SWEEP_N; k++) {
    const f = k / SWEEP_N;
    const phi = phiOf(s0 + (s1 - s0) * f);
    const upto = reach(v0, t0 + T * f) + STEP;
    for (let j = 0; j < m && _smp[j].d <= upto + 1e-9; j++) {
      const d = sweptDist(L, _smp[j].x, _smp[j].z, prev, phi, r0, len);
      if (d < SWEEP_CLEAR && d < d0 - 0.02 && d < best) best = d;
    }
    prev = phi;
  }
  return best;
}

/**
 * 门扇开向 side（±1）那一边，要「让」多远（米），越大越好：
 *  · 开好的门扇离眼睛 + 这一层接下来的路（route，clipPath 出来的 n 个点）多远；
 *  · 从现在的样子（开了 s0，默认 L.s）转过去（t0 秒以后才开始转）扫得到人的话（sweepRoom），算进来。
 * 门扇只算伸出墙面（离墙线 t/2）以外的那一截：门洞里贴着门框的那一截和门框齐平，导航本来就离门框一个半径。
 */
export function leafRoom(L, side, route, n, v0 = WALK_V, s0 = L.s || 0, t0 = 0) {
  const len = L.width - 0.02;
  const r0 = Math.min(len, (L.wall?.t || 0) / 2);
  const best = routeDist(route, n, Infinity, leafSeg(L, side * HALF_PI, r0, len, _seg));
  if (s0 === side) return best;
  return Math.min(best, sweepRoom(L, s0, side, t0, route, n, v0, eyeDist(L, s0, route, r0, len), r0, len));
}

/**
 * 开着的门两边都让不开：先关上、门轴换到另一头、再开（prefer 那一边，让不开就另一边）—— 要让多远：
 * 关回去的时候扫不扫得到人（比现在离眼睛还近）、换了门轴开过去（关好以后才开始转）的那一下 + 开好的门扇离路多远，取小的。
 */
export function rehangRoom(L, prefer, route, n, v0 = WALK_V) {
  const len = L.width - 0.02;
  const r0 = Math.min(len, (L.wall?.t || 0) / 2);
  const s0 = L.s || 0;
  const shut = sweepRoom(L, s0, 0, 0, route, n, v0, eyeDist(L, s0, route, r0, len), r0, len);
  if (shut < CLEAR) return shut;
  const d = L.dir || 1;
  const t0 = Math.abs(s0) * SWING;
  hingeTo(L, -d);
  let room = leafRoom(L, prefer, route, n, v0, 0, t0);
  if (room < CLEAR) room = Math.max(room, leafRoom(L, -prefer, route, n, v0, 0, t0));
  hingeTo(L, d);
  return Math.min(shut, room);
}

let _room = 0; // pickSide 挑的那一边让多远（pickLeaf 用）
/** 要开的门开向哪一边（±1）：prefer（路走过去的那一边 / 离人远的那一边）让得开 → prefer；另一边让得开 → 另一边；都不行 → 让得多的那一边 */
export function pickSide(L, prefer, route, n, v0) {
  const a = leafRoom(L, prefer, route, n, v0);
  if (a >= CLEAR) {
    _room = a;
    return prefer;
  }
  const b = leafRoom(L, -prefer, route, n, v0);
  const flip = b >= CLEAR || b > a + 0.02;
  _room = flip ? b : a;
  return flip ? -prefer : prefer;
}

const _pick = { dir: 1, side: 1 };
/**
 * 关着的门要开（有路）：门轴在哪一头（dir）× 开向哪一边（side），四个里挑 → out { dir, side }（L 本身不变）。
 * 现在的门轴 pickSide 挑出来的那一边让得开 → 不换门轴；两边都让不开 → 另一头的门轴再 pickSide 一次，让得开、或者让得多 → 换过去。
 * 门开着 / 在动（s ≠ 0）→ 不换门轴（关着的时候两头一样，换了看不出来；开着换就跳了）。
 */
export function pickLeaf(L, prefer, route, n, v0, out = _pick) {
  const d0 = L.dir || 1;
  out.dir = d0;
  out.side = pickSide(L, prefer, route, n, v0);
  const a = _room;
  if (a >= CLEAR || L.s) return out;
  hingeTo(L, -d0);
  const side = pickSide(L, prefer, route, n, v0);
  const b = _room;
  hingeTo(L, d0);
  if (b >= CLEAR || b > a + 0.02) {
    out.dir = -d0;
    out.side = side;
  }
  return out;
}

/** 眼睛（世界 y）在哪一层：地面比眼睛低 LEVEL 以上的楼层里最高的那一层 */
export function levelOf(floors, y) {
  let fi = 0;
  let best = -Infinity;
  (floors || []).forEach((f, i) => {
    const e = f.elev || 0;
    if (y >= e + LEVEL && e > best) [fi, best] = [i, e];
  });
  return fi;
}

/**
 * 在引擎里建能开关的门。返回 { update(eye, pathAhead, dt) → changed, open(opening, opts), openAll(on), clearOf(fi, x, z), dispose(), leaves }。
 *  · eye：眼睛的世界坐标（camera.position）；pathAhead：接下来要走的路 [{x, z}]（平面米，这一层；可以是 null / { pts }）；dt：秒。
 *  · changed = 这一帧有门扇在动 / 玻璃藏起来或放回去（控制器据此 shadowMap.needsUpdate）。
 */
export function createDoors(engine, navData = engine.navData?.()) {
  const lib = engine.lib;
  const floors = navData?.floors || [];
  const shadow = () => {
    if (engine.renderer?.shadowMap) engine.renderer.shadowMap.needsUpdate = true;
    engine.dirty = true;
  };

  // 整层合并的门扇 / 把手：藏起来（记下原来的样子，退出时放回去）
  const merged = [];
  for (const F of engine.floors || []) F.group?.traverse((o) => o.userData?.doorLeaves && merged.push({ o, vis: o.visible }));
  const layerOf = (fi) => {
    const F = engine.floors?.[fi];
    const ref = merged.find((m) => F?.group && isUnder(m.o, F.group))?.o || firstMesh(F?.shell?.group || F?.group);
    return ref ? ref.layers.mask : null;
  };
  for (const m of merged) m.o.visible = false;

  // 每一扇门：关着的门扇（house.doorLeaf 建的，轴在门洞的 a 端；要开的时候可能换到 b 端），挂在这一层的组里（楼层自己的坐标）
  const leaves = [];
  for (const d of doorList(navData)) {
    const F = engine.floors?.[d.fi];
    if (!F?.group) continue;
    const pivot = doorLeaf(d.wall, d.piece, lib);
    if (!pivot) continue;
    const mask = layerOf(d.fi);
    if (mask != null) pivot.traverse((o) => o.isMesh && (o.layers.mask = mask));
    pivot.userData.walkDoor = d.id;
    const L = { ...d, hinge: { ...d.hinge }, pivot, s: 0, target: 0, far: 0, held: false, rehang: false };
    pivot.rotation.y = leafAngle(L, 0);
    F.group.add(pivot);
    leaves.push(L);
  }

  // 落地趟门的玻璃：每一套墙的玻璃网格（内墙整层共用一套）+ 它上面的落地趟门
  const glass = [];
  (engine.floors || []).forEach((F, fi) => {
    const byMesh = new Map();
    for (const set of F.wallSets || []) {
      const spans = set.wall.pieces.filter((p) => p.kind === 'slider' && (p.sill ?? 0) <= LOW_SILL);
      if (!spans.length) continue;
      const mesh = set.full?.children.find((m) => m.isMesh && m.material === lib.fixed.glass);
      if (!mesh) continue;
      if (!byMesh.has(mesh)) byMesh.set(mesh, { fi, mesh, vis: mesh.visible, spans: [] });
      for (const p of spans) byMesh.get(mesh).spans.push({ axis: set.wall.axis, c: set.wall.c, a: p.a, b: p.b });
    }
    glass.push(...byMesh.values());
  });

  engine.collectPickables?.();
  shadow();

  let lastEye = null; // 上一帧的眼睛 { x, y, z, fi }（第一帧建一次，以后原地改）
  let disposed = false;
  const pose = (L) => {
    L.pivot.rotation.y = leafAngle(L, Math.sign(L.s) * smooth(Math.abs(L.s)));
  };
  /** 门轴换到另一头（只在关着的时候）：pivot 挪过去、门扇和把手镜像（子网格的 x 取反：门板从门轴往另一头伸），再摆好角度 */
  const rehinge = (L, dir) => {
    if ((L.dir || 1) === dir) return;
    hingeTo(L, dir);
    for (const m of L.pivot.children) m.position.x = -m.position.x;
    L.pivot.position.x = L.hinge.x;
    L.pivot.position.z = L.hinge.z;
    pose(L);
  };
  // 眼睛 + 这一层接下来的整段路（每帧重写，不每帧建新数组；门开着就一直在那里，整段路都不能撞上它）；speed = 人现在走多快（上一帧到这一帧，最多 WALK_V）
  const route = [];
  let speed = 0;
  let climbed = Infinity; // 眼睛上一次在上下（走楼梯 / 飞进来往下降）是多少秒以前
  /** 门扇（伸出墙面的那一截，现在的样子）离 p 不到 CLEAR：人贴着它 */
  const touching = (L, p) => {
    const len = L.width - 0.02;
    const g = leafSeg(L, phiOf(L.s), Math.min(len, (L.wall?.t || 0) / 2), len, _seg);
    return segDist(p.x, p.z, g[0], g[1], g[2], g[3]) < CLEAR;
  };
  /** 离 from 远的那一边（from 正好在墙线上 / 没有 → house.js 鸟瞰里开的那一边） */
  const away = (L, from) => (from && -sideOf(L, from)) || L.into;
  /**
   * 要开：关着（或正在关）→ 开向哪一边。update 里（route = 眼睛 + 接下来的路，n 个点）：路要穿过这扇门 → 先挑路走过去的那一边
   * （门扇开进那一边，走回来也不挡），不穿过 → 离人远的那一边；再按 pickLeaf 挑门扇让得开的那一边（关着的门：门轴也挑，见 pickLeaf）。
   * open / openAll（没有 route）→ 离 from 远的那一边（门轴不换）。开着就不在这里换边（换边看 update 里的「接下来的路要撞上它」）
   */
  const want = (L, from, route = null, n = 0, pts = null) => {
    L.far = 0;
    if (L.target || L.rehang) return;
    if (!n) {
      L.target = away(L, from);
      return;
    }
    const pick = pickLeaf(L, crossing(L, from, pts, Infinity) || away(L, from), route, n, speed);
    rehinge(L, pick.dir);
    L.target = pick.side;
  };

  return {
    leaves,
    update(eye, pathAhead = null, dt = 0) {
      if (disposed || !eye) return false;
      const step = Math.min(Math.max(Number(dt) || 0, 0), 0.25);
      const fi = levelOf(floors, eye.y);
      const pts = Array.isArray(pathAhead) ? pathAhead : pathAhead?.pts || null;
      if (step > 0) {
        speed = lastEye && lastEye.fi === fi ? Math.min(WALK_V, Math.hypot(eye.x - lastEye.x, eye.z - lastEye.z) / step) : WALK_V;
        const vy = lastEye ? Math.abs(eye.y - lastEye.y) / step : 0;
        climbed = vy > CLIMB && vy < CLIMB_MAX ? 0 : climbed + step;
      }
      lastEye ||= { x: 0, y: 0, z: 0, fi: 0 };
      lastEye.x = eye.x;
      lastEye.y = eye.y;
      lastEye.z = eye.z;
      lastEye.fi = fi;
      let changed = false;
      let n = 0;
      const look = () => n || (n = clipPath(eye, pts, Infinity, route));
      for (const L of leaves) {
        const here = L.fi === fi;
        const dist = here ? doorDist(L, eye) : Infinity;
        if (here && (dist < OPEN_R || pathCrosses(L, eye, pts))) {
          // 在楼梯上（眼睛刚刚还在上下、控制器不给路）：先不开 —— 走下楼梯有了路再挑开向哪一边（不然先开一边、下了楼梯又换边）
          if (L.target || climbed >= CLIMB_HOLD || pts?.length) {
            if (!L.target) look();
            want(L, eye, route, n, pts);
          } else L.far = 0;
        } else if (dist > CLOSE_R) {
          L.far += step;
          if (L.far >= CLOSE_AFTER && !L.held) L.target = 0;
        } else L.far = 0;
        // 开着（或正在开）、有路：接下来的路要撞上门扇 → 另一边让得开（或两边都让不开、另一边让得多不少）就换过去；
        // 两边都不行 → 关上、换到另一头的门轴再开（rehangRoom：关的时候、再开的时候都扫不到人，让得开或让得多不少；openAll 开着的不关）。
        // 没有路（摇杆）、人贴着门扇（离眼睛 < CLEAR：摇杆走路把门扇当墙，推着它就停在这里）→ 也这么挑（路 = 只有眼睛）：
        // 人推门，门扇转到另一边（离人远）—— 不会被一扇开在走廊里的门一直挡着。
        // leafRoom / rehangRoom 里算了门扇转回去再开过去的那一会儿：扫得到人就不换（人在门扇和门洞之间推它：不动）
        if (here && L.target && (pts?.length || touching(L, eye))) {
          look();
          const keep = leafRoom(L, L.target, route, n, speed);
          if (keep < CLEAR) {
            const other = leafRoom(L, -L.target, route, n, speed);
            if (other >= CLEAR || other > keep + FLIP_GAIN) L.target = -L.target;
            else if (!L.held) {
              const re = rehangRoom(L, crossing(L, eye, pts, Infinity) || away(L, eye), route, n, speed);
              if (re >= CLEAR || re > Math.max(keep, other) + FLIP_GAIN) {
                L.target = 0;
                L.rehang = true;
              }
            }
          }
        }
        if (L.s !== L.target) {
          const k = step / SWING;
          L.s = L.target > L.s ? Math.min(L.target, L.s + k) : Math.max(L.target, L.s - k);
          pose(L);
          changed = true;
        }
        // 关好了、要换门轴：换过去（关着两头一样）；下一帧照「关着的门要开」重新挑（人还要过这扇门的话）
        if (L.rehang && !L.s) {
          L.rehang = false;
          rehinge(L, -(L.dir || 1));
          changed = true;
        }
      }
      for (const g of glass) {
        const near = g.fi === fi && g.spans.some((sp) => doorDist(sp, eye) < GLASS_R);
        const vis = near ? false : g.vis;
        if (g.mesh.visible !== vis) {
          g.mesh.visible = vis;
          changed = true;
        }
      }
      if (changed) engine.dirty = true;
      return changed;
    },
    /** 平面点 (x, z) 离 fi 层开着 / 在动的门扇（伸出墙面的那一截，算上 2cm 厚）多远；没有 → Infinity（摇杆走路可以把门扇当障碍） */
    clearOf(fi, x, z) {
      let m = Infinity;
      for (const L of leaves) {
        if (L.fi !== fi || !L.s) continue;
        const len = L.width - 0.02;
        const g = leafSeg(L, phiOf(L.s), Math.min(len, (L.wall?.t || 0) / 2), len, _seg);
        m = Math.min(m, segDist(x, z, g[0], g[1], g[2], g[3]) - 0.02);
      }
      return m;
    },
    /** 开某一个开口（openingId）的门：from = 人从哪边来（门往另一边开）；instant = 一下子开好（不动画） */
    open(opening, { fi = 0, from = null, instant = false } = {}) {
      let hit = false;
      for (const L of leaves) {
        if (L.fi !== fi || L.opening !== opening) continue;
        L.rehang = false;
        want(L, from);
        if (instant && L.s !== L.target) {
          L.s = L.target;
          pose(L);
          shadow();
        }
        hit = true;
      }
      return hit;
    },
    /** on：所有门打开、一直开着（不按距离关）；false：放开，之后按距离照常关 */
    openAll(on = true) {
      for (const L of leaves) {
        L.held = !!on;
        if (!on) continue;
        L.rehang = false;
        want(L, lastEye && lastEye.fi === L.fi ? lastEye : null);
      }
    },
    /** 门扇拿掉（缓存的几何体不释放）、合并的门扇和趟门玻璃放回去；可以调好几次 */
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const L of leaves) {
        L.pivot.removeFromParent();
        L.pivot.traverse((o) => {
          if (o.isMesh && o.geometry && !o.geometry.userData?.cached) o.geometry.dispose();
        });
      }
      for (const m of merged) m.o.visible = m.vis;
      for (const g of glass) g.mesh.visible = g.vis;
      engine.collectPickables?.();
      shadow();
    },
  };
}

function isUnder(o, root) {
  for (let p = o; p; p = p.parent) if (p === root) return true;
  return false;
}

function firstMesh(root) {
  let hit = null;
  root?.traverse((o) => {
    if (!hit && o.isMesh) hit = o;
  });
  return hit;
}
