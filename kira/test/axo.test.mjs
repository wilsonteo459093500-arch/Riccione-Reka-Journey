// 轻量立体图（src/render/axo.js）：摆放、长方体、背面剔除、前后排序、视框。
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { leaf, vsplit, hsplit, layoutLeaves, bodyHeight } from '../src/planner/model.js';
import { newCabinet, updateSpec, setUnit } from '../src/planner/templates.js';
import { cabinetBoxes, axoScene, wallToWorld, localBoxToWorld, wallAxes, axoProjector } from '../src/render/axo.js';

const frame = (o) => ({ id: 'f', kind: 'tall', label: 'T', wall: 0, x: 0, y: 0, base: { kind: 'plinth', h: 100 }, ends: { left: true, right: true }, ...o });
const cabOf = (frames, extra = {}) => ({ id: 'c', code: 'K1', template: 'wardrobe', spec: {}, finish: { door: null, carcass: null }, handle: 'hidden', view: { yaw: -30 }, frames, ...extra });

const kitchenBase = () => frame({ id: 'kb', kind: 'base', W: 3600, H: 850, D: 600, worktop: true,
  body: vsplit([600, 900, 800, 600, 700], [leaf('drawer', { drawers: 3 }), leaf('closed', { interior: 'sink' }), leaf('closed', { interior: 'hob' }), leaf('void', { interior: 'appliance' }), leaf('closed')]) });
const kitchenWall = () => frame({ id: 'kw', kind: 'wall', y: 1500, W: 2400, H: 750, D: 350, base: { kind: 'wallhung', h: 0 },
  body: vsplit([600, 900, 900], [leaf('closed'), leaf('glass', { interior: 'shelves' }), leaf('closed')]) });
const tvFrame = () => frame({ id: 'tv', kind: 'base', y: 250, W: 2000, H: 400, D: 400, base: { kind: 'wallhung', h: 0 }, ends: { left: false, right: false },
  body: vsplit([500, 1000, 500], [leaf('drawer', { drawers: 2 }), leaf('open', { interior: 'shelves' }), leaf('closed')]) });
const shoeFrame = () => frame({ id: 'sh', kind: 'tall', W: 1200, H: 2400, D: 380, base: { kind: 'raised', h: 150 }, ends: { left: false, right: false },
  body: hsplit([1000, 400, 850], [leaf('closed', { interior: 'shelves' }), leaf('open', { interior: 'shelves' }), leaf('closed', { interior: 'shelves' })]) });

const allFinite = (v) => {
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(allFinite);
  if (v && typeof v === 'object') return Object.values(v).every(allFinite);
  return true;
};
const finiteBox = (b) => ['x', 'y', 'z', 'w', 'h', 'd'].every((k) => Number.isFinite(b[k])) && b.w > 0 && b.h > 0 && b.d > 0;
const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
const polys = (sc) => sc.shapes.filter((s) => s.t === 'poly');
const center = (b) => [b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2];

test('wall placement R(angle): 0 / 90 / 180 / 270 (+ origin)', () => {
  const p = (angle, ox = 0, oz = 0) => wallToWorld({ ox, oz, angle }, 100, 5, 20);
  assert.deepEqual(p(0), [100, 5, 20]);      // u→+x, w→+z
  assert.deepEqual(p(90), [-20, 5, 100]);    // u→+z, w→−x
  assert.deepEqual(p(180), [-100, 5, -20]);  // u→−x, w→−z
  assert.deepEqual(p(270), [20, 5, -100]);   // u→−z, w→+x
  assert.deepEqual(p(90, 3000, 0), [2980, 5, 100]);
  assert.deepEqual(p(-90), p(270));
  assert.deepEqual(wallAxes(360), wallAxes(0));
  // 长方体转过去还是轴对齐，尺寸互换
  assert.deepEqual(localBoxToWorld({ ox: 3000, oz: 0, angle: 90 }, 600, 1400, 0, 850, 0, 600), { x: 2400, y: 0, z: 600, w: 600, h: 850, d: 800 });
  assert.deepEqual(localBoxToWorld({ ox: 0, oz: 0, angle: 0 }, 0, 600, 100, 850, 0, 582), { x: 0, y: 100, z: 0, w: 600, h: 750, d: 582 });
});

