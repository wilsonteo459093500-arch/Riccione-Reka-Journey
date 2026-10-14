// 墙优先：直接从平面图的裁图里找墙、门洞、窗、房间面（纯函数，不碰 DOM —— Node 里也能跑，测试用）。
//
// extractWalls(img, { pxPerM?, hints? }) → { walls, gaps, faces, stairs, quality, pxPerM, ms }（坐标 = 裁图像素）
//   img = ImageData 一样的 { width, height, data }（RGBA / RGB / 灰度都行）
//   walls: [{ x1, y1, x2, y2, t, ext, style }] —— 横平竖直的墙中线（门洞 / 窗也算在墙里），t = 墙厚（像素）
//   gaps:  [{ wall, a, b, kind: 'door'|'opening'|'window'|'slider', arc, x1, y1, x2, y2 }] —— 墙上的开口（a / b = 沿墙方向的坐标）
//   faces: [{ rects: [{ x, y, w, h }], area, centroid: { x, y }, stairs? }] —— 墙围起来的空间（门洞都当关上），拆成矩形（墙中线上）
//   quality: { score 0–1, wallPx, coverage, reasons[] }
// wallsToPlan(result, mPerPx, labels?) → 米制的墙 / 开口 / 房间（见下面）。
//
// 三种画墙的方法都认：实心涂黑、斜线填充、两条细线（空心砖墙）。文字、尺寸线、轴线、家具、洁具、地砖、楼梯踏步都是细线 —— 不当墙。
// 思路：每一列（找横墙）/ 每一行（找竖墙）上看墨迹：一段 100–300 mm 厚的「带」（一整段黑，或者几条细线挤在一起）= 墙的横截面；
// 一列一列接起来、厚度和位置都对得上 = 一段墙。地砖 / 踏步 / 斜线填充是等间距的一串细线 —— 先认出来扔掉（踏步顺便报成楼梯）。

import { ROOM_TYPES } from './model.js';

export const WALL_T = { min: 0.065, max: 0.27, thick: 0.45 }; // 墙厚（m）：100–230 mm 的砖墙 + 余量；0.27–0.45 m（分户墙）只认长的两条线 / 实心、而且要能把外墙封上
export const DOOR_W = { min: 0.5, max: 1.35, double: 2.1 }; // 门洞宽（m）
export const OPENING_MAX = 3.2; // 两段同一条线上的墙之间，空着不超过这么宽 = 一个开口（打通 / 拱门）
export const GLAZING_MAX = 7; // 中间有平行细线（推拉门 / 落地窗）时可以这么宽
const WORK_PXM = 75; // 工作分辨率（每米像素）：100 mm 的墙 ≈ 7.5 像素

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ───────────── 小工具：会长大的 Int32 数组 ─────────────
class Buf {
  constructor(n = 1024) {
    this.a = new Int32Array(n);
    this.n = 0;
  }
  push(v) {
    if (this.n >= this.a.length) {
      const b = new Int32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[this.n++] = v;
  }
}

function median(arr) {
  if (!arr.length) return 0;
  const s = Float64Array.from(arr).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ───────────── 1. 灰度 → 二值（Otsu，按纸色归一）→ 缩小（任何一个墨点 = 墨） ─────────────

/** 一行的灰度（RGBA / RGB / 灰度 / 灰度+透明；透明 = 白纸）写进 out */
function lumRow(data, ch, W, y, out) {
  let j = y * W * ch;
  if (ch === 4) {
    for (let x = 0; x < W; x++, j += 4) {
      const l = (data[j] * 77 + data[j + 1] * 151 + data[j + 2] * 28) >> 8;
      const a = data[j + 3];
      out[x] = a === 255 ? l : 255 - (((255 - l) * a) >> 8);
    }
  } else if (ch === 3) {
    for (let x = 0; x < W; x++, j += 3) out[x] = (data[j] * 77 + data[j + 1] * 151 + data[j + 2] * 28) >> 8;
  } else if (ch === 2) {
    for (let x = 0; x < W; x++, j += 2) out[x] = 255 - (((255 - data[j]) * data[j + 1]) >> 8);
  } else for (let x = 0; x < W; x++) out[x] = data[j + x];
}

/** 阈值：先按块取纸色（块内最亮），再在「灰度 / 纸色」上做 Otsu。返回 { thr (0–255，对纸色 255 而言), bg, bw, bh, B, lum } */
export function inkThreshold(img) {
  const { width: W, height: H, data } = img;
  const ch = Math.max(1, Math.round(data.length / (W * H)));
  const B = Math.max(32, Math.round(Math.min(W, H) / 24));
  const bw = Math.ceil(W / B);
  const bh = Math.ceil(H / B);
  const bmax = new Uint8Array(bw * bh);
  const bx = new Int32Array(W);
  for (let x = 0; x < W; x++) bx[x] = (x / B) | 0;
  // 抽样的灰度（每隔几个像素算一个，不算整行）
  const lumAt = (y, x) => {
    if (ch === 4) {
      const j = (y * W + x) * 4;
      const l = (data[j] * 77 + data[j + 1] * 151 + data[j + 2] * 28) >> 8;
      return data[j + 3] === 255 ? l : 255 - (((255 - l) * data[j + 3]) >> 8);
    }
    if (ch === 3) {
      const j = (y * W + x) * 3;
      return (data[j] * 77 + data[j + 1] * 151 + data[j + 2] * 28) >> 8;
    }
    if (ch === 2) return 255 - (((255 - data[(y * W + x) * 2]) * data[(y * W + x) * 2 + 1]) >> 8);
    return data[y * W + x];
  };
  const st = Math.max(2, Math.round(B / 16));
  for (let y = 0; y < H; y += st) {
    const r = ((y / B) | 0) * bw;
    for (let x = (y / st) % 2 | 0; x < W; x += st) {
      const k = r + bx[x];
      const l = lumAt(y, x);
      if (l > bmax[k]) bmax[k] = l;
    }
  }
  // 纸色 = 3×3 块里最亮的（一块全在粗墙里也不会变黑）
  const bg = new Uint8Array(bw * bh);
  let bgSum = 0;
  for (let j = 0; j < bh; j++)
    for (let i = 0; i < bw; i++) {
      let m = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii >= 0 && jj >= 0 && ii < bw && jj < bh && bmax[jj * bw + ii] > m) m = bmax[jj * bw + ii];
        }
      bg[j * bw + i] = Math.max(96, m);
      bgSum += bg[j * bw + i];
    }
  // 直方图（抽样）：v = lum / 纸色
  const hist = new Float64Array(256);
  let tot = 0;
  const hs = Math.max(2, Math.round(Math.sqrt((W * H) / 4e5)));
  for (let y = 1; y < H; y += hs) {
    const r = ((y / B) | 0) * bw;
    for (let x = 1 + ((y / hs) % 2 | 0); x < W; x += hs) {
      const v = Math.min(255, ((lumAt(y, x) * 255) / bg[r + bx[x]]) | 0);
      hist[v]++;
      tot++;
    }
  }
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0;
  let wB = 0;
  let best = 0;
  let thr = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = tot - wB;
    if (!wF) break;
    sB += i * hist[i];
    const mB = sB / wB;
    const mF = (sum - sB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) {
      best = v;
      thr = i;
    }
  }
  const lum = (i) => {
    if (ch === 1) return data[i];
    if (ch === 2) return 255 - (((255 - data[i * 2]) * data[i * 2 + 1]) >> 8);
    const j = i * ch;
    const l = (data[j] * 77 + data[j + 1] * 151 + data[j + 2] * 28) >> 8;
    return ch === 4 && data[j + 3] < 255 ? 255 - (((255 - l) * data[j + 3]) >> 8) : l;
  };
  // 墨的「最黑」：阈值以下（墨）里 5 % 分位（复印件 / 照片的黑是灰的）
  const thrC = clamp(thr + 1, 70, 215);
  let inkN = 0;
  for (let i = 0; i < thrC; i++) inkN += hist[i];
  let black = 0;
  for (let i = 0, c = 0; i < thrC; i++) {
    c += hist[i];
    if (c >= 0.05 * inkN) {
      black = i;
      break;
    }
  }
  return { thr: thrC, bg, bw, bh, B, ch, lum, bgMean: bgSum / (bw * bh), black: Math.min(black, thrC - 40) };
}

/**
 * 原图 → 工作分辨率（缩小 s ≤ 1 倍，可以不是整数分之一）上的「墨的深浅」D（0 = 纸，255 = 最黑的墨；按块的纸色、全图的「黑」归一）。
 * 原图像素 (x, y) 落在工作像素 (⌊x·s⌋, ⌊y·s⌋)。返回 { A: 块内平均（细线的墨量不随分辨率变 —— 量笔画粗细用）, M: 块内最深,
 * w, h, f = 1 / s（工作像素 → 原图像素）, dThr: M ≥ 它 = 墨（和 binarize 的 Otsu 阈值一样） }
 */
export function darkness(img, s = 1, T = inkThreshold(img)) {
  const { width: W, height: H, data } = img;
  s = Math.min(1, s);
  const w = Math.floor((W - 1) * s) + 1;
  const h = Math.floor((H - 1) * s) + 1;
  const { bg, bw, B, ch, black } = T;
  const den = Math.max(40, 255 - black);
  // D = (纸色 − 灰度) / 纸色 × 255 × 255 / den，按块预先算好倍数（定点 16 位）
  const R = new Int32Array(bg.length);
  for (let k = 0; k < bg.length; k++) R[k] = Math.round((255 * 255 * 65536) / (Math.max(16, bg[k]) * den));
  // 两份缩小的图：
  //   A  —— 每个原图像素整个算给最近的工作像素（f 不是整数时有的工作像素收 1 行、有的收 2 行 —— 线条更利，二值化 / 墙带用它）；
  //   Aw —— 按面积分（工作像素 i 盖住原图 [i·f, (i+1)·f)，跨两格的原图像素按比例分）：同一条线缩出来的「墨量」和它落在哪无关，
  //         量笔宽用它（不然墨量随位置差 ±25 %，粗笔 / 细笔的分界跟着比例抖：同一张图比例差 8 % 墙线就掉成细笔）
  const f = 1 / s;
  const xm = new Int32Array(W);
  const xw = new Int32Array(W); // 分给 xm 的比例（/ 256），其余给 xm + 1
  const bx = new Int32Array(W);
  const cx = new Uint16Array(w);
  const cy = new Uint16Array(h);
  const ax = new Float64Array(w + 1);
  const ay = new Float64Array(h + 1);
  for (let x = 0; x < W; x++) {
    const i = Math.min(w - 1, Math.floor(x * s));
    xm[x] = i;
    xw[x] = i === w - 1 ? 256 : Math.round(256 * clamp((i + 1) * f - x, 0, 1));
    bx[x] = (x / B) | 0;
    cx[i]++;
    ax[i] += xw[x];
    ax[i + 1] += 256 - xw[x];
  }
  const sum = new Uint32Array(w * h);
  const sumW = new Uint32Array(w * (h + 1)); // 定点：d × 256 × 256（f ≤ 15 不会溢出）
  const acc = new Int32Array(w + 1);
  const M = new Uint8Array(w * h);
  const row = new Uint8Array(W);
  for (let y = 0; y < H; y++) {
    lumRow(data, ch, W, y, row);
    const yw = Math.min(h - 1, Math.floor(y * s));
    const vy = yw === h - 1 ? 256 : Math.round(256 * clamp((yw + 1) * f - y, 0, 1));
    cy[yw]++;
    ay[yw] += vy;
    ay[yw + 1] += 256 - vy;
    const brow = ((y / B) | 0) * bw;
    const orow = yw * w;
    let x0 = W;
    let x1 = -1;
    for (let x = 0; x < W; x++) {
      const k = brow + bx[x];
      let d = ((bg[k] - row[x]) * R[k]) >> 16;
      if (d <= 0) continue;
      if (d > 255) d = 255;
      const i = xm[x];
      const o = orow + i;
      sum[o] += d;
      if (d > M[o]) M[o] = d;
      const a = d * xw[x];
      acc[i] += a;
      acc[i + 1] += (d << 8) - a;
      if (i < x0) x0 = i;
      x1 = i;
    }
    if (x1 < 0) continue;
    const o1 = orow + w;
    for (let i = x0; i <= x1 + 1 && i < w; i++) {
      const a = acc[i];
      if (!a) continue;
      sumW[orow + i] += a * vy;
      if (vy < 256) sumW[o1 + i] += a * (256 - vy);
      acc[i] = 0;
    }
    acc[w] = 0;
  }
  const A = new Uint8Array(w * h);
  const Aw = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) {
      const n = cx[x] * cy[y];
      if (n) A[r + x] = Math.min(255, (sum[r + x] / n + 0.5) | 0);
      const nw = ax[x] * ay[y];
      if (nw > 0 && sumW[r + x] > 0) Aw[r + x] = Math.min(255, (sumW[r + x] / nw + 0.5) | 0);
    }
  }
  // Otsu 阈值（灰度 / 纸色 < thr / 255）换成 D：D > (255 − thr) · 255 / den
  const dThr = clamp(Math.floor(((255 - T.thr) * 255) / den) + 1, 8, 250);
  return { A, Aw, M, w, h, f: 1 / s, s, dThr };
}

/**
 * 笔画粗细（工作像素，¼ 像素一格）：每个墨点横、竖两个方向所在墨段的「墨量」（深浅加起来 = 笔宽），取小的那个方向。
 * 墨量在缩小（取平均）时不变 → 和分辨率无关。CAD 图里墙线用粗笔（0.3–0.5 mm ≈ 0.03–0.05 m），家具 / 洁具 / 地砖 / 尺寸线 /
 * 轴线 / 栏杆 / 排水沟用细笔（≈ 0.01 m）。返回 { sw: Uint16Array（¼ px）, mx: 横穿笔画那一段里最深的一点, hist: 长线（任一方向墨段
 * ≥ Lmin）上的点按 sw 的直方图（¼ px 一格，最后一格 = 更粗） }
 * Am（默认 = A）：最近邻缩小的图，更利 —— 墨段（哪几个像素是一笔）和「最深的一点」按它定（按面积分会把挨着的几条细线糊成一段、
 * 把粗线的峰削掉一截）；墨量按 A（按面积缩小，和线落在哪无关）在这一段 ± 1 像素里加。
 */
function strokeWidths(A, w, h, soft, Lmin, Am = A) {
  const sw = new Uint16Array(w * h);
  const mx = new Uint8Array(w * h);
  const longH = new Uint8Array(w * h);
  const CAP = 160;
  const hist = new Float64Array(CAP + 1);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    let x = 0;
    while (x < w) {
      if (Am[r + x] < soft) {
        x++;
        continue;
      }
      const s0 = x;
      let sum = s0 > 0 ? A[r + s0 - 1] : 0;
      let m = 0;
      while (x < w && Am[r + x] >= soft) {
        sum += A[r + x];
        if (Am[r + x] > m) m = Am[r + x];
        x++;
      }
      if (x < w) sum += A[r + x];
      const pw = Math.min(65535, Math.round((sum * 4) / 255));
      const lg = x - s0 >= Lmin ? 1 : 0;
      for (let k = r + s0; k < r + x; k++) {
        sw[k] = pw;
        mx[k] = m;
        longH[k] = lg;
      }
    }
  }
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (Am[y * w + x] < soft) {
        y++;
        continue;
      }
      const s0 = y;
      let sum = s0 > 0 ? A[(s0 - 1) * w + x] : 0;
      let m = 0;
      while (y < h && Am[y * w + x] >= soft) {
        const k = y++ * w + x;
        sum += A[k];
        if (Am[k] > m) m = Am[k];
      }
      if (y < h) sum += A[y * w + x];
      const pw = Math.min(65535, Math.round((sum * 4) / 255));
      const lg = y - s0 >= Lmin;
      for (let k = s0 * w + x, e = y * w + x; k < e; k += w) {
        let v = sw[k];
        if (pw < v) {
          v = pw;
          sw[k] = pw;
          mx[k] = m;
        }
        if (lg || longH[k]) hist[v < CAP ? v : CAP]++;
      }
    }
  }
  return { sw, mx, hist };
}

/**
 * 粗笔 / 细笔分不分得开：长线的笔宽直方图里，细笔的峰（≤ 0.016 m）和右边一个「隔着深谷」的峰（墙线 0.025–0.05 m，实心墙 = 墙厚）。
 * 返回 { tau（¼ px，≥ 它 = 粗笔）, ok, heavy: 粗笔宽（px）, thin: 细笔宽（px）, heavyFrac, valley, ratio }
 */
function penSplit(hist, pm) {
  const CAP = hist.length - 1;
  const q = (m) => Math.round(m * pm * 4); // 米 → ¼ px
  let tot = 0;
  for (let b = 1; b <= CAP; b++) tot += hist[b];
  const sm = (b) => (b <= 0 || b >= CAP ? hist[b] || 0 : (hist[b - 1] + 2 * hist[b] + hist[b + 1]) / 4);
  let tpk = 1;
  for (let b = 1; b <= Math.max(2, q(0.016)); b++) if (hist[b] > hist[tpk]) tpk = b;
  let best = null;
  const lo = Math.max(tpk + 2, q(0.019), Math.ceil(tpk * 1.6));
  const hi = Math.min(CAP - 1, Math.max(lo, q(0.3)));
  let vmin = Infinity;
  let vpos = tpk;
  for (let b = tpk + 1; b <= hi; b++) {
    if (hist[b] < vmin) {
      vmin = hist[b];
      vpos = b;
    }
    if (b < lo) continue;
    if (!(sm(b) >= sm(b - 1) && sm(b) >= sm(b + 1)) || hist[b] <= 0) continue;
    const valley = vmin / hist[b];
    if (valley <= 0.35 && (!best || hist[b] > best.v)) best = { b, v: hist[b], valley, tau: vpos };
  }
  if (!best) return { tau: q(0.022), ok: false, heavy: 0, thin: tpk / 4, heavyFrac: 0, valley: 1, ratio: 1 };
  // 谷底：两个峰之间（平滑后）最低的地方；差不多一样低的几格里取最靠近两峰几何中点的（比例差 ±10 % 时 τ 不会贴着粗笔的峰）
  let vm = Infinity;
  for (let b = tpk + 1; b < best.b; b++) vm = Math.min(vm, sm(b));
  const mid = Math.sqrt(tpk * best.b);
  let tau = tpk + 1;
  let bd = Infinity;
  for (let b = tpk + 1; b < best.b; b++)
    if (sm(b) <= vm + Math.max(0.25 * vm, 0.01 * best.v) && Math.abs(b - mid) < bd) {
      bd = Math.abs(b - mid);
      tau = b;
    }
  let heavy = 0;
  for (let b = tau; b <= CAP; b++) heavy += hist[b];
  const hf = tot ? heavy / tot : 0;
  const ok = tot > 200 && hf >= 0.12 && 1 - hf >= 0.1 && tau <= q(0.03);
  return { tau, ok, heavy: best.b / 4, thin: tpk / 4, heavyFrac: +hf.toFixed(3), valley: +best.valley.toFixed(3), ratio: +(best.b / tpk).toFixed(2), tot };
}

/** 二值（M ≥ dThr = 块里有墨）→ { m, w, h, f, ink } */
function binFrom(D) {
  const m = new Uint8Array(D.w * D.h);
  let ink = 0;
  const { M, dThr } = D;
  for (let k = 0; k < m.length; k++)
    if (M[k] >= dThr) {
      m[k] = 1;
      ink++;
    }
  return { m, w: D.w, h: D.h, f: D.f, ink };
}

/** 二值化并缩小 f 倍（块里任何一个墨点 → 墨）。返回 { m: Uint8Array(w*h)（1 = 墨）, w, h, f, ink } */
export function binarize(img, f = 1, T = inkThreshold(img)) {
  const { width: W, height: H, data } = img;
  const w = Math.ceil(W / f);
  const h = Math.ceil(H / f);
  const m = new Uint8Array(w * h);
  const { thr, bg, bw, B, ch } = T;
  // 每块的阈值（灰度 < 它 = 墨）
  const tb = new Uint16Array(bg.length);
  for (let k = 0; k < bg.length; k++) tb[k] = Math.ceil((thr * bg[k]) / 255);
  const row = new Uint8Array(W);
  const xf = new Int32Array(W);
  const bx = new Int32Array(W);
  for (let x = 0; x < W; x++) {
    xf[x] = (x / f) | 0;
    bx[x] = (x / B) | 0;
  }
  for (let y = 0; y < H; y++) {
    lumRow(data, ch, W, y, row);
    const brow = ((y / B) | 0) * bw;
    const orow = ((y / f) | 0) * w;
    for (let x = 0; x < W; x++) if (row[x] < tb[brow + bx[x]]) m[orow + xf[x]] = 1;
  }
  let ink = 0;
  for (let k = 0; k < m.length; k++) ink += m[k];
  return { m, w, h, f, ink };
}

/** 二值图再缩小 k 倍（k×k 块里有墨 → 墨） */
function poolMask(B, k) {
  const w = Math.ceil(B.w / k);
  const h = Math.ceil(B.h / k);
  const m = new Uint8Array(w * h);
  for (let y = 0; y < B.h; y++) {
    const r = y * B.w;
    const o = ((y / k) | 0) * w;
    for (let x = 0; x < B.w; x++) if (B.m[r + x]) m[o + ((x / k) | 0)] = 1;
  }
  let ink = 0;
  for (let i = 0; i < m.length; i++) ink += m[i];
  return { m, w, h, f: B.f * k, ink };
}

function transpose(m, w, h) {
  const t = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) if (m[r + x]) t[x * h + y] = 1;
  }
  return t;
}

// ───────────── 2. 连通域（按行程）：去掉小的（字、数字、小符号） ─────────────

/** 去掉外框最长边 < minSide 的连通块（8 连通）。就地改 m。返回去掉的块数。 */
export function dropSmall(m, w, h, minSide) {
  const rs = new Buf(4096);
  const re = new Buf(4096);
  const rowAt = new Int32Array(h + 1);
  for (let y = 0; y < h; y++) {
    rowAt[y] = rs.n;
    const r = y * w;
    let x = 0;
    while (x < w) {
      if (!m[r + x]) {
        x++;
        continue;
      }
      const s = x;
      while (x < w && m[r + x]) x++;
      rs.push(s);
      re.push(x);
    }
  }
  rowAt[h] = rs.n;
  const n = rs.n;
  const par = new Int32Array(n);
  for (let i = 0; i < n; i++) par[i] = i;
  const find = (i) => {
    while (par[i] !== i) {
      par[i] = par[par[i]];
      i = par[i];
    }
    return i;
  };
  const S = rs.a;
  const E = re.a;
  for (let y = 1; y < h; y++) {
    let i = rowAt[y - 1];
    let j = rowAt[y];
    const i1 = rowAt[y];
    const j1 = rowAt[y + 1];
    while (i < i1 && j < j1) {
      if (S[i] <= E[j] && S[j] <= E[i]) {
        const a = find(i);
        const b = find(j);
        if (a !== b) par[a < b ? b : a] = a < b ? a : b;
      }
      if (E[i] < E[j]) i++;
      else j++;
    }
  }
  const x0 = new Int32Array(n).fill(1 << 30);
  const x1 = new Int32Array(n).fill(-1);
  const y0 = new Int32Array(n).fill(1 << 30);
  const y1 = new Int32Array(n).fill(-1);
  const rowOf = new Int32Array(n);
  for (let y = 0; y < h; y++) for (let k = rowAt[y]; k < rowAt[y + 1]; k++) rowOf[k] = y;
  for (let k = 0; k < n; k++) {
    const r = find(k);
    if (S[k] < x0[r]) x0[r] = S[k];
    if (E[k] > x1[r]) x1[r] = E[k];
    if (rowOf[k] < y0[r]) y0[r] = rowOf[k];
    if (rowOf[k] + 1 > y1[r]) y1[r] = rowOf[k] + 1;
  }
  let dropped = 0;
  for (let k = 0; k < n; k++) {
    const r = find(k);
    if (Math.max(x1[r] - x0[r], y1[r] - y0[r]) < minSide) {
      m.fill(0, rowOf[k] * w + S[k], rowOf[k] * w + E[k]);
      if (r === k) dropped++;
    }
  }
  return dropped;
}

