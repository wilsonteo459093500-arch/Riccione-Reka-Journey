// 走进去 · 导航（纯函数，Node 可测；不用 three.js）—— 见 docs/walk/SPEC.md §2
//
// 每层一张格子（默认 0.1m），盖住这一层的房间外框 + 1.5m：
//   能走：房间里面（阳台、车廊这些室外的也算）；大门外面一块 1.5m 的空地（镜头从外面飞进来）。
//   挡住：房间外面、挑空、楼梯间（楼上是洞、楼下是梯段）、墙（门 / 打通 / 低窗台的趟门除外，厚度 = 墙厚）、
//         趟门的边框和竖框（每 ~1m 一根，和 house.windowFrame 一样）、阳台栏杆 / 车廊矮墙、家具（footprintOf）。
//   墙、家具按「碰到一点就算」画（格子盖住真的东西），clear = 格子中心到最近被挡格子（整格）的距离（米），
//   所以 clear ≥ 半径的地方离真的墙 / 家具也至少半径远。任意一点的 clearance = 四个格子中心的双线性插值。
// 找路：A*（八方向、不切角；离障碍近的格子贵一点 → 路走在中间；启发 = 八方向距离，跨楼层 = 经过楼梯口的直线下界）
//   → 拉直（沿线精确检查插值后的 clearance）。楼层之间走楼梯：stairPath 的 entry（下层）↔ exit（上层），代价 = 三维折线长；
//   fits === false 的楼梯不连。
// 坐标：平面图的米；接口里的点是 { fi, x, z }：fi = 楼层下标（navData.floors 的顺序），z = 平面图的 y。

import { ROOM_TYPES, buildAllWalls, buildWalls, stairPath, elevations, syncStairs } from '../plan/model.js';
import { footprintOf, mainEntrance } from '../engine/furnish.js';

/** 不挡路的家具：CATALOG 里 flat（地毯）/ ceiling（吊灯）/ wallMounted（挂画）的，加上窗帘（测试对着 CATALOG 核对） */
export const SKIP_KINDS = new Set(['rug', 'pendant', 'art', 'curtains']);

const MARGIN = 1.5; // 格子比房间外框大出去多少（米）
const APRON = 1.5; // 大门外面能走的深度
const APRON_SIDE = 0.4; // 大门外那块空地比门洞两边各宽多少
const IN_DOOR = 0.6; // 起点：大门里面多远
const LOW_SILL = 0.3; // 趟门窗台 ≤ 这个高度 → 走得过去
const CAP = 1.5; // clear 最多算到多远（米）
const SNAP = 0.45; // 楼梯口 / 大门起点离走得到的格子最多多远
const FIND = 4; // nearest() 最远找多远
const COMFORT = 0.1; // 拉直时尽量再多留 10cm（窄的地方不强求）
const PEN_D = 0.5; // 离障碍近于这个距离的格子加价（宽的地方不加 → 还是最短的路）
const PEN_K = 0.6; // 加价的力度：贴着半径走贵 60%，走廊 / 门洞里就走在中间
const TOL = 1e-6;
const E = 1e-6;
const SQ2 = Math.SQRT2;
const BIG = 1e9;
// 八个方向（前四个直走，后四个斜走）
const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DJ = [0, 0, 1, -1, 1, -1, 1, -1];
const DL = [1, 1, 1, 1, SQ2, SQ2, SQ2, SQ2];

const isHole = (r) => !!(r?.stairId || ROOM_TYPES[r?.type]?.stair || ROOM_TYPES[r?.type]?.void);
const indoor = (r) => !!r && !ROOM_TYPES[r.type]?.outdoor;
/** 只有一边有房间、那一边是室外（阳台 / 车廊）：house.js 画成栏杆 / 矮墙 / 门柱，不管上面的开口 */
const outdoorSide = (w) => (!!w.neg && !w.pos && !indoor(w.neg)) || (!!w.pos && !w.neg && !indoor(w.pos));

// ───────────────────────── navData ─────────────────────────

/** 和 Engine.navData() 一样的形状，直接从 plan 算（测试、没有引擎的时候用） */
export function navDataOf(plan0) {
  const plan = syncStairs(plan0);
  const walls = buildAllWalls(plan);
  const elev = elevations(plan);
  return {
    floors: plan.floors.map((f) => ({ id: f.id, level: f.level, elev: elev[f.id] || 0, ceil: f.ceil, height: f.height, rooms: f.rooms, walls: walls[f.id] || [], openings: f.openings })),
    stairs: (plan.stairs || []).map((s) => stairPath(plan, s.id)).filter(Boolean),
  };
}

// ───────────────────────── 画格子 ─────────────────────────

/** 格子中心落在矩形里的格子 = v */
function fillCentre(F, arr, x0, z0, x1, z1, v) {
  const c = F.cell;
  const i0 = Math.max(0, Math.ceil((x0 - F.x0) / c - 0.5 - E));
  const i1 = Math.min(F.nx - 1, Math.floor((x1 - F.x0) / c - 0.5 + E));
  const j0 = Math.max(0, Math.ceil((z0 - F.z0) / c - 0.5 - E));
  const j1 = Math.min(F.nz - 1, Math.floor((z1 - F.z0) / c - 0.5 + E));
  for (let j = j0; j <= j1; j++) arr.fill(v, j * F.nx + i0, j * F.nx + i1 + 1);
}

