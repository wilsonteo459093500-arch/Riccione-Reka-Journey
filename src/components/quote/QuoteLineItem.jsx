import { Trash2 } from 'lucide-react';
import { T } from '../../theme.js';
import {
  SERIES, DOOR_SERIES, CARCASS_SERIES, CABINET_PRESETS, presetById,
  WALL_PANEL_PRESETS, ROOM_DOOR_PRESETS, isLinear, fmtMYR,
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

// 单条明细编辑器 —— 依 item.type 呈现不同字段
export default function QuoteLineItem({ item, result, onChange, onRemove }) {
  const set = (patch) => onChange({ ...item, ...patch });
  const total = result?.total || 0;

  const TypeBadge = (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
      style={{ background: T.sand, color: T.inkSoft }}>
      {({ cabinet: '橱柜', panel: '墙板', roomdoor: '房门', led: '灯带', other: '其他' })[item.type]}
    </span>
  );

  return (
    <div className="p-3 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: 'repeat(12, minmax(0,1fr))' }}>

          {item.type === 'cabinet' && (
            <>
              <Field label="区域 / 橱柜" w="col-span-4">
                <Sel value={item.preset} onChange={(id) => {
                  const p = presetById(id);
                  set({ preset: id, h: p.h, d: p.d, name: item.name || p.label });
                }}>
                  {CABINET_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Sel>
              </Field>
              <Field label="名称 (报价显示)" w="col-span-4">
                <Txt value={item.name} onChange={(v) => set({ name: v })} placeholder="如：主卧衣柜" />
              </Field>
              <Field label={`长度 米 ${isLinear(item.h) ? '· 延米' : '· 面积'}`} w="col-span-2">
                <Txt value={item.length} onChange={(v) => set({ length: v })} placeholder="2.86+2.6" />
              </Field>
              <Field label="抽屉 套" w="col-span-2">
                <Txt value={item.drawers} onChange={(v) => set({ drawers: v })} placeholder="0" />
              </Field>

              <Field label="门板系列" w="col-span-3">
                <Sel value={item.doorSeries} onChange={(v) => set({ doorSeries: v })}>
                  {DOOR_SERIES.map((id) => {
                    const s = SERIES.find((x) => x.id === id);
                    return <option key={id} value={id}>{id} · {s.material}</option>;
                  })}
                </Sel>
              </Field>
              <Field label="柜体系列" w="col-span-3">
                <Sel value={item.carcassSeries} onChange={(v) => set({ carcassSeries: v })}>
                  {CARCASS_SERIES.map((id) => {
                    const s = SERIES.find((x) => x.id === id);
                    return <option key={id} value={id}>{id} · {s.material}</option>;
                  })}
                </Sel>
              </Field>
              <Field label="高 米" w="col-span-2">
                <Txt value={item.h} onChange={(v) => set({ h: v })} />
              </Field>
              <Field label="深 米" w="col-span-2">
                <Txt value={item.d} onChange={(v) => set({ d: v })} />
              </Field>
              <Field label="含" w="col-span-2">
                <div className="flex gap-2 pt-1.5 text-[11px]" style={{ color: T.inkSoft }}>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={item.hasDoor !== false}
                      onChange={(e) => set({ hasDoor: e.target.checked })} />门板
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={item.hasCarcass !== false}
                      onChange={(e) => set({ hasCarcass: e.target.checked })} />柜体
                  </label>
                </div>
              </Field>
            </>
          )}

          {item.type === 'panel' && (
            <>
              <Field label="墙板类型" w="col-span-3">
                <Sel value={item.preset} onChange={(id) => {
                  const p = WALL_PANEL_PRESETS.find((x) => x.id === id);
                  set({ preset: id, h: p.h, name: item.name || p.label });
                }}>
                  {WALL_PANEL_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Sel>
              </Field>
              <Field label="名称" w="col-span-3">
                <Txt value={item.name} onChange={(v) => set({ name: v })} placeholder="如：客厅护墙板" />
              </Field>
              <Field label="长度 米" w="col-span-2">
                <Txt value={item.length} onChange={(v) => set({ length: v })} placeholder="3.5" />
              </Field>
              <Field label="高 米" w="col-span-2">
                <Txt value={item.h} onChange={(v) => set({ h: v })} />
              </Field>
              <Field label="系列" w="col-span-2">
                <Sel value={item.panelSeries} onChange={(v) => set({ panelSeries: v })}>
                  {DOOR_SERIES.map((id) => <option key={id} value={id}>{id}</option>)}
                </Sel>
              </Field>
            </>
          )}

          {item.type === 'roomdoor' && (
            <>
              <Field label="房门类型" w="col-span-4">
                <Sel value={item.preset} onChange={(id) => {
                  const p = ROOM_DOOR_PRESETS.find((x) => x.id === id);
                  set({ preset: id, unitMyr: p.price, desc: item.desc || p.label });
                }}>
                  {ROOM_DOOR_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Sel>
              </Field>
              <Field label="名称 / 位置" w="col-span-4">
                <Txt value={item.desc} onChange={(v) => set({ desc: v })} placeholder="如：主卧房门" />
              </Field>
              <Field label="数量 樘" w="col-span-2">
                <Txt value={item.qty} onChange={(v) => set({ qty: v })} placeholder="1" />
              </Field>
              <Field label="单价 RM" w="col-span-2">
                <Txt value={item.unitMyr} onChange={(v) => set({ unitMyr: v })} />
              </Field>
            </>
          )}

          {item.type === 'led' && (
            <>
              <Field label="名称" w="col-span-6">
                <Txt value={item.desc} onChange={(v) => set({ desc: v })} placeholder="整体灯带 LED" />
              </Field>
              <Field label="长度 米" w="col-span-3">
                <Txt value={item.length} onChange={(v) => set({ length: v })} placeholder="30" />
              </Field>
              <div className="col-span-3 flex items-end text-[11px] pb-1.5" style={{ color: T.inkSoft }}>
                D-001 平照灯带 · 370元/米
              </div>
            </>
          )}

          {item.type === 'other' && (
            <>
              <Field label="项目名称" w="col-span-5">
                <Txt value={item.desc} onChange={(v) => set({ desc: v })} placeholder="如：金属拉手 / 安装费" />
              </Field>
              <Field label="数量" w="col-span-2">
                <Txt value={item.qty} onChange={(v) => set({ qty: v })} placeholder="1" />
              </Field>
              <Field label="单位" w="col-span-2">
                <Txt value={item.uom} onChange={(v) => set({ uom: v })} placeholder="项" />
              </Field>
              <Field label="单价 RM" w="col-span-3">
                <Txt value={item.unitMyr} onChange={(v) => set({ unitMyr: v })} />
              </Field>
            </>
          )}
        </div>

        <div className="flex flex-col items-end justify-between self-stretch min-w-[110px]">
          <button onClick={onRemove} className="opacity-40 hover:opacity-100 transition-opacity"
            style={{ color: T.terra }} title="删除">
            <Trash2 size={15} strokeWidth={1.5} />
          </button>
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">{TypeBadge}</div>
            <div className="font-display text-lg mt-1" style={{ color: T.ink }}>{fmtMYR(total)}</div>
          </div>
        </div>
      </div>

      {result?.lines?.length > 1 && (
        <div className="mt-2 pt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]"
          style={{ borderTop: `1px dashed ${T.line}`, color: T.inkSoft }}>
          {result.lines.map((ln, i) => (
            <span key={i}>
              {ln.desc}: {ln.qty.toFixed(ln.uom === '套' || ln.uom === '樘' || ln.uom === '项' ? 0 : 2)}{ln.uom} × RM{Math.round(ln.unitMyr)} = <b style={{ color: T.ink }}>{fmtMYR(ln.total)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
