// 编辑器里的项目状态：不可变更新 onChange(updater) + 撤销 / 重做 + 防抖自动保存（IndexedDB）
//   onChange(updater, { coalesce?: string|false, history?: false })
//     updater(project) → newProject；返回同一个对象 = 不变
//     连续打字（同一字段）自动合并成一步撤销；coalesce 可手动指定合并键，false = 不合并
//   自动保存：停手 600 ms 后写库；一直在改也最多 4 s 写一次；切走页面 / 关闭 / 卸载时立即写
//   保存带版本号：库里的项目在别的标签页改过 / 已删除 → 不覆盖，saveState = 'conflict'（请设计师刷新）
//   离开后才回来的异步结果（如 3D 立体图生成完）：交给这个项目当前打开的编辑器；没打开就合并进库里的最新版本

import { useCallback, useEffect, useRef, useState } from 'react';
import { saveProject, getProject } from '../store/db.js';
import { emptyHistory, recordChange, undoStep, redoStep, changeSignature, HISTORY_LIMIT, COALESCE_MS } from './history.js';

// 全局：还没写完的保存（回首页前等一等，项目列表才是最新的）
const inflight = new Set();
function track(p) {
  inflight.add(p);
  const done = () => inflight.delete(p);
  p.then(done, done);
  return p;
}
export const waitForSaves = () => Promise.all([...inflight]).then(() => undefined);

// 本页里正在编辑的项目：projectId → { apply(updater, opts) }
const liveEditors = new Map();

/**
 * @param {object} initial  已加载的项目
 * @param {{ save?:(p:object, rev:number)=>Promise<object>, delay?:number, maxWait?:number,
 *           onSaveError?:(e:Error)=>void, preserve?:(current:object, restored:object)=>object }} [opts]
 *   preserve：撤销 / 重做时把「不进历史」的东西（如 AI 生成的立体图）从当前状态带进恢复的快照
 */
