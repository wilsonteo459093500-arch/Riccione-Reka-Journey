// 直觉牌的 24 个小场景（12 题 × A / B）。每题两张用同一个房间、同一个机位、同一种光，只改那一题要对比的东西 ——
// 客人比的是「暖 vs 清」「藏 vs 展」「圆 vs 方」，不是两张不一样的照片。
// 坐标：x 向右，y 向上，z 朝相机；房间 x ∈ [-w/2, w/2]、z ∈ [-d, 0]。家具「正面」朝 +z，原点在占地中心（米）。
// 内容色（测验刺激）：墙、地板、沙发……对应 flow.js 里每题的 visual 参数，不随 VI 换色。

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

// ───────────────────────── 小物件（工作室家具库里没有的） ─────────────────────────

const BOOK = ['#E8E1D3', '#D9CCB4', '#BCA582', '#8E6F55', '#5E4A3A', '#2F3B42', '#6F7F80', '#A4B19F', '#B5653F', '#C9A65C', '#7B2F2C', '#3D4A5D', '#F3EFE7', '#9B9085', '#C4C9C2'];
const GLAZE = ['#EDE7DB', '#D8C7A8', '#8E6A4E', '#3A3936', '#B4694A', '#A3AE9A', '#F4F1EA', '#C9B28F'];

function rbox(w, h, d, r = 0.01, seg = 3) {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  g.translate(0, h / 2, 0);
  return g;
}

/** 一排竖着的书（偶尔一摞平放 / 一本斜靠） */
function bookRow(S, { x0, x1, y, z, maxH = 0.3, rand, density = 1, mats }) {
  let x = x0;
  while (x < x1 - 0.03) {
    const k = rand();
    if (k < 0.12 / density) {
      x += 0.05 + rand() * 0.08;
      continue;
    }
    if (k < 0.22 && x1 - x > 0.22) {
      // 平放一摞
      const n = 2 + Math.floor(rand() * 3);
      const sw = 0.16 + rand() * 0.05;
      let yy = y;
      for (let i = 0; i < n; i++) {
        const t = 0.02 + rand() * 0.018;
        S.mesh(rbox(sw * (0.9 + rand() * 0.12), t, 0.13 + rand() * 0.04, 0.002, 1), mats(pick(BOOK, rand)), [x + sw / 2, yy, z], { ry: (rand() - 0.5) * 0.12 });
        yy += t;
      }
      x += sw + 0.025;
      continue;
    }
    const n = 4 + Math.floor(rand() * 7);
    for (let i = 0; i < n && x < x1 - 0.02; i++) {
      const bw = 0.017 + rand() * 0.028;
      const bh = Math.min(maxH - 0.015, 0.17 + rand() * 0.11);
      const bd = 0.13 + rand() * 0.06;
      S.mesh(rbox(bw, bh, bd, 0.0025, 1), mats(pick(BOOK, rand)), [x + bw / 2, y, z - (0.19 - bd) / 2]);
      x += bw + 0.0015;
    }
    x += 0.01;
  }
}

/** 花瓶 / 碗 / 罐（旋转体） */
function vessel(S, { x, y, z, h = 0.24, r = 0.07, style = 'amphora', mat }) {
  let p;
  if (style === 'bottle') p = [[0, 0], [r * 0.7, 0], [r * 0.95, h * 0.07], [r, h * 0.3], [r * 0.88, h * 0.56], [r * 0.36, h * 0.74], [r * 0.25, h * 0.88], [r * 0.29, h], [r * 0.19, h], [r * 0.17, h * 0.9], [0.001, h * 0.9]];
  else if (style === 'cyl') p = [[0, 0], [r * 0.95, 0], [r, h * 0.03], [r, h * 0.97], [r * 0.96, h], [r * 0.86, h], [r * 0.86, h * 0.1], [0.001, h * 0.1]];
  else if (style === 'bud') p = [[0, 0], [r * 0.8, 0], [r, h * 0.2], [r * 0.88, h * 0.48], [r * 0.3, h * 0.8], [r * 0.28, h], [r * 0.17, h], [r * 0.16, h * 0.9], [0.001, h * 0.9]];
  else if (style === 'bowl') p = [[0, 0], [r * 0.42, 0], [r * 0.48, h * 0.08], [r * 0.84, h * 0.46], [r, h * 0.97], [r * 0.97, h], [r * 0.91, h * 0.97], [r * 0.76, h * 0.52], [r * 0.38, h * 0.24], [0.001, h * 0.2]];
  else if (style === 'moon') p = [[0, 0], [r * 0.5, 0], [r * 0.9, h * 0.15], [r, h * 0.45], [r * 0.85, h * 0.8], [r * 0.4, h * 0.97], [r * 0.3, h], [r * 0.22, h], [r * 0.2, h * 0.95], [0.001, h * 0.95]];
  else p = [[0, 0], [r * 0.52, 0], [r * 0.6, h * 0.05], [r, h * 0.42], [r * 0.8, h * 0.78], [r * 0.48, h * 0.92], [r * 0.5, h], [r * 0.4, h], [r * 0.38, h * 0.9], [0.001, h * 0.9]];
  return S.lathe(p, mat, [x, y, z]);
}

