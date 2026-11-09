// 厨房设定：形状 → 每面墙长度（量到墙角）→ 吊柜要不要 → 每格单元 → 电器高柜
import { T } from '../../theme.js';
import { KITCHEN_SHAPES, KITCHEN_BASE_UNITS, KITCHEN_UPPER_UNITS, TALL_KINDS, wallRuns } from '../../planner/kitchen.js';
import { Section, Segmented, Toggle, MeterInput, Collapse, Tip } from './bits.jsx';

const LETTER = ['A', 'B', 'C'];
const WALL_NAME = {
  I: ['墙A Wall'],
  L: ['墙A 后墙 Back', '墙B 侧墙 Side'],
  U: ['墙A 后墙 Back', '墙B 右墙 Right', '墙C 左墙 Left'],
  galley: ['墙A 这排 Run 1', '墙B 对面 Run 2'],
};
const END_LABEL = {
  I: [['start', '左端 Left'], ['end', '右端 Right']],
  galley: [['start', '左端 Left'], ['end', '右端 Right']],
  L: [['start', '墙A 左端'], ['end', '墙B 尽头']],
  U: [['start', '墙C 尽头'], ['end', '墙B 尽头']],
};

function UnitGrid({ units, options, onSet, widths }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {units.map((u, i) => (
        <label key={i} className="block px-2 py-1.5" style={{ background: T.cream, border: `1px solid ${T.lineSoft}`, borderRadius: 2 }}>
          <span className="block text-[10px]" style={{ color: T.inkSoft }}>#{i + 1}{widths ? ` · ${Math.round(widths[i] || 0)}` : ''}</span>
          <select value={u.layout} onChange={(e) => onSet(i, { layout: e.target.value })} className="w-full text-xs py-0.5 outline-none bg-transparent" style={{ color: T.ink }}>
            {options.map((o) => <option key={o.id} value={o.id}>{o.zh}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

export default function KitchenSettings({ cab, setSpec }) {
  const spec = cab.spec;
  const runs = wallRuns(spec);
  const setWall = (i, p) => setSpec({ walls: spec.walls.map((w, j) => (j === i ? { ...w, ...p } : w)) });
  const setWallUnit = (i, key) => (k, p) => setWall(i, { [key]: spec.walls[i][key].map((u, j) => (j === k ? { ...u, ...p } : u)) });
  const frameOf = (i, kind) => (cab.frames || []).find((f) => f.wall === i && f.kind === kind);
  const colWidths = (f) => (f?.body?.split === 'v' ? f.body.sizes : f ? [f.W] : []);

  return (
    <>
      <Section title="Shape 形状">
        <Segmented value={spec.shape} onChange={(shape) => setSpec({ shape })}
          options={KITCHEN_SHAPES.map((s) => ({ id: s.id, label: `${s.zh}`, sub: s.en }))} />
        {(spec.shape === 'L' || spec.shape === 'U') && (
          <div className="mt-2"><Tip>Measure each wall to the corner — the corner is counted on both walls 每面墙各量到墙角（转角两面都算，同旧工具）</Tip></div>
        )}
      </Section>

      {spec.walls.map((w, i) => (
        <Section key={i} title={`${(WALL_NAME[spec.shape] || WALL_NAME.I)[i]}`}>
          <div className="grid grid-cols-2 gap-2 items-end">
            <MeterInput label={spec.shape === 'L' || spec.shape === 'U' ? 'Length to corner 长度（量到墙角）' : 'Length 长度'} mm={w.len} onChange={(len) => setWall(i, { len })} hint="可打 2.4+0.6" />
            <Toggle on={w.upper !== false} onChange={(upper) => setWall(i, { upper })} label="Top cabinets 吊柜" />
          </div>
          <div className="text-[10px] mt-3 mb-1" style={{ color: T.inkSoft }}>Base 地柜 · {runs[i].runW} mm{runs[i].cornerW ? `（转角 ${runs[i].cornerW} 照算）` : ''}</div>
          <UnitGrid units={w.units} options={KITCHEN_BASE_UNITS} onSet={setWallUnit(i, 'units')} widths={colWidths(frameOf(i, 'base'))} />
          {w.upper !== false && (
            <>
              <div className="text-[10px] mt-3 mb-1" style={{ color: T.inkSoft }}>Top 吊柜</div>
              <UnitGrid units={w.upperUnits} options={KITCHEN_UPPER_UNITS} onSet={setWallUnit(i, 'upperUnits')} widths={colWidths(frameOf(i, 'wall'))} />
            </>
          )}
        </Section>
      ))}

      {spec.shape === 'galley' && (
        <Section title="Aisle 走道">
          <div className="w-40"><MeterInput label="Aisle 走道宽" mm={spec.aisle} onChange={(aisle) => setSpec({ aisle })} hint="建议 1.0–1.2 m" /></div>
        </Section>
      )}

      <Section title="Tall cabinet 电器高柜（冰箱 / 烤箱）">
        <Toggle on={!!spec.tall?.on} onChange={(on) => setSpec({ tall: { ...spec.tall, on } })} label={spec.tall?.on ? 'Yes 有' : 'No 没有'} />
        {spec.tall?.on && (
          <div className="space-y-2 mt-2">
            <Segmented size="sm" value={spec.tall.end} onChange={(end) => setSpec({ tall: { ...spec.tall, end } })}
              options={(END_LABEL[spec.shape] || END_LABEL.I).map(([id, label]) => ({ id, label }))} />
            <Segmented size="sm" value={spec.tall.kind} onChange={(kind) => setSpec({ tall: { ...spec.tall, kind } })}
              options={TALL_KINDS.map((k) => ({ id: k.id, label: k.zh }))} />
            <div className="grid grid-cols-2 gap-2">
              <MeterInput label="Width 宽" mm={spec.tall.W} onChange={(W) => setSpec({ tall: { ...spec.tall, W } })} />
              <MeterInput label="Height 高" mm={spec.tall.H} onChange={(H) => setSpec({ tall: { ...spec.tall, H } })} />
            </div>
            {spec.tall.kind === 'fridgeTop' && (
              <div className="w-40"><MeterInput label="Fridge space 冰箱位高" mm={spec.tall.fridgeH} onChange={(fridgeH) => setSpec({ tall: { ...spec.tall, fridgeH } })} /></div>
            )}
          </div>
        )}
      </Section>

      <Collapse title="Sizes 尺寸细节（一般不用改）">
        <div className="grid grid-cols-3 gap-2">
          <MeterInput label="Base H 地柜高" mm={spec.baseH} onChange={(baseH) => setSpec({ baseH })} />
          <MeterInput label="Base D 地柜深" mm={spec.baseD} onChange={(baseD) => setSpec({ baseD })} />
          <div />
          <MeterInput label="Top H 吊柜高" mm={spec.upperH} onChange={(upperH) => setSpec({ upperH })} />
          <MeterInput label="Top from floor 吊柜离地" mm={spec.upperY} onChange={(upperY) => setSpec({ upperY })} />
          <MeterInput label="Top D 吊柜深" mm={spec.upperD} onChange={(upperD) => setSpec({ upperD })} />
        </div>
        <div className="mt-2">
          <Segmented size="sm" value={spec.base.kind} onChange={(kind) => setSpec({ base: { kind } })}
            options={[{ id: 'plinth', label: '踢脚 Plinth' }, { id: 'legs', label: '柜脚 Legs' }]} />
        </div>
        <div className="mt-2"><Toggle on={!!spec.worktop} onChange={(worktop) => setSpec({ worktop })} label="Show worktop 显示台面（仅示意，台面价钱另外手动加）" /></div>
      </Collapse>
    </>
  );
}
