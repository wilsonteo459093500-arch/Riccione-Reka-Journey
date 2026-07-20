import { useState } from 'react';
import { PlusCircle, Trash2, CalendarDays } from 'lucide-react';
import { T } from '../../theme.js';
import { toISODate } from '../../utils/helpers.js';
import { presentationLimit, nextPresentationDate } from '../../constants/design.js';
import { LabeledInput } from '../ui/Inputs.jsx';
import { useConfirm } from '../ui/UIProvider.jsx';

const OUTCOMES = [
  { code: 'pending', label: '待进行 Pending' },
  { code: 'presented', label: '已演示 Presented' },
  { code: 'revision', label: '需修改 Revision' },
  { code: 'approved', label: '通过 Approved' },
];

export default function DesignPresentationsList({ project, onAdd, onUpdate, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const confirm = useConfirm();

  const df = project.designFlow;
  if (!df) return null;
  const presentations = (df.presentations || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const limit = presentationLimit(project.quotationAmount);
  const remaining = limit - presentations.length;
  const next = nextPresentationDate(df);
  const todayStr = toISODate(new Date());

  const submit = () => {
    if (!date) return;
    onAdd({ date, notes });
    setDate('');
    setNotes('');
    setAdding(false);
  };

  const handleRemove = async (pres) => {
    if (await confirm({ title: '移除演示记录', message: `确定移除 ${pres.date} 的演示记录?`, danger: true, confirmText: '移除' })) {
      onRemove(pres.id);
    }
  };

  return (
    <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
      <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest" style={{ color: T.inkSoft }}>Client Presentations</div>
          <div className="font-display text-base" style={{ color: T.ink }}>客户演示</div>
          <div className="text-[11px] mt-0.5" style={{ color: T.inkSoft }}>
            已用 <span className="font-mono" style={{ color: T.ink }}>{presentations.length}</span> / {limit} 次
            <span className="ml-2 opacity-70">（按报价区间分配 · 此项目额度 {limit} 次）</span>
          </div>
        </div>
        {remaining > 0 && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs flex items-center gap-1.5 px-3 py-1.5"
            style={{ background: T.cream, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
          >
            <PlusCircle size={13} />新增演示日期
          </button>
        )}
      </div>

      {presentations.length === 0 && !adding && (
        <div className="text-center py-4 text-xs" style={{ color: T.inkSoft, opacity: 0.7 }}>
          📅 还未安排客户演示。安排后, 内部审查截止日期会自动倒推 (≥2 wd 前)。
        </div>
      )}

      {presentations.length > 0 && (
        <div className="space-y-1.5">
          {presentations.map((p, i) => {
            const isPast = p.date < todayStr;
            const isNext = p.date === next;
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs"
                style={{
                  background: isNext ? 'rgba(92,122,74,0.07)' : isPast ? T.cream : T.paper,
                  border: `1px solid ${isNext ? T.sage : T.lineSoft}`,
                  borderRadius: '2px',
                }}
              >
                <span
                  className="flex items-center justify-center font-mono text-[10px] flex-shrink-0"
                  style={{ width: 22, height: 22, borderRadius: '50%', background: T.wood, color: T.paper, fontWeight: 600 }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium" style={{ color: T.ink }}>
                      {new Date(p.date).toLocaleDateString('zh-CN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {isNext && <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: T.sage }}>next</span>}
                    {isPast && <span className="text-[9px] uppercase tracking-widest" style={{ color: T.inkSoft }}>past</span>}
                  </div>
                  {p.notes && <div className="text-[10px] italic line-clamp-1" style={{ color: T.inkSoft }}>{p.notes}</div>}
                </div>
                <select
                  value={p.outcome || 'pending'}
                  onChange={(e) => onUpdate(p.id, { outcome: e.target.value })}
                  className="px-1.5 py-1 text-[10px] outline-none"
                  style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
                  title="演示结果 Outcome"
                >
                  {OUTCOMES.map((o) => (
                    <option key={o.code} value={o.code}>{o.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleRemove(p)}
                  className="opacity-40 hover:opacity-100 flex-shrink-0"
                  style={{ color: T.terra }}
                  title="移除"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <div className="mt-2 p-3 space-y-2" style={{ background: T.cream, borderRadius: '2px', border: `1px solid ${T.line}` }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <LabeledInput label="演示日期 Date" type="date" value={date} onChange={setDate} />
            <LabeledInput label="备注 (可选)" value={notes} onChange={setNotes} placeholder="例: 第一轮, 修订厨房" />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => { setAdding(false); setDate(''); setNotes(''); }}
              className="text-xs px-2 py-1"
              style={{ color: T.inkSoft }}
            >
              取消
            </button>
            <button
              onClick={submit}
              disabled={!date}
              className="text-xs px-3 py-1 font-medium"
              style={{ background: date ? T.ink : T.line, color: T.paper, borderRadius: '2px' }}
            >
              新增
            </button>
          </div>
        </div>
      )}

      {remaining <= 0 && (
        <p className="text-[10px] mt-2" style={{ color: T.inkSoft, opacity: 0.7 }}>
          已达此报价区间的 {limit} 次演示上限 (Reached presentation cap for this quotation tier).
        </p>
      )}
    </div>
  );
}
