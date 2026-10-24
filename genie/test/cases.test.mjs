// 案例库（src/shared/cases.js + src/cases/manifest.json + scripts/import-cases.mjs）—— SPEC §10–§13、§15.4。
// 跑法：node test/cases.test.mjs（npm test 会一起跑）

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../src/shared/cases.js';
import { CONFIG } from '../src/shared/config.js';
import { MAT_BY_ID, SLOTS, SLOT_BY_ID, fits } from '../src/shared/materials.js';
import { DREAMERS, DREAMER_BY_CODE } from '../src/shared/dreamers.js';
import { buildProfile, insights, storagePlan } from '../src/shared/profile.js';
import * as FLOW from '../src/quiz/flow.js';
import { setLang } from '../src/shared/i18n.js';
import EN from '../src/shared/i18n/en.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/cases/manifest.json'), 'utf8'));
const HAN = /[一-鿿]/;

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

// ───────────────────────── 示范客人（SPEC §11.4） ─────────────────────────
// 轴是 design/sim/worked.mjs 的结果（固定下来，这样配对的测试不跟着计分微调变）；picks = 当时的直觉选择
const GUESTS = {
  peggy: {
    name: 'Peggy', code: 'WMNH', axes: { temp: 97, density: 82, texture: 98, storage: 96 }, hidden: { light: 67, curve: 73, social: 45 },
    wishes: ['storage', 'clean', 'kids'], avoid: ['marble'], home: { type: 'condo', sizeSqft: 1050, bedrooms: 3, scope: ['whole'] },
    picks: 'room:a wall:c touch:a guest:a sofa:c night:c floor:a kitchen:a table:c weekend:b', life: { cook: 'heavy', who: ['kids'], bell: 'shoes' }, ratio: 20,
  },
  ken: {
    name: 'Ken & Mei', code: 'CMRD', axes: { temp: 6, density: 87, texture: 3, storage: 23 }, hidden: { light: 98, curve: 5, social: 93 },
    wishes: ['host', 'photo', 'work'], avoid: ['rattan', 'pink'], home: { type: 'bungalow', sizeSqft: 3800, bedrooms: 5, scope: ['living', 'dining', 'kitchen'] },
    picks: 'room:b wall:d touch:b guest:c sofa:b night:a floor:e kitchen:c table:d weekend:a', life: { cook: 'light', who: [], bell: 'kitchen' }, ratio: 45,
  },
  aisha: {
    name: 'Aisha', code: 'WLND', axes: { temp: 94, density: 4, texture: 97, storage: 8 }, hidden: { light: 77, curve: 73, social: 98 },
    wishes: ['host', 'kitchen', 'pets'], avoid: ['grey', 'black'], home: { type: 'terrace', sizeSqft: 1700, bedrooms: 4, scope: ['living', 'kitchen', 'dining'] },
    picks: 'room:f wall:b touch:a guest:b sofa:c night:c floor:a kitchen:b table:c weekend:a', life: { cook: 'heavy', who: ['cat'], bell: 'laundry' }, ratio: 40,
  },
};
const pairsOf = (picks) => Object.fromEntries(picks.split(' ').map((s) => s.split(':')).map(([k, v]) => [k, { pick: v, ms: 2200, left: 'abcd' }]));
const FLOOR_MAT = { a: 'herringbone-oak', b: 'travertine', c: 'white-oak', d: 'terrazzo', e: 'microcement', f: 'walnut' };
/** §11.4 的表：picksMats 只算地板那一题（design/sim/worked.mjs 的做法） */
function tableProfile(g) {
  const floor = pairsOf(g.picks).floor;
  return { code: g.code, axes: g.axes, hidden: g.hidden, wishes: g.wishes, avoid: g.avoid, home: g.home, answers: { pairs: { floor } }, _picks: new Set([FLOOR_MAT[floor.pick]]) };
}
/** 真正的客人档案：用 QUIZ 的 buildProfile 从选择算出来 */
function realProfile(g) {
  const p = buildProfile({ name: g.name, players: 'solo', pairs: pairsOf(g.picks), wishes: g.wishes, avoid: g.avoid, life: g.life, ratio: g.ratio, ratioTouched: true }, {}, { PAIRS: FLOW.PAIRS, LIFE: FLOW.LIFE });
  return { ...p, home: g.home };
}

C.useManifest(MANIFEST);
const LIVE = await C.listCases();

console.log('案例库');

// ───────────────────────── manifest ─────────────────────────

await test('manifest：kind / v / cases，每个案例的字段都齐（SPEC §10.1）', () => {
  assert.equal(MANIFEST.kind, 'wish-cases');
  assert.equal(MANIFEST.v, 1);
  assert.ok(MANIFEST.cases.length >= 10);
  const ids = new Set();
  for (const c of MANIFEST.cases) {
    assert.ok(!ids.has(c.id), `duplicate ${c.id}`);
    ids.add(c.id);
    for (const k of ['id', 'kind', 'v', 'rev', 'status', 'order', 'title', 'story', 'place', 'property', 'scope', 'rooms', 'template', 'style', 'materials', 'mood', 'furniture', 'supplies', 'products', 'wishNotes', 'images', 'createdAt', 'updatedAt'])
      assert.ok(k in c, `${c.id} missing ${k}`);
    assert.ok(C.KINDS.includes(c.kind) && C.STATUSES.includes(c.status), c.id);
    assert.ok(c.title.zh && c.title.en, `${c.id} title zh + en`);
    assert.ok(C.PROPERTY_BY_ID[c.property.type], `${c.id} property type`);
    assert.ok(c.rooms.every((r) => C.ROOM_BY_ID[r]), `${c.id} rooms`);
    assert.ok(c.style.dreamers.length >= 1 && c.style.dreamers.length <= 3 && c.style.dreamers.every((d) => DREAMER_BY_CODE[d]), `${c.id} dreamers`);
    for (const k of ['temp', 'density', 'texture', 'storage']) assert.ok(c.style.axes[k] >= 0 && c.style.axes[k] <= 100, `${c.id} axes.${k}`);
    for (const k of ['light', 'curve', 'social']) assert.ok(c.style.hidden[k] >= 0 && c.style.hidden[k] <= 100, `${c.id} hidden.${k}`);
    assert.ok(['cozy', 'bright', 'moody'].includes(c.mood));
    for (const s of [...c.supplies.firm, ...c.supplies.context]) assert.ok(C.SUPPLY_BY_ID[s], `${c.id} supply ${s}`);
    assert.ok(c.supplies.firm.every((s) => C.SUPPLY.firm.some((x) => x.id === s)), `${c.id} firm list only has firm items`);
    for (const w of [...c.style.wishes, ...Object.keys(c.wishNotes)]) assert.ok(FLOW.WISHES.some((x) => x.v === w), `${c.id} wish ${w}`);
    for (const f of c.style.features) assert.ok(C.FEATURES.some((x) => x.id === f), `${c.id} feature ${f}`);
    if (c.kind === 'project' && c.status === 'live') assert.ok(c.consent, `${c.id} live project needs consent`);
  }
});

