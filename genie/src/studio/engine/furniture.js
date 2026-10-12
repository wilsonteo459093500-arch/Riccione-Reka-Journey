// 程序化家具 —— 照真实的设计师家具做：软垫饱满有鼓起、垫与垫之间有缝；细的锥形脚；柜门有 3mm 门缝和阴影槽、
// 踢脚内退、台面有厚度和倒角；植物是一片片真的叶子；被子会从床边垂下来。
// 约定：每件家具的「正面」朝本地 +z，原点在地面上的占地中心；尺寸单位米。
// 材质按「表面」（slot）共享：换一次材质，整屋同类一起换。每件家具最后按材质合并成少数几个网格（少 draw call）；
// 灯泡（夜里的点光源跟着它）、玻璃、主题墙的两种模式、叶片实例单独保留。

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxGeo, cylGeo, sphereGeo, merge, placedBox, curtainGeo, softBoxGeo, pillowGeo, slabGeo, edgeBarGeo, latheGeo, taperBoxGeo, tubeGeo, torusGeo, leafGeo, bendGeo, drapeGeo, derived, flutedGeo, archGeo } from './geom.js';
import { SLOT_BY_ID } from '../../shared/materials.js';
import { rng } from '../../shared/noise.js';

let LIB = null;
let OWN = {};
export function useLib(lib) {
  LIB = lib;
  OWN = {};
}

/** 'fast'（iPad）：分段、叶子少一点 */
const hq = () => !LIB || LIB.quality !== 'fast';
const Q = (hi, lo) => (hq() ? hi : lo);

// ───────────────────────── 材质 ─────────────────────────

// 家具自己用的几种固定材质（不是「表面」，不参与换材质）
const OWN_DEF = {
  bark: { color: 0x6f6155, roughness: 0.92 },
  stem: { color: 0x58703f, roughness: 0.7 },
  soil: { color: 0x2c231c, roughness: 1 },
  paper: { color: 0xf3efe7, roughness: 0.9 },
  hobGlass: { color: 0x060607, roughness: 0.05, metalness: 0.15 },
  wax: { color: 0xf3ece1, roughness: 0.5 },
  citrus: { color: 0xe08a2c, roughness: 0.45 },
  glaze: { color: 0x3a3936, roughness: 0.3 },
  sage: { color: 0x9da791, roughness: 0.42 },
  sole: { color: 0xeee8de, roughness: 0.75 },
  bin0: { color: 0xd8b673, roughness: 0.9 },
  bin1: { color: 0xa3b6c0, roughness: 0.9 },
  bin2: { color: 0xc99377, roughness: 0.9 },
  bin3: { color: 0xadb99c, roughness: 0.9 },
};

function own(key) {
  if (OWN[key]) return OWN[key];
  let m = null;
  if (key === 'artA' || key === 'artB') m = new THREE.MeshStandardMaterial({ map: artTexture(key), roughness: 0.88 });
  else if (OWN_DEF[key]) m = new THREE.MeshStandardMaterial(OWN_DEF[key]);
  if (m) m.userData.own = key;
  return (OWN[key] = m);
}

const mat = (key) => (typeof key === 'object' ? key : SLOT_BY_ID[key] ? LIB.slot(key) : LIB.fixed[key] || own(key) || LIB.fixed.black);

/** 挂画的画面：A 竖幅（拱门 + 日 + 一道线，中古感）；B 横幅（雾里的山，层层远去） */
function artTexture(kind) {
  const land = kind === 'artB';
  const W = land ? 768 : 480;
  const H = land ? 432 : 600;
  let c;
  try {
    c = document.createElement('canvas');
  } catch {
    return null;
  }
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (land) {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#EFE6D6');
    sky.addColorStop(0.55, '#F4EBDD');
    sky.addColorStop(1, '#E6DCCB');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(214,160,92,0.9)';
    g.beginPath();
    g.arc(W * 0.7, H * 0.3, H * 0.085, 0, Math.PI * 2);
    g.fill();
    const ridge = (base, amp, seed, col, mist) => {
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 6) {
        const t = x / W;
        const y = base - amp * (0.55 * Math.sin(t * 5.1 + seed) + 0.3 * Math.sin(t * 11.3 + seed * 2.1) + 0.15 * Math.sin(t * 23 + seed * 3.7));
        g.lineTo(x, y);
      }
      g.lineTo(W, H);
      g.closePath();
      g.fillStyle = col;
      g.fill();
      if (mist) {
        const m = g.createLinearGradient(0, base - amp * 0.2, 0, base + amp * 1.2);
        m.addColorStop(0, 'rgba(244,238,228,0)');
        m.addColorStop(1, 'rgba(244,238,228,0.75)');
        g.fillStyle = m;
        g.fillRect(0, base - amp, W, amp * 2.4);
      }
    };
    ridge(H * 0.52, H * 0.12, 1.3, '#CFC8BA', true);
    ridge(H * 0.62, H * 0.1, 4.2, '#AEB3A2', true);
    ridge(H * 0.74, H * 0.08, 2.4, '#7F8C77', true);
    ridge(H * 0.88, H * 0.06, 5.9, '#55624F', false);
  } else {
    g.fillStyle = '#EEE6D8';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#B9673F';
    g.beginPath();
    g.moveTo(W * 0.12, H * 0.92);
    g.lineTo(W * 0.12, H * 0.55);
    g.arc(W * 0.37, H * 0.55, W * 0.25, Math.PI, 0, false);
    g.lineTo(W * 0.62, H * 0.92);
    g.closePath();
    g.fill();
    g.fillStyle = '#9DAA8C';
    g.beginPath();
    g.arc(W * 0.7, H * 0.28, W * 0.16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#D8A85A';
    g.beginPath();
    g.arc(W * 0.62, H * 0.92, W * 0.2, Math.PI, 0, false);
    g.fill();
    g.strokeStyle = '#2E2B28';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(W * 0.08, H * 0.18);
    g.bezierCurveTo(W * 0.4, H * 0.1, W * 0.5, H * 0.42, W * 0.92, H * 0.36);
    g.stroke();
  }
  // 纸纹
  const img = g.getImageData(0, 0, W, H);
  const r = rng(7);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ───────────────────────── 网格小工具 ─────────────────────────

function M(geo, key, x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0, order = 'XYZ', s = null, shadow = true } = {}) {
  const m = new THREE.Mesh(geo, mat(key));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz, order);
  if (s != null) {
    if (typeof s === 'number') m.scale.setScalar(s);
    else m.scale.set(s[0], s[1], s[2]);
  }
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (typeof key === 'string' && SLOT_BY_ID[key]) m.userData.slot = key;
  return m;
}
const B = (w, h, d, key, x, y, z, r = 0, o) => M(boxGeo(w, h, d, r), key, x, y, z, o);
const C = (rt, rb, h, key, x, y, z, seg = 24, o) => M(cylGeo(rt, rb, h, seg), key, x, y, z, o);
/** 软垫（鼓起的圆角盒子） */
const SB = (w, h, d, key, x, y, z, soft = {}, o) => M(softBoxGeo(w, h, d, { rs: Q(3, 2), seg: Q(0.07, 0.11), ...soft }), key, x, y, z, o);
/** 刀边抱枕（底边中点为原点，立着） */
const PW = (w, h, t, key, x, y, z, o, opt) => M(pillowGeo(w, h, t, { n: Q(12, 8), ...opt }), key, x, y, z, o);
/** 圆角板（可倒角、开孔） */
const SL = (w, d, t, key, x, y, z, opt = {}, o) => M(slabGeo(w, d, t, opt), key, x, y, z, o);
/** 旋转体 */
const LA = (profile, key, x, y, z, o, seg) => M(latheGeo(profile, seg || Q(32, 24)), key, x, y, z, o);

function group(...children) {
  const g = new THREE.Group();
  children.flat(3).filter(Boolean).forEach((c) => g.add(c));
  return g;
}

function led(L, x, y, z) {
  return M(boxGeo(L, 0.008, 0.02), 'led', x, y, z, { shadow: false });
}

const corners = (hx, hz) => [
  [-hx, -hz],
  [hx, -hz],
  [-hx, hz],
  [hx, hz],
];
/** 圆锥形细脚（上粗下细） */
const roundLegs = (pts, h, key, rt = 0.016, rb = 0.011) => pts.map(([x, z]) => C(rt, rb, h, key, x, 0, z, Q(14, 10)));
/** 方锥形脚 */
const squareLegs = (pts, h, key, wt = 0.042, wb = 0.03) => pts.map(([x, z]) => M(taperBoxGeo(wb, wb, wt, wt, h), key, x, 0, z));

const BOOK = ['#E8E1D3', '#D9CCB4', '#BCA582', '#8E6F55', '#5E4A3A', '#2F3B42', '#6F7F80', '#A4B19F', '#B5653F', '#C9A65C', '#7B2F2C', '#3D4A5D', '#F3EFE7', '#9B9085', '#C4C9C2'];
const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

// ───────────────────────── 合并（每件家具按材质合并成几个网格） ─────────────────────────

const KEEP_ATTR = ['position', 'normal', 'uv', 'color'];
function prep(g, color) {
  for (const name of Object.keys(g.attributes)) if (!KEEP_ATTR.includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (color && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  if (!color && g.attributes.color) g.deleteAttribute('color');
  if (g.attributes.color && g.attributes.color.itemSize !== 3) g.deleteAttribute('color');
  if (!g.index) {
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

/**
 * 同一件家具里，同材质（同投影设置）的静态网格合并成一个。
 * 单独保留：实例（叶子）、灯泡、透明（玻璃）、主题墙两种模式、userData.keep。
 */
function compact(root, { clone = false } = {}) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const keep = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (o.isInstancedMesh || o.userData.featureMode || o.userData.keep || Array.isArray(m) || m.transparent || m === LIB.fixed.bulb) {
      keep.push(o);
      return;
    }
    const k = `${m.uuid}|${o.castShadow ? 1 : 0}`;
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = { m, cast: o.castShadow, list: [] }));
    b.list.push(o);
  });
  const out = new THREE.Group();
  for (const o of keep) {
    o.matrixWorld.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  for (const b of buckets.values()) {
    if (b.list.length === 1 && !clone) {
      const o = b.list[0];
      o.matrixWorld.decompose(o.position, o.quaternion, o.scale);
      out.add(o);
      continue;
    }
    const color = !!b.m.vertexColors;
    const geos = b.list.map((o) => prep(o.geometry.clone().applyMatrix4(o.matrixWorld), color));
    const g = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    for (const o of b.list) if (!o.geometry.userData.cached) o.geometry.dispose();
    if (!g) continue;
    const mesh = new THREE.Mesh(g, b.m);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    if (b.m.userData.slot) mesh.userData.slot = b.m.userData.slot;
    out.add(mesh);
  }
  return out;
}

// ───────────────────────── 叶子（实例） ─────────────────────────

