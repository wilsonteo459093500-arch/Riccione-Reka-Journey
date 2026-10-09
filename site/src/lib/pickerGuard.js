// 安卓拍照 / 选相册时，相机 App 很吃运行内存，系统可能把浏览器暂时关掉；
// 回来时整页重新加载、照片丢失（Chrome 提示 "Unable to complete previous operation due to low memory"）。
// 打开相机 / 相册前记一笔，正常回来（选好或取消）就清掉；页面重新加载时这笔还在 → 说明刚才被系统关掉了。
const KEY = 'tora.picker';
const MAX_AGE = 10 * 60 * 1000;

export function clearPicker() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 隐私模式等读写失败：只是少了提示 */
  }
}

/**
 * 在 input.click() 之前调用。
 * @param {HTMLInputElement|null} input
 * @param {{ reportId?: string, anchor?: string, kind?: 'camera'|'library'|'video' }} info
 */
export function markPicker(input, info) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...info, at: Date.now() }));
  } catch {
    return;
  }
  // 取消选择：新版 Chrome 会发 cancel；旧版只能等页面重新拿到焦点
  input?.addEventListener('cancel', clearPicker, { once: true });
  const onFocus = () => setTimeout(clearPicker, 1500);
  window.addEventListener('focus', onFocus, { once: true });
}

/** 页面刚加载时调用一次：返回被打断的那次记录（并清掉），没有则 null */
export function takeInterrupted() {
  let info = null;
  try {
    info = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    info = null;
  }
  clearPicker();
  if (!info || !info.at || Date.now() - info.at > MAX_AGE) return null;
  return info;
}

/** 按钮所在的检查项 / 字段 / 节，用于回来时滚回原位 */
export function anchorOf(el) {
  return el?.closest?.('[id^="item-"],[id^="field-"],[id^="sec-"]')?.id || '';
}
