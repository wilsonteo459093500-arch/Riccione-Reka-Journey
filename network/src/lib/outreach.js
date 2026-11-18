/* ============================================================
   SPACE · 第 5 阶段：WhatsApp 半自动群发 + 话术（纯函数，有单元测试）
   ------------------------------------------------------------
   • 群发类型：活动后跟进 / 节日问候 / 邀请 / 今日该联系的人 / 自己写
   • 程序先写好每个人的讯息（不花钱）：模板 + 叫名字 + 提他在乎的事（卡耐基）
     想更自然再按「AI 润色」（Haiku，一次一整批，几分钱）
   • 选人：圈层、标签、商会、活动出席、好感度；连续没回 / 刚发过 / 没 WhatsApp 先不勾
   • 回应：回得很热 / 普通回 / 没回 / 不太高兴 → 变成那笔讯息的「气氛」（进好感度）
     从回应算出「什么样的讯息比较多人回」，下次 AI 写的时候参考
   ============================================================ */
import { firstName } from './relation.js';
import { waLink } from './logic.js';

const DAY = 86400000;
const CJK = /[㐀-鿿]/;
const ms = (iso) => { const t = iso ? new Date(iso).getTime() : NaN; return Number.isNaN(t) ? NaN : t; };

/* ---------- 群发类型 ---------- */
export const KINDS = {
  event_follow: { label: '活动后跟进', hint: '活动出席的人：「很高兴在 XX 认识你」' },
  festival: { label: '节日问候', hint: '新年、开斋节、屠妖节、中秋、圣诞…' },
  invite: { label: '邀请 / 分享', hint: '我办活动、展厅开放日、新系列发布' },
  today: { label: '今日该联系的人', hint: '「今日」那几个人，一次写好讯息' },
  custom: { label: '自己写', hint: '其他情况：自己写模板' },
};
export const KIND_KEYS = Object.keys(KINDS);

export const LANGS = {
  auto: '照名字自动（中文名 → 中文，其他 → 英文）',
  zh: '中文',
  en: 'English',
  ms: 'Bahasa Melayu',
};

/* ---------- 节日（祝福语都是常用说法；日期每年不同，不自动算） ---------- */
export const FESTIVALS = [
  { key: 'cny', label: '农历新年', zh: '新年快乐，身体健康，万事如意！', en: 'Happy Chinese New Year! Wishing you good health and prosperity.', ms: 'Selamat Tahun Baru Cina! Semoga sihat dan murah rezeki.' },
  { key: 'raya', label: '开斋节', zh: '开斋节快乐！', en: 'Selamat Hari Raya Aidilfitri! Maaf zahir dan batin.', ms: 'Selamat Hari Raya Aidilfitri, maaf zahir dan batin.' },
  { key: 'deepavali', label: '屠妖节', zh: '屠妖节快乐！', en: 'Happy Deepavali! May the festival of lights bring you joy.', ms: 'Selamat Hari Deepavali!' },
  { key: 'midautumn', label: '中秋节', zh: '中秋节快乐，花好月圆，阖家团圆！', en: 'Happy Mid-Autumn Festival! Wishing you and your family a joyful reunion.', ms: 'Selamat Menyambut Pesta Tanglung!' },
  { key: 'christmas', label: '圣诞节', zh: '圣诞快乐！', en: 'Merry Christmas!', ms: 'Selamat Hari Krismas!' },
  { key: 'newyear', label: '元旦新年', zh: '新年快乐！祝新的一年一切顺利！', en: 'Happy New Year! Wishing you a wonderful year ahead.', ms: 'Selamat Tahun Baru!' },
  { key: 'merdeka', label: '国庆日', zh: '国庆日快乐！', en: 'Happy Merdeka Day!', ms: 'Selamat Hari Merdeka!' },
];

/** 节日祝福语：认得的节日照上表，自己打的就「XX 快乐！」 */
export function festivalGreeting(occasion, lang = 'zh') {
  const o = String(occasion || '').trim();
  const f = FESTIVALS.find((x) => x.label === o || x.key === o);
  if (f) return f[lang] || f.zh;
  if (!o) return '';
  return { zh: `${o}快乐！`, en: `Happy ${o}!`, ms: `Selamat ${o}!` }[lang] || `${o}快乐！`;
}

