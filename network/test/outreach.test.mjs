import test from 'node:test';
import assert from 'node:assert/strict';
import {
  draftFor, fillTemplate, festivalGreeting, langFor, callName, talkingPoints, personalLine, filterAudience, warningsFor,
  ignoredStreak, campaignStats, learnings, historyFor, polishPayload, estimatePolishMyr, nextAttendance, moodFor,
  inviteText, eventRoster, defaultTemplate, KIND_KEYS,
} from '../src/lib/outreach.js';
import { draftMessages, normalizeDrafts, buildDraftPrompt, cleanPerson, MAX_PEOPLE } from '../api/draft-messages.js';
import { gainOf } from '../src/lib/relation.js';

const D = 86400000;
const NOW = Date.parse('2026-11-18T04:00:00Z');
const iso = (daysAgo) => new Date(NOW - daysAgo * D).toISOString();
const me = { display_name: 'Wilson' };
const tan = { id: 'p1', name: '陈大明', name_alt: 'Tan Tai Ming', tier: 'active', whatsapp: '60123456789', interests: ['潜水', 'golf'], resources: [{ kind: 'needs', label: '找室内设计师', source: 'talk' }, { kind: 'needs', label: '贷款', source: 'ai' }], tags: ['扫码'], rel: { affinity: 45 }, circles: [{ id: 'c1' }] };
const john = { id: 'p2', name: 'John Lim', tier: 'core', whatsapp: '0167778888', interests: ['潜水', 'hiking'], resources: [], tags: [], rel: { affinity: 70 }, circles: [] };
const nowa = { id: 'p3', name: 'Siti', tier: 'known', whatsapp: '', interests: [], tags: ['扫码'], rel: { affinity: 20 }, circles: [] };

test('每种群发都有中文 / 英文 / 马来文预设模板', () => {
  for (const k of KIND_KEYS) for (const l of ['zh', 'en', 'ms']) assert.ok(defaultTemplate(k, l).includes('{称呼}'), `${k} ${l}`);
});

test('语言 + 称呼：中文名 → 中文；英文讯息用英文名', () => {
  assert.equal(langFor(tan), 'zh');
  assert.equal(langFor(john), 'en');
  assert.equal(langFor(john, 'ms'), 'ms');
  assert.equal(callName(tan, 'zh'), '大明');
  assert.equal(callName(tan, 'en'), 'Tan'); // 跟「今日」的 WhatsApp 预填一样：取第一个字
  assert.equal(callName(john, 'en'), 'John');
});

test('可以提的事：只用兴趣 + 他在找的（AI 推测的不算）；英文讯息不夹中文', () => {
  assert.deepEqual(talkingPoints(tan, 'zh'), ['潜水', 'golf', '找室内设计师']);
  assert.deepEqual(talkingPoints(tan, 'en'), ['golf']);
  assert.equal(personalLine('潜水', 'zh'), '最近潜水怎么样？');
  assert.equal(personalLine('', 'zh'), '');
});

test('fillTemplate：空的占位拿掉、空白收好', () => {
  assert.equal(fillTemplate('Hi {称呼}，{聊聊}好久不见 {不认得}', { 称呼: '大明', 聊聊: '' }), 'Hi 大明，好久不见');
  assert.equal(fillTemplate('Hi {称呼} , ok', { 称呼: 'A' }), 'Hi A, ok');
});

test('draftFor：节日问候叫名字、祝福语、提他的事', () => {
  const d = draftFor({ campaign: { kind: 'festival', lang: 'auto', occasion: '农历新年' }, person: tan, me });
  assert.equal(d.lang, 'zh');
  assert.ok(d.text.startsWith('Hi 大明，新年快乐'), d.text);
  assert.ok(d.text.includes('最近潜水怎么样？'));
  assert.ok(d.text.endsWith('—— Wilson'));
  assert.equal(d.personal, true);
  assert.equal(d.topic, '潜水');
  // 换话题、不提
  assert.equal(draftFor({ campaign: { kind: 'festival', occasion: '农历新年' }, person: tan, me, topic: 1 }).topic, 'golf');
  const none = draftFor({ campaign: { kind: 'festival', occasion: '农历新年' }, person: tan, me, topic: -1 });
  assert.equal(none.personal, false);
  assert.ok(!none.text.includes('怎么样'));
  // 英文 + 自己打的节日
  const en = draftFor({ campaign: { kind: 'festival', lang: 'auto', occasion: '端午节' }, person: john, me });
  assert.ok(en.text.startsWith('Hi John, Happy 端午节!'), en.text);
  assert.equal(festivalGreeting('开斋节', 'ms'), 'Selamat Hari Raya Aidilfitri, maaf zahir dan batin.');
});

