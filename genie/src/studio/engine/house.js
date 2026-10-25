// 建筑：地板、墙（门窗开洞）、窗框玻璃、窗外的天光卡、门扇、阳台栏杆、品牌底座、看不见的树（只投影子）。
// 墙有两个版本：full（完整高度）/ cut（像 The Sims 一样切到 35cm）。切掉时 full 版移到「只投影」图层 ——
// 看不见，但阳光照进来的窗影还在。
//
// 多层（floors.js 叠起来）：一层一个「壳」（buildFloorShell：这一层的地板、墙、窗、门、栏杆、挑空 / 楼梯口的护栏），
// 坐标都是这一层自己的（y = 0 是这一层的地面），由调用方整组抬到这一层的标高；
// 底座、地面、金线、树只有一份（buildPlinth），垫在所有楼层合起来的外框下面。
// buildHouse 仍然是单层的老入口（一个壳 + 底座）。

import * as THREE from 'three';
import { ROOM_TYPES, bounds } from '../plan/model.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxGeo, worldUV, sphereGeo } from './geom.js';
import { balustrade } from './furniture.js';
import { rng, fbm } from '../../shared/noise.js';
import { BRAND } from '../../shared/config.js';
import { PALETTE } from '../../shared/palette.js';

export const CUT_H = 0.35;
/** 第 1 层：主镜头看不见、但太阳的影子相机看得见 —— 切掉的墙、窗外的树都放这一层（也不会进环境光遮蔽） */
export const SHADOW_LAYER = 1;
/**
 * 第 2 层：藏起来的楼层（看一楼时的二楼）—— 主镜头看不见，太阳的影子照样挡（Engine 在画影子的时候临时打开这一层）。
 * 注：three r183 画平行光影子时按「主镜头」的图层筛选（WebGLShadowMap.renderObject），所以第 1 层其实不投影；
 * 藏起来的楼层一定要投影（楼下的窗光、长长的两层楼影子），单独用这一层，单层方案的画面一点不变。
 */
export const HIDDEN_LAYER = 2;

// ───────────────────────── 建筑模型的「外观件」：墨色切面、磨砂暖石底座、黄铜细线、会淡出的地面 ─────────────────────────
// 颜色全部从 VI（palette.js）来：SAIL 墨、暖灰石、SAIL 金。每个材质库一套（换平面图时复用，不会越建越多）

