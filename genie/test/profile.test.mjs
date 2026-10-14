// node test/profile.test.mjs —— 档案逻辑：雷区颜色、计分公平、反应时间、生活方式替换、设计师提示、WhatsApp 摘要。

import assert from 'node:assert/strict';
import { DREAMERS, DREAMER_BY_CODE, AXES, codeOf } from '../src/shared/dreamers.js';
import { MATERIALS, MAT_BY_ID, SLOTS, fits } from '../src/shared/materials.js';
import { tagsOf } from '../src/shared/moods.js';
import { COLOR_TAGS, COLOR_FAMILIES, CHROMATIC, SHADES } from '../src/shared/colorTags.js';
import {
  buildProfile,
  scoreAxes,
  storagePlan,
  avoidMaterials,
  lifestyleSwaps,
  insights,
  reactionStats,
  quickPicksOf,
  slimProfile,
  packJSON,
  unpackJSON,
  PET_REASON,
  COOK_REASON,
  expired,
} from '../src/shared/profile.js';
import { profileText } from '../src/shared/summary.js';
import { setLang } from '../src/shared/i18n.js';
import { PAIRS, LIFE, APPLIANCES, NOGO_COLORS, NOGO_FINISHES } from '../src/quiz/flow.js';

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

const FLOW = { PAIRS, LIFE };
const COLOR = new Set(COLOR_FAMILIES);
const CHROMA = new Set(CHROMATIC);
const colorsOf = (id) => [...tagsOf(MAT_BY_ID[id])].filter((x) => COLOR.has(x));
const HAN = /[一-鿿]/;

/** 固定种子的随机数（mulberry32）：模拟结果每次一样，测试不会时好时坏 */
function rng(seed) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function answers(overrides = {}) {
  const pairs = {};
  for (const p of PAIRS) pairs[p.id] = { pick: 'a', ms: 1200 };
  return {
    name: 'Peggy',
    players: 'solo',
    pairs,
    life: { saturday: 'kitchen', home: 'drop', cook: 'light', bell: 'shoes', who: [] },
    shoes: 30,
    wardrobeDoors: 3,
    wardrobeFit: 'ok',
    longHang: 'some',
    books: 4,
    appliances: [],
    bulky: [],
    ratio: 25,
    wishes: ['storage', 'clean', 'health'],
    splurge: '',
    avoid: [],
    oneWish: '',
    ...overrides,
  };
}

/** 换材质的颜色规矩：① 完全没颜色的只换成没有色系的（灰 / 黑可以）；② 不多出原来没有的色相 */
function checkColorRules(swaps, where) {
  for (const s of swaps) {
    const from = colorsOf(s.from);
    const to = colorsOf(s.to);
    const family = to.filter((c) => !SHADES.includes(c));
    if (!from.length) assert.equal(family.length, 0, `${where} ${s.slot}: 无色系的 ${s.from} 换成了有色系的 ${s.to}（${family}）`);
    for (const c of to) if (CHROMA.has(c)) assert.ok(from.includes(c), `${where} ${s.slot}: ${s.from} → ${s.to} 多出了 ${c}`);
  }
}

