// 案例展示 · 资料这一层（src/shared/cases.js —— docs/showcase/SPEC.md §1）：
//   照片说明 / 细节特写 / 每个房间我们做了什么（roomsMade）的迁移、照片标签、板材的客人名字、每个房间我们做了什么（推算 + 员工写的）、
//   房子档案、相似的家、看全部（筛选 + 数量）、一次读一张大图、存储空间、案例包来回一趟不丢东西；
//   matchCases 改成用 guestPool 以后，示范客人的配对结果一个都不变（重构前记下来的结果写死在这里）。
// 跑法：node test/showcase.test.mjs（npm test 会一起跑）
//
// 板材是测试自己编的（id 一律用保留的前缀 TEST_ID_PREFIX 'sail-t-'，名字都是「测试…」，编号都是假的）；没有照片、没有真人名字。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveObjectURL } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import * as C from '../src/shared/cases.js';
import * as S from '../src/shared/series.js';
import { CONFIG } from '../src/shared/config.js';
import { MAT_BY_ID, registerBoards, unregisterBoards } from '../src/shared/materials.js';
import { resetBoards, TEST_ID_PREFIX } from '../src/shared/boards/library-api.js';
import { DREAMERS, DREAMER_BY_CODE } from '../src/shared/dreamers.js';
import { buildProfile } from '../src/shared/profile.js';
import { offersWorktop, homeSummary } from '../src/shared/home.js';
import * as FLOW from '../src/quiz/flow.js';
import { setLang as setLang0 } from '../src/shared/i18n.js';
import EN from '../src/shared/i18n/en.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/cases/manifest.json'), 'utf8'));
const HAN = /[一-鿿]/;
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
/** 在英文里跑一段，跑完一定切回中文 */
async function inEnglish(fn) {
  setLang('en');
  try {
    return await fn();
  } finally {
    setLang('zh');
  }
}
const approx = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.0011, `${msg}: ${a} ≈ ${b}`);
/** 临时改 CONFIG 的一段（跑完改回来） */
async function withConfig(obj, patch, fn) {
  const old = { ...obj };
  Object.assign(obj, patch);
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(patch)) delete obj[k];
    Object.assign(obj, old);
  }
}

console.log('案例展示 · 资料（showcase）');

// 板材登记表先清空（随网站的板材库合进真实板材以后这里也一样），只用下面编的测试板
resetBoards();
C.useManifest(MANIFEST);
const LIVE = await C.listCases();
const byId = (id) => LIVE.find((c) => c.id === id);
const zen = byId('seed-zen-condo');

// ───────────────────────── 示范客人（和 test/cases.test.mjs 同一套，固定下来） ─────────────────────────
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
function tableProfile(g) {
  const floor = pairsOf(g.picks).floor;
  return { code: g.code, axes: g.axes, hidden: g.hidden, wishes: g.wishes, avoid: g.avoid, home: g.home, answers: { pairs: { floor } }, _picks: new Set([FLOOR_MAT[floor.pick]]) };
}
function realProfile(g) {
  const p = buildProfile({ name: g.name, players: 'solo', pairs: pairsOf(g.picks), wishes: g.wishes, avoid: g.avoid, life: g.life, ratio: g.ratio, ratioTouched: true }, {}, { PAIRS: FLOW.PAIRS, LIFE: FLOW.LIFE });
  return { ...p, home: g.home };
}

// ───────────────────────── 1. matchCases 重构（guestPool）：结果一个都不变 ─────────────────────────

// 重构之前（cases.js 还没有 guestPool 的时候）跑出来的：picks 的顺序、rest 的顺序、excluded（同一批示范客人、随网站的 manifest）
const BEFORE = {
  'peggy/table': { picks: ['seed-zen-condo', 'seed-nordic-studio', 'seed-urban-condo', 'seed-cosy-townhouse'], rest: ['seed-forest-terrace', 'seed-wander-terrace', 'seed-library-semid'], excluded: ['seed-softluxe-semid', 'seed-jazz-condo', 'seed-architect-bungalow'] },
  'peggy/real': { picks: ['seed-zen-condo', 'seed-cosy-townhouse', 'seed-nordic-studio', 'seed-urban-condo'], rest: ['seed-wander-terrace', 'seed-forest-terrace', 'seed-library-semid'], excluded: ['seed-softluxe-semid', 'seed-jazz-condo', 'seed-architect-bungalow'] },
  'peggy/real/6': { picks: ['seed-zen-condo', 'seed-cosy-townhouse', 'seed-nordic-studio', 'seed-urban-condo', 'seed-wander-terrace', 'seed-forest-terrace'], rest: ['seed-library-semid'], excluded: ['seed-softluxe-semid', 'seed-jazz-condo', 'seed-architect-bungalow'] },
  'peggy/real/extra': { picks: ['p-real', 'seed-zen-condo', 'seed-cosy-townhouse', 'seed-nordic-studio'], rest: ['seed-urban-condo', 'seed-wander-terrace', 'seed-forest-terrace', 'seed-library-semid'], excluded: ['seed-softluxe-semid', 'seed-jazz-condo', 'seed-architect-bungalow'] },
  'peggy/real/extra/staff': { picks: ['p-draft', 'p-noconsent', 'p-real', 'seed-zen-condo'], rest: ['seed-cosy-townhouse', 'seed-nordic-studio', 'seed-urban-condo', 'seed-wander-terrace', 'seed-forest-terrace', 'seed-library-semid'], excluded: ['seed-softluxe-semid', 'seed-jazz-condo', 'seed-architect-bungalow'] },
  'peggy/real/many': { picks: ['p-0', 'p-1', 'p-2', 'p-5'], rest: ['p-4', 'p-6'], excluded: ['p-3', 'p-7'] },
  'peggy/real/many/keep': { picks: ['p-0', 'seed-zen-condo', 'p-1', 'seed-cosy-townhouse'], rest: ['seed-nordic-studio', 'p-2', 'seed-urban-condo', 'p-5', 'p-4', 'seed-wander-terrace', 'seed-forest-terrace', 'p-6', 'seed-library-semid'], excluded: ['seed-softluxe-semid', 'seed-jazz-condo', 'seed-architect-bungalow', 'p-3', 'p-7'] },
  'peggy/real/many-1': { picks: ['seed-zen-condo', 'p-1', 'seed-cosy-townhouse', 'p-2'], rest: ['seed-nordic-studio', 'seed-urban-condo', 'p-5', 'p-4', 'seed-wander-terrace', 'seed-forest-terrace', 'p-6', 'seed-library-semid'], excluded: ['seed-softluxe-semid', 'seed-jazz-condo', 'seed-architect-bungalow', 'p-3', 'p-7'] },
  'peggy/real/heavy': { picks: ['seed-wander-terrace', 'seed-nordic-studio', 'seed-library-semid', 'seed-zen-condo'], rest: [], excluded: ['seed-urban-condo', 'seed-softluxe-semid', 'seed-forest-terrace', 'seed-jazz-condo', 'seed-architect-bungalow', 'seed-cosy-townhouse'] },
  'ken/table': { picks: ['seed-architect-bungalow', 'seed-urban-condo', 'seed-softluxe-semid', 'seed-library-semid'], rest: ['seed-nordic-studio', 'seed-jazz-condo', 'seed-forest-terrace', 'seed-zen-condo', 'seed-cosy-townhouse'], excluded: ['seed-wander-terrace'] },
  'ken/real': { picks: ['seed-architect-bungalow', 'seed-softluxe-semid', 'seed-urban-condo', 'seed-library-semid'], rest: ['seed-nordic-studio', 'seed-jazz-condo', 'seed-forest-terrace', 'seed-cosy-townhouse', 'seed-zen-condo'], excluded: ['seed-wander-terrace'] },
  'ken/real/6': { picks: ['seed-architect-bungalow', 'seed-softluxe-semid', 'seed-urban-condo', 'seed-library-semid', 'seed-nordic-studio', 'seed-jazz-condo'], rest: ['seed-forest-terrace', 'seed-cosy-townhouse', 'seed-zen-condo'], excluded: ['seed-wander-terrace'] },
  'ken/real/extra': { picks: ['seed-architect-bungalow', 'seed-softluxe-semid', 'seed-urban-condo', 'seed-library-semid'], rest: ['seed-nordic-studio', 'seed-jazz-condo', 'seed-forest-terrace', 'p-real', 'seed-cosy-townhouse', 'seed-zen-condo'], excluded: ['seed-wander-terrace'] },
  'ken/real/extra/staff': { picks: ['seed-architect-bungalow', 'seed-softluxe-semid', 'seed-urban-condo', 'seed-library-semid'], rest: ['seed-nordic-studio', 'seed-jazz-condo', 'seed-forest-terrace', 'p-draft', 'p-noconsent', 'p-real', 'seed-cosy-townhouse', 'seed-zen-condo'], excluded: ['seed-wander-terrace'] },
  'ken/real/many': { picks: ['p-3', 'p-2', 'p-6', 'p-1'], rest: ['p-7', 'p-4', 'p-0'], excluded: ['p-5'] },
  'ken/real/many/keep': { picks: ['seed-architect-bungalow', 'p-3', 'p-2', 'p-6'], rest: ['seed-softluxe-semid', 'seed-urban-condo', 'seed-library-semid', 'p-1', 'p-7', 'seed-nordic-studio', 'seed-jazz-condo', 'p-4', 'seed-forest-terrace', 'p-0', 'seed-cosy-townhouse', 'seed-zen-condo'], excluded: ['seed-wander-terrace', 'p-5'] },
  'ken/real/many-1': { picks: ['seed-architect-bungalow', 'p-3', 'p-2', 'p-6'], rest: ['seed-softluxe-semid', 'seed-urban-condo', 'seed-library-semid', 'p-1', 'p-7', 'seed-nordic-studio', 'seed-jazz-condo', 'p-4', 'seed-forest-terrace', 'seed-cosy-townhouse', 'seed-zen-condo'], excluded: ['seed-wander-terrace', 'p-5'] },
  'ken/real/heavy': { picks: ['seed-wander-terrace', 'seed-library-semid', 'seed-nordic-studio', 'seed-urban-condo'], rest: [], excluded: ['seed-zen-condo', 'seed-softluxe-semid', 'seed-forest-terrace', 'seed-jazz-condo', 'seed-architect-bungalow', 'seed-cosy-townhouse'] },
  'aisha/table': { picks: ['seed-wander-terrace', 'seed-cosy-townhouse', 'seed-library-semid', 'seed-softluxe-semid'], rest: ['seed-zen-condo'], excluded: ['seed-nordic-studio', 'seed-urban-condo', 'seed-forest-terrace', 'seed-jazz-condo', 'seed-architect-bungalow'] },
  'aisha/real': { picks: ['seed-wander-terrace', 'seed-cosy-townhouse', 'seed-library-semid', 'seed-softluxe-semid'], rest: ['seed-zen-condo'], excluded: ['seed-nordic-studio', 'seed-urban-condo', 'seed-forest-terrace', 'seed-jazz-condo', 'seed-architect-bungalow'] },
  'aisha/real/6': { picks: ['seed-wander-terrace', 'seed-cosy-townhouse', 'seed-library-semid', 'seed-softluxe-semid', 'seed-zen-condo', 'seed-forest-terrace'], rest: [], excluded: ['seed-nordic-studio', 'seed-urban-condo', 'seed-jazz-condo', 'seed-architect-bungalow'] },
  'aisha/real/extra': { picks: ['seed-wander-terrace', 'seed-cosy-townhouse', 'seed-library-semid', 'p-real'], rest: ['seed-softluxe-semid', 'seed-zen-condo'], excluded: ['seed-nordic-studio', 'seed-urban-condo', 'seed-forest-terrace', 'seed-jazz-condo', 'seed-architect-bungalow'] },
  'aisha/real/extra/staff': { picks: ['seed-wander-terrace', 'seed-cosy-townhouse', 'seed-library-semid', 'p-draft'], rest: ['p-noconsent', 'p-real', 'seed-softluxe-semid', 'seed-zen-condo'], excluded: ['seed-nordic-studio', 'seed-urban-condo', 'seed-forest-terrace', 'seed-jazz-condo', 'seed-architect-bungalow'] },
  'aisha/real/many': { picks: ['p-5', 'p-6', 'p-3', 'p-0'], rest: [], excluded: ['p-1', 'p-2', 'p-4', 'p-7'] },
  'aisha/real/many/keep': { picks: ['p-5', 'seed-wander-terrace', 'seed-cosy-townhouse', 'p-6'], rest: ['seed-library-semid', 'p-3', 'p-0', 'seed-softluxe-semid', 'seed-zen-condo'], excluded: ['seed-nordic-studio', 'seed-urban-condo', 'seed-forest-terrace', 'seed-jazz-condo', 'seed-architect-bungalow', 'p-1', 'p-2', 'p-4', 'p-7'] },
  'aisha/real/many-1': { picks: ['p-5', 'seed-wander-terrace', 'seed-cosy-townhouse', 'p-6'], rest: ['seed-library-semid', 'p-3', 'seed-softluxe-semid', 'seed-zen-condo'], excluded: ['seed-nordic-studio', 'seed-urban-condo', 'seed-forest-terrace', 'seed-jazz-condo', 'seed-architect-bungalow', 'p-1', 'p-2', 'p-4', 'p-7'] },
  'aisha/real/heavy': { picks: ['seed-wander-terrace', 'seed-library-semid', 'seed-nordic-studio', 'seed-cosy-townhouse'], rest: [], excluded: ['seed-zen-condo', 'seed-urban-condo', 'seed-softluxe-semid', 'seed-forest-terrace', 'seed-jazz-condo', 'seed-architect-bungalow'] },
};

