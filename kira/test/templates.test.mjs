import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { computeItem } from '../src/constants/pricing.js';
import { layoutLeaves, bodyHeight, autoDoors, splitEven, parseMetersToMm } from '../src/planner/model.js';
import { newCabinet, updateSpec, setUnit, nextCode } from '../src/planner/templates.js';
import { cabinetTotal, cabinetItemsFor } from '../src/planner/bridge.js';

const area = (f) => layoutLeaves(f.body, 0, 0, f.W, bodyHeight(f)).reduce((a, l) => a + l.w * l.h, 0);

test('door count: every door ≤ 600 (2.1 m → 4 doors of 525)', () => {
  assert.equal(autoDoors(2100), 4);
  assert.equal(autoDoors(2400), 4);
  assert.equal(autoDoors(2401), 5);
  assert.deepEqual(splitEven(2100, 4), [525, 525, 525, 525]);
  assert.deepEqual(splitEven(1000, 3), [334, 333, 333]);
});

test('lengths in metres with a+b', () => {
  assert.equal(parseMetersToMm('2.86+2.6'), 5460);
  assert.equal(parseMetersToMm('1.2'), 1200);
  assert.equal(parseMetersToMm(''), 0);
});

test('wardrobe defaults: to the room ceiling, plinth 100, top box 500, 4 doors for 2.4 m', () => {
  const c = newCabinet('wardrobe', { ceilingH: 2800 });
  assert.equal(c.spec.H, 2800);
  assert.equal(c.spec.D, 600);
  assert.equal(c.spec.doors, 4);
  assert.equal(c.frames.length, 1);
  const f = c.frames[0];
  assert.equal(area(f), f.W * bodyHeight(f)); // 格子刚好铺满柜身
});

test('wardrobe all-closed price = old tool tall item + two side panels', () => {
  const c = newCabinet('wardrobe', { ceilingH: 2700 });
  const old = computeItem({ type: 'cabinet', cabType: 'tall', length: '2.4', h: 2.7, d: 0.6, doorSeries: 'A', carcassSeries: 'A' }).total;
  const panels = 2 * 0.6 * 2.7 * 530;
  assert.ok(Math.abs(cabinetTotal(c) - (old + panels)) < 1e-6);
});

test('every wardrobe unit tiles the body exactly and prices > 0', () => {
  for (const layout of ['hang', 'shortFold', 'drawersHang', 'open', 'glass']) {
    for (const top of [true, false]) {
      const c = updateSpec(newCabinet('wardrobe'), { units: [{ layout }, { layout }, { layout }, { layout }], top });
      const f = c.frames[0];
      assert.equal(area(f), f.W * bodyHeight(f), layout);
      assert.ok(cabinetTotal(c) > 0, layout);
    }
  }
});

test('changing the width re-splits doors and keeps unit choices by position', () => {
  let c = newCabinet('wardrobe');
  c = setUnit(c, 1, { layout: 'drawersHang' });
  c = updateSpec(c, { W: 3000 });
  assert.equal(c.spec.doors, 5);
  assert.equal(c.spec.units[1].layout, 'drawersHang');
  assert.equal(c.spec.units[4].layout, 'hang');
  c = updateSpec(c, { W: 1200 });
  assert.equal(c.spec.units.length, 2);
});

test('manual door count (+/−) overrides auto', () => {
  const c = updateSpec(newCabinet('wardrobe'), { doorsAuto: false, doors: 6 });
  assert.equal(c.spec.doors, 6);
  assert.equal(c.spec.units.length, 6);
});

test('drawersHang: 3 half drawers by default; full when chosen', () => {
  let c = setUnit(newCabinet('wardrobe'), 0, { layout: 'drawersHang' });
  const it = cabinetItemsFor(c).find((i) => i.kira.part === 'closed');
  assert.equal(it.drawersHalf, 3);
  c = setUnit(c, 0, { drawerKind: 'full' });
  assert.equal(cabinetItemsFor(c).find((i) => i.kira.part === 'closed').drawers, 3);
});

test('cabinet codes K1, K2… across the quote', () => {
  assert.equal(nextCode([]), 'K1');
  assert.equal(nextCode([{ cabinets: [{ code: 'K1' }, { code: 'K3' }] }, { cabinets: [{ code: 'K2' }] }]), 'K4');
});

// ---------------- 厨房 ----------------
import { wallRuns } from '../src/planner/kitchen.js';
import { cabinetWalls } from '../src/planner/templates.js';

