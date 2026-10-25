// 3D 引擎：渲染、相机、光（太阳 + 天光 IBL + 窗口天光 + 夜里的灯）、后期、拾取、拖动家具。
// 只在有变化时才渲染（省电，展厅 iPad 能撑一整天）。
//
// 画质（像产品渲染那样「贵」）：
// · 色调映射用 Khronos PBR Neutral —— 为产品渲染设计，材质的颜色几乎不偏（ACES 会把橙色推饱和、AgX 偏灰）；
//   它的暗部「脚」改成按比例压暗（阴影里的颜色不会被推得更饱和：海军蓝不变靛蓝、橡木不变橙）；
// · 环境光 IBL：自己搭的「摄影棚 + 天穹」（顶上一块大柔光箱、两侧灯条、跟着时段的天空），
//   天色中和成 VI 的暖灰（只留两成）—— 金属 / 亮面石材反射暖灰，不是蓝 / 薰衣草色；每半小时一档，缓存最近几档；
// · 白平衡像室内摄影：太阳、室内灯各自往白校正（黄昏、灯仍然暖，材质保持本色）；
//   夜里像室内夜景摄影：曝光 +0.45EV、柔和的苔绿补光 + 被灯照亮的天花板反光，灯池更亮更远；
//   再按「房间测光」（墙 / 地板 / 柜体有多暗）给深色方案多一点光（最多 2 倍）—— 炭灰 + 胡桃木也留得住中间调，浅色方案不会被照成白天；
// · 外墙的窗外有一块天光卡（house.js）：白天是浅浅的天色、夜里是深苔绿，不再是黑背景透过玻璃的一块黑板；
// · 取景：界面用 setInsets 告诉引擎哪几边被面板挡住，模型在没挡住的那块里居中、放得下（主点偏移，旋转中心不变）；
//   概念图 / 日光小图没有面板：镜头还停在对好的位置时按整张画面重新取景，截完原样放回；
// · 太阳影子：按房子在光空间里收紧视锥（贴图密度最大）+ 更多 PCF 采样的柔边，按纹素自动算偏移（不脱影、不出麻点）；
// · 白天几扇大窗各放一块面光源（窗口的天光），夜里是灯具位置上的暖光（平方衰减、柔和）；
// · 'high'：多重采样 MSAA → GTAO 接触阴影 → 很淡的景深（微缩模型感）→ 只给灯的辉光 → 色调映射 + 暗角 + 抖动；
//   'fast'（iPad）：直接画到带 MSAA 的画布，不做 GTAO / 景深。
//
// 画质档来自设置（自动 / 高清 / 流畅）：自动 = 触屏（iPad / 手机）用 'fast'（大 iPad 也是：省电、不烫、不爆显存），电脑用 'high'。
// iPad 上的稳定性：贴图按显存预算淘汰（matlib）、截图限制像素、WebGL 上下文丢了会告诉界面并在恢复后重建；
// 演示模式（展厅电视）：自动环绕 + 一天的光影循环，~30 fps、像素比降一点，跑一整天也不烫。
//
// 多层（floors.js）：一层一个组。setFloorView('all' | floorId) 像 The Sims：看的那一层以上的楼层只留影子
// （HIDDEN_LAYER：镜头看不见、太阳照样被挡住），它们的家具藏起来；看的那一层照墙的切法；下面的楼层墙全立。
// 只换图层 / 可见性：不重建、不重新编译着色器。点选、拖动、加家具、材质标签、夜灯、窗光、光柱都只看「这一层」
// （interactiveFloor；'all' = 最上面一层）。被楼上盖住的那一层白天环境光补一点（楼上挡掉了天光，见 COVER）。

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
import { applyCutaway, disposeHouseKit, SHADOW_LAYER, HIDDEN_LAYER } from './house.js';
import { buildStack } from './floors.js';
import { daylight, LAMP } from './daylight.js';
import { Beams } from './beams.js';
import { HDR_GLSL, HDR_COPY_FRAG, patchHdrChunks, guardFrag, guardOutputShader, guardBloom, BlankWatch, gpuName } from './hdrguard.js';
import { MAT_BY_ID } from '../../shared/materials.js';
import { PALETTE } from '../../shared/palette.js';
import { ROOM_TYPES, migratePlan, stairPath } from '../plan/model.js';
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

// 整面贴墙的墙件（电视墙 / 主题墙）：背面要贴住身后的墙（alignWallItem）；那面墙被切低时墙板一起收起（refreshFeatureMode）。
// reach / sink：身后多远（或嵌进墙多深）以内算「靠着这面墙」；rest：贴上去后离墙面留 4mm（不和墙面打架）；tol：差这么点就不挪
const WALL_BACKED = new Set(['tvWall', 'featureWall']);
const WALL_SNAP = { reach: 0.35, sink: 0.3, rest: 0.004, tol: 0.008 };

/** 每一档画质用到的资源（换档时全部按这张表重建） */
const QUALITY = {
  high: { pr: 2, shadow: 4096, env: 256, bg: 1024, lights: 10, taps: 16, pcfMax: 10, rect: true, snapLong: 3200 },
  fast: { pr: 1.5, shadow: 2048, env: 128, bg: 512, lights: 5, taps: 8, pcfMax: 6, rect: false, snapLong: 2560 },
  // 兼容档：只在着色器编译失败时自动换过来（某些 Windows 显卡 / 驱动）。three 原版阴影、灯少、不走后期链 —— 先保证画得出来
  safe: { pr: 1, shadow: 1024, env: 64, bg: 512, lights: 3, taps: 0, pcfMax: 4, rect: false, snapLong: 2048 },
};

// 被楼上盖住的那一层（楼上藏起来、但还在挡太阳）：白天环境光最多 +35%、半球光 +50%（× 被盖住的比例）
const COVER = { env: 0.35, hemi: 0.5 };
// 换楼层时镜头目标点平移的时间
const FLOOR_TWEEN = 700;

const DEMO_FPS = 30;
const DEMO_ORBIT = 0.4; // OrbitControls.autoRotateSpeed：一圈约 150 秒
const BASE_FOV = 28;
const NO_INSETS = Object.freeze({ left: 0, right: 0, top: 0, bottom: 0 });
// 概念图（PNG）的取景：没有面板，模型（含底座）占画面的这么多 —— 横图留出底部角标的呼吸（房子约占宽的一半），竖图按宽放满一点
const SNAP_MARGIN = { wide: 0.68, tall: 0.84 };
// 日光小图：底下留 14% 给时段的名字（渐变 + 字），其余放满
const THUMB = { label: 0.14, margin: 0.92 };

// ───────────────────────── 光的颜色：中性的摄影棚 + 相机白平衡 ─────────────────────────
// 环境光（IBL）和半球光用 VI 的暖灰（纸色的色相）打底，天色最多只占两成 ——
// 金属、亮面石材反射的是暖灰，不是蓝 / 薰衣草色；海军蓝丝绒不会被天光推成靛紫。
const SKY_TINT = 0.2;
const _lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
/** PALETTE 色的「色相」（线性、亮度归一成 1） */
const chromaOf = (hex) => {
  const c = new THREE.Color(hex);
  const l = _lum(c) || 1;
  return new THREE.Color().setRGB(c.r / l, c.g / l, c.b / l);
};
const NEUTRAL = chromaOf(PALETTE.paper); // 暖灰（纸）
const STUDIO_WHITE = chromaOf(PALETTE.card); // 柔光箱：几乎是白，带一点纸的暖
/** 把一个天色中和成同样亮度的暖灰，只留 keep 那么多原来的色彩 */
function neutralColor(hex, keep, out = new THREE.Color()) {
  out.set(hex);
  const l = _lum(out);
  return out.setRGB(l * NEUTRAL.r + (out.r - l * NEUTRAL.r) * keep, l * NEUTRAL.g + (out.g - l * NEUTRAL.g) * keep, l * NEUTRAL.b + (out.b - l * NEUTRAL.b) * keep);
}
/** daylight().wb / .wbLamp → 线性增益（太阳天光一组、室内灯一组） */
const wbColor = (d, out = new THREE.Color(), key = 'wb') => (d?.[key] ? out.setRGB(d[key][0], d[key][1], d[key][2]) : out.setRGB(1, 1, 1));

/**
 * 色调映射的「脚」：Khronos PBR Neutral 在暗部给三个通道减同一个数（加对比），这会把暗处的颜色推得很饱和
 * （阴影里的海军蓝变成纯靛蓝、橡木变成橙）。改成按比例压暗：对比一样，色相和饱和度不变。只改字符串，找不到就不改。
 */
let TONE_PATCHED = false;
function patchToneMapping() {
  if (TONE_PATCHED) return;
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  const at = chunk.indexOf('vec3 NeutralToneMapping');
  const re = /color -= offset;/;
  if (at < 0 || !re.test(chunk.slice(at))) return;
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.slice(0, at) + chunk.slice(at).replace(re, 'color *= max( 0.0, 1.0 - offset / max( max( color.r, max( color.g, color.b ) ), 1e-5 ) );');
  TONE_PATCHED = true;
}

