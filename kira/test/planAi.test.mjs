// 户型图 AI 识图 → 建议柜子（纯逻辑）：比例、长度对齐 / 夹范围、方向（柜门朝房间）、厨房 L / 二字、加入报价
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from './harness.mjs';
import { aiScaleToPlan, buildSuggestions, applySuggestions, roomZoneName, AI_LIMITS } from '../src/planner/planAi.js';
import { placedFootprint } from '../src/planner/plan.js';
import { cabinetTotal } from '../src/planner/bridge.js';

// 示范户型图（test/fixtures/floorplan.png）：1200 × 800 px，比例 10 mm / px；左边卧室、右边厨房
const plan = { id: 'p1', name: 'Plan 1', image: { path: 'local:x', w: 1200, h: 800, kind: 'img', page: 1 }, scale: { a: [100, 60], b: [370, 60], mm: 2700 } };
// 假的 AI 回答（浏览器测试也用同一份）：卧室上墙一个衣柜、厨房右上角一个 L
const DEMO_AI = JSON.parse(readFileSync(new URL('./fixtures/plan-ai-demo.json', import.meta.url), 'utf8'));
const bbox = (s) => placedFootprint(s.cab).bbox;

test('AI scale: read dimension label → plan scale in original pixels (sent image half size)', () => {
  const half = { ...DEMO_AI, scale: { a: [50, 30], b: [185, 30], mm: 2700 } };
  assert.deepEqual(aiScaleToPlan(half, 600, plan), { a: [100, 60], b: [370, 60], mm: 2700 });
  assert.equal(aiScaleToPlan({ scale: { a: [0, 0], b: [1, 0], mm: 2700 } }, 600, plan), null);
  assert.equal(aiScaleToPlan({}, 600, plan), null);
});

test('wardrobe on the bedroom top wall: 2.40 m, back on the wall, doors facing into the room', () => {
  const s = buildSuggestions(DEMO_AI, plan, { sentW: 1200, ceilingH: 2700 });
  const w = s.find((x) => x.template === 'wardrobe');
  assert.equal(w.ok, true);
  assert.equal(w.roomName, 'Master Bedroom 主卧');
  assert.equal(w.cab.spec.W, 2400);
  assert.deepEqual(bbox(w), [1040, 1040, 3440, 1640]); // 墙在上（y 1040 mm），深 600 往下
  assert.deepEqual(placedFootprint(w.cab).parts[0].front, [0, 1]);
  assert.ok(cabinetTotal(w.cab) > 0);
});

test('same wardrobe but the bedroom is above the wall → it flips to face up', () => {
  const ai = { ...DEMO_AI, rooms: [{ type: 'bedroom', name: 'B2', box: [104, 0, 596, 300] }], suggestions: [{ template: 'wardrobe', room: 'B2', segments: [[104, 400, 344, 400]] }] };
  const [w] = buildSuggestions(ai, plan, { sentW: 1200 });
  assert.equal(w.roomName, 'Bedroom 2 卧室2');
  assert.deepEqual(placedFootprint(w.cab).parts[0].front, [0, -1]);
  assert.equal(bbox(w)[3], 4000); // 背靠 y = 4000 mm 那道墙
});

test('kitchen L in the top-right corner: walls 3.96 + 2.96 m, cabinets along both walls, inside the room', () => {
  const s = buildSuggestions(DEMO_AI, plan, { sentW: 1200, ceilingH: 2700 });
  const k = s.find((x) => x.template === 'kitchen');
  assert.equal(k.ok, true, JSON.stringify(k.reason));
  assert.equal(k.cab.spec.shape, 'L');
  assert.deepEqual(k.cab.spec.walls.map((w) => w.len).sort(), [2960, 3960].sort());
  const b = bbox(k);
  assert.ok(Math.abs(b[2] - 10960) <= 1 && Math.abs(b[1] - 1040) <= 1, JSON.stringify(b)); // 靠右墙、上墙
  assert.ok(b[0] >= 6900 && b[3] <= 4100, JSON.stringify(b));
  assert.ok(placedFootprint(k.cab).parts.filter((p) => p.floor).every((p) => p.rect[0] >= 6040 && p.rect[2] <= 10961));
});

