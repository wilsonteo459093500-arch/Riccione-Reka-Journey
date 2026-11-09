// 同步模型（src/components/quote/sync.js）：本机 ↔ 云端合并、待同步 / 待删除队列、共用设备、两个标签页、容量、分页读取。
// 对应最终审查的 findings 1/6（本机模式 → 云端）、5（旧离线改动盖掉同事新版）、9（重连后先拉再推）、
// 2/10（离线删除重试 + tombstone）、3/12（共用设备不替别人上传 / 退出清本机）、11（两个标签页）、8（容量）、4（1000 行上限）。
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import {
  STORE_KEY, PENDING_KEY, PENDING_DEL_KEY, DELETED_KEY, CLOUD_INIT_KEY, DEVICE_KEYS,
  bootDevice, mergePull, applyRealtime, mergeTabs, canUpload, cleanRecord, cleanStore, addDeleted, pruneDeleted,
  persistStore, _resetFitHint, clearDevice, selectAll, dropIds,
} from '../src/components/quote/sync.js';

const A = 'user-A';
const B = 'user-B';
const rec = (id, name, updatedAt, extra = {}) => ({
  id, app: 'kira', schema: 1, groupId: id, meta: { name, phone: '', location: 'KL', ref: '', pic: '', version: '1', outputLang: 'en', date: '2026-11-01' },
  zones: [], looseItems: [], createdAt: updatedAt, updatedAt, ...extra,
});
const names = (store) => store.records.map((r) => r.meta.name).sort();

// 假的 localStorage（可设容量，写超了就像浏览器一样抛 QuotaExceededError）
function fakeStorage(quotaChars = Infinity) {
  const m = new Map();
  const used = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      v = String(v);
      const next = used() - (m.has(k) ? k.length + m.get(k).length : 0) + k.length + v.length;
      if (next > quotaChars) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, v);
    },
    removeItem: (k) => m.delete(k),
  };
}

// ---------- findings 1 / 6：本机模式 → 云端，第一次拉云端不能冲掉本机模式做的报价 ----------
test('F1/F6 first cloud-mode boot queues local-mode quotes (no owner) for upload, once per device', () => {
  const ls = fakeStorage();
  ls.setItem(STORE_KEY, JSON.stringify({ records: [rec('rec_l1', 'Mdm Tan kitchen', 1), rec('rec_l2', 'Mr Lim wardrobe', 2)], activeId: 'rec_l1' }));
  const boot = bootDevice(ls, { cloud: true });
  assert.deepEqual([...boot.pending].sort(), ['rec_l1', 'rec_l2']);
  assert.deepEqual(JSON.parse(ls.getItem(PENDING_KEY)).sort(), ['rec_l1', 'rec_l2']);
  assert.ok(ls.getItem(CLOUD_INIT_KEY));
  // 第一次拉云端：云端是空表 / 或只有同事的一行 → 本机两份都留着、都要上传，上传的人（A）就是主人
  for (const cloud of [[], [{ ...rec('rec_team', 'Team customer', 5), ownerId: B }]]) {
    const m = mergePull({ local: boot.store, cloud, pending: boot.pending, userId: A });
    assert.deepEqual(names(m.store), [...(cloud.length ? ['Team customer'] : []), 'Mdm Tan kitchen', 'Mr Lim wardrobe'].sort());
    assert.deepEqual(m.push.map((r) => r.id).sort(), ['rec_l1', 'rec_l2']);
    assert.ok(m.push.every((r) => canUpload(r, A, m.cloudIds)));
    assert.equal(m.dropped.length, 0);
  }
  // 只做一次：之后再开（例如上传后），不再把没有主人的记录重新排队
  ls.setItem(PENDING_KEY, '[]');
  assert.equal(bootDevice(ls, { cloud: true }).pending.size, 0);
  // 本机模式本身不排队
  const ls2 = fakeStorage();
  ls2.setItem(STORE_KEY, JSON.stringify({ records: [rec('rec_x', 'x', 1)], activeId: null }));
  assert.equal(bootDevice(ls2, { cloud: false }).pending.size, 0);
  assert.equal(ls2.getItem(CLOUD_INIT_KEY), null);
});

