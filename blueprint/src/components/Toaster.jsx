// 轻提示：notify({ type:'ok'|'warn'|'error', text }) —— 右下角堆叠，自动消失，点一下关闭

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';

const MAX = 4;
const LIFE = { ok: 3500, warn: 6000, error: 8000 };

/** App 层用：返回 { toasts, notify, dismiss }，notify 引用稳定 */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);
  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const notify = useCallback(({ type = 'ok', text } = {}) => {
    if (!text) return;
    seq.current += 1;
    const id = seq.current;
    setToasts((list) => {
      // 同一句话连续弹出时只留一条（刷新计时）
      const rest = list.filter((t) => !(t.text === text && t.type === type));
      return [...rest, { id, type, text }].slice(-MAX);
    });
  }, []);
  return { toasts, notify, dismiss };
}

const STYLE = {
  ok: { icon: CheckCircle2, cls: 'bg-bp-dark text-bp-light', iconCls: 'text-bp-gold' },
  warn: { icon: AlertTriangle, cls: 'bg-[#3A2A14] text-bp-light', iconCls: 'text-bp-warn' },
  error: { icon: XCircle, cls: 'bg-bp-danger text-white', iconCls: 'text-white' },
};

function Toast({ toast, onDismiss }) {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (hover) return undefined;
    const t = setTimeout(() => onDismiss(toast.id), LIFE[toast.type] || LIFE.ok);
    return () => clearTimeout(t);
  }, [toast.id, toast.type, hover, onDismiss]);
  const s = STYLE[toast.type] || STYLE.ok;
  const Icon = s.icon;
  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`pointer-events-auto flex items-start gap-2.5 max-w-sm rounded-xl shadow-lg px-4 py-3 text-sm leading-snug ${s.cls}`}
    >
      <Icon size={17} className={`mt-px shrink-0 ${s.iconCls}`} />
      <span className="flex-1 whitespace-pre-line">{toast.text}</span>
      <button type="button" onClick={() => onDismiss(toast.id)} className="shrink-0 -mr-1 p-0.5 rounded opacity-60 hover:opacity-100" aria-label="关闭提示">
        <X size={14} />
      </button>
    </div>
  );
}

export default function Toaster({ toasts, onDismiss }) {
  return (
    <div className="fixed z-[60] bottom-5 right-5 left-5 sm:left-auto flex flex-col items-end gap-2 pointer-events-none" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
