// 程序化家具 —— 全部用圆角盒子 / 圆柱拼出来，按「表面」上材质（换一次材质，整屋同类一起换）。
// 约定：每件家具的「正面」朝本地 +z，原点在地面上的占地中心；尺寸单位米。

import * as THREE from 'three';
import { boxGeo, cylGeo, sphereGeo, merge, placedBox, curtainGeo } from './geom.js';
import { SLOT_BY_ID } from '../../shared/materials.js';
import { rng } from '../../shared/noise.js';

let LIB = null;
export function useLib(lib) {
  LIB = lib;
}

const mat = (key) => (SLOT_BY_ID[key] ? LIB.slot(key) : LIB.fixed[key]);

function M(geo, key, x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0, shadow = true } = {}) {
  const m = new THREE.Mesh(geo, mat(key));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (SLOT_BY_ID[key]) m.userData.slot = key;
  return m;
}
const B = (w, h, d, key, x, y, z, r = 0, o) => M(boxGeo(w, h, d, r), key, x, y, z, o);
const C = (rt, rb, h, key, x, y, z, seg = 24, o) => M(cylGeo(rt, rb, h, seg), key, x, y, z, o);

function group(...children) {
  const g = new THREE.Group();
  children.flat().filter(Boolean).forEach((c) => g.add(c));
  return g;
}

/** 一排柜门：长 L、高 h，按 ~0.45–0.6 分门，门缝 3mm；handle: 'none'|'bar'|'knob' */
function doors(L, h, y, z, key, { maxW = 0.6, gap = 0.004, handle = 'none', depth = 0.02, vertical = true } = {}) {
  const n = Math.max(1, Math.round(L / maxW));
  const w = L / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + w * (i + 0.5);
    out.push(B(w - gap, h - gap, depth, key, x, y + gap / 2, z, 0.003));
    if (handle === 'bar') {
      const hx = x + (i % 2 ? -1 : 1) * (w / 2 - 0.05);
      out.push(B(0.012, vertical ? Math.min(0.3, h * 0.4) : 0.012, 0.025, 'metal', hx, y + h * (vertical && h > 1.2 ? 0.42 : 0.7), z + depth / 2 + 0.012));
    } else if (handle === 'knob') {
      out.push(C(0.012, 0.012, 0.03, 'metal', x, y + h * 0.75, z + depth / 2, 12, { rx: Math.PI / 2 }));
    }
  }
  return out;
}

function led(L, x, y, z) {
  return M(boxGeo(L, 0.008, 0.02), 'led', x, y, z, { shadow: false });
}

// ───────────────────────── 客厅 ─────────────────────────

function sofa({ w = 2.2, d = 0.92, variant = 'classic' }) {
  if (variant === 'curvy') {
    return group(
      B(w, 0.38, d, 'upholstery', 0, 0.04, 0.02, 0.18),
      B(w, 0.72, 0.34, 'upholstery', 0, 0.04, -d / 2 + 0.17, 0.16),
      B(0.34, 0.56, d - 0.08, 'upholstery', -w / 2 + 0.17, 0.04, 0.02, 0.16),
      B(0.34, 0.56, d - 0.08, 'upholstery', w / 2 - 0.17, 0.04, 0.02, 0.16),
      B(w - 0.62, 0.14, d - 0.36, 'upholstery', 0, 0.4, 0.12, 0.07),
      B(0.46, 0.42, 0.16, 'accents', -w / 2 + 0.55, 0.46, -d / 2 + 0.42, 0.08, { rz: 0.12, rx: -0.2 }),
      B(0.4, 0.38, 0.15, 'bedding', w / 2 - 0.55, 0.46, -d / 2 + 0.42, 0.08, { rz: -0.1, rx: -0.2 })
    );
  }
  const L = variant === 'lshape' ? w : w;
  const parts = [];
  const legH = 0.1;
  for (const [x, z] of [
    [-L / 2 + 0.08, -d / 2 + 0.08],
    [L / 2 - 0.08, -d / 2 + 0.08],
    [-L / 2 + 0.08, d / 2 - 0.08],
    [L / 2 - 0.08, d / 2 - 0.08],
  ])
    parts.push(C(0.018, 0.014, legH, 'metal', x, 0, z, 10));
  parts.push(B(L, 0.18, d, 'upholstery', 0, legH, 0, 0.03));
  parts.push(B(L - 0.1, 0.5, 0.18, 'upholstery', 0, legH, -d / 2 + 0.09, 0.05));
  parts.push(B(0.17, 0.42, d, 'upholstery', -L / 2 + 0.085, legH, 0, 0.05));
  parts.push(B(0.17, 0.42, d, 'upholstery', L / 2 - 0.085, legH, 0, 0.05));
  const n = L > 2.3 ? 3 : 2;
  const cw = (L - 0.36) / n;
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + 0.18 + cw * (i + 0.5);
    parts.push(B(cw - 0.012, 0.15, d - 0.3, 'upholstery', x, legH + 0.18, 0.08, 0.05));
    parts.push(B(cw - 0.02, 0.44, 0.2, 'upholstery', x, legH + 0.26, -d / 2 + 0.25, 0.08, { rx: -0.14 }));
  }
  parts.push(B(0.46, 0.44, 0.15, 'accents', -L / 2 + 0.45, legH + 0.36, -d / 2 + 0.42, 0.07, { rz: 0.14, rx: -0.25 }));
  parts.push(B(0.42, 0.4, 0.14, 'accents', L / 2 - 0.45, legH + 0.36, -d / 2 + 0.42, 0.07, { rz: -0.12, rx: -0.25 }));
  if (variant === 'lshape') {
    // 贵妃位（右前方）
    parts.push(B(0.8, 0.18, 0.8, 'upholstery', L / 2 - 0.4, legH, d / 2 + 0.38, 0.03));
    parts.push(B(0.8 - 0.2, 0.15, 0.78, 'upholstery', L / 2 - 0.47, legH + 0.18, d / 2 + 0.38, 0.05));
    parts.push(B(0.17, 0.42, 0.8, 'upholstery', L / 2 - 0.085, legH, d / 2 + 0.38, 0.05));
    parts.push(B(0.9, 0.02, 0.5, 'accents', L / 2 - 0.45, legH + 0.34, d / 2 + 0.45, 0.01, { rz: 0.05 }));
  }
  return group(parts);
}

