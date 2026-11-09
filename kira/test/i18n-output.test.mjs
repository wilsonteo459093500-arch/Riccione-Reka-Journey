// 输出语言：EN 报价单 / Excel / WhatsApp 文字不夹中文；中文版不夹英文；both 双语。
// 积木柜的名称、简介、柜体小标题都在渲染时按 lang 从结构化数据生成（不拆「English 中文」字串），旧记录照样对。
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { newCabinet, updateSpec, cabinetSummary, cabinetTitle, frameTitle } from '../src/planner/templates.js';
import { computeRecordQuote, frameKindLabel, cabinetTotal } from '../src/planner/bridge.js';
import { elevationScene } from '../src/render/elevation.js';
import { buildTextQuote } from '../src/components/quote/textQuote.js';
import { excelWorkbook } from '../src/components/quote/exportExcel.js';

const HAN = /\p{Script=Han}/u;
const WORD = /[A-Za-z]{2,}/; // 英文单词（「L 型」的 L、「m」单位不算）
const LANGS = ['en', 'zh', 'both'];

const sample = () => {
  const wardrobe = { ...newCabinet('wardrobe', { ceilingH: 2700, code: 'K1' }) };
  const kitchenL = { ...updateSpec(newCabinet('kitchen', { code: 'K2' }), { shape: 'L', walls: [{ len: 3000 }, { len: 2400 }], tall: { on: true, kind: 'oven' } }) };
  const kitchenU = { ...updateSpec(newCabinet('kitchen', { code: 'K3' }), { shape: 'U', walls: [{ len: 3000 }, { len: 2400 }, { len: 1800 }] }) };
  const tv = { ...updateSpec(newCabinet('tv', { ceilingH: 2700, code: 'K4' }), { sides: { on: true, which: 'both' }, upper: { on: true } }) };
  const shoe = { ...newCabinet('shoe', { ceilingH: 2700, code: 'K5' }) };
  const bench = { ...updateSpec(newCabinet('shoe', { code: 'K6' }), { style: 'bench' }) };
  return { wardrobe, kitchenL, kitchenU, tv, shoe, bench };
};
const record = (c = sample()) => ({
  id: 'r1', adjustPct: 0, discountMode: 'pct', discountAmt: 0, defaults: { door: 'A', carcass: 'A' },
  zones: [
    { id: 'z1', name: 'Master Bedroom 主卧', ceilingH: 2700, items: [], cabinets: [c.wardrobe] },
    { id: 'z2', name: 'Dry Kitchen 干厨', ceilingH: 2700, items: [], cabinets: [c.kitchenL, c.kitchenU] },
    { id: 'z3', name: 'Living Room 客厅', ceilingH: 2700, items: [], cabinets: [c.tv] },
    { id: 'z4', name: 'Foyer 玄关', ceilingH: 2700, items: [], cabinets: [c.shoe, c.bench] },
  ],
});
const meta = { name: 'Mr Tan', location: 'Mont Kiara', version: '1', date: '2026-11-09', ref: 'Q-1', pic: 'Ali' };

