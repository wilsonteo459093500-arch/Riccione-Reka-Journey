import { useMemo } from 'react';
import { Ruler, Clock, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { T } from '../../theme.js';
import { workingDaysUntil, fmt } from '../../utils/helpers.js';
import { DESIGN_STEP_MAP, renderSLA, presentationLimit, nextPresentationDate } from '../../constants/design.js';

const urgencyMeta = (project) => {
  const df = project.designFlow;
  if (!df) return { kind: 'none' };
  const active = df.steps.find((s) => s.status === 'active');
  const allDone = df.steps.every((s) => s.id === 'revise' || s.status === 'done');
  if (allDone) return { kind: 'ready' };
  if (!active) return { kind: 'idle' };
  const left = workingDaysUntil(active.dueDate);
  if (left === null) return { kind: 'active', step: active, left };
  if (left < 0) return { kind: 'overdue', step: active, left };
  if (left === 0) return { kind: 'due-today', step: active, left };
  return { kind: 'active', step: active, left };
};

const sortKey = (u) => {
  if (u.kind === 'overdue') return [0, -Math.abs(u.left || 0)];
  if (u.kind === 'due-today') return [1, 0];
  if (u.kind === 'active') return [2, u.left || 9999];
  if (u.kind === 'ready') return [3, 0];
  return [4, 0];
};

function DesignProjectCard({ project, urgency, onOpen }) {
  const df = project.designFlow;
  const doneCount = df.steps.filter((s) => s.status === 'done').length;
  const presLimit = presentationLimit(project.quotationAmount);
  const presUsed = (df.presentations || []).length;
  const nextPres = nextPresentationDate(df);
  const tier = renderSLA(project.quotationAmount);

  const accent =
    urgency.kind === 'overdue' ? T.terra :
    urgency.kind === 'due-today' ? T.gold :
    urgency.kind === 'ready' ? T.sage : T.wood;

  return (
    <button
      onClick={onOpen}
      className="w-full text-left p-4 hover-lift transition-all"
      style={{
        background: T.paper,
        border: `1px solid ${T.line}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: '2px',
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
            <h3 className="font-display text-xl leading-none" style={{ color: T.ink }}>{project.name}</h3>
            {urgency.kind === 'overdue' && (
              <span className="text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5" style={{ background: T.terra, color: T.paper, borderRadius: '2px' }}>
                OVERDUE
              </span>
            )}
            {urgency.kind === 'due-today' && (
              <span className="text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5" style={{ background: T.gold, color: T.paper, borderRadius: '2px' }}>
                TODAY
              </span>
            )}
            {urgency.kind === 'ready' && (
              <span className="text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5" style={{ background: T.sage, color: T.paper, borderRadius: '2px' }}>
                READY TO PRESENT
              </span>
            )}
          </div>
          <div className="text-xs" style={{ color: T.inkSoft }}>
            {project.client} · {project.assigned?.SD || '—'} · {project.quotationAmount > 0 ? fmt(project.quotationAmount) : '未报价'}
          </div>
        </div>
        <ChevronRight size={16} strokeWidth={1.5} style={{ color: T.inkSoft, opacity: 0.5, marginTop: 4 }} />
      </div>

      {urgency.kind === 'ready' ? (
        <div className="flex items-center gap-2 mt-2 text-sm" style={{ color: T.sage }}>
          <CheckCircle2 size={14} strokeWidth={1.5} />
          <span>内部审查完成 — 可以向客户展示</span>
        </div>
      ) : urgency.step ? (
        <div className="mt-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium" style={{ color: T.ink }}>
              {DESIGN_STEP_MAP[urgency.step.id]?.label}
            </span>
            {urgency.step.dueDate && (
              <span
                className="flex items-center gap-1 text-[11px] font-medium"
                style={{ color: urgency.kind === 'overdue' ? T.terra : urgency.kind === 'due-today' ? T.gold : T.sage }}
              >
                <Clock size={11} strokeWidth={1.5} />
                {new Date(urgency.step.dueDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                {urgency.left !== null && (
                  <span className="ml-1">
                    · {urgency.kind === 'overdue' ? `逾 ${Math.abs(urgency.left)} wd` : urgency.kind === 'due-today' ? '今天' : `还剩 ${urgency.left} wd`}
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: T.inkSoft }}>
            {DESIGN_STEP_MAP[urgency.step.id]?.owner}
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3 mt-2 text-[10px] flex-wrap" style={{ color: T.inkSoft }}>
        <span>
          进度 <span className="font-mono" style={{ color: T.ink }}>{doneCount}/6</span>
        </span>
        <span>·</span>
        <span>
          演示 <span className="font-mono" style={{ color: T.ink }}>{presUsed}/{presLimit}</span>
        </span>
        <span>·</span>
        <span>出图 SLA {tier.label}</span>
        {nextPres && (
          <>
            <span>·</span>
            <span>下次演示 {new Date(nextPres).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</span>
          </>
        )}
      </div>
    </button>
  );
}

export default function DesignDashboard({ projects, onOpen }) {
  const items = useMemo(() => {
    return projects
      .filter((p) => p.designFlow)
      .map((p) => ({ project: p, urgency: urgencyMeta(p) }))
      .sort((a, b) => {
        const [ka, sa] = sortKey(a.urgency);
        const [kb, sb] = sortKey(b.urgency);
        if (ka !== kb) return ka - kb;
        return sa - sb;
      });
  }, [projects]);

  const stats = useMemo(() => {
    const inProgress = items.filter((i) => i.urgency.kind === 'active' || i.urgency.kind === 'due-today').length;
    const overdue = items.filter((i) => i.urgency.kind === 'overdue').length;
    const ready = items.filter((i) => i.urgency.kind === 'ready').length;
    return { total: items.length, inProgress, overdue, ready };
  }, [items]);

  return (
    <div className="fade-up space-y-4">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] mb-1" style={{ color: T.wood }}>Design Dashboard · 设计总览</div>
        <h1 className="font-display text-5xl mb-2" style={{ color: T.ink }}>设计</h1>
        <p className="text-sm" style={{ color: T.inkSoft }}>所有进行中设计项目 · 按紧急度排序（逾期 → 今日 → 进行中 → 待演示）</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px" style={{ background: T.line }}>
        <Stat label="进行中" en="In Design" value={stats.total} />
        <Stat label="逾期" en="Overdue" value={stats.overdue} accent={stats.overdue > 0 ? T.terra : null} />
        <Stat label="今日待办" en="Due Today" value={stats.inProgress - (stats.inProgress - items.filter((i) => i.urgency.kind === 'due-today').length)} accent={T.gold} />
        <Stat label="待演示" en="Ready" value={stats.ready} accent={stats.ready > 0 ? T.sage : null} />
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 px-4" style={{ background: T.cream, borderRadius: '2px' }}>
          <Ruler size={40} strokeWidth={1} className="mx-auto mb-3" style={{ color: T.wood }} />
          <div className="font-display text-xl mb-1" style={{ color: T.ink }}>暂无进行中设计</div>
          <div className="text-sm" style={{ color: T.inkSoft }}>
            进入任一项目 Stage S → 启动设计流程, 这里就会汇总。
          </div>
        </div>
      ) : (
        <>
          {stats.overdue > 0 && (
            <div className="p-4 flex items-center gap-2" style={{ background: 'rgba(196,84,58,0.08)', borderLeft: `3px solid ${T.terra}`, borderRadius: '2px' }}>
              <AlertTriangle size={16} strokeWidth={1.5} style={{ color: T.terra }} />
              <div className="text-sm" style={{ color: T.ink }}>
                <span className="font-medium" style={{ color: T.terra }}>{stats.overdue}</span> 个项目的设计步骤已逾期 — 优先处理。
              </div>
            </div>
          )}
          <div className="space-y-2">
            {items.map(({ project, urgency }) => (
              <DesignProjectCard
                key={project.id}
                project={project}
                urgency={urgency}
                onOpen={() => onOpen(project.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, en, value, accent }) {
  return (
    <div className="p-5" style={{ background: T.paper }}>
      <div className="text-xs uppercase tracking-wider mb-2" style={{ color: T.inkSoft }}>{label}</div>
      <div className="font-display text-5xl leading-none" style={{ color: accent || T.ink }}>{value}</div>
      <div className="text-[10px] mt-2 uppercase tracking-widest opacity-60" style={{ color: T.inkSoft }}>{en}</div>
    </div>
  );
}
