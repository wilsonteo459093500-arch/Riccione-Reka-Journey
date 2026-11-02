// 多层的房子：一层一个 THREE.Group（放在这一层的标高，userData.floorId），像 The Sims / Matterport 那样一层层叠起来。
//
// 每一层的组里：
//   · 壳（house.buildFloorShell）：地板、墙、窗、门、栏杆、挑空 / 楼梯口的护栏；
//   · 楼板（二楼以上）：model.floorPlate 的矩形，从下一层的天花一直到这一层地面下 4cm —— 外露的边是墨色切口
//     （掀开看的时候像建筑剖面），底面是天花的批荡；楼梯间、挑空是洞；
//   · 车廊屋顶（二楼以上，model.porchRoofs）：15cm 的平屋顶 + 30cm 的封檐板，临街两角各一根柱子落到车廊地上；
//   · 天花（model.ceilingRects）：平时藏着（模型是掀了顶的），走进去的时候 Engine.setCeilings(true) 盖上；
//   · furn：这一层的家具（引擎往里放）。
// 楼梯放在「下面那一层」的组里（看一楼的时候楼梯还在，和 The Sims 一样）。
// 底座、地面、金线、树只有一份，垫在所有楼层合起来的外框下面；树冠跟着楼高长。
// 走进去模式（下一步）直接用 floors[].group / ceiling、Engine.navData()。

import * as THREE from 'three';
import { ROOM_TYPES, buildAllWalls, elevations, floorPlate, porchRoofs, ceilingRects, voidEdges, flightRails, stairFlights, bounds, isV2, migratePlan } from '../plan/model.js';
import { buildFloorShell, buildPlinth, houseKit } from './house.js';
import { stairsMesh } from './furniture.js';

const EPS = 1e-4;
const rectOf = (r) => (r.x0 != null ? { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 } : { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.d });
const inside = (r, x, y) => x > r.x0 + EPS && x < r.x1 - EPS && y > r.y0 + EPS && y < r.y1 - EPS;
const area = (r) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/**
 * 一组矩形外露的边（别的矩形没盖住的那几段）→ [{ x1, y1, x2, y2, nx, ny }]，n = 朝外的法线（平面图坐标）。
 * others：也算「盖住」的矩形（例如车廊屋顶贴着的楼板）。
 */
export function exposedEdges(rects, others = []) {
  const all = [...rects, ...others];
  const out = [];
  rects.forEach((r, i) => {
    const sides = [
      { h: true, c: r.y0, a: r.x0, b: r.x1, n: [0, -1] },
      { h: true, c: r.y1, a: r.x0, b: r.x1, n: [0, 1] },
      { h: false, c: r.x0, a: r.y0, b: r.y1, n: [-1, 0] },
      { h: false, c: r.x1, a: r.y0, b: r.y1, n: [1, 0] },
    ];
    for (const s of sides) {
      const cuts = [s.a, s.b];
      for (const q of all) {
        if (s.h) cuts.push(q.x0, q.x1);
        else cuts.push(q.y0, q.y1);
      }
      const pts = [...new Set(cuts.filter((v) => v >= s.a - EPS && v <= s.b + EPS).map((v) => Math.round(v * 1e4) / 1e4))].sort((p, q) => p - q);
      let run = null;
      const flush = () => {
        if (run && run[1] - run[0] > 0.01) out.push(s.h ? { x1: run[0], y1: s.c, x2: run[1], y2: s.c, nx: s.n[0], ny: s.n[1] } : { x1: s.c, y1: run[0], x2: s.c, y2: run[1], nx: s.n[0], ny: s.n[1] });
        run = null;
      };
      for (let k = 0; k < pts.length - 1; k++) {
        const p = pts[k];
        const q = pts[k + 1];
        if (q - p < EPS) continue;
        const m = (p + q) / 2;
        const ox = s.h ? m : s.c + s.n[0] * 0.01;
        const oy = s.h ? s.c + s.n[1] * 0.01 : m;
        const covered = all.some((o, j) => j !== i && inside(o, ox, oy));
        if (covered) flush();
        else if (run && Math.abs(run[1] - p) < EPS) run[1] = q;
        else {
          flush();
          run = [p, q];
        }
      }
      flush();
    }
  });
  return out;
}