test('F1/F6 a device that was already in cloud mode does not re-upload its cloud mirror', () => {
  const ls = fakeStorage();
  const mirror = [{ ...rec('rec_c1', 'Cloud 1', 10), ownerId: B }, { ...rec('rec_c2', 'Cloud 2', 11), ownerId: A }];
  ls.setItem(STORE_KEY, JSON.stringify({ records: mirror, activeId: null }));
  const boot = bootDevice(ls, { cloud: true });
  assert.equal(boot.pending.size, 0); // 都有主人 = 从云端来的
  const m = mergePull({ local: boot.store, cloud: mirror, pending: boot.pending, userId: A });
  assert.equal(m.push.length, 0);
  assert.deepEqual(names(m.store), ['Cloud 1', 'Cloud 2']);
});

// ---------- finding 5：旧的离线改动不能盖掉同事较新的版本 ----------
test('F5 pending local edit OLDER than the cloud row: keep cloud, drop from pending, push nothing', () => {
  const t0 = 1_000_000;
  const local = { records: [{ ...rec('rec_R', 'Ali offline edit 10:00', t0), ownerId: B }], activeId: 'rec_R' };
  const cloud = [{ ...rec('rec_R', 'Bee newer edit 10:05', t0 + 300000), ownerId: B }];
  const m = mergePull({ local, cloud, pending: new Set(['rec_R']), userId: A });
  assert.deepEqual(names(m.store), ['Bee newer edit 10:05']);
  assert.deepEqual(m.push, []);
  assert.deepEqual(m.settle, ['rec_R']);
  assert.equal(m.store.activeId, 'rec_R');
  // 同一个时间（自己上次已经推上去了，只是没收到回应）也以云端为准、不再推
  const same = mergePull({ local, cloud: [{ ...local.records[0] }], pending: new Set(['rec_R']), userId: A });
  assert.deepEqual(same.push, []);
  assert.deepEqual(same.settle, ['rec_R']);
});

test('F5 pending local edit NEWER than the cloud row: keep local (with the cloud owner) and push only that', () => {
  const local = { records: [{ ...rec('rec_R', 'Ali newer', 200) }, { ...rec('rec_S', 'S local stale copy', 100), ownerId: B }], activeId: null };
  const cloud = [{ ...rec('rec_R', 'Bee older', 100), ownerId: B }, { ...rec('rec_S', 'S cloud', 150), ownerId: B }];
  const m = mergePull({ local, cloud, pending: new Set(['rec_R']), userId: A });
  assert.deepEqual(m.push.map((r) => r.meta.name), ['Ali newer']);
  assert.equal(m.push[0].ownerId, B); // 主人仍是做的人（数据库也锁住 owner_id）
  assert.deepEqual(names(m.store), ['Ali newer', 'S cloud']); // 不待同步的一律以云端为准
  assert.ok(canUpload(m.push[0], A, m.cloudIds)); // 云端已有 → 只是更新，同事可以改
});

test('F5 realtime echo: an older cloud row never replaces a newer pending local edit; equal/newer cloud settles it', () => {
  const store = { records: [rec('rec_R', 'mine 200', 200)], activeId: 'rec_R' };
  const pending = new Set(['rec_R']);
  const older = applyRealtime(store, { type: 'upsert', record: { ...rec('rec_R', 'echo 100', 100), ownerId: A } }, { pending });
  assert.equal(older.store.records[0].meta.name, 'mine 200');
  assert.equal(older.store.records[0].ownerId, A); // 只补上主人
  assert.deepEqual(older.settle, []);
  const newer = applyRealtime(store, { type: 'upsert', record: rec('rec_R', 'teammate 300', 300) }, { pending });
  assert.equal(newer.store.records[0].meta.name, 'teammate 300');
  assert.deepEqual(newer.settle, ['rec_R']);
});

// ---------- finding 9：重连 / 回到前台先拉再推：同事断线期间的改动不会被旧副本盖掉 ----------
test('F9 re-pull after reconnect brings in the teammate change before the next edit is pushed', () => {
  const R = { ...rec('rec_R', 'Mr Tan', 100), ownerId: B };
  const device = { records: [R], activeId: 'rec_R' };
  const cloudNow = [{ ...R, meta: { ...R.meta, phone: '012-999 8888' }, updatedAt: 500 }]; // 断线时同事改了电话
  const m = mergePull({ local: device, cloud: cloudNow, pending: new Set(), userId: A });
  assert.equal(m.store.records[0].meta.phone, '012-999 8888');
  assert.deepEqual(m.push, []);
  // 拉完之后再改地点 → 推上去的那份带着同事的电话
  const edited = { ...m.store.records[0], meta: { ...m.store.records[0].meta, location: 'Petaling Jaya' }, updatedAt: 600 };
  const m2 = mergePull({ local: { records: [edited], activeId: 'rec_R' }, cloud: cloudNow, pending: new Set(['rec_R']), userId: A });
  assert.deepEqual(m2.push.map((r) => [r.meta.location, r.meta.phone]), [['Petaling Jaya', '012-999 8888']]);
});

