// 轻量 UI：Toast 提示、确认框、底部弹层、页头
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const UICtx = createContext(null);

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);

  const toast = useCallback((text, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 4500 : 2600);
  }, []);

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setDialog({
          title: '确认',
          okText: '确定',
          cancelText: '取消',
          ...(typeof opts === 'string' ? { message: opts } : opts),
          resolve,
        });
      }),
    [],
  );

  const close = (v) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <UICtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 px-4 pt-[calc(var(--safe-top)+12px)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-sm rounded-xl px-4 py-2.5 text-[14px] font-medium shadow-lg ${
              t.tone === 'error' ? 'bg-fail text-white' : t.tone === 'warn' ? 'bg-terra text-white' : 'bg-pine text-white'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
      {dialog && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => close(false)}>
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-[17px] font-bold text-ink">{dialog.title}</div>
            {dialog.message && <div className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink-soft">{dialog.message}</div>}
            <div className="mt-5 flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => close(false)}>
                {dialog.cancelText}
              </button>
              <button className={`${dialog.danger ? 'btn bg-fail text-white' : 'btn-primary'} flex-1`} onClick={() => close(true)}>
                {dialog.okText}
              </button>
            </div>
          </div>
        </div>
      )}
    </UICtx.Provider>
  );
}

export const useUI = () => useContext(UICtx);

/** 底部弹层 */
export function Sheet({ open, onClose, title, children, footer, tall = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        ref={ref}
        className={`flex w-full max-w-lg flex-col rounded-t-3xl bg-cream shadow-2xl ${tall ? 'h-[92dvh]' : 'max-h-[88dvh]'}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-3 px-5 pb-2 pt-3">
          <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-ink-faint/50" />
          <div className="flex-1 pt-2 text-[17px] font-bold text-ink">{title}</div>
          <button className="mt-2 rounded-full p-2 text-ink-mute active:bg-cream-deep" onClick={onClose} aria-label="关闭">
            <Icon name="X" size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-line bg-cream px-5 pb-safe pt-3">{footer}</div>}
      </div>
    </div>
  );
}

/** 页头：返回 + 标题 + 右侧操作 */
export function TopBar({ title, sub, onBack, right, tone = 'light' }) {
  const dark = tone === 'dark';
  return (
    <header
      className={`sticky top-0 z-40 pt-safe ${dark ? 'bg-pine text-white' : 'bg-cream/95 text-ink backdrop-blur'} ${
        dark ? '' : 'border-b border-line/70'
      }`}
    >
      <div className="mx-auto flex h-14 max-w-lg items-center gap-1 px-2">
        {onBack ? (
          <button className={`rounded-full p-2 ${dark ? 'active:bg-white/10' : 'active:bg-cream-deep'}`} onClick={onBack} aria-label="返回">
            <Icon name="ChevronLeft" size={24} />
          </button>
        ) : (
          <div className="w-2" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-bold leading-tight">{title}</div>
          {sub && <div className={`truncate text-[12px] ${dark ? 'text-white/70' : 'text-ink-mute'}`}>{sub}</div>}
        </div>
        {right}
      </div>
    </header>
  );
}

export function Spinner({ size = 18, className = '' }) {
  return <Icon name="LoaderCircle" size={size} className={`animate-spin ${className}`} />;
}

export function Empty({ icon = 'FolderOpen', title, hint, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 rounded-2xl bg-cream-deep p-4 text-ink-mute">
        <Icon name={icon} size={28} />
      </div>
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      {hint && <div className="mt-1 text-[13px] leading-relaxed text-ink-mute">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
