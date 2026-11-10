// 积木柜编辑器（全屏）：上面看图、下面改设定（手机）；左图右设定（电脑）。底部常驻价钱条。
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, RotateCcw, Trash2, AlertTriangle, LayoutTemplate, SquareDashedMousePointer } from 'lucide-react';
import { T } from '../../theme.js';
import { fmtMYR, DOOR_SERIES, CARCASS_SERIES, seriesById, cnyToMyr } from '../../constants/pricing.js';
import { templateOf, updateSpec, setUnit } from '../../planner/templates.js';
import { cabinetTotal, resolveSeries, customSeriesCount } from '../../planner/bridge.js';
import { explainCabinet } from '../../planner/explain.js';
import { validateCabinet } from '../../planner/validate.js';
import { layoutLeaves, bodyHeight, CRAFT_COEF, DEFAULT_GLASS_COEF, mmToM } from '../../planner/model.js';
import { FINISHES, HANDLES, DEFAULT_DOOR_FINISH, DEFAULT_CARCASS_FINISH } from '../../render/palette.js';
import SvgShapes from '../../render/SvgShapes.jsx';
import { elevationScene } from '../../render/elevation.js';
import { axoScene } from '../../render/axo.js';
import { Section, Segmented, Toggle, Stepper, MeterInput, Collapse, Tip, useBackClose } from './bits.jsx';
import { useConfirm } from '../ui/UIProvider.jsx';
import KitchenSettings from './KitchenSettings.jsx';
import { TvSettings, ShoeSettings } from './TvShoeSettings.jsx';
import { useBlockEditor, useBlockKeys, BlockCanvas, BlockPanel } from './BlockEditor.jsx';

const tx = (o, lang) => (lang === 'en' ? o.en : lang === 'zh' ? o.zh : `${o.zh} ${o.en}`);

// mode（立面 / 立体）由 CabinetEditor 管；画框框模式下「立面」= 可以点、可以拖的色块图（children）
function Preview({ cab, onYaw, lang, mode, setMode, children }) {
  const yaw = cab.view?.yaw ?? -30;
  const editing = mode === 'elev' && children;
  const scene = useMemo(() => {
    if (editing) return null;
    try { return mode === 'elev' ? elevationScene(cab, { style: 'drawing', dims: true, lang }) : axoScene(cab, { yaw }); } catch (e) { return null; }
  }, [cab, mode, yaw, lang, editing]);
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-2 pt-2">
        <Segmented size="sm" value={mode} onChange={setMode}
          options={[{ id: 'elev', label: children ? '色块 Blocks' : '立面 Elevation' }, { id: 'axo', label: '立体 3D' }]} />
        <span className="ml-auto text-[10px]" style={{ color: T.inkSoft }}>仅示意 Illustrative</span>
      </div>
      {editing ? <div className="flex-1 min-h-0">{children}</div> : (
      <div className="flex-1 min-h-0 flex items-center justify-center p-2" style={{ background: '#fff' }}>
        {scene && <SvgShapes scene={scene} style={{ width: '100%', height: '100%' }} title={cab.code} />}
      </div>
      )}
      {mode === 'axo' && (
        <div className="flex items-center gap-3 px-3 py-2">
          <span className="text-[10px] uppercase tracking-widest shrink-0" style={{ color: T.inkSoft }}>Turn 转</span>
          <input type="range" min={-45} max={45} step={5} value={yaw} onChange={(e) => onYaw(Number(e.target.value))}
            className="flex-1" style={{ accentColor: T.wood }} />
          <button type="button" onClick={() => onYaw(-30)} className="p-1" title="Reset 还原" style={{ color: T.inkSoft }}><RotateCcw size={14} /></button>
        </div>
      )}
    </div>
  );
}

