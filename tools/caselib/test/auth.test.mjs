// 登入 cookie：竄改、过期、换密码、名字清理
import test from 'node:test';
import assert from 'node:assert/strict';
import { lib, withEnv, fakeReq } from '../testkit.mjs';

const A = lib.auth;
const ENV = { VISI_TEAM_PASSWORD: 'pw-one', SESSION_SECRET: 'secret-one', BLOB_READ_WRITE_TOKEN: null };
const C = String.fromCharCode;

test('auth: sign → verify round trip', () => withEnv(ENV, () => {
  const exp = Date.now() + 60000;
  const t = A.signSession({ n: '小明', exp });
  assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(A.verifySession(t), { n: '小明', exp });
}));

test('auth: tampered payload or signature is rejected', () => withEnv(ENV, () => {
  const t = A.signSession({ n: 'Ana', exp: Date.now() + 60000 });
  const [p, s] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ n: 'Boss', exp: Date.now() + 60000 })).toString('base64url');
  assert.equal(A.verifySession(forged + '.' + s), null, 'other payload, old signature');
  const flipped = s.slice(0, -2) + (s.slice(-2) === 'AA' ? 'BB' : 'AA');
  assert.equal(A.verifySession(p + '.' + flipped), null, 'changed signature');
  assert.equal(A.verifySession(p), null, 'no signature');
  assert.equal(A.verifySession(''), null);
  assert.equal(A.verifySession(null), null);
  assert.equal(A.verifySession('x'.repeat(2000)), null, 'oversized');
}));

test('auth: expired session is rejected', () => withEnv(ENV, () => {
  const t = A.signSession({ n: 'Ana', exp: Date.now() - 1 });
  assert.equal(A.verifySession(t), null);
  const t2 = A.signSession({ n: 'Ana', exp: 1000 });
  assert.equal(A.verifySession(t2, 999)?.n, 'Ana', 'valid just before exp');
  assert.equal(A.verifySession(t2, 1000), null, 'invalid at exp');
}));

test('auth: changing the team password logs everyone out', () => {
  const t = withEnv(ENV, () => A.signSession({ n: 'Ana', exp: Date.now() + 60000 }));
  withEnv(ENV, () => assert.ok(A.verifySession(t)));
  withEnv({ ...ENV, VISI_TEAM_PASSWORD: 'pw-two' }, () => assert.equal(A.verifySession(t), null));
  withEnv({ ...ENV, SESSION_SECRET: 'secret-two' }, () => assert.equal(A.verifySession(t), null, 'secret rotation too'));
  withEnv({ ...ENV, VISI_TEAM_PASSWORD: null }, () => assert.equal(A.verifySession(t), null, 'no password configured'));
});

test('auth: SECRET falls back to a key derived from BLOB_READ_WRITE_TOKEN', () => {
  const base = { VISI_TEAM_PASSWORD: 'pw', SESSION_SECRET: null };
  const t = withEnv({ ...base, BLOB_READ_WRITE_TOKEN: 'fake_blob_token_store1_aaa' }, () => A.signSession({ n: 'Ana', exp: Date.now() + 60000 }));
  withEnv({ ...base, BLOB_READ_WRITE_TOKEN: 'fake_blob_token_store1_aaa' }, () => assert.ok(A.verifySession(t)));
  withEnv({ ...base, BLOB_READ_WRITE_TOKEN: 'fake_blob_token_store1_bbb' }, () => assert.equal(A.verifySession(t), null));
  withEnv({ ...base, BLOB_READ_WRITE_TOKEN: 'fake_blob_token_store1_aaa' }, () => {
    assert.notEqual(A.secret(), 'fake_blob_token_store1_aaa', 'token itself is never the key');
    assert.match(A.secret(), /^[0-9a-f]{64}$/);
  });
});

test('auth: checkPassword', () => withEnv(ENV, () => {
  assert.equal(A.checkPassword('pw-one'), true);
  assert.equal(A.checkPassword('pw-one '), false);
  assert.equal(A.checkPassword(''), false);
  assert.equal(A.checkPassword(undefined), false);
  assert.equal(A.checkPassword(['pw-one']), false);
  withEnv({ VISI_TEAM_PASSWORD: null }, () => assert.equal(A.checkPassword(''), false, 'unset password never matches'));
}));

test('auth: name sanitising', () => {
  assert.equal(A.cleanName('  Ana  '), 'Ana');
  assert.equal(A.cleanName('陈' + C(7) + '小' + C(0) + '明'), '陈小明', 'C0 control chars stripped');
  assert.equal(A.cleanName('Ana' + C(0x202e) + 'evil'), 'Anaevil', 'bidi override stripped');
  assert.equal(A.cleanName('A' + C(0x200b) + 'na'), 'Ana', 'zero-width stripped');
  assert.equal(A.cleanName('Line\nBreak\tTab'), 'LineBreakTab', 'newline / tab are control chars');
  assert.equal(A.cleanName('Mei   Ling'), 'Mei Ling', 'spaces collapsed');
  assert.equal(A.cleanName('x'.repeat(30)), 'x'.repeat(30));
  assert.equal(A.cleanName('x'.repeat(31)), '', 'over 30 → rejected');
  assert.equal(A.cleanName('字'.repeat(30)), '字'.repeat(30), '30 CJK chars ok');
  assert.equal(A.cleanName(''), '');
  assert.equal(A.cleanName('   '), '');
  assert.equal(A.cleanName(C(1) + C(2)), '', 'only control chars → empty');
  assert.equal(A.cleanName(42), '');
  assert.equal(A.cleanName(null), '');
});

test('auth: verifySession re-cleans the name inside a valid cookie', () => withEnv(ENV, () => {
  const t = A.signSession({ n: 'x'.repeat(40), exp: Date.now() + 60000 });
  assert.equal(A.verifySession(t), null, 'signed but invalid name');
}));

test('auth: cookie attributes (Secure only off localhost)', () => withEnv(ENV, () => {
  const prod = A.sessionCookie(fakeReq({ headers: { host: 'visi-riccione-reka.vercel.app' } }), 'TOKEN');
  assert.match(prod, /^visi_s=TOKEN; /);
  for (const part of ['Path=/api', 'HttpOnly', 'SameSite=Lax', 'Max-Age=2592000', 'Secure']) assert.ok(prod.includes(part), part);
  for (const host of ['localhost:3000', '127.0.0.1:41234', 'localhost']) {
    const local = A.sessionCookie(fakeReq({ headers: { host } }), 'TOKEN');
    assert.ok(!local.includes('Secure'), host);
    assert.ok(local.includes('HttpOnly'));
  }
  const clear = A.clearCookie(fakeReq({ headers: { host: 'example.com' } }));
  assert.match(clear, /^visi_s=; /);
  assert.ok(clear.includes('Max-Age=0'));
}));

test('auth: currentUser reads the visi_s cookie among others', () => withEnv(ENV, () => {
  const t = A.signSession({ n: 'Ana', exp: Date.now() + 60000 });
  const req = fakeReq({ headers: { cookie: 'a=1; visi_s=' + t + '; b=2' } });
  assert.equal(A.currentUser(req), 'Ana');
  assert.equal(A.currentUser(fakeReq({ headers: { cookie: 'xvisi_s=' + t } })), null);
}));
