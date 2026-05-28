// ============================================================
// REPOSITORY — pluggable data backend
//
// Two implementations behind one interface so the rest of the app
// (the useProjects hook) doesn't care where data lives:
//
//   load()                       -> Project[]
//   saveProject(project, all)    -> persist one project
//   removeProject(id, all)       -> delete one project
//   replaceAll(all)              -> wholesale replace (sample / clear)
//   subscribe(onChange)          -> unsubscribe fn (live updates)
//
// localRepo  : single JSON blob in IndexedDB (+ legacy migrations)
// cloudRepo  : one row per project in Supabase + Realtime sync
//
// Attachments are external links only — the app stores URLs in project
// metadata, never binary content. So your files live in Drive / Dropbox,
// not here. If this app disappears, your files don't.
// ============================================================
import { storage } from './storage.js';
import { supabase } from './supabase.js';
import {
  KEY_META,
  KEY_APPOINTMENTS,
  KEY_LEGACY_V8,
  KEY_LEGACY_V7,
  KEY_LEGACY_V6,
  KEY_LEGACY_V5,
  KEY_LEGACY_V4,
  KEY_LEGACY_V3,
} from '../constants/storage.js';
import { LEGACY_GATE_REMAP, LEGACY_STAGE_REMAP } from '../constants/stages.js';

const remapKeys = (obj) => {
  const next = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    next[LEGACY_GATE_REMAP[k] || k] = v;
  });
  return next;
};

// Legacy data may contain attachments with `source: 'upload'` whose
// binary content used to live in storage. We no longer fetch those
// blobs, so we mark such entries as "missing" so users see them and
// can either re-link to Drive or delete.
const sanitizeAttachments = (atts) => {
  const out = {};
  Object.entries(atts || {}).forEach(([gateId, list]) => {
    out[gateId] = (list || [])
      .map((a) => {
        if (a.source === 'link') return a;
        return {
          ...a,
          source: 'link',
          url: a.url || '',
          name: (a.name || 'file') + ' (legacy upload — re-link to Drive)',
        };
      })
      .filter((a) => a.url); // drop legacy uploads with no URL
  });
  return out;
};

const sanitizePhotos = (photos) =>
  (photos || [])
    .map((p) => (p.source === 'link' ? p : { ...p, source: 'link', url: p.url || '' }))
    .filter((p) => p.url);

const migrateRecord = (p, { fromDossier, remap }) => ({
  ...p,
  gates: remap ? remapKeys(p.gates) : p.gates || {},
  notes: remap ? remapKeys(p.notes) : p.notes || {},
  attachments: sanitizeAttachments(remap ? remapKeys(p.attachments) : p.attachments),
  risks: (p.risks || []).map((r) => (remap ? { ...r, stage: LEGACY_STAGE_REMAP[r.stage] || r.stage } : r)),
  forms: {
    SPACE_SURVEY: p.forms?.SPACE_SURVEY || { answers: fromDossier ? p.dossier?.answers || {} : {} },
    MEASUREMENT: p.forms?.MEASUREMENT || { answers: {} },
    SITE_CHECK: p.forms?.SITE_CHECK || { answers: {} },
    INSTALL_QC: p.forms?.INSTALL_QC || { answers: {} },
    HANDOVER: p.forms?.HANDOVER || { answers: {} },
  },
  dailyReports: (p.dailyReports || []).map((r) => ({ ...r, photos: sanitizePhotos(r.photos) })),
  defects: (p.defects || []).map((d) => ({ ...d, photos: sanitizePhotos(d.photos) })),
  designFlow: p.designFlow || null,
});

// ---------- LOCAL (IndexedDB single blob) ----------
export function createLocalRepo() {
  const writeAll = (all) => storage.set(KEY_META, JSON.stringify(all));

  return {
    mode: 'local',

    async load() {
      try {
        const meta = await storage.get(KEY_META);
        if (meta) {
          const parsed = JSON.parse(meta) || [];
          // Apply attachment sanitization on every load (cheap, idempotent).
          return parsed.map((p) => migrateRecord(p, { fromDossier: false, remap: false }));
        }
      } catch (e) { /* fall through to migrations */ }

      const migrations = [
        { key: KEY_LEGACY_V8, fromDossier: false, remap: true },
        { key: KEY_LEGACY_V7, fromDossier: false, remap: true },
        { key: KEY_LEGACY_V6, fromDossier: false, remap: true },
        { key: KEY_LEGACY_V5, fromDossier: true,  remap: true },
        { key: KEY_LEGACY_V4, fromDossier: true,  remap: true },
        { key: KEY_LEGACY_V3, fromDossier: false, remap: true },
      ];
      for (const m of migrations) {
        try {
          const raw = await storage.get(m.key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) continue;
          const migrated = parsed.map((p) => migrateRecord(p, m));
          await writeAll(migrated);
          return migrated;
        } catch (e) { /* try next */ }
      }
      return [];
    },

    saveProject: (_project, all) => writeAll(all),
    removeProject: (_id, all) => writeAll(all),
    replaceAll: (all) => writeAll(all),

    // Appointments — one blob, same simple model as projects.
    async loadAppointments() {
      try {
        const raw = await storage.get(KEY_APPOINTMENTS);
        if (raw) return JSON.parse(raw) || [];
      } catch (e) { /* ignore */ }
      return [];
    },
    saveAppointments: (all) => storage.set(KEY_APPOINTMENTS, JSON.stringify(all)),

    subscribe: () => () => {},
    subscribeAppointments: () => () => {},
  };
}

// ---------- CLOUD (Supabase) ----------
export function createCloudRepo() {
  return {
    mode: 'cloud',

    async load() {
      const { data, error } = await supabase
        .from('projects')
        .select('data')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => migrateRecord(r.data, { fromDossier: false, remap: false }));
    },

    async saveProject(project) {
      const { error } = await supabase
        .from('projects')
        .upsert({ id: project.id, data: project, updated_at: new Date().toISOString() });
      if (error) throw error;
    },

    async removeProject(id) {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
    },

    async replaceAll(all) {
      const { error: delErr } = await supabase.from('projects').delete().not('id', 'is', null);
      if (delErr) throw delErr;
      if (all.length) {
        const rows = all.map((p) => ({ id: p.id, data: p, updated_at: new Date().toISOString() }));
        const { error } = await supabase.from('projects').insert(rows);
        if (error) throw error;
      }
    },

    // Appointments — one row per appointment, mirrors projects pattern.
    async loadAppointments() {
      const { data, error } = await supabase
        .from('appointments')
        .select('data')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => r.data);
    },

    async saveAppointments(all) {
      // Whole-list replace keeps the local + cloud APIs symmetrical.
      const { error: delErr } = await supabase.from('appointments').delete().not('id', 'is', null);
      if (delErr) throw delErr;
      if (all.length) {
        const rows = all.map((a) => ({ id: a.id, data: a, updated_at: new Date().toISOString() }));
        const { error } = await supabase.from('appointments').insert(rows);
        if (error) throw error;
      }
    },

    subscribe(onChange) {
      const channel = supabase
        .channel('projects-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => onChange())
        .subscribe();
      return () => supabase.removeChannel(channel);
    },

    subscribeAppointments(onChange) {
      const channel = supabase
        .channel('appointments-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => onChange())
        .subscribe();
      return () => supabase.removeChannel(channel);
    },
  };
}