function armchair({ variant = 'classic' }) {
  if (variant === 'lounge')
    return group(
      B(0.04, 0.55, 0.7, 'woodwork', -0.34, 0, 0, 0.015),
      B(0.04, 0.55, 0.7, 'woodwork', 0.34, 0, 0, 0.015),
      B(0.64, 0.12, 0.62, 'upholstery', 0, 0.26, 0.02, 0.04),
      B(0.64, 0.5, 0.12, 'upholstery', 0, 0.36, -0.28, 0.05, { rx: -0.25 })
    );
  return group(
    B(0.78, 0.36, 0.8, 'upholstery', 0, 0.06, 0, 0.12),
    B(0.78, 0.74, 0.22, 'upholstery', 0, 0.06, -0.29, 0.1),
    B(0.17, 0.56, 0.74, 'upholstery', -0.305, 0.06, 0.02, 0.08),
    B(0.17, 0.56, 0.74, 'upholstery', 0.305, 0.06, 0.02, 0.08),
    B(0.44, 0.12, 0.5, 'upholstery', 0, 0.42, 0.09, 0.05),
    B(0.32, 0.3, 0.12, 'accents', 0, 0.52, -0.12, 0.06, { rx: -0.2 })
  );
}

function coffeeTable({ variant = 'round', w = 1.0, d = 0.6 }) {
  if (variant === 'round')
    return group(C(0.46, 0.46, 0.05, 'woodwork', 0, 0.36, 0, 40), C(0.24, 0.3, 0.36, 'woodwork', 0, 0, 0, 32), B(0.22, 0.06, 0.16, 'accents', 0.12, 0.41, -0.05, 0.02), C(0.05, 0.04, 0.18, 'pot', -0.15, 0.41, 0.1, 16));
  if (variant === 'stone')
    return group(B(w, 0.06, d, 'countertop', 0, 0.32, 0, 0.02), B(w - 0.2, 0.32, d - 0.2, 'countertop', 0, 0, 0, 0.01), B(0.26, 0.05, 0.2, 'accents', -0.2, 0.38, 0, 0.02));
  return group(
    B(w, 0.04, d, 'woodwork', 0, 0.38, 0, 0.01),
    ...[
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].map(([sx, sz]) => B(0.04, 0.38, 0.04, 'woodwork', sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06))),
    B(0.3, 0.05, 0.22, 'accents', 0.2, 0.42, 0, 0.02)
  );
}

function rug({ w = 2.4, d = 1.7, variant = 'rect' }) {
  if (variant === 'round') return group(C(w / 2, w / 2, 0.012, 'rugs', 0, 0.002, 0, 48, { shadow: false }));
  return group(B(w, 0.012, d, 'rugs', 0, 0.002, 0, 0.004, { shadow: false }));
}

function tvWall({ w = 2.4, h = 2.8 }) {
  const tvw = Math.min(1.46, w * 0.6);
  const cab = Math.min(2.2, w - 0.2);
  const g = group(
    ...featurePanel(w, h, 0),
    B(cab, 0.36, 0.4, 'cabinetry', 0, 0.26, 0.24, 0.006),
    ...doors(cab - 0.02, 0.3, 0.29, 0.445, 'cabinetry', { maxW: 0.55, depth: 0.012 }),
    led(cab - 0.1, 0, 0.25, 0.32),
    B(tvw, tvw * 0.575, 0.04, 'tv', 0, 0.95, 0.07, 0.006),
    B(tvw - 0.02, tvw * 0.575 - 0.02, 0.005, 'screen', 0, 0.96, 0.092),
    B(0.28, 0.12, 0.2, 'accents', -cab / 2 + 0.3, 0.62, 0.24, 0.02),
    C(0.06, 0.05, 0.22, 'pot', cab / 2 - 0.25, 0.62, 0.22, 16)
  );
  return g;
}

/** 主题墙：木作 → 格栅；其他材质 → 平板 + 两道分缝（切换材质时由引擎切换可见） */
function featurePanel(w, h, z = 0) {
  const slatW = 0.035;
  const pitch = 0.06;
  const n = Math.floor((w - 0.02) / pitch);
  const geos = [];
  for (let i = 0; i < n; i++) geos.push(placedBox(slatW, h - 0.02, 0.025, -((n - 1) * pitch) / 2 + i * pitch, 0.01, z + 0.03));
  const slats = new THREE.Mesh(merge(geos), mat('feature'));
  slats.castShadow = true;
  slats.receiveShadow = true;
  slats.userData = { slot: 'feature', featureMode: 'slats' };
  const back = B(w, h, 0.02, 'feature', 0, 0, z + 0.01);
  back.material = LIB.fixed.cap;
  back.userData = { featureMode: 'slats' };
  const flat = B(w, h, 0.03, 'feature', 0, 0, z + 0.015, 0.004);
  flat.userData = { slot: 'feature', featureMode: 'flat' };
  return [back, slats, flat];
}

function featureWall({ w = 2.4, h = 2.8 }) {
  return group(featurePanel(w, h, 0));
}

