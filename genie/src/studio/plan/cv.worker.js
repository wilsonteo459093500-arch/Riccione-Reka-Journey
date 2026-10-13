// 读图的像素活放到后台线程（Web Worker）：照片拉正（rectifyEstimate / warpImage）、墨迹 + 找墙（inkMask / extractWalls）。
// iPad 上这些一次要 1–4 秒，放在主线程界面会卡住、「正在…」的字也不动。纯计算，不碰 DOM、不连网。
// 主线程：planImage.js 的 cvRun(op, args)；这里起不来（旧 Safari 不支持 module worker 等）→ 主线程照做（同样的函数）。
//
// 消息：{ id, op, args } → { id, ok, out } | { id, ok: false, error }
//   op 'estimate' args { img }                 → rectifyEstimate(img)
//   op 'warp'     args { img, Hinv, w, h }     → { width, height, data }（data 的 buffer 转过去，不复制）
//   op 'walls'    args { img, pxPerM }          → { ink: { width, height, mask }, walls }（extractWalls 的结果）
//   op 'enhance'  args { img }                  → { width, height, data }（截图 / 照片的裁图去灰、拉对比）

import { rectifyEstimate, warpImage, inkMask, enhance } from './sheet.js';
import { extractWalls } from './walls.js';

self.onmessage = (e) => {
  const { id, op, args } = e.data || {};
  try {
    let out = null;
    const transfer = [];
    if (op === 'estimate') out = rectifyEstimate(args.img);
    else if (op === 'warp') {
      const w = warpImage(args.img, args.Hinv, args.w, args.h);
      out = { width: w.width, height: w.height, data: w.data };
      transfer.push(w.data.buffer);
    } else if (op === 'walls') {
      const ink = inkMask(args.img);
      let walls = null;
      try {
        walls = extractWalls(args.img, { pxPerM: args.pxPerM });
      } catch {
        walls = null;
      }
      out = { ink, walls };
      if (ink?.mask?.buffer) transfer.push(ink.mask.buffer);
    } else if (op === 'enhance') {
      const e = enhance(args.img);
      out = { width: e.width, height: e.height, data: e.data };
      transfer.push(e.data.buffer);
    } else if (op === 'ping') out = 'pong';
    else throw new Error(`unknown op ${op}`);
    self.postMessage({ id, ok: true, out }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
