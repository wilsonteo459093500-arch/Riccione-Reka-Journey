/* 体检第 3 阶段：AI 期限、服务器记账、公司查询不误存 */
import test from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { makeDeadline, callWithin, DEADLINES } from '../api/_lib/ai.js';
import { aiEndpoint, recordUsage } from '../api/_lib/run.js';
import { lookupCompany } from '../api/company.js';
import { analyzeTalk } from '../api/analyze-talk.js';
import { assessPerson } from '../api/assess.js';
import { needsCompanyLookup } from '../src/lib/logic.js';

const clock = (t0 = 0) => { let t = t0; return { now: () => t, add: (ms) => { t += ms; } }; };

test('每个功能的期限都在 Vercel 60 秒以内', () => {
  for (const [k, v] of Object.entries(DEADLINES)) assert.ok(v <= 55_000, `${k} = ${v}`);
});

test('callWithin：每次只给剩下的时间、SDK 不自己重试', async () => {
  const c = clock();
  const d = makeDeadline(20_000, 'assess', c.now);
  c.add(5_000);
  let got;
  await callWithin(d, async (opts) => { got = opts; return { ok: 1 }; });
  assert.equal(got.maxRetries, 0);
  assert.ok(got.timeout <= 15_000 && got.timeout > 10_000);
});

test('callWithin：时间不够 → 504 ai_timeout，讯息照功能写', async () => {
  const c = clock();
  const d = makeDeadline(52_000, 'assess', c.now);
  c.add(50_000);
  await assert.rejects(callWithin(d, async () => ({})), (e) => e.status === 504 && e.body.error === 'ai_timeout' && /52 秒/.test(e.body.message) && /没有写进档案/.test(e.body.message));
});

test('callWithin：SDK 超时 → 504（不重试）；忙线 → 时间够就再试一次', async () => {
  const d = makeDeadline(52_000, 'talk');
  let n = 0;
  await assert.rejects(callWithin(d, async () => { n++; throw new Anthropic.APIConnectionTimeoutError(); }), (e) => e.status === 504 && /分成两三段/.test(e.body.message));
  assert.equal(n, 1);
  n = 0;
  const out = await callWithin(d, async () => { n++; if (n === 1) throw new Anthropic.APIConnectionError({ message: 'reset' }); return 'ok'; });
  assert.equal(out, 'ok');
  assert.equal(n, 2);
});

function fakeDb() {
  const rows = [];
  return { rows, from: (t) => ({ insert: async (r) => { rows.push({ t, ...r }); return { error: null }; } }) };
}
function fakeRes() {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } };
  return res;
}

test('aiEndpoint：成功 → 服务器记一笔，回 logged: true', async () => {
  const db = fakeDb();
  const h = aiEndpoint('assess', async () => ({ x: 1, usage: { feature: 'assess', model: 'm', cost_usd: 0.01 } }),
    { requireOwner: async () => ({ db }), requireBudget: async () => 0 });
  const res = fakeRes();
  await h({ method: 'POST', body: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.usage.logged, true);
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].t, 'ai_usage');
  assert.equal(db.rows[0].logged, undefined, 'logged 不是资料库栏位');
  assert.ok(db.rows[0].at);
});

test('aiEndpoint：AI 回了但格式坏 → 照样记账，错误里带 usage', async () => {
  const db = fakeDb();
  const client = { beta: { messages: { create: async () => ({ model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 100 }, content: [{ type: 'text', text: '坏掉' }] }) } } };
  const h = aiEndpoint('assess', (b, deps) => assessPerson(b, { ...deps, client }), { requireOwner: async () => ({ db }), requireBudget: async () => 0 });
  const res = fakeRes();
  await h({ method: 'POST', body: { person: { name: 'Tan' } } }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(db.rows.length, 1);
  assert.ok(db.rows[0].cost_usd > 0);
  assert.equal(res.body.usage.logged, true);
});

test('recordUsage：本机模式没资料库 → false（前端自己记）', async () => {
  assert.equal(await recordUsage({ db: null }, { cost_usd: 1 }), false);
});

const companyReply = (text, stop = 'end_turn') => ({ model: 'claude-sonnet-5-5', stop_reason: stop, usage: { input_tokens: 100, output_tokens: 10 }, content: text ? [{ type: 'text', text }] : [] });
const fake = (fn) => ({ beta: { messages: { create: fn } } });

test('公司查询：格式坏掉 → 502，不会变成「查不到」', async () => {
  await assert.rejects(lookupCompany({ name: 'Mega' }, { client: fake(async () => companyReply('抱歉我查了一下')) }), (e) => e.status === 502 && e.usage && e.usage.cost_usd > 0);
  await assert.rejects(lookupCompany({ name: 'Mega' }, { client: fake(async () => companyReply('{"found":true,"summary":""}')) }), (e) => e.status === 502);
});

test('公司查询：真的查不到 → status not_found；查到 → found', async () => {
  const nf = await lookupCompany({ name: 'Mega' }, { client: fake(async () => companyReply('{"found":false,"summary":""}')) });
  assert.equal(nf.background.status, 'not_found');
  assert.equal(nf.background.found, false);
  const ok = await lookupCompany({ name: 'Mega' }, { client: fake(async () => companyReply('{"found":true,"summary":"做住宅"}')) });
  assert.equal(ok.background.status, 'found');
});