test('kitchen defaults: straight 3 m, base 850×600, top 750 at 1500 ×350, drawers full', () => {
  const c = newCabinet('kitchen');
  const base = c.frames.find((f) => f.kind === 'base');
  const top = c.frames.find((f) => f.kind === 'wall');
  assert.deepEqual([base.W, base.H, base.D], [3000, 850, 600]);
  assert.deepEqual([top.W, top.H, top.D, top.y], [3000, 750, 350, 1500]);
  const it = cabinetItemsFor(c).find((i) => i.kira.frameId === base.id && i.kira.part === 'closed');
  assert.equal(it.drawers, 3); // 默认第一格抽屉柜：3 层全展
});

test('kitchen straight run = old tool base L + wall L + drawers + side panels', () => {
  let c = newCabinet('kitchen');
  c = updateSpec(c, { walls: [{ len: 3000, upper: true, units: [{ layout: 'doors' }, { layout: 'doors' }, { layout: 'doors' }, { layout: 'doors' }, { layout: 'doors' }], upperUnits: [] }] });
  const base = computeItem({ type: 'cabinet', cabType: 'base', length: '3', h: 0.85, d: 0.6, doorSeries: 'A', carcassSeries: 'A' }).total;
  const wall = computeItem({ type: 'cabinet', cabType: 'wall', length: '3', h: 0.75, d: 0.35, doorSeries: 'A', carcassSeries: 'A' }).total;
  const panels = 2 * (0.6 * 0.85 + 0.35 * 0.75) * 530;
  assert.ok(Math.abs(cabinetTotal(c) - (base + wall + panels)) < 1e-6);
});

test('kitchen L: each wall measured to the corner (3 + 2.4 base, 3 + 2.4 top), no overlap in the corner', () => {
  let c = newCabinet('kitchen');
  c = updateSpec(c, { shape: 'L', walls: [{ len: 3000, units: [] }, { len: 2400, units: [] }] });
  c = updateSpec(c, { walls: c.spec.walls.map((w) => ({ ...w, units: w.units.map(() => ({ layout: 'doors' })) })) });
  c = { ...c, exposed: { left: false, right: false } };
  const base = computeItem({ type: 'cabinet', cabType: 'base', length: '3+2.4', h: 0.85, d: 0.6, doorSeries: 'A', carcassSeries: 'A' }).total;
  const wall = computeItem({ type: 'cabinet', cabType: 'wall', length: '3+2.4', h: 0.75, d: 0.35, doorSeries: 'A', carcassSeries: 'A' }).total;
  assert.ok(Math.abs(cabinetTotal(c) - (base + wall)) < 1e-6);
  const b1 = c.frames.find((f) => f.wall === 1 && f.kind === 'base');
  assert.equal(b1.x, 600); // 实物从转角后开始
  assert.equal(cabinetWalls(c)[1].angle, 90);
});

test('kitchen tall cabinet: oven tower priced as a full tall cabinet; fridge gap free; fridge + top = top cabinet', () => {
  const mk = (kind) => updateSpec(newCabinet('kitchen'), { tall: { on: true, end: 'end', kind } });
  const tallOf = (c) => cabinetItemsFor(c).filter((i) => i.kira.frameId.endsWith('-tall'));
  const oven = tallOf(mk('oven')).filter((i) => i.type === 'cabinet').reduce((a, i) => a + computeItem(i).total, 0);
  const ovenOld = computeItem({ type: 'cabinet', cabType: 'tall', length: '0.6', h: 2.25, d: 0.6, doorSeries: 'A', carcassSeries: 'A', drawers: 2 }).total;
  assert.ok(Math.abs(oven - ovenOld) < 1e-6);
  assert.equal(tallOf(mk('fridgeGap')).filter((i) => i.type === 'cabinet').length, 0);
  const top = tallOf(mk('fridgeTop')).filter((i) => i.type === 'cabinet').reduce((a, i) => a + computeItem(i).total, 0);
  assert.ok(Math.abs(top - 0.6 * 1610) < 1e-6); // 冰箱上方小柜 0.45 m 高 → 延米 0.6
});

