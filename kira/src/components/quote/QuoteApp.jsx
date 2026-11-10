import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Trash2, Copy, Layers, FileText, Cloud, CloudOff, LogOut, HelpCircle, Download, ShieldCheck, Sparkles, Users, PencilRuler, Receipt, AlertTriangle } from 'lucide-react';
import { T } from '../../theme.js';
import { newId } from '../../utils/helpers.js';
import { UIProvider, useToast, useConfirm } from '../ui/UIProvider.jsx';
import ErrorBoundary from '../ui/ErrorBoundary.jsx';
import { computeLoose, fmtMYR } from '../../constants/pricing.js';
import { computeRecordQuote } from '../../planner/bridge.js';
import KiraMark from '../ui/KiraMark.jsx';
import Guide, { guideSeen } from '../planner/Guide.jsx';
import ImportOld from '../planner/ImportOld.jsx';
import { importOldRecord } from '../../planner/importOld.js';
import { demoRecord } from '../../planner/demo.js';
import QuotationView, { blankZone } from './QuotationView.jsx';
import AuthGate from '../auth/AuthGate.jsx';
import { kiraCloud, cloudConfigured } from '../../services/kiraRepo.js';
import { promoteLocalPlans, replacePlanPaths, retryPlanDeletes, isLocalPath } from '../../services/planImages.js';
import {
  STORE_KEY, PENDING_KEY, PENDING_DEL_KEY, DELETED_KEY, bootDevice,
  mergePull, applyRealtime, mergeTabs, dropIds, canUpload, updatedAtOf,
  addDeleted, unionDeleted, writeJSON, writeSet, clearDevice, persistStore,
} from './sync.js';

// KIRA 自己的本机存储（和旧报价工具 sail.quote.records.v2 完全分开）。各个 key 的意思和同步规则见 sync.js。

const todayISO = () => new Date().toISOString().slice(0, 10);
const nowTs = () => Date.now();
const versionNum = (r) => { const n = parseInt(r?.meta?.version, 10); return Number.isFinite(n) ? n : 0; };
const nameOf = (r) => (typeof r?.meta?.name === 'string' ? r.meta.name : '');
const textOf = (v) => (typeof v === 'string' ? v : '');
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const LS = (() => { try { return window.localStorage; } catch (e) { return null; } })();

function newRecord(ownerId = null) {
  const id = newId('rec');
  return {
    id,
    app: 'kira',
    schema: 1,
    ownerId, // 做的人（只有他能删）；云端以 owner_id 列为准
    groupId: id, // 同一客户的多个版本共享 groupId
    meta: { name: '', phone: '', location: '', ref: '', pic: '', version: '1', outputLang: 'en', date: todayISO() },
    defaults: { door: 'A', carcass: 'A' }, // 整份报价默认系列（柜子可单独改）
    zones: [blankZone('')],
    looseItems: [],
    adjustPct: 0,
    looseAdjustPct: 0,
    cabinetNote: '',
    looseNote: '',
    createdAt: nowTs(),
    updatedAt: nowTs(),
  };
}

const relTime = (ts) => {
  if (!ts) return '';
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return 'now 刚刚';
  if (d < 3600) return `${Math.floor(d / 60)} min 分`;
  if (d < 86400) return `${Math.floor(d / 3600)} hr 时`;
  return new Date(ts).toISOString().slice(0, 10);
};

