// 三个 handler：用假的 req / res 直接呼叫（不开 port）
import test from 'node:test';
import assert from 'node:assert/strict';
import { lib, handlers, call, writeHeaders, cookieFor, tinyJpeg, tinyThumb, photo, fakeH, withEnv, API } from '../testkit.mjs';

const sessionMod = await import(API + 'session.js');

const { memoryAdapter, setAdapter, realAdapter, indexPath } = lib.blob;
const K = lib.catalog;
const NAME = 'Setia Alam 原木 测试客户';
const ENV = { VISI_TEAM_PASSWORD: 'team-pass', SESSION_SECRET: 'unit-secret', BLOB_READ_WRITE_TOKEN: null, CATALOG_KEY: null, VERCEL_ENV: null };

// 每个测试一个新的记忆体 adapter + 固定环境变数
function setup(t) {
  const old = {};
  for (const k of Object.keys(ENV)) { old[k] = process.env[k]; if (ENV[k] == null) delete process.env[k]; else process.env[k] = ENV[k]; }
  const a = memoryAdapter({ base: 'http://blob.test/' });
  setAdapter(a);
  sessionMod.resetLoginLimiter();
  t.after(() => { setAdapter(null); sessionMod.resetLoginLimiter(); for (const k of Object.keys(old)) { if (old[k] == null) delete process.env[k]; else process.env[k] = old[k]; } });
  return a;
}
const auth = (extra) => writeHeaders({ cookie: cookieFor('Ana'), ...(extra || {}) });

/* ---------- /api/session ---------- */
test('session: 503 when the team password is not configured', async (t) => {
  setup(t);
  delete process.env.VISI_TEAM_PASSWORD;
  const r = await call(handlers.session, { method: 'POST', headers: writeHeaders(), body: { name: 'Ana', password: 'x' } });
  assert.equal(r.status, 503);
  assert.deepEqual(r.json, { error: 'not_configured' });
  assert.equal((await call(handlers.session, {})).status, 503);
});

test('session: GET 401 without cookie, 401 with tampered cookie, 200 with a good one', async (t) => {
  setup(t);
  const r = await call(handlers.session, {});
  assert.equal(r.status, 401);
  assert.deepEqual(r.json, { error: 'login' });
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.headers['content-type'], 'application/json; charset=utf-8');
  const good = cookieFor('Ana');
  const bad = good.slice(0, -3) + (good.slice(-3) === 'AAA' ? 'BBB' : 'AAA');
  assert.equal((await call(handlers.session, { headers: { cookie: bad } })).status, 401);
  assert.equal((await call(handlers.session, { headers: { cookie: cookieFor('Ana', { exp: Date.now() - 1 }) } })).status, 401, 'expired');
  const ok = await call(handlers.session, { headers: { cookie: good } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json, { name: 'Ana' });
});

test('session: POST needs X-VISI and same-site Origin (403 cross_site)', async (t) => {
  setup(t);
  const body = { name: 'Ana', password: 'team-pass' };
  const noHeader = await call(handlers.session, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  assert.equal(noHeader.status, 403);
  assert.deepEqual(noHeader.json, { error: 'cross_site' });
  const cross = await call(handlers.session, { method: 'POST', headers: writeHeaders({ origin: 'https://evil.example' }), body });
  assert.equal(cross.status, 403);
  const nullOrigin = await call(handlers.session, { method: 'POST', headers: writeHeaders({ origin: 'null' }), body });
  assert.equal(nullOrigin.status, 403);
  const sameSite = await call(handlers.session, { method: 'POST', headers: writeHeaders({ origin: 'https://visi.example.test' }), body });
  assert.equal(sameSite.status, 200);
  const wrongPort = await call(handlers.session, { method: 'POST', headers: writeHeaders({ host: '127.0.0.1:4000', origin: 'http://127.0.0.1:4001' }), body });
  assert.equal(wrongPort.status, 403);
});

test('session: login sets the cookie; bad name 400; wrong password 401 after ~700 ms', async (t) => {
  setup(t);
  const ok = await call(handlers.session, { method: 'POST', headers: writeHeaders(), body: { name: '  Mei   Ling ', password: 'team-pass' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json, { name: 'Mei Ling' });
  const c = ok.headers['set-cookie'];
  assert.match(c, /^visi_s=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+; Path=\/api; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/);
  const token = c.split(';')[0];
  assert.deepEqual((await call(handlers.session, { headers: { cookie: token } })).json, { name: 'Mei Ling' });
  const local = await call(handlers.session, { method: 'POST', headers: writeHeaders({ host: '127.0.0.1:5000' }), body: { name: 'Ana', password: 'team-pass' } });
  assert.ok(!local.headers['set-cookie'].includes('Secure'), 'no Secure on 127.0.0.1');

  for (const name of ['', '   ', 'x'.repeat(31), 42, null]) {
    const r = await call(handlers.session, { method: 'POST', headers: writeHeaders(), body: { name, password: 'team-pass' } });
    assert.equal(r.status, 400, JSON.stringify(name));
    assert.deepEqual(r.json, { error: 'name' });
  }
  const t0 = Date.now();
  const wrong = await call(handlers.session, { method: 'POST', headers: writeHeaders(), body: { name: 'Ana', password: 'nope' } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.json, { error: 'password' });
  assert.ok(Date.now() - t0 >= 650, 'slowed down');
  assert.equal(wrong.headers['set-cookie'], undefined);
  const badJson = await call(handlers.session, { method: 'POST', headers: writeHeaders(), body: '{not json' });
  assert.equal(badJson.status, 400);
  assert.deepEqual(badJson.json, { error: 'json' });
});

test('session: password change logs the old cookie out', async (t) => {
  setup(t);
  const c = cookieFor('Ana');
  assert.equal((await call(handlers.session, { headers: { cookie: c } })).status, 200);
  process.env.VISI_TEAM_PASSWORD = 'new-team-pass';
  assert.equal((await call(handlers.session, { headers: { cookie: c } })).status, 401);
});

test('session: DELETE clears the cookie; other methods 405', async (t) => {
  setup(t);
  assert.equal((await call(handlers.session, { method: 'DELETE', headers: {} })).status, 403, 'needs X-VISI');
  const r = await call(handlers.session, { method: 'DELETE', headers: writeHeaders() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, {});
  assert.match(r.headers['set-cookie'], /^visi_s=; .*Max-Age=0/);
  const put = await call(handlers.session, { method: 'PUT', headers: writeHeaders() });
  assert.equal(put.status, 405);
  assert.equal(put.headers.allow, 'GET, POST, DELETE');
});

/* ---------- /api/photo ---------- */
const H = 'a1b2c3d4e5f60718';
const jpegHeaders = (extra) => auth({ 'content-type': 'image/jpeg', ...(extra || {}) });

test('photo: 403 / 401 / 400 / 415 / 405', async (t) => {
  setup(t);
  const body = tinyJpeg();
  assert.equal((await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: { cookie: cookieFor('Ana'), 'content-type': 'image/jpeg' }, body })).status, 403, 'missing X-VISI');
  assert.equal((await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: jpegHeaders({ origin: 'https://evil.example' }), body })).status, 403, 'cross-site');
  const anon = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: { 'x-visi': '1', 'content-type': 'image/jpeg' }, body });
  assert.equal(anon.status, 401);
  assert.deepEqual(anon.json, { error: 'login' });
  for (const h of ['', 'A1B2C3D4E5F60718', 'a1b2', 'a1b2c3d4e5f60718aa', '../../catalog/x']) {
    const r = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + encodeURIComponent(h), headers: jpegHeaders(), body });
    assert.equal(r.status, 400, h);
    assert.deepEqual(r.json, { error: 'h' });
  }
  const png = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: jpegHeaders({ 'content-type': 'image/png' }), body });
  assert.equal(png.status, 415);
  const notJpeg = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: jpegHeaders(), body: Buffer.from('GIF89a....') });
  assert.equal(notJpeg.status, 415);
  assert.deepEqual(notJpeg.json, { error: 'not_jpeg' });
  const empty = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: jpegHeaders(), body: Buffer.alloc(0) });
  assert.equal(empty.status, 415);
  assert.equal((await call(handlers.photo, { method: 'GET', url: '/api/photo?h=' + H })).status, 405);
});

