// 溪岸五大系列（SAIL 的五个原创系列）：名字、设计理念，以及「建议客人拿哪一个系列」（recommendSeries）。
//
// 老板 2026-11-13：「…同时可以帮我们从我们的案例库选择对的案例给到客人 并且建议他拿我们5大系列的哪个系列」。
// 只有这五个，顺序 = 品牌手册 p.6：骨骼线 · 空山 · 织 · 雾山 · 侘寂东方（docs/showcase/SERIES.md）。
// 「自然线」是骨骼线 / 空山 / 织的总称（family），「庭前」不是这五个之一 —— seriesKeyOf 都给 null。
//
// 文字（title / body / note / family，雾山还有一句 quote）照 VISI 的 MB.SERIES_CONCEPT 原文，一个字都不另外编：
//   骨骼线：品牌手册 p.9、p.23–24 · 空山：手册 p.10、p.28 · 织：手册 p.11 ·
//   雾山：溪岸原创设计篇 P25、溪岸品牌讲解 p.11（老板 2026-11-04 发的截图）· 侘寂东方：溪岸官方帐号 2025 年实木系列新品「侘寂东方」发布文。
// 英文写在 src/shared/i18n/en-cases.js（中文原句就是 key，和别的界面文字一样）；这里载入的时候取出来，SERIES 里每一段都是 { zh, en }。
//
// recommendSeries 只用客人自己的答案：四条轴 + 明暗 / 线条、自己的牌、自己在直觉题里选的图、三个愿望、自己挑的案例。
// 永远不看预算、时间、门铃那题、员工的笔记。理由（reasons）也只说这些，客人看得到。算法便宜、固定（同样的答案 = 同样的结果）。

import { t, tIn, isEn } from './i18n.js';
import { DREAMER_BY_CODE } from './dreamers.js';
import * as FLOW from '../quiz/flow.js';

/** 中文 → { zh, en }（英文查 en-cases.js） */
const bi = (zh) => ({ zh, en: tIn('en', zh) });
const deepFreeze = (o) => {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
};

const NATURAL_LINE = bi('溪岸 · 自然线系列');

/**
 * 五个系列（品牌手册 p.6 的顺序）。
 * { key, zh, en, family: { zh, en } | null（属于「自然线系列」/「实木系列」的才有；雾山没有）, title, body, note: { zh, en }, quote?（雾山） }
 * 名字直接用 s.zh / s.en，或者 seriesName(key)。
 */
export const SERIES = deepFreeze([
  {
    key: 'skeleton',
    ...bi('骨骼线'),
    family: NATURAL_LINE,
    title: bi('在时间的长河，寻找关于家具的记忆。'),
    body: bi('我们将古典家具美学融入现代设计，打造「没那么现代」的设计：用柜子本身的装饰线条形成把手，营造家具的自然生长感。'),
    note: bi('灵感取自古典实木家具的形态：骨骼结构既是装饰，也是把手。'),
  },
  {
    key: 'mountain',
    ...bi('空山'),
    family: NATURAL_LINE,
    title: bi('入空山，感物近人。'),
    body: bi('我们弱化不必要的设计与装饰，以「退一步」的产品形态，消融大型柜体在空间里的存在感，衬托空间真正的主角，把视线重新聚焦到生活与人本身。'),
    note: bi('以「退」为设计哲学，「空而不空」的陈列美学。'),
  },
  {
    key: 'weaving',
    ...bi('织'),
    family: NATURAL_LINE,
    title: bi('自然柔韧，回归感性生活。'),
    body: bi('织系列汲取麻纤维织物的质感，以织物的朴素美学，唤醒对生活与材料的感知力。'),
    note: bi('在城市的喧嚣中迷失的感觉，在接近麻纤维的时候，会慢慢平复下来。'),
  },
  {
    key: 'misty',
    ...bi('雾山'),
    family: null,
    title: bi('雾山春居。'),
    body: bi('以「雾山春居」为设计灵感：山腰一间木屋，以更自由的产品、更身心共融的家，将春日里雾山平和、纯粹、轻盈、充沛的自然表达，尽诉其中。'),
    note: bi('轻于色、安于形：取晨雾之「灰」、春山之「木」、早春山间将有未有之「绿」，消隐大型柜体的存在感，让空间平静温和。'),
    quote: bi('「我心中有一种东西像薄雾，我被它包裹着……让我们保持安静，被生活环绕……」—— 费尔南多·佩索阿'),
  },
  {
    key: 'wabi',
    ...bi('侘寂东方'),
    family: bi('溪岸 · 实木系列'),
    title: bi('山，有它的时间。'),
    body: bi('我们将东方哲思中「关于时间的探索」融入设计，在造物与空间中，注入对生命流动的理解与尊重。'),
    note: bi('打磨出能滋养心灵、连接自然、经得起时间洗礼的设计。'),
  },
]);
export const SERIES_KEYS = SERIES.map((s) => s.key);
export const SERIES_BY_KEY = Object.freeze(Object.fromEntries(SERIES.map((s) => [s.key, s])));

