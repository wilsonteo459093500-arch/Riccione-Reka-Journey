// 直觉牌的插画 —— 离线渲染台（只在开发时用，不进打包；许愿之旅的 bundle 里没有 three.js）。
//
// 为什么离线：3D 工作室已经有一整套「像真的」程序化家具（furniture.js）和 PBR 材质（matlib + textures），
// 直觉牌用同一套家具、同一套材质拍成小照片 —— 客人在 iPad 上看到的，就是之后在 3D 里会看到的那个家的质感。
//
// 画法（一台很小的「摄影棚」）：
//   · 每张图把同一个场景画 N 次再平均：每次太阳在日轮里抖一下（软影子）、窗口的天光换一个点（窗上的面光源 → 软的、
//     有方向的影子和自然的衰减）、夜里的灯在灯罩里抖一下、相机抖半个像素（抗锯齿）—— 像一台很便宜的路径追踪器；
//   · 平均完再叠一层 GTAO 接触阴影，最后用工作室同一种色调映射（Khronos PBR Neutral，暗部按比例压暗）；
//   · 1440×1080 画，缩成 960×720 和 480×360 两张 WebP（手机拿小的）。
//
// 跑法（重拍某几张时）：
//   1. npm run dev（最好另开一个关掉 HMR 的 dev server：改别的文件不会把长时间的渲染重新载入）；
//   2. 用 Playwright（或 Chrome）打开 /src/quiz/vignettes/render.html，等 window.VG.ready；
//   3. 对每个 id 调 await VG.shoot(id, { n: 32 }) → { files: { '960': dataURL, '480': dataURL } }（柜子小样是 { tile }），
//      存成 img/<id>-960.webp、img/<id>-480.webp（直觉牌）或 tiles/<id>-tile.webp（宝藏页的柜子）。
//      VG.ids() 列出 24 个直觉牌场景，VG.ids('tiles') 列出柜子小样。n = 每张平均几次（32 ≈ 每张 1–2 分钟，SwiftShader）。
// 场景在 sets.js（直觉牌）和 tiles.js（柜子小样）。

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MatLib } from '../../studio/engine/matlib.js';
import { useLib, buildItem } from '../../studio/engine/furniture.js';
import { generateMaps, variantFor } from '../../shared/textures.js';
import { MAT_BY_ID } from '../../shared/materials.js';
import { SETS } from './sets.js';
import { TILES } from './tiles.js';

const ALL = { ...SETS, ...TILES };

let W = 1440;
let H = 1080;
// 默认输出：960×720（iPad）+ 480×360（手机）
const OUT = [
  [960, 720, '960'],
  [480, 360, '480'],
];

const log = (s) => {
  const el = document.getElementById('log');
  if (el) el.textContent = s;
};

// ───────────────────────── 色调映射：和工作室一样（Neutral，暗部按比例压暗，不把阴影推饱和） ─────────────────────────
(function patchToneMapping() {
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  const at = chunk.indexOf('vec3 NeutralToneMapping');
  const re = /color -= offset;/;
  if (at < 0 || !re.test(chunk.slice(at))) return;
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.slice(0, at) + chunk.slice(at).replace(re, 'color *= max( 0.0, 1.0 - offset / max( max( color.r, max( color.g, color.b ) ), 1e-5 ) );');
})();

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

const lib = new MatLib(renderer, 'high');
useLib(lib);
const pmrem = new THREE.PMREMGenerator(renderer);
const ENV = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ───────────────────────── 小工具 ─────────────────────────

