import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWhatsApp, nameFromWhatsAppFile, matchParticipant, suggestPeople, selectWhatsApp, cleanTranscript,
  openPromises, mergeList, appendFacts, estimateTalkMyr,
} from '../src/lib/talk.js';

const IOS = `[17/11/2026, 9:58:01 AM] Tan Ah Kow: ‎Messages and calls are end-to-end encrypted. No one outside of this chat can read them.
[17/11/2026, 10:23:45 AM] Tan Ah Kow: Wilson, 谢谢昨天的晚宴
[17/11/2026, 10:24:02 AM] Wilson: 不客气！你女儿的大学申请怎样了？
多行第二行
[17/11/2026, 1:05:00 PM] Tan Ah Kow: ‎image omitted
[17/11/2026, 12:30:00 PM] Tan Ah Kow: 这则被删了
[18/11/2026, 12:10:00 AM] Tan Ah Kow: This message was deleted`;

test('parseWhatsApp: iPhone 格式、多行、媒体、删除、系统讯息', () => {
  const r = parseWhatsApp(IOS);
  assert.equal(r.order, 'dmy');
  assert.equal(r.messages.length, 4);
  assert.equal(r.messages[0].text, 'Wilson, 谢谢昨天的晚宴');
  assert.equal(r.messages[0].at.getHours(), 10);
  assert.equal(r.messages[1].text, '不客气！你女儿的大学申请怎样了？\n多行第二行');
  assert.equal(r.messages[2].media, true);
  assert.equal(r.messages[2].at.getHours(), 13);
  assert.equal(r.messages[3].at.getHours(), 12, '12:30 PM 是中午');
  assert.deepEqual(r.participants.map((p) => p.name), ['Tan Ah Kow', 'Wilson']);
});

test('parseWhatsApp: Android 24 小时、月日年、系统讯息', () => {
  const android = `17/11/2026, 10:23 - Messages and calls are end-to-end encrypted.
17/11/2026, 10:23 - Tan: Hi
17/11/2026, 22:05 - Wilson: <Media omitted>
17/11/2026, 22:06 - Tan added Lim`;
  const a = parseWhatsApp(android);
  assert.equal(a.messages.length, 2);
  assert.equal(a.messages[1].at.getHours(), 22);
  assert.equal(a.messages[1].text, '[媒体]');

  const us = `11/17/26, 9:05 AM - Tan: Morning
11/18/26, 9:05 PM - Wilson: Night`;
  const u = parseWhatsApp(us);
  assert.equal(u.order, 'mdy');
  assert.equal(u.messages[0].at.getMonth(), 10);
  assert.equal(u.messages[0].at.getDate(), 17);
  assert.equal(u.messages[0].at.getFullYear(), 2026);
  assert.equal(u.messages[1].at.getHours(), 21);
});

test('parseWhatsApp: 中文「上午 / 下午」、年月日', () => {
  const zh = `[2026/11/17 下午3:05:09] 陈亚九: 下午好
[2026/11/17 上午12:01:00] 陈亚九: 半夜
2026/11/18 08:00 - Wilson: 早`;
  const z = parseWhatsApp(zh);
  assert.equal(z.order, 'ymd');
  assert.equal(z.messages.length, 3);
  assert.equal(z.messages[0].at.getHours(), 15);
  assert.equal(z.messages[1].at.getHours(), 0);
  assert.equal(z.messages[2].at.getDate(), 18);
});

test('nameFromWhatsAppFile', () => {
  assert.equal(nameFromWhatsAppFile('WhatsApp Chat with Tan Ah Kow.txt'), 'Tan Ah Kow');
  assert.equal(nameFromWhatsAppFile('WhatsApp Chat - 陈亚九.zip'), '陈亚九');
  assert.equal(nameFromWhatsAppFile('与陈亚九的 WhatsApp 聊天.txt'), '陈亚九');
  assert.equal(nameFromWhatsAppFile('_chat.txt'), '');
});

test('matchParticipant / suggestPeople', () => {
  const parts = [{ name: 'Wilson', count: 5 }, { name: 'Dato Tan Ah Kow', count: 3 }];
  assert.equal(matchParticipant(parts, { name: 'Tan Ah Kow', name_alt: '陈亚九' }), 'Dato Tan Ah Kow');
  assert.equal(matchParticipant(parts, { name: 'Lim' }), '');
  const people = [{ id: 1, name: 'Tan Ah Kow' }, { id: 2, name: 'Lim', name_alt: '林' }];
  assert.deepEqual(suggestPeople(people, ['Tan Ah Kow']).map((p) => p.id), [1]);
  assert.deepEqual(suggestPeople(people, ['']), []);
});

test('selectWhatsApp: 只拿 from 之后、从最新往回、我 = 我', () => {
  const { messages } = parseWhatsApp(IOS);
  const all = selectWhatsApp(messages, { meName: 'Wilson' });
  assert.equal(all.count, 4);
  assert.ok(all.text.includes('我: 不客气'));
  assert.ok(all.text.startsWith('2026-11-17 10:23 Tan Ah Kow:'));
  const after = selectWhatsApp(messages, { from: messages[1].at });
  assert.equal(after.count, 2);
  const small = selectWhatsApp(messages, { maxChars: 60 });
  assert.equal(small.count, 1);
  assert.equal(small.truncated, true);
  assert.equal(small.last.getTime(), messages[3].at.getTime());
});

test('cleanTranscript: SRT / VTT 去时间轴，同讲者合并；一般文字不动', () => {
  const srt = `1
00:00:01,000 --> 00:00:03,000
Speaker 1: 你好

2
00:00:03,500 --> 00:00:05,000
Speaker 1: 最近忙吗

3
00:00:05,000 --> 00:00:08,000
Speaker 2: 还好
在弄新展厅`;
  assert.equal(cleanTranscript(srt, 'x.srt'), 'Speaker 1: 你好 最近忙吗\nSpeaker 2: 还好 在弄新展厅');
  const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.000\n第一句\n\n00:02.000 --> 00:03.000\n第二句';
  assert.equal(cleanTranscript(vtt), '第一句\n第二句');
  assert.equal(cleanTranscript('  一般文字\n第二行 '), '一般文字\n第二行');
});

test('openPromises / mergeList / appendFacts / estimate', () => {
  const its = [
    { id: 'a', occurred_at: '2026-11-01', ai: { action_items: [{ who: 'me', what: '介绍设计师', done: false }, { who: 'him', what: '寄资料', done: true }] } },
    { id: 'b', occurred_at: '2026-11-10', ai: { action_items: [{ who: 'him', what: '约看展厅' }] } },
    { id: 'c', occurred_at: '2026-11-11', ai: null },
  ];
  const open = openPromises(its);
  assert.deepEqual(open.map((x) => x.item.what), ['约看展厅', '介绍设计师']);
  assert.equal(open[1].index, 0);
  assert.deepEqual(mergeList(['高尔夫', 'Golf'], ['golf', '潜水', ' ', '潜水']), ['高尔夫', 'Golf', '潜水']);
  assert.equal(appendFacts('', ['女儿明年读大学'], '2026-11-17'), '【2026-11-17】女儿明年读大学');
  assert.equal(appendFacts('旧备注\n【2026-11-17】女儿明年读大学', ['女儿明年读大学'], '2026-11-18'), '旧备注\n【2026-11-17】女儿明年读大学');
  assert.ok(estimateTalkMyr(10000) < 0.02);
});