test('公司查询：3 段都还在 pause_turn → 504 超时（带 usage），不存', async () => {
  await assert.rejects(lookupCompany({ name: 'Mega' }, { client: fake(async () => companyReply('', 'pause_turn')) }), (e) => e.status === 504 && e.usage.cost_usd > 0);
});

test('公司查询：第二段超时 → 第一段的钱也带着', async () => {
  let n = 0;
  const client = fake(async () => { n++; if (n === 1) return companyReply('', 'pause_turn'); throw new Anthropic.APIConnectionTimeoutError(); });
  await assert.rejects(lookupCompany({ name: 'Mega' }, { client, deadline: makeDeadline(52_000, 'company') }), (e) => e.status === 504 && e.usage && e.usage.input_tokens === 100);
});

test('needsCompanyLookup：旧的「查不到」重查一次，新的不重查', () => {
  assert.equal(needsCompanyLookup(null), true);
  assert.equal(needsCompanyLookup({ found: false }), true);
  assert.equal(needsCompanyLookup({ found: true }), false);
  assert.equal(needsCompanyLookup({ status: 'not_found', found: false }), false);
});

test('对话整理被截断 → 叫人分段（不是「再试一次」）', async () => {
  const client = { messages: { create: async () => ({ model: 'claude-haiku-5-5', stop_reason: 'max_tokens', usage: { input_tokens: 50000, output_tokens: 6000 }, content: [] }) } };
  await assert.rejects(analyzeTalk({ source: 'plaud', person: { name: 'Tan' }, text: '很长的逐字稿'.repeat(10) }, { client }), (e) => e.status === 502 && /分成两三段/.test(e.body.message) && e.usage.cost_usd > 0);
});

import { splitTalk, TALK_SPLIT_CHARS } from '../src/lib/talk.js';

test('splitTalk：短的不切；长的切成差不多大、在换行切、不丢字', () => {
  assert.deepEqual(splitTalk('短短一段'), ['短短一段']);
  assert.deepEqual(splitTalk('  '), []);
  const lines = Array.from({ length: 3000 }, (_, i) => `Speaker ${i % 2 + 1}: 第 ${i} 句，我们聊一下项目的进度和下个月的安排。`);
  const text = lines.join('\n');
  const parts = splitTalk(text);
  assert.ok(parts.length >= 3);
  for (const p of parts) assert.ok(p.length <= TALK_SPLIT_CHARS, `${p.length}`);
  for (const p of parts) assert.ok(/^Speaker/.test(p), '每段从一行的开头开始');
  assert.equal(parts.join('\n').replace(/\s/g, '').length, text.replace(/\s/g, '').length);
  const sizes = parts.map((p) => p.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) < TALK_SPLIT_CHARS / 2, '长度差不多');
  // 没有换行（一整坨）也切得开
  const blob = '字'.repeat(TALK_SPLIT_CHARS * 2 + 10);
  const bp = splitTalk(blob);
  assert.equal(bp.join('').length, blob.length);
  for (const p of bp) assert.ok(p.length <= TALK_SPLIT_CHARS);
});

import { planRestore, parseBackup, BackupError } from '../src/lib/backup.js';

test('备份补回：只补不见的、现在有的不动、指不到的跳过或清空', () => {
  const backup = {
    profile: [{ id: 'pf', owner: 'u' }],
    companies: [{ id: 'c1', name: 'Mega' }, { id: 'c2', name: 'Gone' }],
    people: [{ id: 'p1', name: 'Tan（旧）', company_id: 'c1' }, { id: 'p2', name: 'Lim', company_id: 'c2', owner: 'u' }, { id: 'p3', name: 'Ali', company_id: 'cX' }],
    interactions: [{ id: 'i1', person_id: 'p2' }, { id: 'i2', person_id: 'pX' }, { id: 'i3', person_id: 'p1' }],
    photo_people: [{ id: 'pp', photo_id: 'ph-missing', person_id: 'p2' }],
  };
  const current = { profile: [{ id: 'pf2' }], companies: [{ id: 'c1' }], people: [{ id: 'p1', name: 'Tan（今天改的）' }] };
  const { plan, counts, skipped } = planRestore(backup, current);
  const by = Object.fromEntries(plan);
  assert.equal(by.profile, undefined, '「我的资料」已经有了，不补');
  assert.deepEqual(by.companies.map((r) => r.id), ['c2']);
  assert.deepEqual(by.people.map((r) => r.id), ['p2', 'p3'], 'p1 现在有，不盖');
  assert.equal(by.people[0].owner, undefined, 'owner 让资料库自己填');
  assert.equal(by.people[1].company_id, null, '公司找不到 → 清空，人照样补');
  assert.deepEqual(by.interactions.map((r) => r.id), ['i1', 'i3'], '指到不存在的人 → 跳过');
  assert.equal(by.photo_people, undefined);
  assert.equal(skipped, 2);
  assert.equal(counts.people, 2);
  // 全部都在 → 什么都不做
  assert.equal(planRestore({ people: [{ id: 'p1' }] }, current).plan.length, 0);
  assert.throws(() => parseBackup('{"a":1}'), BackupError);
  assert.throws(() => parseBackup('xx'), BackupError);
});
