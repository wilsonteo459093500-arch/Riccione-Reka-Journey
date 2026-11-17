// 案例库储存改存 Supabase（invite/api/_lib/supabase.js）：跟 Blob 一样的接口，打的是假的 Supabase（真的 HTTP，tools/caselib/fake-supabase.mjs）。
// 1) adapter 本身：清单读写、两个人同时改（rev 冲突）、照片随机路径 / 固定路径重送、删除、每日备份、公开网址读得到
// 2) 错误讲得清楚：金钥不对 / bucket 不存在 = storage_blocked（重试也没用）、限流 = storage_busy、5xx = 可以重试
// 3) 三个 handler 整段跑在 Supabase 上：上传 → 登记 → 改标签 → 隐藏 → 删除；额度变成「不限写入、只看空间」
// 名字都是假的（测试客户）
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { lib, handlers, call, writeHeaders, cookieFor, tinyJpeg, tinyThumb, photo, fakeH, API } from '../testkit.mjs';
import { startFakeSupabase } from '../fake-supabase.mjs';

const S = await import(API + '_lib/supabase.js');
const sessionMod = await import(API + 'session.js');
const photoMod = await import(API + 'photo.js');
const { setAdapter, adapterKind, ConflictError, StorageError } = lib.blob;
const K = lib.catalog;
const NAME = 'Setia Alam 原木 测试客户';
const ENV = { VISI_TEAM_PASSWORD: 'team-pass', SESSION_SECRET: 'unit-secret', BLOB_READ_WRITE_TOKEN: null, CATALOG_KEY: 'unit-catalog-key', VERCEL_ENV: null, STORAGE_CAP_MB: null, SUPABASE_URL: null, SUPABASE_SERVICE_ROLE_KEY: null };

let fake;
before(async () => { fake = await startFakeSupabase(); });
after(async () => { if (fake) await fake.close(); });

function setup(t, env) {
  const all = Object.assign({}, ENV, env || {});
  const old = {};
  for (const k of Object.keys(all)) { old[k] = process.env[k]; if (all[k] == null) delete process.env[k]; else process.env[k] = all[k]; }
  fake.rows.clear(); fake.objects.clear(); fake.failNext(0, 0); fake.setDown(false);
  const a = S.supabaseAdapter({ env: fake.env, timeout: { read: 3000, index: 3000, photo: 3000, backup: 3000, del: 3000 } });
  setAdapter(a);
  sessionMod.resetLoginLimiter();
  photoMod.resetQuotaCache();
  t.after(() => { setAdapter(null); photoMod.resetQuotaCache(); for (const k of Object.keys(old)) { if (old[k] == null) delete process.env[k]; else process.env[k] = old[k]; } });
  return a;
}
const auth = (extra) => writeHeaders({ cookie: cookieFor('Ana'), ...(extra || {}) });
const plain = (x) => JSON.parse(JSON.stringify(x));

/* ---------- 1. adapter ---------- */
test('supabase adapter: index create / read / update with rev, stale rev and double create are conflicts', async (t) => {
  const a = setup(t);
  assert.equal(a.kind, 'supabase');
  assert.equal(adapterKind(), 'supabase');
  assert.equal(await a.getJson('catalog/k/index.json'), null);
  const c = await a.putJson('catalog/k/index.json', JSON.stringify({ v: 1 }), { create: true });
  assert.equal(c.etag, '1');
  await assert.rejects(a.putJson('catalog/k/index.json', '{}', { create: true }), (e) => e instanceof ConflictError);
  const g = await a.getJson('catalog/k/index.json');
  assert.deepEqual(plain(g.data), { v: 1 });
  const u = await a.putJson('catalog/k/index.json', JSON.stringify({ v: 2 }), { ifMatch: g.etag });
  assert.equal(u.etag, '2');
  await assert.rejects(a.putJson('catalog/k/index.json', JSON.stringify({ v: 3 }), { ifMatch: g.etag }), (e) => e instanceof ConflictError, 'stale rev');
  assert.deepEqual(plain((await a.getJson('catalog/k/index.json')).data), { v: 2 });
  // 每日备份：同一张表、另一个 path，可以一直覆盖
  await a.copy('catalog/k/index.json', 'catalog/k/bak/mon.json');
  await a.copy('catalog/k/index.json', 'catalog/k/bak/mon.json');
  assert.deepEqual(plain((await a.getJson('catalog/k/bak/mon.json')).data), { v: 2 });
  assert.equal(fake.rows.size, 2);
});

