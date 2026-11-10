import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Copy, Trash2, GripVertical, Sofa, ChevronUp, ChevronDown, ChevronRight, FileText, FileSpreadsheet, LayoutGrid, Image as ImageIcon, Ruler, Pencil, MessageCircle } from 'lucide-react';
import { T } from '../../theme.js';
import { newId, copyToClipboard } from '../../utils/helpers.js';
import { useToast, useConfirm } from '../ui/UIProvider.jsx';
import { computeQuote, computeLoose, ROOMS, CUSTOM_ROOM, OUTPUT_LANGS, pickLang, cabTypeById, fmtMYR, discountChainRate, discountChainLabel } from '../../constants/pricing.js';
import QuoteLineItem from './QuoteLineItem.jsx';
import QuotePrint from './QuotePrint.jsx';
import CatalogPicker from './CatalogPicker.jsx';
import MeasureTool from './MeasureTool.jsx';
import ItemEditorModal from './ItemEditorModal.jsx';
import { exportExcel } from './exportExcel.js';
import { buildTextQuote } from './textQuote.js';
import { deriveZones, cabinetTotal, customSeriesCount, localizeKira } from '../../planner/bridge.js';
import { newCabinet, nextCode } from '../../planner/templates.js';
import { mmToM, uid } from '../../planner/model.js';
import CabinetCard from '../planner/CabinetCard.jsx';
import CabinetEditor from '../planner/CabinetEditor.jsx';
import TemplatePicker from '../planner/TemplatePicker.jsx';
import { parseMeters } from '../planner/bits.jsx';
import { DOOR_SERIES, CARCASS_SERIES } from '../../constants/pricing.js';
import { Boxes } from 'lucide-react';
import { waLink } from '../../utils/whatsapp.js';

