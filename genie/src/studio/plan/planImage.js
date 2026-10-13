// 平面图文件（图片 / PDF）→ 给读图流程（ImportFlow）用的页面、小图、裁图。
//
// PDF：pdf.js 打开以后一直开着（读图的那一页窗口关掉才 destroy）；每页的小图懒加载（220 px），
//   文字层找「像平面图」的页（免费，不用 AI）；选中的页按 2048 px 画给第一遍；每一层再按高分辨率重画那一块（不是把 2048 的图放大）。
// 图片：解码一次、留着原图的像素（> 24 MP 先缩一次）；截图先去掉手机 / 浏览器的外框；裁图从原图像素裁，不是从 2000 px 的预览裁。
// 同一页的裁图全部用同一个像素比例（最大的那块长边 3072），这样两层的尺寸字一起投票定比例。
// iOS 的画布上限：每边 ≤ 4096、≤ 16.7 Mpx。
//
// 新版 pdf.js 要用到 Promise.withResolvers 等新函数（Safari / iPadOS 17.4 才有）：
// 旧设备自动改用 pdf.js 的「legacy」版本；新版跑到一半缺函数也会退回 legacy 再试一次。读不了 → 一句能照着做的话（已经翻译好）。

import { t } from '../../shared/i18n.js';
import { trimChrome, enhance, pageTextScore, rectifyEstimate, warpImage } from './sheet.js';

const MAX = 2000; // planFileToImage（旧接口）的最长边
export const PREVIEW_LONG = 2048;
export const CROP_LONG = 3072;
export const THUMB_LONG = 220;
const MAX_SIDE = 4096;
const MAX_PX = 16.7e6;
const MAX_SRC_PX = 24e6;
const RECT_EST_LONG = 1600; // 估透视用的小图
const RECT_MAX_PX = 12e6; // 拉正的那张最多这么大（iPad 内存）

function canvasToDataURL(c, q = 0.9) {
  return c.toDataURL('image/jpeg', q);
}

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function whiteCtx(c) {
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

/** 图片文件 → 可以画的东西（ImageBitmap，HEIC 之类的退回 <img>） */
async function decodeImage(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    if (typeof Image === 'undefined') throw new Error(t('这张图片读不出来：请换成 JPG / PNG 再试'));
    const url = URL.createObjectURL(file);
    try {
      const im = new Image();
      im.decoding = 'async';
      await new Promise((ok, no) => {
        im.onload = ok;
        im.onerror = no;
        im.src = url;
      });
      await im.decode?.().catch(() => {});
      return im;
    } catch {
      throw new Error(t('这张图片读不出来：请换成 JPG / PNG 再试'));
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  }
}
const sizeOf = (img) => ({ w: img.width || img.naturalWidth, h: img.height || img.naturalHeight });

async function imageToDataURL(file) {
  const bmp = await decodeImage(file);
  const { w, h } = sizeOf(bmp);
  const k = Math.min(1, MAX / Math.max(w, h));
  const c = newCanvas(w * k, h * k);
  whiteCtx(c).drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return { src: canvasToDataURL(c), width: c.width, height: c.height };
}

/** 这台浏览器能不能跑新版 pdf.js（iPadOS / Safari 17.4 以前没有 Promise.withResolvers） */
const modernOK = () => typeof Promise.withResolvers === 'function' && typeof structuredClone === 'function' && typeof Array.prototype.findLast === 'function';

const cache = { modern: null, legacy: null };

async function loadPdfjs(legacy) {
  const k = legacy ? 'legacy' : 'modern';
  if (!cache[k]) {
    const [lib, worker] = legacy
      ? await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')])
      : await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    cache[k] = lib;
  }
  return cache[k];
}

/** 缺函数一类的错（旧浏览器跑新代码）：换 legacy 版本有救 */
const missingFeature = (e) => e instanceof TypeError || /is not a function|is not defined|withResolvers|Unexpected token|SyntaxError/i.test(String(e?.message || e));

function pdfUnsupported() {
  // TypeError：界面（PlanEditor / ImportFlow）认得这一类，直接显示这句
  const err = new TypeError(t('这台设备读不了 PDF：请更新 iPadOS，或把平面图截图成 JPG / PNG 再上传'));
  err.code = 'pdf-unsupported';
  return err;
}

/** 新版 pdf.js 跑 fn，缺函数就退回 legacy 再跑一次 */
async function withPdfjs(fn) {
  if (modernOK()) {
    try {
      return await fn(await loadPdfjs(false), false);
    } catch (e) {
      if (!missingFeature(e)) throw e;
    }
  }
  try {
    return await fn(await loadPdfjs(true), true);
  } catch (e) {
    if (missingFeature(e)) throw pdfUnsupported();
    throw e;
  }
}

async function renderPdfPage(lib, file, page) {
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), verbosity: 0 }).promise;
  try {
    const pg = await doc.getPage(Math.min(page, doc.numPages));
    const base = pg.getViewport({ scale: 1 });
    const scale = Math.min(MAX / base.width, MAX / base.height, 6);
    const vp = pg.getViewport({ scale });
    const c = newCanvas(vp.width, vp.height);
    await pg.render({ canvasContext: whiteCtx(c), viewport: vp }).promise;
    return { src: canvasToDataURL(c), width: c.width, height: c.height, pages: doc.numPages };
  } finally {
    doc.destroy();
  }
}

