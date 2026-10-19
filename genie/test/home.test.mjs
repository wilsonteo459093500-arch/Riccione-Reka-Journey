// 「你的家」（src/shared/home.js）+ WhatsApp 的「你的家」几行（src/shared/summary.js）—— SPEC §3、§6、§9.4、§10.3、§15.4。
// 跑法：node test/home.test.mjs（npm test 会一起跑）

import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as H from '../src/shared/home.js';
import { MAT_BY_ID, fits } from '../src/shared/materials.js';
import { buildProfile, storagePlan, insights, unpackJSON } from '../src/shared/profile.js';
import { profileText, homeLines, leadText } from '../src/shared/summary.js';
import { setLang } from '../src/shared/i18n.js';
import * as FLOW from '../src/quiz/flow.js';
import { ROOM_TYPES, templatePlan, TEMPLATES } from '../src/studio/plan/model.js';
import * as C from '../src/shared/cases.js';
import EN from '../src/shared/i18n/en.js';

// Node 没有 localStorage：员工记录（预算）、客人名单都写在这里（和浏览器一样的接口）
const LS = new Map();
globalThis.localStorage = {
  getItem: (k) => (LS.has(k) ? LS.get(k) : null),
  setItem: (k, v) => LS.set(k, String(v)),
  removeItem: (k) => LS.delete(k),
  clear: () => LS.clear(),
};

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

setLang('zh', { reload: false });

/** 一位普通的客人：直觉题选 a，生活、宝藏、雷区都有答案（buildProfile 走真的计分） */
function guest(extra = {}) {
  const pairs = {};
  for (const p of FLOW.PAIRS) pairs[p.id] = { pick: FLOW.optionsOf(p)[0].v, ms: 1800, left: FLOW.optionsOf(p).map((o) => o.v).join('') };
  const a = {
    name: 'Peggy',
    players: 'solo',
    pairs,
    life: { saturday: 'sofa', home: 'drop', cook: 'heavy', bell: 'shoes', who: ['kids', 'cat'] },
    shoes: 40,
    wardrobeDoors: 4,
    wardrobeFit: 'full',
    longHang: 'some',
    books: 6,
    appliances: ['airfryer', 'rice'],
    bulky: ['stroller'],
    ratio: 25,
    ratioTouched: true,
    touched: { shoes: true, wardrobe: true, books: true },
    wishes: ['storage', 'clean', 'kids'],
    splurge: 'kitchen',
    avoid: ['marble', 'pink'],
    oneWish: '玄关不再乱',
    ...extra,
  };
  return buildProfile(a, { host: 'wilson' }, { PAIRS: FLOW.PAIRS, LIFE: FLOW.LIFE });
}

const HOME = {
  ...H.emptyHome(),
  type: 'terrace',
  status: 'living',
  sizeSqft: 1880,
  sizeSure: true,
  bedrooms: 4,
  bathrooms: 3,
  storeys: 2,
  scope: ['living', 'kitchen', 'master'],
  timeline: '6m',
  budget: '60-100',
  keep: { floor: 'cream-tile', walls: null, cabinetry: 'walnut', upholstery: 'unsure' },
  keepMode: 'keep',
  touched: { size: true, bedrooms: true },
  plan: { state: 'read', source: 'camera', floors: 2, rooms: 13, confidence: 0.82, summary: { bedrooms: 4, bathrooms: 3, areaSqft: 1850 } },
};