// ───────────── 3. 每一条扫描线上的「墙带」（横截面） ─────────────

/**
 * M 的每一行是一条扫描线（找横墙时 M = 转置图：一行 = 原图的一列）。每行：
 * 墨迹的段 → 等间距的一串细线（地砖 / 踏步 / 填充线）先标出来不用 →
 * 剩下的按间隔 ≤ tmax 分组 → 每组里所有「总宽在 [tmin, tmax] 之间、两边都不能再加一条」的窗口 = 一片墙的横截面。
 * 输出 slices：r（行 = 沿墙方向的位置）、s、e（横截面的起止，含 s 不含 e）、kind（0 实心一段 / 1 几条细线 / 2 混合）、nl（几段）、ink（墨的像素数）。
 */
function bandSlices(M, W, H, P, pat, thickOut) {
  const { lw, tmin, tmax, tmaxStd } = P;
  const out = { r: new Buf(8192), s: new Buf(8192), e: new Buf(8192), k: new Buf(8192), nl: new Buf(8192), ink: new Buf(8192) };
  const rs = new Int32Array((W >> 1) + 2);
  const re = new Int32Array((W >> 1) + 2);
  const isPat = new Uint8Array((W >> 1) + 2);
  const idx = new Int32Array((W >> 1) + 2);
  for (let r = 0; r < H; r++) {
    const base = r * W;
    let n = 0;
    let x = 0;
    while (x < W) {
      if (!M[base + x]) {
        x++;
        continue;
      }
      const s = x;
      while (x < W && M[base + x]) x++;
      rs[n] = s;
      re[n] = x;
      n++;
    }
    if (!n) continue;
    // 等间距的细线（≥ 4 条，整串比墙厚宽）→ 图案
    isPat.fill(0, 0, n);
    for (let i = 0; i + 3 < n; ) {
      if (re[i] - rs[i] > lw || re[i + 1] - rs[i + 1] > lw) {
        i++;
        continue;
      }
      const g0 = rs[i + 1] - re[i];
      const tol = Math.max(1.5, g0 * 0.18);
      // 图案里的线是孤立的：前后的空 ≥ 半个间距（墙面线后面紧跟着填充线 → 是墙的一部分，不进图案）
      if (i > 0 && rs[i] - re[i - 1] < 0.5 * g0) {
        i++;
        continue;
      }
      let j = i + 1;
      while (j + 1 < n && re[j + 1] - rs[j + 1] <= lw && Math.abs(rs[j + 1] - re[j] - g0) <= tol && !(j + 2 < n && rs[j + 2] - re[j + 1] < 0.5 * g0)) j++;
      if (j - i + 1 >= 4 && re[j] - rs[i] > tmax && g0 >= 2) {
        for (let k = i; k <= j; k++) isPat[k] = 1;
        if (pat) {
          pat.r.push(r);
          pat.s.push(rs[i]);
          pat.e.push(re[j]);
          pat.g.push(g0 + ((re[i] - rs[i]) >> 0));
          pat.n.push(j - i + 1);
        }
        i = j + 1;
      } else i++;
    }
    let m = 0;
    for (let i = 0; i < n; i++) if (!isPat[i]) idx[m++] = i;
    // 分组（间隔 > tmax 断开）
    let c0 = 0;
    while (c0 < m) {
      let c1 = c0;
      while (c1 + 1 < m && rs[idx[c1 + 1]] - re[idx[c1]] <= tmaxStd) c1++;
      // 组里每一个总宽在 [tmin, tmax] 的连续窗口都报（墙旁边贴着家具线时，墙自己那一段也在里面）；单独一段细线不算
      for (let p = c0; p <= c1; p++) {
        const sp = rs[idx[p]];
        let ink = 0;
        let thick = 0;
        for (let q = p; q <= c1; q++) {
          const L = re[idx[q]] - rs[idx[q]];
          const span = re[idx[q]] - sp;
          if (span > tmaxStd) break;
          ink += L;
          if (L > lw) thick++;
          if (span < tmin) continue;
          if (p === q) {
            if (L <= lw) continue;
            out.r.push(r);
            out.s.push(sp);
            out.e.push(re[idx[q]]);
            out.k.push(0);
            out.nl.push(1);
            out.ink.push(L);
          } else {
            out.r.push(r);
            out.s.push(sp);
            out.e.push(re[idx[q]]);
            out.k.push(thick ? 2 : 1);
            out.nl.push(q - p + 1);
            out.ink.push(ink);
          }
        }
      }
      c0 = c1 + 1;
    }
    // 比一般的墙厚（分户墙 0.27–0.36 m）：只认相邻的两条细线（中间空）或一段实心 —— 另放一份，后面只在它能把外墙封上时才用
    if (thickOut) for (let p = 0; p < m; p++) {
      const a = idx[p];
      const La = re[a] - rs[a];
      if (La > tmaxStd && La <= tmax) {
        thickOut.r.push(r);
        thickOut.s.push(rs[a]);
        thickOut.e.push(re[a]);
        thickOut.k.push(0);
        thickOut.nl.push(1);
        thickOut.ink.push(La);
        continue;
      }
      if (p + 1 >= m) continue;
      const b = idx[p + 1];
      const span = re[b] - rs[a];
      // 两条线（照片里线会糊成 3–4 像素）、中间空着
      if (span > tmaxStd && span <= tmax && La <= 0.3 * span && re[b] - rs[b] <= 0.3 * span) {
        thickOut.r.push(r);
        thickOut.s.push(rs[a]);
        thickOut.e.push(re[b]);
        thickOut.k.push(1);
        thickOut.nl.push(2);
        thickOut.ink.push(La + re[b] - rs[b]);
      }
    }
  }
  return out;
}

// ───────────── 4. 一行一行接起来 → 墙段 ─────────────

function track(sl, P) {
  const { skip } = P;
  const N = sl.r.n;
  const R = sl.r.a;
  const S = sl.s.a;
  const E = sl.e.a;
  const chains = [];
  let active = [];
  let i = 0;
  const pairs = [];
  while (i < N) {
    const r = R[i];
    let j = i;
    while (j < N && R[j] === r) j++;
    // 太久没接上的链结束
    if (active.length) active = active.filter((c) => r - c.last <= skip + 1);
    pairs.length = 0;
    for (let k = i; k < j; k++) {
      const c2 = S[k] + E[k];
      const t = E[k] - S[k];
      for (let q = 0; q < active.length; q++) {
        const ch = active[q];
        const dc = Math.abs(c2 - ch.c2) / 2;
        const dt = Math.abs(t - ch.t);
        if (dc <= Math.max(1.5, 0.22 * ch.t) && dt <= Math.max(2, 0.34 * ch.t)) pairs.push(dc + 0.5 * dt + (r - ch.last - 1) * 0.25, k, q);
      }
    }
    const usedS = new Set();
    const usedC = new Set();
    if (pairs.length) {
      const order = [];
      for (let p = 0; p < pairs.length; p += 3) order.push(p);
      order.sort((a, b) => pairs[a] - pairs[b]);
      for (const p of order) {
        const k = pairs[p + 1];
        const q = pairs[p + 2];
        if (usedS.has(k) || usedC.has(q)) continue;
        usedS.add(k);
        usedC.add(q);
        const ch = active[q];
        ch.ids.push(k);
        ch.last = r;
        ch.c2 = S[k] + E[k];
        ch.t = E[k] - S[k];
      }
    }
    for (let k = i; k < j; k++) {
      if (usedS.has(k)) continue;
      const ch = { ids: [k], first: r, last: r, c2: S[k] + E[k], t: E[k] - S[k] };
      chains.push(ch);
      active.push(ch);
    }
    i = j;
  }
  return chains;
}

/** 链 → 墙段 { o, c, t, a, b, n, multi, solid, ids } （坐标 = 工作图像素，c = 横截面中心，a..b = 沿墙方向） */
function chainToSeg(ch, sl, o) {
  const cs = [];
  const ts = [];
  let multi = 0;
  let solid = 0;
  let pair = 0;
  for (const k of ch.ids) {
    cs.push((sl.s.a[k] + sl.e.a[k]) / 2);
    ts.push(sl.e.a[k] - sl.s.a[k]);
    const kind = sl.k.a[k];
    if (kind === 0) solid++;
    else if (kind === 1) {
      multi++;
      if (sl.nl.a[k] === 2) pair++;
    }
  }
  const n = ch.ids.length;
  // solid = 实心一段；pair = 两条细线（空心墙 / 家具）；filled = 实心 + 填充（≥ 3 段或粗细混合）
  return { o, c: median(cs), t: median(ts), a: ch.first, b: ch.last + 1, n, multi: multi / n, solid: solid / n, pair: pair / n, ids: ch.ids, sl };
}

// ───────────── 5. 尺度：不知道每米几像素时，从墙厚 / 线距估 ─────────────

/**
 * 统计「孤立的一组线」的总宽（一段实心，或几条细线挤在一起，外边两条是长线、前后都空着）—— 墙的横截面。
 * 返回 { t: 主峰（像素）, t2: 第二峰, lw: 细线宽, n }
 */
function thicknessModes(m, w, h) {
  const hist = new Float64Array(400);
  const lwh = new Float64Array(16);
  const step = Math.max(1, Math.round(Math.min(w, h) / 600));
  const rs = new Int32Array((Math.max(w, h) >> 1) + 2);
  const re = new Int32Array((Math.max(w, h) >> 1) + 2);
  // 每个墨点所在的横向 / 纵向墨段长（一次算好）
  const HL = new Uint16Array(w * h);
  const VL = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    let x = 0;
    while (x < w) {
      if (!m[r + x]) {
        x++;
        continue;
      }
      const s = x;
      while (x < w && m[r + x]) x++;
      HL.fill(Math.min(65535, x - s), r + s, r + x);
    }
  }
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!m[y * w + x]) {
        y++;
        continue;
      }
      const s = y;
      while (y < h && m[y * w + x]) y++;
      const L = Math.min(65535, y - s);
      for (let k = s; k < y; k++) VL[k * w + x] = L;
    }
  }
  const runLenH = (x, y) => HL[y * w + x];
  const runLenV = (x, y) => VL[y * w + x];
  const scan = (vertical) => {
    const lines = vertical ? w : h;
    const len = vertical ? h : w;
    for (let L = 0; L < lines; L += step) {
      let n = 0;
      for (let p = 0; p < len; ) {
        const v = vertical ? m[p * w + L] : m[L * w + p];
        if (!v) {
          p++;
          continue;
        }
        const s = p;
        while (p < len && (vertical ? m[p * w + L] : m[L * w + p])) p++;
        rs[n] = s;
        re[n] = p;
        n++;
      }
      for (let i = 0; i < n; i++) {
        const t = re[i] - rs[i];
        if (t <= 15) {
          const mid = (rs[i] + re[i]) >> 1;
          const along = vertical ? runLenH(L, mid) : runLenV(mid, L);
          if (along >= 12 * t && along >= 20) lwh[t]++;
        }
      }
      // 孤立的组：组内间隔 ≤ 0.6 × 组宽、组前后的空白 ≥ 1.5 × 组宽
      for (let i = 0; i < n; i++) {
        for (let j = i; j < n && j < i + 6; j++) {
          const span = re[j] - rs[i];
          if (span < 3 || span >= 400) break;
          let ok = true;
          for (let k = i; k < j; k++) if (rs[k + 1] - re[k] > 0.75 * span) ok = false;
          if (!ok) continue;
          const before = i ? rs[i] - re[i - 1] : 1e9;
          const after = j + 1 < n ? rs[j + 1] - re[j] : 1e9;
          if (before < 1.5 * span || after < 1.5 * span) continue;
          // 外边两条是长线
          const m1 = (rs[i] + re[i]) >> 1;
          const m2 = (rs[j] + re[j]) >> 1;
          const a1 = vertical ? runLenH(L, m1) : runLenV(m1, L);
          const a2 = vertical ? runLenH(L, m2) : runLenV(m2, L);
          if (a1 >= 5 * span && a2 >= 5 * span) hist[span]++;
        }
      }
    }
  };
  scan(true);
  scan(false);
  let lw = 1;
  for (let t = 1; t < 16; t++) if (lwh[t] > lwh[lw]) lw = t;
  // 平滑后的峰（细线宽附近不算）
  const sm = new Float64Array(400);
  for (let t = 2; t < 398; t++) {
    const k = Math.max(1, Math.round(t * 0.08));
    let s = 0;
    for (let d = -k; d <= k; d++) s += hist[t + d] || 0;
    sm[t] = s / (2 * k + 1);
  }
  const lo = Math.max(3, Math.ceil(lw * 2.2));
  const peaks = [];
  for (let t = lo; t < 398; t++) if (sm[t] > 0 && sm[t] >= sm[t - 1] && sm[t] >= sm[t + 1]) peaks.push({ t, v: sm[t] });
  peaks.sort((a, b) => b.v - a.v);
  const p1 = peaks[0];
  const p2 = peaks.find((p) => p1 && p.v >= 0.25 * p1.v && (p.t > p1.t * 1.35 || p.t < p1.t / 1.35));
  let total = 0;
  for (let t = lo; t < 400; t++) total += hist[t];
  return { t: p1?.t || 0, t2: p2?.t || 0, lw, n: total };
}

// ───────────── 主函数 ─────────────

/**
 * 从一张平面图裁图里找墙。img = { width, height, data }；pxPerM = 每米几像素（裁图像素；不知道就不传，会按墙厚 / 门宽估）。
 * hints（都可不传）：{ wallMin, wallMax（m）, doorMin, doorMax（m）, minFace（m²） }
 */
export function extractWalls(img, opts = {}) {
  const t0 = now();
  const hints = opts.hints || {};
  const W = img.width;
  const H = img.height;
  const T = inkThreshold(img);
  // 工作分辨率：每米 ~75–110 像素就够（100 mm 的墙 ≥ 7 像素）；不知道比例时先按图大小缩到 ≤ 3 Mpx
  let pxPerM = opts.pxPerM > 0 ? opts.pxPerM : 0;
  let scaleSource = pxPerM ? 'given' : null;
  const tm = {};
  let tl = now();
  const mark = (k) => {
    const t = now();
    tm[k] = Math.round((tm[k] || 0) + t - tl);
    tl = t;
  };
  mark('threshold');
  // 工作分辨率：固定 WORK_PXM（原图更细就按面积缩小，不是整数倍也行 → 结果不随原图分辨率跳）；不知道比例时先按图大小缩到 ≤ 1.2 Mpx
  const WORK = opts.workPxM || WORK_PXM;
  let s = pxPerM ? Math.min(1, WORK / pxPerM) : Math.min(1, Math.sqrt(1.2e6 / (W * H)));
  let D = darkness(img, s, T);
  let B = binFrom(D);
  mark('binarize');
  let modes = null;
  if (!pxPerM) {
    modes = thicknessModes(B.m, B.w, B.h);
    // 两个峰（内墙 / 外墙）→ 小的 ≈ 0.12 m，大的 ≈ 0.21 m；一个峰 ≈ 0.15 m
    let est = 0;
    if (modes.t && modes.t2) {
      const a = Math.min(modes.t, modes.t2);
      const b = Math.max(modes.t, modes.t2);
      est = (a / 0.12 + b / 0.21) / 2;
    } else if (modes.t) est = modes.t / 0.15;
    if (est > 0) {
      pxPerM = est * D.f;
      scaleSource = 'walls';
      const s2 = Math.min(1, WORK / pxPerM);
      if (Math.abs(s2 / s - 1) > 0.15) {
        s = s2;
        D = darkness(img, s, T);
        B = binFrom(D);
        modes = thicknessModes(B.m, B.w, B.h);
      }
    }
    mark('scale');
    if (opts.debug) opts.debug.modes = { ...modes, f: D.f, est: pxPerM };
  }
  const f = D.f; // 工作像素 → 原图像素（可以不是整数）
  const { w, h } = B;
  const pm = pxPerM ? pxPerM / f : 0; // 工作图每米像素
  if (!pm || B.ink < 50) return emptyResult(W, H, pxPerM, ['no-walls'], now() - t0);
  // 笔：CAD 导出的图里墙线用粗笔，家具 / 洁具 / 地砖 / 尺寸线 / 轴线 / 栏杆 / 排水沟用细笔 → 粗细分得开时，墙带只在粗笔的墨里找
  const SW = strokeWidths(D.Aw, w, h, SOFT, Math.round(0.4 * pm), D.A);
  const pen = penSplit(SW.hist, pm);
  mark('pen');
  if (opts.debug) opts.debug.pen = pen;
  const raw = B.m; // 原始二值（门弧 / 玻璃线 / 墨迹检查用）
  let heavy = null;
  let strict = null; // 滞后之前的粗笔掩膜（找窗的玻璃线用：斜线填充 / 轴线不会从墙线「长」进来）
  if (pen.ok && opts.pen !== false) {
    heavy = new Uint8Array(w * h);
    const { sw, mx } = SW;
    // 粗笔：笔宽 ≥ τ，而且横穿它时有一个像素差不多盖满（几条细线挨着并成一段的不算：栏杆、扶手、推拉门的轨道）。
    // 白纸的图（PDF / 导出的图）：缩小过一两次的粗线峰值会掉到 80 % 左右 → 门槛低一点；复印件 / 照片的碳粉深浅不匀，门槛照旧（挡灰的杂线）
    const photo0 = opts.photo ?? T.bgMean < 238;
    const dense = Math.round(255 * clamp(0.5 * pen.heavy, 0.6, photo0 ? 0.85 : 0.78));
    for (let k = 0; k < w * h; k++) if (raw[k] && sw[k] >= pen.tau && mx[k] >= dense) heavy[k] = 1;
    // 滞后（只对复印件 / 照片：纸不是白的）：和粗笔连着、稍细 / 稍淡一点的墨也算（碳粉不匀，同一条墙线有的地方淡、有的地方细）
    const weakW = Math.round(0.65 * pen.tau);
    const weakD = Math.round(0.6 * dense);
    const q = new Int32Array(w * h);
    let qt = 0;
    const photo = opts.photo ?? T.bgMean < 238;
    if (photo) {
      strict = heavy.slice();
      for (let k = 0; k < w * h; k++) if (heavy[k]) q[qt++] = k;
    }
    for (let qh = 0; qh < qt; qh++) {
      const k = q[qh];
      const x = k % w;
      const y = (k - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const kk = yy * w + xx;
          if (heavy[kk] || !raw[kk] || sw[kk] < weakW || mx[kk] < weakD) continue;
          heavy[kk] = 1;
          q[qt++] = kk;
        }
    }
    // 复印件的碳粉掉点：同一条粗线断成一截一截（断口 ≤ 0.08 m、断口里还有淡墨）→ 顺着线的方向接上（门洞、窗都比这宽得多）
    if (photo) closeAlong(heavy, D.A, w, h, Math.max(2, Math.round(0.08 * pm)));
  }
  if (opts.debug) Object.assign(opts.debug, { heavyMask: heavy, rawMask: raw, A: D.A, sw: SW.sw, mx: SW.mx, w, h });
  const base = { W, H, T, D, img, f, pm, w, h, raw, hints, opts, pxPerM, scaleSource, modes, mark, pen, SW };
  base.strict = strict;
  let out = wallsCore(base, heavy);
  // 不知道比例：按墙厚（再按门宽）估出来以后，用估的比例当「给了的」再读一遍（墙厚范围不再按看到的峰放宽 → 不会把墙边的家具线也框进来）；
  // 门也没认出来、读得又差（多半猜错了一倍：把外墙当内墙、把两条线的间距当墙厚）→ 再试 ×2 / ÷2，挑围得最好的
  if (scaleSource === 'walls' && !opts._retry) {
    const est = out.pxPerM;
    const ks = out.scaleSource === 'walls' && out.q.score < 0.4 ? [1, 2, 0.5] : [1];
    let best = null;
    let bestQ = out.q.score / 0.9;
    for (const k of ks) {
      const alt = extractWalls(img, { ...opts, pxPerM: est * k, _retry: true });
      if (alt.quality.score > bestQ + (k === 1 ? -0.02 : 0.15)) {
        best = alt;
        bestQ = alt.quality.score;
      }
    }
    if (best) {
      let source = out.scaleSource;
      // 第一遍的比例差得多时（斜线填充的墙厚把比例估小 30 %）量出来的门宽也不准 → 在估好的比例下再量一次门宽，差 > 3 % 再读一遍
      const dw = best.gaps.filter((g) => g.kind === 'door' && g.arc && !g.double).map((g) => g.b - g.a);
      if (dw.length >= 2) {
        const est2 = median(dw) / 0.82;
        const r = est2 / best.pxPerM;
        if (Math.abs(r - 1) > 0.03 && r > 0.75 && r < 1.33) {
          const alt = extractWalls(img, { ...opts, pxPerM: est2, _retry: true });
          if (alt.quality.score >= best.quality.score - 0.02) {
            best = alt;
            source = 'doors';
          }
        }
      }
      best.scaleSource = source;
      // 只按墙厚猜的比例（门宽没对上）不太靠得住
      const k = source === 'doors' ? 0.9 : 0.75;
      best.quality = { ...best.quality, score: +(best.quality.score * k).toFixed(3), reasons: [...best.quality.reasons, 'scale-estimated'] };
      best.ms = Math.round(now() - t0);
      return best;
    }
  }
  if (opts.debug) opts.debug.first = { heavy: !!heavy, q: out.q };
  // 粗笔的墨围不出房子（墙线其实和家具一样粗）→ 用全部的墨再来一遍，挑好的。复印件 / 照片（纸不是白的）只在粗笔的结果
  // 真的不成样子时才换：粗笔读错是少墙（过不了门槛、退回 AI 房间框）；全部的墨读错是凭空多墙（排水沟、栏杆、家具边）—— 后者更糟
  if (heavy && opts.pen !== 'heavy' && out.q.score < ((opts.photo ?? T.bgMean < 238) ? 0.35 : 0.6)) {
    const alt = wallsCore(base, null);
    if (opts.debug) opts.debug.alt = { q: alt.q };
    if (alt.q.score > out.q.score + 0.1) out = alt;
  }
  return finish(out, base, t0, tm);
}

const SOFT = 40; // 量笔宽时的「有墨」（平均深浅 ≥ 16 %）

/** 粗笔掩膜横、竖各扫一遍：两段之间的空 ≤ gap 像素、空里每一点都有淡墨（A ≥ SOFT）→ 填上 */
function closeAlong(m, A, w, h, gap) {
  const fill = (get, set, n, len) => {
    for (let r = 0; r < n; r++) {
      let last = -1;
      for (let x = 0; x < len; x++) {
        if (!get(r, x)) continue;
        if (last >= 0 && x - last > 1 && x - last - 1 <= gap) {
          let ok = true;
          for (let k = last + 1; k < x && ok; k++) if (getA(r, k) < SOFT) ok = false;
          if (ok) for (let k = last + 1; k < x; k++) set(r, k);
        }
        last = x;
      }
    }
  };
  let getA;
  getA = (y, x) => A[y * w + x];
  fill((y, x) => m[y * w + x], (y, x) => (m[y * w + x] = 1), h, w);
  getA = (x, y) => A[y * w + x];
  fill((x, y) => m[y * w + x], (x, y) => (m[y * w + x] = 1), w, h);
}

