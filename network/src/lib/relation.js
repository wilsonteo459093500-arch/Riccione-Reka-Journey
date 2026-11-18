/* ============================================================
   SPACE · 第 3 阶段：关系（纯函数，有单元测试）
   ------------------------------------------------------------
   • 好感度（Sims 风）：每次联系会加分，没联系就慢慢掉回「陌生」
   • 圈层 → 该多久联系一次；「今天该找谁」
   • 「要找人帮忙时谁有这个资源」搜索（不用 AI、不花钱）
   • 星系图的位置、见面前的提示卡、TickTick / 行事历
   ============================================================ */
import { normName } from './logic.js';
import { openPromises } from './talk.js';

const DAY = 86400000;

/* ---------- 好感度 ---------- */
// 每种联系加多少（满分 100）；越接近 100 加得越少（跟 Sims 一样，越熟越难再往上）
export const CONTACT_GAIN = { meeting: 18, event: 10, call: 12, message: 6, card_scan: 8, note: 0 };
export const CONTACT_KINDS = ['meeting', 'event', 'call', 'message', 'card_scan'];
export const MOOD_STEP = 4;        // 对话气氛 -2 ~ +2，每一级 ±4
export const AFFINITY = {
  start: 35,      // 刚认识
  floor: 10,      // 一直不联系，最后掉到这里
  halfLife: 90,   // 不联系 90 天，跟 floor 的距离少一半
};

const ms = (iso) => {
  if (!iso) return NaN;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : t;
};
const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

function decay(a, days) {
  if (!(days > 0)) return a;
  return AFFINITY.floor + (a - AFFINITY.floor) * 0.5 ** (days / AFFINITY.halfLife);
}

/** 一笔互动加多少分：种类 + 气氛（AI 整理过的对话才有气氛）；同一天第二笔起只算一半 */
export function gainOf(interaction) {
  const base = CONTACT_GAIN[interaction.kind] || 0;
  if (!base) return 0;
  const mood = Number(interaction.ai && interaction.ai.mood && interaction.ai.mood.score);
  return base + (Number.isFinite(mood) ? clamp(Math.round(mood), -2, 2) * MOOD_STEP : 0);
}

/** 从哪一天开始算（认识那天 / 建档那天 / 第一笔互动，取最早） */
function originOf(person, interactions) {
  const ts = [ms(person.met_on), ms(person.created_at), ...interactions.map((i) => ms(i.occurred_at))].filter(Number.isFinite);
  return ts.length ? Math.min(...ts) : NaN;
}

/**
 * 好感度在几个时间点的值（时间点要由小到大）。
 * 好感度完全由互动记录算出来 —— 删掉 / 补记一笔互动，过去的曲线也会跟着变。
 */
export function affinitySeries(person, interactions = [], times = [Date.now()]) {
  const events = interactions
    .filter((i) => CONTACT_GAIN[i.kind] && Number.isFinite(ms(i.occurred_at)))
    .map((i) => ({ t: ms(i.occurred_at), g: gainOf(i) }))
    .sort((x, y) => x.t - y.t);
  const origin = originOf(person, interactions);
  const out = [];
  let a = AFFINITY.start;
  let t = Number.isFinite(origin) ? origin : (times[0] ?? Date.now());
  let lastDay = '';
  let k = 0;
  for (const at of times) {
    while (k < events.length && events[k].t <= at) {
      const e = events[k++];
      a = decay(a, (e.t - t) / DAY);
      t = Math.max(t, e.t);
      let g = e.g;
      const dk = dayKey(e.t);
      if (dk === lastDay) g *= 0.5;
      lastDay = dk;
      a = clamp(g > 0 ? a + g * (1 - a / 120) : a + g);
    }
    if (at < t) { out.push(Math.round(a)); continue; } // 还没认识（或时间点在最后一笔之前）
    out.push(Math.round(clamp(decay(a, (at - t) / DAY))));
  }
  return out;
}

