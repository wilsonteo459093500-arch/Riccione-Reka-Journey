/* ============================================================
   人脉 App · 纯函数（没有 React、没有网络 —— 都有单元测试）
   ============================================================ */

/* ---------- 康妮圈层 ---------- */
export const TIERS = [
  { key: 'core', label: '核心', cap: 5, hint: '最重要的 5 个人', color: '#C2410C' },
  { key: 'important', label: '重要', cap: 15, hint: '重要的 15 个人', color: '#B45309' },
  { key: 'active', label: '活跃', cap: 50, hint: '保持联系的 50 个人', color: '#0F766E' },
  { key: 'known', label: '认识', cap: 150, hint: '认识的 150 个人', color: '#64748B' },
];
export const TIER_BY_KEY = Object.fromEntries(TIERS.map((t) => [t.key, t]));
export function tierOf(key) { return TIER_BY_KEY[key] || TIER_BY_KEY.known; }

/** 每个圈层现在几个人、有没有超过上限 */
export function tierCounts(people) {
  const counts = Object.fromEntries(TIERS.map((t) => [t.key, 0]));
  for (const p of people) counts[tierOf(p.tier).key] += 1;
  return TIERS.map((t) => ({ ...t, count: counts[t.key], over: counts[t.key] > t.cap }));
}

/* ---------- 「值得认识吗」4 个维度 ---------- */
export const DIMS = [
  { key: 'business', label: '能带来家具生意', short: '生意' },
  { key: 'connector', label: '是超级连接者', short: '连接' },
  { key: 'has_what_i_lack', label: '有我缺的资源', short: '资源' },
  { key: 'i_can_help', label: '我能帮到他', short: '互惠' },
];

/** 4 个维度各 0–10 → 总分 0–100（平均 × 10） */
export function worthScore(assessment) {
  if (!assessment || !assessment.dims) return null;
  let sum = 0;
  for (const d of DIMS) {
    const s = Number(assessment.dims[d.key] && assessment.dims[d.key].score);
    sum += Number.isFinite(s) ? Math.max(0, Math.min(10, s)) : 0;
  }
  return Math.round((sum / DIMS.length) * 10);
}

export function worthVerdict(score) {
  if (score == null) return { label: '还没分析', tone: 'none' };
  if (score >= 70) return { label: '很值得深交', tone: 'high' };
  if (score >= 50) return { label: '值得认识', tone: 'good' };
  if (score >= 30) return { label: '保持联系', tone: 'mid' };
  return { label: '先观望', tone: 'low' };
}

/* ---------- 电话 / WhatsApp ---------- */
export function digits(s) { return String(s || '').replace(/\D/g, ''); }

/**
 * 转成 wa.me 用的号码（只有数字、含国家码）。
 * 马来西亚本地写法 012-345 6789 → 60123456789；+65 / 65 开头的照留。
 */
export function toWhatsApp(number, defaultCc = '60') {
  const raw = String(number || '').trim();
  let d = digits(raw);
  if (!d) return '';
  if (raw.startsWith('+')) return d;
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return defaultCc + d.slice(1);
  if (defaultCc === '60' && /^1\d{8,9}$/.test(d)) return '60' + d; // 少打了 0
  return d;
}