/** 和矩形有重叠（多于一点点）的格子：只把 0 改成 v（墙 / 家具「碰到就算」） */
function fillCover(F, arr, x0, z0, x1, z1, v) {
  const c = F.cell;
  const i0 = Math.max(0, Math.floor((x0 - F.x0) / c + E));
  const i1 = Math.min(F.nx - 1, Math.ceil((x1 - F.x0) / c - E) - 1);
  const j0 = Math.max(0, Math.floor((z0 - F.z0) / c + E));
  const j1 = Math.min(F.nz - 1, Math.ceil((z1 - F.z0) / c - E) - 1);
  for (let j = j0; j <= j1; j++) {
    const row = j * F.nx;
    for (let i = i0; i <= i1; i++) if (!arr[row + i]) arr[row + i] = v;
  }
}

/** 一段墙挡住的矩形 [x0, z0, x1, z1]（平面图米）：和 house.js 一样，碰到墙头的那一块多伸出半个墙厚（转角封死） */
export function wallBlocks(w) {
  const h = w.t / 2;
  const band = (a, b, half = h) => (w.axis === 'x' ? [a, w.c - half, b, w.c + half] : [w.c - half, a, w.c + half, b]);
  if (outdoorSide(w)) return [band(w.a - h, w.b + h)];
  const out = [];
  for (const p of w.pieces) {
    if (p.kind === 'door' || p.kind === 'open') continue;
    const a = Math.abs(p.a - w.a) < 0.01 ? p.a - h : p.a;
    const b = Math.abs(p.b - w.b) < 0.01 ? p.b + h : p.b;
    if (p.kind === 'slider' && (p.sill ?? 0) <= LOW_SILL) {
      // 落地趟门：两头的边框（5cm）+ 中间的竖框（3.5cm 宽、6cm 厚）
      const len = p.b - p.a;
      const n = Math.max(1, Math.round(len / 1.0));
      out.push(band(a, p.a + 0.05), band(p.b - 0.05, b));
      for (let i = 1; i < n; i++) {
        const m = p.a + (len / n) * i;
        out.push(band(m - 0.0175, m + 0.0175, 0.03));
      }
      continue;
    }
    out.push(band(a, b));
  }
  return out;
}

/** 门洞从哪里穿过（沿墙的坐标）：趟门 = 离中间最近的那一扇的正中（避开竖框），其他 = 正中 */
export function doorCross(p) {
  const mid = (p.a + p.b) / 2;
  if (p.kind !== 'slider') return mid;
  const len = p.b - p.a;
  const n = Math.max(1, Math.round(len / 1.0));
  let best = mid;
  let bd = Infinity;
  for (let k = 0; k < n; k++) {
    const at = p.a + (len / n) * (k + 0.5);
    if (Math.abs(at - mid) < bd - 1e-9) [best, bd] = [at, Math.abs(at - mid)];
  }
  return best;
}

/** 大门：{ id, kind, wall, piece, inward: ±1（室内在墙线的哪一边）, cross, apron: [x0,z0,x1,z1] | null } */
function mainDoor(nd) {
  if (!nd) return null;
  const m = mainEntrance(nd, nd.walls);
  if (!m) return null;
  const wall = nd.walls.find((w) => w.pieces.some((p) => p.openingId === m.id));
  const piece = wall?.pieces.find((p) => p.openingId === m.id);
  if (!piece) return null;
  const negIn = indoor(wall.neg);
  const posIn = indoor(wall.pos);
  let inward;
  if (negIn !== posIn) inward = negIn ? -1 : 1;
  else if (!negIn) inward = wall.outward ? -wall.outward : -1;
  else inward = ['foyer', 'living'].includes(wall.pos.type) ? 1 : -1;
  const cross = doorCross(piece);
  let apron = null;
  if (!(negIn && posIn)) {
    const out = -inward;
    const [p, q] = [wall.c, wall.c + out * APRON].sort((u, v) => u - v);
    const a = piece.a - APRON_SIDE;
    const b = piece.b + APRON_SIDE;
    apron = wall.axis === 'x' ? [a, p, b, q] : [p, a, q, b];
  }
  return { id: m.id, kind: m.kind, wall, piece, inward, cross, apron };
}

/** 一层的格子外框（对齐到 cell 的整数倍，楼层之间格子线对得上） */
function frameOf(nd, fi, cell) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const r of nd.rooms || []) {
    x0 = Math.min(x0, r.x);
    z0 = Math.min(z0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    z1 = Math.max(z1, r.y + r.d);
  }
  if (!Number.isFinite(x0)) [x0, z0, x1, z1] = [0, 0, 0, 0];
  const ia = Math.floor((x0 - MARGIN) / cell + E) - 1;
  const ib = Math.ceil((x1 + MARGIN) / cell - E) + 1;
  const ja = Math.floor((z0 - MARGIN) / cell + E) - 1;
  const jb = Math.ceil((z1 + MARGIN) / cell - E) + 1;
  return { id: nd.id, fi, elev: nd.elev || 0, x0: ia * cell, z0: ja * cell, nx: ib - ia, nz: jb - ja, cell };
}

