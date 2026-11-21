// 走进去 · 导航（src/studio/walk/nav.js —— docs/walk/SPEC.md §2）：
//   每一个模板（含隐藏的 terrace），有家具、没家具都测：大门里面的起点走得过去；从那里每一层的每一个房间都走得到
//   （楼梯间、挑空除外）；拉直以后的路每 2cm 采一个点，都不穿实墙 / 窗、离障碍 ≥ 半径；terrace2 / semid2 跨楼层走楼梯，
//   楼梯上下口走得过去；墙里、家具里的点 nearest() 拉得出来；挪了家具 rebuildFloor 跟着变；建 < 150ms，找路 < 20ms。
// 跑：node test/walk-nav.test.mjs

import assert from 'node:assert/strict';
import * as M from '../src/studio/plan/model.js';
import { furnish, footprintOf, mainEntrance } from '../src/studio/engine/furnish.js';
import { CATALOG } from '../src/studio/engine/furniture.js';
import * as N from '../src/studio/walk/nav.js';

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

console.log('走进去 · 导航（walk-nav）');

const R = 0.22;
const TPL = M.TEMPLATES.map((t) => t.id);
const SKIP_ROOM = (r) => r.stairId || M.ROOM_TYPES[r.type]?.stair || M.ROOM_TYPES[r.type]?.void;

/** 一个模板：plan、navData、家具、两份 nav（没家具 / 有家具） */
const cases = new Map();
function caseOf(id) {
  if (cases.has(id)) return cases.get(id);
  const plan = M.templatePlan(id);
  const nd = N.navDataOf(plan);
  const items = furnish(plan, M.buildAllWalls(plan));
  const c = { id, plan, nd, items, bare: N.buildNav(nd, []), furn: N.buildNav(nd, items) };
  cases.set(id, c);
  return c;
}

/** 大门里面一点（和 nav 无关，直接从 plan 算）：门洞穿过的位置往室内 0.6m */
function doorStart(nd) {
  const f = nd.floors[0];
  const m = mainEntrance(f, f.walls);
  if (!m) return null;
  const w = f.walls.find((x) => x.pieces.some((p) => p.openingId === m.id));
  const p = w.pieces.find((x) => x.openingId === m.id);
  const isIn = (r) => !!r && !M.ROOM_TYPES[r.type]?.outdoor;
  const inward = isIn(w.neg) && !isIn(w.pos) ? -1 : 1;
  const at = N.doorCross(p);
  return w.axis === 'x' ? { fi: 0, x: at, z: w.c + inward * 0.6 } : { fi: 0, x: w.c + inward * 0.6, z: at };
}

/** 实墙 / 窗 / 高窗台趟门的墙体，和 house.js 画的一样（碰到墙头的一块多伸半个墙厚）；栏杆 / 车廊矮墙整段；趟门的竖框 */
function solids(nd, fi) {
  const out = [];
  const isIn = (r) => !!r && !M.ROOM_TYPES[r.type]?.outdoor;
  for (const w of nd.floors[fi].walls) {
    const h = w.t / 2;
    const band = (a, b, hh = h) => (w.axis === 'x' ? { x0: a, z0: w.c - hh, x1: b, z1: w.c + hh, w } : { x0: w.c - hh, z0: a, x1: w.c + hh, z1: b, w });
    const rail = (w.neg && !w.pos && !isIn(w.neg)) || (w.pos && !w.neg && !isIn(w.pos));
    if (rail) {
      out.push(band(w.a, w.b));
      continue;
    }
    for (const p of w.pieces) {
      const a = Math.abs(p.a - w.a) < 0.01 ? p.a - h : p.a;
      const b = Math.abs(p.b - w.b) < 0.01 ? p.b + h : p.b;
      if (p.kind === 'solid' || p.kind === 'window' || (p.kind === 'slider' && p.sill > 0.3)) out.push(band(a, b));
      else if (p.kind === 'slider') {
        const len = p.b - p.a;
        const k = Math.max(1, Math.round(len / 1.0));
        for (let i = 1; i < k; i++) out.push(band(p.a + (len / k) * i - 0.0175, p.a + (len / k) * i + 0.0175, 0.03));
      }
    }
  }
  return out;
}

const distRect = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

/** 一段路每 2cm 一个点 */
function samples(pts, step = 0.02) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const k = Math.max(1, Math.ceil(L / step));
    for (let s = 0; s <= k; s++) out.push({ x: a.x + ((b.x - a.x) * s) / k, z: a.z + ((b.z - a.z) * s) / k });
  }
  return out;
}

