// sfx.js — WISH 音效 · the sound kit of WISH by RICCIONE REKA
//
// 老板：「每个按钮一触碰都要有 sound effect，参考 3A 游戏、像 Stardew Valley，最起码每个都有声音」。
// 这一份就是答案：一套原创、现场合成的界面音效（Web Audio，没有任何音频文件 / 录音素材 / 采样），
// 用「七种材质」说话 —— 木（轻触、计数）· 水（选中的那一声「啵」）· 纸 / 丝（翻牌、换页、面板）· 玉（光、扫光、提示）·
// 金（愿望、成就、揭晓）· 石（放下、落地、轻提示）· 弦（确认、达成：古筝的拨弦，和背景音乐同一件乐器）。
// 全部落在 D 宫五声（D E F# A B）上 —— 和背景音乐同一个调，任何时候响都不会「走音」；响度分三级，永远在音乐下面。
//
// 用法 / Usage
//   import sfx from './sfx.js';
//   sfx.bind(document, { rules: WISH_RULES });  // 一次就好：任何 button / a[href] / [role=button] / input / select / label …
//                                               // 在 pointerdown 当下就响默认的「轻触」；按语义自动换成 选中 / 开关 / 展开 / 滑杆 …
//   <button data-sfx="confirm">                 // 指定声音（也可以写在外层容器上，整组都用）；data-sfx="none" = 这一个不要声音
//   <button data-sfx="land:2">                  // 带参数：第 3 块踏脚石的音高
//   sfx.play('reveal', { x: 0.5 })              // 代码驱动的时刻（揭晓、召唤、数完 …）；x = 屏幕上的横向位置 0–1（声像）
//   fx.config.sound = sfx.fx                    // 动效（motion 的 fx.js）开始时报的声音交给这里；同一下触碰不会响两次
//   sfx.rub({ progress, speed })                // 擦神灯：持续的摩擦声 + 越擦越亮的五声音阶；停手 0.26 s 自己收
//   sfx.setMuted(true) · sfx.setLevel(0.8)      // 静音（记在本机 genie.mute，和旧 sound.js 同一个键）· 音效音量（和音乐分开）
//   sfx.tap() / pick() / flip() / rub() / wish() / chime() / summon() / nope()   // 旧 sound.js 的写法照样能用
//
// iPad Safari：AudioContext 只能在 pointerup / touchend / click / keydown 里解锁（触屏的 pointerdown 不算「手势」）。
// 所以第一次触碰的声音会在手指抬起、解锁成功的那一刻补上（0.7 s 内）；之后每一下都在 pointerdown 当下就响。
// 锁屏 / 切 app 回来，声音被系统暂停：自动再挂上解锁监听，下一下触碰就恢复。
//
// 同一份合成代码在 AudioContext（现场）和 OfflineAudioContext（离线渲染、测试）里都能跑：synth(ctx, name, t, opts, seed)。
//
// 在 App 里：每一页的入口（quiz / wish / launcher / studio 的 main.jsx）调用一次 installSfx()；旧的 sound.js 全部转到这里。
// 背景音乐（zen.js）用 getAudioContext() 和音效共用一个 AudioContext：一页只有一个，第一下触碰解锁一次就都有声音。
// 设计、每一页每一个控件的对照表、验证：scratchpad/sfx/SPEC.md。

import { CONFIG } from './config.js';

const TAU = Math.PI * 2;
const HAS_DOM = typeof window !== 'undefined' && typeof document !== 'undefined';
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
// 最近一下按的那个元素只用弱引用记着（只给记录 / 测试钩子看）：强引用会把关掉的员工区、名单这些整块画面一直留在内存里
const weakEl = (el) => (el && typeof WeakRef === 'function' ? new WeakRef(el) : el || null);
const elOf = (r) => (r && typeof r.deref === 'function' ? r.deref() : r) || null;
export const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const cents = (c) => Math.pow(2, c / 1200);
const dbGain = (db) => Math.pow(10, db / 20);

/** 可重复的随机数（离线渲染每次一样；现场每一下都不一样） */
export function rng(seed = 1) {
  let a = seed >>> 0 || 0x9e3779b9;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + r() * (hi - lo);
  return r;
}

// ───────────────────────────── 0. 调：D 宫五声 ─────────────────────────────
// MIDI：D5 = 74。PENTA 是相对 D 的半音数（宫 商 角 徵 羽 = D E F# A B）。

export const PENTA = [0, 2, 4, 7, 9];
/** 第 i 个五声音级（从 base 往上数；i 可以超过 5，自动进到上一个八度） */
export const step = (i, base = 74) => {
  const k = Math.floor(i);
  return base + 12 * Math.floor(k / 5) + PENTA[((k % 5) + 5) % 5];
};
const D3 = 50, A3 = 57, D4 = 62, E4 = 64, A4 = 69, B4 = 71, D5 = 74, E5 = 76, Fs5 = 78, A5 = 81, B5 = 83, D6 = 86, E6 = 88, Fs6 = 90, A6 = 93, B6 = 95; // prettier-ignore
/** 这一套音效用到的所有音高的音级（测试会检查：全部 ∈ D 宫五声） */
export const PITCH_CLASSES = [2, 4, 6, 9, 11]; // D E F# A B（C = 0）

// ───────────────────────────── 1. 房间：混响 + 限幅（每个 AudioContext 一份） ─────────────────────────────
// 空间和背景音乐是同一类「庭院 / 亭子」的混响（生成的脉冲响应），只是更短、更近：音效站在音乐前面一点点。

const ROOMS = new WeakMap();

const SLICE = 8192; // 生成噪声 / 脉冲响应时，每算这么多个采样就可以停一下（现场：分成很多个小任务，不卡第一下触碰）

/** 循环用的噪声缓冲（白 / 粉）。生成器：yield = 可以在这里歇一下；算完调用 put(buffer) */
function* noiseJob(ctx, color, seconds, seed, put) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const L = Math.floor(sr * 0.03); // 尾巴交叉淡化进开头 = 无缝循环（擦神灯要一直循环）
  const r = rng(seed);
  const raw = new Float32Array(n + L);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let ss = 0;
  for (let i = 0; i < n + L; i++) {
    const w = r() * 2 - 1;
    if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      raw[i] = b0 + b1 + b2 + w * 0.1848;
    } else raw[i] = w;
    ss += raw[i] * raw[i];
    if (i % SLICE === SLICE - 1) yield;
  }
  const k = 0.3 / Math.sqrt(ss / (n + L)); // RMS ≈ 0.3
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = raw[i] * k;
  for (let i = 0; i < L; i++) {
    const a = (i / L) * (Math.PI / 2);
    d[i] = (raw[i] * Math.sin(a) + raw[n + i] * Math.cos(a)) * k;
  }
  put(buf);
}

/** 生成的房间脉冲响应：预延迟 + 几个早期反射 + 越往后越暗的扩散尾巴（高频先消失，像木结构的亭子） */
function* irJob(ctx, put, { rt60 = 1.15, pre = 0.012, seconds = 1.5, seed = 11 } = {}) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  const p0 = Math.floor(pre * sr);
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(seed + ch * 101);
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = p0; i < n; i++) {
      const tt = (i - p0) / sr;
      const k = 0.18 + 0.7 * Math.min(1, tt / rt60); // 阻尼随时间变大
      lp += (1 - k) * (r() * 2 - 1 - lp);
      const fadeIn = tt < 0.006 ? tt / 0.006 : 1;
      const fadeOut = i > n - sr * 0.08 ? (n - i) / (sr * 0.08) : 1;
      d[i] = lp * Math.exp((-6.9078 * tt) / rt60) * fadeIn * fadeOut;
      if (i % SLICE === SLICE - 1) yield;
    }
    for (const [ms, a] of [
      [6.5, 0.42],
      [11, 0.3],
      [17.5, 0.24],
      [26, 0.17],
      [37, 0.12],
    ]) {
      const j = p0 + Math.floor(((ms + (ch ? 1.3 : 0)) * sr) / 1000);
      if (j < n) d[j] += (r() < 0.5 ? -1 : 1) * a * 0.12;
    }
    let e = 0;
    for (let i = 0; i < n; i++) e += d[i] * d[i];
    const g = 1 / Math.sqrt(e || 1);
    for (let i = 0; i < n; i++) d[i] *= g;
    yield;
  }
  put(buf);
}

/** 一口气做完（离线渲染） */
function runNow(job) {
  for (;;) if (job.next().done) return;
}
/** 分成很多个 ≤ 5 ms 的小任务做完（现场：第一下触碰只建干声，混响和粉噪声随后补上） */
function runSoon(job, delay = 40) {
  if (typeof setTimeout !== 'function') return runNow(job);
  const step = () => {
    const t = now();
    for (;;) {
      if (job.next().done) return;
      if (now() - t > 5) break;
    }
    setTimeout(step, 0);
  };
  setTimeout(step, delay);
}

/** 软削波曲线：|x| ≤ 0.7（−3 dBFS）原样通过；再往上用 tanh 平滑地收向 0.89（−1 dBFS），永远不会硬切。
 *  放在 master 音量之后：校准过的音效最响只到 −5 dBTP，正常用永远碰不到它，只有很多声叠在一起时才接住 */
function softClip(n = 4097) {
  const c = new Float32Array(n);
  const k = 0.7;
  const top = 0.89 - k;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= k ? a : k + top * Math.tanh((a - k) / top));
  }
  return c;
}

/** 每个 AudioContext 一套：干声总线 bus、混响送 verbIn、master（音量 × 静音）。离线渲染也用同一套。
 *  现场（AudioContext）：干声链 + 白噪声马上建好（第一下触碰要用）；粉噪声、混响脉冲随后分小块补上（约 0.3 s，
 *  这之间的声音没有混响尾巴、要粉噪声的先用白噪声）。离线（OfflineAudioContext）：一次全部建好，渲染结果每次一样。 */
export function room(ctx) {
  let R = ROOMS.get(ctx);
  if (R) return R;
  const offline = typeof ctx.startRendering === 'function';
  const bus = ctx.createGain();
  const verbIn = ctx.createGain();
  const sum = ctx.createGain();
  bus.connect(sum);
  // 低频不要（iPad 喇叭放不出、只会吃掉余量）；7 kHz 以上轻轻收 3 dB（不刺耳）；最后一个安全限幅
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 70;
  hp.Q.value = 0.6;
  const shelf = ctx.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 7000;
  shelf.gain.value = -3;
  // 安全网：无记忆的软削波（−3 dBFS 以下完全透明）。不用 DynamicsCompressor：它有 6 ms 预读 + 自动补偿增益，
  // 在快速的起音上会调制出单个采样的小尖刺（离线量得到），而且会悄悄改变响度。音量本身已经按响度校准好了。
  const lim = ctx.createWaveShaper();
  lim.curve = softClip();
  lim.oversample = '2x';
  const master = ctx.createGain();
  sum.connect(hp);
  hp.connect(shelf);
  shelf.connect(master);
  master.connect(lim);
  lim.connect(ctx.destination);
  R = { bus, verbIn, master, out: lim, noise: {}, verbReady: false }; // out = 喇叭前最后一级（探针接这里）
  ROOMS.set(ctx, R);
  runNow(noiseJob(ctx, 'white', 1.6, 7, (b) => (R.noise.white = b)));
  const later = (function* () {
    yield* noiseJob(ctx, 'pink', 1.6, 8, (b) => (R.noise.pink = b));
    let ir = null;
    yield* irJob(ctx, (b) => (ir = b));
    try {
      const conv = ctx.createConvolver();
      conv.normalize = false;
      conv.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.42;
      verbIn.connect(conv);
      conv.connect(wet);
      wet.connect(sum);
      R.verbReady = true;
    } catch {
      /* 没有 ConvolverNode：只有干声 */
    }
  })();
  if (offline) runNow(later);
  else runSoon(later);
  return R;
}

