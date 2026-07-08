import { useMemo, useState } from 'react';
import { Plus, Copy, Trash2, ChevronDown, ChevronRight, FileText, FileSpreadsheet, LayoutGrid } from 'lucide-react';
import { T } from '../../theme.js';
import { newId, copyToClipboard } from '../../utils/helpers.js';
import { useToast } from '../ui/UIProvider.jsx';
import { computeQuote, CATEGORIES, ROOMS, CUSTOM_ROOM, OUTPUT_LANGS, tr, pickLang, RLBL, QUOTE_TERMS, cabTypeById, fmtMYR } from '../../constants/pricing.js';
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

// 受控组件：doc = { meta, zones, adjustPct }；改动通过 onChange 回传上层（记录管理器负责持久化）。
export default function QuotationView({ doc, onChange }) {
  const toast = useToast();
  const [showPrint, setShowPrint] = useState(false);
  const { meta, zones, adjustPct } = doc;
  const lang = meta.outputLang || 'en';
  const computed = useMemo(() => computeQuote(zones, adjustPct), [zones, adjustPct]);

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
                  {zone.items.map((it) => (
                    <QuoteLineItem key={it.id} item={it}
                      result={zr?.items.find((r) => r.item.id === it.id)}
                      onChange={(next) => updateItem(zone.id, next)}
                      onRemove={() => removeItem(zone.id, it.id)} />
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
      </div>

      {/* ===== 右侧：汇总 ===== */}
      <div className="space-y-4">
        <div className="sticky top-6 space-y-4">
          <div className="p-5 rounded" style={{ background: T.ink, color: T.paper }}>
            <div className="text-[10px] uppercase tracking-widest opacity-70">Estimated Total 预估总额</div>
            <div className="font-display text-4xl mt-1">{fmtMYR(computed.net)}</div>
            {computed.discount > 0 && (
              <div className="text-xs mt-2 opacity-80">Gross 原价 {fmtMYR(computed.gross)} − Discount 折扣 {computed.adjustPct}% ({fmtMYR(computed.discount)})</div>
            )}
          </div>

          {/* 分类明细 */}
          <div className="p-4 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: T.inkSoft }}>Breakdown 分类明细</div>
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

          {/* 折扣 */}
          <div className="p-4 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
            <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>Discount 折扣 / 赞助 %</label>
            <div className="flex items-center gap-2">
              <input type="number" value={adjustPct}
                onChange={(e) => patch({ adjustPct: Number(e.target.value) || 0 })}
                className="w-20 px-2 py-1.5 text-sm outline-none"
                style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
              <span className="text-sm" style={{ color: T.inkSoft }}>%　→ − {fmtMYR(computed.discount)}</span>
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
                  await exportExcel(meta, computed, lang);
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
              const ok = await copyToClipboard(buildTextQuote(meta, computed, lang));
              toast(ok ? 'Copied 已复制' : 'Copy failed 复制失败', ok ? 'success' : 'error');
            }}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm"
              style={{ border: `1px solid ${T.line}`, borderRadius: '2px', color: T.inkSoft }}>
              <Copy size={14} /> Copy text 复制文本
            </button>
          </div>
        </div>
      </div>

      {showPrint && <QuotePrint meta={meta} computed={computed} lang={lang} onClose={() => setShowPrint(false)} />}
    </div>
  );
}

// ---- WhatsApp / 纯文本报价（按语言）----
function buildTextQuote(meta, computed, lang = 'both') {
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
