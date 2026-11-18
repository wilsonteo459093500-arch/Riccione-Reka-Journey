// AI 识图 · 卧室衣柜：先留床位再放衣柜；不挡窗、不挡厕所 / 阳台门；主卧可以 L 型；房间号码照图上
// 图：1200 × 800 px，10 mm / px，送去的图 = 原图（k = 1）→ 1 px = 10 mm
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { buildSuggestions, roomZoneName } from '../src/planner/planAi.js';
import { placedFootprint } from '../src/planner/plan.js';

const plan = { id: 'p2', name: 'Plan 2', image: { path: 'local:x', w: 1200, h: 800, kind: 'img', page: 1 }, scale: { a: [100, 60], b: [370, 60], mm: 2700 } };
const run = (ai) => buildSuggestions(ai, plan, { sentW: 1200 });
const why = (s) => (s.why || []).map((w) => w.zh).join(' / ');

// 主卧 3.6 × 4.6 m（同用户截图 Plan 2）：房门在上墙右边、厕所门在右墙、阳台门在下墙
const master = (extra = {}) => ({
  type: 'master', name: 'Master Bedroom', box: [100, 100, 460, 560],
  doors: [{ seg: [400, 100, 450, 100], to: 'entry' }, { seg: [460, 300, 460, 380], to: 'bathroom' }, { seg: [200, 560, 380, 560], to: 'balcony' }],
  windows: [], bed: [], ...extra,
});
const ai = (room, segments, more = {}) => ({ rooms: [room], suggestions: [{ template: 'wardrobe', room: room.name, segments, confidence: 'high', note: '', ...more }], notes: '' });

test('bedroom: wardrobe on the wall the AI planned for the bed → not ticked, "挡到床位"', () => {
  // AI 自己说床头靠上墙（床 1.8 × 2.0），又把 2.7 m 衣柜放在上墙 —— 用户截图的情况
  const [s] = run(ai(master({ bed: [180, 100, 360, 300] }), [[100, 100, 370, 100]]));
  assert.equal(s.ok, true);
  assert.equal(s.pick, false);
  assert.match(why(s), /挡到床位/);
});

test('bedroom: wardrobe on the entry-door wall, bed elsewhere → ticked; the bed that fits is drawn', () => {
  // 衣柜在上墙左边 2.4 m（门那面墙、门旁边），AI 床在左墙
  const [s] = run(ai(master({ bed: [100, 260, 300, 440] }), [[100, 100, 340, 100]]));
  assert.equal(s.pick, true, why(s));
  assert.equal(s.bedKind, 'fit');
  const b = s.bedPx;
  const w = placedFootprint(s.cab).bbox.map((v) => v / 10);
  assert.ok(b[1] >= w[3] || b[0] >= w[2] || b[3] <= w[1] || b[2] <= w[0], 'bed does not overlap the wardrobe');
});

test('bedroom: wardrobe in front of the bathroom door → "挡厕所门"; along a window → "挡窗"', () => {
  const [d] = run(ai(master(), [[460, 260, 460, 500]]));
  assert.equal(d.pick, false);
  assert.match(why(d), /挡厕所门/);
  const [w] = run(ai(master({ windows: [[100, 250, 100, 400]] }), [[100, 200, 100, 440]]));
  assert.equal(w.pick, false);
  assert.match(why(w), /挡窗/);
});

test('bedroom: after the wardrobe no bed fits → "放了这个衣柜就放不下床"', () => {
  // 卧室 2.6 × 3.4 m，2.2 m 衣柜沿右边长墙 → 剩 2.0 m 宽，1.5 m 床 + 柜门前 0.6 m 放不下
  const room = { type: 'bedroom', name: 'Bedroom 2', box: [100, 100, 360, 440], doors: [{ seg: [110, 440, 180, 440], to: 'entry' }], windows: [], bed: [] };
  const [s] = run(ai(room, [[360, 120, 360, 340]]));
  assert.equal(s.pick, false);
  assert.match(why(s), /放不下床/);
  // 同一间，衣柜改放下墙（门那面墙、门旁边）→ 床放得下
  const [ok] = run(ai(room, [[190, 440, 360, 440]]));
  assert.equal(ok.pick, true, why(ok));
});