const isPdfFile = (file) => /pdf/i.test(file?.type || '') || /\.pdf$/i.test(file?.name || '');

/** 旧接口：文件 → 一张 JPEG（PDF 只画第 1 页）。ImportFlow 不用它；没有 ImportFlow 时编辑器拿它当底图 */
export async function planFileToImage(file) {
  if (isPdfFile(file)) return withPdfjs((lib) => renderPdfPage(lib, file, 1));
  if (file.type && !/^image\//.test(file.type)) throw new Error(t('只支持图片（JPG / PNG）或 PDF'));
  return imageToDataURL(file);
}

// ───────────── 读图流程用的「打开的文件」 ─────────────

/**
 * 打开平面图文件 → src（关窗口时 closePlanFile）。
 * PDF：{ kind: 'pdf', name, pages, doc, thumbs }；图片：{ kind: 'image', name, pages: 1, img, width, height, trim, screenshot }
 */
export async function openPlanFile(file) {
  if (isPdfFile(file)) {
    const data = new Uint8Array(await file.arrayBuffer());
    return withPdfjs(async (lib, legacy) => {
      const doc = await lib.getDocument({ data: data.slice(), verbosity: 0 }).promise;
      // 先画一页小图试试：新版跑不动会在这里出错 → 退回 legacy
      try {
        await (await doc.getPage(1)).getViewport({ scale: 1 });
      } catch (e) {
        doc.destroy();
        throw e;
      }
      return { kind: 'pdf', name: file.name || '', pages: doc.numPages, doc, legacy, thumbs: new Map(), queue: Promise.resolve(), closed: false };
    });
  }
  if (file.type && !/^image\//.test(file.type)) throw new Error(t('只支持图片（JPG / PNG）或 PDF'));
  let img = await decodeImage(file);
  let { w, h } = sizeOf(img);
  if (!w || !h) throw new Error(t('这张图片读不出来：请换成 JPG / PNG 再试'));
  if (w * h > MAX_SRC_PX) {
    // 太大的照片（iPad 内存）：缩一次，留在画布里（≤ 16.7 Mpx，iOS 画得出来）
    const k = Math.sqrt(Math.min(MAX_SRC_PX, MAX_PX * 0.98) / (w * h));
    const c = newCanvas(w * k, h * k);
    whiteCtx(c).drawImage(img, 0, 0, c.width, c.height);
    img.close?.();
    img = c;
    ({ w, h } = { w: c.width, h: c.height });
  }
  // 截图的外框：在 ≤ 1200 px 的小图上找，再换回原图像素
  let trim = null;
  try {
    const k = Math.min(1, 1200 / Math.max(w, h));
    const c = newCanvas(w * k, h * k);
    const ctx = whiteCtx(c);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const r = trimChrome(ctx.getImageData(0, 0, c.width, c.height));
    if (r) trim = { x: Math.max(0, Math.floor(r.x / k)), y: Math.max(0, Math.floor(r.y / k)), w: Math.min(w, Math.ceil(r.w / k)), h: Math.min(h, Math.ceil(r.h / k)) };
  } catch {
    trim = null;
  }
  // 拍歪的照片：找横竖线 → 透视矫正（整张拉正一次，之后的预览、裁图都从拉正的图来，墙就横平竖直了）
  let rectified = null;
  if (!trim) {
    try {
      const out = rectifyImage(img, w, h);
      if (out) {
        img.close?.();
        img = out.canvas;
        ({ w, h } = { w: out.canvas.width, h: out.canvas.height });
        rectified = out.info;
      }
    } catch {
      rectified = null; // 拉不正就用原图
    }
  }
  return { kind: 'image', name: file.name || '', pages: 1, img, width: w, height: h, trim, screenshot: !!trim, photo: !!rectified, rectified, thumbs: new Map(), queue: Promise.resolve(), closed: false };
}

/** 照片的透视：在 ≤ 1600 px 的小图上估，明显才拉正（≤ 12 Mpx）。→ { canvas, info } 或 null */
function rectifyImage(img, w, h) {
  const k = Math.min(1, RECT_EST_LONG / Math.max(w, h));
  const sc = newCanvas(w * k, h * k);
  const sctx = whiteCtx(sc);
  sctx.drawImage(img, 0, 0, sc.width, sc.height);
  const est = rectifyEstimate(sctx.getImageData(0, 0, sc.width, sc.height));
  sc.width = sc.height = 0;
  if (!est || !est.significant || est.moved > 0.25 * Math.max(w * k, h * k)) return null;
  // 工作比例 g（相对原图）：拉正以后不超过 12 Mpx
  const g = Math.min(1, Math.sqrt(RECT_MAX_PX / ((est.width / k) * (est.height / k))), Math.sqrt(MAX_PX / (w * h)));
  const src = newCanvas(w * g, h * g);
  const ctx = whiteCtx(src);
  ctx.drawImage(img, 0, 0, src.width, src.height);
  const id = ctx.getImageData(0, 0, src.width, src.height);
  src.width = src.height = 0;
  // 小图的 H（小图像素 → 小图拉正像素）换成工作比例：Hg = D(g/k) · H · D(k/g)
  const r = g / k;
  const Hi = est.Hinv; // 拉正 → 原图（小图）
  const Hinv = [Hi[0], Hi[1], Hi[2] * r, Hi[3], Hi[4], Hi[5] * r, Hi[6] / r, Hi[7] / r, Hi[8]];
  const ow = Math.round(est.width * r);
  const oh = Math.round(est.height * r);
  const warped = warpImage(id, Hinv, ow, oh);
  const out = newCanvas(ow, oh);
  out.getContext('2d').putImageData(new ImageData(warped.data, ow, oh), 0, 0);
  return { canvas: out, info: { tiltV: est.tiltV, tiltH: est.tiltH, moved: Math.round(est.moved / k), scale: g } };
}

/**
 * 裁好的图（dataURL）→ ImageData，y 方向拉 aspect 倍（照片斜着拍被压扁的那一点）→ 给 walls.js / inkCheck 用。
 * crop = { src, width, height }。浏览器才有。
 */
export async function cropPixels(crop, { aspect = 1 } = {}) {
  const im = new Image();
  im.decoding = 'async';
  await new Promise((ok, no) => {
    im.onload = ok;
    im.onerror = () => no(new Error(t('底图读不出来，请重新上传平面图。')));
    im.src = crop.src;
  });
  const W = crop.width || im.naturalWidth;
  const H = Math.round((crop.height || im.naturalHeight) * (aspect > 0.5 && aspect < 2 ? aspect : 1));
  const c = newCanvas(W, H);
  const ctx = whiteCtx(c);
  ctx.drawImage(im, 0, 0, W, H);
  const id = ctx.getImageData(0, 0, W, H);
  c.width = c.height = 0;
  return id;
}

/** 一个一个来（iPad 上同时画很多页会卡、会爆内存） */
function enqueue(src, fn) {
  const p = src.queue.then(() => (src.closed ? null : fn()));
  src.queue = p.catch(() => {});
  return p;
}

/** 第 pageNo 页的小图（长边 220 px）→ object URL（缓存；closePlanFile 时释放） */
export function pageThumb(src, pageNo, long = THUMB_LONG) {
  const key = `${pageNo}@${long}`;
  if (src.thumbs.has(key)) return src.thumbs.get(key);
  const p = enqueue(src, async () => {
    let c;
    if (src.kind === 'pdf') {
      const pg = await src.doc.getPage(pageNo);
      const base = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: long / Math.max(base.width, base.height) });
      c = newCanvas(vp.width, vp.height);
      await pg.render({ canvasContext: whiteCtx(c), viewport: vp }).promise;
      pg.cleanup?.();
    } else {
      const k = long / Math.max(src.width, src.height);
      c = newCanvas(src.width * k, src.height * k);
      whiteCtx(c).drawImage(src.img, 0, 0, c.width, c.height);
    }
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
    return blob ? URL.createObjectURL(blob) : canvasToDataURL(c, 0.82);
  });
  src.thumbs.set(key, p);
  return p;
}