const _o = new THREE.Object3D();
const _c = new THREE.Color();
/** list: [{x,y,z, yaw, pitch(往上为正), roll, len, wid, c:[r,g,b]}] */
function leafMesh(type, list, key = 'leaf', opts) {
  const m = new THREE.InstancedMesh(leafGeo(type, opts), mat(key), list.length);
  list.forEach((l, i) => {
    _o.position.set(l.x, l.y, l.z);
    _o.rotation.set(-l.pitch, l.yaw, l.roll || 0, 'YXZ');
    _o.scale.set(l.len * (l.wid || 1), l.len, l.len);
    _o.updateMatrix();
    m.setMatrixAt(i, _o.matrix);
    _c.setRGB(l.c[0], l.c[1], l.c[2]);
    m.setColorAt(i, _c);
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = true;
  m.receiveShadow = true;
  m.computeBoundingBox();
  m.computeBoundingSphere();
  return m;
}
const tint = (r, base, v = 0.16) => {
  const k = 1 - v / 2 + r() * v;
  return [base[0] * k, base[1] * k, base[2] * k];
};

// ───────────────────────── 小摆件 ─────────────────────────

/** 花瓶：style 'amphora' | 'bottle' | 'cyl' | 'bud' | 'bowl' */
function vase(x, y, z, { h = 0.3, r = 0.08, key = 'pot', style = 'amphora' } = {}) {
  let p;
  if (style === 'bottle') p = [[0, 0], [r * 0.7, 0], [r * 0.95, h * 0.07], [r, h * 0.3], [r * 0.88, h * 0.56], [r * 0.36, h * 0.74], [r * 0.25, h * 0.88], [r * 0.29, h], [r * 0.19, h], [r * 0.17, h * 0.9], [0, h * 0.9]];
  else if (style === 'cyl') p = [[0, 0], [r * 0.95, 0], [r, h * 0.03], [r, h * 0.97], [r * 0.96, h], [r * 0.86, h], [r * 0.86, h * 0.9], [0, h * 0.9]];
  else if (style === 'bud') p = [[0, 0], [r * 0.8, 0], [r, h * 0.2], [r * 0.88, h * 0.48], [r * 0.3, h * 0.8], [r * 0.28, h], [r * 0.17, h], [r * 0.16, h * 0.9], [0, h * 0.9]];
  else if (style === 'bowl') p = [[0, 0], [r * 0.42, 0], [r * 0.48, h * 0.08], [r * 0.84, h * 0.46], [r, h * 0.97], [r * 0.97, h], [r * 0.91, h * 0.97], [r * 0.76, h * 0.52], [r * 0.38, h * 0.24], [0, h * 0.2]];
  else p = [[0, 0], [r * 0.52, 0], [r * 0.6, h * 0.05], [r, h * 0.42], [r * 0.8, h * 0.78], [r * 0.48, h * 0.92], [r * 0.5, h], [r * 0.4, h], [r * 0.38, h * 0.9], [0, h * 0.9]];
  return LA(p, key, x, y, z, {}, Q(28, 18));
}

/** 平放的一摞书（书色多样） */
function bookStack(x, y, z, n, rand, { w = 0.22, d = 0.16, ry = 0 } = {}) {
  const geos = [];
  let yy = 0;
  for (let i = 0; i < n; i++) {
    const t = 0.018 + rand() * 0.022;
    geos.push(placedBox(w * (0.86 + rand() * 0.22), t, d * (0.86 + rand() * 0.2), (rand() - 0.5) * 0.02, yy, (rand() - 0.5) * 0.014, pick(BOOK, rand), { ry: (rand() - 0.5) * 0.16 }));
    yy += t;
  }
  const m = M(merge(geos), 'books', x, y, z, { ry });
  m.userData.top = yy;
  return m;
}

/** 几根干枝（插在瓶里）+ 小叶子 */
function branches(x, y, z, rand, { n = 3, h = 0.5, spread = 0.16, leaves = true, type = 'olive' } = {}) {
  const out = [];
  const lv = [];
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const lean = (0.15 + rand() * 0.35) * spread * 4;
    const hh = h * (0.75 + rand() * 0.4);
    const pts = [
      [0, 0, 0],
      [Math.sin(a) * lean * 0.25 * hh, hh * 0.45, Math.cos(a) * lean * 0.25 * hh],
      [Math.sin(a) * lean * 0.6 * hh, hh * 0.8, Math.cos(a) * lean * 0.6 * hh],
      [Math.sin(a + 0.4) * lean * hh, hh, Math.cos(a + 0.4) * lean * hh],
    ];
    out.push(M(tubeGeo(pts.map((p) => p.map((v) => +v.toFixed(3))), 0.003, { seg: 10, radial: 4 }), 'bark', x, y, z));
    if (leaves)
      for (let k = 0; k < Q(9, 5); k++) {
        const t = 0.35 + (k / 9) * 0.65;
        const j = Math.min(2, Math.floor(t * 3));
        const p0 = pts[j];
        const p1 = pts[j + 1];
        const f = t * 3 - j;
        const px = p0[0] + (p1[0] - p0[0]) * f;
        const py = p0[1] + (p1[1] - p0[1]) * f;
        const pz = p0[2] + (p1[2] - p0[2]) * f;
        lv.push({ x: x + px, y: y + py, z: z + pz, yaw: rand() * Math.PI * 2, pitch: -0.2 + rand() * 0.9, roll: (rand() - 0.5) * 0.6, len: type === 'olive' ? 0.05 + rand() * 0.025 : 0.04 + rand() * 0.02, c: tint(rand, [0.8, 0.9, 0.78]) });
      }
  }
  if (lv.length) out.push(leafMesh(type, lv, 'leaf2', { fold: 0.15, curl: 0.12 }));
  return out;
}

function candle(x, y, z, h = 0.08) {
  return [C(0.032, 0.032, h, 'wax', x, y, z, 18), C(0.0018, 0.0018, 0.012, 'black', x, y + h, z, 4, { shadow: false })];
}

/** 圆托盘 */
function tray(x, y, z, R = 0.16, key = 'woodwork') {
  return LA([[0, 0], [R - 0.004, 0], [R, 0.004], [R, 0.018], [R - 0.004, 0.018], [R - 0.007, 0.008], [0, 0.007]], key, x, y, z, {}, Q(36, 24));
}

/** 台灯：陶瓷底座 + 布灯罩 + 灯泡 */
function tableLamp(x, y, z, { h = 0.5, shadeR = 0.14, key = 'pot' } = {}) {
  const bh = h * 0.5;
  return [
    LA([[0, 0], [0.05, 0], [0.062, 0.008], [0.08, bh * 0.4], [0.07, bh * 0.75], [0.035, bh * 0.94], [0.028, bh], [0, bh]], key, x, y, z),
    C(0.006, 0.006, h * 0.2, 'metal', x, y + bh, z, 8),
    LA([[shadeR, 0], [shadeR * 0.8, h * 0.4]], 'lampShade', x, y + h * 0.6, z, { shadow: true }, Q(32, 20)),
    M(sphereGeo(0.026), 'bulb', x, y + h * 0.7, z, { shadow: false }),
  ];
}

/** 一双拖鞋（客厅门口 / 鞋柜下） */
function slippers(x, z, ry = 0, key = 'accents') {
  const out = [];
  for (const s of [-1, 1]) {
    const px = x + s * 0.06 * Math.cos(ry);
    const pz = z - s * 0.06 * Math.sin(ry);
    const a = ry + s * 0.08;
    out.push(SB(0.095, 0.022, 0.26, 'sole', px, 0, pz, { r: 0.01, cy: 0.003, seg: 0.05 }, { ry: a }));
    out.push(SB(0.1, 0.045, 0.08, key, px + Math.sin(a) * 0.06, 0.016, pz + Math.cos(a) * 0.06, { r: 0.018, cy: 0.012, seg: 0.04 }, { ry: a }));
  }
  return out;
}

// ───────────────────────── 柜门 ─────────────────────────

/** 一块门板 + 拉手。handle: 'none' 'bar'(竖) 'barH'(横) 'knob' 'groove'(顶边指槽) ；side: 拉手靠哪边 (-1/1/0) */
function panel(w, h, cx, y, zBack, key, { t = 0.018, handle = 'none', side = 0, hy, fluted = false } = {}) {
  const out = [];
  const zc = zBack + t / 2;
  if (fluted) out.push(M(flutedGeo(w, h, t, typeof fluted === 'number' ? fluted : 0.022), key, cx, y, zc));
  else out.push(B(w, h, t, key, cx, y, zc, 0.003));
  const zf = zBack + t;
  const hx = cx + side * (w / 2 - 0.045);
  if (handle === 'bar') {
    const L = Math.min(0.5, h * 0.42);
    const yy = hy ?? (h > 1.2 ? y + 0.95 - L / 2 : y + h - L - 0.06);
    out.push(B(0.011, L, 0.011, 'metal', hx, yy, zf + 0.026, 0.004));
    for (const k of [0.12, 0.88]) out.push(B(0.007, 0.007, 0.022, 'metal', hx, yy + L * k, zf + 0.011));
  } else if (handle === 'barH') {
    const L = Math.min(0.32, w * 0.5);
    const yy = hy ?? y + h - 0.05;
    out.push(B(L, 0.011, 0.011, 'metal', cx, yy, zf + 0.026, 0.004));
    for (const k of [-0.38, 0.38]) out.push(B(0.007, 0.007, 0.022, 'metal', cx + L * k, yy + 0.002, zf + 0.011));
  } else if (handle === 'knob') {
    const yy = hy ?? y + h * 0.8;
    out.push(LA([[0, 0], [0.006, 0], [0.006, 0.012], [0.014, 0.016], [0.016, 0.022], [0.012, 0.028], [0, 0.029]], 'metal', hx, yy, zf, { rx: Math.PI / 2 }, 16));
  } else if (handle === 'groove') {
    out.push(B(w - 0.004, 0.014, 0.003, 'black', cx, y + h - 0.02, zf - 0.0005, 0, { shadow: false }));
  }
  return out;
}

/** 一排门：x0..x1 × y0..y1，门板背面贴在 zBack；会在门后面垫一层黑色（门缝 / 阴影槽读得出来） */
function doorRow(x0, x1, y0, y1, zBack, key, { maxW = 0.6, gap = 0.003, handle = 'none', t, fluted, backer = true, hy } = {}) {
  const out = [];
  const L = x1 - x0;
  if (L < 0.08) return out;
  if (backer) out.push(B(L, y1 - y0, 0.002, 'black', (x0 + x1) / 2, y0, zBack - 0.001, 0, { shadow: false }));
  const n = Math.max(1, Math.round(L / maxW));
  const w = L / n;
  for (let i = 0; i < n; i++) {
    const cx = x0 + w * (i + 0.5);
    const side = n === 1 ? 1 : i % 2 === 0 ? 1 : -1;
    out.push(...panel(w - gap, y1 - y0 - gap, cx, y0 + gap / 2, zBack, key, { t, handle, side: n > 1 && i === n - 1 && n % 2 ? -1 : side, fluted, hy }));
  }
  return out;
}

/** 抽屉组：rows = 从下往上的高度比例 */
function drawerStack(x0, x1, y0, y1, zBack, key, rows = [0.42, 0.36, 0.22], { gap = 0.003, handle = 'none', channel = 0 } = {}) {
  const out = [B(x1 - x0, y1 - y0, 0.002, 'black', (x0 + x1) / 2, y0, zBack - 0.001, 0, { shadow: false })];
  const H = y1 - y0 - channel * (rows.length - 1);
  let y = y0;
  rows.forEach((k) => {
    const h = H * k;
    out.push(...panel(x1 - x0 - gap, h - gap, (x0 + x1) / 2, y + gap / 2, zBack, key, { handle, side: 0 }));
    y += h + channel;
  });
  return out;
}

// ───────────────────────── 客厅 ─────────────────────────

/** 一组软包座椅：底座、扶手、靠背框、坐垫、靠垫、抱枕、细脚。chaise = 右前方贵妃位深度（0 = 没有） */
function upholstered({ L, D, legH = 0.13, armW = 0.16, armH = 0.63, seatTop = 0.45, n = 2, pillows = 2, chaise = 0, legKey = 'metal', lumbar = false }) {
  const parts = [];
  const baseTop = seatTop - 0.15;
  const backT = Math.min(0.2, D * 0.24);
  const baseH = baseTop - legH;
  const cz = chaise ? chaise : 0;
  // 底座（含贵妃位）
  parts.push(SB(L, baseH, D, 'upholstery', 0, legH, 0, { r: 0.026, cx: 0.004, cz: 0.006 }));
  if (cz) parts.push(SB(Math.min(0.85, L * 0.4), baseH, cz + 0.03, 'upholstery', L / 2 - Math.min(0.85, L * 0.4) / 2, legH, D / 2 + cz / 2 - 0.015, { r: 0.026, cz: 0.006 }));
  const chW = cz ? Math.min(0.85, L * 0.4) : 0;
  // 靠背框
  parts.push(SB(L, armH + 0.03 - legH, backT, 'upholstery', 0, legH, -D / 2 + backT / 2, { r: 0.04, cy: 0.006, czb: 0.004, cz: 0.004 }));
  // 扶手（圆润的 track arm）
  for (const s of [-1, 1]) {
    const len = s > 0 && cz ? D + cz : D;
    const zc = s > 0 && cz ? cz / 2 : 0;
    parts.push(SB(armW, armH - legH, len, 'upholstery', s * (L / 2 - armW / 2), legH, zc, { r: Math.min(0.06, armW * 0.4), cy: 0.012, cx: 0.006 }));
  }
  // 坐垫：主座 n 个，贵妃位一个长垫
  const inner = L - 2 * armW;
  const cushions = [];
  if (cz) {
    const cw = chW - armW;
    const rest = inner - cw;
    const nm = Math.max(1, n - 1);
    for (let i = 0; i < nm; i++) cushions.push({ x0: -L / 2 + armW + (rest / nm) * i, x1: -L / 2 + armW + (rest / nm) * (i + 1), len: D - backT + 0.01 });
    cushions.push({ x0: L / 2 - armW - cw, x1: L / 2 - armW, len: D - backT + cz + 0.01 });
  } else for (let i = 0; i < n; i++) cushions.push({ x0: -L / 2 + armW + (inner / n) * i, x1: -L / 2 + armW + (inner / n) * (i + 1), len: D - backT + 0.01 });
  for (const c of cushions) {
    const w = c.x1 - c.x0 - 0.008;
    parts.push(SB(w, 0.15, c.len, 'upholstery', (c.x0 + c.x1) / 2, baseTop, -D / 2 + backT + c.len / 2 - 0.004, { r: 0.034, cy: 0.013, cz: 0.012, cx: 0.006 }));
  }
  // 靠垫：斜靠在靠背框上
  const nb = cz ? cushions.length : n;
  for (let i = 0; i < nb; i++) {
    const x0 = -L / 2 + armW + (inner / nb) * i;
    const w = inner / nb - 0.01;
    parts.push(SB(w, 0.42, 0.19, 'upholstery', x0 + inner / nb / 2, seatTop - 0.025, -D / 2 + backT + 0.085, { r: 0.07, cz: 0.03, czb: 0.01, cy: 0.012, cx: 0.01 }, { rx: -0.19 }));
  }
  // 抱枕
  if (pillows) {
    const pz = -D / 2 + backT + 0.3;
    const px = L / 2 - armW - Math.min(0.3, inner * 0.22);
    parts.push(PW(0.46, 0.46, 0.15, 'accents', -px, seatTop - 0.012, pz, { rx: -0.22, ry: 0.2, rz: 0.05 }));
    if (pillows > 1) parts.push(PW(0.42, 0.42, 0.14, 'accents', px, seatTop - 0.012, pz - 0.01, { rx: -0.2, ry: -0.22, rz: -0.06 }));
  }
  if (lumbar) parts.push(PW(0.4, 0.26, 0.12, 'accents', 0, seatTop - 0.01, -D / 2 + backT + 0.28, { rx: -0.2 }));
  // 贵妃位上一条叠好的毯子（斜放，一角搭出垫子前沿）
  if (cz) parts.push(SB(0.46, 0.045, 0.3, 'accents', L / 2 - armW - (chW - armW) / 2 - 0.03, seatTop + 0.004, D / 2 + cz - 0.22, { r: 0.02, cy: 0.008, cx: 0.004, seg: 0.05 }, { ry: 0.38 }));
  // 脚
  const legs = corners(L / 2 - 0.07, D / 2 - 0.07);
  if (cz) legs.push([L / 2 - 0.07, D / 2 + cz - 0.07], [L / 2 - chW + 0.07, D / 2 + cz - 0.07]);
  parts.push(...roundLegs(legs, legH, legKey, 0.017, 0.011));
  return parts;
}

/** 弧形沙发：一整条圆润的靠背、低扶手、一条长坐垫，沿弧线弯（前面凹，像在招呼人坐下） */
function curvySofa(w, d) {
  const L = w;
  const R = L * 1.6;
  let D2 = d * 0.8;
  let phi = 0;
  for (let k = 0; k < 3; k++) {
    phi = L / 2 / (R + D2 / 2);
    D2 = (2 * (d - R * (1 - Math.cos(phi)))) / (1 + Math.cos(phi));
  }
  const zMax = R * (1 - Math.cos(phi)) + (D2 / 2) * Math.cos(phi);
  const shift = -(zMax - D2 / 2) / 2;
  const seg = { seg: Q(0.06, 0.1) };
  const parts = [
    SB(L - 0.42, 0.05, D2 - 0.3, 'black', 0, 0, -0.02, { r: 0.02, ...seg }),
    SB(L, 0.32, D2, 'upholstery', 0, 0.045, 0, { r: 0.12, cx: 0.01, cz: 0.025, cy: 0.004, ...seg }),
    SB(L - 0.5, 0.12, D2 - 0.27, 'upholstery', 0, 0.335, 0.125, { r: 0.055, cy: 0.018, cz: 0.02, ...seg }),
    SB(L, 0.42, 0.3, 'upholstery', 0, 0.33, -D2 / 2 + 0.15, { r: 0.14, cz: 0.03, cy: 0.022, ...seg }),
    ...[-1, 1].map((s) => SB(0.27, 0.24, D2 - 0.18, 'upholstery', s * (L / 2 - 0.135), 0.33, 0.06, { r: 0.11, cy: 0.016, ...seg })),
    PW(0.42, 0.42, 0.15, 'accents', -L / 2 + 0.62, 0.45, -D2 / 2 + 0.44, { rx: -0.26, ry: 0.18, rz: 0.06 }),
    PW(0.38, 0.38, 0.14, 'bedding', L / 2 - 0.62, 0.45, -D2 / 2 + 0.43, { rx: -0.24, ry: -0.2, rz: -0.05 }),
  ];
  const g = compact(group(parts), { clone: true });
  g.traverse((o) => {
    if (!o.isMesh) return;
    bendGeo(o.geometry, R, -D2 / 2);
    o.geometry.translate(0, 0, shift);
  });
  return g;
}

function sofa({ w = 2.2, d = 0.92, variant = 'classic' }) {
  if (variant === 'curvy') return curvySofa(w, d);
  return group(upholstered({ L: w, D: d, n: w > 2.3 ? 3 : 2, chaise: variant === 'lshape' ? 0.8 : 0 }));
}

/** 木框休闲椅（扶手、斜后腿、厚坐垫 + 靠垫）：lounge 单椅 / 阳台躺椅共用 */
function frameChair({ W = 0.66, D = 0.74, seatY = 0.26, armY = 0.55, backH = 0.5, rake = 0.3, pillow = true }) {
  const parts = [];
  const hx = W / 2 - 0.02;
  for (const s of [-1, 1]) {
    const x = s * hx;
    parts.push(M(taperBoxGeo(0.03, 0.03, 0.04, 0.04, armY), 'woodwork', x, 0, D / 2 - 0.07));
    parts.push(M(taperBoxGeo(0.03, 0.03, 0.04, 0.04, armY + 0.18), 'woodwork', x, 0, -D / 2 + 0.12, { rx: -0.2 }));
    parts.push(B(0.05, 0.028, D - 0.02, 'woodwork', x, armY, -0.01, 0.01));
    parts.push(B(0.026, 0.045, D - 0.2, 'woodwork', x, seatY - 0.06, 0, 0.006));
  }
  parts.push(B(W - 0.04, 0.045, 0.026, 'woodwork', 0, seatY - 0.06, D / 2 - 0.08, 0.006));
  parts.push(B(W - 0.04, 0.045, 0.026, 'woodwork', 0, seatY - 0.06, -D / 2 + 0.14, 0.006));
  parts.push(SB(W - 0.08, 0.13, D - 0.14, 'upholstery', 0, seatY - 0.02, 0.03, { r: 0.04, cy: 0.016, cz: 0.012 }));
  parts.push(SB(W - 0.1, backH, 0.13, 'upholstery', 0, seatY + 0.08, -D / 2 + 0.17, { r: 0.05, cz: 0.025, cy: 0.01 }, { rx: -rake }));
  if (pillow) parts.push(PW(0.34, 0.3, 0.12, 'accents', 0.04, seatY + 0.1, -D / 2 + 0.3, { rx: -rake - 0.05, rz: 0.06 }));
  return parts;
}

function armchair({ variant = 'classic' }) {
  if (variant === 'lounge') return group(frameChair({}));
  return group(upholstered({ L: 0.8, D: 0.8, armW: 0.13, armH: 0.61, n: 1, pillows: 0, lumbar: true, legH: 0.14 }));
}

function coffeeTable({ variant = 'round', w = 1.0, d = 0.6 }) {
  const rand = rng(Math.round(w * 97 + d * 31));
  if (variant === 'round') {
    const R = 0.46;
    return group(
      LA([[0, 0], [R - 0.012, 0], [R - 0.002, 0.006], [R, 0.016], [R, 0.026], [R - 0.004, 0.036], [R - 0.014, 0.04], [0, 0.04]], 'woodwork', 0, 0.36, 0, {}, Q(64, 40)),
      LA([[0, 0], [0.27, 0], [0.275, 0.008], [0.255, 0.12], [0.24, 0.36], [0, 0.36]], 'woodwork', 0, 0, 0, {}, Q(48, 32)),
      bookStack(0.12, 0.4, -0.08, 2, rand, { w: 0.24, d: 0.17, ry: 0.35 }),
      vase(-0.17, 0.4, 0.1, { h: 0.065, r: 0.11, key: 'porcelain', style: 'bowl' })
    );
  }
  if (variant === 'stone')
    return group(
      SL(w, d, 0.05, 'countertop', 0, 0.3, 0, { r: 0.02, bevel: 0.006 }),
      SL(w - 0.2, d - 0.2, 0.3, 'countertop', 0, 0, 0, { r: 0.012, bevel: 0.004 }),
      bookStack(-w * 0.2, 0.35, -0.04, 3, rand, { w: 0.26, d: 0.19, ry: -0.2 }),
      vase(w * 0.22, 0.35, 0.03, { h: 0.2, r: 0.07, key: 'pot', style: 'amphora' }),
      branches(w * 0.22, 0.35 + 0.18, 0.03, rand, { n: 3, h: 0.3, spread: 0.12 })
    );
  return group(
    SL(w, d, 0.035, 'woodwork', 0, 0.365, 0, { r: 0.04, bevel: 0.006 }),
    SL(w - 0.14, d - 0.14, 0.018, 'woodwork', 0, 0.12, 0, { r: 0.03, bevel: 0.003 }),
    roundLegs(corners(w / 2 - 0.07, d / 2 - 0.07), 0.365, 'woodwork', 0.018, 0.012),
    tray(0.2, 0.4, 0, 0.15, 'metal'),
    candle(0.16, 0.418, 0.03),
    vase(0.26, 0.418, -0.04, { h: 0.08, r: 0.04, key: 'glaze', style: 'bud' }),
    bookStack(-0.2, 0.14, 0.02, 3, rand, { w: 0.26, d: 0.2 })
  );
}

function rug({ w = 2.4, d = 1.7, variant = 'rect' }) {
  if (variant === 'round') {
    const R = w / 2;
    return group(LA([[0, 0], [R - 0.01, 0], [R, 0.004], [R, 0.008], [R - 0.01, 0.012], [0, 0.012]], 'rugs', 0, 0.002, 0, { shadow: false }, Q(72, 48)));
  }
  return group(SL(w, d, 0.012, 'rugs', 0, 0.002, 0, { r: 0.05, bevel: 0.004 }, { shadow: false }));
}

/** 主题墙：木作 → 真实比例的格栅（2.6cm 条、4cm 间距、深色吸音底）；其他材质 → 大板 + 细分缝（切换材质时由引擎切换可见） */
function featurePanel(w, h, z = 0) {
  const slatW = 0.026;
  const pitch = 0.04;
  const n = Math.max(1, Math.floor((w - 0.02) / pitch));
  const geos = [];
  for (let i = 0; i < n; i++) geos.push(placedBox(slatW, h - 0.02, 0.022, -((n - 1) * pitch) / 2 + i * pitch, 0.01, z + 0.031));
  const slats = new THREE.Mesh(merge(geos), mat('feature'));
  slats.castShadow = true;
  slats.receiveShadow = true;
  slats.userData = { slot: 'feature', featureMode: 'slats' };
  const back = B(w, h, 0.02, 'feature', 0, 0, z + 0.01);
  back.material = LIB.fixed.cap;
  back.userData = { featureMode: 'slats' };
  // 大板：每块 ≤ 1.2m，4mm 分缝（缝里是深色衬条）
  const np = Math.max(1, Math.round(w / 1.2));
  const pw = w / np;
  const pg = [];
  const jg = [];
  for (let i = 0; i < np; i++) {
    pg.push(placedBox(pw - 0.004, h, 0.03, -w / 2 + pw * (i + 0.5), 0, z + 0.015));
    if (i > 0) jg.push(placedBox(0.012, h, 0.004, -w / 2 + pw * i, 0, z + 0.004));
  }
  const flat = new THREE.Mesh(merge(pg), mat('feature'));
  flat.castShadow = true;
  flat.receiveShadow = true;
  flat.userData = { slot: 'feature', featureMode: 'flat' };
  const out = [back, slats, flat];
  if (jg.length) {
    const joints = new THREE.Mesh(merge(jg), LIB.fixed.cap);
    joints.userData = { featureMode: 'flat' };
    out.push(joints);
  }
  return out;
}

function featureWall({ w = 2.4, h = 2.8 }) {
  return group(featurePanel(w, h, 0));
}

function tvWall({ w = 2.4, h = 2.8 }) {
  const rand = rng(Math.round(w * 131));
  const tvw = Math.min(1.46, w * 0.6);
  const tvh = tvw * 0.5625;
  const cab = Math.min(2.2, w - 0.2);
  const cy = 0.26;
  const ch = 0.34;
  const zB = 0.04;
  const zF = 0.43;
  return group(
    featurePanel(w, h, 0),
    // 悬浮电视柜：推弹门、门缝 3mm、底下一条灯带
    B(cab, ch, zF - zB, 'cabinetry', 0, cy, (zB + zF) / 2, 0.003),
    doorRow(-cab / 2 + 0.005, cab / 2 - 0.005, cy + 0.006, cy + ch - 0.006, zF, 'cabinetry', { maxW: 0.55, t: 0.016 }),
    led(cab - 0.1, 0, cy - 0.012, 0.3),
    // 超薄电视 + 窄边
    B(tvw, tvh, 0.024, 'tv', 0, 0.86, 0.06, 0.004),
    B(tvw - 0.012, tvh - 0.012, 0.002, 'screen', 0, 0.866, 0.0725),
    B(tvw * 0.42, tvh * 0.5, 0.03, 'tv', 0, 0.86 + tvh * 0.25, 0.035, 0.01),
    // 摆件：左边一摞书 + 小碗，右边陶瓶插枝
    bookStack(-cab / 2 + 0.32, cy + ch, 0.25, 3, rand, { w: 0.25, d: 0.18, ry: 0.12 }),
    vase(-cab / 2 + 0.32, cy + ch + 0.08, 0.25, { h: 0.07, r: 0.06, key: 'glaze', style: 'bowl' }),
    vase(cab / 2 - 0.28, cy + ch, 0.24, { h: 0.3, r: 0.085, key: 'pot', style: 'amphora' }),
    branches(cab / 2 - 0.28, cy + ch + 0.27, 0.24, rand, { n: 3, h: 0.42, spread: 0.18 })
  );
}

/** 书墙：侧板、顶板、内退踢脚、背板；书高矮厚薄不同，有平放的一摞、斜靠的一本、几件摆件（留白） */
function bookshelf({ w = 1.2, h = 2.2, d = 0.34, key = 'woodwork', seed = 1 }) {
  const parts = [];
  const t = 0.025;
  const base = 0.07;
  parts.push(B(t, h, d, key, -w / 2 + t / 2, 0, 0), B(t, h, d, key, w / 2 - t / 2, 0, 0), B(w, t, d, key, 0, h - t, 0));
  parts.push(B(w - 2 * t, base, d - 0.04, 'black', 0, 0, -0.02), B(w - 2 * t, t, d - 0.01, key, 0, base, 0.005), B(w - 2 * t, h - base, 0.012, key, 0, base, -d / 2 + 0.006));
  const shelves = Math.max(3, Math.round((h - base) / 0.36));
  const sh = (h - base - t - t) / shelves;
  const rand = rng(seed * 997 + Math.round(w * 13));
  const geos = [];
  const decor = [];
  const zFront = d / 2 - 0.03;
  for (let s = 0; s < shelves; s++) {
    const y = base + t + s * sh;
    if (s > 0) parts.push(B(w - 2 * t, t, d - 0.012, key, 0, y - t, 0.006));
    shelfBooks(geos, -w / 2 + t + 0.02, w / 2 - t - 0.02, y, zFront, sh - t, rand, decor);
  }
  if (geos.length) parts.push(M(merge(geos), 'books', 0, 0, 0));
  for (const o of decor) parts.push(...shelfDecor(o, zFront - 0.08, rand));
  return group(parts);
}

/** 一层书：一排排竖着、偶尔一摞平放、偶尔一本斜靠、偶尔留空 / 放摆件 */
function shelfBooks(geos, x0, x1, y, zFront, maxH, rand, decor) {
  let x = x0;
  while (x < x1 - 0.04) {
    const k = rand();
    if (k < 0.14) {
      x += 0.07 + rand() * 0.12;
      continue;
    }
    if (k < 0.27 && x1 - x > 0.22) {
      decor.push({ x: x + 0.1, y, k: rand() });
      x += 0.2 + rand() * 0.04;
      continue;
    }
    if (k < 0.39 && x1 - x > 0.26) {
      const n = 2 + Math.floor(rand() * 4);
      const sw = 0.17 + rand() * 0.06;
      let yy = y;
      for (let i = 0; i < n; i++) {
        const tt = 0.018 + rand() * 0.02;
        geos.push(placedBox(sw * (0.9 + rand() * 0.14), tt, 0.13 + rand() * 0.05, x + sw / 2, yy, zFront - 0.09, pick(BOOK, rand), { ry: (rand() - 0.5) * 0.12 }));
        yy += tt;
      }
      if (rand() < 0.45 && maxH - (yy - y) > 0.12) decor.push({ x: x + sw / 2, y: yy, k: 0.9 + rand() * 0.1, small: true });
      x += sw + 0.03;
      continue;
    }
    const n = 4 + Math.floor(rand() * 7);
    for (let i = 0; i < n && x < x1 - 0.03; i++) {
      const bw = 0.016 + rand() * 0.03;
      const bh = Math.min(maxH - 0.02, 0.17 + rand() * 0.12);
      const bd = 0.14 + rand() * 0.07;
      geos.push(placedBox(bw, bh, bd, x + bw / 2, y, zFront - bd / 2, pick(BOOK, rand)));
      if (rand() < 0.3) geos.push(placedBox(bw + 0.0008, 0.01 + rand() * 0.012, 0.002, x + bw / 2, y + bh * (0.76 + rand() * 0.12), zFront + 0.0008, rand() < 0.5 ? '#C9A65C' : '#F3EFE7'));
      x += bw + 0.0015;
    }
    if (rand() < 0.35 && x < x1 - 0.08) {
      const bh = Math.min(maxH - 0.03, 0.2 + rand() * 0.06);
      const ang = 0.16 + rand() * 0.12;
      geos.push(placedBox(0.022, bh, 0.16, x + bh * Math.sin(ang) + 0.008, y, zFront - 0.08, pick(BOOK, rand), { rz: ang }));
      x += bh * Math.sin(ang) + 0.03;
    }
    x += 0.012;
  }
}

function shelfDecor(o, z, rand) {
  const k = o.k;
  if (o.small || k > 0.9) return [M(sphereGeo(0.035, 16), 'metal', o.x, o.y + 0.035, z)];
  if (k < 0.4) return [vase(o.x, o.y, z, { h: 0.16 + rand() * 0.08, r: 0.05 + rand() * 0.02, key: pick(['pot', 'porcelain', 'glaze', 'sage'], rand), style: pick(['amphora', 'bottle', 'bud'], rand) })];
  if (k < 0.7) return [vase(o.x, o.y, z, { h: 0.06, r: 0.075, key: pick(['porcelain', 'glaze', 'pot'], rand), style: 'bowl' })];
  return [B(0.13, 0.17, 0.014, 'woodwork', o.x, o.y, z - 0.02, 0.003, { rx: -0.12 }), B(0.1, 0.13, 0.002, 'paper', o.x, o.y + 0.02, z - 0.0115, 0, { rx: -0.12 })];
}

function displayCabinet({ w = 1.2, h = 2.2, d = 0.42 }) {
  const parts = [];
  const t = 0.02;
  const base = 0.08;
  const rand = rng(Math.round(w * 100 + h * 10));
  parts.push(B(t, h, d, 'cabinetry', -w / 2 + t / 2, 0, 0), B(t, h, d, 'cabinetry', w / 2 - t / 2, 0, 0), B(w, t, d, 'cabinetry', 0, h - t, 0));
  parts.push(B(w - 0.04, base, d - 0.06, 'black', 0, 0, -0.03), B(w - 2 * t, t, d - 0.03, 'cabinetry', 0, base, -0.01), B(w - 2 * t, h - base, 0.012, 'cabinetry', 0, base, -d / 2 + 0.006));
  const shelves = 4;
  const sh = (h - base - t) / shelves;
  for (let s = 0; s < shelves; s++) {
    const y = base + t + s * sh;
    if (s > 0) {
      parts.push(B(w - 2 * t, 0.012, d - 0.06, 'cabinetry', 0, y - 0.012, -0.02));
      parts.push(led(w - 0.12, 0, y - 0.02, 0.12));
    }
    // 摆件：每层两三件，留白
    const cnt = 2 + (rand() < 0.4 ? 1 : 0);
    for (let i = 0; i < cnt; i++) {
      const x = -w / 2 + (w / (cnt + 1)) * (i + 1) + (rand() - 0.5) * 0.06;
      const k = rand();
      if (k < 0.35) parts.push(vase(x, y, -0.02, { h: Math.min(sh - 0.08, 0.2 + rand() * 0.12), r: 0.06 + rand() * 0.03, key: pick(['pot', 'porcelain', 'glaze', 'sage'], rand), style: pick(['amphora', 'bottle', 'bud', 'cyl'], rand) }));
      else if (k < 0.55) parts.push(vase(x, y, -0.02, { h: 0.07, r: 0.09, key: 'porcelain', style: 'bowl' }));
      else if (k < 0.75) parts.push(bookStack(x, y, -0.03, 3, rand, { w: 0.2, d: 0.15 }));
      else parts.push(...[0, 1, 2, 3].map((j) => C(0.1, 0.095, 0.012, 'porcelain', x, y + j * 0.013, -0.04, 32)));
    }
  }
  // 两扇（或更多）玻璃门：细黑框 + 玻璃（玻璃合成一块，单独保留透明）
  const n = Math.max(2, Math.round(w / 0.6));
  const dw = (w - 0.01) / n;
  const gl = [];
  const zG = d / 2 + 0.008;
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + 0.005 + dw * (i + 0.5);
    const fw = 0.022;
    parts.push(B(dw - 0.004, fw, 0.02, 'frame', cx, 0.01, zG), B(dw - 0.004, fw, 0.02, 'frame', cx, h - 0.01 - fw, zG));
    parts.push(B(fw, h - 0.02, 0.02, 'frame', cx - dw / 2 + 0.002 + fw / 2, 0.01, zG), B(fw, h - 0.02, 0.02, 'frame', cx + dw / 2 - 0.002 - fw / 2, 0.01, zG));
    gl.push(placedBox(dw - 0.004 - 2 * fw, h - 0.02 - 2 * fw, 0.006, cx, 0.01 + fw, zG));
    const side = i % 2 === 0 ? 1 : -1;
    parts.push(B(0.01, 0.42, 0.012, 'metal', cx + side * (dw / 2 - 0.04), h * 0.42, zG + 0.022, 0.004));
  }
  const glass = new THREE.Mesh(merge(gl), LIB.fixed.glass);
  glass.renderOrder = 2;
  glass.castShadow = false;
  parts.push(glass);
  return group(parts);
}

