// 3D 引擎：渲染、相机、光（太阳 + 天光 IBL + 窗口天光 + 夜里的灯）、后期、拾取、拖动家具。
// 只在有变化时才渲染（省电，展厅 iPad 能撑一整天）。
//
// 画质（像产品渲染那样「贵」）：
// · 色调映射用 Khronos PBR Neutral —— 为产品渲染设计，材质的颜色几乎不偏（ACES 会把橙色推饱和、AgX 偏灰）；
// · 环境光 IBL：自己搭的「摄影棚 + 天穹」（顶上一块大柔光箱、两侧灯条、跟着时段变色的天空），
//   漆面 / 石材 / 金属 / 玻璃都有可信的反射；每半小时一档，缓存最近几档；
// · 太阳影子：按房子在光空间里收紧视锥（贴图密度最大）+ 更多 PCF 采样的柔边，按纹素自动算偏移（不脱影、不出麻点）；
// · 白天几扇大窗各放一块面光源（窗口的天光），夜里是灯具位置上的暖光（平方衰减、柔和）；
// · 'high'：多重采样 MSAA → GTAO 接触阴影 → 很淡的景深（微缩模型感）→ 只给灯的辉光 → 色调映射 + 暗角 + 抖动；
//   'fast'（iPad）：直接画到带 MSAA 的画布，不做 GTAO / 景深。
//
// 画质档来自设置（自动 / 高清 / 流畅）：自动 = 触屏（iPad / 手机）用 'fast'（大 iPad 也是：省电、不烫、不爆显存），电脑用 'high'。
// iPad 上的稳定性：贴图按显存预算淘汰（matlib）、截图限制像素、WebGL 上下文丢了会告诉界面并在恢复后重建；
// 演示模式（展厅电视）：自动环绕 + 一天的光影循环，~30 fps、像素比降一点，跑一整天也不烫。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { MatLib } from './matlib.js';
import { useLib, buildItem, CATALOG } from './furniture.js';
import { buildHouse, applyCutaway, SHADOW_LAYER } from './house.js';
import { daylight, LAMP } from './daylight.js';
import { Beams } from './beams.js';
import { MAT_BY_ID } from '../../shared/materials.js';
import { PALETTE } from '../../shared/palette.js';
import { ROOM_TYPES } from '../plan/model.js';
import { loadSettings } from '../store.js';

const VIEWS = {
  iso: { az: 32, el: 50 },
  iso2: { az: -36, el: 50 },
  back: { az: 150, el: 52 },
  top: { az: 0, el: 88 },
  low: { az: 22, el: 30 },
  demo: { az: 32, el: 42 },
};

const ANCHOR_SLOTS = ['upholstery', 'feature', 'walls', 'floor', 'bedding', 'cabinetry'];

/** 每一档画质用到的资源（换档时全部按这张表重建） */
const QUALITY = {
  high: { pr: 2, shadow: 4096, env: 256, bg: 1024, lights: 10, taps: 16, pcfMax: 10, rect: true, snapLong: 3200 },
  fast: { pr: 1.5, shadow: 2048, env: 128, bg: 512, lights: 5, taps: 8, pcfMax: 6, rect: false, snapLong: 2560 },
};

const DEMO_FPS = 30;
const DEMO_ORBIT = 0.4; // OrbitControls.autoRotateSpeed：一圈约 150 秒

/** 设置里的画质（'auto' / 没存 = 自动）→ 实际档位 */
export function resolveQuality(q) {
  if (q === 'high' || q === 'fast') return q;
  try {
    return matchMedia('(pointer: coarse)').matches ? 'fast' : 'high';
  } catch {
    return 'high';
  }
}

function savedQuality() {
  try {
    return loadSettings()?.quality;
  } catch {
    return undefined;
  }
}

/** 是不是户外（阳台 / 车廊）：不放吸顶灯、不算「室内」 */
const isOutdoor = (type) => ROOM_TYPES[type]?.outdoor ?? type === 'balcony';

let RECT_READY = false;
function initRectLights() {
  if (RECT_READY) return;
  RectAreaLightUniformsLib.init();
  RECT_READY = true;
}

