// 新模板：书桌 / 妆台 / 岛台 / 干厨·餐边柜 —— 价钱一律等于旧工具的现有种类（地柜 / 吊柜 / 高柜 / 见光板 / 飘板），不加新价格
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { computeItem } from '../src/constants/pricing.js';
import { layoutLeaves, bodyHeight } from '../src/planner/model.js';
import { newCabinet, updateSpec, TEMPLATE_LIST, cabinetWalls, cabinetSummary, frameTitle } from '../src/planner/templates.js';
import { cabinetTotal, cabinetItemsFor, frameQuantities } from '../src/planner/bridge.js';
import { explainCabinet } from '../src/planner/explain.js';
import { validateCabinet } from '../src/planner/validate.js';
import { cabinetFootprint, planSize, setPlanSize, aisleWarnings, placeAt } from '../src/planner/plan.js';
import { axoScene } from '../src/render/axo.js';
import { elevationScene } from '../src/render/elevation.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ''} ${a} ≠ ${b}`);
const base = (length, h, d, extra = {}) => computeItem({ type: 'cabinet', cabType: 'base', length, h, d, doorSeries: 'A', carcassSeries: 'A', ...extra }).total;
const wallCab = (length, h, d) => computeItem({ type: 'cabinet', cabType: 'wall', length, h, d, doorSeries: 'A', carcassSeries: 'A' }).total;
const tall = (length, h, d, extra = {}) => computeItem({ type: 'cabinet', cabType: 'tall', length, h, d, doorSeries: 'A', carcassSeries: 'A', ...extra }).total;
const panel = (length, h) => computeItem({ type: 'panel', preset: 'custom', length, h, panelSeries: 'A' }).total;
const parts = (c) => cabinetItemsFor(c).map((it) => it.kira.part);
const tiles = (f) => layoutLeaves(f.body, 0, 0, f.W, bodyHeight(f)).reduce((a, l) => a + l.w * l.h, 0) === f.W * bodyHeight(f);

test('the four new templates are on the template picker', () => {
  const ids = TEMPLATE_LIST.map((t) => t.id);
  for (const id of ['desk', 'vanity', 'island', 'sideboard']) assert.ok(ids.includes(id), id);
  for (const id of ['desk', 'vanity', 'island', 'sideboard']) newCabinet(id).frames.forEach((f) => assert.ok(tiles(f), `${id} ${f.id}`));
});

// ---------------- 书桌 / 妆台 ----------------
test('desk defaults 1.2 × 0.75 × 0.6 m; vanity 1.0 × 0.75 × 0.45 m', () => {
  const d = newCabinet('desk', { ceilingH: 2700 }), v = newCabinet('vanity', { ceilingH: 2700 });
  assert.deepEqual([d.spec.W, d.spec.H, d.spec.D], [1200, 750, 600]);
  assert.deepEqual([v.spec.W, v.spec.H, v.spec.D], [1000, 750, 450]);
  assert.equal(d.frames.length, 1);
  assert.equal(d.frames[0].kind, 'base');
  assert.equal(cabinetSummary(d, 'en'), '1.20 × 0.75 × 0.60 m · Drawers right');
  assert.equal(frameTitle(v, v.frames[0], 'zh'), '妆台');
});

test('desk price = base cabinet per metre over the WHOLE width (legroom too) + drawers + two side panels', () => {
  const d = newCabinet('desk', { ceilingH: 2700 });
  near(cabinetTotal(d), base(1.2, 0.75, 0.6, { drawersHalf: 3 }) + 2 * panel(0.6, 0.75), 'desk');
  assert.equal(Math.round(cabinetTotal(d)), 3519);
  // 没有抽屉柜：整张都是放脚位，照样按 1.2 m 地柜算
  const none = updateSpec(d, { drawers: 'none' });
  near(cabinetTotal(none), base(1.2, 0.75, 0.6) + 2 * panel(0.6, 0.75), 'no drawers');
  assert.equal(frameQuantities(none.frames[0]).q.closed, 1200);
  // 两边抽屉柜：两组抽屉
  const both = updateSpec(d, { drawers: 'both' });
  near(cabinetTotal(both), base(1.2, 0.75, 0.6, { drawersHalf: 6 }) + 2 * panel(0.6, 0.75), 'both');
  assert.deepEqual(both.frames[0].body.sizes, [400, 400, 400]);
  // 放脚位最少留 400：窄桌子把抽屉柜缩小
  assert.deepEqual(updateSpec(d, { W: 1000, drawers: 'both' }).frames[0].body.sizes, [300, 400, 300]);
});