/** 挂画的画面（程序画的版画 / 抽象画） */
function artTexture(kind, w, h, seed = 1) {
  const c = document.createElement('canvas');
  const k = 512 / Math.max(w, h);
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const x = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  const r = rng(seed);
  const paper = '#EFE8DA';
  x.fillStyle = paper;
  x.fillRect(0, 0, W, H);
  if (kind === 'hills') {
    const cols = ['#C9C6B4', '#A9AE9A', '#7F8C77', '#5E6E5C'];
    cols.forEach((col, i) => {
      x.fillStyle = col;
      x.beginPath();
      x.moveTo(0, H);
      const base = H * (0.45 + i * 0.13);
      for (let px = 0; px <= W; px += 8) x.lineTo(px, base - Math.sin(px / (60 + i * 30) + i * 2 + seed) * H * 0.07 - Math.sin(px / 23 + i) * H * 0.015);
      x.lineTo(W, H);
      x.fill();
    });
    x.fillStyle = '#D9A26A';
    x.beginPath();
    x.arc(W * 0.68, H * 0.3, H * 0.07, 0, Math.PI * 2);
    x.fill();
  } else if (kind === 'arch') {
    x.fillStyle = '#E3D2B8';
    x.fillRect(0, 0, W, H);
    x.fillStyle = '#B87556';
    x.beginPath();
    x.moveTo(W * 0.25, H * 0.88);
    x.lineTo(W * 0.25, H * 0.45);
    x.arc(W * 0.5, H * 0.45, W * 0.25, Math.PI, 0);
    x.lineTo(W * 0.75, H * 0.88);
    x.fill();
    x.fillStyle = '#EFE6D6';
    x.beginPath();
    x.arc(W * 0.5, H * 0.4, W * 0.09, 0, Math.PI * 2);
    x.fill();
  } else if (kind === 'blocks') {
    const cols = ['#C9B28F', '#6E7B65', '#B4694A', '#E6DCCB', '#3E4440'];
    for (let i = 0; i < 4; i++) {
      x.fillStyle = cols[i % cols.length];
      x.fillRect(W * (0.12 + r() * 0.45), H * (0.12 + r() * 0.45), W * (0.25 + r() * 0.3), H * (0.2 + r() * 0.3));
    }
  } else if (kind === 'line') {
    x.strokeStyle = '#2E2B27';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(W * 0.2, H * 0.75);
    x.bezierCurveTo(W * 0.1, H * 0.2, W * 0.6, H * 0.1, W * 0.55, H * 0.5);
    x.bezierCurveTo(W * 0.5, H * 0.9, W * 0.9, H * 0.7, W * 0.8, H * 0.25);
    x.stroke();
  } else if (kind === 'leaf') {
    x.fillStyle = '#E9E4D6';
    x.fillRect(0, 0, W, H);
    x.fillStyle = '#5F7A5A';
    x.save();
    x.translate(W / 2, H * 0.85);
    for (let i = 0; i < 7; i++) {
      x.save();
      x.rotate(-0.9 + i * 0.3);
      x.beginPath();
      x.ellipse(0, -H * 0.3, W * 0.07, H * 0.26, 0, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
    x.restore();
  } else if (kind === 'sea') {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#DCE3E4');
    g.addColorStop(0.55, '#B9C7CB');
    g.addColorStop(0.56, '#8FA3AE');
    g.addColorStop(1, '#5F7383');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  } else if (kind === 'arcs') {
    x.fillStyle = '#ECE8E0';
    x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(120,118,112,0.55)';
    x.lineWidth = W * 0.012;
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.arc(W * 0.5, H * 0.78, W * (0.18 + i * 0.1), Math.PI, 0);
      x.stroke();
    }
    x.fillStyle = '#C9B28F';
    x.beginPath();
    x.arc(W * 0.5, H * 0.78, W * 0.07, Math.PI, 0);
    x.fill();
  } else if (kind === 'dot') {
    x.fillStyle = '#DED3C0';
    x.fillRect(0, 0, W, H);
    x.fillStyle = '#2E2B27';
    x.beginPath();
    x.arc(W * 0.5, H * 0.5, Math.min(W, H) * 0.18, 0, Math.PI * 2);
    x.fill();
  } else {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#E6D6BE');
    g.addColorStop(1, '#B9A27F');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }
  // 纸纹
  const img = x.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 一幅挂在后墙上的画：画框 + 卡纸 + 画面。(x, y) = 画框左下角在墙上的位置（中心 x）；wallZ = 墙面 */
function frameArt(S, { x, y, w, h, wallZ, kind = 'hills', frame, matW = 0.05, seed = 1, round = false }, { plain }) {
  const fw = 0.022;
  const T = 0.03;
  const fm = frame || plain('#2B2622', { rough: 0.55 });
  const z = wallZ + T / 2;
  if (round) {
    const g = new THREE.TorusGeometry(w / 2, 0.012, 12, 64);
    S.mesh(g, fm, [x, y + w / 2, wallZ + 0.014]);
    S.mesh(new THREE.CircleGeometry(w / 2 - 0.006, 64), plain('#CBD3D2', { rough: 0.05, metal: 0.9 }), [x, y + w / 2, wallZ + 0.008], { cast: false });
    return;
  }
  S.box(w, fw, T, fm, [x, y, z - T / 2]);
  S.box(w, fw, T, fm, [x, y + h - fw, z - T / 2]);
  S.box(fw, h - 2 * fw, T, fm, [x - w / 2 + fw / 2, y + fw, z - T / 2]);
  S.box(fw, h - 2 * fw, T, fm, [x + w / 2 - fw / 2, y + fw, z - T / 2]);
  S.box(w - 2 * fw, h - 2 * fw, 0.006, plain('#F4F1EA', { rough: 0.85 }), [x, y + fw, wallZ + 0.004], { cast: false });
  const pw = w - 2 * fw - 2 * matW;
  const ph = h - 2 * fw - 2 * matW;
  const art = new THREE.MeshStandardMaterial({ map: artTexture(kind, pw, ph, seed), roughness: 0.85 });
  S.mesh(new THREE.PlaneGeometry(pw, ph), art, [x, y + fw + matW + ph / 2, wallZ + 0.0075], { cast: false });
}

// ───────────────────────── 光（每种时段一套） ─────────────────────────

function lightWarmEvening(S) {
  S.sun({ az: 130, el: 12, color: '#FFC890', intensity: 3.7, spread: 1.3 });
  S.sky({ color: '#F4CFAA', intensity: 0.6 });
  S.hemi = { sky: '#F6DEC4', ground: '#8A6E52', intensity: 0.3 };
  S.scene.environmentIntensity = 0.2;
  S.exposure = 1.08;
}
function lightCoolMorning(S) {
  S.sun({ az: 122, el: 30, color: '#FFF8F0', intensity: 3.2, spread: 1.5 });
  S.sky({ color: '#E2EBF1', intensity: 1.25 });
  S.hemi = { sky: '#EEF2F3', ground: '#99958D', intensity: 0.42 };
  S.scene.environmentIntensity = 0.32;
  S.exposure = 1.02;
}
function lightDay(S) {
  S.sun({ az: 124, el: 34, color: '#FFF1DE', intensity: 3.1, spread: 1.6 });
  S.sky({ color: '#ECEFEC', intensity: 1.1 });
  S.hemi = { sky: '#F3EFE8', ground: '#958A7C', intensity: 0.4 };
  S.scene.environmentIntensity = 0.3;
  S.exposure = 1.02;
}

// ───────────────────────── 客厅（room / wall / sofa / night / palette 共用一个机位） ─────────────────────────

const LIVING = { w: 4.8, d: 4.4, h: 2.8 };
const LIVING_WIN = [{ wall: 'left', a: -3.75, b: -1.35, y0: 0.32, y1: 2.5, mullions: 2 }];
const LIVING_CAM = { pos: [0.95, 1.1, -0.2], target: [-0.25, 0.86, -4.0], fov: 47 };

function living(S, { mats, sofa = 'classic', sofaW = 2.2, outside = 'day', art = 'one', plant = true, lamp = true, table = 'round', rug = true, curtains = true }) {
  const { d } = LIVING;
  S.slots(mats);
  S.room({ ...LIVING, windows: LIVING_WIN, outside });
  const backZ = -d;
  S.item('sofa', { variant: sofa, w: sofaW, d: 0.92, x: 0.15, z: backZ + 0.52 });
  if (rug) S.item('rug', { w: 2.7, d: 1.9, x: 0.15, z: backZ + 1.55 });
  if (table) S.item('coffeeTable', { variant: table, w: 1.0, d: 0.6, x: 0.15, z: backZ + 1.78 });
  if (lamp) S.item('floorLamp', { x: 1.62, z: backZ + 0.32 });
  S.item('sideTable', { x: 1.6, z: backZ + 0.82 });
  if (plant) S.item('plant', { variant: 'tall', seed: 3, x: -1.8, z: backZ + 0.42 });
  if (art === 'one') S.item('art', { w: 0.82, h: 0.62, x: 0.15, y: 1.34, z: backZ + 0.019 });
  if (curtains) S.item('curtains', { w: 2.4, h: 2.8, x: -2.4 + 0.09, z: (LIVING_WIN[0].a + LIVING_WIN[0].b) / 2, rot: 90 });
  S.look(LIVING_CAM);
  return { backZ };
}

const WARM = { walls: 'oat', floor: 'light-oak', upholstery: 'linen', accents: 'rust-wool', rugs: 'oat-knit', woodwork: 'walnut', metal: 'brass', curtains: 'linen', bedding: 'linen', cabinetry: 'cream-lacquer', countertop: 'travertine' };
const COOL = { walls: 'gallery-white', floor: 'greige-oak', upholstery: 'grey-wool', accents: 'navy-velvet', rugs: 'cotton-white', woodwork: 'white-oak', metal: 'steel', curtains: 'cotton-white', bedding: 'cotton-white', cabinetry: 'white-lacquer', countertop: 'quartz-white' };
const DAYWARM = { ...WARM, walls: 'warm-white' };

/** 晚上的灯：落地灯 + 边几上的台灯光（夜里亮的灯罩靠 lib.setNight） */
function lampsOn(S, lib, k = 1) {
  lib.setNight(k);
  const backZ = -LIVING.d;
  S.lamp({ pos: [1.62, 1.36, backZ + 0.32], color: '#FFB46E', intensity: 2.6 * k, radius: 0.06 });
}

// ───────────────────────── 角落（touch / weekend-b 共用） ─────────────────────────

const NOOK = { w: 3.6, d: 3.4, h: 2.8 };
const NOOK_WIN = [{ wall: 'left', a: -2.9, b: -1.0, y0: 0.4, y1: 2.5, mullions: 1 }];
const NOOK_CAM = { pos: [0.95, 1.05, -0.15], target: [-0.35, 0.62, -3.1], fov: 44 };

// ───────────────────────── 场景 ─────────────────────────

export const SETS = {
  // ① 哪一个房间，让你想马上躺下？ A 暖暖的傍晚 / B 清爽的早晨
  'room-a': (S, { lib }) => {
    living(S, { mats: WARM, outside: 'evening' });
    lightWarmEvening(S);
    lampsOn(S, lib, 0.55);
  },
  'room-b': (S) => {
    living(S, { mats: COOL, outside: 'morning' });
    lightCoolMorning(S);
  },

  // ② 哪一面墙，更像你？ A 一幅画就够了 / B 挂满了才有味道
  'wall-a': (S) => {
    living(S, { mats: DAYWARM, plant: false });
    lightDay(S);
  },
  'wall-b': (S, h) => {
    const { backZ } = living(S, { mats: DAYWARM, art: 'many' });
    const wz = backZ;
    const fr = h.plain('#3A2E25', { rough: 0.5 });
    const oak = h.pbr('light-oak', { R: 256 });
    frameArt(S, { x: -0.22, y: 1.3, w: 0.72, h: 0.52, wallZ: wz, kind: 'hills', frame: fr, seed: 2 }, h);
    frameArt(S, { x: 0.58, y: 1.26, w: 0.42, h: 0.58, wallZ: wz, kind: 'arch', frame: oak, seed: 3 }, h);
    frameArt(S, { x: 0.58, y: 1.94, w: 0.32, h: 0.32, wallZ: wz, kind: 'dot', frame: fr, matW: 0.06, seed: 4 }, h);
    frameArt(S, { x: -0.86, y: 1.36, w: 0.34, h: 0.44, wallZ: wz, kind: 'leaf', frame: oak, seed: 5 }, h);
    // 藤编挂盘
    S.mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.012, 64), h.pbr('rattan', { R: 256 }), [-0.86, 2.1, wz + 0.01], { rx: Math.PI / 2 });
    S.mesh(new THREE.TorusGeometry(0.19, 0.011, 10, 64), h.pbr('light-oak', { R: 256 }), [-0.86, 2.1, wz + 0.016]);
    frameArt(S, { x: -0.18, y: 1.92, w: 0.56, h: 0.36, wallZ: wz, kind: 'blocks', frame: fr, seed: 6 }, h);
    frameArt(S, { x: 1.08, y: 1.5, w: 0.3, h: 0.4, wallZ: wz, kind: 'line', frame: fr, matW: 0.06, seed: 7 }, h);
    // 墙上一条小层板：书、小瓶
    const r = rng(11);
    S.box(0.62, 0.026, 0.16, oak, [1.32, 2.06, wz + 0.08]);
    bookRow(S, { x0: 1.06, x1: 1.4, y: 2.086, z: wz + 0.095, maxH: 0.24, rand: r, mats: (c) => h.plain(c, { rough: 0.78 }) });
    vessel(S, { x: 1.52, y: 2.086, z: wz + 0.08, h: 0.17, r: 0.045, style: 'bud', mat: h.plain('#B4694A', { rough: 0.45 }) });
    // 地上：一摞书 + 小盆栽
    S.item('plant', { variant: 'small', seed: 2, x: -1.15, z: backZ + 0.3 });
    lightDay(S);
  },

  // ③ 闭上眼睛摸一摸 —— A 粗粗的、有温度（亚麻 · 浅川橡 · 藤编）/ B 滑滑的、凉凉的（卡拉拉白 · 拉丝黄铜 · 奶油烤漆）
  'touch-a': (S, h) => {
    S.slots({ walls: 'sand-limewash', floor: 'light-oak', upholstery: 'linen', accents: 'oat-knit', woodwork: 'light-oak', rugs: 'oat-knit', metal: 'brass', curtains: 'linen' });
    S.room({ ...NOOK, windows: NOOK_WIN, outside: 'day' });
    const bz = -NOOK.d;
    S.item('rug', { w: 2.0, d: 1.5, x: -0.3, z: bz + 1.15 });
    S.item('armchair', { variant: 'lounge', x: -0.55, z: bz + 0.75, rot: 14 });
    // 藤编篮子 + 搭着的亚麻毯
    const rattan = h.pbr('rattan', { R: 512 });
    const linen = h.pbr('linen', { R: 512 });
    const oak = h.pbr('light-oak', { R: 512 });
    S.lathe([[0.001, 0], [0.2, 0], [0.205, 0.01], [0.215, 0.36], [0.2, 0.36], [0.19, 0.012], [0.001, 0.012]], rattan, [0.55, 0, bz + 0.55], {}, 72);
    S.mesh(new THREE.TorusGeometry(0.212, 0.012, 10, 72), oak, [0.55, 0.36, bz + 0.55], { rx: Math.PI / 2 });
    // 叠好的亚麻毯，一角垂在篮边
    S.mesh(rbox(0.46, 0.07, 0.3, 0.032, 5), linen, [0.53, 0.33, bz + 0.55], { rz: -0.05, ry: 0.45 });
    S.mesh(rbox(0.44, 0.05, 0.28, 0.024, 5), h.pbr('oat-knit', { R: 512 }), [0.53, 0.4, bz + 0.55], { rz: 0.04, ry: 0.62 });
    // 浅橡木小凳 + 一只陶杯
    S.lathe([[0.001, 0], [0.19, 0], [0.2, 0.012], [0.2, 0.035], [0.19, 0.045], [0.001, 0.045]], oak, [0.05, 0.42, bz + 0.92]);
    for (const a of [0.3, 2.4, 4.4]) S.mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.42, 16).translate(0, 0.21, 0), oak, [0.05 + Math.cos(a) * 0.12, 0, bz + 0.92 + Math.sin(a) * 0.12], { rz: Math.cos(a) * 0.08, rx: -Math.sin(a) * 0.08 });
    vessel(S, { x: 0.07, y: 0.465, z: bz + 0.9, h: 0.09, r: 0.045, style: 'cyl', mat: h.plain('#C9B28F', { rough: 0.55 }) });
    S.item('plant', { variant: 'tall', seed: 4, x: -1.35, z: bz + 0.35 });
    S.look(NOOK_CAM);
    S.sun({ az: 126, el: 26, color: '#FFE2BC', intensity: 3.4, spread: 1.5 });
    S.sky({ color: '#F1E6D6', intensity: 0.9 });
    S.hemi = { sky: '#F6EBDD', ground: '#94795C', intensity: 0.36 };
    S.scene.environmentIntensity = 0.26;
    S.exposure = 1.04;
  },
  'touch-b': (S, h) => {
    S.slots({ walls: 'gallery-white', floor: 'microcement', upholstery: 'cotton-white', accents: 'cotton-white', woodwork: 'white-oak', rugs: 'cotton-white', metal: 'brass', curtains: 'cotton-white' });
    S.room({ ...NOOK, windows: NOOK_WIN, outside: 'morning' });
    const bz = -NOOK.d;
    const lacquer = h.pbr('cream-lacquer', { R: 512 });
    const marble = h.pbr('carrara', { R: 1024 });
    const brass = h.pbr('brass', { R: 512 });
    const gap = h.plain('#1C1A18', { rough: 0.9 });
    // 奶油烤漆矮柜 + 卡拉拉白台面 + 黄铜细脚
    const cw = 1.7;
    const cx = -0.15;
    const cz = bz + 0.25;
    const y0 = 0.16;
    S.box(cw, 0.6, 0.44, lacquer, [cx, y0, cz]);
    S.box(cw - 0.01, 0.59, 0.002, gap, [cx, y0 + 0.005, cz + 0.221], { cast: false });
    for (let i = 0; i < 3; i++) {
      const dw = (cw - 0.012) / 3;
      const dx = cx - cw / 2 + 0.006 + dw * (i + 0.5);
      S.box(dw - 0.004, 0.586, 0.018, lacquer, [dx, y0 + 0.007, cz + 0.231]);
      S.mesh(new THREE.SphereGeometry(0.014, 20, 12), brass, [dx + (i === 1 ? 0 : i === 0 ? dw / 2 - 0.05 : -dw / 2 + 0.05), y0 + 0.42, cz + 0.252]);
    }
    S.box(cw + 0.03, 0.03, 0.47, marble, [cx, y0 + 0.6, cz + 0.01]);
    for (const [dx, dz] of [[-cw / 2 + 0.06, -0.16], [cw / 2 - 0.06, -0.16], [-cw / 2 + 0.06, 0.16], [cw / 2 - 0.06, 0.16]]) S.mesh(new THREE.CylinderGeometry(0.012, 0.009, y0, 16).translate(0, y0 / 2, 0), brass, [cx + dx, 0, cz + dz]);
    // 台面上：黄铜台灯、大理石碗、一本书
    const ty = y0 + 0.63;
    S.lathe([[0.001, 0], [0.075, 0], [0.078, 0.008], [0.03, 0.03], [0.012, 0.05], [0.01, 0.42], [0.001, 0.42]], brass, [cx - 0.55, ty, cz - 0.05]);
    S.lathe([[0.19, 0], [0.2, 0.004], [0.14, 0.22], [0.13, 0.222], [0.185, 0.004]], h.plain('#F1EADC', { rough: 0.8, side: THREE.DoubleSide }), [cx - 0.55, ty + 0.36, cz - 0.05]);
    S.lathe([[0.001, 0], [0.09, 0], [0.11, 0.015], [0.16, 0.07], [0.165, 0.075], [0.15, 0.075], [0.1, 0.03], [0.001, 0.02]], marble, [cx + 0.25, ty, cz + 0.02]);
    S.mesh(new THREE.SphereGeometry(0.045, 24, 16), brass, [cx + 0.25, ty + 0.06, cz + 0.02]);
    S.mesh(rbox(0.24, 0.03, 0.17, 0.003, 1), h.plain('#E6E0D4', { rough: 0.7 }), [cx + 0.62, ty, cz + 0.04], { ry: -0.25 });
    // 墙上：黄铜细框的圆形画（石灰白底、一道浅灰的弧）
    S.mesh(new THREE.TorusGeometry(0.33, 0.012, 16, 96), brass, [cx + 0.05, 1.62, bz + 0.016]);
    const disc = new THREE.MeshStandardMaterial({ map: artTexture('arcs', 1, 1, 12), roughness: 0.9 });
    S.mesh(new THREE.CircleGeometry(0.322, 96), disc, [cx + 0.05, 1.62, bz + 0.01], { cast: false });
    S.item('plant', { variant: 'small', seed: 1, x: 1.05, z: bz + 0.35 });
    S.look(NOOK_CAM);
    S.sun({ az: 124, el: 30, color: '#FFF8F0', intensity: 3.1, spread: 1.4 });
    S.sky({ color: '#E3EBF0', intensity: 1.2 });
    S.hemi = { sky: '#EEF2F3', ground: '#99958D', intensity: 0.42 };
    S.scene.environmentIntensity = 0.38;
    S.exposure = 1.0;
  },

  // ④ 朋友来家里，你希望他们看到？ A 干干净净，什么都看不见 / B 我的收藏会说话
  'guest-a': (S, h) => {
    const mats = { ...COOL, walls: 'warm-white', cabinetry: 'cream-lacquer', upholstery: 'oat-knit', woodwork: 'white-oak' };
    S.slots(mats);
    S.room({ ...LIVING, windows: LIVING_WIN, outside: 'day' });
    const bz = -LIVING.d;
    S.item('wardrobe', { w: 3.9, h: 2.8, x: 0.45, z: bz + 0.3, handle: 'none' });
    S.item('bench', { w: 1.5, x: 0.35, z: bz + 1.25 });
    S.item('rug', { w: 2.6, d: 1.7, x: 0.35, z: bz + 1.75 });
    S.item('curtains', { w: 2.4, h: 2.8, x: -2.4 + 0.09, z: (LIVING_WIN[0].a + LIVING_WIN[0].b) / 2, rot: 90 });
    S.look(LIVING_CAM);
    lightDay(S);
    // 烤漆门板：清漆层放柔一点（大面积亮面上不要出现一粒粒的高光）
    const cab = h.lib.slot('cabinetry');
    cab.clearcoat = 0.25;
    cab.clearcoatRoughness = 0.35;
    cab.normalScale.set(0.25, 0.25);
  },
  'guest-b': (S) => {
    const mats = { ...COOL, walls: 'warm-white', cabinetry: 'cream-lacquer', upholstery: 'oat-knit', woodwork: 'white-oak' };
    S.slots(mats);
    S.room({ ...LIVING, windows: LIVING_WIN, outside: 'day' });
    const bz = -LIVING.d;
    [-1.06, 0.24, 1.54].forEach((x, i) => S.item('bookshelf', { w: 1.3, h: 2.8, d: 0.34, x: x + 0.45 - 0.24, z: bz + 0.17, seed: i + 2 }));
    S.item('bench', { w: 1.5, x: 0.35, z: bz + 1.25 });
    S.item('rug', { w: 2.6, d: 1.7, x: 0.35, z: bz + 1.75 });
    S.item('curtains', { w: 2.4, h: 2.8, x: -2.4 + 0.09, z: (LIVING_WIN[0].a + LIVING_WIN[0].b) / 2, rot: 90 });
    S.look(LIVING_CAM);
    lightDay(S);
  },

  // ⑤ 选一个色盘：A 大地与阳光 / B 海风与石头（照片底下摊着五个色片）
  'palette-a': (S) => {
    living(S, { mats: { walls: 'sand-limewash', floor: 'light-oak', upholstery: 'linen', accents: 'rust-wool', rugs: 'oat-knit', woodwork: 'walnut', metal: 'bronze', curtains: 'linen', bedding: 'linen' }, outside: 'day' });
    S.look({ pos: [0.55, 1.08, -1.45], target: [0.0, 0.95, -4.4], fov: 44 });
    S.chips = ['#EFE4D2', '#D6C0A0', '#B77250', '#6D6A4A', '#694330'];
    S.sun({ az: 128, el: 24, color: '#FFD8A8', intensity: 3.4, spread: 1.5 });
    S.sky({ color: '#F3E3CF', intensity: 0.9 });
    S.hemi = { sky: '#F6E6D2', ground: '#8E7458', intensity: 0.34 };
    S.scene.environmentIntensity = 0.24;
    S.exposure = 1.04;
  },
  'palette-b': (S, h) => {
    const { backZ } = living(S, { mats: { walls: 'gallery-white', floor: 'greige-oak', upholstery: 'grey-wool', accents: 'navy-velvet', rugs: 'cotton-white', woodwork: 'ebony-oak', metal: 'gunmetal', curtains: 'cotton-white', bedding: 'cotton-white' }, outside: 'morning', art: 'none' });
    frameArt(S, { x: 0.15, y: 1.3, w: 0.86, h: 0.64, wallZ: backZ, kind: 'sea', frame: h.plain('#262626', { rough: 0.5 }), seed: 9 }, h);
    S.look({ pos: [0.55, 1.08, -1.45], target: [0.0, 0.95, -4.4], fov: 44 });
    S.chips = ['#F0EEE9', '#B9BCBC', '#9DAFBC', '#2B3A5E', '#262626'];
    lightCoolMorning(S);
  },

  // ⑥ 哪一张沙发，你想陷进去？ A 圆圆的羊羔绒 / B 利落的皮沙发
  'sofa-a': (S) => {
    living(S, { mats: { ...DAYWARM, upholstery: 'boucle', accents: 'oat-knit', bedding: 'linen' }, sofa: 'curvy', sofaW: 2.3, table: false });
    S.look({ pos: [1.45, 0.78, -1.75], target: [-0.05, 0.52, -3.95], fov: 42 });
    lightDay(S);
  },
  'sofa-b': (S, h) => {
    living(S, { mats: { ...DAYWARM, upholstery: 'cognac-leather', accents: 'cognac-leather', metal: 'matte-black' }, sofa: 'classic', sofaW: 2.2, table: false });
    h.lib.slot('upholstery').normalScale.set(0.55, 0.55);
    S.look({ pos: [1.45, 0.78, -1.75], target: [-0.05, 0.52, -3.95], fov: 42 });
    lightDay(S);
  },

  // ⑦ 晚上 10 点，客厅的灯 —— A 亮亮的，什么都看得清 / B 几盏小灯，暗暗的
  'night-a': (S) => {
    S.ceilingGlow = 0.35;
    living(S, { mats: COOL, outside: 'night' });
    S.sky({ intensity: 0 });
    const bz = -LIVING.d;
    for (const x of [-1.2, 0.2, 1.6]) for (const z of [bz + 0.9, bz + 2.4]) S.spot({ pos: [x, 2.76, z], target: [x, 0, z], color: '#FFF2E2', intensity: 16, angle: 1.05, penumbra: 0.9, radius: 0.04 });
    S.hemi = { sky: '#F2F0EC', ground: '#8E8A84', intensity: 0.75 };
    S.scene.environmentIntensity = 0.42;
    S.exposure = 1.0;
  },
  'night-b': (S, h) => {
    S.ceilingGlow = 0;
    const { backZ } = living(S, { mats: WARM, outside: 'night' });
    S.sky({ intensity: 0 });
    h.lib.setNight(1);
    S.lamp({ pos: [1.62, 1.36, backZ + 0.32], color: '#FFB066', intensity: 3.4, radius: 0.07 });
    // 沙发左边一盏小台灯（陶瓷底 + 亚麻罩）
    const ceramic = h.plain('#C9B28F', { rough: 0.4 });
    S.lathe([[0.001, 0], [0.16, 0], [0.165, 0.5], [0.001, 0.5]], h.pbr('walnut', { R: 256 }), [-1.25, 0, backZ + 0.45], {}, 48);
    S.lathe([[0.001, 0], [0.06, 0], [0.075, 0.08], [0.06, 0.2], [0.02, 0.24], [0.001, 0.24]], ceramic, [-1.25, 0.5, backZ + 0.45]);
    S.lathe([[0.15, 0], [0.11, 0.18]], h.lib.fixed.lampShade, [-1.25, 0.76, backZ + 0.45], {}, 48);
    S.lamp({ pos: [-1.25, 0.84, backZ + 0.45], color: '#FFAE62', intensity: 1.5, radius: 0.04 });
    // 茶几上两支蜡烛
    const wax = h.plain('#F3ECE1', { rough: 0.5 });
    const flame = h.plain('#FFD9A0', { emissive: '#FFB45C', ei: 6 });
    for (const [dx, hh] of [[0.0, 0.1], [0.08, 0.07]]) {
      S.mesh(new THREE.CylinderGeometry(0.03, 0.03, hh, 24).translate(0, hh / 2, 0), wax, [0.4 + dx, 0.4, backZ + 1.72]);
      S.mesh(new THREE.SphereGeometry(0.008, 12, 8), flame, [0.4 + dx, 0.4 + hh + 0.012, backZ + 1.72], { cast: false, s: [1, 2, 1] });
      S.lamp({ pos: [0.4 + dx, 0.4 + hh + 0.03, backZ + 1.72], color: '#FFA24E', intensity: 0.12, radius: 0.005, shadow: false });
    }
    S.hemi = { sky: '#3A3E3A', ground: '#2A2622', intensity: 0.12 };
    S.scene.environmentIntensity = 0.05;
    S.exposure = 1.25;
  },

  // ⑧ 光着脚，你想踩在 —— A 温润的木地板 / B 冰凉的石材
  'floor-a': (S) => floorScene(S, 'herringbone-oak'),
  'floor-b': (S) => floorScene(S, 'travertine'),

  // ⑨ 你的厨房台面 —— A 一眼望去，什么都没有 / B 瓶瓶罐罐都摆出来
  'kitchen-a': (S, h) => kitchenScene(S, h, false),
  'kitchen-b': (S, h) => kitchenScene(S, h, true),

  // ⑩ 选一张餐桌 —— A 原木大板，有疤也好看 / B 大理石圆桌，干净利落
  'table-a': (S, h) => tableScene(S, h, 'slab'),
  'table-b': (S, h) => tableScene(S, h, 'marble'),

  // ⑪ 书架上的东西 —— A 整整齐齐，三件就好 / B 满满当当，每格都有故事
  'shelf-a': (S, h) => shelfScene(S, h, false),
  'shelf-b': (S, h) => shelfScene(S, h, true),

  // ⑫ 理想的星期六晚上 —— A 一屋子朋友打边炉（🍲）/ B 一个人，一本书，一杯茶（📖）
  'weekend-a': (S, h) => hotpotScene(S, h),
  'weekend-b': (S, h) => readingScene(S, h),
};

