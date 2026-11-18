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
 * 扫到的名片是不是已经存过的人？
 * 电话末 9 码一样 / email 一样 → 很可能；名字一样 → 可能（公司也一样就更像）。
 */
export function findDuplicates(card, people, companies = []) {
  const phoneKeys = new Set((card.phones || []).map((p) => digits(p.number).slice(-9)).filter((x) => x.length >= 8));
  const emails = new Set((card.emails || []).map((e) => String(e).toLowerCase()));
  const nn = normName(card.name);
  const nnAlt = normName(card.name_alt);
  const nc = normCompany(card.company);
  const out = [];
  for (const p of people) {
    const reasons = [];
    const pPhones = [...(p.phones || []).map((x) => x.number), p.whatsapp].map((x) => digits(x).slice(-9)).filter((x) => x.length >= 8);
    if (pPhones.some((x) => phoneKeys.has(x))) reasons.push('电话一样');
    if ((p.emails || []).some((e) => emails.has(String(e).toLowerCase()))) reasons.push('邮箱一样');
    const pn = [normName(p.name), normName(p.name_alt)].filter(Boolean);
    if (nn && (pn.includes(nn) || (nnAlt && pn.includes(nnAlt)))) {
      const comp = companies.find((c) => c.id === p.company_id);
      reasons.push(nc && comp && normCompany(comp.name) === nc ? '名字和公司都一样' : '名字一样');
    }
    if (reasons.length) out.push({ person: p, reasons, strong: reasons.some((r) => r !== '名字一样') });
  }
  return out.sort((a, b) => Number(b.strong) - Number(a.strong));
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