test('cabinetSummary: en has no Chinese, zh has no English words, both has both (every template)', () => {
  const c = sample();
  Object.entries(c).forEach(([k, cab]) => {
    const en = cabinetSummary(cab, 'en'), zh = cabinetSummary(cab, 'zh'), both = cabinetSummary(cab, 'both');
    assert.ok(en && !HAN.test(en), `${k} en: ${en}`);
    assert.ok(HAN.test(zh) && !WORD.test(zh), `${k} zh: ${zh}`);
    assert.ok(HAN.test(both) && WORD.test(both), `${k} both: ${both}`);
    assert.equal(cabinetSummary(cab), both, 'default = both (staff UI stays bilingual)');
  });
  assert.equal(cabinetSummary(c.wardrobe, 'en'), '2.40 × 2.70 × 0.60 m · 4 doors');
  assert.equal(cabinetSummary(c.wardrobe, 'zh'), '2.40 × 2.70 × 0.60 m · 4 扇门');
  assert.equal(cabinetSummary(c.wardrobe, 'both'), '2.40 × 2.70 × 0.60 m · 4 doors 4 扇门');
  assert.equal(cabinetSummary(updateSpec(c.wardrobe, { W: 500 }), 'en'), '0.50 × 2.70 × 0.60 m · 1 door');
  assert.equal(cabinetSummary(c.kitchenL, 'en'), 'L-shape · 3.00 + 2.40 m · Tall Cabinet');
  assert.equal(cabinetSummary(c.kitchenL, 'zh'), 'L 型 · 3.00 + 2.40 m · 高柜');
  assert.equal(cabinetSummary(c.tv, 'en'), '3.00 m · Floating low cabinet · Side towers · Top cabinet above');
  assert.equal(cabinetSummary(c.tv, 'zh'), '3.00 m · 悬空低柜 · 两侧高柜 · 上方吊柜');
  assert.equal(cabinetSummary(updateSpec(c.tv, { sides: { on: true, which: 'left' } }), 'en'), '3.00 m · Floating low cabinet · Left tower · Top cabinet above');
  assert.equal(cabinetSummary(c.shoe, 'en'), 'Upper + lower with niche · 1.20 × 2.70 × 0.35 m');
  assert.equal(cabinetSummary(c.shoe, 'zh'), '上下柜 + 中间开放台面 · 1.20 × 2.70 × 0.35 m');
});

test('cabinetTitle: template name per language (TV / shoe keep the whole "电视柜 / 展示柜"), own name untouched', () => {
  const c = sample();
  assert.equal(cabinetTitle(c.tv, 'en'), 'TV & display');
  assert.equal(cabinetTitle(c.tv, 'zh'), '电视柜 / 展示柜');
  assert.equal(cabinetTitle(c.tv, 'both'), 'TV & display 电视柜 / 展示柜');
  assert.equal(cabinetTitle(c.shoe, 'en'), 'Shoe & foyer');
  assert.equal(cabinetTitle(c.shoe, 'zh'), '鞋柜 / 玄关柜');
  assert.equal(cabinetTitle({ ...c.wardrobe, name: 'Master wardrobe' }, 'zh'), 'Master wardrobe');
});

test('frameTitle: kitchen walls / kinds per language; one-wall kitchen has no wall tag', () => {
  const c = sample();
  const L = c.kitchenL.frames.map((f) => [f.kind, f.wall]);
  assert.deepEqual(L, [['base', 0], ['wall', 0], ['base', 1], ['wall', 1], ['tall', 1]]);
  assert.deepEqual(c.kitchenL.frames.map((f) => frameTitle(c.kitchenL, f, 'en')),
    ['Base Cabinet · Wall A', 'Top Cabinet · Wall A', 'Base Cabinet · Wall B', 'Top Cabinet · Wall B', 'Tall Cabinet · Wall B']);
  assert.deepEqual(c.kitchenL.frames.map((f) => frameTitle(c.kitchenL, f, 'zh')),
    ['地柜 · 墙A', '吊柜 · 墙A', '地柜 · 墙B', '吊柜 · 墙B', '高柜 · 墙B']);
  assert.equal(frameTitle(c.kitchenL, c.kitchenL.frames[0], 'both'), 'Base Cabinet 地柜 · Wall A 墙A');
  assert.equal(frameTitle(c.kitchenU, c.kitchenU.frames.at(-1), 'en'), 'Top Cabinet · Wall C');
  const I = newCabinet('kitchen');
  assert.deepEqual(I.frames.map((f) => frameTitle(I, f, 'en')), ['Base Cabinet', 'Top Cabinet']);
  assert.deepEqual(c.tv.frames.map((f) => frameTitle(c.tv, f, 'en')), ['Display Cabinet', 'TV Cabinet', 'Top Cabinet', 'Display Cabinet']);
  assert.deepEqual(c.tv.frames.map((f) => frameTitle(c.tv, f, 'zh')), ['展示高柜', '电视柜', '吊柜', '展示高柜']);
  assert.equal(frameTitle(c.wardrobe, c.wardrobe.frames[0], 'en'), 'Wardrobe');
  assert.equal(frameTitle(c.shoe, c.shoe.frames[0], 'zh'), '鞋柜');
  assert.equal(frameTitle(c.bench, c.bench.frames[0], 'en'), 'Bench');
  Object.values(c).forEach((cab) => cab.frames.forEach((f) => {
    assert.ok(!HAN.test(frameTitle(cab, f, 'en')), frameTitle(cab, f, 'en'));
    assert.ok(!WORD.test(frameTitle(cab, f, 'zh')), frameTitle(cab, f, 'zh'));
  }));
  assert.equal(frameKindLabel('wall', 'en'), 'Top Cabinet');
  assert.equal(frameKindLabel('x', 'both'), 'Tall Cabinet 高柜');
});