export function waLink(number, text = '') {
  const n = toWhatsApp(number);
  if (!n) return '';
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** 从名片的电话里挑一个当 WhatsApp：有标 whatsapp 的优先，再来 mobile，再来第一个 */
export function pickWhatsApp(phones = []) {
  const by = (l) => phones.find((p) => String(p.label || '').toLowerCase() === l);
  const p = by('whatsapp') || by('mobile') || phones.find((x) => /^(\+?60)?0?1\d/.test(digits(x.number)) || /^\+?601/.test(x.number)) || phones[0];
  return p ? toWhatsApp(p.number) : '';
}

/* ---------- 名字 / 公司比对 ---------- */
export function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\b(dato'?|datuk|dr|mr|mrs|ms|madam|tan sri|puan|encik|ir|ar|sr)\.?\s+/g, '')
    .replace(/[\s.,'’"()\-_/]+/g, '');
}

const COMPANY_SUFFIX = /\b(sdn\.?\s*bhd\.?|berhad|bhd\.?|plt|enterprise|ent\.?|trading|holdings?|group|co\.?|company|ltd\.?|limited|inc\.?|llc|pte\.?|\(m\)|m\b)\b/g;
export function normCompany(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(COMPANY_SUFFIX, ' ')
    .replace(/有限公司|私人有限公司|公司|集团/g, '')
    .replace(/[\s.,'’"()\-_/&]+/g, '');
}

export function findCompany(companies, name) {
  const n = normCompany(name);
  if (!n) return null;
  return companies.find((c) => normCompany(c.name) === n || (c.name_alt && normCompany(c.name_alt) === n)) || null;
}

const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|icloud|me|qq|163|126|foxmail|proton|protonmail|msn|aol|streamyx|tm)\./;
/** 公司邮箱的网域（gmail 之类的不算） */
export function emailDomain(emails = []) {
  for (const e of emails) {
    const dom = String(e || '').toLowerCase().split('@')[1];
    if (dom && !FREE_MAIL.test(dom)) return dom;
  }
  return '';
}

/**
 * 这个电话是不是「公司总机」那种大家共用的（不能拿来认人）？
 * 马来西亚：手机是 01x；03 / 04 … 09 是座机；1300 / 1800 / 1700 是热线。
 * 别的国家看不出来，就看名片上的 label（office / fax）。
 */
export function isSharedPhone(number, label = '') {
  const l = String(label || '').toLowerCase();
  if (/^(office|fax|tel|work|landline|hotline)$/.test(l)) return true;
  const raw = String(number || '').trim();
  const d = digits(raw);
  if (!d) return false;
  if (/^1[378]00/.test(d)) return true;                       // 1300-88-1234（还没加国家码）
  const n = toWhatsApp(raw);
  if (n.startsWith('60')) return !/^601\d{8,9}$/.test(n) || /^601[378]00/.test(n);
  return false;
}

/** info@ / sales@ 这种公司公用邮箱（很多人共用，不能拿来认人） */
const SHARED_MAILBOX = /^(info|sales|admin|enquiry|enquiries|inquiry|inquiries|hello|hi|contact|contactus|office|hr|account|accounts|finance|support|marketing|cs|customerservice|customer\.service|service|services|general|mail|team|reception|order|orders|booking|bookings|noreply|no-reply)$/;
export function isSharedEmail(email) {
  const local = String(email || '').toLowerCase().split('@')[0];
  return !!local && SHARED_MAILBOX.test(local);
}

/**
 * 扫到的名片是不是已经存过的人？
 * 手机末 9 码一样 / 个人邮箱一样 → 很可能（strong）；
 * 名字一样、公司总机一样、info@ 这种公用邮箱一样 → 只是「可能」（同一家公司的两个人常常共用这些）。
 */
export function findDuplicates(card, people, companies = []) {
  const keyOf = (n) => digits(n).slice(-9);
  const cardPhones = (card.phones || []).map((p) => ({ k: keyOf(p.number), shared: isSharedPhone(p.number, p.label) })).filter((x) => x.k.length >= 8);
  const personal = new Set(cardPhones.filter((x) => !x.shared).map((x) => x.k));
  const shared = new Set(cardPhones.filter((x) => x.shared).map((x) => x.k));
  const emails = (card.emails || []).map((e) => String(e).toLowerCase()).filter(Boolean);
  const personalMail = new Set(emails.filter((e) => !isSharedEmail(e)));
  const sharedMail = new Set(emails.filter(isSharedEmail));
  const nn = normName(card.name);
  const nnAlt = normName(card.name_alt);
  const nc = normCompany(card.company);
  const out = [];
  for (const p of people) {
    const reasons = [];
    const pPhones = [...(p.phones || []).map((x) => ({ number: x.number, label: x.label })), { number: p.whatsapp, label: 'whatsapp' }]
      .map((x) => ({ k: keyOf(x.number), shared: isSharedPhone(x.number, x.label) }))
      .filter((x) => x.k.length >= 8);
    // 两边都不是总机才算「电话一样」；有一边是总机 → 只是同一家公司
    if (pPhones.some((x) => !x.shared && personal.has(x.k))) reasons.push('电话一样');
    else if (pPhones.some((x) => personal.has(x.k) || shared.has(x.k))) reasons.push('公司电话一样');
    const pMails = (p.emails || []).map((e) => String(e).toLowerCase());
    if (pMails.some((e) => personalMail.has(e))) reasons.push('邮箱一样');
    else if (pMails.some((e) => sharedMail.has(e))) reasons.push('公司公用邮箱一样');
    const pn = [normName(p.name), normName(p.name_alt)].filter(Boolean);
    if (nn && (pn.includes(nn) || (nnAlt && pn.includes(nnAlt)))) {
      const comp = companies.find((c) => c.id === p.company_id);
      reasons.push(nc && comp && normCompany(comp.name) === nc ? '名字和公司都一样' : '名字一样');
    }
    if (reasons.length) out.push({ person: p, reasons, strong: reasons.some((r) => STRONG_REASONS.has(r)) });
  }
  return out.sort((a, b) => Number(b.strong) - Number(a.strong));
}
const STRONG_REASONS = new Set(['电话一样', '邮箱一样', '名字和公司都一样']);

/**
 * 「新朋友」合并进已经存过的人：只补空的栏位、加新电话 / 邮箱 / 标签、留言接在备注后面；
 * 不改名字、不改圈层（旧的那个是你自己整理过的）。回传要写进 into 的栏位（没东西补就是 {}）。
 */
export function mergePersonPatch(into, from) {
  const patch = {};
  const placeholder = (s) => !s || /名片待确认/.test(s);
  if (placeholder(into.name) && !placeholder(from.name)) patch.name = from.name;
  for (const k of ['name_alt', 'title', 'company_id', 'whatsapp', 'website', 'address', 'card_notes', 'card_photo_id', 'avatar_photo_id', 'how_met', 'met_on']) {
    if (!into[k] && from[k]) patch[k] = from[k];
  }
  const keyOf = (n) => digits(n).slice(-9);
  const have = new Set([...(into.phones || []).map((p) => p.number), into.whatsapp].map(keyOf).filter(Boolean));
  const newPhones = (from.phones || []).filter((p) => p && p.number && !have.has(keyOf(p.number)) && have.add(keyOf(p.number)));
  if (newPhones.length) patch.phones = [...(into.phones || []), ...newPhones];
  const mails = (into.emails || []).map((e) => String(e).toLowerCase());
  const newMails = [...new Set((from.emails || []).map((e) => String(e).toLowerCase()))].filter((e) => e && !mails.includes(e));
  if (newMails.length) patch.emails = [...(into.emails || []), ...newMails];
  const newTags = (from.tags || []).filter((t) => !(into.tags || []).includes(t));
  if (newTags.length) patch.tags = [...(into.tags || []), ...newTags];
  const note = String(from.notes || '').replace(/\n?名片还没读：在「新朋友」按「AI 读名片」/, '').trim();
  if (note && !String(into.notes || '').includes(note)) patch.notes = [into.notes, note].filter(Boolean).join('\n');
  return patch;
}

/* ---------- 显示用 ---------- */
export function initials(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  if (/[一-鿿]/.test(s)) {
    const han = s.replace(/[^一-鿿]/g, '');
    return han.length >= 3 ? han.slice(1, 3) : han.slice(-2);
  }
  const parts = s.replace(/\b(dato'?|datuk|dr|mr|mrs|ms)\.?\s+/gi, '').split(/\s+/).filter(Boolean);
  return ((parts[0] || '')[0] + ((parts[1] || '')[0] || '')).toUpperCase();
}

export function splitTags(s) {
  return [...new Set(String(s || '').split(/[,，、;；\n]+/).map((x) => x.trim()).filter(Boolean))];
}

/** 搜索：名字、公司、职位、标签、兴趣、资源、圈子都算 */
export function matchPerson(view, q) {
  const query = String(q || '').trim().toLowerCase();
  if (!query) return true;
  const hay = [
    view.name, view.name_alt, view.title, view.company && view.company.name, view.how_met, view.notes,
    ...(view.tags || []), ...(view.interests || []),
    ...(view.resources || []).map((r) => r.label),
    ...(view.circles || []).map((c) => c.name),
  ].filter(Boolean).join(' ').toLowerCase();
  return query.split(/\s+/).every((w) => hay.includes(w));
}

export const SORTS = {
  recent: { label: '最近加的', fn: (a, b) => String(b.created_at).localeCompare(String(a.created_at)) },
  worth: { label: '值得认识分', fn: (a, b) => (b.worth_score ?? -1) - (a.worth_score ?? -1) || String(b.created_at).localeCompare(String(a.created_at)) },
  due: { label: '该联系了', fn: (a, b) => ((b.rel && b.rel.ratio) || 0) - ((a.rel && a.rel.ratio) || 0) },
  affinity: { label: '好感度', fn: (a, b) => ((b.rel && b.rel.affinity) ?? 0) - ((a.rel && a.rel.affinity) ?? 0) },
  name: { label: '名字', fn: (a, b) => String(a.name).localeCompare(String(b.name), 'zh') },
};

/* ---------- AI 用量 ---------- */
export function monthKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthUsage(rows, now = new Date(), rate = 4.4) {
  const key = monthKey(now);
  const mine = rows.filter((r) => monthKey(r.at || r.created_at) === key);
  const usd = mine.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
  const byFeature = {};
  for (const r of mine) {
    const f = byFeature[r.feature] || (byFeature[r.feature] = { count: 0, usd: 0 });
    f.count += 1;
    f.usd += Number(r.cost_usd || 0);
  }
  return { count: mine.length, usd, myr: usd * rate, byFeature };
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysAgo(iso, now = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / 86400000);
}

export function relDay(iso, now = Date.now()) {
  const n = daysAgo(iso, now);
  if (n == null) return '';
  if (n <= 0) return '今天';
  if (n === 1) return '昨天';
  if (n < 30) return `${n} 天前`;
  if (n < 365) return `${Math.floor(n / 30)} 个月前`;
  return `${Math.floor(n / 365)} 年前`;
}

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ---------- 我的资料（默认值，可以在「我」页改）---------- */
export const DEFAULT_PROFILE = {
  display_name: 'Wilson',
  business: 'RICCIONE REKA / 溪岸 SAIL —— 马来西亚的全屋定制品牌（橱柜、衣柜、全屋定制家具），有展厅、设计团队和安装团队。',
  offer: '全屋定制 / 室内设计的专业意见；展厅可以借来办小型活动；设计师、装修师傅、供应商人脉；做内容（短视频、提案）的经验；AI 工具的用法。',
  lacking: '高端住宅的发展商 / 建筑师 / 室内设计师人脉；商会里的领袖；能介绍高端客户的人；好的营销、品牌合作伙伴。',
  goals: '多认识能长期互相介绍生意的人；建立商会里的影响力。',
};

/**
 * 公司背景要不要（重新）查（体检第 3 阶段）：
 *   • 没查过 → 查
 *   • 以前存的「查不到」没有 status：那时 AI 格式坏掉也会存成查不到 → 重查一次
 *   • 有 status（found / not_found）→ 不重查（要重查请按「重新查公司」）
 */
export function needsCompanyLookup(background) {
  if (!background) return true;
  return !background.status && background.found === false;
}
