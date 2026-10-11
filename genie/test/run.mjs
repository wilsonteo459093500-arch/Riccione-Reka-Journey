// npm test —— 纯函数测试（Node，不需要浏览器）：计分、收纳换算、雷区替换、墙体生成、自动摆家具、AI 识别换算、链接编码。

import assert from 'node:assert/strict';
import { DREAMERS, AXES, codeOf } from '../src/shared/dreamers.js';
import { MATERIALS, MAT_BY_ID, SLOTS, fits } from '../src/shared/materials.js';
import { MOODS, moodMeter, moodSentence, tagsOf } from '../src/shared/moods.js';
import { buildProfile, scoreAxes, storagePlan, avoidMaterials, insights, packJSON, unpackJSON, slimProfile } from '../src/shared/profile.js';
import { profileText } from '../src/shared/summary.js';
import { PAIRS, LIFE, APPLIANCES, STEPS } from '../src/quiz/flow.js';
import { TEMPLATES, buildWalls, roomSides, snapPlan, checkPlan, bounds } from '../src/studio/plan/model.js';
import { furnish } from '../src/studio/engine/furnish.js';
import { convertDetection } from '../src/studio/plan/ai.js';
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
await test('秒选比犹豫的权重高', () => {
  const fast = answers();
  const slow = answers();
  for (const k of Object.keys(slow.pairs)) slow.pairs[k] = { pick: 'a', ms: 5000 };
  assert.ok(scoreAxes(fast, { PAIRS, LIFE }).axes.temp > scoreAxes(slow, { PAIRS, LIFE }).axes.temp);
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
