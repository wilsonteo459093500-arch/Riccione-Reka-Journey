// npm test —— 多层（plan v2）：迁移、楼层 / 楼梯操作、楼梯几何、楼板 / 天花 / 栏杆、检查、按层摆家具、存档 / 分享链接、静态守门。
// 纯 Node（localStorage / IndexedDB 用假的），不需要浏览器。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../src/studio/plan/model.js';
import { furnish, furnishReport, roomFrame, footprintOf } from '../src/studio/engine/furnish.js';
import { buildProfile } from '../src/shared/profile.js';
import { PAIRS, LIFE } from '../src/quiz/flow.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { TEMPLATES, ROOM_TYPES, migratePlan, checkPlan, buildWalls, buildAllWalls } = M;

let n = 0;
let failed = 0;
async function test(name, fn) {
  n++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 4).join('\n    ')}`);
  }
}

const T = (id) => M.templatePlan(id);
const J = (x) => JSON.stringify(x);
const codes = (plan) => checkPlan(plan).map((i) => i.code);
const inRoom = (r, p) => p.x > r.x + 1e-6 && p.x < r.x + r.w - 1e-6 && p.y > r.y + 1e-6 && p.y < r.y + r.d - 1e-6;
const ov = (a, b, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;
const FLAT = new Set(['rug', 'curtains', 'art', 'pendant']);
const V1 = () => ({
  v: 1,
  name: '旧方案',
  wallH: 3.0,
  north: 45,
  rooms: [
    { id: 'liv', type: 'living', name: '客厅', x: 0, y: 0, w: 5, d: 4 },
    { id: 'bd', type: 'bedroom', name: '卧室', x: 5, y: 0, w: 3.2, d: 4 },
  ],
  openings: [{ id: 'd1', kind: 'door', x1: 5, y1: 1, x2: 5, y2: 1.9 }],
});
const answers = (life) => {
  const pairs = {};
  for (const p of PAIRS) pairs[p.id] = { pick: 'a', ms: 1200 };
  return { name: 'Peggy', players: 'couple', pairs, life, shoes: 70, wardrobeDoors: 4, wardrobeFit: 'full', longHang: 'many', books: 10, appliances: ['ricecooker', 'oven', 'steamoven'], bulky: ['luggage', 'festive', 'quilts', 'stroller'], ratio: 20, wishes: ['storage'], splurge: 'kitchen', avoid: [], oneWish: '' };
};
const FULL = buildProfile(answers({ saturday: 'kitchen', home: 'drop', cook: 'heavy', bell: 'shoes', who: ['kids', 'elder', 'altar', 'dog', 'wfh'] }), {}, { PAIRS, LIFE });

console.log('迁移 v1 → v2');
await test('v1 → 一层的 v2：ceil = wallH、height = ceil + 0.35、顶层没有 rooms / openings / wallH', () => {
  const p = migratePlan(V1());
  assert.equal(p.v, 2);
  assert.equal(p.floors.length, 1);
  const f = p.floors[0];
  assert.deepEqual([f.id, f.level, f.name, f.ceil, f.height], ['f0', 0, '', 3.0, 3.35]);
  assert.deepEqual(f.rooms, V1().rooms);
  assert.deepEqual(f.openings, V1().openings);
  assert.ok(!('rooms' in p) && !('openings' in p) && !('wallH' in p));
  assert.deepEqual(p.stairs, []);
  assert.equal(p.north, 45);
  assert.equal(p.name, '旧方案');
});
await test('幂等：迁移两次 = 迁移一次（模板、v1、奇怪的输入）', () => {
  const weird = [
    null,
    undefined,
    42,
    'x',
    [],
    {},
    { floors: 'x' },
    { v: 2, floors: [] },
    { v: 2, floors: [null, 5, { id: 'a', rooms: [null, { id: 'r', type: 'living', x: '1', y: 0, w: 3, d: 3 }] }], stairs: [null, { from: 'zz', x: 0, y: 0, w: 1, d: 3 }] },
    { v: 2, floors: [{ id: 'a', rooms: [{ id: 'r', type: 'living', x: 0, y: 0, w: 3, d: 3 }] }, { id: 'a', rooms: [{ id: 'r', type: 'bedroom', x: 0, y: 0, w: 3, d: 3 }] }] },
    { v: 2, floors: [{ id: 'g', ceil: 9, height: 1 }, { id: 'u' }], stairs: [{ id: 's', from: 'u', to: 'g', x: 0, y: 0, w: 1, d: 4, shape: 'zig', up: 'Q' }] },
    V1(),
    { ...V1(), v: undefined },
  ];
  for (const x of [...TEMPLATES.map((t) => t.plan), ...weird]) {
    const a = migratePlan(x);
    assert.equal(a.v, 2);
    assert.ok(a.floors.length >= 1);
    assert.equal(J(migratePlan(a)), J(a), J(x));
    assert.equal(J(M.syncStairs(a)), J(a));
    a.floors.forEach((f, i) => assert.equal(f.level, i));
  }
});
await test('房间 id 在所有楼层之间唯一（重复的会改名）；楼梯指向不存在的楼层 → 去掉', () => {
  const p = migratePlan({ v: 2, floors: [{ id: 'a', rooms: [{ id: 'r', type: 'living', x: 0, y: 0, w: 3, d: 3 }] }, { id: 'b', rooms: [{ id: 'r', type: 'bedroom', x: 0, y: 0, w: 3, d: 3 }] }], stairs: [{ id: 's', from: 'zz', x: 0, y: 0, w: 1, d: 3 }] });
  const ids = p.floors.flatMap((f) => f.rooms.map((r) => r.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(p.stairs, []);
});
await test('楼层高度夹在合理范围：ceil 2.4–4.5，height ≥ ceil + 0.2', () => {
  const p = migratePlan({ v: 2, floors: [{ id: 'g', ceil: 9, height: 1 }, { id: 'u', ceil: 1 }] });
  assert.equal(p.floors[0].ceil, 4.5);
  assert.equal(p.floors[0].height, 4.7);
  assert.equal(p.floors[1].ceil, 2.4);
});

console.log('楼层');
await test('楼层名：一楼 / 二楼；自己取的名字优先', () => {
  const p = T('terrace2');
  assert.equal(M.floorName(p, 'gf'), '一楼');
  assert.equal(M.floorName(p, 'ff'), '二楼');
  assert.equal(M.floorName(M.updateFloor(p, 'ff', { name: '夹层' }), 'ff'), '夹层');
});
await test('地面高度 = 下面各层的楼层高加起来', () => {
  const p = T('terrace2');
  assert.deepEqual(M.elevations(p), { gf: 0, ff: 3.35 });
  assert.equal(M.floorElev(p, 'ff'), 3.35);
  assert.ok(M.isMultiFloor(p) && !M.isMultiFloor(T('condo3')));
});
await test('加一层（空白）：楼梯在同一个位置叠上去；最多 4 层', () => {
  const p = T('terrace2');
  const { plan, floorId } = M.addFloor(p, { copy: 'blank' });
  assert.equal(plan.floors.length, 3);
  const nf = M.floorById(plan, floorId);
  assert.equal(nf.level, 2);
  assert.equal(nf.rooms.length, 1);
  assert.equal(nf.rooms[0].type, 'stair');
  const up = plan.stairs.find((s) => s.from === 'ff');
  assert.ok(up && up.to === floorId && up.x === 5.1 && up.d === 4.6);
  // 中间那层有两个楼梯间（下来的、上去的），不算重叠
  assert.ok(!codes(plan).includes('overlap'), J(checkPlan(plan)));
  let q = plan;
  q = M.addFloor(q).plan;
  assert.equal(q.floors.length, 4);
  const r = M.addFloor(q);
  assert.equal(r.floorId, null);
  assert.equal(r.plan.floors.length, 4);
});
await test('加一层（复制这一层）：房间和门窗都复制、新 id、不复制车廊 / 楼梯间', () => {
  const p = T('terrace2');
  const { plan, floorId } = M.addFloor(p, { copy: 'all', from: 'gf' });
  const nf = M.floorById(plan, floorId);
  const src = p.floors[0];
  assert.equal(nf.rooms.filter((r) => !r.stairId).length, src.rooms.filter((r) => r.type !== 'porch' && r.type !== 'stair').length);
  const ids = plan.floors.flatMap((f) => f.rooms.map((r) => r.id));
  assert.equal(new Set(ids).size, ids.length);
  const walls = buildWalls(nf);
  for (const o of nf.openings) assert.ok(walls.some((w) => w.pieces.some((x) => x.openingId === o.id)), o.id);
  assert.ok(!nf.openings.some((o) => o.id === 'd-main'));
});
await test('一层的方案加一层：画了「楼梯」类型的房间 → 用它连上来', () => {
  const p = migratePlan({ ...V1(), rooms: [...V1().rooms, { id: 'st', type: 'stair', name: '', x: 8.2, y: 0, w: 1, d: 4 }] });
  const { plan, floorId } = M.addFloor(p);
  assert.equal(plan.stairs.length, 1);
  assert.equal(plan.stairs[0].from, 'f0');
  assert.equal(plan.stairs[0].to, floorId);
  assert.ok(plan.floors[0].rooms.some((r) => r.stairId === plan.stairs[0].id));
});
await test('删一层：连着的楼梯和楼梯间一起删；只剩一层时不删', () => {
  const p = M.removeFloor(T('terrace2'), 'ff');
  assert.equal(p.floors.length, 1);
  assert.deepEqual(p.stairs, []);
  assert.ok(!p.floors[0].rooms.some((r) => r.stairId));
  assert.equal(M.removeFloor(p, 'gf').floors.length, 1);
});
await test('楼层上下对调：楼梯反过来（还是从下一层上去）', () => {
  const p = M.moveFloor(T('terrace2'), 'ff', -1);
  assert.deepEqual(p.floors.map((f) => f.id), ['ff', 'gf']);
  assert.deepEqual(p.floors.map((f) => f.level), [0, 1]);
  const s = p.stairs[0];
  assert.deepEqual([s.from, s.to, s.up], ['ff', 'gf', 'S']);
  assert.equal(J(M.moveFloor(p, 'ff', 1).floors.map((f) => f.id)), J(['gf', 'ff']));
});
await test('改一层：天花高夹 2.4–4.5；id / level 改不了；房间改了楼梯间还在', () => {
  const p = M.updateFloor(T('terrace2'), 'ff', (f) => ({ ...f, id: 'zz', level: 7, ceil: 9, rooms: f.rooms.filter((r) => r.type !== 'stair') }));
  const f = M.floorById(p, 'ff');
  assert.ok(f && f.level === 1 && f.ceil === 4.5);
  assert.ok(f.rooms.some((r) => r.stairId === 's1'), '楼梯间被 syncStairs 补回来');
});

console.log('楼梯');
await test('模板：楼梯间被认领（id = 楼梯-楼层，矩形和楼梯一样），上下两层都有', () => {
  for (const id of ['terrace2', 'semid2']) {
    const p = T(id);
    for (const s of p.stairs)
      for (const fid of [s.from, s.to]) {
        const rs = M.floorById(p, fid).rooms.filter((r) => r.stairId === s.id);
        assert.equal(rs.length, 1);
        assert.deepEqual([rs[0].id, rs[0].x, rs[0].y, rs[0].w, rs[0].d], [`${s.id}-${fid}`, s.x, s.y, s.w, s.d]);
      }
  }
});
await test('楼梯够长、上下口落在能走的房间里（排屋：直跑 19 级；半独立：U 形 20 级）', () => {
  for (const [id, risers] of [
    ['terrace2', 19],
    ['semid2', 20],
  ]) {
    const p = T(id);
    const s = p.stairs[0];
    const g = M.stairFlights(p, s.id);
    assert.ok(g.fits, id);
    assert.equal(g.risers, risers);
    assert.ok(g.rise <= M.RISER_MAX + 1e-9 && g.tread >= M.TREAD - 1e-9);
    const path = M.stairPath(p, s.id);
    const lo = M.floorById(p, s.from).rooms.find((r) => inRoom(r, path.entry));
    const hi = M.floorById(p, s.to).rooms.find((r) => inRoom(r, path.exit));
    assert.ok(lo && !lo.stairId && !ROOM_TYPES[lo.type].void && !ROOM_TYPES[lo.type].outdoor, `${id} 入口在 ${lo?.id}`);
    assert.ok(hi && !hi.stairId && !ROOM_TYPES[hi.type].void && !ROOM_TYPES[hi.type].outdoor, `${id} 出口在 ${hi?.id}`);
    assert.equal(path.entry.z, 0);
    assert.equal(path.exit.z, M.floorById(p, s.from).height);
    assert.equal(path.elev, 0);
    // 路线一路往上
    for (let i = 1; i < path.points.length; i++) assert.ok(path.points[i].z >= path.points[i - 1].z - 1e-9);
  }
});
await test('stairFlights(矩形, rise)：L 形放得下；1 × 3.2 的直跑太短', () => {
  const L = M.stairFlights({ x: 0, y: 0, w: 3.2, d: 2.6, shape: 'L', up: 'N', turn: 'right', width: 1.0 }, 3.3);
  assert.ok(L.fits && L.flights.length === 2 && L.landings.length === 1);
  assert.equal(L.flights[1].dir, 'E');
  const S = M.stairFlights({ x: 0, y: 0, w: 1, d: 3.2, shape: 'straight', up: 'N' }, 3.35);
  assert.equal(S.fits, false);
});
await test('加楼梯：默认形状按长宽比；没有上一层 → stairId null；移动 / 删除两层一起', () => {
  assert.equal(M.addStair(T('condo3'), { x: 0, y: 0, w: 1, d: 4 }).stairId, null);
  let p = M.removeStair(T('terrace2'), 's1');
  assert.ok(!p.floors.some((f) => f.rooms.some((r) => r.type === 'stair')));
  const a = M.addStair(p, { from: 'gf', x: 5.1, y: 6.6, w: 1, d: 4.6 });
  p = a.plan;
  const s = M.stairById(p, a.stairId);
  assert.deepEqual([s.shape, s.up, s.to], ['straight', 'N', 'ff']);
  assert.equal(M.defaultStairShape(3.6, 2.4), 'U');
  assert.equal(M.defaultStairShape(2.6, 1.8), 'L');
  p = M.updateStair(p, a.stairId, { x: 4.9 });
  for (const f of p.floors) assert.equal(f.rooms.find((r) => r.stairId === a.stairId).x, 4.9);
  p = M.updateStair(p, a.stairId, { shape: 'L' });
  assert.ok(M.stairById(p, a.stairId).width > 0 && M.stairById(p, a.stairId).turn === 'right');
  p = M.updateStair(p, a.stairId, { shape: 'straight' });
  assert.ok(!('turn' in M.stairById(p, a.stairId)) && !('width' in M.stairById(p, a.stairId)));
});
await test('挖掉楼梯的位置：被压到的房间切开，楼梯间不动', () => {
  const f = { id: 'x', rooms: [{ id: 'liv', type: 'living', name: '', x: 0, y: 0, w: 5, d: 5 }], openings: [] };
  const out = M.carveFloor(f, { x: 4, y: 1, w: 1, d: 3 });
  const area = out.rooms.reduce((t, r) => t + r.w * r.d, 0);
  assert.ok(Math.abs(area - (25 - 3)) < 1e-6, area);
  for (const r of out.rooms) assert.ok(!(r.x < 5 && r.x + r.w > 4 && r.y < 4 && r.y + r.d > 1), J(r));
  assert.equal(new Set(out.rooms.map((r) => r.id)).size, out.rooms.length);
  // 上面只剩 0.2m（太窄）：不切出一条窄缝，左边那块一直长到房间的上缘（不会多一道墙）
  const out2 = M.carveFloor({ id: 'x', rooms: [{ id: 'liv', type: 'living', name: '', x: 0, y: 3, w: 6.6, d: 4.5 }], openings: [] }, { x: 5.45, y: 3.2, w: 1, d: 4.3 });
  assert.deepEqual(out2.rooms.map((r) => [r.x, r.y, r.w, r.d]), [[0, 3, 5.45, 4.5]]);
});

await test('楼梯贴墙：离房间的边不到 35cm 就对齐过去（挖出来不会剩一条窄缝）', () => {
  const rooms = [
    { id: 'liv', type: 'living', name: '', x: 0, y: 3, w: 6.6, d: 4.5 },
    { id: 'kit', type: 'kitchen', name: '', x: 0, y: 0, w: 3, d: 3 },
    { id: 's1-gf', type: 'stair', stairId: 's1', name: '', x: 9, y: 9, w: 1, d: 3 },
  ];
  // 画在客厅里：上面差 0.2、右边差 0.15 → 贴到客厅的上缘和右缘；左边差 5.45（够宽）→ 不动；厨房没压到 → 不管
  assert.deepEqual(M.fitRectToRooms(rooms, { x: 5.45, y: 3.2, w: 1, d: 4.3 }), { x: 5.45, y: 3, w: 1.15, d: 4.5 });
  // 离得够远（≥ 35cm）→ 原样
  assert.deepEqual(M.fitRectToRooms(rooms, { x: 2, y: 4, w: 1, d: 3 }), { x: 2, y: 4, w: 1, d: 3 });
  // 挖完：客厅只剩一块，没有窄缝
  const out = M.carveFloor({ id: 'x', rooms, openings: [] }, M.fitRectToRooms(rooms, { x: 5.45, y: 3.2, w: 1, d: 4.3 }));
  assert.deepEqual(out.rooms.find((r) => r.id === 'liv'), { ...rooms[0], w: 5.45 });
});

console.log('楼板 / 天花 / 栏杆（给 3D）');
const area = (rs) => rs.reduce((t, r) => t + r.w * r.d, 0);
const hits = (rs, b) => rs.some((r) => r.x < b.x + b.w - 1e-6 && r.x + r.w > b.x + 1e-6 && r.y < b.y + b.d - 1e-6 && r.y + r.d > b.y + 1e-6);
await test('二楼楼板：楼梯间是洞、每个房间都盖到、外墙那边多 0.1m', () => {
  for (const id of ['terrace2', 'semid2']) {
    const p = T(id);
    const s = p.stairs[0];
    const plate = M.floorPlate(p, 'ff');
    assert.ok(!hits(plate, s), `${id} 楼板盖住了楼梯间`);
    const ff = M.floorById(p, 'ff');
    for (const r of ff.rooms.filter((x) => !x.stairId)) {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.d / 2;
      assert.ok(plate.some((q) => cx > q.x && cx < q.x + q.w && cy > q.y && cy < q.y + q.d), `${id} ${r.id} 没有楼板`);
    }
    const rooms = area(ff.rooms.filter((x) => !x.stairId));
    const a = area(plate);
    assert.ok(a > rooms && a < rooms + 8, `${id} 楼板 ${a.toFixed(2)} vs 房间 ${rooms.toFixed(2)}`);
    // 一楼的楼板（地面）没有洞
    assert.ok(hits(M.floorPlate(p, 'gf'), s));
  }
});
await test('车廊屋顶：车廊上面二楼没盖到的部分（阳台外面）', () => {
  const p = T('terrace2');
  const roof = M.porchRoofs(p, 'ff');
  assert.equal(roof.length, 1);
  assert.deepEqual(roof[0], { x: 0, y: 16.7, w: 6.1, d: 4 });
  assert.deepEqual(M.porchRoofs(p, 'gf'), []);
});
await test('天花：一楼扣掉往上的楼梯间、不含车廊；二楼含楼梯间（顶上有天花）', () => {
  const p = T('terrace2');
  const s = p.stairs[0];
  const gf = M.ceilingRects(p, 'gf');
  assert.ok(!hits(gf, s));
  assert.ok(!hits(gf, { x: 0, y: 15.3, w: 6.1, d: 5 }), '车廊不要天花');
  assert.ok(hits(M.ceilingRects(p, 'ff'), s));
});
await test('栏杆：二楼楼梯洞开放的那一边（不含出口、不含有墙的边）', () => {
  const p = T('terrace2');
  assert.deepEqual(M.voidEdges(p, 'ff'), [{ axis: 'z', c: 5.1, a: 6.6, b: 11.2, inward: 1, room: 's1-ff' }]);
  assert.deepEqual(M.voidEdges(p, 'gf'), []);
  const semi = M.voidEdges(T('semid2'), 'ff');
  assert.ok(semi.some((e) => e.axis === 'x' && e.c === 6.4) && semi.some((e) => e.axis === 'z' && e.c === 3.6 && e.b - e.a < 1.3), J(semi));
});
await test('扶手：直跑沿开放的那一边，从 0 到楼层高；靠分户墙那一边没有', () => {
  const rails = M.flightRails(T('terrace2'), 's1', buildAllWalls(T('terrace2')));
  assert.equal(rails.length, 1);
  assert.ok(rails[0].x1 === 5.1 && rails[0].z1 === 0 && rails[0].z2 === 3.35 && rails[0].y1 > rails[0].y2);
  assert.ok(M.flightRails(T('semid2'), 's1').length >= 2);
});
await test('外框：v2 = 所有楼层合起来；envelope 不含车廊', () => {
  const p = T('terrace2');
  assert.equal(M.bounds(p).d, 20.7);
  assert.equal(M.envelope(p.floors[0]).y1, 15.2);
  assert.deepEqual(Object.keys(buildAllWalls(p)), ['gf', 'ff']);
  assert.throws(() => buildWalls(p), /buildWalls takes a floor/);
});

console.log('检查（checkPlan）');
await test('模板都没有问题', () => {
  for (const t of TEMPLATES) assert.deepEqual(checkPlan(t.plan), [], t.id);
});
await test('Issue 的样子：code / level / floor / ids / zh / vars', () => {
  const p = migratePlan(V1());
  const bad = M.updateFloor(p, 'f0', (f) => ({ ...f, rooms: [...f.rooms, { id: 'x', type: 'bath', name: '', x: 4, y: 1, w: 2, d: 2 }, { id: 'y', type: 'store', name: '', x: 20, y: 0, w: 0.5, d: 2 }] }));
  const is = checkPlan(bad);
  const o = is.find((i) => i.code === 'overlap');
  assert.deepEqual(o, { code: 'overlap', level: 'error', floor: 'f0', ids: ['liv', 'x'], zh: '{0} 和 {1} 重叠了', vars: [{ room: 'liv' }, { room: 'x' }] });
  assert.ok(is.some((i) => i.code === 'tiny' && i.ids[0] === 'y' && i.level === 'warn'));
  // v1 也可以直接查
  assert.deepEqual(checkPlan(V1()), []);
});
await test('坏方案：noStairs / stairBlocked / overhang / voidLow / stairShort / stairNarrow / heights / stairMismatch', () => {
  assert.deepEqual(codes(M.removeStair(T('terrace2'), 's1')), ['noStairs']);
  // 二楼出口那边改成卧室（有墙）→ 被挡
  const blocked = M.updateFloor(T('terrace2'), 'ff', (f) => ({ ...f, rooms: f.rooms.map((r) => (r.id === 'f-cor2' ? { ...r, type: 'bedroom' } : r)) }));
  const b = checkPlan(blocked).filter((i) => i.code === 'stairBlocked');
  assert.equal(b.length, 1);
  assert.equal(b[0].floor, 'ff');
  // 一楼入口那边什么都没有（楼梯推到最外面）→ 被挡
  const out = M.updateFloor(T('terrace2'), 'gf', (f) => ({ ...f, rooms: f.rooms.filter((r) => r.id !== 'g-foy') }));
  assert.ok(checkPlan(out).some((i) => i.code === 'stairBlocked' && i.floor === 'gf'));
  // 刚加的空白二楼（只有楼梯间、还没画房间）：不报「被墙挡住」（编辑器提示沿着虚线画）
  const { plan: c2, floorId: up } = M.addFloor(T('condo3'), { copy: 'blank' });
  const { plan: c3, stairId } = M.addStair(c2, { from: 'f0', to: up, x: 5.45, y: 3, w: 1.15, d: 4.5 });
  assert.ok(stairId && !checkPlan(c3).some((i) => i.code === 'stairBlocked' && i.floor === up), J(checkPlan(c3)));
  // 二楼多一间卧室在一楼外面 → 悬空
  const over = M.updateFloor(T('terrace2'), 'ff', (f) => ({ ...f, rooms: [...f.rooms, { id: 'f-x', type: 'bedroom', name: '', x: 0, y: 21, w: 3, d: 3 }] }));
  const oh = checkPlan(over).find((i) => i.code === 'overhang');
  assert.ok(oh && oh.vars[1].room === 'f-x' && oh.vars[2] === 9, J(oh));
  // 阳台可以悬挑 1.5m
  const bal = M.updateFloor(T('terrace2'), 'ff', (f) => ({ ...f, rooms: f.rooms.map((r) => (r.id === 'f-bal' ? { ...r, y: 20.6, d: 1.4 } : r)) }));
  assert.ok(!codes(bal).includes('overhang'), J(checkPlan(bal)));
  // 一楼的挑空
  const vl = M.updateFloor(T('condo3'), 'f0', (f) => ({ ...f, rooms: [...f.rooms, { id: 'v', type: 'void', name: '', x: 12, y: 0, w: 2, d: 2 }] }));
  assert.ok(codes(vl).includes('voidLow'));
  // 楼梯太短 / 太窄
  const short = checkPlan(M.updateStair(T('terrace2'), 's1', { d: 3.0 })).find((i) => i.code === 'stairShort');
  assert.deepEqual(short.vars, [19, 4.59, 3]);
  assert.ok(codes(M.updateStair(T('terrace2'), 's1', { w: 0.8 })).includes('stairNarrow'));
  // 楼层高太低（原样的数字，还没规范化）
  const raw = T('terrace2');
  raw.floors[0].height = 3.1;
  assert.ok(checkPlan(raw).some((i) => i.code === 'heights' && i.floor === 'gf' && i.vars[1] === 3.1));
  // 楼梯间和楼梯对不上（原样的数字）
  const mm = T('terrace2');
  mm.floors[1].rooms.find((r) => r.stairId).x = 4.0;
  assert.ok(codes(mm).includes('stairMismatch'));
  assert.ok(!codes(migratePlan(mm)).includes('stairMismatch'), 'syncStairs 之后就对上了');
});

console.log('按层摆家具');
await test('每件家具都有 floor，而且就是它房间那一层；v1 → f0', () => {
  for (const id of ['terrace2', 'semid2']) {
    const p = T(id);
    for (const it of furnish(p, buildAllWalls(p), FULL)) assert.equal(it.floor, M.roomFloor(p, it.room), `${id} ${it.kind}`);
  }
  assert.ok(furnish(V1(), undefined, null).every((i) => i.floor === 'f0'));
  // walls 可以不给 / 给一层的数组 / 给 map，结果一样（除了随机 id）
  const p = T('terrace2');
  const strip = (its) => J(its.map(({ id, ...x }) => x));
  assert.equal(strip(furnish(p, undefined, FULL)), strip(furnish(p, buildAllWalls(p), FULL)));
  const c = T('condo3');
  assert.equal(strip(furnish(c, buildWalls(c.floors[0]), FULL)), strip(furnish(c, undefined, FULL)));
});
await test('只摆一次的都在一楼：神台、鞋柜 + 换鞋凳、宠物窝', () => {
  for (const id of ['terrace2', 'semid2']) {
    const p = T(id);
    const items = furnish(p, buildAllWalls(p), FULL);
    for (const k of ['altar', 'shoeCabinet', 'bench', 'petBed']) {
      const its = items.filter((i) => i.kind === k);
      assert.ok(its.length >= 1, `${id} 没有 ${k}`);
      assert.ok(its.every((i) => i.floor === 'gf'), `${id} ${k} 在楼上`);
    }
  }
});
await test('起居厅像小客厅（沙发、茶几、地毯）；有小孩 → 玩具柜、在家上班 → 书桌（没有书房时）', () => {
  for (const id of ['terrace2', 'semid2']) {
    const p = T(id);
    const items = furnish(p, buildAllWalls(p), FULL);
    const fam = p.floors[1].rooms.find((r) => r.type === 'family');
    const its = items.filter((i) => i.room === fam.id).map((i) => i.kind);
    for (const k of ['sofa', 'coffeeTable', 'rug']) assert.ok(its.includes(k), `${id} 起居厅缺 ${k}：${its}`);
    assert.ok(its.includes('toyStorage') || its.includes('desk'), `${id} 起居厅：${its}`);
    assert.ok(!items.some((i) => i.room === fam.id && ['altar', 'shoeCabinet', 'petBed'].includes(i.kind)));
    // 主卧不再放书桌（书桌去了起居厅）
    const mst = p.floors[1].rooms.find((r) => r.type === 'master');
    assert.ok(!items.some((i) => i.room === mst.id && i.kind === 'desk'), `${id} 主卧有书桌`);
  }
});
await test('楼梯间、挑空不放东西；楼梯口外面 1m 整段留空（下层入口、上层出口）', () => {
  for (const id of ['terrace2', 'semid2']) {
    const p = T(id);
    const wm = buildAllWalls(p);
    for (const prof of [FULL, null]) {
      const items = furnish(p, wm, prof);
      assert.ok(!items.some((i) => ROOM_TYPES[M.floorById(p, i.floor).rooms.find((r) => r.id === i.room).type].nofurn), `${id} 楼梯间里有家具`);
      const s = p.stairs[0];
      const g = M.stairFlights(p, s.id);
      for (const [fid, mouth] of [
        [s.from, g.entry],
        [s.to, g.exit],
      ]) {
        const { seg, edge } = mouth;
        const horiz = seg.y0 === seg.y1;
        const box = horiz ? { x0: seg.x0, x1: seg.x1, z0: edge === 'N' ? seg.y0 - 1 : seg.y0, z1: edge === 'N' ? seg.y0 : seg.y0 + 1 } : { x0: edge === 'W' ? seg.x0 - 1 : seg.x0, x1: edge === 'W' ? seg.x0 : seg.x0 + 1, z0: seg.y0, z1: seg.y1 };
        for (const it of items.filter((i) => i.floor === fid && !FLAT.has(i.kind))) assert.ok(!ov(footprintOf(it), box, -0.02), `${id} ${it.kind} 挡住 ${fid} 的楼梯口`);
        // roomFrame 也知道这个禁区（给设计师叠图）
        const room = M.floorById(p, fid).rooms.find((r) => inRoom(r, { x: (box.x0 + box.x1) / 2, y: (box.z0 + box.z1) / 2 }));
        const fr = roomFrame(p, wm[fid], room);
        assert.ok(fr.keep.some((k) => k.kind === 'stair' && k.full), `${id} ${room.id} 没有楼梯口禁区`);
      }
    }
  }
});
await test('楼上的卧室照样有床和衣柜', () => {
  for (const id of ['terrace2', 'semid2']) {
    const p = T(id);
    const items = furnish(p, buildAllWalls(p), FULL);
    for (const r of p.floors[1].rooms.filter((x) => ['master', 'bedroom'].includes(x.type))) {
      assert.ok(items.some((i) => i.room === r.id && i.kind === 'bed'), `${id} ${r.id} 没有床`);
      assert.ok(items.some((i) => i.room === r.id && i.kind === 'wardrobe'), `${id} ${r.id} 没有衣柜`);
    }
  }
});
await test('收纳对账：每一行都有 floor；鞋柜只算一楼的', () => {
  const p = T('terrace2');
  const wm = buildAllWalls(p);
  const items = furnish(p, wm, FULL);
  const rows = furnishReport(p, wm, FULL, items);
  for (const r of rows) assert.equal(r.floor, r.room ? M.roomFloor(p, r.room) : null, r.key);
  assert.ok(rows.some((r) => r.floor === 'ff'));
  // 楼上放一个「鞋柜」也不算进鞋子
  const fake = { ...items.find((i) => i.kind === 'shoeCabinet'), id: 'fx', room: 'f-cor1', floor: 'ff', w: 5 };
  const shoe = furnishReport(p, wm, FULL, [...items, fake]).find((r) => r.key === 'shoe');
  assert.equal(shoe.placed, rows.find((r) => r.key === 'shoe').placed);
  assert.ok(!shoe.itemIds.includes('fx'));
});

console.log('存档 / 分享链接 / 底图（store.js）');
// 假的 localStorage + IndexedDB（只有 store.js 用到的那几个调用）
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const idb = new Map();
const later = (fn) => setTimeout(fn, 0);
globalThis.indexedDB = {
  open() {
    const req = {};
    later(() => {
      req.result = {
        createObjectStore: () => {},
        transaction() {
          const tx = {};
          tx.objectStore = () => ({
            get(k) {
              const r = {};
              later(() => {
                r.result = idb.has(k) ? structuredClone(idb.get(k)) : undefined;
                r.onsuccess?.();
              });
              return r;
            },
            put(v, k) {
              idb.set(k, structuredClone(v));
              later(() => tx.oncomplete?.());
            },
            delete(k) {
              idb.delete(k);
              later(() => tx.oncomplete?.());
            },
          });
          return tx;
        },
      };
      req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  },
};
const S = await import('../src/studio/store.js');
const { packJSON } = await import('../src/shared/profile.js');
const strip = (p) => J({ ...p, furniture: p.furniture.map(({ id, ...x }) => x).sort((a, b) => J(a).localeCompare(J(b))) });

await test('migrateProject：每件家具记下楼层（按房间）；幂等；furnitureUpper 合进来', () => {
  const p = S.createProject({ plan: T('terrace2'), profile: FULL });
  assert.ok(p.furniture.every((i) => i.floor === M.roomFloor(p.plan, i.room)));
  assert.equal(J(S.migrateProject(p)), J(p));
  const old = { id: 'p1', plan: V1(), furniture: [{ id: 'a', kind: 'sofa', room: 'liv', x: 1, z: 1, rot: 0 }, { id: 'b', kind: 'plant', room: null, x: 9, z: 9, rot: 0 }], furnitureUpper: [{ id: 'c', kind: 'bed', room: 'nope', floor: 'zz', x: 0, z: 0, rot: 0 }] };
  const m = S.migrateProject(old);
  assert.deepEqual(m.furniture.map((i) => i.floor), ['f0', 'f0', 'f0']);
  assert.ok(!('furnitureUpper' in m));
  assert.equal(J(S.migrateProject(m)), J(m));
});
await test('存档形来回一趟不变；一楼镜像 = floors[0]，楼上的家具在 furnitureUpper', () => {
  const p = S.createProject({ plan: T('terrace2'), profile: FULL });
  const s = JSON.parse(JSON.stringify(S.toStoredProject(p)));
  assert.equal(s.plan.v, 2);
  assert.deepEqual(s.plan.rooms, p.plan.floors[0].rooms);
  assert.deepEqual(s.plan.openings, p.plan.floors[0].openings);
  assert.equal(s.plan.wallH, 3.0);
  assert.ok(s.furniture.length && s.furniture.every((i) => i.floor === 'gf'));
  assert.ok(s.furnitureUpper.length && s.furnitureUpper.every((i) => i.floor === 'ff'));
  assert.equal(strip(S.fromStoredProject(s)), strip(p));
  // 一层的方案不加 furnitureUpper
  assert.ok(!('furnitureUpper' in S.toStoredProject(S.createProject({ plan: T('condo3') }))));
});
await test('旧版（v1）的读法照样能用：墙、家具、一楼都完整', () => {
  const p = S.createProject({ plan: T('terrace2'), profile: FULL });
  const s = JSON.parse(JSON.stringify(S.toStoredProject(p)));
  // 旧版只看 plan.rooms / openings / wallH 和 furniture
  const walls = buildWalls(s.plan);
  assert.equal(J(walls), J(buildWalls(p.plan.floors[0])));
  const ids = new Set(s.plan.rooms.map((r) => r.id));
  assert.ok(s.furniture.every((i) => ids.has(i.room)), '一楼的家具都在一楼的房间里');
  const v1 = { v: 1, name: s.plan.name, wallH: s.plan.wallH, north: s.plan.north, rooms: s.plan.rooms, openings: s.plan.openings };
  const its = furnish(v1, buildWalls(v1), FULL);
  assert.ok(its.length > 15 && its.every((i) => ids.has(i.room)));
  assert.deepEqual(checkPlan(v1).filter((i) => i.code !== 'tiny'), []);
  // 旧版的编辑器改了一楼（镜像），楼上照留，一楼以镜像为准
  const edited = { ...s, plan: { ...s.plan, rooms: s.plan.rooms.map((r) => (r.id === 'g-gbd' ? { ...r, name: '老人房' } : r)) } };
  const back = S.fromStoredProject(edited);
  assert.equal(back.plan.floors[0].rooms.find((r) => r.id === 'g-gbd').name, '老人房');
  assert.equal(back.plan.floors.length, 2);
  assert.equal(back.furniture.filter((i) => i.floor === 'ff').length, s.furnitureUpper.length);
});
await test('旧的 v1 分享链接 → v2（一楼 f0，家具都在 f0）；v2 链接来回', async () => {
  const old = await packJSON({ v: 1, id: 'p-old', name: '旧方案', plan: V1(), furniture: [{ id: 'a', kind: 'sofa', room: 'liv', x: 2, z: 2, rot: 0, w: 2, d: 0.9 }], materials: {}, mood: 'cozy', time: 18, profile: null });
  const p = await S.unpackProject(old);
  assert.equal(p.plan.v, 2);
  assert.deepEqual(p.plan.floors.map((f) => f.id), ['f0']);
  assert.equal(p.plan.floors[0].ceil, 3.0);
  assert.equal(p.furniture[0].floor, 'f0');
  assert.equal(p.sharedFrom, 'p-old');
  assert.notEqual(p.id, 'p-old');
  const two = S.createProject({ plan: T('semid2'), profile: FULL });
  const packed = await S.packProject(two);
  const raw = await (await import('../src/shared/profile.js')).unpackJSON(packed);
  assert.equal(raw.v, 2);
  assert.ok(Array.isArray(raw.plan.rooms), '旧版检查 p.plan.rooms 能过');
  const back = await S.unpackProject(packed);
  assert.equal(J(back.plan), J(two.plan));
  assert.equal(strip({ furniture: back.furniture }), strip({ furniture: two.furniture }));
  await assert.rejects(S.unpackProject(await packJSON({ v: 2, plan: { nothing: 1 } })));
});
await test('本机存档：存的是存档形，读出来是 v2；旧版存的 v1 方案也读得出来', () => {
  mem.clear();
  const p = S.createProject({ plan: T('terrace2') });
  S.saveProject(p);
  const raw = JSON.parse(mem.get('genie.studio.projects.v1'));
  assert.ok(Array.isArray(raw[0].plan.rooms) && raw[0].plan.floors.length === 2);
  const cur = S.currentProject();
  assert.equal(cur.id, p.id);
  assert.ok(!('rooms' in cur.plan) && cur.plan.floors.length === 2);
  // 旧版 build 存的 v1 方案
  mem.set('genie.studio.projects.v1', JSON.stringify([{ id: 'old', name: 'x', plan: V1(), furniture: [{ id: 'a', kind: 'sofa', room: 'liv', x: 1, z: 1, rot: 0 }] }, ...raw]));
  const l = S.loadProjects();
  assert.equal(l[0].plan.v, 2);
  assert.equal(l[0].furniture[0].floor, 'f0');
  assert.equal(l.length, 2);
  S.deleteProject('old');
  assert.equal(S.loadProjects().length, 1);
});
await test('createProject：模板 / v1 / 没给 → v2（问卷交接 #p= 走的是 condo3）', () => {
  for (const plan of [T('condo3'), V1(), undefined]) {
    const p = S.createProject({ plan });
    assert.equal(p.plan.v, 2);
    assert.ok(p.furniture.every((i) => i.floor === p.plan.floors[0].id));
  }
});
await test('设置：识别模型默认 auto；旧版默认的 gemini-2.5-flash → auto；自己填的照留', () => {
  mem.clear();
  assert.equal(S.DEFAULT_SETTINGS.visionModel, 'auto');
  assert.equal(S.loadSettings().visionModel, 'auto');
  mem.set('genie.settings.v1', JSON.stringify({ apiKey: 'k', visionModel: 'gemini-2.5-flash' }));
  assert.equal(S.loadSettings().visionModel, 'auto');
  mem.set('genie.settings.v1', JSON.stringify({ apiKey: 'k', visionModel: 'gemini-2.5-pro' }));
  assert.equal(S.loadSettings().visionModel, 'gemini-2.5-pro');
});
await test('底图：每层一张；旧版存的一张 = 一楼；旧接口 getUnderlay / putUnderlay 只动一楼', async () => {
  mem.clear();
  idb.clear();
  const u = (k) => ({ src: `data:image/png;base64,${k}`, x: 0, y: 0, w: 6, h: 9, opacity: 0.5, iw: 600, ih: 900 });
  // 旧的一层方案：底图存的是一张
  idb.set('p-old', u('old'));
  assert.deepEqual(await S.getUnderlays('p-old'), { f0: u('old') });
  // 两层的方案（一楼 id = gf）
  const p = S.createProject({ plan: T('terrace2') });
  S.saveProject(p);
  idb.set(p.id, u('one'));
  assert.deepEqual(await S.getUnderlays(p.id), { gf: u('one') });
  await S.putUnderlays(p.id, { gf: u('g'), ff: u('f'), x: null });
  assert.deepEqual(idb.get(p.id), { v: 2, floors: { gf: u('g'), ff: u('f') } });
  assert.deepEqual(await S.getUnderlays(p.id), { gf: u('g'), ff: u('f') });
  assert.deepEqual(await S.getUnderlay(p.id), u('g'));
  await S.putUnderlay(p.id, u('g2'));
  assert.deepEqual(await S.getUnderlays(p.id), { gf: u('g2'), ff: u('f') });
  await S.putUnderlays(p.id, {});
  assert.ok(!idb.has(p.id));
  assert.deepEqual(await S.getUnderlays(p.id), {});
  assert.equal(await S.getUnderlay(p.id), null);
});

console.log('静态守门');
await test('src 里除了 model.js / store.js，不直接读 plan.rooms / plan.openings / plan.wallH', () => {
  // 其他人还在改的文件先列在这里（跑的时候提醒）；现在都改完了
  const PENDING = new Set([]);
  const OK = new Set(['src/studio/plan/model.js', 'src/studio/store.js']);
  const RE = /\bplan\??\.(rooms|openings|wallH)\b/;
  const walk = (d, acc = []) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p, acc);
      else if (/\.(jsx?|mjs)$/.test(f)) acc.push(p);
    }
    return acc;
  };
  const bad = [];
  const pending = [];
  for (const file of walk(path.join(ROOT, 'src'))) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (OK.has(rel)) continue;
    const lines = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((l, i) => [l.replace(/\/\/.*$/, ''), i + 1])
      .filter(([l]) => RE.test(l));
    for (const [l, i] of lines) (PENDING.has(rel) ? pending : bad).push(`${rel}:${i}  ${l.trim().slice(0, 100)}`);
  }
  if (pending.length) console.log(`    （还在改：${[...new Set(pending.map((x) => x.split(':')[0]))].join('、')} —— ${pending.length} 处）`);
  assert.deepEqual(bad, []);
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
