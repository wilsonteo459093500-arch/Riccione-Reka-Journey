/* ============================================================
   第 4 阶段 · 个人名片 + 扫码留资料（纯函数，前端、服务器、公开名片页共用，有单元测试）
   ------------------------------------------------------------
   • cleanCard()   名片内容只留认得的栏位（存进 profile.card、/api/card 回给公开页）
   • toVCard()     「存我的联络方式」的 .vcf
   • cleanLead()   别人在公开页留的资料：检查、截长度、整理电话
   • leadToPerson / mergeLeadInto  新建一个人 / 已经存过的人只补空的栏位
   • greeting()    送出后「WhatsApp 我」的预设讯息
   ============================================================ */
import { toWhatsApp, digits, findDuplicates } from './logic.js';

export const CARD_BUCKET = 'network-card';   // 公开 bucket：名片照片 / 视频 / 案例图（谁都看得到，只有本人能上传）
export const CONSENT_VERSION = 'pdpa-2026-11';
export const MAX_OFFERS = 8;
export const MAX_CASES = 6;
export const MAX_SOCIALS = 6;
export const MAX_OPENING = 6;     // 开场白最多几句
export const MAX_MILESTONES = 10; // 发展历程的大事记
export const MAX_STATS = 6;       // 公司的数字格子
export const MAX_AWARDS = 8;
export const MAX_PLACES = 4;      // 展厅 / 仓库
export const MAX_EXHIBITIONS = 8;
export const MAX_GROUPS = 4;      // 商会 / 组织
export const MAX_CARD_IMAGES = 2; // 实体名片的照片

const str = (v, max = 200) => (typeof v === 'string' ? v : v == null ? '' : String(v))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim()
  .slice(0, max);

/** 只收 https 网址（公开页会拿去当 href / src） */
export function safeUrl(v, max = 500) {
  let s = str(v, max);
  if (!s) return '';
  if (/^www\./i.test(s) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' ? u.toString() : '';
  } catch { return ''; }
}

/** 存储路径：<user id>/card/<档名>，或网站自带的 /card/<档名>（预设名片用的图）；不准 .. 或奇怪字元 */
export function safePath(v) {
  const s = str(v, 300);
  return /^(?:[\w-]+\/|\/)card\/[\w.-]+\.(jpe?g|png|webp|mp4|webm|mov)$/i.test(s) && !s.includes('..') ? s : '';
}

/** 一行一句（阵列或多行字都收）→ 去空白、截长度、限几句 */
export function cleanLines(v, max = MAX_OPENING, len = 60) {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\r?\n/) : [];
  return arr.map((x) => str(x, len)).filter(Boolean).slice(0, max);
}

export const SOCIAL_PLATFORMS = ['linkedin', 'instagram', 'facebook', 'xiaohongshu', 'tiktok', 'youtube', 'website'];

