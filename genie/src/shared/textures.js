// 程序化 PBR 材质 —— 木纹、大理石、洞石、水磨石、微水泥、石灰、乳胶漆、瓷砖 / Zellige、亚麻、羊羔绒、针织、
// 丝绒、羊毛、皮革、藤编、拉丝金属……全部用代码画，不用任何图片文件。
//
// 每张贴图都是一整套「物理材质」：
//   · albedo   —— 底色（sRGB）
//   · normal   —— 切线空间法线（由独立的高度场 Sobel 求出，不是从颜色猜的）
//   · orm      —— R = 微观遮蔽（缝、导管、织物间隙）G = 粗糙度（绝对值）B = 1
// 全部「无缝」（可以无限平铺），并带有它覆盖的真实尺寸 size（米）：3D 里每个面的 UV 用米做单位，
// 所以同一块木纹放在柜门或地板上，纹理比例都是真的。
// 生成全在 Float32Array 里完成（不碰 DOM），Node 里也能跑；只有色卡（swatchURL）需要 canvas。

import { MAT_BY_ID, hexToRgb } from './materials.js';
import { hash2, rng, smooth, clamp01, fbmField, diagField, samp, sampG, vtable, vlook, worley } from './noise.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const sat = clamp01;
const rgb = (hex) => {
  const c = hexToRgb(hex);
  return [c.r / 255, c.g / 255, c.b / 255];
};
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/** 表面 → 这个材质用哪种排法 */
export function variantFor(mat, slotId) {
  if (!mat) return 'base';
  if (mat.cat === 'wood') {
    if (slotId === 'floor') return mat.tex.pattern === 'herringbone' ? 'herringbone' : 'plank';
    if (slotId === 'swatch') return mat.tex.pattern === 'herringbone' ? 'herringbone' : 'veneer';
    return 'veneer';
  }
  if (mat.cat === 'stone') return slotId === 'floor' || slotId === 'tile' ? 'tiled' : 'slab';
  return 'base';
}

// 一张贴图覆盖多大（米）。3D 用 WORLD；色卡（小方块）用 SWATCH —— 色卡要「凑近看」才认得出质感
const WORLD = { marble: 1.8, travertine: 1.6, terrazzo: 0.8, concrete: 2.4, limewash: 2.4, paint: 2.4, linen: 0.3, boucle: 0.25, knit: 0.42, velvet: 1, felt: 0.6, leather: 0.4, rattan: 0.192, metal: 0.5 };
const SWATCH = { marble: 0.42, travertine: 0.36, terrazzo: 0.2, concrete: 0.7, limewash: 0.9, paint: 0.8, linen: 0.06, boucle: 0.07, knit: 0.084, velvet: 0.3, felt: 0.08, leather: 0.06, rattan: 0.064, metal: 0.16 };

function sizeFor(t, variant, swatch) {
  const type = t.type;
  if (type === 'wood') {
    if (variant === 'herringbone') return swatch ? 0.8 : 1.6;
    if (variant === 'veneer') return swatch ? 0.36 : 1.2;
    return swatch ? 0.8 : 3.2;
  }
  if (type === 'tile') {
    const s = t.size || 0.1;
    if (swatch) return t.rect ? s * 2 : s >= 0.3 ? s * 2 : s * 3;
    return s >= 0.3 ? 2.4 : 1.2;
  }
  if (variant === 'tiled' && (type === 'marble' || type === 'travertine')) return 1.2;
  return (swatch ? SWATCH : WORLD)[type] || 1;
}

// ───────────────────────────── 缓冲区 ─────────────────────────────

function makeBuf(R, S) {
  const n = R * R;
  return {
    R,
    S,
    px: S / R, // 每个像素多少米
    c: new Float32Array(n * 3), // sRGB 0…1
    h: new Float32Array(n), // 高度（毫米）
    r: new Float32Array(n), // 粗糙度
    ao: new Float32Array(n).fill(1),
    sx: null, // 额外的整块倾斜（木板、手工砖的高低不平），不进高度场，直接加到法线里
    sy: null,
  };
}
function slopes(B) {
  if (!B.sx) {
    B.sx = new Float32Array(B.R * B.R);
    B.sy = new Float32Array(B.R * B.R);
  }
}
function put(B, i, r, g, b) {
  const k = i * 3;
  B.c[k] = r;
  B.c[k + 1] = g;
  B.c[k + 2] = b;
}

/** 周期场 F（N×N）→ 双线性放大成 R×R（列索引预先算好，比逐像素 samp 快得多） */
function up(F, N, R) {
  if (N === R) return F;
  const O = new Float32Array(R * R);
  const xi0 = new Int32Array(R);
  const xi1 = new Int32Array(R);
  const tx = new Float32Array(R);
  for (let x = 0; x < R; x++) {
    const g = ((x + 0.5) / R) * N - 0.5;
    const i = Math.floor(g);
    tx[x] = g - i;
    xi0[x] = ((i % N) + N) % N;
    xi1[x] = (xi0[x] + 1) % N;
  }
  for (let y = 0; y < R; y++) {
    const g = ((y + 0.5) / R) * N - 0.5;
    const j = Math.floor(g);
    const ty = g - j;
    const r0 = (((j % N) + N) % N) * N;
    const r1 = ((((j + 1) % N) + N) % N) * N;
    const row = y * R;
    for (let x = 0; x < R; x++) {
      const t = tx[x];
      const a = F[r0 + xi0[x]];
      const b = F[r0 + xi1[x]];
      const c = F[r1 + xi0[x]];
      const d = F[r1 + xi1[x]];
      const top = a + (b - a) * t;
      O[row + x] = top + (c + (d - c) * t - top) * ty;
    }
  }
  return O;
}

/** 低频场的分辨率：大贴图 256，色卡等小图 128 */
const fieldN = (R) => (R >= 384 ? 256 : 128);

/** 一条宽 w 的线、像素中心到线中心距离 d —— 抗锯齿覆盖率（线比像素细时自动变淡） */
function lineCov(d, w, px) {
  if (w >= px) return sat((w * 0.5 - d) / px + 0.5);
  return (w / px) * sat(1 - d / px);
}

// ───────────────────────────── 木 ─────────────────────────────

// ring = 年轮间距（米）；porous = 环孔材（橡、柚：早材有一圈导管）；pore = 导管明显程度；rays = 射线斑（橡木银光）
const SPECIES = {
  oak: { ring: 0.0042, porous: true, pore: 0.55, rays: 1, contrast: 0.88, streak: 0.06, warmVar: 0.5 },
  maple: { ring: 0.0036, porous: false, pore: 0.12, rays: 0.25, contrast: 0.42, streak: 0.045, warmVar: 0.35 },
  walnut: { ring: 0.005, porous: false, pore: 0.42, rays: 0, contrast: 0.72, streak: 0.13, warmVar: 1 },
  teak: { ring: 0.0055, porous: true, pore: 0.3, rays: 0, contrast: 0.6, streak: 0.12, warmVar: 0.7 },
  cherry: { ring: 0.0038, porous: false, pore: 0.16, rays: 0.12, contrast: 0.5, streak: 0.08, warmVar: 0.6 },
};

function woodCtx(B, t, mat, seed, kind) {
  const sp = SPECIES[t.species] || SPECIES.oak;
  const base = rgb(t.base);
  const grain = rgb(t.grain);
  const gm = sp.porous ? 0.19 : 0.29; // 年轮明暗的平均值 → 反推「浅色」使平均色 = base
  const k = sp.contrast;
  const light = base.map((b, j) => sat((b - grain[j] * gm * k) / (1 - gm * k)));
  const N = fieldN(B.R);
  let Fs;
  let Fw;
  if (kind === 'plank') {
    Fs = fbmField(N, 3, 40, 4, seed + 1);
    Fw = fbmField(N, 4, 16, 4, seed + 2);
  } else if (kind === 'veneer') {
    Fs = fbmField(N, 40, 3, 4, seed + 1);
    Fw = fbmField(N, 16, 4, 4, seed + 2);
  } else {
    Fs = fbmField(N, 12, 12, 4, seed + 1);
    Fw = fbmField(N, 10, 10, 4, seed + 2);
  }
  const Fj = fbmField(N, 10, 10, 5, seed + 3);
  const poreW = Math.max(0.0009, B.px * 1.15);
  return {
    sp,
    base,
    grain,
    light,
    k,
    gm,
    fs: up(Fs, N, B.R),
    fw: up(Fw, N, B.R),
    fj: up(Fj, N, B.R),
    warpA: 0.006,
    jitA: 0.0022,
    poreW,
    poreL: 0.03,
    poreK: Math.min(1, Math.sqrt(0.0014 / poreW)),
    r0: mat.rough,
    minRing: B.px * 2.1, // 年轮至少 2 个像素宽，否则远看全糊成一片
    lut: ringLUT(sp.porous),
    fleckK: Math.min(1, 0.0014 / B.px), // 射线斑只有凑近才看得清；远看（像素粗）就淡一点，免得像斑点
  };
}

/** 一圈年轮里的明暗：环孔材（橡）早材一圈导管、突然变暗再慢慢变亮；散孔材（枫、胡桃）晚材渐深 */
function ringLUT(porous) {
  const L = new Float32Array(256);
  for (let k = 0; k < 256; k++) {
    const t = (k + 0.5) / 256;
    L[k] = porous ? Math.exp(-t * 6.25) * 0.92 + 0.08 * t : t * t * Math.sqrt(t);
  }
  return L;
}

/** 每块板（或人字拼的每一小块、木皮的每一片）自己的「身世」：怎么锯的、离髓心多远、颜色偏差 */
function boardParams(id, seed, C, W, kind) {
  const h = (k) => hash2(id, k, seed);
  const cr = h(1);
  const cut = kind === 'veneer' ? 0 : cr < 0.55 ? 0 : cr < 0.82 ? 1 : 2; // 0 弦切（山纹）1 半径切 2 径切（直纹）
  let D0;
  let c;
  if (cut === 0) {
    D0 = 0.035 + h(2) * 0.13;
    c = (h(3) - 0.5) * W * 0.8;
  } else if (cut === 1) {
    D0 = 0.03 + h(2) * 0.05;
    c = (h(3) < 0.5 ? -1 : 1) * (0.07 + h(4) * 0.12);
  } else {
    D0 = 0.004 + h(2) * 0.012;
    c = (h(3) < 0.5 ? -1 : 1) * (0.06 + h(4) * 0.2);
  }
  const sgn = h(5) < 0.5 ? -1 : 1;
  return {
    id,
    cut,
    D0,
    c,
    a: sgn * (0.004 + h(6) * 0.03), // 沿板长方向年轮的推进 → 山形纹（cathedral）的尖
    tone: 1 + (h(7) - 0.5) * 0.17,
    warm: (h(8) - 0.5) * 2,
    phase: h(9) * 10,
    spacing: Math.max(C.sp.ring * (0.75 + h(10) * 0.6), C.minRing * (0.9 + h(10) * 0.4)),
    rv: (h(11) - 0.5) * 0.07,
    tx: (h(12) - 0.5) * 0.006,
    ty: (h(13) - 0.5) * 0.006,
    ox: h(14) * 97,
    oy: h(15) * 97,
  };
}

