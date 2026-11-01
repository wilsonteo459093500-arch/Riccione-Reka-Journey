import React, { useRef, useState } from 'react';
import { resolveEn, memoryEn, setTranslation } from '../../engine/lang.js';
import { enDraftValue } from '../../lib/langUi.js';
import { cls } from '../../lib/ui.jsx';
import { inputCls, AutoTextarea } from './ui.jsx';

// English / 中英版的英文输入框：跟着一段中文走，写进翻译记忆（project.translations[中文]）——
// 整套共用：同一句中文只译一次，改一处，所有用到它的页一起变。
//   空着 = 用词典的自动英文（灰字提示）；词典也没有 = 缺英文（框里右侧的「缺英文」小标，可点「AI 翻译」）
//   中文本来就是英文（品牌名、编号）= 不用填
// 外观：「EN」前缀和状态小标都放在框里 —— 英文框和上面的中文框一样大、左右对齐（中英并重）。

export const EN_BADGE = {
  memory: { text: '已填', cls: 'bg-bp-gold/15 text-bp-eyebrow', title: '用的是你填的（或 AI 翻译的）英文' },
  glossary: { text: '自动', cls: 'bg-bp-green/10 text-bp-green', title: '词典自动翻译；想换说法直接在这里改' },
  missing: {
    text: '缺英文',
    cls: 'bg-bp-warn/15 text-bp-warn',
    title: '还没有英文：English 版先显示中文，中英版只显示中文 —— 在这里填，或点「页面」顶栏的「AI 翻译」',
  },
};

/** 缺英文时的占位字：短、中性（缺不缺看右侧小标） */
export const EN_PLACEHOLDER = 'English';

// 尺寸跟着上面的中文框走：xs = 检查器里的小框（部位、标签）；sm = 检查器的标准框；md = 项目信息 / 材料清单的大框
//   tag：「EN」的位置（和中文框的文字起点对齐）；pl：文字让开「EN」；top：多行时小标对齐第一行
const SIZES = {
  xs: { base: `${inputCls} !py-1 text-xs`, tag: 'left-2.5', pl: '!pl-8', tagTop: 'top-[9px]', badgeTop: 'top-[4px]' },
  sm: { base: inputCls, tag: 'left-2.5', pl: '!pl-8', tagTop: 'top-[13px]', badgeTop: 'top-[9px]' },
  md: { base: cls.input, tag: 'left-3', pl: '!pl-9', tagTop: 'top-[15px]', badgeTop: 'top-[11px]' },
};

/**
 * 英文框的外观（翻译记忆的 EnInput 和效果图页的空间英文名共用）
 * @param {{ value:string, onChange:(text:string)=>void, onBlur?:()=>void, onKeyDown?:(e)=>void, placeholder?:string,
 *   badge?:{text,cls,title}|null, size?:'xs'|'sm'|'md', multiline?:boolean, field?:string, label?:string, className?:string,
 *   inputClass?:string, ariaLabel?:string }} props
 */
export function EnBox({
  value, onChange, onBlur, onKeyDown, placeholder = EN_PLACEHOLDER, badge = null, size = 'sm', multiline = false, field, label = 'EN',
  className = '', inputClass = '', ariaLabel,
}) {
  const wrapRef = useRef(null);
  const s = SIZES[size] || SIZES.sm;
  const pr = badge ? (badge.text.length > 2 ? '!pr-[54px]' : '!pr-[44px]') : '';
  const fieldCls = `${s.pl} ${pr} ${inputClass}`;
  const tagPos = multiline ? s.tagTop : 'top-1/2 -translate-y-1/2';
  const badgePos = multiline ? s.badgeTop : 'top-1/2 -translate-y-1/2';
  const focusInput = (e) => {
    e.preventDefault();
    wrapRef.current?.querySelector('input,textarea')?.focus();
  };
  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {multiline ? (
        <AutoTextarea
          data-field={field}
          aria-label={ariaLabel}
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className={`${size === 'xs' ? '!py-1 text-xs' : ''} ${fieldCls}`}
        />
      ) : (
        <input
          data-field={field}
          aria-label={ariaLabel}
          className={`${s.base} ${fieldCls}`}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
      )}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute ${s.tag} ${tagPos} text-[9px] leading-none font-semibold tracking-[0.12em] text-bp-faint select-none`}
      >
        {label}
      </span>
      {badge && (
        <span
          title={badge.title}
          onMouseDown={focusInput}
          className={`absolute right-1.5 ${badgePos} px-1.5 py-px rounded text-[10px] leading-4 cursor-text select-none ${badge.cls}`}
        >
          {badge.text}
        </span>
      )}
    </div>
  );
}

/**
 * @param {{ project:object, zh:string, kind?:string, change:(updater:Function, opts?:object)=>void, field?:string,
 *   multiline?:boolean, className?:string, compact?:boolean, size?:'xs'|'sm'|'md', inputClass?:string, label?:string }} props
 *   kind：词典类别（room / view / role / label / note / material / team / text）
 *   field：data-field（画布点英文时定位到这里）
 *   size：和上面的中文框一样大（compact = 'xs'）；inputClass：再加的 class（如材料名的 font-serif）
 */
export default function EnInput({
  project, zh, kind = 'text', change, field, multiline = false, className = '', compact = false, size, inputClass = '', label = 'EN',
}) {
  // 打字时的原文（保留词尾空格）：翻译记忆存的是去掉首尾空格的英文，直接拿它当输入框的值会把刚打的空格吃掉。
  // 只在它和翻译记忆一致时用（撤销 / 别处改了英文 → 回到记忆里的值）；离开输入框后清掉
  const [draft, setDraft] = useState(null); // { key, text }
  const key = String(zh ?? '').trim();
  if (!key) return null;
  const r = resolveEn(project, key, kind);
  if (r.source === 'latin') return null; // 本来就是英文
  const value = enDraftValue(draft, key, memoryEn(project, key));
  const onChange = (text) => {
    setDraft({ key, text });
    change((p) => setTranslation(p, key, text));
  };
  return (
    <EnBox
      size={size || (compact ? 'xs' : 'sm')}
      multiline={multiline}
      badge={EN_BADGE[r.source] || null}
      label={label}
      className={className}
      inputClass={inputClass}
      field={field}
      value={value}
      placeholder={r.source === 'glossary' ? r.text : EN_PLACEHOLDER}
      onChange={onChange}
      onBlur={() => setDraft(null)}
      ariaLabel={`「${key}」的英文`}
    />
  );
}

/**
 * 中文本来就是英文（「Taj Mahal」「Overview」）时没有 EN 框：画布上点这段英文（字段是 …En）→ 落到这个中文框。
 * 包一层带英文字段名、能拿焦点的 div，拿到焦点就转给里面的输入框。
 * 这层 div 一直都在（on = false 时只是不带字段名、不能拿焦点）：打字时字从英文变中文（「20 隐框」「刘府」），
 * on 跟着变 —— 外层的元素不变，React 就不会把里面的输入框拆掉重建，光标和输入法都留在框里
 */
export function EnAlias({ field, on, children }) {
  return (
    <div
      data-field={on ? field : undefined}
      tabIndex={on ? -1 : undefined}
      className="outline-none rounded-lg"
      onFocus={
        on
          ? (e) => {
              if (e.target === e.currentTarget) e.currentTarget.querySelector('input,textarea,select,button')?.focus({ preventScroll: true });
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