export const DEFAULT_CARD = {
  name: 'Wilson Teo',
  name_alt: '张炜盛',
  title: '董事 Director · 家族企业第二代',
  company: 'RICCIONE 瑞吉欧 · 溪岸 SAIL BY RICCIONE REKA',
  tagline: '以木为语，与自然共生。',
  intro: '我是 Wilson，麻坡长大的家族企业第二代。小时候发誓不接班，后来为了家人考了 CIMA 特许管理会计师，再从仓库扛货做起。现在带着瑞吉欧和溪岸，在马来西亚做实木家具与全屋定制。我没有成功，我只是还在路上。',
  about_photo_path: '/card/father.jpg',
  firm: {
    title: 'RICCIONE 瑞吉欧',
    lead: '专注自然主义与实木的家具品牌。2025 年起成立 Riccione Reka 全屋定制，成为溪岸 SAIL BY RICCIONE REKA 的东南亚总代理。',
    photo_path: '/card/showroom-kl.jpg',
    stats: [
      { value: '2002', label: '中国公司成立（广东瑞吉欧家具有限公司）' },
      { value: '20+ 年', label: '在中国经营' },
      { value: '11,000 sq ft', label: '吉隆坡四层楼展厅' },
      { value: '21,000 sq ft', label: '佛山旗舰展厅' },
      { value: '600+', label: '个货柜出口中国（2018 年）' },
      { value: '18 家', label: '中国品牌门店（2024 年）' },
    ],
  },
  awards: {
    photo_path: '/card/awards.jpg',
    items: [
      { year: '2021', title: '美国 MUSE 缪斯设计奖 · 金奖', note: '溪岸 4.0 系列 · 从 100 多个国家和地区的 3.8 万件作品中选出' },
      { year: '2017', title: 'ARCHIDEX 最佳展位设计奖', note: '瑞吉欧 · 吉隆坡 KLCC' },
      { year: '2019', title: '佛山最佳家具设计奖', note: '瑞吉欧' },
      { year: '2022', title: 'HCA 高定家居设计奖 · 年度产品设计奖', note: '溪岸 · 自然线系列' },
      { year: '2023', title: 'HCA 高定家居设计奖 · 年度产品设计至尊奖（终评前三）', note: '溪岸 · 骨骼线 · 闲庭' },
      { year: '2024', title: 'HCA 高定家居设计奖 · 年度产品设计奖', note: '溪岸 · 骨骼线 · 山居' },
    ],
  },
  places: [
    { title: '吉隆坡展厅', note: '11,000 sq ft · 四层楼展厅与办公室' },
    { title: '佛山旗舰展厅', note: '21,000 sq ft · 办公室与展厅' },
    { title: 'Setia Alam 仓储中心', note: '马来西亚仓储与配送' },
  ],
  places_photo_path: '/card/showroom-inside.jpg',
  exhibitions: ['CIFF 广州家博会', 'CIFF 上海 · 设计馆', 'ARCHIDEX · KLCC'],
  whatsapp: '60163881919',
  phone: '',
  email: 'wilsonteo@riccione.asia',
  website: 'https://www.riccione.asia/',
  address: '23-2, Jalan Setia Prima (S) U13/S, Seksyen U13, Setia Alam, 40170 Shah Alam, Selangor',
  photo_path: '/card/avatar.jpg',
  video_path: '',
  video_url: '',
  poster_path: '',
  opening: [],
  opening_en: [],
  opening_on: true,
  story: {
    title: '从 1979 到今天',
    note: '',
    photo_path: '',
    milestones: [
      { year: '1979', text: '父辈开始做木作' },
      { year: '2002', text: '中国公司成立：广东瑞吉欧家具有限公司' },
      { year: '2015', text: 'RICCIONE 瑞吉欧在马来西亚成立，以实木家具起步' },
      { year: '2017', text: '佛山 21,000 sq ft 旗舰展厅；获 ARCHIDEX 最佳展位设计奖' },
      { year: '2018', text: '出口中国超过 600 个货柜，经销商近 1,000 家' },
      { year: '2019', text: '首次参展 CIFF 广州，产品销往日本与欧洲' },
      { year: '2020', text: '吉隆坡 11,000 sq ft 展厅落成；受邀参展 CIFF 上海设计馆' },
      { year: '2024', text: '中国 18 家品牌门店；马来西亚线上线下一体化零售' },
      { year: '2025', text: 'Riccione Reka 全屋定制成立，成为溪岸 SAIL BY RICCIONE REKA 东南亚总代理' },
    ],
  },

  offers: [
    '全屋定制：门、墙、柜一体化，从设计、生产到安装',
    '100% 实木家具，模块化，按你的家调整',
    '溪岸 SAIL BY RICCIONE REKA 自然主义定制：建筑师、设计师的项目',
    '吉隆坡四层展厅：来喝杯咖啡，也可以借来办小型活动',
    '二代接班、家族生意：二代聊二代',
    '中马两地的设计、工程与供应链人脉',
  ],
  cases: [
    { title: '溪岸 · 骨骼线', note: '古典与现代的对话 · HCA 获奖系列', image_path: '/card/skeleton.jpg' },
    { title: '溪岸 · 空山', note: '留白与壁龛，让空间呼吸', image_path: '/card/kongshan.jpg' },
    { title: '溪岸 · 织', note: '织物的质感，生活的温度', image_path: '/card/zhi.jpg' },
    { title: '溪岸 · 雾山', note: '轻盈纯净，如雾中春居', image_path: '/card/wushan.jpg' },
    { title: '溪岸 · 寂东方', note: '实木的纯粹，东方的沉静', image_path: '/card/jidongfang.jpg' },
    { title: '瑞吉欧 · 实木', note: '更慢、更柔和，也更自然的生活', image_path: '/card/riccione.jpg' },
  ],
  socials: [
    { platform: 'instagram', url: 'https://www.instagram.com/wilsonteo0419/', label: 'Wilson 个人', icon_path: '/card/avatar.jpg' },
    { platform: 'instagram', url: 'https://www.instagram.com/riccione_furniture/', label: '瑞吉欧 RICCIONE', icon_path: '/card/logo-riccione.png' },
    { platform: 'instagram', url: 'https://www.instagram.com/sail_riccione_reka/', label: '溪岸 SAIL BY RICCIONE REKA', icon_path: '/card/logo-sail.png' },
    { platform: 'website', url: 'https://www.riccione.asia/', label: '官网', icon_path: '/card/logo-riccione.png' },
  ],
  groups: [
    {
      name: 'PUMM 马来西亚创业促进会',
      role: '彭亨州联委会理事 · Pahang State Liaison Committee',
      note: 'Persatuan Usahawan Maju Malaysia，全国 3,000 多名会员的创业者组织。想认识各行各业的创业者、参加商会活动，或需要人脉牵线，都可以找我。',
      logo_path: '/card/logo-pumm.jpg',
      links: [
        { label: '认识 PUMM', url: 'https://pumm.my/' },
        { label: '我的 PUMM 会员名片', url: 'https://signup.pumm.my/member/ProfileCardV4.aspx?Uname=PUMM_YQBxQs&LanguageCode=system&FromApp=Y' },
      ],
    },
  ],
  card_images: ['/card/namecard-riccione.jpg', '/card/namecard-pumm.jpg'],
  greeting: 'Hi {me}，我是 {name}，刚刚在 {where} 认识 😊',
  privacy_contact: '',
  form_on: true,
};

