// 溪岸板材导入 · 一张板的「重活」（worker 里跑；浏览器没有 OffscreenCanvas 时主线程也能跑）。
//   analyse：解码原图（按 ICC 转成 sRGB）→ 统计（analyse.js）→ 决定类别 / 转向 / 裁切 → 量接缝 → 出 256 / 1024 / 色卡三张 WebP
//   render ：员工改了类别、转向、翻转、裁切之后，同一张原图重新出图（不再统计）
// 原图从来不离开这台电脑；出来的 WebP 是重新画过的（没有 EXIF / GPS）。用完的 ImageBitmap 马上 close()。

import { statsOf, seamsOf, seamUV, detectBorder, weaveCrop, bakeAcross, dhash64, grey } from './analyse.js';
import { decideKind, grainDir } from '../../shared/boards/derive.js';
import { tierDims, CHIP } from '../../shared/boards/tiers.js';

export const TASK_V = 4; // 分析 / 出图的算法改了就 +1（缓存跟着失效）· 4 = 横纹只烤两边 6 % 的带子

function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function ctx2d(cv) {
  const g = cv.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' }) || cv.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  return g;
}
function toBlob(cv, type, q) {
  if (cv.convertToBlob) return cv.convertToBlob({ type, quality: q });
  return new Promise((res) => cv.toBlob((b) => res(b), type, q));
}
/** WebP（Safari 编不出 WebP → JPEG，界面会提醒用 Chrome / Edge） */
async function encode(cv, q = 0.8) {
  const b = await toBlob(cv, 'image/webp', q);
  if (b && b.type === 'image/webp') return b;
  return toBlob(cv, 'image/jpeg', 0.86);
}

/** 解码：EXIF 方向转正，嵌入的 ICC（供应商扫描常是 Adobe RGB）转成 sRGB */
async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image', colorSpaceConversion: 'default', premultiplyAlpha: 'none' });
  } catch {
    return createImageBitmap(file);
  }
}

/** 从原图（sx, sy, sw, sh）画到 w × h，读出像素 */
function pixels(bmp, sx, sy, sw, sh, w, h) {
  const cv = canvas(w, h);
  const g = ctx2d(cv);
  g.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  return { data: g.getImageData(0, 0, w, h).data, w, h };
}

/** 四条边（裁切以后），灰度 0–1：给 seamsOf 量接缝 */
function edges(bmp, [l, t, r, b]) {
  const W = bmp.width - l - r;
  const H = bmp.height - t - b;
  const strip = (sx, sy, sw, sh) => {
    const p = pixels(bmp, sx, sy, sw, sh, sw, sh);
    const g = grey(p.data, sw, sh);
    for (let i = 0; i < g.length; i++) g[i] /= 255;
    return g;
  };
  const col = (g, w, h, x) => {
    const out = new Float32Array(h);
    for (let y = 0; y < h; y++) out[y] = g[y * w + x];
    return out;
  };
  const L = strip(l, t, 2, H);
  const R = strip(l + W - 2, t, 2, H);
  const T = strip(l, t, W, 2);
  const B = strip(l, t + H - 2, W, 2);
  return {
    left0: col(L, 2, H, 0),
    left1: col(L, 2, H, 1),
    right1: col(R, 2, H, 0),
    right0: col(R, 2, H, 1),
    top0: T.subarray(0, W),
    top1: T.subarray(W, 2 * W),
    bottom1: B.subarray(0, W),
    bottom0: B.subarray(W, 2 * W),
  };
}

/**
 * 出图：裁切 → 转到顺纹竖放（rot = 0 / 90 / 180 / 270，顺时针）→ 1024 档（横纹接不上就只烤横纹方向）→ 256 档 → 色卡。
 * @returns {{ tiers: { 256: [w,h], 1024: [w,h] }, blobs: { 256: Blob, 1024: Blob, chip: Blob }, seam: { u, v }, jpeg: boolean }}
 */
