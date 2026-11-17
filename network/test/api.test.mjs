import test from 'node:test';
import assert from 'node:assert/strict';
import { costOf, usageRow, addUsage, monthlyBudgetUsd } from '../api/_lib/cost.js';
import { extractJson, cleanImages } from '../api/_lib/ai.js';
import { requireOwner, requireBudget } from '../api/_lib/auth.js';
import { HttpError } from '../api/_lib/http.js';
import { scanCard, normalizeCard } from '../api/scan-card.js';
import { lookupCompany, collectSources } from '../api/company.js';
import { assessPerson, normalizeAssessment, buildAssessPrompt } from '../api/assess.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('costOf: Haiku / Sonnet / 搜索', () => {
  assert.equal(costOf('claude-haiku-5-5', { input_tokens: 1_000_000, output_tokens: 0 }), 0.1);
  assert.equal(costOf('claude-sonnet-5-5', { input_tokens: 0, output_tokens: 1_000_000 }), 10);
  assert.equal(costOf('claude-sonnet-5-5', { server_tool_use: { web_search_requests: 3 } }), 0.03);
  const r = usageRow('company', 'claude-sonnet-5-5', addUsage({ input_tokens: 10 }, { input_tokens: 5, server_tool_use: { web_search_requests: 1 } }));
  assert.equal(r.input_tokens, 15);
  assert.equal(r.searches, 1);
  assert.ok(Math.abs(monthlyBudgetUsd() - 50 / 4.4) < 1e-9);
});

test('extractJson: 各种包法', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('结果：\n```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(extractJson('前面 {"a":3} 后面'), { a: 3 });
  assert.equal(extractJson('没有 JSON'), null);
});

test('cleanImages: 只收图片 base64', () => {
  const out = cleanImages([{ media_type: 'image/png', data: `data:image/png;base64,${PNG}` }]);
  assert.equal(out[0].source.data, PNG);
  assert.throws(() => cleanImages([]), HttpError);
  assert.throws(() => cleanImages([{ media_type: 'application/pdf', data: PNG }]), HttpError);
  assert.throws(() => cleanImages([{ media_type: 'image/png', data: '<script>' }]), HttpError);
});

test('requireOwner: 本机没设 Supabase → 放行；Vercel 上没设 → 503', async () => {
  const req = { headers: {} };
  delete process.env.VERCEL_ENV;
  assert.equal((await requireOwner(req, { supabaseEnv: null })).mode, 'local');
  process.env.VERCEL_ENV = 'production';
  await assert.rejects(requireOwner(req, { supabaseEnv: null }), (e) => e.status === 503);
  delete process.env.VERCEL_ENV;
});

test('requireOwner: 要 token、只放 OWNER_EMAIL', async () => {
  const env = { url: 'https://x.supabase.co', anon: 'k' };
  const fake = (email) => () => ({ auth: { getUser: async (t) => (t === 'good' ? { data: { user: { id: 'u1', email } }, error: null } : { data: null, error: new Error('bad') }) } });
  await assert.rejects(requireOwner({ headers: {} }, { supabaseEnv: env, createClient: fake('a@b.c') }), (e) => e.status === 401);
  await assert.rejects(requireOwner({ headers: { authorization: 'Bearer nope' } }, { supabaseEnv: env, createClient: fake('a@b.c') }), (e) => e.status === 401);
  process.env.OWNER_EMAIL = 'Boss@Example.com';
  await assert.rejects(requireOwner({ headers: { authorization: 'Bearer good' } }, { supabaseEnv: env, createClient: fake('other@x.com') }), (e) => e.status === 403);
  const ok = await requireOwner({ headers: { authorization: 'Bearer good' } }, { supabaseEnv: env, createClient: fake('boss@example.com') });
  assert.equal(ok.user.id, 'u1');
  delete process.env.OWNER_EMAIL;
});

test('requireBudget: 超过预算 → 402', async () => {
  const db = (rows) => ({ from: () => ({ select: () => ({ gte: async () => ({ data: rows, error: null }) }) }) });
  assert.equal(await requireBudget({ db: null }), 0);
  assert.ok((await requireBudget({ db: db([{ cost_usd: 1 }]) })) === 1);
  await assert.rejects(requireBudget({ db: db([{ cost_usd: 100 }]) }), (e) => e.status === 402);
});

function fakeClient(reply) {
  const calls = [];
  const create = async (params) => { calls.push(params); return typeof reply === 'function' ? reply(params, calls.length) : reply; };
  return { calls, messages: { create }, beta: { messages: { create } } };
}

