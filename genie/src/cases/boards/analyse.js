// 溪岸板材导入 · 像素数学（纯函数，没有 DOM：worker 里跑，Node 测试也直接跑）。SPEC §3.4 + §8 R2 / R3 / R4。
//   statsOf()     概览图（长边 512）+ 原图中间 768 × 768 → 平均色、深色、L* 的起伏、纹的方向（结构张量）、二维周期（编织）
//   seamsOf()     原图四条边：横 / 竖两个方向能不能无缝平铺（第一列和最后一列的差 vs 相邻两列的差）
//   detectBorder()编织小样外面那一圈：斜纹方向翻过来的一条带（box 平滑的 gx·gy 的正负号和中间不一样）
//   bakeAcross()  横纹方向接不上时：只在横纹方向和错开半张的自己交叉淡化（中间保持原样）
// 原型：boards/design/synth.py analyse()、boards/review/exp_classify.py / exp_border.py / exp_seam.py。

import { srgbToLin, linToSrgb, linLab, rgbHex } from '../../shared/boards/derive.js';

// ───────────────────────── 小工具 ─────────────────────────

const LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) LUT[i] = srgbToLin(i / 255);

/** RGBA → L*（0–100） */
export function lstar(rgba, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    const Y = 0.2126 * LUT[rgba[j]] + 0.7152 * LUT[rgba[j + 1]] + 0.0722 * LUT[rgba[j + 2]];
    out[i] = Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
  }
  return out;
}

/** RGBA → 灰度 0–255（PIL 'L' 的公式，周期 / 边框用） */
export function grey(rgba, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  return out;
}

/** 一维高斯核 */
function gk(s) {
  const r = Math.max(1, Math.round(s * 3));
  const k = new Float32Array(2 * r + 1);
  let t = 0;
  for (let i = -r; i <= r; i++) t += k[i + r] = Math.exp(-(i * i) / (2 * s * s));
  for (let i = 0; i < k.length; i++) k[i] /= t;
  return { k, r };
}

/** 可分离高斯模糊（边缘复制，同 numpy pad 'edge'） */
export function gauss(src, w, h, s) {
  const { k, r } = gk(s);
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += k[i + r] * src[row + Math.min(w - 1, Math.max(0, x + i))];
      tmp[row + x] = a;
    }
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
      out[y * w + x] = a;
    }
  return out;
}

/** 方框平均（半径 r；超出边界当 0，同 numpy convolve 'same'） */
export function boxZero(src, w, h, r) {
  const n = 2 * r + 1;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let x = -r; x <= r; x++) if (x >= 0 && x < w) s += src[row + x];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / n;
      const add = x + r + 1;
      const sub = x - r;
      if (add < w) s += src[row + add];
      if (sub >= 0) s -= src[row + sub];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) if (y >= 0 && y < h) s += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      const add = y + r + 1;
      const sub = y - r;
      if (add < h) s += tmp[add * w + x];
      if (sub >= 0) s -= tmp[sub * w + x];
    }
  }
  return out;
}

function std(a) {
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i];
    s2 += a[i] * a[i];
  }
  const m = s / a.length;
  return Math.sqrt(Math.max(0, s2 / a.length - m * m));
}

/** 切一块（x0, y0, w, h） */
function sub(src, W, x0, y0, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) out.set(src.subarray((y0 + y) * W + x0, (y0 + y) * W + x0 + w), y * w);
  return out;
}

/**
 * 结构张量：先模糊（σ），再取梯度（中心差分，同 numpy.gradient），整块平均 →
 *   coh = 方向一致的程度（0 = 没方向，1 = 全是一个方向的纹），deg = 纹的方向（0° = 横，90° = 竖）
 */
export function tensor(L, w, h, s) {
  const b = gauss(L, w, h, s);
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const gx = x === 0 ? b[i + 1] - b[i] : x === w - 1 ? b[i] - b[i - 1] : (b[i + 1] - b[i - 1]) / 2;
      const gy = y === 0 ? b[i + w] - b[i] : y === h - 1 ? b[i] - b[i - w] : (b[i + w] - b[i - w]) / 2;
      xx += gx * gx;
      yy += gy * gy;
      xy += gx * gy;
    }
  const n = w * h;
  xx /= n;
  yy /= n;
  xy /= n;
  const tr = xx + yy;
  const det = xx * yy - xy * xy;
  const d = Math.sqrt(Math.max(tr * tr / 4 - det, 0));
  const coh = (2 * d) / (tr + 1e-12);
  const th = 0.5 * (Math.atan2(2 * xy, xx - yy) * 180) / Math.PI;
  return { coh, deg: (((th + 90) % 180) + 180) % 180, energy: Math.sqrt(tr) };
}