/** 设置里的画质（'auto' / 没存 = 自动）→ 实际档位 */
export function resolveQuality(q) {
  if (q === 'high' || q === 'fast' || q === 'safe') return q;
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

/**
 * 夜里的房间测光：墙 / 地板 / 柜体（按面积大概 5 : 3.5 : 1.5）的平均反照率（线性），比参考值 0.3 暗多少，
 * 夜里的补光 / 环境光就乘多少（灯跟一半）—— 按一半的档数补（深色方案仍然比浅色的深沉），最多 2.2 倍；浅色方案 = 1（照旧）。
 * 炭灰墙 + 胡桃木 + 哑光黑 ≈ 0.05 → 2.2 倍；橄榄绿墙 + 胡桃木 ≈ 0.1 → 1.75 倍；砂洗石灰 + 烟熏橡 ≈ 0.39 → 1 倍。
 */
const ROOM_KEY = { ref: 0.3, weights: { walls: 0.5, floor: 0.35, cabinetry: 0.15 }, fallback: 0.35, max: Math.log2(2.2) };
function roomKeyFor(current) {
  let a = 0;
  for (const [slot, w] of Object.entries(ROOM_KEY.weights)) {
    const m = MAT_BY_ID[current?.[slot]];
    a += w * (m?.color ? _lum(new THREE.Color(m.color)) : ROOM_KEY.fallback);
  }
  const ev = THREE.MathUtils.clamp(0.5 * Math.log2(ROOM_KEY.ref / Math.max(0.01, a)), 0, ROOM_KEY.max);
  return 2 ** ev;
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
    patchToneMapping();
    // 出射光进半精度 HDR 缓冲之前先洗干净（NaN / Inf 会让后期链整屏变透明，见 hdrguard.js）
    patchHdrChunks();
    this.demo = false;
    this._prOverride = 0;
    // 界面面板挡住的边（CSS 像素）：模型在没被挡住的那块里居中、放得下（setInsets）
    this.insets = { left: 0, right: 0, top: 0, bottom: 0 };
    this.vo = { x: 0, y: 0 }; // 现在的主点偏移（像素，+ = 往右 / 往下）
    this.voTo = { x: 0, y: 0 };
    this.lastView = 'iso';
    this._framed = null;
    this._wb = new THREE.Color(1, 1, 1);
    this._wbLamp = new THREE.Color(1, 1, 1);
    // 夜里的房间测光（深色方案夜里多给一点光，见 updateRoomKey）：now 是正在用的，to 是要去的
    this.roomKey = { now: 1, to: 1 };

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
    // 藏起来的楼层（HIDDEN_LAYER）只进影子：three 画影子时按主镜头的图层筛选，画影子的那一下临时把这一层打开
    // （画面的渲染列表在这之前就排好了，主画面里照样看不见它）
    const smRender = r.shadowMap.render.bind(r.shadowMap);
    r.shadowMap.render = (lights, scene, camera) => {
      const mask = camera.layers.mask;
      camera.layers.enable(HIDDEN_LAYER);
      try {
        smRender(lights, scene, camera);
      } finally {
        camera.layers.mask = mask;
      }
    };
    r.domElement.className = 'studio-canvas';
    container.appendChild(r.domElement);
    // 着色器编译失败（有些 Windows 显卡 / 驱动吃不下高画质的着色器）：整栋房子会画不出来、只剩背景 →
    // 自动降一档（high → fast → safe）重新编译；原因记在 window.__genieDiag，界面提示一句
    r.debug.onShaderError = (gl, program, vs, fs) => this.onShaderError(gl, program, vs, fs);

    // WebGL 上下文丢失（iPad 显存吃紧、在后台太久被系统回收）：停画、告诉界面；恢复后把 GPU 上画出来的东西重建。
    // （three 自己的监听器先注册，所以这里跑的时候它已经重新初始化好了）
    this.contextLost = false;
    this._onLost = (ev) => {
      ev.preventDefault();
      this.lib?.boards?.onContextLost(); // 板材照片换回近似色（恢复时 three 不会去上传已经放掉的照片）
      this.contextLost = true;
      this.running = false;
      cancelAnimationFrame(this._raf);
      this.cb.onContextLost?.();
    };
    this._onRestored = () => {
      this.contextLost = false;
      this.lib?.boards?.onContextRestored(); // 板材照片重新读（之后只用 256）
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

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 400);
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
    this.sun.shadow.camera.layers.enable(HIDDEN_LAYER);
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(new THREE.Color(1, 1, 1), new THREE.Color(0.27, 0.27, 0.27), 0.2);
    this.scene.add(this.hemi);
    // 夜里的补光：苔绿石板色、很弱、不投影，从镜头左上方来（跟着镜头）—— 墙头、底座、地面的轮廓读得出来
    this.fill = new THREE.DirectionalLight(new THREE.Color(1, 1, 1), 0);
    this.fill.castShadow = false;
    this.scene.add(this.fill, this.fill.target);

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
    // 楼层（setScene 里由 floors.buildStack 建好）
    this.floors = [];
    this.floorMap = new Map();
    this.roomFloor = new Map();
    this.floorView = 'all';
    this.activeIdx = 0;
    this.coverFrac = 0;
    this.ceilingsOn = false;
    this.stackTop = 2.8;
    this.wallMode = 'cut';
    this.time = 18.4;
    this.anchors = {};
    // 选中 = SAIL 浅金的地面光圈；悬停 = 纸白、更淡
    this.selBox = makeRing(PALETTE.goldL, 0.95);
    this.hovBox = makeRing(PALETTE.card, 0.5);
    this.scene.add(this.selBox, this.hovBox);

    // 看门狗：后期链画出来的是空画面（整屏透明 / 全黑）就自动降一档
    this.blankWatch = new BlankWatch(this);
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
    // iPad（'fast'）且画布自带 MSAA：直接画，最省；兼容档也直接画（不用半精度多重采样的渲染目标）
    if (!full && (this.nativeAA || this.quality === 'safe')) return;
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
      guardBloom(this.bloom);
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
  /** 着色器编译失败：记下原因，降一档重新编译（high → fast → safe）；已经是兼容档就告诉界面 */
  onShaderError(gl, program, vs, fs) {
    const log = (sh) => {
      try {
        return (sh && gl.getShaderInfoLog(sh)) || '';
      } catch {
        return '';
      }
    };
    const info = { gpu: gpuName(gl), quality: this.quality, program: (gl.getProgramInfoLog(program) || '').slice(0, 600), vertex: log(vs).slice(0, 600), fragment: log(fs).slice(0, 600) };
    console.error('[WISH studio] shader failed to compile', info);
    this.lowerQuality(info, this.quality === 'high' ? 'fast' : this.quality === 'fast' ? 'safe' : null);
  }

  /** 画不出来（着色器编译失败；后期链画出空画面，见 hdrguard.js 的看门狗）：记下原因、降到 next 档；next = null（已经到底）就告诉界面 */
  lowerQuality(info, next) {
    try {
      (window.__genieDiag ||= []).push(info);
    } catch {
      /* ignore */
    }
    if (!next) {
      this.cb.onRenderProblem?.({ ...info, degradedTo: null });
      return;
    }
    if (this._degrading) return;
    this._degrading = true;
    // 等这一帧画完再换档（换档会重建阴影、环境贴图、后期链）
    setTimeout(() => {
      this._degrading = false;
      if (this.quality === info.quality) this.setQuality(next);
      this.cb.onRenderProblem?.({ ...info, degradedTo: next });
    }, 0);
  }

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
    if (this.rooms) this.setupRoomLights(this.rooms, this.wallH);
    this.buildBackdrop(QP.bg);
    // 材质库（贴图分辨率 / 各向异性）和家具的细节（分段数、叶子数：furniture.js 看 lib.quality）都跟着手动换的档位走：
    // 先换材质库的档，再把每件家具按新档重建（旧的几何体释放）；夜灯池也在这里重新摆好
    this.lib.setQuality?.(nq === 'safe' ? 'fast' : nq, { safe: nq === 'safe' });
    this.rebuildFurniture();
    if (this.rooms) this.placeRoomLights();
    this.setupComposer();
    this.resize();
    if (this.day) this.setTime(this.time);
    this.blankWatch.poke();
    this.dirty = true;
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    // 画布真的变了尺寸（iPad 转屏、窗口拉伸）：镜头还停在对好的位置就按新尺寸重新对（截图时的 resize 尺寸不变，不会触发）
    const changed = this._size && (this._size.w !== w || this._size.h !== h);
    const refit = changed && this.center && !this.demo && this.isFramed();
    this._size = { w, h };
    this.applyPixelRatio();
    this.renderer.setSize(w, h);
    if (this.composer) {
      const pr = this.renderer.getPixelRatio();
      if (this.composer._pixelRatio !== pr) this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      if (this.dof) this.dof.setPixelRatio(pr);
    }
    if (changed) this.updateViewTarget(true);
    this.applyView();
    if (refit) this.frame(this.lastView, false);
    this.dirty = true;
  }

  // ───────────────────────── 面板留白（主点偏移） ─────────────────────────

  /**
   * 界面告诉引擎：四边各有多少像素被面板挡住（情绪面板、材质栏、工具条、日光面板）。
   * 模型就在没被挡住的那一块里居中、放得下：用 camera.setViewOffset 把画面的主点挪到那一块的中心 ——
   * 旋转的中心还是模型，转起来不会甩出去。镜头还停在上次「对好」的位置时，顺便按新的空间重新对一次；
   * 用户自己转过 / 缩放过就只挪主点（平滑过去），不打断他。演示模式没有面板，不留白。
   */
  setInsets(ins = {}) {
    const n = (v) => Math.max(0, Math.round(Number(v) || 0));
    const next = { left: n(ins.left), right: n(ins.right), top: n(ins.top), bottom: n(ins.bottom) };
    // 可选：上 / 下最少要留多少（工具条的底边、材质栏本身的高度）—— 上下加起来太多时 effInsets 缩到这里为止
    if (ins.minTop != null) next.minTop = Math.min(next.top, n(ins.minTop));
    if (ins.minBottom != null) next.minBottom = Math.min(next.bottom, n(ins.minBottom));
    // 左边是实心的一块（对照的照片）：左右合计超过一半宽时，先缩右边，左边不缩
    if (ins.minLeft != null) next.minLeft = Math.min(next.left, n(ins.minLeft));
    const cur = this.insets;
    if (['left', 'right', 'top', 'bottom', 'minTop', 'minBottom', 'minLeft'].every((k) => Math.abs((next[k] ?? -1) - (cur[k] ?? -1)) < 2)) return;
    const framed = this.isFramed();
    this._insetsSet = true;
    this.insets = next;
    this.updateViewTarget();
    // 面板开合动画时界面可能一秒调好多次：主点马上跟（平滑），重新取景等停下来 120ms 再做一次
    if (framed && this.center && !this.demo) {
      clearTimeout(this._refitT);
      this._refitT = setTimeout(() => {
        this._refitT = 0;
        if (this.running && this.center && !this.demo && this.isFramed()) this.frame(this.lastView, true);
      }, 120);
    }
    this.dirty = true;
  }

  /**
   * 真正用的留白：演示模式是 0；面板太大时缩一缩。
   * 左右按比例缩（没被挡住的那块至少留一半宽）。
   * 上下合计最多给到 50% 的高度（矮的屏幕 < 800：60%，英文标签常常排成两行）。超了先缩上边（材质标签那一带：
   * 标签是浮在上面的字和细线，模型顶上被盖住一点还认得出来），最多缩到工具条下面（minTop）；还不够才缩下边，
   * 但不缩进材质栏本身（minBottom）—— 材质栏是实心的一大块，模型的前面（车廊、一楼）钻到它底下就看不见了。
   * 两头都缩到底还超预算：照给（模型小一点，但不被挡住）。界面没给 minTop / minBottom（老的调用）：上边可以缩到 0，
   * 下边最多缩掉留的那 12px 呼吸。
   */
  effInsets() {
    if (this.demo) return { left: 0, right: 0, top: 0, bottom: 0 };
    const W = this.container.clientWidth || 1;
    const H = this.container.clientHeight || 1;
    const { left, right, top, bottom } = this.insets;
    const kx = Math.min(1, (W * 0.5) / Math.max(1, left + right));
    let l = left * kx;
    let r = right * kx;
    const minL = this.insets.minLeft;
    if (minL != null && l < minL) {
      l = Math.min(left, minL);
      r = Math.max(0, Math.min(right, W * 0.5 - l));
    }
    const budget = H * (H < 800 ? 0.6 : 0.5);
    let t = top;
    let b = bottom;
    if (t + b > budget) {
      const tMin = Math.min(t, this.insets.minTop ?? 0);
      const bMin = Math.min(b, this.insets.minBottom ?? Math.max(0, b - 12));
      t = Math.max(tMin, budget - b);
      b = Math.max(bMin, budget - t);
    }
    return { left: l, right: r, top: t, bottom: b };
  }

  /** 主点要去的地方（没被挡住那块的中心，相对画布中心） */
  updateViewTarget(snap = false) {
    const e = this.effInsets();
    this.voTo = { x: (e.left - e.right) / 2, y: (e.top - e.bottom) / 2 };
    if (snap) {
      this.vo = { ...this.voTo };
      this.applyView();
    }
  }

  /** 把主点偏移 this.vo 套到相机上：画布是一张更大的虚拟画面里的一扇窗，焦距（像素）不变 */
  applyView() {
    setPrincipal(this.camera, this.container.clientWidth || 1, this.container.clientHeight || 1, this.vo.x, this.vo.y);
  }

  /** 镜头是不是还停在上次 frame() 对好的位置（或正在飞过去） */
  isFramed() {
    if (this.tween) return true;
    const f = this._framed;
    if (!f) return false;
    return this.camera.position.distanceTo(f.pos) < 0.05 && this.controls.target.distanceTo(f.target) < 0.05;
  }

  // ───────────────────────── 场景 ─────────────────────────

  /**
   * 整个场景重建（换平面图时）。plan：v2（v1 也行，这里先迁移）；墙按楼层自己算（model.buildAllWalls，在 buildStack 里）。
   * floorView：打开时看哪一层（'all' | floorId；无效 / 单层 = 'all'）。
   */
  setScene({ plan, furniture, materials, time, title, subtitle, frame = true, floorView }) {
    this.disposeRoot();
    plan = migratePlan(plan);
    this.plan = plan;
    this.lib.applyAll(materials);
    this.updateRoomKey(true);
    const stack = buildStack(plan, this.lib, { title, subtitle });
    this.stack = stack;
    this.floors = stack.floors;
    this.floorMap = new Map(stack.floors.map((F) => [F.id, F]));
    this.roomFloor = new Map(plan.floors.flatMap((f) => f.rooms.map((r) => [r.id, f.id])));
    this.wallsBy = stack.walls;
    this.stackTop = stack.top;
    this.root.add(stack.group);
    // this.house：老接口（诊断面板、测试脚本、走进去的工具都读它）—— 整栋楼的外框、树、字牌；windows / rooms / wallH = 现在这一层
    const top = stack.floors[stack.floors.length - 1];
    this.house = { group: stack.group, wallSets: stack.floors.flatMap((F) => F.wallSets), windows: top.windows, rooms: top.rooms, bounds: stack.bounds, wallH: top.ceil, trees: stack.trees, plaques: stack.plaques, pane: stack.pane, floors: stack.floors, stack };
    if (this.ceilingsOn) this.setCeilings(true);
    this.setupRoomLights(top.rooms, top.ceil);
    this.fitShadow(stack.bounds);
    const view = floorView && floorView !== 'all' && this.floorMap.has(floorView) && stack.floors.length > 1 ? floorView : 'all';
    this.setFloorView(view, { instant: true, quiet: true });
    this.setFurniture(furniture);
    this.setTime(time ?? this.time);
    if (frame) this.frame('iso', false);
    this.lastCut = null;
    this.dirty = true;
    this.cb.onFloorView?.(this.floorView);
  }

  disposeRoot() {
    // 家具组挂在楼层组里：先摘下来（不跟着楼层一起释放；setFurniture 会把没变的那些挂回新的楼层）
    for (const g of this.items.values()) g.removeFromParent();
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

  /** 把灯池放到（只在「这一层」）：每个房间里最高的那盏灯（落地灯 / 吊灯优先）→ 没有灯的房间放一盏吸顶的柔光 → 剩下的灯具 */
  placeRoomLights() {
    if (!this.roomLights.length || !this.rooms) return;
    const bulbMat = this.lib.fixed.bulb;
    const bulbs = [];
    const F = this.floors[this.activeIdx];
    const furn = F?.furn || this.furn;
    furn.updateMatrixWorld(true);
    furn.traverse((o) => {
      if (o.isMesh && o.material === bulbMat && isVisible(o)) bulbs.push({ pos: o.getWorldPosition(new THREE.Vector3()), used: false });
    });
    const H = (F?.elev || 0) + (this.wallH || 2.8);
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
      // 强度 / 照射距离 = 这盏灯自己的 × 时段的（深夜更亮、照得更远：daylight().lampPower / lampReach）
      l.userData.dist = s.dist;
      l.distance = s.dist * (this.day?.lampReach ?? 1);
      l.userData.color = s.color;
      l.color.set(s.color).multiply(this._wbLamp);
      l.userData.base = s.base;
    });
    this.applyNightKey();
  }

  /**
   * 夜里按房间「测光」：墙、地板、柜体这几大块越暗，夜里的补光、环境光（被灯照亮的天花板）、灯就越亮（最多 2 倍）——
   * 像夜景摄影师按房间补光：炭灰墙 + 胡桃木的「沉浸」留得住墙和地板的中间调，浅色方案照旧（不会被照成白天）。
   * 白天、黄昏不起作用（乘的是 night）。换材质时慢慢跟过去（loop 里缓动，像相机的自动测光），换平面图 / 打开方案时直接到位。
   */
  updateRoomKey(snap = false) {
    this.roomKey.to = roomKeyFor(this.lib.current);
    if (snap || !(this.day?.night > 0)) {
      this.roomKey.now = this.roomKey.to;
      this.applyNightKey();
    }
  }

  /**
   * 补光 / 环境光 / 夜灯的强度 = daylight 给的 × 房间测光（只在夜里：1 + (k − 1) × night）。
   * 灯只跟一半：点光源贴着灯罩、墙面，乘满了灯旁边会烧白（'high' 的辉光变成一团），中间调交给补光和天花板的反光
   */
  applyNightKey() {
    const d = this.day;
    if (!d) return;
    const k = 1 + (this.roomKey.now - 1) * d.night;
    const kLamp = 1 + (k - 1) * 0.5;
    this.fill.intensity = (d.fillIntensity || 0) * k;
    // 被楼上盖住（楼上藏着、还在挡太阳）：白天环境光补一点
    this.scene.environmentIntensity = d.envIntensity * k * (1 + COVER.env * this.coverFrac * (1 - d.night));
    this.hemi.intensity = d.hemiIntensity * (1 + COVER.hemi * this.coverFrac * (1 - d.night));
    for (const l of this.roomLights) l.intensity = (l.userData.base || 0) * d.lamps * (d.lampPower ?? 1) * kLamp;
  }

  /**
   * 白天：「这一层」最大的几扇外窗各放一块面光源，朝屋里打「窗口的天光」（只在 'high'）。
   * 数量固定（4 块）：换楼层只是挪位置，不会让材质重新编译。
   */
  setupWindowLights(windows) {
    if (!this.rectOK) {
      for (const l of this.windowLights) this.scene.remove(l);
      this.windowLights = [];
      return;
    }
    const N = 4;
    while (this.windowLights.length < N) {
      const l = new THREE.RectAreaLight(new THREE.Color(1, 1, 1), 0, 1, 1);
      this.scene.add(l);
      this.windowLights.push(l);
    }
    const area = (w) => w.a.distanceTo(w.b) * (w.head - w.sill);
    const big = [...(windows || [])].sort((a, b) => area(b) - area(a)).slice(0, N);
    for (let i = 0; i < N; i++) {
      const w = big[i];
      const l = this.windowLights[i];
      l.userData.k = 0;
      l.intensity = 0;
      if (w) {
        const mid = w.a.clone().add(w.b).multiplyScalar(0.5);
        mid.y = (w.elev || 0) + (w.sill + w.head) / 2;
        mid.addScaledVector(w.inward, 0.08);
        l.position.copy(mid);
        l.width = Math.max(0.3, w.a.distanceTo(w.b) - 0.1);
        l.height = Math.max(0.3, w.head - w.sill - 0.1);
        l.lookAt(mid.clone().add(w.inward));
        l.userData.k = 1;
      } else l.position.set(0, -50, 0);
    }
  }

  fitShadow(bb) {
    this.center = new THREE.Vector3(bb.cx, 0, bb.cy);
    this.radius = Math.hypot(bb.w, bb.d) / 2;
    this.sun.target.position.copy(this.center);
    // 投影的东西：整栋楼（藏起来的楼层也在挡太阳）+ 底座 + 窗外看不见的树（只在影子层）
    const H = (this.stackTop || this.house?.wallH || 2.8) + 0.2;
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

  /** 每件家具都按现在的画质档重建（换档时：分段数 / 叶子数跟着变）。选中的那件 id 不变，选框会跟上 */
  rebuildFurniture() {
    if (!this.items.size) return;
    const list = [...this.itemData.values()];
    for (const g of this.items.values()) {
      g.removeFromParent();
      disposeItem(g);
    }
    this.items.clear();
    this.itemData.clear();
    this.setFurniture(list);
  }

  /** 一件家具在哪一层（item.floor → 它的房间在哪一层 → 一楼） */
  floorRec(it) {
    return (it && (this.floorMap.get(it.floor) || this.floorMap.get(this.roomFloor.get(it.room)))) || this.floors[0] || null;
  }

  /** 家具：按 id 增量更新（只重建变了的那件；拿掉 / 重建的那件，它自己的几何体释放掉）。每件放进它那一层的家具组（item.floor） */
  setFurniture(items) {
    const keep = new Set();
    for (const it of items) {
      keep.add(it.id);
      const F = this.floorRec(it);
      const parent = F?.furn || this.furn;
      const prev = this.itemData.get(it.id);
      const same = prev && JSON.stringify({ ...prev, x: 0, z: 0, rot: 0 }) === JSON.stringify({ ...it, x: 0, z: 0, rot: 0 });
      if (same) {
        const g = this.items.get(it.id);
        g.position.set(it.x, it.y || 0, it.z);
        g.rotation.y = ((it.rot || 0) * Math.PI) / 180;
        if (g.parent !== parent) parent.add(g);
      } else {
        // 变了的那件重建：旧的从场景拿掉，它自己的几何体释放（材质是共用的，不动）
        const old = this.items.get(it.id);
        if (old) {
          old.removeFromParent();
          disposeItem(old);
          this.items.delete(it.id);
        }
        const g = buildItem(it, { wallH: F?.ceil || this.plan?.floors?.[0]?.ceil || 2.8 });
        if (!g) {
          this.itemData.delete(it.id);
          continue;
        }
        if (CATALOG[it.kind]?.ceiling) g.position.y = 0;
        this.items.set(it.id, g);
        parent.add(g);
      }
      this.items.get(it.id).userData.elev = F?.elev || 0;
      this.itemData.set(it.id, it);
    }
    for (const id of [...this.items.keys()])
      if (!keep.has(id)) {
        const old = this.items.get(id);
        old.removeFromParent();
        disposeItem(old);
        this.items.delete(id);
        this.itemData.delete(id);
      }
    // 墙件贴墙：每次都重算（件可能挪了；换平面图时 setScene 先建好新墙再调这里）
    for (const [id, g] of this.items) if (WALL_BACKED.has(g.userData.kind)) this.alignWallItem(g, this.itemData.get(id));
    this.markCovered();
    this.applyCovered();
    this.refreshFeatureMode();
    this.collectPickables();
    this.computeAnchors();
    this.placeRoomLights();
    if (this.selected && !this.items.has(this.selected)) this.select(null);
    this.updateSelBox();
    this.dirty = true;
  }

  /**
   * 电视墙 / 主题墙贴墙。furniture.js 把它们从背面（局部 z = 0）往前建，而 furnish.js 和界面都按「占地中心」摆 ——
   * 不处理的话整面墙板离墙 d/2（电视墙 0.23m），默认视角里看得到它黑色的背板，电视柜也比 furnish 算的往房间里多出 0.2m。
   * 这里只挪组里的子物体（组的位置仍 = 数据里的 x/z：选框、撤销、收纳对账都不受影响）：
   *   ① 背面对齐占地的背边；② 身后 35cm 内（或嵌进墙 30cm 内）有一道平行的墙 → 贴上去，离墙面 4mm。
   * 按实际包围盒算：furniture.js 以后自己把原点挪到中心、或 furnish 换了摆法，都不会挪两次、也不会嵌进墙里。
   * 顺便记下它贴着的那几段墙（墙被切低时墙板跟着收起来，见 refreshFeatureMode）。
   */
  alignWallItem(g, it) {
    if (!g || !it) return;
    const ud = g.userData;
    if (ud.backZ == null) {
      const b = itemBox(g, { local: true });
      ud.backZ = b.isEmpty() ? 0 : b.min.z;
      ud.shiftZ = 0;
    }
    const d = +(it.d ?? CATALOG[it.kind]?.size?.[1]) || 0;
    let back = -d / 2;
    const hit = this.wallBehind(it, back);
    if (hit && Math.abs(hit.gap - WALL_SNAP.rest) > WALL_SNAP.tol) back += WALL_SNAP.rest - hit.gap;
    ud.wallSets = hit ? hit.sets : null;
    const shift = back - ud.backZ;
    const delta = shift - ud.shiftZ;
    if (Math.abs(delta) > 1e-4) {
      for (const c of g.children) c.position.z += delta;
      ud.shiftZ = shift;
    }
  }

  /**
   * 墙件身后的墙：和背面平行、沿墙方向至少重叠 30cm（或半个件宽）、墙线在件中心的背后。
   * backZ = 背面在件自己坐标里的 z。返回 { gap: 背面到墙面的距离（< 0 = 嵌进墙里）, sets: 贴着的那几段墙 } 或 null。
   */
  wallBehind(it, backZ) {
    const sets = this.floorRec(it)?.wallSets;
    if (!sets?.length) return null;
    const rot = (((it.rot || 0) % 360) + 360) % 360;
    const q = Math.round(rot / 90);
    if (Math.abs(rot - q * 90) > 1) return null; // 斜着放的不贴
    const th = (q * Math.PI) / 2;
    // 背面朝向（局部 -z 在世界里）：rot 0 → -z，90 → -x，180 → +z，270 → +x
    const sx = -Math.round(Math.sin(th));
    const sz = -Math.round(Math.cos(th));
    const axis = sx ? 'z' : 'x'; // 背朝 ±x → 身后是一道沿 z 走的墙（x = c）
    const s = sx || sz;
    const C = axis === 'z' ? it.x : it.z;
    const along = axis === 'z' ? it.z : it.x;
    const P = C - s * backZ; // 背面（垂直于墙的那个坐标）
    const half = (+(it.w ?? CATALOG[it.kind]?.size?.[0]) || 1) / 2;
    const need = Math.min(0.3, half);
    const found = [];
    for (const set of sets) {
      const w = set.wall;
      if (!w || w.axis !== axis || (w.c - C) * s <= 0) continue;
      if (Math.min(w.b, along + half) - Math.max(w.a, along - half) < need) continue;
      const gap = (w.c - (s * w.t) / 2 - P) * s;
      if (gap <= WALL_SNAP.reach && gap >= -WALL_SNAP.sink) found.push({ gap, set });
    }
    if (!found.length) return null;
    // 离件最近的那个墙面（厚墙、薄墙接在一条线上时贴厚的那面，不会嵌进去）；同一个面上的几段一起记下
    const gap = Math.min(...found.map((f) => f.gap));
    return { gap, sets: found.filter((f) => f.gap - gap < 0.005).map((f) => f.set) };
  }

  /**
   * 墙件看得见的部分：主题墙按材质（木 = 格栅，其余 = 大板 + 分缝）；
   * 贴着的墙被切低（朝镜头的外墙 / 「全切」）时，墙板和挂在上面的电视一起收起来 —— 和墙一样只留投影；
   * 不然切低的墙上方会立着一块 2.8m 高、背面朝镜头的黑板。电视柜和摆件照常显示。
   */
  refreshFeatureMode() {
    const fm = MAT_BY_ID[this.lib.current.feature];
    const slats = fm?.cat === 'wood' && !fm.board; // 溪岸板材做主题墙 = 大板 + 分缝（和实景里的木饰面墙板一样）
    const { tv, screen } = this.lib.fixed;
    for (const g of this.items.values()) {
      const wallItem = WALL_BACKED.has(g.userData.kind);
      const low = wallItem && !!g.userData.wallSets?.some((s) => s.lowered);
      g.userData.wallLowered = low;
      g.traverse((o) => {
        if (!o.isMesh) return;
        const mode = o.userData.featureMode;
        if (mode) o.visible = (mode === 'slats') === slats;
        if (wallItem && (mode || o.material === tv || o.material === screen)) o.layers.set(low ? SHADOW_LAYER : 0);
      });
    }
    this.pickFeatureAnchor();
  }

  /**
   * 「主题墙」标签点在墙板正面上（电视上方）：电视墙优先，其次主题墙；墙板收起来了就换下一件，都没有就不显示。
   * 记下墙板正面的朝向：镜头在墙板背后时标签不显示（emitAnchors）—— 不会指着一堵素墙说「胡桃木」。
   */
  pickFeatureAnchor() {
    let p = null;
    let n = null;
    const F = this.floors[this.activeIdx];
    for (const [kind, y] of [
      ['tvWall', 1.9],
      ['featureWall', 1.6],
    ]) {
      for (const [id, it] of this.itemData) {
        if (F && this.floorRec(it) !== F) continue;
        const g = it.kind === kind && this.items.get(id);
        if (!g || g.userData.wallLowered) continue;
        g.updateMatrixWorld(true);
        p = g.localToWorld(new THREE.Vector3(0, y, (g.userData.backZ ?? 0) + (g.userData.shiftZ ?? 0) + 0.05));
        n = new THREE.Vector3(0, 0, 1).transformDirection(g.matrixWorld);
        break;
      }
      if (p) break;
    }
    this.featureFacing = n;
    const old = this.anchors?.feature || null;
    if (p ? old && old.distanceToSquared(p) < 1e-6 : !old) return;
    if (this.anchors) this.anchors.feature = p;
    this.anchorsDirty = true;
    this.dirty = true;
  }

  /** 点得到的东西：所有楼层的建筑（藏起来的楼层在影子层，射线本来就碰不到）+ 只有「这一层」的家具 */
  collectPickables() {
    const list = [];
    const F = this.floors[this.activeIdx];
    const walk = (o) => {
      if (o.userData.floorFurniture && o !== F?.furn) return;
      if (o.isMesh && o.visible !== false) list.push(o);
      for (const c of o.children) walk(c);
    };
    walk(this.root);
    this.furn.traverse((o) => o.isMesh && o.visible !== false && list.push(o));
    this.pickables = list;
  }

  setMaterials(materials) {
    this.lib.applyAll(materials);
    this.refreshFeatureMode();
    this.updateRoomKey();
    this.blankWatch.poke();
    this.dirty = true;
  }

  setMaterial(slot, matId) {
    this.lib.apply(slot, matId);
    if (slot === 'feature') this.refreshFeatureMode();
    this.updateRoomKey();
    this.blankWatch.poke();
    this.dirty = true;
  }

  setTime(hour) {
    this.time = hour;
    const d = daylight(hour, this.plan?.north || 0);
    this.day = d;
    const c = this.center || new THREE.Vector3();
    const R = (this.radius || 8) + 14;
    // 白平衡（像室内摄影）：太阳一组、室内灯一组，各自往白校正 —— 黄昏仍然暖、灯罩仍然暖，但材质保持本色
    // （天光 / 环境光 / 半球光 / 窗光已经中和成暖灰，不再乘）
    const wb = wbColor(d, this._wb);
    const wbLamp = wbColor(d, this._wbLamp, 'wbLamp');
    this.sun.position.set(c.x + d.dir[0] * R, d.dir[1] * R, c.z + d.dir[2] * R);
    this.sun.color.set(d.sunColor).multiply(wb);
    this.sun.intensity = d.sunIntensity;
    this.updateTrees(d);
    this.fitShadowToSun();
    // 半球光：天色中和成暖灰（只留两成），地面反光留一半的暖意（已经是中性的，不再乘白平衡）
    neutralColor(d.hemiSky, SKY_TINT, this.hemi.color);
    neutralColor(d.hemiGround, 0.5, this.hemi.groundColor);
    this.hemi.intensity = d.hemiIntensity;
    this.fill.color.set(d.fillColor || PALETTE.stream);
    this.renderer.toneMappingExposure = d.exposure;
    // IBL：同一档（半小时）只建一次（上下文丢失时先不建，恢复后 restoreGPU 会重画）
    if (!this.contextLost && (this.envKey !== d.envKey || !this.scene.environment)) {
      this.scene.environment = this.env.get(d);
      this.envKey = d.envKey;
      // 新的环境贴图（半小时一档，空画面就是从这里来的）：看门狗限速一过就查一次；同一档里拖时间不查（不让 CPU 等 GPU）
      this.blankWatch.poke();
    }
    for (const l of this.roomLights) {
      l.color.set(l.userData.color || LAMP.pool).multiply(wbLamp);
      if (l.userData.dist) l.distance = l.userData.dist * (d.lampReach ?? 1);
    }
    // 补光、环境光、灯的强度（夜里再乘房间测光）
    this.applyNightKey();
    this.placeFill();
    // 窗外的天光卡：白天浅浅的天色、黄昏琥珀、夜里深苔绿（和背景照片里的窗一致）
    this.house?.pane?.color.set(d.paneSky || d.bgSky);
    this.applyWindowLights(d);
    this.lib.setNight(d.lamps);
    // 底座的烫金字：白天亮一点（和受光的石头拉开），夜里收一点（不像霓虹灯；夜里曝光提了 ~0.45 EV，这里收回来）
    for (const m of this.house?.plaques || []) m.material.emissiveIntensity = 0.8 - 0.35 * d.night;
    this.applyPost(d);
    this.applyBeams(d);
    drawBackdrop(this.bgCanvas, this.bgLayers, d, this.demo ? firePulse(performance.now()) : null);
    this.bgTex.needsUpdate = true;
    this.dirty = true;
  }

  /** 窗光是「天光」不是太阳：和环境光一样中和（黄金时段留一点暖） */
  applyWindowLights(d = this.day) {
    if (!d) return;
    const wc = neutralColor(d.windowColor, 0.4);
    for (const l of this.windowLights) {
      l.color.copy(wc);
      l.intensity = l.userData.k * d.windowLight * 2.4;
    }
  }

  /** 光柱（「这一层」的外窗） */
  applyBeams(d = this.day) {
    if (!d) return;
    this.beams.update(d.dir, d.beams, new THREE.Color(d.sunColor).multiply(this._wb));
  }

  /**
   * 窗外看不见的树：只在影子会落到房子上的时候投影 —— 树在太阳和房子之间（房子在光线前进的方向上），
   * 而且太阳够低（< 36°：树冠的影子越过 2.6m 的空地，打在墙上 / 窗里）。
   * 否则（正午、或树在房子背阴的一面）影子会落在空地上：一团找不到是谁投的黑影，不要。
   */
  updateTrees(d) {
    const trees = this.house?.trees;
    if (!trees) return;
    const c = this.center || new THREE.Vector3();
    const lx = -d.dir[0];
    const lz = -d.dir[2];
    const ll = Math.hypot(lx, lz);
    const low = d.elevDeg < 36 && ll > 1e-3;
    for (const t of trees.children) {
      const hx = c.x - t.position.x;
      const hz = c.z - t.position.z;
      const hl = Math.hypot(hx, hz) || 1;
      t.visible = low && (hx * lx + hz * lz) / (hl * ll) > 0.35;
    }
  }

  /** 夜里的补光跟着镜头：从镜头左边 ~20°、抬高 ~43° 打过来（照得到底座正面和墙头，又有一点体积） */
  placeFill() {
    if (!this.fill.intensity) return;
    const t = this.controls.target;
    const v = this.camera.position.clone().sub(t);
    const az = Math.atan2(v.x, v.z) - 0.35;
    const el = 0.75;
    this.fill.position.set(t.x + Math.sin(az) * Math.cos(el) * 20, t.y + Math.sin(el) * 20, t.z + Math.cos(az) * Math.cos(el) * 20);
    this.fill.target.position.copy(t);
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

  /**
   * 「这一层」的墙实际怎么切。多层的「全部」= 看整栋：最上面一层的墙也全立（和下面的楼层一样），
   * 切开朝镜头的外墙留给点了某一层的时候 —— 不然「全部」和「二楼」是同一张图，「全部」像没反应。
   * 「全部放低」照放低；展厅演示（一直绕着转、没有楼层按钮）照切开，让人看得见楼上屋里。单层：照墙按钮。
   */
  activeWallMode() {
    return this.wallMode === 'cut' && this.floorView === 'all' && this.floors.length > 1 && !this.demo ? 'up' : this.wallMode;
  }

  // ───────────────────────── 楼层 ─────────────────────────

  /**
   * 看哪一层：'all' | floorId。像 The Sims / Matterport：
   *  · 上面的楼层：所有网格换到影子层（镜头看不见、照样挡太阳），家具藏起来（也不进影子）；
   *  · 这一层：墙照墙的切法（cut / down / up）；下面的楼层：墙全立、家具照常；
   *  · 'all' = 全部看得见，最上面一层是「这一层」，它的墙也全立（看整栋；activeWallMode）—— 切开的样子是点了某一层才有。
   * 只换图层 / 可见性（不重建、不重新编译着色器）；镜头的目标点平移到这一层（700ms）。
   * 点选、拖动（拖动平面在这一层的地面）、加家具（groundAt）、材质标签、夜灯、窗光、光柱都跟着「这一层」。
   * opts.instant：镜头不动（setScene / 演示用）；opts.quiet：不通知界面（cb.onFloorView）。
   */
  setFloorView(view = 'all', { instant = false, quiet = false } = {}) {
    const n = this.floors.length;
    if (!n) return;
    let idx = view === 'all' ? n - 1 : this.floors.findIndex((F) => F.id === view);
    if (idx < 0 || n < 2) {
      view = 'all';
      idx = n - 1;
    }
    const framed = !instant && this.isFramed();
    const y0 = this.targetY();
    this.floorView = view;
    this.activeIdx = idx;
    this.floors.forEach((F, i) => {
      const hide = i > idx;
      if (hide !== F.hidden) {
        // 藏起来的楼层：墙先全部立起来（影子是整面墙的），再整层换到「只投影」的那一层（HIDDEN_LAYER）
        if (hide) applyCutaway(F.wallSets, null, 'up');
        setLayer(F.group, hide ? HIDDEN_LAYER : 0, F.furn);
        F.hidden = hide;
      }
      F.furn.visible = !hide;
    });
    this.applyCovered();
    const F = this.floors[idx];
    this.dragPlane.constant = -F.elev;
    if (this.house) {
      this.house.windows = F.windows;
      this.house.rooms = F.rooms;
      this.house.wallH = F.ceil;
    }
    this.rooms = F.rooms;
    this.wallH = F.ceil;
    this.beams.setWindows(F.windows);
    this.setupWindowLights(F.windows);
    // 楼上藏起来、还在挡太阳：这一层被盖住多少，白天的环境光就补多少（COVER）
    this.coverFrac = idx < n - 1 ? F.cover || 0 : 0;
    this.applyNightKey();
    this.applyWindowLights();
    this.applyBeams();
    this.lastCut = null;
    if (this.selected && this.floorRec(this.itemData.get(this.selected)) !== F) this.select(null);
    if (this.hovered) {
      this.hovered = null;
      this.hovBox.visible = false;
      this.cb.onHover?.(null);
    }
    this.refreshFeatureMode();
    this.collectPickables();
    this.computeAnchors();
    this.placeRoomLights();
    if (!instant && this.center && !this.demo) {
      if (framed) this.frame(this.lastView, true, FLOOR_TWEEN);
      else {
        // 用户自己转过 / 缩放过：角度和远近不变，只把镜头和目标点一起平移到这一层的高度
        const dy = this.targetY() - y0;
        if (Math.abs(dy) > 1e-3) {
          const fromP = this.camera.position.clone();
          const fromT = this.controls.target.clone();
          this.tween = { t0: performance.now(), dur: FLOOR_TWEEN, fromP, fromT, toP: fromP.clone().setY(fromP.y + dy), toT: fromT.clone().setY(fromT.y + dy) };
        }
      }
    }
    this.dirty = true;
    if (!quiet) this.cb.onFloorView?.(view);
  }

  /** 现在「这一层」（'all' = 最上面一层）：{ id, level, elev, ceil, height, group, furn, bounds, … } */
  interactiveFloor() {
    return this.floors[this.activeIdx] || null;
  }

  /**
   * 楼下「被楼板盖住」的家具（看楼上 / 全部的时候）：上面是整块楼板、四周是整面的墙，从镜头那里根本看不见 ——
   * 不画（省三角形：iPad 的预算）。不算被盖住的：户外（车廊、院子、阳台）、楼梯口 / 挑空 2m 以内（斜着往下看得见）、
   * 占地伸出上面楼板的。窗户在远处只有十几个像素、屋里是暗的，看不出少了家具。
   * 镜头拉近（< 0.6 × 取景距离：凑到窗前看屋里）、截图时全部画回来。只是 visible 开关（不重建、不重编着色器）。
   */
  markCovered() {
    const HOLE = 2.0; // 离楼板上的洞 2m 以内的照常画（3m 层高、35° 俯角，从洞口斜着看进去大约这么远）
    const WIN = 2.0; // 离外墙的窗 / 落地玻璃 2m 以内的照常画（≥ 40° 俯角透过窗看得见的那一段）
    const STEP = 0.25;
    const segGap = (w, x0, y0, x1, y1) => {
      // 窗（一段沿 x 或 z 的线段，这一层的坐标）到占地矩形的距离
      const ax = Math.min(w.a.x, w.b.x);
      const bx = Math.max(w.a.x, w.b.x);
      const az = Math.min(w.a.z, w.b.z);
      const bz = Math.max(w.a.z, w.b.z);
      return Math.hypot(Math.max(0, ax - x1, x0 - bx), Math.max(0, az - y1, y0 - bz));
    };
    const inPlates = (plates, x, y) => plates.some((p) => x >= p.x0 - 1e-3 && x <= p.x1 + 1e-3 && y >= p.y0 - 1e-3 && y <= p.y1 + 1e-3);
    const gap = (h, x0, y0, x1, y1) => Math.hypot(Math.max(0, h.x0 - x1, x0 - h.x1), Math.max(0, h.y0 - y1, y0 - h.y1));
    for (const [id, g] of this.items) {
      const it = this.itemData.get(id);
      const F = this.floorRec(it);
      const above = F && this.floors[F.level + 1];
      let covered = false;
      const room = above && it?.room ? this.plan?.floors?.[F.level]?.rooms.find((r) => r.id === it.room) : null;
      const T = room && ROOM_TYPES[room.type];
      if (room && !isOutdoor(room.type) && !T?.void && !T?.stair && above.plates?.length) {
        // 占地（转 90° 的话宽深对调）
        const [w0, d0] = CATALOG[it.kind]?.size || [1, 1];
        const q = Math.round((((it.rot || 0) % 360) + 360) % 360 / 90) % 2;
        const hw = (q ? it.d || d0 : it.w || w0) / 2;
        const hd = (q ? it.w || w0 : it.d || d0) / 2;
        const x0 = it.x - hw;
        const x1 = it.x + hw;
        const y0 = it.z - hd;
        const y1 = it.z + hd;
        if (it.kind !== 'curtains' && !(above.holes || []).some((h) => gap(h, x0, y0, x1, y1) < HOLE) && !(F.windows || []).some((w) => segGap(w, x0, y0, x1, y1) < WIN)) {
          covered = true;
          const nx = Math.max(1, Math.ceil((x1 - x0) / STEP));
          const ny = Math.max(1, Math.ceil((y1 - y0) / STEP));
          for (let i = 0; i <= nx && covered; i++)
            for (let j = 0; j <= ny && covered; j++) if (!inPlates(above.plates, x0 + ((x1 - x0) * i) / nx, y0 + ((y1 - y0) * j) / ny)) covered = false;
        }
      }
      g.userData.covered = covered;
    }
  }

  /** 按现在看的楼层 + 镜头远近，开关楼下被盖住的家具（markCovered） */
  applyCovered() {
    const far = !this._showAll && !this._near;
    let n = 0;
    for (const [id, g] of this.items) {
      const F = this.floorRec(this.itemData.get(id));
      const hide = far && !!g.userData.covered && !!F && F.level < this.activeIdx;
      if (g.visible === hide) {
        g.visible = !hide;
        n++;
      }
    }
    if (n) this.dirty = true;
  }

  /**
   * 镜头拉近了（< 0.6 × 上一次取景的距离）或压得很低（俯角 < 40°：透过窗看得进屋里很深）：
   * 楼下被盖住的家具也画（applyCovered）
   */
  isNear() {
    const f = this._framed;
    if (!f) return false;
    const d = this.camera.position.distanceTo(this.controls.target);
    if (d < 1e-6) return true;
    const el = Math.asin(Math.max(-1, Math.min(1, (this.camera.position.y - this.controls.target.y) / d)));
    return d < 0.6 * f.pos.distanceTo(f.target) || el < (40 * Math.PI) / 180;
  }

  /**
   * 镜头远近变了没有（isNear）→ 开关楼下被盖住的家具。force：一定重新算、重新开关；否则只在镜头或目标点
   * 离上次检查的位置挪过（> 1mm）时算，远近真的变了才开关（loop 每帧调用：平时只是两次向量比较）。
   */
  checkNear(force = false) {
    const p = this.camera.position;
    const tg = this.controls.target;
    let at = this._nearAt;
    if (!at) at = this._nearAt = { p: new THREE.Vector3(Infinity, 0, 0), t: new THREE.Vector3() };
    if (!force && at.p.distanceToSquared(p) < 1e-6 && at.t.distanceToSquared(tg) < 1e-6) return;
    at.p.copy(p);
    at.t.copy(tg);
    const near = this.isNear();
    if (near !== this._near || force) {
      this._near = near;
      this.applyCovered();
    }
  }

  /** 这件家具在哪一层（floorId） */
  floorOf(itemId) {
    const it = this.itemData.get(itemId);
    return it ? this.floorRec(it)?.id ?? null : null;
  }

  /** 屏幕上这一点落在「这一层」地面的哪里（加家具用）→ { x, z, floorId }；点到天上 = 这一层的中心 */
  groundAt(clientX, clientY) {
    const F = this.floors[this.activeIdx];
    const p = new THREE.Vector3();
    const hit = this.rayAt(clientX, clientY).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(F?.elev || 0)), p);
    const bb = F?.bounds || this.house?.bounds;
    if (!hit) return { x: bb ? bb.cx : (this.center?.x ?? 0), z: bb ? bb.cy : (this.center?.z ?? 0), floorId: F?.id ?? null };
    return { x: p.x, z: p.z, floorId: F?.id ?? null };
  }

  /** 天花：模型平时是掀了顶的；走进去的时候盖上（看得见、也挡太阳） */
  setCeilings(on) {
    this.ceilingsOn = !!on;
    for (const F of this.floors)
      if (F.ceiling) {
        F.ceiling.visible = this.ceilingsOn;
        F.ceiling.castShadow = this.ceilingsOn;
      }
    this.dirty = true;
  }

  /**
   * 走进去模式用的导航数据（平面图米；elev 加上去就是世界的 y）：
   * { floors:[{ id, level, elev, ceil, height, rooms, walls, openings }], stairs:[ model.stairPath(…) ] }
   */
  navData() {
    const plan = this.plan;
    if (!plan?.floors) return { floors: [], stairs: [] };
    return {
      floors: this.floors.map((F, i) => ({ id: F.id, level: F.level, elev: F.elev, ceil: F.ceil, height: F.height, rooms: plan.floors[i].rooms, walls: this.wallsBy?.[F.id] || [], openings: plan.floors[i].openings })),
      stairs: (plan.stairs || []).map((s) => stairPath(plan, s.id)).filter(Boolean),
    };
  }

  // ───────────────────────── 相机 ─────────────────────────

  /**
   * 对好镜头：按模型（房子 + 底座）的八个角精确算距离，让它刚好放进「没被面板挡住」的那一块（留一点呼吸），
   * 再把目标点挪一挪，让投影出来的模型在那一块里居中。
   * 演示模式（展厅电视）：没有面板；镜头会一直绕着转，所以按一整圈里最占地方的那个角度来算 ——
   * 房子大约占满电视画面的 65%（最宽的角度 ~80%）。
   */
  frame(view = 'iso', animate = true, dur = 900) {
    if (view !== 'demo') this.lastView = view;
    const v = VIEWS[view] || VIEWS.iso;
    this.updateViewTarget(!animate);
    const fit = this.fitView(v.az, v.el, view === 'demo' || this.demo);
    const { pos, target, dist } = fit;
    this.controls.minDistance = (this.radius || 8) * 0.35;
    this.controls.maxDistance = Math.max(dist * 2.2, (this.radius || 8) * 3);
    this._framed = { pos: pos.clone(), target: target.clone() };
    // 清掉 OrbitControls 的惯性（演示时自动环绕、手指甩出去的余量），否则取景结束后镜头还会自己滑一点
    this.controls._sphericalDelta?.set(0, 0, 0);
    this.controls._panOffset?.set(0, 0, 0);
    if (!animate) {
      this.tween = null;
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      // 一下子对好（生成 3D、撤销 / 重做、开机）：镜头远近变了，楼下被盖住的家具马上重新开关（loop 也会补，这里不等那一帧）
      if (this.floors.length > 1) this.checkNear(true);
      this.placeFill();
      this.dirty = true;
      return;
    }
    this.tween = { t0: performance.now(), dur, fromP: this.camera.position.clone(), fromT: this.controls.target.clone(), toP: pos, toT: target };
  }

  /**
   * 取景的上下范围：单层 / 「全部」= 底座到整栋楼最高的天花；看某一层 = 下面那层露出 1.2m 到这一层的天花
   * （看二楼时底座可以出画）。
   */
  frameYRange() {
    const F = this.floors[this.activeIdx];
    if (!F) return [-0.66, this.house?.wallH || 2.8];
    if (this.floorView === 'all' || this.floors.length < 2) return [-0.66, this.stackTop];
    return [Math.max(-0.66, F.elev - 1.2), F.elev + F.ceil];
  }

  /** 镜头目标点的高度：单层 1.05m（和以前一样）；看某一层 = 那一层地面 + 1.05；「全部」= 整栋楼的中间 */
  targetY() {
    const F = this.floors[this.activeIdx];
    if (!F || this.floors.length < 2) return 1.05;
    if (this.floorView === 'all') return Math.max(1.05, (this.stackTop - 0.66) / 2);
    return F.elev + 1.05;
  }

  /** 模型的八个角（房子 + 底座；墙按全高算 —— 'cut' 模式下远处的墙还是立着的） */
  modelCorners() {
    const bb = this.house?.bounds;
    if (!bb) {
      const c = this.center || new THREE.Vector3();
      const r = this.radius || 8;
      return [-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [-0.66, 2.8].map((y) => new THREE.Vector3(c.x + (sx * r) / 1.5, y, c.z + (sz * r) / 1.5))));
    }
    const m = 0.36;
    const ys = this.frameYRange();
    const pts = [];
    for (const x of [bb.x0 - m, bb.x1 + m]) for (const z of [bb.y0 - m, bb.y1 + m]) for (const y of ys) pts.push(new THREE.Vector3(x, y, z));
    return pts;
  }

  /**
   * 针孔相机的精确取景：镜头沿 D 往后退到 dist，点 p 的屏幕坐标 u = f·(p·R)/(dist − p·D)。
   * 要 |u| ≤ 半宽、|v| ≤ 半高 → dist ≥ p·D + f·max(|p·R|/半宽, |p·U|/半高)，取所有角的最大值（闭式解）。
   * 然后把目标点在屏幕平面里挪到投影的中心，再算一遍（两三轮就收敛）。
   * opt：给别的画面取景（概念图、日光小图）—— W / H 画面尺寸、insets 留白、margin 占多少（不给就按画布和面板算）。
   */
  fitView(azDeg, elDeg, demo = false, opt = {}) {
    const W = opt.W || this.container.clientWidth || 1;
    const H = opt.H || this.container.clientHeight || 1;
    const ins = opt.insets || (demo ? { left: 0, right: 0, top: 0, bottom: 0 } : this.effInsets());
    const f = H / 2 / Math.tan(THREE.MathUtils.degToRad(BASE_FOV) / 2);
    // 留白：大屏多留一点；窄屏（竖屏 iPad / 手机）少留一点，模型不要太小。
    // 界面还没告诉过面板在哪（setInsets 没调用过）：按以前的经验多留白，别钻到面板底下
    const narrow = W - ins.left - ins.right < 560;
    const margin = opt.margin || (demo ? 0.8 : !this._insetsSet ? (W > 900 ? 0.62 : 0.84) : narrow ? 0.94 : 0.9);
    const hw = ((W - ins.left - ins.right) / 2) * margin;
    const hh = ((H - ins.top - ins.bottom) / 2) * margin;
    const corners = this.modelCorners();
    const c0 = this.center || new THREE.Vector3();
    const el = THREE.MathUtils.degToRad(elDeg);
    const up = new THREE.Vector3(0, 1, 0);
    const basis = (az) => {
      const D = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      const R = new THREE.Vector3().crossVectors(D.clone().negate(), up).normalize();
      const U = new THREE.Vector3().crossVectors(R, D.clone().negate()).normalize();
      return { D, R, U };
    };
    const distFor = (T, { D, R, U }) => {
      let dist = 0;
      const q = new THREE.Vector3();
      for (const p of corners) {
        q.copy(p).sub(T);
        dist = Math.max(dist, q.dot(D) + f * Math.max(Math.abs(q.dot(R)) / hw, Math.abs(q.dot(U)) / hh));
      }
      return dist;
    };
    const azs = demo ? Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2) : [THREE.MathUtils.degToRad(azDeg)];
    // 目标点：演示时就是模型中心（一直在转，不按某一个角度居中）；平时按投影居中
    const mid = new THREE.Vector3(c0.x, this.targetY(), c0.z);
    let T = mid.clone();
    const B = basis(THREE.MathUtils.degToRad(azDeg));
    let dist = 0;
    if (demo) {
      for (const az of azs) dist = Math.max(dist, distFor(T, basis(az)));
    } else {
      for (let it = 0; it < 3; it++) {
        dist = distFor(T, B);
        let u0 = Infinity;
        let u1 = -Infinity;
        let v0 = Infinity;
        let v1 = -Infinity;
        const q = new THREE.Vector3();
        for (const p of corners) {
          q.copy(p).sub(T);
          const z = dist - q.dot(B.D);
          const u = (f * q.dot(B.R)) / z;
          const w = (f * q.dot(B.U)) / z;
          u0 = Math.min(u0, u);
          u1 = Math.max(u1, u);
          v0 = Math.min(v0, w);
          v1 = Math.max(v1, w);
        }
        const du = (u0 + u1) / 2;
        const dv = (v0 + v1) / 2;
        if (Math.abs(du) < 0.5 && Math.abs(dv) < 0.5) break;
        T = T.clone().addScaledVector(B.R, (du * dist) / f).addScaledVector(B.U, (dv * dist) / f);
      }
      dist = distFor(T, B);
    }
    const dir = demo ? basis(THREE.MathUtils.degToRad(azDeg)).D : B.D;
    const pos = T.clone().addScaledVector(dir, dist);
    return { pos, target: T, dist };
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
      // 点穿玻璃、窗外的天光卡（只是窗外的颜色，不是东西）
      if (mat?.userData?.fixed === 'glass' || mat?.userData?.fixed === 'pane' || (mat?.transparent && mat.opacity < 0.3)) continue;
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
    if (g) fitRing(this.selBox, g, g.userData.elev || 0);
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
            // 拖动平面在这件家具那一层的地面上（dragPlane.constant = −标高）；只能拖到这一层的范围里
            const bb = this.floorRec(this.itemData.get(down.id))?.bounds || this.house?.bounds;
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
          if (g) fitRing(this.hovBox, g, g.userData.elev || 0);
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

  /** 材质标签的锚点：只在「这一层」（'all' = 最上面一层）找沙发、床、柜子、地板、外墙 */
  computeAnchors() {
    const A = {};
    const F = this.floors[this.activeIdx];
    const elev = F?.elev || 0;
    const kindPoint = (kind, y) => {
      for (const [, it] of this.itemData) if (it.kind === kind && (!F || this.floorRec(it) === F)) return new THREE.Vector3(it.x, elev + y, it.z);
      return null;
    };
    A.upholstery = kindPoint('sofa', 0.62) || kindPoint('armchair', 0.6);
    A.bedding = kindPoint('bed', 0.62) || kindPoint('kidsBed', 0.6);
    A.cabinetry = kindPoint('wardrobe', 1.9) || kindPoint('kitchenRun', 1.8) || kindPoint('shoeCabinet', 1.8);
    const rooms = (this.plan?.floors?.[this.activeIdx]?.rooms || []).filter((r) => !ROOM_TYPES[r.type]?.void && !ROOM_TYPES[r.type]?.stair);
    const biggest = [...rooms].filter((r) => !isOutdoor(r.type)).sort((a, b) => b.w * b.d - a.w * a.d)[0];
    const liv = rooms.find((r) => r.type === 'living') || rooms.find((r) => r.type === 'family') || biggest || rooms[0];
    if (liv) A.floor = new THREE.Vector3(liv.x + liv.w * 0.3, elev + 0.02, liv.y + liv.d * 0.75);
    // 墙：离默认镜头最远的一面外墙
    let best = null;
    let bestD = Infinity;
    const camDir = new THREE.Vector3(Math.sin(0.56), 0, Math.cos(0.56));
    for (const s of F?.wallSets || this.house?.wallSets || []) {
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
      A.walls = best.axis === 'x' ? new THREE.Vector3(m, elev + 2.0, best.c) : new THREE.Vector3(best.c, elev + 2.0, m);
    }
    this.anchors = A;
    this.anchorsDirty = true;
    // 主题墙：点在墙板上，墙板收起来（墙切低）时不显示 —— 跟着切墙变，见 refreshFeatureMode
    this.pickFeatureAnchor();
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
      let visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      // 主题墙：只在看得到墙板正面时标（镜头在它背后 / 几乎平着看时不标）
      if (visible && slot === 'feature' && this.featureFacing) visible = this.featureFacing.dot(_v.copy(this.camera.position).sub(p).normalize()) > 0.12;
      out.push({ slot, x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height, visible });
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
    // 只算看得见的部件：墙切低时收起来的墙板 / 电视不算，选择条不会飘在半空
    let b = itemBox(g, { camera: this.camera });
    if (b.isEmpty()) b = new THREE.Box3().setFromObject(g);
    const p = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y + 0.15, (b.min.z + b.max.z) / 2).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height };
  }

  // ───────────────────────── 输出 ─────────────────────────

  renderNow() {
    if (this.composer) {
      if (this.dof) this.dof.focus = this.camera.position.distanceTo(this.controls.target);
      this.composer.render();
      this.blankWatch.afterFrame();
    } else this.renderer.render(this.scene, this.camera);
  }

  /**
   * 高清截图（隐藏选框）。像素比有上限：长边最多 3200（'fast' 2560）像素、也不超过显卡的最大尺寸 ——
   * 大 iPad 上 3× 的后期链要好几百 MB 显存，会直接把 WebGL 上下文挤掉。
   * 交给客人的图里没有面板：主点偏移拿掉；镜头还停在对好的位置，就按「没有面板」的整张画面重新取景
   * （模型回到正中、放回该有的大小 —— 不是给面板留白后缩小的那个）。用户自己转过 / 缩放过，就照他的角度和远近截。
   * toBlob 在调用的那一刻就复制了画面，所以同一帧里马上把镜头、目标点、主点、补光原样放回去：屏幕上看不到跳动。
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
    const keep = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), target: this.controls.target.clone(), vo: this.vo, voTo: this.voTo, tween: this.tween };
    const refit = !!this.center && !this.demo && this.isFramed();
    let done;
    const blob = new Promise((res) => (done = res));
    this._prOverride = Math.max(Math.min(base, long / Math.max(w, h)), Math.min(3, base * scale, long / Math.max(w, h)));
    try {
      // 截图（概念图）：楼下被盖住的家具也画（只画这一张，不在乎快慢）
      this._showAll = true;
      this.applyCovered();
      this.vo = { x: 0, y: 0 };
      this.voTo = { x: 0, y: 0 };
      if (refit) {
        const v = VIEWS[this.lastView] || VIEWS.iso;
        const fit = this.fitView(v.az, v.el, false, { insets: NO_INSETS, margin: w / h >= 1.15 ? SNAP_MARGIN.wide : SNAP_MARGIN.tall });
        this.tween = null;
        this.camera.position.copy(fit.pos);
        this.controls.target.copy(fit.target);
        this.camera.lookAt(fit.target);
        this.placeFill();
      }
      this.resize();
      this.camera.updateMatrixWorld();
      this.renderNow();
      this.renderer.domElement.toBlob(done, 'image/png');
    } catch (err) {
      done(null);
      throw err;
    } finally {
      this._prOverride = 0;
      this.vo = keep.vo;
      this.voTo = keep.voTo;
      this.camera.position.copy(keep.pos);
      this.camera.quaternion.copy(keep.quat);
      this.controls.target.copy(keep.target);
      this.tween = keep.tween;
      this.placeFill();
      this.resize();
      this.selBox.visible = sel;
      this.hovBox.visible = hov;
      this._showAll = false;
      this.applyCovered();
      this.dirty = true;
    }
    return blob;
  }

  /**
   * 四个时段的小图（日光面板用）：在同一帧里渲染、截取、复原，不会闪。用一台自己的相机（主相机不动）：
   * 镜头还停在对好的位置 → 按小图的比例、没有面板重新取景，房子占满小图，底下留一条给时段的名字；
   * 用户自己转过 / 缩放过 → 用他现在的角度和远近（只拿掉主点偏移）。
   */
  thumbs(hours, w = 168, h = 104) {
    if (this.contextLost) return [];
    const keep = this.time;
    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    const sel = this.selBox.visible;
    const hov = this.hovBox.visible;
    this.selBox.visible = this.hovBox.visible = false;
    const cam = this.camera.clone();
    if (this.center && !this.demo && this.isFramed()) {
      const label = Math.round(h * THUMB.label);
      const v = VIEWS[this.lastView] || VIEWS.iso;
      const fit = this.fitView(v.az, v.el, false, { W: w, H: h, insets: { left: 0, right: 0, top: 0, bottom: label }, margin: THUMB.margin });
      cam.position.copy(fit.pos);
      cam.lookAt(fit.target);
      setPrincipal(cam, w, h, 0, -label / 2);
    } else setPrincipal(cam, w, h, 0, 0);
    cam.updateMatrixWorld();
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
    this.hovBox.visible = hov;
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
    // 多层的「全部」：演示时墙照切开，平时全立（activeWallMode）—— 下一帧重新切
    this.lastCut = null;
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
      // 多层：演示时看整栋（退出时回到原来那一层）
      this._preDemoView = this.floors.length > 1 && this.floorView !== 'all' ? this.floorView : null;
      if (this._preDemoView) this.setFloorView('all', { instant: true });
      // 演示：没有面板（主点回到画面中心），镜头靠近一点，按一整圈里最占地方的角度取景
      if (this.center) this.frame('demo');
      else this.updateViewTarget();
    } else {
      this.cb.onTime?.(this.time);
      this._lastAnchors = null;
      if (this._preDemoView && this.floorMap.has(this._preDemoView)) this.setFloorView(this._preDemoView, { instant: true });
      this._preDemoView = null;
      // 退出：回到演示前的视角，面板留白也回来
      if (this.center) this.frame(this.lastView || 'iso');
      else this.updateViewTarget();
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
    // 面板开合：主点平滑地挪到新的中心（~0.3 秒）
    const vx = this.voTo.x - this.vo.x;
    const vy = this.voTo.y - this.vo.y;
    if (Math.abs(vx) > 0.25 || Math.abs(vy) > 0.25) {
      const k = 1 - Math.exp(-dt * 9);
      this.vo = Math.abs(vx) + Math.abs(vy) < 1 ? { ...this.voTo } : { x: this.vo.x + vx * k, y: this.vo.y + vy * k };
      this.applyView();
      this.dirty = true;
    }
    // 夜里换了深 / 浅材质：房间测光慢慢跟过去（~0.5 秒，像相机的自动测光，不是一下跳）
    const kd = this.roomKey.to - this.roomKey.now;
    if (Math.abs(kd) > 1e-3) {
      this.roomKey.now = Math.abs(kd) < 0.01 ? this.roomKey.to : this.roomKey.now + kd * (1 - Math.exp(-dt * 6));
      this.applyNightKey();
      this.dirty = true;
    }
    // 传 dt：自动环绕按真实时间转，帧率高低都一样快
    const moved = this.controls.update(dt);
    if (this.lib.pulse(t)) this.dirty = true;
    if (moved) this.dirty = true;
    // 镜头拉近 / 拉远：楼下被盖住的家具开 / 关（多层才有）。不只看 OrbitControls 说动了没有：
    // 程序直接摆的镜头（frame 不带动画、走进去模式）也算 —— 镜头和目标点跟上次检查时不一样就重新算
    if (this.floors.length > 1) this.checkNear();
    if (!this.dirty) return;
    if (moved || this.tween) this.placeFill();
    // 墙的切法跟着镜头：「这一层」照墙的切法，下面的楼层墙全立，上面的楼层藏着（setFloorView）；多层的「全部」= 墙全立
    const camDir = this.camera.position.clone().sub(this.controls.target).setY(0).normalize();
    if (this.floors.length && (this.lastCut == null || camDir.distanceTo(this.lastCut) > 0.02)) {
      let changed = false;
      const mode = this.activeWallMode();
      this.floors.forEach((F, i) => {
        if (i > this.activeIdx) return;
        if (applyCutaway(F.wallSets, camDir, i === this.activeIdx ? mode : 'up')) changed = true;
      });
      if (changed) {
        // 墙切低 / 立起来：贴着它的墙板、电视跟着收起 / 回来（还有「主题墙」标签）
        this.refreshFeatureMode();
        this.collectPickables();
      }
      this.lastCut = camDir;
    }
    this.renderNow();
    this._frames = (this._frames || 0) + 1;
    if (!this.demo) {
      this.emitAnchors();
      this.emitSelMove();
    }
    this.dirty = false;
  }

  dispose() {
    this.running = false;
    clearTimeout(this._refitT);
    this.blankWatch.dispose();
    cancelAnimationFrame(this._raf);
    this._unbind?.();
    this.ro.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this._onLost, false);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this._onRestored, false);
    this.controls.dispose();
    this.disposeRoot();
    disposeHouseKit(this.lib);
    this.lib.dispose();
    this.env.dispose();
    this.bgTex?.dispose();
    this.beams.dispose?.();
    for (const ring of [this.selBox, this.hovBox])
      ring.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
    if (this.composer) {
      for (const p of this.composer.passes) p.dispose?.();
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** 一整组（跳过 skip 那一支：家具组自己管可见性）换图层 */
function setLayer(o, layer, skip) {
  if (o === skip) return;
  if (o.isMesh || o.isLine || o.isPoints) o.layers.set(layer);
  for (const c of o.children) setLayer(c, layer, skip);
}

function isVisible(o) {
  let p = o;
  while (p) {
    if (p.visible === false) return false;
    p = p.parent;
  }
  return true;
}

/**
 * 主点偏移（ox, oy 像素，+ = 往右 / 往下）套到一台透视相机上：W×H 的画面是一张更大的虚拟画面里的一扇窗，焦距（像素）不变。
 * 引擎的主相机（面板留白）和日光小图的相机（给底下的字留白）都用它。
 */
function setPrincipal(cam, W, H, ox, oy) {
  if (Math.abs(ox) < 0.25 && Math.abs(oy) < 0.25) {
    cam.fov = BASE_FOV;
    cam.aspect = W / H;
    cam.clearViewOffset();
    return;
  }
  const fw = W + 2 * Math.abs(ox);
  const fh = H + 2 * Math.abs(oy);
  cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(BASE_FOV) / 2) * fh) / H));
  cam.setViewOffset(fw, fh, Math.abs(ox) - ox, Math.abs(oy) - oy, W, H);
}