test('scanCard: 送图片、用 Haiku、整理结果', async () => {
  const client = fakeClient({
    model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1500, output_tokens: 300 },
    content: [{ type: 'text', text: JSON.stringify({
      is_business_card: true, name: ' Tan Ah Kow ', name_alt: '陈亚九', title: 'Director', company: 'Mega Build Sdn Bhd', company_alt: '',
      phones: [{ label: 'Mobile', number: '+60 12-345 6789' }, { label: 'whatsapp', number: '012 345 6789' }], emails: ['TAN@MEGABUILD.COM.MY', 'bad'],
      website: 'megabuild.com.my', address: 'KL', socials: [{ platform: 'LinkedIn', handle: 'tanak' }, { platform: 'x', handle: '' }],
      industry_guess: '建筑', card_notes: '',
    }) }],
  });
  const out = await scanCard({ images: [{ media_type: 'image/png', data: PNG }] }, { client });
  assert.equal(client.calls[0].model, 'claude-haiku-5-5');
  assert.equal(client.calls[0].messages[0].content[0].type, 'image');
  assert.equal(client.calls[0].output_config.format.type, 'json_schema');
  assert.equal(out.card.name, 'Tan Ah Kow');
  assert.equal(out.card.phones.length, 1, '同一个号码只留一次');
  assert.deepEqual(out.card.emails, ['tan@megabuild.com.my']);
  assert.equal(out.card.socials.length, 1);
  assert.equal(out.usage.feature, 'scan_card');
  assert.ok(out.usage.cost_usd > 0);
});

test('scanCard: 拒答 → 422', async () => {
  const client = fakeClient({ model: 'claude-haiku-5-5', stop_reason: 'refusal', usage: {}, content: [] });
  await assert.rejects(scanCard({ images: [{ media_type: 'image/png', data: PNG }] }, { client }), (e) => e.status === 422);
});

test('normalizeCard: 缺字段不会坏', () => {
  const c = normalizeCard({});
  assert.equal(c.name, '');
  assert.deepEqual(c.phones, []);
});

test('lookupCompany: 网页搜索 + fallback + pause_turn 续跑 + 来源', async () => {
  const client = fakeClient((params, n) => (n === 1
    ? { model: 'claude-sonnet-5-5', stop_reason: 'pause_turn', usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 2 } },
        content: [{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://megabuild.com.my', title: 'Mega Build' }] }] }
    : { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: 200, output_tokens: 50, server_tool_use: { web_search_requests: 1 } },
        content: [{ type: 'text', text: '{"found":true,"name":"Mega Build Sdn Bhd","industry":"建筑","summary":"做住宅项目","products":["住宅"],"notable":[],"confidence":"high"}',
          citations: [{ url: 'https://news.example/x', title: '新闻' }] }] }));
  const out = await lookupCompany({ name: 'Mega Build', website: 'megabuild.com.my' }, { client });
  assert.equal(client.calls.length, 2);
  const p = client.calls[0];
  assert.equal(p.model, 'claude-sonnet-5-5');
  assert.equal(p.fallbacks, 'default');
  assert.ok(p.betas.includes('server-side-fallback-2026-07-01'));
  assert.equal(p.tools[0].type, 'web_search_20260209');
  assert.equal(client.calls[1].messages.length, 2, '续跑时把上一段接回去');
  assert.equal(out.background.found, true);
  assert.equal(out.background.confidence, 'high');
  assert.deepEqual(out.background.sources.map((s) => s.url), ['https://megabuild.com.my', 'https://news.example/x']);
  assert.equal(out.usage.searches, 3);
  await assert.rejects(lookupCompany({ name: '' }, { client }), (e) => e.status === 400);
});

