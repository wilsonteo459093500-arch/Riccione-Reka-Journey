// 分享 / 下载 / 复制（手机优先：能调系统分享就调，不能就下载）
//
// 注意 iOS：navigator.share 必须在点击当下调用（不能先 await 很久再调），
// 所以文件要「先生成好」，再让用户点「分享」。

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function canShareFiles(files) {
  try {
    return !!(navigator.canShare && navigator.share && navigator.canShare({ files }));
  } catch {
    return false;
  }
}

export const canShareText = () => typeof navigator !== 'undefined' && !!navigator.share;

/** 分享一个文件；不支持就下载。返回 'shared' | 'cancelled' | 'downloaded' */
export async function shareFile(file, { title, text } = {}) {
  if (canShareFiles([file])) {
    try {
      await navigator.share({ files: [file], title: title || file.name, ...(text ? { text } : {}) });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      // NotAllowedError 等：退回下载
    }
  }
  downloadBlob(file, file.name);
  return 'downloaded';
}

/** 分享多张照片 / 视频（可带文字）。不支持时返回 'unsupported' */
export async function shareFiles(files, { text, title } = {}) {
  if (!files.length) return 'empty';
  if (!canShareFiles(files)) return 'unsupported';
  try {
    await navigator.share({ files, ...(text ? { text } : {}), ...(title ? { title } : {}) });
    return 'shared';
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
    return 'failed';
  }
}

export async function shareText(text, title) {
  if (!navigator.share) return 'unsupported';
  try {
    await navigator.share({ text, ...(title ? { title } : {}) });
    return 'shared';
  } catch (e) {
    return e && e.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 退回旧办法 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** 打开 WhatsApp 并预填文字（用户自己选群 / 联系人） */
export function openWhatsApp(text) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };

/** Media 记录 → File（分享用） */
export function mediaToFile(m, index = 0, prefix = 'photo') {
  const blob = m.blob;
  const ext = EXT[blob.type] || (m.kind === 'video' ? 'mp4' : 'jpg');
  const name = m.name && m.kind === 'video' ? m.name : `${prefix}-${String(index + 1).padStart(2, '0')}.${ext}`;
  return new File([blob], name, { type: blob.type || (m.kind === 'video' ? 'video/mp4' : 'image/jpeg') });
}
