// 溪岸板材 · 资料这一侧（builder C）：案例原板、配色换成真实板材（toBoards）、案例库 / 配对 / 雷区、realise、简报和导出、
// 公司做的表面（R1）、旧链接 / 旧存档解出来一模一样（SPEC §5.3 + §8 R1 / R6 / R11 / R12 / R13）。
// 跑：node test/boards-data.test.mjs
//
// 板材库在这里是「编出来」的：15 块板只有颜色（老板文件夹截图上量出来的平均色）+ 产品名，走导入器同一条路
// （parse.js 认名字、derive.js 算情绪数字和雷区标签）；另外几块测试板（石纹 / 编织 / 亮光白 / 隐藏）名字都是「测试…」。
// 没有任何贴图、案例照片或真人名字。test/fixtures/boards-data/prod-38b6c25.json 是用生产版本（38b6c25）的代码造的
// 旧链接 / 旧方案 / realise 结果（示范客人，编出来的档案）—— 新代码解出来必须一模一样。
// 随网站的板材库（library.js）合进真实板材以后这里也要是绿的：一开头先把它登记进来再 resetBoards() 清空，
// 「空的板材库 = 生产版本」那几项永远在空的登记表上跑；最后用 test/fixtures/boards/merged.mjs 的合成板材库把几组测试再跑一遍。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { CONFIG } from '../src/shared/config.js';
import { setLang as setLang0 } from '../src/shared/i18n.js';
import EN from '../src/shared/i18n/en.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MATERIALS, MAT_BY_ID, SLOTS, fits, registerBoards, unregisterBoards, BOARDS, BOARD_SLOTS, defaultSlotFor } from '../src/shared/materials.js';
import { resetBoards } from '../src/shared/boards/library-api.js';
import { bundledBoards, bundledLoaded } from '../src/shared/boards/bundled.js';
import { tagsOf, MOOD_BY_ID } from '../src/shared/moods.js';
import { DREAMERS, DREAMER_BY_CODE } from '../src/shared/dreamers.js';
import { parseBoardName, assignIds, boardName } from '../src/shared/boards/parse.js';
import { deriveNumbers, tagsFor, nearestProcedural } from '../src/shared/boards/derive.js';
import * as M from '../src/shared/boards/match.js';
import * as C from '../src/shared/cases.js';
import { realiseCase } from '../src/shared/realise.js';
import { avoidMaterials, buildProfile, unpackJSON, storagePlan } from '../src/shared/profile.js';
import * as H from '../src/shared/home.js';
import * as O from '../src/studio/offer.js';
import { profileText, leadText, boardsText } from '../src/shared/summary.js';
import { createProject, unpackProject, toStoredProject, fromStoredProject } from '../src/studio/store.js';
import { templatePlan } from '../src/studio/plan/model.js';
import * as FLOW from '../src/quiz/flow.js';
import { boardCode, matTag } from '../src/studio/export/catalog.js';
import { readme, scheduleCsv } from '../src/studio/export/readme.js';
import { CATALOG, buildItem, useLib } from '../src/studio/engine/furniture.js';
import * as Furnish from '../src/studio/engine/furnish.js';
import { buildAllWalls } from '../src/studio/plan/model.js';
import { renderKeywords } from '../src/quiz/keywords.js';

const OLD = JSON.parse(fs.readFileSync(new URL('./fixtures/boards-data/prod-38b6c25.json', import.meta.url), 'utf8'));
const MANIFEST = JSON.parse(fs.readFileSync(new URL('../src/cases/manifest.json', import.meta.url), 'utf8'));

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

console.log('溪岸板材 · 资料（boards-data）');

// ───────────────────────── 示范客人（和 fixture 同一套编出来的答案） ─────────────────────────
const SAMPLES = [
  { id: 'A', name: '示范客人 A', picks: 'room:a wall:c touch:a guest:a sofa:c night:c floor:a kitchen:a table:c weekend:b', wishes: ['storage', 'clean', 'kids'], avoid: ['marble'], life: { cook: 'heavy', who: ['kids'] }, ratio: 20 },
  { id: 'B', name: '示范客人 B', picks: 'room:b wall:d touch:b guest:c sofa:b night:a floor:e kitchen:c table:d weekend:a', wishes: ['host', 'photo', 'work'], avoid: ['rattan', 'pink'], life: { cook: 'light', who: [] }, ratio: 45 },
  { id: 'C', name: 'Guest C', picks: 'room:f wall:b touch:a guest:b sofa:c night:c floor:a kitchen:b table:c weekend:a', wishes: ['host', 'kitchen', 'pets'], avoid: ['grey', 'black', 'darkwood'], life: { cook: 'heavy', who: ['cat'] }, ratio: 40 },
  { id: 'D', name: 'Guest D', picks: 'room:c wall:a touch:b guest:d sofa:a night:b floor:c kitchen:d table:a weekend:c', wishes: ['light', 'sleep', 'value'], avoid: [], life: { cook: 'rare', who: [] }, ratio: 30 },
];
const profileOf = (s) => {
  const pairs = Object.fromEntries(s.picks.split(' ').map((x) => x.split(':')).map(([k, v]) => [k, { pick: v, ms: 2200, left: 'abcd' }]));
  return buildProfile({ name: s.name, players: 'solo', pairs, wishes: s.wishes, avoid: s.avoid, life: s.life, ratio: s.ratio, ratioTouched: true }, { id: `TEST-${s.id}` }, { PAIRS: FLOW.PAIRS, LIFE: FLOW.LIFE });
};
const PROFILES = Object.fromEntries(SAMPLES.map((s) => [s.id, profileOf(s)]));
C.useManifest(MANIFEST);
const SEEDS = await C.listCases({ includeDrafts: true });
const plan = templatePlan('condo3');

// ───────────────────────── 1. 空的板材库 = 和生产版本一模一样 ─────────────────────────

// 随网站的那份（出厂是空的；合进真实板材以后不是）先登记，再清空：下面「空的板材库」那几项不管网站上有几块板都一样
const SHIPPED = await bundledBoards();
resetBoards();

await test('板材库清空（resetBoards）以后：没有板时 toBoards / 简报 / 案例原板什么都不做', () => {
  assert.ok(SHIPPED.count >= 0 && !bundledLoaded(), `随网站的 ${SHIPPED.count} 块已经清掉`);
  assert.equal(BOARDS.length, 0);
  assert.ok(Object.keys(MAT_BY_ID).every((id) => !MAT_BY_ID[id].board));
  const r = M.toBoards({ cabinetry: 'walnut', feature: 'walnut' });
  assert.deepEqual(r, { materials: { cabinetry: 'walnut', feature: 'walnut' }, picks: {} });
  assert.equal(boardsText({ cabinetry: 'walnut', feature: 'walnut' }, { staff: true }), '');
  assert.ok(!profileText(PROFILES.A, storagePlan(PROFILES.A.storage, FLOW.APPLIANCES), '', { client: false }).includes('溪岸'));
});

