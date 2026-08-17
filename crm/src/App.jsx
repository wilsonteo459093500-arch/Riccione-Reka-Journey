import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { repo } from './services/repo.js';
import {
  STAGE_GATES, ROLE_TABS, WON_STAGES, COMPLETE_STAGE, DROPPED_STAGE,
  canSeeDashboard, canSeeAnalytics, canManageUsers, canViewLead,
} from './constants.js';
import {
  computeLeadDiff, computeStepDue, initDesignFlow,
  presentationLimit, getStageMeta, leadToRow, exportRowsToExcel,
  parseExcelImport,
} from './utils.js';
import { DESIGN_STEPS, DESIGN_STEP_MAP } from './constants.js';

import LoginScreen from './components/LoginScreen.jsx';
import Header from './components/Header.jsx';
import ReminderBar from './components/ReminderBar.jsx';

import DashboardView   from './components/views/Dashboard.jsx';
import LeadsTableView  from './components/views/LeadsTable.jsx';
import { PipelineView, ConfirmedSalesView } from './components/views/Pipeline.jsx';
import DesignWorkflowView from './components/views/DesignWorkflow.jsx';
import CalendarView    from './components/views/Calendar.jsx';
import AfterSalesView  from './components/views/AfterSales.jsx';
import AnalyticsView   from './components/views/Analytics.jsx';
import UsersView       from './components/views/Users.jsx';

import LeadFormModal     from './components/modals/LeadFormModal.jsx';
import LeadDetailModal   from './components/modals/LeadDetailModal.jsx';
import StageGateModal    from './components/modals/StageGateModal.jsx';

