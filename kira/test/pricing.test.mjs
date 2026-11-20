// 价格黄金值：用旧报价工具（PR #6 @391d3bd）的 computeItem / computeQuote 算出来的数字。
// KIRA 的价格表是从旧工具原样复制的，这些数字必须一模一样。
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { computeItem, computeQuote, cnyToMyr, SERIES, CARCASS_SERIES } from '../src/constants/pricing.js';

const cab = (o) => ({ type: 'cabinet', doorSeries: 'A', carcassSeries: 'A', openSeries: 'A', hasDoor: true, hasCarcass: true, hasOpen: false, ...o });
export const GOLDEN = [
  ['g1 base 2.86+2.6 h.85 2 full drawers', cab({ id: 'g1', cabType: 'base', length: '2.86+2.6', h: 0.85, d: 0.6, drawers: 2 }), 10320.6],
  ['g2 wall B/B 2.4×.75×.35', cab({ id: 'g2', cabType: 'wall', length: '2.4', h: 0.75, d: 0.35, doorSeries: 'B', carcassSeries: 'B' }), 4992],
  ['g3 tall door C coef 2.5 door', cab({ id: 'g3', cabType: 'tall', length: '1.8', h: 2.7, d: 0.6, doorSeries: 'C', coef: 2.5, coefTarget: 'door' }), 15515.55],
  ['g4 open D 1.2×2.0', cab({ id: 'g4', cabType: 'open', length: '1.2', h: 2.0, d: 0.35, hasDoor: false, hasCarcass: false, hasOpen: true, openSeries: 'D' }), 7884],
  ['g5 tall coef 1.5 both + 2 half drawers', cab({ id: 'g5', cabType: 'tall', length: '1', h: 2.4, d: 0.6, coef: 1.5, coefTarget: 'both', drawersHalf: 2 }), 6536],
  ['g6 panel E 3×2.7', { id: 'g6', type: 'panel', length: '3', h: 2.7, panelSeries: 'E' }, 10651.5],
  ['g7 led 4.5', { id: 'g7', type: 'led', length: '4.5' }, 1305],
  ['g8 roomdoor 2×7570', { id: 'g8', type: 'roomdoor', qty: '2', unitMyr: 7570 }, 15140],
  ['g9 sintered stone 3×1200', { id: 'g9', type: 'other', desc: 'Sintered stone worktop', qty: '3', uom: 'm', unitMyr: 1200 }, 3600],
  ['g10 tall L.5 h1.0 d1.2 (depth rule)', cab({ id: 'g10', cabType: 'tall', length: '0.5', h: 1.0, d: 1.2 }), 966],
];

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);

test('series A rates in MYR (door 530 / carcass 1080 / open 1630)', () => {
  const A = SERIES[0];
  assert.equal(cnyToMyr(A.door), 530);
  assert.equal(cnyToMyr(A.carcass), 1080);
  assert.equal(cnyToMyr(A.open), 1630);
  assert.equal(cnyToMyr(970), 765);
  assert.equal(cnyToMyr(470), 370);
  assert.deepEqual(CARCASS_SERIES, ['A', 'B', 'C']);
});

for (const [name, item, total] of GOLDEN) {
  test(`golden ${name} = ${total}`, () => close(computeItem(item).total, total));
}

test('golden quote: all ten in one zone at 10% → gross 76911 / excluded 3600 / discount 7331 / net 69580', () => {
  const q = computeQuote([{ id: 'z', name: 'Z', items: GOLDEN.map((g) => g[1]) }], 10);
  assert.equal(q.gross, 76911);
  assert.equal(q.excluded, 3600);
  assert.equal(q.discount, 7331);
  assert.equal(q.net, 69580);
});

test('golden quote: amount discount is capped at the discountable part (73311)', () => {
  const q = computeQuote([{ id: 'z', name: 'Z', items: GOLDEN.map((g) => g[1]) }], 0, 'amt', 99999);
  assert.equal(q.discount, 73311);
  assert.equal(q.net, 3600);
});