/** 一个像素的木头：年轮 + 导管 + 射线斑 + 色带 + 倒角缝。rT/rx/ry：射线斑查表（只有橡木径切才用） */
function woodPx(B, i, C, bp, along, across, W, d, pn, rT, rPx, rPy, rx, ry) {
  const w = across - bp.c + (C.fw[i] - 0.5) * C.warpA;
  const q = Math.sqrt(bp.D0 * bp.D0 + w * w);
  const rho = q + bp.a * along + (C.fj[i] - 0.5) * C.jitA;
  const kk = rho / bp.spacing + bp.phase;
  const tt = kk - Math.floor(kk);
  let g = C.lut[(tt * 255) | 0];
  const dk = (Math.abs(w) / q + Math.abs(bp.a) + 0.12) * (B.px / bp.spacing);
  if (dk > 0.25) g = C.gm + (g - C.gm) * (1 - smooth(0.25, 0.62, dk));
  // 导管：橡木集中在早材那一圈
  const band = C.sp.porous ? 0.3 + 0.7 * g : 1;
  const pore = smooth(0.52, 0.9, pn) * band * C.sp.pore * C.poreK;
  // 射线斑：径切 / 半径切的橡木才有的「银光」
  let fleck = 0;
  if (rT && bp.cut > 0) fleck = smooth(0.7, 0.84, vlook(rT, rPx, rPy, rx, ry)) * C.sp.rays * (bp.cut === 2 ? 1 : 0.4) * C.fleckK;
  const s = C.fs[i] - 0.5;
  const tone = bp.tone * (1 + s * 2 * C.sp.streak);
  const gk = g * C.k;
  const wv = bp.warm * C.sp.warmVar;
  // 倒角缝：缝里暗、粗糙、低
  const bev = Math.max(0.0012, B.px * 1.15);
  const seam = d < bev ? 1 - smooth(0, bev, d) : 0;
  const f = tone * (1 - pore * 0.3) * (1 + fleck * 0.15) * (1 - seam * 0.42);
  put(
    B,
    i,
    lerp(C.light[0], C.grain[0], gk) * f * (1 + 0.035 * wv),
    lerp(C.light[1], C.grain[1], gk) * f * (1 + 0.006 * wv),
    lerp(C.light[2], C.grain[2], gk) * f * (1 - 0.055 * wv),
  );
  const cr = W > 0 ? (2 * across) / W : 0;
  B.h[i] = 0.05 * (1 - cr * cr) - 0.05 * gk - 0.07 * pore + 0.03 * fleck - 0.5 * seam * seam;
  B.r[i] = C.r0 + bp.rv + 0.13 * pore + 0.04 * gk - 0.13 * fleck + s * 0.05 + seam * 0.25;
  B.ao[i] = 1 - 0.5 * seam - 0.14 * pore;
}

/** 地板：真实宽度（~200mm）、长短不一、错缝 */
function plankLayout(S, rows, seed, C, W) {
  const out = [];
  let prev = null;
  const circ = (a, b) => {
    const d = Math.abs(a - b) % S;
    return Math.min(d, S - d);
  };
  for (let r = 0; r < rows; r++) {
    const rand = rng(seed * 31 + r * 7919 + 1);
    let cuts = [];
    for (let tries = 0; tries < 14; tries++) {
      const n = S < 1.5 ? 1 : rand() < 0.6 ? 2 : 3;
      const off = rand() * S;
      const c = [off];
      if (n === 2) c.push(off + S * (0.38 + rand() * 0.24));
      if (n === 3) {
        const a = S * (0.27 + rand() * 0.1);
        c.push(off + a, off + a + S * (0.28 + rand() * 0.12));
      }
      cuts = c.map((x) => ((x % S) + S) % S).sort((a, b) => a - b);
      if (!prev || cuts.every((x) => prev.every((p) => circ(x, p) > Math.min(0.25, S * 0.18)))) break;
    }
    prev = cuts;
    out.push(
      cuts.map((s, k) => {
        const e = k + 1 < cuts.length ? cuts[k + 1] : cuts[0] + S;
        const id = r * 8 + k;
        return { s, L: e - s || S, bp: boardParams(id, seed, C, W, 'plank') };
      }),
    );
  }
  return out;
}

function woodPlank(B, t, mat, seed) {
  const C = woodCtx(B, t, mat, seed, 'plank');
  const { R, S, px } = B;
  const rows = Math.max(2, Math.round(S / 0.2));
  const W = S / rows;
  const lay = plankLayout(S, rows, seed, C, W);
  slopes(B);
  const Pa = Math.max(4, Math.round(S / C.poreL));
  const Pc = Math.max(4, Math.round(S / C.poreW));
  const Tp = vtable(Pa, Pc, seed + 21);
  const Ra = Math.max(4, Math.round(S / 0.03));
  const Rc = Math.max(4, Math.round(S / Math.max(0.0065, px * 1.5)));
  const Tr = C.sp.rays ? vtable(Ra, Rc, seed + 23) : null;
  for (let y = 0; y < R; y++) {
    const v = (y + 0.5) * px;
    const row = Math.min(rows - 1, Math.floor(v / W));
    const lv = v - row * W;
    const across = lv - W / 2;
    const dSide = Math.min(lv, W - lv);
    const segs = lay[row];
    for (let x = 0; x < R; x++) {
      const u = (x + 0.5) * px;
      let sg = segs[segs.length - 1];
      for (let k = 0; k < segs.length; k++) if (u >= segs[k].s) sg = segs[k];
      const lu = (((u - sg.s) % S) + S) % S;
      const d = Math.min(dSide, lu, sg.L - lu);
      const i = y * R + x;
      const pn = vlook(Tp, Pa, Pc, (u / S) * Pa, (v / S) * Pc);
      woodPx(B, i, C, sg.bp, lu, across, W, d, pn, Tr, Ra, Rc, (u / S) * Ra + sg.bp.ox, (v / S) * Rc);
      B.sx[i] = sg.bp.tx;
      B.sy[i] = sg.bp.ty;
    }
  }
}

/** 人字拼：每小块各自的纹理方向、色差、倒角 */
function woodHerringbone(B, t, mat, seed) {
  const C = woodCtx(B, t, mat, seed, 'herringbone');
  const { R, S, px } = B;
  const n = 5; // 长宽比 5:1（80 × 400mm）
  const k = Math.max(2 * n, Math.round(S / 0.08 / (2 * n)) * 2 * n); // S / W 必须是 2n 的倍数才无缝
  const W = S / k;
  const L = n * W;
  slopes(B);
  const Tp = vtable(64, 512, seed + 21);
  const Tr = C.sp.rays ? vtable(64, 256, seed + 23) : null;
  const cache = new Array(k * k * 2);
  const mod = (a, m) => ((a % m) + m) % m;
  for (let y = 0; y < R; y++) {
    const v = (y + 0.5) * px;
    const Y = v / W;
    const b = Math.floor(Y);
    for (let x = 0; x < R; x++) {
      const u = (x + 0.5) * px;
      const X = u / W;
      const a = Math.floor(X);
      const m = mod(a - b, 2 * n);
      let lu;
      let lv;
      let key;
      let hor;
      if (m < n) {
        const a0 = a - m;
        lu = X - a0;
        lv = Y - b;
        key = (mod(a0, k) * k + mod(b, k)) * 2;
        hor = true;
      } else {
        const b0 = b - (2 * n - 1 - m);
        lu = Y - b0;
        lv = X - a;
        key = (mod(a, k) * k + mod(b0, k)) * 2 + 1;
        hor = false;
      }
      let bp = cache[key];
      if (!bp) bp = cache[key] = boardParams(key + 1, seed, C, W, 'block');
      const along = lu * W;
      const across = (lv - 0.5) * W;
      const d = Math.min(lv, 1 - lv) * W;
      const dEnd = Math.min(lu, n - lu) * W;
      const i = y * R + x;
      const pn = vlook(Tp, 64, 512, along / C.poreL + bp.ox, across / C.poreW + bp.oy);
      woodPx(B, i, C, bp, along, across, W, Math.min(d, dEnd), pn, Tr, 64, 256, along / 0.03 + bp.ox, across / 0.0065 + bp.oy);
      B.sx[i] = hor ? bp.tx : bp.ty;
      B.sy[i] = hor ? bp.ty : bp.tx;
    }
  }
  void L;
}

/** 木皮（柜门、木饰面、家具）：弦切山纹，顺拼的几片木皮，纹理竖向 */
function woodVeneer(B, t, mat, seed) {
  const C = woodCtx(B, t, mat, seed, 'veneer');
  const { R, S, px } = B;
  const nL = Math.max(1, Math.round(S / 0.3));
  const Lw = S / nL;
  const b0 = boardParams(7, seed, C, Lw, 'veneer');
  // 竖向无缝：a·S 必须是年轮间距的整数倍；每 1.2 米只有 2–3 个山尖（真实木皮的山纹很高很舒展）
  const leaves = [];
  for (let l = 0; l < nL; l++) {
    const hh = (q) => hash2(l, q, seed + 5);
    const m = Math.max(1, Math.round(((hh(5) < 0.5 ? 2 : 3) * S) / 1.2));
    const a = (b0.a < 0 ? -1 : 1) * ((m * b0.spacing) / S);
    leaves.push({ ...b0, a, phase: b0.phase + hh(6) * 7, c: b0.c + (hh(1) - 0.5) * 0.04, D0: b0.D0 * (0.85 + hh(2) * 0.3), tone: b0.tone * (1 + (hh(3) - 0.5) * 0.05), ox: hh(4) * 50 });
  }
  const Pa = Math.max(4, Math.round(S / C.poreL));
  const Pc = Math.max(4, Math.round(S / C.poreW));
  const Tp = vtable(Pc, Pa, seed + 21);
  for (let y = 0; y < R; y++) {
    const v = (y + 0.5) * px;
    for (let x = 0; x < R; x++) {
      const u = (x + 0.5) * px;
      const l = Math.min(nL - 1, Math.floor(u / Lw));
      const across = u - l * Lw - Lw / 2;
      const i = y * R + x;
      const pn = vlook(Tp, Pc, Pa, (u / S) * Pc, (v / S) * Pa);
      woodPx(B, i, C, leaves[l], v, across, 0, 1, pn, null, 0, 0, 0, 0);
    }
  }
}