test('saved data unchanged: frame.label strings are the same bilingual strings as before (old records, item names)', () => {
  const c = sample();
  assert.deepEqual(c.kitchenL.frames.map((f) => f.label), [
    'Base Cabinet 地柜 · 墙A Wall A', 'Top Cabinet 吊柜 · 墙A Wall A', 'Base Cabinet 地柜 · 墙B Wall B', 'Top Cabinet 吊柜 · 墙B Wall B', 'Tall Cabinet 高柜 · 墙B Wall B']);
  assert.deepEqual(newCabinet('kitchen').frames.map((f) => f.label), ['Base Cabinet 地柜', 'Top Cabinet 吊柜']);
  assert.deepEqual(c.tv.frames.map((f) => f.label), ['Display Cabinet 展示高柜', 'TV Cabinet 电视柜', 'Top Cabinet 吊柜', 'Display Cabinet 展示高柜']);
  assert.deepEqual([c.wardrobe, c.shoe, c.bench].map((x) => x.frames[0].label), ['Wardrobe 衣柜', 'Shoe Cabinet 鞋柜', 'Bench 换鞋凳']);
  // 价钱不变（同 nullceil / templates 测试：衣柜 2.4 × 2.7 = RM 12,150）
  assert.equal(Math.round(cabinetTotal(c.wardrobe)), 12150);
});

test('old saved records (JSON round-trip, old/odd labels) still render per language; non-template cabinets fall back to the label', () => {
  const c = sample();
  const old = JSON.parse(JSON.stringify(c.kitchenU));
  old.frames.forEach((f) => { f.label = f.label.replace('Top Cabinet 吊柜', 'Wall Cabinet 吊柜'); }); // 以前版本的叫法也不影响
  assert.deepEqual(old.frames.map((f) => frameTitle(old, f, 'en')).slice(0, 2), ['Base Cabinet · Wall A', 'Top Cabinet · Wall A']);
  // 不是模板做的柜子（旧报价换算）：label 是业务自己写的 → 照旧按 "English 中文" 取
  const conv = { template: 'converted', frames: [{ id: 'f0', kind: 'tall', label: 'Pantry 储物柜' }, { id: 'f1', kind: 'base' }] };
  assert.equal(frameTitle(conv, conv.frames[0], 'en'), 'Pantry');
  assert.equal(frameTitle(conv, conv.frames[0], 'zh'), '储物柜');
  assert.equal(frameTitle(conv, conv.frames[1], 'zh'), '地柜');
  assert.equal(frameTitle({}, { kind: 'wall' }, 'en'), 'Top Cabinet');
});

