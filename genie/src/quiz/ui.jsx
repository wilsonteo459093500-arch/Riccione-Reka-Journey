// 许愿之旅的小零件：梦想家卡牌的牌框（印刷卡：纸纹、金色细线、压印的罗马数字）、iOS 分段控件、滑杆。

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

/** 滑杆：大数字 + 干净的圆形拇指；已经走过的一段是苔绿色 */
export function Slider({ min, max, step = 1, value, onChange, unit = '', label, format = (n) => Number(n).toLocaleString('en-US') }) {
  const p = ((value - min) / (max - min || 1)) * 100;
  return (
    <div className="slider">
      <div className="slider-val" aria-hidden="true">
        <b>{format(value)}</b>
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
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
