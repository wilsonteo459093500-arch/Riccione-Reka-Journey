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
//   getAttachment(id)            -> base64 string | null
//   setAttachment(id, content)
//   delAttachment(id)
//   subscribe(onChange)          -> unsubscribe fn (live updates)
//
// localRepo  : single JSON blob in IndexedDB (+ legacy migrations)
// cloudRepo  : one row per project in Supabase + Realtime sync
// ============================================================
import { storage } from './storage.js';
import { supabase } from './supabase.js';
import {
  KEY_META,
  KEY_ATT_PREFIX,
  KEY_LEGACY_V5,
  KEY_LEGACY_V4,
  KEY_LEGACY_V3,
} from '../constants/storage.js';

const migrateRecord = (p, fromDossier) => ({
  ...p,
  forms: {
    SPACE_SURVEY: { answers: fromDossier ? p.dossier?.answers || {} : {} },
    MEASUREMENT: { answers: {} },
    INSTALL_QC: { answers: {} },
    HANDOVER: { answers: {} },
  },
  attachments: p.attachments || {},
});

// ---------- LOCAL (IndexedDB single blob) ----------
export function createLocalRepo() {
  const writeAll = (all) => storage.set(KEY_META, JSON.stringify(all));

  return {
    mode: 'local',

    async load() {
      try {
        const meta = await storage.get(KEY_META);
        if (meta) return JSON.parse(meta) || [];
      } catch (e) { /* fall through to migrations */ }

      const migrations = [
        { key: KEY_LEGACY_V5, fromDossier: true },
        { key: KEY_LEGACY_V4, fromDossier: true },
        { key: KEY_LEGACY_V3, fromDossier: false },
      ];
      for (const m of migrations) {
        try {
          const raw = await storage.get(m.key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) continue;
          const migrated = parsed.map((p) => migrateRecord(p, m.fromDossier));
          await writeAll(migrated);
          return migrated;
        } catch (e) { /* try next */ }
      }
      return [];
    },

    saveProject: (_project, all) => writeAll(all),
    removeProject: (_id, all) => writeAll(all),
    replaceAll: (all) => writeAll(all),

    getAttachment: (id) => storage.get(KEY_ATT_PREFIX + id),
    setAttachment: (id, content) => storage.set(KEY_ATT_PREFIX + id, content),
    delAttachment: (id) => storage.del(KEY_ATT_PREFIX + id),

    subscribe: () => () => {},
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
      return (data || []).map((r) => r.data);
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

    async getAttachment(id) {
      const { data, error } = await supabase
        .from('attachments')
        .select('content')
        .eq('id', id)
        .maybeSingle();
      if (error) return null;
      return data?.content || null;
    },

    async setAttachment(id, content) {
      const { error } = await supabase.from('attachments').upsert({ id, content });
      if (error) throw error;
    },

    async delAttachment(id) {
      await supabase.from('attachments').delete().eq('id', id);
    },

    subscribe(onChange) {
      const channel = supabase
        .channel('projects-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => onChange())
        .subscribe();
      return () => supabase.removeChannel(channel);
    },
  };
}