console.log('你的家 · 资料');
await test('option lists are data with stable ids, and every label has English', () => {
  const ids = (list) => list.map((x) => x.v);
  // 业主的顺序：公寓 → 排屋 → 半独立 / 独立洋房 → 小一点的 → 其他 / 商业（最后）
  assert.deepEqual(ids(H.PROPERTY), ['condo', 'terrace', 'semid', 'bungalow', 'townhouse', 'shophouse', 'other']);
  assert.equal(H.PROPERTY_BY_V.other.zh, '其他 / 商业');
  assert.deepEqual(
    H.PROPERTY_TILES.map((x) => [x.key, x.type, x.storeys ?? null]),
    [
      ['condo', 'condo', null],
      ['terrace-1', 'terrace', 1],
      ['terrace-2', 'terrace', 2],
      ['semid', 'semid', null],
      ['bungalow', 'bungalow', null],
      ['townhouse', 'townhouse', null],
      ['shophouse', 'shophouse', null],
      ['other', 'other', null],
    ]
  );
  assert.deepEqual(ids(H.STATUS), ['handover', 'living', 'building', 'looking']);
  // 业主：3 个月内 / 3–6 个月 / 6–12 个月 / 还没想好；旧档案里的 'later' 还认得
  assert.deepEqual(ids(H.TIMELINE), ['3m', '6m', '12m', 'unsure']);
  assert.equal(H.lab(H.TIMELINE_BY_V.later), '一年以后');
  // 业主：整个项目的档位
  assert.deepEqual(ids(H.BUDGET), ['lt30', '30-60', '60-100', '100-150', '150-250', 'gt250', 'unsure']);
  assert.deepEqual(H.BUDGET.map((b) => b.zh), ['RM 30k 以下', 'RM 30–60k', 'RM 60–100k', 'RM 100–150k', 'RM 150–250k', 'RM 250k 以上', '还没想好']);
  for (const old of ['100-200', 'gt200', 'skip']) assert.ok(H.BUDGET_BY_V[old], old);
  assert.equal(H.budgetKnown('60-100'), true);
  assert.equal(H.budgetKnown('unsure'), false);
  assert.equal(H.budgetKnown('skip'), false);
  for (const tile of H.PROPERTY_TILES) if (tile.zh) assert.ok(EN[tile.zh] != null && EN[tile.sub.zh] != null, tile.key);
  for (const list of [H.PROPERTY, H.STATUS, H.SCOPE, H.TIMELINE, H.BUDGET, H.KEEP_ITEMS, H.OFFER]) {
    for (const o of list) {
      assert.ok(o.zh && o.en, o.v);
      if (/[一-鿿]/.test(o.zh)) assert.ok(EN[o.zh.replace(/[…]+$/, '')] != null, `EN for ${o.zh}`);
      if (o.sub) assert.ok(o.sub.zh && o.sub.en && EN[o.sub.zh.replace(/[…]+$/, '')] != null, `sub ${o.v}`);
    }
  }
});
await test('property ids match the case library, scope ids are 3D room types, templates exist', () => {
  for (const p of H.PROPERTY) {
    assert.ok(TEMPLATES.some((t) => t.id === p.template), p.template);
    // 店屋是业主 2026-10-19 新加的：案例库（cases.js PROPERTY_TYPES，DATA）还没有它 —— 没有也不会坏（只是不加类型分）
    if (p.v === 'shophouse' && !C.PROPERTY_BY_ID[p.v]) continue;
    assert.ok(C.PROPERTY_BY_ID[p.v], p.v);
    assert.equal(!!p.landed, !!C.PROPERTY_BY_ID[p.v].landed, p.v);
  }
  for (const s of H.SCOPE) if (s.v !== 'whole') assert.ok(ROOM_TYPES[s.v], s.v);
  assert.deepEqual(H.WHOLE_ROOMS, ['living', 'kitchen', 'master']);
});
await test('KEEP_SLOTS: §6 swatches in order, every one a real material that fits its slot; label overrides', () => {
  assert.deepEqual(
    H.KEEP_SLOTS.map((k) => [k.id, k.slot]),
    [
      ['floor', 'floor'],
      ['walls', 'walls'],
      ['cabinetry', 'cabinetry'],
      ['sofa', 'upholstery'],
    ]
  );
  // 业主：马来西亚新房最常见的地砖（6–8 种）+ 木地板
  assert.deepEqual(H.KEEP_BY_SLOT.floor.swatches, ['cream-tile', 'grey-tile', 'carrara', 'calacatta', 'travertine', 'sintered', 'terrazzo', 'light-oak']);
  assert.deepEqual(H.KEEP_BY_SLOT.walls.swatches, ['gallery-white', 'warm-white', 'oat', 'sand-limewash', 'sage', 'dusty-blue', 'latte']);
  assert.deepEqual(H.KEEP_BY_SLOT.cabinetry.swatches, ['white-lacquer', 'cream-lacquer', 'light-oak', 'walnut', 'sage-lacquer', 'black-matte']);
  assert.deepEqual(H.KEEP_BY_SLOT.upholstery.swatches, ['grey-wool', 'linen', 'boucle', 'cognac-leather', 'black-leather', 'navy-velvet']);
  for (const k of H.KEEP_SLOTS) for (const id of k.swatches) assert.ok(MAT_BY_ID[id] && fits(id, k.slot), `${id} on ${k.slot}`);
  assert.equal(H.keepLabel('floor', 'carrara'), '白色大理石纹砖');
  for (const k of H.KEEP_SLOTS) for (const [id, l] of Object.entries(k.labels || {})) assert.ok(l.zh && l.en && EN[l.zh] != null, `${k.slot} ${id}`);
  assert.deepEqual(H.KEEP_ITEMS.map((x) => x.v), ['bed', 'dining']);
  assert.equal(H.keepLabel('floor', 'cream-tile'), '奶油大板砖');
  assert.equal(H.keepLabel('walls', 'warm-white'), '暖白');
});

