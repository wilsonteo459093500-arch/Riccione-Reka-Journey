import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Trash2, Copy, Layers, FileText, Cloud, CloudOff, LogOut } from 'lucide-react';
import { T } from '../../theme.js';
import { newId } from '../../utils/helpers.js';
import { UIProvider, useToast, useConfirm } from '../ui/UIProvider.jsx';
import { computeLoose, fmtMYR } from '../../constants/pricing.js';
import { computeRecordQuote } from '../../planner/bridge.js';
import KiraMark from '../ui/KiraMark.jsx';
import QuotationView, { blankZone } from './QuotationView.jsx';
import AuthGate from '../auth/AuthGate.jsx';
import { kiraCloud, cloudConfigured } from '../../services/kiraRepo.js';

// KIRA 自己的本机存储（和旧报价工具 sail.quote.records.v2 完全分开）
const STORE_KEY = 'kira.records.v1';
const PENDING_KEY = 'kira.pending.v1'; // 还没成功上云的记录 id（离线时累积，有网再推）

const todayISO = () => new Date().toISOString().slice(0, 10);
const nowTs = () => Date.now();
const versionNum = (r) => { const n = parseInt(r?.meta?.version, 10); return Number.isFinite(n) ? n : 0; };

function newRecord(ownerId = null) {
  const id = newId('rec');
  return {
    id,
    app: 'kira',
    schema: 1,
    ownerId, // 做的人（只有他能删）；云端以 owner_id 列为准
    groupId: id, // 同一客户的多个版本共享 groupId
    meta: { name: '', phone: '', location: '', ref: '', pic: '', version: '1', outputLang: 'en', date: todayISO() },
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

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      // 迁移：旧记录没有 groupId → 每条各自成组
      s.records = (s.records || []).map((r) => (r.groupId ? r : { ...r, groupId: r.id }));
      return s;
    }
  } catch (e) { /* ignore */ }
  return { records: [], activeId: null };
}

const loadPending = () => { try { return new Set(JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')); } catch (e) { return new Set(); } };
const savePending = (set) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify([...set])); } catch (e) { /* ignore */ } };

// 云端一行 vs 本机一份：本机有未上云的改动且更新，就留本机；否则以云端为准
const pickNewer = (local, cloud, pending) => {
  if (!local) return cloud;
  if (pending.has(local.id) && (local.updatedAt || 0) >= (cloud.updatedAt || 0)) return { ...local, ownerId: local.ownerId || cloud.ownerId };
  return cloud;
};

const relTime = (ts) => {
  if (!ts) return '';
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return 'now 刚刚';
  if (d < 3600) return `${Math.floor(d / 60)} min 分`;
  if (d < 86400) return `${Math.floor(d / 3600)} hr 时`;
  return new Date(ts).toISOString().slice(0, 10);
};

