// node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import rsvpHandler from '../api/rsvp.js';
import guestsHandler from '../api/guests.js';
import { normalizeRsvp, summarize, publicSummary, cleanText } from '../lib/rsvp.js';
import { createBlobStore } from '../lib/store.js';

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.setHeader = (k, v) => (res.headers[k.toLowerCase()] = v);
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (d) => ((res.body = d), res);
  return res;
}

async function call(handler, { method = 'GET', body, query = {}, headers = {} } = {}) {
  const res = fakeRes();
  await handler({ method, body, query, headers }, res);
  return res;
}

const ENV_KEYS = ['PARTY_STORE_DIR', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'PARTY_HOST_KEY'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
let dir;

test.beforeEach(async () => {
  for (const k of ENV_KEYS) delete process.env[k];
  dir = await mkdtemp(path.join(tmpdir(), 'party-'));
  process.env.PARTY_STORE_DIR = dir;
  process.env.PARTY_HOST_KEY = 'sekret-123';
});

test.afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const yes = (over = {}) => ({
  id: 'guest-aaaaaaaa',
  name: 'Ah Meng',
  attending: 'yes',
  adults: 2,
  kids: 1,
  diet: ['vegetarian'],
  wish: '生日快乐 DUDU',
  ...over
});

/* ---------------- 规则 ---------------- */

test('normalize: valid yes keeps counts and known diet keys only', () => {
  const { value, errors } = normalizeRsvp(yes({ diet: ['vegetarian', 'hack', 'halal'], adults: '3', kids: '' }));
  assert.equal(errors, undefined);
  assert.equal(value.adults, 3);
  assert.equal(value.kids, 0);
  assert.deepEqual(value.diet, ['vegetarian', 'halal']);
});

test('normalize: "no" zeroes counts and diet', () => {
  const { value } = normalizeRsvp(yes({ attending: 'no', adults: 5, kids: 5, diet: ['halal'], dietNote: 'x' }));
  assert.equal(value.adults, 0);
  assert.equal(value.kids, 0);
  assert.deepEqual(value.diet, []);
  assert.equal(value.dietNote, '');
  assert.equal(value.wish, '生日快乐 DUDU');
});

test('normalize: rejects missing name, bad id, zero adults, absurd counts', () => {
  assert.ok(normalizeRsvp(yes({ name: '   ' })).errors.name);
  assert.ok(normalizeRsvp(yes({ id: 'x' })).errors.id);
  assert.ok(normalizeRsvp(yes({ id: '../../etc/passwd' })).errors.id);
  assert.ok(normalizeRsvp(yes({ adults: 0 })).errors.adults);
  assert.ok(normalizeRsvp(yes({ adults: 99 })).errors.adults);
  assert.ok(normalizeRsvp(yes({ kids: -1 })).errors.kids);
  assert.ok(normalizeRsvp(yes({ kids: 1.5e9 })).errors.kids);
  assert.ok(normalizeRsvp(yes({ attending: 'maybe' })).errors.attending);
  assert.ok(normalizeRsvp(null).errors);
});

test('cleanText strips control chars and truncates', () => {
  assert.equal(cleanText('a\u0000b\u0007c   d', 10), 'abc d');
  assert.equal(cleanText('x'.repeat(50), 5), 'xxxxx');
  assert.equal(cleanText(42, 5), '');
});

test('summarize: totals, half portions for kids, diet people', () => {
  const s = summarize([
    { attending: 'yes', adults: 2, kids: 1, diet: ['vegetarian'], name: 'A' },
    { attending: 'yes', adults: 1, kids: 2, diet: [], name: 'B' },
    { attending: 'no', adults: 0, kids: 0, diet: [], name: 'C' }
  ]);
  assert.equal(s.groups, 2);
  assert.equal(s.declined, 1);
  assert.equal(s.adults, 3);
  assert.equal(s.kids, 3);
  assert.equal(s.people, 6);
  assert.equal(s.portions, 5); // 3 + 1.5 → 5
  assert.deepEqual(s.diet.vegetarian, { groups: 1, people: 3, names: ['A'] });
  assert.deepEqual(publicSummary([]), { groups: 0, adults: 0, kids: 0, people: 0 });
});

/* ---------------- /api/rsvp ---------------- */

test('POST then edit the same id keeps createdAt and counts once', async () => {
  const r1 = await call(rsvpHandler, { method: 'POST', body: yes() });
  assert.equal(r1.statusCode, 200);
  assert.equal(r1.body.updated, false);
  assert.deepEqual(r1.body.summary, { groups: 1, adults: 2, kids: 1, people: 3 });

  await new Promise((r) => setTimeout(r, 5));
  const r2 = await call(rsvpHandler, { method: 'POST', body: yes({ adults: 4 }) });
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.body.updated, true);
  assert.equal(r2.body.rsvp.createdAt, r1.body.rsvp.createdAt);
  assert.notEqual(r2.body.rsvp.updatedAt, r1.body.rsvp.updatedAt);
  assert.equal(r2.body.rsvp.edits, 1);
  assert.deepEqual(r2.body.summary, { groups: 1, adults: 4, kids: 1, people: 5 });

  const g = await call(rsvpHandler);
  assert.equal(g.statusCode, 200);
  assert.deepEqual(
    { groups: g.body.groups, adults: g.body.adults, kids: g.body.kids, people: g.body.people },
    { groups: 1, adults: 4, kids: 1, people: 5 }
  );
  assert.equal(JSON.stringify(g.body).includes('Ah Meng'), false, 'public summary must not leak names');
});