/** 一条线的自相关：减去 15 点的滑动平均、去掉两头 10 点 → lag 3–39 里最高的局部峰（值 + 位置） */
function acPeak(v) {
  const n = v.length;
  const hp = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -7; k <= 7; k++) {
      const j = i + k;
      if (j >= 0 && j < n) s += v[j];
    }
    hp[i] = v[i] - s / 15;
  }
  const u = hp.subarray(10, n - 10);
  const m = u.length;
  const ac = new Float32Array(41);
  for (let lag = 0; lag <= 40 && lag < m; lag++) {
    let s = 0;
    for (let i = 0; i + lag < m; i++) s += u[i] * u[i + lag];
    ac[lag] = s;
  }
  const a0 = ac[0] + 1e-12;
  let best = 0;
  const peaks = [];
  for (let i = 3; i < 40; i++) {
    const a = ac[i] / a0;
    if (ac[i] > ac[i - 1] && ac[i] >= ac[i + 1]) {
      peaks.push([i, a]);
      if (a > best) best = a;
    }
  }
  // 周期 = 第一个够高的峰（≥ 最高峰的 75 %）：斜纹的两倍周期常常更高一点，不能拿它
  const fund = peaks.find(([, a]) => a >= best * 0.75);
  return { v: best, lag: fund ? fund[0] : 0 };
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * 二维周期（编织）：中间 512 × 512（不够就整块），每隔 32 行 / 列取一条，自相关峰的中位数。
 * @returns {{ rows, cols, period }}（period = 峰的位置中位数，像素）
 */
export function periodic(G, w, h) {
  const cw = Math.min(w, 512);
  const ch = Math.min(h, 512);
  const x0 = Math.floor((w - cw) / 2);
  const y0 = Math.floor((h - ch) / 2);
  const rows = [];
  const cols = [];
  const rl = [];
  const cl = [];
  for (let y = 0; y < ch; y += 32) {
    const p = acPeak(G.subarray((y0 + y) * w + x0, (y0 + y) * w + x0 + cw));
    rows.push(p.v);
    if (p.lag) rl.push(p.lag);
  }
  for (let x = 0; x < cw; x += 32) {
    const v = new Float32Array(ch);
    for (let y = 0; y < ch; y++) v[y] = G[(y0 + y) * w + x0 + x];
    const p = acPeak(v);
    cols.push(p.v);
    if (p.lag) cl.push(p.lag);
  }
  // 编织的一个循环：横向、竖向各自的周期取平均（篮纹横竖不一样长：s26 是 12 / 16 px）
  const lags = [rl.length ? median(rl) : 0, cl.length ? median(cl) : 0].filter(Boolean);
  const period = lags.length ? lags.reduce((a, b) => a + b, 0) / lags.length : 0;
  return { rows: median(rows), cols: median(cols), period };
}

/**
 * 一张板的统计（R2 的门槛用这几个数）。
 * @param {{ data, w, h }} ov  概览（长边 ≈ 512，RGBA）
 * @param {{ data, w, h }} fine 原图中间一块（1:1，≤ 768 × 768，RGBA）
 */