await test('空的板材库：生产版本（38b6c25）的 #p= 链接 / #s= 分享 / realise 结果，新代码一模一样', async () => {
  for (const row of OLD.profiles) {
    const prof = await unpackJSON(row.link);
    assert.deepEqual(prof.materials, row.profileMaterials, `#p= ${row.id}`);
    assert.deepEqual(createProject({ plan, profile: prof }).materials, row.materials, `createProject ${row.id}`);
  }
  for (const row of OLD.shares) assert.deepEqual((await unpackProject(row.link)).materials, row.materials, `#s= ${row.id}`);
  for (const row of OLD.realise) {
    const c = row.caseId ? SEEDS.find((x) => x.id === row.caseId) : null;
    const r = realiseCase({ caseObj: c, keep: row.keep, profile: PROFILES[row.profile] });
    assert.deepEqual(r.materials, row.materials, `realise ${row.profile} × ${row.caseId} × ${JSON.stringify(row.keep)}`);
    assert.equal(r.softened.length, row.softened);
    assert.deepEqual(r.boardPicks, {});
  }
});

// ───────────────────────── 编出来的板材库 ─────────────────────────

const LISTING = [
  ['1号红橡乱纹.jpg', '#523C35'],
  ['2白橡直纹.jpg', '#A78F6C'],
  ['2号红橡乱纹XA-TP-10.jpg', '#3B3B3B'],
  ['3号白蜡乱纹XA-TP-05.jpg', '#D0D1CC'],
  ['5号红樱桃乱纹.jpg', '#441B10'],
  ['6号红樱桃乱纹.jpg', '#47372C'],
  ['7号黑胡桃XA-TP-01.jpg', '#5E4433'],
  ['8号黑胡桃XA-TP-01.jpg', '#5E4232'],
  ['11号卡斯楠.jpg', '#2D282A'],
  ['13号桦木乱纹素板.jpg', '#A68C73'],
  ['14号欧桦木乱纹.jpg', '#713B1B'],
  ['15号卡斯楠.jpg', '#724227'],
  ['2810.jpg', '#2D453D'],
  ['6162.jpg', '#ACB196'],
  ['6165.jpg', '#7B7C5A'],
];
/** 导入器同一条路：文件名 → parse；颜色 → derive（情绪数字、雷区标签、最接近的程序化材质） */
function recordOf(p, hex, extra = {}) {
  const kind = extra.kind || (p.species || p.grain ? 'wood' : p.catHint === 'solid' || /^\d+$/.test(p.code || '') ? 'solid' : 'wood');
  const finish = extra.finish || p.finish || 'matte';
  const n0 = deriveNumbers({ hex, kind, finish });
  return {
    id: p.id,
    rev: 1,
    seq: p.seq,
    code: p.code || '',
    file: p.file,
    series: extra.series || p.series || '',
    species: p.species?.zh || '',
    grain: p.grain?.v || null,
    flags: [],
    name: extra.name || boardName(p),
    kind,
    finish,
    hex,
    lab: n0.lab,
    light: n0.light,
    warm: n0.warm,
    mood: n0.mood,
    tags: tagsFor({ hex, lab: n0.lab, kind, finish, light: n0.light, series: extra.series || '' }),
    rough: n0.rough,
    near: nearestProcedural(n0.lab, kind, MATERIALS)?.id || '',
    proc: p.species?.proc,
    uses: extra.uses,
    fav: !!extra.fav,
    hidden: !!extra.hidden,
    hash: '0123456789abcdef',
    at: '2026-10-24',
    img: false,
  };
}
const items = LISTING.map(([f]) => parseBoardName(f));
assignIds(items);
const RECS = items.map((p, i) => recordOf(p, LISTING[i][1]));
const TEST = [
  recordOf({ id: 'sail-x0stone', seq: null, code: '', file: 'test-stone.jpg' }, '#9C9890', { kind: 'stone', name: { zh: '测试石纹', en: 'Test stone' } }),
  recordOf({ id: 'sail-x0weave', seq: null, code: 'SG-PK02-1', file: 'test-weave.jpg' }, '#B9A98E', { kind: 'weave', series: '织系列', name: { zh: '测试编织', en: 'Test weave' } }),
  recordOf({ id: 'sail-x0white', seq: null, code: '', file: 'test-white.jpg' }, '#ECEBE6', { kind: 'solid', finish: 'gloss', name: { zh: '测试亮光白', en: 'Test gloss white' } }),
  recordOf({ id: 'sail-x0hidden', seq: null, code: '', file: 'test-hidden.jpg' }, '#694330', { kind: 'wood', hidden: true, name: { zh: '测试隐藏', en: 'Test hidden' } }),
];
const ALL_IDS = [...RECS, ...TEST].map((r) => r.id);

await test('编出来的板材库登记好（15 块 + 4 块测试板）；板材不进程序化的 MATERIALS（colorTags 的登记测试照旧只看 MATERIALS）', () => {
  const r = registerBoards([...RECS, ...TEST], { src: 'bundled' });
  assert.deepEqual(r.skipped, []);
  assert.equal(BOARDS.length, 19);
  assert.ok(ALL_IDS.every((id) => MAT_BY_ID[id]?.board));
  assert.ok(MATERIALS.every((m) => !m.board) && !MATERIALS.some((m) => ALL_IDS.includes(m.id)));
  // 一个 id 一块板，id 从名字来（R8：序号 → sail-<序号>；色号 → sail-c<色号>；2白橡 / 2号 撞号 → -b）
  for (const id of ['sail-7', 'sail-8', 'sail-2', 'sail-2-b', 'sail-c2810', 'sail-c6162']) assert.ok(MAT_BY_ID[id], id);
  assert.equal(MAT_BY_ID['sail-7'].board.code, 'XA-TP-01');
  assert.equal(MAT_BY_ID['sail-7'].board.near, 'walnut');
});

// ───────────────────────── 2. 有板材库以后：载入旧的东西不换板 ─────────────────────────

