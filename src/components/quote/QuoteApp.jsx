import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2, Copy, Calculator, FileText } from 'lucide-react';
import { T } from '../../theme.js';
import { newId } from '../../utils/helpers.js';
import { UIProvider, useToast, useConfirm } from '../ui/UIProvider.jsx';
import { computeQuote, fmtMYR } from '../../constants/pricing.js';
import QuotationView, { blankZone } from './QuotationView.jsx';

const STORE_KEY = 'sail.quote.records.v2';

const todayISO = () => new Date().toISOString().slice(0, 10);
const nowTs = () => Date.now();

function newRecord() {
  return {
    id: newId('rec'),
    meta: { name: '', location: '', ref: '', pic: '', date: todayISO() },
    zones: [blankZone('')],
    adjustPct: 0,
    createdAt: nowTs(),
    updatedAt: nowTs(),
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
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

function Inner() {
  const toast = useToast();
  const confirm = useConfirm();
  const [store, setStore] = useState(load);
  const [q, setQ] = useState('');

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }, [store]);

  const { records, activeId } = store;
  const active = records.find((r) => r.id === activeId) || null;

  // 每份记录的总额（用于列表显示）
  const totals = useMemo(() => {
    const m = {};
    records.forEach((r) => { m[r.id] = computeQuote(r.zones, r.adjustPct).net; });
    return m;
  }, [records]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const list = [...records].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!kw) return list;
    return list.filter((r) =>
      (r.meta.name || '').toLowerCase().includes(kw) ||
      (r.meta.location || '').toLowerCase().includes(kw) ||
      (r.meta.ref || '').toLowerCase().includes(kw));
  }, [records, q]);

  const create = () => {
    const rec = newRecord();
    setStore((s) => ({ records: [rec, ...s.records], activeId: rec.id }));
  };

  const openRec = (id) => setStore((s) => ({ ...s, activeId: id }));

  const updateActive = (doc) => setStore((s) => ({
    ...s,
    records: s.records.map((r) => (r.id === s.activeId ? { ...r, ...doc, updatedAt: nowTs() } : r)),
  }));

  const duplicate = (id) => setStore((s) => {
    const src = s.records.find((r) => r.id === id);
    if (!src) return s;
    const copy = { ...structuredClone(src), id: newId('rec'), createdAt: nowTs(), updatedAt: nowTs() };
    copy.meta = { ...copy.meta, name: (copy.meta.name || '未命名') + ' (Copy 副本)' };
    return { records: [copy, ...s.records], activeId: copy.id };
  });

  const remove = async (id) => {
    const rec = records.find((r) => r.id === id);
    if (await confirm({ title: 'Delete 删除报价', message: `Delete this quotation? 确定删除「${rec?.meta.name || '未命名'}」的报价记录?`, danger: true, confirmText: 'Delete 删除', cancelText: 'Cancel 取消' })) {
      setStore((s) => {
        const rest = s.records.filter((r) => r.id !== id);
        return { records: rest, activeId: s.activeId === id ? (rest[0]?.id || null) : s.activeId };
      });
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
          <button onClick={create} className="flex items-center gap-1.5 px-4 py-2 text-sm"
            style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = T.wood)}
            onMouseLeave={(e) => (e.currentTarget.style.background = T.ink)}>
            <Plus size={14} /> New 新客户报价
          </button>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 py-6 grid gap-6" style={{ gridTemplateColumns: '260px minmax(0,1fr)' }}>
        {/* 左：客户记录列表 */}
        <aside className="no-print space-y-3">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: T.inkSoft }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 搜索 客户/地点/编号"
              className="w-full pl-8 pr-2 py-2 text-sm outline-none"
              style={{ background: T.cream, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
          </div>

          <div className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>
            Records 客户记录 · {records.length}
          </div>

          <div className="space-y-2">
            {filtered.length === 0 && (
              <div className="text-sm py-6 text-center" style={{ color: T.inkSoft }}>
                {records.length === 0 ? 'No records yet, click New 点右上新建' : 'No match 无匹配结果'}
              </div>
            )}
            {filtered.map((r) => {
              const on = r.id === activeId;
              return (
                <div key={r.id} onClick={() => openRec(r.id)}
                  className="p-3 rounded cursor-pointer transition-all group"
                  style={{ background: on ? T.sand : T.cream, border: `1px solid ${on ? T.wood : T.lineSoft}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate" style={{ color: T.ink }}>{r.meta.name || 'Untitled 未命名客户'}</div>
                      <div className="text-xs truncate" style={{ color: T.inkSoft }}>{r.meta.location || '—'}</div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); duplicate(r.id); }} title="复制"
                        style={{ color: T.inkSoft }}><Copy size={13} /></button>
                      <button onClick={(e) => { e.stopPropagation(); remove(r.id); }} title="删除"
                        style={{ color: T.terra }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-display text-sm" style={{ color: T.wood }}>{fmtMYR(totals[r.id] || 0)}</span>
                    <span className="text-[10px]" style={{ color: T.inkSoft }}>{relTime(r.updatedAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* 右：报价编辑 */}
        <main>
          {active ? (
            <QuotationView key={active.id} doc={active} onChange={updateActive} />
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
  return (
    <UIProvider>
      <Inner />
    </UIProvider>
  );
}
