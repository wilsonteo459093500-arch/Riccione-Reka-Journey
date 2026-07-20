import { CheckCircle2, Clock, User, ArrowRight, RefreshCw } from 'lucide-react';
import { T } from '../../theme.js';
import { workingDaysUntil } from '../../utils/helpers.js';
import { DESIGN_STEP_MAP, DESIGN_STEPS } from '../../constants/design.js';

// Status colour: done / overdue red / due today amber / active brown / pending gray.
const stepColor = (step) => {
  if (step.status === 'done') return T.sage;
  if (step.status !== 'active') return T.line;
  const left = workingDaysUntil(step.dueDate);
  if (left === null) return T.wood;
  if (left < 0) return T.terra;
  if (left === 0) return T.gold;
  return T.wood;
};

export default function DesignStepCard({ step, onComplete, canAct }) {
  const meta = DESIGN_STEP_MAP[step.id];
  if (!meta) return null;
  const isActive = step.status === 'active';
  const isDone = step.status === 'done';
  const skipped = step.id === 'revise' && step.status === 'pending';
  const color = stepColor(step);
  const wdLeft = isActive ? workingDaysUntil(step.dueDate) : null;
  const overdue = wdLeft !== null && wdLeft < 0;
  const dueToday = wdLeft === 0;
  const idx = DESIGN_STEPS.findIndex((s) => s.id === step.id) + 1;

  return (
    <div
      className="p-3 transition-all"
      style={{
        background: isActive ? T.cream : T.paper,
        border: `1px solid ${isActive ? T.wood : T.lineSoft}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: '2px',
        opacity: skipped ? 0.55 : 1,
      }}
    >
      <div className="flex items-start gap-3 flex-wrap">
        <div
          className="flex items-center justify-center font-mono text-xs flex-shrink-0"
          style={{ width: 26, height: 26, borderRadius: '50%', background: color, color: T.paper, fontWeight: 600 }}
        >
          {isDone ? <CheckCircle2 size={14} strokeWidth={2} /> : idx}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-base" style={{ color: T.ink }}>{meta.label}</span>
            {meta.optional && step.status === 'pending' && (
              <span className="text-[9px] uppercase tracking-widest" style={{ color: T.inkSoft }}>optional</span>
            )}
            {isActive && (
              <span
                className="text-[9px] uppercase tracking-widest px-1.5 py-0.5"
                style={{ background: T.wood, color: T.paper, borderRadius: '2px', fontWeight: 600 }}
              >
                current
              </span>
            )}
            {overdue && (
              <span
                className="text-[9px] uppercase tracking-widest px-1.5 py-0.5"
                style={{ background: T.terra, color: T.paper, borderRadius: '2px', fontWeight: 600 }}
              >
                overdue
              </span>
            )}
          </div>
          <div className="text-xs mt-0.5" style={{ color: T.inkSoft }}>{meta.desc}</div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] flex-wrap" style={{ color: T.inkSoft }}>
            <span className="flex items-center gap-1"><User size={11} strokeWidth={1.5} />{meta.owner}</span>
            {isActive && step.dueDate && (
              <span
                className="flex items-center gap-1 font-medium"
                style={{ color: overdue ? T.terra : dueToday ? T.gold : T.sage }}
              >
                <Clock size={11} strokeWidth={1.5} />
                {new Date(step.dueDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                {wdLeft !== null && ` · ${overdue ? `逾 ${Math.abs(wdLeft)} wd` : dueToday ? '今天' : `还剩 ${wdLeft} wd`}`}
              </span>
            )}
            {isDone && step.completedAt && (
              <span style={{ color: T.sage }}>
                ✓ {new Date(step.completedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })} by {step.completedBy || '—'}
              </span>
            )}
          </div>
        </div>

        {isActive && canAct && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {step.id === 'review' ? (
              <>
                <button
                  onClick={() => onComplete(step.id, 'revise')}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors"
                  style={{ background: 'transparent', color: T.gold, border: `1px solid ${T.gold}`, borderRadius: '2px' }}
                >
                  <RefreshCw size={12} />需要修改
                </button>
                <button
                  onClick={() => onComplete(step.id, 'approve')}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium"
                  style={{ background: T.sage, color: T.paper, borderRadius: '2px' }}
                >
                  <CheckCircle2 size={12} />通过
                </button>
              </>
            ) : (
              <button
                onClick={() => onComplete(step.id)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium"
                style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}
              >
                <CheckCircle2 size={12} strokeWidth={1.5} />标记完成
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