function halton(i, b) {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= b;
    r += f * (i % b);
    i = Math.floor(i / b);
  }
  return r;
}
const deg = (d) => (d * Math.PI) / 180;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 单独一个 PBR 材质（不占工作室的「表面」）：和 MatLib.apply 同一套参数 */
const NORMAL = { wood: 1.25, marble: 0.6, travertine: 1, terrazzo: 0.7, concrete: 1, limewash: 1, paint: 0.7, tile: 1, linen: 1.1, boucle: 1, knit: 1, velvet: 0.8, felt: 0.9, leather: 1.1, rattan: 1, metal: 0.6 };
const SHEEN = { velvet: { rough: 0.32, lift: 0.28 }, boucle: { rough: 0.55, lift: 0.4 }, knit: { rough: 0.6, lift: 0.4 }, felt: { rough: 0.6, lift: 0.35 }, linen: { rough: 0.7, lift: 0.45 } };
const matCache = new Map();
function pbr(matId, { slot = 'swatch', R = 512, variant, repeat = 1 } = {}) {
  const key = `${matId}|${slot}|${R}|${variant}|${repeat}`;
  if (matCache.has(key)) return matCache.get(key);
  const mat = MAT_BY_ID[matId];
  const v = variant || variantFor(mat, slot === 'swatch' ? 'cabinetry' : slot);
  const g = generateMaps(matId, v, R);
  const tex = (data, srgb) => {
    const t = new THREE.DataTexture(data, R, R, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.repeat.set(repeat / g.size, repeat / g.size);
    t.rotation = g.rotation;
    t.needsUpdate = true;
    return t;
  };
  const m = new THREE.MeshPhysicalMaterial({ map: tex(g.albedo, true), normalMap: tex(g.normal, false), roughnessMap: tex(g.orm, false), aoMap: null, roughness: 1, metalness: mat.metal });
  const type = mat.tex.type;
  const ns = NORMAL[type] ?? 1;
  m.normalScale.set(ns, ns);
  m.sheen = mat.sheen || 0;
  if (m.sheen) {
    const sp = SHEEN[type] || SHEEN.linen;
    m.sheenColor.set(mat.color).lerp(new THREE.Color(0xffffff), sp.lift);
    m.sheenRoughness = sp.rough;
  }
  m.clearcoat = mat.clearcoat || 0;
  m.clearcoatRoughness = mat.ccRough ?? 0.08;
  m.envMapIntensity = mat.metal >= 0.5 ? 2.2 : m.clearcoat >= 0.3 ? 1.4 : 1;
  m.userData.vgOwn = true;
  matCache.set(key, m);
  return m;
}

/** 纯色材质（陶瓷、汤、纸…） */
function plain(color, { rough = 0.6, metal = 0, emissive, ei = 0, side, transparent, opacity, clearcoat = 0 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: metal, clearcoat });
  if (emissive) {
    m.emissive.set(emissive);
    m.emissiveIntensity = ei;
  }
  if (side) m.side = side;
  if (transparent) {
    m.transparent = true;
    m.opacity = opacity ?? 0.5;
    m.depthWrite = false;
  }
  return m;
}

/** 盒子：底面中心为原点，UV 用米（贴图比例是真的） */
function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, pos.getX(i), pos.getZ(i));
    else if (ax >= az) uv.setXY(i, pos.getZ(i), pos.getY(i));
    else uv.setXY(i, pos.getX(i), pos.getY(i));
  }
  return g;
}

/** 窗外：一张很亮的画（天 + 远处糊开的树），像室内摄影里过曝一点的窗 */
function backdropTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 640;
  const x = c.getContext('2d');
  const sky = {
    morning: ['#E4ECEF', '#F1F4F2', '#F6F5EF'],
    day: ['#E2EAEC', '#F1F2EE', '#F5F2EA'],
    evening: ['#F0D7B9', '#F8E3C6', '#FBEEDB'],
    dusk: ['#2E3A44', '#4A5157', '#8A7A68'],
    night: ['#121915', '#18211C', '#202A24'],
  }[kind] || ['#E2EAEC', '#F1F2EE', '#F5F2EA'];
  const g = x.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, sky[0]);
  g.addColorStop(0.55, sky[1]);
  g.addColorStop(1, sky[2]);
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  // 远处的树：糊开、很淡（像室内摄影里过曝的窗外）
  const dark = kind === 'night' || kind === 'dusk';
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.filter = 'blur(22px)';
  for (let i = 0; i < 40; i++) {
    const px = r() * c.width;
    const py = c.height * (0.55 + r() * 0.4);
    const rr = 50 + r() * 120;
    const a = 0.18 + r() * 0.22;
    x.fillStyle = dark ? `rgba(18,24,20,${0.5 + r() * 0.3})` : kind === 'evening' ? `rgba(${150 + r() * 30},${150 + r() * 25},${110 + r() * 20},${a})` : `rgba(${150 + r() * 30},${172 + r() * 25},${150 + r() * 20},${a})`;
    x.beginPath();
    x.ellipse(px, py, rr, rr * (0.7 + r() * 0.4), 0, 0, Math.PI * 2);
    x.fill();
  }
  x.filter = 'none';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ───────────────────────── 一个场景 ─────────────────────────