/**
 * 不用 AI 找平面图的页：pdf.js 的文字层，每页打分（FLOOR PLAN / PELAN LANTAI…）。
 * → { hasText, pages: [{ page, score }] }（score ≥ 5 = 像是平面图）。扫描的 PDF 没有文字 → hasText false。
 */
export async function findPlanPagesText(src) {
  if (src.kind !== 'pdf') return { hasText: false, pages: [{ page: 1, score: 0 }] };
  const pages = [];
  let chars = 0;
  for (let i = 1; i <= src.pages; i++) {
    if (src.closed) break;
    try {
      const pg = await src.doc.getPage(i);
      const tc = await pg.getTextContent();
      const text = tc.items.map((it) => it.str || '').join(' ');
      chars += text.replace(/\s+/g, '').length;
      pages.push({ page: i, score: pageTextScore(text) });
    } catch {
      pages.push({ page: i, score: 0 });
    }
  }
  return { hasText: chars > src.pages * 4, pages };
}

/**
 * 一页画给第一遍（长边 2048）。→ { src, width, height, page, map }；
 * map 把预览像素换回来源：PDF → PDF 单位 = px / map.scale；图片 → 原图像素 = px / map.scale + (map.ox, map.oy)（截图去掉了外框）。
 */
export async function renderPage(src, pageNo = 1, { long = PREVIEW_LONG } = {}) {
  return enqueue(src, async () => {
    if (src.kind === 'pdf') {
      const pg = await src.doc.getPage(pageNo);
      const base = pg.getViewport({ scale: 1 });
      const scale = Math.min(long / Math.max(base.width, base.height), 8);
      const vp = pg.getViewport({ scale });
      const c = newCanvas(vp.width, vp.height);
      await pg.render({ canvasContext: whiteCtx(c), viewport: vp }).promise;
      return { src: canvasToDataURL(c, 0.92), width: c.width, height: c.height, page: pageNo, map: { scale: c.width / base.width, ox: 0, oy: 0, unitW: base.width, unitH: base.height } };
    }
    const r = src.trim || { x: 0, y: 0, w: src.width, h: src.height };
    const k = Math.min(1, long / Math.max(r.w, r.h));
    const c = newCanvas(r.w * k, r.h * k);
    whiteCtx(c).drawImage(src.img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    return { src: canvasToDataURL(c, 0.92), width: c.width, height: c.height, page: 1, map: { scale: c.width / r.w, ox: r.x, oy: r.y, unitW: src.width, unitH: src.height } };
  });
}

/**
 * 把预览上的几个框（预览像素）按高分辨率裁出来，全部用同一个比例：
 *   PDF：按框重画那一块（viewport offset），比例 s = min(3072 / 最大框的长边, 8)，再受 iOS 画布上限约束；
 *   图片：从原图像素裁（小于 1400 px 的 ×2），截图 / 照片顺便 enhance。
 * → [{ src, width, height, rect, srcScale, srcPxW, pxPerUnit }]
 *   srcScale = 裁图像素 / 原图像素（图片；PDF 是 1）；pxPerUnit = 裁图像素 / PDF 单位（PDF）。
 */
export async function renderRegion(src, pageNo, rects, page, { long = CROP_LONG, clean = null } = {}) {
  const map = page.map;
  if (src.kind === 'pdf') {
    const units = rects.map((r) => ({ x0: r.x0 / map.scale, y0: r.y0 / map.scale, x1: r.x1 / map.scale, y1: r.y1 / map.scale }));
    const maxW = Math.max(...units.map((u) => u.x1 - u.x0));
    const maxH = Math.max(...units.map((u) => u.y1 - u.y0));
    const maxA = Math.max(...units.map((u) => (u.x1 - u.x0) * (u.y1 - u.y0)));
    const s = Math.min(long / Math.max(maxW, maxH), 8, MAX_SIDE / maxW, MAX_SIDE / maxH, Math.sqrt(MAX_PX / maxA));
    return enqueue(src, async () => {
      const pg = await src.doc.getPage(pageNo);
      const out = [];
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        const c = newCanvas((u.x1 - u.x0) * s, (u.y1 - u.y0) * s);
        const vp = pg.getViewport({ scale: s, offsetX: -u.x0 * s, offsetY: -u.y0 * s });
        await pg.render({ canvasContext: whiteCtx(c), viewport: vp }).promise;
        out.push({ src: canvasToDataURL(c, 0.92), width: c.width, height: c.height, rect: rects[i], srcScale: 1, srcPxW: c.width, pxPerUnit: s });
        c.width = c.height = 0;
      }
      pg.cleanup?.();
      return out;
    });
  }
  const orig = rects.map((r) => ({ x0: r.x0 / map.scale + map.ox, y0: r.y0 / map.scale + map.oy, x1: r.x1 / map.scale + map.ox, y1: r.y1 / map.scale + map.oy }));
  const maxW = Math.max(...orig.map((u) => u.x1 - u.x0));
  const maxH = Math.max(...orig.map((u) => u.y1 - u.y0));
  const maxA = Math.max(...orig.map((u) => (u.x1 - u.x0) * (u.y1 - u.y0)));
  let f = Math.max(maxW, maxH) < 1400 ? 2 : 1;
  f = Math.min(f, long / Math.max(maxW, maxH), MAX_SIDE / maxW, MAX_SIDE / maxH, Math.sqrt(MAX_PX / maxA));
  const doEnhance = clean ?? (!!src.screenshot || !!src.photo);
  return enqueue(src, async () => {
    const out = [];
    for (let i = 0; i < orig.length; i++) {
      const u = orig[i];
      const c = newCanvas((u.x1 - u.x0) * f, (u.y1 - u.y0) * f);
      const ctx = whiteCtx(c);
      ctx.drawImage(src.img, u.x0, u.y0, u.x1 - u.x0, u.y1 - u.y0, 0, 0, c.width, c.height);
      if (doEnhance) {
        try {
          const id = ctx.getImageData(0, 0, c.width, c.height);
          const e = enhance(id);
          id.data.set(e.data);
          ctx.putImageData(id, 0, 0);
        } catch {
          /* 画布被污染之类：不 enhance 也行 */
        }
      }
      out.push({ src: canvasToDataURL(c, 0.92), width: c.width, height: c.height, rect: rects[i], srcScale: f, srcPxW: u.x1 - u.x0, pxPerUnit: f });
      c.width = c.height = 0;
    }
    return out;
  });
}

