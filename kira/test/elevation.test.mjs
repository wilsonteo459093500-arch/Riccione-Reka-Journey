// 线稿立面图 elevationScene：纯数据输出（viewBox + shapes），在 Node 里测。
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { elevationScene } from '../src/render/elevation.js';
import { newCabinet, setUnit, updateSpec } from '../src/planner/templates.js';
import { leaf, vsplit, hsplit } from '../src/planner/model.js';
import { BLOCK_COLORS, finishOf } from '../src/render/palette.js';

const frame = (o) => ({ id: 'f', kind: 'tall', label: 'T', wall: 0, x: 0, y: 0, W: 1200, H: 2100, D: 600,
  base: { kind: 'plinth', h: 100 }, ends: { left: true, right: true }, body: leaf('closed'), ...o });
const cab = (frames, extra = {}) => ({ id: 'c', code: 'K9', template: 'wardrobe', spec: { W: 0 }, frames,
  finish: { door: null, carcass: null }, handle: 'bar', view: { yaw: -30 }, ...extra });

// ---------- 样例 ----------
const wardrobe = () => newCabinet('wardrobe', { ceilingH: 2700 }); // 2400 宽 4 门
const wardrobeMixed = () => {
  let c = wardrobe();
  c = setUnit(c, 1, { layout: 'drawersHang' });
  c = setUnit(c, 2, { layout: 'glass' });
  c = setUnit(c, 3, { layout: 'open' });
  return c;
};
const kitchenBase = (o = {}) => frame({ kind: 'base', W: 3600, H: 850, D: 600, worktop: true,
  body: vsplit([600, 900, 900, 600, 600], [leaf('drawer', { drawers: 3 }), leaf('closed', { interior: 'sink' }),
    leaf('closed', { interior: 'hob' }), leaf('void'), leaf('closed', { interior: 'shelves' })]), ...o });
const wallHung = (o = {}) => frame({ kind: 'wall', W: 2400, H: 750, D: 350, y: 1500, base: { kind: 'wallhung', h: 0 },
  body: vsplit([600, 1800], [hsplit([375, 375], [leaf('closed'), leaf('glass', { interior: 'shelves' })]), leaf('closed')]), ...o });
const kitchen = () => cab([kitchenBase(), wallHung({ W: 3600, body: vsplit([1800, 1800], [leaf('glass'), leaf('closed')]) })], { code: 'K2' });
const tv = () => cab([frame({ kind: 'wall', W: 1800, H: 400, D: 400, y: 250, base: { kind: 'wallhung', h: 0 },
  body: vsplit([600, 600, 600], [leaf('drawer', { drawers: 2 }), leaf('open', { interior: 'shelves' }), leaf('closed')]) })],
{ code: 'K3', handle: 'push', finish: { door: 'walnut', carcass: null } });
const shoe = () => cab([frame({ W: 1200, H: 2100, D: 380, base: { kind: 'raised', h: 150 },
  body: hsplit([900, 350, 700], [leaf('closed', { interior: 'shelves' }), leaf('open'), leaf('closed', { interior: 'shelves' })]) })],
{ code: 'K4', handle: 'knob' });
const legs = () => cab([frame({ kind: 'base', W: 2000, H: 800, base: { kind: 'legs', h: 150 },
  body: vsplit([1000, 1000], [leaf('drawer', { drawers: 2 }), leaf('glass')]) })], { handle: 'hidden', finish: { door: 'charcoal' } });
const twoWalls = () => cab([
  kitchenBase({ wall: 0, W: 2400, body: vsplit([600, 1800], [leaf('drawer', { drawers: 3 }), leaf('closed', { interior: 'sink' })]) }),
  frame({ kind: 'base', wall: 1, x: 600, W: 1800, H: 850, worktop: true, body: vsplit([900, 900], [leaf('closed', { interior: 'hob' }), leaf('void')]) }),
  frame({ kind: 'tall', wall: 1, x: 2400, W: 600, H: 2300, body: hsplit([700, 1100, 500], [leaf('drawer', { drawers: 2 }), leaf('void'), leaf('closed')]) }),
], { code: 'K6' });
const twoWallsOverride = [{ ox: 0, oz: 0, angle: 0, len: 2400 }, { ox: 2400, oz: 0, angle: 90, len: 3000 }];

