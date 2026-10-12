// test/walls.test.mjs 的工具：PNG 解码（无依赖）、退化（缩小 / 放大 / JPEG 量化）、和真值比较的指标。
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

// ───────────── PNG（灰度 / RGB / 调色板 / 透明；1–16 位；不隔行） → RGBA ImageData ─────────────
export function decodePNG(buf) {
  if (typeof buf === 'string') buf = readFileSync(buf);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('not a PNG');
  let p = 8;
  let W = 0;
  let H = 0;
  let depth = 8;
  let ctype = 0;
  let interlace = 0;
  let pal = null;
  let trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      W = d.readUInt32BE(0);
      H = d.readUInt32BE(4);
      depth = d[8];
      ctype = d[9];
      interlace = d[12];
    } else if (type === 'PLTE') pal = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (interlace) throw new Error('interlaced PNG not supported');
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const bpp = Math.max(1, (chans * depth) >> 3);
  const stride = Math.ceil((W * chans * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(stride * H);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    prev = cur;
  }
  const out = new Uint8ClampedArray(W * H * 4);
  const sample = (row, idx) => {
    // idx = sample index in the row (channel-interleaved)
    if (depth === 8) return row[idx];
    if (depth === 16) return row[idx * 2];
    const per = 8 / depth;
    const byte = row[Math.floor(idx / per)];
    const shift = 8 - depth * ((idx % per) + 1);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  const scale = depth < 8 && ctype !== 3 ? 255 / ((1 << depth) - 1) : 1;
  for (let y = 0; y < H; y++) {
    const row = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (ctype === 3) {
        const k = sample(row, x);
        out[o] = pal[k * 3];
        out[o + 1] = pal[k * 3 + 1];
        out[o + 2] = pal[k * 3 + 2];
        out[o + 3] = trns && k < trns.length ? trns[k] : 255;
      } else if (ctype === 0 || ctype === 4) {
        const v = sample(row, x * chans) * scale;
        out[o] = out[o + 1] = out[o + 2] = v;
        out[o + 3] = ctype === 4 ? sample(row, x * chans + 1) * scale : 255;
      } else {
        out[o] = sample(row, x * chans);
        out[o + 1] = sample(row, x * chans + 1);
        out[o + 2] = sample(row, x * chans + 2);
        out[o + 3] = ctype === 6 ? sample(row, x * chans + 3) : 255;
      }
    }
  }
  return { width: W, height: H, data: out };
}

// ───────────── 退化 ─────────────
export function toGrey(img) {
  const { width: W, height: H, data } = img;
  const g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = (data[i * 4] * 77 + data[i * 4 + 1] * 151 + data[i * 4 + 2] * 28) / 256;
  return { W, H, g };
}

export function fromGrey({ W, H, g }) {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const v = g[i];
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return { width: W, height: H, data: out };
}

/** 面积平均缩放（s < 1 缩小）/ 双线性放大（s > 1） */
export function resize(img, s) {
  const G = toGrey(img);
  const W2 = Math.max(1, Math.round(G.W * s));
  const H2 = Math.max(1, Math.round(G.H * s));
  const o = new Float32Array(W2 * H2);
  if (s < 1) {
    const sum = new Float32Array(W2 * H2);
    const cnt = new Float32Array(W2 * H2);
    for (let y = 0; y < G.H; y++) {
      const yy = Math.min(H2 - 1, Math.floor(y * s));
      for (let x = 0; x < G.W; x++) {
        const k = yy * W2 + Math.min(W2 - 1, Math.floor(x * s));
        sum[k] += G.g[y * G.W + x];
        cnt[k]++;
      }
    }
    for (let k = 0; k < W2 * H2; k++) o[k] = cnt[k] ? sum[k] / cnt[k] : 255;
  } else {
    for (let y = 0; y < H2; y++) {
      const fy = Math.min(G.H - 1, Math.max(0, (y + 0.5) / s - 0.5));
      const y0 = Math.floor(fy);
      const y1 = Math.min(G.H - 1, y0 + 1);
      const ty = fy - y0;
      for (let x = 0; x < W2; x++) {
        const fx = Math.min(G.W - 1, Math.max(0, (x + 0.5) / s - 0.5));
        const x0 = Math.floor(fx);
        const x1 = Math.min(G.W - 1, x0 + 1);
        const tx = fx - x0;
        const a = G.g[y0 * G.W + x0] * (1 - tx) + G.g[y0 * G.W + x1] * tx;
        const b = G.g[y1 * G.W + x0] * (1 - tx) + G.g[y1 * G.W + x1] * tx;
        o[y * W2 + x] = a * (1 - ty) + b * ty;
      }
    }
  }
  return fromGrey({ W: W2, H: H2, g: o });
}