test('photo: 413 over 3.5 MB (declared or streamed), exactly 3.5 MB is fine', async (t) => {
  const a = setup(t);
  const max = 3.5 * 1024 * 1024;
  const big = Buffer.alloc(max + 1, 0x11);
  big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
  const r = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: jpegHeaders(), body: big });
  assert.equal(r.status, 413);
  assert.deepEqual(r.json, { error: 'too_large' });
  const chunked = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: jpegHeaders(), body: big, chunked: true });
  assert.equal(chunked.status, 413, 'no content-length');
  assert.equal(a.stats().puts, 0);
  const exact = Buffer.alloc(max, 0x11);
  exact[0] = 0xff; exact[1] = 0xd8; exact[2] = 0xff;
  assert.equal((await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: jpegHeaders(), body: exact })).status, 200);
});

test('photo: stores c/<h>-suffix.jpg publicly and returns {k, url}', async (t) => {
  const a = setup(t);
  const r = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: jpegHeaders({ 'content-type': 'image/jpeg; charset=binary' }), body: tinyJpeg() });
  assert.equal(r.status, 200);
  assert.match(r.json.k, new RegExp('^c/' + H + '-[A-Za-z0-9]+\\.jpg$'));
  assert.equal(r.json.url, 'http://blob.test/' + r.json.k);
  const b = a.read(r.json.k);
  assert.equal(b.type, 'image/jpeg');
  assert.ok(b.body.equals(tinyJpeg()));
  // 同一张传两次 → 两个不同的随机后缀（客户端用 IndexedDB 日志避免重传）
  const r2 = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: jpegHeaders(), body: tinyJpeg() });
  assert.notEqual(r2.json.k, r.json.k);
});

test('photo: storage failure → 500 {error:"storage"}', async (t) => {
  const a = setup(t);
  a.failNextPut(1);
  const r = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: jpegHeaders(), body: tinyJpeg() });
  assert.equal(r.status, 500);
  assert.equal(r.json.error, 'storage');
});

test('real adapter without BLOB_READ_WRITE_TOKEN → 500 storage with a clear message', async (t) => {
  setup(t);
  setAdapter(null); // getAdapter() 会建立真的 adapter
  const p = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: jpegHeaders(), body: tinyJpeg() });
  assert.equal(p.status, 500);
  assert.equal(p.json.error, 'storage');
  assert.match(p.json.message, /BLOB_READ_WRITE_TOKEN/);
  const g = await call(handlers.catalog, { url: '/api/catalog?view=full', headers: { cookie: cookieFor('Ana') } });
  assert.equal(g.status, 500);
  assert.match(g.json.message, /BLOB_READ_WRITE_TOKEN/);
});

/* ---------- /api/catalog ---------- */
async function addVia(body, headers) {
  return call(handlers.catalog, { method: 'POST', url: '/api/catalog', headers: headers || auth(), body: { op: 'addPhotos', ...body } });
}