// ───────────────────────── 植物（一片片叶子，实例化） ─────────────────────────

function planter(style, r, h, key) {
  let p;
  if (style === 'belly') p = [[0, 0], [r * 0.55, 0], [r * 0.62, 0.012], [r * 0.95, h * 0.45], [r * 0.9, h * 0.82], [r * 0.82, h], [r * 0.76, h], [r * 0.75, h * 0.94]];
  else if (style === 'cyl') p = [[0, 0], [r * 0.95, 0], [r, 0.01], [r, h * 0.985], [r * 0.97, h], [r * 0.9, h], [r * 0.9, h * 0.95]];
  else p = [[0, 0], [r * 0.72, 0], [r * 0.77, 0.008], [r * 0.97, h * 0.95], [r, h], [r * 0.93, h], [r * 0.91, h * 0.94]];
  const top = h * 0.94 - 0.012;
  const soilR = (style === 'belly' ? 0.75 : style === 'cyl' ? 0.9 : 0.91) * r - 0.004;
  return { parts: [LA(p, key, 0, 0, 0, {}, Q(36, 22)), C(soilR, soilR, 0.012, 'soil', 0, top, 0, Q(24, 16), { shadow: false })], top: top + 0.012 };
}

function plant({ variant = 'tall', seed = 3 }) {
  const rand = rng(seed * 131 + 17);
  const parts = [];
  const LEAF_G = [0.86, 1, 0.82];
  if (variant === 'small') {
    const pot = planter(seed % 2 ? 'cyl' : 'belly', 0.12, 0.2, pick(['pot', 'terracotta', 'porcelain'], rand));
    parts.push(...pot.parts);
    const list = [];
    if (seed % 2) {
      // 虎尾兰：直立的剑形叶
      const n = Q(13, 10);
      for (let i = 0; i < n; i++) {
        const a = i * 2.39996 + rand() * 0.5;
        const off = 0.015 + rand() * 0.05;
        list.push({ x: Math.sin(a) * off, y: pot.top - 0.01, z: Math.cos(a) * off, yaw: a, pitch: Math.PI / 2 - 0.05 - rand() * 0.22, roll: rand() * Math.PI, len: 0.32 + rand() * 0.24, c: tint(rand, [0.72, 0.9, 0.7], 0.2) });
      }
      parts.push(leafMesh('sword', list, 'leaf', { fold: 0.14, curl: 0.03, nz: 8, nx: 1 }));
    } else {
      // 圆叶椒草：叶柄从土里长出、一圈圈张开成一丛（外圈低、里圈高）
      const n = Q(30, 20);
      for (let i = 0; i < n; i++) {
        const a = i * 2.39996 + rand() * 0.3;
        const k = i / n;
        const off = 0.008 + rand() * 0.02;
        list.push({ x: Math.sin(a) * off, y: pot.top + 0.004 + (1 - k) * 0.05 * rand(), z: Math.cos(a) * off, yaw: a, pitch: 0.2 + (1 - k) * 0.9 + rand() * 0.25, roll: (rand() - 0.5) * 0.5, len: 0.1 + rand() * 0.05, c: tint(rand, LEAF_G, 0.22) });
      }
      parts.push(leafMesh('round', list, 'leaf', { fold: 0.08, curl: 0.16, nz: 7 }));
    }
    return group(parts);
  }
  const kind = seed % 3; // 0 琴叶榕 · 1 天堂鸟 · 2 橄榄树
  const pot = planter(kind === 1 ? 'cyl' : kind === 2 ? 'belly' : 'taper', 0.19, 0.4, pick(['pot', 'terracotta', 'glaze', 'porcelain'], rand));
  parts.push(...pot.parts);
  const top = pot.top;
  if (kind === 1) {
    // 天堂鸟：长叶柄从土里扇形长出，顶端一片大桨形叶
    const n = Q(9, 7);
    const list = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996 + rand() * 0.4;
      const lean = 0.06 + rand() * 0.24;
      const sh = 0.5 + rand() * 0.55;
      const tip = [Math.sin(a) * Math.sin(lean) * sh, Math.cos(lean) * sh, Math.cos(a) * Math.sin(lean) * sh];
      const pts = [
        [Math.sin(a) * 0.02, -0.02, Math.cos(a) * 0.02],
        [tip[0] * 0.45, tip[1] * 0.5, tip[2] * 0.45],
        tip,
      ];
      parts.push(M(tubeGeo(pts.map((p) => p.map((v) => +v.toFixed(3))), 0.0075, { seg: 12, radial: 5 }), 'stem', 0, top, 0));
      list.push({ x: tip[0], y: top + tip[1] - 0.02, z: tip[2], yaw: a, pitch: Math.PI / 2 - lean - 0.12 - rand() * 0.25, roll: (rand() - 0.5) * 1.2, len: 0.38 + rand() * 0.16, c: tint(rand, [0.8, 0.95, 0.85]) });
    }
    parts.push(leafMesh('paddle', list, 'leaf', { fold: 0.1, curl: 0.1, wave: 0.01 }));
  } else if (kind === 0) {
    // 琴叶榕：细树干，叶子集中在上半段，螺旋着长
    const H = 1.25;
    const trunk = [
      [0, -0.04, 0],
      [0.015, H * 0.3, 0.01],
      [-0.012, H * 0.65, -0.01],
      [0.008, H, 0.005],
    ];
    parts.push(M(tubeGeo(trunk, 0.016, { seg: 16, radial: 6 }), 'bark', 0, top, 0));
    const list = [];
    const n = Q(58, 42);
    for (let i = 0; i < n; i++) {
      const t = 0.4 + 0.6 * Math.pow(i / n, 0.85);
      const a = i * 2.39996 + rand() * 0.5;
      const len = 0.2 + rand() * 0.1;
      const off = 0.012 + rand() * 0.02;
      list.push({ x: Math.sin(a) * off, y: top + H * t, z: Math.cos(a) * off, yaw: a, pitch: -0.1 + rand() * 0.55 + (t > 0.94 ? 0.6 : 0), roll: (rand() - 0.5) * 0.7, len, wid: 1.12, c: tint(rand, [0.74, 0.92, 0.74]) });
    }
    parts.push(leafMesh('fig', list, 'leaf', { fold: 0.08, curl: 0.2, wave: 0.03 }));
  } else {
    // 橄榄树：分叉的细干，细长灰绿小叶成团
    const H = 1.15;
    const trunk = [
      [0, -0.04, 0],
      [0.02, H * 0.35, 0.01],
      [-0.01, H * 0.6, 0.02],
    ];
    parts.push(M(tubeGeo(trunk, 0.013, { seg: 12, radial: 6 }), 'bark', 0, top, 0));
    const tips = [];
    for (let b = 0; b < 3; b++) {
      const a = b * 2.1 + rand() * 0.6;
      const end = [Math.sin(a) * (0.12 + rand() * 0.06), H * (0.88 + rand() * 0.2), Math.cos(a) * (0.12 + rand() * 0.06)];
      const pts = [trunk[2], [end[0] * 0.5 + trunk[2][0] * 0.5, (end[1] + trunk[2][1]) / 2 + 0.04, end[2] * 0.5 + trunk[2][2] * 0.5], end];
      parts.push(M(tubeGeo(pts.map((p) => p.map((v) => +v.toFixed(3))), 0.007, { seg: 10, radial: 5 }), 'bark', 0, top, 0));
      tips.push(end, pts[1]);
    }
    const list = [];
    const n = Q(330, 210);
    for (let i = 0; i < n; i++) {
      const c = tips[i % tips.length];
      const big = i % tips.length % 2 === 0;
      const rr = (big ? 0.17 : 0.11) * (0.5 + 0.5 * Math.cbrt(rand()));
      const u = rand() * Math.PI * 2;
      const v = Math.acos(2 * rand() - 1);
      list.push({ x: c[0] + rr * Math.sin(v) * Math.cos(u), y: top + c[1] + rr * Math.cos(v) * 0.75, z: c[2] + rr * Math.sin(v) * Math.sin(u), yaw: rand() * Math.PI * 2, pitch: -0.4 + rand() * 1.1, roll: (rand() - 0.5) * 1.2, len: 0.07 + rand() * 0.03, wid: 1.5, c: tint(rand, [0.74, 0.84, 0.72], 0.2) });
    }
    parts.push(leafMesh('olive', list, 'leaf2', { fold: 0.12, curl: 0.08, nz: 5, nx: 1 }));
  }
  return group(parts);
}