function bookshelf({ w = 1.2, h = 2.2, d = 0.34, key = 'woodwork', seed = 1 }) {
  const parts = [];
  const t = 0.025;
  parts.push(B(t, h, d, key, -w / 2 + t / 2, 0, 0), B(t, h, d, key, w / 2 - t / 2, 0, 0), B(w, t, d, key, 0, h - t, 0), B(w, 0.06, d, key, 0, 0, 0), B(w, h, 0.01, key, 0, 0, -d / 2 + 0.005));
  const shelves = Math.max(3, Math.round(h / 0.38));
  const sh = (h - 0.06) / shelves;
  const rand = rng(seed * 997);
  const geos = [];
  const COLS = ['#A65A3A', '#2E4057', '#C6912E', '#7C9A6D', '#B3552E', '#E9E2D4', '#6B4B2F', '#8E9AA6', '#D9C3A0'];
  for (let s = 0; s < shelves; s++) {
    const y = 0.06 + s * sh;
    if (s > 0) parts.push(B(w - 2 * t, t, d - 0.01, key, 0, y - t / 2, 0.005));
    let x = -w / 2 + t + 0.02;
    while (x < w / 2 - t - 0.06) {
      if (rand() < 0.14) {
        x += 0.12 + rand() * 0.1;
        continue;
      }
      const bw = 0.022 + rand() * 0.03;
      const bh = Math.min(sh - 0.05, 0.18 + rand() * 0.12);
      geos.push(placedBox(bw, bh, 0.15 + rand() * 0.05, x + bw / 2, y + 0.002, 0.02, COLS[Math.floor(rand() * COLS.length)]));
      x += bw + 0.003;
    }
  }
  if (geos.length) {
    const books = new THREE.Mesh(merge(geos), LIB.fixed.books);
    books.castShadow = true;
    books.receiveShadow = true;
    parts.push(books);
  }
  return group(parts);
}

function displayCabinet({ w = 1.2, h = 2.2, d = 0.42 }) {
  const parts = [B(w, h, d, 'cabinetry', 0, 0, 0, 0.004)];
  const shelves = 4;
  for (let s = 1; s < shelves; s++) {
    parts.push(B(w - 0.06, 0.015, d - 0.06, 'cabinetry', 0, (h / shelves) * s, 0.02));
    parts.push(led(w - 0.1, 0, (h / shelves) * s - 0.01, 0.12));
  }
  const rand = rng(Math.round(w * 100));
  for (let s = 0; s < shelves; s++) {
    const y = (h / shelves) * s + 0.02;
    const k = rand();
    if (k < 0.33) parts.push(C(0.05, 0.07, 0.24, 'accents', -w / 4, y, 0.03, 16), C(0.04, 0.04, 0.16, 'pot', w / 5, y, 0.03, 16));
    else if (k < 0.66) parts.push(B(0.26, 0.18, 0.12, 'upholstery', 0, y, 0.03, 0.03));
    else parts.push(sphereGeo && M(sphereGeo(0.08), 'metal', -0.1, y + 0.08, 0.03), B(0.2, 0.22, 0.1, 'accents', 0.18, y, 0.03, 0.02));
  }
  const glass = B(w - 0.04, h - 0.04, 0.012, 'glass', 0, 0.02, d / 2 + 0.006, 0, { shadow: false });
  glass.renderOrder = 2;
  parts.push(glass, B(0.012, h * 0.6, 0.02, 'metal', 0, h * 0.2, d / 2 + 0.02));
  return group(parts);
}

function plant({ variant = 'tall', seed = 3 }) {
  const rand = rng(seed * 131);
  const big = variant === 'tall';
  const potH = big ? 0.42 : 0.22;
  const potR = big ? 0.2 : 0.12;
  const parts = [C(potR, potR * 0.8, potH, 'pot', 0, 0, 0, 20)];
  const n = big ? 14 : 7;
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const r = (big ? 0.22 : 0.1) * rand();
    const y = potH + (big ? 0.2 + rand() * 1.1 : 0.05 + rand() * 0.25);
    const leaf = M(sphereGeo(big ? 0.13 : 0.07, 10), rand() > 0.5 ? 'leaf' : 'leaf2', Math.cos(a) * r, y, Math.sin(a) * r);
    leaf.scale.set(1, 0.55 + rand() * 0.5, 1.3);
    leaf.rotation.set(rand(), rand() * 3, rand());
    parts.push(leaf);
  }
  if (big) parts.push(C(0.012, 0.015, 1.1, 'woodwork', 0, potH, 0, 6));
  return group(parts);
}

function floorLamp() {
  return group(C(0.16, 0.18, 0.025, 'metal', 0, 0, 0, 28), C(0.012, 0.012, 1.45, 'metal', 0, 0.02, 0, 8), M(cylGeo(0.17, 0.24, 0.3, 28, true), 'lampShade', 0, 1.35, 0), M(sphereGeo(0.04), 'bulb', 0, 1.42, 0, { shadow: false }));
}

function sideTable() {
  return group(C(0.22, 0.22, 0.03, 'woodwork', 0, 0.5, 0, 28), C(0.03, 0.03, 0.5, 'metal', 0, 0, 0, 10), C(0.14, 0.14, 0.02, 'metal', 0, 0, 0, 20));
}

function art({ w = 0.9, h = 0.65, palette }) {
  const g = group(B(w, h, 0.035, 'woodwork', 0, 0, 0, 0.004), B(w - 0.06, h - 0.06, 0.01, 'art2', 0, 0.03, 0.02), B((w - 0.06) * 0.45, (h - 0.06) * 0.55, 0.012, 'art', -(w - 0.06) * 0.12, 0.06, 0.024));
  if (palette) {
    // 画面用梦想家配色
    g.children[1].material = LIB.fixed.art2;
  }
  return g;
}

