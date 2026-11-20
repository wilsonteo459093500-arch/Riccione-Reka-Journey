// VISI 第 2b 阶段：不串图、不丢资料。跑法：node --test tools/visi/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVisi } from './load.mjs';

const MB = loadVisi({ now: new Date(2026, 10, 20, 10, 0, 0) });
const plain = (o) => JSON.parse(JSON.stringify(o));
const SRC = 'data:image/jpeg;base64,AAAA';

/** 一份有厨房、客厅的方案 */
function proj(name) {
  const p = MB.newProject({ host: 'Amy', wa: '60111111111' });
  p.client.names = name;
  p.rooms = [MB.newRoom('kitchen'), MB.newRoom('living')];
  return p;
}
/** 图库照片（app.js 的 rebuildResolver 给 resolver 的那一份形状） */
const photo = (id, tag, own) => Object.assign({ id, src: SRC, w: 1600, h: 1100, tag, series: '', label: id }, own);

/** 整份方案印出来的所有照片 ref（空间页 + 每个版位） */
function printed(p, resolve) {
  const plan = MB.deckImages(p, resolve);
  const out = [];
  Object.values(plan.rooms).forEach((l) => out.push(...l));
  Object.values(plan.slot).forEach((r) => r && out.push(r));
  return out;
}

test('上传给 A 客户的照片不会自动跑到 B 客户的封面、邀约页、空间页', () => {
  const a = proj('Mr Tan'), b = proj('Ms Lee');
  const users = [
    photo('akitchen', 'kitchen', { pid: a.id }), photo('aliving', 'living', { pid: a.id }),
    photo('old', 'kitchen', { pid: '' })   // 旧版没分过的
  ];
  const resolve = MB.makeResolver(users);
  b.rooms.forEach((r) => { r.images = MB.autoPick(b, r, users); });
  const got = printed(b, resolve);
  assert.ok(!got.some((r) => r === 'u:akitchen' || r === 'u:aliving' || r === 'u:old'), got.join(','));
  // A 自己的方案照样优先用自己的照片
  a.rooms.forEach((r) => { r.images = MB.autoPick(a, r, users); });
  assert.equal(a.rooms[0].images[0], 'u:akitchen');
  assert.ok(printed(a, resolve).includes('u:aliving'));
});

test('设成「公司共用」的照片所有客户都能自动配', () => {
  const b = proj('Ms Lee');
  const users = [photo('show', 'kitchen', { shared: true })];
  MB.makeResolver(users);
  assert.equal(MB.autoPick(b, b.rooms[0], users)[0], 'u:show');
});

test('旧方案自动配的空间里留着别的客户的照片：不再印，照常重挑', () => {
  const a = proj('Mr Tan'), b = proj('Ms Lee');
  const users = [photo('akitchen', 'kitchen', { pid: a.id })];
  const resolve = MB.makeResolver(users);
  b.rooms[0].images = ['u:akitchen'];   // 2b 以前串进来的（不是亲手选的）
  assert.ok(!printed(b, resolve).includes('u:akitchen'));
});

test('亲手选了别的客户的照片：照印，但体检提醒', () => {
  const a = proj('Mr Tan'), b = proj('Ms Lee');
  const users = [photo('akitchen', 'kitchen', { pid: a.id })];
  const resolve = MB.makeResolver(users);
  b.rooms[0].images = ['u:akitchen']; b.rooms[0].manual = true;
  assert.ok(printed(b, resolve).includes('u:akitchen'));
  const items = MB.checkProject(b, resolve).items.filter((i) => /不是这位客户的照片/.test(i.text));
  assert.equal(items.length, 1);
  assert.equal(items[0].level, 'warn');
  // 自己客户的照片不提醒
  a.rooms[0].images = ['u:akitchen']; a.rooms[0].manual = true;
  assert.equal(MB.checkProject(a, resolve).items.filter((i) => /不是这位客户的照片/.test(i.text)).length, 0);
});