/** 检查一条路：腿接得上、每一个采样点 clearance ≥ 半径、离实墙 / 窗 / 竖框 ≥ 半径（减 3cm 插值误差）、不压家具 */
function checkPath(c, nav, p, label) {
  assert.ok(p && p.legs.length, `${label}：没有路`);
  let len = 0;
  p.legs.forEach((l, i) => {
    assert.ok(l.pts.length >= 2, `${label}：第 ${i} 段少于两个点`);
    if (i) {
      const a = p.legs[i - 1].pts.at(-1);
      const b = l.pts[0];
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.5, `${label}：第 ${i} 段接不上`);
    }
    for (let k = 1; k < l.pts.length; k++) len += Math.hypot(l.pts[k].x - l.pts[k - 1].x, l.pts[k].z - l.pts[k - 1].z, (l.pts[k].y || 0) - (l.pts[k - 1].y || 0));
    if (l.kind !== 'walk') return;
    const walls = solids(c.nd, l.fi);
    const fid = c.nd.floors[l.fi].id;
    const furn = nav === c.furn ? c.items.filter((it) => it.floor === fid && !N.SKIP_KINDS.has(it.kind)).map(footprintOf) : [];
    for (const q of samples(l.pts)) {
      const cl = N.clearance(nav, { fi: l.fi, ...q });
      assert.ok(cl >= R - 1e-5, `${label}：(${q.x.toFixed(2)}, ${q.z.toFixed(2)}) clearance ${cl.toFixed(3)} < ${R}`);
      for (const r of walls) {
        const d = distRect(r, q.x, q.z);
        assert.ok(d >= R - 0.03, `${label}：(${q.x.toFixed(2)}, ${q.z.toFixed(2)}) 离墙 ${r.w.id} 只有 ${d.toFixed(3)}m`);
      }
      for (const r of furn) assert.ok(distRect(r, q.x, q.z) >= R - 0.03, `${label}：(${q.x.toFixed(2)}, ${q.z.toFixed(2)}) 贴着家具`);
    }
  });
  assert.ok(Math.abs(len - p.length) < 1e-6, `${label}：length ${p.length} ≠ ${len}`);
}

/** 房间里离障碍最远、从大门走得到的格子中心（找不到 → null） */
function roomTarget(nav, fi, r) {
  const F = nav.floors[fi];
  let best = null;
  for (let j = 0; j < F.nz; j++)
    for (let i = 0; i < F.nx; i++) {
      const k = j * F.nx + i;
      if (!F.reach[k]) continue;
      const x = F.x0 + (i + 0.5) * F.cell;
      const z = F.z0 + (j + 0.5) * F.cell;
      if (x <= r.x || x >= r.x + r.w || z <= r.y || z >= r.y + r.d) continue;
      if (!best || F.clear[k] > best.c) best = { fi, x, z, c: F.clear[k] };
    }
  return best;
}

/** 逐格硬算：走得到的格子中心离 p 最近多远 */
function bruteNearest(nav, p) {
  const F = nav.floors[p.fi];
  let best = Infinity;
  for (let j = 0; j < F.nz; j++)
    for (let i = 0; i < F.nx; i++) {
      const k = j * F.nx + i;
      if (F.reach[k]) best = Math.min(best, Math.hypot(F.x0 + (i + 0.5) * F.cell - p.x, F.z0 + (j + 0.5) * F.cell - p.z));
    }
  return best;
}

// ───────────────────────── 1. 基本 ─────────────────────────

await test('SKIP_KINDS = CATALOG 里 flat / ceiling / wallMounted 的 + 窗帘', () => {
  const want = Object.entries(CATALOG)
    .filter(([k, d]) => d.flat || d.ceiling || d.wallMounted || k === 'curtains')
    .map(([k]) => k)
    .sort();
  assert.deepEqual([...N.SKIP_KINDS].sort(), want);
});