/** 不动的部分：房间、大门外的空地、洞、墙；最外一圈永远挡住 */
function rasterStatic(F, nd, door) {
  const A = F.base;
  A.fill(1);
  const rooms = nd.rooms || [];
  for (const r of rooms) fillCentre(F, A, r.x, r.y, r.x + r.w, r.y + r.d, 0);
  if (door?.apron) fillCentre(F, A, ...door.apron, 0);
  for (const r of rooms) if (isHole(r)) fillCover(F, A, r.x, r.y, r.x + r.w, r.y + r.d, 1);
  for (const w of nd.walls) for (const b of wallBlocks(w)) fillCover(F, A, ...b, 1);
  const { nx, nz } = F;
  A.fill(1, 0, nx);
  A.fill(1, (nz - 1) * nx, nz * nx);
  for (let j = 0; j < nz; j++) {
    A[j * nx] = 1;
    A[j * nx + nx - 1] = 1;
  }
}

/** 家具占的地（footprintOf；角度先规范到 0–360；转了不是 90° 倍数的角度 → 转过以后的外框） */
function boxOf(item, size) {
  let it = item;
  if ((!it.w || !it.d) && size) {
    const s = size(it.kind);
    if (s) it = { ...it, w: it.w || s[0], d: it.d || s[1] };
  }
  const rot = (((Number(it.rot) || 0) % 360) + 360) % 360;
  if (rot % 90 === 0) return footprintOf(rot === it.rot ? it : { ...it, rot });
  const w = it.w || 0.5;
  const d = it.d || 0.5;
  const r = (rot * Math.PI) / 180;
  const hx = (Math.abs(Math.cos(r)) * w + Math.abs(Math.sin(r)) * d) / 2;
  const hz = (Math.abs(Math.sin(r)) * w + Math.abs(Math.cos(r)) * d) / 2;
  return { x0: it.x - hx, x1: it.x + hx, z0: it.z - hz, z1: it.z + hz };
}

function itemFloor(nav, it) {
  if (it.floor != null && nav._fIdx.has(it.floor)) return nav._fIdx.get(it.floor);
  if (nav._roomF.has(it.room)) return nav._roomF.get(it.room);
  return 0;
}

/** 这一层：不动的格子 + 家具 → grid，再算 clear / pass */
function rasterFloor(nav, fi, items) {
  const F = nav.floors[fi];
  F.grid.set(F.base);
  const { skip, size } = nav.opts;
  for (const it of items || []) {
    if (!it || !Number.isFinite(it.x) || !Number.isFinite(it.z)) continue;
    if (skip?.(it.kind) || itemFloor(nav, it) !== fi) continue;
    const b = boxOf(it, size);
    fillCover(F, F.grid, b.x0, b.z0, b.x1, b.z1, 2);
  }
  distance(F, nav.radius);
}

/**
 * clear：格子中心到最近被挡格子（整个方格）的精确距离。两遍可分离：
 * 先每一列找最近的被挡格子 → G = g(Δj)；再每一行 D = min_p g(i − p) + G(p)，g(d) = (|d| − ½)²（d ≠ 0）。
 */
function distance(F, radius) {
  const { nx, nz, grid, clear, pass, cell } = F;
  const K = Math.ceil(CAP / cell) + 1;
  const G = F._g || (F._g = new Float32Array(nx * nz));
  const g = (d) => (d ? (d - 0.5) * (d - 0.5) : 0);
  for (let i = 0; i < nx; i++) {
    let last = -BIG;
    for (let j = 0; j < nz; j++) {
      const k = j * nx + i;
      if (grid[k]) last = j;
      const d = j - last;
      G[k] = d > K ? BIG : g(d);
    }
    last = BIG;
    for (let j = nz - 1; j >= 0; j--) {
      const k = j * nx + i;
      if (grid[k]) last = j;
      const d = last - j;
      if (d <= K) {
        const v = g(d);
        if (v < G[k]) G[k] = v;
      }
    }
  }
  const cap2 = (CAP / cell) * (CAP / cell);
  for (let j = 0; j < nz; j++) {
    const row = j * nx;
    for (let i = 0; i < nx; i++) {
      let best = G[row + i];
      for (let d = 1; d <= K; d++) {
        const gd = (d - 0.5) * (d - 0.5);
        if (gd >= best) break;
        if (i - d >= 0) {
          const v = gd + G[row + i - d];
          if (v < best) best = v;
        }
        if (i + d < nx) {
          const v = gd + G[row + i + d];
          if (v < best) best = v;
        }
      }
      const c = best >= cap2 ? CAP : Math.sqrt(best) * cell;
      clear[row + i] = c;
      pass[row + i] = c >= radius - TOL ? 1 : 0;
    }
  }
}

// ───────────────────────── 查询 ─────────────────────────

