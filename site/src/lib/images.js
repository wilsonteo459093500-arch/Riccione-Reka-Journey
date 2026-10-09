// 照片压缩 / 缩略图 / 视频封面（全部在手机本地完成，不上传）

const MAX_SIDE = 1600; // 报告用图：长边 1600px 足够 A4 打印
const THUMB_SIDE = 360;
const QUALITY = 0.82;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('无法读取这张图片（格式不支持？）'));
    img.src = src;
  });
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = QUALITY) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片压缩失败'))), type, quality);
  });
}

function drawScaled(source, sw, sh, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.imageSmoothingQuality = 'high';
  g.drawImage(source, 0, 0, w, h);
  return c;
}

/**
 * 压缩一张照片。浏览器解码 <img> 时会按 EXIF 自动转正方向。
 * @returns {Promise<{ blob, thumb, w, h }>}
 */
export async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    const big = drawScaled(img, sw, sh, MAX_SIDE);
    const blob = await canvasToBlob(big);
    const small = drawScaled(big, big.width, big.height, THUMB_SIDE);
    const thumb = await canvasToBlob(small, 'image/jpeg', 0.75);
    const w = big.width;
    const h = big.height;
    big.width = big.height = 0; // 释放 iOS canvas 内存
    small.width = small.height = 0;
    return { blob, thumb, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 视频：保留原文件（分享用），尽量截一帧做报告封面。
 * 封面只是装饰：读不到元数据 / 解不了码 / 截图失败都不影响保存视频。
 * @returns {Promise<{ blob, thumb, poster, w, h, duration }>}
 */
export async function processVideo(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  const wait = (event, ms) =>
    new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), ms);
      video.addEventListener(event, () => {
        clearTimeout(t);
        resolve(true);
      }, { once: true });
      video.addEventListener('error', () => {
        clearTimeout(t);
        resolve(false);
      }, { once: true });
    });
  let poster = null;
  let w = 0;
  let h = 0;
  let duration = 0;
  try {
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'metadata';
    video.src = url;
    video.load();
    if (await wait('loadedmetadata', 8000)) {
      duration = Number.isFinite(video.duration) ? video.duration : 0;
      w = video.videoWidth || 0;
      h = video.videoHeight || 0;
      const seeked = wait('seeked', 4000);
      try {
        video.currentTime = Math.min(1, duration / 2 || 0.1);
      } catch {
        /* 某些机型不能 seek */
      }
      await seeked;
      if (video.readyState < 2) await wait('loadeddata', 3000);
      if (video.videoWidth) {
        try {
          const c = drawScaled(video, video.videoWidth, video.videoHeight, 1000);
          poster = await canvasToBlob(c, 'image/jpeg', 0.8);
          c.width = c.height = 0;
        } catch {
          poster = null;
        }
      }
    }
  } catch {
    /* 封面失败不影响视频本身 */
  } finally {
    video.removeAttribute('src');
    try {
      video.load();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
  }
  return { blob: file, thumb: poster, poster, w: w || 640, h: h || 360, duration };
}

/** Blob → dataURL（Word / Excel 嵌图用） */
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Blob → ArrayBuffer */
export function blobToArrayBuffer(blob) {
  if (blob.arrayBuffer) return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}

export function fmtDuration(sec) {
  if (!sec) return '';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