await test('manifest：每个材质 id 都认识、也放得进它的表面（种子 = 13 个表面都有）', () => {
  for (const c of MANIFEST.cases) {
    for (const [slot, id] of Object.entries(c.materials)) {
      assert.ok(SLOT_BY_ID[slot], `${c.id} slot ${slot}`);
      assert.ok(MAT_BY_ID[id], `${c.id} ${slot} unknown ${id}`);
      assert.ok(fits(id, slot), `${c.id} ${slot} misfit ${id}`);
    }
    if (c.kind === 'concept') for (const s of SLOTS) assert.ok(c.materials[s.id], `${c.id} seed has ${s.id}`);
  }
});

await test('manifest：没有写死的颜色（色板从材质推出来）', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'src/cases/manifest.json'), 'utf8');
  assert.equal(raw.match(/#[0-9a-fA-F]{3,8}\b/g), null);
  const pal = C.casePalette(LIVE[0]);
  assert.ok(pal.length >= 5 && pal.every((x) => x.color === MAT_BY_ID[x.id].color));
});

await test('种子：16 张牌都出现过；都是 3D 风格方案（kind concept），故事写「给谁」', () => {
  const seeds = MANIFEST.cases.filter((c) => c.id.startsWith('seed-'));
  assert.equal(seeds.length, 10);
  const codes = new Set(seeds.flatMap((c) => c.style.dreamers));
  assert.equal(codes.size, 16, [...DREAMERS.map((d) => d.code)].filter((c) => !codes.has(c)).join(','));
  for (const c of seeds) {
    assert.equal(c.kind, 'concept');
    assert.ok(c.story.zh.startsWith('给'), `${c.id} story is "for whom"`);
    assert.ok(!/业主|住了|住在这里|客户的家/.test(c.story.zh), `${c.id} never claims a real client`);
  }
});

await test('manifest：图片条目的形状 + 一张封面；相对路径的文件真的在 public/cases/', () => {
  for (const c of MANIFEST.cases) {
    if (!c.images.length) continue;
    assert.equal(c.images.filter((im) => im.cover).length, 1, `${c.id} one cover`);
    for (const im of c.images) {
      for (const k of ['id', 'room', 'kind', 'w', 'h', 'src', 'thumb', 'alt', 'cover']) assert.ok(k in im, `${c.id}/${im.id} ${k}`);
      assert.ok(['photo', 'render', 'plan3d'].includes(im.kind));
      assert.ok(C.roomOk(im.room), `${c.id}/${im.id} room ${im.room}`);
      if (c.id.startsWith('seed-')) assert.ok(C.ROOM_BY_ID[im.room], `${c.id}/${im.id} seeds are tagged`);
      assert.ok(im.w > 0 && im.h > 0 && im.w <= 1600);
      assert.ok(typeof im.alt.zh === 'string' && typeof im.alt.en === 'string');
      if (!/^https?:/.test(im.src)) {
        for (const p of [im.src, im.thumb]) {
          const f = path.join(ROOT, 'public/cases', p);
          assert.ok(fs.existsSync(f), `missing ${p}`);
          const kb = fs.statSync(f).size / 1024;
          assert.ok(p.endsWith('-480.webp') ? kb <= 60 : kb <= 250, `${p} ${kb.toFixed(0)} KB over budget`);
        }
      }
    }
  }
});

// ───────────────────────── 列表 / 网址 ─────────────────────────

await test('listCases：客人只拿到上架的；排序按 order；imageURL 走 CONFIG.cases.base', async () => {
  assert.ok(LIVE.every((c) => c.status === 'live'));
  assert.deepEqual(LIVE.map((c) => c.order), [...LIVE.map((c) => c.order)].sort((a, b) => a - b));
  const c = { id: 'x', images: [{ id: '01', src: 'x/01-1600.webp', thumb: 'x/01-480.webp' }] };
  const old = CONFIG.cases.base;
  CONFIG.cases.base = 'https://photos.example.com/wish';
  try {
    assert.equal(C.imageURL(c, c.images[0], 480), 'https://photos.example.com/wish/x/01-480.webp');
    assert.equal(C.imageURL(c, c.images[0], 1600), 'https://photos.example.com/wish/x/01-1600.webp');
  } finally {
    CONFIG.cases.base = old;
  }
  assert.equal(C.imageURL(c, c.images[0]), '/cases/x/01-480.webp');
  assert.equal(C.imageURL(c, { src: 'https://cdn.example.com/a.webp', thumb: 'https://cdn.example.com/a-s.webp' }, 1600), 'https://cdn.example.com/a.webp');
});

await test('placeLine / casePalette / caseNoGo', () => {
  const zen = LIVE.find((c) => c.id === 'seed-zen-condo');
  assert.equal(C.placeLine(zen), '公寓 · 3 房 2 卫 · 约 1,100 sq ft');
  assert.deepEqual([...C.caseNoGo(zen)], ['beige']);
  const arch = LIVE.find((c) => c.id === 'seed-architect-bungalow');
  for (const tag of ['glassdoor', 'marble', 'concrete', 'grey']) assert.ok(C.caseNoGo(arch).has(tag), tag);
});

// ───────────────────────── 配对（SPEC §11） ─────────────────────────

const TABLE = {
  // 客人 → [前四名（按顺序）, 第一名的第一条理由, 被排除的]
  peggy: [['seed-zen-condo', 'seed-nordic-studio', 'seed-urban-condo', 'seed-cosy-townhouse'], '和你的牌一样：暖木禅居', ['seed-softluxe-semid', 'seed-jazz-condo', 'seed-architect-bungalow']],
  ken: [['seed-architect-bungalow', 'seed-urban-condo', 'seed-softluxe-semid', 'seed-library-semid'], '和你的牌一样：现代建筑师', ['seed-wander-terrace']],
  aisha: [['seed-wander-terrace', 'seed-cosy-townhouse', 'seed-library-semid', 'seed-softluxe-semid'], '和你的牌一样：自在旅人', ['seed-nordic-studio', 'seed-urban-condo', 'seed-forest-terrace', 'seed-jazz-condo', 'seed-architect-bungalow']],
};
const SECOND_REASON = {
  peggy: { 'seed-nordic-studio': '同样是高楼住宅', 'seed-urban-condo': '收纳多到用不完：电器高柜把小家电全收进去', 'seed-cosy-townhouse': '收纳多到用不完：每个房间都有到顶的柜子' },
  ken: { 'seed-urban-condo': '你选了「一整片微水泥」—— 这个家也是微水泥', 'seed-softluxe-semid': '招待朋友有面子：八人圆桌，客人来了坐得下', 'seed-library-semid': '招待朋友有面子：唱片柜就在客厅' },
  aisha: { 'seed-cosy-townhouse': '同样是有地住宅', 'seed-library-semid': '招待朋友有面子：唱片柜就在客厅', 'seed-softluxe-semid': '招待朋友有面子：八人圆桌，客人来了坐得下' },
};