/** 双线性插值的 clearance（格子外面 = 0） */
function bilinear(F, x, z) {
  const u = (x - F.x0) / F.cell - 0.5;
  const v = (z - F.z0) / F.cell - 0.5;
  if (!(u >= 0 && v >= 0 && u <= F.nx - 1 && v <= F.nz - 1)) return 0;
  const i = Math.min(Math.floor(u), F.nx - 2);
  const j = Math.min(Math.floor(v), F.nz - 2);
  const s = u - i;
  const t = v - j;
  const k = j * F.nx + i;
  const C = F.clear;
  return C[k] * (1 - s) * (1 - t) + C[k + 1] * s * (1 - t) + C[k + F.nx] * (1 - s) * t + C[k + F.nx + 1] * s * t;
}

const centre = (F, k) => ({ x: F.x0 + ((k % F.nx) + 0.5) * F.cell, z: F.z0 + (Math.floor(k / F.nx) + 0.5) * F.cell });

/** 离 (x, z) 最近的走得过去的格子（R 米以内；want(k) 再筛一遍）→ 本层格子下标或 −1 */
function scan(F, x, z, R, want) {
  const c = F.cell;
  const ci = Math.min(F.nx - 1, Math.max(0, Math.floor((x - F.x0) / c)));
  const cj = Math.min(F.nz - 1, Math.max(0, Math.floor((z - F.z0) / c)));
  const K = Math.ceil(R / c) + 1;
  let best = -1;
  let bd = R * R;
  for (let r = 0; r <= K; r++) {
    if (best >= 0 && (r - 1) * c > Math.sqrt(bd)) break;
    for (let j = cj - r; j <= cj + r; j++) {
      if (j < 0 || j >= F.nz) continue;
      const edge = j === cj - r || j === cj + r;
      for (let i = ci - r; i <= ci + r; i += edge ? 1 : 2 * r || 1) {
        if (i < 0 || i >= F.nx) continue;
        const k = j * F.nx + i;
        if (!F.pass[k] || (want && !want(k))) continue;
        const dx = F.x0 + (i + 0.5) * c - x;
        const dz = F.z0 + (j + 0.5) * c - z;
        const d = dx * dx + dz * dz;
        if (d < bd) [best, bd] = [k, d];
      }
    }
  }
  return best;
}

/** 围着这一点的四个格子中心里，走得过去、直线连得上的那一个（「从大门走得到」的优先，再按远近） */
function cornerNode(F, x, z, r) {
  const u = (x - F.x0) / F.cell - 0.5;
  const v = (z - F.z0) / F.cell - 0.5;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const list = [];
  for (const [di, dj] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const ii = i + di;
    const jj = j + dj;
    if (ii < 0 || jj < 0 || ii >= F.nx || jj >= F.nz) continue;
    const k = jj * F.nx + ii;
    if (!F.pass[k]) continue;
    const p = centre(F, k);
    list.push({ k, d: (p.x - x) ** 2 + (p.z - z) ** 2, reach: F.reach[k], p });
  }
  list.sort((a, b) => b.reach - a.reach || a.d - b.d);
  for (const o of list) if (los(F, x, z, o.p.x, o.p.z, r)) return o;
  return null;
}

export function clearance(nav, p) {
  const F = nav?.floors?.[p?.fi];
  return F ? bilinear(F, p.x, p.z) : 0;
}

export function passable(nav, p) {
  return clearance(nav, p) >= nav.radius - TOL;
}

/** 这一点在哪个房间（楼梯间 / 挑空排在后面）；没有 → null */
export function roomAt(nav, p) {
  const nd = nav?.data?.floors?.[p?.fi];
  if (!nd) return null;
  let hit = null;
  for (const r of nd.rooms || []) {
    if (p.x < r.x - E || p.x > r.x + r.w + E || p.z < r.y - E || p.z > r.y + r.d + E) continue;
    if (!isHole(r)) return r;
    hit ||= r;
  }
  return hit;
}