await test('STATES: Malaysian states (+ outside Malaysia), short area lists, ids unique, English for every name; whereText never an address', () => {
  assert.equal(H.STATES.length, 17);
  assert.deepEqual(H.STATES.slice(0, 4).map((s) => s.v), ['kl', 'sel', 'jhr', 'png']);
  const seen = new Set();
  for (const s of H.STATES) {
    assert.ok(s.zh && s.en && EN[s.zh] != null, s.v);
    assert.ok(s.areas.length <= 12, `${s.v} short list`);
    for (const a of s.areas) {
      assert.ok(a.zh && a.en && EN[a.zh] != null, `${s.v}/${a.v}`);
      assert.ok(!seen.has(a.v), `dup area ${a.v}`);
      seen.add(a.v);
    }
  }
  assert.equal(H.whereText({ state: 'sel', area: 'puchong' }), '雪兰莪 · 蒲种');
  assert.equal(H.whereText({ state: 'sel', areaText: 'Setia Alam' }), '雪兰莪 · Setia Alam');
  assert.equal(H.whereText({ state: 'pjy' }), '布城');
  assert.equal(H.whereText({ state: 'nope', area: 'x' }), '');
  assert.equal(H.whereText({ state: 'kl', areaText: 'x'.repeat(80) }).length, '吉隆坡 · '.length + H.AREA_MAX);
  // 别的州的地区 id 不算
  assert.equal(H.normalizeHome({ state: 'kl', area: 'puchong' }).area, null);
  assert.equal(H.normalizeHome({ state: 'sel', area: 'puchong' }).area, 'puchong');
});
await test('offer (owner 2026-10-19 + LEAD NOTE 6 / 8): we make custom cabinets / worktops / wall panels / doors only; loose furniture = illustration; floors, paint, curtains, lighting never', () => {
  for (const s of ['cabinetry', 'countertop']) assert.ok(H.isOfferSlot(s, 'walnut'), s);
  for (const s of ['upholstery', 'woodwork', 'floor', 'walls', 'curtains', 'metal', 'rugs', 'tile', 'accents', 'bedding']) assert.ok(!H.isOfferSlot(s, 'walnut'), s);
  const paint = Object.values(MAT_BY_ID).find((m) => m.cat === 'paint' && fits(m.id, 'feature'));
  assert.equal(H.isOfferSlot('feature', paint.id), false, 'painted feature wall = paint');
  assert.equal(H.isOfferSlot('feature', 'light-oak'), true, 'timber feature wall = wall panel');
  assert.deepEqual(H.OFFER.map((o) => o.v), ['cabinets', 'worktops', 'panels', 'doors']);
  assert.deepEqual(H.offerKinds(['kitchen', 'wardrobe', 'sofa']).map((o) => o.v), ['cabinets', 'worktops'], 'a kitchen brings its worktop');
  assert.deepEqual(H.offerKinds(['wardrobe', 'sofa']).map((o) => o.v), ['cabinets']);
  assert.deepEqual(H.offerKinds(['sofa', 'diningSet', 'bed', 'desk']), [], 'loose furniture is never the offer');
  assert.deepEqual(H.offerKinds(['tvWall'], { featureMat: 'light-oak' }).map((o) => o.v), ['cabinets', 'panels']);
  assert.deepEqual(H.offerKinds(['doors']).map((o) => o.v), ['doors']);
  assert.deepEqual(H.offerKinds(['bedStorage']).map((o) => o.v), ['cabinets'], 'tatami / flip-up beds are cabinetry (LEAD NOTE 8)');
  assert.deepEqual(H.offerKinds([]), []);
  assert.equal(H.offersWorktop(['vanity']), true);
  assert.equal(H.offersWorktop(['wardrobe']), false);
  // 案例单独写一样「台面」（worktop）：算台面，不算柜子（DATA 16:16）
  assert.equal(H.offersWorktop(['worktop']), true);
  assert.deepEqual(H.offerKinds(['worktop']).map((o) => o.v), ['worktops']);
  assert.deepEqual(H.splitSupply(['kitchen', 'sofa', 'tvWall', 'bed', 'doors']), { offer: ['kitchen', 'tvWall', 'doors'], illustration: ['sofa', 'bed'] });
  // 和 3D（src/studio/offer.js）同一张名单 —— 那个文件会带进 three.js，这里只比对文字
  const studio = fs.readFileSync(new URL('../src/studio/offer.js', import.meta.url), 'utf8');
  const list = (re) => {
    const m = re.exec(studio);
    return m ? m[1].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean) : null;
  };
  const ms = list(/export const OFFER_SLOTS = \[([^\]]*)\]/);
  if (ms) assert.deepEqual(H.OFFER_SLOTS, ms, 'OFFER_SLOTS = studio/offer.js');
  // 主题墙只有「板」才是我们做的：木饰面、仿石纹板；微水泥 / 岩板 / 石灰墙 / 刷漆是背景（POLISHER-GUEST）
  assert.equal(H.isOfferSlot('feature', 'microcement'), false, 'microcement is a plaster finish, not a panel');
  assert.equal(H.isOfferSlot('feature', 'sintered'), false);
  assert.equal(H.isOfferSlot('feature', 'sand-limewash'), false);
  assert.equal(H.isOfferSlot('feature', 'gallery-white'), false);
  assert.equal(H.isOfferSlot('feature', 'smoked-oak'), true, 'wood panel');
  assert.equal(H.isOfferSlot('feature', 'travertine'), true, 'stone-look board');
  assert.deepEqual(H.offerKinds(['wardrobe'], { featureMat: 'microcement' }).map((o) => o.v), ['cabinets'], 'a microcement wall adds no wall panel');
  const mp = list(/export const PANEL_TEX = \[([^\]]*)\]/);
  if (mp) assert.deepEqual(H.PANEL_TEX, mp, 'PANEL_TEX = studio/offer.js');
  const m = list(/export const OFFER_SUPPLY = \[([^\]]*)\]/);
  if (m) {
    for (const id of m) assert.ok(H.OFFER_SUPPLY.includes(id), `studio offers ${id} → so do the case cards`);
    // 两边同一份名单（STUDIO 09:09 加上了 bedStorage：收纳床 / 榻榻米 / 翻床，LEAD NOTE 8）
    for (const id of H.OFFER_SUPPLY) assert.ok(m.includes(id), `${id} offered on the case cards but not in the 3D`);
  }
  // 案例库里写的「公司做的」从来没有地板、灯、窗帘
  for (const c of C.SUPPLY.firm) assert.ok(!/flooring|lighting|curtain|paint|ceiling/.test(c.id), c.id);
});

