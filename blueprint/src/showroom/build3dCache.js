// 展厅播放 · 3D 户型开场的关键帧（浏览器）：按 build3d.js 排好的场景一帧帧画到离屏画布上，
// 每画一帧让出一次主线程（空闲时才画，滑动不卡），画好的帧随时可用；同一份坐标 / 视角 / 贴图只画一次（内存缓存）。

import { paintScene } from '../plan3d/paint.js';
import { paletteOf } from '../plan3d/palette.js';
import { floorPlan3d, activeTextures } from '../ai/plan3d.js';
import { resolveUrl } from '../store/assets.js';
import { build3dScenes } from './build3d.js';

const cache = new Map(); // key → entry
if (import.meta.env?.DEV && typeof window !== 'undefined') window.__plan3dCache = cache; // 开发时方便查看
const listeners = new Set();

export function onPlan3dProgress(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (key) => listeners.forEach((fn) => fn(key));

const createCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const idle = () =>
  new Promise((resolve) => (window.requestIdleCallback ? window.requestIdleCallback(() => resolve(), { timeout: 400 }) : setTimeout(resolve, 30)));

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = url;
  });
}

/** 缓存键：这层楼的坐标、视角、贴图（任何一样变了就重画） */
export function plan3dKey(floor) {
  const p3 = floorPlan3d(floor);
  if (!p3?.geo) return null;
  const s = JSON.stringify([floor.id, p3.geo, p3.view, activeTextures(p3)]);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return `${floor.id}:${s.length}:${h}`;
}

/** 已画好的部分：{ frames:canvas[], total, scenes, plan:img|null, done }；没开始 = null */
export function peekPlan3d(key) {
  return key ? cache.get(key) || null : null;
}

/** 开始画（重复调用无妨） */
export function requestPlan3d(floor) {
  const key = plan3dKey(floor);
  if (!key || cache.has(key)) return key;
  const p3 = floorPlan3d(floor);
  const built = build3dScenes(p3.geo, p3.view);
  if (!built) return null;
  const entry = { frames: [], total: built.scenes.length, built, plan: null, done: false };
  cache.set(key, entry);
  (async () => {
    // 原平面图（开场先在纸上出现）和材质贴图
    entry.plan = await loadImage(resolveUrl(floor.plan));
    const tex = {};
    for (const [slot, src] of Object.entries(activeTextures(p3))) {
      const im = await loadImage(resolveUrl(src));
      if (im) tex[slot] = im;
    }
    const env = { createCanvas, textures: tex }; // 同一个 env：贴图只准备一次
    const pal = paletteOf('warm');
    // 先画最后一帧（停点要用），再从头画
    const order = [built.scenes.length - 1, ...built.scenes.map((_, i) => i).slice(0, -1)];
    for (const i of order) {
      await idle();
      const c = createCanvas(built.w, built.h);
      paintScene(c, built.scenes[i], pal, env);
      entry.frames[i] = c;
      emit(key);
    }
    entry.done = true;
    emit(key);
  })().catch((err) => {
    console.warn('[展厅播放] 3D 开场关键帧画不出来', err);
    entry.failed = true;
    emit(key);
  });
  return key;
}
