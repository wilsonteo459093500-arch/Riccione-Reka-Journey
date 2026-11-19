// 走进去 · 门 —— docs/walk/SPEC.md §3
//
// 鸟瞰里的门扇是整层合并的一块（house.js，开 75° 不动）。走进去时把它藏起来（userData.doorLeaves），
// 用 house.doorLeaf 给每一扇门另建一扇能开关的门：一开始关着；人走近（1.6m 以内）或接下来 2m 的路要穿过它 → 开到 90°，
// 朝离人远的那一边开（镜头不会穿过门板）；人走远（2.2m 以外）满 3 秒 → 关上。开 / 关大约 0.45 秒（缓入缓出）。
// 哪些门有门扇和 house.js 一模一样（doorList）：门洞是 door、宽 ≤ 1.3m、不在「只有一边是室外」的墙上（阳台栏杆 / 车廊矮墙）。
// 落地趟门：人在这一层、离趟门 1.2m 以内 → 那一套墙的玻璃先藏起来（v1），走开再放回去。
// 角度：门扇的轴 = 门洞 a 端（house.js 的 pivot）；s = 开了几分之几个 90°，带符号 = 开向墙的哪一边（+ = pos 那边）。

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
const HALF_PI = Math.PI / 2;

const outdoor = (r) => !!r && !!ROOM_TYPES[r.type]?.outdoor;
/** house.js：只有一边有房间、那一边是室外 → 画成栏杆 / 矮墙 / 门柱，墙上的开口不管 */
const outdoorSide = (w) => (outdoor(w.neg) && !w.pos) || (outdoor(w.pos) && !w.neg);
const smooth = (x) => x * x * (3 - 2 * x);

/**
 * house.js 给哪些门放门扇：[{ id, fi, opening, wall, piece, hinge: {x, z}, axis, c, a, b, width, closedAngle, into }]
 * hinge = 门轴（平面图米，z = 平面 y）；closedAngle = 关着时 pivot 的 rotation.y；into = house.js 鸟瞰里开向哪边（±1）。
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

/** 开了 s（带符号的几分之几个 90°）时 pivot 的 rotation.y —— 和 house.doorLeaf 的 75° 同一个算法 */
export function leafAngle(d, s) {
  return d.closedAngle + (d.axis === 'x' ? -1 : 1) * s * HALF_PI;
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

/** 从 p0 出发、沿着 pts 走前面 len 米，会不会穿过门洞 */
export function pathCrosses(d, p0, pts, len = AHEAD) {
  if (!pts?.length) return false;
  const line = [p0, ...pts];
  let left = len;
  for (let i = 1; i < line.length && left > 0; i++) {
    const P = line[i - 1];
    let Q = line[i];
    const seg = Math.hypot(Q.x - P.x, Q.z - P.z);
    if (seg < 1e-9) continue;
    if (seg > left) {
      const k = left / seg;
      Q = { x: P.x + (Q.x - P.x) * k, z: P.z + (Q.z - P.z) * k };
    }
    left -= seg;
    const vp = (d.axis === 'x' ? P.z : P.x) - d.c;
    const vq = (d.axis === 'x' ? Q.z : Q.x) - d.c;
    if (vp * vq > 0 || (vp === 0 && vq === 0)) continue;
    const up = d.axis === 'x' ? P.x : P.z;
    const uq = d.axis === 'x' ? Q.x : Q.z;
    const u = vp === vq ? up : up + ((uq - up) * vp) / (vp - vq);
    if (u >= d.a - 0.05 && u <= d.b + 0.05) return true;
  }
  return false;
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
 * 在引擎里建能开关的门。返回 { update(eye, pathAhead, dt) → changed, open(opening, opts), openAll(on), dispose(), leaves }。
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

  // 每一扇门：关着的门扇（house.doorLeaf 建的，轴在门洞的 a 端），挂在这一层的组里（楼层自己的坐标）
  const leaves = [];
  for (const d of doorList(navData)) {
    const F = engine.floors?.[d.fi];
    if (!F?.group) continue;
    const pivot = doorLeaf(d.wall, d.piece, lib);
    if (!pivot) continue;
    const mask = layerOf(d.fi);
    if (mask != null) pivot.traverse((o) => o.isMesh && (o.layers.mask = mask));
    pivot.userData.walkDoor = d.id;
    const L = { ...d, pivot, s: 0, target: 0, far: 0, held: false };
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

  let lastEye = null;
  let disposed = false;
  const pose = (L) => {
    L.pivot.rotation.y = leafAngle(L, Math.sign(L.s) * smooth(Math.abs(L.s)));
  };
  /** 要开：关着（或正在关）→ 朝离 from 远的那一边开；开着就不换边（人可能正从门里穿过去） */
  const want = (L, from) => {
    L.far = 0;
    if (L.target) return;
    L.target = (from && -sideOf(L, from)) || L.into;
  };

  return {
    leaves,
    update(eye, pathAhead = null, dt = 0) {
      if (disposed || !eye) return false;
      const step = Math.min(Math.max(Number(dt) || 0, 0), 0.25);
      const fi = levelOf(floors, eye.y);
      const pts = Array.isArray(pathAhead) ? pathAhead : pathAhead?.pts || null;
      lastEye = { x: eye.x, z: eye.z, fi };
      let changed = false;
      for (const L of leaves) {
        const here = L.fi === fi;
        const dist = here ? doorDist(L, eye) : Infinity;
        if (here && (dist < OPEN_R || pathCrosses(L, eye, pts))) want(L, eye);
        else if (dist > CLOSE_R) {
          L.far += step;
          if (L.far >= CLOSE_AFTER && !L.held) L.target = 0;
        } else L.far = 0;
        if (L.s !== L.target) {
          const k = step / SWING;
          L.s = L.target > L.s ? Math.min(L.target, L.s + k) : Math.max(L.target, L.s - k);
          pose(L);
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
    /** 开某一个开口（openingId）的门：from = 人从哪边来（门往另一边开）；instant = 一下子开好（不动画） */
    open(opening, { fi = 0, from = null, instant = false } = {}) {
      let hit = false;
      for (const L of leaves) {
        if (L.fi !== fi || L.opening !== opening) continue;
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
        if (on) want(L, lastEye && lastEye.fi === L.fi ? lastEye : null);
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