/**
 * 扫描的 PDF：所有页的小图拼成一张编号的网格（≤ 2048 px）给 AI 看哪几页是平面图。→ { src, width, height, cols, rows }
 */
export async function contactSheet(src, { long = PREVIEW_LONG } = {}) {
  const n = src.pages;
  return enqueue(src, async () => {
    const first = await src.doc.getPage(1);
    const b = first.getViewport({ scale: 1 });
    const aspect = b.width / b.height;
    let best = null;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cw = Math.floor(long / cols);
      const chh = Math.floor(cw / aspect);
      if (rows * chh > long) continue;
      if (!best || cw > best.cw) best = { cols, rows, cw, ch: chh };
    }
    if (!best) {
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const ch = Math.floor(long / rows);
      best = { cols, rows, cw: Math.floor(ch * aspect), ch };
    }
    const c = newCanvas(best.cols * best.cw, best.rows * best.ch);
    const ctx = whiteCtx(c);
    for (let i = 1; i <= n; i++) {
      if (src.closed) return null;
      const pg = await src.doc.getPage(i);
      const base = pg.getViewport({ scale: 1 });
      const k = Math.min((best.cw - 8) / base.width, (best.ch - 8) / base.height);
      const vp = pg.getViewport({ scale: k });
      const cell = newCanvas(vp.width, vp.height);
      await pg.render({ canvasContext: whiteCtx(cell), viewport: vp }).promise;
      const x = ((i - 1) % best.cols) * best.cw;
      const y = Math.floor((i - 1) / best.cols) * best.ch;
      ctx.drawImage(cell, x + 4, y + 4);
      ctx.strokeStyle = 'black'; // 给 AI 看的网格，不是界面
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, best.cw - 4, best.ch - 4);
      // 页码：左上角黑底白字，大一点（AI 要读得到）
      const fs = Math.max(18, Math.round(best.cw / 7));
      ctx.font = `bold ${fs}px sans-serif`;
      const label = String(i);
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'black';
      ctx.fillRect(x + 4, y + 4, tw + fs * 0.6, fs * 1.3);
      ctx.fillStyle = 'white';
      ctx.textBaseline = 'top';
      ctx.fillText(label, x + 4 + fs * 0.3, y + 4 + fs * 0.15);
      cell.width = cell.height = 0;
      pg.cleanup?.();
    }
    return { src: canvasToDataURL(c, 0.85), width: c.width, height: c.height, cols: best.cols, rows: best.rows };
  });
}

/** 关掉：释放 pdf.js 文档、图片、小图 */
export function closePlanFile(src) {
  if (!src || src.closed) return;
  src.closed = true;
  for (const p of src.thumbs?.values() || []) Promise.resolve(p).then((u) => typeof u === 'string' && u.startsWith('blob:') && URL.revokeObjectURL(u)).catch(() => {});
  src.thumbs?.clear();
  try {
    src.doc?.destroy();
  } catch {
    /* 已经关了 */
  }
  try {
    src.img?.close?.();
  } catch {
    /* 不是 ImageBitmap */
  }
}
