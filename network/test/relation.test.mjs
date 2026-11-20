import test from 'node:test';
import assert from 'node:assert/strict';
import {
  affinityAt, affinitySeries, gainOf, relationOf, bandOf, affinityHistory, todayActions, expandQuery, findHelpers,
  galaxyLayout, briefFor, briefText, tickDate, buildTask, buildTaskBatch, buildIcs, nextSlot, lackingChips, recentFacts,
  firstName, topicsFor, AFFINITY,
} from '../src/lib/relation.js';

const D = 86400000;
const NOW = Date.parse('2026-11-17T04:00:00Z');
const iso = (daysAgo) => new Date(NOW - daysAgo * D).toISOString();
const every = (days, kind, n, mood = null) => Array.from({ length: n }, (_, i) => ({ kind, occurred_at: iso(i * days), created_at: iso(i * days), ai: mood == null ? null : { mood: { score: mood } } }));
const old = { id: 'p0', tier: 'known', created_at: iso(400) };

test('gainOf：种类 + 气氛', () => {
  assert.equal(gainOf({ kind: 'meeting' }), 18);
  assert.equal(gainOf({ kind: 'meeting', ai: { mood: { score: 2 } } }), 26);
  assert.equal(gainOf({ kind: 'message', ai: { mood: { score: -2 } } }), -2);
  assert.equal(gainOf({ kind: 'note', ai: { mood: { score: 2 } } }), 0); // 备注不是联系
  assert.equal(gainOf({ kind: 'call', ai: { mood: { score: 9 } } }), 20); // 超出范围夹住
});

test('好感度：常联系就高，不联系就掉回 floor', () => {
  const monthly = affinityAt(old, every(30, 'meeting', 12), NOW);
  const warm = affinityAt(old, every(30, 'meeting', 12, 2), NOW);
  const quarterly = affinityAt(old, every(90, 'meeting', 4), NOW);
  assert.ok(monthly >= 55 && monthly <= 70, `monthly ${monthly}`);
  assert.ok(warm > monthly, 'warm 比普通高');
  assert.ok(quarterly < monthly, 'quarterly 比 monthly 低');
  assert.ok(affinityAt(old, [], NOW) <= AFFINITY.floor + 2, '400 天没联系 ≈ floor');
  // 越接近 100 越难加
  assert.ok(affinityAt(old, every(3, 'meeting', 120, 2), NOW) <= 100);
});

test('好感度：同一天第二笔只算一半；互动之前的时间点不受影响', () => {
  const p = { created_at: iso(10) };
  const one = affinityAt(p, [{ kind: 'meeting', occurred_at: iso(1) }], NOW);
  const two = affinityAt(p, [{ kind: 'meeting', occurred_at: iso(1) }, { kind: 'meeting', occurred_at: new Date(NOW - D + 3600000).toISOString() }], NOW);
  const twoDays = affinityAt(p, [{ kind: 'meeting', occurred_at: iso(2) }, { kind: 'meeting', occurred_at: iso(1) }], NOW);
  assert.ok(two > one && two < twoDays, `${one} ${two} ${twoDays}`);
  const [before, after] = affinitySeries(p, [{ kind: 'meeting', occurred_at: iso(5) }], [NOW - 6 * D, NOW - 4 * D]);
  assert.ok(after > before);
});

test('relationOf：上次联系、该联系了、趋势、暂缓', () => {
  const p = { id: 'a', tier: 'core', created_at: iso(200) };
  const r = relationOf(p, [{ kind: 'meeting', occurred_at: iso(20) }, { kind: 'note', occurred_at: iso(1) }], NOW);
  assert.equal(r.daysSince, 20); // 备注不算联系
  assert.equal(r.cadence, 14);
  assert.equal(r.overdue, true);
  assert.equal(r.dueIn, -6);
  const cooling = relationOf(p, every(10, 'meeting', 10).map((x) => ({ ...x, occurred_at: new Date(Date.parse(x.occurred_at) - 40 * D).toISOString() })), NOW);
  assert.ok(cooling.trend < 0);
  assert.equal(relationOf({ ...p, snooze_until: '2026-11-20' }, [], NOW).snoozed, true);
  assert.equal(relationOf({ ...p, snooze_until: '2026-11-10' }, [], NOW).snoozed, false);
  assert.equal(relationOf({ ...p, last_contact_at: iso(3) }, [], NOW).daysSince, 3);
});

