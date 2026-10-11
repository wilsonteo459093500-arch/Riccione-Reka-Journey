// 许愿模式的启动：同一个 Zen 实例；全屏；屏幕常亮；记住陪同人；锁屏 / 切 app 回来接上音乐。

import { Zen } from '../shared/zen.js';
import { CONFIG } from '../shared/config.js';

export const zen = new Zen();

const HOST_KEY = 'genie.host';

export function savedHost() {
  try {
    return localStorage.getItem(HOST_KEY) || (CONFIG.team.length === 1 ? CONFIG.team[0].code : '');
  } catch {
    return '';
  }
}

export function saveHost(code) {
  try {
    localStorage.setItem(HOST_KEY, code || '');
  } catch {
    /* ignore */
  }
}

export function enterFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  try {
    const r = fn?.call(el);
    r?.catch?.(() => {});
  } catch {
    /* iPhone 不支持网页全屏：加到主屏幕打开就是全屏 */
  }
}

export function exitFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else if (document.webkitFullscreenElement) document.webkitExitFullscreen?.();
  } catch {
    /* ignore */
  }
}

// ── 屏幕常亮（Wake Lock）：客人慢慢想的时候 iPad 不自动锁屏。切出去再回来会被系统释放，所以回到前台重新要 ──
let wake = null;
let wantWake = false;
let wakeBound = false;
let asking = false;

async function requestWake() {
  if (!wantWake || wake || asking || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
  asking = true;
  try {
    const w = await navigator.wakeLock?.request('screen');
    if (!w) return;
    if (!wantWake) {
      w.release?.().catch?.(() => {});
      return;
    }
    wake = w;
    w.addEventListener?.('release', () => {
      if (wake === w) wake = null;
    });
  } catch {
    wake = null; // 不支持 / 省电模式 / 没在前台：不影响使用
  } finally {
    asking = false;
  }
}

/** 结束许愿（回到大厅 / 下一位客人）：放开屏幕常亮。zen.stop() 也会自动调用 */
export function releaseWake() {
  wantWake = false;
  const w = wake;
  wake = null;
  try {
    w?.release?.()?.catch?.(() => {});
  } catch {
    /* ignore */
  }
}

zen.onStop = releaseWake;

/** 必须在点击事件里调用 */
export function startWish() {
  zen.start({ trackUrl: CONFIG.wishMusic || '', volume: CONFIG.wishVolume ?? 0.7 });
  enterFullscreen();
  wantWake = true;
  requestWake();
  if (!wakeBound && typeof document !== 'undefined') {
    wakeBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWake();
    });
  }
}

/**
 * 锁屏 / 切去 WhatsApp / 分享面板：页面藏起来就 pause()，回来就 resume()。返回解绑函数。
 * 回来时如果系统不让自动恢复（iOS 要点一下），zen.isLive() 会是 false，外壳显示「轻触继续音乐」，点击里再调用 zen.resume()。
 */
export function bindZenLifecycle(z = zen) {
  if (typeof document === 'undefined') return () => {};
  const onVis = () => {
    if (document.visibilityState === 'hidden') z.pause();
    else z.resume();
  };
  const onShow = (e) => {
    if (e.persisted) z.resume();
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pageshow', onShow);
  return () => {
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pageshow', onShow);
  };
}

export function wishStartUrl(host = savedHost()) {
  return `quiz.html?mode=wish${host ? `&from=${encodeURIComponent(host)}` : ''}`;
}
