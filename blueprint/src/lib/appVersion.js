// 新版上线后提示刷新。
//
// 一直开着的旧页面，在新版上线后会出错：旧的程序分片（导入 PDF、线稿分析的后台线程）已经不在服务器上了 ——
// 导入 PDF 失败、展厅「从无到有」悄悄变成普通淡入，要刷新才好，以前没有任何提示。
// 做法：构建时把一个版本号写进程序（__BUILD_ID__）和 /version.json；页面每隔几分钟、回到前台时、
// 或者真的载入分片失败时去看一眼 /version.json，不一样 = 有新版 → 界面上请设计师刷新（不自动刷新：手上可能有没存好的东西）。
// 本机开发（没有构建）版本号是 'dev'，不检查。

/* global __BUILD_ID__ */
export const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
export const VERSION_URL = '/version.json';
const POLL_MS = 5 * 60 * 1000;

/** 服务器上的版本号和这个页面的不一样 = 有新版（拿不到、是空的、本机开发 → 不算） */
export const isNewer = (current, remote) => !!remote && !!current && current !== 'dev' && String(remote) !== String(current);

let ready = false;
const listeners = new Set();
export const updateReady = () => ready;
export function onUpdateReady(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function setReady() {
  if (ready) return;
  ready = true;
  listeners.forEach((fn) => fn());
}

/**
 * 去看一眼服务器上的版本号；有新版 → true（并通知界面）。断网、读不到 → false，不打扰
 * @param {{ fetchFn?:Function, current?:string }} opts  测试用
 */
export async function checkUpdate({ fetchFn = typeof fetch === 'function' ? fetch : null, current = BUILD_ID } = {}) {
  if (ready) return true;
  if (!fetchFn || current === 'dev') return false;
  try {
    const res = await fetchFn(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res?.ok) return false;
    const data = await res.json();
    if (isNewer(current, data?.id)) setReady();
  } catch {
    // 断网 / 服务器一时没回：下次再看
  }
  return ready;
}

let started = false;
/** 开始定时检查（只开一次）：每 5 分钟、回到前台时、载入程序分片失败时 */
export function startUpdateWatch() {
  if (started || typeof window === 'undefined' || BUILD_ID === 'dev') return;
  started = true;
  setInterval(() => document.visibilityState === 'visible' && checkUpdate(), POLL_MS);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkUpdate());
  // Vite：旧页面去拿已经不在的分片
  window.addEventListener('vite:preloadError', () => checkUpdate());
  checkUpdate();
}
