import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanCard, publicCard, toVCard, greeting, cleanLead, LeadError, fillLeadFromCard,
  leadToPerson, safeUrl, safePath, cardLink, cleanSource, klDate, cardReady, cleanLines, DEFAULT_CARD, namePair, igUrl, CONSENT_VERSION,
} from '../src/lib/card.js';
import { receiveLead, LIMITS } from '../api/inbox.js';
import { loadCard } from '../api/card.js';
import { ipHash } from '../api/_lib/admin.js';
import { publicBudgetUsd, monthlyBudgetUsd } from '../api/_lib/cost.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('safeUrl / safePath: 只收 https 和自己的路径', () => {
  assert.equal(safeUrl('riccione.com.my'), 'https://riccione.com.my/');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('http://x.com'), '');
  assert.equal(safePath('u1/card/photo-1.jpg'), 'u1/card/photo-1.jpg');
  assert.equal(safePath('u1/../u2/card/a.jpg'), '');
  assert.equal(safePath('u1/other/a.jpg'), '');
  assert.equal(safePath('u1/card/a.html'), '');
});

test('开场白 / 传承：一行一句、上限、网站自带的图', () => {
  assert.deepEqual(cleanLines('你好\n\n  我是 Wilson \n'), ['你好', '我是 Wilson']);
  assert.equal(cleanLines(Array.from({ length: 9 }, (_, i) => `l${i}`)).length, 6);
  assert.equal(cleanLines(['x'.repeat(99)])[0].length, 60);
  const c = cleanCard({ opening: '你好\n很高兴认识你', about_photo_path: '/card/father.jpg' });
  assert.deepEqual(c.opening, ['你好', '很高兴认识你']);
  assert.deepEqual(c.opening_en, []);
  assert.equal(c.opening_on, true);
  assert.equal(cleanCard({ opening_on: false }).opening_on, false);
  assert.equal(safePath('/card/father.jpg'), '/card/father.jpg');
  assert.equal(safePath('/card/../x.jpg'), '');
  assert.equal(safePath('/etc/card/x.jpg'), '');
  const pub = publicCard(c, 'https://x.supabase.co');
  assert.equal(pub.about_photo, '/card/father.jpg');
  assert.equal(pub.about_photo_path, undefined);
  // 预设名片（还没在 SPACE 存过）：图都是网站自带的、能直接打开
  const d = publicCard(DEFAULT_CARD, 'https://x.supabase.co');
  assert.equal(d.photo, '/card/avatar.jpg');
  assert.ok(d.cases.length >= 5 && d.cases.every((x) => x.image.startsWith('/card/')));
  assert.equal(d.whatsapp, '60163881919');
  assert.equal(d.groups[0].logo, '/card/logo-pumm.jpg');
  assert.equal(d.card_images.length, 2);
  assert.ok(d.socials.every((x) => x.icon && x.icon_path === undefined));
});

test('品牌：分开介绍、只留有内容的、上限；预设名片有瑞吉欧和溪岸', () => {
  const c = cleanCard({
    brands: [
      { name: 'R', logo_path: '/card/logo.png', stats: [{ value: '2002', label: '成立' }, { label: '没数字' }, ...Array.from({ length: 8 }, (_, i) => ({ value: String(i) }))],
        awards: [{ year: '2021', title: 'MUSE' }, { year: '2020' }], chips: 'CIFF\nARCHIDEX', series: [{ title: '骨骼线', image_path: 'evil.html' }],
        milestones: [{ year: '1979', text: '起家' }, {}] },
      { title: '没名字的不要' },
    ],
  });
  assert.equal(c.brands.length, 1);
  const b = c.brands[0];
  assert.equal(b.stats.length, 6);
  assert.equal(b.awards.length, 1);
  assert.deepEqual(b.chips, ['CIFF', 'ARCHIDEX']);
  assert.equal(b.series[0].image_path, '');
  assert.equal(b.milestones.length, 1);
  const d = publicCard(DEFAULT_CARD, 'https://x.supabase.co');
  assert.equal(d.company, '瑞吉欧 RICCIONE · 溪岸 SAIL BY RICCIONE REKA'); // 公司名字（字串）
  assert.deepEqual(d.brands.map((x) => x.name), ['瑞吉欧 RICCIONE', '溪岸 SAIL BY RICCIONE REKA']);
  assert.ok(d.brands[0].stats.some((m) => m.value === '2002'));
  assert.ok(d.brands[0].awards.some((m) => /ARCHIDEX/.test(m.title)) && d.brands[1].awards.some((m) => /MUSE/.test(m.title)));
  assert.equal(d.brands[1].series[0].image, '/card/s-skeleton.jpg');
  assert.equal(d.brands[0].logo, '/card/logo-riccione.png');
  assert.equal(d.opening_bg, '/card/opening-forest.jpg');
});

