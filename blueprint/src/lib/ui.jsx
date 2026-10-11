// 壳层共用的界面小部件：按钮 / 输入框 class、弹窗、确认框、Esc 关闭

import React, { useEffect, useId, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';

export const cls = {
  card: 'bg-bp-card border border-bp-line rounded-2xl',
  input:
    'w-full rounded-xl border border-bp-line bg-white px-3 py-2 text-sm text-bp-ink placeholder:text-bp-faint focus:outline-none focus:border-bp-gold focus:ring-2 focus:ring-bp-gold/20',
  label: 'block text-xs font-semibold text-bp-faint',
  eyebrow: 'text-[11px] tracking-[0.3em] uppercase text-bp-eyebrow',
  btnPrimary:
    'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-bp-dark text-bp-light text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bp-gold disabled:opacity-50 disabled:cursor-not-allowed',
  btnGhost:
    'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-bp-line bg-white text-sm text-bp-muted hover:bg-bp-tint hover:text-bp-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bp-gold/50 disabled:opacity-50 disabled:cursor-not-allowed',
  btnDanger:
    'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-bp-danger text-white text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bp-danger/40 disabled:opacity-50',
  iconBtn:
    'inline-flex items-center justify-center w-8 h-8 rounded-lg text-bp-muted hover:bg-bp-tint hover:text-bp-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bp-gold/50 disabled:opacity-40 disabled:cursor-not-allowed',
};

/** Esc 关闭（只响应最上层：后打开的弹窗先收到） */
const escStack = [];
export function useEscape(onEscape, active = true) {
  const fn = useRef(onEscape);
  fn.current = onEscape;
  useEffect(() => {
    if (!active) return undefined;
    const entry = () => fn.current?.();
    escStack.push(entry);
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      if (escStack[escStack.length - 1] !== entry) return;
      e.preventDefault();
      entry();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = escStack.indexOf(entry);
      if (i >= 0) escStack.splice(i, 1);
    };
  }, [active]);
}

/**
 * 弹窗外壳：遮罩 + 卡片 + 标题栏；busy 时点遮罩 / Esc 不关闭
 * role="dialog"：编辑器的 ⌘Z 撤销不会在弹窗里触发
 */
export function Modal({ title, icon, onClose, busy = false, width = 'max-w-lg', children, footer, bodyClass = 'p-6' }) {
  const titleId = useId();
  const boxRef = useRef(null);
  useEscape(() => {
    if (!busy) onClose?.();
  });
  useEffect(() => {
    // 打开时把焦点放进弹窗（键盘用户可直接 Tab）
    const el = boxRef.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 bg-bp-ink/50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${width} bg-bp-card rounded-2xl shadow-xl flex flex-col max-h-[90vh] outline-none`}
      >
        <div className="flex items-center justify-between gap-3 px-6 h-14 border-b border-bp-line shrink-0">
          <h2 id={titleId} className="flex items-center gap-2 font-serif text-lg text-bp-ink truncate">
            {icon}
            {title}
          </h2>
          {onClose && (
            <button type="button" onClick={onClose} disabled={busy} className={cls.iconBtn} aria-label="关闭">
              <X size={18} />
            </button>
          )}
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto thin-scroll ${bodyClass}`}>{children}</div>
        {footer && <div className="flex items-center gap-2 px-6 py-4 border-t border-bp-line shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

/** 确认框：危险操作（删除）用 danger */
export function ConfirmDialog({ title, children, confirmText = '确定', cancelText = '取消', danger = false, busy = false, onConfirm, onCancel }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      busy={busy}
      width="max-w-md"
      footer={
        <>
          <div className="flex-1" />
          <button type="button" onClick={onCancel} disabled={busy} className={cls.btnGhost}>
            {cancelText}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={danger ? cls.btnDanger : cls.btnPrimary} autoFocus>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {confirmText}
          </button>
        </>
      }
    >
      <div className="text-sm text-bp-muted leading-relaxed space-y-2">{children}</div>
    </Modal>
  );
}

/** 细进度条（0–1） */
export function ProgressBar({ value = 0, className = '' }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`h-2 rounded-full bg-bp-tint border border-bp-line overflow-hidden ${className}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-bp-gold transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}
