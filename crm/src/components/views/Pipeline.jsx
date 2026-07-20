import React, { useMemo, useState } from 'react';
import { AlertCircle, Timer, Ruler } from 'lucide-react';
import {
  PIC_OPTIONS, SALES_STAGES, PIPELINE_STAGES, CONFIRMED_STAGES,
  STAGE_GATES, DESIGN_STEP_MAP, canViewLead, canEditLead, isActiveStage,
} from '../../constants.js';
import {
  fmtMoneyShort, getPriorityMeta, daysSince, getStageAgeMeta,
  workingDaysUntil, leadToRow,
} from '../../utils.js';
import { ExportMenu } from '../Shared.jsx';

function KanbanBoard({ leads, role, setViewingLead, requestStageChange, stages, title, subtitle }) {
  const [picFilter, setPicFilter] = useState('All');
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);

  const stageValues = stages.map(s => s.value);
  const visible = leads
    .filter(l => canViewLead(role, l))
    .filter(l => stageValues.includes(l.salesStage))
    .filter(l => picFilter === 'All' || l.pic === picFilter);

  const grouped = useMemo(() => {
    const g = {};
    stages.forEach(s => { g[s.value] = []; });
    visible.forEach(l => { if (g[l.salesStage]) g[l.salesStage].push(l); });
    return g;
  }, [visible, stages]);

  const handleDrop = (e, newStage) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!draggedId) return;
    const lead = leads.find(l => l.id === draggedId);
    if (lead && lead.salesStage !== newStage) {
      if (canEditLead(role, lead)) {
        requestStageChange(lead, newStage);
      } else {
        alert('Your role can only view these leads, not move them.');
      }
    }
    setDraggedId(null);
  };

  const showPicFilter = role === 'manager' || role === 'sales';

  return (
    <div className="space-y-4 pt-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-sail-ink font-semibold">{title}</h1>
          <p className="text-xs text-sail-muted mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {showPicFilter && (
            <div className="flex items-center gap-1 bg-white border border-sail-line rounded-md p-0.5">
              {['All', ...PIC_OPTIONS].map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPicFilter(p)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    picFilter === p ? 'bg-sail-ink text-sail-paper' : 'text-sail-muted hover:text-sail-ink'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <ExportMenu
            rows={visible.map(leadToRow)}
            title={title}
            filename={`Sail_${title.replace(/\s/g, '_')}`}
          />
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-thin pb-4 -mx-3 sm:-mx-6 lg:-mx-8 px-3 sm:px-6 lg:px-8">
        <div className="flex gap-3 min-w-max">
          {stages.map(stage => {
            const items = grouped[stage.value] || [];
            const totalValue = items.reduce((s, l) => s + (Number(l.quotationAmount) || 0), 0);
            const gated = !!STAGE_GATES[stage.value];
            const isDropTarget = dragOverStage === stage.value;
            return (
              <div
                key={stage.value}
                className="w-72 flex-shrink-0"
                onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.value); }}
                onDragLeave={() => setDragOverStage(prev => prev === stage.value ? null : prev)}
                onDrop={(e) => handleDrop(e, stage.value)}
              >
                <div className={`bg-white border border-sail-line rounded-lg overflow-hidden flex flex-col ${isDropTarget ? 'drop-target' : ''}`} style={{ maxHeight: '70vh' }}>
                  <div className="px-3 py-2.5 border-b border-sail-line flex items-center justify-between"
                    style={{ background: `${stage.color}1A` }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: stage.color }} />
                      <div className="font-semibold text-xs text-sail-ink truncate">{stage.short}</div>
                      {gated && <span title="Requires signed document to enter"><AlertCircle className="w-3 h-3 text-sail-warn flex-shrink-0" /></span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-sail-muted flex-shrink-0">
                      <span className="font-medium">{items.length}</span>
                      {totalValue > 0 && <span>· {fmtMoneyShort(totalValue)}</span>}
                    </div>
                  </div>
                  <div className="p-2 space-y-2 overflow-y-auto scrollbar-thin flex-1">
                    {items.length === 0 ? (
                      <div className="text-center text-xs text-sail-faint py-4">No leads</div>
                    ) : (
                      items.map(l => (
                        <KanbanCard key={l.id} lead={l}
                          onClick={() => setViewingLead(l)}
                          onDragStart={() => setDraggedId(l.id)}
                          onDragEnd={() => setDraggedId(null)}
                          isDragging={draggedId === l.id} />
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KanbanCard({ lead, onClick, onDragStart, onDragEnd, isDragging }) {
  const pm = getPriorityMeta(lead.priority);
  const days = daysSince(lead.firstContactedDate);
  const stageDays = daysSince(lead.stageEnteredAt);
  const stageMeta = getStageAgeMeta(stageDays);
  const showStageAge = stageDays !== null && isActiveStage(lead.salesStage);

  const df = lead.salesStage === 'Stage 3: Design' ? lead.designFlow : null;
  const dfDone = df ? df.steps.filter(s => s.status === 'done').length : 0;
  const dfActive = df ? df.steps.find(s => s.status === 'active') : null;
  const dfOverdue = dfActive && workingDaysUntil(dfActive.dueDate) < 0;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`bg-white border border-sail-line rounded-md p-2.5 cursor-pointer hover:border-sail-green hover:shadow-sm transition-all ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-semibold text-sm text-sail-ink leading-tight truncate flex-1">{lead.clientName}</div>
        <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: pm.dot }} title={pm.label} />
      </div>
      <div className="text-[11px] text-sail-muted truncate mb-1.5">{lead.region || '—'}</div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded-full bg-sail-green text-white flex items-center justify-center text-[8px] font-bold">
            {lead.pic?.[0]}
          </div>
          <span className="text-[10px] text-sail-muted">{lead.leadSource}</span>
        </div>
        {lead.quotationAmount > 0 && (
          <span className="text-xs font-semibold text-sail-ink">{fmtMoneyShort(lead.quotationAmount)}</span>
        )}
      </div>
      {df && (
        <div className="mt-1.5 flex items-center gap-1.5 pt-1.5 border-t border-sail-line">
          <Ruler className="w-2.5 h-2.5" style={{ color: dfOverdue ? '#9C3D2E' : '#A87C4F' }} />
          <span className="text-[10px] font-medium" style={{ color: dfOverdue ? '#9C3D2E' : '#5C5247' }}>
            Design {dfDone}/6
            {dfActive ? ` · ${DESIGN_STEP_MAP[dfActive.id]?.label}` : ' · ready'}
            {dfOverdue ? ' · overdue' : ''}
          </span>
        </div>
      )}
      {showStageAge && (
        <div className="mt-1.5 flex items-center justify-between gap-1 pt-1.5 border-t border-sail-line">
          <div className="flex items-center gap-1" title={`In current stage for ${stageDays} days`}>
            <Timer className="w-2.5 h-2.5" style={{ color: stageMeta.color }} />
            <span className="text-[10px] font-medium" style={{ color: stageMeta.color }}>{stageMeta.label} in stage</span>
          </div>
          {days !== null && days > 30 && <span className="text-[10px] text-sail-danger">· {days}d total</span>}
        </div>
      )}
    </div>
  );
}

export function PipelineView(props) {
  const stages = SALES_STAGES.filter(s => PIPELINE_STAGES.includes(s.value));
  return (
    <KanbanBoard
      {...props}
      stages={stages}
      title="Pipeline"
      subtitle="Interested customers (not yet paid) · drag to update · move to Design to convert into Confirmed Sales"
    />
  );
}

export function ConfirmedSalesView(props) {
  const stages = SALES_STAGES.filter(s => CONFIRMED_STAGES.includes(s.value));
  return (
    <KanbanBoard
      {...props}
      stages={stages}
      title="Confirmed Sales"
      subtitle="Paid customers from Design onward · 🔒 gates require signed documents to advance"
    />
  );
}
