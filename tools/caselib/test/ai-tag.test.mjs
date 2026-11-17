// AI 看图标风格、柜类（assets/js/caselib/ai-tag.js = MB.clAi）：schema 跟词表一模一样、多数决、patch 只填空的、
// 排队跳过人看过的、执行器中途停掉不重花钱、key 错整批停。patch 一律丢进伺服器的 catalog.patch 验证。
// 名字都是假的（陈先生、林太太……）
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lib, INVITE, hexOf } from '../testkit.mjs';

const S = lib.catalog;
const SRC = readFileSync(join(INVITE, 'assets/js/caselib/ai-tag.js'), 'utf8');
const VOCAB_SRC = readFileSync(join(INVITE, 'assets/js/visi/case-vocab.js'), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(VOCAB_SRC, ctx, { filename: 'case-vocab.js' });
vm.runInContext(SRC, ctx, { filename: 'ai-tag.js' });
const A = ctx.window.MB.clAi;
const MB = ctx.window.MB;
const plain = (x) => JSON.parse(JSON.stringify(x));
const T0 = Date.UTC(2026, 10, 17, 2, 0, 0);

const H = (n) => hexOf(0x2000000000000000n + BigInt(n) * 104729n).slice(-16);
const D = (n) => hexOf(0x0123456789abcdefn * BigInt(n + 3)).slice(-16);
function ph(n, f) { const h = H(n); return { h, k: 'c/' + h + '-AbCdEfGhIjKlMnOpQrStU.jpg', w: 1600, ht: 1200, sz: 300000, dh: D(n), f: f || 'IMG_' + n + '.jpg' }; }
const P1 = 'Setia Alam 陈先生', P2 = 'M Vertica 林太太';

// 两个项目：P1 五张、P2 三张
function makeIndex() {
  const idx = S.emptyIndex();
  S.addPhotos(idx, { project: { name: P1 }, photos: [1, 2, 3, 4, 5].map((n) => ph(n)) }, 'Ana', T0);
  S.addPhotos(idx, { project: { name: P2 }, photos: [6, 7, 8].map((n) => ph(n)) }, 'Ana', T0);
  const pid = (name) => Object.keys(idx.projects).find((p) => idx.projects[p].name === name);
  return { idx, p1: pid(P1), p2: pid(P2) };
}
const R = (style, styleSure, cabinets, room, sure) => ({ style, styleSure, cabinets, room: room || '', sure: sure !== false });
// 假的 API 回传
const reply = (j, extra) => Object.assign({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(j) }],
  usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 1500 } }, extra || {});

test('schema enums are exactly the case vocabulary; request body sends only the photo (no folder name)', () => {
  const s = plain(A.schema());
  assert.deepEqual(s.properties.style.enum, plain(MB.CASE_STYLES.map((x) => x.key).concat(['none'])));
  assert.deepEqual(s.properties.cabinets.items.enum, plain(MB.CASE_CABINETS.map((x) => x.key)));
  assert.deepEqual(s.properties.room.enum, plain(MB.CASE_ROOMS));
  assert.equal(s.additionalProperties, false);
  assert.deepEqual(s.required.slice().sort(), Object.keys(s.properties).sort());
  // 提示词提到每一种风格、每一种柜子
  const sys = A.systemPrompt();
  MB.CASE_STYLES.forEach((x) => assert.ok(sys.includes(x.key + '：'), 'style ' + x.key));
  MB.CASE_CABINETS.forEach((x) => assert.ok(sys.includes(x.key + '：'), 'cabinet ' + x.key));
  const b = plain(A.requestBody('QUJD'));
  assert.equal(b.model, 'claude-opus-5-5');
  assert.equal(b.output_config.format.type, 'json_schema');
  assert.equal(b.output_config.effort, 'low');
  assert.equal(b.fallbacks, 'default');
  assert.equal(b.system[0].cache_control.type, 'ephemeral');
  assert.deepEqual(b.messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } });
  assert.ok(!('thinking' in b) && !('temperature' in b));
  const all = JSON.stringify(b);
  for (const bad of ['陈先生', '林太太', 'Setia Alam', 'IMG_']) assert.ok(!all.includes(bad), 'leaks ' + bad);
  const hd = plain(A.requestHeaders('sk-ant-test'));
  assert.equal(hd['x-api-key'], 'sk-ant-test');
  assert.equal(hd['anthropic-dangerous-direct-browser-access'], 'true');
  assert.match(hd['anthropic-beta'], /^server-side-fallback-2026-07-01$/);
});