function altar({ w = 1.2 }) {
  return group(
    B(w, 0.85, 0.5, 'cabinetry', 0, 0, 0, 0.004),
    ...doors(w - 0.02, 0.6, 0.06, 0.255, 'cabinetry', { handle: 'knob', maxW: 0.6, depth: 0.012 }),
    B(w, 0.04, 0.5, 'countertop', 0, 0.85, 0, 0.004),
    B(w, 1.1, 0.03, 'cabinetry', 0, 0.89, -0.235),
    B(w * 0.62, 0.62, 0.012, 'altarRed', 0, 1.12, -0.215),
    B(w * 0.5, 0.36, 0.22, 'woodwork', 0, 0.89, -0.1, 0.01),
    C(0.05, 0.06, 0.08, 'metal', -w * 0.3, 0.89, 0.08, 16),
    C(0.05, 0.06, 0.08, 'metal', w * 0.3, 0.89, 0.08, 16),
    M(sphereGeo(0.05), 'altarRed', -w * 0.38, 1.6, -0.15),
    M(sphereGeo(0.05), 'altarRed', w * 0.38, 1.6, -0.15)
  );
}

// ───────────────────────── 餐厅 ─────────────────────────

function chair() {
  return group(
    ...[
      [-0.19, -0.19],
      [0.19, -0.19],
      [-0.19, 0.19],
      [0.19, 0.19],
    ].map(([x, z]) => B(0.032, 0.45, 0.032, 'woodwork', x, 0, z, 0.008)),
    B(0.46, 0.06, 0.44, 'upholstery', 0, 0.44, 0.01, 0.025),
    B(0.44, 0.28, 0.03, 'woodwork', 0, 0.56, -0.2, 0.01, { rx: -0.08 }),
    B(0.03, 0.4, 0.03, 'woodwork', -0.2, 0.44, -0.2),
    B(0.03, 0.4, 0.03, 'woodwork', 0.2, 0.44, -0.2)
  );
}

function diningTable({ w = 1.6, d = 0.9, variant = 'rect', seats = 6 }) {
  const parts = [];
  if (variant === 'round') {
    parts.push(C(w / 2, w / 2, 0.04, 'woodwork', 0, 0.72, 0, 48), C(0.08, 0.28, 0.72, 'woodwork', 0, 0, 0, 24));
    const n = Math.max(4, seats);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = chair();
      c.position.set(Math.sin(a) * (w / 2 + 0.12), 0, Math.cos(a) * (w / 2 + 0.12));
      c.rotation.y = a + Math.PI;
      parts.push(c);
    }
  } else {
    parts.push(B(w, 0.045, d, 'woodwork', 0, 0.715, 0, 0.01));
    for (const sx of [-1, 1]) parts.push(B(0.08, 0.715, d - 0.2, 'woodwork', sx * (w / 2 - 0.22), 0, 0, 0.01));
    parts.push(B(w - 0.5, 0.05, 0.06, 'woodwork', 0, 0.3, 0));
    const per = Math.max(1, Math.floor(seats / 2));
    for (let i = 0; i < per; i++) {
      const x = -((per - 1) * 0.62) / 2 + i * 0.62;
      for (const s of [-1, 1]) {
        const c = chair();
        c.position.set(x, 0, s * (d / 2 + 0.12));
        c.rotation.y = s > 0 ? Math.PI : 0;
        parts.push(c);
      }
    }
    parts.push(C(0.12, 0.1, 0.12, 'pot', 0, 0.76, 0, 20), B(0.5, 0.005, 0.3, 'accents', 0, 0.76, 0, 0));
  }
  return group(parts);
}

function pendant({ drop = 0.9, h = 2.8 }) {
  const y = h - drop;
  return group(C(0.004, 0.004, drop, 'black', 0, y + 0.2, 0, 4, { shadow: false }), M(cylGeo(0.06, 0.26, 0.22, 32, true), 'metal', 0, y, 0), M(sphereGeo(0.05), 'bulb', 0, y + 0.04, 0, { shadow: false }));
}

function sideboard({ w = 1.8 }) {
  return group(
    B(w, 0.62, 0.45, 'cabinetry', 0, 0.16, 0, 0.006),
    ...doors(w - 0.02, 0.58, 0.18, 0.226, 'cabinetry', { maxW: 0.6, depth: 0.012, handle: 'bar', vertical: false }),
    ...[-1, 1].map((s) => B(0.04, 0.16, 0.04, 'metal', s * (w / 2 - 0.08), 0, 0.12)),
    ...[-1, 1].map((s) => B(0.04, 0.16, 0.04, 'metal', s * (w / 2 - 0.08), 0, -0.12)),
    C(0.08, 0.1, 0.32, 'accents', -w / 3, 0.78, 0, 18),
    B(0.36, 0.05, 0.25, 'woodwork', w / 4, 0.78, 0, 0.01)
  );
}

// ───────────────────────── 厨房 ─────────────────────────

