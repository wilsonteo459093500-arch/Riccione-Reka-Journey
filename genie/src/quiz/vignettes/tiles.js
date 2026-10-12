// 宝藏页的柜子小样 —— 一格一格的「小照片」（正面平行投影、微微俯视），在 steps.jsx 里按客人数的数量拼成柜子。
// 每一格都是一个完整的小格子（侧板、顶板、底板、背板），拼在一起就像一组组合柜；
// 光从左上前方来（和直觉牌的小照片同一个方向），每一格的光影都一样，怎么拼都对得上。

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { bookRowInto, vesselInto } from './sets.js';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function rbox(w, h, d, r = 0.004, seg = 2) {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  g.translate(0, h / 2, 0);
  return g;
}

function tileLight(S) {
  S.sun({ az: 146, el: 40, color: '#FFF4E6', intensity: 2.5, spread: 6 });
  S.sky({ intensity: 0 });
  S.hemi = { sky: '#F5F1EA', ground: '#9C9284', intensity: 0.6 };
  S.scene.environmentIntensity = 0.5;
  S.scene.background = new THREE.Color('#E8E1D3');
  S.exposure = 1.0;
  S.ao = 0.85;
  S.aoRadius = 0.05;
  S.quality = 0.9;
}

/** 一个开口朝前的小格子：前面在 z = 0，深 d；wood = 板材，back = 背板 */
function cubby(S, { w, h, d, t, wood, back }) {
  S.box(t, h, d, wood, [-w / 2 + t / 2, 0, -d / 2]);
  S.box(t, h, d, wood, [w / 2 - t / 2, 0, -d / 2]);
  S.box(w - 2 * t, t, d, wood, [0, 0, -d / 2]);
  S.box(w - 2 * t, t, d, wood, [0, h - t, -d / 2]);
  S.box(w - 2 * t, h - 2 * t, 0.006, back || wood, [0, t, -d + 0.003]);
  // 上面一格的底板：只为了投下影子（画面外）
  S.box(w + 0.2, 0.05, d, wood, [0, h + 0.002, -d / 2]);
}

// ───────────────────────── 鞋 ─────────────────────────

/** 鞋的侧面轮廓（脚跟在 x = 0，脚尖在 x = L） */
function shoeShape(kind) {
  const s = new THREE.Shape();
  if (kind === 'boot') {
    s.moveTo(0.0, 0.012);
    s.bezierCurveTo(-0.006, 0.06, -0.002, 0.13, 0.008, 0.165);
    s.lineTo(0.085, 0.165);
    s.bezierCurveTo(0.09, 0.12, 0.11, 0.08, 0.16, 0.06);
    s.bezierCurveTo(0.21, 0.052, 0.25, 0.042, 0.252, 0.02);
    s.lineTo(0.0, 0.012);
  } else if (kind === 'loafer') {
    s.moveTo(0.0, 0.012);
    s.bezierCurveTo(-0.004, 0.035, 0.0, 0.055, 0.012, 0.06);
    s.lineTo(0.09, 0.052);
    s.bezierCurveTo(0.13, 0.06, 0.17, 0.056, 0.2, 0.046);
    s.bezierCurveTo(0.235, 0.04, 0.255, 0.03, 0.256, 0.016);
    s.lineTo(0.0, 0.012);
  } else {
    s.moveTo(0.0, 0.014);
    s.bezierCurveTo(-0.004, 0.05, 0.0, 0.082, 0.02, 0.09);
    s.lineTo(0.08, 0.086);
    s.bezierCurveTo(0.12, 0.074, 0.16, 0.064, 0.2, 0.05);
    s.bezierCurveTo(0.235, 0.044, 0.262, 0.034, 0.262, 0.018);
    s.lineTo(0.0, 0.014);
  }
  return s;
}

