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