/** 一排橱柜：L 长；opts.gaps = [{a,b}] 吊柜要避开的范围（窗）；sink/hob 位置（0–1） */
function kitchenRun({ w = 3, h = 2.8, upper = true, sink = 0.3, hob = 0.72, gaps = [] }) {
  const parts = [];
  const D = 0.6;
  parts.push(B(w, 0.1, D - 0.06, 'black', 0, 0, -0.03));
  parts.push(B(w, 0.76, D - 0.02, 'cabinetry', 0, 0.1, -0.01, 0.003));
  parts.push(...doors(w - 0.01, 0.74, 0.11, D / 2 - 0.005, 'cabinetry', { maxW: 0.6, depth: 0.018, handle: 'bar', vertical: false }));
  parts.push(B(w, 0.04, D + 0.02, 'countertop', 0, 0.86, 0.01, 0.004));
  parts.push(B(w, 0.6, 0.02, 'countertop', 0, 0.9, -D / 2 + 0.01));
  if (sink != null) {
    const sx = -w / 2 + w * sink;
    parts.push(B(0.6, 0.012, 0.42, 'steel', sx, 0.895, 0.02), B(0.54, 0.01, 0.36, 'black', sx, 0.896, 0.02));
    parts.push(C(0.015, 0.015, 0.3, 'metal', sx, 0.9, -0.22, 10), B(0.02, 0.02, 0.2, 'metal', sx, 1.18, -0.13));
  }
  if (hob != null) {
    const hx = -w / 2 + w * hob;
    parts.push(B(0.7, 0.012, 0.5, 'tv', hx, 0.9, 0.02));
    for (const [dx, dz] of [
      [-0.17, -0.1],
      [0.17, -0.1],
      [-0.17, 0.12],
      [0.17, 0.12],
    ])
      parts.push(M(new THREE.TorusGeometry(0.07, 0.006, 6, 24), 'steel', hx + dx, 0.915, 0.02 + dz, { rx: Math.PI / 2, shadow: false }));
    if (upper) parts.push(B(0.9, 0.42, 0.5, 'metal', hx, 1.62, -0.05, 0.01), B(0.3, h - 2.04, 0.3, 'metal', hx, 2.04, -0.15));
  }
  if (upper) {
    const segs = [];
    let at = -w / 2;
    const hx = hob != null ? -w / 2 + w * hob : null;
    const blocks = [...gaps.map((g) => ({ a: g.a - w / 2, b: g.b - w / 2 })), ...(hx != null ? [{ a: hx - 0.46, b: hx + 0.46 }] : [])].sort((p, q) => p.a - q.a);
    for (const b of blocks) {
      if (b.a > at + 0.3) segs.push([at, b.a]);
      at = Math.max(at, b.b);
    }
    if (w / 2 > at + 0.3) segs.push([at, w / 2]);
    for (const [a, b] of segs) {
      const L = b - a;
      const cx = (a + b) / 2;
      parts.push(B(L, 0.72, 0.34, 'cabinetry', cx, 1.52, -D / 2 + 0.17, 0.003));
      parts.push(...doors(L - 0.01, 0.7, 1.53, -D / 2 + 0.345, 'cabinetry', { maxW: 0.5, depth: 0.014 }).map((m) => ((m.position.x += cx), m)));
      parts.push(led(L - 0.06, cx, 1.505, -D / 2 + 0.3));
      if (2.24 + 0.05 < h - 0.05) parts.push(B(L, h - 2.25, 0.34, 'cabinetry', cx, 2.25, -D / 2 + 0.17));
    }
  }
  parts.push(C(0.07, 0.08, 0.2, 'pot', w / 2 - 0.25, 0.9, -0.1, 16), B(0.32, 0.02, 0.22, 'woodwork', -w / 2 + 0.3, 0.9, 0, 0.005));
  return group(parts);
}

function fridge() {
  return group(B(0.86, 1.86, 0.7, 'steel', 0, 0, 0, 0.02), B(0.004, 1.8, 0.01, 'black', 0, 0.03, 0.352), B(0.02, 0.6, 0.03, 'chrome', -0.05, 0.9, 0.365), B(0.02, 0.6, 0.03, 'chrome', 0.05, 0.9, 0.365));
}

function tallUnit({ w = 0.6, h = 2.4 }) {
  return group(B(w, h, 0.6, 'cabinetry', 0, 0, 0, 0.003), ...doors(w - 0.01, h - 0.12, 0.11, 0.305, 'cabinetry', { maxW: 0.6, depth: 0.016, handle: 'bar' }));
}

function island({ w = 1.8, d = 0.9 }) {
  return group(
    B(w, 0.86, d, 'cabinetry', 0, 0, 0, 0.004),
    B(w + 0.06, 0.05, d + 0.06, 'countertop', 0, 0.86, 0, 0.006),
    C(0.12, 0.1, 0.08, 'accents', -w / 4, 0.91, 0, 20),
    ...[-0.5, 0, 0.5].map((x) => {
      const s = C(0.17, 0.17, 0.05, 'upholstery', x * w * 0.6, 0.62, d / 2 + 0.32, 20);
      return s;
    }),
    ...[-0.5, 0, 0.5].map((x) => C(0.02, 0.02, 0.62, 'metal', x * w * 0.6, 0, d / 2 + 0.32, 8))
  );
}

// ───────────────────────── 卧室 ─────────────────────────

function bed({ w = 1.6, d = 2.05 }) {
  const parts = [];
  parts.push(B(w + 0.08, 0.26, d, 'woodwork', 0, 0.06, 0, 0.02));
  parts.push(B(w, 0.24, d - 0.06, 'mattress', 0, 0.3, 0.02, 0.06));
  parts.push(B(w + 0.06, 0.1, d * 0.66, 'bedding', 0, 0.5, d * 0.17, 0.05));
  parts.push(B(w + 0.1, 0.2, 0.08, 'bedding', 0, 0.36, d / 2 + 0.03, 0.04));
  const pw = Math.min(0.66, (w - 0.1) / 2);
  for (const s of w > 1.3 ? [-1, 1] : [0]) parts.push(B(pw, 0.14, 0.42, 'bedding', s * (pw / 2 + 0.03), 0.54, -d / 2 + 0.3, 0.07, { rx: -0.25 }));
  parts.push(B(w * 0.5, 0.12, 0.36, 'accents', w * 0.12, 0.56, -d / 2 + 0.52, 0.06, { rx: -0.1, ry: 0.1 }));
  parts.push(B(w + 0.1, 0.03, 0.55, 'accents', 0, 0.6, d / 2 - 0.4, 0.01));
  const hb = w + 0.16;
  const n = Math.max(3, Math.round(hb / 0.32));
  for (let i = 0; i < n; i++) parts.push(B(hb / n - 0.01, 1.0, 0.1, 'upholstery', -hb / 2 + (hb / n) * (i + 0.5), 0.12, -d / 2 - 0.02, 0.04));
  return group(parts);
}

