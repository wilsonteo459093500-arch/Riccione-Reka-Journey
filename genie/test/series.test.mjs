// 溪岸五大系列（src/shared/series.js —— docs/showcase/SERIES.md §1）：
//   五个系列的名字和设计理念（照 VISI / 品牌手册的原文，一个字都不改）、名字 → key、每个系列的目标客人（SERIES_TARGET），
//   以及 recommendSeries：只用客人自己的答案，固定（同样的答案 = 同样的结果），16 张牌都有像样的建议、不会老是同一个系列。
// 跑法：node test/series.test.mjs（npm test 会一起跑）
//
// 校准（16 张牌，四条轴在牌的中心：字母那一侧 80、另一侧 20；暗轴没答、没选图、没愿望 —— 只有轴 + 牌的风格）：
//   I    WMNH 暖木禅居   → 侘寂东方 0.91 · 织 0.91 · 空山 0.908（同分：算进去的轴多的在前）
//   II   WMND 静物策展人 → 空山 0.983 · 织 0.91
//   III  WMRH 柔光雅士   → 雾山 0.777 · 骨骼线 0.738
//   IV   WMRD 画廊主人   → 骨骼线 0.798 · 空山 0.788
//   V    WLNH 暖巢守护者 → 织 0.817 · 侘寂东方 0.80
//   VI   WLND 自在旅人   → 织 0.877 · 骨骼线 0.788
//   VII  WLRH 丝绒古典家 → 骨骼线 0.848
//   VIII WLRD 故事收藏家 → 骨骼线 0.848
//   IX   CMNH 北欧清风   → 雾山 0.91 · 空山 0.858
//   X    CMND 清寂素居   → 空山 0.873 · 雾山 0.85
//   XI   CMRH 都会极简家 → 雾山 0.843
//   XII  CMRD 现代建筑师 → 雾山 0.843 · 空山 0.798
//   XIII CLNH 森林隐居者 → 侘寂东方 0.70 · 织 0.683 · 雾山 0.683
//   XIV  CLND 灵感工作室 → 织 0.683 · 雾山 0.683
//   XV   CLRH 午夜爵士   → 骨骼线 0.663
//   XVI  CLRD 都会收藏家 → 骨骼线 0.663
//   = 骨骼线 5 · 空山 2 · 织 3 · 雾山 4 · 侘寂东方 2。示范客人：Peggy（WMNH，圆润、明亮、要孩子安心）→ 织、空山；
//   Ken & Mei（CMRD，很亮、很利落）→ 空山 / 雾山；Aisha（WLND，藤编、旅行）→ 织。
//   改 SERIES_TARGET / SERIES_WEIGHTS / CARD_STYLES 以后跑一次，看下面印出来的表，再更新这一段。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../src/shared/series.js';
import { DREAMERS, AXES } from '../src/shared/dreamers.js';
import { MAT_BY_ID } from '../src/shared/materials.js';
import { buildProfile } from '../src/shared/profile.js';
import * as FLOW from '../src/quiz/flow.js';
import { setLang as setLang0 } from '../src/shared/i18n.js';
import EN from '../src/shared/i18n/en.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SORTER = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/cases/sorter/data.json'), 'utf8'));
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
async function inEnglish(fn) {
  setLang('en');
  try {
    return await fn();
  } finally {
    setLang('zh');
  }
}

// 示范客人（和 test/cases.test.mjs、test/showcase.test.mjs 同一套）
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
const tableProfile = (g) => ({ code: g.code, axes: g.axes, hidden: g.hidden, wishes: g.wishes, avoid: g.avoid, home: g.home, answers: { pairs: pairsOf(g.picks) } });
function realProfile(g) {
  const p = buildProfile({ name: g.name, players: 'solo', pairs: pairsOf(g.picks), wishes: g.wishes, avoid: g.avoid, life: g.life, ratio: g.ratio, ratioTouched: true }, {}, { PAIRS: FLOW.PAIRS, LIFE: FLOW.LIFE });
  return { ...p, home: g.home };
}
const center = (code) => Object.fromEntries(AXES.map((a, i) => [a.id, code[i] === a.a.k ? 80 : 20]));
const keysOf = (rec) => rec.map((x) => x.key);
const line = (rec) => rec.map((x) => `${S.SERIES_BY_KEY[x.key].zh} ${x.score}`).join(' · ');

