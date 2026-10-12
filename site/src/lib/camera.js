// 拍照 / 相册兼容：华为（没有谷歌 Chrome、用华为浏览器 / 鸿蒙浏览器）、WhatsApp / 微信等 App 里直接打开
// ------------------------------------------------------------
// 1. 按钮本身就是 <input type=file>（透明盖在按钮上，手指直接点到它）——不靠 input.click()，
//    有些浏览器 / App 内置浏览器不认代码触发的点击，直接点最稳。
// 2. 点了之后页面一直没「离开」（没弹出相机 / 相册），说明这台手机打不开 → 在按钮下面提示，
//    给「网页相机」（getUserMedia，在页面里直接开后置摄像头拍照 / 录像，不经过系统选择器）和解决办法。
// 3. App 内置浏览器（Android WebView）常常根本没接好选文件 → 顶部提示用浏览器打开。

const ua = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent || '');

/** 华为 / 鸿蒙手机（荣耀新机有谷歌服务，不算） */
export const isHuawei = () => /HUAWEI|HarmonyOS|OpenHarmony|ArkWeb|HuaweiBrowser|HMSCore/i.test(ua());

/** App 内置浏览器：Android WebView（UA 带「; wv)」）或常见社交 App */
export const inAppBrowser = () => /; wv\)|FBAN|FBAV|Instagram|Line\/|MicroMessenger|WhatsApp|Messenger/i.test(ua());

export const isAndroid = () => /android/i.test(ua());

/** 能不能用网页相机（getUserMedia 只在 https 下有） */
export const canWebCamera = () =>
  typeof window !== 'undefined' && !!window.isSecureContext && !!globalThis.navigator?.mediaDevices?.getUserMedia;

/** 能不能用网页相机录像 */
export const canWebVideo = () => canWebCamera() && typeof globalThis.MediaRecorder !== 'undefined';

/** 这台手机默认就多给一个「网页相机」按钮（华为 / App 内置浏览器）；其他手机打不开时再提示 */
export const offerWebCamera = () => canWebCamera() && (isHuawei() || inAppBrowser());

/** 录像格式：优先 mp4（WhatsApp / iPhone 都能播），没有就 webm */
export function pickVideoType() {
  const R = globalThis.MediaRecorder;
  if (!R?.isTypeSupported) return '';
  for (const t of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    try {
      if (R.isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return '';
}

/**
 * 点了选文件之后看一会儿：系统相机 / 相册弹出来时页面会失去焦点或被盖住（blur / visibilitychange），
 * 选好了有 change，取消了有 cancel。这些都没有 → 说明什么都没弹出来 → onNoShow()。
 * 返回取消函数。
 */
export function watchPicker(input, onNoShow, ms = 1800) {
  if (typeof window === 'undefined' || !input) return () => {};
  // 只看安卓 / 鸿蒙：iPhone 的选照片菜单弹出时页面不会失焦，会误报；而且 iPhone 没有这个问题
  if (!isAndroid() && !isHuawei()) return () => {};
  let done = false;
  let away = false; // 页面失焦 / 被盖住过 = 确实弹出了东西
  const tapped = Date.now();
  const left = () => {
    done = true;
    stop();
  };
  const onBlur = () => {
    away = true;
    left();
  };
  const onVis = () => {
    if (document.visibilityState === 'hidden') onBlur();
  };
  // 取消：真有选择器弹出来再被取消，页面会先失焦，而且至少要一会儿；
  // 浏览器自己没相机权限时 Chromium 会立刻「取消」、什么都不弹 → 当作没打开
  const onCancel = () => {
    const instant = !away && Date.now() - tapped < 800;
    left();
    if (instant) onNoShow();
  };
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVis);
  input.addEventListener('change', left);
  input.addEventListener('cancel', onCancel);
  const timer = setTimeout(() => {
    stop();
    if (!done && document.visibilityState === 'visible' && document.hasFocus()) onNoShow();
  }, ms);
  function stop() {
    clearTimeout(timer);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVis);
    input.removeEventListener('change', left);
    input.removeEventListener('cancel', onCancel);
  }
  return stop;
}

/** 当前网址（复制给用户粘贴到浏览器） */
export const pageUrl = () => (typeof location === 'undefined' ? '' : location.href);

/** 安卓：试着用系统浏览器打开当前网址（App 内置浏览器不一定放行，打不开时用户可以复制链接） */
export function openInBrowserUrl() {
  if (typeof location === 'undefined') return '';
  const { host, pathname, search, hash } = location;
  return `intent://${host}${pathname}${search}${hash}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
}