test('wardrobe → finite boxes, at least one front per door, carcass depth D−18, fronts 18 thick', () => {
  for (const layout of ['hang', 'shortFold', 'drawersHang', 'open', 'glass']) {
    const c = updateSpec(newCabinet('wardrobe'), { units: [{ layout }, { layout: 'hang' }, { layout }, { layout: 'hang' }] });
    const boxes = cabinetBoxes(c);
    assert.ok(boxes.length > 0, layout);
    assert.ok(boxes.every(finiteBox), layout);
    const f = c.frames[0];
    const leaves = layoutLeaves(f.body, 0, 0, f.W, bodyHeight(f));
    leaves.filter((l) => l.node.type === 'closed' || l.node.type === 'glass').forEach((l) => {
      const n = Math.ceil(l.w / 600);
      const v0 = f.base.h + l.y, v1 = v0 + l.h;
      const fronts = boxes.filter((b) => b.part === 'front' && !b.glassFrame).concat(boxes.filter((b) => b.part === 'glass'))
        .filter((b) => { const [cx, cy] = center(b); return cx > l.x && cx < l.x + l.w && cy > v0 && cy < v1; });
      assert.ok(fronts.length >= n, `${layout}: leaf at x=${l.x} needs ${n} fronts, got ${fronts.length}`);
    });
    boxes.filter((b) => b.part === 'carcass').forEach((b) => { assert.equal(b.z, 0); assert.equal(b.d, f.D - 18); });
    boxes.filter((b) => b.part === 'front' || b.part === 'drawer').forEach((b) => { assert.equal(b.z, f.D - 18); assert.equal(b.d, 18); });
  }
});

test('door / drawer colours follow the finish; glass is translucent', () => {
  let c = setUnit(newCabinet('wardrobe'), 1, { layout: 'glass' });
  c = { ...c, finish: { door: 'walnut', carcass: 'white' } };
  const boxes = cabinetBoxes(c);
  assert.ok(boxes.filter((b) => b.part === 'front').every((b) => b.color === '#7A5A40'));
  assert.ok(boxes.filter((b) => b.part === 'carcass').every((b) => b.color === '#F2EEE6'));
  const glass = boxes.filter((b) => b.part === 'glass');
  assert.ok(glass.length >= 1);
  assert.ok(glass.every((b) => b.opacity > 0 && b.opacity < 1));
  assert.ok(boxes.some((b) => b.part === 'shelf'), 'shelves behind the glass');
  const sc = axoScene(c);
  assert.ok(polys(sc).filter((s) => s.part === 'glass').every((s) => s.opacity < 1));
});

test('void leaf is a real gap: no box inside its rect; worktop still spans it', () => {
  const f = kitchenBase();
  const boxes = cabinetBoxes(cabOf([f]));
  const voidLeaf = layoutLeaves(f.body, 0, 0, f.W, bodyHeight(f)).find((l) => l.node.type === 'void');
  const v0 = f.base.h + voidLeaf.y, v1 = v0 + voidLeaf.h;
  const inside = boxes.filter((b) => overlap(b.x, b.x + b.w, voidLeaf.x, voidLeaf.x + voidLeaf.w) > 0.01
    && overlap(b.y, b.y + b.h, v0, v1) > 0.01 && overlap(b.z, b.z + b.d, 0, f.D) > 0.01);
  assert.deepEqual(inside.map((b) => b.part), []);
  const wt = boxes.filter((b) => b.part === 'worktop');
  assert.equal(wt.length, 1);
  assert.equal(wt[0].y, 850); assert.equal(wt[0].h, 30); assert.equal(wt[0].d, 620); // 30 厚、前挑 20
  assert.equal(wt[0].x, 0); assert.equal(wt[0].w, 3600);
  assert.ok(boxes.some((b) => b.part === 'hob') && boxes.some((b) => b.part === 'tap'));
  assert.equal(boxes.filter((b) => b.part === 'drawer').length, 3);
  const plinth = boxes.filter((b) => b.part === 'plinth');
  assert.ok(plinth.length === 2 && plinth.every((b) => b.d === 550 && b.h === 100)); // 内缩 50；电器位下面断开
  assert.ok(!plinth.some((b) => overlap(b.x, b.x + b.w, voidLeaf.x, voidLeaf.x + voidLeaf.w) > 0.01));
});