function shoe(S, { x, z, a, kind, upper, sole, s = 1 }) {
  const g = new THREE.ExtrudeGeometry(shoeShape(kind), { depth: 0.064, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 4, curveSegments: 20 });
  g.translate(-0.13, 0, -0.031);
  const m = S.mesh(g, upper, [x, 0, z], { ry: a, s });
  // 鞋口：一块深色的椭圆（一眼看出是「鞋」不是「块」）
  const top = kind === 'boot' ? [0.046, 0.166, 0.034] : kind === 'loafer' ? [0.05, 0.057, 0.038] : [0.05, 0.088, 0.034];
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.004, 32), new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 0.95 }));
  hole.scale.set(top[2], 1, 0.026);
  hole.position.set(top[0] - 0.13, top[1] + 0.006, 0);
  hole.rotation.z = kind === 'boot' ? 0 : -0.06;
  m.add(hole);
  if (sole) {
    const sg = new THREE.ExtrudeGeometry(
      (() => {
        const p = new THREE.Shape();
        p.moveTo(-0.004, 0);
        p.lineTo(0.262, 0);
        p.bezierCurveTo(0.272, 0.004, 0.272, 0.02, 0.262, 0.022);
        p.lineTo(-0.004, 0.022);
        p.lineTo(-0.004, 0);
        return p;
      })(),
      { depth: 0.07, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 3, curveSegments: 10 }
    );
    sg.translate(-0.13, 0, -0.035);
    S.mesh(sg, sole, [x, 0, z], { ry: a, s });
  }
  return m;
}

const SHOES = [
  { kind: 'sneaker', upper: ['#EEEAE2', 0.62], sole: '#F8F6F1' },
  { kind: 'loafer', upper: 'cognac-leather' },
  { kind: 'boot', upper: 'black-leather' },
  { kind: 'sneaker', upper: ['#2E3A55', 0.7], sole: '#F2EFE8' },
];

function shoeTile(S, h, variant) {
  const W = 0.3;
  const Hh = 0.3;
  const D = 0.35;
  const t = 0.016;
  const oak = h.pbr('white-oak', { R: 512 });
  cubby(S, { w: W, h: Hh, d: D, t, wood: oak });
  if (variant > 0) {
    const sp = SHOES[(variant - 1) % SHOES.length];
    const upper = Array.isArray(sp.upper) ? h.plain(sp.upper[0], { rough: sp.upper[1] }) : h.pbr(sp.upper, { R: 512 });
    const sole = sp.sole ? h.plain(sp.sole, { rough: 0.55 }) : null;
    const g = new THREE.Group();
    g.position.y = t;
    S.add(g);
    // 一双鞋侧着放（一眼认得出是鞋）：后面那只往里退一点
    const k = 0.8;
    shoeAt(S, g, { x: 0.004, z: -0.24, a: 0.1, kind: sp.kind, upper, sole, s: k });
    shoeAt(S, g, { x: -0.012, z: -0.13, a: 0.18, kind: sp.kind, upper, sole, s: k });
  }
  S.ortho({ center: [0, Hh / 2, 0], w: W, h: Hh, tilt: 13, px: 200 });
  tileLight(S);
}

/** 把鞋放进一个组（底板上） */
function shoeAt(S, group, o) {
  const tmp = new THREE.Group();
  const add = S.add.bind(S);
  S.add = (m) => tmp.add(m);
  shoe(S, o);
  S.add = add;
  group.add(tmp);
}

// ───────────────────────── 书 ─────────────────────────

function bookTile(S, h, variant) {
  const W = 0.8;
  const Hh = 0.36;
  const D = 0.32;
  const t = 0.018;
  const walnut = h.pbr('walnut', { R: 512 });
  cubby(S, { w: W, h: Hh, d: D, t, wood: walnut });
  if (variant > 0) {
    const rand = rng(variant * 97 + 11);
    const mats = (c) => h.plain(c, { rough: 0.78 });
    const x0 = -W / 2 + t + 0.012;
    const x1 = W / 2 - t - 0.012;
    if (variant === 1) bookRowInto(S, { x0, x1, y: t, z: -0.04, maxH: Hh - 2 * t - 0.01, rand, mats });
    else if (variant === 2) {
      bookRowInto(S, { x0, x1: x1 - 0.17, y: t, z: -0.04, maxH: Hh - 2 * t - 0.01, rand, mats });
      vesselInto(S, { x: x1 - 0.08, y: t, z: -0.16, h: 0.2, r: 0.055, style: 'bud', mat: h.plain('#C9B28F', { rough: 0.45 }) });
    } else {
      for (let i = 0; i < 4; i++) S.mesh(rbox(0.2, 0.026, 0.15, 0.002, 1), mats(['#E8E1D3', '#5E4A3A', '#BCA582', '#2F3B42'][i]), [x0 + 0.12, t + i * 0.026, -0.15], { ry: (rand() - 0.5) * 0.15 });
      bookRowInto(S, { x0: x0 + 0.26, x1, y: t, z: -0.04, maxH: Hh - 2 * t - 0.01, rand, mats });
    }
  }
  S.ortho({ center: [0, Hh / 2, 0], w: W, h: Hh, tilt: 9, px: 320 });
  tileLight(S);
}