test('vanity price + no "unusual base depth" warning for a 450 deep vanity', () => {
  const v = newCabinet('vanity', { ceilingH: 2700 });
  near(cabinetTotal(v), base(1.0, 0.75, 0.45, { drawersHalf: 3 }) + 2 * panel(0.45, 0.75));
  assert.equal(validateCabinet(v, { ceilingH: 2700 }).length, 0);
});

test('desk + left wardrobe + top cabinet: tower is a tall cabinet, inner side gets a finished panel', () => {
  const c = updateSpec(newCabinet('desk', { ceilingH: 2700 }), { above: 'upper', tower: { which: 'left', kind: 'wardrobe' } });
  const [tw, desk, up] = c.frames;
  assert.deepEqual([tw.kind, tw.x, tw.W, tw.D, tw.H], ['tall', 0, 600, 600, 2700]);
  assert.deepEqual([desk.x, desk.ends.left, desk.ends.right], [600, false, true]);
  assert.deepEqual([up.kind, up.x, up.y, up.W], ['wall', 600, 1500, 1200]);
  // 内侧露出 = 深 × 高 − 桌子挡住的（min(深) × 0.75）− 吊柜挡住的（min(深) × 0.6）
  const area = 600 * 2700 - 600 * 750 - 350 * 600;
  assert.deepEqual(tw.innerPanel, { side: 'right', area });
  assert.ok(parts(c).includes('panelIn'));
  const expect = tall(0.6, 2.7, 0.6) + panel(0.6, 2.7) + panel(0.6, area / 1e6 / 0.6)
    + base(1.2, 0.75, 0.6, { drawersHalf: 3 }) + panel(0.6, 0.75)
    + wallCab(1.2, 0.6, 0.35) + panel(0.35, 0.6);
  near(cabinetTotal(c), expect, 'desk + wardrobe + upper');
  // 高柜内侧可以关掉
  near(cabinetTotal({ ...c, exposed: { ...c.exposed, tallInner: false } }), expect - panel(0.6, area / 1e6 / 0.6));
});

test('vanity + floating shelves above + right bookcase: shelves priced per board, bookcase inner panel', () => {
  const c = updateSpec(newCabinet('vanity', { ceilingH: 2700 }), { above: 'shelf', tower: { which: 'right' } });
  const shelf = c.frames.find((f) => f.id.endsWith('-shelf'));
  assert.equal(shelf.body.type, 'shelf');
  assert.deepEqual([shelf.y, shelf.H], [c.spec.shelf.low - c.spec.shelf.gap, c.spec.shelf.n * c.spec.shelf.gap]);
  const tw = c.frames.find((f) => f.kind === 'tall');
  assert.deepEqual([tw.x, tw.D, tw.innerPanel.side], [1000, 350, 'left']);
  assert.equal(tw.innerPanel.area, 350 * 2700 - 350 * 750); // 飘板不挡
  assert.deepEqual(parts(c).filter((p) => p === 'shelf').length, 1);
  assert.equal(frameTitle(c, shelf, 'en'), 'Floating Shelves');
  assert.equal(frameTitle(c, tw, 'zh'), '书柜');
});