function nightstand() {
  return group(
    B(0.5, 0.42, 0.42, 'woodwork', 0, 0.12, 0, 0.01),
    B(0.46, 0.003, 0.01, 'black', 0, 0.36, 0.212),
    ...[-0.2, 0.2].map((x) => B(0.03, 0.12, 0.03, 'woodwork', x, 0, -0.16)),
    ...[-0.2, 0.2].map((x) => B(0.03, 0.12, 0.03, 'woodwork', x, 0, 0.16)),
    C(0.06, 0.08, 0.26, 'metal', 0.05, 0.54, -0.05, 16),
    M(cylGeo(0.1, 0.15, 0.2, 24, true), 'lampShade', 0.05, 0.78, -0.05),
    M(sphereGeo(0.03), 'bulb', 0.05, 0.82, -0.05, { shadow: false }),
    B(0.18, 0.04, 0.13, 'accents', -0.12, 0.54, 0.05, 0.01)
  );
}

function wardrobe({ w = 2.4, h = 2.6, handle = 'none' }) {
  const D = 0.6;
  return group(
    B(w, 0.08, D - 0.06, 'black', 0, 0, -0.03),
    B(w, h - 0.08, D - 0.02, 'cabinetry', 0, 0.08, -0.01, 0.003),
    ...doors(w - 0.01, h - 0.1, 0.09, D / 2 - 0.005, 'cabinetry', { maxW: 0.5, depth: 0.02, handle: handle === 'none' ? 'none' : 'bar' }),
    ...(handle === 'none' ? [B(w - 0.02, 0.025, 0.01, 'black', 0, h - 0.06, D / 2 + 0.012)] : [])
  );
}

function dresser({ w = 1.2 }) {
  return group(
    B(w, 0.72, 0.45, 'cabinetry', 0, 0.06, 0, 0.006),
    ...[0, 1, 2].map((i) => B(w - 0.02, 0.22, 0.015, 'cabinetry', 0, 0.08 + i * 0.235, 0.232, 0.004)),
    ...[0, 1, 2].map((i) => B(0.18, 0.012, 0.02, 'metal', 0, 0.2 + i * 0.235, 0.245)),
    B(0.6, 0.8, 0.02, 'mirror', 0, 1.0, -0.2, 0.01),
    C(0.05, 0.05, 0.12, 'accents', w / 3, 0.78, 0, 16)
  );
}

function desk({ w = 1.4, d = 0.65 }) {
  return group(
    B(w, 0.035, d, 'woodwork', 0, 0.72, 0, 0.008),
    ...[-1, 1].map((s) => B(0.04, 0.72, d - 0.08, 'metal', s * (w / 2 - 0.06), 0, 0)),
    B(0.56, 0.33, 0.02, 'tv', 0.05, 0.92, -d / 2 + 0.12, 0.006),
    B(0.54, 0.3, 0.004, 'screen', 0.05, 0.935, -d / 2 + 0.132),
    B(0.06, 0.18, 0.06, 'black', 0.05, 0.755, -d / 2 + 0.1),
    B(0.36, 0.015, 0.13, 'black', 0.05, 0.755, -0.02),
    C(0.07, 0.08, 0.03, 'metal', -w / 2 + 0.2, 0.755, -d / 2 + 0.15, 16),
    C(0.008, 0.008, 0.38, 'metal', -w / 2 + 0.2, 0.78, -d / 2 + 0.15, 6),
    M(cylGeo(0.04, 0.09, 0.1, 20, true), 'lampShade', -w / 2 + 0.2, 1.1, -d / 2 + 0.2, { rx: 0.4 }),
    officeChair(0.05, 0.42)
  );
}

function officeChair(x = 0, z = 0) {
  const g = group(
    C(0.28, 0.28, 0.03, 'black', 0, 0.04, 0, 5),
    C(0.025, 0.025, 0.4, 'metal', 0, 0.05, 0, 8),
    B(0.5, 0.08, 0.48, 'upholstery', 0, 0.45, 0, 0.03),
    B(0.46, 0.5, 0.06, 'upholstery', 0, 0.55, 0.24, 0.03, { rx: 0.1 })
  );
  g.position.set(x, 0, z);
  return g;
}

function kidsBed({ w = 1.0, d = 2.0 }) {
  const g = bed({ w, d });
  g.add(B(0.6, 0.3, 0.4, 'accents', w / 2 + 0.45, 0, d / 2 - 0.3, 0.05));
  g.add(M(sphereGeo(0.09), 'accents', w / 2 + 0.3, 0.39, d / 2 - 0.3));
  return g;
}

function toyStorage({ w = 1.2 }) {
  const parts = [B(w, 0.6, 0.38, 'cabinetry', 0, 0, 0, 0.01)];
  const cols = ['#E8B44A', '#7DA3C9', '#E07A5F', '#81B29A'];
  const n = Math.max(2, Math.round(w / 0.3));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(boxGeo(w / n - 0.04, 0.24, 0.3, 0.02), new THREE.MeshStandardMaterial({ color: cols[i % 4], roughness: 0.8 }));
    m.position.set(-w / 2 + (w / n) * (i + 0.5), 0.04, 0.05);
    m.castShadow = true;
    parts.push(m);
  }
  return group(parts);
}

function petBed() {
  const ring = M(new THREE.TorusGeometry(0.3, 0.1, 12, 32), 'accents', 0, 0.1, 0, { rx: Math.PI / 2 });
  return group(ring, C(0.3, 0.3, 0.05, 'bedding', 0, 0.02, 0, 32), M(sphereGeo(0.07), 'upholstery', 0.08, 0.1, 0.05));
}

// ───────────────────────── 玄关 / 卫浴 / 阳台 ─────────────────────────

