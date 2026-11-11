// 户型图 AI 识图 → 建议柜子（纯逻辑）：比例、长度对齐 / 夹范围、方向（柜门朝房间）、厨房 L / 二字、加入报价
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from './harness.mjs';
import { aiScaleToPlan, buildSuggestions, applySuggestions, roomZoneName, AI_LIMITS, cleanText } from '../src/planner/planAi.js';
import { snapSegment } from '../src/planner/wallSnap.js';
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

test('AI text clean-up: JSON that leaked into a note is cut off', () => {
  assert.equal(cleanText('Solid back wall away from the door near the A/C ledge window."}],"notes":""}'), 'Solid back wall away from the door near the A/C ledge window.');
  assert.equal(cleanText('Top wall, no door'), 'Top wall, no door');
  assert.equal(cleanText('a\\"b'), 'a');
  assert.equal(cleanText('x'.repeat(300)).length, 200);
  const ai = { ...DEMO_AI, suggestions: [{ ...DEMO_AI.suggestions[0], note: 'Near the window."}],"notes":""}' }] };
  assert.equal(buildSuggestions(ai, plan, { sentW: 1200 })[0].note, 'Near the window.');
});

test('crop: AI read only a part of the plan (offset + smaller image) → same cabinet as reading the whole plan', () => {
  const whole = buildSuggestions(DEMO_AI, plan, { sentW: 1200 }).find((x) => x.template === 'wardrobe');
  // 只送左半边（x 0–600 → 送去 1200 px 宽，放大 2 倍）
  const sh = (p) => p.map((v, i) => (i % 2 === 0 ? v * 2 : v * 2));
  const part = { ...DEMO_AI, rooms: [{ ...DEMO_AI.rooms[0], box: sh(DEMO_AI.rooms[0].box) }], suggestions: [{ ...DEMO_AI.suggestions[0], segments: [sh(DEMO_AI.suggestions[0].segments[0])] }] };
  const [w] = buildSuggestions(part, plan, { sentW: 1200, crop: { x: 0, y: 0, w: 600, h: 400 } });
  assert.deepEqual(bbox(w), bbox(whole));
  // 有偏移：从 x 100 开始的一块
  const off = { ...DEMO_AI, rooms: [{ ...DEMO_AI.rooms[0], box: [4, 104, 496, 696] }], suggestions: [{ ...DEMO_AI.suggestions[0], segments: [[4, 104, 244, 104]] }] };
  const [w2] = buildSuggestions(off, plan, { sentW: 1100, crop: { x: 100, y: 0, w: 1100, h: 800 } });
  assert.deepEqual(bbox(w2), bbox(whole));
  assert.deepEqual(aiScaleToPlan({ scale: { found: true, a: [0, 60], b: [270, 60], mm: 2700 } }, 1100, plan, { x: 100, y: 0, w: 1100, h: 800 }), { a: [100, 60], b: [370, 60], mm: 2700 });
});

test('not ticked by default (with the reason): AI unsure, mostly outside the room, overlapping a cabinet already on the plan', () => {
  const low = buildSuggestions({ ...DEMO_AI, suggestions: [{ ...DEMO_AI.suggestions[0], confidence: 'low' }] }, plan, { sentW: 1200 })[0];
  assert.equal(low.ok, true); assert.equal(low.pick, false);
  assert.match(low.why[0].zh, /不太确定/);
  // 线段画在房间外面（房间框在下面，线在上面很远）
  const out = buildSuggestions({ ...DEMO_AI, suggestions: [{ ...DEMO_AI.suggestions[0], segments: [[104, 30, 344, 30]] }] }, plan, { sentW: 1200 })[0];
  assert.equal(out.pick, false);
  assert.ok(out.why.some((w) => /房间外面/.test(w.zh)));
  // 主卧已经有 K1 在同一个位置
  const first = buildSuggestions(DEMO_AI, plan, { sentW: 1200 }).find((x) => x.template === 'wardrobe');
  const k1 = { ...first.cab, id: 'k1', code: 'K1' };
  const again = buildSuggestions(DEMO_AI, plan, { sentW: 1200, existing: [k1] });
  const w = again.find((x) => x.template === 'wardrobe');
  assert.equal(w.pick, false);
  assert.ok(w.why.some((x) => /K1/.test(x.zh)));
  // 默认勾的排前面
  assert.equal(again[0].template, 'kitchen');
  assert.equal(again.find((x) => x.template === 'kitchen').pick, true);
});

test('wall snap inside buildSuggestions: AI line 20 px off the wall → wardrobe back on the wall; no wall → note', () => {
  const w = 1200, h = 800, data = new Uint8Array(w * h);
  for (let y = 96; y <= 103; y++) for (let x = 96; x <= 1103; x++) data[y * w + x] = 1; // 上墙
  for (let y = 96; y <= 703; y++) for (let x = 96; x <= 103; x++) data[y * w + x] = 1; // 左墙
  const dark = { w, h, data };
  const snap = (seg, box, tpl) => snapSegment(dark, seg, box, { cutGaps: tpl !== 'kitchen' });
  const ai = { ...DEMO_AI, suggestions: [{ ...DEMO_AI.suggestions[0], segments: [[104, 124, 344, 124]] }] };
  const [s] = buildSuggestions(ai, plan, { sentW: 1200, snap });
  assert.deepEqual(bbox(s), [1040, 1040, 3440, 1640]);
  assert.equal(s.pick, true);
  assert.equal((s.notes || []).length, 0);
  const lost = buildSuggestions({ ...DEMO_AI, suggestions: [{ ...DEMO_AI.suggestions[0], segments: [[200, 400, 440, 400]] }] }, plan, { sentW: 1200, snap })[0];
  assert.ok(lost.notes.some((n) => /找不到这面墙/.test(n.zh)));
});