export default function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [view, setView] = useState('leads');
  const [editingLead, setEditingLead] = useState(null);
  const [viewingLead, setViewingLead] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [session, setSession] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('sail-crm-session')); } catch { return null; }
  });
  const [gateRequest, setGateRequest] = useState(null);
  const [apptModalSeed, setApptModalSeed] = useState(null);

  // Persist session for refreshes (within tab only)
  useEffect(() => {
    if (session) sessionStorage.setItem('sail-crm-session', JSON.stringify(session));
    else sessionStorage.removeItem('sail-crm-session');
  }, [session]);

  // Subscribe to repo
  useEffect(() => {
    let unsub = null;
    repo.init().then(() => {
      unsub = repo.subscribe(setSnapshot);
    }).catch(err => {
      console.error('Repo init failed', err);
      setSnapshot({ leads: [], appointments: [], users: [], audit: [], meta: {} });
    });
    return () => { if (unsub) unsub(); };
  }, []);

  const currentUser = session?.username || '';
  const role = session?.role || 'sales';

  // Ensure current view is allowed for role
  useEffect(() => {
    if (!session) return;
    const allowed = ROLE_TABS[session.role] || [];
    if (!allowed.includes(view)) setView(allowed[0] || 'leads');
  }, [session]);

  // ---------- Keep modals in sync with realtime updates ----------
  useEffect(() => {
    if (!snapshot || !viewingLead) return;
    const fresh = snapshot.leads.find(l => l.id === viewingLead.id);
    if (fresh && fresh !== viewingLead) setViewingLead(fresh);
  }, [snapshot, viewingLead]);

  // ---------- Audit ----------
  const logAudit = useCallback((action, detail) => {
    const entry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      user: currentUser || 'Unknown',
      role,
      action,
      detail,
    };
    repo.appendAudit(entry);
  }, [currentUser, role]);

  // ---------- Lead mutations ----------
  const addLead = useCallback((lead) => {
    const now = new Date().toISOString();
    const newLead = {
      ...lead,
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      updatedAt: now,
      stageEnteredAt: now,
      afterSales: lead.afterSales || [],
      handoverDriveLink: lead.handoverDriveLink || '',
      followUp: lead.followUp || null,
      designFlow: lead.salesStage === 'Stage 3: Design' ? initDesignFlow() : null,
      signedDetailDrawing: WON_STAGES.includes(lead.salesStage),
      signedHandoverList: lead.salesStage === COMPLETE_STAGE,
      history: [{ timestamp: now, user: currentUser, type: 'created',
        message: `Created lead at ${getStageMeta(lead.salesStage).short}` }],
    };
    repo.upsertLead(newLead);
    logAudit('Created lead', `${newLead.clientName} (${getStageMeta(newLead.salesStage).short})`);
  }, [currentUser, logAudit]);

  const updateLead = useCallback((id, updates) => {
    if (!snapshot) return;
    const l = snapshot.leads.find(x => x.id === id);
    if (!l) return;
    const now = new Date().toISOString();
    const next = { ...l, ...updates, updatedAt: now };
    const diff = computeLeadDiff(l, next);
    if (l.salesStage !== next.salesStage) {
      next.stageEnteredAt = now;
      if (next.salesStage === 'Stage 3: Design' && !next.designFlow) {
        next.designFlow = initDesignFlow();
      }
    }
    if (diff.length > 0) {
      const stageChange = diff.find(d => d.field === 'salesStage');
      let type = 'update', message;
      if (stageChange) {
        type = 'stage';
        message = `Moved from ${getStageMeta(stageChange.from).short} → ${getStageMeta(stageChange.to).short}`;
        const others = diff.filter(d => d.field !== 'salesStage');
        if (others.length) message += ` · also updated ${others.map(c => c.label).join(', ')}`;
      } else if (diff.length === 1) {
        const d = diff[0];
        const f = d.from ? `"${String(d.from).slice(0, 40)}"` : 'empty';
        const t = d.to ? `"${String(d.to).slice(0, 40)}"` : 'empty';
        message = `Changed ${d.label}: ${f} → ${t}`;
      } else {
        message = `Updated ${diff.map(d => d.label).join(', ')}`;
      }
      const entry = { timestamp: now, user: currentUser, type, message };
      next.history = [entry, ...(l.history || [])].slice(0, 100);
      logAudit(type === 'stage' ? 'Moved stage' : 'Updated lead', `${l.clientName}: ${message}`);
    }
    repo.upsertLead(next);
  }, [snapshot, currentUser, logAudit]);

  const deleteLead = useCallback((id) => {
    if (!snapshot) return;
    const lead = snapshot.leads.find(l => l.id === id);
    repo.deleteLead(id);
    if (lead) logAudit('Deleted lead', lead.clientName);
  }, [snapshot, logAudit]);

  const requestStageChange = useCallback((lead, targetStage) => {
    if (targetStage === lead.salesStage) return;
    // Signed-document gates (Production / Complete) — these open a structured modal.
    const gate = STAGE_GATES[targetStage];
    const needsGate = gate && (!lead[gate.field] || (gate.requireLink && !lead[gate.linkField]));
    if (needsGate) {
      setGateRequest({ lead, targetStage, gate });
      return;
    }
    // Anti-misclick protection: stage moves that are easy to do by accident
    // and hard to mentally reverse get a confirm dialog.
    const fromMeta = getStageMeta(lead.salesStage);
    const toMeta = getStageMeta(targetStage);
    const goingBackwards = toMeta.order < fromMeta.order && toMeta.order !== 99;
    if (goingBackwards) {
      const ok = confirm(
        `Move ${lead.clientName} BACKWARDS\nfrom "${fromMeta.short}" to "${toMeta.short}"?\n\n` +
        `This is unusual — make sure you didn't click by accident.`
      );
      if (!ok) return;
    }
    if (targetStage === DROPPED_STAGE) {
      const ok = confirm(
        `Mark ${lead.clientName} as DROPPED?\n\n` +
        `The lead leaves your active pipeline. You can revive it later from the Leads table.`
      );
      if (!ok) return;
    }
    updateLead(lead.id, { salesStage: targetStage });
  }, [updateLead]);

  const confirmGateMove = useCallback((extra = {}) => {
    if (!gateRequest) return;
    const { lead, targetStage, gate } = gateRequest;
    const updates = { salesStage: targetStage, [gate.field]: true, ...extra };
    updateLead(lead.id, updates);
    setGateRequest(null);
  }, [gateRequest, updateLead]);

  // ---------- Appointments ----------
  const addAppointment = useCallback((appt) => {
    const next = { ...appt, id: `appt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(), createdBy: currentUser };
    repo.upsertAppointment(next);
    logAudit('Scheduled appointment', `${appt.type}${appt.leadName ? ' · ' + appt.leadName : ''} on ${appt.date}`);
  }, [currentUser, logAudit]);

  const updateAppointment = useCallback((id, updates) => {
    if (!snapshot) return;
    const a = snapshot.appointments.find(x => x.id === id);
    if (!a) return;
    repo.upsertAppointment({ ...a, ...updates });
  }, [snapshot]);

  const deleteAppointment = useCallback((id) => repo.deleteAppointment(id), []);

  // ---------- After-Sales ----------
  const addAfterSales = useCallback((leadId, caseData) => {
    if (!snapshot) return;
    const l = snapshot.leads.find(x => x.id === leadId);
    if (!l) return;
    const now = new Date().toISOString();
    const newCase = { ...caseData, id: `as_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      createdAt: now, createdBy: currentUser, status: 'open', handoverFormSigned: false, resolvedAt: null };
    const next = { ...l,
      afterSales: [newCase, ...(l.afterSales || [])],
      updatedAt: now,
      history: [{ timestamp: now, user: currentUser, type: 'aftersales',
        message: `After-sales case opened: ${caseData.issue?.slice(0, 50) || 'New case'}` }, ...(l.history || [])].slice(0, 100) };
    repo.upsertLead(next);
  }, [snapshot, currentUser]);

  const resolveAfterSales = useCallback((leadId, caseId, driveLink) => {
    if (!snapshot) return;
    const l = snapshot.leads.find(x => x.id === leadId);
    if (!l) return;
    const now = new Date().toISOString();
    const theCase = (l.afterSales || []).find(c => c.id === caseId);
    const afterSales = (l.afterSales || []).map(c => c.id === caseId
      ? { ...c, status: 'resolved', resolvedAt: now, handoverFormSigned: true, driveLink: driveLink || c.driveLink || '', resolvedBy: currentUser }
      : c);
    const next = { ...l, afterSales, updatedAt: now,
      history: [{ timestamp: now, user: currentUser, type: 'aftersales',
        message: `After-sales resolved: ${theCase?.issue?.slice(0, 50) || 'case'} (handover form signed)` }, ...(l.history || [])].slice(0, 100) };
    repo.upsertLead(next);
    logAudit('Resolved after-sales', `${l.clientName} — handover form signed`);
  }, [snapshot, currentUser, logAudit]);

  const deleteAfterSales = useCallback((leadId, caseId) => {
    if (!snapshot) return;
    const l = snapshot.leads.find(x => x.id === leadId);
    if (!l) return;
    repo.upsertLead({ ...l, afterSales: (l.afterSales || []).filter(c => c.id !== caseId) });
  }, [snapshot]);

  // ---------- Follow-up ----------
  const setFollowUp = useCallback((leadId, followUp) => {
    if (!snapshot) return;
    const l = snapshot.leads.find(x => x.id === leadId);
    if (!l) return;
    const now = new Date().toISOString();
    const msg = followUp
      ? `Follow-up set: "${followUp.task}" — due ${followUp.dueDate || 'no date'}, assigned to ${followUp.assignedTo}`
      : 'Follow-up cleared';
    repo.upsertLead({ ...l, followUp, updatedAt: now,
      history: [{ timestamp: now, user: currentUser, type: 'followup', message: msg }, ...(l.history || [])].slice(0, 100) });
    if (followUp) logAudit('Set follow-up task', `${l.clientName}: ${followUp.task} (→ ${followUp.assignedTo})`);
  }, [snapshot, currentUser, logAudit]);

  const completeFollowUp = useCallback((leadId) => {
    if (!snapshot) return;
    const l = snapshot.leads.find(x => x.id === leadId);
    if (!l?.followUp) return;
    const now = new Date().toISOString();
    repo.upsertLead({ ...l, followUp: { ...l.followUp, done: true, completedAt: now, completedBy: currentUser }, updatedAt: now,
      history: [{ timestamp: now, user: currentUser, type: 'followup',
        message: `Follow-up completed: "${l.followUp.task}"` }, ...(l.history || [])].slice(0, 100) });
  }, [snapshot, currentUser]);

  // ---------- Design workflow ----------
  const mutateDesign = useCallback((leadId, mutator, auditMsg) => {
    if (!snapshot) return;
    const l = snapshot.leads.find(x => x.id === leadId);
    if (!l?.designFlow) return;
    const now = new Date().toISOString();
    const df = mutator(l);
    const history = auditMsg
      ? [{ timestamp: now, user: currentUser, type: 'design', message: auditMsg }, ...(l.history || [])].slice(0, 100)
      : l.history;
    repo.upsertLead({ ...l, designFlow: df, updatedAt: now, history });
    if (auditMsg) logAudit('Design step', `${l.clientName}: ${auditMsg}`);
  }, [snapshot, currentUser, logAudit]);

  const completeDesignStep = useCallback((leadId, stepId, decision) => {
    if (!snapshot) return;
    const lead = snapshot.leads.find(l => l.id === leadId);
    if (!lead?.designFlow) return;
    const order = DESIGN_STEPS.map(s => s.id);
    const stepLabel = DESIGN_STEP_MAP[stepId]?.label || stepId;
    const now = new Date().toISOString();

    const mutator = (ld) => {
      const df = ld.designFlow;
      let steps = df.steps.map(s => s.id === stepId
        ? { ...s, status: 'done', completedAt: now, completedBy: currentUser } : s);
      let nextId = null;
      if (stepId === 'review') {
        nextId = decision === 'revise' ? 'revise' : 'internal';
      } else if (stepId === 'revise') {
        nextId = 'review';
      } else {
        const idx = order.indexOf(stepId);
        nextId = order[idx + 1] || null;
        if (nextId === 'revise') nextId = 'internal';
      }
      if (nextId) {
        steps = steps.map(s => s.id !== nextId ? s : {
          ...s, status: 'active', startedAt: now, completedAt: null, completedBy: null,
          dueDate: computeStepDue(nextId, now, ld),
        });
      }
      return { ...df, steps };
    };
    const auditMsg = decision === 'revise'
      ? `${stepLabel} done → sent for revisions`
      : stepId === 'internal'
        ? 'Internal review complete — design ready to present'
        : `${stepLabel} completed`;
    mutateDesign(leadId, mutator, auditMsg);
  }, [snapshot, currentUser, mutateDesign]);

  // Undo the most recently completed step (so accidental "Mark done" clicks
  // can be reversed). Reactivates the last done step and resets the currently
  // active step back to pending.
  const reopenLastDesignStep = useCallback((leadId) => {
    if (!snapshot) return;
    const lead = snapshot.leads.find(l => l.id === leadId);
    if (!lead?.designFlow) return;
    const done = lead.designFlow.steps.filter(s => s.status === 'done');
    if (done.length === 0) return;
    const lastDone = [...done].sort(
      (a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0)
    )[0];
    const currentlyActive = lead.designFlow.steps.find(s => s.status === 'active');
    const now = new Date().toISOString();
    const mutator = (ld) => {
      const df = ld.designFlow;
      const steps = df.steps.map(s => {
        if (s.id === lastDone.id) {
          return {
            ...s, status: 'active', completedAt: null, completedBy: null,
            startedAt: now, dueDate: computeStepDue(s.id, now, ld),
          };
        }
        if (currentlyActive && s.id === currentlyActive.id) {
          return { ...s, status: 'pending', startedAt: null, dueDate: null,
            completedAt: null, completedBy: null };
        }
        return s;
      });
      return { ...df, steps };
    };
    const stepLabel = DESIGN_STEP_MAP[lastDone.id]?.label || lastDone.id;
    mutateDesign(leadId, mutator, `Reopened "${stepLabel}" (undo previous step)`);
  }, [snapshot, mutateDesign]);

  const recomputeInternalDue = (df, ld) => ({
    ...df,
    steps: df.steps.map(s => {
      if (s.id === 'internal' && s.status !== 'done') {
        const from = s.startedAt || new Date().toISOString();
        return { ...s, dueDate: computeStepDue('internal', from, { ...ld, designFlow: df }) };
      }
      return s;
    }),
  });

  const addPresentation = useCallback((leadId, { date, notes }) => {
    if (!snapshot) return;
    const lead = snapshot.leads.find(l => l.id === leadId);
    if (!lead?.designFlow) return;
    const limit = presentationLimit(lead.quotationAmount);
    if ((lead.designFlow.presentations || []).length >= limit) {
      alert(`This quotation tier allows up to ${limit} client presentations. Limit reached.`);
      return;
    }
    mutateDesign(leadId, (ld) => {
      const pres = { id: `pres_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, date, notes: notes || '',
        outcome: 'pending', createdBy: currentUser, createdAt: new Date().toISOString() };
      let df = { ...ld.designFlow, presentations: [...(ld.designFlow.presentations || []), pres] };
      df = recomputeInternalDue(df, ld);
      return df;
    }, `Presentation #${(lead.designFlow.presentations || []).length + 1} scheduled for ${date}`);
  }, [snapshot, currentUser, mutateDesign]);

  const updatePresentation = useCallback((leadId, presId, updates) => {
    mutateDesign(leadId, (ld) => {
      let df = { ...ld.designFlow, presentations: (ld.designFlow.presentations || []).map(p => p.id === presId ? { ...p, ...updates } : p) };
      df = recomputeInternalDue(df, ld);
      return df;
    }, updates.outcome ? `Presentation marked: ${updates.outcome}` : null);
  }, [mutateDesign]);

  const removePresentation = useCallback((leadId, presId) => {
    mutateDesign(leadId, (ld) => {
      let df = { ...ld.designFlow, presentations: (ld.designFlow.presentations || []).filter(p => p.id !== presId) };
      df = recomputeInternalDue(df, ld);
      return df;
    }, 'Presentation record removed');
  }, [mutateDesign]);

  // ---------- Users (manager) ----------
  const addUser    = useCallback((u) => { repo.upsertUser(u); logAudit('Added user', `${u.username}`); }, [logAudit]);
  const updateUser = useCallback((username, updates) => {
    if (!snapshot) return;
    const u = snapshot.users.find(x => x.username === username);
    if (!u) return;
    repo.upsertUser({ ...u, ...updates });
    logAudit('Updated user', `${username}`);
  }, [snapshot, logAudit]);
  const removeUser = useCallback((username) => { repo.deleteUser(username); logAudit('Removed user', username); }, [logAudit]);

  // ---------- Import / Export ----------
  const bulkImport = useCallback(async (file) => {
    try {
      const imported = await parseExcelImport(file);
      if (imported.length === 0) { alert('No valid leads found.'); return; }
      if (!confirm(`Import ${imported.length} leads? They will be added to your existing pipeline.`)) return;
      const merged = [...imported, ...(snapshot?.leads || [])];
      await repo.replaceLeads(merged);
      alert(`Imported ${imported.length} leads.`);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  }, [snapshot]);

  // ---------- Reminders ----------
  const myReminders = useMemo(() => {
    if (!session || !snapshot) return { appts: [], tasks: [] };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in3 = new Date(today); in3.setDate(today.getDate() + 3);
    const myAppts = snapshot.appointments.filter(a => {
      const d = new Date(a.date);
      const mine = role === 'manager' || a.pic === currentUser;
      return mine && d >= today && d <= in3;
    }).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const myTasks = snapshot.leads.filter(l => {
      const f = l.followUp;
      if (!f || f.done) return false;
      const mine = role === 'manager' || f.assignedTo === currentUser;
      if (!mine) return false;
      if (!canViewLead(role, l)) return false;
      return true;
    }).map(l => ({ lead: l, followUp: l.followUp }))
      .sort((a, b) => (a.followUp.dueDate || '9999').localeCompare(b.followUp.dueDate || '9999'));
    return { appts: myAppts, tasks: myTasks };
  }, [snapshot, session, role, currentUser]);

  if (!snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-sail-green border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sail-muted">Loading Sail CRM…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen users={snapshot.users} onLogin={(u) => setSession({ username: u.username, role: u.role })} />;
  }

  const allowedTabs = ROLE_TABS[role] || [];
  const leads = snapshot.leads;

  return (
    <div className="min-h-screen bg-sail-paper">
      <Header
        view={view}
        setView={setView}
        session={session}
        allowedTabs={allowedTabs}
        leadsCount={leads.length}
        onAddLead={() => setShowAddModal(true)}
        onExport={() => exportRowsToExcel(leads.map(leadToRow), 'Leads', 'Sail_All_Leads')}
        onImport={bulkImport}
        onLogout={() => setSession(null)}
        repoMode={repo.mode}
      />

      <ReminderBar reminders={myReminders} setView={setView} setViewingLead={setViewingLead} />

      <main className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 pb-24 safe-bottom">
        {view === 'dashboard' && canSeeDashboard(role) && (
          <DashboardView leads={leads} appointments={snapshot.appointments}
            currentUser={currentUser} role={role}
            setView={setView} setViewingLead={setViewingLead} />
        )}
        {view === 'leads' && (
          <LeadsTableView leads={leads} role={role}
            setViewingLead={setViewingLead} setEditingLead={setEditingLead}
            deleteLead={deleteLead} />
        )}
        {view === 'pipeline' && (
          <PipelineView leads={leads} role={role}
            setViewingLead={setViewingLead} requestStageChange={requestStageChange} />
        )}
        {view === 'confirmed' && (
          <ConfirmedSalesView leads={leads} role={role}
            setViewingLead={setViewingLead} requestStageChange={requestStageChange} />
        )}
        {view === 'design' && (
          <DesignWorkflowView leads={leads} role={role}
            setViewingLead={setViewingLead}
            onCompleteStep={completeDesignStep}
            onReopenLastStep={reopenLastDesignStep}
            onAddPresentation={addPresentation}
            onUpdatePresentation={updatePresentation}
            onRemovePresentation={removePresentation} />
        )}
        {view === 'calendar' && (
          <CalendarView appointments={snapshot.appointments} leads={leads}
            currentUser={currentUser} role={role}
            onAdd={addAppointment} onUpdate={updateAppointment} onDelete={deleteAppointment}
            setViewingLead={setViewingLead}
            seed={apptModalSeed} clearSeed={() => setApptModalSeed(null)} />
        )}
        {view === 'aftersales' && (
          <AfterSalesView leads={leads} setViewingLead={setViewingLead} />
        )}
        {view === 'analytics' && canSeeAnalytics(role) && (
          <AnalyticsView leads={leads} />
        )}
        {view === 'users' && canManageUsers(role) && (
          <UsersView users={snapshot.users} auditLog={snapshot.audit}
            currentUser={currentUser}
            onAdd={addUser} onUpdate={updateUser} onRemove={removeUser} />
        )}
      </main>

      {(showAddModal || editingLead) && (
        <LeadFormModal
          lead={editingLead}
          currentUser={currentUser}
          onClose={() => { setShowAddModal(false); setEditingLead(null); }}
          onSave={(data) => {
            if (editingLead) updateLead(editingLead.id, data);
            else addLead(data);
            setShowAddModal(false);
            setEditingLead(null);
          }}
        />
      )}

      {viewingLead && (
        <LeadDetailModal
          lead={viewingLead}
          appointments={snapshot.appointments}
          role={role}
          users={snapshot.users}
          currentUser={currentUser}
          onClose={() => setViewingLead(null)}
          onEdit={(l) => { setViewingLead(null); setEditingLead(l); }}
          onDelete={(id) => { deleteLead(id); setViewingLead(null); }}
          onRequestStage={(newStage) => requestStageChange(viewingLead, newStage)}
          onAddAppointment={(seed) => { setApptModalSeed(seed); setViewingLead(null); setView('calendar'); }}
          onAddAfterSales={(data) => addAfterSales(viewingLead.id, data)}
          onResolveAfterSales={(caseId, driveLink) => resolveAfterSales(viewingLead.id, caseId, driveLink)}
          onDeleteAfterSales={(caseId) => deleteAfterSales(viewingLead.id, caseId)}
          onSetFollowUp={(fu) => setFollowUp(viewingLead.id, fu)}
          onCompleteFollowUp={() => completeFollowUp(viewingLead.id)}
        />
      )}

      {gateRequest && (
        <StageGateModal
          gateRequest={gateRequest}
          onConfirm={confirmGateMove}
          onCancel={() => setGateRequest(null)}
        />
      )}
    </div>
  );
}