function shoeCabinet({ w = 1.5, h = 2.5 }) {
  const D = 0.38;
  return group(
    B(w, 0.85, D, 'cabinetry', 0, 0.15, 0, 0.004),
    ...doors(w - 0.01, 0.83, 0.16, D / 2 + 0.002, 'cabinetry', { maxW: 0.45, depth: 0.016 }),
    led(w - 0.06, 0, 0.14, 0.05),
    B(w, 0.03, D, 'countertop', 0, 1.0, 0, 0.004),
    B(w, h - 1.38, D, 'cabinetry', 0, 1.38, 0, 0.004),
    ...doors(w - 0.01, h - 1.4, 1.39, D / 2 + 0.002, 'cabinetry', { maxW: 0.45, depth: 0.016 }),
    led(w - 0.06, 0, 1.37, 0.05),
    B(w, 0.38, 0.02, 'feature', 0, 1.0, -D / 2 + 0.01),
    C(0.07, 0.06, 0.16, 'pot', w / 3, 1.03, 0, 16),
    B(0.3, 0.04, 0.2, 'woodwork', -w / 4, 1.03, 0, 0.01)
  );
}

function bench({ w = 1.0 }) {
  return group(B(w, 0.06, 0.38, 'woodwork', 0, 0.4, 0, 0.01), B(w - 0.04, 0.06, 0.36, 'upholstery', 0, 0.46, 0, 0.025), ...[-1, 1].map((s) => B(0.04, 0.4, 0.34, 'woodwork', s * (w / 2 - 0.05), 0, 0)));
}

function vanity({ w = 0.9 }) {
  return group(
    B(w, 0.48, 0.48, 'cabinetry', 0, 0.36, 0, 0.004),
    ...doors(w - 0.01, 0.46, 0.37, 0.243, 'cabinetry', { maxW: 0.5, depth: 0.012 }),
    B(w, 0.04, 0.5, 'countertop', 0, 0.84, 0, 0.004),
    C(0.2, 0.17, 0.1, 'porcelain', 0, 0.88, 0.04, 32),
    C(0.012, 0.012, 0.22, 'metal', 0, 0.88, -0.18, 10),
    B(0.015, 0.015, 0.12, 'metal', 0, 1.09, -0.13),
    B(w - 0.1, 0.8, 0.02, 'mirror', 0, 1.15, -0.23, 0.04),
    led(w - 0.2, 0, 1.13, -0.2)
  );
}

function toilet() {
  return group(B(0.38, 0.4, 0.5, 'porcelain', 0, 0, 0.05, 0.12), B(0.4, 0.06, 0.52, 'porcelain', 0, 0.38, 0.06, 0.08), B(0.4, 0.38, 0.18, 'porcelain', 0, 0.4, -0.2, 0.05));
}

function shower({ w = 0.9, d = 0.9, h = 2.0 }) {
  const glass = B(w, h, 0.01, 'glass', 0, 0.05, d / 2, 0, { shadow: false });
  glass.renderOrder = 2;
  const glass2 = B(0.01, h, d, 'glass', w / 2, 0.05, 0, 0, { shadow: false });
  glass2.renderOrder = 2;
  return group(B(w, 0.05, d, 'tile', 0, 0, 0), glass, glass2, B(0.012, h, 0.03, 'frame', w / 2, 0.05, d / 2), C(0.12, 0.12, 0.02, 'chrome', -w / 4, 1.95, -d / 4, 24), C(0.01, 0.01, 0.3, 'chrome', -w / 4, 1.95, -d / 2 + 0.02, 8, { rx: Math.PI / 2 }));
}

function washer() {
  return group(B(0.6, 0.85, 0.6, 'porcelain', 0, 0, 0, 0.02), M(new THREE.TorusGeometry(0.17, 0.025, 10, 32), 'steel', 0, 0.45, 0.305), C(0.15, 0.15, 0.01, 'glass', 0, 0.45, 0.3, 24, { rx: Math.PI / 2 }));
}

function lounger() {
  return group(
    ...[-1, 1].map((s) => B(0.04, 0.38, 0.75, 'woodwork', s * 0.32, 0, 0, 0.01)),
    B(0.62, 0.1, 0.7, 'upholstery', 0, 0.3, 0.02, 0.04),
    B(0.62, 0.5, 0.1, 'upholstery', 0, 0.38, -0.3, 0.04, { rx: -0.35 }),
    B(0.32, 0.3, 0.1, 'accents', 0, 0.48, -0.18, 0.04, { rx: -0.3 })
  );
}

function curtainPair({ w = 2, h = 2.7 }) {
  const pw = Math.max(0.35, Math.min(0.6, w * 0.22));
  const g1 = M(curtainGeo(pw, h - 0.06, 4, 0.08), 'curtains', -w / 2 - pw / 2 + 0.18, 0.02, 0);
  const g2 = M(curtainGeo(pw, h - 0.06, 4, 0.08), 'curtains', w / 2 + pw / 2 - 0.18, 0.02, 0);
  g1.material = g2.material = LIB.slot('curtains');
  LIB.slot('curtains').side = THREE.DoubleSide;
  return group(g1, g2, B(w + 0.6, 0.03, 0.03, 'metal', 0, h - 0.06, 0));
}

// ───────────────────────── 目录 ─────────────────────────