// ───────────────────────── 名字 → key ─────────────────────────

/** 比对用：小写，去掉空格 / 连字号 / 间隔号 */
const flat = (s) => String(s).toLowerCase().replace(/[\s\-_·・.]+/g, '');
const ALIAS = new Map();
for (const s of SERIES) for (const w of [s.key, s.zh, s.en]) ALIAS.set(flat(w), s.key);
// 案例整理以前的英文名字（src/cases/sorter/data.json 旧版）、VISI 的写法
for (const [w, key] of [
  ['Skeletal Line', 'skeleton'],
  ['Skeleton', 'skeleton'],
  ['Kongshan', 'mountain'],
  ['Zhi', 'weaving'],
  ['Woven', 'weaving'],
  ['Weave', 'weaving'],
  ['Misty', 'misty'],
  ['Wushan', 'misty'],
  ['Wabi', 'wabi'],
  ['Wabi-sabi Eastern', 'wabi'],
  ['Wabi-sabi East', 'wabi'],
])
  ALIAS.set(flat(w), key);
// 「溪岸 · 空山」「SAIL Misty Mountain」：前面的品牌名不算；「空山系列」「Weaving series」：后面的「系列」不算
const PREFIX = /^(溪岸|sail)/;
const SUFFIX = /(系列|series)$/;

/**
 * 系列的名字（中文 / 英文 / key / 旧名字，大小写、空格不管）→ key（'skeleton' | 'mountain' | 'weaving' | 'misty' | 'wabi'）；
 * 不是这五个（「自然线」「庭前」「侘寂」、空的、乱写的）→ null。也收 { key } / 系列对象。
 */
export function seriesKeyOf(text) {
  if (text == null) return null;
  if (typeof text === 'object') return seriesKeyOf(text.key ?? text.id ?? text.zh ?? text.en ?? null);
  let s = flat(text);
  if (!s) return null;
  if (ALIAS.has(s)) return ALIAS.get(s);
  s = s.replace(PREFIX, '').replace(SUFFIX, '');
  return ALIAS.get(s) ?? null;
}

/** 现在的语言的系列名字（'' = 不是这五个） */
export function seriesName(keyOrText) {
  const s = SERIES_BY_KEY[seriesKeyOf(keyOrText)];
  return s ? (isEn() ? s.en : s.zh) : '';
}

// ───────────────────────── 建议哪个系列 ─────────────────────────

/**
 * 每个系列的「目标客人」（资料，可以调）：
 *   axes / hidden：0–100 = 偏 a 侧的百分比（和 dreamers.js 一样：温度 100 = 暖、密度 100 = 简、质感 100 = 朴、收纳 100 = 藏；
 *     明度 100 = 明亮、线条 100 = 圆润）；没写的轴不算（织、雾山不看收纳，侘寂东方不看线条）。
 *   styles：风格标签（和案例整理 data.json 的风格一样：中古 原木 美式复古 法式 极简 侘寂 南洋 奶油）—— 客人的牌是哪些风格见 CARD_STYLES。
 *   mats：材质 id（客人在直觉题里选的图用到它们 = 加分）。侘寂东方的榆木还没有程序化材质（板材库里才有），先不写。
 *   picks：直觉题的选项（'题:选项'）—— 没有材质、但一看就是这个系列的那几张图。
 *   wishes：三个愿望里和这个系列最合的（FLOW.WISHES 的 v）。
 * 骨骼线 —— 古典家具的线条放进现代的家，装饰线条就是把手，暖木，中古；
 * 空山 —— 弱化设计，柜子「退一步」，「空而不空」的陈列（格子书墙）；
 * 织 —— 麻纤维织物的质感，柔软、感性、自然；
 * 雾山 —— 晨雾的灰、春山的木、早春的绿；轻、静，柜体消隐；
 * 侘寂东方 —— 实木，东方的时间感，侘寂。
 */