/** JPEG 的有损部分（8×8 DCT + 标准亮度量化表 + 取整）—— 熵编码无损，不用模拟 */
const QL = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
export function jpegLike(img, quality = 60) {
  const G = toGrey(img);
  const sc = quality < 50 ? 5000 / quality : 200 - 2 * quality;
  const q = QL.map((v) => Math.max(1, Math.min(255, Math.floor((v * sc + 50) / 100))));
  const C = new Float64Array(64);
  for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) C[u * 8 + x] = (u === 0 ? Math.SQRT1_2 : 1) * 0.5 * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  const blk = new Float64Array(64);
  const tmp = new Float64Array(64);
  const co = new Float64Array(64);
  const o = new Float32Array(G.W * G.H);
  for (let by = 0; by < G.H; by += 8)
    for (let bx = 0; bx < G.W; bx += 8) {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) blk[y * 8 + x] = G.g[Math.min(G.H - 1, by + y) * G.W + Math.min(G.W - 1, bx + x)] - 128;
      for (let y = 0; y < 8; y++)
        for (let u = 0; u < 8; u++) {
          let s = 0;
          for (let x = 0; x < 8; x++) s += C[u * 8 + x] * blk[y * 8 + x];
          tmp[y * 8 + u] = s;
        }
      for (let v = 0; v < 8; v++)
        for (let u = 0; u < 8; u++) {
          let s = 0;
          for (let y = 0; y < 8; y++) s += C[v * 8 + y] * tmp[y * 8 + u];
          co[v * 8 + u] = Math.round(s / q[v * 8 + u]) * q[v * 8 + u];
        }
      for (let v = 0; v < 8; v++)
        for (let x = 0; x < 8; x++) {
          let s = 0;
          for (let u = 0; u < 8; u++) s += C[u * 8 + x] * co[v * 8 + u];
          tmp[v * 8 + x] = s;
        }
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          let s = 0;
          for (let v = 0; v < 8; v++) s += C[v * 8 + y] * tmp[v * 8 + x];
          const yy = by + y;
          const xx = bx + x;
          if (yy < G.H && xx < G.W) o[yy * G.W + xx] = Math.max(0, Math.min(255, s + 128));
        }
    }
  return fromGrey({ W: G.W, H: G.H, g: o });
}

/** 裁一块（像素） */
export function crop(img, x0, y0, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.max(0, y0 + y));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.max(0, x0 + x));
      const i = (sy * img.width + sx) * 4;
      const o = (y * w + x) * 4;
      out[o] = img.data[i];
      out[o + 1] = img.data[i + 1];
      out[o + 2] = img.data[i + 2];
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

// ───────────── 指标 ─────────────

/** 检测结果（像素）→ 米：px / pxPerM − origin */
export function detToMetres(res, pxPerM, origin) {
  const X = (v) => v / pxPerM - origin[0];
  const Y = (v) => v / pxPerM - origin[1];
  const walls = res.walls.map((w) => {
    const h = Math.abs(w.y1 - w.y2) < Math.abs(w.x1 - w.x2);
    return h ? { axis: 'h', c: Y((w.y1 + w.y2) / 2), a: X(Math.min(w.x1, w.x2)), b: X(Math.max(w.x1, w.x2)), t: w.t / pxPerM, ext: w.ext } : { axis: 'v', c: X((w.x1 + w.x2) / 2), a: Y(Math.min(w.y1, w.y2)), b: Y(Math.max(w.y1, w.y2)), t: w.t / pxPerM, ext: w.ext };
  });
  const gaps = res.gaps.map((g) => {
    const w = walls[g.wall];
    const isH = w.axis === 'h';
    return { kind: g.kind, axis: w.axis, c: w.c, a: (isH ? X(g.a) : Y(g.a)), b: (isH ? X(g.b) : Y(g.b)), arc: g.arc };
  });
  const faces = res.faces.map((f) => ({ stairs: !!f.stairs, rects: f.rects.map((r) => [X(r.x), Y(r.y), r.w / pxPerM, r.h / pxPerM]) }));
  return { walls, gaps, faces };
}

/** 墙长的 precision / recall（±tol m，按 1 cm 采样；同方向、中线距离 ≤ tol、沿墙方向在 [a − tol, b + tol] 里） */
export function wallPR(det, truth, tol = 0.1) {
  const covered = (segs, axis, c, u) => segs.some((s) => s.axis === axis && Math.abs(s.c - c) <= tol && u >= s.a - tol && u <= s.b + tol);
  let tp = 0;
  let dl = 0;
  const fps = [];
  for (const s of det) {
    let bad = 0;
    for (let u = s.a; u <= s.b; u += 0.01) {
      dl++;
      if (covered(truth, s.axis, s.c, u)) tp++;
      else bad++;
    }
    if (bad * 0.01 > 0.05) fps.push({ ...s, bad: +(bad * 0.01).toFixed(2) });
  }
  let rc = 0;
  let tl = 0;
  const misses = [];
  for (const s of truth) {
    let miss = 0;
    for (let u = s.a; u <= s.b; u += 0.01) {
      tl++;
      if (covered(det, s.axis, s.c, u)) rc++;
      else miss++;
    }
    if (miss * 0.01 > 0.05) misses.push({ axis: s.axis, c: s.c, a: s.a, b: s.b, miss: +(miss * 0.01).toFixed(2) });
  }
  return { precision: dl ? tp / dl : 1, recall: tl ? rc / tl : 1, detM: dl / 100, truthM: tl / 100, fps, misses };
}