export const CATALOG = {
  sofa: { zh: '沙发', en: 'Sofa', icon: '🛋️', build: sofa, slot: 'upholstery', size: [2.2, 0.92], variants: ['classic', 'curvy', 'lshape'] },
  armchair: { zh: '单椅', en: 'Armchair', icon: '💺', build: armchair, slot: 'upholstery', size: [0.8, 0.8], variants: ['classic', 'lounge'] },
  coffeeTable: { zh: '茶几', en: 'Coffee table', icon: '☕', build: coffeeTable, slot: 'woodwork', size: [1.0, 0.6], variants: ['round', 'rect', 'stone'] },
  rug: { zh: '地毯', en: 'Rug', icon: '🟫', build: rug, slot: 'rugs', size: [2.4, 1.7], variants: ['rect', 'round'], flat: true },
  tvWall: { zh: '电视墙', en: 'TV wall', icon: '📺', build: tvWall, slot: 'feature', size: [2.6, 0.45], wall: true },
  featureWall: { zh: '主题墙', en: 'Feature wall', icon: '🪵', build: featureWall, slot: 'feature', size: [2.4, 0.06], wall: true },
  bookshelf: { zh: '书墙', en: 'Bookshelf', icon: '📚', build: bookshelf, slot: 'woodwork', size: [1.2, 0.34] },
  displayCabinet: { zh: '展示柜', en: 'Display cabinet', icon: '🏺', build: displayCabinet, slot: 'cabinetry', size: [1.2, 0.42] },
  plant: { zh: '绿植', en: 'Plant', icon: '🪴', build: plant, slot: 'accents', size: [0.45, 0.45], variants: ['tall', 'small'] },
  floorLamp: { zh: '落地灯', en: 'Floor lamp', icon: '💡', build: floorLamp, slot: 'metal', size: [0.4, 0.4] },
  sideTable: { zh: '边几', en: 'Side table', icon: '⚪', build: sideTable, slot: 'woodwork', size: [0.45, 0.45] },
  art: { zh: '挂画', en: 'Art', icon: '🖼️', build: art, slot: 'woodwork', size: [0.9, 0.04], wallMounted: 1.45 },
  altar: { zh: '神台', en: 'Altar', icon: '🙏', build: altar, slot: 'cabinetry', size: [1.2, 0.5] },
  diningTable: { zh: '餐桌', en: 'Dining table', icon: '🍽️', build: diningTable, slot: 'woodwork', size: [1.6, 0.9], variants: ['rect', 'round'] },
  chair: { zh: '餐椅', en: 'Chair', icon: '🪑', build: chair, slot: 'woodwork', size: [0.46, 0.46] },
  pendant: { zh: '吊灯', en: 'Pendant', icon: '🔆', build: pendant, slot: 'metal', size: [0.5, 0.5], ceiling: true },
  sideboard: { zh: '餐边柜', en: 'Sideboard', icon: '🗄️', build: sideboard, slot: 'cabinetry', size: [1.8, 0.45] },
  kitchenRun: { zh: '橱柜', en: 'Kitchen run', icon: '🍳', build: kitchenRun, slot: 'cabinetry', size: [3, 0.6] },
  fridge: { zh: '冰箱', en: 'Fridge', icon: '🧊', build: fridge, slot: 'cabinetry', size: [0.86, 0.7] },
  tallUnit: { zh: '高柜', en: 'Tall unit', icon: '🚪', build: tallUnit, slot: 'cabinetry', size: [0.6, 0.6] },
  island: { zh: '岛台', en: 'Island', icon: '🏝️', build: island, slot: 'countertop', size: [1.8, 0.9] },
  bed: { zh: '床', en: 'Bed', icon: '🛏️', build: bed, slot: 'bedding', size: [1.6, 2.05] },
  kidsBed: { zh: '儿童床', en: 'Kids bed', icon: '🧸', build: kidsBed, slot: 'bedding', size: [1.0, 2.0] },
  nightstand: { zh: '床头柜', en: 'Nightstand', icon: '🕯️', build: nightstand, slot: 'woodwork', size: [0.5, 0.42] },
  wardrobe: { zh: '衣柜', en: 'Wardrobe', icon: '👗', build: wardrobe, slot: 'cabinetry', size: [2.4, 0.6] },
  dresser: { zh: '梳妆台', en: 'Dresser', icon: '🪞', build: dresser, slot: 'cabinetry', size: [1.2, 0.45] },
  desk: { zh: '书桌', en: 'Desk', icon: '💻', build: desk, slot: 'woodwork', size: [1.4, 0.65] },
  toyStorage: { zh: '玩具柜', en: 'Toy storage', icon: '🧩', build: toyStorage, slot: 'cabinetry', size: [1.2, 0.38] },
  petBed: { zh: '宠物窝', en: 'Pet bed', icon: '🐾', build: petBed, slot: 'accents', size: [0.8, 0.8] },
  shoeCabinet: { zh: '鞋柜', en: 'Shoe cabinet', icon: '👟', build: shoeCabinet, slot: 'cabinetry', size: [1.5, 0.38] },
  bench: { zh: '换鞋凳', en: 'Bench', icon: '🪵', build: bench, slot: 'woodwork', size: [1.0, 0.38] },
  vanity: { zh: '浴室柜', en: 'Vanity', icon: '🚰', build: vanity, slot: 'countertop', size: [0.9, 0.5] },
  toilet: { zh: '马桶', en: 'Toilet', icon: '🚽', build: toilet, slot: 'tile', size: [0.4, 0.7] },
  shower: { zh: '淋浴', en: 'Shower', icon: '🚿', build: shower, slot: 'tile', size: [0.9, 0.9] },
  washer: { zh: '洗衣机', en: 'Washer', icon: '🧺', build: washer, slot: 'cabinetry', size: [0.6, 0.6] },
  lounger: { zh: '休闲椅', en: 'Lounger', icon: '🏖️', build: lounger, slot: 'upholstery', size: [0.7, 0.75] },
  curtains: { zh: '窗帘', en: 'Curtains', icon: '🪟', build: curtainPair, slot: 'curtains', size: [2, 0.1], wall: true },
};

/** 家具数据 → THREE.Group（userData 带上 id，供点选 / 拖动） */
export function buildItem(item, ctx = {}) {
  const def = CATALOG[item.kind];
  if (!def) return null;
  const g = def.build({ ...item, h: item.h || ctx.wallH || 2.8, palette: ctx.palette, key: item.key });
  g.position.set(item.x, item.y || 0, item.z);
  g.rotation.y = ((item.rot || 0) * Math.PI) / 180;
  g.userData = { itemId: item.id, kind: item.kind };
  g.traverse((o) => {
    if (o.isMesh) o.userData.itemId = item.id;
  });
  return g;
}
