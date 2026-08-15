// 互动数据 —— 让工具看见「这条为什么成」，而不只是「这条长什么样」。
//
// 起因是两条真实参考片，画面都很好，但引擎完全不同：
//
//   palmier.io   83.1K 赞 / 830 评论 / 41.1K 分享 / 37K 收藏  → 分享是赞的 49%，转发驱动
//   growithfyn    363 赞 / 1197 评论 /  360 分享 /  397 收藏  → 评论是赞的 330%，评论驱动
//
// 第二条的绝对数只有第一条的 1/200，但它的评论结构才是高客单价生意该抄的那个。
// 只看视频完全分不出来 —— 两条都是「口播 + 字幕 + 好看的光」。
//
// 模型看不到这些数字，所以由用户粘进来，这里算成比值再送进 prompt。
// 比值必须在代码里算：模型做算术不可靠，而这几个除法是整件事的判断依据。

/** 万 / 亿 / K / M 都要认；小红书用「万」，IG 用 K/M */
const UNITS = [
  [/亿/i, 1e8],
  [/万|w\b/i, 1e4],
  [/m\b/i, 1e6],
  [/k\b/i, 1e3],
];

function toNumber(raw) {
  const s = String(raw || '').replace(/[,，\s]/g, '');
  const m = s.match(/(\d+(?:\.\d+)?)\s*([亿万wkmWKM]?)/);
  if (!m) return null;
  let n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2] || '';
  for (const [re, mult] of UNITS) {
    if (unit && re.test(unit)) {
      n *= mult;
      break;
    }
  }
  return Math.round(n);
}

// 一个词可能出现在数字前面（「赞 363」）也可能后面（「363 赞」），两边都要扫。
// 顺序很重要：先匹配更具体的词，否则「点赞」会被「赞」抢走、「转发」被「发」抢走。
const FIELDS = [
  ['views', /播放|观看|浏览|views?|plays?/i],
  ['comments', /评论|留言|comments?/i],
  ['saves', /收藏|saves?|bookmark/i],
  ['shares', /分享|转发|sends?|shares?|repost/i],
  ['likes', /点赞|喜欢|赞|likes?|hearts?/i],
];

/**
 * 从一段随手粘的文本里抠出数据。
 * 「363 赞 1,197 评论 397 收藏」和「likes 83.1K, saves 37K」都能认。
 */
// 逗号只能当千分位用 —— 必须后跟正好三位数字。
// 写成宽松的 [\d,.]* 会出事：「comments 340, saves 2.1K」里，
// 「340,」会被当成数字、后面的空格接上 saves，于是收藏被读成 340。
const NUM = '\\d+(?:[,，]\\d{3})*(?:\\.\\d+)?\\s*[亿万wkmWKM]?';

/**
 * 一段文本里，数字要么**全部**在标签前（「363 赞 1197 评论」），
 * 要么**全部**在标签后（「点赞 100 评论 20」）。方向必须整段判定一次，不能逐字段各判各的 ——
 * 否则「点赞 100 评论 20」里，「100 评论」会先被匹配上，评论数变成 100。
 *
 * 判定办法：找到第一个出现的标签，看它前面紧挨着的是不是一个数字。
 */
function numberComesFirst(s) {
  let firstAt = Infinity;
  for (const [, re] of FIELDS) {
    const m = s.match(new RegExp(re.source, 'i'));
    if (m && m.index < firstAt) firstAt = m.index;
  }
  if (firstAt === Infinity) return false;
  return new RegExp(`(${NUM})\\s*(?:个)?\\s*$`, 'i').test(s.slice(0, firstAt));
}

/**
 * 从一段随手粘的文本里抠出数据。
 * 「363 赞 1,197 评论 397 收藏」和「likes 83.1K, saves 37K」都能认。
 */
export function parseMetrics(text) {
  const s = String(text || '');
  if (!s.trim()) return {};

  const before = (re) => new RegExp(`(${NUM})\\s*(?:个)?\\s*(?:${re.source})`, 'i');
  const after = (re) => new RegExp(`(?:${re.source})\\s*[:：]?\\s*(${NUM})`, 'i');
  const [primary, fallback] = numberComesFirst(s) ? [before, after] : [after, before];

  const out = {};
  for (const build of [primary, fallback]) {
    for (const [key, re] of FIELDS) {
      if (out[key] != null) continue;
      const m = s.match(build(re));
      if (m) out[key] = toNumber(m[1]);
    }
  }
  return out;
}

/**
 * 经验区间，不是测量值。
 *
 * 各平台、各品类差异很大，这里只用来回答一个问题：
 * 「这条片子的某个动作，是不是明显偏离了它自己的点赞量该有的样子。」
 * 判断永远是**相对它自己的赞数**，不是跟别的账号比绝对值。
 */