class Shot {
  constructor(id) {
    this.id = id;
    this.scene = new THREE.Scene();
    this.scene.environment = ENV;
    this.scene.environmentIntensity = 0.3;
    this.scene.background = new THREE.Color(0x101010);
    this.size = [1440, 1080];
    this.outs = OUT;
    this.camera = new THREE.PerspectiveCamera(44, 1440 / 1080, 0.05, 60);
    this.windows = [];
    this.lamps = [];
    this.spots = [];
    this.chips = null;
    this.sunCfg = null;
    this.skyCfg = { intensity: 1, color: '#EEF1EF' };
    this.exposure = 1;
    this.ao = 0.75;
    this.grade = { vignette: 0.16, warmth: 0 };
    this.disposables = [];
  }

  add(o) {
    this.scene.add(o);
    return o;
  }

  /** 放一件工作室的家具（kind / variant / w / d … 同 3D 工作室） */
  item(kind, o = {}) {
    const g = buildItem({ id: `${kind}-${Math.random()}`, kind, x: o.x || 0, z: o.z || 0, rot: o.rot || 0, ...o }, { wallH: o.wallH || this.H || 2.8, palette: o.palette });
    if (!g) throw new Error(`no item ${kind}`);
    if (o.y) g.position.y = o.y;
    if (o.s) g.scale.setScalar(o.s);
    return this.add(g);
  }

  mesh(geo, mat, [x = 0, y = 0, z = 0] = [], { rx = 0, ry = 0, rz = 0, cast = true, receive = true, s } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    if (s != null) typeof s === 'number' ? m.scale.setScalar(s) : m.scale.set(...s);
    m.castShadow = cast;
    m.receiveShadow = receive;
    return this.add(m);
  }

  box(w, h, d, mat, pos, o) {
    return this.mesh(boxGeo(w, h, d), mat, pos, o);
  }

