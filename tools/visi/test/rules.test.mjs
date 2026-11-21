// VISI 第 2a 阶段：发给客户的字、名字、号码都对。跑法：node --test tools/visi/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadVisi } from './load.mjs';

const NOW = new Date(2026, 10, 20, 10, 0, 0);   // 假的「今天」：2026-11-20（星期五）
const MB = loadVisi({ now: NOW });
const plain = (o) => JSON.parse(JSON.stringify(o));   // vm 里建的物件换成这边的，deepEqual 才比得了

test('需求卡：客户在「最想解决」里写「WhatsApp：…」不会盖掉电话', () => {
  const b = MB.parseBrief(['姓名：陈志明', 'WhatsApp：012-345 6789', '最想解决：厨房太小',
    'WhatsApp：晚上才回', '预算：不想超过 80k', '预算带：RM 50k–80k'].join('\n'));
  assert.equal(b.wa, '012-345 6789');
  assert.match(b.pain, /WhatsApp：晚上才回/);
  assert.match(b.pain, /预算：不想超过 80k/);
  assert.equal(b.budget, 'RM 50k–80k');   // 排在后面的真栏位照样认得
});

test('需求卡：英文卡一样不会被盖掉', () => {
  const b = MB.parseBrief('Name: John\nWhatsApp: 0123456789\nMost want to solve: Kitchen too small\nWhatsApp: only after 8pm\nBudget range: 50k');
  assert.equal(b.wa, '0123456789');
  assert.equal(b.budget, '50k');
  assert.match(b.pain, /only after 8pm/);
});

test('楼盘名字：楼盘和镇区分对', () => {
  const prop = (s) => plain(MB.briefToSetup({ project: s }).property);
  assert.deepEqual(prop('Bangsar South Residence, KL'), { name: 'Bangsar South Residence', area: 'KL' });
  assert.deepEqual(prop('Damansara City Residency, Damansara Heights'), { name: 'Damansara City Residency', area: 'Damansara Heights' });
  assert.deepEqual(prop('Block B 12/3, Setia Alam'), { name: 'Block B 12/3', area: 'Setia Alam' });
  assert.deepEqual(prop('Setia Alam · Eco Ardence B-12-3'), { name: 'Eco Ardence B-12-3', area: 'Setia Alam' });
  assert.deepEqual(prop('Sample Residence, Setia Alam'), { name: 'Sample Residence', area: 'Setia Alam' });
});

test('定制范围「其他：神台」会加神台；认不出来的会列出来提醒', () => {
  const s = MB.briefToSetup({ scope: ['厨房', '其他：神台'] });
  assert.ok(s.rooms.includes('altar'));
  assert.ok(s.rooms.includes('kitchen'));
  assert.deepEqual(plain(s.unknownScope), []);
  const u = MB.briefToSetup({ scope: ['其他：泳池边的柜子'] });
  assert.deepEqual(plain(u.unknownScope), ['泳池边的柜子']);
});

test('「最想解决」里的「WhatsApp：…」「预算：…」是备注，不印成客户的痛点', () => {
  const s = MB.briefToSetup(MB.parseBrief('姓名：陈志明\nWhatsApp：0123456789\n最想解决：厨房太小\nWhatsApp：晚上才回\n预算：不想超过 80k；玩具很多'));
  assert.deepEqual(plain(s.needs.filter((n) => n.quote).map((n) => n.quote)), ['厨房太小', '玩具很多']);
  assert.deepEqual(plain(s.remarks), ['WhatsApp：晚上才回', '预算：不想超过 80k']);
  assert.equal(s.client.wa, '60123456789');
});

test('「最想解决」不再只留前 3 句', () => {
  const s = MB.briefToSetup({ pain: '厨房太小；鞋子没地方放；玩具很多；第四句；第五句' });
  assert.deepEqual(plain(s.needs.map((n) => n.quote)), ['厨房太小', '鞋子没地方放', '玩具很多', '第四句', '第五句']);
});

test('英文客户一大段：一句一条（Mr. Dr. 不算句子结束）', () => {
  const s = MB.briefToSetup({ pain: 'The kitchen is too small. We need more storage for shoes! Mr. Tan works from home? Also my mother lives with us.' });
  assert.deepEqual(plain(s.needs.map((n) => n.quote)),
    ['The kitchen is too small.', 'We need more storage for shoes!', 'Mr. Tan works from home?', 'Also my mother lives with us.']);
});

test('华文称呼', () => {
  const cases = {
    'Mr & Mrs Lim': 'Lim 先生、太太', 'Mr Tan': 'Tan 先生', 'Mr Tan & Ms Lee': 'Tan 先生、Lee 女士',
    'Mrs & Mr Tan': 'Tan 太太、先生', 'Dr Tan & Mrs Tan': 'Tan 医生、太太', 'Mr. and Mrs. Wong': 'Wong 先生、太太',
    '陈志明': '陈志明', 'Tan & Lee': 'Tan & Lee', 'John': 'John'
  };
  for (const [k, v] of Object.entries(cases)) assert.equal(MB.zhName(k), v, k);
});