// ───────────────────────── ⑧ 地板 ─────────────────────────

function floorScene(S, floor) {
  S.slots({ walls: 'warm-white', floor, woodwork: 'white-oak', upholstery: 'oat-knit', accents: 'linen', metal: 'brass', curtains: 'linen', rugs: 'oat-knit' });
  const R = { w: 4.2, d: 4.2, h: 2.8 };
  const win = [{ wall: 'left', a: -3.5, b: -0.9, y0: 0.0, y1: 2.5, mullions: 2 }];
  S.room({ ...R, windows: win, outside: 'day' });
  const bz = -R.d;
  S.item('bench', { w: 1.3, x: 0.55, z: bz + 0.3 });
  S.item('plant', { variant: 'tall', seed: 6, x: -1.55, z: bz + 0.4 });
  S.item('plant', { variant: 'small', seed: 2, x: 1.55, z: bz + 0.3 });
  S.item('curtains', { w: 2.6, h: 2.8, x: -2.1 + 0.09, z: (win[0].a + win[0].b) / 2, rot: 90 });
  S.look({ pos: [0.95, 1.55, -0.15], target: [-0.25, 0.05, -3.0], fov: 50 });
  S.sun({ az: 118, el: 30, color: '#FFF0DA', intensity: 3.3, spread: 1.5 });
  S.sky({ color: '#EEF0EC', intensity: 1.0 });
  S.hemi = { sky: '#F3EFE8', ground: '#958A7C', intensity: 0.4 };
  S.scene.environmentIntensity = 0.32;
  S.exposure = 1.02;
}

