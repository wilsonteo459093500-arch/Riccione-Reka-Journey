// 展厅播放 ·「从无到有」：效果图进场时先在白纸上画出线稿，再一块块上色，最后停在原图。
//
// 准确性：线稿是从效果图本身的像素算出来的（模糊 → Sobel 边缘），不是 AI 画的，位置、比例和原图一模一样；
// 上色显露的是原图本身的像素；colQ = 1 时输出和原图逐像素相同（测试锁住），停点上播放器再换回原图 <img>。
// 纯函数（不碰 DOM），Node 可测；浏览器里在 Web Worker 里跑 analyseSketch（sketch.worker.js）。

export const PAPER = [243, 238, 231]; // B.paper F3EEE7
export const INK = [62, 50, 40]; // 线稿墨色（暖深棕）
/** 线稿的工作宽度（px）：再大逐帧合成会慢；放到 1920 的版面上看起来是铅笔线的柔度 */
export const SKETCH_W = 1120;

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};

/** 固定种子的随机数（同一张图每次播放都一样） */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 3×3 均值模糊 */
function blur(a, W, H) {
  const o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          s += a[yy * W + xx];
          n++;
        }
      }
      o[y * W + x] = s / n;
    }
  }
  return o;
}

/**
 * 分析一张图（RGBA）：
 *   mag    边缘强度 0–1（结构线强、纹理弱）
 *   order  线条出现的先后 0–1（强的结构线先、由左到右的笔势、少量随机）
 *   reveal 上色的先后 0–1（按颜色分区：浅的墙 / 顶先、深的木作 / 家具后，边缘像水彩晕开）
 * @param {Uint8ClampedArray} data  RGBA
 */
export function analyseSketch(data, W, H) {
  const N = W * H;
  const gray = new Float32Array(N);
  for (let i = 0; i < N; i++) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  const b = blur(blur(gray, W, H), W, H); // 去掉木纹、布纹的碎线，只留结构线
  const mag = new Float32Array(N);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = -b[i - W - 1] - 2 * b[i - 1] - b[i + W - 1] + b[i - W + 1] + 2 * b[i + 1] + b[i + W + 1];
      const gy = -b[i - W - 1] - 2 * b[i - W] - b[i - W + 1] + b[i + W - 1] + 2 * b[i + W] + b[i + W + 1];
      mag[i] = Math.hypot(gx, gy);
    }
  }
  // 按 98.5 分位归一（不同亮度的效果图，线的浓淡差不多）
  const sample = [];
  for (let i = 0; i < N; i += 7) sample.push(mag[i]);
  sample.sort((p, q) => p - q);
  const hi = sample[Math.floor(sample.length * 0.985)] || 1;
  for (let i = 0; i < N; i++) mag[i] = Math.min(1, mag[i] / hi);

  // 颜色分区：k-means（k = 7，缩小取样训练）
  const K = 7;
  const samples = [];
  for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) {
    const i = (y * W + x) * 4;
    samples.push([data[i], data[i + 1], data[i + 2]]);
  }
  let cent = Array.from({ length: K }, (_, k) => samples[Math.floor(((k + 0.5) / K) * samples.length)].slice());
  const nearest = (r, g, bl) => {
    let best = 0;
    let bd = Infinity;
    for (let k = 0; k < K; k++) {
      const d = (r - cent[k][0]) ** 2 + (g - cent[k][1]) ** 2 + (bl - cent[k][2]) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  };
  for (let it = 0; it < 8; it++) {
    const sum = Array.from({ length: K }, () => [0, 0, 0, 0]);
    for (const s of samples) {
      const t = sum[nearest(s[0], s[1], s[2])];
      t[0] += s[0];
      t[1] += s[1];
      t[2] += s[2];
      t[3]++;
    }
    cent = cent.map((c, k) => (sum[k][3] ? [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]] : c));
  }
  const rank = new Array(K);
  cent
    .map((c, k) => [0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], k])
    .sort((p, q) => q[0] - p[0])
    .forEach(([, k], r) => (rank[k] = r / (K - 1)));

  // 低频噪声（水彩晕开的形状、笔势里的一点随机）
  const rnd = mulberry32(W * 7919 + H);
  const GX = 18;
  const GY = 11;
  const grid = Array.from({ length: (GX + 1) * (GY + 1) }, () => rnd());
  const noise = (x, y) => {
    const fx = (x / W) * GX;
    const fy = (y / H) * GY;
    const ix = Math.min(GX - 1, Math.floor(fx));
    const iy = Math.min(GY - 1, Math.floor(fy));
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const g = (gx, gy) => grid[gy * (GX + 1) + gx];
    return (g(ix, iy) * (1 - sx) + g(ix + 1, iy) * sx) * (1 - sy) + (g(ix, iy + 1) * (1 - sx) + g(ix + 1, iy + 1) * sx) * sy;
  };

  let reveal = new Float32Array(N);
  const order = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const p = i * 4;
      const nz = noise(x, y);
      reveal[i] = rank[nearest(data[p], data[p + 1], data[p + 2])] * 0.7 + nz * 0.3;
      order[i] = (1 - mag[i]) * 0.65 + (x / W) * 0.25 + nz * 0.1;
    }
  }
  for (let k = 0; k < 4; k++) reveal = blur(reveal, W, H); // 色块边柔化（不出锯齿）
  return { W, H, mag, order, reveal };
}

/**
 * 合成一帧（RGBA 写进 out）
 * @param {{ W, H, mag, order, reveal }} an  analyseSketch 的结果
 * @param {Uint8ClampedArray} src  原图 RGBA（同尺寸）
 * @param {number} lineQ  线稿进度 0–1（0 = 白纸）
 * @param {number} colQ   上色进度 0–1（1 = 原图，逐像素相同）
 * @param {Uint8ClampedArray} out
 */
export function sketchFrame(an, src, lineQ, colQ, out) {
  const { mag, order, reveal } = an;
  const N = an.W * an.H;
  const drawT = clamp(lineQ) * 1.15;
  const cq = clamp(colQ) * 1.3;
  for (let i = 0; i < N; i++) {
    const la = clamp((drawT - order[i]) / 0.08) * clamp((mag[i] - 0.16) / 0.3);
    const ca = ease((cq - reveal[i]) / 0.22);
    const l2 = la * (1 - ca);
    const p = i * 4;
    for (let k = 0; k < 3; k++) {
      const base = PAPER[k] * (1 - l2) + INK[k] * l2;
      out[p + k] = ca >= 1 ? src[p + k] : base * (1 - ca) + src[p + k] * ca;
    }
    out[p + 3] = 255;
  }
  return out;
}