const BANDS = {
  comments: { typical: [0.02, 0.1], strong: 0.25, label: '评论' },
  shares: { typical: [0.05, 0.15], strong: 0.25, label: '分享/转发' },
  saves: { typical: [0.05, 0.15], strong: 0.25, label: '收藏' },
};

const DRIVER = {
  comments: {
    id: 'comment',
    name: '评论驱动',
    means:
      '评论数远超它的赞数，说明片子里有一个**明确要求你留言**的动作（最常见是「留言 XX 我发你 YY」），' +
      '不是内容自然引发的讨论。这类内容在筛人，不在触达 —— 对高客单价生意通常比冲赞数正确。',
  },
  shares: {
    id: 'share',
    name: '转发驱动',
    means:
      '大量人把它发给了具体某个人。要么它解决了一个「我认识的人正好需要」的问题，要么它有「你得看看这个」的奇观感。' +
      'Reels / 视频号上转发的权重高于点赞。',
  },
  saves: {
    id: 'save',
    name: '收藏驱动',
    means: '被当成资料存起来了 —— 清单、参数、避坑、对照表这一类。收藏是小红书最强的排序信号。',
  },
};

/**
 * @param {object} m parseMetrics 的输出或手填
 * @returns {{ratios:object, drivers:Array, notes:Array, ok:boolean}}
 */
export function analyzeMetrics(m = {}) {
  const likes = Number(m.likes) || 0;
  if (!likes) {
    return {
      ok: false,
      ratios: {},
      drivers: [],
      notes: ['没有点赞数就算不出比值 —— 所有判断都是「相对它自己的赞数」，不是跟别的账号比绝对值。'],
    };
  }

  const ratios = {};
  const drivers = [];
  const notes = [];

  for (const key of ['comments', 'shares', 'saves']) {
    const v = Number(m[key]);
    if (!Number.isFinite(v) || v <= 0) continue;
    const r = v / likes;
    const band = BANDS[key];
    ratios[key] = r;
    if (r >= band.strong) {
      drivers.push({ ...DRIVER[key], key, ratio: r, count: v });
    } else if (r < band.typical[0]) {
      notes.push(`${band.label}只有赞的 ${pct(r)}，低于常见区间 —— 这一项不是它的引擎。`);
    }
  }

  if (Number(m.views) && likes) {
    ratios.engagement = likes / Number(m.views);
    notes.push(`点赞率 ${pct(ratios.engagement)}（赞/播放）。`);
  }

  if (!drivers.length) {
    notes.push(
      '三项都在常见区间内,没有哪一项被特别拉起来 —— 这条大概率靠的是画面本身和完播,' +
        '没有装专门的互动机制。想复制它,重点在拍摄和剪辑,不在钩子设计。'
    );
  }

  drivers.sort((a, b) => b.ratio - a.ratio);
  return { ok: true, ratios, drivers, notes };
}

const pct = (r) => `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`;

/** 送进 prompt 的那段话。没数据就返回空字符串，不要塞占位符进去。 */
export function metricsBrief(m = {}) {
  const a = analyzeMetrics(m);
  if (!a.ok) return '';

  const rows = [
    ['点赞', m.likes],
    ['评论', m.comments],
    ['分享/转发', m.shares],
    ['收藏', m.saves],
    ['播放', m.views],
  ]
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `${k} ${Number(v).toLocaleString('en-US')}`)
    .join(' ｜ ');

  const ratioLines = Object.entries(a.ratios)
    .filter(([k]) => k !== 'engagement')
    .map(([k, r]) => `  ${BANDS[k].label} / 点赞 = ${pct(r)}（常见 ${pct(BANDS[k].typical[0])}–${pct(BANDS[k].typical[1])}）`)
    .join('\n');

  const driverText = a.drivers.length
    ? a.drivers.map((d) => `**${d.name}** —— ${d.means}`).join('\n\n')
    : '没有单项被特别拉起来。';

  return `

═══ 这条的真实互动数据（用户提供，你看不到画面之外的东西，务必据此判断）═══

${rows}

比值（已经替你算好，不要重算）：
${ratioLines || '  （数据不全）'}

判定：
${driverText}
${a.notes.length ? `\n${a.notes.map((n) => `- ${n}`).join('\n')}` : ''}

**这段数据比画面重要。** 两条片子可以长得几乎一样，但一条靠转发、一条靠评论，
要抄的东西完全不同。请在 "engine" 字段里明确写出：是画面里的哪一个具体动作把这个比值拉起来的
（例如「底部全程挂着一行『留言 XX』」「第 12 秒出现一个必须停下来看的参数表」），
而不是泛泛地说「内容优质」。`;
}
