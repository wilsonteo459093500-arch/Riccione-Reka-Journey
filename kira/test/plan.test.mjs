// 第三版「户型图框框」纯逻辑：比例、柜子俯视外框、放置 / 旋转、图上拖边改尺寸、走道检查
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { newCabinet, updateSpec } from '../src/planner/templates.js';
import { cabinetTotal } from '../src/planner/bridge.js';
import { carveRect } from '../src/planner/blocks.js';
import {
  mmPerPx, planReady, cabinetFootprint, placeOnPlan, placedFootprint, placeAt, rotatePlace, planSize, setPlanSize,
  dragPlanEdge, rectToSpec, fitCabinetToRect, aisleWarnings, aisleWarningsFor, cleanPlans, AISLE,
} from '../src/planner/plan.js';

const plan = { id: 'p1', name: 'Ground', image: { path: 'local:x', w: 2000, h: 1500, kind: 'img', page: 1 }, scale: { a: [100, 100], b: [370, 100], mm: 2700 } };
const place = (cab, x, y, rot = 0, code) => ({ ...cab, code: code || cab.code, place: { planId: 'p1', x, y, rot } });

test('plan scale: two points + real length → mm per px; no scale = not ready', () => {
  assert.equal(mmPerPx(plan), 10);
  assert.equal(planReady(plan), true);
  assert.equal(planReady({ ...plan, scale: null }), false);
  assert.equal(mmPerPx({ scale: { a: [0, 0], b: [0, 0], mm: 100 } }), 0);
});

test('footprint: wardrobe is one W × D rect, door side facing the room', () => {
  const w = updateSpec(newCabinet('wardrobe'), { W: 2400, D: 600 });
  const fp = cabinetFootprint(w);
  assert.equal(fp.parts.length, 1);
  assert.deepEqual(fp.parts[0].rect, [0, 0, 2400, 600]);
  assert.deepEqual(fp.parts[0].front, [0, 1]);
  assert.deepEqual(fp.bbox, [0, 0, 2400, 600]);
});

test('footprint: kitchen L / U follow the walls (same as 3D); wall cabinets not floor', () => {
  const k = newCabinet('kitchen');
  const L = updateSpec(k, { shape: 'L', walls: [{ len: 3000, upper: true, units: [], upperUnits: [] }, { len: 2400, upper: true, units: [], upperUnits: [] }] });
  const fp = cabinetFootprint(L);
  assert.ok(fp.parts.some((p) => !p.floor), 'top cabinets are not floor');
  assert.deepEqual(fp.bbox, [0, 0, 3000, 2400]);
  const wallB = fp.parts.filter((p) => p.floor && p.front[0] === -1);
  assert.ok(wallB.length > 0, 'wall B faces −x (into the room)');
  const U = updateSpec(k, { shape: 'U', walls: [{ len: 3000, upper: false, units: [], upperUnits: [] }, { len: 2400, upper: false, units: [], upperUnits: [] }, { len: 2400, upper: false, units: [], upperUnits: [] }] });
  const ub = cabinetFootprint(U).bbox;
  assert.deepEqual([ub[0], ub[1], ub[2], ub[3]], [0, 0, 3000, 2400]);
  // 电视墙不算
  const tv = updateSpec(newCabinet('tv'), { tvWall: { on: true } });
  assert.ok(!cabinetFootprint(tv).parts.some((p) => p.kind === 'backdrop'));
});

test('place + rotate: 90° turns W × D into D × W around the centre; placeAt puts the top-left corner', () => {
  const w = updateSpec(newCabinet('wardrobe'), { W: 2400, D: 600 });
  const p = placedFootprint(place(w, 1000, 500, 0));
  assert.deepEqual(p.bbox, [1000, 500, 3400, 1100]);
  const r = place(w, 1000, 500, 0);
  const r90 = { ...r, place: rotatePlace(r) };
  const b = placedFootprint(r90).bbox;
  assert.deepEqual([b[2] - b[0], b[3] - b[1]], [600, 2400]);
  assert.equal((b[0] + b[2]) / 2, 2200); assert.equal((b[1] + b[3]) / 2, 800);
  assert.deepEqual(placedFootprint(r90).parts[0].front, [-1, 0]);
  for (const rot of [0, 90, 180, 270]) {
    const pl = placeAt(w, 300, 400, rot, 'p1');
    const bb = placedFootprint({ ...w, place: pl }).bbox;
    assert.deepEqual([bb[0], bb[1]], [300, 400], `rot ${rot}`);
  }
  assert.deepEqual(placeOnPlan(cabinetFootprint(w), { x: 0, y: 0, rot: 180 }).parts[0].front, [0, -1]);
});