export const SERIES_TARGET = {
  skeleton: {
    axes: { temp: 75, density: 40, texture: 50, storage: 50 },
    hidden: { light: 40, curve: 30 },
    styles: ['中古', '原木', '美式复古', '法式'],
    mats: ['walnut', 'cherry', 'smoked-oak'],
    picks: ['floor:a', 'sofa:b', 'guest:b'],
    wishes: ['host', 'photo'],
  },
  mountain: {
    axes: { temp: 60, density: 85, texture: 65, storage: 35 },
    hidden: { light: 65, curve: 35 },
    styles: ['极简', '原木', '侘寂'],
    mats: ['light-oak', 'white-oak', 'warm-white'],
    picks: ['wall:a', 'guest:c', 'kitchen:a'],
    wishes: ['clean', 'storage'],
  },
  weaving: {
    axes: { temp: 70, density: 55, texture: 90 },
    hidden: { light: 55, curve: 65 },
    styles: ['侘寂', '南洋'],
    mats: ['linen', 'rattan', 'oat-knit', 'oat'],
    picks: ['touch:a', 'touch:c', 'sofa:c'],
    wishes: ['kids', 'sleep'],
  },
  misty: {
    axes: { temp: 40, density: 75, texture: 60 },
    hidden: { light: 70, curve: 55 },
    styles: ['极简', '奶油'],
    mats: ['greige-oak', 'grey-wool', 'sage', 'sage-linen', 'sage-lacquer', 'light-oak'],
    picks: ['room:b', 'room:d', 'floor:c'],
    wishes: ['light', 'sleep'],
  },
  wabi: {
    axes: { temp: 70, density: 60, texture: 90, storage: 60 },
    hidden: { light: 35 },
    styles: ['侘寂'],
    mats: ['smoked-oak', 'walnut', 'sand-limewash', 'travertine'],
    picks: ['table:a', 'night:b', 'weekend:b'],
    wishes: ['health'],
  },
};

/**
 * 16 张牌各是哪些风格：每张牌设计师那一行（dreamers.js design.style / design.en）里说到的风格，换成上面同一套风格标签
 * （只写那一行真的说到的；说的不是这八种风格的 —— 温暖叠搭、自然疗愈、创意工作室、深色奢华、工业收藏 —— 就空着）。
 * 客人的牌是 ta 自己的答案算出来的，可以给 ta 看（「和你的牌『暖木禅居』很合拍」）。
 */
export const CARD_STYLES = {
  WMNH: ['原木', '侘寂'], // Japandi · 暖调日式：warm natural oak, limewash, linen
  WMND: ['侘寂', '极简'], // Wabi-sabi · 侘寂策展：warm minimalism, wabi-sabi
  WMRH: ['奶油'], // Quiet luxury · 奶油轻奢
  WMRD: ['中古'], // Mid-century gallery · 中古画廊
  WLNH: [], // Warm layered · 温暖叠搭
  WLND: ['南洋'], // Boho natural · 波西米亚自然：rattan, teak, plants
  WLRH: ['法式'], // Modern classic · 现代古典
  WLRD: ['美式复古'], // Library eclectic · 书房式叠搭：cherry, cognac leather
  CMNH: ['极简', '原木'], // Scandinavian · 北欧：white oak, handleless
  CMND: ['侘寂'], // Wabi-sabi · 侘寂素石
  CMRH: ['极简'], // Urban minimal · 都会极简
  CMRD: ['极简'], // Modern architectural · 现代建筑感
  CLNH: [], // Biophilic · 自然疗愈
  CLND: [], // Creative eclectic · 创意工作室
  CLRH: [], // Moody luxe · 深色奢华
  CLRD: [], // Industrial luxe · 工业收藏
};

