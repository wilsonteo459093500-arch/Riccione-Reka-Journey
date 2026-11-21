// 柜子细节 · 第 2a 阶段（src/studio/cabinet/）：分组和「没填就照旧」的规则、4 个一键搭配（板材照手册）、
// furniture.js 的口子（没装 = 原来的颜色位，一个新材质都不建）、引擎那一半（每组一个材质、原地换、重建、卸掉还原）。
// 全部在 Node 里跑（假的材质库 / 假的引擎；真的浏览器检查在 scripts/walk-pixels.mjs --check）。
// 跑：node test/cabinet.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { MAT_BY_ID, MATERIALS, registerBoards, BOARDS, fits } from '../src/shared/materials.js';
import { resetBoards, normRecord, boardLabel } from '../src/shared/boards/library-api.js';
import { CATALOG, CAB, buildItem, useLib } from '../src/studio/engine/furniture.js';
import { OFFER_ITEMS } from '../src/studio/offer.js';
import {
  GROUPS,
  KIND_GROUP,
  PARTS,
  CHAIN,
  SEED,
  PRESETS,
  decide,
  parseKey,
  matIdOf,
  partInfo,
  groupsIn,
  cleanCab,
  setPart,
  cabMatIds,
  seedId,
  seedKeyOf,
  seedRecord,
  realOf,
  applyPreset,
  presetOf,
  presetBoards,
} from '../src/studio/cabinet/model.js';

