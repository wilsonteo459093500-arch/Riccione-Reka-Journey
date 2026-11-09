// 积木柜 → 旧工具明细：用旧工具 computeItem / computeQuote 算出来的钱必须符合规则表。
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { computeItem, computeQuote } from '../src/constants/pricing.js';
import { leaf, vsplit, hsplit } from '../src/planner/model.js';
import { frameItems, frameQuantities, deriveZones, resolveSeries, cabinetTotal, mergeLines } from '../src/planner/bridge.js';

const cab = (frames, extra = {}) => ({ id: 'c1', frames, exposed: { left: false, right: false }, ...extra });
const frame = (o) => ({ id: 'f', kind: 'tall', label: 'T', x: 0, y: 0, base: { kind: 'plinth', h: 100 }, ends: { left: true, right: true }, ...o });
const priceFrame = (c, f, defaults) => frameItems(c, f, defaults).reduce((a, it) => a + computeItem(it).total, 0);
const zoneTotal = (c) => computeQuote(deriveZones([{ id: 'z', name: 'Z', items: [], cabinets: [c] }])).net;
const closeTo = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);

test('(a) wardrobe 1200×2100×600 plinth, 2 closed columns + open top 400 → RM 4,067', () => {
  const f = frame({ W: 1200, H: 2100, D: 600,
    body: hsplit([1600, 400], [vsplit([600, 600], [leaf('closed'), leaf('closed')]), leaf('open')]) });
  const c = cab([f]);
  const qq = frameQuantities(f);
  assert.equal(qq.linear, false);
  closeTo(qq.q.closed / 1e6, 2.04);
  closeTo(qq.q.open / 1e6, 0.48);
  closeTo(priceFrame(c, f), 4066.8);
  assert.equal(zoneTotal(c), 4067);
});

test('(b) base 3000×850×600 plinth: 600 drawer column (3 full) + 2400 closed → RM 7,125 (= old tool L 3.0 + 3 drawers)', () => {
  const f = frame({ kind: 'base', W: 3000, H: 850, D: 600,
    body: vsplit([600, 2400], [leaf('drawer', { drawers: 3, drawerKind: 'full' }), leaf('closed')]) });
  const c = cab([f]);
  assert.equal(frameQuantities(f).linear, true);
  closeTo(priceFrame(c, f), 7125);
  const old = computeItem({ type: 'cabinet', cabType: 'base', length: '3', h: 0.85, d: 0.6, doorSeries: 'A', carcassSeries: 'A', drawers: 3 }).total;
  closeTo(priceFrame(c, f), old);
});

test('(c) wall 2400×700×350 wall-hung: one 600 column glass over closed → RM 3,944', () => {
  const f = frame({ kind: 'wall', W: 2400, H: 700, D: 350, base: { kind: 'wallhung', h: 0 }, y: 1500,
    body: vsplit([600, 1800], [hsplit([350, 350], [leaf('closed'), leaf('glass')]), leaf('closed')]) });
  closeTo(priceFrame(cab([f]), f), 3943.5);
  assert.equal(zoneTotal(cab([f])), 3944);
});

test('(d) linear column with open top vs open bottom: both between all-open and all-closed', () => {
  const top = frame({ kind: 'base', W: 600, H: 850, D: 600, body: hsplit([500, 250], [leaf('closed'), leaf('open')]) });
  const bottom = frame({ kind: 'base', W: 600, H: 850, D: 600, body: hsplit([250, 500], [leaf('open'), leaf('closed')]) });
  const closed = frame({ kind: 'base', W: 600, H: 850, D: 600, body: leaf('closed') });
  const open = frame({ kind: 'base', W: 600, H: 850, D: 600, body: leaf('open') });
  const p = (f) => priceFrame(cab([f]), f);
  assert.equal(Math.round(p(top)), 926);
  assert.equal(Math.round(p(bottom)), 911);
  assert.equal(Math.round(p(closed)), 966);
  assert.equal(Math.round(p(open)), 831);
  assert.ok(p(open) < p(bottom) && p(bottom) < p(closed));
  assert.ok(p(open) < p(top) && p(top) < p(closed));
});