function floorLamp() {
  return group(
    LA([[0, 0], [0.155, 0], [0.16, 0.006], [0.155, 0.018], [0.14, 0.022], [0, 0.024]], 'metal', 0, 0, 0, {}, Q(40, 28)),
    C(0.008, 0.009, 1.36, 'metal', 0, 0.02, 0, 10),
    LA([[0.21, 0], [0.165, 0.3]], 'lampShade', 0, 1.24, 0, {}, Q(40, 28)),
    M(torusGeo(0.21, 0.003, Q(40, 28), 4), 'metal', 0, 1.24, 0, { rx: Math.PI / 2, shadow: false }),
    M(sphereGeo(0.035), 'bulb', 0, 1.34, 0, { shadow: false })
  );
}

function sideTable() {
  return group(
    LA([[0, 0], [0.215, 0], [0.22, 0.006], [0.22, 0.02], [0.214, 0.026], [0, 0.026]], 'woodwork', 0, 0.5, 0, {}, Q(48, 32)),
    C(0.016, 0.016, 0.5, 'metal', 0, 0.01, 0, 12),
    LA([[0, 0], [0.15, 0], [0.155, 0.006], [0.15, 0.014], [0, 0.016]], 'metal', 0, 0, 0, {}, Q(40, 28)),
    vase(0.07, 0.526, -0.04, { h: 0.16, r: 0.045, key: 'glaze', style: 'bottle' }),
    bookStack(-0.06, 0.526, 0.05, 2, rng(5), { w: 0.18, d: 0.13, ry: 0.4 })
  );
}

/** 挂画：细木框 + 白色卡纸（窗口有斜边感）+ 画面（程序画的版画） */
function art({ w = 0.9, h = 0.65 }) {
  const fw = 0.022;
  const z0 = -0.0175;
  const T = 0.035;
  const mat0 = Math.min(w, h) * 0.13;
  const pw = w - 2 * fw - 2 * mat0;
  const ph = h - 2 * fw - 2 * mat0;
  const land = w >= h;
  return group(
    // 框
    B(w, fw, T, 'woodwork', 0, 0, z0 + T / 2, 0.003),
    B(w, fw, T, 'woodwork', 0, h - fw, z0 + T / 2, 0.003),
    B(fw, h - 2 * fw, T, 'woodwork', -w / 2 + fw / 2, fw, z0 + T / 2, 0.003),
    B(fw, h - 2 * fw, T, 'woodwork', w / 2 - fw / 2, fw, z0 + T / 2, 0.003),
    // 卡纸（四条，围出画窗）+ 背板
    B(w - 2 * fw, h - 2 * fw, 0.004, 'paper', 0, fw, z0 + 0.006),
    B(w - 2 * fw, mat0, 0.005, 'paper', 0, fw, z0 + 0.0135),
    B(w - 2 * fw, mat0, 0.005, 'paper', 0, h - fw - mat0, z0 + 0.0135),
    B(mat0, ph, 0.005, 'paper', -w / 2 + fw + mat0 / 2, fw + mat0, z0 + 0.0135),
    B(mat0, ph, 0.005, 'paper', w / 2 - fw - mat0 / 2, fw + mat0, z0 + 0.0135),
    M(new THREE.PlaneGeometry(pw, ph).translate(0, ph / 2, 0), land ? 'artB' : 'artA', 0, fw + mat0, z0 + 0.0085, { shadow: false })
  );
}

function altar({ w = 1.2 }) {
  const parts = [];
  const D = 0.5;
  const zF = D / 2 - 0.018;
  parts.push(B(w - 0.04, 0.06, D - 0.08, 'black', 0, 0, -0.04));
  parts.push(B(w, 0.79 - 0.06, D - 0.018, 'cabinetry', 0, 0.06, -0.009, 0.002));
  parts.push(...doorRow(-w / 2 + 0.005, w / 2 - 0.005, 0.065, 0.785, zF, 'cabinetry', { maxW: 0.6, handle: 'knob', hy: 0.66 }));
  parts.push(SL(w + 0.02, D + 0.02, 0.04, 'countertop', 0, 0.79, 0.005, { bevel: 0.003 }));
  parts.push(B(w, 1.12, 0.03, 'cabinetry', 0, 0.83, -D / 2 + 0.015));
  parts.push(B(w * 0.62, 0.62, 0.012, 'altarRed', 0, 1.1, -D / 2 + 0.036));
  parts.push(B(w * 0.66, 0.025, 0.02, 'metal', 0, 1.72, -D / 2 + 0.04), B(w * 0.66, 0.025, 0.02, 'metal', 0, 1.08, -D / 2 + 0.04));
  // 两层台座
  parts.push(B(w * 0.56, 0.12, 0.26, 'woodwork', 0, 0.83, -0.1, 0.006), B(w * 0.4, 0.1, 0.18, 'woodwork', 0, 0.95, -0.13, 0.006));
  // 香炉、烛台、果盘（三个柑）
  parts.push(LA([[0, 0], [0.05, 0], [0.055, 0.012], [0.075, 0.05], [0.078, 0.07], [0.07, 0.072], [0.068, 0.06], [0, 0.055]], 'metal', 0, 0.83, 0.12));
  parts.push(C(0.064, 0.064, 0.004, 'paper', 0, 0.885, 0.12, 24, { shadow: false }));
  for (const s of [-1, 1]) {
    parts.push(LA([[0, 0], [0.035, 0], [0.036, 0.008], [0.012, 0.02], [0.01, 0.13], [0.022, 0.14], [0, 0.142]], 'metal', s * w * 0.33, 0.83, 0.1));
    parts.push(C(0.016, 0.016, 0.05, 'altarRed', s * w * 0.33, 0.972, 0.1, 12));
    // 莲花灯（夜里亮的红色）
    parts.push(C(0.004, 0.004, 0.08, 'metal', s * w * 0.4, 1.5, -D / 2 + 0.06, 6), M(sphereGeo(0.045, 16), 'altarRed', s * w * 0.4, 1.47, -D / 2 + 0.075));
  }
  parts.push(LA([[0, 0], [0.05, 0], [0.11, 0.02], [0.115, 0.024], [0, 0.012]], 'porcelain', w * 0.18, 0.83, 0.16));
  for (const [dx, dz] of [
    [-0.025, 0],
    [0.025, 0.01],
    [0, -0.03],
  ])
    parts.push(M(sphereGeo(0.034, 14), 'citrus', w * 0.18 + dx, 0.865, 0.16 + dz, { s: [1, 0.88, 1] }));
  return group(parts);
}

// ───────────────────────── 餐厅 ─────────────────────────

/** 餐椅：锥形圆腿、软垫座、弯的木靠背 */
function chair() {
  const parts = [];
  const seatY = 0.42;
  for (const [x, z] of [
    [-0.19, 0.18],
    [0.19, 0.18],
  ])
    parts.push(C(0.016, 0.012, seatY, 'woodwork', x, 0, z, Q(12, 8)));
  for (const x of [-0.19, 0.19]) parts.push(C(0.015, 0.012, 0.8, 'woodwork', x, 0, -0.17, Q(12, 8), { rx: -0.07 }));
  parts.push(B(0.42, 0.045, 0.4, 'woodwork', 0, seatY - 0.04, 0.01, 0.008));
  parts.push(SB(0.43, 0.05, 0.42, 'upholstery', 0, seatY, 0.015, { r: 0.018, cy: 0.009, cz: 0.004, seg: 0.06 }));
  const back = derived('chairback', softBoxGeo(0.42, 0.13, 0.022, { r: 0.008, rs: 2, seg: 0.03 }), (g) => bendGeo(g, 0.55, 0));
  parts.push(M(back, 'woodwork', 0, 0.64, -0.2, { rx: -0.07 }));
  parts.push(B(0.36, 0.02, 0.02, 'woodwork', 0, 0.15, -0.17, 0.004), B(0.36, 0.02, 0.02, 'woodwork', 0, 0.15, 0.18, 0.004));
  return group(parts);
}

