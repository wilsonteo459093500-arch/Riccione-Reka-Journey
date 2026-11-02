// 清单纯函数 + mutate（记忆体 adapter）
import test from 'node:test';
import assert from 'node:assert/strict';
import { lib, photo, fakeH, flipBits } from '../testkit.mjs';

const K = lib.catalog;
const { memoryAdapter } = lib.blob;
const C = String.fromCharCode;
const NOW = Date.UTC(2026, 10, 2, 8, 0, 0);
const NAME = 'Setia Alam 原木 测试客户';

function fresh() { return K.emptyIndex(); }
function add(index, name, photos, by, extra) { return K.addPhotos(index, Object.assign({ project: { name }, photos }, extra || {}), by || 'Ana', NOW); }
function expectHttp(fn, status, error) {
  try { fn(); } catch (e) {
    assert.equal(e.status, status, 'status');
    if (error) assert.equal(e.body.error, error, 'error code');
    return e.body;
  }
  assert.fail('expected HttpError ' + status);
}

test('emptyIndex shape', () => {
  assert.deepEqual(K.emptyIndex(), { v: 1, rev: 0, base: '', projects: {}, photos: {}, log: [] });
});

test('pidOf: Chinese / Malay names, whitespace, case and Unicode form variants', () => {
  const p = K.pidOf(NAME);
  assert.match(p, /^p[0-9a-f]{10}$/);
  assert.equal(K.pidOf('  Setia  Alam 原木\t测试客户  '), p, 'extra whitespace');
  assert.equal(K.pidOf('SETIA ALAM 原木 测试客户'), p, 'case');
  assert.equal(K.pidOf('Setia' + C(0x3000) + 'Alam 原木 测试客户'), p, 'ideographic space');
  const malay = 'Taman Contoh Rumah Teres Encik Ujian';
  assert.match(K.pidOf(malay), /^p[0-9a-f]{10}$/);
  assert.equal(K.pidOf('taman   contoh rumah teres ENCIK ujian'), K.pidOf(malay));
  const nfc = 'Kafé Ujian 中古';
  const nfd = nfc.normalize('NFD');
  assert.notEqual(nfc, nfd);
  assert.equal(K.pidOf(nfd), K.pidOf(nfc), 'NFD == NFC');
  assert.notEqual(K.pidOf(malay), p);
  assert.notEqual(K.pidOf('Setia Alam 原木 测试客户2'), p);
  assert.equal(K.normalizeName('  A  B '), 'a b');
});

test('addPhotos: adds, counts, stores height as h and keeps f', () => {
  const ix = fresh();
  const h1 = fakeH(), h2 = fakeH();
  const r = add(ix, NAME, [photo(h1, '0000000000000000'), photo(h2, 'ffffffffffffffff')], 'Ana', { pack: 't/x-1.json' });
  const pid = K.pidOf(NAME);
  assert.equal(r.pid, pid);
  assert.deepEqual(r.added, [h1, h2]);
  assert.deepEqual(r.dup, []);
  const pr = ix.projects[pid];
  assert.equal(pr.name, NAME);
  assert.deepEqual([pr.area, pr.ptype, pr.traits, pr.style, pr.n, pr.by, pr.ts], ['', '', [], '', 2, 'Ana', NOW]);
  assert.deepEqual(pr.packs, ['t/x-1.json']);
  const ph = ix.photos[h1];
  assert.equal(ph.p, pid);
  assert.equal(ph.h, 1200);
  assert.equal(ph.w, 1600);
  assert.equal(ph.status, 'new');
  assert.equal(ph.shot, h1);
  assert.equal(ph.hero, false);
  assert.deepEqual(ph.desc, { zh: '', en: '' });
  assert.match(ph.f, /^厨房\/IMG_/);
  assert.ok(!('ht' in ph));
});

