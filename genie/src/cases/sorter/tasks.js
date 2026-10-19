// 案例整理 · 照片的「重活」：解码（缩小着解）、分析、缩略图、压缩。worker 里跑；浏览器没有 OffscreenCanvas 时主线程也能跑。
// 永远不把原图整张留在内存里：createImageBitmap 直接解成长边 512 / 1600 的小图，用完 close()。

import { readMeta } from './exif.js';
import { analysePixels } from './imgmath.js';

const HEAD = 256 * 1024; // 只读开头这一段找 EXIF / 尺寸

function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function toBlob(cv, type, q) {
  if (cv.convertToBlob) return cv.convertToBlob({ type, quality: q });
  return new Promise((res) => cv.toBlob((b) => res(b), type, q));
}
/** WebP（Safari 编不出 WebP 时换 JPEG）；budget = 字节上限（按质量阶梯往下试） */
async function encode(cv, { q = [0.82, 0.76, 0.7, 0.64], budget = Infinity, jpegQ = 0.86 } = {}) {
  let blob = null;
  for (const qq of q) {
    blob = await toBlob(cv, 'image/webp', qq);
    if (!blob || blob.type !== 'image/webp') break;
    if (blob.size <= budget) return blob;
  }
  if (blob && blob.type === 'image/webp') return blob;
  for (const qq of [jpegQ, jpegQ - 0.08, jpegQ - 0.16]) {
    blob = await toBlob(cv, 'image/jpeg', qq);
    if (!blob || blob.size <= budget) break;
  }
  return blob;
}

const fit = (w, h, maxW, maxH) => {
  const k = Math.min(1, maxW / w, maxH / h);
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
};

/** 解码成长边 ≤ long 的小图（尽量让浏览器在解码时就缩小；EXIF 方向自动转正） */
async function decode(file, meta, long, quality = 'medium') {
  let opts = { imageOrientation: 'from-image' };
  if (meta?.w && meta?.h) {
    const [w, h] = fit(meta.w, meta.h, long, long);
    if (w < meta.w) opts = { ...opts, resizeWidth: w, resizeHeight: h, resizeQuality: quality };
  }
  let bmp;
  try {
    bmp = await createImageBitmap(file, opts);
  } catch (e) {
    bmp = await createImageBitmap(file); // 老浏览器不认选项
  }
  return bmp;
}

function draw(bmp, maxW, maxH) {
  const [w, h] = fit(bmp.width, bmp.height, maxW, maxH);
  const cv = canvas(w, h);
  // willReadFrequently：画布放在内存里（不放 GPU）—— 我们马上要读像素 / 编码，GPU 画布每次读回来都很慢（软件 GL 上一张要 1 秒）
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, w, h);
  return { cv, g, w, h };
}

/** 分析一张：→ { a（imgmath 的结果 + 拍摄时间等）, thumb: Blob（长边 240 的 WebP / JPEG） } */
export async function analyseFile(file, { view = null } = {}) {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  const head = await file.slice(0, HEAD).arrayBuffer();
  const meta = readMeta(head);
  const bmp = await decode(file, meta, 512);
  const t1 = now();
  try {
    const W = meta.w || bmp.width;
    const H = meta.h || bmp.height;
    const { g, w, h } = draw(bmp, 512, 512);
    const img = g.getImageData(0, 0, w, h);
    const t2 = now();
    const a = analysePixels({ data: img.data, width: w, height: h }, { w: W, h: H, type: meta.type, make: meta.make, view });
    const t3 = now();
    a.dto = meta.dto || meta.dateTime || null;
    a.type = meta.type;
    a.camera = !!meta.make;
    const t = draw(bmp, 240, 240);
    const thumb = await encode(t.cv, { q: [0.72], jpegQ: 0.78 });
    a.ms = Math.round(now() - t0);
    a.t = [Math.round(t1 - t0), Math.round(t2 - t1), Math.round(t3 - t2), Math.round(now() - t3)]; // 解码 · 取像素 · 分析 · 小图（毫秒）
    return { a, thumb };
  } finally {
    bmp.close?.();
  }
}

/** 给案例库用：1600 大图 + 480 小图（重新画一次 = EXIF / GPS / 相机资料全部去掉） */
export async function compressFile(file) {
  const head = await file.slice(0, HEAD).arrayBuffer();
  const meta = readMeta(head);
  const bmp = await decode(file, meta, 1600, 'high');
  try {
    const big = draw(bmp, 1600, 1600);
    const b1600 = await encode(big.cv, { budget: 250 * 1024 });
    const small = draw(bmp, 480, 640);
    const b480 = await encode(small.cv, { budget: 60 * 1024 });
    return { 1600: b1600, 480: b480, w: big.w, h: big.h };
  } finally {
    bmp.close?.();
  }
}

/** 大一点的预览（员工点开看清楚）/ 给 AI 的 512 小图（JPEG，没有元数据） */
export async function previewFile(file, { long = 1400, type = 'image/webp', q = 0.8 } = {}) {
  const head = await file.slice(0, HEAD).arrayBuffer();
  const meta = readMeta(head);
  const bmp = await decode(file, meta, long, 'high');
  try {
    const { cv, w, h } = draw(bmp, long, long);
    const blob = type === 'image/jpeg' ? await toBlob(cv, 'image/jpeg', q) : await encode(cv, { q: [q] });
    return { blob, w, h };
  } finally {
    bmp.close?.();
  }
}

/** 主线程备用（HEIC 在 Safari 里只有 <img> 读得了）：解码成 <img> → 画到 512 → 一样的分析 */
export async function analyseViaImg(file, { view = null } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const im = new Image();
    im.decoding = 'async';
    im.src = url;
    await im.decode();
    const W = im.naturalWidth;
    const H = im.naturalHeight;
    const [w, h] = fit(W, H, 512, 512);
    const cv = canvas(w, h);
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    const a = analysePixels({ data: img.data, width: w, height: h }, { w: W, h: H, type: 'heic', view });
    const [tw, th] = fit(W, H, 240, 240);
    const tc = canvas(tw, th);
    tc.getContext('2d', { willReadFrequently: true }).drawImage(im, 0, 0, tw, th);
    const thumb = await encode(tc, { q: [0.72], jpegQ: 0.78 });
    return { a, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 一个任务（worker 消息 / 主线程备用都走这里） */
export async function runTask(task) {
  switch (task.op) {
    case 'analyse':
      return analyseFile(task.file, task);
    case 'compress':
      return compressFile(task.file);
    case 'preview':
      return previewFile(task.file, task);
    default:
      throw new Error('unknown op ' + task.op);
  }
}