export class Engine {
  constructor(container, cb = {}) {
    this.cb = cb;
    this.container = container;
    this.qualityPref = cb.quality ?? savedQuality() ?? 'auto';
    this.quality = resolveQuality(this.qualityPref);
    const QP = QUALITY[this.quality];
    patchSoftShadows(QP.taps);
    this.demo = false;
    this._prOverride = 0;

    // 'high' 的抗锯齿在后期链里做（多重采样的渲染目标），画布本身就不必再开 MSAA（省显存）。
    // （画布的 MSAA 建好就改不了：之后换档也没关系 —— 'fast' 没有画布 MSAA 时，后期链里用多重采样的渲染目标补上）
    this.nativeAA = this.quality !== 'high';
    const r = new THREE.WebGLRenderer({ antialias: this.nativeAA, powerPreference: 'high-performance' });
    this.renderer = r;
    r.setPixelRatio(this.targetPR());
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.domElement.className = 'studio-canvas';
    container.appendChild(r.domElement);

    // WebGL 上下文丢失（iPad 显存吃紧、在后台太久被系统回收）：停画、告诉界面；恢复后把 GPU 上画出来的东西重建。
    // （three 自己的监听器先注册，所以这里跑的时候它已经重新初始化好了）
    this.contextLost = false;
    this._onLost = (ev) => {
      ev.preventDefault();
      this.contextLost = true;
      this.running = false;
      cancelAnimationFrame(this._raf);
      this.cb.onContextLost?.();
    };
    this._onRestored = () => {
      this.contextLost = false;
      this.restoreGPU();
      this.cb.onContextRestored?.();
    };
    r.domElement.addEventListener('webglcontextlost', this._onLost, false);
    r.domElement.addEventListener('webglcontextrestored', this._onRestored, false);

    this.scene = new THREE.Scene();
    this.env = new EnvStudio(r, QP.env);
    this.scene.environmentIntensity = 1;
    this.rectOK = QP.rect;
    if (this.rectOK) initRectLights();

    this.buildBackdrop(QP.bg);

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 400);
    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: 1.36, minPolarAngle: 0.02, rotateSpeed: 0.55, zoomSpeed: 0.8, screenSpacePanning: false });
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.controls.addEventListener('start', () => this.cb.onInteract?.());

    // 颜色都会被 setTime() 按时段改掉，这里只是初值
    this.sun = new THREE.DirectionalLight(new THREE.Color(1, 1, 1), 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(QP.shadow, QP.shadow);
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.012;
    this.sun.shadow.radius = 3;
    this.sun.shadow.camera.layers.enable(SHADOW_LAYER);
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(new THREE.Color(1, 1, 1), new THREE.Color(0.27, 0.27, 0.27), 0.2);
    this.scene.add(this.hemi);

    this.lib = new MatLib(r, this.quality);
    useLib(this.lib);
    this.root = new THREE.Group();
    this.furn = new THREE.Group();
    this.scene.add(this.root, this.furn);
    this.beams = new Beams();
    this.scene.add(this.beams.group);
    this.roomLights = [];
    this.windowLights = [];
    this.items = new Map();
    this.itemData = new Map();
    this.pickables = [];
    this.wallMode = 'cut';
    this.time = 18.4;
    this.anchors = {};
    // 选中 = SAIL 浅金的地面光圈；悬停 = 纸白、更淡
    this.selBox = makeRing(PALETTE.goldL, 0.95);
    this.hovBox = makeRing(PALETTE.card, 0.5);
    this.scene.add(this.selBox, this.hovBox);

    this.setupComposer();
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.bindEvents();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.dirty = true;
    this.running = true;
    this._lastT = 0;
    this.loop = this.loop.bind(this);
    this._raf = requestAnimationFrame(this.loop);
  }

  /** 现在该用的像素比：画质档的上限 × 设备；截图时临时调高；演示模式降一点（长边约 1920 像素就够电视看） */
  targetPR() {
    if (this._prOverride) return this._prOverride;
    const base = Math.min(QUALITY[this.quality].pr, devicePixelRatio || 1);
    if (!this.demo) return base;
    const long = Math.max(this.container.clientWidth, this.container.clientHeight) || 1;
    return Math.max(Math.min(0.75, base), Math.min(base, 1920 / long));
  }

  applyPixelRatio() {
    const pr = this.targetPR();
    if (Math.abs(this.renderer.getPixelRatio() - pr) < 1e-3) return false;
    this.renderer.setPixelRatio(pr);
    return true;
  }

  /** 背景（虚化的室内照片）的画布：按画质档的分辨率 */
  buildBackdrop(w) {
    const old = this.bgTex;
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = w;
    this.bgCanvas.height = w / 2;
    this.bgLayers = makeBackdropLayers(w, w / 2);
    this.bgTex = new THREE.CanvasTexture(this.bgCanvas);
    this.bgTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.bgTex;
    old?.dispose();
    if (this.day) {
      drawBackdrop(this.bgCanvas, this.bgLayers, this.day);
      this.bgTex.needsUpdate = true;
    }
  }

  /** WebGL 上下文恢复之后：贴图 / 几何 / 着色器 / 渲染目标 three 会按需重新上传；
   *  GPU 上「画」出来的环境贴图（PMREM）内容没了，要重画；然后接着跑。 */
  restoreGPU() {
    this.env.reset();
    this.envKey = null;
    this.scene.environment = null;
    if (this.plan) this.setTime(this.time);
    this.lib.upgraded = true;
    this.lastCut = null;
    this._lastAnchors = null;
    this.dirty = true;
    this.running = true;
    this._lastT = 0;
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(this.loop);
  }

  setupComposer() {
    if (this.composer) {
      for (const p of this.composer.passes) p.dispose?.();
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    this.composer = this.gtao = this.bloom = this.dof = this.output = null;
    const full = this.quality === 'high';
    // iPad（'fast'）且画布自带 MSAA：直接画，最省
    if (!full && this.nativeAA) return;
    const r = this.renderer;
    const pr = r.getPixelRatio();
    const size = r.getSize(new THREE.Vector2());
    const W = Math.max(1, Math.round(size.x * pr));
    const H = Math.max(1, Math.round(size.y * pr));
    const composer = new EffectComposer(r, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType }));
    // 视网膜屏像素已经很密：2× MSAA 就够干净；普通屏 4×
    const big = W * H > 2.6e6;
    const samples = Math.min(r.capabilities.maxSamples || 4, big ? 2 : 4);
    composer.addPass(new MSAARenderPass(this.scene, this.camera, samples));
    if (full) {
      // 接触阴影：大屏用半分辨率算（降噪后看不出来），省一半
      const scale = big ? 0.5 : 1;
      const gtao = new GTAOPass(this.scene, this.camera, Math.round(W * scale), Math.round(H * scale));
      const gSet = gtao.setSize.bind(gtao);
      gtao.setSize = (w, h) => gSet(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
      gtao.updateGtaoMaterial({ radius: 0.32, distanceExponent: 1.4, thickness: 0.9, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1.4, rings: 2, samples: 16 });
      gtao.blendIntensity = 0.82;
      // 光柱、地上的金线、选框不参与环境光遮蔽（否则会在它们周围出黑边）
      const ov = gtao._overrideVisibility.bind(gtao);
      gtao._overrideVisibility = () => {
        ov();
        this.scene.traverse((o) => {
          if (o.userData.noAO && o.visible) {
            o.visible = false;
            gtao._visibilityCache.push(o);
          }
        });
      };
      composer.addPass(gtao);
      this.gtao = gtao;
      this.dof = new DOFPass(gtao.depthTexture, this.camera);
      composer.addPass(this.dof);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.2, 0.45, 1.1);
      composer.addPass(this.bloom);
    }
    this.output = makeOutputPass(full ? 0.2 : 0);
    composer.addPass(this.output);
    this.composer = composer;
    if (this.day) this.applyPost(this.day);
  }

  /**
   * 换画质档：'high' | 'fast' | 'auto'（= 触屏 fast、电脑 high）。按 QUALITY 表把每样跟画质有关的东西重建：
   * 像素比、阴影贴图尺寸 + 软阴影采样数、环境贴图尺寸、窗口面光源、夜灯数量、背景分辨率、材质贴图分辨率 / 各向异性、后期链。
   * （环境贴图尺寸跟着档位变 → 所有受光材质的着色器键都变了 → 自动用新的软阴影采样数重新编译）
   */
  setQuality(q) {
    this.qualityPref = q;
    const nq = resolveQuality(q);
    if (nq === this.quality) return;
    this.quality = nq;
    const QP = QUALITY[nq];
    patchSoftShadows(QP.taps);
    this.applyPixelRatio();
    this.sun.shadow.mapSize.set(QP.shadow, QP.shadow);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.env.setSize(QP.env);
    this.envKey = null;
    this.rectOK = QP.rect;
    if (this.rectOK) initRectLights();
    if (this.house) this.setupWindowLights(this.house.windows);
    if (this.rooms) {
      this.setupRoomLights(this.rooms, this.wallH);
      this.placeRoomLights();
    }
    this.buildBackdrop(QP.bg);
    this.lib.setQuality(nq);
    this.setupComposer();
    this.resize();
    if (this.day) this.setTime(this.time);
    this.dirty = true;
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.applyPixelRatio();
    this.renderer.setSize(w, h);
    if (this.composer) {
      const pr = this.renderer.getPixelRatio();
      if (this.composer._pixelRatio !== pr) this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      if (this.dof) this.dof.setPixelRatio(pr);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  // ───────────────────────── 场景 ─────────────────────────

  /** 整个场景重建（换平面图时） */
  setScene({ plan, walls, furniture, materials, time, title, subtitle, frame = true }) {
    this.disposeRoot();
    this.plan = plan;
    this.lib.applyAll(materials);
    const house = buildHouse(plan, walls, this.lib, { title, subtitle });
    this.house = house;
    this.root.add(house.group);
    this.beams.setWindows(house.windows);
    this.setupRoomLights(house.rooms, house.wallH);
    this.setupWindowLights(house.windows);
    this.fitShadow(house.bounds);
    this.setFurniture(furniture);
    this.setTime(time ?? this.time);
    if (frame) this.frame('iso', false);
    this.lastCut = null;
    this.dirty = true;
  }

  disposeRoot() {
    this.root.traverse((o) => {
      if ((o.isMesh || o.isLine) && o.geometry && !o.geometry.userData?.cached) o.geometry.dispose();
      // 底座上的字是每次新建的材质 / 贴图
      if (o.isMesh && o.userData.ownMaterial) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    this.root.clear();
    for (const l of this.roomLights) this.scene.remove(l);
    this.roomLights = [];
    for (const l of this.windowLights) this.scene.remove(l);
    this.windowLights = [];
  }

  /** 夜里的灯：固定数量的点光源池（数量不变 → 换家具不会让所有材质重新编译），位置跟着灯具走 */
  setupRoomLights(rooms, H) {
    for (const l of this.roomLights) this.scene.remove(l);
    this.roomLights = [];
    this.rooms = rooms;
    this.wallH = H;
    const n = QUALITY[this.quality].lights;
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(LAMP.pool, 0, 5, 2);
      l.userData.base = 0;
      this.scene.add(l);
      this.roomLights.push(l);
    }
  }

  /** 把灯池放到：每个房间里最高的那盏灯（落地灯 / 吊灯优先）→ 没有灯的房间放一盏吸顶的柔光 → 剩下的灯具 */
  placeRoomLights() {
    if (!this.roomLights.length || !this.rooms) return;
    const bulbMat = this.lib.fixed.bulb;
    const bulbs = [];
    this.furn.updateMatrixWorld(true);
    this.furn.traverse((o) => {
      if (o.isMesh && o.material === bulbMat && isVisible(o)) bulbs.push({ pos: o.getWorldPosition(new THREE.Vector3()), used: false });
    });
    const H = this.wallH || 2.8;
    const lamp = (b) => {
      b.used = true;
      const tall = b.pos.y > 1.2;
      return { pos: b.pos.clone().setY(b.pos.y - 0.04), base: tall ? 2.6 : 1.25, dist: tall ? 5.5 : 3.2, color: LAMP.lamp };
    };
    const inRoom = (r, q) => Math.abs(q.x - r.x) <= r.w / 2 + 0.05 && Math.abs(q.z - r.z) <= r.d / 2 + 0.05;
    const list = [];
    // 户外（阳台、车廊 / 前院）没有天花板，不放吸顶的柔光
    const rooms = [...this.rooms].filter((r) => !isOutdoor(r.type)).sort((a, b) => b.area - a.area);
    for (const r of rooms) {
      const mine = bulbs.filter((b) => !b.used && inRoom(r, b.pos)).sort((a, b) => b.pos.y - a.pos.y);
      if (mine[0]) list.push(lamp(mine[0]));
      else list.push({ pos: new THREE.Vector3(r.x, H - 0.3, r.z), base: 1.1 + Math.min(r.area, 30) * 0.05, dist: Math.max(r.w, r.d) * 1.1 + 1.2, color: LAMP.ceiling });
    }
    for (const b of bulbs.filter((b) => !b.used).sort((a, b) => b.pos.y - a.pos.y)) list.push(lamp(b));
    this.roomLights.forEach((l, i) => {
      const s = list[i];
      if (!s) {
        l.userData.base = 0;
        l.intensity = 0;
        return;
      }
      l.position.copy(s.pos);
      l.distance = s.dist;
      l.color.set(s.color);
      l.userData.base = s.base;
      l.intensity = s.base * (this.day?.lamps ?? 0);
    });
  }

  /** 白天：最大的几扇外窗各放一块面光源，朝屋里打「窗口的天光」（只在 'high'） */
  setupWindowLights(windows) {
    for (const l of this.windowLights) this.scene.remove(l);
    this.windowLights = [];
    if (!this.rectOK) return;
    const N = 4;
    const area = (w) => w.a.distanceTo(w.b) * (w.head - w.sill);
    const big = [...windows].sort((a, b) => area(b) - area(a)).slice(0, N);
    for (let i = 0; i < N; i++) {
      const w = big[i];
      const l = new THREE.RectAreaLight(new THREE.Color(1, 1, 1), 0, 1, 1);
      l.userData.k = 0;
      if (w) {
        const mid = w.a.clone().add(w.b).multiplyScalar(0.5);
        mid.y = (w.sill + w.head) / 2;
        mid.addScaledVector(w.inward, 0.08);
        l.position.copy(mid);
        l.width = Math.max(0.3, w.a.distanceTo(w.b) - 0.1);
        l.height = Math.max(0.3, w.head - w.sill - 0.1);
        l.lookAt(mid.clone().add(w.inward));
        l.userData.k = 1;
      } else l.position.set(0, -50, 0);
      this.scene.add(l);
      this.windowLights.push(l);
    }
  }

  fitShadow(bb) {
    this.center = new THREE.Vector3(bb.cx, 0, bb.cy);
    this.radius = Math.hypot(bb.w, bb.d) / 2;
    this.sun.target.position.copy(this.center);
    // 投影的东西：房子 + 底座 + 窗外看不见的树（只在影子层）
    const H = (this.house?.wallH || 2.8) + 0.2;
    const pts = [];
    for (const x of [bb.x0 - 0.4, bb.x1 + 0.4]) for (const z of [bb.y0 - 0.4, bb.y1 + 0.4]) for (const y of [-0.7, H]) pts.push(new THREE.Vector3(x, y, z));
    const tb = new THREE.Box3();
    if (this.house?.trees) {
      this.house.trees.updateMatrixWorld(true);
      tb.setFromObject(this.house.trees);
    }
    if (!tb.isEmpty()) for (const x of [tb.min.x, tb.max.x]) for (const z of [tb.min.z, tb.max.z]) for (const y of [tb.min.y, tb.max.y]) pts.push(new THREE.Vector3(x, y, z));
    this.shadowPts = pts;
    // 只用来定深度范围的接收面（地面）
    const R = this.radius * 2.6 + 2;
    this.shadowRecv = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.Vector3(bb.cx + sx * R, -0.7, bb.cy + sz * R)));
  }

  /** 每次太阳动：在光空间里把影子相机收紧到「投影物」的包围盒 → 纹素最小；PCF 半径和偏移按纹素换算成固定的世界尺寸 */
  fitShadowToSun() {
    if (!this.shadowPts) return;
    const cam = (this._lightCam ||= new THREE.OrthographicCamera());
    cam.position.copy(this.sun.position);
    cam.lookAt(this.sun.target.position);
    cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const v = new THREE.Vector3();
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let n = Infinity;
    let f = -Infinity;
    for (const p of this.shadowPts) {
      v.copy(p).applyMatrix4(inv);
      x0 = Math.min(x0, v.x);
      x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y);
      y1 = Math.max(y1, v.y);
      n = Math.min(n, -v.z);
      f = Math.max(f, -v.z);
    }
    for (const p of this.shadowRecv) f = Math.max(f, -v.copy(p).applyMatrix4(inv).z);
    const pad = 0.4;
    const s = this.sun.shadow.camera;
    s.left = x0 - pad;
    s.right = x1 + pad;
    s.bottom = y0 - pad;
    s.top = y1 + pad;
    s.near = Math.max(0.1, n - 1);
    s.far = f + 1;
    s.updateProjectionMatrix();
    const texel = Math.max(s.right - s.left, s.top - s.bottom) / this.sun.shadow.mapSize.x;
    // 半影 ~2.6cm（比真实太阳略软一点，像柔光的产品照），最多 10 个纹素（'fast' 采样少，最多 6 个，不出颗粒）
    const radius = Math.min(QUALITY[this.quality].pcfMax, Math.max(1.5, 0.026 / texel));
    this.sun.shadow.radius = radius;
    this.sun.shadow.normalBias = texel * (1.1 + radius * 0.45);
    this.sun.shadow.bias = -0.00008;
  }

  /** 家具：按 id 增量更新（只重建变了的那件） */
  setFurniture(items) {
    const ctx = { wallH: this.plan?.wallH || 2.8 };
    const keep = new Set();
    for (const it of items) {
      keep.add(it.id);
      const prev = this.itemData.get(it.id);
      const same = prev && JSON.stringify({ ...prev, x: 0, z: 0, rot: 0 }) === JSON.stringify({ ...it, x: 0, z: 0, rot: 0 });
      if (same) {
        const g = this.items.get(it.id);
        g.position.set(it.x, it.y || 0, it.z);
        g.rotation.y = ((it.rot || 0) * Math.PI) / 180;
      } else {
        if (this.items.has(it.id)) this.furn.remove(this.items.get(it.id));
        const g = buildItem(it, ctx);
        if (!g) continue;
        if (CATALOG[it.kind]?.ceiling) g.position.y = 0;
        this.items.set(it.id, g);
        this.furn.add(g);
      }
      this.itemData.set(it.id, it);
    }
    for (const id of [...this.items.keys()])
      if (!keep.has(id)) {
        this.furn.remove(this.items.get(id));
        this.items.delete(id);
        this.itemData.delete(id);
      }
    this.refreshFeatureMode();
    this.collectPickables();
    this.computeAnchors();
    this.placeRoomLights();
    if (this.selected && !this.items.has(this.selected)) this.select(null);
    this.updateSelBox();
    this.dirty = true;
  }

  refreshFeatureMode() {
    const cat = MAT_BY_ID[this.lib.current.feature]?.cat;
    const slats = cat === 'wood';
    this.furn.traverse((o) => {
      if (o.userData.featureMode) o.visible = (o.userData.featureMode === 'slats') === slats;
    });
  }

  collectPickables() {
    const list = [];
    const add = (o) => {
      if (o.isMesh && o.visible !== false) list.push(o);
    };
    this.root.traverse(add);
    this.furn.traverse(add);
    this.pickables = list;
  }

  setMaterials(materials) {
    this.lib.applyAll(materials);
    this.refreshFeatureMode();
    this.dirty = true;
  }

  setMaterial(slot, matId) {
    this.lib.apply(slot, matId);
    if (slot === 'feature') this.refreshFeatureMode();
    this.dirty = true;
  }

  setTime(hour) {
    this.time = hour;
    const d = daylight(hour, this.plan?.north || 0);
    this.day = d;
    const c = this.center || new THREE.Vector3();
    const R = (this.radius || 8) + 14;
    this.sun.position.set(c.x + d.dir[0] * R, d.dir[1] * R, c.z + d.dir[2] * R);
    this.sun.color.set(d.sunColor);
    this.sun.intensity = d.sunIntensity;
    this.fitShadowToSun();
    this.hemi.color.set(d.hemiSky);
    this.hemi.groundColor.set(d.hemiGround);
    this.hemi.intensity = d.hemiIntensity;
    this.renderer.toneMappingExposure = d.exposure;
    // IBL：同一档（半小时）只建一次（上下文丢失时先不建，恢复后 restoreGPU 会重画）
    if (!this.contextLost && (this.envKey !== d.envKey || !this.scene.environment)) {
      this.scene.environment = this.env.get(d);
      this.envKey = d.envKey;
    }
    this.scene.environmentIntensity = d.envIntensity;
    for (const l of this.roomLights) l.intensity = l.userData.base * d.lamps;
    const wc = new THREE.Color(d.windowColor);
    for (const l of this.windowLights) {
      l.color.copy(wc);
      l.intensity = l.userData.k * d.windowLight * 2.4;
    }
    this.lib.setNight(d.lamps);
    this.applyPost(d);
    this.beams.update(d.dir, d.beams, d.sunColor);
    drawBackdrop(this.bgCanvas, this.bgLayers, d);
    this.bgTex.needsUpdate = true;
    this.dirty = true;
  }

  /** 后期参数跟着时段：白天几乎没有辉光，只有夜里的灯会发光 */
  applyPost(d) {
    if (this.bloom) {
      this.bloom.strength = 0.04 + 0.32 * d.lamps;
      this.bloom.threshold = 1.15 - 0.2 * d.night;
      this.bloom.radius = 0.42;
    }
    if (this.output) this.output.uniforms.uVignette.value = this.quality === 'high' ? 0.18 + 0.1 * d.night : 0;
  }

  setWallMode(mode) {
    this.wallMode = mode;
    this.lastCut = null;
    this.dirty = true;
  }

  // ───────────────────────── 相机 ─────────────────────────

  frame(view = 'iso', animate = true) {
    const v = VIEWS[view] || VIEWS.iso;
    const c = this.center || new THREE.Vector3();
    const vf = THREE.MathUtils.degToRad(this.camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * this.camera.aspect);
    const wide = this.container.clientWidth > 900;
    const dist = ((this.radius || 8) / Math.sin(Math.min(vf, hf) / 2)) * (wide ? 1.42 : 1.12);
    const az = THREE.MathUtils.degToRad(v.az);
    const el = THREE.MathUtils.degToRad(v.el);
    const target = c.clone().add(new THREE.Vector3(0, -0.2, 0));
    const pos = target.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist));
    this.controls.minDistance = (this.radius || 8) * 0.35;
    this.controls.maxDistance = dist * 2.2;
    if (!animate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.dirty = true;
      return;
    }
    this.tween = { t0: performance.now(), dur: 900, fromP: this.camera.position.clone(), fromT: this.controls.target.clone(), toP: pos, toT: target };
  }

  setAutoRotate(on) {
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = 0.7;
    this.dirty = true;
  }

  // ───────────────────────── 拾取 ─────────────────────────

  rayAt(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster;
  }

  hitAt(clientX, clientY) {
    const hits = this.rayAt(clientX, clientY).intersectObjects(this.pickables, false);
    for (const h of hits) {
      const o = h.object;
      const mat = Array.isArray(o.material) ? o.material[h.face?.materialIndex ?? 0] : o.material;
      if (mat?.userData?.fixed === 'glass' || mat?.transparent && mat.opacity < 0.3) continue;
      if (!o.visible || !isVisible(o)) continue;
      return { object: o, point: h.point, material: mat };
    }
    return null;
  }

  /** 屏幕上这一点是哪个「表面」 */
  slotAt(clientX, clientY) {
    const h = this.hitAt(clientX, clientY);
    if (!h) return null;
    return h.material?.userData?.slot || h.object.userData.slot || null;
  }

  itemAt(clientX, clientY) {
    const h = this.hitAt(clientX, clientY);
    return h?.object.userData.itemId || null;
  }

  highlightSlot(slot) {
    this.lib.highlight(slot);
    this.dirty = true;
  }

  select(id) {
    this.selected = id;
    this.updateSelBox();
    this.cb.onSelect?.(id);
    this.dirty = true;
  }

  updateSelBox() {
    const g = this.selected && this.items.get(this.selected);
    this.selBox.visible = !!g;
    if (g) fitRing(this.selBox, g);
  }

  /**
   * 指针（鼠标 / 手指 / Apple Pencil）：
   * · 按在家具上拖 = 搬家具；只关掉 OrbitControls 的「转镜头」（enableRotate），它仍在数手指 →
   *   第二根手指落下就是双指缩放 / 平移，拖到一半的家具放回原位；
   * · 只认按下的那一根指针（pointerId），别的手指不会把拖动「接走」；
   * · pointercancel（系统手势、来电、掌心误触）/ 切走窗口 = 取消，家具回原位，不会卡在「拖动中」。
   */
  bindEvents() {
    const el = this.renderer.domElement;
    const ctl = this.controls;
    let down = null;
    let hoverRaf = 0;
    const release = () => {
      ctl.enableRotate = true;
    };
    /** 拖动被打断：家具回到原位（以 itemData 为准），不算移动 */
    const cancelDrag = () => {
      const d = down;
      down = null;
      release();
      if (!d?.moved || !d.id) return;
      const g = this.items.get(d.id);
      const it = this.itemData.get(d.id);
      if (g && it) {
        g.position.x = it.x;
        g.position.z = it.z;
      }
      this.updateSelBox();
      this.dirty = true;
      this.cb.onDragCancel?.(d.id);
    };
    const onDown = (e) => {
      if (down) {
        // 第二根手指（或另一支笔）：交给 OrbitControls 做双指缩放 / 平移
        if (e.pointerId !== down.pointerId) cancelDrag();
        return;
      }
      if (e.isPrimary === false || (e.button !== undefined && e.button !== 0)) return;
      // 演示模式：只看不改（不选、不拖）
      if (this.demo) return;
      const id = this.itemAt(e.clientX, e.clientY);
      down = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, id, moved: false, t: performance.now() };
      const it = id && this.itemData.get(id);
      if (it && CATALOG[it.kind] && !CATALOG[it.kind].wall) {
        const g = this.items.get(id);
        const p = new THREE.Vector3();
        const hit = this.rayAt(e.clientX, e.clientY).ray.intersectPlane(this.dragPlane, p);
        down.offset = hit && g ? g.position.clone().sub(p) : new THREE.Vector3();
        down.draggable = !!g;
        if (g) ctl.enableRotate = false;
      }
    };
    const onMove = (e) => {
      if (down) {
        if (e.pointerId !== down.pointerId || !down.draggable) return;
        const dx = e.clientX - down.x;
        const dy = e.clientY - down.y;
        if (!down.moved && Math.hypot(dx, dy) > (e.pointerType === 'mouse' ? 5 : 9)) {
          down.moved = true;
          this.select(down.id);
          this.cb.onDragStart?.(down.id);
        }
        if (down.moved) {
          const p = new THREE.Vector3();
          const g = this.items.get(down.id);
          if (g && this.rayAt(e.clientX, e.clientY).ray.intersectPlane(this.dragPlane, p)) {
            const bb = this.house?.bounds;
            let x = Math.round((p.x + down.offset.x) * 20) / 20;
            let z = Math.round((p.z + down.offset.z) * 20) / 20;
            if (bb) {
              x = Math.max(bb.x0, Math.min(bb.x1, x));
              z = Math.max(bb.y0, Math.min(bb.y1, z));
            }
            g.position.x = x;
            g.position.z = z;
            this.updateSelBox();
            this.dirty = true;
          }
        }
        return;
      }
      if (e.buttons || e.pointerType === 'touch' || this.demo) return;
      cancelAnimationFrame(hoverRaf);
      hoverRaf = requestAnimationFrame(() => {
        const id = this.itemAt(e.clientX, e.clientY);
        if (id !== this.hovered) {
          this.hovered = id;
          const g = id && this.items.get(id);
          this.hovBox.visible = !!g && id !== this.selected;
          if (g) fitRing(this.hovBox, g);
          this.dirty = true;
        }
        this.cb.onHover?.(id ? { id, item: this.itemData.get(id), x: e.clientX, y: e.clientY } : null);
        el.style.cursor = id ? 'grab' : '';
      });
    };
    const onUp = (e) => {
      if (!down || e.pointerId !== down.pointerId) return;
      const d = down;
      down = null;
      release();
      if (d.moved && d.id) {
        const g = this.items.get(d.id);
        if (g) this.cb.onMove?.(d.id, g.position.x, g.position.z);
        return;
      }
      const tap = Math.hypot(e.clientX - d.x, e.clientY - d.y) < (e.pointerType === 'mouse' ? 6 : 12) && performance.now() - d.t < 600;
      if (tap) this.select(d.id || null);
    };
    const onCancel = (e) => {
      if (down && e.pointerId === down.pointerId) cancelDrag();
    };
    const onAway = () => {
      if (down) cancelDrag();
    };
    const onLeave = () => {
      this.cb.onHover?.(null);
      if (this.hovered) {
        this.hovered = null;
        this.hovBox.visible = false;
        this.dirty = true;
      }
    };
    const onVis = () => {
      if (document.hidden) onAway();
    };
    // capture：比 OrbitControls 先拿到事件，按住家具时不转镜头
    this.container.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onAway);
    document.addEventListener('visibilitychange', onVis);
    el.addEventListener('pointerleave', onLeave);
    this._unbind = () => {
      cancelAnimationFrame(hoverRaf);
      this.container.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onAway);
      document.removeEventListener('visibilitychange', onVis);
      el.removeEventListener('pointerleave', onLeave);
    };
  }

  // ───────────────────────── 标签锚点 ─────────────────────────

  computeAnchors() {
    const A = {};
    const kindPoint = (kind, y) => {
      for (const [id, it] of this.itemData) if (it.kind === kind) return new THREE.Vector3(it.x, y, it.z);
      return null;
    };
    A.upholstery = kindPoint('sofa', 0.62) || kindPoint('armchair', 0.6);
    A.feature = kindPoint('tvWall', 1.9) || kindPoint('featureWall', 1.6);
    A.bedding = kindPoint('bed', 0.62) || kindPoint('kidsBed', 0.6);
    A.cabinetry = kindPoint('wardrobe', 1.9) || kindPoint('kitchenRun', 1.8) || kindPoint('shoeCabinet', 1.8);
    const liv = this.plan?.rooms.find((r) => r.type === 'living') || this.plan?.rooms[0];
    if (liv) A.floor = new THREE.Vector3(liv.x + liv.w * 0.3, 0.02, liv.y + liv.d * 0.75);
    // 墙：离默认镜头最远的一面外墙
    let best = null;
    let bestD = Infinity;
    const camDir = new THREE.Vector3(Math.sin(0.56), 0, Math.cos(0.56));
    for (const s of this.house?.wallSets || []) {
      if (!s.outward) continue;
      const w = s.wall;
      const d = s.outward.dot(camDir);
      if (d < bestD - 0.01 || (Math.abs(d - bestD) < 0.01 && w.b - w.a > (best?.b - best?.a || 0))) {
        bestD = d;
        best = w;
      }
    }
    if (best) {
      const m = (best.a + best.b) / 2;
      A.walls = best.axis === 'x' ? new THREE.Vector3(m, 2.0, best.c) : new THREE.Vector3(best.c, 2.0, m);
    }
    this.anchors = A;
    this.anchorsDirty = true;
  }

  /** 标签的屏幕位置：都没动（< 0.5px、可见性不变）就不打扰 React */
  emitAnchors() {
    if (!this.cb.onAnchors) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const out = [];
    for (const slot of ANCHOR_SLOTS) {
      const p = this.anchors[slot];
      if (!p) continue;
      const v = p.clone().project(this.camera);
      out.push({ slot, x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height, visible: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 });
    }
    const prev = this._lastAnchors;
    const same =
      prev &&
      prev.length === out.length &&
      out.every((a, i) => a.slot === prev[i].slot && a.visible === prev[i].visible && Math.abs(a.x - prev[i].x) < 0.5 && Math.abs(a.y - prev[i].y) < 0.5);
    if (same) return;
    this._lastAnchors = out;
    this.cb.onAnchors(out);
  }

  /** 选中家具上方的屏幕点（选择条跟着它）：没动就不发 */
  emitSelMove() {
    if (!this.cb.onSelMove) return;
    const p = this.selected ? this.projectItem(this.selected) : null;
    const q = this._lastSel;
    if (p && q && Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5) return;
    if (!p && !q) return;
    this._lastSel = p;
    this.cb.onSelMove(p);
  }

  projectItem(id) {
    const g = this.items.get(id);
    if (!g) return null;
    const b = new THREE.Box3().setFromObject(g);
    const p = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y + 0.15, (b.min.z + b.max.z) / 2).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height };
  }

  // ───────────────────────── 输出 ─────────────────────────

  renderNow() {
    if (this.composer) {
      if (this.dof) this.dof.focus = this.camera.position.distanceTo(this.controls.target);
      this.composer.render();
    } else this.renderer.render(this.scene, this.camera);
  }

  /**
   * 高清截图（隐藏选框）。像素比有上限：长边最多 3200（'fast' 2560）像素、也不超过显卡的最大尺寸 ——
   * 大 iPad 上 3× 的后期链要好几百 MB 显存，会直接把 WebGL 上下文挤掉。
   */
  async snapshot(scale = 2) {
    if (this.contextLost) throw new Error('webgl-context-lost');
    const sel = this.selBox.visible;
    const hov = this.hovBox.visible;
    this.selBox.visible = this.hovBox.visible = false;
    const base = this.renderer.getPixelRatio();
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const caps = this.renderer.capabilities;
    const long = Math.min(QUALITY[this.quality].snapLong, caps.maxTextureSize || 4096, caps.maxRenderbufferSize || 4096);
    this._prOverride = Math.max(Math.min(base, long / Math.max(w, h)), Math.min(3, base * scale, long / Math.max(w, h)));
    let blob = null;
    try {
      this.resize();
      this.renderNow();
      blob = await new Promise((res) => this.renderer.domElement.toBlob(res, 'image/png'));
    } finally {
      this._prOverride = 0;
      this.resize();
      this.selBox.visible = sel;
      this.hovBox.visible = hov;
      this.dirty = true;
    }
    return blob;
  }

  /** 四个时段的小图（日光面板用）：在同一帧里渲染、截取、复原，不会闪 */
  thumbs(hours, w = 168, h = 104) {
    if (this.contextLost) return [];
    const keep = this.time;
    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    const sel = this.selBox.visible;
    this.selBox.visible = this.hovBox.visible = false;
    const cam = this.camera.clone();
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w * 2, h * 2, false);
    const out = hours.map((hr) => {
      this.setTime(hr);
      this.renderer.render(this.scene, cam);
      const c = document.createElement('canvas');
      c.width = w * 2;
      c.height = h * 2;
      c.getContext('2d').drawImage(this.renderer.domElement, 0, 0);
      return c.toDataURL('image/jpeg', 0.8);
    });
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(size.x, size.y, false);
    this.setTime(keep);
    this.selBox.visible = sel;
    this.renderNow();
    this.dirty = true;
    return out;
  }

  // ───────────────────────── 演示模式（展厅电视） ─────────────────────────

  /**
   * 演示：镜头慢慢环绕 + 一天的光影循环（白天慢、黄金时段更慢、深夜很快带过，一圈约 80 秒）。
   * ~30 fps、像素比降一点；太阳 / 天光每 100ms 动一次；标签不更新（界面在演示时也不显示）。
   * 时间每 250ms 通过 cb.onTime(hour) 告诉界面（可选），退出时再报一次。
   */
  setDemo(on) {
    on = !!on;
    if (on === this.demo) return;
    this.demo = on;
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = on ? DEMO_ORBIT : 0.7;
    if (on) {
      this.select(null);
      this.hovered = null;
      this.hovBox.visible = false;
      this.cb.onHover?.(null);
      this._demoHour = this.time;
      this._demoSunT = 0;
      this._demoTellT = 0;
      if (this.center) this.frame('demo');
    } else {
      this.cb.onTime?.(this.time);
      this._lastAnchors = null;
    }
    if (this.applyPixelRatio()) this.resize();
    this.dirty = true;
  }

  demoStep(t, dt) {
    const d = this.day || daylight(this.time, this.plan?.north || 0);
    const rate = 0.22 * (1 - 0.45 * d.golden) * (1 - d.night) + 1.4 * d.night;
    this._demoHour = ((this._demoHour ?? this.time) + rate * dt) % 24;
    if (t - this._demoSunT >= 100) {
      this._demoSunT = t;
      this.setTime(this._demoHour);
    }
    if (t - this._demoTellT >= 250) {
      this._demoTellT = t;
      this.cb.onTime?.(this.time);
    }
    this.dirty = true;
  }

  loop(t) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this.loop);
    // 演示：~30 fps 就够（大屏电视跑一整天也不烫）
    if (this.demo && t - this._lastT < 1000 / DEMO_FPS - 4) return;
    const dt = this._lastT ? Math.min(0.25, (t - this._lastT) / 1000) : 1 / 60;
    this._lastT = t;
    if (this.demo) this.demoStep(t, dt);
    if (this.tween) {
      const k = Math.min(1, (t - this.tween.t0) / this.tween.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      this.camera.position.lerpVectors(this.tween.fromP, this.tween.toP, e);
      this.controls.target.lerpVectors(this.tween.fromT, this.tween.toT, e);
      if (k >= 1) this.tween = null;
      this.dirty = true;
    }
    if (this.onTick?.(t)) this.dirty = true;
    // 传 dt：自动环绕按真实时间转，帧率高低都一样快
    const moved = this.controls.update(dt);
    if (this.lib.pulse(t)) this.dirty = true;
    if (moved) this.dirty = true;
    if (!this.dirty) return;
    // 墙的切法跟着镜头
    const camDir = this.camera.position.clone().sub(this.controls.target).setY(0).normalize();
    if (this.house && (this.lastCut == null || camDir.distanceTo(this.lastCut) > 0.02)) {
      if (applyCutaway(this.house.wallSets, camDir, this.wallMode)) this.collectPickables();
      this.lastCut = camDir;
    }
    this.renderNow();
    if (!this.demo) {
      this.emitAnchors();
      this.emitSelMove();
    }
    this.dirty = false;
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    this._unbind?.();
    this.ro.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this._onLost, false);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this._onRestored, false);
    this.controls.dispose();
    this.lib.dispose();
    this.env.dispose();
    this.bgTex?.dispose();
    if (this.composer) for (const p of this.composer.passes) p.dispose?.();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function isVisible(o) {
  let p = o;
  while (p) {
    if (p.visible === false) return false;
    p = p.parent;
  }
  return true;
}