const FIXTURES = [
  ['wardrobe', wardrobe, {}], ['wardrobe mixed', wardrobeMixed, {}], ['kitchen', kitchen, {}], ['tv', tv, {}],
  ['shoe', shoe, {}], ['legs', legs, {}], ['two walls', twoWalls, { walls: twoWallsOverride }],
];

// ---------- 工具 ----------
function assertAllFinite(v, path = 'scene') {
  if (typeof v === 'number') return assert.ok(Number.isFinite(v), `${path} = ${v}`);
  if (typeof v === 'string') return assert.ok(!/NaN|Infinity|undefined/.test(v), `${path} = "${v}"`);
  if (Array.isArray(v)) return v.forEach((x, i) => assertAllFinite(x, `${path}[${i}]`));
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) assertAllFinite(x, `${path}.${k}`);
}
const role = (sc, r, t) => sc.shapes.filter((s) => s.role === r && (!t || s.t === t));
const texts = (sc) => sc.shapes.filter((s) => s.t === 'text').map((s) => s.text);
const SHAPE_KEYS = {
  rect: ['x', 'y', 'w', 'h'], line: ['x1', 'y1', 'x2', 'y2'], circle: ['cx', 'cy', 'r'], path: ['d'], poly: ['points'], text: ['x', 'y', 'text', 'size'],
};

// ---------- 测试 ----------
test('every fixture / style / lang: finite positive viewBox, shapes, no NaN anywhere', () => {
  for (const [name, make, base] of FIXTURES) {
    for (const style of ['drawing', 'blocks']) {
      for (const dims of [true, false]) {
        for (const lang of ['en', 'zh', 'both']) {
          const sc = elevationScene(make(), { ...base, style, dims, lang });
          const tag = `${name}/${style}/${dims}/${lang}`;
          assert.equal(sc.viewBox.length, 4, tag);
          sc.viewBox.forEach((v) => assert.ok(Number.isFinite(v), tag));
          assert.ok(sc.viewBox[2] > 0 && sc.viewBox[3] > 0, tag);
          assert.ok(sc.shapes.length > 0, tag);
          assertAllFinite(sc, tag);
          for (const s of sc.shapes) {
            assert.ok(SHAPE_KEYS[s.t], `${tag}: unknown shape ${s.t}`);
            for (const k of SHAPE_KEYS[s.t]) assert.ok(s[k] !== undefined, `${tag}: ${s.t}.${k}`);
            if (s.t === 'rect') assert.ok(s.w >= 0 && s.h >= 0, tag);
            if (s.t !== 'text') assert.ok(s.sw >= 0, tag);
          }
        }
      }
    }
  }
});

test('viewBox contains every shape (incl. floor at y = 0 and the frame top at y = −H)', () => {
  const sc = elevationScene(wardrobe());
  const [x, y, w, h] = sc.viewBox;
  for (const s of sc.shapes) {
    if (s.t === 'rect') assert.ok(s.x >= x && s.y >= y && s.x + s.w <= x + w && s.y + s.h <= y + h, JSON.stringify(s));
    if (s.t === 'line') assert.ok(Math.min(s.x1, s.x2) >= x && Math.max(s.y1, s.y2) <= y + h, JSON.stringify(s));
  }
  const outline = role(sc, 'outline', 'rect')[0];
  assert.equal(outline.y, -2700); // 柜顶 2700
  assert.equal(outline.y + outline.h, -100); // 柜身底 = 踢脚 100
  assert.ok(role(sc, 'floor', 'line').every((l) => l.y1 === 0 && l.y2 === 0));
});

test('2400 wardrobe with 4 doors → at least 4 door-front rects (4 tall + 4 top-box doors)', () => {
  const c = wardrobe();
  assert.equal(c.spec.doors, 4);
  const doors = role(elevationScene(c), 'door', 'rect');
  assert.ok(doors.length >= 4);
  assert.equal(doors.length, 8);
  for (const d of doors) assert.ok(d.w <= 600);
});