// ───────────────────────────── 2. 合成积木 ─────────────────────────────
// 每个积木都：从 0 开始（线性起音 ≥ 0.8 ms，不会「喀」一声）→ 指数衰减到 −75 dB 才停（停的时候也不会喀）。
// c = { ctx, R, out（这一声的输出）, t（开始时间）, r（随机数）, o（参数） }

const ATTACK_MIN = 0.0015; // 起音至少 1.5 ms：再快就是「喀」，不是「笃」
function env(p, t, { a = 0.002, peak = 0.3, hold = 0, d = 0.15 }) {
  a = Math.max(a, ATTACK_MIN);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (hold > 0) p.setValueAtTime(peak, t + a + hold);
  p.setTargetAtTime(0, t + a + hold, d / 6.9);
  return t + a + hold + d * 1.25;
}

// 现场：一声里 0.3 s 之后才开始的部分（揭晓的金铃、愿望成真的金尘 …）先不建节点，排到开始前 0.25 s 再建 ——
// 一个「揭晓」有 200 多个节点，一口气建完在 iPad 上会卡一帧；分开建就没有长任务。离线渲染（c.later = null）照常一次建完。
const DEFER_AFTER = 0.3;
const envEnd = (t, { a = 0.002, hold = 0, d = 0.15 }) => t + Math.max(a, ATTACK_MIN) + hold + d * 1.25;
function deferred(c, t, o, build) {
  if (!c.later || t - c.t < DEFER_AFTER) return null;
  const end = envEnd(t, o);
  if (!(c.end > end)) c.end = end;
  c.later.push({ at: t, fn: () => build({ ...c, later: null }) });
  return end;
}

/** 一个正弦（或别的波形）音：可以滑音（to / glide）、可以有「拨弦的初始音高回落」（bend，音分） */
function tone(c, o) {
  const { ctx } = c;
  const t = o.t ?? c.t;
  if (!(o.f > 20) || o.f >= Math.min(ctx.sampleRate * 0.45, 12000)) return t;
  const later = deferred(c, t, o, (cc) => tone(cc, o));
  if (later !== null) return later;
  const os = ctx.createOscillator();
  os.type = o.type || 'sine';
  // Chrome 的振荡器如果在一个 128 采样块的中间开始、又带着 frequency / detune 自动化，会在下一个块的边界上
  // 留下一个相位折角（离线量得到，二阶差分 0.046）。所以：不滑音就不排自动化；要滑音 / 拨弦回落的，提前 8 ms
  // 静悄悄地开始（那时音量还是 0），折角落在没声音的地方。
  const auto = !!(o.to || o.bend);
  const pre = auto ? Math.max(ctx.currentTime || 0, t - 0.008) : t;
  if (o.to) {
    os.frequency.setValueAtTime(o.f, pre);
    os.frequency.setValueAtTime(o.f, t);
    os.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + (o.glide ?? 0.05));
  } else os.frequency.value = o.f;
  const det = o.det || 0;
  if (o.bend) {
    os.detune.setValueAtTime(det + o.bend, pre);
    os.detune.setValueAtTime(det + o.bend, t);
    os.detune.setTargetAtTime(det, t + 0.002, o.bendT ?? 0.02);
  } else if (det) os.detune.value = det;
  const g = ctx.createGain();
  g.gain.value = 0;
  const end = env(g.gain, t, o);
  os.connect(g);
  g.connect(o.dest || c.out);
  os.start(pre);
  os.stop(end + 0.02);
  if (!(c.end > end)) c.end = end;
  return end;
}

/** 好几个分音一起响（木、玉、金都是这样：分音的比例 = 材质的「指纹」） */
function modal(c, { t = c.t, f, parts, peak = 0.3, a = 0.002, bend = 0, det = 0, dest }) {
  let end = t;
  for (const [ratio, amp, d] of parts) end = Math.max(end, tone(c, { t, f: f * ratio, a, d, peak: peak * amp, bend, det, dest }));
  return end;
}

/** 噪声：带通 / 低通 / 高通，中心频率可以扫（一段或两段）—— 纸、丝、风、擦的声音都是它 */
function noiz(c, o) {
  const { t = c.t, type = 'bandpass', f, f2, f3, q = 1, a = 0.002, hold = 0, d = 0.1, peak = 0.1, color = 'white', dest } = o;
  const later = deferred(c, t, { a, hold, d }, (cc) => noiz(cc, o));
  if (later !== null) return later;
  const { ctx, R } = c;
  const src = ctx.createBufferSource();
  src.buffer = R.noise[color] || R.noise.white;
  src.loop = true;
  const bq = ctx.createBiquadFilter();
  bq.type = type;
  bq.Q.value = q;
  bq.frequency.setValueAtTime(f, t);
  const T = a + hold + d;
  if (f2 && f3) {
    bq.frequency.exponentialRampToValueAtTime(f2, t + T * 0.45);
    bq.frequency.exponentialRampToValueAtTime(f3, t + T);
  } else if (f2) bq.frequency.exponentialRampToValueAtTime(f2, t + T);
  const g = ctx.createGain();
  g.gain.value = 0;
  const end = env(g.gain, t, { a, peak, hold, d });
  src.connect(bq);
  bq.connect(g);
  g.connect(dest || c.out);
  src.start(t, c.r() * 1.2);
  src.stop(end + 0.02);
  if (!(c.end > end)) c.end = end;
  return end;
}

// 材质 = 分音比例 [比例, 振幅, 衰减倍数]
const WOOD = [
  [1, 1, 1],
  [2.32, 0.26, 0.42],
  [4.25, 0.1, 0.22],
];
const JADE = [
  [1, 1, 1],
  [2.756, 0.3, 0.42],
  [5.404, 0.08, 0.2],
];
const GOLD = [
  [1, 1, 1],
  [2.0, 0.28, 0.55],
  [3.0, 0.09, 0.3],
  [4.16, 0.025, 0.16],
];

/** 木：小木块 / 竹片的「笃」—— 不和谐的分音 + 一点点敲击的噪声 */
function wood(c, { t = c.t, f, peak = 0.4, d = 0.07, bright = 1, dest }) {
  const end = modal(c, { t, f, peak, a: 0.0015, parts: WOOD.map(([r, a, k]) => [r, r > 1 ? a * bright : a, d * k]), dest });
  noiz(c, { t, f: Math.min(f * 3.2, 6000), q: 1.6, a: 0.0008, d: 0.012, peak: 0.09 * peak * bright, dest });
  return end;
}
/** 玉：清亮的小钟片（自由振动的棒：1 : 2.756 : 5.404） */
function jade(c, { t = c.t, f, peak = 0.2, d = 0.4, dest }) {
  return modal(c, { t, f, peak, a: 0.0018, parts: JADE.map(([r, a, k]) => [r, a, d * k]), dest });
}
/** 金：暖的小铃 —— 两个只差 2.4 音分的同音一起敲，慢慢「呼吸」（D6 上约 1.6 Hz 的拍频） */
function gold(c, { t = c.t, f, peak = 0.2, d = 0.9, dest }) {
  const parts = GOLD.map(([r, a, k]) => [r, a, d * k]);
  modal(c, { t, f, peak: peak * 0.55, a: 0.002, det: -1.2, parts, dest });
  return modal(c, { t, f, peak: peak * 0.55, a: 0.002, det: 1.2, parts, dest });
}
/** 弦：古筝式的拨弦（谐波 + 一点点琴弦的不谐和 + 拨下去时音高略高、马上回落的「铮」） */
function pluck(c, { t = c.t, f, peak = 0.4, d = 0.5, bright = 1, dest, harmonics = 6, pick = true }) {
  const H = [1, 0.5, 0.3, 0.17, 0.1, 0.055].slice(0, harmonics);
  let end = t;
  H.forEach((amp, i) => {
    const n = i + 1;
    end = Math.max(end, tone(c, { t, f: f * n * (1 + 0.0007 * n * n), a: 0.0025, d: d / Math.pow(n, 0.75), peak: peak * amp * (n > 1 ? bright : 1), bend: 14, bendT: 0.025, dest }));
  });
  if (pick) noiz(c, { t, f: 2600, q: 1.1, a: 0.002, d: 0.01, peak: 0.07 * peak, dest });
  return end;
}
/** 水：一颗水滴 / 泡泡「啵」—— 音高往上滑到一个五声音（Stardew 式的那种满足感） */
function drop(c, { t = c.t, f, to, glide = 0.05, d = 0.1, peak = 0.35, dest }) {
  const end = tone(c, { t, f, to, glide, a: 0.0018, d, peak, dest });
  tone(c, { t, f: f * 2.01, to: to * 2.01, glide, a: 0.0018, d: d * 0.35, peak: peak * 0.1, dest });
  return end;
}
/** 石：软软的「咚」—— 往下滑的低音 + 一点低通的噪声 */
function thud(c, { t = c.t, f = 190, to = 110, d = 0.12, peak = 0.45, dest }) {
  const end = tone(c, { t, f, to, glide: 0.06, a: 0.002, d, peak, dest });
  noiz(c, { t, type: 'lowpass', f: 700, q: 0.7, a: 0.001, d: 0.03, peak: peak * 0.35, dest });
  return end;
}
/** 一把小光点：很多颗五声音阶上的小铃（金尘 / 闪光）。fade = 越来越稀；gather = 越来越密 */
function grains(c, { t = c.t, dur = 0.5, n = 20, notes, peak = 0.05, shape = 'fade', dest }) {
  const { ctx } = c;
  const buses = [-0.45, 0.45].map((p) => {
    const g = ctx.createGain();
    if (ctx.createStereoPanner) {
      const s = ctx.createStereoPanner();
      s.pan.value = p;
      g.connect(s);
      s.connect(dest || c.out);
    } else g.connect(dest || c.out);
    return g;
  });
  let end = t;
  for (let i = 0; i < n; i++) {
    const u = c.r();
    const x = shape === 'gather' ? 1 - Math.pow(u, 1.7) : Math.pow(u, 1.7);
    const amp = peak * (shape === 'gather' ? 0.4 + 0.6 * x : 1 - 0.65 * x) * (0.6 + 0.4 * c.r());
    const m = notes[Math.floor(c.r() * notes.length)];
    end = Math.max(end, tone(c, { t: t + x * dur, f: hz(m), a: 0.003, d: 0.05 + 0.06 * c.r(), peak: amp, dest: buses[i & 1] }));
  }
  return end;
}

/** 擦神灯的参数：p = 进度 0–1，speed = 手指速度 0–1。现场（sfx.rub）和离线（KIT.rub）用同一套，听起来一样 */
export function rubParams(p, speed = 1) {
  const k = Math.min(4, Math.floor(p * 5)); // 每 20% 往上走一个五声音级：D → E → F# → A → B（进度听得见）
  return {
    noise: (0.035 + 0.07 * speed) * (0.85 + 0.3 * p),
    f: 1100 + 1500 * p + 500 * speed,
    hum: 0.006 + 0.026 * p * p,
    humNotes: [step(k, D4), step(k + 3, D4)],
    rate: 1.5 + 9 * p,
    sparkPeak: 0.025 + 0.065 * p,
    spark: (r) => step(Math.floor(r() * 4) + Math.round(p * 6), D5),
  };
}

