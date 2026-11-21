// 房主 + 两个玩家，用假的「转送」在 Node 里跑一整局
import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomHost } from '../src/net/host.js';
import { RoomClient } from '../src/net/client.js';
import { createRoom } from '../src/net/room.js';
import { announceHome, findHome, cleanSlug } from '../src/net/home.js';
import { mulberry32 } from '../src/lib/rng.js';

function hub() {
  const members = new Set();
  return {
    dropFor: null,
    make() {
      const subs = new Set();
      const me = {
        deliver: (m) => subs.forEach((cb) => cb(structuredClone(m))),
      };
      members.add(me);
      const self = this;
      return {
        send(m) {
          for (const o of members) if (o !== me && self.dropFor !== o) o.deliver(m);
        },
        onMessage(cb) {
          subs.add(cb);
          return () => subs.delete(cb);
        },
        onStatus: () => () => {},
        status: () => 'online',
        close: () => members.delete(me),
        _me: me,
      };
    },
  };
}

function setup() {
  const h = hub();
  let clock = 1000;
  const now = () => clock;
  const views = { h: null, a: null, b: null };
  const events = { a: [], b: [] };
  const host = new RoomHost({
    room: createRoom({ code: 'ABCD', gameId: 'codebreaker', hostPid: 'h', hostName: '房主', now: clock }),
    transport: h.make(),
    onView: (v) => (views.h = v),
    now,
    rng: mulberry32(9),
  }).start();
  const mk = (pid) =>
    new RoomClient({
      pid,
      name: pid.toUpperCase(),
      transport: h.make(),
      onView: (v) => (views[pid] = v),
      onEvent: (e) => events[pid].push(e),
      now,
    }).start();
  return { h, host, a: mk('a'), b: mk('b'), views, events, tick: (ms) => (clock += ms) };
}

test('加入 → 开始 → 猜中 → 大家看到结果', () => {
  const { host, a, b, views, tick } = setup();
  try {
    assert.equal(views.h.players.length, 3);
    assert.equal(views.a.players.length, 3);
    assert.equal(views.a.isHost, false);
    host.act({ type: 'start' });
    assert.equal(views.a.phase, 'playing');
    assert.equal(views.a.game.secret, null);
    const secret = host.room.game.secret;
    tick(1000);
    a.act({ type: 'guess', code: secret });
    tick(1000);
    b.act({ type: 'guess', code: secret });
    tick(1000);
    host.act({ type: 'guess', code: secret });
    assert.equal(views.b.game.stage, 'over');
    assert.deepEqual(views.b.game.secret, secret);
    assert.equal(views.h.game.ranking[0].pid, 'a');
  } finally {
    [host, a, b].forEach((x) => x.stop());
  }
});

test('不合规则的动作：只有那个人收到错误', () => {
  const { host, a, b, events } = setup();
  try {
    host.act({ type: 'start' });
    a.act({ type: 'guess', code: [9, 9, 9] });
    assert.deepEqual(events.a.filter((e) => e.type === 'error').map((e) => e.code), ['invalid_code']);
    assert.equal(events.b.filter((e) => e.type === 'error').length, 0);
    a.act({ type: 'start' });
    assert.ok(events.a.some((e) => e.code === 'not_host' || e.code === 'wrong_phase'));
  } finally {
    [host, a, b].forEach((x) => x.stop());
  }
});

test('踢人：被踢的人收到通知，再进不来', () => {
  const { host, a, b, views, events } = setup();
  try {
    host.act({ type: 'kick', pid: 'b' });
    assert.ok(events.b.some((e) => e.type === 'kicked'));
    assert.equal(views.a.players.length, 2);
  } finally {
    [host, a, b].forEach((x) => x.stop());
  }
});

test('漏了一则：房主的 ping 版本比较新 → 玩家自己再要一次', () => {
  const { h, host, a, b, views } = setup();
  try {
    h.dropFor = a.t._me;
    host.act({ type: 'options', options: { difficulty: 'hard' } });
    assert.equal(views.a.options.difficulty, 'easy');
    h.dropFor = null;
    host.tick();
    assert.equal(views.a.options.difficulty, 'hard');
  } finally {
    [host, a, b].forEach((x) => x.stop());
  }
});

test('房主太久没声音 → 玩家看到「等房主回来」', () => {
  const { h, host, a, b, events, tick } = setup();
  try {
    h.dropFor = a.t._me;
    tick(30_000);
    a.updateState();
    assert.equal(events.a.at(-1).status, 'host-away');
    h.dropFor = null;
    host.tick();
    assert.equal(events.a.at(-1).status, 'joined');
  } finally {
    [host, a, b].forEach((x) => x.stop());
  }
});

test('固定网址：房主回答房号；名字只留安全的字', () => {
  const h = hub();
  const stop = announceHome(h.make(), () => 'WXYZ');
  let found = null;
  const stopFind = findHome(h.make(), (c) => (found = c));
  assert.equal(found, 'WXYZ');
  stop();
  stopFind();
  assert.equal(cleanSlug(' Wilson Teo! '), 'wilsonteo');
  assert.equal(cleanSlug('--a--b--'), 'a-b');
});