let n = 0;
let failed = 0;
async function test(name, fn) {
  n++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 6).join('\n    ')}`);
  }
}

console.log('柜子细节 · 每组一个色（cabinet）');
resetBoards();

const HOME = [
  { id: 'k1', kind: 'kitchenRun', x: 0, z: 0, w: 3 },
  { id: 't1', kind: 'tallUnit', x: 0, z: 0 },
  { id: 'i1', kind: 'island', x: 0, z: 0 },
  { id: 'tv1', kind: 'tvWall', x: 0, z: 0 },
  { id: 'w1', kind: 'wardrobe', x: 0, z: 0 },
  { id: 'w2', kind: 'wardrobe', x: 0, z: 0 },
  { id: 's1', kind: 'shoeCabinet', x: 0, z: 0 },
  { id: 'b1', kind: 'bookshelf', x: 0, z: 0 },
  { id: 'v1', kind: 'vanity', x: 0, z: 0 },
  { id: 'd1', kind: 'displayCabinet', x: 0, z: 0 },
  { id: 'sofa1', kind: 'sofa', x: 0, z: 0 },
  { id: 'dr1', kind: 'dresser', x: 0, z: 0, key: 'woodwork' },
];
const MATS = { cabinetry: 'light-oak', woodwork: 'walnut', feature: 'white-oak', floor: 'smoked-oak' };

// ───────────────────────── 规则 ─────────────────────────

await test('groups: every custom cabinet the firm makes has a group; loose furniture has none', () => {
  for (const kind of Object.keys(KIND_GROUP)) {
    assert.ok(CATALOG[kind], `${kind} is in the catalogue`);
    assert.ok(OFFER_ITEMS.includes(kind), `${kind} is something the firm makes (offer.js)`);
    assert.ok(GROUPS.some((g) => g.id === KIND_GROUP[kind]));
  }
  // 我们做的定制柜全部分了组；墙板（featureWall）留给后面的阶段
  for (const kind of OFFER_ITEMS) if (kind !== 'featureWall') assert.ok(KIND_GROUP[kind], `${kind} has a group`);
  for (const kind of ['sofa', 'dresser', 'nightstand', 'kidsBed', 'fridge', 'washer', 'bed']) assert.equal(decide({ v: 1, g: {} }, kind, 'b', 'cabinetry'), null, `${kind}: not ours`);
  assert.deepEqual(
    groupsIn(HOME).map((g) => `${g.id}×${g.count}`),
    ['base×1', 'wall×1', 'tall×1', 'island×1', 'tv×1', 'wardrobe×2', 'shoe×1', 'book×1', 'vanity×1', 'other×1'],
  );
  assert.deepEqual(groupsIn([{ kind: 'kitchenRun', upper: false }]).map((g) => g.id), ['base'], 'a run without wall cabinets has no wall group');
  assert.equal(groupsIn(HOME).find((g) => g.id === 'book').slot, 'woodwork', 'auto-placed bookshelf follows woodwork');
  assert.equal(groupsIn([{ kind: 'bookshelf', key: 'cabinetry' }])[0].slot, 'cabinetry', 'a bookshelf the designer added follows cabinetry');
  assert.deepEqual(groupsIn(null), []);
});

await test('「没填就照旧」: an unset part follows the chain, then the slot it always used; the plinth stays black', () => {
  // 没有设定：柜体 / 柜门 / 抽屉面 → 跟着原来的颜色位；踢脚 → 原来的固定材质
  assert.equal(decide(undefined, 'wardrobe', 'd', 'cabinetry'), 'cab:wardrobe:~cabinetry');
  assert.equal(decide(undefined, 'wardrobe', 'b', 'cabinetry'), 'cab:wardrobe:~cabinetry');
  assert.equal(decide(undefined, 'wardrobe', 'p', 'black'), null);
  assert.equal(decide(undefined, 'kitchenRun', 'd', 'cabinetry', 'wall'), 'cab:wall:~cabinetry');
  assert.equal(decide(undefined, 'kitchenRun', 'w', 'cabinetry'), 'cab:base:~cabinetry');
  assert.equal(decide(undefined, 'bookshelf', 'o', 'woodwork'), 'cab:book:~woodwork');
  assert.equal(decide(undefined, 'shoeCabinet', 'o', 'feature'), null, 'the shoe-cabinet niche back stays part of the feature wall until the group is set');
  // 设了柜门：别的部分跟柜门
  const c = { v: 1, g: { base: { door: 'walnut' }, shoe: { door: 'walnut', body: 'charcoal' } } };
  for (const p of ['d', 'w', 'b', 's']) assert.equal(decide(c, 'kitchenRun', p, 'cabinetry'), 'cab:base:door', p);
  assert.equal(decide(c, 'kitchenRun', 'p', 'black'), null);
  assert.equal(decide(c, 'kitchenRun', 'd', 'cabinetry', 'wall'), 'cab:wall:~cabinetry', 'the wall cabinets of the same run are another group');
  // 柜体分开：开放格跟柜体，侧板、抽屉面跟柜门
  assert.equal(decide(c, 'shoeCabinet', 'b', 'cabinetry'), 'cab:shoe:body');
  assert.equal(decide(c, 'shoeCabinet', 'o', 'feature'), 'cab:shoe:body');
  assert.equal(decide(c, 'shoeCabinet', 's', 'cabinetry'), 'cab:shoe:door');
  assert.equal(decide(c, 'shoeCabinet', 'w', 'cabinetry'), 'cab:shoe:door');
  assert.equal(decide({ v: 1, g: { base: { plinth: 'walnut' } } }, 'kitchenRun', 'p', 'black'), 'cab:base:plinth');
  assert.deepEqual(Object.keys(CHAIN).sort(), PARTS.map((p) => p.id).sort());
  // 钥匙 → 材质 id
  assert.deepEqual(parseKey('cab:shoe:body'), { group: 'shoe', part: 'body' });
  assert.deepEqual(parseKey('cab:book:~woodwork'), { group: 'book', follow: 'woodwork' });
  assert.equal(parseKey('cabinetry'), null);
  assert.equal(matIdOf('cab:shoe:body', c, MATS), 'charcoal');
  assert.equal(matIdOf('cab:wall:~cabinetry', c, MATS), 'light-oak');
  assert.equal(matIdOf('cab:book:~woodwork', c, MATS), 'walnut');
  // 面板上显示的
  assert.deepEqual(partInfo(c, MATS, 'shoe', 'open'), { matId: 'charcoal', own: false, from: 'body' });
  assert.deepEqual(partInfo(c, MATS, 'shoe', 'door'), { matId: 'walnut', own: true, from: null });
  assert.equal(partInfo(c, MATS, 'wall', 'door').matId, 'light-oak');
  assert.equal(partInfo(c, MATS, 'wall', 'door').own, false);
  assert.equal(partInfo(c, MATS, 'base', 'plinth').matId, null);
});

await test('editing: set / clear a part; an empty cab disappears (the design is an old design again)', () => {
  let c = setPart(undefined, 'base', 'door', 'walnut');
  assert.deepEqual(c, { v: 1, g: { base: { door: 'walnut' } } });
  c = setPart(c, 'base', 'body', 'charcoal');
  c = setPart(c, 'wall', 'door', 'white-lacquer');
  assert.deepEqual(cabMatIds(c).sort(), ['charcoal', 'walnut', 'white-lacquer']);
  c = setPart(c, 'base', 'body', null);
  c = setPart(c, 'wall', 'door', null);
  assert.deepEqual(c, { v: 1, g: { base: { door: 'walnut' } } });
  assert.equal(setPart(c, 'base', 'door', null), undefined, 'nothing left → no cab block at all');
  assert.deepEqual(setPart(c, 'nope', 'door', 'walnut'), c, 'unknown group ignored');
  assert.deepEqual(setPart(c, 'base', 'nope', 'walnut'), c, 'unknown part ignored');
  assert.equal(cleanCab({ v: 1, g: { base: {}, zzz: { door: 'x' }, wall: { door: '' } } }), undefined);
  assert.equal(cleanCab(null), undefined);
  assert.equal(cleanCab('junk'), undefined);
});

// ───────────────────────── 一键搭配 ─────────────────────────

await test('the six preset boards are the manual’s (name, code, colour, finish as printed) — never invented', () => {
  const seed = JSON.parse(fs.readFileSync(new URL('../src/shared/boards/catalog-seed.json', import.meta.url), 'utf8')).entries;
  assert.equal(Object.keys(SEED).length, 6);
  for (const [key, e] of Object.entries(SEED)) {
    const m = seed.find((x) => x.key === key);
    assert.ok(m, `${key} is in catalog-seed.json`);
    for (const f of ['code', 'name', 'series', 'kind', 'grain', 'finish', 'proc', 'hex']) assert.equal(e[f], m[f], `${key}.${f}`);
    assert.deepEqual(e.codes, m.codes, `${key}.codes`);
    const rec = seedRecord(key);
    assert.ok(normRecord(rec), `${key}: a valid board record`);
    assert.equal(rec.img, false, 'data only, no texture');
    assert.equal(rec.hidden, true, 'never listed in the board dock');
    assert.equal(boardLabel(rec).zh, m.name, 'guests see the name only (no factory code)');
    assert.equal(seedKeyOf(seedId(key)), key);
  }
  assert.equal(seedKeyOf('sail-7'), null);
  assert.equal(seedKeyOf('walnut'), null);
  // 别人给的链接里的方案：'constructor' 这种 id 不能被当成手册的板（以前会让整件柜子建不出来）
  for (const bad of ['constructor', 'toString', '__proto__', 'hasOwnProperty', '', null, undefined, 7, {}]) {
    assert.equal(seedKeyOf(bad), null, String(bad));
    assert.equal(realOf(bad, BOARDS), bad);
  }
});

await test('presets use the boards the owner chose on 2026-11-21', () => {
  const by = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
  const names = (p) => Object.fromEntries(Object.entries(p.roles).map(([r, k]) => [r, `${SEED[k].name} ${SEED[k].code}`]));
  assert.deepEqual(PRESETS.map((p) => p.zh), ['全屋统一', '上浅下深', '双色厨房', '原木侘寂']);
  assert.deepEqual(names(by.updown), { light: '归山云 AK096AL', dark: '归雁胡桃 AG275A' });
  assert.deepEqual(names(by.kitchen), { upper: '晓山白 AG294A', lower: '绿山墙 AG150A' });
  assert.deepEqual(names(by.wabi), { wood: '白橡直纹 XA-TP-03', dark: '黑松橡 AK141A' });
  assert.deepEqual(by.one.roles, {}, '「全屋统一」 picks no board: it is whatever is on the cabinets now');
  assert.deepEqual(presetBoards(by.updown).map((b) => b.id), ['sail-m-pb-ak096', 'sail-m-pb-ag275']);
  // 每个角色都用得到；每个 set 里的组都是真的组
  for (const p of PRESETS) for (const [g, parts] of Object.entries(p.set)) {
    assert.ok(GROUPS.some((x) => x.id === g), `${p.id}: ${g}`);
    for (const [part, role] of Object.entries(parts)) assert.ok(p.roles[role] && PARTS.some((x) => x.id === part), `${p.id}: ${g}.${part} → ${role}`);
  }
});

await test('applying presets: only groups this home has; 双色厨房 leaves the other rooms alone; 全屋统一 clears everything', () => {
  const L = 'sail-m-pb-ak096';
  const D = 'sail-m-pb-ag275';
  const up = applyPreset('updown', { furniture: HOME });
  assert.deepEqual(up.g, { base: { door: D }, wall: { door: L }, tall: { door: D }, island: { door: D }, tv: { door: D }, wardrobe: { door: L }, shoe: { door: L }, vanity: { door: D } });
  assert.equal(presetOf(up, HOME), 'updown');
  const small = applyPreset('updown', { furniture: [{ kind: 'wardrobe' }] });
  assert.deepEqual(small.g, { wardrobe: { door: L } }, 'no kitchen → no kitchen groups');
  // 原木侘寂：柜门木纹，柜体和开放格深色
  const wabi = applyPreset('wabi', { furniture: HOME });
  for (const g of Object.keys(wabi.g)) assert.deepEqual(wabi.g[g], { door: 'sail-m-vn-xa-tp-03', body: 'sail-m-pb-ak141', open: 'sail-m-pb-ak141' }, g);
  assert.equal(decide(wabi, 'wardrobe', 's', 'cabinetry'), 'cab:wardrobe:door', 'end panels stay in the door’s wood');
  assert.equal(presetOf(wabi, HOME), 'wabi');
  // 双色厨房：只动厨房
  const two = applyPreset('kitchen', { cab: wabi, furniture: HOME });
  assert.deepEqual(two.g.base, { door: 'sail-m-pb-ag150' });
  assert.deepEqual(two.g.island, { door: 'sail-m-pb-ag150' });
  assert.deepEqual(two.g.wall, { door: 'sail-m-pb-ag294' });
  assert.deepEqual(two.g.tall, { door: 'sail-m-pb-ag294' });
  assert.deepEqual(two.g.wardrobe, wabi.g.wardrobe, 'wardrobes untouched');
  assert.equal(presetOf(two, HOME), 'kitchen');
  // 全屋统一
  assert.equal(applyPreset('one', { cab: two, furniture: HOME }), undefined);
  assert.equal(presetOf(undefined, HOME), 'one');
  assert.equal(presetOf(setPart(undefined, 'base', 'door', 'walnut'), HOME), null, 'a hand-made mix is no preset');
  assert.deepEqual(applyPreset('nope', { cab: up, furniture: HOME }), up);
});

await test('a manual-colour board becomes the real board once one with the same code is imported on this device', () => {
  resetBoards();
  const id = seedId('pb-AG275');
  assert.equal(realOf(id, BOARDS), id, 'not imported → the manual colour');
  registerBoards([{ id: 'sail-t-cab1', rev: 1, code: 'AG275B', name: { zh: '测试胡桃', en: 'Test walnut' }, kind: 'wood', finish: 'matte', hex: '#4A3A2A' }], { src: 'device' });
  assert.equal(realOf(id, BOARDS), 'sail-t-cab1', 'AG275B is one of the manual’s codes for 归雁胡桃');
  assert.equal(realOf(seedId('pb-AK096'), BOARDS), seedId('pb-AK096'), 'another board: still the manual colour');
  assert.equal(realOf('walnut', BOARDS), 'walnut', 'other ids pass through');
  registerBoards([{ id: 'sail-t-cab2', rev: 1, code: 'AK096AL', name: { zh: '测试白', en: 'Test white' }, kind: 'solid', finish: 'matte', hex: '#FCFBF7', hidden: true }], { src: 'device' });
  assert.equal(realOf(seedId('pb-AK096'), BOARDS), seedId('pb-AK096'), 'a hidden board is not used');
  resetBoards();
});

// ───────────────────────── furniture.js 的口子 ─────────────────────────

const fixed = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? t[k] || (t[k] = Object.assign(new THREE.MeshStandardMaterial(), { userData: { fixed: k } })) : undefined) });
function fakeLib() {
  const slots = {};
  const lib = {
    quality: 'fast',
    slots,
    fixed,
    current: {},
    applied: [],
    slot: (k) => slots[k] || (slots[k] = Object.assign(new THREE.MeshStandardMaterial(), { userData: { slot: k } })),
    apply(slot, id) {
      this.current[slot] = id;
      this.applied.push(`${slot}=${id}`);
    },
    highlight() {},
    pulse: () => false,
    trim() {},
    boards: { stand: (id) => (MAT_BY_ID[id] || !/^sail-/.test(String(id || '')) ? id : lib.current.cabinetry) },
  };
  return lib;
}
const meshes = (g) => {
  const out = [];
  g.traverse((o) => o.isMesh && out.push(o));
  return out;
};
const sig = (g) =>
  meshes(g)
    .map((o) => `${o.material.userData.slot || o.material.userData.fixed || o.material.userData.own || o.material.type}:${o.geometry.attributes.position.count}`)
    .sort()
    .join(' ');
const item = (kind, id = `${kind}-1`) => ({ id, kind, x: 0, z: 0, ...(kind === 'kitchenRun' ? { w: 3 } : {}) });

await test('no cabinet settings → every cabinet asks for exactly the slot it always used (nothing new is built)', () => {
  const lib = fakeLib();
  useLib(lib);
  CAB.h = null;
  const before = {};
  for (const kind of Object.keys(CATALOG)) before[kind] = sig(buildItem(item(kind), { wallH: 2.8 }));
  // 装一个只听不答的口子：问到的都是原来的颜色位；建出来的东西和没装时一模一样
  const asked = {};
  CAB.h = (it, part, key, group) => {
    if (typeof part === 'object') return null;
    (asked[it.kind] = asked[it.kind] || []).push([part, key, group || 0]);
    return null;
  };
  for (const kind of Object.keys(CATALOG)) assert.equal(sig(buildItem(item(kind), { wallH: 2.8 })), before[kind], `${kind}: same meshes, same materials`);
  CAB.h = null;
  assert.deepEqual(Object.keys(asked).sort(), Object.keys(KIND_GROUP).sort(), 'only the firm’s cabinets ask');
  for (const [kind, calls] of Object.entries(asked)) {
    for (const [part, key] of calls) {
      assert.ok('bdwpo'.includes(part), `${kind}: part ${part}`);
      assert.ok(['cabinetry', 'woodwork', 'feature', 'black'].includes(key), `${kind}: ${key}`);
      assert.equal(key === 'black', part === 'p', `${kind}: the plinth (and only the plinth) was the fixed black`);
    }
    assert.ok(calls.some((c) => c[0] === 'b'), `${kind} has a carcass`);
  }
  assert.ok(asked.kitchenRun.some((c) => c[2] === 'wall' && c[0] === 'd') && asked.kitchenRun.some((c) => c[2] === 0 && c[0] === 'w'), 'kitchen run: wall cabinets are their own group, the hob stack is drawers');
  assert.ok(asked.bookshelf.every((c) => c[1] === 'woodwork' || c[1] === 'black'), 'auto-placed bookshelf: woodwork');
  assert.ok(buildItem({ ...item('bookshelf'), key: 'cabinetry' }, {}) && true);
  // 没有新的颜色位 / 材质
  assert.ok(!Object.keys(lib.slots).some((k) => k.startsWith('cab:')));
});

// ───────────────────────── 引擎那一半 ─────────────────────────

globalThis.window = globalThis.window || { addEventListener() {}, removeEventListener() {} };
const { CabRuntime, ensureSeeds } = await import('../src/studio/cabinet/runtime.js');

function fakeEngine(lib, furniture) {
  const e = {
    lib,
    itemData: new Map(),
    items: new Map(),
    builds: [],
    renderer: { domElement: {} },
    dirty: false,
    // 和 Engine.setFurniture 一样：没变的不动，变了 / 新的重建，不在名单里的拿掉
    setFurniture(list) {
      const keep = new Set();
      for (const it of list) {
        keep.add(it.id);
        if (this.itemData.has(it.id)) continue;
        this.items.set(it.id, buildItem(it, { wallH: 2.8 }));
        this.itemData.set(it.id, it);
        this.builds.push(it.id);
      }
      for (const id of [...this.items.keys()])
        if (!keep.has(id)) {
          this.items.delete(id);
          this.itemData.delete(id);
        }
    },
    /** 换方案（setScene）：整个场景重建 */
    setScene(list) {
      this.items.clear();
      this.itemData.clear();
      this.setFurniture(list);
    },
    hitAt: () => null,
  };
  e.setFurniture(furniture);
  e.builds.length = 0;
  return e;
}
const matsOf = (e, id) => [...new Set(meshes(e.items.get(id)).map((o) => o.material.userData.cabKey || o.material.userData.slot || o.material.userData.fixed || '?'))].sort();

await test('runtime: each group gets its own material; a colour change is applied in place; only cabinets whose answer changed are rebuilt', () => {
  const lib = fakeLib();
  useLib(lib);
  for (const [s, id] of Object.entries(MATS)) lib.apply(s, id);
  const e = fakeEngine(lib, HOME);
  const rt = new CabRuntime(e);
  rt.activate();
  rt.sync({ cab: undefined, materials: MATS, furniture: HOME });
  assert.ok(MAT_BY_ID[seedId('pb-AK096')]?.board, 'the six manual boards are known materials');
  assert.ok(fits(seedId('vn-XA-TP-03'), 'cabinetry'));
  assert.ok(!BOARDS.some((b) => seedKeyOf(b.id)), '…but they are not in the board library / dock');
  assert.ok(!MATERIALS.some((m) => seedKeyOf(m.id)));
  // 装上：定制柜都重建了一次（换成每组自己的材质），活动家具没动
  assert.deepEqual([...e.builds].sort(), HOME.filter((i) => KIND_GROUP[i.kind]).map((i) => i.id).sort());
  assert.ok(matsOf(e, 'w1').includes('cab:wardrobe:~cabinetry'));
  assert.ok(matsOf(e, 'k1').includes('cab:base:~cabinetry') && matsOf(e, 'k1').includes('cab:wall:~cabinetry'));
  assert.ok(matsOf(e, 'b1').includes('cab:book:~woodwork'));
  assert.ok(!matsOf(e, 'sofa1').some((k) => k.startsWith('cab:')) && !matsOf(e, 'dr1').some((k) => k.startsWith('cab:')), 'loose furniture untouched');
  assert.equal(lib.current['cab:wardrobe:~cabinetry'], 'light-oak');
  assert.equal(lib.slots['cab:wardrobe:~cabinetry'].userData.slot, 'cabinetry', 'slotAt / walk paint / board UV shuffle still see “cabinetry”');
  assert.equal(lib.slots['cab:wardrobe:~cabinetry'].userData.cab, 'wardrobe');
  assert.equal(lib.slots['cab:book:~woodwork'].userData.slot, 'woodwork');
  // 换全屋的柜体色（一键情绪、撤销…）：跟着的组一起换
  lib.apply('cabinetry', 'walnut');
  assert.equal(lib.current['cab:wardrobe:~cabinetry'], 'walnut');
  assert.equal(lib.current['cab:book:~woodwork'], 'walnut', 'woodwork followers keep woodwork');
  lib.apply('woodwork', 'teak');
  assert.equal(lib.current['cab:book:~woodwork'], 'teak');
  assert.equal(lib.current['cab:wardrobe:~cabinetry'], 'walnut');
  lib.apply('cabinetry', 'light-oak');
  lib.apply('woodwork', 'walnut');

  // 上浅下深：有设定的组重建一次（钥匙变了），别的不动
  e.builds.length = 0;
  const up = applyPreset('updown', { furniture: HOME });
  rt.sync({ cab: up, materials: MATS, furniture: HOME });
  assert.deepEqual([...e.builds].sort(), ['i1', 'k1', 's1', 't1', 'tv1', 'v1', 'w1', 'w2'], 'bookshelf / display cabinet not rebuilt');
  assert.ok(matsOf(e, 'w1').includes('cab:wardrobe:door'));
  assert.equal(lib.current['cab:wardrobe:door'], seedId('pb-AK096'));
  assert.equal(lib.current['cab:base:door'], seedId('pb-AG275'));
  assert.equal(lib.current['cab:wall:door'], seedId('pb-AK096'));
  assert.ok(!lib.slots['cab:wardrobe:~cabinetry'], 'the follower nobody uses any more is released');
  assert.ok(lib.slots['cab:book:~woodwork']);
  // 只换一组的板材：原地换，一件都不重建
  e.builds.length = 0;
  rt.sync({ cab: setPart(up, 'wardrobe', 'door', 'walnut'), materials: MATS, furniture: HOME });
  assert.deepEqual(e.builds, []);
  assert.equal(lib.current['cab:wardrobe:door'], 'walnut');
  // 这台设备导入了同一个编号的真板材 → 自动换成真的
  registerBoards([{ id: 'sail-t-cab3', rev: 1, code: 'AG275A', name: { zh: '测试胡桃', en: 'Test walnut' }, kind: 'wood', finish: 'matte', hex: '#4A3A2A' }], { src: 'device' });
  rt.sync({ cab: up, materials: MATS, furniture: HOME });
  assert.equal(lib.current['cab:base:door'], 'sail-t-cab3');
  assert.equal(lib.current['cab:wardrobe:door'], seedId('pb-AK096'));
  resetBoards();
  // 别的设备做的方案里有这台设备不认识的板材：先顶一个（不留一块灰板）
  rt.sync({ cab: setPart(up, 'base', 'door', 'sail-999'), materials: MATS, furniture: HOME });
  assert.equal(lib.current['cab:base:door'], 'light-oak');

  // 原木侘寂：柜体是深色、侧板跟柜门 → 柜体两头贴上侧板（多出来的网格），柜门是木纹
  const count = (id) => meshes(e.items.get(id)).length;
  rt.sync({ cab: up, materials: MATS, furniture: HOME });
  const n0 = count('w1');
  rt.sync({ cab: applyPreset('wabi', { furniture: HOME }), materials: MATS, furniture: HOME });
  assert.deepEqual(matsOf(e, 'w1').filter((k) => k.startsWith('cab:')), ['cab:wardrobe:body', 'cab:wardrobe:door']);
  assert.ok(count('w1') >= n0, 'wardrobe: carcass + doors (+ end panels merged into the door material)');
  assert.equal(lib.current['cab:wardrobe:body'], seedId('pb-AK141'));
  assert.equal(lib.current['cab:wardrobe:door'], seedId('vn-XA-TP-03'));
  const box = new THREE.Box3();
  const bodyBox = new THREE.Box3();
  for (const o of meshes(e.items.get('w1'))) {
    o.geometry.computeBoundingBox();
    if (o.material.userData.cabKey === 'cab:wardrobe:door') box.union(o.geometry.boundingBox);
    if (o.material.userData.cabKey === 'cab:wardrobe:body') bodyBox.union(o.geometry.boundingBox);
  }
  assert.ok(box.min.x < bodyBox.min.x && box.max.x > bodyBox.max.x, 'the door-coloured end panels cover both ends of the dark carcass');
  for (const it of HOME) for (const o of meshes(e.items.get(it.id))) assert.ok(!o.parent?.isMesh, `${it.id}: no mesh nested inside another (an end panel would be drawn twice)`);
  // 手改过的链接：材质 id 是 'constructor' / 数字 / 不认识的 —— 不出错，先顶上现在的柜体色
  for (const bad of ['constructor', '__proto__', 'no-such-material']) {
    rt.sync({ cab: { v: 1, g: { wardrobe: { door: bad, body: bad } } }, materials: MATS, furniture: HOME });
    assert.equal(lib.current['cab:wardrobe:door'], 'light-oak', bad);
  }
  rt.sync({ cab: { v: 1, g: { wardrobe: { door: 7, body: {} }, zzz: 3 } }, materials: MATS, furniture: HOME });
  assert.ok(matsOf(e, 'w1').includes('cab:wardrobe:~cabinetry'), 'junk values = not set');
  rt.sync({ cab: 'junk', materials: MATS, furniture: HOME });
  rt.sync({ cab: applyPreset('wabi', { furniture: HOME }), materials: MATS, furniture: HOME });
  assert.ok(matsOf(e, 'b1').includes('cab:book:open') && matsOf(e, 'b1').includes('cab:book:door'), 'bookshelf: dark shelves, wood end boards');

  // 卸掉：柜子回到原来的材质，这里建的全部释放，MatLib 还原
  const apply0 = Object.getPrototypeOf(lib).apply ?? lib.apply;
  rt.deactivate();
  assert.equal(CAB.h, null);
  assert.equal(CAB.drop, null);
  assert.ok(!Object.keys(lib.slots).some((k) => k.startsWith('cab:')));
  assert.ok(!Object.keys(lib.current).some((k) => k.startsWith('cab:')));
  for (const it of HOME) assert.ok(!matsOf(e, it.id).some((k) => k.startsWith('cab:')), `${it.id}: back to the old materials`);
  void apply0;
  assert.equal(sig(e.items.get('w1')), sig(buildItem(HOME[4], { wallH: 2.8 })), 'a wardrobe is exactly the old wardrobe again');
});

await test('runtime: opening another design, then closing — the new design keeps ITS furniture (not the previous design’s)', () => {
  const lib = fakeLib();
  useLib(lib);
  for (const [s, id] of Object.entries(MATS)) lib.apply(s, id);
  const e = fakeEngine(lib, HOME);
  const rt = new CabRuntime(e);
  rt.activate();
  rt.sync({ cab: applyPreset('updown', { furniture: HOME }), materials: MATS, furniture: HOME });
  // StudioApp.loadProjectIntoEngine：引擎先换成另一个方案（这时口子还装着），这个组件随后才卸掉
  const OTHER = [
    { id: 'x1', kind: 'wardrobe', x: 0, z: 0 },
    { id: 'x2', kind: 'sofa', x: 0, z: 0 },
  ];
  e.setScene(OTHER);
  rt.deactivate();
  assert.deepEqual([...e.itemData.keys()].sort(), ['x1', 'x2'], 'the other design’s furniture, nothing from the first');
  assert.ok(!matsOf(e, 'x1').some((k) => k.startsWith('cab:')), 'and its wardrobe is back on the old material');
  assert.ok(!Object.keys(lib.slots).some((k) => k.startsWith('cab:')));
});

await test('runtime: dropping a board on a cabinet changes that group only; a part picked in the panel takes the dock tap', () => {
  const lib = fakeLib();
  useLib(lib);
  for (const [s, id] of Object.entries(MATS)) lib.apply(s, id);
  const e = fakeEngine(lib, HOME);
  const rt = new CabRuntime(e);
  rt.activate();
  rt.sync({ cab: undefined, materials: MATS, furniture: HOME });
  const set = [];
  rt.onSet = (...a) => set.push(a.join('/'));
  ensureSeeds();
  let walking = false;
  e.renderer.domElement = { closest: (sel) => (sel === '.is-walk' && walking ? {} : null) };
  // 没指着柜子、面板上也没选：不接（照原来的，全屋一起换）
  globalThis.document = { elementFromPoint: () => null };
  assert.equal(CAB.drop('walnut', 'cabinetry'), false);
  assert.equal(CAB.drop('walnut', undefined), false);
  assert.equal(CAB.drop('linen', 'upholstery'), false, 'other surfaces are never ours');
  assert.equal(CAB.drop('walnut', 'feature'), false, 'the feature wall is never ours');
  // 鸟瞰：之前点过衣柜，现在把板材拖到标签 / 材质板的「柜体」上（不在画布上）→ 不接：那是换全屋
  rt.ptr = { x: 10, y: 10 };
  rt.tapGroup = 'wardrobe';
  assert.equal(CAB.drop('walnut', 'cabinetry'), false, 'a drop on a UI label is the whole home, not the group tapped earlier');
  // 走进去刷色：先点一下柜子（记下那一组），再在托盘里选
  walking = true;
  assert.equal(CAB.drop('walnut', 'cabinetry'), true);
  assert.deepEqual(set, ['wardrobe/door/walnut']);
  // 点一下才算：拖着转镜头（按下、挪开、抬起）不改记下的那一组；点到不是柜子的地方 = 没有
  e.hitAt = () => ({ material: lib.slots['cab:base:~cabinetry'] });
  rt.onDown({ clientX: 10, clientY: 10, target: e.renderer.domElement });
  rt.onUp({ clientX: 90, clientY: 40 });
  assert.equal(rt.tapGroup, 'wardrobe', 'a look-drag is not a tap');
  rt.onDown({ clientX: 10, clientY: 10, target: e.renderer.domElement });
  rt.onUp({ clientX: 12, clientY: 11 });
  assert.equal(rt.tapGroup, 'base');
  rt.onDown({ clientX: 10, clientY: 10, target: {} });
  rt.onUp({ clientX: 10, clientY: 10 });
  assert.equal(rt.tapGroup, 'base', 'a tap on a panel (the tray) keeps it');
  e.hitAt = () => ({ material: lib.slots.walls });
  rt.onDown({ clientX: 10, clientY: 10, target: e.renderer.domElement });
  rt.onUp({ clientX: 10, clientY: 10 });
  assert.equal(rt.tapGroup, null, 'a tap on a wall clears it');
  assert.equal(CAB.drop('walnut', 'cabinetry'), false);
  walking = false;
  // 拖到画布上的柜子：指着的那一组
  globalThis.document = { elementFromPoint: () => e.renderer.domElement };
  e.hitAt = () => ({ material: lib.slots['cab:base:~cabinetry'] });
  assert.equal(CAB.drop('charcoal', 'cabinetry'), true);
  assert.equal(set[1], 'base/door/charcoal');
  // 面板上选着「地柜 · 柜体」：拖到地柜上 = 柜体；板材栏点一下也是它
  rt.sel = { group: 'base', part: 'body' };
  assert.equal(CAB.drop('white-lacquer', 'cabinetry'), true);
  assert.equal(CAB.drop('white-lacquer', undefined), true);
  assert.deepEqual(set.slice(2), ['base/body/white-lacquer', 'base/body/white-lacquer']);
  // 不能上柜子的（布、石）：不接 —— 原来的路会把它换到该去的表面 / 说为什么不行
  assert.equal(CAB.drop('linen', undefined), false);
  assert.equal(CAB.drop('carrara', 'cabinetry'), false);
  // 柜子是客人家里留下来的（锁住）：不接 —— 原来的路会先问一句
  rt.locked = true;
  assert.equal(CAB.drop('walnut', 'cabinetry'), false);
  assert.equal(CAB.drop('walnut', undefined), false);
  rt.locked = false;
  assert.equal(set.length, 4);
  rt.deactivate();
  delete globalThis.document;
});

console.log(failed ? `✗ ${failed} / ${n} failed` : `✓ ${n} checks`);
if (failed) process.exit(1);