// ───────────────────────────── 石 ─────────────────────────────

// 主纹宽 w1(+w1v 变化)，颜色强度 c1，晕 halo；细纹（发丝纹）w2 / c2；云雾 cloud；soft = 纹边的柔和程度
const MARBLE = {
  // ramp = 每张贴图沿 u、v 各几条主纹（主纹沿一个大方向流动）；amp = 低频蜿蜒；jit = 高频的锯齿边
  // ramp2 = 发丝纹也顺着走；null = 网状发丝纹（黑金花、绿大理石）
  carrara: { warp: 0.22, ramp: [2, 4], amp: 0.85, jit: 0.1, w1: 0.0009, w1v: 0.0045, c1: 0.6, soft: 0.85, halo: 0.012, haloK: 0.42, ramp2: [5, 3], amp2: 1.6, jit2: 0.2, w2: 0.0006, c2: 0.7, cloud: 0.05, mask: 0.4 },
  calacatta: { warp: 0.2, ramp: [1, 1], amp: 1.0, jit: 0.07, w1: 0.003, w1v: 0.016, c1: 0.95, soft: 0.5, halo: 0.008, haloK: 0.36, ramp2: [3, 4], amp2: 1.6, jit2: 0.2, w2: 0.0007, c2: 0.5, cloud: 0.03, mask: 0.32 },
  nero: { warp: 0.26, ramp: [2, 1], amp: 0.75, jit: 0.14, w1: 0.0009, w1v: 0.006, c1: 0.95, soft: 0.3, halo: 0.004, haloK: 0.22, ramp2: null, lv2: 4.5, w2: 0.0006, c2: 0.55, cloud: 0.12, mask: 0.32 },
  // 石英石·金线白纹：人造的，主纹更柔、更规整，几乎没有发丝纹和云雾
  quartz: { warp: 0.14, ramp: [1, 1], amp: 0.8, jit: 0.03, w1: 0.0035, w1v: 0.012, c1: 0.75, soft: 0.75, halo: 0.01, haloK: 0.3, ramp2: [2, 3], amp2: 1.2, jit2: 0.08, w2: 0.0005, c2: 0.22, cloud: 0.012, mask: 0.36 },
  verde: { warp: 0.4, ramp: null, lv1: 2.6, w1: 0.0008, w1v: 0.0035, c1: 0.85, soft: 0.3, halo: 0.006, haloK: 0.32, ramp2: null, lv2: 5, w2: 0.0005, c2: 0.6, cloud: 0.2, mask: 0.3 },
};

function marbleStyle(t) {
  if (t.style && MARBLE[t.style]) return MARBLE[t.style];
  const b = rgb(t.base);
  const l = (b[0] + b[1] + b[2]) / 3;
  if (l > 0.6) return rgb(t.vein)[0] - rgb(t.vein)[2] > 0.12 ? MARBLE.calacatta : MARBLE.carrara;
  return b[1] > b[0] + 0.05 ? MARBLE.verde : MARBLE.nero;
}

/** 方砖：tile 尺寸、砖缝 */
function tileCell(u, v, tw, th, stagger) {
  const j = Math.floor(v / th);
  const uu = u + (stagger && j & 1 ? tw / 2 : 0);
  const i = Math.floor(uu / tw);
  const lu = uu - i * tw;
  const lv = v - j * th;
  return { i, j, lu, lv, d: Math.min(lu, tw - lu, lv, th - lv) };
}

/** 软边的纹：宽 w、边缘柔和 soft（0 = 刀切，1 = 羽化） */
function veinCov(d, w, px, soft) {
  const e = Math.max(px, w * soft);
  if (w + e < px) return (w / px) * sat(1 - d / px);
  return sat((w * 0.5 + e * 0.5 - d) / e);
}

function marble(B, t, mat, seed, tiled) {
  const { R, S, px } = B;
  const st = marbleStyle(t);
  const base = rgb(t.base);
  const vein = rgb(t.vein);
  const dark = (base[0] + base[1] + base[2]) / 3 < 0.4;
  const core = dark ? vein : mix3(vein, mul3(vein, 0.8), 0.6);
  const vein2 = dark ? mix3(base, vein, 0.75) : mix3(base, vein, 0.72);
  const cloudC = dark ? mix3(base, vein, 0.16) : mix3(base, vein, 0.32);
  const NW = fieldN(R);
  const N1 = Math.min(512, Math.max(128, R));
  // 只在「一张砖内」坐标连续时，低频场才能放大成逐像素数组；分砖时每块偏移不同，就逐像素取样
  const Wx = fbmField(NW, 2, 2, 4, seed + 1);
  const Wy = fbmField(NW, 2, 2, 4, seed + 2);
  const V1 = fbmField(N1, 2, 2, st.ramp ? 3 : 5, seed + 3);
  const V2 = fbmField(N1, 6, 6, 5, seed + 4);
  const Cl = fbmField(NW, 3, 3, 6, seed + 5);
  const Mk = fbmField(128, 3, 3, 4, seed + 6);
  const Mk2 = fbmField(128, 2, 2, 4, seed + 7);
  const wxA = tiled ? null : up(Wx, NW, R);
  const wyA = tiled ? null : up(Wy, NW, R);
  const g = [0, 0, 0];
  const tile = 0.6;
  const r0 = Math.max(0.06, mat.rough * 0.6);
  const sc = scratchField(B, seed + 9, 220 * S * S);
  for (let y = 0; y < R; y++) {
    const v = (y + 0.5) * px;
    for (let x = 0; x < R; x++) {
      const u = (x + 0.5) * px;
      const i = y * R + x;
      let uu = u / S;
      let vv = v / S;
      let grout = 0;
      let edge = 1;
      let wx;
      let wy;
      if (tiled) {
        const c = tileCell(u, v, tile, tile, false);
        uu = c.lu / S + hash2(c.i, c.j, seed) * 3.7;
        vv = c.lv / S + hash2(c.j, c.i, seed + 1) * 3.7;
        grout = 1 - sat((c.d - 0.0008) / px + 0.5);
        edge = smooth(0, 0.0025, c.d);
        wx = samp(Wx, NW, uu, vv) - 0.5;
        wy = samp(Wy, NW, uu, vv) - 0.5;
      } else {
        wx = wxA[i] - 0.5;
        wy = wyA[i] - 0.5;
      }
      const pu = uu + wx * st.warp;
      const pv = vv + wy * st.warp;
      // 主纹：一个大方向的斜坡 + 低频蜿蜒 + 高频锯齿的等值线 → 长长的、蜿蜒的纹；
      // 用梯度把「离等值线多远」换算成米，纹的粗细就能用毫米控制
      sampG(V1, N1, pu, pv, g);
      const a0 = g[0];
      const a1 = g[1];
      const a2 = g[2];
      sampG(V2, N1, pu, pv, g);
      let f1;
      let gu;
      let gv;
      if (st.ramp) {
        f1 = st.ramp[0] * pu + st.ramp[1] * pv + st.amp * a0 + st.jit * g[0];
        gu = st.ramp[0] + st.amp * a1 + st.jit * g[1];
        gv = st.ramp[1] + st.amp * a2 + st.jit * g[2];
      } else {
        f1 = a0 * st.lv1;
        gu = a1 * st.lv1;
        gv = a2 * st.lv1;
      }
      const gm1 = Math.max(0.6, Math.sqrt(gu * gu + gv * gv)) / S;
      const d1 = Math.abs(f1 - Math.floor(f1) - 0.5) / gm1;
      const wm = samp(Mk, 128, pu, pv);
      const msk = smooth(st.mask - 0.22, st.mask + 0.22, samp(Mk2, 128, pu, pv));
      const w1 = st.w1 + st.w1v * wm * wm;
      const v1c = veinCov(d1, w1, px, st.soft) * st.c1 * msk;
      const v1h = Math.exp(-d1 / st.halo) * st.haloK * (0.3 + 0.7 * msk);
      // 发丝纹
      let f2;
      if (st.ramp2) {
        f2 = st.ramp2[0] * pu + st.ramp2[1] * pv + st.amp2 * a0 + st.jit2 * g[0];
        gu = st.ramp2[0] + st.amp2 * a1 + st.jit2 * g[1];
        gv = st.ramp2[1] + st.amp2 * a2 + st.jit2 * g[2];
      } else {
        f2 = g[0] * st.lv2;
        gu = g[1] * st.lv2;
        gv = g[2] * st.lv2;
      }
      const gm2 = Math.max(0.6, Math.sqrt(gu * gu + gv * gv)) / S;
      const d2 = Math.abs(f2 - Math.floor(f2) - 0.5) / gm2;
      const v2 = lineCov(d2, st.w2, px) * st.c2 * (0.25 + 0.75 * smooth(0.25, 0.7, wm));
      // 云雾
      const cl = samp(Cl, NW, pu, pv) - 0.5;
      const ck = 1 + cl * 2 * st.cloud;
      let r = base[0] * ck;
      let gg = base[1] * ck;
      let b = base[2] * ck;
      const cm = sat(-cl * 2.2) * 0.35;
      r = lerp(r, cloudC[0], cm);
      gg = lerp(gg, cloudC[1], cm);
      b = lerp(b, cloudC[2], cm);
      const h1 = sat(v1h);
      r = lerp(r, vein[0], h1);
      gg = lerp(gg, vein[1], h1);
      b = lerp(b, vein[2], h1);
      const c1 = sat(v1c);
      r = lerp(r, core[0], c1);
      gg = lerp(gg, core[1], c1);
      b = lerp(b, core[2], c1);
      const c2 = sat(v2);
      r = lerp(r, vein2[0], c2);
      gg = lerp(gg, vein2[1], c2);
      b = lerp(b, vein2[2], c2);
      const gk = 1 - grout * 0.12 - (1 - edge) * 0.04;
      put(B, i, r * gk, gg * gk, b * gk);
      B.h[i] = -0.006 * c1 - 0.5 * grout - 0.18 * (1 - edge) * (1 - edge);
      B.r[i] = r0 + 0.04 * c1 + 0.03 * c2 + sc[i] * 0.16 + grout * 0.6;
      B.ao[i] = 1 - grout * 0.5;
    }
  }
}