test('draftFor：活动后跟进用活动名；邀请用邀请内容或活动资料', () => {
  const ev = { id: 'e1', name: 'BNI 早餐会', held_on: '2026-11-30', location: '溪岸展厅' };
  const f = draftFor({ campaign: { kind: 'event_follow', lang: 'zh' }, person: tan, me, event: ev });
  assert.ok(f.text.includes('很高兴在BNI 早餐会认识你'), f.text);
  const inv = draftFor({ campaign: { kind: 'invite', lang: 'zh' }, person: tan, me, event: ev });
  assert.ok(inv.text.includes('2026-11-30 BNI 早餐会（地点：溪岸展厅）。'), inv.text);
  const inv2 = draftFor({ campaign: { kind: 'invite', lang: 'zh', invite: '12/6 下午 2 点新系列发布会。' }, person: tan, me, event: ev });
  assert.ok(inv2.text.includes('12/6 下午 2 点新系列发布会。'));
  assert.equal(inviteText(ev, 'en'), 'BNI 早餐会 on 2026-11-30 at 溪岸展厅.');
  // 自己的模板
  const own = draftFor({ campaign: { kind: 'custom', template: '{称呼}：明天见！' }, person: john, me });
  assert.equal(own.text, 'John：明天见！');
  assert.equal(own.personal, false);
});

test('filterAudience：圈层、标签、商会、活动出席、好感度；新朋友没确认的不算', () => {
  const people = [tan, john, nowa, { ...john, id: 'p4', pending_review: true }];
  assert.deepEqual(filterAudience(people, {}).map((p) => p.id), ['p1', 'p2', 'p3']);
  assert.deepEqual(filterAudience(people, { tiers: ['core'] }).map((p) => p.id), ['p2']);
  assert.deepEqual(filterAudience(people, { tags: ['扫码'] }).map((p) => p.id), ['p1', 'p3']);
  assert.deepEqual(filterAudience(people, { circles: ['c1'] }).map((p) => p.id), ['p1']);
  assert.deepEqual(filterAudience(people, { minAffinity: 40 }).map((p) => p.id), ['p1', 'p2']);
  const attendance = [{ event_id: 'e1', person_id: 'p1', status: 'attended' }, { event_id: 'e1', person_id: 'p2', status: 'absent' }];
  assert.deepEqual(filterAudience(people, { event: { id: 'e1', statuses: ['attended', 'going'] } }, { attendance }).map((p) => p.id), ['p1']);
  assert.deepEqual(filterAudience(people, { q: 'john' }).map((p) => p.id), ['p2']);
});

test('提醒：没 WhatsApp 不能发；连续 2 次没回、3 天内发过先不勾', () => {
  assert.ok(warningsFor(nowa, [], { now: NOW }).some((w) => w.block));
  const out = [
    { person_id: 'p1', campaign_id: 'a', status: 'sent', sent_at: iso(40), response: 'none' },
    { person_id: 'p1', campaign_id: 'b', status: 'sent', sent_at: iso(20), response: 'none' },
    { person_id: 'p1', campaign_id: 'c', status: 'sent', sent_at: iso(2), response: null },
  ];
  assert.equal(ignoredStreak(out, 'p1'), 2);
  const w = warningsFor(tan, out, { now: NOW });
  assert.ok(w.some((x) => x.kind === 'ignored' && x.skip));
  assert.ok(w.some((x) => x.kind === 'recent' && x.text === '2 天前刚发过群发'));
  assert.ok(!warningsFor(tan, out, { now: NOW, campaignId: 'c' }).some((x) => x.kind === 'recent'), '同一次群发不算');
  assert.equal(ignoredStreak([...out, { person_id: 'p1', campaign_id: 'd', status: 'sent', sent_at: iso(1), response: 'warm' }], 'p1'), 0);
  assert.ok(warningsFor({ ...john, avoid_topics: ['政治'] }, [], { now: NOW }).some((x) => x.kind === 'avoid' && !x.skip));
});

test('回应 → 气氛 → 好感度：回得热加分、没回 / 不高兴扣', () => {
  const g = (r) => gainOf({ kind: 'message', ai: { mood: moodFor(r) } });
  assert.ok(g('warm') > g('ok') && g('ok') > g('none') && g('none') > g('cold'));
  assert.equal(gainOf({ kind: 'message', ai: null }), 6);
  assert.equal(moodFor(null), null);
});

test('出席状态：邀请不会盖掉「会来 / 出席了」；出席了不会被改掉成邀请', () => {
  assert.equal(nextAttendance(undefined, 'invited'), 'invited');
  assert.equal(nextAttendance('going', 'invited'), 'going');
  assert.equal(nextAttendance('attended', 'invited'), 'attended');
  assert.equal(nextAttendance('invited', 'going'), 'going');
  assert.equal(nextAttendance('attended', 'going'), 'attended');
});