test('old AI answers without doors / windows / bed still work (only the bed-fit check runs)', () => {
  const room = { type: 'master', name: 'Master', box: [100, 100, 460, 560] };
  const [s] = run(ai(room, [[100, 100, 340, 100]]));
  assert.equal(s.pick, true, why(s));
});

test('master L-shaped wardrobe → two wardrobes, the second gives the corner to the first (− 0.6 m)', () => {
  const s = run(ai(master({ bed: [260, 300, 460, 480] }), [[100, 100, 340, 100], [100, 100, 100, 300]]));
  assert.equal(s.length, 2);
  assert.deepEqual(s.map((x) => x.part).sort(), ['1/2', '2/2']);
  assert.ok(s.every((x) => x.group === 'ai1'));
  const a = s.find((x) => x.part === '1/2'), b = s.find((x) => x.part === '2/2');
  assert.equal(a.cab.spec.W, 2400);
  assert.equal(b.cab.spec.W, 1400);
  const fa = placedFootprint(a.cab).bbox, fb = placedFootprint(b.cab).bbox;
  const ov = Math.max(0, Math.min(fa[2], fb[2]) - Math.max(fa[0], fb[0])) * Math.max(0, Math.min(fa[3], fb[3]) - Math.max(fa[1], fb[1]));
  assert.equal(ov, 0, `${fa} / ${fb}`);
  assert.ok(s.every((x) => x.pick), s.map(why).join(' | '));
});

test('room names keep the number printed on the plan', () => {
  assert.equal(roomZoneName({ type: 'bedroom', name: 'Bedroom 4' }), 'Bedroom 4 卧室4');
  assert.equal(roomZoneName({ type: 'bedroom', name: 'BEDROOM 3' }), 'Bedroom 3 卧室3');
  assert.equal(roomZoneName({ type: 'bedroom', name: 'Bed 2' }), 'Bedroom 2 卧室2');
  assert.equal(roomZoneName({ type: 'bedroom', name: 'Bedroom' }, 1), 'Bedroom 3 卧室3');
  assert.equal(roomZoneName({ type: 'bedroom', name: 'Guest room' }), 'Bedroom 2 卧室2');
});

// ---------------- 鞋柜一定要有；图上已有的写出来 ----------------
import { aiCoverage } from '../src/planner/planAi.js';
import { cabinetFacts, SYSTEM_PROMPT, RESULT_SCHEMA } from '../api/plan-ai.js';

// 玄关 3.0 × 2.4 m，大门在下墙左边（x 1100–2000 mm）
const foyer = { type: 'entrance', name: 'Foyer', box: [100, 300, 400, 540], doors: [{ seg: [110, 540, 200, 540], to: 'main' }], windows: [], bed: [] };
const living = { type: 'living', name: 'Living', box: [400, 100, 800, 540], doors: [], windows: [], bed: [] };

test('shoe cabinet is required: AI gave none → one 1.2 m shoe cabinet is placed beside the main door, ticked, with a note', () => {
  const s = run({ rooms: [foyer, living], suggestions: [], notes: '' });
  const shoe = s.find((x) => x.template === 'shoe');
  assert.ok(shoe?.ok, JSON.stringify(shoe));
  assert.equal(shoe.pick, true);
  assert.equal(shoe.cab.spec.W, 1200);
  assert.ok(shoe.notes.some((n) => /按大门位置自动放/.test(n.zh)));
  const b = placedFootprint(shoe.cab).bbox;
  assert.ok(b[0] >= 2000 && b[2] <= 4000 && b[3] <= 5400 + 1, `beside the door, inside the foyer: ${b}`);
  // 门边只剩 0.95 m → 鞋柜就做 0.95 m（不会伸出房间）
  const small = run({ rooms: [{ ...foyer, box: [100, 300, 300, 540] }], suggestions: [], notes: '' }).find((x) => x.template === 'shoe');
  assert.equal(small.cab.spec.W, 950);
});