/** 每个场景的案例（和记下结果时一模一样的做法） */
function scenarios() {
  const EXTRA = [
    { ...zen, id: 'p-draft', kind: 'project', status: 'draft', consent: true },
    { ...zen, id: 'p-hidden', kind: 'project', status: 'hidden', consent: true },
    { ...zen, id: 'p-noconsent', kind: 'project', status: 'live', consent: false },
    { ...zen, id: 'p-show', kind: 'showroom', status: 'live', consent: true },
    { ...zen, id: 'p-real', kind: 'project', status: 'live', consent: true, order: 15 },
  ];
  const MANY = Array.from({ length: 8 }, (_, i) => ({ ...LIVE[i % LIVE.length], id: `p-${i}`, kind: 'project', consent: true, status: 'live', order: 200 + i }));
  const out = [];
  for (const [key, g] of Object.entries(GUESTS)) {
    const tp = tableProfile(g);
    const rp = realProfile(g);
    out.push([`${key}/table`, () => C.matchCases(tp, LIVE, { picksMats: tp._picks })]);
    out.push([`${key}/real`, () => C.matchCases(rp, LIVE)]);
    out.push([`${key}/real/6`, () => C.matchCases(rp, LIVE, { limit: 6 })]);
    out.push([`${key}/real/extra`, () => C.matchCases(rp, [...LIVE, ...EXTRA], { limit: 4 })]);
    out.push([`${key}/real/extra/staff`, () => C.matchCases(rp, [...LIVE, ...EXTRA], { limit: 4, allowDrafts: true })]);
    out.push([`${key}/real/many`, () => C.matchCases(rp, [...LIVE, ...MANY], { limit: 4 })]);
    out.push([`${key}/real/many/keep`, () => C.matchCases(rp, [...LIVE, ...MANY], { limit: 4, keepConcepts: true })]);
    out.push([`${key}/real/many-1`, () => C.matchCases(rp, [...LIVE, ...MANY.slice(1)], { limit: 4 })]);
    out.push([`${key}/real/heavy`, () => C.matchCases({ ...rp, avoid: ['marble', 'glossy', 'grey', 'black', 'beige', 'darkwood'] }, LIVE, { limit: 4 })]);
  }
  return out;
}

await test('matchCases 改用 guestPool 以后：三位示范客人 × 9 种情况（草稿 / 隐藏 / 没同意 / 展厅 / 真实项目 ≥ hideConceptsAt / keepConcepts / 雷区一大堆），picks、rest、excluded 和重构前一模一样', async () => {
  await withConfig(CONFIG.cases, { hideConceptsAt: 8 }, () => {
    const list = scenarios();
    assert.equal(list.length, Object.keys(BEFORE).length);
    for (const [key, run] of list) {
      const r = run();
      const got = { picks: r.picks.map((m) => m.case.id), rest: r.rest.map((m) => m.case.id), excluded: r.excluded.map((e) => e.id) };
      assert.deepEqual(got, BEFORE[key], key);
    }
  });
});

await test('guestPool：和 matchCases 用的是同一条 —— 上架的；真实项目要同意；展厅永远不要；草稿只给员工预览（隐藏的不给）；hideConceptsAt / keepConcepts', async () => {
  const mk = (id, over) => ({ ...zen, id, ...over });
  const cases = [
    ...LIVE,
    mk('p-draft', { kind: 'project', status: 'draft', consent: true }),
    mk('p-hidden', { kind: 'project', status: 'hidden', consent: true }),
    mk('p-noconsent', { kind: 'project', status: 'live', consent: false }),
    mk('p-show', { kind: 'showroom', status: 'live', consent: true }),
    mk('c-draft', { kind: 'concept', status: 'draft' }),
    null,
  ];
  const ids = (l) => l.map((c) => c.id);
  assert.deepEqual(ids(C.guestPool(cases)), ids(LIVE), 'guests: only live concepts here');
  assert.deepEqual(ids(C.guestPool(cases, { allowDrafts: true })), [...ids(LIVE), 'p-draft', 'p-noconsent', 'c-draft']);
  assert.deepEqual(C.guestPool(null), []);
  // 和 matchCases 看到的一样（limit 够大 = 全部列出来）
  for (const allowDrafts of [false, true]) {
    const pool = new Set(ids(C.guestPool(cases, { allowDrafts })));
    const r = C.matchCases({}, cases.filter(Boolean), { limit: 100, allowDrafts });
    assert.deepEqual(new Set([...r.picks, ...r.rest].map((m) => m.case.id)), pool, `allowDrafts ${allowDrafts}`);
  }
  await withConfig(CONFIG.cases, { hideConceptsAt: 3 }, () => {
    const real = [1, 2, 3].map((i) => mk(`p-${i}`, { kind: 'project', status: 'live', consent: true }));
    assert.ok(C.guestPool([...LIVE, ...real.slice(0, 2)]).some((c) => c.kind === 'concept'), '2 live projects < 3 → concepts stay');
    assert.deepEqual(ids(C.guestPool([...LIVE, ...real])), ['p-1', 'p-2', 'p-3'], '3 live projects → concepts hidden');
    assert.equal(C.guestPool([...LIVE, ...real], { keepConcepts: true }).length, LIVE.length + 3);
    // 没同意的真实项目不算数（客人看不到它）
    assert.ok(C.guestPool([...LIVE, ...real.slice(0, 2), mk('p-x', { kind: 'project', status: 'live', consent: false })]).some((c) => c.kind === 'concept'));
  });
  await withConfig(CONFIG.cases, { hideConceptsAt: 0 }, () => {
    const real = Array.from({ length: 20 }, (_, i) => mk(`p-${i}`, { kind: 'project', status: 'live', consent: true }));
    assert.equal(C.guestPool([...LIVE, ...real]).length, LIVE.length + 20, '0 = never hide concepts');
  });
});

// ───────────────────────── 2. 资料：迁移 / 常量 ─────────────────────────

await test('常量：PHOTO_MAX = CONFIG.cases.maxPhotos（40）· PHOTO_EST_BYTES · ROOM_HOME · SUPPLY_ROOMS 管到每一样「我们做」、房间都认得', () => {
  assert.equal(CONFIG.cases.maxPhotos, 40);
  assert.equal(C.PHOTO_MAX, 40);
  assert.equal(C.PHOTO_EST_BYTES, 330 * 1024);
  assert.equal(C.ROOM_HOME, 'home');
  assert.ok(!C.ROOM_BY_ID[C.ROOM_HOME], 'home is not a photo room');
  assert.deepEqual(Object.keys(C.SUPPLY_ROOMS).sort(), C.SUPPLY_OFFER.map((s) => s.id).sort(), 'one entry per offer id (never furniture / context)');
  for (const [id, rooms] of Object.entries(C.SUPPLY_ROOMS)) for (const r of rooms) assert.ok(C.ROOM_BY_ID[r] && r !== 'plan3d', `${id} → ${r}`);
  assert.deepEqual(C.SUPPLY_ROOMS.doors, [], 'doors are always 全屋');
  assert.deepEqual(C.SUPPLY_ROOMS.wardrobe, ['master', 'bedroom', 'kids']);
  assert.deepEqual(C.SUPPLY_ROOMS.wallPanel, ['living', 'master', 'bedroom', 'dining', 'family', 'foyer']);
});

await test('migrateCase：照片 caption { zh, en } / detail 补默认值，roomsMade 默认 {}；旧案例、manifest 照旧；可以重复调用', () => {
  const old = C.migrateCase({ id: 'p-old', name: '老案例', photos: ['p-old/a.webp', { src: 'p-old/b.webp', room: 'kitchen' }] });
  for (const im of old.images) {
    assert.deepEqual(im.caption, { zh: '', en: '' });
    assert.equal(im.detail, false);
  }
  assert.deepEqual(old.roomsMade, {});
  assert.deepEqual(C.migrateCase(old), old);
  // 说明可以只给一个字符串（= 中文）；detail 什么都变成 true / false
  const c = C.migrateCase({ id: 'p-cap', images: [{ src: 'a', caption: '岛台收口', detail: 1 }, { src: 'b', caption: { zh: '玄关', en: 'Foyer', x: 1 }, detail: 'yes' }, { src: 'c', caption: 42 }] });
  assert.deepEqual(c.images.map((im) => [im.caption, im.detail]), [
    [{ zh: '岛台收口', en: '' }, true],
    [{ zh: '玄关', en: 'Foyer' }, true],
    [{ zh: '', en: '' }, false],
  ]);
  assert.deepEqual(C.migrateCase(c), c);
  for (const raw of MANIFEST.cases) {
    const m = C.migrateCase(raw);
    assert.deepEqual(C.migrateCase(m), m, `${raw.id} idempotent`);
    for (const im of m.images) {
      assert.ok(typeof im.caption.zh === 'string' && typeof im.caption.en === 'string', `${raw.id}/${im.id} caption`);
      assert.equal(typeof im.detail, 'boolean');
    }
    assert.equal(m.images.filter((im) => im.cover).length, m.images.length ? 1 : 0, `${raw.id} exactly one cover`);
    assert.deepEqual(m.images.map((im) => im.id), raw.images.map((im) => im.id), `${raw.id} staff order kept`);
  }
});

await test('migrateCase：roomsMade 整理 —— 房间只收 ROOMS（不含 plan3d）+ home；firm 只收我们做的；板材 id 样子要对、最多 4 块；note 走 txt()；按房间顺序写', () => {
  const raw = {
    id: 'p-rm',
    roomsMade: {
      home: { firm: ['doors'], boards: [], note: '全屋的门' },
      kitchen: { firm: ['kitchen', 'sofa', 'flooring', 'worktop', 'kitchen', 'nope'], boards: ['sail-t-1', 'XT-TP-91', 'sail-t-1', 'sail-t-2', 'sail-t-3', 'sail-t-4', 'sail-t-5', 7], note: { zh: '岛台', en: 'Island', extra: 1 } },
      plan3d: { firm: ['kitchen'] },
      attic: { firm: ['kitchen'] },
      living: 'tvWall',
      master: {},
      bath: { firm: 'vanity', boards: null, note: null },
    },
  };
  const c = C.migrateCase(raw);
  assert.deepEqual(Object.keys(c.roomsMade), ['kitchen', 'master', 'bath', 'home'], 'ROOMS order, home last; plan3d / unknown rooms / non-objects dropped');
  assert.deepEqual(c.roomsMade.kitchen, { firm: ['kitchen', 'worktop'], boards: ['sail-t-1', 'sail-t-2', 'sail-t-3', 'sail-t-4'], note: { zh: '岛台', en: 'Island' } });
  assert.deepEqual(c.roomsMade.master, { firm: [], boards: [], note: { zh: '', en: '' } }, 'an empty override stays (staff said: nothing here)');
  assert.deepEqual(c.roomsMade.bath, { firm: [], boards: [], note: { zh: '', en: '' } });
  assert.deepEqual(c.roomsMade.home, { firm: ['doors'], boards: [], note: { zh: '全屋的门', en: '' } });
  assert.deepEqual(C.migrateCase(c), c, 'idempotent');
  assert.deepEqual(C.migrateCase(JSON.parse(JSON.stringify(c))), c);
  for (const bad of [null, [], 'x', 3]) assert.deepEqual(C.migrateCase({ id: 'p-b', roomsMade: bad }).roomsMade, {});
  // 存一次（saveCase 也是 migrateCase）不会丢
  assert.deepEqual(C.validateCase({ ...c, status: 'draft', title: { zh: '测试', en: '' } }).ok, true);
});

// ───────────────────────── 3. 照片标签 ─────────────────────────

const img = (id, room, extra = {}) => ({ id, room, kind: room === 'plan3d' ? 'plan3d' : 'photo', w: 1600, h: 1200, src: `x/${id}-1600.webp`, thumb: `x/${id}-480.webp`, alt: { zh: '', en: '' }, ...extra });
const GALLERY = C.migrateCase({
  id: 'p-gal',
  kind: 'project',
  rooms: ['living', 'kitchen', 'master'],
  images: [
    img('01', 'kitchen', { cover: true }),
    img('02', 'living'),
    img('03', 'plan3d'),
    img('04', ''),
    img('05', 'kitchen', { detail: true, caption: { zh: '拉手', en: 'Handle' } }),
    img('06', 'living'),
    img('07', 'master'),
    img('08', '', { detail: true }),
    img('09', 'kitchen'),
  ],
});