test('addPhotos: idempotent by h16 (second identical call is a no-op)', () => {
  const ix = fresh();
  const list = [photo(fakeH()), photo(fakeH())];
  add(ix, NAME, list);
  const before = JSON.stringify(ix);
  const r = add(ix, NAME, list);
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.dup, []);
  assert.equal(r.noop, true);
  assert.equal(JSON.stringify(ix), before);
  // 同一批里重复的也只登记一次
  const ix2 = fresh();
  const h = fakeH();
  const r2 = add(ix2, NAME, [photo(h), photo(h)]);
  assert.deepEqual(r2.added, [h]);
  assert.equal(ix2.projects[r2.pid].n, 1);
});

test('addPhotos: same photo in another project stays where it is and is reported as dup', () => {
  const ix = fresh();
  const shared = fakeH();
  const a = add(ix, NAME, [photo(shared)]);
  const other = 'Puchong 奶油风 测试客户乙';
  const own = fakeH();
  const b = add(ix, other, [photo(shared), photo(own)]);
  assert.deepEqual(b.added, [own]);
  assert.deepEqual(b.dup, [shared]);
  assert.equal(ix.photos[shared].p, a.pid);
  assert.equal(ix.projects[a.pid].n, 1);
  assert.equal(ix.projects[b.pid].n, 1);
});

test('addPhotos: validation', () => {
  const ix = fresh();
  const h = fakeH();
  expectHttp(() => add(ix, '   ', [photo(h)]), 400, 'project');
  expectHttp(() => add(ix, NAME, []), 400, 'photos');
  expectHttp(() => add(ix, NAME, Array.from({ length: 41 }, () => photo(fakeH()))), 400, 'too_many');
  assert.equal(add(fresh(), NAME, Array.from({ length: 40 }, () => photo(fakeH()))).added.length, 40, '40 is fine');
  expectHttp(() => add(ix, NAME, [{ ...photo(h), h: 'XYZ' }]), 400, 'photo');
  expectHttp(() => add(ix, NAME, [{ ...photo(h), k: 'c/' + fakeH() + '-abc.jpg' }]), 400, 'photo');
  expectHttp(() => add(ix, NAME, [{ ...photo(h), k: 'catalog/x/index.json' }]), 400, 'photo');
  expectHttp(() => add(ix, NAME, [{ ...photo(h), w: 0 }]), 400, 'photo');
  expectHttp(() => add(ix, NAME, [{ ...photo(h), ht: 1.5 }]), 400, 'photo');
  expectHttp(() => add(ix, NAME, [{ ...photo(h), dh: 'nothex' }]), 400, 'photo');
  assert.deepEqual(ix.photos, {}, 'nothing stored after failed validation');
});

test('groupShots: Hamming ≤ 6 joins the earliest leader, 7 does not', () => {
  const ix = fresh();
  const base = '0123456789abcdef';
  const hA = fakeH(), hB = fakeH(), hC = fakeH(), hD = fakeH(), hE = fakeH();
  const near6 = flipBits(base, [0, 5, 9, 20, 33, 63]);
  const far7 = flipBits(base, [1, 2, 3, 4, 40, 50, 60]);
  assert.equal(K.hamming(base, near6), 6);
  assert.equal(K.hamming(base, far7), 7);
  // B 离 A 5 位、C 离 B 5 位但离 A 10 位：只跟组长比 → C 自己一组
  const b5 = flipBits(base, [10, 11, 12, 13, 14]);
  const c10 = flipBits(b5, [30, 31, 32, 34, 35]);
  assert.equal(K.hamming(base, c10), 10);
  add(ix, NAME, [photo(hA, base), photo(hB, near6), photo(hC, far7), photo(hD, b5), photo(hE, c10)]);
  assert.equal(ix.photos[hA].shot, hA);
  assert.equal(ix.photos[hB].shot, hA, 'distance 6 → same shot');
  assert.equal(ix.photos[hC].shot, hC, 'distance 7 → own shot');
  assert.equal(ix.photos[hD].shot, hA);
  assert.equal(ix.photos[hE].shot, hE, 'leader-only comparison');
  // 后来加的照片不改动已分好的组；近似的加入既有组长
  const hF = fakeH();
  add(ix, NAME, [photo(hF, flipBits(far7, [7]))]);
  assert.equal(ix.photos[hF].shot, hC);
  assert.equal(ix.photos[hB].shot, hA);
  // 别的项目里一样的 dHash 不会被分进来
  const hG = fakeH();
  add(ix, 'Klang 北欧 测试客户丙', [photo(hG, base)]);
  assert.equal(ix.photos[hG].shot, hG);
  assert.equal(K.hamming('zz', base), 64, 'invalid hash = far');
});