await test('navDataOf：和 Engine.navData() 一样的形状（楼层高度 = elevations，墙 = buildAllWalls，楼梯 = stairPath）', () => {
  const plan = M.templatePlan('semid2');
  const nd = N.navDataOf(plan);
  const walls = M.buildAllWalls(plan);
  const elev = M.elevations(plan);
  assert.equal(nd.floors.length, 2);
  nd.floors.forEach((f, i) => {
    const pf = plan.floors[i];
    assert.deepEqual(Object.keys(f).sort(), ['ceil', 'elev', 'height', 'id', 'level', 'openings', 'rooms', 'walls'].sort());
    assert.equal(f.id, pf.id);
    assert.equal(f.level, i);
    assert.equal(f.elev, elev[pf.id]);
    assert.equal(f.ceil, pf.ceil);
    assert.equal(f.height, pf.height);
    assert.deepEqual(f.walls, walls[pf.id]);
  });
  assert.deepEqual(nd.stairs, [M.stairPath(plan, 's1')]);
  // 一层的旧版 plan 也行
  const nd1 = N.navDataOf({ v: 1, wallH: 2.8, rooms: [{ id: 'a', type: 'living', x: 0, y: 0, w: 4, d: 4 }], openings: [] });
  assert.equal(nd1.floors.length, 1);
  assert.equal(nd1.stairs.length, 0);
});

await test('nav 的形状：每层 { id, elev, x0, z0, nx, nz, cell, grid, clear }，外框 = 房间 + 1.5m 以上', () => {
  for (const id of TPL) {
    const { nd, furn } = caseOf(id);
    assert.equal(furn.floors.length, nd.floors.length, id);
    assert.equal(furn.radius, R);
    furn.floors.forEach((F, fi) => {
      const f = nd.floors[fi];
      assert.equal(F.id, f.id);
      assert.equal(F.elev, f.elev);
      assert.equal(F.cell, 0.1);
      assert.ok(F.grid instanceof Uint8Array && F.grid.length === F.nx * F.nz);
      assert.ok(F.clear instanceof Float32Array && F.clear.length === F.nx * F.nz);
      const b = M.bounds({ rooms: f.rooms });
      assert.ok(F.x0 <= b.x0 - 1.5 + 1e-9 && F.z0 <= b.y0 - 1.5 + 1e-9, `${id} ${f.id} 左上`);
      assert.ok(F.x0 + F.nx * F.cell >= b.x1 + 1.5 - 1e-9 && F.z0 + F.nz * F.cell >= b.y1 + 1.5 - 1e-9, `${id} ${f.id} 右下`);
    });
  }
});

await test('格子：房间里是空的，房间外、挑空、楼梯间、实墙是挡住的；门洞 / 打通 / 低趟门留空', () => {
  const { nd, bare } = caseOf('semid2');
  const at = (fi, x, z) => {
    const F = bare.floors[fi];
    return F.grid[Math.floor((z - F.z0) / F.cell) * F.nx + Math.floor((x - F.x0) / F.cell)];
  };
  assert.equal(at(0, 2.0, 12.0), 0, '客厅中间');
  assert.equal(at(0, 5.0, 18.0), 0, '车廊（室外的房间也能走）');
  assert.equal(at(0, -1.0, 8.0), 1, '房子外面');
  assert.equal(at(0, 1.8, 5.2), 1, '一楼楼梯间（梯段）');
  assert.equal(at(1, 1.8, 5.2), 1, '二楼楼梯间（洞）');
  assert.equal(at(0, 9.6, 8.0), 1, '外墙（窗也算墙）');
  assert.equal(at(0, 7.1, 14.4), 0, '大门门洞');
  assert.equal(at(0, 7.1, 15.6), 0, '大门外（车廊）');
  assert.equal(at(0, 3.1, 14.4), 0, '趟门的一扇（窗台 0）');
  assert.equal(at(0, 2.6, 14.4), 1, '趟门的竖框');
  assert.equal(at(0, 5.8, 5.2), 0, '打通');
  // condo3：大门开在外墙上，门外 1.5m 是空地，再外面挡住
  const c = caseOf('condo3');
  const F = c.bare.floors[0];
  const g = (x, z) => F.grid[Math.floor((z - F.z0) / F.cell) * F.nx + Math.floor((x - F.x0) / F.cell)];
  assert.equal(g(5.45, 9.7), 0, '大门外的空地');
  assert.equal(g(5.45, 10.55), 1, '空地再外面（格子最外一圈）');
  assert.equal(g(5.45, 10.45), 0, '空地 1.5m 深');
  assert.equal(g(3.0, 9.7), 1, '别的地方的房子外面');
  // 挑空：自己画一个有挑空的二层
  const plan = M.templatePlan('terrace2');
  const ff = plan.floors[1];
  ff.rooms = ff.rooms.map((r) => (r.id === 'f-fam' ? { ...r, type: 'void' } : r));
  const nav = N.buildNav(N.navDataOf(plan), []);
  const H = nav.floors[1];
  assert.equal(H.grid[Math.floor((9.4 - H.z0) / H.cell) * H.nx + Math.floor((2.5 - H.x0) / H.cell)], 1, '挑空');
  assert.equal(nav.floors[0].grid[Math.floor((9.4 - nav.floors[0].z0) / 0.1) * nav.floors[0].nx + Math.floor((2.5 - nav.floors[0].x0) / 0.1)], 0, '挑空下面（一楼）照样能走');
  assert.equal(N.roomAt(nav, { fi: 1, x: 2.5, z: 9.4 })?.type, 'void');
});

