import React, { useState } from 'react';
import {
  X, Edit2, Trash2, Home, MapPin, MessageCircle, Phone, Eye, Timer,
  CalendarDays, PlusCircle, ClipboardCheck, LifeBuoy, Link2,
  ArrowRight, Sparkles, Activity, Bell, CheckCircle2, AlertCircle, Clock, User,
} from 'lucide-react';
import {
  SALES_STAGES, STAGE_GATES, PIC_OPTIONS, AFTER_SALES_CATEGORIES,
  COMPLETE_STAGE, canEditLead, canEditAfterSales, getApptTypeMeta,
} from '../../constants.js';
import {
  fmtMoney, daysSince, getStageMeta, getPriorityMeta,
  getStageAgeMeta, whatsappLink,
} from '../../utils.js';
import { DetailItem } from '../Shared.jsx';

export default function LeadDetailModal({
  lead, appointments = [], role = 'sales', users = [], currentUser,
  onClose, onEdit, onDelete, onRequestStage, onAddAppointment,
  onAddAfterSales, onResolveAfterSales, onDeleteAfterSales,
  onSetFollowUp, onCompleteFollowUp,
}) {
  const pm = getPriorityMeta(lead.priority);
  const sm = getStageMeta(lead.salesStage);
  const days = daysSince(lead.firstContactedDate);
  const leadAppts = appointments
    .filter(a => a.leadId === lead.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const isComplete = lead.salesStage === COMPLETE_STAGE;
  const editable = canEditLead(role, lead);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl max-h-[92vh] rounded-t-2xl sm:rounded-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-sail-line flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: pm.dot }} />
              <span className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">{pm.label}</span>
              {lead.soNumber && <span className="text-[10px] uppercase tracking-wider text-sail-muted">· {lead.soNumber}</span>}
            </div>
            <h2 className="font-display text-2xl text-sail-ink font-semibold truncate">{lead.clientName}</h2>
            <p className="text-xs text-sail-muted mt-0.5 truncate">{lead.region || '—'} · {lead.clientType} · {lead.leadSource}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sail-faint hover:text-sail-ink p-1 flex-shrink-0" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {/* Stage selector */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">Sales Stage</label>
            <select
              value={lead.salesStage}
              onChange={(e) => onRequestStage(e.target.value)}
              disabled={!editable}
              className="mt-1 w-full bg-sail-tint border border-sail-line rounded-md px-3 py-2 text-sm text-sail-ink focus:outline-none focus:border-sail-green disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {SALES_STAGES.map(s => (
                <option key={s.value} value={s.value}>{s.value}{STAGE_GATES[s.value] ? '  🔒' : ''}</option>
              ))}
            </select>
            {lead.stageEnteredAt && (() => {
              const sd = daysSince(lead.stageEnteredAt);
              const m = getStageAgeMeta(sd);
              return (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px]" style={{ color: m.color }}>
                  <Timer className="w-3 h-3" />
                  <span>{sd === 0 ? 'Entered today' : `${sd} day${sd === 1 ? '' : 's'} in this stage`}</span>
                  {m.warn && <span className="text-[10px] uppercase tracking-wider font-semibold">· stalled</span>}
                </div>
              );
            })()}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {lead.signedDetailDrawing && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-sail-green/10 text-sail-green px-2 py-0.5 rounded-full font-medium">
                  <ClipboardCheck className="w-3 h-3" /> Detail drawing signed
                </span>
              )}
              {lead.signedHandoverList && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-sail-green-deep/10 text-sail-green-deep px-2 py-0.5 rounded-full font-medium">
                  <ClipboardCheck className="w-3 h-3" /> Handover list signed
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DetailItem label="PIC" value={lead.pic} />
            <DetailItem label="Quotation" value={lead.quotationAmount > 0 ? fmtMoney(lead.quotationAmount) : '—'} accent />
            <DetailItem label="Contact" value={lead.contactNo || '—'} />
            <DetailItem label="Method" value={lead.contactMethod || '—'} />
            <DetailItem label="1st Contact"
              value={lead.firstContactedDate ? new Date(lead.firstContactedDate).toLocaleDateString('en-MY') : '—'} />
            <DetailItem label="Days Since" value={days !== null ? `${days} days` : '—'} />
            <DetailItem label="Expected Delivery" value={lead.expectedDeliveryDate || '—'} />
            <DetailItem label="Decision Maker" value={lead.isDecisionMaker || '—'} />
          </div>

          {lead.homeAddress && (
            <div className="bg-sail-tint border border-sail-line rounded-md p-3">
              <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium flex items-center gap-1">
                <Home className="w-3 h-3" /> Home / Site Address
              </label>
              <div className="mt-1 text-sm text-sail-ink whitespace-pre-wrap">{lead.homeAddress}</div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.homeAddress)}`}
                target="_blank" rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-sail-green hover:underline"
              >
                <MapPin className="w-3 h-3" /> Open in Google Maps
              </a>
            </div>
          )}

          {lead.contactNo && whatsappLink(lead.contactNo) && (
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={whatsappLink(lead.contactNo)}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#20BD5A] text-white text-xs font-medium rounded-md shadow-sm"
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
              <a
                href={`tel:${lead.contactNo.replace(/\s/g, '')}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-sail-tint border border-sail-line text-sail-ink text-xs font-medium rounded-md"
              >
                <Phone className="w-3.5 h-3.5 text-sail-green" /> Call
              </a>
            </div>
          )}

          {lead.clientNeeds && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">Client Needs</label>
              <div className="mt-1 text-sm text-sail-ink">{lead.clientNeeds}</div>
            </div>
          )}

          {lead.paymentInfo && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">Payment Info</label>
              <div className="mt-1 text-sm text-sail-ink">{lead.paymentInfo}</div>
            </div>
          )}

          {lead.nextAction && (
            <div className="bg-sail-tint border border-sail-line rounded-md p-3">
              <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">Next Action</label>
              <div className="mt-1 text-sm text-sail-ink font-medium">{lead.nextAction}</div>
            </div>
          )}

          <FollowUpBlock lead={lead} users={users} currentUser={currentUser} canEdit={editable}
            onSet={onSetFollowUp} onComplete={onCompleteFollowUp} />

          {lead.statusRemarks && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">Status & Remarks</label>
              <div className="mt-1 text-sm text-sail-ink whitespace-pre-wrap">{lead.statusRemarks}</div>
            </div>
          )}

          <div className="pt-2 border-t border-sail-line">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium flex items-center gap-1.5">
                <CalendarDays className="w-3 h-3" />
                Appointments {leadAppts.length > 0 && `(${leadAppts.length})`}
              </label>
              <button type="button"
                onClick={() => onAddAppointment({
                  leadId: lead.id, leadName: lead.clientName, pic: lead.pic,
                  address: lead.homeAddress || lead.region,
                })}
                className="flex items-center gap-1 text-[11px] text-sail-green hover:text-sail-green-deep font-medium"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Schedule
              </button>
            </div>
            {leadAppts.length === 0 ? (
              <p className="text-xs text-sail-faint">
                No appointments scheduled. Click Schedule to book a showroom visit, site visit, or installation.
              </p>
            ) : (
              <div className="space-y-1.5">
                {leadAppts.map(a => {
                  const tm = getApptTypeMeta(a.type);
                  const past = new Date(a.date) < new Date(new Date().toDateString());
                  return (
                    <div key={a.id}
                      className={`flex items-center gap-2 text-xs rounded-md px-2.5 py-1.5 border ${
                        past ? 'bg-sail-tint border-sail-line opacity-60' : 'bg-white border-sail-line'
                      }`}>
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tm.color }} />
                      <span className="font-medium text-sail-ink">{tm.label}</span>
                      <span className="text-sail-muted">
                        {new Date(a.date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}
                        {a.time ? ` · ${a.time}` : ''}
                      </span>
                      <span className="text-sail-faint ml-auto text-right">{a.pic}{a.createdBy ? ` · set by ${a.createdBy}` : ''}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {isComplete && (
            <AfterSalesSection
              lead={lead}
              canEdit={canEditAfterSales(role)}
              onAdd={onAddAfterSales}
              onResolve={onResolveAfterSales}
              onDelete={onDeleteAfterSales}
            />
          )}

          {lead.history && lead.history.length > 0 && (
            <div className="pt-2 border-t border-sail-line">
              <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium flex items-center gap-1.5 mb-2">
                <Activity className="w-3 h-3" />
                Activity Timeline ({lead.history.length})
              </label>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
                {lead.history.map((h, idx) => {
                  const ts = new Date(h.timestamp);
                  const isStage = h.type === 'stage';
                  const isCreated = h.type === 'created' || h.type === 'imported';
                  return (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <div className="w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center" style={{
                        background: isCreated ? '#3D5A4A' : isStage ? '#A87C4F' : '#E0D8C8',
                        color: isCreated || isStage ? 'white' : '#5C5247',
                      }}>
                        {isCreated ? <Sparkles className="w-3 h-3" /> : isStage ? <ArrowRight className="w-3 h-3" /> : <Edit2 className="w-3 h-3" />}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="text-sail-ink leading-snug">{h.message}</div>
                        <div className="text-[10px] text-sail-faint mt-0.5">
                          {h.user} · {ts.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}{' '}
                          {ts.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-sail-line flex items-center justify-between gap-2 flex-shrink-0 bg-sail-tint">
          {role === 'manager' ? (
            <button type="button"
              onClick={() => { if (confirm('Delete this lead permanently?')) onDelete(lead.id); }}
              className="text-xs text-sail-danger hover:text-[#7C4B3C] flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-sail-muted hover:text-sail-ink">Close</button>
            {editable ? (
              <button type="button" onClick={() => onEdit(lead)}
                className="px-3 py-1.5 bg-sail-green hover:bg-sail-green-deep text-white text-sm font-medium rounded-md flex items-center gap-1.5">
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
            ) : (
              <span className="text-[11px] text-sail-faint flex items-center gap-1">
                <Eye className="w-3 h-3" /> view only for your role
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Inline: FollowUpBlock
// =====================================================================
function FollowUpBlock({ lead, users, currentUser, canEdit = true, onSet, onComplete }) {
  const fu = lead.followUp;
  const [editing, setEditing] = useState(false);
  const [task, setTask] = useState(fu?.task || lead.nextAction || '');
  const [dueDate, setDueDate] = useState(fu?.dueDate || '');
  const [assignedTo, setAssignedTo] = useState(fu?.assignedTo || lead.pic || currentUser);

  const assignableUsers = users.length > 0 ? users.map(u => u.username) : PIC_OPTIONS;

  const save = () => {
    if (!task.trim()) return;
    onSet({
      task: task.trim(), dueDate, assignedTo,
      createdBy: currentUser, createdAt: new Date().toISOString(), done: false,
    });
    setEditing(false);
  };

  if (fu && !fu.done && !editing) {
    const overdue = fu.dueDate && new Date(fu.dueDate) < new Date(new Date().toDateString());
    return (
      <div className={`rounded-md p-3 border-2 ${overdue ? 'border-sail-warn bg-[#FFF8F0]' : 'border-sail-green/30 bg-sail-green/5'}`}>
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <label className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5"
            style={{ color: overdue ? '#C0843A' : '#3D5A4A' }}>
            <Bell className="w-3 h-3" /> Team Follow-up {overdue && '· OVERDUE'}
          </label>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setEditing(true)} className="text-[10px] text-sail-muted hover:text-sail-ink">Edit</button>
              <button type="button" onClick={onComplete}
                className="text-[10px] bg-sail-green text-white px-2 py-0.5 rounded font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Done
              </button>
            </div>
          )}
        </div>
        <div className="text-sm text-sail-ink font-medium">{fu.task}</div>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-sail-muted flex-wrap">
          <span className="inline-flex items-center gap-1"><User className="w-3 h-3" /> {fu.assignedTo}</span>
          {fu.dueDate && (
            <span className="inline-flex items-center gap-1" style={{ color: overdue ? '#C0843A' : '#5C5247' }}>
              <Clock className="w-3 h-3" /> due {new Date(fu.dueDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
            </span>
          )}
          <span className="text-sail-faint">set by {fu.createdBy}</span>
        </div>
      </div>
    );
  }

  if (fu && fu.done && !editing) {
    return (
      <div className="rounded-md p-3 border border-sail-line bg-sail-tint">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-sail-green">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="line-through text-sail-faint">{fu.task}</span>
          </div>
          {canEdit && (
            <button type="button" onClick={() => { setTask(''); setDueDate(''); setEditing(true); }}
              className="text-[10px] text-sail-green hover:underline">New follow-up</button>
          )}
        </div>
        <div className="text-[10px] text-sail-faint mt-1">Completed by {fu.completedBy}</div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="rounded-md p-3 border-2 border-sail-green/30 bg-sail-green/5 space-y-2">
        <label className="text-[10px] uppercase tracking-wider font-semibold text-sail-green flex items-center gap-1.5">
          <Bell className="w-3 h-3" /> Set team follow-up
        </label>
        <textarea
          rows={2} value={task} onChange={(e) => setTask(e.target.value)}
          placeholder="e.g. Revise drawing & send to customer next week (promised at meeting)"
          className="w-full bg-white border border-sail-line rounded px-2 py-1.5 text-xs text-sail-ink placeholder:text-sail-faint focus:outline-none resize-none"
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-sail-muted">Assign to</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full bg-white border border-sail-line rounded px-2 py-1.5 text-xs text-sail-ink focus:outline-none">
              {assignableUsers.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-sail-muted">Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-white border border-sail-line rounded px-2 py-1.5 text-xs text-sail-ink focus:outline-none" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {fu && <button type="button" onClick={() => setEditing(false)} className="text-[11px] text-sail-muted px-2 py-1">Cancel</button>}
          <button type="button" onClick={save} disabled={!task.trim()}
            className="text-[11px] bg-sail-green text-white px-3 py-1 rounded font-medium disabled:opacity-40">
            Save & notify {assignedTo}
          </button>
        </div>
      </div>
    );
  }

  if (!canEdit) return null;
  return (
    <button type="button" onClick={() => setEditing(true)}
      className="w-full flex items-center justify-center gap-1.5 text-[11px] text-sail-green hover:bg-sail-green/5 border border-dashed border-sail-faint rounded-md px-3 py-2 transition-colors">
      <PlusCircle className="w-3.5 h-3.5" /> Add team follow-up (so everyone knows the next step)
    </button>
  );
}

// =====================================================================
// Inline: AfterSalesSection (only visible on completed projects)
// =====================================================================
function AfterSalesSection({ lead, canEdit, onAdd, onResolve, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [issue, setIssue] = useState('');
  const [category, setCategory] = useState(AFTER_SALES_CATEGORIES[0]);
  const cases = lead.afterSales || [];
  const openCases = cases.filter(c => c.status === 'open');

  const submit = () => {
    if (!issue.trim()) return;
    onAdd({ issue: issue.trim(), category });
    setIssue(''); setCategory(AFTER_SALES_CATEGORIES[0]); setAdding(false);
  };

  return (
    <div className="pt-3 border-t-2 border-sail-green/20">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <label className="text-[10px] uppercase tracking-wider text-sail-green font-semibold flex items-center gap-1.5">
          <LifeBuoy className="w-3.5 h-3.5" />
          After-Sales {cases.length > 0 && `· ${openCases.length} open / ${cases.length} total`}
        </label>
        {canEdit ? (
          <button type="button" onClick={() => setAdding(!adding)}
            className="flex items-center gap-1 text-[11px] text-sail-green hover:text-sail-green-deep font-medium">
            <PlusCircle className="w-3.5 h-3.5" /> Log case
          </button>
        ) : (
          <span className="text-[10px] text-sail-faint flex items-center gap-1">
            <Eye className="w-3 h-3" /> view only · site supervisor manages tickets
          </span>
        )}
      </div>

      {adding && canEdit && (
        <div className="bg-sail-tint border border-sail-line rounded-md p-3 mb-2 space-y-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-white border border-sail-line rounded px-2 py-1.5 text-xs text-sail-ink focus:outline-none">
            {AFTER_SALES_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <textarea value={issue} onChange={(e) => setIssue(e.target.value)} rows={2}
            placeholder="Describe the after-sales issue…"
            className="w-full bg-white border border-sail-line rounded px-2 py-1.5 text-xs text-sail-ink focus:outline-none resize-none" />
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setAdding(false); setIssue(''); }}
              className="text-xs text-sail-muted px-2 py-1">Cancel</button>
            <button type="button" onClick={submit}
              className="text-xs bg-sail-green text-white px-3 py-1 rounded font-medium">Add Case</button>
          </div>
        </div>
      )}

      {cases.length === 0 && !adding ? (
        <p className="text-xs text-sail-faint">
          {canEdit
            ? 'No after-sales cases. This project is fully complete. Log a case if the customer reports an issue — the record stays permanently.'
            : 'No after-sales cases logged for this project yet.'}
        </p>
      ) : (
        <div className="space-y-2">
          {cases.map(c => (
            <AfterSalesCaseCard
              key={c.id} caseItem={c} canEdit={canEdit}
              onResolve={(driveLink) => onResolve(c.id, driveLink)}
              onDelete={() => onDelete(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AfterSalesCaseCard({ caseItem: c, canEdit, onResolve, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [checked, setChecked] = useState(false);
  const [driveLink, setDriveLink] = useState(c.driveLink || '');
  const resolved = c.status === 'resolved';
  const linkValid = driveLink.trim().length > 5;
  const canComplete = checked && linkValid;

  return (
    <div className={`rounded-md border p-2.5 ${resolved ? 'bg-sail-green/5 border-sail-green/20' : 'bg-white border-sail-warn'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded text-white ${
              resolved ? 'bg-sail-green' : 'bg-sail-warn'
            }`}>
              {resolved ? 'Resolved' : 'Open'}
            </span>
            <span className="text-[10px] text-sail-muted">{c.category}</span>
          </div>
          <div className="text-xs text-sail-ink">{c.issue}</div>
          <div className="text-[10px] text-sail-faint mt-1">
            Opened {new Date(c.createdAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })} by {c.createdBy}
            {resolved && c.resolvedAt && ` · Resolved ${new Date(c.resolvedAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}`}
          </div>
          {resolved && (
            <div className="mt-1 space-y-0.5">
              <div className="inline-flex items-center gap-1 text-[10px] text-sail-green font-medium">
                <ClipboardCheck className="w-3 h-3" /> After-sales handover form signed
              </div>
              {c.driveLink && (
                <a href={c.driveLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-sail-green hover:underline">
                  <Link2 className="w-3 h-3" /> View handover photos (Drive)
                </a>
              )}
            </div>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => { if (confirm(`Delete this after-sales case?\n\n${c.category}: ${c.issue}`)) onDelete(); }}
            className="text-sail-faint hover:text-sail-danger p-0.5 flex-shrink-0" aria-label="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {!resolved && canEdit && (
        <div className="mt-2 pt-2 border-t border-sail-line">
          {!confirming ? (
            <button type="button" onClick={() => setConfirming(true)}
              className="w-full text-[11px] bg-sail-green/10 hover:bg-sail-green/15 text-sail-green font-medium rounded px-2 py-1.5 flex items-center justify-center gap-1.5">
              <ClipboardCheck className="w-3.5 h-3.5" /> Mark as complete
            </button>
          ) : (
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 accent-[#3D5A4A]" />
                <span className="text-[11px] text-sail-ink">After-sales handover form has been signed by the customer</span>
              </label>
              <div>
                <label className="text-[10px] font-medium text-sail-ink flex items-center gap-1 mb-1">
                  <Link2 className="w-3 h-3 text-sail-green" /> Google Drive link (photos / documents)
                </label>
                <input type="url" value={driveLink} onChange={(e) => setDriveLink(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full bg-sail-tint border border-sail-line rounded px-2 py-1.5 text-[11px] text-sail-ink placeholder:text-sail-faint focus:outline-none focus:border-sail-green" />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => { setConfirming(false); setChecked(false); }}
                  className="text-[11px] text-sail-muted px-2 py-1">Cancel</button>
                <button type="button"
                  onClick={() => { if (canComplete) { onResolve(driveLink.trim()); setConfirming(false); } }}
                  disabled={!canComplete}
                  className="text-[11px] bg-sail-green text-white px-3 py-1 rounded font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                  Confirm Complete
                </button>
              </div>
              {!linkValid && <p className="text-[10px] text-sail-danger">Drive link is required to complete an after-sales case.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