/**
 * 分数怎么算（都是可以调的数字）：
 *   轴的相似度（0–1：只算客人答过、这个系列又有目标的轴；明暗 / 线条只算一半的分量）
 *   + style × 和客人的牌一样的风格（最多 2 个）+ pick × 选到的图（最多 3 张）+ wish × 愿望（最多 2 个）
 *   + chosen × 客人挑的、写了这个系列的真实案例（最多算 2 个）+ chosenLook × 客人挑的、没写系列的案例看起来最像这个系列。
 */
export const SERIES_WEIGHTS = { hidden: 0.5, style: 0.06, pick: 0.03, wish: 0.03, chosen: 0.25, chosenLook: 0.05 };

const CORE = ['temp', 'density', 'texture', 'storage'];
const HID = ['light', 'curve'];
/** 「偏一边」的门槛：系列的目标离 50 至少 10、客人的答案离 50 至少 10，才说「你喜欢…」 */
const TARGET_SIDE = 10;
const GUEST_SIDE = 10;

/**
 * 「你喜欢{0}，也喜欢{1}」里的说法（客人的话；英文在 en-cases.js）：每条轴的两侧各一句；
 * 有的系列换一个更贴切的说法（骨骼线的「利落」= 经典的线条，织的「朴」= 亚麻一样的质感…）。
 */
const TRAIT = {
  temp: { a: '暖暖的木头', b: '清爽的颜色' },
  density: { a: '简简单单的留白', b: '有层次的家' },
  texture: { a: '自然的质感', b: '细致的做工' },
  storage: { a: '看不见杂物的家', b: '几件心爱的摆设' },
  light: { a: '明亮的光', b: '沉静的光' },
  curve: { a: '圆润的线条', b: '利落的线条' },
};
const TRAIT_BY_SERIES = {
  skeleton: { curve: { b: '经典的线条' } },
  mountain: { density: { a: '安安静静的留白' } },
  weaving: { texture: { a: '亚麻一样的质感' }, curve: { a: '柔软的线条' } },
  misty: { temp: { b: '淡淡的灰绿' }, light: { a: '轻盈明亮的光' } },
  wabi: { temp: { a: '温暖的色调' }, texture: { a: '实木的质感' } },
};
const traitText = (key, axis, side) => TRAIT_BY_SERIES[key]?.[axis]?.[side] || TRAIT[axis][side];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const r3 = (v) => Math.round(v * 1000) / 1000;

/** 轴的相似度（0–1）→ { sim, n }：n = 算进去的轴有几条（0 = 客人什么都没答，sim 0.5） */
function axisSim(axes, hidden, target, wHidden) {
  let d = 0;
  let w = 0;
  let n = 0;
  for (const [vals, tv, k0] of [
    [axes, target.axes, 1],
    [hidden, target.hidden, wHidden],
  ]) {
    for (const [k, tgt] of Object.entries(tv || {})) {
      const p = num(vals?.[k]);
      if (p == null) continue;
      d += k0 * Math.abs(p - tgt);
      w += k0;
      n++;
    }
  }
  return { sim: w ? 1 - d / (100 * w) : 0.5, n };
}

/** 客人在直觉题里选的图 → [{ id: '题:选项', label, mats: Set }]（题库的顺序；还没做完 / 旧版题库也不出错） */
function picksOf(profile) {
  const pairs = profile?.answers?.pairs;
  if (!pairs || typeof pairs !== 'object') return [];
  const out = [];
  try {
    for (const pair of FLOW.PAIRS || []) {
      const v = pairs[pair.id]?.pick;
      if (!v) continue;
      const opt = (typeof FLOW.optionsOf === 'function' ? FLOW.optionsOf(pair) : []).find((o) => o.v === v);
      if (!opt) continue;
      const mats = Array.isArray(opt.mats) && opt.mats.length ? opt.mats : opt.visual?.kind === 'swatches' ? opt.visual.ids || [] : [];
      out.push({ id: `${pair.id}:${v}`, label: opt.label || '', mats: new Set(mats) });
    }
  } catch {
    return out;
  }
  return out;
}