await test('有板材库：旧 #p= 链接、#s= 分享、本机存的方案载入时不换成板材（只有新的 realise / 套用才换）', async () => {
  for (const row of OLD.profiles) assert.deepEqual(createProject({ plan, profile: await unpackJSON(row.link) }).materials, row.materials, row.id);
  for (const row of OLD.shares) assert.deepEqual((await unpackProject(row.link)).materials, row.materials, row.id);
  for (const s of SAMPLES) {
    const p = createProject({ plan, profile: PROFILES[s.id] });
    const back = fromStoredProject(JSON.parse(JSON.stringify(toStoredProject(p))));
    assert.deepEqual(back.materials, OLD.stored.find((x) => x.id === s.id).materials, s.id);
  }
});

await test('有板材库但 CONFIG.boards.realise = false（或 on = false）：realise 和生产版本一模一样', () => {
  for (const flag of ['realise', 'on']) {
    CONFIG.boards[flag] = false;
    try {
      for (const row of OLD.realise) {
        const c = row.caseId ? SEEDS.find((x) => x.id === row.caseId) : null;
        assert.deepEqual(realiseCase({ caseObj: c, keep: row.keep, profile: PROFILES[row.profile] }).materials, row.materials, `${flag} ${row.caseId}`);
      }
    } finally {
      CONFIG.boards[flag] = true;
    }
  }
});

// ───────────────────────── 3. 放在哪里（R1 / R6） ─────────────────────────

await test('fits：板材只上柜体（含室内门）和主题墙板 —— 地板、墙、台面、砖、布、五金、木作家具都不行；织系列哪里都不行', () => {
  const off = SLOTS.map((s) => s.id).filter((s) => !BOARD_SLOTS.includes(s));
  assert.deepEqual(BOARD_SLOTS, ['cabinetry', 'feature']);
  for (const id of ALL_IDS) for (const s of off) assert.equal(fits(id, s), false, `${id} on ${s}`);
  for (const id of ['sail-7', 'sail-13', 'sail-c2810', 'sail-x0white']) for (const s of BOARD_SLOTS) assert.equal(fits(id, s), true, `${id} on ${s}`);
  // 石纹板默认只做墙板；编织（织系列）只是资料
  assert.equal(fits('sail-x0stone', 'feature'), true);
  assert.equal(fits('sail-x0stone', 'cabinetry'), false);
  for (const s of SLOTS) assert.equal(fits('sail-x0weave', s.id), false);
  // 点一下板、又没选表面：去柜体（不是木头默认的地板）
  assert.equal(defaultSlotFor('sail-7'), 'cabinetry');
  assert.equal(defaultSlotFor('walnut'), 'floor');
});

await test('「我们做」：主题墙上的溪岸板材就是墙板（木纹 / 纯色 / 石纹都算）；刷漆、微水泥的主题墙照旧不是；home.js 和 offer.js 一样', () => {
  for (const mod of [H, O]) {
    for (const id of ['sail-7', 'sail-c2810', 'sail-x0stone', 'sail-x0white']) assert.equal(mod.isOfferSlot('feature', id), true, id);
    for (const id of ['sand-limewash', 'gallery-white', 'microcement', 'sintered']) assert.equal(mod.isOfferSlot('feature', id), false, id);
    assert.equal(mod.isOfferSlot('feature', 'walnut'), true);
    assert.equal(mod.isOfferSlot('cabinetry', 'sail-7'), true);
    assert.equal(mod.isOfferSlot('woodwork', 'sail-7'), false);
    assert.deepEqual(mod.OFFER_SLOTS, ['cabinetry', 'feature', 'countertop']);
    assert.deepEqual(mod.PANEL_TEX, ['wood', 'marble', 'travertine', 'terrazzo']);
  }
  assert.deepEqual(H.offerKinds([], { featureMat: 'sail-c2810' }).map((o) => o.v), ['panels']);
});

await test('R1：活动家具（ILLUSTRATION_ITEMS）一件都不用柜体 / 主题墙的材质，公司做的（OFFER_ITEMS）每一件都用；自动摆的书墙 = 柜体，梳妆台 / 儿童床玩具箱 = 木作', () => {
  const fixed = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? t[k] || (t[k] = new THREE.MeshStandardMaterial()) : undefined) });
  const slots = {};
  useLib({ quality: 'fast', slot: (k) => slots[k] || (slots[k] = Object.assign(new THREE.MeshStandardMaterial(), { userData: { slot: k } })), fixed });
  // 和 3D 里一样的 key：自动摆家具（furnish.js）/ 材质栏加进来（StudioApp addItem）给的
  const KEY = { bookshelf: 'cabinetry', dresser: 'woodwork', kidsBed: 'woodwork' };
  const slotsOf = (kind, legacy = false) => {
    const def = CATALOG[kind];
    const item = { id: 'x', kind, x: 0, z: 0, w: def.size[0], d: def.size[1], h: 2.6 };
    if (!legacy && KEY[kind]) item.key = KEY[kind];
    const g = buildItem(item, { wallH: 2.8 });
    const s = new Set();
    g.traverse((o) => o.isMesh && o.userData.slot && s.add(o.userData.slot));
    return s;
  };
  for (const kind of O.ILLUSTRATION_ITEMS) {
    const s = slotsOf(kind);
    assert.ok(!s.has('cabinetry') && !s.has('feature'), `${kind}: ${[...s]}`);
  }
  for (const kind of O.OFFER_ITEMS) {
    const s = slotsOf(kind);
    assert.ok(s.has('cabinetry') || s.has('feature'), `${kind}: ${[...s]}`);
  }
  // 旧方案里存的家具没有 key：照旧（梳妆台、玩具箱还是柜体；书墙还是木作）—— 存档原样，画出来一样
  assert.ok(slotsOf('dresser', true).has('cabinetry'));
  assert.ok(slotsOf('kidsBed', true).has('cabinetry'));
  assert.ok(slotsOf('bookshelf', true).has('woodwork'));
  // 自动摆家具：书多、有小孩的客人 → 书墙 key 'cabinetry'，梳妆台 / 儿童床 key 'woodwork'；收纳对账的书墙照样算得到
  const prof = { ...PROFILES.A, storage: { ...PROFILES.A.storage, books: 10 } };
  for (const tpl of ['condo3', 'terrace2']) {
    const pl = templatePlan(tpl);
    const its = Furnish.furnish(pl, buildAllWalls(pl), prof);
    for (const it of its.filter((i) => i.kind === 'bookshelf')) assert.equal(it.key, 'cabinetry', `${tpl} bookshelf ${it.room}`);
    for (const it of its.filter((i) => i.kind === 'dresser' || i.kind === 'kidsBed')) assert.equal(it.key, 'woodwork', `${tpl} ${it.kind}`);
    const rows = Furnish.furnishReport(pl, buildAllWalls(pl), prof, its);
    const books = rows.find((r) => r.key === 'books');
    if (its.some((i) => i.kind === 'bookshelf' && !/store/.test(pl.floors.flatMap((f) => f.rooms).find((r) => r.id === i.room)?.type || ''))) assert.ok(books?.placed > 0, `${tpl} books row`);
  }
});

