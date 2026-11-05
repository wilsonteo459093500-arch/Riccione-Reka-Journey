// 词表：伺服器 _lib/vocab.js 和浏览器 case-vocab.js 必须一模一样，也要跟 VISI 现有的 key 对得上
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lib, INVITE } from '../testkit.mjs';

const V = lib.vocab;
const BROWSER = join(INVITE, 'assets/js/visi/case-vocab.js');
const src = readFileSync(BROWSER, 'utf8');

function loadBrowser() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'case-vocab.js' });
  return ctx.window.MB;
}
const plain = (x) => JSON.parse(JSON.stringify(x));

test('vocab parity: browser case-vocab.js deep-equals _lib/vocab.js', () => {
  const MB = loadBrowser();
  for (const k of ['CASE_STYLES', 'CASE_CABINETS', 'CASE_ROOMS', 'CASE_PTYPES', 'CASE_TRAITS', 'SCOPE_CABINETS', 'CASE_STATUS']) {
    assert.ok(MB[k], 'MB.' + k + ' defined');
    assert.deepEqual(plain(MB[k]), plain(V[k]), k);
  }
  for (const s of V.CASE_STYLES) assert.deepEqual(plain(MB.caseStyle(s.key)), plain(V.caseStyle(s.key)));
  for (const c of V.CASE_CABINETS) assert.deepEqual(plain(MB.caseCabinet(c.key)), plain(V.caseCabinet(c.key)));
  assert.equal(MB.caseStyle('boho'), null);
  assert.equal(MB.caseCabinet('sofa'), null);
  const scopes = [[], ['全屋 Whole house'], ['厨房 Kitchen', '电视柜 TV feature'], ['门 · 墙板 Doors & wall panels'], ['书房 Study', '浴室柜 Vanity', '鞋柜 Shoe cabinet'], '衣柜 Wardrobe', ['成品家具 Loose furniture']];
  for (const s of scopes) assert.deepEqual(plain(MB.scopeCabinets(s)), V.scopeCabinets(s), JSON.stringify(s));
});

test('vocab: contract content (9 styles, 15 cabinets, 14 rooms, 5 ptypes, 4 traits)', () => {
  assert.deepEqual(V.CASE_STYLES.map((s) => s.key), ['wood', 'wabi', 'cream', 'french', 'midcentury', 'modern', 'japandi', 'nordic', 'luxe']);
  assert.deepEqual(V.CASE_STYLES.map((s) => s.series), ['misty', 'wabi', 'misty', 'weaving', 'weaving', 'skeleton', 'misty', 'misty', 'mountain']);
  assert.deepEqual(V.CASE_CABINETS.map((c) => c.key), ['kitchen', 'wardrobe', 'display', 'bookcase', 'bedend', 'dresser', 'island', 'tvcab', 'tvwall', 'door', 'shoe', 'bathvanity', 'wallpanel', 'sideboard', 'bed']);
  assert.equal(V.CASE_ROOMS.length, 14);
  assert.deepEqual(V.CASE_PTYPES.map((p) => p.key), ['condo', 'landed', 'terrace', 'semid', 'bungalow']);
  assert.deepEqual(V.CASE_TRAITS.map((t) => t.key), ['elderly', 'kids', 'pets', 'helper']);
  assert.equal(V.seriesOf('luxe'), 'mountain');
  assert.equal(V.seriesOf('nope'), '');
});

