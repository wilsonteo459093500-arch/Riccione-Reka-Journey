// 图片本地处理：读取 / 压缩 / 缩略图 —— 全部在浏览器完成。

const MAX_INPUT_EDGE = 1600; // 发送给模型前的最长边
const THUMB_EDGE = 360; // 历史记录缩略图最长边

function loadImageEl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片无法解码'));
    img.src = dataUrl;
  });
}

function drawScaled(img, maxEdge, mime = 'image/jpeg', quality = 0.9) {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas.toDataURL(mime, quality);
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/**
 * 把用户选择的文件规整成可发送的图片对象。
 * 能解码的统一压成 JPEG（省流量提速度）；解码失败（如某些 HEIC）则原样发送。
 */
export async function prepareInputImage(file) {
  const rawUrl = await fileToDataUrl(file);
  try {
    const img = await loadImageEl(rawUrl);
    const dataUrl = drawScaled(img, MAX_INPUT_EDGE);
    return { dataUrl, mimeType: 'image/jpeg', base64: dataUrl.split(',')[1] };
  } catch {
    const mimeType = file.type || 'image/jpeg';
    return { dataUrl: rawUrl, mimeType, base64: rawUrl.split(',')[1] };
  }
}

/** 结果图转 JPEG 存储（模型返回的 PNG 太大），失败则返回原图 */
export async function compressForStorage(dataUrl) {
  try {
    const img = await loadImageEl(dataUrl);
    return drawScaled(img, Math.max(img.naturalWidth, img.naturalHeight), 'image/jpeg', 0.92);
  } catch {
    return dataUrl;
  }
}

export async function makeThumb(dataUrl) {
  try {
    const img = await loadImageEl(dataUrl);
    return drawScaled(img, THUMB_EDGE, 'image/jpeg', 0.8);
  } catch {
    return dataUrl;
  }
}

/** 精炼前收紧尺寸/体积，避免 data URI 过大被拒（失败则原样返回） */
export async function shrinkDataUrl(dataUrl, maxEdge = 1400) {
  try {
    const img = await loadImageEl(dataUrl);
    return drawScaled(img, maxEdge, 'image/jpeg', 0.88);
  } catch {
    return dataUrl;
  }
}

/** 把结果 dataURL 转成用于再次输入模型的对象 */
export function dataUrlToInput(dataUrl) {
  const [head, base64] = dataUrl.split(',');
  const mimeType = head.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  return { dataUrl, mimeType, base64 };
}

// 品牌 logo 印章（public/watermark.png：白色 + 透明底），只加载一次
let logoPromise = null;
function loadLogo() {
  if (!logoPromise) {
    logoPromise = loadImageEl('/watermark.png').catch(() => null);
  }
  return logoPromise;
}

/** 右下角品牌 logo 水印（下载/导出时烙进图片；enabled 为空则原样返回） */
export async function applyWatermark(dataUrl, enabled) {
  if (!enabled) return dataUrl;
  try {
    const [img, logo] = await Promise.all([loadImageEl(dataUrl), loadLogo()]);
    if (!logo) return dataUrl;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // logo 宽 = 图宽 18%（下限 140px），白色印章 + 轻微暗影保证浅色底也可见
    const lw = Math.max(140, Math.round(canvas.width * 0.18));
    const lh = Math.round(lw * (logo.naturalHeight / logo.naturalWidth));
    const pad = Math.round(canvas.width * 0.025);
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = Math.round(lw * 0.04);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(logo, canvas.width - lw - pad, canvas.height - lh - pad, lw, lh);
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return dataUrl;
  }
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