/** 名片内容 → 只留认得的栏位（防止把奇怪的东西放上公开页） */
export function cleanCard(c = {}) {
  const src = c && typeof c === 'object' ? c : {};
  const out = {
    name: str(src.name, 80),
    name_alt: str(src.name_alt, 80),
    title: str(src.title, 120),
    company: str(src.company, 120),
    tagline: str(src.tagline, 160),
    intro: str(src.intro, 1200),
    whatsapp: toWhatsApp(str(src.whatsapp, 30)),
    phone: str(src.phone, 30).replace(/[^\d+()\-\s]/g, ''),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(src.email, 120)) ? str(src.email, 120).toLowerCase() : '',
    website: safeUrl(src.website),
    address: str(src.address, 300),
    photo_path: safePath(src.photo_path),
    video_path: safePath(src.video_path),
    video_url: safeUrl(src.video_url),
    poster_path: safePath(src.poster_path),
    offers: (Array.isArray(src.offers) ? src.offers : []).map((x) => str(x, 120)).filter(Boolean).slice(0, MAX_OFFERS),
    cases: (Array.isArray(src.cases) ? src.cases : [])
      .map((x) => ({ title: str(x && x.title, 80), note: str(x && x.note, 200), image_path: safePath(x && x.image_path) }))
      .filter((x) => x.title || x.image_path)
      .slice(0, MAX_CASES),
    socials: (Array.isArray(src.socials) ? src.socials : [])
      .map((x) => ({ platform: SOCIAL_PLATFORMS.includes(str(x && x.platform, 20).toLowerCase()) ? str(x.platform, 20).toLowerCase() : 'website', url: safeUrl(x && x.url), label: str(x && x.label, 40), icon_path: safePath(x && x.icon_path) }))
      .filter((x) => x.url)
      .slice(0, MAX_SOCIALS),
    opening: cleanLines(src.opening),
    opening_en: cleanLines(src.opening_en),
    opening_on: src.opening_on !== false,
    story: cleanStory(src.story),
    about_photo_path: safePath(src.about_photo_path),
    firm: cleanFirm(src.firm),
    awards: cleanAwards(src.awards),
    places: (Array.isArray(src.places) ? src.places : []).map((x) => ({ title: str(x && x.title, 60), note: str(x && x.note, 160) })).filter((x) => x.title).slice(0, MAX_PLACES),
    places_photo_path: safePath(src.places_photo_path),
    exhibitions: cleanLines(src.exhibitions, MAX_EXHIBITIONS, 60),
    groups: (Array.isArray(src.groups) ? src.groups : []).map(cleanGroup).filter((g) => g.name).slice(0, MAX_GROUPS),
    card_images: (Array.isArray(src.card_images) ? src.card_images : []).map(safePath).filter(Boolean).slice(0, MAX_CARD_IMAGES),
    greeting: str(src.greeting, 200) || DEFAULT_CARD.greeting,
    privacy_contact: str(src.privacy_contact, 120),
    form_on: src.form_on !== false,
  };
  return out;
}