// ---------- findings 2 / 10：离线删除 → tombstone，拉云端 / 实时都不带回来，有网重试 ----------
test('F2/F10 tombstoned ids are filtered out of pulls and realtime, retried while still in the cloud, cleared once gone', () => {
  const local = { records: [rec('rec_A', 'A', 5)], activeId: 'rec_A' };
  const cloud = [rec('rec_A', 'A', 5), { ...rec('rec_X', 'Customer to delete', 3), ownerId: A }];
  const pendingDel = new Set(['rec_X']);
  const m = mergePull({ local, cloud, pending: new Set(), pendingDel, userId: A });
  assert.deepEqual(names(m.store), ['A']); // 不复活
  assert.deepEqual(m.retryDel, ['rec_X']); // 还在云端 → flush 再删
  assert.deepEqual(m.confirmDel, []);
  const rt = applyRealtime(m.store, { type: 'upsert', record: cloud[1] }, { pendingDel });
  assert.deepEqual(names(rt.store), ['A']);
  // 云端终于删掉了 → tombstone 清掉
  const m2 = mergePull({ local: m.store, cloud: [cloud[0]], pending: new Set(), pendingDel, userId: A });
  assert.deepEqual(m2.confirmDel, ['rec_X']);
  // 实时删除也会把本机待同步的那条一并清掉（删除赢）
  const del = applyRealtime({ records: [rec('rec_P', 'P', 1)], activeId: 'rec_P' }, { type: 'delete', id: 'rec_P' }, { pending: new Set(['rec_P']) });
  assert.deepEqual(del.store.records, []);
  assert.deepEqual(del.settle, ['rec_P']);
  assert.equal(del.store.activeId, null);
});

test('F2 without a tombstone a remotely-deleted, non-pending row disappears from this device too', () => {
  const local = { records: [rec('rec_A', 'A', 5), { ...rec('rec_gone', 'Deleted by owner', 3), ownerId: B }], activeId: 'rec_gone' };
  const m = mergePull({ local, cloud: [rec('rec_A', 'A', 5)], pending: new Set(), userId: A });
  assert.deepEqual(names(m.store), ['A']);
  assert.deepEqual(m.dropped, ['rec_gone']);
  assert.equal(m.store.activeId, 'rec_A');
});

// ---------- findings 3 / 12：共用设备，不替别人上传；退出清掉本机 ----------
test('F3/F12 a previous user\'s never-uploaded quote is NOT uploaded as the next user (would take ownership)', () => {
  const RA = { ...rec('rec_A1', 'A unsynced quote', 50), ownerId: A };
  const m = mergePull({ local: { records: [RA], activeId: 'rec_A1' }, cloud: [], pending: new Set(['rec_A1']), userId: B });
  assert.deepEqual(m.push, []); // B 登录：不上传
  assert.deepEqual(names(m.store), ['A unsynced quote']); // 也不丢（等 A 自己登录）
  assert.equal(canUpload(RA, B, new Set()), false);
  assert.equal(canUpload(RA, A, new Set()), true);
  assert.equal(canUpload(RA, B, new Set(['rec_A1'])), true); // 云端已有 → 只是更新（主人不变）
  assert.equal(canUpload({ id: 'x' }, B, new Set()), true); // 本机模式做的（没有主人）→ 上传的人就是主人
  assert.equal(canUpload(RA, null, new Set()), false);
});

test('F3/F12 sign-out clears every KIRA device key (records, pending, tombstones, delete log) and nothing else', () => {
  const ls = fakeStorage();
  for (const k of DEVICE_KEYS) ls.setItem(k, '1');
  ls.setItem('sail.quote.records.v2', 'old tool data');
  ls.setItem('kira.onboarded.v1', '1');
  clearDevice(ls);
  for (const k of DEVICE_KEYS) assert.equal(ls.getItem(k), null, k);
  assert.equal(ls.getItem('sail.quote.records.v2'), 'old tool data');
  assert.equal(ls.getItem('kira.onboarded.v1'), '1');
  assert.deepEqual(DEVICE_KEYS.sort(), [DELETED_KEY, PENDING_DEL_KEY, PENDING_KEY, STORE_KEY].sort());
});

