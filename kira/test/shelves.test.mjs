// 飘板：价格表（人民币 → 马币 MROUND(×1.3÷1.65, 5)）、按宽度档、按系列分组、超过最长分块；模板和格子类型
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { computeItem, cnyToMyr } from '../src/constants/pricing.js';
import { shelfBoards, shelfGroup } from '../src/constants/shelves.js';
import { newCabinet, updateSpec } from '../src/planner/templates.js';
import { cabinetItemsFor, cabinetTotal, localizeLines } from '../src/planner/bridge.js';
import { splitLeaf, setLeaf, leafBoxes } from '../src/planner/blocks.js';
import { validateCabinet } from '../src/planner/validate.js';
import { elevationScene } from '../src/render/elevation.js';
import { axoScene } from '../src/render/axo.js';

test('shelves: price table bands, series groups, RMB → RM like the rest', () => {
  assert.equal(cnyToMyr(1570), 1235);
  assert.deepEqual(shelfBoards('if25', 'A', 1200).map((b) => [b.w, b.bracket, b.cny]), [[1200, 1, 1570]]);
  assert.deepEqual(shelfBoards('if25', 'A', 1000).map((b) => b.cny), [1070]);   // 刚好 1000 → 第一档
  assert.deepEqual(shelfBoards('if25', 'A', 500).map((b) => b.cny), [1070]);    // 短过 600 → 最小档
  assert.deepEqual(shelfBoards('pin', 'E', 1300).map((b) => b.cny), [970]);
  assert.deepEqual(shelfBoards('heavy50', 'K', 1700).map((b) => b.cny), [3270]);
  assert.deepEqual(shelfBoards('if36', 'H', 2500).map((b) => [b.w, b.cny]), [[1250, 2270], [1250, 2270]]); // 超过 2 m → 2 块
  assert.equal(shelfGroup('C'), 'ABC');
  assert.equal(shelfGroup('J'), 'JK');
});

test('shelves template: 1.20 m × 3 boards, 25 mm hidden pins, series A → 3 × RM 1,235; series follows the door', () => {
  const c = newCabinet('shelf');
  const items = cabinetItemsFor(c);
  assert.equal(items.length, 1);
  assert.equal(items[0].qty, 3);
  assert.equal(cabinetTotal(c), 3 * 1235);
  const ln = localizeLines(items[0], computeItem(items[0]).lines)[0];
  assert.equal(ln.descEn, 'Floating Shelf 25 mm hidden pins, 1.00–1.60 m: A Series');
  assert.ok(!/\p{Script=Han}/u.test(ln.descEn));
  assert.match(ln.descZh, /飘板/);
  const d = { ...c, series: { door: 'D', carcass: 'A' } };
  assert.equal(cabinetTotal(d), 3 * cnyToMyr(1770));
  assert.equal(cabinetTotal(updateSpec(c, { W: 2600, n: 2 })), 2 * 2 * cnyToMyr(1570)); // 2.6 m → 每层 2 块 1.3 m
  assert.ok(validateCabinet(updateSpec(c, { W: 2600 })).some((m) => /按 2 块计价/.test(m.msg.zh)));
  assert.ok(validateCabinet(updateSpec(c, { D: 400 })).some((m) => /飘板深/.test(m.msg.zh)));
});

test('shelves block: a shelf cell inside a cabinet is not priced as cabinet, adds its boards; drawings show boards', () => {
  const c0 = newCabinet('blank', { ceilingH: 2700 });
  let f = splitLeaf(c0.frames[0], '', 'v', 600);
  f = setLeaf(f, '1', { type: 'shelf', shelfKind: 'pin' });
  const box = leafBoxes(f).find((b) => b.path === '1');
  assert.equal(f.body.children[1].shelves, Math.round(box.h / 350));
  const c = { ...c0, frames: [f] };
  const cabOnly = cabinetItemsFor(c).filter((i) => i.kira.part !== 'shelf');
  const shelf = cabinetItemsFor(c).filter((i) => i.kira.part === 'shelf');
  assert.equal(shelf.length, 1);
  assert.equal(shelf[0].qty, f.body.children[1].shelves);
  assert.equal(shelf[0].unitMyr, cnyToMyr(470));
  // 柜子部分 = 只有左边 600 那格（同一整列空位不计价的规则）
  const closedOnly = cabinetItemsFor({ ...c0, frames: [{ ...f, body: { ...f.body, children: [f.body.children[0], { leaf: true, type: 'void' }] } }] });
  assert.deepEqual(cabOnly, closedOnly);
  const el = elevationScene(c, { style: 'drawing' });
  assert.equal(el.shapes.filter((s) => s.role === 'shelf').length, f.body.children[1].shelves);
  assert.ok(elevationScene(c, { style: 'blocks' }).shapes.some((s) => s.role === 'shelf'));
  assert.ok(axoScene(c, { yaw: -30 }).shapes.some((s) => s.part === 'shelf'));
});