test('商会 / 实体名片：没名字的不要、链接只收 https、上限', () => {
  const c = cleanCard({
    groups: [{ name: 'PUMM', links: [{ label: 'a', url: 'pumm.my' }, { url: 'javascript:1' }, { url: 'https://b.my' }, { url: 'https://c.my' }] }, { role: '没名字' }],
    card_images: ['/card/a.jpg', 'evil.html', '/card/b.jpg', '/card/c.jpg'],
  });
  assert.equal(c.groups.length, 1);
  assert.deepEqual(c.groups[0].links.map((l) => l.url), ['https://pumm.my/', 'https://b.my/']);
  assert.deepEqual(c.card_images, ['/card/a.jpg', '/card/b.jpg']);
});

test('Instagram 视频：只收 instagram.com 的帖子 / Reel，整理成标准网址', () => {
  assert.equal(igUrl('https://www.instagram.com/reel/DQ_tJlekgzV/?psln=aXNr'), 'https://www.instagram.com/reel/DQ_tJlekgzV/');
  assert.equal(igUrl('instagram.com/p/ABCdef123'), 'https://www.instagram.com/p/ABCdef123/');
  assert.equal(igUrl('https://www.instagram.com/wilsonteo0419/reels/XYZabc12/'), 'https://www.instagram.com/reel/XYZabc12/');
  assert.equal(igUrl('https://evil.com/reel/ABCdef123'), '');
  assert.equal(igUrl('javascript:alert(1)'), '');
  assert.deepEqual(cleanCard({ ig_videos: 'https://www.instagram.com/reel/AAAAA1/\nhttps://x.com/a' }).ig_videos, ['https://www.instagram.com/reel/AAAAA1/']);
  assert.equal(publicCard(DEFAULT_CARD, '').ig_videos.length, 1);
});

test('工作以外：照片、兴趣清理和上限；预设有五个兴趣', () => {
  const c = cleanCard({ life: { lead: 'x', items: [{ title: 'A', image_path: '/card/a.jpg' }, { note: '没标题没照片' }, { title: 'B', image_path: 'evil.html' }], hobbies: '潜水\n\n爬山' } });
  assert.equal(c.life.items.length, 2);
  assert.equal(c.life.items[1].image_path, '');
  assert.deepEqual(c.life.hobbies, ['潜水', '爬山']);
  const d = publicCard(DEFAULT_CARD, '');
  assert.deepEqual(d.life.hobbies, ['潜水', '爬山', '露营', '志工', '看书', '动漫']);
  assert.deepEqual([...new Set(d.life.items.map((m) => m.group))], ['学习与社团', '生活与兴趣']);
  assert.equal(cleanCard({ life: { items: Array.from({ length: 30 }, (_, i) => ({ title: `t${i}`, group: 'x'.repeat(40) })) } }).life.items.length, 24);
  assert.ok(d.life.items.every((m) => m.image.startsWith('/card/life-') && m.image_path === undefined));
});

test('名字显示：中文在前、英文在后', () => {
  assert.deepEqual(namePair({ name: 'Wilson Teo', name_alt: '张炜盛' }), ['张炜盛', 'Wilson Teo']);
  assert.deepEqual(namePair({ name: '张炜盛', name_alt: 'Wilson' }), ['张炜盛', 'Wilson']);
  assert.deepEqual(namePair({ name: 'Wilson' }), ['Wilson', '']);
});

test('cleanCard: 只留认得的栏位、WhatsApp 变数字、上限', () => {
  const c = cleanCard({
    name: ' Wilson ', whatsapp: '012-345 6789', email: 'BAD', evil: '<script>',
    offers: Array.from({ length: 12 }, (_, i) => `o${i}`),
    socials: [{ platform: 'Instagram', url: 'instagram.com/x' }, { platform: 'x', url: 'javascript:1' }],
    cases: [{ title: '案例', image_path: 'u/card/a.jpg' }, { note: '没标题没图' }],
  });
  assert.equal(c.name, 'Wilson');
  assert.equal(c.whatsapp, '60123456789');
  assert.equal(c.email, '');
  assert.equal(c.evil, undefined);
  assert.equal(c.offers.length, 8);
  assert.deepEqual(c.socials, [{ platform: 'instagram', url: 'https://instagram.com/x', label: '', icon_path: '' }]);
  assert.equal(c.cases.length, 1);
  assert.equal(c.form_on, true);
  assert.equal(cardReady(c), true);
  assert.equal(cardReady({ name: 'x' }), false);
});