test('bandOf / affinityHistory', () => {
  assert.equal(bandOf(85).label, '挚友');
  assert.equal(bandOf(45).label, '朋友');
  assert.equal(bandOf(5).label, '快忘了');
  const h = affinityHistory({ created_at: iso(30) }, [{ kind: 'meeting', occurred_at: iso(10) }], { days: 60, step: 10, now: NOW });
  assert.equal(h[0].v, null); // 认识之前没有值
  assert.equal(h[h.length - 1].t, NOW);
  assert.ok(h[h.length - 1].v > 0);
});

function view(p, interactions = []) {
  const v = { resources: [], circles: [], interests: [], tags: [], ...p, interactions: interactions.slice().sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at))) };
  v.rel = relationOf(v, v.interactions, NOW);
  return v;
}

test('todayActions：答应的事 > 刚认识 > 太久没联系；暂缓的不出现', () => {
  const promise = view({ id: 'pr', name: 'Promise Tan', tier: 'known', created_at: iso(5) }, [
    { kind: 'meeting', occurred_at: iso(2), created_at: iso(2), ai: { action_items: [{ who: 'me', what: '介绍建筑师给他', due: '2026-11-10', done: false }] } },
  ]);
  const fresh = view({ id: 'nw', name: '李小明', tier: 'known', created_at: iso(1), met_on: '2026-11-16' }, [
    { kind: 'card_scan', occurred_at: iso(1), created_at: iso(1) },
  ]);
  const core = view({ id: 'co', name: 'Dato Lim', tier: 'core', created_at: iso(300), worth_score: 80 }, [{ kind: 'meeting', occurred_at: iso(40), created_at: iso(40) }]);
  const fine = view({ id: 'ok', name: 'Fine', tier: 'known', created_at: iso(300) }, [{ kind: 'meeting', occurred_at: iso(5), created_at: iso(5) }]);
  const snoozed = view({ id: 'sz', name: 'Sleepy', tier: 'core', created_at: iso(300), snooze_until: '2026-11-30' }, []);
  const out = todayActions([fine, core, fresh, promise, snoozed], { now: NOW });
  const ids = out.map((x) => x.person.id);
  assert.deepEqual(ids.slice(0, 1), ['pr']);
  assert.ok(ids.includes('nw') && ids.includes('co'));
  assert.ok(!ids.includes('ok') && !ids.includes('sz'));
  assert.match(out[0].reasons[0].text, /到期了 · 你答应过：介绍建筑师给他/);
  assert.match(out.find((x) => x.person.id === 'nw').reasons[0].text, /刚认识 1 天/);
  assert.equal(out.find((x) => x.person.id === 'co').action, 'meet');
  // 已经跟进过的新朋友就不再提醒「刚认识」
  const followed = view({ ...fresh, id: 'nw2' }, [...fresh.interactions, { kind: 'message', occurred_at: iso(0.5), created_at: iso(0.5) }]);
  assert.equal(todayActions([followed], { now: NOW }).length, 0);
});

test('expandQuery / findHelpers：同义词、短英文要整个字、关系近的排前面', () => {
  const q = expandQuery('律师');
  assert.ok(q.includes('lawyer') && q.includes('advocate'));
  assert.ok(expandQuery('mp').includes('议员'));
  const near = view({ id: 'n', name: 'Near', tier: 'core', title: 'Advocate & Solicitor', created_at: iso(100) }, every(14, 'meeting', 8));
  const far = view({ id: 'f', name: 'Far', tier: 'known', created_at: iso(300), resources: [{ kind: 'has', label: '认识很多律师', source: 'talk' }] }, []);
  const company = view({ id: 'c', name: 'Company Guy', tier: 'known', title: 'Company director', created_at: iso(10) });
  const res = findHelpers([far, company, near], '律师');
  assert.deepEqual(res.map((r) => r.person.id), ['n', 'f']);
  assert.equal(res[0].ready, true);
  assert.equal(res[1].ready, false); // 关系还浅
  assert.equal(findHelpers([company], 'mp').length, 0); // company 不能中 mp
  const mentioned = view({ id: 'm', name: 'M', tier: 'active', created_at: iso(20) }, [{ kind: 'meeting', occurred_at: iso(3), ai: { people_mentioned: [{ name: 'Ar. Wong', context: '他的建筑师朋友' }] } }]);
  assert.match(findHelpers([mentioned], 'architect')[0].why[0], /他认识：Ar\. Wong/);
  assert.equal(findHelpers([near], '').length, 0);
});