export function affinityAt(person, interactions = [], at = Date.now()) {
  return affinitySeries(person, interactions, [at])[0];
}

export const BANDS = [
  { min: 80, key: 'bestie', label: '挚友', color: '#15803D' },
  { min: 60, key: 'good', label: '好朋友', color: '#22A55B' },
  { min: 40, key: 'friend', label: '朋友', color: '#84A31A' },
  { min: 20, key: 'acq', label: '点头之交', color: '#CA8A04' },
  { min: -1, key: 'fading', label: '快忘了', color: '#B91C1C' },
];
export function bandOf(affinity) { return BANDS.find((b) => (affinity ?? 0) >= b.min) || BANDS[BANDS.length - 1]; }

/* ---------- 圈层 → 联系频率 ---------- */
export const CADENCE = { core: 14, important: 30, active: 60, known: 120 };
export const CADENCE_LABEL = { core: '每 2 周', important: '每个月', active: '每 2 个月', known: '每 4 个月' };
const TIER_WEIGHT = { core: 1.6, important: 1.3, active: 1.0, known: 0.6 };

/** 上次真的联系（见面、电话、讯息、活动、交换名片）是什么时候 */
export function lastContactMs(person, interactions = []) {
  const ts = [ms(person.last_contact_at), ...interactions.filter((i) => CONTACT_KINDS.includes(i.kind)).map((i) => ms(i.occurred_at))].filter(Number.isFinite);
  return ts.length ? Math.max(...ts) : NaN;
}

/**
 * 一个人的关系状态：好感度、30 天趋势、上次联系、该不该联系了
 * 回 { affinity, band, trend, daysSince, cadence, dueIn, ratio, overdue, snoozed }
 */
export function relationOf(person, interactions = [], now = Date.now()) {
  const [before, affinity] = affinitySeries(person, interactions, [now - 30 * DAY, now]);
  const last = lastContactMs(person, interactions);
  const ref = Number.isFinite(last) ? last : originOf(person, interactions);
  const daysSince = Number.isFinite(ref) ? Math.max(0, Math.floor((now - ref) / DAY)) : null;
  const cadence = CADENCE[person.tier] || CADENCE.known;
  const ratio = daysSince == null ? 0 : daysSince / cadence;
  const snoozeT = ms(person.snooze_until ? `${person.snooze_until}T23:59:59` : null);
  return {
    affinity,
    band: bandOf(affinity),
    trend: affinity - before,
    contacted: Number.isFinite(last),
    daysSince,
    cadence,
    dueIn: daysSince == null ? null : cadence - daysSince,
    ratio,
    overdue: ratio >= 1,
    snoozed: Number.isFinite(snoozeT) && snoozeT >= now,
  };
}

/** 过去 N 天的好感度曲线（画小图用） */
export function affinityHistory(person, interactions = [], { days = 180, step = 5, now = Date.now() } = {}) {
  const times = [];
  for (let d = days; d >= 0; d -= step) times.push(now - d * DAY);
  if (times[times.length - 1] !== now) times.push(now);
  const vals = affinitySeries(person, interactions, times);
  const origin = originOf(person, interactions);
  return times.map((t, i) => ({ t, v: Number.isFinite(origin) && t < origin ? null : vals[i] }));
}