test('kitchen appliance gap column is not priced; galley/U build without overlaps', () => {
  let c = newCabinet('kitchen');
  const w = c.spec.walls[0];
  const withGap = updateSpec(c, { walls: [{ ...w, units: w.units.map((u, i) => (i === 1 ? { layout: 'appliance' } : { layout: 'doors' })) }] });
  const without = updateSpec(c, { walls: [{ ...w, units: w.units.map(() => ({ layout: 'doors' })) }] });
  assert.ok(cabinetTotal(withGap) < cabinetTotal(without));
  for (const shape of ['U', 'galley']) {
    const k = updateSpec(newCabinet('kitchen'), { shape });
    const runs = wallRuns(k.spec);
    assert.equal(runs.length, shape === 'U' ? 3 : 2);
    k.frames.forEach((f) => assert.ok(f.W > 0 && Number.isFinite(f.x)));
    assert.ok(cabinetTotal(k) > 0);
  }
});

// ---------------- 电视柜 / 鞋柜 ----------------
test('TV defaults: floating low cabinet 400 high, 400 deep, 250 off the floor = old tool base L × 1610 + panels', () => {
  const c = newCabinet('tv');
  const low = c.frames.find((f) => f.id.endsWith('-low'));
  assert.deepEqual([low.H, low.D, low.y, low.base.kind], [400, 400, 250, 'wallhung']);
  const old = computeItem({ type: 'cabinet', cabType: 'base', length: '3', h: 0.4, d: 0.4, doorSeries: 'A', carcassSeries: 'A' }).total;
  assert.ok(Math.abs(cabinetTotal(c) - (old + 2 * 0.4 * 0.4 * 530)) < 1e-6);
});

test('TV with side towers and top cabinet: towers at both ends, low run shortened, no side panels inside', () => {
  const c = updateSpec(newCabinet('tv', { ceilingH: 2700 }), { sides: { on: true, which: 'both' }, upper: { on: true } });
  const ids = c.frames.map((f) => f.id.split('-').pop());
  assert.deepEqual(ids, ['sideL', 'low', 'upper', 'sideR']);
  const low = c.frames.find((f) => f.id.endsWith('-low'));
  assert.equal(low.W, 3000 - 2 * 600);
  assert.deepEqual(low.ends, { left: false, right: false });
  c.frames.forEach((f) => { const a = layoutLeaves(f.body, 0, 0, f.W, bodyHeight(f)).reduce((s, l) => s + l.w * l.h, 0); assert.ok(Math.abs(a - f.W * bodyHeight(f)) < 1); });
});

test('shoe defaults: 350 deep, raised 150 priced in total height, niche lower 900 / niche 350 / upper to the ceiling', () => {
  const c = newCabinet('shoe', { ceilingH: 2700 });
  const f = c.frames[0];
  assert.deepEqual([f.D, f.H, f.base.kind, f.base.h], [350, 2700, 'raised', 150]);
  const leaves = layoutLeaves(f.body, 0, 0, f.W, bodyHeight(f));
  const niche = leaves.find((l) => l.node.type === 'open');
  assert.equal(niche.y + 150, 900); // 下柜 900（从地面量，含架空）
  assert.equal(niche.h, 350);
  // 全封闭到顶鞋柜 = 旧工具高柜 L×H（底层架空按总高算）+ 两侧见光板
  const full = updateSpec(c, { style: 'full' });
  const old = computeItem({ type: 'cabinet', cabType: 'tall', length: '1.2', h: 2.7, d: 0.35, doorSeries: 'A', carcassSeries: 'A' }).total;
  assert.ok(Math.abs(cabinetTotal(full) - (old + 2 * 0.35 * 2.7 * 530)) < 1e-6);
});

test('shoe styles: low cabinet and bench are linear (height < 1 m)', () => {
  const low = updateSpec(newCabinet('shoe'), { style: 'low' });
  assert.equal(low.frames[0].H, 950);
  assert.equal(cabinetItemsFor(low)[0].h < 1, true);
  const bench = updateSpec(newCabinet('shoe'), { style: 'bench' });
  assert.equal(bench.frames[0].H, 450);
  assert.ok(cabinetTotal(bench) > 0);
});