function rubGesture(c, dur = 2.6) {
  const { ctx, R } = c;
  const t0 = c.t;
  const src = ctx.createBufferSource();
  src.buffer = R.noise.white;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.1;
  bp.frequency.value = 1200;
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 5200;
  soft.Q.value = 0.5;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t0);
  src.connect(bp);
  bp.connect(soft);
  soft.connect(g);
  g.connect(c.out);
  const hum = [0, 1].map(() => {
    const o = ctx.createOscillator();
    o.frequency.value = hz(D4);
    const hg = ctx.createGain();
    hg.gain.value = 0;
    hg.gain.setValueAtTime(0, t0);
    o.connect(hg);
    hg.connect(c.out);
    return { o, hg };
  });
  const N = Math.round(dur / 0.05);
  for (let i = 0; i <= N; i++) {
    const t = t0 + i * 0.05;
    const p = i / N;
    const sp = 0.45 + 0.55 * Math.abs(Math.sin(Math.PI * 3 * (t - t0))); // 来回擦：一秒三下
    const P = rubParams(p, sp);
    g.gain.setTargetAtTime(P.noise, t, 0.03);
    bp.frequency.setTargetAtTime(P.f, t, 0.05);
    hum.forEach((h, j) => {
      h.hg.gain.setTargetAtTime(P.hum, t, 0.15);
      h.o.frequency.setTargetAtTime(hz(P.humNotes[j]), t, 0.06);
    });
  }
  let ts = t0 + 0.2;
  while (ts < t0 + dur) {
    const P = rubParams((ts - t0) / dur, 1);
    jade(c, { t: ts, f: hz(P.spark(c.r)), peak: P.sparkPeak, d: 0.3 });
    ts += 1 / P.rate;
  }
  const te = t0 + dur;
  g.gain.setTargetAtTime(0, te, 0.05);
  hum.forEach((h) => h.hg.gain.setTargetAtTime(0, te, 0.08));
  src.start(t0, 0);
  src.stop(te + 0.6);
  hum.forEach((h) => {
    h.o.start(t0);
    h.o.stop(te + 0.7);
  });
  c.end = Math.max(c.end || 0, te + 0.7);
  return te + 0.7;
}

const idx = (o, c) => (Number.isFinite(+o.value) && o.value !== null && o.value !== '' ? Math.abs(Math.round(+o.value)) : Number.isFinite(+o.step) && o.step !== null ? Math.abs(Math.round(+o.step)) : c.o.rr || 0);

// ───────────────────────────── 3. 音效表 KIT ─────────────────────────────
// tier：响度等级（1 微 · 2 互动 · 3 时刻）；mat：材质；group：在样片板上的分组；send：混响量；cap：同一种最多同时几个；
// trim：校准用的 dB（离线量过响度后定下来）；make(c, o) 返回结束时间。

export const TIERS = {
  1: { en: 'Micro', target: -31 },
  2: { en: 'Interaction', target: -26 },
  3: { en: 'Moment', target: -21 },
};
export const MATERIALS = {
  wood: { en: 'Wood' },
  water: { en: 'Water' },
  paper: { en: 'Paper & silk' },
  jade: { en: 'Jade' },
  gold: { en: 'Gold' },
  stone: { en: 'Stone' },
  string: { en: 'String' },
};
export const GROUPS = [
  { id: 'basic', en: 'Basics' },
  { id: 'choice', en: 'Choices' },
  { id: 'card', en: 'Cards & light' },
  { id: 'treasure', en: 'Treasure & wishes' },
  { id: 'ritual', en: 'Rituals' },
  { id: 'studio', en: 'Studio' },
];
// 中文名、用途说明、样片板的颜色在 sfx-meta.js（只给样片板 / 文档用；正式代码里不放界面以外的中文字符串和写死的颜色）