test('catalog: GET needs login; empty catalog → emptyIndex rev 0 with ETag', async (t) => {
  setup(t);
  assert.equal((await call(handlers.catalog, { url: '/api/catalog' })).status, 401);
  const r = await call(handlers.catalog, { url: '/api/catalog?view=full', headers: { cookie: cookieFor('Ana') } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.etag, '"rev-0"');
  assert.equal(r.json.rev, 0);
  assert.deepEqual(r.json.photos, {});
  assert.equal(r.json.base, 'http://blob.test/');
  assert.equal((await call(handlers.catalog, { url: '/api/catalog?view=raw', headers: { cookie: cookieFor('Ana') } })).status, 400);
  assert.equal((await call(handlers.catalog, { method: 'DELETE', headers: auth() })).status, 405);
});

test('catalog: addPhotos writes the thumb pack then the index; idempotent; dup across projects', async (t) => {
  const a = setup(t);
  const h1 = fakeH(), h2 = fakeH();
  const r = await addVia({ project: { name: NAME }, photos: [photo(h1), photo(h2)], thumbs: { [h1]: tinyThumb(), [h2]: tinyThumb(), ['f'.repeat(16)]: tinyThumb() } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(Object.keys(r.json).sort(), ['added', 'dup', 'pid', 'rev']);
  assert.equal(r.json.pid, K.pidOf(NAME));
  assert.deepEqual(r.json.added, [h1, h2]);
  assert.equal(r.json.rev, 1);
  const ix = (await a.getJson(indexPath())).data;
  const pr = ix.projects[r.json.pid];
  assert.equal(pr.packs.length, 1);
  // 包名由这批照片决定（固定、不加随机后缀；带 HMAC 猜不到）
  assert.match(pr.packs[0], new RegExp('^t/' + r.json.pid + '-[0-9a-f]{24}\\.json$'));
  assert.equal(pr.packs[0], lib.auth.packName(r.json.pid, [h1, h2].sort()));
  const pack = JSON.parse(a.read(pr.packs[0]).body.toString());
  assert.deepEqual(Object.keys(pack).sort(), [h1, h2].sort(), 'only this call\'s photos');
  assert.equal(pack[h1], tinyThumb());
  assert.equal(ix.log[0].by, 'Ana');
  // 再送一次（连缩图一起）：不新增、不写缩图包、不写清单
  const puts = a.stats().puts;
  const again = await addVia({ project: { name: NAME }, photos: [photo(h1), photo(h2)], thumbs: { [h1]: tinyThumb(), [h2]: tinyThumb() } });
  assert.deepEqual([again.json.added, again.json.dup, again.json.rev], [[], [], 1]);
  assert.equal(a.stats().puts, puts, 'zero writes on re-send');
  // 一半新、一半旧：缩图包只放新的；冲突重试不重写包
  const h4 = fakeH();
  a.conflictNext(2);
  const half = await addVia({ project: { name: NAME }, photos: [photo(h1), photo(h4)], thumbs: { [h1]: tinyThumb(), [h4]: tinyThumb() } });
  assert.deepEqual(half.json.added, [h4]);
  assert.equal(a.stats().puts, puts + 2, 'one pack + one index write despite 2 conflicts');
  const packs = (await a.getJson(indexPath())).data.projects[r.json.pid].packs;
  assert.equal(packs.length, 2);
  assert.deepEqual(Object.keys(JSON.parse(a.read(packs[1]).body.toString())), [h4]);
  // 别的项目里同一张
  const h3 = fakeH();
  const other = await addVia({ project: { name: 'Klang 北欧 测试客户丙' }, photos: [photo(h1), photo(h3)] });
  assert.deepEqual(other.json.added, [h3]);
  assert.deepEqual(other.json.dup, [h1]);
  assert.equal(other.json.rev, 3);
  assert.equal((await a.getJson(indexPath())).data.photos[h1].p, r.json.pid);
});

test('catalog: addPhotos validation (bad thumb, too many, bad project) writes nothing', async (t) => {
  const a = setup(t);
  const h = fakeH();
  const badThumb = await addVia({ project: { name: NAME }, photos: [photo(h)], thumbs: { [h]: 'data:image/png;base64,AAAA' } });
  assert.equal(badThumb.status, 400);
  assert.equal(badThumb.json.error, 'thumb');
  const script = await addVia({ project: { name: NAME }, photos: [photo(h)], thumbs: { [h]: 'data:image/jpeg;base64,AAAA"><script>' } });
  assert.equal(script.status, 400);
  const many = await addVia({ project: { name: NAME }, photos: Array.from({ length: 41 }, () => photo(fakeH())) });
  assert.equal(many.status, 400);
  assert.equal(many.json.error, 'too_many');
  const noName = await addVia({ project: {}, photos: [photo(h)] });
  assert.equal(noName.json.error, 'project');
  assert.equal(a.stats().puts, 0);
  assert.equal((await call(handlers.catalog, { method: 'POST', headers: auth(), body: { op: 'drop' } })).json.error, 'op');
});

test('catalog: writes need X-VISI / same Origin / login', async (t) => {
  setup(t);
  const body = { op: 'addPhotos', project: { name: NAME }, photos: [photo(fakeH())] };
  assert.equal((await call(handlers.catalog, { method: 'POST', headers: { cookie: cookieFor('Ana'), 'content-type': 'application/json' }, body })).status, 403);
  assert.equal((await call(handlers.catalog, { method: 'POST', headers: auth({ origin: 'https://evil.example' }), body })).status, 403);
  assert.equal((await call(handlers.catalog, { method: 'POST', headers: writeHeaders(), body })).status, 401);
});

test('catalog: GET visi strips name / f / log; full keeps them; ETag + 304', async (t) => {
  setup(t);
  const h = fakeH();
  await addVia({ project: { name: NAME }, photos: [photo(h)] });
  const c = { cookie: cookieFor('Ana') };
  const visi = await call(handlers.catalog, { url: '/api/catalog?view=visi', headers: c });
  assert.equal(visi.status, 200);
  assert.equal(visi.headers.etag, '"rev-1"');
  assert.ok(!visi.body.includes('测试客户'), 'no folder name in VISI view');
  assert.ok(!visi.body.includes('IMG_'), 'no file path in VISI view');
  assert.ok(!('log' in visi.json));
  assert.ok(visi.json.photos[h].k);
  const dflt = await call(handlers.catalog, { url: '/api/catalog', headers: c });
  assert.ok(!dflt.body.includes('测试客户'), 'default view is visi');
  const full = await call(handlers.catalog, { url: '/api/catalog?view=full', headers: c });
  assert.ok(full.body.includes('测试客户'));
  assert.ok(full.json.photos[h].f);
  assert.equal(full.json.log.length, 1);
  for (const inm of ['"rev-1"', 'W/"rev-1"', '"rev-0", "rev-1"']) {
    const nm = await call(handlers.catalog, { url: '/api/catalog?view=visi', headers: { ...c, 'if-none-match': inm } });
    assert.equal(nm.status, 304, inm);
    assert.equal(nm.body, '');
    assert.equal(nm.headers.etag, '"rev-1"');
    assert.equal(nm.headers['cache-control'], 'no-store');
  }
  assert.equal((await call(handlers.catalog, { url: '/api/catalog', headers: { ...c, 'if-none-match': '"rev-0"' } })).status, 200);
});

test('catalog: patch / hide / unhide through the handler', async (t) => {
  const a = setup(t);
  const h = fakeH();
  const add = await addVia({ project: { name: NAME }, photos: [photo(h)] });
  const pid = add.json.pid;
  const p = await call(handlers.catalog, { method: 'POST', headers: auth(), body: { op: 'patch', source: 'human', photos: { [h]: { room: 'kitchen', cabinets: ['kitchen'] } }, projects: { [pid]: { area: 'Setia Alam', ptype: 'terrace', traits: ['elderly'], style: 'wood' } } } });
  assert.equal(p.status, 200);
  assert.deepEqual(p.json, { rev: 2, changed: 2 });
  const v = await call(handlers.catalog, { method: 'POST', headers: auth(), body: { op: 'patch', source: 'auto', photos: { [h]: { room: 'garage' } } } });
  assert.equal(v.status, 400);
  assert.equal(v.json.error, 'vocab');
  assert.equal(v.json.field, 'room');
  const auto = await call(handlers.catalog, { method: 'POST', headers: { ...auth(), cookie: cookieFor('Claude') }, body: { op: 'patch', source: 'auto', photos: { [h]: { room: 'living' } } } });
  assert.deepEqual(auto.json, { rev: 2, changed: 0 }, 'confirmed photo untouched, nothing written');
  const hide = await call(handlers.catalog, { method: 'POST', headers: auth(), body: { op: 'hide', photos: [h], projects: [pid] } });
  assert.deepEqual(hide.json, { rev: 3, changed: 2 });
  let ix = (await a.getJson(indexPath())).data;
  assert.equal(ix.photos[h].hidden.by, 'Ana');
  assert.equal(ix.projects[pid].hidden.by, 'Ana');
  const un = await call(handlers.catalog, { method: 'POST', headers: auth(), body: { op: 'unhide', photos: [h] } });
  assert.deepEqual(un.json, { rev: 4, changed: 1 });
  ix = (await a.getJson(indexPath())).data;
  assert.ok(!ix.photos[h].hidden);
  assert.deepEqual(ix.log.map((l) => l.op), ['addPhotos', 'patch', 'hide', 'unhide']);
});

test('catalog: conflicts are retried; exhausted → 409; storage error → 500', async (t) => {
  const a = setup(t);
  const h = fakeH();
  await addVia({ project: { name: NAME }, photos: [photo(h)] });
  a.conflictNext(3);
  const ok = await call(handlers.catalog, { method: 'POST', headers: auth(), body: { op: 'hide', photos: [h] } });
  assert.equal(ok.status, 200);
  a.conflictNext(5);
  const gave = await call(handlers.catalog, { method: 'POST', headers: auth(), body: { op: 'unhide', photos: [h] } });
  assert.equal(gave.status, 409);
  assert.deepEqual(gave.json, { error: 'conflict' });
  a.failNextGet(1);
  const g = await call(handlers.catalog, { url: '/api/catalog', headers: { cookie: cookieFor('Ana') } });
  assert.equal(g.status, 500);
  assert.equal(g.json.error, 'storage');
});

test('catalog: index near 3.5 MB → 413 index_too_large, nothing written', async (t) => {
  const a = setup(t);
  const ix = K.emptyIndex();
  ix.rev = 1;
  ix.pad = 'x'.repeat(K.MAX_INDEX - 600);
  await a.putJson(indexPath(), JSON.stringify(ix), { create: true });
  const puts = a.stats().puts;
  const r = await addVia({ project: { name: NAME }, photos: [photo(fakeH()), photo(fakeH())] });
  assert.equal(r.status, 413);
  assert.deepEqual(r.json, { error: 'index_too_large' });
  assert.equal(a.stats().puts, puts);
});

test('catalog key: derived per environment and token, CATALOG_KEY overrides', () => {
  const k = (env) => withEnv({ CATALOG_KEY: null, VERCEL_ENV: null, BLOB_READ_WRITE_TOKEN: null, ...env }, () => lib.blob.indexPath());
  const prod = k({ VERCEL_ENV: 'production', BLOB_READ_WRITE_TOKEN: 'tok' });
  const prev = k({ VERCEL_ENV: 'preview', BLOB_READ_WRITE_TOKEN: 'tok' });
  assert.match(prod, /^catalog\/[0-9a-f]{24}\/index\.json$/);
  assert.notEqual(prod, prev, 'preview and production get different catalogs');
  assert.notEqual(prod, k({ VERCEL_ENV: 'production', BLOB_READ_WRITE_TOKEN: 'tok2' }));
  assert.equal(k({ CATALOG_KEY: 'myKey_123' }), 'catalog/myKey_123/index.json');
  assert.match(k({ CATALOG_KEY: '../../evil' }), /^catalog\/[0-9a-f]{24}\/index\.json$/, 'unsafe key is hashed');
  assert.ok(!prod.includes('tok'));
});

/* ---------- 真的 adapter，换成假的 SDK 模组 ---------- */
class FakePrecondition extends Error { constructor() { super('Precondition failed: ETag mismatch.'); this.name = 'BlobPreconditionFailedError'; } }
function fakeSdk() {
  const calls = [];
  const files = new Map();
  const host = 'https://store1.public.blob.vercel-storage.com/';
  let n = 0;
  const sdk = {
    BlobPreconditionFailedError: FakePrecondition,
    calls,
    files,
    async put(pathname, body, o) {
      calls.push(['put', pathname, o]);
      const cur = files.get(pathname);
      if (o.ifMatch && (!cur || cur.etag !== o.ifMatch)) throw new FakePrecondition();
      if (!o.ifMatch && !o.allowOverwrite && cur && !o.addRandomSuffix) throw new Error('Vercel Blob: This blob already exists, use `allowOverwrite: true` if you want to overwrite it.');
      const p = o.addRandomSuffix ? pathname.replace(/(\.[a-z]+)$/, '-Rnd' + (++n) + '$1') : pathname;
      const etag = '"e' + (++n) + '"';
      files.set(p, { body: String(body), etag });
      return { url: host + p, pathname: p, etag, contentType: o.contentType };
    },
    async get(target, o) {
      calls.push(['get', target, o]);
      const p = target.startsWith('https://') ? new URL(target).pathname.slice(1) : target;
      const f = files.get(p);
      if (!f) return null;
      return { statusCode: 200, stream: new Response(f.body).body, blob: { url: host + p, pathname: p, etag: f.etag } };
    },
    async copy(from, to, o) { calls.push(['copy', from, to, o]); files.set(to, { ...files.get(from) }); return { url: host + to, pathname: to }; }
  };
  return sdk;
}

test('realAdapter: SDK call shapes, conflict mapping, base learning (fake SDK)', async () => {
  await withEnv({ BLOB_READ_WRITE_TOKEN: 'fake_blob_token_store1_fake' }, async () => {
    const sdk = fakeSdk();
    const a = realAdapter({ load: async () => sdk });
    assert.equal(await a.getJson('catalog/k/index.json'), null);
    // 第一次建立：没有 ifMatch、没有 allowOverwrite
    const c1 = await a.putJson('catalog/k/index.json', '{"v":1,"rev":1}', { create: true });
    assert.ok(sdk.calls.at(-1)[2].abortSignal instanceof AbortSignal, 'every SDK call has a timeout');
    assert.deepEqual(noSig(sdk.calls.at(-1)[2]), { access: 'public', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60 });
    assert.equal(process.env.VERCEL_BLOB_RETRIES, '2', 'SDK retries capped');
    assert.equal(a.base, 'https://store1.public.blob.vercel-storage.com/');
    // 别人先建了 → 冲突
    await assert.rejects(a.putJson('catalog/k/index.json', '{}', { create: true }), (e) => e.code === 'conflict');
    // 条件更新：ifMatch + allowOverwrite
    const got = await a.getJson('catalog/k/index.json');
    assert.deepEqual(got.data, { v: 1, rev: 1 });
    assert.equal(got.etag, c1.etag);
    assert.deepEqual([sdk.calls.at(-1)[1], noSig(sdk.calls.at(-1)[2])], ['catalog/k/index.json', { access: 'public', useCache: false }]);
    assert.ok(sdk.calls.at(-1)[2].abortSignal instanceof AbortSignal);
    await a.putJson('catalog/k/index.json', '{"v":1,"rev":2}', { ifMatch: got.etag });
    assert.equal(sdk.calls.at(-1)[2].ifMatch, got.etag);
    assert.equal(sdk.calls.at(-1)[2].allowOverwrite, true);
    await assert.rejects(a.putJson('catalog/k/index.json', '{}', { ifMatch: got.etag }), (e) => e.code === 'conflict', 'stale etag');
    // 重试时用一次性网址绕过 CDN
    await a.getJson('catalog/k/index.json', { fresh: true });
    assert.match(sdk.calls.at(-1)[1], /^https:\/\/store1\.public\.blob\.vercel-storage\.com\/catalog\/k\/index\.json\?nc=[a-z0-9]+$/);
    // 照片：公开、随机后缀、快取一年
    const f = await a.putFile('c/' + H + '.jpg', tinyJpeg(), 'image/jpeg');
    assert.deepEqual(noSig(sdk.calls.at(-1)[2]), { access: 'public', addRandomSuffix: true, contentType: 'image/jpeg', cacheControlMaxAge: 31536000 });
    assert.match(f.pathname, new RegExp('^c/' + H + '-Rnd\\d+\\.jpg$'));
    await a.copy('catalog/k/index.json', 'catalog/k/bak/2026-11-02.json');
    assert.equal(sdk.calls.at(-1)[0], 'copy');
    assert.equal(sdk.calls.at(-1)[3].access, 'public');
    // 固定路径（缩图包）：不加随机后缀；已经有了就直接用，不算错
    const fx1 = await a.putFile('t/p0123456789-abc.json', '{}', 'application/json', { fixed: true });
    assert.equal(noSig(sdk.calls.at(-1)[2]).addRandomSuffix, false);
    assert.equal(fx1.pathname, 't/p0123456789-abc.json');
    const fx2 = await a.putFile('t/p0123456789-abc.json', '{}', 'application/json', { fixed: true });
    assert.deepEqual([fx2.pathname, fx2.existed], ['t/p0123456789-abc.json', true]);
    // 其它错误（限流、网路断）包成 storage 错误；限流 → 429 带秒数
    const boom = realAdapter({ load: async () => ({ ...sdk, put: async () => { const e = new Error('rate limited'); e.name = 'BlobServiceRateLimited'; e.retryAfter = 30; throw e; }, get: async () => { throw new TypeError('fetch failed'); } }) });
    await assert.rejects(boom.putJson('x.json', '{}', { ifMatch: '"1"' }), (e) => e.code === 'storage' && e.status === 429 && e.error === 'storage_busy' && e.retryAfter === 30 && /BlobServiceRateLimited: rate limited/.test(e.message));
    await assert.rejects(boom.putFile('c/x.jpg', tinyJpeg(), 'image/jpeg'), (e) => e.code === 'storage');
    await assert.rejects(boom.getJson('x.json'), (e) => e.code === 'storage' && e.status === 500 && /fetch failed/.test(e.message));
  });
});
function noSig(o) { const x = { ...o }; delete x.abortSignal; return x; }

test('realAdapter + mutate end to end on the fake SDK (including a racing creator)', async () => {
  await withEnv({ BLOB_READ_WRITE_TOKEN: 'fake_blob_token_store1_fake' }, async () => {
    const sdk = fakeSdk();
    const a = realAdapter({ load: async () => sdk });
    const path = 'catalog/k/index.json';
    const h = fakeH();
    // 读的时候还没有清单，写之前别人先建好 → 第一次 create 冲突，第二轮改成更新
    let raced = false;
    const r = await K.mutate(a, path, async (ix, ts) => {
      if (!raced) { raced = true; await sdk.put(path, JSON.stringify({ ...K.emptyIndex(), rev: 1 }), { access: 'public', addRandomSuffix: false }); }
      return K.addPhotos(ix, { project: { name: NAME }, photos: [photo(h)] }, 'Ana', ts);
    }, { by: 'Ana', op: 'addPhotos', sleep: () => Promise.resolve() });
    assert.equal(r.rev, 2);
    const stored = JSON.parse(sdk.files.get(path).body);
    assert.equal(stored.photos[h].p, K.pidOf(NAME));
    assert.equal(stored.base, 'https://store1.public.blob.vercel-storage.com/');
  });
});

test('real adapter: network failure on GET catalog → 500 storage (not a generic server error)', async (t) => {
  setup(t);
  process.env.BLOB_READ_WRITE_TOKEN = 'fake_blob_token_fake_fake';
  setAdapter(realAdapter({ load: async () => ({ get: async () => { throw new TypeError('fetch failed'); } }) }));
  const g = await call(handlers.catalog, { url: '/api/catalog', headers: { cookie: cookieFor('Ana') } });
  assert.equal(g.status, 500);
  assert.equal(g.json.error, 'storage');
  assert.match(g.json.message, /fetch failed/);
  assert.ok(!g.body.includes('fake_blob_token'), 'token never echoed');
});

test('http.readRaw/readJson: works when the platform already consumed the stream', async () => {
  const { Readable } = await import('node:stream');
  const { readJson, readRaw } = lib.http;
  const used = Readable.from([Buffer.from('ignored')]);
  for await (const _ of used) { /* 读完 */ }
  assert.equal(used.readableEnded, true);
  used.headers = {};
  used.body = { op: 'hide', photos: [] };
  assert.deepEqual(await readJson(used, 1000), { op: 'hide', photos: [] });
  const raw = Readable.from([]);
  for await (const _ of raw) { /* 读完 */ }
  raw.headers = {};
  raw.rawBody = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  assert.equal((await readRaw(raw, 1000)).length, 4);
  await assert.rejects(readRaw(raw, 2), (e) => e.status === 413);
});

/* ============================================================
   复审修正的测试
   ============================================================ */
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { INVITE } from '../testkit.mjs';

/* ---------- security-1：猜密码的上限（同一个 IP 5 次、全部 30 次 / 10 分钟） ---------- */
test('session: wrong passwords are rate limited per IP and globally (429 slow_down, even for the right password)', async (t) => {
  setup(t);
  const from = (ip, password) => call(handlers.session, { method: 'POST', headers: writeHeaders({ 'x-forwarded-for': ip + ', 10.0.0.1' }), body: { name: 'Ana', password } });
  // 同时送 6 个错的：第 6 个一定被挡（700 ms 的延迟挡不住并发）
  const t0 = Date.now();
  const burst = await Promise.all(Array.from({ length: 6 }, () => from('203.0.113.7', 'guess')));
  assert.deepEqual(burst.map((r) => r.status).sort(), [401, 401, 401, 401, 401, 429]);
  assert.ok(Date.now() - t0 < 3000, 'parallel');
  const slow = burst.find((r) => r.status === 429);
  assert.equal(slow.json.error, 'slow_down');
  assert.ok(slow.json.retryAfter > 500 && slow.json.retryAfter <= 600, 'about 10 minutes: ' + slow.json.retryAfter);
  assert.equal(slow.headers['retry-after'], String(slow.json.retryAfter));
  // 被挡的 IP：连对的密码都不比（不然挡了等于没挡）
  const right = await from('203.0.113.7', 'team-pass');
  assert.equal(right.status, 429);
  assert.equal(right.headers['set-cookie'], undefined);
  // 别的 IP 照样能登入；x-real-ip 优先
  assert.equal((await from('198.51.100.2', 'team-pass')).status, 200);
  const real = await call(handlers.session, { method: 'POST', headers: writeHeaders({ 'x-real-ip': '198.51.100.9', 'x-forwarded-for': '203.0.113.7' }), body: { name: 'Ana', password: 'team-pass' } });
  assert.equal(real.status, 200);
  // 换很多个 IP 来猜：全部加起来 30 次就整个挡下
  let blocked = 0;
  for (let i = 0; i < 40; i++) {
    const r = await Promise.race([from('192.0.2.' + i, 'guess-' + i), new Promise((ok) => setTimeout(() => ok({ status: 'slow' }), 50))]);
    if (r.status === 429) blocked++;
  }
  await new Promise((ok) => setTimeout(ok, 800));
  assert.ok(blocked >= 14, 'global cap kicks in after 30 failures: ' + blocked);
  assert.equal((await from('198.51.100.3', 'team-pass')).status, 429, 'global cap blocks new logins too');
  // 已登入的人不受影响
  assert.equal((await call(handlers.session, { headers: { cookie: cookieFor('Ana') } })).status, 200);
  // 10 分钟后自己解开（用测试钩子清掉）
  sessionMod.resetLoginLimiter();
  assert.equal((await from('203.0.113.7', 'team-pass')).status, 200);
});

/* ---------- security-2：继承来的名字（__proto__）经过 handler 也挡下 ---------- */
test('catalog: hide / patch with __proto__ / constructor ids → 400, Object.prototype untouched', async (t) => {
  const a = setup(t);
  const h = fakeH();
  await addVia({ project: { name: NAME }, photos: [photo(h)] });
  const puts = a.stats().puts;
  for (const id of ['__proto__', 'constructor', 'toString']) {
    const hide = await call(handlers.catalog, { method: 'POST', headers: auth(), body: '{"op":"hide","photos":["' + id + '"]}' });
    assert.equal(hide.status, 400, 'hide ' + id);
    assert.equal(hide.json.error, 'unknown');
    const pj = await call(handlers.catalog, { method: 'POST', headers: auth(), body: '{"op":"hide","projects":["' + id + '"]}' });
    assert.equal(pj.status, 400, 'hide project ' + id);
    const p = await call(handlers.catalog, { method: 'POST', headers: auth(), body: '{"op":"patch","source":"human","photos":{"' + id + '":{"room":"kitchen"}}}' });
    assert.equal(p.status, 400, 'patch ' + id + ' (was a 500 for constructor)');
    assert.equal(p.json.error, 'unknown');
  }
  assert.equal(({}).hidden, undefined);
  assert.equal(a.stats().puts, puts, 'nothing written');
  // 之后隐藏一张真的照片：真的写进去
  const real = await call(handlers.catalog, { method: 'POST', headers: auth(), body: { op: 'hide', photos: [h] } });
  assert.deepEqual([real.status, real.json.changed], [200, 1]);
  assert.ok((await a.getJson(indexPath())).data.photos[h].hidden);
});

/* ---------- security-3：只登记 /api/photo 真的存好的照片 ---------- */
test('catalog: addPhotos needs the sig /api/photo returned (phantom photos rejected, nothing written)', async (t) => {
  const a = setup(t);
  const up = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: jpegHeaders(), body: tinyJpeg() });
  assert.equal(up.status, 200);
  assert.match(up.json.sig, /^[A-Za-z0-9_-]{32}$/);
  const puts = a.stats().puts;
  const base = { h: H, k: up.json.k, w: 8, ht: 8, sz: 600, dh: 'f0f0f0f0f0f0f0f0', f: 'IMG.jpg' };
  // 没有签章 / 签章是别张的 / 伪造的
  const fake = 'c/' + H + '-PhantomPhantomPhantom.jpg';
  for (const [why, x] of [['no sig', base], ['sig for another k', { ...base, k: fake, sig: up.json.sig }], ['forged', { ...base, sig: 'A'.repeat(32) }], ['not a string', { ...base, sig: 12 }]]) {
    const r = await addVia({ project: { name: NAME }, photos: [x] });
    assert.equal(r.status, 400, why);
    assert.deepEqual([r.json.error, r.json.field, r.json.h], ['photo', 'sig', H], why);
  }
  assert.equal(a.stats().puts, puts, 'no index write, no pack');
  const ok = await addVia({ project: { name: NAME }, photos: [{ ...base, sig: up.json.sig }] });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.added, [H]);
  // 换团队密码之前传好的照片：签章不含密码，照样登记得进去
  process.env.VISI_TEAM_PASSWORD = 'changed-pass';
  const up2 = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + 'b'.repeat(16), headers: writeHeaders({ cookie: cookieFor('Ana'), 'content-type': 'image/jpeg' }), body: tinyJpeg() });
  assert.equal(up2.status, 200);
  assert.ok(lib.auth.checkPhotoSig('b'.repeat(16), up2.json.k, up2.json.sig));
});