/** 从墙带到房间面：heavy = 粗笔的墨（null → 用全部的墨：再按线粗细 / 填充去掉家具） */
function wallsCore(base, heavy) {
  const { T, D, img, f, pm, w, h, raw, hints, opts, scaleSource, modes, mark, pen, SW } = base;
  let { pxPerM } = base;
  // 参数（工作图像素）
  const wmin = hints.wallMin || WALL_T.min;
  const wmax = hints.wallMax || WALL_T.max;
  const P = {
    pm,
    lw: Math.max(2, Math.round(0.05 * pm)),
    tmin: Math.max(3, Math.round(wmin * pm)),
    tmaxStd: Math.max(6, Math.round(wmax * pm) + 1),
    tmax: Math.max(6, Math.round((hints.wallMax ? wmax : WALL_T.thick) * pm) + 1),
    skip: Math.max(2, Math.round(0.04 * pm)),
    heavy: !!heavy,
  };
  if (P.tmin <= P.lw) P.tmin = P.lw + 1;
  // 粗笔的图：一条粗线（推拉门两扇重叠处、窗框）不是墙 —— 墙至少是两条粗线隔开、或者比两倍笔宽还厚的实心
  // 再薄的墙（100 mm 砖墙）画出来也有 ≥ 0.1 m 厚（墙中线距 + 一支笔宽）；0.085 m 以下的「两条粗线」是推拉门扇 / 扶手 / 窗框
  if (heavy) {
    P.tmin = Math.max(P.tmin, Math.ceil(2.2 * pen.heavy), Math.round(0.085 * pm));
    // 画出来的墙厚 = 中线距 + 一支墙线笔宽（+ 贴着墙面画的家具线并进来的一点）
    P.tmaxStd += Math.round(clamp(pen.heavy / pm, 0.015, 0.05) * pm) + 1;
    P.tmax = Math.max(P.tmax, P.tmaxStd);
  }
  if (scaleSource === 'walls' && modes) {
    // 比例是估的：墙厚范围按实际看到的峰放宽
    const lo = Math.min(modes.t || 1e9, modes.t2 || 1e9);
    const hi = Math.max(modes.t || 0, modes.t2 || 0);
    if (lo < 1e9) P.tmin = Math.max(P.lw + 1, Math.min(P.tmin, Math.round(lo * 0.6)));
    if (hi) {
      P.tmaxStd = Math.max(P.tmaxStd, Math.round(hi * 1.35) + 1);
      P.tmax = Math.max(P.tmax, P.tmaxStd);
    }
  }
  const mask = heavy ? heavy.slice() : raw.slice();
  dropSmall(mask, w, h, Math.max(P.tmax + 2, Math.round(0.4 * pm)));
  const maskT = transpose(mask, w, h);
  const rawT = transpose(raw, w, h);
  const glass = heavy ? base.strict || heavy : null;
  const glassT = glass ? transpose(glass, w, h) : null;
  const patH = { r: new Buf(), s: new Buf(), e: new Buf(), g: new Buf(), n: new Buf() };
  const patV = { r: new Buf(), s: new Buf(), e: new Buf(), g: new Buf(), n: new Buf() };
  const mk = () => ({ r: new Buf(256), s: new Buf(256), e: new Buf(256), k: new Buf(256), nl: new Buf(256), ink: new Buf(256) });
  const thH = mk();
  const thV = mk();
  const slH = bandSlices(maskT, h, w, P, patH, thH); // 横墙：扫每一列
  const slV = bandSlices(mask, w, h, P, patV, thV); // 竖墙：扫每一行
  mark('slices');
  const minN = Math.max(3, Math.round(0.06 * pm));
  if (opts.debug) Object.assign(opts.debug, { slH, slV, P, f, mask, w, h, raw });
  let segs = [
    ...track(slH, P).filter((c) => c.ids.length >= minN).map((c) => chainToSeg(c, slH, 'h')),
    ...track(slV, P).filter((c) => c.ids.length >= minN).map((c) => chainToSeg(c, slV, 'v')),
  ].filter((q) => q.t <= P.tmaxStd || q.b - q.a >= 1.5 * pm); // 很厚的带：只要长的（分户墙）
  mark('track');
  // 照片 / 扫描（纸不是白的）：门弧常是很淡的虚线 → 找门弧时用宽松的墨
  const photo = opts.photo ?? T.bgMean < 238;
  const ctx = { P, w, h, raw, rawT, mask, maskT, heavy, glass, glassT, pm, f, img, T, D, pen, SW, photo, debug: opts.debug };
  if (opts.debug) opts.debug.preNms = segs.map((s) => ({ o: s.o, c: s.c * f, a: s.a * f, b: s.b * f, t: s.t * f, n: s.n }));
  segs = nms(segs, ctx);
  segs = mergeCollinear(segs, ctx);
  segs = nms(segs, ctx);
  if (opts.debug) opts.debug.beforeFurniture = segs.map((s) => ({ o: s.o, c: s.c * f, a: s.a * f, b: s.b * f, t: s.t * f, n: s.n, solid: +s.solid.toFixed(2), multi: +s.multi.toFixed(2), pair: +s.pair.toFixed(2), hf: +heavyFrac(s, ctx).toFixed(2), ...interior(s, ctx) }));
  segs = dropFurniture(segs, ctx);
  snapEnds(segs, ctx);
  if (opts.debug) opts.debug.beforeNetwork = segs.map((s) => ({ o: s.o, c: s.c * f, a: s.a * f, b: s.b * f, t: s.t * f, endA: s.endA, endB: s.endB }));
  segs = keepNetwork(segs, ctx);
  if (opts.debug) opts.debug.afterNetwork = segs.map((s) => ({ o: s.o, c: s.c * f, a: s.a * f, b: s.b * f, t: s.t * f, endA: s.endA, endB: s.endB }));
  // 分户墙（比一般的墙厚）：只在它能把外墙封上（外面的空地少 ≥ 3 m²）时才加
  const thick = [
    ...track(thH, P).filter((c) => c.last - c.first + 1 >= 1.5 * pm).map((c) => chainToSeg(c, thH, 'h')),
    ...track(thV, P).filter((c) => c.last - c.first + 1 >= 1.5 * pm).map((c) => chainToSeg(c, thV, 'v')),
  ];
  if (thick.length) addClosingWalls(segs, thick, ctx);
  unifyLines(segs, ctx);
  if (opts.debug) opts.debug.afterUnify = segs.map((s) => ({ o: s.o, c: s.c * f, a: s.a * f, b: s.b * f, t: s.t * f, endA: s.endA, endB: s.endB }));
  mark('segments');
  // 楼梯先找：楼梯敞开的一边（扶手 / 栏杆）不是墙上的开口，踏步也不是玻璃
  const stairs = findStairs(segs, ctx);
  ctx.stairs = stairs;
  const gaps = dedupeDoors(findGaps(segs, ctx, hints), segs, ctx);
  const wins = findWindows(segs, ctx);
  mark('gaps');
  // 门宽反推比例（不知道比例时）：铰链门的门扇长（门洞净宽）中位数 ≈ 0.82 m（卧室 0.8–0.85、浴室 0.7–0.75、大门更宽）
  let scale = scaleSource;
  if (scale === 'walls') {
    const dw = gaps.filter((g) => g.kind === 'door' && g.arc && !g.double).map((g) => g.b - g.a);
    if (dw.length >= 2) {
      const est = (median(dw) / 0.82) * f;
      if (est > pxPerM * 0.6 && est < pxPerM * 1.6) {
        pxPerM = est;
        scale = 'doors';
      }
    }
  }
  markExterior(segs, gaps, ctx);
  mark('ext+stairs');
  const faceOut = findFaces(segs, stairs, ctx, hints);
  mark('faces');
  const q = scoreQuality(segs, gaps, faceOut, ctx, { pxPerM: base.pxPerM, scaleSource: scale, f, wins });
  mark('quality');
  return { segs, gaps, wins, stairs, faceOut, q, pxPerM, scaleSource: scale, ctx };
}

/** 工作图像素 → 裁图像素的输出 */
function finish(out, base, t0, tm) {
  const { segs, gaps, wins, stairs, faceOut, q: quality, pxPerM, scaleSource, ctx } = out;
  const { f } = ctx;
  const { W, H, pen, pm } = base;
  const walls = segs.map((s) => {
    const style = s.solid >= 0.6 ? 'solid' : s.multi >= 0.5 ? 'lines' : 'hatched';
    const o = s.o === 'h' ? { x1: s.a * f, y1: s.c * f, x2: s.b * f, y2: s.c * f } : { x1: s.c * f, y1: s.a * f, x2: s.c * f, y2: s.b * f };
    return { ...o, t: s.t * f, ext: !!s.ext, style };
  });
  const allGaps = [...gaps, ...wins]
    .map((g) => {
      const s = segs[g.seg];
      const a = g.a * f;
      const b = g.b * f;
      const c = s.c * f;
      return { wall: g.seg, a, b, kind: g.kind, arc: !!g.arc, ...(g.double ? { double: true } : {}), ...(g.swing ? { swing: g.swing } : {}), ...(s.o === 'h' ? { x1: a, y1: c, x2: b, y2: c } : { x1: c, y1: a, x2: c, y2: b }) };
    })
    .sort((p, q) => p.wall - q.wall || p.a - q.a);
  const faces = faceOut.faces.map((fc) => ({
    rects: fc.rects.map((r) => ({ x: r.x * f, y: r.y * f, w: r.w * f, h: r.h * f })),
    area: fc.area * f * f,
    centroid: { x: fc.cx * f, y: fc.cy * f },
    ...(fc.stairs ? { stairs: true } : {}),
  }));
  return {
    walls,
    gaps: allGaps,
    faces,
    stairs: stairs.map((r) => ({ x: r.x * f, y: r.y * f, w: r.w * f, h: r.h * f, dir: r.dir })),
    quality,
    pxPerM: pxPerM ? +pxPerM.toFixed(2) : null,
    scaleSource,
    pen: { split: !!ctx.heavy, ok: !!pen.ok, heavyM: +(pen.heavy / pm).toFixed(4), thinM: +(pen.thin / pm).toFixed(4) },
    size: { width: W, height: H, work: +f.toFixed(4) },
    ms: Math.round(now() - t0),
    timing: tm,
  };
}

function emptyResult(W, H, pxPerM, reasons, ms) {
  return { walls: [], gaps: [], faces: [], stairs: [], quality: { score: 0, wallPx: 0, coverage: 0, reasons }, pxPerM: pxPerM || null, scaleSource: null, size: { width: W, height: H, work: 1 }, ms: Math.round(ms) };
}

// ───────────── 6. 墙段的整理 ─────────────

const segLen = (s) => s.b - s.a;
const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

/** 平行、重叠、横截面挨着的两段：留证据多的（同一面墙的几种读法里挑一种） */
function nms(segs, ctx) {
  const out = [];
  const { P } = ctx;
  // 证据 = 自己的长度 + 同一条线上（3 m 以内）别的段的一半：贴着墙的家具带比不过墙线
  const reach = 3 * ctx.pm;
  const score = segs.map((s) => {
    let v = s.n;
    for (const q of segs) {
      if (q === s || q.o !== s.o || Math.abs(q.c - s.c) > Math.max(2, 0.2 * s.t) || Math.abs(q.t - s.t) > Math.max(2, 0.3 * s.t)) continue;
      const gap = Math.max(q.a - s.b, s.a - q.b);
      // 越近越算数（紧接着的下一段 = 同一面墙；3 m 外的一段平行线多半是别的东西）
      if (gap > 0 && gap <= reach) v += 0.5 * q.n * (1 - gap / reach);
    }
    return v;
  });
  // 两两比：横截面挨着 / 重叠、沿墙方向重叠 ≥ 60 % 的两段只留一段。
  // 一段的横截面包住另一段（墙带里面的一条线和一面墙面也成一带）→ 留宽的那段（只要它不比窄的短太多）；否则留证据多的。
  const dead = new Uint8Array(segs.length);
  const fsc = new Map();
  const statsOf = (q) => {
    if (!fsc.has(q)) fsc.set(q, ctx.img ? faceStats(q, ctx) : { lw: 0, asym: 1 });
    return fsc.get(q);
  };
  const lwOf = (q) => statsOf(q).lw;
  // 墙带两边紧挨着的一行是空的（房间）的比例：墙里面的一截（一条线 + 一面墙面）外边还是墙 → 低
  const marg = new Map();
  const margin = (q) => {
    if (marg.has(q)) return marg.get(q);
    const M = q.o === 'h' ? ctx.maskT : ctx.mask;
    const Wd = q.o === 'h' ? ctx.h : ctx.w;
    const v0 = Math.round(q.c - q.t / 2) - 2;
    const v1 = Math.round(q.c + q.t / 2) + 1;
    let ok = 0;
    let n = 0;
    for (let u = Math.ceil(q.a); u < q.b; u++) {
      n++;
      const r = u * Wd;
      const out0 = v0 < 0 || !M[r + v0];
      const out1 = v1 >= Wd || !M[r + v1];
      if (out0 && out1) ok++;
    }
    const v = n ? ok / n : 0;
    marg.set(q, v);
    return v;
  };
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    for (let j = i + 1; j < segs.length; j++) {
      const k = segs[j];
      if (k.o !== s.o || dead[i] || dead[j]) continue;
      const ov = overlap(s.a, s.b, k.a, k.b);
      if (ov <= 0.6 * Math.min(segLen(s), segLen(k))) continue;
      if (Math.abs(s.c - k.c) >= (s.t + k.t) / 2 + 1) continue;
      const ratio = Math.max(s.t, k.t) / Math.max(1, Math.min(s.t, k.t));
      // 同心、差不多厚 → 交给合并
      if (Math.abs(s.c - k.c) <= Math.max(2, 0.3 * Math.max(s.t, k.t)) && ratio <= 1.4) continue;
      // 包住的那段外边是细线 → 输；否则比证据（同一条线上紧挨着的段）× 两边干净
      let loser;
      // 一段的横截面包住另一段（墙 + 旁边一条地砖线 / 家具线）：宽的那段外边的线明显比窄的墙面线细 → 宽的不是墙
      const nested = (A, B) => A.c - A.t / 2 <= B.c - B.t / 2 + 1 && A.c + A.t / 2 >= B.c + B.t / 2 - 1 && A.t >= B.t + 2;
      const nestW = nested(s, k) ? i : nested(k, s) ? j : -1;
      let thinOuter = false;
      if (nestW >= 0 && ctx.img) {
        const wide = segs[nestW];
        const narrow = segs[nestW === i ? j : i];
        const lwW = lwOf(wide);
        const lwN = lwOf(narrow);
        thinOuter = lwW > 0 && lwN >= 2 && lwW <= 0.6 * lwN;
      }
      if (thinOuter) loser = nestW;
      else loser = score[i] * (0.4 + margin(s)) >= score[j] * (0.4 + margin(k)) ? j : i;
      const L = segs[loser];
      const W = segs[loser === i ? j : i];
      if (overlap(L.a, L.b, W.a, W.b) >= 0.6 * segLen(L)) {
        dead[loser] = 1;
        if (ctx.debug) (ctx.debug.nmsLog = ctx.debug.nmsLog || []).push({ o: L.o, lose: [L.c * ctx.f, L.t * ctx.f, L.a * ctx.f, L.b * ctx.f], win: [W.c * ctx.f, W.t * ctx.f, W.a * ctx.f, W.b * ctx.f], thinOuter, sc: [score[loser], score[loser === i ? j : i]], mg: [margin(L), margin(W)] });
      }
    }
  }
  segs.forEach((s, i) => {
    if (!dead[i]) out.push(s);
  });
  return out;
}

function inkFrac(m, W, x0, x1, y0, y1) {
  x0 = Math.max(0, Math.round(x0));
  y0 = Math.max(0, Math.round(y0));
  x1 = Math.min(W, Math.round(x1));
  const H = m.length / W;
  y1 = Math.min(H, Math.round(y1));
  if (x1 <= x0 || y1 <= y0) return 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const r = y * W;
    for (let x = x0; x < x1; x++) n += m[r + x];
  }
  return n / ((x1 - x0) * (y1 - y0));
}

/** 同一条线上的几段：中间是交叉口（有垂直的墙穿过）、或者短短一截墨（贴着的线 / 字）→ 接成一段 */
function mergeCollinear(segs, ctx) {
  const { P, raw, rawT, w, h } = ctx;
  const par = segs.map((s, i) => i);
  const find = (i) => {
    while (par[i] !== i) i = par[i] = par[par[i]];
    return i;
  };
  const byO = { h: [], v: [] };
  segs.forEach((s, i) => byO[s.o].push(i));
  for (const o of ['h', 'v']) {
    const L = byO[o].sort((i, j) => segs[i].a - segs[j].a);
    const perp = byO[o === 'h' ? 'v' : 'h'];
    for (let x = 0; x < L.length; x++) {
      const A = segs[L[x]];
      for (let y = x + 1; y < L.length; y++) {
        const Bs = segs[L[y]];
        if (Bs.a - A.b > 1.6 * P.tmaxStd + P.skip) break;
        if (Math.abs(A.c - Bs.c) > Math.max(2, 0.3 * Math.max(A.t, Bs.t))) continue;
        const gap = Bs.a - A.b;
        // 粗细差很多：一般是两面不同的墙；但紧挨着、细的那段整个在粗的墙带里（实心墙垛之间画成两三条线的窗）→ 同一面墙（只在全部墨的图里）
        const [thin, fat] = A.t < Bs.t ? [A, Bs] : [Bs, A];
        const inside = !ctx.heavy && gap <= 2 * P.skip + 1 && fat.solid >= 0.6 && thin.multi >= 0.5 && thin.c - thin.t / 2 >= fat.c - fat.t / 2 - 2 && thin.c + thin.t / 2 <= fat.c + fat.t / 2 + 2;
        if (Math.max(A.t, Bs.t) > 1.8 * Math.min(A.t, Bs.t) + 2 && !inside) continue;
        let ok = gap <= 2 * P.skip + 1;
        if (!ok) {
          const t = Math.max(A.t, Bs.t);
          const c = (A.c + Bs.c) / 2;
          // 交叉口：有垂直的墙从这里经过
          ok = perp.some((pi) => {
            const p = segs[pi];
            return p.c >= A.b - p.t / 2 - 1 && p.c <= Bs.a + p.t / 2 + 1 && p.a <= c + t / 2 + 2 && p.b >= c - t / 2 - 2;
          });
          if (!ok && gap <= P.tmaxStd * 1.6) {
            // 一截墨（字、符号压在墙上）
            const fr = o === 'h' ? inkFrac(raw, w, A.b, Bs.a, c - t / 2, c + t / 2) : inkFrac(rawT, h, A.b, Bs.a, c - t / 2, c + t / 2);
            ok = fr >= 0.55;
          }
        }
        if (ok) {
          const a = find(L[x]);
          const b = find(L[y]);
          if (a !== b) par[b] = a;
        }
      }
    }
  }
  const groups = new Map();
  segs.forEach((s, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(s);
  });
  const out = [];
  for (const g of groups.values()) {
    if (g.length === 1) {
      out.push(g[0]);
      continue;
    }
    const n = g.reduce((v, s) => v + s.n, 0);
    const cs = [];
    const ts = [];
    // 实心墙垛 + 夹在中间的窗（两三条线，带比墙薄）：墙厚、中线按实心的几段算
    const thickest = Math.max(...g.map((s) => s.t));
    const piers = g.filter((s) => s.solid >= 0.6 && s.t >= 0.6 * thickest);
    const core = piers.length && g.every((s) => piers.includes(s) || (s.multi >= 0.5 && s.t < 0.6 * thickest)) ? piers : g;
    for (const s of g) {
      const k = Math.max(1, Math.round(s.n / 8));
      if (!core.includes(s)) {
        cs.push(s.c);
        continue;
      }
      for (let i = 0; i < k; i++) {
        cs.push(s.c);
        ts.push(s.t);
      }
    }
    out.push({
      o: g[0].o,
      c: median(cs),
      t: median(ts),
      a: Math.min(...g.map((s) => s.a)),
      b: Math.max(...g.map((s) => s.b)),
      n,
      multi: g.reduce((v, s) => v + s.multi * s.n, 0) / n,
      solid: g.reduce((v, s) => v + s.solid * s.n, 0) / n,
      pair: g.reduce((v, s) => v + s.pair * s.n, 0) / n,
      parts: g.flatMap((s) => s.parts || [s]),
    });
  }
  return out;
}

/**
 * 家具 / 符号常常也是「两条细线挨着」：
 * - 图上的墙主要是实心 / 填充的 → 整段都是细线的段（不是夹在墙中间的窗）不要；
 * - 细线画墙的图 → 线比墙的线明显细的不要（家具一般用细笔）。
 */
/** 墙带「里面」（去掉两边各一条线宽）每个沿墙位置有几个墨点 → { filled: 实心位置的比例, hatched: 附近有墨的位置的比例 } */
function interior(s, ctx) {
  const { raw, rawT, w, h, pm } = ctx;
  const M = s.o === 'h' ? rawT : raw;
  const Wd = s.o === 'h' ? h : w;
  const Hd = s.o === 'h' ? w : h;
  const m = Math.max(1, Math.round(0.035 * pm));
  let v0 = Math.round(s.c - s.t / 2 + m);
  let v1 = Math.round(s.c + s.t / 2 - m);
  if (v1 <= v0) {
    v0 = Math.round(s.c - 0.5);
    v1 = v0 + 1;
  }
  v0 = clamp(v0, 0, Wd - 1);
  v1 = clamp(v1, v0 + 1, Wd);
  const rows = v1 - v0;
  const a = clamp(Math.round(s.a), 0, Hd);
  const b = clamp(Math.round(s.b), a, Hd);
  const n = b - a;
  if (n <= 0) return { filled: 0, hatched: 0, either: 0, endsFilled: 0 };
  const occ = new Uint16Array(n);
  for (let u = a; u < b; u++) {
    const r = u * Wd;
    let k = 0;
    for (let v = v0; v < v1; v++) k += M[r + v];
    occ[u - a] = k;
  }
  let filled = 0;
  const full = new Uint8Array(n);
  for (let i = 0; i < n; i++)
    if (occ[i] >= 0.6 * rows) {
      filled++;
      full[i] = 1;
    }
  // 两头（各 0.15 m）是不是实心的：实心墙垛中间夹着窗 / 推拉门（只有两三条细线）的一整段
  const endN = Math.max(2, Math.min(Math.round(0.15 * pm), Math.floor(n / 4)));
  let e0 = 0;
  let e1 = 0;
  for (let i = 0; i < endN; i++) {
    if (occ[i] >= 0.6 * rows) e0++;
    if (occ[n - 1 - i] >= 0.6 * rows) e1++;
  }
  const endsFilled = Math.min(e0, e1) / endN;
  // 平行于墙的长线（玻璃、轴线的虚线）不算填充：去掉覆盖 ≥ 40 % 的行再数（只看不实心的位置：涂黑的柱子每行都盖住）
  const rowOpen = new Uint32Array(rows);
  let nOpen = 0;
  for (let u = a; u < b; u++) {
    if (occ[u - a] >= 0.6 * rows) continue;
    nOpen++;
    const r = u * Wd;
    for (let v = v0; v < v1; v++) if (M[r + v]) rowOpen[v - v0]++;
  }
  const skipRow = new Uint8Array(rows);
  for (let v = 0; v < rows; v++) skipRow[v] = nOpen && rowOpen[v] >= 0.4 * nOpen ? 1 : 0;
  for (let u = a; u < b; u++) {
    const r = u * Wd;
    let k = 0;
    for (let v = v0; v < v1; v++) if (M[r + v] && !skipRow[v - v0]) k++;
    occ[u - a] = k;
  }
  // 每一行（平行于墙）上的墨段数 / 米：斜线填充每行都有很多段（≥ 5 / m）；家具的弧线、字、地砖格（0.3 m）少。
  // 按位置算（±0.2 m 里）：窗那一截没有填充，不拖累整段
  const starts = new Uint16Array(n + 1);
  let usedRows = 0;
  for (let v = v0; v < v1; v++) {
    if (skipRow[v - v0]) continue;
    usedRows++;
    let prev = 0;
    for (let u = a; u < b; u++) {
      const x = M[u * Wd + v];
      if (x && !prev) starts[u - a]++;
      prev = x;
    }
  }
  let hatched = 0;
  let total = 0;
  let either = 0; // 实心或填充的位置（短墙垛：一半是涂黑的柱子、一半是斜线）
  if (usedRows) {
    const W2 = Math.max(4, Math.round(0.2 * pm));
    const pre = new Uint32Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + starts[i];
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - W2);
      const hi = Math.min(n, i + W2 + 1);
      const d = (pre[hi] - pre[lo]) / usedRows / ((hi - lo) / pm);
      if (d >= 5) hatched++;
      if (d >= 5 || full[i]) either++;
    }
    total = pre[n];
  } else for (let i = 0; i < n; i++) either += full[i];
  return { filled: filled / n, hatched: hatched / n, either: either / n, density: usedRows ? total / usedRows / (n / pm) : 0, endsFilled };
}