  lathe(profile, mat, pos, o = {}, seg = 64) {
    const g = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      seg
    );
    return this.mesh(g, mat, pos, o);
  }

  /** 工作室的「表面」材质 */
  slots(map) {
    for (const [slot, id] of Object.entries(map)) lib.apply(slot, id);
  }

  /**
   * 房间：x ∈ [-w/2, w/2]，z ∈ [-d, 0]（相机在 z≈0 一侧），y ∈ [0, h]。
   * windows: [{ wall: 'left'|'right'|'back', a, b, y0, y1, mullions }] —— a..b 是沿墙的坐标（左右墙 = z，后墙 = x）
   */
  room({ w = 4.6, d = 4.2, h = 2.8, windows = [], outside = 'day', base = 0.09, baseColor = '#EFEBE3', ceiling = '#F4F1EB', frame = '#2A2826', sill = '#E9E4DA' } = {}) {
    this.W = w;
    this.D = d;
    this.H = h;
    const T = 0.14;
    const wallM = lib.slot('walls');
    const floorM = lib.slot('floor');
    // 地面
    this.box(w + 2 * T, 0.04, d + 2 * T, floorM, [0, -0.04, -d / 2]);
    // 天花板
    this.box(w + 2 * T, 0.1, d + 2 * T, plain(ceiling, { rough: 0.92, emissive: ceiling, ei: this.ceilingGlow ?? 0.12 }), [0, h, -d / 2]);
    // 墙：每面墙按窗洞切成几块
    const walls = {
      back: { u0: -w / 2 - T, u1: w / 2 + T, make: (u0, u1, y0, y1) => this.box(u1 - u0, y1 - y0, T, wallM, [(u0 + u1) / 2, y0, -d - T / 2]) },
      left: { u0: -d - T, u1: T, make: (u0, u1, y0, y1) => this.box(T, y1 - y0, u1 - u0, wallM, [-w / 2 - T / 2, y0, (u0 + u1) / 2]) },
      right: { u0: -d - T, u1: T, make: (u0, u1, y0, y1) => this.box(T, y1 - y0, u1 - u0, wallM, [w / 2 + T / 2, y0, (u0 + u1) / 2]) },
      front: { u0: -w / 2 - T, u1: w / 2 + T, make: (u0, u1, y0, y1) => this.box(u1 - u0, y1 - y0, T, wallM, [(u0 + u1) / 2, y0, T / 2]) },
    };
    for (const [name, wl] of Object.entries(walls)) {
      const ops = windows.filter((o) => o.wall === name).sort((p, q) => p.a - q.a);
      let u = wl.u0;
      for (const o of ops) {
        if (o.a > u) wl.make(u, o.a, 0, h);
        if (o.y0 > 0) wl.make(o.a, o.b, 0, o.y0);
        if (o.y1 < h) wl.make(o.a, o.b, o.y1, h);
        u = o.b;
      }
      if (u < wl.u1) wl.make(u, wl.u1, 0, h);
    }
    // 踢脚线
    const bm = plain(baseColor, { rough: 0.7 });
    this.box(w, base, 0.014, bm, [0, 0, -d + 0.007], { cast: false });
    this.box(0.014, base, d, bm, [-w / 2 + 0.007, 0, -d / 2], { cast: false });
    this.box(0.014, base, d, bm, [w / 2 - 0.007, 0, -d / 2], { cast: false });
    // 窗：细框 + 竖梃 + 窗台 + 很淡的玻璃 + 窗外的画
    const fm = plain(frame, { rough: 0.42, metal: 0.55 });
    const sm = plain(sill, { rough: 0.35, clearcoat: 0.3 });
    const gm = plain('#DDE6E9', { rough: 0.05, transparent: true, opacity: 0.07 });
    const bd = new THREE.MeshBasicMaterial({ map: backdropTexture(outside) });
    bd.color.setScalar(outside === 'night' || outside === 'dusk' ? 1 : outside === 'evening' ? 2.2 : 2.4);
    for (const o of windows) {
      const len = o.b - o.a;
      const hh = o.y1 - o.y0;
      const mid = (o.a + o.b) / 2;
      const fw = 0.045;
      const fd = 0.05;
      const n = o.mullions ?? Math.max(1, Math.round(len / 0.9) - 1);
      // 墙内表面的位置 + 往里的法线
      let place;
      if (o.wall === 'back') place = (u, y, inset, gw, gh, gd) => [u, y, -d - T / 2 + inset, gw, gh, gd];
      else if (o.wall === 'left') place = (u, y, inset, gw, gh, gd) => [-w / 2 - T / 2 + inset, y, u, gd, gh, gw];
      else place = (u, y, inset, gw, gh, gd) => [w / 2 + T / 2 - inset, y, u, gd, gh, gw];
      const putBox = (u, y, inset, gw, gh, gd, m, opt) => {
        const [x, yy, z, bw, bh, bdp] = place(u, y, inset, gw, gh, gd);
        return this.box(bw, bh, bdp, m, [x, yy, z], opt);
      };
      // 外框
      putBox(mid, o.y0, 0, len, fw, fd, fm);
      putBox(mid, o.y1 - fw, 0, len, fw, fd, fm);
      putBox(o.a + fw / 2, o.y0, 0, fw, hh, fd, fm);
      putBox(o.b - fw / 2, o.y0, 0, fw, hh, fd, fm);
      for (let i = 1; i <= n; i++) putBox(o.a + (len * i) / (n + 1), o.y0, 0, fw * 0.7, hh, fd * 0.8, fm);
      if (o.transom) putBox(mid, o.y0 + hh * o.transom, 0, len, fw * 0.7, fd * 0.8, fm);
      // 窗台（往室内伸出来一点）
      if (o.y0 > 0.05) putBox(mid, o.y0 - 0.03, T / 2 + 0.06, len + 0.08, 0.03, 0.12, sm);
      // 玻璃
      putBox(mid, o.y0, 0, len, hh, 0.006, gm, { cast: false, receive: false });
      // 窗外的画（离窗 5 米，够大）
      const dist = 5;
      const bwid = len + 2 * dist * 1.1;
      const bh = hh + 2 * dist * 0.9;
      const pg = new THREE.PlaneGeometry(bwid, bh);
      const pm = new THREE.Mesh(pg, bd);
      pm.castShadow = false;
      pm.receiveShadow = false;
      const cy = (o.y0 + o.y1) / 2 + 0.6;
      if (o.wall === 'back') {
        pm.position.set(mid, cy, -d - T - dist);
      } else if (o.wall === 'left') {
        pm.position.set(-w / 2 - T - dist, cy, mid);
        pm.rotation.y = Math.PI / 2;
      } else {
        pm.position.set(w / 2 + T + dist, cy, mid);
        pm.rotation.y = -Math.PI / 2;
      }
      this.add(pm);
      // 记下窗洞：天光从这里进来
      const nrm = o.wall === 'back' ? [0, 0, 1] : o.wall === 'left' ? [1, 0, 0] : [-1, 0, 0];
      this.windows.push({ ...o, nrm, inner: o.wall === 'back' ? -d : o.wall === 'left' ? -w / 2 : w / 2 });
    }
    return this;
  }

  /** 太阳：az = 从哪个方向来（度，0 = 从后墙那边（-z）、90 = 从左边（-x））、el = 高度角 */
  sun({ az = 90, el = 30, color = '#FFF2E0', intensity = 3, spread = 1.6 } = {}) {
    this.sunCfg = { az, el, color, intensity, spread };
  }

  /** 窗口的天光（每扇窗一块面光源，抖着画） */
  sky({ color = '#EEF1EF', intensity = 1 } = {}) {
    this.skyCfg = { color, intensity };
  }

  /** 室内的灯（夜里）：pos 灯泡位置，radius 抖动半径 */
  lamp({ pos, color = '#FFBB76', intensity = 3, radius = 0.05, distance = 0, shadow = true } = {}) {
    this.lamps.push({ pos, color, intensity, radius, distance, shadow });
  }

  /** 夜里的筒灯 / 射灯（朝下的聚光灯） */
  spot({ pos, target, color = '#FFE6C8', intensity = 6, angle = 0.9, penumbra = 1, shadow = true, radius = 0.03 } = {}) {
    this.spots.push({ pos, target, color, intensity, angle, penumbra, shadow, radius });
  }

  /** 去掉一件家具里的某些部件（家具按材质合并过：按材质挑） */
  prune(group, test) {
    const kill = [];
    group.traverse((o) => o.isMesh && test(o.material, o) && kill.push(o));
    kill.forEach((o) => o.parent.remove(o));
    return group;
  }

  /** 正面的平行投影（宝藏页的柜子小样：一格一格拼起来）：center = 画面中心，w × h = 画面框住的米数 */
  ortho({ center, w, h, px = 480, outs, tilt = 0 } = {}) {
    // 微微俯视（tilt 度）：看得到格子底板的上面一点点；正面那个长方形刚好占满画面
    const a = (tilt * Math.PI) / 180;
    h *= Math.cos(a);
    const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.05, 40);
    cam.position.set(center[0], center[1] + 6 * Math.sin(a), center[2] + 6 * Math.cos(a));
    cam.lookAt(new THREE.Vector3(...center));
    cam.updateMatrixWorld();
    this.camera = cam;
    const ph = Math.round((px * h) / w);
    this.size = [px * 2, ph * 2];
    this.outs = outs || [[px, ph, 'tile']];
    this.grade.vignette = 0;
  }

  look({ pos, target, fov = 44 } = {}) {
    if (!this.camera.isPerspectiveCamera) this.camera = new THREE.PerspectiveCamera(fov, this.size[0] / this.size[1], 0.05, 60);
    this.camera.aspect = this.size[0] / this.size[1];
    this.camera.position.set(...pos);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(new THREE.Vector3(...target));
    this.camera.updateMatrixWorld();
  }
}