test('开场短话的「第 N 页」跟着那一页走：加页、关页之后页码会变', () => {
  const p = proj('Mr Tan');
  MB.makeResolver([]);
  const kitchenNo = MB.roomPageNo(p, p.rooms[0]);
  p.letter = MB.letterIn(p, '你们说的厨房，在第 ' + kitchenNo + ' 页。');
  assert.equal(MB.letterPlain(p), '你们说的厨房，在第 ' + kitchenNo + ' 页。');
  // 前面多一个空间 → 厨房往后一页
  p.rooms.unshift(MB.newRoom('foyer'));
  const after = MB.roomPageNo(p, p.rooms[1]);
  assert.equal(after, kitchenNo + 1);
  assert.equal(MB.letterPlain(p), '你们说的厨房，在第 ' + after + ' 页。');
  assert.deepEqual(plain(MB.letterPageIssues(p)), []);
  // 英文一样
  p.letter = MB.letterIn(p, 'Your kitchen is on page ' + after + '.');
  p.rooms.shift();
  assert.equal(MB.letterPlain(p), 'Your kitchen is on page ' + kitchenNo + '.');
});

test('开场短话指到的那一页删掉了 / 没有那一页：体检说「指错页」', () => {
  const p = proj('Mr Tan');
  MB.makeResolver([]);
  const no = MB.roomPageNo(p, p.rooms[1]);
  p.letter = MB.letterIn(p, '客厅在第 ' + no + ' 页。');
  p.rooms.pop();
  assert.deepEqual(plain(MB.letterPageIssues(p)), [{ n: no, why: 'gone' }]);
  const bad = MB.checkProject(p, MB.makeResolver.last).items.filter((i) => /指错页/.test(i.text));
  assert.equal(bad.length, 1);
  assert.equal(bad[0].level, 'bad');
  p.letter = MB.letterIn(p, '看第 99 页。');
  assert.deepEqual(plain(MB.letterPageIssues(p)), [{ n: 99, why: 'none' }]);
  // 旧版存的死数字（没有记号）：提醒再对一次，不算错
  p.letter = '厨房在第 3 页。';
  assert.deepEqual(plain(MB.letterPageIssues(p)), [{ n: 3, why: 'fixed' }]);
});

test('存档：版本号、改过的讯息、照片归属，重新打开都还在', () => {
  const p = proj('Mr Tan');
  p.rev = 7;
  p.copyEdits = { 'send:zh': '你好，这是改过的讯息', 'bad key': 'x' };
  const n = MB.normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.equal(n.rev, 7);
  assert.deepEqual(plain(n.copyEdits), { 'send:zh': '你好，这是改过的讯息' });
  // 导入（换新 id）= 新的一份，从第 0 版开始
  assert.equal(MB.normalizeProject(JSON.parse(JSON.stringify(p)), { newId: true }).rev, 0);
  const im = MB.normalizeImage({ id: 'x1', src: SRC, tag: 'kitchen', pid: p.id, shared: false });
  assert.equal(im.pid, p.id);
  assert.equal(im.shared, false);
  assert.equal(MB.normalizeImage({ id: 'x2', src: SRC, tag: 'kitchen', shared: true }).shared, true);
});

test('字数上限：编辑框挡的跟存档剪的一样长 —— 打得进去的字，下次打开不会少', () => {
  const T = MB.TEXT_MAX;
  const p = proj('Mr Tan');
  p.needs = [{ quote: 'a'.repeat(T.quote), answer: 'b'.repeat(T.answer) }];
  p.rooms[0].note = 'c'.repeat(T.roomNote);
  p.letter = 'd'.repeat(T.letter);
  p.rooms[0].images = ['b:x1', 'b:x2', 'b:x3', 'b:x4'].slice(0, T.roomImages);
  const n = MB.normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.equal(n.needs[0].quote.length, T.quote);
  assert.equal(n.needs[0].answer.length, T.answer);
  assert.equal(n.rooms[0].note.length, T.roomNote);
  assert.equal(n.letter.length, T.letter);
  // 开场短话存的是记号（比印出来的长）：满 3000 字再带页码记号也不会被剪
  p.letter = 'e'.repeat(T.letter - 10) + '第 3 页';
  p.letter = MB.letterIn(p, p.letter);
  assert.equal(MB.normalizeProject(JSON.parse(JSON.stringify(p))).letter, p.letter);
});
