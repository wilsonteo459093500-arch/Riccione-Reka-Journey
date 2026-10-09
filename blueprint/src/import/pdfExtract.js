// PDF → 原始页面数据（文字行 + 图片框）。不碰 DOM：图片编码 / 缩略图由调用方注入，
// 浏览器（importPdf.js）与 Node（scripts/dump_pages.mjs、测试）共用。
//
// RawPage = { n, width, height,
//             lines:  [{ text, x, y, w, h, fs }],          y = 文字框顶边（左上角原点，单位 pt）
//             images: [{ key, x, y, w, h, pxW, pxH }],      key = 图片去重键（同一张色板在多页复用时相同）
//             thumb?: Blob }

import { collapseLetterSpacing, joinPieces, normalizeText } from './labels.js';

const r1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// 文字：pdf.js 的文字片段 → 行
// ---------------------------------------------------------------------------

/**
 * 把同一基线、水平相邻的片段拼成一行（纯函数，便于测试）
 * @param {{ str:string, x:number, base:number, w:number, fs:number }[]} items  base = 基线 y（左上角原点）
 */
export function buildLines(items) {
  const list = items
    .filter((it) => it && typeof it.str === 'string' && it.str.trim() && it.fs > 0)
    .map((it) => ({ ...it, w: Math.max(0, it.w || 0) }))
    .sort((a, b) => a.base - b.base || a.x - b.x);

  // 1) 按基线分行（以每行第一个片段为准，避免链式漂移）
  const rows = [];
  for (const it of list) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row.base - it.base) < 0.35 * Math.max(row.fs, it.fs)) row.items.push(it);
    else rows.push({ base: it.base, fs: it.fs, items: [it] });
  }

  // 2) 行内按 x 排序，间距过大（> 1.2 字号）断开成不同的行（多栏 / 不同标注）
  const lines = [];
  for (const row of rows) {
    const sorted = row.items.sort((a, b) => a.x - b.x);
    let cur = null;
    for (const it of sorted) {
      const piece = collapseLetterSpacing(it.str);
      if (!piece) continue;
      if (cur) {
        const right = cur.x + cur.w;
        const gap = it.x - right;
        const fs = Math.max(cur.fs, it.fs);
        // 重复绘制（伪粗体）：同样的字叠在同一位置
        if (it.str === cur.lastStr && Math.abs(it.x - cur.lastX) < 1) continue;
        if (gap <= 1.2 * fs) {
          cur.text = joinPieces(cur.text, piece, gap, fs);
          cur.w = Math.max(right, it.x + it.w) - cur.x;
          cur.fs = fs;
          cur.base = Math.max(cur.base, it.base);
          cur.lastStr = it.str;
          cur.lastX = it.x;
          continue;
        }
        lines.push(cur);
      }
      cur = { text: piece, x: it.x, w: it.w, fs: it.fs, base: it.base, lastStr: it.str, lastX: it.x };
    }
    if (cur) lines.push(cur);
  }

  return lines
    .map((l) => {
      const text = normalizeText(l.text);
      return { text, x: r1(l.x), y: r1(l.base - 0.8 * l.fs), w: r1(l.w), h: r1(l.fs), fs: r1(l.fs) };
    })
    .filter((l) => l.text)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

// ---------------------------------------------------------------------------
// 图片：跟踪变换矩阵，记录每次绘图的页面框
// ---------------------------------------------------------------------------

function refKey(ref) {
  if (!ref) return null;
  if (typeof ref === 'string') return `r${ref.replace(/R$/, '').replace(/R/, 'g')}`;
  if (typeof ref === 'object' && ref.num != null) return `r${ref.num}${ref.gen ? `g${ref.gen}` : ''}`;
  return null;
}

/** 没有 ref 时的指纹：尺寸 + 抽样像素 */
function fingerprint(obj) {
  const { width = 0, height = 0, data } = obj || {};
  let h = 2166136261;
  const mix = (v) => {
    h ^= v & 0xff;
    h = Math.imul(h, 16777619) >>> 0;
  };
  mix(width);
  mix(width >> 8);
  mix(height);
  mix(height >> 8);
  if (data && data.length) {
    const step = Math.max(1, Math.floor(data.length / 97));
    for (let i = 0; i < data.length; i += step) mix(data[i]);
  }
  return `f${width}x${height}-${h.toString(36)}`;
}

function getObject(page, id, timeoutMs = 10000) {
  const objs = id.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v || null);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      objs.get(id, finish);
    } catch {
      finish(null);
    }
  });
}

function bboxOf(Util, vpTransform, ctm) {
  const tm = Util.transform(vpTransform, ctm);
  const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map((p) => Util.applyTransform(p, tm));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

/** 页面里每一次贴图：[{ id, inline?, box }] */
function collectImageDraws(pdfjs, opList, viewport) {
  const { OPS, Util } = pdfjs;
  const draws = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    switch (fn) {
      case OPS.save:
        stack.push(ctm);
        break;
      case OPS.restore:
        ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        break;
      case OPS.transform:
        ctm = Util.transform(ctm, args);
        break;
      case OPS.paintFormXObjectBegin:
        stack.push(ctm);
        if (Array.isArray(args?.[0]) && args[0].length === 6) ctm = Util.transform(ctm, args[0]);
        break;
      case OPS.paintFormXObjectEnd:
        ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        break;
      case OPS.beginGroup:
        stack.push(ctm);
        if (Array.isArray(args?.[0]?.matrix) && args[0].matrix.length === 6) ctm = Util.transform(ctm, args[0].matrix);
        break;
      case OPS.endGroup:
        ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        break;
      case OPS.paintImageXObject:
      case OPS.paintImageXObjectRepeat:
        if (typeof args?.[0] === 'string') draws.push({ id: args[0], box: bboxOf(Util, viewport.transform, ctm) });
        break;
      case OPS.paintInlineImageXObject:
        if (args?.[0] && typeof args[0] === 'object') draws.push({ id: null, inline: args[0], box: bboxOf(Util, viewport.transform, ctm) });
        break;
      default:
        break;
    }
  }
  return draws;
}

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