function seeded() {
  const ix = fresh();
  const hs = [fakeH(), fakeH(), fakeH()];
  const r = add(ix, NAME, hs.map((h) => photo(h)), 'Ana');
  return { ix, hs, pid: r.pid };
}

test('patch auto: sets tags and status auto (or unsure)', () => {
  const { ix, hs } = seeded();
  const r = K.patch(ix, { source: 'auto', photos: { [hs[0]]: { room: 'kitchen', cabinets: ['kitchen', 'island', 'kitchen'], style: 'wood', hero: true, desc: { zh: '原木厨房', en: 'Oak kitchen' } }, [hs[1]]: { room: 'other', status: 'unsure' } } }, 'Claude', NOW + 1);
  assert.equal(r.changed, 2);
  const p0 = ix.photos[hs[0]];
  assert.deepEqual([p0.room, p0.cabinets, p0.style, p0.hero, p0.status, p0.by, p0.ts], ['kitchen', ['kitchen', 'island'], 'wood', true, 'auto', 'Claude', NOW + 1]);
  assert.deepEqual(p0.desc, { zh: '原木厨房', en: 'Oak kitchen' });
  assert.equal(ix.photos[hs[1]].status, 'unsure');
});

test('patch auto never overwrites a confirmed photo; human patch confirms', () => {
  const { ix, hs } = seeded();
  K.patch(ix, { source: 'human', photos: { [hs[0]]: { room: 'living' } } }, 'Ana', NOW);
  assert.equal(ix.photos[hs[0]].status, 'confirmed', 'human edit → confirmed');
  assert.equal(ix.photos[hs[0]].by, 'Ana');
  const before = JSON.stringify(ix.photos[hs[0]]);
  const r = K.patch(ix, { source: 'auto', photos: { [hs[0]]: { room: 'kitchen', style: 'luxe', status: 'auto' } } }, 'Claude', NOW + 5);
  assert.equal(r.changed, 0);
  assert.equal(r.noop, true);
  assert.equal(JSON.stringify(ix.photos[hs[0]]), before, 'confirmed photo untouched');
  // 人工可以明确设成 unsure
  K.patch(ix, { source: 'human', photos: { [hs[1]]: { room: 'study', status: 'unsure' } } }, 'Ana', NOW);
  assert.equal(ix.photos[hs[1]].status, 'unsure');
  // 自动不能自己标 confirmed
  expectHttp(() => K.patch(ix, { source: 'auto', photos: { [hs[2]]: { status: 'confirmed' } } }, 'Claude', NOW), 400, 'vocab');
  // desc 只改一边，另一边保留
  K.patch(ix, { source: 'human', photos: { [hs[2]]: { desc: { zh: '中文' } } } }, 'Ana', NOW);
  K.patch(ix, { source: 'human', photos: { [hs[2]]: { desc: { en: 'English' } } } }, 'Ana', NOW);
  assert.deepEqual(ix.photos[hs[2]].desc, { zh: '中文', en: 'English' });
});

