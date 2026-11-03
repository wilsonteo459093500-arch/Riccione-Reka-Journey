// mock server：真的开 port，用 fetch 走一遍登入 → 上传 → 登记 → 读清单 → 改 → 隐藏 → 304
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SP, tinyJpeg, tinyThumb, photo, fakeH, lib } from '../testkit.mjs';
import { startMock } from '../mock-server.mjs';

const NAME = 'Setia Alam 原木 测试客户';
const MOCK = join(ROOT, 'tools/caselib/mock-server.mjs');

async function login(url, password) {
  const r = await fetch(url + '/api/session', { method: 'POST', headers: { 'X-VISI': '1', 'Content-Type': 'application/json', Origin: url }, body: JSON.stringify({ name: 'Ana', password: password || 'test-pass' }) });
  return { r, cookie: (r.headers.get('set-cookie') || '').split(';')[0], json: await r.json() };
}
function api(url, cookie) {
  return async function (method, path, body, headers) {
    const h = Object.assign({ Cookie: cookie }, headers || {});
    if (method !== 'GET') { h['X-VISI'] = '1'; h.Origin = url; }
    let payload;
    if (Buffer.isBuffer(body)) payload = body;
    else if (body !== undefined) { payload = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
    const r = await fetch(url + path, { method, headers: h, body: payload });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    return { status: r.status, headers: r.headers, json, text };
  };
}
// fetch 会把 /../ 正规化掉；路径穿越要用原始 http.request 测
function rawGet(url, path) {
  return new Promise((ok, fail) => {
    const u = new URL(url);
    http.get({ host: u.hostname, port: u.port, path }, (res) => { res.resume(); res.on('end', () => ok(res.statusCode)); }).on('error', fail);
  });
}

test('mock server: full flow over real HTTP (startMock, CORS on)', async (t) => {
  const m = await startMock({ port: 0, blobPort: 0, password: 'test-pass' });
  t.after(() => m.close());
  assert.match(m.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(m.blob, /^http:\/\/127\.0\.0\.1:\d+\/$/);

  // 错密码挡下、对的登入拿 cookie（127.0.0.1 不带 Secure）
  const bad = await login(m.url, 'nope');
  assert.equal(bad.r.status, 401);
  const { r, cookie, json } = await login(m.url);
  assert.equal(r.status, 200);
  assert.deepEqual(json, { name: 'Ana' });
  assert.ok(!r.headers.get('set-cookie').includes('Secure'));
  const call = api(m.url, cookie);
  assert.deepEqual((await call('GET', '/api/session')).json, { name: 'Ana' });

  // 上传一张产生出来的小 JPEG
  const h = fakeH();
  const up = await call('POST', '/api/photo?h=' + h, tinyJpeg(), { 'Content-Type': 'image/jpeg' });
  assert.equal(up.status, 200, up.text);
  assert.ok(up.json.url.startsWith(m.blob));
  const blobRes = await fetch(up.json.url);
  assert.equal(blobRes.status, 200);
  assert.equal(blobRes.headers.get('access-control-allow-origin'), '*');
  assert.equal(blobRes.headers.get('content-type'), 'image/jpeg');
  assert.ok(Buffer.from(await blobRes.arrayBuffer()).equals(tinyJpeg()));

  // 登记（带缩图）
  const add = await call('POST', '/api/catalog', { op: 'addPhotos', project: { name: NAME }, photos: [{ ...photo(h), k: up.json.k, sig: up.json.sig }], thumbs: { [h]: tinyThumb() } });
  assert.equal(add.status, 200, add.text);
  assert.deepEqual(add.json.added, [h]);
  const pid = add.json.pid;

  // 读清单：visi 版没有名字；full 版有；缩图包从 blob port 拿得到
  const visi = await call('GET', '/api/catalog?view=visi');
  assert.equal(visi.status, 200);
  assert.equal(visi.headers.get('etag'), '"rev-1"');
  assert.equal(visi.headers.get('cache-control'), 'no-store');
  assert.equal(visi.json.base, m.blob);
  assert.ok(!visi.text.includes('测试客户'));
  const full = await call('GET', '/api/catalog?view=full');
  assert.equal(full.json.projects[pid].name, NAME);
  const pack = await fetch(m.blob + full.json.projects[pid].packs[0]);
  assert.equal((await pack.json())[h], tinyThumb());
  const viaBase = await fetch(visi.json.base + visi.json.photos[h].k);
  assert.equal(viaBase.status, 200, 'base + k resolves to the photo');

  // 改 → 隐藏 → 304
  const p = await call('POST', '/api/catalog', { op: 'patch', source: 'human', photos: { [h]: { room: 'kitchen', cabinets: ['kitchen', 'island'], hero: true } }, projects: { [pid]: { area: 'Setia Alam', ptype: 'terrace', traits: ['elderly'], style: 'wood' } } });
  assert.deepEqual(p.json, { rev: 2, changed: 2 });
  const hd = await call('POST', '/api/catalog', { op: 'hide', photos: [h] });
  assert.deepEqual(hd.json, { rev: 3, changed: 1 });
  const now = await call('GET', '/api/catalog');
  assert.equal(now.json.photos[h].status, 'confirmed');
  assert.ok(now.json.photos[h].hidden);
  const nm = await call('GET', '/api/catalog', undefined, { 'If-None-Match': '"rev-3"' });
  assert.equal(nm.status, 304);
  assert.equal((await call('GET', '/api/catalog', undefined, { 'If-None-Match': '"rev-2"' })).status, 200);

  // 跨站写入挡下
  const cross = await fetch(m.url + '/api/catalog', { method: 'POST', headers: { Cookie: cookie, 'X-VISI': '1', Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{"op":"hide","photos":[]}' });
  assert.equal(cross.status, 403);

  // 冲突注入、统计
  m.adapter.conflictNext(3);
  const un = await call('POST', '/api/catalog', { op: 'unhide', photos: [h] });
  assert.deepEqual(un.json, { rev: 4, changed: 1 });
  const st = m.adapter.stats();
  assert.ok(st.puts >= 6 && st.conflicts >= 3, JSON.stringify(st));

  // 静态档：cleanUrls；藏起来的路径 404
  const visiPage = await fetch(m.url + '/visi');
  assert.equal(visiPage.status, 200);
  assert.match(visiPage.headers.get('content-type'), /text\/html/);
  assert.equal((await fetch(m.url + '/brief')).status, 200);
  assert.equal((await fetch(m.url + '/')).status, 200);
  const vocab = await fetch(m.url + '/assets/js/visi/case-vocab.js');
  assert.equal(vocab.status, 200);
  assert.match(vocab.headers.get('content-type'), /javascript/);
  for (const hidden of ['/package.json', '/package-lock.json', '/api/_lib/auth.js', '/api/_lib/blob.js', '/node_modules/@vercel/blob/package.json', '/tools/caselib/mock-server.mjs', '/api/nope', '/nope.html']) {
    assert.equal((await fetch(m.url + hidden)).status, 404, hidden);
  }
  assert.equal(await rawGet(m.url, '/../package.json'), 404, 'path traversal');
  assert.equal(await rawGet(m.url, '/%2e%2e/%2e%2e/package.json'), 404, 'encoded traversal');
  assert.equal(await rawGet(m.url, '/assets/../package.json'), 404);

  // 测试钩子：API 整个挂掉
  const down = await fetch(m.blob + '__mock/down?on=1', { method: 'POST' });
  assert.deepEqual(await down.json(), { down: true });
  assert.equal((await call('GET', '/api/catalog')).status, 500);
  m.setDown(false);
  assert.equal((await call('GET', '/api/catalog')).status, 200);
  const stats = await (await fetch(m.blob + '__mock/stats')).json();
  assert.equal(typeof stats.puts, 'number');

  // 登出
  const out = await call('DELETE', '/api/session');
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
});

// 启动 CLI，读第一行 JSON
function startCli(args) {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, [MOCK, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill(); fail(new Error('mock CLI did not start: ' + err)); }, 10000);
    child.stdout.on('data', (d) => {
      out += d;
      const nl = out.indexOf('\n');
      if (nl >= 0) { clearTimeout(timer); ok({ child, info: JSON.parse(out.slice(0, nl)) }); }
    });
    child.stderr.on('data', (d) => { err += d; });
    child.on('exit', (code) => { clearTimeout(timer); if (!out) fail(new Error('mock CLI exited ' + code + ': ' + err)); });
  });
}
function stopCli(child) {
  return new Promise((ok) => { child.once('exit', () => ok()); child.kill('SIGTERM'); });
}

test('mock server CLI: --no-cors, --password, --seed', async (t) => {
  mkdirSync(SP, { recursive: true });
  // 假案例库：一个项目、一张照片、一个 blob
  const h = fakeH();
  const index = lib.catalog.emptyIndex();
  index.rev = 7;
  index.base = 'https://will-be-replaced.example/';
  lib.catalog.addPhotos(index, { project: { name: NAME }, photos: [{ ...photo(h), k: 'c/' + h + '-seedSeedSeedSeedSeed.jpg' }] }, 'Ana', Date.now());
  const seedFile = join(SP, 'mock-seed-' + process.pid + '.json');
  writeFileSync(seedFile, JSON.stringify({ index, blobs: { ['c/' + h + '-seedSeedSeedSeedSeed.jpg']: tinyJpeg().toString('base64') } }));

  const { child, info } = await startCli(['--port', '0', '--blob-port', '0', '--no-cors', '--password', 'cli-pass', '--seed', seedFile]);
  t.after(() => stopCli(child));
  assert.match(info.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(info.blob, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal((await login(info.url, 'test-pass')).r.status, 401, 'custom password in effect');
  const { cookie } = await login(info.url, 'cli-pass');
  const call = api(info.url, cookie);
  const cat = await call('GET', '/api/catalog?view=visi');
  assert.equal(cat.status, 200);
  assert.equal(cat.json.rev, 7);
  assert.equal(cat.json.base, info.blob, 'seed base rewritten to the mock blob URL');
  assert.ok(cat.json.photos[h]);
  assert.ok(!cat.text.includes('测试客户'));
  const img = await fetch(cat.json.base + cat.json.photos[h].k);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('access-control-allow-origin'), null, '--no-cors → no CORS header');
  assert.ok(Buffer.from(await img.arrayBuffer()).equals(tinyJpeg()));
  // 上传也一样没有 CORS
  const h2 = fakeH();
  const up = await call('POST', '/api/photo?h=' + h2, tinyJpeg(), { 'Content-Type': 'image/jpeg' });
  assert.equal(up.status, 200);
  assert.equal((await fetch(up.json.url)).headers.get('access-control-allow-origin'), null);
  // HTTP 钩子
  await fetch(info.blob + '__mock/conflictNext?n=2', { method: 'POST' });
  const add = await call('POST', '/api/catalog', { op: 'addPhotos', project: { name: NAME }, photos: [{ ...photo(h2), k: up.json.k, sig: up.json.sig }] });
  assert.equal(add.json.rev, 8);
  const stats = await (await fetch(info.blob + '__mock/stats')).json();
  assert.equal(stats.conflicts, 2);
  await fetch(info.blob + '__mock/failNextPut?n=1', { method: 'POST' });
  const failed = await call('POST', '/api/photo?h=' + h2, tinyJpeg(), { 'Content-Type': 'image/jpeg' });
  assert.equal(failed.status, 500);
  assert.equal(failed.json.error, 'storage');
  const full = await (await fetch(info.blob + '__mock/index')).json();
  assert.equal(full.projects[lib.catalog.pidOf(NAME)].n, 2);
});

test('mock server: two in-process instances keep separate storage (CORS on / off)', async (t) => {
  const a = await startMock({ port: 0 });
  const b = await startMock({ port: 0, cors: false });
  t.after(() => Promise.all([a.close(), b.close()]));
  const ca = api(a.url, (await login(a.url)).cookie);
  const cb = api(b.url, (await login(b.url)).cookie);
  const h = fakeH();
  const up = await ca('POST', '/api/photo?h=' + h, tinyJpeg(), { 'Content-Type': 'image/jpeg' });
  await ca('POST', '/api/catalog', { op: 'addPhotos', project: { name: NAME }, photos: [{ ...photo(h), k: up.json.k, sig: up.json.sig }] });
  assert.equal((await ca('GET', '/api/catalog')).json.rev, 1);
  assert.equal((await cb('GET', '/api/catalog')).json.rev, 0, 'other instance untouched');
  assert.equal(a.adapter.stats().puts, 2);
  assert.equal(b.adapter.stats().puts, 0);
  assert.equal((await fetch(up.json.url)).headers.get('access-control-allow-origin'), '*');
  const upB = await cb('POST', '/api/photo?h=' + h, tinyJpeg(), { 'Content-Type': 'image/jpeg' });
  assert.ok(upB.json.url.startsWith(b.blob));
  assert.equal((await fetch(upB.json.url)).headers.get('access-control-allow-origin'), null);
});
