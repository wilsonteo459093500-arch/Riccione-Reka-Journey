// 平面图文件（图片 / PDF）→ JPEG dataURL（最长边 ≤ 2000），给编辑器当底图、给 AI 识别。
//
// PDF 用 pdf.js。新版 pdf.js 要用到 Promise.withResolvers 等新函数（Safari / iPadOS 17.4 才有）：
// 旧设备自动改用 pdf.js 的「legacy」版本（转译过、旧浏览器也能跑）；新版跑到一半缺函数也会退回 legacy 再试一次。
// 实在读不了，抛出一句能照着做的话（已经翻译好，界面直接显示）。

import { t } from '../../shared/i18n.js';

const MAX = 2000;

function canvasToDataURL(c) {
  return c.toDataURL('image/jpeg', 0.9);
}

async function imageToDataURL(file) {
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    // HEIC、损坏的文件……
    throw new Error(t('这张图片读不出来：请换成 JPG / PNG 再试'));
  }
  const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
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

async function renderPdf(lib, file, page) {
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), verbosity: 0 }).promise;
  try {
    const pg = await doc.getPage(Math.min(page, doc.numPages));
    const base = pg.getViewport({ scale: 1 });
    const scale = Math.min(MAX / base.width, MAX / base.height, 6);
    const vp = pg.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width);
    c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    return { src: canvasToDataURL(c), width: c.width, height: c.height, pages: doc.numPages };
  } finally {
    doc.destroy();
  }
}

async function pdfToDataURL(file, page = 1) {
  const unsupported = () => {
    // TypeError：界面（PlanEditor）认得这一类，直接显示这句
    const err = new TypeError(t('这台设备读不了 PDF：请更新 iPadOS，或把平面图截图成 JPG / PNG 再上传'));
    err.code = 'pdf-unsupported';
    return err;
  };
  if (modernOK()) {
    try {
      return await renderPdf(await loadPdfjs(false), file, page);
    } catch (e) {
      if (!missingFeature(e)) throw e;
      // 新版跑到一半缺函数：退回 legacy 再试
    }
  }
  try {
    return await renderPdf(await loadPdfjs(true), file, page);
  } catch (e) {
    if (missingFeature(e)) throw unsupported();
    throw e;
  }
}

export async function planFileToImage(file) {
  const isPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name || '');
  if (isPdf) return pdfToDataURL(file);
  if (file.type && !/^image\//.test(file.type)) throw new Error(t('只支持图片（JPG / PNG）或 PDF'));
  return imageToDataURL(file);
}
