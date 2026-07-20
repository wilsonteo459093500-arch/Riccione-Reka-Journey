import { useMemo } from 'react';
import { Ruler, AlertTriangle, PlayCircle, CheckCircle2 } from 'lucide-react';
import { T } from '../../theme.js';
import { workingDaysUntil, fmt } from '../../utils/helpers.js';
import {
  DESIGN_STEPS,
  renderSLA,
  presentationLimit,
  nextPresentationDate,
} from '../../constants/design.js';
import DesignStepCard from './DesignStepCard.jsx';
import DesignPresentationsList from './DesignPresentationsList.jsx';

// Embedded in Stage S. Manages the 6 design sub-steps + presentation log.
export default function DesignWorkflowBlock({
  project,
  onStart,
  onCompleteStep,
  onAddPresentation,
  onUpdatePresentation,
  onRemovePresentation,
}) {
  const df = project.designFlow;
  const tier = useMemo(() => renderSLA(project.quotationAmount), [project.quotationAmount]);
  const presLimit = presentationLimit(project.quotationAmount);

  // Pre-init "empty" state
  if (!df) {
    return (
      <div className="mb-4 p-4" style={{ background: T.cream, borderRadius: '2px' }}>
        <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
          <div>
            <div className="flex items-baseline gap-2 mb-1 flex-wrap">
              <div className="text-xs uppercase tracking-widest" style={{ color: T.inkSoft }}>Design Workflow</div>
              <div className="font-display text-xl" style={{ color: T.ink }}>设计深化流程</div>
              <span className="font-mono text-[10px] px-1.5 py-0.5" style={{ background: T.wood, color: T.paper, borderRadius: '2px' }}>S2 → S3</span>
            </div>
            <div className="text-xs" style={{ color: T.inkSoft }}>
              方案/技术双线 6 步流程, 工作日 SLA 自动倒推。报价 {project.quotationAmount > 0 ? fmt(project.quotationAmount) : '未填'} → 出图 SLA: <span className="font-mono" style={{ color: T.ink }}>{tier.label}</span> · 演示额度 {presLimit} 次。
            </div>
          </div>
          <button
            onClick={onStart}
            className="flex items-center gap-1.5 px-4 py-2 text-sm flex-shrink-0"
            style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}
          >
            <PlayCircle size={14} strokeWidth={1.5} />启动设计流程
          </button>
        </div>
        <div className="text-center py-4 text-xs" style={{ color: T.inkSoft, opacity: 0.7 }}>
          ⏱ 启动后, 现场量尺成为第一个待办, 后续 5 步自动按工作日推进。
        </div>
      </div>
    );
  }

  const activeStep = df.steps.find((s) => s.status === 'active');
  const allDone = df.steps.every((s) => s.id === 'revise' || s.status === 'done');
  const doneCount = df.steps.filter((s) => s.status === 'done').length;
  const overdue = activeStep && workingDaysUntil(activeStep.dueDate) < 0;

  // Warning if internal review is too close to next presentation
  const presentWarn = (() => {
    const next = nextPresentationDate(df);
    if (!next) return null;
    const internal = df.steps.find((s) => s.id === 'internal');
    if (!internal || internal.status === 'done') return null;
    const left = workingDaysUntil(internal.dueDate);
    if (left === null) return null;
    if (left < 0) return '内部审查已超过 ≥2 工作日的缓冲, 来不及在演示前完成。';
    if (left <= 1) return `距离内部审查截止仅剩 ${left} 个工作日, 否则赶不上演示。`;
    return null;
  })();

  return (
    <div className="mb-4 p-4" style={{ background: T.cream, borderRadius: '2px' }}>
      {/* Header */}
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
        <div>
          <div className="flex items-baseline gap-2 mb-1 flex-wrap">
            <div className="text-xs uppercase tracking-widest" style={{ color: T.inkSoft }}>Design Workflow</div>
            <div className="font-display text-xl" style={{ color: T.ink }}>设计深化流程</div>
            {allDone ? (
              <span className="text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5" style={{ background: T.sage, color: T.paper, borderRadius: '2px' }}>
                READY TO PRESENT
              </span>
            ) : overdue ? (
              <span className="text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5" style={{ background: T.terra, color: T.paper, borderRadius: '2px' }}>
                OVERDUE
              </span>
            ) : (
              <span className="text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5" style={{ background: T.wood, color: T.paper, borderRadius: '2px' }}>
                IN PROGRESS
              </span>
            )}
          </div>
          <div className="text-xs" style={{ color: T.inkSoft }}>
            <span className="font-mono" style={{ color: T.ink }}>{doneCount}/6</span> 步完成 · 出图 SLA: <span className="font-mono" style={{ color: T.ink }}>{tier.label}</span> · 演示额度 {presLimit} 次
          </div>
        </div>
      </div>

      {/* Progress bar (visual hint) */}
      <div className="flex items-center gap-1 mb-3">
        {df.steps.map((s) => {
          const isActive = s.status === 'active';
          const isDone = s.status === 'done';
          const skipped = s.id === 'revise' && s.status === 'pending';
          let color = T.line;
          if (isDone) color = T.sage;
          else if (isActive) color = workingDaysUntil(s.dueDate) < 0 ? T.terra : T.wood;
          return (
            <div key={s.id} className="flex-1" title={s.id}>
              <div className="h-1.5" style={{ background: color, opacity: skipped ? 0.4 : 1, borderRadius: '1px' }} />
            </div>
          );
        })}
      </div>

      {/* Ready-to-present banner */}
      {allDone && (
        <div className="mb-3 p-3 flex items-start gap-2" style={{ background: 'rgba(92,122,74,0.1)', borderRadius: '2px' }}>
          <CheckCircle2 size={18} strokeWidth={1.5} style={{ color: T.sage, marginTop: 1 }} />
          <div className="text-sm" style={{ color: T.ink }}>
            <div className="font-medium" style={{ color: T.sage }}>内部审查完成 — 设计可以向客户展示。</div>
            <div className="text-xs mt-0.5" style={{ color: T.inkSoft }}>
              客户在图纸上签字后, 进入 Confirmed Sales 标记 Production 阶段。
            </div>
          </div>
        </div>
      )}

      {/* Steps */}
      <div className="space-y-2">
        {df.steps.map((step) => (
          <DesignStepCard
            key={step.id}
            step={step}
            canAct
            onComplete={(stepId, decision) => onCompleteStep(stepId, decision)}
          />
        ))}
      </div>

      {/* Presentations */}
      <DesignPresentationsList
        project={project}
        onAdd={onAddPresentation}
        onUpdate={onUpdatePresentation}
        onRemove={onRemovePresentation}
      />

      {/* Warning under presentations if internal review too close */}
      {presentWarn && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] px-2 py-1.5" style={{ background: 'rgba(196,84,58,0.08)', color: T.terra, borderRadius: '2px' }}>
          <AlertTriangle size={13} strokeWidth={1.5} />{presentWarn}
        </div>
      )}
    </div>
  );
}
