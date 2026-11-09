import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { T } from '../../theme.js';

// Lightweight replacement for native confirm()/alert():
//   const confirm = useConfirm(); await confirm({ title, message, danger })
//   const toast = useToast(); toast('已保存', 'success')

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);
  const [toasts, setToasts] = useState([]);

  const confirm = useCallback((opts) => {
    const config = typeof opts === 'string' ? { message: opts } : opts || {};
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialog({
        title: config.title || '请确认',
        message: config.message || '',
        confirmText: config.confirmText || '确定',
        cancelText: config.cancelText || '取消',
        danger: !!config.danger,
      });
    });
  }, []);

  const settle = useCallback((value) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setDialog(null);
  }, []);

  const toast = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  return (
    <UIContext.Provider value={{ confirm, toast }}>
      {children}

      {dialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(45, 62, 54, 0.45)', backdropFilter: 'blur(6px)' }}
          onClick={() => settle(false)}
        >
          <div
            className="w-full max-w-sm p-6 fade-up"
            style={{ background: T.paper, borderRadius: '2px', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: dialog.danger ? 'rgba(196,84,58,0.12)' : T.cream,
                }}
              >
                <AlertTriangle size={18} strokeWidth={1.5} style={{ color: dialog.danger ? T.terra : T.wood }} />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-xl mb-1" style={{ color: T.ink }}>
                  {dialog.title}
                </h3>
                {dialog.message && (
                  <p className="text-sm leading-relaxed" style={{ color: T.inkSoft }}>
                    {dialog.message}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => settle(false)}
                className="px-4 py-2 text-sm"
                style={{ background: 'transparent', color: T.inkSoft, border: `1px solid ${T.line}`, borderRadius: '2px' }}
              >
                {dialog.cancelText}
              </button>
              <button
                onClick={() => settle(true)}
                className="px-4 py-2 text-sm"
                style={{ background: dialog.danger ? T.terra : T.ink, color: T.paper, borderRadius: '2px' }}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 no-print">
        {toasts.map((t) => {
          const color = t.type === 'error' ? T.terra : t.type === 'success' ? T.sage : T.ink;
          const Icon = t.type === 'error' ? AlertTriangle : t.type === 'success' ? CheckCircle2 : Info;
          return (
            <div
              key={t.id}
              className="flex items-center gap-2 px-4 py-2.5 text-sm fade-up"
              style={{
                background: T.paper,
                color: T.ink,
                border: `1px solid ${T.line}`,
                borderLeft: `3px solid ${color}`,
                borderRadius: '2px',
                boxShadow: '0 12px 32px -12px rgba(45,62,54,0.25)',
                maxWidth: '90vw',
              }}
            >
              <Icon size={15} strokeWidth={1.5} style={{ color }} />
              <span>{t.message}</span>
              <button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="opacity-40 hover:opacity-100 ml-1"
                style={{ color: T.inkSoft }}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </UIContext.Provider>
  );
}

export function useConfirm() {
  return useContext(UIContext).confirm;
}
export function useToast() {
  return useContext(UIContext).toast;
}
