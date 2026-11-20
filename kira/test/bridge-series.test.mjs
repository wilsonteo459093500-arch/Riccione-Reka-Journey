// 第二版「每格单独选系列」：同系列合并成一行、不同系列分开；分组不改延米 / 平米算法；总价 = 逐格相加。
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { computeItem } from '../src/constants/pricing.js';
import { leaf, vsplit, hsplit } from '../src/planner/model.js';
import { frameItems, frameQuantities, resolveLeafSeries, customSeriesCount, cabinetItemsFor } from '../src/planner/bridge.js';
import { setLeaf } from '../src/planner/blocks.js';

const cab = (frames, extra = {}) => ({ id: 'c1', frames, exposed: { left: false, right: false }, ...extra });
const frame = (o) => ({ id: 'f', kind: 'tall', label: 'T', x: 0, y: 0, base: { kind: 'plinth', h: 100 }, ends: { left: true, right: true }, ...o });
const total = (items) => items.reduce((a, it) => a + computeItem(it).total, 0);
const closeTo = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);

test('series: resolveLeafSeries overlays leaf series; carcass only A–C; open follows the cell door', () => {
  const c = cab([], { series: { door: 'B', carcass: 'A' } });
  assert.deepEqual(resolveLeafSeries(c, leaf('closed')), { door: 'B', carcass: 'A', open: 'B' });
  assert.deepEqual(resolveLeafSeries(c, leaf('open', { series: { door: 'C' } })), { door: 'C', carcass: 'A', open: 'C' });
  assert.deepEqual(resolveLeafSeries(c, leaf('closed', { series: { carcass: 'K' } })), { door: 'B', carcass: 'A', open: 'B' });
  assert.deepEqual(resolveLeafSeries(c, leaf('closed', { series: { carcass: 'C' } })), { door: 'B', carcass: 'C', open: 'B' });
});

test('series: same effective series as the cabinet → one group, identical to no series', () => {
  const body = vsplit([600, 600], [leaf('closed'), leaf('closed')]);
  const f0 = frame({ W: 1200, H: 2100, D: 600, body });
  const f1 = setLeaf(f0, '1', { series: { door: 'A' } }); // 单独设成 A，柜子也是 A
  assert.deepEqual(frameItems(cab([f1]), f1), frameItems(cab([f0]), f0));
});

test('series: different series → separate rows, total = sum per cell (m² tall cabinet)', () => {
  const f0 = frame({ W: 1200, H: 2100, D: 600, body: vsplit([600, 600], [leaf('closed'), leaf('closed')]) });
  const f1 = setLeaf(f0, '1', { series: { door: 'C' } });
  const items = frameItems(cab([f1]), f1);
  assert.deepEqual(items.map((i) => i.id), ['c1:f:closed', 'c1:f:closed@C-A']);
  assert.equal(items[1].doorSeries, 'C');
  assert.equal(items[1].kira.series, 'C-A');
  // 逐格：每格单独当一个 600 宽柜体算 —— 平米柜线性 → 加起来 = 分组后总价
  const one = (ser) => frameItems(cab([], { series: ser }), frame({ W: 600, H: 2100, D: 600, body: leaf('closed') }));
  closeTo(total(items), total(one({ door: 'A' })) + total(one({ door: 'C' })));
  // 合计 q 不变
  const qa = frameQuantities(f0), qb = frameQuantities(f1);
  assert.deepEqual(qa.q, qb.q);
});

test('series: linear (base) cabinet keeps the linear-metre split per column when grouped', () => {
  const f0 = frame({ kind: 'base', W: 1800, H: 850, D: 600, body: vsplit([600, 600, 600], [leaf('closed'), hsplit([400, 350], [leaf('closed'), leaf('closed')]), leaf('closed')]) });
  const f1 = setLeaf(f0, '1.1', { series: { door: 'D', carcass: 'B' } });
  const qq = frameQuantities(f1, (n) => resolveLeafSeries(cab([]), n));
  assert.equal(qq.linear, true);
  closeTo(qq.qBy['A-A'].closed + qq.qBy['D-B'].closed, 1800);
  closeTo(qq.qBy['D-B'].closed, 600 * 350 / 850); // hp 含踢脚 100
  const items = frameItems(cab([f1]), f1);
  assert.equal(items.length, 2);
  closeTo(items[0].length + items[1].length, 1.8);
  assert.equal(items[0].h, items[1].h); // 价高整个柜体只算一次
});

test('series: drawers follow the drawer cell group; open cells follow their own door series', () => {
  const f0 = frame({ W: 1200, H: 2100, D: 600, body: vsplit([600, 600], [hsplit([600, 1400], [leaf('drawer', { drawers: 3, drawerKind: 'half' }), leaf('closed')]), leaf('open')]) });
  const f1 = setLeaf(setLeaf(f0, '0.0', { series: { door: 'C' } }), '1', { series: { door: 'E' } });
  const items = frameItems(cab([f1]), f1);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(byId['c1:f:closed'].drawersHalf, '');
  assert.equal(byId['c1:f:closed@C-A'].drawersHalf, 3);
  assert.equal(byId['c1:f:open@E'].openSeries, 'E');
  assert.equal(byId['c1:f:open'], undefined);
  // 抽屉总数不变
  const all = frameItems(cab([f0]), f0);
  assert.equal(all.reduce((a, i) => a + (Number(i.drawersHalf) || 0), 0), items.reduce((a, i) => a + (Number(i.drawersHalf) || 0), 0));
});

test('series: plinth height goes with the lowest cell series; side panels stay on the cabinet door', () => {
  const f0 = frame({ W: 600, H: 2100, D: 600, ends: { left: true, right: false }, body: hsplit([1000, 1000], [leaf('closed'), leaf('closed')]) });
  const f1 = setLeaf(f0, '0', { series: { door: 'C' } });
  const qq = frameQuantities(f1, (n) => resolveLeafSeries(cab([]), n));
  closeTo(qq.qBy['C-A'].closed, 600 * 1100);
  closeTo(qq.qBy['A-A'].closed, 600 * 1000);
  const items = cabinetItemsFor(cab([f1], { exposed: { left: true, right: true } }));
  assert.equal(items.find((i) => i.type === 'panel').panelSeries, 'A');
});

test('series: customSeriesCount counts cells with their own series', () => {
  const f0 = frame({ W: 1200, H: 2100, D: 600, body: vsplit([600, 600], [leaf('closed'), leaf('closed')]) });
  assert.equal(customSeriesCount(cab([f0])), 0);
  assert.equal(customSeriesCount(cab([setLeaf(f0, '1', { series: { door: 'C' } })])), 1);
});
