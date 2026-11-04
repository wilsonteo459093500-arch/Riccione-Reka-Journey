// 免费（Hobby）方案的额度：伺服器自己挡，不让 Vercel 把整个 store 停权
//   · 传新照片：这个月写入到 1,800 就停；总储存量超过 950 MB 也停
//   · 写清单（登记、改标签、隐藏）：到 1,950 才停；已经传上去的照片照样能登记
//   · BLOB_PLAN=pro：不限
//   · 删除隐藏的照片（purge）：只能删隐藏的、要打「删除」、记下是谁删的、算得出删完的空间
//   · store 被停权：get() 的 403 也认成 503 storage_blocked
import test from 'node:test';
import assert from 'node:assert/strict';
import { lib, handlers, call, writeHeaders, cookieFor, tinyJpeg, tinyThumb, photo, fakeH, API } from '../testkit.mjs';

const sessionMod = await import(API + 'session.js');
const photoMod = await import(API + 'photo.js');
const { memoryAdapter, setAdapter, realAdapter, indexPath } = lib.blob;
const K = lib.catalog;
const NAME = 'Setia Alam 原木 测试客户';
const OTHER = 'Klang 北欧 测试客户乙';
const ENV = { VISI_TEAM_PASSWORD: 'team-pass', SESSION_SECRET: 'unit-secret', BLOB_READ_WRITE_TOKEN: null, CATALOG_KEY: null, VERCEL_ENV: null, BLOB_PLAN: null };
const MONTH = () => new Date().toISOString().slice(0, 7);

function setup(t, env) {
  const old = {};
  const vars = Object.assign({}, ENV, env || {});
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }
  const a = memoryAdapter({ base: 'http://blob.test/' });
  setAdapter(a);
  sessionMod.resetLoginLimiter();
  photoMod.resetQuotaCache();
  t.after(() => { setAdapter(null); photoMod.resetQuotaCache(); sessionMod.resetLoginLimiter(); for (const k of Object.keys(old)) { if (old[k] == null) delete process.env[k]; else process.env[k] = old[k]; } });
  return a;
}
const auth = (extra) => writeHeaders({ cookie: cookieFor('Ana'), ...(extra || {}) });
const jpegHeaders = () => ({ 'x-visi': '1', 'content-type': 'image/jpeg', cookie: cookieFor('Ana') });
const upload = (h) => call(handlers.photo, { method: 'POST', url: '/api/photo?h=' + h, headers: jpegHeaders(), body: tinyJpeg() });
const post = (body) => call(handlers.catalog, { method: 'POST', headers: auth(), body });
const full = () => call(handlers.catalog, { url: '/api/catalog?view=full', headers: { cookie: cookieFor('Ana') } });

// 清单里先放好这个月已经写了几次
async function seedIndex(a, mutateFn) {
  const idx = K.emptyIndex();
  idx.usage = { [MONTH()]: { writes: 0 } };
  if (mutateFn) mutateFn(idx);
  await a.putJson(indexPath(), JSON.stringify(idx), { create: true });
}
async function readIndex(a) { return (await a.getJson(indexPath())).data; }

/* ---------- 纯函数 ---------- */
test('quota: storedBytes = photos + thumb packs (pb, or 35 KB per photo when unknown) + index × 8', () => {
  const idx = K.emptyIndex();
  idx.projects.p0000000001 = { name: 'a', n: 2, packs: ['t/x.json'], pb: 50000 };
  idx.projects.p0000000002 = { name: 'b', n: 3, packs: ['t/y.json'] };        // 旧项目：没记过大小
  idx.photos.a000000000000001 = { p: 'p0000000001', sz: 100000 };
  idx.photos.a000000000000002 = { p: 'p0000000001', sz: 200000 };
  const text = JSON.stringify(idx);
  assert.equal(K.storedBytes(idx), 300000 + 50000 + 3 * K.PACK_EST + Buffer.byteLength(text) * K.INDEX_COPIES);
});

