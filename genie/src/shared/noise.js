// 可平铺（无缝）的噪声工具。纯函数，Node 里也能跑。
//  · hash2 / vnoise / fbm / rng / clamp01 / smooth —— 老接口（家具、房子也在用）
//  · gradTable / perlin / fbmField / samp / sampG —— 新的高速版：先把分形噪声算成一张周期场（Float32Array），
//    再按需要双线性取样。贴图生成全靠它们，1024² 也能在 ~100ms 内画完。
//  · vtable / vlook —— 周期值噪声查表（细节：木材导管、纤维、拉丝）
//  · worley —— 周期 Voronoi（皮革颗粒等）

export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const mod = (a, n) => ((a % n) + n) % n;

/** 值噪声，x/y 为格点坐标；px/py 为周期（格点数），保证在周期处无缝 */
export function vnoise(x, y, px = 1e6, py = 1e6, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const x0 = mod(xi, px);
  const x1 = mod(xi + 1, px);
  const y0 = mod(yi, py);
  const y1 = mod(yi + 1, py);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 分形噪声：每一层频率翻倍、周期也翻倍，所以整体仍然无缝 */
export function fbm(x, y, px, py, oct = 4, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(x * f, y * f, px * f, py * f, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** 可复现的伪随机数 */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ───────────────────────────── 高速周期噪声 ─────────────────────────────

const TAU = Math.PI * 2;

/** 周期梯度表：px × py 个格点，每个格点一个随机单位方向 */
export function gradTable(px, py, seed = 0) {
  const n = px * py;
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  for (let j = 0; j < py; j++) {
    for (let i = 0; i < px; i++) {
      const a = hash2(i, j, seed) * TAU;
      gx[j * px + i] = Math.cos(a);
      gy[j * px + i] = Math.sin(a);
    }
  }
  return { px, py, gx, gy };
}

/** 周期 Perlin 梯度噪声（格点坐标），约 [-0.7, 0.7] */
export function perlin(T, x, y) {
  const { px, py, gx, gy } = T;
  let xi = Math.floor(x);
  let yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  xi %= px;
  if (xi < 0) xi += px;
  yi %= py;
  if (yi < 0) yi += py;
  const x1 = xi + 1 === px ? 0 : xi + 1;
  const r0 = yi * px;
  const r1 = (yi + 1 === py ? 0 : yi + 1) * px;
  const a = gx[r0 + xi] * fx + gy[r0 + xi] * fy;
  const b = gx[r0 + x1] * (fx - 1) + gy[r0 + x1] * fy;
  const c = gx[r1 + xi] * fx + gy[r1 + xi] * (fy - 1);
  const d = gx[r1 + x1] * (fx - 1) + gy[r1 + x1] * (fy - 1);
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * 周期分形场：N×N，值按最小/最大拉伸到 [0,1]。
 * fx / fy = 最低一层在一张贴图里有几个周期（整数 → 无缝）；每层频率 ×2。
 * opts.ridged：脊状（|n|），opts.gain：每层振幅衰减，opts.diag：沿 45° 斜向拉伸（刷痕）。
 */
export function fbmField(N, fx, fy, oct = 5, seed = 0, opts = {}) {
  const gain = opts.gain ?? 0.5;
  const ridged = !!opts.ridged;
  const F = new Float32Array(N * N);
  const xi0 = new Int32Array(N);
  const xi1 = new Int32Array(N);
  const fxs = new Float32Array(N);
  const uxs = new Float32Array(N);
  let amp = 1;
  for (let o = 0; o < oct; o++) {
    const px = fx * (1 << o);
    const py = fy * (1 << o);
    if (o > 0 && (px > N * 0.5 || py > N * 0.5)) break;
    const T = gradTable(px, py, (seed | 0) + o * 1013);
    const { gx, gy } = T;
    for (let x = 0; x < N; x++) {
      const g = ((x + 0.5) / N) * px;
      const i = Math.floor(g);
      const f = g - i;
      xi0[x] = i % px;
      xi1[x] = (i + 1) % px;
      fxs[x] = f;
      uxs[x] = f * f * f * (f * (f * 6 - 15) + 10);
    }
    for (let y = 0; y < N; y++) {
      const g = ((y + 0.5) / N) * py;
      const j = Math.floor(g);
      const fy = g - j;
      const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      const r0 = (j % py) * px;
      const r1 = ((j + 1) % py) * px;
      const row = y * N;
      for (let x = 0; x < N; x++) {
        const f = fxs[x];
        const i0 = xi0[x];
        const i1 = xi1[x];
        const a = gx[r0 + i0] * f + gy[r0 + i0] * fy;
        const b = gx[r0 + i1] * (f - 1) + gy[r0 + i1] * fy;
        const c = gx[r1 + i0] * f + gy[r1 + i0] * (fy - 1);
        const d = gx[r1 + i1] * (f - 1) + gy[r1 + i1] * (fy - 1);
        const u = uxs[x];
        let n = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        if (ridged) n = 0.7 - Math.abs(n);
        F[row + x] += amp * n;
      }
    }
    amp *= gain;
  }
  return normalize(F);
}

/** 斜向拉伸的周期分形场（刷痕 / 抹刀纹）：沿 (1,1) 或 (1,-1) 方向长、横向短 */
export function diagField(N, along, across, oct, seed, dir = 1) {
  // 在 (s,t) = (u+v, u−v) 坐标里取噪声；整数周期 → 原贴图仍无缝
  const F = new Float32Array(N * N);
  let amp = 1;
  for (let o = 0; o < oct; o++) {
    const pa = along * (1 << o);
    const pc = across * (1 << o);
    if (o > 0 && pc > N * 0.5) break;
    const T = gradTable(pa, pc, (seed | 0) + o * 977);
    for (let y = 0; y < N; y++) {
      const v = (y + 0.5) / N;
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N;
        F[y * N + x] += amp * perlin(T, (u + dir * v) * pa, (u - dir * v) * pc);
      }
    }
    amp *= 0.5;
  }
  return normalize(F);
}

/** 拉伸到 [0,1] */
export function normalize(F) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < F.length; i++) {
    const v = F[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const k = hi > lo ? 1 / (hi - lo) : 0;
  for (let i = 0; i < F.length; i++) F[i] = (F[i] - lo) * k;
  return F;
}

/** 在周期场里双线性取样；u/v 以「一张贴图」为 1，任意实数（自动回绕） */
export function samp(F, N, u, v) {
  let x = u * N - 0.5;
  let y = v * N - 0.5;
  let x0 = Math.floor(x);
  let y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  x0 %= N;
  if (x0 < 0) x0 += N;
  y0 %= N;
  if (y0 < 0) y0 += N;
  const x1 = x0 + 1 === N ? 0 : x0 + 1;
  const r0 = y0 * N;
  const r1 = (y0 + 1 === N ? 0 : y0 + 1) * N;
  const a = F[r0 + x0];
  const b = F[r0 + x1];
  const c = F[r1 + x0];
  const d = F[r1 + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** 同 samp，同时给出梯度（每「一张贴图」的变化量）→ out = [value, d/du, d/dv] */
export function sampG(F, N, u, v, out) {
  let x = u * N - 0.5;
  let y = v * N - 0.5;
  let x0 = Math.floor(x);
  let y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  x0 %= N;
  if (x0 < 0) x0 += N;
  y0 %= N;
  if (y0 < 0) y0 += N;
  const x1 = x0 + 1 === N ? 0 : x0 + 1;
  const r0 = y0 * N;
  const r1 = (y0 + 1 === N ? 0 : y0 + 1) * N;
  const a = F[r0 + x0];
  const b = F[r0 + x1];
  const c = F[r1 + x0];
  const d = F[r1 + x1];
  const e = a - b - c + d;
  out[0] = a + (b - a) * tx + (c - a) * ty + e * tx * ty;
  out[1] = (b - a + e * ty) * N;
  out[2] = (c - a + e * tx) * N;
  return out;
}

/** 周期值噪声表（Px×Py，[0,1)） */
export function vtable(Px, Py, seed = 0) {
  const T = new Float32Array(Px * Py);
  for (let j = 0; j < Py; j++) for (let i = 0; i < Px; i++) T[j * Px + i] = hash2(i, j, seed);
  return T;
}

/** 在值噪声表里平滑取样（格点坐标，x 周期 Px、y 周期 Py） */
export function vlook(T, Px, Py, x, y) {
  let xi = Math.floor(x);
  let yi = Math.floor(y);
  let fx = x - xi;
  let fy = y - yi;
  xi %= Px;
  if (xi < 0) xi += Px;
  yi %= Py;
  if (yi < 0) yi += Py;
  const x1 = xi + 1 === Px ? 0 : xi + 1;
  const r0 = yi * Px;
  const r1 = (yi + 1 === Py ? 0 : yi + 1) * Px;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = T[r0 + xi];
  const b = T[r0 + x1];
  const c = T[r1 + xi];
  const d = T[r1 + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * 周期 Voronoi：n×n 个格子、每格一个抖动点。x/y 为格子坐标（0…n 为一张贴图）。
 * out = [F1, F2, 最近点 id, 最近点 x, 最近点 y]（距离单位：格子）
 */
export function worley(x, y, n, seed, out, jitter = 0.9) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  let bx = 0;
  let by = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx;
      const cy = yi + dy;
      const wx = ((cx % n) + n) % n;
      const wy = ((cy % n) + n) % n;
      const h = hash2(wx, wy, seed);
      const h2 = hash2(wx, wy, seed + 7);
      const px = cx + 0.5 + (h - 0.5) * jitter;
      const py = cy + 0.5 + (h2 - 0.5) * jitter;
      const ddx = px - x;
      const ddy = py - y;
      const d = ddx * ddx + ddy * ddy;
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = wy * n + wx;
        bx = px;
        by = py;
      } else if (d < f2) f2 = d;
    }
  }
  out[0] = Math.sqrt(f1);
  out[1] = Math.sqrt(f2);
  out[2] = id;
  out[3] = bx;
  out[4] = by;
  return out;
}
