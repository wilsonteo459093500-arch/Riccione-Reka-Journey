// 第二版改 bridge.js 之前的明细快照用例（固定 id，结果可重现）。
// 产生快照：node test/fixtures/make-baseline.mjs（只在改 bridge 之前跑一次）
import { templateOf, buildFrames, WARDROBE_UNITS } from '../../src/planner/templates.js';
import { KITCHEN_SHAPES, KITCHEN_BASE_UNITS, KITCHEN_UPPER_UNITS, TALL_KINDS } from '../../src/planner/kitchen.js';
import { TV_LOW_UNITS, TV_SIDE_KINDS, TV_UPPER_UNITS, SHOE_STYLES, SHOE_UNITS } from '../../src/planner/tvshoe.js';

let n = 0;
function make(template, patch, extra = {}) {
  const t = templateOf(template);
  const id = `cab${String(++n).padStart(3, '0')}`;
  const cab = { id, code: 'K1', template: t.id, name: '', spec: t.normalize({ ...t.defaults({ ceilingH: 2700 }), ...patch }),
    series: null, exposed: { left: true, right: true }, glassCoef: 1.5, frames: [], ...extra };
  cab.frames = buildFrames(cab);
  return cab;
}

const SERIES = [null, { door: 'C', carcass: 'B' }, { door: 'F', carcass: 'C', open: 'B' }];
const BASES = [{ kind: 'plinth', h: 100 }, { kind: 'legs', h: 120 }, { kind: 'raised', h: 150 }, { kind: 'none', h: 0 }];
const DEFAULTS = [{ door: 'A', carcass: 'A' }, { door: 'D', carcass: 'B' }];

export function baselineCases() {
  n = 0;
  const cabs = [];
  // 衣柜：每种单元 × 底座 × 顶柜 × 系列，外加混搭
  WARDROBE_UNITS.forEach((u) => BASES.forEach((base) => [true, false].forEach((top) => SERIES.forEach((series) => {
    cabs.push(make('wardrobe', { W: 2400, base, top, units: Array.from({ length: 4 }, () => ({ layout: u.id, drawers: 3, drawerKind: 'full' })) }, { series }));
  }))));
  cabs.push(make('wardrobe', { W: 3100, units: WARDROBE_UNITS.map((u) => ({ layout: u.id })) }));
  cabs.push(make('wardrobe', { W: 900, H: 2100, doorsAuto: false, doors: 1 }, { exposed: { left: false, right: true } }));
  // 厨房：每种形状 × 每种下柜单元 / 上柜单元 / 高柜
  KITCHEN_SHAPES.forEach((sh) => {
    KITCHEN_BASE_UNITS.forEach((u) => SERIES.forEach((series) => {
      cabs.push(make('kitchen', { shape: sh.id, walls: [{ len: 3200, upper: true, units: Array.from({ length: 6 }, () => ({ layout: u.id })), upperUnits: [] }, { len: 2400, upper: true, units: [], upperUnits: [] }, { len: 2000, upper: false, units: [], upperUnits: [] }] }, { series }));
    }));
    KITCHEN_UPPER_UNITS.forEach((u) => cabs.push(make('kitchen', { shape: sh.id, walls: [{ len: 3000, upper: true, units: [], upperUnits: Array.from({ length: 5 }, () => ({ layout: u.id })) }] })));
    TALL_KINDS.forEach((k) => ['start', 'end'].forEach((end) => cabs.push(make('kitchen', { shape: sh.id, tall: { on: true, end, kind: k.id, W: 600, H: 2250, fridgeH: 1800 } }))));
  });
  cabs.push(make('kitchen', { base: { kind: 'legs', h: 120 } }));
  cabs.push(make('kitchen', { base: { kind: 'none', h: 0 } }));
  // 电视柜
  TV_LOW_UNITS.forEach((u) => ['floating', 'floor'].forEach((lowKind) => SERIES.forEach((series) => {
    cabs.push(make('tv', { lowKind, lowUnits: Array.from({ length: 5 }, () => ({ layout: u.id })) }, { series }));
  })));
  TV_SIDE_KINDS.forEach((k) => ['both', 'left', 'right'].forEach((which) => cabs.push(make('tv', { sides: { on: true, which, kind: k.id, W: 600, H: 2700, D: 350 } }))));
  TV_UPPER_UNITS.forEach((u) => cabs.push(make('tv', { upper: { on: true, H: 400, D: 350, y: 2000 }, upperUnits: Array.from({ length: 5 }, () => ({ layout: u.id })) })));
  // 鞋柜
  SHOE_STYLES.forEach((st) => SHOE_UNITS.forEach((u) => [true, false].forEach((raised) => SERIES.forEach((series) => {
    cabs.push(make('shoe', { style: st.id, raised, units: Array.from({ length: 3 }, () => ({ layout: u.id })) }, { series }));
  }))));
  return { cabs, defaults: DEFAULTS };
}

// 示范报价：固定 id 后的全部明细 + 总价
import { demoRecord } from '../../src/planner/demo.js';
import { deriveZones, computeRecordQuote } from '../../src/planner/bridge.js';
export function demoBaseline() {
  const r = demoRecord();
  r.zones = r.zones.map((z, zi) => ({ ...z, id: `z${zi}`, cabinets: z.cabinets.map((c, ci) => {
    const cab = { ...c, id: `demo${zi}${ci}` };
    cab.frames = buildFrames(cab);
    return cab;
  }) }));
  return { zones: deriveZones(r.zones, r.defaults).map((z) => z.items), quote: computeRecordQuote(r) };
}
