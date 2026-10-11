// 建筑：地板、墙（门窗开洞）、窗框玻璃、门扇、阳台栏杆、品牌底座、看不见的树（只投影子）。
// 墙有两个版本：full（完整高度）/ cut（像 The Sims 一样切到 35cm）。切掉时 full 版移到「只投影」图层 ——
// 看不见，但阳光照进来的窗影还在。

import * as THREE from 'three';
import { ROOM_TYPES, bounds } from '../plan/model.js';
import { boxGeo, worldUV, cylGeo, sphereGeo } from './geom.js';
import { rng } from '../../shared/noise.js';

export const CUT_H = 0.35;
/** 第 1 层：主镜头看不见、但太阳的影子相机看得见 —— 切掉的墙、窗外的树都放这一层（也不会进环境光遮蔽） */
export const SHADOW_LAYER = 1;

function sideMat(lib, room) {
  if (!room) return lib.fixed.exterior;
  const t = ROOM_TYPES[room.type];
  if (t?.outdoor) return lib.fixed.exterior;
  if (t?.wet) return lib.slot('tile');
  return lib.slot('walls');
}

/** 一段墙体盒子（四面不同材质） */
function wallBox(wall, a, b, y0, y1, lib, { extendA = 0, extendB = 0 } = {}) {
  const len = b - a + extendA + extendB;
  const h = y1 - y0;
  const t = wall.t;
  const along = (a - extendA + b + extendB) / 2;
  let geo;
  if (wall.axis === 'x') geo = new THREE.BoxGeometry(len, h, t);
  else geo = new THREE.BoxGeometry(t, h, len);
  geo.translate(0, h / 2, 0);
  worldUV(geo);
  const neg = sideMat(lib, wall.neg);
  const pos = sideMat(lib, wall.pos);
  const end = lib.slot('walls');
  const cap = lib.fixed.cap;
  // BoxGeometry 的材质顺序：+x, -x, +y, -y, +z, -z
  const mats = wall.axis === 'x' ? [end, end, cap, cap, pos, neg] : [pos, neg, cap, cap, end, end];
  const m = new THREE.Mesh(geo, mats);
  if (wall.axis === 'x') m.position.set(along, y0, wall.c);
  else m.position.set(wall.c, y0, along);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.slot = 'walls';
  m.userData.mats = mats;
  return m;
}

function placeAlong(wall, mesh, along, y, offset = 0) {
  if (wall.axis === 'x') mesh.position.set(along, y, wall.c + offset);
  else mesh.position.set(wall.c + offset, y, along);
  return mesh;
}

function windowFrame(wall, p, lib, H) {
  const g = new THREE.Group();
  const len = p.b - p.a;
  const mid = (p.a + p.b) / 2;
  const sill = p.sill ?? 0.9;
  const head = Math.min(p.head ?? 2.2, H - 0.05);
  const fh = head - sill;
  const ft = 0.05;
  const geoFor = (w, h, d) => (wall.axis === 'x' ? boxGeo(w, h, d) : boxGeo(d, h, w));
  const add = (w, h, d, key, along, y, off = 0, shadow = true) => {
    const m = new THREE.Mesh(geoFor(w, h, d), key === 'glass' ? lib.fixed.glass : lib.fixed.frame);
    m.castShadow = shadow && key !== 'glass';
    m.receiveShadow = key !== 'glass';
    if (key === 'glass') m.renderOrder = 2;
    g.add(placeAlong(wall, m, along, y, off));
  };
  add(len, fh, 0.012, 'glass', mid, sill, 0, false);
  add(len, ft, 0.07, 'frame', mid, sill);
  add(len, ft, 0.07, 'frame', mid, head - ft);
  add(ft, fh, 0.07, 'frame', p.a + ft / 2, sill);
  add(ft, fh, 0.07, 'frame', p.b - ft / 2, sill);
  const n = Math.max(1, Math.round(len / (p.kind === 'slider' ? 1.0 : 0.9)));
  for (let i = 1; i < n; i++) add(0.035, fh, 0.06, 'frame', p.a + (len / n) * i, sill);
  if (p.kind === 'window' && fh > 1.3) add(len, 0.03, 0.05, 'frame', mid, sill + fh * 0.72);
  return g;
}