/**
 * 墙面线的粗细（原图像素）：沿墙取十几个位置，在原图上横穿墙带，第一段和最后一段墨的宽度 → 中位数。
 * CAD 图里墙线用粗笔（0.3–0.5 mm），家具、地砖、洁具用细笔（0.1–0.2 mm）。
 */
function faceWeight(s, ctx) {
  return faceStats(s, ctx).lw;
}

/** { lw: 墙面线粗细（见上）, asym: 两边的线粗细比（细 / 粗）的中位数 —— 一条墙面线 + 旁边一条细的地砖 / 家具线 ≈ 0.3，真的墙 ≈ 1 } */
function faceStats(s, ctx) {
  const { img, T, f } = ctx;
  const W = img.width;
  const H = img.height;
  const { thr, bg, bw, B, lum } = T;
  const isInk = (x, y) => x >= 0 && y >= 0 && x < W && y < H && lum(y * W + x) * 255 < thr * bg[((y / B) | 0) * bw + ((x / B) | 0)];
  const L = s.b - s.a;
  const n = Math.max(5, Math.min(25, Math.round(L / (0.1 * ctx.pm))));
  const widths = [];
  const ratios = [];
  for (let k = 0; k < n; k++) {
    const u = Math.round((s.a + L * (0.1 + (0.8 * (k + 0.5)) / n)) * f);
    const v0 = Math.round((s.c - s.t / 2 - 2) * f);
    const v1 = Math.round((s.c + s.t / 2 + 2) * f);
    const runs = [];
    let st = -1;
    for (let v = v0; v <= v1 + 1; v++) {
      const ink = v <= v1 && (s.o === 'h' ? isInk(u, v) : isInk(v, u));
      if (ink && st < 0) st = v;
      if (!ink && st >= 0) {
        runs.push(v - st);
        st = -1;
      }
    }
    if (runs.length >= 2) {
      const p = runs[0];
      const q = runs[runs.length - 1];
      widths.push(Math.min(p, q));
      ratios.push(Math.min(p, q) / Math.max(p, q));
    }
  }
  if (widths.length < 3) return { lw: 0, asym: 1 };
  // 70 % 分位：一段墙里有窗（窗线细）也按墙线算；家具整段都细
  widths.sort((x, y) => x - y);
  return { lw: widths[Math.min(widths.length - 1, Math.floor(widths.length * 0.7))], asym: median(ratios) };
}

/**
 * 家具 / 地砖 / 符号常常也是「两条细线挨着」。先看长墙（≥ 1.5 m，按长度² 加权）是怎么画的：
 * 实心（墙带里面全黑）/ 填充（里面有斜线）/ 空心（里面是空的）。实心 / 填充的图：里面空着的带不是墙（窗夹在墙中间的除外）。
 */
function dropFurniture(segs, ctx) {
  const { P, pm } = ctx;
  for (const s of segs) Object.assign(s, interior(s, ctx));
  let wS = 0;
  let wF = 0;
  let wP = 0;
  for (const s of segs) {
    const L = segLen(s);
    if (L < 1.5 * pm) continue;
    wS += L * L * s.filled;
    wF += L * L * Math.max(0, s.hatched - s.filled);
    wP += L * L * (1 - Math.max(s.filled, s.hatched));
  }
  const style = wS >= wF && wS >= wP ? 'solid' : wF >= wP ? 'hatched' : 'hollow';
  ctx.style = style;
  if (ctx.debug) ctx.debug.style = { style, wS, wF, wP };
  // 线画的墙（空心 / 填充）：墙面线比家具线粗 → 比长墙的线明显细的不要（粗笔的墨里找的墙：细线早就不在了，不用再比）
  if (style !== 'solid' && !ctx.heavy) {
    const long = segs.filter((q) => segLen(q) >= 2 * pm);
    for (const q of segs) {
      const fs = faceStats(q, ctx);
      q.lwf = fs.lw;
      q.asym = fs.asym;
    }
    const ref = long.length ? median(long.flatMap((q) => Array(Math.max(1, Math.round(segLen(q) / pm))).fill(q.lwf))) : 0;
    ctx.lineRef = ref;
    if (ctx.debug) ctx.debug.lw = { ref, segs: segs.map((q) => ({ o: q.o, c: q.c * ctx.f, a: q.a * ctx.f, b: q.b * ctx.f, lwf: q.lwf, asym: q.asym })) };
    // 长的段（窗多的外墙，窗线细）照样留；但一边粗一边细（墙面线 + 旁边的地砖线）的细带不是墙
    if (ref >= 2) segs = segs.filter((q) => q.lwf >= 0.62 * ref || (segLen(q) >= 2 * pm && !(q.asym <= 0.5 && q.lwf <= 0.4 * ref)));
  }
  // 粗笔的图、墙是两条线 / 斜线填充画的：一整段实心、又不到 0.125 m 厚的带 = 推拉门 / 窗框的几条线挤在一起，不是墙（柱子比这厚）
  if (ctx.heavy && style !== 'solid') segs = segs.filter((q) => !(q.solid >= 0.6 && q.t < 0.125 * pm));
  if (style === 'hollow') return segs;
  // 填充画法的图里柱子 / 转角常是涂黑的 → 真的实心（横截面是一整段墨）的段也算；推拉门两扇重叠处（几条线挤在一起）不算
  const val = (s) => (style === 'solid' ? s.filled : Math.max(s.hatched, s.either, s.solid >= 0.3 ? s.filled : 0));
  // 实心的图：两头是实心墙垛、中间是窗 / 推拉门的细线 → 也是墙（窗后面再从里面找出来）
  // 粗笔的墨里找的墙（细的家具线已经不在了）：有一点填充的证据就够（短墙边上贴着浴缸 / 柜子，斜线被挡掉一些）
  const need = ctx.heavy ? 0.3 : 0.5;
  const ok = (s) => val(s) >= need || val(s) * segLen(s) >= Math.max((ctx.heavy ? 0.3 : 0.6) * pm, 0.25 * segLen(s)) || (style === 'solid' && s.endsFilled >= 0.6 && segLen(s) >= 0.6 * pm && s.multi >= 0.4);
  return segs.filter((s) => {
    if (ok(s)) return true;
    // 窗：夹在墙之间、在同一条线上
    return segs.some((q) => q !== s && q.o === s.o && ok(q) && Math.abs(q.c - s.c) <= Math.max(2, 0.3 * q.t) && (Math.abs(q.b - s.a) <= P.tmaxStd || Math.abs(s.b - q.a) <= P.tmaxStd));
  });
}

/**
 * 一段墙带有多少是粗笔画的：沿墙每个位置，横截面上（带的两条边 ± 1 像素）有没有笔宽 ≥ 0.8 τ 的墨 → 有的位置的比例。
 * 复印件的墙线断断续续、颜色深浅不一 → 整张粗笔掩膜不可靠，但一段墙上总有一大半是粗的；排水沟、栏杆、家具几乎没有。
 */
function heavyFrac(s, ctx) {
  const { SW, pen, w, h } = ctx;
  if (!SW || !pen) return 1;
  const tau = 0.8 * pen.tau;
  const M = SW.sw;
  const L = Math.max(1, Math.round(s.b - s.a));
  const step = Math.max(1, Math.round(L / 200));
  let n = 0;
  let hit = 0;
  const v0 = Math.round(s.c - s.t / 2) - 1;
  const v1 = Math.round(s.c + s.t / 2) + 1;
  for (let u = Math.ceil(s.a); u < s.b; u += step) {
    n++;
    for (let v = v0; v <= v1; v++) {
      const [x, y] = s.o === 'h' ? [u, v] : [v, u];
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (M[y * w + x] >= tau) {
        hit++;
        break;
      }
    }
  }
  return n ? hit / n : 0;
}

/** 端点吸到垂直的墙的中线上（L / T 角）；记下每个端点接在哪 */
function snapEnds(segs, ctx) {
  const { P } = ctx;
  const tol = Math.max(2, 0.06 * P.pm);
  for (const s of segs) {
    s.endA = -1;
    s.endB = -1;
    s.rawA = s.a;
    s.rawB = s.b;
  }
  segs.forEach((s, i) => {
    for (const end of ['a', 'b']) {
      const e = s[end];
      let best = -1;
      let bd = 1e9;
      segs.forEach((p, j) => {
        if (p.o === s.o) return;
        // 一个点（< 0.1 m：字的一笔、符号）不是能接上的墙
        if (p.b - p.a < 0.1 * P.pm) return;
        if (s.c < p.a - p.t / 2 - tol || s.c > p.b + p.t / 2 + tol) return;
        const d = Math.abs(e - p.c);
        if (d <= p.t / 2 + s.t / 2 + tol && d < bd) {
          bd = d;
          best = j;
        }
      });
      if (best >= 0) {
        const other = end === 'a' ? s.b : s.a;
        // 两头吸到同一面墙 / 吸完太短 → 不吸
        if (Math.abs(other - segs[best].c) < Math.max(2, s.t)) continue;
        s[end === 'a' ? 'endA' : 'endB'] = best;
        s[end] = segs[best].c;
      }
    }
  });
  // 角上的另一段也伸到这条线（L 角：两段都吸）
  for (const s of segs) if (s.b < s.a) [s.a, s.b] = [s.b, s.a];
}

/** 只留连成一片的墙网（字、家具、尺寸线零碎的一小片不要） */
function keepNetwork(segs, ctx) {
  const { P, pm } = ctx;
  const n = segs.length;
  const par = Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (par[i] !== i) i = par[i] = par[par[i]];
    return i;
  };
  const uni = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) par[b] = a;
  };
  const tol = Math.max(2, 0.06 * pm);
  for (let i = 0; i < n; i++) {
    const s = segs[i];
    if (s.endA >= 0) uni(i, s.endA);
    if (s.endB >= 0) uni(i, s.endB);
    for (let j = i + 1; j < n; j++) {
      const q = segs[j];
      if (q.o !== s.o) {
        // 十字交叉 / 碰到
        const [hh, vv] = s.o === 'h' ? [s, q] : [q, s];
        if (vv.c >= hh.a - vv.t / 2 - tol && vv.c <= hh.b + vv.t / 2 + tol && hh.c >= vv.a - hh.t / 2 - tol && hh.c <= vv.b + hh.t / 2 + tol) uni(i, j);
      } else if (Math.abs(s.c - q.c) <= Math.max(2, 0.3 * Math.max(s.t, q.t))) {
        const gap = Math.max(q.a - s.b, s.a - q.b);
        // 隔着一个门宽 → 连；更宽的空（开口）只连够长的段（轴线的小圆圈、字不算）
        const short = Math.min(segLen(s), segLen(q));
        // 比门宽的空（开口）：两段都要「像墙」—— 够长（≥ 1 m）或者另一头接在墙上（轴线圆圈、字两头都悬空）
        const [A, B] = s.a < q.a ? [s, q] : [q, s];
        const anchored = (segLen(A) >= pm || A.endA >= 0) && (segLen(B) >= pm || B.endB >= 0);
        if ((gap <= DOOR_W.max * 1.1 * pm && short >= 0.12 * pm) || (gap <= OPENING_MAX * pm && short >= 0.2 * pm && anchored)) uni(i, j);
        else if (gap <= GLAZING_MAX * pm) {
          const [p0, p1] = q.a > s.b ? [s.b, q.a] : [q.b, s.a];
          if (glazing(ctx, { o: s.o, c: (s.c + q.c) / 2, t: (s.t + q.t) / 2 }, p0, p1)) uni(i, j);
        }
      }
    }
  }
  const len = new Map();
  const cnt = new Map();
  for (let i = 0; i < n; i++) {
    len.set(find(i), (len.get(find(i)) || 0) + segLen(segs[i]));
    cnt.set(find(i), (cnt.get(find(i)) || 0) + 1);
  }
  const maxL = Math.max(0, ...len.values());
  const keep = segs.filter((s, i) => {
    const L = len.get(find(i));
    if (L < Math.max(3.5 * pm, 0.15 * maxL) && L < maxL) return false;
    // 两头都没接上、又短、旁边一个门宽以内也没有同线的墙 → 不要（轴线圆圈、字、符号）
    if (s.endA < 0 && s.endB < 0 && segLen(s) < 0.8 * pm && cnt.get(find(i)) === 1) return false;
    // 两头都没接上、很短（< 0.35 m）、比同一条线上的墙薄 → 推拉门两扇重叠处 / 窗框，不是墙垛
    if (s.endA < 0 && s.endB < 0 && segLen(s) < 0.35 * pm && segs.some((q) => q !== s && q.o === s.o && Math.abs(q.c - s.c) <= Math.max(2, 0.3 * q.t) && segLen(q) > segLen(s) && s.t < 0.75 * q.t && Math.max(q.a - s.b, s.a - q.b) < 4 * pm)) return false;
    return true;
  });
  // 端点编号要重排
  const idx = new Map(segs.map((s, i) => [s, i]));
  const ni = new Map(keep.map((s, i) => [idx.get(s), i]));
  for (const s of keep) {
    s.endA = ni.has(s.endA) ? ni.get(s.endA) : -1;
    s.endB = ni.has(s.endB) ? ni.get(s.endB) : -1;
  }
  return keep;
}

/** 外面（和图边连着的空地）有多少格 */
function outsideCells(segs, ctx, g) {
  const { R, gw, gh } = rasterWalls(segs, ctx, g);
  const { lab } = labelFree(R, gw, gh);
  let n = 0;
  for (let k = 0; k < lab.length; k++) if (lab[k] === 1) n++;
  return n;
}

/** 厚墙候选：不和已有的墙重叠、墙线够粗、加上以后外面的空地少 ≥ 3 m²（把房间围起来了）→ 加进去，两头吸到墙上 */
function addClosingWalls(segs, cands, ctx) {
  const { pm } = ctx;
  const g = Math.max(1, Math.round(0.05 * pm));
  let base = outsideCells(segs, ctx, g);
  const need = (3 * pm * pm) / (g * g);
  const ref = ctx.lineRef || 0;
  // 同一条线上、中间只隔一个丁字口的几段先接起来（分户墙被隔墙的接口打断）
  cands.sort((a, b) => a.a - b.a);
  const merged = [];
  for (const q of cands) {
    const last = merged.find((m) => m.o === q.o && Math.abs(m.c - q.c) <= Math.max(2, 0.25 * q.t) && q.a - m.b <= Math.max(ctx.P.tmax, 0.5 * pm));
    if (last) {
      const n = last.n + q.n;
      last.c = (last.c * last.n + q.c * q.n) / n;
      last.t = (last.t * last.n + q.t * q.n) / n;
      last.a = Math.min(last.a, q.a);
      last.b = Math.max(last.b, q.b);
      last.n = n;
    } else merged.push({ ...q });
  }
  cands = merged;
  cands.sort((a, b) => segLen(b) - segLen(a));
  if (ctx.debug) ctx.debug.thick = [];
  for (const q of cands) {
    if (ctx.debug) ctx.debug.thick.push({ o: q.o, c: q.c * ctx.f, a: q.a * ctx.f, b: q.b * ctx.f, t: q.t * ctx.f, lw: faceWeight(q, ctx), ref: ctx.lineRef, outBefore: base, outAfter: outsideCells([...segs, q], ctx, g), need });
    // 和已有的墙重叠：都是这条厚墙里面的一截（一条墙线 + 别的）→ 换成厚墙；否则不要
    const clash = segs.filter((s) => s.o === q.o && Math.abs(s.c - q.c) < (s.t + q.t) / 2 + 2 && overlap(s.a, s.b, q.a, q.b) > 0.1 * segLen(s));
    if (clash.some((s) => s.c - s.t / 2 < q.c - q.t / 2 - 3 || s.c + s.t / 2 > q.c + q.t / 2 + 3 || s.a < q.a - q.t || s.b > q.b + q.t)) continue;
    if (ref && ctx.style !== 'solid' && faceWeight(q, ctx) < 0.62 * ref) continue;
    const rest = segs.filter((s) => !clash.includes(s));
    const n = outsideCells([...rest, q], ctx, g);
    if (base - n < need) continue;
    base = n;
    if (clash.length) {
      // 去掉被换掉的段（端点编号重排）
      const keep = segs.filter((s) => !clash.includes(s));
      const idx = new Map(segs.map((s, i) => [s, i]));
      const ni = new Map(keep.map((s, i) => [idx.get(s), i]));
      for (const s of keep) {
        s.endA = ni.has(s.endA) ? ni.get(s.endA) : -1;
        s.endB = ni.has(s.endB) ? ni.get(s.endB) : -1;
      }
      segs.length = 0;
      segs.push(...keep);
    }
    q.endA = -1;
    q.endB = -1;
    q.rawA = q.a;
    q.rawB = q.b;
    segs.push(q);
    const qi = segs.length - 1;
    // 吸附：新墙的两头 → 垂直的墙；别的墙悬空的头 → 新墙
    const tol = Math.max(2, 0.06 * pm);
    for (const end of ['a', 'b']) {
      let best = -1;
      let bd = 1e9;
      segs.forEach((p, j) => {
        if (p.o === q.o || q.c < p.a - p.t / 2 - tol || q.c > p.b + p.t / 2 + tol) return;
        const d = Math.abs(q[end] - p.c);
        if (d <= p.t / 2 + q.t / 2 + tol && d < bd) {
          bd = d;
          best = j;
        }
      });
      if (best >= 0) {
        q[end === 'a' ? 'endA' : 'endB'] = best;
        q[end] = segs[best].c;
      }
    }
    segs.forEach((s, j) => {
      if (s.o === q.o || j === qi) return;
      if (s.c < q.a - q.t / 2 - tol || s.c > q.b + q.t / 2 + tol) return;
      for (const end of ['a', 'b']) {
        const k = end === 'a' ? 'endA' : 'endB';
        if (s[k] >= 0) continue;
        if (Math.abs(s[end] - q.c) <= q.t / 2 + s.t / 2 + tol) {
          s[k] = qi;
          s[end] = q.c;
        }
      }
    });
  }
}

/** 同一条线上的几段（门洞隔开的）用同一个中线 */
function unifyLines(segs) {
  for (const o of ['h', 'v']) {
    const L = segs.filter((s) => s.o === o).sort((p, q) => p.c - q.c);
    let i = 0;
    while (i < L.length) {
      let j = i;
      while (j + 1 < L.length && L[j + 1].c - L[j].c <= Math.max(2, 0.3 * Math.max(L[j].t, L[j + 1].t))) j++;
      if (j > i) {
        const g = L.slice(i, j + 1);
        const tot = g.reduce((v, s) => v + Math.max(1, segLen(s)), 0);
        const c = g.reduce((v, s) => v + s.c * Math.max(1, segLen(s)), 0) / tot;
        for (const s of g) s.c = c;
      }
      i = j + 1;
    }
  }
}

// ───────────── 7. 门洞 / 开口 / 推拉门 / 窗 ─────────────

/** 墙段的矩形（工作图像素）→ 掩膜：门弧检查时，落在墙里的采样点不算 */
function wallMaskOf(segs, ctx) {
  const { w, h } = ctx;
  const M = new Uint8Array(w * h);
  for (const s of segs) {
    const half = s.t / 2 + 1;
    const [x0, x1, y0, y1] = s.o === 'h' ? [s.a, s.b, s.c - half, s.c + half] : [s.c - half, s.c + half, s.a, s.b];
    const i0 = clamp(Math.floor(x0), 0, w - 1);
    const i1 = clamp(Math.ceil(x1), 0, w);
    const j0 = clamp(Math.floor(y0), 0, h - 1);
    const j1 = clamp(Math.ceil(y1), 0, h);
    for (let j = j0; j < j1; j++) M.fill(1, j * w + i0, j * w + i1);
  }
  return M;
}

/**
 * 原图上（工作图坐标 x, y 那一块 f×f 像素里）有没有「淡墨」：比纸色暗 ≥ 一半阈值差。
 * 门弧常是很细的虚线 / 浅灰线，全局阈值会丢掉 —— 只在找门弧时用这个宽松的标准。
 */
function softInk(ctx, x, y) {
  const { img, T, f } = ctx;
  if (!ctx.softTb) {
    const tb = new Uint16Array(T.bg.length);
    for (let k = 0; k < T.bg.length; k++) tb[k] = Math.ceil(T.bg[k] - (T.bg[k] - (T.thr * T.bg[k]) / 255) * 0.55);
    ctx.softTb = tb;
  }
  const W = img.width;
  const H = img.height;
  const xi = Math.round(x);
  const yi = Math.round(y);
  const x0 = Math.max(0, Math.ceil(xi * f - 1e-9));
  const y0 = Math.max(0, Math.ceil(yi * f - 1e-9));
  const x1 = Math.min(W, Math.max(x0 + 1, Math.ceil((xi + 1) * f - 1e-9)));
  const y1 = Math.min(H, Math.max(y0 + 1, Math.ceil((yi + 1) * f - 1e-9)));
  for (let yy = y0; yy < y1; yy++) {
    const br = ((yy / T.B) | 0) * T.bw;
    for (let xx = x0; xx < x1; xx++) if (T.lum(yy * W + xx) < ctx.softTb[br + ((xx / T.B) | 0)]) return true;
  }
  return false;
}

/** 原始二值图上某点附近（半径 rad）有没有墨 */
function inkNear(ctx, x, y, rad = 1) {
  const { raw, w, h } = ctx;
  const xi = Math.round(x);
  const yi = Math.round(y);
  for (let dy = -rad; dy <= rad; dy++) {
    const yy = yi + dy;
    if (yy < 0 || yy >= h) continue;
    for (let dx = -rad; dx <= rad; dx++) {
      const xx = xi + dx;
      if (xx >= 0 && xx < w && raw[yy * w + xx]) return true;
    }
  }
  return false;
}