// ---------------- 房间楼高没填（finding 15）----------------
// 房间 ceilingH 是 null / 0 / '' / 没传 → 一律按默认 2700 做到顶（Number(null) = 0 不能当成「楼高 0」再被夹到 600 / 1200）
test('room ceiling not set (null / 0 / undefined / \'\' / junk): every template builds to the default 2700, same price as 2700', () => {
  const heights = (c) => (c.template === 'tv' ? [c.spec.sides.H] : c.template === 'kitchen' ? [] : [c.spec.H]);
  for (const t of ['wardrobe', 'kitchen', 'tv', 'shoe']) {
    const ref = newCabinet(t, { ceilingH: 2700 });
    for (const ceilingH of [null, 0, undefined, '', -5, NaN, 'abc']) {
      const c = newCabinet(t, { ceilingH });
      heights(c).forEach((h) => assert.equal(h, 2700, `${t} ceilingH=${String(ceilingH)}`));
      assert.ok(Math.abs(cabinetTotal(c) - cabinetTotal(ref)) < 1e-6, `${t} ceilingH=${String(ceilingH)} price`);
      assert.deepEqual(c.frames.map((f) => f.H), ref.frames.map((f) => f.H));
    }
  }
  // 填了就用填的（数字字符串也行）
  assert.equal(newCabinet('wardrobe', { ceilingH: 2800 }).spec.H, 2800);
  assert.equal(newCabinet('wardrobe', { ceilingH: '2800' }).spec.H, 2800);
  assert.equal(newCabinet('shoe', { ceilingH: 2400 }).frames[0].H, 2400);
});

test('room ceiling not set: wardrobe frame 2.70 m (= RM 12,150), shoe to-ceiling / niche 2.70 m, TV side towers 2.70 m', () => {
  const w = newCabinet('wardrobe', { ceilingH: null });
  assert.equal(w.frames[0].H, 2700);
  assert.ok(Math.abs(cabinetTotal(w) - 12150) < 1e-6);
  for (const style of ['niche', 'full']) {
    const s = updateSpec(newCabinet('shoe', { ceilingH: null }), { style });
    assert.equal(s.frames[0].H, 2700, style);
  }
  const tv = updateSpec(newCabinet('tv', { ceilingH: null }), { sides: { on: true, which: 'both' } });
  const towers = tv.frames.filter((f) => /side[LR]$/.test(f.id));
  assert.equal(towers.length, 2);
  towers.forEach((f) => assert.equal(f.H, 2700));
  // 规范化也一样：坏掉的 H（null / ''）不变成 600 / 1200
  assert.equal(updateSpec(w, { H: null }).spec.H, 2700);
  assert.equal(updateSpec(newCabinet('shoe'), { H: '' }).spec.H, 2700);
  assert.equal(updateSpec(newCabinet('tv'), { sides: { on: true, H: null } }).spec.sides.H, 2700);
  // 用户自己改的高度照旧（夹在范围内）
  assert.equal(updateSpec(w, { H: 2400 }).spec.H, 2400);
  assert.equal(updateSpec(w, { H: 300 }).spec.H, 600);
});

test('TV side towers: inner side (facing the TV) gets a side panel for the part not covered by the low / top cabinet', () => {
  // 高柜 2.70 × 深 0.35；悬空矮柜 离地 0.25、高 0.40、深 0.40 → 挡住 0.35 × 0.40
  const c = updateSpec(newCabinet('tv', { ceilingH: 2700 }), { sides: { on: true, which: 'both' } });
  const towers = c.frames.filter((f) => /side[LR]$/.test(f.id));
  assert.deepEqual(towers.map((f) => f.innerPanel), [{ side: 'right', area: 350 * 2700 - 350 * 400 }, { side: 'left', area: 350 * 2700 - 350 * 400 }]);
  const inner = cabinetItemsFor(c).filter((it) => it.kira?.part === 'panelIn');
  assert.equal(inner.length, 2);
  inner.forEach((it) => assert.ok(Math.abs(it.length * it.h - 0.35 * 2.3) < 1e-9));
  // 开吊柜（离地 2.00、高 0.40、深 0.35）→ 再扣 0.35 × 0.40
  const up = updateSpec(c, { upper: { on: true } });
  assert.equal(up.frames.find((f) => f.id.endsWith('-sideL')).innerPanel.area, 350 * 2700 - 350 * 400 - 350 * 400);
  // 关「高柜内侧」→ 不计价；价钱少两块
  const off = { ...c, exposed: { tallInner: false } };
  assert.equal(cabinetItemsFor(off).filter((it) => it.kira?.part === 'panelIn').length, 0);
  assert.ok(cabinetTotal(c) > cabinetTotal(off));
  // 只有一边高柜 → 只有那一块
  const one = updateSpec(c, { sides: { on: true, which: 'left' } });
  assert.equal(cabinetItemsFor(one).filter((it) => it.kira?.part === 'panelIn').length, 1);
  // 没有高柜 → 没有
  assert.equal(cabinetItemsFor(newCabinet('tv', { ceilingH: 2700 })).filter((it) => it.kira?.part === 'panelIn').length, 0);
});