/** 抛光面上的细划痕（只进粗糙度，迎着光才看得见） */
function scratchField(B, seed, count) {
  const { R, px } = B;
  const F = new Float32Array(R * R);
  const rand = rng(seed);
  for (let k = 0; k < count; k++) {
    const x0 = rand() * R;
    const y0 = rand() * R;
    const len = (0.008 + rand() * rand() * 0.06) / px;
    const a = rand() * TAU;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const amp = 0.25 + rand() * 0.75;
    const steps = Math.ceil(len);
    for (let s = 0; s < steps; s++) {
      const x = Math.floor(x0 + dx * s);
      const y = Math.floor(y0 + dy * s);
      const i = (((y % R) + R) % R) * R + (((x % R) + R) % R);
      const fade = Math.sin((Math.PI * (s + 0.5)) / steps);
      F[i] = Math.max(F[i], amp * fade);
    }
  }
  return F;
}

/** 洞石：横向沉积纹理 + 被拉长的孔洞（一半补过、一半没补） */
function travertine(B, t, mat, seed, tiled) {
  const { R, S, px } = B;
  const base = rgb(t.base);
  const vein = rgb(t.vein);
  const deep = mix3(mul3(vein, 0.8), [0.5, 0.38, 0.26], 0.2);
  const NW = fieldN(R);
  const NB = NW * 2;
  const Wx = fbmField(NW, 2, 3, 5, seed + 1);
  const Bd = fbmField(NB, 1, 14, 6, seed + 2);
  const Cl = fbmField(NW, 4, 4, 5, seed + 3);
  const Fine = fbmField(NW, 16, 40, 3, seed + 4);
  const Px = Math.max(4, Math.round(S / Math.max(0.018, px * 5)));
  const Py = Math.max(4, Math.round(S / Math.max(0.0042, px * 1.6)));
  const Tp = vtable(Px, Py, seed + 5);
  const r0 = mat.rough;
  // fill = 补孔的比例（天然洞石约一半；石英石·洞石纹 = 1：只有纹路，没有真的孔、也没有针孔）
  const fillP = t.fill ?? 0.45;
  const pins = !(t.fill >= 1);
  for (let y = 0; y < R; y++) {
    const v = (y + 0.5) * px;
    for (let x = 0; x < R; x++) {
      const u = (x + 0.5) * px;
      const i = y * R + x;
      let uu = u / S;
      let vv = v / S;
      let grout = 0;
      let edge = 1;
      let tk = 1;
      if (tiled) {
        const c = tileCell(u, v, 0.6, 0.4, true);
        uu = c.lu / S + hash2(c.i, c.j, seed) * 5.3;
        vv = c.lv / S + hash2(c.j, c.i, seed + 1) * 5.3;
        grout = 1 - sat((c.d - 0.001) / px + 0.5);
        edge = smooth(0, 0.003, c.d);
        tk = 1 + (hash2(c.i, c.j, seed + 2) - 0.5) * 0.07;
      }
      const wx = samp(Wx, NW, uu, vv) - 0.5;
      const bvv = vv + wx * 0.05;
      const band = samp(Bd, NB, uu + wx * 0.1, bvv);
      const bandK = smooth(0.38, 0.82, band);
      const cl = samp(Cl, NW, uu, vv) - 0.5;
      const fine = samp(Fine, NW, uu, bvv) - 0.5;
      // 孔洞：沿着沉积层拉长（小而密，集中在深色层）
      const pn = vlook(Tp, Px, Py, uu * Px, bvv * Py);
      const pit = smooth(0.8, 0.86, pn * (0.84 + 0.24 * bandK));
      const filled = hash2(Math.floor(uu * Px), Math.floor(bvv * Py), seed + 6) < fillP;
      const pinhole = pins && hash2(x, y, seed + 8) > 0.9975 ? 1 : 0;
      const k = tk * (1 + cl * 0.1 + fine * 0.06) * (1 - grout * 0.15);
      let r = lerp(base[0], vein[0], bandK * 0.62) * k;
      let g = lerp(base[1], vein[1], bandK * 0.62) * k;
      let b = lerp(base[2], vein[2], bandK * 0.62) * k;
      const pd = filled ? pit * 0.35 : pit;
      r = lerp(r, deep[0], pd);
      g = lerp(g, deep[1], pd);
      b = lerp(b, deep[2], pd);
      const ph = pinhole * 0.4;
      put(B, i, r * (1 - ph), g * (1 - ph), b * (1 - ph));
      B.h[i] = fine * 0.04 - (filled ? 0.15 : 1.1) * pit - 0.3 * pinhole - 0.6 * grout - 0.25 * (1 - edge) * (1 - edge);
      B.r[i] = r0 + fine * 0.06 + pit * (filled ? 0.05 : 0.25) + grout * 0.3;
      B.ao[i] = 1 - (filled ? 0.1 : 0.45) * pit - 0.4 * grout - ph * 0.5;
    }
  }
}

/** 水磨石：底料（细砂）+ 三种大小的有棱角石子（凸多边形，带一圈半透明的边） */
function terrazzo(B, t, mat, seed) {
  const { R, S, px } = B;
  const base = rgb(t.base);
  const chips = (t.chips || ['#999999']).map(rgb);
  const NW = fieldN(R);
  const NM = Math.min(512, Math.max(128, R));
  const Cl = up(fbmField(NW, 4, 4, 5, seed), NW, R);
  const Fm = up(fbmField(NM, 24, 24, 3, seed + 1), NM, R);
  const r0 = mat.rough;
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const i = y * R + x;
      const k = 1 + (Cl[i] - 0.5) * 0.06 + (Fm[i] - 0.5) * 0.06 + (hash2(x, y, seed) - 0.5) * 0.07;
      put(B, i, base[0] * k, base[1] * k, base[2] * k);
      const pin = hash2(x, y, seed + 3) > 0.998 ? 1 : 0;
      B.h[i] = -0.25 * pin;
      B.r[i] = r0 + 0.07 + pin * 0.2;
      B.ao[i] = 1 - pin * 0.4;
    }
  }
  const occ = new Uint8Array(R * R);
  const rand = rng(seed + 11);
  const layers = [
    { d: 0.022, v: 0.6, cover: 0.22 },
    { d: 0.011, v: 0.5, cover: 0.2 },
    { d: 0.0048, v: 0.5, cover: 0.15 },
  ];
  const nx = new Float32Array(8);
  const ny = new Float32Array(8);
  const nr = new Float32Array(8);
  for (const L of layers) {
    const count = Math.round((L.cover * S * S) / (L.d * L.d * 0.62));
    for (let c = 0; c < count; c++) {
      const cx = rand() * S;
      const cy = rand() * S;
      const rad = (L.d / 2) * (1 + (rand() - 0.5) * L.v);
      const K = 5 + Math.floor(rand() * 4);
      const rot = rand() * TAU;
      const elong = 0.75 + rand() * 0.5;
      for (let k = 0; k < K; k++) {
        const a = rot + ((k + (rand() - 0.5) * 0.5) / K) * TAU;
        nx[k] = Math.cos(a);
        ny[k] = Math.sin(a) * elong;
        const l = Math.hypot(nx[k], ny[k]);
        nx[k] /= l;
        ny[k] /= l;
        nr[k] = rad * (0.72 + rand() * 0.36);
      }
      const pick = rand();
      const col = chips[Math.min(chips.length - 1, Math.floor(pick * pick * 0.65 * chips.length + rand() * 0.6 * chips.length) % chips.length)];
      const tone = 0.9 + rand() * 0.18;
      const ct = [col[0] * tone, col[1] * tone, col[2] * tone];
      const mott = rand() * 0.06;
      const rr = rad * 1.4;
      const x0 = Math.floor((cx - rr) / px);
      const x1 = Math.ceil((cx + rr) / px);
      const y0 = Math.floor((cy - rr) / px);
      const y1 = Math.ceil((cy + rr) / px);
      for (let yy = y0; yy <= y1; yy++) {
        const wy = ((yy % R) + R) % R;
        const dy = (yy + 0.5) * px - cy;
        for (let xx = x0; xx <= x1; xx++) {
          const wx = ((xx % R) + R) % R;
          const i = wy * R + wx;
          if (occ[i]) continue;
          const dx = (xx + 0.5) * px - cx;
          let sd = -1;
          for (let k = 0; k < K; k++) {
            const e = dx * nx[k] + dy * ny[k] - nr[k];
            if (e > sd) sd = e;
          }
          if (sd > px * 0.5) continue;
          const cov = sat(0.5 - sd / px);
          const inner = sat(-sd / 0.0009); // 边上一圈略暗（半透明石子的边）
          const m = 1 + (hash2(wx, wy, seed + 17) - 0.5) * mott + (inner - 1) * 0.07;
          const j = i * 3;
          B.c[j] = lerp(B.c[j], ct[0] * m, cov);
          B.c[j + 1] = lerp(B.c[j + 1], ct[1] * m, cov);
          B.c[j + 2] = lerp(B.c[j + 2], ct[2] * m, cov);
          B.h[i] = lerp(B.h[i], 0.02, cov);
          B.r[i] = lerp(B.r[i], r0 - 0.06, cov);
          B.ao[i] = lerp(B.ao[i], 1, cov);
          if (cov > 0.5) occ[i] = 1;
        }
      }
    }
  }
}

