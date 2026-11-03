// 新的 Vercel Blob（OIDC）：连到项目时只给 BLOB_STORE_ID，没有 BLOB_READ_WRITE_TOKEN
//   · 照样认得到 Blob 的凭证、会把请求带来的 OIDC token 交给 SDK
//   · 在 Vercel 上一定要设 SESSION_SECRET / CATALOG_KEY：不能退回写死的开发用 key（清单路径一猜就中 = 客户名字外流）
import test from 'node:test';
import assert from 'node:assert/strict';
import { lib, handlers, call, writeHeaders, API } from '../testkit.mjs';

const sessionMod = await import(API + 'session.js');
const B = lib.blob;
const KEYS = ['VISI_TEAM_PASSWORD', 'SESSION_SECRET', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'CATALOG_KEY', 'VERCEL_ENV', 'VERCEL_OIDC_TOKEN'];

function env(t, vars) {
  const old = {};
  for (const k of KEYS) { old[k] = process.env[k]; delete process.env[k]; }
  for (const k of Object.keys(vars)) process.env[k] = vars[k];
  sessionMod.resetLoginLimiter();
  t.after(() => { sessionMod.resetLoginLimiter(); for (const k of KEYS) { if (old[k] == null) delete process.env[k]; else process.env[k] = old[k]; } });
}

test('oidc: BLOB_STORE_ID alone counts as Blob credentials', (t) => {
  env(t, { BLOB_STORE_ID: 'store_test123' });
  assert.equal(B.hasCredentials(), true);
  delete process.env.BLOB_STORE_ID;
  assert.equal(B.hasCredentials(), false);
});

test('oidc: useOidc copies the request token for the SDK', (t) => {
  env(t, {});
  B.useOidc({ headers: { 'x-vercel-oidc-token': 'jwt-from-request' } });
  assert.equal(process.env.VERCEL_OIDC_TOKEN, 'jwt-from-request');
  B.useOidc({ headers: {} });   // 没带的请求不清掉旧的
  assert.equal(process.env.VERCEL_OIDC_TOKEN, 'jwt-from-request');
});

test('oidc: real adapter passes the credential check with only BLOB_STORE_ID', async (t) => {
  env(t, { BLOB_STORE_ID: 'store_test123' });
  let loaded = false;
  const a = B.realAdapter({ load: async () => { loaded = true; return { put: async (p) => ({ pathname: p + '-x', url: 'https://s.public.blob.vercel-storage.com/' + p + '-x' }) }; } });
  const r = await a.putFile('c/0123456789abcdef.jpg', Buffer.from([0xff, 0xd8, 0xff, 0]), 'image/jpeg');
  assert.ok(loaded);
  assert.match(r.pathname, /^c\/0123456789abcdef\.jpg/);
});

test('oidc: on Vercel without CATALOG_KEY and without a token → 503 not_configured, never a guessable path', (t) => {
  env(t, { VERCEL_ENV: 'production', BLOB_STORE_ID: 'store_test123' });
  assert.throws(() => B.catalogKey(), (e) => e.status === 503 && e.error === 'not_configured');
  process.env.CATALOG_KEY = 'testcatalogkey00000000ab';
  assert.equal(B.catalogKey(), 'testcatalogkey00000000ab');
});

test('oidc: on Vercel without SESSION_SECRET and without a token → login is refused (no dev key)', async (t) => {
  env(t, { VERCEL_ENV: 'preview', BLOB_STORE_ID: 'store_test123', VISI_TEAM_PASSWORD: 'team-pass', CATALOG_KEY: 'testcatalogkey00000000ab' });
  const r = await call(handlers.session, { method: 'POST', headers: writeHeaders(), body: { name: 'Ana', password: 'team-pass' } });
  assert.equal(r.status, 503);
  assert.equal(r.json.error, 'not_configured');
  process.env.SESSION_SECRET = 'a-real-random-secret';
  const ok = await call(handlers.session, { method: 'POST', headers: writeHeaders(), body: { name: 'Ana', password: 'team-pass' } });
  assert.equal(ok.status, 200);
  assert.match(String(ok.headers['set-cookie']), /visi_s=/);
});

test('oidc: local / mock (no VERCEL_ENV) keeps working without any key', (t) => {
  env(t, { VISI_TEAM_PASSWORD: 'team-pass' });
  assert.match(B.catalogKey(), /^[0-9a-f]{24}$/);
});