console.log('雷区颜色');
await test('每个材质都在 colorTags.js 登记过；雷区颜色选项都是已知色系', () => {
  for (const m of MATERIALS) assert.ok(Array.isArray(COLOR_TAGS[m.id]), `${m.id} 没有登记色系（在 src/shared/colorTags.js 补一行）`);
  for (const id of Object.keys(COLOR_TAGS)) assert.ok(MAT_BY_ID[id], `colorTags.js 里的 ${id} 不在材质库`);
  for (const c of NOGO_COLORS) assert.ok(COLOR.has(c.v), c.v);
});
await test('明确的色系：雾粉是粉、浅木没有色系、只有四种深木', () => {
  assert.ok(tagsOf(MAT_BY_ID.blush).has('pink') && !tagsOf(MAT_BY_ID.blush).has('red'));
  assert.ok(tagsOf(MAT_BY_ID['blush-boucle']).has('pink'));
  assert.ok(tagsOf(MAT_BY_ID['sage-lacquer']).has('green'));
  assert.ok(tagsOf(MAT_BY_ID['warm-white']).has('beige') && !tagsOf(MAT_BY_ID['warm-white']).has('pink'));
  assert.ok(tagsOf(MAT_BY_ID.brass).has('yellow') && tagsOf(MAT_BY_ID.brass).has('gold'));
  for (const m of MATERIALS.filter((x) => x.cat === 'wood')) {
    const fam = colorsOf(m.id).filter((x) => x !== 'black');
    const dark = ['walnut', 'smoked-oak', 'cherry', 'ebony-oak'].includes(m.id);
    assert.deepEqual(fam, dark ? ['darkwood'] : [], `${m.id}: ${fam}`);
  }
  assert.ok(tagsOf(MAT_BY_ID.charcoal).has('grey') && tagsOf(MAT_BY_ID['black-matte']).has('black'));
  assert.ok(tagsOf(MAT_BY_ID['white-lacquer']).has('glossy') && tagsOf(MAT_BY_ID.carrara).has('marble'));
});
await test('雷区颜色 × 16 张牌：没有一个表面留着、或换出被避开的颜色；颜色规矩成立', () => {
  for (const c of NOGO_COLORS)
    for (const d of DREAMERS) {
      const { materials, swaps } = avoidMaterials(d.materials, [c.v]);
      for (const s of SLOTS) {
        assert.ok(!tagsOf(MAT_BY_ID[materials[s.id]]).has(c.v), `避开 ${c.v}：${d.code} ${s.id} = ${materials[s.id]}`);
        assert.ok(fits(materials[s.id], s.id), `${d.code} ${s.id}`);
      }
      checkColorRules(swaps, `避开 ${c.v} · ${d.code}`);
    }
});
await test('雷区质感 × 16 张牌：避开的质感不会留下，也不会带进新颜色', () => {
  for (const f of NOGO_FINISHES)
    for (const d of DREAMERS) {
      const { materials, swaps } = avoidMaterials(d.materials, [f.v]);
      for (const s of SLOTS) assert.ok(!tagsOf(MAT_BY_ID[materials[s.id]]).has(f.v), `避开 ${f.v}：${d.code} ${s.id}`);
      checkColorRules(swaps, `避开 ${f.v} · ${d.code}`);
    }
});
await test('回归：避开米黄不会变粉；避开粉色 / 绿色真的会换；避开黄色不动浅橡木', () => {
  const beige = avoidMaterials(DREAMER_BY_CODE.WMNH.materials, ['beige']).materials;
  for (const s of SLOTS) assert.ok(!tagsOf(MAT_BY_ID[beige[s.id]]).has('pink'), `WMNH 避开米黄后 ${s.id} = ${beige[s.id]}`);
  const pink = avoidMaterials(DREAMER_BY_CODE.WMRH.materials, ['pink']);
  assert.ok(pink.swaps.some((s) => s.from === 'blush-boucle'));
  const green = avoidMaterials(DREAMER_BY_CODE.CLNH.materials, ['green']).materials;
  for (const s of SLOTS) assert.ok(!tagsOf(MAT_BY_ID[green[s.id]]).has('green'), `CLNH 避开绿色后 ${s.id} = ${green[s.id]}`);
  const yellow = avoidMaterials(DREAMER_BY_CODE.WMNH.materials, ['yellow']);
  assert.equal(yellow.materials.floor, 'light-oak');
  assert.equal(yellow.swaps.length, 0);
});

