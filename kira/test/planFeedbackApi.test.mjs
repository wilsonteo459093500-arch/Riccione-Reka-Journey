// api/plan-feedback.js：👎 反馈存到 Supabase（服务器 service key）；谁能送同 /api/plan-ai；不连网（假的 fetch）
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { createHandler, cleanFeedback } from '../api/plan-feedback.js';
import { RESULT_SCHEMA, SYSTEM_PROMPT } from '../api/plan-ai.js';

const fakeRes = () => { const r = { statusCode: 0, headers: {}, body: null }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.end = (b) => { r.body = JSON.parse(b); }; return r; };
const run = async (h, { headers = {}, body, method = 'POST' } = {}) => { const res = fakeRes(); await h({ method, headers, body }, res); return res; };
const ENV = { KIRA_FEEDBACK_SUPABASE_URL: 'https://fb.supabase.co/', KIRA_FEEDBACK_SERVICE_KEY: 'service', KIRA_AI_PASSCODE: 'p' };
const IMG = Buffer.from('fake-jpeg').toString('base64');
const bad = { kind: 'bad', readId: 'mabc123-xyz', reasons: ['bed', 'nonsense'], note: '  衣柜挡到  床头墙 ', template: 'wardrobe', suggestion: { id: 'ai1' }, ai: { result: { rooms: [] } } };
const supa = (calls, { okRest = true, okImg = true } = {}) => async (url, opt) => {
  calls.push({ url, opt });
  if (url.includes('/auth/v1/user')) return { ok: opt.headers.Authorization === 'Bearer good', json: async () => ({ email: 'sales@example.com' }) };
  return { ok: url.includes('/storage/') ? okImg : okRest, status: okRest ? 201 : 500 };
};

test('plan-feedback: not set up → 503; wrong / missing passcode → 401; only POST', async () => {
  assert.equal((await run(createHandler({ env: { KIRA_AI_PASSCODE: 'p' } }), { body: bad })).statusCode, 503);
  const h = createHandler({ env: ENV, fetchImpl: supa([]) });
  assert.equal((await run(h, { body: bad })).statusCode, 401);
  assert.equal((await run(h, { headers: { 'x-kira-ai-passcode': 'x' }, body: bad })).statusCode, 401);
  assert.equal((await run(h, { method: 'GET' })).statusCode, 405);
});

test('plan-feedback: preview passcode → row stored with the service key; image uploaded once per read', async () => {
  const calls = [];
  const h = createHandler({ env: ENV, fetchImpl: supa(calls) });
  const ok = await run(h, { headers: { 'x-kira-ai-passcode': 'p' }, body: { ...bad, image: IMG } });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.body, { ok: true, image: true });
  const [img, row] = calls;
  assert.equal(img.url, 'https://fb.supabase.co/storage/v1/object/kira-ai-feedback/mabc123-xyz.jpg');
  assert.equal(img.opt.headers.Authorization, 'Bearer service');
  assert.equal(row.url, 'https://fb.supabase.co/rest/v1/kira_ai_feedback');
  const saved = JSON.parse(row.opt.body);
  assert.deepEqual(saved.reasons, ['bed']);           // 不认识的原因丢掉
  assert.equal(saved.note, '衣柜挡到 床头墙');           // 空白收好
  assert.equal(saved.who, 'preview');
  assert.equal(saved.image_path, 'mabc123-xyz.jpg');
  // 第二笔没带图 → 不传图
  const calls2 = [];
  await run(createHandler({ env: ENV, fetchImpl: supa(calls2) }), { headers: { 'x-kira-ai-passcode': 'p' }, body: { ...bad, kind: 'missing', template: 'shoe', reasons: [] } });
  assert.equal(calls2.length, 1);
  assert.equal(JSON.parse(calls2[0].opt.body).image_path, null);
});

test('plan-feedback: live site records who sent it; image failure still keeps the text; store failure → 502', async () => {
  const env = { ...ENV, VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' };
  const calls = [];
  const h = createHandler({ env, fetchImpl: supa(calls, { okImg: false }) });
  const ok = await run(h, { headers: { authorization: 'Bearer good' }, body: { ...bad, image: IMG } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.image, false);
  const row = JSON.parse(calls.at(-1).opt.body);
  assert.equal(row.who, 'sales@example.com');
  assert.equal(row.image_path, null);
  const fail = await run(createHandler({ env: ENV, fetchImpl: supa([], { okRest: false }) }), { headers: { 'x-kira-ai-passcode': 'p' }, body: bad });
  assert.equal(fail.statusCode, 502);
});

test('plan-feedback: input checks', () => {
  assert.equal(cleanFeedback({ ...bad, kind: 'love' }).error, 'bad_kind');
  assert.equal(cleanFeedback({ ...bad, readId: '../x' }).error, 'bad_read_id');
  assert.equal(cleanFeedback({ ...bad, reasons: [], note: '' }).error, 'empty');
  assert.equal(cleanFeedback({ ...bad, image: '<script>' }).error, 'bad_image');
  assert.equal(cleanFeedback({ ...bad, ai: { big: 'x'.repeat(400_000) } }).error, 'too_big');
  assert.equal(cleanFeedback({ ...bad, note: 'x'.repeat(900) }).row.note.length, 500);
  assert.ok(cleanFeedback({ kind: 'added', readId: 'mabc123-xyz', picks: { added: ['ai1'] } }).row);
});

test('plan-ai prompt + schema: bed first, door wall, doors / windows / bed per room, L-shaped master wardrobe', () => {
  assert.match(SYSTEM_PROMPT, /Place the bed first/);
  assert.match(SYSTEM_PROMPT, /wall with the entry door/);
  assert.match(SYSTEM_PROMPT, /within 0\.8 m of a bathroom or balcony door/);
  assert.match(SYSTEM_PROMPT, /L-shaped wardrobe/);
  const room = RESULT_SCHEMA.properties.rooms.items;
  assert.deepEqual(room.required, ['type', 'name', 'box', 'doors', 'windows', 'bed']);
  assert.deepEqual(room.properties.doors.items.properties.to.enum, ['entry', 'bathroom', 'balcony', 'closet', 'other']);
});