/* ---------- 模板：{称呼} {我} {活动} {节日祝福} {邀请} {聊聊} ---------- */
export const PLACEHOLDERS = [
  ['{称呼}', '对方的名字（自动）'],
  ['{我}', '我的名字（「我」页的显示名称）'],
  ['{活动}', '活动名'],
  ['{节日祝福}', '节日的祝福语'],
  ['{邀请}', '邀请的内容（时间、地点、什么活动）'],
  ['{聊聊}', '提一句他在乎的事（兴趣 / 他在找的；没有就空着）'],
];

export const TEMPLATES = {
  event_follow: {
    zh: 'Hi {称呼}，我是 {我}。很高兴在{活动}认识你！{聊聊}有空的话一起喝杯咖啡，多认识一下 😊',
    en: 'Hi {称呼}, this is {我}. Great to meet you at {活动}! {聊聊}Would love to catch up over coffee sometime 😊',
    ms: 'Hi {称呼}, saya {我}. Gembira dapat berkenalan di {活动}! {聊聊}Jom minum kopi bila ada masa 😊',
  },
  festival: {
    zh: 'Hi {称呼}，{节日祝福}{聊聊}祝你和家人一切顺利！—— {我}',
    en: 'Hi {称呼}, {节日祝福} {聊聊}All the best to you and your family! — {我}',
    ms: 'Hi {称呼}, {节日祝福} {聊聊}Semoga semuanya baik untuk anda sekeluarga! — {我}',
  },
  invite: {
    zh: 'Hi {称呼}，我是 {我}。{聊聊}想邀请你：{邀请}方便来的话回我一声，我帮你留位 🙏',
    en: 'Hi {称呼}, this is {我}. {聊聊}I\'d like to invite you: {邀请} Let me know if you can make it and I\'ll save you a seat 🙏',
    ms: 'Hi {称呼}, saya {我}. {聊聊}Saya ingin menjemput anda: {邀请} Beritahu saya jika boleh datang, saya simpan tempat untuk anda 🙏',
  },
  today: {
    zh: 'Hi {称呼}，最近好吗？{聊聊}有空约出来喝杯咖啡？—— {我}',
    en: 'Hi {称呼}, how have you been? {聊聊}Coffee sometime? — {我}',
    ms: 'Hi {称呼}, apa khabar? {聊聊}Jom minum kopi bila ada masa? — {我}',
  },
  custom: {
    zh: 'Hi {称呼}，{聊聊}',
    en: 'Hi {称呼}, {聊聊}',
    ms: 'Hi {称呼}, {聊聊}',
  },
};

export function defaultTemplate(kind, lang = 'zh') {
  const t = TEMPLATES[kind] || TEMPLATES.custom;
  return t[lang] || t.zh;
}

/** auto → 名字有中文字就中文，不然英文 */
export function langFor(person, lang = 'auto') {
  if (lang && lang !== 'auto') return lang;
  return CJK.test(String((person && person.name) || '')) ? 'zh' : 'en';
}

/** 怎么称呼：中文讯息用中文名，英文 / 马来文讯息优先用英文名 */
export function callName(person, lang = 'zh') {
  const name = String((person && person.name) || '').trim();
  const alt = String((person && person.name_alt) || '').trim();
  if (lang === 'zh') return firstName(CJK.test(name) || !CJK.test(alt) || !alt ? name : alt);
  if (CJK.test(name) && alt && !CJK.test(alt)) return firstName(alt);
  return firstName(name);
}

/**
 * 可以在讯息里提的事（只用档案里有的：兴趣、他在找的）。
 * 回短标签，最多 max 个；英文 / 马来文讯息只用不含中文字的标签（不然一句英文里夹中文很怪）。
 */
export function talkingPoints(person, lang = 'zh', max = 4) {
  const out = [];
  const add = (x) => {
    const v = String(x || '').trim();
    if (!v || v.length > 16 || out.includes(v)) return;
    if (lang !== 'zh' && CJK.test(v)) return;
    out.push(v);
  };
  (person.interests || []).forEach(add);
  (person.resources || []).filter((r) => r.kind === 'needs' && r.source !== 'ai').forEach((r) => add(r.label));
  return out.slice(0, max);
}

/** 「提一句他在乎的事」那一句 */
export function personalLine(point, lang = 'zh') {
  if (!point) return '';
  return { zh: `最近${point}怎么样？`, en: `How's ${point} going lately? `, ms: `Macam mana dengan ${point} sekarang? ` }[lang] || `最近${point}怎么样？`;
}