console.log('计分公平');
await test('藏 / 展滑杆没碰过就不计分；碰过照算；旧答案（没有 ratioTouched）照算', () => {
  assert.equal(scoreAxes({ ratio: 25, ratioTouched: false }, FLOW).axes.storage, 51);
  assert.ok(scoreAxes({ ratio: 25, ratioTouched: true }, FLOW).axes.storage > 55);
  assert.ok(scoreAxes({ ratio: 25 }, FLOW).axes.storage > 55);
});
await test('摸一摸 / 光脚踩：b 侧的温度和 a 侧对称', () => {
  const fx = Object.fromEntries(PAIRS.map((p) => [p.id, p.fx]));
  assert.deepEqual(fx.touch.b, { texture: -2, temp: -0.5 });
  assert.deepEqual(fx.floor.b, { texture: -1.4, temp: -1 });
  for (const id of ['touch', 'floor']) assert.equal(fx[id].a.temp, -fx[id].b.temp, id);
});
await test('全选 a、滑杆没碰 → 还是 WMNH；没有答案各 51%', () => {
  const { axes } = scoreAxes(answers({ ratioTouched: false }), FLOW);
  assert.equal(codeOf(axes), 'WMNH');
  for (const ax of AXES) assert.equal(scoreAxes({}, FLOW).axes[ax.id], 51);
});
await test('一万次随手乱选（反应时间随机、滑杆没碰）：每条轴 45–55%，没有一张牌超过 12%', () => {
  const rand = rng(20261011);
  const RUNS = 10000;
  const aShare = Object.fromEntries(AXES.map((ax) => [ax.id, 0]));
  const cards = {};
  for (let i = 0; i < RUNS; i++) {
    const pairs = {};
    for (const p of PAIRS) pairs[p.id] = { pick: rand() < 0.5 ? 'a' : 'b', ms: Math.round(700 + rand() * 5000) };
    const { axes } = scoreAxes({ players: 'solo', pairs, ratio: 25, ratioTouched: false }, FLOW);
    for (const ax of AXES) if (axes[ax.id] >= 50) aShare[ax.id]++;
    const code = codeOf(axes);
    cards[code] = (cards[code] || 0) + 1;
  }
  for (const ax of AXES) {
    const share = aShare[ax.id] / RUNS;
    assert.ok(share >= 0.45 && share <= 0.55, `${ax.id} a 侧 ${(share * 100).toFixed(1)}%`);
  }
  for (const [code, k] of Object.entries(cards)) assert.ok(k / RUNS <= 0.12, `${code} ${((k / RUNS) * 100).toFixed(1)}%`);
});
await test('链接里保留每题的左右（left）', async () => {
  const a = answers();
  a.pairs.room = { pick: 'b', ms: 1234, left: 'b' };
  const back = await unpackJSON(await packJSON(slimProfile(buildProfile(a, {}, FLOW))));
  assert.equal(back.answers.pairs.room.left, 'b');
  assert.equal(back.answers.pairs.room.ms, 1200);
});

