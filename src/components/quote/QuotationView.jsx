import { useMemo, useRef, useState } from 'react';
import { Plus, Copy, Trash2, GripVertical, Sofa, ChevronUp, ChevronDown, ChevronRight, FileText, FileSpreadsheet, LayoutGrid } from 'lucide-react';
import { T } from '../../theme.js';
import { newId, copyToClipboard } from '../../utils/helpers.js';
import { useToast } from '../ui/UIProvider.jsx';
import { computeQuote, computeLoose, CATEGORIES, ROOMS, CUSTOM_ROOM, OUTPUT_LANGS, tr, pickLang, RLBL, QUOTE_TERMS, cabTypeById, fmtMYR } from '../../constants/pricing.js';
import QuoteLineItem from './QuoteLineItem.jsx';
import QuotePrint from './QuotePrint.jsx';
import { exportExcel } from './exportExcel.js';

// ---- 新明细的默认值 ----
export function makeItem(kind) {
  const base = { id: newId('it') };
  // kind：base/wall/tall → 橱柜；panel/roomdoor/led/other → 其余
  if (['base', 'wall', 'tall'].includes(kind)) {
    const t = cabTypeById(kind);
    return { ...base, type: 'cabinet', cabType: kind, name: '', length: '', h: t.h, d: t.d,
      doorSeries: 'A', carcassSeries: 'A', drawers: '', hasDoor: true, hasCarcass: true };
  }
  if (kind === 'panel') return { ...base, type: 'panel', preset: 'wall', name: '', length: '', h: 2.7, panelSeries: 'A' };
  if (kind === 'roomdoor') return { ...base, type: 'roomdoor', preset: 'std', desc: '', qty: '1', unitMyr: 7570 };
  if (kind === 'led') return { ...base, type: 'led', desc: 'LED 整体灯带', length: '' };
  return { ...base, type: 'other', desc: '', qty: '1', uom: '项', unitMyr: '' };
}

const ADD_TYPES = [
  { kind: 'base', label: 'Base 地柜' },
  { kind: 'wall', label: 'Wall 吊柜' },
  { kind: 'tall', label: 'Tall 高柜' },
  { kind: 'panel', label: 'Panel 墙板' },
  { kind: 'roomdoor', label: 'Door 房门' },
  { kind: 'led', label: 'LED 灯带' },
  { kind: 'other', label: 'Other 其他' },
];

export const blankZone = (name = '') => ({ id: newId('zone'), name, items: [], collapsed: false });
const blankLoose = () => ({ id: newId('lf'), type: '', model: '', color: '', qty: '1', unitMyr: '' });

