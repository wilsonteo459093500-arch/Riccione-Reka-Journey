import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeSession, newShot, personFromShot, withShotEdits, applyCardRead, summarize, dueItems, backoffMs, readFailure,
  abToBase64, makeQueue, memoryBackend, syncOnce, PLACEHOLDER, UNREAD_NOTE, GRACE_MS, KEEP_DONE_MS,
} from '../src/lib/burst.js';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const img = (n = 1) => ({ data: new Uint8Array([n, 2, 3]).buffer, type: 'image/jpeg', width: 1600, height: 1000 });
const CARD = { name: 'Tan Ah Kow', name_alt: '陈亚九', title: 'Director', company: 'ABC Sdn Bhd', company_alt: '', phones: [{ label: 'mobile', number: '012-345 6789' }], emails: ['tan@abc.my'], website: 'abc.my', address: 'KL', socials: [], industry_guess: '建筑', card_notes: '', is_business_card: true };

/** 假的资料库 + AI：跟真的一样「同一个 id 再写一次 = 盖掉同一列」 */
function fakeDeps(over = {}) {
  const db = { people: new Map(), photos: new Map(), photo_people: new Map(), interactions: new Map(), attendance: new Map(), events: new Map(), companies: new Map() };
  const uploads = new Map();
  const calls = { scan: 0, usage: 0 };
  const deps = {
    db, uploads, calls,
    loaded: true,
    ownerId: async () => 'u1',
    put: async (table, row) => {
      const id = row.id || `gen-${db[table].size + 1}`;
      const next = { ...(db[table].get(id) || {}), ...row, id };
      db[table].set(id, next);
      return next;
    },
    uploadImage: async (path, blob) => { uploads.set(path, blob); },
    hasEvent: (id) => db.events.has(id),
    getPerson(id) { return this.loaded ? db.people.get(id) || null : undefined; },
    scanCard: async () => { calls.scan += 1; return { card: CARD, usage: { cost_usd: 0.002 } }; },
    logUsage: () => { calls.usage += 1; },
    ensureCompany: async (name) => deps.put('companies', { id: `c-${name}`, name }),
    toBlob: (i) => i,
    ...over,
  };
  deps.getPerson = deps.getPerson.bind(deps);
  return deps;
}

function shots(n, session, captured = NOW - 60 * 60 * 1000) {
  return Array.from({ length: n }, (_, i) => newShot({ session, front: img(i), thumb: 'data:x', owner: 'u1', now: new Date(captured + i * 1000) }));
}

async function queueWith(items) {
  const q = makeQueue(memoryBackend());
  for (const it of items) await q.add(it);
  return q;
}

test('makeSession：选旧活动 / 新活动 / 不是活动', () => {
  const now = new Date('2026-11-20T03:00:00Z');
  const a = makeSession({ event: { id: 'e1', name: 'KL 商会晚宴', held_on: '2026-11-19' }, now });
  assert.deepEqual([a.event_id, a.event_new, a.held_on, a.how_met], ['e1', false, '2026-11-19', 'KL 商会晚宴']);
  const b = makeSession({ newEvent: { name: '  PUMM 交流会 ', held_on: '' }, now });
  assert.equal(b.event_new, true);
  assert.equal(b.event_name, 'PUMM 交流会');
  assert.equal(b.held_on, '2026-11-20');
  assert.match(b.event_id, /^[0-9a-f-]{36}$/);
  const c = makeSession({ howMet: '朋友介绍', now });
  assert.deepEqual([c.event_id, c.how_met], [null, '朋友介绍']);
  assert.equal(makeSession({ newEvent: { name: '   ' }, now }).event_new, false, '名字空白不算新活动');
});

test('拍下一张：id 当下定好；变成「新朋友」', () => {
  const s = makeSession({ event: { id: 'e1', name: '晚宴', held_on: '2026-11-19' } });
  const [it] = shots(1, s);
  const ids = Object.values(it.ids);
  assert.equal(new Set([it.id, ...ids]).size, ids.length + 1, '每个 id 都不一样');
  const p = personFromShot({ ...it, star: true, note: '想做厨房' });
  assert.equal(p.id, it.id);
  assert.equal(p.name, PLACEHOLDER);
  assert.equal(p.pending_review, true);
  assert.equal(p.card_photo_id, it.ids.front);
  assert.deepEqual(p.tags, ['连拍', '重要']);
  assert.equal(p.how_met, '晚宴');
  assert.equal(p.met_on, '2026-11-19');
  assert.equal(p.notes, `现场备注：想做厨房\n${UNREAD_NOTE}`);
  assert.deepEqual(personFromShot(it).tags, ['连拍']);
});

