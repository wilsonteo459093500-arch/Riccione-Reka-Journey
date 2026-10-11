// 平面图文件（图片 / PDF）→ JPEG dataURL（最长边 ≤ 2000），给编辑器当底图、给 AI 识别。

const MAX = 2000;

function canvasToDataURL(c) {
  return c.toDataURL('image/jpeg', 0.9);
}

async function imageToDataURL(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return { src: canvasToDataURL(c), width: c.width, height: c.height };
}

let pdfjs = null;
async function loadPdfjs() {
  if (!pdfjs) {
    const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    pdfjs = lib;
  }
  return pdfjs;
}

async function pdfToDataURL(file, page = 1) {
  const lib = await loadPdfjs();
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
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    return { src: canvasToDataURL(c), width: c.width, height: c.height, pages: doc.numPages };
  } finally {
    doc.destroy();
  }
}

export async function planFileToImage(file) {
  const isPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name || '');
  if (isPdf) return pdfToDataURL(file);
  if (file.type && !/^image\//.test(file.type)) throw new Error('只支持图片（JPG / PNG）或 PDF');
  return imageToDataURL(file);
}
