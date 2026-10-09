// 模板的自动统计 / 结论（如质检合格数、场前审核 GO / NO-GO 建议）
import { L } from '../templates/schema.js';

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

export default function SummaryCard({ summary }) {
  if (!summary) return null;
  const items = summary.items || [];
  const c = summary.conclusion;
  return (
    <div className="card p-3.5">
      <div className="mb-2.5 flex items-baseline gap-2">
        <div className="text-[15px] font-bold text-ink">{L(summary.title, 'zh') || '统计'}</div>
        <div className="text-[11px] text-ink-mute">{summary.title?.en || 'Summary'}</div>
        <div className="ml-auto text-[11px] text-ink-faint">自动计算</div>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <div key={i} className={`rounded-lg px-2.5 py-1.5 text-[13px] ${TONE[it.tone] || TONE.neutral}`}>
              <span className="font-semibold">{L(it.label, 'zh')}</span> <span>{it.value}</span>
            </div>
          ))}
        </div>
      )}
      {c && (
        <div className={`mt-3 rounded-xl px-3.5 py-3 ${BOX[c.tone] || BOX.neutral}`}>
          <div className="text-[12px] opacity-80">{L(c.label, 'zh')}</div>
          <div className="text-[17px] font-bold leading-snug">{typeof c.value === 'string' ? c.value : L(c.value)}</div>
          {c.note && <div className="mt-1 text-[12px] leading-relaxed opacity-90">{typeof c.note === 'string' ? c.note : L(c.note, 'zh')}</div>}
        </div>
      )}
    </div>
  );
}