test('电话号码 → WhatsApp 格式', () => {
  const cases = { '+60 (0)12-345 6789': '60123456789', '012-345 6789': '60123456789', '+6012 345 6789': '60123456789',
    '0060123456789': '60123456789', '600123456789': '60123456789', '011-2345 6789': '601123456789' };
  for (const [k, v] of Object.entries(cases)) assert.equal(MB.msisdn(k), v, k);
});

test('新方案一律双语；销售没填号码不会借用老板的号码', () => {
  assert.equal(MB.newProject().lang, 'bi');
  assert.equal(MB.newProject({ host: 'Amy Lee' }).host.wa, '');
  assert.equal(MB.newProject({ host: 'Amy Lee', wa: '0123456789' }).host.wa, '0123456789');
  assert.equal(MB.newProject().host.wa, '60189661919');   // 没填名字 = 预设的邀请人，号码一起
});

test('到馆时段：过去的、展厅没开的', () => {
  const today = new Date(NOW); today.setHours(0, 0, 0, 0);
  const sp = (d, t, m) => MB.slotProblem(d, t, m || 60, today);
  assert.equal(sp('2026-01-10', '14:00').level, 'bad');            // 已经过了
  assert.equal(sp('2026-11-24', '21:30').level, 'bad');            // 星期二晚上 9:30
  assert.equal(sp('2026-11-22', '07:00').level, 'bad');            // 星期天早上 7:00
  assert.equal(sp('2026-11-22', '09:30').level, 'bad');            // 周末 10 点才开
  assert.equal(sp('2026-11-24', '17:30').level, 'warn');           // 会超过 6 点
  assert.equal(sp('2026-11-24', '09:00'), null);
  assert.equal(sp('2026-11-22', '11:00'), null);
  assert.equal(sp('2026-11-20', '14:00'), null);                   // 今天下午
});

function checkOf(p) {
  const resolve = (ref) => (MB.BUILTIN || []).find((b) => b.id === ref) || null;
  return MB.checkProject(p, resolve).items;
}
function sample(over = {}) {
  const p = MB.newProject({ host: 'Amy Lee', wa: '0123456789' });
  p.client.names = 'Mr & Mrs Lim';
  p.property.name = 'Sample Residence';
  p.visit.date = '2026-11-24'; p.visit.time = '14:00';
  return Object.assign(p, over);
}

test('体检：销售的号码是老板的 / 没填 → 红灯', () => {
  const p = sample(); p.host.wa = '60189661919';
  assert.ok(checkOf(p).some((i) => i.level === 'bad' && /WhatsApp 号码是/.test(i.text)));
  p.host.wa = '';
  assert.ok(checkOf(p).some((i) => i.level === 'bad' && /没有你的 WhatsApp/.test(i.text)));
  p.host.wa = '0123456789';
  assert.ok(!checkOf(p).some((i) => /WhatsApp/.test(i.text)));
});

test('体检：时段 1 / 备选时段过了或展厅没开 → 红灯', () => {
  const p = sample();
  p.visit.time = '21:30';
  assert.ok(checkOf(p).some((i) => i.level === 'bad' && /到馆时段：/.test(i.text)));
  p.visit.time = '14:00'; p.visit.date2 = '2026-01-10'; p.visit.time2 = '11:00';
  assert.ok(checkOf(p).some((i) => i.level === 'bad' && /备选时段：已经过了/.test(i.text)));
  p.visit.date2 = '2026-11-28';
  assert.ok(!checkOf(p).some((i) => /时段：/.test(i.text)));
});

test('讯息不整段照抄客户的一大段话', () => {
  const p = sample();
  const long = 'We have a very small kitchen and my wife cooks every single day for the whole family including my parents who live with us and the kids who are always hungry after school';
  p.needs = [{ quote: long, answer: '', room: 'kitchen' }];
  const copy = MB.writeCopy(p, 'en');
  const all = JSON.stringify(copy);
  assert.ok(!all.includes(long), '整段被抄进讯息');
});

test('讲公司的字：手册查不到的拿掉、不说工厂（老板 2026-11-20 定）', () => {
  const brand = readFileSync(new URL('../../../invite/assets/js/visi/brand.js', import.meta.url), 'utf8');
  const invite = readFileSync(new URL('../../../invite/index.html', import.meta.url), 'utf8');
  for (const bad of ['3.8 万', '38,000', '广州设计周', 'Guangzhou Design Week']) assert.ok(!brand.includes(bad), bad);
  for (const bad of ['工厂', 'workshop', '十年只做一件事', '被逼出来', '看得见、摸得到」当成']) assert.ok(!invite.includes(bad), bad);
  assert.ok(invite.includes('承载 45 年的匠心积累'));
});

test('体检：客户原话太长会提醒', () => {
  const p = sample();
  p.needs = [{ quote: 'We have a very small kitchen and my wife cooks every single day for the whole family including my parents who live with us', answer: 'x', room: 'kitchen' }];
  assert.ok(checkOf(p).some((i) => /客户原话太长/.test(i.text)));
  p.needs[0].quote = 'Kitchen too small';
  assert.ok(!checkOf(p).some((i) => /客户原话太长/.test(i.text)));
});