export const KIT = {
  // ── 基础 Basics ──
  tap: {
    en: 'Tap', tier: 1, mat: 'wood', group: 'basic', send: 0.05, cap: 4, trim: 1, jitter: 12,
    make(c) {
      const v = (c.o.rr || 0) % 3;
      return wood(c, { f: hz(A5) * cents(c.r.range(-12, 12)), peak: 0.42, d: [0.07, 0.08, 0.065][v], bright: [1, 0.85, 1.1][v] });
    },
  },
  next: {
    en: 'Next', tier: 2, mat: 'string', group: 'basic', send: 0.1, trim: -0.5,
    make(c) {
      noiz(c, { f: 700, f2: 2200, q: 1, a: 0.04, d: 0.07, peak: 0.05, color: 'pink' });
      pluck(c, { f: hz(E5), peak: 0.26, d: 0.28 });
      return pluck(c, { t: c.t + 0.045, f: hz(A5), peak: 0.3, d: 0.34 });
    },
  },
  confirm: {
    en: 'Confirm', tier: 2, mat: 'string', group: 'basic', send: 0.16, trim: -7.5,
    make(c) {
      pluck(c, { f: hz(D5), peak: 0.34, d: 0.45 });
      pluck(c, { t: c.t + 0.06, f: hz(A5), peak: 0.4, d: 0.55 });
      grains(c, { t: c.t + 0.1, dur: 0.25, n: 4, notes: [D6, E6, A6], peak: 0.03 });
      return jade(c, { t: c.t + 0.075, f: hz(D6), peak: 0.12, d: 0.55 });
    },
  },
  back: {
    en: 'Back', tier: 2, mat: 'wood', group: 'basic', send: 0.06, trim: 5,
    make(c) {
      wood(c, { f: hz(A5), peak: 0.3, d: 0.05 });
      noiz(c, { f: 1800, f2: 700, q: 1.2, a: 0.03, d: 0.1, peak: 0.05, color: 'pink' });
      return wood(c, { t: c.t + 0.055, f: hz(E5), peak: 0.32, d: 0.06, bright: 0.8 });
    },
  },
  open: {
    en: 'Open panel', tier: 2, mat: 'paper', group: 'basic', send: 0.1, trim: 9,
    make(c) {
      noiz(c, { f: 500, f2: 1900, q: 0.9, a: 0.09, d: 0.12, peak: 0.16, color: 'pink' });
      wood(c, { t: c.t + 0.105, f: hz(D5), peak: 0.26, d: 0.06 });
      return jade(c, { t: c.t + 0.11, f: hz(A6), peak: 0.045, d: 0.3 });
    },
  },
  close: {
    en: 'Close panel', tier: 2, mat: 'paper', group: 'basic', send: 0.08, trim: 8.5,
    make(c) {
      noiz(c, { f: 1900, f2: 520, q: 0.9, a: 0.04, d: 0.11, peak: 0.15, color: 'pink' });
      return wood(c, { t: c.t + 0.085, f: hz(A4), peak: 0.28, d: 0.06, bright: 0.7 });
    },
  },
  page: {
    en: 'Page turn', tier: 2, mat: 'paper', group: 'basic', send: 0.12, trim: 9.5,
    make(c) {
      noiz(c, { f: 300, f2: 1500, f3: 700, q: 0.7, a: 0.28, d: 0.42, peak: 0.13, color: 'pink' });
      for (const m of [D4, A4, E5]) tone(c, { f: hz(m), a: 0.25, d: 0.5, peak: 0.024 });
      return c.t + 0.9;
    },
  },
  toast: {
    en: 'Toast', tier: 2, mat: 'jade', group: 'basic', send: 0.14, trim: 3.5,
    make(c) {
      jade(c, { f: hz(A5), peak: 0.14, d: 0.4 });
      return jade(c, { t: c.t + 0.08, f: hz(D6), peak: 0.13, d: 0.5 });
    },
  },
  error: {
    en: 'Soft error', tier: 2, mat: 'stone', group: 'basic', send: 0.05, trim: 3.5,
    make(c) {
      modal(c, { f: hz(A4), peak: 0.3, a: 0.004, parts: [[1, 1, 0.09], [2.0, 0.18, 0.04]] });
      return modal(c, { t: c.t + 0.11, f: hz(E4), peak: 0.3, a: 0.004, parts: [[1, 1, 0.12], [2.0, 0.15, 0.05]] });
    },
  },
  disabled: {
    en: 'Disabled', tier: 1, mat: 'wood', group: 'basic', send: 0.03, trim: 4.5,
    make(c) {
      return wood(c, { f: hz(E4), peak: 0.32, d: 0.05, bright: 0.35 });
    },
  },

  // ── 选择 Choices ──
  select: {
    en: 'Select', tier: 2, mat: 'water', group: 'choice', send: 0.12, trim: 3, jitter: 8,
    make(c) {
      const base = [A5, B5, A5][(c.o.rr || 0) % 3];
      drop(c, { f: hz(base) * cents(c.r.range(-8, 8)), to: hz(base + 7), glide: 0.045, d: 0.11, peak: 0.4 });
      return jade(c, { t: c.t + 0.028, f: hz(base + 7), peak: 0.13, d: 0.36 });
    },
  },
  deselect: {
    en: 'Deselect', tier: 2, mat: 'water', group: 'choice', send: 0.08, trim: 6.5,
    make(c) {
      return drop(c, { f: hz(E6), to: hz(A5), glide: 0.06, d: 0.08, peak: 0.28 });
    },
  },
  toggleOn: {
    en: 'Toggle on', tier: 2, mat: 'wood', group: 'choice', send: 0.08, trim: 4.5,
    make(c) {
      wood(c, { f: hz(D5), peak: 0.3, d: 0.05 });
      wood(c, { t: c.t + 0.05, f: hz(A5), peak: 0.36, d: 0.06 });
      return drop(c, { t: c.t + 0.056, f: hz(A5), to: hz(E6), glide: 0.04, d: 0.08, peak: 0.16 });
    },
  },
  toggleOff: {
    en: 'Toggle off', tier: 2, mat: 'wood', group: 'choice', send: 0.06, trim: 5,
    make(c) {
      wood(c, { f: hz(A5), peak: 0.3, d: 0.05, bright: 0.8 });
      return wood(c, { t: c.t + 0.05, f: hz(D5), peak: 0.3, d: 0.06, bright: 0.6 });
    },
  },
  chipAdd: {
    en: 'Chip add', tier: 2, mat: 'water', group: 'choice', send: 0.1, trim: 5.5,
    make(c, o) {
      const m = step(1 + (idx(o, c) % 4), D5); // E5 F#5 A5 B5 轮流
      drop(c, { f: hz(m), to: hz(m + 5), glide: 0.04, d: 0.075, peak: 0.36 });
      return jade(c, { t: c.t + 0.03, f: hz(m + 12), peak: 0.07, d: 0.25 });
    },
  },
  chipRemove: {
    en: 'Chip remove', tier: 2, mat: 'water', group: 'choice', send: 0.06, trim: 8,
    make(c) {
      const m = [A5, Fs5, B5][(c.o.rr || 0) % 3];
      noiz(c, { f: 3400, q: 1.2, a: 0.003, d: 0.02, peak: 0.06 });
      return drop(c, { f: hz(m + 5), to: hz(m), glide: 0.05, d: 0.06, peak: 0.27 });
    },
  },
  cross: {
    en: 'Cross out', tier: 2, mat: 'paper', group: 'choice', send: 0.05, trim: 12,
    make(c) {
      noiz(c, { f: 1500, f2: 3600, q: 2, a: 0.01, d: 0.07, peak: 0.1 });
      noiz(c, { t: c.t + 0.045, f: 2200, f2: 3900, q: 2, a: 0.008, d: 0.05, peak: 0.07 });
      return wood(c, { t: c.t + 0.07, f: hz(E4), peak: 0.24, d: 0.05, bright: 0.6 });
    },
  },
  plus: {
    en: 'Count +', tier: 2, mat: 'wood', group: 'choice', send: 0.06, trim: 7.5,
    make(c, o) {
      const i = idx(o, c) % 10;
      wood(c, { f: hz(step(i, D5)), peak: 0.3, d: 0.05 });
      return drop(c, { t: c.t + 0.01, f: hz(step(i, D5)), to: hz(step(i + 1, D5)), glide: 0.035, d: 0.07, peak: 0.2 });
    },
  },
  minus: {
    en: 'Count −', tier: 2, mat: 'wood', group: 'choice', send: 0.05, trim: 7.5,
    make(c, o) {
      const i = idx(o, c) % 10;
      wood(c, { f: hz(step(i, D5)), peak: 0.28, d: 0.05, bright: 0.8 });
      return drop(c, { t: c.t + 0.01, f: hz(step(i + 1, D5)), to: hz(step(i, D5)), glide: 0.04, d: 0.06, peak: 0.16 });
    },
  },
  slider: {
    en: 'Slider tick', tier: 1, mat: 'wood', group: 'choice', send: 0.04, cap: 2, trim: 8.5,
    make(c, o) {
      const v = clamp(Number.isFinite(+o.value) ? +o.value : 0.5, 0, 1);
      const m = step(Math.round(v * 8), D5);
      const end = wood(c, { f: hz(m), peak: o.edge ? 0.36 : 0.24, d: 0.035, bright: 0.6 });
      if (o.edge) drop(c, { t: c.t + 0.012, f: hz(m), to: hz(m + 5), glide: 0.03, d: 0.05, peak: 0.12 });
      return end;
    },
  },
  focus: {
    en: 'Field focus', tier: 1, mat: 'paper', group: 'choice', send: 0.08, trim: 12,
    make(c) {
      noiz(c, { f: 3200, q: 1.2, a: 0.003, d: 0.018, peak: 0.07 });
      return tone(c, { t: c.t + 0.004, f: hz(E6), a: 0.01, d: 0.16, peak: 0.06 });
    },
  },
  type: {
    en: 'Typing', tier: 1, mat: 'wood', group: 'choice', send: 0.03, cap: 3, trim: 15,
    make(c, o) {
      const back = !!o.back;
      noiz(c, { f: (back ? 1500 : 2100) * cents(c.r.range(-160, 160)), q: 8, a: 0.0015, d: 0.018, peak: 0.3 });
      return tone(c, { f: back ? 150 : 190, to: back ? 110 : 140, glide: 0.02, a: 0.0015, d: 0.022, peak: 0.045 });
    },
  },

  // ── 卡牌与光 Cards & light（多半由动效 fx.js 报出来） ──
  flip: {
    en: 'Card flip', tier: 2, mat: 'paper', group: 'card', send: 0.1, trim: 20.5,
    make(c) {
      noiz(c, { f: 2600, q: 2.2, a: 0.0012, d: 0.012, peak: 0.2 });
      noiz(c, { t: c.t + 0.01, f: 900, f2: 2600, f3: 1300, q: 0.85, a: 0.1, d: 0.17, peak: 0.12, color: 'pink' });
      return noiz(c, { t: c.t + 0.2, f: 2000, q: 2, a: 0.0012, d: 0.016, peak: 0.13 });
    },
  },
  flipLand: {
    en: 'Card settles', tier: 2, mat: 'paper', group: 'card', send: 0.06, trim: 14,
    make(c) {
      noiz(c, { type: 'lowpass', f: 1100, q: 0.6, a: 0.0015, d: 0.025, peak: 0.2 });
      return wood(c, { t: c.t + 0.004, f: hz(B4), peak: 0.16, d: 0.05, bright: 0.6 });
    },
  },
  whoosh: {
    en: 'Card fly', tier: 2, mat: 'paper', group: 'card', send: 0.12, trim: 10,
    make(c, o) {
      const D = clamp(0.28 + (o.distance || 400) / 1600, 0.3, 0.75);
      noiz(c, { f: 380, f2: 1700, f3: 650, q: 0.8, a: D * 0.45, d: D * 0.55, peak: 0.17, color: 'pink' });
      grains(c, { t: c.t + D * 0.6, dur: D * 0.5, n: 4, notes: [D6, E6, Fs6], peak: 0.03 });
      return c.t + D * 1.3;
    },
  },
  scan: {
    en: 'Scan', tier: 2, mat: 'jade', group: 'card', send: 0.18, trim: 7,
    make(c) {
      noiz(c, { f: 1500, f2: 6200, q: 3, a: 0.13, d: 0.17, peak: 0.07 });
      jade(c, { t: c.t + 0.25, f: hz(E6), peak: 0.12, d: 0.4 });
      return tone(c, { t: c.t + 0.29, f: hz(A6), a: 0.004, d: 0.3, peak: 0.035 });
    },
  },
  holo: {
    en: 'Holo shine', tier: 2, mat: 'jade', group: 'card', send: 0.2, trim: 5,
    make(c) {
      noiz(c, { f: 1300, f2: 5600, q: 3, a: 0.14, d: 0.2, peak: 0.06 });
      noiz(c, { t: c.t + 0.12, f: 1800, f2: 6800, q: 3.5, a: 0.12, d: 0.2, peak: 0.05 });
      jade(c, { t: c.t + 0.22, f: hz(A5), peak: 0.08, d: 0.55 });
      jade(c, { t: c.t + 0.27, f: hz(D6), peak: 0.1, d: 0.6 });
      return jade(c, { t: c.t + 0.32, f: hz(E6), peak: 0.08, d: 0.6 });
    },
  },
  dissolve: {
    en: 'Dissolve', tier: 2, mat: 'jade', group: 'card', send: 0.22, trim: 11.5,
    make(c, o) {
      const s = o.size || 60000;
      const n = Math.round(clamp(14 + s / 9000, 14, 32));
      const dur = clamp(0.45 + s / 500000, 0.45, 0.85);
      noiz(c, { f: 3400, f2: 4800, q: 0.8, a: 0.05, d: dur, peak: 0.045 });
      return grains(c, { dur, n, notes: [D6, E6, Fs6, A6, B6], peak: 0.055, shape: 'fade' });
    },
  },
  condense: {
    en: 'Condense', tier: 2, mat: 'jade', group: 'card', send: 0.22, trim: 2.5,
    make(c) {
      const dur = 0.5;
      noiz(c, { f: 4800, f2: 3000, q: 0.8, a: dur * 0.8, d: 0.12, peak: 0.04 });
      grains(c, { dur, n: 16, notes: [D6, E6, Fs6, A6], peak: 0.05, shape: 'gather' });
      return jade(c, { t: c.t + dur, f: hz(E6), peak: 0.14, d: 0.45 });
    },
  },
  mote: {
    en: 'Light mote', tier: 1, mat: 'jade', group: 'card', send: 0.25, trim: 7,
    make(c) {
      return tone(c, { f: hz(E6), to: hz(Fs6), glide: 0.18, a: 0.02, d: 0.24, peak: 0.08 });
    },
  },
  stream: {
    en: 'Stream light', tier: 2, mat: 'water', group: 'card', send: 0.2, trim: 3.5,
    make(c, o) {
      const D = clamp((o.duration || 900) / 1000, 0.4, 2);
      const notes = [D5, E5, Fs5, A5, B5, D6];
      const pos = [0, 0.22, 0.4, 0.55, 0.68, 0.8];
      noiz(c, { f: 1200, q: 1.5, a: D * 0.3, d: D * 0.7, peak: 0.03, color: 'pink' });
      let e = c.t;
      notes.forEach((m, i) => {
        e = Math.max(e, drop(c, { t: c.t + pos[i] * D, f: hz(m), to: hz(step(i + 1, D5)), glide: 0.04, d: 0.08, peak: 0.12 + 0.03 * i }));
      });
      return e;
    },
  },
  land: {
    en: 'Stone step', tier: 2, mat: 'stone', group: 'card', send: 0.12, trim: 0,
    make(c, o) {
      const k = Number.isFinite(+o.step) ? +o.step : (c.o.rr || 0) % 5;
      thud(c, { f: 260, to: 170, d: 0.06, peak: 0.22 });
      return pluck(c, { t: c.t + 0.005, f: hz(step(k, D5)), peak: 0.32, d: 0.4 });
    },
  },

  // ── 宝藏与愿望 Treasure & wishes ──
  tick: {
    en: 'Count tick', tier: 1, mat: 'wood', group: 'treasure', send: 0.04, cap: 3, trim: 10.5,
    make(c, o) {
      const i = idx(o, c) % 10;
      const m = step(o.up === false ? 9 - i : i, D5);
      tone(c, { f: hz(m), a: 0.0015, d: 0.035, peak: 0.16 });
      return noiz(c, { f: 2300 + 120 * (i % 5), q: 7, a: 0.0008, d: 0.012, peak: 0.16 });
    },
  },
  tickEnd: {
    en: 'Count done', tier: 2, mat: 'jade', group: 'treasure', send: 0.14, trim: 3.5,
    make(c) {
      wood(c, { f: hz(D5), peak: 0.22, d: 0.05 });
      return jade(c, { t: c.t + 0.012, f: hz(A5), peak: 0.2, d: 0.5 });
    },
  },
  wishAdd: {
    en: 'Wish added', tier: 2, mat: 'gold', group: 'treasure', send: 0.18, trim: 0,
    make(c, o) {
      const k = clamp(Number.isFinite(+o.step) ? +o.step : (c.o.rr || 0) % 3, 0, 2);
      const [d0, d1, bell] = [
        [D5, A5, D6],
        [Fs5, B5, Fs6],
        [A5, E6, A6],
      ][k];
      drop(c, { f: hz(d0), to: hz(d1), glide: 0.045, d: 0.08, peak: 0.26 });
      grains(c, { t: c.t + 0.08, dur: 0.3, n: 4, notes: [bell, D6, E6], peak: 0.03 });
      return gold(c, { t: c.t + 0.04, f: hz(bell), peak: 0.16, d: 0.8 });
    },
  },
  wish: {
    en: 'Wish granted', tier: 3, mat: 'gold', group: 'treasure', send: 0.25, trim: -2.5,
    make(c) {
      [D6, Fs6, A6].forEach((m, i) => gold(c, { t: c.t + i * 0.075, f: hz(m), peak: 0.18, d: 1.0 - i * 0.1 }));
      for (const m of [D4, A4]) tone(c, { f: hz(m), a: 0.12, d: 1.0, peak: 0.03 });
      grains(c, { t: c.t + 0.18, dur: 0.8, n: 10, notes: [D6, E6, Fs6, A6, B6], peak: 0.035 });
      return c.t + 1.35;
    },
  },
  achievement: {
    en: 'Achievement', tier: 3, mat: 'string', group: 'treasure', send: 0.22, trim: -7.5,
    make(c) {
      wood(c, { f: hz(D5), peak: 0.18, d: 0.05 });
      [D5, Fs5, A5, D6].forEach((m, i) => pluck(c, { t: c.t + 0.02 + i * 0.085, f: hz(m), peak: i === 3 ? 0.4 : 0.32, d: i === 3 ? 0.9 : 0.5 }));
      gold(c, { t: c.t + 0.19, f: hz(A5), peak: 0.08, d: 0.7 });
      gold(c, { t: c.t + 0.275, f: hz(D6), peak: 0.14, d: 1.0 });
      grains(c, { t: c.t + 0.32, dur: 0.6, n: 8, notes: [D6, E6, Fs6, A6], peak: 0.035 });
      return c.t + 1.45;
    },
  },
  stamp: {
    en: 'Seal stamp', tier: 3, mat: 'stone', group: 'treasure', send: 0.16, trim: 1.5,
    make(c) {
      thud(c, { f: hz(D3) * 1.3, to: hz(D3) * 0.75, d: 0.16, peak: 0.6 });
      noiz(c, { f: 1200, q: 0.8, a: 0.0015, d: 0.03, peak: 0.25 });
      jade(c, { t: c.t + 0.09, f: hz(A5), peak: 0.15, d: 0.6 });
      return jade(c, { t: c.t + 0.12, f: hz(E6), peak: 0.1, d: 0.55 });
    },
  },

  // ── 仪式 Rituals ──
  rub: {
    en: 'Lamp rub', tier: 2, mat: 'paper', group: 'ritual', send: 0.16, trim: 3,
    make(c, o) {
      return rubGesture(c, o.dur || 2.6);
    },
  },
  summon: {
    en: 'Summon', tier: 3, mat: 'gold', group: 'ritual', send: 0.26, trim: 3,
    make(c) {
      noiz(c, { type: 'lowpass', f: 400, f2: 3200, q: 0.8, a: 0.06, d: 0.35, peak: 0.2 });
      for (const m of [D3, A3]) tone(c, { f: hz(m), a: 0.3, d: 1.0, peak: 0.05 });
      [D5, E5, Fs5, A5, B5, D6, E6, Fs6, A6].forEach((m, i) => tone(c, { t: c.t + 0.06 + i * 0.052, f: hz(m), a: 0.003, d: 0.18, peak: 0.07 + 0.012 * i }));
      return gold(c, { t: c.t + 0.55, f: hz(A6), peak: 0.16, d: 1.0 });
    },
  },
  reveal: {
    en: 'Reveal', tier: 3, mat: 'gold', group: 'ritual', send: 0.28, trim: -5.5,
    make(c) {
      thud(c, { f: hz(D3) * 1.4, to: hz(D3), d: 0.5, peak: 0.35 });
      for (const m of [D4, A4, Fs5]) tone(c, { f: hz(m), a: 0.4, d: 1.5, peak: 0.032 });
      // 11 个音的琶音：每个 4 个谐波（第 5、6 个在 7 kHz 的高架下面本来就听不到）、每三个音一个拨片声 —— 节点少一半
      [A4, B4, D5, E5, Fs5, A5, B5, D6, E6, Fs6, A6].forEach((m, i) => pluck(c, { t: c.t + 0.05 + i * 0.04, f: hz(m), peak: 0.12 + 0.018 * i, d: 0.35, bright: 0.8, harmonics: 4, pick: i % 3 === 0 }));
      const tb = c.t + 0.55;
      for (const [m, dt, p, d] of [
        [D6, 0, 0.22, 1.6],
        [A5, 0.03, 0.12, 1.2],
        [Fs6, 0.06, 0.11, 1.2],
        [E6, 0.09, 0.09, 1.0],
      ])
        gold(c, { t: tb + dt, f: hz(m), peak: p, d });
      grains(c, { t: tb + 0.05, dur: 1.4, n: 16, notes: [D6, E6, Fs6, A6, B6], peak: 0.035 });
      return c.t + 2.6;
    },
  },

  // ── 工作室 Studio ──
  grab: {
    en: 'Pick up', tier: 2, mat: 'wood', group: 'studio', send: 0.05, trim: 9,
    make(c) {
      wood(c, { f: hz(E5), peak: 0.26, d: 0.045 });
      noiz(c, { f: 350, f2: 1150, q: 1, a: 0.04, d: 0.06, peak: 0.1, color: 'pink' });
      return drop(c, { t: c.t + 0.03, f: hz(B5), to: hz(E6), glide: 0.03, d: 0.05, peak: 0.12 });
    },
  },
  drop: {
    en: 'Drop', tier: 2, mat: 'stone', group: 'studio', send: 0.06, trim: 2.5,
    make(c) {
      thud(c, { f: 210, to: 120, d: 0.12, peak: 0.5 });
      return wood(c, { t: c.t + 0.05, f: hz(A4), peak: 0.12, d: 0.04, bright: 0.6 });
    },
  },
  apply: {
    en: 'Apply', tier: 2, mat: 'stone', group: 'studio', send: 0.14, trim: 3,
    make(c) {
      thud(c, { f: 220, to: 130, d: 0.1, peak: 0.42 });
      noiz(c, { t: c.t + 0.02, f: 2000, f2: 4200, q: 1.4, a: 0.02, d: 0.05, peak: 0.05 });
      jade(c, { t: c.t + 0.06, f: hz(A5), peak: 0.14, d: 0.45 });
      return jade(c, { t: c.t + 0.1, f: hz(E6), peak: 0.12, d: 0.45 });
    },
  },
};
export const NAMES = Object.keys(KIT);