for (const [key, [order, first, excl]] of Object.entries(TABLE)) {
  await test(`§11.4 ${GUESTS[key].name}：前四名的顺序、理由、排除都和表一样`, () => {
    const p = tableProfile(GUESTS[key]);
    const r = C.matchCases(p, LIVE, { picksMats: p._picks });
    assert.deepEqual(r.picks.map((m) => m.case.id), order);
    assert.equal(C.reasonText(r.picks[0].reasons[0]), first);
    for (const m of r.picks.slice(1)) assert.equal(C.reasonText(m.reasons[0]), SECOND_REASON[key][m.case.id], m.case.id);
    assert.deepEqual(r.excluded.map((e) => e.id).sort(), [...excl].sort());
    assert.equal(r.picks.length + r.excluded.length + r.rest.length, LIVE.length);
  });
}

await test('真正的档案（QUIZ buildProfile + 全部直觉选择的材质）：同一张牌、同样的第一名和前四名', () => {
  for (const [key, [order]] of Object.entries(TABLE)) {
    const p = realProfile(GUESTS[key]);
    assert.equal(p.code, GUESTS[key].code, key);
    const r = C.matchCases(p, LIVE);
    assert.equal(r.picks[0].case.id, order[0], key);
    assert.deepEqual(new Set(r.picks.map((m) => m.case.id)), new Set(order), key);
  }
});

await test('picksMaterials：从客人自己选的那几张图来；题库没做完 / 旧档案也不出错', () => {
  assert.deepEqual([...C.picksMaterials({ answers: { pairs: { floor: { pick: 'e' } } } })], ['microcement']);
  assert.deepEqual([...C.picksMaterials({})], []);
  assert.deepEqual([...C.picksMaterials({ answers: { pairs: { palette: { pick: 'a' }, nope: { pick: 'z' } } } })], []);
  assert.deepEqual([...C.picksMaterials(null)], []);
});

await test('雷区：任何一种雷区组合 —— 踩雷的家要么被排除，要么卡片上说「这个家的…我会帮你换掉」，而且只换表面', () => {
  const tags = [...FLOW.NOGO_COLORS.map((x) => x.v), ...FLOW.NOGO_FINISHES.map((x) => x.v)];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const combos = [...tags.map((t) => [t])];
  for (let i = 0; i < 300; i++) combos.push(tags.filter(() => rnd() < 0.2));
  for (const limit of [4, 6]) {
    for (const avoid of combos) {
      const p = { ...tableProfile(GUESTS.peggy), avoid };
      const r = C.matchCases(p, LIVE, { limit });
      const clean = r.picks.filter((m) => ![...C.caseNoGo(m.case)].some((x) => avoid.includes(x))).length;
      for (const [where, list] of [['picks', r.picks], ['rest', r.rest]]) {
        for (const m of list) {
          const hits = C.caseNoGoSources(m.case).filter((x) => avoid.includes(x.tag));
          if (!hits.length) {
            assert.ok(!m.swap, `${m.case.id} swap without a hit`);
            continue;
          }
          // 员工标的特征换不掉 → 永远不推荐
          assert.ok(hits.every((x) => x.slot), `${m.case.id} feature ${hits.map((x) => x.tag)} for ${avoid}`);
          const slots = new Set((m.swap || []).map((s) => s.slot));
          for (const h of hits) assert.ok(slots.has(h.slot), `${m.case.id} ${h.tag} on ${h.slot} not in swap for ${avoid}`);
          assert.ok(m.reasons.some((x) => x.kind === 'swap'), `${m.case.id} has the swap note`);
          // 一定排除的标签（不是缎面光泽）：只有凑不满一屏时才放回来，而且只在第一屏
          if (hits.some((x) => !x.soft)) {
            assert.equal(where, 'picks', `${m.case.id} hard hit in rest`);
            assert.ok(clean < limit, `${m.case.id} readmitted although ${clean} clean`);
            assert.equal(m.reasons[0].kind, 'swap', 'readmitted → the swap note is the first line on the card');
          }
        }
      }
      for (const e of r.excluded) assert.ok(e.tags.length && e.tags.every((x) => avoid.includes(x)));
      assert.equal(r.picks.length + r.excluded.length + r.rest.length, LIVE.length);
      // 凑不满：只有在被排除的家全都是员工标的特征（换不掉）时才会少于 limit
      if (r.picks.length < Math.min(limit, LIVE.length)) {
        const ex = r.excluded.map((e) => LIVE.find((c) => c.id === e.id));
        assert.ok(ex.every((c) => C.caseNoGoSources(c).some((x) => !x.slot && avoid.includes(x.tag))), `short list for ${avoid}`);
      }
    }
  }
});

