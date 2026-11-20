// 体检第 4 阶段：把现有人脉搬进来 —— 读档、称呼、电话、查重、「今日」不会一次跳出几百人
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVCard, parseCSV, csvToContacts, groupMembers, membersToContacts, prepareCandidates, filterCandidates,
  staggerDue, toPersonRow, cleanPhones, phoneKind, prettyPhone, cleanBirthday, pickerToContacts, STAGGER_DAYS,
} from '../src/lib/importer.js';
import { guessSalutation, salutationOf, greeting } from '../src/lib/salute.js';
import { toWhatsApp, pickWhatsApp, isSharedPhone } from '../src/lib/logic.js';
import { relationOf, todayActions } from '../src/lib/relation.js';

const D = 86400000;
const NOW = Date.parse('2026-11-20T04:00:00Z');

/* ---------- 称呼 ---------- */
test('称呼：体检时叫错的几个都对了', () => {
  assert.equal(guessSalutation('Datuk Seri Ahmad Zahid'), 'Datuk Seri Zahid'); // 以前「Hi Seri」
  assert.equal(guessSalutation("Dato' Lim Kok Wing"), "Dato' Lim");            // 以前「Hi Lim」
  assert.equal(guessSalutation('Tan Ah Kow'), 'Ah Kow');                       // 以前「Hi Tan」
});

test('称呼：华人 / 马来 / 印度 / 英文名 / 中文名', () => {
  const cases = {
    'Jason Tan Ah Kow': 'Jason',
    '林国荣': '国荣',
    '李明': '李明',
    'Lim Kok Wing 林国荣': '国荣',
    'Muhammad Hafiz bin Ali': 'Hafiz',
    'Mohd Najib bin Abdul Razak': 'Najib',
    'Abdul Rahman bin Yusof': 'Abdul Rahman',
    'Haji Ahmad bin Ali': 'Ahmad',
    'Ramesh a/l Kumar': 'Ramesh',
    'S. Ramesh': 'Ramesh',
    'Tan Sri Vincent Tan': 'Tan Sri Vincent',
    "Tan Sri Dato' Sri Dr. Ng Yen Yen": 'Tan Sri Ng',
    'Dr. Jason Tan': 'Dr Tan',
    'Ir. Wong Kah Wai': 'Ir Wong',
    'Mr Lim': 'Mr Lim',
    'Ah Meng 修车': 'Ah Meng',
    'Jason (ABC Trading)': 'Jason',
    'Ali - JCI Muar': 'Ali',
    '拿督林国荣': '拿督林',
    'Wilson Teo': 'Wilson',
  };
  for (const [name, want] of Object.entries(cases)) assert.equal(guessSalutation(name), want, name);
});

test('称呼：本人存的优先；只有号码的人不乱叫', () => {
  assert.equal(salutationOf({ name: 'Lim Kok Wing', salutation: '林总' }), '林总');
  assert.equal(salutationOf({ name: 'Lim Kok Wing', salutation: '' }), 'Kok Wing');
  assert.equal(guessSalutation('+60 12-345 6789'), '');
  assert.equal(greeting({ name: '+60 12-345 6789' }), 'Hi，');
  assert.equal(greeting({ name: "Dato' Lim Kok Wing" }), "Hi Dato' Lim，");
});

