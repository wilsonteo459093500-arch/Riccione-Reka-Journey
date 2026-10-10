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

const IDENTITY = [1, 0, 0, 1, 0, 0];

/** 用户空间的矩形 [x0,y0,x1,y1] 经 m 变换后的外接框（页面坐标，左上角原点） */
function transformBox(Util, m, x0, y0, x1, y1) {
  const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map((p) => Util.applyTransform(p, m));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const bx = Math.min(...xs);
  const by = Math.min(...ys);
  return { x: bx, y: by, w: Math.max(...xs) - bx, h: Math.max(...ys) - by };
}

/** 两个框的交集（不相交 → 宽高为 0）；a / b 为 null 表示不限 */
export function intersectBox(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** constructPath 的坐标 → 外接矩形（用户空间）；曲线把控制点也算进去（宁大勿小） */
function pathBounds(OPS, ops, coords) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  let i = 0;
  for (const op of ops || []) {
    switch (op) {
      case OPS.rectangle:
        add(coords[i], coords[i + 1]);
        add(coords[i] + coords[i + 2], coords[i + 1] + coords[i + 3]);
        i += 4;
        break;
      case OPS.moveTo:
      case OPS.lineTo:
        add(coords[i], coords[i + 1]);
        i += 2;
        break;
      case OPS.curveTo:
        add(coords[i], coords[i + 1]);
        add(coords[i + 2], coords[i + 3]);
        add(coords[i + 4], coords[i + 5]);
        i += 6;
        break;
      case OPS.curveTo2:
      case OPS.curveTo3:
        add(coords[i], coords[i + 1]);
        add(coords[i + 2], coords[i + 3]);
        i += 4;
        break;
      default:
        break; // closePath 等不带坐标
    }
  }
  return x0 <= x1 && y0 <= y1 ? [x0, y0, x1, y1] : null;
}

/**
 * 页面里每一次贴图：[{ id, inline?, tm, box, vis }]
 *   tm  = 单位正方形 → 页面坐标的变换（含旋转 / 翻转）
 *   box = 整张图在页面上的外接框；vis = 被裁切路径（re W n）、表单 / 分组边界裁剪后真正看得见的部分
 */
function collectImageDraws(pdfjs, opList, viewport) {
  const { OPS, Util } = pdfjs;
  const vp = viewport.transform;
  const draws = [];
  let ctm = IDENTITY;
  let clip = null; // 当前裁切范围（页面坐标）；null = 不限
  let lastPath = null; // 最近一条路径的外接框（页面坐标），遇到 W / W* 时成为裁切
  const stack = [];
  const push = () => stack.push({ ctm, clip });
  const pop = () => {
    const st = stack.pop();
    ctm = st ? st.ctm : IDENTITY;
    clip = st ? st.clip : null;
  };
  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    switch (fn) {
      case OPS.save:
        push();
        break;
      case OPS.restore:
        pop();
        break;
      case OPS.transform:
        ctm = Util.transform(ctm, args);
        break;
      case OPS.constructPath: {
        const b = pathBounds(OPS, args?.[0], args?.[1] || []);
        lastPath = b ? transformBox(Util, Util.transform(vp, ctm), ...b) : null;
        break;
      }
      case OPS.clip:
      case OPS.eoClip:
        if (lastPath) clip = intersectBox(clip, lastPath);
        break;
      case OPS.paintFormXObjectBegin:
        push();
        if (Array.isArray(args?.[0]) && args[0].length === 6) ctm = Util.transform(ctm, args[0]);
        if (Array.isArray(args?.[1]) && args[1].length === 4) {
          const [bx0, by0, bx1, by1] = args[1];
          clip = intersectBox(clip, transformBox(Util, Util.transform(vp, ctm), Math.min(bx0, bx1), Math.min(by0, by1), Math.max(bx0, bx1), Math.max(by0, by1)));
        }
        break;
      case OPS.paintFormXObjectEnd:
        pop();
        break;
      case OPS.beginGroup:
        push();
        if (Array.isArray(args?.[0]?.matrix) && args[0].matrix.length === 6) ctm = Util.transform(ctm, args[0].matrix);
        if (Array.isArray(args?.[0]?.bbox) && args[0].bbox.length === 4) {
          const [bx0, by0, bx1, by1] = args[0].bbox;
          clip = intersectBox(clip, transformBox(Util, Util.transform(vp, ctm), Math.min(bx0, bx1), Math.min(by0, by1), Math.max(bx0, bx1), Math.max(by0, by1)));
        }
        break;
      case OPS.endGroup:
        pop();
        break;
      case OPS.paintImageXObject:
      case OPS.paintImageXObjectRepeat:
      case OPS.paintInlineImageXObject: {
        const inline = fn === OPS.paintInlineImageXObject;
        if (inline ? !(args?.[0] && typeof args[0] === 'object') : typeof args?.[0] !== 'string') break;
        const tm = Util.transform(vp, ctm);
        const box = transformBox(Util, tm, 0, 0, 1, 1);
        const vis = intersectBox(box, clip);
        draws.push(inline ? { id: null, inline: args[0], tm, box, vis } : { id: args[0], tm, box, vis });
        break;
      }
      default:
        break;
    }
  }
  return draws;
}