test('存好之后改 ⭐ / 备注：只动标签和那一行备注', () => {
  const row = { name: '陈', tags: ['连拍', 'VIP'], notes: '现场备注：旧的\n【2026-11-01】女儿读大学' };
  const a = withShotEdits(row, { star: true });
  assert.deepEqual(a.tags, ['连拍', 'VIP', '重要']);
  assert.equal(a.notes, row.notes);
  assert.deepEqual(withShotEdits(a, { star: false }).tags, ['连拍', 'VIP']);
  assert.equal(withShotEdits(row, { note: '新的' }).notes, '现场备注：新的\n【2026-11-01】女儿读大学');
  assert.equal(withShotEdits(row, { note: '' }).notes, '【2026-11-01】女儿读大学');
  assert.equal(withShotEdits(row, { note: '新的' }).name, '陈');
});

test('AI 读到的补进去：只补空的、名字待确认才换、电话不重复', () => {
  const row = { name: PLACEHOLDER, phones: [{ label: 'mobile', number: '+60 12-345 6789' }], emails: [], tags: ['连拍', '重要'], notes: `现场备注：厨房\n${UNREAD_NOTE}` };
  const p = applyCardRead(row, CARD, { companyId: 'c1' });
  assert.equal(p.name, 'Tan Ah Kow');
  assert.equal(p.phones.length, 1, '末 9 码一样不重复加');
  assert.deepEqual(p.emails, ['tan@abc.my']);
  assert.equal(p.whatsapp, '60123456789');
  assert.equal(p.company_id, 'c1');
  assert.equal(p.notes, '现场备注：厨房', '「还没读」那行拿掉，备注留着');
  assert.deepEqual(p.tags, ['连拍', '重要']);
  // 你已经改过的名字、职位不被盖掉
  const q = applyCardRead({ ...row, name: '陈总', title: '老板', company_id: 'c0' }, CARD, { companyId: 'c1' });
  assert.deepEqual([q.name, q.title, q.company_id], ['陈总', '老板', 'c0']);
  // 旧格式（第 4 阶段的扫码留资料）
  assert.equal(applyCardRead({ name: '（名片待确认）', notes: '他留的话\n名片还没读：在「新朋友」按「AI 读名片」' }, {}).notes, '他留的话');
});

test('summarize / dueItems / 退避', () => {
  const s = makeSession({ howMet: 'x' });
  const [a, b, c, d] = shots(4, s);
  const items = [a, { ...b, saved: true }, { ...c, saved: true, read: true, done: true }, { ...d, saved: true, read: true, done: true, unread_reason: '预算用完' }];
  assert.deepEqual(summarize(items), { total: 4, phone: 1, saved: 1, read: 1, unread: 1, failing: 0 });
  assert.equal(summarize([{ ...a, error: '连不上' }]).failing, 1);
  assert.deepEqual(dueItems(items, NOW).map((x) => x.id), [a.id, b.id], '做完的不再做');
  assert.deepEqual(dueItems([{ ...a, next_at: NOW + 1 }], NOW), [], '还没到再试的时间');
  // 正在拍：刚拍的留 45 秒；超过 45 秒的照常送
  const fresh = newShot({ session: s, front: img(), now: new Date(NOW - 10000) });
  const old = newShot({ session: s, front: img(), now: new Date(NOW - GRACE_MS - 1000) });
  assert.deepEqual(dueItems([fresh, old], NOW, { holdUntil: Infinity }).map((x) => x.id), [old.id]);
  assert.equal(dueItems([fresh, old], NOW, { holdUntil: 0 }).length, 2, '按了「拍完了」马上全部送');
  assert.deepEqual([1, 2, 3, 10].map(backoffMs), [5000, 10000, 20000, 300000]);
});

test('readFailure：预算用完不再试；网络 / AI 忙会再试', () => {
  assert.equal(readFailure({ code: 'over_budget', status: 402 }).retry, false);
  assert.equal(readFailure({ code: 'ai_not_configured', status: 500 }).retry, false);
  assert.equal(readFailure({ status: 0, message: '连不上服务器' }).retry, true);
  assert.equal(readFailure({ code: 'ai_busy', status: 503 }).retry, true);
  assert.equal(readFailure({ status: 504 }).retry, true);
});

test('abToBase64 跟 Buffer 一样（大档也行）', () => {
  const big = new Uint8Array(200000).map((_, i) => i % 251);
  assert.equal(abToBase64(big.buffer), Buffer.from(big).toString('base64'));
});

test('队列：同时改同一张不会互相盖掉', async () => {
  const q = await queueWith(shots(1, makeSession({ howMet: 'x' })));
  const [it] = await q.list();
  await Promise.all([q.update(it.id, { star: true }), q.update(it.id, { tries: 3 }), q.update(it.id, (cur) => ({ note: `${cur.note}好` }))]);
  const got = await q.get(it.id);
  assert.deepEqual([got.star, got.tries, got.note], [true, 3, '好']);
  assert.equal(await q.update('nope', { star: true }), null);
});

