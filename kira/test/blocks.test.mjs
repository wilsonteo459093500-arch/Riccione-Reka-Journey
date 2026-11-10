// 第二版「画框框」纯逻辑：切、拖、删、改；尺寸整数且加起来刚好；每格 ≥100；价钱照同一棵树算。
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { leaf, vsplit, hsplit, bodyHeight } from '../src/planner/model.js';
import { newCabinet, setUnit } from '../src/planner/templates.js';
import { frameQuantities } from '../src/planner/bridge.js';
import {
  leafBoxes, cutLines, leafAt, splitLeaf, carveRect, moveCut, resizeLeaf, removeLeaf, setLeaf, fitBody, setBase,
  checkBody, getNode, MIN_BLOCK, canResize,
} from '../src/planner/blocks.js';

const tall = (body, o = {}) => ({ id: 'f', kind: 'tall', x: 0, y: 0, W: 1200, H: 2100, D: 600, base: { kind: 'plinth', h: 100 }, body, ...o });
const ok = (f) => assert.deepEqual(checkBody(f), []);

test('blocks: leafBoxes paths + cutLines', () => {
  const f = tall(vsplit([600, 600], [leaf('closed'), hsplit([1500, 500], [leaf('closed'), leaf('open')])]));
  const b = leafBoxes(f);
  assert.deepEqual(b.map((x) => [x.path, x.x, x.y, x.w, x.h]), [['0', 0, 0, 600, 2000], ['1.0', 600, 0, 600, 1500], ['1.1', 600, 1500, 600, 500]]);
  assert.deepEqual(cutLines(f), [{ path: '', k: 1, dir: 'v', pos: 600, from: 0, to: 2000 }, { path: '1', k: 1, dir: 'h', pos: 1500, from: 600, to: 1200 }]);
  assert.equal(leafAt(f, 700, 1700), '1.1');
  assert.equal(leafBoxes(tall(leaf('closed')))[0].path, '');
});

test('blocks: splitLeaf halves, inserts into same-direction parent, never mutates', () => {
  const body = vsplit([600, 600], [leaf('closed'), leaf('open', { interior: 'shelves' })]);
  const f = tall(body);
  const snap = JSON.stringify(f);
  const g = splitLeaf(f, '1', 'v');
  assert.equal(JSON.stringify(f), snap);
  assert.deepEqual(g.body.sizes, [600, 300, 300]);
  assert.equal(g.body.children[2].type, 'open');
  assert.equal(g.body.children[2].interior, 'shelves');
  const h = splitLeaf(f, '0', 'h', 700);
  assert.deepEqual(getNode(h.body, '0').sizes, [700, 1300]);
  ok(g); ok(h);
  // 太窄切不了
  const n = tall(vsplit([150, 1050], [leaf('closed'), leaf('closed')]));
  assert.equal(splitLeaf(n, '0', 'v'), n);
});

test('blocks: drawer split by height keeps ≥1 each, proportional', () => {
  const f = tall(leaf('drawer', { drawers: 4, drawerKind: 'half' }), { kind: 'base', H: 850 });
  const g = splitLeaf(f, '', 'h', 200);
  assert.deepEqual(g.body.children.map((c) => c.drawers), [1, 3]);
  const v = splitLeaf(f, '', 'v');
  assert.deepEqual(v.body.children.map((c) => c.drawers), [4, 4]);
});

test('blocks: carveRect makes one open cell, snaps to edges within 60 mm, skips <100 strips', () => {
  const f = tall(leaf('closed'));
  const g = carveRect(f, '', { x: 300, y: 800, w: 600, h: 500 }, { type: 'open' });
  ok(g);
  const boxes = leafBoxes(g);
  const open = boxes.filter((b) => b.node.type === 'open');
  assert.equal(open.length, 1);
  assert.deepEqual([open[0].x, open[0].y, open[0].w, open[0].h], [300, 800, 600, 500]);
  assert.equal(boxes.length, 5);
  // 靠左 40 mm、靠下 50 mm → 贴齐，只切 2 刀
  const h = carveRect(f, '', { x: 40, y: 50, w: 500, h: 700 }, { type: 'open' });
  const o2 = leafBoxes(h).find((b) => b.node.type === 'open');
  assert.deepEqual([o2.x, o2.y, o2.w, o2.h], [0, 0, 540, 750]);
  assert.equal(leafBoxes(h).length, 3);
  // 太小不切
  assert.equal(carveRect(f, '', { x: 100, y: 100, w: 60, h: 400 }), f);
});

