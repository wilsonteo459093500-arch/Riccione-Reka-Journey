// Procedural "grey photocopy, scanned" degradation for the evaluator's fixtures (keeps the PNGs small: apply it to *-pdf.png at test time).
// photocopy(img, { seed, skewDeg, cx, cy }) → ImageData-like (RGBA). Pure, deterministic, no deps.
//   toner density varies (0.55–0.9) in big blotches, thin strokes break where a fine noise field is low, paper is grey (≈ 0.84)
//   with a left→right darkening, Gaussian-ish noise, toner specks, a 3×3 blur, a small rotation about (cx, cy) (px), then the JPEG
//   round trip (harness.jpegLike q70). Mirrors fx/var/*-scan.png made by make_fixtures.py (PIL), not bit-identical.
// Pass harness.jpegLike as `jpeg` (test/fixtures/walls/harness.mjs) for the scanner's JPEG round trip; without it no JPEG step.

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
/** smooth value noise in [0, 1] with cells of `cell` px */
function valueNoise(W, H, cell, R) {
  const gw = Math.ceil(W / cell) + 2;
  const gh = Math.ceil(H / cell) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = R();
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = y / cell;
    const j = Math.floor(fy);
    const ty = fy - j;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < W; x++) {
      const fx = x / cell;
      const i = Math.floor(fx);
      const tx = fx - i;
      const sx = tx * tx * (3 - 2 * tx);
      const a = g[j * gw + i] * (1 - sx) + g[j * gw + i + 1] * sx;
      const b = g[(j + 1) * gw + i] * (1 - sx) + g[(j + 1) * gw + i + 1] * sx;
      out[y * W + x] = a * (1 - sy) + b * sy;
    }
  }
  return out;
}

export function photocopy(img, { seed = 42, skewDeg = 0.3, cx = img.width / 2, cy = img.height / 2, jpeg = null } = {}) {
  const { width: W, height: H, data } = img;
  const ch = Math.round(data.length / (W * H));
  const R = rng(seed);
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = ch >= 3 ? (data[i * ch] * 77 + data[i * ch + 1] * 151 + data[i * ch + 2] * 28) / 65536 : data[i * ch] / 255;
  const tone = valueNoise(W, H, 160, R);
  const drop = valueNoise(W, H, 8, R);
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      let ink = 1 - L[k];
      ink *= 0.55 + 0.35 * tone[k];
      if (drop[k] < 0.22) ink *= 0.35;
      const paper = 0.84 + 0.08 * (tone[k] - 0.5) - 0.05 * (x / W);
      let v = paper * (1 - ink) + 0.12 * ink;
      v += (R() + R() + R() - 1.5) * 0.035;
      if (R() < 0.0004) v = 0.25;
      g[k] = v;
    }
  // 3×3 blur
  const b = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
          const w = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          s += g[yy * W + xx] * w;
          n += w;
        }
      b[y * W + x] = s / n;
    }
  // rotate about (cx, cy), bilinear
  const th = (skewDeg * Math.PI) / 180;
  const c = Math.cos(th);
  const sn = Math.sin(th);
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = cx + c * dx - sn * dy;
      const sy = cy + sn * dx + c * dy;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      let v = 0.82;
      if (x0 >= 0 && y0 >= 0 && x0 + 1 < W && y0 + 1 < H) {
        const tx = sx - x0;
        const ty = sy - y0;
        v = (b[y0 * W + x0] * (1 - tx) + b[y0 * W + x0 + 1] * tx) * (1 - ty) + (b[(y0 + 1) * W + x0] * (1 - tx) + b[(y0 + 1) * W + x0 + 1] * tx) * ty;
      }
      const o = (y * W + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = Math.max(0, Math.min(255, v * 255));
      out[o + 3] = 255;
    }
  const res = { width: W, height: H, data: out };
  return jpeg ? jpeg(res, 70) : res;
}
