import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/net/room.js';
import { mulberry32, roomCode, isRoomCode, normalizeRoomCode } from '../src/lib/rng.js';

const ctx = (now = 1000) => ({ now, rng: mulberry32(3) });
const base = () => R.createRoom({ code: 'ABCD', gameId: 'codebreaker', hostPid: 'h', hostName: '爸爸', now: 0 });

test('房号：不会出现容易看错的字', () => {
  const rng = mulberry32(1);
  for (let i = 0; i < 500; i++) {
    const c = roomCode(rng);
    assert.ok(isRoomCode(c), c);
    assert.ok(!/[01OIL]/.test(c), c);
  }
  assert.equal(normalizeRoomCode(' ab-cd '), 'ABCD');
  assert.equal(isRoomCode('AB0D'), false);
});

test('加入、改名、重新连上同一个人不会多一个', () => {
  let r = base();
  r = R.handle(r, 'k1', { t: 'hello', name: '  小明<script> ' }, ctx());
  r = R.handle(r, 'k1', { t: 'hello', name: '小明' }, ctx(2000));
  assert.equal(r.players.length, 2);
  assert.equal(r.players[1].name, '小明');
  assert.equal(R.cleanName('<b>'), 'b');
  assert.equal(R.cleanName('   '), '?');
});

test('只有房主能开始、设定、踢人；被踢的人进不来', () => {
  let r = base();
  r = R.handle(r, 'k1', { t: 'hello', name: 'A' }, ctx());
  assert.throws(() => R.handle(r, 'k1', { t: 'act', action: { type: 'start' } }, ctx()), /not_host/);
  assert.throws(() => R.handle(r, 'k1', { t: 'act', action: { type: 'options', options: { mode: 'setter' } } }, ctx()), /not_host/);
  r = R.handle(r, 'h', { t: 'act', action: { type: 'options', options: { mode: 'setter', difficulty: 'bogus' } } }, ctx());
  assert.deepEqual(r.options, { mode: 'setter', difficulty: 'easy' });
  r = R.handle(r, 'h', { t: 'act', action: { type: 'kick', pid: 'k1' } }, ctx());
  assert.equal(r.players.length, 1);
  assert.throws(() => R.handle(r, 'k1', { t: 'hello', name: 'A' }, ctx()), /kicked/);
  assert.throws(() => R.handle(r, 'h', { t: 'act', action: { type: 'kick', pid: 'h' } }, ctx()), /cannot_kick_host/);
});

test('人不够不能开始；开始后中途加入的人在旁边看', () => {
  let r = base();
  assert.throws(() => R.handle(r, 'h', { t: 'act', action: { type: 'start' } }, ctx()), /not_enough_players/);
  r = R.handle(r, 'k1', { t: 'hello', name: 'A' }, ctx());
  r = R.handle(r, 'h', { t: 'act', action: { type: 'start' } }, ctx());
  assert.equal(r.phase, 'playing');
  r = R.handle(r, 'late', { t: 'hello', name: 'L' }, ctx());
  const v = R.viewFor(r, 'late', 1000);
  assert.equal(v.spectator, true);
  assert.equal(v.game.secret, null);
  assert.throws(() => R.handle(r, 'late', { t: 'act', action: { type: 'guess', code: [0, 1, 2] } }, ctx()), /not_guesser/);
  r = R.handle(r, 'h', { t: 'act', action: { type: 'lobby' } }, ctx());
  assert.equal(r.phase, 'lobby');
  assert.equal(R.viewFor(r, 'late', 1000).spectator, false);
});

test('画面资料：在线状态、自己的板、版本号会增加', () => {
  let r = base();
  r = R.handle(r, 'k1', { t: 'hello', name: 'A' }, ctx(0));
  const v0 = r.ver;
  r = R.handle(r, 'k1', { t: 'hb' }, ctx(5000));
  assert.equal(r.ver, v0, '心跳不加版本');
  let v = R.viewFor(r, 'h', 10_000);
  assert.equal(v.players.find((p) => p.pid === 'k1').online, true);
  v = R.viewFor(r, 'h', 5000 + R.ONLINE_MS + 1);
  assert.equal(v.players.find((p) => p.pid === 'k1').online, false);
  assert.equal(v.players.find((p) => p.pid === 'h').online, true);
  r = R.handle(r, 'h', { t: 'act', action: { type: 'start' } }, ctx());
  r = R.handle(r, 'k1', { t: 'act', action: { type: 'guess', code: [0, 1, 2] } }, ctx());
  const mine = R.viewFor(r, 'k1', 1000);
  assert.equal(mine.game.mine.guesses.length, 1);
  assert.ok(r.ver > v0);
});

test('房间满了进不来', () => {
  let r = base();
  for (let i = 0; i < 7; i++) r = R.handle(r, `p${i}`, { t: 'hello', name: `P${i}` }, ctx());
  assert.throws(() => R.handle(r, 'extra', { t: 'hello', name: 'X' }, ctx()), /room_full/);
});

test('玩家离开：游戏里当作放弃；房主不能离开', () => {
  let r = base();
  r = R.handle(r, 'k1', { t: 'hello', name: 'A' }, ctx());
  r = R.handle(r, 'k2', { t: 'hello', name: 'B' }, ctx());
  r = R.handle(r, 'h', { t: 'act', action: { type: 'start' } }, ctx());
  r = R.handle(r, 'k2', { t: 'bye' }, ctx());
  assert.equal(r.players.length, 2);
  assert.equal(r.game.boards.k2.out, true);
  assert.throws(() => R.handle(r, 'h', { t: 'bye' }, ctx()), /host_cannot_leave/);
});