/* ---------- 电话格式 ---------- */
test('电话：(0)、热线、分机号', () => {
  assert.equal(toWhatsApp('+60 (0)12-345 6789'), '60123456789');   // 以前多一个 0
  assert.equal(toWhatsApp('1300-88-1234'), '');                    // 热线没有 WhatsApp
  assert.equal(toWhatsApp('+60 1300 88 1234'), '');
  assert.equal(toWhatsApp('1-800-22-8888'), '');
  assert.equal(toWhatsApp('012-345 6789 ext 12'), '60123456789');  // 分机号不接在后面
  assert.equal(toWhatsApp('03-1234 5678 x3'), '60312345678');
  assert.equal(isSharedPhone('+60 1300 88 1234'), true);
  // 座机 / 热线不会被挑成 WhatsApp
  assert.equal(pickWhatsApp([{ label: '', number: '1300 88 1234' }, { label: '', number: '016-222 3333' }]), '60162223333');
  assert.equal(pickWhatsApp([{ label: 'office', number: '03-1234 5678' }]), '');
  assert.equal(pickWhatsApp([{ label: '', number: '+65 9123 4567' }]), '6591234567'); // 外国号码看不出来，照挑
  assert.equal(phoneKind('012-345 6789'), 'mobile');
  assert.equal(phoneKind('03-1234 5678'), 'landline');
  assert.equal(phoneKind('1300 88 1234'), 'hotline');
  assert.equal(prettyPhone('0123456789'), '+60 12-345 6789');
  const cleaned = cleanPhones([{ label: 'Mobile', number: '03-8888 1111' }, { label: 'CELL', number: '+60 (0)12-345 6789' }, { label: '', number: '012 345 6789' }, { label: 'WORK', number: '03-1234 5678 ext 12' }]);
  assert.deepEqual(cleaned, [
    { label: 'office', number: '03-8888 1111' },          // 标「手机」的座机
    { label: 'mobile', number: '+60 12-345 6789' },
    { label: 'office', number: '03-1234 5678' },          // 同一个手机号只留一个；分机号去掉
  ]);
});

/* ---------- vCard ---------- */
const VCF = `BEGIN:VCARD
VERSION:2.1
N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E6=9E=97;=E5=9B=BD=E8=8D=A3;;;
FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E6=9E=97=E5=9B=BD=E8=8D=A3
TEL;CELL:+60 (0)12-345 6789
TEL;WORK:03-1234 5678
END:VCARD
BEGIN:VCARD
VERSION:3.0
N:Lim;Kok Wing;;Dato';
FN:Dato' Lim Kok Wing
ORG:ABC Holdings Sdn Bhd;Sales
TITLE:Managing Director
item1.TEL;type=pref:016-222 3333
item1.X-ABLabel:WhatsApp
EMAIL;type=INTERNET;type=WORK:LIM@abc.com.my
NOTE:JCI Muar\\, 2019\\nlikes durian
BDAY:1604-03-15
END:VCARD
BEGIN:VCARD
VERSION:4.0
N:Teo;Wilson;;;
TEL;TYPE=cell;VALUE=uri:tel:+60-19-888-7777
NOTE:a long note that is
  folded onto the next line
END:VCARD
BEGIN:VCARD
VERSION:3.0
N:;;;;
END:VCARD
`;

test('vCard：Android（中文 QUOTED-PRINTABLE）/ iPhone（item 标签、没年份的生日）/ 折行', () => {
  const v = parseVCard(VCF);
  assert.equal(v.length, 3); // 空的那张不算
  assert.equal(v[0].name, '林国荣');
  assert.deepEqual(v[0].phones.map((p) => p.label), ['CELL', 'WORK']);
  assert.equal(v[1].name, "Dato' Lim Kok Wing");
  assert.equal(v[1].company, 'ABC Holdings Sdn Bhd · Sales');
  assert.equal(v[1].title, 'Managing Director');
  assert.equal(v[1].phones[0].label, 'WhatsApp');
  assert.deepEqual(v[1].emails, ['lim@abc.com.my']);
  assert.equal(v[1].notes, 'JCI Muar, 2019\nlikes durian');
  assert.equal(v[1].birthday, '--03-15');
  assert.equal(v[2].name, 'Wilson Teo'); // 没有 FN → 用 N 拼
  assert.equal(v[2].phones[0].number, '+60-19-888-7777');
  assert.equal(v[2].notes, 'a long note that is folded onto the next line');
});

test('生日格式', () => {
  assert.equal(cleanBirthday('19800315'), '1980-03-15');
  assert.equal(cleanBirthday('1980-03-15T00:00:00Z'), '1980-03-15');
  assert.equal(cleanBirthday('--0315'), '--03-15');
  assert.equal(cleanBirthday('15/3/1980'), '1980-03-15');
  assert.equal(cleanBirthday('soon'), '');
});