export default function CabinetEditor({ cab: initial, zone, defaults = {}, lang = 'both', isNew, totalWith, onSave, onDelete, onClose }) {
  const [cab, setCab] = useState(initial);
  const t = templateOf(cab.template);
  const spec = cab.spec;
  const ceilingH = zone?.ceilingH > 0 ? zone.ceilingH : null; // 没填楼高 → null（模板按 2.70 m）
  const isKitchen = cab.template === 'kitchen';
  const set = (p) => setCab((c) => ({ ...c, ...p }));
  const isBlank = cab.template === 'blank';
  // 画框框模式 / 模板设定模式（空白柜子、手画过的柜子一打开就是画框框）
  const [editMode, setEditMode] = useState(() => (initial.template === 'blank' || initial.custom ? 'blocks' : 'template'));
  const [view, setView] = useState('elev');
  const ed = useBlockEditor({ cab, setCab, kitchen: isKitchen });
  useBlockKeys(ed, editMode === 'blocks' && view === 'elev');
  const confirm = useConfirm();
  // 画过框框后又改模板设定 → 先问；确定才重算柜子（清掉 custom），取消什么都不变（MeterInput 自动跳回原值）
  //   空白柜子没有「模板原样」：改尺寸照比例缩放，不问、不还原
  const guarded = async (fn) => {
    if (cab.custom && !isBlank) {
      const ok = await confirm({ title: 'Back to template? 还原成模板？', message: 'This will reset the hand-drawn blocks to the template. 会把手画的框框还原成模板，确定吗？',
        danger: true, confirmText: 'Reset 还原', cancelText: 'Cancel 取消' });
      if (!ok) return;
    }
    ed.resetHistory();
    setCab((c) => { const n = fn(c); if (isBlank) return n; const { custom, ...rest } = n; return rest; });
  };
  const setSpec = (p) => guarded((c) => updateSpec(c, p));
  const setUnitG = (i, p) => guarded((c) => setUnit(c, i, p));
  const restoreTemplate = async () => {
    const ok = await confirm({ title: 'Back to template? 还原成模板？', message: 'This will reset the hand-drawn blocks to the template. 会把手画的框框还原成模板，确定吗？',
      danger: true, confirmText: 'Reset 还原', cancelText: 'Cancel 取消' });
    if (!ok) return;
    ed.restoreTemplate((c) => { const { custom, ...rest } = updateSpec(c, {}); return rest; });
  };
  const ownSeries = useMemo(() => customSeriesCount(cab), [cab]);
  const ser = resolveSeries(cab, defaults);
  const total = useMemo(() => cabinetTotal(cab, defaults), [cab, defaults]);
  const grand = useMemo(() => (totalWith ? totalWith(cab) : total), [cab, totalWith, total]);
  const rows = useMemo(() => explainCabinet(cab, defaults), [cab, defaults]);
  const warnings = useMemo(() => validateCabinet(cab, { ceilingH }), [cab, ceilingH]);
  const leaves = useMemo(() => (cab.frames || []).flatMap((f) => layoutLeaves(f.body, 0, 0, f.W, bodyHeight(f))), [cab]);
  const hasGlass = leaves.some((l) => l.node.type === 'glass');
  const hasOpen = leaves.some((l) => l.node.type === 'open');
  const compare = useMemo(() => ['A', 'B', 'C'].map((L) => ({ L, total: cabinetTotal({ ...cab, series: { door: L, carcass: L, open: 'door' } }, defaults) })), [cab, defaults]);
  const columnWidths = cab.frames?.[0]?.body?.split === 'v' ? cab.frames[0].body.sizes : [spec.W || 0];
  const blocks = editMode === 'blocks';

  const title = `${cab.code} · ${t.zh} ${t.en}`;
  const modeBar = (
    <div className="flex items-center gap-2 px-3 sm:px-5 py-1.5" style={{ borderBottom: `1px solid ${T.lineSoft}`, background: T.cream }} data-edit-mode>
      <Segmented size="sm" value={editMode} onChange={(m) => { setEditMode(m); setView('elev'); if (m !== 'blocks') ed.ops.select(null); }}
        options={[{ id: 'template', label: <span className="inline-flex items-center gap-1"><LayoutTemplate size={13} /> 模板设定 Template</span> },
          { id: 'blocks', label: <span className="inline-flex items-center gap-1"><SquareDashedMousePointer size={13} /> 画框框 Blocks</span> }]} />
    </div>
  );

  // 关闭（X / 手机返回键）：改过还没保存 → 先问，免得辛苦设计的柜子一下子没了
  const asking = useRef(false);
  const closeAsk = async () => {
    if (JSON.stringify(cab) === JSON.stringify(initial)) { onClose(); return; }
    if (asking.current) return;
    asking.current = true;
    const ok = await confirm({ title: 'Unsaved changes 还没保存', message: `Close without saving ${cab.code}? 不保存就关闭？刚才的修改会不见。`,
      danger: true, confirmText: 'Discard 不保存', cancelText: 'Keep editing 继续编辑' });
    asking.current = false;
    if (ok) onClose();
  };
  useBackClose(closeAsk);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col no-print font-body" style={{ background: T.paper, color: T.ink }}>
      {/* 顶栏 */}
      <div className="flex items-center gap-2 px-3 sm:px-5 py-2.5" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
        <button onClick={closeAsk} className="p-2 -ml-2" title="Close 关闭" style={{ color: T.inkSoft }}><X size={18} /></button>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg sm:text-xl truncate">{title}</div>
          <input value={cab.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder={`Name 名称（例：主卧衣柜）`}
            className="w-full bg-transparent outline-none text-xs" style={{ color: T.inkSoft }} />
        </div>
        {!isNew && onDelete && (
          <button onClick={onDelete} className="p-2" title="Delete 删除" style={{ color: T.terra }}><Trash2 size={16} /></button>
        )}
      </div>

      {modeBar}

      {/* 主体：手机上图下设定；电脑左图右设定 */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className={`shrink-0 lg:flex-1 ${blocks ? 'h-[55vh]' : 'h-[40vh]'} lg:h-auto`} style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
          <Preview cab={cab} lang={lang} mode={view} setMode={setView} onYaw={(yaw) => set({ view: { ...(cab.view || {}), yaw } })}>
            {blocks ? <BlockCanvas ed={ed} lang={lang} canRestore={!isBlank && !!cab.custom} onRestore={restoreTemplate} /> : null}
          </Preview>
        </div>
        <div className="flex-1 lg:flex-none lg:w-[440px] min-h-0 overflow-y-auto px-4 sm:px-5 pb-8 scrollbar-thin" style={{ borderLeft: `1px solid ${T.lineSoft}` }}>

          {blocks && <BlockPanel ed={ed} defaults={defaults} />}

          {!blocks && cab.custom && !isBlank && (
            <div className="mt-3 p-2.5 text-xs flex items-start gap-1.5" data-custom-banner style={{ background: T.sand, border: `1px solid ${T.line}`, borderRadius: 2, color: T.ink }}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: T.terra }} />
              <span>这个柜子的框框是手画的，改下面的设定会还原成模板 The blocks were drawn by hand — changing these settings resets them to the template</span>
            </div>
          )}

          {!blocks && <>
          {isKitchen && <KitchenSettings cab={cab} setSpec={setSpec} />}
          {cab.template === 'tv' && <TvSettings cab={cab} setSpec={setSpec} ceilingH={ceilingH} />}
          {cab.template === 'shoe' && <ShoeSettings cab={cab} setSpec={setSpec} ceilingH={ceilingH} />}
          {cab.template === 'wardrobe' && (
          <>
          <Section title="Size 尺寸" hint={ceilingH ? `Room ceiling 房间楼高 ${mmToM(ceilingH)} m` : 'Room ceiling not set — using 2.70 m 楼高没填，先按 2.70 m'}>
            <div className="grid grid-cols-3 gap-2">
              <MeterInput label="Width 总宽" mm={spec.W} onChange={(W) => setSpec({ W })} hint="可打 2.4+1.2" />
              <MeterInput label="Height 高" mm={spec.H} onChange={(H) => setSpec({ H })} />
              <MeterInput label="Depth 深" mm={spec.D} onChange={(D) => setSpec({ D })} />
            </div>
            {ceilingH && spec.H !== ceilingH && cab.template === 'wardrobe' && (
              <button type="button" onClick={() => setSpec({ H: ceilingH })} className="mt-2 text-xs underline" style={{ color: T.wood }}>
                To the ceiling 做到顶（{mmToM(ceilingH)} m）
              </button>
            )}
          </Section>

          <Section title="Base 底座">
            <Segmented value={spec.base.kind} onChange={(kind) => setSpec({ base: { kind } })}
              options={[{ id: 'plinth', label: '踢脚 Plinth', sub: '100' }, { id: 'legs', label: '柜脚 Legs', sub: '120' }, { id: 'wallhung', label: '悬挂 Wall-hung' }]} />
          </Section>

          {cab.template === 'wardrobe' && (
            <Section title="Top box 顶柜">
              <div className="flex items-center gap-4 flex-wrap">
                <Toggle on={!!spec.top} onChange={(top) => setSpec({ top })} label={spec.top ? '分上下 Top + bottom' : '一扇到顶 Full height'} />
                {spec.top && (
                  <div className="w-28"><MeterInput label="Top 顶柜高" mm={spec.topH} onChange={(topH) => setSpec({ topH })} /></div>
                )}
              </div>
            </Section>
          )}

          <Section title="Doors 门数" hint="Each door ≤ 600 mm, split evenly 每扇最宽 600，自动平分"
            right={spec.doorsAuto === false && <button type="button" className="text-xs underline" style={{ color: T.wood }} onClick={() => setSpec({ doorsAuto: true })}>Auto 自动</button>}>
            <div className="flex items-center gap-3">
              <Stepper value={spec.doors} min={1} max={30} onChange={(doors) => setSpec({ doorsAuto: false, doors })} suffix="扇" />
              <span className="text-sm" style={{ color: T.inkSoft }}>≈ {Math.round(spec.W / spec.doors)} mm / 扇</span>
            </div>
          </Section>

          {t.units && (
            <Section title="Sections 每格单元" right={
              <select onChange={(e) => { if (e.target.value) setSpec({ units: spec.units.map((u) => ({ ...u, layout: e.target.value })) }); e.target.value = ''; }}
                defaultValue="" className="text-xs px-1 py-1 outline-none" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2, color: T.inkSoft }}>
                <option value="">All 全部改成…</option>
                {t.units.map((u) => <option key={u.id} value={u.id}>{u.zh} {u.en}</option>)}
              </select>}>
              <div className="grid grid-cols-2 gap-2">
                {spec.units.map((u, i) => (
                  <label key={i} className="block p-2" style={{ background: T.cream, border: `1px solid ${T.lineSoft}`, borderRadius: 2 }}>
                    <span className="block text-[10px]" style={{ color: T.inkSoft }}>#{i + 1} · {Math.round(columnWidths[i] || 0)} mm</span>
                    <select value={u.layout} onChange={(e) => setUnitG(i, { layout: e.target.value })}
                      className="w-full mt-1 py-1.5 text-sm outline-none bg-transparent" style={{ color: T.ink }}>
                      {t.units.map((o) => <option key={o.id} value={o.id}>{o.zh} {o.en}</option>)}
                    </select>
                    {u.layout === 'drawersHang' && (
                      <span className="flex items-center gap-2 mt-1 text-[11px]" style={{ color: T.inkSoft }}>
                        <select value={u.drawers || 3} onChange={(e) => setUnitG(i, { drawers: Number(e.target.value) })} className="bg-transparent outline-none">
                          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} 抽</option>)}
                        </select>
                        <select value={u.drawerKind || 'half'} onChange={(e) => setUnitG(i, { drawerKind: e.target.value })} className="bg-transparent outline-none">
                          <option value="half">半展 Half</option>
                          <option value="full">全展 Full</option>
                        </select>
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </Section>
          )}

          </>
          )}
          </>}

          <Section title="Series 系列" hint={cab.series ? 'Set for this cabinet 这个柜子单独设定' : 'Using the quote default 用整份报价的默认系列'}
            right={cab.series && <button type="button" className="text-xs underline" style={{ color: T.wood }} onClick={() => set({ series: null })}>Use default 用默认</button>}>
            <div className="text-[10px] mb-1" style={{ color: T.inkSoft }}>Door 门板（RM / L.m 或 ㎡）</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {DOOR_SERIES.map((L) => {
                const on = ser.door === L;
                return (
                  <button key={L} type="button" onClick={() => set({ series: { ...(cab.series || {}), door: L, carcass: (cab.series?.carcass) || ser.carcass } })}
                    className="px-2.5 py-1.5 text-xs" style={{ borderRadius: 2, background: on ? T.ink : T.paper, color: on ? T.paper : T.ink, border: `1px solid ${on ? T.ink : T.line}` }}>
                    {L}<span className="block text-[9px] opacity-75">{cnyToMyr(seriesById(L).door)}</span>
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] mb-1" style={{ color: T.inkSoft }}>Carcass 柜体</div>
            <div className="flex flex-wrap gap-1.5">
              {CARCASS_SERIES.map((L) => {
                const on = ser.carcass === L;
                return (
                  <button key={L} type="button" onClick={() => set({ series: { ...(cab.series || {}), door: (cab.series?.door) || ser.door, carcass: L } })}
                    className="px-2.5 py-1.5 text-xs" style={{ borderRadius: 2, background: on ? T.ink : T.paper, color: on ? T.paper : T.ink, border: `1px solid ${on ? T.ink : T.line}` }}>
                    {L}<span className="block text-[9px] opacity-75">{cnyToMyr(seriesById(L).carcass)}</span>
                  </button>
                );
              })}
            </div>
            {hasOpen && <div className="mt-2"><Tip>Open shelves follow the door series ({ser.open}) 开放格跟门板系列（{ser.open}）</Tip></div>}
          </Section>

          <Section title="Compare 一键比价" hint="Same cabinet in series A / B / C 同一个柜子换系列">
            <div className="grid grid-cols-3 gap-2">
              {compare.map(({ L, total: v }) => {
                const on = ser.door === L && ser.carcass === L;
                return (
                  <button key={L} type="button" onClick={() => set({ series: { door: L, carcass: L, open: 'door' } })}
                    className="p-2 text-left" style={{ borderRadius: 2, background: on ? T.sand : T.cream, border: `1px solid ${on ? T.wood : T.lineSoft}` }}>
                    <div className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>Series {L}</div>
                    <div className="font-display text-lg" style={{ color: T.ink }}>{fmtMYR(v)}</div>
                  </button>
                );
              })}
            </div>
            {ownSeries > 0 && <div className="mt-2"><Tip>{ownSeries} block{ownSeries > 1 ? 's have' : ' has'} its own series and won't change 有 {ownSeries} 格单独选了系列，不跟着换</Tip></div>}
          </Section>

          <Section title="Side panels 见光板" hint={isKitchen ? 'Exposed ends of the run get a finished panel 整排两端露出的侧边加见光板' : 'Sides that are exposed get a finished panel 柜子露出来的侧边加见光板'}>
            <div className="flex gap-6">
              <Toggle on={cab.exposed?.left !== false} onChange={(v) => set({ exposed: { ...(cab.exposed || {}), left: v } })} label="Left 左边露出" />
              <Toggle on={cab.exposed?.right !== false} onChange={(v) => set({ exposed: { ...(cab.exposed || {}), right: v } })} label="Right 右边露出" />
            </div>
          </Section>

          {hasGlass && (
            <Section title="Glass door 玻璃门系数" hint="From the craft coefficient table 用旧工具的特殊工艺系数表">
              <select value={String(cab.glassCoef ?? DEFAULT_GLASS_COEF)} onChange={(e) => set({ glassCoef: Number(e.target.value) })}
                className="w-full px-2 py-2 text-sm outline-none" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2, color: T.ink }}>
                {[...new Map(CRAFT_COEF.map((c) => [c.coef, c])).values()].map((c) => (
                  <option key={c.name} value={String(c.coef)}>× {c.coef} — {CRAFT_COEF.filter((x) => x.coef === c.coef).map((x) => x.name).join(' / ')}</option>
                ))}
              </select>
            </Section>
          )}

          <Section title="Colours 颜色（仅示意，不影响价钱）">
            {[['door', '门 Door', DEFAULT_DOOR_FINISH], ['carcass', '柜身 Carcass', DEFAULT_CARCASS_FINISH]].map(([k, label, def]) => (
              <div key={k} className="flex items-center gap-2 mb-2">
                <span className="text-[11px] w-20 shrink-0" style={{ color: T.inkSoft }}>{label}</span>
                <div className="flex flex-wrap gap-1.5">
                  {FINISHES.map((f) => {
                    const on = (cab.finish?.[k] || def) === f.id;
                    return (
                      <button key={f.id} type="button" title={`${f.zh} ${f.en}`} onClick={() => set({ finish: { ...(cab.finish || {}), [k]: f.id } })}
                        className="w-8 h-8" style={{ background: f.hex, borderRadius: 2, border: `2px solid ${on ? T.ink : T.lineSoft}`, outline: on ? `1px solid ${T.paper}` : 'none', outlineOffset: -3 }} />
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="text-[11px] w-20 shrink-0" style={{ color: T.inkSoft }}>把手 Handle</span>
              <Segmented size="sm" value={cab.handle || 'hidden'} onChange={(handle) => set({ handle })}
                options={HANDLES.map((h) => ({ id: h.id, label: h.zh }))} />
            </div>
          </Section>

          {warnings.length > 0 && (
            <Section title="Check 提醒">
              <div className="space-y-1">
                {warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs" style={{ color: w.level === 'warn' ? T.terra : T.inkSoft }}>
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {tx(w.msg, lang)}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Collapse title="How it's priced 怎么算的">
            <table className="w-full text-xs">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                    <td className="py-1 pr-2" style={{ color: T.inkSoft }}>{r.part.zh}</td>
                    <td className="py-1 pr-2">{r.text.zh}</td>
                    <td className="py-1 pr-2 whitespace-nowrap" style={{ color: T.inkSoft }}>{r.calc}</td>
                    <td className="py-1 text-right whitespace-nowrap">{fmtMYR(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 space-y-0.5 text-[11px]" style={{ color: T.inkSoft }}>
              <div>· 高度 &lt; 1 m 按延米（只算长度）；≥ 1 m 按平米（长 × 高）—— 和旧报价工具一样</div>
              <div>· 开放格按开放柜投影价（宽 × 高）；玻璃门 = 门板 × 系数 + 柜体；抽屉另加 Blum 套数</div>
              <div>· 踢脚 / 柜脚按总高算；电器空位不计价；露出的侧边加见光板</div>
            </div>
          </Collapse>
        </div>
      </div>

      {/* 底部常驻价钱条 */}
      <div className="shrink-0 flex items-center gap-3 px-4 sm:px-5 py-3" style={{ background: T.ink, color: T.paper, paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest opacity-70 whitespace-nowrap"><span className="hidden sm:inline">This cabinet </span>这个柜子</div>
          <div className="font-display text-2xl leading-tight whitespace-nowrap">{fmtMYR(total)}</div>
        </div>
        <div className="min-w-0 pl-3" style={{ borderLeft: '1px solid rgba(255,255,255,0.2)' }}>
          <div className="text-[10px] uppercase tracking-widest opacity-70 whitespace-nowrap"><span className="hidden sm:inline">Whole quote </span>全部</div>
          <div className="font-display text-lg leading-tight opacity-90 whitespace-nowrap">{fmtMYR(grand)}</div>
        </div>
        <button onClick={() => onSave(cab)} className="ml-auto flex items-center gap-1.5 px-4 py-2.5 text-sm whitespace-nowrap"
          style={{ background: T.gold, color: '#fff', borderRadius: 2 }}>
          <Check size={16} /> {isNew ? 'Add 加入报价' : 'Done 完成'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