/** 「两代人」那一块：标题、一句话、一张照片、几件大事（年份 + 一句） */
function cleanStory(v) {
  const x = v && typeof v === 'object' ? v : {};
  return {
    title: str(x.title, 60),
    note: str(x.note, 300),
    photo_path: safePath(x.photo_path),
    milestones: (Array.isArray(x.milestones) ? x.milestones : [])
      .map((m) => ({ year: str(m && m.year, 12), text: str(m && m.text, 120) }))
      .filter((m) => m.year || m.text)
      .slice(0, MAX_MILESTONES),
  };
}

/** 公司：标题、一句话、照片、数字格子 */
function cleanFirm(v) {
  const x = v && typeof v === 'object' ? v : {};
  return {
    title: str(x.title, 80),
    lead: str(x.lead, 400),
    photo_path: safePath(x.photo_path),
    stats: (Array.isArray(x.stats) ? x.stats : [])
      .map((m) => ({ value: str(m && m.value, 20), label: str(m && m.label, 60) }))
      .filter((m) => m.value)
      .slice(0, MAX_STATS),
  };
}

/** 奖项：一张照片 + 几项（年份、奖名、哪个品牌 / 哪个系列） */
function cleanAwards(v) {
  const x = v && typeof v === 'object' ? v : {};
  return {
    photo_path: safePath(x.photo_path),
    items: (Array.isArray(x.items) ? x.items : [])
      .map((m) => ({ year: str(m && m.year, 12), title: str(m && m.title, 100), note: str(m && m.note, 160) }))
      .filter((m) => m.title)
      .slice(0, MAX_AWARDS),
  };
}

/** 商会 / 组织：名字、职位、一段介绍、logo、最多 2 个链接 */
function cleanGroup(v) {
  const x = v && typeof v === 'object' ? v : {};
  return {
    name: str(x.name, 80),
    role: str(x.role, 120),
    note: str(x.note, 400),
    logo_path: safePath(x.logo_path),
    links: (Array.isArray(x.links) ? x.links : [])
      .map((l) => ({ label: str(l && l.label, 40), url: safeUrl(l && l.url) }))
      .filter((l) => l.url)
      .slice(0, 2),
  };
}

/** 名片有没有填到可以公开（至少名字 + 一个联络方式） */
export function cardReady(card) {
  const c = cleanCard(card);
  return !!(c.name && (c.whatsapp || c.phone || c.email));
}