export function statsOf(ov, fine) {
  const L = lstar(ov.data, ov.w, ov.h);
  const m = 0.04;
  const cx0 = Math.floor(ov.w * m);
  const cy0 = Math.floor(ov.h * m);
  const cw = Math.max(1, Math.ceil(ov.w * (1 - m)) - cx0);
  const ch = Math.max(1, Math.ceil(ov.h * (1 - m)) - cy0);
  // 平均色（线性光里平均）+ 最暗 10 % 的颜色（近似色木纹的「纹」）
  let r = 0;
  let g = 0;
  let b = 0;
  const Lc = new Float32Array(cw * ch);
  let n = 0;
  for (let y = cy0; y < cy0 + ch; y++)
    for (let x = cx0; x < cx0 + cw; x++) {
      const i = y * ov.w + x;
      const j = i * 4;
      r += LUT[ov.data[j]];
      g += LUT[ov.data[j + 1]];
      b += LUT[ov.data[j + 2]];
      Lc[n++] = L[i];
    }
  r /= n;
  g /= n;
  b /= n;
  const hex = rgbHex(linToSrgb(r) * 255, linToSrgb(g) * 255, linToSrgb(b) * 255);
  const lab = linLab(srgbToLin(parseInt(hex.slice(1, 3), 16) / 255), srgbToLin(parseInt(hex.slice(3, 5), 16) / 255), srgbToLin(parseInt(hex.slice(5, 7), 16) / 255));
  const sorted = Float32Array.from(Lc).sort();
  const p10 = sorted[Math.floor(sorted.length * 0.1)];
  let dr = 0;
  let dg = 0;
  let db = 0;
  let dn = 0;
  for (let y = cy0; y < cy0 + ch; y++)
    for (let x = cx0; x < cx0 + cw; x++) {
      const i = y * ov.w + x;
      if (L[i] > p10) continue;
      const j = i * 4;
      dr += LUT[ov.data[j]];
      dg += LUT[ov.data[j + 1]];
      db += LUT[ov.data[j + 2]];
      dn++;
    }
  const dark = dn ? rgbHex(linToSrgb(dr / dn) * 255, linToSrgb(dg / dn) * 255, linToSrgb(db / dn) * 255) : hex;
  const Lstd = std(Lc);
  const tc = tensor(Lc, cw, ch, 1.0);
  // 细节：原图中间一块（细直纹 2–6 mm 在 512 的概览上看不见）
  const Lf = lstar(fine.data, fine.w, fine.h);
  const LstdFine = std(gauss(Lf, fine.w, fine.h, 1.0));
  const tf = tensor(Lf, fine.w, fine.h, 1.5);
  const per = periodic(grey(fine.data, fine.w, fine.h), fine.w, fine.h);
  const useFine = tf.coh >= tc.coh;
  return {
    hex,
    dark,
    lab: lab.map((v) => Math.round(v * 10) / 10),
    Lstd: +Lstd.toFixed(2),
    LstdFine: +LstdFine.toFixed(2),
    cohOverview: +tc.coh.toFixed(3),
    cohFine: +tf.coh.toFixed(3),
    grainDeg: +(useFine ? tf.deg : tc.deg).toFixed(1),
    perRows: +per.rows.toFixed(3),
    perCols: +per.cols.toFixed(3),
    period: per.period,
  };
}

// ───────────────────────── 接缝（每个方向分开量，R3） ─────────────────────────

export const SEAM_RULE = { ratio: 1.5, eps: 0.002 };

/**
 * 原图四条边（灰度 0–1）：
 *   left / right = 第一列、第二列 / 倒数第二列、最后一列（长度 H）；top / bottom = 第一、二行 / 倒数两行（长度 W）
 * → { x: { seam, inner, ok }, y: { … } }（x = 左右拼起来那条缝，y = 上下）
 */
export function seamsOf({ left0, left1, right1, right0, top0, top1, bottom1, bottom0 }) {
  const md = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / Math.max(1, a.length);
  };
  const one = (a0, a1, z1, z0) => {
    const seam = md(a0, z0);
    const inner = (md(a0, a1) + md(z0, z1)) / 2;
    return { seam: +seam.toFixed(4), inner: +inner.toFixed(4), ok: seam <= SEAM_RULE.ratio * inner + SEAM_RULE.eps };
  };
  return { x: one(left0, left1, right1, right0), y: one(top0, top1, bottom1, bottom0) };
}

/** 原图的接缝 → 存的方向（顺纹竖放）：u = 横纹（左右）、v = 顺纹（上下）。转 90° / 270° 时 x、y 互换 */
export function seamUV(seams, rot) {
  const swap = rot === 90 || rot === 270;
  const u = swap ? seams.y : seams.x;
  const v = swap ? seams.x : seams.y;
  return { u: u.ok ? 'ok' : 'fail', v: v.ok ? 'ok' : 'fail', raw: { u, v } };
}

// ───────────────────────── 编织小样的边框（R4） ─────────────────────────

/**
 * 斜纹方向翻过来的那一圈：gx·gy 的方框平均（半径 r）取正负号，和中间三分之一的正负号比；
 * 每一列（中间一半的行）/ 每一行（中间一半的列）一致的比例第一次超过 0.7 的地方 = 边框宽度。
 * @returns {{ l, r, t, b, inner }}（像素；inner = 中间的正负号）
 */