test('publicCard: 路径换成公开网址，不送路径', () => {
  const p = publicCard({ name: 'W', photo_path: 'u1/card/me.jpg', cases: [{ title: 'A', image_path: 'u1/card/a_b.jpg' }] }, 'https://x.supabase.co/');
  assert.equal(p.photo, 'https://x.supabase.co/storage/v1/object/public/network-card/u1/card/me.jpg');
  assert.equal(p.poster, p.photo);
  assert.equal(p.photo_path, undefined);
  assert.equal(p.cases[0].image, 'https://x.supabase.co/storage/v1/object/public/network-card/u1/card/a_b.jpg');
  assert.equal(publicCard({ name: 'W', video_url: 'https://v.com/a.mp4' }, '').video, 'https://v.com/a.mp4');
});

test('toVCard: 3.0、转义、折行', () => {
  const v = toVCard({ name: 'Wilson Teo', company: 'Riccione Reka; Sail', title: 'Founder', whatsapp: '60123456789', phone: '03-1234 5678', email: 'w@x.my', tagline: '很长'.repeat(40) }, { pageUrl: 'https://s.app/c' });
  assert.match(v, /^BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Wilson Teo\r\n/);
  assert.match(v, /ORG:Riccione Reka\\; Sail/);
  assert.match(v, /TEL;TYPE=CELL,VOICE:\+60123456789/);
  assert.match(v, /TEL;TYPE=WORK,VOICE:\+60312345678/);
  assert.match(v, /URL;TYPE=card:https:\/\/s.app\/c/);
  for (const line of v.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.match(v, /END:VCARD\r\n$/);
});

test('greeting: 填进名字和地点', () => {
  assert.equal(greeting({ name: 'Wilson Teo' }, { name: 'Ali', where: 'KLCC 展会' }), 'Hi Wilson，我是 Ali，刚刚在 KLCC 展会 认识 😊');
  assert.equal(greeting({ name: 'W', greeting: 'Yo {me} from {name}' }, {}), 'Yo W from ___');
});

test('cleanLead: 必填、同意、格式', () => {
  const ok = cleanLead({ name: ' Ali ', phone: '012-345 6789', email: 'ALI@X.MY', consent: true });
  assert.equal(ok.name, 'Ali');
  assert.equal(ok.email, 'ali@x.my');
  const code = (fn) => { try { fn(); return null; } catch (e) { assert.ok(e instanceof LeadError); return e.code; } };
  assert.equal(code(() => cleanLead({ name: 'A', phone: '0123456789' })), 'consent_required');
  assert.equal(code(() => cleanLead({ phone: '0123456789', consent: true })), 'name_required');
  assert.equal(code(() => cleanLead({ name: 'A', consent: true })), 'phone_required');
  assert.equal(code(() => cleanLead({ name: 'A', phone: '12', consent: true })), 'bad_phone');
  assert.equal(code(() => cleanLead({ name: 'A', phone: '0123456789', email: 'x', consent: true })), 'bad_email');
  assert.equal(code(() => cleanLead({ name: 'buy http://spam', phone: '0123456789', consent: true })), 'bad_input');
  // 有名片照片：名字、电话可以空
  assert.equal(cleanLead({ consent: true }, { hasCard: true }).name, '');
  assert.equal(cleanLead({ name: 'x'.repeat(500), phone: '0123456789', consent: true }).name.length, 80);
});

test('fillLeadFromCard: 本人打的字优先，电话挑 WhatsApp', () => {
  const lead = fillLeadFromCard({ name: '', phone: '', company: '', title: '', email: '', met_where: '', note: '' }, {
    name: 'Tan', company: 'Mega Sdn Bhd', title: 'Director', emails: ['tan@mega.my'], phones: [{ label: 'office', number: '03-111 2222' }, { label: 'whatsapp', number: '+60 12-345 6789' }],
  });
  assert.equal(lead.name, 'Tan');
  assert.equal(lead.phone, '+60 12-345 6789');
  assert.equal(fillLeadFromCard({ ...lead, name: 'Ah Tan' }, { name: 'Tan' }).name, 'Ah Tan');
});

test('leadToPerson: 认识圈、扫码标签、待确认', () => {
  const p = leadToPerson({ name: 'Ali', phone: '012-345 6789', email: '', company: '', title: '', met_where: '', note: 'hi' }, { event: { name: 'BNI 早餐会', held_on: '2026-11-20' }, source: 'nfc' });
  assert.equal(p.tier, 'known');
  assert.deepEqual(p.tags, ['扫码', 'NFC']);
  assert.equal(p.whatsapp, '60123456789');
  assert.equal(p.how_met, 'BNI 早餐会');
  assert.equal(p.met_on, '2026-11-20');
  assert.equal(p.pending_review, true);
  assert.match(p.notes, /他留的话/);
  assert.equal(klDate(new Date('2026-11-17T17:00:00Z')), '2026-11-18');
});

test('cardLink / cleanSource', () => {
  assert.equal(cardLink('https://space.app', {}), 'https://space.app/c');
  assert.equal(cardLink('https://space.app', { event: 'abc', source: 'nfc' }), 'https://space.app/c?e=abc&s=nfc');
  assert.equal(cleanSource('FoloToy'), 'folotoy');
  assert.equal(cleanSource('<x>'), 'qr');
});

/* ---------- /api/inbox 主流程（假的资料库） ---------- */
// 每个动作都先让出一下（像真的资料库一样有来回），这样「同时送 60 次」才会真的交错
const tick = () => new Promise((r) => setImmediate(r));
function fakeDb(seed = {}) {
  const t = { people: [], companies: [], photos: [], photo_people: [], interactions: [], inbox: [], attendance: [], ai_usage: [], events: [], ...seed };
  let n = 0;
  const uploads = [];
  const spent = typeof seed.spent === 'object' ? seed.spent : { all: seed.spent || 0, inbox_card: 0 };
  return {
    t, uploads, ownerId: 'owner-1',
    async profileCard() { return seed.profile || null; },
    async event(id) { await tick(); return t.events.find((e) => e.id === id) || null; },
    async countInbox({ sinceIso, ip, photo, admitted }) {
      await tick();
      return t.inbox.filter((r) => r.at >= sinceIso && (!ip || r.ip_hash === ip) && (!photo || r.has_photo) && (!admitted || r.outcome !== 'limited')).length;
    },
    async people() { return t.people; },
    async companies() { await tick(); return t.companies; },
    async insert(table, row) { await tick(); const r = { id: row.id || `id${++n}`, owner: 'owner-1', ...row }; t[table].push(r); return r; },
    async update(table, id, patch) { await tick(); const r = t[table].find((x) => x.id === id); Object.assign(r, patch); return r; },
    async attend(event_id, person_id) { if (!t.attendance.some((a) => a.event_id === event_id && a.person_id === person_id)) t.attendance.push({ event_id, person_id }); },
    async spentUsd(since, feature) { return feature ? spent[feature] || 0 : spent.all; },
    async uploadPrivate(path, buf, type) { await tick(); uploads.push({ path, size: buf.length, type }); },
  };
}
const base = { name: 'Ali Bin Abu', phone: '012-345 6789', company: 'Mega Build Sdn Bhd', consent: true, ms: 9000 };
const withCard = { consent: true, ms: 5000, card_image: { media_type: 'image/png', data: PNG } };
const tanCard = async () => ({
  card: { is_business_card: true, name: 'Tan Ah Kow', company: 'Mega', title: 'Boss', phones: [{ label: 'mobile', number: '019-888 7777' }], emails: ['tan@mega.my'] },
  usage: { feature: 'scan_card', model: 'claude-haiku-5-5', cost_usd: 0.001 },
});

test('receiveLead: 新的人 → 建人、公司、互动、inbox', async () => {
  const db = fakeDb();
  const out = await receiveLead({ ...base, met_where: 'KLCC 展会', note: '想看展厅' }, { db, ip: '1.2.3.4' });
  assert.deepEqual(out, { ok: true, name: 'Ali Bin Abu', where: 'KLCC 展会' });
  const p = db.t.people[0];
  assert.equal(p.pending_review, true);
  assert.equal(p.how_met, 'KLCC 展会');
  assert.equal(p.company_id, db.t.companies[0].id);
  assert.equal(db.t.interactions[0].kind, 'card_scan');
  assert.equal(db.t.interactions[0].source, 'qr');
  assert.equal(db.t.inbox.length, 1);
  assert.equal(db.t.inbox[0].outcome, 'created');
  assert.equal(db.t.inbox[0].person_id, p.id);
  assert.equal(db.t.inbox[0].has_photo, false);
  assert.equal(db.t.inbox[0].payload.name, 'Ali Bin Abu');
  assert.equal(db.t.inbox[0].ip_hash, ipHash('1.2.3.4'));
  assert.equal(db.t.inbox[0].consent_version, CONSENT_VERSION);
  assert.notEqual(db.t.inbox[0].ip_hash, '1.2.3.4');
});

test('receiveLead: 电话跟已经存过的人一样 → 不改那个人，另外建一个「新朋友」等主人合并；回应跟新建一样', async () => {
  const old = { id: 'p1', name: '阿里', title: '', phones: [{ label: 'mobile', number: '+60123456789' }], emails: [], tags: [], notes: '', pending_review: false };
  const db = fakeDb({ people: [{ ...old }], companies: [{ id: 'c1', name: 'Mega Build' }] });
  const out = await receiveLead({ ...base, title: 'Director', email: 'fake@evil.com' }, { db, ip: '1.1.1.1' });
  assert.deepEqual(out, { ok: true, name: 'Ali Bin Abu', where: '扫码留资料' });
  assert.deepEqual(db.t.people[0], old);                       // 旧的那个一个字都没动
  assert.equal(db.t.people.length, 2);
  assert.equal(db.t.people[1].pending_review, true);
  assert.equal(db.t.people[1].title, 'Director');
  assert.equal(db.t.inbox[0].outcome, 'created');
  assert.equal(db.t.companies.length, 1);                      // 公司名字对得上就用旧的
});

test('receiveLead: 活动模式 → 出席；别人的活动 id 不算', async () => {
  const ev = { id: '11111111-2222-4333-8444-555555555555', name: 'BNI 早餐会', held_on: '2026-11-20' };
  const db = fakeDb({ events: [ev] });
  await receiveLead({ ...base, event: ev.id }, { db, ip: '1.1.1.1' });
  assert.equal(db.t.attendance.length, 1);
  assert.equal(db.t.people[0].how_met, 'BNI 早餐会');
  assert.match(db.t.interactions[0].title, /BNI/);
  assert.equal(db.t.inbox[0].event_id, ev.id);
  const db2 = fakeDb();
  await receiveLead({ ...base, event: '99999999-2222-4333-8444-555555555555' }, { db: db2, ip: '1.1.1.1' });
  assert.equal(db2.t.attendance.length, 0);
});

test('receiveLead: 陷阱栏位 / 太快 → 假装成功、不存', async () => {
  const db = fakeDb();
  assert.equal((await receiveLead({ ...base, fax: 'bot' }, { db, ip: 'x' })).ok, true);
  assert.equal((await receiveLead({ ...base, ms: 300 }, { db, ip: 'x' })).ok, true);
  assert.equal(db.t.people.length + db.t.inbox.length, 0);
});

test('receiveLead: 没勾同意 → 400；同 IP 太多次 → 429（被挡的那次记成 limited）', async () => {
  const db = fakeDb();
  await assert.rejects(receiveLead({ ...base, consent: false }, { db, ip: 'x' }), (e) => e.status === 400 && e.body.error === 'consent_required');
  const now = new Date();
  for (let i = 0; i < LIMITS.perIpHour; i += 1) db.t.inbox.push({ at: now.toISOString(), ip_hash: ipHash('9.9.9.9'), outcome: 'created' });
  await assert.rejects(receiveLead(base, { db, ip: '9.9.9.9', now }), (e) => e.status === 429);
  assert.equal(db.t.inbox.at(-1).outcome, 'limited');
  assert.equal(db.t.people.length, 0);
  assert.equal((await receiveLead(base, { db, ip: '8.8.8.8', now })).ok, true); // 别的 IP 不受影响
});

test('receiveLead: 同一个 IP 同时送 60 次 → 只进得了 20 个（以前 60 个全进）', async () => {
  const db = fakeDb();
  const now = new Date();
  const results = await Promise.allSettled(Array.from({ length: 60 }, (_, i) => receiveLead({ ...base, name: `Bot ${i}` }, { db, ip: '6.6.6.6', now })));
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  // 绝对不会超过 20；完全同时到的话可能一个都不进（宁可多挡，不会多放）
  assert.ok(ok <= LIMITS.perIpHour, `进了 ${ok} 个`);
  assert.equal(db.t.people.length, ok);
  assert.ok(results.filter((r) => r.status === 'rejected').every((r) => r.reason.status === 429));
  assert.equal(db.t.inbox.filter((r) => r.outcome === 'limited').length, 60 - ok);
});

test('receiveLead: 一个接一个送 → 刚好进 20 个，第 21 个起挡', async () => {
  const db = fakeDb();
  const now = new Date();
  let ok = 0;
  for (let i = 0; i < 25; i += 1) {
    try { await receiveLead(base, { db, ip: '7.7.7.7', now }); ok += 1; } catch (e) { assert.equal(e.status, 429); }
  }
  assert.equal(ok, LIMITS.perIpHour);
});

test('receiveLead: 一个人狂刷不会吃掉全部人的名额（被挡的不算进总数）', async () => {
  const saved = { ...LIMITS };
  Object.assign(LIMITS, { perIpHour: 3, allHour: 5 });
  try {
    const db = fakeDb();
    const now = new Date();
    await Promise.allSettled(Array.from({ length: 30 }, () => receiveLead(base, { db, ip: 'spammer', now })));
    assert.ok(db.t.people.length <= 3);
    const others = await Promise.allSettled(['a', 'b'].map((ip) => receiveLead(base, { db, ip, now })));
    assert.ok(others.every((r) => r.status === 'fulfilled'));
    // 总数到上限了：再来的不管哪个 IP 都挡
    const flood = await Promise.allSettled(['c', 'd', 'e', 'f', 'g', 'h'].map((ip) => receiveLead(base, { db, ip, now })));
    assert.ok(db.t.inbox.filter((r) => r.outcome !== 'limited').length <= 5);
    assert.ok(flood.some((r) => r.status === 'rejected'));
  } finally {
    Object.assign(LIMITS, saved);
  }
});

test('receiveLead: 带照片的另有低上限；不带照片的照样能送', async () => {
  const db = fakeDb();
  const now = new Date();
  const results = await Promise.allSettled(Array.from({ length: 15 }, () => receiveLead(withCard, { db, ip: '4.4.4.4', now })));
  assert.ok(results.filter((r) => r.status === 'fulfilled').length <= LIMITS.perIpPhotoHour);
  let ok = 0;
  for (let i = 0; i < 12; i += 1) {
    try { await receiveLead(withCard, { db, ip: '5.5.5.5', now }); ok += 1; } catch (e) { assert.equal(e.status, 429); }
  }
  assert.equal(ok, LIMITS.perIpPhotoHour);
  assert.ok(db.uploads.length <= 2 * LIMITS.perIpPhotoHour);
  assert.equal((await receiveLead(base, { db, ip: '5.5.5.5', now })).ok, true);
});

test('receiveLead: Turnstile 有设就要验', async () => {
  process.env.TURNSTILE_SECRET_KEY = 's';
  try {
    const db = fakeDb();
    await assert.rejects(receiveLead(base, { db, ip: 'x' }), (e) => e.status === 403);
    const fetchImpl = async () => ({ json: async () => ({ success: true }) });
    assert.equal((await receiveLead({ ...base, turnstile: 'tok' }, { db, ip: 'x', fetchImpl })).ok, true);
  } finally {
    delete process.env.TURNSTILE_SECRET_KEY;
  }
});

test('receiveLead: 只拍名片 → 存私有照片、AI 读、记费用', async () => {
  const db = fakeDb();
  const out = await receiveLead(withCard, { db, ip: 'x', scan: tanCard });
  assert.equal(out.name, 'Tan Ah Kow');
  assert.equal(db.uploads[0].path.startsWith('owner-1/'), true);
  const p = db.t.people[0];
  assert.equal(p.name, 'Tan Ah Kow');
  assert.equal(p.title, 'Boss');
  assert.equal(p.card_photo_id, db.t.photos[0].id);
  assert.equal(p.whatsapp, '60198887777');
  assert.equal(p.company_id, db.t.companies[0].id);
  assert.doesNotMatch(p.notes, /名片还没读/);
  assert.equal(db.t.photo_people.length, 1);
  assert.equal(db.t.ai_usage[0].feature, 'inbox_card');
  assert.equal(db.t.inbox[0].has_photo, true);
  assert.equal(db.t.inbox[0].payload.name, 'Tan Ah Kow');
});

test('receiveLead: 人先存好才读名片 —— AI 卡住 / 出错，人还在', async () => {
  const db = fakeDb();
  const t0 = Date.now();
  const out = await receiveLead(withCard, { db, ip: 'x', scan: () => new Promise(() => {}), scanMs: 50 });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(out.ok, true);
  assert.equal(db.t.people.length, 1);
  assert.equal(db.t.people[0].name, '（名片待确认）');
  assert.match(db.t.people[0].notes, /AI 读名片/);
  assert.equal(db.t.inbox[0].outcome, 'created');
  const db2 = fakeDb();
  await receiveLead({ ...base, card_image: withCard.card_image }, { db: db2, ip: 'x', scan: async () => { throw new Error('boom'); } });
  assert.equal(db2.t.people[0].name, 'Ali Bin Abu');
  assert.equal(db2.t.interactions.length, 1);
});

test('receiveLead: 拍名片但 AI 没预算 → 照样存，名字待确认', async () => {
  const db = fakeDb({ spent: 999 });
  let called = false;
  await receiveLead(withCard, { db, ip: 'x', scan: async () => { called = true; return {}; } });
  assert.equal(called, false);
  assert.equal(db.t.people[0].name, '（名片待确认）');
  assert.match(db.t.people[0].notes, /AI 读名片/);
});

test('receiveLead: 公开页自己的小额度用完 → 不读（你自己的 AI 额度还在）', async () => {
  let called = false;
  const scan = async () => { called = true; return tanCard(); };
  await receiveLead(withCard, { db: fakeDb({ spent: { all: 1, inbox_card: publicBudgetUsd() } }), ip: 'x', scan });
  assert.equal(called, false);
  await receiveLead(withCard, { db: fakeDb({ spent: { all: 1, inbox_card: 0 } }), ip: 'x', scan });
  assert.equal(called, true);
  assert.ok(publicBudgetUsd() < monthlyBudgetUsd());
});

test('receiveLead: 照片存不了 —— 有名字电话照样收；只有照片的才报错', async () => {
  const db = fakeDb();
  db.uploadPrivate = async () => { throw new Error('storage down'); };
  assert.equal((await receiveLead({ ...base, card_image: withCard.card_image }, { db, ip: 'x' })).ok, true);
  assert.equal(db.t.people[0].card_photo_id, undefined);
  await assert.rejects(receiveLead(withCard, { db, ip: 'y' }));
});

test('loadCard: 本机没设 service role → 示范名片', async () => {
  delete process.env.VERCEL_ENV;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const out = await loadCard({ eventId: 'x' });
  assert.equal(out.inbox, 'demo');
  assert.ok(out.card.name);
});

test('loadCard: 读主人的名片 + 活动', async () => {
  const ev = { id: '11111111-2222-4333-8444-555555555555', name: '商会晚宴', held_on: null, location: 'KL' };
  const db = fakeDb({ profile: { card: { name: 'Wilson', photo_path: 'o/card/me.jpg', form_on: false }, display_name: 'W' }, events: [ev] });
  const out = await loadCard({ eventId: ev.id, deps: { admin: { url: 'https://s.co', ownerId: 'owner-1', client: null }, db } });
  assert.equal(out.card.photo, 'https://s.co/storage/v1/object/public/network-card/o/card/me.jpg');
  assert.equal(out.event.name, '商会晚宴');
  assert.equal(out.inbox, 'off');
});

test('keyHint: 认出贴错的 key（不说出 key 本身）', async () => {
  const { keyHint } = await import('../api/_lib/admin.js');
  const jwt = (o) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(o)).toString('base64url')}.sig`;
  assert.match(keyHint(jwt({ role: 'anon', ref: 'abc' }), 'https://abc.supabase.co'), /anon key/);
  assert.match(keyHint(jwt({ role: 'service_role', ref: 'xyz' }), 'https://abc.supabase.co'), /别的 Supabase project/);
  assert.equal(keyHint(jwt({ role: 'service_role', ref: 'abc' }), 'https://abc.supabase.co'), '');
  assert.equal(keyHint('sb_secret_123'), '');
  assert.match(keyHint('sb_publishable_123'), /publishable/);
  assert.match(keyHint('hello'), /格式不对/);
});