/** 别名：旧 sound.js、动效、音乐那边原型里用过的名字 → 这一套里的声音（同一件事只有一个声音） */
export const ALIAS = {
  pick: 'select',
  nope: 'error',
  softError: 'error',
  chime: 'reveal',
  granted: 'wish',
  wishGranted: 'wish',
  achieve: 'achievement',
  countUp: 'plus',
  countDown: 'minus',
  countTick: 'tick',
  pickUp: 'grab',
  fly: 'whoosh',
  wipe: 'page',
  settle: 'flipLand',
  copied: 'toast',
};
/** 名字 → KIT 里真的有的名字（没有就 null） */
export const soundName = (n) => (KIT[n] ? n : KIT[ALIAS[n]] ? ALIAS[n] : null);

// ───────────────────────────── 4. 合成一声（现场 / 离线共用） ─────────────────────────────

/**
 * 把一声 name 排到 ctx 的 t 时刻。opts：x（0–1 屏幕横向位置 → 声像）、gain、value / step / size / distance / duration / back / edge …
 * 返回 { out（这一声的输出 GainNode）, end（结束时间） }
 */
/** 一声的出口：音量（trim）→ 声像（按屏幕位置，最多 ±0.35）→ 干声总线 + 混响送 */
function voiceOut(ctx, { gain = 1, x = 0.5, send = 0 } = {}) {
  const R = room(ctx);
  const out = ctx.createGain();
  out.gain.value = gain;
  let node = out;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp((x - 0.5) * 0.7, -0.35, 0.35);
    out.connect(p);
    node = p;
  }
  node.connect(R.bus);
  if (send) {
    const s = ctx.createGain();
    s.gain.value = send;
    node.connect(s);
    s.connect(R.verbIn);
  }
  return out;
}

export function synth(ctx, name, t, opts = {}, seed = (Math.random() * 4294967296) >>> 0, { defer = false } = {}) {
  const def = KIT[soundName(name)];
  if (!def) return null;
  const R = room(ctx);
  const out = voiceOut(ctx, { gain: dbGain(def.trim || 0) * (opts.gain ?? 1), x: opts.x ?? 0.5, send: def.send });
  const c = { ctx, R, out, t, r: rng(seed), o: opts, end: t, later: defer ? [] : null };
  const ret = def.make(c, opts);
  // 真正的结束时间 = 所有积木里最晚的那一个（recipe 自己返回的只是参考）
  return { out, end: Math.max(Number.isFinite(ret) ? ret : t, c.end) + 0.02, later: c.later || [] };
}

/** 离线渲染一串声音：list = [{ name, t, opts, seed }] → AudioBuffer（样片、测试都用它） */
export async function renderOffline(list, { sampleRate = 48000, tail = 1, level = 0.8 } = {}) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const len = Math.max(...list.map((x) => x.t + (x.dur || 3))) + tail;
  const ctx = new OAC(2, Math.ceil(len * sampleRate), sampleRate);
  room(ctx).master.gain.value = level;
  const cues = list.map((x, i) => {
    const v = synth(ctx, x.name, x.t, { ...(x.opts || {}), rr: x.rr ?? i }, x.seed ?? 1000 + i);
    return { name: x.name, t0: x.t, t1: v ? v.end : x.t, label: x.label };
  });
  const buf = await ctx.startRendering();
  return { buffer: buf, cues };
}

// ───────────────────────────── 5. 谁按了什么：委托的覆盖规则 ─────────────────────────────

const CONTROL =
  'button,a[href],area[href],summary,label,select,textarea,input:not([type="hidden"]),[role="button"],[role="link"],[role="tab"],[role="switch"],[role="checkbox"],[role="radio"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="option"],[role="slider"],[role="spinbutton"],[role="treeitem"],[contenteditable="true"],[contenteditable=""]';
const TEXTY = /^(text|search|email|url|tel|password|number|date|time|datetime-local|month|week)$/;
const isTexty = (el) => !!el && ((el.tagName === 'INPUT' && TEXTY.test((el.type || 'text').toLowerCase())) || el.tagName === 'TEXTAREA' || el.isContentEditable);
const attr = (el, k) => (el && el.getAttribute ? el.getAttribute(k) : null);
const isOn = (el) => attr(el, 'aria-pressed') === 'true' || attr(el, 'aria-checked') === 'true' || attr(el, 'aria-selected') === 'true' || el.checked === true || !!el.classList?.contains('on');

/** 按语义推一个默认的声音：开关 / 单选 / 标签页 / 滑杆 / 展开 / 输入框 … 其余一律「轻触」 */
export function semanticSound(el) {
  const tag = el.tagName;
  const role = attr(el, 'role');
  const type = (attr(el, 'type') || '').toLowerCase();
  if (tag === 'INPUT') {
    if (type === 'checkbox') return el.checked ? 'toggleOff' : 'toggleOn';
    if (type === 'radio') return el.checked ? 'tap' : 'select';
    if (type === 'range') return 'grab';
    if (type === 'submit' || type === 'image') return 'confirm';
    if (type === 'reset') return 'back';
    if (type === 'file' || type === 'color') return 'open';
    if (type === 'button') return 'tap';
    return 'focus';
  }
  if (tag === 'TEXTAREA' || el.isContentEditable) return 'focus';
  if (tag === 'SELECT') return 'open';
  if (role === 'switch' || role === 'checkbox' || role === 'menuitemcheckbox') return attr(el, 'aria-checked') === 'true' ? 'toggleOff' : 'toggleOn';
  if (role === 'radio' || role === 'menuitemradio' || role === 'option') return attr(el, 'aria-checked') === 'true' || attr(el, 'aria-selected') === 'true' ? 'tap' : 'select';
  if (role === 'tab') return attr(el, 'aria-selected') === 'true' ? 'tap' : 'select';
  if (role === 'slider' || role === 'spinbutton') return 'grab';
  const pressed = attr(el, 'aria-pressed');
  if (pressed === 'true') return 'deselect';
  if (pressed === 'false') return 'select';
  const exp = attr(el, 'aria-expanded');
  if (exp === 'true') return 'close';
  if (exp === 'false') return 'open';
  if (tag === 'SUMMARY') return el.parentElement?.open ? 'close' : 'open';
  if (tag === 'BUTTON' && el.form && (attr(el, 'type') || 'submit') === 'submit') return 'confirm';
  return 'tap';
}