/** 把模板填好；空的占位拿掉、多的空白收掉 */
export function fillTemplate(template, vars = {}) {
  let s = String(template || '');
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v == null ? '' : v));
  return s
    .replace(/\{[^{}\s]{1,6}\}/g, '')        // 没给值的占位
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([，。！？,.!?])/g, '$1')
    .replace(/ *\n */g, '\n')
    .trim();
}

/** 活动的「邀请」文字：活动名 + 日期 + 地点 */
export function inviteText(event, lang = 'zh') {
  if (!event) return '';
  const date = event.held_on ? String(event.held_on).slice(0, 10) : '';
  if (lang === 'zh') return `${[date, event.name].filter(Boolean).join(' ')}${event.location ? `（地点：${event.location}）` : ''}。`;
  return `${event.name}${date ? ` on ${date}` : ''}${event.location ? ` at ${event.location}` : ''}.`;
}

/**
 * 程序帮一个人写好的讯息（不花钱）。
 * campaign: { kind, template, lang, occasion, invite }；topic = 第几个话题（「换个话题」用）
 * 回 { text, lang, personal, topic, points }
 */
export function draftFor({ campaign, person, me = {}, event = null, topic = 0 }) {
  const lang = langFor(person, campaign.lang);
  const points = talkingPoints(person, lang);
  const point = topic < 0 || !points.length ? '' : points[topic % points.length];
  const template = campaign.template && campaign.template.trim() ? campaign.template : defaultTemplate(campaign.kind, lang);
  const text = fillTemplate(template, {
    称呼: callName(person, lang),
    我: me.display_name || '',
    活动: event ? event.name : String(campaign.occasion || ''),
    节日祝福: festivalGreeting(campaign.occasion, lang),
    邀请: String(campaign.invite || '').trim() || inviteText(event, lang),
    聊聊: personalLine(point, lang),
  });
  return { text, lang, personal: !!point && template.includes('{聊聊}'), topic: point, points };
}

export function sendLink(person, text) { return waLink(person && person.whatsapp, text); }

/* ---------- 回应 ---------- */
export const RESPONSES = {
  warm: { label: '回得很热', score: 2, tone: 'warm', emoji: '🔥' },
  ok: { label: '普通回', score: 1, tone: 'positive', emoji: '🙂' },
  none: { label: '没回', score: -1, tone: 'cool', emoji: '…' },
  cold: { label: '不太高兴', score: -2, tone: 'negative', emoji: '😕' },
};
export const RESPONSE_KEYS = Object.keys(RESPONSES);
export const replied = (r) => r === 'warm' || r === 'ok';

/** 回应 → 那笔讯息互动的「气氛」（第 3 阶段好感度公式会用）；清掉回应 → 拿掉气氛 */
export function moodFor(response, note = '') {
  const r = RESPONSES[response];
  return r ? { tone: r.tone, score: r.score, note: note || `群发回应：${r.label}` } : null;
}

export const RSVP = {
  yes: { label: '会来', attendance: 'going' },
  maybe: { label: '还不确定', attendance: 'invited' },
  no: { label: '不来', attendance: 'absent' },
};

/** 邀请群发的出席状态：已经「会来 / 出席了」的不要被「邀请了」盖掉 */
export function nextAttendance(current, wanted) {
  const rank = { invited: 1, absent: 2, going: 3, attended: 4 };
  if (!current) return wanted;
  if (wanted === 'invited') return rank[current] >= rank.invited ? current : wanted;
  if (current === 'attended' && wanted !== 'attended') return current; // 出席了就是出席了
  return wanted;
}

export const ATTENDANCE = {
  invited: { label: '邀请了', tone: 'bg-ink/5 text-muted' },
  going: { label: '会来', tone: 'bg-sky-50 text-sky-800' },
  attended: { label: '出席了', tone: 'bg-plum/10 text-plum-deep' },
  absent: { label: '没来', tone: 'bg-amber-50 text-amber-800' },
};
export const ATTENDANCE_KEYS = Object.keys(ATTENDANCE);

/* ---------- 一个人的群发历史 ---------- */
/** 这个人发过的群发（最新在前） */
export function sentTo(outreach = [], personId) {
  return outreach
    .filter((o) => o.person_id === personId && o.status === 'sent' && o.sent_at)
    .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)));
}