test('patch projects: auto fills empty fields, never overwrites a human-set field', () => {
  const { ix, pid } = seeded();
  // 项目是 Ana 上传建立的，栏位都空 → 自动可以填
  K.patch(ix, { source: 'auto', projects: { [pid]: { area: 'Setia Alam', style: 'wood', ptype: 'terrace' } } }, 'Claude', NOW);
  assert.deepEqual([ix.projects[pid].area, ix.projects[pid].style, ix.projects[pid].by], ['Setia Alam', 'wood', 'Claude']);
  // Claude 自己填的，自动可以再改
  K.patch(ix, { source: 'auto', projects: { [pid]: { style: 'japandi' } } }, 'Claude', NOW);
  assert.equal(ix.projects[pid].style, 'japandi');
  // 人改了之后，自动不能再动非空栏位，但能填空的
  K.patch(ix, { source: 'human', projects: { [pid]: { style: 'wood', traits: [] } } }, 'Ana', NOW);
  assert.equal(ix.projects[pid].by, 'Ana');
  const r = K.patch(ix, { source: 'auto', projects: { [pid]: { style: 'luxe', area: 'Klang', traits: ['elderly', 'kids'] } } }, 'Claude', NOW);
  assert.equal(r.changed, 1);
  assert.equal(ix.projects[pid].style, 'wood', 'human style kept');
  assert.equal(ix.projects[pid].area, 'Setia Alam', 'non-empty area kept');
  assert.deepEqual(ix.projects[pid].traits, ['elderly', 'kids'], 'empty traits filled');
  // 项目名永远不能经 patch 改
  expectHttp(() => K.patch(ix, { source: 'human', projects: { [pid]: { name: 'x' } } }, 'Ana', NOW), 400, 'vocab');
});

test('patch: vocabulary is enforced, all-or-nothing', () => {
  const { ix, hs, pid } = seeded();
  const before = JSON.stringify(ix);
  const cases = [
    [{ photos: { [hs[0]]: { room: 'garage' } } }, 'room'],
    [{ photos: { [hs[0]]: { cabinets: ['sofa'] } } }, 'cabinets'],
    [{ photos: { [hs[0]]: { cabinets: 'kitchen' } } }, 'cabinets'],
    [{ photos: { [hs[0]]: { style: 'boho' } } }, 'style'],
    [{ photos: { [hs[0]]: { hero: 'yes' } } }, 'hero'],
    [{ photos: { [hs[0]]: { status: 'done' } } }, 'status'],
    [{ photos: { [hs[0]]: { f: 'x.jpg' } } }, 'f'],
    [{ photos: { [hs[0]]: { desc: { fr: 'x' } } } }, 'desc.fr'],
    [{ projects: { [pid]: { ptype: 'castle' } } }, 'ptype'],
    [{ projects: { [pid]: { traits: ['cats'] } } }, 'traits'],
    [{ projects: { [pid]: { style: 'boho' } } }, 'style'],
    [{ projects: { [pid]: { area: 5 } } }, 'area']
  ];
  for (const [body, field] of cases) {
    const b = expectHttp(() => K.patch(ix, { source: 'human', ...body }, 'Ana', NOW), 400, 'vocab');
    assert.equal(b.field, field, JSON.stringify(body));
  }
  // 一笔好的 + 一笔坏的 → 整批不写
  expectHttp(() => K.patch(ix, { source: 'human', photos: { [hs[0]]: { room: 'kitchen' }, [hs[1]]: { room: 'garage' } } }, 'Ana', NOW), 400, 'vocab');
  expectHttp(() => K.patch(ix, { source: 'robot', photos: {} }, 'Ana', NOW), 400, 'vocab');
  expectHttp(() => K.patch(ix, { source: 'human', photos: { ['0'.repeat(16)]: { room: 'kitchen' } } }, 'Ana', NOW), 400, 'unknown');
  expectHttp(() => K.patch(ix, { source: 'human', projects: { pdeadbeef00: { area: 'x' } } }, 'Ana', NOW), 400, 'unknown');
  const many = {};
  for (let i = 0; i < 401; i++) many[i.toString(16).padStart(16, '0')] = { room: 'kitchen' };
  expectHttp(() => K.patch(ix, { source: 'human', photos: many }, 'Ana', NOW), 400, 'too_many');
  assert.equal(JSON.stringify(ix), before, 'index unchanged');
  // '' 是合法的「清空」
  K.patch(ix, { source: 'human', photos: { [hs[0]]: { room: '', style: '' } }, projects: { [pid]: { ptype: '' } } }, 'Ana', NOW);
  assert.equal(ix.photos[hs[0]].room, '');
});