test('统计 + 从回应学到的（每边至少 5 个回应才说）', () => {
  const mk = (n, extra, response) => Array.from({ length: n }, () => ({ status: 'sent', sent_at: iso(1), response, ...extra }));
  const rows = [
    ...mk(4, { personal: true, campaign_id: 'f' }, 'warm'), ...mk(1, { personal: true, campaign_id: 'f' }, 'none'),
    ...mk(1, { personal: false, campaign_id: 'i' }, 'ok'), ...mk(4, { personal: false, campaign_id: 'i' }, 'none'),
    { status: 'draft' }, { status: 'skipped' },
  ];
  const st = campaignStats(rows);
  assert.equal(st.total, 12); assert.equal(st.sent, 10); assert.equal(st.left, 1); assert.equal(st.skipped, 1);
  assert.equal(st.rate, 0.5);
  const tips = learnings(rows, [{ id: 'f', kind: 'festival' }, { id: 'i', kind: 'invite' }]);
  assert.ok(tips.find((t) => t.key === 'personal').text.startsWith('有提到对方的事回复率比较高：80%'), JSON.stringify(tips));
  assert.ok(tips.find((t) => t.key === 'kind').text.includes('「节日问候」'));
  assert.ok(!tips.some((t) => t.key === 'polished'), '没润色过的样本，不比');
  assert.deepEqual(learnings(rows.slice(0, 3), []), []);
});

test('historyFor / polishPayload：送给 AI 的只有写讯息用得到的', () => {
  const outreach = [{ person_id: 'p1', campaign_id: 'f', status: 'sent', sent_at: iso(5), text: '新年快乐', response: 'warm', response_note: '回了一大段' }];
  const h = historyFor(outreach, [{ id: 'f', kind: 'festival' }], 'p1');
  assert.deepEqual(h, [{ kind: '节日问候', text: '新年快乐', response: '回得很热', note: '回了一大段' }]);
  const person = { ...tan, avoid_topics: ['政治'], phones: [{ number: '0123' }], notes: '私人备注', interactions: [{ occurred_at: iso(3), title: '喝咖啡', summary: '聊了新家装修' }] };
  const p = polishPayload({ row: { id: 'o1', text: 'Hi 大明', lang: 'zh' }, person, outreach, campaigns: [{ id: 'f', kind: 'festival' }] });
  assert.equal(p.call, '大明');
  assert.deepEqual(p.needs, ['找室内设计师']);
  assert.deepEqual(p.avoid, ['政治']);
  assert.ok(p.recent[0].includes('聊了新家装修'));
  assert.ok(!('phones' in p) && !('notes' in p) && !('whatsapp' in p), '电话、备注不送');
  assert.ok(estimatePolishMyr(20) < 0.1, `20 人 ${estimatePolishMyr(20)}`);
  assert.equal(estimatePolishMyr(0), 0);
});

test('eventRoster：只列这个活动、人还在的', () => {
  const r = eventRoster({ id: 'e1' }, [{ id: 'a', event_id: 'e1', person_id: 'p1', status: 'going' }, { id: 'b', event_id: 'e2', person_id: 'p2' }, { id: 'c', event_id: 'e1', person_id: 'gone' }], [tan, john]);
  assert.deepEqual(r.map((x) => x.person.id), ['p1']);
});

/* ---------- /api/draft-messages ---------- */
const fakeClient = (reply, seen = {}) => ({ messages: { create: async (req) => { Object.assign(seen, req); return { model: 'claude-haiku-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reply) }], usage: { input_tokens: 1000, output_tokens: 300 } }; } } });

test('draftMessages：Haiku、结构化输出、资料包在 <people>、只回认得的 id', async () => {
  const seen = {};
  const out = await draftMessages({
    kind: 'festival', occasion: '农历新年', me: { name: 'Wilson' }, learnings: ['有提到对方的事回复率比较高'],
    people: [{ id: 'o1', call: '大明', lang: 'zh', draft: 'Hi 大明，新年快乐！', interests: ['潜水'], avoid: ['政治'] }, { id: 'o2', call: 'John', lang: 'en', draft: 'Hi John' }],
  }, { client: fakeClient({ messages: [{ id: 'o1', text: 'Hi 大明，新年快乐！今年还去潜水吗？' }, { id: 'zzz', text: '乱来的' }, { id: 'o1', text: '重复' }] }, seen) });
  assert.equal(seen.model, 'claude-haiku-5-5');
  assert.equal(seen.output_config.format.type, 'json_schema');
  assert.ok(seen.messages[0].content.includes('<people>'));
  assert.ok(seen.messages[0].content.includes('有提到对方的事回复率比较高'));
  assert.ok(seen.system.includes('一字不改'));
  assert.deepEqual(out.messages, [{ id: 'o1', text: 'Hi 大明，新年快乐！今年还去潜水吗？' }]);
  assert.equal(out.usage.feature, 'draft');
  assert.ok(out.usage.cost_usd > 0);
});

test('draftMessages：输入检查', async () => {
  const client = fakeClient({ messages: [] });
  await assert.rejects(draftMessages({ people: [] }, { client }), (e) => e.status === 400);
  await assert.rejects(draftMessages({ people: [{ id: 'a', draft: '' }] }, { client }), (e) => e.status === 400);
  const many = Array.from({ length: MAX_PEOPLE + 1 }, (_, i) => ({ id: `o${i}`, draft: 'Hi' }));
  await assert.rejects(draftMessages({ people: many }, { client }), (e) => e.status === 413);
  const bad = { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '没有 JSON' }], usage: {} }) } };
  await assert.rejects(draftMessages({ people: [{ id: 'a', draft: 'Hi' }] }, { client: bad }), (e) => e.status === 502);
});

