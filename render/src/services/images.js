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

/** 把结果 dataURL 转成用于再次输入模型的对象 */
export function dataUrlToInput(dataUrl) {
  const [head, base64] = dataUrl.split(',');
  const mimeType = head.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  return { dataUrl, mimeType, base64 };
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
