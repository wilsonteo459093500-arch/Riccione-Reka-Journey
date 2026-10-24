// 场景 → 3D 模型（SPEC §4.2–4.5）：节点树（每层一组，按类别分小组）、几何体、组件（重复的家具 / 门窗 = 一个组件多个实例）、材质。
// dae.js / obj.js 只负责把它写成文件。坐标：米，X 向右、Y 向上（平面的 −y）、Z 向上，原点和 DXF 一样。
// 天花不导出（不是公司的范围；SketchUp 里会挡住室内）；没有地台、地面、树、灯、贴图。

import { ROOM_TYPES, flightRails } from '../plan/model.js';
import { Mesh, addPart } from './mesh.js';
import { wallMesh } from './walls3d.js';
import { bi, both, ncName } from './names.js';
import { catGroup } from './catalog.js';
import { matInfo, streetSide } from './scene.js';

const mm = (v) => Math.round(v * 1000);
const CAT_ORDER = ['case', 'furn', 'soft', 'fix'];
const CAT_TAG = { case: 'cab', furn: 'furn', soft: 'soft', fix: 'fix' };

/** 门 / 窗 / 趟门的组件几何（组件坐标：X 沿墙从洞口起点到终点，Y 横穿墙、居中，Z 向上） */
function openingMesh(kind, len, sill, head) {
  const m = new Mesh();
  if (kind === 'door') {
    const H = head - 0.02;
    if (len > 1.3) {
      m.box('cabinetry', 0.01, -0.02, 0, len / 2 - 0.005, 0.02, H);
      m.box('cabinetry', len / 2 + 0.005, -0.02, 0, len - 0.01, 0.02, H);
    } else m.box('cabinetry', 0.01, -0.02, 0, len - 0.01, 0.02, H);
    return m;
  }
  const f = 0.05;
  const z0 = sill;
  const z1 = head;
  const fr = 'fixed__frame';
  m.box(fr, 0, -0.025, z0, len, 0.025, z0 + f);
  m.box(fr, 0, -0.025, z1 - f, len, 0.025, z1);
  m.box(fr, 0, -0.025, z0 + f, f, 0.025, z1 - f);
  m.box(fr, len - f, -0.025, z0 + f, len, 0.025, z1 - f);
  if (kind === 'window') {
    m.box('fixed__glass', f, -0.003, z0 + f, len - f, 0.003, z1 - f);
    return m;
  }
  const n = Math.max(2, Math.round(len / 1.0));
  const pw = len / n;
  for (let i = 0; i < n; i++) {
    const y = i % 2 ? 0.012 : -0.012;
    const a = i === 0 ? f : i * pw + f / 2;
    const b = i === n - 1 ? len - f : (i + 1) * pw - f / 2;
    if (i > 0) m.box(fr, i * pw - f / 2, -0.025, z0 + f, i * pw + f / 2, 0.025, z1 - f);
    m.box('fixed__glass', a, y - 0.003, z0 + f, b, y + 0.003, z1 - f);
  }
  return m;
}

/**
 * @param {object} scene buildScene() 的结果
 * @returns {{ root, geoms: Map<id, Mesh>, comps: Map<key, { id, key, name, geom, tris }>, materials: Array, stats }}
 */
