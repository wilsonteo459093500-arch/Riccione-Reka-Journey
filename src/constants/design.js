// ============================================================
// DESIGN WORKFLOW — sub-step tracker for Stage S (START)
// Six discrete steps with working-day SLAs that auto-compute the
// next due date. Render SLA and the number of allowed client
// presentations scale with the quotation amount.
// ============================================================
import { addWorkingDays, subWorkingDays, toISODate } from '../utils/helpers.js';

export const DESIGN_STEPS = [
  {
    id: 'measure',
    label: '现场量尺 / Site Measurement',
    owner: '方案设计师 / Concept Designer',
    sla: 2,
    slaText: '2 wd → 把材料交给技术设计师',
    desc: '方案设计师到现场量尺。完成后 2 个工作日内，把所有材料移交给技术 (深化) 设计师。',
  },
  {
    id: 'meeting',
    label: '方案 × 技术对接会 / Concept × Technical Review',
    owner: '双方设计师',
    sla: 1,
    slaText: '1 wd',
    desc: '技术设计师收到材料后, 与方案设计师一起完整走一遍, 对齐设计意图。',
  },
  {
    id: 'render',
    label: '出效果图 / Renderings',
    owner: '技术设计师 / Technical Designer',
    slaByAmount: true,
    slaText: '按报价分级',
    desc: '技术设计师完成效果图。截止日期按报价分级 (< 100k / < 200k / 200k–500k / > 500k)。',
  },
  {
    id: 'review',
    label: '方案设计师审查 / Concept Review',
    owner: '方案设计师',
    sla: 1,
    slaText: '1 wd 审核',
    desc: '方案设计师 1 个工作日内审查效果图, 决定通过 或 要求修改。',
  },
  {
    id: 'revise',
    label: '修改 (如有重大改动) / Revisions',
    owner: '技术设计师',
    sla: 1,
    slaText: '1 wd 修改',
    optional: true,
    desc: '若需要重大修改, 技术设计师 1 个工作日内完成修改, 然后回到审查。',
  },
  {
    id: 'internal',
    label: '内部审查 / Internal Review w/ Managers',
    owner: '方案设计师 + 管理层',
    sla: 1,
    slaText: '客户演示前 ≥2 wd',
    desc: '方案设计师在 1 个工作日内安排管理层内部审查。必须在客户演示前至少 2 个工作日完成。',
  },
];

export const DESIGN_STEP_MAP = Object.fromEntries(DESIGN_STEPS.map((s) => [s.id, s]));

// Render SLA by quotation tier (working days).
export const renderSLA = (amount) => {
  const a = Number(amount) || 0;
  if (a < 100000) return { max: 2, label: '2 wd (< RM 100k)' };
  if (a < 200000) return { max: 5, label: '3–5 wd (RM 100k–200k)' };
  if (a <= 500000) return { max: 7, label: '5–7 wd (RM 200k–500k)' };
  return { max: 7, label: '5–7+ wd (> RM 500k)' };
};

// Client presentations allowed, by quotation tier.
export const presentationLimit = (amount) => {
  const a = Number(amount) || 0;
  if (a < 100000) return 2;
  if (a < 200000) return 3;
  return 4;
};

// The earliest upcoming (or last past, as fallback) presentation date.
// Drives the internal-review deadline (must finish ≥2 wd before).
export const nextPresentationDate = (df) => {
  const list = df?.presentations || [];
  if (!list.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = list
    .map((p) => p.date)
    .filter(Boolean)
    .filter((d) => d >= today)
    .sort();
  if (upcoming.length) return upcoming[0];
  const all = list.map((p) => p.date).filter(Boolean).sort();
  return all.length ? all[all.length - 1] : null;
};

// Compute a step's due date given when it became active + the project context.
export const computeStepDue = (stepId, fromDate, project) => {
  const from = new Date(fromDate);
  if (stepId === 'render') {
    return toISODate(addWorkingDays(from, renderSLA(project.quotationAmount).max));
  }
  if (stepId === 'internal') {
    const arrange = addWorkingDays(from, 1);
    const present = nextPresentationDate(project.designFlow);
    if (present) {
      const mustBy = subWorkingDays(new Date(present), 2);
      return toISODate(mustBy < arrange ? mustBy : arrange);
    }
    return toISODate(arrange);
  }
  const step = DESIGN_STEP_MAP[stepId];
  return toISODate(addWorkingDays(from, step.sla || 1));
};

// Build a fresh design flow with step #1 active.
export const initDesignFlow = (project) => {
  const now = new Date();
  return {
    startedAt: now.toISOString(),
    presentations: [],
    steps: DESIGN_STEPS.map((s, i) => ({
      id: s.id,
      status: i === 0 ? 'active' : 'pending',
      startedAt: i === 0 ? now.toISOString() : null,
      dueDate: i === 0 ? computeStepDue(s.id, now, project) : null,
      completedAt: null,
      completedBy: null,
    })),
  };
};

// Advance to next step after marking the current done.
// 'review' supports a decision: 'approve' → internal, 'revise' → revise.
// 'revise' always loops back to 'review'.
export const advanceDesignFlow = (project, stepId, decision, currentUser) => {
  const df = project.designFlow;
  if (!df) return project;
  const now = new Date().toISOString();
  const order = DESIGN_STEPS.map((s) => s.id);
  let steps = df.steps.map((s) =>
    s.id === stepId ? { ...s, status: 'done', completedAt: now, completedBy: currentUser } : s
  );

  let nextId = null;
  if (stepId === 'review') {
    nextId = decision === 'revise' ? 'revise' : 'internal';
  } else if (stepId === 'revise') {
    nextId = 'review';
  } else {
    const idx = order.indexOf(stepId);
    nextId = order[idx + 1] || null;
    if (nextId === 'revise') nextId = 'internal'; // skip optional revise in normal forward path
  }

  if (nextId) {
    const projWithUpdated = { ...project, designFlow: { ...df, steps } };
    steps = steps.map((s) =>
      s.id === nextId
        ? { ...s, status: 'active', startedAt: now, completedAt: null, completedBy: null, dueDate: computeStepDue(nextId, now, projWithUpdated) }
        : s
    );
  }
  return { ...df, steps };
};

// Recompute the internal-review deadline after presentations change.
export const recomputeInternalDue = (project) => {
  const df = project.designFlow;
  if (!df) return df;
  return {
    ...df,
    steps: df.steps.map((s) => {
      if (s.id === 'internal' && s.status !== 'done') {
        const from = s.startedAt || new Date().toISOString();
        return { ...s, dueDate: computeStepDue('internal', from, project) };
      }
      return s;
    }),
  };
};
