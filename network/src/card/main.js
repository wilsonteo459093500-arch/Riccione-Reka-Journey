/* ============================================================
   公开名片页 /c（不用登入、不载 React，越快越好）
   ------------------------------------------------------------
   /c            一般的名片
   /c?e=<活动>    活动模式：扫码的人自动记到那个活动的出席名单，表格排前面
   /c?s=nfc      从 NFC 贴纸来的（s=folotoy：从 FoloToy 屏幕上的二维码来的）
   流程：开场（全黑、一句一句，亮起来，见 opening.js）→ 作品（开场视频 + 案例照片，左右滑）→ 名字 → WhatsApp 我 · 存我的联络方式 → 关于我 · 我能帮你 · 找到我 → 留下你的联络方式
   电脑宽度：左边作品固定、右边资料往下滑
   ?intro=1：每次都播完整的开场（示范用）
   所有使用者给的字都用 textContent 放进去，不用 innerHTML（防 XSS）
   ============================================================ */
import './card.css';
import { greeting, CONSENT_VERSION } from '../lib/card.js';
import { shrinkImage } from '../lib/image.js';
import { mountOpening } from './opening.js';

/* ---------- 文字（中文 / English） ---------- */
const T = {
  zh: {
    wa: 'WhatsApp 我', save: '存我的联络方式', call: '打电话', mail: '邮件', web: '网站',
    about: '关于我', offers: '我可以帮你', cases: '作品', find: '找到我',
    eventHi: (n) => ['欢迎来到 ', n, ' 👋 留个联络方式，之后好联系。'],
    formTitle: '留下你的联络方式', formSub: '不用交换名片 —— 填一下，我会存好，之后 WhatsApp 你。',
    name: '名字', phone: '手机 / WhatsApp', company: '公司', title: '职位', email: '邮箱', where: '我们在哪里认识',
    wherePh: '例：商会晚宴、朋友介绍', optional: '（选填）', required: '*',
    or: '或者', photo: '拍你的名片（不用打字）', photoRetake: '换一张', photoReady: '名片照片好了：名字、电话可以不填',
    consent: (me) => `我同意 ${me} 保存上面的资料，只用来跟我联络；不会给别人、不会拿去群发广告。我可以随时要求删除。`,
    privacyTitle: '隐私说明（PDPA）',
    privacy: (me, contact) => [
      `你填的资料（名字、电话、公司、职位、邮箱、名片照片）只有 ${me} 本人看得到，存在加密的私人资料库里，用来记得你是谁、之后跟你联络。`,
      '不会卖、不会分享给第三方，也不会加进任何广告名单。',
      `想看我存了什么、想改或删除：${contact || '直接 WhatsApp 我'}，我会在 21 天内处理。`,
    ],
    send: '送出', sending: '送出中…',
    thanks: (n) => (n ? `谢谢，${n}！` : '谢谢！'), thanksSub: '资料收到了。顺手发个 WhatsApp 给我，我就记得你是哪一位 😊',
    waMe: '发 WhatsApp 给我', again: '再留一次',
    dock: '交换联络方式', sound: '声音',
    skip: '跳过', cue: '往下看，认识我', story: '传承', groups: '商会与资源', cards: '我的名片', cardsSub: '点一下看大图',
    errNet: '连不上，检查一下网络再试一次', errBusy: '送出太多次了，请稍后再试，或直接 WhatsApp 我',
    fail: '名片暂时打不开，请稍后再试。',
    lang: 'EN',
  },
  en: {
    wa: 'WhatsApp me', save: 'Save contact', call: 'Call', mail: 'Email', web: 'Website',
    about: 'About', offers: 'How I can help', cases: 'Work', find: 'Find me',
    eventHi: (n) => ['Welcome to ', n, ' 👋 Leave your contact so we can keep in touch.'],
    formTitle: 'Leave your contact', formSub: 'No need to swap cards — fill this in and I’ll save it and WhatsApp you.',
    name: 'Name', phone: 'Mobile / WhatsApp', company: 'Company', title: 'Title', email: 'Email', where: 'Where we met',
    wherePh: 'e.g. chamber dinner, a friend', optional: ' (optional)', required: '*',
    or: 'or', photo: 'Snap your business card instead', photoRetake: 'Retake', photoReady: 'Card photo ready — name & phone are optional now',
    consent: (me) => `I agree that ${me} may keep the details above only to stay in touch with me — never shared, never used for mass marketing. I can ask for deletion any time.`,
    privacyTitle: 'Privacy notice (PDPA)',
    privacy: (me, contact) => [
      `What you enter (name, phone, company, title, email, card photo) is visible only to ${me}, stored in a private encrypted database, and used to remember who you are and contact you.`,
      'It is never sold, shared with third parties or added to any advertising list.',
      `To see, correct or delete your data: ${contact || 'just WhatsApp me'} — handled within 21 days.`,
    ],
    send: 'Send', sending: 'Sending…',
    thanks: (n) => (n ? `Thank you, ${n}!` : 'Thank you!'), thanksSub: 'Got it. Send me a quick WhatsApp so I know which one is you 😊',
    waMe: 'WhatsApp me now', again: 'Send again',
    dock: 'Swap contacts', sound: 'Sound',
    skip: 'Skip', cue: 'Scroll to meet me', story: 'Our story', groups: 'Networks', cards: 'My business cards', cardsSub: 'Tap to enlarge',
    errNet: 'Can’t connect — check your network and try again', errBusy: 'Too many tries — please try later or just WhatsApp me',
    fail: 'This card can’t be opened right now. Please try again later.',
    lang: '中文',
  },
};

