/* ============================================================
   第 5 阶段 · 海报 + 讯息一起发
   ------------------------------------------------------------
   wa.me 链接只能带文字，带不了照片。
   手机：用系统「分享」（Web Share API）把海报 + 讯息一起交给 WhatsApp → 在 WhatsApp 选那个人 → 发送
   电脑：没有分享 → 复制海报（或下载），打开 WhatsApp 后贴上
   ============================================================ */

/** 这台装置能不能「分享」照片（手机 Safari / Chrome 可以；多数电脑浏览器不行） */
export function canShareFiles(file) {
  try {
    return !!(typeof navigator !== 'undefined' && navigator.canShare && file && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

/** 从网址拿海报，变成可以分享的 File */
export async function fetchPoster(url, name = '海报') {
  const blob = await (await fetch(url)).blob();
  const safe = String(name).replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'poster';
  return new File([blob], `${safe}.jpg`, { type: blob.type || 'image/jpeg' });
}

/**
 * 分享海报 + 讯息。要在按钮的 click 里直接呼叫（浏览器规定）。
 * 顺便把讯息复制起来：有些 WhatsApp 版本只收照片，讯息没跟过去的话，在对话框贴上就有。
 * 回 true = 分享出去了；false = 本人取消
 */
export async function sharePoster(file, text) {
  try { navigator.clipboard && navigator.clipboard.writeText(text).catch(() => {}); } catch { /* 不能复制也没关系 */ }
  try {
    await navigator.share({ files: [file], text });
    return true;
  } catch (e) {
    if (e && e.name === 'AbortError') return false;
    throw new Error('分享失败：可以先「复制讯息」，再从相簿把海报传给他');
  }
}

/** 电脑：把海报复制到剪贴簿（转成 PNG，浏览器只收 PNG）；不行就下载 */
export async function copyPoster(file) {
  try {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext('2d').drawImage(bmp, 0, 0);
    const png = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return 'copied';
  } catch {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name || 'poster.jpg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return 'downloaded';
  }
}