test('bases: legs every ≤1000, raised = side panels to the floor with an open gap, wall-hung floats', () => {
  const legs = cabinetBoxes(cabOf([frame({ W: 600, H: 850, D: 600, base: { kind: 'legs', h: 120 }, body: leaf('closed') })])).filter((b) => b.part === 'leg');
  assert.equal(legs.length, 4); // 2 × 2 排
  assert.ok(legs.every((b) => b.y === 0 && b.h === 120 && b.w === 40 && b.d === 40));
  const legs2 = cabinetBoxes(cabOf([frame({ W: 2400, H: 850, D: 600, base: { kind: 'legs', h: 120 }, body: leaf('closed') })])).filter((b) => b.part === 'leg');
  assert.equal(legs2.length, 8); // 4 × 2 排（间距 ≤ 1000）

  const sh = shoeFrame();
  const sb = cabinetBoxes(cabOf([sh]));
  const under = sb.filter((b) => b.y < 150 - 0.01);
  assert.equal(under.length, 2); // 只有两块落地侧板
  assert.ok(under.every((b) => b.part === 'panel' && b.y === 0 && b.w === 18));
  // 中间开放格：有背板 + 层板，没有门
  const niche = sb.filter((b) => b.y >= 150 + 1000 - 0.01 && b.y + b.h <= 150 + 1400 + 0.01);
  assert.ok(niche.some((b) => b.part === 'back'));
  assert.ok(!niche.some((b) => b.part === 'front'));

  const wb = cabinetBoxes(cabOf([kitchenWall()]));
  assert.ok(wb.every((b) => b.y >= 1500 - 0.01), 'wall cabinet floats at y=1500');
  const tb = cabinetBoxes(cabOf([tvFrame()]));
  assert.ok(tb.every((b) => b.y >= 250 - 0.01), 'TV unit floats at y=250');
  assert.ok(tb.some((b) => b.part === 'back') && tb.some((b) => b.part === 'drawer'));
});

test('handles: bar / knob are boxes on the fronts; hidden / push have none', () => {
  const f = frame({ W: 1200, H: 2100, D: 600, body: vsplit([600, 600], [leaf('closed'), leaf('drawer', { drawers: 3 })]) });
  const count = (handle) => cabinetBoxes(cabOf([f], { handle })).filter((b) => b.part === 'handle');
  assert.equal(count('bar').length, 1 + 3);
  assert.equal(count('knob').length, 1 + 3);
  assert.equal(count('hidden').length, 0);
  assert.equal(count('push').length, 0);
  assert.ok(count('bar').every((b) => b.z >= 600 - 0.01)); // 站在门板前面
  // 单扇门铰在远离中心那边 → 左边那扇的拉手靠右（开门边）
  const h = count('bar')[0];
  assert.ok(h.x > 300);
});