/** 微水泥 / 岩板：云雾 + 抹刀纹（每一刀都留下一条细边和一片更亮的磨光面）+ 针孔 */
function concrete(B, t, mat, seed) {
  const { R, S, px } = B;
  const base = rgb(t.base);
  const fine = !!t.fine;
  const NW = fieldN(R);
  const Cl = fbmField(NW, 3, 3, 6, seed);
  const NM = Math.min(512, R);
  const Fm = fbmField(NM, 18, 18, 4, seed + 1);
  // 抹刀纹（低分辨率场，再取样）
  const NT = R >= 1024 ? 512 : R >= 384 ? 256 : 128;
  const T = new Float32Array(NT * NT);
  const E = new Float32Array(NT * NT);
  const G = new Float32Array(NT * NT);
  if (!fine) {
    const rand = rng(seed + 3);
    const strokes = Math.round(((S * S) / 0.04) * 2.2);
    const tp = S / NT;
    for (let s = 0; s < strokes; s++) {
      const cx = rand() * S;
      const cy = rand() * S;
      const len = 0.22 + rand() * 0.35;
      const wid = 0.05 + rand() * 0.09;
      const a = rand() * TAU;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const kap = (rand() - 0.5) * 6;
      const tone = (rand() - 0.5) * 2;
      const gloss = rand();
      const rr = len * 0.6 + wid;
      const x0 = Math.floor((cx - rr) / tp);
      const x1 = Math.ceil((cx + rr) / tp);
      const y0 = Math.floor((cy - rr) / tp);
      const y1 = Math.ceil((cy + rr) / tp);
      for (let yy = y0; yy <= y1; yy++) {
        const py = (yy + 0.5) * tp - cy;
        const wy = ((yy % NT) + NT) % NT;
        for (let xx = x0; xx <= x1; xx++) {
          const pxx = (xx + 0.5) * tp - cx;
          const al = pxx * dx + py * dy;
          if (Math.abs(al) > len / 2) continue;
          const ac = -pxx * dy + py * dx - kap * al * al;
          if (ac < -0.004 || ac > wid) continue;
          const ea = 1 - ((2 * al) / len) ** 2;
          const prof = smooth(-0.004, wid * 0.12, ac) * (1 - ac / wid);
          const i = wy * NT + (((xx % NT) + NT) % NT);
          T[i] += tone * ea * prof;
          G[i] += gloss * ea * prof;
          E[i] = Math.max(E[i], ea * Math.exp(-((ac / Math.max(tp, 0.003)) ** 2)));
        }
      }
    }
  }
  const r0 = mat.rough;
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const i = y * R + x;
      const uu = (x + 0.5) / R;
      const vv = (y + 0.5) / R;
      const cl = samp(Cl, NW, uu, vv) - 0.5;
      const fm = samp(Fm, NM, uu, vv) - 0.5;
      const sp = hash2(x, y, seed + 5) - 0.5;
      let k;
      let h;
      let r;
      let ao = 1;
      if (fine) {
        k = 1 + cl * 0.06 + fm * 0.03 + sp * 0.05;
        h = fm * 0.01 + sp * 0.006;
        r = r0 + fm * 0.05;
      } else {
        const tr = samp(T, NT, uu, vv);
        const gl = sat(samp(G, NT, uu, vv));
        const ed = samp(E, NT, uu, vv);
        const pin = hash2(x, y, seed + 7) > 0.9965 ? 1 : 0;
        k = 1 + cl * 0.16 + fm * 0.07 + tr * 0.05 + sp * 0.035 - ed * 0.04 - pin * 0.25;
        h = fm * 0.05 + ed * 0.03 - pin * 0.3 + tr * 0.01;
        r = r0 - gl * 0.2 + fm * 0.08 + ed * 0.04 + pin * 0.2;
        ao = 1 - pin * 0.4;
      }
      put(B, i, base[0] * k, base[1] * k, base[2] * k);
      B.h[i] = h;
      B.r[i] = r;
      B.ao[i] = ao;
    }
  }
  void px;
}

// ───────────────────────────── 漆 ─────────────────────────────

/** 石灰漆：云雾状的深浅 + 交叉的刷痕 */
function limewash(B, t, mat, seed) {
  const { R } = B;
  const base = rgb(t.base);
  const deep = mul3(base, 0.82);
  deep[2] *= 0.96;
  const NW = fieldN(R);
  const Cl = fbmField(NW, 3, 3, 6, seed);
  const Cl2 = fbmField(NW, 7, 7, 5, seed + 1);
  const D1 = diagField(NW, 3, 26, 3, seed + 2, 1);
  const D2 = diagField(NW, 3, 26, 3, seed + 3, -1);
  const r0 = mat.rough;
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const i = y * R + x;
      const uu = (x + 0.5) / R;
      const vv = (y + 0.5) / R;
      const cl = samp(Cl, NW, uu, vv) - 0.5;
      const c2 = samp(Cl2, NW, uu, vv) - 0.5;
      const d1 = samp(D1, NW, uu, vv) - 0.5;
      const d2 = samp(D2, NW, uu, vv) - 0.5;
      const brush = d1 * 0.55 + d2 * 0.45;
      const m = sat(0.5 - cl * 1.6 - c2 * 0.5 - brush * 0.4);
      const k = 1 + cl * 0.12 + c2 * 0.05 + brush * 0.06;
      put(B, i, lerp(base[0] * k, deep[0], m * 0.35), lerp(base[1] * k, deep[1], m * 0.35), lerp(base[2] * k, deep[2], m * 0.35));
      B.h[i] = brush * 0.05 + (hash2(x, y, seed) - 0.5) * 0.006;
      B.r[i] = r0 + c2 * 0.04;
    }
  }
}

/** 乳胶漆：几乎均匀，极淡的滚筒纹；烤漆：完全均匀 + 极轻的橘皮 */
function paint(B, t, mat, seed) {
  const { R } = B;
  const base = rgb(t.base);
  const lac = !!t.smooth;
  const NW = fieldN(R);
  const Cl = fbmField(NW, 3, 3, 4, seed);
  const Rl = fbmField(NW, 10, 2, 3, seed + 1);
  const P = Math.max(8, Math.round(R / (lac ? 2.4 : 1.3)));
  const Tp = vtable(P, P, seed + 2);
  const r0 = mat.rough;
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const i = y * R + x;
      const uu = (x + 0.5) / R;
      const vv = (y + 0.5) / R;
      const st = vlook(Tp, P, P, uu * P, vv * P) - 0.5;
      const k = lac ? 1 + (samp(Cl, NW, uu, vv) - 0.5) * 0.008 : 1 + (samp(Cl, NW, uu, vv) - 0.5) * 0.018 + (samp(Rl, NW, uu, vv) - 0.5) * 0.014 + st * 0.012;
      put(B, i, base[0] * k, base[1] * k, base[2] * k);
      B.h[i] = st * (lac ? 0.0035 : 0.022);
      B.r[i] = r0 + (lac ? st * 0.01 : st * 0.05);
    }
  }
}

// ───────────────────────────── 砖 ─────────────────────────────

/** 瓷砖：圆角砖边、凹进去的砖缝；zellige = 手工砖（砖面起伏、釉在边上积得更深、每块倾斜不同） */
function tile(B, t, mat, seed) {
  const { R, S, px } = B;
  const base = rgb(t.base);
  const groutC = rgb(t.grout);
  const tw0 = t.rect ? (t.size || 0.6) * 2 : t.size || 0.1;
  const th0 = t.size || 0.1;
  const nx = Math.max(1, Math.round(S / tw0));
  const ny = Math.max(1, Math.round(S / th0));
  const TW = S / nx;
  const TH = S / ny;
  const vary = t.vary || 0.03;
  const zel = vary > 0.05 && th0 < 0.15;
  const terra = rgb(t.base)[0] > rgb(t.base)[2] + 0.2 && !zel;
  const gw = zel ? 0.0016 : terra ? 0.006 : 0.0022;
  const NW = fieldN(R);
  const Wob = fbmField(NW, Math.max(2, nx * 2), Math.max(2, ny * 2), 3, seed + 1);
  const Und = fbmField(NW, Math.max(2, nx * 2), Math.max(2, ny * 2), 4, seed + 2);
  const Cl = fbmField(NW, 4, 4, 5, seed + 3);
  slopes(B);
  const r0 = mat.rough;
  const rTile = zel ? Math.min(r0, 0.12) : r0;
  for (let y = 0; y < R; y++) {
    const v = (y + 0.5) * px;
    for (let x = 0; x < R; x++) {
      const u = (x + 0.5) * px;
      const i = y * R + x;
      const uu = u / S;
      const vv = v / S;
      const c = tileCell(u, v, TW, TH, !!t.rect);
      const ii = ((c.i % nx) + nx) % nx;
      const jj = ((c.j % ny) + ny) % ny;
      let d = c.d;
      if (zel) d += (samp(Wob, NW, uu, vv) - 0.5) * 0.0026;
      const groutCov = 1 - sat((d - gw / 2) / px + 0.5);
      const tid = hash2(ii, jj, seed);
      const tone = 1 + (tid - 0.5) * 2 * vary;
      const er = zel ? 0.007 : terra ? 0.004 : 0.0025;
      const e = smooth(0, er, d - gw / 2);
      let k = tone;
      let h = 0;
      let rr = rTile;
      if (zel) {
        const und = samp(Und, NW, uu, vv) - 0.5;
        const pool = 1 - e;
        k *= 1 + und * 0.1 - pool * 0.14;
        h = und * 0.9 - 0.9 * (1 - e) ** 2;
        rr = rTile + pool * 0.04 + (hash2(x, y, seed + 9) > 0.996 ? 0.3 : 0);
      } else {
        const cl = samp(Cl, NW, uu + tid, vv) - 0.5;
        k *= 1 + cl * (terra ? 0.16 : 0.03);
        if (terra) {
          const sp = hash2(x, y, seed + 4);
          if (sp > 0.996) k *= 0.7;
          else if (sp < 0.002) k *= 1.25;
          h = cl * 0.08 + (sp > 0.996 ? -0.2 : 0);
          rr = r0 + cl * 0.08;
        }
        h += -0.45 * (1 - e) ** 2;
      }
      const sand = (hash2(x, y, seed + 6) - 0.5) * 0.08;
      const gc = 1 + sand;
      const j = i * 3;
      B.c[j] = lerp(base[0] * k, groutC[0] * gc, groutCov);
      B.c[j + 1] = lerp(base[1] * k, groutC[1] * gc, groutCov);
      B.c[j + 2] = lerp(base[2] * k, groutC[2] * gc, groutCov);
      B.h[i] = lerp(h, -1.6, groutCov);
      B.r[i] = lerp(rr, 0.9, groutCov);
      B.ao[i] = lerp(1 - (1 - e) * 0.12, 0.55, groutCov);
      if (zel || terra) {
        B.sx[i] = (hash2(ii, jj, seed + 7) - 0.5) * (zel ? 0.05 : 0.012) * (1 - groutCov);
        B.sy[i] = (hash2(jj, ii, seed + 8) - 0.5) * (zel ? 0.05 : 0.012) * (1 - groutCov);
      }
    }
  }
}

// ───────────────────────────── 布 ─────────────────────────────

