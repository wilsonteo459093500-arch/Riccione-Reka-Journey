// Gemini 客户端：key 放请求头不放网址；接口地址必须是 https；测试连接要真是 Gemini 的回复；被拦截的回复只跳过这一组
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { generateImage, analyzeImage, testConnection, checkBaseUrl } from '../src/ai/gemini.js';
import { polishProject } from '../src/ai/polish.js';

const mem = new Map();
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const settings = { apiKey: 'AIzaSy-SECRET', model: 'gemini-3.1-flash-image-preview', baseUrl: 'https://generativelanguage.googleapis.com' };

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: init.headers || {} });
    const { status = 200, body } = handler(String(url), init) || {};
    return { ok: status >= 200 && status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) };
  };
  return calls;
}

test('key 只在请求头里（x-goog-api-key），网址里没有 key=', async () => {
  const calls = mockFetch(() => ({ body: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] } }));
  await generateImage(settings, 'prompt', null, '1:1');
  mockFetch(() => ({ body: { candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }] } })).forEach(() => {});
  const calls2 = mockFetch(() => ({ body: { candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }] } }));
  await analyzeImage(settings, 'p', null, { json: true });
  for (const c of [...calls, ...calls2]) {
    assert.ok(!/key=/.test(c.url), c.url);
    assert.equal(c.headers['x-goog-api-key'], 'AIzaSy-SECRET');
  }
});

test('接口地址：没写 https:// 的拒绝（不把 key 发到别处）；本机 http://localhost 可以', () => {
  assert.throws(() => checkBaseUrl('generativelanguage.googleapis.com'), /https/);
  assert.throws(() => checkBaseUrl('http://api.myproxy.com'), /https/);
  assert.equal(checkBaseUrl('https://api.myproxy.com/'), 'https://api.myproxy.com');
  assert.equal(checkBaseUrl('http://localhost:8787'), 'http://localhost:8787');
  assert.equal(checkBaseUrl(''), 'https://generativelanguage.googleapis.com');
});

test('测试连接：拿到的不是 Gemini 模型信息（如网页 200）→ 报错', async () => {
  mockFetch(() => ({ body: { html: true } }));
  await assert.rejects(() => testConnection(settings), /Gemini/);
  mockFetch(() => ({ body: { name: 'models/gemini-3.1-flash-image-preview' } }));
  assert.equal(await testConnection(settings), true);
});

test('AI 润色：被安全策略拦截的组只跳过；出错停下时，后面的组标成「未处理」', async () => {
  const view = (id, room) => ({ id, kind: 'view', enabled: true, floorId: null, image: null, room, roomEn: '', subtitle: '', materials: [], notes: [] });
  const project = { floors: [], materials: [], slides: [view('a', '客厅'), view('b', '饭厅'), view('c', '厨房'), view('d', '书房')] };
  let n = 0;
  mockFetch(() => {
    n += 1;
    if (n === 2) return { body: { promptFeedback: { blockReason: 'SAFETY' } } }; // 第 2 组被拦截
    if (n === 3) return { status: 400, body: { error: { message: 'Unable to process input image' } } }; // 第 3 组致命错误
    return { body: { candidates: [{ content: { parts: [{ text: '{"slides":[{"id":"v1","subtitle":"全景","roomEn":"LIVING AREA"}]}' }] } }] } };
  });
  const errs = [];
  const rows = await polishProject(project, settings, { onGroupError: (e, g, fatal) => errs.push([g.room, !!e.pending, fatal]) });
  assert.equal(rows.length, 1, '第 1 组有结果');
  assert.deepEqual(errs, [['饭厅', false, false], ['厨房', false, true], ['书房', true, true]]);
});