/**
 * 一件家具从场景里拿掉时：它自己合并出来的几何体（每件一份）释放掉；缓存里共用的几何（geom.js 标了 cached）不动；
 * 叶子实例只释放实例数据（几何是缓存的）。材质永远是共用的（表面 / 固定材质），绝不释放。
 */
function disposeItem(g) {
  g?.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    else if (o.isMesh && o.geometry && !o.geometry.userData?.cached) o.geometry.dispose();
  });
}

/**
 * 一件家具里网格的包围盒。local：用组自己的坐标（不管放在哪、朝哪；藏起来的部件也算）；
 * camera：只算这个镜头看得见的部件（墙切低时收起来的墙板 / 电视不算）。
 */
function itemBox(g, { local = false, camera = null } = {}) {
  g.updateMatrixWorld(true);
  const inv = local ? new THREE.Matrix4().copy(g.matrixWorld).invert() : null;
  const box = new THREE.Box3();
  const b = new THREE.Box3();
  const m = new THREE.Matrix4();
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (camera && (!o.layers.test(camera.layers) || !isVisible(o))) return;
    if (o.isInstancedMesh) {
      if (!o.boundingBox) o.computeBoundingBox();
      b.copy(o.boundingBox);
    } else {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      b.copy(o.geometry.boundingBox);
    }
    if (!b.isEmpty()) box.union(b.applyMatrix4(local ? m.multiplyMatrices(inv, o.matrixWorld) : o.matrixWorld));
  });
  return box;
}