/* ---------- blob-5：缩图包的名字固定：登记失败再重送不会多一包 ---------- */
test('catalog: a failed commit (409) then a retry reuses the same thumb pack (no orphan pack)', async (t) => {
  const a = setup(t);
  const h1 = fakeH(), h2 = fakeH();
  const body = { project: { name: NAME }, photos: [photo(h1), photo(h2)], thumbs: { [h1]: tinyThumb(), [h2]: tinyThumb() } };
  for (let i = 0; i < 2; i++) {
    a.conflictNext(5);
    const r = await addVia(body);
    assert.equal(r.status, 409);
  }
  const ok = await addVia(body);
  assert.equal(ok.status, 200);
  const packs = [...a.store.keys()].filter((k) => k.indexOf('t/') === 0);
  assert.equal(packs.length, 1, 'one pack blob for three tries: ' + packs.join(', '));
  assert.deepEqual((await a.getJson(indexPath())).data.projects[ok.json.pid].packs, packs);
});

/* ---------- blob-3：清单里的 usage 跟着 handler 写入一起算 ---------- */
test('catalog: usage counter in the index counts photo puts, the pack and the index write', async (t) => {
  const a = setup(t);
  const h1 = fakeH(), h2 = fakeH();
  await addVia({ project: { name: NAME }, photos: [photo(h1), photo(h2)], thumbs: { [h1]: tinyThumb() } });
  const m = new Date().toISOString().slice(0, 7);
  assert.deepEqual((await a.getJson(indexPath())).data.usage, { [m]: { writes: 2 + 1 + 1 } });
  await call(handlers.catalog, { method: 'POST', headers: auth(), body: { op: 'hide', photos: [h1] } });
  assert.equal((await a.getJson(indexPath())).data.usage[m].writes, 5);
  const visi = await call(handlers.catalog, { url: '/api/catalog?view=full', headers: { cookie: cookieFor('Ana') } });
  assert.equal(visi.json.usage[m].writes, 5, 'the upload page reads it from view=full');
});