test('a 1200-wide single closed leaf becomes 2 door leaves (pair, hinged outwards)', () => {
  const sc = elevationScene(cab([frame({ W: 1200, body: leaf('closed') })]));
  const doors = role(sc, 'door', 'rect');
  assert.equal(doors.length, 2);
  assert.ok(Math.abs(doors[0].w - doors[1].w) < 0.2);
  assert.ok(doors[0].x + doors[0].w < doors[1].x); // 中间有门缝
  // V 线尖头：左门指向左边、右门指向右边
  const sw = role(sc, 'swing', 'line');
  assert.equal(sw.length, 4);
  assert.ok(sw[0].x2 < doors[0].x + doors[0].w / 2);
  assert.ok(sw[2].x2 > doors[1].x + doors[1].w / 2);
  // 1300 → 3 doors
  assert.equal(role(elevationScene(cab([frame({ W: 1300 })])), 'door', 'rect').length, 3);
  // 600 → 1 door
  assert.equal(role(elevationScene(cab([frame({ W: 600 })])), 'door', 'rect').length, 1);
});

test('drawer leaf with 3 drawers → 3 drawer fronts stacked, each with a handle', () => {
  const sc = elevationScene(cab([frame({ kind: 'base', W: 600, H: 850, body: leaf('drawer', { drawers: 3 }) })], { handle: 'bar' }));
  const fronts = role(sc, 'drawer', 'rect');
  assert.equal(fronts.length, 3);
  const ys = fronts.map((f) => f.y).sort((a, b) => a - b);
  assert.ok(ys[0] < ys[1] && ys[1] < ys[2]);
  assert.equal(role(sc, 'handle').length, 3);
  // wardrobe drawersHang unit → 3 drawers too
  assert.equal(role(elevationScene(setUnit(wardrobe(), 0, { layout: 'drawersHang' })), 'drawer', 'rect').length, 3);
});

test('handles follow cab.handle: push → none, knob → circles, bar → rects, hidden → shadow lines', () => {
  const mk = (handle) => elevationScene(cab([frame({ W: 1200, body: vsplit([600, 600], [leaf('closed'), leaf('drawer', { drawers: 2 })]) })], { handle }));
  assert.equal(role(mk('push'), 'handle').length, 0);
  assert.ok(role(mk('knob'), 'handle').every((s) => s.t === 'circle'));
  assert.ok(role(mk('bar'), 'handle').every((s) => s.t === 'rect'));
  assert.ok(role(mk('hidden'), 'handle').every((s) => s.t === 'line'));
  assert.equal(role(mk('knob'), 'handle').length, 3);
});

test("'blocks' style: BLOCK_COLORS fills, labels, no swing lines / interior / door fronts", () => {
  const sc = elevationScene(wardrobeMixed(), { style: 'blocks' });
  const fills = new Set(role(sc, 'block', 'rect').map((s) => s.fill));
  for (const t of ['closed', 'glass', 'open', 'drawer']) assert.ok(fills.has(BLOCK_COLORS[t]), t);
  for (const r of ['swing', 'interior', 'door', 'drawer', 'handle', 'glass']) assert.equal(role(sc, r).length, 0, r);
  const tx = texts(sc);
  for (const zh of ['封闭区', '玻璃柜体区', '开放区']) assert.ok(tx.includes(zh), zh);
  assert.ok(tx.some((t) => t.startsWith('抽屉区')));
  const k = elevationScene(kitchen(), { style: 'blocks', lang: 'zh' });
  assert.ok(role(k, 'block', 'rect').some((s) => s.fill === BLOCK_COLORS.void));
  assert.ok(texts(k).includes('空位'));
});