// ───────────────────────── ⑨ 厨房 ─────────────────────────

function jar(S, h, { x, y, z, r = 0.05, hh = 0.16, fill = '#E8DCC4', lid = '#C8A272', level = 0.7 }) {
  const glass = h.plain('#E9F0EE', { rough: 0.05, transparent: true, opacity: 0.22 });
  S.lathe([[0.001, 0], [r, 0], [r, hh], [0.001, hh]], glass, [x, y, z], { cast: false }, 40);
  S.lathe([[0.001, 0], [r - 0.004, 0], [r - 0.004, hh * level], [0.001, hh * level]], h.plain(fill, { rough: 0.85 }), [x, y + 0.004, z], {}, 40);
  S.mesh(new THREE.CylinderGeometry(r + 0.003, r + 0.003, 0.022, 40).translate(0, 0.011, 0), h.plain(lid, { rough: 0.6 }), [x, y + hh, z]);
}

function kitchenScene(S, h, open) {
  S.slots({ walls: 'warm-white', floor: 'cream-tile', cabinetry: 'cream-lacquer', countertop: 'quartz-white', woodwork: 'light-oak', metal: 'steel', tile: 'zellige-white' });
  const R = { w: 4.2, d: 3.6, h: 2.8 };
  const win = [{ wall: 'left', a: -3.1, b: -1.7, y0: 1.0, y1: 2.35, mullions: 1 }];
  S.room({ ...R, windows: win, outside: 'day' });
  const bz = -R.d;
  const run = S.item('kitchenRun', { w: 3.4, h: 2.8, upper: !open, sinkAt: 0.3, hobAt: null, x: 0.3, z: bz + 0.3 });
  const oak = h.pbr('light-oak', { R: 512 });
  if (!open) {
    // 台面上什么都不留
    S.prune(run, (m) => m === h.lib.slot('woodwork') || m === h.lib.fixed.porcelain || m?.userData?.own === 'glaze');
  } else {
    const rand = rng(21);
    const wz = bz;
    const x0 = -1.3;
    const x1 = 1.95;
    for (const y of [1.48, 1.86]) {
      S.box(x1 - x0, 0.03, 0.26, oak, [(x0 + x1) / 2, y, wz + 0.13]);
      for (const bx of [x0 + 0.25, x1 - 0.25]) S.box(0.02, 0.06, 0.2, h.plain('#2A2826', { rough: 0.5, metal: 0.4 }), [bx, y - 0.06, wz + 0.1]);
    }
    // 下层：玻璃罐 + 叠着的碗 + 杯子
    const fills = ['#E9DEC6', '#C79A5B', '#8E5A3A', '#F1EEE6', '#D8B26A', '#6E4B35'];
    let x = x0 + 0.1;
    for (let i = 0; i < 6; i++) {
      jar(S, h, { x, y: 1.51, z: wz + 0.13, r: 0.048 + rand() * 0.012, hh: 0.14 + rand() * 0.08, fill: fills[i], level: 0.55 + rand() * 0.35 });
      x += 0.14;
    }
    for (let k = 0; k < 4; k++) vessel(S, { x: x + 0.12, y: 1.51 + k * 0.045, z: wz + 0.13, h: 0.06, r: 0.1 - k * 0.006, style: 'bowl', mat: h.plain(k % 2 ? '#E9E2D4' : '#F4F1EA', { rough: 0.25 }) });
    x += 0.36;
    for (let k = 0; k < 3; k++) vessel(S, { x: x + k * 0.11, y: 1.51, z: wz + 0.13, h: 0.1, r: 0.042, style: 'cyl', mat: h.plain(['#3A3936', '#B4694A', '#A3AE9A'][k], { rough: 0.3 }) });
    x += 0.42;
    for (let k = 0; k < 5; k++) S.mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 48).translate(0, 0.006, 0), h.plain('#F2EEE6', { rough: 0.3 }), [x + 0.12, 1.51 + k * 0.014, wz + 0.13]);
    // 上层：书、罐、一盆垂下来的绿
    bookRow(S, { x0: x0 + 0.05, x1: x0 + 0.55, y: 1.89, z: wz + 0.12, maxH: 0.28, rand, mats: (c) => h.plain(c, { rough: 0.78 }) });
    for (let k = 0; k < 4; k++) jar(S, h, { x: x0 + 0.72 + k * 0.15, y: 1.89, z: wz + 0.13, r: 0.055, hh: 0.2, fill: ['#F1EEE6', '#B07A4A', '#D9C49A', '#7E5A3E'][k], level: 0.6 + rand() * 0.3 });
    vessel(S, { x: x0 + 1.46, y: 1.89, z: wz + 0.13, h: 0.22, r: 0.07, style: 'amphora', mat: h.plain('#B4694A', { rough: 0.5 }) });
    S.item('plant', { variant: 'small', seed: 1, x: x1 - 0.25, y: 1.89, z: wz + 0.13, s: 0.9 });
    vessel(S, { x: x0 + 1.85, y: 1.89, z: wz + 0.13, h: 0.08, r: 0.12, style: 'bowl', mat: h.plain('#3A3936', { rough: 0.35 }) });
    // 挂杆 + 厨具
    S.mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.2, 12), h.pbr('brass', { R: 256 }), [0.85, 1.36, wz + 0.05], { rz: Math.PI / 2 });
    for (let k = 0; k < 6; k++) {
      const ux = 0.35 + k * 0.2;
      S.mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 8).translate(0, -0.13, 0), h.plain(k % 2 ? '#2A2826' : '#8E6A4E', { rough: 0.5 }), [ux, 1.35, wz + 0.06]);
      S.mesh(new THREE.SphereGeometry(0.032, 16, 10), h.plain(k % 2 ? '#2A2826' : '#8E6A4E', { rough: 0.5 }), [ux, 1.08, wz + 0.06], { s: [1, 0.45, 0.8] });
    }
    // 台面：水壶、果盘、油瓶、砧板
    const ty = 0.9;
    const steel = h.lib.fixed.steel;
    S.lathe([[0.001, 0], [0.085, 0], [0.095, 0.02], [0.095, 0.15], [0.07, 0.21], [0.03, 0.23], [0.001, 0.23]], steel, [1.55, ty, wz + 0.3]);
    S.mesh(new THREE.TorusGeometry(0.07, 0.01, 10, 32, Math.PI), h.plain('#2A2826', { rough: 0.5 }), [1.55, ty + 0.22, wz + 0.3], { rz: 0, ry: Math.PI / 2 });
    vessel(S, { x: 0.95, y: ty, z: wz + 0.36, h: 0.09, r: 0.15, style: 'bowl', mat: h.plain('#E9E2D4', { rough: 0.3 }) });
    for (const [dx, dz, c] of [[-0.04, 0.02, '#E08A2C'], [0.04, -0.01, '#E7B53A'], [0.0, -0.05, '#9DB24A'], [0.05, 0.05, '#E08A2C']]) S.mesh(new THREE.SphereGeometry(0.038, 20, 14), h.plain(c, { rough: 0.45 }), [0.95 + dx, ty + 0.07, wz + 0.36 + dz]);
    for (const [dx, c] of [[0, '#B5862E'], [0.07, '#5E7A3A']]) vessel(S, { x: -0.62 + dx, y: ty, z: wz + 0.12, h: 0.26, r: 0.035, style: 'bottle', mat: h.plain(c, { rough: 0.1, transparent: true, opacity: 0.75 }) });
  }
  S.look({ pos: [1.0, 1.42, -0.3], target: [0.05, 1.02, -3.4], fov: 47 });
  S.sun({ az: 118, el: 34, color: '#FFF2E0', intensity: 3.2, spread: 1.6 });
  S.sky({ color: '#EEF0EC', intensity: 1.1 });
  S.hemi = { sky: '#F3EFE8', ground: '#958A7C', intensity: 0.45 };
  S.scene.environmentIntensity = 0.34;
  S.exposure = 1.02;
}

