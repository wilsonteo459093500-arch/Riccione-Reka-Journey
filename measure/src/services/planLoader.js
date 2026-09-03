// 户型图载入 —— 图片直接用，PDF 用 pdf.js 渲染成位图。
// 统一产出 { name, kind, dataUrl, width, height, page, pageCount }，
// 之后所有测量都基于这张位图的像素坐标。

// pdf.js 有 1MB+，只在真的传了 PDF 时才下载，别拖慢首屏
let pdfjsPromise = null;
function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [pdfjs, worker] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

// 太大的图存进 IndexedDB 会很笨重；2600px 对量尺精度足够（1px ≈ 4mm@10m 户型）
const MAX_DIM = 2600;
// PDF 是矢量的，渲染得大一点更清楚，也更好点准
const PDF_TARGET_W = 2200;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error || new Error('读取文件失败'));
    fr.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('这张图打不开，换一张试试'));
    img.src = src;
  });
}

function canvasToDataUrl(canvas) {
  // 户型图多是线稿，PNG 更清晰；但大图 PNG 太肥，超过阈值就转 JPEG
  const png = canvas.toDataURL('image/png');
  if (png.length < 3_500_000) return png;
  return canvas.toDataURL('image/jpeg', 0.92);
}

async function fromImageFile(file) {
  const raw = await readAsDataUrl(file);
  const img = await loadImage(raw);
  const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1) {
    return { kind: 'image', dataUrl: raw, width: img.naturalWidth, height: img.naturalHeight, page: 1, pageCount: 1 };
  }
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return { kind: 'image', dataUrl: canvasToDataUrl(canvas), width: w, height: h, page: 1, pageCount: 1 };
}

async function fromPdfFile(file, pageNo) {
  const pdfjs = await getPdfjs();
  // pdf.js 会接管这块 buffer，每次都给一份新的
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pageCount = doc.numPages;
  const p = Math.min(Math.max(1, pageNo || 1), pageCount);
  const page = await doc.getPage(p);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, Math.max(1, PDF_TARGET_W / base.width));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const out = {
    kind: 'pdf',
    dataUrl: canvasToDataUrl(canvas),
    width: canvas.width,
    height: canvas.height,
    page: p,
    pageCount,
  };
  await doc.destroy();
  return out;
}

/** file: File；opts.page: PDF 页码（从 1 起） */
export async function loadPlanFile(file, opts = {}) {
  if (!file) throw new Error('没有选到文件');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  const out = isPdf ? await fromPdfFile(file, opts.page) : await fromImageFile(file);
  return { name: file.name || '户型图', ...out };
}
