// =====================================================================
// Sail CRM — Data Repository
//
// One abstraction over two backends:
//   • cloud (Supabase)  — multi-user, realtime, multi-device
//   • local (IndexedDB) — single browser fallback
//
// All views call repo.* and never touch storage directly. This means we
// can swap backends without changing any UI code.
//
// Schema for Supabase: see /supabase/schema.sql
// =====================================================================

import { cloudConfigured, supabase } from './supabase.js';
import { localKV } from './storage.js';
import { initialLeads } from '../seed.js';
import { DEFAULT_USERS, STAGE_MIGRATION, WON_STAGES, COMPLETE_STAGE } from '../constants.js';
import { initDesignFlow } from '../utils.js';

const KEYS = {
  leads: 'leads',
  appts: 'appointments',
  users: 'users',
  audit: 'audit',
  meta:  'meta',
};

// ---------------------- Lead shape migration ----------------------
// Older / inconsistent records get topped up with required fields so
// the UI never crashes on a missing property.
function upgradeLead(l) {
  let n = { ...l };
  if (STAGE_MIGRATION[n.salesStage]) n.salesStage = STAGE_MIGRATION[n.salesStage];
  n.stageEnteredAt = n.stageEnteredAt || n.updatedAt || n.createdAt || new Date().toISOString();
  n.history = n.history || [{ timestamp: n.createdAt || new Date().toISOString(), user: 'System', type: 'created', message: 'Lead record (existing data)' }];
  if (n.homeAddress === undefined) n.homeAddress = '';
  if (n.afterSales === undefined) n.afterSales = [];
  if (n.signedDetailDrawing === undefined) n.signedDetailDrawing = WON_STAGES.includes(n.salesStage);
  if (n.signedHandoverList === undefined) n.signedHandoverList = n.salesStage === COMPLETE_STAGE;
  if (n.handoverDriveLink === undefined) n.handoverDriveLink = '';
  if (n.followUp === undefined) n.followUp = null;
  if (n.designFlow === undefined) {
    n.designFlow = n.salesStage === 'Stage 3: Design' ? initDesignFlow() : null;
  } else if (n.designFlow && !n.designFlow.presentations) {
    const old = n.designFlow.clientPresentDate;
    const presentations = old ? [{ id: `pres_${Date.now()}`, date: old, notes: '', outcome: 'pending', createdBy: 'System', createdAt: new Date().toISOString() }] : [];
    const { clientPresentDate, ...rest } = n.designFlow;
    n.designFlow = { ...rest, presentations };
  }
  return n;
}

// =====================================================================
// LOCAL REPO (IndexedDB)
// =====================================================================
function makeLocalRepo() {
  // Snapshot in memory; views call subscribe() to receive deltas.
  const state = { leads: [], appointments: [], users: [], audit: [], meta: {} };
  const subs = new Set();
  const emit = () => subs.forEach(fn => fn(snapshot()));
  const snapshot = () => ({ ...state, leads: state.leads.slice(), appointments: state.appointments.slice(), users: state.users.slice(), audit: state.audit.slice() });

  async function load() {
    const [l, a, u, au, m] = await Promise.all([
      localKV.get(KEYS.leads), localKV.get(KEYS.appts),
      localKV.get(KEYS.users), localKV.get(KEYS.audit), localKV.get(KEYS.meta),
    ]);
    state.leads = (l ? JSON.parse(l) : initialLeads).map(upgradeLead);
    state.appointments = a ? JSON.parse(a) : [];
    state.users = u ? JSON.parse(u) : DEFAULT_USERS;
    state.audit = au ? JSON.parse(au) : [];
    state.meta  = m ? JSON.parse(m) : {};
    // First-run: persist seed
    if (!l) await localKV.set(KEYS.leads, JSON.stringify(state.leads));
    if (!u) await localKV.set(KEYS.users, JSON.stringify(state.users));
    emit();
  }

  const persist = {
    leads: () => localKV.set(KEYS.leads, JSON.stringify(state.leads)),
    appts: () => localKV.set(KEYS.appts, JSON.stringify(state.appointments)),
    users: () => localKV.set(KEYS.users, JSON.stringify(state.users)),
    audit: () => localKV.set(KEYS.audit, JSON.stringify(state.audit.slice(0, 500))),
  };

  return {
    mode: 'local',
    init: load,
    subscribe(fn) { subs.add(fn); fn(snapshot()); return () => subs.delete(fn); },
    getSnapshot: snapshot,

    async upsertLead(lead) {
      const idx = state.leads.findIndex(x => x.id === lead.id);
      if (idx >= 0) state.leads[idx] = lead; else state.leads.unshift(lead);
      await persist.leads(); emit();
    },
    async deleteLead(id) {
      state.leads = state.leads.filter(l => l.id !== id);
      state.appointments = state.appointments.filter(a => a.leadId !== id);
      await Promise.all([persist.leads(), persist.appts()]); emit();
    },
    async replaceLeads(leads) {
      state.leads = leads.map(upgradeLead);
      await persist.leads(); emit();
    },

    async upsertAppointment(appt) {
      const idx = state.appointments.findIndex(a => a.id === appt.id);
      if (idx >= 0) state.appointments[idx] = appt; else state.appointments.push(appt);
      await persist.appts(); emit();
    },
    async deleteAppointment(id) {
      state.appointments = state.appointments.filter(a => a.id !== id);
      await persist.appts(); emit();
    },

    async upsertUser(user) {
      const idx = state.users.findIndex(u => u.username === user.username);
      if (idx >= 0) state.users[idx] = user; else state.users.push(user);
      await persist.users(); emit();
    },
    async deleteUser(username) {
      state.users = state.users.filter(u => u.username !== username);
      await persist.users(); emit();
    },

    async appendAudit(entry) {
      state.audit = [entry, ...state.audit].slice(0, 500);
      await persist.audit(); emit();
    },
  };
}

