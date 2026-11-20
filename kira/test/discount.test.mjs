// 体检 2026-11-19 问题 9：折扣可以填超过 100% 或负数（150% → 总价变负数；−10% → 变成加价）
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { clampPct, clampAmt, pctOutOfRange, cleanDiscChain, safeChainRate, quoteOf, looseOf } from '../src/constants/discount.js';
import { computeQuote, discountChainRate } from '../src/constants/pricing.js';
import { newCabinet, updateSpec } from '../src/planner/templates.js';
import { computeRecordQuote, deriveZones } from '../src/planner/bridge.js';

const record = (over = {}) => ({
  id: 'r1', adjustPct: 0, discountMode: 'pct', discountAmt: 0, defaults: { door: 'A', carcass: 'A' },
  zones: [
    { id: 'z1', name: 'Master Bedroom 主卧', items: [], cabinets: [newCabinet('wardrobe', { ceilingH: 2700 })] },
    { id: 'z2', name: 'Dry Kitchen 干厨', items: [], cabinets: [updateSpec(newCabinet('kitchen'), { stone: true })] },
  ],
  ...over,
});

test('discount %: kept between 0 and 100; blank / nonsense = 0', () => {
  assert.equal(clampPct(150), 100);
  assert.equal(clampPct(-10), 0);
  assert.equal(clampPct('12.5'), 12.5);
  assert.equal(clampPct(100), 100);
  assert.equal(clampPct(0), 0);
  [null, undefined, '', '  ', 'abc', NaN, Infinity, -Infinity].forEach((v) => assert.equal(clampPct(v), 0, String(v)));
  assert.equal(pctOutOfRange(150), true);
  assert.equal(pctOutOfRange('-1'), true);
  assert.equal(pctOutOfRange(100), false);
  assert.equal(pctOutOfRange(''), false);
  assert.equal(clampAmt(-500), 0);
  assert.equal(clampAmt('250'), 250);
  assert.equal(clampAmt('x'), 0);
});

test('discount 150% → the total can no longer go negative; −10% → no longer a surcharge', () => {
  const base = computeRecordQuote(record());
  assert.ok(base.gross > 0 && base.excluded === 2400); // 岩板 3.0 m × RM800 不折扣
  // 旧工具的算法本身不挡（pricing.js 一字不改）：150% 真的会算成负数
  const raw = computeQuote(deriveZones(record().zones, record().defaults), 150);
  assert.ok(raw.net < base.excluded, `old formula: ${raw.net}`);
  // KIRA 走 quoteOf：150% 当 100% → 只剩不折扣的岩板；总价不会是负的
  const over = computeRecordQuote(record({ adjustPct: 150 }));
  assert.equal(over.adjustPct, 100);
  assert.equal(over.discount, base.gross - base.excluded);
  assert.equal(over.net, base.excluded);
  assert.ok(over.net >= 0);
  // −10% 当 0%：不加价
  const neg = computeRecordQuote(record({ adjustPct: -10 }));
  assert.equal(neg.adjustPct, 0);
  assert.equal(neg.discount, 0);
  assert.equal(neg.net, base.gross);
  // 正常的折扣一分不变
  const seven = computeRecordQuote(record({ adjustPct: 7 }));
  assert.deepEqual([seven.discount, seven.net], [Math.round((base.gross - 2400) * 0.07), base.gross - Math.round((base.gross - 2400) * 0.07)]);
  assert.equal(quoteOf(deriveZones(record().zones, record().defaults), 7).net, computeQuote(deriveZones(record().zones, record().defaults), 7).net);
  // 定额折扣：负数 = 0；超过可折扣金额 = 封顶（这个本来就有）
  assert.equal(computeRecordQuote(record({ discountMode: 'amt', discountAmt: -500 })).net, base.gross);
  assert.equal(computeRecordQuote(record({ discountMode: 'amt', discountAmt: 9e9 })).net, base.excluded);
});

test('loose furniture discount: same 0–100% rule', () => {
  const items = [{ id: 'l1', type: 'Sofa', qty: 1, unitMyr: 3000 }];
  assert.equal(looseOf(items, 150).net, 0);
  assert.equal(looseOf(items, -10).net, 3000);
  assert.equal(looseOf(items, 10).net, 2700);
  assert.equal(looseOf(items, 0, 'amt', -100).net, 3000);
});

test('designer discount chain "30+10": each step 0–100%, half-typed / nonsense parts dropped', () => {
  assert.equal(cleanDiscChain('30+10'), '30+10');
  assert.equal(cleanDiscChain(' 30 + 10 '), '30+10');
  assert.equal(cleanDiscChain('30+'), '30');
  assert.equal(cleanDiscChain('150'), '100');
  assert.equal(cleanDiscChain('-10'), '0');
  assert.equal(cleanDiscChain('30+-5'), '30+0');
  assert.equal(cleanDiscChain('abc'), '');
  assert.equal(cleanDiscChain(null), '');
  assert.equal(cleanDiscChain('12.5'), '12.5');
  // 以前：150 → 系数 −0.5（供货价变负数）；−10 → 1.1（供货价比零售还贵）
  assert.equal(discountChainRate('150'), -0.5);
  assert.equal(safeChainRate('150'), 0);
  assert.equal(safeChainRate('-10'), 1);
  assert.ok(Math.abs(safeChainRate('30+10') - 0.63) < 1e-12);
  assert.equal(safeChainRate(''), 1);
});
