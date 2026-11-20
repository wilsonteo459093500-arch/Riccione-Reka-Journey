// VISI 第 3 阶段（下半）：找同一张的照片、老板退回的清单。跑法：node --test tools/visi/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVisi } from './load.mjs';
import { compare, group } from '../same-shot.mjs';
import { parseIds, retire } from '../retire.mjs';

const INVITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../invite');
const H = (n) => n.toString(16).padStart(16, 'a');
const S = (n, more) => Object.assign({ id: 'b:s-' + H(n), src: 'assets/img/sail/' + H(n) + '.jpg', w: 1600, h: 1067, series: '', style: 'wood', rooms: ['kitchen'], en: 'Natural wood kitchen', zh: '原木厨房' }, more);
const isNew = (id) => id.startsWith('b:s-');

test('比对：裁切、缩图、连拍认得出来；不同的照片不会被当成同一张', () => {
  const MB = loadVisi();
  const src = (id) => path.join(INVITE, MB.BUILTIN.find((b) => b.id === id).src);
  // 真的内置照片：骨骼线走廊是 skeleton-1 的左半边；雾山客厅跟客厅全景是同一张缩过的；另外两张是不同的照片
  const dir = mkdtempSync(path.join(tmpdir(), 'shot-'));
  const a = src('b:skeleton-1'), burst = path.join(dir, 'burst.jpg');
  // 连拍：同一张往右移 1%、亮一点、重存
  execFileSync('python3', ['-I', '-c', `
from PIL import Image, ImageEnhance
im = Image.open(${JSON.stringify(a)}).convert('RGB')
w, h = im.size
im = ImageEnhance.Brightness(im.crop((int(w * 0.01), 0, w, h)).resize((w, h))).enhance(1.05)
im.save(${JSON.stringify(burst)}, quality=80)`]);
  const photos = [
    { id: 'b:skeleton-1', file: a }, { id: 'b:misty-corridor', file: src('b:misty-corridor') },
    { id: 'b:living-wide', file: src('b:living-wide') }, { id: 'b:misty-living', file: src('b:misty-living') },
    { id: 'b:s-burst', file: burst }
  ];
  const pairs = compare(photos, true);
  const hit = (x, y) => pairs.find((p) => (p.a === x && p.b === y) || (p.a === y && p.b === x));
  assert.ok(hit('b:skeleton-1', 'b:misty-corridor').ncc >= 0.94, '裁切');
  assert.ok(hit('b:living-wide', 'b:misty-living').ncc >= 0.94, '缩图');
  assert.ok(hit('b:skeleton-1', 'b:s-burst').d <= 8, '连拍');
  assert.equal(hit('b:skeleton-1', 'b:living-wide'), undefined, '不同的照片');
  // 只比有新照片的配对：旧的两两不比
  const onlyNew = compare(photos.map((p) => Object.assign({ new: isNew(p.id) }, p)));
  assert.ok(onlyNew.length && onlyNew.every((p) => isNew(p.a) || isNew(p.b)));
});

test('分组：新照片跟旧的同一张 → 跟旧的带头；全是新的 → 跟最前面那张；差一点的只列出来', () => {
  const ids = ['b:old-lead', 'b:old-crop', 'b:s-1', 'b:s-2', 'b:s-3', 'b:s-4', 'b:s-5'];
  const oldLead = (id) => (id === 'b:old-crop' ? 'b:old-lead' : id);
  const res = group(ids, [
    { a: 'b:old-crop', b: 'b:s-1', d: 30, ncc: 0.97 },   // 新的是旧裁切的同一张
    { a: 'b:s-2', b: 'b:s-3', d: 5, ncc: 0.5 },          // 连拍
    { a: 'b:s-3', b: 'b:s-4', d: 11, ncc: 0.9 },         // 差一点：不自动算
    { a: 'b:old-lead', b: 'b:old-crop', d: 40, ncc: 0.99 }
  ], { isNew, oldLead, links: [['b:s-5', 'b:s-2']] });     // 手动写过 s-5 跟 s-2 同一张
  assert.deepEqual(res.shot, { 'b:s-1': 'b:old-lead', 'b:s-3': 'b:s-2', 'b:s-5': 'b:s-2' });
  assert.deepEqual(res.maybe.map((p) => p.a + p.b), ['b:s-3b:s-4']);
  assert.deepEqual(res.oldOnly, [], '旧的那一对本来就在 SAME_SHOT');
});

test('清单里的 shot：VISI 当成同一张；老板退回的从图库拿掉、旧方案还认得', () => {
  const MB = loadVisi({ sail: [S(1), S(2, { shot: 'b:s-' + H(1) }), S(3, { shot: 'b:skeleton-kitchen-2' }), S(4, { retired: 'owner' })] });
  assert.equal(MB.shotKey('b:s-' + H(2)), 'b:s-' + H(1));
  assert.equal(MB.shotKey('b:s-' + H(1)), 'b:s-' + H(1));
  assert.equal(MB.shotKey('b:s-' + H(3)), 'b:skeleton-kitchen', '跟旧的同一组：用 SAME_SHOT 的带头');
  assert.ok(MB.BUILTIN.some((b) => b.id === 'b:s-' + H(1)));
  assert.ok(!MB.BUILTIN.some((b) => b.id === 'b:s-' + H(4)), '退回的不在图库');
  const gone = MB.RETIRED_BUILTIN.find((b) => b.id === 'b:s-' + H(4));
  assert.equal(gone.retired, 'owner');
  assert.equal(gone.zh, '', '拿掉的照片不带说明');
  assert.equal(MB.photoRetired('b:s-' + H(4)), true);
  assert.ok(!MB.allImages([]).some((im) => im.ref === 'b:s-' + H(4)));
});

test('老板的清单 → 溪岸真实案例直接标；手写的内置照片列出来手动移；认不得的整批不动', () => {
  const MB = loadVisi({ sail: [S(1), S(2)] });
  const text = 'VISI 老板审图 · 2026-11-21 · 不发 3 张\nb:s-' + H(1) + ' · 原木厨房 · 厨房\nb:skeleton-kitchen · 骨骼线厨房 · 厨房\nb:misty-2 · x · 客厅\nb:s-' + H(1) + ' · 原木厨房 · 厨房';
  const ids = parseIds(text);
  assert.deepEqual(ids, ['b:s-' + H(1), 'b:skeleton-kitchen', 'b:misty-2']);
  const list = [S(1), S(2)];
  const res = retire(MB, list, ids);
  assert.deepEqual(res.sail, ['b:s-' + H(1)]);
  assert.deepEqual(res.manual, ['b:skeleton-kitchen']);
  assert.deepEqual(res.already, ['b:misty-2']);
  assert.equal(list[0].retired, 'owner');
  assert.equal(list[1].retired, undefined);
  assert.deepEqual(retire(MB, [S(1)], ['b:nope']).unknown, ['b:nope']);
});