// ---------------------------------------------------------------------------
// 摆放：方向（旋转 / 翻转）+ 裁切。编码时按「页面上看到的样子」出图（色板木纹方向、裁掉的部分都对）
// ---------------------------------------------------------------------------

/** 效果图门槛：图在页面上的面积占比 ≥ 15% 按效果图编码（2560px），否则按小图（900px） */
export const RENDER_AREA = 0.15;

const sgn = (v, tol) => (Math.abs(v) <= tol ? 0 : Math.sign(v));
const f2 = (v) => Math.round(v * 100) / 100;

/**
 * 一次贴图的摆放描述。upright = 正放未翻转；cropped = 有被裁掉的部分（> 0.5%）
 * @returns {{ tm:number[], box, vis, upright:boolean, cropped:boolean, suffix:string }}
 */
export function placementOf(tm, box, vis) {
  const [a, b, c, d] = tm;
  const tol = 1e-3 * (Math.abs(a) + Math.abs(b) + Math.abs(c) + Math.abs(d));
  const o = [sgn(a, tol), sgn(b, tol), sgn(c, tol), sgn(d, tol)];
  // 正放：u → 向右（a>0），v → 向上（页面 y 向下，所以 d<0）
  const upright = o[0] > 0 && o[1] === 0 && o[2] === 0 && o[3] < 0;
  const l = box.w ? (vis.x - box.x) / box.w : 0;
  const t = box.h ? (vis.y - box.y) / box.h : 0;
  const r = box.w ? (box.x + box.w - vis.x - vis.w) / box.w : 0;
  const btm = box.h ? (box.y + box.h - vis.y - vis.h) / box.h : 0;
  const cropped = [l, t, r, btm].some((x) => x > 0.005);
  let suffix = '';
  if (!upright) suffix += `@o${o.map((x) => (x < 0 ? 'n' : x > 0 ? 'p' : 'z')).join('')}`;
  if (cropped) suffix += `@c${[l, t, r, btm].map(f2).join(',')}`;
  return { tm, box, vis, upright, cropped, suffix };
}

/**
 * 把原图画成页面上看到的样子：输出尺寸 + canvas setTransform 参数（原图像素 → 输出像素）。
 * 输出分辨率沿用原图像素密度，最长边不超过 maxEdge。
 * @param {{ tm:number[], box, vis }} place
 * @returns {{ w:number, h:number, matrix:number[] }}
 */
