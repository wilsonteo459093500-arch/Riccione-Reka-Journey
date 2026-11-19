// 走进去 · 潘吉带逛（src/studio/walk/tour.js、TourBubble.jsx —— docs/walk/SPEC.md §2、§5、§7）：
//   每一个模板（有家具 / 没家具）和两份冻结的方案（test/fixtures/walk）：每一站都走得过去、从大门走得到（path 到得了、终点就是那一站），
//   顺序对（大门 → 客厅 → 电视墙 → 厨房 → 卧室 → 楼梯 → 楼上 → 小提示 → 结束），不在楼梯间 / 挑空里；
//   电视墙 / 厨房 / 衣柜那几句只在那个房间真的有那件东西时才说，而且站在它前面、对着它；每一句都在 voice-lines.js 的 walk 组。
//   播放器：等走到了才说、说完停一下（没声音也让字幕读得完）、下一站 / 跳过 / 被客人打断。泡泡：字幕 = lineText，按钮的字有英文。
// 跑：node test/walk-tour.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as M from '../src/studio/plan/model.js';
import { furnish } from '../src/studio/engine/furnish.js';
import * as N from '../src/studio/walk/nav.js';
import { tourStops, createTour, readMs, yawOf, yawToward, TOUR_LINES } from '../src/studio/walk/tour.js';
import LINES from '../src/shared/i18n/voice-lines.js';
import { lineText } from '../src/shared/voice.js';
import { setLang as setLang0 } from '../src/shared/i18n.js';
import EN from '../src/shared/i18n/en.js';
import TOUR_EN from '../src/shared/i18n/en-walktour.js';
import '../src/studio/walk/words.js'; // 和 WalkMode 一样：先把走进去的英文并进词典

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src') + path.sep;
const setLang = (l) => setLang0(l, { reload: false });