/* ---------- 小工具 ---------- */
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 无痕模式 */ } },
};
const params = new URLSearchParams(window.location.search);
const EVENT = params.get('e') || '';
const SRC = params.get('s') || '';
const t0 = Date.now();
// 默认中文（名片内容是中文的）；按过 EN 就记住
let lang = ls.get('space-card:lang') || 'zh';
let tr = T[lang];

/** h('div.a.b', {attrs}, ...children) —— 字串一律当文字 */
function h(tag, attrs, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v; // 只给下面的常数图示用
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const icon = (name) => h('span', { 'aria-hidden': 'true', html: ICONS[name], style: 'display:inline-flex' });
const ICONS = {
  wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.1c-.24.68-1.42 1.3-1.95 1.34-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.92-4.66-4.1-.13-.18-1.11-1.48-1.11-2.82s.7-2 .95-2.27c.25-.27.54-.34.72-.34h.52c.17 0 .4-.06.62.47.24.56.8 1.94.86 2.08.07.14.12.3.02.48-.09.18-.14.3-.27.46l-.41.48c-.14.13-.28.28-.12.55.16.27.71 1.17 1.52 1.9 1.05.93 1.93 1.22 2.2 1.36.27.14.43.11.59-.07.16-.18.68-.79.86-1.06.18-.27.36-.23.61-.14.25.09 1.59.75 1.86.89.27.14.45.2.52.32.07.11.07.66-.17 1.33Z"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
  web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  mute: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5ZM22 9l-6 6M16 9l6 6"/></svg>',
  sound: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
};
/** 平台小图示（「找到我」卡片右上角） */
const GLYPH = {
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v6h4v-6h3l.5-4h-3.5V8.8c0-.5.3-.8.5-.8Z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 9v6l5-3-5-3Z"/></svg>',
  website: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
};
const GLYPH_TEXT = { linkedin: 'in', tiktok: '♪', xiaohongshu: '书' };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** 「找到我」的一张卡：logo / 头像 + 名字 + @帐号，右上角是平台图示 */
function linkCard(s) {
  const photo = s.icon && /\.jpe?g(\?|$)/i.test(s.icon);
  const badge = GLYPH[s.platform] ? h(`span.lc-badge.${s.platform}`, { 'aria-hidden': 'true', html: GLYPH[s.platform] }) : h(`span.lc-badge.${s.platform}`, { 'aria-hidden': 'true' }, GLYPH_TEXT[s.platform] || '↗');
  return h('a.lc', { href: s.url, target: '_blank', rel: 'noopener' },
    h('span.lc-art', null, s.icon ? h(photo ? 'img.lc-photo' : 'img.lc-logo', { src: s.icon, alt: '', loading: 'lazy', decoding: 'async' }) : h('span.lc-plain', null, SOCIAL_LABEL[s.platform] || s.platform)),
    badge,
    h('span.lc-name', null, s.label || SOCIAL_LABEL[s.platform] || s.platform),
    h('span.lc-sub', null, handle(s) || hostOf(s.url)));
}

const SOCIAL_LABEL = { linkedin: 'LinkedIn', instagram: 'Instagram', facebook: 'Facebook', xiaohongshu: '小红书', tiktok: 'TikTok', youtube: 'YouTube', website: 'Website' };

/** instagram.com/wilsonteo0419 → @wilsonteo0419（同一个平台有好几个帐号时分得出来） */
const handle = (s) => {
  if (!['instagram', 'tiktok', 'xiaohongshu', 'youtube', 'facebook'].includes(s.platform)) return '';
  try { const seg = new URL(s.url).pathname.split('/').filter(Boolean)[0] || ''; return seg && seg.length <= 40 ? `@${seg.replace(/^@/, '')}` : ''; } catch { return ''; }
};
const waHref = (n, text = '') => (n ? `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}` : '');
const firstName = (s) => String(s || '').trim().split(/\s+/)[0] || '';

/* ---------- 读名片 ---------- */
async function loadData() {
  const key = `space-card:data:${EVENT}`;
  const cached = ls.get(key);
  const fresh = fetch(`/api/card${EVENT ? `?e=${encodeURIComponent(EVENT)}` : ''}`, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d) => { ls.set(key, d); return d; });
  if (cached) { fresh.catch(() => null); return { data: cached, fresh }; }
  return { data: await fresh, fresh: null };
}