test('axoScene: polys only, every number finite, viewBox fits all points, code label top-left', () => {
  for (const cab of [newCabinet('wardrobe', { code: 'K7' }), cabOf([kitchenBase(), kitchenWall()]), cabOf([tvFrame()]), cabOf([shoeFrame()])]) {
    for (const yaw of [-45, -30, 0, 30, 45]) {
      const sc = axoScene(cab, { yaw });
      assert.ok(polys(sc).length > 0);
      assert.ok(allFinite(sc), `finite @${yaw}`);
      const [vx, vy, vw, vh] = sc.viewBox;
      assert.ok(vw > 0 && vh > 0);
      polys(sc).forEach((s) => s.points.forEach(([x, y]) => {
        assert.ok(x >= vx - 1e-6 && x <= vx + vw + 1e-6 && y >= vy - 1e-6 && y <= vy + vh + 1e-6);
      }));
      const label = sc.shapes.find((s) => s.t === 'text');
      assert.equal(label.text, cab.code);
      assert.ok(label.x < vx + vw * 0.2 && label.y < vy + vh * 0.2);
    }
  }
  // 空柜子不炸
  const empty = axoScene({ code: 'K9', frames: [] });
  assert.ok(allFinite(empty) && empty.viewBox[2] > 0 && empty.viewBox[3] > 0);
  assert.deepEqual(cabinetBoxes({}), []);
});

test('stroke width and text scale with the drawing (600 mm vs 6 m)', () => {
  const small = axoScene(cabOf([frame({ W: 600, H: 850, D: 600, body: leaf('closed') })]));
  const big = axoScene(cabOf([frame({ W: 6000, H: 850, D: 600, body: vsplit([3000, 3000], [leaf('closed'), leaf('closed')]) })]));
  const ratio = (sc) => polys(sc).find((s) => s.part === 'front').sw / sc.viewBox[2];
  const r = ratio(big) / ratio(small);
  assert.ok(r > 0.5 && r < 2, `stroke/viewBox ratio differs ×${r}`);
  const t = (sc) => sc.shapes.find((s) => s.t === 'text').size / Math.max(sc.viewBox[2], sc.viewBox[3]);
  assert.ok(t(big) / t(small) > 0.6 && t(big) / t(small) < 1.6);
});

test('yaw −45 / 0 / +45 differ, are clamped beyond ±45, default = cab.view.yaw', () => {
  const c = newCabinet('wardrobe');
  const s = (o) => JSON.stringify(axoScene(c, o));
  assert.notEqual(s({ yaw: -45 }), s({ yaw: 0 }));
  assert.notEqual(s({ yaw: 0 }), s({ yaw: 45 }));
  assert.notEqual(s({ yaw: -45 }), s({ yaw: 45 }));
  assert.equal(s({ yaw: 90 }), s({ yaw: 45 }));
  assert.equal(s({ yaw: -200 }), s({ yaw: -45 }));
  assert.equal(s({}), s({ yaw: -30 }));
  assert.equal(JSON.stringify(axoScene({ ...c, view: { yaw: 12 } })), s({ yaw: 12 }));
  assert.equal(axoScene(c, { yaw: 'abc' }).yaw, -30);
  // yaw<0：人站左前方 → 看得到左侧（−x）面
  const { V } = axoProjector(-30);
  assert.ok(V[0] < 0 && V[1] > 0 && V[2] > 0);
});

test('back faces culled: at yaw 0 no side faces; at −30 the left side shows, the right side does not', () => {
  const c = cabOf([frame({ W: 1200, H: 2100, D: 600, ends: { left: false, right: false }, base: { kind: 'none', h: 0 }, body: leaf('closed') })]);
  const parts = (yaw, part) => polys(axoScene(c, { yaw, floor: false })).filter((s) => s.part === part);
  assert.equal(parts(0, 'carcass').length, 2); // 顶 + 正面（门缝里看得到）
  assert.equal(parts(-30, 'carcass').length, 3); // + 左侧
  assert.equal(parts(30, 'carcass').length, 3); // + 右侧
  const xs = (ss) => ss.flatMap((s) => s.points.map((p) => p[0]));
  const doorMin = Math.min(...xs(parts(-30, 'front'))), doorMax = Math.max(...xs(parts(-30, 'front')));
  assert.ok(parts(-30, 'carcass').some((s) => Math.max(...xs([s])) <= doorMin + 1e-6), 'left side face');
  assert.ok(!parts(-30, 'carcass').some((s) => Math.min(...xs([s])) >= doorMax - 1e-6), 'no right side face');
  assert.equal(parts(0, 'front').length, 4); // 两扇门 × (正面 + 顶边)；侧边 / 底面都剔除
});