test('(e) tall 1200×2100 on legs 120 all closed → RM 4,057 (priced at total height, like the old tool)', () => {
  const f = frame({ W: 1200, H: 2100, D: 600, base: { kind: 'legs', h: 120 }, body: leaf('closed') });
  closeTo(priceFrame(cab([f]), f), 4057.2);
});

test('(f) raised bottom (底层架空) is priced in the total height', () => {
  const f = frame({ W: 1200, H: 1000, D: 350, base: { kind: 'raised', h: 150 }, body: leaf('closed') });
  const old = computeItem({ type: 'cabinet', cabType: 'tall', length: '1.2', h: 1.0, d: 0.35, doorSeries: 'A', carcassSeries: 'A' }).total;
  closeTo(priceFrame(cab([f]), f), old);
});

test('(g) a full-height appliance gap column is not priced (base strip included)', () => {
  const f = frame({ kind: 'base', W: 1200, H: 850, D: 600, body: vsplit([600, 600], [leaf('void'), leaf('closed')]) });
  closeTo(priceFrame(cab([f]), f), 0.6 * 1610);
});

test('(h) all-closed frame ≡ old tool cabinet item (300 random sizes, linear + area, plinth/legs/wall-hung)', () => {
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 300; i++) {
    const W = 300 + Math.round(rnd() * 5000), H = 300 + Math.round(rnd() * 2600), D = 300 + Math.round(rnd() * 400);
    const kind = ['plinth', 'legs', 'wallhung'][i % 3];
    const f = frame({ kind: H < 1000 ? 'base' : 'tall', W, H, D, base: { kind, h: kind === 'wallhung' ? 0 : 100 }, body: leaf('closed') });
    const ser = ['A', 'B', 'C'][i % 3];
    const c = cab([f], { series: { door: ser, carcass: ser } });
    const old = computeItem({ type: 'cabinet', cabType: 'tall', length: W / 1000, h: H / 1000, d: D / 1000, doorSeries: ser, carcassSeries: ser }).total;
    closeTo(priceFrame(c, f), old, 1e-6);
  }
});

test('(i) all-open frame ≡ old tool open cabinet item', () => {
  const f = frame({ W: 1200, H: 2000, D: 350, base: { kind: 'none', h: 0 }, body: leaf('open') });
  const c = cab([f], { series: { door: 'D', carcass: 'A' } });
  const old = computeItem({ type: 'cabinet', cabType: 'open', length: '1.2', h: 2.0, d: 0.35, hasDoor: false, hasCarcass: false, hasOpen: true, openSeries: 'D' }).total;
  closeTo(priceFrame(c, f), old); // 开放格系列跟门板（D）
  assert.equal(frameItems(c, f)[0].cabType, 'open');
});

test('(j) depth deeper than height keeps the old L×max(H,D) rule (500×1000×1200 → 966)', () => {
  const f = frame({ W: 500, H: 1000, D: 1200, base: { kind: 'none', h: 0 }, body: leaf('closed') });
  closeTo(priceFrame(cab([f]), f), 966);
});

test('(k) exposed sides add 见光板 D×H at the door-series panel rate', () => {
  const f = frame({ W: 2400, H: 2700, D: 600, body: leaf('closed') });
  const c = cab([f], { exposed: { left: true, right: true } });
  const panels = frameItems(c, f).filter((it) => it.type === 'panel');
  assert.equal(panels.length, 2);
  panels.forEach((p) => closeTo(computeItem(p).total, 0.6 * 2.7 * 530));
  const one = cab([f], { exposed: { left: true, right: false } });
  assert.equal(frameItems(one, f).filter((it) => it.type === 'panel').length, 1);
});

test('(l) glass door uses the old coef table (default 1.5 on door only); coef can be changed', () => {
  const f = frame({ W: 600, H: 2100, D: 600, body: leaf('glass') });
  const g = frameItems(cab([f]), f)[0];
  assert.equal(g.coef, 1.5);
  assert.equal(g.coefTarget, 'door');
  closeTo(computeItem(g).total, 1.26 * (795 + 1080));
  closeTo(computeItem(frameItems(cab([f], { glassCoef: 2.5 }), f)[0]).total, 1.26 * (1325 + 1080));
});