export function useProjectState(initial, { save = saveProject, delay = 600, maxWait = 4000, onSaveError, preserve } = {}) {
  const [state, setState] = useState(() => ({ project: initial, canUndo: false, canRedo: false }));
  const [saveState, setSaveState] = useState('saved'); // 'saved' | 'pending' | 'saving' | 'error' | 'conflict'
  const ref = useRef(null);
  if (!ref.current) {
    ref.current = {
      id: initial?.id,
      rev: initial?.rev || 0,
      project: initial,
      hist: emptyHistory(),
      dirty: false,
      failed: false,
      conflict: null,
      timer: null,
      firstDirtyAt: 0,
      chain: Promise.resolve(true),
      alive: true,
      closed: false,
    };
  }
  const opts = useRef(null);
  opts.current = { save, delay, maxWait, onSaveError, preserve };

  /** 立即写库；按顺序排队，旧快照不会盖掉新快照。返回 Promise<boolean>：true = 最新的修改都已写进库 */
  const flush = useCallback(() => {
    const st = ref.current;
    clearTimeout(st.timer);
    st.timer = null;
    if (st.conflict) return Promise.resolve(false);
    if (!st.dirty) return st.chain;
    st.dirty = false;
    st.firstDirtyAt = 0;
    const snapshot = st.project;
    if (st.alive) setSaveState('saving');
    st.chain = track(
      st.chain
        .then(() => (st.conflict ? Promise.reject(Object.assign(new Error('conflict'), { conflict: st.conflict })) : opts.current.save(snapshot, st.rev)))
        .then(
          (rec) => {
            if (rec && typeof rec.rev === 'number') st.rev = rec.rev;
            st.failed = false;
            if (st.alive && !st.dirty && !st.timer) setSaveState('saved');
            return !st.dirty;
          },
          (err) => {
            st.dirty = true;
            if (err?.conflict) {
              const first = !st.conflict;
              st.conflict = err.conflict;
              if (st.alive) {
                setSaveState('conflict');
                if (first) opts.current.onSaveError?.(err);
              }
              return false;
            }
            st.failed = true;
            if (st.alive) {
              setSaveState('error');
              opts.current.onSaveError?.(err);
            }
            return false;
          }
        )
    );
    return st.chain;
  }, []);

  const schedule = useCallback(() => {
    const st = ref.current;
    st.dirty = true;
    if (st.conflict) return; // 已冲突：不再自动保存，等设计师刷新
    const now = Date.now();
    if (!st.firstDirtyAt) st.firstDirtyAt = now;
    clearTimeout(st.timer);
    const { delay: d, maxWait: mw } = opts.current;
    st.timer = setTimeout(flush, Math.max(0, Math.min(d, st.firstDirtyAt + mw - now)));
    if (st.alive) setSaveState('pending');
  }, [flush]);

  const commit = useCallback(
    (project, hist) => {
      const st = ref.current;
      st.project = project;
      st.hist = hist;
      if (st.alive) setState({ project, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0 });
      schedule();
    },
    [schedule]
  );

  const onChange = useCallback(
    (updater, o = {}) => {
      const st = ref.current;
      if (st.closed) {
        // 编辑器已经关了（异步结果晚到）：交给当前打开的编辑器；没打开就合并进库里的最新版本
        const live = liveEditors.get(st.id);
        if (live) {
          live.apply(updater, { ...o, history: false });
          return;
        }
        if (typeof updater !== 'function') return;
        track(
          st.chain
            .then(() => getProject(st.id))
            .then((rec) => {
              if (!rec) return null; // 项目已删除：不复活
              const next = updater(rec);
              return next && next !== rec ? saveProject(next, rec.rev || 0) : null;
            })
            .catch(() => null)
        );
        return;
      }
      const prev = st.project;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (!next || next === prev) return;
      const hist =
        o.history === false
          ? st.hist
          : recordChange(st.hist, prev, {
              sig: o.coalesce === false ? null : o.coalesce || changeSignature(prev, next),
              now: Date.now(),
              limit: HISTORY_LIMIT,
              coalesceMs: COALESCE_MS,
            });
      commit(next, hist);
    },
    [commit]
  );

  const restore = useCallback(
    (r) => {
      const st = ref.current;
      const keep = opts.current.preserve;
      commit(keep ? keep(st.project, r.project) : r.project, r.hist);
    },
    [commit]
  );

  const undo = useCallback(() => {
    const st = ref.current;
    const r = undoStep(st.hist, st.project);
    if (!r) return false;
    restore(r);
    return true;
  }, [restore]);

  const redo = useCallback(() => {
    const st = ref.current;
    const r = redoStep(st.hist, st.project);
    if (!r) return false;
    restore(r);
    return true;
  }, [restore]);

  // 登记为「本页正在编辑这个项目」；切走页面 / 关闭标签 / 卸载时立即保存
  useEffect(() => {
    const st = ref.current;
    st.alive = true;
    st.closed = false;
    const handle = { apply: (updater, o) => onChange(updater, o) };
    if (st.id) liveEditors.set(st.id, handle);
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const onPageHide = () => flush();
    const onBeforeUnload = (e) => {
      // 保存失败 / 冲突时还有没写进去的修改：让浏览器问一句「确定离开？」
      if (st.dirty && (st.failed || st.conflict)) {
        e.preventDefault();
        e.returnValue = '';
        return;
      }
      flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      flush();
      st.alive = false;
      st.closed = true;
      if (liveEditors.get(st.id) === handle) liveEditors.delete(st.id);
    };
  }, [flush, onChange]);

  return {
    project: state.project,
    onChange,
    undo,
    redo,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    saveState,
    flush,
    /** 有没写进库的修改（保存失败 / 冲突时离开会丢） */
    hasUnsaved: () => ref.current.dirty && (ref.current.failed || !!ref.current.conflict),
  };
}