await test('亮面高光：只排除镜面一样亮的主角表面；缎面烤漆柜、台面的光泽不排除（卡片上说会换掉）', () => {
  assert.ok(C.isHighGloss(MAT_BY_ID.carrara) && C.isHighGloss(MAT_BY_ID['zellige-white']));
  for (const id of ['white-lacquer', 'cream-lacquer', 'sage-lacquer', 'quartz-white', 'black-matte', 'brass']) assert.ok(!C.isHighGloss(MAT_BY_ID[id]), id);
  const p = { ...tableProfile(GUESTS.peggy), avoid: ['glossy'] };
  const r = C.matchCases(p, LIVE, { limit: 4 });
  assert.deepEqual(r.excluded, [], 'no seed has a high-gloss hero surface');
  const all = [...r.picks, ...r.rest];
  const nordic = all.find((m) => m.case.id === 'seed-nordic-studio');
  assert.deepEqual(nordic.swap, [{ slot: 'cabinetry', tags: ['glossy'] }, { slot: 'countertop', tags: ['glossy'] }]);
  assert.equal(C.reasonText(nordic.reasons[nordic.reasons.length - 1]), '这个家的柜体、台面我会帮你换掉', 'satin gloss → the note is the last line (detail), not the card line');
  assert.notEqual(nordic.reasons[0].kind, 'swap');
  const urban = all.find((m) => m.case.id === 'seed-urban-condo');
  assert.equal(C.reasonText(urban.reasons[urban.reasons.length - 1]), '这个家的柜体我会帮你换掉');
  const jazz = all.find((m) => m.case.id === 'seed-jazz-condo');
  assert.deepEqual(jazz.swap, [{ slot: 'countertop', tags: ['glossy'] }], 'worktop gloss never excludes');
  // 地板是抛光大理石 → 真的「亮面高光」，排除
  const zen = LIVE.find((c) => c.id === 'seed-zen-condo');
  const shiny = { ...zen, id: 'p-shiny', kind: 'project', consent: true, materials: { ...zen.materials, floor: 'carrara' } };
  const r2 = C.matchCases(p, [...LIVE, shiny], { limit: 4 });
  assert.deepEqual(r2.excluded, [{ id: 'p-shiny', tags: ['glossy'] }]);
  // 员工点了「亮面高光」特征（钢琴烤漆之类）→ 一定排除，凑不满也不放回来
  const piano = { ...zen, id: 'p-piano', kind: 'project', consent: true, style: { ...zen.style, features: ['glossy'] } };
  const r3 = C.matchCases(p, [piano, shiny], { limit: 4 });
  assert.deepEqual(r3.picks.map((m) => m.case.id), ['p-shiny']);
  assert.equal(C.reasonText(r3.picks[0].reasons[0]), '这个家的地板我会帮你换掉');
  assert.deepEqual(r3.excluded, [{ id: 'p-piano', tags: ['glossy'] }]);
  setLang('en', { reload: false });
  try {
    assert.equal(C.reasonText(r3.picks[0].reasons[0]), "I'll swap this home's floor for you");
    const two = { ...shiny, id: 'p-two', materials: { ...shiny.materials, walls: 'navy-paint' } };
    const r4 = C.matchCases({ ...p, avoid: ['glossy', 'blue'] }, [two], { limit: 4 });
    assert.equal(C.reasonText(r4.picks[0].reasons[0]), "I'll swap this home's floor and walls for you");
  } finally {
    setLang('zh', { reload: false });
  }
});

await test('雷区挡掉太多（critic 的 Mei：大理石 + 亮面高光）：仍然有 4 个家可以挑', () => {
  const p = { ...realProfile(GUESTS.peggy), avoid: ['marble', 'glossy'] };
  const r = C.matchCases(p, LIVE, { limit: 4 });
  assert.equal(r.picks.length, 4);
  assert.ok(r.rest.length >= 2, 'a second round too');
  const heavy = C.matchCases({ ...p, avoid: ['marble', 'glossy', 'grey', 'black', 'beige', 'darkwood'] }, LIVE, { limit: 4 });
  assert.equal(heavy.picks.length, 4, 'readmitted with the swap note');
  assert.ok(heavy.picks.some((m) => m.reasons[0].kind === 'swap'));
});

await test('草稿 / 隐藏 / 没有业主同意的真实项目，永远不给客人；员工预览可以看草稿', () => {
  const zen = LIVE.find((c) => c.id === 'seed-zen-condo');
  const extra = [
    { ...zen, id: 'p-draft', kind: 'project', status: 'draft', consent: true },
    { ...zen, id: 'p-hidden', kind: 'project', status: 'hidden', consent: true },
    { ...zen, id: 'p-noconsent', kind: 'project', status: 'live', consent: false },
  ];
  const p = tableProfile(GUESTS.peggy);
  const r = C.matchCases(p, [...LIVE, ...extra], { limit: 20 });
  const all = [...r.picks, ...r.rest, ...r.excluded].map((m) => m.case?.id || m.id);
  for (const id of ['p-draft', 'p-hidden', 'p-noconsent']) assert.ok(!all.includes(id), id);
  const staff = C.matchCases(p, [...LIVE, ...extra], { limit: 20, allowDrafts: true });
  const ids = [...staff.picks, ...staff.rest].map((m) => m.case.id);
  assert.ok(ids.includes('p-draft') && ids.includes('p-noconsent') && !ids.includes('p-hidden'));
});

await test('真实项目同分时 +0.05；上架项目 ≥ hideConceptsAt 以后不再推荐种子', () => {
  const zen = LIVE.find((c) => c.id === 'seed-zen-condo');
  const p = tableProfile(GUESTS.peggy);
  const real = { ...zen, id: 'p-zen-real', kind: 'project', consent: true };
  const r = C.matchCases(p, [zen, real]);
  assert.equal(r.picks[0].case.id, 'p-zen-real');
  assert.ok(Math.abs(r.picks[0].score - C.matchCases(p, [zen]).picks[0].score - 0.05) < 0.002);
  const at = CONFIG.cases.hideConceptsAt;
  const many = Array.from({ length: at }, (_, i) => ({ ...LIVE[i % LIVE.length], id: `p-${i}`, kind: 'project', consent: true, status: 'live' }));
  const r2 = C.matchCases(p, [...LIVE, ...many], { limit: 20 });
  assert.ok([...r2.picks, ...r2.rest].every((m) => m.case.kind === 'project'));
  const fewer = C.matchCases(p, [...LIVE, ...many.slice(1)], { limit: 20 });
  assert.ok([...fewer.picks, ...fewer.rest].some((m) => m.case.kind === 'concept'));
});

await test('MMR：λ 越大越不挤在一起；默认 λ 0.3 就是 §11.4 的表', () => {
  const p = tableProfile(GUESTS.peggy);
  const zen = LIVE.find((c) => c.id === 'seed-zen-condo');
  const twins = [1, 2, 3].map((i) => ({ ...zen, id: `seed-zen-${i}`, order: 10 + i }));
  const zensAt = (lambda) => C.matchCases(p, [...LIVE, ...twins], { lambda, picksMats: p._picks }).picks.filter((m) => m.case.style.dreamers[0] === 'WMNH').length;
  assert.equal(zensAt(0), 4);
  assert.ok(zensAt(1) < zensAt(0) && zensAt(2) <= 2, `λ 1 → ${zensAt(1)} · λ 2 → ${zensAt(2)}`);
  // 完全一样的两个案例：第二个在挑选时扣 λ × 1（λ 1.5 → 换成别的家）
  const r = C.matchCases(p, [zen, twins[0], LIVE.find((c) => c.id === 'seed-nordic-studio')], { lambda: 1.5, picksMats: p._picks });
  assert.equal(r.picks[1].case.id, 'seed-nordic-studio');
});