export function model3d(scene) {
  const geoms = new Map();
  const comps = new Map();
  const used = new Set();
  let tris = 0;
  let instances = 0;
  const addGeom = (id, mesh) => {
    for (const k of mesh.groups.keys()) used.add(k);
    geoms.set(id, mesh);
    return id;
  };
  const wallsBy = Object.fromEntries(scene.floors.map((F) => [F.id, F.walls]));
  const ids = new Set();
  const uid = (s) => {
    let id = ncName(s);
    let k = 2;
    while (ids.has(id)) id = ncName(`${s}-${k++}`);
    ids.add(id);
    return id;
  };

  const floors = scene.floors.map((F) => {
    const code = F.code;
    const kids = [];
    const geomNode = (name, gid, mesh) => {
      if (!mesh || mesh.empty) return null;
      addGeom(gid, mesh);
      tris += mesh.tris;
      return { id: uid(`n-${gid}`), name, geom: gid, objName: gid.replace(/-/g, '_') };
    };

    // 墙
    const wm = wallMesh(F, scene).mesh;
    const wn = geomNode(both(bi('墙体')), `${code}-walls`, wm);
    if (wn) kids.push(wn);

    // 地面：每个房间一块 40mm（楼梯井、挑空没有）
    const floorKids = [];
    for (const r of F.rooms) {
      if (r.void || r.hole) continue;
      const m = new Mesh();
      const slot = ROOM_TYPES[r.type]?.floor === 'tile' ? 'tile' : 'floor';
      m.box(slot, scene.X(r.rect.x), scene.Y(r.rect.y + r.rect.d), -0.04, scene.X(r.rect.x + r.rect.w), scene.Y(r.rect.y), 0);
      const n = geomNode(`${both(r.name)} · ${both(bi('地面'))}`, `${code}-floor-${ncName(r.id)}`, m);
      if (n) floorKids.push(n);
    }
    if (floorKids.length) kids.push({ id: uid(`${code}-floors`), name: both(bi('地面')), children: floorKids });

    // 楼板（二楼以上）：楼下天花到这一层地面（地面饰面下面）
    if (F.plates.length) {
      const m = new Mesh();
      for (const r of F.plates) m.box('fixed__slab', scene.X(r.x), scene.Y(r.y + r.d), -F.below, scene.X(r.x + r.w), scene.Y(r.y), -0.04);
      const n = geomNode(both(bi('楼板')), `${code}-slab`, m);
      if (n) kids.push(n);
    }
    // 车廊屋顶 + 临街两角的柱子（落到楼下地面）
    if (F.porchRoofs.length) {
      const m = new Mesh();
      for (const r of F.porchRoofs) m.box('fixed__slab', scene.X(r.x), scene.Y(r.y + r.d), -0.21, scene.X(r.x + r.w), scene.Y(r.y), -0.06);
      const prev = scene.floors[F.level - 1];
      const roofed = (x, y) => F.porchRoofs.some((r) => x > r.x - 0.05 && x < r.x + r.w + 0.05 && y > r.y - 0.05 && y < r.y + r.d + 0.05);
      for (const p of (F.prevRooms || []).filter((r) => r.type === 'porch')) {
        const st = streetSide(p, F.prevWalls || []);
        if (!st) continue;
        const corners = st === 'S' ? [[p.x, p.y + p.d - 0.33, 'z'], [p.x + p.w, p.y + p.d - 0.33, 'z']] : st === 'N' ? [[p.x, p.y + 0.33, 'z'], [p.x + p.w, p.y + 0.33, 'z']] : st === 'E' ? [[p.x + p.w - 0.33, p.y, 'x'], [p.x + p.w - 0.33, p.y + p.d, 'x']] : [[p.x + 0.33, p.y, 'x'], [p.x + 0.33, p.y + p.d, 'x']];
        for (const [x, y, axis] of corners) {
          if (!roofed(x, y)) continue;
          const hx = axis === 'z' ? 0.1 : 0.15;
          const hy = axis === 'z' ? 0.15 : 0.1;
          m.box('fixed__exterior', scene.X(x - hx), scene.Y(y + hy), -(prev?.height || 3.2), scene.X(x + hx), scene.Y(y - hy), -0.21);
        }
      }
      const n = geomNode(both(bi('车廊屋顶')), `${code}-porch-roof`, m);
      if (n) kids.push(n);
    }

    // 门窗（组件实例）
    const dw = [];
    for (const o of F.openings) {
      if (o.kind === 'open') continue;
      const len = o.b - o.a;
      const H = F.ceil;
      const sill = o.kind === 'door' ? 0 : Math.max(0, o.kind === 'slider' ? o.sill || 0 : o.sill ?? 0.9);
      const head = Math.min(o.head ?? (o.kind === 'door' ? 2.1 : 2.2), H - 0.05);
      const word = o.kind === 'door' ? bi('门') : o.kind === 'window' ? bi('窗') : bi('趟门');
      const size = o.kind === 'window' ? `${mm(len)}×${mm(head - sill)}` : `${mm(len)}×${mm(head)}`;
      const key = o.kind === 'door' ? `WISH_DOOR_${mm(len)}x${mm(head)}` : o.kind === 'window' ? `WISH_WIN_${mm(len)}x${mm(sill)}x${mm(head)}` : `WISH_SLD_${mm(len)}x${mm(sill)}x${mm(head)}`;
      if (!comps.has(key)) {
        const mesh = openingMesh(o.kind, len, sill, head);
        const gid = `g-${key}`;
        addGeom(gid, mesh);
        comps.set(key, { id: `c-${key}`, key, name: `${both(word)} ${size}`, geom: gid, tris: mesh.tris });
      }
      const c = comps.get(key);
      const w = o.wall;
      const A = w.axis === 'x' ? [scene.X(o.a), scene.Y(w.c)] : [scene.X(w.c), scene.Y(o.a)];
      tris += c.tris;
      instances++;
      dw.push({ id: uid(`${code}-${o.kind}-${o.id}`), name: `${c.name}${o.room ? ` · ${both(o.room)}` : ''}`, translate: [A[0], A[1], 0], rotate: w.axis === 'x' ? 0 : -90, inst: c.id, comp: key, objName: `${code}_${o.kind}_${ncName(o.id)}` });
    }
    if (dw.length) kids.push({ id: uid(`${code}-doors-windows`), name: both(bi('门窗')), children: dw });

    // 楼梯（从这一层上去的）：每一级一块实心，平台实心到它的高度；扶手 40 × 40 斜料（踏步线上 0.9m）
    const ups = F.stairs.filter((s) => s.role === 'up');
    if (ups.length) {
      const m = new Mesh();
      const R = (r, z0, z1) => m.box('floor', scene.X(r.x0), scene.Y(r.y1), z0, scene.X(r.x1), scene.Y(r.y0), z1);
      for (const s of ups) {
        for (const fl of s.flights) {
          const n = Math.max(1, fl.risers - 1);
          const r = fl.rise || s.rise;
          for (let k = 0; k < n; k++) {
            const t0 = k * fl.tread;
            const t1 = k === n - 1 ? Math.max(t0, (fl.dir === 'N' || fl.dir === 'S' ? fl.rect.y1 - fl.rect.y0 : fl.rect.x1 - fl.rect.x0)) : (k + 1) * fl.tread;
            const q = { ...fl.rect };
            if (fl.dir === 'N') Object.assign(q, { y1: fl.rect.y1 - t0, y0: fl.rect.y1 - t1 });
            else if (fl.dir === 'S') Object.assign(q, { y0: fl.rect.y0 + t0, y1: fl.rect.y0 + t1 });
            else if (fl.dir === 'E') Object.assign(q, { x0: fl.rect.x0 + t0, x1: fl.rect.x0 + t1 });
            else Object.assign(q, { x1: fl.rect.x1 - t0, x0: fl.rect.x1 - t1 });
            R(q, 0, fl.z0 + (k + 1) * r);
          }
        }
        for (const l of s.landings) R(l.rect, 0, l.z);
        for (const e of flightRails(scene.plan, s.id, wallsBy)) {
          const p = [scene.X(e.x1), scene.Y(e.y1), e.z1 + 0.9];
          const q = [scene.X(e.x2), scene.Y(e.y2), e.z2 + 0.9];
          m.bar('woodwork', p, q, 0.04, 0.04);
          for (const [x, y, z] of [[e.x1, e.y1, e.z1], [e.x2, e.y2, e.z2]]) m.box('woodwork', scene.X(x) - 0.02, scene.Y(y) - 0.02, z, scene.X(x) + 0.02, scene.Y(y) + 0.02, z + 0.9);
        }
      }
      const n = geomNode(both(bi('楼梯')), `${code}-stairs`, m);
      if (n) kids.push(n);
    }

    // 栏杆：阳台（0.15 墙基 + 0.9 玻璃 + 扶手）、车廊两侧 0.9m 矮墙、临街门柱、楼梯口 / 挑空
    {
      const m = new Mesh();
      const along = (w, a, b, off, t, z0, z1, mat) => {
        if (w.axis === 'x') m.box(mat, scene.X(a), scene.Y(w.c + off + t / 2), z0, scene.X(b), scene.Y(w.c + off - t / 2), z1);
        else m.box(mat, scene.X(w.c + off - t / 2), scene.Y(b), z0, scene.X(w.c + off + t / 2), scene.Y(a), z1);
      };
      const guard = (w, a, b, off, t) => {
        along(w, a, b, off, t, 0, 0.15, 'fixed__exterior');
        along(w, a, b, off, 0.012, 0.15, 1.05, 'fixed__glass');
        along(w, a, b, off, 0.06, 1.05, 1.09, 'fixed__rail');
      };
      for (const e of F.lowEdges) {
        const w = e.wall;
        if (e.kind === 'parapet') guard(w, w.a - w.t / 2, w.b + w.t / 2, 0, w.t);
        else if (e.kind === 'porch-side') {
          along(w, w.a - w.t / 2, w.b + w.t / 2, 0, w.t, 0, 0.9, 'fixed__exterior');
          along(w, w.a - w.t / 2 - 0.015, w.b + w.t / 2 + 0.015, 0, w.t + 0.03, 0.9, 0.94, 'fixed__exterior');
        } else
          for (const at of [w.a, w.b]) {
            along(w, at - 0.16, at + 0.16, 0, 0.32, 0, 1.35, 'fixed__exterior');
            along(w, at - 0.185, at + 0.185, 0, 0.37, 1.35, 1.4, 'fixed__exterior');
          }
      }
      for (const e of F.rails) {
        const off = -(e.inward || 0) * 0.05;
        const w = { axis: e.axis, c: e.c };
        guard(w, e.a, e.b, off, 0.1);
      }
      const n = geomNode(both(bi('栏杆')), `${code}-railings`, m);
      if (n) kids.push(n);
    }

    // 柜子、家具（组件实例，按类别分组）
    for (const cat of CAT_ORDER) {
      const list = F.items.filter((it) => it.cat === cat);
      if (!list.length) continue;
      const inst = [];
      for (const it of list) {
        if (!comps.has(it.key)) {
          const mesh = new Mesh();
          for (const p of it.parts) addPart(mesh, p);
          const gid = `g-${it.key}`;
          addGeom(gid, mesh);
          comps.set(it.key, { id: `c-${it.key}`, key: it.key, name: `${both(it.name)} ${it.W}×${it.D}×${it.H}`, geom: gid, tris: mesh.tris });
        }
        const c = comps.get(it.key);
        tris += c.tris;
        instances++;
        inst.push({
          id: uid(`${code}-${CAT_TAG[cat]}-${it.id}`),
          name: `${c.name}${it.room?.zh ? ` · ${both(it.room)}` : ''}`,
          translate: [scene.X(it.x), scene.Y(it.z), it.y || 0],
          rotate: it.rot || 0,
          inst: c.id,
          comp: it.key,
          objName: `${code}_${CAT_TAG[cat]}_${it.key.replace(/^WISH_/, '')}_${ncName(it.id)}`,
        });
      }
      kids.push({ id: uid(`${code}-${cat}`), name: both(catGroup(cat)), children: inst });
    }

    return { id: uid(code), name: both(F.name), translate: [0, 0, F.elev], children: kids };
  });

  const name = scene.name.zh ? `WISH ${both(scene.name, ' / ')}` : 'WISH';
  const root = { id: 'n-root', name, children: floors };
  const materials = [...used].sort().map((sym) => matInfo(sym, scene.materials));
  const perComponent = Object.fromEntries([...comps.values()].map((c) => [c.key, c.tris]));
  return { root, geoms, comps, materials, stats: { tris, instances, components: comps.size, geometries: geoms.size, perComponent } };
}

/** 节点树走一遍：fn(node, worldMatrix)；矩阵 = 平移 + 绕 Z 转（度），只有这两种 */
export function walk(root, fn) {
  const rec = (n, M) => {
    let m = M;
    if (n.translate || n.rotate) m = compose(M, n.translate || [0, 0, 0], n.rotate || 0);
    fn(n, m);
    for (const c of n.children || []) rec(c, m);
  };
  rec(root, { c: 1, s: 0, t: [0, 0, 0] });
}

/** 父矩阵 ∘（平移 t，再绕 Z 转 deg） */
function compose(P, t, deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const tx = P.t[0] + P.c * t[0] - P.s * t[1];
  const ty = P.t[1] + P.s * t[0] + P.c * t[1];
  return { c: P.c * c - P.s * s, s: P.s * c + P.c * s, t: [tx, ty, P.t[2] + t[2]] };
}

/** 矩阵作用在点上 */
export const apply = (M, x, y, z) => [M.t[0] + M.c * x - M.s * y, M.t[1] + M.s * x + M.c * y, M.t[2] + z];
