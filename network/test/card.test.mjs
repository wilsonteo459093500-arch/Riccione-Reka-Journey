import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanCard, publicCard, toVCard, greeting, cleanLead, LeadError, fillLeadFromCard, findExisting,
  leadToPerson, mergeLeadInto, safeUrl, safePath, cardLink, cleanSource, klDate, cardReady,
} from '../src/lib/card.js';
import { receiveLead, LIMITS } from '../api/inbox.js';
import { loadCard } from '../api/card.js';
import { ipHash } from '../api/_lib/admin.js';

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
  assert.deepEqual(c.socials, [{ platform: 'instagram', url: 'https://instagram.com/x' }]);
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

test('fillLeadFromCard + findExisting + merge', () => {
  const lead = fillLeadFromCard({ name: '', phone: '', company: '', title: '', email: '', met_where: '', note: '' }, {
    name: 'Tan', company: 'Mega Sdn Bhd', title: 'Director', emails: ['tan@mega.my'], phones: [{ label: 'office', number: '03-111 2222' }, { label: 'whatsapp', number: '+60 12-345 6789' }],
  });
  assert.equal(lead.name, 'Tan');
  assert.equal(lead.phone, '+60 12-345 6789');
  const people = [{ id: 'p1', name: '陈先生', phones: [{ label: 'mobile', number: '0123456789' }], emails: [], tags: ['商会'] }, { id: 'p2', name: 'Tan', phones: [], emails: [] }];
  assert.equal(findExisting(lead, people).id, 'p1');                       // 电话末 9 码一样
  assert.equal(findExisting({ ...lead, phone: '', extra: {} }, people), null); // 名字一样不算
  const patch = mergeLeadInto(people[0], { ...lead, note: '想做厨房' });
  assert.equal(patch.title, 'Director');
  assert.deepEqual(patch.emails, ['tan@mega.my']);
  assert.equal(patch.phones.length, 2);                                      // 加了 office，WhatsApp 那个已经有
  assert.deepEqual(patch.tags, ['商会', '扫码']);
  assert.match(patch.notes, /扫码留言】想做厨房/);
  assert.equal(patch.name, undefined);                                       // 不改名字
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
function fakeDb(seed = {}) {
  const t = { people: [], companies: [], photos: [], photo_people: [], interactions: [], inbox: [], attendance: [], ai_usage: [], events: [], ...seed };
  let n = 0;
  const uploads = [];
  return {
    t, uploads, ownerId: 'owner-1',
    async profileCard() { return seed.profile || null; },
    async event(id) { return t.events.find((e) => e.id === id) || null; },
    async countInbox({ sinceIso, ip }) { return t.inbox.filter((r) => r.at >= sinceIso && (!ip || r.ip_hash === ip)).length; },
    async people() { return t.people; },
    async companies() { return t.companies; },
    async insert(table, row) { const r = { id: row.id || `id${++n}`, owner: 'owner-1', ...row }; t[table].push(r); return r; },
    async update(table, id, patch) { const r = t[table].find((x) => x.id === id); Object.assign(r, patch); return r; },
    async attend(event_id, person_id) { if (!t.attendance.some((a) => a.event_id === event_id && a.person_id === person_id)) t.attendance.push({ event_id, person_id }); },
    async spentUsd() { return seed.spent || 0; },
    async uploadPrivate(path, buf, type) { uploads.push({ path, size: buf.length, type }); },
  };
}
const base = { name: 'Ali Bin Abu', phone: '012-345 6789', company: 'Mega Build Sdn Bhd', consent: true, ms: 9000 };

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
  assert.equal(db.t.inbox[0].outcome, 'created');
  assert.equal(db.t.inbox[0].ip_hash, ipHash('1.2.3.4'));
  assert.equal(db.t.inbox[0].consent_version, 'pdpa-2026-11');
  assert.notEqual(db.t.inbox[0].ip_hash, '1.2.3.4');
});

test('receiveLead: 已经存过（电话一样）→ 只补资料，不重复建；回应跟新建一样', async () => {
  const db = fakeDb({ people: [{ id: 'p1', name: '阿里', title: '', phones: [{ label: 'mobile', number: '+60123456789' }], emails: [], tags: [], notes: '' }], companies: [{ id: 'c1', name: 'Mega Build' }] });
  const out = await receiveLead({ ...base, title: 'Director' }, { db, ip: '1.1.1.1' });
  assert.equal(out.ok, true);
  assert.equal(db.t.people.length, 1);
  assert.equal(db.t.people[0].name, '阿里');
  assert.equal(db.t.people[0].title, 'Director');
  assert.equal(db.t.inbox[0].outcome, 'updated');
  assert.equal(db.t.companies.length, 1);
});

test('receiveLead: 活动模式 → 出席；别人的活动 id 不算', async () => {
  const ev = { id: '11111111-2222-4333-8444-555555555555', name: 'BNI 早餐会', held_on: '2026-11-20' };
  const db = fakeDb({ events: [ev] });
  await receiveLead({ ...base, event: ev.id }, { db, ip: '1.1.1.1' });
  assert.equal(db.t.attendance.length, 1);
  assert.equal(db.t.people[0].how_met, 'BNI 早餐会');
  assert.match(db.t.interactions[0].title, /BNI/);
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

test('receiveLead: 没勾同意 → 400；同 IP 太多次 → 429', async () => {
  const db = fakeDb();
  await assert.rejects(receiveLead({ ...base, consent: false }, { db, ip: 'x' }), (e) => e.status === 400 && e.body.error === 'consent_required');
  const now = new Date();
  for (let i = 0; i < LIMITS.perIpHour; i += 1) db.t.inbox.push({ at: now.toISOString(), ip_hash: ipHash('9.9.9.9') });
  await assert.rejects(receiveLead(base, { db, ip: '9.9.9.9', now }), (e) => e.status === 429);
  assert.equal((await receiveLead(base, { db, ip: '8.8.8.8', now })).ok, true); // 别的 IP 不受影响
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
  const scan = async () => ({
    card: { is_business_card: true, name: 'Tan Ah Kow', company: 'Mega', title: 'Boss', phones: [{ label: 'mobile', number: '019-888 7777' }], emails: ['tan@mega.my'] },
    usage: { feature: 'scan_card', model: 'claude-haiku-5-5', cost_usd: 0.001 },
  });
  const out = await receiveLead({ consent: true, ms: 5000, card_image: { media_type: 'image/png', data: PNG } }, { db, ip: 'x', scan });
  assert.equal(out.name, 'Tan Ah Kow');
  assert.equal(db.uploads[0].path.startsWith('owner-1/'), true);
  const p = db.t.people[0];
  assert.equal(p.card_photo_id, db.t.photos[0].id);
  assert.equal(p.whatsapp, '60198887777');
  assert.equal(db.t.photo_people.length, 1);
  assert.equal(db.t.ai_usage[0].feature, 'inbox_card');
});

test('receiveLead: 拍名片但 AI 没预算 → 照样存，名字待确认', async () => {
  const db = fakeDb({ spent: 999 });
  let called = false;
  await receiveLead({ consent: true, ms: 5000, card_image: { media_type: 'image/png', data: PNG } }, { db, ip: 'x', scan: async () => { called = true; return {}; } });
  assert.equal(called, false);
  assert.equal(db.t.people[0].name, '（名片待确认）');
  assert.match(db.t.people[0].notes, /AI 读名片/);
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