const txtOf = (v) => (v && typeof v === 'object' ? { zh: String(v.zh || v.en || '').trim(), en: String(v.en || v.zh || '').trim() } : { zh: String(v || '').trim(), en: String(v || '').trim() });

/** 一个系列对这位客人：分数 + 理由候选 */
function scoreSeries(key, f) {
  const T = SERIES_TARGET[key];
  const W = SERIES_WEIGHTS;
  const parts = [];
  const add = (kind, v) => v && parts.push({ kind, v: r3(v) });
  const { sim, n } = axisSim(f.axes, f.hidden, T, W.hidden);
  add('axes', sim);
  const styles = f.cardStyles.filter((s) => T.styles.includes(s));
  add('style', W.style * Math.min(2, styles.length));
  // 选到的图：直接点名的选项先算，再算用到这个系列材质的（同一张图只算一次）
  const want = new Set(T.picks || []);
  const mats = new Set(T.mats || []);
  const hits = [...f.picks.filter((p) => want.has(p.id)), ...f.picks.filter((p) => !want.has(p.id) && [...p.mats].some((m) => mats.has(m)))];
  add('pick', W.pick * Math.min(3, hits.length));
  const wishes = (T.wishes || []).filter((w) => f.wishes.includes(w));
  add('wish', W.wish * Math.min(2, wishes.length));
  const chosen = f.chosen.filter((c) => c.series === key);
  add('chosen', W.chosen * Math.min(2, chosen.length));
  add('chosen', W.chosenLook * f.lookalike.filter((k) => k === key).length);

  // 理由（只说客人自己的答案）：挑的案例 → 喜欢的取向 → 选的图 → 愿望 → 牌
  const reasons = [];
  if (chosen.length) {
    // 说得出名字的那个家（案例的标题）；都没有标题 → 不说名字
    const named = chosen.map((c) => txtOf(c.title)).find((x) => x.zh || x.en);
    reasons.push(named ? { kind: 'chosen', key: '你挑的家「{0}」就是这个系列', vars: [named] } : { kind: 'chosen', key: '你挑的家里有一个就是这个系列', vars: [] });
  }
  const traits = [];
  for (const [vals, tv] of [
    [f.axes, T.axes],
    [f.hidden, T.hidden],
  ]) {
    for (const [axis, tgt] of Object.entries(tv || {})) {
      const p = num(vals?.[axis]);
      if (p == null || Math.abs(tgt - 50) < TARGET_SIDE || Math.abs(p - 50) < GUEST_SIDE || p >= 50 !== tgt >= 50) continue;
      traits.push({ axis, side: tgt >= 50 ? 'a' : 'b', strength: Math.min(Math.abs(p - 50), Math.abs(tgt - 50)) });
    }
  }
  // 最明显的两条（一样明显：四条主轴在前，按轴的顺序）—— 排序是稳定的
  traits.sort((a, b) => b.strength - a.strength);
  const said = traits.slice(0, 2).map((x) => traitText(key, x.axis, x.side));
  if (said.length === 2) reasons.push({ kind: 'traits', key: '你喜欢{0}，也喜欢{1}', vars: said });
  else if (said.length === 1) reasons.push({ kind: 'traits', key: '你喜欢{0}', vars: said });
  // 只引用这个系列点名的那张图；只是用到同一种材质的图照样加分，但不拿来说「就是这种感觉」
  const label = hits.find((p) => want.has(p.id) && p.label)?.label;
  if (label) reasons.push({ kind: 'pick', key: '你选了「{0}」—— 这个系列就是这种感觉', vars: [label] });
  const wish = wishes.map((w) => (FLOW.WISHES || []).find((x) => x.v === w)).find((x) => x?.label);
  if (wish) reasons.push({ kind: 'wishes', key: '也照顾到你的愿望「{0}」', vars: [wish.label] });
  const d = DREAMER_BY_CODE[f.code];
  if (d && styles.length) reasons.push({ kind: 'card', key: '和你的牌「{0}」很合拍', vars: [{ zh: d.zh, en: d.en }] });
  return { key, score: r3(parts.reduce((s, x) => s + x.v, 0)), parts, reasons: reasons.slice(0, 3), n };
}