console.log('你的家 · 函数');
await test('templateFor: the §3 table, 1-bed condo → studio', () => {
  const T = (type, bedrooms) => H.templateFor({ type, bedrooms });
  assert.equal(T('condo', 3), 'condo3');
  assert.equal(T('condo', 2), 'condo3');
  assert.equal(T('condo', 1), 'studio');
  assert.equal(T('terrace', 4), 'terrace2');
  assert.equal(T('semid', 5), 'semid2');
  assert.equal(T('bungalow', 5), 'semid2');
  assert.equal(T('townhouse', 3), 'terrace2');
  assert.equal(T('shophouse', 3), 'condo3');
  assert.equal(T('other', 2), 'condo3');
  // 单层排屋：一层的示范户型（不是两层的排屋）；双层排屋照旧
  assert.equal(H.templateFor({ type: 'terrace', bedrooms: 3, storeys: 1 }), 'condo3');
  assert.equal(H.templateFor({ type: 'terrace', bedrooms: 4, storeys: 2 }), 'terrace2');
  assert.equal(H.templateFor({ type: 'terrace', bedrooms: 1, storeys: 1 }), 'condo3', 'landed never → studio');
  assert.equal(T('other', 1), 'studio');
  assert.equal(T(null, null), 'condo3');
  assert.equal(H.templateFor({}), 'condo3');
  for (const p of H.PROPERTY) assert.ok(templatePlan(H.templateFor({ type: p.v, bedrooms: p.beds })), p.v);
});
await test('typicalSize: the §3 typical sizes at the usual bedrooms, grows with bedrooms, stays 300–6,000 and rounded', () => {
  assert.equal(H.typicalSize('condo', 3), 1100);
  assert.equal(H.typicalSize('terrace', 4), 1880);
  assert.equal(H.typicalSize('semid', 5), 2980);
  assert.equal(H.typicalSize('bungalow', 5), 4000);
  assert.equal(H.typicalSize('townhouse', 3), 1500);
  assert.equal(H.typicalSize('other', 2), 1000);
  assert.equal(H.typicalSize('condo', 1), 650);
  assert.equal(H.typicalSize('terrace', 3, 1), 1300, 'single-storey terrace');
  assert.equal(H.typicalSize('shophouse', 3), 1400);
  assert.deepEqual(H.defaultsFor('terrace', 1), { bedrooms: 3, bathrooms: 2, storeys: 1 });
  assert.deepEqual(H.defaultsFor('terrace'), { bedrooms: 4, bathrooms: 3, storeys: 2 });
  assert.equal(H.tileOn(H.PROPERTY_TILES[1], { type: 'terrace', storeys: 1 }), true);
  assert.equal(H.tileOn(H.PROPERTY_TILES[2], { type: 'terrace', storeys: 1 }), false);
  assert.equal(H.tileOn(H.PROPERTY_TILES[2], { type: 'terrace', storeys: 3 }), true);
  assert.equal(H.tileOn(H.PROPERTY_TILES[0], { type: 'terrace' }), false);
  for (const p of H.PROPERTY) {
    let prev = 0;
    for (let b = 1; b <= 7; b++) {
      const v = H.typicalSize(p.v, b);
      assert.ok(v >= H.SIZE_MIN && v <= H.SIZE_MAX, `${p.v} ${b}: ${v}`);
      assert.ok(v >= prev, `${p.v} grows`);
      if (b !== p.beds) assert.equal(v, H.roundSize(v));
      prev = v;
    }
  }
  assert.equal(H.typicalSize('condo'), 1100); // 没给房数 = 这一类的常见房数
  assert.equal(H.typicalSize('nope', 2), H.typicalSize('other', 2));
});
await test('size helpers: log slider round-trips, m², badminton courts', () => {
  for (const v of [300, 650, 1100, 1880, 2980, 4000, 6000]) assert.ok(Math.abs(H.posToSize(H.sizeToPos(v)) - v) <= 100, `${v}`);
  assert.equal(H.posToSize(0), 300);
  assert.equal(H.posToSize(1), 6000);
  assert.equal(H.sqm(1880), 175);
  assert.equal(H.courts(880), 1);
  assert.equal(H.courts(1880), 2);
  assert.equal(H.courtsText(880), '约一个羽毛球场');
  assert.equal(H.courtsText(1880), '约 2 个羽毛球场');
});
await test('keepLocks: only real material ids that fit; unsure / null / wrong slot / keepMode new|unsure lock nothing', () => {
  assert.deepEqual(H.keepLocks(HOME), { floor: 'cream-tile', cabinetry: 'walnut' });
  assert.deepEqual(H.keepLocks({ ...HOME, keepMode: 'new' }), {});
  assert.deepEqual(H.keepLocks({ ...HOME, keepMode: 'unsure' }), {});
  assert.deepEqual(H.keepLocks({ keep: { floor: 'linen', walls: 'nope', cabinetry: 'unsure', upholstery: 'boucle' } }), { upholstery: 'boucle' });
  assert.deepEqual(H.keepLocks({ keep: { sofa: 'linen' } }), { upholstery: 'linen' }); // KEEP_SLOTS id 'sofa' also accepted
  assert.deepEqual(H.keepLocks(null), {});
  assert.deepEqual(H.keepLocks(H.emptyHome()), {});
});
await test('needsKeep: only living / handover; planHint fills defaults; homeLine', () => {
  assert.equal(H.needsKeep({ status: 'living' }), true);
  assert.equal(H.needsKeep({ status: 'handover' }), true);
  assert.equal(H.needsKeep({ status: 'building' }), false);
  assert.equal(H.needsKeep({ status: 'looking' }), false);
  assert.deepEqual(H.planHint({ type: 'condo' }), { type: 'condo', sizeSqft: 1100, bedrooms: 3, bathrooms: 2, storeys: 1 });
  assert.deepEqual(H.planHint(HOME), { type: 'terrace', sizeSqft: 1880, bedrooms: 4, bathrooms: 3, storeys: 2 });
  assert.equal(H.homeLine(HOME), '双层排屋 · 4 房 3 卫 · 1,880 sq ft');
  assert.equal(H.homeLine({ ...HOME, sizeSure: false }), '双层排屋 · 4 房 3 卫 · 约 1,880 sq ft');
  assert.equal(H.homeLine({ type: 'condo', bedrooms: 3, bathrooms: 2, sizeSqft: 1100 }), '公寓 · 3 房 2 卫 · 1,100 sq ft');
  assert.equal(H.homeLine({ type: 'terrace', storeys: 1, bedrooms: 3, bathrooms: 2, sizeSqft: 1300 }), '单层排屋 · 3 房 2 卫 · 1,300 sq ft');
  assert.equal(H.homeLine({}), '');
});
await test('homeSummary: client mode has no budget / designer lines; designer mode adds them (budget only from the staff note)', () => {
  const client = H.homeSummary({ ...HOME, state: 'sel', area: 'puchong', keepItems: ['bed'] });
  const ids = client.map((r) => r.id);
  assert.deepEqual(ids, ['type', 'where', 'status', 'size', 'rooms', 'storeys', 'scope', 'timeline', 'plan', 'keep']);
  assert.ok(client.find((r) => r.id === 'keep').value.endsWith('、床'), 'kept furniture');
  assert.ok(client.every((r) => !r.designer));
  const txt = client.map((r) => `${r.label} ${r.value}`).join('\n');
  assert.ok(!/预算|RM|默认值|不在色卡|把握/.test(txt), txt);
  assert.ok(/奶油大板砖/.test(txt) && /胡桃木/.test(txt));
  // home 上的预算（旧的数据）不算：预算只从员工记录来
  assert.ok(!H.homeSummary(HOME, { designer: true }).some((r) => r.id === 'budget'));
  const des = H.homeSummary(HOME, { designer: true, staffNote: { budget: '60-100' } });
  const dtxt = des.map((r) => `${r.label} ${r.value}`).join('\n');
  assert.ok(/RM 60–100k/.test(dtxt), dtxt);
  assert.ok(H.homeSummary(HOME, { designer: true, staffNote: { budget: 'unsure' } }).some((r) => r.id === 'budget' && /还没想好/.test(r.value)));
  assert.ok(!H.homeSummary(HOME, { staffNote: { budget: '60-100' } }).some((r) => r.id === 'budget'), 'client never, even with a note');
  assert.ok(/沙发不在色卡里/.test(dtxt), dtxt);
  assert.ok(/82%/.test(dtxt), dtxt);
  assert.deepEqual(H.homeSummary({}), []);
  // 默认值（客人没动过的房数）只在设计师版标出来
  const untouched = { ...HOME, touched: {} };
  assert.ok(!H.homeSummary(untouched).some((r) => /默认值/.test(r.value)));
  assert.ok(H.homeSummary(untouched, { designer: true }).some((r) => /默认值/.test(r.value)));
});
await test('withHome: keeps the card and the axes; ≤ 3 case refs { id, rev, title }; caseId; cases undefined keeps them', () => {
  const p = guest();
  const cases = [
    { id: 'seed-zen-condo', rev: 3, title: { zh: '晨光里的原木家', en: 'Oak' }, images: [{ src: 'x.webp' }], story: { zh: '…' } },
    { id: 'seed-urban-condo', title: { zh: '都会里的白色盒子', en: 'Box' } },
    { id: 'c3', title: '三' },
    { id: 'c4', title: '四' },
  ];
  const q = H.withHome(p, HOME, cases);
  assert.equal(q.code, p.code);
  assert.deepEqual(q.axes, p.axes);
  assert.deepEqual(q.hidden, p.hidden);
  assert.deepEqual(q.materials, p.materials);
  assert.equal(q.cases.length, 3);
  assert.deepEqual(q.cases[0], { id: 'seed-zen-condo', rev: 3, title: { zh: '晨光里的原木家', en: 'Oak' } });
  assert.deepEqual(q.cases[2], { id: 'c3', rev: 1, title: { zh: '三', en: '' } });
  assert.equal(q.caseId, 'seed-zen-condo');
  assert.equal(q.home.type, 'terrace');
  assert.ok(!('budget' in q.home), 'budget never rides on the profile');
  assert.equal(q.home.v, H.HOME_V);
  assert.ok(Date.parse(q.home.at) > 0);
  assert.ok(!('images' in q.cases[0]) && !('story' in q.cases[0]), 'no case photos / stories in the profile');
  const r = H.withHome(q, { ...HOME, timeline: '3m' });
  assert.equal(r.cases.length, 3, 'cases kept');
  assert.equal(r.home.timeline, '3m');
  const s = H.withHome(q, null, []);
  assert.deepEqual(s.cases, []);
  assert.equal(s.caseId, null);
  assert.equal(s.home.type, 'terrace', 'home kept when not given');
  assert.equal(H.withHome(null, HOME), null);
});
await test('normalizeHome / homeDone', () => {
  const h = H.normalizeHome({ type: 'condo', scope: ['living', 'nope'], keep: { floor: 'walnut' } });
  assert.deepEqual(h.scope, ['living']);
  assert.equal(h.keep.floor, 'walnut');
  assert.equal(h.keep.walls, null);
  assert.equal(h.plan.state, 'none');
  assert.deepEqual(H.normalizeHome(null), H.emptyHome());
  assert.equal(H.homeDone({ home: HOME }), false, 'not done until 生成');
  assert.equal(H.homeDone({ home: { ...HOME, done: true } }), true);
  assert.equal(H.homeDone({ home: { ...HOME, done: true, plan: { state: 'none' } } }), false);
});