// =====================================================================
// CLOUD REPO (Supabase)
// =====================================================================
// Tables mirror the local KV structure but with id PKs and proper rows.
// The whole-record approach (one JSON column per lead) keeps porting
// simple and lets us evolve the lead shape without migrations.
function makeCloudRepo() {
  const state = { leads: [], appointments: [], users: [], audit: [], meta: {} };
  const subs = new Set();
  const emit = () => subs.forEach(fn => fn(snapshot()));
  const snapshot = () => ({ ...state, leads: state.leads.slice(), appointments: state.appointments.slice(), users: state.users.slice(), audit: state.audit.slice() });

  async function fetchAll() {
    const [leads, appts, users, audit] = await Promise.all([
      supabase.from('leads').select('data').then(r => (r.data || []).map(x => upgradeLead(x.data))),
      supabase.from('appointments').select('data').then(r => (r.data || []).map(x => x.data)),
      supabase.from('users').select('data').then(r => (r.data || []).map(x => x.data)),
      supabase.from('audit').select('data').order('timestamp', { ascending: false }).limit(500).then(r => (r.data || []).map(x => x.data)),
    ]);
    state.leads = leads;
    state.appointments = appts;
    state.users = users.length > 0 ? users : DEFAULT_USERS;
    state.audit = audit;

    // First-run: seed if empty
    if (leads.length === 0) {
      const seeded = initialLeads.map(upgradeLead);
      await supabase.from('leads').insert(seeded.map(l => ({ id: l.id, data: l })));
      state.leads = seeded;
    }
    if (users.length === 0) {
      await supabase.from('users').insert(DEFAULT_USERS.map(u => ({ id: u.username, data: u })));
    }
    emit();
  }

  function listen() {
    // Realtime: re-fetch the affected table on any change. Simple and
    // correct; the lift over per-row delta merging isn't worth it at
    // this team's scale.
    const ch = supabase.channel('crm-sync');
    ['leads', 'appointments', 'users', 'audit'].forEach(table => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        fetchAll();
      });
    });
    ch.subscribe();
  }

  async function ensureAuthed() {
    // Anonymous fallback so the app boots without a forced login flow.
    // For production, replace with proper email/password login.
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      try { await supabase.auth.signInAnonymously(); } catch (_) { /* anon not enabled — that's OK */ }
    }
  }

  return {
    mode: 'cloud',
    async init() {
      await ensureAuthed();
      await fetchAll();
      listen();
    },
    subscribe(fn) { subs.add(fn); fn(snapshot()); return () => subs.delete(fn); },
    getSnapshot: snapshot,

    async upsertLead(lead) {
      const idx = state.leads.findIndex(x => x.id === lead.id);
      if (idx >= 0) state.leads[idx] = lead; else state.leads.unshift(lead);
      emit();
      await supabase.from('leads').upsert({ id: lead.id, data: lead });
    },
    async deleteLead(id) {
      state.leads = state.leads.filter(l => l.id !== id);
      state.appointments = state.appointments.filter(a => a.leadId !== id);
      emit();
      await Promise.all([
        supabase.from('leads').delete().eq('id', id),
        supabase.from('appointments').delete().eq('lead_id', id),
      ]);
    },
    async replaceLeads(leads) {
      state.leads = leads.map(upgradeLead); emit();
      // Bulk replace: wipe & re-insert. This is import-only.
      await supabase.from('leads').delete().neq('id', '');
      const chunks = [];
      for (let i = 0; i < state.leads.length; i += 100) chunks.push(state.leads.slice(i, i + 100));
      for (const chunk of chunks) {
        await supabase.from('leads').insert(chunk.map(l => ({ id: l.id, data: l })));
      }
    },

    async upsertAppointment(appt) {
      const idx = state.appointments.findIndex(a => a.id === appt.id);
      if (idx >= 0) state.appointments[idx] = appt; else state.appointments.push(appt);
      emit();
      await supabase.from('appointments').upsert({ id: appt.id, lead_id: appt.leadId || null, data: appt });
    },
    async deleteAppointment(id) {
      state.appointments = state.appointments.filter(a => a.id !== id); emit();
      await supabase.from('appointments').delete().eq('id', id);
    },

    async upsertUser(user) {
      const idx = state.users.findIndex(u => u.username === user.username);
      if (idx >= 0) state.users[idx] = user; else state.users.push(user);
      emit();
      await supabase.from('users').upsert({ id: user.username, data: user });
    },
    async deleteUser(username) {
      state.users = state.users.filter(u => u.username !== username); emit();
      await supabase.from('users').delete().eq('id', username);
    },

    async appendAudit(entry) {
      state.audit = [entry, ...state.audit].slice(0, 500); emit();
      await supabase.from('audit').insert({ id: entry.id, timestamp: entry.timestamp, data: entry });
    },
  };
}

// =====================================================================
// PUBLIC singleton
// =====================================================================
export const repo = cloudConfigured ? makeCloudRepo() : makeLocalRepo();