/** 客人档案里 recommendSeries 用得到的（只有这些：轴、牌、选的图、愿望） */
function factsOf(profile, chosen) {
  const p = profile && typeof profile === 'object' ? profile : {};
  const axes = Object.fromEntries(CORE.map((k) => [k, num(p.axes?.[k])]).filter(([, v]) => v != null));
  const hidden = Object.fromEntries(HID.map((k) => [k, num(p.hidden?.[k])]).filter(([, v]) => v != null));
  const code = DREAMER_BY_CODE[p.code] ? p.code : null;
  const list = (Array.isArray(chosen) ? chosen : chosen ? [chosen] : []).filter((c) => c && typeof c === 'object');
  const withSeries = list.map((c) => ({ series: seriesKeyOf(c.series), title: c.title })).filter((c) => c.series);
  // 没写系列的案例（3D 方案、员工还没定的）：看它自己的风格最像哪一个（只看轴，小小的加分）
  const lookalike = list
    .filter((c) => !seriesKeyOf(c.series) && c.style?.axes)
    .map((c) => {
      let best = null;
      let bv = -Infinity;
      for (const key of SERIES_KEYS) {
        const { sim, n } = axisSim(c.style.axes, c.style.hidden, SERIES_TARGET[key], SERIES_WEIGHTS.hidden);
        if (n && sim > bv + 1e-9) {
          bv = sim;
          best = key;
        }
      }
      return best;
    })
    .filter(Boolean);
  return {
    axes,
    hidden,
    code,
    cardStyles: code ? CARD_STYLES[code] || [] : [],
    picks: picksOf(p),
    wishes: Array.isArray(p.wishes) ? p.wishes.filter((w) => typeof w === 'string') : [],
    chosen: withSeries,
    lookalike,
  };
}

/**
 * 建议客人拿哪一个系列 → [{ key, score, reasons: [{ kind, key, vars }], parts }]，五个都在，最合适的在前
 * （同分：算进去的轴多的在前 —— 说得出更多理由的那个；再一样按品牌手册的顺序）。
 *   profile：客人档案（code / axes / hidden / wishes / answers.pairs —— 只用这些）。
 *   chosen：客人挑的案例（案例对象）：写了系列的（case.series）分量最重；没写的看它的风格最像哪一个，加一点点。
 * reasons：最多 3 句，key 是 t() 的中文模板（i18n 的 key），vars 是客人自己的答案（中文字符串 = t() 翻；{ zh, en } = 按语言取）；
 *   用 seriesReasonText(r) 变成现在的语言的句子（cases.js 的 reasonText 也认得）。kind：chosen · traits · pick · wishes · card。
 * parts：每一项加了多少（调分数 / 测试用，界面不用）。
 * 客人什么都没答（没有轴）→ 五个的轴分都是 0.5，理由只有答过的那几样。
 */
export function recommendSeries(profile, { chosen = [] } = {}) {
  const f = factsOf(profile, chosen);
  const list = SERIES_KEYS.map((key) => scoreSeries(key, f));
  const at = Object.fromEntries(SERIES_KEYS.map((k, i) => [k, i]));
  list.sort((a, b) => b.score - a.score || b.n - a.n || at[a.key] - at[b.key]);
  return list.map(({ n, ...x }) => x);
}

/** recommendSeries 的结果 → 前 n 个 key（cases.js 配案例用） */
export const topSeries = (rec, n = 2) => (Array.isArray(rec) ? rec.slice(0, n).map((x) => x.key) : []);

const varText = (v) => (v == null ? '' : typeof v === 'number' ? String(v) : typeof v === 'string' ? t(v) : isEn() ? v.en || v.zh || '' : v.zh || v.en || '');

/** 一句理由 → 现在的语言的句子 */
export function seriesReasonText(r) {
  if (!r?.key) return '';
  return t(r.key, (r.vars || []).map(varText));
}