test('plan ↔ editor: dragging an edge changes spec.W (hand-drawn blocks kept); editor size change moves the frame', () => {
  // 2000 → 2300 / 2400 门数不变（4 扇）→ 手画的框框保留（门数变了的话照第二版规则重做）
  let w = updateSpec(newCabinet('wardrobe'), { W: 2000 });
  w = { ...w, custom: true, frames: [carveRect(w.frames[0], '0.0', { x: 0, y: 300, w: 400, h: 400 }, { type: 'open' }), ...w.frames.slice(1)] };
  w = place(w, 0, 0, 0);
  const r = dragPlanEdge(w, 'right', 300);
  assert.equal(r.cab.spec.W, 2300);
  assert.deepEqual(r.rebuilt, []);
  assert.ok(JSON.stringify(r.cab.frames).includes('"open"'), 'hand-drawn open block kept');
  assert.deepEqual(placedFootprint(r.cab).bbox, [0, 0, 2300, 600]);
  // 拖左边：右边不动
  const l = dragPlanEdge(w, 'left', -400);
  assert.equal(l.cab.spec.W, 2400);
  assert.deepEqual(placedFootprint(l.cab).bbox, [-400, 0, 2000, 600]);
  // 拖下边（rot 0：深）
  const d = dragPlanEdge(w, 'bottom', -50);
  assert.equal(d.cab.spec.D, 550);
  // 编辑器改尺寸：外框跟着（每次由 frames 算）
  const e = { ...updateSpec(w, { W: 1800 }), place: w.place };
  assert.deepEqual(placedFootprint(e).bbox, [0, 0, 1800, 600]);
  // 价钱不看 place
  assert.equal(cabinetTotal(w), cabinetTotal({ ...w, place: undefined }));
});

test('planSize / setPlanSize per template (kitchen = wall A + base depth, TV = W + low depth)', () => {
  const k = newCabinet('kitchen');
  assert.deepEqual(planSize(k), { W: k.spec.walls[0].len, D: k.spec.baseD });
  assert.equal(setPlanSize(k, { W: 3600 }).cab.spec.walls[0].len, 3600);
  const tv = newCabinet('tv');
  assert.equal(setPlanSize(tv, { D: 450 }).cab.spec.lowD, 450);
});

test('draw a box on the plan → long side is the width, wall on the top (horizontal) / left (vertical)', () => {
  assert.deepEqual(rectToSpec({ x: 1000, y: 500, w: 2400, h: 600 }), { W: 2400, D: 600, rot: 0, x: 1000, y: 500 });
  assert.deepEqual(rectToSpec({ x: 1000, y: 3500, w: 600, h: -2400 }), { W: 2400, D: 600, rot: 270, x: 1000, y: 1100 });
  const c = fitCabinetToRect(newCabinet('wardrobe'), { x: 1000, y: 500, w: 2400, h: 600 }, 'p1');
  assert.equal(c.spec.W, 2400);
  assert.deepEqual(placedFootprint(c).bbox, [1000, 500, 3400, 1100]);
  const v = fitCabinetToRect(newCabinet('wardrobe'), { x: 1000, y: 1100, w: 600, h: 2400 }, 'p1');
  assert.deepEqual(placedFootprint(v).bbox, [1000, 1100, 1600, 3500]);
});

