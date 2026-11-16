import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { initials, tierOf, worthVerdict } from '../lib/logic.js';
import { useStore } from '../lib/store.jsx';

export function cx(...a) { return a.filter(Boolean).join(' '); }

export function Button({ variant = 'primary', size = 'md', className, busy, children, ...rest }) {
  const v = {
    primary: 'bg-ink text-white hover:bg-ink/90 disabled:bg-ink/40',
    accent: 'bg-plum text-white hover:bg-plum-deep disabled:bg-plum/40',
    ghost: 'bg-transparent text-ink hover:bg-ink/5',
    outline: 'bg-white text-ink border border-line hover:border-ink/30',
    danger: 'bg-white text-danger border border-danger/30 hover:bg-danger/5',
  }[variant];
  const s = { sm: 'h-8 px-3 text-sm', md: 'h-11 px-4 text-[15px]', lg: 'h-12 px-5 text-base' }[size];
  return (
    <button
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed', v, s, className)}
      disabled={busy || rest.disabled}
      {...rest}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Chip({ children, onRemove, tone = 'plain', className, ...rest }) {
  const t = {
    plain: 'bg-white border-line text-ink',
    soft: 'bg-ink/5 border-transparent text-ink',
    has: 'bg-sky-50 border-sky-200 text-sky-900',
    needs: 'bg-amber-50 border-amber-200 text-amber-900',
    give: 'bg-plum/10 border-plum/30 text-plum-deep',
    ai: 'bg-violet-50 border-violet-200 text-violet-900',
  }[tone];
  return (
    <span className={cx('inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] leading-none', t, className)} {...rest}>
      <span className="truncate">{children}</span>
      {onRemove && (
        <button type="button" aria-label="删除" onClick={onRemove} className="-mr-1 rounded-full p-0.5 opacity-50 hover:opacity-100">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function Field({ label, hint, children, className }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export const inputCls = 'w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-faint focus:border-ink/40';

export function Input(props) { return <input {...props} className={cx(inputCls, props.className)} />; }
export function Textarea(props) { return <textarea rows={3} {...props} className={cx(inputCls, 'resize-y', props.className)} />; }

export function Section({ title, action, children, className, id }) {
  return (
    <section id={id} className={cx('rounded-2xl border border-line bg-white p-4', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Sheet({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={cx('max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-paper p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="关闭" className="rounded-full p-2 hover:bg-ink/5"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 私有照片：先跟 repo 要签名网址再显示 */
export function PrivateImage({ path, alt = '', className, ...rest }) {
  const { imageUrl } = useStore();
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    if (path) imageUrl(path).then((u) => alive && setSrc(u)).catch(() => {});
    return () => { alive = false; };
  }, [path, imageUrl]);
  if (!src) return <div className={cx('animate-pulse bg-ink/5', className)} />;
  return <img src={src} alt={alt} className={className} loading="lazy" {...rest} />;
}

export function Avatar({ person, size = 48 }) {
  const photo = person.photos && (person.photos.find((p) => p.id === person.avatar_photo_id) || null);
  const tier = tierOf(person.tier);
  const style = { width: size, height: size, fontSize: size * 0.36 };
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {photo ? (
        <PrivateImage path={photo.path} className="h-full w-full rounded-full object-cover" />
      ) : (
        <div className="flex items-center justify-center rounded-full bg-ink/5 font-semibold text-ink/70" style={style}>
          {initials(person.name)}
        </div>
      )}
      <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white" style={{ background: tier.color }} title={tier.label} />
    </div>
  );
}

export function TierBadge({ tier, className }) {
  const t = tierOf(tier);
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', className)} style={{ background: `${t.color}18`, color: t.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />
      {t.label}
    </span>
  );
}

/** Sims 风的菱形「值得认识」分数 */
export function WorthGem({ score, size = 40 }) {
  const v = worthVerdict(score);
  const color = { high: '#16A34A', good: '#65A30D', mid: '#CA8A04', low: '#94A3B8', none: '#CBD5E1' }[v.tone];
  return (
    <div className="flex shrink-0 flex-col items-center" title={v.label} style={{ width: size }}>
      <svg viewBox="0 0 24 32" width={size * 0.55} height={size * 0.72} aria-hidden="true">
        <path d="M12 1 L22 12 L12 31 L2 12 Z" fill={color} />
        <path d="M12 1 L22 12 L12 14 Z" fill="#fff" opacity=".35" />
        <path d="M2 12 L12 14 L12 31 Z" fill="#000" opacity=".08" />
      </svg>
      <span className="mt-0.5 text-xs font-semibold tabular-nums" style={{ color: score == null ? '#94A3B8' : color }}>
        {score == null ? '—' : score}
      </span>
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="flex items-center gap-2 text-muted">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

/* ---------- Toast ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, tone = 'info') => {
    const id = Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), tone === 'error' ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div key={i.id} role="status" className={cx('pointer-events-auto max-w-sm rounded-xl px-4 py-2.5 text-sm shadow-lg', i.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-white')}>
            {i.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