test('no auto shoe when the AI already gave one, or one is already drawn on the plan', () => {
  const given = run({ rooms: [foyer], suggestions: [{ template: 'shoe', room: 'Foyer', segments: [[100, 320, 100, 440]], confidence: 'high', note: '' }], notes: '' });
  assert.equal(given.filter((x) => x.template === 'shoe').length, 1);
  assert.ok(!given[0].notes.some((n) => /自动放/.test(n.zh)));
  const k2 = { id: 'k2', code: 'K2', template: 'shoe', place: { planId: 'p2', x: 0, y: 0, rot: 0 } };
  const drawn = buildSuggestions({ rooms: [foyer], suggestions: [], notes: '' }, plan, { sentW: 1200, existing: [k2] });
  assert.equal(drawn.filter((x) => x.template === 'shoe').length, 0);
});

test('AI panel, room by room (bathroom / balcony do not count): "already on the plan: K1" in the living room; empty bedroom flagged; shoe required', () => {
  // K1 = 电视柜，已经放在客厅里（同用户的情况：AI 不重复建议，但清单要写出来）
  const [tv] = run({ rooms: [living], suggestions: [{ template: 'tv', room: 'Living', segments: [[450, 540, 750, 540]], confidence: 'high', note: '' }], notes: '' });
  const k1 = { ...tv.cab, id: 'k1', code: 'K1', template: 'tv' };
  const rooms = [{ ...living, doors: [] }, master(), { type: 'bathroom', name: 'Bath', box: [460, 300, 520, 400] }, { type: 'balcony', name: 'Balcony', box: [100, 560, 460, 620] }];
  const ai = { rooms, suggestions: [], notes: '' };
  const rows = aiCoverage(ai, run(ai), [k1], plan, { sentW: 1200 });
  assert.deepEqual(rows.map((r) => [r.kind, r.room || r.template, r.status, (r.codes || []).join()]), [
    ['shoe', 'shoe', 'missing', ''],
    ['room', 'Living', 'existing', 'K1'],
    ['room', 'Master Bedroom', 'missing', ''],
  ]);
  assert.equal(rows[0].required, true);
  assert.equal(rows[2].roomName, 'Master Bedroom 主卧');
  // 楼上（只有卧室）：不吵着要鞋柜；有建议的房间不列
  const up = { rooms: [master()], suggestions: [{ template: 'wardrobe', room: 'Master Bedroom', segments: [[100, 100, 340, 100]], confidence: 'high', note: '' }], notes: '' };
  assert.deepEqual(aiCoverage(up, run(up), [], plan, { sentW: 1200 }), []);
});

test('more cabinet types per room: dining sideboard, study desk, store room tall cabinet; room names', () => {
  const rooms = [
    { type: 'dining', name: 'Dining', box: [100, 100, 400, 400], doors: [], windows: [], bed: [] },
    { type: 'study', name: 'Study', box: [400, 100, 700, 400], doors: [], windows: [], bed: [] },
    { type: 'utility', name: 'Store', box: [700, 100, 900, 300], doors: [], windows: [], bed: [] },
  ];
  const s = run({ rooms, suggestions: [
    { template: 'sideboard', room: 'Dining', segments: [[120, 100, 300, 100]], confidence: 'high', note: '' },
    { template: 'desk', room: 'Study', segments: [[420, 100, 580, 100]], confidence: 'high', note: '' },
    { template: 'blank', room: 'Store', segments: [[720, 100, 840, 100]], confidence: 'high', note: '' },
  ], notes: '' });
  assert.deepEqual(s.map((x) => [x.template, x.ok, x.cab?.spec?.W, x.roomName]), [
    ['sideboard', true, 1800, 'Dining 餐厅'],
    ['desk', true, 1600, 'Study 书房'],
    ['blank', true, 1200, 'Storeroom 储藏室'],
  ]);
  assert.equal(roomZoneName({ type: 'living', name: 'Family' }), 'Family Hall 家庭厅');
  assert.equal(roomZoneName({ type: 'utility', name: 'Laundry' }), 'Laundry 洗衣房');
  assert.match(SYSTEM_PROMPT, /every room gets its own set of cabinets, except bathrooms/);
  assert.ok(RESULT_SCHEMA.properties.suggestions.items.properties.template.enum.includes('desk'));
});