/* ---------- 今天该找谁 ---------- */
const firstName = (name) => {
  const s = String(name || '').replace(/\b(dato'?|datuk|dr|mr|mrs|ms|madam|tan sri|puan|encik)\.?\s+/gi, '').trim();
  if (/[一-鿿]/.test(s)) return s.replace(/[^一-鿿]/g, '').slice(-2) || s;
  return s.split(/\s+/)[0] || s;
};
export { firstName };

const parseDue = (due) => (/^\d{4}-\d{2}-\d{2}$/.test(String(due || '')) ? ms(`${due}T23:59:59`) : NaN);

/** 可以聊什么：最近的对话「下次可以聊」→ 深度分析的话题 → 兴趣 */
export function topicsFor(person, max = 6) {
  const out = [];
  const add = (x) => { const v = String(x || '').trim(); if (v && !out.includes(v)) out.push(v); };
  const recent = (person.interactions || []).filter((i) => i.ai && Array.isArray(i.ai.next_topics)).slice(0, 3);
  for (const i of recent) i.ai.next_topics.forEach(add);
  ((person.assessment && person.assessment.talk_topics) || []).forEach(add);
  (person.interests || []).forEach((x) => add(`他喜欢的${x}`));
  return out.slice(0, max);
}

/**
 * 今天该联系的人，最该先找的在前面。
 * people 要是 store.view() 过的（有 interactions、rel）。
 * 回 [{ person, score, reasons: [{kind, text}], topic, action }]
 */
export function todayActions(people, { now = Date.now(), limit = 7 } = {}) {
  const out = [];
  for (const p of people) {
    const rel = p.rel || relationOf(p, p.interactions || [], now);
    if (rel.snoozed) continue;
    const reasons = [];
    let score = 0;
    const promises = openPromises(p.interactions || []);
    const mine = promises.filter((x) => x.item.who !== 'him');
    const theirs = promises.filter((x) => x.item.who === 'him');

    if (mine.length) {
      const late = mine.filter((x) => parseDue(x.item.due) <= now);
      score += 60 + 5 * (mine.length - 1) + (late.length ? 25 : 0);
      reasons.push({ kind: 'promise', text: `${late.length ? '到期了 · ' : ''}你答应过：${mine[0].item.what}${mine.length > 1 ? `（还有 ${mine.length - 1} 件）` : ''}` });
    }
    const oldTheirs = theirs.filter((x) => now - ms(x.interaction.occurred_at) >= 7 * DAY);
    if (oldTheirs.length) {
      score += 10;
      reasons.push({ kind: 'follow', text: `他说要「${oldTheirs[0].item.what}」，可以顺便问问` });
    }

    const metT = Number.isFinite(ms(p.met_on)) ? ms(p.met_on) : ms(p.created_at);
    // 建档时自动记的那一笔（交换名片 / 认识）不算「跟进」
    const born = ms(p.created_at);
    const contacts = (p.interactions || []).filter((i) => ['meeting', 'call', 'message', 'event'].includes(i.kind)
      && !(Number.isFinite(born) && Math.abs(ms(i.created_at) - born) < 120000));
    const metDays = Number.isFinite(metT) ? Math.floor((now - metT) / DAY) : null;
    if (metDays != null && metDays <= 3 && !contacts.length) {
      score += 50;
      reasons.push({ kind: 'new', text: metDays === 0 ? '今天刚认识：发个讯息，让他记得你' : `刚认识 ${metDays} 天：48 小时内跟进一下，让他记得你` });
    } else if (rel.overdue) {
      score += 15 * Math.min(rel.ratio, 2.5) * (TIER_WEIGHT[p.tier] || 1);
      reasons.push({ kind: 'overdue', text: rel.contacted ? `上次联系 ${rel.daysSince} 天前（${CADENCE_LABEL[p.tier] || CADENCE_LABEL.known}一次）` : `认识 ${rel.daysSince} 天了，还没联系过` });
    } else if (rel.ratio >= 0.85 && (p.tier === 'core' || p.tier === 'important')) {
      score += 8;
      reasons.push({ kind: 'soon', text: `快到该联系的时候了（${rel.dueIn <= 0 ? '今天' : `${rel.dueIn} 天后`}）` });
    }

    if (rel.trend <= -8 && (p.tier === 'core' || p.tier === 'important')) {
      score += 15;
      reasons.push({ kind: 'cooling', text: `好感度 30 天掉了 ${-rel.trend}，在变淡` });
    }

    if (score <= 0) continue;
    score += (p.worth_score || 0) / 10;
    const topic = topicsFor(p, 1)[0] || '';
    const action = p.tier === 'core' || (mine.length && p.tier === 'important') ? 'meet' : rel.ratio >= 2 && p.tier !== 'known' ? 'call' : 'message';
    out.push({ person: p, score, reasons, topic, action });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export const ACTION_LABEL = { meet: '约见面', call: '打个电话', message: '发个讯息' };
export const ACTION_MINUTES = { meet: 60, call: 20, message: 15 };

/* ---------- 要找人帮忙：谁有这个资源 ---------- */
// 同一组里的字互相通用（中文 / 英文 / 马来文都有人这样写名片）
export const SYNONYMS = [
  ['律师', 'lawyer', 'legal', '法律', 'advocate', 'solicitor', 'law firm', 'peguam'],
  ['会计', 'accountant', 'accounting', 'audit', '审计', '税务', 'tax', '报税'],
  ['建筑师', 'architect', '建筑设计', 'arkitek'],
  ['室内设计', 'interior', '设计师', 'designer', 'design studio'],
  ['发展商', 'developer', '房地产开发', '地产商', 'pemaju'],
  ['地产', 'property', 'real estate', 'realty', '中介', 'negotiator', 'agent', 'hartanah'],
  ['银行', 'bank', 'banker', '贷款', 'loan', '融资', 'financing', 'finance', 'mortgage'],
  ['保险', 'insurance', 'takaful', 'insurans'],
  ['政府', 'government', '官员', '议员', 'mp', 'adun', '部长', 'majlis', 'kerajaan', '市议会'],
  ['媒体', 'media', '记者', 'journalist', 'kol', '网红', 'influencer', '博主', 'youtuber', '报社'],
  ['营销', 'marketing', '广告', 'advertising', '品牌', 'branding', 'agency'],
  ['装修', 'renovation', 'contractor', '承包商', '师傅', 'builder', 'construction', '建筑公司', '工程'],
  ['酒店', 'hotel', 'hospitality', 'resort'],
  ['餐饮', 'f&b', 'restaurant', '餐厅', 'cafe', '咖啡'],
  ['医生', 'doctor', 'clinic', '诊所', '医院', 'hospital', 'medical'],
  ['商会', 'chamber', 'association', '协会', '公会', 'persatuan'],
  ['投资', 'investor', 'investment', 'vc', '天使', 'fund', '基金'],
  ['供应商', 'supplier', 'vendor', '工厂', 'factory', 'manufacturer', '制造', 'oem'],
  ['物流', 'logistics', '运输', 'shipping', 'forwarder', 'lori'],
  ['科技', 'software', '软件', 'tech', 'it', '系统', 'ai', 'app'],
  ['教育', 'school', 'education', '学校', 'university', '大学', '老师', 'teacher', 'tuition'],
  ['印刷', 'printing', 'print', '包装', 'packaging'],
  ['摄影', 'photographer', 'photography', 'videographer', '拍摄', '视频'],
  ['活动', 'event', 'events', '场地', 'venue', '策划'],
  ['招聘', 'hr', 'recruit', 'recruitment', '人力资源', 'headhunter', '猎头'],
  ['高端客户', '高端', 'high net worth', 'hnw', '富豪', '有钱人', 'luxury', '豪宅', 'bungalow'],
];

/** 一个查询展开成好几个词（同义词也算） */
export function expandQuery(q) {
  const words = String(q || '').toLowerCase().split(/[\s,，、/]+/).map((w) => w.trim()).filter(Boolean);
  const out = new Set(words);
  for (const w of words) {
    for (const group of SYNONYMS) {
      if (group.some((g) => g === w || (w.length >= 2 && g.length >= 2 && !/^[a-z0-9&]{1,3}$/.test(g) && (g.includes(w) || w.includes(g))))) group.forEach((g) => out.add(g));
    }
  }
  return [...out];
}

// 很短的英文（mp、it、ai…）要整个字一样才算，不然 company 也会中 mp
function hit(hay, term) {
  if (!hay) return false;
  const h = String(hay).toLowerCase();
  if (/^[a-z0-9&]{1,3}$/.test(term)) return new RegExp(`(^|[^a-z0-9])${term.replace(/[&]/g, '\\&')}([^a-z0-9]|$)`).test(h);
  return h.includes(term);
}

/**
 * 我要找「律师」「装修贷款」「发展商」→ 谁有？
 * 看：他有的资源、职位、公司 / 行业、商会、兴趣 / 标签、备注、对话里他提过认识谁。
 * 分数再乘上关系（好感度、圈层）：同样有，关系近的先找。
 * 回 [{ person, score, why: [string], ready: bool }]
 */
export function findHelpers(people, query, { limit = 30 } = {}) {
  const terms = expandQuery(query);
  if (!terms.length) return [];
  const out = [];
  for (const p of people) {
    const why = [];
    let s = 0;
    const check = (weight, label, value) => {
      if (!value) return false;
      const t = terms.find((x) => hit(value, x));
      if (!t) return false;
      s += weight;
      if (why.length < 4) why.push(`${label}：${String(value).slice(0, 60)}`);
      return true;
    };
    for (const r of (p.resources || []).filter((x) => x.kind === 'has')) check(r.source === 'ai' ? 3 : 5, r.source === 'ai' ? '可能有（AI 推测）' : '他有', [r.label, r.detail].filter(Boolean).join(' · '));
    check(4, '职位', p.title);
    const c = p.company;
    if (c) {
      check(3, '公司', [c.name, c.name_alt].filter(Boolean).join(' / '));
      check(3, '行业', [c.industry, c.background && c.background.industry].filter(Boolean).join(' / '));
      if (c.background) check(1, '公司做', (c.background.products || []).join('、'));
    }
    for (const ci of p.circles || []) check(2, '圈子', `${ci.name}${ci.link && ci.link.role ? `（${ci.link.role}）` : ''}`);
    check(2, '标签', (p.tags || []).join('、'));
    check(1, '兴趣', (p.interests || []).join('、'));
    check(1, '备注', [p.notes, p.card_notes, p.how_met].filter(Boolean).join(' '));
    for (const i of (p.interactions || []).slice(0, 20)) {
      for (const m of (i.ai && i.ai.people_mentioned) || []) check(2, '他认识', `${m.name}（${m.context}）`);
    }
    if (s <= 0) continue;
    const rel = p.rel || relationOf(p, p.interactions || []);
    const relF = 0.4 + 0.6 * (rel.affinity / 100);
    const tierF = { core: 1.3, important: 1.15, active: 1, known: 0.9 }[p.tier] || 1;
    out.push({ person: p, score: s * relF * tierF, why, ready: rel.affinity >= 30 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** 「我」页的「我缺的」→ 拆成可以一键搜的词 */
export function lackingChips(text, max = 8) {
  return [...new Set(String(text || '').split(/[；;、，,。/\n]+/).map((x) => x.replace(/^(高端住宅的|好的|能介绍)/, '').replace(/(人脉|的人)$/, '').trim()).filter((x) => x.length >= 2 && x.length <= 12))].slice(0, max);
}

/* ---------- 星系图 ---------- */
export const ORBITS = { core: 0.22, important: 0.42, active: 0.63, known: 0.85 };
function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

/**
 * 每个人在星系图上的位置（中心 = 我，0 ~ 1 的座标）。
 * 圈层 = 哪一条轨道；好感度越高越靠近中心；「值得认识分」越高星星越大。
 */
export function galaxyLayout(people) {
  const by = { core: [], important: [], active: [], known: [] };
  for (const p of people) (by[p.tier] || by.known).push(p);
  const nodes = [];
  const band = 0.075;
  Object.entries(by).forEach(([tier, list], ti) => {
    const sorted = list.slice().sort((a, b) => hash(a.id) - hash(b.id));
    const n = sorted.length;
    // 12 点钟方向留一个缺口放轨道名字；每条轨道错开一点，不会排成一直线
    const gap = 0.32;
    const span = Math.PI * 2 - gap * 2;
    const offset = ((ti * 0.37) % 1) / Math.max(n, 1);
    sorted.forEach((p, i) => {
      const aff = p.rel ? p.rel.affinity : (p.affinity ?? 50);
      const frac = n === 1 ? 0.5 : (i + 0.5 + offset) / n;
      const angle = -Math.PI / 2 + gap + frac * span + (hash(`${p.id}a`) - 0.5) * (span / Math.max(n, 4)) * 0.5;
      const r = ORBITS[tier] + (0.5 - aff / 100) * band * 2 + (hash(`${p.id}r`) - 0.5) * band * 0.5;
      nodes.push({
        person: p, tier, angle, r,
        x: 0.5 + Math.cos(angle) * r * 0.5,
        y: 0.5 + Math.sin(angle) * r * 0.5,
        size: 0.009 + ((p.worth_score ?? 30) / 100) * 0.012 + (tier === 'core' ? 0.004 : 0),
      });
    });
  });
  return nodes;
}

/* ---------- 见面前的提示卡 ---------- */
export const TIPS = [
  '先叫他的名字 —— 对他来说，那是最好听的声音。',
  '多问、少说：问他最近在忙什么，然后认真听。',
  '找一件可以真诚称赞的事，具体地讲出来。',
  '聊他感兴趣的事，不是你感兴趣的事。',
  '先给：今天能帮他什么？介绍谁、分享什么？',
  '记得他上次说的事，问一句「后来怎样了？」',
  '答应的事，当场记下来，回去一定做到。',
];

/** 从备注里挑出「【日期】近况」那几行，最新的在前 */
export function recentFacts(notes, max = 4) {
  return String(notes || '').split('\n').map((l) => l.trim()).filter((l) => /^【\d{4}-\d{2}-\d{2}】/.test(l)).reverse().slice(0, max);
}

export function briefFor(person, now = Date.now()) {
  const rel = person.rel || relationOf(person, person.interactions || [], now);
  const promises = openPromises(person.interactions || []);
  const talks = (person.interactions || []).filter((i) => i.kind !== 'note' || i.summary);
  const last = talks[0] || null;
  const give = [
    ...(person.resources || []).filter((r) => r.kind === 'give').map((r) => r.label),
    ...((person.assessment && person.assessment.give_ideas) || []).map((g) => g.idea),
  ].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 4);
  return {
    rel,
    last: last ? { title: last.title, summary: last.summary, at: last.occurred_at, kind: last.kind, mood: last.ai && last.ai.mood } : null,
    mine: promises.filter((x) => x.item.who !== 'him'),
    theirs: promises.filter((x) => x.item.who === 'him'),
    avoid: person.avoid_topics || [],
    topics: topicsFor(person, 6),
    facts: recentFacts(person.notes, 4),
    give,
    needs: (person.resources || []).filter((r) => r.kind === 'needs').map((r) => r.label).slice(0, 5),
    circles: (person.circles || []).map((c) => (c.link && c.link.role ? `${c.name}（${c.link.role}）` : c.name)),
    tip: TIPS[Math.floor(now / DAY) % TIPS.length],
  };
}

/** 提示卡 → 一段纯文字（放进 TickTick 的任务内容） */
export function briefText(person, brief) {
  const lines = [];
  const add = (title, list) => { if (list && list.length) lines.push(`${title}`, ...list.map((x) => `• ${x}`), ''); };
  lines.push(`${person.name}${person.title || (person.company && person.company.name) ? ` · ${[person.title, person.company && person.company.name].filter(Boolean).join(' · ')}` : ''}`);
  lines.push(`好感度 ${brief.rel.affinity}（${brief.rel.band.label}）${brief.rel.contacted ? ` · 上次联系 ${brief.rel.daysSince} 天前` : ''}`, '');
  add('⚠️ 别聊', brief.avoid);
  add('✅ 我答应过他', brief.mine.map((x) => x.item.what));
  add('⏳ 他答应过', brief.theirs.map((x) => x.item.what));
  if (brief.last) lines.push('上次', `• ${String(brief.last.at || '').slice(0, 10)} ${brief.last.title || ''} ${brief.last.summary || ''}`.trim(), '');
  add('💬 可以聊', brief.topics);
  add('🎁 我能给他', brief.give);
  add('近况', brief.facts);
  return lines.join('\n').trim();
}

/* ---------- TickTick / 行事历 ---------- */
const pad = (n) => String(n).padStart(2, '0');
/** TickTick 要的日期格式：yyyy-MM-dd'T'HH:mm:ss+0000（UTC） */
export function tickDate(d) {
  const x = new Date(d);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:${pad(x.getUTCSeconds())}+0000`;
}

/** 下一个整点 / 半点（排时间盒的默认开始时间） */
export function nextSlot(now = Date.now(), stepMin = 30) {
  const d = new Date(now + 10 * 60000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / stepMin) * stepMin);
  return d;
}

export function toLocalInput(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

const ACTION_EMOJI = { meet: '☕', call: '📞', message: '💬' };

/** 一个时间盒任务：标题、开始 / 结束、内容（提示卡 + WhatsApp 连结） */
export function buildTask({ person, action = 'message', start, minutes, brief, wa = '', appUrl = '', timeZone = 'Asia/Kuala_Lumpur' }) {
  const s = new Date(start);
  const mins = minutes || ACTION_MINUTES[action] || 15;
  const e = new Date(s.getTime() + mins * 60000);
  const content = [
    brief ? briefText(person, brief) : '',
    wa ? `WhatsApp：${wa}` : '',
    appUrl ? `SPACE：${appUrl}` : '',
  ].filter(Boolean).join('\n\n');
  return {
    title: `${ACTION_EMOJI[action] || ''} ${ACTION_LABEL[action] || '联系'}：${person.name}`.trim(),
    content: content.slice(0, 4000),
    startDate: tickDate(s),
    dueDate: tickDate(e),
    isAllDay: false,
    timeZone,
  };
}

/** 好几个人排成连续的时间盒（「一键排进 TickTick」） */
export function buildTaskBatch(items, { start, gapMin = 0, ...rest }) {
  let t = new Date(start).getTime();
  return items.map((it) => {
    const minutes = it.minutes || ACTION_MINUTES[it.action] || 15;
    const task = buildTask({ ...rest, ...it, start: t, minutes });
    t += (minutes + gapMin) * 60000;
    return task;
  });
}

const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
const icsDate = (d) => tickDate(d).replace(/[-:]/g, '').replace('+0000', 'Z');

/** 没接 TickTick 时：做一个 .ics（手机行事历、TickTick 都能开） */
export function buildIcs(tasks, now = Date.now()) {
  const fold = (line) => {
    const out = [];
    let rest = line;
    while (rest.length > 70) { out.push(rest.slice(0, 70)); rest = ` ${rest.slice(70)}`; }
    out.push(rest);
    return out.join('\r\n');
  };
  const ev = tasks.map((t, i) => [
    'BEGIN:VEVENT',
    `UID:space-${now}-${i}@space`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(fromTick(t.startDate))}`,
    `DTEND:${icsDate(fromTick(t.dueDate))}`,
    fold(`SUMMARY:${icsEsc(t.title)}`),
    fold(`DESCRIPTION:${icsEsc(t.content)}`),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:SPACE', 'TRIGGER:-PT10M', 'END:VALARM',
    'END:VEVENT',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SPACE//network//ZH', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR', ''].join('\r\n');
}

function fromTick(s) { return new Date(String(s).replace(/\+0000$/, 'Z')); }

/** 名字 → 人（给「提到的人」找找看是不是已经在人脉里） */
export function findByName(people, name) {
  const n = normName(name);
  if (!n || n.length < 2) return null;
  return people.find((p) => [normName(p.name), normName(p.name_alt)].includes(n)) || null;
}
