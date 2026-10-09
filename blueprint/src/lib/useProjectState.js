// 编辑器里的项目状态：不可变更新 onChange(updater) + 撤销 / 重做 + 防抖自动保存（IndexedDB）
//   onChange(updater, { coalesce?: string|false, history?: false })
//     updater(project) → newProject；返回同一个对象 = 不变
//     连续打字（同一字段）自动合并成一步撤销；coalesce 可手动指定合并键，false = 不合并
//   自动保存：停手 600 ms 后写库；一直在改也最多 4 s 写一次；切走页面 / 关闭 / 卸载时立即写

import { useCallback, useEffect, useRef, useState } from 'react';
import { saveProject } from '../store/db.js';
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

/**
 * @param {object} initial  已加载的项目
 * @param {{ save?:(p:object)=>Promise, delay?:number, maxWait?:number, onSaveError?:(e:Error)=>void }} [opts]
 */
export function useProjectState(initial, { save = saveProject, delay = 600, maxWait = 4000, onSaveError } = {}) {
  const [state, setState] = useState(() => ({ project: initial, canUndo: false, canRedo: false }));
  const [saveState, setSaveState] = useState('saved'); // 'saved' | 'pending' | 'saving' | 'error'
  const ref = useRef(null);
  if (!ref.current) {
    ref.current = { project: initial, hist: emptyHistory(), dirty: false, timer: null, firstDirtyAt: 0, chain: Promise.resolve(), alive: true };
  }
  const opts = useRef(null);
  opts.current = { save, delay, maxWait, onSaveError };

  /** 立即写库（返回写完的 Promise）；按顺序排队，旧快照不会盖掉新快照 */
  const flush = useCallback(() => {
    const st = ref.current;
    clearTimeout(st.timer);
    st.timer = null;
    if (!st.dirty) return st.chain;
    st.dirty = false;
    st.firstDirtyAt = 0;
    const snapshot = st.project;
    if (st.alive) setSaveState('saving');
    st.chain = track(
      st.chain
        .then(() => opts.current.save(snapshot))
        .then(
          () => {
            if (st.alive && !st.dirty && !st.timer) setSaveState('saved');
          },
          (err) => {
            st.dirty = true;
            if (st.alive) {
              setSaveState('error');
              opts.current.onSaveError?.(err);
            }
          }
        )
    );
    return st.chain;
  }, []);

  const schedule = useCallback(() => {
    const st = ref.current;
    st.dirty = true;
    const now = Date.now();
    if (!st.firstDirtyAt) st.firstDirtyAt = now;
    clearTimeout(st.timer);
    const { delay: d, maxWait: mw } = opts.current;
    st.timer = setTimeout(flush, Math.max(0, Math.min(d, st.firstDirtyAt + mw - now)));
    setSaveState('pending');
  }, [flush]);

  const commit = useCallback(
    (project, hist) => {
      const st = ref.current;
      st.project = project;
      st.hist = hist;
      setState({ project, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0 });
      schedule();
    },
    [schedule]
  );

  const onChange = useCallback(
    (updater, o = {}) => {
      const st = ref.current;
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

  const undo = useCallback(() => {
    const st = ref.current;
    const r = undoStep(st.hist, st.project);
    if (!r) return false;
    commit(r.project, r.hist);
    return true;
  }, [commit]);

  const redo = useCallback(() => {
    const st = ref.current;
    const r = redoStep(st.hist, st.project);
    if (!r) return false;
    commit(r.project, r.hist);
    return true;
  }, [commit]);

  // 切走页面 / 关闭标签 / 卸载时立即保存
  useEffect(() => {
    const st = ref.current;
    st.alive = true;
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const onLeave = () => flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('beforeunload', onLeave);
      flush();
      st.alive = false;
    };
  }, [flush]);

  return {
    project: state.project,
    onChange,
    undo,
    redo,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    saveState,
    flush,
  };
}
