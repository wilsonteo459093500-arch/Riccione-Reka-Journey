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

/** 右下角品牌水印（下载/导出时烙进图片；text 为空则原样返回） */
export async function applyWatermark(dataUrl, text) {
  if (!text || !text.trim()) return dataUrl;
  try {
    const img = await loadImageEl(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const fs = Math.max(16, Math.round(canvas.width * 0.018));
    ctx.font = `600 ${fs}px "DM Sans", "Noto Sans SC", sans-serif`;
    try {
      ctx.letterSpacing = `${Math.round(fs * 0.18)}px`;
    } catch {
      /* 旧浏览器不支持 letterSpacing，忽略 */
    }
    const pad = Math.round(fs * 1.1);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = fs * 0.4;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText(text.trim().toUpperCase(), canvas.width - pad, canvas.height - pad);
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