// ───────────────────────── 2. 每个模板：起点、每个房间、路 ─────────────────────────

for (const id of TPL) {
  for (const mode of ['bare', 'furn']) {
    await test(`${id}（${mode === 'furn' ? '有家具' : '没家具'}）：大门起点走得过去，每一层的每个房间都走得到，路不穿墙、不贴边`, () => {
      const c = caseOf(id);
      const nav = c[mode];
      const s = doorStart(c.nd);
      assert.ok(s, `${id} 没有大门`);
      assert.ok(N.passable(nav, s), `${id} 大门起点 (${s.x}, ${s.z}) 走不过去：clearance ${N.clearance(nav, s).toFixed(3)}`);
      assert.ok(nav.start && N.passable(nav, nav.start), `${id} nav.start`);
      assert.ok(Math.hypot(nav.start.x - s.x, nav.start.z - s.z) < 1e-9, `${id} nav.start 和大门起点不一样`);
      assert.equal(N.nearest(nav, s).x, s.x, `${id} 起点本身就是 nearest`);
      let count = 0;
      c.nd.floors.forEach((f, fi) => {
        for (const r of f.rooms) {
          if (SKIP_ROOM(r)) continue;
          const tgt = roomTarget(nav, fi, r);
          assert.ok(tgt, `${id} ${f.id} ${r.id}（${r.type}）走不到`);
          assert.equal(N.roomAt(nav, tgt)?.id, r.id, `${id} roomAt ${r.id}`);
          const p = N.path(nav, s, tgt);
          checkPath(c, nav, p, `${id} → ${r.id}`);
          const last = p.legs.at(-1);
          assert.equal(last.fi, fi, `${id} → ${r.id} 到错楼层`);
          assert.ok(Math.hypot(last.pts.at(-1).x - tgt.x, last.pts.at(-1).z - tgt.z) < 1e-9, `${id} → ${r.id} 终点不对`);
          assert.equal(p.legs.filter((l) => l.kind === 'stair').length, Math.abs(fi), `${id} → ${r.id} 楼梯段数`);
          count++;
        }
      });
      assert.ok(count >= 5, `${id} 才 ${count} 个房间`);
    });
  }
}

// ───────────────────────── 3. 楼梯 ─────────────────────────

for (const id of ['terrace2', 'semid2']) {
  await test(`${id}：楼梯连起来，上下口走得过去；上楼、下楼的路都走楼梯，高度接得上`, () => {
    const c = caseOf(id);
    for (const nav of [c.bare, c.furn]) {
      assert.equal(nav.stairs.length, 1);
      const s = nav.stairs[0];
      const sp = c.nd.stairs[0];
      assert.equal(s.stair, sp.id);
      assert.deepEqual([s.from, s.to], [0, 1]);
      assert.deepEqual(s.entry, { x: sp.entry.x, z: sp.entry.y });
      assert.deepEqual(s.exit, { x: sp.exit.x, z: sp.exit.y });
      assert.ok(N.passable(nav, { fi: 0, ...s.entry }), `${id} 楼梯起步口`);
      assert.ok(N.passable(nav, { fi: 1, ...s.exit }), `${id} 楼梯出口`);
      let L = 0;
      for (let i = 1; i < s.pts.length; i++) L += Math.hypot(s.pts[i].x - s.pts[i - 1].x, s.pts[i].z - s.pts[i - 1].z, s.pts[i].y - s.pts[i - 1].y);
      assert.ok(Math.abs(L - s.length) < 1e-9);
      assert.ok(s.length > sp.rise * sp.risers, '折线长 > 层高');
      // 上楼：大门 → 二楼主卧
      const mst = c.nd.floors[1].rooms.find((r) => r.type === 'master');
      const up = N.path(nav, nav.start, roomTarget(nav, 1, mst));
      checkPath(c, nav, up, `${id} 上楼`);
      assert.deepEqual(
        up.legs.map((l) => l.kind),
        ['walk', 'stair', 'walk'],
      );
      const st = up.legs[1];
      assert.equal(st.stair, sp.id);
      assert.deepEqual([st.from, st.to], [0, 1]);
      assert.equal(st.pts[0].y, 0);
      assert.ok(Math.abs(st.pts.at(-1).y - nav.floors[1].elev + nav.floors[0].elev) < 1e-9, '上到二楼的高度');
      assert.deepEqual({ x: up.legs[0].pts.at(-1).x, z: up.legs[0].pts.at(-1).z }, s.entry, '走到起步口');
      assert.deepEqual({ x: up.legs[2].pts[0].x, z: up.legs[2].pts[0].z }, s.exit, '从出口走出来');
      // 下楼：反过来；y 从 from（楼上）量起 → 眼睛高度 = floors[from].elev + y
      const down = N.path(nav, roomTarget(nav, 1, mst), nav.start);
      checkPath(c, nav, down, `${id} 下楼`);
      const sd = down.legs[1];
      assert.deepEqual([sd.from, sd.to], [1, 0]);
      const eye = (leg, q) => nav.floors[leg.from].elev + q.y;
      assert.ok(Math.abs(eye(sd, sd.pts[0]) - nav.floors[1].elev) < 1e-9);
      assert.ok(Math.abs(eye(sd, sd.pts.at(-1)) - nav.floors[0].elev) < 1e-9);
      st.pts.forEach((q, i) => {
        const r = sd.pts[sd.pts.length - 1 - i];
        assert.ok(Math.abs(eye(st, q) - eye(sd, r)) < 1e-9, '上下楼同一点的高度一样');
      });
      assert.ok(Math.abs(up.length - down.length) < 0.6, `${id} 上下楼的路差不多长：${up.length} / ${down.length}`);
    }
  });
}