/** 「家族」名字 → 具体的声音（看元素现在的状态：按下去之后会变成什么） */
function concretize(spec, el) {
  if (spec == null) return null;
  if (typeof spec === 'object') return spec.name ? { name: spec.name, opts: spec.opts || { ...spec, name: undefined } } : null;
  const s = String(spec).trim();
  const [name, arg] = s.split(':');
  const on = isOn(el);
  const opts = {};
  if (arg !== undefined && arg !== '') opts.step = opts.value = Number.isFinite(+arg) ? +arg : arg;
  const v = attr(el, 'data-sfx-value');
  if (v !== null && v !== '') opts.value = Number.isFinite(+v) ? +v : v;
  switch (name) {
    case 'chip':
      return { name: on ? 'chipRemove' : 'chipAdd', opts };
    case 'toggle':
      return { name: on ? 'toggleOff' : 'toggleOn', opts };
    case 'cross':
      return { name: on ? 'chipRemove' : 'cross', opts };
    case 'choice':
      return { name: on ? 'deselect' : 'select', opts };
    case 'radio':
      return { name: on ? 'tap' : 'select', opts };
    case 'auto':
      return { name: semanticSound(el), opts };
    default:
      return { name: soundName(name) || name, opts };
  }
}

const WARNED = new Set();
function warnUnknown(name) {
  if (WARNED.has(name)) return;
  WARNED.add(name);
  try {
    console.warn(`[sfx] unknown sound "${name}" — using the default for this control`);
  } catch {
    /* ignore */
  }
}

/**
 * 一下触碰该响什么。返回 { name, opts, el } · { name: null, optOut: true }（data-sfx="none"）· null（不是可以按的东西）。
 * 先后顺序：最近的 data-sfx（自己或外层容器）→ 规则（rules，按 CSS 选择器；可以是函数）→ 语义默认 → 轻触。
 */
export function resolveSound(target, { rules = [] } = {}) {
  const el0 = target && target.nodeType === 1 ? target : target?.parentElement;
  if (!el0 || !el0.closest) return null;
  const tag = el0.closest('[data-sfx]');
  let ctl = el0.closest(CONTROL);
  let explicit = null;
  if (tag && (!ctl || tag === ctl || tag.contains(ctl) || ctl.contains(tag))) explicit = tag.getAttribute('data-sfx');
  if (explicit && /^(none|off|silent)$/i.test(explicit.trim())) return { name: null, optOut: true, el: ctl || tag };
  let ruleSpec;
  let ruleHit = null;
  // 写在外层容器上的 data-sfx 是「这一组按钮的默认」：点到容器里不是按钮的地方（标题、空白）不出声
  if (!ctl && explicit && tag.querySelector && tag.querySelector(CONTROL)) return null;
  if (!ctl && !explicit) {
    // 规则可以点名「不是按钮、但点了会有反应」的东西（例如点背景收起面板）
    for (const r of rules) {
      if (!r.any) continue;
      // any: 'self' = 只有点在它自己身上（例如面板外的暗色背景）才算；any: true = 点在它里面任何地方都算
      const hit = r.any === 'self' ? (el0.matches?.(r.sel) ? el0 : null) : el0.closest(r.sel);
      if (hit) {
        ruleHit = hit;
        ruleSpec = r.sound;
        break;
      }
    }
    if (!ruleHit) {
      if (!tag) return null;
      ctl = tag;
    }
  }
  let el = ctl || tag || ruleHit;
  if (el.tagName === 'LABEL') {
    const inner = el.control || el.querySelector?.('input,select,textarea');
    if (inner) el = inner;
  }
  if (el.disabled || attr(el, 'aria-disabled') === 'true' || el.closest?.('fieldset[disabled]')) return { name: 'disabled', opts: {}, el };
  let spec = explicit;
  if (spec == null && ruleSpec !== undefined) spec = typeof ruleSpec === 'function' ? ruleSpec(el) : ruleSpec;
  if (spec == null && !ruleHit) {
    for (const r of rules) {
      if (r.any) continue;
      let m = false;
      try {
        m = el.matches(r.sel);
      } catch {
        m = false;
      }
      if (m) {
        spec = typeof r.sound === 'function' ? r.sound(el) : r.sound;
        if (spec !== undefined) break;
      }
    }
  }
  if (spec != null && /^(none|off|silent)$/i.test(String(spec))) return { name: null, optOut: true, el };
  const res = spec != null ? concretize(spec, el) : { name: semanticSound(el), opts: {} };
  if (!res || !KIT[res.name]) {
    if (res && res.name) warnUnknown(res.name);
    return { name: semanticSound(el), opts: {}, el };
  }
  return { ...res, el };
}

// ───────────────────────────── 5b. WISH 的每页对照表（默认规则） ─────────────────────────────
// 规则只是「默认」：元素上写了 data-sfx 就以 data-sfx 为准；页面自己的规则排在这些前面。
// 这一张表 = SPEC.md §7 每页对照表里能用 class 认出来的部分；其余（揭晓、召唤、数完 …）是代码里的 sfx.play()。

/** 三个愿望：第 1、2、3 个 = wishAdd:0/1/2（D、F#、A）；已经三个了再按 = 轻提示；再按一次已选的 = 取消 */
function wishSound(el) {
  if (isOn(el)) return 'deselect';
  const grid = el.closest?.('.wish-grid') || el.parentElement;
  const n = grid ? grid.querySelectorAll('.wish.on, .wish[aria-pressed="true"]').length : 0;
  return n >= 3 ? 'error' : `wishAdd:${n}`;
}
/** 声音开关（aria-pressed = 现在是静音）：按下去 = 反过来 */
const muteSound = (el) => (attr(el, 'aria-pressed') === 'true' || el.classList?.contains('is-on') ? 'toggleOn' : 'toggleOff');

export const WISH_RULES = [
  // 自己出声的东西：不要默认的「轻触」
  { sel: '.lamp-touch', sound: 'none' }, // 擦神灯：代码里 sfx.rub({ progress, speed }) 持续发声
  // 面板的「关闭 / 好了」排在按钮等级前面：带回家那张单子的「好了」是 .btn-primary.take-done —— 是收起，不是往前走（SPEC §7.2）
  { sel: '.ws-x, .take-done', sound: 'close' },
  { sel: '.take-veil, .ws-scrim', sound: 'close', any: 'self' }, // 点面板外的暗色背景收起
  // 按钮的等级（quiz / wish / blueprint 共用的 .btn 体系）
  { sel: '.btn-gold, .ws-go, .cover-go, .ln-wish-go', sound: 'confirm' },
  { sel: '.btn-primary', sound: 'next' },
  { sel: '.nav-back, .btn-ghost, .ws-act.is-end', sound: 'back' },
  // 潘吉正在说话：轻点她的话泡泡（或她自己）= 跳过这一句（voice.js 的 data-voice-skip）—— 有反应的触碰都要有声音
  { sel: '.companion.is-speaking [data-voice-skip], [data-voice-skip].is-talking', sound: 'tap', any: true },
  { sel: '.ws-mute, header .icon-btn[aria-pressed], [data-sfx-role="mute"]', sound: muteSound }, // 许愿模式外壳 / 许愿之旅顶栏的静音
  // 选择
  { sel: '.wish', sound: wishSound },
  { sel: '.opt.is-x, .nogo-color', sound: 'cross' },
  { sel: '.opt, .pair-card', sound: 'choice' }, // 多选：再按 = 取消选中（单选的那一组在容器上写 data-sfx="radio"）
  { sel: '.chip', sound: 'radio' }, // 单选标签：按已选的那个 = 轻触
  { sel: '.lang-toggle button', sound: 'radio' }, // 中 / EN：按现在的语言 = 轻触，换语言 = 选中
  // 导航 / 大厅
  { sel: '.ln-card', sound: 'next' },
  { sel: '.ln-del, .ln-clear', sound: 'chipRemove' },
];

// ───────────────────────────── 6. 现场：Sfx ─────────────────────────────