/** 3×3 线性方程组（高斯消元）→ [x0, x1, x2] 或 null */
function solve3(A, b) {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      for (let q = c; q < 4; q++) M[r][q] -= k * M[c][q];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/**
 * 门弧上每个角度碰到的墨 { cand: [r…], sn, cs }：找一个圆 r ≈ k0 + k1·sinθ + k2·cosθ（铰链偏了几个像素），
 * 让最多的角度在 tol 以内有墨 → 这样的角度数。先试常数半径（每个候选半径），再用最小二乘细调两遍。
 */
function arcInliers(rs, tol) {
  if (rs.length < 5) return 0;
  const near = (k, p) => {
    const m = k[0] + k[1] * p.sn + k[2] * p.cs;
    let best = null;
    for (const r of p.cand) if (best === null || Math.abs(r - m) < Math.abs(best - m)) best = r;
    return Math.abs(best - m) <= tol * 1.0001 ? best : null;
  };
  const count = (k) => rs.reduce((v, p) => v + (near(k, p) !== null ? 1 : 0), 0);
  // 常数半径：所有候选里挑命中最多的
  let k = null;
  let bestN = -1;
  const tried = new Set();
  for (const p of rs)
    for (const r of p.cand) {
      const key = Math.round(r / tol);
      if (tried.has(key)) continue;
      tried.add(key);
      const n = count([r, 0, 0]);
      if (n > bestN) {
        bestN = n;
        k = [r, 0, 0];
      }
    }
  if (!k) return 0;
  // 细调：用每个角度最近的候选做最小二乘（允许铰链偏一点）
  for (let pass = 0; pass < 2; pass++) {
    const A = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const b = [0, 0, 0];
    let n = 0;
    for (const p of rs) {
      const m = k[0] + k[1] * p.sn + k[2] * p.cs;
      let best = null;
      for (const r of p.cand) if (best === null || Math.abs(r - m) < Math.abs(best - m)) best = r;
      if (best === null || Math.abs(best - m) > 2 * tol) continue;
      n++;
      const v = [1, p.sn, p.cs];
      for (let i = 0; i < 3; i++) {
        b[i] += v[i] * best;
        for (let j = 0; j < 3; j++) A[i][j] += v[i] * v[j];
      }
    }
    if (n < 5) break;
    const k2 = solve3(A, b);
    if (!k2 || Math.abs(k2[1]) > 0.3 * k[0] || Math.abs(k2[2]) > 0.3 * k[0]) break;
    if (count(k2) >= count(k)) k = k2;
  }
  return count(k);
}

/** 门弧：铰链在 hinge（沿墙坐标），往 side 一侧开，半径 ≈ R。返回 { arc, leaf } 两个命中率（弧：每个角度上沿半径 0.8–1.08 R 找墨） */
function arcScore(ctx, s, hinge, other, side, R) {
  const face = s.c + (side * s.t) / 2;
  const P = (u, v) => (s.o === 'h' ? [u, v] : [v, u]); // (沿墙, 横截面) → (x, y)
  let hit = 0;
  let tot = 0;
  const N = Math.max(12, Math.round(R * 0.5));
  const dir = Math.sign(other - hinge);
  const r0 = 0.8 * R;
  const r1 = 1.08 * R;
  const dr = 1;
  const WM = ctx.wallMask;
  const inWall = (x, y) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    return !WM || xi < 0 || yi < 0 || xi >= ctx.w || yi >= ctx.h ? false : WM[yi * ctx.w + xi] === 1;
  };
  const rs = [];
  for (let i = 2; i < N - 1; i++) {
    const th = (i / N) * (Math.PI / 2);
    const sn = Math.sin(th);
    const cs = Math.cos(th);
    let wall = 0;
    const cand = []; // 这个角度上 0.8–1.08 R 之间每一段墨的中点半径
    let st = -1;
    for (let r = r0; r <= r1 + dr; r += dr) {
      const [x, y] = P(hinge + dir * r * sn, face + side * r * cs);
      let ink = false;
      if (r <= r1) {
        if (inWall(x, y)) wall++;
        else ink = inkNear(ctx, x, y, 0) || (ctx.photo && softInk(ctx, x, y));
      }
      if (ink && st < 0) st = r;
      if (!ink && st >= 0) {
        cand.push((st + r - dr) / 2);
        st = -1;
      }
    }
    if (!cand.length && wall > 0) continue; // 这个角度上全在墙里 / 一部分在墙里又没找到 → 不算
    tot++;
    if (cand.length) rs.push({ cand, sn, cs });
  }
  if (tot < 0.6 * (N - 3)) return { arc: 0, leaf: 0 };
  // 门弧是一条圆弧：碰到墨的半径要落在一个圆上（铰链差几个像素 → r ≈ R + a·sinθ + b·cosθ）；
  // 斜线填充 / 地砖格 / 楼梯踏步碰到的位置东一个西一个
  hit = arcInliers(rs, Math.max(2, 0.04 * R));
  let lh = 0;
  let lt = 0;
  for (let i = 3; i < N; i++) {
    const v = face + side * R * (i / N) * 0.9;
    const [cx0, cy0] = P(hinge + dir, v);
    if (inWall(cx0, cy0)) continue;
    lt++;
    for (const du of [0, 1, 2, -1, 3]) {
      const [x, y] = P(hinge + dir * du, v);
      if (inkNear(ctx, x, y, 0)) {
        lh++;
        break;
      }
    }
  }
  return { arc: tot ? hit / tot : 0, leaf: lt ? lh / lt : 0, any: tot ? rs.length / tot : 0 };
}

/**
 * 缺口里是玻璃：在原图分辨率上看平行于墙的线（推拉门两条轨道只差 2–5 cm，工作图上会并成一条）。
 * 推拉门 = 墙厚中间两条以上的轨道、一扇一扇错开（每条只盖一部分、合起来盖满），或者正好两条贯通的线都在墙厚中间；
 * 窗 = 三条以上贯通的线，或者两条贯通的线（窗框）在墙面上（百叶窗：中间是斜线）。
 */
function glazing(ctx, s, a, b, weak = false) {
  const L = tracksInGap(ctx, s, a, b);
  // 弱的证据（低清 / 复印：推拉门错开的两条轨道糊成一条）：墙厚中间一条一整截贯通的线 —— 门洞先认过了，不是门才这样算；
  // 只有这一条线（旁边还有一条盖了一大截的线 → 是两条线画的东西：浴室挡水 / 台面 / 管井，不是糊掉的轨道）
  if (weak) {
    const one = L.tracks.filter((q) => Math.abs(q.pos) <= 0.35 * s.t && q.cov >= 0.9 && q.runs === 1);
    const other = L.tracks.filter((q) => !one.includes(q) && q.cov >= 0.3);
    return one.length === 1 && !other.length ? ((b - a) / ctx.pm >= 1.8 ? 'slider' : 'window') : null;
  }
  const t = s.t;
  // 点划线（轴线穿过窗 / 门洞）不是玻璃
  const lines = L.tracks.filter((q) => q.cov >= 0.85 || q.runs <= 3);
  const full = lines.filter((q) => q.cov >= 0.85);
  const mids = lines.filter((q) => Math.abs(q.pos) <= 0.35 * t && q.cov >= 0.3);
  const midCover = mids.length >= 2 ? unionCover(L, mids) : 0;
  let kind = null;
  // 两个墙面上都有贯通的窗框线 → 窗；推拉门：墙厚中间的轨道合起来盖满、至少一条只盖一部分（一扇一整截，不是点划线）
  const frame = full.some((q) => q.pos < -0.35 * t) && full.some((q) => q.pos > 0.35 * t);
  if (frame && full.length >= 3) kind = 'window';
  else if (mids.length >= 2 && midCover >= 0.85 && mids.some((q) => q.cov < 0.85 && q.runs <= 2)) kind = 'slider';
  else if (full.length >= 3) kind = 'window';
  else if (full.length === 2) kind = full.every((q) => Math.abs(q.pos) <= 0.35 * t) ? 'slider' : 'window';
  if (ctx.debug) (ctx.debug.glazLog = ctx.debug.glazLog || []).push({ o: s.o, c: s.c * ctx.f, a: a * ctx.f, b: b * ctx.f, t: s.t * ctx.f, cover: L.cover, lines: full.length, mid: mids.length, kind, prof: L.tracks.map((q) => `${(q.pos / ctx.pm).toFixed(3)}:${q.cov.toFixed(2)}:${q.runs}`) });
  return kind;
}

/**
 * 缺口里平行于墙的线（原图分辨率）。返回 { cover: 有墨的位置比例, tracks: [{ pos: 离墙中线（工作像素）, cov: 这条线盖住的比例, r0, r1 }], n, nv, ink }
 */
function tracksInGap(ctx, s, a, b) {
  const { img, T, f } = ctx;
  const W = img.width;
  const H = img.height;
  const { thr, bg, bw, B, lum } = T;
  const isInk = (x, y) => x >= 0 && y >= 0 && x < W && y < H && lum(y * W + x) * 255 < thr * bg[((y / B) | 0) * bw + ((x / B) | 0)];
  const marg = Math.max(1, Math.round(0.03 * ctx.pm * f));
  const u0 = Math.round(a * f) + marg;
  const u1 = Math.round(b * f) - marg;
  const v0 = Math.floor((s.c - s.t / 2 - 1) * f);
  const v1 = Math.ceil((s.c + s.t / 2 + 1) * f);
  const nu = u1 - u0;
  const nv = v1 - v0;
  if (nu < 3 || nv < 2) return { cover: 0, tracks: [] };
  const stepU = Math.max(1, Math.floor(f / 2));
  const us = [];
  for (let u = u0; u < u1; u += stepU) us.push(u);
  const n = us.length;
  const ink = new Uint8Array(n * nv);
  const rowCov = new Float64Array(nv);
  let covered = 0;
  for (let i = 0; i < n; i++) {
    let any = 0;
    for (let j = 0; j < nv; j++) {
      const v = v0 + j;
      if (s.o === 'h' ? isInk(us[i], v) : isInk(v, us[i])) {
        ink[i * nv + j] = 1;
        rowCov[j]++;
        any = 1;
      }
    }
    covered += any;
  }
  // 相邻的行（每行盖住 ≥ 25 %）并成一条线
  const tracks = [];
  for (let j = 0; j < nv; ) {
    if (rowCov[j] / n < 0.25) {
      j++;
      continue;
    }
    const r0 = j;
    while (j < nv && rowCov[j] / n >= 0.25) j++;
    let c = 0;
    // 这条线断成几截（隔 ≤ 2 个采样的不算断）：点划线（轴线 / 中心线）是很多短截，推拉门的一扇是一整截
    let runs = 0;
    let last = -10;
    for (let i = 0; i < n; i++) {
      let hit = false;
      for (let q = r0; q < j; q++)
        if (ink[i * nv + q]) {
          hit = true;
          break;
        }
      if (!hit) continue;
      c++;
      if (i - last > 3) runs++;
      last = i;
    }
    tracks.push({ pos: (v0 + (r0 + j) / 2) / f - s.c, cov: c / n, r0, r1: j, runs });
  }
  return { cover: covered / n, tracks, n, nv, ink };
}

/**
 * 墙带里面（原图分辨率）一截 [a, b) 的「斜线填充」程度：最外两条贯通的线（墙面 / 窗框）之间的行里，
 * 只被盖住一部分（10–80 %）的行的比例。玻璃 = 贯通的线 + 空行 → 低；斜线填充 → 高。
 */
function hatchRows(ctx, s, a, b) {
  const L = tracksInGap(ctx, s, a, b);
  if (!L.n) return 0;
  const { n, nv, ink } = L;
  const cov = new Float64Array(nv);
  for (let i = 0; i < n; i++) for (let j = 0; j < nv; j++) cov[j] += ink[i * nv + j];
  let j0 = 0;
  while (j0 < nv && cov[j0] < 0.85 * n) j0++;
  let j1 = nv - 1;
  while (j1 > j0 && cov[j1] < 0.85 * n) j1--;
  if (j1 - j0 < 3) return 0;
  let part = 0;
  for (let j = j0 + 1; j < j1; j++) if (cov[j] >= 0.03 * n && cov[j] < 0.8 * n) part++;
  return part / (j1 - j0 - 1);
}

/** 几条线合起来盖住的比例 */
function unionCover(L, tr) {
  const { n, nv, ink } = L;
  let c = 0;
  for (let i = 0; i < n; i++) {
    let hit = 0;
    for (const q of tr) {
      for (let j = q.r0; j < q.r1 && !hit; j++) if (ink[i * nv + j]) hit = 1;
      if (hit) break;
    }
    c += hit;
  }
  return n ? c / n : 0;
}

/** 门扇：从墙面（铰链处）垂直出去的一条线有多长（允许 2 像素的断） */
function leafRun(ctx, s, h, side) {
  const face = s.c + (side * s.t) / 2;
  const P = (u, v) => (s.o === 'h' ? [u, v] : [v, u]);
  const WM = ctx.wallMask;
  const maxL = DOOR_W.max * 1.25 * ctx.pm;
  let best = 0;
  for (const du of [0, -1, 1]) {
    let last = 0;
    let miss = 0;
    for (let k = 1; k <= maxL; k++) {
      const [x, y] = P(h + du, face + side * k);
      const xi = Math.round(x);
      const yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= ctx.w || yi >= ctx.h) break;
      const i = yi * ctx.w + xi;
      if (ctx.raw[i] || (WM && WM[i] && k < 3)) {
        last = k;
        miss = 0;
      } else if (++miss > 2) break;
    }
    if (last > best) best = last;
  }
  return best;
}

/** 门：找门扇（从墙面垂直出去、长 ≈ 门宽的线）+ 四分之一圆弧；铰链可以离开口的端点一小段（门边的短墙垛没认出来时） */
function findDoor(ctx, s, a, b, hints) {
  const { pm } = ctx;
  const span = b - a;
  const dmin = (hints.doorMin || DOOR_W.min) * pm;
  const dmax = (hints.doorMax || DOOR_W.max) * pm;
  const maxShift = Math.min(0.4 * pm, span * 0.45);
  let best = null;
  for (const side of [-1, 1])
    for (const end of ['a', 'b'])
      for (let d = 0; d <= maxShift; d += 1) {
        const h = end === 'a' ? a + d : b - d;
        const L = leafRun(ctx, s, h, side);
        if (L < dmin * 0.85 || L > dmax * 1.1) continue;
        const other = end === 'a' ? h + L : h - L;
        if (other > b + 0.15 * pm || other < a - 0.15 * pm) continue;
        const sc = arcScore(ctx, s, h, other, side, L);
        const v = sc.arc + 0.5 * sc.leaf - d / pm;
        if (!best || v > best.v) best = { v, ...sc, h, other, side, end };
      }
  if (ctx.debug) (ctx.debug.gapLog = ctx.debug.gapLog || []).push({ o: s.o, c: s.c * ctx.f, a: a * ctx.f, b: b * ctx.f, best });
  // 门弧：工作图 ≥ 70 px/m 时弧是完整的一条线 → 要 70 % 的角度都碰上（字、符号、别的门弧碰巧落在圆上的只有 60 % 左右）；更粗的图弧断断续续 → 60 %
  const arcMin = pm >= 70 ? 0.7 : 0.6;
  if (best && best.arc >= arcMin && best.leaf >= 0.6) {
    const p = Math.max(a, Math.min(best.h, best.other));
    const q = Math.min(b, Math.max(best.h, best.other));
    // 双开门（大门）：缺口另一头还有一扇往同一边开的，两扇在中间碰头
    const rem = best.end === 'a' ? b - q : p - a;
    const L1 = q - p;
    if (rem >= Math.max(0.6 * L1, dmin * 0.7)) {
      let second = null;
      for (let d = 0; d <= Math.min(maxShift, 0.25 * rem); d += 1) {
        const h2 = best.end === 'a' ? b - d : a + d;
        const L2 = leafRun(ctx, s, h2, best.side);
        if (L2 < 0.7 * rem || L2 > 1.3 * rem + 0.1 * pm) continue;
        const sc = arcScore(ctx, s, h2, best.end === 'a' ? h2 - L2 : h2 + L2, best.side, L2);
        if (sc.arc >= 0.6 && sc.leaf >= 0.6 && (!second || sc.arc > second.arc)) second = sc;
      }
      if (second) return { kind: 'door', arc: true, double: true, a, b, swing: { hinge: 'ab', side: best.side } };
    }
    return { kind: 'door', arc: true, a: p, b: q, swing: { hinge: best.h < best.other ? 'a' : 'b', side: best.side }, score: best.arc };
  }
  // 没画门扇（只有弧）：铰链在开口两端、半径 = 开口宽
  if (span >= dmin * 0.9 && span <= dmax * 1.1) {
    let b2 = null;
    for (const [hinge, other] of [
      [a, b],
      [b, a],
    ])
      for (const side of [-1, 1]) {
        const sc = arcScore(ctx, s, hinge, other, side, span);
        if (!b2 || sc.arc > b2.arc) b2 = { ...sc, hinge: hinge === a ? 'a' : 'b', side };
      }
    if (b2 && b2.arc >= 0.85) return { kind: 'door', arc: true, swing: { hinge: b2.hinge, side: b2.side } };
  }
  // 双开门：两边各一扇，各半宽
  if (span >= 2 * dmin * 0.9 && span <= (hints.doorDouble || DOOR_W.double) * pm) {
    for (const side of [-1, 1]) {
      const s1 = arcScore(ctx, s, a, b, side, span / 2);
      const s2 = arcScore(ctx, s, b, a, side, span / 2);
      if (s1.arc >= 0.6 && s2.arc >= 0.6 && s1.leaf >= 0.5 && s2.leaf >= 0.5) return { kind: 'door', arc: true, double: true, swing: { hinge: 'ab', side } };
    }
  }
  return null;
}

/**
 * 缺口和楼梯的关系：'side' = 沿着楼梯的长边（扶手 / 栏杆那边）、'inside' = 横穿楼梯中间（和踏步平行）、
 * 'end' = 楼梯的上下口、null = 不挨着楼梯
 */
function stairRel(ctx, s, a, b) {
  const reach = 0.3 * ctx.pm;
  for (const r of ctx.stairs || []) {
    // 楼梯的长边（走的方向）：'ns' 的踏步是横线 → 上下走 → 长边是竖的
    const sideV = r.dir === 'ns';
    const [c0, c1, a0, a1] = s.o === 'h' ? [r.y, r.y + r.h, r.x, r.x + r.w] : [r.x, r.x + r.w, r.y, r.y + r.h];
    if (s.c < c0 - reach || s.c > c1 + reach) continue;
    const ov = overlap(a, b, a0, a1);
    if (ov < 0.5 * (b - a) && ov < 0.7 * (a1 - a0)) continue;
    if ((s.o === 'v') === sideV) return Math.abs(s.c - c0) <= reach || Math.abs(s.c - c1) <= reach ? 'side' : 'inside';
    return Math.abs(s.c - c0) <= reach || Math.abs(s.c - c1) <= reach ? 'end' : 'inside';
  }
  return null;
}

/** 墙线（o, c）上沿墙坐标 u 的一点挨着楼梯（在楼梯框里或离框边 ≤ 0.3 m） */
function nearStair(ctx, o, c, u) {
  const reach = 0.3 * ctx.pm;
  const [x, y] = o === 'h' ? [u, c] : [c, u];
  return (ctx.stairs || []).some((r) => x >= r.x - reach && x <= r.x + r.w + reach && y >= r.y - reach && y <= r.y + r.h + reach);
}

function classifyGap(ctx, s, a, b, hints) {
  const { pm } = ctx;
  const gm = (b - a) / pm;
  // 楼梯的长边（扶手）、楼梯中间：不是墙上的开口（踏步 / 扶手也不是玻璃）；上下口只认有门弧的门
  const st = stairRel(ctx, s, a, b);
  if (st === 'side' || st === 'inside') return null;
  // 先看玻璃：窗 / 推拉门的线横跨整个缺口，门洞里没有（门扇垂直于墙）→ 窗台上的灶台、洗手盆不会被当成门扇 + 门弧
  const gl = !st && gm >= 0.4 && gm <= GLAZING_MAX ? glazing(ctx, s, a, b) : null;
  if (gl) return { kind: gl, arc: false };
  if (gm >= (hints.doorMin || DOOR_W.min) * 0.8 && gm <= (hints.doorDouble || DOOR_W.double) * 1.1) {
    const d = findDoor(ctx, s, a, b, hints);
    if (d) return d;
  }
  if (st) return null;
  const weak = gm >= 0.4 && gm <= GLAZING_MAX ? glazing(ctx, s, a, b, true) : null;
  if (weak) return { kind: weak, arc: false, weak: true };
  if (gm >= 0.45 && gm <= OPENING_MAX) return { kind: 'opening', arc: false };
  return null;
}

/**
 * 同一条线上相邻两段之间的空 = 开口；一段的自由端到垂直墙的墙面之间（门挨着墙角）也算。
 * 开口所在的墙段合成一段（a..b 盖过开口）。返回 [{ seg, a, b, kind, arc, double? }]，并就地改 segs。
 */