export function placementTransform(place, pxW, pxH, maxEdge = Infinity) {
  const { tm, box, vis } = place;
  const dens = Math.sqrt((pxW * pxH) / Math.max(1e-6, box.w * box.h)); // 原图每 pt 多少像素
  const k = Math.min(1, maxEdge / Math.max(1e-6, vis.w * dens, vis.h * dens));
  const s = dens * k;
  const w = Math.max(1, Math.round(vis.w * s));
  const h = Math.max(1, Math.round(vis.h * s));
  const [a, b, c, d, e, f] = tm;
  // 像素 (px, py) → 单位坐标 (u = px/pxW, v = 1 - py/pxH)（第 0 行在顶）→ 页面 → 输出
  return { w, h, matrix: [(a * s) / pxW, (b * s) / pxW, (-c * s) / pxH, (-d * s) / pxH, (e + c - vis.x) * s, (f + d - vis.y) * s] };
}

/** 有效像素尺寸（按页面上看得见的部分、转正后的方向） */
function effectivePx(place, pxW, pxH) {
  if (place.upright && !place.cropped) return { pxW, pxH };
  const dens = Math.sqrt((pxW * pxH) / Math.max(1e-6, place.box.w * place.box.h));
  return { pxW: Math.round(place.vis.w * dens), pxH: Math.round(place.vis.h * dens) };
}

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

/**
 * @param {object} pdfjs  pdfjs-dist 模块（浏览器：'pdfjs-dist'；Node：'pdfjs-dist/legacy/build/pdf.mjs'）
 * @param {Uint8Array|ArrayBuffer} data
 * @param {{
 *   onProgress?: (stage:'extract', done:number, total:number) => void,
 *   encodeImage?: (imgObj:object, info:{ key, pxW, pxH, maxArea, place }) => Promise<Blob|undefined>|Blob|undefined,
 *       place = null（正放、未裁切：原样编码）或 { tm, box, vis }（用 placementTransform 画成页面上的样子）
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
    const encodedArea = new Map(); // key → 编码时用的面积占比
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
      const pageKeys = new Map(); // key → { obj, maxArea, place }
      const pageBox = { x: 0, y: 0, w: W, h: H };
      for (const dr of draws) {
        // 页面边缘也是裁切；太小 / 完全看不见的图不要
        const vis = intersectBox(dr.vis, pageBox);
        if (vis.w < 4 || vis.h < 4) continue;
        const obj = dr.inline || (await getObject(page, dr.id));
        if (!obj) continue;
        const baseKey = refKey(obj.ref) || (dr.id && dr.id.startsWith('g_') ? dr.id : null) || (obj.data ? fingerprint(obj) : `p${n}-${dr.id || images.length}`);
        const place = placementOf(dr.tm, dr.box, vis);
        // 同一张原图转了方向 / 裁了一部分 → 另存一份（色板木纹方向、裁掉的内容都要和页面一致）
        const key = baseKey + place.suffix;
        const { pxW, pxH } = effectivePx(place, obj.width || 0, obj.height || 0);
        const area = (vis.w * vis.h) / (W * H);
        images.push({ key, x: r1(vis.x), y: r1(vis.y), w: r1(vis.w), h: r1(vis.h), pxW, pxH });
        const prev = pageKeys.get(key);
        if (!prev) pageKeys.set(key, { obj, maxArea: area, place });
        else prev.maxArea = Math.max(prev.maxArea, area);
      }

      // 每张图编码一次；先以小图出现（目录 / 拼贴缩略图）、后来又当效果图用的，按效果图分辨率重编
      if (encodeImage) {
        for (const [key, { obj, maxArea, place }] of pageKeys) {
          const before = encodedArea.get(key);
          if (before !== undefined && !(maxArea >= RENDER_AREA && before < RENDER_AREA)) continue;
          encodedArea.set(key, Math.max(maxArea, before || 0));
          try {
            const blob = await encodeImage(obj, {
              key,
              pxW: obj.width || 0,
              pxH: obj.height || 0,
              maxArea: Math.max(maxArea, before || 0),
              place: place.upright && !place.cropped ? null : place,
            });
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
