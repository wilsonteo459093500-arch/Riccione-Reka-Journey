// 员工 · 案例库（src/cases/CaseManager.jsx）里不碰画面的几样小规则：
//   加照片（压不了 = 这张打不开、接着下一张；压好了写不进去 = 空间出了问题，停下来）· 存案例（存不进去 → 改动和移除的照片都还在）·
//   存不进去的时候说什么 · 「{0} 张照片」的单数 · 没写的房间那一行说的是真的（客人少这一行，照片照常看得到）。
// .jsx 用 esbuild（Vite 自带）打包成一个临时的 ESM 再 import：src 里 Node 自己 import 得了的 .js（cases.js…）不打进去，
// 用 Node 自己的那一份 —— 和这里 import 的是同一个模块（同一个内存里的「设备」）。import.meta.glob（Vite 才有）换成空的。
// 跑法：node test/case-manager.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as C from '../src/shared/cases.js';
import { setLang as setLang0, t } from '../src/shared/i18n.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src') + path.sep;
const setLang = (l) => setLang0(l, { reload: false });

let n = 0;
let failed = 0;
async function test(name, fn) {
  n++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 5).join('\n    ')}`);
  }
}

/** src 里的这个 .js（连它 import 的）Node 自己 import 得了吗（不碰 .css / .jsx） */
const SAFE = new Map();
function nodeSafe(abs) {
  if (SAFE.has(abs)) return SAFE.get(abs);
  SAFE.set(abs, true);
  const deps = [...fs.readFileSync(abs, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?['"](\.\.?\/[^'"]+)['"]/g)].map((m) => path.resolve(path.dirname(abs), m[1]));
  const ok = deps.every((d) => /\.m?js$/.test(d) && fs.existsSync(d) && nodeSafe(d));
  SAFE.set(abs, ok);
  return ok;
}

async function loadJsx(rel) {
  const r = await build({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    logLevel: 'silent',
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'src-js-external',
        setup(b) {
          b.onResolve({ filter: /^\.\.?\// }, (a) => {
            const abs = path.resolve(a.resolveDir, a.path);
            if (abs.startsWith(SRC) && /\.m?js$/.test(abs) && nodeSafe(abs)) return { path: pathToFileURL(abs).href, external: true };
            return undefined;
          });
          // import.meta.glob 是 Vite 的：这里当作一个文件都没有
          b.onLoad({ filter: /\.jsx$/ }, (a) => ({ contents: fs.readFileSync(a.path, 'utf8').replace(/import\.meta\.glob\(/g, '((_) => ({}))('), loader: 'jsx' }));
        },
      },
    ],
  });
  const file = path.join(os.tmpdir(), `case-manager-${process.pid}-${path.basename(rel)}.mjs`);
  fs.writeFileSync(file, r.outputFiles[0].text);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/** 照片写不进去的时候 CaseManager 会 console.warn：测试里不印出来 */
async function quiet(fn) {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = warn;
  }
}

async function inLang(l, fn) {
  setLang(l);
  try {
    return await fn();
  } finally {
    setLang('zh');
  }
}

const png = (bytes) => new Blob([new Uint8Array(bytes)], { type: 'image/webp' });
const onDevice = async (caseId, id) => (await C.loadImageURL({ id: caseId }, { id, device: true }, 480)).url !== '';

console.log('员工 · 案例库（case-manager）');
setLang('zh');
const M = await loadJsx('src/cases/CaseManager.jsx');

// ───────────────────────── 加照片 ─────────────────────────

/** 假的压缩：名字里有 broken 的打不开；其它都压成一张小 webp。记下压了哪几张 */
function fakeCompress() {
  const seen = [];
  const fn = async (f, opts) => {
    seen.push(f.name);
    assert.deepEqual(opts, { maxW: 1600, maxH: 1600 });
    if (/broken/.test(f.name)) throw new Error('decode');
    return { blob: png([seen.length, 1, 2, 3]), w: 1600, h: 1200 };
  };
  return { fn, seen };
}
const file = (name) => ({ name, type: 'image/jpeg' });
function recorder() {
  const out = { added: [], done: [], flash: [] };
  out.on = { added: (im, room) => out.added.push({ im, room }), done: (k) => out.done.push(k), flash: (msg, kind) => out.flash.push([msg, kind]) };
  return out;
}

await test('加照片：压不了的那张说「打不开」、接着下一张；压好了写不进去（iPad 空间满了是 UnknownError）→ 说空间不够、停下来，后面的不再压', async () => {
  C._resetDevice();
  const files = ['kitchen-1.jpg', 'broken.heic', 'living-2.jpg', 'bath-3.jpg', 'study-4.jpg'].map(file);
  const z = fakeCompress();
  const r = recorder();
  // 第三张存得进去的照片（bath-3）开始，照片写不进去
  let photos = 0;
  C._failWrites((store) => (store === 'photos' && ++photos > 4 ? new DOMException('Error writing to database', 'UnknownError') : null));
  const saved = await quiet(() => M.addPhotos('p-add', files, r.on, z.fn));
  C._failWrites(null);
  assert.equal(saved, 2);
  assert.deepEqual(z.seen, ['kitchen-1.jpg', 'broken.heic', 'living-2.jpg', 'bath-3.jpg'], 'stops before compressing study-4');
  assert.deepEqual(
    r.added.map((x) => [x.room, x.im.room, x.im.device]),
    [
      ['kitchen', 'kitchen', true],
      ['living', 'living', true],
    ]
  );
  assert.deepEqual(r.flash, [
    ['这张照片打不开：broken.heic', 'error'],
    ['这台设备的空间不够了：后面的照片没有存进去', 'error'],
  ]);
  assert.deepEqual(r.done, [1, 2, 3], 'progress for kitchen, broken, living; none after the storage stop');
  for (const x of r.added) assert.ok(await onDevice('p-add', x.im.id), `${x.room} is on the device`);
  assert.deepEqual(r.added[0].im.w, 1600);
  C._resetDevice();
});

await test('加照片：写不进去不管是什么错（不一定认得出是空间满了）都当作这台设备存不下 → 停下来，不说「这张照片打不开」', async () => {
  C._resetDevice();
  const z = fakeCompress();
  const r = recorder();
  C._failWrites((store) => (store === 'photos' ? new Error('boom') : null));
  const saved = await quiet(() => M.addPhotos('p-add2', ['a.jpg', 'b.jpg', 'c.jpg'].map(file), r.on, z.fn));
  C._failWrites(null);
  assert.equal(saved, 0);
  assert.deepEqual(z.seen, ['a.jpg'], 'only the first one is compressed');
  assert.deepEqual(r.flash, [['这台设备的空间不够了：后面的照片没有存进去', 'error']]);
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.done, []);
  C._resetDevice();
});

await test('加照片：都存得进去 → 每张都加、房间照文件名认（认不出 = 先空着）、每张都有进度；英文的提醒有英文', async () => {
  C._resetDevice();
  const z = fakeCompress();
  const r = recorder();
  const saved = await M.addPhotos('p-add3', ['IMG_0001.jpg', '主卧 2.jpg', 'Overview.png'].map(file), r.on, z.fn);
  assert.equal(saved, 3);
  assert.deepEqual(
    r.added.map((x) => x.room),
    [C.ROOM_UNKNOWN, 'master', 'plan3d']
  );
  assert.equal(r.added[2].im.kind, 'plan3d');
  assert.deepEqual(r.done, [1, 2, 3]);
  assert.deepEqual(r.flash, []);
  // 英文
  const e = recorder();
  C._failWrites((store) => (store === 'photos' ? new DOMException('x', 'QuotaExceededError') : null));
  await inLang('en', () => quiet(() => M.addPhotos('p-add3', ['broken.jpg', 'x.jpg'].map(file), e.on, fakeCompress().fn)));
  C._failWrites(null);
  assert.deepEqual(
    e.flash.map((x) => x[0]),
    ["This photo won't open: broken.jpg", 'This device is out of space: the remaining photos were not saved']
  );
  C._resetDevice();
});

// ───────────────────────── 存案例 ─────────────────────────

/** 一个已经存在这台设备上的案例（两张设备照片）+ 编辑器里把第二张移除了 */
async function editedCase() {
  C._resetDevice();
  const c = C.newCase('project');
  const a = await C.putImage(c.id, null, { room: 'kitchen', blobs: { 1600: png([1, 1]), 480: png([1, 2]), w: 1600, h: 1200 } });
  const b = await C.putImage(c.id, null, { room: 'living', blobs: { 1600: png([2, 1]), 480: png([2, 2]), w: 1600, h: 1200 } });
  a.cover = true;
  await C.saveCase({ ...c, title: { zh: '测试', en: 'Test' }, images: [a, b] });
  const draft = { ...(await C.getCase(c.id)), title: { zh: '测试改过', en: 'Test edited' }, images: [a] };
  const pending = { current: { adds: ['new1'], drops: [b.id] } };
  return { c, a, b, draft, pending };
}

await test('存案例（保存 / 上架 / 藏起来）：存不进去 → 抛出原来的错误；设备上那一版和它的照片都不动；pending 原样留着（再存一次 / 放弃改动都对得上）', async () => {
  const { c, b, draft, pending } = await editedCase();
  C._failWrites((store) => (store === 'cases' ? new DOMException('The quota has been exceeded.', 'QuotaExceededError') : null));
  const err = await M.commitCase({ ...draft, status: 'draft' }, pending).then(
    () => null,
    (e) => e
  );
  C._failWrites(null);
  assert.equal(err?.name, 'QuotaExceededError');
  assert.deepEqual(pending.current, { adds: ['new1'], drops: [b.id] }, 'pending kept');
  assert.ok(await onDevice(c.id, b.id), 'the removed photo is still there: the saved version still shows it');
  const still = await C.getCase(c.id);
  assert.equal(still.images.length, 2);
  assert.equal(still.title.zh, '测试');
  // 再存一次就好了：存好了才删掉移除的照片
  const saved = await M.commitCase({ ...draft, status: 'draft' }, pending);
  assert.equal(saved.title.zh, '测试改过');
  assert.deepEqual(pending.current, { adds: [], drops: [] });
  assert.ok(!(await onDevice(c.id, b.id)), 'the removed photo is dropped after the save');
  assert.deepEqual(
    (await C.getCase(c.id)).images.map((im) => im.id),
    draft.images.map((im) => im.id)
  );
  C._resetDevice();
});

await test('存案例：存的时候（还在等）才加进来 / 移除的照片不在存的这一版里 → 留在 pending 等下一次，不会被删掉', async () => {
  const { c, a, draft, pending } = await editedCase();
  // 存案例那一下写进去的时候，员工又移除了 a、又加了一张
  C._failWrites((store) => {
    if (store === 'cases') pending.current.drops.push(a.id), pending.current.adds.push('late1');
    return null;
  });
  await M.commitCase(draft, pending);
  C._failWrites(null);
  assert.deepEqual(pending.current, { adds: ['late1'], drops: [a.id] });
  assert.ok(await onDevice(c.id, a.id), 'a is still in the saved version: not dropped');
  C._resetDevice();
});

await test('存不进去的时候说什么：空间满了（QuotaExceeded / 写的时候的 UnknownError）→ 空间不够；别的 → 没存进去、改动还在；中英文', async () => {
  const { draft, pending } = await editedCase();
  C._failWrites((store) => (store === 'cases' ? new DOMException('Error writing to database', 'UnknownError') : null));
  const full = await M.commitCase(draft, pending).then(
    () => null,
    (e) => e
  );
  C._failWrites(null);
  assert.ok(C.isQuotaError(full));
  assert.equal(M.saveFailText(full), '这台设备的空间不够了：这次的改动没有存进去');
  assert.equal(M.saveFailText(new DOMException('x', 'QuotaExceededError')), '这台设备的空间不够了：这次的改动没有存进去');
  for (const e of [new Error('boom'), new DOMException('x', 'InvalidStateError'), null]) assert.equal(M.saveFailText(e), '没存进去：改动都还在，再存一次试试', String(e));
  await inLang('en', () => {
    assert.equal(M.saveFailText(full), 'This device is out of space: these changes were not saved');
    assert.equal(M.saveFailText(new Error('boom')), 'Not saved: your changes are still here, so try saving again');
  });
  C._resetDevice();
});

await test('CaseManager 里存案例都走 commitCase（存不进去有人接住），存 / 藏起来的地方都包在 try 里', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/cases/CaseManager.jsx'), 'utf8');
  assert.equal(src.match(/C\.saveCase\(/g)?.length, 1, 'C.saveCase only inside commitCase');
  const calls = [...src.matchAll(/await commitCase\(/g)];
  assert.equal(calls.length, 2, 'save + hideToggle');
  for (const m of calls) assert.match(src.slice(Math.max(0, m.index - 80), m.index), /try \{\s*\n?\s*saved = $/, 'inside a try');
  assert.equal(src.match(/C\.putImage\(/g)?.length, 1, 'C.putImage only inside addPhotos');
});

// ───────────────────────── 每个房间我们做了什么：那一行的字 ─────────────────────────

await test('「{0} 张照片」：一张的时候英文是单数（1 photo），其它是复数；中文照旧', async () => {
  assert.equal(M.photosText(1), '1 张照片');
  assert.equal(M.photosText(3), '3 张照片');
  await inLang('en', () => {
    assert.equal(M.photosText(1), '1 photo');
    assert.equal(M.photosText(2), '2 photos');
    assert.equal(M.photosText(0), '0 photos');
  });
});

await test('没写的房间：员工那一行说「客人在「每个房间」里看不到这一行（照片照常显示）」—— 是真的：客人的「每个房间我们做了什么」少这一行，相册里这个房间的照片还在', async () => {
  const c = C.newCase('project');
  Object.assign(c, {
    rooms: ['kitchen', 'dining'],
    supplies: { firm: ['kitchen'], context: [] },
    images: [
      { id: 'a', room: 'kitchen', kind: 'photo', src: '/x/a.webp', cover: true },
      { id: 'b', room: 'dining', kind: 'photo', src: '/x/b.webp' },
      { id: 'c', room: 'dining', kind: 'photo', src: '/x/c.webp' },
    ],
  });
  const staff = C.caseRoomsMade(c, { staff: true }).find((r) => r.room === 'dining');
  assert.ok(staff, 'staff see the dining row');
  assert.ok(!staff.firm.length && !staff.boards.length && !staff.note, 'nothing written for dining');
  assert.equal(staff.images, 2);
  assert.ok(!C.caseRoomsMade(c).some((r) => r.room === 'dining'), 'guests: no dining row in 每个房间我们做了什么');
  assert.deepEqual(
    C.galleryTabs(c).find((x) => x.id === 'dining'),
    { id: 'dining', n: 2, label: C.roomLabel('dining') },
    'guests: the dining photos still have their tab'
  );
  // 员工看到的那一句（中文 / 英文）不再说这个房间客人看不到
  const src = fs.readFileSync(path.join(ROOT, 'src/cases/CaseManager.jsx'), 'utf8');
  assert.ok(src.includes("t('没写：客人在「每个房间」里看不到这一行（照片照常显示）')"));
  assert.ok(!src.includes('客人那边不显示这个房间'));
  await inLang('en', () => {
    const en = t('没写：客人在「每个房间」里看不到这一行（照片照常显示）');
    assert.match(en, /What we made in each room/);
    assert.match(en, /photos still show/);
  });
});

C._resetDevice();
console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