await test('同一批卡片上看得到的第一条理由不重复（不会三张都说「你选了『暖暖的傍晚』」）', () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pickOf = (arr) => arr[Math.floor(rnd() * arr.length)];
  const sig = (r) => (r.kind === 'pick' ? `pick:${r.vars[0]}` : C.reasonText(r));
  const types = ['condo', 'terrace', 'semid', 'bungalow', 'townhouse'];
  let batches = 0;
  let dupBatches = 0;
  let pickDup = 0;
  const check = (list) => {
    if (list.length < 2) return;
    batches++;
    const firsts = list.map((m) => m.reasons[0]).filter((r) => r && r.kind !== 'swap');
    const sigs = firsts.map(sig);
    if (new Set(sigs).size < sigs.length) dupBatches++;
    const picks = firsts.filter((r) => r.kind === 'pick').map((r) => r.vars[0]);
    if (new Set(picks).size < picks.length) pickDup++;
  };
  for (let i = 0; i < 300; i++) {
    const pairs = Object.fromEntries(FLOW.PAIRS.map((pr) => [pr.id, { pick: pickOf(FLOW.optionsOf(pr)).v, ms: 1500 + rnd() * 3000, left: FLOW.optionsOf(pr).map((o) => o.v).join('') }]));
    const wishes = [...FLOW.WISHES].sort(() => rnd() - 0.5).slice(0, 3).map((w) => w.v);
    const avoid = [...FLOW.NOGO_COLORS, ...FLOW.NOGO_FINISHES].filter(() => rnd() < 0.1).map((x) => x.v);
    const p = buildProfile({ name: 'G', players: 'solo', pairs, wishes, avoid, life: {}, ratio: 30 }, {}, { PAIRS: FLOW.PAIRS, LIFE: FLOW.LIFE });
    p.home = { type: pickOf(types), bedrooms: 2 + Math.floor(rnd() * 4), scope: ['whole'] };
    const r = C.matchCases(p, LIVE, { limit: 4 });
    check(r.picks);
    for (let k = 0; k < r.rest.length; k += 4) check(r.rest.slice(k, k + 4));
  }
  // 只有一条理由可说的家（四条轴全反、愿望不同、房子不同）才会重复：< 1%
  assert.ok(pickDup / batches < 0.01, `${pickDup} of ${batches} batches repeat the same picked image`);
  assert.ok(dupBatches / batches < 0.03, `${dupBatches} of ${batches} batches repeat a first line`);
  // 被用掉的那条退到详情里（不会丢）：Mei 的第二个家仍然在详情里说到她选的图
  for (const g of Object.values(GUESTS)) {
    const r = C.matchCases(realProfile(g), LIVE, { limit: 4 });
    const s = r.picks.map((m) => sig(m.reasons[0]));
    assert.equal(new Set(s).size, s.length, `${g.name}: ${s.join(' | ')}`);
  }
});

await test('理由只用客人看得到的事实：没有门铃答案、谈话提示、反应时间；英文没有中文', () => {
  const allowed = new Set(['card', 'pick', 'wish', 'prop', 'near', 'class', 'style', 'swap']);
  const bells = (FLOW.LIFE.find((q) => q.id === 'bell')?.options || []).map((o) => o.label).filter(Boolean);
  for (const g of Object.values(GUESTS)) {
    const p = realProfile(g);
    const tips = insights(p, storagePlan(p.storage, FLOW.APPLIANCES)).flatMap((x) => [x.zh, x.title, x.text, x.body].filter((s) => typeof s === 'string'));
    const r = C.matchCases(p, LIVE, { limit: 10 });
    for (const m of [...r.picks, ...r.rest]) {
      assert.ok(m.reasons.length <= 3);
      for (const why of m.reasons) {
        assert.ok(allowed.has(why.kind), why.kind);
        assert.ok(why.vars.every((v) => typeof v === 'string' || typeof v === 'number' || (v && typeof v.zh === 'string')), 'vars are plain');
        const zh = C.reasonText(why);
        assert.ok(zh && !/门铃|藏起来|反应|秒|预算|RM/.test(zh), zh);
        for (const b of bells) assert.ok(!zh.includes(b), `bell answer in "${zh}"`);
        for (const s of tips) assert.ok(!s || s.length < 6 || !zh.includes(s), `designer tip in "${zh}"`);
        assert.ok(EN[why.key] != null || !HAN.test(why.key), `EN for ${why.key}`);
      }
    }
  }
  setLang('en', { reload: false });
  try {
    for (const g of Object.values(GUESTS)) {
      const r = C.matchCases(realProfile(g), LIVE, { limit: 10 });
      for (const m of [...r.picks, ...r.rest]) for (const why of m.reasons) assert.ok(!HAN.test(C.reasonText(why)), C.reasonText(why));
    }
    assert.equal(C.reasonText({ kind: 'card', key: '和你的牌一样：{0}', vars: [{ zh: '暖木禅居', en: 'The Zen Nester' }] }), 'Same as your card: The Zen Nester');
  } finally {
    setLang('zh', { reload: false });
  }
});

await test('配对很快：40 个案例 < 5 ms', () => {
  const big = Array.from({ length: 40 }, (_, i) => ({ ...LIVE[i % LIVE.length], id: `c${i}`, order: i }));
  const p = realProfile(GUESTS.ken);
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) C.matchCases(p, big, { limit: 6 });
  const ms = (performance.now() - t0) / 50;
  assert.ok(ms < 5, `${ms.toFixed(2)} ms`);
});

// ───────────────────────── 迁移 / 检查 / 风格 ─────────────────────────

await test('migrateCase：v0（早期草稿）→ v1 的完整形状；v1 原样（可以重复调用）', () => {
  const v0 = { id: 'p-old', name: '老案例', dreamer: 'CMRH', axes: { temp: 30 }, photos: ['p-old/a.webp', { src: 'p-old/b.webp', room: 'kitchen' }], type: 'condo', size: 1200, bedrooms: 3, tags: ['glassdoor', 'nonsense'], materials: { floor: 'white-oak', walls: 'nope', bogus: 'linen' } };
  const c = C.migrateCase(v0);
  assert.equal(c.v, 1);
  assert.equal(c.kind, 'project');
  assert.equal(c.status, 'draft');
  assert.deepEqual(c.title, { zh: '老案例', en: '' });
  assert.deepEqual(c.style.dreamers, ['CMRH']);
  assert.equal(c.style.axes.temp, 30);
  assert.equal(c.style.axes.density, 50);
  assert.deepEqual(c.style.features, ['glassdoor']);
  assert.deepEqual(c.materials, { floor: 'white-oak' });
  assert.deepEqual(c.property, { type: 'condo', sizeSqft: 1200, bedrooms: 3, bathrooms: null, storeys: 1 });
  assert.equal(c.images.length, 2);
  assert.equal(c.images[0].cover, true);
  assert.equal(c.images[1].room, 'kitchen');
  assert.equal(c.images[0].room, '', 'a photo without a room stays untagged (never guessed as 客厅)');
  assert.deepEqual(c.rooms, ['kitchen']);
  assert.deepEqual(C.migrateCase(c), c);
  for (const raw of MANIFEST.cases) {
    const m = C.migrateCase(raw);
    for (const k of Object.keys(raw)) assert.deepEqual(m[k], raw[k], `${raw.id}.${k} unchanged`);
  }
});

