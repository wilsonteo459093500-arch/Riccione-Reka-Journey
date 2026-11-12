// 岛台 设定：尺寸 · 底座 · 背面（见光板 / 两面都是柜）· 每格单元 · 台面（仅示意）
import { T } from '../../theme.js';
import { ISLAND_UNITS, ISLAND_BACKS } from '../../planner/island.js';
import { Section, Segmented, Toggle, MeterInput, Tip } from './bits.jsx';
import { mmToM } from '../../planner/model.js';

function Units({ units, widths, onSet }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {units.map((u, i) => (
        <label key={i} className="block px-2 py-1.5" style={{ background: T.cream, border: `1px solid ${T.lineSoft}`, borderRadius: 2 }}>
          <span className="block text-[10px]" style={{ color: T.inkSoft }}>#{i + 1}{widths?.[i] ? ` · ${Math.round(widths[i])}` : ''}</span>
          <select value={u.layout} onChange={(e) => onSet(i, { layout: e.target.value })} className="w-full text-xs py-0.5 outline-none bg-transparent" style={{ color: T.ink }}>
            {ISLAND_UNITS.map((o) => <option key={o.id} value={o.id}>{o.zh} {o.en}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}
const widthsOf = (cab, idPart) => {
  const f = (cab.frames || []).find((x) => x.id.endsWith(idPart));
  return f?.body?.split === 'v' ? f.body.sizes : f ? [f.W] : [];
};

export default function IslandSettings({ cab, setSpec }) {
  const s = cab.spec;
  const setArr = (key) => (i, p) => setSpec({ [key]: s[key].map((u, j) => (j === i ? { ...u, ...p } : u)) });
  return (
    <div data-island-settings>
      <Section title="Size 尺寸" hint="Both ends always get a finished panel 两头一律见光板">
        <div className="grid grid-cols-3 gap-2">
          <MeterInput label="Length 长" mm={s.W} onChange={(W) => setSpec({ W })} />
          <MeterInput label="Height 高" mm={s.H} onChange={(H) => setSpec({ H })} />
          <MeterInput label="Depth 深（一排）" mm={s.D} onChange={(D) => setSpec({ D })} />
        </div>
      </Section>
      <Section title="Base 底座">
        <Segmented size="sm" value={s.base.kind} onChange={(kind) => setSpec({ base: { kind } })}
          options={[{ id: 'plinth', label: '踢脚 Plinth' }, { id: 'legs', label: '柜脚 Legs' }, { id: 'none', label: '无 None' }]} />
      </Section>
      <Section title="Back 背面" hint={s.back === 'panel' ? `Finished panel, width × height 见光板按宽 × 高（${mmToM(s.W)} × ${mmToM(s.H)} m）` : `Second row back to back 背靠背第二排 · total depth 总深 ${mmToM(s.D * 2)} m`}>
        <div data-island-back><Segmented size="sm" value={s.back} onChange={(back) => setSpec({ back })} options={ISLAND_BACKS.map((x) => ({ id: x.id, label: `${x.zh} ${x.en}` }))} /></div>
      </Section>
      <Section title={s.back === 'cabinets' ? 'Front row 正面每格' : 'Sections 每格'}>
        <Units units={s.units} widths={widthsOf(cab, '-front')} onSet={setArr('units')} />
      </Section>
      {s.back === 'cabinets' && (
        <Section title="Back row 背面每格">
          <Units units={s.backUnits} widths={widthsOf(cab, '-back')} onSet={setArr('backUnits')} />
        </Section>
      )}
      <Section title="Worktop 台面">
        <Toggle on={!!s.worktop} onChange={(worktop) => setSpec({ worktop })} label="Show worktop 显示台面（仅示意，台面价钱另外手动加）" />
        <div className="mt-1"><Tip>Worktop is not priced (same as the kitchen) 台面不计价（同厨房）</Tip></div>
      </Section>
    </div>
  );
}
