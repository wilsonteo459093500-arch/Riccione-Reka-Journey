// 建筑：地板、墙（门窗开洞）、窗框玻璃、门扇、阳台栏杆、品牌底座、看不见的树（只投影子）。
// 墙有两个版本：full（完整高度）/ cut（像 The Sims 一样切到 35cm）。切掉时 full 版移到「只投影」图层 ——
// 看不见，但阳光照进来的窗影还在。

import * as THREE from 'three';
import { ROOM_TYPES, bounds } from '../plan/model.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxGeo, worldUV, cylGeo, sphereGeo } from './geom.js';
import { rng, fbm } from '../../shared/noise.js';

export const CUT_H = 0.35;
/** 第 1 层：主镜头看不见、但太阳的影子相机看得见 —— 切掉的墙、窗外的树都放这一层（也不会进环境光遮蔽） */
export const SHADOW_LAYER = 1;

// ───────────────────────── 建筑模型的「外观件」：墨色切面、磨砂深石底座、黄铜细线、会淡出的地面 ─────────────────────────
// 每个材质库一套（换平面图时复用，不会越建越多）

const KITS = new WeakMap();
let STONE = null;

/** 磨砂（honed）深色石材的细微色差 + 粗糙度起伏：无缝 fbm，只算一次 */
function stoneTextures() {
  if (STONE) return STONE;
  const N = 256;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    return c;
  };
  const col = mk();
  const rough = mk();
  const ci = col.getContext('2d').createImageData(N, N);
  const ri = rough.getContext('2d').createImageData(N, N);
  const r = rng(20251011);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const cloud = fbm((x / N) * 6, (y / N) * 6, 6, 6, 4, 3);
      const vein = fbm((x / N) * 3 + 11, (y / N) * 14, 3, 14, 3, 9);
      const grain = r();
      const k = 0.9 + 0.16 * cloud + 0.05 * (grain - 0.5) - 0.06 * Math.max(0, vein - 0.62) * 4;
      const i = (y * N + x) * 4;
      ci.data[i] = Math.min(255, 255 * k);
      ci.data[i + 1] = Math.min(255, 255 * k);
      ci.data[i + 2] = Math.min(255, 255 * k);
      ci.data[i + 3] = 255;
      const rv = 0.78 + 0.18 * cloud + 0.08 * (grain - 0.5);
      ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = Math.min(255, 255 * rv);
      ri.data[i + 3] = 255;
    }
  col.getContext('2d').putImageData(ci, 0, 0);
  rough.getContext('2d').putImageData(ri, 0, 0);
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / 1.6, 1 / 1.6);
    t.anisotropy = 8;
    return t;
  };
  STONE = { map: tex(col, true), rough: tex(rough, false) };
  return STONE;
}

function kitFor(lib) {
  let k = KITS.get(lib);
  if (k) return k;
  const st = stoneTextures();
  const tag = (m, name) => ((m.userData.fixed = name), m);
  // 切面 = 建筑剖面的「墨」：哑光、微暖，不反光（像模型的黑色 PVC 切口）
  const cap = tag(new THREE.MeshStandardMaterial({ color: 0x272420, roughness: 0.86, metalness: 0 }), 'cap');
  // 底座：磨砂深色石（SAIL 墨 #24211D 方向），有细微云纹，环境光里有一点缎面光泽
  const stone = tag(new THREE.MeshPhysicalMaterial({ color: 0x4d4843, map: st.map, roughness: 0.52, roughnessMap: st.rough, metalness: 0, clearcoat: 0.22, clearcoatRoughness: 0.38, specularIntensity: 0.7 }), 'plinth');
  const foot = tag(new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.9 }), 'plinth');
  // 拉丝黄铜细线（SAIL 金）
  const brass = tag(new THREE.MeshPhysicalMaterial({ color: 0xd9b26a, metalness: 1, roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.2 }), 'brass');
  // 地面：深色、带一点柔和反光，从底座往外慢慢淡进背景
  const gU = { gCenter: { value: new THREE.Vector2() }, gR0: { value: 8 }, gR1: { value: 24 } };
  const ground = tag(new THREE.MeshStandardMaterial({ color: 0x3e4041, roughness: 0.36, metalness: 0, transparent: true, depthWrite: true }), 'ground');
  ground.userData.u = gU;
  ground.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, gU);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;\nuniform vec2 gCenter;\nuniform float gR0;\nuniform float gR1;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n{ float gd = length(vGroundXZ - gCenter); float gf = 1.0 - smoothstep(gR0, gR1, gd); gl_FragColor.a *= gf * gf * (3.0 - 2.0 * gf); }');
  };
  ground.customProgramCacheKey = () => 'genie-ground-fade';
  // 地上的金色细线：不受光（夜里也看得见，像嵌在地上的金属线）
  const gold = tag(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 'goldline');
  k = { cap, stone, foot, brass, ground, gold };
  KITS.set(lib, k);
  return k;
}

