/* ============================================================
   图片：手机拍的照片动辄 5–10MB，先在手机上缩小再上传 / 送 AI
   ============================================================ */

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('读不到这张图片（HEIC 的话请在相机设定改成「最兼容」）')); };
    img.src = url;
  });
}

/**
 * 缩到长边 maxSide 以内，转成 JPEG。
 * 回 { blob, base64, width, height, media_type }
 */
export async function shrinkImage(file, maxSide = 1600, quality = 0.82) {
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  const base64 = await new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.readAsDataURL(blob);
  });
  return { blob, base64, width, height, media_type: 'image/jpeg' };
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('拍不下来，再试一次'))), 'image/jpeg', quality));
}

function drawScaled(source, w, h, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * 活动连拍：一张照片 → 存进手机用的格式
 * 回 { img: { data: ArrayBuffer, type, width, height }, thumb: 'data:image/jpeg;base64,…' }
 * source 是 <video>（相机画面）或 File / Blob（相册）
 */
export async function shotFrom(source, maxSide = 1600) {
  let el = source;
  let w;
  let h;
  if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) {
    w = source.videoWidth;
    h = source.videoHeight;
    if (!w || !h) throw new Error('相机还没准备好');
  } else {
    el = await loadImage(source);
    w = el.naturalWidth;
    h = el.naturalHeight;
  }
  const big = drawScaled(el, w, h, maxSide);
  const blob = await canvasToBlob(big, 0.85);
  const thumb = drawScaled(el, w, h, 240).toDataURL('image/jpeg', 0.7);
  return { img: { data: await blob.arrayBuffer(), type: 'image/jpeg', width: big.width, height: big.height }, thumb };
}