console.log('链接');
await test('packed profile with home + 3 cases + a compact plan stays ≤ 6,000 chars; an oversize inline plan is dropped', async () => {
  let compactPlan = null;
  try {
    ({ compactPlan } = await import('../src/shared/handoff.js'));
  } catch {
    compactPlan = null;
  }
  const inline = compactPlan ? compactPlan(templatePlan('semid2')) : { v: 2, n: 'semid2', f: [{ i: 'gf', r: [['r1', 'living', 0, 0, 6, 5]] }] };
  assert.ok(inline, 'semid2 compact plan fits');
  const p = H.withHome(guest(), { ...HOME, plan: { ...HOME.plan, inline } }, [
    { id: 'seed-zen-condo', rev: 3, title: { zh: '晨光里的原木家', en: 'Oak in the Morning Light' } },
    { id: 'seed-urban-condo', rev: 1, title: { zh: '都会里的白色盒子', en: 'The White Box in Town' } },
    { id: 'seed-forest-terrace', rev: 1, title: { zh: '把森林搬进排屋', en: 'A Forest in a Terrace' } },
  ]);
  const r = await H.packForStudio(p);
  assert.ok(r.packed.length <= H.PACK_LIMIT, `${r.packed.length}`);
  assert.equal(r.droppedInline, false);
  const back = await unpackJSON(r.packed);
  assert.equal(back.home.type, 'terrace');
  assert.equal(back.caseId, 'seed-zen-condo');
  assert.deepEqual(back.home.plan.inline, inline);
  // 太大的小平面：拿掉，链接仍然在限制以内
  const huge = { ...inline, junk: Array.from({ length: 2400 }, (_, i) => `room-${i}-${Math.random().toString(36).slice(2)}`) };
  const big = H.withHome(p, { ...p.home, plan: { ...p.home.plan, inline: huge } });
  const r2 = await H.packForStudio(big);
  assert.equal(r2.droppedInline, true);
  assert.ok(r2.packed.length <= H.PACK_LIMIT, `${r2.packed.length}`);
  assert.equal(r2.profile.home.plan.inline, undefined);
  assert.equal(r2.profile.home.plan.state, 'read');
});