function diningTable({ w = 1.6, d = 0.9, variant = 'rect', seats = 6 }) {
  const parts = [];
  const rand = rng(Math.round(w * 37 + seats));
  if (variant === 'round') {
    const R = w / 2;
    parts.push(LA([[0, 0], [R - 0.014, 0], [R - 0.003, 0.006], [R, 0.016], [R, 0.026], [R - 0.004, 0.034], [R - 0.014, 0.038], [0, 0.038]], 'woodwork', 0, 0.712, 0, {}, Q(72, 48)));
    // 郁金香式底座
    parts.push(LA([[0, 0], [0.27, 0], [0.275, 0.01], [0.24, 0.03], [0.1, 0.07], [0.065, 0.2], [0.06, 0.5], [0.09, 0.66], [0.17, 0.712], [0, 0.712]], 'woodwork', 0, 0, 0, {}, Q(48, 32)));
    const n = Math.max(2, seats);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = chair();
      c.position.set(Math.sin(a) * (R + 0.12), 0, Math.cos(a) * (R + 0.12));
      c.rotation.y = a + Math.PI;
      parts.push(c);
    }
    parts.push(vase(0, 0.75, 0, { h: 0.1, r: 0.13, key: 'porcelain', style: 'bowl' }));
    for (const [dx, dz] of [
      [-0.04, 0.02],
      [0.035, -0.01],
      [0, 0.05],
    ])
      parts.push(M(sphereGeo(0.035, 14), 'citrus', dx, 0.79, dz, { s: [1, 0.9, 1] }));
  } else {
    parts.push(SL(w, d, 0.034, 'woodwork', 0, 0.716, 0, { r: 0.012, bevel: 0.005 }));
    parts.push(B(w - 0.16, 0.07, d - 0.16, 'woodwork', 0, 0.646, 0, 0.004));
    parts.push(...squareLegs(corners(w / 2 - 0.07, d / 2 - 0.07), 0.716, 'woodwork', 0.05, 0.034));
    // 椅子：长边能放几把放几把，放不下的放两端
    const cap = Math.max(1, Math.floor((w - 0.04) / 0.56));
    const S = Math.max(1, seats);
    const sideN = Math.min(cap * 2, S - (S > cap * 2 ? Math.min(2, S - cap * 2) : 0));
    const per = [Math.ceil(sideN / 2), Math.floor(sideN / 2)];
    [1, -1].forEach((s, k) => {
      const m = per[k];
      for (let i = 0; i < m; i++) {
        const x = m === 1 ? 0 : -((m - 1) * Math.min(0.62, (w - 0.5) / Math.max(1, m - 1))) / 2 + i * Math.min(0.62, (w - 0.5) / Math.max(1, m - 1));
        const c = chair();
        c.position.set(x, 0, s * (d / 2 + 0.1));
        c.rotation.y = s > 0 ? Math.PI : 0;
        parts.push(c);
      }
    });
    const ends = S - sideN;
    for (let k = 0; k < Math.min(2, ends); k++) {
      const s = k === 0 ? 1 : -1;
      const c = chair();
      c.position.set(s * (w / 2 + 0.1), 0, 0);
      c.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      parts.push(c);
    }
    // 桌上：一只陶瓶插几枝 + 浅碗
    parts.push(vase(w > 1.2 ? -0.12 : 0, 0.75, 0, { h: 0.22, r: 0.07, key: 'pot', style: 'bottle' }));
    parts.push(branches(w > 1.2 ? -0.12 : 0, 0.75 + 0.2, 0, rand, { n: 3, h: 0.32, spread: 0.12, type: 'olive' }));
    if (w > 1.2) parts.push(vase(0.2, 0.75, 0.02, { h: 0.07, r: 0.12, key: 'glaze', style: 'bowl' }));
  }
  return group(parts);
}

function pendant({ drop = 0.9, h = 2.8 }) {
  const y = h - drop;
  const H = 0.2;
  const R = 0.23;
  const shell = [[0.01, H - 0.006], [0.055, H - 0.01], [0.125, H - 0.046], [0.185, H - 0.115], [R - 0.012, 0.004], [R - 0.006, -0.002], [R, 0], [R - 0.008, 0.01], [0.19, H - 0.11], [0.13, H - 0.04], [0.06, H - 0.004], [0.012, H]];
  return group(
    LA([[0, 0], [0.06, 0], [0.065, 0.006], [0.06, 0.022], [0, 0.024]], 'metal', 0, h - 0.024, 0, { shadow: false }),
    C(0.0025, 0.0025, drop - H - 0.02, 'black', 0, y + H, 0, 6, { shadow: false }),
    LA(shell, 'metal', 0, y, 0),
    C(0.02, 0.016, 0.03, 'black', 0, y + H - 0.03, 0, 12),
    M(sphereGeo(0.045), 'bulb', 0, y + 0.07, 0, { shadow: false })
  );
}

/** 餐边柜：竖向凹槽门、细脚、黄铜小圆钮；上面一瓶花枝、一摞书 + 小碗 */
function sideboard({ w = 1.8 }) {
  const rand = rng(Math.round(w * 71));
  const D = 0.45;
  const y0 = 0.16;
  const H = 0.62;
  const zF = D / 2 - 0.018;
  return group(
    B(w, H, D - 0.018, 'cabinetry', 0, y0, -0.009, 0.003),
    doorRow(-w / 2 + 0.006, w / 2 - 0.006, y0 + 0.006, y0 + H - 0.006, zF, 'cabinetry', { maxW: 0.48, fluted: 0.03, t: 0.026, handle: 'knob', hy: y0 + H * 0.55 }),
    squareLegs(corners(w / 2 - 0.06, D / 2 - 0.06), y0, 'metal', 0.026, 0.02),
    vase(-w / 3, y0 + H, 0, { h: 0.34, r: 0.09, key: 'pot', style: 'amphora' }),
    branches(-w / 3, y0 + H + 0.31, 0, rand, { n: 4, h: 0.5, spread: 0.2 }),
    bookStack(w / 4, y0 + H, 0.02, 3, rand, { w: 0.26, d: 0.19, ry: -0.1 }),
    vase(w / 4, y0 + H + 0.085, 0.02, { h: 0.06, r: 0.07, key: 'glaze', style: 'bowl' })
  );
}

// ───────────────────────── 厨房 ─────────────────────────

/** 鹅颈水龙头（原点 = 台面上的底座中心，出水口朝 +z） */
function tap(x, y, z) {
  return [
    C(0.024, 0.026, 0.035, 'metal', x, y, z, 20),
    M(tubeGeo([[0, 0.03, 0], [0, 0.24, 0], [0, 0.31, 0.04], [0, 0.29, 0.13], [0, 0.22, 0.17]], 0.011, { seg: 28, radial: 10 }), 'metal', x, y, z),
    C(0.006, 0.006, 0.055, 'metal', x + 0.026, y + 0.07, z, 8, { rz: -1.2 }),
  ];
}

/** 一个燃气灶头：铜圈、黑盖、铸铁炉架 */
function burner(x, y, z, R) {
  const out = [C(R, R, 0.012, 'steel', x, y, z, Q(28, 18)), C(R * 0.68, R * 0.72, 0.01, 'black', x, y + 0.012, z, Q(24, 16)), M(torusGeo(R + 0.045, 0.005, Q(36, 24), 6), 'black', x, y + 0.03, z, { rx: Math.PI / 2 })];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const rr = R + 0.02;
    out.push(B(0.009, 0.014, 0.06, 'black', x + Math.sin(a) * rr, y + 0.018, z + Math.cos(a) * rr, 0, { ry: a }));
  }
  return out;
}

/**
 * 一排橱柜：w 长；gaps = [{a,b}] 吊柜（和挡水板）要避开的范围（窗）；
 * sinkAt / hobAt（没有就用 sink / hob）：沿本地 x 的 0–1 位置（0 = 本地 −x 那头，也就是站在柜前看的左端），null = 没有。
 * 抽油烟机和吊柜的缺口跟着灶走。
 */
function kitchenRun({ w = 3, h = 2.8, upper = true, sink = 0.3, hob = 0.72, sinkAt, hobAt, gaps = [] }) {
  const sinkF = sinkAt !== undefined ? sinkAt : sink;
  const hobF = hobAt !== undefined ? hobAt : hob;
  const parts = [];
  const D = 0.6;
  const zF = D / 2 - 0.02; // 柜体正面
  const topY = 0.9;
  const ctT = 0.03;
  const ctY = topY - ctT;
  const fy0 = 0.105;
  const fy1 = ctY - 0.035; // 门板顶到台面下留 3.5cm 的阴影槽（免拉手）
  const sx = sinkF != null ? -w / 2 + w * sinkF : null;
  const hx = hobF != null ? -w / 2 + w * hobF : null;
  const sinkW = 0.54;
  const sinkD = 0.4;
  const sinkZ = 0.02;
  // 模块：水槽柜 0.8、灶下三抽 0.8，其余 ≤ 0.6 的门
  const mods = [];
  if (sx != null) mods.push({ a: sx - 0.4, b: sx + 0.4, type: 'sink' });
  if (hx != null) mods.push({ a: hx - 0.4, b: hx + 0.4, type: 'hob' });
  mods.forEach((m) => {
    m.a = Math.max(-w / 2, m.a);
    m.b = Math.min(w / 2, m.b);
  });
  mods.sort((p, q) => p.a - q.a);
  for (let i = 1; i < mods.length; i++)
    if (mods[i].a < mods[i - 1].b) {
      const mid = (mods[i].a + mods[i - 1].b) / 2;
      mods[i - 1].b = mid;
      mods[i].a = mid;
    }
  const segs = [];
  let at = -w / 2;
  for (const m of mods) {
    if (m.a - at > 0.12) segs.push({ a: at, b: m.a, type: 'doors' });
    else m.a = at;
    segs.push(m);
    at = m.b;
  }
  if (w / 2 - at > 0.12) segs.push({ a: at, b: w / 2, type: 'doors' });
  else if (segs.length) segs[segs.length - 1].b = w / 2;
  else segs.push({ a: -w / 2, b: w / 2, type: 'doors' });
  // 踢脚（内退）+ 柜体（水槽那段柜体矮一截，让出水槽）
  parts.push(B(w - 0.004, 0.1, D - 0.12, 'black', 0, 0, -0.06));
  const cut = sx != null ? [sx - sinkW / 2 - 0.01, sx + sinkW / 2 + 0.01] : null;
  const carc = (a, b, top) => b - a > 0.005 && parts.push(B(b - a, top - 0.1, D - 0.02, 'cabinetry', (a + b) / 2, 0.1, -0.01, 0.002));
  if (cut) {
    carc(-w / 2, cut[0], ctY);
    carc(cut[0], cut[1], ctY - 0.21);
    carc(cut[1], w / 2, ctY);
  } else carc(-w / 2, w / 2, ctY);
  parts.push(B(w, fy1 - fy0 + 0.035, 0.002, 'black', 0, fy0, zF + 0.001, 0, { shadow: false }));
  for (const s of segs) {
    if (s.type === 'hob') parts.push(...drawerStack(s.a + 0.002, s.b - 0.002, fy0, fy1, zF + 0.002, 'cabinetry', [0.42, 0.36, 0.22], { channel: 0.025 }));
    else parts.push(...doorRow(s.a + 0.002, s.b - 0.002, fy0, fy1, zF + 0.002, 'cabinetry', { maxW: s.type === 'sink' ? 0.42 : 0.6, backer: false }));
  }
  // 台面：3cm 石材、前沿圆角；水槽处开孔（台下盆）——用几段直条围出开孔（不用带孔的形状，三角化不会跨过孔）
  const zb = 0.01 - (D + 0.02) / 2;
  const zf = 0.01 + (D + 0.02) / 2;
  const bar = (x0, x1, z0, z1, e = 0.004) => x1 - x0 > 0.002 && z1 - z0 > 0.002 && parts.push(M(edgeBarGeo(x1 - x0, z0, z1, ctT, e), 'countertop', x0, ctY, 0));
  if (sx != null) {
    const hx0 = Math.max(-w / 2, sx - sinkW / 2);
    const hx1 = Math.min(w / 2, sx + sinkW / 2);
    bar(-w / 2, hx0, zb, zf);
    bar(hx1, w / 2, zb, zf);
    bar(hx0, hx1, zb, sinkZ - sinkD / 2, 0);
    bar(hx0, hx1, sinkZ + sinkD / 2, zf);
  } else bar(-w / 2, w / 2, zb, zf);
  // 挡水板：避开窗；灶后面高到抽油烟机
  const free = [];
  let a0 = -w / 2;
  const blocks = gaps.map((g) => ({ a: g.a - w / 2, b: g.b - w / 2 })).sort((p, q) => p.a - q.a);
  for (const b of blocks) {
    if (b.a > a0 + 0.02) free.push([a0, Math.min(b.a, w / 2)]);
    a0 = Math.max(a0, b.b);
  }
  if (w / 2 > a0 + 0.02) free.push([a0, w / 2]);
  for (const [a, b] of free) parts.push(B(b - a, 0.6, 0.012, 'countertop', (a + b) / 2, topY, -D / 2 + 0.006));
  // 水槽：不锈钢台下盆 + 鹅颈龙头
  if (sx != null) {
    const yb = ctY - 0.2;
    parts.push(B(sinkW, 0.004, sinkD, 'steel', sx, yb, sinkZ));
    parts.push(B(sinkW, 0.2, 0.004, 'steel', sx, yb, sinkZ - sinkD / 2 + 0.002), B(sinkW, 0.2, 0.004, 'steel', sx, yb, sinkZ + sinkD / 2 - 0.002));
    parts.push(B(0.004, 0.2, sinkD, 'steel', sx - sinkW / 2 + 0.002, yb, sinkZ), B(0.004, 0.2, sinkD, 'steel', sx + sinkW / 2 - 0.002, yb, sinkZ));
    parts.push(C(0.04, 0.04, 0.003, 'chrome', sx, yb + 0.004, sinkZ - 0.07, 24), C(0.024, 0.024, 0.004, 'black', sx, yb + 0.004, sinkZ - 0.07, 16));
    parts.push(...tap(sx, topY, sinkZ - sinkD / 2 - 0.05));
  }
  // 灶：黑玻璃台面燃气灶（一大一小两个头）+ 旋钮
  if (hx != null) {
    parts.push(SL(0.74, 0.48, 0.008, 'hobGlass', hx, topY, 0.0, { r: 0.012, bevel: 0.002 }));
    parts.push(...burner(hx - 0.18, topY + 0.008, -0.02, 0.06), ...burner(hx + 0.18, topY + 0.008, -0.02, 0.045));
    for (const dx of [-0.05, 0.05]) parts.push(C(0.019, 0.021, 0.022, 'steel', hx + dx, topY + 0.008, 0.18, 18));
  }
  // 吊柜：避开窗和灶；门比柜底长 2cm 当拉手；底下灯带；上面封板到顶
  if (upper) {
    const segsU = [];
    let u = -w / 2;
    const ub = [...blocks, ...(hx != null ? [{ a: hx - 0.46, b: hx + 0.46 }] : [])].sort((p, q) => p.a - q.a);
    for (const b of ub) {
      if (b.a > u + 0.3) segsU.push([u, b.a]);
      u = Math.max(u, b.b);
    }
    if (w / 2 > u + 0.3) segsU.push([u, w / 2]);
    const zU = -D / 2 + 0.33;
    for (const [a, b] of segsU) {
      const L = b - a;
      const cx = (a + b) / 2;
      parts.push(B(L, 0.72, 0.33, 'cabinetry', cx, 1.52, -D / 2 + 0.165, 0.002));
      parts.push(...doorRow(a + 0.002, b - 0.002, 1.5, 2.24, zU, 'cabinetry', { maxW: 0.5, t: 0.017 }));
      parts.push(led(L - 0.06, cx, 1.507, -D / 2 + 0.28));
      if (h - 2.25 > 0.05) parts.push(B(L, h - 2.25, 0.33, 'cabinetry', cx, 2.25, -D / 2 + 0.165));
    }
    if (hx != null) {
      // 抽油烟机：薄罩 + 烟管到顶；灶后面的挡水板加高
      parts.push(SB(0.88, 0.055, 0.5, 'metal', hx, 1.6, -0.05, { r: 0.008, seg: 0.1 }));
      parts.push(B(0.28, Math.max(0.1, h - 1.655), 0.24, 'metal', hx, 1.655, -D / 2 + 0.13, 0.004));
      parts.push(B(0.9, 0.1, 0.012, 'countertop', hx, 1.5, -D / 2 + 0.006));
    }
  }
  // 台面上的生活感（克制）：砧板靠墙、陶罐插木勺、一对储物罐
  const doorSegs = segs.filter((s) => s.type === 'doors').sort((p, q) => q.b - q.a - (p.b - p.a));
  const spot = doorSegs[0];
  if (spot && spot.b - spot.a > 0.5) {
    const cx = (spot.a + spot.b) / 2;
    parts.push(B(0.3, 0.4, 0.018, 'woodwork', cx - 0.12, topY, -D / 2 + 0.05, 0.006, { rx: -0.1 }));
    parts.push(LA([[0, 0], [0.055, 0], [0.06, 0.01], [0.06, 0.15], [0.056, 0.152], [0.052, 0.14], [0, 0.14]], 'porcelain', cx + 0.12, topY, -D / 2 + 0.12));
    parts.push(C(0.058, 0.058, 0.018, 'woodwork', cx + 0.12, topY + 0.152, -D / 2 + 0.12, 24));
    parts.push(LA([[0, 0], [0.045, 0], [0.05, 0.008], [0.05, 0.11], [0.046, 0.112], [0.042, 0.1], [0, 0.1]], 'porcelain', cx + 0.24, topY, -D / 2 + 0.12));
    parts.push(C(0.048, 0.048, 0.016, 'woodwork', cx + 0.24, topY + 0.112, -D / 2 + 0.12, 24));
  }
  if (hx != null && w > 1.6) {
    const ux = hx + (hx > 0 ? -0.5 : 0.5);
    parts.push(vase(ux, topY, -D / 2 + 0.11, { h: 0.15, r: 0.055, key: 'glaze', style: 'cyl' }));
    for (let k = 0; k < 3; k++) parts.push(C(0.005, 0.004, 0.3, 'woodwork', ux + (k - 1) * 0.015, topY + 0.02, -D / 2 + 0.11 + (k % 2) * 0.01, 6, { rz: (k - 1) * 0.12 }));
  }
  return group(parts);
}

