// 本机模式的清单逻辑（assets/js/caselib/local-core.js = MB.clCore）跟伺服器的 _lib/catalog.js 要一模一样：
// 同一串操作（固定时间）两边各跑一次，清单、回传、错误都要相同。另外测自动标签、标签档、ES5 语法。
// 名字都是假的（陈先生、林太太、Mr Tan、测试客户……）
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lib, INVITE, flipBits, hexOf } from '../testkit.mjs';

const S = lib.catalog;
const CORE_SRC = readFileSync(join(INVITE, 'assets/js/caselib/local-core.js'), 'utf8');
const SW_SRC = readFileSync(join(INVITE, 'caselib-sw.js'), 'utf8');
const PAGE_SRC = readFileSync(join(INVITE, 'assets/js/caselib/local-sw.js'), 'utf8');
const VOCAB_SRC = readFileSync(join(INVITE, 'assets/js/visi/case-vocab.js'), 'utf8');

function loadCore() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(VOCAB_SRC, ctx, { filename: 'case-vocab.js' });
  vm.runInContext(CORE_SRC, ctx, { filename: 'local-core.js' });
  return ctx.window.MB.clCore;
}
const C = loadCore();
// vm 里的物件是另一个 realm：一律转成普通 JSON 再比
const plain = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const T0 = Date.UTC(2026, 10, 4, 2, 0, 0);

// 两边各跑一次：回 {res} 或 {err:{status, body}}
function both(fnS, fnL) {
  const out = [];
  for (const fn of [fnS, fnL]) {
    try { out.push({ res: plain(fn()) }); } catch (e) {
      if (!e || e.status == null) throw e;
      out.push({ err: { status: e.status, body: plain(e.body) } });
    }
  }
  return out;
}
/* 一串操作：[kind, input, by, ts]，kind = add | patch | hide | unhide | purge
   每一步都比：回传 / 错误、整份清单 */
function runBoth(steps, label) {
  const si = S.emptyIndex(), li = C.emptyIndex();
  const results = [];
  steps.forEach(([kind, input, by, ts], i) => {
    const what = label + ' step ' + i + ' ' + kind;
    const call = (M, idx) => () => {
      if (kind === 'add') return M.addPhotos(idx, JSON.parse(JSON.stringify(input)), by, ts);
      if (kind === 'patch') return M.patch(idx, JSON.parse(JSON.stringify(input)), by, ts);
      if (kind === 'hide' || kind === 'unhide') return M.setHidden(idx, JSON.parse(JSON.stringify(input)), kind === 'hide', by, ts);
      if (kind === 'purge') { const hs = M.validatePurge(idx, input); const plan = M.planPurge(idx, hs); return { plan, out: M.applyPurge(idx, plan) }; }
      throw new Error('bad kind');
    };
    const [a, b] = both(call(S, si), call(C, li));
    assert.deepEqual(b, a, what + ': result / error');
    assert.deepEqual(plain(li), plain(si), what + ': index');
    results.push(a);
  });
  return { si, li, results };
}

function ph(h, dh, f, k) {
  return { h, k: k || 'c/' + h + '-AbCdEfGhIjKlMnOpQrStU.jpg', w: 1600, ht: 1200, sz: 345678, dh: dh || 'f0f0f0f0f0f0f0f0', f: f || '厨房/IMG_' + h.slice(0, 4) + '.jpg' };
}
const H = (n) => hexOf(0x1000000000000000n + BigInt(n) * 7919n).slice(-16);
const P1 = 'Setia Alam 原木 陈先生', P2 = 'M Vertica 奶油风 林太太', P3 = 'Bangsar 轻法式 Mr Tan';

