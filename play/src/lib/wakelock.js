// 玩的时候不让屏幕自己关（支持的浏览器才有）
import { useEffect } from 'react';

export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let gone = false;
    const get = async () => {
      try {
        if (document.visibilityState === 'visible' && !gone) lock = await navigator.wakeLock.request('screen');
      } catch {
        /* 省电模式等会拒绝，不要紧 */
      }
    };
    get();
    document.addEventListener('visibilitychange', get);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', get);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