function fridge() {
  const W = 0.86;
  const H = 1.86;
  const D = 0.7;
  const zF = D / 2 - 0.03;
  const parts = [B(W - 0.04, 0.03, D - 0.1, 'black', 0, 0, -0.03), SB(W, H - 0.03, D - 0.03, 'steel', 0, 0.03, -0.015, { r: 0.012, seg: 0.2, rs: 2 })];
  parts.push(B(W - 0.01, H - 0.05, 0.002, 'black', 0, 0.04, zF + 0.001, 0, { shadow: false }));
  // 上面两扇对开门、下面一个抽屉
  const yd = 0.72;
  for (const s of [-1, 1]) {
    parts.push(B(W / 2 - 0.006, H - yd - 0.01, 0.03, 'steel', s * (W / 4), yd, zF + 0.015, 0.006));
    parts.push(B(0.016, 0.5, 0.016, 'chrome', s * 0.025, yd + 0.38, zF + 0.05, 0.006));
    for (const k of [0.06, 0.44]) parts.push(B(0.01, 0.01, 0.022, 'chrome', s * 0.025, yd + 0.38 + k, zF + 0.035));
  }
  parts.push(B(W - 0.012, yd - 0.05, 0.03, 'steel', 0, 0.045, zF + 0.015, 0.006));
  parts.push(B(0.5, 0.016, 0.016, 'chrome', 0, yd - 0.08, zF + 0.05, 0.006));
  return group(parts);
}

function tallUnit({ w = 0.6, h = 2.4 }) {
  const D = 0.6;
  const zF = D / 2 - 0.02;
  const split = Math.min(1.4, h * 0.58);
  return group(
    B(w - 0.004, 0.1, D - 0.12, 'black', 0, 0, -0.06),
    B(w, h - 0.1, D - 0.02, 'cabinetry', 0, 0.1, -0.01, 0.002),
    doorRow(-w / 2 + 0.002, w / 2 - 0.002, 0.105, split, zF, 'cabinetry', { maxW: 0.6, handle: 'bar', hy: split - 0.56 }),
    doorRow(-w / 2 + 0.002, w / 2 - 0.002, split, h - 0.004, zF, 'cabinetry', { maxW: 0.6, handle: 'bar', hy: split + 0.06 })
  );
}

/** 岛台：瀑布石材台面（两侧落地）、座位侧悬挑；三张吧凳 */
function island({ w = 1.8, d = 0.9 }) {
  const parts = [];
  const bodyD = d - 0.3;
  const bz = -d / 2 + bodyD / 2;
  parts.push(B(w - 0.12, 0.1, bodyD - 0.08, 'black', 0, 0, bz));
  parts.push(B(w - 0.08, 0.76, bodyD, 'cabinetry', 0, 0.1, bz, 0.002));
  const fr = group(doorRow(-w / 2 + 0.05, w / 2 - 0.05, 0.105, 0.82, 0.002, 'cabinetry', { maxW: 0.6, handle: 'groove' }));
  fr.rotation.y = Math.PI;
  fr.position.z = bz - bodyD / 2;
  parts.push(fr);
  parts.push(SL(w, d, 0.04, 'countertop', 0, 0.86, 0, { r: 0.004, bevel: 0.003 }));
  for (const s of [-1, 1]) parts.push(B(0.04, 0.86, d, 'countertop', s * (w / 2 - 0.02), 0, 0, 0.002));
  // 吧凳：四条锥形腿、脚踏圈、圆软座
  for (const k of [-1, 0, 1]) {
    const x = k * Math.min(0.55, (w - 0.5) / 2);
    const z = d / 2 + 0.05;
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      parts.push(C(0.013, 0.011, 0.64, 'woodwork', x + Math.sin(a) * 0.13, 0, z + Math.cos(a) * 0.13, 8, { rx: -Math.cos(a) * 0.08, rz: Math.sin(a) * 0.08 }));
    }
    parts.push(M(torusGeo(0.15, 0.008, 28, 6), 'metal', x, 0.25, z, { rx: Math.PI / 2 }));
    parts.push(LA([[0, 0], [0.16, 0], [0.18, 0.012], [0.185, 0.035], [0.17, 0.055], [0, 0.06]], 'upholstery', x, 0.62, z, {}, Q(32, 20)));
  }
  parts.push(vase(-w / 4, 0.9, 0, { h: 0.1, r: 0.15, key: 'porcelain', style: 'bowl' }));
  for (const [dx, dz] of [
    [-0.05, 0.02],
    [0.04, -0.02],
    [0, 0.06],
    [0.06, 0.05],
  ])
    parts.push(M(sphereGeo(0.036, 14), 'citrus', -w / 4 + dx, 0.94, dz, { s: [1, 0.9, 1] }));
  return group(parts);
}

// ───────────────────────── 卧室 ─────────────────────────

/** 床：内退底座 + 木框、床垫、会从两边和床尾垂下来的厚被子（床头一道翻折）、枕头、抱枕、床尾毯、软包竖条床头 */
function bed({ w = 1.6, d = 2.05, kids = false }) {
  const parts = [];
  const double = w > 1.3;
  const zm0 = -d / 2 + 0.045;
  const zm1 = d / 2;
  const dm = zm1 - zm0;
  const mTop = 0.5;
  parts.push(B(w - 0.24, 0.08, d - 0.3, 'black', 0, 0, 0.05));
  parts.push(SB(w + 0.04, 0.2, d - 0.03, 'woodwork', 0, 0.08, 0.025, { r: 0.012, seg: 0.12 }));
  parts.push(SB(w, mTop - 0.28, dm, 'mattress', 0, 0.28, (zm0 + zm1) / 2, { r: 0.045, cy: 0.005, cx: 0.004, cz: 0.004, seg: 0.12 }));
  // 被子
  const Rm = 0.05;
  const T = 0.07;
  const fx = w / 2 - Rm;
  const fz = zm1 - Rm;
  const hang = mTop - Rm - 0.31;
  const over = (Math.PI / 2) * (Rm + T / 2) + hang;
  const z0 = zm0 + (kids ? 0.42 : 0.5);
  const z1 = fz + over;
  const seg = Q(0.045, 0.07);
  const dv = derived(`duvet${f(w)}|${f(d)}|${f(z0)}|${seg}`, softBoxGeo(2 * (fx + over), T, z1 - z0, { r: T * 0.46, cy: 0.012, seg, rs: Q(3, 2) }), (g) => {
    g.translate(0, mTop, (z0 + z1) / 2);
    drapeGeo(g, { fx, fz, top: mTop, R: Rm, T, wave: 0.012, waveLen: 0.34, flare: 0.02 });
  });
  parts.push(M(dv, 'bedding'));
  // 床头那道翻折（压在被子上，两边也垂下）
  const T2 = 0.032;
  const over2 = (Math.PI / 2) * (Rm + T + T2 / 2) + hang - 0.03;
  const fold = derived(`fold${f(w)}|${f(d)}|${f(z0)}|${seg}`, softBoxGeo(2 * (fx + over2), T2, 0.3, { r: T2 * 0.46, cy: 0.004, seg, rs: 2 }), (g) => {
    g.translate(0, mTop + T, z0 + 0.15);
    drapeGeo(g, { fx, fz: 99, top: mTop + T, R: Rm + T, T: T2, wave: 0.008, waveLen: 0.34, flare: 0.015 });
  });
  parts.push(M(fold, 'bedding'));
  // 床尾搭毯
  const T3 = 0.024;
  const over3 = (Math.PI / 2) * (Rm + T + T3 / 2) + hang - 0.06;
  const throwG = derived(`throw${f(w)}|${f(d)}|${seg}`, softBoxGeo(2 * (fx + over3), T3, 0.46, { r: T3 * 0.46, cy: 0.003, seg, rs: 2 }), (g) => {
    g.translate(0, mTop + T + 0.006, fz - 0.36);
    drapeGeo(g, { fx, fz: 99, top: mTop + T + 0.006, R: Rm + T, T: T3, wave: 0.01, waveLen: 0.3, flare: 0.02 });
  });
  parts.push(M(throwG, 'accents'));
  // 枕头（斜靠床头）、抱枕
  const pw = double ? Math.min(0.66, (w - 0.12) / 2) : Math.min(0.62, w - 0.2);
  const xs = double ? [-(pw / 2 + 0.02), pw / 2 + 0.02] : [0];
  for (const x of xs) parts.push(PW(pw, 0.46, 0.17, 'bedding', x, mTop + 0.02, zm0 + 0.46, { rx: -(Math.PI / 2 - 0.42) }));
  if (double) {
    parts.push(PW(0.5, 0.5, 0.16, 'accents', -0.26, mTop + 0.07, zm0 + 0.5, { rx: -0.62, ry: 0.12, rz: 0.04 }));
    parts.push(PW(0.48, 0.48, 0.15, 'accents', 0.26, mTop + 0.07, zm0 + 0.5, { rx: -0.6, ry: -0.14, rz: -0.05 }));
    parts.push(PW(0.5, 0.28, 0.13, 'upholstery', 0.02, mTop + 0.09, zm0 + 0.66, { rx: -0.42, rz: 0.03 }));
  } else parts.push(PW(0.42, 0.42, 0.14, 'accents', 0.04, mTop + 0.06, zm0 + 0.5, { rx: -0.6, rz: 0.06 }));
  // 软包床头：竖条
  const hb = w + 0.16;
  const n = Math.max(3, Math.round(hb / (kids ? 0.3 : 0.24)));
  const cw = hb / n;
  const hbH = kids ? 0.82 : 1.0;
  for (let i = 0; i < n; i++) parts.push(SB(cw - 0.004, hbH, 0.08, 'upholstery', -hb / 2 + cw * (i + 0.5), 0.16, -d / 2, { r: 0.034, cz: 0.012, czb: 0, cx: 0.003, cy: 0.004, seg: 0.1 }));
  return parts;
}

const f = (v) => v.toFixed(3);

function bedItem({ w = 1.6, d = 2.05 }) {
  return group(bed({ w, d }));
}

function nightstand() {
  const parts = [];
  const W = 0.5;
  const D = 0.42;
  const y0 = 0.16;
  const H = 0.36;
  const dh = 0.19;
  parts.push(...roundLegs(corners(W / 2 - 0.04, D / 2 - 0.04), y0, 'woodwork', 0.016, 0.011));
  // 上面一个抽屉（顶边指槽），下面开放格放两本书
  parts.push(B(W, dh, D, 'woodwork', 0, y0 + H - dh, 0, 0.008));
  parts.push(...panel(W - 0.012, dh - 0.012, 0, y0 + H - dh + 0.006, D / 2 - 0.004, 'woodwork', { t: 0.016, handle: 'groove' }));
  parts.push(B(W, 0.02, D, 'woodwork', 0, y0, 0, 0.004));
  for (const s of [-1, 1]) parts.push(B(0.02, H - dh, D, 'woodwork', s * (W / 2 - 0.01), y0, 0));
  parts.push(B(W - 0.04, H - dh, 0.012, 'woodwork', 0, y0, -D / 2 + 0.006));
  parts.push(bookStack(0.0, y0 + 0.02, 0.0, 2, rng(9), { w: 0.24, d: 0.17, ry: 0.06 }));
  const top = y0 + H;
  parts.push(...tableLamp(0.08, top, -0.06, { h: 0.46, shadeR: 0.13, key: 'porcelain' }));
  parts.push(bookStack(-0.11, top, 0.06, 2, rng(3), { w: 0.18, d: 0.13, ry: 0.25 }));
  return group(parts);
}

/** 衣柜：踢脚内退、3mm 门缝 + 黑色阴影衬底；handle 'bar' = 长竖拉手，'none' = 两门之间一道 2cm 的竖向手扣槽 */
function wardrobe({ w = 2.4, h = 2.6, handle = 'none' }) {
  const D = 0.6;
  const zF = D / 2 - 0.02;
  const parts = [B(w - 0.004, 0.08, D - 0.12, 'black', 0, 0, -0.06), B(w, h - 0.08, D - 0.02, 'cabinetry', 0, 0.08, -0.01, 0.002)];
  parts.push(B(w, h - 0.085, 0.002, 'black', 0, 0.083, zF + 0.001, 0, { shadow: false }));
  const n = Math.max(2, Math.round(w / 0.5));
  const dw = w / n;
  const y0 = 0.085;
  const H = h - 0.09;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + dw * (i + 0.5);
    const pairRight = i % 2 === 0 && i < n - 1; // 和右边那扇是一对：拉手 / 手扣在两扇之间
    const pairLeft = i % 2 === 1;
    const side = pairRight ? 1 : pairLeft ? -1 : -1;
    const meet = handle === 'none' ? 0.01 : 0.0015;
    const l = pairLeft ? meet : 0.0015;
    const r = pairRight ? meet : 0.0015;
    const pw = dw - l - r;
    const cx = x + (l - r) / 2;
    parts.push(B(pw, H, 0.019, 'cabinetry', cx, y0, zF + 0.002 + 0.0095, 0.003));
    if (handle !== 'none') {
      const hx = cx + side * (pw / 2 - 0.04);
      parts.push(B(0.012, 0.6, 0.012, 'metal', hx, 0.82, zF + 0.048, 0.005));
      for (const k of [0.06, 0.54]) parts.push(B(0.008, 0.008, 0.026, 'metal', hx, 0.82 + k, zF + 0.034));
    }
  }
  return group(parts);
}

/** 梳妆台 / 斗柜：三排抽屉 + 黄铜横拉手、细脚；墙上一面拱形镜 */
function dresser({ w = 1.2 }) {
  const D = 0.45;
  const y0 = 0.14;
  const H = 0.68;
  const zF = D / 2 - 0.018;
  const parts = [B(w, H, D - 0.018, 'cabinetry', 0, y0, -0.009, 0.003)];
  parts.push(...squareLegs(corners(w / 2 - 0.05, D / 2 - 0.05), y0, 'woodwork', 0.036, 0.026));
  const cols = w > 0.95 ? 2 : 1;
  const cwid = (w - 0.012) / cols;
  for (let c = 0; c < cols; c++) {
    const x0 = -w / 2 + 0.006 + cwid * c;
    parts.push(...drawerStack(x0, x0 + cwid, y0 + 0.006, y0 + H - 0.006, zF, 'cabinetry', [0.36, 0.34, 0.3], { handle: 'barH' }));
  }
  parts.push(M(archGeo(0.62, 0.92, 0.02), 'metal', 0, y0 + H + 0.2, -D / 2 + 0.012));
  parts.push(M(archGeo(0.6, 0.9, 0.01), 'mirror', 0, y0 + H + 0.21, -D / 2 + 0.02));
  const top = y0 + H;
  parts.push(vase(w / 2 - 0.18, top, -0.06, { h: 0.24, r: 0.07, key: 'sage', style: 'bottle' }));
  parts.push(tray(-w / 2 + 0.22, top, 0.02, 0.12, 'metal'));
  parts.push(vase(-w / 2 + 0.2, top + 0.008, 0.02, { h: 0.1, r: 0.03, key: 'glaze', style: 'cyl' }), vase(-w / 2 + 0.26, top + 0.008, 0.04, { h: 0.07, r: 0.028, key: 'porcelain', style: 'bud' }));
  return group(parts);
}

