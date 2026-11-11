// api/plan-ai.js：谁能用（正式版要登录 / 预览要团队密码）、输入检查、AI 拒绝 / 出错怎么回；Claude 用假的 client，不连网
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { test } from './harness.mjs';
import { createHandler, RESULT_SCHEMA, MODEL, cabinetFacts } from '../api/plan-ai.js';

const fakeRes = () => { const r = { statusCode: 0, headers: {}, body: null }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.end = (b) => { r.body = JSON.parse(b); }; return r; };
const IMG = Buffer.from('fake-jpeg').toString('base64');
const okMsg = (result) => ({ stop_reason: 'end_turn', model: MODEL, usage: { input_tokens: 2500, output_tokens: 900 }, content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(result) }] });
const client = (msgOrErr, seen = {}) => () => ({ beta: { messages: { stream: (params) => { seen.params = params; return { finalMessage: async () => { if (msgOrErr instanceof Error) throw msgOrErr; return msgOrErr; } }; } } } });
const run = async (h, { headers = {}, body = { image: IMG, w: 1200, h: 800 }, method = 'POST' } = {}) => { const res = fakeRes(); await h({ method, headers, body }, res); return res; };
const result = { scale: { found: false, a: [0, 0], b: [0, 0], mm: 0 }, rooms: [], suggestions: [], notes: '' };

test('plan-ai: no key / no access setting → 503; wrong passcode → 401; right passcode → result + usage', async () => {
  assert.equal((await run(createHandler({ env: {} }))).statusCode, 503);
  assert.equal((await run(createHandler({ env: { ANTHROPIC_API_KEY: 'k' } }))).statusCode, 503);
  const env = { ANTHROPIC_API_KEY: 'k', KIRA_AI_PASSCODE: 'sail2026' };
  const seen = {};
  const h = createHandler({ env, makeClient: client(okMsg(result), seen) });
  assert.equal((await run(h, { headers: { 'x-kira-ai-passcode': 'nope' } })).statusCode, 401);
  assert.equal((await run(h)).statusCode, 401);
  const ok = await run(h, { headers: { 'x-kira-ai-passcode': 'sail2026' } });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.body.result, result);
  assert.deepEqual(ok.body.usage, { input: 2500, output: 900 });
  assert.equal(ok.headers['Cache-Control'], 'no-store');
  // 请求本身：模型、结构化输出、fallback、图片
  assert.equal(seen.params.model, 'claude-opus-5-5');
  assert.deepEqual(seen.params.output_config.format, { type: 'json_schema', schema: RESULT_SCHEMA });
  assert.equal(seen.params.fallbacks, 'default');
  assert.deepEqual(seen.params.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(seen.params.messages[0].content[0].source.data, IMG);
  assert.match(seen.params.messages[0].content[1].text, /1200 x 800 pixels/);
});

test('plan-ai: live site requires a valid Supabase login (checked against Supabase)', async () => {
  const env = { ANTHROPIC_API_KEY: 'k', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon', KIRA_AI_PASSCODE: 'p' };
  const calls = [];
  const fetchImpl = async (url, opt) => { calls.push([url, opt.headers.Authorization]); return { ok: opt.headers.Authorization === 'Bearer good' }; };
  const h = createHandler({ env, fetchImpl, makeClient: client(okMsg(result)) });
  assert.equal((await run(h, { headers: { 'x-kira-ai-passcode': 'p' } })).statusCode, 401); // 正式版不收密码
  assert.equal((await run(h, { headers: { authorization: 'Bearer bad' } })).statusCode, 401);
  assert.equal((await run(h, { headers: { authorization: 'Bearer good' } })).statusCode, 200);
  assert.equal(calls.at(-1)[0], 'https://x.supabase.co/auth/v1/user');
});

test('plan-ai: bad input, refusal, cut-off output, API errors', async () => {
  const env = { ANTHROPIC_API_KEY: 'k', KIRA_AI_PASSCODE: 'p' };
  const headers = { 'x-kira-ai-passcode': 'p' };
  const h = createHandler({ env, makeClient: client(okMsg(result)) });
  assert.equal((await run(h, { headers, method: 'GET' })).statusCode, 405);
  assert.equal((await run(h, { headers, body: { image: '', w: 1, h: 1 } })).statusCode, 400);
  assert.equal((await run(h, { headers, body: { image: IMG, w: 0, h: 800 } })).statusCode, 400);
  assert.equal((await run(h, { headers, body: '{bad' })).statusCode, 400);
  const refused = await run(createHandler({ env, makeClient: client({ stop_reason: 'refusal', stop_details: { explanation: 'x' }, content: [] }) }), { headers });
  assert.deepEqual([refused.statusCode, refused.body.error], [422, 'refused']);
  assert.equal((await run(createHandler({ env, makeClient: client({ stop_reason: 'max_tokens', content: [] }) }), { headers })).statusCode, 502);
  assert.equal((await run(createHandler({ env, makeClient: client({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }) }), { headers })).body.error, 'bad_output');
  const rate = new Anthropic.RateLimitError(429, { type: 'error' }, 'busy', new Headers());
  assert.equal((await run(createHandler({ env, makeClient: client(rate) }), { headers })).statusCode, 429);
  assert.equal((await run(createHandler({ env, makeClient: client(new Error('boom')) }), { headers })).statusCode, 500);
});

test('plan-ai schema: every object closed and fully required (structured outputs rules)', () => {
  const walk = (s) => {
    if (s?.type === 'object') {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(walk);
    }
    if (s?.type === 'array') walk(s.items);
  };
  walk(RESULT_SCHEMA);
});

test('plan-ai: cabinets already on the plan go into the prompt; suggestions carry a confidence', async () => {
  const env = { ANTHROPIC_API_KEY: 'k', KIRA_AI_PASSCODE: 'p' };
  const seen = {};
  const h = createHandler({ env, makeClient: client(okMsg(result), seen) });
  const ok = await run(h, { headers: { 'x-kira-ai-passcode': 'p' }, body: { image: IMG, w: 1200, h: 800, cabinets: [{ code: 'K1', box: [100, 104.4, 340, 164] }, { code: '<b>', box: 'x' }] } });
  assert.equal(ok.statusCode, 200);
  assert.match(seen.params.messages[0].content[1].text, /already drawn on the plan .*K1 at \[100, 104, 340, 164\]/);
  assert.doesNotMatch(seen.params.messages[0].content[1].text, /<b>/);
  assert.equal(cabinetFacts([]), '');
  assert.equal(cabinetFacts(null), '');
  const sg = RESULT_SCHEMA.properties.suggestions.items;
  assert.ok(sg.required.includes('confidence'));
  assert.deepEqual(sg.properties.confidence.enum, ['high', 'low']);
  assert.match(seen.params.system, /every bedroom/);
  assert.match(seen.params.system, /several floors/);
});
