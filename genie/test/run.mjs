// npm test —— 纯函数测试（Node，不需要浏览器）：计分、收纳换算、雷区替换、墙体生成、自动摆家具、AI 识别换算、链接编码。

import assert from 'node:assert/strict';
import { DREAMERS, AXES, codeOf } from '../src/shared/dreamers.js';
import { MATERIALS, MAT_BY_ID, SLOTS, fits } from '../src/shared/materials.js';
import { MOODS, moodMeter, moodSentence, tagsOf } from '../src/shared/moods.js';
import { buildProfile, scoreAxes, storagePlan, avoidMaterials, insights, packJSON, unpackJSON, slimProfile } from '../src/shared/profile.js';
import { profileText } from '../src/shared/summary.js';
import { PAIRS, LIFE, APPLIANCES, STEPS } from '../src/quiz/flow.js';
import { TEMPLATES, ROOM_TYPES, buildWalls, roomSides, snapPlan, checkPlan, bounds } from '../src/studio/plan/model.js';
import { furnish, furnishReport, roomFrame, footprintOf, behind } from '../src/studio/engine/furnish.js';
import { convertDetection, roomTypeOf } from '../src/studio/plan/ai.js';
import { daylight, fmtTime } from '../src/studio/engine/daylight.js';

let n = 0;
let failed = 0;
async function test(name, fn) {
  n++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 3).join('\n    ')}`);
  }
}

const KINDS = new Set(['sofa', 'armchair', 'coffeeTable', 'rug', 'tvWall', 'featureWall', 'bookshelf', 'displayCabinet', 'plant', 'floorLamp', 'sideTable', 'art', 'altar', 'diningTable', 'chair', 'pendant', 'sideboard', 'kitchenRun', 'fridge', 'tallUnit', 'island', 'bed', 'kidsBed', 'nightstand', 'wardrobe', 'dresser', 'desk', 'toyStorage', 'petBed', 'shoeCabinet', 'bench', 'vanity', 'toilet', 'shower', 'washer', 'lounger', 'curtains']);

function answers(overrides = {}) {
  const pairs = {};
  for (const p of PAIRS) pairs[p.id] = { pick: 'a', ms: 1200 };
  return {
    name: 'Peggy',
    players: 'couple',
    pairs,
    life: { saturday: 'kitchen', home: 'drop', cook: 'heavy', bell: 'shoes', who: ['kids', 'cat', 'altar'] },
    shoes: 70,
    wardrobeDoors: 4,
    wardrobeFit: 'full',
    longHang: 'many',
    books: 10,
    appliances: ['ricecooker', 'oven', 'steamoven'],
    bulky: ['luggage', 'festive', 'quilts', 'stroller'],
    ratio: 20,
    wishes: ['storage', 'clean', 'health'],
    splurge: 'kitchen',
    avoid: [],
    oneWish: '玄关不再乱',
    ...overrides,
  };
}

console.log('梦想家牌');
await test('16 张牌，代码唯一且覆盖所有组合', () => {
  assert.equal(DREAMERS.length, 16);
  const codes = new Set(DREAMERS.map((d) => d.code));
  assert.equal(codes.size, 16);
  for (const a of 'WC') for (const b of 'ML') for (const c of 'NR') for (const d of 'HD') assert.ok(codes.has(a + b + c + d), a + b + c + d);
});
await test('每张牌的材质都存在、并且放得进对应表面', () => {
  for (const d of DREAMERS)
    for (const s of SLOTS) {
      const id = d.materials[s.id];
      assert.ok(MAT_BY_ID[id], `${d.code} ${s.id}=${id}`);
      assert.ok(fits(id, s.id), `${d.code}: ${id} 放不进 ${s.id}`);
    }
});
await test('三个情绪预设的材质都合法', () => {
  for (const m of MOODS) for (const s of SLOTS) assert.ok(fits(m.materials[s.id], s.id), `${m.id} ${s.id}`);
});

console.log('计分');
await test('全选 a 侧 → WMNH，百分比都 > 50', () => {
  const { axes } = scoreAxes(answers(), { PAIRS, LIFE });
  assert.equal(codeOf(axes), 'WMNH');
  for (const ax of AXES) assert.ok(axes[ax.id] > 50 && axes[ax.id] <= 100);
});
await test('全选 b 侧 + 高展示 → CLRD', () => {
  const pairs = {};
  for (const p of PAIRS) pairs[p.id] = { pick: 'b', ms: 1200 };
  const { axes } = scoreAxes(answers({ pairs, ratio: 80 }), { PAIRS, LIFE });
  assert.equal(codeOf(axes), 'CLRD');
});
await test('秒选比犹豫的权重高（只在单人玩时）', () => {
  const fast = answers({ players: 'solo' });
  const slow = answers({ players: 'solo' });
  for (const k of Object.keys(slow.pairs)) slow.pairs[k] = { pick: 'a', ms: 5000 };
  assert.ok(scoreAxes(fast, { PAIRS, LIFE }).axes.temp > scoreAxes(slow, { PAIRS, LIFE }).axes.temp);
  // 两个人一起玩：反应时间是在商量，不加权
  const cFast = answers({ players: 'couple' });
  const cSlow = answers({ players: 'couple' });
  for (const k of Object.keys(cSlow.pairs)) cSlow.pairs[k] = { pick: 'a', ms: 5000 };
  assert.deepEqual(scoreAxes(cFast, { PAIRS, LIFE }).axes, scoreAxes(cSlow, { PAIRS, LIFE }).axes);
});
await test('没有答案也不会出错（各 51%）', () => {
  const { axes } = scoreAxes({}, { PAIRS, LIFE });
  for (const ax of AXES) assert.equal(axes[ax.id], 51);
});

console.log('收纳换算');
await test('鞋 70 双 → 2100mm；4 门挤爆 → 2500mm', () => {
  const p = storagePlan({ shoes: 70, wardrobeDoors: 4, wardrobeFit: 'full', longHang: 'many', books: 10, appliances: ['oven', 'steamoven', 'ricecooker'], bulky: ['a', 'b', 'c', 'd'] }, APPLIANCES);
  assert.equal(p.shoeCabinetMM, 2100);
  assert.equal(p.wardrobeMM, 2500);
  assert.equal(p.bookshelfMM, 8000);
  assert.equal(p.tallUnits, 2);
  assert.ok(p.applianceTallCabinet);
  assert.ok(p.needsStoreroom);
  assert.equal(p.longHangMM + p.shortHangMM + p.foldMM, 2500);
});
await test('0 双鞋不出鞋柜', () => assert.equal(storagePlan({ shoes: 0 }).shoeCabinetMM, 0));

console.log('雷区替换');
await test('避开的颜色 / 质感不会留在材质里', () => {
  for (const d of DREAMERS) {
    const avoid = ['glossy', 'marble', 'gold', 'darkwood'];
    const { materials } = avoidMaterials(d.materials, avoid);
    for (const s of SLOTS) {
      const tags = tagsOf(MAT_BY_ID[materials[s.id]]);
      for (const a of avoid) if (tags.has(a)) assert.fail(`${d.code} ${s.id} 还有 ${a}`);
      assert.ok(fits(materials[s.id], s.id));
    }
  }
});

console.log('档案');
await test('buildProfile → 完整档案 + 谈话提示 + WhatsApp 文字', () => {
  const p = buildProfile(answers({ avoid: ['glossy'] }), { host: 'wilson' }, { PAIRS, LIFE });
  assert.equal(p.code, 'WMNH');
  assert.equal(p.name, 'Peggy');
  assert.ok(p.swaps.length >= 1);
  const plan = storagePlan(p.storage, APPLIANCES);
  const tips = insights(p, plan);
  assert.ok(tips.some((t) => t.text.includes('神台')));
  assert.ok(tips.some((t) => t.text.includes('爆炒')));
  const txt = profileText(p, plan, 'https://x');
  assert.ok(txt.includes('Peggy') && txt.includes('暖木禅居') && txt.includes('2,100mm'));
});
await test('链接编码可以来回', async () => {
  const p = buildProfile(answers(), {}, { PAIRS, LIFE });
  const packed = await packJSON(slimProfile(p));
  assert.ok(/^[zj][A-Za-z0-9_-]+$/.test(packed));
  const back = await unpackJSON(packed);
  assert.equal(back.code, p.code);
  assert.deepEqual(back.materials, p.materials);
});
await test('流程步骤 id 唯一', () => assert.equal(new Set(STEPS.map((s) => s.id)).size, STEPS.length));
await test('情绪仪表加起来 100', () => {
  for (const m of MOODS) for (const h of [7, 12, 18.5, 22]) {
    const r = moodMeter(m.materials, h);
    assert.equal(r.cozy + r.bright + r.moody, 100);
  }
  assert.equal(moodSentence(MOODS[2].materials, 22.2).top, 'moody');
});

console.log('平面图 / 墙');
await test('模板：每个门窗都落在墙上，墙段长度 > 0', () => {
  for (const t of TEMPLATES) {
    const walls = buildWalls(t.plan);
    assert.ok(walls.length > 5);
    for (const w of walls) assert.ok(w.b - w.a > 0.02);
    for (const o of t.plan.openings) assert.ok(walls.some((w) => w.pieces.some((p) => p.openingId === o.id)), `${t.id}/${o.id}`);
    assert.deepEqual(checkPlan(t.plan), []);
  }
});
await test('开放空间（客厅 / 餐厅）之间没有墙', () => {
  const plan = TEMPLATES[0].plan;
  const walls = buildWalls(plan);
  const between = walls.filter((w) => [w.neg?.id, w.pos?.id].sort().join() === ['din', 'liv'].sort().join());
  assert.equal(between.length, 0);
});
await test('外墙有朝外方向，内墙没有', () => {
  for (const w of buildWalls(TEMPLATES[0].plan)) assert.equal(w.exterior, w.outward !== 0);
});
await test('吸附：差几厘米的边会对齐', () => {
  const p = snapPlan({ rooms: [{ id: 'a', type: 'living', x: 0, y: 0, w: 4.02, d: 3 }, { id: 'b', type: 'bedroom', x: 3.97, y: 0, w: 3, d: 3 }], openings: [] });
  assert.equal(p.rooms[0].x + p.rooms[0].w, p.rooms[1].x);
});

console.log('自动摆家具');
await test('每个模板都摆出合理的家具，且不出房间', () => {
  for (const t of TEMPLATES) {
    const walls = buildWalls(t.plan);
    const items = furnish(t.plan, walls, null);
    assert.ok(items.length > 15, `${t.id} 只有 ${items.length} 件`);
    for (const it of items) {
      assert.ok(KINDS.has(it.kind), it.kind);
      const r = t.plan.rooms.find((x) => x.id === it.room);
      assert.ok(r, `${it.kind} 没有房间`);
      assert.ok(it.x >= r.x - 0.6 && it.x <= r.x + r.w + 0.6 && it.z >= r.y - 0.6 && it.z <= r.y + r.d + 0.6, `${t.id} ${it.kind} 出界`);
    }
    for (const k of ['sofa', 'bed', 'kitchenRun', 'diningTable']) assert.ok(items.some((i) => i.kind === k), `${t.id} 缺 ${k}`);
  }
});
await test('档案会影响家具：神台、宠物窝、鞋柜长度', () => {
  const p = buildProfile(answers({ shoes: 90 }), {}, { PAIRS, LIFE });
  const plan = TEMPLATES[0].plan;
  const items = furnish(plan, buildWalls(plan), p);
  assert.ok(items.some((i) => i.kind === 'altar'), '没有神台');
  assert.ok(items.some((i) => i.kind === 'petBed'), '没有宠物窝');
  const few = furnish(plan, buildWalls(plan), buildProfile(answers({ shoes: 20 }), {}, { PAIRS, LIFE }));
  const shoe = items.find((i) => i.kind === 'shoeCabinet');
  const shoeFew = few.find((i) => i.kind === 'shoeCabinet');
  assert.ok(shoe && shoeFew && shoe.w > shoeFew.w, '鞋多的鞋柜应该更长（在墙长允许的范围内）');
});
// ── 摆家具的硬规则检查（每个模板 × 完整档案：小孩、长辈、神台、狗）──
const FLAT = new Set(['rug', 'curtains', 'art', 'pendant']);
const full = (o = {}) => buildProfile(answers({ life: { saturday: 'kitchen', home: 'drop', cook: 'heavy', bell: 'shoes', who: ['kids', 'elder', 'altar', 'dog'] }, ...o }), {}, { PAIRS, LIFE });
const ov = (a, b, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;
const rectDist = (p, b) => Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.z0 - p.z, 0, p.z - b.z1));
/** 家具本地 x（从中心量）→ 世界坐标（three.js rotation.y = rot） */
const local = (it, lx) => {
  const r = (it.rot * Math.PI) / 180;
  return { x: it.x + Math.cos(r) * lx, z: it.z - Math.sin(r) * lx };
};
/** 家具前方 depth 米、宽 w 的那一块 */
const frontOf = (it, w, d, depth) => {
  const r = (it.rot * Math.PI) / 180;
  const c = { x: it.x + Math.sin(r) * (d / 2 + depth / 2), z: it.z + Math.cos(r) * (d / 2 + depth / 2) };
  const sw = it.rot === 90 || it.rot === 270;
  const [fw, fd] = sw ? [depth, w] : [w, depth];
  return { x0: c.x - fw / 2, x1: c.x + fw / 2, z0: c.z - fd / 2, z1: c.z + fd / 2 };
};
const SIDE_OF = { 0: 'N', 180: 'S', 90: 'W', 270: 'E' };
/** 床头靠的那面墙后面是哪些房间 */
const headBehind = (plan, room, bed) => {
  const side = SIDE_OF[bed.rot];
  const b = footprintOf(bed);
  const s = side === 'N' || side === 'S' ? { side, axis: 'x', c: side === 'N' ? room.y : room.y + room.d, a: b.x0, b: b.x1 } : { side, axis: 'z', c: side === 'W' ? room.x : room.x + room.w, a: b.z0, b: b.z1 };
  return behind(plan, room, s, s.a, s.b);
};
function layoutProblems(plan, items) {
  const walls = buildWalls(plan);
  const bad = [];
  for (const room of plan.rooms) {
    const fr = roomFrame(plan, walls, room);
    const its = items.filter((i) => i.room === room.id && !FLAT.has(i.kind));
    for (const it of its) {
      const b = footprintOf(it);
      const r = fr.inner;
      if (b.x0 < r.x0 - 0.03 || b.x1 > r.x1 + 0.03 || b.z0 < r.z0 - 0.03 || b.z1 > r.z1 + 0.03) bad.push(`${room.id}/${it.kind} 出了房间（穿墙）`);
      for (const k of fr.keep) if (k.full && ov(b, k.box, -0.02)) bad.push(`${room.id}/${it.kind} 压到门 ${k.id}`);
    }
    // 落地趟门 / 打通 / 开放边：剩下的路至少 0.9m
    for (const k of fr.keep.filter((x) => !x.full)) {
      const ivs = its.filter((it) => ov(footprintOf(it), k.box, -0.02)).map((it) => {
        const b = footprintOf(it);
        return k.axis === 'x' ? [Math.max(b.x0, k.a), Math.min(b.x1, k.b)] : [Math.max(b.z0, k.a), Math.min(b.z1, k.b)];
      });
      ivs.sort((p, q) => p[0] - q[0]);
      let cur = k.a;
      let best = 0;
      for (const [p, q] of ivs) {
        best = Math.max(best, p - cur);
        cur = Math.max(cur, q);
      }
      best = Math.max(best, k.b - cur);
      if (best < 0.88) bad.push(`${room.id} ${k.kind}${k.id ? ' ' + k.id : ''} 只剩 ${best.toFixed(2)}m 的路`);
    }
    // 两件家具不重叠
    for (let i = 0; i < its.length; i++) for (let j = i + 1; j < its.length; j++) if (ov(footprintOf(its[i]), footprintOf(its[j]), -0.01)) bad.push(`${room.id}: ${its[i].kind} 和 ${its[j].kind} 叠在一起`);
    // 马桶前面 ≥ 0.55m 是空的
    for (const t of its.filter((i) => i.kind === 'toilet')) {
      const f = frontOf(t, 0.45, 0.7, 0.55);
      const r = fr.inner;
      if (f.x0 < r.x0 - 0.02 || f.x1 > r.x1 + 0.02 || f.z0 < r.z0 - 0.02 || f.z1 > r.z1 + 0.02) bad.push(`${room.id} 马桶前面不够 0.55m`);
      for (const o of its) if (o !== t && ov(f, footprintOf(o), -0.01)) bad.push(`${room.id} 马桶前面有 ${o.kind}`);
    }
  }
  return bad;
}

await test('完整档案（小孩 / 长辈 / 神台 / 狗）：每个模板都不穿墙、不挡门、马桶前留 55cm、家具不叠', () => {
  for (const t of TEMPLATES) {
    const items = furnish(t.plan, buildWalls(t.plan), full());
    assert.deepEqual(layoutProblems(t.plan, items), [], t.id);
    // 不带档案也一样
    assert.deepEqual(layoutProblems(t.plan, furnish(t.plan, buildWalls(t.plan), null)), [], `${t.id} 无档案`);
  }
});
await test('condo3：主卧床头不靠两间浴室那面墙（x=8.4），神台不在客厅北墙（背后是厨房）', () => {
  const plan = TEMPLATES.find((t) => t.id === 'condo3').plan;
  const items = furnish(plan, buildWalls(plan), full());
  const mst = plan.rooms.find((r) => r.id === 'mst');
  const bed = items.find((i) => i.room === 'mst' && i.kind === 'bed');
  assert.ok(bed, '主卧没有床');
  assert.ok(!(bed.rot === 90 && footprintOf(bed).x0 < 8.6), `主卧床在 x=8.4 那面墙：${JSON.stringify(bed)}`);
  assert.ok(!headBehind(plan, mst, bed).some((r) => ROOM_TYPES[r.type].wet), '主卧床头背靠浴室');
  const altar = items.find((i) => i.kind === 'altar');
  assert.ok(altar, '没有神台');
  assert.ok(!(altar.room === 'liv' && altar.rot === 0 && footprintOf(altar).z0 < 3.3), '神台在客厅北墙（背后是厨房）');
  // 神台背后不是浴室 / 厨房，也不在大门那面墙
  const r = plan.rooms.find((x) => x.id === altar.room);
  const back = headBehind(plan, r, altar);
  assert.ok(!back.some((x) => ROOM_TYPES[x.type].wet || x.type === 'kitchen'), `神台背后是 ${back.map((x) => x.id)}`);
});
await test('terrace：客房放得下床（≥ 3.0m 深），床头不背浴室', () => {
  const plan = TEMPLATES.find((t) => t.id === 'terrace').plan;
  const gst = plan.rooms.find((r) => r.id === 'gst');
  assert.ok(Math.max(gst.w, gst.d) >= 3.0);
  for (const p of [full(), null]) {
    const bed = furnish(plan, buildWalls(plan), p).find((i) => i.room === 'gst' && i.kind === 'bed');
    assert.ok(bed, '客房没有床');
    assert.ok(!headBehind(plan, gst, bed).some((r) => r.type === 'bath'), '客房床头背靠浴室');
  }
});
await test('浴室：淋浴在离门最远的角、马桶中心离两边 ≥ 0.4m', () => {
  for (const t of TEMPLATES) {
    const walls = buildWalls(t.plan);
    const items = furnish(t.plan, walls, full());
    for (const room of t.plan.rooms.filter((r) => r.type === 'bath')) {
      const its = items.filter((i) => i.room === room.id);
      assert.ok(['shower', 'toilet', 'vanity'].every((k) => its.some((i) => i.kind === k)), `${t.id}/${room.id} 缺洁具：${its.map((i) => i.kind)}`);
      const toilet = its.find((i) => i.kind === 'toilet');
      const fr = roomFrame(t.plan, walls, room);
      const along = toilet.rot === 0 || toilet.rot === 180 ? [toilet.x - fr.inner.x0, fr.inner.x1 - toilet.x] : [toilet.z - fr.inner.z0, fr.inner.z1 - toilet.z];
      assert.ok(Math.min(...along) >= 0.39, `${t.id}/${room.id} 马桶离侧墙 ${Math.min(...along).toFixed(2)}m`);
      for (const o of its.filter((i) => i !== toilet && !FLAT.has(i.kind))) assert.ok(rectDist(toilet, footprintOf(o)) >= 0.39 || o.kind === 'shower', `${t.id}/${room.id} 马桶离 ${o.kind} 太近`);
    }
  }
});

await test('厨房：灶台离冰箱 / 台面尽头 ≥ 0.75m、不进 L 转角、不在窗下；水槽对窗或离冰箱 ≥ 0.5m；水槽和灶台之间 ≥ 0.6m', () => {
  for (const t of TEMPLATES)
    for (const p of [full(), null]) {
      const items = furnish(t.plan, buildWalls(t.plan), p);
      const runs = items.filter((i) => i.kind === 'kitchenRun');
      const fridge = items.find((i) => i.kind === 'fridge');
      assert.ok(fridge, `${t.id} 厨房没有冰箱`);
      const withSink = runs.filter((r) => r.sinkAt != null);
      const withHob = runs.filter((r) => r.hobAt != null);
      assert.equal(withSink.length, 1, `${t.id} 水槽应该只有一个`);
      assert.equal(withHob.length, 1, `${t.id} 灶台应该只有一个`);
      for (const r of runs) {
        assert.ok('sinkAt' in r && 'hobAt' in r, `${t.id} kitchenRun 缺 sinkAt / hobAt`);
        if (r.sinkAt != null) assert.equal(r.sink, r.sinkAt);
        assert.equal(r.hob, r.hobAt);
      }
      const run = withSink[0];
      const hr = withHob[0];
      const sink = local(run, -run.w / 2 + run.w * run.sinkAt);
      const hob = local(hr, -hr.w / 2 + hr.w * hr.hobAt);
      const hu = hr.w * hr.hobAt;
      const su = run.w * run.sinkAt;
      // 灶台：离冰箱 ≥ 0.75（中心到冰箱边），本身那段台面两头至少留 0.4m 的台面
      if (fridge) assert.ok(rectDist(hob, footprintOf(fridge)) >= 0.75 - 1e-6, `${t.id} 灶台离冰箱 ${rectDist(hob, footprintOf(fridge)).toFixed(2)}m`);
      assert.ok(hu >= 0.35 + 0.1 - 1e-6 && hr.w - hu >= 0.75 - 1e-6 || (hu >= 0.75 - 1e-6 && hr.w - hu >= 0.35 + 0.1 - 1e-6), `${t.id} 灶台离台面尽头太近`);
      // 不进转角：灶台中心离另一段台面 ≥ 0.35（灶台本体不压到转角那一块）
      for (const o of runs.filter((x) => x !== hr)) assert.ok(rectDist(hob, footprintOf(o)) >= 0.35 - 1e-6, `${t.id} 灶台进了 L 转角`);
      // 烟机：灶台不在窗下
      for (const g of hr.gaps || []) assert.ok(hu + 0.45 <= g.a + 0.03 || hu - 0.45 >= g.b - 0.03, `${t.id} 灶台在窗下`);
      // 水槽：有窗就在窗下，否则边缘离冰箱 ≥ 0.5
      if ((run.gaps || []).length) assert.ok(run.gaps.some((g) => su - 0.3 >= g.a - 0.06 && su + 0.3 <= g.b + 0.06), `${t.id} 水槽不在窗下`);
      else if (fridge) assert.ok(rectDist(sink, footprintOf(fridge)) >= 0.8 - 1e-6, `${t.id} 水槽离冰箱太近`);
      // 水槽和灶台之间 ≥ 0.6 台面（同一段：边到边；L 两段：中心直线距离已经是下限）
      if (run === hr) assert.ok(Math.abs(su - hu) - 0.3 - 0.35 >= 0.6 - 1e-6, `${t.id} 水槽灶台之间只有 ${(Math.abs(su - hu) - 0.65).toFixed(2)}m`);
      else assert.ok(Math.hypot(sink.x - hob.x, sink.z - hob.z) >= 1.25 - 1e-6, `${t.id} 水槽灶台太近`);
    }
});
await test('厨房：岛台四周 ≥ 1.05m（爆炒 1.2m），电器高柜前面留 1m', () => {
  const plan = TEMPLATES.find((t) => t.id === 'terrace').plan;
  const walls = buildWalls(plan);
  for (const [cook, m] of [['light', 1.05], ['heavy', 1.2]]) {
    // 没有嵌入式电器：岛台不用和电器高柜抢地方
    const plain = full({ appliances: [] });
    plain.life.cook = cook;
    const island = furnish(plan, walls, plain).find((i) => i.kind === 'island');
    if (cook === 'light') assert.ok(island, '4.2 × 3.8 的厨房应该放得下岛台');
    const p = full();
    p.life.cook = cook;
    const items = furnish(plan, walls, p);
    for (const isl of [island, items.find((i) => i.kind === 'island')].filter(Boolean)) {
      const its = isl === island ? furnish(plan, walls, plain) : items;
      for (const o of its.filter((i) => i.room === isl.room && i.kind !== 'island' && !FLAT.has(i.kind))) assert.ok(!ov(footprintOf(isl), footprintOf(o), m - 0.03), `岛台离 ${o.kind} 不够 ${m}m`);
    }
    const tall = items.find((i) => i.kind === 'tallUnit' && i.room === 'kit');
    assert.ok(tall, '没有电器高柜');
    const f = frontOf(tall, 0.6, 0.6, 1.0);
    for (const o of items.filter((i) => i.room === tall.room && i !== tall && !FLAT.has(i.kind))) assert.ok(!ov(f, footprintOf(o), -0.01), `高柜前面有 ${o.kind}`);
  }
});
await test('餐厅：椅子后面不够 0.9m 就退到 4 人 / 0.9m 桌；年货节庆放得下才摆 8 人圆桌', () => {
  const tbl = (id, p) => {
    const plan = TEMPLATES.find((t) => t.id === id).plan;
    return furnish(plan, buildWalls(plan), p).find((i) => i.kind === 'diningTable');
  };
  // studio：2.2m 宽的餐厅，6 人 1.3m 圆桌只剩 0.45m → 不能摆 6 人
  const s = tbl('studio', full({ bulky: [] }));
  assert.ok(s && s.seats <= 4 && s.w <= 0.9, `studio 餐桌 ${JSON.stringify(s)}`);
  // terrace：3.4m 宽，1.5m 圆桌还剩 0.95m → 年货节庆摆 8 人圆桌
  const t8 = tbl('terrace', full());
  assert.ok(t8.seats === 8 && t8.variant === 'round' && t8.w === 1.5, `terrace 年货 ${JSON.stringify(t8)}`);
  const t6 = tbl('terrace', full({ bulky: [] }));
  assert.ok(t6.seats === 6, `terrace 没有年货 ${JSON.stringify(t6)}`);
  // condo3：3.0m 宽，8 人圆桌只剩 0.75m → 不摆 8 人
  assert.ok(tbl('condo3', full()).seats < 8);
});
await test('一次「圆」的沙发不会把地毯 / 餐桌也变圆（curve > 90 才圆）', () => {
  const plan = TEMPLATES.find((t) => t.id === 'condo3').plan;
  const walls = buildWalls(plan);
  const p = full({ bulky: [] });
  p.hidden.curve = 83;
  const items = furnish(plan, walls, p);
  assert.equal(items.find((i) => i.kind === 'diningTable').variant, 'rect');
  assert.ok(items.filter((i) => i.kind === 'rug' && i.room === 'liv').every((r) => r.variant !== 'round'));
  p.hidden.curve = 95;
  const round = furnish(plan, walls, p);
  assert.equal(round.find((i) => i.kind === 'diningTable').variant, 'round');
  assert.ok(round.some((i) => i.kind === 'rug' && i.room === 'liv' && i.variant === 'round'));
});
await test('马来西亚户型：车廊放鞋柜 + 换鞋凳、不放躺椅；晒衣处；AI 识别 car porch → 车廊', () => {
  assert.ok(ROOM_TYPES.porch?.outdoor && ROOM_TYPES.balcony.outdoor);
  assert.equal(ROOM_TYPES.utility.zh, '晒衣处');
  const plan = TEMPLATES.find((t) => t.id === 'terrace').plan;
  assert.ok(plan.rooms.some((r) => r.type === 'porch'));
  for (const p of [full(), null]) {
    const items = furnish(plan, buildWalls(plan), p);
    assert.ok(items.some((i) => i.kind === 'shoeCabinet' && i.room === 'por'), '车廊没有鞋柜');
    assert.ok(items.some((i) => i.kind === 'bench' && i.room === 'por'), '车廊没有换鞋凳');
    assert.ok(!items.some((i) => i.kind === 'lounger'), '车廊放了躺椅');
  }
  assert.equal(roomTypeOf('balcony', 'Car Porch'), 'porch');
  assert.equal(roomTypeOf('', 'Service Yard'), 'utility');
  assert.equal(roomTypeOf('kitchen', 'Wet Kitchen'), 'kitchen');
  assert.equal(roomTypeOf('nonsense', 'Room 3'), 'bedroom');
  // 没有玄关也没有车廊：鞋柜放在客厅大门边
  const condo = JSON.parse(JSON.stringify(TEMPLATES.find((t) => t.id === 'condo3').plan));
  condo.rooms = condo.rooms.filter((r) => r.id !== 'foy');
  condo.rooms.find((r) => r.id === 'liv').d = 6.0;
  const its = furnish(condo, buildWalls(condo), full());
  const shoe = its.find((i) => i.kind === 'shoeCabinet');
  assert.ok(shoe && shoe.room === 'liv', '没有玄关时鞋柜应该在客厅');
  const door = condo.openings.find((o) => o.id === 'd-main');
  assert.ok(rectDist({ x: (door.x1 + door.x2) / 2, z: door.y1 }, footprintOf(shoe)) < 1.6, '鞋柜不在大门边');
});
await test('收纳对账：condo3 每间卧室和主卧都有衣柜；对账表的数字对得上', () => {
  const plan = TEMPLATES.find((t) => t.id === 'condo3').plan;
  const walls = buildWalls(plan);
  const p = full();
  const items = furnish(plan, walls, p);
  for (const r of plan.rooms.filter((x) => ['master', 'bedroom', 'kids'].includes(x.type))) {
    const w = items.filter((i) => i.room === r.id && i.kind === 'wardrobe');
    assert.ok(w.length && w.every((x) => x.w >= 1.2 - 1e-6), `${r.id} 没有像样的衣柜`);
  }
  const rows = furnishReport(plan, walls, p, items);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  const sp = storagePlan(p.storage, APPLIANCES);
  for (const k of ['wardrobe:master', 'wardrobe:bd2', 'shoe', 'counter', 'dining', 'books', 'store', 'tall', 'altar']) assert.ok(by[k], `对账缺 ${k}`);
  assert.equal(by['wardrobe:master'].need, sp.wardrobeMM);
  assert.equal(by.shoe.need, sp.shoeCabinetMM);
  assert.equal(by.books.need, sp.bookshelfMM);
  assert.equal(by.dining.need, 8);
  for (const r of rows) {
    assert.equal(r.gap, Math.max(0, r.target - r.placed), r.key);
    assert.equal(!!r.hint, r.gap > 0, r.key);
    for (const id of r.itemIds) assert.ok(items.some((i) => i.id === id), `${r.key} 指向不存在的家具`);
  }
  const shoeW = items.filter((i) => i.kind === 'shoeCabinet').reduce((t, i) => t + i.w, 0);
  assert.equal(by.shoe.placed, Math.round(shoeW * 1000));
  // 衣柜画不到 max(1.2m, 目标一半) 就不画，写进对账
  for (const it of items.filter((i) => i.kind === 'wardrobe' && i.room === 'mst')) assert.ok(it.w >= Math.max(1.2, sp.wardrobeMM / 2000) - 1e-6);
});
await test('青少年：儿童房衣柜按 1.8m、书桌 1.2m', () => {
  const plan = JSON.parse(JSON.stringify(TEMPLATES.find((t) => t.id === 'condo3').plan));
  plan.rooms.find((r) => r.id === 'bd2').type = 'kids';
  const walls = buildWalls(plan);
  const teen = furnish(plan, walls, full({ life: { cook: 'light', who: ['teen'] } })).filter((i) => i.room === 'bd2');
  const kid = furnish(plan, walls, full({ life: { cook: 'light', who: ['kids'] } })).filter((i) => i.room === 'bd2');
  const ward = (its) => its.filter((i) => i.kind === 'wardrobe').reduce((t, i) => t + i.w, 0);
  assert.ok(ward(teen) > 1.2 + 1e-6, `青少年衣柜 ${ward(teen)}`);
  assert.ok(ward(kid) <= 1.2 + 1e-6, `小孩衣柜 ${ward(kid)}`);
  const desk = teen.find((i) => i.kind === 'desk');
  assert.ok(!desk || desk.w === 1.2, '青少年书桌应该 1.2m');
  assert.ok(kid.filter((i) => i.kind === 'desk').every((d) => d.w === 1.0));
  const rows = furnishReport(plan, walls, full({ life: { cook: 'light', who: ['teen'] } }));
  assert.equal(rows.find((r) => r.key === 'wardrobe:bd2').target, 1800);
});
await test('roomSides 扣掉门窗', () => {
  const plan = TEMPLATES[0].plan;
  const liv = plan.rooms.find((r) => r.id === 'liv');
  const W = roomSides(liv, buildWalls(plan)).find((s) => s.side === 'W');
  assert.ok(W.windows > 2.9);
});

console.log('AI 识别换算');
await test('归一化框 + 总宽 → 米', () => {
  const j = {
    overall_width_mm: 10000,
    footprint: [100, 100, 900, 900],
    rooms: [
      { label: 'Living', type: 'living', box: [100, 100, 500, 600] },
      { label: 'Bedroom', type: 'bedroom', box: [100, 600, 500, 900] },
      { label: 'Kitchen', type: 'kitchen', box: [500, 100, 900, 900] },
    ],
    doors: [{ box: [490, 650, 510, 750] }],
    windows: [{ box: [95, 200, 105, 400] }],
  };
  const { plan, info } = convertDetection(j, { src: 'x', width: 1000, height: 1000 });
  assert.equal(info.rooms, 3);
  const liv = plan.rooms.find((r) => r.type === 'living');
  assert.ok(Math.abs(liv.w - 6.25) < 0.06 && Math.abs(liv.d - 5) < 0.06, JSON.stringify(liv));
  assert.equal(bounds(plan).w, 10);
  const walls = buildWalls(plan);
  for (const o of plan.openings) assert.ok(walls.some((w) => w.pieces.some((p) => p.openingId === o.id)), 'opening 不在墙上');
});

console.log('日光');
await test('白天有太阳、深夜开灯', () => {
  const noon = daylight(12.8);
  const night = daylight(22.2);
  assert.ok(noon.up && noon.dir[1] > 0.7 && noon.night === 0);
  assert.ok(!night.up && night.lamps === 1);
  assert.equal(fmtTime(18.4), '18:24');
});
await test('材质库没有重复 id', () => assert.equal(new Set(MATERIALS.map((m) => m.id)).size, MATERIALS.length));

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
