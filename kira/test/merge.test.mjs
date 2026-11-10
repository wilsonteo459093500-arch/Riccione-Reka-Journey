// 第二版：改模板设定时保留手画的框框（三方合并）
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { newCabinet, updateSpec, updateSpecKeep, buildFrames } from '../src/planner/templates.js';
import { splitLeaf, setLeaf, getNode, checkBody, moveCut } from '../src/planner/blocks.js';
import { bodyHeight } from '../src/planner/model.js';

const edit = (cab, i, fn) => ({ ...cab, custom: true, frames: cab.frames.map((f, k) => (k === i ? fn(f) : f)) });
const ok = (c) => c.frames.forEach((f) => assert.deepEqual(checkBody(f), [], f.id));

test('merge: wardrobe — split a block in column 3, then change top-box height → split kept, new top height applied', () => {
  let c = newCabinet('wardrobe', { ceilingH: 2700 });
  c = edit(c, 0, (f) => setLeaf(splitLeaf(f, '2.0', 'v'), '2.0.1', { type: 'open' }));
  const { cab, rebuilt } = updateSpecKeep(c, { topH: 600 });
  ok(cab);
  assert.deepEqual(rebuilt, []);
  assert.equal(cab.custom, true);
  const f = cab.frames[0];
  assert.deepEqual(getNode(f.body, '2').sizes, [2000, 600]);        // 新顶柜高
  assert.equal(getNode(f.body, '2.0').split, 'v');                  // 手切的还在
  assert.equal(getNode(f.body, '2.0.1').type, 'open');
  assert.deepEqual(getNode(f.body, '0').sizes, [2000, 600]);
});

test('merge: change one column unit → that column follows the template, hand-drawn columns stay', () => {
  let c = newCabinet('wardrobe', { ceilingH: 2700 });
  c = edit(c, 0, (f) => setLeaf(f, '3.0', { type: 'glass', series: { door: 'C' } }));
  const units = c.spec.units.map((u, i) => (i === 0 ? { layout: 'open' } : u));
  const { cab, rebuilt } = updateSpecKeep(c, { units });
  assert.deepEqual(rebuilt, []);
  assert.equal(getNode(cab.frames[0].body, '0.0').type, 'open');
  assert.deepEqual(getNode(cab.frames[0].body, '3.0').series, { door: 'C' });
});

test('merge: width change that changes the door count → rebuilt from the template (reported); same count → blocks scale', () => {
  let c = newCabinet('wardrobe', { ceilingH: 2700 });
  c = edit(c, 0, (f) => splitLeaf(f, '1.0', 'h'));
  const a = updateSpecKeep(c, { W: 2300 }); // 仍是 4 扇
  ok(a.cab);
  assert.deepEqual(a.rebuilt, []);
  assert.equal(getNode(a.cab.frames[0].body, '1').children.length, 3); // 横切插进同方向的那一栏：3 格
  assert.equal(a.cab.frames[0].body.sizes.reduce((x, y) => x + y, 0), 2300);
  const b = updateSpecKeep(c, { W: 3000 }); // 5 扇 → 结构变了
  assert.deepEqual(b.rebuilt, [c.frames[0].id]);
  assert.deepEqual(b.cab.frames, updateSpec(c, { W: 3000 }).frames);
  assert.equal(b.cab.custom, undefined);
});

test('merge: dragged divider keeps its sizes (scaled) when the height changes; hand-changed base kept', () => {
  let c = newCabinet('wardrobe', { ceilingH: 2700 });
  c = edit(c, 0, (f) => moveCut(f, '', 1, 200));
  const { cab } = updateSpecKeep(c, { H: 2500 });
  ok(cab);
  assert.deepEqual(cab.frames[0].body.sizes, [800, 400, 600, 600]);
  assert.equal(bodyHeight(cab.frames[0]), 2400);
});

test('merge: kitchen — hand-edited wall A base survives a wall B length change and an upper-height change', () => {
  let c = updateSpec(newCabinet('kitchen'), { shape: 'L', walls: [{ len: 3000 }, { len: 2400 }] });
  const i = c.frames.findIndex((f) => f.id.endsWith('-w0-base'));
  c = edit(c, i, (f) => setLeaf(splitLeaf(f, '1', 'h', 300), '1.0', { type: 'drawer' }));
  const walls = c.spec.walls.map((w, k) => (k === 1 ? { ...w, len: 2800 } : w));
  const { cab, rebuilt } = updateSpecKeep(c, { walls, upperH: 800 });
  ok(cab);
  assert.deepEqual(rebuilt, []);
  const f = cab.frames.find((x) => x.id.endsWith('-w0-base'));
  assert.equal(getNode(f.body, '1.0').type, 'drawer');
  assert.equal(cab.frames.find((x) => x.id.endsWith('-w1-base')).W, updateSpec(c, { walls }).frames.find((x) => x.id.endsWith('-w1-base')).W);
  assert.equal(cab.frames.find((x) => x.id.endsWith('-w0-upper')).H, 800);
});

test('merge: not hand-drawn → exactly the template (no custom flag)', () => {
  const c = newCabinet('wardrobe', { ceilingH: 2700 });
  const { cab } = updateSpecKeep({ ...c, custom: true }, { topH: 600 });
  assert.deepEqual(cab.frames, buildFrames({ ...c, spec: cab.spec }));
  assert.equal(cab.custom, undefined);
});