test('quota: hobby caps 1,800 / 1,950 / 950 MB; pro has none', () => {
  const idx = K.emptyIndex();
  const ts = Date.now();
  K.bumpUsage(idx, ts, 1234);
  const q = K.quota(idx, ts, 'hobby');
  assert.equal(q.plan, 'hobby');
  assert.equal(q.writes, 1234);
  assert.equal(q.uploadCap, 1800);
  assert.equal(q.writeCap, 1950);
  assert.equal(q.bytesCap, 950 * 1024 * 1024);
  assert.equal(q.writesLeft, 1800 - 1234);
  assert.ok(q.bytesLeft > 0 && q.bytesLeft < q.bytesCap);
  const p = K.quota(idx, ts, 'pro');
  assert.deepEqual([p.uploadCap, p.writeCap, p.bytesCap, p.writesLeft, p.bytesLeft], [null, null, null, null, null]);
  assert.equal(p.writes, 1234);
  // 上个月写的不算这个月
  const lastMonth = new Date(ts); lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
  assert.equal(K.monthWrites(idx, lastMonth.getTime()), 0);
});

test('quota: BLOB_PLAN only "pro" (any case) lifts the caps', () => {
  const old = process.env.BLOB_PLAN;
  try {
    delete process.env.BLOB_PLAN; assert.equal(K.blobPlan(), 'hobby');
    process.env.BLOB_PLAN = ' Pro '; assert.equal(K.blobPlan(), 'pro');
    process.env.BLOB_PLAN = 'enterprise'; assert.equal(K.blobPlan(), 'hobby');
  } finally { if (old == null) delete process.env.BLOB_PLAN; else process.env.BLOB_PLAN = old; }
});

/* ---------- /api/photo ---------- */
test('photo: 507 quota once this month reaches 1,800 writes — nothing is written', async (t) => {
  const a = setup(t);
  await seedIndex(a, (idx) => { idx.usage[MONTH()].writes = 1800; });
  a.resetStats();
  const r = await upload('a1b2c3d4e5f60718');
  assert.equal(r.status, 507);
  assert.equal(r.json.error, 'quota');
  assert.equal(r.json.reason, 'writes');
  assert.equal(r.json.writesLeft, 0);
  assert.equal(a.stats().puts, 0, 'no blob written');
});

test('photo: counts its own uploads between index reads (1,799 → one more ok, the next is 507)', async (t) => {
  const a = setup(t);
  await seedIndex(a, (idx) => { idx.usage[MONTH()].writes = 1798; });
  assert.equal((await upload(fakeH())).status, 200);
  assert.equal((await upload(fakeH())).status, 200);
  const third = await upload(fakeH());
  assert.equal(third.status, 507, 'the cached usage + 2 local uploads = 1,800');
  assert.equal(third.json.reason, 'writes');
});

test('photo: 507 quota when the store would go over 950 MB', async (t) => {
  const a = setup(t);
  await seedIndex(a, (idx) => {
    idx.projects.p0000000001 = { name: 'x', n: 1, packs: [], pb: 0 };
    idx.photos.a000000000000001 = { p: 'p0000000001', sz: K.BYTES_CAP - 100 };
  });
  const r = await upload(fakeH());
  assert.equal(r.status, 507);
  assert.equal(r.json.reason, 'bytes');
  assert.ok(r.json.writesLeft > 1000);
});

test('photo: BLOB_PLAN=pro uploads past the caps (and does not even read the index)', async (t) => {
  const a = setup(t, { BLOB_PLAN: 'pro' });
  await seedIndex(a, (idx) => { idx.usage[MONTH()].writes = 5000; });
  a.resetStats();
  const r = await upload(fakeH());
  assert.equal(r.status, 200);
  assert.equal(a.stats().gets, 0);
});