console.log('溪岸五大系列（series）');

// ───────────────────────── 1. 五个系列：名字、顺序、文字 ─────────────────────────

// 照 VISI 的 MB.SERIES_CONCEPT（老板认可的品牌手册文字）—— 这里写死，谁改了一个字都会被抓到
const BRAND = {
  skeleton: {
    zh: '骨骼线', en: 'Skeleton Line', family: { zh: '溪岸 · 自然线系列', en: 'SAIL · Natural Line' },
    title: { zh: '在时间的长河，寻找关于家具的记忆。', en: 'In the long river of time, looking for the memory of furniture.' },
    body: { zh: '我们将古典家具美学融入现代设计，打造「没那么现代」的设计：用柜子本身的装饰线条形成把手，营造家具的自然生长感。', en: 'We bring the beauty of classical furniture into modern design — a design that is “not quite so modern”. The cabinet’s own lines become its handles, so the furniture feels as if it grew there.' },
    note: { zh: '灵感取自古典实木家具的形态：骨骼结构既是装饰，也是把手。', en: 'Inspired by classical solid-wood furniture: the frame is both the ornament and the handle.' },
  },
  mountain: {
    zh: '空山', en: 'Empty Mountain', family: { zh: '溪岸 · 自然线系列', en: 'SAIL · Natural Line' },
    title: { zh: '入空山，感物近人。', en: 'Enter the empty mountain, and feel close to things and people.' },
    body: { zh: '我们弱化不必要的设计与装饰，以「退一步」的产品形态，消融大型柜体在空间里的存在感，衬托空间真正的主角，把视线重新聚焦到生活与人本身。', en: 'We pare back unnecessary design and ornament. With a form that “takes a step back”, large cabinetry quietly dissolves into the room, leaving the focus on life and the people living it.' },
    note: { zh: '以「退」为设计哲学，「空而不空」的陈列美学。', en: '“Stepping back” as a design philosophy — display that is empty, yet never empty.' },
  },
  weaving: {
    zh: '织', en: 'Weaving', family: { zh: '溪岸 · 自然线系列', en: 'SAIL · Natural Line' },
    title: { zh: '自然柔韧，回归感性生活。', en: 'Natural and supple — back to a life of the senses.' },
    body: { zh: '织系列汲取麻纤维织物的质感，以织物的朴素美学，唤醒对生活与材料的感知力。', en: 'Weaving draws on the texture of woven linen fibre; its quiet, honest beauty reawakens how we feel our life and our materials.' },
    note: { zh: '在城市的喧嚣中迷失的感觉，在接近麻纤维的时候，会慢慢平复下来。', en: 'What gets lost in the noise of the city slowly settles when you are close to linen.' },
  },
  misty: {
    zh: '雾山', en: 'Misty Mountain', family: null,
    title: { zh: '雾山春居。', en: 'A spring house on the misty mountain.' },
    body: { zh: '以「雾山春居」为设计灵感：山腰一间木屋，以更自由的产品、更身心共融的家，将春日里雾山平和、纯粹、轻盈、充沛的自然表达，尽诉其中。', en: 'Inspired by a spring house on a misty mountain: a timber cabin halfway up the slope. With freer pieces and a home where body and mind are at ease, it holds all the calm, purity, lightness and fullness of the mountain in spring.' },
    note: { zh: '轻于色、安于形：取晨雾之「灰」、春山之「木」、早春山间将有未有之「绿」，消隐大型柜体的存在感，让空间平静温和。', en: 'Light in colour, at ease in form: the grey of morning mist, the wood of the spring hills and the green that is only just arriving — large cabinetry fades back and the room stays calm and gentle.' },
    quote: { zh: '「我心中有一种东西像薄雾，我被它包裹着……让我们保持安静，被生活环绕……」—— 费尔南多·佩索阿', en: '“There is something in me like a mist, and I am wrapped in it… let us stay quiet, surrounded by life…” — Fernando Pessoa' },
  },
  wabi: {
    zh: '侘寂东方', en: 'Wabi-Sabi Eastern', family: { zh: '溪岸 · 实木系列', en: 'SAIL · Solid Wood' },
    title: { zh: '山，有它的时间。', en: 'Mountains have their own time.' },
    body: { zh: '我们将东方哲思中「关于时间的探索」融入设计，在造物与空间中，注入对生命流动的理解与尊重。', en: 'We bring the Eastern way of thinking about time into design, so that every piece and every space carries an understanding of, and respect for, the flow of life.' },
    note: { zh: '打磨出能滋养心灵、连接自然、经得起时间洗礼的设计。', en: 'Design that nourishes the mind, connects with nature, and stands the test of time.' },
  },
};

