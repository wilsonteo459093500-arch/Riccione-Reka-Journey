// 许愿模式的启动：同一个 Zen 实例；全屏；记住陪同人。

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

/** 必须在点击事件里调用 */
export function startWish() {
  zen.start({ trackUrl: CONFIG.wishMusic || '', volume: CONFIG.wishVolume ?? 0.7 });
  enterFullscreen();
}

export function wishStartUrl(host = savedHost()) {
  return `quiz.html?mode=wish${host ? `&from=${encodeURIComponent(host)}` : ''}`;
}
