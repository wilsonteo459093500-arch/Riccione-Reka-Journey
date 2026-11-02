// node test/quiz-v2.test.mjs —— 直觉之牌 v2（十题、每题 4–6 个选项）：牌会不会一面倒、选项有没有人选、旧档案还认不认得。
//
// 为什么要有这个测试：老板说「到最后得到的卡片基本上都是一样的」。v1（十二题二选一）在下面的客人模型里，
// 三成的人都是 WMNH。v2 把选项加到 4–6 个、每个选项的 fx 拆开（不再「暖 + 简」「清 + 丰」绑在一起），
// 再加两个计分修正（藏 / 展滑杆中点 30 %、四条轴减去展厅客人的平均 AXIS_CENTER）。这里用同一个客人模型证明：
//   · 写实的客人：16 张牌每张 ≥ 1.5 %，最多的一张 ≤ 15 %，两个陌生人撞牌的机会 Σp² ≤ 9 %；
//   · 客人模型偏一点 / 不偏（MUK 0.5 / 0）：照样 16 张都有人拿到，最多的一张 ≤ 15 % / 16 %；
//   · 两个人只差两题 → 一半以上拿到不同的牌（差三题 ≥ 60 %；只差一题 ≤ 40 %，牌不会一碰就变）；
//   · 六种很典型的人（日式原木、都会、波西米亚、深色、画廊、森林）拿到「对的」那张牌 ≥ 50 %；
//   · 每个选项都有 ≥ 5 % 的人选、没有一个 > 60 %；乱点的人也分散（≥ 12 张、没有一张 > 35 %）。
// 客人模型（设计师的草稿 scratchpad/cases/design/sim/pop.mjs，SPEC §2.6）：
//   每个客人有七个维度的口味 z ~ N(μ, 1)（维度之间有相关），μ = 马来西亚展厅客人的偏向 × MUK；
//   每题选效用最高的：0.85 · z·fx + 这个选项本身讨不讨喜（appeal）+ Gumbel 噪声（β = 1）；8 % 的人乱点；
//   生活题、滑杆、雷区、几个人玩也照模型抽；反应时间 ∝ 希克定律。计分用真的 scoreAxes。
// 固定种子：每次结果一样，< 10 秒。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAIRS, LIFE, LEGACY_PAIRS, QUIZ_V, optionsOf, pickLabel } from '../src/quiz/flow.js';
import { scoreAxes, buildProfile, quickPicksOf, reactionStats, slimProfile, packJSON, unpackJSON, AXIS_CENTER, RATIO_NEUTRAL, hick, QUICK_MS, SLOW_MS } from '../src/shared/profile.js';
import { codeOf, DREAMERS, AXES } from '../src/shared/dreamers.js';
import { MAT_BY_ID } from '../src/shared/materials.js';
import EN from '../src/shared/i18n/en.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T0 = Date.now();
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
const pct = (x) => (x * 100).toFixed(1) + '%';
const FLOW = { PAIRS, LIFE };

// ───────────────────────── 客人模型（移植自 sim/pop.mjs） ─────────────────────────

const DIMS = ['temp', 'density', 'texture', 'storage', 'light', 'curve', 'social'];
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => {
  let u = 0;
  while (!u) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};
const gumbel = (r) => -Math.log(-Math.log(Math.max(1e-12, r())));
const MU0 = { temp: 0.35, density: 0.45, texture: 0.3, storage: 0.7, light: 0.35, curve: 0.0, social: 0.25 };
const CORR = { 'temp,texture': 0.35, 'density,storage': 0.4, 'temp,curve': 0.15, 'light,density': 0.2, 'social,density': -0.25, 'temp,light': -0.15, 'texture,curve': 0.1 };
const CH = (() => {
  const k = DIMS.length;
  const C = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
  for (const [key, v] of Object.entries(CORR)) {
    const [a, b] = key.split(',').map((d) => DIMS.indexOf(d));
    C[a][b] = C[b][a] = v;
  }
  const L = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++)
    for (let j = 0; j <= i; j++) {
      let s = C[i][j];
      for (let q = 0; q < j; q++) s -= L[i][q] * L[j][q];
      L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j];
    }
  return L;
})();
function guest(r, muk = 1) {
  const e = DIMS.map(() => gauss(r));
  const z = {};
  DIMS.forEach((d, i) => {
    let v = 0;
    for (let q = 0; q <= i; q++) v += CH[i][q] * e[q];
    z[d] = MU0[d] * muk + v;
  });
  return z;
}

