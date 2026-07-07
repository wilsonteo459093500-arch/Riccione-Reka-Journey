import { useState, useEffect, useMemo } from 'react';
import { Plus, Copy, Printer, Trash2, ChevronDown, ChevronRight, FileText, LayoutGrid } from 'lucide-react';
import { T } from '../../theme.js';
import { newId, copyToClipboard } from '../../utils/helpers.js';
import { useToast } from '../ui/UIProvider.jsx';
import {
  computeQuote, CATEGORIES, fmtMYR, CABINET_PRESETS, presetById,
} from '../../constants/pricing.js';
import QuoteLineItem from './QuoteLineItem.jsx';
import QuotePrint from './QuotePrint.jsx';

const STORE_KEY = 'sail.quote.v1';

// ---- 新明细的默认值 ----
function makeItem(type) {
  const base = { id: newId('it') };
  if (type === 'cabinet') {
    const p = presetById('wardrobe');
    return { ...base, type, preset: 'wardrobe', name: '', length: '', h: p.h, d: p.d, doorSeries: 'D', carcassSeries: 'A', drawers: '', hasDoor: true, hasCarcass: true };
  }
  if (type === 'panel') return { ...base, type, preset: 'wall', name: '', length: '', h: 2.7, panelSeries: 'A' };
  if (type === 'roomdoor') return { ...base, type, preset: 'std', desc: '', qty: '1', unitMyr: 7570 };
  if (type === 'led') return { ...base, type, desc: '整体灯带 LED', length: '' };
  return { ...base, type: 'other', desc: '', qty: '1', uom: '项', unitMyr: '' };
}

const ADD_TYPES = [
  { type: 'cabinet', label: '橱柜' },
  { type: 'panel', label: '墙板' },
  { type: 'roomdoor', label: '房门' },
  { type: 'led', label: '灯带' },
  { type: 'other', label: '其他' },
];

const blankZone = (name = '') => ({ id: newId('zone'), name, items: [], collapsed: false });

const seedState = () => ({
  meta: { name: '', location: '', ref: '', pic: '', date: new Date().toISOString().slice(0, 10) },
  zones: [blankZone('玄关鞋柜')],
  adjustPct: 0,
});