function Inner({ signOut, user, cloudReady = false } = {}) {
  const toast = useToast();
  const confirm = useConfirm();
  const userId = user?.id || null;
  const cloudOn = cloudConfigured && !!userId; // 云端模式（已登录；cloudReady = 登录已确认，可以上云）
  const [boot] = useState(() => bootDevice(LS, { cloud: cloudConfigured }));
  const [store, setStoreState] = useState(boot.store);
  const [q, setQ] = useState('');
  const [pendingCount, setPendingCount] = useState(() => boot.pending.size + boot.pendingDel.size);
  const [online, setOnline] = useState(() => !isOffline());
  const [disk, setDisk] = useState(null); // 本机存储写不下 / 写失败：{ status, kept, total }
  const [reach, setReach] = useState(null); // 最近一次拉云端：true 成功 / false 连不上
  const [busy, setBusy] = useState(''); // 退出时正在同步
  const [showGuide, setShowGuide] = useState(() => !guideSeen());
  const [importTab, setImportTab] = useState(null); // 'import' | 'parity'
  // 手机底部 3 个 tab：客户 / 设计（编辑）/ 报价（汇总 + 导出）
  const [mtab, setMtab] = useState('edit');
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false));
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const on = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // ---- 本机资料：storeRef 永远是最新的（不等 React 重画），同步逻辑都读它
  const storeRef = useRef(store);
  const setStore = (next) => {
    const v = typeof next === 'function' ? next(storeRef.current) : next;
    if (!v || v === storeRef.current) return;
    storeRef.current = v;
    setStoreState(v);
  };
  const pending = useRef(boot.pending); // 待上云
  const pendingDel = useRef(boot.pendingDel); // 待从云端删除（tombstone）
  const deleted = useRef(boot.deleted); // 本机删过的 id（标签页之间合并用）
  const frozen = useRef(false); // 正在退出 / 别的标签页已清空本机 → 不再写本机
  const readyRef = useRef(cloudReady);
  readyRef.current = cloudReady;

  // 写不进本机（多半是超出浏览器容量）→ 顶栏 + 提示，不再默默失败
  const diskRef = useRef(null);
  const noteDisk = (res) => {
    const bad = res && res.status !== 'ok' ? res : null;
    const was = diskRef.current;
    if (bad === was || (bad && was && bad.status === was.status && bad.kept === was.kept && bad.total === was.total)) return;
    diskRef.current = bad;
    setDisk(bad);
    if (bad && !was) {
      toast(bad.status === 'failed'
        ? (cloudOn
          ? 'Could not save on this device (storage full) 本机存储失败（空间满）—— keep online so changes reach the cloud 请保持连网让改动上云'
          : 'Device storage full — your latest change is NOT saved. Export old quotes (PDF / Excel) and delete them 本机空间满：最新改动没存到！请先把旧报价导出（PDF / Excel）再删掉')
        : `Device storage full: only ${bad.kept} of ${bad.total} quotes kept offline 本机空间满：离线只存 ${bad.kept}/${bad.total} 份（待同步的都在）`, 'error');
    }
  };
  const saveSets = () => {
    if (frozen.current || !LS) return;
    const ok = writeSet(LS, PENDING_KEY, pending.current) && writeSet(LS, PENDING_DEL_KEY, pendingDel.current) && writeJSON(LS, DELETED_KEY, deleted.current);
    if (!ok) noteDisk({ status: 'failed', kept: 0, total: storeRef.current.records.length });
    setPendingCount(pending.current.size + pendingDel.current.size);
  };
  const setIds = (ref, ids, on) => {
    let changed = false;
    ids.forEach((id) => { if (on ? !ref.current.has(id) : ref.current.has(id)) { changed = true; if (on) ref.current.add(id); else ref.current.delete(id); } });
    if (changed) saveSets();
  };
  const setPendingIds = (ids, on) => setIds(pending, ids, on);
  const setDelIds = (ids, on) => setIds(pendingDel, ids, on);

  // 本地缓存（离线也能开、能改）；待同步的、正在看的优先保住
  useEffect(() => {
    if (frozen.current) return;
    // 纯本机模式没有云端备份 → 不能为了写得下而删掉旧报价
    noteDisk(persistStore(LS, store, pending.current, cloudOn ? (id) => cloudIds.current.has(id) : () => false));
  }, [store]);

  // ---- 云端同步（Supabase；配置了才启用，否则纯本地）。规则见 sync.js
  const cloudIds = useRef(new Set()); // 已知在云端的 id（拉云端 / 实时 / 上传成功时更新）
  const cloudKnown = useRef(false);
  const synced = useRef(false); // 上线 / 回到前台 / 重连之后已经拉过云端 → 改动可以直接推；否则等拉完再推
  const lastPull = useRef(0);
  const inflight = useRef({}); // id → 正在上传
  const saveTimers = useRef({});
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; Object.values(saveTimers.current).forEach(clearTimeout); clearTimeout(retry.current.t); };
  }, []);
  const canTalk = () => cloudOn && readyRef.current && !isOffline() && alive.current && !frozen.current;

  const pushNow = (rec) => {
    if (!canUpload(rec, userId, cloudIds.current)) return Promise.resolve(false); // 不替别人新建（会变成我的）
    const insert = !cloudIds.current.has(rec.id);
    const p = kiraCloud.saveRecord(rec).then(() => {
      cloudIds.current.add(rec.id);
      const cur = storeRef.current.records.find((r) => r.id === rec.id);
      if (!cur || updatedAtOf(cur) <= updatedAtOf(rec)) setPendingIds([rec.id], false);
      // 新建的那一行，数据库把主人记成我
      if (insert && cur && !cur.ownerId) setStore((s) => ({ ...s, records: s.records.map((r) => (r.id === rec.id && !r.ownerId ? { ...r, ownerId: userId } : r)) }));
      return true;
    });
    const tracked = p.catch(() => false);
    inflight.current[rec.id] = tracked;
    tracked.then(() => { if (inflight.current[rec.id] === tracked) delete inflight.current[rec.id]; });
    return p;
  };
  const cloudSave = (rec) => {
    if (!cloudOn || !rec) return;
    setPendingIds([rec.id], true); // 先记下「待同步」，离线时有网再推
    clearTimeout(saveTimers.current[rec.id]);
    saveTimers.current[rec.id] = setTimeout(() => {
      delete saveTimers.current[rec.id];
      const cur = storeRef.current.records.find((r) => r.id === rec.id);
      if (cur && canTalk() && synced.current) pushNow(cur).catch(() => {}); // 没拉过最新的 → 先不推，等拉完再推
      else if (cur && canTalk()) resync({ minGapMs: 15000 }); // 上次拉失败 → 有改动就再试拉（拉完会推）
    }, 600);
  };

  // 删除送上云。'done' 已删 · 'queued' 离线 / 失败，留着有网再删 · 'refused' 云端不让删（不是做的人）→ 已恢复
  const sendDeletes = async (ids) => {
    if (!ids.length) return 'done';
    if (!canTalk()) return 'queued';
    await Promise.all(ids.map((id) => inflight.current[id]).filter(Boolean)); // 别让还在路上的上传在删除之后又把它建回来
    try {
      const { deleted: gone, kept } = await kiraCloud.removeMany(ids);
      gone.forEach((id) => cloudIds.current.delete(id));
      setDelIds([...gone, ...kept], false);
      if (kept.length) {
        // 云端拒绝（RLS：只有做的人能删）→ 不再当成已删，下次拉云端就回来
        const log = { ...deleted.current };
        kept.forEach((id) => { delete log[id]; });
        deleted.current = log;
        saveSets();
        resync({ again: true });
        return 'refused';
      }
      return 'done';
    } catch (e) {
      return 'queued';
    }
  };
  const deleteToast = (res) => {
    if (res === 'refused') toast('Cloud refused: only the creator can delete — restored 云端拒绝：只有做的人能删，已恢复', 'error');
    else if (res === 'queued') toast('Deleted on this device; will delete from the cloud when back online 本机已删，有网后自动从云端删除', 'info');
    else toast('Deleted 已删除', 'success');
  };

  // 第三版：本机模式 / 离线时存的户型图（local:…）→ 登录有网后补传，再把记录里的路径换掉（记录照常待同步）
  const promoting = useRef(false);
  const promotePlanImages = async () => {
    if (promoting.current) return;
    promoting.current = true;
    try {
      await retryPlanDeletes().catch(() => {});
      for (const r of storeRef.current.records) {
        if (!(r.plans || []).some((p) => isLocalPath(p?.image?.path)) || !canUpload(r, userId, cloudIds.current)) continue;
        const map = await promoteLocalPlans(r.plans).catch(() => new Map());
        if (!map.size) continue;
        let saved = null;
        setStore((s) => ({ ...s, records: s.records.map((x) => (x.id === r.id ? (saved = { ...x, plans: replacePlanPaths(x.plans || [], map), updatedAt: nowTs() }) : x)) }));
        if (saved) setPendingIds([saved.id], true);
      }
    } finally { promoting.current = false; }
  };

  // 把待删除 / 待同步的推上云（只在拉过云端之后：推的都是比云端新的）
  const flush = async () => {
    if (!canTalk() || !synced.current) return;
    await promotePlanImages();
    if (pendingDel.current.size) {
      const res = await sendDeletes([...pendingDel.current]);
      if (res === 'refused') deleteToast(res);
    }
    const recs = storeRef.current.records.filter((r) => pending.current.has(r.id) && canUpload(r, userId, cloudIds.current));
    await Promise.allSettled(recs.map((r) => pushNow(r)));
    // 本机已没有的待同步 id 清掉
    setPendingIds([...pending.current].filter((id) => !storeRef.current.records.some((r) => r.id === id)), false);
  };

  // 先拉云端合并（每条比 updatedAt），再推。上线 / 回到前台 / 实时重连都会走这里；同时只跑一个，期间再要求就接着再跑一次
  const syncing = useRef(null);
  const again = useRef(false);
  // 拉云端失败（信号差 / 503）→ 有网就自动重试：5 s、15 s、30 s，之后每 60 s，直到成功
  const retry = useRef({ n: 0, t: null });
  const scheduleRetry = () => {
    clearTimeout(retry.current.t);
    if (!alive.current || frozen.current) return;
    const wait = [5000, 15000, 30000][retry.current.n] || 60000;
    retry.current.n += 1;
    retry.current.t = setTimeout(() => { if (alive.current && canTalk()) resync({ again: true }); else scheduleRetry(); }, wait);
  };
  const resync = ({ again: more = false, minGapMs = 0 } = {}) => {
    if (!cloudOn || !readyRef.current || frozen.current) return Promise.resolve();
    if (!more && minGapMs && Date.now() - lastPull.current < minGapMs) return syncing.current || Promise.resolve();
    if (syncing.current) { again.current = true; return syncing.current; }
    const run = async () => {
      do {
        again.current = false;
        let cloud;
        try { cloud = await kiraCloud.load(); } catch (e) { synced.current = false; if (alive.current) setReach(false); scheduleRetry(); return; }
        clearTimeout(retry.current.t); retry.current.n = 0;
        if (!alive.current || frozen.current) return;
        const m = mergePull({ local: storeRef.current, cloud, pending: pending.current, pendingDel: pendingDel.current, userId });
        cloudIds.current = m.cloudIds;
        cloudKnown.current = true;
        lastPull.current = Date.now();
        // 云端重新有的记录（别的设备建回来的）不再当成本机删过
        const revived = m.store.records.filter((r) => deleted.current[r.id]);
        if (revived.length) { const log = { ...deleted.current }; revived.forEach((r) => { delete log[r.id]; }); deleted.current = log; }
        setPendingIds(m.settle, false); // 云端较新 / 一样 → 不再推本机那份
        setDelIds(m.confirmDel, false); // 云端已经没有 → 删除完成
        if (revived.length) saveSets();
        setStore(m.store);
        setReach(true);
        synced.current = true;
        await flush();
      } while (again.current && alive.current && !frozen.current);
    };
    syncing.current = run().finally(() => { syncing.current = null; });
    return syncing.current;
  };

  // 实时：别人改了 / 删了哪一行就只换那一行；断线重连（SUBSCRIBED）→ 重新拉（断线期间漏掉的不会重播）
  useEffect(() => {
    if (!cloudOn || !cloudReady) return undefined;
    const onRow = (ev) => {
      if (frozen.current) return;
      if (ev.type === 'delete') { cloudIds.current.delete(ev.id); setDelIds([ev.id], false); }
      else if (ev.record?.id && !pendingDel.current.has(ev.record.id)) {
        cloudIds.current.add(ev.record.id);
        if (deleted.current[ev.record.id]) { const log = { ...deleted.current }; delete log[ev.record.id]; deleted.current = log; saveSets(); }
      }
      const r = applyRealtime(storeRef.current, ev, { pending: pending.current, pendingDel: pendingDel.current });
      if (r.settle.length) setPendingIds(r.settle, false);
      setStore(r.store);
    };
    const unsub = kiraCloud.subscribe(onRow, (status) => {
      if (status === 'SUBSCRIBED') resync({ again: true });
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resync({ minGapMs: 30000 }); // 实时连不上：至少拉一次
    });
    // 实时一直连不上（被网络挡掉）也要拉
    const t = setTimeout(() => { if (!lastPull.current && !syncing.current) resync(); }, 2500);
    return () => { clearTimeout(t); if (unsub) unsub(); };
  }, [cloudReady]);

  // 有网 / 断网 / 回到前台 / 别的标签页（tab）改了本机资料
  useEffect(() => {
    const on = () => { setOnline(true); synced.current = false; resync({ again: true }); };
    const off = () => { setOnline(false); synced.current = false; };
    const vis = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastPull.current < 15000) return;
      synced.current = false; // 在后台久了可能漏掉实时更新 → 拉完再推
      resync({ again: true });
    };
    const onStorage = (e) => {
      if (frozen.current || (e.storageArea && e.storageArea !== LS)) return;
      if (e.key === null || (e.key === STORE_KEY && e.newValue == null)) {
        // 别的标签页退出登录、清空了本机 → 这个标签页也不再写回去（登录页马上会出来）
        if (cloudOn) { frozen.current = true; Object.values(saveTimers.current).forEach(clearTimeout); setStore({ records: [], activeId: null }); }
        return;
      }
      if (e.key === STORE_KEY) {
        let theirs;
        try { theirs = JSON.parse(e.newValue); } catch (err) { return; }
        setStore((s) => mergeTabs(s, theirs, deleted.current));
      } else if (e.key === PENDING_KEY || e.key === PENDING_DEL_KEY) {
        let ids;
        try { ids = JSON.parse(e.newValue || '[]'); } catch (err) { return; }
        if (!Array.isArray(ids)) return;
        if (e.key === PENDING_KEY) setPendingIds(ids.filter((id) => typeof id === 'string'), true);
        else { setDelIds(ids.filter((id) => typeof id === 'string'), true); setStore((s) => dropIds(s, ids)); }
      } else if (e.key === DELETED_KEY) {
        let theirs;
        try { theirs = JSON.parse(e.newValue || '{}'); } catch (err) { return; }
        const merged = unionDeleted(deleted.current, theirs && typeof theirs === 'object' ? theirs : {});
        const fresh = Object.keys(merged).filter((id) => !(id in deleted.current));
        if (!fresh.length) return;
        deleted.current = merged;
        setPendingIds(fresh, false);
        setStore((s) => dropIds(s, fresh));
      }
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // 退出登录：先尽量把待同步的推上云；还有没推上的 → 问一声；然后清掉这台设备上的 KIRA 资料
  // （下一个登录的人看不到、也不会替前一个人上传），最后才真正退出。
  const unsyncedCount = () => storeRef.current.records.filter((r) => pending.current.has(r.id)).length + pendingDel.current.size;
  const handleSignOut = async () => {
    if (!signOut || busy) return;
    Object.values(saveTimers.current).forEach(clearTimeout);
    saveTimers.current = {};
    if (unsyncedCount() && canTalk()) {
      setBusy('Syncing before sign-out… 退出前同步中…');
      await Promise.race([resync({ again: true }), new Promise((r) => setTimeout(r, 10000))]);
      setBusy('');
    }
    const left = unsyncedCount();
    if (left && !(await confirm({
      title: 'Not synced yet 还没同步',
      message: `${left} change(s) have not reached the cloud and will be removed from this device if you sign out now. Stay online and try again to keep them. 还有 ${left} 个改动没上云，现在退出会从这台设备删掉；连上网再退出就能保住。`,
      danger: true, confirmText: 'Sign out anyway 仍然退出', cancelText: 'Stay 留下',
    }))) {
      resync({ again: true });
      return;
    }
    frozen.current = true;
    clearDevice(LS);
    await signOut();
  };

  // 只有做的人自己能删（本机模式 / 没有记录主人的旧资料 / 云端根本没有的本机记录 → 都能删）
  const canDelete = (r) => !cloudConfigured || !r?.ownerId || !userId || r.ownerId === userId || (cloudKnown.current && !cloudIds.current.has(r.id));

  const { records, activeId } = store;
  const active = records.find((r) => r.id === activeId) || null;
  const gidOf = (r) => r.groupId || r.id;

  // 每份记录的总额（定制 + 家具）
  const totals = useMemo(() => {
    const m = {};
    records.forEach((r) => {
      try {
        const cab = computeRecordQuote(r).net;
        const loose = computeLoose(r.looseItems || [], r.looseAdjustPct || 0, r.looseDiscountMode, r.looseDiscountAmt).net;
        m[r.id] = cab + loose;
      } catch (e) { m[r.id] = 0; } // 坏资料：列表照常显示，不让整个 app 出错
    });
    return m;
  }, [records]);

  // 按客户（groupId）分组；每组内按版本号排序
  const groupList = useMemo(() => {
    const m = new Map();
    records.forEach((r) => {
      const g = gidOf(r);
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(r);
    });
    const arr = [];
    for (const [gid, recs] of m) {
      recs.sort((a, b) => versionNum(a) - versionNum(b) || (a.createdAt || 0) - (b.createdAt || 0));
      const latest = recs[recs.length - 1];
      const updatedAt = Math.max(...recs.map((r) => r.updatedAt || 0));
      arr.push({ gid, recs, latest, updatedAt });
    }
    arr.sort((a, b) => b.updatedAt - a.updatedAt);
    return arr;
  }, [records]);

  const filteredGroups = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return groupList;
    return groupList.filter(({ latest }) =>
      nameOf(latest).toLowerCase().includes(kw) ||
      textOf(latest.meta?.location).toLowerCase().includes(kw) ||
      textOf(latest.meta?.ref).toLowerCase().includes(kw));
  }, [groupList, q]);

  // 当前客户组（含所有版本，用于顶部版本 tab）
  const activeGroup = useMemo(() => {
    if (!active) return null;
    return groupList.find((g) => g.gid === gidOf(active)) || null;
  }, [groupList, active]);

  const create = () => {
    const rec = newRecord(userId);
    setMtab('edit');
    setStore((s) => ({ records: [rec, ...s.records], activeId: rec.id }));
    cloudSave(rec);
  };

  const openRec = (id) => setStore((s) => ({ ...s, activeId: id }));

  // 示范报价 / 导入旧报价（复制一份，旧的不动）
  const addRecord = (rec) => { setMtab('edit'); setStore((s) => ({ records: [rec, ...s.records], activeId: rec.id })); cloudSave(rec); };
  const openDemo = () => { addRecord(demoRecord(userId)); setShowGuide(false); toast('Demo quote added 已加示范报价', 'success'); };
  const importOld = async (old) => {
    const rec = importOldRecord(old, { ownerId: userId, newId: () => newId('rec') });
    addRecord(rec);
    setImportTab(null);
    toast(`Imported 已导入：${old.meta?.name || '—'} Rev ${old.meta?.version || '1'}`, 'success');
  };

  // 打开某客户：定位到最新版本（若该组已有版本正在编辑则保持）
  const openGroup = (g) => { setMtab('edit'); openGroupRaw(g); };
  const openGroupRaw = (g) => setStore((s) => {
    const inGroup = g.recs.some((r) => r.id === s.activeId);
    return { ...s, activeId: inGroup ? s.activeId : g.latest.id };
  });

  const updateActive = (doc) => setStore((s) => {
    let saved = null;
    const records = s.records.map((r) => (r.id === s.activeId ? (saved = { ...r, ...doc, updatedAt: nowTs() }) : r));
    cloudSave(saved);
    return { ...s, records };
  });

  // 复制：同户型换客户 —— 新的 groupId，版本重置为 1。
  const duplicate = (id) => setStore((s) => {
    const src = s.records.find((r) => r.id === id);
    if (!src) return s;
    const nid = newId('rec');
    const copy = { ...structuredClone(src), id: nid, groupId: nid, ownerId: userId, createdAt: nowTs(), updatedAt: nowTs() };
    copy.meta = { ...copy.meta, name: (nameOf(copy) || '未命名') + ' (Copy 副本)', version: '1' };
    cloudSave(copy);
    return { records: [copy, ...s.records], activeId: copy.id };
  });

  // 新版本：同客户改版 —— 复制当前版本，groupId 不变，版本号取组内最大 +1，切到新版本。
  const newVersion = (id) => setStore((s) => {
    const src = s.records.find((r) => r.id === id);
    if (!src) return s;
    const gid = src.groupId || src.id;
    const maxV = Math.max(0, ...s.records.filter((r) => (r.groupId || r.id) === gid).map(versionNum));
    const copy = { ...structuredClone(src), id: newId('rec'), groupId: gid, ownerId: userId, createdAt: nowTs(), updatedAt: nowTs() };
    copy.meta = { ...copy.meta, version: String(maxV + 1), date: todayISO() };
    cloudSave(copy);
    return { records: [copy, ...s.records], activeId: copy.id };
  });

  // 删除：本机马上删；记进删除记录（别的标签页不会带回来）+ 云端待删除（tombstone，离线就有网再删）
  const removeIds = async (ids) => {
    ids.forEach((id) => { clearTimeout(saveTimers.current[id]); delete saveTimers.current[id]; });
    deleted.current = addDeleted(deleted.current, ids);
    ids.forEach((id) => { pending.current.delete(id); if (cloudOn) pendingDel.current.add(id); });
    saveSets();
    deleteToast(cloudOn ? await sendDeletes(ids) : 'done');
  };

  // 删除单个版本（若为该组最后一个版本，则该客户消失）
  const removeVersion = async (id) => {
    const rec = records.find((r) => r.id === id);
    if (!rec) return;
    if (!canDelete(rec)) { toast('Only the creator can delete 只有做这份报价的人能删', 'error'); return; }
    if (await confirm({ title: 'Delete 删除版本', message: `Delete Rev ${textOf(rec.meta?.version) || '1'} of「${nameOf(rec) || '未命名'}」? 确定删除这个版本?`, danger: true, confirmText: 'Delete 删除', cancelText: 'Cancel 取消' })) {
      setStore((s) => {
        const rest = s.records.filter((r) => r.id !== id);
        let nextActive = s.activeId;
        if (s.activeId === id) {
          const sameGroup = rest.filter((r) => (r.groupId || r.id) === (rec.groupId || rec.id));
          nextActive = (sameGroup[sameGroup.length - 1]?.id) || rest[0]?.id || null;
        }
        return { records: rest, activeId: nextActive };
      });
      await removeIds([id]);
    }
  };

  // 删除整个客户（所有版本）
  const removeCustomer = async (g) => {
    if (!g.recs.every(canDelete)) { toast('Only the creator can delete 只有做这份报价的人能删', 'error'); return; }
    if (await confirm({ title: 'Delete 删除客户', message: `Delete「${nameOf(g.latest) || '未命名'}」and all ${g.recs.length} version(s)? 删除该客户全部版本?`, danger: true, confirmText: 'Delete 删除', cancelText: 'Cancel 取消' })) {
      const ids = g.recs.map((r) => r.id);
      setStore((s) => {
        const rest = s.records.filter((r) => (r.groupId || r.id) !== g.gid);
        return { records: rest, activeId: rest.some((r) => r.id === s.activeId) ? s.activeId : (rest[0]?.id || null) };
      });
      await removeIds(ids);
    }
  };

  const live = online && cloudReady && reach !== false; // 有网、登录已确认、连得上云端 → 可以上云
  const syncTitle = !online ? 'Offline — changes saved on this device 离线：改动已存本机，有网自动同步'
    : !cloudReady ? 'Working offline — will sign in and sync when the connection is back 离线工作：连上网后自动确认登录并同步'
      : reach === false ? 'Cannot reach the cloud — changes saved on this device 连不上云端：改动已存本机，稍后自动同步'
        : pendingCount ? 'Syncing 正在同步' : 'Synced 已同步';

  return (
    <div className="min-h-screen font-body" style={{ background: T.paper, color: T.ink }}>
      {/* 顶栏 */}
      <header className="sticky top-0 z-30 backdrop-blur-md no-print"
        style={{ background: 'rgba(250,248,243,0.9)', borderBottom: `1px solid ${T.lineSoft}` }}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <KiraMark size={28} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-xl sm:text-2xl tracking-[0.12em]" style={{ color: T.ink }}>KIRA</span>
                <span className="text-[10px] uppercase tracking-[0.2em] truncate" style={{ color: T.inkSoft }}>by Riccione Reka</span>
              </div>
              <div className="text-[11px] truncate" style={{ color: T.inkSoft }}>Cabinet Planner & Quotation 柜子规划报价</div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {disk && (
              <span className="flex items-center gap-1 text-[11px]" style={{ color: T.terra }} data-kira-disk={disk.status}
                title={disk.status === 'failed' ? 'Could not save on this device (storage full) 本机存储失败（空间满）' : `Device storage full: ${disk.kept} of ${disk.total} quotes kept offline 本机空间满：离线只存 ${disk.kept}/${disk.total} 份`}>
                <AlertTriangle size={13} />
                <span className="hidden sm:inline">{disk.status === 'failed' ? 'Not saved on device 本机存储失败' : `Storage full 本机空间满 ${disk.kept}/${disk.total}`}</span>
              </span>
            )}
            {cloudConfigured ? (
              <span className="flex items-center gap-1 text-[11px]" style={{ color: !live || pendingCount || busy ? T.terra : T.sage }} title={busy || syncTitle} data-kira-sync={!live ? 'offline' : pendingCount ? 'pending' : 'synced'}>
                {live ? <Cloud size={13} /> : <CloudOff size={13} />}
                <span className="hidden sm:inline">{busy || (!live ? `Offline 离线${pendingCount ? ` · ${pendingCount} 待同步` : ''}` : pendingCount ? `Syncing 同步中 ${pendingCount}` : 'Synced 已同步')}</span>
              </span>
            ) : (
              <span className="hidden sm:flex items-center gap-1 text-[11px]" style={{ color: T.inkSoft }} title="Saved on this device 已存本机">
                Saved on this device 已存本机
              </span>
            )}
            <button onClick={create} className="flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm whitespace-nowrap"
              style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.wood)}
              onMouseLeave={(e) => (e.currentTarget.style.background = T.ink)}>
              <Plus size={14} /> <span className="hidden sm:inline">New 新客户报价</span><span className="sm:hidden">New</span>
            </button>
            {cloudConfigured && (
              <>
                <button onClick={() => setImportTab('import')} className="hidden sm:flex items-center gap-1 p-2 text-xs" style={{ color: T.inkSoft }} title="Import from the old quote tool 导入旧报价（只读）">
                  <Download size={15} /> <span className="hidden lg:inline">Import 导入旧报价</span>
                </button>
                <button onClick={() => setImportTab('parity')} className="hidden sm:flex p-2" style={{ color: T.inkSoft }} title="Price check vs the old tool 对价报告">
                  <ShieldCheck size={16} />
                </button>
              </>
            )}
            <button onClick={() => setShowGuide(true)} className="p-2" style={{ color: T.inkSoft }} title="How to use 怎么用">
              <HelpCircle size={17} />
            </button>
            {signOut && (
              <button onClick={handleSignOut} disabled={!!busy} className="p-2" style={{ color: T.inkSoft }} title="Sign out 退出登录">
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 pb-32 lg:pb-6 grid gap-6 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* 左：客户记录列表（每个客户一张卡，含全部版本）—— 手机上在「客户」tab */}
        <aside className={`no-print space-y-3 ${isMobile && active && mtab !== 'list' ? 'hidden' : ''}`}>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: T.inkSoft }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 搜索 客户/地点/编号"
              className="w-full pl-8 pr-2 py-2 text-sm outline-none"
              style={{ background: T.cream, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
          </div>

          <div className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>
            Customers 客户 · {groupList.length}
          </div>

          <div className="space-y-2">
            {filteredGroups.length === 0 && (
              <div className="text-sm py-6 text-center" style={{ color: T.inkSoft }}>
                {records.length === 0 ? 'No records yet, click New 点右上新建' : 'No match 无匹配结果'}
              </div>
            )}
            {filteredGroups.map((g, gi) => {
              const on = active && gidOf(active) === g.gid;
              const rep = on ? active : g.latest; // 该组激活时显示当前版本信息
              // 交替浅/深底色，方便区分不同客户
              const bg = on ? T.sand : (gi % 2 === 0 ? T.cream : T.lineSoft);
              return (
                <div key={g.gid} onClick={() => openGroup(g)}
                  className="p-3 rounded cursor-pointer transition-all group"
                  style={{ background: bg, border: `1px solid ${on ? T.wood : T.lineSoft}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium truncate" style={{ color: T.ink }}>{nameOf(g.latest) || 'Untitled 未命名客户'}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: T.sand, color: T.inkSoft }}>
                          {g.recs.length > 1 ? `${g.recs.length} Rev` : `Rev ${textOf(g.latest.meta?.version) || '1'}`}
                        </span>
                      </div>
                      <div className="text-xs truncate" style={{ color: T.inkSoft }}>{textOf(g.latest.meta?.location) || '—'}</div>
                    </div>
                    {/* 有鼠标的电脑：移上去才出现；手机 / 平板（没有 hover）：一直显示，按钮够大好点 */}
                    <div className="flex items-center gap-0.5 -mr-1.5 -mt-1 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                      <button onClick={(e) => { e.stopPropagation(); newVersion(g.latest.id); }} title="New version 新版本 (+1)" aria-label="New version 新版本"
                        className="p-1.5" style={{ color: T.inkSoft }}><Layers size={14} /></button>
                      <button onClick={(e) => { e.stopPropagation(); duplicate(g.latest.id); }} title="Duplicate 复制 (换客户)" aria-label="Duplicate 复制"
                        className="p-1.5" style={{ color: T.inkSoft }}><Copy size={14} /></button>
                      {g.recs.every(canDelete) && (
                        <button onClick={(e) => { e.stopPropagation(); removeCustomer(g); }} title="Delete customer 删除客户" aria-label="Delete customer 删除客户"
                          className="p-1.5" style={{ color: T.terra }}><Trash2 size={14} /></button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-display text-sm" style={{ color: T.wood }}>{fmtMYR(totals[rep.id] || 0)}</span>
                    <span className="text-[10px]" style={{ color: T.inkSoft }}>{relTime(g.updatedAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* 右：版本 tab + 报价编辑 */}
        <main className={isMobile && active && mtab === 'list' ? 'hidden' : ''}>
          {active ? (
            <div>
              {/* 版本 tab 栏 */}
              {activeGroup && (
                <div className="no-print flex items-center gap-1 mb-4 flex-wrap" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
                  {activeGroup.recs.map((r) => {
                    const on = r.id === activeId;
                    return (
                      <button key={r.id} onClick={() => openRec(r.id)}
                        className="px-4 py-2 text-sm -mb-px flex items-center gap-2 transition-colors"
                        style={{
                          color: on ? T.ink : T.inkSoft,
                          borderBottom: `2px solid ${on ? T.wood : 'transparent'}`,
                          fontWeight: on ? 600 : 400,
                        }}>
                        Rev {textOf(r.meta?.version) || '1'}
                        {on && activeGroup.recs.length > 1 && canDelete(r) && (
                          <Trash2 size={12} style={{ color: T.terra }}
                            onClick={(e) => { e.stopPropagation(); removeVersion(r.id); }} />
                        )}
                      </button>
                    );
                  })}
                  <button onClick={() => newVersion(active.id)} title="Copy this version into a new revision 复制本版为新版本"
                    className="ml-1 px-3 py-2 text-xs flex items-center gap-1 transition-colors"
                    style={{ color: T.inkSoft }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = T.wood)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = T.inkSoft)}>
                    <Plus size={12} /> New Version 新版本
                  </button>
                </div>
              )}
              {/* 一份报价出错只影响这一份：列表 / 其他客户照常可用 */}
              <ErrorBoundary inline key={active.id}>
                <QuotationView key={active.id} doc={active} onChange={updateActive}
                  planPathShared={(path) => storeRef.current.records.some((r) => r.id !== active.id && (r.plans || []).some((p) => p?.image?.path === path))} mobileTab={isMobile ? mtab : null} onMobileTab={setMtab} />
              </ErrorBoundary>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 text-center" style={{ color: T.inkSoft }}>
              <FileText size={40} strokeWidth={1} style={{ color: T.line }} />
              <div className="font-display text-2xl mt-4" style={{ color: T.ink }}>Select a quotation, or create a new customer</div>
              <div className="text-sm" style={{ color: T.inkSoft }}>选一份报价，或新建客户</div>
              <p className="text-sm mt-3 max-w-md">
                Customer details → add a room (with ceiling height) → add a cabinet from a template →
                type the total width; KIRA splits the doors, draws it and prices it.<br />
                填客户资料 → 加房间（填楼高）→ 选模板加柜子 → 打总宽，自动分门、画图、算价。
              </p>
              <div className="mt-5 flex items-center gap-2 flex-wrap justify-center">
                <button onClick={create} className="flex items-center gap-1.5 px-4 py-2 text-sm"
                  style={{ background: T.wood, color: T.paper, borderRadius: '2px' }}>
                  <Plus size={14} /> New 新客户报价
                </button>
                <button onClick={openDemo} className="flex items-center gap-1.5 px-4 py-2 text-sm"
                  style={{ border: `1px solid ${T.line}`, color: T.ink, borderRadius: '2px' }}>
                  <Sparkles size={14} /> Demo 示范报价
                </button>
                {cloudConfigured && (
                  <button onClick={() => setImportTab('import')} className="flex items-center gap-1.5 px-4 py-2 text-sm"
                    style={{ border: `1px solid ${T.line}`, color: T.ink, borderRadius: '2px' }}>
                    <Download size={14} /> Import 导入旧报价
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
      {/* 手机底部 tab（参考 HISTRONG：Design / Workspace / Summary）*/}
      {isMobile && (
        <nav className="no-print fixed bottom-0 inset-x-0 z-30 grid grid-cols-3" style={{ background: T.paper, borderTop: `1px solid ${T.line}`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {[['list', Users, 'Customers', '客户'], ['edit', PencilRuler, 'Design', '设计'], ['summary', Receipt, 'Quote', '报价']].map(([id, Icon, en, zh]) => {
            const on = (active ? mtab : 'list') === id;
            return (
              <button key={id} onClick={() => setMtab(id)} disabled={!active && id !== 'list'}
                className="flex flex-col items-center gap-0.5 py-2 text-[11px] disabled:opacity-30"
                style={{ color: on ? T.ink : T.inkSoft, background: on ? T.sand : 'transparent', borderTop: `2px solid ${on ? T.ink : 'transparent'}` }}>
                <Icon size={18} /> {zh} {en}
              </button>
            );
          })}
        </nav>
      )}
      {showGuide && <Guide onClose={() => setShowGuide(false)} onDemo={openDemo} videoSrc="/help/kira-demo.webm" />}
      {importTab && <ImportOld initialTab={importTab} onImport={importOld} onClose={() => setImportTab(null)} />}
    </div>
  );
}

export default function QuoteApp() {
  // 配置了 Supabase → 团队登录 + 共享云端；否则纯本地（个人浏览器）。
  // 离线 / 登录还没确认时 cloudReady=false：照样用本机资料报价，改动排队，确认后自动同步。换账号 → key 变 → 重新载入。
  if (cloudConfigured) {
    return (
      <UIProvider>
        <AuthGate>{({ signOut, user, cloudReady }) => <Inner key={user.id} signOut={signOut} user={user} cloudReady={cloudReady} />}</AuthGate>
      </UIProvider>
    );
  }
  return (
    <UIProvider>
      <Inner />
    </UIProvider>
  );
}
