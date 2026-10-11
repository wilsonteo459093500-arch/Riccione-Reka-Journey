// 文件语言选择：中文 / English / 中英（导出页按报告选，设置页选默认）
import Icon from './ui/Icon.jsx';
import { LANGS } from '../lib/lang.js';

export default function LangPicker({ value, onChange, title = '文件语言', hint }) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        <Icon name="Languages" size={18} className="shrink-0 text-pine" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink">{title}</div>
          {hint && <div className="text-[12px] leading-snug text-ink-mute">{hint}</div>}
        </div>
        <div className="flex shrink-0 rounded-xl bg-cream-deep p-1" role="radiogroup" aria-label={title}>
          {LANGS.map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={value === o.v}
              className={`rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition ${
                value === o.v ? 'bg-white text-ink shadow-sm' : 'text-ink-mute'
              }`}
              onClick={() => onChange(o.v)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
