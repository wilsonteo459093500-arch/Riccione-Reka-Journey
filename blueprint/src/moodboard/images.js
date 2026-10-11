// 图片本地处理：读取 / 压缩 / 透明检测 / 水印 / 下载 —— 全部在浏览器完成。

import { getBlob, blobToDataUrl } from '../store/assets.js';

const MAX_INPUT_EDGE = 1600; // 画板素材 / 发给模型的最长边

export function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片无法解码'));
    img.src = src;
  });
}

/** 是否带透明像素（抽样检查，缩到 ≤64px 再看） */
function hasAlpha(img) {
  try {
    const s = Math.min(1, 64 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * s));
    const h = Math.max(1, Math.round(img.naturalHeight * s));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
    return false;
  } catch {
    return false;
  }
}

/** 缩放到最长边 maxEdge；JPEG 先铺白底（透明处不会变黑） */
function drawScaled(img, maxEdge, mime = 'image/jpeg', quality = 0.9) {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL(mime, quality);
}

/** 规整成画板素材：透明 PNG（如家具抠图）保留透明，其余压成 JPEG */
async function normalize(src, maxEdge) {
  const img = await loadImageEl(src);
  const mime = hasAlpha(img) ? 'image/png' : 'image/jpeg';
  const dataUrl = drawScaled(img, maxEdge, mime, 0.9);
  return { dataUrl, aspect: img.naturalWidth / img.naturalHeight || 1 };
}

/** 用户选的文件 → { dataUrl, aspect }；解码失败（如部分 HEIC）抛错 */
export async function fileToBoardImage(file, maxEdge = MAX_INPUT_EDGE) {
  const raw = await blobToDataUrl(file);
  try {
    return await normalize(raw, maxEdge);
  } catch {
    throw new Error(`「${file.name || '图片'}」无法读取，换成 JPG / PNG 再试`);
  }
}

/** 项目素材（'asset:…'）→ { dataUrl, aspect }，读不到返回 null */
export async function assetToBoardImage(src, maxEdge = 1200) {
  const blob = await getBlob(src).catch(() => null);
  if (!blob) return null;
  const raw = await blobToDataUrl(blob);
  try {
    return await normalize(raw, maxEdge);
  } catch {
    return null;
  }
}

/** 模型结果转 JPEG 存储（PNG 太大），失败原样返回 */
export async function compressForStorage(dataUrl, maxEdge = 0) {
  try {
    const img = await loadImageEl(dataUrl);
    const edge = maxEdge || Math.max(img.naturalWidth, img.naturalHeight);
    return drawScaled(img, edge, 'image/jpeg', 0.92);
  } catch {
    return dataUrl;
  }
}

/** 缩小（保留透明），失败原样返回 */
export async function shrinkDataUrl(dataUrl, maxEdge = 1400) {
  try {
    return (await normalize(dataUrl, maxEdge)).dataUrl;
  } catch {
    return dataUrl;
  }
}

export function measureAspect(dataUrl) {
  return loadImageEl(dataUrl)
    .then((img) => img.naturalWidth / img.naturalHeight || 1)
    .catch(() => 1);
}

/** dataURL → Gemini 内联图 { mimeType, base64 } */
export function dataUrlToInput(dataUrl) {
  const [head, base64] = dataUrl.split(',');
  const mimeType = head.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  return { dataUrl, mimeType, base64 };
}

/** dataURL → Blob（不走 fetch，CSP 严格时也能用） */
export function dataUrlToBlobSync(dataUrl) {
  const [head, base64] = dataUrl.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// 品牌 logo 印章（public/watermark.png：白色 + 透明底），只加载一次
let logoPromise = null;
function loadLogo() {
  if (!logoPromise) logoPromise = loadImageEl('/watermark.png').catch(() => null);
  return logoPromise;
}

/** 右下角品牌 logo 水印（直接画在 canvas 上；enabled 为空则不画） */
export async function drawWatermark(canvas, enabled) {
  if (!enabled) return;
  const logo = await loadLogo();
  if (!logo) return;
  const ctx = canvas.getContext('2d');
  // logo 宽 = 图宽 18%（下限 140px），白色印章 + 轻微暗影保证浅色底也可见
  const lw = Math.max(140, Math.round(canvas.width * 0.18));
  const lh = Math.round(lw * (logo.naturalHeight / logo.naturalWidth));
  const pad = Math.round(canvas.width * 0.025);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = Math.round(lw * 0.04);
  ctx.globalAlpha = 0.9;
  ctx.drawImage(logo, canvas.width - lw - pad, canvas.height - lh - pad, lw, lh);
  ctx.restore();
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