test('aisle: two cabinets facing 800 / 950 / 1200 apart → warn / info / nothing (kitchen)', () => {
  const k1 = place(updateSpec(newCabinet('kitchen'), { walls: [{ len: 3000, upper: false, units: [], upperUnits: [] }] }), 0, 0, 0, 'K1');
  const D = cabinetFootprint(k1).bbox[3];
  const wr = updateSpec(newCabinet('wardrobe'), { W: 3000, D: 600 });
  const at = (gap) => ({ ...wr, id: 'w', code: 'K2', place: { planId: 'p1', ...placeAt(wr, 0, D + gap, 180) } });
  const w800 = aisleWarnings(plan, [k1, at(800)]);
  assert.equal(w800.length, 1); assert.equal(w800[0].level, 'warn'); assert.equal(w800[0].gap, 800);
  assert.match(w800[0].msg.zh, /厨房走道只有 800/);
  assert.deepEqual(w800[0].line.map((p) => p[1]), [D, D + 800]);
  const w950 = aisleWarnings(plan, [k1, at(950)]);
  assert.equal(w950.length, 1); assert.equal(w950[0].level, 'info');
  assert.equal(aisleWarnings(plan, [k1, at(1200)]).length, 0);
  // 不在这张图上的不算
  assert.equal(aisleWarnings({ id: 'other' }, [k1, at(800)]).length, 0);
  // 给编辑器：只列跟这个柜子有关的
  assert.equal(aisleWarningsFor(at(800), [plan], [k1]).length, 1);
});

test('aisle: wardrobe needs 600 in front; overlap warned; galley kitchen checks its own aisle', () => {
  const wr = updateSpec(newCabinet('wardrobe'), { W: 2400, D: 600 });
  const sh = updateSpec(newCabinet('shoe'), { W: 2400 });
  const a = { ...wr, id: 'a', code: 'K1', place: { planId: 'p1', x: 0, y: 0, rot: 0 } };
  const b = (gap) => ({ ...sh, id: 'b', code: 'K2', place: { planId: 'p1', ...placeAt(sh, 0, 600 + gap, 180) } });
  assert.match(aisleWarnings(plan, [a, b(500)])[0].msg.zh, /衣柜前只有 500/);
  assert.equal(aisleWarnings(plan, [a, b(700)]).length, 0);
  const ov = aisleWarnings(plan, [a, { ...sh, id: 'c', code: 'K3', place: { planId: 'p1', x: 1000, y: 200, rot: 0 } }]);
  assert.equal(ov[0].kind, 'overlap');
  const g = updateSpec(newCabinet('kitchen'), { shape: 'galley', aisle: 850, walls: [{ len: 3000, upper: false, units: [], upperUnits: [] }, { len: 3000, upper: false, units: [], upperUnits: [] }] });
  const gw = aisleWarnings(plan, [{ ...g, code: 'K1', place: { planId: 'p1', x: 0, y: 0, rot: 0 } }]);
  assert.ok(gw.some((w) => w.kind === 'aisle' && w.gap === g.spec.aisle && w.level === 'warn'), JSON.stringify(gw.map((w) => w.gap)));
  assert.equal(AISLE.kitchen.warn, 900);
});

test('cleanPlans: junk dropped, bad scale → null, defaults filled', () => {
  const out = cleanPlans([plan, null, { id: 'x' }, { id: 'y', image: { path: 'a' }, scale: { a: [0], b: [1, 1], mm: 5 } }]);
  assert.equal(out.length, 2);
  assert.equal(out[1].scale, null);
  assert.deepEqual(out[1].image, { path: 'a', w: 0, h: 0, kind: 'img', page: 1 });
  assert.deepEqual(cleanPlans(undefined), []);
});

test('review fix: positions on the plan are whole mm after rotate / place / edge drag', () => {
  const w = { ...updateSpec(newCabinet('wardrobe'), { W: 2410, D: 575 }) };
  const placed = { ...w, place: placeAt(w, 1000, 1000, 0, 'p1') };
  const r = { ...placed, place: rotatePlace(placed, 90) };
  assert.ok(Number.isInteger(r.place.x) && Number.isInteger(r.place.y), JSON.stringify(r.place));
  const e = dragPlanEdge(r, 'left', -15).cab;
  assert.ok(Number.isInteger(e.place.x) && Number.isInteger(e.place.y), JSON.stringify(e.place));
  for (const rot of [90, 180, 270]) { const p = placeAt(w, 333, 777, rot, 'p1'); assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y)); }
});