// ───────────────────────── ⑩ 餐桌 ─────────────────────────

function tableScene(S, h, kind) {
  const slab = kind === 'slab';
  S.slots({ walls: 'sand-limewash', floor: 'light-oak', woodwork: slab ? 'teak' : 'black-matte', upholstery: slab ? 'linen' : 'cotton-white', metal: 'brass', rugs: 'oat-knit', curtains: 'linen' });
  const R = { w: 4.4, d: 4.2, h: 2.8 };
  const win = [{ wall: 'left', a: -3.4, b: -1.2, y0: 0.35, y1: 2.5, mullions: 2 }];
  S.room({ ...R, windows: win, outside: 'day' });
  const cz = -2.55;
  const cx = 0.15;
  if (slab) {
    const teak = h.pbr('teak', { R: 1024 });
    const walnut = h.pbr('walnut', { R: 512 });
    S.mesh(rbox(2.1, 0.075, 0.98, 0.012, 3), teak, [cx, 0.68, cz]);
    for (const s of [-1, 1]) S.mesh(rbox(0.08, 0.68, 0.8, 0.01, 2), walnut, [cx + s * 0.78, 0, cz]);
    S.mesh(rbox(1.5, 0.006, 0.36, 0.003, 1), h.pbr('linen', { R: 512 }), [cx, 0.755, cz]);
    vessel(S, { x: cx - 0.25, y: 0.761, z: cz, h: 0.12, r: 0.17, style: 'bowl', mat: h.plain('#8E6A4E', { rough: 0.45 }) });
    vessel(S, { x: cx + 0.35, y: 0.761, z: cz - 0.05, h: 0.3, r: 0.08, style: 'amphora', mat: h.plain('#D8C7A8', { rough: 0.6 }) });
    for (const [x, z, r] of [[-0.45, -0.62, 0], [0.45, -0.62, 0], [-0.45, 0.62, 180], [0.45, 0.62, 180]]) S.item('chair', { x: cx + x, z: cz + z, rot: r });
    // 藤编吊灯
    S.lathe([[0.001, 0.32], [0.12, 0.3], [0.26, 0.18], [0.32, 0.0], [0.31, -0.005], [0.25, 0.17], [0.11, 0.29], [0.001, 0.31]], h.pbr('rattan', { R: 512 }), [cx, 1.5, cz], {}, 72);
    S.mesh(new THREE.CylinderGeometry(0.003, 0.003, 1.0, 6).translate(0, 0.5, 0), h.plain('#2A2826'), [cx, 1.8, cz], { cast: false });
  } else {
    const marble = h.pbr('calacatta', { R: 1024 });
    const nero = h.pbr('nero', { R: 512 });
    S.lathe([[0.001, 0], [0.6, 0], [0.62, 0.008], [0.62, 0.024], [0.6, 0.032], [0.001, 0.032]], marble, [cx, 0.72, cz], {}, 128);
    S.lathe([[0.001, 0], [0.3, 0], [0.31, 0.02], [0.24, 0.06], [0.11, 0.14], [0.085, 0.4], [0.1, 0.62], [0.2, 0.72], [0.001, 0.72]], nero, [cx, 0, cz], {}, 96);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      S.item('chair', { x: cx + Math.sin(a) * 0.78, z: cz + Math.cos(a) * 0.78, rot: (a * 180) / Math.PI + 180 });
    }
    vessel(S, { x: cx + 0.08, y: 0.752, z: cz - 0.05, h: 0.22, r: 0.07, style: 'bud', mat: h.plain('#F2EFE8', { rough: 0.15 }) });
    // 乳白玻璃球吊灯 + 黄铜杆
    S.mesh(new THREE.SphereGeometry(0.2, 48, 32), h.plain('#F6F2EA', { rough: 0.3, emissive: '#FFF1DC', ei: 0.25 }), [cx, 1.68, cz]);
    S.mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.95, 12).translate(0, 0.475, 0), h.pbr('brass', { R: 256 }), [cx, 1.86, cz], { cast: false });
  }
  S.item('rug', { w: 2.8, d: 2.2, x: cx, z: cz });
  S.item('curtains', { w: 2.2, h: 2.8, x: -2.2 + 0.09, z: (win[0].a + win[0].b) / 2, rot: 90 });
  S.item('plant', { variant: 'tall', seed: 3, x: 1.75, z: -3.85 });
  S.look({ pos: [1.25, 1.5, -0.2], target: [-0.05, 0.76, -2.75], fov: 46 });
  S.sun({ az: 120, el: 28, color: '#FFEBD2', intensity: 3.3, spread: 1.5 });
  S.sky({ color: '#EFEDE6', intensity: 1.0 });
  S.hemi = { sky: '#F4EEE6', ground: '#927C64', intensity: 0.4 };
  S.scene.environmentIntensity = 0.3;
  S.exposure = 1.02;
}