test('photo: a suspended store answers 503 storage_blocked (upload page stops), not 500', async (t) => {
  const a = setup(t);
  await seedIndex(a);
  a.setBlocked(true);
  const r = await upload(fakeH());
  assert.equal(r.status, 503);
  assert.equal(r.json.error, 'storage_blocked');
  const g = await full();
  assert.equal(g.status, 503);
  assert.equal(g.json.error, 'storage_blocked');
});

/* ---------- 写清单 ---------- */
test('catalog: already-uploaded photos still register at 1,940 (their writes are sunk), index writes stop at 1,950', async (t) => {
  const a = setup(t);
  await seedIndex(a, (idx) => { idx.usage[MONTH()].writes = 1940; });
  const ps = Array.from({ length: 20 }, () => photo(fakeH()));
  const r = await post({ op: 'addPhotos', project: { name: NAME }, photos: ps });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.added.length, 20);
  const idx = await readIndex(a);
  assert.equal(idx.usage[MONTH()].writes, 1940 + 20 + 1, '20 photos + the index');
  // 1,961 ≥ 1,950：改标签、隐藏都停
  const h = ps[0].h;
  const p = await post({ op: 'patch', source: 'human', photos: { [h]: { room: 'kitchen' } } });
  assert.equal(p.status, 507);
  assert.equal(p.json.error, 'quota');
  const hd = await post({ op: 'hide', photos: [h] });
  assert.equal(hd.status, 507);
  assert.equal((await readIndex(a)).photos[h].room, '', 'nothing written');
});

test('catalog: a thumb pack is not written when pack + index would cross 1,950', async (t) => {
  const a = setup(t);
  await seedIndex(a, (idx) => { idx.usage[MONTH()].writes = 1949; });
  a.resetStats();
  const h = fakeH();
  const r = await post({ op: 'addPhotos', project: { name: NAME }, photos: [photo(h)], thumbs: { [h]: tinyThumb() } });
  assert.equal(r.status, 507);
  assert.equal(a.stats().puts, 0, 'no pack, no index');
  // 没有缩图：只要清单 1 次 → 1,950，刚好可以
  const r2 = await post({ op: 'addPhotos', project: { name: NAME }, photos: [photo(h)] });
  assert.equal(r2.status, 200, JSON.stringify(r2.json));
});

test('catalog: BLOB_PLAN=pro registers and patches past every cap', async (t) => {
  const a = setup(t, { BLOB_PLAN: 'pro' });
  await seedIndex(a, (idx) => { idx.usage[MONTH()].writes = 4000; });
  const h = fakeH();
  assert.equal((await post({ op: 'addPhotos', project: { name: NAME }, photos: [photo(h)], thumbs: { [h]: tinyThumb() } })).status, 200);
  assert.equal((await post({ op: 'patch', source: 'human', photos: { [h]: { room: 'kitchen' } } })).status, 200);
  const g = await full();
  assert.equal(g.json.quota.plan, 'pro');
  assert.equal(g.json.quota.uploadCap, null);
});