/* ---------- CSV ---------- */
test('CSV：Google 通讯录（一格几个号码、标签）', () => {
  const csv = 'First Name,Middle Name,Last Name,Organization Name,Organization Title,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value,Phone 2 - Label,Phone 2 - Value,Labels\n'
    + 'Ahmad,,Zahid,Kerajaan,,zahid@gov.my,Mobile,019-888 7777 ::: 03-8888 1111,Work,1300 88 1234,* myContacts ::: JCI\n'
    + '"Wong, Jr",,Kah Wai,"Wong & Sons, Bhd",Director,,Mobile,+65 9123 4567,,,\n';
  const c = csvToContacts(parseCSV(csv));
  assert.equal(c.length, 2);
  assert.equal(c[0].name, 'Ahmad Zahid');
  assert.equal(c[0].phones.length, 3);
  assert.deepEqual(c[0].tags, ['JCI']);
  assert.deepEqual(c[0].emails, ['zahid@gov.my']);
  assert.equal(c[1].company, 'Wong & Sons, Bhd'); // 引号里的逗号
});

test('CSV：自己写的中文表头、分号分隔、BOM', () => {
  const csv = '﻿姓名;公司;职位;手机;邮箱;备注;标签\n陈大文;大文贸易;老板;012-111 2222;tan@x.com;商会认识;商会，JCI\n';
  const c = csvToContacts(parseCSV(csv));
  assert.deepEqual(c[0], {
    name: '陈大文', title: '老板', company: '大文贸易', phones: [{ label: '手机', number: '012-111 2222' }], emails: ['tan@x.com'],
    notes: '商会认识', birthday: '', tags: ['商会', 'JCI'],
  });
  // 分开写「姓」「名」的中文名不加空格
  const c2 = csvToContacts(parseCSV('姓,名,手机\n林,国荣,016-333 4444\n'));
  assert.equal(c2[0].name, '林国荣');
});

/* ---------- WhatsApp 群 ---------- */
const CHAT = `17/11/2026, 10:00 - Messages and calls are end-to-end encrypted.
17/11/2026, 10:00 - Wilson created group "JCI Muar 2026"
17/11/2026, 10:01 - Wilson added +60 12-111 2222, Ah Meng and +60 13-333 4444
17/11/2026, 10:02 - +60 19-555 6666 joined using this group's invite link
17/11/2026, 10:03 - Wilson: Welcome all!
17/11/2026, 10:04 - +60 12-111 2222: Thanks
17/11/2026, 10:04 - +60 12-111 2222: see you
17/11/2026, 10:05 - Ah Meng: 👍
17/11/2026, 10:06 - +60 13-333 4444 left
17/11/2026, 10:07 - ~ Kumar: hi all
`;

test('WhatsApp 群：发言的人 + 被加 / 用链接进群的人；自己不算；退群的标出来', () => {
  const { group, members } = groupMembers(CHAT, 'WhatsApp Chat with JCI.txt', { meNames: ['Wilson'] });
  assert.equal(group, 'JCI Muar 2026');
  const by = Object.fromEntries(members.map((m) => [m.name || m.number, m]));
  assert.equal(Object.keys(by).length, 5);
  assert.equal(by['+60 12-111 2222'].count, 2);
  assert.equal(by['Ah Meng'].count, 1);
  assert.equal(by['+60 19-555 6666'].joined, true);
  assert.equal(by['+60 13-333 4444'].left, true);
  assert.equal(by.Kumar.count, 1);  // 「~ Kumar」：没存的人
  assert.ok(!by.Wilson);
  assert.equal(members[members.length - 1].number, '+60 13-333 4444'); // 退群的排最后
});

test('WhatsApp 群：中文系统讯息', () => {
  const chat = `2026/11/17 下午3:05 - 你创建了群组“商会理事”
2026/11/17 下午3:05 - 你添加了+60 12-111 2222、陈大文
2026/11/17 下午3:06 - +60 16-777 8888 已通过此群组的邀请链接加入
2026/11/17 下午3:07 - 陈大文: 大家好
`;
  const { group, members } = groupMembers(chat, '');
  assert.equal(group, '商会理事');
  assert.deepEqual(members.map((m) => m.name || m.number).sort(), ['+60 12-111 2222', '+60 16-777 8888', '陈大文'].sort());
});