const col = (hex) => new THREE.Color(hex);
const mixC = (a, b, t) => col(a).lerp(col(b), t);
/** 只要色相：线性空间里亮度归一成 1 的颜色（乘上去不改明暗） */
const lumaNormalized = (c) => {
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b || 1;
  return new THREE.Vector3(c.r / l, c.g / l, c.b / l);
};
/** 底座 / 地面 / 金线 / 烫金字的颜色（VI「晨光溪岸」：湿石头、墨、SAIL 金 —— 克制、像展台） */
const VI = {
  cap: () => mixC(PALETTE.ink, PALETTE.plinth, 0.4), // 剖切面：模型的墨色切口
  stone: () => mixC(PALETTE.ink, PALETTE.inkSoft, 0.42), // 磨砂暖灰石（底色，乘石纹）
  foot: () => col(PALETTE.plinth).multiplyScalar(0.6), // 底下内缩的影缝
  brass: () => mixC(PALETTE.gold, PALETTE.goldL, 0.35), // 拉丝黄铜
  ground: () => mixC(PALETTE.ink, PALETTE.plinth, 0.5), // 地面：暖墨，淡进背景
  groundTint: () => mixC(PALETTE.paper, PALETTE.goldL, 0.3), // 地面反光的色调：纸色偏一点金（只取色相）
  line: () => mixC(PALETTE.gold, PALETTE.goldL, 0.2), // 地上嵌的金线
  foil: PALETTE.goldL, // 烫金字（浅金箔：底色和自发光都用它，和深色石头拉开对比）
};
const SERIF = '"Cormorant Garamond","Noto Serif SC",Georgia,serif';
const SANS = '-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Noto Sans SC",system-ui,sans-serif';

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
  const cap = tag(new THREE.MeshStandardMaterial({ color: VI.cap(), roughness: 0.86, metalness: 0 }), 'cap');
  // 底座：磨砂暖灰石（SAIL 墨往湿石头的方向），有细微云纹，环境光里有一点缎面光泽
  const stone = tag(new THREE.MeshPhysicalMaterial({ color: VI.stone(), map: st.map, roughness: 0.56, roughnessMap: st.rough, metalness: 0, clearcoat: 0.18, clearcoatRoughness: 0.42, specularIntensity: 0.65 }), 'plinth');
  const foot = tag(new THREE.MeshStandardMaterial({ color: VI.foot(), roughness: 0.9 }), 'plinth');
  // 拉丝黄铜细线（SAIL 金）
  const brass = tag(new THREE.MeshPhysicalMaterial({ color: VI.brass(), metalness: 1, roughness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.2 }), 'brass');
  // 地面：暖墨色的磨砂石，带一点柔和反光，从底座往外慢慢淡进背景。
  // 它反射的是天穹：正午是蓝的、黄昏是橙蓝混出来的紫 —— 地面不该跟着变色（VI 是暖石头，不要藏青 / 紫）。
  // 所以把出射光的色相大部分换成纸色偏暖（亮度不变：影子、早晚的明暗都还在），只留三成原色，黄金时段仍然略暖。
  const gU = { gCenter: { value: new THREE.Vector2() }, gR0: { value: 8 }, gR1: { value: 24 }, gTint: { value: lumaNormalized(VI.groundTint()) }, gKeep: { value: 0.3 } };
  const ground = tag(new THREE.MeshStandardMaterial({ color: VI.ground(), roughness: 0.5, metalness: 0, transparent: true, depthWrite: true, dithering: true }), 'ground');
  ground.userData.u = gU;
  ground.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, gU);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;\nuniform vec2 gCenter;\nuniform float gR0;\nuniform float gR1;\nuniform vec3 gTint;\nuniform float gKeep;')
      .replace('#include <opaque_fragment>', '{ float gL = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)); outgoingLight = mix(gL * gTint, outgoingLight, gKeep); }\n#include <opaque_fragment>')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n{ float gd = length(vGroundXZ - gCenter); float gf = 1.0 - smoothstep(gR0, gR1, gd); gl_FragColor.a *= gf * gf * (3.0 - 2.0 * gf); }');
  };
  ground.customProgramCacheKey = () => 'genie-ground-fade-warm';
  // 地上的金色细线：不受光（夜里也看得见，像嵌在地上的金属线）；和地面同一条衰减（gR0 → gR1）一起淡进背景
  const gold = tag(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 'goldline');
  gold.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { gCenter: gU.gCenter, gR0: gU.gR0, gR1: gU.gR1 });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;\nuniform vec2 gCenter;\nuniform float gR0;\nuniform float gR1;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n{ float gd = length(vGroundXZ - gCenter); float gf = 1.0 - smoothstep(gR0, gR1, gd); gl_FragColor.a *= gf * gf * (3.0 - 2.0 * gf); }');
  };
  gold.customProgramCacheKey = () => 'genie-goldline-fade';
  // 窗外的天光卡：外墙窗洞外侧一块朝屋里的板 —— 只从屋里看得见（背面剔除：从外面看还是透过玻璃看进屋里）。
  // 不受光、不投影（阳光照进来的窗影照旧）、不进 AO、点不中；颜色由引擎按时段设（白天浅浅的天色、黄昏琥珀、夜里深苔绿），
  // 顶点色是一道很淡的竖向渐变（上面是天，下面略深、略绿 —— 远处的树）。没有它，16% 的玻璃后面是黑背景，白天的窗像一块黑板。
  const pane = tag(new THREE.MeshBasicMaterial({ color: col(PALETTE.paper), vertexColors: true, side: THREE.FrontSide, fog: false }), 'pane');
  k = { cap, stone, foot, brass, ground, gold, pane };
  KITS.set(lib, k);
  return k;
}

/** 这个材质库的外观件（墨色切面、石头、黄铜、地面、天光卡）：floors.js 的楼板切面也用墨色 cap */
export const houseKit = (lib) => kitFor(lib);

/** 引擎销毁时：这一套外观件的材质一起释放（石纹贴图是全局共用的，留着给下一个引擎） */
export function disposeHouseKit(lib) {
  const k = KITS.get(lib);
  if (!k) return;
  for (const m of Object.values(k)) m.dispose();
  KITS.delete(lib);
}