// ───────────────────────── 软阴影：PCF 多采样 ─────────────────────────
// three r183 的 PCF 只取 5 个 Vogel 点（加大半径就会出颗粒）。改成 N 个点（每个点硬件双线性 = 4 tap），
// 半影变得平滑。只改字符串、找不到就不改（升级 three 也不会坏）。

// 换画质档时会用新的采样数重新改一次（从原始的那份改）；之后新编译的着色器就用新的采样数。
let SOFT_SRC = null;
let SOFT_TAPS = 0;
function patchSoftShadows(taps) {
  if (taps === SOFT_TAPS) return;
  SOFT_SRC ??= THREE.ShaderChunk.shadowmap_pars_fragment;
  const chunk = SOFT_SRC;
  // 0 = 用 three 原版（兼容档）
  if (!taps) {
    THREE.ShaderChunk.shadowmap_pars_fragment = chunk;
    SOFT_TAPS = 0;
    return;
  }
  const re = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \)[\s\S]*?\) \* 0\.2;/;
  if (!re.test(chunk)) return;
  SOFT_TAPS = taps;
  // 一行一个采样点（不用 for 循环）：Windows 的 Chrome 走 ANGLE → Direct3D，循环里的阴影比较采样（SampleCmp）
  // 在一些显卡 / 驱动上编译不过，整栋房子就画不出来。three 原版也是这样一行一行写的。
  const taps_ = Array.from({ length: taps }, (_, i) => `shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( ${i}, ${taps}, phi ) * radius, shadowCoord.z ) );`);
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replace(re, `shadow = 0.0;\n\t\t\t\t${taps_.join('\n\t\t\t\t')}\n\t\t\t\tshadow /= float( ${taps} );`);
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
  ${HDR_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    // 地平线有方向：朝太阳那边暖，背对太阳那边偏天空的冷色 → 黄昏时阴影是冷的、受光面是暖的
    vec2 sh = normalize(sunDir.xz + vec2(1e-4));
    vec2 dh = normalize(d.xz + vec2(1e-4));
    // 底数夹到 [0, 1]：正背对太阳的纹素 dot 会舍入成 -1.0000001 → 底数 -6e-8，手机 GPU 上 pow(负数) = NaN，
    // 整张环境贴图被模糊出一大片 NaN（某些半小时整屏变透明的根源，见 hdrguard.js）
    float toward = pow(clamp(dot(dh, sh) * 0.5 + 0.5, 0.0, 1.0), 1.6);
    vec3 hor = mix(mix(zenith, horizon, 0.45), horizon, toward);
    vec3 sky = mix(hor, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
    vec3 below = mix(hor * 0.55, ground, smoothstep(0.0, 0.35, -h));
    vec3 c = h >= 0.0 ? sky : below;
    float s = max(dot(d, normalize(sunDir)), 0.0);
    c += sunCol * glow * (pow(s, 6.0) * 0.9 + pow(s, 48.0) * 1.6) * smoothstep(-0.15, 0.1, h);
    gl_FragColor = vec4(hdrSafe(c * gain), 1.0);
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
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), side: THREE.DoubleSide, toneMapped: false }));
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

  /**
   * 天穹按 VI 的暖灰打底：天顶 / 地平线只留两成天色（SKY_TINT），地面反光留一半（已经是中性的，不乘白平衡）；
   * 太阳方向的那团暖晕保留（黄昏时亮面上的高光是金色的），它和太阳一样乘白平衡；几块暖灯面乘室内灯的白平衡。
   */
  configure(d) {
    const u = this.u;
    const day = 1 - d.night;
    const wb = wbColor(d);
    neutralColor(d.skyZenith, SKY_TINT, u.zenith.value);
    neutralColor(d.skyHorizon, SKY_TINT, u.horizon.value);
    neutralColor(d.skyGround, 0.5, u.ground.value);
    u.sunDir.value.set(d.dir[0], Math.max(0.02, d.dir[1]), d.dir[2]);
    u.sunCol.value.set(d.sunColor).multiply(wb);
    u.glow.value = d.up ? 0.2 + 0.8 * d.golden : 0.04;
    // 天穹整体亮度：白天的天光 ~0.5（配合太阳，阴影里不死黑、受光面有体积）；夜里是一点月色
    u.gain.value = 0.62 * day + 1.6 * d.night;
    const white = STUDIO_WHITE.clone();
    const warmSun = new THREE.Color(d.sunColor).multiply(wb);
    const keyC = white.clone().lerp(warmSun, 0.2 * d.golden);
    // 夜里顶上这块柔光箱变成「被灯照亮的天花板」：暖白的漫反射（金属 / 亮面里看得到房间；深夜它是房间里柔和的底光，
    // 深色的墙和地板靠它留住中间调）。黄昏只有一点
    const ceil = new THREE.Color(LAMP.ceiling).multiply(wbColor(d, undefined, 'wbLamp'));
    this.key.material.color.copy(keyC).multiplyScalar(1.9 * day).add(ceil.multiplyScalar((0.16 + 0.34 * d.night) * d.lamps));
    this.stripA.material.color.copy(white).multiplyScalar(1.5 * day + 0.06);
    this.stripB.material.color.copy(white).multiplyScalar(1.1 * day + 0.04);
    const lampC = new THREE.Color(LAMP.lamp).multiply(wbColor(d, undefined, 'wbLamp'));
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

/** 场景画到一个多重采样（MSAA）的 HDR 目标里，再交给后面的 pass —— EffectComposer 默认会丢掉抗锯齿。
 *  拷贝时顺便洗干净（NaN → 0、夹到 [0, HDR_MAX]）：GTAO / 景深 / 辉光 / 输出都不会再拿到 NaN / Inf */
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
        fragmentShader: HDR_COPY_FRAG,
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
      // 出口洗干净：GTAO 里冒出来的 NaN 到这里为止（见 hdrguard.js）
      fragmentShader: guardFrag(DOF_FRAG),
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

/** 输出：色调映射 + sRGB（three 自带）之后，再加一点暗角和抖动（深色渐变不出色带）；色调映射之前先把读进来的颜色洗干净 */
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
  out.material.fragmentShader = guardOutputShader(out.material.fragmentShader);
  return out;
}