await test('没标房间的照片：room 空着（不是客厅）；客人那边没有房间名字，员工那边「房间？」；超过一半没标 → 上架前提醒', async () => {
  assert.equal(C.roomLabel(''), '');
  assert.equal(C.roomLabel('', { ask: true }), '房间？');
  assert.equal(C.roomLabel('plan3d'), '整个家（3D）');
  const im = await C.putImage('p-rooms', null, { blobs: { 1600: new Blob(['a']), 480: new Blob(['b']), w: 1600, h: 1200 } });
  assert.equal(im.room, '');
  const im3 = await C.putImage('p-rooms', null, { room: 'plan3d', blobs: { 1600: new Blob(['a']), 480: new Blob(['b']), w: 1600, h: 1200 } });
  assert.equal(im3.kind, 'plan3d');
  const imgs = (rooms) => rooms.map((room, i) => ({ id: `0${i + 1}`, room, kind: room === 'plan3d' ? 'plan3d' : 'photo', src: 'x', thumb: 'x' }));
  const c = C.migrateCase({ id: 'p-r', kind: 'project', images: imgs(['living', '', '', 'plan3d']) });
  assert.deepEqual(c.images.map((x) => x.room), ['living', '', '', 'plan3d']);
  assert.deepEqual(c.rooms, ['living']);
  assert.equal(C.caseWarnings(c).length, 1, '2 of 3 photos untagged (the 3D overview does not count)');
  assert.equal(C.caseWarnings(c)[0].vars.join('/'), '2/3');
  assert.deepEqual(C.caseWarnings(C.migrateCase({ id: 'p-r2', kind: 'project', images: imgs(['living', 'kitchen', '']) })), []);
  assert.ok(C.validateCase({ ...c, status: 'live' }).errors.every((e) => e.field !== 'images'), 'a warning, not an error');
});

await test('validateCase：上架要中英标题、照片 + 封面、房间、类型、材质或主牌、真实项目要业主同意', () => {
  const zen = LIVE.find((c) => c.id === 'seed-zen-condo');
  const withImg = { ...zen, images: [{ id: '01', room: 'living', kind: 'render', w: 1600, h: 1200, src: 'a', thumb: 'b', alt: { zh: '', en: '' }, cover: true }] };
  assert.equal(C.validateCase(withImg).ok, true);
  const bad = { ...withImg, kind: 'project', consent: false, title: { zh: '家', en: '' }, rooms: [], images: [], materials: { floor: 'linen' }, style: { ...zen.style, dreamers: [] } };
  const fields = C.validateCase(bad).errors.map((e) => e.field);
  for (const f of ['title', 'images', 'rooms', 'materials', 'consent']) assert.ok(fields.includes(f), f);
  assert.equal(C.validateCase({ ...bad, status: 'draft', materials: {} }).ok, true, 'a draft only needs a zh title');
  for (const e of C.validateCase(bad).errors) assert.ok(EN[e.zh], `EN for ${e.zh}`);
});

await test('风格点一点：chips ↔ 80/50/20，猜牌 = 最近的三张', () => {
  const st = C.styleFromChips({ temp: 'a', density: 'b', texture: 'a', storage: 'b', light: 'mid', curve: 'a', social: 'b' });
  assert.deepEqual(st.axes, { temp: 80, density: 20, texture: 80, storage: 20 });
  assert.deepEqual(st.hidden, { light: 50, curve: 80, social: 20 });
  assert.deepEqual(C.chipsFromStyle(st), { temp: 'a', density: 'b', texture: 'a', storage: 'b', light: 'mid', curve: 'a', social: 'b' });
  assert.equal(C.guessDreamers(st)[0], 'WLND');
  assert.equal(C.guessDreamers(st).length, 3);
  assert.equal(C.guessDreamers(C.styleFromChips({ temp: 'mid', density: 'mid', texture: 'mid', storage: 'mid' }))[0], 'WMNH');
  for (const c of MANIFEST.cases) assert.ok(C.guessDreamers(c.style).slice(0, 2).includes(c.style.dreamers[0]) || C.guessDreamers(c.style, 4).includes(c.style.dreamers[0]), `${c.id} primary near the guess`);
});

// ───────────────────────── 设备存储 · 案例包 ─────────────────────────

const png = (bytes) => new Blob([new Uint8Array(bytes)], { type: 'image/webp' });

await test('设备：存草稿 → rev + 1，盖过 manifest；排序、隐藏、删掉（随网站的只隐藏）', async () => {
  C._resetDevice();
  const zen = await C.getCase('seed-zen-condo');
  const saved = await C.saveCase({ ...zen, title: { zh: '晨光里的原木家（改）', en: 'Oak (edited)' } });
  assert.equal(saved.rev, zen.rev + 1);
  assert.equal((await C.getCase('seed-zen-condo')).title.zh, '晨光里的原木家（改）');
  assert.equal((await C.getCase('seed-zen-condo')).origin, 'override');
  const fresh = C.newCase('project');
  fresh.title = { zh: '新项目', en: 'New project' };
  const f2 = await C.saveCase(fresh);
  assert.equal(f2.status, 'draft');
  assert.ok(!(await C.listCases()).some((c) => c.id === fresh.id), 'drafts are not listed for guests');
  assert.ok((await C.listCases({ includeDrafts: true })).some((c) => c.id === fresh.id));
  const before = (await C.listCases({ includeDrafts: true })).map((c) => c.id);
  const want = [fresh.id, 'seed-cosy-townhouse', ...before.filter((id) => id !== fresh.id && id !== 'seed-cosy-townhouse')];
  await C.setOrder(want);
  assert.deepEqual((await C.listCases({ includeDrafts: true })).map((c) => c.id), want);
  await C.setStatus('seed-jazz-condo', 'hidden');
  assert.ok(!(await C.listCases()).some((c) => c.id === 'seed-jazz-condo'));
  await C.setStatus('seed-jazz-condo', 'live');
  assert.ok((await C.listCases()).some((c) => c.id === 'seed-jazz-condo'));
  await C.deleteCase('seed-nordic-studio');
  assert.equal((await C.getCase('seed-nordic-studio')).status, 'hidden', 'bundled cases are hidden, not deleted');
  await C.deleteCase(fresh.id);
  assert.equal(await C.getCase(fresh.id), null);
  C._resetDevice();
});

