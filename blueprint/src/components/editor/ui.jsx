// 编辑器共用的样式与小部件（与 UKIR STUDIO 同一套圆角卡片 / 按钮风格）
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useDismiss } from './hooks.js';

export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-bp-dark text-bp-light text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-bp-line bg-white text-xs text-bp-muted hover:bg-bp-tint hover:text-bp-ink disabled:opacity-50 disabled:cursor-not-allowed';
export const btnIcon =
  'inline-flex items-center justify-center w-7 h-7 rounded-lg text-bp-muted hover:bg-bp-tint hover:text-bp-ink disabled:opacity-40 disabled:cursor-not-allowed';
export const inputCls =
  'w-full rounded-lg border border-bp-line bg-white px-2.5 py-1.5 text-sm text-bp-ink placeholder:text-bp-faint focus:outline-none focus:border-bp-gold focus:ring-2 focus:ring-bp-gold/20';
export const card = 'bg-bp-card border border-bp-line rounded-2xl';

/** 检查器里的一组 */
export function Section({ title, icon: Icon, right, children, className = '' }) {
  return (
    <section className={`${card} p-3.5 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-bp-faint tracking-wide">
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {title}
          </h4>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** 带标签的一行 */
export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="block text-[11px] font-semibold text-bp-faint mb-1">{label}</span>}
      {children}
      {hint && <span className="block text-[11px] text-bp-faint mt-1 leading-snug">{hint}</span>}
    </label>
  );
}

/** 分段选择 */
export function Segmented({ options, value, onChange, size = 'sm', className = '' }) {
  return (
    <div className={`inline-flex p-0.5 rounded-xl bg-bp-tint border border-bp-line ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`${size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'} rounded-lg transition-colors whitespace-nowrap ${
              active ? 'bg-bp-dark text-bp-light shadow-sm' : 'text-bp-muted hover:text-bp-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 开关 */
export function Toggle({ checked, onChange, label, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-xs text-bp-muted hover:text-bp-ink"
    >
      <span className={`relative w-8 h-[18px] rounded-full transition-colors ${checked ? 'bg-bp-dark' : 'bg-bp-line'}`}>
        <span
          className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${checked ? 'left-[16px]' : 'left-[2px]'}`}
        />
      </span>
      {label}
    </button>
  );
}

/** 下拉菜单：items = [{ label, icon, onClick, disabled, danger, hint }] | 'sep' */
export function Menu({ label, icon: Icon, items, align = 'right', buttonClass = btnGhost, title, width = 'w-56' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button type="button" className={buttonClass} title={title} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
        {label && <ChevronDown className="w-3 h-3 opacity-60" />}
      </button>
      {open && (
        <MenuList
          items={items}
          className={`absolute z-30 mt-1 ${align === 'right' ? 'right-0' : 'left-0'} ${width}`}
          onDone={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export function MenuList({ items, className = '', onDone }) {
  return (
    <div className={`${card} shadow-xl py-1 ${className}`} role="menu">
      {items.filter(Boolean).map((it, i) =>
        it === 'sep' ? (
          <div key={i} className="my-1 border-t border-bp-line" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            title={it.title}
            onClick={(e) => {
              e.stopPropagation();
              onDone?.();
              it.onClick?.();
            }}
            className={`w-full flex items-start gap-2 px-3 py-1.5 text-left text-xs disabled:opacity-40 disabled:cursor-not-allowed ${
              it.danger ? 'text-bp-danger hover:bg-red-50' : 'text-bp-ink hover:bg-bp-tint'
            }`}
          >
            {it.icon && <it.icon className="w-3.5 h-3.5 mt-px shrink-0 opacity-70" />}
            <span className="min-w-0">
              <span className="block">{it.label}</span>
              {it.hint && <span className="block text-[10px] text-bp-faint leading-snug">{it.hint}</span>}
            </span>
          </button>
        )
      )}
    </div>
  );
}

/** 页面里在滚动的祖先（量高度时先记下滚动位置，量完放回去 —— 不然框瞬间变 0 高会让检查器跳一下） */
function scrollPositions(el) {
  const out = [];
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.scrollTop > 0) out.push([p, p.scrollTop]);
  }
  const se = document.scrollingElement;
  if (se?.scrollTop > 0) out.push([se, se.scrollTop]);
  return out;
}

/**
 * 自动长高的多行输入：按内容量出真实高度（scrollHeight）—— 检查器再窄，字也不会藏在框外（中文、英文框都一样）。
 * 内容或宽度变了才重新量；标签页隐藏时量不到（高度是 0），等显示出来（ResizeObserver）再量；量到之前先按「每行 34 字」估行数。
 * 超过 maxRows 行才在框里滚动。
 */
export function AutoTextarea({ value, onChange, minRows = 1, maxRows = 30, className = '', ...rest }) {
  const ref = useRef(null);
  const lines = String(value ?? '').split('\n').length;
  const rows = Math.max(minRows, Math.min(maxRows, lines + (String(value ?? '').length > 34 * lines ? 1 : 0)));
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el || !el.offsetParent) return;
    const key = `${el.clientWidth}|${minRows}|${el.value}`;
    if (el.dataset.fit === key) return;
    const saved = scrollPositions(el);
    const cs = window.getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || 20;
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    el.style.height = '0px';
    const content = el.scrollHeight; // 含上下内边距
    const max = maxRows * lh + pad;
    el.style.height = `${Math.ceil(Math.min(Math.max(content, minRows * lh + pad), max) + border)}px`;
    el.style.overflowY = content > max + 1 ? 'auto' : 'hidden';
    el.dataset.fit = key;
    for (const [p, top] of saved) p.scrollTop = top;
  }, [minRows, maxRows]);
  useLayoutEffect(fit);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);
  return (
    <textarea
      {...rest}
      ref={ref}
      rows={rows}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} resize-none leading-relaxed ${className}`}
    />
  );
}