// ───────────────────────── 背景：一张「虚化的室内照片」 ─────────────────────────
// 像相机对焦在模型上、背景是失焦的落地窗；下面是地面上窗光的倒影。全部预先画好、模糊好，换时间只是叠色（很快）。
// 窗外是两处风景（和许愿之旅里的风景同一套）：
// · 白天 —— 四姑娘山雨后的森林：一层层冷杉和山脊，层与层之间漂着雾；越远越淡，跟着天色变暖 / 变冷（相乘叠色）；
// · 黄昏到夜里 —— 瓜拉雪兰莪河边的红树林：低低的树冠、水里的倒影，萤火虫一点点亮起来（演示模式里它们一起「呼吸」）。

/** canvas 的 filter（blur）：Safari 18 以前没有 → 用「缩小再放大」做失焦 */
function canvasFilterOK() {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    return typeof c.getContext('2d').filter === 'string';
  } catch {
    return false;
  }
}

const rgbOf = (hex) => {
  const n = parseInt(String(hex).slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex, a) => `rgba(${rgbOf(hex).join(',')},${a})`;

function makeBackdropLayers(W, H) {
  const mk = (w = W, h = H) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };
  const k = W / 1024;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const filterOK = canvasFilterOK();
  /** 失焦：新的一张画布 */
  const soften = (src, px) => {
    const out = mk();
    const o = out.getContext('2d');
    if (filterOK) {
      o.filter = `blur(${Math.max(1, Math.round(px))}px)`;
      o.drawImage(src, 0, 0);
      o.filter = 'none';
      return out;
    }
    const f = Math.max(2, Math.min(16, Math.round(px / 1.5)));
    const s1 = mk(W / f, H / f);
    const c1 = s1.getContext('2d');
    c1.imageSmoothingQuality = 'high';
    c1.drawImage(src, 0, 0, s1.width, s1.height);
    const s2 = mk(W / 2, H / 2);
    const c2 = s2.getContext('2d');
    c2.imageSmoothingQuality = 'high';
    c2.drawImage(s1, 0, 0, s2.width, s2.height);
    o.imageSmoothingQuality = 'high';
    o.drawImage(s2, 0, 0, W, H);
    return out;
  };
  const maskBy = (canvas, mask) => {
    const c = canvas.getContext('2d');
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(mask, 0, 0);
    c.globalCompositeOperation = 'source-over';
    return canvas;
  };

  // 窗（白色遮罩）：一整面落地窗，竖框宽窄交替，上面有一道横档
  const top = H * 0.07;
  const bot = H * 0.6;
  const sharp = mk();
  const w = sharp.getContext('2d');
  w.fillStyle = 'white';
  let x = -W * 0.03;
  let i = 0;
  while (x < W * 1.03) {
    const pw = (i % 3 === 2 ? 0.07 : 0.135) * W;
    w.fillRect(x, top, pw, bot - top);
    x += pw + 0.018 * W;
    i++;
  }
  w.globalCompositeOperation = 'destination-out';
  w.fillRect(0, top + (bot - top) * 0.2, W, 0.012 * W);
  w.globalCompositeOperation = 'source-over';
  const win = soften(sharp, 13 * k);

  // ── 白天：雨后的冷杉林（相乘层：白 = 不变；越近越深；雾 = 往白里推，天色就从雾里透出来） ──
  const moss = (t) => mixHex(PALETTE.card, PALETTE.accent, t);
  const celadon = (t) => mixHex(PALETTE.card, PALETTE.stream, t);
  const forestSharp = mk();
  const f = forestSharp.getContext('2d');
  f.fillStyle = 'white';
  f.fillRect(0, 0, W, H);
  const ridge = (base, amp, color) => {
    f.fillStyle = color;
    f.beginPath();
    f.moveTo(0, H);
    for (let px = 0; px <= W + 1; px += W / 64) {
      const u = px / W;
      const n = Math.sin(u * 5.3 + 1.1) * 0.45 + Math.sin(u * 13.1 + 0.4) * 0.22 + Math.max(0, Math.sin(u * 3.2 + 2.2)) ** 6 * 0.8 + (rnd() - 0.5) * 0.12;
      f.lineTo(px, base - amp * (0.55 + n));
    }
    f.lineTo(W, H);
    f.closePath();
    f.fill();
  };
  const mist = (y, h, a) => {
    const g = f.createLinearGradient(0, y - h, 0, y + h);
    g.addColorStop(0, rgba(PALETTE.card, 0));
    g.addColorStop(0.5, rgba(PALETTE.card, a));
    g.addColorStop(1, rgba(PALETTE.card, 0));
    f.fillStyle = g;
    f.fillRect(0, y - h, W, h * 2);
    // 一缕缕的雾
    for (let j = 0; j < 7; j++) {
      f.fillStyle = rgba(PALETTE.card, a * (0.35 + rnd() * 0.4));
      f.beginPath();
      f.ellipse(rnd() * W, y + (rnd() - 0.5) * h, (0.08 + rnd() * 0.16) * W, h * (0.18 + rnd() * 0.22), 0, 0, Math.PI * 2);
      f.fill();
    }
  };
  const firs = (base, n, h0, h1, w0, w1, color) => {
    f.fillStyle = color;
    f.fillRect(0, base, W, H - base);
    for (let j = 0; j < n; j++) {
      const cx = ((j + rnd()) / n) * W * 1.06 - W * 0.03;
      // 高矮错落：偶尔一棵特别高的
      const h = (h0 + (h1 - h0) * rnd() ** 1.6 * (rnd() < 0.12 ? 1.35 : 1)) * H;
      const tw = (w0 + rnd() * (w1 - w0)) * W;
      const b = base + rnd() * 0.01 * H;
      f.beginPath();
      // 冷杉：细高的尖顶，两三层枝（失焦后就是一排「尖尖的」林线）
      for (let tier = 0; tier < 3; tier++) {
        const ty = b - h * tier * 0.26;
        const ww = tw * (1 - tier * 0.27);
        f.moveTo(cx, ty - h * (0.62 - tier * 0.02) - (tier === 2 ? h * 0.12 : 0));
        f.lineTo(cx + ww * 0.5, ty);
        f.lineTo(cx - ww * 0.5, ty);
        f.closePath();
      }
      f.fill();
    }
  };
  // 远山（四姑娘山的山脊）→ 雾 → 远林 → 雾 → 中林 → 薄雾 → 近处的林线
  ridge(H * 0.3, H * 0.06, celadon(0.26));
  mist(H * 0.335, H * 0.05, 0.8);
  firs(H * 0.415, 90, 0.035, 0.08, 0.006, 0.011, celadon(0.42));
  mist(H * 0.425, H * 0.035, 0.78);
  firs(H * 0.495, 64, 0.06, 0.13, 0.009, 0.016, moss(0.42));
  mist(H * 0.505, H * 0.028, 0.62);
  firs(H * 0.585, 42, 0.1, 0.21, 0.014, 0.026, moss(0.72));
  mist(H * 0.6, H * 0.02, 0.4);
  const forest = maskBy(soften(forestSharp, 7 * k), win);

  // ── 黄昏：红树林、河、倒影（相乘层） ──
  const river = H * 0.505;
  const crowns = mk();
  const cr = crowns.getContext('2d');
  cr.fillStyle = 'black';
  cr.fillRect(0, river - 0.035 * H, W, 0.035 * H);
  for (let j = 0; j < 70; j++) {
    const cx = rnd() * W * 1.06 - W * 0.03;
    const ry = (0.022 + rnd() * 0.04) * H;
    cr.beginPath();
    cr.ellipse(cx, river - 0.03 * H - rnd() * 0.035 * H, (0.025 + rnd() * 0.05) * W, ry, 0, 0, Math.PI * 2);
    cr.fill();
  }
  const duskSharp = mk();
  const m = duskSharp.getContext('2d');
  m.fillStyle = 'white';
  m.fillRect(0, 0, W, H);
  // 水：比天色略暗一点（倒映着天）
  m.fillStyle = celadon(0.32);
  m.fillRect(0, river, W, H - river);
  // 倒影：翻过来、压扁、淡一点
  m.save();
  m.globalAlpha = 0.5;
  m.translate(0, river * 2);
  m.scale(1, -1);
  m.drawImage(crowns, 0, 0);
  m.restore();
  // 树冠剪影（用遮罩上色）
  const tintCrowns = mk();
  const tc = tintCrowns.getContext('2d');
  tc.drawImage(crowns, 0, 0);
  tc.globalCompositeOperation = 'source-in';
  tc.fillStyle = mixHex(PALETTE.card, PALETTE.dusk, 0.94);
  tc.fillRect(0, 0, W, H);
  m.drawImage(tintCrowns, 0, 0);
  const dusk = maskBy(soften(duskSharp, 6 * k), win);

  // ── 萤火虫：大多在树冠里，少数飞得高一点；水里有淡淡的倒影。分两组，演示时错开一点一起「呼吸」 ──
  const fireA = mk();
  const fireB = mk();
  for (let j = 0; j < 150; j++) {
    const c = (j % 2 ? fireA : fireB).getContext('2d');
    const fx = rnd() * W;
    const high = rnd() < 0.18;
    const fy = river - (0.012 + rnd() * (high ? 0.16 : 0.075)) * H;
    const r = (0.8 + rnd() * 1.5) * k;
    const glow = (cx, cy, rr, a) => {
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, rr * 4);
      g.addColorStop(0, rgba(PALETTE.firefly, a));
      g.addColorStop(0.3, rgba(PALETTE.firefly, a * 0.32));
      g.addColorStop(1, rgba(PALETTE.firefly, 0));
      c.fillStyle = g;
      c.fillRect(cx - rr * 4, cy - rr * 4, rr * 8, rr * 8);
    };
    glow(fx, fy, r, 0.95);
    const ry = river + (river - fy) * 0.85;
    if (ry < bot) glow(fx, ry, r * 0.9, 0.28);
  }
  const fA = maskBy(soften(fireA, 1.2 * k), win);
  const fB = maskBy(soften(fireB, 1.2 * k), win);

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
  return { win, forest, dusk, fireA: fA, fireB: fB, vig, grain, tint: mk(), top, bot };
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