await test('SERIES：正好五个，品牌手册 p.6 的顺序（骨骼线 · 空山 · 织 · 雾山 · 侘寂东方）；名字、family、title / body / note（雾山还有 quote）和 VISI 的原文一字不差', () => {
  assert.deepEqual(S.SERIES_KEYS, ['skeleton', 'mountain', 'weaving', 'misty', 'wabi']);
  assert.deepEqual(S.SERIES.map((s) => s.zh), ['骨骼线', '空山', '织', '雾山', '侘寂东方']);
  for (const s of S.SERIES) {
    const b = BRAND[s.key];
    const { key, ...rest } = s;
    assert.deepEqual(rest, b, key);
    assert.equal(S.SERIES_BY_KEY[key], s);
    for (const f of ['title', 'body', 'note', 'quote', 'family']) if (s[f]) assert.ok(!HAN.test(s[f].en) && HAN.test(s[f].zh), `${key}.${f}`);
  }
  assert.equal(S.SERIES_BY_KEY.misty.family, null, '雾山 is not in a family');
  assert.ok(Object.isFrozen(S.SERIES) && Object.isFrozen(S.SERIES[0]) && Object.isFrozen(S.SERIES[0].title), 'frozen: the UI cannot change the brand text by accident');
});

await test('英文在词典里（en-cases.js）：L() / t() 拿到的和 SERIES 里的 en 一样（「织」= Weaving）', async () => {
  for (const s of S.SERIES) {
    assert.equal(EN[s.zh], s.en, s.zh);
    for (const f of ['title', 'body', 'note', 'quote', 'family']) if (s[f]) assert.equal(EN[s[f].zh], s[f].en, `${s.key}.${f}`);
  }
  await inEnglish(() => assert.deepEqual(S.SERIES.map((s) => S.seriesName(s.key)), ['Skeleton Line', 'Empty Mountain', 'Weaving', 'Misty Mountain', 'Wabi-Sabi Eastern']));
  assert.deepEqual(S.SERIES.map((s) => S.seriesName(s.key)), ['骨骼线', '空山', '织', '雾山', '侘寂东方']);
  assert.equal(S.seriesName('自然线'), '');
});

await test('seriesKeyOf：中文 / 英文 / key / 旧名字（大小写、空格、「系列」「溪岸」都不管）→ key；自然线、庭前、侘寂、乱写的 → null', () => {
  const table = [
    ['骨骼线', 'skeleton'], ['Skeleton Line', 'skeleton'], ['skeleton', 'skeleton'], ['SKELETON LINE', 'skeleton'], ['Skeletal Line', 'skeleton'], ['骨骼线系列', 'skeleton'],
    ['空山', 'mountain'], ['空山系列', 'mountain'], ['Empty Mountain', 'mountain'], ['Kongshan', 'mountain'], ['溪岸 · 空山', 'mountain'], ['mountain', 'mountain'],
    ['织', 'weaving'], ['织系列', 'weaving'], ['Weaving', 'weaving'], ['Zhi', 'weaving'], ['weaving series', 'weaving'],
    ['雾山', 'misty'], ['Misty Mountain', 'misty'], ['misty-mountain', 'misty'], ['SAIL Misty Mountain', 'misty'],
    ['侘寂东方', 'wabi'], ['侘寂东方系列', 'wabi'], ['Wabi-Sabi Eastern', 'wabi'], ['wabi sabi eastern', 'wabi'], ['wabi', 'wabi'],
    ['自然线', null], ['自然线系列', null], ['庭前', null], ['侘寂', null], ['原木', null], ['', null], ['   ', null], [null, null], [undefined, null], [42, null], ['轻衫织', null],
  ];
  for (const [inp, out] of table) assert.equal(S.seriesKeyOf(inp), out, String(inp));
  assert.equal(S.seriesKeyOf(S.SERIES_BY_KEY.wabi), 'wabi', 'a series object');
  assert.equal(S.seriesKeyOf({ key: 'misty' }), 'misty');
  assert.equal(S.seriesKeyOf({}), null);
});