await test('案例包：导出 → 清空 → 导入（含设备照片）；再导入 = 跳过；rev 更大才更新', async () => {
  C._resetDevice();
  const c = C.newCase('project');
  Object.assign(c, { title: { zh: '展厅新做的', en: 'Made in the showroom' }, rooms: ['living'], property: { ...c.property, type: 'condo' } });
  const img = await C.putImage(c.id, null, { room: 'living', blobs: { 1600: png([82, 73, 70, 70, 1, 2, 3]), 480: png([82, 73, 70, 70, 4]), w: 1600, h: 1200 } });
  img.cover = true;
  c.images = [img];
  const saved = await C.saveCase(c);
  const blob = await C.exportPack();
  const text = await blob.text();
  const pack = JSON.parse(text);
  assert.equal(pack.kind, 'wish-cases');
  assert.ok(pack.cases.length >= 11);
  assert.ok(pack.photos[`${c.id}/${img.id}`].startsWith('data:image/webp;base64,'));
  assert.ok(!text.includes('"origin"'), 'no runtime fields in the pack');
  assert.match(C.packFileName(new Date(2026, 9, 18)), /^WISH-cases-20261018\.json$/);

  C._resetDevice();
  assert.equal(await C.getCase(c.id), null);
  const r1 = await C.importPack(text);
  assert.deepEqual({ added: r1.added, updated: r1.updated }, { added: 1, updated: 0 });
  assert.equal(r1.skipped, pack.cases.length - 1, 'bundled cases at the same rev are skipped');
  const back = await C.getCase(c.id);
  assert.equal(back.rev, saved.rev);
  assert.equal(back.title.en, 'Made in the showroom');
  const res = await C.resolveImages(back);
  assert.ok(res.images[0].url && res.images[0].thumbUrl, 'device photo restored');
  C.releaseImages(res);

  const r2 = await C.importPack(text);
  assert.deepEqual([r2.added, r2.updated, r2.skipped], [0, 0, pack.cases.length]);

  const newer = JSON.parse(text);
  const mine = newer.cases.find((x) => x.id === c.id);
  mine.rev += 2;
  mine.title.zh = '展厅新做的（第二版）';
  const older = newer.cases.find((x) => x.id === 'seed-zen-condo');
  older.rev = 0;
  older.title.zh = '旧的';
  const r3 = await C.importPack(JSON.stringify(newer));
  assert.equal(r3.updated, 1);
  assert.equal((await C.getCase(c.id)).title.zh, '展厅新做的（第二版）');
  assert.equal((await C.getCase('seed-zen-condo')).title.zh, '晨光里的原木家', 'a lower rev never wins');

  const bad = await C.importPack('{"kind":"other"}');
  assert.equal(bad.errors.length, 1);
  assert.ok(EN[bad.errors[0].zh]);
  C._resetDevice();
});

// ───────────────────────── 照片导入脚本（SPEC §10.2） ─────────────────────────

const { importCases, webpMeta, guessRoom, slugOf } = await import('../scripts/import-cases.mjs');
const { spawnSync } = await import('node:child_process');
const hasPillow = spawnSync('python3', ['-I', '-c', 'import PIL.features as f; assert f.check("webp")']).status === 0;
let hasChromium = false;
try {
  const { createRequire } = await import('node:module');
  createRequire(import.meta.url)('/opt/node-tools/node_modules/playwright');
  hasChromium = true;
} catch {
  hasChromium = false;
}

await test('import-cases：从文件名认房间；文件夹名 → 稳定的编号', () => {
  assert.equal(guessRoom('01 客厅 living.jpg'), 'living');
  assert.equal(guessRoom('IMG_主卧-2.jpg'), 'master');
  assert.equal(guessRoom('dry-kitchen.JPG'), 'kitchen');
  assert.equal(guessRoom('Master Bedroom.jpg'), 'master');
  assert.equal(guessRoom('bilik tidur 2.jpg'), 'bedroom');
  assert.equal(guessRoom('DSC0042.jpg'), null);
  assert.equal(slugOf('Setia Alam Condo'), 'setia-alam-condo');
  assert.equal(slugOf('双层排屋'), slugOf('双层排屋'));
  assert.match(slugOf('双层排屋'), /^case-[0-9a-f]{6}$/);
});