/* ---------- 画面 ---------- */
let state = { data: null, sent: ls.get('space-card:sent'), cardImg: null, busy: false, err: '', tsToken: '' };
const app = document.getElementById('app');
let op = null; // 开场

/** 开场：名片关掉了就拿走 card.html 里先放好的黑底 */
function syncOpening(card) {
  const labels = { skip: tr.skip, cue: tr.cue };
  if (card.opening_on === false) {
    const pre = document.getElementById('opening');
    if (pre) pre.remove();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#F5F5F7');
    op = null;
    return;
  }
  if (op) op.update(card, lang, labels);
  else op = mountOpening({ h, card, lang, labels, force: params.get('intro') === '1' });
}

function render() {
  const { card, event } = state.data;
  const me = firstName(card.name) || card.name;
  document.title = `${card.name}${card.company ? ` · ${card.company}` : ''}`;
  document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';

  syncOpening(card);
  const root = document.createDocumentFragment();

  /* 第一眼是作品：开场视频 → 案例照片（左右滑）；都没有才用照片 */
  const slides = [];
  if (card.video) slides.push({ video: card.video, poster: card.poster });
  for (const c of card.cases || []) if (c.image) slides.push({ image: c.image, title: c.title, note: c.note });
  if (!slides.length && card.photo) slides.push({ image: card.photo });
  const photoInHero = !!(card.photo && slides.some((x) => x.image === card.photo));

  let video = null;
  const bar = h('div.bar', null, h('span.mark', { 'aria-hidden': 'true' }, monogram(card.name)), h('div.bar-r'));
  if (slides.length) {
    const track = h('div.track', { tabindex: '0', 'aria-label': tr.cases });
    slides.forEach((x, i) => {
      const fig = h('figure.slide', null);
      if (x.video) {
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        video = h('video', { src: x.video, poster: x.poster || null, muted: true, loop: true, playsinline: true, 'webkit-playsinline': true, autoplay: !reduce, preload: 'metadata', 'aria-label': card.name });
        video.muted = true;
        fig.append(video);
      } else {
        fig.append(h('img', { src: x.image, alt: x.title || card.name, fetchpriority: i === 0 ? 'high' : null, loading: i === 0 ? null : 'lazy', decoding: 'async' }));
      }
      track.append(fig);
    });
    const cap = h('p.gcap', { 'aria-live': 'polite' });
    const showCap = (i) => {
      const x = slides[i] || {};
      cap.replaceChildren(
        h('span.gtext', null, x.title ? h('b', null, x.title) : null, x.note ? h('span', null, x.note) : null),
        slides.length > 1 ? h('span.count', null, `${String(i + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`) : null,
      );
      cap.hidden = !x.title && !x.note && slides.length < 2;
    };
    showCap(0);
    let cur = 0;
    track.addEventListener('scroll', () => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (i !== cur) { cur = i; showCap(i); }
    }, { passive: true });
    // 电脑（用滑鼠）：左右箭头
    const go = (d) => track.scrollBy({ left: d * track.clientWidth, behavior: 'smooth' });
    const nav = slides.length > 1 ? h('div.gnav', null,
      h('button', { type: 'button', 'aria-label': lang === 'zh' ? '上一张' : 'Previous', onclick: () => go(-1) }, '‹'),
      h('button', { type: 'button', 'aria-label': lang === 'zh' ? '下一张' : 'Next', onclick: () => go(1) }, '›')) : null;
    root.append(h('section.gallery', null, bar, h('div.stage', null, track, nav), cap));
  } else {
    root.append(h('section.gallery.empty', null, bar));
  }
  const barR = bar.lastChild;
  if (video) {
    const btn = h('button.pill.sound', { type: 'button', 'aria-label': tr.sound, onclick: () => { video.muted = !video.muted; if (video.paused) video.play().catch(() => null); btn.replaceChildren(icon(video.muted ? 'mute' : 'sound')); } }, icon('mute'));
    barR.append(btn);
  }
  barR.append(langBtn());

  const side = h('div.side');

  /* 名字 */
  side.append(h('div.id', null,
    card.photo && !photoInHero ? h('img.avatar', { src: card.photo, alt: '' }) : null,
    card.company ? h('p.company', null, card.company) : null,
    h('h1.name', null, card.name, card.name_alt ? h('span.name-alt', null, card.name_alt) : null),
    card.title ? h('p.title', null, card.title) : null,
    card.tagline ? h('p.tagline', null, card.tagline) : null));

  /* 主要按钮 */
  const wa = waHref(card.whatsapp, `Hi ${me}，`);
  side.append(h('div.actions', null,
    wa ? h('a.btn.wa', { href: wa, target: '_blank', rel: 'noopener' }, icon('wa'), tr.wa) : null,
    h('a.btn.line', { href: '/api/card?format=vcf', download: 'contact.vcf' }, icon('save'), tr.save)));
  const minis = [
    card.phone || card.whatsapp ? h('a.mini', { href: `tel:${card.phone ? card.phone.replace(/[^\d+]/g, '') : `+${card.whatsapp}`}` }, icon('phone'), tr.call) : null,
    card.email ? h('a.mini', { href: `mailto:${card.email}` }, icon('mail'), tr.mail) : null,
    card.website ? h('a.mini', { href: card.website, target: '_blank', rel: 'noopener' }, icon('web'), tr.web) : null,
  ].filter(Boolean);
  if (minis.length) side.append(h('nav.minis', null, minis));

  if (event) {
    const [a, n, b] = tr.eventHi(event.name);
    side.append(h('p.event', null, a, h('b', null, n), b));
  }

  const form = card.form_on !== false && state.data.inbox !== 'off' ? formBlock(card, event) : null;
  if (event && form) side.append(form); // 活动现场：表格排前面

  const sec = (label, ...kids) => h('section.sec', null, h('h2.kicker', null, label), ...kids);
  if (card.intro) side.append(sec(tr.about, h('p.lead', null, card.intro)));
  const st = card.story;
  if (st && (st.photo || st.note || (st.milestones && st.milestones.length))) {
    side.append(h('section.sec.story', null,
      h('h2.kicker', null, tr.story),
      st.title ? h('h3.st-title', null, st.title) : null,
      st.photo ? h('figure.st-photo', null, h('img', { src: st.photo, alt: st.note || st.title || card.name, loading: 'lazy', decoding: 'async' })) : null,
      st.note ? h('p.st-note', null, st.note) : null,
      st.milestones && st.milestones.length ? h('ol.timeline', null, st.milestones.map((m) => h('li', null, h('span.yr', null, m.year), h('span', null, m.text)))) : null));
  }
  if (card.offers && card.offers.length) {
    side.append(sec(tr.offers, h('ol.offers', null, card.offers.map((o, i) => h('li', null, h('span.no', { 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')), h('span', null, o))))));
  }
  if (card.groups && card.groups.length) {
    side.append(sec(tr.groups, card.groups.map((g) => h('div.group', null,
      g.logo ? h('img.g-logo', { src: g.logo, alt: g.name, loading: 'lazy', decoding: 'async' }) : null,
      h('h3.st-title', null, g.name),
      g.role ? h('p.g-role', null, g.role) : null,
      g.note ? h('p.st-note', null, g.note) : null,
      g.links && g.links.length ? h('div.g-links', null, g.links.map((l) => h('a.btn.line.g-link', { href: l.url, target: '_blank', rel: 'noopener' }, l.label || hostOf(l.url), h('span.arrow', { 'aria-hidden': 'true' }, '↗')))) : null))));
  }
  if ((card.socials && card.socials.length) || card.address) {
    side.append(sec(tr.find,
      card.socials && card.socials.length ? h('div.links', null, card.socials.map(linkCard)) : null,
      card.address ? h('p.addr', null, card.address) : null));
  }

  if (!event && form) side.append(form);
  if (card.card_images && card.card_images.length) {
    side.append(h('section.sec.namecards', null, h('h2.kicker', null, tr.cards),
      card.card_images.map((src) => h('a.namecard', { href: src, target: '_blank', rel: 'noopener', 'aria-label': tr.cardsSub }, h('img', { src, alt: tr.cards, loading: 'lazy', decoding: 'async' }))),
      h('p.nc-sub', null, tr.cardsSub)));
  }
  side.append(h('footer', null, card.company || card.name));
  root.append(side);

  /* 还没看到表格时，底部浮一个「交换联络方式」 */
  let dock = null;
  if (form) {
    dock = h('div.dock', null, h('button.btn.primary', { type: 'button', onclick: () => form.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, icon('swap'), tr.dock));
    root.append(dock);
  }

  app.replaceChildren(root);
  app.setAttribute('aria-busy', 'false');

  if (form && dock && 'IntersectionObserver' in window) {
    let seenForm = false;
    const past = () => (op ? op.height() : 0) + 240; // 滑过开场才出现
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.target === form) seenForm = e.isIntersecting;
      dock.classList.toggle('show', !seenForm && window.scrollY > past());
    }, { threshold: 0.05 });
    io.observe(form);
    window.addEventListener('scroll', () => dock.classList.toggle('show', !seenForm && window.scrollY > past()), { passive: true });
  }
  if (state.data.turnstile_site_key && form && !state.sent) {
    const slot = document.getElementById('ts');
    if (tsWidget && slot) slot.replaceWith(tsWidget); else mountTurnstile(state.data.turnstile_site_key);
  }
}

/** 名字的缩写（左上角的小记号） */
function monogram(name) {
  const s = String(name || '').trim();
  const m = /[A-Za-z]/.exec(s);
  return m ? m[0].toUpperCase() : s.slice(0, 1);
}

function langBtn() {
  return h('button.pill', { type: 'button', onclick: () => { lang = lang === 'zh' ? 'en' : 'zh'; tr = T[lang]; ls.set('space-card:lang', lang); render(); } }, tr.lang);
}

/* ---------- 留资料 ---------- */
function formBlock(card, event) {
  const me = firstName(card.name) || card.name;
  const wrap = h('section.form-card', { id: 'leave' });

  if (state.sent) {
    const text = greeting(card, { name: state.sent.name, where: state.sent.where });
    wrap.append(h('div.thanks', { role: 'status' },
      h('div.check', null, icon('check')),
      h('h2', null, tr.thanks(state.sent.name)),
      h('p', null, tr.thanksSub),
      card.whatsapp ? h('a.btn.wa.full', { href: waHref(card.whatsapp, text), target: '_blank', rel: 'noopener' }, icon('wa'), tr.waMe) : null,
      h('a.btn.line.full', { href: '/api/card?format=vcf', download: 'contact.vcf' }, icon('save'), tr.save),
      h('button.again', { type: 'button', onclick: () => { state.sent = null; ls.set('space-card:sent', null); render(); document.getElementById('leave').scrollIntoView({ block: 'start' }); } }, tr.again)));
    return wrap;
  }

  const opt = h('span', null, tr.optional);
  const field = (name, label, attrs = {}, required = false) => h('label.field', null,
    h('span', null, label, required ? h('em', null, ` ${tr.required}`) : opt.cloneNode(true)),
    h('input.input', { name, ...attrs }));
  const needBasic = !state.cardImg;

  const f = h('form', { novalidate: true, onsubmit: (e) => { e.preventDefault(); submit(f, card, event); } },
    field('name', tr.name, { autocomplete: 'name', maxlength: 80, required: needBasic, enterkeyhint: 'next' }, needBasic),
    field('phone', tr.phone, { type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: 30, placeholder: '012-345 6789', required: needBasic }, needBasic),
    h('div.row2', null,
      field('company', tr.company, { autocomplete: 'organization', maxlength: 120 }),
      field('title', tr.title, { autocomplete: 'organization-title', maxlength: 120 })),
    field('email', tr.email, { type: 'email', inputmode: 'email', autocomplete: 'email', maxlength: 120 }),
    event ? null : field('met_where', tr.where, { maxlength: 120, placeholder: tr.wherePh }),
    h('input.trap', { name: 'fax', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }),
    h('div.or', null, tr.or),
    photoPicker(),
    h('label.consent', null, h('input', { type: 'checkbox', name: 'consent', required: true }), h('span', null, tr.consent(me))),
    h('details.privacy', null, h('summary', null, tr.privacyTitle), ...tr.privacy(me, card.privacy_contact).map((p) => h('p', null, p))),
    h('div', { id: 'ts' }),
    state.err ? h('p.err', { role: 'alert' }, state.err) : null,
    h('button.btn.primary.full.submit', { type: 'submit', disabled: state.busy }, state.busy ? tr.sending : tr.send));

  wrap.append(h('h2', null, tr.formTitle), h('p.sub', null, tr.formSub), f);
  return wrap;
}

function photoPicker() {
  const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/*', capture: 'environment', class: 'sr', 'aria-label': tr.photo });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { state.err = lang === 'zh' ? '照片太大了（最多 10MB）' : 'Photo too large (max 10MB)'; return rerenderForm(); }
    try {
      const img = await shrinkImage(file, 1600, 0.8);
      state.cardImg = { media_type: img.media_type, data: img.base64, preview: URL.createObjectURL(img.blob) };
      state.err = '';
    } catch (e) {
      state.err = String((e && e.message) || e);
    }
    rerenderForm();
  });
  if (state.cardImg) {
    return h('div.photo-prev', null, h('img', { src: state.cardImg.preview, alt: '' }), h('span', null, tr.photoReady),
      h('button', { type: 'button', onclick: () => { state.cardImg = null; rerenderForm(); } }, tr.photoRetake));
  }
  return h('label.btn.line.full.photo-btn', null, icon('cam'), tr.photo, input);
}

/** 只重画表格（保留已经打的字） */
function rerenderForm() {
  const old = document.getElementById('leave');
  if (!old) return render();
  const values = {};
  for (const el of old.querySelectorAll('input[name]')) values[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  const fresh = formBlock(state.data.card, state.data.event);
  old.replaceWith(fresh);
  for (const el of fresh.querySelectorAll('input[name]')) {
    if (!(el.name in values)) continue;
    if (el.type === 'checkbox') el.checked = values[el.name]; else el.value = values[el.name];
  }
  const ts = document.getElementById('ts');
  if (ts && tsWidget) ts.replaceWith(tsWidget);
}

let tsWidget = null;
function mountTurnstile(siteKey) {
  if (tsWidget) return;
  const host = document.getElementById('ts');
  if (!host) return;
  tsWidget = host;
  window.onSpaceTs = () => {
    window.turnstile.render(tsWidget, { sitekey: siteKey, theme: 'light', callback: (tok) => { state.tsToken = tok; }, 'expired-callback': () => { state.tsToken = ''; } });
  };
  document.head.append(h('script', { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onSpaceTs&render=explicit', async: true, defer: true }));
}

async function submit(form, card, event) {
  if (state.busy) return;
  const fd = new FormData(form);
  const v = (k) => String(fd.get(k) || '').trim();
  const body = {
    name: v('name'), phone: v('phone'), company: v('company'), title: v('title'), email: v('email'), met_where: v('met_where'),
    fax: v('fax'), consent: fd.get('consent') === 'on', consent_version: CONSENT_VERSION,
    event: event ? event.id : '', src: SRC, ms: Date.now() - t0, turnstile: state.tsToken || '',
    card_image: state.cardImg ? { media_type: state.cardImg.media_type, data: state.cardImg.data } : undefined,
  };
  // 先在手机上检查，少等一次
  const zh = lang === 'zh';
  if (!body.consent) return showErr(zh ? '请先勾选同意' : 'Please tick the consent box');
  if (!state.cardImg && !body.name) return showErr(zh ? '请填名字' : 'Please enter your name');
  if (!state.cardImg && body.phone.replace(/\D/g, '').length < 7) return showErr(zh ? '请填手机 / WhatsApp' : 'Please enter your mobile number');

  state.busy = true; state.err = ''; rerenderForm();
  try {
    const r = await fetch('/api/inbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = null;
    try { data = await r.json(); } catch { /* 不是 JSON */ }
    if (!r.ok) throw new Error(r.status === 429 ? tr.errBusy : (data && data.message) || `${tr.errNet} (${r.status})`);
    state.sent = { name: (data && data.name) || body.name, where: event ? event.name : body.met_where, at: new Date().toISOString() };
    ls.set('space-card:sent', state.sent);
    state.cardImg = null;
    state.busy = false;
    rerenderForm();
    const done = document.getElementById('leave');
    if (done) done.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    state.busy = false;
    state.err = e instanceof TypeError ? tr.errNet : String(e.message || e);
    if (window.turnstile && tsWidget) { try { window.turnstile.reset(tsWidget); } catch { /* 没关系 */ } state.tsToken = ''; }
    rerenderForm();
  }
  function showErr(msg) { state.err = msg; rerenderForm(); }
}

/* ---------- 开始 ---------- */
(async () => {
  try {
    const { data, fresh } = await loadData();
    state.data = data;
    render();
    // 用了快取的话，背景拿到新的再画一次（还没开始打字才换）
    if (fresh) {
      fresh.then((d) => {
        const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('form');
        if (!typing && JSON.stringify(d) !== JSON.stringify(state.data)) { state.data = d; render(); }
      }).catch(() => null);
    }
  } catch {
    if (!op) { const pre = document.getElementById('opening'); if (pre) pre.remove(); }
    app.replaceChildren(h('p.fail', null, tr.fail));
    app.setAttribute('aria-busy', 'false');
  }
})();