test('the other L direction (corner top-left) is matched by swapping the wall order', () => {
  const ai = { ...DEMO_AI, suggestions: [{ template: 'kitchen', room: 'Kitchen', segments: [[604, 400, 604, 104], [604, 104, 1000, 104]] }] };
  const [k] = buildSuggestions(ai, plan, { sentW: 1200 });
  const b = bbox(k);
  assert.ok(Math.abs(b[0] - 6040) <= 1 && Math.abs(b[1] - 1040) <= 1, JSON.stringify(b));
});

test('galley: two parallel walls → shape galley with the measured aisle', () => {
  const ai = { ...DEMO_AI, suggestions: [{ template: 'kitchen', room: 'Kitchen', segments: [[700, 104, 1000, 104], [1000, 340, 700, 340]] }] };
  const [k] = buildSuggestions(ai, plan, { sentW: 1200 });
  assert.equal(k.cab.spec.shape, 'galley');
  assert.equal(k.cab.spec.aisle, 2360 - 2 * k.cab.spec.baseD);
});

test('lengths are snapped and clamped with a note; nonsense is rejected with a reason', () => {
  const ai = { rooms: DEMO_AI.rooms, suggestions: [
    { template: 'wardrobe', room: 'Bedroom', segments: [[104, 104, 590, 104]] },        // 4.86 m → 4.00 m
    { template: 'shoe', room: 'Bedroom', segments: [[104, 104, 120, 104]] },            // 0.16 m → too short
    { template: 'sofa', room: 'Bedroom', segments: [[104, 104, 300, 104]] },            // unknown
    { template: 'wardrobe', room: 'Bedroom', segments: [[104, 104, 3000, 104]] },       // outside
    { template: 'wardrobe', room: 'Bedroom', segments: [] },
  ] };
  const s = buildSuggestions(ai, plan, { sentW: 1200 });
  assert.equal(s[0].ok, true); assert.equal(s[0].cab.spec.W, AI_LIMITS.wardrobe.max); assert.match(s[0].notes[0].zh, /AI 量到 4.86 m，先按 4.00 m/);
  assert.deepEqual(s.slice(1).map((x) => x.ok), [false, false, false, false]);
  assert.ok(s.slice(1).every((x) => x.reason?.zh));
  assert.deepEqual(buildSuggestions(ai, { ...plan, scale: null }, { sentW: 1200 }), []); // 没比例：不给建议
});

test('applySuggestions: new rooms named like the room list, codes continue, overlapping picks skipped', () => {
  const s = buildSuggestions(DEMO_AI, plan, { sentW: 1200 });
  const zones = [{ id: 'z1', name: 'Master Bedroom 主卧', items: [], cabinets: [{ id: 'c0', code: 'K1', template: 'wardrobe', spec: {}, frames: [] }] }];
  let n = 0;
  const r = applySuggestions(zones, s, { uid: () => `cabX${++n}` });
  assert.deepEqual(r.added, ['cabX1', 'cabX2']);
  assert.equal(r.zones.find((z) => z.id === 'z1').cabinets.at(-1).code, 'K2');
  const kz = r.zones.find((z) => z.name === 'Dry Kitchen 干厨');
  assert.ok(kz && kz.cabinets[0].code === 'K3');
  assert.ok(kz.cabinets[0].frames.every((f) => f.id.startsWith('cabX2-')));
  assert.equal(kz.cabinets[0].place.planId, 'p1');
  // 同一个再加一次 → 重叠，跳过
  const again = applySuggestions(r.zones, [s[0]], { uid: () => 'cabY' });
  assert.equal(again.added.length, 0); assert.equal(again.skipped.length, 1);
  assert.equal(roomZoneName({ type: 'kitchen', name: 'Wet kitchen' }), 'Wet Kitchen 湿厨');
});