test('painter order: door fronts are drawn over their carcass (default yaw and ±45, 0)', () => {
  const c = cabOf([frame({ W: 1200, H: 2100, D: 600, body: leaf('closed') })]);
  for (const yaw of [undefined, -45, 0, 45]) {
    const ps = polys(axoScene(c, { yaw }));
    const lastCarcass = ps.reduce((m, s, i) => (s.part === 'carcass' ? i : m), -1);
    const firstFront = ps.findIndex((s) => s.part === 'front');
    assert.ok(lastCarcass >= 0 && firstFront >= 0);
    assert.ok(lastCarcass < firstFront, `yaw ${yaw}: carcass ${lastCarcass} vs front ${firstFront}`);
  }
});

test('painter order: worktop drawn over base carcass + doors; tap / hob over the worktop; glass over the shelves', () => {
  const c = cabOf([kitchenBase(), kitchenWall()], { handle: 'knob' });
  for (const yaw of [-45, -30, 0, 45]) {
    const ps = polys(axoScene(c, { yaw }));
    const idx = (pred) => ps.map((s, i) => (pred(s) ? i : -1)).filter((i) => i >= 0);
    const wt = idx((s) => s.part === 'worktop');
    const under = idx((s) => s.frame === 'kb' && (s.part === 'carcass' || s.part === 'front'));
    assert.ok(wt.length && under.length);
    assert.ok(Math.min(...wt) > Math.max(...under), `yaw ${yaw}`);
    const onTop = idx((s) => s.part === 'tap' || s.part === 'hob');
    assert.ok(Math.min(...onTop) > Math.max(...wt), `yaw ${yaw} tap/hob`);
    const glass = idx((s) => s.part === 'glass');
    const shelves = idx((s) => s.frame === 'kw' && s.part === 'shelf');
    assert.ok(glass.length && shelves.length && Math.min(...glass) > Math.max(...shelves), `yaw ${yaw} glass`);
    assert.ok(ps.some((s) => s.part === 'decal'), 'sink / burner marks');
  }
});

test('deterministic: same cabinet → identical scene', () => {
  const c = cabOf([kitchenBase(), kitchenWall()], { handle: 'bar', finish: { door: 'sage', carcass: 'white' } });
  assert.deepEqual(axoScene(c), axoScene(c));
  assert.deepEqual(axoScene(structuredClone(c), { yaw: 20 }), axoScene(c, { yaw: 20 }));
  assert.deepEqual(cabinetBoxes(c), cabinetBoxes(structuredClone(c)));
});