await test('galleryTabs：全部 · 房间（ROOMS 顺序，有照片才有）· 细节（有才有）· 整个家（3D）最后；没标房间的只算在「全部」', async () => {
  const tabs = C.galleryTabs(GALLERY);
  assert.deepEqual(tabs.map((x) => [x.id, x.n]), [['all', 9], ['living', 2], ['kitchen', 3], ['master', 1], ['detail', 2], ['plan3d', 1]]);
  assert.deepEqual(tabs.map((x) => x.label), ['全部', '客厅', '厨房', '主卧', '细节', '整个家（3D）']);
  await inEnglish(() => assert.deepEqual(C.galleryTabs(GALLERY).map((x) => x.label), ['All', 'Living', 'Kitchen', 'Master bedroom', 'Details', 'Whole home (3D)']));
  // 没有细节、没有 3D：只有全部 + 房间
  const plain = { ...GALLERY, images: GALLERY.images.filter((im) => !im.detail && im.room !== 'plan3d') };
  assert.deepEqual(C.galleryTabs(plain).map((x) => x.id), ['all', 'living', 'kitchen', 'master']);
  assert.deepEqual(C.galleryTabs({ images: [] }), [{ id: 'all', n: 0, label: '全部' }]);
  assert.deepEqual(C.galleryTabs(null).map((x) => x.id), ['all']);
  // 随网站的案例（种子案例的照片会越来越多：只查不变的规律）
  for (const c of LIVE) {
    const t = C.galleryTabs(c);
    assert.equal(t[0].id, 'all');
    assert.equal(t[0].n, c.images.length);
    const rooms = t.filter((x) => C.ROOM_BY_ID[x.id] && x.id !== 'plan3d');
    assert.deepEqual(rooms.map((x) => x.id), C.ROOMS.map((r) => r.id).filter((id) => rooms.some((x) => x.id === id)), `${c.id} ROOMS order`);
    if (t.some((x) => x.id === 'plan3d')) assert.equal(t[t.length - 1].id, 'plan3d', `${c.id} 3D last`);
    assert.equal(t.some((x) => x.id === 'detail'), c.images.some((im) => im.detail), `${c.id} detail tab iff a detail photo`);
    for (const x of t) {
      assert.ok(x.n >= 1 && x.label, `${c.id} ${x.id}`);
      assert.equal(C.galleryImages(c, x.id).length, x.n, `${c.id} ${x.id} count`);
    }
  }
});

await test('galleryImages：员工排的顺序；房间里有这个房间的细节特写；「细节」= 所有细节；没标房间的只在「全部」；返回原来的图片对象', () => {
  const ids = (tab) => C.galleryImages(GALLERY, tab).map((im) => im.id);
  assert.deepEqual(ids('all'), ['01', '02', '03', '04', '05', '06', '07', '08', '09']);
  assert.deepEqual(ids(), ids('all'));
  assert.deepEqual(ids('kitchen'), ['01', '05', '09']);
  assert.deepEqual(ids('living'), ['02', '06']);
  assert.deepEqual(ids('detail'), ['05', '08']);
  assert.deepEqual(ids('plan3d'), ['03']);
  assert.deepEqual(ids('study'), []);
  assert.equal(C.galleryImages(GALLERY, 'kitchen')[1], GALLERY.images[4], 'same objects (resolved urls keep working)');
  for (const tab of C.galleryTabs(GALLERY)) if (tab.id !== 'all') assert.ok(!ids(tab.id).includes('04'), `untagged photo not in ${tab.id}`);
  assert.notEqual(C.galleryImages(GALLERY, 'all'), GALLERY.images, 'a copy of the list (sorting it never touches the case)');
});

// ───────────────────────── 4. 板材的客人名字 + 每个房间我们做了什么 ─────────────────────────

const P = TEST_ID_PREFIX;
const rec = (id, hex, extra) => ({ id: `${P}${id}`, rev: 1, hex, kind: 'wood', finish: 'matte', near: 'walnut', ...extra });
const TEST_BOARDS = [
  rec('7', '#5E4433', { seq: 7, code: 'XT-TP-91', name: { zh: '测试胡桃', en: 'Test walnut' } }),
  rec('c9131', '#2D453D', { seq: null, code: '9131', kind: 'solid', name: { zh: '测试墨绿', en: 'Test ink green' } }),
  rec('weave', '#B9A98E', { code: 'TS-PK99-1', kind: 'weave', series: '织系列', name: { zh: '测试编织', en: 'Test weave' } }),
  rec('stone', '#9C9890', { code: 'XT-ST-92', kind: 'stone', name: { zh: '测试石纹', en: 'Test stone' } }),
  rec('label', '#A68C73', { code: 'XT993', label: { zh: '测试橡XT993', en: 'Test oak XT993' }, name: { zh: '测试橡', en: 'Test oak' } }),
  rec('noname', '#694330', { code: 'XT-TP-94' }),
  // 只有编号、id 里就有这个编号（导入器的 sail-c<编号>）：显示名 = id，拿掉编号以后只剩 id 的碎片
  rec('cxt995', '#7A5A44', { code: 'XT995' }),
  // 员工把厂家编号当名字填了
  rec('codename', '#6B4F3A', { code: 'XT-TP-96', name: { zh: 'XT-TP-96', en: 'XT-TP-96' } }),
];
const B = Object.fromEntries(TEST_BOARDS.map((r) => [r.id.slice(P.length), r.id]));
const reg = registerBoards(TEST_BOARDS, { src: 'bundled' });
const FACTORY = /XT-TP-9|XT-ST-92|TS-PK99|XT99\d|XT-TP-94/i;

await test('boardGuestName：认得的板 →「7号 · 名字」/ 色号 · 名字 / 系列 · 名字（和详情「还用了」一样）；不认得、关掉、没名字 → \'\'；永远没有厂家编号', async () => {
  assert.deepEqual(reg.skipped, []);
  assert.ok(TEST_BOARDS.every((r) => MAT_BY_ID[r.id]?.board));
  assert.equal(C.boardGuestName(B['7']), '7号 · 测试胡桃');
  assert.equal(C.boardGuestName(B.c9131), '9131 · 测试墨绿', 'a colour number is part of the name');
  assert.equal(C.boardGuestName(B.weave), '织系列 · 测试编织');
  assert.equal(C.boardGuestName(B.stone), '测试石纹');
  assert.equal(C.boardGuestName(B.label), '测试橡', 'a factory code typed into the label is taken out');
  assert.equal(C.boardGuestName(B.noname), '', 'only the id left → nothing to say');
  assert.equal(C.boardGuestName(B.cxt995), '', 'only a code that is also in the id → never a piece of the id (sail-t-c)');
  assert.equal(C.boardGuestName(B.codename), '', 'the name is just the factory code → nothing to say');
  for (const id of [`${P}unknown`, 'sail-404', 'XT-TP-91', '', null, undefined, 7]) assert.equal(C.boardGuestName(id), '', String(id));
  await inEnglish(() => {
    assert.equal(C.boardGuestName(B['7']), 'No. 7 · Test walnut');
    assert.equal(C.boardGuestName(B.weave), 'Woven · Test weave');
    assert.equal(C.boardGuestName(B.label), 'Test oak');
  });
  // 和详情（CaseDetail.jsx alsoBoards）的写法一样
  const m = MAT_BY_ID[B.weave];
  const also = (() => {
    const series = m.board.series && !m.zh.includes(m.board.series) ? m.board.series : '';
    return series ? `${series} · ${m.zh}` : m.zh;
  })();
  assert.equal(C.boardGuestName(B.weave), also);
  await withConfig(CONFIG.boards, { on: false }, () => assert.equal(C.boardGuestName(B['7']), '', 'boards switched off → never shown'));
  for (const r of TEST_BOARDS) assert.ok(!FACTORY.test(C.boardGuestName(r.id)), r.id);
});

await test('boardGuestNames：中英文各一个（同样的规则），不管界面现在是哪一种语言；boardGuestName = 现在这个语言的那一个；永远没有厂家编号、没有板材 id', async () => {
  const want = {
    7: { zh: '7号 · 测试胡桃', en: 'No. 7 · Test walnut' },
    c9131: { zh: '9131 · 测试墨绿', en: '9131 · Test ink green' },
    weave: { zh: '织系列 · 测试编织', en: 'Woven · Test weave' },
    stone: { zh: '测试石纹', en: 'Test stone' },
    label: { zh: '测试橡', en: 'Test oak' },
    noname: { zh: '', en: '' },
    cxt995: { zh: '', en: '' },
    codename: { zh: '', en: '' },
  };
  const all = () => Object.fromEntries(TEST_BOARDS.map((r) => [r.id.slice(P.length), C.boardGuestNames(r.id)]));
  assert.deepEqual(all(), want);
  await inEnglish(() => {
    assert.deepEqual(all(), want, 'the same while the page is in English');
    for (const r of TEST_BOARDS) assert.equal(C.boardGuestName(r.id), C.boardGuestNames(r.id).en);
  });
  for (const r of TEST_BOARDS) {
    assert.equal(C.boardGuestName(r.id), C.boardGuestNames(r.id).zh);
    for (const s of Object.values(C.boardGuestNames(r.id))) assert.ok(!FACTORY.test(s) && !/sail-/i.test(s), `${r.id}: ${s}`);
  }
  for (const id of [`${P}unknown`, 'XT-TP-91', null]) assert.deepEqual(C.boardGuestNames(id), { zh: '', en: '' }, String(id));
  assert.deepEqual(C.boardGuestNames(B.weave, { series: false }), { zh: '测试编织', en: 'Test weave' }, 'series: false → no series prefix');
  assert.deepEqual(C.boardGuestNames(B.label, { series: false }), want.label);
  await withConfig(CONFIG.boards, { on: false }, () => assert.deepEqual(C.boardGuestNames(B['7']), { zh: '', en: '' }));
});

/** 一个编出来的真实项目（没有照片文件；名字都是「测试」） */
const mkCase = (over = {}) =>
  C.migrateCase({
    id: 'p-made',
    kind: 'project',
    status: 'live',
    consent: true,
    title: { zh: '测试的家', en: 'Test home' },
    property: { type: 'condo', sizeSqft: 1200, bedrooms: 3, bathrooms: 2 },
    rooms: ['living', 'kitchen', 'master', 'foyer', 'bath'],
    style: { dreamers: ['WMNH'] },
    supplies: { firm: ['kitchen', 'wardrobe', 'tvWall', 'shoeCabinet', 'doors', 'wallPanel', 'vanity', 'sofa', 'diningSet'], context: ['flooring', 'lighting'] },
    boards: { cabinetry: B['7'], feature: B.stone },
    images: [img('01', 'living', { cover: true }), img('02', 'kitchen', { detail: true }), img('03', 'kitchen'), img('04', 'master')],
    ...over,
  });
const rowsOf = (list) => Object.fromEntries(list.map((r) => [r.room, r]));
const short = (r) => ({ firm: r.firm.map((f) => f.id), boards: r.boards.map((b) => b.id), derived: r.derived });

await test('caseRoomsMade 推算：每样我们做的放进第一个做了的候选房间；台面跟着厨房 / 浴室柜；柜体板跟着柜子；墙板跟着墙板 / 主题墙；门 = 全屋；家具、现场搭配不算；ROOMS 顺序 + 全屋最后', () => {
  const c = mkCase();
  const list = C.caseRoomsMade(c);
  assert.deepEqual(list.map((r) => r.room), ['living', 'kitchen', 'master', 'bath', 'foyer', 'home'], 'ROOMS order (浴室 before 玄关), 全屋 last');
  const R = rowsOf(list);
  assert.deepEqual(short(R.living), { firm: ['tvWall', 'wallPanel'], boards: [B['7'], B.stone], derived: true }, 'TV wall is a cabinet → cabinetry board; wall panel → feature board');
  assert.deepEqual(short(R.kitchen), { firm: ['kitchen', 'worktop'], boards: [B['7']], derived: true }, 'worktop next to the kitchen cabinets (offersWorktop)');
  assert.deepEqual(short(R.master), { firm: ['wardrobe'], boards: [B['7']], derived: true });
  assert.deepEqual(short(R.foyer), { firm: ['shoeCabinet'], boards: [B['7']], derived: true });
  assert.deepEqual(short(R.bath), { firm: ['vanity', 'worktop'], boards: [B['7']], derived: true }, 'worktop next to the vanity too');
  assert.deepEqual(short(R.home), { firm: ['doors'], boards: [], derived: true }, 'doors are always 全屋; doors are not a cabinet');
  for (const r of list) {
    assert.ok(r.firm.every((f) => C.SUPPLY_OFFER.some((s) => s.id === f.id)), 'only what we make (never furniture / context)');
    assert.equal(r.note, '');
  }
  // 标签、照片、封面、点了去哪个标签
  assert.deepEqual(R.kitchen.firm.map((f) => f.label), ['厨房橱柜', '台面']);
  assert.equal(R.home.label, '全屋');
  assert.deepEqual(R.kitchen.boards[0], { id: B['7'], name: '7号 · 测试胡桃', color: '#5E4433' });
  assert.deepEqual([R.kitchen.images, R.kitchen.cover.id, R.kitchen.tab], [2, '03', 'kitchen'], 'room cover = first photo that is not a close-up');
  assert.deepEqual([R.living.images, R.living.cover.id, R.living.tab], [1, '01', 'living']);
  assert.deepEqual([R.foyer.images, R.foyer.cover, R.foyer.tab], [0, null, 'all'], 'no photo of the foyer → the gallery stays on 全部');
  assert.deepEqual([R.home.images, R.home.cover.id, R.home.tab], [4, '01', 'all'], '全屋 = the case cover');
  assert.ok(!('made' in R.kitchen) && !('known' in R.kitchen.boards[0]), 'guest rows carry no staff fields');
  // 只有房子的候选房间没做 → 全屋；候选里第一个做了的赢（主卧没做 → 卧室）
  const c2 = mkCase({ rooms: ['living', 'bedroom', 'kids'], supplies: { firm: ['wardrobe', 'bedStorage', 'shoeCabinet', 'kitchen', 'toyStorage'], context: [] }, boards: {} });
  assert.deepEqual(C.caseRoomsMade(c2).map((r) => [r.room, r.firm.map((f) => f.id)]), [
    ['bedroom', ['wardrobe', 'bedStorage']],
    ['kids', ['toyStorage']],
    ['home', ['kitchen', 'shoeCabinet', 'worktop']],
  ]);
});