/** 最近的走得到的点：本身走得过去（而且从大门走得到）→ 原样；否则最近的格子中心（先找走得到的，再找任何走得过去的） */
export function nearest(nav, p) {
  const F = nav?.floors?.[p?.fi];
  if (!F || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
  if (passable(nav, p)) {
    const o = cornerNode(F, p.x, p.z, nav.radius);
    if (o?.reach) return { fi: p.fi, x: p.x, z: p.z };
  }
  let k = scan(F, p.x, p.z, FIND, (q) => F.reach[q]);
  if (k < 0) k = scan(F, p.x, p.z, FIND, null);
  if (k < 0) return null;
  return { fi: p.fi, ...centre(F, k) };
}

// ───────────────────────── 视线（拉直用） ─────────────────────────

/** 线段 A→B 上每一点插值后的 clearance 都 ≥ r 吗（逐格精确：一格里沿线是二次函数） */
function los(F, ax, az, bx, bz, r) {
  const c = F.cell;
  const nx = F.nx;
  const nz = F.nz;
  const C = F.clear;
  const u0 = (ax - F.x0) / c - 0.5;
  const v0 = (az - F.z0) / c - 0.5;
  const u1 = (bx - F.x0) / c - 0.5;
  const v1 = (bz - F.z0) / c - 0.5;
  if (Math.min(u0, u1) < 0 || Math.min(v0, v1) < 0 || Math.max(u0, u1) > nx - 1 || Math.max(v0, v1) > nz - 1) return false;
  const du = u1 - u0;
  const dv = v1 - v0;
  let i = Math.min(Math.floor(u0), nx - 2);
  let j = Math.min(Math.floor(v0), nz - 2);
  const si = du > 0 ? 1 : du < 0 ? -1 : 0;
  const sj = dv > 0 ? 1 : dv < 0 ? -1 : 0;
  const dtU = si ? 1 / Math.abs(du) : Infinity;
  const dtV = sj ? 1 / Math.abs(dv) : Infinity;
  let tU = si > 0 ? (i + 1 - u0) * dtU : si < 0 ? (u0 - i) * dtU : Infinity;
  let tV = sj > 0 ? (j + 1 - v0) * dtV : sj < 0 ? (v0 - j) * dtV : Infinity;
  const lim = r - TOL;
  let t0 = 0;
  for (let guard = nx + nz + 8; guard > 0; guard--) {
    if (i < 0 || j < 0 || i > nx - 2 || j > nz - 2) return false;
    const t1 = Math.min(tU, tV, 1);
    const k = j * nx + i;
    const c00 = C[k];
    const c10 = C[k + 1];
    const c01 = C[k + nx];
    const c11 = C[k + nx + 1];
    if (c00 < lim || c10 < lim || c01 < lim || c11 < lim) {
      // f(t) = c00 + A s + B w + D s w，s = s0 + du t，w = w0 + dv t
      const s0 = u0 - i;
      const w0 = v0 - j;
      const A = c10 - c00;
      const B = c01 - c00;
      const D = c00 - c10 - c01 + c11;
      const qa = D * du * dv;
      const qb = A * du + B * dv + D * (s0 * dv + w0 * du);
      const qc = c00 + A * s0 + B * w0 + D * s0 * w0;
      if (qc + qb * t0 + qa * t0 * t0 < lim || qc + qb * t1 + qa * t1 * t1 < lim) return false;
      if (qa > 0) {
        const tv = -qb / (2 * qa);
        if (tv > t0 && tv < t1 && qc + qb * tv + qa * tv * tv < lim) return false;
      }
    }
    if (t1 >= 1) return true;
    if (tU < tV - 1e-12) {
      i += si;
      tU += dtU;
    } else if (tV < tU - 1e-12) {
      j += sj;
      tV += dtV;
    } else {
      // 正好穿过格子的角：两边那两格只碰到这一个点（值和角上一样），直接斜着走
      i += si;
      j += sj;
      tU += dtU;
      tV += dtV;
    }
    t0 = t1;
  }
  return false;
}

/**
 * 拉直：从锚点往后看，直线走得通就跳过中间的点。门槛 = min(半径 + 10cm, 原路这一段最窄处)，但不低于半径 ——
 * 宽的地方离墙远一点，窄的地方（门洞）不比原来那条（A* 走在中间的）更贴边。
 */
function pull(F, pts, r) {
  const n = pts.length;
  if (n <= 2) return pts.slice();
  const rc = r + COMFORT;
  const cl = pts.map((p) => bilinear(F, p.x, p.z));
  const out = [pts[0]];
  let a = 0;
  let lo = Math.min(cl[0], cl[1]);
  for (let k = 2; k < n; k++) {
    const lo2 = Math.min(lo, cl[k]);
    const th = Math.max(r, Math.min(rc, lo2));
    if (los(F, pts[a].x, pts[a].z, pts[k].x, pts[k].z, th)) {
      lo = lo2;
      continue;
    }
    a = k - 1;
    out.push(pts[a]);
    lo = Math.min(cl[a], cl[k]);
  }
  out.push(pts[n - 1]);
  return out;
}

// ───────────────────────── 楼梯、连通 ─────────────────────────

/** 楼梯口 → 走得到的格子（全局下标）；fits === false、楼层不在、口外面没地方站 → 不连 */
function linkStairs(nav) {
  nav.stairs = [];
  nav._links = new Map();
  const add = (a, b, s) => {
    if (!nav._links.has(a)) nav._links.set(a, []);
    nav._links.get(a).push({ to: b, cost: s.length, s });
  };
  for (const sp of nav.data?.stairs || []) {
    if (!sp || sp.fits === false) continue;
    const fa = nav._fIdx.get(sp.from);
    const fb = nav._fIdx.get(sp.to);
    if (fa == null || fb == null || fa === fb) continue;
    const A = nav.floors[fa];
    const B = nav.floors[fb];
    const ka = scan(A, sp.entry.x, sp.entry.y, SNAP, null);
    const kb = scan(B, sp.exit.x, sp.exit.y, SNAP, null);
    if (ka < 0 || kb < 0) continue;
    const pts = sp.points.map((p) => ({ x: p.x, z: p.y, y: p.z }));
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z, pts[i].y - pts[i - 1].y);
    const s = { stair: sp.id, from: fa, to: fb, entry: { x: sp.entry.x, z: sp.entry.y }, exit: { x: sp.exit.x, z: sp.exit.y }, pts, length, na: A.off + ka, nb: B.off + kb };
    nav.stairs.push(s);
    add(s.na, s.nb, s);
    add(s.nb, s.na, s);
  }
}