// ───────────────────────── 2. SERIES_TARGET（资料） ─────────────────────────

await test('SERIES_TARGET：五个都有；轴的数字照 SERIES.md；材质 / 直觉题选项 / 愿望 / 风格标签都认得；CARD_STYLES 16 张牌都有', () => {
  const T = S.SERIES_TARGET;
  assert.deepEqual(Object.keys(T), S.SERIES_KEYS);
  assert.deepEqual([T.skeleton.axes, T.skeleton.hidden], [{ temp: 75, density: 40, texture: 50, storage: 50 }, { light: 40, curve: 30 }]);
  assert.deepEqual([T.mountain.axes, T.mountain.hidden], [{ temp: 60, density: 85, texture: 65, storage: 35 }, { light: 65, curve: 35 }]);
  assert.deepEqual([T.weaving.axes, T.weaving.hidden], [{ temp: 70, density: 55, texture: 90 }, { light: 55, curve: 65 }]);
  assert.deepEqual([T.misty.axes, T.misty.hidden], [{ temp: 40, density: 75, texture: 60 }, { light: 70, curve: 55 }]);
  assert.deepEqual([T.wabi.axes, T.wabi.hidden], [{ temp: 70, density: 60, texture: 90, storage: 60 }, { light: 35 }]);
  assert.deepEqual(T.skeleton.styles, ['中古', '原木', '美式复古', '法式']);
  assert.deepEqual(T.mountain.styles, ['极简', '原木', '侘寂']);
  assert.deepEqual(T.weaving.styles, ['侘寂', '南洋']);
  assert.deepEqual(T.misty.styles, ['极简', '奶油']);
  assert.deepEqual(T.wabi.styles, ['侘寂']);
  const styleIds = new Set(SORTER.styles.map((s) => s.id));
  const pickIds = new Set(FLOW.PAIRS.flatMap((p) => FLOW.optionsOf(p).map((o) => `${p.id}:${o.v}`)));
  const wishIds = new Set(FLOW.WISHES.map((w) => w.v));
  for (const [key, t] of Object.entries(T)) {
    for (const v of [...Object.values(t.axes), ...Object.values(t.hidden || {})]) assert.ok(v >= 0 && v <= 100, `${key} ${v}`);
    for (const k of Object.keys(t.axes)) assert.ok(['temp', 'density', 'texture', 'storage'].includes(k), `${key} axis ${k}`);
    for (const k of Object.keys(t.hidden || {})) assert.ok(['light', 'curve'].includes(k), `${key} hidden ${k}`);
    for (const s of t.styles) assert.ok(styleIds.has(s), `${key} style ${s} is a sorter style`);
    for (const id of t.mats) assert.ok(MAT_BY_ID[id] && !MAT_BY_ID[id].board, `${key} material ${id}`);
    for (const id of t.picks) assert.ok(pickIds.has(id), `${key} pick ${id}`);
    for (const w of t.wishes) assert.ok(wishIds.has(w), `${key} wish ${w}`);
  }
  assert.deepEqual(Object.keys(S.CARD_STYLES).sort(), DREAMERS.map((d) => d.code).sort());
  for (const [code, tags] of Object.entries(S.CARD_STYLES)) for (const s of tags) assert.ok(styleIds.has(s), `${code} ${s}`);
});

// ───────────────────────── 3. recommendSeries ─────────────────────────

await test('recommendSeries：五个都在、最合适的在前（分数从高到低）；固定（再算一次一模一样）；不改客人的档案', () => {
  for (const g of Object.values(GUESTS)) {
    for (const p of [tableProfile(g), realProfile(g)]) {
      const before = JSON.stringify(p);
      const a = S.recommendSeries(p);
      assert.deepEqual(keysOf(a).sort(), [...S.SERIES_KEYS].sort());
      for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].score >= a[i].score, `${g.name} sorted`);
      assert.deepEqual(S.recommendSeries(p), a, 'deterministic');
      assert.equal(JSON.stringify(p), before, 'profile untouched');
      for (const x of a) {
        assert.deepEqual(Object.keys(x).sort(), ['key', 'parts', 'reasons', 'score']);
        assert.ok(x.reasons.length <= 3);
      }
    }
  }
});

