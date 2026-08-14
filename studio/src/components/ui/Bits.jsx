import React, { useState } from 'react';
import { Check, Copy, Download, Loader2 } from 'lucide-react';
import { copyText, downloadText } from '../../services/media.js';

export function Card({ title, sub, right, children, className = '' }) {
  return (
    <section className={`bg-sail-card border border-sail-line rounded-2xl ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            {title && <h2 className="font-display text-lg font-semibold text-sail-ink leading-tight">{title}</h2>}
            {sub && <p className="text-xs text-sail-faint mt-0.5 leading-relaxed">{sub}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

export function Btn({ children, variant = 'primary', size = 'md', busy, icon: Icon, className = '', ...rest }) {
  const variants = {
    primary: 'bg-sail-green-deep text-white hover:bg-sail-green disabled:opacity-50',
    ghost: 'border border-sail-line text-sail-muted hover:bg-sail-tint disabled:opacity-50',
    soft: 'bg-sail-tint border border-sail-line text-sail-ink hover:bg-sail-line/60 disabled:opacity-50',
    danger: 'border border-sail-danger/40 text-sail-danger hover:bg-sail-danger/10 disabled:opacity-50',
  };
  const sizes = { sm: 'px-2.5 py-1.5 text-xs gap-1', md: 'px-4 py-2.5 text-sm gap-2' };
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl font-medium transition-colors ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={busy || rest.disabled}
      {...rest}
    >
      {busy ? <Loader2 size={size === 'sm' ? 13 : 16} className="animate-spin" /> : Icon ? <Icon size={size === 'sm' ? 13 : 16} /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-sail-faint">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-sail-faint mt-1 leading-relaxed">{hint}</span>}
    </label>
  );
}

const inputBase =
  'mt-1 w-full rounded-xl border border-sail-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-sail-green';

export function TextInput(props) {
  return <input {...props} className={`${inputBase} ${props.className || ''}`} />;
}

export function TextArea(props) {
  return <textarea {...props} className={`${inputBase} resize-y leading-relaxed ${props.className || ''}`} />;
}

export function Select({ options, value, onChange, ...rest }) {
  return (
    <select value={value} onChange={onChange} className={inputBase} {...rest}>
      {options.map((o) => (
        <option key={o.id ?? o.value} value={o.id ?? o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** 一行可横滑的选择胶囊 */
export function ChipRow({ options, value, onChange, multi = false }) {
  const active = (id) => (multi ? (value || []).includes(id) : value === id);
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => {
            if (!multi) return onChange(o.id);
            const set = new Set(value || []);
            set.has(o.id) ? set.delete(o.id) : set.add(o.id);
            onChange([...set]);
          }}
          title={o.desc || o.hint || ''}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            active(o.id)
              ? 'bg-sail-green-deep text-white border-sail-green-deep'
              : 'bg-white text-sail-muted border-sail-line hover:bg-sail-tint'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tag({ children, color }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold"
      style={{ background: `${color || '#6B6358'}18`, color: color || '#6B6358' }}
    >
      {children}
    </span>
  );
}

export function CopyBtn({ text, label = '复制', size = 'sm' }) {
  const [done, setDone] = useState(false);
  return (
    <Btn
      variant="ghost"
      size={size}
      icon={done ? Check : Copy}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        }
      }}
    >
      {done ? '已复制' : label}
    </Btn>
  );
}

export function DownloadBtn({ filename, text, mime, label = '下载', size = 'sm' }) {
  return (
    <Btn variant="ghost" size={size} icon={Download} onClick={() => downloadText(filename, text, mime)}>
      {label}
    </Btn>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="text-center py-14 px-6">
      {Icon && <Icon size={30} className="mx-auto text-sail-faint mb-3" strokeWidth={1.5} />}
      <p className="font-medium text-sail-muted">{title}</p>
      {children && <div className="text-sm text-sail-faint mt-2 max-w-md mx-auto leading-relaxed">{children}</div>}
    </div>
  );
}

export function Progress({ value, note }) {
  return (
    <div className="space-y-1.5">
      <div className="h-1.5 rounded-full bg-sail-line overflow-hidden">
        <div
          className="h-full bg-sail-green transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(3, value || 0))}%` }}
        />
      </div>
      {note && <p className="text-xs text-sail-faint">{note}</p>}
    </div>
  );
}

/** 折叠区块 —— 长报告用它收起来 */
export function Fold({ title, count, children, open: initial = false }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="border border-sail-line rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-sail-ink hover:bg-sail-tint"
      >
        <span>
          {title}
          {count != null && <span className="text-sail-faint font-normal ml-1.5">{count}</span>}
        </span>
        <span className="text-sail-faint text-xs">{open ? '收起' : '展开'}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-sail-line">{children}</div>}
    </div>
  );
}
