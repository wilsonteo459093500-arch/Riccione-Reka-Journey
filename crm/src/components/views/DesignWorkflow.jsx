import React, { useMemo, useState } from 'react';
import {
  Ruler, CheckCircle2, Clock, User, ArrowRight, CalendarDays, PlusCircle,
  Trash2, ChevronDown, AlertTriangle,
} from 'lucide-react';
import { DESIGN_STEPS, DESIGN_STEP_MAP, canViewLead } from '../../constants.js';
import {
  fmtMoney, renderSLA, workingDaysUntil, nextPresentationDate,
  presentationLimit, subWorkingDays, toISODate,
} from '../../utils.js';
import { Card, ExportMenu } from '../Shared.jsx';

const stepColor = (step, isActive) => {
  if (step.status === 'done') return '#3D5A4A';
  if (!isActive) return '#D8D0C2';
  const left = workingDaysUntil(step.dueDate);
  if (left === null) return '#A87C4F';
  if (left < 0) return '#9C3D2E';
  if (left === 0) return '#C0843A';
  return '#A87C4F';
};

export default function DesignWorkflowView({ leads, role, setViewingLead, onCompleteStep, onAddPresentation, onUpdatePresentation, onRemovePresentation }) {
  const designLeads = useMemo(() =>
    leads
      .filter(l => l.salesStage === 'Stage 3: Design' && l.designFlow && canViewLead(role, l))
      .sort((a, b) => new Date(a.designFlow.startedAt) - new Date(b.designFlow.startedAt))
  , [leads, role]);

  const overdueCount = designLeads.filter(l => {
    const active = l.designFlow.steps.find(s => s.status === 'active');
    return active && workingDaysUntil(active.dueDate) < 0;
  }).length;
  const readyCount = designLeads.filter(l =>
    l.designFlow.steps.every(s => s.id === 'revise' || s.status === 'done')
  ).length;

  const exportRows = [];
  designLeads.forEach(l => {
    const active = l.designFlow.steps.find(s => s.status === 'active');
    const stepMeta = active ? DESIGN_STEP_MAP[active.id] : null;
    const base = {
      Client: l.clientName, PIC: l.pic, 'Quotation (RM)': l.quotationAmount || 0,
      'Render SLA': renderSLA(l.quotationAmount).label,
      'Current Step': stepMeta ? stepMeta.label : 'Ready to present',
      Owner: stepMeta ? stepMeta.owner : '—',
      Deadline: active?.dueDate || '—',
      'WD Left': active?.dueDate != null ? workingDaysUntil(active.dueDate) : '—',
      'Presentations Used': `${(l.designFlow.presentations || []).length}/${presentationLimit(l.quotationAmount)}`,
    };
    const pres = l.designFlow.presentations || [];
    if (pres.length === 0) {
      exportRows.push({ ...base, 'Presentation #': '—', 'Presentation Date': 'none yet', Outcome: '', Notes: '' });
    } else {
      pres.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach((p, i) => {
        exportRows.push({ ...base, 'Presentation #': i + 1, 'Presentation Date': p.date, Outcome: p.outcome || '', Notes: p.notes || '' });
      });
    }
  });

  return (
    <div className="space-y-4 pt-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-sail-ink font-semibold">Design Workflow</h1>
          <p className="text-xs text-sail-muted mt-0.5">
            {designLeads.length} projects in design · deadlines auto-calculated in working days (Mon–Fri)
          </p>
        </div>
        <ExportMenu rows={exportRows} title="Design Workflow" filename="Sail_Design_Workflow" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-sail-line rounded-lg p-3">
          <div className="text-2xl font-display font-semibold text-sail-ink">{designLeads.length}</div>
          <div className="text-[11px] text-sail-muted uppercase tracking-wider">In Design</div>
        </div>
        <div className={`rounded-lg p-3 border ${overdueCount > 0 ? 'bg-[#FBEEEA] border-sail-danger' : 'bg-white border-sail-line'}`}>
          <div className="text-2xl font-display font-semibold" style={{ color: overdueCount > 0 ? '#9C3D2E' : '#1A1614' }}>
            {overdueCount}
          </div>
          <div className="text-[11px] text-sail-muted uppercase tracking-wider">Overdue Steps</div>
        </div>
        <div className="bg-white border border-sail-line rounded-lg p-3">
          <div className="text-2xl font-display font-semibold text-sail-green">{readyCount}</div>
          <div className="text-[11px] text-sail-muted uppercase tracking-wider">Ready to Present</div>
        </div>
      </div>

      {designLeads.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Ruler className="w-10 h-10 text-sail-line mx-auto mb-3" />
            <h3 className="font-display text-lg text-sail-ink mb-1">No projects in design</h3>
            <p className="text-sm text-sail-muted">
              When a confirmed customer enters the Design stage, their step-by-step workflow appears here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {designLeads.map(l => (
            <DesignProjectCard
              key={l.id} lead={l} role={role}
              onCompleteStep={onCompleteStep}
              onAddPresentation={onAddPresentation}
              onUpdatePresentation={onUpdatePresentation}
              onRemovePresentation={onRemovePresentation}
              onOpen={() => setViewingLead(l)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DesignProjectCard({ lead, role, onCompleteStep, onAddPresentation, onUpdatePresentation, onRemovePresentation, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  const [addingPres, setAddingPres] = useState(false);
  const [presDate, setPresDate] = useState('');
  const [presNotes, setPresNotes] = useState('');

  const df = lead.designFlow;
  const activeStep = df.steps.find(s => s.status === 'active');
  const activeMeta = activeStep ? DESIGN_STEP_MAP[activeStep.id] : null;
  const allDone = df.steps.every(s => s.id === 'revise' || s.status === 'done');
  const doneCount = df.steps.filter(s => s.status === 'done').length;
  const tier = renderSLA(lead.quotationAmount);
  const presentations = (df.presentations || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const presLimit = presentationLimit(lead.quotationAmount);
  const presLeft = presLimit - presentations.length;
  const nextPresent = nextPresentationDate(df);

  const canAct = role === 'manager' || role === 'designer' || role === 'sales';

  const wdLeft = activeStep ? workingDaysUntil(activeStep.dueDate) : null;
  const overdue = wdLeft !== null && wdLeft < 0;
  const dueToday = wdLeft === 0;

  const submitPres = () => {
    if (!presDate) { alert('Pick a presentation date'); return; }
    onAddPresentation(lead.id, { date: presDate, notes: presNotes });
    setPresDate(''); setPresNotes(''); setAddingPres(false);
  };

  const presentWarn = (() => {
    if (!nextPresent) return null;
    const internal = df.steps.find(s => s.id === 'internal');
    if (internal?.status === 'done') return null;
    const mustBy = subWorkingDays(new Date(nextPresent), 2);
    const left = workingDaysUntil(toISODate(mustBy));
    if (left < 0) return 'Internal review is already past the ≥2-working-day buffer before the next presentation.';
    if (left <= 1) return `Only ${left} working day left to finish internal review before the next presentation.`;
    return null;
  })();

  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${
      overdue ? 'border-sail-danger' : allDone ? 'border-sail-green' : 'border-sail-line'
    }`}>
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap border-b border-sail-line">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={onOpen}
              className="font-display text-lg text-sail-ink font-semibold hover:text-sail-green truncate">
              {lead.clientName}
            </button>
            {allDone ? (
              <span className="text-[9px] uppercase tracking-wider font-semibold bg-sail-green text-white px-1.5 py-0.5 rounded">Ready to present</span>
            ) : overdue ? (
              <span className="text-[9px] uppercase tracking-wider font-semibold bg-sail-danger text-white px-1.5 py-0.5 rounded">Overdue</span>
            ) : (
              <span className="text-[9px] uppercase tracking-wider font-semibold bg-sail-brown text-white px-1.5 py-0.5 rounded">In progress</span>
            )}
          </div>
          <div className="text-[11px] text-sail-muted mt-0.5">
            {lead.pic} · {lead.quotationAmount > 0 ? fmtMoney(lead.quotationAmount) : 'no quote'} · render SLA: {tier.label}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-sail-muted uppercase tracking-wider">{doneCount}/6 steps</div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="flex items-center gap-1">
          {df.steps.map(s => {
            const isActive = s.status === 'active';
            const color = stepColor(s, isActive);
            const skipped = s.id === 'revise' && s.status === 'pending';
            const meta = DESIGN_STEP_MAP[s.id];
            return (
              <div key={s.id} className="flex-1 relative" title={`${meta.label} — ${s.status}`}>
                <div className="h-1.5 rounded-full transition-colors"
                  style={{ background: skipped ? '#EFE9DF' : color, opacity: skipped ? 0.5 : 1 }} />
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[9px] text-sail-faint">Measure</span>
          <span className="text-[9px] text-sail-faint">Internal Review</span>
        </div>
      </div>

      <div className="px-4 py-3">
        {allDone ? (
          <div className="flex items-center gap-2 text-sm text-sail-green bg-sail-green/5 rounded-lg p-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <div>
              <div className="font-medium">Internal review complete — ready to present to client.</div>
              <div className="text-[11px] text-sail-muted mt-0.5">
                Once the customer signs the detailed drawing, move this project to Production from Confirmed Sales.
              </div>
            </div>
          </div>
        ) : activeStep && activeMeta ? (
          <div className={`rounded-lg p-3 ${overdue ? 'bg-[#FBEEEA]' : 'bg-sail-tint'}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-sail-brown text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {DESIGN_STEPS.findIndex(x => x.id === activeStep.id) + 1}
                  </span>
                  <span className="font-semibold text-sm text-sail-ink">{activeMeta.label}</span>
                </div>
                <div className="text-[11px] text-sail-muted mt-1 ml-8">{activeMeta.desc}</div>
                <div className="flex items-center gap-3 mt-1.5 ml-8 text-[11px] flex-wrap">
                  <span className="inline-flex items-center gap-1 text-sail-muted"><User className="w-3 h-3" /> {activeMeta.owner}</span>
                  <span className="inline-flex items-center gap-1 font-medium"
                    style={{ color: overdue ? '#9C3D2E' : dueToday ? '#C0843A' : '#3D5A4A' }}>
                    <Clock className="w-3 h-3" />
                    due {activeStep.dueDate ? new Date(activeStep.dueDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }) : '—'}
                    {wdLeft !== null && ` · ${overdue ? `${Math.abs(wdLeft)} wd overdue` : dueToday ? 'today' : `${wdLeft} wd left`}`}
                  </span>
                </div>
              </div>
              {canAct && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {activeStep.id === 'review' ? (
                    <>
                      <button type="button"
                        onClick={() => onCompleteStep(lead.id, 'review', 'revise')}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-sail-warn text-sail-warn text-xs font-medium rounded-md hover:bg-[#FFF8F0]">
                        <ArrowRight className="w-3 h-3 rotate-180" /> Major revision
                      </button>
                      <button type="button"
                        onClick={() => onCompleteStep(lead.id, 'review', 'approve')}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-sail-green text-white text-xs font-medium rounded-md hover:bg-sail-green-deep">
                        <CheckCircle2 className="w-3 h-3" /> Approve
                      </button>
                    </>
                  ) : (
                    <button type="button"
                      onClick={() => onCompleteStep(lead.id, activeStep.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-sail-green text-white text-xs font-medium rounded-md hover:bg-sail-green-deep">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark done
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-3 pt-3 border-t border-sail-line">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] text-sail-muted flex items-center gap-1.5 font-medium">
              <CalendarDays className="w-3.5 h-3.5" /> Client Presentations
              <span className="text-[10px] text-sail-faint">({presentations.length}/{presLimit} used · tier limit)</span>
            </label>
            {canAct && presLeft > 0 && !addingPres && (
              <button type="button" onClick={() => setAddingPres(true)}
                className="flex items-center gap-1 text-[11px] text-sail-green hover:text-sail-green-deep font-medium">
                <PlusCircle className="w-3.5 h-3.5" /> Add date
              </button>
            )}
          </div>

          {presentations.length === 0 && !addingPres && (
            <p className="text-[11px] text-sail-faint">
              No presentation scheduled yet. {canAct && `You can schedule up to ${presLimit} for this quotation tier.`}
            </p>
          )}

          {presentations.length > 0 && (
            <div className="space-y-1.5">
              {presentations.map((p, i) => {
                const isPast = p.date < toISODate(new Date());
                const isNext = p.date === nextPresent;
                return (
                  <div key={p.id} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 border text-xs ${
                    isNext ? 'border-sail-green bg-sail-green/5'
                      : isPast ? 'border-sail-line bg-sail-tint'
                      : 'border-sail-line bg-white'
                  }`}>
                    <span className="w-5 h-5 rounded-full bg-sail-brown text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sail-ink">
                          {new Date(p.date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        {isNext && <span className="text-[9px] uppercase tracking-wider font-semibold text-sail-green">next</span>}
                        {isPast && <span className="text-[9px] uppercase tracking-wider text-sail-faint">past</span>}
                      </div>
                      {p.notes && <div className="text-[10px] text-sail-muted italic line-clamp-1">{p.notes}</div>}
                      <div className="text-[9px] text-sail-faint">added by {p.createdBy}</div>
                    </div>
                    {canAct && (
                      <select
                        value={p.outcome || 'pending'}
                        onChange={(e) => onUpdatePresentation(lead.id, p.id, { outcome: e.target.value })}
                        className="bg-white border border-sail-line rounded px-1.5 py-1 text-[10px] text-sail-ink focus:outline-none"
                        title="Outcome"
                      >
                        <option value="pending">Pending</option>
                        <option value="presented">Presented</option>
                        <option value="revision">Revision needed</option>
                        <option value="approved">Approved</option>
                      </select>
                    )}
                    {canAct && (
                      <button
                        type="button"
                        onClick={() => { if (confirm('Remove this presentation record?')) onRemovePresentation(lead.id, p.id); }}
                        className="text-sail-faint hover:text-sail-danger p-0.5 flex-shrink-0"
                        aria-label="Remove"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {addingPres && (
            <div className="mt-2 bg-sail-tint border border-sail-line rounded-md p-2.5 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-sail-muted">Presentation date</label>
                  <input type="date" value={presDate} onChange={(e) => setPresDate(e.target.value)}
                    className="w-full bg-white border border-sail-line rounded px-2 py-1.5 text-xs text-sail-ink focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-sail-muted">Notes (optional)</label>
                  <input type="text" value={presNotes} onChange={(e) => setPresNotes(e.target.value)}
                    placeholder="e.g. 1st round, revised kitchen"
                    className="w-full bg-white border border-sail-line rounded px-2 py-1.5 text-xs text-sail-ink focus:outline-none" />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => { setAddingPres(false); setPresDate(''); setPresNotes(''); }}
                  className="text-[11px] text-sail-muted px-2 py-1">Cancel</button>
                <button type="button" onClick={submitPres}
                  className="text-[11px] bg-sail-green text-white px-3 py-1 rounded font-medium">Add presentation</button>
              </div>
            </div>
          )}

          {presLeft <= 0 && (
            <p className="text-[10px] text-sail-faint mt-1.5">Reached the {presLimit}-presentation limit for this quotation tier.</p>
          )}

          <button type="button" onClick={() => setExpanded(!expanded)}
            className="mt-2 text-[11px] text-sail-green hover:underline flex items-center gap-1">
            {expanded ? 'Hide' : 'Show'} all design steps
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {presentWarn && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-sail-danger bg-[#FBEEEA] rounded px-2 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {presentWarn}
          </div>
        )}

        {expanded && (
          <div className="mt-3 pt-3 border-t border-sail-line space-y-2">
            {df.steps.map((s, i) => {
              const meta = DESIGN_STEP_MAP[s.id];
              const isActive = s.status === 'active';
              const skipped = s.id === 'revise' && s.status === 'pending';
              const color = stepColor(s, isActive);
              return (
                <div key={s.id} className={`flex items-start gap-2.5 ${skipped ? 'opacity-50' : ''}`}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 text-white"
                    style={{ background: color }}>
                    {s.status === 'done' ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium ${s.status === 'done' ? 'text-sail-muted' : 'text-sail-ink'}`}>
                        {meta.label}
                      </span>
                      {s.id === 'revise' && <span className="text-[9px] text-sail-faint uppercase tracking-wider">optional</span>}
                      {isActive && <span className="text-[9px] uppercase tracking-wider font-semibold text-sail-brown">current</span>}
                    </div>
                    <div className="text-[10px] text-sail-faint">
                      {meta.owner} · {meta.slaText}
                      {s.status === 'done' && s.completedAt && ` · done ${new Date(s.completedAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })} by ${s.completedBy}`}
                      {isActive && s.dueDate && ` · due ${new Date(s.dueDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