/** 存储路径 → 公开网址 */
export function publicUrl(base, path) {
  if (!path) return '';
  if (path.startsWith('/')) return path; // 网站自带的图（/card/…）
  return `${String(base || '').replace(/\/+$/, '')}/storage/v1/object/public/${CARD_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** 给公开页的版本：路径换成网址、不送 *_path */
export function publicCard(card, supabaseUrl) {
  const c = cleanCard(card);
  const url = (p) => publicUrl(supabaseUrl, p);
  const { photo_path, video_path, poster_path, about_photo_path, places_photo_path, ...rest } = c;
  return {
    ...rest,
    photo: url(photo_path),
    video: video_path ? url(video_path) : c.video_url,
    poster: url(poster_path) || url(photo_path),
    cases: c.cases.map(({ image_path, ...x }) => ({ ...x, image: url(image_path) })),
    story: (({ photo_path: sp, ...x }) => ({ ...x, photo: url(sp) }))(c.story),
    socials: c.socials.map(({ icon_path, ...x }) => ({ ...x, icon: url(icon_path) })),
    groups: c.groups.map(({ logo_path, ...x }) => ({ ...x, logo: url(logo_path) })),
    card_images: c.card_images.map(url),
    about_photo: url(c.about_photo_path),
    firm: (({ photo_path: cp, ...x }) => ({ ...x, photo: url(cp) }))(c.firm),
    awards: (({ photo_path: ap, ...x }) => ({ ...x, photo: url(ap) }))(c.awards),
    places_photo: url(c.places_photo_path),
  };
}

/* ---------- vCard 3.0 ---------- */
const vesc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** 75 个字节一行（RFC 6350 折行；中文不拆半个字） */
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; size = 0; }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function toVCard(card, { pageUrl = '' } = {}) {
  const c = cleanCard(card);
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${vesc(c.name)}`, `N:${vesc(c.name)};;;;`];
  if (c.name_alt) lines.push(`NICKNAME:${vesc(c.name_alt)}`);
  if (c.company) lines.push(`ORG:${vesc(c.company)}`);
  if (c.title) lines.push(`TITLE:${vesc(c.title)}`);
  const wa = c.whatsapp;
  const tel = c.phone ? digits(toWhatsApp(c.phone)) : '';
  if (wa) lines.push(`TEL;TYPE=CELL,VOICE:+${wa}`);
  if (tel && tel !== wa) lines.push(`TEL;TYPE=WORK,VOICE:+${tel}`);
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${vesc(c.email)}`);
  if (c.website) lines.push(`URL:${vesc(c.website)}`);
  if (pageUrl) lines.push(`URL;TYPE=card:${vesc(pageUrl)}`);
  if (c.address) lines.push(`ADR;TYPE=WORK:;;${vesc(c.address)};;;;`);
  if (c.tagline) lines.push(`NOTE:${vesc(c.tagline)}`);
  lines.push('END:VCARD');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export function vcardFileName(card) {
  const n = str(card && card.name, 60).replace(/[^\w\u4e00-\u9fff -]/g, '').trim() || 'contact';
  return `${n}.vcf`;
}

/* ---------- 送出后「WhatsApp 我」 ---------- */
export function greeting(card, { name = '', where = '' } = {}) {
  const c = cleanCard(card);
  const tpl = c.greeting || DEFAULT_CARD.greeting;
  const first = String(c.name || '').split(/\s+/)[0] || c.name;
  return tpl
    .replace(/\{me\}/g, first || '')
    .replace(/\{name\}/g, name || '___')
    .replace(/\{where\}/g, where || '___')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- 别人留的资料 ---------- */
export const LEAD_LIMITS = { name: 80, phone: 30, company: 120, title: 120, email: 120, met_where: 120, note: 500 };

export class LeadError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/**
 * 公开表格送来的资料 → 干净的 lead；不合格丢 LeadError。
 * hasCard = 有拍名片（那名字、电话可以不填，交给 AI 读）
 */
export function cleanLead(body = {}, { hasCard = false } = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const lead = {};
  for (const [k, max] of Object.entries(LEAD_LIMITS)) lead[k] = str(b[k], max).replace(/\s+/g, k === 'note' ? ' ' : ' ');
  lead.email = lead.email.toLowerCase();
  lead.phone = lead.phone.replace(/[^\d+()\-\s]/g, '').trim();
  if (b.consent !== true) throw new LeadError('consent_required', '请先勾选同意');
  if (!hasCard && !lead.name) throw new LeadError('name_required', '请填名字');
  const pd = digits(lead.phone);
  if (!hasCard && !pd) throw new LeadError('phone_required', '请填手机 / WhatsApp');
  if (lead.phone && (pd.length < 7 || pd.length > 15)) throw new LeadError('bad_phone', '手机号码好像不对');
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) throw new LeadError('bad_email', '邮箱好像不对');
  if (/https?:\/\/|www\./i.test(`${lead.name} ${lead.company} ${lead.title}`)) throw new LeadError('bad_input', '名字、公司里不能放网址');
  return lead;
}

/** 名片 AI 读到的 → 补进 lead（本人打的字优先） */
export function fillLeadFromCard(lead, card) {
  if (!card) return lead;
  const out = { ...lead };
  if (!out.name) out.name = str(card.name, LEAD_LIMITS.name);
  if (!out.company) out.company = str(card.company, LEAD_LIMITS.company);
  if (!out.title) out.title = str(card.title, LEAD_LIMITS.title);
  if (!out.email && card.emails && card.emails[0]) out.email = str(card.emails[0], LEAD_LIMITS.email).toLowerCase();
  const phones = (card.phones || []).map((p) => ({ label: str(p.label, 20) || 'mobile', number: str(p.number, 30) })).filter((p) => p.number);
  if (!out.phone && phones.length) {
    const p = phones.find((x) => x.label === 'whatsapp') || phones.find((x) => x.label === 'mobile') || phones[0];
    out.phone = p.number;
  }
  out.extra = {
    name_alt: str(card.name_alt, 80),
    phones,
    emails: (card.emails || []).map((e) => str(e, 120).toLowerCase()).filter(Boolean),
    website: str(card.website, 300),
    address: str(card.address, 300),
    socials: card.socials || [],
    card_notes: str(card.card_notes, 1000),
    industry_guess: str(card.industry_guess, 200),
  };
  return out;
}

/** 已经存过吗？只认电话末 9 码 / 邮箱一样（名字一样不算 —— 公开表格谁都能打名字） */
export function findExisting(lead, people) {
  const card = {
    name: '',
    phones: [lead.phone, ...((lead.extra && lead.extra.phones) || []).map((p) => p.number)].filter(Boolean).map((number) => ({ number })),
    emails: [lead.email, ...((lead.extra && lead.extra.emails) || [])].filter(Boolean),
  };
  const hit = findDuplicates(card, people).find((d) => d.strong);
  return hit ? hit.person : null;
}

export function klDate(now = new Date()) {
  // 马来西亚时间的日期（UTC+8，没有夏令时）
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 怎么认识：他自己填的 > 活动名 > 「扫码留资料」 */
export function howMet(lead, event) {
  return lead.met_where || (event && event.name) || '扫码留资料';
}

/** 一个新的人（还没有 id / owner / company_id） */
export function leadToPerson(lead, { event = null, source = 'qr', now = new Date() } = {}) {
  const x = lead.extra || {};
  const phones = [];
  const seen = new Set();
  for (const p of [lead.phone ? { label: 'whatsapp', number: lead.phone } : null, ...(x.phones || [])]) {
    if (!p || !p.number) continue;
    const k = digits(p.number).slice(-9);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    phones.push({ label: p.label || 'mobile', number: p.number });
  }
  const emails = [...new Set([lead.email, ...(x.emails || [])].filter(Boolean))];
  return {
    name: lead.name || '（名片待确认）',
    name_alt: x.name_alt || '',
    title: lead.title || '',
    phones,
    emails,
    whatsapp: lead.phone ? toWhatsApp(lead.phone) : '',
    website: x.website || '',
    address: x.address || '',
    socials: (x.socials || []).filter((s) => s && s.handle).map((s) => ({ platform: str(s.platform, 20) || 'other', handle: str(s.handle, 100) })),
    card_notes: x.card_notes || '',
    tier: 'known',
    affinity: 50,
    interests: [],
    tags: source === 'nfc' ? ['扫码', 'NFC'] : ['扫码'],
    how_met: howMet(lead, event),
    met_on: (event && event.held_on) || klDate(now),
    notes: lead.note ? `【他留的话】${lead.note}` : '',
    pending_review: true,
  };
}

/** 已经存过的人：只补空的栏位、加新电话 / 邮箱、加标签；不改名字、不改圈层 */
export function mergeLeadInto(person, lead, { source = 'qr' } = {}) {
  const fresh = leadToPerson(lead, { source });
  const patch = {};
  for (const k of ['title', 'name_alt', 'website', 'address', 'whatsapp', 'card_notes']) {
    if (!person[k] && fresh[k]) patch[k] = fresh[k];
  }
  const have = new Set([...(person.phones || []).map((p) => p.number), person.whatsapp].map((n) => digits(n).slice(-9)).filter(Boolean));
  const newPhones = fresh.phones.filter((p) => !have.has(digits(p.number).slice(-9)));
  if (newPhones.length) patch.phones = [...(person.phones || []), ...newPhones];
  const emails = person.emails || [];
  const newEmails = fresh.emails.filter((e) => !emails.map((x) => String(x).toLowerCase()).includes(e));
  if (newEmails.length) patch.emails = [...emails, ...newEmails];
  const tags = person.tags || [];
  const newTags = fresh.tags.filter((t) => !tags.includes(t));
  if (newTags.length) patch.tags = [...tags, ...newTags];
  if (lead.note) patch.notes = [person.notes, `【${klDate()} 扫码留言】${lead.note}`].filter(Boolean).join('\n');
  return patch;
}

/** 送进 inbox 记录的（审计 / PDPA 查询用；不放图片） */
export function leadForLog(lead) {
  const { extra, ...rest } = lead;
  return { ...rest, from_card: !!extra };
}

/** 网址上的来源：qr（默认）/ nfc / folotoy */
export function cleanSource(s) {
  const v = String(s || '').toLowerCase();
  return ['qr', 'nfc', 'folotoy'].includes(v) ? v : 'qr';
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 名片网址：/c、/c?e=<活动>、/c?s=nfc */
export function cardLink(origin, { event = '', source = '' } = {}) {
  const u = new URL('/c', origin || 'https://example.com');
  if (event) u.searchParams.set('e', event);
  if (source && source !== 'qr') u.searchParams.set('s', source);
  return u.toString();
}