test('(m) drawers: full vs half counted per leaf', () => {
  const f = frame({ W: 1200, H: 2100, D: 600, body: vsplit([600, 600], [
    hsplit([600, 1400], [leaf('drawer', { drawers: 3, drawerKind: 'half' }), leaf('closed')]),
    hsplit([400, 1600], [leaf('drawer', { drawers: 2, drawerKind: 'full' }), leaf('closed')]) ]) });
  const it = frameItems(cab([f]), f)[0];
  assert.equal(it.drawersHalf, 3);
  assert.equal(it.drawers, 2);
});

test('(n) series: cabinet > quote default > A; carcass only A–C; open follows the door', () => {
  assert.deepEqual(resolveSeries({ series: null }, {}), { door: 'A', carcass: 'A', open: 'A' });
  assert.deepEqual(resolveSeries({ series: null }, { door: 'E', carcass: 'B' }), { door: 'E', carcass: 'B', open: 'E' });
  assert.deepEqual(resolveSeries({ series: { door: 'C', carcass: 'D' } }, { door: 'E', carcass: 'B' }), { door: 'C', carcass: 'B', open: 'C' });
  assert.deepEqual(resolveSeries({ series: { door: 'C', open: 'A' } }, {}), { door: 'C', carcass: 'A', open: 'A' });
});

test('(o) derived items never get a discount exclusion by accident; manual items keep theirs', () => {
  const f = frame({ W: 1000, H: 2100, D: 600, label: 'Sintered 岩板 wall', body: leaf('closed') });
  const c = cab([f]);
  frameItems(c, f).forEach((it) => assert.equal(it.noDiscount, false));
  const q = computeQuote(deriveZones([{ id: 'z', name: 'Z', cabinets: [c], items: [{ id: 'm', type: 'other', desc: 'Sintered stone', qty: '1', unitMyr: 1000 }] }]), 10);
  assert.equal(q.excluded, 1000);
});

test('(p) deriveZones puts cabinet items first, manual items after, zone without cabinets unchanged', () => {
  const f = frame({ W: 600, H: 2100, D: 600, body: leaf('closed') });
  const z = { id: 'z', name: 'Z', items: [{ id: 'm', type: 'led', length: '1' }], cabinets: [cab([f])] };
  const [d] = deriveZones([z]);
  assert.equal(d.items[0].kira.cabinetId, 'c1');
  assert.equal(d.items[d.items.length - 1].id, 'm');
  const plain = { id: 'y', name: 'Y', items: [] };
  assert.equal(deriveZones([plain])[0], plain);
});

test('(q) cabinetTotal sums its own items; mergeLines merges same carcass price lines', () => {
  const f = frame({ W: 1200, H: 2100, D: 600, body: vsplit([600, 600], [leaf('closed'), leaf('glass')]) });
  const c = cab([f]);
  closeTo(cabinetTotal(c), priceFrame(c, f));
  const lines = frameItems(c, f).flatMap((it) => computeItem(it).lines);
  const merged = mergeLines(lines);
  assert.equal(merged.filter((l) => l.bucket === 'carcass').length, 1);
  closeTo(merged.reduce((a, l) => a + l.total, 0), lines.reduce((a, l) => a + l.total, 0));
});

test('(r) L-shape corner: second wall measured to the corner — corner width is priced on both walls', () => {
  // 墙A 3.0 m 到墙角；墙B 2.4 m 到墙角 → 实物 1.8 m（转角 600 归墙A），价钱按 3.0 + 2.4 延米（同旧工具 3+2.4）
  const a = frame({ id: 'a', kind: 'base', W: 3000, H: 850, D: 600, body: leaf('closed') });
  const b = frame({ id: 'b', kind: 'base', W: 1800, H: 850, D: 600, x: 600, cornerW: 600, body: leaf('closed') });
  const c = cab([a, b]);
  const old = computeItem({ type: 'cabinet', cabType: 'base', length: '3+2.4', h: 0.85, d: 0.6, doorSeries: 'A', carcassSeries: 'A' }).total;
  closeTo(priceFrame(c, a) + priceFrame(c, b), old);
});