// ───────────────────────── 软阴影：PCF 多采样 ─────────────────────────
// three r183 的 PCF 只取 5 个 Vogel 点（加大半径就会出颗粒）。改成 N 个点（每个点硬件双线性 = 4 tap），
// 半影变得平滑。只改字符串、找不到就不改（升级 three 也不会坏）。

let SOFT_PATCHED = false;
function patchSoftShadows(taps) {
  if (SOFT_PATCHED) return;
  SOFT_PATCHED = true;
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const re = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \)[\s\S]*?\) \* 0\.2;/;
  if (!re.test(chunk)) return;
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replace(
    re,
    `shadow = 0.0;
				for ( int i = 0; i < ${taps}; i ++ ) {
					shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, ${taps}, phi ) * radius, shadowCoord.z ) );
				}
				shadow /= float( ${taps} );`
  );
}

// ───────────────────────── 环境光 IBL：摄影棚 + 天穹 ─────────────────────────
// 一个小场景：渐变天穹（天顶 / 地平线 / 地面反光 + 太阳方向的暖晕）+ 顶上一块大柔光箱 + 两侧灯条 + 夜里几块暖色小灯面。
// 用 PMREM 预滤波成环境贴图。按 daylight().envKey（半小时一档）缓存最近 6 档。

const DOME_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const DOME_FRAG = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  uniform vec3 sunDir;
  uniform vec3 sunCol;
  uniform float glow;
  uniform float gain;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    // 地平线有方向：朝太阳那边暖，背对太阳那边偏天空的冷色 → 黄昏时阴影是冷的、受光面是暖的
    vec2 sh = normalize(sunDir.xz + vec2(1e-4));
    vec2 dh = normalize(d.xz + vec2(1e-4));
    float toward = pow(dot(dh, sh) * 0.5 + 0.5, 1.6);
    vec3 hor = mix(mix(zenith, horizon, 0.45), horizon, toward);
    vec3 sky = mix(hor, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
    vec3 below = mix(hor * 0.55, ground, smoothstep(0.0, 0.35, -h));
    vec3 c = h >= 0.0 ? sky : below;
    float s = max(dot(d, normalize(sunDir)), 0.0);
    c += sunCol * glow * (pow(s, 6.0) * 0.9 + pow(s, 48.0) * 1.6) * smoothstep(-0.15, 0.1, h);
    gl_FragColor = vec4(c * gain, 1.0);
  }