test('blocks: moveCut clamps to 100 each side and propagates into nested columns', () => {
  const f = tall(vsplit([600, 600], [hsplit([1000, 1000], [leaf('closed'), vsplit([300, 300], [leaf('closed'), leaf('open')])]), leaf('closed')]));
  const g = moveCut(f, '', 1, 200);
  ok(g);
  assert.deepEqual(g.body.sizes, [800, 400]);
  assert.deepEqual(getNode(g.body, '0.1').sizes, [300, 500]); // 贴着线的那格吸收
  const far = moveCut(f, '', 1, 5000);
  assert.deepEqual(far.body.sizes, [1100, 100]);
  const back = moveCut(f, '', 1, -5000);
  assert.deepEqual(back.body.sizes, [200, 1000]); // 左栏里 2 格 × 100
  ok(far); ok(back);
});

test('blocks: resizeLeaf absorbs right/top neighbour, last cell takes from previous', () => {
  const f = tall(vsplit([400, 400, 400], [leaf('closed'), leaf('open'), leaf('closed')]));
  assert.deepEqual(resizeLeaf(f, '0', 'x', 500).body.sizes, [500, 300, 400]);
  assert.deepEqual(resizeLeaf(f, '2', 'x', 600).body.sizes, [400, 200, 600]);
  assert.equal(canResize(f, '0', 'y'), false);
  assert.equal(resizeLeaf(f, '0', 'y', 900), f);
});

test('blocks: removeLeaf merges into neighbour and collapses single-child splits', () => {
  const f = tall(vsplit([600, 600], [leaf('closed'), hsplit([1500, 500], [leaf('closed'), leaf('open')])]));
  const g = removeLeaf(f, '1.1');
  ok(g);
  assert.equal(g.body.children[1].leaf, true);
  const h = removeLeaf(g, '0');
  assert.equal(h.body.leaf, true);
  assert.equal(removeLeaf(h, ''), h);
});

test('blocks: setLeaf defaults when changing type, series set / cleared', () => {
  const f = tall(hsplit([1000, 1000], [leaf('closed', { interior: 'rod' }), leaf('open')]));
  const d = setLeaf(f, '0', { type: 'drawer' });
  assert.equal(d.body.children[0].drawers, 5);
  assert.equal(d.body.children[0].drawerKind, 'half');
  assert.equal(setLeaf(f, '0', { type: 'drawer' }, { kitchen: true }).body.children[0].drawerKind, 'full');
  const v = setLeaf(f, '1', { type: 'void' });
  assert.equal(v.body.children[1].interior, 'appliance');
  const back = setLeaf(d, '0', { type: 'closed' });
  assert.equal(back.body.children[0].drawers, undefined);
  assert.equal(back.body.children[0].interior, 'shelves');
  assert.equal(setLeaf(f, '0', { type: 'glass' }).body.children[0].interior, 'rod'); // 挂衣杆保留
  const s = setLeaf(f, '1', { series: { door: 'C' } });
  assert.deepEqual(s.body.children[1].series, { door: 'C' });
  assert.equal(setLeaf(s, '1', { series: null }).body.children[1].series, undefined);
});

test('blocks: setBase — body = H − base, tallest cell per column absorbs; wall-hung → h 0', () => {
  const f = tall(vsplit([600, 600], [hsplit([1500, 500], [leaf('closed'), leaf('closed')]), hsplit([400, 1600], [leaf('drawer', { drawers: 2 }), leaf('closed')])]));
  const g = setBase(f, { kind: 'raised', h: 250 });
  ok(g);
  assert.equal(bodyHeight(g), 1850);
  assert.deepEqual(getNode(g.body, '0').sizes, [1350, 500]);
  assert.deepEqual(getNode(g.body, '1').sizes, [400, 1450]);
  const w = setBase(f, { kind: 'wallhung', h: 300 });
  assert.deepEqual(w.base, { kind: 'wallhung', h: 0 });
  assert.equal(bodyHeight(w), 2100); ok(w);
});

