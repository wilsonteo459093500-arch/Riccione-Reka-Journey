// 全局数据：项目 / 报告 / 设置（IndexedDB 持久化）+ 照片入库
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { db, getSetting, setSetting, putMedia, deleteMedia, requestPersist } from './db.js';
import { compressImage, processVideo } from './images.js';
import { uid, mediaIds } from './report.js';

export const DEFAULT_SETTINGS = {
  name: '',
  phone: '',
  dept: '安装部',
  company: '溪岸 Sail by Riccione Reka',
};

const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [projects, setProjects] = useState([]);
  const [reports, setReports] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const reportsRef = useRef(reports);
  reportsRef.current = reports;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, r, s] = await Promise.all([
          db.getAll('projects'),
          db.getAll('reports'),
          getSetting('settings', null),
        ]);
        if (!alive) return;
        setProjects(p.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
        setReports(r);
        setSettings({ ...DEFAULT_SETTINGS, ...(s || {}) });
        setReady(true);
        requestPersist();
      } catch (e) {
        if (alive) setError(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const saveProject = useCallback(async (p) => {
    const now = Date.now();
    const next = { ...p, id: p.id || uid('p_'), createdAt: p.createdAt || now, updatedAt: now };
    await db.put('projects', next);
    setProjects((list) => [next, ...list.filter((x) => x.id !== next.id)]);
    return next;
  }, []);

  const deleteProject = useCallback(async (id) => {
    await db.del('projects', id);
    setProjects((list) => list.filter((x) => x.id !== id));
  }, []);

  const saveReport = useCallback(async (r, { touch = true } = {}) => {
    const next = touch ? { ...r, updatedAt: Date.now() } : r;
    await db.put('reports', next);
    setReports((list) => {
      const i = list.findIndex((x) => x.id === next.id);
      if (i < 0) return [next, ...list];
      const copy = list.slice();
      copy[i] = next;
      return copy;
    });
    return next;
  }, []);

  const deleteReport = useCallback(async (id) => {
    const r = reportsRef.current.find((x) => x.id === id) || (await db.get('reports', id));
    await db.del('reports', id);
    if (r) await deleteMedia(mediaIds(r)).catch(() => {});
    setReports((list) => list.filter((x) => x.id !== id));
  }, []);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const updateSettings = useCallback(async (patch) => {
    const merged = { ...settingsRef.current, ...patch };
    settingsRef.current = merged;
    setSettings(merged);
    await setSetting('settings', merged);
  }, []);

  /** 照片 / 视频入库，返回 media id */
  const addMediaFile = useCallback(async (reportId, file, kind = 'photo') => {
    const id = uid('m_');
    const base = { id, reportId, kind, name: file.name || '', createdAt: Date.now(), caption: '' };
    if (kind === 'video') {
      const v = await processVideo(file);
      await putMedia({ ...base, ...v });
    } else {
      const img = await compressImage(file);
      await putMedia({ ...base, ...img });
    }
    return id;
  }, []);

  /** 签名（canvas 导出的 PNG blob）入库 */
  const addSignature = useCallback(async (reportId, blob, w, h) => {
    const id = uid('m_');
    await putMedia({ id, reportId, kind: 'signature', blob, thumb: blob, w, h, createdAt: Date.now() });
    return id;
  }, []);

  const removeMedia = useCallback((ids) => deleteMedia((ids || []).filter(Boolean)).catch(() => {}), []);

  const reload = useCallback(async () => {
    const [p, r, s] = await Promise.all([db.getAll('projects'), db.getAll('reports'), getSetting('settings', null)]);
    setProjects(p.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
    setReports(r);
    setSettings({ ...DEFAULT_SETTINGS, ...(s || {}) });
  }, []);

  const value = useMemo(
    () => ({
      ready, error, projects, reports, settings,
      saveProject, deleteProject, saveReport, deleteReport, updateSettings,
      addMediaFile, addSignature, removeMedia, reload,
      projectById: (id) => projects.find((p) => p.id === id) || null,
    }),
    [ready, error, projects, reports, settings, saveProject, deleteProject, saveReport, deleteReport,
      updateSettings, addMediaFile, addSignature, removeMedia, reload],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);