`;

class EnvStudio {
  constructor(renderer, size) {
    this.size = size;
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.cache = new Map();
    const scene = new THREE.Scene();
    this.scene = scene;
    this.u = {
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      ground: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunCol: { value: new THREE.Color() },
      glow: { value: 0 },
      gain: { value: 1 },
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(60, 64, 32), new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false }));
    scene.add(this.dome);
    const panel = (w, h, x, y, z, look = [0, 4, 0]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, toneMapped: false }));
      m.position.set(x, y, z);
      m.lookAt(...look);
      scene.add(m);
      return m;
    };
    // 顶光柔光箱（大、方）→ 地板 / 台面 / 漆面上一大片柔和的高光
    this.key = panel(30, 18, 2, 34, -4, [2, 0, -4]);
    // 两侧竖灯条 → 柜门、金属、玻璃上优雅的竖向高光
    this.stripA = panel(4, 24, -40, 12, -10);
    this.stripB = panel(4, 24, 38, 12, 14);
    // 夜里：几块低低的暖色小灯面（像远处的落地灯），让反射里有一点暖意
    this.warm = [panel(4, 4, -26, 3, 22), panel(3, 3, 30, 2.5, -20), panel(5, 3, 8, 3, -34)];
  }

  configure(d) {
    const u = this.u;
    const day = 1 - d.night;
    u.zenith.value.set(d.skyZenith);
    u.horizon.value.set(d.skyHorizon);
    u.ground.value.set(d.skyGround);
    u.sunDir.value.set(d.dir[0], Math.max(0.02, d.dir[1]), d.dir[2]);
    u.sunCol.value.set(d.sunColor);
    u.glow.value = d.up ? 0.2 + 0.8 * d.golden : 0.04;
    // 天穹整体亮度：白天的天光 ~0.5（配合太阳，阴影里不死黑、受光面有体积）；夜里是一点月色
    u.gain.value = 0.62 * day + 1.6 * d.night;
    const white = new THREE.Color(1, 0.985, 0.96);
    const warmSun = new THREE.Color(d.sunColor);
    const keyC = white.clone().lerp(warmSun, 0.2 * d.golden);
    this.key.material.color.copy(keyC).multiplyScalar(1.9 * day);
    this.stripA.material.color.copy(white).multiplyScalar(1.5 * day + 0.06);
    this.stripB.material.color.copy(white).multiplyScalar(1.1 * day + 0.04);
    const lampC = new THREE.Color(1.0, 0.62, 0.3);
    for (const w of this.warm) w.material.color.copy(lampC).multiplyScalar(2.2 * d.lamps);
  }

  get(d) {
    const k = d.envKey;
    let rt = this.cache.get(k);
    if (rt) {
      this.cache.delete(k);
      this.cache.set(k, rt);
      return rt.texture;
    }
    // 用这一档中心时刻的光来建（同一档永远一样 → 缓存有效）
    const hc = parseFloat(k);
    const north = parseFloat(k.split('|')[1]) || 0;
    this.configure(Number.isFinite(hc) ? daylight(hc, north) : d);
    rt = this.pmrem.fromScene(this.scene, 0.015, 0.1, 200, { size: this.size });
    this.cache.set(k, rt);
    while (this.cache.size > 6) {
      const [k0, r0] = this.cache.entries().next().value;
      r0.dispose();
      this.cache.delete(k0);
    }
    return rt.texture;
  }

  /** 换画质档：环境贴图换尺寸，旧的全部释放 */
  setSize(size) {
    if (size === this.size) return;
    this.size = size;
    for (const rt of this.cache.values()) rt.dispose();
    this.cache.clear();
  }

  /** WebGL 上下文恢复后：旧的环境贴图内容已经没了（也不必去删已失效的 GL 对象），换一个新的预滤波器重画 */
  reset() {
    this.cache.clear();
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
  }

  dispose() {
    for (const rt of this.cache.values()) rt.dispose();
    this.cache.clear();
    this.pmrem.dispose();
    this.scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }
}

// ───────────────────────── 后期链里的几个小 pass ─────────────────────────

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** 场景画到一个多重采样（MSAA）的 HDR 目标里，再交给后面的 pass —— EffectComposer 默认会丢掉抗锯齿 */
class MSAARenderPass extends Pass {
  constructor(scene, camera, samples) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: QUAD_VERT,
        fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }',
        blending: THREE.NoBlending,
        depthTest: false,
        depthWrite: false,
      })
    );
  }
  setSize(w, h) {
    this.rt.setSize(w, h);
  }
  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.quad.material.uniforms.tDiffuse.value = this.rt.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.quad.render(renderer);
  }
  dispose() {
    this.rt.dispose();
    this.quad.material.dispose();
    this.quad.dispose();
  }
}

/** 很淡的景深：对焦在镜头看的那一点，离焦越远越虚（像拍微缩模型）。
 *  深度直接借 GTAO 已经画好的那张，不多画一遍场景；背景本来就是虚的，跳过；对焦范围内一个像素只读一次深度就返回。 */
const DOF_FRAG = /* glsl */ `
  #include <packing>
  #define TAPS 20
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2 texel;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float focus;
  uniform float maxBlur;
  uniform float band;
  uniform float range;
  varying vec2 vUv;
  float linZ(float d) { return -perspectiveDepthToViewZ(d, cameraNear, cameraFar); }
  float cocAt(float z) { return maxBlur * smoothstep(band, band + range, abs(z - focus) / focus); }
  void main() {
    vec4 base = texture2D(tDiffuse, vUv);
    float d0 = texture2D(tDepth, vUv).x;
    if (d0 >= 0.99999) { gl_FragColor = base; return; }
    float z0 = linZ(d0);
    float c0 = cocAt(z0);
    if (c0 < 0.45) { gl_FragColor = base; return; }
    float phi = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
    vec3 acc = base.rgb;
    float wsum = 1.0;
    for (int i = 0; i < TAPS; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / float(TAPS)) * c0;
      float a = fi * 2.39996323 + phi;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r * texel;
      float ds = texture2D(tDepth, uv).x;
      float zs = ds >= 0.99999 ? 1e6 : linZ(ds);
      float cs = ds >= 0.99999 ? c0 : cocAt(zs);
      // 前面更清楚的东西不渗进后面的虚化里
      float w = zs + 0.05 < z0 ? smoothstep(r - 1.0, r + 0.5, cs) : 1.0;
      acc += texture2D(tDiffuse, uv).rgb * w;
      wsum += w;
    }
    gl_FragColor = vec4(acc / wsum, base.a);
  }