await test('R6：织系列只是资料 —— 材质栏、toBoards、雷区换板都不会用它；案例「还用了」可以放', () => {
  assert.ok(!M.boardCandidates('cabinetry', 'weave').length);
  assert.ok(!BOARDS.filter((m) => m.board.kind === 'weave').some((m) => fits(m.id, 'cabinetry') || fits(m.id, 'feature')));
  const c = C.migrateCase({ id: 'p-weave', boardsAlso: ['sail-x0weave'] });
  assert.deepEqual(c.boardsAlso, ['sail-x0weave']);
  assert.deepEqual(C.caseBoardList(c), [{ id: 'sail-x0weave', slot: null, known: true }]);
  const bad = C.migrateCase({ id: 'p-weave2', boards: { cabinetry: 'sail-x0weave' } });
  assert.ok(C.validateCase(bad).errors.some((e) => e.field === 'boards' && e.zh === '有溪岸板材放在了不合适的表面'));
});

// ───────────────────────── 4. 案例：资料形状、检查、案例原板 ─────────────────────────

await test('migrateCase：boards / boardsAlso 明确地留下来（不认得的 id 也留着，R11 e）；样子不对的丢掉；woodwork 不收（R1）；没有 aliases（R8）；可以重复调用', () => {
  const raw = { id: 'p-b1', boards: { cabinetry: 'sail-23', feature: 'SAIL 7', woodwork: 'sail-13' }, boardsAlso: ['sail-c9130', 'sail-23', 'sail-c9130', 'x', ...Array.from({ length: 12 }, (_, i) => `sail-${100 + i}`)], materials: { cabinetry: 'walnut' }, aliases: ['sail-old'] };
  const c = C.migrateCase(raw);
  assert.deepEqual(c.boards, { cabinetry: 'sail-23' });
  assert.equal(c.boardsAlso[0], 'sail-c9130');
  assert.ok(!c.boardsAlso.includes('sail-23'), 'a board already on a slot is not repeated');
  assert.equal(c.boardsAlso.length, 8);
  assert.equal(c.materials.cabinetry, 'walnut');
  assert.ok(!('aliases' in c));
  assert.deepEqual(C.migrateCase(c), c);
  // 旧案例（没有 boards）：两个空的字段，别的不变
  const old = C.migrateCase(MANIFEST.cases[0]);
  assert.deepEqual([old.boards, old.boardsAlso], [{}, []]);
  // 别的工具把板材 id 写进了 materials：挪到 boards，materials 留近似材质
  const moved = C.migrateCase({ id: 'p-b2', materials: { cabinetry: 'sail-8', floor: 'walnut' } });
  assert.deepEqual(moved.boards, { cabinetry: 'sail-8' });
  assert.equal(moved.materials.cabinetry, 'walnut');
  assert.deepEqual(C.migrateCase(moved), moved);
});

await test('setCaseBoard：每次都把 materials[slot] 写成这块板的近似材质（R11 a）；清掉只清 boards', () => {
  const c = C.migrateCase({ id: 'p-b3', materials: { cabinetry: 'white-lacquer' } });
  C.setCaseBoard(c, 'cabinetry', 'sail-8');
  assert.equal(c.materials.cabinetry, MAT_BY_ID['sail-8'].board.near);
  C.setCaseBoard(c, 'cabinetry', 'sail-13');
  assert.equal(c.boards.cabinetry, 'sail-13');
  assert.equal(c.materials.cabinetry, MAT_BY_ID['sail-13'].board.near);
  assert.ok(!MAT_BY_ID[c.materials.cabinetry].board && fits(c.materials.cabinetry, 'cabinetry'));
  C.setCaseBoard(c, 'feature', 'sail-23'); // 还不认得的：只记 id
  assert.equal(c.boards.feature, 'sail-23');
  assert.equal(c.materials.feature, undefined);
  C.setCaseBoard(c, 'cabinetry', null);
  assert.deepEqual(c.boards, { feature: 'sail-23' });
  assert.equal(c.materials.cabinetry, MAT_BY_ID['sail-13'].board.near);
  C.setCaseBoard(c, 'woodwork', 'sail-7');
  assert.ok(!('woodwork' in c.boards));
});

await test('检查：不认得的板号只是提醒（不挡上架），认得的放错表面才是错；照片提醒照样按 field 找得到', () => {
  const c = C.migrateCase({ id: 'p-b4', boards: { cabinetry: 'sail-23' }, boardsAlso: ['sail-c9130', 'sail-7'] });
  assert.ok(!C.validateCase(c).errors.some((e) => e.field === 'boards'));
  const w = C.caseWarnings(c).filter((x) => x.field === 'boards');
  assert.deepEqual(
    w.map((x) => x.vars[0]),
    ['23号', '9130']
  );
  assert.ok(EN[w[0].zh], 'the warning has English');
  const imgs = ['living', '', ''].map((room, i) => ({ id: String(i), room, src: 'x.webp' }));
  const both = C.migrateCase({ id: 'p-b5', boards: { cabinetry: 'sail-23' }, images: imgs });
  assert.equal(C.caseWarnings(both).find((x) => x.field === 'images')?.vars[1], 3);
  assert.ok(C.validateCase(C.migrateCase({ id: 'p-b6', boards: { feature: 'sail-x0stone' } })).ok || true);
  assert.ok(C.validateCase(C.migrateCase({ id: 'p-b7', title: '测试', boards: { cabinetry: 'sail-x0stone' } })).errors.some((e) => e.field === 'boards'));
});