/**
 * @param {object} pdfjs  pdfjs-dist 模块（浏览器：'pdfjs-dist'；Node：'pdfjs-dist/legacy/build/pdf.mjs'）
 * @param {Uint8Array|ArrayBuffer} data
 * @param {{
 *   onProgress?: (stage:'extract', done:number, total:number) => void,
 *   encodeImage?: (imgObj:object, info:{ key, pxW, pxH, maxArea }) => Promise<Blob|undefined>|Blob|undefined,
 *   renderThumb?: (page:object, viewport:object) => Promise<Blob|undefined>,
 *   maxPages?: number,
 *   docOptions?: object,   // 透传给 pdfjs.getDocument（Node 里传 { isOffscreenCanvasSupported:false }）
 * }} [opts]
 * @returns {Promise<{ meta:{ numPages, title, creationDate }, pages: object[], blobs: Map<string, Blob> }>}
 */
export async function extractPdf(pdfjs, data, { onProgress, encodeImage, renderThumb, maxPages, docOptions } = {}) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const task = pdfjs.getDocument({ data: bytes, verbosity: 0, ...(docOptions || {}) });
  const doc = await task.promise;
  try {
    const numPages = doc.numPages;
    let title = '';
    let creationDate = '';
    try {
      const md = await doc.getMetadata();
      title = (md?.info?.Title || '').trim();
      creationDate = md?.info?.CreationDate || '';
    } catch {
      // 元数据坏了不影响解析
    }
    const total = Math.min(numPages, maxPages > 0 ? maxPages : numPages);
    const pages = [];
    const blobs = new Map();
    const encoded = new Set();
    onProgress?.('extract', 0, total);

    for (let n = 1; n <= total; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const W = viewport.width;
      const H = viewport.height;

      // 文字
      const tc = await page.getTextContent();
      const items = [];
      for (const it of tc.items) {
        if (!it || typeof it.str !== 'string' || !it.str.trim()) continue;
        const [, , c, d, e, f] = it.transform;
        const fs = Math.hypot(c, d);
        const [x, base] = pdfjs.Util.applyTransform([e, f], viewport.transform);
        items.push({ str: it.str, x, base, w: it.width || 0, fs });
      }
      const lines = buildLines(items);

      // 图片
      const opList = await page.getOperatorList();
      const draws = collectImageDraws(pdfjs, opList, viewport);
      const images = [];
      const pageKeys = new Map(); // key → { obj, maxArea }
      for (const dr of draws) {
        const { box } = dr;
        // 太小 / 完全在页外的图不要
        if (box.w < 4 || box.h < 4) continue;
        if (box.x > W || box.y > H || box.x + box.w < 0 || box.y + box.h < 0) continue;
        const obj = dr.inline || (await getObject(page, dr.id));
        if (!obj) continue;
        const key = refKey(obj.ref) || (dr.id && dr.id.startsWith('g_') ? dr.id : null) || (obj.data ? fingerprint(obj) : `p${n}-${dr.id || images.length}`);
        const pxW = obj.width || 0;
        const pxH = obj.height || 0;
        const cx0 = Math.max(0, box.x);
        const cy0 = Math.max(0, box.y);
        const area = (Math.max(0, Math.min(W, box.x + box.w) - cx0) * Math.max(0, Math.min(H, box.y + box.h) - cy0)) / (W * H);
        images.push({ key, x: r1(box.x), y: r1(box.y), w: r1(box.w), h: r1(box.h), pxW, pxH });
        const prev = pageKeys.get(key);
        if (!prev) pageKeys.set(key, { obj, maxArea: area });
        else prev.maxArea = Math.max(prev.maxArea, area);
      }

      // 每张图只编码一次（第一次出现时）
      if (encodeImage) {
        for (const [key, { obj, maxArea }] of pageKeys) {
          if (encoded.has(key)) continue;
          encoded.add(key);
          try {
            const blob = await encodeImage(obj, { key, pxW: obj.width || 0, pxH: obj.height || 0, maxArea });
            if (blob) blobs.set(key, blob);
          } catch (err) {
            console.warn(`[pdfExtract] 第 ${n} 页图片编码失败`, err);
          }
        }
      }

      const rawPage = { n, width: r1(W), height: r1(H), lines, images };
      if (renderThumb) {
        try {
          const thumb = await renderThumb(page, viewport);
          if (thumb) rawPage.thumb = thumb;
        } catch (err) {
          console.warn(`[pdfExtract] 第 ${n} 页缩略图失败`, err);
        }
      }
      pages.push(rawPage);
      page.cleanup();
      onProgress?.('extract', n, total);
      // 让出主线程，界面进度条才动得起来
      await new Promise((r) => setTimeout(r, 0));
    }
    return { meta: { numPages, title, creationDate }, pages, blobs };
  } finally {
    try {
      await doc.destroy();
    } catch {
      // ignore
    }
  }
}