test('supabase adapter: photos get a random suffix (still a valid catalog k), fixed paths are idempotent, public URL serves the file, delete removes it', async (t) => {
  const a = setup(t);
  const h = fakeH();
  const r = await a.putFile('c/' + h + '.jpg', tinyJpeg(), 'image/jpeg');
  assert.match(r.pathname, new RegExp('^c/' + h + '-[A-Za-z0-9]{21}\\.jpg$'));
  assert.ok(/^c\/[A-Za-z0-9._-]+\.jpg$/.test(r.pathname) && r.pathname.length <= 120, 'passes the catalog k check');
  assert.equal(r.url, a.base + r.pathname);
  assert.ok(a.base.startsWith(fake.url + '/storage/v1/object/public/visi-cases/'));
  const got = await fetch(r.url);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('access-control-allow-origin'), '*', 'PPTX export can read it');
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), tinyJpeg());
  const r2 = await a.putFile('c/' + h + '.jpg', tinyJpeg(), 'image/jpeg');
  assert.notEqual(r2.pathname, r.pathname, 'two uploads never overwrite each other');
  const p1 = await a.putFile('t/pX-abc.json', '{"a":1}', 'application/json', { fixed: true });
  assert.equal(p1.pathname, 't/pX-abc.json');
  const p2 = await a.putFile('t/pX-abc.json', '{"a":1}', 'application/json', { fixed: true });
  assert.equal(p2.existed, true);
  await a.del([r.pathname, 't/pX-abc.json', 'c/missing.jpg']);
  assert.ok(!fake.objects.has(r.pathname) && !fake.objects.has('t/pX-abc.json') && fake.objects.has(r2.pathname));
  await assert.rejects(a.del(new Array(1001).fill('x')), /at most 1000/);
});

