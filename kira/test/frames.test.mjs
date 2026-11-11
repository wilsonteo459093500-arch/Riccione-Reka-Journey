// 第二版追加 2：柜体像乐高（移动 / 改大小 / 加 / 删柜体）+ 电视墙
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { leaf, vsplit, hsplit } from '../src/planner/model.js';
import { newCabinet, updateSpec, updateSpecKeep, addFrame, removeFrame, frameTitle, copyCabinet } from '../src/planner/templates.js';
import { cabinetItemsFor, cabinetTotal } from '../src/planner/bridge.js';
import { computeItem, seriesById, cnyToMyr } from '../src/constants/pricing.js';
import { moveFrame, snapMove, resizeFrame, setFrameSize, checkBody, minAxis, FRAME_SNAP } from '../src/planner/blocks.js';
import { elevationScene } from '../src/render/elevation.js';
import { axoScene } from '../src/render/axo.js';

const box = (o = {}) => ({ id: 'a', kind: 'wall', wall: 0, x: 600, y: 2000, W: 1800, H: 400, D: 350, base: { kind: 'wallhung', h: 0 },
  body: vsplit([600, 600, 600], [leaf('closed'), leaf('open'), hsplit([200, 200], [leaf('closed'), leaf('drawer', { drawers: 1 })])]), ...o });
const tower = (id, x) => ({ id, kind: 'tall', wall: 0, x, y: 0, W: 600, H: 2700, D: 350, base: { kind: 'plinth', h: 80 }, body: leaf('closed') });
const snaps = { ceilingH: 2700, others: [tower('L', 0), tower('R', 2400)] };

function tvFull() {
  const c = newCabinet('tv', { ceilingH: 2700 });
  return updateSpec(c, { sides: { ...c.spec.sides, on: true, H: 2700 }, upper: { ...c.spec.upper, on: true } });
}
const byEnd = (cab, k) => cab.frames.find((f) => f.id.endsWith(k));

test('moveFrame: snaps the top to the ceiling / tower tops within 30 mm, not beyond', () => {
  const f = box();
  const a = moveFrame(f, 0, 280, snaps); // 顶 2680 → 贴到 2700
  assert.equal(a.y + a.H, 2700);
  const b = moveFrame(f, 0, 250, snaps); // 顶 2650：离 2700 有 50 → 不贴
  assert.equal(b.y, 2250);
  assert.equal(moveFrame(f, 0, 0, snaps), f);
  assert.equal(f.y, 2000); // 不改原物件
  assert.equal(FRAME_SNAP, 30);
});

test('moveFrame: snaps to the floor and other boxes\' sides; never below the floor or left of the wall', () => {
  const f = box();
  assert.equal(moveFrame(f, 0, -1985, snaps).y, 0);     // 离地 15 → 贴地
  assert.equal(moveFrame(f, 0, -5000, snaps).y, 0);     // 不低于地面
  const g = moveFrame(f, 20, 0, snaps);                 // 左边 620 → 贴到左高柜右边 600（已经在），右边 2420 → 2400
  assert.ok(g.x === 600 || g.x + g.W === 2400);
  assert.equal(moveFrame(box({ x: 100 }), -5000, 0, { others: [] }).x, 0);
  const p = snapMove(f, 1000, 1000, { ceilingH: 2700, others: [] });
  assert.deepEqual([p.x, p.y], [1000, 1000]);
});

