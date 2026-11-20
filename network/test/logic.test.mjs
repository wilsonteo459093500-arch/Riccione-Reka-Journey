import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toWhatsApp, waLink, pickWhatsApp, findDuplicates, normCompany, findCompany, emailDomain,
  worthScore, worthVerdict, tierCounts, initials, splitTags, matchPerson, monthUsage,
  isSharedPhone, isSharedEmail, mergePersonPatch,
} from '../src/lib/logic.js';

test('toWhatsApp: 马来西亚号码各种写法', () => {
  assert.equal(toWhatsApp('012-345 6789'), '60123456789');
  assert.equal(toWhatsApp('+60 12-345 6789'), '60123456789');
  assert.equal(toWhatsApp('60123456789'), '60123456789');
  assert.equal(toWhatsApp('123456789'), '60123456789'); // 少打了 0
  assert.equal(toWhatsApp('+65 9123 4567'), '6591234567');
  assert.equal(toWhatsApp('0065 9123 4567'), '6591234567');
  assert.equal(toWhatsApp(''), '');
  assert.equal(waLink('012-3456789', '你好'), 'https://wa.me/60123456789?text=%E4%BD%A0%E5%A5%BD');
  assert.equal(waLink(''), '');
});

test('pickWhatsApp: whatsapp > mobile > 第一个', () => {
  assert.equal(pickWhatsApp([{ label: 'office', number: '03-1234 5678' }, { label: 'mobile', number: '012-111 2222' }]), '60121112222');
  assert.equal(pickWhatsApp([{ label: 'mobile', number: '012-111 2222' }, { label: 'whatsapp', number: '+60 16-333 4444' }]), '60163334444');
  assert.equal(pickWhatsApp([]), '');
});

test('normCompany: 去掉 Sdn Bhd 之类的尾巴', () => {
  assert.equal(normCompany('ABC Interior Sdn. Bhd.'), normCompany('abc interior sdn bhd'));
  assert.equal(normCompany('ABC Interior (M) Sdn Bhd'), normCompany('ABC Interior'));
  assert.equal(normCompany('溪岸家具有限公司'), normCompany('溪岸家具'));
  const cos = [{ id: 'c1', name: 'Mega Build Holdings Berhad', name_alt: '' }];
  assert.equal(findCompany(cos, 'MEGA BUILD').id, 'c1');
  assert.equal(findCompany(cos, 'Mega Paint'), null);
});

test('emailDomain: 不算免费邮箱', () => {
  assert.equal(emailDomain(['a@gmail.com', 'b@megabuild.com.my']), 'megabuild.com.my');
  assert.equal(emailDomain(['a@yahoo.com.my']), '');
});

test('findDuplicates: 电话 / 邮箱 / 名字', () => {
  const people = [
    { id: 'p1', name: 'Tan Ah Kow', phones: [{ number: '+60 12-345 6789' }], emails: [], company_id: 'c1' },
    { id: 'p2', name: 'Lim Mei Ling', phones: [], emails: ['mei@x.com'] },
    { id: 'p3', name: 'Dato\' Tan Ah Kow', phones: [], emails: [] },
  ];
  const companies = [{ id: 'c1', name: 'ABC Sdn Bhd' }];
  const r1 = findDuplicates({ name: 'Someone', phones: [{ number: '012 345 6789' }], emails: [] }, people, companies);
  assert.deepEqual(r1.map((x) => x.person.id), ['p1']);
  assert.ok(r1[0].strong);
  const r2 = findDuplicates({ name: 'X', phones: [], emails: ['MEI@x.com'] }, people);
  assert.equal(r2[0].person.id, 'p2');
  const r3 = findDuplicates({ name: 'Tan Ah Kow', company: 'ABC', phones: [], emails: [] }, people, companies);
  assert.deepEqual(r3.map((x) => x.person.id).sort(), ['p1', 'p3']);
  assert.ok(r3.find((x) => x.person.id === 'p1').reasons.includes('名字和公司都一样'));
  assert.equal(findDuplicates({ name: 'Nobody', phones: [], emails: [] }, people).length, 0);
});

test('isSharedPhone / isSharedEmail: 公司总机、热线、info@ 认得出来', () => {
  assert.equal(isSharedPhone('012-345 6789'), false);
  assert.equal(isSharedPhone('+60 11-2345 6789'), false);
  assert.equal(isSharedPhone('03-7890 1234'), true);
  assert.equal(isSharedPhone('+603 7890 1234'), true);
  assert.equal(isSharedPhone('1300-88-1234'), true);
  assert.equal(isSharedPhone('1-800-22-8888'), true);
  assert.equal(isSharedPhone('+65 9123 4567'), false);           // 外国号码看不出来 → 当手机
  assert.equal(isSharedPhone('+65 6123 4567', 'office'), true);  // 名片上写 office
  assert.equal(isSharedEmail('info@abc.com.my'), true);
  assert.equal(isSharedEmail('Sales@abc.com.my'), true);
  assert.equal(isSharedEmail('tan@abc.com.my'), false);
});

