import { T } from '../../theme.js';

export function SafetyDot({ active, label, Icon }) {
  return (
    <div
      title={`${label}: ${active ? '已关闭' : '未确认'}`}
      className="flex items-center justify-center"
      style={{ width: 22, height: 22, borderRadius: '50%', background: active ? T.sage : T.lineSoft, color: active ? T.paper : T.inkSoft }}
    >
      <Icon size={11} strokeWidth={2} />
    </div>
  );
}

export function SafetyToggle({ label, value, onChange, Icon }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="p-3 flex flex-col items-center gap-1.5 transition-all"
      style={{ background: value ? T.sage : T.paper, color: value ? T.paper : T.inkSoft, border: `1px solid ${value ? T.sage : T.line}`, borderRadius: '2px' }}
    >
      <Icon size={20} strokeWidth={1.5} />
      <div className="text-xs">{label}</div>
      <div className="text-[10px] opacity-80">{value ? '✓ 已确认' : '○ 未确认'}</div>
    </button>
  );
}
