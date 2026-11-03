// 精选（assets/js/caselib/pick.js）：上传页的精选模式、审核页的「只留最好的 N 张」共用
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INVITE, flipBits, hexOf } from '../testkit.mjs';

const src = readFileSync(join(INVITE, 'assets/js/caselib/pick.js'), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'pick.js' });
const P = ctx.window.MB.clPick;
const ids = (a) => Array.from(a);

// 彼此差很远的 dHash（每个差 16 bit 以上）
const FAR = ['0000000000000000', 'ffffffffffffffff', '00000000ffffffff', 'ffffffff00000000', '0000ffff0000ffff', 'ffff0000ffff0000', '00ff00ff00ff00ff', 'ff00ff00ff00ff00'];

test('pick: one photo per shot (near-identical dHash), keeps the landscape / larger one', () => {
  const base = FAR[0];
  const items = [
    { id: 'small', w: 800, h: 600, dh: base, f: 'a.jpg' },
    { id: 'portrait', w: 1200, h: 1600, dh: flipBits(base, [1, 2]), f: 'b.jpg' },
    { id: 'big', w: 1200, h: 900, dh: flipBits(base, [3]), f: 'c.jpg' },
    { id: 'other', w: 1200, h: 900, dh: FAR[1], f: 'd.jpg' }
  ];
  const got = ids(P.best(items, 6));
  assert.deepEqual(got.sort(), ['big', 'other']);
});

test('pick: server shot groups count as one shot even with distant dHash', () => {
  const items = [
    { id: 'a', w: 1200, h: 900, dh: FAR[0], shot: 'a' },
    { id: 'b', w: 1200, h: 900, dh: FAR[1], shot: 'a' },
    { id: 'c', w: 1200, h: 900, dh: FAR[2], shot: 'c' }
  ];
  assert.equal(P.best(items, 6).length, 2);
});

test('pick: spreads across sub-folders first (bigger folders first), then most different', () => {
  const items = [];
  for (let i = 0; i < 5; i++) items.push({ id: 'k' + i, w: 1200, h: 900, dh: FAR[i], f: '厨房/k' + i + '.jpg' });
  items.push({ id: 'w0', w: 1200, h: 900, dh: FAR[5], f: '主卧/w0.jpg' });
  items.push({ id: 'w1', w: 1200, h: 900, dh: FAR[6], f: '主卧/w1.jpg' });
  items.push({ id: 't0', w: 1200, h: 900, dh: FAR[7], f: '电视墙/t0.jpg' });
  const three = ids(P.best(items, 3));
  assert.equal(three.length, 3);
  assert.deepEqual(three.map((id) => id[0]).sort(), ['k', 't', 'w'], 'one from each room');
  assert.equal(three[0][0], 'k', 'kitchen has the most photos → first');
  assert.equal(P.best(items, 6).length, 6);
  assert.equal(P.best(items, 100).length, items.length);
});

test('pick: landscape and resolution win inside a folder', () => {
  const items = [
    { id: 'tiny', w: 400, h: 300, dh: FAR[0], f: 'x/1.jpg' },
    { id: 'tall', w: 900, h: 1200, dh: FAR[1], f: 'x/2.jpg' },
    { id: 'wide', w: 1200, h: 800, dh: FAR[2], f: 'x/3.jpg' }
  ];
  assert.equal(P.best(items, 1)[0], 'wide');
  assert.ok(P.score({ w: 1200, h: 800 }) > P.score({ w: 900, h: 1200 }));
});

test('pick: diversity — after the spread it takes the photo least like the ones already chosen', () => {
  const a = FAR[0];
  const items = [
    { id: 'a', w: 1200, h: 900, dh: a },
    { id: 'near', w: 1200, h: 900, dh: flipBits(a, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) },   // 10 bit：不同镜头，但很像
    { id: 'far', w: 1000, h: 750, dh: FAR[1] }                                            // 分数低一点，但最不像
  ];
  assert.deepEqual(ids(P.best(items, 2)), ['a', 'far']);
});

test('pick: empty / zero / bad input', () => {
  assert.deepEqual(ids(P.best([], 6)), []);
  assert.deepEqual(ids(P.best([{ id: 'a', w: 1, h: 1, dh: FAR[0] }], 0)), []);
  assert.deepEqual(ids(P.best(null, 3)), []);
  assert.deepEqual(ids(P.best([{ id: 'a', w: 0, h: 0, dh: 'nope' }, { id: 'b', w: 0, h: 0, dh: '' }], 3)).sort(), ['a', 'b']);
  assert.equal(P.groupOf('厨房/IMG_1.jpg'), '厨房');
  assert.equal(P.groupOf('a\\b\\c.jpg'), 'a/b');
  assert.equal(P.groupOf('IMG_1.jpg'), '');
  assert.equal(P.DEFAULT_N, 6);
});

test('pick: browser file is plain ES5', () => {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/=>/.test(code));
  assert.ok(!/\b(let|const|class)\s/.test(code));
  assert.ok(!/`/.test(code));
});

test('pick: 1,000 photos in one project stays fast', () => {
  const items = [];
  for (let i = 0; i < 1000; i++) items.push({ id: 'p' + i, w: 1200, h: 900, dh: hexOf(BigInt(i) * 0x9e3779b97f4a7c15n % (1n << 64n)), f: 'r' + (i % 7) + '/x.jpg' });
  const t0 = Date.now();
  assert.equal(P.best(items, 6).length, 6);
  assert.ok(Date.now() - t0 < 500);
});