await test('caseRoomsMade 台面：只有 offersWorktop 才有（home.js 同一条）；只写了台面 → SUPPLY_ROOMS.worktop（厨房 → 浴室 → 全屋）', () => {
  const firmOf = (firm, rooms) => C.caseRoomsMade(mkCase({ rooms, supplies: { firm, context: [] }, boards: {} })).map((r) => [r.room, r.firm.map((f) => f.id)]);
  // cases.js 自己留了一份这条规则（不 import home.js）：每一样、每两样都和 home.js 对一遍
  const ids = [...C.SUPPLY.firm, ...C.SUPPLY.context].map((s) => s.id).concat(['door', 'nope']);
  const lists = [[], ...ids.map((id) => [id]), ...ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b]))];
  for (const firm of lists) {
    const has = firmOf(firm, ['kitchen', 'bath', 'master']).some(([, f]) => f.includes('worktop'));
    assert.equal(has, offersWorktop(firm), JSON.stringify(firm));
  }
  assert.deepEqual(firmOf(['worktop'], ['bath', 'kitchen']), [['kitchen', ['worktop']]], 'only a worktop: kitchen first');
  assert.deepEqual(firmOf(['worktop'], ['bath', 'living']), [['bath', ['worktop']]]);
  assert.deepEqual(firmOf(['worktop'], ['living']), [['home', ['worktop']]]);
  assert.deepEqual(firmOf(['vanity', 'worktop'], ['kitchen', 'bath']), [['bath', ['vanity', 'worktop']]], 'with a vanity it sits by the vanity, not in the kitchen');
  assert.deepEqual(firmOf(['kitchen'], ['living']), [['home', ['kitchen', 'worktop']]], 'kitchen not among the rooms → both 全屋');
});

await test('caseRoomsMade 板材：柜体板只跟着柜子（墙板 / 主题墙 / 门 / 台面不算）；主题墙板跟着墙板 / 主题墙，没有 → 全屋；柜子一个都没有 → 柜体板也去全屋', () => {
  const rows = (over) => C.caseRoomsMade(mkCase(over)).map((r) => [r.room, r.firm.map((f) => f.id), r.boards.map((b) => b.id)]);
  assert.deepEqual(rows({ rooms: ['living', 'master'], supplies: { firm: ['wallPanel', 'featureWall', 'wardrobe'], context: [] } }), [
    ['living', ['wallPanel', 'featureWall'], [B.stone]],
    ['master', ['wardrobe'], [B['7']]],
  ]);
  assert.deepEqual(rows({ rooms: ['kitchen'], supplies: { firm: ['kitchen'], context: [] } }), [
    ['kitchen', ['kitchen', 'worktop'], [B['7']]],
    ['home', [], [B.stone]],
  ], 'no wall panel / feature wall → the feature board is 全屋');
  assert.deepEqual(rows({ rooms: ['living'], supplies: { firm: ['doors', 'wallPanel'], context: [] }, boards: { cabinetry: B['7'] } }), [
    ['living', ['wallPanel'], []],
    ['home', ['doors'], [B['7']]],
  ], 'no cabinet anywhere → the cabinetry board is 全屋');
  assert.deepEqual(rows({ rooms: ['living'], supplies: { firm: [], context: [] }, boards: {} }), [], 'nothing we make, no board → nothing to say');
});

await test('caseRoomsMade 员工写的（roomsMade[room]）：那个房间用员工的、不推算；别的房间照样推算；空的员工行客人看不到；板只列认得的', async () => {
  const c = mkCase({
    roomsMade: {
      kitchen: { firm: ['worktop', 'kitchen', 'displayCabinet'], boards: [B.c9131, `${P}unknown`], note: { zh: '岛台用了测试墨绿', en: 'Island in test ink green' } },
      master: { firm: [], boards: [], note: { zh: '', en: '' } },
      study: { firm: ['bookwall'], boards: [B.weave], note: '' },
      home: { firm: [], boards: [], note: { zh: '门都是隐形门', en: '' } },
    },
  });
  const list = C.caseRoomsMade(c);
  assert.deepEqual(list.map((r) => r.room), ['living', 'kitchen', 'study', 'bath', 'foyer', 'home'], 'master: an empty override is left out; study: an override for a room not in case.rooms still shows');
  const R = rowsOf(list);
  assert.deepEqual(short(R.kitchen), { firm: ['kitchen', 'displayCabinet', 'worktop'], boards: [B.c9131], derived: false }, 'staff data in SUPPLY order; unknown board hidden from guests');
  assert.equal(R.kitchen.note, '岛台用了测试墨绿');
  assert.deepEqual(short(R.study), { firm: ['bookwall'], boards: [B.weave], derived: false });
  assert.deepEqual(R.study.boards.map((b) => b.name), ['织系列 · 测试编织']);
  assert.deepEqual(short(R.home), { firm: [], boards: [], derived: false }, '全屋 override: no doors any more, only the note');
  assert.equal(R.home.note, '门都是隐形门');
  assert.equal(R.living.derived, true);
  assert.deepEqual(short(R.living), { firm: ['tvWall', 'wallPanel'], boards: [B['7'], B.stone], derived: true }, 'other rooms still derived');
  await inEnglish(() => {
    const E = rowsOf(C.caseRoomsMade(c));
    assert.equal(E.kitchen.note, 'Island in test ink green');
    assert.equal(E.home.note, '门都是隐形门', 'no English note → the Chinese one (better than nothing)');
    assert.equal(E.home.label, 'Whole home');
  });
});

await test('caseRoomsMade { staff: true }：不认得的板也列（名字 = idLabel、没有颜色、known false）；case.rooms 里空的房间、全屋、空的员工行都列；made = 写 roomsMade 用的完整资料', () => {
  const c = mkCase({
    rooms: ['living', 'kitchen', 'dining'],
    supplies: { firm: ['kitchen'], context: [] },
    boards: { cabinetry: 'sail-c7777', feature: B.stone }, // sail-c7777：这台设备不认得的板（登记表一开头就清空了）
    roomsMade: { master: { firm: [], boards: [], note: '' }, living: { firm: ['tvWall'], boards: ['sail-t-5', B['7']], note: { zh: '电视墙', en: 'TV wall' } } },
  });
  const guest = C.caseRoomsMade(c);
  assert.deepEqual(guest.map((r) => [r.room, r.boards.map((b) => b.id)]), [
    ['living', [B['7']]],
    ['kitchen', []],
    ['home', [B.stone]],
  ], 'guests: unknown boards (sail-c7777, sail-t-5) never listed; empty rooms left out');
  const staff = C.caseRoomsMade(c, { staff: true });
  assert.deepEqual(staff.map((r) => r.room), ['living', 'dining', 'kitchen', 'master', 'home']);
  const S = rowsOf(staff);
  assert.deepEqual(S.kitchen.boards, [{ id: 'sail-c7777', name: '7777', color: null, known: false }], 'staff see the id label for a board this device does not know');
  assert.deepEqual(S.living.boards.map((b) => [b.id, b.name, b.known]), [['sail-t-5', 'sail-t-5', false], [B['7'], '7号 · 测试胡桃', true]]);
  assert.deepEqual(S.living.made, { firm: ['tvWall'], boards: ['sail-t-5', B['7']], note: { zh: '电视墙', en: 'TV wall' } });
  assert.deepEqual(S.kitchen.made, { firm: ['kitchen', 'worktop'], boards: ['sail-c7777'], note: { zh: '', en: '' } }, 'derived values = what a first edit writes');
  assert.deepEqual([S.dining.firm, S.dining.boards, S.dining.derived], [[], [], true], 'an empty room of case.rooms');
  assert.deepEqual([S.master.firm, S.master.derived], [[], false], 'an empty override (so staff can press 恢复自动)');
  assert.deepEqual(S.home.made, { firm: [], boards: [B.stone], note: { zh: '', en: '' } });
  assert.deepEqual(C.caseRoomsMade(mkCase({ rooms: [], supplies: { firm: [], context: [] }, boards: {} }), { staff: true }).map((r) => r.room), ['home'], 'staff can always fill in 全屋');
});

await test('caseRoomsMade：客人看的东西里永远没有厂家编号（中英文）；关掉板材 → 客人一块板都看不到；随网站的案例都说得出东西', async () => {
  const c = mkCase({
    boards: { cabinetry: B.label, feature: B.noname },
    boardsAlso: [B.weave],
    roomsMade: { study: { firm: ['study'], boards: [B['7'], B.label, B.noname, B.weave], note: '' } },
  });
  for (const lang of ['zh', 'en']) {
    setLang(lang);
    try {
      const text = JSON.stringify(C.caseRoomsMade(c).map(({ cover, ...r }) => r));
      assert.ok(!FACTORY.test(text), `${lang}: ${text}`);
      assert.ok(!text.includes(B.noname), 'a board with no guest name is not listed');
      for (const r of C.caseRoomsMade(c)) for (const b of r.boards) assert.ok(b.name && b.name === C.boardGuestName(b.id), b.id);
    } finally {
      setLang('zh');
    }
  }
  await withConfig(CONFIG.boards, { on: false }, () => {
    assert.ok(C.caseRoomsMade(c).every((r) => !r.boards.length), 'boards off');
  });
  for (const s of LIVE) {
    const list = C.caseRoomsMade(s);
    assert.ok(list.length >= 1, `${s.id} says something`);
    const order = [...C.ROOMS.map((r) => r.id), C.ROOM_HOME];
    assert.deepEqual(list.map((r) => r.room), order.filter((id) => list.some((r) => r.room === id)), `${s.id} order`);
    for (const r of list) {
      assert.ok(r.room === C.ROOM_HOME || s.rooms.includes(r.room), `${s.id} ${r.room} is a room of the case`);
      assert.ok(r.firm.length || r.boards.length || r.note, `${s.id} ${r.room} not empty`);
      assert.ok(r.label);
      if (r.cover) assert.ok(s.images.includes(r.cover), 'cover is one of the case images');
      assert.ok(r.tab === 'all' || C.galleryTabs(s).some((x) => x.id === r.tab), `${s.id} ${r.room} tab ${r.tab}`);
    }
  }
});

// ───────────────────────── 5. 房子档案 ─────────────────────────

await test('caseFacts：房子 / 建筑面积 / 几房几卫 / 楼层（有地、两层以上）/ 我们做了 / 风格 / 地区；永远没有价钱、预算、时间、员工的资料', async () => {
  const facts = (c) => C.caseFacts(c).map((f) => [f.k, f.label, f.value]);
  assert.deepEqual(facts(zen), [
    ['type', '房子', '公寓'],
    ['size', '建筑面积', '约 1,100 sq ft'],
    ['beds', '几房几卫', '3 房 2 卫'],
    ['scope', '我们做了', '整个家'],
    ['style', '风格', DREAMER_BY_CODE.WMNH.zh],
  ], 'a seed: its place line is just the property line again → no 地区');
  const bpBeds = () => homeSummary({ type: 'condo', bedrooms: 3, bathrooms: 2 }).find((x) => x.id === 'rooms');
  assert.deepEqual(C.caseFacts(zen).find((f) => f.k === 'beds').label, bpBeds().label, 'the blueprint facts row uses the same label');
  const semid = byId('seed-softluxe-semid');
  assert.deepEqual(C.caseFacts(semid).find((f) => f.k === 'storeys').value, '2 层楼');
  assert.ok(!C.caseFacts({ ...zen, property: { ...zen.property, storeys: 3 } }).some((f) => f.k === 'storeys'), 'a condo never shows storeys');
  const real = C.migrateCase({
    id: 'p-facts', kind: 'project', scope: 'rooms', rooms: ['kitchen', 'living'], place: { zh: '测试花园 · 雪兰莪', en: 'Test Gardens, Selangor' },
    property: { type: 'terrace', sizeSqft: 1650.4, bedrooms: 4, storeys: 2 }, style: { dreamers: ['WLND'] },
    budget: 'RM 60–100k', price: 88000, timeline: '3m', staffNote: '客户很急', designerNotes: '只给设计师', notes: 'staff', phone: '0123',
  });
  assert.deepEqual(facts(real), [
    ['type', '房子', '排屋'],
    ['size', '建筑面积', '约 1,650 sq ft'],
    ['beds', '几房几卫', '4 房'],
    ['storeys', '楼层', '2 层楼'],
    ['scope', '我们做了', '2 个房间'],
    ['style', '风格', DREAMER_BY_CODE.WLND.zh],
    ['area', '地区', '测试花园 · 雪兰莪'],
  ]);
  const raw = { ...real, budget: 'RM 60–100k', price: 88000, timeline: '3m', staffNote: '客户很急', wishNotes: { storage: { zh: '只是员工写的', en: '' } } };
  const text = JSON.stringify(C.caseFacts(raw));
  for (const bad of ['RM', '88000', '3m', '客户很急', '只是员工写的', 'budget', 'price', 'timeline']) assert.ok(!text.includes(bad), bad);
  assert.equal(C.caseFacts({ ...real, rooms: ['kitchen'] }).find((f) => f.k === 'scope').value, '厨房', 'one room → its name');
  assert.ok(!C.caseFacts({ ...real, rooms: [] }).some((f) => f.k === 'scope'));
  assert.ok(!C.caseFacts({ ...real, property: { type: 'other' } }).some((f) => ['type', 'size', 'beds'].includes(f.k)), 'unknown property → no empty facts');
  assert.ok(!C.caseFacts({ ...real, place: { zh: '排屋 · 4 房 · 约 1,650 sq ft', en: '' } }).some((f) => f.k === 'area'));
  assert.deepEqual(C.caseFacts(null), []);
  await inEnglish(() => {
    const en = C.caseFacts(real);
    assert.equal(en[2].label, bpBeds().label);
    assert.deepEqual(en.map((f) => f.label), ['Property', 'Built-up area', 'Bed / bath', 'Floor', 'We made', 'Style', 'Area'], 'bed / bath: the same label as the blueprint (homeSummary 几房几卫)');
    assert.deepEqual(en.map((f) => f.value), ['Terrace', '~1,650 sq ft', '4 bed', '2 storeys', '2 rooms', DREAMER_BY_CODE.WLND.en, 'Test Gardens, Selangor']);
    for (const c of LIVE) for (const f of C.caseFacts(c)) assert.ok(!HAN.test(f.label + f.value), `${c.id} ${f.k}: ${f.label} ${f.value}`);
  });
});

