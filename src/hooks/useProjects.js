import { useCallback, useEffect, useRef, useState } from 'react';
import { storage } from '../services/storage.js';
import {
  KEY_META,
  KEY_ATT_PREFIX,
  KEY_LEGACY_V5,
  KEY_LEGACY_V4,
  KEY_LEGACY_V3,
} from '../constants/storage.js';
import { newId } from '../utils/helpers.js';
import { sampleProjects } from '../utils/sampleData.js';

const emptyForms = () => ({
  SPACE_SURVEY: { answers: {} },
  MEASUREMENT: { answers: {} },
  INSTALL_QC: { answers: {} },
  HANDOVER: { answers: {} },
});

// Shape any legacy project record into the current schema.
const migrateRecord = (p, { fromDossier }) => ({
  ...p,
  forms: {
    SPACE_SURVEY: { answers: fromDossier ? p.dossier?.answers || {} : {} },
    MEASUREMENT: { answers: {} },
    INSTALL_QC: { answers: {} },
    HANDOVER: { answers: {} },
  },
  attachments: p.attachments || {},
});

export function useProjects({ onToast } = {}) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('idle');

  // Mirror of latest projects so callbacks stay referentially stable
  // (no re-creation on every state change → fewer child re-renders).
  const ref = useRef([]);
  const setRef = (next) => {
    ref.current = next;
    setProjects(next);
  };

  const persist = useCallback(
    async (next) => {
      setSaveStatus('saving');
      try {
        await storage.set(KEY_META, JSON.stringify(next));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch (e) {
        setSaveStatus('idle');
        onToast?.('保存失败 — 数据可能超限，请精简附件或项目。', 'error');
      }
    },
    [onToast]
  );

  const commit = useCallback(
    (next) => {
      setRef(next);
      persist(next);
    },
    [persist]
  );

  // ----- Load + migrate -----
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const meta = await storage.get(KEY_META);
        if (meta && alive) {
          setRef(JSON.parse(meta) || []);
          setLoading(false);
          return;
        }
      } catch (e) { /* fall through to migrations */ }

      const migrations = [
        { key: KEY_LEGACY_V5, fromDossier: true },
        { key: KEY_LEGACY_V4, fromDossier: true },
        { key: KEY_LEGACY_V3, fromDossier: false },
      ];
      for (const m of migrations) {
        try {
          const raw = await storage.get(m.key);
          if (!raw || !alive) continue;
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) continue;
          const migrated = parsed.map((p) => migrateRecord(p, m));
          await storage.set(KEY_META, JSON.stringify(migrated));
          if (alive) {
            setRef(migrated);
            setLoading(false);
          }
          return;
        } catch (e) { /* try next migration */ }
      }
      if (alive) setLoading(false);
    };
    load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Actions (all stable) -----
  const loadSample = useCallback(() => commit(sampleProjects()), [commit]);

  const clearAll = useCallback(async () => {
    for (const p of ref.current) {
      for (const gid in p.attachments || {}) {
        for (const att of p.attachments[gid] || []) {
          if (att.source === 'upload') {
            try { await storage.del(KEY_ATT_PREFIX + att.id); } catch (e) { /* ignore */ }
          }
        }
      }
    }
    commit([]);
  }, [commit]);

  const updateProject = useCallback(
    (id, patch) => {
      commit(
        ref.current.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p
        )
      );
    },
    [commit]
  );

  const toggleGate = useCallback(
    (pid, gid) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      updateProject(pid, { gates: { ...(p.gates || {}), [gid]: !p.gates?.[gid] } });
    },
    [updateProject]
  );

  const addProject = useCallback(
    (data) => {
      const proj = {
        id: newId(),
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        gates: {},
        assigned: { SD: 'Wilson', SS: '', WH: '', PU: '' },
        notes: {},
        risks: [],
        attachments: {},
        forms: emptyForms(),
      };
      commit([proj, ...ref.current]);
      return proj;
    },
    [commit]
  );

  const deleteProject = useCallback(
    async (id) => {
      const p = ref.current.find((x) => x.id === id);
      if (p) {
        for (const gid in p.attachments || {}) {
          for (const att of p.attachments[gid] || []) {
            if (att.source === 'upload') {
              try { await storage.del(KEY_ATT_PREFIX + att.id); } catch (e) { /* ignore */ }
            }
          }
        }
      }
      commit(ref.current.filter((x) => x.id !== id));
    },
    [commit]
  );

  const addRisk = useCallback(
    (pid, r) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      updateProject(pid, {
        risks: [...(p.risks || []), { ...r, id: newId('r'), createdAt: new Date().toISOString() }],
      });
    },
    [updateProject]
  );

  const removeRisk = useCallback(
    (pid, rid) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      updateProject(pid, { risks: (p.risks || []).filter((r) => r.id !== rid) });
    },
    [updateProject]
  );

  const updateNote = useCallback(
    (pid, gid, n) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      updateProject(pid, { notes: { ...(p.notes || {}), [gid]: n } });
    },
    [updateProject]
  );

  const updateForm = useCallback(
    (pid, formCode, answers) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      updateProject(pid, {
        forms: { ...(p.forms || {}), [formCode]: { answers, updatedAt: new Date().toISOString() } },
      });
    },
    [updateProject]
  );

  const addAttachment = useCallback(
    async (pid, gid, att, content = null) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      if (att.source === 'upload' && content) {
        try {
          await storage.set(KEY_ATT_PREFIX + att.id, content);
        } catch (e) {
          onToast?.('上传失败: ' + e.message, 'error');
          return;
        }
      }
      const nextAtts = { ...(p.attachments || {}) };
      nextAtts[gid] = [...(nextAtts[gid] || []), att];
      updateProject(pid, { attachments: nextAtts });
    },
    [updateProject, onToast]
  );

  const removeAttachment = useCallback(
    async (pid, gid, aid) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      const att = (p.attachments?.[gid] || []).find((a) => a.id === aid);
      if (att?.source === 'upload') {
        try { await storage.del(KEY_ATT_PREFIX + aid); } catch (e) { /* ignore */ }
      }
      const nextAtts = { ...(p.attachments || {}) };
      nextAtts[gid] = (nextAtts[gid] || []).filter((a) => a.id !== aid);
      if (nextAtts[gid].length === 0) delete nextAtts[gid];
      updateProject(pid, { attachments: nextAtts });
    },
    [updateProject]
  );

  const fetchAttachment = useCallback(async (aid) => {
    try {
      return (await storage.get(KEY_ATT_PREFIX + aid)) || null;
    } catch (e) {
      return null;
    }
  }, []);

  return {
    projects,
    loading,
    saveStatus,
    loadSample,
    clearAll,
    updateProject,
    toggleGate,
    addProject,
    deleteProject,
    addRisk,
    removeRisk,
    updateNote,
    updateForm,
    addAttachment,
    removeAttachment,
    fetchAttachment,
  };
}