// ───────────────────────── ⑪ 书架 ─────────────────────────

function shelfScene(S, h, full) {
  S.slots({ walls: 'warm-white', floor: 'light-oak', woodwork: 'light-oak', metal: 'brass', upholstery: 'oat-knit', accents: 'linen', curtains: 'linen', rugs: 'oat-knit' });
  const R = { w: 3.8, d: 3.4, h: 2.8 };
  const win = [{ wall: 'left', a: -2.9, b: -1.1, y0: 0.4, y1: 2.5, mullions: 1 }];
  S.room({ ...R, windows: win, outside: 'day' });
  const bz = -R.d;
  const oak = h.pbr('light-oak', { R: 1024 });
  const W0 = 1.95;
  const Hs = 2.1;
  const D0 = 0.32;
  const x0 = 0.15 - W0 / 2;
  const cols = 3;
  const rows = 4;
  const t = 0.028;
  const z = bz + D0 / 2;
  // 框：两侧、顶、底、竖隔板、层板、背板（浅一点的木）
  S.box(t, Hs, D0, oak, [x0 + t / 2, 0, z]);
  S.box(t, Hs, D0, oak, [x0 + W0 - t / 2, 0, z]);
  S.box(W0, t, D0, oak, [x0 + W0 / 2, Hs - t, z]);
  S.box(W0 - 2 * t, 0.08, D0 - 0.03, h.plain('#2A2622', { rough: 0.8 }), [x0 + W0 / 2, 0, z - 0.015]);
  const cw = (W0 - 2 * t - (cols - 1) * t) / cols;
  const ch = (Hs - 0.08 - t - (rows - 1) * t - t) / rows;
  for (let c = 1; c < cols; c++) S.box(t, Hs - 0.08 - t, D0 - 0.01, oak, [x0 + t + c * (cw + t) - t / 2, 0.08, z]);
  for (let r = 0; r < rows; r++) S.box(W0 - 2 * t, t, D0 - 0.01, oak, [x0 + W0 / 2, 0.08 + r * (ch + t), z]);
  const cell = (c, r) => ({ x0: x0 + t + c * (cw + t), x1: x0 + t + c * (cw + t) + cw, y: 0.08 + r * (ch + t) + t, zc: z });
  const rand = rng(full ? 33 : 7);
  const bookMat = (col) => h.plain(col, { rough: 0.78 });
  if (!full) {
    // 三件就好：一只高瓶、一摞书 + 小碗、一只圆罐
    let k = cell(0, 2);
    vessel(S, { x: (k.x0 + k.x1) / 2, y: k.y, z: k.zc, h: 0.34, r: 0.085, style: 'bottle', mat: h.plain('#D8C7A8', { rough: 0.55 }) });
    k = cell(1, 1);
    S.mesh(rbox(0.24, 0.035, 0.17, 0.003, 1), bookMat('#E8E1D3'), [(k.x0 + k.x1) / 2, k.y, k.zc]);
    S.mesh(rbox(0.22, 0.03, 0.16, 0.003, 1), bookMat('#5E4A3A'), [(k.x0 + k.x1) / 2 + 0.01, k.y + 0.035, k.zc], { ry: 0.08 });
    vessel(S, { x: (k.x0 + k.x1) / 2, y: k.y + 0.065, z: k.zc, h: 0.06, r: 0.07, style: 'bowl', mat: h.plain('#3A3936', { rough: 0.35 }) });
    k = cell(2, 3);
    vessel(S, { x: (k.x0 + k.x1) / 2, y: k.y, z: k.zc, h: 0.2, r: 0.11, style: 'moon', mat: h.plain('#EDE7DB', { rough: 0.3 }) });
  } else {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const k = cell(c, r);
        const mix = (r * 3 + c) % 4;
        if (mix === 0 || mix === 2) bookRow(S, { x0: k.x0 + 0.02, x1: k.x1 - (mix === 2 ? 0.2 : 0.02), y: k.y, z: k.zc + 0.04, maxH: ch - 0.02, rand, mats: bookMat });
        if (mix === 2) vessel(S, { x: k.x1 - 0.1, y: k.y, z: k.zc, h: Math.min(ch - 0.05, 0.24), r: 0.06, style: pick(['amphora', 'bud', 'bottle'], rand), mat: h.plain(pick(GLAZE, rand), { rough: 0.4 }) });
        if (mix === 1) {
          bookRow(S, { x0: k.x0 + 0.02, x1: k.x0 + 0.3, y: k.y, z: k.zc + 0.04, maxH: ch - 0.02, rand, mats: bookMat });
          vessel(S, { x: k.x1 - 0.14, y: k.y, z: k.zc, h: 0.07, r: 0.1, style: 'bowl', mat: h.plain(pick(GLAZE, rand), { rough: 0.35 }) });
          S.mesh(new THREE.SphereGeometry(0.03, 16, 10), h.pbr('brass', { R: 256 }), [k.x1 - 0.14, k.y + 0.055, k.zc]);
        }
        if (mix === 3) {
          // 相框 + 小盆栽 + 一摞平放的书
          S.box(0.15, 0.2, 0.016, h.pbr('walnut', { R: 256 }), [k.x0 + 0.13, k.y, k.zc - 0.05], { rx: -0.1 });
          S.box(0.11, 0.15, 0.004, h.plain('#D9CCB4', { rough: 0.8 }), [k.x0 + 0.13, k.y + 0.025, k.zc - 0.04], { rx: -0.1 });
          S.item('plant', { variant: 'small', seed: (r + c) % 2 ? 1 : 2, x: k.x0 + 0.38, y: k.y, z: k.zc, s: 0.7 });
          for (let i = 0; i < 3; i++) S.mesh(rbox(0.17, 0.025, 0.13, 0.002, 1), bookMat(pick(BOOK, rand)), [k.x1 - 0.12, k.y + i * 0.025, k.zc], { ry: (rand() - 0.5) * 0.2 });
        }
      }
  }
  S.item('plant', { variant: 'tall', seed: 3, x: -1.45, z: bz + 0.4 });
  S.item('rug', { w: 2.2, d: 1.5, x: 0.15, z: bz + 1.4 });
  S.look({ pos: [0.7, 1.2, -0.45], target: [0.08, 1.02, -3.4], fov: 44 });
  S.sun({ az: 124, el: 28, color: '#FFEFD8', intensity: 3.2, spread: 1.5 });
  S.sky({ color: '#EFEDE7', intensity: 1.0 });
  S.hemi = { sky: '#F4EFE8', ground: '#957F66', intensity: 0.42 };
  S.scene.environmentIntensity = 0.3;
  S.exposure = 1.02;
}

