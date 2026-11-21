import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIFFICULTIES, config, isValidCode, score, randomCode } from '../src/games/codebreaker/rules.js';
import * as game from '../src/games/codebreaker/game.js';
import { mulberry32 } from '../src/lib/rng.js';

test('打分：全对、全错、颜色对位置不对', () => {
  assert.deepEqual(score([0, 1, 2, 3], [0, 1, 2, 3]), { exact: 4, near: 0 });
  assert.deepEqual(score([0, 1, 2, 3], [4, 5, 4, 5]), { exact: 0, near: 0 });
  assert.deepEqual(score([0, 1, 2, 3], [3, 2, 1, 0]), { exact: 0, near: 4 });
  assert.deepEqual(score([0, 1, 2, 3], [0, 2, 1, 5]), { exact: 1, near: 2 });
});

test('打分：重复颜色只算到密码里出现的次数', () => {
  assert.deepEqual(score([0, 0, 1, 1], [0, 1, 0, 1]), { exact: 2, near: 2 });
  assert.deepEqual(score([0, 1, 2, 3], [0, 0, 0, 0]), { exact: 1, near: 0 });
  assert.deepEqual(score([0, 0, 1, 2], [3, 3, 0, 0]), { exact: 0, near: 2 });
  assert.deepEqual(score([1, 1, 1, 2, 2], [2, 1, 2, 2, 1]), { exact: 2, near: 2 });
});

test('合不合规则：格数、颜色范围、不可重复', () => {
  const easy = config('easy');
  assert.equal(isValidCode(easy, [0, 1, 2]), true);
  assert.equal(isValidCode(easy, [0, 1]), false);
  assert.equal(isValidCode(easy, [0, 1, 4]), false);
  assert.equal(isValidCode(easy, [0, 0, 1]), false);
  assert.equal(isValidCode(config('hard'), [0, 0, 7, 7, 1]), true);
  assert.equal(isValidCode(easy, 'abc'), false);
});

test('随机出题一定合规则', () => {
  const rng = mulberry32(7);
  for (const id of Object.keys(DIFFICULTIES)) {
    for (let i = 0; i < 300; i++) assert.ok(isValidCode(config(id), randomCode(config(id), rng)), id);
  }
});

test('FoloToy 对照表跟现在的规则一致', () => {
  const v = JSON.parse(readFileSync(new URL('../shared/codebreaker-vectors.json', import.meta.url)));
  assert.deepEqual(v.difficulties, DIFFICULTIES);
  assert.ok(v.cases.length >= 50);
  for (const c of v.cases) assert.deepEqual(score(c.secret, c.guess), { exact: c.exact, near: c.near });
});

const ctx = (now = 1000, seed = 1) => ({ now, rng: mulberry32(seed), isHost: false });

function solveFor(state) {
  return state.secret;
}

test('比快：同一题，猜中排前面，猜得少的赢', () => {
  let s = game.start(['a', 'b', 'c'], { mode: 'race', difficulty: 'easy' }, ctx());
  assert.equal(s.stage, 'guessing');
  const secret = solveFor(s);
  const wrong = [...secret].reverse();
  s = game.act(s, 'b', { type: 'guess', code: wrong }, ctx(2000));
  s = game.act(s, 'a', { type: 'guess', code: secret }, ctx(3000));
  assert.equal(s.stage, 'guessing');
  s = game.act(s, 'b', { type: 'guess', code: secret }, ctx(2500));
  // c 用完次数
  for (let i = 0; i < config('easy').tries; i++) s = game.act(s, 'c', { type: 'guess', code: wrong }, ctx(4000));
  assert.equal(s.stage, 'over');
  assert.deepEqual(s.ranking.map((r) => r.pid), ['a', 'b', 'c']);
  assert.equal(s.scores.a, 2);
  assert.equal(s.scores.b, 1);
  assert.equal(s.scores.c, 0);
});

test('比快：没结束前，看不到密码，也看不到别人猜的颜色', () => {
  let s = game.start(['a', 'b'], { mode: 'race', difficulty: 'normal' }, ctx());
  s = game.act(s, 'a', { type: 'guess', code: [...s.secret].reverse() }, ctx());
  const vb = game.view(s, 'b');
  assert.equal(vb.secret, null);
  assert.ok(vb.players.every((p) => p.guesses === null));
  assert.equal(vb.players.find((p) => p.pid === 'a').tries, 1);
  const spectator = game.view(s, null);
  assert.equal(spectator.secret, null);
  assert.equal(spectator.mine, null);
  assert.ok(!('secret' in vb.mine || false));
});

test('出题：出题人出完才开始，出题人看得到全部；别人猜不中出题人得分', () => {
  let s = game.start(['a', 'b', 'c'], { mode: 'setter', difficulty: 'easy' }, ctx());
  assert.equal(s.stage, 'setting');
  assert.equal(s.setterPid, 'a');
  assert.throws(() => game.act(s, 'b', { type: 'guess', code: [0, 1, 2] }, ctx()), /wrong_stage/);
  assert.throws(() => game.act(s, 'b', { type: 'set', code: [0, 1, 2] }, ctx()), /not_setter/);
  assert.throws(() => game.act(s, 'a', { type: 'set', code: [0, 0, 2] }, ctx()), /invalid_code/);
  s = game.act(s, 'a', { type: 'set', code: [2, 1, 0] }, ctx(5000));
  assert.equal(s.stage, 'guessing');
  assert.throws(() => game.act(s, 'a', { type: 'guess', code: [2, 1, 0] }, ctx()), /not_guesser/);
  s = game.act(s, 'b', { type: 'guess', code: [0, 1, 2] }, ctx(6000));
  const va = game.view(s, 'a');
  assert.deepEqual(va.secret, [2, 1, 0]);
  assert.deepEqual(va.players.find((p) => p.pid === 'b').guesses[0], { code: [0, 1, 2], exact: 1, near: 2 });
  assert.equal(game.view(s, 'c').secret, null);
  s = game.act(s, 'b', { type: 'guess', code: [2, 1, 0] }, ctx(7000));
  for (let i = 0; i < 8; i++) s = game.act(s, 'c', { type: 'guess', code: [3, 1, 0] }, ctx(8000));
  assert.equal(s.stage, 'over');
  assert.equal(s.scores.a, 1); // 难倒 c
  assert.equal(s.scores.b, 2);
  // 下一局换 b 出题，只有房主能按
  assert.throws(() => game.act(s, 'b', { type: 'next' }, ctx()), /not_host/);
  s = game.act(s, 'a', { type: 'next' }, { ...ctx(), isHost: true });
  assert.equal(s.setterPid, 'b');
  assert.equal(s.round, 2);
  assert.equal(s.scores.b, 2);
});

test('有人离开：当作放弃；出题人在出题时离开，这局直接结束', () => {
  let s = game.start(['a', 'b', 'c'], { mode: 'race', difficulty: 'easy' }, ctx());
  s = game.act(s, 'a', { type: 'guess', code: s.secret }, ctx());
  s = game.act(s, 'b', { type: 'guess', code: s.secret }, ctx());
  s = game.leave(s, 'c');
  assert.equal(s.stage, 'over');
  let t = game.start(['a', 'b', 'c'], { mode: 'setter', difficulty: 'easy' }, ctx());
  t = game.leave(t, 'a');
  assert.equal(t.stage, 'over');
  t = game.act(t, 'b', { type: 'next' }, { ...ctx(), isHost: true });
  assert.equal(t.setterPid, 'b');
  assert.ok(!('a' in t.boards));
});