await test('fits === false 的楼梯不连：楼上走不到，跨楼层找路 → null', () => {
  const c = caseOf('terrace2');
  const nd = { ...c.nd, stairs: c.nd.stairs.map((s) => ({ ...s, fits: false })) };
  const nav = N.buildNav(nd, c.items);
  assert.equal(nav.stairs.length, 0);
  const mst = nd.floors[1].rooms.find((r) => r.type === 'master');
  const p = { fi: 1, x: mst.x + mst.w / 2, z: mst.y + 1.0 };
  assert.equal(N.path(nav, nav.start, p), null);
  assert.ok(!nav.floors[1].reach.some(Boolean), '楼上没有一格从大门走得到');
});

await test('楼梯口被家具堵死 → 不连；挪开 rebuildFloor 以后又连上', () => {
  const c = caseOf('semid2');
  const s = c.nd.stairs[0];
  const box = { id: 'blk', kind: 'sideboard', floor: 'gf', room: 'g-hall', x: s.entry.x + 0.3, z: s.entry.y, rot: 90, w: 1.6, d: 1.2 };
  const nav = N.buildNav(c.nd, [...c.items, box]);
  assert.equal(nav.stairs.length, 0);
  N.rebuildFloor(nav, 0, c.items);
  assert.equal(nav.stairs.length, 1);
  assert.ok(nav.floors[1].reach.some(Boolean));
});

// ───────────────────────── 4. nearest / roomAt / clearance ─────────────────────────