// ───────────────────────── 6. 相似的家 ─────────────────────────

/** 编出来的家：只有配对要用的字段 */
const home = (id, over = {}) =>
  C.migrateCase({
    id,
    kind: 'concept',
    status: 'live',
    order: 500,
    title: { zh: '测试', en: 'Test' },
    property: { type: 'condo', sizeSqft: 1000, bedrooms: 3 },
    rooms: ['living', 'kitchen', 'master'],
    style: { dreamers: ['WMNH'], axes: { temp: 80, density: 30, texture: 80, storage: 70 } },
    materials: { floor: 'white-oak', walls: 'warm-white', cabinetry: 'white-oak' },
    ...over,
  });

await test('similarCases：分数 = 0.55 轴 + 0.15 同主牌 + 0.1 同一张牌 + 0.1 同一类房子（+0.05 同类型）+ 0.1 房间 Jaccard + 0.02 真实项目；同分按 order', async () => {
  const me = home('me');
  const twin = home('twin');
  const opposite = home('opposite', { style: { dreamers: ['CLRD'], axes: { temp: 20, density: 90, texture: 20, storage: 10 } }, property: { type: 'bungalow' }, rooms: ['study'] });
  const sameCardLanded = home('landed', { property: { type: 'terrace' }, rooms: ['living', 'kitchen'] });
  const near = home('near', { style: { dreamers: ['CLRD', 'WMNH'], axes: { temp: 80, density: 30, texture: 80, storage: 70 } } });
  const r = C.similarCases(me, [me, opposite, near, sameCardLanded, twin]);
  assert.deepEqual(r.map((m) => m.case.id), ['twin', 'near', 'landed', 'opposite']);
  const scoreOf = (id) => r.find((m) => m.case.id === id).score;
  approx(scoreOf('twin'), 0.55 + 0.15 + 0.1 + 0.1 + 0.05 + 0.1, 'twin = everything');
  approx(scoreOf('near'), 0.55 + 0.1 + 0.1 + 0.05 + 0.1, 'shares a card, not the main one');
  approx(scoreOf('landed'), 0.55 + 0.15 + 0.1 + (0.1 * 2) / 3, 'other class (no class / type bonus), 2 of 3 rooms');
  approx(scoreOf('opposite'), 0.55 * 0.4, 'axes 60 apart on every axis → 0.4 × 0.55; nothing else shared');
  // 真实项目 + 0.02；同分按 order（再按 id）—— 3D 方案和真实项目放在一起比分：用以前的门槛（8 个真实项目才藏 3D 方案）
  const real = home('real', { kind: 'project', consent: true });
  await withConfig(CONFIG.cases, { hideConceptsAt: 8 }, () => {
    assert.deepEqual(C.similarCases(me, [twin, real]).map((m) => [m.case.id, m.score]), [['real', 1.07], ['twin', 1.05]]);
  });
  const a = home('a', { order: 30 });
  const b = home('b', { order: 10 });
  const c = home('c', { order: 20 });
  assert.deepEqual(C.similarCases(me, [a, b, c]).map((m) => m.case.id), ['b', 'c', 'a']);
  // n
  assert.equal(C.similarCases(me, [a, b, c, twin, near], { n: 2 }).length, 2);
  assert.equal(C.similarCases(me, LIVE).length, 4, 'default n = 4');
  assert.deepEqual(C.similarCases(null, LIVE), []);
  // 随网站的种子：分数从高到低、主牌一样的家永远排在轴差不多但牌不一样的前面
  for (const s of LIVE) {
    const list = C.similarCases(s, LIVE, { n: 20 });
    assert.equal(list.length, LIVE.length - 1);
    for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].score >= list[i].score, `${s.id} sorted`);
  }
});

await test('similarCases：不含自己、exclude、草稿、隐藏、展厅、没同意的真实项目、客人一定要避开的家；hideConceptsAt 和 matchCases 一样', async () => {
  const me = home('me');
  const ok = home('ok');
  const others = [
    home('draft', { status: 'draft' }),
    home('hidden', { status: 'hidden' }),
    home('show', { kind: 'showroom' }),
    home('noconsent', { kind: 'project', consent: false }),
    home('marble', { materials: { floor: 'carrara', walls: 'warm-white', cabinetry: 'white-oak' } }),
    home('picked'),
  ];
  const ids = (opts) => C.similarCases(me, [me, ok, ...others], { n: 10, ...opts }).map((m) => m.case.id);
  // 分数全一样（同一个样子）→ order 一样 → 按 id
  assert.deepEqual(ids({}), ['marble', 'ok', 'picked'], 'never itself, drafts, hidden, showroom or a project without consent');
  assert.deepEqual(ids({ exclude: ['picked'] }), ['marble', 'ok']);
  assert.deepEqual(ids({ exclude: [{ id: 'picked' }, 'ok'] }), ['marble'], 'exclude takes ids or cases');
  assert.ok(C.caseNoGo(others[4]).has('marble'));
  assert.deepEqual(ids({ profile: { avoid: ['marble'] } }), ['ok', 'picked'], 'hard no-go for this guest');
  assert.deepEqual(ids({ profile: { avoid: ['glossy'] }, exclude: ['picked'] }), ['ok'], 'polished marble floor = glossy too');
  assert.deepEqual(ids({ profile: { avoid: ['pink'] } }), ['marble', 'ok', 'picked'], 'a no-go nobody here has → nothing dropped');
  assert.deepEqual(ids({ allowDrafts: true }).sort(), ['draft', 'marble', 'noconsent', 'ok', 'picked'], 'staff preview: drafts too, never hidden / showroom');
  await withConfig(CONFIG.cases, { hideConceptsAt: 2 }, () => {
    const p1 = home('p1', { kind: 'project', consent: true });
    const p2 = home('p2', { kind: 'project', consent: true });
    assert.deepEqual(C.similarCases(me, [ok, p1]).map((m) => m.case.id).sort(), ['ok', 'p1']);
    assert.deepEqual(C.similarCases(me, [ok, p1, p2]).map((m) => m.case.id).sort(), ['p1', 'p2'], '2 live projects → concepts drop out');
  });
});

// ───────────────────────── 7. 看全部 ─────────────────────────

await test('browseCases：没筛选 = matchCases 的排法（limit = 全部，理由一起给）；雷区一定要避开的家不放回来、留在 excluded', () => {
  for (const g of Object.values(GUESTS)) {
    const p = realProfile(g);
    const b = C.browseCases(p, LIVE);
    const out = new Set(b.excluded.map((e) => e.id));
    // 雷区：和 caseNoGo 一样（标签 = 这个家一定要避开的 ∩ 客人的雷区）
    for (const c of LIVE) assert.equal(out.has(c.id), [...C.caseNoGo(c)].some((t) => p.avoid.includes(t)), `${g.name} ${c.id}`);
    for (const e of b.excluded) assert.deepEqual([...e.tags].sort(), [...C.caseNoGo(byId(e.id))].filter((t) => p.avoid.includes(t)).sort(), e.id);
    assert.deepEqual(b.excluded.map((e) => Object.keys(e).sort()), b.excluded.map(() => ['id', 'tags']));
    assert.equal(b.total, LIVE.length - out.size);
    assert.equal(b.list.length, b.total);
    // 排法：和 matchCases 在同一批（去掉雷区的家）上 limit = 全部一模一样
    const same = C.matchCases(p, LIVE.filter((c) => !out.has(c.id)), { limit: 100 });
    assert.deepEqual(b.list.map((m) => m.case.id), same.picks.map((m) => m.case.id), g.name);
    assert.deepEqual(b.list.map((m) => m.reasons), same.picks.map((m) => m.reasons), `${g.name} reasons`);
    assert.deepEqual(b.list.map((m) => m.score), same.picks.map((m) => m.score));
    for (const m of b.list) assert.ok(m.reasons.length >= 1 && m.reasons.length <= 3);
    // 第一名和 matchCases 的第一屏一样
    assert.equal(b.list[0].case.id, C.matchCases(p, LIVE).picks[0].case.id);
  }
  // 雷区挡掉一大堆：matchCases 会放回来凑一屏，看全部不会
  const heavy = { ...realProfile(GUESTS.peggy), avoid: ['marble', 'glossy', 'grey', 'black', 'beige', 'darkwood'] };
  const b = C.browseCases(heavy, LIVE);
  assert.equal(b.excluded.length, LIVE.filter((c) => [...C.caseNoGo(c)].some((t) => heavy.avoid.includes(t))).length);
  assert.ok(b.list.every((m) => ![...C.caseNoGo(m.case)].some((t) => heavy.avoid.includes(t))));
  assert.ok(b.excluded.length > C.matchCases(heavy, LIVE).excluded.length, 'matchCases readmits to fill a screen (sanity)…');
  assert.ok(b.list.every((m) => !m.reasons.some((r) => r.kind === 'swap') || m.swap), '…browse never does');
  // 只是缎面光泽 / 台面光泽：留在列表里，带「我会帮你换掉」
  const gl = C.browseCases({ ...realProfile(GUESTS.peggy), avoid: ['glossy'] }, LIVE);
  assert.deepEqual(gl.excluded, []);
  assert.ok(gl.list.find((m) => m.case.id === 'seed-nordic-studio').reasons.some((r) => r.kind === 'swap'));
});

