// 模板的自动统计 / 结论（如质检合格数、场前审核 GO / NO-GO 建议）
// App 里的卡片跟界面语言：调用方用界面语言的 ctx 算 template.summary（makeCtx({ …, lang: getUiLang() })），
// 这里的标签用 uiLabel / uiText 取字（文件里的统计块另由文档模型按文件语言生成）
import { t, uiLabel, uiText, tidyCaps } from '../lib/i18n.js';

const TONE = {
  pass: 'bg-pass/10 text-pass',
  fail: 'bg-fail/10 text-fail',
  warn: 'bg-[#C98A1B]/10 text-[#9A6A12]',
  na: 'bg-ink-faint/15 text-ink-mute',
  neutral: 'bg-cream-deep text-ink-soft',
};
const BOX = {
  pass: 'bg-pass text-white',
  fail: 'bg-fail text-white',
  warn: 'bg-[#C98A1B] text-white',
  na: 'bg-ink-mute text-white',
  neutral: 'bg-pine text-white',
};
const FALLBACK_TITLE = { zh: '统计', en: 'Summary' };

// 标签一行：中英时「中文 English」；中文里已带英文（如「登记 Punch」/ Punch）就不重复
function textOf(v) {
  if (v == null) return '';
  if (typeof v !== 'object') return String(v);
  const { primary, secondary } = uiLabel(v);
  return tidyCaps(secondary && !primary.includes(secondary) ? uiText(v) : primary);
}

export default function SummaryCard({ summary }) {
  if (!summary) return null;
  const items = summary.items || [];
  const c = summary.conclusion;
  const own = uiLabel(summary.title);
  const title = own.primary ? own : uiLabel(FALLBACK_TITLE);
  return (
    <div className="card p-3.5">
      <div className="mb-2.5 flex items-baseline gap-2">
        <div className="text-[15px] font-bold text-ink">{title.primary}</div>
        {title.secondary && <div className="text-[11px] text-ink-mute">{title.secondary}</div>}
        <div className="ml-auto text-right text-[11px] text-ink-faint">{t('自动计算', 'Auto-calculated')}</div>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <div key={i} className={`rounded-lg px-2.5 py-1.5 text-[13px] ${TONE[it.tone] || TONE.neutral}`}>
              <span className="font-semibold">{textOf(it.label)}</span> <span>{it.value}</span>
            </div>
          ))}
        </div>
      )}
      {c && (
        <div className={`mt-3 rounded-xl px-3.5 py-3 ${BOX[c.tone] || BOX.neutral}`}>
          <div className="text-[12px] opacity-80">{textOf(c.label)}</div>
          <div className="text-[17px] font-bold leading-snug">{textOf(c.value)}</div>
          {c.note && <div className="mt-1 text-[12px] leading-relaxed opacity-90">{textOf(c.note)}</div>}
        </div>
      )}
    </div>
  );
}