test('2-wall L: wall 1 at 90° runs toward the viewer, fronts face −x; corner worktops do not overlap', () => {
  const walls = [{ ox: 0, oz: 0, angle: 0, len: 3000 }, { ox: 3000, oz: 0, angle: 90, len: 2000 }];
  const c = cabOf([
    frame({ id: 'a', kind: 'base', W: 3000, H: 850, D: 600, worktop: true, ends: { left: true, right: false }, body: vsplit([1500, 1500], [leaf('closed'), leaf('closed')]) }),
    frame({ id: 'b', kind: 'base', wall: 1, x: 600, W: 1400, H: 850, D: 600, worktop: true, ends: { left: false, right: true }, body: vsplit([800, 600], [leaf('closed'), leaf('drawer', { drawers: 3 })]) }),
  ], { handle: 'bar' });
  const boxes = cabinetBoxes(c, { walls });
  assert.ok(boxes.every(finiteBox));
  const b = boxes.filter((x) => x.frame === 'b');
  assert.ok(b.length > 0);
  const maxZ = Math.max(...b.map((x) => x.z + x.d));
  assert.ok(maxZ >= 1999, `wall-1 run reaches toward the viewer (max z ${maxZ})`);
  assert.ok(b.every((x) => x.z >= 600 - 0.01), 'starts after the corner');
  assert.ok(b.every((x) => x.x >= 3000 - 620 - 0.01 && x.x + x.w <= 3000 + 0.01), 'sits against the right wall');
  // 门板在 x = 3000 − 600 … 3000 − 582（朝 −x）
  b.filter((x) => x.part === 'front').forEach((x) => { assert.equal(x.x, 2400); assert.equal(x.w, 18); });
  const [wa, wb] = boxes.filter((x) => x.part === 'worktop');
  const inter = overlap(wa.x, wa.x + wa.w, wb.x, wb.x + wb.w) > 0.01 && overlap(wa.z, wa.z + wa.d, wb.z, wb.z + wb.d) > 0.01;
  assert.equal(inter, false);
  // 站左前方（−30）看得到 B 墙柜门；站右前方（+30）B 墙柜子半透明
  const front30 = polys(axoScene(c, { walls, yaw: -30 })).filter((s) => s.frame === 'b' && s.part === 'front');
  assert.ok(front30.length && front30.every((s) => s.opacity == null));
  const ghost = polys(axoScene(c, { walls, yaw: 30 })).filter((s) => s.frame === 'b');
  assert.ok(ghost.length && ghost.every((s) => s.opacity < 0.5));
  assert.ok(allFinite(axoScene(c, { walls })));
});

test('kitchen template (I / L / U / galley) renders without overlaps or NaN', () => {
  const ov = (a, b) => overlap(a.x, a.x + a.w, b.x, b.x + b.w) > 0.01 && overlap(a.y, a.y + a.h, b.y, b.y + b.h) > 0.01 && overlap(a.z, a.z + a.d, b.z, b.z + b.d) > 0.01;
  for (const shape of ['I', 'L', 'U', 'galley']) {
    const k = { ...updateSpec(newCabinet('kitchen'), { shape, tall: { on: true, kind: 'oven' } }), handle: 'bar' };
    const boxes = cabinetBoxes(k);
    assert.ok(boxes.length > 10 && boxes.every(finiteBox), shape);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!ov(boxes[i], boxes[j]), `${shape}: ${boxes[i].part} ∩ ${boxes[j].part}`);
    const sc = axoScene(k);
    assert.ok(polys(sc).length > 0 && allFinite(sc), shape);
  }
});

test('end panels follow cab.exposed (same mapping as pricing: start → left, end → right)', () => {
  const ends = (c) => cabinetBoxes(c).filter((b) => b.part === 'end').map((b) => (b.x < 100 ? 'L' : 'R')).sort().join('');
  const w = newCabinet('wardrobe');
  assert.equal(ends(w), 'LR');
  assert.equal(ends({ ...w, exposed: { left: false, right: true } }), 'R');
  assert.equal(ends({ ...w, exposed: { left: false, right: false } }), '');
  // 没有见光板那边：第一列门板从 0 开始（不再让 18）
  const fronts = cabinetBoxes({ ...w, exposed: { left: false, right: true } }).filter((b) => b.part === 'front');
  assert.ok(Math.min(...fronts.map((b) => b.x)) < 5);
  // 厨房 L：整排起点在 A 墙左端（'start'）、终点在 B 墙右端（'end'）
  const k = updateSpec(newCabinet('kitchen'), { shape: 'L' });
  const endFrames = (c) => [...new Set(cabinetBoxes(c).filter((b) => b.part === 'end').map((b) => `${b.wall}`))].sort().join('');
  assert.equal(endFrames(k), '01');
  assert.equal(endFrames({ ...k, exposed: { left: false, right: true } }), '1');
  assert.equal(endFrames({ ...k, exposed: { left: true, right: false } }), '0');
});