await test('browseCases 筛选：组和组之间「而且」、组里「或者」；房间 = 做了的或有照片的；风格 = 主牌；数量（facets）不管筛选；种类', async () => {
  // 3D 方案和两个真实项目一起筛：用以前的门槛（8 个真实项目才藏 3D 方案）
  await withConfig(CONFIG.cases, { hideConceptsAt: 8 }, () => browseFilterChecks());
});
function browseFilterChecks() {
  const p = realProfile(GUESTS.ken);
  const cases = [
    ...LIVE,
    home('p-study-photo', { kind: 'project', consent: true, rooms: ['living'], images: [img('01', 'living', { cover: true }), img('02', 'study')] }),
    home('p-terrace', { kind: 'project', consent: true, property: { type: 'terrace' }, style: { dreamers: ['CLRD'], axes: {} } }),
  ];
  const all = C.browseCases(p, cases);
  const ok = cases.filter((c) => !all.excluded.some((e) => e.id === c.id));
  const ids = (f) => C.browseCases(p, cases, f).list.map((m) => m.case.id).sort();
  const want = (fn) => ok.filter(fn).map((c) => c.id).sort();
  const roomsOf = (c) => new Set([...c.rooms, ...c.images.map((im) => im.room)]);
  assert.deepEqual(ids({}), want(() => true));
  assert.deepEqual(ids({ kind: 'all' }), want(() => true));
  assert.deepEqual(ids({ kind: 'project' }), ['p-study-photo', 'p-terrace']);
  assert.deepEqual(ids({ kind: 'concept' }), want((c) => c.kind === 'concept'));
  assert.deepEqual(ids({ type: ['condo'] }), want((c) => c.property.type === 'condo'));
  assert.deepEqual(ids({ type: ['condo', 'terrace'] }), want((c) => ['condo', 'terrace'].includes(c.property.type)), 'OR inside a group');
  assert.deepEqual(ids({ room: ['study'] }), want((c) => roomsOf(c).has('study')));
  assert.ok(ids({ room: ['study'] }).includes('p-study-photo'), 'a photo of the room counts');
  assert.deepEqual(ids({ room: ['study', 'kids'] }), want((c) => roomsOf(c).has('study') || roomsOf(c).has('kids')));
  assert.deepEqual(ids({ type: ['condo'], room: ['study'] }), want((c) => c.property.type === 'condo' && roomsOf(c).has('study')), 'AND across groups');
  assert.deepEqual(ids({ style: ['CLRD'] }), want((c) => c.style.dreamers[0] === 'CLRD'));
  assert.deepEqual(ids({ kind: 'project', type: ['terrace'], style: ['CLRD'] }), ['p-terrace']);
  assert.deepEqual(ids({ kind: 'project', type: ['condo'], style: ['CLRD'] }), []);
  assert.deepEqual(ids({ type: 'condo' }), ids({ type: ['condo'] }), 'a single value works too');
  // 筛选以后照样是 matchCases 的排法（在筛出来的那一批上）
  const f = C.browseCases(p, cases, { type: ['condo', 'bungalow'] });
  assert.deepEqual(f.list.map((m) => m.case.id), C.matchCases(p, ok.filter((c) => ['condo', 'bungalow'].includes(c.property.type)), { limit: 100 }).picks.map((m) => m.case.id));
  // 数量：没筛选、可以看、没被雷区挡掉的那一批（筛选不改它）
  for (const filt of [{}, { kind: 'project' }, { room: ['study'], style: ['CLRD'] }]) {
    const b = C.browseCases(p, cases, filt);
    assert.deepEqual(b.facets, all.facets, JSON.stringify(filt));
    assert.equal(b.total, ok.length);
    assert.deepEqual(b.excluded, all.excluded);
  }
  const count = (fn) => ok.filter(fn).length;
  assert.deepEqual(all.facets.kind.map((x) => [x.id, x.n]), [['project', 2], ['concept', count((c) => c.kind === 'concept')]]);
  assert.deepEqual(all.facets.type.map((x) => [x.id, x.n]), C.PROPERTY_TYPES.map((t) => [t.id, count((c) => c.property.type === t.id)]).filter(([, k]) => k));
  assert.deepEqual(all.facets.room.map((x) => [x.id, x.n]), C.ROOMS.filter((r) => r.id !== 'plan3d').map((r) => [r.id, count((c) => roomsOf(c).has(r.id))]).filter(([, k]) => k));
  assert.deepEqual(all.facets.style.map((x) => [x.code, x.n]), DREAMERS.map((d) => [d.code, count((c) => c.style.dreamers[0] === d.code)]).filter(([, k]) => k));
  for (const g of Object.values(all.facets)) for (const x of g) assert.ok(x.n >= 1 && x.label, JSON.stringify(x));
  assert.ok(!all.facets.room.some((x) => x.id === 'plan3d'), 'the 3D overview is not a room');
  assert.deepEqual(all.facets.series, [], 'no case here has a series → no series chips');
}

await test('browseCases：草稿 / 隐藏 / 展厅 / 没同意的永远不出现（员工预览 allowDrafts 才有草稿）；hideConceptsAt / keepConcepts；空的、没有档案也不出错', async () => {
  const extra = [home('d', { kind: 'project', status: 'draft', consent: true }), home('h', { kind: 'project', status: 'hidden', consent: true }), home('s', { kind: 'showroom' }), home('n', { kind: 'project', consent: false })];
  const b = C.browseCases(null, [...LIVE, ...extra]);
  assert.deepEqual(b.list.map((m) => m.case.id).sort(), LIVE.map((c) => c.id).sort());
  assert.equal(b.total, LIVE.length);
  const staff = C.browseCases(null, [...LIVE, ...extra], {}, { allowDrafts: true });
  assert.deepEqual(staff.list.map((m) => m.case.id).filter((id) => id.length === 1).sort(), ['d', 'n']);
  await withConfig(CONFIG.cases, { hideConceptsAt: 2 }, () => {
    const real = [home('p1', { kind: 'project', consent: true }), home('p2', { kind: 'project', consent: true })];
    const r = C.browseCases(null, [...LIVE, ...real]);
    assert.deepEqual(r.list.map((m) => m.case.id).sort(), ['p1', 'p2']);
    assert.deepEqual(r.facets.kind.map((x) => x.id), ['project']);
    assert.equal(C.browseCases(null, [...LIVE, ...real], {}, { keepConcepts: true }).total, LIVE.length + 2);
  });
  assert.deepEqual(C.browseCases(null, []), { list: [], excluded: [], facets: { kind: [], type: [], room: [], style: [], series: [] }, total: 0 });
  assert.deepEqual(C.browseCases({}, LIVE, { type: ['other'] }).list, []);
  await inEnglish(() => {
    const e = C.browseCases(realProfile(GUESTS.aisha), LIVE);
    for (const g of Object.values(e.facets)) for (const x of g) assert.ok(!HAN.test(x.label), x.label);
    assert.deepEqual(e.facets.kind.map((x) => x.label), ['3D schemes']);
    for (const m of e.list) for (const r of m.reasons) assert.ok(!HAN.test(C.reasonText(r)), C.reasonText(r));
  });
});

await test('为什么适合你（matchCases / 看全部 / 相似的家都一样）：案例原板说客人看的名字（boardGuestNames）；只有编号的板 → 改说客人选的材质；中英文都没有厂家编号、没有板材 id', async () => {
  // 客人在地板那题选了「深深的胡桃木」（walnut）；每块测试板的近似材质都是 walnut
  const prof = { code: 'WMNH', axes: { temp: 80, density: 30, texture: 80, storage: 70 }, answers: { pairs: { floor: { pick: 'f', ms: 2000 } } } };
  const opts = { picksMats: new Set(['walnut']) };
  const walnut = MAT_BY_ID.walnut;
  const named = { [B['7']]: '7号 · 测试胡桃', [B.c9131]: '9131 · 测试墨绿', [B.label]: '测试橡' };
  const pickReason = (board) => {
    const c = home(`p-why-${board.slice(P.length)}`, { boards: { cabinetry: board } });
    const m = C.matchCases(prof, [c], { limit: 1, ...opts }).picks[0];
    const b = C.browseCases(prof, [c], {}, opts).list[0];
    assert.deepEqual(b.reasons, m.reasons, `${board}: browse-all says the same`);
    return m.reasons.find((r) => r.kind === 'pick');
  };
  for (const board of [B['7'], B.c9131, B.label, B.noname, B.cxt995, B.codename]) {
    const r = pickReason(board);
    assert.ok(r, board);
    if (named[board]) {
      assert.equal(r.key, '你选了「{0}」—— 这个家用的就是溪岸 {1}', board);
      assert.deepEqual(r.vars[1], C.boardGuestNames(board, { series: false }), 'seq + name (no series prefix in this sentence)');
      assert.ok(C.reasonText(r).endsWith(`溪岸 ${named[board]}`), C.reasonText(r));
    } else {
      assert.equal(r.key, '你选了「{0}」—— 这个家也是{1}', `${board}: no guest name → say the picked material, not the board`);
      assert.deepEqual(r.vars[1], { zh: walnut.zh, en: walnut.en.toLowerCase() });
    }
    for (const lang of ['zh', 'en']) {
      setLang(lang);
      try {
        const text = C.reasonText(r);
        assert.ok(!FACTORY.test(text) && !/sail-/i.test(text), `${lang}: ${text}`);
        if (lang === 'en') assert.ok(!HAN.test(text), text);
      } finally {
        setLang('zh');
      }
    }
  }
  await inEnglish(() => {
    assert.ok(C.reasonText(pickReason(B.label)).endsWith('sAil Test oak'), C.reasonText(pickReason(B.label)));
    assert.ok(C.reasonText(pickReason(B.cxt995)).endsWith(`${walnut.en.toLowerCase()} too`), C.reasonText(pickReason(B.cxt995)));
  });
});

// ───────────────────────── 8. 一次读一张大图 · 存储空间 ─────────────────────────

const png = (bytes) => new Blob([new Uint8Array(bytes)], { type: 'image/webp' });

await test('loadImageURL：设备上的照片 → 从这台设备读成 object URL（release 收回，叫两次也没事）；随网站的 → imageURL + 什么都不做的 release；读不到 → \'\'', async () => {
  C._resetDevice();
  const im = await C.putImage('p-load', null, { room: 'kitchen', detail: true, caption: { zh: '拉手', en: 'Handle' }, blobs: { 1600: png([1, 2, 3, 4, 5]), 480: png([9]), w: 1600, h: 1200 } });
  assert.deepEqual([im.detail, im.caption], [true, { zh: '拉手', en: 'Handle' }], 'putImage takes detail / caption');
  const c = { id: 'p-load', images: [im] };
  const big = await C.loadImageURL(c, im);
  assert.match(big.url, /^blob:/);
  assert.equal(resolveObjectURL(big.url)?.size, 5, 'the 1600 one by default');
  const small = await C.loadImageURL(c, im, 480);
  assert.equal(resolveObjectURL(small.url)?.size, 1, '480 for thumbs');
  big.release();
  big.release();
  assert.equal(resolveObjectURL(big.url), undefined, 'released');
  assert.ok(resolveObjectURL(small.url), 'the other one is untouched');
  small.release();
  const missing = await C.loadImageURL(c, { ...im, id: 'nope' });
  assert.equal(missing.url, '');
  missing.release();
  const bundled = { id: 'b01', src: 'seed-x/01-1600.webp', thumb: 'seed-x/01-480.webp' };
  const r = await C.loadImageURL({ id: 'seed-x' }, bundled);
  assert.equal(r.url, C.imageURL({ id: 'seed-x' }, bundled, 1600));
  assert.equal((await C.loadImageURL({ id: 'seed-x' }, bundled, 480)).url, '/cases/seed-x/01-480.webp');
  r.release();
  assert.equal((await C.loadImageURL(c, null)).url, '');
  C._resetDevice();
});

await test('storageInfo / askPersist：Node（没有 navigator.storage）→ null / false；浏览器 → 用量、配额、有没有答应保留', async () => {
  assert.equal(await C.storageInfo(), null);
  assert.equal(await C.askPersist(), false);
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const fake = (storage) => Object.defineProperty(globalThis, 'navigator', { value: { storage }, configurable: true, writable: true });
  try {
    let asked = 0;
    fake({ estimate: async () => ({ usage: 50 * 2 ** 20, quota: 2 ** 30 }), persisted: async () => false, persist: async () => (asked++, true) });
    assert.deepEqual(await C.storageInfo(), { usage: 50 * 2 ** 20, quota: 2 ** 30, persisted: false });
    assert.equal(await C.askPersist(), true);
    assert.equal(asked, 1);
    fake({ estimate: async () => ({}) });
    assert.deepEqual(await C.storageInfo(), { usage: 0, quota: 0, persisted: false }, 'no persisted() → false');
    assert.equal(await C.askPersist(), false, 'no persist() → false');
    fake({ estimate: async () => Promise.reject(new Error('blocked')), persist: async () => Promise.reject(new Error('no')) });
    assert.equal(await C.storageInfo(), null);
    assert.equal(await C.askPersist(), false);
  } finally {
    if (desc) Object.defineProperty(globalThis, 'navigator', desc);
    else delete globalThis.navigator;
  }
  assert.equal(await C.storageInfo(), null, 'restored');
});

await test('存照片失败（空间满了）：小图写不进去 → 大图也不留下；抛出写的那个错误；isQuotaError 认得空间不够（QuotaExceededError / quota · space / 写的时候的 NotFound · UnknownError）', async () => {
  C._resetDevice();
  const blobs = () => ({ 1600: png([1, 2, 3]), 480: png([4]), w: 1600, h: 1200 });
  const gone = async (caseId, id) => (await C.loadImageURL({ id: caseId }, { id, device: true })).url === '';
  // 内存仓库：480 那一下失败（iPad 的 WebKit 空间满的时候常见 UnknownError）
  C._failWrites((store, key) => (store === 'photos' && key.endsWith('/480') ? new DOMException('Error writing to database', 'UnknownError') : null));
  const err = await C.putImage('p-full', null, { id: 'x1', blobs: blobs() }).then(() => null, (e) => e);
  assert.equal(err?.name, 'UnknownError');
  assert.ok(C.isQuotaError(err), 'an UnknownError raised by a write = the device is full');
  assert.ok(await gone('p-full', 'x1'), 'no orphaned 1600 left behind');
  // 案例本身存不进去
  C._failWrites((store) => (store === 'cases' ? new DOMException('The quota has been exceeded.', 'QuotaExceededError') : null));
  const e2 = await C.saveCase(C.newCase('project')).then(() => null, (e) => e);
  assert.ok(C.isQuotaError(e2), String(e2));
  C._failWrites(null);
  const ok = await C.putImage('p-full', null, { id: 'x2', blobs: blobs() });
  assert.ok(!(await gone('p-full', ok.id)), 'writes work again');
  // isQuotaError 本身
  assert.ok(C.isQuotaError(new DOMException('x', 'QuotaExceededError')));
  assert.ok(C.isQuotaError(new Error('Failed to PutOrAdd in database because not enough space for domain')));
  assert.ok(C.isQuotaError({ name: 'Error', message: 'Quota exceeded' }));
  for (const e of [null, undefined, 'quota', new Error('decode'), new Error('namespace mismatch'), new DOMException('x', 'UnknownError'), new DOMException('x', 'NotFoundError')]) {
    assert.ok(!C.isQuotaError(e), `${e}: not a write → not a full device`);
  }
  C._resetDevice();
});