test('patch: free text is cleaned (control chars, length)', () => {
  const { ix, hs, pid } = seeded();
  K.patch(ix, { source: 'human', photos: { [hs[0]]: { desc: { zh: 'a' + C(0) + 'b' + C(0x202e) + 'c', en: 'x'.repeat(500) } } }, projects: { [pid]: { area: '  Setia' + C(10) + 'Alam ' } } }, 'Ana', NOW);
  assert.equal(ix.photos[hs[0]].desc.zh, 'a b c');
  assert.equal(ix.photos[hs[0]].desc.en.length, 200);
  assert.equal(ix.projects[pid].area, 'Setia Alam');
});

test('hide / unhide photos and projects (never deletes)', () => {
  const { ix, hs, pid } = seeded();
  const r = K.setHidden(ix, { photos: [hs[0]], projects: [pid] }, true, 'Ana', NOW);
  assert.equal(r.changed, 2);
  assert.deepEqual(ix.photos[hs[0]].hidden, { by: 'Ana', ts: NOW });
  assert.deepEqual(ix.projects[pid].hidden, { by: 'Ana', ts: NOW });
  assert.equal(K.setHidden(ix, { photos: [hs[0]] }, true, 'Bo', NOW).noop, true, 'hiding twice is a no-op');
  assert.deepEqual(ix.photos[hs[0]].hidden, { by: 'Ana', ts: NOW });
  K.setHidden(ix, { photos: [hs[0]], projects: [pid] }, false, 'Bo', NOW + 1);
  assert.ok(!('hidden' in ix.photos[hs[0]]));
  assert.ok(!('hidden' in ix.projects[pid]));
  assert.ok(ix.photos[hs[0]], 'photo still there');
  expectHttp(() => K.setHidden(ix, { photos: ['nope'] }, true, 'Ana', NOW), 400, 'unknown');
  expectHttp(() => K.setHidden(ix, { photos: 'x' }, true, 'Ana', NOW), 400, 'ids');
});

test('visiView strips project name, file path and log, keeps hidden flags', () => {
  const { ix, hs, pid } = seeded();
  K.setHidden(ix, { photos: [hs[1]] }, true, 'Ana', NOW);
  ix.log = [{ op: 'addPhotos', by: 'Ana', ts: NOW, n: 3 }];
  const v = K.visiView(ix);
  assert.ok(!('log' in v));
  assert.ok(!('name' in v.projects[pid]));
  for (const h of hs) assert.ok(!('f' in v.photos[h]));
  assert.ok(v.photos[hs[1]].hidden);
  const text = JSON.stringify(v);
  assert.ok(!text.includes('测试客户'), 'no folder name anywhere');
  assert.ok(!text.includes('IMG_'), 'no file path anywhere');
  assert.equal(ix.projects[pid].name, NAME, 'original untouched');
  assert.ok(ix.log.length);
});

test('sizeOk: 3.5 MB cap', () => {
  assert.equal(K.MAX_INDEX, 3670016);
  assert.equal(K.sizeOk('x'.repeat(K.MAX_INDEX)), true);
  assert.equal(K.sizeOk('x'.repeat(K.MAX_INDEX + 1)), false);
  assert.equal(K.sizeOk('字'.repeat(Math.floor(K.MAX_INDEX / 3) + 1)), false, 'counts UTF-8 bytes');
  assert.equal(K.sizeOk(K.emptyIndex()), true);
});

/* ---------- mutate ---------- */
const PATH = 'catalog/test/index.json';
const noSleep = () => Promise.resolve();
let clock = NOW;
const opts = (o) => Object.assign({ by: 'Ana', op: 'test', sleep: noSleep, now: () => clock }, o || {});

