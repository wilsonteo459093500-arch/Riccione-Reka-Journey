// 浏览器端编排：PDF 文件 → Project（图片存进 IndexedDB，整套页面排好）。不负责保存项目（调用方保存）。
//   read（读文件）→ extract（逐页解析 + 编码图片 + 缩略图）→ save（存图）→ layout（排版）

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { extractPdf, placementTransform, RENDER_AREA } from './pdfExtract.js';
import { PDFJS_DOC_OPTIONS } from './pdfjsAssets.js';
import { analyzePages } from './analyze.js';
import { newProject, assembleDeck, uid, clientLine } from '../engine/model.js';
import { applyLayoutRhythm } from '../engine/layouts.js';
import { storeBlob, metaOf } from '../store/assets.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_FILE_BYTES = 700 * 1024 * 1024;

// ---------------------------------------------------------------------------
// 画布工具（优先 OffscreenCanvas）
// ---------------------------------------------------------------------------

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片编码失败'))), type, quality));
}

/** pdf.js 原始像素（kind 1/2/3）→ 同尺寸画布 */
function rawToCanvas(obj) {
  const { width: w, height: h, kind, data } = obj;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(w, h);
  const dst = out.data;
  if (kind === 3) {
    dst.set(data.subarray ? data.subarray(0, dst.length) : data);
  } else if (kind === 2) {
    for (let i = 0, j = 0, n = w * h; i < n; i++, j += 3) {
      const k = i * 4;
      dst[k] = data[j];
      dst[k + 1] = data[j + 1];
      dst[k + 2] = data[j + 2];
      dst[k + 3] = 255;
    }
  } else if (kind === 1) {
    // 1 位灰度：每行按字节对齐，置位 = 白
    const rowBytes = (w + 7) >> 3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const k = (y * w + x) * 4;
        const v = bit ? 255 : 0;
        dst[k] = v;
        dst[k + 1] = v;
        dst[k + 2] = v;
        dst[k + 3] = 255;
      }
    }
  } else {
    return null;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/**
 * 编码一张 PDF 图片：效果图最长边 2560 / JPEG 0.86；色板等小图最长边 900 / JPEG 0.88；透明处垫白。
 * place（转了方向 / 被裁切的图）→ 画成页面上看到的样子（色板木纹方向、裁掉的部分都和原稿一致）
 * @returns {Promise<{ blob:Blob, w:number, h:number }|null>}
 */
async function encodePdfImage(obj, { maxArea, place }) {
  const w0 = obj?.width || 0;
  const h0 = obj?.height || 0;
  if (!w0 || !h0 || w0 * h0 < 64) return null;
  const isRender = maxArea >= RENDER_AREA;
  const maxEdge = isRender ? 2560 : 900;
  const quality = isRender ? 0.86 : 0.88;
  const source = obj.bitmap || (obj.data ? rawToCanvas(obj) : null);
  if (!source) return null;
  let w;
  let h;
  let matrix = null;
  if (place) {
    ({ w, h, matrix } = placementTransform(place, w0, h0, maxEdge));
  } else {
    const scale = Math.min(1, maxEdge / Math.max(w0, h0));
    w = Math.max(1, Math.round(w0 * scale));
    h = Math.max(1, Math.round(h0 * scale));
  }
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (matrix) {
    ctx.setTransform(...matrix);
    ctx.drawImage(source, 0, 0, w0, h0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    ctx.drawImage(source, 0, 0, w, h);
  }
  const blob = await canvasBlob(canvas, 'image/jpeg', quality);
  return { blob, w, h };
}

/** 原稿页缩略图：宽 480，JPEG 0.75 */
async function renderPageThumb(page, viewport) {
  const scale = 480 / viewport.width;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const blob = await canvasBlob(canvas, 'image/jpeg', 0.75);
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

// ---------------------------------------------------------------------------
// 友好的错误提示
// ---------------------------------------------------------------------------

function friendlyError(err) {
  const name = err?.name || '';
  const msg = String(err?.message || err || '');
  if (name === 'PasswordException' || /password/i.test(msg)) {
    return new Error('这个 PDF 有密码保护 —— 请先在 WPS / Acrobat 里取消密码，再重新上传。');
  }
  if (name === 'InvalidPDFException' || /Invalid PDF|PDF header/i.test(msg)) {
    return new Error('这个文件打不开，可能不是 PDF 或已损坏 —— 请从 WPS / PowerPoint 重新导出 PDF 后再试。');
  }
  if (name === 'MissingPDFException') return new Error('没有读到文件内容，请重新选择 PDF。');
  if (err instanceof RangeError || /out of memory|allocation failed|Array buffer allocation/i.test(msg)) {
    return new Error('PDF 太大，浏览器内存不够 —— 建议导出时选「压缩图片 / 标准质量」，或按楼层分成几份 PDF 分别导入。');
  }
  return err instanceof Error ? err : new Error(msg || 'PDF 解析失败');
}

const baseName = (name) => String(name || '').replace(/^.*[\\/]/, '').replace(/\.pdf$/i, '').replace(/^[0-9a-f]{6,32}[-_](?=\d)/i, '').replace(/_/g, ' ').trim();

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

/**
 * @param {File} file  设计师方案 PDF
 * @param {{ onProgress?: (stage:'read'|'extract'|'save'|'layout', done:number, total:number) => void }} [opts]
 * @returns {Promise<object>} Project（engine/model.js），图片已存入 IndexedDB，slides 已排好整套
 */
export async function importPdfFile(file, { onProgress } = {}) {
  if (!file) throw new Error('请选择一个 PDF 文件。');
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`PDF 有 ${Math.round(file.size / 1024 / 1024)} MB，太大了 —— 建议导出时压缩图片，或按楼层分成几份再导入。`);
  }
  const progress = (stage, done, total) => {
    try {
      onProgress?.(stage, done, total);
    } catch {
      // 进度回调出错不影响导入
    }
  };

  // 1) 读文件
  progress('read', 0, 1);
  let data;
  try {
    data = new Uint8Array(await file.arrayBuffer());
  } catch (err) {
    throw friendlyError(err);
  }
  progress('read', 1, 1);

  // 2) 解析：文字 / 图片框 / 编码图片 / 缩略图
  const dims = new Map(); // key → { w, h }
  let raw;
  try {
    raw = await extractPdf(pdfjs, data, {
      onProgress: progress,
      encodeImage: async (obj, info) => {
        const r = await encodePdfImage(obj, info);
        if (!r) return undefined;
        dims.set(info.key, { w: r.w, h: r.h });
        return r.blob;
      },
      renderThumb: renderPageThumb,
      docOptions: PDFJS_DOC_OPTIONS, // 没嵌入字体的中文 PDF 靠 CMap 才读得出字
    });
  } catch (err) {
    throw friendlyError(err);
  }
  if (!raw.meta.numPages || !raw.pages.length) throw new Error('这个 PDF 没有页面。');

  const analysis = analyzePages(raw, { fileName: file.name });
  if (!analysis.views.length) {
    throw new Error('没有找到效果图 —— 请确认 PDF 里有整页的效果图（不是纯文字，也不是加密 / 扫描后无法读取的文件）。');
  }
  const importWarnings = [];
  if (!raw.pages.some((p) => p.lines?.length)) {
    importWarnings.push('这个 PDF 里读不到文字（可能是「导出为图片」或扫描件）—— 空间名和材料需要手动填写。');
  }

  // 3) 建项目 + 存图（每张图只存一次）
  const info = analysis.info;
  const project = newProject({
    name: clientLine(info) || baseName(file.name) || '新方案',
    info: { client: info.client, location: info.location, date: info.date, sourceFile: info.sourceFile || file.name },
  });

  const needed = new Set();
  for (const v of analysis.views) if (v.imageKey) needed.add(v.imageKey);
  for (const m of analysis.materials) if (m.imageKey) needed.add(m.imageKey);
  for (const f of analysis.floors) {
    if (f.imageKey) needed.add(f.imageKey);
    if (f.planKey) needed.add(f.planKey);
  }
  const toStore = [...needed].filter((k) => raw.blobs.has(k));
  const thumbs = raw.pages.filter((p) => p.thumb);
  const total = toStore.length + thumbs.length;
  let done = 0;
  progress('save', 0, total);

  const srcOf = new Map();
  for (const key of toStore) {
    const d = dims.get(key) || {};
    srcOf.set(key, await storeBlob(raw.blobs.get(key), { projectId: project.id, w: d.w, h: d.h }));
    progress('save', ++done, total);
  }
  const thumbOf = new Map();
  for (const p of thumbs) {
    thumbOf.set(p.n, await storeBlob(p.thumb, { projectId: project.id }));
    progress('save', ++done, total);
  }
  raw.blobs.clear();

  // 4) 楼层 / 材料 / 效果图页
  progress('layout', 0, 1);
  const floorId = new Map();
  project.floors = analysis.floors.map((f) => {
    const id = uid('f');
    floorId.set(f.key, id);
    return { id, zh: f.zh, en: f.en, image: srcOf.get(f.imageKey) || null, ...(f.planKey && srcOf.get(f.planKey) ? { plan: srcOf.get(f.planKey) } : {}) };
  });
  const materialId = new Map();
  project.materials = analysis.materials.map((m) => {
    const id = uid('m');
    materialId.set(m.key, id);
    return { id, name: m.name, code: m.code, image: srcOf.get(m.imageKey) || null, pending: !!m.pending };
  });

  let views = analysis.views.map((v) => ({
    id: uid('s'),
    kind: 'view',
    enabled: true,
    floorId: v.floorKey ? floorId.get(v.floorKey) || null : null,
    layout: 'auto',
    image: srcOf.get(v.imageKey) || null,
    room: v.room,
    roomEn: v.roomEn,
    subtitle: v.subtitle,
    materials: v.materials.filter((m) => materialId.has(m.materialKey)).map((m) => ({ role: m.role, materialId: materialId.get(m.materialKey) })),
    notes: v.notes.map((n) => ({ label: n.label, text: n.text })),
    sourcePage: v.page,
  }));
  views = applyLayoutRhythm(views, metaOf);

  // 方案页：没有楼层的视角在前（不加楼层页），然后每层「楼层页 + 该层视角」
  const designSlides = views.filter((v) => !v.floorId);
  for (const f of project.floors) {
    designSlides.push({ id: uid('s'), kind: 'floor', floorId: f.id, enabled: true });
    designSlides.push(...views.filter((v) => v.floorId === f.id));
  }
  project.slides = assembleDeck(designSlides);
  project.pages = analysis.pages.map((p) => ({ n: p.n, kind: p.kind, title: p.title || '', thumb: thumbOf.get(p.n) || null }));
  project.updatedAt = Date.now();
  if (importWarnings.length) project.importWarnings = importWarnings;
  progress('layout', 1, 1);
  return project;
}
