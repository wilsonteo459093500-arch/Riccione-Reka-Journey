import { useCallback, useEffect, useRef, useState } from 'react';
import { newId } from '../utils/helpers.js';
import { sampleProjects } from '../utils/sampleData.js';

const emptyForms = () => ({
  SPACE_SURVEY: { answers: {} },
  MEASUREMENT: { answers: {} },
  SITE_CHECK: { answers: {} },
  INSTALL_QC: { answers: {} },
  HANDOVER: { answers: {} },
});

export function useProjects(repo, { onToast } = {}) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('idle');

  // Mirror of latest projects so callbacks stay referentially stable.
  const ref = useRef([]);
  const setRef = (next) => {
    ref.current = next;
    setProjects(next);
  };

  // ----- Load + live subscription (re-runs if the backend changes) -----
  useEffect(() => {
    let alive = true;
    setLoading(true);
    repo
      .load()
      .then((list) => {
        if (alive) {
          setRef(list || []);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setLoading(false);
          onToast?.('载入失败: ' + (e.message || e), 'error');
        }
      });

    const unsub = repo.subscribe(async () => {
      try {
        const list = await repo.load();
        if (alive) setRef(list || []);
      } catch (e) { /* ignore transient refetch errors */ }
    });

    return () => {
      alive = false;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  const runSave = useCallback(
    async (fn) => {
      setSaveStatus('saving');
      try {
        await fn();
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch (e) {
        setSaveStatus('idle');
        onToast?.('保存失败: ' + (e.message || e), 'error');
      }
    },
    [onToast]
  );

  // Optimistically update local state, then persist just the changed project.
  const upsert = useCallback(
    (project) => {
      const exists = ref.current.some((p) => p.id === project.id);
      const next = exists
        ? ref.current.map((p) => (p.id === project.id ? project : p))
        : [project, ...ref.current];
      setRef(next);
      runSave(() => repo.saveProject(project, next));
    },
    [repo, runSave]
  );

  const updateProject = useCallback(
    (id, patch) => {
      const cur = ref.current.find((p) => p.id === id);
      if (!cur) return;
      upsert({ ...cur, ...patch, updatedAt: new Date().toISOString() });
    },
    [upsert]
  );

  const replaceAll = useCallback(
    (next) => {
      setRef(next);
      runSave(() => repo.replaceAll(next));
    },
    [repo, runSave]
  );

  const loadSample = useCallback(() => replaceAll(sampleProjects()), [replaceAll]);

  const clearAll = useCallback(() => replaceAll([]), [replaceAll]);

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
        dailyReports: [],
        defects: [],
      };
      upsert(proj);
      return proj;
    },
    [upsert]
  );

  const deleteProject = useCallback(
    (id) => {
      const next = ref.current.filter((x) => x.id !== id);
      setRef(next);
      runSave(() => repo.removeProject(id, next));
    },
    [repo, runSave]
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

  // Attachments are now Drive links only — pure metadata, no binary storage.
  const addAttachment = useCallback(
    (pid, gid, att) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      const nextAtts = { ...(p.attachments || {}) };
      nextAtts[gid] = [...(nextAtts[gid] || []), att];
      updateProject(pid, { attachments: nextAtts });
    },
    [updateProject]
  );

  const removeAttachment = useCallback(
    (pid, gid, aid) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      const nextAtts = { ...(p.attachments || {}) };
      nextAtts[gid] = (nextAtts[gid] || []).filter((a) => a.id !== aid);
      if (nextAtts[gid].length === 0) delete nextAtts[gid];
      updateProject(pid, { attachments: nextAtts });
    },
    [updateProject]
  );

  const saveDailyReport = useCallback(
    (pid, report) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      const list = p.dailyReports || [];
      const idx = list.findIndex((r) => r.id === report.id);
      const now = new Date().toISOString();
      let next;
      if (idx >= 0) {
        next = list.map((r, i) => (i === idx ? { ...report, updatedAt: now } : r));
      } else {
        next = [...list, { ...report, createdAt: now, updatedAt: now }];
      }
      next.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      updateProject(pid, { dailyReports: next });
    },
    [updateProject]
  );

  const deleteDailyReport = useCallback(
    (pid, rid) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      updateProject(pid, { dailyReports: (p.dailyReports || []).filter((x) => x.id !== rid) });
    },
    [updateProject]
  );

  const saveDefect = useCallback(
    (pid, defect) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      const list = p.defects || [];
      const idx = list.findIndex((d) => d.id === defect.id);
      const now = new Date().toISOString();
      let next;
      if (idx >= 0) next = list.map((d, i) => (i === idx ? { ...defect, updatedAt: now } : d));
      else next = [...list, { ...defect, createdAt: now, updatedAt: now }];
      updateProject(pid, { defects: next });
    },
    [updateProject]
  );

  const deleteDefect = useCallback(
    (pid, did) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      updateProject(pid, { defects: (p.defects || []).filter((x) => x.id !== did) });
    },
    [updateProject]
  );

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
    saveDailyReport,
    deleteDailyReport,
    saveDefect,
    deleteDefect,
  };
}
