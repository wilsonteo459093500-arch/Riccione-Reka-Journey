// HDR 守门：高画质（后期链）在某些手机显卡上会整屏变透明 —— 一个 NaN / Inf 像素进了半精度的 HDR 缓冲，
// 辉光（UnrealBloom）把它抹到整个画面、连 alpha 一起变成 NaN，画布就成了 rgba(0,0,0,0)，只看得见网页底色。
// （Galaxy Fold / Adreno 750：天穹的 pow() 底数在正背对太阳的那几个纹素是 -6e-8，手机 GPU 上 pow(负数) = NaN，
//   环境贴图按半小时缓存，所以只有某些钟点会空；SwiftShader 把负底数当绝对值算，无头浏览器里从来看不到）
// 三层：
// 1. 源头：天穹 / 光柱的 pow() 底数夹好；three 的材质在 opaque_fragment 里把出射光洗干净（NaN → 0、夹到 [0, HDR_MAX]）；
//    自己写的着色器（天穹、光柱）用 HDR_GLSL 洗；
// 2. 后期链：每一处读上一步画面（tDiffuse）的地方都在读出来的那一刻洗（MSAA 拷贝、景深、辉光的亮部提取、输出），
//    景深和辉光的出口再洗一次；输出最后把 alpha 写成 1 —— GTAO 里自己冒出 NaN，也只坏几个像素，画布永远不会透明；
// 3. 看门狗：后期链画完一帧，偶尔读一行像素；连续几次整行透明 / 全黑，而且换一种画法是正常的
//    → 像着色器编译失败那样自动降档（high → fast / safe）。
// NaN 用位运算认（指数位全 1、尾数非 0）：驱动的 fast-math 可能把 x != x、isnan() 优化掉，min / max / clamp
// 遇到 NaN 各家显卡的结果也不一样（有的返回另一个数，有的返回 NaN），整数运算不会被优化掉。
// 位运算最稳的用法是用在「刚从纹理读出来」的值上（编译器对它没有任何假设）—— 所以后期链在读的那一刻洗。
// 注入点都是 three 0.183 着色器里的原句：找不到就原样返回、console.warn 一次（?diag=1 的面板看得到），
// test/hdrguard.test.mjs 钉住这些注入点（升级 three 时测试会先报出来）。

import { ShaderChunk } from 'three';

/** HDR 的上限：实测最亮的像素约 23（夜里瓷砖亮边上的灯光高光），白天 ≤ 12；镜面反射的太阳高光（金属上）会到几万 ——
 *  16384 让这些高光照样有辉光，又不会溢出半精度的 65504：MSAA 平均、景深、辉光的模糊都是加权平均（≤ 16384），
 *  辉光合成的出口也夹到 16384，叠回画面最多 32768；场景里唯一的加法混合（光柱）本身很暗 */
export const HDR_MAX = 16384;
const HMAX = HDR_MAX.toFixed(1);

/**
 * GLSL 小函数（放在 main 之前）：hdrSafe(float / vec3)、hdrAlpha(float)、hdrFetch(sampler2D, vec2)。
 * WebGL2 的 ShaderMaterial / three 自带材质都是 GLSL ES 3.00 → 位运算；RawShaderMaterial（OutputPass）是 1.00 → 只能靠比较。
 * （GLSL 里的注释只用 ASCII：OutputPass 是 GLSL ES 1.00，有的编译器不收非 ASCII 字符）
 */
export const HDR_GLSL = /* glsl */ `
#ifndef HDR_GUARD
#define HDR_GUARD
#if __VERSION__ >= 300
float hdrSafe( float x ) {
  highp uint b = floatBitsToUint( x );
  x = uintBitsToFloat( ( b & 0x7fffffffu ) > 0x7f800000u ? 0u : b );
  return clamp( x, 0.0, ${HMAX} );
}
vec3 hdrSafe( vec3 c ) {
  highp uvec3 b = floatBitsToUint( c );
  highp uvec3 keep = uvec3( lessThanEqual( b & 0x7fffffffu, uvec3( 0x7f800000u ) ) ) * 0xffffffffu;
  return clamp( uintBitsToFloat( b & keep ), 0.0, ${HMAX} );
}
float hdrAlpha( float a ) {
  highp uint b = floatBitsToUint( a );
  return ( b & 0x7fffffffu ) > 0x7f800000u ? 1.0 : clamp( a, 0.0, 1.0 );
}
#else
float hdrSafe( float x ) {
  return ( x >= 0.0 && x <= ${HMAX} ) ? x : ( x > ${HMAX} ? ${HMAX} : 0.0 );
}
vec3 hdrSafe( vec3 c ) {
  return vec3( hdrSafe( c.r ), hdrSafe( c.g ), hdrSafe( c.b ) );
}
float hdrAlpha( float a ) {
  return ( a >= 0.0 && a <= 1.0 ) ? a : ( a > 1.0 ? 1.0 : ( a < 0.0 ? 0.0 : 1.0 ) );
}
#endif
// read the previous pass and clean the value right away (bit tests are most robust on a fetched value)
vec4 hdrFetch( sampler2D t, vec2 uv ) {
  vec4 c = texture2D( t, uv );
  return vec4( hdrSafe( c.rgb ), hdrAlpha( c.a ) );
}
#endif
`;