export default function QuotationView() {
  const toast = useToast();
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return seedState();
  });
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }, [state]);

  const { meta, zones, adjustPct } = state;
  const computed = useMemo(() => computeQuote(zones, adjustPct), [zones, adjustPct]);

  // ---- mutators ----
  const setMeta = (patch) => setState((s) => ({ ...s, meta: { ...s.meta, ...patch } }));
  const setZones = (fn) => setState((s) => ({ ...s, zones: fn(s.zones) }));
  const addZone = () => setZones((zs) => [...zs, blankZone('')]);
  const updateZone = (id, patch) => setZones((zs) => zs.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  const removeZone = (id) => setZones((zs) => zs.filter((z) => z.id !== id));
  const addItem = (zoneId, type) =>
    setZones((zs) => zs.map((z) => (z.id === zoneId ? { ...z, items: [...z.items, makeItem(type)] } : z)));
  const updateItem = (zoneId, item) =>
    setZones((zs) => zs.map((z) => (z.id === zoneId
      ? { ...z, items: z.items.map((it) => (it.id === item.id ? item : it)) } : z)));
  const removeItem = (zoneId, itemId) =>
    setZones((zs) => zs.map((z) => (z.id === zoneId
      ? { ...z, items: z.items.filter((it) => it.id !== itemId) } : z)));

  const resetAll = () => setState(seedState());

  const zoneResultById = (id) => computed.zoneResults.find((zr) => zr.zone.id === id);

  return (
    <div className="grid gap-8" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
      {/* ===== 左侧：编辑区 ===== */}
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl" style={{ color: T.ink }}>预估报价 Quotation</h1>
          <p className="text-sm mt-1" style={{ color: T.inkSoft }}>
            选区域 / 橱柜 → 只填长度，系统按「高&lt;1m 延米 · 高≥1m 面积」自动计算。价格已由人民币零售价换算为马来西亚零售价。
          </p>
        </div>

        {/* 客户信息 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded"
          style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
          {[
            ['客户 Name', 'name'], ['地点 Location', 'location'],
            ['编号 Ref', 'ref'], ['负责人 PIC', 'pic'],
          ].map(([label, key]) => (
            <div key={key}>
              <label className="block text-[9px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>{label}</label>
              <input value={meta[key] || ''} onChange={(e) => setMeta({ [key]: e.target.value })}
                className="w-full px-2 py-1.5 text-sm outline-none"
                style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
            </div>
          ))}
        </div>

        {/* 区域列表 */}
        {zones.map((zone) => {
          const zr = zoneResultById(zone.id);
          return (
            <div key={zone.id} className="rounded overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
              <div className="flex items-center gap-2 px-4 py-3" style={{ background: T.sand }}>
                <button onClick={() => updateZone(zone.id, { collapsed: !zone.collapsed })}
                  style={{ color: T.inkSoft }}>
                  {zone.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </button>
                <input value={zone.name} onChange={(e) => updateZone(zone.id, { name: e.target.value })}
                  placeholder="区域名称，如：主卧衣柜"
                  className="flex-1 bg-transparent outline-none font-display text-lg"
                  style={{ color: T.ink }} />
                <span className="font-display text-lg" style={{ color: T.wood }}>{fmtMYR(zr?.subtotal || 0)}</span>
                <button onClick={() => removeZone(zone.id)} className="opacity-40 hover:opacity-100"
                  style={{ color: T.terra }} title="删除区域"><Trash2 size={15} /></button>
              </div>

              {!zone.collapsed && (
                <div className="p-3 space-y-3" style={{ background: T.paper }}>
                  {zone.items.length === 0 && (
                    <div className="text-center py-4 text-sm" style={{ color: T.inkSoft }}>还没有明细，点下方按钮添加</div>
                  )}
                  {zone.items.map((it) => (
                    <QuoteLineItem key={it.id} item={it}
                      result={zr?.items.find((r) => r.item.id === it.id)}
                      onChange={(next) => updateItem(zone.id, next)}
                      onRemove={() => removeItem(zone.id, it.id)} />
                  ))}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {ADD_TYPES.map((a) => (
                      <button key={a.type} onClick={() => addItem(zone.id, a.type)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs transition-colors"
                        style={{ border: `1px solid ${T.line}`, borderRadius: '2px', color: T.inkSoft }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.wood; e.currentTarget.style.color = T.wood; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.inkSoft; }}>
                        <Plus size={12} /> {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <button onClick={addZone}
          className="w-full py-3 flex items-center justify-center gap-2 text-sm transition-colors"
          style={{ border: `1px dashed ${T.line}`, borderRadius: '2px', color: T.inkSoft }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.wood)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}>
          <LayoutGrid size={15} /> 新增区域 / 橱柜
        </button>
      </div>

      {/* ===== 右侧：汇总 ===== */}
      <div className="space-y-4">
        <div className="sticky top-24 space-y-4">
          <div className="p-5 rounded" style={{ background: T.ink, color: T.paper }}>
            <div className="text-[10px] uppercase tracking-widest opacity-70">预估总额 Estimated Total</div>
            <div className="font-display text-4xl mt-1">{fmtMYR(computed.net)}</div>
            {computed.discount > 0 && (
              <div className="text-xs mt-2 opacity-80">
                原价 {fmtMYR(computed.gross)} − 折扣 {fmtMYR(computed.discount)}
              </div>
            )}
          </div>

          {/* 分类明细 */}
          <div className="p-4 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: T.inkSoft }}>分类明细 Breakdown</div>
            <div className="space-y-1.5">
              {CATEGORIES.map((c) => {
                const v = Math.round(computed.byCategory[c.key] || 0);
                if (v === 0) return null;
                return (
                  <div key={c.key} className="flex justify-between text-sm">
                    <span style={{ color: T.inkSoft }}>{c.label}</span>
                    <span style={{ color: T.ink }}>{fmtMYR(v)}</span>
                  </div>
                );
              })}
              <div className="flex justify-between text-sm pt-1.5 mt-1"
                style={{ borderTop: `1px solid ${T.line}` }}>
                <span style={{ color: T.inkSoft }}>合计 Gross</span>
                <span className="font-medium" style={{ color: T.ink }}>{fmtMYR(computed.gross)}</span>
              </div>
            </div>
          </div>

          {/* 折扣 */}
          <div className="p-4 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
            <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>
              折扣 / 赞助 Discount %
            </label>
            <div className="flex items-center gap-2">
              <input type="number" value={adjustPct}
                onChange={(e) => setState((s) => ({ ...s, adjustPct: Number(e.target.value) || 0 }))}
                className="w-20 px-2 py-1.5 text-sm outline-none"
                style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
              <span className="text-sm" style={{ color: T.inkSoft }}>%　→ 减 {fmtMYR(computed.discount)}</span>
            </div>
          </div>

          {/* 操作 */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setShowPrint(true)}
              className="flex items-center justify-center gap-1.5 py-2.5 text-sm"
              style={{ background: T.wood, color: T.paper, borderRadius: '2px' }}>
              <FileText size={14} /> 生成报价单
            </button>
            <button onClick={async () => {
              const ok = await copyToClipboard(buildTextQuote(meta, computed));
              toast(ok ? '已复制报价文本' : '复制失败', ok ? 'success' : 'error');
            }}
              className="flex items-center justify-center gap-1.5 py-2.5 text-sm"
              style={{ border: `1px solid ${T.line}`, borderRadius: '2px', color: T.inkSoft }}>
              <Copy size={14} /> 复制文本
            </button>
          </div>
          <button onClick={resetAll} className="w-full text-xs underline opacity-50 hover:opacity-100"
            style={{ color: T.inkSoft }}>清空重来</button>
        </div>
      </div>

      {showPrint && (
        <QuotePrint meta={meta} computed={computed} onClose={() => setShowPrint(false)} />
      )}
    </div>
  );
}

// ---- WhatsApp / 纯文本报价 ----
function buildTextQuote(meta, computed) {
  const L = [];
  L.push('📋 *预估报价 · SAIL by Riccione Reka*');
  L.push('━━━━━━━━━━━━━━━');
  if (meta.name) L.push(`👤 客户：${meta.name}`);
  if (meta.location) L.push(`📍 地点：${meta.location}`);
  L.push('');
  computed.zoneResults.forEach((zr) => {
    if (!zr.zone.items.length) return;
    L.push(`▪️ *${zr.zone.name || '未命名区域'}* — ${fmtMYR(zr.subtotal)}`);
  });
  L.push('');
  L.push('*分类明细*');
  CATEGORIES.forEach((c) => {
    const v = Math.round(computed.byCategory[c.key] || 0);
    if (v > 0) L.push(`  ${c.label}：${fmtMYR(v)}`);
  });
  L.push('');
  if (computed.discount > 0) {
    L.push(`合计：${fmtMYR(computed.gross)}`);
    L.push(`折扣：− ${fmtMYR(computed.discount)}`);
  }
  L.push(`*预估总额：${fmtMYR(computed.net)}*`);
  L.push('━━━━━━━━━━━━━━━');
  L.push('※ 此为预估价，实际以正式报价为准。');
  return L.join('\n');
}
