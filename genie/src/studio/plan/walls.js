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

export const WALL_T = { min: 0.065, max: 0.3 }; // 墙厚范围（m）：100–230 mm 的砖墙 + 余量
export const DOOR_W = { min: 0.5, max: 1.35, double: 2.1 }; // 门洞宽（m）
export const OPENING_MAX = 3.2; // 两段同一条线上的墙之间，空着不超过这么宽 = 一个开口（打通 / 拱门）

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

/** 阈值：先按块取纸色（块内最亮），再在「灰度 / 纸色」上做 Otsu。返回 { thr (0–255，对纸色 255 而言), bg, bw, bh, B } */
export function inkThreshold(img) {
  const { width: W, height: H, data } = img;
  const ch = Math.max(1, Math.round(data.length / (W * H)));
  const B = Math.max(32, Math.round(Math.min(W, H) / 24));
  const bw = Math.ceil(W / B);
  const bh = Math.ceil(H / B);
  const bmax = new Uint8Array(bw * bh);
  const lum = (i) => {
    if (ch === 1) return data[i];
    if (ch === 2) return 255 - (((255 - data[i * 2]) * data[i * 2 + 1]) >> 8);
    const j = i * ch;
    const l = (data[j] * 77 + data[j + 1] * 151 + data[j + 2] * 28) >> 8;
    return ch === 4 && data[j + 3] < 255 ? 255 - (((255 - l) * data[j + 3]) >> 8) : l;
  };
  for (let y = 0; y < H; y += 2) {
    const row = (y / B) | 0;
    for (let x = 0; x < W; x += 2) {
      const v = lum(y * W + x);
      const k = row * bw + ((x / B) | 0);
      if (v > bmax[k]) bmax[k] = v;
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
  for (let y = 1; y < H; y += 3) {
    const row = ((y / B) | 0) * bw;
    for (let x = 1; x < W; x += 3) {
      const v = Math.min(255, ((lum(y * W + x) * 255) / bg[row + ((x / B) | 0)]) | 0);
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
  return { thr: clamp(thr + 1, 70, 215), bg, bw, bh, B, ch, lum, bgMean: bgSum / (bw * bh) };
}

/** 二值化并缩小 f 倍（块里任何一个墨点 → 墨）。返回 { m: Uint8Array(w*h)（1 = 墨）, w, h, f, ink } */
export function binarize(img, f = 1, T = inkThreshold(img)) {
  const { width: W, height: H } = img;
  const w = Math.ceil(W / f);
  const h = Math.ceil(H / f);
  const m = new Uint8Array(w * h);
  const { thr, bg, bw, B, lum } = T;
  let ink = 0;
  for (let y = 0; y < H; y++) {
    const brow = ((y / B) | 0) * bw;
    const orow = ((y / f) | 0) * w;
    for (let x = 0; x < W; x++) {
      const l = lum(y * W + x);
      if (l * 255 < thr * bg[brow + ((x / B) | 0)]) {
        const k = orow + ((x / f) | 0);
        if (!m[k]) {
          m[k] = 1;
          ink++;
        }
      }
    }
  }
  return { m, w, h, f, ink };
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
function bandSlices(M, W, H, P, pat) {
  const { lw, tmin, tmax } = P;
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
      let j = i + 1;
      while (j + 1 < n && re[j + 1] - rs[j + 1] <= lw && Math.abs(rs[j + 1] - re[j] - g0) <= tol) j++;
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
      while (c1 + 1 < m && rs[idx[c1 + 1]] - re[idx[c1]] <= tmax) c1++;
      let lastSolid = -1;
      for (let p = c0; p <= c1; p++) {
        const sp = rs[idx[p]];
        let q = p;
        while (q + 1 <= c1 && re[idx[q + 1]] - sp <= tmax) q++;
        if (re[idx[q]] - sp > tmax) continue; // 这一段自己就太长（顺着看的墙 / 大块）
        const span = re[idx[q]] - sp;
        const leftMax = p === c0 || re[idx[q]] - rs[idx[p - 1]] > tmax;
        if (leftMax && span >= tmin) {
          if (p === q) {
            if (span > lw) {
              out.r.push(r);
              out.s.push(sp);
              out.e.push(re[idx[q]]);
              out.k.push(0);
              out.nl.push(1);
              out.ink.push(span);
              lastSolid = p;
            }
          } else {
            let ink = 0;
            let thick = 0;
            for (let k = p; k <= q; k++) {
              const L = re[idx[k]] - rs[idx[k]];
              ink += L;
              if (L > lw) thick++;
            }
            out.r.push(r);
            out.s.push(sp);
            out.e.push(re[idx[q]]);
            out.k.push(thick ? 2 : 1);
            out.nl.push(q - p + 1);
            out.ink.push(ink);
          }
        }
        // 窗口里的单独一段实心（墙旁边贴着一条细线时，墙自己也报一次）
        if (p !== q || !leftMax)
          for (let k = p; k <= q; k++) {
            const L = re[idx[k]] - rs[idx[k]];
            if (k > lastSolid && L > lw && L >= tmin && L <= tmax) {
              out.r.push(r);
              out.s.push(rs[idx[k]]);
              out.e.push(re[idx[k]]);
              out.k.push(0);
              out.nl.push(1);
              out.ink.push(L);
              lastSolid = k;
            }
          }
      }
      c0 = c1 + 1;
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
  for (const k of ch.ids) {
    cs.push((sl.s.a[k] + sl.e.a[k]) / 2);
    ts.push(sl.e.a[k] - sl.s.a[k]);
    if (sl.k.a[k] === 0) solid++;
    else if (sl.k.a[k] === 1) multi++;
  }
  return { o, c: median(cs), t: median(ts), a: ch.first, b: ch.last + 1, n: ch.ids.length, multi: multi / ch.ids.length, solid: solid / ch.ids.length, ids: ch.ids, sl };
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
  // 横向长度：某像素所在的横向 / 纵向墨段长
  const runLenH = (x, y) => {
    const r = y * w;
    let a = x;
    let b = x;
    while (a > 0 && m[r + a - 1]) a--;
    while (b < w - 1 && m[r + b + 1]) b++;
    return b - a + 1;
  };
  const runLenV = (x, y) => {
    let a = y;
    let b = y;
    while (a > 0 && m[(a - 1) * w + x]) a--;
    while (b < h - 1 && m[(b + 1) * w + x]) b++;
    return b - a + 1;
  };
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
  let f = pxPerM ? Math.max(1, Math.floor(pxPerM / 75)) : Math.max(1, Math.round(Math.sqrt((W * H) / 3e6)));
  let B = binarize(img, f, T);
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
      pxPerM = (est * f) | 0 || est * f;
      scaleSource = 'walls';
      const f2 = Math.max(1, Math.floor(pxPerM / 75));
      if (f2 !== f && (f2 >= 2 * f || f2 * 2 <= f)) {
        f = f2;
        B = binarize(img, f, T);
        modes = thicknessModes(B.m, B.w, B.h);
      }
    }
  }
  const { w, h } = B;
  const pm = pxPerM ? pxPerM / f : 0; // 工作图每米像素
  if (!pm || B.ink < 50) return emptyResult(W, H, pxPerM, ['no-walls'], now() - t0);
  // 参数（工作图像素）
  const wmin = hints.wallMin || WALL_T.min;
  const wmax = hints.wallMax || WALL_T.max;
  const P = {
    pm,
    lw: Math.max(2, Math.round(0.05 * pm)),
    tmin: Math.max(3, Math.round(wmin * pm)),
    tmax: Math.max(6, Math.round(wmax * pm) + 1),
    skip: Math.max(2, Math.round(0.04 * pm)),
  };
  if (P.tmin <= P.lw) P.tmin = P.lw + 1;
  if (scaleSource === 'walls' && modes) {
    // 比例是估的：墙厚范围按实际看到的峰放宽
    const lo = Math.min(modes.t || 1e9, modes.t2 || 1e9);
    const hi = Math.max(modes.t || 0, modes.t2 || 0);
    if (lo < 1e9) P.tmin = Math.max(P.lw + 1, Math.min(P.tmin, Math.round(lo * 0.6)));
    if (hi) P.tmax = Math.max(P.tmax, Math.round(hi * 1.35) + 1);
  }
  const raw = B.m.slice(); // 原始二值（门弧 / 墨迹检查用）
  const mask = B.m;
  dropSmall(mask, w, h, Math.max(P.tmax + 2, Math.round(0.4 * pm)));
  const maskT = transpose(mask, w, h);
  const rawT = transpose(raw, w, h);
  const patH = { r: new Buf(), s: new Buf(), e: new Buf(), g: new Buf(), n: new Buf() };
  const patV = { r: new Buf(), s: new Buf(), e: new Buf(), g: new Buf(), n: new Buf() };
  const slH = bandSlices(maskT, h, w, P, patH); // 横墙：扫每一列
  const slV = bandSlices(mask, w, h, P, patV); // 竖墙：扫每一行
  const minN = Math.max(3, Math.round(0.06 * pm));
  let segs = [
    ...track(slH, P).filter((c) => c.ids.length >= minN).map((c) => chainToSeg(c, slH, 'h')),
    ...track(slV, P).filter((c) => c.ids.length >= minN).map((c) => chainToSeg(c, slV, 'v')),
  ];
  const ctx = { P, w, h, raw, rawT, mask, maskT, pm, f };
  segs = nms(segs, ctx);
  segs = mergeCollinear(segs, ctx);
  segs = nms(segs, ctx);
  segs = dropFurniture(segs, ctx);
  snapEnds(segs, ctx);
  segs = keepNetwork(segs, ctx);
  unifyLines(segs, ctx);
  const gaps = findGaps(segs, ctx, hints);
  const wins = findWindows(segs, ctx);
  // 门宽反推比例（不知道比例时）：铰链门的门洞中位数 ≈ 0.85 m
  if (scaleSource === 'walls') {
    const dw = gaps.filter((g) => g.kind === 'door' && g.arc && !g.double).map((g) => g.b - g.a);
    if (dw.length >= 2) {
      const est = (median(dw) / 0.85) * f;
      if (est > pxPerM * 0.6 && est < pxPerM * 1.6) {
        pxPerM = est;
        scaleSource = 'doors';
      }
    }
  }
  markExterior(segs, gaps, ctx);
  const stairs = findStairs(patH, patV, segs, ctx);
  const faceOut = findFaces(segs, stairs, ctx, hints);
  const quality = scoreQuality(segs, gaps, faceOut, ctx, { W, H, pxPerM, scaleSource, f });
  // 输出：裁图像素
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
    size: { width: W, height: H, work: f },
    ms: Math.round(now() - t0),
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
  const order = segs.map((s, i) => i).sort((i, j) => segs[j].n - segs[i].n);
  const kept = [];
  for (const i of order) {
    const s = segs[i];
    let dead = false;
    for (const k of kept) {
      if (k.o !== s.o) continue;
      const ov = overlap(s.a, s.b, k.a, k.b);
      if (ov <= 0.6 * segLen(s)) continue;
      const touch = Math.abs(s.c - k.c) < (s.t + k.t) / 2 + 1;
      if (!touch) continue;
      // 同一条线上（几乎同心）→ 交给合并；横截面错开（挨着）→ 弱的那个是假的
      if (Math.abs(s.c - k.c) <= Math.max(2, 0.3 * Math.max(s.t, k.t)) && ov < segLen(s) - 1) continue;
      dead = true;
      break;
    }
    if (!dead) {
      kept.push(s);
      out.push(s);
    }
  }
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
        if (Bs.a - A.b > 1.6 * P.tmax + P.skip) break;
        if (Math.abs(A.c - Bs.c) > Math.max(2, 0.3 * Math.max(A.t, Bs.t))) continue;
        if (Math.max(A.t, Bs.t) > 1.8 * Math.min(A.t, Bs.t) + 2) continue;
        const gap = Bs.a - A.b;
        let ok = gap <= 2 * P.skip + 1;
        if (!ok) {
          const t = Math.max(A.t, Bs.t);
          const c = (A.c + Bs.c) / 2;
          // 交叉口：有垂直的墙从这里经过
          ok = perp.some((pi) => {
            const p = segs[pi];
            return p.c >= A.b - p.t / 2 - 1 && p.c <= Bs.a + p.t / 2 + 1 && p.a <= c + t / 2 + 2 && p.b >= c - t / 2 - 2;
          });
          if (!ok && gap <= P.tmax * 1.6) {
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
    for (const s of g) {
      const k = Math.max(1, Math.round(s.n / 8));
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
function dropFurniture(segs, ctx) {
  const { P } = ctx;
  let solidLen = 0;
  let multiLen = 0;
  for (const s of segs) {
    const L = segLen(s);
    solidLen += L * (1 - s.multi);
    multiLen += L * s.multi;
  }
  const solidDrawing = solidLen > 1.5 * multiLen;
  ctx.style = solidDrawing ? 'solid' : 'lines';
  if (solidDrawing) {
    return segs.filter((s) => {
      if (s.multi < 0.8) return true;
      // 窗：夹在两段实心墙之间、在同一条线上
      return segs.some((q) => q !== s && q.o === s.o && q.multi < 0.5 && Math.abs(q.c - s.c) <= Math.max(2, 0.3 * q.t) && (Math.abs(q.b - s.a) <= P.tmax || Math.abs(s.b - q.a) <= P.tmax));
    });
  }
  return segs;
}

/** 端点吸到垂直的墙的中线上（L / T 角）；记下每个端点接在哪 */
function snapEnds(segs, ctx) {
  const { P } = ctx;
  const tol = Math.max(2, 0.06 * P.pm);
  for (const s of segs) {
    s.endA = -1;
    s.endB = -1;
  }
  segs.forEach((s, i) => {
    for (const end of ['a', 'b']) {
      const e = s[end];
      let best = -1;
      let bd = 1e9;
      segs.forEach((p, j) => {
        if (p.o === s.o) return;
        if (s.c < p.a - p.t / 2 - tol || s.c > p.b + p.t / 2 + tol) return;
        const d = Math.abs(e - p.c);
        if (d <= p.t / 2 + s.t / 2 + tol && d < bd) {
          bd = d;
          best = j;
        }
      });
      if (best >= 0) {
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
        if (gap <= OPENING_MAX * pm) uni(i, j);
      }
    }
  }
  const len = new Map();
  for (let i = 0; i < n; i++) len.set(find(i), (len.get(find(i)) || 0) + segLen(segs[i]));
  const maxL = Math.max(0, ...len.values());
  const keep = segs.filter((s, i) => {
    const L = len.get(find(i));
    if (L < Math.max(3.5 * pm, 0.15 * maxL) && L < maxL) return false;
    // 太短又两头都没接上
    if (segLen(s) < 0.3 * pm && s.endA < 0 && s.endB < 0) return false;
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
        const tot = g.reduce((v, s) => v + segLen(s), 0);
        const c = g.reduce((v, s) => v + s.c * segLen(s), 0) / tot;
        for (const s of g) s.c = c;
      }
      i = j + 1;
    }
  }
}

// ───────────── 7. 门洞 / 开口 / 推拉门 / 窗 ─────────────

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

/** 门弧：铰链在 hinge（沿墙坐标），往 side 一侧开，半径 R。返回 { arc, leaf } 两个命中率 */
function arcScore(ctx, s, hinge, other, side, R) {
  const face = s.c + (side * s.t) / 2;
  const P = (u, v) => (s.o === 'h' ? [u, v] : [v, u]); // (沿墙, 横截面) → (x, y)
  let hit = 0;
  let tot = 0;
  const N = Math.max(12, Math.round(R * 0.6));
  const dir = Math.sign(other - hinge);
  for (let i = 2; i < N - 1; i++) {
    const th = (i / N) * (Math.PI / 2);
    // 从门扇（垂直于墙）转到对面的门框
    const u = hinge + dir * R * Math.sin(th);
    const v = face + side * R * Math.cos(th);
    const [x, y] = P(u, v);
    tot++;
    if (inkNear(ctx, x, y, 1)) hit++;
  }
  let lh = 0;
  let lt = 0;
  for (let i = 2; i < N; i++) {
    const v = face + side * R * (i / N) * 0.95;
    for (const du of [0]) {
      const [x, y] = P(hinge + dir * du, v);
      lt++;
      if (inkNear(ctx, x, y, 2)) lh++;
    }
  }
  return { arc: hit / tot, leaf: lh / lt };
}

/** 门洞里平行于墙的细线：每个位置有几条、覆盖了多少 */
function linesInGap(ctx, s, a, b) {
  const { raw, rawT, w, h } = ctx;
  const M = s.o === 'h' ? rawT : raw; // 行 = 沿墙位置
  const Wd = s.o === 'h' ? h : w;
  const y0 = Math.max(0, Math.round(s.c - s.t / 2 - 1));
  const y1 = Math.min(Wd, Math.round(s.c + s.t / 2 + 1));
  const ua = Math.round(a + 1);
  const ub = Math.round(b - 1);
  let covered = 0;
  const counts = [];
  for (let u = ua; u < ub; u++) {
    const r = u * Wd;
    let n = 0;
    let inRun = false;
    for (let v = y0; v < y1; v++) {
      if (M[r + v]) {
        if (!inRun) n++;
        inRun = true;
      } else inRun = false;
    }
    if (n) covered++;
    counts.push(n);
  }
  const tot = Math.max(1, ub - ua);
  return { cover: covered / tot, lines: median(counts) };
}

function classifyGap(ctx, s, a, b, hints) {
  const { pm } = ctx;
  const g = b - a;
  const gm = g / pm;
  const dmin = hints.doorMin || DOOR_W.min;
  const dmax = hints.doorMax || DOOR_W.max;
  let best = null;
  if (gm >= dmin * 0.9 && gm <= dmax * 1.1) {
    for (const [hinge, other] of [
      [a, b],
      [b, a],
    ])
      for (const side of [-1, 1]) {
        const sc = arcScore(ctx, s, hinge, other, side, g);
        const v = sc.arc + 0.5 * sc.leaf;
        if (!best || v > best.v) best = { v, ...sc, hinge: hinge === a ? 'a' : 'b', side };
      }
    if (best && best.arc >= 0.6 && (best.leaf >= 0.45 || best.arc >= 0.85)) return { kind: 'door', arc: true, swing: { hinge: best.hinge, side: best.side } };
  }
  if (gm >= 2 * dmin * 0.9 && gm <= (hints.doorDouble || DOOR_W.double)) {
    for (const side of [-1, 1]) {
      const s1 = arcScore(ctx, s, a, b, side, g / 2);
      const s2 = arcScore(ctx, s, b, a, side, g / 2);
      if (s1.arc >= 0.6 && s2.arc >= 0.6) return { kind: 'door', arc: true, double: true, swing: { hinge: 'ab', side } };
    }
  }
  const L = linesInGap(ctx, s, a, b);
  if (L.cover >= 0.7 && gm >= 0.5) return { kind: L.lines >= 3 ? 'window' : 'slider', arc: false };
  if (gm >= 0.45 && gm <= OPENING_MAX) return { kind: 'opening', arc: false };
  return null;
}

/**
 * 同一条线上相邻两段之间的空 = 开口；一段的自由端到垂直墙的墙面之间（门挨着墙角）也算。
 * 开口所在的墙段合成一段（a..b 盖过开口）。返回 [{ seg, a, b, kind, arc, double? }]，并就地改 segs。
 */
function findGaps(segs, ctx, hints) {
  const { pm } = ctx;
  const gaps = [];
  // 1. 同线相邻
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
        if (g <= 0 || g > OPENING_MAX * pm) continue;
        const t = (A.t + Bs.t) / 2;
        const probe = { o, c: A.c, t };
        const cl = classifyGap(ctx, probe, A.b, Bs.a, hints);
        if (cl) {
          A.joinNext = { seg: Bs, a: A.b, b: Bs.a, ...cl };
        }
      }
    }
  }
  // 2. 自由端 → 垂直墙的墙面（门在墙角）
  const tol = Math.max(2, 0.06 * pm);
  for (const s of segs) {
    for (const end of ['a', 'b']) {
      if ((end === 'a' ? s.endA : s.endB) >= 0) continue;
      if (end === 'b' && s.joinNext) continue;
      if (end === 'a' && segs.some((q) => q.joinNext && q.joinNext.seg === s)) continue;
      const e = s[end];
      const dir = end === 'a' ? -1 : 1;
      let best = null;
      for (const p of segs) {
        if (p.o === s.o) continue;
        if (s.c < p.a - tol || s.c > p.b + tol) continue;
        const face = p.c - (dir * p.t) / 2;
        const g = (face - e) * dir;
        if (g < DOOR_W.min * 0.85 * pm || g > DOOR_W.max * 1.1 * pm) continue;
        if (!best || g < best.g) best = { p, face, g };
      }
      if (!best) continue;
      // 中间不能还有别的同线的墙段
      const a = Math.min(e, best.face);
      const b = Math.max(e, best.face);
      const cl = classifyGap(ctx, s, a, b, hints);
      if (cl && (cl.kind === 'door' || cl.kind === 'slider' || cl.kind === 'window')) {
        s.virt = s.virt || {};
        s.virt[end] = { a, b, to: best.p.c, ...cl };
      }
    }
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
      endA: parts[0].endA,
      endB: parts[parts.length - 1].endB,
      parts: parts.flatMap((p) => p.parts || [p]),
      ops: ops.map((g) => ({ a: g.a, b: g.b, kind: g.kind, arc: g.arc, double: g.double, swing: g.swing })),
    };
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (first.virt?.a) {
      m.ops.unshift({ a: first.virt.a.a, b: first.virt.a.b, kind: first.virt.a.kind, arc: first.virt.a.arc, double: first.virt.a.double, swing: first.virt.a.swing });
      m.a = first.virt.a.to;
    }
    if (last.virt?.b) {
      m.ops.push({ a: last.virt.b.a, b: last.virt.b.b, kind: last.virt.b.kind, arc: last.virt.b.arc, double: last.virt.b.double, swing: last.virt.b.swing });
      m.b = last.virt.b.to;
    }
    merged.push(m);
  }
  // 端点编号：原来指向的段 → 合并后的段
  const where = new Map();
  merged.forEach((m, i) => {
    for (const p of m.parts || [m]) where.set(p, i);
    where.set(m, i);
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

/** 一段墙中间：横截面变成几条平行细线（和墙本身的画法不一样）的一截 = 窗 */
function findWindows(segs, ctx) {
  const { pm, raw, rawT, w, h } = ctx;
  const out = [];
  segs.forEach((s, si) => {
    const parts = s.parts || [s];
    // 每个沿墙位置的横截面
    const prof = new Map();
    for (const p of parts) {
      if (!p.ids) continue;
      for (const k of p.ids) {
        const r = p.sl.r.a[k];
        prof.set(r, { k: p.sl.k.a[k], nl: p.sl.nl.a[k], ink: p.sl.ink.a[k] / Math.max(1, p.sl.e.a[k] - p.sl.s.a[k]), s: p.sl.s.a[k], e: p.sl.e.a[k] });
      }
    }
    if (prof.size < 4) return;
    const solidWall = s.solid >= 0.6;
    const isGlass = (q) => q && q.k === 1 && q.ink <= 0.6 && (q.nl >= 3 || (solidWall && q.nl >= 2));
    const busy = (s.ops || []).map((g) => [g.a, g.b]);
    let u = Math.ceil(s.a);
    const end = Math.floor(s.b);
    while (u < end) {
      if (!isGlass(prof.get(u))) {
        u++;
        continue;
      }
      let v = u;
      let miss = 0;
      while (v + 1 < end && (isGlass(prof.get(v + 1)) || (miss < ctx.P.skip && !prof.has(v + 1)))) {
        v++;
        if (!prof.has(v)) miss++;
        else miss = 0;
      }
      const a = u;
      const b = v + 1;
      u = v + 1;
      if ((b - a) / pm < 0.35) continue;
      if (busy.some(([p, q]) => overlap(a, b, p, q) > 0)) continue;
      // 真的玻璃线：横截面里至少有一条「贯通」的线（斜线填充的交点是错开的）
      const M = s.o === 'h' ? rawT : raw;
      const Wd = s.o === 'h' ? h : w;
      const v0 = Math.round(s.c - s.t / 2 + 2);
      const v1 = Math.round(s.c + s.t / 2 - 2);
      let through = 0;
      for (let vv = v0; vv <= v1; vv++) {
        let n = 0;
        for (let uu = a; uu < b; uu++) n += M[uu * Wd + vv] || 0;
        if (n >= 0.8 * (b - a)) through++;
      }
      if (!through) continue;
      out.push({ seg: si, a, b, kind: 'window', arc: false });
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

function findStairs(patH, patV, segs, ctx) {
  const { pm, w, h } = ctx;
  const cell = Math.max(2, Math.round(0.25 * pm));
  const gw = Math.ceil(w / cell);
  const gh = Math.ceil(h / cell);
  // patH 来自扫列（横的踏步线）：r = x，s..e = y 范围；patV 来自扫行：r = y，s..e = x 范围
  const cntH = new Float32Array(gw * gh);
  const cntV = new Float32Array(gw * gh);
  const add = (pat, cnt, vertical) => {
    for (let i = 0; i < pat.r.n; i++) {
      const pitch = pat.g.a[i] / pm;
      if (pitch < 0.17 || pitch > 0.36) continue;
      const r = pat.r.a[i];
      for (let v = pat.s.a[i]; v < pat.e.a[i]; v += cell / 2) {
        const [x, y] = vertical ? [r, v] : [v, r];
        const k = Math.floor(y / cell) * gw + Math.floor(x / cell);
        if (k >= 0 && k < cnt.length) cnt[k] += 1;
      }
    }
  };
  add(patH, cntH, true);
  add(patV, cntV, false);
  const out = [];
  for (const [A, Bc, dir] of [
    [cntH, cntV, 'ns'],
    [cntV, cntH, 'ew'],
  ]) {
    const on = new Uint8Array(gw * gh);
    for (let k = 0; k < gw * gh; k++) if (A[k] >= cell * 0.6 && Bc[k] < A[k] * 0.15) on[k] = 1;
    // 连通的块 → 外框
    const seen = new Uint8Array(gw * gh);
    for (let k = 0; k < gw * gh; k++) {
      if (!on[k] || seen[k]) continue;
      const st = [k];
      seen[k] = 1;
      let x0 = 1e9;
      let x1 = -1;
      let y0 = 1e9;
      let y1 = -1;
      let n = 0;
      while (st.length) {
        const c = st.pop();
        n++;
        const x = c % gw;
        const y = (c - x) / gw;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        for (const d of [-1, 1, -gw, gw]) {
          const nk = c + d;
          if (nk < 0 || nk >= gw * gh || seen[nk] || !on[nk]) continue;
          if ((d === -1 && x === 0) || (d === 1 && x === gw - 1)) continue;
          seen[nk] = 1;
          st.push(nk);
        }
      }
      const rw = ((x1 - x0 + 1) * cell) / pm;
      const rh = ((y1 - y0 + 1) * cell) / pm;
      const long = dir === 'ns' ? rh : rw;
      const short = dir === 'ns' ? rw : rh;
      if (long < 1.5 || short < 0.6 || n < 6) continue;
      // 精确外框：图案的起止
      let ex0 = 1e9;
      let ex1 = -1;
      let ey0 = 1e9;
      let ey1 = -1;
      const pat = dir === 'ns' ? patH : patV;
      for (let i = 0; i < pat.r.n; i++) {
        const r = pat.r.a[i];
        const s = pat.s.a[i];
        const e = pat.e.a[i];
        const [px0, px1, py0, py1] = dir === 'ns' ? [r, r + 1, s, e] : [s, e, r, r + 1];
        if (px1 < x0 * cell || px0 > (x1 + 1) * cell || py1 < y0 * cell || py0 > (y1 + 1) * cell) continue;
        ex0 = Math.min(ex0, px0);
        ex1 = Math.max(ex1, px1);
        ey0 = Math.min(ey0, py0);
        ey1 = Math.max(ey1, py1);
      }
      if (ex1 < 0) continue;
      out.push(snapRect({ x: ex0, y: ey0, w: ex1 - ex0, h: ey1 - ey0, dir }, segs, ctx));
    }
  }
  return out;
}

/** 矩形的边吸到附近的墙中线（≤ 墙厚 + 0.15 m） */
function snapRect(r, segs, ctx) {
  const reach = 0.18 * ctx.pm;
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
  const nLab = Math.max(1, ...lab);
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
  // 切线：墙的中线
  const cut = (o) => {
    const v = segs.filter((s) => s.o === o).map((s) => s.c).sort((a, b) => a - b);
    const out = [];
    for (const c of v) if (!out.length || c - out[out.length - 1] > 1.5) out.push(c);
    return out;
  };
  const XS = cut('v');
  const YS = cut('h');
  const faces = [];
  for (let l = 2; l <= nLab; l++) {
    if (area[l] < minCells) continue;
    const fx0 = bx0[l] * g;
    const fx1 = (bx1[l] + 1) * g;
    const fy0 = by0[l] * g;
    const fy1 = (by1[l] + 1) * g;
    const span = ctx.P.tmax;
    const xs = [fx0 - span, ...XS.filter((c) => c > fx0 - span && c < fx1 + span), fx1 + span];
    const ys = [fy0 - span, ...YS.filter((c) => c > fy0 - span && c < fy1 + span), fy1 + span];
    // 外框附近没有墙线就用面的外框
    const xsC = xs.slice(1, -1);
    const ysC = ys.slice(1, -1);
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
  // 竖着合并同样宽的条
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
  return out.map((s) => ({ x: xs[s.i0], y: ys[s.j0], w: xs[s.i1] - xs[s.i0], h: ys[s.j1] - ys[s.j0] }));
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

function scoreQuality(segs, gaps, faceOut, ctx, info) {
  const { pm } = ctx;
  const reasons = [];
  const srcPxM = info.pxPerM || 0;
  const res = clamp((srcPxM - 25) / 70, 0, 1);
  if (srcPxM < 60) reasons.push('low-res');
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
  const closed = bbA > 0 ? clamp(faceA / bbA / 0.6, 0, 1) : 0;
  if (faces.length < 2 || closed < 0.5) reasons.push('open-outline');
  const wallPx = Math.round(segs.reduce((v, s) => v + segLen(s) * s.t, 0) * ctx.f * ctx.f);
  const covered = segs.reduce((v, s) => v + s.n, 0);
  const coverage = len > 0 ? clamp(covered / (len * pm), 0, 1) : 0;
  const struct = len >= 8 ? 0.4 * att + 0.4 * closed + 0.2 * Math.min(1, faces.length / 4) : 0.2 * att;
  const score = clamp(0.35 * res + 0.65 * struct, 0, 1) * (info.scaleSource === 'given' ? 1 : 0.9);
  return { score: +score.toFixed(3), wallPx, coverage: +coverage.toFixed(3), attached: +att.toFixed(3), closed: +closed.toFixed(3), wallM: +len.toFixed(2), reasons };
}

// ───────────── 12. 米制：墙 / 开口 / 房间面 ─────────────

/**
 * extractWalls 的结果 → 米（原点 = 裁图左上角；和 sheet.js readToMetres 同一个坐标系）。
 * → { walls: [{ x1, y1, x2, y2, t, ext }], openings: [{ kind: 'door'|'open'|'window'|'slider', x1, y1, x2, y2, arc }], faces: [{ rects: [{ x, y, w, d }], area, stairs? }] }
 */
export function wallsToPlan(res, mPerPx) {
  const k = mPerPx;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const KIND = { door: 'door', opening: 'open', window: 'window', slider: 'slider' };
  return {
    walls: res.walls.map((wl) => ({ x1: r3(wl.x1 * k), y1: r3(wl.y1 * k), x2: r3(wl.x2 * k), y2: r3(wl.y2 * k), t: r3(wl.t * k), ext: wl.ext })),
    openings: res.gaps.map((g) => ({ kind: KIND[g.kind] || 'open', x1: r3(g.x1 * k), y1: r3(g.y1 * k), x2: r3(g.x2 * k), y2: r3(g.y2 * k), arc: g.arc, wall: g.wall })),
    faces: res.faces.map((fc) => ({ rects: fc.rects.map((r) => ({ x: r3(r.x * k), y: r3(r.y * k), w: r3(r.w * k), d: r3(r.h * k) })), area: r3(fc.area * k * k), ...(fc.stairs ? { stairs: true } : {}) })),
  };
}

export const OPEN_TYPES = new Set(Object.keys(ROOM_TYPES).filter((k) => ROOM_TYPES[k].open));