test('POST accepts a JSON string body', async () => {
  const r = await call(rsvpHandler, { method: 'POST', body: JSON.stringify(yes()) });
  assert.equal(r.statusCode, 200);
});

test('POST rejects invalid input with field errors, and bad JSON', async () => {
  const r = await call(rsvpHandler, { method: 'POST', body: yes({ name: '' }) });
  assert.equal(r.statusCode, 400);
  assert.equal(r.body.fields.name, 'required');
  const r2 = await call(rsvpHandler, { method: 'POST', body: '{nope' });
  assert.equal(r2.statusCode, 400);
});

test('honeypot submissions are swallowed', async () => {
  const r = await call(rsvpHandler, { method: 'POST', body: yes({ website: 'http://spam' }) });
  assert.equal(r.statusCode, 200);
  const g = await call(guestsHandler, { headers: { 'x-host-key': 'sekret-123' } });
  assert.equal(g.body.guests.length, 0);
});

test('other methods → 405', async () => {
  const r = await call(rsvpHandler, { method: 'PUT' });
  assert.equal(r.statusCode, 405);
});

test('no storage configured → 503 not_configured (page falls back to WhatsApp)', async () => {
  delete process.env.PARTY_STORE_DIR;
  const r = await call(rsvpHandler, { method: 'POST', body: yes() });
  assert.equal(r.statusCode, 503);
  assert.equal(r.body.error, 'not_configured');
});

/* ---------------- /api/guests ---------------- */

test('guests: needs the host key', async () => {
  await call(rsvpHandler, { method: 'POST', body: yes() });
  const none = await call(guestsHandler);
  assert.equal(none.statusCode, 401);
  const wrong = await call(guestsHandler, { headers: { 'x-host-key': 'nope' } });
  assert.equal(wrong.statusCode, 401);
  delete process.env.PARTY_HOST_KEY;
  const unset = await call(guestsHandler, { headers: { 'x-host-key': 'sekret-123' } });
  assert.equal(unset.statusCode, 503);
  assert.equal(unset.body.error, 'host_key_not_set');
});