test('blocks: fitBody scale keeps proportions and exact sums', () => {
  const f = tall(vsplit([400, 800], [leaf('closed'), hsplit([500, 1500], [leaf('open'), leaf('closed')])]));
  const g = fitBody({ ...f, W: 1500, H: 2500 }, 1500, 2400, 'scale');
  ok({ ...g, W: 1500, H: 2500 });
  assert.deepEqual(g.body.sizes, [500, 1000]);
  assert.deepEqual(getNode(g.body, '1').sizes, [600, 1800]);
});

// 简单可重现的乱数
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

test('blocks: 500 random cut / carve / drag / resize / delete / retype → integer sizes, exact sums, ≥100, priced from the same tree', () => {
  const r = rng(42);
  const pick = (a) => a[Math.floor(r() * a.length)];
  let cab = newCabinet('wardrobe', { ceilingH: 2700 });
  cab = setUnit(cab, 1, { layout: 'drawersHang' });
  let f = cab.frames[0];
  const TYPES = ['closed', 'open', 'glass', 'drawer', 'void'];
  for (let step = 0; step < 500; step++) {
    const boxes = leafBoxes(f);
    const b = pick(boxes);
    const op = Math.floor(r() * 8);
    if (op === 0) f = splitLeaf(f, b.path, pick(['v', 'h']));
    else if (op === 1) f = splitLeaf(f, b.path, pick(['v', 'h']), Math.round(r() * 1200));
    else if (op === 2) f = carveRect(f, b.path, { x: b.x + r() * b.w, y: b.y + r() * b.h, w: (r() - 0.3) * b.w, h: (r() - 0.3) * b.h }, { type: pick(TYPES) });
    else if (op === 3) { const lines = cutLines(f); if (lines.length) { const l = pick(lines); f = moveCut(f, l.path, l.k, Math.round((r() - 0.5) * 800)); } }
    else if (op === 4) f = resizeLeaf(f, b.path, pick(['x', 'y']), Math.round(r() * 1500));
    else if (op === 5 && boxes.length > 3) f = removeLeaf(f, b.path);
    else if (op === 6) f = setLeaf(f, b.path, { type: pick(TYPES) });
    else if (op === 7 && r() < 0.2) f = setBase(f, { kind: pick(['plinth', 'legs', 'raised', 'none']), h: Math.round(r() * 300) });
    assert.deepEqual(checkBody(f), [], `step ${step}`);
    const after = leafBoxes(f);
    after.forEach((x) => {
      assert.ok(Number.isInteger(x.w) && Number.isInteger(x.h), `step ${step}: integer`);
      assert.ok(x.w >= MIN_BLOCK && x.h >= MIN_BLOCK, `step ${step}: ${x.path} ${x.w}×${x.h} < 100`);
    });
    // 价钱照同一棵树：平米柜的封门 + 玻璃 + 开放面积 = 非空格面积 + 并入最下面那格的底座
    const q = frameQuantities(f);
    const strip = ['plinth', 'legs', 'raised'].includes(f.base.kind) ? f.base.h : 0;
    const Hb = bodyHeight(f);
    let area = 0;
    const xs = [...new Set([0, f.W, ...after.flatMap((x) => [x.x, x.x + x.w])])].sort((a, c) => a - c);
    for (let i = 0; i < xs.length - 1; i++) {
      const s = xs[i + 1] - xs[i];
      const col = after.filter((x) => x.x <= xs[i] && x.x + x.w >= xs[i + 1]).sort((a, c) => a.y - c.y);
      if (col.every((x) => x.node.type === 'void')) continue;
      col.forEach((x, j) => { if (x.node.type !== 'void') area += s * (x.h + (j === 0 ? strip : 0)); });
    }
    if (!q.linear) assert.ok(Math.abs(q.q.closed + q.q.glass + q.q.open - area) < 1e-3, `step ${step}: area`);
    assert.ok(Hb > 0);
  }
});