// ---------- finding 11：两个标签页（tab）互相合并，不互相盖掉 ----------
test('F11 two tabs: storage-event merge keeps both tabs\' quotes, newer edit wins, deletes stay deleted, no ping-pong', () => {
  const ls = fakeStorage();
  // 模拟两个标签页：各自内存 + 写同一个 localStorage；对方写了就收到 storage 事件 → mergeTabs
  const tabs = { a: { store: { records: [], activeId: null } }, b: { store: { records: [], activeId: null } } };
  const deleted = {};
  let writes = 0;
  const write = (me) => {
    ls.setItem(STORE_KEY, JSON.stringify(tabs[me].store)); writes += 1;
    const other = me === 'a' ? 'b' : 'a';
    const merged = mergeTabs(tabs[other].store, JSON.parse(ls.getItem(STORE_KEY)), deleted);
    if (merged !== tabs[other].store) { tabs[other].store = merged; write(other); } // 变了才写回（不会来回写个没完）
  };
  tabs.a.store = { records: [rec('rec_tan', 'Mr Tan (tab A)', 10)], activeId: 'rec_tan' }; write('a');
  tabs.b.store = { records: [rec('rec_lim', 'Mdm Lim (tab B)', 20), ...tabs.b.store.records], activeId: 'rec_lim' }; write('b');
  assert.deepEqual(names(JSON.parse(ls.getItem(STORE_KEY))), ['Mdm Lim (tab B)', 'Mr Tan (tab A)']);
  assert.deepEqual(names(tabs.a.store), ['Mdm Lim (tab B)', 'Mr Tan (tab A)']);
  assert.equal(tabs.a.store.activeId, 'rec_tan'); // 每个标签页保留自己正在看的
  assert.ok(writes <= 4, `writes ${writes}`);
  // A 改 Mr Tan（较新）→ B 拿到较新的
  tabs.a.store = { ...tabs.a.store, records: tabs.a.store.records.map((r) => (r.id === 'rec_tan' ? { ...r, meta: { ...r.meta, phone: '012' }, updatedAt: 30 } : r)) }; write('a');
  assert.equal(tabs.b.store.records.find((r) => r.id === 'rec_tan').meta.phone, '012');
  // A 删 Mdm Lim → 记进删除记录 → B 不会把它带回来
  Object.assign(deleted, addDeleted({}, ['rec_lim']));
  tabs.a.store = dropIds(tabs.a.store, ['rec_lim']); write('a');
  tabs.b.store = dropIds(tabs.b.store, Object.keys(deleted)); // B 收到删除记录
  tabs.b.store = { ...tabs.b.store, records: [rec('rec_new', 'New in B', 40), ...tabs.b.store.records] }; write('b');
  assert.deepEqual(names(JSON.parse(ls.getItem(STORE_KEY))), ['Mr Tan (tab A)', 'New in B']);
  assert.deepEqual(names(tabs.a.store), ['Mr Tan (tab A)', 'New in B']);
  // 没变化 → 回原对象
  assert.equal(mergeTabs(tabs.a.store, JSON.parse(ls.getItem(STORE_KEY)), deleted), tabs.a.store);
});

test('F11 delete log is pruned (30 days / 500 ids)', () => {
  const now = Date.UTC(2026, 10, 9);
  let log = addDeleted({ old: now - 31 * 864e5 }, ['x'], now);
  assert.deepEqual(Object.keys(log), ['x']);
  log = addDeleted({}, Array.from({ length: 600 }, (_, i) => `id${i}`), now);
  assert.equal(Object.keys(pruneDeleted(log, now)).length, 500);
});

// ---------- finding 8：本机容量满了不再默默失败；待同步的优先保住 ----------
test('F8 storage quota: full mirror does not fit → keep pending + active + newest, report "trimmed"', () => {
  _resetFitHint();
  const big = (id, t) => ({ ...rec(id, id, t), notes: 'x'.repeat(1000) });
  const records = Array.from({ length: 50 }, (_, i) => big(`rec_${i}`, 1000 + i));
  const offline = big('rec_offline', 1); // 离线做的，最旧也要保住
  const store = { records: [...records, offline], activeId: 'rec_3' };
  const ls = fakeStorage(20000); // ~ 18 份
  const res = persistStore(ls, store, new Set(['rec_offline']));
  assert.equal(res.status, 'trimmed');
  assert.ok(res.kept > 5 && res.kept < 51, `kept ${res.kept}`);
  const saved = JSON.parse(ls.getItem(STORE_KEY));
  const ids = saved.records.map((r) => r.id);
  assert.equal(saved.records.length, res.kept);
  assert.ok(ids.includes('rec_offline') && ids.includes('rec_3'));
  assert.ok(ids.includes('rec_49') && !ids.includes('rec_0')); // 最近更新的优先
  // 再写一次（例如打字）：用上次的条数，结果一样
  assert.deepEqual(persistStore(ls, store, new Set(['rec_offline'])), res);
  // 写得下 → ok
  assert.equal(persistStore(fakeStorage(), store).status, 'ok');
  // 连待同步的都放不下 → failed（上一份留着）
  const tiny = fakeStorage(500);
  tiny.setItem(STORE_KEY, '{"records":[],"activeId":null}');
  _resetFitHint();
  assert.equal(persistStore(tiny, store, new Set(['rec_offline'])).status, 'failed');
  assert.equal(tiny.getItem(STORE_KEY), '{"records":[],"activeId":null}');
  assert.equal(persistStore(null, store).status, 'failed');
});