console.log('员工记录 · 客人名单（这台 iPad）');
await test('staff notes: the budget lives only in genie.staffnotes.v1 (never in the profile or any link)', async () => {
  LS.clear();
  const p = H.withHome(guest(), { ...HOME, budget: '60-100' }, []);
  assert.ok(!('budget' in p.home));
  H.setStaffNote(p.id, { budget: '150-250', budgetBy: 'guest' });
  assert.equal(H.staffNoteOf(p.id).budget, '150-250');
  assert.equal(JSON.parse(LS.get(H.NOTES_KEY))[p.id].budgetBy, 'guest');
  H.setStaffNote(p.id, { budget: null });
  assert.ok(!('budget' in H.staffNoteOf(p.id)), 'null removes it');
  H.setStaffNote(p.id, { budget: '150-250' });
  // 链接（3D、蓝图）里没有预算：旧数据里 home.budget 也会被拿掉
  const legacy = { ...p, home: { ...p.home, budget: 'gt250' } };
  const { packed } = await H.packForStudio(legacy);
  const back = await unpackJSON(packed);
  assert.ok(!('budget' in back.home));
  assert.ok(!/150-250|gt250|RM/.test(JSON.stringify(back)));
  assert.deepEqual(H.staffNoteOf(''), {});
  // 只在员工的设备上问
  assert.equal(H.askBudgetOn({ config: { home: { askBudget: true } }, wish: true }), true);
  assert.equal(H.askBudgetOn({ config: { home: { askBudget: true } }, staff: true }), true);
  assert.equal(H.askBudgetOn({ config: { home: { askBudget: true } } }), false, 'guest phone: nobody would see it');
  assert.equal(H.askBudgetOn({ config: { home: { askBudget: false } }, wish: true }), false);
});
await test('phone numbers: Malaysian mobiles in any common form, foreign numbers need +, junk → empty', () => {
  for (const x of ['012-345 6789', '0123456789', '+60 12-345 6789', '60123456789', '(012) 345-6789']) assert.equal(H.normalizePhone(x), '+60123456789', x);
  assert.equal(H.normalizePhone('011-2345 6789'), '+601123456789');
  assert.equal(H.normalizePhone('+65 8123 4567'), '+6581234567');
  for (const x of ['', '12345', 'abc', '8123 4567', '03-1234 5678x']) assert.equal(H.normalizePhone(x), '', x);
  assert.equal(H.phoneText('+60123456789'), '+60 12-345 6789');
  assert.equal(H.phoneLocal('+601123456789'), '011-2345 6789');
});
await test('leads: need a name, a real number and the PDPA tick; one record per guest (intents merge); CSV = UTF-8 BOM + CRLF, Excel-safe', () => {
  LS.clear();
  const p = H.withHome(guest(), { ...HOME, state: 'sel', area: 'puchong', keepItems: ['dining'] }, [{ id: 'seed-zen-condo', rev: 1, title: { zh: '晨光里的原木家', en: 'Oak' } }]);
  H.setStaffNote(p.id, { budget: '60-100' });
  assert.equal(H.makeLead({ profile: p, name: '', phone: '0123456789', consent: true }), null);
  assert.equal(H.makeLead({ profile: p, name: 'Peggy', phone: '123', consent: true }), null);
  assert.equal(H.makeLead({ profile: p, name: 'Peggy', phone: '0123456789', consent: false }), null);
  const a = H.saveLead(H.makeLead({ profile: p, name: ' Peggy ', phone: '012-345 6789', consent: true, intent: 'measure', link: 'https://x/studio.html?from=home#p=abc' }));
  assert.equal(a.name, 'Peggy');
  assert.equal(a.phone, '+60123456789');
  assert.deepEqual(a.intents, ['measure']);
  assert.equal(a.consent.v, H.PDPA_V);
  assert.equal(a.budget, '60-100', 'the staff note is copied into the staff-only list');
  assert.ok(!a.home.plan.inline);
  const b = H.saveLead(H.makeLead({ profile: p, name: 'Peggy', phone: '0123456789', consent: true, intent: 'whatsapp' }));
  assert.deepEqual(b.intents, ['measure', 'whatsapp']);
  assert.equal(H.listLeads().length, 1, 'same guest → one row');
  H.saveLead(H.makeLead({ profile: { ...guest(), id: 'q_other', name: '=HYPERLINK("x")' }, name: '=HYPERLINK("x")', phone: '+65 8123 4567', consent: true, intent: 'measure' }));
  const csv = H.leadsCSV(H.listLeads(), { lifeLabel: (k, v) => ({ kids: '小孩', cat: '猫' })[v] || v });
  assert.ok(csv.startsWith('\uFEFF'), 'BOM');
  assert.ok(csv.includes('\r\n') && csv.endsWith('\r\n'));
  const lines = csv.slice(1).trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('时间,称呼,WhatsApp,想要,梦想家卡牌,房子,在哪里'), lines[0]);
  const peggy = lines.find((l) => l.includes('Peggy'));
  assert.ok(peggy.includes(',012-345 6789,'), 'local number, Excel keeps it as text');
  assert.ok(peggy.includes('预约免费量房 + 把我的家发到 WhatsApp'));
  assert.ok(peggy.includes('雪兰莪 · 蒲种'));
  assert.ok(peggy.includes('RM 60–100k'), 'budget is in the staff export');
  assert.ok(peggy.includes('晨光里的原木家'));
  assert.ok(peggy.includes('餐桌椅'));
  assert.ok(/小孩、猫/.test(peggy), 'who lives here = the quiz life answer');
  const other = lines.find((l) => l.includes('HYPERLINK'));
  assert.ok(/,"'=HYPERLINK\(""x""\)",/.test(other), other);
  assert.ok(other.includes(",'+65 8123 4567,") || other.includes(",'+6581234567,"), other);
  assert.match(H.leadsFileName(new Date(2026, 9, 19, 9, 5)), /^WISH-leads-20261019-0905\.csv$/);
  H.clearLeads();
  assert.deepEqual(H.listLeads(), []);
  assert.ok(H.leadsCSV([]).startsWith('\uFEFF时间,'), 'empty export still has the header');
});

