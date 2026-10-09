// 安卓 Chrome「安装到主屏幕」：浏览器认为可安装时会发 beforeinstallprompt，先收着，首页给一个按钮
// （在 WhatsApp 等 App 内置浏览器里不会发，首页改为提示「在 Chrome 中打开」）
import { useEffect, useState } from 'react';

let deferred = null;
const subs = new Set();
const notify = () => subs.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

/** 返回 install()（可安装时）或 null */
export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    subs.add(f);
    return () => subs.delete(f);
  }, []);
  if (!deferred) return null;
  return async () => {
    const e = deferred;
    deferred = null;
    notify();
    try {
      await e.prompt();
      return (await e.userChoice)?.outcome;
    } catch {
      return 'dismissed';
    }
  };
}
