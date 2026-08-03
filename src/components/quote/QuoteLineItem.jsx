import { Trash2, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { T } from '../../theme.js';
import {
  DOOR_SERIES, CARCASS_SERIES, OPEN_SERIES, CABINET_TYPES, cabTypeById,
  WALL_PANEL_PRESETS, ROOM_DOOR_PRESETS, isLinear, fmtMYR, cnyToMyr,
} from '../../constants/pricing.js';

const cellStyle = { background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' };
const lbl = 'block text-[9px] uppercase tracking-widest mb-1';

function Field({ label, children, w = '' }) {
  return (
    <div className={w}>
      <label className={lbl} style={{ color: T.inkSoft }}>{label}</label>
      {children}
    </div>
  );
}

function Txt({ value, onChange, placeholder = '', className = '' }) {
  return (
    <input
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-2 py-1.5 text-sm outline-none ${className}`}
      style={cellStyle}
      onFocus={(e) => (e.target.style.borderColor = T.wood)}
      onBlur={(e) => (e.target.style.borderColor = T.line)}
    />
  );
}

function Sel({ value, onChange, children }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1.5 text-sm outline-none" style={cellStyle}>
      {children}
    </select>
  );
}

const TYPE_LABEL = { panel: 'Panel 墙板', roomdoor: 'Door 房门', led: 'LED 灯带', other: 'Other 其他' };

// 单条明细编辑器 —— 依 item.type 呈现不同字段
export default function QuoteLineItem({ item, result, onChange, onRemove, onDragStart, onDrop, onMoveUp, onMoveDown, canUp, canDown, selected, onToggleSelect }) {
  const set = (patch) => onChange({ ...item, ...patch });
  const total = result?.total || 0;
  const badge = item.type === 'cabinet' ? cabTypeById(item.cabType).label : TYPE_LABEL[item.type];

  return (
    <div className="p-3 rounded" style={{ background: selected ? T.sand : T.cream, border: `1px solid ${selected ? T.wood : T.lineSoft}` }}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={onDrop ? (e) => { e.preventDefault(); onDrop(); } : undefined}>
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center pt-0.5 shrink-0 gap-1">
          {onToggleSelect && (
            <input type="checkbox" checked={!!selected} onChange={onToggleSelect}
              title="Select 选择" className="cursor-pointer" style={{ accentColor: T.wood }} />
          )}
          {(onDragStart || onMoveUp) && (
            <>
              <button onClick={onMoveUp} disabled={!canUp} title="上移 Move up"
                className="disabled:opacity-25" style={{ color: T.inkSoft }}><ChevronUp size={13} /></button>
              <button draggable
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text', ''); onDragStart?.(); }}
                title="拖动排序 Drag to reorder"
                className="cursor-grab active:cursor-grabbing" style={{ color: T.line }}><GripVertical size={14} /></button>
              <button onClick={onMoveDown} disabled={!canDown} title="下移 Move down"
                className="disabled:opacity-25" style={{ color: T.inkSoft }}><ChevronDown size={13} /></button>
            </>
          )}
        </div>
        <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: 'repeat(12, minmax(0,1fr))' }}>

          {item.type === 'cabinet' && (
            <>
              <Field label="Type 柜体类型" w="col-span-3">
                <Sel value={item.cabType} onChange={(id) => {
                  const t = cabTypeById(id);
                  const wasOpen = item.cabType === 'open';
                  const isOpen = id === 'open';
                  const patch = { cabType: id, h: t.h, d: t.d };
                  if (isOpen && !wasOpen) { patch.hasDoor = false; patch.hasCarcass = false; patch.hasOpen = true; }
                  if (!isOpen && wasOpen) { patch.hasDoor = true; patch.hasCarcass = true; patch.hasOpen = false; }
                  set(patch);
                }}>
                  {CABINET_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Sel>
              </Field>
              <Field label="Name 名称 (optional)" w="col-span-3">
                <Txt value={item.name} onChange={(v) => set({ name: v })} placeholder="e.g. TV 电视柜" />
              </Field>
              <Field label={`Length 长度 m · ${isLinear(item.h) ? 'L.m 延米' : 'Area 面积'}`} w="col-span-2">
                <Txt value={item.length} onChange={(v) => set({ length: v })} placeholder="2.86+2.6" />
              </Field>
              <Field label="H 高 m" w="col-span-1">
                <Txt value={item.h} onChange={(v) => set({ h: v })} />
              </Field>
              <Field label="D 深 m" w="col-span-1">
                <Txt value={item.d} onChange={(v) => set({ d: v })} />
              </Field>
              <Field label="Drawer 抽屉 set" w="col-span-2">
                <Txt value={item.drawers} onChange={(v) => set({ drawers: v })} placeholder="0" />
              </Field>

              <Field label="Door Series 门板系列" w="col-span-4">
                <Sel value={item.doorSeries} onChange={(v) => set({ doorSeries: v })}>
                  {DOOR_SERIES.map((id) => <option key={id} value={id}>{id} Series 系列</option>)}
                </Sel>
              </Field>
              <Field label="Carcass Series 柜体系列" w="col-span-4">
                <Sel value={item.carcassSeries} onChange={(v) => set({ carcassSeries: v })}>
                  {CARCASS_SERIES.map((id) => <option key={id} value={id}>{id} Series 系列</option>)}
                </Sel>
              </Field>
              <Field label="Open Cab. Series 开放柜系列" w="col-span-4">
                <Sel value={item.openSeries || 'A'} onChange={(v) => set({ openSeries: v })}>
                  {OPEN_SERIES.map((id) => <option key={id} value={id}>{id} Series 系列</option>)}
                </Sel>
              </Field>
              <Field label="Include 包含" w="col-span-12">
                <div className="flex flex-wrap gap-4 pt-1.5 text-[11px]" style={{ color: T.inkSoft }}>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={item.hasDoor !== false}
                      onChange={(e) => set({ hasDoor: e.target.checked })} />Door 门板
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={item.hasCarcass !== false}
                      onChange={(e) => set({ hasCarcass: e.target.checked })} />Carcass 柜体
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={!!item.hasOpen}
                      onChange={(e) => set({ hasOpen: e.target.checked })} />Open Cabinet 开放柜 (投影)
                  </label>
                </div>
              </Field>
            </>
          )}

          {item.type === 'panel' && (
            <>
              <Field label="Panel Type 墙板类型" w="col-span-3">
                <Sel value={item.preset} onChange={(id) => {
                  const p = WALL_PANEL_PRESETS.find((x) => x.id === id);
                  set({ preset: id, h: p.h, name: item.name || p.label });
                }}>
                  {WALL_PANEL_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Sel>
              </Field>
              <Field label="Name 名称 (optional)" w="col-span-3">
                <Txt value={item.name} onChange={(v) => set({ name: v })} placeholder="e.g. Living wall 客厅护墙板" />
              </Field>
              <Field label="Length 长度 m" w="col-span-2">
                <Txt value={item.length} onChange={(v) => set({ length: v })} placeholder="3.5" />
              </Field>
              <Field label="H 高 m" w="col-span-2">
                <Txt value={item.h} onChange={(v) => set({ h: v })} />
              </Field>
              <Field label="Series 系列" w="col-span-2">
                <Sel value={item.panelSeries} onChange={(v) => set({ panelSeries: v })}>
                  {DOOR_SERIES.map((id) => <option key={id} value={id}>{id}</option>)}
                </Sel>
              </Field>
            </>
          )}

          {item.type === 'roomdoor' && (
            <>
              <Field label="Door Type 房门类型" w="col-span-4">
                <Sel value={item.preset} onChange={(id) => {
                  const p = ROOM_DOOR_PRESETS.find((x) => x.id === id);
                  set({ preset: id, unitMyr: p.price, desc: item.desc || p.label });
                }}>
                  {ROOM_DOOR_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Sel>
              </Field>
              <Field label="Name 名称/位置" w="col-span-4">
                <Txt value={item.desc} onChange={(v) => set({ desc: v })} placeholder="e.g. Master door 主卧房门" />
              </Field>
              <Field label="Qty 数量 pc" w="col-span-2">
                <Txt value={item.qty} onChange={(v) => set({ qty: v })} placeholder="1" />
              </Field>
              <Field label="Unit 单价 RM" w="col-span-2">
                <Txt value={item.unitMyr} onChange={(v) => set({ unitMyr: v })} />
              </Field>
            </>
          )}

          {item.type === 'led' && (
            <>
              <Field label="Name 名称" w="col-span-6">
                <Txt value={item.desc} onChange={(v) => set({ desc: v })} placeholder="LED 整体灯带" />
              </Field>
              <Field label="Length 长度 m" w="col-span-3">
                <Txt value={item.length} onChange={(v) => set({ length: v })} placeholder="30" />
              </Field>
              <div className="col-span-3 flex items-end text-[11px] pb-1.5" style={{ color: T.inkSoft }}>
                D-001 平照灯带 · 370元/米
              </div>
            </>
          )}

          {item.type === 'other' && (
            <>
              <Field label="Item 项目名称" w="col-span-4">
                <Txt value={item.desc} onChange={(v) => set({ desc: v })} placeholder="e.g. Handle 金属拉手 / Install 安装费" />
              </Field>
              <Field label="Qty 数量" w="col-span-2">
                <Txt value={item.qty} onChange={(v) => set({ qty: v })} placeholder="1" />
              </Field>
              <Field label="UOM 单位" w="col-span-2">
                <Txt value={item.uom} onChange={(v) => set({ uom: v })} placeholder="item 项" />
              </Field>
              {/* 人民币价 → 自动换算马币零售价 MROUND(CNY*1.3/1.65,5) */}
              <Field label="Unit 单价 CNY 人民币" w="col-span-2">
                <Txt value={item.unitCny} placeholder="自动换算"
                  onChange={(v) => set({ unitCny: v, unitMyr: v ? String(cnyToMyr(Number(v) || 0)) : item.unitMyr })} />
              </Field>
              <Field label="Unit 单价 RM" w="col-span-2">
                <Txt value={item.unitMyr} onChange={(v) => set({ unitMyr: v, unitCny: '' })} />
              </Field>
            </>
          )}
        </div>

        <div className="flex flex-col items-end justify-between self-stretch min-w-[120px]">
          <button onClick={onRemove} className="opacity-40 hover:opacity-100 transition-opacity"
            style={{ color: T.terra }} title="Delete 删除">
            <Trash2 size={15} strokeWidth={1.5} />
          </button>
          <div className="text-right">
            {/* 系数（特殊工艺）：单价 × 系数 */}
            <div className="flex items-center gap-1 justify-end mb-1" title={item.type === 'cabinet' ? '系数只乘门板 Coef applies to door only' : '特殊工艺系数 Special-craft multiplier'}>
              <span className="text-[9px] uppercase tracking-wide" style={{ color: T.inkSoft }}>{item.type === 'cabinet' ? '× 门板 Door 系数' : '× Coef 系数'}</span>
              <input type="number" step="0.01" min="0" value={item.coef ?? ''}
                onChange={(e) => set({ coef: e.target.value })} placeholder="1"
                className="w-14 px-1.5 py-1 text-sm outline-none text-right" style={cellStyle}
                onFocus={(e) => (e.target.style.borderColor = T.wood)}
                onBlur={(e) => (e.target.style.borderColor = T.line)} />
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: T.sand, color: T.inkSoft }}>{badge}</span>
            <div className="font-display text-lg mt-1" style={{ color: T.ink }}>{fmtMYR(total)}</div>
          </div>
        </div>
      </div>

      {result?.lines?.length > 1 && (
        <div className="mt-2 pt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]"
          style={{ borderTop: `1px dashed ${T.line}`, color: T.inkSoft }}>
          {result.lines.map((ln, i) => (
            <span key={i}>
              {ln.descEn} {ln.descZh}: {ln.qty.toFixed(ln.piece ? 0 : 2)}{ln.uomZh} × RM{Math.round(ln.unitMyr)} = <b style={{ color: T.ink }}>{fmtMYR(ln.total)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
