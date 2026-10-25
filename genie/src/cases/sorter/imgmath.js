// 一张照片（已经缩到长边 ≈ 512 px 的 RGBA 像素）→ 指纹、清晰度、曝光、主色、「不像案例」的信号。
// 纯数学，没有 DOM：worker 里跑，Node 测试也直接跑。不 import 任何界面文件。

import { rgbToLab, kmeansLab } from './color.js';

export const ANALYSIS_V = 1;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** RGBA → 亮度（0–255，Rec.709） */
export function toGray(rgba, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2];
  return g;
}

/** 面积平均缩小（W×H） */
export function resizeArea(src, w, h, W, H) {
  const out = new Float32Array(W * H);
  const sx = w / W;
  const sy = h / H;
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += src[yy * w + xx];
      out[y * W + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

const hex8 = (n) => (n >>> 0).toString(16).padStart(8, '0');

/** 差值指纹（dHash）：横向 64 位 + 纵向 64 位 → 32 个十六进制字。近似重复的照片只差几位 */
export function dhash(gray, w, h) {
  const a = resizeArea(gray, w, h, 9, 8);
  const b = resizeArea(gray, w, h, 8, 9);
  const words = [0, 0, 0, 0];
  let bit = 0;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++, bit++) if (a[y * 9 + x] < a[y * 9 + x + 1]) words[bit >> 5] |= 1 << (bit & 31);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++, bit++) if (b[y * 8 + x] < b[(y + 1) * 8 + x]) words[bit >> 5] |= 1 << (bit & 31);
  return words.map(hex8).join('');
}

/** 指纹 → 4 个 32 位整数（比较前先转一次） */
export function hashWords(hex) {
  const out = new Uint32Array(4);
  for (let i = 0; i < 4; i++) out[i] = parseInt(String(hex).slice(i * 8, i * 8 + 8), 16) >>> 0;
  return out;
}
const pop = (x) => {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};
/** 两个指纹差几位（0–128）。参数是 hashWords() 的结果或十六进制字符串 */
export function hamming(a, b) {
  const A = typeof a === 'string' ? hashWords(a) : a;
  const B = typeof b === 'string' ? hashWords(b) : b;
  let d = 0;
  for (let i = 0; i < 4; i++) d += pop((A[i] ^ B[i]) >>> 0);
  return d;
}

/** 清晰度：拉普拉斯的方差（越大越清楚；糊的照片很小） */
export function lapVar(gray, w, h) {
  let s = 0;
  let s2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i];
      s += v;
      s2 += v * v;
      n++;
    }
  }
  if (!n) return 0;
  const m = s / n;
  return s2 / n - m * m;
}

/** 曝光：平均亮度、5% / 95% 分位、过曝 / 死黑的比例 */
export function exposure(gray) {
  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i] | 0;
    hist[v > 255 ? 255 : v]++;
    sum += gray[i];
  }
  const n = gray.length || 1;
  const pct = (p) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= p * n) return v;
    }
    return 255;
  };
  let hi = 0;
  let lo = 0;
  for (let v = 250; v < 256; v++) hi += hist[v];
  for (let v = 0; v < 6; v++) lo += hist[v];
  return { mean: Math.round(sum / n), p05: pct(0.05), p95: pct(0.95), clipHi: Math.round((hi / n) * 1000) / 1000, clipLo: Math.round((lo / n) * 1000) / 1000 };
}

/** 一条横带（行 y0..y1）有多「平」：和这条带的中位数差 ±6 以内的像素比例 */
function bandFlat(gray, w, y0, y1) {
  const vals = [];
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x += 2) vals.push(gray[y * w + x]);
  if (!vals.length) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1];
  let k = 0;
  for (const v of vals) if (Math.abs(v - med) <= 6) k++;
  return k / vals.length;
}

// 常见手机 / 平板截图的像素尺寸（竖）
const SHOT_DIMS = new Set(['1170x2532', '1179x2556', '1284x2778', '1290x2796', '1125x2436', '1242x2688', '828x1792', '750x1334', '1080x1920', '1080x2340', '1080x2400', '1080x2412', '1440x3200', '1440x3088', '1080x2160', '1440x2960', '1440x3120', '1220x2712', '1260x2800', '1200x2640', '2048x2732', '1668x2388', '1640x2360', '1620x2160', '1536x2048']);

/**
 * 「不像案例照片」的信号。返回 { shot, doc, site }（0–1）。
 * meta：{ w, h, type, make, view（文件夹 / 文件名提示：'shot'|'doc'|'site'|'plan'|…） }
 */
export function nonCaseSignals(gray, rgba, w, h, meta = {}, stats = {}) {
  const W = meta.w || w;
  const H = meta.h || h;
  const tall = H / W;
  const camera = !!(meta.make && meta.make.trim());
  // 截图：竖长 + 上下两条「平」的状态栏 / 导航栏 + 没有相机资料
  const top = bandFlat(gray, w, 0, Math.max(2, Math.round(h * 0.035)));
  const bottom = bandFlat(gray, w, Math.round(h * 0.94), h);
  const bars = top > 0.92 && bottom > 0.88;
  let shot = 0;
  if (meta.view === 'shot') shot = 1;
  else if (!camera && bars) {
    // 一定要上下两条都「平」：竖的效果图（天花板是平的，但地上有东西）不会被当成截图
    if (tall >= 1.75 || SHOT_DIMS.has(`${Math.min(W, H)}x${Math.max(W, H)}`)) shot = 0.85 + (meta.type === 'png' ? 0.1 : 0);
  }
  // 文件 / 单据：大片白纸 + 细细的黑字 + 几乎没颜色
  const { white = 0, ink = 0, chroma = 0, edges = 0 } = stats;
  let doc = 0;
  if (meta.view === 'doc') doc = 1;
  else if (white > 0.45 && ink > 0.008 && ink < 0.3 && chroma < 7 && edges > 0.035) doc = clamp01(0.55 + (white - 0.45) + edges * 2);
  // 工地：灰灰的、到处是碎纹理、没有大片干净的墙面（只在很明显时才算；文件夹叫「工地 / 施工 / 进度」最准）
  let site = 0;
  if (meta.view === 'site') site = 1;
  else if (chroma < 6 && stats.busy > 0.5 && white < 0.08) site = 0.75;
  return { shot: Math.round(shot * 100) / 100, doc: Math.round(doc * 100) / 100, site: Math.round(site * 100) / 100 };
}