export function detectBorder(G, w, h, { r = 8, thr = 0.7 } = {}) {
  const J = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const gx = x === 0 ? G[i + 1] - G[i] : x === w - 1 ? G[i] - G[i - 1] : (G[i + 1] - G[i - 1]) / 2;
      const gy = y === 0 ? G[i + w] - G[i] : y === h - 1 ? G[i] - G[i - w] : (G[i + w] - G[i - w]) / 2;
      J[i] = gx * gy;
    }
  const Js = boxZero(J, w, h, r);
  const mid = [];
  for (let y = Math.floor(h / 3); y < Math.floor((2 * h) / 3); y += 2) for (let x = Math.floor(w / 3); x < Math.floor((2 * w) / 3); x += 2) mid.push(Js[y * w + x]);
  const inner = Math.sign(median(mid)) || 1;
  const colA = new Float32Array(w);
  const rowA = new Float32Array(h);
  const ya = Math.floor(h / 4);
  const yb = Math.floor((3 * h) / 4);
  const xa = Math.floor(w / 4);
  const xb = Math.floor((3 * w) / 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ok = Math.sign(Js[y * w + x]) === inner ? 1 : 0;
      if (y >= ya && y < yb) colA[x] += ok;
      if (x >= xa && x < xb) rowA[y] += ok;
    }
  for (let x = 0; x < w; x++) colA[x] /= Math.max(1, yb - ya);
  for (let y = 0; y < h; y++) rowA[y] /= Math.max(1, xb - xa);
  const first = (p) => {
    const n = p.length;
    let a = 0;
    while (a < n && !(p[a] > thr)) a++;
    let z = n - 1;
    while (z >= 0 && !(p[z] > thr)) z--;
    return a >= n ? [0, 0] : [a, n - 1 - z];
  };
  const [l, rr] = first(colA);
  const [t, b] = first(rowA);
  return { l, r: rr, t, b, inner };
}

/**
 * 编织的裁切：边框 + 一个周期的余量（R4），不超过每边 25 %。
 * @returns {[l, t, r, b]}（每边去掉多少像素）
 */
export function weaveCrop(border, period, w, h) {
  const p = Math.max(0, Math.round(period || 0));
  const cap = (v, n) => Math.max(0, Math.min(Math.floor(n * 0.25), v + (v > 0 ? p : 0)));
  return [cap(border.l, w), cap(border.t, h), cap(border.r, w), cap(border.b, h)];
}

// ───────────────────────── 横纹方向烤成无缝（只烤这一个方向，R3） ─────────────────────────

/**
 * 横纹方向烤成无缝（R3，只烤这一个方向）：只动左右两边各 frac 宽的一条带，和对面那条边（绕回来的那一条）交叉淡化。
 * 最外一列 = 两边各一半 → 左右拼起来没有台阶；越往里越接近原图，带子以外一个像素都不动。
 * （以前是整张错开半张再淡化：板中间的节疤会在两边出现一个淡淡的影子；现在两边只混进对面边上的那一条。）
 */
export function bakeAcross(rgba, w, h, frac = 0.06) {
  const out = new Uint8ClampedArray(rgba);
  const band = Math.max(2, Math.min(Math.floor(w / 2) - 1, Math.round(w * frac)));
  for (let k = 0; k < band; k++) {
    const d = k / band;
    const t = 0.5 + 0.5 * (d * d * (3 - 2 * d)); // 边上 0.5（两边一样）→ 带子里面 1（原图）
    const xl = k; // 左边第 k 列 ↔ 右边倒数第 k 列（对面那条边，绕回来接上的那一侧）
    const xr = w - 1 - k;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      const a = (row + xl) * 4;
      const b = (row + xr) * 4;
      for (let c = 0; c < 3; c++) {
        const L0 = rgba[a + c];
        const R0 = rgba[b + c];
        out[a + c] = L0 * t + R0 * (1 - t);
        out[b + c] = R0 * t + L0 * (1 - t);
      }
      out[a + 3] = 255;
      out[b + 3] = 255;
    }
  }
  return out;
}

/** 64 位 dHash（9 × 8 的灰度，横向比较）→ 16 位十六进制（重复 / 换了名字的同一块板） */
export function dhash64(G, w, h) {
  const W = 9;
  const H = 8;
  const a = new Float32Array(W * H);
  const sx = w / W;
  const sy = h / H;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const y0 = Math.floor(y * sy);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      let s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += G[yy * w + xx];
      a[y * W + x] = s / ((y1 - y0) * (x1 - x0));
    }
  let hex = '';
  for (let y = 0; y < H; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) if (a[y * W + x] < a[y * W + x + 1]) byte |= 1 << (7 - x);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