test('cleanPerson / buildDraftPrompt / normalizeDrafts', () => {
  const p = cleanPerson({ id: 'o1', lang: 'xx', draft: 'x'.repeat(2000), history: [{ kind: '节日问候', text: 'hi', response: '没回' }] });
  assert.equal(p.lang, 'zh');
  assert.equal(p.draft.length, 700);
  const prompt = buildDraftPrompt({ kind: 'invite', invite: '12/6 发布会', people: [p] });
  assert.ok(prompt.includes('邀请内容（一字不改）：12/6 发布会'));
  assert.ok(!prompt.includes('以前群发的经验'));
  assert.deepEqual(normalizeDrafts(null, [p]), []);
});

/* ---------- 节日提醒 ---------- */
import { festivalCalendar, upcomingFestivals, festivalWhen, FESTIVAL_DATES, FESTIVALS } from '../src/lib/outreach.js';
const at = (d) => Date.parse(`${d}T09:00:00`);

test('节日日期表：每个都认得、日期格式对、由近到远', () => {
  for (const f of FESTIVAL_DATES) {
    assert.ok(FESTIVALS.some((x) => x.key === f.key), f.key);
    assert.match(f.date, /^\d{4}-\d{2}-\d{2}$/);
  }
  const cal = festivalCalendar(at('2026-11-18'), 400);
  assert.deepEqual(cal.slice(0, 3).map((f) => [f.label, f.date]), [['圣诞节', '2026-12-25'], ['元旦新年', '2027-01-01'], ['农历新年', '2027-02-06']]);
  assert.ok(cal.some((f) => f.label === '开斋节' && f.approx));
  assert.ok(cal.every((f, i) => i === 0 || f.daysLeft >= cal[i - 1].daysLeft));
});

test('今日提醒：节日前 3 星期内才出现；建过节日问候就不再提醒', () => {
  assert.deepEqual(upcomingFestivals([], at('2026-11-18')), []);
  const dec = upcomingFestivals([], at('2026-12-10'));
  assert.deepEqual(dec.map((f) => f.label), ['圣诞节']);
  assert.equal(festivalWhen(dec[0]), '还有 15 天（12 月 25 日）');
  const both = upcomingFestivals([], at('2026-12-20')).map((f) => f.label);
  assert.deepEqual(both, ['圣诞节', '元旦新年']);
  const done = [{ kind: 'festival', occasion: '圣诞节', created_at: '2026-12-15T02:00:00Z' }];
  assert.deepEqual(upcomingFestivals(done, at('2026-12-20')).map((f) => f.label), ['元旦新年']);
  // 去年的圣诞问候不算
  assert.deepEqual(upcomingFestivals([{ kind: 'festival', occasion: '圣诞节', created_at: '2025-12-15T02:00:00Z' }], at('2026-12-20')).map((f) => f.label), ['圣诞节', '元旦新年']);
  const raya = upcomingFestivals([], at('2027-03-09'))[0];
  assert.equal(festivalWhen(raya), '明天（约 3 月 10 日）');
});

test('海报：附海报 vs 只有文字的回复率；AI 知道这次有海报', () => {
  const mk = (n, extra, response) => Array.from({ length: n }, () => ({ status: 'sent', sent_at: iso(1), response, ...extra }));
  const rows = [...mk(5, { with_image: true }, 'warm'), ...mk(5, { with_image: false }, 'none')];
  assert.ok(learnings(rows, []).find((t) => t.key === 'image').text.startsWith('附海报的回复率比较高：100%'));
  const p = cleanPerson({ id: 'o1', draft: 'Hi' });
  assert.ok(buildDraftPrompt({ kind: 'festival', has_image: true, people: [p] }).includes('配一张海报'));
  assert.ok(!buildDraftPrompt({ kind: 'festival', people: [p] }).includes('配一张海报'));
});
