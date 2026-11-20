// 户型图 AI 识图 → 建议柜子（纯逻辑）：比例、长度对齐 / 夹范围、方向（柜门朝房间）、厨房 L / 二字、加入报价
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from './harness.mjs';
import { aiScaleToPlan, checkAiScale, buildSuggestions, applySuggestions, roomZoneName, AI_LIMITS, AI_TEMPLATES, cleanText } from '../src/planner/planAi.js';
import { newCabinet, updateSpec, fitCeiling } from '../src/planner/templates.js';
import { snapSegment } from '../src/planner/wallSnap.js';
import { placedFootprint, setPlanSize } from '../src/planner/plan.js';
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

// 体检 2026-11-19 问题 2：AI 加进来的柜子一律按 2.70 m 楼高算（3.0 m 的房间少报 10%）
test('applySuggestions: the room has a ceiling height → the AI cabinet is priced at that height, same as adding it by hand', () => {
  const ai = { rooms: [{ type: 'master', name: 'Master', box: [104, 104, 596, 696] }], suggestions: [{ template: 'wardrobe', room: 'Master', segments: [[104, 104, 249, 104]] }] };
  const [w] = buildSuggestions(ai, plan, { sentW: 1200 });
  assert.equal(w.cab.spec.W, 1450);
  const room = (ceilingH) => [{ id: 'z1', name: 'Master Bedroom 主卧', items: [], cabinets: [], ceilingH }];
  const added = (ceilingH) => applySuggestions(room(ceilingH), [w], { uid: () => 'cabA' }).zones[0].cabinets[0];
  const byHand = (ceilingH) => setPlanSize(newCabinet('wardrobe', { ceilingH }), { W: 1450 }).cab;
  // 楼高 3.0 m：和手动加的一样（RM 8,912），不再是 2.70 m 的价钱（RM 8,020）
  const tall = added(3000);
  assert.equal(tall.spec.H, 3000);
  assert.ok(tall.frames.every((f) => f.id.startsWith('cabA-')));
  assert.deepEqual(tall.place, w.cab.place); // 图上的位置不变
  assert.equal(Math.round(cabinetTotal(tall)), 8912);
  assert.equal(cabinetTotal(tall), cabinetTotal(byHand(3000)));
  assert.equal(Math.round(cabinetTotal(byHand(undefined))), 8020);
  // 楼高比 2.70 矮也一样跟着（不多报）
  assert.equal(cabinetTotal(added(2500)), cabinetTotal(byHand(2500)));
  // 楼高没填 → 照旧按 2.70 m
  assert.equal(added(null).spec.H, 2700);
  assert.equal(added(0).spec.H, 2700);
  // AI 新开的房间（还没有楼高）→ 2.70 m
  assert.equal(applySuggestions([], [w], { uid: () => 'cabB' }).zones[0].cabinets[0].spec.H, 2700);
});

test('fitCeiling: every AI template ends up exactly like the hand-made cabinet for that ceiling; edited heights are left alone', () => {
  AI_TEMPLATES.forEach((t) => {
    [2400, 3000, 3300].forEach((ceilingH) => {
      const hand = setPlanSize(newCabinet(t, { ceilingH }), { W: 1800 }).cab;
      const ai = fitCeiling(setPlanSize(newCabinet(t, {}), { W: 1800 }).cab, ceilingH);
      assert.deepEqual(ai.spec, hand.spec, `${t} @ ${ceilingH}`);
      assert.equal(cabinetTotal(ai), cabinetTotal(hand), `${t} @ ${ceilingH}`);
    });
  });
  // 电视柜的两侧高柜、书桌的侧边高柜：打开以后也是房间楼高（不是 2.70）
  assert.equal(fitCeiling(newCabinet('tv', {}), 3000).spec.sides.H, 3000);
  assert.equal(fitCeiling(newCabinet('tv', {}), 3000).spec.tvWall.H, 3000);
  assert.equal(fitCeiling(newCabinet('desk', {}), 3000).spec.tower.H, 3000);
  // 业务改过高度的（2.40 m 的衣柜）不动；没填楼高 / 乱填 → 原样
  const low = updateSpec(newCabinet('wardrobe', {}), { H: 2400 });
  assert.equal(fitCeiling(low, 3000).spec.H, 2400);
  const c = newCabinet('wardrobe', {});
  [null, undefined, 0, -1, '', 'abc'].forEach((v) => assert.equal(fitCeiling(c, v), c));
  // 厨房不跟楼高（地柜 / 吊柜固定高度）
  const k = newCabinet('kitchen', {});
  assert.equal(fitCeiling(k, 3000), k);
});