test("'drawing' style: fronts use a light tint of the door finish; glass panes use GLASS", () => {
  const c = wardrobeMixed();
  c.finish = { door: 'walnut', carcass: null };
  const sc = elevationScene(c);
  const door = role(sc, 'door', 'rect')[0];
  assert.notEqual(door.fill, finishOf('walnut').hex);
  const lum = (h) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
  assert.ok(lum(door.fill) > lum(finishOf('walnut').hex)); // 更浅
  assert.ok(role(sc, 'glass', 'rect').length >= 1);
  assert.ok(role(sc, 'swing', 'line').every((l) => l.dash));
});

test('dims (default on): overall width, height, column widths; dims:false removes every dimension text', () => {
  const on = elevationScene(wardrobe());
  const dimTexts = role(on, 'dim', 'text').map((s) => s.text);
  assert.ok(dimTexts.includes('2400'));
  assert.ok(dimTexts.includes('2700'));
  assert.equal(dimTexts.filter((t) => t === '600').length, 4);
  const off = elevationScene(wardrobe(), { dims: false });
  assert.equal(role(off, 'dim').length, 0);
  assert.ok(!texts(off).some((t) => /^↑?\d+$/.test(t)));
  // single column → no column chain
  assert.ok(!role(elevationScene(cab([frame({ W: 600 })])), 'dim', 'text').some((s) => s.text === '600' && s.rotate == null && s.y > 0));
});

test('cabinet code at the top-left in bold; illustrative note respects lang', () => {
  const sc = elevationScene(wardrobe());
  const code = sc.shapes.find((s) => s.role === 'code');
  assert.equal(code.text, 'K1');
  assert.equal(code.weight, 700);
  const others = sc.shapes.filter((s) => s.t === 'text' && s !== code);
  assert.ok(others.every((s) => s.y >= code.y));
  assert.ok(texts(sc).includes('Illustrative 仅示意'));
  assert.ok(texts(elevationScene(wardrobe(), { lang: 'en' })).includes('Illustrative'));
  assert.ok(texts(elevationScene(wardrobe(), { lang: 'zh' })).includes('仅示意'));
});

test('kitchen base: worktop wider than the frame, appliance gap label, sink + hob fixtures', () => {
  const sc = elevationScene(cab([kitchenBase()]), { lang: 'en' });
  const wt = role(sc, 'worktop', 'rect')[0];
  assert.equal(wt.w, 3600 + 40);
  assert.equal(wt.h, 30);
  assert.equal(wt.y, -880);
  assert.ok(texts(sc).includes('Appliance'));
  assert.ok(role(sc, 'void').length === 1 && role(sc, 'void')[0].dash);
  assert.ok(role(sc, 'fixture').length >= 3);
  assert.ok(texts(elevationScene(cab([kitchenBase()]), { lang: 'zh' })).includes('电器位'));
});

test('wall-hung frame floats at frame.y with mount height ↑1500; TV unit ↑250', () => {
  const sc = elevationScene(cab([wallHung()]));
  const outline = role(sc, 'outline', 'rect')[0];
  assert.equal(outline.y + outline.h, -1500);
  assert.equal(outline.y, -2250);
  assert.ok(texts(sc).includes('↑1500'));
  assert.ok(texts(elevationScene(tv())).includes('↑250'));
  assert.ok(!texts(elevationScene(tv(), { dims: false })).includes('↑250'));
});

test('base kinds: legs every ≤1000, raised base keeps side panels to the floor, plinth strip', () => {
  const lg = role(elevationScene(legs()), 'base', 'rect');
  assert.equal(lg.length, 3);
  assert.ok(lg.every((r) => r.y + r.h === 0 && r.h === 150));
  const raised = role(elevationScene(shoe()), 'base', 'rect');
  assert.ok(raised.filter((r) => r.h === 150 && r.w <= 18).length === 2);
  const pl = role(elevationScene(wardrobe()), 'base', 'rect');
  assert.ok(pl.some((r) => r.h === 100 && r.y === -100 && r.w > 2000));
});

