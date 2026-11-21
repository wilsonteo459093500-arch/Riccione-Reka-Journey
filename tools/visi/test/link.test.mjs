// VISI 第 2c 阶段：签名链接（VISI 这一边：哪些链接要签、签名存进方案、体检红灯）。跑法：node --test tools/visi/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVisi } from './load.mjs';

const MB = loadVisi({ now: new Date(2026, 10, 20, 10, 0, 0) });
const SIG = 'A'.repeat(22);

function project(host, wa) {
  const p = MB.newProject({ host, wa });
  p.client.names = 'Mr & Mrs Lim';
  return p;
}
function checkOf(p) {
  const resolve = (ref) => (MB.BUILTIN || []).find((b) => b.id === ref) || null;
  return MB.checkProject(p, resolve).items;
}
const unsignedItem = (p) => checkOf(p).find((i) => i.text === '邀请函链接还没认证');

test('签名：公司预设联络人、团队名单里的代号不用签', () => {
  const def = MB.inviteLink(project('', ''));
  assert.equal(def.sign, '');
  assert.doesNotMatch(def.url, /sig=/);
  const code = MB.inviteLink(project('Wilson Teo', '60189661919'));
  assert.equal(code.sign, '');
  assert.equal(unsignedItem(project('', '')), undefined);
});

test('签名：别的销售的名字 / 号码要签，没签 → 体检红灯', () => {
  const p = project('Amy Lee', '012-345 6789');
  const link = MB.inviteLink(p);
  assert.equal(link.sign, 'missing');
  assert.equal(link.fields.by, 'Amy Lee');
  assert.equal(link.fields.wa, '60123456789');
  assert.doesNotMatch(link.url, /sig=/);
  const it = unsignedItem(p);
  assert.ok(it);
  assert.equal(it.level, 'bad');
  assert.equal(it.goto, 'sign');
});

test('签名：存进方案的签名对得上才印进链接；名字或号码改了就要再签', () => {
  const p = project('Amy Lee', '0123456789');
  p.linkSig = { k: MB.inviteLink(p).key, s: SIG };
  const ok = MB.inviteLink(p);
  assert.equal(ok.sign, 'ok');
  assert.match(ok.url, new RegExp('[?&]sig=' + SIG + '(&|$)'));
  assert.equal(unsignedItem(p), undefined);

  p.host.wa = '0199999999';
  const changed = MB.inviteLink(p);
  assert.equal(changed.sign, 'missing');
  assert.doesNotMatch(changed.url, /sig=/);
  assert.ok(unsignedItem(p));
});

test('签名：存档 / 导入时保留格式对的签名，乱写的丢掉', () => {
  const p = project('Amy Lee', '0123456789');
  p.linkSig = { k: MB.inviteLink(p).key, s: SIG };
  const back = MB.normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.equal(back.linkSig.s, SIG);
  assert.equal(MB.inviteLink(back).sign, 'ok');
  for (const bad of [{ k: 'x', s: 'short' }, { k: 1, s: SIG }, 'sig', null, { k: 'x', s: SIG + '<' }]) {
    assert.equal(MB.normalizeProject(Object.assign({}, p, { linkSig: bad })).linkSig, null);
  }
});

test('签名：⑤ 改过的讯息里还是旧链接 → 提醒', () => {
  const p = project('Amy Lee', '0123456789');
  const old = MB.inviteLink(p).url;
  p.copyEdits = { 'invite:zh': '陈先生您好，这是邀请函：' + old + '。期待见面。' };
  const stale = () => checkOf(p).find((i) => i.text === '⑤ 改过的讯息里，邀请函链接是旧的');
  p.linkSig = { k: MB.inviteLink(p).key, s: SIG };     // 签到了：链接多了 sig=
  assert.ok(stale());
  assert.equal(stale().goto, 'copy');
  p.copyEdits = { 'invite:zh': '这是邀请函：' + MB.inviteLink(p).url + '。期待见面。' };
  assert.equal(stale(), undefined);
  p.copyEdits = { 'invite:zh': '没有链接的讯息' };
  assert.equal(stale(), undefined);
});