const UNLOCK = ['pointerup', 'touchend', 'click', 'keydown', 'mousedown'];
const LS = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* 私密浏览 / 被挡：只在这一次有效 */
    }
  },
};
const IOS_TOUCH = HAS_DOM && (/iP(ad|hone|od)/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
/** 许愿模式（quiz 在外壳的 iframe 里，?mode=wish）：揭晓那一刻由外壳的音乐负责（《星灯》的刮奏），音效只响全息光 holo（SPEC §9） */
const MUSIC_OWNS_REVEAL =
  HAS_DOM &&
  (() => {
    try {
      return new URLSearchParams(location.search).get('mode') === 'wish';
    } catch {
      return false;
    }
  })();

export class Sfx {
  constructor({ key = 'genie.mute', levelKey = 'genie.sfxLevel', level = 0.8, maxVoices = 14 } = {}) {
    this.key = key;
    this.levelKey = levelKey;
    this.maxVoices = maxVoices;
    this.ctx = null;
    this.R = null;
    this.muted = LS.get(key) === '1';
    const L = parseFloat(LS.get(levelKey));
    this.level = Number.isFinite(L) ? clamp(L, 0, 1) : level;
    this.voices = [];
    this.rr = {};
    this.duckF = 1; // duck(true)：潘吉说话时音效 × 0.6、数字跳动的「嗒」先不响（动效 SPEC；默认不接）
    this.pending = null;
    this.press = null;
    this.pointer = { x: 0.5, at: -1e9 };
    this.typing = 'auto'; // 'auto'：iPhone / iPad 的屏幕键盘自己会响「哒哒」，就不再叠一层；有实体键盘的电脑照常响
    this.onPlay = null; // (name, opts, status, via, el) => void —— 测试 / 调试（status 见 _emit）
    this.log = null; // enableLog() 之后 = window.__sfxLog
    this._armed = false;
    this._gesture = () => this.unlock();
    this._rub = null;
    this._bound = null;
    this._sl = new WeakMap();
    this._lastType = 0;
    // 旧 sound.js 的写法（sfx.tap() …）照样能用
    this.tap = () => this._legacyPress('tap');
    this.pick = () => this._legacyPress('select');
    this.nope = () => this._legacyPress('error');
    this.wish = () => this._legacyPress('wishAdd');
    this.flip = () => this.play('flip', {}, 'legacy');
    this.musicReveal = MUSIC_OWNS_REVEAL; // true：揭晓的金铃交给音乐，fx / chime() 报的 reveal 只响 holo
    this.chime = () => this.play(this.musicReveal ? 'holo' : 'reveal', {}, 'legacy');
    this.summon = () => this.play('summon', {}, 'legacy');
    /** 给 fx.js：fx.config.sound = sfx.fx */
    this.fx = (name, arg) => this._fromFx(name, arg);
    if (HAS_DOM) {
      this._arm();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.ctx && !this.live()) {
          try {
            this.ctx.resume().catch(() => {});
          } catch {
            /* ignore */
          }
          this._arm();
        }
      });
    }
  }

  // ── 状态 ──
  isMuted() {
    return this.muted;
  }
  /** persist:false = 只管这一次（许愿模式外壳的静音不要记一辈子）；从静音变回有声 → 轻轻「嗒」一声确认 */
  setMuted(v, { persist = true, confirm = true } = {}) {
    const was = this.muted;
    this.muted = !!v;
    if (persist) LS.set(this.key, this.muted ? '1' : '0');
    // 是手指按「静音」按的：让按下去那一声「嗒」先响完（0.14 s）再收
    this._applyGain(!was && this.muted && this.press && now() - this.press.at < 600 ? 0.14 : 0);
    if (was && !this.muted && confirm && this.press && now() - this.press.at < 1500) this.play('toggleOn');
  }
  getLevel() {
    return this.level;
  }
  setLevel(v, { persist = true } = {}) {
    this.level = clamp(+v || 0, 0, 1);
    if (persist) LS.set(this.levelKey, String(this.level));
    this._applyGain();
  }
  live() {
    return !!this.ctx && this.ctx.state === 'running';
  }
  /** 潘吉说话时：音效轻一点（× factor），数字跳动的「嗒」先不响。duck(false) 回来。可选：语音模块的 onTalking 接这里 */
  duck(on = true, factor = 0.6) {
    this.duckF = on ? clamp(+factor || 0, 0, 1) : 1;
    this._applyGain();
  }
  /**
   * 离开这一页（pagehide）：音效的总音量在 ms 毫秒里收到 0 —— 文档卸载时 AudioContext 被拆掉，正在响的
   * 「下一步」「换页」不会被硬切成一声「喀」（iPad 上尤其明显）。回到这一页（bfcache 的 pageshow）自动恢复
   */
  fadeOut(ms = 40) {
    this._leaving = true;
    if (!this.ctx || !this.R) return;
    try {
      const p = this.R.master.gain;
      const t = this.ctx.currentTime;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(0, t + Math.max(0.005, ms / 1000));
    } catch {
      /* ignore */
    }
  }
  _applyGain(delay = 0) {
    this._leaving = false;
    if (!this.ctx || !this.R) return;
    const g = this.muted ? 0 : this.level * this.duckF;
    try {
      const p = this.R.master.gain;
      const t = this.ctx.currentTime;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.setTargetAtTime(g, t + delay, 0.02);
    } catch {
      this.R.master.gain.value = g;
    }
  }

  // ── AudioContext：第一下手势才建 / 解锁 ──
  _ensure() {
    if (this.ctx) return this.ctx;
    if (!HAS_DOM) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
    }
    this.R = room(this.ctx);
    this.R.master.gain.value = this.muted ? 0 : this.level * this.duckF;
    if (this.ctx.addEventListener) this.ctx.addEventListener('statechange', () => this._onState());
    else this.ctx.onstatechange = () => this._onState();
    return this.ctx;
  }
  /** 在手势里调用（模块自己已经挂好了 pointerup / touchend / click / keydown 的监听，一般不用手动调） */
  unlock() {
    const ctx = this._ensure();
    if (!ctx) return false;
    try {
      if (ctx.state !== 'running') {
        const p = ctx.resume();
        if (p && p.then) p.then(() => this._onState(), () => {});
      }
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      /* ignore */
    }
    if (ctx.state === 'running') this._onState();
    return ctx.state === 'running';
  }
  _arm() {
    if (this._armed || !HAS_DOM) return;
    this._armed = true;
    for (const e of UNLOCK) window.addEventListener(e, this._gesture, { capture: true, passive: true });
  }
  _disarm() {
    if (!this._armed) return;
    this._armed = false;
    for (const e of UNLOCK) window.removeEventListener(e, this._gesture, true);
  }
  _onState() {
    if (this.live()) {
      this._disarm();
      const p = this.pending;
      this.pending = null;
      if (p && now() - p.at < 700) this._play(p.name, p.opts, 'unlock', elOf(p.el));
    } else if (this.ctx && this.ctx.state !== 'closed') this._arm();
  }

  /** 和音乐共用一个 AudioContext（iPad 上一页一个就好）：音乐引擎建好 ctx 后调用。音效仍有自己的 master（音量 / 静音分开） */
  attach(ctx) {
    if (!ctx || this.ctx === ctx) return this;
    const old = this.ctx;
    this.ctx = ctx;
    this.R = room(ctx);
    this.R.master.gain.value = this.muted ? 0 : this.level * this.duckF;
    this.voices = [];
    if (ctx.addEventListener) ctx.addEventListener('statechange', () => this._onState());
    if (old && old !== ctx) {
      try {
        old.close();
      } catch {
        /* ignore */
      }
    }
    this._onState();
    return this;
  }

  // ── 出声 ──
  /** 响一声。opts：x（0–1 横向位置）、gain、value / step / size / distance / duration … 返回 { stop() } 或 null。
   *  name 也可以是别名（ALIAS：pick、nope、chime、countUp …）。via / el 只给记录用（__sfxLog） */
  play(name, opts = {}, via = 'code', el = null) {
    const n = soundName(name);
    if (!n) {
      this._emit(name, opts, 'unknown', via, el);
      return null;
    }
    name = n;
    if (this.muted || this.level <= 0) {
      this._emit(name, opts, 'muted', via, el);
      return null;
    }
    if (this.duckF < 1 && name === 'tick') {
      this._emit(name, opts, 'merged', via, el); // 潘吉在说话：数字跳动的「嗒」先不响
      return null;
    }
    const ctx = this._ensure();
    if (!ctx) {
      this._emit(name, opts, 'noaudio', via, el);
      return null;
    }
    if (!this.live()) {
      this.pending = { name, opts, at: now(), el: weakEl(el) };
      try {
        ctx.resume().catch(() => {});
      } catch {
        /* ignore */
      }
      this._emit(name, opts, 'deferred', via, el);
      return null;
    }
    return this._play(name, opts, via, el);
  }
  _play(name, opts = {}, via = 'code', el = null) {
    const def = KIT[name];
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.004;
    this.voices = this.voices.filter((v) => v.end > t);
    const same = this.voices.filter((v) => v.name === name);
    if (def.cap && same.length >= def.cap) this._stop(same[0], 0.012);
    while (this.voices.length >= this.maxVoices) this._stop(this.voices[0], 0.015);
    const rr = (this.rr[name] = ((this.rr[name] || 0) + 1) % 997);
    const x = opts.x ?? (now() - this.pointer.at < 1200 ? this.pointer.x : 0.5);
    const v = synth(ctx, name, t, { ...opts, x, rr }, undefined, { defer: true });
    if (!v) return null;
    const voice = { name, out: v.out, end: v.end, timers: [], stop: (fade = 0.04) => this._stop(voice, fade) };
    // 晚一点才响的部分：按 60 ms 一组，开始前 0.25 s 再建节点；主线程太忙、已经来不及的就不建了（宁可少一粒金尘，也不要「喀」）
    const items = v.later.sort((p, q) => p.at - q.at);
    for (let i = 0; i < items.length; ) {
      const b0 = items[i].at;
      const bucket = [];
      while (i < items.length && items[i].at < b0 + 0.06) bucket.push(items[i++]);
      const wait = Math.max(0, (b0 - 0.25 - ctx.currentTime) * 1000);
      voice.timers.push(
        setTimeout(() => {
          if (voice.dead) return;
          const tooLate = ctx.currentTime + 0.012;
          for (const it of bucket) {
            if (it.at <= tooLate) continue;
            try {
              it.fn();
            } catch {
              /* ignore */
            }
          }
        }, wait)
      );
    }
    this.voices.push(voice);
    this._emit(name, opts, 'played', via, el);
    return voice;
  }
  _stop(voice, fade = 0.02) {
    voice.dead = true;
    for (const id of voice.timers || []) clearTimeout(id);
    const i = this.voices.indexOf(voice);
    if (i >= 0) this.voices.splice(i, 1);
    const ctx = this.ctx;
    if (!ctx || !voice.out) return;
    const t = ctx.currentTime;
    try {
      const g = voice.out.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.setTargetAtTime(0, t, fade / 4);
    } catch {
      /* ignore */
    }
    voice.end = t + fade;
    setTimeout(() => {
      try {
        voice.out.disconnect();
      } catch {
        /* ignore */
      }
    }, (fade + 0.08) * 1000);
  }
  /** status：played · deferred（等解锁，手指抬起时补上）· muted · merged（同一下已经响过）· optout（data-sfx="none"）· unknown · noaudio */
  _emit(name, opts, status, via = 'code', el = null) {
    try {
      this.onPlay?.(name, opts, status, via, el);
    } catch {
      /* 测试钩子不能影响出声 */
    }
    const L = this.log;
    if (!L) return;
    const rec = { t: Math.round(now()), name, status, via, el: el ? describeEl(el) : '' };
    // .node = 那个元素，但只用弱引用（不可枚举的 getter）：记录里留着 2000 条也不会把换掉的整个画面一直留在内存里
    const ref = el && typeof WeakRef === 'function' ? new WeakRef(el) : null;
    Object.defineProperty(rec, 'node', { get: () => ref?.deref() || null });
    L.push(rec);
    if (L.length > 2000) L.splice(0, L.length - 2000);
  }
  /** 开发 / 测试：window.__sfxLog 记下每一下（谁、什么声音、响了没有）。正式环境默认关 */
  enableLog() {
    if (!this.log) this.log = [];
    if (HAS_DOM) {
      window.__sfxLog = this.log;
      window.__sfx = this;
    }
    return this.log;
  }

  // ── 擦神灯（持续） ──
  /** 每次手指在灯上动（或按住）就调一下：progress 0–1，speed 0–1。停手 0.26 s 自己淡出 */
  rub(arg = {}) {
    const o = typeof arg === 'number' ? { progress: arg } : arg || {};
    if (this.muted || this.level <= 0) return;
    const ctx = this._ensure();
    if (!ctx) return;
    if (!this.live()) {
      try {
        ctx.resume().catch(() => {});
      } catch {
        /* ignore */
      }
      return;
    }
    const n = ctx.currentTime;
    let R = this._rub;
    if (!R) {
      const x = now() - this.pointer.at < 1200 ? this.pointer.x : 0.5;
      const out = voiceOut(ctx, { gain: dbGain(KIT.rub.trim || 0), x, send: KIT.rub.send });
      const src = ctx.createBufferSource();
      src.buffer = this.R.noise.white;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.1;
      bp.frequency.value = 1200;
      const soft = ctx.createBiquadFilter();
      soft.type = 'lowpass';
      soft.frequency.value = 5200;
      soft.Q.value = 0.5;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, n);
      src.connect(bp);
      bp.connect(soft);
      soft.connect(g);
      g.connect(out);
      const hum = [0, 1].map(() => {
        const os = ctx.createOscillator();
        os.frequency.value = hz(D4);
        const hg = ctx.createGain();
        hg.gain.value = 0;
        hg.gain.setValueAtTime(0, n);
        os.connect(hg);
        hg.connect(out);
        os.start(n);
        return { os, hg };
      });
      src.start(n, Math.random());
      R = this._rub = { out, src, bp, g, hum, spark: n, timer: 0, p: 0, r: rng((Math.random() * 4294967296) >>> 0) };
    }
    R.p = clamp(o.progress ?? Math.min(1, R.p + 0.02), 0, 1);
    const P = rubParams(R.p, clamp(o.speed ?? 0.7, 0, 1));
    R.g.gain.setTargetAtTime(P.noise, n, 0.03);
    R.bp.frequency.setTargetAtTime(P.f, n, 0.05);
    R.hum.forEach((h, j) => {
      h.hg.gain.setTargetAtTime(P.hum, n, 0.15);
      h.os.frequency.setTargetAtTime(hz(P.humNotes[j]), n, 0.06);
    });
    if (n - R.spark > 1 / P.rate) {
      R.spark = n;
      const c = { ctx, R: this.R, out: R.out, t: n + 0.004, r: R.r, o: {} };
      jade(c, { f: hz(P.spark(R.r)), peak: P.sparkPeak, d: 0.3 });
    }
    clearTimeout(R.timer);
    R.timer = setTimeout(() => this.rubEnd(), 260);
  }
  rubEnd() {
    const R = this._rub;
    if (!R) return;
    this._rub = null;
    clearTimeout(R.timer);
    const ctx = this.ctx;
    const n = ctx.currentTime;
    R.g.gain.setTargetAtTime(0, n, 0.05);
    R.hum.forEach((h) => h.hg.gain.setTargetAtTime(0, n, 0.08));
    try {
      R.src.stop(n + 0.5);
      R.hum.forEach((h) => h.os.stop(n + 0.6));
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        R.out.disconnect();
      } catch {
        /* ignore */
      }
    }, 900);
  }

  // ── 动效的声音（fx.js 的 config.sound）：同一下触碰只响一次 ──
  _fromFx(name, arg) {
    const a = arg && typeof arg === 'object' ? arg : {};
    switch (name) {
      case 'tap': {
        const p = this.press;
        if (p && now() - p.at < 160) {
          this._emit('tap', a, 'merged', 'fx'); // pointerdown 的委托监听已经响过（或这一个 data-sfx="none"）
          return null;
        }
        return this.play('tap', {}, 'fx');
      }
      case 'scan':
        return this.play(a.holo ? 'holo' : 'scan', {}, 'fx');
      case 'fly':
        return this.play('whoosh', { distance: a.distance }, 'fx');
      case 'land':
        return this.play('land', { step: Number.isFinite(+arg) ? +arg : a.step ?? a.note }, 'fx');
      case 'tick':
        return this.play('tick', { value: a.value, up: a.up }, 'fx');
      case 'stream':
        return this.play('stream', { duration: a.duration }, 'fx');
      case 'wipe':
        return this.play('page', {}, 'fx');
      case 'dissolve':
        return this.play('dissolve', { size: a.size }, 'fx');
      case 'reveal':
        return this.play(this.musicReveal ? 'holo' : 'reveal', {}, 'fx');
      default:
        return soundName(name) ? this.play(name, a, 'fx') : null;
    }
  }

  // ── 旧 API：onClick 里的 sfx.tap() 之类 —— 如果 pointerdown 已经响过同一下，就不再叠一声 ──
  _legacyPress(name) {
    const p = this.press;
    if (p && now() - p.at < 1500 && !p.used) {
      p.used = true;
      if (p.optOut || p.name !== 'tap' || name === 'tap') {
        this._emit(name, {}, 'merged', 'legacy', elOf(p.el));
        return null;
      }
    }
    return this.play(name, {}, 'legacy');
  }

  // ── 覆盖：一个委托的 pointerdown（+ 键盘、滑杆、打字），整个页面的按钮都有声音 ──
  /** rules：[{ sel, sound, any? }]（sound 可以是名字、家族 'chip' | 'toggle' | 'cross' | 'choice'、'none'，或函数 el → 名字）。返回解绑函数 */
  bind(root = HAS_DOM ? document : null, { rules = [], typing } = {}) {
    if (!root) return () => {};
    this._unbind?.();
    if (typing !== undefined) this.typing = typing;
    const opt = { rules };
    const down = (e) => {
      if (e.button > 0 || e.isPrimary === false) return;
      if (typeof e.clientX === 'number' && HAS_DOM) this.pointer = { x: clamp(e.clientX / (window.innerWidth || 1), 0, 1), at: now() };
      const res = resolveSound(e.target, opt);
      if (!res) return;
      if (!res.name) {
        this.press = { at: now(), name: null, optOut: true, el: weakEl(res.el) };
        this._emit(null, {}, 'optout', 'press', res.el);
        return;
      }
      const voice = this.play(res.name, res.opts || {}, 'press', res.el);
      this.press = { at: now(), name: res.name, voice, used: false, el: weakEl(res.el) };
    };
    const cancel = () => {
      const p = this.press;
      if (p && p.voice && now() - p.at < 220) p.voice.stop(0.03); // 手指其实是在滑动页面
    };
    const key = (e) => {
      if (e.repeat || e.isComposing || (e.key !== 'Enter' && e.key !== ' ')) return;
      const t = e.target;
      if (!t || !t.closest) return;
      if (isTexty(t)) {
        if (e.key === 'Enter' && t.tagName === 'INPUT') this.play('tap', {}, 'key', t);
        return;
      }
      if (e.key === ' ' && t.tagName === 'A') return;
      const res = resolveSound(t, opt);
      if (!res || !res.name) return;
      const voice = this.play(res.name, res.opts || {}, 'key', res.el);
      this.press = { at: now(), name: res.name, voice, used: false, el: weakEl(res.el) };
    };
    const input = (e) => {
      const t = e.target;
      if (!t || !t.tagName) return;
      if (t.tagName === 'INPUT' && t.type === 'range') return this._sliderTick(t);
      if (!isTexty(t)) return;
      const on = this.typing === true || (this.typing === 'auto' && !IOS_TOUCH);
      if (!on) return;
      const n = now();
      if (n - this._lastType < 30) return;
      this._lastType = n;
      const res = resolveSound(t, opt);
      if (res && res.optOut) return;
      this.play('type', { back: /^delete/.test(e.inputType || '') }, 'type', t);
    };
    const change = (e) => {
      const t = e.target;
      if (t && t.tagName === 'SELECT') {
        const res = resolveSound(t, opt);
        if (!res || res.optOut) return;
        this.play('select', {}, 'change', t);
      }
    };
    const custom = (e) => {
      const d = e.detail || {};
      if (d.name) this.play(d.name, d, 'event');
    };
    const cap = { capture: true, passive: true };
    root.addEventListener('pointerdown', down, cap);
    root.addEventListener('pointercancel', cancel, cap);
    root.addEventListener('keydown', key, true);
    root.addEventListener('input', input, true);
    root.addEventListener('change', change, true);
    if (HAS_DOM) window.addEventListener('wish:sfx', custom);
    this._unbind = () => {
      root.removeEventListener('pointerdown', down, cap);
      root.removeEventListener('pointercancel', cancel, cap);
      root.removeEventListener('keydown', key, true);
      root.removeEventListener('input', input, true);
      root.removeEventListener('change', change, true);
      if (HAS_DOM) window.removeEventListener('wish:sfx', custom);
      this._unbind = null;
    };
    return this._unbind;
  }
  _sliderTick(t) {
    const res = resolveSound(t, { rules: [] });
    if (res && res.optOut) return;
    const min = t.min === '' ? 0 : +t.min;
    const max = t.max === '' ? 100 : +t.max;
    const v = +t.value;
    const span = max - min || 1;
    const p = clamp((v - min) / span, 0, 1);
    const stepN = Math.max(1, Math.round(span / (+t.step || 1)));
    const q = Math.round(p * Math.min(stepN, 24)); // 声音最多 24 格（再细就是一串噪音）
    const last = this._sl.get(t);
    const n = now();
    if (last && last.q === q) return;
    if (last && n - last.at < 28) {
      this._sl.set(t, { q, at: last.at });
      return;
    }
    this._sl.set(t, { q, at: n });
    this.play('slider', { value: p, edge: v <= min || v >= max }, 'slider', t);
  }
}

