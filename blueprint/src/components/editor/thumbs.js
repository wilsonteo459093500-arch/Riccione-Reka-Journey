// 缩略图用的小图缓存：'asset:<id>' → 最长边 480 的小图 object URL。
// 列表里 60+ 张缩略图如果都直接用 2560–3840px 原图，解码和内存都吃不消；这里按需生成一次、整个会话复用。
// 静态模板图（/template/…）本来就不大，原样返回。

import { useSyncExternalStore } from 'react';
import { getBlob, isAssetSrc, resolveUrl } from '../../store/assets.js';

const MAX_EDGE = 480;
const CONCURRENCY = 2;

const ready = new Map(); // src → 小图 URL
const failed = new Set(); // 生成失败 → 退回原图
const queue = [];
const queued = new Set();
let active = 0;

const listeners = new Set();
let pending = false;
function emit() {
  if (pending) return;
  pending = true;
  // 合并通知：一批小图生成完再刷新一次
  setTimeout(() => {
    pending = false;
    listeners.forEach((fn) => fn());
  }, 60);
}
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), type, quality));
}

async function makeThumb(src) {
  const blob = await getBlob(src);
  if (!blob) throw new Error('missing');
  const bmp = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale >= 1) return URL.createObjectURL(blob);
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const png = (blob.type || '').includes('png');
    if (!png) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    const out = await toBlob(canvas, png ? 'image/png' : 'image/jpeg', 0.82);
    return URL.createObjectURL(out);
  } finally {
    bmp.close?.();
  }
}

function pump() {
  while (active < CONCURRENCY && queue.length) {
    // 后进先出：最近请求的（= 刚滚进视口的）先生成
    const src = queue.pop();
    active += 1;
    makeThumb(src)
      .then((url) => ready.set(src, url))
      .catch(() => failed.add(src))
      .finally(() => {
        queued.delete(src);
        active -= 1;
        emit();
        pump();
      });
  }
}

/** 排队生成（在 effect 里调用） */
export function requestThumbs(srcs) {
  let added = false;
  for (const src of srcs || []) {
    if (!isAssetSrc(src) || ready.has(src) || failed.has(src) || queued.has(src)) continue;
    queued.add(src);
    queue.push(src);
    added = true;
  }
  if (added) pump();
}

/** 小图 URL（同步，纯读取）：还没生成好返回 null（显示占位色），失败退回原图 */
export function thumbUrl(src) {
  if (!src) return null;
  if (!isAssetSrc(src)) return src;
  return ready.get(src) || (failed.has(src) ? resolveUrl(src) : null);
}

/** 这批图里哪些已经可用（字符串签名，变化时组件才重渲染） */
export function useThumbsSig(srcs) {
  return useSyncExternalStore(subscribe, () =>
    (srcs || []).map((s) => (!isAssetSrc(s) || ready.has(s) || failed.has(s) ? '1' : '0')).join('')
  );
}