await test('nearest()：墙里、家具里、房子外面的点 → 最近走得过去、从大门走得到的点；走得过去的点原样返回', () => {
  for (const id of TPL) {
    const c = caseOf(id);
    const nav = c.furn;
    const probes = [];
    // 每一面实墙的正中
    c.nd.floors.forEach((f, fi) => {
      for (const w of f.walls) {
        const p = w.pieces.find((x) => x.kind === 'solid' && x.b - x.a > 0.4);
        if (!p) continue;
        const m = (p.a + p.b) / 2;
        probes.push(w.axis === 'x' ? { fi, x: m, z: w.c, what: `墙 ${w.id}` } : { fi, x: w.c, z: m, what: `墙 ${w.id}` });
        // 外墙外面 0.8m（房子外面；大门那面墙外面是能走的空地，不算）
        if (w.outward && !w.pieces.some((x) => x.openingId === nav.door?.id)) {
          const c = w.c + w.outward * 0.8;
          probes.push(w.axis === 'x' ? { fi, x: m, z: c, what: `${w.id} 外面` } : { fi, x: c, z: m, what: `${w.id} 外面` });
        }
      }
    });
    // 每一件挡路的家具的正中
    for (const it of c.items) {
      if (N.SKIP_KINDS.has(it.kind)) continue;
      const fi = c.nd.floors.findIndex((f) => f.id === it.floor);
      probes.push({ fi, x: it.x, z: it.z, what: it.kind });
    }
    assert.ok(probes.length > 20, id);
    for (const p of probes) {
      assert.ok(!N.passable(nav, p), `${id} ${p.what} 本身应该走不过去`);
      const q = N.nearest(nav, p);
      assert.ok(q, `${id} ${p.what}：nearest 是 null`);
      assert.equal(q.fi, p.fi);
      assert.ok(N.passable(nav, q), `${id} ${p.what}：nearest 走不过去`);
      // 真的是最近的：和逐格硬算的一样（走得到的格子中心里离 p 最近的）
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      assert.ok(Math.abs(d - bruteNearest(nav, p)) < 1e-9, `${id} ${p.what}：nearest 离了 ${d.toFixed(2)}m，最近的是 ${bruteNearest(nav, p).toFixed(2)}m`);
      // 从大门真的走得到
      assert.ok(N.path(nav, nav.start, q), `${id} ${p.what}：nearest 的点走不到`);
    }
  }
  const c = caseOf('condo3');
  const ok = N.nearest(c.furn, c.furn.start);
  assert.deepEqual(ok, c.furn.start);
  assert.equal(N.nearest(c.furn, { fi: 5, x: 0, z: 0 }), null, '没有这一层');
  // 找路的起点 / 终点在墙里也行：先挪到最近的地方
  const w = c.nd.floors[0].walls.find((x) => x.exterior && x.axis === 'z' && x.c === 12);
  const inWall = { fi: 0, x: w.c, z: (w.a + w.b) / 2 };
  const p = N.path(c.furn, c.furn.start, inWall);
  checkPath(c, c.furn, p, '走到墙里的点');
  assert.ok(Math.hypot(p.legs.at(-1).pts.at(-1).x - inWall.x, p.legs.at(-1).pts.at(-1).z - inWall.z) < 1.0);
});

await test('roomAt / clearance / passable', () => {
  const c = caseOf('semid2');
  const nav = c.bare;
  assert.equal(N.roomAt(nav, { fi: 0, x: 2, z: 12 })?.id, 'g-liv');
  assert.equal(N.roomAt(nav, { fi: 1, x: 2, z: 12 })?.id, 'f-mst');
  assert.equal(N.roomAt(nav, { fi: 0, x: 5, z: 18 })?.id, 'g-por');
  assert.equal(N.roomAt(nav, { fi: 0, x: 1.8, z: 5.2 })?.type, 'stair');
  assert.equal(N.roomAt(nav, { fi: 0, x: -3, z: 5 }), null);
  assert.equal(N.roomAt(nav, { fi: 9, x: 2, z: 12 }), null);
  // 客厅中间离墙远；贴着外墙 → 0
  assert.ok(N.clearance(nav, { fi: 0, x: 4.8, z: 12.4 }) > 1.0);
  assert.equal(N.clearance(nav, { fi: 0, x: 9.6, z: 12.0 }), 0);
  assert.equal(N.clearance(nav, { fi: 0, x: -50, z: 0 }), 0, '格子外面');
  // 离外墙（x = 9.6，墙厚 0.2）0.4m：clearance ≈ 0.3（格子是保守的：差不到一格）
  const cl = N.clearance(nav, { fi: 0, x: 9.2, z: 12.0 });
  assert.ok(cl > 0.2 && cl <= 0.3 + 1e-6, `clearance ${cl}`);
  assert.ok(N.passable(nav, { fi: 0, x: 9.2, z: 12.0 }));
  assert.ok(!N.passable(nav, { fi: 0, x: 9.45, z: 12.0 }));
  // 连续：一路走过去，clearance 不跳
  let prev = null;
  for (let x = 1; x < 9; x += 0.01) {
    const v = N.clearance(nav, { fi: 0, x, z: 12.33 });
    if (prev != null) assert.ok(Math.abs(v - prev) < 0.012, `x ${x.toFixed(2)}：${prev} → ${v}`);
    prev = v;
  }
});

// ───────────────────────── 5. rebuildFloor ─────────────────────────