/** 最近连续几次「没回」（还没标回应的不算，也不打断） */
export function ignoredStreak(outreach = [], personId) {
  let n = 0;
  for (const o of sentTo(outreach, personId)) {
    if (!o.response) continue;
    if (o.response === 'none') n += 1; else break;
  }
  return n;
}

/**
 * 选人时的提醒：没 WhatsApp、连续没回、刚发过、要避开的话题。
 * skip = 默认先不勾（自己可以再勾回来）
 */
export function warningsFor(person, outreach = [], { now = Date.now(), campaignId = null } = {}) {
  const out = [];
  if (!sendLink(person, '')) out.push({ kind: 'no_wa', text: '没有 WhatsApp 号码', skip: true, block: true });
  const streak = ignoredStreak(outreach, person.id);
  if (streak >= 2) out.push({ kind: 'ignored', text: `连续 ${streak} 次群发没回：别再群发，找机会私下约`, skip: true });
  const last = sentTo(outreach, person.id).find((o) => o.campaign_id !== campaignId);
  if (last) {
    const days = Math.floor((now - ms(last.sent_at)) / DAY);
    if (days <= 3) out.push({ kind: 'recent', text: days === 0 ? '今天刚发过群发' : `${days} 天前刚发过群发`, skip: true });
  }
  if ((person.avoid_topics || []).length) out.push({ kind: 'avoid', text: `别聊：${person.avoid_topics.slice(0, 3).join('、')}`, skip: false });
  return out;
}

/* ---------- 选人 ---------- */
/**
 * filters: { tiers[], tags[], circles[], event: { id, statuses[] }, minAffinity, q }
 * people 要是 store.view() 过的（有 rel、circles）
 */
