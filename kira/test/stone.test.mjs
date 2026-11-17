// 岩板台面：台面延米 ÷ 0.3 × RM240（= RM800 / m），不折扣；厨房 / 岛台 / 干厨「加岩板」才算
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { computeItem, computeQuote } from '../src/constants/pricing.js';
import { SINTERED_MYR_PER_M } from '../src/constants/stone.js';
import { newCabinet, updateSpec } from '../src/planner/templates.js';
import { cabinetItemsFor, cabinetTotal, deriveZones, localizeKira } from '../src/planner/bridge.js';
import { explainCabinet } from '../src/planner/explain.js';

const stoneOf = (cab) => cabinetItemsFor(cab).filter((it) => it.kira?.part === 'stone');
const stoneMyr = (cab) => stoneOf(cab).reduce((a, it) => a + computeItem(it).total, 0);

test('stone: RM240 per 0.3 m = RM800 per metre, exact', () => {
  assert.equal(SINTERED_MYR_PER_M, 800);
});

test('stone: off by default — kitchen price unchanged, spec has no stone field', () => {
  const c = newCabinet('kitchen');
  assert.equal(stoneOf(c).length, 0);
  assert.equal('stone' in c.spec, false);
});

test('stone: straight kitchen 3.00 m → 3.00 L.m × RM800 = RM2,400, added on top of the cabinets', () => {
  const c = newCabinet('kitchen');
  const before = cabinetTotal(c);
  const s = updateSpec(c, { stone: true });
  const its = stoneOf(s);
  assert.equal(its.length, 1);
  assert.equal(its[0].qty, 3);
  assert.equal(its[0].noDiscount, true);
  assert.equal(stoneMyr(s), 2400);
  assert.equal(Math.round(cabinetTotal(s) - before), 2400);
});

test('stone: L kitchen measured to the corner on both walls (3.0 + 2.4 = 5.4 L.m → RM4,320)', () => {
  const c = updateSpec(newCabinet('kitchen'), { shape: 'L', walls: [{ len: 3000 }, { len: 2400 }], stone: true });
  assert.equal(Math.round(stoneOf(c).reduce((a, it) => a + it.qty, 0) * 1000), 5400);
  assert.equal(Math.round(stoneMyr(c)), 4320);
});

test('stone: worktop under a tall unit is not counted (3.0 m wall − 0.6 m oven tower = 2.4 L.m)', () => {
  const c = updateSpec(newCabinet('kitchen'), { tall: { on: true, W: 600 }, stone: true });
  assert.equal(Math.round(stoneMyr(c)), 1920);
});

test('stone: hiding the worktop removes the stone price', () => {
  const c = updateSpec(newCabinet('kitchen'), { stone: true, worktop: false });
  assert.equal(stoneOf(c).length, 0);
});

test('stone: island counted once even with cabinets on both sides', () => {
  const c = updateSpec(newCabinet('island'), { W: 2400, back: 'cabinets', stone: true });
  assert.equal(stoneOf(c).length, 1);
  assert.equal(Math.round(stoneMyr(c)), 1920);
});

test('stone: dry kitchen / sideboard base run', () => {
  const c = updateSpec(newCabinet('sideboard'), { W: 2400, stone: true });
  assert.equal(Math.round(stoneMyr(c)), 1920);
});

test('stone: excluded from the quote discount; bilingual line in L.m / 延米', () => {
  const c = updateSpec(newCabinet('kitchen'), { stone: true });
  const q = localizeKira(computeQuote(deriveZones([{ id: 'z', name: 'Kitchen', cabinets: [c], items: [] }]), 10));
  assert.equal(q.excluded, 2400);
  assert.equal(q.discount, Math.round((q.gross - 2400) * 0.1));
  const ln = q.zoneResults[0].items.find((ir) => ir.item.kira?.part === 'stone').lines[0];
  assert.equal(ln.descEn, 'Sintered Stone Worktop');
  assert.equal(ln.descZh, '岩板台面');
  assert.equal(ln.uomZh, '延米');
  const row = explainCabinet(c).find((r) => r.part.zh === '岩板台面');
  assert.match(row.calc, /^3(\.00)? 延米 × RM800$/);
});