await test('retention (POLISHER-REG, PDPA): leads and staff notes older than CONFIG.keepDays are deleted on read; launcher clear also clears the notes', async () => {
  const K = await import('../src/shared/keep.js');
  const { CONFIG } = await import('../src/shared/config.js');
  assert.equal(K.LEADS_KEY, H.LEADS_KEY);
  assert.equal(K.NOTES_KEY, H.NOTES_KEY);
  assert.ok(CONFIG.keepDays > 0, 'keepDays is on');
  LS.clear();
  const old = new Date(Date.now() - (CONFIG.keepDays + 1) * 864e5).toISOString();
  const recent = new Date(Date.now() - (CONFIG.keepDays - 1) * 864e5).toISOString();
  LS.set(H.LEADS_KEY, JSON.stringify([
    { id: 'ld_new', at: new Date().toISOString(), name: 'A', phone: '+60123456789' },
    { id: 'ld_edge', at: recent, name: 'B', phone: '+60123456780' },
    { id: 'ld_old', at: old, name: 'C', phone: '+60123456781' },
    { id: 'ld_nodate', name: 'D', phone: '+60123456782' },
  ]));
  assert.deepEqual(H.listLeads().map((x) => x.id), ['ld_new', 'ld_edge', 'ld_nodate'], 'the 91-day-old lead is gone');
  assert.ok(!LS.get(H.LEADS_KEY).includes('ld_old'), 'and really deleted from the iPad, not just hidden');
  LS.set(H.NOTES_KEY, JSON.stringify({ q_new: { budget: '60-100', at: new Date().toISOString() }, q_old: { budget: 'gt250', at: old } }));
  assert.deepEqual(H.staffNoteOf('q_old'), {}, 'stale budget not returned');
  assert.ok(!LS.get(H.NOTES_KEY).includes('gt250'), 'stale budget deleted');
  assert.equal(H.staffNoteOf('q_new').budget, '60-100');
  LS.set(H.NOTES_KEY, JSON.stringify({ q_new: { budget: '60-100', at: new Date().toISOString() }, q_old: { budget: 'gt250', at: old } }));
  H.setStaffNote('q_x', { budget: '30-60' });
  assert.deepEqual(Object.keys(JSON.parse(LS.get(H.NOTES_KEY))).sort(), ['q_new', 'q_x'], 'a write also drops stale notes');
  // makeLead copies only a fresh budget
  LS.set(H.NOTES_KEY, JSON.stringify({ q_old: { budget: 'gt250', at: old } }));
  const lead = H.makeLead({ profile: { ...guest(), id: 'q_old' }, name: 'E', phone: '0123456789', consent: true });
  assert.equal(lead.budget, null);
  // sweep (launcher / Wish Mode boot, next guest), drop one, clear all
  LS.set(H.LEADS_KEY, JSON.stringify([{ id: 'ld_old', at: old }]));
  LS.set(H.NOTES_KEY, JSON.stringify({ a: { budget: '60-100', at: new Date().toISOString() }, b: { budget: '30-60', at: new Date().toISOString() }, c: { at: old } }));
  assert.deepEqual(K.sweepKept(), { leads: 0, notes: 2 });
  assert.equal(LS.get(H.LEADS_KEY), undefined, 'empty list → key removed');
  K.dropStaffNote('a');
  assert.deepEqual(Object.keys(JSON.parse(LS.get(H.NOTES_KEY))), ['b']);
  K.clearStaffNotes();
  assert.equal(LS.get(H.NOTES_KEY), undefined);
  // keepDays 0 = keep everything
  assert.equal(K.withinKeep({ at: old }, { days: 0 }), true);
  assert.equal(K.withinKeep({ at: old }), false);
  assert.equal(K.withinKeep({}), true, 'no date → kept (cannot tell)');
  // the launcher's 清空本机全部蓝图 calls clearStaffNotes next to clearArchive; deleting one blueprint drops its note
  const launcher = fs.readFileSync(new URL('../src/launcher/main.jsx', import.meta.url), 'utf8');
  assert.match(launcher, /clearArchive\(\);[^\n]*\n\s*clearStaffNotes\(\);/);
  assert.match(launcher, /removeFromArchive\(p\.id\);\s*\n\s*dropStaffNote\(p\.id\);/);
  assert.match(fs.readFileSync(new URL('../src/wish/WishShell.jsx', import.meta.url), 'utf8'), /sweepKept\(\)/);
});