/** 书桌：圆角木桌面、锥形腿、细的显示器 + 键盘、台灯；配一张办公椅 */
function desk({ w = 1.4, d = 0.65 }) {
  const top = 0.74;
  const parts = [
    SL(w, d, 0.028, 'woodwork', 0, top - 0.028, 0, { r: 0.015, bevel: 0.004 }),
    B(w - 0.14, 0.08, 0.02, 'woodwork', 0, top - 0.108, -d / 2 + 0.05, 0.004),
    ...roundLegs(corners(w / 2 - 0.05, d / 2 - 0.05), top - 0.028, 'woodwork', 0.017, 0.012),
    // 显示器：窄边、铝支架
    B(0.6, 0.35, 0.012, 'tv', 0.05, top + 0.14, -d / 2 + 0.13, 0.008),
    B(0.588, 0.338, 0.002, 'screen', 0.05, top + 0.146, -d / 2 + 0.1365),
    B(0.06, 0.2, 0.012, 'chrome', 0.05, top + 0.004, -d / 2 + 0.115, 0.004, { rx: 0.18 }),
    SL(0.2, 0.15, 0.006, 'chrome', 0.05, top, -d / 2 + 0.11, { r: 0.02, bevel: 0.002 }),
    SL(0.36, 0.12, 0.008, 'chrome', 0.05, top, 0.02, { r: 0.008, bevel: 0.002 }),
    SL(0.06, 0.1, 0.012, 'chrome', 0.32, top, 0.04, { r: 0.028, bevel: 0.004 }),
    // 台灯：圆座、细臂、斜灯罩
    LA([[0, 0], [0.07, 0], [0.072, 0.008], [0.06, 0.016], [0, 0.018]], 'metal', -w / 2 + 0.2, top, -d / 2 + 0.15),
    C(0.006, 0.006, 0.36, 'metal', -w / 2 + 0.2, top + 0.016, -d / 2 + 0.15, 8),
    LA([[0.075, 0], [0.04, 0.09], [0.012, 0.11]], 'metal', -w / 2 + 0.2, top + 0.3, -d / 2 + 0.22, { rx: 0.5 }),
    M(sphereGeo(0.022), 'bulb', -w / 2 + 0.2, top + 0.32, -d / 2 + 0.24, { shadow: false }),
    vase(w / 2 - 0.16, top, -d / 2 + 0.14, { h: 0.12, r: 0.05, key: 'porcelain', style: 'cyl' }),
    officeChair(0.05, 0.42),
  ];
  return group(parts);
}

function officeChair(x = 0, z = 0) {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    parts.push(M(taperBoxGeo(0.04, 0.028, 0.03, 0.02, 0.29), 'black', Math.sin(a) * 0.01, 0.07, Math.cos(a) * 0.01, { rx: Math.PI / 2 + 0.12, ry: a, order: 'YXZ' }));
    parts.push(M(sphereGeo(0.024, 10), 'black', Math.sin(a) * 0.29, 0.024, Math.cos(a) * 0.29));
  }
  parts.push(C(0.03, 0.03, 0.08, 'black', 0, 0.06, 0, 14), C(0.018, 0.018, 0.3, 'chrome', 0, 0.12, 0, 12));
  parts.push(SB(0.5, 0.075, 0.48, 'upholstery', 0, 0.42, 0, { r: 0.03, cy: 0.012, cz: 0.01, seg: 0.08 }));
  const back = derived('ocback', softBoxGeo(0.46, 0.5, 0.06, { r: 0.025, cz: 0.012, seg: 0.06, rs: 2 }), (g) => bendGeo(g, 0.7, 0));
  parts.push(M(back, 'upholstery', 0, 0.56, 0.24, { ry: Math.PI, rx: 0.1 }));
  parts.push(B(0.04, 0.24, 0.025, 'black', 0, 0.38, 0.235, 0.008));
  for (const s of [-1, 1]) parts.push(B(0.03, 0.18, 0.025, 'black', s * 0.23, 0.46, 0.04, 0.006), B(0.05, 0.022, 0.24, 'black', s * 0.23, 0.64, 0.02, 0.008));
  const g = group(parts);
  g.position.set(x, 0, z);
  return g;
}

function kidsBed({ w = 1.0, d = 2.0 }) {
  const parts = bed({ w, d, kids: true });
  // 床边一个木玩具箱 + 一个布球
  parts.push(SB(0.6, 0.34, 0.4, 'cabinetry', w / 2 + 0.45, 0, d / 2 - 0.3, { r: 0.02, seg: 0.12 }));
  parts.push(B(0.18, 0.03, 0.006, 'black', w / 2 + 0.45, 0.26, d / 2 - 0.1, 0, { shadow: false }));
  parts.push(M(sphereGeo(0.09, 20), 'accents', w / 2 + 0.3, 0.43, d / 2 - 0.3));
  return group(parts);
}

/** 玩具柜：开放格 + 柔和颜色的布收纳筐（有提手口） */
function toyStorage({ w = 1.2 }) {
  const D = 0.38;
  const H = 0.62;
  const parts = [B(w, 0.04, D, 'cabinetry', 0, 0, 0, 0.004), B(w, 0.025, D, 'cabinetry', 0, H - 0.025, 0, 0.004), B(w, 0.02, D - 0.02, 'cabinetry', 0, 0.31, 0)];
  const n = Math.max(2, Math.round(w / 0.3));
  const cw = (w - 0.02) / n;
  for (let i = 0; i <= n; i++) parts.push(B(0.02, H - 0.065, D, 'cabinetry', -w / 2 + 0.01 + cw * i, 0.04, 0));
  parts.push(B(w, H, 0.01, 'cabinetry', 0, 0, -D / 2 + 0.005));
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < n; i++) {
      if ((i + row) % 3 === 2) continue; // 留几格空
      const x = -w / 2 + 0.01 + cw * (i + 0.5);
      const y = row ? 0.33 : 0.045;
      parts.push(SB(cw - 0.05, 0.24, D - 0.06, `bin${(i + row * 2) % 4}`, x, y, 0.02, { r: 0.02, cx: 0.006, cz: 0.008, seg: 0.08 }));
      parts.push(B(0.08, 0.025, 0.004, 'black', x, y + 0.18, D / 2 - 0.0055, 0.004, { shadow: false }));
    }
  parts.push(M(sphereGeo(0.08, 20), 'accents', w / 2 - 0.18, H + 0.08, 0.02));
  parts.push(...[0, 1, 2].map((k) => B(0.07 - k * 0.012, 0.05, 0.07 - k * 0.012, `bin${k}`, -w / 2 + 0.22, H + k * 0.05, 0, 0.006)));
  return group(parts);
}

function petBed() {
  return group(
    M(torusGeo(0.29, 0.1, Q(40, 28), Q(16, 10)), 'accents', 0, 0.09, 0, { rx: Math.PI / 2, s: [1, 1, 0.82] }),
    LA([[0, 0], [0.28, 0], [0.3, 0.02], [0.28, 0.05], [0.14, 0.068], [0, 0.07]], 'bedding', 0, 0.01, 0, {}, Q(36, 24)),
    M(sphereGeo(0.05, 14), 'upholstery', 0.08, 0.12, 0.06)
  );
}

// ───────────────────────── 玄关 / 门廊 / 卫浴 / 阳台 ─────────────────────────

/**
 * 鞋柜（玄关、门廊）：下柜悬空（底下灯带，拖鞋可以塞进去）、透气的竖凹槽门；
 * 中间开放台面（深色背板 + 灯带 + 钥匙盘、小花瓶）；上柜到顶，门比柜底长一点当拉手。
 */
function shoeCabinet({ w = 1.5, h = 2.5 }) {
  const D = 0.38;
  const zF = D / 2 - 0.018;
  const lowY = 0.18;
  const lowTop = 1.0;
  const nicheTop = Math.min(1.4, h - 0.5);
  const parts = [];
  parts.push(B(w, lowTop - lowY, D - 0.018, 'cabinetry', 0, lowY, -0.009, 0.002));
  parts.push(...doorRow(-w / 2 + 0.003, w / 2 - 0.003, lowY + 0.003, lowTop - 0.003, zF, 'cabinetry', { maxW: 0.45, fluted: true, t: 0.02 }));
  parts.push(led(w - 0.08, 0, lowY - 0.009, 0.0));
  // 开放台面
  parts.push(SL(w, D, 0.025, 'countertop', 0, lowTop, 0, { bevel: 0.002 }));
  parts.push(B(w - 0.036, nicheTop - lowTop - 0.025, 0.012, 'feature', 0, lowTop + 0.025, -D / 2 + 0.006));
  for (const s of [-1, 1]) parts.push(B(0.018, nicheTop - lowTop, D, 'cabinetry', s * (w / 2 - 0.009), lowTop, 0));
  parts.push(led(w - 0.08, 0, nicheTop - 0.012, 0.06));
  // 上柜
  parts.push(B(w, h - nicheTop, D - 0.018, 'cabinetry', 0, nicheTop, -0.009, 0.002));
  parts.push(...doorRow(-w / 2 + 0.003, w / 2 - 0.003, nicheTop - 0.018, h - 0.004, zF, 'cabinetry', { maxW: 0.45 }));
  // 台面上：钥匙盘、小花瓶插一枝
  const ny = lowTop + 0.025;
  parts.push(tray(-w / 2 + 0.25, ny, 0.02, 0.1, 'metal'));
  parts.push(vase(w / 2 - 0.22, ny, -0.02, { h: 0.18, r: 0.05, key: 'glaze', style: 'bottle' }));
  parts.push(...branches(w / 2 - 0.22, ny + 0.16, -0.02, rng(Math.round(w * 50)), { n: 2, h: 0.18, spread: 0.1 }));
  // 一双拖鞋：一只半塞在柜下
  parts.push(...slippers(-w / 2 + 0.32, 0.12, 0.25));
  return group(parts);
}

/** 换鞋凳：木凳面 + 软垫、锥形方腿、下面一层木条鞋架 */
function bench({ w = 1.0 }) {
  const D = 0.38;
  const parts = [
    SL(w, D, 0.034, 'woodwork', 0, 0.4, 0, { r: 0.01, bevel: 0.004 }),
    SB(w - 0.06, 0.05, D - 0.04, 'upholstery', 0, 0.434, 0, { r: 0.02, cy: 0.01, seg: 0.08 }),
    ...squareLegs(corners(w / 2 - 0.05, D / 2 - 0.05), 0.4, 'woodwork', 0.04, 0.03),
  ];
  for (const s of [-1, 1]) parts.push(B(0.026, 0.03, D - 0.12, 'woodwork', s * (w / 2 - 0.05), 0.1, 0, 0.004));
  for (let k = 0; k < 5; k++) parts.push(B(w - 0.13, 0.016, 0.044, 'woodwork', 0, 0.13, -D / 2 + 0.07 + k * ((D - 0.14) / 4), 0.004));
  return group(parts);
}

/** 浴室柜：悬空柜（指槽门）、石材台面、台上陶瓷盆、入墙出水；胶囊镜 + 背光 */
function vanity({ w = 0.9 }) {
  const D = 0.48;
  const y0 = 0.36;
  const top = 0.85;
  const zF = D / 2 - 0.016;
  return group(
    B(w, top - 0.03 - y0, D - 0.016, 'cabinetry', 0, y0, -0.008, 0.002),
    doorRow(-w / 2 + 0.003, w / 2 - 0.003, y0 + 0.003, top - 0.033, zF, 'cabinetry', { maxW: 0.46, handle: 'groove', t: 0.016 }),
    SL(w + 0.01, D + 0.02, 0.03, 'countertop', 0, top - 0.03, 0.01, { bevel: 0.0025 }),
    LA([[0, 0], [0.12, 0], [0.16, 0.015], [0.19, 0.06], [0.2, 0.11], [0.195, 0.12], [0.185, 0.11], [0.175, 0.065], [0.14, 0.03], [0, 0.022]], 'porcelain', 0, top, 0.04, {}, Q(40, 28)),
    C(0.022, 0.022, 0.004, 'chrome', 0, top + 0.022, 0.04, 16),
    M(tubeGeo([[0, 0, 0], [0, 0, 0.12], [0, -0.012, 0.15]], 0.01, { seg: 10, radial: 10 }), 'metal', 0, 1.06, -D / 2 - 0.01),
    C(0.026, 0.026, 0.008, 'metal', 0, 1.06, -D / 2 + 0.004, 18, { rx: Math.PI / 2 }),
    SL(w - 0.24, 0.82, 0.012, 'mirror', 0, 1.59, -D / 2 + 0.02, { r: (w - 0.24) / 2 - 0.001, bevel: 0.002, seg: 16 }, { rx: Math.PI / 2 }),
    SL(w - 0.2, 0.86, 0.006, 'led', 0, 1.59, -D / 2 + 0.011, { r: (w - 0.2) / 2 - 0.001, bevel: 0, seg: 16 }, { rx: Math.PI / 2, shadow: false }),
    vase(w / 2 - 0.12, top, -0.12, { h: 0.15, r: 0.035, key: 'glaze', style: 'cyl' }),
    tray(-w / 2 + 0.14, top, -0.1, 0.08, 'woodwork')
  );
}

/** 一体式马桶：郁金香形盆身（椭圆）、盖、圆角水箱 + 按钮 */
function toilet() {
  const body = LA([[0, 0], [0.12, 0], [0.128, 0.01], [0.13, 0.12], [0.16, 0.28], [0.185, 0.37], [0.19, 0.385], [0.18, 0.39], [0, 0.39]], 'porcelain', 0, 0, 0.08, { s: [1, 1, 1.32] }, Q(40, 28));
  return group(
    body,
    LA([[0, 0], [0.185, 0], [0.19, 0.008], [0.186, 0.022], [0.17, 0.03], [0, 0.032]], 'porcelain', 0, 0.39, 0.075, { s: [1, 1, 1.32] }, Q(40, 28)),
    SB(0.28, 0.4, 0.22, 'porcelain', 0, 0, -0.15, { r: 0.06, seg: 0.1 }),
    SB(0.37, 0.4, 0.17, 'porcelain', 0, 0.38, -0.25, { r: 0.045, cy: 0.006, seg: 0.1 }),
    C(0.022, 0.022, 0.006, 'chrome', 0, 0.786, -0.25, 18)
  );
}

function shower({ w = 0.9, d = 0.9, h = 2.0 }) {
  const gl = [placedBox(w - 0.02, h - 0.03, 0.008, -0.01, 0.06, d / 2), placedBox(0.008, h - 0.03, d - 0.02, w / 2, 0.06, -0.01)];
  const glass = new THREE.Mesh(merge(gl), LIB.fixed.glass);
  glass.renderOrder = 2;
  return group(
    SL(w, d, 0.045, 'tile', 0, 0, 0, { r: 0.01, bevel: 0.003 }),
    B(w - 0.2, 0.004, 0.04, 'steel', 0, 0.045, -d / 2 + 0.06),
    glass,
    B(w, 0.018, 0.022, 'frame', 0, h + 0.03, d / 2),
    B(0.022, 0.018, d, 'frame', w / 2, h + 0.03, 0),
    B(0.02, h - 0.02, 0.02, 'frame', w / 2, 0.05, d / 2),
    B(0.016, 0.3, 0.016, 'chrome', -w / 2 + 0.2, 0.95, d / 2 + 0.03, 0.006),
    // 顶喷：细臂 + 薄圆盘
    C(0.008, 0.008, 0.3, 'chrome', -w / 4, 2.03, -d / 2 + 0.005, 8, { rx: Math.PI / 2 }),
    LA([[0, 0], [0.12, 0], [0.125, 0.005], [0.12, 0.01], [0, 0.012]], 'chrome', -w / 4, 1.99, -d / 2 + 0.3, {}, Q(36, 24)),
    C(0.035, 0.035, 0.008, 'chrome', 0.05, 1.1, -d / 2 + 0.004, 18, { rx: Math.PI / 2 }),
    C(0.006, 0.006, 0.07, 'chrome', 0.05, 1.11, -d / 2 + 0.01, 8, { rx: Math.PI / 2 })
  );
}