// ---------------- 岛台 ----------------
test('island (back = finished panel): front row base + both end panels + back panel width × height', () => {
  const c = newCabinet('island');
  assert.equal(c.spec.back, 'panel');
  assert.equal(c.frames.length, 1);
  assert.deepEqual(c.frames[0].backPanel, { area: 2400 * 850 });
  const back = cabinetItemsFor(c).find((it) => it.kira.part === 'panelBack');
  assert.deepEqual([back.type, back.length, back.h], ['panel', 2.4, 0.85]);
  near(cabinetTotal(c), base(2.4, 0.85, 0.6) + 2 * panel(0.6, 0.85) + panel(2.4, 0.85));
  assert.equal(Math.round(cabinetTotal(c)), 5486);
  // 台面只示意：开关台面价钱不变
  near(cabinetTotal(updateSpec(c, { worktop: false })), cabinetTotal(c));
  assert.ok(explainCabinet(c).some((r) => r.part.zh === '岛台背面见光板'));
});

test('island (cabinets both sides): second row back to back, 4 end panels, no back panel', () => {
  const c = updateSpec(newCabinet('island'), { back: 'cabinets' });
  assert.deepEqual(c.frames.map((f) => [f.wall, f.kind, f.x, f.W]), [[0, 'base', 0, 2400], [1, 'base', 0, 2400]]);
  assert.ok(!parts(c).includes('panelBack'));
  assert.equal(parts(c).filter((p) => p === 'panelL' || p === 'panelR').length, 4);
  near(cabinetTotal(c), 2 * base(2.4, 0.85, 0.6) + 4 * panel(0.6, 0.85));
  // 第二面墙 angle 180，原点在前排右后角 → 两排背板都在 z = 0
  assert.deepEqual(cabinetWalls(c).map(({ ox, oz, angle }) => [ox, oz, angle]), [[0, 0, 0], [2400, 0, 180]]);
  // 户型图外框：前排 [0,0]–[2400,600] 朝 +y；背排 [0,−600]–[2400,0] 朝 −y
  const fp = cabinetFootprint(c);
  assert.deepEqual(fp.parts.map((p) => [p.rect, p.front]), [[[0, 0, 2400, 600], [0, 1]], [[0, -600, 2400, 0], [0, -1]]]);
  assert.deepEqual(fp.bbox, [0, -600, 2400, 600]);
  // 背靠背不是「正面相对」：不出走道提醒
  const plan = { id: 'p1' };
  assert.deepEqual(aisleWarnings(plan, [{ ...c, place: placeAt(c, 1000, 1000, 0, 'p1') }]), []);
  // 「左边露出」关掉 → 两排在同一头（整体左边）的见光板一起拿掉
  const offL = { ...c, exposed: { ...c.exposed, left: false } };
  const gone = cabinetItemsFor(c).filter((it) => /panel[LR]/.test(it.kira.part)).length - cabinetItemsFor(offL).filter((it) => /panel[LR]/.test(it.kira.part)).length;
  assert.equal(gone, 2);
  assert.deepEqual(cabinetItemsFor(offL).filter((it) => /panel[LR]/.test(it.kira.part)).map((it) => it.id.split(':').slice(1).join(':')), [`${c.id}-front:panelR`, `${c.id}-back:panelL`]);
});

test('island 3D: no back wall drawn (free-standing); back row visible; plan size counts both rows', () => {
  const c = updateSpec(newCabinet('island'), { back: 'cabinets' });
  const s = axoScene(c, { yaw: -30 });
  assert.equal(s.shapes.filter((x) => x.part === 'wall').length, 0);
  const kitchen = axoScene(newCabinet('kitchen'), { yaw: -30 });
  assert.ok(kitchen.shapes.some((x) => x.part === 'wall'), 'kitchen still draws its wall');
  assert.deepEqual(planSize(c), { W: 2400, D: 1200 });
  assert.equal(setPlanSize(c, { D: 1400 }).cab.spec.D, 700);
  assert.deepEqual(planSize(newCabinet('island')), { W: 2400, D: 600 });
  const el = elevationScene(c, { lang: 'zh' });
  assert.deepEqual(el.shapes.filter((x) => x.role === 'wall-label').map((x) => x.text), ['正面', '背面']);
});