function findGaps(segs, ctx, hints) {
  const { pm } = ctx;
  ctx.wallMask = wallMaskOf(segs, ctx);
  const gaps = [];
  // 1. 同线相邻（空着的开口最后再定：要两边的墙段「站得住」）
  const pendingOpen = [];
  for (const o of ['h', 'v']) {
    const lines = new Map();
    for (const s of segs) if (s.o === o) {
      let key = null;
      for (const [k, arr] of lines) if (Math.abs(arr[0].c - s.c) <= Math.max(2, 0.3 * Math.max(arr[0].t, s.t))) key = k;
      if (key == null) lines.set(lines.size, [s]);
      else lines.get(key).push(s);
    }
    for (const arr of lines.values()) {
      arr.sort((p, q) => p.a - q.a);
      for (let i = 0; i + 1 < arr.length; i++) {
        const A = arr[i];
        const Bs = arr[i + 1];
        const g = Bs.a - A.b;
        if (g <= 0 || g > GLAZING_MAX * pm) continue;
        const t = (A.t + Bs.t) / 2;
        const probe = { o, c: A.c, t };
        const cl = classifyGap(ctx, probe, A.b, Bs.a, hints);
        if (!cl) continue;
        if (cl.kind === 'opening') pendingOpen.push({ A, Bs, cl });
        else A.joinNext = { seg: Bs, ...cl, a: cl.a ?? A.b, b: cl.b ?? Bs.a };
      }
    }
  }
  // 2. 端点 → 前面垂直墙的墙面（门挨着墙角 / T 口）：用吸附前的端点
  const tol = Math.max(2, 0.06 * pm);
  // 用开口接起来的一整条墙的长度
  const chainLen = (s) => {
    let a0 = s.a;
    let b0 = s.b;
    let cur = s;
    for (let k = 0; k < segs.length && cur.joinNext; k++) {
      cur = cur.joinNext.seg;
      b0 = Math.max(b0, cur.b);
    }
    cur = s;
    for (let k = 0; k < segs.length; k++) {
      const prev = segs.find((q) => q.joinNext && q.joinNext.seg === cur);
      if (!prev) break;
      cur = prev;
      a0 = Math.min(a0, cur.a);
    }
    return b0 - a0;
  };
  segs.forEach((s) => {
    for (const end of ['a', 'b']) {
      if (end === 'b' && s.joinNext) continue;
      if (end === 'a' && segs.some((q) => q.joinNext && q.joinNext.seg === s)) continue;
      let e = end === 'a' ? s.rawA : s.rawB;
      const e0 = e;
      const dir = end === 'a' ? -1 : 1;
      const crosses = (p) => p.o !== s.o && s.c >= p.a - p.t / 2 - tol && s.c <= p.b + p.t / 2 + tol;
      // 端点在一面垂直墙里（T 口）→ 从那面墙的另一边算起
      for (const p of segs) if (crosses(p) && Math.abs(e - p.c) <= p.t / 2 + tol) e = dir > 0 ? Math.max(e, p.c + p.t / 2) : Math.min(e, p.c - p.t / 2);
      let best = null;
      segs.forEach((p, pi) => {
        if (!crosses(p)) return;
        const face = p.c - (dir * p.t) / 2;
        const g = (face - e) * dir;
        if (g < -1) return; // 在端点后面
        if (!best || g < best.g) best = { p, pi, face, g };
      });
      // 前面第一面垂直的墙，离得正好一个门宽
      if (!best || best.g < DOOR_W.min * 0.85 * pm || best.g > DOOR_W.max * 1.1 * pm) continue;
      // 中间不能有别的同线墙段
      const a = Math.min(e, best.face);
      const b = Math.max(e, best.face);
      if (segs.some((q) => q !== s && q.o === s.o && Math.abs(q.c - s.c) <= Math.max(2, 0.3 * q.t) && overlap(q.a, q.b, a, b) > 2)) continue;
      const cl = classifyGap(ctx, s, a, b, hints);
      // 没门弧的门宽空当（低清图上门弧淡得看不见）：墙段自己够长（≥ 1 m）才算开口，免得把散的短线接到墙上
      // 端点悬空（不是穿过一面墙的 T 口）才行
      const openOk = cl && cl.kind === 'opening' && e === e0 && chainLen(s) >= pm && b - a <= DOOR_W.max * pm;
      if (cl && (cl.kind === 'door' || cl.kind === 'slider' || cl.kind === 'window' || openOk)) {
        s.virt = s.virt || {};
        s.virt[end] = { to: best.p.c, pi: best.pi, ...cl, a: cl.a ?? a, b: cl.b ?? b };
      }
    }
  });
  // 1b. 空着的开口（没有门弧 / 玻璃）：两边都要是像样的墙段 —— 够长（≥ 1 m），或者另一头接在墙上 / 接着门窗；
  //     尺寸线的短斜杠、轴线圆圈两头悬空 → 不连
  const joinedPrev = (q) => segs.some((x) => x.joinNext && x.joinNext.seg === q);
  const stands = (q, far) => segLen(q) >= pm || (segLen(q) >= 0.05 * pm && (q[far === 'a' ? 'endA' : 'endB'] >= 0 || q.virt?.[far] || (far === 'a' ? joinedPrev(q) : !!q.joinNext)));
  for (const { A, Bs, cl } of pendingOpen) {
    if (A.joinNext) continue;
    // 空着的一段两头都顶着垂直的墙 / 楼梯（整整一跨没有墙：走廊口、厨房对餐厅、楼梯口）→ 那里本来就没有墙，不是墙上的开口
    if ((A.endB >= 0 || nearStair(ctx, A.o, A.c, A.b)) && (Bs.endA >= 0 || nearStair(ctx, Bs.o, Bs.c, Bs.a))) continue;
    if (stands(A, 'a') && stands(Bs, 'b')) A.joinNext = { seg: Bs, ...cl, a: cl.a ?? A.b, b: cl.b ?? Bs.a };
  }
  // 3. 合并：一条线上用开口连起来的几段 → 一段墙
  const out = [];
  const absorbed = new Set();
  const merged = [];
  for (const s of segs) {
    if (absorbed.has(s)) continue;
    // 找到链头（没有别人的 joinNext 指向它）
    if (segs.some((q) => q.joinNext && q.joinNext.seg === s)) continue;
    const parts = [s];
    const ops = [];
    let cur = s;
    while (cur.joinNext) {
      ops.push(cur.joinNext);
      cur = cur.joinNext.seg;
      parts.push(cur);
    }
    for (const p of parts) absorbed.add(p);
    const tot = parts.reduce((v, p) => v + p.n, 0);
    const m = {
      ...s,
      a: Math.min(...parts.map((p) => p.a)),
      b: Math.max(...parts.map((p) => p.b)),
      n: tot,
      t: median(parts.flatMap((p) => Array(Math.max(1, Math.round(p.n / 8))).fill(p.t))),
      multi: parts.reduce((v, p) => v + p.multi * p.n, 0) / tot,
      solid: parts.reduce((v, p) => v + p.solid * p.n, 0) / tot,
      pair: parts.reduce((v, p) => v + p.pair * p.n, 0) / tot,
      endA: parts[0].endA,
      endB: parts[parts.length - 1].endB,
      parts: parts.flatMap((p) => p.parts || [p]),
      direct: parts,
      ops: ops.map((g) => ({ a: g.a, b: g.b, kind: g.kind, arc: g.arc, double: g.double, swing: g.swing, score: g.score })),
    };
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (first.virt?.a) {
      m.ops.unshift({ a: first.virt.a.a, b: first.virt.a.b, kind: first.virt.a.kind, arc: first.virt.a.arc, double: first.virt.a.double, swing: first.virt.a.swing, score: first.virt.a.score });
      m.a = first.virt.a.to;
      m.endA = first.virt.a.pi;
    }
    if (last.virt?.b) {
      m.ops.push({ a: last.virt.b.a, b: last.virt.b.b, kind: last.virt.b.kind, arc: last.virt.b.arc, double: last.virt.b.double, swing: last.virt.b.swing, score: last.virt.b.score });
      m.b = last.virt.b.to;
      m.endB = last.virt.b.pi;
    }
    merged.push(m);
  }
  // 端点编号：原来指向的段 → 合并后的段
  const where = new Map();
  merged.forEach((m, i) => {
    for (const p of m.direct || [m]) where.set(p, i);
  });
  const origIdx = segs;
  for (const m of merged) {
    m.endA = m.endA >= 0 ? (where.get(origIdx[m.endA]) ?? -1) : -1;
    m.endB = m.endB >= 0 ? (where.get(origIdx[m.endB]) ?? -1) : -1;
  }
  segs.length = 0;
  segs.push(...merged);
  segs.forEach((s, i) => {
    for (const g of s.ops || []) out.push({ seg: i, ...g });
  });
  return out;
}

/** 同一扇门在两条挨着的平行墙带上各认了一次（照片上一面墙的两条线分成两段）→ 留门弧更像的那个 */
function dedupeDoors(gaps, segs, ctx) {
  const reach = 0.35 * ctx.pm;
  const drop = new Set();
  for (let i = 0; i < gaps.length; i++)
    for (let j = i + 1; j < gaps.length; j++) {
      const g = gaps[i];
      const k = gaps[j];
      if (g.kind !== 'door' || k.kind !== 'door' || drop.has(i) || drop.has(j)) continue;
      const s = segs[g.seg];
      const t = segs[k.seg];
      if (!s || !t || s.o !== t.o || g.seg === k.seg || Math.abs(s.c - t.c) > reach) continue;
      if (overlap(g.a, g.b, k.a, k.b) < 0.5 * Math.min(g.b - g.a, k.b - k.a)) continue;
      // 门弧差不多一样像 → 留在「真的墙」上的那个（门洞外面还有墙的那段；另一条往往是门框 / 墙角的一小截）
      const sg = g.score ?? 1;
      const sk = k.score ?? 1;
      const wallOf = (q, sq) => segLen(sq) - (q.b - q.a);
      drop.add((Math.abs(sg - sk) > 0.05 ? sg > sk : wallOf(g, s) >= wallOf(k, t)) ? j : i);
    }
  if (!drop.size) return gaps;
  // 认重了的那一段墙如果差不多就是这扇门（门两边各不到 0.3 m）→ 墙也不要（它是门框 / 另一条墙线读出来的）
  const gone = new Set();
  for (const i of drop) {
    const g = gaps[i];
    const s = segs[g.seg];
    if (s && segLen(s) <= g.b - g.a + 0.6 * ctx.pm && !gaps.some((q, j) => j !== i && !drop.has(j) && q.seg === g.seg)) gone.add(g.seg);
  }
  const keep = gaps.filter((g, i) => !drop.has(i));
  if (!gone.size) return keep;
  const idx = new Map();
  const kept = segs.filter((s, i) => !gone.has(i));
  segs.forEach((s, i) => {
    if (!gone.has(i)) idx.set(i, idx.size);
  });
  for (const s of kept) {
    s.endA = idx.has(s.endA) ? idx.get(s.endA) : -1;
    s.endB = idx.has(s.endB) ? idx.get(s.endB) : -1;
  }
  segs.length = 0;
  segs.push(...kept);
  return keep.map((g) => ({ ...g, seg: idx.get(g.seg) }));
}

/**
 * 一段墙中间的窗：墙带里面（去掉两边的线）有一条「贯通」的细线（玻璃）≥ 0.35 m，那一截墙不是实心的，
 * 两头有窗框（横穿墙厚的线 / 实心墙的断面）。斜线填充（每行只有零星的点）、轴线的虚线（两头没有窗框）不算。
 */
function findWindows(segs, ctx) {
  const { pm, raw, rawT, w, h } = ctx;
  const out = [];
  const m = Math.max(1, Math.round(0.035 * pm));
  const minLen = 0.35 * pm;
  segs.forEach((s, si) => {
    // 粗细分得开的图：墙带里的「玻璃线」要是粗笔（细笔画的窗，墙面线在那里断开 → findGaps 认）；
    // 斜线填充、穿过墙的轴线、百叶都是细笔 → 不会当成玻璃
    const M = ctx.glass ? (s.o === 'h' ? ctx.glassT : ctx.glass) : s.o === 'h' ? rawT : raw;
    const Wd = s.o === 'h' ? h : w;
    const Hd = s.o === 'h' ? w : h;
    let v0 = clamp(Math.round(s.c - s.t / 2 + m), 0, Wd - 1);
    let v1 = clamp(Math.round(s.c + s.t / 2 - m), v0 + 1, Wd);
    const b0 = clamp(Math.round(s.c - s.t / 2), 0, Wd - 1);
    const b1 = clamp(Math.round(s.c + s.t / 2), b0 + 1, Wd);
    const a = clamp(Math.round(s.a), 0, Hd - 1);
    const b = clamp(Math.round(s.b), a + 1, Hd);
    if (v1 - v0 < 1 || b - a < minLen) return;
    const n = b - a;
    const filled = new Uint8Array(n);
    for (let u = a; u < b; u++) {
      let k = 0;
      for (let v = v0; v < v1; v++) k += M[u * Wd + v];
      filled[u - a] = k >= 0.6 * (v1 - v0) ? 1 : 0;
    }
    // 实心的图：两段实心墙垛之间只有两三条贯通的细线（窗 / 推拉门画得很简单，没有中间的玻璃线）
    const pre = [];
    if (ctx.style === 'solid') {
      const e0 = clamp(b0 - 2, 0, Wd - 1);
      const e1 = clamp(b1 + 2, e0 + 1, Wd);
      let u = a;
      while (u < b) {
        if (filled[u - a]) {
          u++;
          continue;
        }
        const st = u;
        while (u < b && !filled[u - a]) u++;
        const en = u;
        if (st === a || en === b || en - st < 0.4 * pm) continue;
        if ((s.ops || []).some((g) => overlap(st, en, g.a, g.b) > 0.3 * (en - st))) continue;
        let lines = 0;
        let prev = false;
        for (let v = e0; v < e1; v++) {
          let k = 0;
          for (let uu = st; uu < en; uu++) k += M[uu * Wd + v];
          const full = k >= 0.85 * (en - st);
          if (full && !prev) lines++;
          prev = full;
        }
        // 斜线填充糊成的「半实心」也会这样：原图上看两条线之间要是空的
        if (lines >= 2 && hatchRows(ctx, s, st, en) <= 0.25) pre.push([st, en]);
      }
      for (const [p, q] of pre) out.push({ seg: si, a: p, b: q, kind: 'window', arc: false });
    }
    // 粗笔的墨里找的墙：窗的墙面线在窗那里断开（细笔画的窗框 / 玻璃）→ 是缺口，findGaps 认过了；
    // 连着的墙带里面的「玻璃线」只会是斜线填充 / 轴线 / 家具线挤出来的，不找
    if (ctx.glass) return;
    // 玻璃线要在两条墙皮线「里面」：沿墙（不实心、不是门洞的地方）每一行的墨量，从两边往里跳过墙皮线（照片上墙皮线粗、
    // 墙厚量得不准，空心墙自己的两条线不能当成玻璃）
    {
      const e0 = clamp(b0 - 2, 0, Wd - 1);
      const e1 = clamp(b1 + 2, e0 + 1, Wd);
      const prof = new Float64Array(e1 - e0);
      const ops = (s.ops || []).map((g) => [g.a, g.b]);
      let cnt = 0;
      for (let u = a; u < b; u++) {
        if (filled[u - a] || ops.some(([x0, x1]) => u >= x0 && u < x1)) continue;
        cnt++;
        const r = u * Wd;
        for (let v = e0; v < e1; v++) prof[v - e0] += M[r + v];
      }
      if (cnt < minLen) return;
      const thr = 0.5 * cnt;
      let i0 = 0;
      while (i0 < prof.length && prof[i0] < thr) i0++;
      if (i0 < prof.length && e0 + i0 <= s.c) while (i0 < prof.length && prof[i0] >= thr) i0++;
      else i0 = 0;
      let i1 = prof.length - 1;
      while (i1 >= 0 && prof[i1] < thr) i1--;
      if (i1 >= 0 && e0 + i1 >= s.c) while (i1 >= 0 && prof[i1] >= thr) i1--;
      else i1 = prof.length - 1;
      v0 = Math.max(v0, e0 + i0);
      v1 = Math.min(v1, e0 + i1 + 1);
      if (v1 - v0 < 1) return;
    }
    // 每一行：不实心的位置上的长墨段（允许 1 像素断）= 玻璃线
    const cand = [];
    for (let v = v0; v < v1; v++) {
      let u = a;
      while (u < b) {
        if (!M[u * Wd + v] || filled[u - a]) {
          u++;
          continue;
        }
        const st = u;
        let last = u;
        while (u < b && !filled[u - a] && (M[u * Wd + v] || u - last <= 1)) {
          if (M[u * Wd + v]) last = u;
          u++;
        }
        if (last + 1 - st >= minLen) cand.push([st, last + 1]);
      }
    }
    if (!cand.length) return;
    cand.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const c of cand) {
      const lst = merged[merged.length - 1];
      if (lst && c[0] <= lst[1] + 2) lst[1] = Math.max(lst[1], c[1]);
      else merged.push([...c]);
    }
    const busy = [...(s.ops || []).map((g) => [g.a, g.b]), ...pre];
    // 横截面被墨盖住的比例（窗框 / 实心墙断面），在 u 附近 ±3 像素找最大的
    const cross = (u) => {
      let best = 0;
      for (let du = -3; du <= 3; du++) {
        const uu = u + du;
        if (uu < 0 || uu >= Hd) continue;
        let k = 0;
        for (let v = b0; v < b1; v++) k += M[uu * Wd + v];
        best = Math.max(best, k / (b1 - b0));
      }
      return best;
    };
    for (const [p, q] of merged) {
      if (busy.some(([x0, x1]) => overlap(p, q, x0, x1) > 0.3 * (q - p))) continue;
      if (cross(p) < 0.75 || cross(q - 1) < 0.75) continue;
      // 玻璃线之间是空的（原图上看）：斜线填充（工作图上糊成一片）的每一行都有一截截的墨
      const hr = hatchRows(ctx, s, p, q);
      if (ctx.debug) (ctx.debug.winLog = ctx.debug.winLog || []).push({ o: s.o, c: s.c * ctx.f, a: p * ctx.f, b: q * ctx.f, hr, v: [v0 - s.c, v1 - s.c, b0 - s.c, b1 - s.c].map((x) => +x.toFixed(1)), rows: cand.filter((c) => overlap(c[0], c[1], p, q) > 0).length });
      if (hr > 0.25) continue;
      out.push({ seg: si, a: p, b: q, kind: 'window', arc: false });
    }
  });
  return out;
}

// ───────────── 8. 外墙 ─────────────

function rasterWalls(segs, ctx, g) {
  const { w, h } = ctx;
  const gw = Math.ceil(w / g);
  const gh = Math.ceil(h / g);
  const R = new Uint8Array(gw * gh);
  for (const s of segs) {
    const half = Math.max(s.t / 2, g * 0.75);
    let x0, x1, y0, y1;
    if (s.o === 'h') {
      x0 = s.a - half;
      x1 = s.b + half;
      y0 = s.c - half;
      y1 = s.c + half;
    } else {
      x0 = s.c - half;
      x1 = s.c + half;
      y0 = s.a - half;
      y1 = s.b + half;
    }
    const i0 = clamp(Math.floor(x0 / g), 0, gw - 1);
    const i1 = clamp(Math.ceil(x1 / g) - 1, 0, gw - 1);
    const j0 = clamp(Math.floor(y0 / g), 0, gh - 1);
    const j1 = clamp(Math.ceil(y1 / g) - 1, 0, gh - 1);
    for (let j = j0; j <= j1; j++) R.fill(1, j * gw + i0, j * gw + i1 + 1);
  }
  return { R, gw, gh };
}

/** 空地连通域（4 连通）。返回 { lab: Int32Array（0 = 墙，1 = 外面，2.. = 面）, n } */
function labelFree(R, gw, gh) {
  const lab = new Int32Array(gw * gh);
  const q = new Int32Array(gw * gh);
  let n = 1;
  const outside = 1;
  const fill = (start, id) => {
    let qh = 0;
    let qt = 0;
    q[qt++] = start;
    lab[start] = id;
    let cnt = 0;
    while (qh < qt) {
      const k = q[qh++];
      cnt++;
      const x = k % gw;
      const y = (k - x) / gw;
      if (x > 0 && !R[k - 1] && !lab[k - 1]) {
        lab[k - 1] = id;
        q[qt++] = k - 1;
      }
      if (x < gw - 1 && !R[k + 1] && !lab[k + 1]) {
        lab[k + 1] = id;
        q[qt++] = k + 1;
      }
      if (y > 0 && !R[k - gw] && !lab[k - gw]) {
        lab[k - gw] = id;
        q[qt++] = k - gw;
      }
      if (y < gh - 1 && !R[k + gw] && !lab[k + gw]) {
        lab[k + gw] = id;
        q[qt++] = k + gw;
      }
    }
    return cnt;
  };
  for (let x = 0; x < gw; x++) {
    if (!R[x] && !lab[x]) fill(x, outside);
    const k = (gh - 1) * gw + x;
    if (!R[k] && !lab[k]) fill(k, outside);
  }
  for (let y = 0; y < gh; y++) {
    const k = y * gw;
    if (!R[k] && !lab[k]) fill(k, outside);
    if (!R[k + gw - 1] && !lab[k + gw - 1]) fill(k + gw - 1, outside);
  }
  const sizes = [0, 0];
  for (let k = 0; k < gw * gh; k++)
    if (!R[k] && !lab[k]) {
      n++;
      sizes[n] = fill(k, n);
    }
  return { lab, n, sizes };
}

function markExterior(segs, gaps, ctx) {
  const g = Math.max(1, Math.round(0.05 * ctx.pm));
  const { R, gw, gh } = rasterWalls(segs, ctx, g);
  const { lab } = labelFree(R, gw, gh);
  ctx.faceRaster = { g, R, gw, gh, lab };
  for (const s of segs) {
    let out = 0;
    let tot = 0;
    const off = s.t / 2 + 1.5 * g;
    for (let u = s.a + g; u < s.b - g; u += g) {
      for (const side of [-1, 1]) {
        const v = s.c + side * off;
        const [x, y] = s.o === 'h' ? [u, v] : [v, u];
        const i = Math.floor(x / g);
        const j = Math.floor(y / g);
        if (i < 0 || j < 0 || i >= gw || j >= gh) {
          out++;
          tot++;
          continue;
        }
        tot++;
        if (lab[j * gw + i] === 1) out++;
      }
    }
    s.ext = tot > 0 && out / tot >= 0.3;
  }
}

// ───────────── 9. 楼梯（一个方向的等间距细线 = 踏步） ─────────────

/**
 * 楼梯 = 一串等间距（0.18–0.36 m）、长 0.5–1.7 m、两头对齐的细线（踏步），≥ 5 条（中间被轴线 / 字盖掉一两条也行）；
 * 里面没有另一个方向的等间距线（那是地砖）。并排的两跑（U 形楼梯）并成一个。
 * 在原始二值图上找：横的踏步（上下走的楼梯，'ns'）和竖的踏步（左右走的楼梯，'ew'）。
 */