/** 每层走得过去的格子分块（八方向、不切角），楼梯把上下两块连起来；reach = 和大门起点（没有大门 → 最大那一块）连着 */
function connect(nav) {
  const label = nav.buf.comp;
  label.fill(-1);
  const sizes = [];
  const queue = nav._q || (nav._q = new Int32Array(nav.N));
  for (const F of nav.floors) {
    const { nx, nz, pass, off } = F;
    for (let k0 = 0; k0 < nx * nz; k0++) {
      if (!pass[k0] || label[off + k0] >= 0) continue;
      const id = sizes.length;
      let head = 0;
      let tail = 0;
      queue[tail++] = k0;
      label[off + k0] = id;
      while (head < tail) {
        const k = queue[head++];
        const i = k % nx;
        const j = (k - i) / nx;
        for (let d = 0; d < 8; d++) {
          const di = DI[d];
          const dj = DJ[d];
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const q = jj * nx + ii;
          if (!pass[q] || label[off + q] >= 0) continue;
          if (di && dj && (!pass[j * nx + ii] || !pass[jj * nx + i])) continue;
          label[off + q] = id;
          queue[tail++] = q;
        }
      }
      sizes.push(tail);
    }
  }
  const up = sizes.map((_, i) => i);
  const find = (a) => {
    while (up[a] !== a) a = up[a] = up[up[a]];
    return a;
  };
  for (const s of nav.stairs) {
    const a = find(label[s.na]);
    const b = find(label[s.nb]);
    if (a !== b) up[a] = b;
  }
  const total = new Map();
  sizes.forEach((n, i) => total.set(find(i), (total.get(find(i)) || 0) + n));
  let root = -1;
  if (nav.start) {
    const F = nav.floors[nav.start.fi];
    const k = scan(F, nav.start.x, nav.start.z, SNAP, null);
    if (k >= 0) root = find(label[F.off + k]);
  }
  if (root < 0) for (const [r, n] of total) if (root < 0 || n > total.get(root)) root = r;
  const reach = nav.buf.reach;
  for (let k = 0; k < nav.N; k++) reach[k] = label[k] >= 0 && find(label[k]) === root ? 1 : 0;
}

/** 大门里面 IN_DOOR 米、从门洞（趟门：避开竖框的那一扇）正中进去 → 走得过去的点 */
function startOf(nav, door) {
  if (!door) return null;
  const F = nav.floors[0];
  const { wall, inward, cross } = door;
  const p = wall.axis === 'x' ? { x: cross, z: wall.c + inward * IN_DOOR } : { x: wall.c + inward * IN_DOOR, z: cross };
  if (bilinear(F, p.x, p.z) >= nav.radius - TOL) return { fi: 0, ...p };
  const k = scan(F, p.x, p.z, SNAP, null);
  return k < 0 ? null : { fi: 0, ...centre(F, k) };
}

// ───────────────────────── 建 / 重建 ─────────────────────────

/**
 * navData（Engine.navData() / navDataOf）+ 家具 → nav。
 * opts：cell 0.1、radius 0.22、skip(kind)（默认 SKIP_KINDS）、size(kind) → [w, d]（家具没写 w / d 时用）。
 * nav = { cell, radius, floors: [{ id, fi, elev, x0, z0, nx, nz, cell, grid, clear, pass, reach, … }], stairs: [{ stair, from, to, entry, exit, pts, length }],
 *         door（大门 | null）, start（大门里面的起点 { fi, x, z } | null）}
 *   格子下标 k = j * nx + i，格子 (i, j) 盖住 x0 + i·cell … x0 + (i+1)·cell（z 同理）。
 *   grid：0 空 / 1 房子（墙、洞、房间外）/ 2 家具；clear：米；pass：clear ≥ 半径；reach：从大门（经过楼梯）走得到。
 */
export function buildNav(navData, items = [], opts = {}) {
  const o = { cell: 0.1, radius: 0.22, skip: (k) => SKIP_KINDS.has(k), size: null, ...opts };
  const cell = o.cell;
  const fds = navData?.floors || [];
  const nds = fds.map((f) => ({ ...f, walls: Array.isArray(f.walls) && f.walls.length ? f.walls : buildWalls({ rooms: f.rooms || [], openings: f.openings || [] }) }));
  const floors = nds.map((nd, fi) => frameOf(nd, fi, cell));
  let N = 0;
  for (const F of floors) {
    F.off = N;
    N += F.nx * F.nz;
  }
  const buf = { base: new Uint8Array(N), grid: new Uint8Array(N), clear: new Float32Array(N), pass: new Uint8Array(N), reach: new Uint8Array(N), comp: new Int32Array(N) };
  const fOf = new Uint8Array(N);
  for (const F of floors) {
    const n = F.nx * F.nz;
    for (const k of ['base', 'grid', 'clear', 'pass', 'reach']) F[k] = buf[k].subarray(F.off, F.off + n);
    fOf.fill(F.fi, F.off, F.off + n);
  }
  const nav = { cell, radius: o.radius, opts: o, data: { ...navData, floors: nds }, floors, stairs: [], door: null, start: null, N, buf, _fOf: fOf };
  nav._fIdx = new Map(nds.map((f, i) => [f.id, i]));
  nav._roomF = new Map();
  nds.forEach((f, i) => (f.rooms || []).forEach((r) => nav._roomF.set(r.id, i)));
  nav.door = mainDoor(nds[0]);
  floors.forEach((F, fi) => rasterStatic(F, nds[fi], fi === 0 ? nav.door : null));
  floors.forEach((F, fi) => rasterFloor(nav, fi, items));
  nav.start = startOf(nav, nav.door);
  linkStairs(nav);
  connect(nav);
  return nav;
}