/** 记录里的元素写法：tag#id.class.class[data-sfx] “文字” */
function describeEl(el) {
  try {
    if (!el || !el.tagName) return String(el || '');
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3) : [];
    const ds = attr(el, 'data-sfx');
    const label = (attr(el, 'aria-label') || el.textContent || attr(el, 'placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls.map((c) => '.' + c).join('')}${ds ? `[data-sfx=${ds}]` : ''}${label ? ` “${label}”` : ''}`;
  } catch {
    return '?';
  }
}

/** 开发（Vite dev）、自动化测试（navigator.webdriver）、或网址带 ?sfxlog：打开 window.__sfxLog */
export const LOG_ON =
  HAS_DOM &&
  (() => {
    try {
      return !!import.meta.env?.DEV || navigator.webdriver === true || /[?&#]sfxlog\b/.test(location.search + location.hash) || window.__SFX_LOG__ === true;
    } catch {
      return false;
    }
  })();

/** 整个 App 一个就够（也是旧 sound.js 的 sfx） */
export const sfx = new Sfx({ level: CONFIG.music?.sfxLevel ?? 0.8 });
if (LOG_ON) sfx.enableLog();
export default sfx;

let INSTALLED = false;
let LIFECYCLE = false;

/**
 * 一页一次：
 *  · 在许愿模式外壳的 iframe 里（quiz、3D 工作室）：外壳的「静音」和员工的「按钮音效」开关（{ source: 'genie-shell', type: 'sfx', muted }）
 *    直接管这一页的音效 —— 子页面自己不用写（以前只有 quiz 接了，3D 工作室里的按钮照响）。只管这一位客人：不写进本机
 *  · pagehide：音效淡出（fadeOut），换页不「喀」；pageshow（bfcache 回来）恢复
 */
function installLifecycle() {
  if (LIFECYCLE || !HAS_DOM) return;
  LIFECYCLE = true;
  let framed = false;
  try {
    framed = window.parent && window.parent !== window;
  } catch {
    framed = false;
  }
  if (framed)
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (e.origin !== location.origin || e.source !== window.parent || !d || d.source !== 'genie-shell' || d.type !== 'sfx') return;
      sfx.setMuted(!!d.muted, { persist: false, confirm: false });
    });
  window.addEventListener('pagehide', () => sfx.fadeOut(40));
  window.addEventListener('pageshow', (e) => {
    if (e.persisted || sfx._leaving) sfx._applyGain();
  });
}
/**
 * 每一页的入口调用一次（quiz / wish / launcher / studio 的 main.jsx）：
 *   installSfx()                          —— 整页的按钮都有声音（WISH_RULES + 语义默认 + 轻触）
 *   installSfx({ rules, fx, ctx })        —— rules：这一页自己的规则（排在 WISH_RULES 前面）；fx：motion 的 fx 模块（接上 fx.config.sound）；
 *                                            ctx：和音乐共用的 AudioContext（也可以之后再 sfx.attach(ctx)）
 * 再调用一次不会重复绑定（只会补上 fx / ctx）。返回 sfx。
 */
export function installSfx({ root, rules = [], fx = null, ctx = null, typing, wishRules = true } = {}) {
  if (!HAS_DOM) return sfx;
  if (fx && fx.config) fx.config.sound = sfx.fx;
  if (ctx) sfx.attach(ctx);
  if (INSTALLED) return sfx;
  INSTALLED = true;
  installLifecycle();
  sfx.bind(root || document, { rules: wishRules ? [...rules, ...WISH_RULES] : rules, typing });
  return sfx;
}

/**
 * 这一页的 AudioContext（第一次调用时建；可能还在 suspended，等第一下触碰解锁）。背景音乐 zen.js 用它：
 * 音乐和音效共用一个 ctx（iPad 上省 CPU、只解锁一次）；各自有自己的 master（音量 / 静音分开）。没有 Web Audio = null
 */
export function getAudioContext() {
  return sfx._ensure();
}

/** 响一声（= sfx.play）：sound.play('scan') 这种写法也接得住 */
export function play(name, opts) {
  return sfx.play(name, opts);
}

/** 离开页面前把音效收掉（= sfx.fadeOut；pagehide 时 installSfx 已经自动做了） */
export function fadeOut(ms) {
  sfx.fadeOut(ms);
}

// 旧 sound.js 的导出名
export const isMuted = () => sfx.isMuted();
export function setMuted(v, opts) {
  sfx.setMuted(v, opts);
}
export function unlock() {
  return sfx.unlock();
}