async function renderTiers(bmp, { kind, rot = 0, crop = [0, 0, 0, 0] }) {
  const [l, t, r, b] = crop;
  const cw = Math.max(8, bmp.width - l - r);
  const ch = Math.max(8, bmp.height - t - b);
  const swap = rot === 90 || rot === 270;
  const fw = swap ? ch : cw; // 转过以后：横纹
  const fh = swap ? cw : ch; // 顺纹
  const sm = seamUV(seamsOf(edges(bmp, crop)), rot);
  const dims = { 1024: tierDims(fw, fh, 1024, { kind }), 256: tierDims(fw, fh, 256, { kind }) };
  // 1024 档
  const [tw, th] = dims[1024];
  const pre = swap ? [th, tw] : [tw, th]; // 转之前的大小
  let small;
  try {
    small = await createImageBitmap(bmp, l, t, cw, ch, { resizeWidth: pre[0], resizeHeight: pre[1], resizeQuality: 'high' });
  } catch {
    small = null;
  }
  const cv = canvas(tw, th);
  const g = ctx2d(cv);
  g.save();
  g.translate(tw / 2, th / 2);
  g.rotate((rot * Math.PI) / 180);
  if (small) g.drawImage(small, -pre[0] / 2, -pre[1] / 2, pre[0], pre[1]);
  else g.drawImage(bmp, l, t, cw, ch, -pre[0] / 2, -pre[1] / 2, pre[0], pre[1]);
  g.restore();
  small?.close?.();
  let seamU = sm.u;
  if (sm.u === 'fail') {
    const img = g.getImageData(0, 0, tw, th);
    img.data.set(bakeAcross(img.data, tw, th, 0.06));
    g.putImageData(img, 0, 0);
    seamU = 'baked';
  }
  const b1024 = await encode(cv, 0.8);
  // 256 档（从烤好的 1024 缩）
  const [sw, sh] = dims[256];
  const cv2 = canvas(sw, sh);
  ctx2d(cv2).drawImage(cv, 0, 0, tw, th, 0, 0, sw, sh);
  const b256 = await encode(cv2, 0.8);
  // 色卡：中间一块正方形（木纹看得到纹，纯色看得到质感）
  const side = Math.max(8, Math.round(Math.min(tw, th) * (kind === 'solid' ? 1 : 0.62)));
  const cv3 = canvas(CHIP, CHIP);
  ctx2d(cv3).drawImage(cv, Math.round((tw - side) / 2), Math.round((th - side) / 2), side, side, 0, 0, CHIP, CHIP);
  const chip = await encode(cv3, 0.82);
  return { tiers: dims, blobs: { 256: b256, 1024: b1024, chip }, seam: { u: seamU, v: sm.v }, seamRaw: sm.raw, jpeg: b1024?.type !== 'image/webp' };
}

/**
 * 分析一张（+ 先按自动的决定出图）。
 * task：{ file, hint, hintStrength, catalogKind, kind?（员工选的）, rot?, crop?（员工调的） }
 */
export async function analyseBoard(task) {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  const bmp = await decode(task.file);
  try {
    const W = bmp.width;
    const H = bmp.height;
    const k = Math.min(1, 512 / Math.max(W, H));
    const ov = pixels(bmp, 0, 0, W, H, Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k)));
    const cw = Math.min(W, H, 768);
    const fine = pixels(bmp, Math.floor((W - cw) / 2), Math.floor((H - cw) / 2), cw, cw, cw, cw);
    const stats = statsOf(ov, fine);
    const hash = dhash64(grey(ov.data, ov.w, ov.h), ov.w, ov.h);
    const t1 = now();
    const dec = decideKind({ catalogKind: task.catalogKind, hint: task.hint, hintStrength: task.hintStrength, stats });
    const kind = task.kind || dec.kind;
    const grain = kind === 'wood' ? grainDir(stats.grainDeg) : null;
    const rot = task.rot ?? (grain === 'h' ? 90 : 0);
    // 编织小样外面那一圈（R4）：只有编织才找；别的默认不裁（员工可以调）
    let border = null;
    let crop = task.crop || [0, 0, 0, 0];
    if (!task.crop && kind === 'weave' && W * H <= 12e6) {
      const full = pixels(bmp, 0, 0, W, H, W, H);
      border = detectBorder(grey(full.data, W, H), W, H);
      crop = weaveCrop(border, stats.period, W, H);
    }
    const out = await renderTiers(bmp, { kind: kind === 'ask' ? 'solid' : kind, rot, crop });
    return { v: TASK_V, px: [W, H], stats, hash, decided: dec, kind, grain, rot, crop, border, ...out, ms: [Math.round(t1 - t0), Math.round(now() - t1)] };
  } finally {
    bmp.close?.();
  }
}

/** 员工改了类别 / 转向 / 裁切：同一张原图重新出图 */
export async function renderBoard(task) {
  const bmp = await decode(task.file);
  try {
    const out = await renderTiers(bmp, { kind: task.kind === 'ask' ? 'solid' : task.kind, rot: task.rot || 0, crop: task.crop || [0, 0, 0, 0] });
    return { v: TASK_V, px: [bmp.width, bmp.height], kind: task.kind, rot: task.rot || 0, crop: task.crop || [0, 0, 0, 0], ...out };
  } finally {
    bmp.close?.();
  }
}

export async function runTask(task) {
  if (task.op === 'analyse') return analyseBoard(task);
  if (task.op === 'render') return renderBoard(task);
  throw new Error('unknown op ' + task.op);
}