test('galaxyLayout：圈层在对的轨道，好感度高的靠近中心', () => {
  const ppl = [
    { id: 'a', tier: 'core', rel: { affinity: 90 } },
    { id: 'b', tier: 'core', rel: { affinity: 10 } },
    { id: 'c', tier: 'known', rel: { affinity: 50 } },
  ];
  const nodes = galaxyLayout(ppl);
  const by = Object.fromEntries(nodes.map((n) => [n.person.id, n]));
  assert.ok(by.a.r < by.b.r);
  assert.ok(by.b.r < by.c.r);
  for (const n of nodes) assert.ok(n.x > 0 && n.x < 1 && n.y > 0 && n.y < 1);
  // 同样的人每次位置一样
  assert.deepEqual(galaxyLayout(ppl).map((n) => n.x), nodes.map((n) => n.x));
});

test('briefFor / briefText / topicsFor / recentFacts', () => {
  const p = view({
    id: 'b', name: 'Tan Ah Kow', title: 'MD', tier: 'important', created_at: iso(100), avoid_topics: ['政治'], interests: ['高尔夫'],
    notes: '人很好\n【2026-10-01】女儿明年读大学\n【2026-11-01】刚去日本旅行',
    resources: [{ kind: 'give', label: '介绍室内设计师' }, { kind: 'needs', label: '新办公室' }],
    assessment: { talk_topics: ['马六甲新项目'], give_ideas: [{ idea: '介绍室内设计师' }, { idea: '借展厅办活动' }] },
  }, [
    { kind: 'meeting', occurred_at: iso(10), title: '喝咖啡', summary: '聊了新办公室', ai: { next_topics: ['办公室装修进度'], mood: { score: 1 }, action_items: [{ who: 'him', what: '传平面图', done: false }, { who: 'me', what: '报价', done: false }] } },
  ]);
  const b = briefFor(p, NOW);
  assert.equal(b.last.title, '喝咖啡');
  assert.deepEqual(b.mine.map((x) => x.item.what), ['报价']);
  assert.deepEqual(b.theirs.map((x) => x.item.what), ['传平面图']);
  assert.deepEqual(b.topics, ['办公室装修进度', '马六甲新项目', '他喜欢的高尔夫']);
  assert.deepEqual(b.give, ['介绍室内设计师', '借展厅办活动']);
  assert.deepEqual(b.facts[0], '【2026-11-01】刚去日本旅行');
  const text = briefText(p, b);
  assert.match(text, /⚠️ 别聊\n• 政治/);
  assert.match(text, /✅ 我答应过他\n• 报价/);
  assert.deepEqual(recentFacts('x\n【2026-01-01】a', 4), ['【2026-01-01】a']);
  assert.equal(topicsFor({ interests: [] }).length, 0);
});

test('TickTick：日期格式、时间盒、连续排', () => {
  assert.equal(tickDate('2026-11-17T03:05:09Z'), '2026-11-17T03:05:09+0000');
  const person = { name: 'Tan' };
  const t = buildTask({ person, action: 'call', start: '2026-11-17T02:00:00Z', wa: 'https://wa.me/60123', appUrl: 'https://x/#/p/1' });
  assert.equal(t.title, '📞 打个电话：Tan');
  assert.equal(t.startDate, '2026-11-17T02:00:00+0000');
  assert.equal(t.dueDate, '2026-11-17T02:20:00+0000');
  assert.match(t.content, /WhatsApp：https:\/\/wa\.me\/60123/);
  const batch = buildTaskBatch([{ person, action: 'message' }, { person: { name: 'Lim' }, action: 'meet' }], { start: '2026-11-17T02:00:00Z' });
  assert.equal(batch[1].startDate, '2026-11-17T02:15:00+0000');
  assert.equal(batch[1].dueDate, '2026-11-17T03:15:00+0000');
  const ics = buildIcs(batch, NOW);
  assert.match(ics, /DTSTART:20261117T021500Z/);
  assert.match(ics, /SUMMARY:☕ 约见面：Lim/);
  assert.ok(ics.split('\r\n').every((l) => l.length <= 75));
  const slot = nextSlot(Date.parse('2026-11-17T02:07:00Z'));
  assert.equal(slot.getUTCMinutes() % 30, 0);
  assert.ok(slot.getTime() >= Date.parse('2026-11-17T02:17:00Z'));
});

test('lackingChips / firstName', () => {
  const chips = lackingChips('高端住宅的发展商 / 建筑师 / 室内设计师人脉；商会里的领袖；能介绍高端客户的人；好的营销、品牌合作伙伴。');
  assert.ok(chips.includes('商会里的领袖'));
  assert.ok(chips.includes('高端客户'));
  assert.ok(chips.includes('发展商') && chips.includes('建筑师') && chips.includes('室内设计师'));
  assert.equal(firstName("Dato' Lim Ah Kow"), "Dato' Lim"); // 体检第 4 阶段：称号留着
  assert.equal(firstName('陈大文'), '大文');
});