test('handles sit on the opening side, same hinge rule as the elevation', () => {
  // 1.8 m 衣柜 3 扇：左扇铰左、正中那扇铰左（同立面图）、右扇铰右 → 拉手在 右 / 右 / 左
  const c = { ...updateSpec(newCabinet('wardrobe'), { W: 1800, top: false }), handle: 'bar' };
  const doors = cabinetBoxes(c).filter((b) => b.part === 'front').sort((a, b) => a.x - b.x);
  const hs = cabinetBoxes(c).filter((b) => b.part === 'handle');
  const side = (d) => { const h = hs.find((x) => x.x >= d.x && x.x + x.w <= d.x + d.w); return h.x + h.w / 2 > d.x + d.w / 2 ? 'R' : 'L'; };
  assert.equal(doors.map(side).join(''), 'RRL');
  // 一格 4 扇：左半铰左、右半铰右 → 拉手 右 右 左 左
  const f4 = frame({ W: 2400, H: 2100, D: 600, ends: { left: false, right: false }, body: leaf('closed') });
  const b4 = cabinetBoxes(cabOf([f4], { handle: 'knob' }));
  const d4 = b4.filter((b) => b.part === 'front').sort((a, b) => a.x - b.x);
  const h4 = b4.filter((b) => b.part === 'handle');
  assert.equal(d4.length, 4);
  assert.equal(d4.map((d) => { const h = h4.find((x) => x.x >= d.x && x.x + x.w <= d.x + d.w); return h.x + h.w / 2 > d.x + d.w / 2 ? 'R' : 'L'; }).join(''), 'RRLL');
});

test('hidden-handle groove: top edge on low / full-height doors, bottom edge on doors above 1.3 m', () => {
  const c = newCabinet('wardrobe'); // 顶柜在 2.1 m 以上
  const fronts = cabinetBoxes(c).filter((b) => b.part === 'front' && b.decals);
  assert.ok(fronts.length >= 8);
  fronts.forEach((b) => {
    const ys = b.decals[0].pts.map((p) => p[1]);
    const atTop = Math.abs(Math.max(...ys) - (b.y + b.h)) < 0.01, atBottom = Math.abs(Math.min(...ys) - b.y) < 0.01;
    if (b.y >= 1300) assert.ok(atBottom && !atTop, `door at ${b.y}`); else assert.ok(atTop && !atBottom, `door at ${b.y}`);
  });
});

test('malformed body (no children) degrades to one closed block instead of throwing', () => {
  for (const body of [{}, { split: 'v' }, { split: 'h', sizes: [100], children: [null] }]) {
    const c = cabOf([frame({ W: 600, H: 2000, D: 600, body })]);
    const sc = axoScene(c);
    assert.ok(allFinite(sc) && polys(sc).length > 0);
  }
  assert.ok(cabinetBoxes(cabOf([frame({ W: 600, H: 2000, D: 600, body: {} })])).some((b) => b.part === 'front'));
});

test('see-through runs facing away do not show their internal partitions', () => {
  const k = { ...updateSpec(newCabinet('kitchen'), { shape: 'galley' }), handle: 'hidden' };
  const ps = polys(axoScene(k, { yaw: -30 }));
  const { project } = axoProjector(-30);
  // 近排（墙 1，背对观众 → 半透明）的地柜柜体：每格朝 −x 的侧面（看得到那一面）
  const near = cabinetBoxes(k).filter((b) => b.wall === 1 && b.part === 'carcass' && b.y < 900);
  assert.ok(near.length >= 4);
  const sideFace = (b) => [[b.x, b.y, b.z], [b.x, b.y + b.h, b.z], [b.x, b.y + b.h, b.z + b.d], [b.x, b.y, b.z + b.d]].map((q) => project(...q));
  const drawn = (pts) => ps.some((s) => s.opacity != null && s.points.length === 4 && pts.every(([x, y]) => s.points.some(([a, c]) => Math.abs(a - x) < 0.05 && Math.abs(c - y) < 0.05)));
  // 格与格紧贴：内部隔板面被邻格盖住，不画；最多剩最外头那一面
  assert.ok(near.filter((b) => drawn(sideFace(b))).length <= 1);
});