function doorLeaf(wall, p, lib) {
  const len = p.b - p.a;
  if (len > 1.3) return null;
  const head = p.head ?? 2.1;
  const geo = boxGeo(len - 0.02, head - 0.02, 0.04);
  const leaf = new THREE.Mesh(geo, lib.slot('cabinetry'));
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  leaf.userData.slot = 'cabinetry';
  const pivot = new THREE.Group();
  leaf.position.set((len - 0.02) / 2, 0, 0);
  pivot.add(leaf);
  const handle = new THREE.Mesh(boxGeo(0.12, 0.02, 0.05), lib.slot('metal'));
  handle.position.set(len - 0.1, 1.0, 0.03);
  handle.userData.slot = 'metal';
  pivot.add(handle);
  // 门往 pos 侧（或有房间的一侧）开 75°
  const into = wall.pos ? 1 : -1;
  const open = (into * 75 * Math.PI) / 180;
  if (wall.axis === 'x') {
    pivot.position.set(p.a + 0.01, 0, wall.c);
    pivot.rotation.y = -open;
  } else {
    pivot.position.set(wall.c, 0, p.a + 0.01);
    pivot.rotation.y = -Math.PI / 2 + open;
  }
  return pivot;
}

function railing(wall, lib) {
  const g = new THREE.Group();
  const len = wall.b - wall.a;
  const mid = (wall.a + wall.b) / 2;
  const geoFor = (w, h, d) => (wall.axis === 'x' ? boxGeo(w, h, d) : boxGeo(d, h, w));
  const base = new THREE.Mesh(geoFor(len + wall.t, 0.15, wall.t), lib.fixed.exterior);
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(placeAlong(wall, base, mid, 0));
  const glass = new THREE.Mesh(geoFor(len, 0.9, 0.012), lib.fixed.glass);
  glass.renderOrder = 2;
  g.add(placeAlong(wall, glass, mid, 0.15));
  const rail = new THREE.Mesh(geoFor(len + wall.t, 0.04, 0.06), lib.fixed.rail);
  rail.castShadow = true;
  g.add(placeAlong(wall, rail, mid, 1.05));
  return g;
}

function textPlane(text, sub, w, h) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = Math.round((2048 * h) / w);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#C9A25A';
  ctx.textBaseline = 'middle';
  const fs = Math.round(c.height * 0.36);
  ctx.font = `600 ${fs}px "Cormorant Garamond","Noto Serif SC",serif`;
  ctx.textAlign = 'left';
  ctx.fillText(text, c.height * 0.4, c.height * (sub ? 0.4 : 0.52));
  if (sub) {
    ctx.globalAlpha = 0.7;
    ctx.font = `500 ${Math.round(fs * 0.48)}px "Noto Sans SC",sans-serif`;
    ctx.fillText(sub, c.height * 0.4, c.height * 0.78);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4, metalness: 0.6, emissive: 0x3a2a10, emissiveMap: tex, emissiveIntensity: 0.6 }));
  return m;
}

/**
 * @returns {{ group, wallSets, windows, rooms, bounds, trees }}
 */