console.log('反应时间');
/** 第 1 题最快（要被跳过），wall / touch / guest / sofa 明显比自己平常快 */
function skewed(players = 'solo') {
  const a = answers({ players });
  const ms = { room: 300, wall: 900, touch: 1000, guest: 1100, sofa: 950 };
  for (const p of PAIRS) a.pairs[p.id] = { pick: 'a', ms: ms[p.id] ?? 3000 };
  return a;
}
await test('两个人 / 一家人玩：反应时间不加权', () => {
  const fast = answers({ players: 'couple' });
  const slow = answers({ players: 'couple' });
  for (const k of Object.keys(slow.pairs)) slow.pairs[k] = { pick: 'a', ms: 5000 };
  assert.deepEqual(scoreAxes(fast, FLOW), scoreAxes(slow, FLOW));
  const soloSlow = answers();
  for (const k of Object.keys(soloSlow.pairs)) soloSlow.pairs[k] = { pick: 'a', ms: 5000 };
  assert.ok(scoreAxes(answers(), FLOW).axes.temp > scoreAxes(soloSlow, FLOW).axes.temp);
});
await test('快 / 慢和客人自己的中位数比，第 1 题不算', () => {
  const rt = reactionStats(skewed().pairs);
  assert.equal(rt.n, PAIRS.length - 1);
  assert.equal(rt.median, 3000);
  assert.deepEqual(rt.quick.map((x) => x.id), ['wall', 'sofa', 'touch', 'guest']);
  assert.equal(rt.slow.length, 0);
  const even = answers();
  for (const k of Object.keys(even.pairs)) even.pairs[k] = { pick: 'a', ms: 6000 };
  const rtEven = reactionStats(even.pairs);
  assert.equal(rtEven.quick.length + rtEven.slow.length, 0, '一直都慢的人（读得慢、长辈）不该被标成快或慢');
});
await test('quickPicks：单人才有、最多 5 题、最快的在前；多人玩没有', () => {
  const p = buildProfile(skewed(), {}, FLOW);
  assert.deepEqual(p.quickPicks, [
    { id: 'wall', pick: 'a' },
    { id: 'sofa', pick: 'a' },
    { id: 'touch', pick: 'a' },
    { id: 'guest', pick: 'a' },
  ]);
  assert.deepEqual(buildProfile(skewed('couple'), {}, FLOW).quickPicks, []);
  const old = { ...p };
  delete old.quickPicks;
  assert.deepEqual(quickPicksOf(old), p.quickPicks, '旧档案（没有 quickPicks）也能现算');
});
await test('反应时间提示：只在单人时给、开头「参考：」、措辞客气', () => {
  const plan = storagePlan({});
  const solo = insights(buildProfile(skewed(), {}, FLOW), plan).map((x) => x.text);
  assert.ok(solo.some((x) => x.startsWith('参考：偏好快速决定')), solo.join('\n'));
  const slowOnes = answers();
  for (const p of PAIRS) slowOnes.pairs[p.id] = { pick: 'a', ms: ['wall', 'touch', 'guest'].includes(p.id) ? 9000 : 2000 };
  const slow = insights(buildProfile(slowOnes, {}, FLOW), plan).map((x) => x.text);
  assert.ok(slow.some((x) => x.startsWith('参考：喜欢对比再决定')), slow.join('\n'));
  const couple = insights(buildProfile(skewed('couple'), {}, FLOW), plan).map((x) => x.text);
  assert.ok(!couple.some((x) => x.startsWith('参考：')));
  const all = [...solo, ...slow, ...couple, ...insights(buildProfile(answers({ wishes: ['value'] }), {}, FLOW), plan).map((x) => x.text)];
  assert.ok(all.some((x) => x.startsWith('重视性价比')));
  for (const bad of ['预算敏感', '直觉型', '仔细比较', '秒选']) assert.ok(!all.some((x) => x.includes(bad)), bad);
});