/* ------------------------------------------------------------ */
test('local-core: pidOf / normalizeName / cleanText / cleanName are identical to the server', () => {
  const names = [P1, P2, P3, '测试客户 陈先生', '  setia   ALAM 原木 陈先生 ', 'SETIA ALAM 原木 陈先生', 'Setia\tAlam\n原木 陈先生',
    'Taman Desa Jaya', 'Kampung Baru — Rumah Encik Ali', 'Puchong 北欧 Mdm Lee', 'Café 法式', 'Café 法式', 'İstanbul ǅ ß',
    '\ud800 lone surrogate', '🏠 home 测试', 'a​b‮c\u0007d', '', ' ', 'x'.repeat(200) + ' 测试', '全形　空白　测试'];
  for (const n of names) {
    assert.equal(C.normalizeName(n), S.normalizeName(n), 'normalizeName ' + JSON.stringify(n));
    assert.equal(C.pidOf(n), S.pidOf(n), 'pidOf ' + JSON.stringify(n));
    assert.equal(C.pidOf(C.cleanText(n, 120)), S.pidOf(S.cleanText(n, 120)), 'pidOf(cleanText) ' + JSON.stringify(n));
    for (const max of [1, 30, 120, 300]) assert.equal(C.cleanText(n, max), S.cleanText(n, max), 'cleanText ' + max + ' ' + JSON.stringify(n));
    assert.equal(C.cleanName(n), lib.auth.cleanName(n), 'cleanName ' + JSON.stringify(n));
  }
  assert.equal(C.cleanText(42, 10), S.cleanText(42, 10));
  assert.equal(C.cleanName(null), lib.auth.cleanName(null));
  // SHA-256 本身：标准测试向量 + 长字串（跨好几个 64-byte 区块）
  assert.equal(C.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(C.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  const long = '案例'.repeat(500) + 'abc'.repeat(333);
  assert.equal(C.sha256Hex(long), lib.blob ? (await_sha(long)) : '');
  assert.equal(C.utf8Len(long), Buffer.byteLength(long, 'utf8'));
  assert.equal(C.utf8Len('\ud800x'), Buffer.byteLength('\ud800x', 'utf8'));
});
import { createHash } from 'node:crypto';
function await_sha(s) { return createHash('sha256').update(s, 'utf8').digest('hex'); }

test('local-core parity: addPhotos (new project, resend, same h new k, dup across projects, near-dup shots, pack, purged list)', () => {
  const base = 'f0f0f0f0f0f0f0f0';
  const a = [ph(H(1), base, 'IMG_1.jpg'), ph(H(2), flipBits(base, [1, 5]), 'IMG_2.jpg'), ph(H(3), '0f0f0f0f0f0f0f0f', '厨房/K_01.jpg'),
    ph(H(4), flipBits('0f0f0f0f0f0f0f0f', [0, 1, 2, 3, 4, 5, 6]), '厨房/K_02.jpg'), ph(H(5), 'ffffffff00000000', '主卧/M_01.jpg')];
  const { si, results } = runBoth([
    ['add', { project: { name: P1 }, photos: a, pack: 't/pX-aaa.json', packSz: 12345 }, 'Ana', T0],
    ['add', { project: { name: P1 }, photos: a, pack: 't/pX-aaa.json', packSz: 12345 }, 'Ana', T0 + 1000],       // 重送：noop
    ['add', { project: { name: '  setia alam 原木 陈先生' }, photos: [ph(H(1), base, 'IMG_1.jpg', 'c/' + H(1) + '-OtherSuffix.jpg')] }, 'Ben', T0 + 2000],  // 同 h 新 k
    ['add', { project: { name: P2 }, photos: [ph(H(3)), ph(H(6), '00ff00ff00ff00ff'), ph(H(7), flipBits('00ff00ff00ff00ff', [2]))], pack: 't/pY-bbb.json', packSz: 999 }, 'Ben', T0 + 3000],
    ['add', { project: { name: P2 }, photos: [ph(H(8), 'aaaaaaaaaaaaaaaa')], pack: 't/pY-ccc.json', packSz: 500 }, 'Ana', T0 + 4000],
    ['hide', { photos: [H(8)] }, 'Ana', T0 + 5000],
    ['purge', { photos: [H(8)] }, 'Ana', T0 + 6000],
    ['add', { project: { name: P2 }, photos: [ph(H(8), 'aaaaaaaaaaaaaaaa')] }, 'Ana', T0 + 7000]                 // 删过又亲手传回来
  ], 'add');
  assert.equal(results[0].res.added.length, 5);
  assert.equal(results[1].res.noop, true);
  assert.equal(results[2].res.noop, true);
  assert.deepEqual(results[3].res.dup, [H(3)]);
  assert.equal(si.photos[H(2)].shot, H(1), 'near-dup grouped with the leader');
  assert.equal(si.photos[H(4)].shot, H(4), '7 bits away = another shot');
  assert.deepEqual(si.purged || [], [], 'purged list loses the re-added photo');
  assert.equal(si.projects[S.pidOf(P2)].packs.length, 2);
  // 错误也要一样
  const bad = [
    {}, { project: { name: '   ' }, photos: [ph(H(1))] }, { project: { name: P1 }, photos: [] }, { project: { name: P1 }, photos: 'x' },
    { project: { name: P1 }, photos: Array.from({ length: 41 }, (_, i) => ph(H(100 + i))) },
    { project: { name: P1 }, photos: [null] }, { project: { name: P1 }, photos: [Object.assign(ph(H(1)), { h: 'XYZ' })] },
    { project: { name: P1 }, photos: [Object.assign(ph(H(1)), { k: 'c/' + H(2) + '-x.jpg' })] },
    { project: { name: P1 }, photos: [Object.assign(ph(H(1)), { k: 'c/' + H(1) + '-x.png' })] },
    { project: { name: P1 }, photos: [Object.assign(ph(H(1)), { w: 0 })] }, { project: { name: P1 }, photos: [Object.assign(ph(H(1)), { ht: 1.5 })] },
    { project: { name: P1 }, photos: [Object.assign(ph(H(1)), { sz: -1 })] }, { project: { name: P1 }, photos: [Object.assign(ph(H(1)), { dh: 'zz' })] }
  ];
  for (const input of bad) {
    const [x, y] = both(() => S.addPhotos(S.emptyIndex(), input, 'Ana', T0), () => C.addPhotos(C.emptyIndex(), input, 'Ana', T0));
    assert.ok(x.err, 'server rejects ' + JSON.stringify(input).slice(0, 80));
    assert.deepEqual(y, x, JSON.stringify(input).slice(0, 80));
  }
});

test('local-core parity: patch — auto vs human, confirmed protected, project rules, vocab / unknown / too_many errors', () => {
  const a = [ph(H(11)), ph(H(12), '0000ffff0000ffff'), ph(H(13), 'ffff0000ffff0000')];
  const pid = S.pidOf(P1);
  const { si } = runBoth([
    ['add', { project: { name: P1 }, photos: a }, 'Ana', T0],
    ['patch', { source: 'auto', photos: { [H(11)]: { room: 'kitchen', cabinets: ['kitchen', 'island', 'kitchen'] }, [H(12)]: { room: 'master', status: 'unsure' } }, projects: { [pid]: { style: 'wood', area: 'Setia Alam' } } }, 'Claude', T0 + 1000],
    ['patch', { source: 'human', photos: { [H(11)]: { style: 'wood', desc: { zh: '原木橱柜' } } }, projects: { [pid]: { ptype: 'semid', traits: ['kids'] } } }, 'Ana', T0 + 2000],
    ['patch', { source: 'auto', photos: { [H(11)]: { room: 'dining' } }, projects: { [pid]: { style: 'cream', area: 'Other' } } }, 'Claude', T0 + 3000],  // 已确认、人改过：不动
    ['patch', { source: 'human', photos: { [H(13)]: { hero: true, status: 'unsure' } } }, 'Ben', T0 + 4000],
    ['patch', { source: 'human', photos: { [H(13)]: { desc: { en: 'Walk-in wardrobe' } } } }, 'Ben', T0 + 5000],
    ['patch', { source: 'human', photos: { [H(13)]: { desc: { en: 'Walk-in wardrobe' } } } }, 'Ben', T0 + 6000],   // 一样的：noop
    ['patch', { source: 'auto', projects: { [pid]: { area: '' } } }, 'Claude', T0 + 7000]
  ], 'patch');
  assert.equal(si.photos[H(11)].status, 'confirmed');
  assert.equal(si.photos[H(11)].room, 'kitchen', 'auto did not touch a confirmed photo');
  assert.equal(si.projects[pid].style, 'wood', 'auto did not touch a human-set project field');
  assert.equal(si.photos[H(12)].status, 'unsure');
  // 错误
  const idx = () => { const x = S.emptyIndex(); S.addPhotos(x, { project: { name: P1 }, photos: a }, 'Ana', T0); return x; };
  const many = {}; for (let i = 0; i < 401; i++) many[H(500 + i)] = { room: 'kitchen' };
  const bad = [
    { source: 'robot' }, { source: 'human', photos: [] }, { source: 'human', photos: many },
    { source: 'human', photos: { [H(99)]: { room: 'kitchen' } } }, { source: 'human', photos: { __proto__x: {} } },
    { source: 'human', projects: { p0000000000: { style: 'wood' } } },
    { source: 'human', photos: { [H(11)]: { room: 'garage' } } }, { source: 'human', photos: { [H(11)]: { style: 'boho' } } },
    { source: 'human', photos: { [H(11)]: { cabinets: ['sofa'] } } }, { source: 'human', photos: { [H(11)]: { cabinets: 'kitchen' } } },
    { source: 'human', photos: { [H(11)]: { hero: 'yes' } } }, { source: 'human', photos: { [H(11)]: { desc: { fr: 'x' } } } },
    { source: 'human', photos: { [H(11)]: { colour: 'red' } } }, { source: 'auto', photos: { [H(11)]: { status: 'confirmed' } } },
    { source: 'human', photos: { [H(11)]: { status: 'done' } } }, { source: 'human', photos: { [H(11)]: [] } },
    { source: 'human', projects: { [pid]: { ptype: 'castle' } } }, { source: 'human', projects: { [pid]: { traits: ['robots'] } } },
    { source: 'human', projects: { [pid]: { area: 5 } } }, { source: 'human', projects: { [pid]: { name: 'x' } } }
  ];
  for (const input of bad) {
    const [x, y] = both(() => S.patch(idx(), input, 'Ana', T0), () => C.patch(plain(idx()), input, 'Ana', T0));
    assert.ok(x.err, 'server rejects ' + JSON.stringify(input).slice(0, 80));
    assert.deepEqual(y, x, JSON.stringify(input).slice(0, 80));
  }
});

test('local-core parity: hide / unhide photos and projects, purge (partial, emptied project, not_hidden), visiView', () => {
  const a = [ph(H(21), '1111111111111111', '厨房/a.jpg'), ph(H(22), flipBits('1111111111111111', [3]), '厨房/b.jpg'), ph(H(23), '2222222222222222', '主卧/c.jpg')];
  const b = [ph(H(24), '3333333333333333'), ph(H(25), '4444444444444444')];
  const p1 = S.pidOf(P1), p3 = S.pidOf(P3);
  const { si, li, results } = runBoth([
    ['add', { project: { name: P1 }, photos: a, pack: 't/p1-a.json', packSz: 4000 }, 'Ana', T0],
    ['add', { project: { name: P3 }, photos: b, pack: 't/p3-b.json', packSz: 3000 }, 'Ana', T0 + 1],
    ['hide', { photos: [H(21), H(21)], projects: [] }, 'Ana', T0 + 2],
    ['hide', { photos: [H(21)] }, 'Ben', T0 + 3],                      // 已经隐藏：noop
    ['unhide', { photos: [H(23)] }, 'Ben', T0 + 4],                    // 没隐藏：noop
    ['hide', { projects: [p3] }, 'Ben', T0 + 5],
    ['unhide', { projects: [p3] }, 'Ben', T0 + 6],
    ['hide', { projects: [p3] }, 'Ben', T0 + 7],
    ['purge', { photos: [H(21)] }, 'Ana', T0 + 8],                     // 只删一部分：组长被删了要重新分组
    ['purge', { photos: [H(24), H(25), H(24)] }, 'Ana', T0 + 9]          // 整个项目删光：项目拿掉、缩图包要删
  ], 'hide');
  assert.equal(si.photos[H(22)].shot, H(22), 'regrouped after the leader was purged');
  assert.ok(!si.projects[p3], 'emptied project removed');
  assert.deepEqual(results[9].res.plan.packs, ['t/p3-b.json']);
  assert.deepEqual(si.purged, [H(21), H(24), H(25)]);
  assert.equal(typeof si.projects[p1].pb, 'number');
  // 错误
  const errs = [
    () => [S.setHidden(plain(si), { photos: 'x' }, true, 'A', T0), C.setHidden(plain(li), { photos: 'x' }, true, 'A', T0)],
    () => [S.setHidden(plain(si), { photos: [H(99)] }, true, 'A', T0), C.setHidden(plain(li), { photos: [H(99)] }, true, 'A', T0)],
    () => [S.setHidden(plain(si), { projects: ['nope'] }, false, 'A', T0), C.setHidden(plain(li), { projects: ['nope'] }, false, 'A', T0)]
  ];
  for (const [fs, fl] of [
    [() => S.setHidden(plain(si), { photos: 'x' }, true, 'A', T0), () => C.setHidden(plain(li), { photos: 'x' }, true, 'A', T0)],
    [() => S.setHidden(plain(si), { photos: [H(99)] }, true, 'A', T0), () => C.setHidden(plain(li), { photos: [H(99)] }, true, 'A', T0)],
    [() => S.setHidden(plain(si), { projects: ['nope'] }, false, 'A', T0), () => C.setHidden(plain(li), { projects: ['nope'] }, false, 'A', T0)],
    [() => S.setHidden(plain(si), { photos: Array(401).fill(H(22)) }, true, 'A', T0), () => C.setHidden(plain(li), { photos: Array(401).fill(H(22)) }, true, 'A', T0)],
    [() => S.validatePurge(plain(si), { photos: [H(23)] }), () => C.validatePurge(plain(li), { photos: [H(23)] })],
    [() => S.validatePurge(plain(si), { photos: [] }), () => C.validatePurge(plain(li), { photos: [] })],
    [() => S.validatePurge(plain(si), {}), () => C.validatePurge(plain(li), {})],
    [() => S.validatePurge(plain(si), { photos: [H(98)] }), () => C.validatePurge(plain(li), { photos: [H(98)] })],
    [() => S.validatePurge(plain(si), { photos: Array(1001).fill(H(22)) }), () => C.validatePurge(plain(li), { photos: Array(1001).fill(H(22)) })]
  ]) {
    const [x, y] = both(fs, fl);
    assert.ok(x.err, 'server rejects');
    assert.deepEqual(y, x);
  }
  assert.equal(errs.length, 3);
  // 给 VISI 的版本：拿掉项目名、档案路径、操作纪录、删过的
  const vs = S.visiView(si), vl = C.visiView(li);
  assert.deepEqual(plain(vl), plain(vs));
  const text = JSON.stringify(vl);
  for (const leak of ['陈先生', 'Setia Alam 原木', '厨房/', '"f"', '"name"', '"log"', '"purged"']) assert.ok(!text.includes(leak), 'visiView leaks ' + leak);
});

test('local-core parity: run() = the server mutate (rev, log, usage, base, noop) with a fixed clock', async () => {
  // 伺服器的 mutate 走一个没有 copy（没有每天备份）的小 adapter；本机的 run 直接改
  let stored = null;
  const adapter = {
    base: 'http://127.0.0.1:1/local-cases/',
    getJson: async () => (stored ? { data: JSON.parse(stored.text), etag: stored.etag } : null),
    putJson: async (path, text) => { stored = { text, etag: '"' + Math.random() + '"' }; return { etag: stored.etag }; }
  };
  const li = C.emptyIndex();
  let clock = T0;
  const steps = [
    ['addPhotos', (M) => (idx, ts) => M.addPhotos(idx, { project: { name: P2 }, photos: [ph(H(31)), ph(H(32), '0101010101010101')], pack: 't/p-x.json', packSz: 100 }, 'Ana', ts)],
    ['addPhotos', (M) => (idx, ts) => M.addPhotos(idx, { project: { name: P2 }, photos: [ph(H(31))] }, 'Ana', ts)],   // noop：rev 不变
    ['patch', (M) => (idx, ts) => M.patch(idx, { source: 'human', photos: { [H(31)]: { room: 'living', cabinets: ['tvwall'] } } }, 'Ben', ts)],
    ['hide', (M) => (idx, ts) => M.setHidden(idx, { photos: [H(32)] }, true, 'Ben', ts)]
  ];
  // 跨月：usage 换新的一个月
  const clocks = [T0, T0 + 1000, Date.UTC(2026, 11, 1, 0, 0, 1), Date.UTC(2026, 11, 2)];
  for (let i = 0; i < steps.length; i++) {
    const [op, mk] = steps[i];
    clock = clocks[i];
    const outS = await S.mutate(adapter, 'idx', mk(S), { by: 'Ana', op, now: () => clock });
    const r = C.run(li, mk(C), { by: 'Ana', op, now: () => clock, base: adapter.base });
    assert.deepEqual(plain(r.out), plain(outS), op + ' result');
    assert.deepEqual(plain(li), JSON.parse(stored.text), op + ' index');
  }
  assert.equal(li.rev, 3);
  assert.deepEqual(plain(li.usage), { '2026-11': { writes: 4 }, '2026-12': { writes: 2 } });   // 2 张 + 缩图包 + 清单；之后各 1 次
  assert.equal(li.log.length, 3);
  assert.equal(li.base, adapter.base);
});

/* ---------- 自动标签 ---------- */
test('auto tags: folder names → style + area (never the client name), sub-folders → room + cabinets', () => {
  const proj = [
    [P1, 'wood', 'Setia Alam'], [P2, 'cream', ''], [P3, 'french', 'Bangsar'],
    ['Cheras 现代 测试客户', '', ''], ['Kepong 简约 测试', 'modern', 'Kepong'], ['Ipoh 日式 黄小姐', 'japandi', 'Ipoh'],
    ['Puchong 北欧 Mdm Lee', 'nordic', 'Puchong'], ['Klang 现代简约 Mr Ong', 'modern', 'Klang'],
    ['Setia_Alam_原木_陈先生', 'wood', 'Setia Alam'], ['Setia Alam - 原木 - Tan Ah Kow', 'wood', 'Setia Alam'],
    // 客户名字在前面、或看不出哪段是地名：区域留空
    ['Tan Ah Kow 原木 Setia', 'wood', ''], ['Mr Tan 原木 Setia Alam', 'wood', ''], ['陈先生 原木 Setia Alam', 'wood', ''],
    ['Jalan Mawar 12 原木 陈先生', 'wood', ''], ['Lot 5 Jalan Mawar 原木 陈先生', 'wood', ''], ['原木 陈先生', 'wood', ''],
    ['测试客户 陈先生', '', ''], ['Condo 原木 陈先生', 'wood', ''], ['Mont Kiara Luxury 林太太', 'luxe', 'Mont Kiara'],
    ['Rawang 连拍 测试客户', '', ''],
    // 拉丁字母的客户名字（后面有称呼也一样）：绝不当成区域
    ['John Doe 原木 黄先生', 'wood', ''], ['Jane 北欧 测试客户', 'nordic', ''], ['Tan Residence 原木 Mr Tan', 'wood', ''],
    ['Lim 原木 Lim太太', 'wood', ''], ['Jane Roe 轻法式 Jane 小姐', 'french', ''], ['Sri Doe 原木 测试客户', 'wood', ''],
    ['Alam Impian 原木 陈先生', 'wood', ''],
    // 一看就是地名的开头（Taman、Bandar、Desa、Kota…）
    ['Taman Desa Jaya 原木 陈先生', 'wood', 'Taman Desa Jaya'], ['Bandar Baru Bangi 北欧 Mr Tan', 'nordic', 'Bandar Baru Bangi'],
    ['Kota Damansara 奶油风 林太太', 'cream', 'Kota Damansara'], ['Taman 原木 陈先生', 'wood', '']
  ];
  for (const [name, style, area] of proj) assert.deepEqual(plain(C.guessProject(name)), { style, area }, name);
  const rooms = [
    ['厨房/K_01.jpg', 'kitchen', ['kitchen']], ['Kitchen/x.jpg', 'kitchen', ['kitchen']], ['主卧/M_01.jpg', 'master', []],
    ['Master Bedroom/x.jpg', 'master', []], ['客厅/x.jpg', 'living', []], ['Living Room/x.jpg', 'living', []], ['餐厅/x.jpg', 'dining', []],
    ['书房/x.jpg', 'study', ['bookcase'].slice(0, 0)], ['衣帽间/x.jpg', 'walkin', []], ['主卧衣帽间/x.jpg', 'walkin', []],
    ['浴室/x.jpg', 'bathroom', []], ['厕所/x.jpg', 'bathroom', []], ['主卧浴室/x.jpg', 'bathroom', []], ['阳台/x.jpg', '', []],
    ['玄关/x.jpg', 'foyer', []], ['Foyer/x.jpg', 'foyer', []], ['儿童房/x.jpg', 'bedroom', []], ['客房/x.jpg', 'guest', []],
    ['神台/x.jpg', 'altar', []], ['洗衣房/x.jpg', 'laundry', []],
    // 柜子：子文件夹名明明白白写着的；空间没写、柜子只会在一个空间 → 就是那里
    ['橱柜/x.jpg', 'kitchen', ['kitchen']], ['衣柜/x.jpg', '', ['wardrobe']], ['主卧/衣柜/x.jpg', 'master', ['wardrobe']],
    ['鞋柜/x.jpg', 'foyer', ['shoe']], ['电视柜/x.jpg', 'living', ['tvcab']], ['电视墙/T_01.jpg', 'living', ['tvwall']],
    ['书柜/x.jpg', '', ['bookcase']], ['中岛/x.jpg', 'kitchen', ['island']], ['浴室柜/x.jpg', 'bathroom', ['bathvanity']],
    ['餐边柜/x.jpg', 'dining', ['sideboard']], ['客厅/电视柜/x.jpg', 'living', ['tvcab']], ['厨房/中岛/x.jpg', 'kitchen', ['kitchen', 'island']],
    ['IMG_0001.jpg', '', []], ['Outdoor/x.jpg', '', []], ['2F/主卧/x.jpg', 'master', []], ['陈先生家/x.jpg', '', []]
  ];
  for (const [f, room, cabinets] of rooms) assert.deepEqual(plain(C.guessPhoto(f)), { room, cabinets }, f);
  // 每个猜出来的都要是词表里的 key（伺服器的 patch 收得下）
  for (const [f] of rooms) {
    const g = C.guessPhoto(f);
    if (g.room) assert.ok(lib.vocab.isRoom(g.room), g.room);
    g.cabinets.forEach((c) => assert.ok(lib.vocab.isCabinet(c), c));
  }
});

test('auto tags: autoTags only fills empty fields, skips confirmed / unsure photos, and the patch is accepted by the server', () => {
  const idx = S.emptyIndex();
  const names = [P1, P2, 'Tan Ah Kow 原木 Setia', '测试客户 陈先生'];
  names.forEach((n, i) => S.addPhotos(idx, { project: { name: n }, photos: [
    ph(H(40 + i * 5), hexOf(BigInt(i * 5 + 1) * 0x0f0f0f0fn), '厨房/a.jpg'), ph(H(41 + i * 5), hexOf(BigInt(i * 5 + 2) * 0xf0f0f0f0f0n), '主卧/衣柜/b.jpg'),
    ph(H(42 + i * 5), hexOf(BigInt(i * 5 + 3) * 0x1234567n), '电视墙/c.jpg'), ph(H(43 + i * 5), hexOf(BigInt(i * 5 + 4) * 0x7654321n), 'd.jpg')
  ] }, 'Ana', T0));
  const p1 = S.pidOf(P1), p2 = S.pidOf(P2);
  S.patch(idx, { source: 'human', photos: { [H(40)]: { room: 'dining' } }, projects: { [p2]: { style: 'luxe' } } }, 'Ben', T0 + 1);
  S.patch(idx, { source: 'human', photos: { [H(41)]: { status: 'unsure' } } }, 'Ben', T0 + 2);
  const auto = plain(C.autoTags(plain(idx)));
  assert.equal(auto.source, 'auto');
  assert.equal(auto.photos[H(40)], undefined, 'confirmed photo not touched');
  assert.equal(auto.photos[H(41)], undefined, 'unsure photo not touched');
  assert.deepEqual(auto.photos[H(42)], { room: 'living', cabinets: ['tvwall'] });
  assert.equal(auto.photos[H(43)], undefined, 'no sub-folder → nothing');
  assert.deepEqual(auto.photos[H(46)], { room: 'master', cabinets: ['wardrobe'] });
  assert.deepEqual(auto.projects[p1], { style: 'wood', area: 'Setia Alam' });
  assert.equal(auto.projects[p2], undefined, 'style already set by a person; 「M Vertica」 is not obviously a place → no area');
  // 客户名字绝不会出现在任何标签里
  const text = JSON.stringify(auto);
  for (const who of ['陈先生', '林太太', 'Mr Tan', 'Tan Ah Kow', '测试客户', 'Ah Kow', 'M Vertica']) assert.ok(!text.includes(who), 'auto tags leak ' + who);
  // 伺服器照样收（词表都对）；人改过的照规则不动
  const r = S.patch(idx, JSON.parse(JSON.stringify(auto)), 'Ana', T0 + 3);
  assert.ok(r.changed > 0);
  assert.equal(idx.photos[H(42)].status, 'auto');
  assert.equal(idx.photos[H(40)].room, 'dining');
  assert.equal(idx.projects[p2].style, 'luxe');
  // 再跑一次：都填好了 → 空的
  const again = plain(C.autoTags(plain(idx)));
  assert.deepEqual(again.photos, {});
  assert.deepEqual(again.projects, {});
  // 只看某几张
  const some = plain(C.autoTags(plain(S.emptyIndex()), { pids: ['p0000000000'] }));
  assert.deepEqual(some, { source: 'auto', photos: {}, projects: {} });
  // 切成每批 400 笔
  const big = { source: 'auto', photos: {}, projects: {} };
  for (let i = 0; i < 950; i++) big.photos[H(1000 + i)] = { room: 'kitchen' };
  const chunks = plain(C.chunkPatch(big));
  assert.deepEqual(chunks.map((c) => Object.keys(c.photos).length), [400, 400, 150]);
  assert.ok(chunks.every((c) => c.source === 'auto'));
});

/* ---------- 标签档 ---------- */
test('tags file: export has only tags (no f / k / url), readTags cleans it, mergeTags follows the rules', () => {
  const src = S.emptyIndex();
  const pa = S.pidOf(P1), pb = S.pidOf(P2);
  S.addPhotos(src, { project: { name: P1 }, photos: [ph(H(61), '1010101010101010', '厨房/a.jpg'), ph(H(62), '2020202020202020', '主卧/b.jpg'), ph(H(63), '3030303030303030', 'c.jpg'), ph(H(65), '5050505050505050', '电视墙/e.jpg')] }, 'Ana', T0);
  S.patch(src, { source: 'auto', photos: { [H(65)]: { room: 'living', cabinets: ['tvwall'] } } }, 'Claude', T0);
  S.addPhotos(src, { project: { name: P2 }, photos: [ph(H(64), '4040404040404040')] }, 'Ana', T0);
  S.patch(src, { source: 'human', photos: { [H(61)]: { room: 'kitchen', cabinets: ['kitchen'], style: 'wood', hero: true, desc: { zh: '原木橱柜', en: 'Oak kitchen' } },
    [H(62)]: { room: 'master', cabinets: ['wardrobe'] }, [H(64)]: { room: 'living' } }, projects: { [pa]: { area: 'Setia Alam', style: 'wood', ptype: 'semid', traits: ['kids'] } } }, 'Ana', T0 + 1);
  S.patch(src, { source: 'human', photos: { [H(63)]: { status: 'unsure', room: 'other' } } }, 'Ana', T0 + 2);
  S.setHidden(src, { photos: [H(62)] }, true, 'Ana', T0 + 3);
  const file = plain(C.exportTags(plain(src), T0 + 4, 'Ana'));
  assert.equal(file.kind, 'visi-caselib-tags');
  assert.equal(file.v, 1);
  const text = JSON.stringify(file);
  for (const leak of ['厨房/', '"f"', '"k"', 'c/' + H(61), 'url', 'data:image']) assert.ok(!text.includes(leak), 'tags file has ' + leak);
  assert.deepEqual(Object.keys(file.photos[H(61)]).sort(), ['cabinets', 'desc', 'hero', 'hidden', 'p', 'room', 'status', 'style']);
  assert.deepEqual(Object.keys(file.projects[pa]).sort(), ['area', 'hidden', 'name', 'ptype', 'style', 'traits']);
  assert.equal(file.photos[H(62)].hidden, true);
  assert.equal(file.projects[pa].name, P1);

  // 读回来：不认得的值拿掉、不是标签档就 400 kind
  const dirty = JSON.parse(JSON.stringify(file));
  dirty.photos[H(61)].room = 'garage';
  dirty.photos[H(61)].cabinets = ['kitchen', 'sofa', 'kitchen'];
  dirty.photos['nothex'] = { room: 'kitchen' };
  dirty.projects[pa].style = 'boho';
  const clean = plain(C.readTags(dirty));
  assert.equal(clean.photos[H(61)].room, '');
  assert.deepEqual(clean.photos[H(61)].cabinets, ['kitchen']);
  assert.ok(!clean.photos.nothex);
  assert.equal(clean.projects[pa].style, '');
  for (const bad of [null, {}, { kind: 'visi-project', v: 1 }, { kind: 'visi-caselib-tags', v: 2 }]) {
    assert.throws(() => C.readTags(bad), (e) => e.status === 400 && e.body.error === 'kind');
  }

  // 另一台电脑：只有 P1 的两张（一张已经人工确认过、一张自动），P2 还没汇入
  const dst = S.emptyIndex();
  S.addPhotos(dst, { project: { name: P1 }, photos: [ph(H(61), '1010101010101010', '厨房/a.jpg'), ph(H(62), '2020202020202020', '主卧/b.jpg'), ph(H(63), '3030303030303030', 'c.jpg'), ph(H(65), '5050505050505050', '电视墙/e.jpg')] }, 'Mia', T0);
  S.patch(dst, { source: 'human', photos: { [H(61)]: { room: 'dining' } } }, 'Mia', T0 + 1);            // 已确认，空间不一样
  S.patch(dst, { source: 'auto', photos: { [H(62)]: { room: 'bedroom' } }, projects: { [pa]: { style: 'cream' } } }, 'Claude', T0 + 2);
  const m = plain(C.mergeTags(plain(dst), C.readTags(file)));
  // 已确认：只补空着的（柜类、风格、说明），空间不动、状态留「已确认」
  assert.deepEqual(m.patch.photos[H(61)], { cabinets: ['kitchen'], style: 'wood', desc: { zh: '原木橱柜', en: 'Oak kitchen' }, status: 'confirmed' });
  // 还没确认：标签档的都套用；那边确认过 → 已确认，那边是不确定 → 不确定，那边也只是自动的 → 标「自动」
  assert.deepEqual(m.patch.photos[H(62)], { room: 'master', cabinets: ['wardrobe'], status: 'confirmed' });
  assert.deepEqual(m.patch.photos[H(63)], { room: 'other', status: 'unsure' });
  assert.deepEqual(m.patch.photos[H(65)], { room: 'living', cabinets: ['tvwall'], status: 'auto' });
  assert.deepEqual(m.hide, { photos: [H(62)], projects: [] });
  // 项目：上次是 Claude 自动填的 → 可以改；空的 → 填
  assert.deepEqual(m.patch.projects[pa], { area: 'Setia Alam', ptype: 'semid', traits: ['kids'], style: 'wood' });
  assert.deepEqual(Object.keys(m.pending.photos), [H(64)]);
  assert.deepEqual(Object.keys(m.pending.projects), [pb]);
  assert.deepEqual(m.n, { photos: 4, projects: 1, pending: 1, pendingProjects: 1, same: 0 });
  // 伺服器收这份 patch（人工）
  S.patch(dst, m.patch, 'Mia', T0 + 3);
  S.setHidden(dst, m.hide, true, 'Mia', T0 + 4);
  assert.equal(dst.photos[H(61)].room, 'dining', 'confirmed room kept');
  assert.equal(dst.photos[H(61)].style, 'wood');
  assert.equal(dst.photos[H(62)].status, 'confirmed');
  assert.equal(dst.photos[H(65)].status, 'auto');
  assert.ok(dst.photos[H(62)].hidden);
  assert.equal(dst.projects[pa].style, 'wood');
  // 再汇入一次：没有要改的
  const again = plain(C.mergeTags(plain(dst), C.readTags(file)));
  assert.deepEqual(again.patch, { source: 'human', photos: {}, projects: {} });
  assert.deepEqual(again.hide, { photos: [], projects: [] });
  assert.equal(again.n.photos, 0);
  assert.equal(again.n.same, 4, 'every photo here already has the same tags');
  // 人在这台电脑改过的项目栏位（by 不是 Claude）：不盖掉
  S.patch(dst, { source: 'human', projects: { [pa]: { area: 'Setia Eco Park' } } }, 'Mia', T0 + 5);
  const keep = plain(C.mergeTags(plain(dst), C.readTags(file)));
  assert.equal(keep.patch.projects[pa], undefined);
});

/* ---------- 标签档：先汇入文件夹还是先汇入标签档，结果一样（跟 caselib-sw.js 的 addPhotos 一样跑：addPhotos → afterAdd） ---------- */
const BASE = 'http://127.0.0.1:1/local-cases/';
// caselib-sw.js 的 addPhotos：一次登记 + 套用等着的标签档 + 文件夹名自动标（同一个交易）
//（跟 service worker 一样：只读这个项目、这批照片的 pending，用掉的删掉）
function swAdd(index, name, photos, pending, by, ts) {
  pending = pending || {};
  const pid = C.pidOf(name), mine = {};
  ['p:' + pid].concat(photos.map((x) => 'h:' + x.h)).forEach((k) => { if (pending[k]) mine[k] = pending[k]; });
  const r = C.run(index, (idx, t) => C.addPhotos(idx, { project: { name }, photos: JSON.parse(JSON.stringify(photos)) }, by, t), { op: 'addPhotos', by, base: BASE, now: () => ts });
  const aa = r.write ? plain(C.afterAdd(index, { pids: [r.out.pid], added: r.out.added, pending: mine, by, base: BASE, now: () => ts + 1 })) : { used: [], dropped: 0 };
  aa.used.forEach((k) => { delete pending[k]; });
  return { pid: r.out.pid, aa };
}
// caselib-sw.js 的 importTags：这台电脑有的马上套用，还没有的记成 pending
function swImport(index, file, by, ts) {
  const m = C.mergeTags(index, C.readTags(JSON.parse(JSON.stringify(file))));
  C.applyMerge(index, m, by, { base: BASE, now: () => ts });
  const pending = {};
  Object.keys(m.pending.photos).forEach((h) => { pending['h:' + h] = { tag: m.pending.photos[h], by, ts }; });
  Object.keys(m.pending.projects).forEach((pid) => { pending['p:' + pid] = { tag: m.pending.projects[pid], by, ts }; });
  return { m: plain(m), pending };
}
const tagView = (idx) => plain({
  projects: Object.fromEntries(Object.keys(idx.projects).sort().map((p) => { const x = idx.projects[p]; return [p, [x.area, x.style, x.ptype, x.traits, !!x.hidden]]; })),
  photos: Object.fromEntries(Object.keys(idx.photos).sort().map((h) => { const x = idx.photos[h]; return [h, [x.room, x.cabinets, x.style, x.hero, x.desc, x.status, !!x.hidden]]; }))
});

test('tags file: folder first or tags first gives the same tags — a corrected auto style / area and cleared auto cabinets come through', () => {
  const NAME = 'Kepong 简约 陈先生', NAME2 = 'Setia Alam 原木 测试客户';
  const photos = [ph(H(71), '1111000011110000', '主卧/衣柜/a.jpg'), ph(H(72), '0000111100001111', '厨房/b.jpg'), ph(H(73), '1010101001010101', '电视墙/c.jpg'), ph(H(74), '0101010110101010', 'd.jpg')];
  const photos2 = [ph(H(75), '1100110011001100', '厨房/e.jpg'), ph(H(76), '0011001100110011', 'f.jpg')];
  // A：先登记（自动标：简约 → modern、Kepong；主卧/衣柜 → master + wardrobe…），再人工改
  const A = C.emptyIndex();
  const { pid } = swAdd(A, NAME, photos, {}, 'Ana', T0);
  const { pid: pid2 } = swAdd(A, NAME2, photos2, {}, 'Ana', T0 + 10);
  assert.deepEqual(plain([A.projects[pid].style, A.projects[pid].area, A.projects[pid].by]), ['modern', 'Kepong', C.AUTO_BY], 'folder-name tags are written as automatic');
  assert.deepEqual(plain([A.photos[H(71)].room, A.photos[H(71)].cabinets, A.photos[H(71)].status, A.photos[H(71)].by]), ['master', ['wardrobe'], 'auto', C.AUTO_BY]);
  C.patch(A, { source: 'human', projects: { [pid]: { style: 'japandi' }, [pid2]: { area: 'Shah Alam', style: 'nordic' } },
    photos: { [H(71)]: { cabinets: [] }, [H(72)]: { room: '', cabinets: [], status: 'unsure' }, [H(73)]: { hero: true }, [H(75)]: { desc: { zh: '原木橱柜' } } } }, 'Ana', T0 + 20);
  C.setHidden(A, { photos: [H(74)] }, true, 'Ana', T0 + 21);
  const file = plain(C.exportTags(A, T0 + 30, 'Ana'));

  // B：先汇入文件夹（自动标）、再汇入标签档
  const B = C.emptyIndex();
  swAdd(B, NAME, photos, {}, 'Ben', T0 + 40);
  swAdd(B, NAME2, photos2, {}, 'Ben', T0 + 41);
  const ib = swImport(B, file, 'Ben', T0 + 50);
  assert.deepEqual(ib.m.n, { photos: 5, projects: 2, pending: 0, pendingProjects: 0, same: 1 });
  // Cc：先汇入标签档（一张都还没有）、再汇入文件夹
  const Cc = C.emptyIndex();
  const ic = swImport(Cc, file, 'Mia', T0 + 40);
  assert.equal(Object.keys(ic.pending).length, 6 + 2);
  const r1 = swAdd(Cc, NAME, photos, ic.pending, 'Mia', T0 + 50);
  const r2 = swAdd(Cc, NAME2, photos2, ic.pending, 'Mia', T0 + 51);
  assert.equal(r1.aa.used.length + r2.aa.used.length, 8, 'every pending tag is used once its photo / project is here');
  assert.equal(r1.aa.dropped + r2.aa.dropped, 0);
  assert.deepEqual(Object.keys(ic.pending), [], 'nothing left waiting');

  const want = tagView(A);
  assert.deepEqual(tagView(B), want, 'folder first, then tags = the same as computer A');
  assert.deepEqual(tagView(Cc), want, 'tags first, then folder = the same as computer A');
  assert.deepEqual(want.projects[pid].slice(0, 2), ['Kepong', 'japandi']);
  assert.deepEqual(want.projects[pid2].slice(0, 2), ['Shah Alam', 'nordic']);
  assert.deepEqual(want.photos[H(71)].slice(0, 2).concat(want.photos[H(71)][5]), ['master', [], 'confirmed'], 'cleared cabinets stay cleared');
  assert.deepEqual(want.photos[H(72)].slice(0, 2).concat(want.photos[H(72)][5]), ['', [], 'unsure']);
  // 一张没人看过的（还是自动）：不会因为汇入就变成「已确认」
  const C2 = C.emptyIndex();
  swAdd(C2, NAME, photos, {}, 'Zoe', T0);
  C.patch(C2, { source: 'human', photos: { [H(71)]: { room: 'walkin' } } }, 'Zoe', T0 + 1);   // 这台电脑已确认：不盖掉
  const autoOnly = plain(C.exportTags(C2, T0 + 2, 'Zoe'));
  const D = C.emptyIndex();
  swAdd(D, NAME, photos, {}, 'Dee', T0);
  const md = plain(C.mergeTags(D, C.readTags(autoOnly)));
  assert.equal(md.patch.photos[H(72)], undefined, 'auto tags vs the same auto tags: nothing to change, status stays auto');
  assert.deepEqual(md.patch.photos[H(71)], { room: 'walkin', status: 'confirmed' });
  assert.equal(md.n.same, 3);
  // 这台电脑有人改过的项目栏位（不是自动猜的那个值）：标签档不盖掉
  C.patch(D, { source: 'human', projects: { [pid]: { style: 'luxe' } } }, 'Dee', T0 + 5);
  assert.equal(plain(C.mergeTags(D, C.readTags(file))).patch.projects[pid], undefined);
  // 自动猜的值、但最后改的人不是 Claude（例：在这台电脑改了家庭特点）：风格还是可以被标签档盖掉
  const E = C.emptyIndex();
  swAdd(E, NAME, photos, {}, 'Eve', T0);
  C.patch(E, { source: 'human', projects: { [pid]: { traits: ['kids'] } } }, 'Eve', T0 + 5);
  assert.deepEqual(plain(C.mergeTags(E, C.readTags(file))).patch.projects[pid], { style: 'japandi' });
  // 伺服器照样收 afterAdd 写进去的东西：本机的清单拿去伺服器的 patch 规则再跑一次，结果一样
  const S1 = S.emptyIndex();
  S.addPhotos(S1, { project: { name: NAME }, photos: JSON.parse(JSON.stringify(photos)) }, 'Ana', T0);
  const auto = plain(C.autoTags(plain(S1), { pids: [pid] }));
  S.patch(S1, auto, C.AUTO_BY, T0 + 1);
  const L1 = C.emptyIndex();
  C.addPhotos(L1, { project: { name: NAME }, photos: JSON.parse(JSON.stringify(photos)) }, 'Ana', T0);
  C.patch(L1, auto, C.AUTO_BY, T0 + 1);
  assert.deepEqual(plain(L1), plain(S1));
});

test('pending tags: a vocab key removed between 汇入标签档 and the folder import does not block the registration', () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(VOCAB_SRC, ctx);
  vm.runInContext(CORE_SRC, ctx);
  const K = ctx.window.MB.clCore, MBX = ctx.window.MB;
  const NAME = 'Puchong 北欧 Mdm Lee';
  const photos = [ph(H(81), '1111000011110000', '厨房/a.jpg'), ph(H(82), '0000111100001111', 'b.jpg')];
  const pid = K.pidOf(NAME);
  const file = { kind: 'visi-caselib-tags', v: 1, projects: { [pid]: { name: NAME, area: 'Puchong', style: 'luxe', traits: ['kids'] } },
    photos: { [H(81)]: { p: pid, room: 'kitchen', cabinets: ['kitchen', 'island'], style: 'luxe', status: 'confirmed', desc: { zh: '轻奢厨房' } },
      [H(82)]: { p: pid, room: 'living', cabinets: [], style: '', status: 'confirmed' } } };
  const idx = K.emptyIndex();
  const m = K.mergeTags(idx, K.readTags(JSON.parse(JSON.stringify(file))));
  const pending = {};
  Object.keys(m.pending.photos).forEach((h) => { pending['h:' + h] = { tag: m.pending.photos[h] }; });
  Object.keys(m.pending.projects).forEach((p) => { pending['p:' + p] = { tag: m.pending.projects[p] }; });
  assert.equal(pending['h:' + H(81)].tag.style, 'luxe');
  // 几个礼拜后词表改了：拿掉「轻奢」、「中岛」
  MBX.CASE_STYLES = MBX.CASE_STYLES.filter((x) => x.key !== 'luxe');
  MBX.CASE_CABINETS = MBX.CASE_CABINETS.filter((x) => x.key !== 'island');
  pending['h:' + H(82)] = { tag: 'garbage' };          // 坏掉的一笔：丢掉，不要卡住
  const r = K.run(idx, (x, t) => K.addPhotos(x, { project: { name: NAME }, photos: JSON.parse(JSON.stringify(photos)) }, 'Ana', t), { op: 'addPhotos', by: 'Ana', now: () => T0 });
  assert.equal(r.write, true);
  const aa = plain(K.afterAdd(idx, { pids: [pid], added: r.out.added, pending, by: 'Ana', now: () => T0 + 1 }));
  assert.deepEqual(aa.used.sort(), ['h:' + H(81), 'h:' + H(82), 'p:' + pid].sort(), 'used (or dropped) pending tags are all removed');
  assert.equal(aa.dropped, 1);
  const ph81 = plain(idx.photos[H(81)]);
  assert.deepEqual([ph81.room, ph81.cabinets, ph81.style, ph81.status, ph81.desc.zh], ['kitchen', ['kitchen'], '', 'confirmed', '轻奢厨房'], 'the rest of the tag is applied');
  assert.deepEqual(plain([idx.projects[pid].area, idx.projects[pid].traits, idx.projects[pid].style]), ['Puchong', ['kids'], 'nordic'], 'project: removed style → the folder-name guess fills it');
  // 坏掉的那张：照样登记了，从文件夹名自动标（b.jpg 没有子文件夹 → 还是新的）
  assert.equal(idx.photos[H(82)].status, 'new');
});

/* ---------- 语法：service worker 和浏览器档都是 ES5 ---------- */
test('local-core.js, caselib-sw.js and local-sw.js are plain ES5 (no modules, arrows, let/const, class, template strings)', () => {
  for (const [name, src] of [['local-core.js', CORE_SRC], ['caselib-sw.js', SW_SRC], ['local-sw.js', PAGE_SRC]]) {
    new vm.Script(src, { filename: name });
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"])\/\/[^\n]*/g, '$1');
    assert.ok(!/=>/.test(code), name + ': no arrow functions');
    assert.ok(!/\b(let|const|class)\s/.test(code), name + ': no let/const/class');
    assert.ok(!/`/.test(code), name + ': no template strings');
    assert.ok(!/^\s*(import|export)\b/m.test(code), name + ': no ES modules');
    assert.ok(!/\basync\s+function|\bawait\s/.test(code), name + ': no async/await');
  }
  // service worker 只碰这几个路径；/api/* 只在本机模式回答
  assert.match(SW_SRC, /var API = \{ '\/api\/session': 1, '\/api\/photo': 1, '\/api\/catalog': 1 \};/);
  assert.match(SW_SRC, /if \(MODE === 'cloud'\) return;/);
  // 页面说了自己是哪个模式就照它的（云端的分页被接手了也照样问伺服器）；ETag 跟伺服器的分得开
  assert.match(SW_SRC, /if \(want === 'cloud'\) return;/);
  assert.match(SW_SRC, /'"local-rev-'/);
  // 登记之后套用标签档、自动标：用 local-core 的 afterAdd（这里的单元测试测的就是它）
  assert.match(SW_SRC, /C\.afterAdd\(index, /);
  assert.match(SW_SRC, /self\.skipWaiting\(\)/);
  assert.match(SW_SRC, /self\.clients\.claim\(\)/);
  // 页面只用 /caselib、/visi 两个范围注册（给客户看的邀请页不会被管）
  assert.match(PAGE_SRC, /var SCOPES = \['\/caselib', '\/visi'\];/);
  for (const page of ['index.html', 'brief.html', 'create.html']) {
    const html = readFileSync(join(INVITE, page), 'utf8');
    assert.ok(!/local-sw\.js|caselib-sw\.js|serviceWorker/.test(html), page + ' must not register the case-library service worker');
  }
  for (const page of ['caselib.html', 'visi.html']) assert.match(readFileSync(join(INVITE, page), 'utf8'), /assets\/js\/caselib\/local-sw\.js/, page);
  // vercel.json：service worker 不能被快取住（改版才会马上生效）
  const vj = JSON.parse(readFileSync(join(INVITE, 'vercel.json'), 'utf8'));
  const h = vj.headers.find((x) => x.source === '/caselib-sw.js');
  assert.ok(h && h.headers.some((x) => x.key === 'Cache-Control' && x.value === 'no-cache'));
});