await test('rebuildFloor：挪走一件家具，原来的地方走得过去了、新地方挡住了；别的楼层不变', () => {
  const c = caseOf('semid2');
  const items = c.items.map((it) => ({ ...it }));
  const nav = N.buildNav(c.nd, items);
  const sofa = items.find((it) => it.kind === 'sofa' && it.floor === 'gf');
  const old = { fi: 0, x: sofa.x, z: sofa.z };
  assert.ok(!N.passable(nav, old));
  const before1 = nav.floors[1].clear.slice();
  // 挪到客厅另一头的空地
  const liv = c.nd.floors[0].rooms.find((r) => r.id === sofa.room);
  const spot = (() => {
    for (let x = liv.x + 1.2; x < liv.x + liv.w - 1.2; x += 0.1)
      for (let z = liv.y + 0.8; z < liv.y + liv.d - 0.8; z += 0.1) {
        const q = { fi: 0, x, z };
        if (Math.hypot(x - sofa.x, z - sofa.z) > 3 && N.clearance(nav, q) > 1.3) return q;
      }
    return null;
  })();
  assert.ok(spot, '客厅里找不到空地');
  sofa.x = spot.x;
  sofa.z = spot.z;
  const t0 = performance.now();
  N.rebuildFloor(nav, 0, items);
  const ms = performance.now() - t0;
  assert.ok(N.passable(nav, old), '沙发原来的地方');
  assert.ok(!N.passable(nav, spot), '沙发新的地方');
  assert.deepEqual(nav.floors[1].clear, before1, '二楼不变');
  assert.ok(ms < 60, `rebuildFloor ${ms.toFixed(1)}ms`);
  // 转 90°：占地跟着转
  sofa.rot = (sofa.rot + 90) % 360;
  N.rebuildFloor(nav, 0, items);
  const fp = footprintOf(sofa);
  assert.ok(!N.passable(nav, { fi: 0, x: (fp.x0 + fp.x1) / 2, z: fp.z0 + 0.05 }));
  // 删掉：整个地方都空出来；起点和楼梯还在
  N.rebuildFloor(nav, 0, items.filter((it) => it !== sofa));
  assert.ok(N.passable(nav, spot));
  assert.ok(nav.start && N.passable(nav, nav.start));
  assert.equal(nav.stairs.length, 1);
  // 旧家具没有 floor：按房间找楼层（二楼的床画在二楼，一楼同一个位置不受影响）
  const legacy = items.filter((it) => it.floor === 'ff').map(({ floor, ...it }) => it);
  const nav2 = N.buildNav(c.nd, legacy);
  const bed = legacy.find((it) => it.kind === 'bed');
  assert.ok(!N.passable(nav2, { fi: 1, x: bed.x, z: bed.z }));
  assert.deepEqual(nav2.floors[0].grid, c.bare.floors[0].grid);
});

await test('opts：skip / size / radius / cell', () => {
  const c = caseOf('studio');
  const nav = N.buildNav(c.nd, c.items);
  const twos = (v) => v.floors[0].grid.reduce((t, x) => t + (x === 2), 0);
  // 地毯、吊灯、挂画、窗帘不挡路：有没有它们，格子一模一样
  const noSkip = c.items.filter((it) => !N.SKIP_KINDS.has(it.kind));
  assert.ok(noSkip.length < c.items.length);
  assert.deepEqual(nav.floors[0].grid, N.buildNav(c.nd, noSkip).floors[0].grid);
  const strict = N.buildNav(c.nd, c.items, { skip: () => false });
  assert.ok(twos(strict) > twos(nav), 'skip 全不跳：地毯也挡');
  // 没写 w / d 的家具：size(kind) 给尺寸（单椅 0.8 × 0.8；没有 size → 0.5 × 0.5）
  const chair = { id: 'x1', kind: 'armchair', floor: 'f0', room: 'liv', x: 2.0, z: 4.5, rot: 0 };
  const blockedAt = (v, x, z) => {
    const F = v.floors[0];
    return F.grid[Math.floor((z - F.z0) / F.cell) * F.nx + Math.floor((x - F.x0) / F.cell)] === 2;
  };
  const sized = N.buildNav(c.nd, [chair], { size: (k) => CATALOG[k]?.size });
  const unsized = N.buildNav(c.nd, [chair]);
  assert.ok(blockedAt(sized, 2.35, 4.5) && blockedAt(sized, 2.0, 4.85), 'size：0.8m');
  assert.ok(!blockedAt(unsized, 2.35, 4.5) && blockedAt(unsized, 2.2, 4.5), '没有 size：0.5m');
  // 转了 45°：占地是转过以后的外框
  const tilted = N.buildNav(c.nd, [{ ...chair, w: 0.8, d: 0.8, rot: 45 }]);
  assert.ok(blockedAt(tilted, 2.0 + 0.52, 4.5) && !blockedAt(tilted, 2.0 + 0.62, 4.5), '45°：半宽 0.8·√2/2');
  // 半径大一点：大门起点照样算得出来，但有的门洞过不去
  const fat = N.buildNav(c.nd, c.items, { radius: 0.5 });
  assert.equal(fat.radius, 0.5);
  assert.ok(!N.passable(fat, { fi: 0, x: 5.7, z: 6.6 }), '0.9m 的门洞，半径 0.5 过不去');
  // 粗一点的格子也能用
  const coarse = N.buildNav(c.nd, c.items, { cell: 0.2 });
  assert.equal(coarse.floors[0].cell, 0.2);
  assert.ok(N.path(coarse, coarse.start, { fi: 0, x: 1.3, z: 1.3 }));
});