// 数组内移动元素（拖动排序用）
const moveInArray = (arr, from, to) => {
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

// Loose Furniture 单行编辑
function LooseRow({ item, onChange, onRemove, onDragStart, onDrop, onMoveUp, onMoveDown, canUp, canDown }) {
  const total = (Number(item.qty) || 0) * (Number(item.unitMyr) || 0);
  const cell = { background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' };
  const inp = (key, ph = '') => (
    <input value={item[key] ?? ''} onChange={(e) => onChange({ [key]: e.target.value })} placeholder={ph}
      className="w-full px-2 py-1.5 text-sm outline-none" style={cell}
      onFocus={(e) => (e.target.style.borderColor = T.wood)} onBlur={(e) => (e.target.style.borderColor = T.line)} />
  );
  return (
    <div className="flex items-center gap-2 p-2 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onDrop(); }}>
      <div className="flex flex-col items-center shrink-0">
        <button onClick={onMoveUp} disabled={!canUp} title="上移 Move up" className="disabled:opacity-25" style={{ color: T.inkSoft }}><ChevronUp size={12} /></button>
        <button draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text', ''); onDragStart(); }}
          title="拖动排序 Drag to reorder" className="cursor-grab active:cursor-grabbing" style={{ color: T.line }}><GripVertical size={13} /></button>
        <button onClick={onMoveDown} disabled={!canDown} title="下移 Move down" className="disabled:opacity-25" style={{ color: T.inkSoft }}><ChevronDown size={12} /></button>
      </div>
      <div className="flex-1 grid gap-2 items-center" style={{ gridTemplateColumns: 'repeat(12, minmax(0,1fr))' }}>
        <div className="col-span-3">{inp('type', 'e.g. Sofa 沙发')}</div>
        <div className="col-span-2">{inp('model', 'Model 型号')}</div>
        <div className="col-span-2">{inp('color', 'Color 颜色')}</div>
        <div className="col-span-1">{inp('qty', '1')}</div>
        <div className="col-span-2">{inp('unitMyr', 'RM')}</div>
        <div className="col-span-2 text-right font-display text-sm pr-1" style={{ color: T.ink }}>{fmtMYR(total)}</div>
      </div>
      <button onClick={onRemove} className="opacity-40 hover:opacity-100 shrink-0" style={{ color: T.terra }} title="删除 Delete">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// 受控组件：doc = { meta, zones, looseItems, adjustPct }；改动通过 onChange 回传上层。
export default function QuotationView({ doc, onChange }) {
  const toast = useToast();
  const [showPrint, setShowPrint] = useState(false);
  const { meta, zones, adjustPct } = doc;
  const looseItems = doc.looseItems || [];
  const looseAdjustPct = doc.looseAdjustPct || 0;
  const lang = meta.outputLang || 'en';
  const computed = useMemo(() => computeQuote(zones, adjustPct), [zones, adjustPct]);
  const looseCalc = useMemo(() => computeLoose(looseItems, looseAdjustPct), [looseItems, looseAdjustPct]);
  const grandTotal = computed.net + looseCalc.net;
  const dragRef = useRef(null); // { zoneId, from } 或 { loose:true, from }

  // ---- mutators ----
  const patch = (p) => onChange({ ...doc, ...p });
  const setMeta = (p) => patch({ meta: { ...meta, ...p } });
  const setZones = (fn) => patch({ zones: fn(zones) });
  const addZone = () => setZones((zs) => [...zs, blankZone('')]);
  const updateZone = (id, p) => setZones((zs) => zs.map((z) => (z.id === id ? { ...z, ...p } : z)));
  const removeZone = (id) => setZones((zs) => zs.filter((z) => z.id !== id));
  const addItem = (zoneId, kind) =>
    setZones((zs) => zs.map((z) => (z.id === zoneId ? { ...z, items: [...z.items, makeItem(kind)] } : z)));
  const updateItem = (zoneId, item) =>
    setZones((zs) => zs.map((z) => (z.id === zoneId
      ? { ...z, items: z.items.map((it) => (it.id === item.id ? item : it)) } : z)));
  const removeItem = (zoneId, itemId) =>
    setZones((zs) => zs.map((z) => (z.id === zoneId
      ? { ...z, items: z.items.filter((it) => it.id !== itemId) } : z)));
  const moveItem = (zoneId, from, to) =>
    setZones((zs) => zs.map((z) => (z.id === zoneId ? { ...z, items: moveInArray(z.items, from, to) } : z)));

  // ---- loose furniture 家具 ----
  const setLoose = (fn) => patch({ looseItems: fn(looseItems) });
  const addLoose = () => setLoose((ls) => [...ls, blankLoose()]);
  const updateLoose = (id, p) => setLoose((ls) => ls.map((it) => (it.id === id ? { ...it, ...p } : it)));
  const removeLoose = (id) => setLoose((ls) => ls.filter((it) => it.id !== id));
  const moveLoose = (from, to) => setLoose((ls) => moveInArray(ls, from, to));

  const zoneResultById = (id) => computed.zoneResults.find((zr) => zr.zone.id === id);

  return (
    <div className="grid gap-8" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
      {/* ===== 左侧：编辑区 ===== */}
      <div className="space-y-6">
        {/* 客户信息 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 rounded"
          style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
          {[
            ['Name 客户', 'name'], ['Location 地点', 'location'],
            ['Ref 编号', 'ref'], ['PIC 负责人', 'pic'], ['Version 版本', 'version'],
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
                <button onClick={() => updateZone(zone.id, { collapsed: !zone.collapsed })} style={{ color: T.inkSoft }}>
                  {zone.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </button>
                {/* 区域 = 房间：下拉选常见房间，也可直接改名；选「自定义」清空以便自填 */}
                <select value={ROOMS.includes(zone.name) ? zone.name : ''}
                  onChange={(e) => updateZone(zone.id, { name: e.target.value === CUSTOM_ROOM ? '' : e.target.value })}
                  className="bg-transparent outline-none font-display text-lg cursor-pointer" style={{ color: T.ink }}>
                  <option value="" disabled>Room 选区域…</option>
                  {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <input value={zone.name} onChange={(e) => updateZone(zone.id, { name: e.target.value })}
                  placeholder="Custom room 自定义区域名"
                  className="flex-1 bg-transparent outline-none text-sm" style={{ color: T.inkSoft }} />
                <span className="font-display text-lg" style={{ color: T.wood }}>{fmtMYR(zr?.subtotal || 0)}</span>
                <button onClick={() => removeZone(zone.id)} className="opacity-40 hover:opacity-100"
                  style={{ color: T.terra }} title="删除区域"><Trash2 size={15} /></button>
              </div>

              {!zone.collapsed && (
                <div className="p-3 space-y-3" style={{ background: T.paper }}>
                  {zone.items.length === 0 && (
                    <div className="text-center py-4 text-sm" style={{ color: T.inkSoft }}>Add an item below 选下方类型添加</div>
                  )}
                  {zone.items.map((it, idx) => (
                    <QuoteLineItem key={it.id} item={it}
                      result={zr?.items.find((r) => r.item.id === it.id)}
                      onChange={(next) => updateItem(zone.id, next)}
                      onRemove={() => removeItem(zone.id, it.id)}
                      canUp={idx > 0} canDown={idx < zone.items.length - 1}
                      onMoveUp={() => moveItem(zone.id, idx, idx - 1)}
                      onMoveDown={() => moveItem(zone.id, idx, idx + 1)}
                      onDragStart={() => { dragRef.current = { zoneId: zone.id, from: idx }; }}
                      onDrop={() => {
                        const d = dragRef.current;
                        if (d && d.zoneId === zone.id && d.from !== idx) moveItem(zone.id, d.from, idx);
                        dragRef.current = null;
                      }} />
                  ))}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {ADD_TYPES.map((a) => (
                      <button key={a.kind} onClick={() => addItem(zone.id, a.kind)}
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
          <LayoutGrid size={15} /> Add Room 新增区域 / 房间
        </button>

        {/* ===== 定制小计 Cabinet Sub-Total（含独立折扣）===== */}
        <div className="p-4 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
          <div className="flex items-center justify-between">
            <span className="font-display text-lg" style={{ color: T.ink }}>Cabinet Sub-Total 定制小计</span>
            <span className="font-display text-lg" style={{ color: T.wood }}>{fmtMYR(computed.net)}</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap mt-2 text-xs" style={{ color: T.inkSoft }}>
            <span>Gross 合计 {fmtMYR(computed.gross)}</span>
            <span className="flex items-center gap-2">
              <span className="uppercase tracking-widest text-[10px]">Discount 折扣</span>
              <input type="number" value={adjustPct}
                onChange={(e) => patch({ adjustPct: Number(e.target.value) || 0 })}
                className="w-16 px-2 py-1 text-sm outline-none"
                style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
              <span>%</span>
            </span>
            {computed.discount > 0 && <span style={{ color: T.terra }}>− {fmtMYR(computed.discount)}</span>}
          </div>
        </div>

        {/* ===== Loose Furniture 家具（Riccione Furniture · 报价单另起一页）===== */}
        <div className="rounded overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ background: T.sand }}>
            <Sofa size={16} style={{ color: T.wood }} />
            <span className="font-display text-lg" style={{ color: T.ink }}>Loose Furniture 家具</span>
            <span className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>Riccione Furniture</span>
            <span className="ml-auto font-display text-lg" style={{ color: T.wood }}>{fmtMYR(looseCalc.total)}</span>
          </div>
          <div className="p-3 space-y-2" style={{ background: T.paper }}>
            {looseItems.length === 0 && (
              <div className="text-center py-4 text-sm" style={{ color: T.inkSoft }}>No loose furniture 暂无家具</div>
            )}
            {/* 表头 */}
            {looseItems.length > 0 && (
              <div className="grid gap-2 px-6 text-[9px] uppercase tracking-widest" style={{ gridTemplateColumns: 'repeat(12, minmax(0,1fr))', color: T.inkSoft }}>
                <div className="col-span-3">Product Type 产品类型</div>
                <div className="col-span-2">Model 型号</div>
                <div className="col-span-2">Color 颜色</div>
                <div className="col-span-1">Qty 数量</div>
                <div className="col-span-2">Unit RM 单价</div>
                <div className="col-span-2 text-right">Amount 总价</div>
              </div>
            )}
            {looseItems.map((it, idx) => (
              <LooseRow key={it.id} item={it} idx={idx}
                onChange={(p) => updateLoose(it.id, p)}
                onRemove={() => removeLoose(it.id)}
                canUp={idx > 0} canDown={idx < looseItems.length - 1}
                onMoveUp={() => moveLoose(idx, idx - 1)}
                onMoveDown={() => moveLoose(idx, idx + 1)}
                onDragStart={() => { dragRef.current = { loose: true, from: idx }; }}
                onDrop={() => {
                  const d = dragRef.current;
                  if (d && d.loose && d.from !== idx) moveLoose(d.from, idx);
                  dragRef.current = null;
                }} />
            ))}
            <div className="flex items-center gap-3 flex-wrap pt-1">
              <button onClick={addLoose}
                className="flex items-center gap-1 px-3 py-1.5 text-xs transition-colors"
                style={{ border: `1px solid ${T.line}`, borderRadius: '2px', color: T.inkSoft }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.wood; e.currentTarget.style.color = T.wood; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.inkSoft; }}>
                <Plus size={12} /> Loose furniture 家具
              </button>
              {looseItems.length > 0 && (
                <div className="flex items-center gap-2 text-xs" style={{ color: T.inkSoft }}>
                  <span className="uppercase tracking-widest text-[10px]">Discount 折扣</span>
                  <input type="number" value={looseAdjustPct}
                    onChange={(e) => patch({ looseAdjustPct: Number(e.target.value) || 0 })}
                    className="w-16 px-2 py-1 text-sm outline-none"
                    style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
                  <span>%　{looseCalc.discount > 0 ? `− ${fmtMYR(looseCalc.discount)} → ${fmtMYR(looseCalc.net)}` : ''}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== 右侧：汇总 ===== */}
      <div className="space-y-4">
        <div className="sticky top-6 space-y-4">
          <div className="p-5 rounded" style={{ background: T.ink, color: T.paper }}>
            <div className="text-[10px] uppercase tracking-widest opacity-70">Estimated Total 预估总额</div>
            <div className="font-display text-4xl mt-1">{fmtMYR(grandTotal)}</div>
            {/* 定制 + 家具 两个小计 */}
            <div className="text-xs mt-3 pt-3 opacity-90 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
              <div className="flex justify-between"><span>Cabinet 定制</span><span>{fmtMYR(computed.net)}</span></div>
              <div className="flex justify-between"><span>Loose Furniture 家具</span><span>{fmtMYR(looseCalc.net)}</span></div>
            </div>
          </div>

          {/* 分类明细（定制）*/}
          <div className="p-4 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: T.inkSoft }}>Cabinet Breakdown 定制分类</div>
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
              <div className="flex justify-between text-sm pt-1.5 mt-1" style={{ borderTop: `1px solid ${T.line}` }}>
                <span style={{ color: T.inkSoft }}>Gross 合计</span>
                <span className="font-medium" style={{ color: T.ink }}>{fmtMYR(computed.gross)}</span>
              </div>
            </div>
          </div>

          {/* 输出语言 Output language */}
          <div className="p-3 rounded flex items-center gap-2" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
            <span className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>Language 语言</span>
            <div className="flex gap-1 ml-auto">
              {OUTPUT_LANGS.map((o) => {
                const on = lang === o.id;
                return (
                  <button key={o.id} onClick={() => setMeta({ outputLang: o.id })}
                    className="px-2.5 py-1 text-xs transition-colors"
                    style={{ borderRadius: '2px', background: on ? T.ink : 'transparent',
                      color: on ? T.paper : T.inkSoft, border: `1px solid ${on ? T.ink : T.line}` }}>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 操作 */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowPrint(true)}
                className="flex items-center justify-center gap-1.5 py-2.5 text-sm"
                style={{ background: T.wood, color: T.paper, borderRadius: '2px' }}>
                <FileText size={14} /> Quote 报价单
              </button>
              <button onClick={async () => {
                try {
                  await exportExcel(meta, computed, looseCalc, lang);
                  toast('Excel exported 已导出', 'success');
                } catch (e) {
                  toast('Export failed 导出失败', 'error');
                }
              }}
                className="flex items-center justify-center gap-1.5 py-2.5 text-sm"
                style={{ background: T.sage, color: T.paper, borderRadius: '2px' }}>
                <FileSpreadsheet size={14} /> Excel
              </button>
            </div>
            <button onClick={async () => {
              const ok = await copyToClipboard(buildTextQuote(meta, computed, looseCalc, lang));
              toast(ok ? 'Copied 已复制' : 'Copy failed 复制失败', ok ? 'success' : 'error');
            }}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm"
              style={{ border: `1px solid ${T.line}`, borderRadius: '2px', color: T.inkSoft }}>
              <Copy size={14} /> Copy text 复制文本
            </button>
          </div>
        </div>
      </div>

      {showPrint && <QuotePrint meta={meta} computed={computed} loose={looseCalc} lang={lang} onClose={() => setShowPrint(false)} />}
    </div>
  );
}

// ---- WhatsApp / 纯文本报价（按语言）----
function buildTextQuote(meta, computed, loose, lang = 'both') {
  const t = (obj) => tr(obj, lang);
  const pl = (text) => pickLang(text, lang);
  const L = [];
  L.push(`📋 *${t(RLBL.estQuote)} · SAIL by Riccione Reka*`);
  L.push('━━━━━━━━━━━━━━━');
  if (meta.name) L.push(`👤 ${t(RLBL.name)}：${meta.name}`);
  if (meta.location) L.push(`📍 ${t(RLBL.site)}：${meta.location}`);
  L.push(`📄 ${t(RLBL.rev)}：${meta.version || '1'}`);
  L.push('');
  computed.zoneResults.forEach((zr) => {
    if (!zr.zone.items.length) return;
    L.push(`▪️ *${pl(zr.zone.name) || t(RLBL.untitled)}* — ${fmtMYR(zr.subtotal)}`);
  });
  L.push('');
  L.push(`*${t({ en: 'Breakdown', zh: '分类明细' })}*`);
  CATEGORIES.forEach((c) => {
    const v = Math.round(computed.byCategory[c.key] || 0);
    if (v > 0) L.push(`  ${pl(c.label)}：${fmtMYR(v)}`);
  });
  L.push('');
  if (computed.discount > 0) {
    L.push(`${t(RLBL.gross)}：${fmtMYR(computed.gross)}`);
    L.push(`${t(RLBL.discount)} (${computed.adjustPct}%)：− ${fmtMYR(computed.discount)}`);
  }
  L.push(`*${t(RLBL.total)}：${fmtMYR(computed.net)}*`);
  // Loose furniture 家具（Riccione Furniture）
  if (loose && loose.rows.length > 0) {
    L.push('');
    L.push(`🛋️ *${t(RLBL.looseSection)} · Riccione Furniture*`);
    loose.rows.forEach((r) => {
      const nm = [r.type, r.model, r.color].filter(Boolean).join(' ');
      L.push(`  ${nm || '-'} ×${Number(r.qty) || 0} — ${fmtMYR(r.total)}`);
    });
    if (loose.discount > 0) {
      L.push(`${t(RLBL.gross)}：${fmtMYR(loose.gross)}`);
      L.push(`${t(RLBL.discount)} (${loose.adjustPct}%)：− ${fmtMYR(loose.discount)}`);
    }
    L.push(`*${t(RLBL.total)}：${fmtMYR(loose.net)}*`);
  }
  L.push('━━━━━━━━━━━━━━━');
  QUOTE_TERMS.forEach((sec) => {
    L.push(t(sec.title));
    sec.lines.forEach((ln) => {
      L.push((sec.bullet ? '• ' : '') + (lang === 'both' ? `${ln.en}　${ln.zh}` : t(ln)));
    });
    if (sec.note) L.push(lang === 'both' ? `${sec.note.en}　${sec.note.zh}` : t(sec.note));
  });
  return L.join('\n');
}