console.log('生活方式替换（毛孩子）');
await test('有猫狗：沙发 / 点缀的丝绒、羊羔绒换成亚麻 / 皮革 / 毛毡，记进 lifeSwaps，不算雷区', () => {
  for (const pet of ['dog', 'cat'])
    for (const d of DREAMERS) {
      const p = buildProfile(answers({ life: { who: [pet] } }), {}, FLOW);
      const { materials, swaps } = lifestyleSwaps(d.materials, { life: { who: [pet] } });
      for (const slot of ['upholstery', 'accents']) {
        const m = MAT_BY_ID[materials[slot]];
        assert.ok(!['velvet', 'boucle'].includes(m.tex.type), `${d.code} ${slot} 还是 ${m.id}`);
        assert.ok(fits(m.id, slot));
      }
      for (const s of swaps) {
        assert.ok(['linen', 'leather', 'felt'].includes(MAT_BY_ID[s.to].tex.type), `${d.code} ${s.slot} → ${s.to}`);
        assert.equal(s.reason, PET_REASON);
      }
      checkColorRules(swaps, `${pet} · ${d.code}`);
      assert.equal(p.swaps.length, 0, '生活方式替换不进雷区列表');
    }
  const wmrh = lifestyleSwaps(DREAMER_BY_CODE.WMRH.materials, { life: { who: ['cat'] } });
  assert.deepEqual(wmrh.swaps.map((s) => s.slot).sort(), ['accents', 'upholstery']);
  assert.ok(lifestyleSwaps(DREAMER_BY_CODE.WMRH.materials, { life: { who: ['kids'] } }).swaps.every((s) => s.slot === 'countertop'), '小孩只换台面，不动软装');
});
await test('换的时候仍然避开雷区', () => {
  for (const c of [...NOGO_COLORS, ...NOGO_FINISHES])
    for (const d of DREAMERS) {
      const avoided = avoidMaterials(d.materials, [c.v]).materials;
      const { materials } = lifestyleSwaps(avoided, { life: { who: ['dog'] }, avoid: [c.v] });
      for (const slot of ['upholstery', 'accents']) assert.ok(!tagsOf(MAT_BY_ID[materials[slot]]).has(c.v), `${c.v} · ${d.code} ${slot} = ${materials[slot]}`);
    }
});
await test('谈话提示：毛孩子提到已经换掉；小孩也认洞石台面', () => {
  const plan = storagePlan({});
  const pet = buildProfile(answers({ life: { who: ['cat'] } }), {}, FLOW);
  pet.code = 'WMRH';
  const petMats = lifestyleSwaps(DREAMER_BY_CODE.WMRH.materials, { life: { who: ['cat'] } });
  pet.materials = petMats.materials;
  pet.lifeSwaps = petMats.swaps;
  const petTip = insights(pet, plan).find((x) => x.text.startsWith('有毛孩子'));
  assert.equal(petTip.level, 'note');
  assert.ok(petTip.text.includes('丝绒 / 羊羔绒已经换掉（沙发软包 → 亚麻、点缀 → 亚麻）'), petTip.text);
  const kids = buildProfile(answers({ life: { who: ['kids'] } }), {}, FLOW);
  assert.equal(kids.materials.countertop, 'quartz-travertine');
  assert.ok(kids.lifeSwaps.some((s) => s.why === 'kids' && s.from === 'travertine'));
  assert.ok(!insights(kids, plan).some((x) => x.text.includes('天然大理石')), '换成人造石后不再提醒台面怕酸');
  kids.materials = { ...kids.materials, floor: 'travertine' };
  assert.ok(insights(kids, plan).some((x) => x.text.startsWith('有小孩') && x.text.includes('洞石')));
});
await test('天天爆炒 / 有小孩：天然石台面换成同花色的人造石，仍然避开雷区；卡牌默认材质不变', () => {
  const heavy = { life: { cook: 'heavy', who: [] } };
  const cases = { travertine: 'quartz-travertine', calacatta: 'quartz-calacatta', carrara: 'quartz-white', terrazzo: 'quartz-white', nero: 'sintered' };
  for (const [from, to] of Object.entries(cases)) {
    const r = lifestyleSwaps({ countertop: from }, heavy);
    assert.equal(r.materials.countertop, to, from);
    assert.equal(r.swaps[0].why, 'cooking');
    assert.equal(r.swaps[0].reason, COOK_REASON);
  }
  assert.equal(lifestyleSwaps({ countertop: 'carrara' }, { life: { who: ['baby'] } }).swaps[0].why, 'kids');
  assert.deepEqual(lifestyleSwaps({ countertop: 'microcement' }, heavy).swaps, []);
  assert.deepEqual(lifestyleSwaps({ countertop: 'travertine' }, { life: { who: ['dog'] } }).swaps, []);
  assert.equal(lifestyleSwaps({ countertop: 'nero' }, { ...heavy, avoid: ['concrete'] }).materials.countertop, 'quartz-white', '目标踩雷就换下一个');
  const before = JSON.stringify(DREAMERS.map((d) => d.materials));
  for (const d of DREAMERS) for (const s of lifestyleSwaps(d.materials, heavy).swaps) assert.ok(fits(s.to, s.slot), `${d.code} ${s.slot} → ${s.to}`);
  assert.equal(JSON.stringify(DREAMERS.map((d) => d.materials)), before);
});
await test('皮革不做床品、窗帘；藤编不做沙发软包（卡牌默认材质都合规）', () => {
  assert.ok(!fits('black-leather', 'bedding') && !fits('cognac-leather', 'curtains') && !fits('rattan', 'upholstery'));
  assert.ok(fits('linen', 'bedding') && fits('cognac-leather', 'upholstery') && fits('rattan', 'accents'));
  for (const d of DREAMERS) for (const s of SLOTS) assert.ok(fits(d.materials[s.id], s.id), `${d.code} ${s.id} = ${d.materials[s.id]}`);
});