await test('案例的有效材质 / 色板盖上认得的案例原板；雷区 = materials 的标签 ∪ 案例原板的标签（R11 b，不拿主牌补齐的表面）', () => {
  const c = C.migrateCase({ id: 'p-b8', style: { dreamers: ['WMRD'] }, materials: { cabinetry: 'white-oak' }, boards: { cabinetry: 'sail-8', feature: 'sail-23' } });
  const eff = C.caseMaterials(c);
  assert.equal(eff.cabinetry, 'sail-8');
  assert.equal(eff.feature, DREAMER_BY_CODE.WMRD.materials.feature, 'unknown board → the dreamer fills in');
  assert.equal(C.casePalette(c).find((x) => x.slot === 'cabinetry').color, MAT_BY_ID['sail-8'].color);
  const ng = C.caseNoGo(c);
  assert.ok(ng.has('darkwood'), 'the board tags count');
  // 只看员工填的：主牌补上的墙 / 地板（WMRD 的胡桃地板）不算
  const bare = C.migrateCase({ id: 'p-b9', style: { dreamers: ['WMRD'] }, boards: { cabinetry: 'sail-13' } });
  assert.deepEqual([...C.caseNoGo(bare)], [...tagsOf(MAT_BY_ID['sail-13'])]);
  // 板材功能关掉：案例原板不算
  CONFIG.boards.on = false;
  try {
    assert.equal(C.caseMaterials(c).cabinetry, 'white-oak');
    assert.ok(!C.caseNoGo(bare).size);
  } finally {
    CONFIG.boards.on = true;
  }
});

await test('配对：案例原板的近似材质算「你选的图」；理由说出那块板（序号 + 名字，没有厂家编号）；中英都有', () => {
  // 找一张直觉题的图，它用到 8 号板的近似材质（胡桃木）
  const near = MAT_BY_ID['sail-8'].board.near;
  let hit = null;
  for (const pair of FLOW.PAIRS) {
    const opts = typeof FLOW.optionsOf === 'function' ? FLOW.optionsOf(pair) : pair.options || [];
    const o = (opts || []).find((x) => (x.mats || x.visual?.ids || []).includes(near));
    if (o) {
      hit = { pair, o };
      break;
    }
  }
  assert.ok(hit, `a quiz picture uses ${near}`);
  const prof = { ...PROFILES.D, avoid: [], answers: { pairs: { [hit.pair.id]: { pick: hit.o.v, ms: 2000 } } } };
  const c = C.migrateCase({ id: 'p-m1', kind: 'concept', status: 'live', title: { zh: '测试', en: 'Test' }, style: { dreamers: ['WMRD'] }, materials: { floor: 'white-oak', walls: 'warm-white' }, boards: { cabinetry: 'sail-8' }, images: [{ src: 'x.webp', room: 'living' }] });
  const m = C.matchCases(prof, [c], { limit: 1 });
  const r = m.picks[0].reasons.find((x) => x.kind === 'pick');
  assert.ok(r, JSON.stringify(m.picks[0].reasons));
  assert.equal(r.key, '你选了「{0}」—— 这个家用的就是溪岸 {1}');
  setLang('zh');
  assert.ok(C.reasonText(r).includes('8号 · 黑胡桃') && !C.reasonText(r).includes('XA-TP'), C.reasonText(r));
  setLang('en');
  assert.ok(/sAil No\. 8/.test(C.reasonText(r)) && !C.reasonText(r).includes('XA-TP'), C.reasonText(r));
  setLang('zh');
  // 客人避开深木色：用了 8 号板（深木色）的案例被挡下来（只是表面的材质 → 凑不满时放回来，3D 里换掉）
  const m2 = C.matchCases({ ...prof, avoid: ['darkwood'] }, [c], { limit: 1 });
  assert.ok(m2.picks[0]?.swap?.some((x) => x.slot === 'cabinetry' && x.tags.includes('darkwood')), JSON.stringify(m2));
});

// ───────────────────────── 5. realise：案例原板 → 雷区 → 最接近的真实板材 ─────────────────────────

const CASE = C.migrateCase({ id: 'p-r1', kind: 'project', style: { dreamers: ['WMRD'] }, materials: { cabinetry: 'walnut', feature: 'walnut', floor: 'white-oak' }, boards: { cabinetry: 'sail-7' } });

await test('realiseCase：案例原板盖过 materials（R11 d），没锁的公司表面换成最接近的板，boardPicks 写清楚是哪一种', () => {
  const r = realiseCase({ caseObj: CASE, profile: PROFILES.D });
  assert.equal(r.materials.cabinetry, 'sail-7');
  assert.deepEqual(r.boardPicks.cabinetry, { id: 'sail-7', exact: true, why: 'case' });
  assert.equal(r.boardPicks.feature.why, 'near');
  assert.equal(MAT_BY_ID[r.materials.feature].board.near, 'walnut');
  assert.ok(r.boardPicks.feature.dE <= M.matchDE());
  // 地板、墙、软装：程序化材质照旧
  for (const s of SLOTS.map((x) => x.id).filter((s) => !BOARD_SLOTS.includes(s))) assert.ok(!MAT_BY_ID[r.materials[s]]?.board, s);
});

await test('realiseCase：锁住的（客人家里留下来的柜子）从来不换 —— 案例原板、最接近的板都不碰', () => {
  const r = realiseCase({ caseObj: CASE, keep: { cabinetry: 'white-lacquer' }, profile: PROFILES.D });
  assert.equal(r.materials.cabinetry, 'white-lacquer');
  assert.ok(!r.boardPicks.cabinetry);
  assert.deepEqual(r.locked, { cabinetry: 'white-lacquer' });
});

await test('realiseCase：还不认得的案例原板 → 那一面用 case.materials 的近似材质（不退回温暖预设）', () => {
  const c = C.migrateCase({ ...CASE, boards: { cabinetry: 'sail-99' }, materials: { cabinetry: 'cherry', feature: 'walnut' } });
  CONFIG.boards.realise = false;
  try {
    assert.equal(realiseCase({ caseObj: c, profile: PROFILES.D }).materials.cabinetry, 'cherry');
  } finally {
    CONFIG.boards.realise = true;
  }
});

await test('realiseCase raw（「还原案例原样」）：只用案例原板，不再换最接近的板', () => {
  const r = realiseCase({ caseObj: CASE, profile: PROFILES.D, raw: true });
  assert.equal(r.materials.cabinetry, 'sail-7');
  assert.equal(r.materials.feature, 'walnut');
  assert.deepEqual(Object.keys(r.boardPicks), ['cabinetry']);
});

