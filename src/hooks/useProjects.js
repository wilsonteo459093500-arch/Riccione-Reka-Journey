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

  const clearAll = useCallback(async () => {
    for (const p of ref.current) {
      for (const gid in p.attachments || {}) {
        for (const att of p.attachments[gid] || []) {
          if (att.source === 'upload') {
            try { await repo.delAttachment(att.id); } catch (e) { /* ignore */ }
          }
        }
      }
    }
    replaceAll([]);
  }, [repo, replaceAll]);

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
      };
      upsert(proj);
      return proj;
    },
    [upsert]
  );

  const deleteProject = useCallback(
    async (id) => {
      const p = ref.current.find((x) => x.id === id);
      const next = ref.current.filter((x) => x.id !== id);
      setRef(next);
      await runSave(async () => {
        await repo.removeProject(id, next);
        if (p) {
          for (const gid in p.attachments || {}) {
            for (const att of p.attachments[gid] || []) {
              if (att.source === 'upload') {
                try { await repo.delAttachment(att.id); } catch (e) { /* ignore */ }
              }
            }
          }
        }
      });
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

  const addAttachment = useCallback(
    async (pid, gid, att, content = null) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      if (att.source === 'upload' && content) {
        try {
          await repo.setAttachment(att.id, content);
        } catch (e) {
          onToast?.('上传失败: ' + (e.message || e), 'error');
          return;
        }
      }
      const nextAtts = { ...(p.attachments || {}) };
      nextAtts[gid] = [...(nextAtts[gid] || []), att];
      updateProject(pid, { attachments: nextAtts });
    },
    [repo, updateProject, onToast]
  );

  const removeAttachment = useCallback(
    async (pid, gid, aid) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      const att = (p.attachments?.[gid] || []).find((a) => a.id === aid);
      if (att?.source === 'upload') {
        try { await repo.delAttachment(aid); } catch (e) { /* ignore */ }
      }
      const nextAtts = { ...(p.attachments || {}) };
      nextAtts[gid] = (nextAtts[gid] || []).filter((a) => a.id !== aid);
      if (nextAtts[gid].length === 0) delete nextAtts[gid];
      updateProject(pid, { attachments: nextAtts });
    },
    [repo, updateProject]
  );

  const fetchAttachment = useCallback(
    async (aid) => {
      try {
        return (await repo.getAttachment(aid)) || null;
      } catch (e) {
        return null;
      }
    },
    [repo]
  );

  const saveDailyReport = useCallback(
    async (pid, report, newPhotoUploads = []) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      for (const upload of newPhotoUploads) {
        if (upload.att.source === 'upload' && upload.content) {
          try {
            await repo.setAttachment(upload.att.id, upload.content);
          } catch (e) {
            onToast?.('照片上传失败: ' + (e.message || e), 'error');
            return;
          }
        }
      }
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
    [repo, updateProject, onToast]
  );

  const deleteDailyReport = useCallback(
    async (pid, rid) => {
      const p = ref.current.find((x) => x.id === pid);
      if (!p) return;
      const r = (p.dailyReports || []).find((x) => x.id === rid);
      if (r) {
        for (const photo of r.photos || []) {
          if (photo.source === 'upload') {
            try { await repo.delAttachment(photo.id); } catch (e) { /* ignore */ }
          }
        }
      }
      updateProject(pid, { dailyReports: (p.dailyReports || []).filter((x) => x.id !== rid) });
    },
    [repo, updateProject]
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
    fetchAttachment,
    saveDailyReport,
    deleteDailyReport,
  };
}
