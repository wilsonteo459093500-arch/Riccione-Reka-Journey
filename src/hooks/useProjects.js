import { useCallback, useEffect, useRef, useState } from 'react';
import { newId } from '../utils/helpers.js';
import { sampleProjects } from '../utils/sampleData.js';
import {
  initDesignFlow,
  advanceDesignFlow,
  recomputeInternalDue,
  presentationLimit,
} from '../constants/design.js';

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
        assigned: data.assigned || { SD: 'Wilson', SS: '', WH: '', PU: '' },
        notes: {},
        risks: [],
        attachments: {},
        forms: emptyForms(),
        dailyReports: [],
        defects: [],
        afterSales: [],
        designFlow: null,
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

  // ---- After-sales (post-handover warranty / repair tickets) ----
  const saveAfterSale = useCallback(
    (pid, ticket) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      const list = p.afterSales || [];
      const idx = list.findIndex((t) => t.id === ticket.id);
      const now = new Date().toISOString();
      let next;
      if (idx >= 0) next = list.map((t, i) => (i === idx ? { ...ticket, updatedAt: now } : t));
      else next = [...list, { ...ticket, createdAt: now, updatedAt: now }];
      updateProject(pid, { afterSales: next });
    },
    [updateProject]
  );

  const deleteAfterSale = useCallback(
    (pid, asId) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      updateProject(pid, { afterSales: (p.afterSales || []).filter((t) => t.id !== asId) });
    },
    [updateProject]
  );

  const resolveAfterSale = useCallback(
    (pid, asId, { driveLink, resolutionNote }) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      const now = new Date().toISOString();
      updateProject(pid, {
        afterSales: (p.afterSales || []).map((t) =>
          t.id === asId
            ? { ...t, status: 'resolved', resolvedAt: now, driveLink: driveLink || t.driveLink || '', resolutionNote: resolutionNote || t.resolutionNote || '', updatedAt: now }
            : t
        ),
      });
    },
    [updateProject]
  );

  // ---- Design workflow ----
  const startDesignFlow = useCallback(
    (pid) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p || p.designFlow) return;
      updateProject(pid, { designFlow: initDesignFlow(p) });
    },
    [updateProject]
  );

  const completeDesignStep = useCallback(
    (pid, stepId, decision) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p?.designFlow) return;
      updateProject(pid, { designFlow: advanceDesignFlow(p, stepId, decision, 'Wilson') });
    },
    [updateProject]
  );

  const addPresentation = useCallback(
    (pid, payload) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p?.designFlow) return;
      const limit = presentationLimit(p.quotationAmount);
      const used = (p.designFlow.presentations || []).length;
      if (used >= limit) {
        onToast?.(`此报价区间最多 ${limit} 次客户演示, 已达上限`, 'error');
        return;
      }
      const pres = {
        id: newId('pres'),
        date: payload.date,
        notes: payload.notes || '',
        outcome: 'pending',
        createdBy: 'Wilson',
        createdAt: new Date().toISOString(),
      };
      const nextFlow = recomputeInternalDue({
        ...p,
        designFlow: { ...p.designFlow, presentations: [...(p.designFlow.presentations || []), pres] },
      });
      updateProject(pid, { designFlow: nextFlow });
    },
    [updateProject, onToast]
  );

  const updatePresentation = useCallback(
    (pid, presId, updates) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p?.designFlow) return;
      const nextFlow = recomputeInternalDue({
        ...p,
        designFlow: {
          ...p.designFlow,
          presentations: (p.designFlow.presentations || []).map((x) => (x.id === presId ? { ...x, ...updates } : x)),
        },
      });
      updateProject(pid, { designFlow: nextFlow });
    },
    [updateProject]
  );

  const removePresentation = useCallback(
    (pid, presId) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p?.designFlow) return;
      const nextFlow = recomputeInternalDue({
        ...p,
        designFlow: {
          ...p.designFlow,
          presentations: (p.designFlow.presentations || []).filter((x) => x.id !== presId),
        },
      });
      updateProject(pid, { designFlow: nextFlow });
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
    saveAfterSale,
    deleteAfterSale,
    resolveAfterSale,
    startDesignFlow,
    completeDesignStep,
    addPresentation,
    updatePresentation,
    removePresentation,
  };
}