// 每个选项本身讨不讨喜（只给模拟用，不进产品）：「干干净净」「什么都没有」最讨喜，「收藏会说话」「瓶瓶罐罐」偏不讨喜
const APPEAL = {
  room: { a: 0.15, b: 0.05, c: 0.1, d: 0, e: -0.1, f: 0 },
  wall: { a: 0.1, b: -0.05, c: 0.1, d: 0.05, e: 0 },
  touch: { c: 0.05 },
  guest: { a: 0.35, b: -0.1, c: 0.1, d: 0, e: 0.1 },
  sofa: { a: 0.05, c: 0.05, d: -0.05 },
  night: { b: 0.05, c: 0.1 },
  floor: { a: 0.05, b: 0.05, c: 0.05 },
  kitchen: { a: 0.35, b: -0.1, c: 0.05, d: 0.15 },
  table: { b: 0.05, c: 0.05 },
  weekend: { a: 0.05, b: 0.05, c: 0.1 },
};

function choose(r, z, pair, { beta = 1, random = false } = {}) {
  const opts = optionsOf(pair);
  if (random) return opts[Math.floor(r() * opts.length)];
  let best = null;
  let bu = -Infinity;
  for (const o of opts) {
    let u = APPEAL[pair.id]?.[o.v] || 0;
    for (const [k, v] of Object.entries(o.fx || {})) u += 0.85 * v * (z[k] || 0);
    u += beta * gumbel(r);
    if (u > bu) {
      bu = u;
      best = o;
    }
  }
  return best;
}
const pickW = (r, pairs) => {
  let t = r() * pairs.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of pairs) if ((t -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
};
function restAnswers(r, z) {
  const life = {
    saturday: pickW(r, [['sofa', 3], ['kitchen', 2], ['window', 2 + z.light * 0.5 - z.social * 0.5], ['workout', 1.2], ['bed', 1.5]].map(([v, w]) => [v, Math.max(0.1, w)])),
    home: pickW(r, [['drop', 3], ['tidy', 2 + z.density * 0.6], ['flop', 3], ['fridge', 2]].map(([v, w]) => [v, Math.max(0.1, w)])),
    cook: pickW(r, [['heavy', 3], ['light', 2], ['coffee', 1.5], ['rare', 2]]),
    bell: pickW(r, [['shoes', 3], ['table', 2], ['clothes', 2], ['counter', 2], ['toys', 1.5], ['nothing', 1]]),
    who: [],
  };
  const ratioTouched = r() < 0.7;
  // 滑杆：大多数人拉在 25 % 左右看得见，喜欢展示的多一点
  const ratio = Math.max(0, Math.min(100, Math.round((28 - 14 * (z.storage - 0.7) + gauss(r) * 8) / 5) * 5));
  const avoid = [];
  if (r() < 0.25 * (1 / (1 + Math.exp(-z.storage)))) avoid.push('openshelf');
  if (r() < 0.12) avoid.push('glassdoor');
  const players = pickW(r, [['solo', 6], ['couple', 3], ['family', 1]]);
  return { life, ratio, ratioTouched, avoid, players };
}
const rt = (r, k, speed = 1) => Math.round((900 + 700 * Math.log2(k + 1)) * speed * Math.exp(gauss(r) * 0.35));

// 当时屏幕上的排列（QuizApp 存进 answers.pairs[id].left）：另一条随机数，不打乱上面的模型
const ro = rng(424242);
function orderOf(pair) {
  const a = optionsOf(pair).map((o) => o.v);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(ro() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.join('');
}

function play(r, z, { random = false, beta = 1, speed } = {}) {
  const rest = restAnswers(r, z);
  const sp = speed ?? Math.exp((r() - 0.5) * 0.6);
  const pairs = {};
  for (const p of PAIRS) {
    const o = choose(r, z, p, { random, beta });
    pairs[p.id] = { pick: o.v, ms: rt(r, optionsOf(p).length, sp), left: orderOf(p) };
  }
  return { ...rest, pairs };
}
const cardOf = (ans) => codeOf(scoreAxes(ans, FLOW).axes);

/** 一群客人 → 每张牌的比例、改 k 题之后换牌的比例、每个选项被选的比例 */
function population({ N, seed, muk = 1, flips = true }) {
  const r = rng(seed);
  const cards = {};
  const freq = {};
  const flip = { 1: 0, 2: 0, 3: 0 };
  const raw = Object.fromEntries(['temp', 'density', 'texture', 'storage'].map((k) => [k, []]));
  for (let i = 0; i < N; i++) {
    const z = guest(r, muk);
    const ans = play(r, z, { random: r() < 0.08 });
    const c = cardOf(ans);
    cards[c] = (cards[c] || 0) + 1;
    for (const p of PAIRS) ((freq[p.id] ||= {})[ans.pairs[p.id].pick] = (freq[p.id][ans.pairs[p.id].pick] || 0) + 1);
    if (!flips) continue;
    for (const k of [2, 1, 3]) {
      const b = { ...ans, pairs: { ...ans.pairs } };
      const ids = PAIRS.map((p) => p.id).sort(() => r() - 0.5).slice(0, k);
      for (const id of ids) {
        const others = optionsOf(PAIRS.find((x) => x.id === id)).filter((o) => o.v !== ans.pairs[id].pick);
        b.pairs[id] = { ...ans.pairs[id], pick: others[Math.floor(r() * others.length)].v };
      }
      if (cardOf(b) !== c) flip[k]++;
    }
  }
  const share = Object.fromEntries(DREAMERS.map((d) => [d.code, (cards[d.code] || 0) / N]));
  const sorted = Object.entries(share).sort((a, b) => b[1] - a[1]);
  return { N, share, sorted, max: sorted[0], min: sorted[sorted.length - 1], reached: sorted.filter(([, s]) => s > 0).length, collision: sorted.reduce((s, [, p]) => s + p * p, 0), flip: { 1: flip[1] / N, 2: flip[2] / N, 3: flip[3] / N }, freq, raw };
}
const line = (res) => res.sorted.map(([c, s]) => `${c} ${pct(s)}`).join(' · ');

// ───────────────────────── v1（adccd6a，十二题二选一）只印出来对照 ─────────────────────────

const V1 = {
  room: { a: { temp: 2, light: -0.5 }, b: { temp: -2, light: 1 } },
  wall: { a: { density: 2 }, b: { density: -2 } },
  touch: { a: { texture: 2, temp: 0.5 }, b: { texture: -2, temp: -0.5 } },
  guest: { a: { storage: 2.2 }, b: { storage: -2.2 } },
  palette: { a: { temp: 1.6 }, b: { temp: -1.6 } },
  sofa: { a: { curve: 2, texture: 0.6 }, b: { curve: -2, texture: -0.6 } },
  night: { a: { light: 2, temp: -0.5 }, b: { light: -2, temp: 0.5 } },
  floor: { a: { texture: 1.4, temp: 1 }, b: { texture: -1.4, temp: -1 } },
  kitchen: { a: { storage: 1.6, density: 1 }, b: { storage: -1.6, density: -1 } },
  table: { a: { texture: 2 }, b: { texture: -2, curve: 0.4 } },
  shelf: { a: { density: 2, storage: 0.5 }, b: { density: -2, storage: -0.5 } },
  weekend: { a: { social: 2, density: -0.4 }, b: { social: -2 } },
};
const V1_APPEAL = { guest: { a: 0.45 }, kitchen: { a: 0.45 }, shelf: { a: 0.25 }, wall: { a: 0.1 }, room: { a: 0.15 }, floor: { a: 0.1 }, night: { b: 0.1 } };
function v1Card(ans) {
  const sum = { temp: 0, density: 0, texture: 0, storage: 0 };
  const add = (fx, w = 1) => Object.entries(fx || {}).forEach(([k, v]) => k in sum && (sum[k] += v * w));
  const solo = ans.players === 'solo';
  for (const [id, fx] of Object.entries(V1)) {
    const a = ans.pairs[id];
    add(fx[a.pick], !solo ? 1 : a.ms < QUICK_MS ? 1.25 : a.ms > SLOW_MS ? 0.8 : 1);
  }
  for (const l of LIFE) if (l.fx && ans.life[l.id] != null) add(l.fx[ans.life[l.id]]);
  if (ans.ratioTouched !== false) sum.storage += (50 - ans.ratio) / 22;
  if (ans.avoid.includes('openshelf')) sum.storage += 1;
  if (ans.avoid.includes('glassdoor')) sum.storage += 0.4;
  const p = (s) => Math.round(50 + 50 * Math.tanh(s / 4.5)) || 51;
  return codeOf(Object.fromEntries(Object.entries(sum).map(([k, s]) => [k, p(s) === 50 ? 51 : p(s)])));
}
function v1Population(N = 20000, seed = 7) {
  const r = rng(seed);
  const cards = {};
  for (let i = 0; i < N; i++) {
    const z = guest(r);
    const random = r() < 0.08;
    const rest = restAnswers(r, z);
    const pairs = {};
    const sp = Math.exp((r() - 0.5) * 0.6);
    for (const [id, fx] of Object.entries(V1)) {
      const opts = ['a', 'b'].map((v) => ({ v, fx: fx[v], appeal: V1_APPEAL[id]?.[v] || 0 }));
      let o = opts[Math.floor(r() * 2)];
      if (!random) {
        let bu = -Infinity;
        for (const x of opts) {
          let u = x.appeal;
          for (const [k, v] of Object.entries(x.fx)) u += 0.85 * v * z[k];
          u += gumbel(r);
          if (u > bu) {
            bu = u;
            o = x;
          }
        }
      }
      pairs[id] = { pick: o.v, ms: rt(r, 2, sp) };
    }
    const c = v1Card({ ...rest, pairs });
    cards[c] = (cards[c] || 0) + 1;
  }
  return Object.entries(cards)
    .map(([c, k]) => [c, k / N])
    .sort((a, b) => b[1] - a[1]);
}

// ───────────────────────── 测试 ─────────────────────────

console.log('题库 v2');
await test('十题、顺序对、每题 4–6 个选项（共 46 个），v 从 a 连续排下去', () => {
  assert.equal(QUIZ_V, 2);
  assert.deepEqual(PAIRS.map((p) => p.id), ['room', 'wall', 'touch', 'guest', 'sofa', 'night', 'floor', 'kitchen', 'table', 'weekend']);
  for (const p of PAIRS) {
    const opts = optionsOf(p);
    assert.ok(opts.length >= 4 && opts.length <= 6, `${p.id}: ${opts.length}`);
    assert.equal(opts.map((o) => o.v).join(''), 'abcdef'.slice(0, opts.length), p.id);
  }
  assert.equal(PAIRS.reduce((s, p) => s + optionsOf(p).length, 0), 46);
});
await test('每个选项：中文字 + 英文词典、img = 题目-v、fx 只用认得的维度、mats 都是材质库里的', () => {
  const dims = new Set(DIMS);
  for (const p of PAIRS) {
    assert.ok(EN[p.q], `题目没有英文：${p.q}`);
    for (const m of p.mats) assert.ok(MAT_BY_ID[m], `${p.id} mats: ${m}`);
    for (const o of optionsOf(p)) {
      assert.ok(o.label && EN[o.label], `${p.id}.${o.v} 没有英文：${o.label}`);
      assert.ok([...o.label].length <= 13, `${p.id}.${o.v} 字太多（卡片上最多两行）：${o.label}`);
      assert.equal(o.visual?.kind, 'room');
      assert.equal(o.visual.img, `${p.id}-${o.v}`);
      for (const k of Object.keys(o.fx)) assert.ok(dims.has(k), `${p.id}.${o.v} fx.${k}`);
      for (const m of o.mats) assert.ok(MAT_BY_ID[m], `${p.id}.${o.v} mats: ${m}`);
    }
  }
});
await test('每个选项都有图：已经渲染好的 480 + 960 WebP，或者拼色卡用的材质（不会出现空白的卡）', () => {
  const missing = [];
  for (const p of PAIRS)
    for (const o of optionsOf(p)) {
      const has = ['480', '960'].every((s) => fs.existsSync(path.join(ROOT, `src/quiz/vignettes/img/${o.visual.img}-${s}.webp`)));
      if (!has) missing.push(o.visual.img);
      assert.ok(has || o.mats.length || p.mats.length, `${o.visual.img}：没有图也没有材质`);
    }
  console.log(`    图：${46 - missing.length}/46 张已渲染${missing.length ? `；还在用色卡：${missing.join(' ')}` : ''}`);
});
await test('图档：每张都是真的 WebP（RIFF / WEBP 文件头），480 的比 960 的小', () => {
  for (const p of PAIRS)
    for (const o of optionsOf(p)) {
      const files = ['480', '960'].map((s) => path.join(ROOT, `src/quiz/vignettes/img/${o.visual.img}-${s}.webp`));
      if (!files.every((f) => fs.existsSync(f))) continue;
      const [small, big] = files.map((f) => fs.readFileSync(f));
      for (const b of [small, big]) assert.ok(b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP', o.visual.img);
      assert.ok(small.length < big.length && small.length > 2000, `${o.visual.img}: ${small.length} / ${big.length} B`);
    }
});
await test('潘吉的泡泡（PAIR_REACT）：46 个选项每个都有一句，每句都有英文（表情不算在 key 里）', () => {
  // steps.jsx 是 JSX，Node 不能直接 import：把那一段物件字面量拿出来算
  const src = fs.readFileSync(path.join(ROOT, 'src/quiz/steps.jsx'), 'utf8');
  const at = src.indexOf('const PAIR_REACT = {');
  assert.ok(at > 0, '找不到 PAIR_REACT');
  const REACT = Function(src.slice(at, src.indexOf('\n};', at) + 3).replace('const PAIR_REACT =', 'return'))();
  const EDGE = '[\\s\\p{So}\\p{Extended_Pictographic}\\uFE0F\\u200D→←↑↓·•…≈+]';
  const SPLIT = new RegExp(`^(${EDGE}*)([\\s\\S]*?)(${EDGE}*)$`, 'u');
  assert.deepEqual(Object.keys(REACT).sort(), PAIRS.map((p) => p.id).sort());
  for (const p of PAIRS)
    for (const o of optionsOf(p)) {
      const zh = REACT[p.id][o.v];
      assert.ok(zh, `${p.id}.${o.v} 没有泡泡`);
      assert.ok(EN[SPLIT.exec(zh)[2]], `${p.id}.${o.v}「${zh}」没有英文`);
    }
});
await test('选项真的不一样：同一题里字、图都不重复，fx 两两距离 ≥ 0.5（最近的一对印出来）', () => {
  let near = [9, ''];
  for (const p of PAIRS) {
    const opts = optionsOf(p);
    assert.equal(new Set(opts.map((o) => o.label)).size, opts.length, `${p.id} 有两个选项同一句话`);
    assert.equal(new Set(opts.map((o) => o.visual.img)).size, opts.length, `${p.id} 有两个选项同一张图`);
    for (let i = 0; i < opts.length; i++)
      for (let j = i + 1; j < opts.length; j++) {
        const d = Math.hypot(...DIMS.map((k) => (opts[i].fx[k] || 0) - (opts[j].fx[k] || 0)));
        assert.ok(d >= 0.5, `${p.id}: ${opts[i].v} 和 ${opts[j].v} 的计分几乎一样（${d.toFixed(2)}）`);
        if (d < near[0]) near = [d, `${p.id} ${opts[i].label} / ${opts[j].label}`];
      }
  }
  console.log(`    计分最接近的一对：${near[1]}（${near[0].toFixed(2)}，看得见的差别靠图和材质）`);
});

console.log('旧档案 / 旧链接（v1：十二题二选一）');
await test('accessor：pair.a… = 选项、pair.fx = { a: fx … }；room.a 还是「暖暖的傍晚」', () => {
  const room = PAIRS.find((p) => p.id === 'room');
  assert.equal(room.a.label, '暖暖的傍晚');
  assert.equal(room.b.label, '清爽的早晨');
  for (const p of PAIRS)
    for (const o of optionsOf(p)) {
      assert.equal(p[o.v], o);
      assert.equal(p.fx[o.v], o.fx);
    }
});
await test('pickLabel：十题照新的字；拿掉的两题（色盘、书架）照旧认得；不认得 → 空字串', () => {
  assert.equal(pickLabel('palette', 'a'), '大地与阳光');
  assert.equal(pickLabel('palette', 'b'), '海风与石头');
  assert.equal(pickLabel('shelf', 'b'), '满满当当，每格都有故事');
  assert.equal(pickLabel('room', 'f'), '旅行带回来的');
  assert.equal(pickLabel('room', 'z'), '');
  assert.equal(pickLabel('nope', 'a'), '');
  assert.deepEqual(LEGACY_PAIRS.map((p) => p.id), ['palette', 'shelf']);
  for (const p of LEGACY_PAIRS) for (const o of optionsOf(p)) assert.ok(EN[o.label], o.label);
});
await test('adccd6a 时代的档案（十二题、left = a / b、没有 qv）：快选照样排得出来、字都认得；链接来回不变；轴不重算', async () => {
  const old = {
    v: 1,
    id: 'GOLD1',
    code: 'WMNH',
    axes: { temp: 72, density: 68, texture: 60, storage: 80 },
    hidden: { light: 40, curve: 70, social: 55 },
    players: 'solo',
    answers: {
      pairs: {
        room: { pick: 'a', ms: 300, left: 'a' },
        wall: { pick: 'a', ms: 900, left: 'b' },
        touch: { pick: 'a', ms: 2600, left: 'a' },
        guest: { pick: 'a', ms: 1000, left: 'b' },
        palette: { pick: 'a', ms: 800, left: 'a' },
        sofa: { pick: 'b', ms: 2700, left: 'a' },
        night: { pick: 'b', ms: 2600, left: 'b' },
        floor: { pick: 'a', ms: 2500, left: 'a' },
        kitchen: { pick: 'a', ms: 2800, left: 'b' },
        table: { pick: 'b', ms: 2600, left: 'a' },
        shelf: { pick: 'b', ms: 950, left: 'a' },
        weekend: { pick: 'a', ms: 2700, left: 'b' },
      },
    },
  };
  const quick = quickPicksOf(old);
  assert.deepEqual(quick.map((q) => q.id), ['palette', 'wall', 'shelf', 'guest']);
  // 蓝图的写法（Blueprint.jsx：PAIRS 里找得到就用 pair[pick].label）+ 拿掉的两题用 pickLabel
  const labels = quick.map((q) => PAIRS.find((p) => p.id === q.id)?.[q.pick]?.label || pickLabel(q.id, q.pick));
  assert.deepEqual(labels, ['大地与阳光', '一幅画就够了', '满满当当，每格都有故事', '干干净净，什么都看不见']);
  for (const l of labels) assert.ok(EN[l], l);
  const back = await unpackJSON(await packJSON(slimProfile(old)));
  assert.equal(back.code, 'WMNH');
  assert.deepEqual(back.axes, old.axes);
  assert.equal(back.qv, undefined);
  assert.equal(back.answers.pairs.palette.left, 'a');
  // 旧答案丢进新的计分也不会出错（拿掉的两题不算）
  assert.ok(codeOf(scoreAxes(old.answers.pairs ? { pairs: old.answers.pairs, players: 'solo' } : {}, FLOW).axes));
});
await test('新档案带 qv: 2；left 存的是当时的排列字串（链接来回不变）', async () => {
  const pairs = Object.fromEntries(PAIRS.map((p) => [p.id, { pick: 'c', ms: 2100, left: optionsOf(p).map((o) => o.v).reverse().join('') }]));
  const p = buildProfile({ players: 'solo', pairs }, {}, FLOW);
  assert.equal(p.qv, 2);
  assert.equal(p.v, 1);
  const back = await unpackJSON(await packJSON(slimProfile(p)));
  assert.equal(back.qv, 2);
  assert.equal(back.answers.pairs.room.left, 'fedcba');
});

console.log('计分修正（SPEC §2.5）');
await test('希克定律：hick(2) = 1，6 选 1 的 2.6 秒 ≈ 二选一的 1.5 秒（算「快」）', () => {
  assert.equal(hick(2), 1);
  assert.ok(Math.abs(hick(6) - Math.log2(7) / Math.log2(3)) < 1e-12);
  assert.ok(hick(4) > 1 && hick(6) > hick(4));
  const one = (ms, left) => ({ players: 'solo', pairs: { room: { pick: 'a', ms, left } } });
  // 6 个选项 2600 ms ÷ 1.77 ≈ 1470 < 1600 → 秒选加权；同样的 2600 ms 在二选一（left = 'a'）就不是
  assert.ok(scoreAxes(one(2600, 'abcdef'), FLOW).axes.temp > scoreAxes(one(2600, 'a'), FLOW).axes.temp);
  // reactionStats 也换算：6 选 1 慢一点不算犹豫
  const rs = reactionStats({ x: { ms: 1, left: 'ab' }, a: { pick: 'a', ms: 1000, left: 'ab' }, b: { pick: 'a', ms: 1000, left: 'ab' }, c: { pick: 'a', ms: 1770, left: 'abcdef' } });
  assert.equal(rs.slow.length, 0);
  assert.equal(rs.quick.length, 0);
});
await test(`藏 / 展滑杆中点 = ${RATIO_NEUTRAL} %：拉在 30 % = 不加不减；10 % → 偏藏；60 % → 偏展；没碰过不计`, () => {
  assert.equal(RATIO_NEUTRAL, 30);
  assert.equal(scoreAxes({ ratio: 30 }, FLOW).axes.storage, 51);
  assert.ok(scoreAxes({ ratio: 10 }, FLOW).axes.storage > 55);
  assert.ok(scoreAxes({ ratio: 60 }, FLOW).axes.storage < 45);
  assert.equal(scoreAxes({ ratio: 0, ratioTouched: false }, FLOW).axes.storage, 51);
});
await test('AXIS_CENTER：全答完减满、一题都没答不减（空白档案各 51 %）', () => {
  assert.deepEqual(AXIS_CENTER, { temp: 1.1, density: 1.3, texture: 0.8, storage: 2.5 });
  for (const ax of AXES) assert.equal(scoreAxes({}, FLOW).axes[ax.id], 51);
  // 每题都选「对温度没意见」的选项（temp 0 的那几个凑不齐，就看 wall a：只动 density / storage）
  const one = scoreAxes({ players: 'couple', pairs: { wall: { pick: 'a', ms: 2000 } } }, FLOW).axes;
  assert.equal(one.temp, Math.round(50 + 50 * Math.tanh(-1.1 / 10 / 4.5)));
});
await test('设计师的重算办法还成立：AXIS_CENTER ≈ 0.7 × 写实客人原始分数的中位数（差 ≤ 0.25）', () => {
  // 原始分数 = 不减中点：把 AXIS_CENTER 加回去
  const r = rng(11);
  const raws = { temp: [], density: [], texture: [], storage: [] };
  for (let i = 0; i < 6000; i++) {
    const ans = play(r, guest(r), { random: r() < 0.08 });
    const { axes } = scoreAxes(ans, FLOW);
    // tanhPct 取整过，反推只到 ±0.05：用 atanh 还原
    for (const k of Object.keys(raws)) {
      const p = Math.min(99.4, Math.max(0.6, axes[k] === 51 ? 50 : axes[k]));
      raws[k].push(4.5 * Math.atanh((p - 50) / 50) + AXIS_CENTER[k]);
    }
  }
  const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
  const got = Object.fromEntries(Object.entries(raws).map(([k, a]) => [k, +(0.7 * med(a)).toFixed(2)]));
  console.log(`    0.7 × 中位数：${JSON.stringify(got)}（用的是 ${JSON.stringify(AXIS_CENTER)}）`);
  for (const k of Object.keys(raws)) assert.ok(Math.abs(got[k] - AXIS_CENTER[k]) <= 0.25, `${k}: ${got[k]} vs ${AXIS_CENTER[k]}`);
});

console.log('牌的分布（客人模型，SPEC §2.6）');
const v1 = v1Population();
console.log(`    v1 对照（十二题二选一）：${v1.slice(0, 6).map(([c, s]) => `${c} ${pct(s)}`).join(' · ')} …（${v1.length}/16 张，最多 ${v1[0][0]} ${pct(v1[0][1])}）`);
const real = population({ N: 20000, seed: 11 });
console.log(`    v2 写实客人 ${real.N} 人：${line(real)}`);
await test('写实客人：16 张牌每张 ≥ 1.5 %、最多的一张 ≤ 15 %、撞牌机会 Σp² ≤ 9 %', () => {
  assert.equal(real.reached, 16);
  assert.ok(real.min[1] >= 0.015, `最少 ${real.min[0]} ${pct(real.min[1])}`);
  assert.ok(real.max[1] <= 0.15, `最多 ${real.max[0]} ${pct(real.max[1])}`);
  assert.ok(real.collision <= 0.09, `Σp² ${pct(real.collision)}`);
  console.log(`    最多 ${real.max[0]} ${pct(real.max[1])} · 最少 ${real.min[0]} ${pct(real.min[1])} · Σp² ${pct(real.collision)}（v1：${pct(v1.reduce((s, [, p]) => s + p * p, 0))}）`);
});
await test('两个人只差 2 题 → ≥ 50 % 拿到不同的牌；差 3 题 ≥ 60 %；只差 1 题 ≤ 40 %（不会一碰就变）', () => {
  console.log(`    差 1 题 ${pct(real.flip[1])} · 差 2 题 ${pct(real.flip[2])} · 差 3 题 ${pct(real.flip[3])}`);
  assert.ok(real.flip[2] >= 0.5, pct(real.flip[2]));
  assert.ok(real.flip[3] >= 0.6, pct(real.flip[3]));
  assert.ok(real.flip[1] <= 0.4, pct(real.flip[1]));
});
await test('每个选项都有人选（≥ 5 %），没有一个选项 > 60 %', () => {
  const rows = [];
  for (const p of PAIRS) {
    const f = real.freq[p.id];
    rows.push(`${p.id} ${optionsOf(p).map((o) => `${o.v}:${Math.round(((f[o.v] || 0) / real.N) * 100)}%`).join(' ')}`);
    for (const o of optionsOf(p)) {
      const s = (f[o.v] || 0) / real.N;
      assert.ok(s >= 0.05 && s <= 0.6, `${p.id}.${o.v}（${o.label}）${pct(s)}`);
    }
  }
  console.log('    ' + rows.join('\n    '));
});
for (const [muk, cap] of [
  [0, 0.16],
  [0.5, 0.15],
]) {
  await test(`客人模型不偏 / 偏一半（MUK ${muk}）：16 张都有人拿到，最多的一张 ≤ ${cap * 100} %`, () => {
    const res = population({ N: 10000, seed: 13 + muk * 10, muk, flips: false });
    console.log(`    MUK ${muk}：最多 ${res.max[0]} ${pct(res.max[1])} · 最少 ${res.min[0]} ${pct(res.min[1])}`);
    assert.equal(res.reached, 16);
    assert.ok(res.max[1] <= cap, `${res.max[0]} ${pct(res.max[1])}`);
  });
}
await test('六种很典型的人（β 0.7）：拿到对的那张牌 ≥ 50 %', () => {
  const P = {
    WMNH: { temp: 1.5, density: 1.5, texture: 1.5, storage: 1.5, light: 0.3, curve: 0, social: 0 }, // 日式原木
    CMRH: { temp: -1.5, density: 1.5, texture: -1.5, storage: 1.5, light: 0.8, curve: -0.8, social: -0.3 }, // 都会
    WLND: { temp: 1.5, density: -1.5, texture: 1.5, storage: -1.5, light: 0.3, curve: 0.5, social: 1 }, // 波西米亚
    CLRH: { temp: -1, density: -1, texture: -1.5, storage: 1.2, light: -1.5, curve: -0.5, social: -0.5 }, // 深色
    WMRD: { temp: 1, density: 1.2, texture: -1.5, storage: -1.5, light: 0.2, curve: 0.3, social: 0.5 }, // 画廊
    CLNH: { temp: -1.2, density: -1.2, texture: 1.5, storage: 1.2, light: 0, curve: 0.3, social: 0 }, // 森林
  };
  const r = rng(5);
  const out = [];
  for (const [want, z] of Object.entries(P)) {
    const tally = {};
    for (let i = 0; i < 400; i++) {
      const c = cardOf(play(r, z, { beta: 0.7, speed: 1 }));
      tally[c] = (tally[c] || 0) + 1;
    }
    const [top, k] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    out.push(`${want} → ${top} ${Math.round(k / 4)}%（对的 ${Math.round((tally[want] || 0) / 4)}%）`);
    assert.equal(top, want, out.at(-1));
    assert.ok((tally[want] || 0) / 400 >= 0.5, out.at(-1));
  }
  console.log('    ' + out.join(' · '));
});
await test('乱点的人（反应时间随机、滑杆没碰）：≥ 12 张牌、没有一张 > 35 %', () => {
  const r = rng(12);
  const cards = {};
  for (let i = 0; i < 10000; i++) {
    const pairs = {};
    for (const p of PAIRS) {
      const opts = optionsOf(p);
      pairs[p.id] = { pick: opts[Math.floor(r() * opts.length)].v, ms: Math.round(700 + r() * 5000) };
    }
    const c = codeOf(scoreAxes({ players: 'solo', pairs, ratio: 25, ratioTouched: false }, FLOW).axes);
    cards[c] = (cards[c] || 0) + 1;
  }
  const sorted = Object.entries(cards).sort((a, b) => b[1] - a[1]);
  console.log(`    ${sorted.length}/16 张，最多 ${sorted[0][0]} ${pct(sorted[0][1] / 10000)}`);
  assert.ok(sorted.length >= 12);
  assert.ok(sorted[0][1] / 10000 <= 0.35);
});
await test('整个测试 < 10 秒', () => assert.ok(Date.now() - T0 < 10000, `${Date.now() - T0} ms`));

console.log(`\n${n - failed}/${n} 通过（${((Date.now() - T0) / 1000).toFixed(1)} 秒）`);
if (failed) process.exit(1);