test('vocab: consistent with VISI (MB.ROOM keys, series, caseNote traits)', () => {
  const data = readFileSync(join(INVITE, 'assets/js/visi/data.js'), 'utf8');
  const copy = readFileSync(join(INVITE, 'assets/js/visi/copy.js'), 'utf8');
  // MB.ROOMS 的 key（data.js 里每个空间是 key: 'xxx', en: …）
  const roomKeys = [...data.matchAll(/\bkey: '([a-z]+)', en: '[^']+', zh: '[^']+',\s*\n\s*head:/g)].map((m) => m[1]);
  assert.deepEqual([...roomKeys, 'other'].sort(), [...V.CASE_ROOMS].sort(), 'CASE_ROOMS = MB.ROOM keys + other');
  for (const c of V.CASE_CABINETS) for (const r of c.rooms) assert.ok(V.CASE_ROOMS.includes(r), c.key + ' → ' + r);
  for (const s of V.CASE_STYLES) assert.ok(data.includes("series: '" + s.series + "'"), 'series ' + s.series + ' exists in MB.SERIES');
  for (const t of V.CASE_TRAITS) assert.match(copy, new RegExp('\\b' + t.key + ': \\['), 'caseNote TRAIT has ' + t.key);
  for (const s of V.SCOPE_CABINETS) for (const c of s.cabinets) assert.ok(V.isCabinet(c), s.scope + ' → ' + c);
});

test('vocab: match patterns recognise brief options and folder names', () => {
  const first = (list, text) => (list.find((x) => new RegExp(x.match, 'i').test(text)) || {}).key || '';
  const brief = readFileSync(join(INVITE, 'brief.html'), 'utf8');
  const styleOpts = [...brief.matchAll(/name="style" value="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(styleOpts.length >= 7);
  const got = Object.fromEntries(styleOpts.map((s) => [s, first(V.CASE_STYLES, s)]));
  assert.deepEqual(got, {
    '原木 Natural wood': 'wood', '微侘寂 Subtle wabi-sabi': 'wabi', '奶油风 Cream style': 'cream', '轻法式 Light French': 'french',
    '中古 Mid-century': 'midcentury', '现代简约 Modern minimal': 'modern', '日式 Japandi': 'japandi', '北欧 Nordic': 'nordic',
    '轻奢 Modern luxe': 'luxe', '还没想好 Not decided': ''
  });
  // 旧的需求卡（客户手上还没送出的）照样认得
  assert.equal(first(V.CASE_STYLES, '自然原木 Natural wood'), 'wood');
  assert.equal(first(V.CASE_STYLES, '侘寂 Wabi-sabi'), 'wabi');
  assert.equal(first(V.CASE_STYLES, 'Setia Alam 原木 测试客户'), 'wood');
  assert.equal(first(V.CASE_STYLES, 'Puchong 奶油风 测试'), 'cream');
  const ptypeOpts = [...brief.matchAll(/name="ptype" value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(Object.fromEntries(ptypeOpts.map((s) => [s, first(V.CASE_PTYPES, s)])), {
    '公寓 Condo': 'condo', '排屋 Terrace': 'terrace', '半独立 Semi-D': 'semid', '独立 Bungalow': 'bungalow', '商用 Commercial': ''
  });
  assert.deepEqual(V.scopeCabinets(['全屋 Whole house']), ['kitchen', 'wardrobe', 'display', 'tvcab', 'tvwall', 'shoe', 'bathvanity', 'sideboard']);
  assert.deepEqual(V.scopeCabinets('厨房 Kitchen'), ['kitchen', 'island']);
  assert.deepEqual(V.scopeCabinets(['门 · 墙板 Doors & wall panels']), ['door', 'wallpanel']);
  assert.deepEqual(V.scopeCabinets(['成品家具 Loose furniture']), []);
  assert.deepEqual(V.scopeCabinets(null), []);
});

test('vocab: browser file is plain ES5 (no modules, arrows, let/const, template strings)', () => {
  new vm.Script(src);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/=>/.test(code), 'no arrow functions');
  assert.ok(!/\b(let|const|class)\s/.test(code), 'no let/const/class');
  assert.ok(!/`/.test(code), 'no template strings');
  assert.ok(!/^\s*(import|export)\b/m.test(code), 'no ES modules');
  assert.match(code, /^\(function \(\) \{\n  'use strict';/m);
});
