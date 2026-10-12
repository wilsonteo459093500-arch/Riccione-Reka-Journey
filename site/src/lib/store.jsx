// 全局数据：项目 / 报告 / 设置（IndexedDB 持久化）+ 照片入库
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { db, getSetting, setSetting, putMedia, deleteMedia, mediaForReport, requestPersist } from './db.js';
import { compressImage, processVideo } from './images.js';
import { uid, mediaIds } from './report.js';
import { applyUiLang, detectUiLang } from './i18n.js';

export const DEFAULT_SETTINGS = {
  name: '',
  phone: '',
  dept: '安装部',
  company: '溪岸 Sail by Riccione Reka',
};

const StoreCtx = createContext(null);

// 读出的设置 + 界面语言：存过就用存的；老用户（有设置但没选过）= 中文；新手机按系统语言猜。
// 猜出来的值放进 settings，第一次保存任何设置时一起存下（以后不会再变）。
function withUiLang(s) {
  const merged = { ...DEFAULT_SETTINGS, ...(s || {}) };
  if (!['zh', 'en', 'both'].includes(merged.uiLang)) merged.uiLang = s ? 'zh' : detectUiLang();
  applyUiLang(merged.uiLang);
  return merged;
}

// 正在处理（压缩 / 截封面 / 入库）的照片与视频：离开编辑页前要等它们写完
const pending = new Set();
function track(promise) {
  pending.add(promise);
  const done = () => pending.delete(promise);
  promise.then(done, done);
  return promise;
}
// 一直等到没有处理中的任务（处理过程中可能又登记了新的）
async function waitMedia() {
  while (pending.size) await Promise.allSettled([...pending]);
}
const pendingMedia = () => pending.size;

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
        setSettings(withUiLang(s));
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
    // 报告引用的 + 所有挂在这份报告名下的（含中途丢失引用的）媒体一起清掉
    const byIndex = await mediaForReport(id).catch(() => []);
    const ids = new Set([...(r ? mediaIds(r) : []), ...byIndex.map((m) => m.id)]);
    await deleteMedia([...ids]).catch(() => {});
    setReports((list) => list.filter((x) => x.id !== id));
  }, []);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const updateSettings = useCallback(async (patch) => {
    const merged = { ...settingsRef.current, ...patch };
    if ('uiLang' in patch) applyUiLang(merged.uiLang);
    settingsRef.current = merged;
    setSettings(merged);
    await setSetting('settings', merged);
  }, []);

  /** 照片 / 视频入库，返回 media id */
  const addMediaFile = useCallback(
    (reportId, file, kind = 'photo') =>
      track(
        (async () => {
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
        })(),
      ),
    [],
  );

  /** 签名（canvas 导出的 PNG blob）入库 */
  const addSignature = useCallback(
    (reportId, blob, w, h) =>
      track(
        (async () => {
          const id = uid('m_');
          await putMedia({ id, reportId, kind: 'signature', blob, thumb: blob, w, h, createdAt: Date.now() });
          return id;
        })(),
      ),
    [],
  );

  const removeMedia = useCallback((ids) => deleteMedia((ids || []).filter(Boolean)).catch(() => {}), []);

  const reload = useCallback(async () => {
    const [p, r, s] = await Promise.all([db.getAll('projects'), db.getAll('reports'), getSetting('settings', null)]);
    setProjects(p.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
    setReports(r);
    setSettings(withUiLang(s));
  }, []);

  const value = useMemo(
    () => ({
      ready, error, projects, reports, settings,
      saveProject, deleteProject, saveReport, deleteReport, updateSettings,
      addMediaFile, addSignature, removeMedia, reload, waitMedia, pendingMedia, track,
      projectById: (id) => projects.find((p) => p.id === id) || null,
    }),
    [ready, error, projects, reports, settings, saveProject, deleteProject, saveReport, deleteReport,
      updateSettings, addMediaFile, addSignature, removeMedia, reload],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);