`;

class DOFPass extends Pass {
  constructor(depthTexture, camera) {
    super();
    this.camera = camera;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: depthTexture },
        texel: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 400 },
        focus: { value: 30 },
        maxBlur: { value: 2.4 },
        band: { value: 0.09 },
        range: { value: 0.4 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: DOF_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  set focus(v) {
    this.material.uniforms.focus.value = v;
  }
  setPixelRatio(pr) {
    this.material.uniforms.maxBlur.value = 2.4 * pr;
  }
  setSize(w, h) {
    this.material.uniforms.texel.value.set(1 / w, 1 / h);
  }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.cameraNear.value = this.camera.near;
    u.cameraFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}

/** 输出：色调映射 + sRGB（three 自带）之后，再加一点暗角和抖动（深色渐变不出色带） */
function makeOutputPass(vignette) {
  const out = new OutputPass();
  out.uniforms.uVignette = { value: vignette };
  const fs = out.material.fragmentShader;
  out.material.fragmentShader = fs
    .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\n\t\tuniform float uVignette;')
    .replace(
      /(#ifdef SRGB_TRANSFER\s*gl_FragColor = sRGBTransferOETF\( gl_FragColor \);\s*#endif)/,
      `$1
			vec2 vq = (vUv - 0.5) * vec2(1.0, 0.82);
			gl_FragColor.rgb *= 1.0 - uVignette * smoothstep(0.12, 0.62, dot(vq, vq) * 2.2);
			gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;`
    );
  return out;
}

// ───────────────────────── 背景：一张「虚化的室内照片」 ─────────────────────────
// 像相机对焦在模型上、背景是失焦的落地窗：窗外白天是天光和树影（溪岸 × 大自然），黄昏是琥珀色的天，
// 夜里是林间暮色里远处人家的灯斑；下面是地面上窗光的倒影。全部预先画好、模糊好，换时间只是叠色（很快）。

function makeBackdropLayers(W, H) {
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  };
  const k = W / 1024;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // 窗（白色遮罩）：一整面落地窗，竖框宽窄交替，上面有一道横档
  const win = mk();
  const w = win.getContext('2d');
  w.filter = `blur(${Math.round(13 * k)}px)`;
  w.fillStyle = '#fff';
  const top = H * 0.07;
  const bot = H * 0.6;
  const panes = [];
  let x = -W * 0.03;
  let i = 0;
  while (x < W * 1.03) {
    const pw = (i % 3 === 2 ? 0.07 : 0.135) * W;
    panes.push([x, pw]);
    w.fillRect(x, top, pw, bot - top);
    x += pw + 0.018 * W;
    i++;
  }
  // 横档
  w.globalCompositeOperation = 'destination-out';
  w.fillRect(0, top + (bot - top) * 0.2, W, 0.012 * W);
  w.globalCompositeOperation = 'source-over';
  // 窗外的树（深鼠尾草绿的一团团，偏下）
  const leaves = mk();
  const l = leaves.getContext('2d');
  l.filter = `blur(${Math.round(16 * k)}px)`;
  for (let j = 0; j < 46; j++) {
    const cx = rnd() * W;
    const cy = H * (0.3 + rnd() * 0.32);
    const r = (30 + rnd() * 80) * k;
    l.fillStyle = `rgba(${34 + rnd() * 24},${52 + rnd() * 26},${40 + rnd() * 16},${0.55 + rnd() * 0.35})`;
    l.beginPath();
    l.ellipse(cx, cy, r * 1.2, r, 0, 0, Math.PI * 2);
    l.fill();
  }
  l.filter = 'none';
  l.globalCompositeOperation = 'destination-in';
  l.drawImage(win, 0, 0);
  // 夜里的灯斑：远处人家 / 路灯，暖色为主，一点冷色
  const bokeh = mk();
  const b = bokeh.getContext('2d');
  b.filter = `blur(${Math.round(4 * k)}px)`;
  for (let j = 0; j < 70; j++) {
    const bx = rnd() * W;
    const by = H * (0.3 + rnd() * 0.26);
    const r = (3 + rnd() * 9) * k;
    const warm = rnd() > 0.25;
    b.fillStyle = warm ? `rgba(255,${176 + rnd() * 50},${104 + rnd() * 40},${0.3 + rnd() * 0.45})` : `rgba(176,206,214,${0.18 + rnd() * 0.3})`;
    b.beginPath();
    b.arc(bx, by, r, 0, Math.PI * 2);
    b.fill();
  }
  b.filter = 'none';
  b.globalCompositeOperation = 'destination-in';
  b.drawImage(win, 0, 0);
  // 暗角
  const vig = mk();
  const v = vig.getContext('2d');
  const rg = v.createRadialGradient(W / 2, H * 0.42, H * 0.2, W / 2, H * 0.5, W * 0.62);
  rg.addColorStop(0, 'rgba(0,0,0,0)');
  rg.addColorStop(1, 'rgba(0,0,0,0.55)');
  v.fillStyle = rg;
  v.fillRect(0, 0, W, H);
  // 颗粒（防色带 + 照片感）
  const grain = mk();
  const g = grain.getContext('2d');
  const img = g.createImageData(W, H);
  for (let p = 0; p < img.data.length; p += 4) {
    const n = 128 + (rnd() - 0.5) * 70;
    img.data[p] = img.data[p + 1] = img.data[p + 2] = n;
    img.data[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { win, leaves, bokeh, vig, grain, tint: mk(), top, bot };
}

function mixHex(a, b, t) {
  const A = parseInt(a.slice(1), 16);
  const B = parseInt(b.slice(1), 16);
  const ch = (n, s) => (n >> s) & 255;
  const m = (s) => Math.round(ch(A, s) + (ch(B, s) - ch(A, s)) * t);
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}

function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawBackdrop(canvas, layers, d) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const night = d.night;
  // 1 房间：墙在上、地面在下，越往下越暗
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shadeHex(d.bgRoom, 0.85));
  g.addColorStop(0.5, shadeHex(d.bgRoom, 1.05));
  g.addColorStop(0.64, shadeHex(d.bgRoom, 0.78));
  g.addColorStop(1, shadeHex(d.bgRoom, 0.42));
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 2 窗：用遮罩把天色「透」进来（上面偏天顶色，靠近地平线更亮）
  const t = layers.tint.getContext('2d');
  t.globalCompositeOperation = 'copy';
  t.drawImage(layers.win, 0, 0);
  t.globalCompositeOperation = 'source-in';
  const sky = t.createLinearGradient(0, layers.top, 0, layers.bot);
  sky.addColorStop(0, mixHex(d.bgSky, d.skyZenith, 0.3 + 0.3 * night));
  sky.addColorStop(0.5, d.bgSky);
  sky.addColorStop(1, shadeHex(d.bgSky, 1.06));
  t.fillStyle = sky;
  t.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.94 - 0.3 * night;
  ctx.drawImage(layers.tint, 0, 0);
  // 3 窗外的树影 / 夜里的灯斑
  ctx.globalAlpha = 0.32 * (1 - night) + 0.4 * night;
  ctx.drawImage(layers.leaves, 0, 0);
  if (night > 0.01) {
    ctx.globalAlpha = night * 0.85;
    ctx.drawImage(layers.bokeh, 0, 0);
  }
  // 4 地面上窗光的倒影（压扁、翻转、很淡）
  ctx.save();
  ctx.globalAlpha = 0.22 - 0.08 * night;
  ctx.translate(0, layers.bot * 1.62 + H * 0.03);
  ctx.scale(1, -0.62);
  ctx.drawImage(layers.tint, 0, 0);
  ctx.restore();
  // 5 暗角 + 颗粒
  ctx.globalAlpha = 0.62 + 0.3 * night;
  ctx.drawImage(layers.vig, 0, 0);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.06;
  ctx.drawImage(layers.grain, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ───────────────────────── 地面光圈（悬停 / 选中） ─────────────────────────

function makeRing(color, opacity) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 72), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.94, 72), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity * 0.12, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  g.add(ring, glow);
  g.visible = false;
  g.renderOrder = 4;
  g.userData.noAO = true;
  return g;
}

const _box = new THREE.Box3();
function fitRing(ring, obj) {
  _box.setFromObject(obj);
  const r = Math.max(0.35, Math.hypot(_box.max.x - _box.min.x, _box.max.z - _box.min.z) / 2 + 0.08);
  ring.position.set((_box.min.x + _box.max.x) / 2, 0.015, (_box.min.z + _box.max.z) / 2);
  ring.scale.setScalar(r);
}