test('同步：20 张 → 20 个新朋友、记出席、新活动只建一次、AI 读好、手机上的大图清掉', async () => {
  const s = makeSession({ newEvent: { name: '交流会', held_on: '2026-11-20' } });
  const q = await queueWith(shots(20, s));
  const deps = fakeDeps();
  const r = await syncOnce(q, deps, { now: NOW });
  assert.deepEqual(r, { saved: 20, read: 20, failed: 0 });
  assert.equal(deps.db.people.size, 20);
  assert.equal(deps.db.photos.size, 20);
  assert.equal(deps.db.photo_people.size, 20);
  assert.equal(deps.db.interactions.size, 20);
  assert.equal(deps.db.attendance.size, 20);
  assert.equal(deps.db.events.size, 1);
  assert.equal(deps.db.events.get(s.event_id).name, '交流会');
  assert.equal(deps.calls.scan, 20);
  assert.equal(deps.calls.usage, 20);
  const p = [...deps.db.people.values()][0];
  assert.equal(p.name, 'Tan Ah Kow');
  assert.equal(p.pending_review, true, '还是新朋友，等你核对');
  assert.equal(p.company_id, 'c-ABC Sdn Bhd');
  assert.ok([...deps.uploads.keys()].every((k) => k.startsWith('u1/')));
  const left = await q.list();
  assert.ok(left.every((it) => it.done && it.front === null && it.thumb), '大图删掉、缩图留着');
  assert.equal(left[0].read_name, 'Tan Ah Kow');
  // 再跑一次：什么都不做
  assert.deepEqual(await syncOnce(q, deps, { now: NOW }), { saved: 0, read: 0, failed: 0 });
});

test('断网：拿不到帐号 → 什么都不动，照片还在手机', async () => {
  const q = await queueWith(shots(3, makeSession({ howMet: 'x' })));
  const deps = fakeDeps({ ownerId: async () => null });
  await syncOnce(q, deps, { now: NOW });
  const left = await q.list();
  assert.equal(left.length, 3);
  assert.ok(left.every((it) => !it.saved && it.front && it.front.data.byteLength === 3));
  assert.equal(deps.db.people.size, 0);
});

test('存到一半断网：手机上那份不删；网络回来再存一次，不会多出第二个人', async () => {
  const s = makeSession({ event: { id: 'e1', name: '晚宴', held_on: '2026-11-20' } });
  const q = await queueWith(shots(2, s));
  const deps = fakeDeps();
  const realPut = deps.put;
  let broken = true;
  deps.put = async (table, row) => {
    if (broken && table === 'interactions') throw new TypeError('Failed to fetch');
    return realPut(table, row);
  };
  const r1 = await syncOnce(q, deps, { now: NOW });
  assert.deepEqual(r1, { saved: 0, read: 0, failed: 2 });
  let left = await q.list();
  assert.ok(left.every((it) => !it.saved && it.front && it.tries === 1 && it.next_at === NOW + 5000 && /Failed to fetch/.test(it.error)));
  assert.equal(deps.db.people.size, 2, '人已经写进去了一半');
  // 还没到再试的时间：不动
  assert.deepEqual(await syncOnce(q, deps, { now: NOW + 1000 }), { saved: 0, read: 0, failed: 0 });
  broken = false;
  const r2 = await syncOnce(q, deps, { now: NOW + 6000 });
  assert.deepEqual(r2, { saved: 2, read: 2, failed: 0 });
  assert.equal(deps.db.people.size, 2, '没有多出来的人');
  assert.equal(deps.db.photos.size, 2);
  assert.equal(deps.db.photo_people.size, 2);
  assert.equal(deps.db.interactions.size, 2);
  assert.equal(deps.db.attendance.size, 2);
  left = await q.list();
  assert.ok(left.every((it) => it.done && it.error === '' && it.tries === 0));
});

test('照片上传失败：人还没建，手机上那份留着', async () => {
  const q = await queueWith(shots(1, makeSession({ howMet: 'x' })));
  const deps = fakeDeps({ uploadImage: async () => { throw new Error('Load failed'); } });
  await syncOnce(q, deps, { now: NOW });
  const [it] = await q.list();
  assert.equal(it.saved, false);
  assert.ok(it.front);
  assert.equal(deps.db.people.size, 0);
});

