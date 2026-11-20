// 书桌 / 妆台 设定：尺寸 · 抽屉柜 左 / 右 / 两边 / 无 · 上方 无 / 飘板 / 吊柜 · 侧边高柜（书柜 / 衣柜）无 / 左 / 右
import { T } from '../../theme.js';
import { DESK_DRAWERS, DESK_ABOVE, DESK_TOWER_WHICH, DESK_TOWER_KINDS, deskColumns, towerDepth } from '../../planner/desk.js';
import { Section, Segmented, Stepper, MeterInput, Tip } from './bits.jsx';
import { DEFAULT_CEILING, mmToM } from '../../planner/model.js';

const NO_CEILING = `Room ceiling not set — default ${mmToM(DEFAULT_CEILING)} m 楼高没填，先按 ${mmToM(DEFAULT_CEILING)} m`;
const opts = (list) => list.map((x) => ({ id: x.id, label: `${x.zh} ${x.en}` }));

export default function DeskSettings({ cab, setSpec, ceilingH }) {
  const s = cab.spec;
  const vanity = s.variant === 'vanity';
  const leg = deskColumns(s).filter((c) => c.type === 'leg').reduce((a, c) => a + c.w, 0);
  return (
    <div data-desk-settings>
      <Section title={vanity ? 'Size 妆台尺寸' : 'Size 书桌尺寸'} hint="Whole desk priced per metre as a base cabinet (legroom included) 整张桌按地柜延米计价（放脚位也算）">
        <div className="grid grid-cols-3 gap-2">
          <MeterInput label="Width 宽" mm={s.W} onChange={(W) => setSpec({ W })} />
          <MeterInput label="Height 高" mm={s.H} onChange={(H) => setSpec({ H })} />
          <MeterInput label="Depth 深" mm={s.D} onChange={(D) => setSpec({ D })} />
        </div>
      </Section>

      <Section title="Drawer unit 抽屉柜" hint={s.drawers !== 'none' ? `Legroom 放脚位 ${mmToM(leg)} m` : undefined}>
        <div data-desk-drawers><Segmented size="sm" value={s.drawers} onChange={(drawers) => setSpec({ drawers })} options={opts(DESK_DRAWERS)} /></div>
        {s.drawers !== 'none' && (
          <div className="flex items-end gap-3 mt-2">
            <div className="w-28"><MeterInput label="Width 抽屉柜宽" mm={s.drawerW} onChange={(drawerW) => setSpec({ drawerW })} /></div>
            <div>
              <span className="block text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>Drawers 抽屉</span>
              <Stepper value={s.drawerN} min={1} max={5} onChange={(drawerN) => setSpec({ drawerN })} suffix="抽" />
            </div>
          </div>
        )}
      </Section>

      <Section title="Above 上方">
        <div data-desk-above><Segmented size="sm" value={s.above} onChange={(above) => setSpec({ above })} options={opts(DESK_ABOVE)} /></div>
        {s.above === 'upper' && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            <MeterInput label="Height 高" mm={s.upper.H} onChange={(H) => setSpec({ upper: { ...s.upper, H } })} />
            <MeterInput label="From floor 离地" mm={s.upper.y} onChange={(y) => setSpec({ upper: { ...s.upper, y } })} />
            <MeterInput label="Depth 深" mm={s.upper.D} onChange={(D) => setSpec({ upper: { ...s.upper, D } })} />
          </div>
        )}
        {s.above === 'shelf' && (
          <>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <MeterInput label="Lowest 最低一块离地" mm={s.shelf.low} onChange={(low) => setSpec({ shelf: { ...s.shelf, low } })} />
              <MeterInput label="Spacing 间距" mm={s.shelf.gap} onChange={(gap) => setSpec({ shelf: { ...s.shelf, gap } })} />
              <MeterInput label="Depth 深" mm={s.shelf.D} onChange={(D) => setSpec({ shelf: { ...s.shelf, D } })} />
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[11px]" style={{ color: T.inkSoft }}>块数 Boards</span>
              <Stepper value={s.shelf.n} min={1} max={6} onChange={(n) => setSpec({ shelf: { ...s.shelf, n } })} suffix="块" />
            </div>
          </>
        )}
      </Section>

      <Section title="Side tall cabinet 侧边高柜" hint={s.tower.which !== 'none' && !(ceilingH > 0) ? NO_CEILING : undefined}>
        <div data-desk-tower>
          <Segmented size="sm" value={s.tower.which}
            onChange={(which) => setSpec({ tower: { ...s.tower, which, H: which !== 'none' && s.tower.which === 'none' && ceilingH ? ceilingH : s.tower.H } })}
            options={opts(DESK_TOWER_WHICH)} />
        </div>
        {s.tower.which !== 'none' && (
          <div className="space-y-2 mt-2">
            <Segmented size="sm" value={s.tower.kind} onChange={(kind) => setSpec({ tower: { ...s.tower, kind, D: towerDepth(kind) } })} options={opts(DESK_TOWER_KINDS)} />
            <div className="grid grid-cols-3 gap-2">
              <MeterInput label="Width 宽" mm={s.tower.W} onChange={(W) => setSpec({ tower: { ...s.tower, W } })} />
              <MeterInput label="Height 高" mm={s.tower.H} onChange={(H) => setSpec({ tower: { ...s.tower, H } })} />
              <MeterInput label="Depth 深" mm={s.tower.D} onChange={(D) => setSpec({ tower: { ...s.tower, D } })} />
            </div>
            <Tip>The side facing the desk gets a finished panel 朝桌子那一边露出来的部分加见光板</Tip>
          </div>
        )}
      </Section>
    </div>
  );
}