/* ---------- 清单 ---------- */
const PEOPLE = [
  { id: 'p1', name: 'Tan Ah Kow', phones: [{ label: 'mobile', number: '012-345 6789' }], emails: [] },
  { id: 'p2', name: 'Ah Meng', phones: [], emails: [] },
  { id: 'p3', name: 'Lee Chong', phones: [{ label: 'office', number: '03-1234 5678' }], emails: [] },
];

test('清单：档案里重复的人并成一个；已在 SPACE 的灰掉；公司总机一样不算同一人', () => {
  const list = prepareCandidates([
    { name: 'Tan AK', phones: [{ label: 'CELL', number: '+60 12-345 6789' }] },             // 跟 p1 同手机
    { name: 'Siti', phones: [{ label: 'CELL', number: '019-000 1111' }], emails: ['siti@x.my'] },
    { name: 'Siti Aminah', phones: [], emails: ['SITI@x.my'], title: 'HR' },               // 同邮箱 → 并进上一个
    { name: 'Lee Wei', phones: [{ label: 'WORK', number: '03-1234 5678' }] },              // 跟 p3 同总机 → 不算同一人
  ], { people: PEOPLE, source: 'vcf' });
  assert.equal(list.length, 3);
  assert.equal(list[0].existing.id, 'p1');
  assert.equal(list[1].name, 'Siti');
  assert.equal(list[1].title, 'HR');
  assert.equal(list[1].whatsapp, '60190001111');
  assert.equal(list[2].existing, null);
  assert.equal(list[2].maybe.id, 'p3'); // 只是提醒你看一下
  assert.ok(list.every((c) => !c.checked)); // 通讯录：默认都不勾，你自己挑
});

test('清单：WhatsApp 群默认勾好有号码 / 有名字的；只有名字一样的当作已在 SPACE；退群的不勾', () => {
  const { group, members } = groupMembers(CHAT, '', { meNames: ['Wilson'] });
  const list = prepareCandidates(membersToContacts(members, group), { people: PEOPLE, source: 'whatsapp' });
  const by = Object.fromEntries(list.map((c) => [c.name || c.whatsapp, c]));
  assert.equal(by['Ah Meng'].existing.id, 'p2');
  assert.equal(by['60121112222'].checked, true);
  assert.equal(by['60133334444'].checked, false); // 退群
  assert.deepEqual(by['60121112222'].tags, ['JCI Muar 2026']);
});

test('清单筛选：搜名字 / 电话、只看有手机号、隐藏已在 SPACE', () => {
  const list = prepareCandidates([
    { name: 'Siti', company: 'ABC', phones: [{ number: '019-000 1111' }] },
    { name: 'Office', phones: [{ number: '03-9999 0000' }] },
    { name: 'Tan', phones: [{ number: '012-345 6789' }] },
  ], { people: PEOPLE });
  assert.deepEqual(filterCandidates(list).map((c) => c.name), ['Siti', 'Office']);
  assert.deepEqual(filterCandidates(list, { mobileOnly: true }).map((c) => c.name), ['Siti']);
  assert.deepEqual(filterCandidates(list, { q: 'abc' }).map((c) => c.name), ['Siti']);
  assert.deepEqual(filterCandidates(list, { q: '9999' }).map((c) => c.name), ['Office']);
  assert.deepEqual(filterCandidates(list, { hideExisting: false }).map((c) => c.name), ['Siti', 'Office', 'Tan']);
});

test('Android 选联系人的结果', () => {
  assert.deepEqual(pickerToContacts([{ name: ['Ali'], tel: ['012-111 2222'], email: ['A@B.com'] }, { name: [], tel: [] }]),
    [{ name: 'Ali', phones: [{ label: '', number: '012-111 2222' }], emails: ['a@b.com'], notes: '' }]);
});