/** 亚麻 / 棉：平纹，一上一下；竹节（slub）让每根纱粗细、深浅不匀 —— 亚麻的质感主要来自这里 */
function linen(B, t, mat, seed) {
  const { R, S, px } = B;
  const base = rgb(t.base);
  const fine = !!t.fine;
  const pitch = Math.max(fine ? 0.0008 : 0.0017, px * (fine ? 2.6 : 3));
  const n = Math.max(2, Math.round(S / pitch / 2) * 2);
  const f = n / S;
  const L1 = Math.max(4, Math.round(n / 9));
  const L2 = Math.max(8, Math.round(n / 2.5));
  const Tw1 = vtable(n, L1, seed + 1);
  const Tw2 = vtable(n, L2, seed + 4);
  const Tf1 = vtable(n, L1, seed + 2);
  const Tf2 = vtable(n, L2, seed + 5);
  const NW = fieldN(R);
  const cl = up(fbmField(NW, 4, 4, 4, seed + 3), NW, R);
  const slubK = fine ? 0.35 : 1;
  const th0 = fine ? 0.97 : 0.9; // 纱的粗细（占一格的比例）：棉布织得更密，几乎没有缝
  const lo = fine ? 0.93 : 0.84; // 纱的起伏造成的明暗
  const gapT = fine ? 0.86 : 0.74;
  const r0 = mat.rough;
  for (let y = 0; y < R; y++) {
    const v = (y + 0.5) * px;
    const ty = v * f;
    const j = Math.floor(ty);
    const fy = ty - j;
    for (let x = 0; x < R; x++) {
      const u = (x + 0.5) * px;
      const tx = u * f;
      const ii = Math.floor(tx);
      const fx = tx - ii;
      const i = y * R + x;
      const over = (ii + j) & 1; // 1 = 经线（竖）在上
      const sw = (vlook(Tw1, n, L1, ii + 0.5, (v / S) * L1) - 0.5) * 0.75 + (vlook(Tw2, n, L2, ii + 0.5, (v / S) * L2) - 0.5) * 0.5;
      const sf = (vlook(Tf1, n, L1, j + 0.5, (u / S) * L1) - 0.5) * 0.75 + (vlook(Tf2, n, L2, j + 0.5, (u / S) * L2) - 0.5) * 0.5;
      const thW = th0 + sw * 0.4 * slubK;
      const thF = th0 + sf * 0.4 * slubK;
      const cw = (fx - 0.5) / (0.5 * thW);
      const cf = (fy - 0.5) / (0.5 * thF);
      const pw = 1 - cw * cw;
      const pf = 1 - cf * cf;
      const zw = pw > 0 ? (over ? 0.55 + 0.45 * Math.sin(Math.PI * fy) : 0.5 - 0.35 * Math.sin(Math.PI * fy)) * (0.65 + 0.35 * Math.sqrt(pw)) : -1;
      const zf = pf > 0 ? (over ? 0.5 - 0.35 * Math.sin(Math.PI * fx) : 0.55 + 0.45 * Math.sin(Math.PI * fx)) * (0.65 + 0.35 * Math.sqrt(pf)) : -1;
      let z;
      let tint;
      if (zw < 0 && zf < 0) {
        z = 0.05;
        tint = gapT;
      } else if (zw >= zf) {
        z = zw;
        tint = (lo + (1 - lo) * z) * (1 + sw * 0.2 * slubK) * (1 + (hash2(ii, 3, seed) - 0.5) * 0.03) * 1.012;
      } else {
        z = zf;
        tint = (lo + (1 - lo) * z) * (1 + sf * 0.2 * slubK) * (1 + (hash2(j, 5, seed) - 0.5) * 0.03) * 0.988;
      }
      const k = (tint * (1 + (cl[i] - 0.5) * 0.06)) / (lo + (1 - lo) * 0.62);
      put(B, i, base[0] * k, base[1] * k, base[2] * k);
      B.h[i] = z * pitch * 1000 * (fine ? 0.18 : 0.3);
      B.r[i] = r0 + (1 - z) * 0.05;
      B.ao[i] = 0.62 + 0.38 * z;
    }
  }
}

/** 羊羔绒：一层绒底 + 密密麻麻的小毛圈（环形高度，有开口），圈顶亮、圈间暗 */
function boucle(B, t, mat, seed) {
  const { R, S, px } = B;
  const base = rgb(t.base);
  const r0 = mat.rough;
  const NW = fieldN(R);
  const cl = up(fbmField(NW, 5, 5, 4, seed + 1), NW, R);
  for (let i = 0; i < R * R; i++) {
    const hz = hash2(i, 1, seed) - 0.5;
    const k = 0.84 + hz * 0.06 + (cl[i] - 0.5) * 0.06;
    put(B, i, base[0] * k, base[1] * k, base[2] * k);
    B.h[i] = hz * 0.08;
    B.r[i] = r0;
    B.ao[i] = 0.72;
  }
  const rand = rng(seed + 5);
  const rMin = Math.max(0.0015, px * 2.4);
  const count = Math.round((3.4 * S * S) / (Math.PI * (rMin * 1.35) ** 2));
  for (let c = 0; c < count; c++) {
    const cx = rand() * S;
    const cy = rand() * S;
    const r = rMin * (0.75 + rand() * 0.9);
    const tk = Math.max(px * 0.9, r * (0.3 + rand() * 0.14));
    const lift = rand() * 0.5;
    const a0 = rand() * TAU;
    const gap = 0.4 + rand() * 1.4; // 毛圈开口
    const shade = 0.95 + rand() * 0.1;
    const rr = r + tk;
    const x0 = Math.floor((cx - rr) / px);
    const x1 = Math.ceil((cx + rr) / px);
    const y0 = Math.floor((cy - rr) / px);
    const y1 = Math.ceil((cy + rr) / px);
    for (let yy = y0; yy <= y1; yy++) {
      const wy = ((yy % R) + R) % R;
      const dy = (yy + 0.5) * px - cy;
      for (let xx = x0; xx <= x1; xx++) {
        const dx = (xx + 0.5) * px - cx;
        const dd = Math.sqrt(dx * dx + dy * dy);
        const ring = (dd - r) / tk;
        if (ring * ring >= 1) continue;
        let ang = Math.atan2(dy, dx) - a0;
        ang -= Math.floor(ang / TAU) * TAU;
        if (ang < gap) continue;
        const z = Math.sqrt(1 - ring * ring) * (0.55 + lift) + 0.1;
        const i = wy * R + (((xx % R) + R) % R);
        if (z <= B.h[i]) continue;
        B.h[i] = z;
        const k = (0.9 + 0.14 * Math.min(1, z)) * shade;
        put(B, i, base[0] * k, base[1] * k, base[2] * k);
        B.ao[i] = 0.78 + 0.22 * Math.min(1, z);
        B.r[i] = r0 - 0.04 * z;
      }
    }
  }
}

/** 粗针织：一列列 V 字针脚，每条腿上有股线的捻纹 */
function knit(B, t, mat, seed) {
  const { R, S, px } = B;
  const base = rgb(t.base);
  const ncol = Math.max(2, Math.round(S / 0.014));
  const nrow = Math.max(2, Math.round(S / 0.0105));
  const cw = S / ncol;
  const ch = S / nrow;
  const r0 = mat.rough;
  const cs = Math.cos(0.42);
  const sn = Math.sin(0.42);
  for (let y = 0; y < R; y++) {
    const v = (y + 0.5) * px;
    const Y = v / ch;
    const row = Math.floor(Y);
    for (let x = 0; x < R; x++) {
      const u = (x + 0.5) * px;
      const X = u / cw;
      const col = Math.floor(X);
      const fx = X - col;
      let best = -1;
      let tw = 0;
      let sid = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const fy = Y - (row + dr);
        for (let side = -1; side <= 1; side += 2) {
          // 腿：中心 (0.5 ± 0.2, 0.62)，长轴沿着 V 的方向倾斜
          const ex = fx - (0.5 + side * 0.205);
          const ey = (fy - 0.6) * (ch / cw);
          const a = ex * cs - side * ey * sn;
          const b = side * ex * sn + ey * cs;
          const ra = a / 0.2;
          const rb = b / 0.62;
          const q = ra * ra + rb * rb;
          if (q >= 1) continue;
          const z = Math.sqrt(1 - q) + dr * 0.04;
          if (z > best) {
            best = z;
            tw = 0.5 + 0.5 * Math.sin(TAU * (b * 3.2 + side * a * 1.6));
            sid = (row + dr) * 131 + col * 7 + side;
          }
        }
      }
      const i = y * R + x;
      const heather = (hash2(x, y, seed) - 0.5) * 0.05 + (hash2(sid, 3, seed) - 0.5) * 0.04;
      if (best < 0) {
        put(B, i, base[0] * 0.45, base[1] * 0.45, base[2] * 0.45);
        B.h[i] = 0;
        B.ao[i] = 0.45;
      } else {
        const k = (0.66 + 0.4 * best) * (0.94 + tw * 0.1) + heather;
        put(B, i, base[0] * k, base[1] * k, base[2] * k);
        B.h[i] = (best * 0.85 + tw * 0.12) * 3;
        B.ao[i] = 0.5 + 0.5 * best;
      }
      B.r[i] = r0;
    }
  }
}

/** 丝绒：极细的绒毛 + 压痕（绒毛倒向不同 → 光泽深浅不同，丝绒的「流光」就是这么来的） */
function velvet(B, t, mat, seed) {
  const { R } = B;
  const base = rgb(t.base);
  const NW = fieldN(R);
  const cl = up(fbmField(NW, 3, 3, 5, seed), NW, R);
  const cr = up(diagField(NW, 2, 9, 3, seed + 1, 1), NW, R);
  const P = Math.max(8, Math.round(R / 1.2));
  const Tp = vtable(P, P, seed + 2);
  const r0 = mat.rough;
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const i = y * R + x;
      const uu = (x + 0.5) / R;
      const vv = (y + 0.5) / R;
      const c = cl[i] - 0.5;
      const d = cr[i] - 0.5;
      const pile = vlook(Tp, P, P, uu * P, vv * P) - 0.5;
      const k = 1 + c * 0.16 + d * 0.1 + pile * 0.05;
      put(B, i, base[0] * k, base[1] * k, base[2] * k);
      B.h[i] = c * 0.3 + d * 0.22 + pile * 0.015;
      B.r[i] = r0 + d * 0.06;
    }
  }
}

