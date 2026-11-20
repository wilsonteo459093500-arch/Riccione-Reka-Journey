// 飘板 / 层架模板的设定：板长、块数、间距、深、最低一块离地、种类（价钱按块、按宽度档）
import { T } from '../../theme.js';
import { SHELF_KINDS } from '../../constants/shelves.js';
import { Section, Stepper, MeterInput, Tip } from './bits.jsx';

export const ShelfKindPicker = ({ value, onChange }) => (
  <div className="grid grid-cols-1 gap-1.5" data-shelf-kind>
    {SHELF_KINDS.map((k) => {
      const on = value === k.id;
      return (
        <button key={k.id} type="button" onClick={() => onChange(k.id)} data-kind={k.id} className="px-2.5 py-2 text-left text-xs"
          style={{ borderRadius: 2, background: on ? T.ink : T.paper, color: on ? T.paper : T.ink, border: `1px solid ${on ? T.ink : T.line}` }}>
          {k.zh}<span className="block text-[10px] opacity-75">{k.en} · ≤{(k.maxW / 1000).toFixed(1)} m · D {k.minD}–{k.maxD}</span>
        </button>
      );
    })}
  </div>
);

export default function ShelfSettings({ cab, setSpec }) {
  const spec = cab.spec;
  return (
    <>
      <Section title="Shelves 飘板">
        <div className="grid grid-cols-2 gap-2">
          <MeterInput label="Length 板长" mm={spec.W} onChange={(W) => setSpec({ W })} />
          <MeterInput label="Depth 深" mm={spec.D} onChange={(D) => setSpec({ D })} />
          <MeterInput label="Spacing 间距" mm={spec.gap} onChange={(gap) => setSpec({ gap })} />
          <MeterInput label="Lowest 最低一块离地" mm={spec.low} onChange={(low) => setSpec({ low })} />
        </div>
        <div className="flex items-center gap-3 mt-3">
          <span className="text-[11px]" style={{ color: T.inkSoft }}>块数 Boards</span>
          <Stepper value={spec.n} min={1} max={20} onChange={(n) => setSpec({ n })} suffix="块" />
        </div>
      </Section>
      <Section title="Kind 种类" hint="Priced per board by length band · series follows the door series 每块板按长度分档计价，系列跟门板">
        <ShelfKindPicker value={spec.kind} onChange={(kind) => setSpec({ kind })} />
        <div className="mt-2"><Tip>Longer than the maximum → priced as several boards 超过最长就按几块计价</Tip></div>
      </Section>
    </>
  );
}