// ───────────────────────── 画：抖 N 次平均 → AO → 色调映射 ─────────────────────────

const frameRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
const accRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false });
const aoRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false });
const addMat = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null }, k: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'uniform sampler2D tex; uniform float k; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tex, vUv).rgb * k, 1.0); }',
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  depthTest: false,
  depthWrite: false,
});
const addQuad = new FullScreenQuad(addMat);
const outPass = new OutputPass();
outPass.renderToScreen = true;

/** 色盘题：照片底部一排五个色片（像设计师摊在桌上的色卡） */
function drawChips(x, w, h, colors) {
  const n = colors.length;
  const k = w / 960;
  const R = 30 * k;
  const gap = 14 * k;
  const total = n * 2 * R + (n - 1) * gap;
  const y = h - 26 * k - R;
  let cx = (w - total) / 2 + R;
  x.save();
  // 一条很淡的纸色托底
  const pad = 14 * k;
  x.fillStyle = 'rgba(251,248,242,0.9)';
  x.shadowColor = 'rgba(30,24,16,0.22)';
  x.shadowBlur = 18 * k;
  x.shadowOffsetY = 4 * k;
  const bx = (w - total) / 2 - pad;
  const bw = total + 2 * pad;
  const bh = 2 * R + 2 * pad;
  const by = y - R - pad;
  x.beginPath();
  x.roundRect(bx, by, bw, bh, bh / 2);
  x.fill();
  x.shadowColor = 'transparent';
  for (const c of colors) {
    x.beginPath();
    x.arc(cx, y, R, 0, Math.PI * 2);
    x.fillStyle = c;
    x.fill();
    x.lineWidth = 1 * k;
    x.strokeStyle = 'rgba(36,33,29,0.12)';
    x.stroke();
    cx += 2 * R + gap;
  }
  x.restore();
}

