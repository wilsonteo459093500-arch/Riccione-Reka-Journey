// 电视柜 / 鞋柜 设定
import { T } from '../../theme.js';
import { TV_LOW_UNITS, TV_SIDE_KINDS, TV_UPPER_UNITS, SHOE_STYLES, SHOE_UNITS, tvRun } from '../../planner/tvshoe.js';
import { Section, Segmented, Toggle, MeterInput, Collapse } from './bits.jsx';

function UnitGrid({ units, options, onSet, widths, cols = 3 }) {
  return (
    <div className={`grid gap-1.5 ${cols === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {units.map((u, i) => (
        <label key={i} className="block px-2 py-1.5" style={{ background: T.cream, border: `1px solid ${T.lineSoft}`, borderRadius: 2 }}>
          <span className="block text-[10px]" style={{ color: T.inkSoft }}>#{i + 1}{widths ? ` · ${Math.round(widths[i] || 0)}` : ''}</span>
          <select value={u.layout} onChange={(e) => onSet(i, { layout: e.target.value })} className="w-full text-xs py-0.5 outline-none bg-transparent" style={{ color: T.ink }}>
            {options.map((o) => <option key={o.id} value={o.id}>{o.zh} {o.en}</option>)}
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

export function TvSettings({ cab, setSpec, ceilingH }) {
  const s = cab.spec;
  const run = tvRun(s);
  const setArr = (key) => (i, p) => setSpec({ [key]: s[key].map((u, j) => (j === i ? { ...u, ...p } : u)) });
  return (
    <>
      <Section title="Size 尺寸" hint="Total width of the TV wall 整面电视墙的总宽">
        <div className="grid grid-cols-3 gap-2">
          <MeterInput label="Total width 总宽" mm={s.W} onChange={(W) => setSpec({ W })} />
          <MeterInput label="Low height 低柜高" mm={s.lowH} onChange={(lowH) => setSpec({ lowH })} />
          <MeterInput label="Low depth 低柜深" mm={s.lowD} onChange={(lowD) => setSpec({ lowD })} />
        </div>
      </Section>
      <Section title="Low cabinet 低柜">
        <Segmented value={s.lowKind} onChange={(lowKind) => setSpec({ lowKind })}
          options={[{ id: 'floating', label: '悬空 Floating' }, { id: 'floor', label: '落地 On floor' }]} />
        {s.lowKind === 'floating' && <div className="w-36 mt-2"><MeterInput label="From floor 离地" mm={s.lowY} onChange={(lowY) => setSpec({ lowY })} /></div>}
        <div className="text-[10px] mt-3 mb-1" style={{ color: T.inkSoft }}>{run.runW} mm · 每格</div>
        <UnitGrid units={s.lowUnits} options={TV_LOW_UNITS} onSet={setArr('lowUnits')} widths={widthsOf(cab, '-low')} />
      </Section>
      <Section title="Side tall cabinets 两侧高柜 / 展示柜">
        <Toggle on={!!s.sides.on} onChange={(on) => setSpec({ sides: { ...s.sides, on, H: on && ceilingH && !s.sides.on ? ceilingH : s.sides.H } })} label={s.sides.on ? 'Yes 有' : 'No 没有'} />
        {s.sides.on && (
          <div className="space-y-2 mt-2">
            <Segmented size="sm" value={s.sides.which} onChange={(which) => setSpec({ sides: { ...s.sides, which } })}
              options={[{ id: 'both', label: '两侧 Both' }, { id: 'left', label: '左 Left' }, { id: 'right', label: '右 Right' }]} />
            <Segmented size="sm" value={s.sides.kind} onChange={(kind) => setSpec({ sides: { ...s.sides, kind } })}
              options={TV_SIDE_KINDS.map((k) => ({ id: k.id, label: k.zh }))} />
            <div className="grid grid-cols-3 gap-2">
              <MeterInput label="Width 宽" mm={s.sides.W} onChange={(W) => setSpec({ sides: { ...s.sides, W } })} />
              <MeterInput label="Height 高" mm={s.sides.H} onChange={(H) => setSpec({ sides: { ...s.sides, H } })} />
              <MeterInput label="Depth 深" mm={s.sides.D} onChange={(D) => setSpec({ sides: { ...s.sides, D } })} />
            </div>
          </div>
        )}
      </Section>
      <Section title="Top cabinet above TV 电视上方吊柜">
        <Toggle on={!!s.upper.on} onChange={(on) => setSpec({ upper: { ...s.upper, on } })} label={s.upper.on ? 'Yes 有' : 'No 没有'} />
        {s.upper.on && (
          <div className="space-y-2 mt-2">
            <div className="grid grid-cols-3 gap-2">
              <MeterInput label="Height 高" mm={s.upper.H} onChange={(H) => setSpec({ upper: { ...s.upper, H } })} />
              <MeterInput label="From floor 离地" mm={s.upper.y} onChange={(y) => setSpec({ upper: { ...s.upper, y } })} />
              <MeterInput label="Depth 深" mm={s.upper.D} onChange={(D) => setSpec({ upper: { ...s.upper, D } })} />
            </div>
            <UnitGrid units={s.upperUnits} options={TV_UPPER_UNITS} onSet={setArr('upperUnits')} widths={widthsOf(cab, '-upper')} />
          </div>
        )}
      </Section>
    </>
  );
}

export function ShoeSettings({ cab, setSpec, ceilingH }) {
  const s = cab.spec;
  const setUnit = (i, p) => setSpec({ units: s.units.map((u, j) => (j === i ? { ...u, ...p } : u)) });
  const tallish = s.style === 'niche' || s.style === 'full';
  return (
    <>
      <Section title="Style 款式">
        <Segmented size="sm" value={s.style} onChange={(style) => setSpec({ style })}
          options={SHOE_STYLES.map((x) => ({ id: x.id, label: x.zh }))} />
      </Section>
      <Section title="Size 尺寸" hint={tallish && ceilingH ? `Room ceiling 楼高 ${(ceilingH / 1000).toFixed(2)} m` : undefined}>
        <div className="grid grid-cols-3 gap-2">
          <MeterInput label="Width 总宽" mm={s.W} onChange={(W) => setSpec({ W })} />
          {tallish && <MeterInput label="Height 高" mm={s.H} onChange={(H) => setSpec({ H })} />}
          {s.style === 'low' && <MeterInput label="Height 高" mm={s.lowH} onChange={(lowH) => setSpec({ lowH })} />}
          {s.style === 'bench' && <MeterInput label="Seat 凳高" mm={s.benchH} onChange={(benchH) => setSpec({ benchH })} />}
          <MeterInput label="Depth 深" mm={s.D} onChange={(D) => setSpec({ D })} />
        </div>
        {tallish && ceilingH && s.H !== ceilingH && (
          <button type="button" onClick={() => setSpec({ H: ceilingH })} className="mt-2 text-xs underline" style={{ color: T.wood }}>To the ceiling 做到顶</button>
        )}
      </Section>
      {s.style !== 'bench' && (
        <Section title="Raised bottom 底层架空（放常穿的鞋）">
          <div className="flex items-center gap-4">
            <Toggle on={!!s.raised} onChange={(raised) => setSpec({ raised })} label={s.raised ? 'Yes 有' : 'No 没有'} />
            {s.raised && <div className="w-28"><MeterInput label="Gap 架空高" mm={s.raisedH} onChange={(raisedH) => setSpec({ raisedH })} /></div>}
          </div>
        </Section>
      )}
      {s.style === 'niche' && (
        <Section title="Open niche 中间开放台面">
          <div className="grid grid-cols-2 gap-2">
            <MeterInput label="Lower cabinet 下柜高（含底）" mm={s.lowerH} onChange={(lowerH) => setSpec({ lowerH })} />
            <MeterInput label="Niche 中空高" mm={s.nicheH} onChange={(nicheH) => setSpec({ nicheH })} />
          </div>
        </Section>
      )}
      <Section title="Sections 每格" hint="Each door ≤ 600 mm 每扇最宽 600">
        <UnitGrid units={s.units} options={SHOE_UNITS} onSet={setUnit} widths={widthsOf(cab, '-f0')} />
      </Section>
    </>
  );
}