console.log('收纳与其他答案');
await test('鞋柜：留中段置物台的宽度 = 每 300mm 放 7 双', () => {
  assert.equal(storagePlan({ shoes: 70 }).shoeNicheMM, 3000);
  assert.equal(storagePlan({ shoes: 70 }).shoeCabinetMM, 2100);
  assert.equal(storagePlan({ shoes: 10 }).shoeNicheMM, 600);
  assert.equal(storagePlan({ shoes: 0 }).shoeNicheMM, 0);
  const p = buildProfile(answers({ shoes: 70 }), {}, FLOW);
  const tip = insights(p, storagePlan(p.storage, APPLIANCES)).find((x) => x.text.startsWith('鞋量大'));
  assert.ok(tip.text.includes('留中段置物台的话约 3000mm'), tip.text);
});
await test('帮佣 / 留宿客人 / 青少年 / 年货：都有设计要点', () => {
  const p = buildProfile(answers({ life: { who: ['helper', 'guests', 'teen'] }, bulky: ['festive'] }), {}, FLOW);
  const notes = insights(p, storagePlan(p.storage, APPLIANCES)).filter((x) => x.level === 'note').map((x) => x.text);
  for (const want of [
    '有帮佣：保姆房（单人床＋600 衣柜＋通风）、靠近湿厨房 / 晒衣处、独立厕所；问清楚平时谁下厨',
    '常有客人留宿：客房或书房做榻榻米 / 沙发床，预留被褥收纳',
    '有青少年：衣柜按成人 1.8 m 起、书桌 ≥1.2 m',
    '年货 / 柑 / 节庆装饰预留一组 600 深通高柜；团圆饭 8–10 人建议可伸缩圆桌＋折叠椅收纳',
  ])
    assert.ok(notes.includes(want), want);
});

console.log('梦想家牌的木头');
await test('地板 / 主题墙 / 柜体不会三个都是同一种木头；每张牌最多 3 种木头', () => {
  for (const d of DREAMERS) {
    const trio = ['floor', 'feature', 'cabinetry'].map((s) => d.materials[s]);
    if (trio.every((id) => MAT_BY_ID[id].cat === 'wood')) assert.ok(new Set(trio).size > 1, `${d.code} 三处都是 ${trio[0]}`);
    const woods = new Set(SLOTS.map((s) => d.materials[s.id]).filter((id) => MAT_BY_ID[id].cat === 'wood'));
    assert.ok(woods.size <= 3, `${d.code} 用了 ${woods.size} 种木头：${[...woods]}`);
  }
  const I = DREAMER_BY_CODE.WMNH.materials;
  const IX = DREAMER_BY_CODE.CMNH.materials;
  assert.deepEqual([I.feature, I.cabinetry, IX.feature, IX.cabinetry], ['sand-limewash', 'white-oak', 'oat', 'white-lacquer']);
});