/** 后期链第一步（MSAA 目标 → 后面的 pass）：拷贝的同时洗干净 */
export const HDR_COPY_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
varying vec2 vUv;
${HDR_GLSL}
void main() {
  gl_FragColor = hdrFetch( tDiffuse, vUv );
}
`;

/** 注入点找不到（three 改了着色器）：守门就没装上 —— 提醒一次（diag.js 会把 console.warn 显示在 ?diag=1 的面板里） */
const WARNED = new Set();
function missing(what, src) {
  if (!WARNED.has(what)) {
    WARNED.add(what);
    console.warn(`[WISH studio] hdrguard: no injection site for ${what} (three.js shader changed?) — this guard is off`);
  }
  return src;
}

// three 自带材质的出口：gl_FragColor = vec4( outgoingLight, diffuseColor.a ) 之前把出射光洗干净。
// 只改字符串、找不到就不改（升级 three 也不会坏）；要在任何材质编译之前调用（Engine 的构造函数里，和色调映射的补丁一起）
const OPAQUE_FIX = /* glsl */ `
#if __VERSION__ >= 300
{
  highp uvec3 hdrB = floatBitsToUint( outgoingLight );
  outgoingLight = uintBitsToFloat( hdrB & ( uvec3( lessThanEqual( hdrB & 0x7fffffffu, uvec3( 0x7f800000u ) ) ) * 0xffffffffu ) );
}
#endif
outgoingLight = clamp( outgoingLight, 0.0, ${HMAX} );
`;

let CHUNK_PATCHED = false;
export function patchHdrChunks() {
  if (CHUNK_PATCHED) return;
  const re = /gl_FragColor = vec4\( outgoingLight, diffuseColor\.a \);/;
  if (!re.test(ShaderChunk.opaque_fragment)) return void missing('opaque_fragment', '');
  ShaderChunk.opaque_fragment = ShaderChunk.opaque_fragment.replace(re, `${OPAQUE_FIX}\n$&`);
  CHUNK_PATCHED = true;
}

/** 把 HDR_GLSL 放到 main 前面、在 at 那一句后面插 fix；找不到就原样返回 */
function inject(src, at, fix) {
  const m = src.indexOf('void main');
  const i = src.indexOf(at);
  if (m < 0 || i < m) return src;
  const j = i + at.length;
  return src.slice(0, m) + HDR_GLSL + '\n' + src.slice(m, j) + fix + src.slice(j);
}

/**
 * ShaderMaterial（GLSL 3.00）洗干净：main 里每一处 texture2D( tDiffuse, … ) 换成 hdrFetch（读出来就洗）；
 * 原来的 main 改名 hdrMain，新的 main 调它、再把 gl_FragColor 洗一遍（中途 return 的分支也洗得到）。
 * alpha 可以换成别的式子（辉光合成用 0.0）。已经洗过的原样返回；找不到 main 就原样返回（并提醒一次）。
 */
export function guardFrag(src, alpha = 'hdrAlpha( gl_FragColor.a )', what = 'guardFrag') {
  if (src.includes('hdrMain')) return src;
  const m = /\bvoid\s+main\s*\(\s*(void\s*)?\)/.exec(src);
  if (!m) return missing(what, src);
  const body = src.slice(m.index + m[0].length).replace(/\btexture2D\s*\(\s*tDiffuse\s*,/g, 'hdrFetch( tDiffuse,');
  return `${src.slice(0, m.index)}${HDR_GLSL}\nvoid hdrMain()${body}