/** 家具挪了 / 转了 / 删了以后：重画这一层的家具（items = 全部家具，按楼层筛），楼梯连接和连通重算 */
export function rebuildFloor(nav, fi, items = []) {
  if (!nav?.floors?.[fi]) return nav;
  rasterFloor(nav, fi, items);
  if (fi === 0) nav.start = startOf(nav, nav.door);
  linkStairs(nav);
  connect(nav);
  return nav;
}

// ───────────────────────── A* ─────────────────────────

function searchState(nav) {
  let S = nav._st;
  if (!S || S.n !== nav.N) {
    S = nav._st = { n: nav.N, g: new Float64Array(nav.N), par: new Int32Array(nav.N), seen: new Uint32Array(nav.N), done: new Uint32Array(nav.N), gen: 0, hk: new Float64Array(4096), hn: new Int32Array(4096) };
  }
  if (++S.gen >= 0xfffffff0) {
    S.seen.fill(0);
    S.done.fill(0);
    S.gen = 1;
  }
  return S;
}

/**
 * 跨楼层的启发：每个楼梯口到终点的直线下界（小图上的 Dijkstra：同层两口之间 = 直线，楼梯 = 折线长），
 * 不在终点那层的格子 h = min（到这一层某个口的直线 + 那个口的下界）。
 */
function stairBounds(nav, ft, gx, gz) {
  const ends = [];
  for (const s of nav.stairs) {
    const a = { fi: s.from, ...centre(nav.floors[s.from], s.na - nav.floors[s.from].off), lb: Infinity };
    const b = { fi: s.to, ...centre(nav.floors[s.to], s.nb - nav.floors[s.to].off), lb: Infinity };
    a.pair = b;
    b.pair = a;
    a.len = b.len = s.length;
    ends.push(a, b);
  }
  for (const e of ends) if (e.fi === ft) e.lb = Math.hypot(e.x - gx, e.z - gz);
  const done = new Set();
  for (;;) {
    let cur = null;
    for (const e of ends) if (!done.has(e) && e.lb < Infinity && (!cur || e.lb < cur.lb)) cur = e;
    if (!cur) break;
    done.add(cur);
    const relax = (e, d) => {
      if (d < e.lb) e.lb = d;
    };
    relax(cur.pair, cur.lb + cur.len);
    for (const e of ends) if (e.fi === cur.fi && e !== cur) relax(e, cur.lb + Math.hypot(e.x - cur.x, e.z - cur.z));
  }
  const by = nav.floors.map(() => []);
  for (const e of ends) if (e.lb < Infinity) by[e.fi].push(e);
  return by;
}

function astar(nav, s, t) {
  const S = searchState(nav);
  const { g, par, seen, done, gen } = S;
  const floors = nav.floors;
  const fOf = nav._fOf;
  const cell = nav.cell;
  const r = nav.radius;
  const ft = fOf[t];
  const T = floors[ft];
  const tk = t - T.off;
  const gx = T.x0 + ((tk % T.nx) + 0.5) * cell;
  const gz = T.z0 + (Math.floor(tk / T.nx) + 0.5) * cell;
  const ends = nav.stairs.length ? stairBounds(nav, ft, gx, gz) : null;
  const h = (n) => {
    const fi = fOf[n];
    const F = floors[fi];
    const k = n - F.off;
    const x = F.x0 + ((k % F.nx) + 0.5) * cell;
    const z = F.z0 + (Math.floor(k / F.nx) + 0.5) * cell;
    if (fi === ft) {
      const dx = Math.abs(x - gx);
      const dz = Math.abs(z - gz);
      return dx + dz + (SQ2 - 2) * Math.min(dx, dz);
    }
    let best = Infinity;
    if (ends) for (const e of ends[fi]) best = Math.min(best, Math.hypot(x - e.x, z - e.z) + e.lb);
    return best;
  };
  // 二叉堆（键 = f）
  let hk = S.hk;
  let hn = S.hn;
  let size = 0;
  const push = (n, key) => {
    if (size === hk.length) {
      const k2 = new Float64Array(size * 2);
      const n2 = new Int32Array(size * 2);
      k2.set(hk);
      n2.set(hn);
      hk = S.hk = k2;
      hn = S.hn = n2;
    }
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= key) break;
      hk[i] = hk[p];
      hn[i] = hn[p];
      i = p;
    }
    hk[i] = key;
    hn[i] = n;
  };
  const pop = () => {
    const top = hn[0];
    const key = hk[--size];
    const n = hn[size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= size) break;
      if (c + 1 < size && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= key) break;
      hk[i] = hk[c];
      hn[i] = hn[c];
      i = c;
    }
    hk[i] = key;
    hn[i] = n;
    return top;
  };
  const visit = (n, gn, from) => {
    if (seen[n] === gen && gn >= g[n]) return;
    const hn0 = h(n);
    if (hn0 === Infinity) return;
    seen[n] = gen;
    g[n] = gn;
    par[n] = from;
    push(n, gn + hn0);
  };
  visit(s, 0, -1);
  while (size) {
    const n = pop();
    if (done[n] === gen) continue;
    done[n] = gen;
    if (n === t) break;
    const F = floors[fOf[n]];
    const { nx, nz, pass, clear, off } = F;
    const k = n - off;
    const i = k % nx;
    const j = (k - i) / nx;
    const gn = g[n];
    for (let d = 0; d < 8; d++) {
      const di = DI[d];
      const dj = DJ[d];
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const q = jj * nx + ii;
      if (!pass[q] || done[off + q] === gen) continue;
      if (di && dj && (!pass[j * nx + ii] || !pass[jj * nx + i])) continue;
      const cq = clear[q];
      const pen = cq < PEN_D ? Math.min(PEN_K, (PEN_K * (PEN_D - cq)) / (PEN_D - r)) : 0;
      visit(off + q, gn + DL[d] * cell * (1 + pen), n);
    }
    const ls = nav._links.get(n);
    if (ls) for (const l of ls) if (done[l.to] !== gen) visit(l.to, gn + l.cost, n);
  }
  if (done[t] !== gen) return null;
  const out = [];
  for (let n = t; n >= 0; n = par[n]) out.push(n);
  return out.reverse();
}