// ───────────────────────── 藏 vs 展：一格门 / 一格开放 ─────────────────────────

function ratioTile(S, h, variant) {
  const W = 0.6;
  const Hh = 0.4;
  const D = 0.4;
  const t = 0.018;
  const oak = h.pbr('white-oak', { R: 512 });
  cubby(S, { w: W, h: Hh, d: D, t, wood: oak });
  if (variant === 0) {
    // 门：奶油烤漆、四周 2mm 缝、一个小黄铜拉手
    S.box(W - 0.004, Hh - 0.004, 0.019, h.pbr('cream-lacquer', { R: 512 }), [0, 0.002, 0.0095]);
    S.mesh(rbox(0.07, 0.012, 0.016, 0.005, 2), h.pbr('brass', { R: 256 }), [0, Hh - 0.06, 0.027]);
  } else if (variant === 1) {
    vesselInto(S, { x: -0.06, y: t, z: -0.2, h: 0.26, r: 0.08, style: 'amphora', mat: h.plain('#B4694A', { rough: 0.5 }) });
    vesselInto(S, { x: 0.12, y: t, z: -0.18, h: 0.12, r: 0.06, style: 'moon', mat: h.plain('#EDE7DB', { rough: 0.3 }) });
  } else if (variant === 2) {
    const rand = rng(41);
    bookRowInto(S, { x0: -W / 2 + t + 0.02, x1: 0.12, y: t, z: -0.06, maxH: Hh - 2 * t - 0.02, rand, mats: (c) => h.plain(c, { rough: 0.78 }) });
    vesselInto(S, { x: 0.2, y: t, z: -0.2, h: 0.07, r: 0.08, style: 'bowl', mat: h.plain('#3A3936', { rough: 0.35 }) });
  } else {
    S.item('plant', { variant: 'small', seed: 1, x: -0.1, y: t, z: -0.2, s: 0.95 });
    S.mesh(new THREE.SphereGeometry(0.045, 32, 20), h.pbr('brass', { R: 256 }), [0.15, t + 0.045, -0.18]);
  }
  S.ortho({ center: [0, Hh / 2, 0], w: W, h: Hh, tilt: 9, px: 240 });
  tileLight(S);
}

// ───────────────────────── 衣柜门 ─────────────────────────

function doorTile(S, h, side) {
  const W = 0.45;
  const Hh = 2.4;
  S.box(W, Hh, 0.02, h.plain('#1C1A18', { rough: 0.9 }), [0, 0, -0.03]);
  S.box(W - 0.004, Hh - 0.004, 0.019, h.pbr('cream-lacquer', { R: 512 }), [0, 0.002, -0.0095]);
  const hx = side * (W / 2 - 0.045);
  S.mesh(rbox(0.012, 0.6, 0.012, 0.005, 2), h.pbr('brass', { R: 256 }), [hx, 0.9, 0.024]);
  for (const k of [0.06, 0.54]) S.box(0.008, 0.008, 0.026, h.pbr('brass', { R: 256 }), [hx, 0.9 + k, 0.006]);
  S.ortho({ center: [0, Hh / 2, 0], w: W, h: Hh, tilt: 0, px: 96 });
  tileLight(S);
  S.ao = 0.5;
}

export const TILES = {
  'shoe-0': (S, h) => shoeTile(S, h, 0),
  'shoe-1': (S, h) => shoeTile(S, h, 1),
  'shoe-2': (S, h) => shoeTile(S, h, 2),
  'shoe-3': (S, h) => shoeTile(S, h, 3),
  'shoe-4': (S, h) => shoeTile(S, h, 4),
  'book-0': (S, h) => bookTile(S, h, 0),
  'book-1': (S, h) => bookTile(S, h, 1),
  'book-2': (S, h) => bookTile(S, h, 2),
  'book-3': (S, h) => bookTile(S, h, 3),
  'ratio-0': (S, h) => ratioTile(S, h, 0),
  'ratio-1': (S, h) => ratioTile(S, h, 1),
  'ratio-2': (S, h) => ratioTile(S, h, 2),
  'ratio-3': (S, h) => ratioTile(S, h, 3),
  'door-l': (S, h) => doorTile(S, h, -1),
  'door-r': (S, h) => doorTile(S, h, 1),
};