test('multi-wall: unfolded left → right with a gap, wall labels only when > 1 wall', () => {
  const sc = elevationScene(twoWalls(), { walls: twoWallsOverride });
  const tx = texts(sc);
  assert.ok(tx.includes('Wall A 墙A'));
  assert.ok(tx.includes('Wall B 墙B'));
  const en = texts(elevationScene(twoWalls(), { walls: twoWallsOverride, lang: 'en' }));
  assert.ok(en.includes('Wall A') && en.includes('Wall B'));
  // wall B 的柜体整体在 wall A 右边，至少隔 400
  const outlines = role(sc, 'outline', 'rect');
  assert.equal(outlines.length, 3);
  const a = outlines[0], b = outlines[1];
  assert.ok(b.x >= a.x + a.w + 400 + 600 - 1); // wall B 上第一个柜子在 x=600
  assert.ok(!texts(elevationScene(wardrobe())).some((t) => t.startsWith('Wall ')));
  // frames only on wall 1 → shown alone, no wall label
  const one = cab([frame({ wall: 1 })]);
  assert.ok(!texts(elevationScene(one, { walls: twoWallsOverride })).some((t) => t.startsWith('Wall ')));
});

test('strokes and fonts scale with the drawing (600 cabinet vs 6 m kitchen look alike in a thumbnail)', () => {
  const small = elevationScene(cab([frame({ W: 600, H: 900 })]));
  const big = elevationScene(cab([kitchenBase({ W: 6000, body: leaf('closed') })]));
  const rel = (sc, pick) => pick(sc) / Math.max(sc.viewBox[2], sc.viewBox[3]);
  const out = (sc) => role(sc, 'outline', 'rect')[0].sw;
  const dimSize = (sc) => role(sc, 'dim', 'text')[0].size;
  for (const pick of [out, dimSize]) {
    const r = rel(small, pick) / rel(big, pick);
    assert.ok(r > 0.6 && r < 1.6, `ratio ${r}`);
  }
});

test('deterministic: same input → deep-equal output', () => {
  for (const [, make, base] of FIXTURES) {
    const c = make();
    assert.deepEqual(elevationScene(c, base), elevationScene(c, base));
    assert.deepEqual(elevationScene(c, { ...base, style: 'blocks' }), elevationScene(c, { ...base, style: 'blocks' }));
  }
});

test('does not mutate the cabinet', () => {
  const c = twoWalls();
  const before = JSON.stringify(c);
  elevationScene(c, { walls: twoWallsOverride });
  assert.equal(JSON.stringify(c), before);
});

test('garbage in → still a valid scene (no NaN)', () => {
  const cases = [
    null, {}, cab([]), cab([{}]), cab([null, frame({ W: NaN, H: 'x' })]),
    cab([frame({ body: null })]), cab([frame({ body: vsplit([600], [leaf('closed'), leaf('open')]) })]),
    cab([frame({ W: 10, H: 10, body: leaf('drawer', { drawers: 99 }) })]),
    cab([frame({ wall: -3, x: -500, base: { kind: 'weird', h: -5 }, body: leaf('mystery') })]),
  ];
  for (const c of cases) {
    for (const style of ['drawing', 'blocks']) {
      const sc = elevationScene(c, { style });
      assertAllFinite(sc);
      assert.ok(sc.viewBox[2] > 0 && sc.viewBox[3] > 0);
      assert.ok(sc.shapes.length > 0);
    }
  }
});

test('malformed body trees (no children, string sizes) neither throw nor leak string coordinates', () => {
  const bodies = [{}, { split: 'v', sizes: [600, 600] }, { split: 'v', sizes: ['600', '600'], children: [leaf('open'), leaf('closed')] }];
  for (const body of bodies) {
    for (const style of ['drawing', 'blocks']) {
      const sc = elevationScene(cab([frame({ body })]), { style });
      assertAllFinite(sc);
      for (const s of sc.shapes) {
        for (const k of ['x', 'y', 'w', 'h', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'size']) if (k in s) assert.equal(typeof s[k], 'number', `${k}=${s[k]}`);
      }
      assert.ok(sc.viewBox[2] < 3000, `viewBox ${sc.viewBox}`);
    }
  }
  const sc = elevationScene(cab([frame({ body: bodies[2] })]));
  assert.equal(role(sc, 'door', 'rect').length, 1); // open 600 + closed 600 → one door
  assert.equal(role(sc, 'outline', 'rect')[0].w, 1200);
});