await test('校准：16 张牌（轴在牌的中心）—— 每个系列至少是一张牌的第一名，没有一个系列拿到 6 张以上（印出来的表见文件开头）', () => {
  const wins = Object.fromEntries(S.SERIES_KEYS.map((k) => [k, []]));
  console.log('    牌（轴在中心）→ 建议的系列');
  for (const d of DREAMERS) {
    const rec = S.recommendSeries({ code: d.code, axes: center(d.code) });
    wins[rec[0].key].push(d.code);
    console.log(`      ${d.num.padEnd(4)} ${d.code} ${d.zh.padEnd(5, '　')} → ${line(rec.slice(0, 3))}`);
  }
  console.log(`    ${S.SERIES.map((s) => `${s.zh} ${wins[s.key].length}`).join(' · ')}`);
  for (const k of S.SERIES_KEYS) assert.ok(wins[k].length >= 1, `${k} is never the top pick`);
  for (const k of S.SERIES_KEYS) assert.ok(wins[k].length <= 6, `${k} wins ${wins[k].length} cards: ${wins[k].join(' ')}`);
  // 几张一看就知道的牌
  const top = (code) => S.recommendSeries({ code, axes: center(code) })[0].key;
  assert.equal(top('WMRD'), 'skeleton', '画廊主人（中古画廊）→ 骨骼线');
  assert.equal(top('WLRH'), 'skeleton', '丝绒古典家 → 骨骼线');
  assert.equal(top('WMND'), 'mountain', '静物策展人（少，但每一件都有故事）→ 空山的「空而不空」');
  assert.equal(top('WLND'), 'weaving', '自在旅人（藤编）→ 织');
  assert.equal(top('CMNH'), 'misty', '北欧清风 → 雾山');
  assert.ok(['mountain', 'wabi'].includes(top('WMNH')), '暖木禅居 → 空山 / 侘寂东方');
});

await test('示范客人（印出来）：Peggy → 织（空山第二）；Ken & Mei → 空山 / 雾山；Aisha → 织', () => {
  const tops = {};
  for (const [k, g] of Object.entries(GUESTS)) {
    for (const [mode, p] of [['table', tableProfile(g)], ['real', realProfile(g)]]) {
      const rec = S.recommendSeries(p);
      tops[`${k}/${mode}`] = keysOf(rec);
      console.log(`      ${g.name.padEnd(9)} ${mode.padEnd(5)} ${p.code} → ${line(rec.slice(0, 3))} | ${rec[0].reasons.map(S.seriesReasonText).join(' / ')}`);
    }
  }
  for (const m of ['table', 'real']) {
    assert.deepEqual(tops[`peggy/${m}`].slice(0, 2), ['weaving', 'mountain'], `peggy/${m}`);
    assert.deepEqual(tops[`ken/${m}`].slice(0, 2).sort(), ['misty', 'mountain'], `ken/${m}`);
    assert.equal(tops[`aisha/${m}`][0], 'weaving', `aisha/${m}`);
  }
});

await test('合理性：暖、简、朴、藏（暖木禅居）→ 空山 / 侘寂东方在最前面附近；清、亮、简 → 雾山；爱质感的暖、朴 → 织 / 侘寂东方；暖、丰、中古画廊 → 骨骼线', () => {
  const zen = S.recommendSeries({ code: 'WMNH', axes: { temp: 85, density: 85, texture: 85, storage: 85 }, hidden: { light: 50, curve: 50 } });
  const near = zen.filter((x) => x.score >= zen[0].score - 0.03).map((x) => x.key);
  assert.ok(near.includes('mountain') || near.includes('wabi'), `zen: ${line(zen)}`);
  assert.ok(keysOf(zen).slice(0, 2).some((k) => k === 'mountain' || k === 'wabi'), `zen top 2: ${line(zen)}`);
  const zenHidden = S.recommendSeries({ code: 'WMNH', axes: { temp: 80, density: 80, texture: 80, storage: 80 } });
  assert.ok(['mountain', 'wabi'].includes(zenHidden[0].key), line(zenHidden));
  const coolBright = S.recommendSeries({ code: 'CMNH', axes: { temp: 20, density: 85, texture: 55, storage: 60 }, hidden: { light: 85, curve: 50 } });
  assert.equal(coolBright[0].key, 'misty', line(coolBright));
  const coolBright2 = S.recommendSeries({ code: 'CMRH', axes: { temp: 25, density: 80, texture: 40, storage: 65 }, hidden: { light: 85 } });
  assert.equal(coolBright2[0].key, 'misty', line(coolBright2));
  const texture = S.recommendSeries({ code: 'WLNH', axes: { temp: 85, density: 50, texture: 95, storage: 50 }, hidden: { light: 50, curve: 60 } });
  assert.ok(['weaving', 'wabi'].includes(texture[0].key), line(texture));
  const textureMoody = S.recommendSeries({ code: 'WMNH', axes: { temp: 80, density: 65, texture: 95, storage: 65 }, hidden: { light: 30 }, answers: { pairs: pairsOf('table:a night:b') } });
  assert.equal(textureMoody[0].key, 'wabi', `solid timber + dim lamps → 侘寂东方: ${line(textureMoody)}`);
  const gallery = S.recommendSeries({ code: 'WLRD', axes: { temp: 85, density: 25, texture: 40, storage: 25 }, hidden: { light: 40, curve: 30 } });
  assert.equal(gallery[0].key, 'skeleton', line(gallery));
  const galleryM = S.recommendSeries({ code: 'WMRD', axes: { temp: 80, density: 45, texture: 40, storage: 25 }, hidden: { light: 45, curve: 30 } });
  assert.equal(galleryM[0].key, 'skeleton', line(galleryM));
});