// ───────────────────────── ⑫ 星期六晚上 ─────────────────────────

function hotpotScene(S, h) {
  S.ceilingGlow = 0.02;
  S.slots({ walls: 'warm-white', floor: 'light-oak', woodwork: 'walnut', upholstery: 'linen', metal: 'brass', rugs: 'oat-knit', curtains: 'linen', cabinetry: 'cream-lacquer' });
  const R = { w: 4.4, d: 4.2, h: 2.8 };
  const win = [{ wall: 'left', a: -3.4, b: -1.2, y0: 0.35, y1: 2.5, mullions: 2 }];
  S.room({ ...R, windows: win, outside: 'dusk' });
  const cz = -2.55;
  const cx = 0.15;
  const tbl = S.item('diningTable', { variant: 'round', w: 1.4, seats: 6, x: cx, z: cz });
  // 桌上的果盘换成火锅
  S.prune(tbl, (m) => m === h.lib.fixed.porcelain || m?.userData?.own === 'citrus');
  const ty = 0.75;
  const steel = h.lib.fixed.steel;
  // 电磁炉 + 鸳鸯锅
  S.mesh(rbox(0.34, 0.05, 0.34, 0.012, 2), h.plain('#1C1C1E', { rough: 0.25, clearcoat: 0.6 }), [cx, ty, cz]);
  const py = ty + 0.05;
  S.lathe([[0.001, 0], [0.17, 0], [0.18, 0.01], [0.185, 0.1], [0.192, 0.104], [0.192, 0.11], [0.178, 0.11], [0.172, 0.012], [0.001, 0.012]], steel, [cx, py, cz], {}, 96);
  const half = (color, rot) => S.mesh(new THREE.CircleGeometry(0.172, 64, rot, Math.PI), h.plain(color, { rough: 0.12, clearcoat: 1 }), [cx, py + 0.085, cz], { rx: -Math.PI / 2, cast: false });
  half('#B23A1A', 0);
  half('#E9D9B8', Math.PI);
  S.box(0.344, 0.08, 0.004, steel, [cx, py + 0.012, cz]);
  // 汤里的料
  const rr = rng(5);
  for (let i = 0; i < 26; i++) {
    const a = rr() * Math.PI;
    const rad = 0.03 + rr() * 0.13;
    S.mesh(new THREE.SphereGeometry(0.006 + rr() * 0.008, 8, 6), h.plain(i % 3 ? '#6E1E10' : '#E8B04A', { rough: 0.4 }), [cx + Math.cos(a) * rad, py + 0.087, cz - Math.sin(a) * rad], { s: [1, 0.4, 1], cast: false });
  }
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + rr() * Math.PI;
    const rad = 0.05 + rr() * 0.1;
    S.mesh(new THREE.SphereGeometry(0.018, 16, 12), h.plain(i % 2 ? '#F4EFE6' : '#D9CBB0', { rough: 0.5 }), [cx + Math.cos(a) * rad, py + 0.088, cz - Math.sin(a) * rad], { s: [1, 0.7, 1] });
  }
  // 一圈碗筷、三盘料、几杯茶
  const porcelain = h.lib.fixed.porcelain;
  const chop = h.plain('#3A2A20', { rough: 0.45 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const bx = cx + Math.sin(a) * 0.52;
    const bzz = cz + Math.cos(a) * 0.52;
    vessel(S, { x: bx, y: ty, z: bzz, h: 0.055, r: 0.06, style: 'bowl', mat: porcelain });
    S.mesh(new THREE.CylinderGeometry(0.0035, 0.0025, 0.23, 8), chop, [bx + Math.cos(a) * 0.09, ty + 0.012, bzz - Math.sin(a) * 0.09], { rx: Math.PI / 2, rz: 0, ry: a, cast: true });
    S.mesh(new THREE.CylinderGeometry(0.0035, 0.0025, 0.23, 8), chop, [bx + Math.cos(a) * 0.105, ty + 0.012, bzz - Math.sin(a) * 0.105], { rx: Math.PI / 2, ry: a });
  }
  const plate = (x, z, fillFn) => {
    S.lathe([[0.001, 0], [0.1, 0], [0.13, 0.012], [0.135, 0.018], [0.125, 0.016], [0.095, 0.006], [0.001, 0.006]], porcelain, [x, ty, z], {}, 64);
    fillFn(x, ty + 0.008, z);
  };
  plate(cx - 0.34, cz + 0.1, (x, y, z) => {
    for (let i = 0; i < 7; i++) S.mesh(rbox(0.085, 0.006, 0.05, 0.003, 1), h.plain(i % 2 ? '#C9555A' : '#D97A78', { rough: 0.5 }), [x - 0.04 + i * 0.013, y + i * 0.002, z], { ry: 0.5 + i * 0.12, rz: 0.08 });
  });
  plate(cx + 0.33, cz + 0.14, (x, y, z) => {
    for (let i = 0; i < 9; i++) S.mesh(new THREE.SphereGeometry(0.026, 12, 8), h.plain(i % 3 ? '#5E8A3A' : '#7DA34E', { rough: 0.55 }), [x + (rr() - 0.5) * 0.11, y + 0.012, z + (rr() - 0.5) * 0.11], { s: [1.4, 0.45, 0.9], ry: rr() * 3 });
  });
  plate(cx + 0.05, cz - 0.36, (x, y, z) => {
    for (let i = 0; i < 6; i++) S.box(0.035, 0.035, 0.035, h.plain('#F2E9D4', { rough: 0.6 }), [x - 0.05 + (i % 3) * 0.045, y, z - 0.02 + Math.floor(i / 3) * 0.045]);
  });
  const tea = h.plain('#C98A3A', { rough: 0.1, transparent: true, opacity: 0.6 });
  const glass = h.plain('#EEF2F0', { rough: 0.04, transparent: true, opacity: 0.25 });
  for (const [dx, dz] of [[-0.42, -0.25], [0.45, -0.22], [-0.2, 0.45], [0.3, 0.42]]) {
    S.lathe([[0.001, 0], [0.034, 0], [0.038, 0.1], [0.001, 0.1]], glass, [cx + dx, ty, cz + dz], { cast: false }, 32);
    S.lathe([[0.001, 0], [0.032, 0], [0.034, 0.07], [0.001, 0.07]], tea, [cx + dx, ty + 0.003, cz + dz], { cast: false }, 32);
  }
  // 暖暖的吊灯
  S.lathe([[0.001, 0.2], [0.06, 0.19], [0.18, 0.08], [0.24, 0.0], [0.235, -0.004], [0.175, 0.075], [0.055, 0.185], [0.001, 0.195]], h.pbr('brass', { R: 256 }), [cx, 1.62, cz], {}, 72);
  S.mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.98, 6).translate(0, 0.49, 0), h.plain('#2A2826'), [cx, 1.82, cz], { cast: false });
  S.mesh(new THREE.SphereGeometry(0.04, 16, 12), h.plain('#FFF2D8', { emissive: '#FFD39A', ei: 8 }), [cx, 1.66, cz], { cast: false });
  S.lamp({ pos: [cx, 1.6, cz], color: '#FFC58C', intensity: 6.5, radius: 0.08 });
  // 角落的落地灯也开着
  S.item('floorLamp', { x: 1.75, z: -3.85 });
  h.lib.setNight(1);
  S.lamp({ pos: [1.75, 1.36, -3.85], color: '#FFBE80', intensity: 1.8, radius: 0.07 });
  S.item('rug', { w: 2.8, d: 2.4, x: cx, z: cz });
  S.item('curtains', { w: 2.2, h: 2.8, x: -2.2 + 0.09, z: (win[0].a + win[0].b) / 2, rot: 90 });
  S.item('sideboard', { w: 1.6, x: 0.35, z: -4.2 + 0.24 });
  S.look({ pos: [0.95, 1.42, -0.95], target: [0.0, 0.66, -2.7], fov: 45 });
  S.sky({ color: '#7E8A96', intensity: 0.25 });
  S.hemi = { sky: '#5A5550', ground: '#3A2E24', intensity: 0.22 };
  S.scene.environmentIntensity = 0.08;
  S.exposure = 1.2;
}

