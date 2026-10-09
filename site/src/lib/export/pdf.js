// PDF 导出：DocPages（与预览同一套 HTML 页面）→ html2canvas-pro 逐页截图 → jsPDF A4
// 图片型 PDF：任何手机打开中文都不会乱码，不用嵌入几十 MB 的中文字体。
// 省内存（iPhone）：排版一次后只挂载当前这一页的图片，截完立即释放 canvas。
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import DocPages from '../../components/doc/DocPages.jsx';
import { createUrlPool } from '../../components/doc/media.js';
import { PAGE_W, PAGE_H } from '../../components/doc/theme.js';

const nextFrame = () =>
  new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('页面图片生成失败（内存不足？）'))), type, quality);
  });
}

/**
 * 把 DocPages 挂到屏幕外，逐页回调。
 * @param {(canvas: HTMLCanvasElement, index: number, total: number) => Promise<void>} onPage
 */
async function renderPages(model, media, { scale = 2, onPage, onProgress, timeout = 90000 } = {}) {
  const pool = createUrlPool(media);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('data-doc-export', '');
  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${PAGE_W}px`,
    pointerEvents: 'none',
    zIndex: '-1',
  });
  let root = null;
  try {
    const { urls, info } = await pool.load(model);
    document.body.appendChild(host);
    root = createRoot(host);

    let pending = null;
    const onLayout = (res) => {
      if (pending) {
        const p = pending;
        pending = null;
        p.resolve(res);
      }
    };
    const show = (only) =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('排版超时，请重试')), timeout);
        pending = {
          resolve: (r) => {
            clearTimeout(t);
            resolve(r);
          },
        };
        root.render(createElement(DocPages, { model, urls, info, onLayout, only }));
      });

    const first = await show(1);
    const total = first.pages;
    if (onProgress) onProgress(0, total);
    for (let i = 1; i <= total; i += 1) {
      if (i > 1) await show(i);
      await nextFrame();
      const el = host.querySelector(`[data-page="${i}"]`);
      if (!el) throw new Error(`找不到第 ${i} 页`);
      const canvas = await html2canvas(el, {
        scale,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: PAGE_W,
        height: PAGE_H,
        windowWidth: PAGE_W,
        scrollX: 0,
        scrollY: 0,
        // 只克隆这一页：跳过 App 本身和测量层，克隆更快、更省内存
        ignoreElements: (node) =>
          node.id === 'root' ||
          (node.hasAttribute && (node.hasAttribute('data-doc-measure') || (node.hasAttribute('data-page') && node !== el))),
      });
      try {
        await onPage(canvas, i - 1, total);
      } finally {
        canvas.width = 0; // 释放 iOS canvas 内存
        canvas.height = 0;
      }
      if (onProgress) onProgress(i, total);
    }
    return total;
  } finally {
    if (root) root.unmount();
    host.remove();
    pool.release();
  }
}

/**
 * @param {DocModel} model  buildDocModel() 的输出
 * @param {{ get(id), url?(id, which) }} media  媒体加载器
 * @returns {Promise<Blob>} application/pdf
 */
export async function exportPdf(model, media, { onProgress, quality = 0.88, scale = 2 } = {}) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  await renderPages(model, media, {
    scale,
    onProgress,
    onPage: async (canvas, i) => {
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (i > 0) pdf.addPage('a4', 'portrait');
      pdf.addImage(bytes, 'JPEG', 0, 0, W, H, `page${i + 1}`, 'NONE');
    },
  });
  const m = model.meta || {};
  pdf.setProperties({
    title: m.filename || 'report',
    subject: m.templateId || '',
    author: 'Sail by Riccione Reka',
    creator: 'Sail SITE',
  });
  return pdf.output('blob');
}

/**
 * 每页一张图（发 WhatsApp 用）。
 * @returns {Promise<Blob[]>}
 */
export async function renderPagesToImages(model, media, { onProgress, scale = 2, type = 'image/jpeg', quality = 0.9 } = {}) {
  const out = [];
  await renderPages(model, media, {
    scale,
    onProgress,
    onPage: async (canvas) => {
      out.push(await canvasToBlob(canvas, type, quality));
    },
  });
  return out;
}