await test('理由只说客人自己的答案：喜欢的取向（同一边才说）、自己选的图、自己的愿望、自己的牌；没答的不说', () => {
  const p = realProfile(GUESTS.peggy);
  const rec = S.recommendSeries(p);
  const weaving = rec.find((x) => x.key === 'weaving');
  assert.deepEqual(weaving.reasons.map((r) => r.kind), ['traits', 'pick', 'wishes']);
  assert.equal(S.seriesReasonText(weaving.reasons[0]), '你喜欢亚麻一样的质感，也喜欢暖暖的木头');
  assert.equal(S.seriesReasonText(weaving.reasons[1]), '你选了「粗粗的、有温度」—— 这个系列就是这种感觉');
  assert.equal(S.seriesReasonText(weaving.reasons[2]), '也照顾到你的愿望「孩子玩得安心」');
  // 选的图：一定是客人选的那一张；愿望：一定是客人的愿望；牌：一定是客人的牌
  const labels = new Set(Object.entries(pairsOf(GUESTS.peggy.picks)).map(([id, a]) => FLOW.pickLabel(id, a.pick)));
  const wishLabels = new Set(FLOW.WISHES.filter((w) => GUESTS.peggy.wishes.includes(w.v)).map((w) => w.label));
  for (const x of rec) {
    for (const r of x.reasons) {
      if (r.kind === 'pick') assert.ok(labels.has(r.vars[0]), r.vars[0]);
      if (r.kind === 'wishes') assert.ok(wishLabels.has(r.vars[0]), r.vars[0]);
      if (r.kind === 'card') assert.equal(r.vars[0].zh, '暖木禅居');
    }
  }
  // 骨骼线（利落的线条）不对 Peggy（圆润 73）说「经典的线条」
  assert.ok(!JSON.stringify(rec.find((x) => x.key === 'skeleton').reasons).includes('经典的线条'));
  // 只有轴：没有选图 / 愿望的理由
  const axesOnly = S.recommendSeries({ axes: { temp: 85, density: 25, texture: 40, storage: 25 }, hidden: { curve: 20 } });
  const sk = axesOnly.find((x) => x.key === 'skeleton');
  assert.deepEqual(sk.reasons, [{ kind: 'traits', key: '你喜欢{0}，也喜欢{1}', vars: ['暖暖的木头', '经典的线条'] }]);
  assert.equal(S.seriesReasonText(sk.reasons[0]), '你喜欢暖暖的木头，也喜欢经典的线条');
  // 一条轴偏、一条刚好在中间（不说中间那条）
  const one = S.recommendSeries({ axes: { temp: 90, density: 50, texture: 50, storage: 50 } }).find((x) => x.key === 'skeleton');
  assert.deepEqual(one.reasons.map(S.seriesReasonText), ['你喜欢暖暖的木头']);
  // 什么都没答：五个都在、品牌手册的顺序、轴分 0.5、一句理由都没有
  for (const empty of [null, undefined, {}, { axes: {} }, 'x']) {
    const r = S.recommendSeries(empty);
    assert.deepEqual(keysOf(r), S.SERIES_KEYS, JSON.stringify(empty));
    assert.ok(r.every((x) => x.score === 0.5 && x.reasons.length === 0), JSON.stringify(r));
  }
});