const smooth01 = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 演示模式：两组萤火虫慢慢一起「呼吸」（错开一点相位，约 1.4 秒一次） */
function firePulse(ms) {
  const s = ms / 1000;
  return [0.5 + 0.5 * Math.sin(s * 2.2) ** 2, 0.45 + 0.5 * Math.sin(s * 2.2 + 1.1) ** 2];
}

/** pulse：萤火虫两组的亮度（0–1，演示模式里随时间变；平时 null = 常亮） */
function drawBackdrop(canvas, layers, d, pulse = null) {
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
  // 3 窗外：白天雨后的森林、黄昏的红树林（都是相乘：只会压暗，天色从雾里、水里透出来）
  ctx.globalCompositeOperation = 'multiply';
  if (night < 0.99) {
    ctx.globalAlpha = 0.85 * (1 - night);
    ctx.drawImage(layers.forest, 0, 0);
  }
  if (night > 0.01) {
    ctx.globalAlpha = night;
    ctx.drawImage(layers.dusk, 0, 0);
  }
  // 萤火虫（加法）：天黑下来才亮
  const ff = smooth01(0.3, 0.9, night);
  if (ff > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = ff * (pulse ? pulse[0] : 1);
    ctx.drawImage(layers.fireA, 0, 0);
    ctx.globalAlpha = ff * (pulse ? pulse[1] : 0.85);
    ctx.drawImage(layers.fireB, 0, 0);
  }
  ctx.globalCompositeOperation = 'source-over';
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
const _v = new THREE.Vector3();
/** 地面光圈：放在这件家具那一层的地面上（elev） */
function fitRing(ring, obj, elev = 0) {
  _box.setFromObject(obj);
  const r = Math.max(0.35, Math.hypot(_box.max.x - _box.min.x, _box.max.z - _box.min.z) / 2 + 0.08);
  ring.position.set((_box.min.x + _box.max.x) / 2, elev + 0.015, (_box.min.z + _box.max.z) / 2);
  ring.scale.setScalar(r);
}