test('findDuplicates: 同公司两个人共用总机 / info@ → 不算同一个人（只是提示）', () => {
  const people = [{ id: 'p1', name: 'Tan Ah Kow', phones: [{ label: 'office', number: '03-7890 1234' }, { label: 'mobile', number: '012-111 2222' }], emails: ['info@abc.my', 'tan@abc.my'] }];
  const lim = { name: 'Lim Mei Ling', phones: [{ label: 'office', number: '+603-7890 1234' }, { label: 'mobile', number: '019-333 4444' }], emails: ['info@abc.my'] };
  const r = findDuplicates(lim, people);
  assert.equal(r.length, 1);
  assert.equal(r[0].strong, false);
  assert.deepEqual(r[0].reasons, ['公司电话一样', '公司公用邮箱一样']);
  // 总机没写 label 也认得出来（03 开头）
  assert.equal(findDuplicates({ name: 'X', phones: [{ number: '03 7890 1234' }], emails: [] }, people)[0].strong, false);
  // 手机 / 个人邮箱一样 → 还是同一个人
  assert.equal(findDuplicates({ name: 'X', phones: [{ number: '+60121112222' }], emails: [] }, people)[0].strong, true);
  assert.equal(findDuplicates({ name: 'X', phones: [], emails: ['TAN@abc.my'] }, people)[0].strong, true);
});

test('mergePersonPatch: 只补空的、加新电话邮箱标签、留言接后面；不改名字', () => {
  const into = { id: 'p1', name: '陈先生', title: '', phones: [{ label: 'mobile', number: '0123456789' }], emails: [], tags: ['商会'], notes: '老客户', company_id: null };
  const from = {
    id: 'n1', name: 'Tan', title: 'Director', company_id: 'c9', whatsapp: '60123456789',
    phones: [{ label: 'whatsapp', number: '+60 12-345 6789' }, { label: 'office', number: '03-111 2222' }],
    emails: ['tan@mega.my'], tags: ['扫码'], notes: '【他留的话】想做厨房\n名片还没读：在「新朋友」按「AI 读名片」',
  };
  const patch = mergePersonPatch(into, from);
  assert.equal(patch.name, undefined);
  assert.equal(patch.title, 'Director');
  assert.equal(patch.company_id, 'c9');
  assert.equal(patch.whatsapp, '60123456789');
  assert.deepEqual(patch.phones.map((p) => p.number), ['0123456789', '03-111 2222']);
  assert.deepEqual(patch.emails, ['tan@mega.my']);
  assert.deepEqual(patch.tags, ['商会', '扫码']);
  assert.equal(patch.notes, '老客户\n【他留的话】想做厨房');
  // 旧的是「名片待确认」→ 用新的名字
  assert.equal(mergePersonPatch({ name: '（名片待确认）' }, { name: 'Ali' }).name, 'Ali');
  // 没东西补
  assert.deepEqual(mergePersonPatch(into, { name: 'x', phones: [{ number: '012 345 6789' }] }), {});
});

test('worthScore: 4 维度平均 × 10，超出范围会夹住', () => {
  assert.equal(worthScore(null), null);
  assert.equal(worthScore({ dims: { business: { score: 8 }, connector: { score: 6 }, has_what_i_lack: { score: 4 }, i_can_help: { score: 2 } } }), 50);
  assert.equal(worthScore({ dims: { business: { score: 15 }, connector: { score: 10 }, has_what_i_lack: { score: 10 }, i_can_help: { score: 10 } } }), 100);
  assert.equal(worthScore({ dims: {} }), 0);
  assert.equal(worthVerdict(75).tone, 'high');
  assert.equal(worthVerdict(null).tone, 'none');
});

test('tierCounts: 超过上限会标出来', () => {
  const people = Array.from({ length: 6 }, () => ({ tier: 'core' })).concat([{ tier: 'weird' }]);
  const c = tierCounts(people);
  assert.equal(c.find((t) => t.key === 'core').count, 6);
  assert.ok(c.find((t) => t.key === 'core').over);
  assert.equal(c.find((t) => t.key === 'known').count, 1);
});

test('initials / splitTags / matchPerson', () => {
  assert.equal(initials('陈大文'), '大文');
  assert.equal(initials('Dato\' Lee Chong Wei'), 'LC');
  assert.equal(initials(''), '?');
  assert.deepEqual(splitTags('发展商，高尔夫、 发展商;\n'), ['发展商', '高尔夫']);
  const v = { name: 'Tan', company: { name: 'Mega Build' }, tags: ['发展商'], resources: [{ label: '工地' }], circles: [{ name: '雪隆中华总商会' }] };
  assert.ok(matchPerson(v, 'mega 工地'));
  assert.ok(matchPerson(v, '总商会'));
  assert.ok(!matchPerson(v, 'golf'));
});

test('monthUsage: 只算这个月', () => {
  const now = new Date('2026-11-16T10:00:00Z');
  const rows = [
    { at: '2026-11-01T00:00:00Z', feature: 'scan_card', cost_usd: 0.01 },
    { at: '2026-11-15T00:00:00Z', feature: 'assess', cost_usd: 0.1 },
    { at: '2026-10-31T23:00:00Z', feature: 'assess', cost_usd: 5 },
  ];
  const u = monthUsage(rows, now, 4);
  assert.equal(u.count, 2);
  assert.ok(Math.abs(u.myr - 0.44) < 1e-9);
  assert.equal(u.byFeature.assess.count, 1);
});
