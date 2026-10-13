// zs-dsp.js —— WISH 禅意音乐的「纯数学」部分：随机数、音名、谱子解析、可无缝循环的噪声、混响脉冲、
// 拨弦（Karplus-Strong）与模态合成的波表。不碰 DOM，AudioContext 与 OfflineAudioContext 都能用。
// 全部原创合成：没有任何采样、没有任何外部文件。

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const mhz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** 可复现的随机数（mulberry32）：同一个 seed → 同一段音乐（离线渲染、测试都要可复现） */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + r() * (b - a);
  r.int = (a, b) => Math.floor(a + r() * (b - a + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
  r.chance = (p) => r() < p;
  r.gauss = () => (r() + r() + r() + r() - 2) * 1.732; // ≈ N(0, 1)
  return r;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ───────────── 音名与谱子 ─────────────
const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** 'f#4' → 66 · 'd5' → 74（C4 = 60） */
export function midi(name) {
  const m = /^([a-g])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad pitch "${name}"`);
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/**
 * 一行谱子 → 音符数组。例：'a4 b4:.5 d5:.5 e5:2~ | d5 b4 a4:2'
 *   音名 + 八度（r = 休止）· :拍数（默认 1）
 *   记号：> 重 · _ 轻 · ~ 上滑音（从下一个音按上来，古筝「按音」）· \ 下滑音（尾音放下来）·
 *         v 揉弦 / 颤音 · * 摇指（长音快速重复）· ' 倚音（上方一个音先点一下）。'|' 只是小节线，方便读。
 */
export function parseNotes(str) {
  const out = [];
  for (const tok of String(str).trim().split(/\s+/)) {
    if (!tok || tok === '|') continue;
    // 记号写在拍数前后都可以：'d4_:2' = 'd4:2_'
    const m = /^(r|[a-g][#b]?-?\d)([>_~\\v*']*)(?::([\d.]+))?([>_~\\v*']*)$/.exec(tok);
    if (!m) throw new Error(`bad note "${tok}"`);
    const f = (m[2] || '') + (m[4] || '');
    out.push({
      m: m[1] === 'r' ? null : midi(m[1]),
      d: m[3] ? Number(m[3]) : 1,
      v: f.includes('>') ? 0.9 : f.includes('_') ? 0.45 : 0.7,
      slide: f.includes('~'),
      fall: f.includes('\\'),
      vib: f.includes('v'),
      trem: f.includes('*'),
      grace: f.includes("'"),
    });
  }
  return out;
}

/** 和弦：'[d3 a3 e4 f#4]:8 [b2 f#3 a3 d4]:8' → [{ ms:[…], d:8 }] */
export function parseChords(str) {
  const out = [];
  const re = /\[([^\]]+)\](?::([\d.]+))?/g;
  let m;
  while ((m = re.exec(str))) out.push({ ms: m[1].trim().split(/\s+/).map(midi), d: m[2] ? Number(m[2]) : 4 });
  return out;
}

export const beatsOf = (notes) => notes.reduce((a, n) => a + n.d, 0);

// D 宫五声音阶（D E F# A B）。stepUp / stepDown：在音阶里走一步（倚音、上滑音用）
const PENTA = [2, 4, 6, 9, 11];
export function stepUp(m) {
  for (let k = m + 1; k < m + 13; k++) if (PENTA.includes(((k % 12) + 12) % 12)) return k;
  return m + 2;
}
export function stepDown(m) {
  for (let k = m - 1; k > m - 13; k--) if (PENTA.includes(((k % 12) + 12) % 12)) return k;
  return m - 2;
}

// ───────────── 小工具：滤波、淡入淡出、归一化（只在生成波表时用一次） ─────────────
export function biquad(x, sr, type, f0, Q = 0.707, gainDb = 0) {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (TAU * f0) / sr;
  const cs = Math.cos(w0);
  const al = Math.sin(w0) / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'peak') [b0, b1, b2, a0, a1, a2] = [1 + al * A, -2 * cs, 1 - al * A, 1 + al / A, -2 * cs, 1 - al / A];
  else if (type === 'lp') [b0, b1, b2, a0, a1, a2] = [(1 - cs) / 2, 1 - cs, (1 - cs) / 2, 1 + al, -2 * cs, 1 - al];
  else [b0, b1, b2, a0, a1, a2] = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + al, -2 * cs, 1 - al]; // hp
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}

export function fadeIn(x, sr, sec) {
  const n = Math.min(x.length, Math.max(1, Math.floor(sr * sec)));
  for (let i = 0; i < n; i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
}
export function fadeOut(x, sr, sec) {
  const n = Math.min(x.length, Math.max(1, Math.floor(sr * sec)));
  for (let i = 0; i < n; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
}
export function normalize(x, peak = 1) {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  if (p > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / p;
  return x;
}
function dcOut(x) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m += x[i];
  m /= x.length || 1;
  for (let i = 0; i < x.length; i++) x[i] -= m;
}

/** 很快的白噪声（xorshift32，内联；一次生成几十万个采样也只要几毫秒）。同一个 seed → 同一段噪声 */
function fastNoise(n, seed) {
  const out = new Float32Array(n);
  let x = (seed * 2654435761) >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = (x >>> 0) * 4.656612873077393e-10 - 1; // [-1, 1)
  }
  return out;
}

// ───────────── 噪声：可以无缝循环（尾巴和开头做等功率交叉淡化 → 循环点没有「咔」） ─────────────
/** 纯数据版（Worker 里也能算）：返回 [左, 右] 两个 Float32Array */
export function loopNoiseData(sr, seconds, kind = 'pink', seed = 3) {
  const len = Math.floor(sr * seconds);
  const fade = Math.floor(sr * 0.3);
  const out = [];
  for (let ch = 0; ch < 2; ch++) {
    const raw = fastNoise(len + fade, seed * 7 + ch * 131);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    if (kind === 'brown') {
      for (let i = 0; i < raw.length; i++) {
        last = (last + 0.02 * raw[i]) / 1.02;
        raw[i] = last * 3.5;
      }
    } else if (kind === 'white') {
      for (let i = 0; i < raw.length; i++) raw[i] *= 0.5;
    } else {
      // Paul Kellet 的粉红噪声
      for (let i = 0; i < raw.length; i++) {
        const w = raw[i];
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    dcOut(raw);
    const d = raw.slice(0, len);
    // d[len-1] 之后接 d[0]：开头 fade 个采样从「尾巴后面的自然延续」淡到原来的开头
    for (let i = 0; i < fade; i++) {
      const th = (Math.PI / 2) * (i / fade);
      d[i] = raw[len + i] * Math.cos(th) + raw[i] * Math.sin(th);
    }
    out.push(d);
  }
  return out;
}

/** 把 [左, 右] 装进一个 AudioBuffer */
export function toBuffer(ctx, chans, sr = ctx.sampleRate) {
  const buf = ctx.createBuffer(chans.length, chans[0].length, sr);
  chans.forEach((d, ch) => (buf.copyToChannel ? buf.copyToChannel(d, ch) : buf.getChannelData(ch).set(d)));
  return buf;
}

export function loopNoise(ctx, seconds, kind = 'pink', seed = 3) {
  return toBuffer(ctx, loopNoiseData(ctx.sampleRate, seconds, kind, seed));
}

// ───────────── 混响：生成的脉冲响应（像一座开着门的花园凉亭：柔和、偏暗、尾巴约 2.6 秒） ─────────────
/** 纯数据版（Worker 里也能算）：返回 [左, 右] */
export function reverbIRData(sr, { seconds = 3.4, t60 = 2.6, pre = 0.022, seed = 11 } = {}) {
  const len = Math.floor(sr * seconds);
  const preN = Math.floor(pre * sr);
  const k = Math.pow(10, -3 / (t60 * sr)); // 每个采样的衰减（乘法，不用每个采样算一次 pow）
  const out = [];
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(seed + ch * 977);
    const wn = fastNoise(len, seed * 31 + ch * 977);
    const d = new Float32Array(len);
    let lp = 0;
    let env = 1;
    const soft = Math.floor(0.006 * sr);
    for (let i = preN; i < len; i++) {
      const j = i - preN;
      const a = Math.min(0.9, 0.3 + 0.6 * (j / sr / seconds)); // 越往后越暗：高频先消失
      lp = a * lp + (1 - a) * wn[i];
      let x = lp * Math.sqrt((1 + a) / (1 - a)) * env;
      if (j < soft) x *= j / soft; // 湿声也要柔和地起
      d[i] = x;
      env *= k;
    }
    // 早期反射：几面柔软的「墙」
    for (let e = 0; e < 7; e++) {
      const ti = preN + Math.floor(r.range(0.007, 0.07) * sr);
      const amp = r.range(0.2, 0.5) * (1 - e / 9) * (r() < 0.5 ? -1 : 1);
      for (let j = 0; j < 48 && ti + j < len; j++) d[ti + j] += amp * Math.exp(-j / 10) * (r() * 2 - 1);
    }
    biquad(d, sr, 'hp', 140, 0.6); // 低频不进混响：不糊
    dcOut(d);
    fadeOut(d, sr, 0.25);
    out.push(d);
  }
  return out;
}

export function reverbIR(ctx, o = {}) {
  return toBuffer(ctx, reverbIRData(ctx.sampleRate, o));
}

// ───────────── 拨弦：Karplus-Strong（古筝） ─────────────
/**
 * 返回 { data, f0 }：f0 是这根「弦」真正的音高，播放时 playbackRate = 目标频率 / f0（再借 playbackRate 做按音、揉弦）。
 * bright 0–1：越大越亮、余音越长 · pos：拨弦点（靠近琴码 → 更「铮」）· soft 0–1：指肚（软）↔ 义甲（亮）· t60：余音长度。
 */
export function ksPluck(sr, f, seconds, { bright = 0.6, pos = 0.12, soft = 0.4, t60 = 3.2, seed = 5, twin = 0.35 } = {}) {
  const one = (freq, sd) => {
    const r = rng(sd);
    const n = Math.max(4, Math.floor(sr / freq));
    const S = 0.5 + 0.42 * bright; // 环路滤波 y = R(S·x[n] + (1−S)·x[n−1])，相位延迟 ≈ 1−S 个采样
    const f0 = sr / (n + (1 - S));
    const R = Math.pow(10, -3 / (f0 * t60));
    const len = Math.floor(sr * seconds);
    const out = new Float32Array(len);
    const line = new Float32Array(n);
    const exc = new Float32Array(n);
    let lp = 0;
    const a = 0.1 + 0.75 * soft;
    for (let i = 0; i < n; i++) {
      lp = a * lp + (1 - a) * (r() * 2 - 1);
      exc[i] = lp;
    }
    const pd = Math.max(1, Math.round(pos * n));
    for (let i = 0; i < n; i++) line[i] = exc[i] - 0.92 * exc[(i - pd + n) % n];
    dcOut(line);
    let idx = 0;
    let prev = line[n - 1];
    for (let i = 0; i < len; i++) {
      const x = line[idx];
      out[i] = x;
      line[idx] = R * (S * x + (1 - S) * prev);
      prev = x;
      if (++idx === n) idx = 0;
    }
    return { out, f0 };
  };
  const main = one(f, seed);
  const data = main.out;
  if (twin > 0) {
    // 第二个很弱、略高几音分的「弦」：像琴码左边那一段弦的共鸣，声音更活
    const second = one(f * 1.0016, seed + 17).out;
    for (let i = 0; i < data.length; i++) data[i] += twin * second[i];
  }
  // 琴身共鸣（桐木面板的几个低频模态）+ 去掉刺耳的高频
  biquad(data, sr, 'peak', 230, 1.1, 4);
  biquad(data, sr, 'peak', 650, 1.5, 2.5);
  biquad(data, sr, 'peak', 1750, 2, 1.2);
  biquad(data, sr, 'lp', 6200, 0.7);
  biquad(data, sr, 'lp', 7400, 0.6); // 第二级：最上面一个八度再收一点，起音「圆」而不「刺」
  biquad(data, sr, 'hp', 55, 0.7);
  dcOut(data);
  fadeIn(data, sr, 0.0025); // 2.5 毫秒的起音：仍然是「拨」，但没有咔哒
  fadeOut(data, sr, 0.12);
  normalize(data, 1);
  return { data, f0: main.f0 };
}

// ───────────── 模态合成：手碟、卡林巴、古筝泛音 ─────────────
/**
 * 几组指数衰减的正弦（递推振荡器，便宜），每组可以分成两个很近的频率 → 慢慢的拍频（「活」的金属感）。
 * partials: [[倍数, 振幅, t60 秒, 拍频 Hz]] · attack：敲击的软硬（毫秒）· thump：手掌 / 木槌接触的那一下。
 */
export function modal(sr, f, seconds, partials, { attack = 4, thump = 0.12, seed = 9, maxHz = 8000 } = {}) {
  const r = rng(seed);
  const len = Math.floor(sr * seconds);
  const out = new Float32Array(len);
  for (const [ratio, amp, t60, beat = 0] of partials) {
    const fr = f * ratio;
    if (fr > maxHz || fr > sr * 0.45) continue;
    const k = Math.pow(10, -3 / (t60 * sr));
    const parts = beat ? [[-beat / 2, 0.5], [beat / 2, 0.5]] : [[0, 1]];
    for (const [df, w] of parts) {
      const om = (TAU * (fr + df)) / sr;
      const c = 2 * Math.cos(om);
      const ph = r() * TAU;
      let y1 = Math.sin(ph - om);
      let y2 = Math.sin(ph - 2 * om);
      let e = amp * w;
      const n = Math.min(len, Math.ceil(t60 * 1.4 * sr));
      for (let i = 0; i < n; i++) {
        const y = c * y1 - y2;
        y2 = y1;
        y1 = y;
        out[i] += y * e;
        e *= k;
      }
    }
  }
  if (thump > 0) {
    let lp = 0;
    const tn = Math.floor(sr * 0.014);
    for (let i = 0; i < tn; i++) {
      lp = 0.86 * lp + 0.14 * (r() * 2 - 1);
      out[i] += lp * thump * 3 * (1 - i / tn);
    }
  }
  dcOut(out);
  fadeIn(out, sr, attack / 1000);
  fadeOut(out, sr, 0.1);
  normalize(out, 1);
  return out;
}