let n = 0;
let failed = 0;
async function test(name, fn) {
  n++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 5).join('\n    ')}`);
  }
}

console.log('走进去 · 潘吉带逛（walk-tour）');

const TPL = M.TEMPLATES.map((t) => t.id);
const HOLE = (r) => !!(r?.stairId || M.ROOM_TYPES[r?.type]?.stair || M.ROOM_TYPES[r?.type]?.void);
const RANK = { entrance: 0, living: 1, tv: 2, kitchen: 3, bedroom: 4, stairs: 5, upstairs: 6, tip: 7, end: 8 };
const FEATURE = { 'walk.tv': 'tvWall', 'walk.kitchen': 'kitchenRun', 'walk.wardrobe': 'wardrobe' };
const ids = (st) => st.map((s) => s.id).join(' ');

/** 一个方案：plan、navData、家具、nav、站 */
function caseOf(id, plan, items) {
  const nd = N.navDataOf(plan);
  const nav = N.buildNav(nd, items);
  return { id, plan, nd, items, nav, stops: tourStops(plan, items, nav) };
}
const cases = [];
for (const id of TPL) {
  const plan = M.templatePlan(id);
  cases.push(caseOf(`${id}（有家具）`, plan, furnish(plan, M.buildAllWalls(plan))));
  cases.push(caseOf(`${id}（没家具）`, plan, []));
}
for (const f of fs.readdirSync(path.join(ROOT, 'test/fixtures/walk')).filter((x) => x.endsWith('.json')).sort()) {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/walk', f), 'utf8'));
  cases.push(caseOf(`fixture ${f}`, p.plan, p.furniture || []));
}

const floorIdx = (c, it) => (it.floor == null ? 0 : c.nd.floors.findIndex((f) => f.id === it.floor));
/** 家具在不在这个房间（同一层、中心在房间里） */
const itemIn = (c, it, fi, room) => floorIdx(c, it) === fi && it.x > room.x && it.x < room.x + room.w && it.z > room.y && it.z < room.y + room.d;
const roomById = (c, fi, rid) => c.nd.floors[fi].rooms.find((r) => r.id === rid);
/** yaw 看的方向和「看向 p」差多少（弧度） */
function aimErr(s, p) {
  const want = yawToward(s, p);
  let d = Math.abs(want - s.yaw) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

// ───────────────────────── 1. 台词 ─────────────────────────

await test('每一站的台词都在 voice-lines.js 的 walk 组里；walk 组的 8 句就是 TOUR_LINES', () => {
  const walk = LINES.lines.filter((l) => l.group === 'walk').map((l) => l.id);
  assert.deepEqual([...TOUR_LINES].sort(), [...walk].sort());
  for (const c of cases)
    for (const s of c.stops) {
      assert.ok(TOUR_LINES.includes(s.line), `${c.id} ${s.id}: ${s.line}`);
      assert.ok(lineText(s.line, 'zh') && lineText(s.line, 'en'), `${c.id} ${s.line} 没有字幕`);
    }
});

// ───────────────────────── 2. 每个方案：站 ─────────────────────────

for (const c of cases) {
  await test(`${c.id}：${ids(c.stops)}`, () => {
    const { nav, stops } = c;
    assert.ok(stops.length >= 3, '至少：大门、小提示、结束');
    assert.equal(stops[0].id, 'entrance');
    assert.equal(stops[0].line, 'walk.hello');
    assert.ok(Math.hypot(stops[0].x - nav.start.x, stops[0].z - nav.start.z) < 1e-9, '第一站 = 大门里面的起点');
    assert.equal(stops.at(-1).line, 'walk.bye');
    // 每一句最多一次，id 不重复
    assert.equal(new Set(stops.map((s) => s.line)).size, stops.length, '台词重复');
    assert.equal(new Set(stops.map((s) => s.id)).size, stops.length, 'id 重复');
    assert.ok(stops.some((s) => s.line === 'walk.paint'), '小提示（刷颜色）要说');
    // 顺序：楼梯之前都在大门那一层；楼梯之后（除了小提示 / 结束）都在楼上；每一段里按 RANK 往后走
    let sec = 0;
    let prev = [-1, -1];
    for (const s of stops) {
      assert.ok(s.id in RANK, s.id);
      const key = [sec, RANK[s.id]];
      if (!['tip', 'end'].includes(s.id) || sec === 0) assert.ok(key[0] > prev[0] || (key[0] === prev[0] && key[1] > prev[1]), `顺序：${ids(stops)}`);
      prev = key;
      if (s.id === 'stairs') {
        sec = 1;
        prev = [1, -1];
      }
    }
    const st = stops.findIndex((s) => s.id === 'stairs');
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      if (st < 0 || i <= st) assert.equal(s.fi, 0, `${s.id} 在楼梯之前，应该在一楼`);
      else if (!['tip', 'end'].includes(s.id)) assert.notEqual(s.fi, 0, `${s.id} 在楼梯之后，应该在楼上`);
    }
    for (const s of stops) {
      const where = `${s.id} (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`;
      assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.yaw), where);
      // 走得过去、从大门走得到（路的终点就是这一站）
      assert.ok(N.passable(nav, s), `${where} 走不过去：clearance ${N.clearance(nav, s).toFixed(3)}`);
      const p = N.path(nav, nav.start, s);
      assert.ok(p, `${where} 从大门走不到`);
      const end = p.legs.at(-1);
      assert.equal(end.fi, s.fi);
      assert.ok(Math.hypot(end.pts.at(-1).x - s.x, end.pts.at(-1).z - s.z) < 1e-9, `${where} 路的终点不是这一站`);
      assert.deepEqual(N.nearest(nav, s), { fi: s.fi, x: s.x, z: s.z }, `${where} 不是「走得到」的点`);
      // 在房间里，不在楼梯间 / 挑空
      const r = N.roomAt(nav, s);
      assert.ok(r, `${where} 不在任何房间里`);
      assert.ok(!HOLE(r), `${where} 在 ${r.type} 里`);
      assert.equal(s.room, r.id, `${where} room`);
    }
  });
}

await test('功能那几句只在那个房间真的有那件东西时才说：站在它前面、对着它；有就一定说', () => {
  for (const c of cases) {
    for (const s of c.stops) {
      const kind = FEATURE[s.line];
      if (!kind) continue;
      const room = roomById(c, s.fi, s.room);
      const its = c.items.filter((it) => it.kind === kind && itemIn(c, it, s.fi, room));
      assert.ok(its.length, `${c.id} ${s.line}：${room.type} ${room.id} 里没有 ${kind}`);
      // 对着其中一件（误差 < 0.5°），站在它正面前方
      const it = its.find((x) => aimErr(s, x) < 0.01);
      assert.ok(it, `${c.id} ${s.line}：没有对着 ${kind}`);
      const r = ((it.rot || 0) * Math.PI) / 180;
      const depth = (s.x - it.x) * Math.sin(r) + (s.z - it.z) * Math.cos(r) - it.d / 2;
      assert.ok(depth > 0.5, `${c.id} ${s.line}：没有站在 ${kind} 前面（${depth.toFixed(2)}m）`);
    }
    const has = (line) => c.stops.some((s) => s.line === line);
    if (!c.items.length) for (const line of Object.keys(FEATURE)) assert.ok(!has(line), `${c.id}：没家具也说了 ${line}`);
    // 有就一定说：最大的客厅有电视墙 → walk.tv；一楼的厨房有橱柜 → walk.kitchen；主卧有衣柜（走得到）→ walk.wardrobe
    const f0 = c.nd.floors[0];
    const liv = [...f0.rooms].filter((r) => r.type === 'living').sort((a, b) => b.w * b.d - a.w * a.d)[0];
    if (liv && c.items.some((it) => it.kind === 'tvWall' && itemIn(c, it, 0, liv))) assert.ok(has('walk.tv'), `${c.id}：客厅有电视墙却没说`);
    if (f0.rooms.some((r) => r.type === 'kitchen' && c.items.some((it) => it.kind === 'kitchenRun' && itemIn(c, it, 0, r)))) assert.ok(has('walk.kitchen'), `${c.id}：有厨房柜却没说`);
    const masters = c.nd.floors.flatMap((f, fi) => f.rooms.filter((r) => r.type === 'master').map((r) => ({ fi, r })));
    const big = masters.sort((a, b) => b.r.w * b.r.d - a.r.w * a.r.d)[0];
    if (big && c.items.some((it) => it.kind === 'wardrobe' && itemIn(c, it, big.fi, big.r))) assert.ok(has('walk.wardrobe'), `${c.id}：主卧有衣柜却没说`);
  }
});

await test('多层（terrace2 / semid2）：楼梯口那一站看着楼梯往上，下一站走楼梯上去；一层的没有楼梯那一句', () => {
  for (const c of cases) {
    const st = c.stops.find((s) => s.id === 'stairs');
    if (c.nd.floors.length < 2) {
      assert.ok(!st, `${c.id}：一层也说楼梯`);
      continue;
    }
    assert.ok(st, `${c.id}：多层却没有楼梯那一站`);
    const link = c.nav.stairs[0];
    const far = link.pts.find((q) => Math.hypot(q.x - link.entry.x, q.z - link.entry.z) >= 0.25);
    assert.ok(Math.hypot(st.x - link.entry.x, st.z - link.entry.z) <= 0.8 + 1e-9, `${c.id}：离楼梯口太远`);
    assert.ok(aimErr(st, far) < 0.35 || aimErr({ ...st, x: link.entry.x, z: link.entry.z }, far) < 1e-3, `${c.id}：没看着楼梯`);
    const i = c.stops.indexOf(st);
    const up = c.stops[i + 1];
    assert.ok(up && up.fi === link.to, `${c.id}：楼梯之后不在楼上`);
    const p = N.path(c.nav, st, up);
    assert.ok(p.legs.some((l) => l.kind === 'stair'), `${c.id}：上楼没走楼梯`);
  }
});

// ───────────────────────── 3. 边角 ─────────────────────────

await test('楼上有挑空：不站在挑空里；fits === false 的楼梯不上楼', () => {
  const plan = M.templatePlan('semid2');
  plan.floors[1].rooms = plan.floors[1].rooms.map((r) => (r.id === 'f-fam' ? { ...r, type: 'void' } : r));
  const items = furnish(plan, M.buildAllWalls(plan));
  const c = caseOf('void', plan, items);
  for (const s of c.stops) assert.ok(!HOLE(N.roomAt(c.nav, s)), s.id);
  assert.ok(c.stops.some((s) => s.fi === 1));
  // 楼梯太短（fits === false）：nav 不连，楼上走不到 → 不上楼，不说楼梯
  const nd = N.navDataOf(M.templatePlan('terrace2'));
  nd.stairs = nd.stairs.map((s) => ({ ...s, fits: false }));
  const nav = N.buildNav(nd, []);
  const st = tourStops(M.templatePlan('terrace2'), [], nav);
  assert.ok(!st.some((s) => s.line === 'walk.stairs' || s.fi !== 0), ids(st));
  for (const s of st) assert.ok(N.path(nav, nav.start, s), s.id);
});

await test('楼上没有要介绍的（没有主卧、没有衣柜）：上楼去最大的房间说小提示，再结束', () => {
  const plan = M.templatePlan('terrace2');
  plan.floors[1].rooms = plan.floors[1].rooms.map((r) => (r.type === 'master' ? { ...r, type: 'study' } : r));
  const c = caseOf('no master', plan, []);
  assert.deepEqual(
    c.stops.map((s) => `${s.id}:${s.line}`),
    ['entrance:walk.hello', 'living:walk.living', 'stairs:walk.stairs', 'upstairs:walk.paint', 'end:walk.bye'],
  );
  const up = c.stops[3];
  assert.equal(up.fi, 1);
  assert.ok(!M.ROOM_TYPES[N.roomAt(c.nav, up).type].outdoor, '楼上那一站在室内');
  assert.ok(N.path(c.nav, c.nav.start, up));
});

await test('主卧没有衣柜：在主卧中间说小提示（不说衣柜）', () => {
  const plan = M.templatePlan('condo3');
  const items = furnish(plan, M.buildAllWalls(plan)).filter((it) => !(it.kind === 'wardrobe' && it.room === 'mst'));
  const c = caseOf('no wardrobe', plan, items);
  const bed = c.stops.find((s) => s.id === 'bedroom');
  assert.equal(bed.line, 'walk.paint');
  assert.equal(bed.room, 'mst');
  assert.ok(!c.stops.some((s) => s.line === 'walk.wardrobe'));
  assert.equal(c.stops.filter((s) => s.line === 'walk.paint').length, 1);
});

await test('没有主卧：最大的、有衣柜的卧室；电视墙挪出客厅 → 不说电视墙', () => {
  const plan = M.templatePlan('condo3');
  plan.floors[0].rooms = plan.floors[0].rooms.map((r) => (r.type === 'master' ? { ...r, type: 'study' } : r));
  const items = furnish(M.templatePlan('condo3'), M.buildAllWalls(M.templatePlan('condo3')));
  const c = caseOf('no master', plan, items);
  const bed = c.stops.find((s) => s.id === 'bedroom');
  assert.equal(bed?.room, 'bd2');
  assert.equal(bed.line, 'walk.wardrobe');
  const moved = items.map((it) => (it.kind === 'tvWall' ? { ...it, room: 'din', x: 4.5, z: 0.6 } : it));
  const c2 = caseOf('tv moved', M.templatePlan('condo3'), moved);
  assert.ok(!c2.stops.some((s) => s.line === 'walk.tv'), ids(c2.stops));
  assert.ok(c2.stops.some((s) => s.line === 'walk.living'));
});

await test('没有大门：从最大的客厅中间开始；不给 nav 就自己建；坏的输入 → []', () => {
  const plan = { v: 1, wallH: 2.8, rooms: [{ id: 'a', type: 'living', x: 0, y: 0, w: 5, d: 4 }, { id: 'b', type: 'bedroom', x: 5, y: 0, w: 3, d: 4 }], openings: [{ id: 'o1', kind: 'door', x: 5, y: 1.5, w: 0.9, axis: 'z' }] };
  const nav = N.buildNav(N.navDataOf(plan), []);
  assert.equal(nav.start, null);
  const st = tourStops(plan, [], nav);
  assert.equal(st[0].id, 'entrance');
  assert.equal(st[0].room, 'a');
  assert.equal(st.at(-1).line, 'walk.bye');
  for (const s of st) assert.ok(N.passable(nav, s) && N.path(nav, st[0], s), s.id);
  // 不给 nav：一样的结果
  const plan2 = M.templatePlan('semid2');
  const items = furnish(plan2, M.buildAllWalls(plan2));
  assert.deepEqual(tourStops(plan2, items), tourStops(plan2, items, N.buildNav(N.navDataOf(plan2), items)));
  assert.deepEqual(tourStops(null, []), []);
  assert.deepEqual(tourStops(null, [], { floors: [] }), []);
  assert.deepEqual(tourStops({ v: 1, rooms: [], openings: [] }, []), []);
  // 家具里有坏东西（没有坐标、不认识的楼层）也不会出事
  const junk = [...items, { id: 'x', kind: 'tvWall' }, { id: 'y', kind: 'wardrobe', floor: 'nope', x: 1, z: 1 }, null].filter((x) => x !== null);
  assert.deepEqual(tourStops(plan2, junk), tourStops(plan2, items));
});

await test('yaw：three.js YXZ（看的方向 = (−sin yaw, −cos yaw)）；大门那一站朝屋里看', () => {
  assert.equal(yawOf(0, -1), 0);
  assert.ok(Math.abs(yawOf(-1, 0) - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(Math.abs(yawOf(0, 1)) - Math.PI) < 1e-12);
  assert.ok(Math.abs(yawToward({ x: 1, z: 1 }, { x: 2, z: 1 }) + Math.PI / 2) < 1e-12);
  for (const c of cases) {
    const s = c.stops[0];
    const d = { x: -Math.sin(s.yaw), z: -Math.cos(s.yaw) };
    const ahead = { fi: 0, x: s.x + d.x * 0.5, z: s.z + d.z * 0.5 };
    assert.ok(N.roomAt(c.nav, ahead), `${c.id}：大门那一站往前看是房子外面`);
  }
});

await test('速度：semid2 有家具 tourStops < 50ms', () => {
  const c = cases.find((x) => x.id === 'semid2（有家具）');
  tourStops(c.plan, c.items, c.nav);
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) tourStops(c.plan, c.items, c.nav);
  const ms = (performance.now() - t0) / 5;
  console.log(`    tourStops ${ms.toFixed(1)} ms`);
  assert.ok(ms < 50, `${ms.toFixed(1)} ms`);
});

// ───────────────────────── 4. 播放器 ─────────────────────────

const STOPS = [
  { id: 'entrance', fi: 0, x: 0, z: 0, yaw: 0, line: 'walk.hello' },
  { id: 'living', fi: 0, x: 1, z: 0, yaw: 0, line: 'walk.living' },
  { id: 'end', fi: 0, x: 1, z: 0, yaw: 0, line: 'walk.bye' },
];
const tick = () => new Promise((r) => setTimeout(r, 0));
/** 可以手动放行的 Promise */
function gate() {
  let open;
  const p = new Promise((r) => (open = r));
  return { p, open };
}
/** 假的走路 / 说话 / 等待：全都记下来，走路要手动放行（arrive） */
function rig(opts = {}) {
  const log = [];
  const walks = [];
  const waits = [];
  const tour = createTour({
    stops: STOPS,
    walkTo: (s) => {
      log.push(`walk:${s.id}`);
      const g = gate();
      walks.push({ s, ...g });
      return g.p;
    },
    say: (id) => (log.push(`say:${id}`), Promise.resolve({ spoken: false })),
    hush: (id) => log.push(`hush:${id}`),
    halt: () => log.push('halt'),
    onStop: ({ stop, index, total, line }) => log.push(`stop:${stop.id}:${index}/${total}:${line}`),
    onEnd: (r) => log.push(`end:${r}`),
    wait: (ms) => (waits.push(ms), Promise.resolve()),
    ...opts,
  });
  const arrive = async (ok = true) => {
    walks.at(-1).open(ok);
    await tick();
    await tick();
  };
  return { tour, log, walks, waits, arrive };
}

await test('createTour：一站一站走，到了才说（onStop → say），说完停一下，最后 done', async () => {
  const { tour, log, waits, arrive } = rig();
  const done = tour.start();
  assert.equal(tour.running, true);
  assert.deepEqual(log, ['walk:entrance']);
  await tick();
  assert.deepEqual(log, ['walk:entrance'], '没到就不说');
  await arrive();
  assert.deepEqual(log.slice(1), ['stop:entrance:0/3:walk.hello', 'say:walk.hello', 'walk:living']);
  await arrive();
  await arrive();
  assert.equal(await done, 'done');
  assert.deepEqual(log, [
    'walk:entrance',
    'stop:entrance:0/3:walk.hello',
    'say:walk.hello',
    'walk:living',
    'stop:living:1/3:walk.living',
    'say:walk.living',
    'walk:end',
    'stop:end:2/3:walk.bye',
    'say:walk.bye',
    'end:done',
  ]);
  assert.equal(tour.running, false);
  // 说完以后：没有声音 → 等到字幕读得完（readMs），最后一站多停一会
  assert.equal(waits.length, 3);
  assert.ok(waits[0] >= readMs('walk.hello') - 50, `${waits[0]} < ${readMs('walk.hello')}`);
  assert.ok(waits[2] >= 1200 * 2, '最后一站多停一会');
});

await test('createTour：state() / onState —— walking → talking → idle；line 是最近说的那一句', async () => {
  const states = [];
  const { tour, arrive } = rig({ onState: (s) => states.push(`${s.phase}:${s.index}:${s.line || '-'}`) });
  tour.start();
  assert.deepEqual(tour.state(), { running: true, index: 0, total: 3, stop: STOPS[0], line: null, phase: 'walking' });
  await arrive();
  assert.equal(tour.state().phase, 'walking', '说完了，正在走去下一站');
  assert.equal(tour.state().line, 'walk.hello', '走在路上字幕留着上一句');
  await arrive();
  await arrive();
  assert.deepEqual(states, ['walking:0:-', 'talking:0:walk.hello', 'walking:1:walk.hello', 'talking:1:walk.living', 'walking:2:walk.living', 'talking:2:walk.bye', 'idle:2:walk.bye']);
});

await test('createTour：next() 这一句不说完、马上去下一站；走在路上按 next → 那一站跳过，晚到的 walkTo 不会再说话', async () => {
  // 说话时按下一站
  const slow = gate();
  const a = rig({ say: (id) => (a.log.push(`say:${id}`), id === 'walk.hello' ? slow.p : Promise.resolve()) });
  a.tour.start();
  await a.arrive();
  assert.ok(a.log.includes('say:walk.hello'));
  a.tour.next();
  assert.deepEqual(a.log.slice(-2), ['hush:walk.hello', 'walk:living']);
  slow.open();
  await tick();
  assert.equal(a.log.filter((x) => x === 'walk:living').length, 1, '旧的那一圈不会再走一次');
  // 走路时按下一站：第 1 站跳过
  const b = rig();
  b.tour.start();
  await b.arrive();
  assert.equal(b.tour.index, 1);
  const stale = b.walks.at(-1);
  b.tour.next();
  assert.equal(b.tour.index, 2);
  assert.equal(b.log.at(-1), 'walk:end');
  stale.open(true);
  await tick();
  await tick();
  assert.ok(!b.log.includes('say:walk.living'), '跳过的那一站不说');
  await b.arrive();
  assert.equal(b.log.at(-1), 'end:done');
  // 最后一站按下一站 = 结束
  const c = rig();
  c.tour.start(2);
  await c.arrive();
  c.tour.next();
  assert.equal(c.tour.running, false);
  assert.equal(c.log.at(-1), 'end:done');
});

await test('createTour：stop()（跳过）→ 她不说了、脚步停下、onEnd stopped；之后晚到的 Promise 什么都不做', async () => {
  const { tour, log, walks, arrive } = rig();
  const done = tour.start();
  await arrive();
  tour.stop();
  assert.deepEqual(log.slice(-3), ['hush:walk.hello', 'halt', 'end:stopped']);
  assert.equal(await done, 'stopped');
  assert.equal(tour.running, false);
  const before = log.length;
  walks.at(-1).open(true);
  await tick();
  await tick();
  assert.equal(log.length, before);
  tour.stop();
  tour.next();
  assert.equal(log.length, before, '没在逛：stop / next 什么都不做');
});

await test('createTour：客人自己走（walkTo → false）= 带逛结束（interrupted）；walkTo 出错 = error', async () => {
  const a = rig();
  const done = a.tour.start();
  await a.arrive(false);
  assert.equal(await done, 'interrupted');
  assert.ok(!a.log.some((x) => x.startsWith('say:')));
  const b = createTour({ stops: STOPS, walkTo: () => Promise.reject(new Error('boom')), say: () => Promise.resolve(), wait: () => Promise.resolve() });
  assert.equal(await b.start(), 'error');
  assert.equal(b.running, false);
});

await test('createTour：正在逛又 start() → 从头再来、同一个 Promise；没有站 → empty；start(from) 夹在范围里', async () => {
  const a = rig();
  const p1 = a.tour.start();
  await a.arrive();
  const p2 = a.tour.start();
  assert.equal(p1, p2);
  assert.equal(a.tour.index, 0);
  assert.equal(a.log.at(-1), 'walk:entrance');
  a.tour.stop();
  assert.equal(await p1, 'stopped');
  assert.equal(await createTour({ stops: [] }).start(), 'empty');
  const b = rig();
  b.tour.start(99);
  assert.equal(b.tour.index, 2);
  assert.equal(b.tour.current, STOPS[2]);
  assert.equal(b.tour.total, 3);
  b.tour.stop();
});

await test('createTour：默认用 voice.say（Node 里安静、不会卡住）；没有 walkTo 就当已经到了', async () => {
  const seen = [];
  const t = createTour({ stops: STOPS, onStop: ({ line }) => seen.push(line), wait: () => Promise.resolve() });
  assert.equal(await t.start(), 'done');
  assert.deepEqual(seen, STOPS.map((s) => s.line));
});

await test('readMs：照她说话的速度估，长的一句留得久；最少 1.6 秒；不认识的 → 0', () => {
  for (const lang of ['zh', 'en']) {
    assert.ok(readMs('walk.kitchen', lang) > readMs('walk.stairs', lang), lang);
    assert.ok(readMs('walk.stairs', lang) >= 1600, lang);
  }
  assert.equal(readMs('nope'), 0);
});

// ───────────────────────── 5. 泡泡（TourBubble.jsx） ─────────────────────────

/** src 里的 .js（连它 import 的）Node 自己 import 得了吗 */
const SAFE = new Map();
function nodeSafe(abs) {
  if (SAFE.has(abs)) return SAFE.get(abs);
  SAFE.set(abs, true);
  const deps = [...fs.readFileSync(abs, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?['"](\.\.?\/[^'"]+)['"]/g)].map((m) => path.resolve(path.dirname(abs), m[1]));
  const ok = deps.every((d) => /\.m?js$/.test(d) && fs.existsSync(d) && nodeSafe(d));
  SAFE.set(abs, ok);
  return ok;
}
/** TourBubble + react-dom/server 打包在一起（同一份 React）；src 里的 .js 用 Node 自己的那一份（setLang 管得到） */
async function loadBubble() {
  const r = await build({
    stdin: {
      contents: "import TourBubble from './src/studio/walk/TourBubble.jsx'; import { createElement } from 'react'; import { renderToStaticMarkup } from 'react-dom/server.browser'; export const render = (p) => renderToStaticMarkup(createElement(TourBubble, p));",
      resolveDir: ROOT,
      loader: 'jsx',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    logLevel: 'silent',
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'src-js-external',
        setup(b) {
          b.onResolve({ filter: /^\.\.?\// }, (a) => {
            const abs = path.resolve(a.resolveDir, a.path);
            if (abs.startsWith(SRC) && /\.m?js$/.test(abs) && nodeSafe(abs)) return { path: pathToFileURL(abs).href, external: true };
            return undefined;
          });
        },
      },
    ],
  });
  const file = path.join(os.tmpdir(), `walk-tour-${process.pid}.mjs`);
  fs.writeFileSync(file, r.outputFiles[0].text);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

await test('TourBubble：字幕 = lineText（中 / 英）、aria-live、会说话的潘吉、下一站 / 跳过（≥ 44px），最后一站「好的」，没在逛 → 「带我逛逛」或什么都没有', async () => {
  const { render } = await loadBubble();
  const noop = () => {};
  for (const lang of ['zh', 'en']) {
    setLang(lang);
    try {
      const html = render({ running: true, line: 'walk.tv', index: 2, total: 7, phase: 'talking', onNext: noop, onSkip: noop });
      assert.ok(html.includes(lineText('walk.tv', lang).replace(/’/g, '’')), `${lang} 字幕`);
      assert.match(html, /aria-live="polite"/);
      assert.match(html, /data-speaker=""/, '会说话的那一只潘吉');
      assert.match(html, /class="walk-tour[" ]/);
      assert.match(html, /3 \/ 7/);
      const next = lang === 'en' ? 'Next stop' : '下一站';
      const skip = lang === 'en' ? 'Skip' : '跳过';
      assert.ok(html.includes(`>${next}</button>`) && html.includes(`>${skip}</button>`), `${lang} 按钮`);
      assert.equal((html.match(/min-height:44px/g) || []).length, 2, '两个按钮都 ≥ 44px');
      assert.ok(!/#[0-9a-f]{3,8}\b/i.test(html.replace(/<svg[\s\S]*?<\/svg>/g, '')), '泡泡没有写死的颜色（潘吉自己的角色色除外）');
      const end = render({ running: true, line: 'walk.bye', index: 6, total: 7, phase: 'talking', onNext: noop, onSkip: noop });
      assert.ok(end.includes(`>${lang === 'en' ? 'OK' : '好的'}</button>`) && !end.includes(`>${next}</button>`), `${lang} 最后一站`);
      const walking = render({ running: true, line: null, index: 0, total: 7, phase: 'walking' });
      assert.match(walking, /is-walking/);
      const start = render({ running: false, onStart: noop });
      assert.match(start, /class="walk-tour-start/);
      assert.ok(start.includes(lang === 'en' ? 'Show me around' : '带我逛逛'));
      assert.equal(render({ running: false }), '');
    } finally {
      setLang('zh');
    }
  }
});

await test('泡泡的字都有英文（en-walktour.js 或总表），en-walktour.js 只放这一块的字、和总表不冲突', () => {
  for (const k of ['{0}带逛', '下一站', '好的', '带我逛逛', '跳过']) assert.ok(TOUR_EN[k] ?? EN[k], k);
  for (const [k, v] of Object.entries(TOUR_EN)) {
    assert.ok(v, k);
    if (EN[k] != null) assert.equal(EN[k], v, `${k}：和 en.js 不一样`);
    assert.deepEqual((k.match(/\{\d\}/g) || []).sort(), (v.match(/\{\d\}/g) || []).sort(), k);
  }
  const src = fs.readFileSync(path.join(ROOT, 'src/studio/walk/TourBubble.jsx'), 'utf8');
  assert.ok(!/(?<![\w&#/-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/.test(src.replace(/\/\/.*$/gm, '')), '没有写死的颜色');
  assert.ok(!/localStorage|sessionStorage|indexedDB|download|createObjectURL|type="file"/.test(src + fs.readFileSync(path.join(ROOT, 'src/studio/walk/tour.js'), 'utf8')));
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