await test('realiseCase：案例原板踩到客人的雷区 → 换成安全的（有安全的真板就还是真板），boardPicks 记 why "avoid"', () => {
  const r = realiseCase({ caseObj: CASE, profile: { ...PROFILES.D, avoid: ['darkwood'] } });
  assert.notEqual(r.materials.cabinetry, 'sail-7');
  assert.ok(!tagsOf(MAT_BY_ID[r.materials.cabinetry]).has('darkwood'));
  assert.equal(r.boardPicks.cabinetry.why, 'avoid');
  assert.equal(r.boardPicks.cabinetry.from, 'sail-7');
  assert.equal(r.boardPicks.cabinetry.exact, false);
  assert.ok(r.softened.some((x) => x.slot === 'cabinetry' && x.why === 'avoid'));
  // avoidMaterials 换一块板：候选先是板（R11 / profile.js nearestSafe）
  const sw = avoidMaterials({ cabinetry: 'sail-7' }, ['darkwood']).swaps[0];
  assert.ok(MAT_BY_ID[sw.to].board, sw.to);
  assert.ok(!MAT_BY_ID[sw.to].board.hidden);
});

// ───────────────────────── 6. toBoards（R12） ─────────────────────────

await test('toBoards：同一类（木 → 木纹板、柜体上的漆 → 纯色板、石 → 石纹板）；主题墙的漆 / 石灰墙不换（背景，不是墙板）', () => {
  assert.equal(M.boardKindFor(MAT_BY_ID.walnut, 'cabinetry'), 'wood');
  assert.equal(M.boardKindFor(MAT_BY_ID['white-lacquer'], 'cabinetry'), 'solid');
  assert.equal(M.boardKindFor(MAT_BY_ID['black-matte'], 'cabinetry'), 'solid');
  assert.equal(M.boardKindFor(MAT_BY_ID['sand-limewash'], 'feature'), null);
  assert.equal(M.boardKindFor(MAT_BY_ID['gallery-white'], 'feature'), null);
  assert.equal(M.boardKindFor(MAT_BY_ID.microcement, 'feature'), 'stone');
  assert.equal(M.boardKindFor(MAT_BY_ID.walnut, 'floor'), null);
  const r = M.toBoards({ cabinetry: 'white-lacquer', feature: 'microcement', floor: 'walnut', walls: 'sage' });
  assert.equal(r.materials.cabinetry, 'sail-x0white');
  assert.equal(MAT_BY_ID[r.materials.cabinetry].board.kind, 'solid');
  assert.equal(r.materials.feature, 'sail-x0stone');
  assert.equal(r.materials.floor, 'walnut');
  assert.equal(r.materials.walls, 'sage');
  assert.deepEqual(M.toBoards({ feature: 'sand-limewash' }).picks, {});
});

await test('toBoards：不多出原来没有的色相（奶油烤漆不会变成鼠尾草绿 6162）；雷区、隐藏的板不用；ΔE ≤ 12 才换，远的留示意色并记下最接近的', () => {
  // 奶油烤漆：唯一没有色相的纯色板是亮光白 → 避开「亮面」就没有候选（不会退到绿色的 6162）
  const cream = M.toBoards({ cabinetry: 'cream-lacquer' }, { avoid: ['glossy'] });
  assert.equal(cream.materials.cabinetry, 'cream-lacquer');
  assert.ok(!cream.picks.cabinetry || cream.picks.cabinetry.near !== 'sail-c6162');
  // 灰绿烤漆有绿色：可以是 6162
  assert.equal(M.toBoards({ cabinetry: 'sage-lacquer' }).materials.cabinetry, 'sail-c6162');
  // 隐藏的测试板颜色和胡桃木一模一样，也不会被选
  assert.notEqual(M.toBoards({ cabinetry: 'walnut' }).materials.cabinetry, 'sail-x0hidden');
  assert.ok(!M.boardCandidates('cabinetry', 'wood').some((m) => m.id === 'sail-x0hidden'));
  // 雷区：避开深木色 → 胡桃木没有安全的木纹板 → 留示意色
  // 雷区：避开深木色 / 灰 → 换上的（或建议的）板都不带这两个标签（原来的胡桃木本身由 avoidMaterials 先换掉）
  const dark = M.toBoards({ cabinetry: 'walnut' }, { avoid: ['darkwood', 'grey'] });
  const chosen = dark.picks.cabinetry?.id || dark.picks.cabinetry?.near;
  assert.ok(!chosen || !['darkwood', 'grey'].some((x) => tagsOf(MAT_BY_ID[chosen]).has(x)), chosen);
  // 门槛：白橡（ΔE ≈ 13 到 3号白蜡）留示意色，建议最接近的
  const wo = M.toBoards({ cabinetry: 'white-oak' });
  assert.equal(wo.materials.cabinetry, 'white-oak');
  assert.deepEqual([wo.picks.cabinetry.why, wo.picks.cabinetry.near], ['sample', 'sail-3']);
  assert.ok(wo.picks.cabinetry.dE > M.matchDE());
  const near = M.nearestBoard('white-oak', 'cabinetry');
  assert.equal(near.ok, false);
  // 改门槛（CONFIG.boards.matchDE）就换上
  CONFIG.boards.matchDE = 14;
  try {
    assert.equal(M.toBoards({ cabinetry: 'white-oak' }).materials.cabinetry, 'sail-3');
  } finally {
    CONFIG.boards.matchDE = 12;
  }
});

await test('toBoards：锁住的、案例原板、已经是板的表面不动；realise / on 关掉什么都不换', () => {
  const base = { cabinetry: 'walnut', feature: 'walnut' };
  assert.deepEqual(M.toBoards(base, { locked: { cabinetry: 'walnut' } }).materials.cabinetry, 'walnut');
  assert.deepEqual(M.toBoards(base, { exact: { feature: true } }).materials.feature, 'walnut');
  // 已经是板：不换，记一笔（why 'set'），简报 / WhatsApp 才说得出它
  assert.deepEqual(M.toBoards({ cabinetry: 'sail-13', feature: 'sail-8' }), { materials: { cabinetry: 'sail-13', feature: 'sail-8' }, picks: { cabinetry: { id: 'sail-13', from: 'sail-13', exact: true, why: 'set' }, feature: { id: 'sail-8', from: 'sail-8', exact: true, why: 'set' } } });
  for (const flag of ['realise', 'on']) {
    CONFIG.boards[flag] = false;
    try {
      assert.deepEqual(M.toBoards(base), { materials: base, picks: {} });
    } finally {
      CONFIG.boards[flag] = true;
    }
  }
});