test('AI 忙：人已经存好，等一下再读；预算用完：不再试，留给你在新朋友按', async () => {
  const s = makeSession({ howMet: 'x' });
  const q = await queueWith(shots(1, s));
  const deps = fakeDeps({ scanCard: async () => { throw Object.assign(new Error('AI 太忙'), { status: 503, code: 'ai_busy' }); } });
  const r = await syncOnce(q, deps, { now: NOW });
  assert.deepEqual(r, { saved: 1, read: 0, failed: 1 });
  let [it] = await q.list();
  assert.deepEqual([it.saved, it.read, it.done, it.tries], [true, false, false, 1]);
  assert.ok(it.front, 'AI 还没读：大图留着');

  deps.scanCard = async () => { throw Object.assign(new Error('预算用完'), { status: 402, code: 'over_budget' }); };
  await syncOnce(q, deps, { now: NOW + 10000 });
  [it] = await q.list();
  assert.deepEqual([it.read, it.done, it.unread_reason], [true, true, '这个月的 AI 预算用完了']);
  const p = deps.db.people.get(it.id);
  assert.equal(p.name, PLACEHOLDER);
  assert.match(p.notes, /名片还没读/);
});

test('没开自动读：存好就算完，一分钱不花', async () => {
  const q = await queueWith(shots(2, makeSession({ howMet: 'x' })));
  const deps = fakeDeps();
  await syncOnce(q, deps, { now: NOW, autoRead: false });
  assert.equal(deps.calls.scan, 0);
  assert.equal(deps.db.people.size, 2);
  assert.ok((await q.list()).every((it) => it.done && it.unread_reason));
});

test('资料还没载好（断网时打开）→ 先不读；你已经删掉 / 改好名字 → 不花钱读', async () => {
  const s = makeSession({ howMet: 'x' });
  const q = await queueWith(shots(3, s));
  const deps = fakeDeps();
  deps.loaded = false;
  await syncOnce(q, deps, { now: NOW });
  let left = await q.list();
  assert.ok(left.every((it) => it.saved && !it.read && !it.done && it.tries === 0), '存了、还没读、不算失败');
  assert.equal(deps.calls.scan, 0);

  deps.loaded = true;
  deps.db.people.delete(left[0].id); // 你在新朋友删掉了
  deps.db.people.set(left[1].id, { ...deps.db.people.get(left[1].id), name: '陈总' }); // 你自己填好了
  await syncOnce(q, deps, { now: NOW });
  left = await q.list();
  assert.equal(deps.calls.scan, 1, '只读第三张');
  assert.equal(deps.db.people.has(left.find((x) => x.unread_reason === '已经删掉了').id), false, '删掉的人不会被建回来');
  assert.equal(left.find((x) => x.read_name === '陈总').done, true);
});

test('正在拍：刚拍的先不送；别的帐号拍的不写进这个帐号', async () => {
  const s = makeSession({ howMet: 'x' });
  const fresh = newShot({ session: s, front: img(), owner: 'u1', now: new Date(NOW - 5000) });
  const other = newShot({ session: s, front: img(), owner: 'u2', now: new Date(NOW - 3600000) });
  const q = await queueWith([fresh, other]);
  const deps = fakeDeps();
  await syncOnce(q, deps, { now: NOW, holdUntil: Infinity });
  assert.equal(deps.db.people.size, 0);
  await syncOnce(q, deps, { now: NOW });
  assert.equal(deps.db.people.size, 1);
  assert.ok(deps.db.people.has(fresh.id));
});

test('存的那一刻你刚好加了 ⭐ 和背面 → 也补进去', async () => {
  const q = await queueWith(shots(1, makeSession({ howMet: 'x' })));
  const [it] = await q.list();
  const deps = fakeDeps();
  const realPut = deps.put;
  let once = true;
  deps.put = async (table, row) => {
    const r = await realPut(table, row);
    if (once && table === 'interactions') { once = false; await q.update(it.id, { star: true, back: img(9) }); }
    return r;
  };
  await syncOnce(q, deps, { now: NOW, autoRead: false });
  const p = deps.db.people.get(it.id);
  assert.deepEqual(p.tags, ['连拍', '重要']);
  assert.equal(deps.db.photos.size, 2, '背面也上传了');
  assert.equal(deps.db.photo_people.size, 2);
});

test('做完 2 天的清掉，没做完的再久都不清', async () => {
  const s = makeSession({ howMet: 'x' });
  const old = { ...newShot({ session: s, front: null, now: new Date(NOW - KEEP_DONE_MS - 1000) }), saved: true, read: true, done: true };
  const stuck = newShot({ session: s, front: img(), owner: 'u1', now: new Date(NOW - 30 * 24 * 3600 * 1000) });
  const q = await queueWith([old, stuck]);
  await syncOnce(q, fakeDeps({ ownerId: async () => null }), { now: NOW });
  const left = await q.list();
  assert.deepEqual(left.map((x) => x.id), [stuck.id]);
});