await test('IndexedDB：请求出错的时候 tx.error 还是 null → 照样拿到那个请求的错误；大图小图同一个交易，小图失败大图也不留', async () => {
  const data = new Map();
  const quota = new DOMException('Failed to PutOrAdd in database because not enough space for domain', 'QuotaExceededError');
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore() {},
    transaction() {
      const tx = { error: null, abort() {} };
      const puts = [];
      let bad = null;
      tx.objectStore = () => ({
        put(val, key) {
          const req = { error: null };
          if (String(key).endsWith('/480')) bad = req;
          puts.push([key, val]);
          return req;
        },
      });
      setTimeout(() => {
        if (!bad) {
          for (const [k, v] of puts) data.set(k, v);
          tx.oncomplete?.();
          return;
        }
        // 规范（WebKit 也一样）：请求的 error 事件先冒泡到交易 —— 这时 tx.error 还是 null —— 然后交易才 abort、才有 tx.error
        bad.error = quota;
        tx.onerror?.({ target: bad });
        tx.error = quota;
        tx.onabort?.({ target: tx });
      });
      return tx;
    },
  };
  const had = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  globalThis.indexedDB = {
    open() {
      const req = {};
      setTimeout(() => {
        req.result = db;
        req.onsuccess?.();
      });
      return req;
    },
  };
  try {
    const err = await C.putImage('p-idb', null, { id: 'x1', blobs: { 1600: png([1, 2, 3]), 480: png([4]), w: 1600, h: 1200 } }).then(() => null, (e) => e);
    assert.equal(err, quota, 'the failing request’s error (tx.error is still null at that moment)');
    assert.ok(C.isQuotaError(err));
    assert.deepEqual([...data.keys()], [], 'one transaction: the 1600 is not kept when the 480 fails');
  } finally {
    if (had) Object.defineProperty(globalThis, 'indexedDB', had);
    else delete globalThis.indexedDB;
  }
});

// ───────────────────────── 9. 案例包来回一趟 ─────────────────────────

await test('案例包：导出 → 清空 → 导入，照片说明、细节、排好的顺序、每个房间我们做了什么都还在（设备照片 + 网址照片）', async () => {
  C._resetDevice();
  const c = C.newCase('project');
  Object.assign(c, { title: { zh: '测试展示', en: 'Showcase test' }, rooms: ['kitchen', 'living'], property: { ...c.property, type: 'condo' }, supplies: { firm: ['kitchen', 'tvWall'], context: [] } });
  const a = await C.putImage(c.id, null, { room: 'kitchen', blobs: { 1600: png([82, 73, 70, 70, 1]), 480: png([82, 73, 70, 70, 2]), w: 1600, h: 1200 } });
  const b = await C.putImage(c.id, null, { room: 'kitchen', detail: true, caption: { zh: '测试拉手特写', en: 'Test handle close-up' }, blobs: { 1600: png([82, 73, 70, 70, 3]), 480: png([82, 73, 70, 70, 4]), w: 1200, h: 1600 } });
  const web = { id: 'w1', room: 'living', kind: 'photo', w: 1600, h: 1000, src: 'https://photos.example.com/t/w1-1600.webp', thumb: 'https://photos.example.com/t/w1-480.webp', alt: { zh: '', en: '' }, cover: false, caption: { zh: '测试客厅', en: 'Test living' }, detail: false };
  c.images = [b, { ...a, cover: true, caption: { zh: '测试厨房', en: '' } }, web];
  c.roomsMade = { kitchen: { firm: ['kitchen', 'worktop'], boards: [B['7'], `${P}c4040`], note: { zh: '测试说明', en: 'Test note' } }, home: { firm: ['doors'], boards: [], note: '' } };
  const saved = await C.saveCase(c);
  assert.deepEqual(saved.roomsMade.kitchen.boards, [B['7'], `${P}c4040`]);
  const text = await (await C.exportPack([c.id])).text();
  C._resetDevice();
  const r = await C.importPack(text);
  assert.deepEqual([r.added, r.errors.length], [1, 0]);
  const back = await C.getCase(c.id);
  assert.deepEqual(back.images.map((im) => [im.id, im.cover, im.detail, im.caption, !!im.device]), [
    [b.id, false, true, { zh: '测试拉手特写', en: 'Test handle close-up' }, true],
    [a.id, true, false, { zh: '测试厨房', en: '' }, true],
    ['w1', false, false, { zh: '测试客厅', en: 'Test living' }, false],
  ], 'staff order, cover, close-up flag and captions survive');
  assert.deepEqual(back.roomsMade, saved.roomsMade);
  const big = await C.loadImageURL(back, back.images[0]);
  assert.match(big.url, /^blob:/, 'device photo restored');
  big.release();
  assert.deepEqual(C.caseRoomsMade(back).map((x) => [x.room, x.derived]), [['living', true], ['kitchen', false], ['home', false]]);
  C._resetDevice();
});

await test('设备上的副本盖过随网站的案例：网站后来新加的照片照样补上（排在副本的照片后面、封面不变）；员工删掉的不会回来；随网站那一份重新发布过（rev 变了）→ 不补，免得重复；设备上新增的案例不动', async () => {
  C._resetDevice();
  const ids = (c) => c.images.map((im) => im.id);
  const covers = (c) => c.images.filter((im) => im.cover).map((im) => im.id);
  const seed = await C.getCase('seed-zen-condo');
  assert.equal(seed.origin, 'bundled');
  const all = ids(seed);
  assert.ok(all.length >= 8 && all.slice(0, 3).join() === '01,02,03', all.join());
  // 更新以前存的旧副本（rev 2，只有 01–03、没有说明 / 细节、没有 bundledImages）：从旧的案例包导进来（不经过 saveCase）
  const oldCopy = (images) => {
    const { origin, bundledImages, ...c } = { ...seed, rev: 2, images: images.map(({ caption, detail, ...im }) => im) };
    return c;
  };
  const load = async (copy, photos = {}) => {
    C._resetDevice();
    const r = await C.importPack(JSON.stringify({ kind: C.PACK_KIND, v: 1, cases: [copy], photos }));
    assert.deepEqual([r.updated, r.errors], [1, []]);
    const got = await C.getCase(seed.id);
    assert.equal(got.origin, 'override');
    return got;
  };
  const dev = { id: 'dtest', room: 'kitchen', kind: 'photo', w: 1600, h: 1200, src: '', thumb: '', alt: { zh: '', en: '' }, cover: false, device: true };
  const got = await load(oldCopy([...seed.images.slice(0, 3), dev]), { [`${seed.id}/dtest`]: 'data:image/webp;base64,AQID' });
  assert.deepEqual(ids(got), ['01', '02', '03', 'dtest', ...all.slice(3)], 'new bundled photos after the copy’s own (device photo included)');
  assert.deepEqual(covers(got), covers(seed).filter((id) => ['01', '02', '03'].includes(id)), 'cover unchanged');
  assert.deepEqual(got.images.slice(4), seed.images.slice(3).map((im) => ({ ...im, cover: false })), 'captions / close-ups of the new photos come along');
  assert.ok(C.galleryTabs(got).some((x) => x.id === 'detail'), 'the 细节 tab shows up');
  assert.equal((await C.listCases()).find((c) => c.id === seed.id).images.length, all.length + 1, 'guests see them too');
  // 旧副本里员工删掉了 02：编号不超过 03 的都算副本知道的 → 02 不回来
  assert.deepEqual(ids(await load(oldCopy([seed.images[0], seed.images[2]]))), ['01', '03', ...all.slice(3)]);
  // 旧副本里随网站的照片全删了（只剩设备上的）：不知道哪些是新的 → 一张都不补
  assert.deepEqual(ids(await load(oldCopy([dev]), { [`${seed.id}/dtest`]: 'data:image/webp;base64,AQID' })), ['dtest']);

  // 存过（saveCase 记下 bundledImages）：员工删掉 05 → 05 不回来；网站以后再加的（09）照样补上
  C._resetDevice();
  const cur = await C.getCase(seed.id);
  const saved = await C.saveCase({ ...cur, images: cur.images.filter((im) => im.id !== '05') });
  assert.deepEqual([saved.bundledImages, saved.bundledRev], [all, 1], 'stamped with the bundled photo ids and rev');
  assert.deepEqual(ids(await C.getCase(seed.id)), all.filter((id) => id !== '05'));
  const extra = { ...seed.images[3], id: '09', cover: false, src: 'seed-zen-condo/09-1600.webp', thumb: 'seed-zen-condo/09-480.webp' };
  C.useManifest({ cases: MANIFEST.cases.map((c) => (c.id === seed.id ? { ...c, images: [...c.images, extra] } : c)) });
  try {
    const later = await C.getCase(seed.id);
    assert.deepEqual(ids(later), [...all.filter((id) => id !== '05'), '09'], 'a photo the website adds later still arrives; 05 stays removed');
    assert.deepEqual(covers(later), covers(saved));
  } finally {
    C.useManifest(MANIFEST);
  }
  // 随网站那一份重新发布过（rev 变了，例如这台设备的案例包合回了网站：设备上的照片变成了 09）→ 一张都不补（补了会重复）
  assert.equal((await C.saveCase(await C.getCase(seed.id))).rev, 3);
  C.useManifest({ cases: MANIFEST.cases.map((c) => (c.id === seed.id ? { ...c, rev: 2, images: [...c.images, extra] } : c)) });
  try {
    const got2 = await C.getCase(seed.id);
    assert.deepEqual([got2.origin, ids(got2)], ['override', all.filter((id) => id !== '05')]);
  } finally {
    C.useManifest(MANIFEST);
  }

  // 设备上新增的案例：不动，也不记 bundledImages
  C._resetDevice();
  const mine = C.newCase('project');
  mine.images = [img('01', 'living', { cover: true }), img('02', 'kitchen')];
  const s2 = await C.saveCase(mine);
  assert.ok(!('bundledImages' in s2));
  const back = await C.getCase(mine.id);
  assert.equal(back.origin, 'device');
  assert.deepEqual(back.images, s2.images);
  C._resetDevice();
});

// ───────────────────────── 9b. 实拍案例优先 + 五大系列（docs/showcase/SERIES.md §1） ─────────────────────────

await test('hideConceptsAt 默认 1：一个上架、有业主同意的真实项目 → guestPool / matchCases / browseCases / similarCases 一个 3D 方案都没有（员工预览也一样）；keepConcepts 照样给', () => {
  assert.equal(CONFIG.cases.hideConceptsAt, 1);
  const p = realProfile(GUESTS.peggy);
  const real = home('p-real1', { kind: 'project', consent: true, series: 'mountain' });
  const real2 = home('p-real2', { kind: 'project', consent: true });
  const all = [...LIVE, real, real2];
  const ids = (l) => l.map((x) => x.case?.id ?? x.id).sort();
  assert.deepEqual(ids(C.guestPool(all)), ['p-real1', 'p-real2']);
  assert.deepEqual(ids(C.guestPool([...LIVE, real])), ['p-real1'], 'one is enough');
  const m = C.matchCases(p, all, { limit: 20 });
  assert.deepEqual(ids([...m.picks, ...m.rest]), ['p-real1', 'p-real2']);
  assert.deepEqual(m.excluded, [], 'the concepts are not "excluded" either — they are simply not offered');
  const b = C.browseCases(p, all);
  assert.deepEqual([ids(b.list), b.total, b.facets.kind.map((x) => x.id)], [['p-real1', 'p-real2'], 2, ['project']]);
  assert.deepEqual(ids(C.similarCases(real, all, { n: 10 })), ['p-real2']);
  assert.deepEqual(ids(C.similarCases(zen, all, { n: 10 })), ['p-real1', 'p-real2'], 'even from a concept, similar homes are real ones only');
  // 员工预览（allowDrafts）：数的也是上架、有同意的 → 一样没有 3D 方案
  assert.ok(C.guestPool(all, { allowDrafts: true }).every((c) => c.kind === 'project'));
  assert.ok(C.matchCases(p, all, { limit: 20, allowDrafts: true }).picks.every((x) => x.case.kind === 'project'));
  // keepConcepts：照样全部给（员工的地方用）
  assert.equal(C.guestPool(all, { keepConcepts: true }).length, LIVE.length + 2);
  assert.equal(C.browseCases(p, all, {}, { keepConcepts: true }).total + C.browseCases(p, all, {}, { keepConcepts: true }).excluded.length, LIVE.length + 2);
});