test('WhatsApp / copy text: EN has no Chinese at all, ZH cabinet lines have no English, BOTH bilingual', () => {
  const rec = record();
  const q = computeRecordQuote(rec);
  const txt = Object.fromEntries(LANGS.map((l) => [l, buildTextQuote(meta, q, null, {}, l)]));
  const bad = txt.en.split('\n').filter((ln) => HAN.test(ln));
  assert.deepEqual(bad, [], 'EN lines with Chinese');
  const cabLines = (l) => txt[l].split('\n').filter((ln) => /^ {3}• K\d/.test(ln));
  assert.equal(cabLines('en').length, 6);
  assert.match(cabLines('en')[3], /^ {3}• K4 TV & display · 3\.00 m · Floating low cabinet · Side towers · Top cabinet above — ≈RM [\d,]+$/);
  assert.match(cabLines('en')[1], /^ {3}• K2 Kitchen · L-shape · 3\.00 \+ 2\.40 m · Tall Cabinet — ≈RM [\d,]+$/);
  assert.match(cabLines('en')[0], /^ {3}• K1 Wardrobe · 2\.40 × 2\.70 × 0\.60 m · 4 doors — ≈RM 12,150$/);
  cabLines('zh').forEach((ln) => assert.ok(!/[A-Za-z]{2,}/.test(ln.replace(/RM/g, '')), ln));
  assert.match(cabLines('zh')[0], /^ {3}• K1 衣柜 · 2\.40 × 2\.70 × 0\.60 m · 4 扇门 — ≈RM 12,150$/);
  assert.match(cabLines('zh')[4], /^ {3}• K5 鞋柜 \/ 玄关柜 · 上下柜 \+ 中间开放台面 · /);
  cabLines('both').forEach((ln) => assert.ok(HAN.test(ln) && /[A-Za-z]{3,}/.test(ln), ln));
  assert.match(cabLines('both')[3], /K4 TV & display 电视柜 \/ 展示柜 · 3\.00 m · Floating low cabinet 悬空低柜/);
  // 钱没变：三种语言的房间小计 / 总额一样
  const money = (s) => s.match(/RM [\d,.]+/g).join('|');
  assert.equal(money(txt.en), money(txt.zh));
  assert.equal(money(txt.en), money(txt.both));
});

test('Excel: EN sheet has no Chinese in any cell; ZH frame headers Chinese; BOTH bilingual; numbers identical', async () => {
  const XLSX = await import('xlsx');
  const q = computeRecordQuote(record());
  const rows = (l) => {
    const { wb } = excelWorkbook(XLSX, meta, q, null, {}, l);
    return XLSX.utils.sheet_to_json(wb.Sheets.Quotation, { header: 1, defval: '' });
  };
  const en = rows('en'), zh = rows('zh'), both = rows('both');
  const hanCells = en.flat().filter((v) => HAN.test(String(v)));
  assert.deepEqual(hanCells, [], 'EN cells with Chinese');
  const heads = (rs) => rs.map((r) => String(r[0])).filter((s) => /^ {2}\S/.test(s) && s.includes('  —  '));
  assert.ok(heads(en).includes('  Base Cabinet · Wall A  —  L 3.00m × H 0.85m × D 0.60m'), heads(en).join('\n'));
  assert.ok(heads(zh).includes('  地柜 · 墙A  —  长 3.00m × 高 0.85m × 深 0.60m'), heads(zh).join('\n'));
  heads(zh).forEach((s) => assert.ok(!WORD.test(s.replace(/\d\.\d\dm/g, '')), s));
  assert.ok(heads(both).includes('  Base Cabinet 地柜 · Wall A 墙A  —  L 3.00m × H 0.85m × D 0.60m'), heads(both).join('\n'));
  assert.ok(en.some((r) => r[0] === 'K4 · TV & display'));
  assert.ok(zh.some((r) => r[0] === 'K4 · 电视柜 / 展示柜'));
  const nums = (rs) => rs.flat().filter((v) => typeof v === 'number').join('|');
  assert.equal(nums(en), nums(zh));
  assert.equal(nums(en), nums(both));
});

test('cabinet pictures (elevation) in EN carry no Chinese text; ZH no English words', () => {
  Object.values(sample()).forEach((cab) => {
    const txt = (lang) => elevationScene(cab, { style: 'drawing', dims: true, lang }).shapes.filter((s) => s.t === 'text').map((s) => s.text);
    txt('en').forEach((s) => assert.ok(!HAN.test(s), `${cab.code} en: ${s}`));
    txt('zh').forEach((s) => assert.ok(!WORD.test(s), `${cab.code} zh: ${s}`));
  });
});