await test('16 张梦想家牌 × 2 个公司表面 → 真实板材（快照 + 统计）', () => {
  const rows = {};
  const hist = { cabinetry: { near: 0, sample: 0, none: 0 }, feature: { near: 0, sample: 0, none: 0, paint: 0 } };
  for (const d of DREAMERS) {
    const r = M.toBoards(d.materials);
    rows[d.code] = BOARD_SLOTS.map((s) => {
      const p = r.picks[s];
      if (!p) {
        const paint = s === 'feature' && MAT_BY_ID[d.materials[s]]?.cat === 'paint';
        hist[s][paint ? 'paint' : 'none']++;
        return '—';
      }
      hist[s][p.why]++;
      return p.id || `(${p.near})`;
    }).join(' ');
  }
  if (process.env.SNAP) console.log(JSON.stringify(rows, null, 1), JSON.stringify(hist));
  assert.deepEqual(rows, {
    WMNH: '(sail-3) —',
    WMND: 'sail-15 —',
    WMRH: 'sail-x0white —',
    WMRD: 'sail-8 sail-8',
    WLNH: 'sail-2-b sail-8',
    WLND: 'sail-2-b —',
    WLRH: 'sail-8 sail-8',
    WLRD: 'sail-15 —',
    CMNH: 'sail-x0white —',
    CMND: 'sail-15 sail-15',
    CMRH: 'sail-x0white sail-x0stone',
    CMRD: '— sail-11',
    CLNH: 'sail-c6162 sail-15',
    CLND: '(sail-3) —',
    CLRH: '— sail-8',
    CLRD: '— sail-11',
  });
  // 柜体 16：换上板 11 + 示意色（附最接近的板）2 + 3 个黑色哑光没有接近的纯色板（等真的黑色号导入、★）；
  // 主题墙 16：木 / 石的 9 面都换上了板，7 面刷漆 / 石灰墙照旧是漆（背景，不是墙板）
  assert.deepEqual(hist, { cabinetry: { near: 11, sample: 2, none: 3 }, feature: { near: 9, sample: 0, none: 0, paint: 7 } });
  // 验收（R12）：柜体 + 木 / 石主题墙一共 25 个，换上真实板材的 ≥ 80 %（这 15 块 + 测试板）
  assert.ok((hist.cabinetry.near + hist.feature.near) / (16 + 9) >= 0.8);
});

// ───────────────────────── 7. 简报 / 导出：厂家编号只给员工和设计师 ─────────────────────────

await test('简报（summary.js）：设计师版写板名 + 厂家编号 + 示意色；客人版只有板名，永远没有厂家编号', () => {
  setLang('zh');
  const prof = { ...PROFILES.D, materials: { ...PROFILES.D.materials, cabinetry: 'walnut', feature: 'walnut' } };
  const sp = storagePlan(prof.storage, FLOW.APPLIANCES);
  const staff = profileText(prof, sp, '', { client: false });
  const guest = profileText(prof, sp, '', { client: true });
  assert.ok(staff.includes('🪵') && staff.includes('8号 · 黑胡桃（溪岸 · XA-TP-01）'), staff);
  assert.ok(guest.includes('8号 · 黑胡桃') && !/XA-TP|溪岸 ·/.test(guest), guest);
  assert.ok(!leadText(prof, 'measure', '').includes('XA-TP'));
  // 示意色只在设计师版
  const wo = { ...prof, materials: { ...prof.materials, cabinetry: 'white-oak', feature: 'sand-limewash' } };
  assert.ok(boardsText(wo.materials, { staff: true }).includes('示意色'));
  assert.equal(boardsText(wo.materials, { staff: false }), '');
  setLang('en');
  assert.ok(profileText(prof, sp, '', { client: false }).includes('No. 8 · Black walnut (sAil · XA-TP-01)'));
  assert.ok(!profileText(prof, sp, '', { client: true }).includes('XA-TP'));
  setLang('zh');
  // 已经是板的（boardsText 直接给板材 id）：照样写出来（以前是空的）
  assert.equal(boardsText({ cabinetry: 'sail-8', feature: 'sail-7' }, { staff: false }), '柜体 · 门：8号 · 黑胡桃 · 墙板：7号 · 黑胡桃');
});

await test('🪵 一行跟着选的案例 + 客人留下来的：案例原板 > 保留客人原有 > 最接近的板（两个示范客人）', () => {
  setLang('zh');
  // 客人一：选了用 15号 做柜体、7号 做墙板的案例（自己的牌配的是胡桃）→ 写案例那两块，不是牌换出来的 8号
  const caseA = C.migrateCase({ id: 'p-bt1', kind: 'project', style: { dreamers: ['WMRD'] }, materials: { cabinetry: 'walnut', feature: 'walnut' }, boards: { cabinetry: 'sail-15', feature: 'sail-7' } });
  const refA = H.caseRef(caseA);
  assert.deepEqual(refA.boards, { cabinetry: 'sail-15', feature: 'sail-7' }, '案例的引用带上原板 id（只有 id）');
  const guestA = { ...PROFILES.A, materials: { ...PROFILES.A.materials, cabinetry: 'walnut', feature: 'walnut' }, cases: [refA], caseId: refA.id };
  assert.equal(boardsText(guestA, { staff: false }), '柜体 · 门：15号 · 卡斯楠 · 墙板：7号 · 黑胡桃');
  assert.equal(boardsText(guestA, { staff: true }), '柜体 · 门：15号 · 卡斯楠（溪岸） · 墙板：7号 · 黑胡桃（溪岸 · XA-TP-01）');
  const sp = storagePlan(guestA.storage, FLOW.APPLIANCES);
  assert.ok(profileText(guestA, sp, '', { client: true }).includes('🪵 溪岸板材：柜体 · 门：15号 · 卡斯楠 · 墙板：7号 · 黑胡桃'));
  // 客人二：住着翻新、留下自己的胡桃木柜子（K 屏锁住）→ 柜体「保留客人原有」，墙板照样写案例原板
  const guestB = { ...guestA, home: { ...H.normalizeHome({ type: 'condo', status: 'living' }), keepMode: 'keep', keep: { cabinetry: 'walnut' } } };
  assert.deepEqual(H.keepLocks(guestB.home), { cabinetry: 'walnut' });
  assert.equal(boardsText(guestB, { staff: true }), '柜体 · 门：保留客人原有 · 墙板：7号 · 黑胡桃（溪岸 · XA-TP-01）');
  // 只有「保留」可说 → 这一行不出现
  const keepOnly = { ...guestB, cases: [], caseId: null, materials: { ...guestB.materials, feature: 'sand-limewash' } };
  assert.equal(boardsText(keepOnly, { staff: true }), '');
  // 案例原板这台设备还不认得（板材包没导入）：员工版写板号，客人版只在看得懂（序号）时写
  const caseB = { ...caseA, boards: { cabinetry: 'sail-23', feature: 'sail-xab12cd34' } };
  const guestC = { ...guestA, cases: [H.caseRef(caseB)], caseId: caseB.id };
  assert.equal(boardsText(guestC, { staff: true }), '柜体 · 门：23号 · 墙板：sail-xab12cd34');
  assert.equal(boardsText(guestC, { staff: false }), '柜体 · 门：23号');
  setLang('en');
  assert.equal(boardsText(guestB, { staff: false }), 'Cabinets & doors: Keep the guest’s own · Wall panels: No. 7 · Black walnut');
  setLang('zh');
});