test('mutate: create, then conditional updates; rev, log and base', async () => {
  const a = memoryAdapter({ base: 'http://blob.test/' });
  const h = fakeH();
  const r = await K.mutate(a, PATH, (ix, ts) => add(ix, NAME, [photo(h)], 'Ana', { ts }), opts({ op: 'addPhotos' }));
  assert.equal(r.rev, 1);
  assert.deepEqual(r.added, [h]);
  let stored = (await a.getJson(PATH)).data;
  assert.equal(stored.rev, 1);
  assert.equal(stored.base, 'http://blob.test/');
  assert.deepEqual(stored.log, [{ op: 'addPhotos', by: 'Ana', ts: clock, n: 1 }]);
  const r2 = await K.mutate(a, PATH, (ix, ts) => K.patch(ix, { source: 'human', photos: { [h]: { room: 'kitchen' } } }, 'Bo', ts), opts({ by: 'Bo', op: 'patch' }));
  assert.equal(r2.rev, 2);
  stored = (await a.getJson(PATH)).data;
  assert.equal(stored.photos[h].room, 'kitchen');
  assert.equal(stored.log.length, 2);
  assert.deepEqual(a.stats().puts, 2);
});

test('mutate: no-op writes nothing', async () => {
  const a = memoryAdapter();
  const list = [photo(fakeH())];
  await K.mutate(a, PATH, (ix, ts) => K.addPhotos(ix, { project: { name: NAME }, photos: list }, 'Ana', ts), opts());
  const puts = a.stats().puts;
  const r = await K.mutate(a, PATH, (ix, ts) => K.addPhotos(ix, { project: { name: NAME }, photos: list }, 'Ana', ts), opts());
  assert.equal(r.rev, 1);
  assert.deepEqual(r.added, []);
  assert.equal(a.stats().puts, puts, 'no extra put');
  assert.ok(!('noop' in r));
});

test('mutate: 3 injected conflicts still land the write; 5 give up cleanly', async () => {
  const a = memoryAdapter();
  const h1 = fakeH();
  await K.mutate(a, PATH, (ix, ts) => K.addPhotos(ix, { project: { name: NAME }, photos: [photo(h1)] }, 'Ana', ts), opts());
  a.conflictNext(3);
  const r = await K.mutate(a, PATH, (ix, ts) => K.patch(ix, { source: 'human', photos: { [h1]: { room: 'study' } } }, 'Ana', ts), opts());
  assert.equal(r.rev, 2);
  assert.equal((await a.getJson(PATH)).data.photos[h1].room, 'study');
  assert.equal(a.stats().conflicts, 3);
  a.conflictNext(4);
  const r4 = await K.mutate(a, PATH, (ix, ts) => K.patch(ix, { source: 'human', photos: { [h1]: { room: 'living' } } }, 'Ana', ts), opts());
  assert.equal(r4.rev, 3, '4 conflicts → lands on the 5th attempt');
  a.conflictNext(5);
  await assert.rejects(
    K.mutate(a, PATH, (ix, ts) => K.patch(ix, { source: 'human', photos: { [h1]: { room: 'kitchen' } } }, 'Ana', ts), opts()),
    (e) => e.status === 409 && e.body.error === 'conflict'
  );
  const after = (await a.getJson(PATH)).data;
  assert.equal(after.rev, 3, 'nothing written after giving up');
  assert.equal(after.photos[h1].room, 'living');
});

test('mutate: real concurrent writers all land (etag check + retry)', async () => {
  const a = memoryAdapter();
  const hs = [fakeH(), fakeH(), fakeH(), fakeH()];
  await K.mutate(a, PATH, (ix, ts) => K.addPhotos(ix, { project: { name: NAME }, photos: hs.map((h) => photo(h)) }, 'Ana', ts), opts());
  const rooms = ['kitchen', 'living', 'study', 'master'];
  const results = await Promise.all(hs.map((h, i) => K.mutate(a, PATH, (ix, ts) => K.patch(ix, { source: 'human', photos: { [h]: { room: rooms[i] } } }, 'U' + i, ts), opts({ by: 'U' + i, sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))) }))));
  const ix = (await a.getJson(PATH)).data;
  hs.forEach((h, i) => assert.equal(ix.photos[h].room, rooms[i]));
  assert.equal(ix.rev, 5);
  assert.deepEqual(results.map((r) => r.rev).sort(), [2, 3, 4, 5]);
  assert.ok(a.stats().conflicts >= 1, 'writers really collided');
});

