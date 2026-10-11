// 素材层 —— 'asset:<id>' 引用 ↔ IndexedDB Blob ↔ 预览用 object URL / 原始尺寸 / 导出用字节。
// 渲染（renderDeck / SlideCanvas）是同步的，所以先 preloadProjectAssets() 把素材装进内存缓存，
// 之后 resolveUrl() / metaOf() 直接同步读取。

import { putAssetRecord, getAssetRecord } from './db.js';

const urlCache = new Map(); // id → objectURL
const metaCache = new Map(); // id → { w, h, mime }
const listeners = new Set();

export const ASSET_PREFIX = 'asset:';
export const isAssetSrc = (src) => typeof src === 'string' && src.startsWith(ASSET_PREFIX);
export const assetIdOf = (src) => (isAssetSrc(src) ? src.slice(ASSET_PREFIX.length) : null);
export const assetSrc = (id) => `${ASSET_PREFIX}${id}`;

const newId = () => `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

/** 素材缓存变化时通知（编辑器据此重渲染） */
export function onAssetsChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn());

function cache(id, blob, meta) {
  if (!urlCache.has(id)) urlCache.set(id, URL.createObjectURL(blob));
  metaCache.set(id, meta);
}

/** 量图片尺寸 */
export async function measureBlob(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const out = { w: bmp.width, h: bmp.height };
    bmp.close?.();
    return out;
  } catch {
    return await new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const im = new Image();
      im.onload = () => {
        resolve({ w: im.naturalWidth, h: im.naturalHeight });
        URL.revokeObjectURL(url);
      };
      im.onerror = () => {
        resolve({ w: 0, h: 0 });
        URL.revokeObjectURL(url);
      };
      im.src = url;
    });
  }
}

/**
 * 存一张图，返回 'asset:<id>'
 * @param {Blob} blob
 * @param {{ projectId:string, w?:number, h?:number }} opts
 */
export async function storeBlob(blob, { projectId, w, h } = {}) {
  const id = newId();
  const size = w && h ? { w, h } : await measureBlob(blob);
  const mime = blob.type || 'image/jpeg';
  await putAssetRecord({ id, projectId: projectId || null, blob, mime, w: size.w, h: size.h, ts: Date.now() });
  cache(id, blob, { w: size.w, h: size.h, mime });
  emit();
  return assetSrc(id);
}

/** 扫描项目 JSON 里所有 'asset:' 引用 */
export function collectAssetSrcs(obj, out = new Set()) {
  if (typeof obj === 'string') {
    if (isAssetSrc(obj)) out.add(obj);
  } else if (Array.isArray(obj)) obj.forEach((v) => collectAssetSrcs(v, out));
  else if (obj && typeof obj === 'object') Object.values(obj).forEach((v) => collectAssetSrcs(v, out));
  return out;
}

/** 打开项目前：把它引用的素材全部装进缓存 */
export async function preloadProjectAssets(project) {
  const srcs = [...collectAssetSrcs(project)];
  let missing = 0;
  await Promise.all(
    srcs.map(async (src) => {
      const id = assetIdOf(src);
      if (urlCache.has(id)) return;
      const rec = await getAssetRecord(id);
      if (rec?.blob) cache(id, rec.blob, { w: rec.w, h: rec.h, mime: rec.mime });
      else missing += 1;
    })
  );
  emit();
  return { total: srcs.length, missing };
}

/** 预览用 URL（同步）：静态模板图原样返回；项目素材返回 object URL（未加载则 null） */
export function resolveUrl(src) {
  if (!src) return null;
  if (isAssetSrc(src)) return urlCache.get(assetIdOf(src)) || null;
  return src;
}

/** 原始尺寸（同步）—— 传给 renderDeck({ meta }) */
export function metaOf(src) {
  if (!isAssetSrc(src)) return null;
  return metaCache.get(assetIdOf(src)) || null;
}

/** 取 Blob（异步，导出 / 发给 AI 用） */
export async function getBlob(src) {
  if (!src) return null;
  if (isAssetSrc(src)) {
    const rec = await getAssetRecord(assetIdOf(src));
    return rec?.blob || null;
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.blob();
}

/** 把任意图片 Blob 转成 JPEG（PPT 不认 webp 等格式） */
export async function toJpegBlob(blob, { maxEdge = 0, quality = 0.9 } = {}) {
  const bmp = await createImageBitmap(blob);
  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(bmp.width, bmp.height)) : 1;
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return await canvasToBlob(canvas, 'image/jpeg', quality);
}

export function canvasToBlob(canvas, mime = 'image/jpeg', quality = 0.9) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片编码失败'))), mime, quality)
  );
}

/**
 * JPEG 的 EXIF 方向（1 = 正常；手机竖拍常见 6 / 8）。读不到 / 不是 JPEG → 1。
 * 浏览器显示时会按它转正，但 PPT 里的图片不一定会 —— 方向不是 1 的要先转正再用。
 */
export function exifOrientationOf(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, buf.byteLength);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return 1;
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    const len = v.getUint16(off + 2);
    if ((marker & 0xff00) !== 0xff00 || len < 2) return 1;
    if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) {
      const tiff = off + 10;
      if (tiff + 8 > v.byteLength) return 1;
      const little = v.getUint16(tiff) === 0x4949;
      const ifd = tiff + v.getUint32(tiff + 4, little);
      if (ifd + 2 > v.byteLength) return 1;
      const n = v.getUint16(ifd, little);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > v.byteLength) return 1;
        if (v.getUint16(e, little) === 0x0112) {
          const o = v.getUint16(e + 8, little);
          return o >= 1 && o <= 8 ? o : 1;
        }
      }
      return 1;
    }
    if (marker === 0xffda) return 1; // 图像数据开始，后面没有 EXIF 了
    off += 2 + len;
  }
  return 1;
}

export async function exifOrientation(blob) {
  try {
    const type = (blob?.type || '').toLowerCase();
    if (type && !/jpe?g/.test(type)) return 1;
    return exifOrientationOf(await blob.slice(0, 128 * 1024).arrayBuffer());
  } catch {
    return 1;
  }
}

/** PPT 导出取图：返回 { data:ArrayBuffer, mime }（仅 JPEG / PNG；带 EXIF 旋转的手机照片先转正） */
export async function loadForPptx(src) {
  let blob = await getBlob(src);
  if (!blob) return null;
  let mime = (blob.type || '').toLowerCase();
  if (mime === 'image/jpg') mime = 'image/jpeg';
  if ((mime !== 'image/jpeg' && mime !== 'image/png') || (mime === 'image/jpeg' && (await exifOrientation(blob)) > 1)) {
    blob = await toJpegBlob(blob);
    mime = 'image/jpeg';
  }
  return { data: await blob.arrayBuffer(), mime };
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('读取失败'));
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

/** 发给 Gemini 的内联图：{ mimeType, base64 }，默认压到最长边 1600 */
export async function toInlineImage(srcOrBlob, maxEdge = 1600) {
  const blob = typeof srcOrBlob === 'string' ? await getBlob(srcOrBlob) : srcOrBlob;
  if (!blob) throw new Error('图片不存在');
  const jpeg = await toJpegBlob(blob, { maxEdge, quality: 0.88 });
  const dataUrl = await blobToDataUrl(jpeg);
  return { mimeType: 'image/jpeg', base64: dataUrl.split(',')[1], dataUrl };
}
