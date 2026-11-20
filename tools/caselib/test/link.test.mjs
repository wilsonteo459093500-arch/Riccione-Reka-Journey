// /api/link：签名链接（VISI 体检第 2c 阶段）。名字一律用假名
import test from 'node:test';
import assert from 'node:assert/strict';
import { lib, handlers, call, writeHeaders, cookieFor, API } from '../testkit.mjs';

const sessionMod = await import(API + 'session.js');
const L = lib.link;
const ENV = { VISI_TEAM_PASSWORD: 'team-pass', SESSION_SECRET: 'unit-secret', BLOB_READ_WRITE_TOKEN: null, VERCEL_ENV: null };

function setup(t, env) {
  const vars = Object.assign({}, ENV, env || {});
  const old = {};
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }
  sessionMod.resetLoginLimiter();
  t.after(() => { sessionMod.resetLoginLimiter(); for (const k of Object.keys(old)) { if (old[k] == null) delete process.env[k]; else process.env[k] = old[k]; } });
}
const FIELDS = { by: 'Ali Test', role: '溪岸 设计顾问', wa: '60123456789', note: '期待在展厅见到您。\n我们准备了两版方案。' };
const getUrl = (f, sig) => '/api/link?' + new URLSearchParams(Object.assign({}, f, { sig })).toString();

test('link: sign needs login, then the same link verifies', async (t) => {
  setup(t);
  const no = await call(handlers.link, { method: 'POST', headers: writeHeaders(), body: FIELDS });
  assert.equal(no.status, 401);
  assert.equal(no.json.error, 'login');

  const r = await call(handlers.link, { method: 'POST', headers: writeHeaders({ cookie: cookieFor('Ali Test') }), body: FIELDS });
  assert.equal(r.status, 200);
  assert.equal(r.json.sig.length, L.SIG_LEN);
  assert.equal(r.json.name, 'Ali Test');
  assert.deepEqual({ by: r.json.by, role: r.json.role, wa: r.json.wa, note: r.json.note }, FIELDS);

  const ok = await call(handlers.link, { url: getUrl(FIELDS, r.json.sig) });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.ok, true);
  assert.equal(ok.json.wa, '60123456789');
  assert.match(ok.headers['cache-control'], /max-age=3600/);
});

test('link: changing any signed field (name, phone, role, note) breaks the signature', async (t) => {
  setup(t);
  const sig = L.linkSig(L.linkFields(FIELDS));
  for (const [k, v] of [['by', 'Wilson Teo · 溪岸财务部'], ['wa', '60199999999'], ['role', '财务部'], ['note', '请先付订金 RM500']]) {
    const bad = Object.assign({}, FIELDS, { [k]: v });
    const r = await call(handlers.link, { url: getUrl(bad, sig) });
    assert.equal(r.json.ok, false, k);
    assert.equal(r.json.wa, undefined);
  }
  // 拿掉签名 / 乱写签名
  assert.equal((await call(handlers.link, { url: getUrl(FIELDS, '') })).json.ok, false);
  assert.equal((await call(handlers.link, { url: getUrl(FIELDS, 'x'.repeat(L.SIG_LEN)) })).json.ok, false);
});

test('link: signature does not depend on the team password, but does on SESSION_SECRET', async (t) => {
  setup(t);
  const sig = L.linkSig(L.linkFields(FIELDS));
  process.env.VISI_TEAM_PASSWORD = 'new-pass';
  assert.ok(L.checkLink(FIELDS, sig), 'boss changed the team password: links already sent stay valid');
  process.env.SESSION_SECRET = 'rotated';
  assert.equal(L.checkLink(FIELDS, sig), null);
});

test('link: fields are cleaned before signing (control chars, spaces, length, phone digits)', () => {
  const f = L.linkFields({ by: '  Ali‮  Test\n', role: 'x'.repeat(80), wa: '+60 (12) 345-6789', note: 'a\r\n\r\n\r\n\r\nb\u0007  c' });
  assert.equal(f.by, 'Ali Test');
  assert.equal(f.role.length, L.LINK_MAX.role);
  assert.equal(f.wa, '60123456789');
  assert.equal(f.note, 'a\n\nb c');
  assert.equal(L.linkFields({ wa: '123' }).wa, '', 'too short to be a phone number');
  assert.deepEqual(L.linkFields(null), { by: '', role: '', wa: '', note: '' });
});

test('link: POST with name + password logs in and signs in one go (local case-library mode)', async (t) => {
  setup(t);
  const wrong = await call(handlers.link, { method: 'POST', headers: writeHeaders(), body: Object.assign({ name: 'Ali Test', password: 'nope' }, FIELDS) });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.error, 'password');
  const r = await call(handlers.link, { method: 'POST', headers: writeHeaders(), body: Object.assign({ name: 'Ali Test', password: 'team-pass' }, FIELDS) });
  assert.equal(r.status, 200);
  assert.match(r.headers['set-cookie'], /^visi_s=.+Path=\/api; HttpOnly/);
  assert.equal(r.json.sig, L.linkSig(L.linkFields(FIELDS)));
});

test('link: shares the wrong-password limit with /api/session', async (t) => {
  setup(t);
  for (let i = 0; i < 5; i++) {
    await call(handlers.session, { method: 'POST', headers: writeHeaders({ 'x-real-ip': '10.0.0.9' }), body: { name: 'Guess', password: 'x' + i } });
  }
  const r = await call(handlers.link, { method: 'POST', headers: writeHeaders({ 'x-real-ip': '10.0.0.9' }), body: { name: 'Guess', password: 'team-pass' } });
  assert.equal(r.status, 429);
  assert.ok(+r.headers['retry-after'] > 0);
});

test('link: writes are blocked cross-site and when the team password is not set', async (t) => {
  setup(t);
  const x = await call(handlers.link, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieFor('Ali Test') }, body: FIELDS });
  assert.equal(x.status, 403);
  const o = await call(handlers.link, { method: 'POST', headers: writeHeaders({ cookie: cookieFor('Ali Test'), origin: 'https://evil.example' }), body: FIELDS });
  assert.equal(o.status, 403);
  delete process.env.VISI_TEAM_PASSWORD;
  const n = await call(handlers.link, { method: 'POST', headers: writeHeaders({ cookie: cookieFor('Ali Test') }), body: FIELDS });
  assert.equal(n.status, 503);
});

test('link: on Vercel without SESSION_SECRET nothing verifies (pages fall back to the company default)', async (t) => {
  setup(t, { SESSION_SECRET: null, VERCEL_ENV: 'production' });
  const r = await call(handlers.link, { url: getUrl(FIELDS, 'a'.repeat(L.SIG_LEN)) });
  assert.equal(r.status, 503);
});