/** 地面金线：一条条很细的带子（有真实宽度 → 抗锯齿干净），两端可以淡出 */
function goldRibbons(segs, y, width = 0.022) {
  const pos = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color(0xcfa65c);
  for (const [x1, z1, x2, z2, a1 = 1, a2 = 1] of segs) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const L = Math.hypot(dx, dz) || 1;
    const nx = (-dz / L) * (width / 2);
    const nz = (dx / L) * (width / 2);
    const b = pos.length / 3;
    pos.push(x1 - nx, y, z1 - nz, x1 + nx, y, z1 + nz, x2 + nx, y, z2 + nz, x2 - nx, y, z2 - nz);
    col.push(c.r, c.g, c.b, a1, c.r, c.g, c.b, a1, c.r, c.g, c.b, a2, c.r, c.g, c.b, a2);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

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
  const cap = kitFor(lib).cap;
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

/** 底座上的烫金字：字距拉开的衬线大写 + 细的无衬线副标，金属金箔材质（会反射环境里的柔光箱） */
function textPlane(text, sub, w, h) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = Math.round((2048 * h) / w);
  const ctx = c.getContext('2d');
  const draw = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#E2C17E';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const fs = Math.round(c.height * 0.34);
    const x = c.height * 0.42;
    try {
      ctx.letterSpacing = `${Math.round(fs * 0.14)}px`;
    } catch {
      /* 旧浏览器没有 letterSpacing */
    }
    ctx.font = `600 ${fs}px "Cormorant Garamond","Noto Serif SC",serif`;
    ctx.fillText(text, x, c.height * (sub ? 0.4 : 0.52));
    if (sub) {
      ctx.globalAlpha = 0.72;
      try {
        ctx.letterSpacing = `${Math.round(fs * 0.12)}px`;
      } catch {
        /* noop */
      }
      ctx.font = `500 ${Math.round(fs * 0.4)}px "Noto Sans SC",sans-serif`;
      ctx.fillText(sub, x, c.height * 0.78);
      ctx.globalAlpha = 1;
    }
  };
  draw();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // 网页字体可能晚到：到了就重画一次
  if (typeof document !== 'undefined' && document.fonts?.load)
    Promise.all([document.fonts.load('600 40px "Cormorant Garamond"'), document.fonts.load('500 20px "Noto Sans SC"')])
      .then(() => {
        draw();
        tex.needsUpdate = true;
      })
      .catch(() => {});
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, roughness: 0.32, metalness: 0.85, clearcoat: 0.4, clearcoatRoughness: 0.25, emissive: 0x4a3514, emissiveMap: tex, emissiveIntensity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.userData.noAO = true;
  m.userData.ownMaterial = true;
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

  // 底座：像建筑模型的展示台 —— 磨砂深石 + 细倒角，顶边一圈拉丝黄铜细线，底下内缩一道「影缝」让它像浮起来
  const K = kitFor(lib);
  const m = 0.35;
  const pw = bb.w + m * 2;
  const pd = bb.d + m * 2;
  const ph = 0.62;
  const top = -0.04;
  const y0 = top - ph;
  const gap = 0.045;
  const bodyGeo = new RoundedBoxGeometry(pw, ph - gap, pd, 2, 0.014);
  bodyGeo.translate(0, (ph - gap) / 2, 0);
  worldUV(bodyGeo);
  const plinth = new THREE.Mesh(bodyGeo, K.stone);
  plinth.position.set(bb.cx, y0 + gap, bb.cy);
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  root.add(plinth);
  const foot = new THREE.Mesh(boxGeo(pw - 0.07, gap + 0.002, pd - 0.07), K.foot);
  foot.position.set(bb.cx, y0, bb.cy);
  foot.receiveShadow = true;
  root.add(foot);
  const brass = new THREE.Mesh(boxGeo(pw + 0.006, 0.012, pd + 0.006), K.brass);
  brass.position.set(bb.cx, top - 0.042, bb.cy);
  brass.userData.noAO = true;
  root.add(brass);
  const front = textPlane(title, subtitle, Math.min(pw * 0.8, 9), 0.42);
  front.position.set(bb.cx - pw / 2 + Math.min(pw * 0.8, 9) / 2 + 0.25, y0 + gap + (ph - gap) / 2 - 0.02, bb.cy + pd / 2 + 0.003);
  root.add(front);
  const side = textPlane('GENIE', 'by RICCIONE REKA', Math.min(pd * 0.7, 4), 0.42);
  side.position.set(bb.cx + pw / 2 + 0.003, y0 + gap + (ph - gap) / 2 - 0.02, bb.cy);
  side.rotation.y = Math.PI / 2;
  root.add(side);

  // 地面：深色、柔和反光、接影子，离底座越远越淡进背景；上面嵌金色细线
  if (ground) {
    const R = Math.hypot(pw, pd) / 2;
    const u = K.ground.userData.u;
    u.gCenter.value.set(bb.cx, bb.cy);
    u.gR0.value = R * 0.95;
    u.gR1.value = R * 2.6;
    const g = new THREE.Mesh(new THREE.CircleGeometry(R * 2.7, 96), K.ground);
    g.rotation.x = -Math.PI / 2;
    g.position.set(bb.cx, y0, bb.cy);
    g.receiveShadow = true;
    g.renderOrder = -1;
    root.add(g);
    const pad = 1.4;
    const X0 = bb.x0 - m - pad;
    const X1 = bb.x1 + m + pad;
    const Z0 = bb.y0 - m - pad;
    const Z1 = bb.y1 + m + pad;
    const t = 0.011; // 线宽的一半：外框四边互相压住转角，转角是干净的直角
    const segs = [
      [X0 - t, Z0, X1 + t, Z0, 0.85, 0.85],
      [X1, Z0, X1, Z1, 0.85, 0.85],
      [X1 + t, Z1, X0 - t, Z1, 0.85, 0.85],
      [X0, Z1, X0, Z0, 0.85, 0.85],
      // 从转角往外的透视线：越远越淡
      [X1, Z1, X1 + 3.2, Z1 + 3.2, 0.8, 0],
      [X0, Z1, X0 - 3.2, Z1 + 3.2, 0.8, 0],
      [X1, Z0, X1 + 3.2, Z0 - 3.2, 0.8, 0],
      [X0, Z0, X0 - 3.2, Z0 - 3.2, 0.5, 0],
    ];
    const lines = new THREE.Mesh(goldRibbons(segs, y0 + 0.004), K.gold);
    lines.renderOrder = 1;
    lines.userData.noAO = true;
    root.add(lines);
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
    const trunk = new THREE.Mesh(cylGeo(0.12, 0.16, 2.6, 8), K.cap);
    trunk.castShadow = true;
    trunk.layers.set(SHADOW_LAYER);
    tree.add(trunk);
    // 稀一点的树冠（小团、有空隙）→ 窗里是斑驳的光，而不是一整片黑影
    for (let i = 0; i < 13; i++) {
      const leaf = new THREE.Mesh(sphereGeo(0.28 + rand() * 0.38, 8), K.cap);
      leaf.position.set((rand() - 0.5) * 3.0, 2.3 + rand() * 1.9, (rand() - 0.5) * 3.0);
      leaf.scale.y = 0.55;
      leaf.castShadow = true;
      leaf.layers.set(SHADOW_LAYER);
      tree.add(leaf);
    }
    tree.position.set(tx, -0.04, tz);
    trees.add(tree);
  }
  root.add(trees);

  const rooms = plan.rooms.map((r) => ({ id: r.id, type: r.type, x: r.x + r.w / 2, z: r.y + r.d / 2, area: r.w * r.d, w: r.w, d: r.d }));
  return { group: root, wallSets, windows, rooms, bounds: bb, wallH: H, trees };
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