// 手机（< lg）用弹窗编辑项目；桌面保持行内编辑
function useIsMobile() {
  const q = '(max-width: 1023px)';
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = (e) => setM(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

// ---- 新明细的默认值 ----
export function makeItem(kind) {
  const base = { id: newId('it') };
  // kind：base/wall/tall/open → 橱柜；panel/roomdoor/led/other → 其余
  if (['base', 'wall', 'tall', 'open'].includes(kind)) {
    const t = cabTypeById(kind);
    const isOpen = kind === 'open';
    // 开放柜默认只含开放柜（无门无柜体）；其余默认门+柜体
    return { ...base, type: 'cabinet', cabType: kind, name: '', length: '', h: t.h, d: t.d,
      doorSeries: 'A', carcassSeries: 'A', openSeries: 'A', drawers: '', drawersHalf: '',
      hasDoor: !isOpen, hasCarcass: !isOpen, hasOpen: isOpen };
  }
  if (kind === 'panel') return { ...base, type: 'panel', preset: 'wall', name: '', length: '', h: 2.7, panelSeries: 'A' };
  if (kind === 'roomdoor') return { ...base, type: 'roomdoor', preset: 'std', desc: '', qty: '1', unitMyr: 7570 };
  if (kind === 'led') return { ...base, type: 'led', desc: 'LED 整体灯带', length: '' };
  return { ...base, type: 'other', desc: '', qty: '1', uom: '', unitCny: '', unitMyr: '' };
}

const ADD_TYPES = [
  { kind: 'base', label: 'Base 地柜' },
  { kind: 'wall', label: 'Wall 吊柜' },
  { kind: 'tall', label: 'Tall 高柜' },
  { kind: 'open', label: 'Open 开放柜' },
  { kind: 'panel', label: 'Panel 墙板' },
  { kind: 'led', label: 'LED 灯带' },
  { kind: 'other', label: 'Other 其他' },
];

// 特殊工艺系数参考（内部报价用）
const CRAFT_COEF = [
  { name: '圆弧 Arc', coef: 3 },
  { name: '加厚 Thickened (25/36)', coef: 2.5 },
  { name: '加厚 Thickened (50)', coef: 3.5 },
  { name: '格栅 Grille', coef: 3 },
  { name: '拼框门 Framed Door', coef: 2.5 },
  { name: '拼框玻璃门 Framed Glass Door', coef: 1.5 },
  { name: '洞洞板 Pegboard', coef: 1.5 },
];

// KIRA：房间多了 cabinets（积木柜）和 ceilingH（楼高 mm，每个房间填一次）
export const blankZone = (name = '') => ({ id: newId('zone'), name, items: [], cabinets: [], ceilingH: null, collapsed: false });
const blankLoose = () => ({ id: newId('lf'), type: '', model: '', color: '', qty: '1', unitMyr: '', image: '' });

// 数组内移动元素（拖动排序用）
const moveInArray = (arr, from, to) => {
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

// Loose Furniture 单行编辑
function LooseRow({ item, onChange, onRemove, onDragStart, onDrop, onMoveUp, onMoveDown, canUp, canDown, selected, onToggleSelect }) {
  const total = (Number(item.qty) || 0) * (Number(item.unitMyr) || 0);
  const cell = { background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' };
  const inp = (key, ph = '') => (
    <input value={item[key] ?? ''} onChange={(e) => onChange({ [key]: e.target.value })} placeholder={ph}
      className="w-full px-2 py-1.5 text-sm outline-none" style={cell}
      onFocus={(e) => (e.target.style.borderColor = T.wood)} onBlur={(e) => (e.target.style.borderColor = T.line)} />
  );
  return (
    <div className="flex items-start gap-2 p-2 rounded" style={{ background: selected ? T.sand : T.cream, border: `1px solid ${selected ? T.wood : T.lineSoft}` }}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onDrop(); }}>
      <div className="flex flex-col items-center shrink-0 pt-1 gap-1">
        {onToggleSelect && (
          <input type="checkbox" checked={!!selected} onChange={onToggleSelect}
            title="Select 选择" className="cursor-pointer" style={{ accentColor: T.wood }} />
        )}
        <button onClick={onMoveUp} disabled={!canUp} title="上移 Move up" className="disabled:opacity-25" style={{ color: T.inkSoft }}><ChevronUp size={12} /></button>
        <button draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text', ''); onDragStart(); }}
          title="拖动排序 Drag to reorder" className="cursor-grab active:cursor-grabbing" style={{ color: T.line }}><GripVertical size={13} /></button>
        <button onClick={onMoveDown} disabled={!canDown} title="下移 Move down" className="disabled:opacity-25" style={{ color: T.inkSoft }}><ChevronDown size={12} /></button>
      </div>
      <div className="flex-1 grid gap-2 items-center" style={{ gridTemplateColumns: 'repeat(12, minmax(0,1fr))' }}>
        <div className="col-span-6 md:col-span-3">{inp('type', 'e.g. Sofa 沙发')}</div>
        <div className="col-span-6 md:col-span-2">{inp('model', 'Model 型号')}</div>
        <div className="col-span-6 md:col-span-2">{inp('color', 'Color 颜色')}</div>
        <div className="col-span-3 md:col-span-1">{inp('qty', '1')}</div>
        <div className="col-span-3 md:col-span-2">{inp('unitMyr', 'RM')}</div>
        <div className="col-span-6 md:col-span-2 text-right font-display text-sm pr-1" style={{ color: T.ink }}>{fmtMYR(total)}</div>
        {/* 图片行 Image line */}
        <div className="col-span-12 flex items-center gap-2 mt-1">
          {item.image
            ? <img src={item.image} alt="" className="shrink-0 object-cover" style={{ width: 34, height: 34, borderRadius: '2px', border: `1px solid ${T.line}` }} />
            : <div className="shrink-0 flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: '2px', border: `1px dashed ${T.line}`, color: T.line }}><ImageIcon size={14} /></div>}
          <input value={item.image ?? ''} onChange={(e) => onChange({ image: e.target.value })}
            placeholder="Image URL 图片链接（从 Riccione 网站复制图片地址）"
            className="flex-1 px-2 py-1 text-xs outline-none" style={cell}
            onFocus={(e) => (e.target.style.borderColor = T.wood)} onBlur={(e) => (e.target.style.borderColor = T.line)} />
        </div>
      </div>
      <button onClick={onRemove} className="opacity-40 hover:opacity-100 shrink-0 self-start" style={{ color: T.terra }} title="删除 Delete">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// 手机版项目摘要卡：只看关键信息，点「编辑」开弹窗
const MOBILE_TYPE_LABEL = { panel: 'Panel 墙板', roomdoor: 'Door 房门', led: 'LED 灯带', other: 'Other 其他' };
function MobileItemCard({ item, result, selected, onToggleSelect, onEdit, canUp, canDown, onMoveUp, onMoveDown }) {
  const total = result?.total || 0;
  const badge = item.type === 'cabinet' ? cabTypeById(item.cabType).label : MOBILE_TYPE_LABEL[item.type];
  const name = item.name || item.desc || '';
  let dims = '';
  if (item.type === 'cabinet') {
    const parts = [];
    if (item.length) parts.push(`L ${item.length}m`);
    parts.push(`H ${item.h} × D ${item.d}`);
    if (Number(item.drawers) > 0) parts.push(`${item.drawers} 全展抽屉`);
    if (Number(item.drawersHalf) > 0) parts.push(`${item.drawersHalf} 半展抽屉`);
    if (Number(item.coef) > 0 && Number(item.coef) !== 1) parts.push(`×${item.coef} ${item.coefTarget === 'carcass' ? '柜体' : item.coefTarget === 'both' ? '门+柜' : '门板'}`);
    if (item.cabType === 'open') parts.push(`开放柜 ${item.openSeries || 'A'}`);
    else parts.push(`门 ${item.doorSeries} / 柜 ${item.carcassSeries}`);
    dims = parts.join(' · ');
  } else if (item.type === 'panel') dims = `L ${item.length || '—'}m × H ${item.h} · ${item.panelSeries}`;
  else if (item.type === 'roomdoor') dims = `${item.qty || 0} pc × RM${item.unitMyr || 0}`;
  else if (item.type === 'led') dims = `L ${item.length || '—'}m`;
  else if (item.type === 'other') dims = `${item.qty || 0} ${item.uom || ''} × RM${item.unitMyr || 0}`;
  return (
    <div className="rounded p-3 flex items-start gap-2" style={{ background: selected ? T.sand : T.cream, border: `1px solid ${selected ? T.wood : T.lineSoft}` }}>
      <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
        <input type="checkbox" checked={!!selected} onChange={onToggleSelect} className="w-4 h-4" style={{ accentColor: T.wood }} />
        <button onClick={onMoveUp} disabled={!canUp} className="disabled:opacity-25" style={{ color: T.inkSoft }}><ChevronUp size={14} /></button>
        <button onClick={onMoveDown} disabled={!canDown} className="disabled:opacity-25" style={{ color: T.inkSoft }}><ChevronDown size={14} /></button>
      </div>
      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: T.sand, color: T.inkSoft }}>{badge}</span>
          {name && <span className="text-sm truncate" style={{ color: T.ink }}>{name}</span>}
        </div>
        <div className="text-xs mt-1" style={{ color: T.inkSoft }}>{dims}</div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] flex items-center gap-1" style={{ color: T.wood }}><Pencil size={11} /> Edit 编辑</span>
          <span className="font-display text-base" style={{ color: T.ink }}>{fmtMYR(total)}</span>
        </div>
      </button>
    </div>
  );
}

// 受控组件：doc = { meta, zones, looseItems, adjustPct }；改动通过 onChange 回传上层。
export default function QuotationView({ doc, onChange, mobileTab = null, onMobileTab }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [showPrint, setShowPrint] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showMeasure, setShowMeasure] = useState(false);
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(null); // { zoneId, item, isNew } → 手机弹窗编辑
  const { meta, zones, adjustPct } = doc;
  const looseItems = doc.looseItems || [];
  const looseAdjustPct = doc.looseAdjustPct || 0;
  const cabinetNote = doc.cabinetNote || '';
  const looseNote = doc.looseNote || '';
  const discountNote = doc.discountNote || '';
  const looseDiscountNote = doc.looseDiscountNote || '';
  const discountMode = doc.discountMode || 'pct';           // 'pct' 百分比 | 'amt' 定额
  const discountAmt = doc.discountAmt || 0;
  const looseDiscountMode = doc.looseDiscountMode || 'pct';
  const looseDiscountAmt = doc.looseDiscountAmt || 0;
  const lang = meta.outputLang || 'en';
  const audience = meta.audience || 'retail';          // 'retail' 零售 | 'designer' 设计师
  // 设计师折扣链："30" 或 "30+10"（叠加）；供货价 = 零售 × 系数
  const designerDisc = meta.designerDisc ?? (meta.designerPct != null ? String(meta.designerPct) : '30');
  const designerRate = discountChainRate(designerDisc);
  // 整份报价默认系列（柜子可单独改）
  const defaults = doc.defaults || { door: 'A', carcass: 'A' };
  // 积木柜会变成标准明细一起算（deriveZones）；手动明细照旧
  const computed = useMemo(() => localizeKira(computeQuote(deriveZones(zones, defaults), adjustPct, discountMode, discountAmt)), [zones, defaults, adjustPct, discountMode, discountAmt]);
  const looseCalc = useMemo(() => computeLoose(looseItems, looseAdjustPct, looseDiscountMode, looseDiscountAmt), [looseItems, looseAdjustPct, looseDiscountMode, looseDiscountAmt]);
  const grandTotal = computed.net + looseCalc.net;
  const dragRef = useRef(null); // { zoneId, from } 或 { loose:true, from }

  // ---- mutators ----
  const patch = (p) => onChange({ ...doc, ...p });
  const setMeta = (p) => patch({ meta: { ...meta, ...p } });
  const setZones = (fn) => patch({ zones: fn(zones) });
  const addZone = () => setZones((zs) => [...zs, blankZone('')]);
  // Ukur 量尺 → 把量到的长度变成柜体项目加入报价
  const handleMeasureAdd = ({ zoneId, newZoneName, kind, measures }) => {
    const items = measures.map((m) => ({ ...makeItem(m.kind || kind), length: String(m.length), name: m.name || '' }));
    setZones((zs) => {
      if (zoneId === '__new') {
        const z = blankZone(newZoneName || '');
        z.items = items;
        return [...zs, z];
      }
      return zs.map((z) => (z.id === zoneId ? { ...z, items: [...z.items, ...items] } : z));
    });
  };
  const updateZone = (id, p) => setZones((zs) => zs.map((z) => (z.id === id ? { ...z, ...p } : z)));
  const removeZone = async (id) => {
    const z = zones.find((x) => x.id === id);
    const n = (z?.cabinets || []).length + (z?.items || []).length;
    if (n && !(await confirm({ title: 'Delete room 删除房间', message: `This room has ${n} item(s). Delete it? 这个房间有 ${n} 项，确定删除？`, danger: true, confirmText: 'Delete 删除', cancelText: 'Cancel 取消' }))) return;
    setZones((zs) => zs.filter((x) => x.id !== id));
  };
  const moveZone = (from, to) => setZones((zs) => moveInArray(zs, from, to));
  const addItem = (zoneId, kind, prebuilt) =>
    setZones((zs) => zs.map((z) => (z.id === zoneId ? { ...z, items: [...z.items, prebuilt || makeItem(kind)] } : z)));
  // 手机：按类型按钮 → 弹窗填尺寸；桌面：直接行内新增
  const onAddType = (zoneId, kind) => (isMobile ? setEditing({ zoneId, item: makeItem(kind), isNew: true }) : addItem(zoneId, kind));
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

  // ---- 多选批量操作（选多个 item 批量复制/删除）----
  const [selItems, setSelItems] = useState(() => new Set());
  const [selLoose, setSelLoose] = useState(() => new Set());
  const toggleSelItem = (id) => setSelItems((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelLoose = (id) => setSelLoose((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSelItems = () => setSelItems(new Set());
  const clearSelLoose = () => setSelLoose(new Set());
  const bulkDeleteItems = () => { setZones((zs) => zs.map((z) => ({ ...z, items: z.items.filter((it) => !selItems.has(it.id)) }))); clearSelItems(); };
  const bulkDuplicateItems = () => {
    setZones((zs) => zs.map((z) => {
      let changed = false; const out = [];
      z.items.forEach((it) => { out.push(it); if (selItems.has(it.id)) { out.push({ ...structuredClone(it), id: newId('it') }); changed = true; } });
      return changed ? { ...z, items: out } : z;
    }));
    clearSelItems();
  };
  const bulkDeleteLoose = () => { setLoose((ls) => ls.filter((l) => !selLoose.has(l.id))); clearSelLoose(); };
  const bulkDuplicateLoose = () => {
    setLoose((ls) => { const out = []; ls.forEach((l) => { out.push(l); if (selLoose.has(l.id)) out.push({ ...structuredClone(l), id: newId('lf') }); }); return out; });
    clearSelLoose();
  };
  const selectAllItems = () => setSelItems(new Set(zones.flatMap((z) => z.items.map((it) => it.id))));
  const selectAllLoose = () => setSelLoose(new Set(looseItems.map((l) => l.id)));

  const zoneResultById = (id) => computed.zoneResults.find((zr) => zr.zone.id === id);

  // ---- 积木柜 ----
  const [picking, setPicking] = useState(null);       // zoneId：正在选模板
  const [editingCab, setEditingCab] = useState(null); // { zoneId, cab, isNew }
  const [ceilNote, setCeilNote] = useState({});       // zoneId → 「2700 mm → 2.70 m」（打了毫米时提示）
  const startCabinet = (zoneId, templateId) => {
    const zone = zones.find((z) => z.id === zoneId);
    // 楼高没填（null / 0）→ 不传，模板自己按 2.70 m（双保险：不让 null 变成 0 高的柜子）
    const cab = newCabinet(templateId, { ceilingH: zone?.ceilingH > 0 ? zone.ceilingH : undefined, code: nextCode(zones) });
    setPicking(null);
    setEditingCab({ zoneId, cab, isNew: true });
  };
  const saveCabinet = (zoneId, cab) => setZones((zs) => zs.map((z) => {
    if (z.id !== zoneId) return z;
    const list = z.cabinets || [];
    return { ...z, cabinets: list.some((c) => c.id === cab.id) ? list.map((c) => (c.id === cab.id ? cab : c)) : [...list, cab] };
  }));
  const removeCabinetNow = (zoneId, id) => setZones((zs) => zs.map((z) => (z.id === zoneId ? { ...z, cabinets: (z.cabinets || []).filter((c) => c.id !== id) } : z)));
  const removeCabinet = async (zoneId, id) => {
    const c = zones.find((z) => z.id === zoneId)?.cabinets?.find((x) => x.id === id);
    if (await confirm({ title: 'Delete cabinet 删除柜子', message: `Delete ${c?.code || ''} ${c?.name || ''}? 确定删除这个柜子？`, danger: true, confirmText: 'Delete 删除', cancelText: 'Cancel 取消' })) removeCabinetNow(zoneId, id);
  };
  const duplicateCabinet = (zoneId, cab) => {
    const copy = { ...structuredClone(cab), id: uid('cab'), code: nextCode(zones) };
    copy.frames = copy.frames.map((f, i) => ({ ...f, id: `${copy.id}-f${i}` }));
    saveCabinet(zoneId, copy);
  };
  // 编辑中：「全部 RM」= 用草稿替换这个柜子后的整份报价
  const totalWith = (zoneId) => (draft) => {
    const zs = zones.map((z) => {
      if (z.id !== zoneId) return z;
      const list = z.cabinets || [];
      return { ...z, cabinets: list.some((c) => c.id === draft.id) ? list.map((c) => (c.id === draft.id ? draft : c)) : [...list, draft] };
    });
    return computeQuote(deriveZones(zs, defaults), adjustPct, discountMode, discountAmt).net + looseCalc.net;
  };
  // 整份报价换系列比价（A/B/C）：所有积木柜都用该系列
  const wholeCompare = useMemo(() => ['A', 'B', 'C'].map((L) => {
    const zs = zones.map((z) => ({ ...z, cabinets: (z.cabinets || []).map((c) => ({ ...c, series: { door: L, carcass: L, open: 'door' } })) }));
    return { L, net: computeQuote(deriveZones(zs, { door: L, carcass: L }), adjustPct, discountMode, discountAmt).net };
  }), [zones, adjustPct, discountMode, discountAmt]);
  const hasCabinets = zones.some((z) => (z.cabinets || []).length);
  // 画框框里单独选了系列的格子：一键比价只换柜子的系列，这些格子不跟着换
  const ownSeriesCells = useMemo(() => zones.reduce((a, z) => a + (z.cabinets || []).reduce((b, c) => b + customSeriesCount(c), 0), 0), [zones]);
  const applySeriesAll = (L) => patch({
    defaults: { ...defaults, door: L, carcass: CARCASS_SERIES.includes(L) ? L : defaults.carcass },
    zones: zones.map((z) => ({ ...z, cabinets: (z.cabinets || []).map((c) => ({ ...c, series: null })) })),
  });

  return (
    <div className="grid gap-6 lg:gap-8 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ===== 左侧：编辑区（手机「设计」tab）===== */}
      <div className={`space-y-6 ${mobileTab === 'summary' ? 'hidden' : ''}`}>
        {/* Ukur 量尺（放最上面，方便一开始就上传图量尺出报价）*/}
        <button onClick={() => setShowMeasure(true)}
          className="w-full py-2.5 flex items-center justify-center gap-2 text-sm transition-colors"
          style={{ border: `1px solid ${T.wood}`, color: T.wood, borderRadius: '2px' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = T.cream)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
          <Ruler size={16} /> Ukur 量尺 · 上传图算尺寸（手动明细）
        </button>

        {/* 客户信息 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded"
          style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
          {[
            ['Name 客户', 'name', 'text'], ['Phone 电话 / WhatsApp', 'phone', 'tel'], ['Location 地点', 'location', 'text'],
            ['Ref 编号', 'ref', 'text'], ['PIC 负责人', 'pic', 'text'], ['Version 版本', 'version', 'text'],
          ].map(([label, key, type]) => (
            <div key={key}>
              <label className="block text-[9px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>{label}</label>
              <input type={type} inputMode={type === 'tel' ? 'tel' : undefined} placeholder={type === 'tel' ? '012-345 6789' : undefined}
                value={meta[key] || ''} onChange={(e) => setMeta({ [key]: e.target.value })}
                className="w-full px-2 py-1.5 text-sm outline-none"
                style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
            </div>
          ))}
          <div>
            <label className="block text-[9px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>Date 日期</label>
            <input type="date" value={meta.date || ''} onChange={(e) => setMeta({ date: e.target.value })}
              className="w-full px-2 py-1.5 text-sm outline-none"
              style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
          </div>
        </div>

        {/* 定制 items 批量操作条 */}
        {selItems.size > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded text-sm sticky top-2 z-20 no-print"
            style={{ background: T.ink, color: T.paper }}>
            <span className="font-medium">{selItems.size} selected 已选</span>
            <button onClick={bulkDuplicateItems} className="flex items-center gap-1 px-2.5 py-1 rounded"
              style={{ background: 'rgba(255,255,255,0.15)' }}><Copy size={13} /> Duplicate 复制</button>
            <button onClick={bulkDeleteItems} className="flex items-center gap-1 px-2.5 py-1 rounded"
              style={{ background: T.terra, color: '#fff' }}><Trash2 size={13} /> Delete 删除</button>
            <button onClick={selectAllItems} className="px-2 py-1 opacity-80 hover:opacity-100">Select all 全选</button>
            <button onClick={clearSelItems} className="ml-auto px-2 py-1 opacity-80 hover:opacity-100">Clear 取消</button>
          </div>
        )}

        {/* 区域列表 */}
        {zones.map((zone, zi) => {
          const zr = zoneResultById(zone.id);
          // 区域交替浅/深底色，方便区分不同区域
          const altZone = zi % 2 === 1;
          const zoneHeadBg = altZone ? T.line : T.sand;
          const zoneBodyBg = altZone ? T.sand : T.paper;
          return (
            <div key={zone.id} className="rounded overflow-hidden" style={{ border: `1px solid ${T.line}` }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const d = dragRef.current;
                if (d && d.zone && d.from !== zi) moveZone(d.from, zi);
                dragRef.current = null;
              }}>
              {/* 手机：自定义房间名单独一行（不然被楼高挤成 0 宽打不了字）；电脑照旧一行 */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-3" style={{ background: zoneHeadBg }}>
                {/* 区域拖动 / 上下排序 */}
                <div className="flex flex-col items-center shrink-0" style={{ marginLeft: -4 }}>
                  <button onClick={() => moveZone(zi, zi - 1)} disabled={zi === 0} title="上移 Move up"
                    className="disabled:opacity-25" style={{ color: T.inkSoft }}><ChevronUp size={13} /></button>
                  <button draggable
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text', ''); dragRef.current = { zone: true, from: zi }; }}
                    title="拖动排序区域 Drag zone" className="cursor-grab active:cursor-grabbing" style={{ color: T.line }}><GripVertical size={13} /></button>
                  <button onClick={() => moveZone(zi, zi + 1)} disabled={zi === zones.length - 1} title="下移 Move down"
                    className="disabled:opacity-25" style={{ color: T.inkSoft }}><ChevronDown size={13} /></button>
                </div>
                <button onClick={() => updateZone(zone.id, { collapsed: !zone.collapsed })} style={{ color: T.inkSoft }}>
                  {zone.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </button>
                {/* 区域 = 房间：下拉选常见房间，也可直接改名；选「自定义」清空以便自填 */}
                <select value={ROOMS.includes(zone.name) ? zone.name : zone.name ? CUSTOM_ROOM : ''}
                  onChange={(e) => {
                    const custom = e.target.value === CUSTOM_ROOM;
                    updateZone(zone.id, { name: custom ? '' : e.target.value });
                    if (custom) setTimeout(() => document.getElementById(`zname-${zone.id}`)?.focus(), 0);
                  }}
                  className="bg-transparent outline-none font-display text-base sm:text-lg cursor-pointer min-w-0 flex-1 sm:flex-initial sm:max-w-[45%]" style={{ color: T.ink }}>
                  <option value="" disabled>Room 选区域…</option>
                  {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <input id={`zname-${zone.id}`} value={zone.name} onChange={(e) => updateZone(zone.id, { name: e.target.value })}
                  placeholder="Custom room 自定义区域名"
                  className={`${ROOMS.includes(zone.name) ? 'hidden sm:block' : 'block'} order-last basis-full sm:order-none sm:basis-0 sm:flex-1 min-w-0 bg-transparent outline-none text-sm py-1 sm:py-0 border-b border-dashed sm:border-b-0`}
                  style={{ color: T.inkSoft, borderColor: T.line }} />
                <label className="shrink-0 flex items-center gap-1 text-[11px]" style={{ color: zone.ceilingH ? T.inkSoft : T.terra }}
                  title="Ceiling height of this room 这个房间的楼高（衣柜默认做到顶）">
                  <span className="hidden sm:inline">Ceiling 楼高</span><span className="sm:hidden">楼高</span>
                  <input key={zone.ceilingH || 'none'} defaultValue={zone.ceilingH ? mmToM(zone.ceilingH) : ''} placeholder="2.70" inputMode="decimal"
                    onInput={() => ceilNote[zone.id] && setCeilNote((n) => ({ ...n, [zone.id]: '' }))}
                    onBlur={(e) => {
                      // 打 2700（毫米）也行：≥ 100 当毫米，并提示「2700 mm → 2.70 m」
                      const { mm: v, note } = parseMeters(e.target.value);
                      const ok = v > 1500;
                      if (ok) e.target.value = mmToM(v);
                      setCeilNote((n) => ({ ...n, [zone.id]: ok ? note : '' }));
                      updateZone(zone.id, { ceilingH: ok ? v : null });
                    }}
                    className="w-12 px-1 py-0.5 text-xs outline-none" style={{ background: T.paper, border: `1px solid ${zone.ceilingH ? T.line : T.terra}`, borderRadius: 2, color: T.ink }} />
                  m
                </label>
                <span className="font-display text-base sm:text-lg shrink-0" style={{ color: T.wood }}>{fmtMYR(zr?.subtotal || 0)}</span>
                <button onClick={() => removeZone(zone.id)} className="opacity-40 hover:opacity-100 shrink-0"
                  style={{ color: T.terra }} title="删除区域"><Trash2 size={15} /></button>
                {ceilNote[zone.id] && (
                  <div className="order-last basis-full text-right text-[10px]" style={{ color: T.wood }} data-mm-note>Ceiling 楼高 {ceilNote[zone.id]}</div>
                )}
              </div>

              {!zone.collapsed && (
                <div className="p-3 space-y-3" style={{ background: zoneBodyBg }}>
                  {(zone.cabinets || []).map((c) => (
                    <CabinetCard key={c.id} cab={c} lang={lang} total={cabinetTotal(c, defaults)}
                      onEdit={() => setEditingCab({ zoneId: zone.id, cab: c, isNew: false })}
                      onDuplicate={() => duplicateCabinet(zone.id, c)}
                      onRemove={() => removeCabinet(zone.id, c.id)} />
                  ))}
                  <button onClick={() => setPicking(zone.id)}
                    className="w-full py-3 flex items-center justify-center gap-2 text-sm"
                    style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}>
                    <Boxes size={16} /> Add cabinet 加柜子（选模板）
                  </button>
                  {zone.items.length === 0 && !(zone.cabinets || []).length && (
                    <div className="text-center py-1 text-[11px]" style={{ color: T.inkSoft }}>Or add a line manually below 或在下方手动加一行</div>
                  )}
                  {zone.items.map((it, idx) => (
                    isMobile ? (
                      /* 手机：紧凑摘要卡，点开弹窗编辑 */
                      <MobileItemCard key={it.id} item={it}
                        result={zr?.items.find((r) => r.item.id === it.id)}
                        selected={selItems.has(it.id)}
                        onToggleSelect={() => toggleSelItem(it.id)}
                        onEdit={() => setEditing({ zoneId: zone.id, item: it, isNew: false })}
                        canUp={idx > 0} canDown={idx < zone.items.length - 1}
                        onMoveUp={() => moveItem(zone.id, idx, idx - 1)}
                        onMoveDown={() => moveItem(zone.id, idx, idx + 1)} />
                    ) : (
                    <QuoteLineItem key={it.id} item={it}
                      result={zr?.items.find((r) => r.item.id === it.id)}
                      selected={selItems.has(it.id)}
                      onToggleSelect={() => toggleSelItem(it.id)}
                      onChange={(next) => updateItem(zone.id, next)}
                      onRemove={() => removeItem(zone.id, it.id)}
                      canUp={idx > 0} canDown={idx < zone.items.length - 1}
                      onMoveUp={() => moveItem(zone.id, idx, idx - 1)}
                      onMoveDown={() => moveItem(zone.id, idx, idx + 1)}
                      onDragStart={() => { dragRef.current = { zoneId: zone.id, from: idx }; }}
                      onDrop={() => {
                        const d = dragRef.current;
                        if (!d || !d.zoneId) return; // 非明细拖动 → 交给外层区域处理
                        if (d.zoneId === zone.id && d.from !== idx) moveItem(zone.id, d.from, idx);
                        dragRef.current = null;
                      }} />
                    )
                  ))}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {ADD_TYPES.map((a) => (
                      <button key={a.kind} onClick={() => onAddType(zone.id, a.kind)}
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
              <select value={discountMode} onChange={(e) => patch({ discountMode: e.target.value })}
                className="px-1 py-1 text-sm outline-none"
                style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}>
                <option value="pct">% 百分比</option>
                <option value="amt">RM 定额</option>
              </select>
              {discountMode === 'amt' ? (
                <input type="number" value={discountAmt}
                  onChange={(e) => patch({ discountAmt: Number(e.target.value) || 0 })}
                  className="w-24 px-2 py-1 text-sm outline-none"
                  style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
              ) : (
                <>
                  <input type="number" value={adjustPct}
                    onChange={(e) => patch({ adjustPct: Number(e.target.value) || 0 })}
                    className="w-16 px-2 py-1 text-sm outline-none"
                    style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
                  <span>%</span>
                </>
              )}
            </span>
            {computed.discount > 0 && <span style={{ color: T.terra }}>− {fmtMYR(computed.discount)}</span>}
            {computed.excluded > 0 && <span title="岩板 Sintered stone 不参与折扣，折扣只算在其余金额上">· 岩板不折扣 {fmtMYR(computed.excluded)}（折扣基数 {fmtMYR(computed.discountable)}）</span>}
          </div>
          {/* 折扣条件（显示在报价单折扣旁）*/}
          <div className="mt-2">
            <input value={discountNote} onChange={(e) => patch({ discountNote: e.target.value })}
              placeholder="Discount condition 折扣条件, e.g. Confirm order within 1 month 1个月内确认订单"
              className="w-full px-2 py-1.5 text-xs outline-none"
              style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
          </div>
          {/* 定制部分备注 */}
          <div className="mt-3 pt-3" style={{ borderTop: `1px dashed ${T.line}` }}>
            <label className="block text-[9px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>Notes 备注（定制 Cabinet）</label>
            <textarea value={cabinetNote} onChange={(e) => patch({ cabinetNote: e.target.value })} rows={2}
              placeholder="定制部分的特别备注 / 条款，会显示在报价单… Special notes for cabinet"
              className="w-full px-2 py-1.5 text-sm outline-none resize-y"
              style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
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
            {/* 家具 items 批量操作条 */}
            {selLoose.size > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded text-sm no-print"
                style={{ background: T.ink, color: T.paper }}>
                <span className="font-medium">{selLoose.size} selected 已选</span>
                <button onClick={bulkDuplicateLoose} className="flex items-center gap-1 px-2.5 py-1 rounded"
                  style={{ background: 'rgba(255,255,255,0.15)' }}><Copy size={13} /> Duplicate 复制</button>
                <button onClick={bulkDeleteLoose} className="flex items-center gap-1 px-2.5 py-1 rounded"
                  style={{ background: T.terra, color: '#fff' }}><Trash2 size={13} /> Delete 删除</button>
                <button onClick={selectAllLoose} className="px-2 py-1 opacity-80 hover:opacity-100">Select all 全选</button>
                <button onClick={clearSelLoose} className="ml-auto px-2 py-1 opacity-80 hover:opacity-100">Clear 取消</button>
              </div>
            )}
            {/* 表头 */}
            {looseItems.length > 0 && (
              <div className="hidden md:grid gap-2 px-6 text-[9px] uppercase tracking-widest" style={{ gridTemplateColumns: 'repeat(12, minmax(0,1fr))', color: T.inkSoft }}>
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
                selected={selLoose.has(it.id)}
                onToggleSelect={() => toggleSelLoose(it.id)}
                onChange={(p) => updateLoose(it.id, p)}
                onRemove={() => removeLoose(it.id)}
                canUp={idx > 0} canDown={idx < looseItems.length - 1}
                onMoveUp={() => moveLoose(idx, idx - 1)}
                onMoveDown={() => moveLoose(idx, idx + 1)}
                onDragStart={() => { dragRef.current = { loose: true, from: idx }; }}
                onDrop={() => {
                  const d = dragRef.current;
                  if (!d || !d.loose) return;
                  if (d.from !== idx) moveLoose(d.from, idx);
                  dragRef.current = null;
                }} />
            ))}
            <div className="flex items-center gap-3 flex-wrap pt-1">
              <button onClick={() => setShowCatalog(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs"
                style={{ background: T.wood, color: T.paper, borderRadius: '2px' }}>
                <Sofa size={13} /> Catalog 目录选品
              </button>
              <button onClick={addLoose}
                className="flex items-center gap-1 px-3 py-1.5 text-xs transition-colors"
                style={{ border: `1px solid ${T.line}`, borderRadius: '2px', color: T.inkSoft }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.wood; e.currentTarget.style.color = T.wood; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.inkSoft; }}>
                <Plus size={12} /> Manual 手动
              </button>
              {looseItems.length > 0 && (
                <div className="flex items-center gap-2 text-xs" style={{ color: T.inkSoft }}>
                  <span className="uppercase tracking-widest text-[10px]">Discount 折扣</span>
                  <select value={looseDiscountMode} onChange={(e) => patch({ looseDiscountMode: e.target.value })}
                    className="px-1 py-1 text-sm outline-none"
                    style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}>
                    <option value="pct">% 百分比</option>
                    <option value="amt">RM 定额</option>
                  </select>
                  {looseDiscountMode === 'amt' ? (
                    <input type="number" value={looseDiscountAmt}
                      onChange={(e) => patch({ looseDiscountAmt: Number(e.target.value) || 0 })}
                      className="w-24 px-2 py-1 text-sm outline-none"
                      style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
                  ) : (
                    <>
                      <input type="number" value={looseAdjustPct}
                        onChange={(e) => patch({ looseAdjustPct: Number(e.target.value) || 0 })}
                        className="w-16 px-2 py-1 text-sm outline-none"
                        style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
                      <span>%</span>
                    </>
                  )}
                  <span>　{looseCalc.discount > 0 ? `− ${fmtMYR(looseCalc.discount)} → ${fmtMYR(looseCalc.net)}` : ''}</span>
                </div>
              )}
            </div>
            {looseItems.length > 0 && (
              <div className="pt-1">
                <input value={looseDiscountNote} onChange={(e) => patch({ looseDiscountNote: e.target.value })}
                  placeholder="Discount condition 折扣条件, e.g. Confirm within 2 weeks 2周内确认"
                  className="w-full px-2 py-1.5 text-xs outline-none"
                  style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
              </div>
            )}
            {/* 家具部分备注 */}
            <div className="pt-1">
              <label className="block text-[9px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>Notes 备注（家具 Loose Furniture）</label>
              <textarea value={looseNote} onChange={(e) => patch({ looseNote: e.target.value })} rows={2}
                placeholder="家具部分的特别备注 / 条款… Special notes for loose furniture"
                className="w-full px-2 py-1.5 text-sm outline-none resize-y"
                style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
            </div>
          </div>
        </div>
      </div>

      {/* 手机「设计」tab：底部常驻总额，点一下看报价 */}
      {mobileTab === 'edit' && (
        <button onClick={() => onMobileTab && onMobileTab('summary')} className="no-print fixed left-0 right-0 z-20 flex items-center justify-between px-4 py-2.5"
          style={{ bottom: 'calc(58px + env(safe-area-inset-bottom))', background: T.ink, color: T.paper }}>
          <span className="text-[10px] uppercase tracking-widest opacity-75">Estimated total 预估总额</span>
          <span className="font-display text-xl">{fmtMYR(grandTotal)} →</span>
        </button>
      )}

      {/* ===== 右侧：汇总（手机「报价」tab）===== */}
      <div className={`space-y-4 ${mobileTab === 'edit' ? 'hidden' : ''}`}>
        <div className="sticky top-6 space-y-4">
          <div className="p-5 rounded" style={{ background: T.ink, color: T.paper }}>
            <div className="text-[10px] uppercase tracking-widest opacity-70">Estimated Total 预估总额</div>
            <div className="font-display text-4xl mt-1">{fmtMYR(grandTotal)}</div>
            {/* 定制 + 家具 两个小计（已含各自折扣）*/}
            <div className="text-xs mt-3 pt-3 opacity-90 space-y-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
              <div className="flex justify-between">
                <span>Cabinet 定制{computed.discount > 0 ? (computed.discountMode === 'amt' ? ` (−${fmtMYR(computed.discount)})` : ` (−${computed.adjustPct}%)`) : ''}</span>
                <span>{fmtMYR(computed.net)}</span>
              </div>
              {looseCalc.rows.length > 0 && (
                <div className="flex justify-between">
                  <span>Loose Furniture 家具{looseCalc.discount > 0 ? (looseCalc.discountMode === 'amt' ? ` (−${fmtMYR(looseCalc.discount)})` : ` (−${looseCalc.adjustPct}%)`) : ''}</span>
                  <span>{fmtMYR(looseCalc.net)}</span>
                </div>
              )}
            </div>
          </div>

          {/* 整份报价默认系列 + 一键比价 */}
          <div className="p-3 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: T.inkSoft }}>Default series 默认系列（全部柜子）</div>
            <div className="flex items-center gap-2 text-xs mb-2" style={{ color: T.inkSoft }}>
              <span className="w-14 shrink-0">Door 门板</span>
              <select value={defaults.door} onChange={(e) => patch({ defaults: { ...defaults, door: e.target.value } })}
                className="flex-1 px-2 py-1 text-sm outline-none" style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 2 }}>
                {DOOR_SERIES.map((L) => <option key={L} value={L}>{L}</option>)}
              </select>
              <span className="w-14 shrink-0 text-right">Carcass 柜体</span>
              <select value={defaults.carcass} onChange={(e) => patch({ defaults: { ...defaults, carcass: e.target.value } })}
                className="flex-1 px-2 py-1 text-sm outline-none" style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 2 }}>
                {CARCASS_SERIES.map((L) => <option key={L} value={L}>{L}</option>)}
              </select>
            </div>
            {hasCabinets && (
              <>
                <div className="text-[10px] uppercase tracking-widest mt-3 mb-1" style={{ color: T.inkSoft }}>Compare 整份比价（只换积木柜）</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {wholeCompare.map(({ L, net }) => {
                    const on = defaults.door === L && defaults.carcass === L;
                    return (
                      <button key={L} onClick={() => applySeriesAll(L)} className="p-2 text-left"
                        title={`Use series ${L} for all cabinets 全部柜子用 ${L} 系列`}
                        style={{ borderRadius: 2, background: on ? T.sand : T.paper, border: `1px solid ${on ? T.wood : T.line}` }}>
                        <div className="text-[10px]" style={{ color: T.inkSoft }}>{L}</div>
                        <div className="font-display text-sm" style={{ color: T.ink }}>{fmtMYR(net)}</div>
                      </button>
                    );
                  })}
                </div>
                {ownSeriesCells > 0 && (
                  <div className="text-[10px] mt-1.5" style={{ color: T.inkSoft }} data-own-series-note>
                    {ownSeriesCells} block{ownSeriesCells > 1 ? 's have' : ' has'} its own series and won't change · 有 {ownSeriesCells} 格单独选了系列，不跟着换
                  </div>
                )}
              </>
            )}
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

          {/* 客户类型 Client type：零售 / 设计师双价 / 设计师净价 */}
          <div className="p-3 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>Client 客户</span>
              <div className="flex gap-1 ml-auto flex-wrap justify-end">
                {[['retail', 'Retail 零售'], ['designer', 'Designer 双价'], ['designer_net', 'Designer 净价']].map(([id, label]) => {
                  const on = audience === id;
                  return (
                    <button key={id} onClick={() => setMeta({ audience: id })}
                      className="px-2.5 py-1 text-xs transition-colors"
                      style={{ borderRadius: '2px', background: on ? T.ink : 'transparent',
                        color: on ? T.paper : T.inkSoft, border: `1px solid ${on ? T.ink : T.line}` }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {audience !== 'retail' && (
              <div className="flex items-center gap-2 mt-2 text-xs flex-wrap" style={{ color: T.inkSoft }}>
                <span className="uppercase tracking-widest text-[10px]">Designer discount 设计师折扣</span>
                <input type="text" value={designerDisc}
                  onChange={(e) => setMeta({ designerDisc: e.target.value })}
                  placeholder="30 或 30+10"
                  className="w-24 px-2 py-1 text-sm outline-none"
                  style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
                <span>%　→ 供货价 = 零售 × {Math.round(designerRate * 1000) / 10}%（{discountChainLabel(designerDisc) || '—'}）{audience === 'designer_net' ? ' · 每个单价都换算' : ''}{computed.excluded > 0 ? ` · 岩板 ${fmtMYR(computed.excluded)} 不打折` : ''}</span>
              </div>
            )}
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
                  await exportExcel(meta, computed, looseCalc, { cabinetNote, looseNote, discountNote, looseDiscountNote, audience, designerDisc }, lang);
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
            <div className="grid grid-cols-2 gap-2">
              {/* 一键打开客户的 WhatsApp 对话，文字已填好（没填电话就让业务自己选联系人）*/}
              <a href={waLink(meta.phone, buildTextQuote(meta, computed, looseCalc, { cabinetNote, looseNote, discountNote, looseDiscountNote }, lang))}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 py-2.5 text-sm"
                style={{ background: '#25D366', color: '#fff', borderRadius: '2px' }}
                title={meta.phone ? `Send to ${meta.phone}` : 'Fill in the phone to open the chat directly 填电话可直接打开对话'}>
                <MessageCircle size={14} /> WhatsApp
              </a>
              <button onClick={async () => {
                const ok = await copyToClipboard(buildTextQuote(meta, computed, looseCalc, { cabinetNote, looseNote, discountNote, looseDiscountNote }, lang));
                toast(ok ? 'Copied 已复制' : 'Copy failed 复制失败', ok ? 'success' : 'error');
              }}
                className="flex items-center justify-center gap-1.5 py-2.5 text-sm"
                style={{ border: `1px solid ${T.line}`, borderRadius: '2px', color: T.inkSoft }}>
                <Copy size={14} /> Copy text 复制文本
              </button>
            </div>
          </div>

          {/* 内部参考：特殊工艺系数（不出现在报价单）*/}
          <div className="p-3 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: T.inkSoft }}>
              Special-craft Coef 特殊工艺系数 · Internal 内部
            </div>
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr className="text-[9px] uppercase tracking-wide" style={{ color: T.inkSoft }}>
                  <th className="text-left font-normal py-1">特殊工艺 Craft</th>
                  <th className="text-right font-normal py-1">系数 Coef</th>
                </tr>
              </thead>
              <tbody>
                {CRAFT_COEF.map((c) => (
                  <tr key={c.name} style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                    <td className="py-1" style={{ color: T.ink }}>{c.name}</td>
                    <td className="py-1 text-right font-medium" style={{ color: T.wood }}>× {c.coef}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {picking && <TemplatePicker onPick={(tid) => startCabinet(picking, tid)} onClose={() => setPicking(null)} />}
      {editingCab && (
        <CabinetEditor key={editingCab.cab.id} cab={editingCab.cab} isNew={editingCab.isNew} lang={lang}
          zone={zones.find((z) => z.id === editingCab.zoneId)} defaults={defaults}
          totalWith={totalWith(editingCab.zoneId)}
          onSave={(c) => { saveCabinet(editingCab.zoneId, c); setEditingCab(null); }}
          onDelete={async () => { const zid = editingCab.zoneId, cid = editingCab.cab.id; if (await confirm({ title: 'Delete cabinet 删除柜子', message: 'Delete this cabinet? 确定删除这个柜子？', danger: true, confirmText: 'Delete 删除', cancelText: 'Cancel 取消' })) { removeCabinetNow(zid, cid); setEditingCab(null); } }}
          onClose={() => setEditingCab(null)} />
      )}
      {showPrint && <QuotePrint meta={meta} computed={computed} loose={looseCalc} cabinetNote={cabinetNote} looseNote={looseNote} discountNote={discountNote} looseDiscountNote={looseDiscountNote} audience={audience} designerDisc={designerDisc} lang={lang} onClose={() => setShowPrint(false)} />}
      {showCatalog && (
        <CatalogPicker
          onAdd={(it) => setLoose((ls) => [...ls, { id: newId('lf'), ...it }])}
          onClose={() => setShowCatalog(false)} />
      )}
      {showMeasure && (
        <MeasureTool
          zones={zones.map((z) => ({ id: z.id, name: pickLang(z.name, lang) }))}
          onAddItems={handleMeasureAdd}
          onClose={() => setShowMeasure(false)} />
      )}
      {editing && (
        <ItemEditorModal
          key={editing.item.id}
          item={editing.item}
          isNew={editing.isNew}
          onSave={(next) => (editing.isNew ? addItem(editing.zoneId, next.type, next) : updateItem(editing.zoneId, next))}
          onDelete={editing.isNew ? undefined : () => removeItem(editing.zoneId, editing.item.id)}
          onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