async function texturesReady() {
  for (let i = 0; i < 400; i++) {
    const pending = lib.queue.length || [...lib.tex.values()].some((e) => !e.full && lib.inUse(e.key));
    if (!pending) return;
    await sleep(40);
  }
}

function disposeScene(scene) {
  scene.traverse((o) => {
    if (o.isMesh) {
      if (!o.geometry.userData?.cached) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (!m.userData?.slot && !m.userData?.fixed && !m.userData?.vgOwn && !m.userData?.own) m.dispose?.();
    }
    if (o.isLight && o.shadow?.map) o.shadow.map.dispose();
  });
}

async function shoot(id, { n = 32, preview = false } = {}) {
  const def = ALL[id];
  if (!def) throw new Error(`unknown set ${id}`);
  const t0 = performance.now();
  lib.setNight(0);
  const S = new Shot(id);
  def(S, { THREE, pbr, plain, lib });
  await texturesReady();
  const scene = S.scene;
  const cam = S.camera;
  if (S.size[0] !== W || S.size[1] !== H) {
    [W, H] = S.size;
    renderer.setSize(W, H);
    frameRT.setSize(W, H);
    accRT.setSize(W, H);
    aoRT.setSize(W, H);
  }
  renderer.toneMappingExposure = S.exposure;

  // 灯
  const hemi = new THREE.HemisphereLight(S.hemi?.sky || '#F3EFE8', S.hemi?.ground || '#8C7F70', S.hemi?.intensity ?? 0.35);
  scene.add(hemi);
  let sun = null;
  const center = new THREE.Vector3(0, 0.8, -(S.D || 4) / 2);
  if (S.sunCfg && S.sunCfg.intensity > 0) {
    sun = new THREE.DirectionalLight(S.sunCfg.color, S.sunCfg.intensity);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const R = Math.max(S.W || 5, S.D || 5) * 0.9 + 1;
    Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 0.5, far: 40 });
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.02;
    sun.target.position.copy(center);
    scene.add(sun, sun.target);
  }
  const winLights = (S.skyCfg.intensity > 0 ? S.windows : []).map((wdw) => {
    const l = new THREE.SpotLight(S.skyCfg.color, 0, 0, deg(78), 1, 2);
    l.castShadow = true;
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.camera.near = 0.05;
    l.shadow.camera.far = 14;
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.02;
    const area = (wdw.b - wdw.a) * (wdw.y1 - wdw.y0);
    l.userData.k = S.skyCfg.intensity * area * 2.2;
    scene.add(l, l.target);
    return l;
  });
  const lampLights = S.lamps.map((lp) => {
    const l = new THREE.PointLight(lp.color, lp.intensity, lp.distance, 2);
    l.castShadow = lp.shadow;
    l.shadow.mapSize.set(512, 512);
    l.shadow.bias = -0.002;
    l.shadow.radius = 2;
    scene.add(l);
    return l;
  });

  const spotLights = S.spots.map((sp) => {
    const l = new THREE.SpotLight(sp.color, sp.intensity, 0, sp.angle, sp.penumbra, 2);
    l.castShadow = sp.shadow;
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.camera.near = 0.05;
    l.shadow.camera.far = 12;
    l.shadow.bias = -0.0005;
    l.target.position.set(...sp.target);
    scene.add(l, l.target);
    l.target.updateMatrixWorld();
    return l;
  });

  const N = preview ? Math.min(n, 8) : n;
  renderer.setRenderTarget(accRT);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const h1 = halton(i + 1, 2);
    const h2 = halton(i + 1, 3);
    const h3 = halton(i + 1, 5);
    const h4 = halton(i + 1, 7);
    // 太阳：在一个小圆盘里抖
    if (sun) {
      const { az, el, spread } = S.sunCfg;
      const r = Math.sqrt(h1) * deg(spread);
      const a = h2 * Math.PI * 2;
      const A = deg(az) + r * Math.cos(a);
      const E = deg(el) + r * Math.sin(a);
      v.set(-Math.sin(A) * Math.cos(E), Math.sin(E), -Math.cos(A) * Math.cos(E));
      sun.position.copy(center).addScaledVector(v, 20);
      sun.target.updateMatrixWorld();
    }
    // 窗口的天光：窗洞上取一个点，朝室内
    winLights.forEach((l, k) => {
      const wdw = S.windows[k];
      const u = wdw.a + (wdw.b - wdw.a) * ((h3 + k * 0.37) % 1);
      const y = wdw.y0 + (wdw.y1 - wdw.y0) * ((h4 + k * 0.61) % 1);
      const off = 0.02;
      if (wdw.wall === 'back') l.position.set(u, y, wdw.inner + off);
      else if (wdw.wall === 'left') l.position.set(wdw.inner + off, y, u);
      else l.position.set(wdw.inner - off, y, u);
      l.target.position.set(l.position.x + wdw.nrm[0], l.position.y - 0.25, l.position.z + wdw.nrm[2]);
      l.target.updateMatrixWorld();
      l.intensity = l.userData.k;
    });
    // 夜里的灯：在灯罩里抖
    S.lamps.forEach((lp, k) => {
      const l = lampLights[k];
      const r = lp.radius * Math.sqrt(h1);
      const a = h2 * Math.PI * 2;
      l.position.set(lp.pos[0] + r * Math.cos(a), lp.pos[1] + (h3 - 0.5) * lp.radius, lp.pos[2] + r * Math.sin(a));
    });
    S.spots.forEach((sp, k) => {
      const l = spotLights[k];
      const r = sp.radius * Math.sqrt(h3);
      const a = h4 * Math.PI * 2;
      l.position.set(sp.pos[0] + r * Math.cos(a), sp.pos[1], sp.pos[2] + r * Math.sin(a));
    });
    // 相机抖半个像素
    cam.setViewOffset(W, H, h1 - 0.5, h2 - 0.5, W, H);
    renderer.setRenderTarget(frameRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, cam);
    addMat.uniforms.tex.value = frameRT.texture;
    addMat.uniforms.k.value = 1 / N;
    renderer.setRenderTarget(accRT);
    addQuad.render(renderer);
    if (i % 4 === 3) {
      log(`${id}: ${i + 1}/${N}`);
      await sleep(0);
    }
  }
  cam.clearViewOffset();

  // 接触阴影（GTAO）叠上去
  let src = accRT;
  if (S.ao > 0) {
    const gtao = new GTAOPass(scene, cam, W, H);
    gtao.updateGtaoMaterial({ radius: S.aoRadius ?? 0.28, distanceExponent: 1.3, thickness: 1, scale: 1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1.4, rings: 2, samples: 16 });
    gtao.blendIntensity = S.ao;
    gtao.renderToScreen = false;
    gtao.render(renderer, aoRT, accRT);
    gtao.dispose();
    src = aoRT;
  }
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  outPass.render(renderer, null, src);

  // 缩图 + 很轻的暗角
  const out = {};
  let prev = renderer.domElement;
  for (const [w, h, name] of S.outs) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(prev, 0, 0, w, h);
    if (prev === renderer.domElement && S.grade.vignette > 0) {
      const g = x.createRadialGradient(w / 2, h * 0.52, h * 0.38, w / 2, h * 0.52, h * 0.95);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(20,16,12,${S.grade.vignette})`);
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    }
    if (S.chips) drawChips(x, w, h, S.chips);
    out[name] = c.toDataURL('image/webp', S.quality ?? 0.86);
    prev = c;
  }
  disposeScene(scene);
  winLights.forEach((l) => l.shadow.map?.dispose());
  log(`${id}: done in ${Math.round(performance.now() - t0)} ms`);
  return { files: out, ms: Math.round(performance.now() - t0) };
}

/**
 * 别的离线场景表挂进来（案例库的种子图：src/cases/seed/render.html → VG.register(SCENES)）。
 * 同名的会盖掉；之后 VG.shoot(id) / VG.ids('all') 都认得。→ 挂进来的 id 列表
 */
function register(sets = {}) {
  Object.assign(ALL, sets);
  return Object.keys(sets);
}

window.VG = { shoot, register, ids: (kind = 'sets') => Object.keys(kind === 'tiles' ? TILES : kind === 'all' ? ALL : SETS), ready: true };
log(`ready · ${Object.keys(SETS).length} sets`);