export function filterAudience(people, filters = {}, { attendance = [] } = {}) {
  const tiers = filters.tiers || [];
  const tags = (filters.tags || []).map((t) => t.toLowerCase());
  const circles = filters.circles || [];
  const q = String(filters.q || '').trim().toLowerCase();
  let attendees = null;
  if (filters.event && filters.event.id) {
    const st = filters.event.statuses && filters.event.statuses.length ? filters.event.statuses : ATTENDANCE_KEYS;
    attendees = new Set(attendance.filter((a) => a.event_id === filters.event.id && st.includes(a.status)).map((a) => a.person_id));
  }
  return people.filter((p) => {
    if (p.pending_review) return false; // 新朋友还没确认（可能是乱填的）
    if (tiers.length && !tiers.includes(p.tier)) return false;
    if (tags.length && !(p.tags || []).some((t) => tags.includes(String(t).toLowerCase()))) return false;
    if (circles.length && !(p.circles || []).some((c) => circles.includes(c.id))) return false;
    if (attendees && !attendees.has(p.id)) return false;
    if (filters.minAffinity && ((p.rel && p.rel.affinity) ?? p.affinity ?? 0) < filters.minAffinity) return false;
    if (q) {
      const hay = [p.name, p.name_alt, p.title, p.company && p.company.name, ...(p.tags || [])].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** 所有人用过的标签（多的在前） */
export function allTags(people) {
  const m = new Map();
  for (const p of people) for (const t of p.tags || []) m.set(t, (m.get(t) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ tag: t, count: n }));
}

/* ---------- 统计 + 从回应学到的 ---------- */
export function campaignStats(rows = []) {
  const sent = rows.filter((o) => o.status === 'sent');
  const answered = sent.filter((o) => o.response);
  const yes = answered.filter((o) => replied(o.response)).length;
  const by = Object.fromEntries(RESPONSE_KEYS.map((k) => [k, sent.filter((o) => o.response === k).length]));
  return {
    total: rows.length,
    sent: sent.length,
    skipped: rows.filter((o) => o.status === 'skipped').length,
    left: rows.filter((o) => o.status === 'draft').length,
    answered: answered.length,
    replied: yes,
    rate: answered.length ? yes / answered.length : null,
    by,
  };
}

const rateOf = (rows) => {
  const a = rows.filter((o) => o.status === 'sent' && o.response);
  return { n: a.length, rate: a.length ? a.filter((o) => replied(o.response)).length / a.length : null };
};
const pct = (x) => `${Math.round(x * 100)}%`;

/**
 * 从过去的回应算出来的心得（不用 AI）：
 *  • 有没有提到对方的事、有没有 AI 润色、哪种群发比较多人回
 * 两边都至少 minN 笔有标回应才说；回 [{key, text}]，也会送给 AI 当参考
 */
export function learnings(outreach = [], campaigns = [], { minN = 5 } = {}) {
  const out = [];
  const cmp = (key, a, b, la, lb) => {
    const x = rateOf(a); const y = rateOf(b);
    if (x.n < minN || y.n < minN) return;
    const diff = x.rate - y.rate;
    if (Math.abs(diff) < 0.1) out.push({ key, text: `${la}（${pct(x.rate)}，${x.n} 则）跟${lb}（${pct(y.rate)}，${y.n} 则）回复率差不多` });
    else if (diff > 0) out.push({ key, text: `${la}回复率比较高：${pct(x.rate)}（${x.n} 则）vs ${lb} ${pct(y.rate)}（${y.n} 则）` });
    else out.push({ key, text: `${lb}回复率比较高：${pct(y.rate)}（${y.n} 则）vs ${la} ${pct(x.rate)}（${x.n} 则）` });
  };
  cmp('personal', outreach.filter((o) => o.personal), outreach.filter((o) => !o.personal), '有提到对方的事', '一般问候');
  cmp('polished', outreach.filter((o) => o.polished), outreach.filter((o) => !o.polished), 'AI 润色过的', '模板直接发的');
  const kindOf = new Map(campaigns.map((c) => [c.id, c.kind]));
  const kinds = KIND_KEYS.map((k) => ({ k, ...rateOf(outreach.filter((o) => kindOf.get(o.campaign_id) === k)) })).filter((x) => x.n >= minN);
  if (kinds.length >= 2) {
    kinds.sort((a, b) => b.rate - a.rate);
    out.push({ key: 'kind', text: `最多人回的是「${KINDS[kinds[0].k].label}」（${pct(kinds[0].rate)}），最少的是「${KINDS[kinds[kinds.length - 1].k].label}」（${pct(kinds[kinds.length - 1].rate)}）` });
  }
  return out;
}

/** 给 AI 看的：这个人最近 3 次群发 + 回应（他喜欢什么样的讯息） */
export function historyFor(outreach = [], campaigns = [], personId, max = 3) {
  const kindOf = new Map(campaigns.map((c) => [c.id, c.kind]));
  return sentTo(outreach, personId).slice(0, max).map((o) => ({
    kind: KINDS[kindOf.get(o.campaign_id)] ? KINDS[kindOf.get(o.campaign_id)].label : '',
    text: String(o.text || '').slice(0, 160),
    response: o.response ? RESPONSES[o.response].label : '还没标',
    note: String(o.response_note || '').slice(0, 100),
  }));
}

/** 送给 /api/draft-messages 的一个人（只送写讯息用得到的） */
export function polishPayload({ row, person, outreach = [], campaigns = [] }) {
  const recent = (person.interactions || [])
    .filter((i) => i.summary || i.title)
    .slice(0, 3)
    .map((i) => `${String(i.occurred_at).slice(0, 10)} ${i.title || ''}${i.summary ? `：${String(i.summary).slice(0, 160)}` : ''}`.trim());
  return {
    id: row.id,
    call: callName(person, row.lang || langFor(person)),
    lang: row.lang || langFor(person),
    draft: row.text,
    title: [person.title, person.company && person.company.name].filter(Boolean).join(' · '),
    how_met: person.how_met || '',
    interests: (person.interests || []).slice(0, 8),
    needs: (person.resources || []).filter((r) => r.kind === 'needs' && r.source !== 'ai').map((r) => r.label).slice(0, 5),
    recent,
    avoid: (person.avoid_topics || []).slice(0, 8),
    history: historyFor(outreach, campaigns, person.id),
  };
}

/** AI 润色大概多少钱（RM）：Haiku，每人约 450 token 进、150 token 出，加上每批说明 1200 token */
export const POLISH_BATCH = 20;
export function estimatePolishMyr(n, rate = 4.4) {
  if (!n) return 0;
  const batches = Math.ceil(n / POLISH_BATCH);
  const inTok = n * 450 + batches * 1200;
  const outTok = n * 150;
  return ((inTok * 0.10 + outTok * 0.50) / 1e6) * rate;
}

/** 一个活动的出席名单（含状态），最新改的在前 */
export function eventRoster(event, attendance = [], people = []) {
  const byId = new Map(people.map((p) => [p.id, p]));
  return attendance
    .filter((a) => a.event_id === event.id)
    .map((a) => ({ ...a, person: byId.get(a.person_id) }))
    .filter((a) => a.person)
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}