test('collectSources: 去重、只要 http', () => {
  const s = collectSources([[{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://a', title: 'A' }, { type: 'web_search_result', url: 'https://a', title: 'A' }, { type: 'web_search_result', url: 'javascript:x', title: 'x' }] }]]);
  assert.deepEqual(s, [{ url: 'https://a', title: 'A' }]);
});

test('assessPerson: 结构化输出 + 整理分数', async () => {
  const client = fakeClient({
    model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: 2000, output_tokens: 800 },
    content: [{ type: 'text', text: JSON.stringify({
      dims: { business: { score: 12, reason: '发展商' }, connector: { score: 6.6, reason: '' }, has_what_i_lack: { score: -1, reason: '' }, i_can_help: { score: 5, reason: '' } },
      one_line: '值得', suggested_tier: 'boss', give_ideas: [{ idea: '介绍设计师', why: '他缺', effort: 'low' }, { idea: '', why: '', effort: 'x' }],
      has: ['工地'], needs: ['设计'], talk_topics: ['高尔夫'], caution: '',
    }) }],
  });
  const out = await assessPerson({ me: { business: '全屋定制' }, person: { name: 'Tan', circles: ['商会'] }, company: { name: 'Mega' } }, { client });
  assert.equal(client.calls[0].output_config.format.type, 'json_schema');
  assert.equal(client.calls[0].fallbacks, 'default');
  const a = out.assessment;
  assert.equal(a.dims.business.score, 10);
  assert.equal(a.dims.connector.score, 7);
  assert.equal(a.dims.has_what_i_lack.score, 0);
  assert.equal(a.suggested_tier, 'known');
  assert.equal(a.give_ideas.length, 1);
  await assert.rejects(assessPerson({ person: {} }, { client }), (e) => e.status === 400);
});

test('buildAssessPrompt: 空的段落不出现', () => {
  const s = buildAssessPrompt({ me: {}, person: { name: 'Tan' }, company: {} });
  assert.ok(s.includes('名字：Tan'));
  assert.ok(!s.includes('他的公司'));
  assert.equal(normalizeAssessment({}).give_ideas.length, 0);
});

/* ---------- 第 2 阶段：对话分析 ---------- */
import { analyzeTalk, normalizeTalk, buildTalkPrompt } from '../api/analyze-talk.js';

const TALK_REPLY = {
  title: '商会晚宴后喝咖啡', summary: '他在找室内设计师。', occurred_on: '2026-11-16',
  mood: { tone: 'warm', score: 5, note: '主动约下次' },
  interests: ['高尔夫', ''], has: [{ label: '发展商人脉', detail: '认识 3 个发展商' }, { label: '', detail: 'x' }],
  needs: [{ label: '找室内设计师', detail: '新公寓' }], give: [{ idea: '介绍设计师 Amy', why: '他要装修' }],
  facts: ['女儿明年读大学'], action_items: [{ who: 'me', what: '下周寄展厅位置', due: '下周' }, { who: 'boss', what: '约打球', due: '' }, { who: 'him', what: '', due: '' }],
  avoid_topics: ['政治'], people_mentioned: [{ name: 'Lim', context: '他的合伙人' }], next_topics: ['女儿选哪间大学'], transcript: '不该有',
};

test('analyzeTalk: 文字来源用 Haiku、结构化输出、对话包在 <conversation>', async () => {
  const client = fakeClient({ model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 3000, output_tokens: 600 }, content: [{ type: 'text', text: JSON.stringify(TALK_REPLY) }] });
  const out = await analyzeTalk({ source: 'plaud', person: { name: 'Tan', interests: ['潜水'] }, text: 'Speaker 1: 最近在找室内设计师……'.repeat(2) }, { client });
  const p = client.calls[0];
  assert.equal(p.model, 'claude-haiku-5-5');
  assert.equal(p.output_config.format.type, 'json_schema');
  const prompt = p.messages[0].content.at(-1).text;
  assert.ok(prompt.includes('<conversation>'));
  assert.ok(prompt.includes('已知兴趣（不用重复）：潜水'));
  const a = out.analysis;
  assert.equal(a.mood.score, 2, '分数夹在 -2..2');
  assert.deepEqual(a.interests, ['高尔夫']);
  assert.equal(a.has.length, 1);
  assert.equal(a.action_items.length, 2);
  assert.equal(a.action_items[1].who, 'me', '不认得的 who 当成我');
  assert.equal(a.transcript, '', '文字来源不留 transcript');
  assert.equal(out.usage.feature, 'talk');
});

test('analyzeTalk: 截图送图片、留 transcript；输入检查', async () => {
  const client = fakeClient({ model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 5000, output_tokens: 900 }, content: [{ type: 'text', text: JSON.stringify({ ...TALK_REPLY, transcript: 'Tan: hi' }) }] });
  const out = await analyzeTalk({ source: 'whatsapp_screenshot', person: { name: 'Tan' }, images: [{ media_type: 'image/png', data: PNG }] }, { client });
  assert.equal(client.calls[0].messages[0].content[0].type, 'image');
  assert.equal(out.analysis.transcript, 'Tan: hi');
  await assert.rejects(analyzeTalk({ source: 'email', person: { name: 'Tan' }, text: 'x'.repeat(20) }, { client }), (e) => e.status === 400);
  await assert.rejects(analyzeTalk({ source: 'voice', person: {}, text: 'x'.repeat(20) }, { client }), (e) => e.status === 400);
  await assert.rejects(analyzeTalk({ source: 'voice', person: { name: 'Tan' }, text: '短' }, { client }), (e) => e.status === 400);
  await assert.rejects(analyzeTalk({ source: 'voice', person: { name: 'Tan' }, text: 'x'.repeat(120001) }, { client }), (e) => e.status === 413);
  await assert.rejects(analyzeTalk({ source: 'whatsapp_screenshot', person: { name: 'Tan' }, images: [] }, { client }), (e) => e.status === 400);
});

test('normalizeTalk: 缺字段不会坏；日期格式不对就清掉', () => {
  const t = normalizeTalk({ occurred_on: '昨天' });
  assert.equal(t.occurred_on, '');
  assert.equal(t.mood.tone, 'neutral');
  assert.deepEqual(t.action_items, []);
  assert.ok(buildTalkPrompt({ source: 'whatsapp_screenshot', person: { name: 'Tan' } }).includes('transcript'));
});