test('resizeFrame: each edge, blocks still add up, dragged side absorbs, never below the minimum', () => {
  const f = box();
  const r = resizeFrame(f, 'right', 300);
  assert.equal(r.W, 2100); assert.deepEqual(r.body.sizes, [600, 600, 900]); assert.deepEqual(checkBody(r), []);
  const l = resizeFrame(f, 'left', -300);
  assert.equal(l.x, 300); assert.equal(l.W, 2100); assert.deepEqual(l.body.sizes, [900, 600, 600]); assert.deepEqual(checkBody(l), []);
  const t = resizeFrame(f, 'top', 300);
  assert.equal(t.H, 700); assert.deepEqual(t.body.children[2].sizes, [200, 500]); assert.deepEqual(checkBody(t), []);
  const b = resizeFrame(f, 'bottom', -300);
  assert.equal(b.y, 1700); assert.equal(b.H, 700); assert.deepEqual(b.body.children[2].sizes, [500, 200]); assert.deepEqual(checkBody(b), []);
  const tiny = resizeFrame(f, 'right', -10000);
  assert.equal(tiny.W, minAxis(f, 'x')); assert.deepEqual(checkBody(tiny), []);
  assert.equal(resizeFrame(f, 'left', -10000).x, 0);
  assert.equal(resizeFrame(f, 'bottom', -10000).y, 0);
  // 拖到别人的边附近会贴齐
  assert.equal(resizeFrame(f, 'top', 290, snaps).H + 2000, 2700);
  // 带底座：柜身 = 总高 − 底座
  const tw = resizeFrame(tower('T', 0), 'top', -200);
  assert.equal(tw.H, 2500); assert.deepEqual(checkBody(tw), []);
});

test('setFrameSize: numbers from the panel (width / height / off floor / depth)', () => {
  const f = setFrameSize(box(), { W: 2400, H: 500, y: 2200, D: 300 });
  assert.deepEqual([f.W, f.H, f.y, f.D], [2400, 500, 2200, 300]);
  assert.deepEqual(checkBody(f), []);
  assert.equal(setFrameSize(box(), { y: -50 }).y, 0);
});

test('position does not change the price', () => {
  const c = tvFull();
  const up = byEnd(c, '-upper');
  const moved = { ...c, frames: c.frames.map((f) => (f === up ? moveFrame(f, 0, 300, { ceilingH: 2700, others: c.frames }) : f)) };
  assert.equal(byEnd(moved, '-upper').y + byEnd(moved, '-upper').H, 2700);
  assert.equal(cabinetTotal(moved), cabinetTotal(c));
});

test('template change keeps a moved box where the user put it; template-only changes still apply', () => {
  const c = tvFull();
  const up = byEnd(c, '-upper');
  const moved = { ...c, custom: true, frames: c.frames.map((f) => (f === up ? moveFrame(f, 0, 300, { ceilingH: 2700, others: c.frames }) : f)) };
  const r = updateSpecKeep(moved, { lowH: 450 });
  assert.equal(byEnd(r.cab, '-upper').y, 2300);
  assert.equal(byEnd(r.cab, '-low').H, 450);
  assert.equal(r.cab.custom, true);
  // 模板也改了同一项（吊柜离地）→ 用模板的
  const r2 = updateSpecKeep(moved, { upper: { ...moved.spec.upper, y: 1800 } });
  assert.equal(byEnd(r2.cab, '-upper').y, 1800);
  // 宽度：用户改过、模板没改 → 留用户的；格子加起来刚好
  const wide = { ...c, custom: true, frames: c.frames.map((f) => (f === up ? resizeFrame(f, 'right', -300) : f)) };
  const r3 = updateSpecKeep(wide, { lowY: 300 });
  assert.equal(byEnd(r3.cab, '-upper').W, 1500);
  assert.deepEqual(checkBody(byEnd(r3.cab, '-upper')), []);
});

test('addFrame / removeFrame: added boxes survive template changes, removed ones never come back', () => {
  const c = tvFull();
  const a = addFrame(c, 'shelf', { ceilingH: 2700 });
  assert.equal(a.id, `${c.id}-u1`);
  const sh = a.cab.frames.find((f) => f.id === a.id);
  assert.equal(sh.user, true); assert.equal(sh.x, 3000); assert.equal(sh.body.type, 'shelf');
  assert.equal(frameTitle(a.cab, sh, 'zh'), '飘板');
  const b = addFrame(a.cab, 'wall', { ceilingH: 2700 });
  assert.equal(b.id, `${c.id}-u2`);
  assert.equal(b.cab.frames.at(-1).y, 1500);
  const d = removeFrame(b.cab, byEnd(c, '-sideL').id);
  assert.deepEqual(d.removedFrames, [byEnd(c, '-sideL').id]);
  const r = updateSpecKeep(d, { W: 3600 });
  assert.ok(!r.cab.frames.some((f) => f.id.endsWith('-sideL')), 'removed box stays removed');
  assert.ok(r.cab.frames.some((f) => f.id === a.id) && r.cab.frames.some((f) => f.id === b.id), 'user boxes kept');
  assert.equal(byEnd(r.cab, '-sideR').x, 3000); // 模板照样改
  // 删掉用户加的：不记进 removedFrames
  const e = removeFrame(r.cab, a.id);
  assert.deepEqual(e.removedFrames, d.removedFrames);
  // 价钱：加的飘板有一行飘板
  assert.ok(cabinetItemsFor(a.cab).some((it) => it.kira.frameId === a.id && it.kira.part === 'shelf'));
});