test('hinge side ignores the 18 mm end-panel shift (one exposed end, single centred door)', () => {
  // 600 宽单门、只有左边见光板：门的中心被推右 9 mm，但开门方向仍按整格算（同立面图：正中铰左 → 拉手在右）
  const f = frame({ W: 600, H: 2000, D: 600, ends: { left: true, right: false }, body: leaf('closed') });
  const bx = cabinetBoxes(cabOf([f], { handle: 'bar' }));
  const d = bx.find((b) => b.part === 'front'), h = bx.find((b) => b.part === 'handle');
  assert.ok(h.x + h.w / 2 > d.x + d.w / 2);
});

// 厨房墙太短只剩转角（finding 0）：宽 0 的柜体只为了计价（转角实物是相邻墙的柜子），3D 不画、不出 NaN
test('kitchen corner-only frames (W = 0 + cornerW) add no boxes and no NaN', () => {
  const OVEN = { on: true, end: 'end', kind: 'oven', W: 600 };
  const cases = [['L', [3000, 1200], OVEN], ['L', [3000, 900], OVEN], ['U', [3000, 2400, 600], { on: false }], ['U', [3000, 2400, 1100], { ...OVEN, end: 'start' }]];
  for (const [shape, lens, tall] of cases) {
    const k = { ...updateSpec(newCabinet('kitchen'), { shape, walls: lens.map((len) => ({ len })), tall }), handle: 'bar' };
    const zero = k.frames.filter((f) => f.W === 0);
    assert.ok(zero.length > 0, `${shape} ${lens}`);
    const without = { ...k, frames: k.frames.filter((f) => f.W > 0) };
    const boxes = cabinetBoxes(k);
    assert.ok(boxes.length > 10 && boxes.every(finiteBox), `${shape} ${lens}`);
    assert.equal(boxes.filter((b) => zero.some((f) => f.id === b.frame)).length, 0);
    assert.deepEqual(boxes.map(({ frameIndex, ...b }) => b), cabinetBoxes(without).map(({ frameIndex, ...b }) => b));
    for (const yaw of [-30, 0, 30]) {
      const sc = axoScene(k, { yaw });
      assert.ok(polys(sc).length > 0 && allFinite(sc), `${shape} ${lens} yaw ${yaw}`);
      assert.deepEqual(sc.viewBox, axoScene(without, { yaw }).viewBox);
    }
  }
  const lone = cabOf([frame({ id: 'z', kind: 'base', W: 0, H: 850, D: 600, worktop: true, cornerW: 600, body: leaf('closed') })]);
  assert.deepEqual(cabinetBoxes(lone), []);
  assert.ok(allFinite(axoScene(lone)));
});

// 第二版：厨房高柜内侧见光板也画出来（门板色），关掉就不画
import { newCabinet as nc2, updateSpec as us2 } from '../src/planner/templates.js';
test('v2: kitchen tall unit inner side panel is drawn in 3D (door colour), not when switched off', () => {
  const c = us2(nc2('kitchen'), { tall: { on: true, end: 'end', kind: 'oven' } });
  const t = c.frames.find((f) => f.kind === 'tall');
  const ends = (cab) => cabinetBoxes(cab).filter((b) => b.part === 'end' && b.frame === t.id);
  assert.equal(t.innerPanel.side, 'left');
  assert.equal(ends(c).length, 2); // 外侧（整排终点）+ 内侧
  assert.equal(ends({ ...c, exposed: { ...c.exposed, tallInner: false } }).length, 1);
});