/** 把一堆四边形攒成一个 BufferGeometry（按材质分组：groups[k] 对应 materials[k]） */
class Quads {
  constructor(nMat) {
    this.buckets = Array.from({ length: nMat }, () => ({ pos: [], nor: [], uv: [] }));
  }
  /** 四个角（逆时针，从法线那边看）+ 法线 */
  add(k, p, n) {
    const b = this.buckets[k];
    const tri = [0, 1, 2, 0, 2, 3];
    const ax = Math.abs(n[0]);
    const ay = Math.abs(n[1]);
    const az = Math.abs(n[2]);
    for (const i of tri) {
      const [x, y, z] = p[i];
      b.pos.push(x, y, z);
      b.nor.push(n[0], n[1], n[2]);
      if (ay >= ax && ay >= az) b.uv.push(x, z);
      else if (ax >= az) b.uv.push(z, y);
      else b.uv.push(x, y);
    }
  }
  /** 轴对齐的盒子（只加 faces 里列出的面：'top' 'bottom' 'xn' 'xp' 'zn' 'zp'），材质 k（或 { top: k1, … }） */
  box(x0, y0, z0, x1, y1, z1, mats, faces = ['top', 'bottom', 'xn', 'xp', 'zn', 'zp']) {
    const m = (f) => (typeof mats === 'number' ? mats : (mats[f] ?? mats.side ?? 0));
    const F = {
      top: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
      bottom: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
      zp: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
      zn: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
      xp: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
      xn: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
    };
    for (const f of faces) this.add(m(f), F[f].slice(0, 4), F[f][4]);
  }
  /** 一条外露边上的竖直面（plan 线段 + 朝外法线），从 y0 到 y1 */
  wall(e, y0, y1, k) {
    const n = [e.nx, 0, e.ny];
    // 逆时针（从外面看）：走向 d × 上 = 法线 → (x2 − x1)·ny − (y2 − y1)·nx > 0 就是 1 → 2
    const [ax, az, bx, bz] = (e.x2 - e.x1) * e.ny - (e.y2 - e.y1) * e.nx > 0 ? [e.x1, e.y1, e.x2, e.y2] : [e.x2, e.y2, e.x1, e.y1];
    this.add(k, [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], n);
  }
  build() {
    const pos = [];
    const nor = [];
    const uv = [];
    const g = new THREE.BufferGeometry();
    let at = 0;
    this.buckets.forEach((b, k) => {
      if (!b.pos.length) return;
      pos.push(...b.pos);
      nor.push(...b.nor);
      uv.push(...b.uv);
      const n = b.pos.length / 3;
      g.addGroup(at, n, k);
      at += n;
    });
    if (!at) return null;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * 楼板（floor k ≥ 1，这一层自己的坐标）：从 −depth（下一层的天花）到 −0.04（地板下面）。
 * 外露的边 = 墨色切口（cap），底面 = 天花批荡。顶面盖在地板下面（墙下多出的那一圈也有顶）。
 */
function plateMesh(rects, depth, lib) {
  const K = houseKit(lib);
  const q = new Quads(2);
  const top = -0.04;
  const bot = -depth;
  for (const r of rects) q.box(r.x0, bot, r.y0, r.x1, top, r.y1, { top: 0, bottom: 1 }, ['top', 'bottom']);
  for (const e of exposedEdges(rects)) q.wall(e, bot, top, 0);
  const g = q.build();
  if (!g) return null;
  const m = new THREE.Mesh(g, [K.cap, lib.fixed.ceiling]);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.plate = true;
  return m;
}

/**
 * 车廊的平屋顶（floor k ≥ 1 的坐标：顶面在这一层地面下 6cm）+ 外露边的 30cm 封檐板 + 临街两角的柱子（落到下一层的地面）。
 * plates：这一层楼板的矩形（贴着它们的边不做封檐板）；porches：下一层的车廊房间；depthBelow = 下一层的楼层高。
 */
function porchRoofMesh(rects, plates, porches, depthBelow, lib, lowerWalls) {
  const ext = lib.fixed.exterior;
  const q = new Quads(1);
  const TOP = -0.06;
  const T = 0.15;
  const FASCIA = 0.3;
  const FT = 0.1;
  for (const r of rects) q.box(r.x0, TOP - T, r.y0, r.x1, TOP, r.y1, 0, ['top', 'bottom']);
  for (const e of exposedEdges(rects, plates)) {
    // 封檐板：外皮和屋顶的边齐平，往里 10cm；比屋顶高 2cm（挡水）
    const ix = -e.nx * FT;
    const iy = -e.ny * FT;
    const y0 = TOP - FASCIA + 0.02;
    const y1 = TOP + 0.02;
    q.wall(e, y0, y1, 0);
    q.wall({ x1: e.x1 + ix, y1: e.y1 + iy, x2: e.x2 + ix, y2: e.y2 + iy, nx: -e.nx, ny: -e.ny }, y0, y1, 0);
    // 封檐板的顶、底
    const xa = Math.min(e.x1, e.x1 + ix, e.x2);
    const xb = Math.max(e.x2, e.x2 + ix, e.x1);
    const za = Math.min(e.y1, e.y1 + iy, e.y2);
    const zb = Math.max(e.y2, e.y2 + iy, e.y1);
    q.box(xa, y0, za, xb, y1, zb, 0, ['top', 'bottom']);
  }
  // 柱子：车廊临街那条边的两个角（在两侧的分界线上，让开门柱 0.33m），0.2 × 0.3
  const roofed = (x, y) => rects.some((r) => x > r.x0 - 0.05 && x < r.x1 + 0.05 && y > r.y0 - 0.05 && y < r.y1 + 0.05);
  for (const p of porches) {
    const pr = rectOf(p);
    const street = streetSide(p, lowerWalls);
    if (!street) continue;
    const corners =
      street === 'S'
        ? [[pr.x0, pr.y1 - 0.33, 'z'], [pr.x1, pr.y1 - 0.33, 'z']]
        : street === 'N'
          ? [[pr.x0, pr.y0 + 0.33, 'z'], [pr.x1, pr.y0 + 0.33, 'z']]
          : street === 'E'
            ? [[pr.x1 - 0.33, pr.y0, 'x'], [pr.x1 - 0.33, pr.y1, 'x']]
            : [[pr.x0 + 0.33, pr.y0, 'x'], [pr.x0 + 0.33, pr.y1, 'x']];
    for (const [x, y, axis] of corners) {
      if (!roofed(x, y)) continue;
      // 柱子在分界线上：沿线 0.3、垂直于线 0.2
      const hx = axis === 'z' ? 0.1 : 0.15;
      const hz = axis === 'z' ? 0.15 : 0.1;
      q.box(x - hx, -depthBelow, y - hz, x + hx, TOP - T, y + hz, 0, ['xn', 'xp', 'zn', 'zp']);
    }
  }
  const g = q.build();
  if (!g) return null;
  const m = new THREE.Mesh(g, ext);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.porchRoof = true;
  return m;
}

/** 车廊哪一边临街：和屋子相邻的那一边的对面（下一层的墙里看谁在隔壁） */
function streetSide(porch, walls) {
  const house = new Set();
  for (const w of walls || []) {
    const other = w.neg?.id === porch.id ? w.pos : w.pos?.id === porch.id ? w.neg : null;
    if (!other || ROOM_TYPES[other.type]?.outdoor) continue;
    if (w.axis === 'x') house.add(Math.abs(w.c - porch.y) < 0.05 ? 'N' : 'S');
    else house.add(Math.abs(w.c - porch.x) < 0.05 ? 'W' : 'E');
  }
  const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
  if (house.size === 1) return OPP[[...house][0]];
  return null;
}

/** 天花：朝下的平面（在 ceil − 2mm，不和上一层楼板的底面打架），平时 visible = false */
function ceilingMesh(rects, ceil, lib) {
  if (!rects.length) return null;
  const q = new Quads(1);
  for (const r of rects) q.box(r.x0, ceil - 0.002, r.y0, r.x1, ceil - 0.002, r.y1, 0, ['bottom']);
  const g = q.build();
  if (!g) return null;
  const m = new THREE.Mesh(g, lib.fixed.ceiling);
  m.visible = false;
  m.castShadow = false;
  m.receiveShadow = true;
  m.userData.ceiling = true;
  return m;
}

/**
 * 整栋楼。plan：v2（v1 也行，先迁移）。opts：{ title, subtitle, ground, walls（{ floorId: walls }，不给就自己算） }。
 * @returns {{ group, floors, stairs, plinth, trees, plaques, pane, bounds, top, walls }}
 *   floors[i] = { id, level, elev, ceil, height, group, shell, plate, porchRoof, ceiling, furn, plates, holes, bounds, rooms, windows, wallSets, cover }
 *   plates / holes = 这一层楼板的矩形 / 楼板上的洞（{ x0, y0, x1, y1 }，平面米）
 *   cover = 这一层被楼上盖住的比例（0–1，室内面积；引擎的曝光补偿用）
 */
export function buildStack(plan0, lib, { title, subtitle, ground = true, walls } = {}) {
  const plan = isV2(plan0) ? plan0 : migratePlan(plan0);
  const wallsBy = walls || buildAllWalls(plan);
  const elev = elevations(plan);
  const root = new THREE.Group();
  root.userData.stack = true;
  const stairsUp = (fid) => new Set((plan.stairs || []).filter((s) => s.to === fid).map((s) => s.id));
  const floors = plan.floors.map((f, i) => {
    const g = new THREE.Group();
    g.position.y = elev[f.id] || 0;
    g.userData.floorId = f.id;
    g.userData.level = i;
    const prev = plan.floors[i - 1];
    const below = prev ? Math.max(0.05, (prev.height || prev.ceil + 0.35) - prev.ceil) : 0;
    const up = stairsUp(f.id);
    const holes = new Set(f.rooms.filter((r) => ROOM_TYPES[r.type]?.void || (r.stairId && up.has(r.stairId))).map((r) => r.id));
    const ve = holes.size ? voidEdges(plan, f.id, wallsBy[f.id]) : [];
    const shell = buildFloorShell(f, wallsBy[f.id] || [], lib, { elev: g.position.y, voidEdges: ve, holes, below });
    g.add(shell.group);
    let plate = null;
    let porchRoof = null;
    let plates = [];
    if (i > 0) {
      plates = floorPlate(plan, f.id).map(rectOf);
      plate = plateMesh(plates, below, lib);
      if (plate) g.add(plate);
      const roofs = porchRoofs(plan, f.id).map(rectOf);
      if (roofs.length) {
        const porches = prev.rooms.filter((r) => r.type === 'porch');
        porchRoof = porchRoofMesh(roofs, plates, porches, prev.height || prev.ceil + 0.35, lib, wallsBy[prev.id]);
        if (porchRoof) g.add(porchRoof);
      }
    }
    const ceiling = ceilingMesh(ceilingRects(plan, f.id).map(rectOf), f.ceil, lib);
    if (ceiling) g.add(ceiling);
    const furn = new THREE.Group();
    furn.userData.floorFurniture = f.id;
    g.add(furn);
    root.add(g);
    return {
      id: f.id,
      level: i,
      elev: g.position.y,
      ceil: f.ceil,
      height: f.height,
      group: g,
      shell,
      plate,
      porchRoof,
      ceiling,
      furn,
      plates,
      // 楼板上的洞（挑空、到这一层的楼梯间）：从上面往下看得见下一层的地方
      holes: f.rooms.filter((r) => holes.has(r.id)).map(rectOf),
      bounds: bounds(f),
      rooms: shell.rooms,
      windows: shell.windows,
      wallSets: shell.wallSets,
      hidden: false,
      cover: 0,
    };
  });

  // 每一层被正上面那一层盖住多少（室内面积的比例）
  floors.forEach((F, i) => {
    const above = floors[i + 1];
    if (!above) return;
    const indoor = plan.floors[i].rooms.filter((r) => !ROOM_TYPES[r.type]?.outdoor).map(rectOf);
    const total = indoor.reduce((s, r) => s + area(r), 0);
    if (!total) return;
    let cov = 0;
    for (const r of indoor) for (const p of above.plates) cov += overlap(r, p);
    F.cover = Math.min(1, cov / total);
  });

  // 楼梯：放在下面那一层的组里
  const stairs = [];
  for (const s of plan.stairs || []) {
    const lower = floors.find((F) => F.id === s.from);
    if (!lower) continue;
    const fl = stairFlights(plan, s.id);
    if (!fl) continue;
    const rails = flightRails(plan, s.id, wallsBy);
    const sg = stairsMesh(fl.flights, fl.landings, rails, lib);
    sg.userData.stairId = s.id;
    lower.group.add(sg);
    stairs.push({ id: s.id, from: s.from, to: s.to, group: sg });
  }

  const bb = bounds(plan);
  const top = Math.max(...floors.map((F) => F.elev + F.ceil));
  const base = buildPlinth(bb, lib, { title, subtitle, ground, top });
  root.add(base.group);
  return { group: root, floors, stairs, plinth: base.group, trees: base.trees, plaques: base.plaques, pane: houseKit(lib).pane, bounds: bb, top, walls: wallsBy };
}