test('blank cabinet: user boxes survive size changes; moved blank box keeps its place', () => {
  const c = newCabinet('blank', { ceilingH: 2700 });
  const a = addFrame({ ...c, custom: true }, 'base', { ceilingH: 2700 });
  const moved = { ...a.cab, frames: a.cab.frames.map((f, i) => (i === 0 ? { ...f, x: 300 } : f)) };
  const r = updateSpecKeep(moved, { W: 1500 });
  assert.equal(r.cab.frames.length, 2);
  assert.equal(r.cab.frames[0].x, 300); assert.equal(r.cab.frames[0].W, 1500);
});

test('TV feature wall: width between towers × height × wall panel price; off = no line', () => {
  const c = tvFull();
  assert.equal(c.frames.some((f) => f.kind === 'backdrop'), false);
  assert.equal(cabinetItemsFor(c).some((it) => it.kira.part === 'tvWall'), false);
  const w = updateSpec(c, { tvWall: { on: true, H: 2700 } });
  const bd = byEnd(w, '-tvwall');
  assert.deepEqual([bd.kind, bd.x, bd.W, bd.H, bd.y], ['backdrop', 600, 1800, 2700, 0]);
  assert.equal(w.frames[0], bd); // 排最前（画在后面）
  const items = cabinetItemsFor(w).filter((it) => it.kira.part === 'tvWall');
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'panel'); assert.equal(items[0].preset, 'feature');
  const want = 1.8 * 2.7 * cnyToMyr(seriesById('A').panel);
  assert.ok(Math.abs(computeItem(items[0]).total - want) < 0.01);
  assert.ok(Math.abs(cabinetTotal(w) - cabinetTotal(c) - want) < 0.01);
  // 系列跟门板
  const cw = { ...w, series: { door: 'C', carcass: 'A' } };
  assert.equal(cabinetItemsFor(cw).find((it) => it.kira.part === 'tvWall').panelSeries, 'C');
  // 没有两侧高柜 = 总宽
  const plain = updateSpec(newCabinet('tv', { ceilingH: 2700 }), { tvWall: { on: true } });
  assert.equal(byEnd(plain, '-tvwall').W, 3000);
  assert.equal(byEnd(plain, '-tvwall').H, 2700);
  // 拖大小后照新尺寸算
  const big = { ...w, frames: w.frames.map((f) => (f.kind === 'backdrop' ? resizeFrame(f, 'right', 600) : f)) };
  assert.ok(Math.abs(computeItem(cabinetItemsFor(big).find((it) => it.kira.part === 'tvWall')).total - 2.4 * 2.7 * cnyToMyr(seriesById('A').panel)) < 0.01);
});

test('TV feature wall draws behind (elevation + 3D), no side panels, selection outline', () => {
  const w = updateSpec(tvFull(), { tvWall: { on: true, H: 2700 } });
  const el = elevationScene(w, { style: 'drawing', lang: 'en' });
  const i = el.shapes.findIndex((s) => s.role === 'backdrop');
  const j = el.shapes.findIndex((s) => s.role === 'carcass');
  assert.ok(i >= 0 && i < j);
  assert.ok(el.shapes.some((s) => s.t === 'text' && s.text === 'Feature wall'));
  const bl = elevationScene(w, { style: 'blocks', lang: 'zh', selected: `${w.id}-upper|frame` });
  assert.ok(bl.shapes.some((s) => s.role === 'selected'));
  assert.ok(bl.frames.some((f) => f.kind === 'backdrop'));
  const ax = axoScene(w, { yaw: -30 });
  assert.ok(ax.shapes.length > 0);
  assert.equal(cabinetItemsFor(w).filter((it) => it.kira.frameId === `${w.id}-tvwall`).length, 1);
});