// ---------- finding 4：分页读完整张表（Supabase 默认一次最多 1000 行）----------
function fakeTable(rows, { maxRows = 1000, withCount = false, failAt = -1 } = {}) {
  const calls = [];
  return {
    calls,
    makeQuery: () => ({
      range(from, to) {
        calls.push([from, to]);
        if (calls.length - 1 === failAt) return Promise.resolve({ data: null, error: new Error('boom'), count: null });
        const data = rows.slice(from, Math.min(to + 1, from + maxRows));
        return Promise.resolve({ data, error: null, count: withCount ? rows.length : null });
      },
    }),
  };
}
test('F4 selectAll pages with .range() past the 1000-row cap until a short page', async () => {
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
  const t = fakeTable(rows);
  const got = await selectAll(t.makeQuery);
  assert.equal(got.length, 2500);
  assert.deepEqual(t.calls, [[0, 999], [1000, 1999], [2000, 2999]]);
  const exact = fakeTable(rows.slice(0, 2000)); // 刚好整页 → 多读一页空的就停
  assert.equal((await selectAll(exact.makeQuery)).length, 2000);
  assert.equal(exact.calls.length, 3);
});
test('F4 selectAll uses count when the server caps pages below the page size, and surfaces errors', async () => {
  const rows = Array.from({ length: 1234 }, (_, i) => ({ id: i }));
  const capped = fakeTable(rows, { maxRows: 500, withCount: true });
  assert.equal((await selectAll(capped.makeQuery)).length, 1234);
  assert.deepEqual(capped.calls.map((c) => c[0]), [0, 500, 1000]);
  await assert.rejects(selectAll(fakeTable(rows, { failAt: 1 }).makeQuery), /boom/);
});

// ---------- 坏资料保护（ErrorBoundary 之外的第一道）----------
test('malformed rows are dropped or repaired so the list never crashes on meta.name', () => {
  assert.equal(cleanRecord(null), null);
  assert.equal(cleanRecord({ meta: { name: 'no id' } }), null);
  assert.equal(cleanRecord('rec_1'), null);
  const r = cleanRecord({ id: 'rec_bad', meta: null, zones: 'x', looseItems: {}, updatedAt: '12' });
  assert.deepEqual(r.meta, {});
  assert.deepEqual(r.zones, []);
  assert.deepEqual(r.looseItems, []);
  assert.equal(r.groupId, 'rec_bad');
  assert.equal(r.updatedAt, 12);
  const n = cleanRecord({ id: 'rec_obj', groupId: 'g', meta: { name: { evil: 1 }, version: 3, location: null }, zones: [null, { id: 'z' }] });
  assert.equal(n.meta.name, '');
  assert.equal(n.meta.version, '3');
  assert.equal(n.meta.location, '');
  assert.deepEqual(n.zones, [{ id: 'z' }]);
  const good = rec('rec_ok', 'ok', 1);
  assert.equal(cleanRecord(good), good); // 好资料原样（同一个对象）
  const s = cleanStore({ records: [null, good, { id: 'rec_ok', meta: {}, updatedAt: 0 }, 7], activeId: 'missing' });
  assert.deepEqual(s.records.map((x) => x.id), ['rec_ok']);
  assert.equal(s.records[0], good); // 同 id 留较新的
  assert.equal(s.activeId, null);
  const m = mergePull({ local: { records: [], activeId: null }, cloud: [null, { meta: { name: 'x' } }, { id: 'rec_c', meta: 5 }], pending: new Set(), userId: A });
  assert.deepEqual(m.store.records.map((x) => [x.id, x.meta]), [['rec_c', {}]]);
});
