import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Check } from 'lucide-react';
import { T } from '../../theme.js';
import {
  DOOR_SERIES, CARCASS_SERIES, OPEN_SERIES, CABINET_TYPES, cabTypeById,
  WALL_PANEL_PRESETS, ROOM_DOOR_PRESETS, isLinear, fmtMYR, cnyToMyr, computeItem, isNoDiscount,
} from '../../constants/pricing.js';

// ============================================================
// 手机友好的项目编辑弹窗：字段一行一个、大输入框，底部固定 保存/取消。
// 新增 & 编辑共用：本地草稿，按「保存」才回写。
// ============================================================
const cell = { background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' };
const TYPE_LABEL = { panel: 'Panel 墙板', roomdoor: 'Door 房门', led: 'LED 灯带', other: 'Other 其他' };

function Row({ label, hint, children }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>
        {label}{hint && <span className="ml-1 normal-case tracking-normal" style={{ color: T.wood }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}
function Txt({ value, onChange, placeholder = '', type = 'text', inputMode }) {
  return (
    <input value={value ?? ''} type={type} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2.5 text-base outline-none" style={cell}
      onFocus={(e) => (e.target.style.borderColor = T.wood)} onBlur={(e) => (e.target.style.borderColor = T.line)} />
  );
}
function Sel({ value, onChange, children }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2.5 text-base outline-none" style={cell}>
      {children}
    </select>
  );
}

export default function ItemEditorModal({ item: initial, isNew = false, onSave, onDelete, onClose }) {
  const [item, setItem] = useState(initial);
  const set = (patch) => setItem((it) => ({ ...it, ...patch }));
  const result = useMemo(() => computeItem(item), [item]);
  const title = item.type === 'cabinet' ? cabTypeById(item.cabType).label : TYPE_LABEL[item.type];
  const num = { type: 'text', inputMode: 'decimal' };

  const save = () => { onSave(item); onClose(); };

  return createPortal(
    <div className="fixed inset-0 z-50 no-print flex items-end sm:items-center justify-center" style={{ background: 'rgba(45,62,54,0.85)' }} onClick={onClose}>
      <div className="w-full sm:max-w-md sm:rounded flex flex-col" style={{ background: T.paper, maxHeight: '94vh' }} onClick={(e) => e.stopPropagation()}>
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
          <div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>{isNew ? 'Add 新增' : 'Edit 编辑'}</div>
            <div className="font-display text-lg" style={{ color: T.ink }}>{title}</div>
          </div>
          <button onClick={onClose} style={{ color: T.inkSoft }}><X size={20} /></button>
        </div>

        {/* 字段 */}
        <div className="overflow-auto px-4 py-4 space-y-4 flex-1">
          {item.type === 'cabinet' && (
            <>
              <Row label="Type 柜体类型">
                <Sel value={item.cabType} onChange={(id) => {
                  const t = cabTypeById(id);
                  const wasOpen = item.cabType === 'open'; const isOpen = id === 'open';
                  const patch = { cabType: id, h: t.h, d: t.d };
                  if (isOpen && !wasOpen) { patch.hasDoor = false; patch.hasCarcass = false; patch.hasOpen = true; }
                  if (!isOpen && wasOpen) { patch.hasDoor = true; patch.hasCarcass = true; patch.hasOpen = false; }
                  set(patch);
                }}>
                  {CABINET_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Sel>
              </Row>
              <Row label="Name 名称 (optional)">
                <Txt value={item.name} onChange={(v) => set({ name: v })} placeholder="e.g. TV 电视柜" />
              </Row>
              <Row label="Length 长度 m" hint={isLinear(item.h) ? '· L.m 延米' : '· Area 面积'}>
                <Txt value={item.length} onChange={(v) => set({ length: v })} placeholder="2.86+2.6（可用 + 相加）" {...num} />
              </Row>
              <div className="grid grid-cols-2 gap-3">
                <Row label="H 高 m"><Txt value={item.h} onChange={(v) => set({ h: v })} {...num} /></Row>
                <Row label="D 深 m"><Txt value={item.d} onChange={(v) => set({ d: v })} {...num} /></Row>
              </div>
              <Row label="Drawer 抽屉 set"><Txt value={item.drawers} onChange={(v) => set({ drawers: v })} placeholder="0" {...num} /></Row>

              {item.cabType === 'open' ? (
                <Row label="Open Cab. Series 开放柜系列">
                  <Sel value={item.openSeries || 'A'} onChange={(v) => set({ openSeries: v })}>
                    {OPEN_SERIES.map((id) => <option key={id} value={id}>{id} Series 系列</option>)}
                  </Sel>
                </Row>
              ) : (
                <>
                  <Row label="Door Series 门板系列">
                    <Sel value={item.doorSeries} onChange={(v) => set({ doorSeries: v })}>
                      {DOOR_SERIES.map((id) => <option key={id} value={id}>{id} Series 系列</option>)}
                    </Sel>
                  </Row>
                  <Row label="Carcass Series 柜体系列">
                    <Sel value={item.carcassSeries} onChange={(v) => set({ carcassSeries: v })}>
                      {CARCASS_SERIES.map((id) => <option key={id} value={id}>{id} Series 系列</option>)}
                    </Sel>
                  </Row>
                  <Row label="Include 包含">
                    <div className="flex gap-6 pt-1 text-sm" style={{ color: T.ink }}>
                      <label className="flex items-center gap-2"><input type="checkbox" className="w-5 h-5" checked={item.hasDoor !== false} onChange={(e) => set({ hasDoor: e.target.checked })} />Door 门板</label>
                      <label className="flex items-center gap-2"><input type="checkbox" className="w-5 h-5" checked={item.hasCarcass !== false} onChange={(e) => set({ hasCarcass: e.target.checked })} />Carcass 柜体</label>
                    </div>
                  </Row>
                </>
              )}
            </>
          )}

          {item.type === 'panel' && (
            <>
              <Row label="Panel Type 墙板类型">
                <Sel value={item.preset} onChange={(id) => { const p = WALL_PANEL_PRESETS.find((x) => x.id === id); set({ preset: id, h: p.h, name: item.name || p.label }); }}>
                  {WALL_PANEL_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Sel>
              </Row>
              <Row label="Name 名称 (optional)"><Txt value={item.name} onChange={(v) => set({ name: v })} placeholder="e.g. Living wall 客厅护墙板" /></Row>
              <div className="grid grid-cols-2 gap-3">
                <Row label="Length 长度 m"><Txt value={item.length} onChange={(v) => set({ length: v })} placeholder="3.5" {...num} /></Row>
                <Row label="H 高 m"><Txt value={item.h} onChange={(v) => set({ h: v })} {...num} /></Row>
              </div>
              <Row label="Series 系列">
                <Sel value={item.panelSeries} onChange={(v) => set({ panelSeries: v })}>{DOOR_SERIES.map((id) => <option key={id} value={id}>{id}</option>)}</Sel>
              </Row>
            </>
          )}

          {item.type === 'roomdoor' && (
            <>
              <Row label="Door Type 房门类型">
                <Sel value={item.preset} onChange={(id) => { const p = ROOM_DOOR_PRESETS.find((x) => x.id === id); set({ preset: id, unitMyr: p.price, desc: item.desc || p.label }); }}>
                  {ROOM_DOOR_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Sel>
              </Row>
              <Row label="Name 名称/位置"><Txt value={item.desc} onChange={(v) => set({ desc: v })} placeholder="e.g. Master door 主卧房门" /></Row>
              <div className="grid grid-cols-2 gap-3">
                <Row label="Qty 数量 pc"><Txt value={item.qty} onChange={(v) => set({ qty: v })} placeholder="1" {...num} /></Row>
                <Row label="Unit 单价 RM"><Txt value={item.unitMyr} onChange={(v) => set({ unitMyr: v })} {...num} /></Row>
              </div>
            </>
          )}

          {item.type === 'led' && (
            <>
              <Row label="Name 名称"><Txt value={item.desc} onChange={(v) => set({ desc: v })} placeholder="LED 整体灯带" /></Row>
              <Row label="Length 长度 m" hint="· D-001 平照灯带 370元/米"><Txt value={item.length} onChange={(v) => set({ length: v })} placeholder="30" {...num} /></Row>
            </>
          )}

          {item.type === 'other' && (
            <>
              <Row label="Item 项目名称"><Txt value={item.desc} onChange={(v) => set({ desc: v })} placeholder="e.g. Handle 金属拉手 / Install 安装费" /></Row>
              <div className="grid grid-cols-2 gap-3">
                <Row label="Qty 数量"><Txt value={item.qty} onChange={(v) => set({ qty: v })} placeholder="1" {...num} /></Row>
                <Row label="UOM 单位"><Txt value={item.uom} onChange={(v) => set({ uom: v })} placeholder="item 项" /></Row>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Row label="Unit 单价 CNY 人民币" hint="· 自动换算">
                  <Txt value={item.unitCny} placeholder="填人民币" {...num}
                    onChange={(v) => set({ unitCny: v, unitMyr: v ? String(cnyToMyr(Number(v) || 0)) : item.unitMyr })} />
                </Row>
                <Row label="Unit 单价 RM"><Txt value={item.unitMyr} onChange={(v) => set({ unitMyr: v, unitCny: '' })} {...num} /></Row>
              </div>
            </>
          )}

          {/* 系数（特殊工艺）：定制柜可选乘门板 / 柜体 / 两者，默认门板 */}
          {item.type === 'cabinet' ? (
            <div className="grid grid-cols-2 gap-3">
              <Row label="× Coef 系数" hint="· 特殊工艺才填，留空 = 1">
                <Txt value={item.coef ?? ''} onChange={(v) => set({ coef: v })} placeholder="1" {...num} />
              </Row>
              <Row label="Apply to 乘在">
                <Sel value={item.coefTarget || 'door'} onChange={(v) => set({ coefTarget: v })}>
                  <option value="door">Door 门板</option>
                  <option value="carcass">Carcass 柜体</option>
                  <option value="both">Both 两者</option>
                </Sel>
              </Row>
            </div>
          ) : (
            <Row label="× Coef 系数" hint="· 特殊工艺才填，留空 = 1">
              <Txt value={item.coef ?? ''} onChange={(v) => set({ coef: v })} placeholder="1" {...num} />
            </Row>
          )}

          {/* 不折扣：岩板 sintered stone 自动勾上，也可手动改 */}
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: isNoDiscount(item) ? T.terra : T.ink }}>
            <input type="checkbox" className="w-5 h-5" checked={isNoDiscount(item)} onChange={(e) => set({ noDiscount: e.target.checked })} style={{ accentColor: T.terra }} />
            No discount 不参与折扣<span className="text-xs" style={{ color: T.inkSoft }}>（岩板 sintered stone 自动勾）</span>
          </label>

          {/* 实时算价 */}
          <div className="p-3 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
            {result.lines.map((ln, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5" style={{ color: T.inkSoft }}>
                <span>{ln.descZh} {ln.descEn}: {ln.piece ? Math.round(ln.qty) : Number(ln.qty.toFixed(2))}{ln.uomZh} × RM{Math.round(ln.unitMyr)}</span>
                <span style={{ color: T.ink }}>{fmtMYR(ln.total)}</span>
              </div>
            ))}
            <div className="flex justify-between items-baseline pt-2 mt-1" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
              <span className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>Total 小计</span>
              <span className="font-display text-xl" style={{ color: T.wood }}>{fmtMYR(result.total)}</span>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center gap-2 px-4 py-3 shrink-0" style={{ borderTop: `1px solid ${T.lineSoft}`, background: T.paper, paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          {!isNew && onDelete && (
            <button onClick={() => { onDelete(); onClose(); }} className="px-3 py-3 flex items-center gap-1 text-sm" style={{ color: T.terra, border: `1px solid ${T.line}`, borderRadius: 2 }}>
              <Trash2 size={15} /> 删除
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-3 text-sm" style={{ border: `1px solid ${T.line}`, borderRadius: 2, color: T.inkSoft }}>Cancel 取消</button>
          <button onClick={save} className="flex-1 py-3 text-sm flex items-center justify-center gap-1.5" style={{ background: T.ink, color: T.paper, borderRadius: 2 }}>
            <Check size={16} /> {isNew ? 'Add 加入' : 'Save 保存'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