/** 颜色 / 白纸 / 墨 / 碎纹理的统计（给上面的判断用） */
export function pixelStats(rgba, gray, w, h) {
  let white = 0;
  let ink = 0;
  let csum = 0;
  let edges = 0;
  let busy = 0;
  let n = 0;
  const step = 2;
  for (let y = 1; y < h - 1; y += step) {
    for (let x = 1; x < w - 1; x += step) {
      const i = y * w + x;
      const j = i * 4;
      const r = rgba[j];
      const g = rgba[j + 1];
      const b = rgba[j + 2];
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const c = mx - mn;
      csum += c;
      const L = gray[i];
      if (L > 205 && c < 24) white++;
      if (L < 80) ink++;
      const gx = Math.abs(gray[i + 1] - gray[i - 1]);
      const gy = Math.abs(gray[i + w] - gray[i - w]);
      if (gx > 40 || gy > 40) edges++;
      if (gx + gy > 18) busy++;
      n++;
    }
  }
  n = n || 1;
  return { white: white / n, ink: ink / n, chroma: csum / n / 2.55 / 2, edges: edges / n, busy: busy / n };
}

/** 主色：长边 ≈ 96 px 的样本上做 Lab k-means（k = 3） */
export function mainColours(rgba, w, h, k = 3) {
  const step = Math.max(1, Math.round(Math.max(w, h) / 96));
  const px = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const j = (y * w + x) * 4;
      const lab = rgbToLab(rgba[j], rgba[j + 1], rgba[j + 2]);
      px.push(lab[0], lab[1], lab[2]);
    }
  }
  return kmeansLab(Float32Array.from(px), k);
}

/**
 * 一张照片的全部分析。img：{ data (RGBA), width, height }（已经转正，长边 ≈ 512）；meta：exif.readMeta + { view, name }。
 * → { v, w, h, hash, sharp, expo, stats, colours, signals, flags, q }
 */
export function analysePixels(img, meta = {}) {
  const { data, width: w, height: h } = img;
  const gray = toGray(data, w, h);
  const W = meta.w || w;
  const H = meta.h || h;
  const sharp = Math.round(lapVar(gray, w, h) * 10) / 10;
  const expo = exposure(gray);
  const stats = pixelStats(data, gray, w, h);
  const signals = nonCaseSignals(gray, data, w, h, meta, stats);
  const colours = mainColours(data, w, h, 3);
  const flags = flagsOf({ w: W, h: H, sharp, expo, signals });
  return {
    v: ANALYSIS_V,
    w: W,
    h: H,
    hash: dhash(gray, w, h),
    sharp,
    expo,
    stats: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
    colours,
    signals,
    flags,
    q: qualityOf({ w: W, h: H, sharp, expo, stats }),
  };
}

// 阈值（在合成照片 + 老板给的两组真实照片上校准过；test/sorter.test.mjs 守着）
export const LIMITS = { blur: 28, soft: 90, dark: 52, darkP95: 140, bright: 0.45, small: 800, lowres: 1200 };

/** 直接不要的理由（之后还能在「被藏起来的」里找回来） */
export function flagsOf({ w, h, sharp, expo, signals }) {
  const f = [];
  const long = Math.max(w || 0, h || 0);
  if (signals?.shot >= 0.75) f.push('shot');
  if (signals?.doc >= 0.7) f.push('doc');
  if (signals?.site >= 0.7) f.push('site');
  if (long && long < LIMITS.small) f.push('small');
  if (sharp < LIMITS.blur) f.push('blur');
  if (expo && expo.mean < LIMITS.dark && expo.p95 < LIMITS.darkP95) f.push('dark');
  if (expo && expo.clipHi > LIMITS.bright) f.push('bright');
  return f;
}

/** 照片本身的好坏（0–1）：清晰 45 % · 曝光 30 % · 分辨率 15 % · 色彩 10 % */
export function qualityOf({ w, h, sharp, expo, stats }) {
  const sA = clamp01((Math.log10(Math.max(1, sharp)) - 1.45) / 1.3);
  const off = Math.abs((expo?.mean ?? 128) - 128) / 128;
  const eA = clamp01(1 - off * 0.9 - (expo?.clipHi || 0) * 1.4 - Math.max(0, (expo?.clipLo || 0) - 0.02) * 1.2);
  const long = Math.max(w || 0, h || 0);
  const rA = clamp01((long - LIMITS.small) / (2400 - LIMITS.small));
  const cA = clamp01((stats?.chroma ?? 10) / 18);
  return Math.round((0.45 * sA + 0.3 * eA + 0.15 * rA + 0.1 * cA) * 1000) / 1000;
}