function findStairs(segs, ctx) {
  const { raw, rawT, w, h, pm } = ctx;
  const lmin = 0.5 * pm;
  const lmax = 1.7 * pm; // 一跑楼梯宽 0.8–1.5 m；更长的一串「踏步」是房间里的地砖线
  const pmin = 0.18 * pm;
  const pmax = 0.36 * pm;
  const endTol = Math.max(3, 0.15 * pm);
  const cands = [];
  for (const dir of ['ns', 'ew']) {
    // 'ns'：横线（原图的行）；'ew'：竖线（转置图的行）
    const M = dir === 'ns' ? raw : rawT;
    const W = dir === 'ns' ? w : h;
    const H = dir === 'ns' ? h : w;
    const runs = [];
    let open = [];
    // 空白一次跳 4 个像素（图上大部分是纸）
    const M32 = M.byteOffset % 4 === 0 ? new Uint32Array(M.buffer, M.byteOffset, M.length >> 2) : null;
    for (let y = 0; y < H; y++) {
      const r = y * W;
      const next = [];
      let x = 0;
      while (x < W) {
        if (!M[r + x]) {
          if (M32 && ((r + x) & 3) === 0 && x + 4 <= W && M32[(r + x) >> 2] === 0) x += 4;
          else x++;
          continue;
        }
        const s0 = x;
        while (x < W && M[r + x]) x++;
        const L = x - s0;
        if (L < lmin || L > lmax) continue;
        // 上一行同一段（粗线 / 糊了的线）→ 接上
        const prev = open.find((q) => q.y1 >= y - 1 && Math.min(q.x1, x) - Math.max(q.x0, s0) > 0.8 * Math.min(L, q.x1 - q.x0));
        if (prev) {
          prev.y1 = y;
          prev.x0 = Math.min(prev.x0, s0);
          prev.x1 = Math.max(prev.x1, x);
          next.push(prev);
          continue;
        }
        const q = { y, y1: y, x0: s0, x1: x };
        runs.push(q);
        next.push(q);
      }
      open = next;
    }
    const thin = runs.filter((q) => q.y1 - q.y + 1 <= Math.max(3, 0.05 * pm));
    thin.sort((p, q) => p.y + p.y1 - q.y - q.y1);
    // 链：两头对齐（±0.15 m），间距一样（中间缺一两条也行）
    const best = new Array(thin.length).fill(null);
    // 按两头的位置分桶（一头对齐才可能是同一跑的踏步）→ 只和桶里的比
    const b0 = new Map();
    const b1 = new Map();
    const put = (m, k, i) => {
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(i);
    };
    for (let i = 0; i < thin.length; i++) {
      const q = thin[i];
      const yc = (q.y + q.y1) / 2;
      const k0 = Math.floor(q.x0 / endTol);
      const k1 = Math.floor(q.x1 / endTol);
      const js = new Set();
      for (const [m, k] of [
        [b0, k0],
        [b1, k1],
      ])
        for (let d = -1; d <= 1; d++) {
          const arr = m.get(k + d);
          if (!arr) continue;
          for (let t = arr.length - 1; t >= 0; t--) {
            const p = thin[arr[t]];
            if (yc - (p.y + p.y1) / 2 > 3 * pmax) break;
            js.add(arr[t]);
          }
        }
      put(b0, k0, i);
      put(b1, k1, i);
      for (const j of [...js].sort((x, y) => y - x)) {
        const p = thin[j];
        const dy = yc - (p.y + p.y1) / 2;
        if (dy < pmin) continue;
        if (Math.abs(p.x0 - q.x0) > endTol && Math.abs(p.x1 - q.x1) > endTol) continue;
        const ov = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
        if (ov < 0.7 * Math.min(p.x1 - p.x0, q.x1 - q.x0)) continue;
        const bp = best[j];
        let c = null;
        if (bp) {
          const k = Math.round(dy / bp.pitch);
          if (k >= 1 && k <= 3 && Math.abs(dy - k * bp.pitch) <= Math.max(2, 0.15 * bp.pitch)) c = { n: bp.n + 1, miss: bp.miss + k - 1, pitch: bp.pitch, y0: bp.y0, prev: j };
        }
        if (!c && dy <= pmax) c = { n: 2, miss: 0, pitch: dy, y0: (p.y + p.y1) / 2, prev: j, first: true };
        if (!c || c.miss > Math.max(2, c.n / 3)) continue;
        if (!best[i] || c.n > best[i].n || (c.n === best[i].n && c.miss < best[i].miss)) best[i] = c;
      }
      if (best[i]) best[i].y1 = yc;
    }
    // 踏步的两头：取中位数（一两条对不齐的线 —— 轴线的一截、断掉的踏步 —— 不把楼梯拉宽）
    best.forEach((c, i) => {
      if (!c || c.n < 5) return;
      const xs0 = [thin[i].x0];
      const xs1 = [thin[i].x1];
      for (let k = i, cc = c; cc; ) {
        const j = cc.prev;
        xs0.push(thin[j].x0);
        xs1.push(thin[j].x1);
        if (cc.first) break;
        k = j;
        cc = best[k];
      }
      cands.push({ dir, n: c.n, pitch: c.pitch, _x0: median(xs0), _x1: median(xs1), _y0: c.y0, _y1: c.y1 });
    });
  }
  if (ctx.debug) ctx.debug.stairCands = cands.map((o) => ({ ...o }));
  // 一个楼梯只留最长的链；去掉里面还有另一个方向等间距线的（地砖）
  cands.sort((p, q) => q.n - p.n);
  const flights = [];
  for (const o of cands) {
    const rect = o.dir === 'ns' ? { x: o._x0, y: o._y0, w: o._x1 - o._x0, h: o._y1 - o._y0 } : { x: o._y0, y: o._x0, w: o._y1 - o._y0, h: o._x1 - o._x0 };
    if (rect.w < 0.45 * pm || rect.h < 0.45 * pm) continue;
    const along = o.dir === 'ns' ? rect.h : rect.w;
    if (along < 1.0 * pm) continue;
    if (flights.some((r) => overlap(r.x, r.x + r.w, rect.x, rect.x + rect.w) > 0.3 * Math.min(r.w, rect.w) && overlap(r.y, r.y + r.h, rect.y, rect.y + rect.h) > 0.3 * Math.min(r.h, rect.h))) continue;
    if (tiles(ctx, rect, o.dir, o.pitch)) continue;
    flights.push({ ...rect, dir: o.dir, treads: o.n, pitch: o.pitch });
  }
  // 并排的两跑（U 形楼梯：中间一道墙 / 扶手隔开）→ 一个楼梯间
  const res = [];
  for (const r of flights.sort((p, q) => q.treads - p.treads)) {
    const mate = res.find((q) => {
      if (q.dir !== r.dir) return false;
      const [gapAcross, ovAlong, minAlong] =
        r.dir === 'ns'
          ? [Math.max(q.x - (r.x + r.w), r.x - (q.x + q.w)), overlap(q.y, q.y + q.h, r.y, r.y + r.h), Math.min(q.h, r.h)]
          : [Math.max(q.y - (r.y + r.h), r.y - (q.y + q.h)), overlap(q.x, q.x + q.w, r.x, r.x + r.w), Math.min(q.w, r.w)];
      return gapAcross <= 0.45 * pm && ovAlong >= 0.5 * minAlong;
    });
    if (mate) {
      const x0 = Math.min(mate.x, r.x);
      const y0 = Math.min(mate.y, r.y);
      const x1 = Math.max(mate.x + mate.w, r.x + r.w);
      const y1 = Math.max(mate.y + mate.h, r.y + r.h);
      Object.assign(mate, { x: x0, y: y0, w: x1 - x0, h: y1 - y0, treads: mate.treads + r.treads, flights: 2 });
    } else res.push({ ...r });
  }
  // 单独一跑至少 6 级（5 级以下的「踏步」多半是一小片地砖）；U 形两跑各 ≥ 5 级，并起来的框里也不能是地砖
  return res.filter((r) => (r.treads >= 6 || r.flights === 2) && !(r.flights === 2 && tiles(ctx, r, r.dir, r.pitch))).map((r) => snapRect(r.flights === 2 ? landing(r, segs, ctx) : r, segs, ctx));
}

/** U 形楼梯：两跑转弯的那头是平台 —— 楼梯框往走的方向伸到 1.3 m 以内、横跨整个楼梯间的墙为止（两头都看，近的那面墙已经由 snapRect 吸上） */
function landing(r, segs, ctx) {
  const reach = 1.3 * ctx.pm;
  const ns = r.dir === 'ns';
  const [a0, a1] = ns ? [r.x, r.x + r.w] : [r.y, r.y + r.h];
  let [lo, hi] = ns ? [r.y, r.y + r.h] : [r.x, r.x + r.w];
  let up = null;
  let dn = null;
  for (const s of segs) {
    if (s.o !== (ns ? 'h' : 'v') || overlap(s.a, s.b, a0, a1) < 0.7 * (a1 - a0)) continue;
    if (s.c < lo && lo - s.c <= reach && (up == null || s.c > up)) up = s.c;
    if (s.c > hi && s.c - hi <= reach && (dn == null || s.c < dn)) dn = s.c;
  }
  if (up != null) lo = up;
  if (dn != null) hi = dn;
  return ns ? { ...r, y: lo, h: hi - lo } : { ...r, x: lo, w: hi - lo };
}

/** 楼梯框里是不是方地砖：另一个方向的长线（盖住 ≥ 20 %，地砖线常被洁具 / 字挡掉一大段）间距和「踏步」间距一样的 ≥ 2 个 */
function tiles(ctx, rect, dir, pitch) {
  const { raw, rawT, w, h } = ctx;
  const M = dir === 'ns' ? rawT : raw;
  const W = dir === 'ns' ? h : w;
  const [c0, c1, l0, l1] = dir === 'ns' ? [rect.x, rect.x + rect.w, rect.y, rect.y + rect.h] : [rect.y, rect.y + rect.h, rect.x, rect.x + rect.w];
  const xs = [];
  let lastHit = -10;
  for (let c = Math.round(c0) + 2; c < Math.round(c1) - 2; c++) {
    let n = 0;
    for (let l = Math.round(l0); l < Math.round(l1); l++) n += M[c * W + l];
    if (n >= 0.2 * (l1 - l0)) {
      if (c - lastHit > 2) xs.push(c);
      lastHit = c;
    }
  }
  // 楼梯上横穿踏步的是扶手、箭头、中间的墙，间距不是这样
  // 两条线隔一个「踏步」间距（中间夹着别的线也算：地砖线之间常有洁具的边、字）
  let tile = 0;
  for (let i = 0; i < xs.length; i++) if (xs.some((x) => Math.abs(x - xs[i] - pitch) <= 0.25 * pitch)) tile++;
  if (ctx.debug) (ctx.debug.tileLog = ctx.debug.tileLog || []).push({ dir, rect: { ...rect }, n: 0, xs, tile, pitch });
  return tile >= 2;
}

/** 矩形的边吸到附近的墙中线（≤ 墙厚 + 0.15 m） */
function snapRect(r, segs, ctx) {
  const reach = 0.3 * ctx.pm;
  let { x, y, w, h } = r;
  let x1 = x + w;
  let y1 = y + h;
  const near = (o, v, a0, a1) => {
    let best = null;
    for (const s of segs) {
      if (s.o !== o) continue;
      if (overlap(s.a, s.b, a0, a1) < 0.3 * (a1 - a0)) continue;
      const d = Math.abs(s.c - v);
      if (d <= reach + s.t / 2 && (!best || d < best.d)) best = { d, c: s.c };
    }
    return best ? best.c : v;
  };
  const nx0 = near('v', x, y, y1);
  const nx1 = near('v', x1, y, y1);
  const ny0 = near('h', y, x, x1);
  const ny1 = near('h', y1, x, x1);
  x = nx0;
  x1 = nx1;
  y = ny0;
  y1 = ny1;
  return { ...r, x, y, w: x1 - x, h: y1 - y };
}

// ───────────── 10. 面（房间）：墙围起来的空地，拆成墙中线上的矩形 ─────────────

function findFaces(segs, stairs, ctx, hints) {
  const { pm } = ctx;
  const { g, gw, gh, lab } = ctx.faceRaster;
  let nLab = 1;
  for (let k = 0; k < lab.length; k++) if (lab[k] > nLab) nLab = lab[k];
  const area = new Float64Array(nLab + 1);
  const bx0 = new Int32Array(nLab + 1).fill(1 << 30);
  const bx1 = new Int32Array(nLab + 1).fill(-1);
  const by0 = new Int32Array(nLab + 1).fill(1 << 30);
  const by1 = new Int32Array(nLab + 1).fill(-1);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const l = lab[j * gw + i];
      if (l < 2) continue;
      area[l]++;
      if (i < bx0[l]) bx0[l] = i;
      if (i > bx1[l]) bx1[l] = i;
      if (j < by0[l]) by0[l] = j;
      if (j > by1[l]) by1[l] = j;
    }
  const minCells = ((hints.minFace || 0.5) * pm * pm) / (g * g);
  // 切线：挨着这个面的墙的中线（别处的墙不切它）；靠得很近的几条（照片上同一面墙分成几段、各段中线差几个像素）并成一条
  const touch = new Map(); // label → { v: [[c, len]], h: [[c, len]] }
  for (const s of segs) {
    const off = s.t / 2 + 1.5 * g;
    const hit = new Map();
    for (let u = s.a + g; u < s.b - g; u += g)
      for (const side of [-1, 1]) {
        const v = s.c + side * off;
        const [x, y] = s.o === 'h' ? [u, v] : [v, u];
        const i = Math.floor(x / g);
        const j = Math.floor(y / g);
        if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
        const l = lab[j * gw + i];
        if (l >= 2) hit.set(l, (hit.get(l) || 0) + g);
      }
    for (const [l, len] of hit) {
      if (len < 2 * g) continue;
      if (!touch.has(l)) touch.set(l, { v: [], h: [] });
      touch.get(l)[s.o].push([s.c, len]);
    }
  }
  const tolC = Math.max(2, 0.1 * pm);
  const cluster = (arr) => {
    const v = [...arr].sort((p, q) => p[0] - q[0]);
    const out = [];
    for (const [c, len] of v) {
      const lst = out[out.length - 1];
      if (lst && c - lst.hi <= tolC) {
        lst.hi = c;
        lst.sum += c * len;
        lst.w += len;
      } else out.push({ hi: c, sum: c * len, w: len });
    }
    return out.map((q) => q.sum / q.w);
  };
  const faces = [];
  for (let l = 2; l <= nLab; l++) {
    if (area[l] < minCells) continue;
    const fx0 = bx0[l] * g;
    const fx1 = (bx1[l] + 1) * g;
    const fy0 = by0[l] * g;
    const fy1 = (by1[l] + 1) * g;
    const span = ctx.P.tmax;
    const tc = touch.get(l) || { v: [], h: [] };
    const XS = cluster(tc.v);
    const YS = cluster(tc.h);
    // 外框附近没有墙线就用面的外框
    const xsC = XS.filter((c) => c > fx0 - span && c < fx1 + span);
    const ysC = YS.filter((c) => c > fy0 - span && c < fy1 + span);
    if (!xsC.length || xsC[0] > fx0 + g) xsC.unshift(fx0);
    if (xsC[xsC.length - 1] < fx1 - g) xsC.push(fx1);
    if (!ysC.length || ysC[0] > fy0 + g) ysC.unshift(fy0);
    if (ysC[ysC.length - 1] < fy1 - g) ysC.push(fy1);
    const ni = xsC.length - 1;
    const nj = ysC.length - 1;
    const on = new Uint8Array(Math.max(0, ni * nj));
    for (let j = 0; j < nj; j++)
      for (let i = 0; i < ni; i++) {
        const gi0 = Math.floor(xsC[i] / g);
        const gi1 = Math.ceil(xsC[i + 1] / g);
        const gj0 = Math.floor(ysC[j] / g);
        const gj1 = Math.ceil(ysC[j + 1] / g);
        let mine = 0;
        let free = 0;
        let all = 0;
        for (let jj = Math.max(0, gj0); jj < Math.min(gh, gj1); jj++)
          for (let ii = Math.max(0, gi0); ii < Math.min(gw, gi1); ii++) {
            const v = lab[jj * gw + ii];
            all++;
            if (v === 0) continue;
            free++;
            if (v === l) mine++;
          }
        if (mine && mine >= 0.5 * free && free >= 0.15 * all) on[j * ni + i] = 1;
      }
    const rects = cellsToRects(on, ni, nj, xsC, ysC);
    if (!rects.length) continue;
    faces.push({ rects, label: l });
  }
  // 楼梯：从包含它的面里挖出来，单独成一个面
  for (const st of stairs) {
    // 楼梯框的边吸到附近（0.25 m 内）的面边上，免得挖出一条细缝
    const ex = faces.flatMap((fc) => fc.rects.flatMap((r) => [r.x, r.x + r.w]));
    const ey = faces.flatMap((fc) => fc.rects.flatMap((r) => [r.y, r.y + r.h]));
    const sn = (v, arr) => {
      let b = v;
      let bd = 0.35 * pm;
      for (const a of arr)
        if (Math.abs(a - v) < bd) {
          bd = Math.abs(a - v);
          b = a;
        }
      return b;
    };
    const sx0 = sn(st.x, ex);
    const sx1 = sn(st.x + st.w, ex);
    const sy0 = sn(st.y, ey);
    const sy1 = sn(st.y + st.h, ey);
    Object.assign(st, { x: sx0, y: sy0, w: sx1 - sx0, h: sy1 - sy0 });
    const sr = { x: st.x, y: st.y, w: st.w, h: st.h };
    let carved = false;
    for (const fc of faces) {
      const next = [];
      for (const r of fc.rects) {
        if (overlap(r.x, r.x + r.w, sr.x, sr.x + sr.w) <= 1 || overlap(r.y, r.y + r.h, sr.y, sr.y + sr.h) <= 1) {
          next.push(r);
          continue;
        }
        carved = true;
        next.push(...subtractRect(r, sr).filter((q) => q.w > 0.15 * pm && q.h > 0.15 * pm));
      }
      fc.rects = next;
    }
    if (carved) faces.push({ rects: [sr], stairs: true });
  }
  for (const fc of faces) {
    let A = 0;
    let cx = 0;
    let cy = 0;
    for (const r of fc.rects) {
      const a = r.w * r.h;
      A += a;
      cx += (r.x + r.w / 2) * a;
      cy += (r.y + r.h / 2) * a;
    }
    fc.area = A;
    fc.cx = A ? cx / A : 0;
    fc.cy = A ? cy / A : 0;
  }
  return { faces: faces.filter((fc) => fc.rects.length && fc.area > 0) };
}

function cellsToRects(on, ni, nj, xs, ys) {
  // 两种拆法（先横条再竖着并 / 先竖条再横着并），取最窄的一块更宽的那种（少出细条）
  const byRows = () => {
    const strips = [];
    for (let j = 0; j < nj; j++) {
      let i = 0;
      while (i < ni) {
        if (!on[j * ni + i]) {
          i++;
          continue;
        }
        const s = i;
        while (i < ni && on[j * ni + i]) i++;
        strips.push({ i0: s, i1: i, j0: j, j1: j + 1 });
      }
    }
    const out = [];
    const open = new Map();
    for (const st of strips) {
      const key = `${st.i0}:${st.i1}`;
      const prev = open.get(key);
      if (prev && prev.j1 === st.j0) prev.j1 = st.j1;
      else {
        open.set(key, st);
        out.push(st);
      }
    }
    return out;
  };
  const byCols = () => {
    const strips = [];
    for (let i = 0; i < ni; i++) {
      let j = 0;
      while (j < nj) {
        if (!on[j * ni + i]) {
          j++;
          continue;
        }
        const s = j;
        while (j < nj && on[j * ni + i]) j++;
        strips.push({ i0: i, i1: i + 1, j0: s, j1: j });
      }
    }
    const out = [];
    const open = new Map();
    for (const st of strips) {
      const key = `${st.j0}:${st.j1}`;
      const prev = open.get(key);
      if (prev && prev.i1 === st.i0) prev.i1 = st.i1;
      else {
        open.set(key, st);
        out.push(st);
      }
    }
    return out;
  };
  const toRects = (rs) => rs.map((s) => ({ x: xs[s.i0], y: ys[s.j0], w: xs[s.i1] - xs[s.i0], h: ys[s.j1] - ys[s.j0] }));
  const minSide = (rs) => Math.min(...rs.map((r) => Math.min(r.w, r.h)));
  const a = toRects(byRows());
  if (a.length <= 1) return a;
  const b = toRects(byCols());
  const ma = minSide(a);
  const mb = minSide(b);
  if (mb > ma * 1.05 || (Math.abs(mb - ma) <= ma * 0.05 && b.length < a.length)) return b;
  return a;
}

function subtractRect(r, s) {
  const out = [];
  const x0 = r.x;
  const x1 = r.x + r.w;
  const y0 = r.y;
  const y1 = r.y + r.h;
  const sx0 = Math.max(x0, s.x);
  const sx1 = Math.min(x1, s.x + s.w);
  const sy0 = Math.max(y0, s.y);
  const sy1 = Math.min(y1, s.y + s.h);
  if (sy0 > y0) out.push({ x: x0, y: y0, w: r.w, h: sy0 - y0 });
  if (sy1 < y1) out.push({ x: x0, y: sy1, w: r.w, h: y1 - sy1 });
  if (sx0 > x0) out.push({ x: x0, y: sy0, w: sx0 - x0, h: sy1 - sy0 });
  if (sx1 < x1) out.push({ x: sx1, y: sy0, w: x1 - sx1, h: sy1 - sy0 });
  return out;
}

// ───────────── 11. 可信度 ─────────────

/** 原图上细笔画的宽度（像素）：抽 ~150 行 + ~150 列，数 ≤ 10 像素的墨段，取按条数的 25 % 分位 */
function strokeMode(ctx) {
  const { img, T } = ctx;
  const W = img.width;
  const H = img.height;
  const { thr, bg, bw, B, ch } = T;
  const tb = new Uint16Array(bg.length);
  for (let k = 0; k < bg.length; k++) tb[k] = Math.ceil((thr * bg[k]) / 255);
  const hist = new Float64Array(12);
  const row = new Uint8Array(Math.max(W, H));
  const sy = Math.max(1, Math.floor(H / 150));
  for (let y = 0; y < H; y += sy) {
    lumRow(img.data, ch, W, y, row);
    const br = ((y / B) | 0) * bw;
    let run = 0;
    for (let x = 0; x <= W; x++) {
      const ink = x < W && row[x] < tb[br + ((x / B) | 0)];
      if (ink) run++;
      else if (run) {
        if (run <= 10) hist[run]++;
        run = 0;
      }
    }
  }
  const sx = Math.max(1, Math.floor(W / 150));
  for (let x = 0; x < W; x += sx) {
    let run = 0;
    const bc = (x / B) | 0;
    for (let y = 0; y <= H; y++) {
      const ink = y < H && T.lum(y * W + x) < tb[((y / B) | 0) * bw + bc];
      if (ink) run++;
      else if (run) {
        if (run <= 10) hist[run]++;
        run = 0;
      }
    }
  }
  // 细的那头的笔画宽：按条数的 25 % 分位（空心墙的图里最多的是 0.03 m 的墙线，尺寸线 / 家具线更细；
  // 糊的截图 / 放大过的照片里细线也是 3–4 像素）。比众数稳：同一张照片放大的方法不同，结果也差不多
  let tot = 0;
  for (let k = 1; k <= 10; k++) tot += hist[k];
  let best = 1;
  let cum = 0;
  for (let k = 1; k <= 10; k++) {
    cum += hist[k];
    if (cum >= 0.25 * tot) {
      best = k;
      break;
    }
  }
  if (ctx.debug) ctx.debug.strokeHist = Array.from(hist).map((v) => Math.round(v));
  return best;
}

function scoreQuality(segs, gaps, faceOut, ctx, info) {
  const { pm } = ctx;
  const reasons = [];
  const srcPxM = info.pxPerM || 0;
  // 有效分辨率：最细的常见笔画在原图上有几个像素（截图放大过 → 线是 3 像素宽的糊线，信息只有一半）
  const lwSrc = strokeMode(ctx);
  const effPxM = srcPxM * Math.min(1, 1.6 / Math.max(1, lwSrc));
  const res = clamp((effPxM - 22) / 38, 0.25, 1);
  if (effPxM < 60) reasons.push('low-res');
  if (info.scaleSource !== 'given') reasons.push('scale-estimated');
  const len = segs.reduce((v, s) => v + segLen(s), 0) / pm;
  if (len < 8 || segs.length < 4) reasons.push('few-walls');
  let ends = 0;
  let attached = 0;
  for (const s of segs) {
    for (const e of ['endA', 'endB']) {
      ends++;
      if (s[e] >= 0) attached++;
    }
  }
  const att = ends ? attached / ends : 0;
  if (att < 0.75) reasons.push('loose-ends');
  const faces = faceOut.faces.filter((f) => !f.stairs);
  const faceA = faces.reduce((v, f) => v + f.area, 0) / (pm * pm);
  // 围合：面积对墙网外框
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  for (const s of segs) {
    const [ax0, ax1, ay0, ay1] = s.o === 'h' ? [s.a, s.b, s.c, s.c] : [s.c, s.c, s.a, s.b];
    x0 = Math.min(x0, ax0);
    x1 = Math.max(x1, ax1);
    y0 = Math.min(y0, ay0);
    y1 = Math.max(y1, ay1);
  }
  const bbA = segs.length ? ((x1 - x0) * (y1 - y0)) / (pm * pm) : 0;
  // 围合：房间面积 / 墙网外框面积。干净的图 0.67–0.95（前院、门廊在外框里但不围合）；外墙断了、房间漏到外面 → < 0.5
  const enclosed = bbA > 0 ? faceA / bbA : 0;
  const closed = clamp((enclosed - 0.3) / 0.35, 0, 1);
  if (faces.length < 2 || closed < 0.5) reasons.push('open-outline');
  const wallPx = Math.round(segs.reduce((v, s) => v + segLen(s) * s.t, 0) * ctx.f * ctx.f);
  const covered = segs.reduce((v, s) => v + s.n, 0);
  const coverage = len > 0 ? clamp(covered / (len * pm), 0, 1) : 0;
  // 漏到外面的房间整个就没了 → 围合是乘上去的；两头悬空的墙多（复印件、低清）→ 读出来的墙网不可靠
  const struct = len >= 8 ? (0.8 * att + 0.2 * Math.min(1, faces.length / 4)) * closed : 0.2 * att * closed;
  // 粗细分得开的图（CAD）却是用全部的墨读的：墙里有多少是细笔画的（排水沟、栏杆、家具边）→ 扣分
  let thin = 0;
  if (ctx.pen?.ok && !ctx.heavy && len > 0) {
    for (const s of segs) if (heavyFrac(s, ctx) < 0.3) thin += segLen(s);
    thin /= len * pm;
    if (thin > 0.1) reasons.push('thin-walls');
  }
  const pens = clamp(1 - 1.5 * thin, 0.3, 1);
  // 两条细线画的墙在低分辨率下最不可靠
  const lines = ctx.style === 'hollow' && effPxM < 80 ? 0.85 : 1;
  // 复印件 / 照片（纸不是白的）：笔画断断续续、淋浴间 / 柜子的线也会糊成粗线 → 少给一点（评审的扫描 / 复印件：墙 P 0.91–0.97，
  // 但碳粉掉一截就会让一个房间的面没围上 —— 结构要明显更好才过门槛）；用全部的墨读的（粗笔读不出来）→ 不过门槛
  let photo = 1;
  if (ctx.photo) {
    photo = 0.85;
    reasons.push('photo');
  }
  const cap = ctx.photo && ctx.pen?.ok && !ctx.heavy ? 0.55 : 1;
  const score = Math.min(cap, clamp(res * struct * lines * pens * photo, 0, 1)) * (info.scaleSource === 'given' ? 1 : info.scaleSource === 'doors' ? 0.9 : 0.75);
  return { score: +score.toFixed(3), wallPx, coverage: +coverage.toFixed(3), attached: +att.toFixed(3), closed: +closed.toFixed(3), enclosed: +enclosed.toFixed(3), wallM: +len.toFixed(2), effPxPerM: Math.round(effPxM), style: ctx.style, pen: ctx.heavy ? 'heavy' : ctx.pen?.ok ? 'all-ink' : 'one-pen', thinWalls: +thin.toFixed(3), reasons };
}