console.log('WhatsApp 摘要');
await test('「见面要聊」只放要聊清楚 / 设计要点（最多 6 条），不放沟通建议', () => {
  const p = buildProfile(
    answers({ players: 'couple', life: { bell: 'shoes', cook: 'heavy', who: ['kids', 'cat', 'elder', 'altar', 'helper', 'teen'] }, shoes: 80, wishes: ['value', 'clean', 'health'], splurge: 'kitchen' }),
    { host: 'wilson' },
    FLOW
  );
  const plan = storagePlan(p.storage, APPLIANCES);
  const all = insights(p, plan);
  assert.ok(all.some((x) => x.level === 'tip'));
  const txt = profileText(p, plan, 'https://x');
  const lines = txt.split('\n');
  const at = lines.findIndex((l) => l.includes('见面要聊'));
  assert.ok(at > 0, txt);
  const block = lines.slice(at + 1).filter((l) => /^(⚠️|📐) /.test(l));
  assert.ok(block.length >= 1 && block.length <= 6, `${block.length} 条`);
  for (const tip of all.filter((x) => x.level === 'tip')) assert.ok(!txt.includes(tip.text), `沟通建议漏进摘要：${tip.text}`);
  assert.ok(txt.includes('最想藏玄关的鞋'));
});
await test('宝藏没动过的数字标「默认值，未确认」（只在有 touched 时）', () => {
  const mark = '（默认值，未确认）';
  const p = buildProfile(answers({ touched: { shoes: true }, ratioTouched: false }), {}, FLOW);
  assert.deepEqual(
    { shoes: p.storage.touched.shoes, wardrobe: p.storage.touched.wardrobe, books: p.storage.touched.books, ratio: p.storage.touched.ratio },
    { shoes: true, wardrobe: false, books: false, ratio: false }
  );
  const txt = profileText(p, storagePlan(p.storage, APPLIANCES));
  const store = txt.split('\n').find((l) => l.includes('收纳：'));
  assert.ok(!store.includes(`鞋柜 900mm${mark}`) && store.includes('鞋柜 900mm'), store);
  assert.ok(store.includes(`书墙 3,200mm${mark}`) && store.includes(`展 25${mark}`) && store.includes(`）${mark}`), store);
  const legacy = buildProfile(answers(), {}, FLOW);
  assert.equal(legacy.storage.touched, undefined);
  assert.ok(!profileText(legacy, storagePlan(legacy.storage, APPLIANCES)).includes(mark));
  const touchedWardrobe = buildProfile(answers({ touched: { wardrobeDoors: true, books: true }, ratioTouched: true }), {}, FLOW);
  assert.equal(profileText(touchedWardrobe, storagePlan(touchedWardrobe.storage, APPLIANCES)).split(mark).length - 1, 1, '只剩鞋子没动过');
});
await test('英文模式：摘要和谈话提示都是英文', () => {
  setLang('en', { reload: false });
  try {
    const p = buildProfile(
      answers({ players: 'solo', name: 'Peggy', life: { saturday: 'sofa', home: 'tidy', cook: 'heavy', bell: 'toys', who: ['kids', 'dog', 'teen', 'helper', 'guests', 'elder', 'wfh', 'altar'] }, shoes: 80, books: 12, bulky: ['festive', 'luggage', 'golf', 'quilts'], appliances: ['oven', 'steamoven'], wishes: ['value', 'clean', 'light'], splurge: 'bath', avoid: ['pink', 'glossy'], touched: { shoes: true } }),
      { host: 'wilson' },
      FLOW
    );
    p.code = 'WLRH';
    const plan = storagePlan(p.storage, APPLIANCES);
    for (const x of insights(p, plan)) assert.ok(!HAN.test(x.text), x.text);
    const txt = profileText(p, plan, 'https://x');
    const han = txt.split('\n').filter((l) => HAN.test(l.replace('丝绒古典家', '')));
    assert.deepEqual(han, [], han.join('\n'));
    assert.ok(txt.includes('Storage:') && txt.includes('To discuss when we meet') && txt.includes('(default — not confirmed)'), txt);
  } finally {
    setLang('zh', { reload: false });
  }
});

await test('客人版 WhatsApp 摘要：没有最想藏、设计语言、见面要聊、未确认标记；员工版照旧', () => {
  const p = buildProfile(
    { name: 'Peggy', pairs: Object.fromEntries(PAIRS.map((x) => [x.id, { pick: 'a', ms: 1500 }])), life: { saturday: 'sofa', home: 'drop', cook: 'heavy', bell: 'shoes', who: ['kids', 'cat'] }, shoes: 70, books: 3, wishes: ['storage', 'light', 'kitchen'], avoid: ['red'], storage: { touched: { shoes: true } } },
    {},
  );
  const plan = storagePlan(p.storage, APPLIANCES);
  const staff = profileText(p, plan, 'https://x/quiz.html?staff=1#bp=1');
  const client = profileText(p, plan, 'https://x/quiz.html#bp=1', { client: true });
  assert.ok(staff.includes('最想藏') && staff.includes('设计语言') && staff.includes('见面要聊'), staff);
  for (const s of ['最想藏', '设计语言', '见面要聊', '未确认', 'staff=1']) assert.ok(!client.includes(s), `${s}\n${client}`);
  assert.ok(client.includes('生活：周六') && client.includes('收纳：') && client.includes('三个愿望'), client);
});

await test('本机蓝图放多久：超过 keepDays 天的过期，没有日期的留着，0 = 不删', () => {
  const now = Date.parse('2026-10-12T00:00:00Z');
  const ago = (d) => ({ createdAt: new Date(now - d * 86400000).toISOString() });
  assert.equal(expired(ago(91), now, 90), true);
  assert.equal(expired(ago(89), now, 90), false);
  assert.equal(expired({}, now, 90), false);
  assert.equal(expired(ago(400), now, 0), false);
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