// ---------------- 干厨 / 餐边柜 ----------------
test('sideboard defaults: base 0.85 × 0.55 + worktop (illustrative), top cabinet on at 1.50, no TV wall', () => {
  const c = newCabinet('sideboard', { ceilingH: 2700 });
  const [low, up] = c.frames;
  assert.deepEqual([low.kind, low.H, low.D, low.y, !!low.worktop], ['base', 850, 550, 0, true]);
  assert.deepEqual([up.kind, up.y, up.H, up.D], ['wall', 1500, 750, 350]);
  assert.equal(c.spec.sides.on, false);
  assert.equal(frameTitle(c, low, 'en'), 'Base Cabinet');
  assert.equal(cabinetSummary(c, 'zh'), '2.40 m · 地柜 · 吊柜');
  near(cabinetTotal(c), base(2.4, 0.85, 0.55) + 2 * panel(0.55, 0.85) + wallCab(2.4, 0.75, 0.35) + 2 * panel(0.35, 0.75));
  // 电视墙打开也没有（餐边柜没有电视墙）；台面开关不影响价钱
  const tw = updateSpec(c, { tvWall: { on: true } });
  assert.ok(!tw.frames.some((f) => f.kind === 'backdrop'));
  near(cabinetTotal(updateSpec(c, { worktop: false })), cabinetTotal(c));
  // 电视柜照旧：没有台面、没有 variant
  const tv = newCabinet('tv');
  assert.equal(tv.spec.variant, undefined);
  assert.ok(!tv.frames.some((f) => f.worktop));
});

test('sideboard side tall cabinets (550 deep) with inner panels — worktop and top cabinet subtract', () => {
  const c = updateSpec(newCabinet('sideboard', { ceilingH: 2700 }), { sides: { on: true, which: 'both' } });
  const towers = c.frames.filter((f) => f.kind === 'tall');
  assert.equal(towers.length, 2);
  assert.equal(towers[0].D, 550);
  const area = 550 * 2700 - 550 * (850 + 30) - 350 * 750;
  assert.deepEqual(towers.map((f) => f.innerPanel), [{ side: 'right', area }, { side: 'left', area }]);
  const low = c.frames.find((f) => f.id.endsWith('-low'));
  assert.deepEqual([low.x, low.W], [600, 1200]);
  const tallOne = tall(0.6, 2.7, 0.55) + panel(0.55, 2.7) + panel(0.55, area / 1e6 / 0.55);
  near(cabinetTotal(c), 2 * tallOne + base(1.2, 0.85, 0.55) + wallCab(1.2, 0.75, 0.35));
  // 3 层全展抽屉
  const dr = updateSpec(c, { lowUnits: [{ layout: 'drawers' }, { layout: 'doors' }] });
  assert.deepEqual(cabinetItemsFor(dr).find((it) => it.id.endsWith('-low:closed')).drawers, 3);
  assert.deepEqual(planSize(c), { W: 2400, D: 550 });
});

test('EN output of the new templates has no Chinese (summary, frame titles, drawing labels)', () => {
  const HAN = /\p{Script=Han}/u;
  const cabs = [
    updateSpec(newCabinet('desk', { ceilingH: 2700 }), { above: 'upper', tower: { which: 'left', kind: 'wardrobe' }, drawers: 'both' }),
    updateSpec(newCabinet('vanity', { ceilingH: 2700 }), { above: 'shelf', tower: { which: 'right' } }),
    updateSpec(newCabinet('island'), { back: 'cabinets' }), newCabinet('island'),
    updateSpec(newCabinet('sideboard', { ceilingH: 2700 }), { sides: { on: true, which: 'left' } }),
  ];
  for (const c of cabs) {
    const txt = [cabinetSummary(c, 'en'), ...c.frames.map((f) => frameTitle(c, f, 'en')),
      ...elevationScene(c, { lang: 'en' }).shapes.filter((s) => s.text).map((s) => s.text)].join(' | ');
    assert.ok(!HAN.test(txt), `${c.template}: ${txt}`);
  }
});
