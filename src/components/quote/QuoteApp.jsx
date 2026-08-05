import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Trash2, Copy, Layers, Calculator, FileText, Cloud, LogOut } from 'lucide-react';
import { T } from '../../theme.js';
import { newId } from '../../utils/helpers.js';
import { UIProvider, useToast, useConfirm } from '../ui/UIProvider.jsx';
import { computeQuote, computeLoose, fmtMYR } from '../../constants/pricing.js';
import QuotationView, { blankZone } from './QuotationView.jsx';
import AuthGate from '../auth/AuthGate.jsx';
import { quoteCloud, cloudConfigured } from '../../services/quoteRepo.js';

const STORE_KEY = 'sail.quote.records.v2';

const todayISO = () => new Date().toISOString().slice(0, 10);
const nowTs = () => Date.now();
const versionNum = (r) => { const n = parseInt(r?.meta?.version, 10); return Number.isFinite(n) ? n : 0; };

function newRecord() {
  const id = newId('rec');
  return {
    id,
    groupId: id, // 同一客户的多个版本共享 groupId
    meta: { name: '', location: '', ref: '', pic: '', version: '1', outputLang: 'en', date: todayISO() },
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

const relTime = (ts) => {
  if (!ts) return '';
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return 'now 刚刚';
  if (d < 3600) return `${Math.floor(d / 60)} min 分`;
  if (d < 86400) return `${Math.floor(d / 3600)} hr 时`;
  return new Date(ts).toISOString().slice(0, 10);
};

function Inner({ signOut } = {}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [store, setStore] = useState(load);
  const [q, setQ] = useState('');

  // 本地缓存（activeId 属个人 UI 状态；records 也缓存以便离线/秒开）
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }, [store]);

  // ---- 云端同步（Supabase；配置了才启用，否则纯本地）----
  const saveTimers = useRef({});
  const cloudSave = (rec) => {
    if (!cloudConfigured || !rec) return;
    clearTimeout(saveTimers.current[rec.id]);
    saveTimers.current[rec.id] = setTimeout(() => { quoteCloud.saveRecord(rec).catch(() => {}); }, 600);
  };
  const cloudRemove = (ids) => { if (cloudConfigured && ids.length) quoteCloud.removeMany(ids).catch(() => {}); };

  useEffect(() => {
    if (!cloudConfigured) return;
    let alive = true;
    let migrated = false;
    const pull = async () => {
      try {
        const cloudRecs = await quoteCloud.load();
        if (!alive) return;
        // 首次开启云端且云端为空 → 把本机已有记录上传，避免旧记录“消失”
        if (cloudRecs.length === 0 && !migrated) {
          let local = [];
          try { local = (JSON.parse(localStorage.getItem(STORE_KEY) || '{}').records) || []; } catch (e) { /* ignore */ }
          if (local.length) {
            migrated = true;
            await Promise.all(local.map((r) => quoteCloud.saveRecord(r).catch(() => {})));
            setStore((s) => ({ records: local, activeId: s.activeId || local[0]?.id || null }));
            return;
          }
        }
        setStore((s) => ({ records: cloudRecs, activeId: cloudRecs.some((r) => r.id === s.activeId) ? s.activeId : (cloudRecs[0]?.id || null) }));
      } catch (e) { /* keep local cache */ }
    };
    pull();
    const unsub = quoteCloud.subscribe(pull);
    return () => { alive = false; if (unsub) unsub(); };
  }, []);

  const { records, activeId } = store;
  const active = records.find((r) => r.id === activeId) || null;
  const gidOf = (r) => r.groupId || r.id;

  // 每份记录的总额（定制 + 家具）
  const totals = useMemo(() => {
    const m = {};
    records.forEach((r) => {
      const cab = computeQuote(r.zones, r.adjustPct, r.discountMode, r.discountAmt).net;
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
    const rec = newRecord();
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
    const copy = { ...structuredClone(src), id: nid, groupId: nid, createdAt: nowTs(), updatedAt: nowTs() };
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
    const copy = { ...structuredClone(src), id: newId('rec'), groupId: gid, createdAt: nowTs(), updatedAt: nowTs() };
    copy.meta = { ...copy.meta, version: String(maxV + 1), date: todayISO() };
    cloudSave(copy);
    return { records: [copy, ...s.records], activeId: copy.id };
  });

  // 删除单个版本（若为该组最后一个版本，则该客户消失）
  const removeVersion = async (id) => {
    const rec = records.find((r) => r.id === id);
    if (!rec) return;
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
      cloudRemove([id]);
      toast('Deleted 已删除', 'success');
    }
  };

  // 删除整个客户（所有版本）
  const removeCustomer = async (g) => {
    if (await confirm({ title: 'Delete 删除客户', message: `Delete「${g.latest.meta.name || '未命名'}」and all ${g.recs.length} version(s)? 删除该客户全部版本?`, danger: true, confirmText: 'Delete 删除', cancelText: 'Cancel 取消' })) {
      const ids = g.recs.map((r) => r.id);
      setStore((s) => {
        const rest = s.records.filter((r) => (r.groupId || r.id) !== g.gid);
        return { records: rest, activeId: rest.some((r) => r.id === s.activeId) ? s.activeId : (rest[0]?.id || null) };
      });
      cloudRemove(ids);
      toast('Deleted 已删除', 'success');
    }
  };

  return (
    <div className="min-h-screen font-body" style={{ background: T.paper, color: T.ink }}>
      {/* 顶栏 */}
      <header className="sticky top-0 z-30 backdrop-blur-md no-print"
        style={{ background: 'rgba(250,248,243,0.9)', borderBottom: `1px solid ${T.lineSoft}` }}>
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <Calculator size={18} style={{ color: T.wood }} />
            <div className="font-display text-2xl" style={{ color: T.ink }}>Estimated Quotation <span className="text-base">预估报价</span></div>
            <div className="hidden md:block text-xs uppercase tracking-[0.2em]" style={{ color: T.inkSoft }}>
              SAIL by Riccione Reka
            </div>
          </div>
          <div className="flex items-center gap-3">
            {cloudConfigured && (
              <span className="hidden md:flex items-center gap-1 text-[11px]" style={{ color: T.sage }} title="Shared team cloud 团队云同步">
                <Cloud size={13} /> Cloud 云同步
              </span>
            )}
            <button onClick={create} className="flex items-center gap-1.5 px-4 py-2 text-sm"
              style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.wood)}
              onMouseLeave={(e) => (e.currentTarget.style.background = T.ink)}>
              <Plus size={14} /> New 新客户报价
            </button>
            {signOut && (
              <button onClick={signOut} className="p-2" style={{ color: T.inkSoft }} title="Sign out 退出登录">
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 py-6 grid gap-6" style={{ gridTemplateColumns: '260px minmax(0,1fr)' }}>
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
                      <button onClick={(e) => { e.stopPropagation(); removeCustomer(g); }} title="Delete customer 删除客户"
                        style={{ color: T.terra }}><Trash2 size={13} /></button>
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
                        {on && activeGroup.recs.length > 1 && (
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
                Pick a room (Living, Dining, Bedroom…) → pick a cabinet type (Base / Wall / Tall / Panel) →
                enter length only; totals compute automatically (H&lt;1m linear · H≥1m area).<br />
                选区域 → 选柜体类型 → 只填长度，系统自动计算。
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
        <AuthGate>{({ signOut }) => <Inner signOut={signOut} />}</AuthGate>
      </UIProvider>
    );
  }
  return (
    <UIProvider>
      <Inner />
    </UIProvider>
  );
}