test('supabase adapter: errors — bad key / missing bucket are blocked (no retry), 429 busy, 5xx retryable, not configured', async (t) => {
  setup(t);
  const bad = S.supabaseAdapter({ env: Object.assign({}, fake.env, { SUPABASE_SERVICE_ROLE_KEY: 'wrong' }) });
  await assert.rejects(bad.getJson('catalog/k/index.json'), (e) => e instanceof StorageError && e.status === 503 && e.error === 'storage_blocked');
  const noBucket = S.supabaseAdapter({ env: Object.assign({}, fake.env, { SUPABASE_CASES_BUCKET: 'nope' }) });
  await assert.rejects(noBucket.putFile('c/' + fakeH() + '.jpg', tinyJpeg(), 'image/jpeg'), (e) => e.status === 503 && e.error === 'storage_blocked');
  const a = S.supabaseAdapter({ env: fake.env });
  fake.failNext(429);
  await assert.rejects(a.getJson('catalog/k/index.json'), (e) => e.status === 429 && e.error === 'storage_busy' && e.retryAfter === 2);
  fake.failNext(500);
  await assert.rejects(a.putFile('c/' + fakeH() + '.jpg', tinyJpeg(), 'image/jpeg'), (e) => e instanceof StorageError && e.status === 500 && e.error === 'storage');
  const none = S.supabaseAdapter({ env: {} });
  await assert.rejects(none.getJson('x'), (e) => e.status === 503 && e.error === 'not_configured');
  assert.equal(S.supabaseConfigured({}), false);
  assert.equal(S.supabaseConfigured({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }), true);
  assert.equal(S.supabaseConfigured({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_x' }), true);
  // 连不上（server 关了）：可以重试的储存错误
  const dead = S.supabaseAdapter({ env: Object.assign({}, fake.env, { SUPABASE_URL: 'http://127.0.0.1:9' }) });
  await assert.rejects(dead.getJson('x'), (e) => e instanceof StorageError);
});

test('supabase adapter: new sb_secret_ keys go in apikey only; legacy JWT keys also in Authorization', async (t) => {
  setup(t);
  const seen = [];
  const spy = (u, o) => { seen.push(o.headers); return Promise.resolve(new Response('[]', { status: 200 })); };
  await S.supabaseAdapter({ env: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_abc' }, fetch: spy }).getJson('p');
  await S.supabaseAdapter({ env: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOi.jwt' }, fetch: spy }).getJson('p');
  assert.equal(seen[0].apikey, 'sb_secret_abc');
  assert.equal(seen[0].Authorization, undefined);
  assert.equal(seen[1].Authorization, 'Bearer eyJhbGciOi.jwt');
});

/* ---------- 2. 三个 handler 跑在 Supabase 上 ---------- */
async function upload(h) {
  const r = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + h, headers: auth({ 'content-type': 'image/jpeg' }), body: tinyJpeg() });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json;
}
async function full() {
  const r = await call(handlers.catalog, { url: '/api/catalog?view=full', headers: { cookie: cookieFor('Ana') } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json;
}

test('handlers on supabase: upload → addPhotos → patch → hide → purge; quota is «no write limit, space only»; index never public', async (t) => {
  setup(t);
  const hs = [fakeH(), fakeH(), fakeH()];
  const ups = [];
  for (const h of hs) ups.push(await upload(h));
  const photos = hs.map((h, i) => Object.assign(photo(h), { k: ups[i].k, sig: ups[i].sig }));
  const thumbs = {};
  hs.forEach((h) => { thumbs[h] = tinyThumb(); });
  const add = await call(handlers.catalog, { method: 'POST', url: '/api/catalog', headers: auth(), body: { op: 'addPhotos', project: { name: NAME }, photos, thumbs } });
  assert.equal(add.status, 200, JSON.stringify(add.json));
  const pid = add.json.pid;
  let idx = await full();
  assert.equal(Object.keys(idx.photos).length, 3);
  assert.equal(idx.base, fake.url + '/storage/v1/object/public/visi-cases/');
  assert.equal(idx.quota.plan, 'supabase');
  assert.equal(idx.quota.writeCap, null);
  assert.equal(idx.quota.uploadCap, null);
  assert.equal(idx.quota.writesLeft, null);
  assert.equal(idx.quota.bytesCap, 700 * 1024 * 1024);
  assert.ok(idx.quota.bytesLeft > 0 && idx.quota.bytesLeft < idx.quota.bytesCap);
  // 照片和缩图包在 bucket（公开），清单只在资料表（有客户名字：没有公开网址）
  assert.ok([...fake.objects.keys()].some((k) => k.startsWith('t/')), 'thumb pack stored');
  assert.ok(![...fake.objects.keys()].some((k) => k.startsWith('catalog/')), 'index is not in the public bucket');
  assert.ok([...fake.rows.keys()].some((k) => /^catalog\/.+\/index\.json$/.test(k)));
  assert.ok([...fake.rows.values()].some((r) => r.body.includes('测试客户')));
  // 两个人同时改标签：都成功（rev 冲突会重读重试）
  const [p1, p2] = await Promise.all([
    call(handlers.catalog, { method: 'POST', headers: auth(), body: { op: 'patch', source: 'human', photos: { [hs[0]]: { room: 'kitchen', cabinets: ['kitchen'] } } } }),
    call(handlers.catalog, { method: 'POST', headers: auth(), body: { op: 'patch', source: 'human', photos: { [hs[1]]: { room: 'living', cabinets: ['tvcab'] } }, projects: { [pid]: { style: 'wood' } } } })
  ]);
  assert.equal(p1.status, 200); assert.equal(p2.status, 200);
  idx = await full();
  assert.deepEqual(plain(idx.photos[hs[0]].cabinets), ['kitchen']);
  assert.deepEqual(plain(idx.photos[hs[1]].cabinets), ['tvcab']);
  assert.equal(idx.projects[pid].style, 'wood');
  // 隐藏 → 删除：档案真的从 bucket 删掉
  const k0 = idx.photos[hs[0]].k;
  assert.ok(fake.objects.has(k0));
  assert.equal((await call(handlers.catalog, { method: 'POST', headers: auth(), body: { op: 'hide', photos: [hs[0]] } })).status, 200);
  const del = await call(handlers.catalog, { method: 'POST', headers: auth(), body: { op: 'purge', photos: [hs[0]], confirm: '删除' } });
  assert.equal(del.status, 200, JSON.stringify(del.json));
  assert.equal(del.json.removed, 1);
  assert.equal(del.json.quota.plan, 'supabase');
  assert.ok(!fake.objects.has(k0));
  idx = await full();
  assert.ok(!idx.photos[hs[0]]);
  // VISI 的清单（不含项目名）照样读得到
  const visi = await call(handlers.catalog, { url: '/api/catalog?view=visi', headers: { cookie: cookieFor('Ana') } });
  assert.equal(visi.status, 200);
  assert.ok(!JSON.stringify(visi.json).includes('测试客户'));
});

test('handlers on supabase: the space cap (STORAGE_CAP_MB) stops uploads with 507 quota/bytes; no monthly write limit', async (t) => {
  setup(t, { STORAGE_CAP_MB: '0.001' });   // ≈ 1 KB：一张都放不下
  const r = await call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + fakeH(), headers: auth({ 'content-type': 'image/jpeg' }), body: tinyJpeg() });
  assert.equal(r.status, 507);
  assert.equal(r.json.error, 'quota');
  assert.equal(r.json.reason, 'bytes');
  assert.equal(fake.hits.upload >= 0, true);
  assert.equal([...fake.objects.keys()].filter((k) => k.startsWith('c/')).length, 0, 'nothing written');
  // 写入次数：就算清单记的这个月已经写了很多次，Supabase 也不挡
  const t0 = Date.now();
  const idx = K.emptyIndex();
  idx.usage = { [new Date(t0).toISOString().slice(0, 7)]: { writes: 99999 } };
  const q = K.quota(idx, t0, 'supabase');
  assert.equal(q.writesLeft, null);
  assert.equal(q.writeCap, null);
});

test('handlers on supabase: storage blocked (bad key) → 503 storage_blocked in plain JSON', async (t) => {
  setup(t);
  setAdapter(S.supabaseAdapter({ env: Object.assign({}, fake.env, { SUPABASE_SERVICE_ROLE_KEY: 'wrong' }) }));
  const r = await call(handlers.catalog, { url: '/api/catalog?view=full', headers: { cookie: cookieFor('Ana') } });
  assert.equal(r.status, 503);
  assert.equal(r.json.error, 'storage_blocked');
});