if (!hasPillow && !hasChromium) console.log('  · import-cases：没有 Pillow 也没有 Chromium，跳过照片转换的测试');
// 一个引擎就够（有 Pillow 用 Pillow，没有才开 Chromium —— npm test 不要每次都多开一个浏览器）；CASES_TEST_ENGINES=all 两个都测
const ENGINES = process.env.CASES_TEST_ENGINES === 'all' ? [hasPillow && 'pillow', hasChromium && 'chromium'].filter(Boolean) : [hasPillow ? 'pillow' : hasChromium ? 'chromium' : null].filter(Boolean);
for (const engine of ENGINES) {
  await test(`import-cases（${engine}）：2 张带 EXIF / GPS 的 JPG → 1600 / 480 WebP，没有 EXIF；manifest 新增草稿；再跑 = 没变；员工的标签保留`, async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wish-cases-'));
    try {
      const src = path.join(ROOT, 'test/fixtures/cases/photos');
      const manifest = path.join(tmp, 'manifest.json');
      fs.writeFileSync(manifest, JSON.stringify({ kind: 'wish-cases', v: 1, updatedAt: '', cases: [MANIFEST.cases[0]] }));
      const out = path.join(tmp, 'out');
      for (const f of fs.readdirSync(path.join(src, 'setia-condo'))) assert.ok(fs.readFileSync(path.join(src, 'setia-condo', f)).includes(Buffer.from('Exif')), `fixture ${f} has EXIF`);
      const r = await importCases({ src, out, manifest, engine, quiet: true });
      assert.deepEqual(r.errors, []);
      assert.equal(r.added.length, 2);
      const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      assert.equal(m.cases[0].id, MANIFEST.cases[0].id, 'existing entries kept');
      const c = m.cases.find((x) => x.id === 'p-setia-condo');
      assert.equal(c.kind, 'project');
      assert.equal(c.status, 'draft');
      assert.equal(c.consent, false);
      assert.deepEqual(c.rooms, ['living', 'kitchen']);
      assert.deepEqual(c.images.map((im) => [im.id, im.room, im.cover]), [['01', 'living', true], ['02', 'kitchen', false]]);
      assert.deepEqual([c.images[0].w, c.images[0].h], [1600, 1000]);
      assert.deepEqual([c.images[1].w, c.images[1].h], [600, 900], 'EXIF orientation applied (900×600 rotated)');
      const terrace = m.cases.find((x) => x.title.en === 'Double-storey terrace, Setia Alam');
      assert.ok(terrace && terrace.title.zh === '双层排屋 · Setia Alam', 'case.txt titles');
      for (const im of [...c.images, ...terrace.images]) {
        for (const p of [im.src, im.thumb]) {
          const buf = fs.readFileSync(path.join(out, p));
          const meta = webpMeta(buf);
          assert.ok(meta.ok, `${p} is WebP`);
          assert.ok(!meta.exif && !meta.xmp, `${p} has no EXIF / XMP (${meta.chunks})`);
          assert.ok(!buf.includes(Buffer.from('FixtureCam')), `${p} has no camera name`);
        }
        const thumbW = buf480W(fs.readFileSync(path.join(out, im.thumb)));
        assert.ok(thumbW <= 480, `thumb width ${thumbW}`);
      }
      assert.ok(C.migrateCase(c) && C.validateCase(c).ok, 'a fresh import is a valid draft');

      const again = await importCases({ src, out, manifest, engine, quiet: true });
      assert.deepEqual([again.added.length, again.updated.length, again.unchanged.length], [0, 0, 2]);

      // 员工打了标签 → 换一张照片再跑：标签留着，rev + 1
      const tagged = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      const t0 = tagged.cases.find((x) => x.id === 'p-setia-condo');
      Object.assign(t0, { title: { zh: '实达公寓', en: 'Setia condo' }, style: { ...t0.style, dreamers: ['CMRH'] }, materials: { floor: 'white-oak' } });
      fs.writeFileSync(manifest, JSON.stringify(tagged));
      const src2 = path.join(tmp, 'src2');
      fs.cpSync(src, src2, { recursive: true });
      fs.copyFileSync(path.join(src, '双层排屋/主卧.jpg'), path.join(src2, 'setia-condo/03 主卧.jpg'));
      const r3 = await importCases({ src: src2, out, manifest, engine, quiet: true });
      assert.deepEqual(r3.updated, ['p-setia-condo']);
      const after = JSON.parse(fs.readFileSync(manifest, 'utf8')).cases.find((x) => x.id === 'p-setia-condo');
      assert.equal(after.title.zh, '实达公寓');
      assert.deepEqual(after.style.dreamers, ['CMRH']);
      assert.equal(after.materials.floor, 'white-oak');
      assert.equal(after.images.length, 3);
      assert.equal(after.rev, t0.rev + 1);
      assert.ok(after.rooms.includes('master'));

      const ext = await importCases({ src, out: path.join(tmp, 'ext'), manifest: path.join(tmp, 'ext.json'), engine, quiet: true, base: 'https://photos.example.com/wish/' });
      assert.ok(ext.manifest.cases[0].images[0].src.startsWith('https://photos.example.com/wish/p-'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

if (ENGINES.length) {
  const { mergePack } = await import('../scripts/import-cases.mjs');
  await test(`import-cases --pack（${ENGINES[0]}）：iPad 导出的案例包合并回 manifest —— rev 大的赢，iPad 照片变成 NN-1600 / 480 文件，没同意的项目不上架`, async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wish-pack-test-'));
    try {
      const manifest = path.join(tmp, 'manifest.json');
      fs.writeFileSync(manifest, JSON.stringify({ kind: 'wish-cases', v: 1, updatedAt: '', cases: MANIFEST.cases.slice(0, 2) }));
      const photo = 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'public/cases/seed-zen-condo/01-480.webp')).toString('base64');
      const zen = { ...MANIFEST.cases[0], rev: MANIFEST.cases[0].rev + 1, title: { zh: '晨光里的原木家（iPad 改过）', en: 'Oak (edited on the iPad)' }, origin: 'override' };
      const older = { ...MANIFEST.cases[1], rev: 0, title: { zh: '旧的', en: 'Old' } };
      const fresh = {
        ...C.newCase('project'), id: 'p-showroom', rev: 2, status: 'live', consent: false, title: { zh: '展厅新做的', en: 'Made in the showroom' },
        images: [{ id: 'dabc', room: 'kitchen', kind: 'photo', w: 480, h: 360, src: '', thumb: '', alt: { zh: '', en: '' }, cover: true, device: true }, { id: 'dlost', room: 'living', kind: 'photo', w: 1, h: 1, src: '', thumb: '', alt: { zh: '', en: '' }, cover: false, device: true }],
      };
      const pack = { kind: 'wish-cases', v: 1, exportedAt: '', cases: [zen, older, fresh], photos: { 'p-showroom/dabc': photo } };
      const r = await mergePack({ pack, out: path.join(tmp, 'out'), manifest, engine: ENGINES[0], quiet: true });
      assert.deepEqual([r.added, r.updated, r.skipped], [['p-showroom'], [zen.id], [older.id]]);
      assert.equal(r.errors.length, 1, 'the photo missing from the pack is reported');
      const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      assert.equal(m.cases.find((c) => c.id === zen.id).title.zh, '晨光里的原木家（iPad 改过）');
      assert.ok(!('origin' in m.cases.find((c) => c.id === zen.id)), 'runtime fields dropped');
      assert.equal(m.cases.find((c) => c.id === older.id).title.zh, MANIFEST.cases[1].title.zh, 'a lower rev never wins');
      const p = m.cases.find((c) => c.id === 'p-showroom');
      assert.equal(p.status, 'draft', 'no owner consent → draft');
      assert.deepEqual(p.images.map((im) => [im.id, im.room, im.cover, im.src, im.device]), [['01', 'kitchen', true, 'p-showroom/01-1600.webp', undefined]]);
      for (const f of ['01-1600.webp', '01-480.webp']) {
        const meta = webpMeta(fs.readFileSync(path.join(tmp, 'out/p-showroom', f)));
        assert.ok(meta.ok && !meta.exif && !meta.xmp, f);
      }
      assert.ok(C.validateCase(C.migrateCase(p)).ok);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

/** WebP（VP8 / VP8L / VP8X）的宽 */
function buf480W(b) {
  const id = b.toString('ascii', 12, 16);
  if (id === 'VP8 ') return b.readUInt16LE(26) & 0x3fff;
  if (id === 'VP8L') return 1 + (((b[22] & 0x3f) << 8) | b[21]);
  if (id === 'VP8X') return 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
  return -1;
}

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