await test('永远不看预算、时间、门铃、员工的笔记、名字：加上这些（含 home.budget）结果一模一样；理由里也没有', () => {
  for (const g of Object.values(GUESTS)) {
    const p = realProfile(g);
    const noisy = {
      ...p,
      name: 'ZZ-NAME',
      budget: 'RM 999k',
      timeline: '3 months ZZ',
      staffNote: 'ZZ-STAFF',
      designerNotes: 'ZZ-DESIGNER',
      phone: '0123456789',
      life: { ...p.life, bell: 'kitchen' },
      home: { ...p.home, budget: 'RM 888k', timeline: 'ZZ-SOON', notes: 'ZZ-NOTE' },
      insights: ['ZZ-INSIGHT'],
    };
    const a = S.recommendSeries(p);
    const b = S.recommendSeries(noisy);
    assert.deepEqual(b, a, g.name);
    const text = JSON.stringify(b) + b.flatMap((x) => x.reasons.map(S.seriesReasonText)).join(' ');
    for (const bad of ['ZZ', 'RM', '999', '888', '0123', 'budget', 'timeline']) assert.ok(!text.includes(bad), `${g.name}: ${bad}`);
  }
});

await test('客人挑的案例：写了系列的分量最重（挑一个空山的家 → 空山第一，理由先说那个家）；没写系列的看它的样子，加一点点；乱给的不出错', async () => {
  const p = realProfile(GUESTS.peggy);
  const base = S.recommendSeries(p);
  assert.equal(base[0].key, 'weaving');
  const mountainHome = { id: 'p-1', series: 'mountain', title: { zh: '测试之家', en: 'Test Home' } };
  const r = S.recommendSeries(p, { chosen: [mountainHome] });
  assert.equal(r[0].key, 'mountain');
  assert.deepEqual(r[0].reasons[0], { kind: 'chosen', key: '你挑的家「{0}」就是这个系列', vars: [{ zh: '测试之家', en: 'Test Home' }] });
  assert.equal(S.seriesReasonText(r[0].reasons[0]), '你挑的家「测试之家」就是这个系列');
  const gain = r.find((x) => x.key === 'mountain').score - base.find((x) => x.key === 'mountain').score;
  assert.ok(Math.abs(gain - S.SERIES_WEIGHTS.chosen) < 0.002, `+${gain}`);
  // 挑了别的系列 → 换过来（界面上的系列卡跟着变）
  const wabiHome = { ...mountainHome, id: 'p-2', series: '侘寂东方', title: { zh: '测试二', en: '' } };
  assert.equal(S.recommendSeries(p, { chosen: [wabiHome] })[0].key, 'wabi', 'legacy names work for chosen cases too');
  assert.equal(S.seriesReasonText(S.recommendSeries(p, { chosen: [wabiHome] })[0].reasons[0]), '你挑的家「测试二」就是这个系列');
  // 两个系列各挑一个：照客人自己的答案分高下
  const both = S.recommendSeries(p, { chosen: [mountainHome, wabiHome] });
  assert.deepEqual(keysOf(both).slice(0, 2), ['mountain', 'wabi']);
  // 最多算两个
  const three = S.recommendSeries(p, { chosen: [mountainHome, { ...mountainHome, id: 'p-3' }, { ...mountainHome, id: 'p-4' }] });
  assert.ok(Math.abs(three.find((x) => x.key === 'mountain').score - base.find((x) => x.key === 'mountain').score - 2 * S.SERIES_WEIGHTS.chosen) < 0.002);
  // 没写系列的（3D 方案）：看它的样子最像哪一个，+ chosenLook
  const concept = { id: 'seed-x', series: null, style: { axes: { temp: 20, density: 80, texture: 50, storage: 60 }, hidden: { light: 85 } } };
  const look = S.recommendSeries(p, { chosen: [concept] });
  const lg = look.find((x) => x.key === 'misty').score - base.find((x) => x.key === 'misty').score;
  assert.ok(Math.abs(lg - S.SERIES_WEIGHTS.chosenLook) < 0.002, `misty +${lg}`);
  assert.ok(!look.some((x) => x.reasons.some((r) => r.kind === 'chosen')), 'no "is from this series" for a case without a series');
  // 没有标题的家：不说名字
  const untitled = S.recommendSeries(p, { chosen: [{ series: 'misty' }] });
  assert.equal(untitled[0].key, 'misty');
  assert.equal(S.seriesReasonText(untitled[0].reasons[0]), '你挑的家里有一个就是这个系列');
  await inEnglish(() => assert.equal(S.seriesReasonText(untitled[0].reasons[0]), 'One of the homes you picked is from this series'));
  // 乱给的
  for (const bad of [null, undefined, 'x', [null, 1, 'y', {}], [{ series: 'nope' }]]) assert.deepEqual(S.recommendSeries(p, { chosen: bad }), base, JSON.stringify(bad));
  assert.deepEqual(S.recommendSeries(p, {}), base);
});