/* ---------- blob-1：Vercel 的 helpers 先把 body 读完（image/jpeg 的 req.body 是 undefined） ---------- */
// 照 @vercel/node 23 dev-server.mjs 的 addHelpers / restoreBody / getBodyParser 做的
function vercelHelpers(req, body) {
  const rb = new PassThrough();
  const on = rb.on.bind(rb), originalOn = req.on.bind(req);
  req.read = rb.read.bind(rb);
  req.on = req.addListener = (name, cb) => (name === 'data' || name === 'end' ? on(name, cb) : originalOn(name, cb));
  rb.write(body); rb.end();
  const type = String(req.headers['content-type'] || 'text/plain').split(';')[0].trim().toLowerCase();
  let parsed, done = false;
  Object.defineProperty(req, 'body', {
    configurable: true, enumerable: true,
    get() {
      if (!done) {
        done = true;
        parsed = type === 'application/json' ? (body.length ? JSON.parse(body.toString()) : {}) : type === 'application/octet-stream' ? body : type === 'text/plain' ? body.toString() : undefined;
      }
      return parsed;
    }
  });
}
test('Vercel helpers on (body pre-read, replayed by a PassThrough): JPEG upload and JSON routes still work', async (t) => {
  const a = setup(t);
  const srv = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    vercelHelpers(req, Buffer.concat(chunks));
    assert.equal(req.readableEnded, true);
    const name = new URL(req.url, 'http://x').pathname.split('/').pop();
    await handlers[name](req, res);
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  t.after(() => srv.close());
  const url = 'http://127.0.0.1:' + srv.address().port + '/api/';
  const hd = { 'x-visi': '1', cookie: cookieFor('Ana') };
  const up = await fetch(url + 'photo?h=' + H, { method: 'POST', headers: { ...hd, 'content-type': 'image/jpeg' }, body: tinyJpeg() });
  const uj = await up.json();
  assert.equal(up.status, 200, JSON.stringify(uj) + ' (was 415 not_jpeg on Vercel)');
  assert.ok(a.read(uj.k).body.equals(tinyJpeg()), 'stored the real bytes');
  const png = await fetch(url + 'photo?h=' + H, { method: 'POST', headers: { ...hd, 'content-type': 'image/jpeg' }, body: Buffer.from('89504e470d0a1a0a', 'hex') });
  assert.equal(png.status, 415, 'still checks the bytes');
  const add = await fetch(url + 'catalog', { method: 'POST', headers: { ...hd, 'content-type': 'application/json' }, body: JSON.stringify({ op: 'addPhotos', project: { name: NAME }, photos: [{ h: H, k: uj.k, w: 8, ht: 8, sz: 600, dh: 'f0f0f0f0f0f0f0f0', f: 'x.jpg', sig: uj.sig }] }) });
  assert.equal(add.status, 200);
  const login = await fetch(url + 'session', { method: 'POST', headers: { 'x-visi': '1', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ana', password: 'team-pass' }) });
  assert.equal(login.status, 200);
  // 内容是空的：不会一直等
  const t0 = Date.now();
  const empty = await fetch(url + 'photo?h=' + H, { method: 'POST', headers: { ...hd, 'content-type': 'image/jpeg' } });
  assert.equal(empty.status, 415);
  assert.ok(Date.now() - t0 < 2500);
});

/* ---------- blob-6 / blob-7：真的 @vercel/blob，假的 Blob API ---------- */
const realBlob = await import(pathToFileURL(join(INVITE, 'node_modules/@vercel/blob/dist/index.js')).href);

test('realAdapter: blocked store → 503 storage_blocked (store_not_found on create is not a «conflict»); rate limit → 429', async (t) => {
  setup(t);
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store123_fake';
  let puts = 0;
  const mod = { ...realBlob, get: async () => null, copy: async () => { throw new Error('x'); } };
  const cases = [
    ['store_not_found', () => new realBlob.BlobStoreNotFoundError(), 503, 'storage_blocked'],
    ['store_suspended', () => new realBlob.BlobStoreSuspendedError(), 503, 'storage_blocked'],
    ['forbidden', () => new realBlob.BlobAccessError(), 503, 'storage_blocked'],
    ['rate_limited', () => new realBlob.BlobServiceRateLimited(30), 429, 'storage_busy'],
    ['aborted', () => new realBlob.BlobRequestAbortedError(), 503, 'storage_timeout'],
    ['unknown', () => new realBlob.BlobUnknownError(), 500, 'storage']
  ];
  for (const [name, err, status, error] of cases) {
    puts = 0;
    mod.put = async () => { puts++; throw err(); };
    setAdapter(realAdapter({ load: async () => mod }));
    const r = await addVia({ project: { name: NAME }, photos: [photo(fakeH())] });
    assert.deepEqual([r.status, r.json.error], [status, error], name);
    assert.equal(puts, 1, name + ': not retried as a conflict');
    if (status === 429) { assert.equal(r.json.retryAfter, 30); assert.equal(r.headers['retry-after'], '30'); }
  }
  // 真的有人先建好了（already exists）：才是冲突，下一轮改成更新
  let n = 0;
  mod.put = async () => { n++; throw new realBlob.BlobError('This blob already exists, use `allowOverwrite: true` if you want to overwrite it.'); };
  setAdapter(realAdapter({ load: async () => mod }));
  const race = await addVia({ project: { name: NAME }, photos: [photo(fakeH())] });
  assert.equal(race.status, 409);
  assert.equal(n, 5);
});

test('realAdapter: a hung Blob call gives up after its timeout → 503 storage_timeout (no 5-minute hang)', async (t) => {
  setup(t);
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store123_fake';
  // 不理人的假 Blob API：只有 abortSignal 能让它停
  const hang = (o) => new Promise((ok, fail) => o.abortSignal.addEventListener('abort', () => fail(new realBlob.BlobRequestAbortedError())));
  const mod = { ...realBlob, get: async (p, o) => hang(o), put: async (p, b, o) => hang(o) };
  setAdapter(realAdapter({ load: async () => mod, timeout: { photo: 80, index: 80, read: 80 } }));
  const t0 = Date.now();
  const p = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: jpegHeaders(), body: tinyJpeg() });
  assert.deepEqual([p.status, p.json.error], [503, 'storage_timeout']);
  const g = await call(handlers.catalog, { url: '/api/catalog', headers: { cookie: cookieFor('Ana') } });
  assert.deepEqual([g.status, g.json.error], [503, 'storage_timeout']);
  assert.ok(Date.now() - t0 < 2000);
});

test('real SDK against a Blob API that keeps failing: one put gives up in seconds (retries capped), not ~20 min', async (t) => {
  setup(t);
  let hits = 0;
  const srv = http.createServer((req, res) => {
    hits++;
    req.resume();
    req.on('end', () => { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code: 'internal_server_error', message: 'boom' } })); });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  t.after(() => srv.close());
  const oldUrl = process.env.VERCEL_BLOB_API_URL, oldRetries = process.env.VERCEL_BLOB_RETRIES;
  process.env.VERCEL_BLOB_API_URL = 'http://127.0.0.1:' + srv.address().port;
  delete process.env.VERCEL_BLOB_RETRIES;
  t.after(() => { if (oldUrl == null) delete process.env.VERCEL_BLOB_API_URL; else process.env.VERCEL_BLOB_API_URL = oldUrl; if (oldRetries == null) delete process.env.VERCEL_BLOB_RETRIES; else process.env.VERCEL_BLOB_RETRIES = oldRetries; });
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store123_fake';
  setAdapter(realAdapter({ load: async () => realBlob }));
  const t0 = Date.now();
  const p = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + H, headers: jpegHeaders(), body: tinyJpeg() });
  const took = Date.now() - t0;
  assert.equal(p.status, 500);
  assert.equal(p.json.error, 'storage');
  assert.equal(hits, 3, '1 try + 2 SDK retries');
  assert.ok(took < 15000, 'gave up after ' + took + ' ms');
});