function Inner({ signOut, user } = {}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [store, setStore] = useState(load);
  const [q, setQ] = useState('');
  const [pendingCount, setPendingCount] = useState(() => loadPending().size);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const userId = user?.id || null;

  // 本地缓存（离线也能开、能改）
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }, [store]);

  // ---- 云端同步（Supabase；配置了才启用，否则纯本地）----
  const pending = useRef(loadPending());
  const storeRef = useRef(store);
  storeRef.current = store;
  const markPending = (id, on) => {
    if (on) pending.current.add(id); else pending.current.delete(id);
    savePending(pending.current);
    setPendingCount(pending.current.size);
  };
  const saveTimers = useRef({});
  const pushNow = (rec) => kiraCloud.saveRecord(rec).then(() => {
    const cur = storeRef.current.records.find((r) => r.id === rec.id);
    if (!cur || (cur.updatedAt || 0) <= (rec.updatedAt || 0)) markPending(rec.id, false);
  });
  const cloudSave = (rec) => {
    if (!cloudConfigured || !rec) return;
    markPending(rec.id, true); // 先记下「待同步」，离线时有网再推
    clearTimeout(saveTimers.current[rec.id]);
    saveTimers.current[rec.id] = setTimeout(() => { pushNow(rec).catch(() => {}); }, 600);
  };
  const cloudRemove = async (ids) => {
    if (!cloudConfigured || !ids.length) return true;
    ids.forEach((id) => markPending(id, false));
    try { await kiraCloud.removeMany(ids); return true; } catch (e) { return false; }
  };
  // 把所有「待同步」的记录推上云（上线时 / 网络恢复时）
  const flushPending = () => {
    if (!cloudConfigured) return;
    const recs = storeRef.current.records.filter((r) => pending.current.has(r.id));
    recs.forEach((r) => pushNow(r).catch(() => {}));
    // 本机已删除但还挂着的 id 清掉
    [...pending.current].forEach((id) => { if (!storeRef.current.records.some((r) => r.id === id)) markPending(id, false); });
  };

  useEffect(() => {
    const on = () => { setOnline(true); flushPending(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!cloudConfigured) return;
    let alive = true;
    const pull = async () => {
      try {
        const cloudRecs = await kiraCloud.load();
        if (!alive) return;
        setStore((s) => {
          const localById = new Map(s.records.map((r) => [r.id, r]));
          const cloudIds = new Set(cloudRecs.map((r) => r.id));
          const merged = cloudRecs.map((c) => pickNewer(localById.get(c.id), c, pending.current));
          // 本机新建、还没上云的记录保留（离线时做的报价）
          s.records.forEach((r) => { if (!cloudIds.has(r.id) && pending.current.has(r.id)) merged.unshift(r); });
          return { records: merged, activeId: merged.some((r) => r.id === s.activeId) ? s.activeId : (merged[0]?.id || null) };
        });
        flushPending();
      } catch (e) { /* 离线 / 网络问题：先用本机缓存 */ }
    };
    pull();
    // 逐行合并：别人改了哪一份就只换那一份；正在编辑且本机更新的不被覆盖
    const unsub = kiraCloud.subscribe((ev) => {
      setStore((s) => {
        if (ev.type === 'delete') {
          if (!s.records.some((r) => r.id === ev.id)) return s;
          const rest = s.records.filter((r) => r.id !== ev.id);
          return { records: rest, activeId: s.activeId === ev.id ? (rest[0]?.id || null) : s.activeId };
        }
        const c = ev.record;
        const i = s.records.findIndex((r) => r.id === c.id);
        if (i < 0) return { ...s, records: [c, ...s.records] };
        const next = pickNewer(s.records[i], c, pending.current);
        if (next === s.records[i]) return s;
        const records = [...s.records];
        records[i] = next;
        return { ...s, records };
      });
    });
    return () => { alive = false; if (unsub) unsub(); };
  }, []);

  // 只有做的人自己能删（本机模式 / 没有记录主人的旧资料 → 都能删）
  const canDelete = (r) => !cloudConfigured || !r?.ownerId || !userId || r.ownerId === userId;

  const { records, activeId } = store;
  const active = records.find((r) => r.id === activeId) || null;
  const gidOf = (r) => r.groupId || r.id;

  // 每份记录的总额（定制 + 家具）
  const totals = useMemo(() => {
    const m = {};
    records.forEach((r) => {
      const cab = computeRecordQuote(r).net;
      const loose = computeLoose(r.looseItems || [], r.looseAdjustPct || 0, r.looseDiscountMode, r.looseDiscountAmt).net;
      m[r.id] = cab + loose;
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
      (latest.meta.name || '').toLowerCase().includes(kw) ||
      (latest.meta.location || '').toLowerCase().includes(kw) ||
      (latest.meta.ref || '').toLowerCase().includes(kw));
  }, [groupList, q]);

  // 当前客户组（含所有版本，用于顶部版本 tab）
  const activeGroup = useMemo(() => {
    if (!active) return null;
    return groupList.find((g) => g.gid === gidOf(active)) || null;
  }, [groupList, active]);

  const create = () => {
    const rec = newRecord(userId);
    setStore((s) => ({ records: [rec, ...s.records], activeId: rec.id }));
    cloudSave(rec);
  };

  const openRec = (id) => setStore((s) => ({ ...s, activeId: id }));

  // 打开某客户：定位到最新版本（若该组已有版本正在编辑则保持）
  const openGroup = (g) => setStore((s) => {
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
    copy.meta = { ...copy.meta, name: (copy.meta.name || '未命名') + ' (Copy 副本)', version: '1' };
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

  // 删除单个版本（若为该组最后一个版本，则该客户消失）
  const removeVersion = async (id) => {
    const rec = records.find((r) => r.id === id);
    if (!rec) return;
    if (!canDelete(rec)) { toast('Only the creator can delete 只有做这份报价的人能删', 'error'); return; }
    if (await confirm({ title: 'Delete 删除版本', message: `Delete Rev ${rec.meta.version || '1'} of「${rec.meta.name || '未命名'}」? 确定删除这个版本?`, danger: true, confirmText: 'Delete 删除', cancelText: 'Cancel 取消' })) {
      setStore((s) => {
        const rest = s.records.filter((r) => r.id !== id);
        let nextActive = s.activeId;
        if (s.activeId === id) {
          const sameGroup = rest.filter((r) => (r.groupId || r.id) === (rec.groupId || rec.id));
          nextActive = (sameGroup[sameGroup.length - 1]?.id) || rest[0]?.id || null;
        }
        return { records: rest, activeId: nextActive };
      });
      const ok = await cloudRemove([id]);
      toast(ok ? 'Deleted 已删除' : 'Deleted here; cloud will retry 本机已删，云端稍后再试', ok ? 'success' : 'error');
    }
  };

  // 删除整个客户（所有版本）
  const removeCustomer = async (g) => {
    if (!g.recs.every(canDelete)) { toast('Only the creator can delete 只有做这份报价的人能删', 'error'); return; }
    if (await confirm({ title: 'Delete 删除客户', message: `Delete「${g.latest.meta.name || '未命名'}」and all ${g.recs.length} version(s)? 删除该客户全部版本?`, danger: true, confirmText: 'Delete 删除', cancelText: 'Cancel 取消' })) {
      const ids = g.recs.map((r) => r.id);
      setStore((s) => {
        const rest = s.records.filter((r) => (r.groupId || r.id) !== g.gid);
        return { records: rest, activeId: rest.some((r) => r.id === s.activeId) ? s.activeId : (rest[0]?.id || null) };
      });
      const ok = await cloudRemove(ids);
      toast(ok ? 'Deleted 已删除' : 'Deleted here; cloud will retry 本机已删，云端稍后再试', ok ? 'success' : 'error');
    }
  };

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
            {cloudConfigured ? (
              <span className="flex items-center gap-1 text-[11px]" style={{ color: !online || pendingCount ? T.terra : T.sage }}
                title={!online ? 'Offline — changes saved on this device 离线：改动已存本机，有网自动同步' : pendingCount ? 'Syncing 正在同步' : 'Synced 已同步'}>
                {online ? <Cloud size={13} /> : <CloudOff size={13} />}
                <span className="hidden sm:inline">{!online ? `Offline 离线${pendingCount ? ` · ${pendingCount} 待同步` : ''}` : pendingCount ? `Syncing 同步中 ${pendingCount}` : 'Synced 已同步'}</span>
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
            {signOut && (
              <button onClick={signOut} className="p-2" style={{ color: T.inkSoft }} title="Sign out 退出登录">
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 grid gap-6 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* 左：客户记录列表（每个客户一张卡，含全部版本）*/}
        <aside className="no-print space-y-3">
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
                        <span className="font-medium truncate" style={{ color: T.ink }}>{g.latest.meta.name || 'Untitled 未命名客户'}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: T.sand, color: T.inkSoft }}>
                          {g.recs.length > 1 ? `${g.recs.length} Rev` : `Rev ${g.latest.meta.version || '1'}`}
                        </span>
                      </div>
                      <div className="text-xs truncate" style={{ color: T.inkSoft }}>{g.latest.meta.location || '—'}</div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); newVersion(g.latest.id); }} title="New version 新版本 (+1)"
                        style={{ color: T.inkSoft }}><Layers size={13} /></button>
                      <button onClick={(e) => { e.stopPropagation(); duplicate(g.latest.id); }} title="Duplicate 复制 (换客户)"
                        style={{ color: T.inkSoft }}><Copy size={13} /></button>
                      {g.recs.every(canDelete) && (
                        <button onClick={(e) => { e.stopPropagation(); removeCustomer(g); }} title="Delete customer 删除客户"
                          style={{ color: T.terra }}><Trash2 size={13} /></button>
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
        <main>
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
                        Rev {r.meta.version || '1'}
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
              <QuotationView key={active.id} doc={active} onChange={updateActive} />
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
              <button onClick={create} className="mt-5 flex items-center gap-1.5 px-4 py-2 text-sm"
                style={{ background: T.wood, color: T.paper, borderRadius: '2px' }}>
                <Plus size={14} /> New 新客户报价
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function QuoteApp() {
  // 配置了 Supabase → 团队登录 + 共享云端；否则纯本地（个人浏览器）。
  if (cloudConfigured) {
    return (
      <UIProvider>
        <AuthGate>{({ signOut, user }) => <Inner signOut={signOut} user={user} />}</AuthGate>
      </UIProvider>
    );
  }
  return (
    <UIProvider>
      <Inner />
    </UIProvider>
  );
}
