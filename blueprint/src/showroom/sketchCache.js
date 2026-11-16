// 展厅播放：效果图「线稿 → 上色」的分析结果缓存（浏览器）。
// 每张图按版面上的裁切取一次像素，交给 Web Worker 分析；好了通知播放器重画。没分析好时播放器退回普通淡入。

import { analyseSketch, SKETCH_W } from './sketch.js';
import { placeImage } from '../engine/spec.js';

const cache = new Map(); // key → { status:'pending'|'ready'|'error', an?, src? }
const listeners = new Set();
let worker = null;
let seq = 0;
const waiting = new Map(); // id → resolve

export function onSketchReady(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./sketch.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const done = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      done?.(e.data);
    };
  } catch {
    worker = false; // 不支持 Worker：在主线程算
  }
  return worker;
}

/** 这个元素在版面上的样子（裁切 + 框的大小）→ 线稿的尺寸与缓存键 */
export function sketchGeom(el) {
  const pl = placeImage(el);
  const W = Math.max(64, Math.min(SKETCH_W, Math.round(pl.w)));
  const H = Math.max(36, Math.round((W * pl.h) / pl.w));
  const { l, t, r, b } = pl.crop;
  const key = `${el.src}|${l.toFixed(4)},${t.toFixed(4)},${r.toFixed(4)},${b.toFixed(4)}|${W}x${H}`;
  return { pl, W, H, key };
}

/** 已经分析好的结果（同步）；没有 → null */
export function peekSketch(key) {
  const e = cache.get(key);
  return e?.status === 'ready' ? e : null;
}

/** 按版面裁切取一张图的像素（W×H RGBA）；毛坯图也用同一个裁切（同机位、同比例） */
export async function cropPixels(url, crop, W, H) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const { l, t, r, b } = crop;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, l * nw, t * nh, Math.max(1, (1 - l - r) * nw), Math.max(1, (1 - t - b) * nh), 0, 0, W, H);
  return g.getImageData(0, 0, W, H).data;
}

/** 交给背景线程算；不支持 Worker → null（调用方在主线程算） */
export async function runInWorker(msg, transfer) {
  const w = getWorker();
  if (!w) return null;
  const id = ++seq;
  const res = await new Promise((resolve) => {
    waiting.set(id, resolve);
    w.postMessage({ ...msg, id }, transfer);
  });
  if (res.error) throw new Error(res.error);
  return res;
}

/** 开始分析（重复调用无妨） */
export function requestSketch(el, url) {
  if (!el?.src || !url) return;
  const { pl, W, H, key } = sketchGeom(el);
  if (cache.has(key)) return;
  cache.set(key, { status: 'pending' });
  (async () => {
    const src = await cropPixels(url, pl.crop, W, H);
    const copy = src.slice().buffer;
    const res = await runInWorker({ W, H, buf: copy }, [copy]);
    const an = res ? { W, H, mag: res.mag, order: res.order, reveal: res.reveal } : analyseSketch(src, W, H);
    cache.set(key, { status: 'ready', an, src });
    listeners.forEach((fn) => fn(key));
  })().catch(() => cache.set(key, { status: 'error' }));
}