test('catalog: thumb pack sizes are recorded on the project (pb) and GET full reports quota', async (t) => {
  const a = setup(t);
  const h1 = fakeH(), h2 = fakeH();
  const r = await post({ op: 'addPhotos', project: { name: NAME }, photos: [photo(h1), photo(h2)], thumbs: { [h1]: tinyThumb(), [h2]: tinyThumb() } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const idx = await readIndex(a);
  const proj = idx.projects[r.json.pid];
  const packBlob = a.read(proj.packs[0]);
  assert.equal(proj.pb, packBlob.body.length, 'pb = the real pack size');
  const g = await full();
  assert.equal(g.status, 200);
  const q = g.json.quota;
  assert.equal(q.plan, 'hobby');
  assert.equal(q.month, MONTH());
  assert.equal(q.writes, idx.usage[MONTH()].writes);
  assert.equal(q.bytes, K.storedBytes(idx));
  assert.equal(q.writesLeft, 1800 - q.writes);
  // 估的总量跟记忆体里真的档案大小差不多（照片是假的 sz，所以只比缩图包 + 清单这部分）
  const photoSz = 2 * 345678;
  const real = a.bytes();
  assert.ok(Math.abs((q.bytes - photoSz) - real) < real * 8, 'same order of magnitude');
  // visi 版没有 quota（VISI 用不到）
  const v = await call(handlers.catalog, { url: '/api/catalog', headers: { cookie: cookieFor('Ana') } });
  assert.equal(v.json.quota, undefined);
});

test('catalog: an old project without pb gets an estimate, then grows by the real pack size', async (t) => {
  const a = setup(t);
  const hs = [fakeH(), fakeH(), fakeH()];
  assert.equal((await post({ op: 'addPhotos', project: { name: NAME }, photos: hs.map((h) => photo(h)) })).status, 200);
  // 假装是旧版写的：拿掉 pb
  const idx = await readIndex(a);
  const pid = K.pidOf(NAME);
  delete idx.projects[pid].pb;
  const cur = await a.getJson(indexPath());
  await a.putJson(indexPath(), JSON.stringify(idx), { ifMatch: cur.etag });
  const h4 = fakeH();
  const r = await post({ op: 'addPhotos', project: { name: NAME }, photos: [photo(h4)], thumbs: { [h4]: tinyThumb() } });
  assert.equal(r.status, 200);
  const after = (await readIndex(a)).projects[pid];
  const packLen = a.read(after.packs[after.packs.length - 1]).body.length;
  assert.equal(after.pb, 3 * K.PACK_EST + packLen);
});

/* ---------- purge：删除隐藏的照片 ---------- */
async function twoProjects(a) {
  const A = [fakeH(), fakeH(), fakeH()], B = [fakeH(), fakeH()];
  const ra = await post({ op: 'addPhotos', project: { name: NAME }, photos: A.map((h) => photo(h)), thumbs: Object.fromEntries(A.map((h) => [h, tinyThumb()])) });
  const rb = await post({ op: 'addPhotos', project: { name: OTHER }, photos: B.map((h) => photo(h)), thumbs: Object.fromEntries(B.map((h) => [h, tinyThumb()])) });
  assert.equal(ra.status, 200); assert.equal(rb.status, 200);
  // 照片档也放进记忆体（addPhotos 只登记，k 是假的路径）
  const idx = await readIndex(a);
  for (const h of A.concat(B)) a.store.set(idx.photos[h].k, { body: Buffer.alloc(1000), type: 'image/jpeg', etag: '"x"' });
  return { A, B, pa: ra.json.pid, pb: rb.json.pid };
}

test('purge: refuses without the typed confirmation, and refuses photos that are not hidden', async (t) => {
  const a = setup(t);
  const { A } = await twoProjects(a);
  const noConfirm = await post({ op: 'purge', photos: [A[0]] });
  assert.deepEqual([noConfirm.status, noConfirm.json.error], [400, 'confirm']);
  const wrong = await post({ op: 'purge', photos: [A[0]], confirm: 'delete' });
  assert.equal(wrong.status, 400);
  const notHidden = await post({ op: 'purge', photos: [A[0]], confirm: '删除' });
  assert.deepEqual([notHidden.status, notHidden.json.error], [400, 'not_hidden']);
  const unknown = await post({ op: 'purge', photos: ['ffffffffffffffff'], confirm: '删除' });
  assert.deepEqual([unknown.status, unknown.json.error], [400, 'unknown']);
  const proto = await post({ op: 'purge', photos: ['__proto__'], confirm: '删除' });
  assert.equal(proto.status, 400);
  const many = await post({ op: 'purge', photos: Array.from({ length: 1001 }, () => fakeH()), confirm: '删除' });
  assert.deepEqual([many.status, many.json.error], [400, 'too_many']);
  assert.equal(Object.keys((await readIndex(a)).photos).length, 5, 'nothing removed');
});

test('purge: deletes hidden photos (blob + index), keeps the pack of a partly-kept project, logs who did it', async (t) => {
  const a = setup(t);
  const { A, pa } = await twoProjects(a);
  assert.equal((await post({ op: 'hide', photos: [A[1], A[2]] })).status, 200);
  const before = await readIndex(a);
  const keys = [A[1], A[2]].map((h) => before.photos[h].k);
  const pack = before.projects[pa].packs[0];
  const pbBefore = before.projects[pa].pb;
  const bytesBefore = K.storedBytes(before);
  const r = await post({ op: 'purge', photos: [A[1], A[2]], confirm: '删除' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.removed, 2);
  assert.equal(r.json.projectsRemoved, 0);
  assert.equal(r.json.freed, 2 * 345678);
  for (const k of keys) assert.equal(a.read(k), null, 'blob deleted: ' + k);
  assert.ok(a.read(pack), 'pack kept (A[0] still uses it)');
  const idx = await readIndex(a);
  assert.equal(idx.photos[A[1]], undefined);
  assert.equal(idx.photos[A[2]], undefined);
  assert.ok(idx.photos[A[0]]);
  assert.equal(idx.projects[pa].n, 1);
  assert.equal(idx.projects[pa].pb, pbBefore, 'pack size frozen, not re-estimated from the smaller count');
  assert.equal(idx.photos[A[0]].shot, A[0]);
  const last = idx.log[idx.log.length - 1];
  assert.deepEqual([last.op, last.by, last.n], ['purge', 'Ana', 2]);
  assert.ok(K.storedBytes(idx) < bytesBefore);
  assert.equal(r.json.quota.plan, 'hobby');
  assert.equal(r.json.quota.writes, idx.usage[MONTH()].writes, 'quota after = what the index now says');
});

test('purge: a fully-purged project loses its packs and its record; a hidden project purges as a whole', async (t) => {
  const a = setup(t);
  const { A, B, pa, pb } = await twoProjects(a);
  assert.equal((await post({ op: 'hide', projects: [pb] })).status, 200);
  const before = await readIndex(a);
  const packs = before.projects[pb].packs.slice();
  const r = await post({ op: 'purge', photos: B, confirm: '删除' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.projectsRemoved, 1);
  for (const k of packs) assert.equal(a.read(k), null, 'pack deleted');
  const idx = await readIndex(a);
  assert.equal(idx.projects[pb], undefined);
  assert.ok(idx.projects[pa]);
  assert.equal(Object.keys(idx.photos).length, A.length);
  // 再送一次同样的：已经不在了 → 400 unknown，不会多删
  const again = await post({ op: 'purge', photos: B, confirm: '删除' });
  assert.equal(again.status, 400);
});

test('purge: purged hashes are remembered (upload page will not re-upload them); re-registering one forgets it', async (t) => {
  const a = setup(t);
  const { A, pa } = await twoProjects(a);
  await post({ op: 'hide', photos: [A[1], A[2]] });
  await post({ op: 'purge', photos: [A[1], A[2]], confirm: '删除' });
  let idx = await readIndex(a);
  assert.deepEqual(idx.purged.slice().sort(), [A[1], A[2]].sort());
  const v = await call(handlers.catalog, { url: '/api/catalog', headers: { cookie: cookieFor('Ana') } });
  assert.equal(v.json.purged, undefined, 'VISI view does not carry it');
  // 业务亲手勾回来传：登记之后就不算「删过」
  assert.equal((await post({ op: 'addPhotos', project: { name: NAME }, photos: [photo(A[1])] })).status, 200);
  idx = await readIndex(a);
  assert.deepEqual(idx.purged, [A[2]]);
  assert.equal(idx.photos[A[1]].p, pa);
});

test('purge: VISI view of a purged photo is gone (the old proposal gets an empty slot, not a broken URL)', async (t) => {
  const a = setup(t);
  const { A } = await twoProjects(a);
  await post({ op: 'hide', photos: [A[0]] });
  await post({ op: 'purge', photos: [A[0]], confirm: '删除' });
  const v = await call(handlers.catalog, { url: '/api/catalog', headers: { cookie: cookieFor('Ana') } });
  assert.equal(v.json.photos[A[0]], undefined);
});

test('purge: allowed up to 1,990 writes (freeing space is the way out), refused past it', async (t) => {
  const a = setup(t);
  const { A } = await twoProjects(a);
  await post({ op: 'hide', photos: [A[0], A[1]] });
  const idx = await readIndex(a);
  idx.usage[MONTH()].writes = 1960;
  let cur = await a.getJson(indexPath());
  await a.putJson(indexPath(), JSON.stringify(idx), { ifMatch: cur.etag });
  const ok = await post({ op: 'purge', photos: [A[0]], confirm: '删除' });
  assert.equal(ok.status, 200, 'over the 1,950 index cap but under 1,990');
  const idx2 = await readIndex(a);
  idx2.usage[MONTH()].writes = 1989;
  cur = await a.getJson(indexPath());
  await a.putJson(indexPath(), JSON.stringify(idx2), { ifMatch: cur.etag });
  const no = await post({ op: 'purge', photos: [A[1]], confirm: '删除' });
  assert.equal(no.status, 507);
  assert.ok(a.read(idx2.photos[A[1]].k), 'nothing deleted');
});

test('purge: a failed delete leaves the index untouched (retry is safe)', async (t) => {
  const a = setup(t);
  const { A } = await twoProjects(a);
  await post({ op: 'hide', photos: [A[0]] });
  a.failNextPut(1);   // del 也走 checkFail
  const r = await post({ op: 'purge', photos: [A[0]], confirm: '删除' });
  assert.equal(r.status, 500);
  assert.ok((await readIndex(a)).photos[A[0]], 'still listed (and still hidden)');
  const again = await post({ op: 'purge', photos: [A[0]], confirm: '删除' });
  assert.equal(again.status, 200);
});

/* ---------- 停权时读清单 ---------- */
test('blob: get() 403 from a suspended store → 503 storage_blocked (both SDK shapes)', async (t) => {
  setup(t, { BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_store123_fake' });
  class BlobError extends Error {}
  const throwing = realAdapter({ load: async () => ({ get: async () => { throw new BlobError('Failed to fetch blob: 403 Forbidden'); } }) });
  await assert.rejects(throwing.getJson('catalog/x/index.json'), (e) => e.status === 503 && e.error === 'storage_blocked');
  const status403 = realAdapter({ load: async () => ({ get: async () => ({ statusCode: 403, stream: null, blob: {} }) }) });
  await assert.rejects(status403.getJson('catalog/x/index.json'), (e) => e.status === 503 && e.error === 'storage_blocked');
  const suspended = realAdapter({ load: async () => ({ put: async () => { const e = new Error('Vercel Blob: This store has been suspended.'); e.name = 'BlobStoreSuspendedError'; throw e; } }) });
  await assert.rejects(suspended.putFile('c/0123456789abcdef.jpg', Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg'), (e) => e.status === 503 && e.error === 'storage_blocked');
  // 其它 4xx / 5xx 照旧是可以重试的 500
  const other = realAdapter({ load: async () => ({ get: async () => { throw new BlobError('Failed to fetch blob: 502 Bad Gateway'); } }) });
  await assert.rejects(other.getJson('catalog/x/index.json'), (e) => e.status === 500 && e.error === 'storage');
});

test('blob: real adapter del() passes the list through, refuses more than 1,000 at once', async (t) => {
  setup(t, { BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_store123_fake' });
  const calls = [];
  const a = realAdapter({ load: async () => ({ del: async (list) => { calls.push(list); } }) });
  await a.del(['c/a.jpg', 'c/b.jpg']);
  await a.del([]);
  assert.deepEqual(calls, [['c/a.jpg', 'c/b.jpg']]);
  await assert.rejects(a.del(Array.from({ length: 1001 }, (_, i) => 'c/' + i + '.jpg')));
});
