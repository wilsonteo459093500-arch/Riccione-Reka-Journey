import React, { useState, useEffect } from 'react';
import { Check, Copy, X, AlertTriangle, Lock } from 'lucide-react';
import { copyText } from '../utils.js';

// ---------------- 基础容器 ----------------
export function Card({ children, className = '' }) {
  return <div className={`bg-white border border-pumm-line rounded-lg p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ children, right }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <h2 className="font-display text-lg font-semibold text-pumm-ink">{children}</h2>
      {right}
    </div>
  );
}

export function Hint({ children }) {
  return <p className="text-xs text-pumm-muted leading-relaxed">{children}</p>;
}

export function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="text-center py-12 px-6">
      {Icon && <Icon className="w-8 h-8 text-pumm-faint mx-auto mb-3" />}
      <p className="font-display text-base text-pumm-ink font-semibold">{title}</p>
      {hint && <p className="text-sm text-pumm-muted mt-1.5 max-w-md mx-auto leading-relaxed">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------------- 表单 ----------------
// inputBase 不带宽度 —— 要放进 flex 行里、自己指定 w-32 之类的窄控件用这个。
// （直接在 inputCls 后面加 w-32 是没用的：两条都是 width 工具类，Tailwind
// 生成的 CSS 里 w-full 排在后面，会盖掉 w-32。）
export const inputBase =
  'bg-pumm-tint border border-pumm-line rounded-md px-3 py-2 text-sm text-pumm-ink ' +
  'placeholder:text-pumm-faint focus:outline-none focus:border-pumm-brand focus:bg-white transition-colors';

export const inputCls = `w-full ${inputBase}`;

export function Field({ label, children, hint, required }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-pumm-muted font-semibold mb-1 block">
        {label}{required && <span className="text-pumm-danger ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-pumm-faint mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

// ---------------- 按钮 ----------------
const BTN_BASE = 'inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const BTN_SIZE = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' };
const BTN_TONE = {
  primary: 'bg-pumm-brand hover:bg-pumm-brand-deep text-white',
  brass:   'bg-pumm-brass hover:bg-[#9A7A42] text-white',
  ghost:   'bg-white hover:bg-pumm-tint border border-pumm-line text-pumm-ink',
  ok:      'bg-pumm-ok hover:bg-[#356748] text-white',
  danger:  'bg-white hover:bg-red-50 border border-pumm-danger/40 text-pumm-danger',
};

export function Button({ children, tone = 'ghost', size = 'md', icon: Icon, className = '', ...rest }) {
  return (
    <button type="button" className={`${BTN_BASE} ${BTN_SIZE[size]} ${BTN_TONE[tone]} ${className}`} {...rest}>
      {Icon && <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}
      {children}
    </button>
  );
}

// ---------------- 徽章 ----------------
export function Badge({ children, color = '#7C8087', solid }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
      style={solid ? { background: color, color: '#fff' } : { background: `${color}1F`, color }}
    >
      {children}
    </span>
  );
}

// ---------------- 复制按钮（提醒文案一键带走） ----------------
export function CopyButton({ text, label = '复制', size = 'sm', tone = 'ghost' }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <Button
      size={size}
      tone={tone}
      icon={done ? Check : Copy}
      onClick={async () => { if (await copyText(text)) setDone(true); }}
    >
      {done ? '已复制' : label}
    </Button>
  );
}

// ---------------- 弹窗 ----------------
export function Modal({ title, subtitle, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className={`bg-white w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} sm:rounded-xl rounded-t-2xl shadow-xl max-h-[92vh] flex flex-col`}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-pumm-line">
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold text-pumm-ink">{title}</h3>
            {subtitle && <p className="text-xs text-pumm-muted mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1 -m-1 text-pumm-faint hover:text-pumm-ink" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto scrollbar-thin flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-pumm-line flex items-center justify-end gap-2 safe-bottom">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------- 提示条 ----------------
export function Notice({ tone = 'warn', title, children, icon: Icon = AlertTriangle }) {
  const tones = {
    warn:   'bg-amber-50 border-pumm-warn/30 text-[#7A5321]',
    danger: 'bg-red-50 border-pumm-danger/30 text-[#7A2E22]',
    info:   'bg-pumm-tint border-pumm-line text-pumm-muted',
    ok:     'bg-emerald-50 border-pumm-ok/30 text-[#2C5A41]',
  };
  return (
    <div className={`border rounded-md px-3 py-2.5 text-xs leading-relaxed ${tones[tone]}`}>
      <div className="flex gap-2">
        <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          {title && <div className="font-semibold mb-0.5">{title}</div>}
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------- 权限墙 ----------------
// 规格第 5 节：不是技术偏好，是信任设计。看不到就是看不到，
// 而且要让人知道「这是设计好的」，不是系统坏了。
export function PermissionWall({ what = '这一页' }) {
  return (
    <EmptyState
      icon={Lock}
      title={`你的角色看不到${what}`}
      hint="会员敢不敢在桌上讲真问题，取决于内容不会外流。案例正文只有桌长与记录员看得到 —— 这是桌规，不是系统故障。"
    />
  );
}

// ---------------- KPI ----------------
export function StatCard({ label, value, sub, target, ok, formula }) {
  return (
    <div className="bg-white border border-pumm-line rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] text-pumm-muted uppercase tracking-wider font-semibold">{label}</span>
        {target && (
          <Badge color={ok ? '#3F7D5C' : '#C0843A'}>{ok ? '达标' : `目标 ${target}`}</Badge>
        )}
      </div>
      <div className="font-display text-3xl font-semibold text-pumm-ink leading-none mb-1">{value}</div>
      <div className="text-xs text-pumm-muted">{sub}</div>
      {formula && <div className="text-[10px] text-pumm-faint mt-1.5 font-mono">{formula}</div>}
    </div>
  );
}