await test('草稿、没有业主同意、藏起来、展厅的「项目」都不算数：3D 方案照常给（客人和员工预览都一样）；只有 3D 方案 → 和以前一模一样', () => {
  const p = realProfile(GUESTS.peggy);
  const others = {
    draft: home('p-d', { kind: 'project', status: 'draft', consent: true }),
    noconsent: home('p-n', { kind: 'project', consent: false }),
    hidden: home('p-h', { kind: 'project', status: 'hidden', consent: true }),
    showroom: home('p-s', { kind: 'showroom', consent: true }),
  };
  for (const [what, x] of Object.entries(others)) {
    const list = [...LIVE, x];
    assert.deepEqual(C.guestPool(list).map((c) => c.id), LIVE.map((c) => c.id), what);
    assert.ok([...C.matchCases(p, list, { limit: 20 }).picks].some((m) => m.case.kind === 'concept'), `${what}: matchCases`);
    assert.equal(C.browseCases(p, list).total + C.browseCases(p, list).excluded.length, LIVE.length, `${what}: browse`);
    assert.ok(C.similarCases(zen, list, { n: 10 }).every((m) => m.case.kind === 'concept') && C.similarCases(zen, list).length === 4, `${what}: similar`);
    assert.ok(C.guestPool(list, { allowDrafts: true }).some((c) => c.kind === 'concept'), `${what}: staff preview keeps the concepts too`);
  }
  // 员工预览：草稿 + 没同意的都在，3D 方案也在
  const staff = C.guestPool([...LIVE, others.draft, others.noconsent], { allowDrafts: true }).map((c) => c.id);
  assert.deepEqual(staff, [...LIVE.map((c) => c.id), 'p-d', 'p-n']);
  // 只有 3D 方案（客人自己的手机）：默认的门槛下，和重构前记下的结果一模一样
  for (const [key, g] of Object.entries(GUESTS)) {
    const tp = tableProfile(g);
    const rp = realProfile(g);
    const runs = {
      [`${key}/table`]: C.matchCases(tp, LIVE, { picksMats: tp._picks }),
      [`${key}/real`]: C.matchCases(rp, LIVE),
      [`${key}/real/6`]: C.matchCases(rp, LIVE, { limit: 6 }),
    };
    for (const [k, r] of Object.entries(runs)) assert.deepEqual({ picks: r.picks.map((m) => m.case.id), rest: r.rest.map((m) => m.case.id), excluded: r.excluded.map((e) => e.id) }, BEFORE[k], k);
  }
});

await test('migrateCase：case.series = 系列的 key 或 null；旧写法（空山 / 织系列 / Skeleton Line…）也认；自然线、庭前 = null；可以重复调用；随网站的 3D 方案都没有系列', () => {
  const cases = [
    ['mountain', 'mountain'], ['空山', 'mountain'], ['空山系列', 'mountain'], ['织', 'weaving'], ['织系列', 'weaving'], ['骨骼线', 'skeleton'], ['Skeleton Line', 'skeleton'],
    ['雾山', 'misty'], ['Misty Mountain', 'misty'], ['侘寂东方', 'wabi'], ['wabi', 'wabi'], ['溪岸 · 空山', 'mountain'],
    ['自然线', null], ['庭前', null], ['侘寂', null], ['', null], [null, null], [undefined, null], [42, null], ['nope', null],
  ];
  for (const [inp, out] of cases) {
    const c = C.migrateCase({ id: 'p-ser', kind: 'project', series: inp });
    assert.equal(c.series, out, String(inp));
    assert.deepEqual(C.migrateCase(c), c, `${inp} idempotent`);
  }
  assert.equal(C.migrateCase({ id: 'p-old' }).series, null, 'an old case has no series');
  for (const c of LIVE) assert.equal(c.series, null, `${c.id}: seed concepts have no series`);
});

await test('存进这台设备 / 案例包来回一趟：系列还在', async () => {
  C._resetDevice();
  const saved = await C.saveCase(home('p-ser-dev', { kind: 'project', consent: true, series: '雾山' }));
  assert.equal(saved.series, 'misty');
  assert.equal((await C.getCase('p-ser-dev')).series, 'misty');
  const blob = await C.exportPack(['p-ser-dev']);
  C._resetDevice();
  const res = await C.importPack(await blob.text());
  assert.equal(res.added, 1);
  assert.equal((await C.getCase('p-ser-dev')).series, 'misty');
  C._resetDevice();
});

/** 这位客人最适合的三个系列（recommendSeries 的前三名） */
const seriesOrder = (p) => S.recommendSeries(p).map((x) => x.key);

await test('matchCases：案例的系列 = 客人最适合的 + 0.12、第二适合的 + 0.05、别的不加；理由「和最适合你的系列一样：{0}」只给第一名；没写系列的家分数照旧', async () => {
  const p = realProfile(GUESTS.peggy);
  const [first, second, third] = seriesOrder(p);
  const base = home('p-none', { kind: 'project', consent: true });
  const withS = (key) => ({ ...base, id: `p-${key}`, series: key });
  const one = (c, prof = p) => C.matchCases(prof, [c], { limit: 1 }).picks[0];
  const s0 = one(base).score;
  approx(one(withS(first)).score - s0, C.WEIGHTS.series, 'the best series');
  approx(one(withS(second)).score - s0, C.WEIGHTS.series2, 'the second');
  approx(one(withS(third)).score - s0, 0, 'the third: nothing');
  assert.deepEqual([C.WEIGHTS.series, C.WEIGHTS.series2], [0.12, 0.05]);
  assert.deepEqual(one(withS(first)).parts.find((x) => x.kind === 'series'), { kind: 'series', v: 0.12 });
  assert.ok(!one(base).parts.some((x) => x.kind === 'series'));
  // 理由：只有第一名的说
  const r1 = one(withS(first)).reasons.find((r) => r.kind === 'series');
  assert.ok(r1, 'the reason is there');
  assert.equal(C.reasonText(r1), `和最适合你的系列一样：${S.SERIES_BY_KEY[first].zh}`);
  assert.ok(!one(withS(second)).reasons.some((r) => r.kind === 'series'));
  await inEnglish(() => assert.equal(C.reasonText(r1), `Same as the series that suits you best: ${S.SERIES_BY_KEY[first].en}`));
  // 排在前面：别的都一样，系列对的那个家先
  const r = C.matchCases(p, [withS(third), base, withS(first), withS(second)], { limit: 4, lambda: 0 });
  assert.deepEqual(r.picks.slice(0, 2).map((m) => m.case.id), [`p-${first}`, `p-${second}`]);
  // 客人没答题（没有轴）：不说「最适合你的系列」，也不加分
  for (const prof of [null, {}, { code: 'WMNH' }]) {
    const m = one(withS(first), prof);
    assert.ok(!m.parts.some((x) => x.kind === 'series') && !m.reasons.some((x) => x.kind === 'series'), JSON.stringify(prof));
  }
  // 没写系列的家：和别的家放在一起照样是原来的分数（3D 方案、员工还没定系列的）
  const mix = C.matchCases(p, [...LIVE, withS(first)], { limit: 100, keepConcepts: true });
  const alone = C.matchCases(p, LIVE, { limit: 100 });
  const scoreOf = (res) => Object.fromEntries([...res.picks, ...res.rest].map((m) => [m.case.id, m.score]));
  for (const [id, sc] of Object.entries(scoreOf(alone))) assert.equal(scoreOf(mix)[id], sc, id);
  // 看全部的理由和 matchCases 一样
  const b = C.browseCases(p, [withS(first), base]);
  assert.deepEqual(b.list.map((m) => m.reasons), C.matchCases(p, [withS(first), base], { limit: 100 }).picks.map((m) => m.reasons));
});

await test('browseCases：系列的筛选（facets.series 按品牌手册的顺序，没写系列的不算；filters.series 收 key 或名字；和别的组之间「而且」）', async () => {
  const p = realProfile(GUESTS.ken);
  const cs = [
    home('p-m1', { kind: 'project', consent: true, series: 'mountain' }),
    home('p-m2', { kind: 'project', consent: true, series: '空山', property: { type: 'terrace' } }),
    home('p-w', { kind: 'project', consent: true, series: 'wabi' }),
    home('p-sk', { kind: 'project', consent: true, series: 'skeleton' }),
    home('p-0', { kind: 'project', consent: true }),
  ];
  const all = C.browseCases(p, cs);
  assert.deepEqual(all.facets.series.map((x) => [x.id, x.n, x.label]), [['skeleton', 1, '骨骼线'], ['mountain', 2, '空山'], ['wabi', 1, '侘寂东方']]);
  const ids = (f) => C.browseCases(p, cs, f).list.map((m) => m.case.id).sort();
  assert.deepEqual(ids({ series: ['mountain'] }), ['p-m1', 'p-m2']);
  assert.deepEqual(ids({ series: ['wabi', 'mountain'] }), ['p-m1', 'p-m2', 'p-w'], 'OR inside the group');
  assert.deepEqual(ids({ series: '侘寂东方' }), ['p-w'], 'a name / single value works too');
  assert.deepEqual(ids({ series: ['mountain'], type: ['terrace'] }), ['p-m2'], 'AND across groups');
  assert.deepEqual(ids({ series: ['nope'] }), ids({}), 'an unknown series filters nothing out');
  assert.deepEqual(C.browseCases(p, cs, { series: ['wabi'] }).facets, all.facets, 'facets ignore the filters');
  await inEnglish(() => {
    assert.deepEqual(C.browseCases(p, cs).facets.series.map((x) => x.label), ['Skeleton Line', 'Empty Mountain', 'Wabi-Sabi Eastern']);
  });
});

await test('caseFacts：写了系列 → 「系列 · 空山」（在风格后面）；没写 → 没有这一行；英文是系列的英文名', async () => {
  const c = home('p-f', { kind: 'project', consent: true, series: 'misty' });
  const facts = C.caseFacts(c).map((f) => [f.k, f.label, f.value]);
  const at = facts.findIndex((f) => f[0] === 'series');
  assert.deepEqual(facts[at], ['series', '系列', '雾山']);
  assert.equal(facts[at - 1][0], 'style', 'right after 风格');
  assert.ok(!C.caseFacts(home('p-f0')).some((f) => f.k === 'series'));
  assert.ok(!C.caseFacts(zen).some((f) => f.k === 'series'));
  assert.equal(C.caseFacts({ ...c, series: '织系列' }).find((f) => f.k === 'series').value, '织', 'a raw (not migrated) legacy name works too');
  await inEnglish(() => {
    assert.deepEqual(C.caseFacts(c).find((f) => f.k === 'series'), { k: 'series', label: 'Series', value: 'Misty Mountain' });
    assert.equal(C.caseFacts({ ...c, series: 'weaving' }).find((f) => f.k === 'series').value, 'Weaving');
  });
});

await test('100 个案例（每 3 个有一个写了系列）也很快：看全部 < 25 ms', () => {
  const keys = S.SERIES.map((s) => s.key);
  const big = Array.from({ length: 100 }, (_, i) => ({ ...LIVE[i % LIVE.length], id: `s${i}`, order: i, kind: 'project', consent: true, status: 'live', series: i % 3 ? null : keys[(i / 3) % keys.length] }));
  const p = { ...realProfile(GUESTS.aisha), avoid: [] };
  C.browseCases(p, big);
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) C.browseCases(p, big);
  const ms = (performance.now() - t0) / 5;
  assert.ok(ms < 25, `browse ${ms.toFixed(2)} ms`);
  assert.deepEqual(C.browseCases(p, big).facets.series.map((x) => x.n), [7, 7, 7, 7, 6], '34 of the 100 have a series');
});

// ───────────────────────── 10. 快：100 个案例 ─────────────────────────

await test('100 个案例也很快：看全部 < 25 ms、相似的家 < 2 ms、每个房间我们做了什么 / 照片标签 < 0.5 ms', () => {
  const big = Array.from({ length: 100 }, (_, i) => ({ ...LIVE[i % LIVE.length], id: `c${i}`, order: i, kind: i % 3 ? 'concept' : 'project', consent: true }));
  const p = realProfile(GUESTS.ken);
  const time = (k, fn) => {
    fn();
    const t0 = performance.now();
    for (let i = 0; i < k; i++) fn();
    return (performance.now() - t0) / k;
  };
  const browse = time(5, () => C.browseCases(p, big, { kind: 'all' }, { keepConcepts: true }));
  assert.equal(C.browseCases(p, big, {}, { keepConcepts: true }).total + C.browseCases(p, big, {}, { keepConcepts: true }).excluded.length, 100);
  const sim = time(20, () => C.similarCases(big[0], big, { profile: p }));
  const made = time(200, () => C.caseRoomsMade(mkCase()));
  const tabs = time(200, () => C.galleryTabs(GALLERY));
  assert.ok(browse < 25, `browse ${browse.toFixed(2)} ms`);
  assert.ok(sim < 2, `similar ${sim.toFixed(2)} ms`);
  assert.ok(made < 0.5 && tabs < 0.5, `roomsMade ${made.toFixed(3)} ms · tabs ${tabs.toFixed(3)} ms`);
});

// ───────────────────────── 11. 英文 ─────────────────────────

await test('英文：这一层新加的中文都有英文（en-cases.js），英文界面里没有中文', async () => {
  for (const k of ['全部', '细节', '全屋', '房子', '建筑面积', '几房几卫', '楼层', '{0} 层楼', '我们做了', '整个家', '{0} 个房间', '风格', '地区', '做过的家', '3D 方案', '系列', '和最适合你的系列一样：{0}']) assert.ok(EN[k], k);
  await inEnglish(() => {
    for (const c of [mkCase(), ...LIVE]) {
      for (const x of C.galleryTabs(c)) assert.ok(!HAN.test(x.label), x.label);
      for (const r of C.caseRoomsMade(c)) {
        assert.ok(!HAN.test(r.label), r.label);
        for (const f of r.firm) assert.ok(!HAN.test(f.label), f.label);
        for (const b of r.boards) assert.ok(!HAN.test(b.name), b.name);
      }
    }
  });
});

unregisterBoards(TEST_BOARDS.map((r) => r.id), { src: 'bundled' });
console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);