await test('英文：理由、系列名字都是英文；理由的中文模板和词都在词典里', async () => {
  const keys = new Set();
  const words = new Set();
  const all = [];
  for (const g of Object.values(GUESTS)) for (const p of [tableProfile(g), realProfile(g)]) all.push(...S.recommendSeries(p, { chosen: [{ series: 'misty', title: { zh: '测试', en: 'Test' } }] }));
  for (const d of DREAMERS) all.push(...S.recommendSeries({ code: d.code, axes: center(d.code), hidden: { light: 20, curve: 80 } }), ...S.recommendSeries({ code: d.code, axes: center(d.code), hidden: { light: 80, curve: 20 } }));
  for (const x of all) for (const r of x.reasons) {
    keys.add(r.key);
    for (const v of r.vars) if (typeof v === 'string') words.add(v);
  }
  for (const k of keys) assert.ok(EN[k], k);
  for (const w of words) assert.ok(EN[w], w);
  assert.ok(keys.size >= 5, [...keys].join(' | '));
  await inEnglish(() => {
    for (const x of all) for (const r of x.reasons) assert.ok(!HAN.test(S.seriesReasonText(r)), S.seriesReasonText(r));
    const sk = S.recommendSeries({ axes: { temp: 85, density: 25, texture: 40, storage: 25 }, hidden: { curve: 20 } }).find((x) => x.key === 'skeleton');
    assert.equal(S.seriesReasonText(sk.reasons[0]), 'You like warm wood and classic lines');
  });
});

await test('便宜：一次 < 0.2 ms', () => {
  const p = realProfile(GUESTS.aisha);
  for (let i = 0; i < 50; i++) S.recommendSeries(p);
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) S.recommendSeries(p, { chosen: [{ series: 'wabi', title: { zh: 'x', en: 'x' } }] });
  const ms = (performance.now() - t0) / 1000;
  assert.ok(ms < 0.2, `${ms.toFixed(3)} ms`);
});

await test('选的图只有材质沾边（不是这个系列点名的图）→ 照样加分，但理由只引用这个系列点名的图；caseRef 带系列 key', async () => {
  const H = await import('../src/shared/home.js');
  assert.equal(H.caseRef({ id: 'p-1', title: { zh: '家', en: 'Home' }, series: 'mountain' }).series, 'mountain');
  assert.equal(H.caseRef({ id: 'p-2', title: { zh: '家', en: 'Home' }, series: '空山' }).series, undefined);
  // 每一道直觉题的每一个选项单独选：任何系列的「你选了『X』」都只能是这个系列点名的那张图
  let checked = 0;
  for (const pair of FLOW.PAIRS) {
    for (const opt of FLOW.optionsOf ? FLOW.optionsOf(pair) : []) {
      const id = `${pair.id}:${opt.v}`;
      const rec = S.recommendSeries({ code: 'WMNH', axes: { temp: 50, density: 50, texture: 50, storage: 50 }, answers: { pairs: { [pair.id]: { pick: opt.v, ms: 2000 } } } });
      for (const r of rec) {
        for (const x of r.reasons || []) {
          if (x.kind !== 'pick') continue;
          checked++;
          assert.ok((S.SERIES_TARGET[r.key].picks || []).includes(id), `${r.key} quotes ${id}, which it does not name`);
        }
      }
    }
  }
  assert.ok(checked > 0, 'some pick reasons were produced');
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