/** 开口（门 / 窗 / ...）：同方向、中线 ≤ 0.15 m、区间 IoU ≥ 0.5 */
export function openingPR(detGaps, truthOps, kinds) {
  const D = detGaps.filter((g) => kinds.includes(g.kind));
  const T = truthOps.filter((o) => kinds.includes(o.kind === 'open' ? 'opening' : o.kind));
  const iou = (a, b) => Math.max(0, Math.min(a.b, b.b) - Math.max(a.a, b.a)) / (Math.max(a.b, b.b) - Math.min(a.a, b.a));
  const usedT = new Set();
  let tp = 0;
  const fp = [];
  for (const d of D) {
    let best = -1;
    let bv = 0.5;
    T.forEach((t, i) => {
      if (usedT.has(i) || t.axis !== d.axis || Math.abs(t.c - d.c) > 0.15) return;
      const v = iou(d, t);
      if (v >= bv) {
        bv = v;
        best = i;
      }
    });
    if (best >= 0) {
      usedT.add(best);
      tp++;
    } else fp.push(d);
  }
  const fn = T.filter((t, i) => !usedT.has(i));
  return { precision: D.length ? tp / D.length : 1, recall: T.length ? tp / T.length : 1, tp, det: D.length, truth: T.length, fp, fn };
}

/** 房间面：每个真值面找 IoU 最大的检测面（2 cm 栅格），取平均 */
export function faceIoU(detFaces, truthFaces) {
  const cell = 0.02;
  const raster = (rects, x0, y0, gw, gh) => {
    const m = new Uint8Array(gw * gh);
    for (const [x, y, w, d] of rects) {
      const i0 = Math.max(0, Math.round((x - x0) / cell));
      const i1 = Math.min(gw, Math.round((x + w - x0) / cell));
      const j0 = Math.max(0, Math.round((y - y0) / cell));
      const j1 = Math.min(gh, Math.round((y + d - y0) / cell));
      for (let j = j0; j < j1; j++) m.fill(1, j * gw + i0, j * gw + i1);
    }
    return m;
  };
  const all = [...detFaces.flatMap((f) => f.rects), ...truthFaces.flatMap((f) => f.rects)];
  if (!all.length) return { mean: 1, per: [] };
  const x0 = Math.min(...all.map((r) => r[0])) - 0.1;
  const y0 = Math.min(...all.map((r) => r[1])) - 0.1;
  const gw = Math.ceil((Math.max(...all.map((r) => r[0] + r[2])) - x0 + 0.1) / cell);
  const gh = Math.ceil((Math.max(...all.map((r) => r[1] + r[3])) - y0 + 0.1) / cell);
  const D = detFaces.map((f) => raster(f.rects, x0, y0, gw, gh));
  const per = [];
  for (const t of truthFaces) {
    const T = raster(t.rects, x0, y0, gw, gh);
    let best = 0;
    for (const d of D) {
      let inter = 0;
      let uni = 0;
      for (let k = 0; k < T.length; k++) {
        if (T[k] && d[k]) inter++;
        if (T[k] || d[k]) uni++;
      }
      if (uni && inter / uni > best) best = inter / uni;
    }
    per.push({ rooms: t.rooms, iou: best, stairs: t.stairs });
  }
  return { mean: per.reduce((v, p) => v + p.iou, 0) / per.length, per };
}

/** 开放式空间里凭空多出来的墙：检测到的实心墙段（扣掉开口），≥ 0.3 m、离任何真墙 > 0.15 m、在开放式空间（真值面，≥ 2 个开放房间）里面 */
export function inventedOpenPlan(det, detGaps, truth) {
  const openRects = truth.faces.filter((f) => f.open).flatMap((f) => f.rects);
  const inside = (x, y) => openRects.some(([rx, ry, rw, rd]) => x > rx + 0.15 && x < rx + rw - 0.15 && y > ry + 0.15 && y < ry + rd - 0.15);
  const nearTruth = (axis, c, u) => truth.walls.some((s) => s.axis === axis && Math.abs(s.c - c) <= 0.15 && u >= s.a - 0.15 && u <= s.b + 0.15);
  let pieces = 0;
  let metres = 0;
  det.forEach((s, i) => {
    const holes = detGaps.filter((g) => g.axis === s.axis && Math.abs(g.c - s.c) < 1e-6 && g.a >= s.a - 1e-6 && g.b <= s.b + 1e-6);
    let run = 0;
    for (let u = s.a; u <= s.b + 1e-9; u += 0.01) {
      const inHole = holes.some((g) => u > g.a && u < g.b);
      const [x, y] = s.axis === 'h' ? [u, s.c] : [s.c, u];
      const bad = !inHole && !nearTruth(s.axis, s.c, u) && inside(x, y);
      if (bad) run++;
      if (!bad || u + 0.01 > s.b) {
        if (run * 0.01 >= 0.3) {
          pieces++;
          metres += run * 0.01;
        }
        run = 0;
      }
    }
  });
  return { pieces, metres: +metres.toFixed(2) };
}