/** 起点 / 终点：走得过去的原点（连到身边的格子）或最近走得到的格子 → { fi, pt, node } */
function anchor(nav, p) {
  const F = nav.floors[p?.fi];
  if (!F || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
  if (passable(nav, p)) {
    const o = cornerNode(F, p.x, p.z, nav.radius);
    if (o?.reach) return { fi: p.fi, pt: { x: p.x, z: p.z }, node: F.off + o.k };
  }
  const q = nearest(nav, p);
  if (!q) return null;
  const k = scan(F, q.x, q.z, F.cell, null);
  return k < 0 ? null : { fi: p.fi, pt: { x: q.x, z: q.z }, node: F.off + k };
}

/**
 * 找路：from / to = { fi, x, z }（z = 平面图 y）。走不到的点先挪到最近走得到的地方。
 * → { legs: [{ kind:'walk', fi, pts:[{x,z}] } | { kind:'stair', stair, from, to, pts:[{x,z,y}] }], length } | null
 * 楼梯段：from / to = 这一段从哪层走到哪层（下楼时 from 是楼上）；y = 离 from 那层地面的高度（下楼时是负数），
 * 所以眼睛高度永远 = floors[from].elev + y + 1.55。
 */
export function path(nav, from, to) {
  if (!nav?.floors?.length) return null;
  const a = anchor(nav, from);
  const b = anchor(nav, to);
  if (!a || !b) return null;
  const nodes = astar(nav, a.node, b.node);
  if (!nodes) return null;
  const fOf = nav._fOf;
  const legs = [];
  let run = [];
  let startPt = a.pt;
  const flush = (endPt) => {
    const fi = fOf[run[0]];
    const F = nav.floors[fi];
    const pts = [startPt, ...run.map((n) => centre(F, n - F.off)), endPt];
    legs.push({ kind: 'walk', fi, pts: dedupe(pull(F, pts, nav.radius)) });
  };
  for (let k = 0; k < nodes.length; k++) {
    const n = nodes[k];
    if (run.length && fOf[run[run.length - 1]] !== fOf[n]) {
      const prev = run[run.length - 1];
      const s = nav._links.get(prev)?.find((l) => l.to === n)?.s;
      if (!s) return null;
      const up = s.na === prev;
      const fa = up ? s.from : s.to;
      const fb = up ? s.to : s.from;
      const rise = s.pts[s.pts.length - 1].y;
      const [pin, pout] = up ? [s.entry, s.exit] : [s.exit, s.entry];
      flush(passable(nav, { fi: fa, ...pin }) ? { x: pin.x, z: pin.z } : centre(nav.floors[fa], prev - nav.floors[fa].off));
      const pts = (up ? s.pts : [...s.pts].reverse()).map((p) => ({ x: p.x, z: p.z, y: up ? p.y : p.y - rise }));
      legs.push({ kind: 'stair', stair: s.stair, from: fa, to: fb, pts });
      startPt = passable(nav, { fi: fb, ...pout }) ? { x: pout.x, z: pout.z } : centre(nav.floors[fb], n - nav.floors[fb].off);
      run = [];
    }
    run.push(n);
  }
  flush(b.pt);
  let length = 0;
  for (const l of legs)
    for (let i = 1; i < l.pts.length; i++) {
      const p = l.pts[i - 1];
      const q = l.pts[i];
      length += Math.hypot(q.x - p.x, q.z - p.z, (q.y || 0) - (p.y || 0));
    }
  return { legs, length };
}

/** 去掉连续重复的点（起点正好在格子中心之类），至少留两个点 */
function dedupe(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = out[out.length - 1];
    if (Math.abs(pts[i].x - p.x) > 1e-9 || Math.abs(pts[i].z - p.z) > 1e-9) out.push(pts[i]);
  }
  if (out.length === 1) out.push({ ...out[0] });
  return out;
}