console.log('WhatsApp');
await test('client text: the home lines the guest saw, no 门铃 / insights / designer language / budget', () => {
  const p = H.withHome(guest(), HOME, [{ id: 'seed-zen-condo', rev: 1, title: { zh: '晨光里的原木家', en: 'Oak' } }]);
  const plan = storagePlan(p.storage, FLOW.APPLIANCES);
  const txt = profileText(p, plan, 'https://x/quiz.html#bp=abc', { client: true });
  assert.ok(/🏡 你的家：双层排屋 · 4 房 3 卫 · 1,880 sq ft（住了一段时间，想翻新）· 做：客厅、厨房、主卧 · 3–6 个月/.test(txt), txt);
  assert.ok(/🖼️ 参考案例：晨光里的原木家/.test(txt));
  assert.ok(/🔒 保留：地板 奶油大板砖、柜子 胡桃木/.test(txt), txt);
  assert.ok(/📐 户型图：已上传（在展厅 iPad 上）/.test(txt));
  assert.ok(!/最想藏|玄关的鞋|见面要聊|设计语言|预算|RM|把握|不在色卡|默认值/.test(txt), txt);
  for (const x of insights(p, plan)) assert.ok(!txt.includes(x.text), `insight leaked: ${x.text}`);
  assert.ok(!/data:|blob:|\.webp|\.jpg/.test(txt), 'no images');
});
await test('designer text adds the staff budget note + read confidence; plan line for phone uploads / no plan', () => {
  const p = H.withHome(guest(), HOME, []);
  const plan = storagePlan(p.storage, FLOW.APPLIANCES);
  const txt = profileText(p, plan, '', { client: false, staffNote: { budget: '100-150' } });
  assert.ok(/💰 预算（只给员工看）：RM 100–150k/.test(txt), txt);
  // 客人版：就算传了员工记录，也没有预算
  const ctxt = profileText(H.withHome(p, { ...HOME, state: 'kl', area: 'bangsar' }), plan, '', { client: true, staffNote: { budget: '100-150' } });
  assert.ok(!/预算|RM/.test(ctxt), ctxt);
  assert.ok(/📍 在哪里：吉隆坡 · 孟沙/.test(ctxt), ctxt);
  assert.ok(/🔎 读图把握：82%/.test(txt));
  assert.ok(/客人要保留的沙发不在色卡里/.test(txt));
  const phone = homeLines(H.withHome(p, { ...HOME, plan: { state: 'rough', source: 'photo' } }), { client: true });
  assert.ok(phone.some((l) => l === '📐 户型图：已上传'), phone.join('\n'));
  const none = homeLines(H.withHome(p, { ...HOME, plan: { state: 'later' } }), { client: true });
  assert.ok(none.some((l) => l === '📐 户型图：还没有'));
  assert.deepEqual(homeLines(guest()), [], 'no home yet → no lines');
  // 客人自己答过的预算（askBudget 打开时）也只在设计师版
  const own = homeLines(H.withHome(p, { ...HOME, budget: 'lt30' }), { client: true });
  assert.ok(!own.some((l) => /预算/.test(l)));
});
await test('leadText (the two final actions on the guest phone): client lines only, never a budget', () => {
  LS.clear();
  const p = H.withHome(guest(), { ...HOME, state: 'sel', area: 'puchong' }, [{ id: 'seed-zen-condo', rev: 1, title: { zh: '晨光里的原木家', en: 'Oak' } }]);
  H.setStaffNote(p.id, { budget: '150-250' });
  const m = leadText(p, 'measure', 'https://x/studio.html?from=home#p=abc');
  assert.ok(m.startsWith('你好！我想预约免费量房。'), m);
  assert.ok(/🏡 你的家：/.test(m) && /📍 在哪里：雪兰莪 · 蒲种/.test(m) && m.endsWith('#p=abc'), m);
  assert.ok(!/预算|RM|150-250|门铃|最想藏/.test(m), m);
  assert.ok(leadText(p, 'whatsapp').startsWith('这是我在 WISH 许愿出来的家：'));
});
await test('R mini plan (POLISHER-GUEST): L-shaped rooms (id, id-2) count once, draw as one outline, labels fit their box', async () => {
  const R = await import('../src/quiz/home/planRooms.js');
  const plan = JSON.parse(fs.readFileSync(new URL('./fixtures/ai/typeb-camera-plan.json', import.meta.url), 'utf8'));
  const f = R.planFacts(plan);
  assert.equal(f.bedrooms, 3, 'owner TYPE B is 3 bed (gf-r3 + gf-r3-2 is one L-shaped master)');
  assert.equal(f.bathrooms, 2);
  assert.equal(f.rooms, 8, 'master, living, dining, kitchen (2 pieces), 2 bedrooms, 2 baths — no balconies / yard / corridor');
  const gs = R.roomGroups(plan.floors[0].rooms);
  const master = gs.find((g) => g.type === 'master');
  assert.equal(master.parts.length, 2);
  assert.equal(master.id, 'gf-r3');
  assert.equal(gs.filter((g) => g.type === 'kitchen').length, 1, 'one kitchen label, not two');
  // 一个 L 形 = 一条闭合的外框（6 个角），没有中间那条分隔线
  const d = R.outlinePath(master.parts);
  assert.equal((d.match(/M/g) || []).length, 1, d);
  assert.equal(d.split(/[ML]/).filter(Boolean).length, 6, d);
  assert.equal(R.outlinePath([{ x: 0, y: 0, w: 2, d: 1 }]), 'M0 0L2 0L2 1L0 1Z');
  // 叠层（stackPlans）取整后两块之间差 2 毫米：还是一个形状
  const kitchen = [{ x: 5.14, y: 7.55, w: 2.362, d: 2.65 }, { x: 3.6, y: 7.55, w: 1.538, d: 1.34 }];
  assert.equal((R.outlinePath(kitchen).match(/M/g) || []).length, 1, R.outlinePath(kitchen));
  // 房名：放得下用全名，放不下用短的，再小就不写
  assert.deepEqual(R.fitLabel('Kitchen', 'Kitchen', 3, 3, 0.5), { text: 'Kitchen', size: 0.5 });
  assert.equal(R.fitLabel('Bathroom', 'Bath', 1.65, 2.9, 0.48).text, 'Bath');
  assert.equal(R.fitLabel('Master bedroom', 'Master', 1.95, 2.9, 0.48).text, 'Master');
  assert.equal(R.fitLabel('Master bedroom', 'Master', 0.6, 0.6, 0.48), null);
  assert.equal(R.fitLabel('主卧', '主卧', 1.95, 2.9, 0.48).text, '主卧');
  for (const g of gs) {
    const T = ROOM_TYPES[g.type];
    const lab = R.fitLabel(T.en, R.SHORT_EN[g.type] || T.en, g.main.w, g.main.d, 0.48);
    if (lab) assert.ok(R.textUnits(lab.text) * lab.size <= g.main.w * 0.84 + 1e-9, `${g.type} label fits ${g.main.w} m`);
  }
});
await test('English', () => {
  setLang('en', { reload: false });
  try {
    assert.equal(H.homeLine(HOME), 'Double-storey Terrace · 4 bed 3 bath · 1,880 sq ft');
    assert.equal(H.lab(H.PROPERTY_BY_V.terrace), 'Terrace / link house');
    assert.equal(H.keepLabel('floor', 'carrara'), 'White marble-look tile');
    assert.equal(H.homeLine({ type: 'terrace', storeys: 1, bedrooms: 3, bathrooms: 2 }), 'Single-storey Terrace · 3 bed 2 bath');
    assert.equal(H.whereText({ state: 'png', area: 'george-town' }), 'Penang · George Town');
    assert.equal(H.leadFields({ intents: ['measure'] })[3].value, 'Book a free site measurement');
    const lines = homeLines(H.withHome(guest(), HOME, [{ id: 'a', title: { zh: '晨光里的原木家', en: 'Oak in the Morning Light' } }]), { client: true });
    assert.ok(lines[0].startsWith('🏡 Home: Double-storey Terrace · 4 bed 3 bath · 1,880 sq ft (We live here — time to refresh) · Doing: Living, Kitchen, Master bedroom · 3–6 months'), lines[0]);
    assert.ok(!/[一-鿿]/.test(lines.join('')), lines.join('\n'));
  } finally {
    setLang('zh', { reload: false });
  }
});

console.log(`\n${n - failed} / ${n} passed`);
if (failed) process.exit(1);
