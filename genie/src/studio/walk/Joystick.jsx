// 走进去 · 左下角的摇杆（SPEC §5）：120px 的圆盘，按住拖 → onMove(x, y)（WalkMode 转给 controller.joystick）。
//   x：-1 往左 … 1 往右；y：1 = 往上推 = 朝正在看的方向走，-1 = 往后退。松手 / 被打断 → (0, 0)。
//   圆心一小圈不算（死区，手指放上去不会溜）；死区外从 0 平滑长到 1；推出圆盘外按边算（单位圆）。
//   指针捕获 + touch-action: none：手指滑出圆盘还算数，页面不滚、画布也抢不走。圆钮直接改 style，不重画 React。
//   键盘走路（W A S D / 方向键）是控制器的事，所以摇杆本身对读屏软件是隐藏的。

import { useEffect, useRef } from 'react';
import { t } from '../../shared/i18n.js';

export const JOY_SIZE = 120; // 圆盘直径（px）
export const JOY_DEAD = 0.14; // 死区（半径的比例）
const KNOB_TRAVEL = 36; // 圆钮最多离开圆心多远（px）

const r3 = (v) => Math.trunc(v * 1000) / 1000 + 0; // 往 0 截：取整以后也不会出单位圆；+ 0：−0 → 0

/**
 * 手指离圆心 (dx, dy)（屏幕 px，y 向下）、圆盘半径 r → { x, y }（y 向上为正）。
 * 死区里是 (0, 0)；死区外长度 = (m − dead) / (1 − dead)，方向不变；超出圆盘的按边算（长度 1）。
 */
export function joyVector(dx, dy, r = JOY_SIZE / 2, dead = JOY_DEAD) {
  const nx = (Number(dx) || 0) / r;
  const ny = -(Number(dy) || 0) / r;
  const m = Math.hypot(nx, ny);
  if (!(m > dead) || !Number.isFinite(m)) return { x: 0, y: 0 };
  const k = Math.min(1, (m - dead) / (1 - dead)) / m;
  return { x: r3(nx * k), y: r3(ny * k) };
}

/** 圆钮画在哪（px）：跟着手指，最远 KNOB_TRAVEL */
export function knobOffset(dx, dy, travel = KNOB_TRAVEL) {
  const m = Math.hypot(dx, dy);
  if (!(m > travel)) return { x: dx || 0, y: dy || 0 };
  return { x: (dx / m) * travel, y: (dy / m) * travel };
}

export default function Joystick({ onMove, disabled = false, className = '' }) {
  const pad = useRef(null);
  const knob = useRef(null);
  const st = useRef({ id: null, cx: 0, cy: 0, r: JOY_SIZE / 2, x: 0, y: 0 });
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  const send = (x, y) => {
    const s = st.current;
    if (s.x === x && s.y === y) return;
    s.x = x;
    s.y = y;
    moveRef.current?.(x, y);
  };
  const place = (dx, dy) => {
    const k = knobOffset(dx, dy);
    if (knob.current) knob.current.style.transform = dx || dy ? `translate(${k.x.toFixed(1)}px, ${k.y.toFixed(1)}px)` : '';
  };
  const release = () => {
    const s = st.current;
    if (s.id != null) {
      try {
        pad.current?.releasePointerCapture?.(s.id);
      } catch {
        /* 已经放开了 */
      }
    }
    s.id = null;
    pad.current?.classList.remove('is-active');
    place(0, 0);
    send(0, 0);
  };

  const track = (e) => {
    const s = st.current;
    if (e.pointerId !== s.id) return;
    const dx = e.clientX - s.cx;
    const dy = e.clientY - s.cy;
    place(dx, dy);
    const v = joyVector(dx, dy, s.r);
    send(v.x, v.y);
  };
  const down = (e) => {
    const s = st.current;
    if (disabled || s.id != null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const r = pad.current.getBoundingClientRect();
    s.id = e.pointerId;
    s.cx = r.left + r.width / 2;
    s.cy = r.top + r.height / 2;
    s.r = r.width / 2 || JOY_SIZE / 2;
    try {
      pad.current.setPointerCapture?.(e.pointerId);
    } catch {
      /* 没有捕获也照样能拖（手指留在圆盘上） */
    }
    pad.current.classList.add('is-active');
    track(e);
  };
  const up = (e) => {
    if (e.pointerId === st.current.id) release();
  };

  // 藏起来（飞进 / 飞出）、卸下：一定停下来
  useEffect(() => {
    if (disabled) release();
  }, [disabled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => release(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={pad}
      className={className ? `walk-joy ${className}` : 'walk-joy'}
      aria-hidden="true"
      title={t('按住拖动来走 · 键盘 W A S D')}
      onPointerDown={down}
      onPointerMove={track}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="walk-joy-ticks" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <path d="M54 17 L60 11 L66 17 M54 103 L60 109 L66 103 M17 54 L11 60 L17 66 M103 54 L109 60 L103 66" />
      </svg>
      <span ref={knob} className="walk-joy-knob" />
    </div>
  );
}