/** 地面金线：一条条很细的带子（有真实宽度 → 抗锯齿干净），两端可以淡出 */
function goldRibbons(segs, y, width = 0.022) {
  const pos = [];
  const col = [];
  const idx = [];
  const c = VI.line();
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

/**
 * 一段墙体盒子（四面不同材质）。顶面默认是墨色切口（墙头、切低的墙）；
 * capTop: false = 顶面是墙面材质（窗台：从上面透过窗看得到它，不该是一条黑边）
 */
function wallBox(wall, a, b, y0, y1, lib, { extendA = 0, extendB = 0, capTop = true } = {}) {
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
  const top = capTop ? cap : end;
  // BoxGeometry 的材质顺序：+x, -x, +y, -y, +z, -z
  const mats = wall.axis === 'x' ? [end, end, top, cap, pos, neg] : [pos, neg, top, cap, end, end];
  const m = new THREE.Mesh(geo, mats);
  if (wall.axis === 'x') m.position.set(along, y0, wall.c);
  else m.position.set(wall.c, y0, along);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.slot = 'walls';
  m.userData.mats = mats;
  return m;
}

/**
 * 按材质合并：一堆（多材质的）网格 → 一个网格、每种材质一个 group（draw call 少很多：以前每块墙 6 个）。
 * UV 保留每块原来的（贴图的位置和以前一模一样），位置 / 法线换算到合并后的坐标（相对 build 时的父组）。
 */
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
class Merger {
  constructor() {
    this.buckets = new Map();
    this.temp = [];
  }
  /** mesh 的位置 / 旋转按它自己的 matrix（或给 matrix，例如门扇的世界矩阵）；用完的非缓存几何体在 build 时释放 */
  add(mesh, matrix) {
    if (!matrix) {
      mesh.updateMatrix();
      matrix = mesh.matrix;
    }
    const geo = mesh.geometry;
    const mats = mesh.material;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uv = geo.attributes.uv;
    const idx = geo.index;
    _nm.getNormalMatrix(matrix);
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
    for (const g of groups) {
      const m = Array.isArray(mats) ? mats[g.materialIndex] : mats;
      if (!m) continue;
      let b = this.buckets.get(m);
      if (!b) this.buckets.set(m, (b = { pos: [], nor: [], uv: [] }));
      const end = Math.min(g.start + g.count, idx ? idx.count : pos.count);
      for (let i = g.start; i < end; i++) {
        const k = idx ? idx.getX(i) : i;
        _v.fromBufferAttribute(pos, k).applyMatrix4(matrix);
        _n.fromBufferAttribute(nor, k).applyMatrix3(_nm).normalize();
        b.pos.push(_v.x, _v.y, _v.z);
        b.nor.push(_n.x, _n.y, _n.z);
        b.uv.push(uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0);
      }
    }
    if (!geo.userData?.cached) this.temp.push(geo);
  }
  /** → 一个 Mesh（或 null）：groups 按材质，材质数组只放用到的 */
  build({ castShadow = true, receiveShadow = true, slot } = {}) {
    for (const g of this.temp) g.dispose();
    this.temp = [];
    if (!this.buckets.size) return null;
    const pos = [];
    const nor = [];
    const uv = [];
    const mats = [];
    const geo = new THREE.BufferGeometry();
    let at = 0;
    for (const [m, b] of this.buckets) {
      const n = b.pos.length / 3;
      if (!n) continue;
      for (let i = 0; i < b.pos.length; i++) pos.push(b.pos[i]);
      for (let i = 0; i < b.nor.length; i++) nor.push(b.nor[i]);
      for (let i = 0; i < b.uv.length; i++) uv.push(b.uv[i]);
      geo.addGroup(at, n, mats.length);
      mats.push(m);
      at += n;
    }
    this.buckets.clear();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    let material = mats;
    if (mats.length === 1) {
      material = mats[0];
      geo.clearGroups();
    }
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    if (slot) mesh.userData.slot = slot;
    if (Array.isArray(material)) mesh.userData.mats = material;
    return mesh;
  }
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

/**
 * 外墙窗外的天光卡（见 kitFor 的 pane）：贴在外墙外面 2cm，正面朝屋里；比窗洞四周各大 15cm（斜着看也看不到边），
 * 但不超出这段墙的两端、不高过墙顶、不钻进底座 —— 从外面、从切低的墙角都看不到它。
 */
function windowCard(wall, p, lib, H) {
  const sill = p.sill ?? 0.9;
  const head = Math.min(p.head ?? 2.2, H - 0.05);
  const a = Math.max(wall.a, p.a - 0.15);
  const b = Math.min(wall.b, p.b + 0.15);
  const y0 = Math.max(-0.03, sill - 0.15);
  const y1 = Math.min(H - 0.02, head + 0.15);
  const cw = b - a;
  const ch = y1 - y0;
  if (cw < 0.05 || ch < 0.05) return null;
  const geo = new THREE.PlaneGeometry(cw, ch, 1, 2);
  // 三排顶点：上（天）1.0 → 中 0.95 → 下 0.8、略偏绿（线性空间，乘在材质颜色上）
  const rows = { top: [1, 1, 1], mid: [0.95, 0.955, 0.95], bottom: [0.78, 0.81, 0.78] };
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const c = y > 1e-4 ? rows.top : y < -1e-4 ? rows.bottom : rows.mid;
    cols.set(c, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = new THREE.Mesh(geo, kitFor(lib).pane);
  const off = wall.outward * (wall.t / 2 + 0.02);
  const inward = -wall.outward;
  const mid = (a + b) / 2;
  // PlaneGeometry 的正面朝本地 +z：转成朝屋里
  if (wall.axis === 'x') {
    m.position.set(mid, (y0 + y1) / 2, wall.c + off);
    m.rotation.y = inward > 0 ? 0 : Math.PI;
  } else {
    m.position.set(wall.c + off, (y0 + y1) / 2, mid);
    m.rotation.y = inward > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  m.castShadow = false;
  m.receiveShadow = false;
  m.userData.noAO = true;
  m.userData.pane = true;
  return m;
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

// ───────────────────────── 车廊 / 前院（马来西亚排屋） ─────────────────────────
// 车要开进来：临街那边不放栏杆，只有两根门柱（柱头一盏小门灯，夜里会亮）；
// 两侧是和邻居之间的矮墙。挨着屋子的那条边就是屋子的墙（有大门），对面那条边临街。

const OPP = { N: 'S', S: 'N', W: 'E', E: 'W' };
/** 这段墙在房间的哪一边 */
const sideOf = (room, w) => (w.axis === 'x' ? (Math.abs(w.c - room.y) < 0.05 ? 'N' : 'S') : Math.abs(w.c - room.x) < 0.05 ? 'W' : 'E');

/** 房间哪几条边挨着室内 */
function houseSides(room, walls) {
  const s = new Set();
  for (const w of walls) {
    const other = w.neg?.id === room.id ? w.pos : w.pos?.id === room.id ? w.neg : null;
    if (other && !ROOM_TYPES[other.type]?.outdoor) s.add(sideOf(room, w));
  }
  return s;
}

function porchEdge(wall, lib, street) {
  const g = new THREE.Group();
  const len = wall.b - wall.a;
  const geoFor = (w, h, d) => (wall.axis === 'x' ? boxGeo(w, h, d) : boxGeo(d, h, w));
  const ext = lib.fixed.exterior;
  const solid = (m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  if (!street) {
    // 和邻居之间的矮墙（0.9m，外墙漆）+ 一道薄压顶
    g.add(placeAlong(wall, solid(new THREE.Mesh(geoFor(len + wall.t, 0.9, wall.t), ext)), (wall.a + wall.b) / 2, 0));
    g.add(placeAlong(wall, solid(new THREE.Mesh(geoFor(len + wall.t + 0.03, 0.04, wall.t + 0.03), ext)), (wall.a + wall.b) / 2, 0.9));
    return g;
  }
  // 临街：两根门柱 + 柱头小门灯；大门推开着（不画），车道是空的
  const P = 0.32;
  const H = 1.35;
  for (const at of [wall.a, wall.b]) {
    g.add(placeAlong(wall, solid(new THREE.Mesh(boxGeo(P, H, P), ext)), at, 0));
    g.add(placeAlong(wall, solid(new THREE.Mesh(boxGeo(P + 0.05, 0.05, P + 0.05), ext)), at, H));
    const lamp = new THREE.Mesh(boxGeo(0.13, 0.17, 0.13), lib.fixed.lampShade);
    g.add(placeAlong(wall, lamp, at, H + 0.05));
    g.add(placeAlong(wall, solid(new THREE.Mesh(boxGeo(0.17, 0.025, 0.17), lib.fixed.rail)), at, H + 0.22));
  }
  // 地上一条细细的门轨（深色金属）
  const track = new THREE.Mesh(geoFor(Math.max(0.1, len - P), 0.012, 0.05), lib.fixed.rail);
  track.receiveShadow = true;
  g.add(placeAlong(wall, track, (wall.a + wall.b) / 2, 0));
  return g;
}

/**
 * 底座上的烫金字牌：字距拉开的衬线大写（字高 ≈ 底座高的 45%，在 1440 宽的默认视角里读得出来）
 * + 下面一行无衬线副标（许愿模式里是「示范户型 · 概念示意」）。
 * 字牌按字的实际宽度裁（不是一整条 9 米的长牌），由调用方放在这一面的正中；字太长就整体缩小，永远不出底座。
 * 贴图只画白字（当遮罩），颜色和自发光都在材质上：浅金箔（PALETTE.goldL）+ 一点自发光，和深色石头拉开对比。
 * @param {number} maxW 这一面最多能用多宽（米）
 * @param {number} faceH 这一面的高度（米）
 * @returns {THREE.Mesh}（geometry 宽 = 字牌宽；userData.plaque = true，引擎按时段调自发光）
 */
function plaque(title, sub, maxW, faceH) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const track = (px) => {
    try {
      ctx.letterSpacing = `${px.toFixed(2)}px`;
    } catch {
      /* 旧浏览器没有 letterSpacing */
    }
  };
  // 以「米」排版：标题字高（cap height）= 45% 底座高；副标字高 = 24%；行距按副标字高
  const CAP_T = 0.45;
  const CAP_S = 0.24;
  const TRACK_T = 0.14; // em
  // 副标：大写 / 中文拉开字距；有小写字母的英文句子只微微拉开（小写字距太大会散）
  const TRACK_S = /[a-z]/.test(sub || '') ? 0.06 : 0.22;
  const PAD = 0.24; // 字牌左右留白（米）
  /** 量一种字体的 cap height / em（字体还没到时用常见衬线 / 无衬线的比例） */
  const capRatio = (font, probe, fallback) => {
    ctx.font = `${font.replace('{S}', '100px')}`;
    const m = ctx.measureText(probe);
    const a = m.actualBoundingBoxAscent;
    return Number.isFinite(a) && a > 20 && a < 100 ? a / 100 : fallback;
  };
  const FT = `600 {S} ${SERIF}`;
  const FS = `500 {S} ${SANS}`;
  let layout = null;
  /** 一行字真正的墨迹高度（em）：中文字比大写字母高、副标的 y / p 有下伸 —— 按真的字排，不会被字牌边裁掉 */
  const inkBox = (font, text, fallbackA, fallbackD) => {
    if (!text) return { a: 0, d: 0 };
    ctx.font = font.replace('{S}', '100px');
    const m = ctx.measureText(text);
    const a = m.actualBoundingBoxAscent;
    const d = m.actualBoundingBoxDescent;
    return { a: Number.isFinite(a) && a > 0 ? a / 100 : fallbackA, d: Number.isFinite(d) && d >= 0 ? d / 100 : fallbackD };
  };
  /** 排版（单位：米）。widthCap：字牌最多多宽 */
  const measure = (widthCap) => {
    track(0);
    const kT = capRatio(FT, 'HWE', 0.64);
    const kS = capRatio(FS, 'HDE', 0.71);
    const bT = inkBox(FT, title, 0.9, 0.12);
    const bS = inkBox(FS, sub, 0.9, 0.22);
    let fsT = (CAP_T * faceH) / kT; // 米
    let fsS = (CAP_S * faceH) / kS;
    let gap = sub ? Math.max(CAP_S * faceH * 0.65, faceH * 0.06) : 0;
    // 宽度：用 100px 的字量，再按比例换成米（字距是 em 的倍数，跟着一起缩放）
    const widthAt = (font, text, trackEm) => {
      if (!text) return 0;
      ctx.font = font.replace('{S}', '100px');
      track(100 * trackEm);
      const w = ctx.measureText(text).width - 100 * trackEm; // 去掉最后一个字后面多出来的字距
      track(0);
      return w / 100;
    };
    const wT = widthAt(FT, title, TRACK_T);
    const wS = widthAt(FS, sub, TRACK_S);
    // 放不下就整体缩：横向不出这一面，纵向墨迹最多占这一面的 90%
    let k = 1;
    const need = Math.max(wT * fsT, wS * fsS);
    if (need + PAD * 2 > widthCap) k = Math.max(0.05, (widthCap - PAD * 2) / need);
    const block = (bT.a + bT.d) * fsT + (sub ? gap + (bS.a + bS.d) * fsS : 0);
    if (block * k > faceH * 0.9) k = (faceH * 0.9) / block;
    fsT *= k;
    fsS *= k;
    gap *= k;
    const w = Math.min(widthCap, Math.max(wT * fsT, wS * fsS) + PAD * 2);
    // 整块（按墨迹）在这一面上垂直居中
    const top = (faceH - block * k) / 2;
    const baseT = top + bT.a * fsT;
    const baseS = baseT + bT.d * fsT + gap + bS.a * fsS;
    return { w, fsT, fsS, wT: wT * fsT, wS: wS * fsS, baseT, baseS };
  };
  layout = measure(maxW);
  // 分辨率：每米 ~420 像素（长边最多 4096）—— 2× 截图里副标也清楚
  const pxm = Math.min(420, 4096 / layout.w);
  c.width = Math.max(64, Math.round(layout.w * pxm));
  c.height = Math.max(16, Math.round(faceH * pxm));
  const draw = () => {
    const L = layout;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'white'; // 只是遮罩：颜色在材质上（PALETTE.goldL）
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const px = (m) => m * pxm;
    ctx.font = FT.replace('{S}', `${px(L.fsT).toFixed(2)}px`);
    track(px(L.fsT) * TRACK_T);
    ctx.fillText(title, (c.width - px(L.wT)) / 2, px(L.baseT));
    if (sub) {
      ctx.globalAlpha = 0.86;
      ctx.font = FS.replace('{S}', `${px(L.fsS).toFixed(2)}px`);
      track(px(L.fsS) * TRACK_S);
      ctx.fillText(sub, (c.width - px(L.wS)) / 2, px(L.baseS));
      ctx.globalAlpha = 1;
    }
    track(0);
  };
  draw();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // 网页字体可能晚到：到了就按真字体重新量、重画一次（字牌宽度不变：只在原来的宽度里重新排）
  if (typeof document !== 'undefined' && document.fonts?.load)
    Promise.all([document.fonts.load('600 40px "Cormorant Garamond"'), document.fonts.load('500 20px "Noto Sans SC"')])
      .then(() => {
        const w0 = layout.w;
        layout = { ...measure(w0), w: w0 };
        draw();
        tex.needsUpdate = true;
      })
      .catch(() => {});
  const foil = col(VI.foil);
  const mat = new THREE.MeshPhysicalMaterial({
    color: foil,
    map: tex,
    transparent: true,
    roughness: 0.3,
    metalness: 0.55,
    clearcoat: 0.4,
    clearcoatRoughness: 0.22,
    emissive: foil,
    emissiveMap: tex,
    emissiveIntensity: 0.8,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(layout.w, faceH), mat);
  m.userData.noAO = true;
  m.userData.ownMaterial = true;
  m.userData.plaque = true;
  return m;
}

/** 底座正面的标题：没给就用品牌（WISH · RICCIONE REKA · 溪岸 SAIL）；旧方案里存着的 GENIE 一律换成 WISH */
export function plinthTitle(title) {
  const s = title == null ? '' : String(title).trim();
  return s ? s.replace(/\bGENIE\b/gi, BRAND.app) : BRAND.plinth;
}

/** 副标：界面给什么画什么（已经是当前语言）；没给 = 溪岸 SAIL。
 *  只有一种情况不画：副标里的词标题里全都有（比如两行都是品牌）—— 品牌不在底座上印两遍。 */
export function plinthSubtitle(subtitle, title) {
  const s = subtitle == null ? BRAND.house : String(subtitle).trim().replace(/\bGENIE\b/gi, BRAND.app);
  const words = (x) =>
    String(x)
      .toUpperCase()
      .split(/[^A-Z0-9㐀-鿿]+/)
      .filter((w) => w && w !== 'BY');
  const inTitle = new Set(words(title));
  const mine = words(s);
  return mine.length && mine.every((w) => inTitle.has(w)) ? '' : s;
}

/**
 * 一层的「壳」：地板、墙（full + cut 两套）、窗框玻璃、窗外天光卡、门扇、阳台栏杆、车廊矮墙 / 门柱、挑空 / 楼梯口的护栏。
 * 坐标是这一层自己的（y = 0 = 这一层的地面）；调用方把 group 放到这一层的标高。
 * floor：{ rooms, openings, ceil }（v2 的一层；旧的单层方案传 { rooms, openings, ceil: wallH }）。
 * opts.elev：这一层的标高（只写进 windows[].elev / rooms[].y，给窗光、光柱、夜灯换算成世界坐标）；
 * opts.holes：这一层「没有楼板」的房间 id（往下走的楼梯井、挑空）—— 不铺地板，挨着它的墙往下接到下一层的天花（opts.below 米），
 *             楼板那一段不会露出一条缝；
 * opts.voidEdges：挑空 / 楼梯口没有墙的边（model.voidEdges），立 1.0m 的护栏。
 * @returns {{ group, wallSets, windows, rooms, wallH }}
 */
export function buildFloorShell(floor, walls, lib, { elev = 0, voidEdges = [], holes = null, below = 0 } = {}) {
  const root = new THREE.Group();
  const H = floor.ceil || floor.wallH || 2.8;
  const isHole = (id) => !!id && !!holes?.has(id);
  const rooms0 = floor.rooms || [];

  // 地板（楼梯井 / 挑空没有地板）：同一种表面的合成一个网格
  const fin = { floor: new Merger(), tile: new Merger() };
  for (const r of rooms0) {
    if (isHole(r.id) || ROOM_TYPES[r.type]?.void) continue;
    const slot = ROOM_TYPES[r.type]?.floor === 'tile' ? 'tile' : 'floor';
    const m = new THREE.Mesh(boxGeo(r.w, 0.04, r.d), lib.slot(slot));
    m.position.set(r.x + r.w / 2, -0.04, r.y + r.d / 2);
    fin[slot].add(m);
  }
  for (const slot of ['floor', 'tile']) {
    const m = fin[slot].build({ castShadow: false, slot });
    if (m) root.add(m);
  }

  // 墙：每一段外墙一套（切法跟着镜头，一段一段地切）；内墙整层合成一套（只有「全切」时才一起放低）。
  // 每一套里同一种材质合成一个网格：墙体、窗框、玻璃各一个（以前每块墙 6 个 draw call）
  const wallSets = [];
  const windows = [];
  const mkTarget = () => ({ full: new THREE.Group(), cut: new THREE.Group(), body: new Merger(), cutBody: new Merger(), frames: new Merger(), glass: new Merger() });
  const finish = (T) => {
    const body = T.body.build({ slot: 'walls' });
    if (body) T.full.add(body);
    const frames = T.frames.build();
    if (frames) T.full.add(frames);
    const glass = T.glass.build({ castShadow: false, receiveShadow: false });
    if (glass) {
      glass.renderOrder = 2;
      T.full.add(glass);
    }
    const cut = T.cutBody.build({ castShadow: false, slot: 'walls' });
    if (cut) T.cut.add(cut);
    T.cut.visible = false;
    root.add(T.full, T.cut);
  };
  const inner = mkTarget();
  const doors = { leaf: new Merger(), handle: new Merger() };
  for (const w of walls) {
    const outdoorSide = (w.neg && ROOM_TYPES[w.neg.type]?.outdoor && !w.pos) || (w.pos && ROOM_TYPES[w.pos.type]?.outdoor && !w.neg);
    if (outdoorSide) {
      // 阳台：玻璃栏杆；车廊 / 前院：两侧矮墙、临街是门柱（车要开得进来）
      const ref = w.neg || w.pos;
      const porch = ref.type === 'porch' && rooms0.find((r) => r.id === ref.id);
      root.add(porch ? porchEdge(w, lib, houseSides(porch, walls).has(OPP[sideOf(porch, w)])) : railing(w, lib));
      continue;
    }
    // 挨着楼梯井 / 挑空的墙：往下接到下一层的天花（楼板那一段不留缝）
    const y0 = below > 0 && (isHole(w.neg?.id) || isHole(w.pos?.id)) ? -below : 0;
    const T = w.exterior ? mkTarget() : inner;
    const ends = (p) => ({ extendA: Math.abs(p.a - w.a) < 0.01 ? w.t / 2 : 0, extendB: Math.abs(p.b - w.b) < 0.01 ? w.t / 2 : 0 });
    for (const p of w.pieces) {
      // 往下接的那一段（楼板的厚度）：两端不外伸（不和旁边楼板的切面重叠）
      if (y0 < 0 && p.kind !== 'door') {
        T.body.add(wallBox(w, p.a, p.b, y0, 0, lib));
        T.cutBody.add(wallBox(w, p.a, p.b, y0, 0, lib));
      }
      if (p.kind === 'solid') {
        T.body.add(wallBox(w, p.a, p.b, 0, H, lib, ends(p)));
        T.cutBody.add(wallBox(w, p.a, p.b, 0, CUT_H, lib, ends(p)));
      } else if (p.kind === 'window' || p.kind === 'slider') {
        const sill = p.sill ?? 0.9;
        const head = Math.min(p.head ?? 2.2, H - 0.05);
        // 窗台的顶面是墙面材质（不是墨色切口）：从上往下透过窗看得到它
        if (sill > 0.01) T.body.add(wallBox(w, p.a, p.b, 0, sill, lib, { ...ends(p), capTop: false }));
        T.body.add(wallBox(w, p.a, p.b, head, H, lib, ends(p)));
        for (const m of windowFrame(w, p, lib, H).children) (m.material === lib.fixed.glass ? T.glass : T.frames).add(m);
        // 外墙的窗：窗外放一块天光卡（和窗框一起：墙切低时一起收起来）
        if (w.exterior && w.outward) {
          const card = windowCard(w, p, lib, H);
          if (card) T.full.add(card);
        }
        if (sill > 0.01) T.cutBody.add(wallBox(w, p.a, p.b, 0, Math.min(sill, CUT_H), lib, ends(p)));
        if (w.exterior) {
          const inward = w.outward * -1;
          const a3 = w.axis === 'x' ? new THREE.Vector3(p.a, 0, w.c) : new THREE.Vector3(w.c, 0, p.a);
          const b3 = w.axis === 'x' ? new THREE.Vector3(p.b, 0, w.c) : new THREE.Vector3(w.c, 0, p.b);
          const n = w.axis === 'x' ? new THREE.Vector3(0, 0, inward) : new THREE.Vector3(inward, 0, 0);
          // a / b 在这一层自己的坐标里（y = 0）；elev = 这一层的标高（光柱、窗光换算成世界坐标用）
          windows.push({ a: a3, b: b3, sill, head, inward: n, elev });
        }
      } else if (p.kind === 'door') {
        const head = Math.min(p.head ?? 2.1, H - 0.05);
        T.body.add(wallBox(w, p.a, p.b, head, H, lib, ends(p)));
        const leaf = doorLeaf(w, p, lib);
        if (leaf) {
          leaf.updateMatrixWorld(true);
          for (const m of leaf.children) (m.userData.slot === 'metal' ? doors.handle : doors.leaf).add(m, m.matrixWorld);
        }
      }
    }
    const outward = w.exterior ? (w.axis === 'x' ? new THREE.Vector3(0, 0, w.outward) : new THREE.Vector3(w.outward, 0, 0)) : null;
    if (T !== inner) finish(T);
    // 内墙的每一段共用整层的那一套（切法永远一样：只有「全切」时一起放低）
    wallSets.push({ wall: w, full: T.full, cut: T.cut, outward, lowered: false });
  }
  finish(inner);
  const leaves = doors.leaf.build({ slot: 'cabinetry' });
  if (leaves) root.add(leaves);
  const handles = doors.handle.build({ slot: 'metal' });
  if (handles) root.add(handles);

  // 挑空 / 楼梯口：没有墙的那几条边立护栏（1.0m，扶手 + 细立杆）
  if (voidEdges?.length) {
    const lines = voidEdges.map((e) => {
      // 护栏立在楼板这一边、离边 5cm（不悬在洞口上）；model.voidEdges 的 inward = 洞在线的哪一边（±1）
      const k = -(e.inward || 0) * 0.05;
      return e.axis === 'x' ? { x1: e.a, y1: e.c + k, x2: e.b, y2: e.c + k, z1: 0, z2: 0 } : { x1: e.c + k, y1: e.a, x2: e.c + k, y2: e.b, z1: 0, z2: 0 };
    });
    const rail = balustrade(lines, lib, { h: 1.0, posts: true });
    rail.userData.voidRail = true;
    root.add(rail);
  }

  const rooms = rooms0
    .filter((r) => !isHole(r.id) && !ROOM_TYPES[r.type]?.void)
    .map((r) => ({ id: r.id, type: r.type, x: r.x + r.w / 2, z: r.y + r.d / 2, area: r.w * r.d, w: r.w, d: r.d, y: elev }));
  return { group: root, wallSets, windows, rooms, wallH: H };
}

/**
 * 品牌底座（磨砂深石 + 黄铜细线 + 影缝）、两块烫金字牌、会淡出的地面 + 金线、窗外看不见的树。
 * bb：所有楼层合起来的外框（model.bounds）；top：整栋楼最高的天花（树冠跟着它长高）。
 * opts.title / opts.subtitle：底座正面的两行字（界面给的是当前语言的文字，这里原样画；副标没给 = 溪岸 SAIL）。
 * 侧面永远是品牌：WISH · by RICCIONE REKA。
 * @returns {{ group, plaques, trees }}
 */
export function buildPlinth(bb, lib, { title, subtitle, ground = true, top = 2.8 } = {}) {
  title = plinthTitle(title);
  subtitle = plinthSubtitle(subtitle, title);
  const root = new THREE.Group();
  // 底座：像建筑模型的展示台 —— 磨砂深石 + 细倒角，顶边一圈拉丝黄铜细线，底下内缩一道「影缝」让它像浮起来
  const K = kitFor(lib);
  const m = 0.35;
  const pw = bb.w + m * 2;
  const pd = bb.d + m * 2;
  const ph = 0.62;
  const topY = -0.04;
  const y0 = topY - ph;
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
  brass.position.set(bb.cx, topY - 0.042, bb.cy);
  brass.userData.noAO = true;
  root.add(brass);
  // 字牌：正面（+z，默认镜头看着的那一面）居中写标题 + 副标；右侧面（+x）居中写品牌。字高 ≈ 底座高的 45%
  const faceH = ph - gap;
  const faceY = y0 + gap + faceH / 2;
  const front = plaque(title, subtitle, pw * 0.9, faceH);
  front.position.set(bb.cx, faceY, bb.cy + pd / 2 + 0.003);
  root.add(front);
  const side = plaque(BRAND.app, BRAND.by, pd * 0.9, faceH);
  side.position.set(bb.cx + pw / 2 + 0.003, faceY, bb.cy);
  side.rotation.y = Math.PI / 2;
  root.add(side);
  const plaques = [front, side];

  // 地面：深色、柔和反光、接影子，离底座越远越淡进背景；上面嵌一道金色细线（离底座 0.4m，跟地面一起淡出）
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
    const inset = 0.4;
    const X0 = bb.x0 - m - inset;
    const X1 = bb.x1 + m + inset;
    const Z0 = bb.y0 - m - inset;
    const Z1 = bb.y1 + m + inset;
    const t = 0.008; // 线宽的一半：四边互相压住转角，转角是干净的直角
    const a = 0.8;
    const segs = [
      [X0 - t, Z0, X1 + t, Z0, a, a],
      [X1, Z0, X1, Z1, a, a],
      [X1 + t, Z1, X0 - t, Z1, a, a],
      [X0, Z1, X0, Z0, a, a],
    ];
    const lines = new THREE.Mesh(goldRibbons(segs, y0 + 0.004, 0.016), K.gold);
    lines.renderOrder = 1;
    lines.userData.noAO = true;
    root.add(lines);
  }

  // 看不见的树：只把树影投进窗里（窗上的树影 = 「时间在流动」的感觉）。
  // 只有树冠（树干的影子会从空地上一条黑线拉过来，露馅）；哪几棵在投影由引擎按太阳决定（Engine.updateTrees）。
  // 两三层的楼：树冠跟着长高（最高到整栋楼的 3/4），二楼的窗上也有树影；单层（≤ 4.2m 的树冠）照旧。
  const trees = new THREE.Group();
  const rand = rng(Math.round(bb.w * 100 + bb.d * 7));
  const grow = Math.max(1, (0.75 * top) / 4.2);
  const sides = [
    [bb.x0 - 2.6, bb.cy - bb.d * 0.25],
    [bb.x1 + 2.6, bb.cy + bb.d * 0.2],
    [bb.cx + bb.w * 0.2, bb.y1 + 2.8],
    [bb.cx - bb.w * 0.25, bb.y0 - 2.8],
  ];
  for (const [tx, tz] of sides) {
    const tree = new THREE.Group();
    // 稀一点的树冠（小团、有空隙）→ 窗里是斑驳的光，而不是一整片黑影
    for (let i = 0; i < 13; i++) {
      const leaf = new THREE.Mesh(sphereGeo(0.28 + rand() * 0.38, 8), K.cap);
      leaf.position.set((rand() - 0.5) * 3.0, (2.3 + rand() * 1.9) * grow, (rand() - 0.5) * 3.0);
      leaf.scale.y = 0.55;
      leaf.castShadow = true;
      leaf.layers.set(SHADOW_LAYER);
      tree.add(leaf);
    }
    tree.position.set(tx, -0.04, tz);
    trees.add(tree);
  }
  root.add(trees);
  return { group: root, plaques, trees };
}

/**
 * 单层的老入口（v1 方案 / 一层的 floor）：一个壳 + 底座。
 * opts.title / opts.subtitle：底座正面的两行字（界面给的是当前语言的文字，这里原样画；副标没给 = 溪岸 SAIL）。
 * @returns {{ group, wallSets, windows, rooms, bounds, wallH, trees, plaques, pane }}
 */
export function buildHouse(single, walls, lib, { title, subtitle, ground = true } = {}) {
  const floor = { rooms: single.rooms || [], openings: single.openings || [], ceil: single.ceil || single.wallH || 2.8 };
  const shell = buildFloorShell(floor, walls, lib);
  const bb = bounds({ rooms: floor.rooms });
  const base = buildPlinth(bb, lib, { title, subtitle, ground, top: shell.wallH });
  const root = new THREE.Group();
  root.add(shell.group, base.group);
  return { group: root, wallSets: shell.wallSets, windows: shell.windows, rooms: shell.rooms, bounds: bb, wallH: shell.wallH, trees: base.trees, plaques: base.plaques, pane: kitFor(lib).pane };
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