// ───────────────────────── 6. 速度 ─────────────────────────

await test('速度：semid2 有家具 buildNav < 150ms；找路 < 20ms（跨楼层、最远的两头）', () => {
  const c = caseOf('semid2');
  const builds = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    N.buildNav(c.nd, c.items);
    builds.push(performance.now() - t0);
  }
  builds.sort((a, b) => a - b);
  const nav = c.furn;
  // 最远的几对：一楼后院 ↔ 二楼阳台、车廊 ↔ 二楼卧室 2、同一层的对角
  const pt = (fi, rid) => roomTarget(nav, fi, c.nd.floors[fi].rooms.find((r) => r.id === rid));
  const pairs = [
    [pt(0, 'g-yard'), pt(1, 'f-bal')],
    [pt(0, 'g-por'), pt(1, 'f-bd2')],
    [pt(1, 'f-bal'), pt(0, 'g-gbd')],
    [pt(0, 'g-yard'), pt(0, 'g-por')],
    [pt(1, 'f-bd3'), pt(1, 'f-mbth')],
  ];
  const worst = [];
  for (const [a, b] of pairs) {
    let best = Infinity;
    for (let i = 0; i < 4; i++) {
      const t0 = performance.now();
      const p = N.path(nav, a, b);
      best = Math.min(best, performance.now() - t0);
      assert.ok(p);
    }
    worst.push(best);
  }
  console.log(`    buildNav ${builds.map((x) => x.toFixed(1)).join(' / ')} ms · path ${worst.map((x) => x.toFixed(1)).join(' / ')} ms`);
  assert.ok(builds[2] < 150, `buildNav ${builds[2].toFixed(1)}ms`);
  for (const w of worst) assert.ok(w < 20, `path ${w.toFixed(1)}ms`);
});

// ───────────────────────── 7. 边角 ─────────────────────────

await test('边角：空 navData、没有房间、同一点、找不到路', () => {
  const empty = N.buildNav({ floors: [], stairs: [] });
  assert.equal(empty.floors.length, 0);
  assert.equal(N.path(empty, { fi: 0, x: 0, z: 0 }, { fi: 0, x: 1, z: 1 }), null);
  assert.equal(N.nearest(empty, { fi: 0, x: 0, z: 0 }), null);
  assert.equal(N.clearance(empty, { fi: 0, x: 0, z: 0 }), 0);
  const blank = N.buildNav(N.navDataOf(M.emptyPlan()));
  assert.equal(blank.start, null);
  assert.equal(N.nearest(blank, { fi: 0, x: 0, z: 0 }), null);
  // 同一点：一段、长度 0
  const c = caseOf('condo3');
  const p = N.path(c.furn, c.furn.start, c.furn.start);
  assert.equal(p.legs.length, 1);
  assert.equal(p.length, 0);
  // 关起来的房间（门全删掉）：走不到
  const plan = M.templatePlan('condo3');
  plan.floors[0].openings = plan.floors[0].openings.filter((o) => o.id !== 'd-std');
  const nav = N.buildNav(N.navDataOf(plan), []);
  const std = plan.floors[0].rooms.find((r) => r.id === 'std');
  assert.equal(roomTarget(nav, 0, std), null, '书房没有门');
  const q = N.nearest(nav, { fi: 0, x: std.x + std.w / 2, z: std.y + std.d / 2 });
  assert.ok(q && N.roomAt(nav, q)?.id !== 'std', '点书房 → 挪到外面走得到的地方');
  // 没有大门的方案：起点 null，最大的一块当作走得到
  const noDoor = M.templatePlan('studio');
  noDoor.floors[0].openings = noDoor.floors[0].openings.filter((o) => o.id !== 'd-main');
  const nav3 = N.buildNav(N.navDataOf(noDoor), []);
  assert.ok(nav3.door === null || nav3.start, '没有 d-main 时按规则猜大门，猜不到就是 null');
  assert.ok(nav3.floors[0].reach.some(Boolean));
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