/** 羊毛 / 毛毡：混色纤维（heather）—— 一根根短纤维，有浅有深，柔软起伏 */
function felt(B, t, mat, seed) {
  const { R, S, px } = B;
  const base = rgb(t.base);
  const lite = mix3(base, [1, 1, 1], 0.16);
  const dark = mul3(base, 0.76);
  const warm = [base[0] * 1.06, base[1] * 0.98, base[2] * 0.92];
  const NW = fieldN(R);
  const cl = up(fbmField(NW, 5, 5, 5, seed), NW, R);
  const r0 = mat.rough;
  for (let i = 0; i < R * R; i++) {
    const hz = hash2(i, 2, seed) - 0.5;
    const k = 1 + (cl[i] - 0.5) * 0.09 + hz * 0.05;
    put(B, i, base[0] * k, base[1] * k, base[2] * k);
    B.h[i] = (cl[i] - 0.5) * 0.25 + hz * 0.03;
    B.r[i] = r0;
    B.ao[i] = 0.9;
  }
  const rand = rng(seed + 9);
  const len = Math.max(0.0025, px * 3.5);
  const count = Math.round((1.3 * S * S) / (len * px));
  for (let c = 0; c < count; c++) {
    let x = rand() * R;
    let y = rand() * R;
    let a = rand() * TAU;
    const bend = (rand() - 0.5) * 0.5;
    const pick = rand();
    const col = pick < 0.44 ? lite : pick < 0.88 ? dark : warm;
    const amt = 0.35 + rand() * 0.35;
    const steps = Math.max(2, Math.round((len / px) * (0.6 + rand() * 0.8)));
    for (let k = 0; k < steps; k++) {
      const i = ((((y | 0) % R) + R) % R) * R + ((((x | 0) % R) + R) % R);
      const j = i * 3;
      B.c[j] = lerp(B.c[j], col[0], amt);
      B.c[j + 1] = lerp(B.c[j + 1], col[1], amt);
      B.c[j + 2] = lerp(B.c[j + 2], col[2], amt);
      B.h[i] += 0.03;
      x += Math.cos(a);
      y += Math.sin(a);
      a += bend;
    }
  }
}

/** 皮革：荔枝纹颗粒（Voronoi）+ 褶皱 + 色斑；凸起处被摩擦得更亮更光 */
function leather(B, t, mat, seed) {
  const { R, S } = B;
  const base = rgb(t.base);
  const n = Math.max(8, Math.round(S / Math.max(0.0021, B.px * 2.4)));
  const NW = fieldN(R);
  const Cr = fbmField(NW, 3, 3, 6, seed + 1, { ridged: true });
  const Mo = fbmField(NW, 4, 4, 5, seed + 2);
  const out = [0, 0, 0, 0, 0];
  const r0 = mat.rough;
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const i = y * R + x;
      const uu = (x + 0.5) / R;
      const vv = (y + 0.5) / R;
      worley(uu * n, vv * n, n, seed + 3, out, 0.85);
      const edge = out[1] - out[0];
      const groove = 1 - smooth(0.02, 0.2, edge);
      const dome = Math.max(0, 1 - out[0] * 1.5);
      const cr = smooth(0.8, 0.95, samp(Cr, NW, uu, vv));
      const mo = samp(Mo, NW, uu, vv) - 0.5;
      const k = (1 + mo * 0.22) * (1 - 0.24 * groove) * (1 - 0.2 * cr) * (1 + 0.06 * dome);
      put(B, i, base[0] * k, base[1] * k, base[2] * k);
      B.h[i] = 0.08 * dome - 0.1 * groove - 0.22 * cr;
      B.r[i] = r0 - 0.06 * dome + 0.14 * groove + 0.08 * cr - mo * 0.06;
      B.ao[i] = 1 - 0.3 * groove - 0.15 * cr;
    }
  }
}

/** 藤编（维也纳藤网）：成对的经、纬藤条 + 两条斜向藤条，八角形孔 */
function rattan(B, t, mat, seed) {
  const { R, S, px } = B;
  const base = rgb(t.base);
  const hole = [0.1, 0.07, 0.045];
  const cells = Math.max(2, Math.round(S / 0.016));
  const p = S / cells;
  const sw = p * 0.15; // 藤条宽
  const pair = p * 0.105; // 成对藤条的间距
  const P = 512;
  const Tf = vtable(P, 16, seed + 1);
  const r0 = mat.rough;
  const ln = (q) => {
    const f = q / p;
    return Math.abs(f - Math.round(f)) * p;
  };
  const cand = [0, 0, 0, 0];
  for (let y = 0; y < R; y++) {
    const v = (y + 0.5) * px;
    for (let x = 0; x < R; x++) {
      const u = (x + 0.5) * px;
      const i = y * R + x;
      // 到四组藤条的距离
      const dV = Math.abs(ln(u) - pair);
      const dH = Math.abs(ln(v) - pair);
      const dD1 = ln(u - v) / Math.SQRT2;
      const dD2 = ln(u + v) / Math.SQRT2;
      let best = -1;
      let along = 0;
      let across = 0;
      let fam = -1;
      cand[0] = dH < sw / 2 ? 0.0 : -1;
      cand[1] = dV < sw / 2 ? 0.35 : -1;
      cand[2] = dD1 < sw / 2 ? 0.6 + 0.12 * Math.sin((Math.PI * (u + v)) / p) : -1;
      cand[3] = dD2 < sw / 2 ? 0.6 - 0.12 * Math.sin((Math.PI * (u - v)) / p) : -1;
      const ds = [dH, dV, dD1, dD2];
      for (let k = 0; k < 4; k++) {
        if (cand[k] < 0) continue;
        const prof = Math.sqrt(1 - (ds[k] / (sw / 2)) ** 2);
        const z = cand[k] + 0.35 * Math.pow(prof, 0.6);
        if (z > best) {
          best = z;
          fam = k;
          across = ds[k] / (sw / 2);
          along = k === 0 ? u : k === 1 ? v : k === 2 ? (u + v) / Math.SQRT2 : (u - v) / Math.SQRT2;
        }
      }
      if (fam < 0) {
        put(B, i, hole[0], hole[1], hole[2]);
        B.h[i] = -0.6;
        B.r[i] = 0.9;
        B.ao[i] = 0.3;
        continue;
      }
      const fib = vlook(Tf, P, 16, across * 6 + fam * 40 + ds[fam] * 0, (along / S) * 16 + fam * 3) - 0.5;
      const edgeD = 1 - across * across;
      const k = (0.72 + 0.32 * Math.sqrt(Math.max(0, edgeD))) * (1 + fib * 0.12) * (fam >= 2 ? 0.97 : 1.02);
      put(B, i, base[0] * k, base[1] * k, base[2] * k);
      B.h[i] = best * 1.1 + fib * 0.02;
      B.r[i] = r0 - 0.08 * edgeD + Math.abs(fib) * 0.1;
      B.ao[i] = 0.6 + 0.4 * Math.min(1, best);
    }
  }
}

// ───────────────────────────── 金属 ─────────────────────────────

/** 拉丝金属：沿 u 方向的长条拉丝（粗糙度 + 极浅的沟），金属色 = f0 */
function metal(B, t, mat, seed) {
  const { R, S, px } = B;
  const f0 = rgb(t.f0 || t.base);
  const P1x = Math.max(4, Math.round(S / 0.06));
  const P1y = Math.max(8, Math.round(R * 0.7));
  const P2x = Math.max(2, Math.round(S / 0.25));
  const P2y = Math.max(8, Math.round(S / Math.max(0.0025, px * 3)));
  const T1 = vtable(P1x, P1y, seed + 1);
  const T2 = vtable(P2x, P2y, seed + 2);
  const NW = fieldN(R);
  const Cl = fbmField(NW, 3, 3, 4, seed + 3);
  const r0 = mat.rough;
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const i = y * R + x;
      const uu = (x + 0.5) / R;
      const vv = (y + 0.5) / R;
      const s1 = vlook(T1, P1x, P1y, uu * P1x, vv * P1y) - 0.5;
      const s2 = vlook(T2, P2x, P2y, uu * P2x, vv * P2y) - 0.5;
      const cl = samp(Cl, NW, uu, vv) - 0.5;
      const k = 1 + s1 * 0.05 + s2 * 0.05 + cl * 0.04;
      put(B, i, f0[0] * k, f0[1] * k, f0[2] * k);
      B.h[i] = s1 * 0.004 + s2 * 0.006;
      B.r[i] = r0 + s1 * 0.12 + s2 * 0.08 + cl * 0.05;
    }
  }
}

// ───────────────────────────── 入口 ─────────────────────────────

const GEN = {
  marble: (B, t, m, s, variant) => marble(B, t, m, s, variant === 'tiled'),
  travertine: (B, t, m, s, variant) => travertine(B, t, m, s, variant === 'tiled'),
  terrazzo,
  concrete,
  limewash,
  paint,
  tile,
  linen,
  boucle,
  knit,
  velvet,
  felt,
  leather,
  rattan,
  metal,
};

function seedOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function fill(matId, variant, R, swatch) {
  const mat = MAT_BY_ID[matId];
  if (!mat) throw new Error(`unknown material ${matId}`);
  const t = mat.tex;
  const S = sizeFor(t, variant, swatch);
  const B = makeBuf(R, S);
  const seed = seedOf(matId) % 100000;
  if (t.type === 'wood') {
    if (variant === 'herringbone') woodHerringbone(B, t, mat, seed);
    else if (variant === 'veneer') woodVeneer(B, t, mat, seed);
    else woodPlank(B, t, mat, seed);
  } else {
    (GEN[t.type] || paint)(B, t, mat, seed, variant);
  }
  return { B, mat, rotation: variant === 'herringbone' && !swatch ? Math.PI / 4 : 0 };
}