// ───────────── 12. 米制：墙 / 开口 / 房间面；和 AI 读到的房间名合在一起 ─────────────

const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const KIND = { door: 'door', opening: 'open', window: 'window', slider: 'slider' };

/**
 * extractWalls 的结果 → 米（原点 = 裁图左上角 + (dx, dy)；和 sheet.js readToMetres 同一个坐标系）。
 * → { walls: [{ x1, y1, x2, y2, t, ext }], openings: [{ kind: 'door'|'open'|'window'|'slider', x1, y1, x2, y2, arc, wall }],
 *     faces: [{ rects: [{ x, y, w, d }], area, stairs? }], quality }
 */
export function wallsToPlan(res, mPerPx, { dx = 0, dy = 0 } = {}) {
  const k = mPerPx;
  const X = (v) => r3(v * k + dx);
  const Y = (v) => r3(v * k + dy);
  return {
    walls: res.walls.map((wl) => ({ x1: X(wl.x1), y1: Y(wl.y1), x2: X(wl.x2), y2: Y(wl.y2), t: r3(wl.t * k), ext: wl.ext })),
    openings: res.gaps.map((g) => ({ kind: KIND[g.kind] || 'open', x1: X(g.x1), y1: Y(g.y1), x2: X(g.x2), y2: Y(g.y2), arc: g.arc, wall: g.wall })),
    faces: res.faces.map((fc) => ({ rects: fc.rects.map((r) => ({ x: X(r.x), y: Y(r.y), w: r3(r.w * k), d: r3(r.h * k) })), area: r3(fc.area * k * k), ...(fc.stairs ? { stairs: true } : {}) })),
    quality: res.quality,
  };
}

const OPEN_T = (t) => !!ROOM_TYPES[t]?.open;
const OUTDOOR_T = (t) => !!ROOM_TYPES[t]?.outdoor;
const areaOf = (r) => r.w * r.d;
const interArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y));

function subtractM(r, s) {
  if (interArea(r, s) <= 1e-6) return [r];
  const out = [];
  const x0 = r.x;
  const x1 = r.x + r.w;
  const y0 = r.y;
  const y1 = r.y + r.d;
  const sx0 = Math.max(x0, s.x);
  const sx1 = Math.min(x1, s.x + s.w);
  const sy0 = Math.max(y0, s.y);
  const sy1 = Math.min(y1, s.y + s.d);
  if (sy0 > y0) out.push({ ...r, y: y0, d: sy0 - y0 });
  if (sy1 < y1) out.push({ ...r, y: sy1, d: y1 - sy1 });
  if (sx0 > x0) out.push({ ...r, x: x0, y: sy0, w: sx0 - x0, d: sy1 - sy0 });
  if (sx1 < x1) out.push({ ...r, x: sx1, y: sy0, w: x1 - sx1, d: sy1 - sy0 });
  return out.filter((q) => q.w > 0.05 && q.d > 0.05);
}

/** 一组切线：固定的（面的边）+ AI 框的边（彼此 0.35 m 内的并成一条，离固定线 0.35 m 内的吸过去）→ 排好序 */
function cutLines(fixed, extra, lo, hi) {
  const F = [...new Set(fixed.map(r3))].sort((a, b) => a - b);
  const groups = [];
  for (const v of [...extra].filter((v) => v > lo + 0.35 && v < hi - 0.35).sort((a, b) => a - b)) {
    const g = groups[groups.length - 1];
    if (g && v - g[g.length - 1] <= 0.35) g.push(v);
    else groups.push([v]);
  }
  const out = [...F];
  for (const g of groups) {
    const v = g.reduce((a, b) => a + b, 0) / g.length;
    const near = F.find((f) => Math.abs(f - v) <= 0.35);
    if (near == null && !out.some((o) => Math.abs(o - v) < 0.35)) out.push(r3(v));
  }
  return out.sort((a, b) => a - b);
}

/** 一个面（几块矩形）按 AI 的房间框分给几个房间：框的边切网格，每一格给盖住它的（最小的）框，没框盖的给最近的 */
function splitFace(rects, lbs, inner = { x: [], y: [] }) {
  const fx = rects.flatMap((r) => [r.x, r.x + r.w]).concat(inner.x);
  const fy = rects.flatMap((r) => [r.y, r.y + r.d]).concat(inner.y);
  const X = cutLines(fx, lbs.flatMap((l) => [l.x, l.x + l.w]), Math.min(...fx), Math.max(...fx));
  const Y = cutLines(fy, lbs.flatMap((l) => [l.y, l.y + l.d]), Math.min(...fy), Math.max(...fy));
  const ni = X.length - 1;
  const nj = Y.length - 1;
  const own = new Int32Array(Math.max(0, ni * nj)).fill(-1);
  for (let j = 0; j < nj; j++)
    for (let i = 0; i < ni; i++) {
      const cx = (X[i] + X[i + 1]) / 2;
      const cy = (Y[j] + Y[j + 1]) / 2;
      if (!rects.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.d)) continue;
      // 盖住格子的框里取「格子占框的比例」最大的（小房间的框画在大房间框里）；都不盖 → 最近的框
      let best = -1;
      let bv = Infinity;
      lbs.forEach((l, k) => {
        const inside = cx > l.x && cx < l.x + l.w && cy > l.y && cy < l.y + l.d;
        const v = inside ? -1 / Math.max(1e-6, areaOf(l)) : Math.hypot(Math.max(l.x - cx, 0, cx - l.x - l.w), Math.max(l.y - cy, 0, cy - l.y - l.d));
        if (v < bv) {
          bv = v;
          best = k;
        }
      });
      own[j * ni + i] = best;
    }
  const out = lbs.map(() => []);
  for (let k = 0; k < lbs.length; k++) {
    const on = new Uint8Array(Math.max(0, ni * nj));
    for (let q = 0; q < ni * nj; q++) on[q] = own[q] === k ? 1 : 0;
    out[k] = cellsToRects(on, ni, nj, X, Y).map((r) => ({ x: r.x, y: r.y, w: r3(r.w), d: r3(r.h) }));
  }
  return out;
}

/** 两个矩形共用的边（> 0.05 m）→ { x1, y1, x2, y2 } 或 null */
function sharedEdge(a, b) {
  const E = 0.02;
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
  if (Math.abs(a.x + a.w - b.x) < E || Math.abs(b.x + b.w - a.x) < E) {
    if (oy <= 0.05) return null;
    const x = Math.abs(a.x + a.w - b.x) < E ? b.x : a.x;
    return { x1: r3(x), y1: r3(Math.max(a.y, b.y)), x2: r3(x), y2: r3(Math.min(a.y + a.d, b.y + b.d)) };
  }
  if (Math.abs(a.y + a.d - b.y) < E || Math.abs(b.y + b.d - a.y) < E) {
    if (ox <= 0.05) return null;
    const y = Math.abs(a.y + a.d - b.y) < E ? b.y : a.y;
    return { x1: r3(Math.max(a.x, b.x)), y1: r3(y), x2: r3(Math.min(a.x + a.w, b.x + b.w)), y2: r3(y) };
  }
  return null;
}

/**
 * 按图上的墙重建一层（DESIGN §2.12 B）—— sheet.js assemblePlan 的 opts.fuse 直接用它：
 *   fuseWalls({ m, walls, mPerPx, pins, uid, rooms?, dx?, dy? }) → { rooms, openings, fixes, wallsReport } | null（null = 用 tileRooms）
 * m = readToMetres 的结果（米，裁图原点）；walls = extractWalls 的结果（裁图像素）；rooms = 当标签用的 AI 房间（默认 m.rooms；
 * 上层平移过时传平移后的那份）；dx / dy = 墙要加的平移（米，和 rooms 一致）；pins = 钉住的楼梯间（下层的矩形）。
 * 1. 房间 = 墙围出来的面；每个面用盖住它的 AI 房间命名；一个面里有两个以上的 AI 房间（客厅 + 餐厅 + 厨房）→ 按框分开，分界是「打通」，不是墙。
 * 2. 墙只在图上有墙的地方（面的边）；同一个面里分出来的房间之间 → 'open' 开口（两边都是开放类型时不用）。
 * 3. 门窗只在墙的缺口上：有门弧的缺口一定是门；没门弧的缺口按 AI 的门 / 推拉门投票，否则是打通；AI 的门落在实墙上 → 丢掉。
 */
export function fuseWalls(args) {
  const res = args.walls;
  const mPerPx = args.mPerPx;
  if (!res || !Array.isArray(res.faces) || !res.faces.length || !(mPerPx > 0)) return null;
  let n = 0;
  const uid = args.uid || ((p) => `${p}w${++n}`);
  const dx = args.dx || 0;
  const dy = args.dy || 0;
  const W = wallsToPlan(res, mPerPx, { dx, dy });
  const pins = (args.pins || []).map((p) => ({ ...p }));
  const labels = (args.rooms || args.m?.rooms || []).filter((r) => r && !r.pin && r.w > 0 && r.d > 0);
  const aiOpen = (args.m?.openings || []).filter(Boolean);
  const rooms = [];
  const openings = [];
  // 这条边（h: 横的，c = y）上图里有墙的比例
  const wallCovers = (h, c, a, b) => {
    let cov = 0;
    for (const w of W.walls) {
      const wh = Math.abs(w.y1 - w.y2) < 1e-6;
      if (wh !== h) continue;
      const wc = h ? w.y1 : w.x1;
      if (Math.abs(wc - c) > Math.max(0.12, w.t / 2 + 0.05)) continue;
      const wa = h ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2);
      const wb = h ? Math.max(w.x1, w.x2) : Math.max(w.y1, w.y2);
      cov += Math.max(0, Math.min(b, wb) - Math.max(a, wa));
    }
    return cov / Math.max(1e-6, b - a);
  };
  const report = { wallsDetected: W.walls.length, openConnections: 0, doorsDropped: 0, doorsAdded: 0, windowsDropped: 0, facesUnlabelled: 0, splitFaces: 0, quality: res.quality?.score ?? null };
  // 楼梯：钉住的楼梯间先挖掉
  let faces = W.faces.map((fc) => ({ ...fc, rects: fc.rects.map((r) => ({ ...r })) }));
  for (const p of pins) {
    faces = faces.map((fc) => ({ ...fc, rects: fc.rects.flatMap((r) => subtractM(r, p)) })).filter((fc) => fc.rects.length);
    rooms.push({ ...p, id: p.id || uid('r'), type: 'stair', name: '', pin: true });
  }
  // 拼得成一个大矩形的两块（同高并排 / 同宽上下接、接缝上图里没墙）合成一块 —— 不然一个房间会变成两三条「长条房间」
  const mergeRects = (rects) => {
    const R = rects.map((r) => ({ ...r }));
    const E = 0.02;
    for (let again = true; again; ) {
      again = false;
      for (let i = 0; i < R.length && !again; i++)
        for (let j = 0; j < R.length && !again; j++) {
          const a = R[i];
          const b = R[j];
          if (i === j) continue;
          if (Math.abs(a.y - b.y) < E && Math.abs(a.d - b.d) < E && Math.abs(a.x + a.w - b.x) < E && wallCovers(false, b.x, b.y, b.y + b.d) <= 0.3) a.w = b.x + b.w - a.x;
          else if (Math.abs(a.x - b.x) < E && Math.abs(a.w - b.w) < E && Math.abs(a.y + a.d - b.y) < E && wallCovers(true, b.y, b.x, b.x + b.w) <= 0.3) a.d = b.y + b.d - a.y;
          else continue;
          R.splice(j, 1);
          again = true;
        }
    }
    return R;
  };
  const addRoom = (lb, rects, extra = {}) => {
    const big = mergeRects(rects).sort((a, b) => areaOf(b) - areaOf(a));
    const base = lb ? lb.id || uid('r') : uid('r');
    big.forEach((r, i) => {
      // 边对齐到厘米（x + w 和邻居的 x 一样；三位小数时 8.995 这种「半厘米」会被 buildWalls 分到两条线上 → 凭空两道墙）
      const x0 = r2(r.x);
      const y0 = r2(r.y);
      rooms.push({ id: i ? `${base}-${i + 1}` : base, type: lb?.type || extra.type || 'corridor', name: lb?.name ?? '', label: lb?.label ?? '', x: x0, y: y0, w: r2(r2(r.x + r.w) - x0), d: r2(r2(r.y + r.d) - y0), ...extra, _face: extra._face });
    });
  };
  faces.forEach((fc, fi) => {
    const fa = fc.rects.reduce((v, r) => v + areaOf(r), 0);
    if (fc.stairs) {
      // 楼梯面：AI 的楼梯标签（有的话）给 up / shape，否则空名
      if (pins.some((p) => fc.rects.some((r) => interArea(r, p) > 0.3 * areaOf(r)))) return;
      addRoom({ type: 'stair', name: '', label: '' }, fc.rects, { _face: fi });
      return;
    }
    // 每个 AI 房间框：落在这个面里的面积 a、占框的比例 inF（框大半在这个面里 = 这个面的房间）、占面的比例 ofF
    const ov = labels
      .map((l) => {
        const a = fc.rects.reduce((v, r) => v + interArea(r, l), 0);
        return { l, a, inF: a / Math.max(1e-6, areaOf(l)), ofF: a / Math.max(1e-6, fa) };
      })
      .filter((q) => q.a > 0.05);
    const mine = ov.filter((q) => q.inF >= 0.5 && (q.ofF >= 0.12 || q.a >= 1.5));
    if (!mine.length) {
      // 没有框大半在这里：取盖住这个面最多的那个（框画大了 / 画偏了）
      // 差不多一样盖住的几个框（L 形大框 + 里面的小框）→ 小的那个（更具体）
      const best = ov.sort((p, q) => (Math.abs(q.ofF - p.ofF) > 0.1 ? q.ofF - p.ofF : q.inF - p.inF))[0];
      if (best && best.ofF >= 0.3) addRoom(best.l, fc.rects, { _face: fi });
      else {
        report.facesUnlabelled++;
        addRoom(null, fc.rects, { type: 'store', gap: true, _face: fi });
      }
      return;
    }
    // 同一类型同名的几个框 → 留盖得多的
    const uniq = [];
    for (const q of mine.sort((p, r) => r.a - p.a)) if (!uniq.some((u) => u.l.type === q.l.type && u.l.name === q.l.name)) uniq.push(q);
    // 两个以上不一样的房间，框都大半落在这个面里 → 开放式（客厅 + 餐厅 + 厨房…），按框分；分界不是墙
    const parts = uniq;
    if (parts.length >= 2) {
      report.splitFaces++;
      // 面里面的墙（一头悬空的短墙）也当分界
      const inside = (x, y) => fc.rects.some((r) => x > r.x + 0.05 && x < r.x + r.w - 0.05 && y > r.y + 0.05 && y < r.y + r.d - 0.05);
      const inner = { x: [], y: [] };
      for (const w of W.walls) {
        const mx = (w.x1 + w.x2) / 2;
        const my = (w.y1 + w.y2) / 2;
        if (!inside(mx, my)) continue;
        if (Math.abs(w.x1 - w.x2) < 1e-6) inner.x.push(w.x1);
        else inner.y.push(w.y1);
      }
      const split = splitFace(fc.rects, parts.map((q) => q.l), inner);
      parts.forEach((q, k) => {
        if (split[k].length) addRoom(q.l, split[k], { _face: fi });
      });
    } else addRoom(uniq[0].l, fc.rects, { _face: fi });
  });
  // AI 有、墙没围出来的户外空间（车廊前面敞开、阳台）：框减掉已有的房间
  for (const l of labels) {
    if (!OUTDOOR_T(l.type)) continue;
    const cov = rooms.reduce((v, r) => v + interArea(r, l), 0);
    if (cov > 0.5 * areaOf(l)) continue;
    // 框的边吸到附近的墙中线 / 房间边（0.4 m 内）
    const vx = [...W.walls.filter((w) => Math.abs(w.x1 - w.x2) < 1e-6).map((w) => w.x1), ...rooms.flatMap((r) => [r.x, r.x + r.w])];
    const hy = [...W.walls.filter((w) => Math.abs(w.y1 - w.y2) < 1e-6).map((w) => w.y1), ...rooms.flatMap((r) => [r.y, r.y + r.d])];
    const snap = (v, arr) => {
      let best = v;
      let bd = 0.4;
      for (const a of arr)
        if (Math.abs(a - v) < bd) {
          bd = Math.abs(a - v);
          best = a;
        }
      return best;
    };
    const sx0 = snap(l.x, vx);
    const sx1 = snap(l.x + l.w, vx);
    const sy0 = snap(l.y, hy);
    const sy1 = snap(l.y + l.d, hy);
    let pieces = [{ x: sx0, y: sy0, w: sx1 - sx0, d: sy1 - sy0 }];
    for (const r of rooms) pieces = pieces.flatMap((p) => subtractM(p, r));
    pieces = pieces.filter((p) => areaOf(p) >= 1 && p.w >= 0.6 && p.d >= 0.6);
    if (pieces.length) addRoom(l, pieces, { _face: -1, outdoorAI: true });
  }
  // 户外空间（AI 补的）的边：图上没有墙的地方 → 打通（车廊前面不砌墙）
  for (const r of rooms) {
    if (!r.outdoorAI) continue;
    for (const [h, c, a, b] of [
      [true, r.y, r.x, r.x + r.w],
      [true, r.y + r.d, r.x, r.x + r.w],
      [false, r.x, r.y, r.y + r.d],
      [false, r.x + r.w, r.y, r.y + r.d],
    ]) {
      if (b - a < 0.3 || wallCovers(h, c, a, b) > 0.3) continue;
      // 和别的房间共边的那几段由那边的墙决定；这里只管朝外的部分（这条边上没有别的房间的那几段）
      const busy = [];
      for (const q of rooms) {
        if (q === r) continue;
        const e = sharedEdge(r, q);
        if (!e) continue;
        const eh = Math.abs(e.y1 - e.y2) < 1e-6;
        if (eh !== h || Math.abs((h ? e.y1 : e.x1) - c) > 0.02) continue;
        busy.push(h ? [Math.min(e.x1, e.x2), Math.max(e.x1, e.x2)] : [Math.min(e.y1, e.y2), Math.max(e.y1, e.y2)]);
      }
      busy.sort((p, q) => p[0] - q[0]);
      let at = a;
      const free = [];
      for (const [p, q] of busy) {
        if (p > at + 0.05) free.push([at, p]);
        at = Math.max(at, q);
      }
      if (b > at + 0.05) free.push([at, b]);
      for (const [p, q] of free) {
        if (q - p < 0.3 || wallCovers(h, c, p, q) > 0.3) continue;
        openings.push({ id: uid('o'), kind: 'open', ...(h ? { x1: r3(p), y1: r3(c), x2: r3(q), y2: r3(c) } : { x1: r3(c), y1: r3(p), x2: r3(c), y2: r3(q) }) });
        report.openConnections++;
      }
    }
  }
  // 同一个面里分出来的房间之间 / L 形房间两块之间：没有墙 → 打通（两边都是开放类型时 buildWalls 本来就不砌墙；图上那里有墙就不打通）
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (a._face == null || a._face !== b._face || a._face < 0) continue;
      if (OPEN_T(a.type) && OPEN_T(b.type)) continue;
      const e = sharedEdge(a, b);
      if (!e) continue;
      const h = Math.abs(e.y1 - e.y2) < 1e-6;
      if (wallCovers(h, h ? e.y1 : e.x1, h ? e.x1 : e.y1, h ? e.x2 : e.y2) > 0.5) continue;
      openings.push({ id: uid('o'), kind: 'open', ...e });
      report.openConnections++;
    }
  // 门窗：只在墙的缺口上
  const along = (o) => (Math.abs(o.y1 - o.y2) < Math.abs(o.x1 - o.x2) ? { h: true, c: (o.y1 + o.y2) / 2, a: Math.min(o.x1, o.x2), b: Math.max(o.x1, o.x2) } : { h: false, c: (o.x1 + o.x2) / 2, a: Math.min(o.y1, o.y2), b: Math.max(o.y1, o.y2) });
  const usedAI = new Set();
  for (const g of W.openings) {
    const G = along(g);
    let kind = g.kind;
    // AI 投票：没门弧的缺口
    const votes = aiOpen.filter((o) => {
      const O = along(o);
      return O.h === G.h && Math.abs(O.c - G.c) <= 0.35 && Math.min(O.b, G.b) - Math.max(O.a, G.a) >= 0.4 * Math.min(O.b - O.a, G.b - G.a);
    });
    for (const v of votes) usedAI.add(v);
    if (!g.arc && kind === 'open') {
      const v = votes.find((o) => o.kind === 'door' || o.kind === 'slider');
      if (v) kind = v.kind;
    }
    // 图上只看得出「玻璃」，看不出是窗还是落地的推拉门（简单画法都是两三条线）→ AI 说推拉门就是推拉门
    if (!g.arc && kind === 'window' && votes.some((o) => o.kind === 'slider')) kind = 'slider';
    if (g.arc) kind = 'door';
    if (g.arc && !votes.some((o) => o.kind === 'door')) report.doorsAdded++;
    openings.push({ id: uid('o'), kind, x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 });
  }
  for (const o of aiOpen) {
    if (usedAI.has(o)) continue;
    if (o.kind === 'window') report.windowsDropped++;
    else report.doorsDropped++;
  }
  const out = rooms.map(({ _face, outdoorAI, ...r }) => r);
  return {
    rooms: out,
    openings,
    fixes: { overlaps: 0, filled: report.facesUnlabelled, absorbed: 0, split: report.splitFaces, dropped: [], openingsDropped: report.doorsDropped + report.windowsDropped, wallFirst: true },
    wallsReport: report,
  };
}

export const OPEN_TYPES = new Set(Object.keys(ROOM_TYPES).filter((k) => ROOM_TYPES[k].open));

/** 内部函数（测试 / 调试用） */
export const _internals = { strokeWidths, penSplit, darkness };