export function buildHouse(plan, walls, lib, { title = 'GENIE · RICCIONE REKA', subtitle = '溪岸 SAIL', ground = true } = {}) {
  const root = new THREE.Group();
  const H = plan.wallH || 2.8;
  const bb = bounds(plan);

  // 地板
  for (const r of plan.rooms) {
    const slot = ROOM_TYPES[r.type]?.floor === 'tile' ? 'tile' : 'floor';
    const m = new THREE.Mesh(boxGeo(r.w, 0.04, r.d), lib.slot(slot === 'tile' ? 'tile' : 'floor'));
    m.position.set(r.x + r.w / 2, -0.04, r.y + r.d / 2);
    m.receiveShadow = true;
    m.userData.slot = slot === 'tile' ? 'tile' : 'floor';
    m.userData.roomId = r.id;
    root.add(m);
  }

  // 墙
  const wallSets = [];
  const windows = [];
  for (const w of walls) {
    const outdoorSide = (w.neg && ROOM_TYPES[w.neg.type]?.outdoor && !w.pos) || (w.pos && ROOM_TYPES[w.pos.type]?.outdoor && !w.neg);
    if (outdoorSide) {
      root.add(railing(w, lib));
      continue;
    }
    const full = new THREE.Group();
    const cut = new THREE.Group();
    const ends = (p) => ({ extendA: Math.abs(p.a - w.a) < 0.01 ? w.t / 2 : 0, extendB: Math.abs(p.b - w.b) < 0.01 ? w.t / 2 : 0 });
    for (const p of w.pieces) {
      if (p.kind === 'solid') {
        full.add(wallBox(w, p.a, p.b, 0, H, lib, ends(p)));
        const c = wallBox(w, p.a, p.b, 0, CUT_H, lib, ends(p));
        c.castShadow = false;
        cut.add(c);
      } else if (p.kind === 'window' || p.kind === 'slider') {
        const sill = p.sill ?? 0.9;
        const head = Math.min(p.head ?? 2.2, H - 0.05);
        if (sill > 0.01) full.add(wallBox(w, p.a, p.b, 0, sill, lib, ends(p)));
        full.add(wallBox(w, p.a, p.b, head, H, lib, ends(p)));
        full.add(windowFrame(w, p, lib, H));
        if (sill > 0.01) {
          const c = wallBox(w, p.a, p.b, 0, Math.min(sill, CUT_H), lib, ends(p));
          c.castShadow = false;
          cut.add(c);
        }
        if (w.exterior) {
          const inward = w.outward * -1;
          const a3 = w.axis === 'x' ? new THREE.Vector3(p.a, 0, w.c) : new THREE.Vector3(w.c, 0, p.a);
          const b3 = w.axis === 'x' ? new THREE.Vector3(p.b, 0, w.c) : new THREE.Vector3(w.c, 0, p.b);
          const n = w.axis === 'x' ? new THREE.Vector3(0, 0, inward) : new THREE.Vector3(inward, 0, 0);
          windows.push({ a: a3, b: b3, sill, head, inward: n });
        }
      } else if (p.kind === 'door') {
        const head = Math.min(p.head ?? 2.1, H - 0.05);
        full.add(wallBox(w, p.a, p.b, head, H, lib, ends(p)));
        const leaf = doorLeaf(w, p, lib);
        if (leaf) root.add(leaf);
      }
    }
    const outward = w.exterior ? (w.axis === 'x' ? new THREE.Vector3(0, 0, w.outward) : new THREE.Vector3(w.outward, 0, 0)) : null;
    cut.visible = false;
    root.add(full, cut);
    wallSets.push({ wall: w, full, cut, outward, lowered: false });
  }

  // 底座
  const m = 0.35;
  const pw = bb.w + m * 2;
  const pd = bb.d + m * 2;
  const ph = 0.62;
  const plinth = new THREE.Mesh(boxGeo(pw, ph, pd, 0.02), lib.fixed.plinth);
  plinth.position.set(bb.cx, -0.04 - ph, bb.cy);
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  root.add(plinth);
  const front = textPlane(title, subtitle, Math.min(pw * 0.8, 9), 0.42);
  front.position.set(bb.cx - pw / 2 + Math.min(pw * 0.8, 9) / 2 + 0.25, -0.04 - ph / 2, bb.cy + pd / 2 + 0.002);
  root.add(front);
  const side = textPlane('GENIE', 'by RICCIONE REKA', Math.min(pd * 0.7, 4), 0.42);
  side.position.set(bb.cx + pw / 2 + 0.002, -0.04 - ph / 2, bb.cy);
  side.rotation.y = Math.PI / 2;
  root.add(side);

  // 地面：只接影子 + 金色细线
  if (ground) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.35 }));
    g.rotation.x = -Math.PI / 2;
    g.position.set(bb.cx, -0.04 - ph, bb.cy);
    g.receiveShadow = true;
    root.add(g);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xc9a25a, transparent: true, opacity: 0.45 });
    const y = -0.04 - ph + 0.003;
    const pad = 1.4;
    const pts = [
      [bb.x0 - m - pad, bb.y0 - m - pad],
      [bb.x1 + m + pad, bb.y0 - m - pad],
      [bb.x1 + m + pad, bb.y1 + m + pad],
      [bb.x0 - m - pad, bb.y1 + m + pad],
      [bb.x0 - m - pad, bb.y0 - m - pad],
    ].map(([x, z]) => new THREE.Vector3(x, y, z));
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    const diag = [
      [bb.x1 + m + pad, bb.y1 + m + pad, bb.x1 + m + pad + 3, bb.y1 + m + pad + 3],
      [bb.x0 - m - pad, bb.y1 + m + pad, bb.x0 - m - pad - 3, bb.y1 + m + pad + 3],
      [bb.x1 + m + pad, bb.y0 - m - pad, bb.x1 + m + pad + 3, bb.y0 - m - pad - 3],
    ];
    for (const [x1, z1, x2, z2] of diag) root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1, y, z1), new THREE.Vector3(x2, y, z2)]), lineMat));
  }

  // 看不见的树：只把树影投进窗里（窗上的树影 = 「时间在流动」的感觉）
  const trees = new THREE.Group();
  const rand = rng(Math.round(bb.w * 100 + bb.d * 7));
  const sides = [
    [bb.x0 - 2.6, bb.cy - bb.d * 0.25],
    [bb.x1 + 2.6, bb.cy + bb.d * 0.2],
    [bb.cx + bb.w * 0.2, bb.y1 + 2.8],
    [bb.cx - bb.w * 0.25, bb.y0 - 2.8],
  ];
  for (const [tx, tz] of sides) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(cylGeo(0.12, 0.16, 2.6, 8), lib.fixed.cap);
    trunk.castShadow = true;
    trunk.layers.set(SHADOW_LAYER);
    tree.add(trunk);
    for (let i = 0; i < 16; i++) {
      const leaf = new THREE.Mesh(sphereGeo(0.45 + rand() * 0.5, 8), lib.fixed.cap);
      leaf.position.set((rand() - 0.5) * 2.6, 2.4 + rand() * 1.8, (rand() - 0.5) * 2.6);
      leaf.scale.y = 0.6;
      leaf.castShadow = true;
      leaf.layers.set(SHADOW_LAYER);
      tree.add(leaf);
    }
    tree.position.set(tx, -0.04, tz);
    trees.add(tree);
  }
  root.add(trees);

  const rooms = plan.rooms.map((r) => ({ id: r.id, type: r.type, x: r.x + r.w / 2, z: r.y + r.d / 2, area: r.w * r.d, w: r.w, d: r.d }));
  return { group: root, wallSets, windows, rooms, bounds: bb, wallH: H };
}

/** 墙的切法：'cut' 朝镜头的外墙切低；'down' 全切；'up' 全立 */
export function applyCutaway(wallSets, camDir, mode) {
  let changed = false;
  for (const s of wallSets) {
    let low = false;
    if (mode === 'down') low = true;
    else if (mode === 'cut') low = !!(s.outward && s.outward.dot(camDir) > 0.18);
    if (low === s.lowered) continue;
    s.lowered = low;
    changed = true;
    s.cut.visible = low;
    s.full.traverse((o) => {
      if (o.isMesh) o.layers.set(low ? SHADOW_LAYER : 0);
    });
  }
  return changed;
}