void main() {
  hdrMain();
  gl_FragColor = vec4( hdrSafe( gl_FragColor.rgb ), ${alpha} );
}
`;
}

/**
 * OutputPass（RawShaderMaterial，GLSL 1.00）：色调映射之前把读进来的颜色洗干净（前面几层已经是位运算洗过的，这里是最后一道）；
 * main 的最后一句把 alpha 写成 1 —— 场景本来就有不透明的背景，这样不管哪家显卡的 NaN / 比较语义，画布都不会变透明
 */
export function guardOutputShader(src) {
  const out = inject(src, 'gl_FragColor = texture2D( tDiffuse, vUv );', '\n\t\t\tgl_FragColor = vec4( hdrSafe( gl_FragColor.rgb ), hdrAlpha( gl_FragColor.a ) );');
  const end = out.lastIndexOf('}');
  if (out === src || end < 0) return missing('OutputPass', src);
  return `${out.slice(0, end)}\tgl_FragColor.a = 1.0;\n\t\t${out.slice(end)}`;
}

/**
 * 辉光：亮部提取读画面的那一刻就洗、出口再洗（一个 NaN 像素再也不会被模糊成整屏）；
 * 合成的出口也洗，alpha 写 0 —— 原版写 max(r, g, b)，加法混合会加到画面的 alpha 上（NaN 就把整个画布变透明）；
 * 画面的 alpha 本来就是 1，画布上看起来一模一样。
 */
export function guardBloom(bloom) {
  for (const [name, alpha] of [
    ['materialHighPassFilter', undefined],
    ['compositeMaterial', '0.0'],
  ]) {
    const m = bloom?.[name];
    if (!m) {
      missing(`UnrealBloomPass.${name}`, '');
      continue;
    }
    const src = m.fragmentShader;
    m.fragmentShader = guardFrag(src, alpha, `UnrealBloomPass.${name}`);
    if (m.fragmentShader !== src) m.needsUpdate = true;
  }
}

/** 显卡名字（给出错时的提示 / 诊断用；拿不到就空字符串） */
export function gpuName(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch {
    return '';
  }
}

// ───────────────────────── 看门狗：后期链画完一帧，画面是不是空的 ─────────────────────────

// 读像素会让 CPU 等 GPU 画完这一帧，所以查得很省（每次只读正中一行）：
// gap：环境贴图换了（跨过半点 / 整点）、材质 / 画质换了之后，最多每秒查一次；
// idle：别的时候（转镜头、演示模式一直在换时间）隔这么久才查一次；retry：发现空了，隔这么久再确认；need：连续几次才算；
// quiet：换一种画法也是空的（场景本身就是黑的）→ 这么久之内不再查
const WATCH = { gap: 1000, idle: 10000, retry: 300, need: 3, quiet: 10000 };

/**
 * 看门狗。Engine 在后期链（composer）把一帧画到屏幕之后调 afterFrame()；环境贴图 / 材质 / 画质变了调 poke()。
 * 读画面正中的一行（不开 preserveDrawingBuffer：画完马上读，和 diag.js 一样）：
 * 全部 alpha = 0（透明，原来的症状）或全部 rgb = 0（洗干净之后 NaN 会变成黑）就算「空」；背景照片铺满整个画面，
 * 正常的一帧不可能整行都是这样。连续 need 次 → probe() 换一种画法再读，画得出东西就降档（Engine.lowerQuality，
 * 和着色器编译失败同一套：记到 window.__genieDiag、调 cb.onRenderProblem({ degradedTo, reason: 'blank' })；
 * 只在这一次打开里有效，setQuality 不写进设置）。都画不出来（镜头贴着全黑的东西）→ 降档没用，不降。
 * 不查的时候：上下文丢了、画布没尺寸、引擎停了、在截高清图（_prOverride）、背景还没画（setTime 之前）、正在降档。
 * 日光小图（thumbs）直接 renderer.render、不经过这里。
 */
export class BlankWatch {
  constructor(engine) {
    this.e = engine;
    this.due = true;
    this.last = -Infinity;
    this.quietUntil = 0;
    this.streak = 0;
    this.timer = 0;
    this.stats = { checks: 0, blank: 0, probes: 0, trips: 0, last: '' };
    this.row = null;
  }

  /** 环境贴图 / 材质 / 画质变了：限速一过就查 */
  poke() {
    this.due = true;
  }

  /** 过 ms 毫秒让引擎再画一帧（引擎只在有变化时才画；静止的画面也要能被复查） */
  later(ms) {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = 0;
      if (this.e.running) this.e.dirty = true;
    }, Math.max(16, ms));
  }

  ready() {
    const e = this.e;
    if (!e.composer || !e.running || e.contextLost || e._prOverride || e._degrading) return false;
    if (!e.day || !e.scene?.background) return false;
    const gl = e.renderer.getContext();
    if (!gl || gl.isContextLost()) return false;
    return gl.drawingBufferWidth >= 8 && gl.drawingBufferHeight >= 8;
  }

  afterFrame() {
    if (!this.ready()) return;
    const now = performance.now();
    if (now < this.quietUntil) return;
    // 演示模式（展厅电视）每 0.1 秒换一次时间、夜里每 0.4 秒就换一张环境贴图：当作没变化，按 idle 查
    const due = this.due && !this.e.demo;
    const gap = this.streak ? WATCH.retry : due ? WATCH.gap : WATCH.idle;
    const wait = gap - (now - this.last);
    if (wait > 0) {
      if (due || this.streak) this.later(wait);
      return;
    }
    this.last = now;
    this.due = false;
    const kind = this.sample();
    if (kind == null) return;
    this.stats.checks++;
    this.stats.last = kind || 'ok';
    if (!kind) {
      this.streak = 0;
      return;
    }
    this.stats.blank++;
    if (++this.streak < WATCH.need) {
      this.later(WATCH.retry);
      return;
    }
    this.streak = 0;
    // 换一种画法：这一帧会留在屏幕上，下一帧照常用后期链画回来
    const next = this.probe();
    this.later(16);
    if (!next) {
      this.stats.last = `${kind}, probes blank too`;
      this.quietUntil = now + WATCH.quiet;
      return;
    }
    this.degrade(kind, next);
  }

  /** 读正中一行：'transparent' | 'black' | ''（正常）；读不到 = null */
  sample() {
    const r = this.e.renderer;
    const gl = r.getContext();
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    if (this.row?.length !== W * 4) this.row = new Uint8Array(W * 4);
    // 先填一个不是「空」的值：readPixels 万一失败（不抛错、只记 GL 错误），缓冲区原样 → 算正常，不会误判
    this.row.fill(127);
    const prev = r.getRenderTarget();
    try {
      if (prev) r.setRenderTarget(null);
      gl.readPixels(0, H >> 1, W, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.row);
    } catch {
      return null;
    } finally {
      if (prev) r.setRenderTarget(prev);
    }
    const px = this.row;
    let opaque = 0;
    let lit = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3]) opaque++;
      if (px[i] || px[i + 1] || px[i + 2]) lit++;
    }
    return !opaque ? 'transparent' : !lit ? 'black' : '';
  }

  /**
   * 后期链画出来是空的：换一种画法再读一次，返回该降到哪一档（都是空的 → null）。这一帧会留在屏幕上（下一帧照常画回来）：
   * 1. 关掉 GTAO / 景深 / 辉光，只用 MSAA + 输出（= 降到 fast 的画法；着色器全是这一档已经编译好的）—— 正常 → 'fast'；
   * 2. 还是空：不经过后期链、直接画到画布上（= 兼容档的画法）。和日光小图（thumbs）是同一套着色器，打开页面不到一秒
   *    小图就画过了，一般也不用重新编译 —— 正常 → 后期链本身坏了：画布自带 MSAA 的设备上 fast 不走后期链 → 'fast'，
   *    否则 fast 也走这条链 → 直接 'safe'。
   */
  probe() {
    const e = this.e;
    const r = e.renderer;
    this.stats.probes++;
    const fx = [e.gtao, e.dof, e.bloom].filter(Boolean);
    if (fx.length) {
      const was = fx.map((p) => p.enabled);
      try {
        for (const p of fx) p.enabled = false;
        e.composer.render();
      } catch {
        /* 交给第 2 种画法 */
      } finally {
        fx.forEach((p, i) => (p.enabled = was[i]));
      }
      if (this.sample() === '') return 'fast';
    }
    try {
      r.setRenderTarget(null);
      r.render(e.scene, e.camera);
    } catch {
      return null;
    }
    if (this.sample() !== '') return null;
    return e.quality === 'high' && e.nativeAA ? 'fast' : 'safe';
  }

  /** 降档（Engine.lowerQuality：和着色器编译失败同一套，等这一帧画完再换） */
  degrade(kind, next) {
    const e = this.e;
    // 探测那一帧也可能碰上着色器编译失败（onShaderError 已经在降档）：不另记一次
    if (e._degrading) return;
    this.stats.trips++;
    const hour = Number.isFinite(e.time) ? e.time.toFixed(2) : '?';
    const how = next === 'fast' && e.gtao ? 'without AO / depth of field / bloom' : 'without post-processing';
    const info = { gpu: gpuName(e.renderer.getContext()), quality: e.quality, reason: 'blank', program: `blank frame after post-processing (${kind}, ${WATCH.need} checks in a row; renders fine ${how}) at hour ${hour}`, vertex: '', fragment: '' };
    console.warn('[WISH studio] blank frame, lowering quality', info);
    e.lowerQuality(info, next);
  }

  dispose() {
    clearTimeout(this.timer);
    this.timer = 0;
  }
}
