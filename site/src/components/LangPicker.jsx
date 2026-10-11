// 文件语言选择：中文 / English / 中英（导出页按报告选，设置页选默认）
// 标题 / 说明由调用方按界面语言传进来；三个选项是语言自称（中文 / English / 中英），不随界面语言变
import Icon from './ui/Icon.jsx';
import { LANGS } from '../lib/lang.js';
import { t, getUiLang } from '../lib/i18n.js';

export default function LangPicker({ value, onChange, title, hint }) {
  const heading = title || t('文件语言', 'Document language');
  // 英文 / 中英的标题和说明较长：选项挪到下一行（整行三等分），中文照旧放右边
  const stacked = getUiLang() !== 'zh';
  const options = (
    <div
      className={`flex rounded-xl bg-cream-deep p-1 ${stacked ? 'mt-2.5 w-full' : 'shrink-0'}`}
      role="radiogroup"
      aria-label={heading}
      data-lang-switch
    >
      {LANGS.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          className={`rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition ${stacked ? 'flex-1' : ''} ${
            value === o.v ? 'bg-white text-ink shadow-sm' : 'text-ink-mute'
          }`}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        <Icon name="Languages" size={18} className="shrink-0 text-pine" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink">{heading}</div>
          {hint && <div className="whitespace-pre-line text-[12px] leading-snug text-ink-mute">{hint}</div>}
        </div>
        {!stacked && options}
      </div>
      {stacked && options}
    </div>
  );
}
