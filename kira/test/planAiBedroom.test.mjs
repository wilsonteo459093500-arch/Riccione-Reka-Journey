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
