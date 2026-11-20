// VISI 第 3 阶段：老板审图（标「不发」的内置照片）。跑法：node --test tools/visi/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVisi } from './load.mjs';

const MB = loadVisi({ now: new Date(2026, 10, 20, 10, 0, 0) });

function proj() {
  const p = MB.newProject({ host: 'Amy', wa: '60111111111' });
  p.client.names = 'Mr Tan';
  p.rooms = [MB.newRoom('kitchen'), MB.newRoom('living')];
  return p;
}
function printed(p, resolve) {
  const plan = MB.deckImages(p, resolve);
  const out = [];
  Object.values(plan.rooms).forEach((l) => out.push(...l));
  Object.values(plan.slot).forEach((r) => r && out.push(r));
  return out;
}

test('标了「不发」：自动配图、图库都不再用它；放回就回来', () => {
  MB.setBossHidden({});
  const p = proj();
  const k = p.rooms[0];
  const first = MB.autoPick(p, k, [])[0];
  assert.ok(first && first.indexOf('b:') === 0, '厨房自动配到一张内置照片');
  MB.setBossHidden({ [first]: { ts: 1 } });
  assert.equal(MB.photoRetired(first), true);
  assert.equal(MB.retiredKind(first), 'boss');
  assert.ok(!MB.autoPick(p, k, []).includes(first), '自动配图跳过');
  assert.ok(!MB.allImages([]).some((im) => im.ref === first), '图库看不到');
  assert.ok(MB.bossHiddenImages().some((im) => im.ref === first), '审图时列在最后，可以放回');
  MB.setBossHidden({});
  assert.equal(MB.photoRetired(first), false);
  assert.ok(MB.allImages([]).some((im) => im.ref === first), '放回后图库又看得到');
});

test('旧方案自动配的空间用了它：拿掉、重挑，印出来的整份都没有它', () => {
  MB.setBossHidden({});
  const p = proj();
  p.rooms.forEach((r) => { r.images = MB.autoPick(p, r, []); });
  const bad = p.rooms[0].images[0];
  MB.setBossHidden({ [bad]: { ts: 1 } });
  const resolve = MB.makeResolver([]);
  assert.ok(MB.stripRetired(p).length >= 1);
  assert.ok(!printed(p, resolve).includes(bad));
  MB.setBossHidden({});
});

test('销售亲手放的照样印（不破图），体检红灯请他换', () => {
  MB.setBossHidden({});
  const p = proj();
  const k = p.rooms[0];
  k.images = MB.autoPick(p, k, []).slice(0, 1);
  k.manual = true;
  const bad = k.images[0];
  MB.setBossHidden({ [bad]: { ts: 1 } });
  const resolve = MB.makeResolver([]);
  assert.ok(resolve(bad), '还认得这张（不破图）');
  const items = MB.checkProject(p, resolve).items;
  const hit = items.find((x) => /老板标了「不发」/.test(x.title || x.t || JSON.stringify(x)));
  assert.ok(hit, '体检有这一条');
  assert.equal(hit.level || hit.kind || hit.type, 'bad');
  MB.setBossHidden({});
});

test('系列页的官方照片、不在内置图库的 ref 不能标', () => {
  const reserved = MB.seriesReserved()[0];
  assert.equal(MB.bossCanHide(reserved), false);
  const ok = MB.setBossHidden({ [reserved]: { ts: 1 }, 'b:nope': { ts: 1 }, 'u:abc': { ts: 1 } });
  assert.deepEqual(Object.keys(ok), []);
  assert.equal(MB.photoRetired(reserved), false);
});