test('plan-ai: existing cabinets are sent with their type; prompt makes the shoe cabinet required and only skips the same type', () => {
  assert.match(cabinetFacts([{ code: 'K1', box: [1, 2, 3, 4], template: 'tv' }, { code: 'K2', box: [1, 2, 3, 4], template: '<x>' }]), /K1 at \[1, 2, 3, 4\] \(tv\); K2 at \[1, 2, 3, 4\]\./);
  assert.match(SYSTEM_PROMPT, /The shoe cabinet is required/);
  assert.match(SYSTEM_PROMPT, /does not cover the TV wall/);
  assert.ok(RESULT_SCHEMA.properties.rooms.items.properties.doors.items.properties.to.enum.includes('main'));
});

// ---------------- 用户反馈 2026-11-18（公寓：大门开在干厨、卧室 2 衣柜被贴墙截短）----------------
test('wall snap guard: snapping that cuts a wardrobe by > 30 % or moves it > 0.5 m is ignored (AI line kept, with a note)', () => {
  const room = { type: 'bedroom', name: 'Bedroom 2', box: [100, 100, 400, 340], doors: [], windows: [], bed: [] };
  const ai = { rooms: [room], suggestions: [{ template: 'wardrobe', room: 'Bedroom 2', segments: [[100, 120, 100, 345]], confidence: 'high', note: '' }], notes: '' };
  // 假的贴墙：截成一半（像撞到图上画好的柜子线）
  const cut = () => ({ snapped: true, seg: [100, 230, 100, 345], moved: 0 });
  const [a] = buildSuggestions(ai, plan, { sentW: 1200, snap: cut });
  assert.equal(a.cab.spec.W, 2250);
  assert.ok(a.notes.some((n) => /先按 AI 的线/.test(n.zh)));
  // 假的贴墙：挪了 60 px = 0.6 m
  const far = () => ({ snapped: true, seg: [160, 120, 160, 345], moved: 60 });
  const [b] = buildSuggestions(ai, plan, { sentW: 1200, snap: far });
  assert.ok(Math.abs(placedFootprint(b.cab).bbox[0] - 1000) <= 1, 'stays on the AI line');
  // 正常的贴墙（挪 2 px、长度不变）照用
  const ok = () => ({ snapped: true, seg: [102, 120, 102, 345], moved: 2 });
  const [c] = buildSuggestions(ai, plan, { sentW: 1200, snap: ok });
  assert.ok(!c.notes.some((n) => /先按 AI 的线/.test(n.zh)));
});

test('shoe cabinet in front of the main door → moved to the other side of the door (same wall), ticked, room Foyer; overlapping suggestion unticked', () => {
  // 干厨 3.0 × 2.0 m，大门在下墙左边 x 100–180；AI 把鞋柜放在左墙、紧贴门口
  const kitchen = { type: 'kitchen', name: 'Kitchen', box: [100, 300, 400, 500], doors: [{ seg: [100, 500, 180, 500], to: 'main' }], windows: [], bed: [] };
  const ai = { rooms: [kitchen], suggestions: [
    { template: 'shoe', room: 'Kitchen', segments: [[100, 430, 100, 498]], confidence: 'low', note: '' },
    { template: 'sideboard', room: 'Kitchen', segments: [[190, 500, 390, 500]], confidence: 'high', note: '' },
  ], notes: '' };
  const s = run(ai);
  const shoe = s.find((x) => x.template === 'shoe');
  assert.equal(shoe.roomName, 'Foyer 玄关');
  assert.equal(shoe.pick, true, (shoe.why || []).map((w) => w.zh).join());
  assert.ok(shoe.notes.some((n) => /改放门的另一边/.test(n.zh)));
  const b = placedFootprint(shoe.cab).bbox;
  assert.ok(b[0] >= 1800 && b[3] <= 5000 + 1 && b[1] >= 5000 - 400, `on the bottom wall right of the door: ${b}`);
  const sb = s.find((x) => x.template === 'sideboard');
  assert.equal(sb.pick, false);
  assert.ok(sb.why.some((w) => /和鞋柜重叠/.test(w.zh)));
});