function washer() {
  return group(
    SB(0.6, 0.85, 0.6, 'porcelain', 0, 0, 0, { r: 0.02, seg: 0.2, rs: 2 }),
    B(0.56, 0.11, 0.004, 'black', 0, 0.71, 0.3, 0.002, { shadow: false }),
    B(0.12, 0.04, 0.003, 'screen', 0.06, 0.745, 0.302),
    C(0.026, 0.026, 0.02, 'steel', 0.2, 0.765, 0.3, 18, { rx: Math.PI / 2 }),
    B(0.18, 0.006, 0.002, 'black', -0.17, 0.73, 0.302, 0, { shadow: false }),
    M(torusGeo(0.19, 0.022, Q(40, 28), 10), 'chrome', 0, 0.4, 0.3),
    LA([[0.175, 0], [0.17, 0.006], [0.1, 0.022], [0, 0.03]], 'tv', 0, 0.4, 0.302, { rx: Math.PI / 2 }, Q(32, 20))
  );
}

function lounger() {
  return group(frameChair({ W: 0.66, D: 0.74, seatY: 0.22, armY: 0.46, backH: 0.52, rake: 0.42 }));
}

/** 窗帘：一对拉开的布帘（自然褶、下摆折边、落地微翻）+ 细杆和端头 */
function curtainPair({ w = 2, h = 2.7 }) {
  const pw = Math.max(0.35, Math.min(0.6, w * 0.22));
  const folds = Math.max(4, Math.round(pw / 0.1));
  const cm = LIB.slot('curtains');
  cm.side = THREE.DoubleSide;
  const g1 = M(curtainGeo(pw, h - 0.07, folds, 0.07, 1), 'curtains', -w / 2 - pw / 2 + 0.18, 0.005, 0);
  const g2 = M(curtainGeo(pw, h - 0.07, folds, 0.07, 2), 'curtains', w / 2 + pw / 2 - 0.18, 0.005, 0);
  const L = w + 0.6;
  return group(g1, g2, C(0.011, 0.011, L, 'metal', -L / 2, h - 0.05, 0, 12, { rz: -Math.PI / 2 }), M(sphereGeo(0.02, 12), 'metal', -L / 2 - 0.01, h - 0.05, 0), M(sphereGeo(0.02, 12), 'metal', L / 2 + 0.01, h - 0.05, 0));
}

// ───────────────────────── 楼梯、护栏（建筑件：不进目录，引擎按平面图建） ─────────────────────────
// 材质按「表面」走：踏步板 = 地板，踢面 / 斜梯板 / 平台 = 墙面，扶手 = 木作，立杆 = 金属 —— 换材质时一起换。
// 一部楼梯 4 个网格（结构、踏步、扶手、立杆），立杆合并成一个网格（不用实例：少一个着色器变体，draw call 一样是 1）。

const STAIR_DIR = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const UP = new THREE.Vector3(0, 1, 0);
/** {x0,y0,x1,y1} 或 {x,y,w,d} → {x0,y0,x1,y1} */
const rectXY = (r) => (r.x0 != null ? r : { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.d });

/** 合并成一个网格（按世界坐标投 UV：木纹 / 石纹不会被拉长） */
function mergedMesh(geos, material, slot) {
  if (!geos.length) return null;
  const g = mergeGeometries(geos.map((x) => prep(x, false)), false);
  geos.forEach((x) => x.dispose());
  if (!g) return null;
  worldUVs(g);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  if (slot) m.userData.slot = slot;
  return m;
}

/** 世界坐标的盒状投影 UV（和 geom.worldUV 一样，合并之后再算一次） */
function worldUVs(geo) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, pos.getX(i), pos.getZ(i));
    else if (ax >= az) uv.setXY(i, pos.getZ(i), pos.getY(i));
    else uv.setXY(i, pos.getX(i), pos.getY(i));
  }
  uv.needsUpdate = true;
}

/** 一根沿任意方向的方料（截面 w × h，不会「翻滚」：截面的上边永远朝上） */
function barGeo(p, q, w, h) {
  const d = new THREE.Vector3().subVectors(q, p);
  const L = d.length();
  if (L < 1e-4) return null;
  const X = d.clone().normalize();
  let Z = new THREE.Vector3().crossVectors(X, UP);
  if (Z.lengthSq() < 1e-8) Z = new THREE.Vector3(0, 0, 1);
  Z.normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X).normalize();
  const g = new THREE.BoxGeometry(L, h, w);
  const mid = p.clone().add(q).multiplyScalar(0.5);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(mid));
  return g;
}

/**
 * 护栏：扶手（木作）+ 细方立杆（金属，净空 ≤ 100mm）+ 底下一道细扁钢；posts = 两端立一根粗一点的柱（挑空的护栏）。
 * lines：[{ x1, y1, z1, x2, y2, z2 }] 平面米；z = 这一端「脚下」的高度（楼梯 = 踏步前缘连线，挑空 = 0）。
 * h：扶手顶离脚下多高（楼梯 0.9m，挑空 1.0m）。
 */
export function balustrade(lines, lib, { h = 0.9, posts = false, shoe = true, base = null } = {}) {
  const wood = [];
  const metal = [];
  const RAIL_W = 0.05;
  const RAIL_H = 0.045;
  const BAL = 0.018;
  const PITCH = 0.112; // 立杆中心距：净空 ≈ 94mm
  const seen = new Set();
  for (const ln of lines) {
    const a = new THREE.Vector3(ln.x1, ln.z1 || 0, ln.y1);
    const b = new THREE.Vector3(ln.x2, ln.z2 || 0, ln.y2);
    const flat = Math.hypot(b.x - a.x, b.z - a.z);
    if (flat < 0.05) continue;
    // 扶手：顶面在 h
    const top = new THREE.Vector3(0, h - RAIL_H / 2, 0);
    const rail = barGeo(a.clone().add(top), b.clone().add(top), RAIL_W, RAIL_H);
    if (rail) wood.push(rail);
    // 底下的细扁钢（离脚下 6cm；楼梯没有，立杆直接站在踏步上）
    if (shoe) {
      const low = new THREE.Vector3(0, 0.06, 0);
      const bar = barGeo(a.clone().add(low), b.clone().add(low), 0.02, 0.02);
      if (bar) metal.push(bar);
    }
    // 立杆：两端各让 3cm（端柱 / 墙），中间均分；base(x, y) = 这一点脚下真正的高度（楼梯：那一级踏步的面）
    const n = Math.max(1, Math.ceil((flat - 0.06) / PITCH));
    for (let i = 0; i <= n; i++) {
      const k = 0.03 / flat + ((flat - 0.06) / flat) * (i / n);
      const p = a.clone().lerp(b, k);
      const y0 = base ? base(p.x, p.z) : p.y;
      const len = p.y + h - RAIL_H - y0;
      if (len < 0.05) continue;
      const g = new THREE.BoxGeometry(BAL, len, BAL);
      g.translate(p.x, y0 + len / 2, p.z);
      metal.push(g);
    }
    if (posts)
      for (const p of [a, b]) {
        const key = `${p.x.toFixed(2)}|${p.y.toFixed(2)}|${p.z.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const g = new THREE.BoxGeometry(0.06, h + 0.02, 0.06);
        g.translate(p.x, p.y + (h + 0.02) / 2, p.z);
        wood.push(g);
      }
  }
  const out = new THREE.Group();
  const w = mergedMesh(wood, lib.slot('woodwork'), 'woodwork');
  const m = mergedMesh(metal, lib.slot('metal'), 'metal');
  if (w) out.add(w);
  if (m) out.add(m);
  return out;
}

/**
 * 楼梯（直跑 / L 形 / U 形，来自 model.stairFlights）：
 *  · 结构（墙面）：每一跑是一块「锯齿」实体 —— 踢面一级级上去，底下是一道斜梯板（厚 13cm），侧面就是楼梯的剖面；平台板 15cm；
 *  · 踏步板（地板）：4cm 厚，往前出 2cm 的前缘；平台上也铺一层；
 *  · 开放的一侧（model.flightRails）：0.9m 扶手 + 细立杆。
 * 平面 x → 世界 x、平面 y → 世界 z、z（相对下层地面）→ 世界 y；整组放进下层的楼层组里。
 * 最上面一级踢面往里收 5mm，不和上层楼板的切面打架。
 */
export function stairsMesh(flights, landings, rails, lib) {
  const FIN = 0.04;
  const NOSE = 0.02;
  const WAIST = 0.13;
  const struct = [];
  const treads = [];
  const frames = [];
  for (const fl of flights || []) {
    const dv = STAIR_DIR[fl.dir];
    if (!dv) continue;
    const r0 = rectXY(fl.rect);
    const along = new THREE.Vector3(dv[0], 0, dv[1]);
    const across = new THREE.Vector3(-dv[1], 0, dv[0]);
    const L = dv[0] ? r0.x1 - r0.x0 : r0.y1 - r0.y0;
    const W = dv[0] ? r0.y1 - r0.y0 : r0.x1 - r0.x0;
    const n = Math.max(1, fl.risers | 0);
    if (L <= 0.05 || W <= 0.05) continue;
    const rise = (fl.z1 - fl.z0) / n;
    const t = n > 1 ? L / (n - 1) : L;
    const cx = (r0.x0 + r0.x1) / 2;
    const cz = (r0.y0 + r0.y1) / 2;
    // 原点：起步那条边、跨度方向最小的那个角
    const O = new THREE.Vector3(cx - (along.x * L) / 2 - (across.x * W) / 2, 0, cz - (along.z * L) / 2 - (across.z * W) / 2);
    const basis = new THREE.Matrix4().makeBasis(along, UP, across).setPosition(O);
    frames.push({ fl, O, along, cx, cz, n, rise, t, L });
    const aEnd = Math.max(0.01, L - 0.005);
    const top = (k) => fl.z0 + k * rise - FIN;
    const Wv = WAIST * Math.sqrt(1 + (rise / Math.max(0.05, t)) ** 2);
    const soffit = (a) => fl.z0 - FIN - Wv + (a * rise) / Math.max(0.05, t);
    const onFloor = fl.z0 < 0.02;
    const pts = [[0, onFloor ? fl.z0 : soffit(0)]];
    for (let k = 1; k <= n; k++) {
      const a = Math.min((k - 1) * t, aEnd);
      pts.push([a, top(k)]);
      if (k < n) pts.push([Math.min(k * t, aEnd), top(k)]);
    }
    const backZ = Math.min(top(n) - 0.05, soffit(aEnd));
    if (onFloor) {
      // 斜梯板落到地上的那一点；很短的一跑（梯板到不了地）就是一块实心台阶
      if (backZ > fl.z0 + 1e-3) {
        pts.push([aEnd, backZ]);
        const aFloor = ((FIN + Wv) * t) / Math.max(0.05, rise);
        if (aFloor < aEnd - 1e-3) pts.push([aFloor, fl.z0]);
      } else pts.push([aEnd, fl.z0]);
    } else pts.push([aEnd, backZ]);
    const shape = new THREE.Shape(pts.map(([a, z]) => new THREE.Vector2(a, z)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false, steps: 1, curveSegments: 1 });
    geo.applyMatrix4(basis);
    struct.push(geo);
    for (let k = 1; k < n; k++) {
      const a0 = (k - 1) * t - NOSE;
      const a1 = Math.min(k * t, aEnd);
      const g = new THREE.BoxGeometry(a1 - a0, FIN, W);
      g.translate((a0 + a1) / 2, top(k) + FIN / 2, W / 2);
      g.applyMatrix4(basis);
      treads.push(g);
    }
  }
  for (const ld of landings || []) {
    const r = rectXY(ld.rect);
    const w = r.x1 - r.x0;
    const d = r.y1 - r.y0;
    if (w < 0.05 || d < 0.05) continue;
    const slab = new THREE.BoxGeometry(w, 0.15, d);
    slab.translate((r.x0 + r.x1) / 2, ld.z - FIN - 0.075, (r.y0 + r.y1) / 2);
    struct.push(slab);
    const fin = new THREE.BoxGeometry(w, FIN, d);
    fin.translate((r.x0 + r.x1) / 2, ld.z - FIN / 2, (r.y0 + r.y1) / 2);
    treads.push(fin);
  }
  const g = new THREE.Group();
  const s = mergedMesh(struct, lib.slot('walls'), 'walls');
  const tr = mergedMesh(treads, lib.slot('floor'), 'floor');
  if (s) g.add(s);
  if (tr) g.add(tr);
  // 扶手：model.flightRails 给的是每一跑开放那一边的直线（起步的地面 → 顶上一级）；
  // 扶手要跟踏步前缘的连线平行（每一级上方都是 0.9m），立杆站在各自那一级踏步上，整排往梯段里收 4cm
  if (rails?.length) {
    const lines = [];
    for (const ln of rails) {
      const F = frames.find((x) => x.fl === flights[ln.flight]) || frames[0];
      if (!F) continue;
      const aOf = (x, y) => (x - F.O.x) * F.along.x + (y - F.O.z) * F.along.z;
      const nose = (x, y) => Math.min(F.fl.z1, F.fl.z0 + F.rise + (Math.max(0, aOf(x, y)) * F.rise) / Math.max(0.05, F.t));
      // 往梯段中心收 4cm（垂直于走向）
      const ox = Math.abs(F.along.x) > 0.5 ? 0 : Math.sign(F.cx - ln.x1) * 0.04;
      const oy = Math.abs(F.along.x) > 0.5 ? Math.sign(F.cz - ln.y1) * 0.04 : 0;
      const x1 = ln.x1 + ox;
      const y1 = ln.y1 + oy;
      const x2 = ln.x2 + ox;
      const y2 = ln.y2 + oy;
      lines.push({ x1, y1, x2, y2, z1: nose(x1, y1), z2: nose(x2, y2), F });
    }
    const base = (x, y) => {
      // 这一点在哪一跑的哪一级踏步上
      for (const F of frames) {
        const a = (x - F.O.x) * F.along.x + (y - F.O.z) * F.along.z;
        if (a < -0.05 || a > F.L + 0.05) continue;
        const across = Math.abs(F.along.x) > 0.5 ? Math.abs(y - F.cz) : Math.abs(x - F.cx);
        const r = rectXY(F.fl.rect);
        const half = (Math.abs(F.along.x) > 0.5 ? r.y1 - r.y0 : r.x1 - r.x0) / 2;
        if (across > half + 0.05) continue;
        const k = Math.min(F.n - 1, Math.max(1, Math.floor(Math.max(0, a) / Math.max(0.05, F.t)) + 1));
        return a >= F.L ? F.fl.z1 : F.fl.z0 + k * F.rise;
      }
      return 0;
    };
    g.add(balustrade(lines, lib, { h: 0.9, shoe: false, base }));
  }
  g.userData.stair = true;
  return g;
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
  bed: { zh: '床', en: 'Bed', icon: '🛏️', build: bedItem, slot: 'bedding', size: [1.6, 2.05] },
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

/** 家具数据 → THREE.Group（userData 带上 id，供点选 / 拖动）。静态部件按材质合并，draw call 少。 */
export function buildItem(item, ctx = {}) {
  const def = CATALOG[item.kind];
  if (!def) return null;
  const raw = def.build({ ...item, h: item.h || ctx.wallH || 2.8, palette: ctx.palette, key: item.key });
  const g = compact(raw);
  g.position.set(item.x, item.y || 0, item.z);
  g.rotation.y = ((item.rot || 0) * Math.PI) / 180;
  g.userData = { itemId: item.id, kind: item.kind };
  g.traverse((o) => {
    if (o.isMesh) o.userData.itemId = item.id;
  });
  return g;
}