test('parseReply keeps only vocabulary values; refusal / truncated / garbage → null', () => {
  assert.deepEqual(plain(A.parseReply(reply({ room: 'kitchen', cabinets: ['island', 'kitchen', 'island', 'spaceship'], style: 'wood', styleSure: true, sure: true }))),
    { room: 'kitchen', cabinets: ['kitchen', 'island'], style: 'wood', styleSure: true, sure: true });
  // 看不出风格、other 空间
  assert.deepEqual(plain(A.parseReply(reply({ room: 'other', cabinets: [], style: 'none', styleSure: true, sure: false }))),
    { room: '', cabinets: [], style: '', styleSure: false, sure: false });
  assert.equal(A.parseReply(reply({ room: 'kitchen' }, { stop_reason: 'refusal' })), null);
  assert.equal(A.parseReply(reply({ room: 'kitchen' }, { stop_reason: 'max_tokens' })), null);
  assert.equal(A.parseReply({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }), null);
  // 成本：1000×4 + 100×20 + 1500×0.2（美元 / 百万）
  assert.ok(Math.abs(A.costOf(reply({}).usage) - (4000 + 2000 + 300) / 1e6) < 1e-12);
});

test('majority: sure votes first, all votes when none is sure, ties follow vocabulary order', () => {
  assert.equal(A.majority({ a: R('cream', false), b: R('cream', false), c: R('wood', true) }), 'wood');
  assert.equal(A.majority({ a: R('cream', false), b: R('cream', false), c: R('wood', false) }), 'cream');
  assert.equal(A.majority({ a: R('french', true), b: R('wood', true) }), 'wood');   // 平手：词表里 wood 在前
  assert.equal(A.majority({ a: R('', false) }), '');
});

test('buildPatch fills only empty fields, sets project style by majority, odd-one-out photo style only when sure; server accepts it', () => {
  const { idx, p1 } = makeIndex();
  const h = [1, 2, 3, 4, 5].map(H);
  // 人已经确认过第 5 张；第 4 张文件夹名自动标过空间
  S.patch(idx, { source: 'human', photos: { [h[4]]: { room: 'living', status: 'confirmed' } } }, 'Ana', T0 + 1);
  S.patch(idx, { source: 'auto', photos: { [h[3]]: { room: 'master' } } }, 'Ana', T0 + 2);
  const res = {
    [h[0]]: R('wood', true, ['kitchen', 'island'], 'kitchen'),
    [h[1]]: R('wood', true, ['kitchen'], 'kitchen'),
    [h[2]]: R('luxe', true, ['display'], 'living'),          // 有把握又不一样 → 照片自己写 luxe
    [h[3]]: R('cream', false, ['wardrobe'], 'bedroom', false), // 没把握 → unsure，风格跟项目走，空间不盖掉 master
    [h[4]]: R('wood', true, ['tvcab'], 'living')              // 人确认过：不动
  };
  const p = plain(A.buildPatch(idx, p1, res));
  assert.deepEqual(p.projects, { [p1]: { style: 'wood' } });
  assert.deepEqual(p.photos[h[0]], { room: 'kitchen', cabinets: ['kitchen', 'island'], status: 'auto' });
  assert.deepEqual(p.photos[h[2]], { room: 'living', cabinets: ['display'], style: 'luxe', status: 'auto' });
  assert.deepEqual(p.photos[h[3]], { cabinets: ['wardrobe'], status: 'unsure' });
  assert.ok(!(h[4] in p.photos));
  // 伺服器照收
  const out = S.patch(idx, p, 'Ana', T0 + 3);
  assert.ok(out.changed >= 4);
  assert.equal(idx.projects[p1].style, 'wood');
  assert.equal(idx.photos[h[2]].style, 'luxe');
  assert.equal(idx.photos[h[3]].room, 'master');
  assert.equal(idx.photos[h[3]].status, 'unsure');
  assert.equal(idx.photos[h[4]].room, 'living');
  // 项目风格人已经定了：不再写
  S.patch(idx, { source: 'human', projects: { [p1]: { style: 'french' } } }, 'Ben', T0 + 4);
  const p2 = plain(A.buildPatch(idx, p1, { [h[0]]: R('wood', true, [], 'kitchen') }));
  assert.deepEqual(p2.projects, {});
});