/* ---------- 「今日」不会一次跳出几百人 ---------- */
test('第一次提醒日：300 人分散在 120 天，每天 2–3 人；第二晚再导入也补在人少的日子', () => {
  const a = staggerDue(300, [], { now: NOW });
  const count = (arr) => { const m = new Map(); arr.forEach((d) => m.set(d, (m.get(d) || 0) + 1)); return m; };
  const m = count(a);
  assert.equal(m.size, STAGGER_DAYS);
  assert.ok(Math.max(...m.values()) <= 3 && Math.min(...m.values()) >= 2);
  assert.ok(a.every((d) => d > '2026-11-20' && d <= '2027-03-20'));
  // 只导入 10 人：不会都挤在头几天
  const few = staggerDue(10, [], { now: NOW });
  assert.equal(new Set(few).size, 10);
  assert.ok(few[9] > '2027-02-01');
  // 第二晚 60 人：先补满第一晚只有 2 人的日子
  const b = staggerDue(60, a, { now: NOW });
  const both = count([...a, ...b]);
  assert.ok(Math.max(...both.values()) - Math.min(...both.values()) <= 1);
});

test('导入的人：不算「刚认识」，到第一次提醒日才出现在「今日」', () => {
  const created = new Date(NOW).toISOString();
  const mk = (id, firstDue, extra = {}) => ({
    id, name: `P${id}`, tier: 'known', created_at: created, met_on: null, import_source: 'vcf', first_due: firstDue, interactions: [], ...extra,
  });
  const people = [mk('1', '2026-11-21'), mk('2', '2026-12-20'), mk('3', '2027-03-19')];
  // 导入当天：没有人（以前 300 人全是「刚认识，48 小时内跟进」）
  assert.equal(todayActions(people, { now: NOW + 3600000 }).length, 0);
  // 第二天：只有第一个
  const day2 = todayActions(people, { now: Date.parse('2026-11-21T02:00:00Z') });
  assert.deepEqual(day2.map((x) => x.person.id), ['1']);
  assert.match(day2[0].reasons[0].text, /从通讯录导入的/);
  // 第 121 天：不会 300 人一起到期 —— 每个人照自己的日子
  const rel3 = relationOf(people[2], [], Date.parse('2027-03-01T02:00:00Z'));
  assert.equal(rel3.overdue, false);
  assert.ok(relationOf(people[2], [], Date.parse('2027-03-19T02:00:00Z')).overdue);
  // 升到「核心」（每 2 周）：不用等到 3 月，两星期内就提醒
  const core = relationOf({ ...people[2], tier: 'core' }, [], NOW + 15 * D);
  assert.equal(core.overdue, true);
  // 联系过之后就照平常算
  const after = relationOf(people[2], [{ kind: 'message', occurred_at: new Date(NOW + 10 * D).toISOString() }], NOW + 20 * D);
  assert.equal(after.daysSince, 10);
  // 自己扫名片的人照旧是「刚认识」
  const scanned = todayActions([{ ...mk('9', null), import_source: '' }], { now: NOW + 3600000 });
  assert.equal(scanned[0].reasons[0].kind, 'new');
});

test('建人：圈层「认识」、标签合并、称呼跟猜的一样就不存', () => {
  const [c] = prepareCandidates([{ name: "Dato' Lim Kok Wing", phones: [{ number: '016-222 3333' }], tags: ['JCI'] }], { people: [] });
  const row = toPersonRow({ ...c }, { source: 'whatsapp', tags: ['JCI', '商会'], howMet: 'WhatsApp 群：JCI', firstDue: '2026-12-01' });
  assert.equal(row.tier, 'known');
  assert.deepEqual(row.tags, ['JCI', '商会']);
  assert.equal(row.salutation, '');
  assert.equal(row.whatsapp, '60162223333');
  assert.equal(row.import_source, 'whatsapp');
  assert.equal(row.first_due, '2026-12-01');
  assert.equal(row.pending_review, false);
  assert.equal(toPersonRow({ ...c, salutation: '林总' }).salutation, '林总');
  // 没存名字的群成员：用号码当名字
  const [n] = prepareCandidates([{ name: '', phones: [{ number: '+60 12-111 2222' }] }], { people: [] });
  assert.equal(toPersonRow(n).name, '+60 12-111 2222');
});