test('oven position is drawn as an appliance front (as in 3D), not a hinged door', () => {
  const sc = elevationScene(cab([frame({ W: 600, H: 2250, body: hsplit([700, 600, 850], [leaf('drawer', { drawers: 2 }), leaf('closed', { interior: 'oven' }), leaf('closed')]) })]));
  assert.equal(role(sc, 'door', 'rect').length, 1); // only the top door
  assert.ok(role(sc, 'fixture', 'rect').some((r) => r.fill === '#3A3B3A' && r.h > 500));
  assert.equal(role(sc, 'swing', 'line').length, 2);
});

test('dimensions are never written on top of another cabinet (TV between towers, kitchens with a tall unit)', () => {
  const cases = [
    updateSpec(newCabinet('tv'), { sides: { on: true, which: 'both' }, upper: { on: true } }),
    updateSpec(newCabinet('kitchen'), { shape: 'L', tall: { on: true, end: 'end', kind: 'fridgeTop' } }),
    updateSpec(newCabinet('kitchen'), { shape: 'U', tall: { on: true, end: 'start', kind: 'oven' } }),
    updateSpec(newCabinet('kitchen'), { shape: 'galley', tall: { on: true, kind: 'fridgeGap' } }),
  ];
  for (const c of cases) {
    const sc = elevationScene(c);
    const bodies = role(sc, 'outline', 'rect');
    for (const t of role(sc, 'dim', 'text')) {
      for (const b of bodies) {
        const inside = t.x > b.x + 1 && t.x < b.x + b.w - 1 && t.y > b.y + 1 && t.y < b.y + b.h - 1;
        assert.ok(!inside, `${c.template}: dim "${t.text}" at ${t.x},${t.y} inside cabinet ${JSON.stringify(b)}`);
      }
    }
  }
  // TV between towers: the low / top cabinet heights still appear (in a chain outside the right tower)
  const tvTexts = role(elevationScene(cases[0]), 'dim', 'text').map((s) => s.text);
  assert.ok(tvTexts.filter((t) => t === '400').length >= 2, tvTexts.join(' '));
  assert.ok(tvTexts.includes('2700'));
});

test('side panels follow cab.exposed like the price and the 3D (switched-off side not drawn)', () => {
  const one = (exposed) => cab([frame({})], exposed ? { exposed } : {});
  const plinthRects = (c) => role(elevationScene(c), 'base', 'rect').length;
  const both = plinthRects(one(null));
  assert.equal(plinthRects(one({ left: true, right: true })), both);
  assert.equal(plinthRects(one({ left: false, right: true })), both - 1);
  assert.equal(plinthRects(one({ left: false, right: false })), both - 2);
  // kitchen ends 'start' / 'end' map to exposed.left / right
  const k = cab([frame({ ends: { left: 'start', right: false } })], { exposed: { left: false, right: true } });
  assert.equal(plinthRects(k), both - 2);
});

test('gaps are labelled by what goes there (hood / fridge / appliance)', () => {
  const labels = (c) => role(elevationScene(c, { lang: 'zh' }), 'label', 'text').map((s) => s.text).join(' ');
  assert.match(labels(updateSpec(newCabinet('kitchen'), { tall: { on: true, end: 'end', kind: 'fridgeGap' } })), /冰箱位/);
  const hood = cab([frame({ kind: 'wall', W: 1800, H: 750, D: 350, y: 1500, base: { kind: 'wallhung', h: 0 },
    body: vsplit([600, 600, 600], [leaf('closed'), leaf('void', { interior: 'hood' }), leaf('closed')]) })]);
  assert.match(labels(hood), /烟机位/);
  assert.match(labels(cab([frame({ body: leaf('void', { interior: 'appliance' }) })])), /电器位/);
});