/** 高度场（毫米）→ 切线空间法线（OpenGL 约定，+y = +v；数据第 0 行 = v 0） */
function normalMap(B, strength = 1) {
  const { R, h } = B;
  const out = new Uint8ClampedArray(R * R * 4);
  const k = strength / (8 * B.px * 1000);
  const sx = B.sx;
  const sy = B.sy;
  for (let y = 0; y < R; y++) {
    const ym = ((y - 1 + R) % R) * R;
    const y0 = y * R;
    const yp = ((y + 1) % R) * R;
    for (let x = 0; x < R; x++) {
      const xm = (x - 1 + R) % R;
      const xp = (x + 1) % R;
      const gx = h[ym + xp] + 2 * h[y0 + xp] + h[yp + xp] - (h[ym + xm] + 2 * h[y0 + xm] + h[yp + xm]);
      const gy = h[yp + xm] + 2 * h[yp + x] + h[yp + xp] - (h[ym + xm] + 2 * h[ym + x] + h[ym + xp]);
      let nx = -gx * k;
      let ny = -gy * k;
      if (sx) {
        nx -= sx[y0 + x] * strength;
        ny -= sy[y0 + x] * strength;
      }
      const l = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const o = (y0 + x) * 4;
      out[o] = (nx * l * 0.5 + 0.5) * 255;
      out[o + 1] = (ny * l * 0.5 + 0.5) * 255;
      out[o + 2] = (l * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * 生成一整套 PBR 贴图（纯数据，不碰 DOM）。
 * @returns {{ R:number, size:number, rotation:number, albedo:Uint8ClampedArray, normal:Uint8ClampedArray, orm:Uint8ClampedArray, ms:number }}
 *   albedo = sRGB RGBA；normal = 切线空间 RGBA；orm = R 遮蔽 · G 粗糙度（绝对值）· B 255
 *   数据第 0 行对应 v = 0（DataTexture，flipY = false）
 */
export function generateMaps(matId, variant = 'base', R = 512, swatch = false) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { B, rotation } = fill(matId, variant, R, swatch);
  const n = R * R;
  const albedo = new Uint8ClampedArray(n * 4);
  const orm = new Uint8ClampedArray(n * 4);
  const c = B.c;
  const ao = B.ao;
  const ro = B.r;
  for (let i = 0, j = 0, o = 0; i < n; i++, j += 3, o += 4) {
    albedo[o] = c[j] * 255;
    albedo[o + 1] = c[j + 1] * 255;
    albedo[o + 2] = c[j + 2] * 255;
    albedo[o + 3] = 255;
    orm[o] = ao[i] * 255;
    orm[o + 1] = ro[i] < 0.03 ? 7.65 : ro[i] * 255;
    orm[o + 2] = 255;
    orm[o + 3] = 255;
  }
  const normal = normalMap(B);
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { R, size: B.S, rotation, albedo, normal, orm, ms: t1 - t0 };
}

/**
 * 生成一张底色贴图（兼容旧接口）。
 * @returns {{ canvas: HTMLCanvasElement|null, size: number, rotation: number, maps: object }}
 */
export function generateTexture(matId, variant = 'base', R = 512, swatch = false) {
  const maps = generateMaps(matId, variant, R, swatch);
  let canvas = null;
  if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = R;
    canvas.height = R;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(R, R);
    // 画布第 0 行在上 = v 最大
    for (let y = 0; y < R; y++) img.data.set(maps.albedo.subarray((R - 1 - y) * R * 4, (R - y) * R * 4), y * R * 4);
    ctx.putImageData(img, 0, 0);
  }
  return { canvas, size: maps.size, rotation: maps.rotation, maps };
}

// ───────────────────────────── 色卡 ─────────────────────────────

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * 把一块材质「拍」成实物样板：左上方柔光箱打光，法线读出质感，
 * 光泽材料有柔和的高光带，金属反射环境，四边一圈细倒角 —— 像设计师桌上的实物小样。
 * 返回 Uint8ClampedArray RGBA（画布行序：第 0 行在上）。
 */
export function renderSwatch(matId, R = 128) {
  const mat = MAT_BY_ID[matId];
  if (!mat) return null;
  const { B } = fill(matId, variantFor(mat, 'swatch'), R, true);
  const out = new Uint8ClampedArray(R * R * 4);
  const isMetal = mat.metal >= 0.5;
  const cc = mat.clearcoat || 0;
  const ccRough = mat.ccRough ?? 0.08;
  const sheen = mat.sheen || 0;
  const velvetLike = sheen >= 0.8;
  const sheenC = rgb(mat.color)
    .map(toLin)
    .map((c) => c * 0.7 + 0.18);
  const h = B.h;
  const kN = 1.35 / (8 * B.px * 1000);
  // 主光：左上方的大柔光箱（漫反射用），反射里也看得见这块柔光箱
  const Lx = -0.5;
  const Ly = 0.58;
  const Lz = 0.64;
  const BX = -0.4; // 柔光箱在反射方向里的位置
  const BY = 0.5;
  const rad = 0.17 * 2; // 圆角（跟 UI 圆角差不多），归一化坐标
  const bev = 0.06;
  const envAt = (rx, ry, rough, ao) => {
    const sg = 0.15 + rough * 0.8;
    const box = Math.exp(-((rx - BX) ** 2 + (ry - BY) ** 2) / (2 * sg * sg)) * 5.5 * (0.15 / sg) ** 2;
    const sky = 0.28 + 0.4 * smooth(-0.7, 0.7, ry);
    return (box + sky) * ao;
  };
  for (let y = 0; y < R; y++) {
    const ym = ((y - 1 + R) % R) * R;
    const y0 = y * R;
    const yp = ((y + 1) % R) * R;
    const Y = ((y + 0.5) / R) * 2 - 1;
    for (let x = 0; x < R; x++) {
      const xm = (x - 1 + R) % R;
      const xp = (x + 1) % R;
      const i = y0 + x;
      const gx = h[ym + xp] + 2 * h[y0 + xp] + h[yp + xp] - (h[ym + xm] + 2 * h[y0 + xm] + h[yp + xm]);
      const gy = h[yp + xm] + 2 * h[yp + x] + h[yp + xp] - (h[ym + xm] + 2 * h[ym + x] + h[ym + xp]);
      let nx = -gx * kN - (B.sx ? B.sx[i] : 0);
      let ny = -gy * kN - (B.sy ? B.sy[i] : 0);
      let nz = 1;
      // 倒角：圆角矩形的有向距离
      const X = ((x + 0.5) / R) * 2 - 1;
      const qx = Math.abs(X) - (1 - rad);
      const qy = Math.abs(Y) - (1 - rad);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const sd = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - rad;
      const inset = -sd;
      if (inset < bev) {
        let dx;
        let dy;
        if (qx > 0 && qy > 0) {
          const l = Math.sqrt(qx * qx + qy * qy) || 1;
          dx = (qx / l) * Math.sign(X);
          dy = (qy / l) * Math.sign(Y);
        } else if (qx > qy) {
          dx = Math.sign(X);
          dy = 0;
        } else {
          dx = 0;
          dy = Math.sign(Y);
        }
        const tl = (1 - Math.max(0, inset) / bev) ** 2 * 0.85;
        nx += dx * tl;
        ny += dy * tl;
      }
      let l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= l;
      ny *= l;
      nz *= l;
      // 视线：相机在样板正前方不远处（透视 → 反射的柔光箱会在样板上留下一道斜向的光）
      let vx = -X * 0.42;
      let vy = -Y * 0.42;
      let vz = 1;
      l = 1 / Math.sqrt(vx * vx + vy * vy + vz * vz);
      vx *= l;
      vy *= l;
      vz *= l;
      const j = i * 3;
      const ar = toLin(sat(B.c[j]));
      const ag = toLin(sat(B.c[j + 1]));
      const ab = toLin(sat(B.c[j + 2]));
      const ao = B.ao[i];
      const rough = Math.min(1, Math.max(0.03, B.r[i]));
      const NL = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
      const NV = Math.max(0.001, nx * vx + ny * vy + nz * vz);
      // 柔光箱 → 样板左上亮、右下略暗（丝绒更明显：绒面「流光」）
      const fall = 1.04 + (velvetLike ? 0.2 : 0.08) * (-X + Y) * 0.5;
      const dif = isMetal ? 0 : (0.34 * (0.55 + 0.45 * ao) + 1.04 * NL) * fall;
      // 反射
      const rx = 2 * NV * nx - vx;
      const ry = 2 * NV * ny - vy;
      const env = envAt(rx, ry, rough, ao);
      const fr = (1 - NV) ** 5;
      let r;
      let g;
      let b;
      if (isMetal) {
        r = (ar + (1 - ar) * fr) * env;
        g = (ag + (1 - ag) * fr) * env;
        b = (ab + (1 - ab) * fr) * env;
      } else {
        const sp = (0.04 + 0.96 * fr) * env * (1 - rough * 0.5);
        r = ar * dif + sp;
        g = ag * dif + sp;
        b = ab * dif + sp;
      }
      // 清漆层：再一层很光的反射
      if (cc > 0) {
        const cs = cc * (0.04 + 0.96 * fr) * envAt(rx, ry, ccRough, 1);
        r += cs;
        g += cs;
        b += cs;
      }
      // 绒面光泽：越斜越亮的一层柔光
      if (sheen > 0) {
        const sk = sheen * (0.25 * (1 - NV) ** 2 + (velvetLike ? 0.05 * (0.5 + (Y - X) * 0.5) : 0.015)) * (0.4 + NL);
        r += sheenC[0] * sk;
        g += sheenC[1] * sk;
        b += sheenC[2] * sk;
      }
      // 倒角最外一圈：左上亮边、右下暗边
      if (inset < bev * 0.35 && inset > -0.02) {
        const e = (1 - Math.max(0, inset) / (bev * 0.35)) * 0.5;
        const lit = (-Math.sign(X) * (Math.abs(X) > Math.abs(Y) ? 1 : 0) + Math.sign(Y) * (Math.abs(Y) >= Math.abs(X) ? 1 : 0)) * e;
        r *= 1 + lit * 0.35;
        g *= 1 + lit * 0.35;
        b *= 1 + lit * 0.35;
      }
      // 柔和的肩部（防止过曝变白）
      r = r / (1 + r * 0.16);
      g = g / (1 + g * 0.16);
      b = b / (1 + b * 0.16);
      const o = ((R - 1 - y) * R + x) * 4;
      out[o] = toSrgb(Math.min(1, r * 1.1)) * 255;
      out[o + 1] = toSrgb(Math.min(1, g * 1.1)) * 255;
      out[o + 2] = toSrgb(Math.min(1, b * 1.1)) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

const swatchCache = new Map();

/** 色卡（小方块）dataURL，带缓存；没有 DOM 时返回 null */
export function swatchURL(matId, px = 128) {
  if (MAT_BY_ID[matId]?.board?.chip) return MAT_BY_ID[matId].board.chip; // 溪岸板材：真实板材的色卡图（没有贴图时往下画近似色的）
  if (typeof document === 'undefined') return null;
  const key = `${matId}@${px}`;
  if (swatchCache.has(key)) return swatchCache.get(key);
  const mat = MAT_BY_ID[matId];
  if (!mat) return null;
  const R = Math.max(32, Math.round(px));
  const data = renderSwatch(matId, R);
  const canvas = document.createElement('canvas');
  canvas.width = R;
  canvas.height = R;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(data, R, R), 0, 0);
  const url = canvas.toDataURL('image/jpeg', 0.9);
  swatchCache.set(key, url);
  return url;
}
