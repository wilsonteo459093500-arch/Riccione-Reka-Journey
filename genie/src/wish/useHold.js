// 员工的门：按住约 3 秒才算数（一圈细线慢慢画满）；短按、滑开、松手都不算。
// 许愿模式的 WISH 字标（员工区）和入口页的「员工 · 本机蓝图」共用这一个。
// 手指 / 鼠标按住，或键盘按住空格 / Enter 都可以。enabled=false 时什么都不拦（按钮照常能点）。
// 返回 p（0–1，画进度圈用）和要绑在按钮上的事件 bind。

import { useEffect, useRef, useState } from 'react';

export const HOLD_MS = 3000;

const isKey = (e) => e.key === ' ' || e.key === 'Enter';

export function useHold(onDone, { ms = HOLD_MS, enabled = true } = {}) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const timer = useRef(0);
  const reset = useRef(0);
  const t0 = useRef(0);
  const down = useRef(false);
  const fired = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;

  const clear = () => {
    cancelAnimationFrame(raf.current);
    clearTimeout(timer.current);
  };
  const fire = () => {
    if (fired.current || !down.current) return;
    fired.current = true;
    clear();
    setP(1);
    done.current?.();
    clearTimeout(reset.current);
    reset.current = setTimeout(() => setP(0), 450);
  };
  const stop = () => {
    if (!down.current) return;
    // 3D 很忙时画面一帧可能很久：按够时间就算数，不靠动画走完
    if (!fired.current && performance.now() - t0.current >= ms) fire();
    down.current = false;
    clear();
    if (!fired.current) setP(0);
  };
  const begin = () => {
    down.current = true;
    fired.current = false;
    t0.current = performance.now();
    clear();
    timer.current = setTimeout(fire, ms);
    const tick = (now) => {
      if (!down.current || fired.current) return;
      setP(Math.min(1, Math.max(0, (now - t0.current) / ms)));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(
    () => () => {
      clear();
      clearTimeout(reset.current);
    },
    []
  );

  const bind = {
    onPointerDown: (e) => {
      if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      begin();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onLostPointerCapture: stop,
    onContextMenu: (e) => {
      if (enabled) e.preventDefault();
    },
    onKeyDown: (e) => {
      if (!enabled || !isKey(e)) return;
      e.preventDefault(); // 不要让 Enter 当成一下点击
      if (!e.repeat && !down.current) begin();
    },
    onKeyUp: (e) => {
      if (!isKey(e) || !down.current) return;
      e.preventDefault(); // 空格松开时也不算点击
      stop();
    },
  };

  return { p, bind };
}
