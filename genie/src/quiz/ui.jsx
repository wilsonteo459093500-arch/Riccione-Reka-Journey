// 许愿之旅的小零件：梦想家卡牌的牌框（印刷卡：纸纹、金色细线、压印的罗马数字）、iOS 分段控件、滑杆、会滚的数字。

import { useEffect, useLayoutEffect, useRef } from 'react';
import fx from '../shared/fx.js';
import { sfx } from '../shared/sfx.js';
import { isEn } from '../shared/i18n.js';

/** 卡牌正面。num = 罗马数字（压印），foot = 底部一行小字（中文模式写英文，英文模式写中文 = 精致的第二语言） */
export function CardFrame({ num, foot, className = '', as: As = 'div', children, ...rest }) {
  return (
    <As className={`dcard dcard-front ${className}`} {...rest}>
      <span className="dcard-line" aria-hidden="true" />
      <span className="dcard-corners" aria-hidden="true" />
      {num && <span className="dcard-num">{num}</span>}
      <div className="dcard-body">{children}</div>
      {foot && (
        <span className="dcard-foot" lang={isEn() ? 'zh-Hans' : 'en'}>
          {foot}
        </span>
      )}
    </As>
  );
}

/** 卡牌背面：苔绿底 + 金线溪纹 + 中间一枚银杏叶 */
export function CardBack({ className = '' }) {
  return (
    <div className={`dcard dcard-back ${className}`} aria-hidden="true">
      <span className="dcard-line" />
      <svg className="dcard-medal" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="44" />
        <circle cx="60" cy="60" r="39" opacity=".55" />
        <path d="M60 84 V 66" />
        <path d="M60 66 C 44 66 34 54 36 42 C 44 46 52 45 60 39 C 68 45 76 46 84 42 C 86 54 76 66 60 66 Z" />
        <path d="M60 41 V 64 M52 47 L 58 62 M68 47 L 62 62" opacity=".6" />
        <path d="M60 10 v8 M60 102 v8 M10 60 h8 M102 60 h8" />
      </svg>
      <span className="dcard-wm">WISH</span>
    </div>
  );
}

/** iOS 分段控件：一块会滑动的白色小片 */
export function Segmented({ options, value, onChange, label, className = '', size = 'md' }) {
  const i = Math.max(0, options.findIndex((o) => o.v === value));
  return (
    <div className={`seg seg-${size} ${className}`} role="radiogroup" aria-label={label} style={{ '--n': options.length, '--i': i }}>
      <span className="seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={o.v === value} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

const fmtInt = (n) => Number(n).toLocaleString('en-US');

/**
 * 会滚的数字（机械里程表：个位连续转，高位跟着进位）。第一次直接显示，之后每次 value 变就滚过去（fx.odometer）。
 * 里面的数字条由 fx 自己生成：这个元素里不放 React 子节点。读屏读最终的数（aria-label + 隐藏文字）。
 *   settle：数停下来（这么多毫秒没有再变）后响一声「数好了」（只在真的变过以后）
 */
export function Odo({ value, format = fmtInt, tick = false, settle = 0, className = '', as: As = 'span' }) {
  const ref = useRef(null);
  const opts = useRef({ format, tick });
  opts.current = { format, tick };
  const last = useRef(value);
  useLayoutEffect(() => {
    const n = Number(value);
    if (ref.current && Number.isFinite(n)) fx.odometer(ref.current, n, opts.current);
  }, [value]);
  useEffect(() => {
    // 只在数真的变了以后（开发时 StrictMode 挂载跑两次也不会多响）
    if (last.current === value) return undefined;
    last.current = value;
    if (!settle) return undefined;
    const id = setTimeout(() => sfx.play('tickEnd'), settle);
    return () => clearTimeout(id);
  }, [value, settle]);
  return <As ref={ref} className={`odo ${className}`} />;
}

/**
 * 滑杆：大数字（会滚）+ 干净的圆形拇指；已经走过的一段是苔绿色。
 *   onHold(true / false)：手指按在滑杆上 / 放开（拖动中，画出来的柜子安静地变，声音交给滑杆自己的刻度声）
 */
export function Slider({ min, max, step = 1, value, onChange, unit = '', label, format = fmtInt, onHold }) {
  const p = ((value - min) / (max - min || 1)) * 100;
  const holdRef = useRef(onHold);
  holdRef.current = onHold;
  const off = useRef(null);
  useEffect(() => () => off.current?.(), []);
  const down = () => {
    if (!holdRef.current || off.current) return;
    holdRef.current(true);
    // 放开的那一下可能在滑杆外面（手指拖出去了）：在整页上等
    const up = () => {
      off.current?.();
      holdRef.current?.(false);
    };
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    off.current = () => {
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      off.current = null;
    };
  };
  return (
    <div className="slider">
      <div className="slider-val" aria-hidden="true">
        {/* 滑杆自己每一格就有声音（sfx 的 slider 刻度声）：数字只滚，不再「嗒」 */}
        <Odo as="b" value={value} format={format} />
        {unit && <span>{unit}</span>}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ '--p': `${p}%` }}
        onPointerDown={onHold ? down : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