test('guests: list sorted newest first, with summary; delete removes', async () => {
  await call(rsvpHandler, { method: 'POST', body: yes({ id: 'guest-11111111', name: 'First' }) });
  await new Promise((r) => setTimeout(r, 5));
  await call(rsvpHandler, { method: 'POST', body: yes({ id: 'guest-22222222', name: 'Second', attending: 'no' }) });

  const g = await call(guestsHandler, { headers: { 'x-host-key': 'sekret-123' } });
  assert.equal(g.statusCode, 200);
  assert.deepEqual(g.body.guests.map((x) => x.name), ['Second', 'First']);
  assert.equal(g.body.summary.groups, 1);
  assert.equal(g.body.summary.declined, 1);

  const d = await call(guestsHandler, { method: 'DELETE', query: { id: 'guest-11111111' }, headers: { 'x-host-key': 'sekret-123' } });
  assert.equal(d.statusCode, 200);
  assert.deepEqual(d.body.guests.map((x) => x.name), ['Second']);
  assert.equal(d.body.summary.groups, 0);

  const bad = await call(guestsHandler, { method: 'DELETE', query: { id: '../x' }, headers: { 'x-host-key': 'sekret-123' } });
  assert.equal(bad.statusCode, 400);

  const pub = await call(rsvpHandler);
  assert.equal(pub.body.groups, 0, 'public count refreshed after delete');
});

/* ---------------- Vercel Blob 适配层（用假 SDK） ---------------- */

function fakeBlobSdk({ storeAccess = 'private' } = {}) {
  const files = new Map();
  const calls = [];
  const check = (access) => {
    if (access !== storeAccess) throw new Error(`Vercel Blob: Cannot use ${access} access on a ${storeAccess} store`);
  };
  return {
    files,
    calls,
    async put(pathname, body, opts) {
      calls.push(['put', pathname, opts]);
      check(opts.access);
      if (files.has(pathname) && !opts.allowOverwrite) throw new Error('exists');
      files.set(pathname, body);
      return { pathname, url: `https://store.${storeAccess}.blob/${pathname}` };
    },
    async get(urlOrPath, opts) {
      calls.push(['get', urlOrPath, opts]);
      check(opts.access);
      const p = urlOrPath.replace(/^https:\/\/store\.\w+\.blob\//, '');
      if (!files.has(p)) return null;
      return { statusCode: 200, stream: new Response(files.get(p)).body, blob: {} };
    },
    async list({ prefix, cursor }) {
      calls.push(['list', prefix, cursor]);
      const all = [...files.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + 2); // 小分页，测翻页
      const next = start + 2;
      return {
        blobs: page.map((p) => ({ pathname: p, url: `https://store.${storeAccess}.blob/${p}` })),
        hasMore: next < all.length,
        cursor: next < all.length ? String(next) : undefined
      };
    },
    async del(p) {
      calls.push(['del', p]);
      files.delete(p);
    }
  };
}

test('blob store: private store round-trip with pagination', async () => {
  const sdk = fakeBlobSdk();
  const store = createBlobStore(sdk);
  for (let i = 0; i < 5; i++) await store.put({ id: `guest-${i}0000000`, name: `G${i}`, attending: 'yes', adults: 1, kids: 0 });
  assert.equal(store.access, 'private');
  const list = await store.list();
  assert.equal(list.length, 5);
  assert.equal((await store.get('guest-20000000')).name, 'G2');
  assert.equal(await store.get('guest-missing0'), null);
  await store.remove('guest-20000000');
  assert.equal((await store.list()).length, 4);
  const putCall = sdk.calls.find((c) => c[0] === 'put');
  assert.equal(putCall[2].addRandomSuffix, false);
  assert.equal(putCall[2].allowOverwrite, true);
});

test('blob store: falls back to public access when the store is public', async () => {
  const sdk = fakeBlobSdk({ storeAccess: 'public' });
  const store = createBlobStore(sdk);
  await store.put({ id: 'guest-pub00000', name: 'P', attending: 'no' });
  assert.equal(store.access, 'public');
  assert.equal((await store.get('guest-pub00000')).name, 'P');
  await store.putSummary({ groups: 0 });
  assert.deepEqual(await store.getSummary(), { groups: 0 });
});

test('blob store: pinned access does not silently switch', async () => {
  const sdk = fakeBlobSdk({ storeAccess: 'public' });
  const store = createBlobStore(sdk, { access: 'private' });
  await assert.rejects(store.put({ id: 'guest-x0000000', name: 'X', attending: 'no' }));
});