test('any cabinet (not only bedroom wardrobes) in front of a door is not ticked', () => {
  const living = { type: 'living', name: 'Living', box: [100, 100, 500, 400], doors: [{ seg: [100, 200, 100, 300], to: 'balcony' }], windows: [], bed: [] };
  const [tv] = run({ rooms: [living], suggestions: [{ template: 'tv', room: 'Living', segments: [[100, 150, 100, 350]], confidence: 'high', note: '' }], notes: '' });
  assert.equal(tv.pick, false);
  assert.ok(tv.why.some((w) => /挡阳台门/.test(w.zh)));
});

// ---------------- 用户反馈 2026-11-18 #1：图上有玄关，鞋柜要放在玄关里任何一道墙 ----------------
test('foyer on the plan: a shoe cabinet the AI put in the dining room moves into the foyer (wall the door does not swing into first)', () => {
  // 玄关 2.0 × 2.0 m，大门在上墙左半（x 1100–1900）；AI 把鞋柜放在餐厅
  const foyer = { type: 'entrance', name: 'Foyer', box: [100, 300, 300, 500], doors: [{ seg: [110, 300, 190, 300], to: 'main' }], windows: [], bed: [] };
  const dining = { type: 'dining', name: 'Dining', box: [300, 300, 700, 600], doors: [], windows: [], bed: [] };
  const s = run({ rooms: [foyer, dining], suggestions: [{ template: 'shoe', room: 'Dining', segments: [[400, 600, 520, 600]], confidence: 'low', note: '' }], notes: '' });
  const shoe = s.find((x) => x.template === 'shoe');
  assert.equal(shoe.room, 'Foyer');
  assert.equal(shoe.pick, true, shoe.why.map((w) => w.zh).join());
  assert.ok(shoe.notes.some((n) => /改放进玄关/.test(n.zh)));
  assert.ok(!shoe.notes.some((n) => /玄关很小/.test(n.zh)), 'a 2 m foyer has a wall clear of the door');
  const b = placedFootprint(shoe.cab).bbox;
  assert.ok(b[0] >= 1000 - 1 && b[2] <= 3000 + 1 && b[1] >= 3000 - 1 && b[3] <= 5000 + 1, `inside the foyer: ${b}`);
});

test('tiny foyer (every wall inside the door swing): still goes in the foyer on the longest wall, ticked, with a "check on site" note', () => {
  // 1.2 × 0.9 m 玄关，门几乎占满上墙（同用户那张图）
  const foyer = { type: 'entrance', name: 'Foyer', box: [100, 300, 220, 390], doors: [{ seg: [110, 300, 210, 300], to: 'main' }], windows: [], bed: [] };
  const s = run({ rooms: [foyer], suggestions: [], notes: '' });
  const shoe = s.find((x) => x.template === 'shoe');
  assert.equal(shoe.pick, true, shoe.why.map((w) => w.zh).join());
  assert.ok(shoe.notes.some((n) => /玄关很小/.test(n.zh)));
  const b = placedFootprint(shoe.cab).bbox;
  assert.ok(Math.abs(b[3] - 3900) <= 1, `against the wall opposite the door: ${b}`);
  assert.equal(roomZoneName({ type: 'bedroom', name: 'Bedroom 1' }), 'Bedroom 1 卧室1');
});
