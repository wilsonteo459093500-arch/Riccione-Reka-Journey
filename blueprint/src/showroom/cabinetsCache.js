// 展厅播放：「毛坯 → 柜子一件件出现」的分析结果缓存（浏览器）。
// 效果图（和毛坯图）按版面上同一个裁切取像素，交给背景线程比对 / 按框分组；好了通知播放器重画。
// 没分析好、或毛坯图对不上（refused）时，播放器退回普通的「从无到有」。

import { compareShell, boxLabels, analyseCabinets } from './cabinets.js';
import { sketchGeom, cropPixels, runInWorker } from './sketchCache.js';

const cache = new Map(); // key → { status:'pending'|'ready'|'refused'|'error', an?, src?, shell?, why? }
const listeners = new Set();

export function onCabinetsReady(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 缓存键：效果图的样子（裁切、尺寸）+ 毛坯图 / 框 */
export function cabinetsKey(el, play) {
  const { key } = sketchGeom(el);
  const what = play.mode === 'shell' ? `shell:${play.shell}` : `boxes:${play.boxes.map((b) => b.q.map((v) => v.toFixed(4)).join(',')).join(';')}`;
  return `${key}|${what}`;
}

/** 已经分析好的结果（同步）；没有 → null */
export function peekCabinets(key) {
  const e = cache.get(key);
  return e?.status === 'ready' ? e : null;
}

/** 毛坯图对不上时的原因（编辑器可以显示） */
export const cabinetsStatus = (key) => cache.get(key) || null;

/**
 * 开始分析（重复调用无妨）
 * @param {object} el     效果图元素（版面上的框、裁切）
 * @param {object} play   playableCabinets(slide) 的结果（mode 'shell' | 'boxes'）
 * @param {(src:string)=>string|null} resolve  素材 → URL
 */
export function requestCabinets(el, play, resolve) {
  if (!el?.src || !play?.mode) return;
  const url = resolve(el.src);
  const shellUrl = play.mode === 'shell' ? resolve(play.shell) : null;
  if (!url || (play.mode === 'shell' && !shellUrl)) return;
  const key = cabinetsKey(el, play);
  if (cache.has(key)) return;
  cache.set(key, { status: 'pending' });
  const { pl, W, H } = sketchGeom(el);
  (async () => {
    const src = await cropPixels(url, pl.crop, W, H);
    const shell = shellUrl ? await cropPixels(shellUrl, pl.crop, W, H) : null;
    const msg = { task: 'cabinets', W, H, buf: src.slice().buffer, crop: pl.crop, boxes: play.boxes || null, shellBuf: shell ? shell.slice().buffer : null };
    const res = await runInWorker(msg, [msg.buf, ...(msg.shellBuf ? [msg.shellBuf] : [])]);
    let an;
    if (res) {
      if (res.refused) {
        cache.set(key, { status: 'refused', why: res.refused });
        return;
      }
      an = { W, H, ...res.an };
    } else {
      const lab = shell ? compareShell(src, shell, W, H) : { ok: true, ...boxLabels(play.boxes, W, H, pl.crop) };
      if (!lab.ok) {
        cache.set(key, { status: 'refused', why: lab.why });
        return;
      }
      an = analyseCabinets(src, W, H, lab.labels, lab.pieces);
    }
    cache.set(key, { status: 'ready', an, src, shell });
    listeners.forEach((fn) => fn(key));
  })().catch(() => cache.set(key, { status: 'error' }));
}