// 体检 2026-11-19 问题 8：AI 读到的比例没有合理性检查（读成 90 米也收）
test('checkAiScale: the scale is turned into door / room sizes first; an absurd one is not offered', () => {
  const fb = (name) => JSON.parse(readFileSync(new URL(`./fixtures/ai-feedback/${name}.json`, import.meta.url), 'utf8')).ai;
  // 两张真的户型图（AI 真的回答 + 业务确认过的比例）：都要过
  [fb('fb-1'), fb('fb-2026-11-18-condo-shoe-door')].forEach((a) => {
    const p = { id: 'p', image: { w: a.plan.w, h: a.plan.h }, scale: null };
    const good = a.plan.scale;
    const chk = (scale) => checkAiScale(a.result, scale, p, { sentW: a.sentW, crop: a.crop });
    assert.deepEqual(chk(good), { ok: true, checked: true, why: [] });
    // 读错一倍 / 一半 / 十倍（3000 读成 30000、尺寸线只点到一半…）→ 不采用，并说得出哪里不合理
    [2, 0.5, 10, 0.1, 1.8, 0.6].forEach((f) => {
      const r = chk({ ...good, mm: good.mm * f });
      assert.equal(r.ok, false, `×${f}`);
      assert.ok(r.why.length && r.why.every((w) => w.en && w.zh), `×${f}`);
    });
    // 差一成：看不出来（这种还是要人看一眼）
    assert.equal(chk({ ...good, mm: good.mm * 1.1 }).ok, true);
    assert.equal(chk({ ...good, mm: good.mm * 0.9 }).ok, true);
  });
  // 示范图：卧室 4.92 m → 过；同一条线读成 90 m → 卧室变成 164 米宽
  const r90 = checkAiScale(DEMO_AI, { a: [100, 60], b: [370, 60], mm: 90000 }, plan, { sentW: 1200 });
  assert.equal(checkAiScale(DEMO_AI, aiScaleToPlan(DEMO_AI, 1200, plan), plan, { sentW: 1200 }).ok, true);
  assert.equal(r90.ok, false);
  assert.match(r90.why.map((w) => w.zh).join('、'), /图上那条尺寸读成 90\.00 米/);
  assert.match(r90.why.map((w) => w.zh).join('、'), /卧室变成 164\.00 米宽/);
  // 一间 12 米宽的卧室（体检报告举的例子）
  const one = { rooms: [{ type: 'bedroom', name: 'B', box: [100, 100, 500, 400], doors: [], windows: [], bed: [] }] };
  const wide = checkAiScale(one, { a: [100, 60], b: [500, 60], mm: 16000 }, plan, { sentW: 1200 });
  assert.equal(wide.ok, false);
  assert.match(wide.why[0].zh, /卧室变成 12\.00 米宽/);
  // 一两间房画歪了不算（看中位数）：三间卧室里一间框得很大
  const three = { rooms: [[100, 100, 400, 500], [420, 100, 720, 500], [100, 520, 1100, 790]].map((box, i) => ({ type: 'bedroom', name: `B${i}`, box, doors: [] })) };
  assert.equal(checkAiScale(three, { a: [100, 60], b: [400, 60], mm: 3000 }, plan, { sentW: 1200 }).ok, true);
  // 图上没有房间 / 门可以对：只查尺寸本身，checked = false（由人决定）
  assert.deepEqual(checkAiScale({ rooms: [] }, { a: [100, 60], b: [370, 60], mm: 2700 }, plan, { sentW: 1200 }), { ok: true, checked: false, why: [] });
  assert.equal(checkAiScale({ rooms: [] }, { a: [100, 60], b: [370, 60], mm: 90000 }, plan, { sentW: 1200 }).ok, false);
  assert.equal(checkAiScale(DEMO_AI, null, plan, { sentW: 1200 }).ok, false);
  // 送去的图是缩小 / 裁过的：照样换算（原图 2400 宽、送去 1200）
  const big = { id: 'p', image: { w: 2400, h: 1600 } };
  assert.equal(checkAiScale(DEMO_AI, { a: [200, 120], b: [740, 120], mm: 2700 }, big, { sentW: 1200 }).ok, true);
  assert.equal(checkAiScale(DEMO_AI, { a: [200, 120], b: [740, 120], mm: 5400 }, big, { sentW: 1200 }).ok, false);
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