function readingScene(S, h) {
  S.slots({ walls: 'warm-white', floor: 'white-oak', upholstery: 'sage-linen', accents: 'linen', woodwork: 'white-oak', rugs: 'oat-knit', metal: 'brass', curtains: 'cotton-white' });
  S.room({ ...NOOK, windows: NOOK_WIN, outside: 'morning' });
  const bz = -NOOK.d;
  S.item('rug', { w: 1.9, d: 1.4, x: -0.45, z: bz + 1.2 });
  S.item('armchair', { variant: 'lounge', x: -0.7, z: bz + 0.95, rot: 28 });
  // 椅子上摊开、反扣着的书
  const cover = h.plain('#7B2F2C', { rough: 0.6 });
  const pages = h.plain('#F4EFE4', { rough: 0.9 });
  const bx = -0.62;
  const by = 0.38;
  const bzz = bz + 1.05;
  S.mesh(rbox(0.13, 0.008, 0.2, 0.002, 1), cover, [bx - 0.06, by + 0.03, bzz], { rz: 0.45, ry: 0.5 });
  S.mesh(rbox(0.13, 0.008, 0.2, 0.002, 1), cover, [bx + 0.055, by + 0.03, bzz + 0.03], { rz: -0.45, ry: 0.5 });
  S.mesh(rbox(0.2, 0.02, 0.19, 0.004, 2), pages, [bx, by, bzz + 0.01], { ry: 0.5 });
  // 搭在扶手上的毯子
  S.mesh(rbox(0.36, 0.03, 0.5, 0.014, 4), h.pbr('oat-knit', { R: 512 }), [-0.98, 0.5, bz + 1.0], { rz: 0.35, ry: 0.5 });
  // 小边几：一壶茶、一只杯
  const oak = h.pbr('white-oak', { R: 512 });
  const tx = 0.12;
  const tz = bz + 1.0;
  S.lathe([[0.001, 0], [0.21, 0], [0.22, 0.012], [0.22, 0.03], [0.21, 0.04], [0.001, 0.04]], oak, [tx, 0.5, tz], {}, 64);
  S.mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.5, 24).translate(0, 0.25, 0), oak, [tx, 0, tz]);
  S.mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.015, 48), oak, [tx, 0.008, tz]);
  const porcelain = h.lib.fixed.porcelain;
  const ty = 0.54;
  S.lathe([[0.001, 0], [0.06, 0], [0.068, 0.006], [0.062, 0.008], [0.001, 0.008]], porcelain, [tx + 0.06, ty, tz + 0.06], {}, 48);
  S.lathe([[0.001, 0.006], [0.03, 0.006], [0.042, 0.03], [0.045, 0.062], [0.04, 0.062], [0.037, 0.03], [0.001, 0.016]], porcelain, [tx + 0.06, ty, tz + 0.06], {}, 48);
  S.mesh(new THREE.CircleGeometry(0.038, 32), h.plain('#B7802F', { rough: 0.08, clearcoat: 1 }), [tx + 0.06, ty + 0.05, tz + 0.06], { rx: -Math.PI / 2, cast: false });
  S.lathe([[0.001, 0], [0.06, 0], [0.085, 0.04], [0.08, 0.09], [0.05, 0.11], [0.02, 0.115], [0.001, 0.12]], h.plain('#3A3936', { rough: 0.35 }), [tx - 0.08, ty, tz - 0.03], {}, 48);
  S.item('floorLamp', { x: -1.35, z: bz + 0.45 });
  S.item('plant', { variant: 'small', seed: 2, x: 0.95, z: bz + 0.3 });
  S.item('curtains', { w: 1.9, h: 2.8, x: -1.8 + 0.09, z: (NOOK_WIN[0].a + NOOK_WIN[0].b) / 2, rot: 90 });
  S.look({ pos: [0.9, 1.05, -0.2], target: [-0.45, 0.55, -2.6], fov: 44 });
  S.sun({ az: 122, el: 26, color: '#FFF4E4', intensity: 3.0, spread: 1.6 });
  S.sky({ color: '#E8EDEE', intensity: 1.15 });
  S.hemi = { sky: '#EEF0EE', ground: '#99907F', intensity: 0.4 };
  S.scene.environmentIntensity = 0.3;
  S.exposure = 1.02;
}

// 宝藏页的柜子小样（tiles.js）也用同一套书和瓶罐
export const bookRowInto = bookRow;
export const vesselInto = vessel;
