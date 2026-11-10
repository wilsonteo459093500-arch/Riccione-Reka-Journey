// 空白柜子的设定：柜体种类、尺寸、底座。改尺寸 = 框框照比例缩放（不问、不还原）
import { T } from '../../theme.js';
import { mmToM, BASE_KINDS } from '../../planner/model.js';
import { BLANK_KIND_DEFAULTS } from '../../planner/templates.js';
import { Section, Segmented, MeterInput, Tip } from './bits.jsx';

export default function BlankSettings({ cab, setSpec, ceilingH }) {
  const spec = cab.spec;
  const hasH = ['plinth', 'legs', 'raised'].includes(spec.base?.kind);
  return (
    <>
      <Section title="Cabinet type 柜体种类">
        <Segmented value={spec.kind} onChange={(kind) => kind !== spec.kind && setSpec({ ...BLANK_KIND_DEFAULTS[kind]({ ceilingH }), W: spec.W })}
          options={[{ id: 'tall', label: '高柜 Tall', sub: '到楼高' }, { id: 'base', label: '地柜 Base', sub: '0.85' }, { id: 'wall', label: '吊柜 Top', sub: '0.75' }]} />
      </Section>
      <Section title="Size 尺寸" hint={ceilingH ? `Room ceiling 房间楼高 ${mmToM(ceilingH)} m` : 'Room ceiling not set — using 2.70 m 楼高没填，先按 2.70 m'}>
        <div className="grid grid-cols-3 gap-2">
          <MeterInput label="Width 总宽" mm={spec.W} onChange={(W) => setSpec({ W })} />
          <MeterInput label="Height 高" mm={spec.H} onChange={(H) => setSpec({ H })} />
          <MeterInput label="Depth 深" mm={spec.D} onChange={(D) => setSpec({ D })} />
        </div>
        {spec.kind === 'wall' && <div className="w-32 mt-2"><MeterInput label="Off floor 离地" mm={spec.y} min={-1} onChange={(y) => setSpec({ y })} /></div>}
        {spec.kind === 'tall' && ceilingH && spec.H !== ceilingH && (
          <button type="button" onClick={() => setSpec({ H: ceilingH })} className="mt-2 text-xs underline" style={{ color: T.wood }}>
            To the ceiling 做到顶（{mmToM(ceilingH)} m）
          </button>
        )}
        <div className="mt-2"><Tip>Blocks scale with the size 改尺寸时框框照比例缩放</Tip></div>
      </Section>
      <Section title="Base 底座">
        <Segmented value={spec.base?.kind} onChange={(kind) => setSpec({ base: { kind, h: BASE_KINDS.find((k) => k.id === kind)?.h } })}
          options={BASE_KINDS.map((k) => ({ id: k.id, label: k.zh, sub: k.en }))} />
        {hasH && <div className="w-32 mt-2"><MeterInput label="Height 高" mm={spec.base.h} onChange={(h) => setSpec({ base: { ...spec.base, h } })} /></div>}
      </Section>
    </>
  );
}