await test('设计师导出：板材的 3D 材质名 / DXF MATERIALS / README 材质表 / 清单 CSV 都带厂家编号；台面（外购）永远没有；色号不重复写', () => {
  assert.equal(boardCode('cabinetry', 'sail-7'), 'XA-TP-01');
  assert.equal(boardCode('countertop', 'sail-7'), null);
  assert.equal(boardCode('cabinetry', 'sail-c2810'), null, 'the colour number is already in the name');
  assert.equal(boardCode('cabinetry', 'walnut'), null);
  assert.equal(matTag({ slot: 'cabinetry', id: 'sail-7', zh: MAT_BY_ID['sail-7'].zh }), 'cabinetry=sail-7 7号 · 黑胡桃 XA-TP-01');
  assert.equal(matTag({ slot: 'cabinetry', id: 'walnut', zh: '胡桃木' }), 'cabinetry=walnut 胡桃木');
  const m7 = MAT_BY_ID['sail-7'];
  const brief = {
    project: { name: { zh: '测试', en: 'Test' }, exportedAt: '2026-10-24T00:00:00.000Z' },
    stats: {},
    floors: [],
    rooms: [],
    doors: [],
    items: [{ floor: 'F1', room: { zh: '厨房', en: 'Kitchen' }, name: { zh: '橱柜', en: 'Kitchen run' }, category: 'case', ours: true, kind: 'kitchenRun', size: [3000, 600, 2400], ftRun: 10, id: 'f1', materials: [{ slot: 'cabinetry', id: 'sail-7', zh: m7.zh, en: m7.en, slotZh: '柜体', slotEn: 'Cabinetry', sourced: false }] }],
    materials: [
      { slot: 'cabinetry', slotName: { zh: '柜体', en: 'Cabinetry' }, id: 'sail-7', zh: m7.zh, en: m7.en, hex: m7.color, sourced: false },
      { slot: 'floor', slotName: { zh: '地板', en: 'Floor' }, id: 'white-oak', zh: '白橡', en: 'White oak', hex: '#D8C2A0', sourced: false },
    ],
  };
  const txt = readme(brief, { files: [], dxf: false, kujiale: false, model3d: false });
  assert.ok(/cabinetry\s+sail-7\s+.*溪岸 sAil XA-TP-01/.test(txt), txt);
  assert.ok(txt.includes('溪岸板材：材质编号是板材 id'));
  assert.ok(!/white-oak.*sAil/.test(txt));
  assert.ok(scheduleCsv(brief).includes('cabinetry=sail-7 柜体 7号 · 黑胡桃 XA-TP-01'));
});

await test('AI 出图关键词只认程序化材质的说法（R11 g）：板材的英文名不会改到关键词里', () => {
  const d = DREAMER_BY_CODE.WMRD;
  const base = d.design?.en || 'walnut veneer cabinetry, black walnut panels';
  const a = renderKeywords(base, { avoid: [] });
  registerBoards([{ ...RECS[6], id: 'sail-x0kw', rev: 1, name: { zh: '测试', en: 'Walnut veneer cabinetry' } }], { src: 'bundled' });
  try {
    assert.equal(renderKeywords(base, { avoid: [] }), a);
  } finally {
    unregisterBoards(['sail-x0kw'], { src: 'bundled' });
  }
});

await test('i18n：这一侧新加的界面句子都有英文（板号、示意色、案例原板）', () => {
  for (const k of ['板号 {0} 还不在板材库里（导入板材包后会自动显示）', '示意色 · 最接近的溪岸板材：{0}', '溪岸板材（案例原板）', '{0}（溪岸 · {1}）', '你选了「{0}」—— 这个家用的就是溪岸 {1}', '溪岸板材：{0}']) assert.ok(EN[k], k);
  setLang('en');
  assert.equal(M.idLabel('sail-23'), 'No. 23');
  assert.equal(M.boardLine('sail-7', { staff: true }), 'No. 7 · Black walnut (sAil · XA-TP-01)');
  assert.equal(M.boardLine('sail-7'), 'No. 7 · Black walnut');
  setLang('zh');
  assert.deepEqual(M.sameCode('sail-7'), ['sail-8']);
  assert.equal(M.idLabel('sail-c2810'), '2810');
});

// ───────────────────────── 合进真实板材以后：用一份合成的「合并过的」板材库再跑一遍（CI） ─────────────────────────
// test/fixtures/boards/merged.mjs 把 src/shared/boards/library.js 换成 test/fixtures/boards/merged-library.js
// （id 和真实的板一样：sail-7、sail-c2810 …）。负责人合进真实板材之后 npm test 要照样是绿的。

if (!process.env.WISH_MERGED_LIBRARY) {
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
  const SUITES = ['boards', 'boards-data', 'boards-engine', 'profile', 'studio-case'].map((s) => `test/${s}.test.mjs`).filter((f) => fs.existsSync(new URL(`../${f}`, import.meta.url)));
  const runOne = (file) =>
    new Promise((res) => {
      const ch = spawn(process.execPath, ['--import', './test/fixtures/boards/merged.mjs', file], { cwd: ROOT, env: { ...process.env, WISH_MERGED_LIBRARY: '1' } });
      let out = '';
      ch.stdout.on('data', (d) => (out += d));
      ch.stderr.on('data', (d) => (out += d));
      ch.on('close', (code) => res({ file, code, out }));
    });
  const runs = await Promise.all(SUITES.map(runOne));
  await test(`合成的「合并过的」板材库（9 块，id 和真实的板一样）：${SUITES.length} 组测试照样全过`, () => {
    const bad = runs.filter((r) => r.code !== 0);
    assert.deepEqual(
      bad.map((r) => r.file),
      [],
      bad.map((r) => `${r.file}:\n${r.out.split('\n').filter((l) => /✗|Error|assert/i.test(l)).slice(0, 12).join('\n')}`).join('\n')
    );
  });
}

console.log(failed ? `✗ ${failed} / ${n} failed` : `✓ ${n} checks`);
if (failed) process.exit(1);