// ---------------- 独立复查修正 ----------------
test('review fix: a deleted feature wall comes back after turning it off and on (removedFrames pruned)', () => {
  const c = updateSpec(tvFull(), { tvWall: { on: true, H: 2700 } });
  const full = cabinetTotal(c);
  const d = removeFrame(c, `${c.id}-tvwall`);
  const kept = updateSpecKeep(d, { lowH: 450 }).cab;
  assert.ok(!kept.frames.some((f) => f.kind === 'backdrop'), 'still deleted while the wall is on');
  assert.deepEqual(kept.removedFrames, [`${c.id}-tvwall`]);
  const off = updateSpecKeep(kept, { tvWall: { on: false, H: 2700 } }).cab;
  assert.equal(off.removedFrames, undefined, 'forgotten once the template no longer makes it');
  const on = updateSpecKeep(off, { tvWall: { on: true, H: 2700 } }).cab;
  assert.ok(on.frames.some((f) => f.kind === 'backdrop'), 'wall back');
  const lowOnly = updateSpecKeep(on, { lowH: 400 }).cab;
  assert.ok(Math.abs(cabinetTotal(lowOnly) - full) < 0.01);
});

test('review fix: duplicating keeps template frame ids (prefix swap), removedFrames follow, no duplicate ids', () => {
  const c = updateSpec(tvFull(), { tvWall: { on: true, H: 2700 } });
  const d = removeFrame(c, `${c.id}-tvwall`);
  const copy = copyCabinet(d, { id: 'cabCOPY', code: 'K9' });
  assert.equal(copy.code, 'K9');
  assert.deepEqual(copy.frames.map((f) => f.id), d.frames.map((f) => f.id.replace(c.id, 'cabCOPY')));
  assert.deepEqual(copy.removedFrames, ['cabCOPY-tvwall']);
  const wider = updateSpecKeep(copy, { W: 3200 }).cab;
  assert.ok(!wider.frames.some((f) => f.kind === 'backdrop'), 'deleted wall stays deleted in the copy');
  assert.equal(new Set(wider.frames.map((f) => f.id)).size, wider.frames.length);
  assert.ok(Math.abs(cabinetTotal(wider) - cabinetTotal(updateSpecKeep(d, { W: 3200 }).cab)) < 0.01);
  // 空白柜子：主柜体删掉 + 加一个 → 复制后改宽，没有重复 id
  let b = newCabinet('blank', { ceilingH: 2700 });
  b = removeFrame(b, b.frames[0].id);
  b = addFrame(b, 'base', { ceilingH: 2700 }).cab;
  const bc = copyCabinet(b, { id: 'cabB2' });
  const bw = updateSpecKeep(bc, { W: 1500 }).cab;
  assert.equal(new Set(bw.frames.map((f) => f.id)).size, bw.frames.length, bw.frames.map((f) => f.id).join(','));
  assert.equal(bw.frames.length, 1);
  // 不带图上位置
  assert.equal(copyCabinet({ ...c, place: { planId: 'p', x: 0, y: 0, rot: 0 } }, { id: 'z' }).place, undefined);
});

test('review fix: blank cabinet switching kind uses the new kind height off the floor', () => {
  let b = newCabinet('blank', { ceilingH: 2700 });
  b = { ...b, custom: true };
  const wall = updateSpecKeep(b, { kind: 'wall', H: 750, D: 350, y: 1500, base: { kind: 'wallhung', h: 0 } }).cab;
  assert.equal(wall.frames[0].y, 1500);
  const base = updateSpecKeep(wall, { kind: 'base', H: 850, D: 600, y: 0, base: { kind: 'plinth', h: 100 } }).cab;
  assert.equal(base.frames[0].y, 0);
  const tall = updateSpecKeep(wall, { kind: 'tall', H: 2700, y: 0 }).cab;
  assert.ok(tall.frames[0].y + tall.frames[0].H <= 2700);
  // 种类没变：移动过的高度保留
  const moved = { ...base, frames: [{ ...base.frames[0], y: 300 }] };
  assert.equal(updateSpecKeep(moved, { W: 1500 }).cab.frames[0].y, 300);
});