test('plan skips hidden / confirmed / unsure / already-sent photos and hidden projects; trial spreads across projects', () => {
  const { idx, p1, p2 } = makeIndex();
  S.setHidden(idx, { photos: [H(2)] }, true, 'Ana', T0 + 1);
  S.patch(idx, { source: 'human', photos: { [H(3)]: { status: 'confirmed' } } }, 'Ana', T0 + 2);
  S.patch(idx, { source: 'auto', photos: { [H(4)]: { status: 'unsure' } } }, 'Ana', T0 + 3);
  const store = A.emptyStore();
  store.sent[H(6)] = 1;
  const g = plain(A.plan(idx, store));
  assert.deepEqual(g, [{ pid: p2, hs: [H(7), H(8)] }, { pid: p1, hs: [H(1), H(5)] }].sort((a, b) => (idx.projects[a.pid].name < idx.projects[b.pid].name ? -1 : 1)));
  assert.equal(A.countPlan(g), 4);
  const t = plain(A.plan(idx, store, { limit: 3, perProject: 1 }));
  assert.equal(A.countPlan(t), 2);
  assert.equal(t.length, 2);
  S.setHidden(idx, { projects: [p2] }, true, 'Ana', T0 + 4);
  assert.deepEqual(plain(A.plan(idx, store)).map((x) => x.pid), [p1]);
  // 读坏掉的进度 → 空的
  assert.deepEqual(plain(A.readStore('{bad')), plain(A.emptyStore()));
  assert.deepEqual(plain(A.readStore(null)), plain(A.emptyStore()));
});

function runnerWith(idx, store, look, opts) {
  const sent = [];
  const runner = A.makeRunner({
    store, index: () => idx, concurrency: 2,
    look, send: (p) => { sent.push(plain(p)); S.patch(idx, plain(p), 'Ana', T0 + 10 + sent.length); return Promise.resolve(); },
    save: () => {}, progress: (opts && opts.progress) || (() => {})
  });
  return { runner, sent };
}

test('runner: one patch per project, results kept across a stop, no photo looked at twice, failures retried next time', async () => {
  const { idx, p1, p2 } = makeIndex();
  const store = A.emptyStore();
  const looked = [];
  let fail = H(7);
  const look = (h) => {
    looked.push(h);
    if (h === fail) return Promise.reject(new Error('api_500'));
    return Promise.resolve({ r: R('cream', true, ['wardrobe'], 'master'), cost: 0.01 });
  };
  // 第一次：看完 P1 第一批就按暂停
  let first;
  first = runnerWith(idx, store, look, { progress: (st) => { if (st.done >= 2 && first) first.runner.stop(); } });
  const g = A.plan(idx, store);
  const st = await first.runner.run(g);
  assert.ok(st.stopped);
  assert.equal(first.sent.length, 1, 'the project in progress is sent when stopping');
  const sentOnce = Object.keys(store.sent);
  assert.ok(sentOnce.length >= 2);
  assert.equal(Object.keys(store.r).length, 0);
  // 第二次：接着看，不重看已送的
  const second = runnerWith(idx, store, look);
  const st2 = await second.runner.run(A.plan(idx, store));
  assert.equal(st2.failed, 1);
  sentOnce.forEach((h) => assert.equal(looked.filter((x) => x === h).length, 1, 'looked once: ' + h));
  assert.ok(!store.sent[H(7)], 'failed photo is not marked sent');
  assert.equal(idx.projects[p1].style, 'cream');
  assert.equal(idx.projects[p2].style, 'cream');
  // 第三次：只剩失败那一张
  fail = '';
  const third = runnerWith(idx, store, look);
  const g3 = A.plan(idx, store);
  assert.deepEqual(plain(g3), [{ pid: p2, hs: [H(7)] }]);
  await third.runner.run(g3);
  assert.equal(idx.photos[H(7)].status, 'auto');
  assert.ok(Math.abs(store.spent - 0.08) < 1e-9);
});

test('runner: a fatal error (bad key) stops everything but still sends what was already seen', async () => {
  const { idx } = makeIndex();
  const store = A.emptyStore();
  let n = 0;
  const look = () => {
    n++;
    if (n === 3) { const e = new Error('API key 不对'); e.fatal = true; return Promise.reject(e); }
    return Promise.resolve({ r: R('wood', true, ['kitchen'], 'kitchen'), cost: 0.01 });
  };
  const { runner, sent } = runnerWith(idx, store, look);
  await assert.rejects(runner.run(A.plan(idx, store)), /API key 不对/);
  assert.equal(sent.length, 1);
  assert.ok(Object.keys(sent[0].photos).length >= 2);
  assert.equal(runner.state.error, 'API key 不对');
});

test('ai-tag.js is plain ES5 like the other caselib browser files', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"])\/\/[^\n]*/g, '$1');
  assert.ok(!/=>/.test(code), 'no arrow functions');
  assert.ok(!/\b(let|const|class)\s/.test(code), 'no let/const/class');
  assert.ok(!/`/.test(code), 'no template strings');
  assert.ok(!/\basync\s+function|\bawait\s/.test(code), 'no async/await');
  // 不把 key 写进程式：只有 localStorage
  assert.ok(!/sk-ant-[A-Za-z0-9]/.test(SRC));
});