// 厨房墙太短只剩转角（finding 0）：宽 0 的柜体只为了计价，立面图不画它、也不让它挪动排墙 / 台面出挑
test('kitchen corner-only frames (W = 0 + cornerW) draw nothing extra: no NaN, same drawing as without them', () => {
  const OVEN = { on: true, end: 'end', kind: 'oven', W: 600 };
  const cases = [['L', [3000, 1200], OVEN], ['L', [3000, 900], OVEN], ['L', [3000, 600], OVEN], ['U', [3000, 2400, 600], { on: false }], ['U', [3000, 2400, 1100], { ...OVEN, end: 'start' }]];
  for (const [shape, lens, tall] of cases) {
    const k = updateSpec(newCabinet('kitchen'), { shape, walls: lens.map((len) => ({ len })), tall });
    const zero = k.frames.filter((f) => f.W === 0);
    assert.ok(zero.length > 0 || lens[1] === 600, `${shape} ${lens}: has a corner-only frame`);
    zero.forEach((f) => assert.ok(f.cornerW > 0));
    const without = { ...k, frames: k.frames.filter((f) => f.W > 0) };
    for (const style of ['drawing', 'blocks']) {
      const sc = elevationScene(k, { style });
      const tag = `${shape} ${lens.join('/')} ${style}`;
      assertAllFinite(sc, tag);
      sc.viewBox.forEach((v) => assert.ok(Number.isFinite(v), tag));
      assert.deepEqual(sc, elevationScene(without, { style }), tag);
      for (const s of sc.shapes) if (s.t === 'rect') assert.ok(s.w >= 0 && s.h >= 0, tag);
    }
  }
  // 单独一个宽 0 的柜体（带 cornerW）也不出错
  const lone = elevationScene(cab([frame({ kind: 'base', W: 0, H: 850, worktop: true, cornerW: 600, wall: 1, x: 600 })]));
  assertAllFinite(lone);
  assert.equal(role(lone, 'outline').length, 0);
});

// ---------- 第二版「画框框」标记 ----------
import { newCabinet as newCab2 } from '../src/planner/templates.js';
import { leafBoxes as leafBoxes2 } from '../src/planner/blocks.js';
test("v2 blocks: every block rect carries hit 'frameId|path', base strip 'frameId|base', scene.frames for pointer maths", () => {
  const c = newCab2('wardrobe', { ceilingH: 2700 });
  const f = c.frames[0];
  const sc = elevationScene(c, { style: 'blocks' });
  const hits = sc.shapes.filter((s) => s.role === 'block').map((s) => s.hit);
  assert.deepEqual(hits, leafBoxes2(f).map((b) => `${f.id}|${b.path}`));
  assert.ok(sc.shapes.some((s) => s.hit === `${f.id}|base`));
  assert.equal(sc.frames.length, 1);
  assert.equal(sc.frames[0].id, f.id);
  assert.equal(sc.frames[0].Hb, f.H - f.base.h);
  // drawing 样式没有这些标记
  const d = elevationScene(c, { style: 'drawing', selected: `${f.id}|0.0`, sizes: true });
  assert.ok(!d.shapes.some((s) => s.hit || s.role === 'selected' || s.role === 'size'));
  assert.equal(d.frames, undefined);
});
test('v2 blocks: selected cell gets a gold outline; sizes:true writes W×H in cells', () => {
  const c = newCab2('wardrobe', { ceilingH: 2700 });
  const f = c.frames[0];
  const sc = elevationScene(c, { style: 'blocks', selected: `${f.id}|0.0`, sizes: true });
  const sel = sc.shapes.filter((s) => s.role === 'selected');
  assert.equal(sel.length, 1);
  assert.equal(sel[0].stroke, '#B8945E');
  const b = leafBoxes2(f)[0];
  assert.ok(sc.shapes.some((s) => s.t === 'text' && s.text === `${b.w}×${b.h}`));
  const base = elevationScene(c, { style: 'blocks', selected: `${f.id}|base` });
  assert.equal(base.shapes.filter((s) => s.role === 'selected').length, 1);
});
