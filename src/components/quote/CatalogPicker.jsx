import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Plus, Check } from 'lucide-react';
import { T } from '../../theme.js';
import { fmtMYR } from '../../constants/pricing.js';

// 单个产品卡片：选颜色/规格 → 添加
function ProductCard({ p, onAdd }) {
  const [vi, setVi] = useState(0);
  const [added, setAdded] = useState(false);
  const v = p.variants[vi] || p.variants[0] || { price: 0, color: '', image: p.image };
  const add = () => {
    onAdd({ type: p.name, model: p.model, color: v.color, qty: '1', unitMyr: v.price, image: v.image || p.image });
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };
  return (
    <div className="rounded overflow-hidden flex flex-col" style={{ border: `1px solid ${T.lineSoft}`, background: T.paper }}>
      <div style={{ aspectRatio: '1 / 1', background: T.cream }}>
        {(v.image || p.image)
          ? <img src={v.image || p.image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : null}
      </div>
      <div className="p-2 flex flex-col gap-1 flex-1">
        <div className="text-xs font-medium leading-tight" style={{ color: T.ink }}>{p.name}</div>
        <div className="text-[10px]" style={{ color: T.inkSoft }}>{[p.model, p.type].filter(Boolean).join(' · ')}</div>
        {p.variants.length > 1 && (
          <select value={vi} onChange={(e) => setVi(Number(e.target.value))}
            className="w-full px-1.5 py-1 text-[11px] outline-none mt-auto"
            style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}>
            {p.variants.map((vv, i) => <option key={i} value={i}>{vv.color || '—'} · {fmtMYR(vv.price)}</option>)}
          </select>
        )}
        <button onClick={add}
          className="mt-1 flex items-center justify-center gap-1 py-1.5 text-xs transition-colors"
          style={{ background: added ? T.sage : T.ink, color: T.paper, borderRadius: '2px' }}>
          {added ? <><Check size={12} /> Added 已添加</> : <><Plus size={12} /> {fmtMYR(v.price)}</>}
        </button>
      </div>
    </div>
  );
}

// Riccione 产品目录选择器（弹窗）。onAdd(item) 把选中产品加入家具明细。
export default function CatalogPicker({ onAdd, onClose }) {
  const [catalog, setCatalog] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    import('../../constants/looseCatalog.js').then((m) => { if (alive) setCatalog(m.LOOSE_CATALOG); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const kw = q.trim().toLowerCase();
    if (!kw) return catalog;
    return catalog.filter((p) =>
      (p.name + ' ' + p.model + ' ' + p.type + ' ' + p.variants.map((v) => v.color).join(' ')).toLowerCase().includes(kw));
  }, [catalog, q]);

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-auto no-print" style={{ background: 'rgba(45,62,54,0.85)' }} onClick={onClose}>
      <div className="min-h-screen flex items-start justify-center p-4">
        <div className="w-full max-w-5xl my-4 flex flex-col" style={{ background: T.paper, borderRadius: '2px', maxHeight: '92vh', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
          {/* header */}
          <div className="flex items-center gap-3 p-4" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
            <div className="font-display text-lg shrink-0" style={{ color: T.ink }}>Riccione Furniture 目录</div>
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: T.inkSoft }} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 搜索 名称 / 型号 / 类型 / 颜色"
                className="w-full pl-8 pr-2 py-2 text-sm outline-none"
                style={{ background: T.cream, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
            </div>
            <span className="text-xs ml-auto shrink-0" style={{ color: T.inkSoft }}>
              {catalog ? `${filtered.length} / ${catalog.length}` : '载入中…'}
            </span>
            <button onClick={onClose} className="p-1.5 shrink-0" style={{ color: T.inkSoft }}><X size={18} /></button>
          </div>
          {/* grid */}
          <div className="p-4 overflow-auto grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {!catalog && <div className="col-span-full text-center py-16 text-sm" style={{ color: T.inkSoft }}>Loading catalog… 载入产品目录…</div>}
            {catalog && filtered.length === 0 && <div className="col-span-full text-center py-16 text-sm" style={{ color: T.inkSoft }}>No match 无匹配</div>}
            {filtered.map((p, i) => <ProductCard key={p.name + i} p={p} onAdd={onAdd} />)}
          </div>
          <div className="p-3 text-center text-[11px]" style={{ borderTop: `1px solid ${T.lineSoft}`, color: T.inkSoft }}>
            点产品加入报价，可连续添加多个；完成后关闭。 Click to add; you can add multiple, then close.
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