test('mutate: storage failure is not retried as a conflict', async () => {
  const a = memoryAdapter();
  a.failNextPut(1);
  await assert.rejects(K.mutate(a, PATH, (ix, ts) => K.addPhotos(ix, { project: { name: NAME }, photos: [photo(fakeH())] }, 'Ana', ts), opts()), (e) => e.code === 'storage');
  assert.equal(await a.getJson(PATH), null);
});

test('mutate: refuses to grow the index past 3.5 MB (413)', async () => {
  const a = memoryAdapter();
  await assert.rejects(
    K.mutate(a, PATH, (ix) => { ix.junk = 'x'.repeat(K.MAX_INDEX); return { n: 1 }; }, opts()),
    (e) => e.status === 413 && e.body.error === 'index_too_large'
  );
  assert.equal(a.stats().puts, 0);
});

test('mutate: log keeps the last 300 entries', async () => {
  const a = memoryAdapter();
  const seed = K.emptyIndex();
  seed.rev = 7;
  seed.log = Array.from({ length: 300 }, (_, i) => ({ op: 'old', by: 'x', ts: clock, n: i }));
  await a.putJson(PATH, JSON.stringify(seed), { create: true });
  await K.mutate(a, PATH, (ix, ts) => K.addPhotos(ix, { project: { name: NAME }, photos: [photo(fakeH())] }, 'Ana', ts), opts({ op: 'addPhotos' }));
  const ix = (await a.getJson(PATH)).data;
  assert.equal(ix.log.length, 300);
  assert.equal(ix.log[299].op, 'addPhotos');
  assert.equal(ix.log[0].n, 1, 'oldest dropped');
  assert.equal(ix.rev, 8);
});

test('mutate: first write of a UTC day backs up the previous index (failures ignored)', async () => {
  const a = memoryAdapter();
  const day1 = Date.UTC(2026, 10, 2, 23, 0, 0);
  const day2 = Date.UTC(2026, 10, 3, 1, 0, 0);
  const h = fakeH();
  await K.mutate(a, PATH, (ix, ts) => K.addPhotos(ix, { project: { name: NAME }, photos: [photo(h)] }, 'Ana', ts), opts({ now: () => day1 }));
  await K.mutate(a, PATH, (ix, ts) => K.patch(ix, { source: 'human', photos: { [h]: { room: 'kitchen' } } }, 'Ana', ts), opts({ now: () => day1 + 1000 }));
  assert.equal(a.stats().copies, 0, 'same day → no backup');
  await K.mutate(a, PATH, (ix, ts) => K.patch(ix, { source: 'human', photos: { [h]: { room: 'living' } } }, 'Ana', ts), opts({ now: () => day2 }));
  assert.equal(a.stats().copies, 1);
  const bak = [...a.store.keys()].find((k) => /\/bak\/2026-11-03\.json$/.test(k));
  assert.ok(bak, 'backup named by the day it was taken');
  assert.equal(JSON.parse(a.read(bak).body.toString()).photos[h].room, 'kitchen', 'backup = state before the write');
  await K.mutate(a, PATH, (ix, ts) => K.patch(ix, { source: 'human', photos: { [h]: { room: 'study' } } }, 'Ana', ts), opts({ now: () => day2 + 5 }));
  assert.equal(a.stats().copies, 1, 'only the first write of the day');
  // 备份失败不挡写入
  const day3 = Date.UTC(2026, 10, 4, 1, 0, 0);
  a.copy = async () => { throw new Error('copy broke'); };
  const r = await K.mutate(a, PATH, (ix, ts) => K.patch(ix, { source: 'human', photos: { [h]: { room: 'master' } } }, 'Ana', ts), opts({ now: () => day3 }));
  assert.equal(r.rev, 5);
});
