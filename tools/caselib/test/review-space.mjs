/* ============================================================
   审核页「整理空间」浏览器测试（caselib.html → 审核）
   node --test tools/caselib/test/review-space.mjs
   - 额度：本月写入 / 1,800、空间 / 950 MB（伺服器的 quota）；Pro 不限
   - 第 1 步「只留最好的 N 张」：跟 MB.clPick.best 挑的一样；一次最多 400 张、分几次送；可以复原
   - 第 2 步「删除隐藏的照片」：要打「删除」；先送没保存的；一次最多 1,000 张；清单、Blob 档都删掉
   - 错误：507 额度用完、503 storage_blocked、400 not_hidden、401 登入过期
   - 删除中不能复原（会被删掉）；每批送出前再确认一次；打好「删除」之后隐藏的变了要再打；Enter 不会删
   - 改的标签存不进去（507 / 503）：不一直重试、讲白话、不挡删除
   - 不超过 N 张的项目也是同一个镜头只留一张
   - 390px 不会横向卷动
   每个测试自己开一个 mock（记忆体储存），假资料用伺服器真的 catalog.js 建（名字都是假的）。
   截图：$CASELIB_SCRATCH/shots/（没设就在 os.tmpdir()/caselib-upload/shots）
   ============================================================ */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startMock } from '../mock-server.mjs';
import { ROOT, launch, newPage, loginOk, index, photoBlobs, shotPath, PASSWORD } from './upload-kit.mjs';

const catalog = await import(pathToFileURL(join(ROOT, 'invite', 'api', '_lib', 'catalog.js')).href);
const MONTH = () => new Date().toISOString().slice(0, 7);

/* ---------- 假资料 ---------- */
const A = '测试客户 陈先生';          // 20 张，3 个子文件夹，有连拍
const B = '测试客户 林太太';          // 6 张，有 2 组连拍：不超过 6 张也一样每个镜头只留一张（留 4 张）
const C = '测试客户 Mr Tan';          // 11 张直接放在项目里，最后 2 张已经隐藏
const G = '测试客户 已隐藏小项目';    // 3 张，整个项目隐藏
const D = '测试客户 旧项目甲';        // 240 张
const E = '测试客户 旧项目乙';        // 240 张
const F = '测试客户 旧项目丙';        // 1,010 张，整个项目隐藏（删的时候要分两批）

const SMALL = [
  { name: A, rooms: { '厨房': 10, '客厅': 6, '主卧': 4 } },
  { name: B, rooms: { '厨房': 4, '浴室': 2 } },
  { name: C, rooms: 11, hide: 2 },
  { name: G, rooms: { '玄关': 3 }, hidden: true }
];
const BIG = SMALL.slice(0, 3).concat([
  { name: D, rooms: { '厨房': 60, '客厅': 60, '主卧': 60, '书房': 60 } },
  { name: E, rooms: { '厨房': 80, '餐厅': 80, '儿童房': 80 } },
  { name: F, rooms: { '厨房': 500, '客厅': 510 }, hidden: true }
]);

function hex(n) { return randomBytes(n).toString('hex'); }
// 只差 2 bit：同一个镜头（连拍）
function near(dh) { return (BigInt('0x' + dh) ^ 0b1001n).toString(16).padStart(16, '0'); }

function buildSeed(jpeg, specs) {
  const idx = catalog.emptyIndex();
  const blobs = {}, P = {};
  const ts = Date.now() - 60000;
  for (const s of specs) {
    const list = [];
    const rooms = typeof s.rooms === 'number' ? { '': s.rooms } : s.rooms;
    let i = 0;
    for (const dir of Object.keys(rooms)) {
      let prev = '';
      for (let j = 0; j < rooms[dir]; j++, i++) {
        const h = hex(8);
        const k = 'c/' + h + '-' + hex(6) + '.jpg';
        const dh = prev && j % 4 === 1 ? near(prev) : hex(8);
        prev = dh;
        const portrait = j % 5 === 3, small = j % 7 === 5;
        const w = small ? 640 : portrait ? 900 : 1200, ht = small ? 480 : portrait ? 1200 : 900;
        list.push({ h, k, w, ht, sz: 200000 + (i % 50) * 1000, dh, f: (dir ? dir + '/' : '') + 'IMG_' + (1000 + i) + '.jpg' });
        blobs[k] = jpeg;
      }
    }
    for (let a = 0; a < list.length; a += catalog.MAX_PHOTOS_PER_CALL) {
      catalog.addPhotos(idx, { project: { name: s.name }, photos: list.slice(a, a + catalog.MAX_PHOTOS_PER_CALL) }, 'Mia', ts);
    }
    const pid = catalog.pidOf(s.name);
    P[s.name] = { pid, hs: list.map((x) => x.h), ks: list.map((x) => x.k) };
    if (s.hide) catalog.setHidden(idx, { photos: list.slice(-s.hide).map((x) => x.h) }, true, 'Mia', ts);
    if (s.hidden) catalog.setHidden(idx, { projects: [pid] }, true, 'Mia', ts);
  }
  idx.usage = { [MONTH()]: { writes: 420 } };
  idx.log = [{ op: 'addPhotos', by: 'Mia', ts, n: Object.keys(idx.photos).length }];
  return { seed: { index: idx, blobs }, P };
}

/* ---------- 共用 ---------- */
let browser, jpeg, small, big;
const mocks = [];
async function mock(data) {
  const m = await startMock({ port: 0, blobPort: 0, password: PASSWORD, seed: JSON.parse(JSON.stringify(data.seed)) });
  mocks.push(m);
  return m;
}
async function hook(m, path) {
  const r = await fetch(m.blob + '__mock/' + path, { method: 'POST' });
  assert.equal(r.status, 200, 'mock hook ' + path);
}
async function serverIndex(m) {
  const r = await fetch(m.blob + '__mock/index');
  return r.json();
}
async function waitServer(fn, ms) {
  const end = Date.now() + (ms || 10000);
  while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server state not reached: ' + fn);
}
async function openReview(page, m, name) {
  await loginOk(page, m.url, name || 'Ana');
  await page.click('#tabs [data-tab="review"]');
  await page.waitForSelector('#rv-grid .rv-card');
  await page.waitForFunction(() => /本月|Pro/.test(document.querySelector('#rv-budget').textContent));
}
async function openTidy(page) {
  if (await page.getAttribute('#rv-tidy-head', 'aria-expanded') !== 'true') await page.click('#rv-tidy-head');
  await page.waitForSelector('#rv-tidy-body:not([hidden])');
}
function postsOf(page) {
  const posts = [];
  page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/catalog$/.test(r.url())) posts.push(r.postDataJSON()); });
  return posts;
}
// 在页面里自己用 MB.clPick.best 算一次：每个（没隐藏的）项目留哪几张、隐藏哪几张
function expected(page, pid, n) {
  return page.evaluate(([pid, n]) => {
    const c = MB.cl.cat, by = {};
    const hid = (ph) => !!(ph.hidden || (c.projects[ph.p] && c.projects[ph.p].hidden));
    Object.keys(c.photos).forEach((h) => { const ph = c.photos[h]; if ((pid && ph.p !== pid) || hid(ph)) return; (by[ph.p] = by[ph.p] || []).push(h); });
    const coll = new Intl.Collator('zh', { numeric: true });
    const keep = [], hide = [];
    Object.keys(by).forEach((p) => {
      const hs = by[p];
      // 不超过 N 张的也照样挑（同一个镜头只留一张，跟上传页一样）
      hs.sort((a, b) => coll.compare(c.photos[a].f || '', c.photos[b].f || '') || (a < b ? -1 : 1));
      const picked = MB.clPick.best(hs.map((h) => ({ id: h, w: c.photos[h].w, h: c.photos[h].h, dh: c.photos[h].dh, shot: c.photos[h].shot, f: c.photos[h].f })), Math.min(n, hs.length));
      keep.push(...picked);
      hs.forEach((h) => { if (picked.indexOf(h) < 0) hide.push(h); });
    });
    return { keep, hide };
  }, [pid, n]);
}
const sorted = (a) => a.slice().sort();
const hiddenIn = (idx, pid) => Object.keys(idx.photos).filter((h) => idx.photos[h].p === pid && idx.photos[h].hidden);
// 「空间约 12.3 / 950 MB」→ 12.3
const spaceOf = (t) => { const m = /空间约 ([\d.,]+)/.exec(t); return m ? +m[1].replace(/,/g, '') : NaN; };
async function noHScroll(page, what) {
  const r = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll('#rv-tidy *, #rv-proj *, #rv-ask *, .head-tools *, #drawer.on *')]
      .filter((el) => el.offsetParent !== null || el.closest('#rv-ask'))
      .filter((el) => { const b = el.getBoundingClientRect(); return b.width && (b.right > w + 1 || b.left < -1); })
      .map((el) => el.tagName + '.' + el.className + ' ' + Math.round(el.getBoundingClientRect().right));
    return { sw: document.documentElement.scrollWidth, w, wide: wide.slice(0, 5) };
  });
  assert.ok(r.sw <= r.w, what + ': page scrolls sideways (' + r.sw + ' > ' + r.w + ')');
  assert.deepEqual(r.wide, [], what + ': elements stick out');
}

before(async () => {
  browser = await launch();
  const p = await browser.newPage();
  // 一张小小的真 JPEG（格子、抽屉的图才载得到）
  jpeg = await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 12; c.height = 9;
    const g = c.getContext('2d'); g.fillStyle = '#b89a74'; g.fillRect(0, 0, 12, 9); g.fillStyle = '#fff'; g.fillRect(2, 2, 5, 3);
    return c.toDataURL('image/jpeg', 0.8).split(',')[1];
  });
  await p.close();
  small = buildSeed(jpeg, SMALL);
  big = buildSeed(jpeg, BIG);
});
after(async () => {
  if (browser) await browser.close();
  for (const m of mocks) await m.close();
});

/* ------------------------------------------------------------ */
test('review space: budget shows this month\'s writes and the space from the server quota; Pro plan = 不限额度', async () => {
  const m = await mock(small);
  await hook(m, 'usage?writes=1500');
  const { ctx, page } = await newPage(browser);
  await openReview(page, m);
  const q = await page.evaluate(() => MB.cl.cat.quota);
  assert.equal(q.plan, 'hobby');
  assert.equal(q.writes, 1500);
  assert.equal(q.uploadCap, 1800);
  const t = await page.textContent('#rv-budget');
  assert.match(t, /^本月 Blob 写入约 1,500 \/ 1,800 · 空间约 [\d.,]+ \/ 950 MB$/);
  assert.ok(Math.abs(spaceOf(t) - q.bytes / 1048576) < 0.1, t + ' vs ' + q.bytes);
  assert.ok(await page.$eval('#rv-budget', (e) => e.classList.contains('warn')), '1,500 > 80% of 1,800');
  // 整理空间：快满了 → 自己打开；顶上一条就看得到空间和隐藏了几张
  assert.equal(await page.getAttribute('#rv-tidy-head', 'aria-expanded'), 'true');
  assert.match(await page.textContent('#rv-tidy-sum'), /空间约 [\d.,]+ \/ 950 MB · 已隐藏 5 张（约 [\d.]+ MB）/);
  // 写入少了 → 不警告
  await hook(m, 'usage?writes=100');
  await page.click('#rv-reload');
  await page.waitForFunction(() => /写入约 100 \//.test(document.querySelector('#rv-budget').textContent));
  assert.equal(await page.$eval('#rv-budget', (e) => e.classList.contains('warn')), false);
  // 空间快满（> 80%）也警告
  await hook(m, 'ballast?bytes=' + 820 * 1048576);
  await page.click('#rv-reload');
  await page.waitForFunction(() => document.querySelector('#rv-budget').classList.contains('warn'));
  assert.ok(spaceOf(await page.textContent('#rv-budget')) > 800);
  // Pro：不限
  process.env.BLOB_PLAN = 'pro';
  try {
    await page.click('#rv-reload');
    await page.waitForFunction(() => /Pro 方案 · 不限额度/.test(document.querySelector('#rv-budget').textContent));
    assert.match(await page.textContent('#rv-budget'), /本月写入约 \d+ 次/);
    assert.equal(await page.$eval('#rv-budget', (e) => e.classList.contains('warn')), false);
  } finally {
    delete process.env.BLOB_PLAN;
  }
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('review space: «只留最好的 N 张» in one project hides exactly what MB.clPick.best leaves out; 复原 brings them back', async () => {
  const m = await mock(small);
  const { pid } = small.P[A];
  const { ctx, page } = await newPage(browser);
  const posts = postsOf(page);
  await openReview(page, m);
  await page.selectOption('#rv-filters select[data-f="pid"]', pid);
  await page.waitForFunction(() => document.querySelectorAll('#rv-grid .rv-card').length === 20);
  await page.click('#rv-proj [data-act="keep-proj"]');
  await page.waitForSelector('#rv-ask:not([hidden])');
  assert.match(await page.textContent('#rv-ask-t'), new RegExp(A));
  assert.equal(await page.inputValue('#rv-ask-n'), '6', 'default N = MB.clPick.DEFAULT_N');
  // N 可以在确认框里改：数字马上跟着变
  const e4 = await expected(page, pid, 4);
  await page.fill('#rv-ask-n', '4');
  await page.waitForFunction((n) => document.querySelector('#rv-ask-num').textContent.indexOf('会隐藏 ' + n + ' 张') >= 0, e4.hide.length);
  await page.fill('#rv-ask-n', '6');
  const exp = await expected(page, pid, 6);
  assert.equal(exp.keep.length, 6);
  assert.equal(exp.hide.length, 14);
  assert.match(await page.textContent('#rv-ask-num'), /会隐藏 14 张（可以复原），留下 6 张/);
  // 挑出来的：每个子文件夹都有、同一个镜头只留一张
  const kept = await page.evaluate((ks) => ks.map((h) => ({ f: MB.cl.cat.photos[h].f, shot: MB.cl.cat.photos[h].shot })), exp.keep);
  assert.deepEqual(sorted([...new Set(kept.map((x) => x.f.split('/')[0]))]), sorted(['厨房', '客厅', '主卧']));
  assert.equal(new Set(kept.map((x) => x.shot)).size, 6, 'one per shot');
  // 取消：什么都没送
  await page.click('#rv-ask [data-ask="no"]');
  assert.equal(await page.isHidden('#rv-ask'), true);
  assert.equal(posts.length, 0);
  // 确定
  await page.click('#rv-proj [data-act="keep-proj"]');
  await page.click('#rv-ask [data-ask="ok"]');
  await waitServer(() => hiddenIn(index(m), pid).length === 14);
  assert.deepEqual(sorted(hiddenIn(index(m), pid)), sorted(exp.hide), 'server hid exactly the photos the picker left out');
  assert.ok(hiddenIn(index(m), pid).every((h) => index(m).photos[h].hidden.by === 'Ana'));
  assert.equal(posts.length, 1, 'one request = one write');
  assert.equal(posts[0].op, 'hide');
  // 格子：隐藏的不见了；项目列有「复原隐藏的 14 张」
  await page.waitForFunction(() => document.querySelectorAll('#rv-grid .rv-card').length === 6);
  assert.deepEqual(sorted(await page.$$eval('#rv-grid .rv-card', (els) => els.map((e) => e.getAttribute('data-h')))), sorted(exp.keep));
  assert.match(await page.textContent('#rv-proj'), /隐藏了 14 张/);
  // 别的项目没被动到
  assert.equal(hiddenIn(index(m), small.P[B].pid).length, 0);
  // 复原
  await page.click('#rv-proj [data-act="unhide-proj-photos"]');
  await waitServer(() => hiddenIn(index(m), pid).length === 0);
  await page.waitForFunction(() => document.querySelectorAll('#rv-grid .rv-card').length === 20);
  assert.equal(posts.length, 2);
  assert.equal(posts[1].op, 'unhide');
  // 抽屉的项目资料也有同一个按钮
  await page.click('#rv-proj [data-act="proj-edit"]');
  await page.waitForSelector('#drawer [data-act="keep-proj"]');
  await page.click('#drawer [data-act="keep-proj"]');
  await page.waitForSelector('#rv-ask:not([hidden])');
  await page.keyboard.press('Escape');
  assert.equal(await page.isHidden('#rv-ask'), true, 'Esc closes the confirm box');
  assert.equal(await page.isVisible('#drawer.on'), true, '… but not the drawer behind it');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('review space: every project keeps the best N → more than 400 hides go out in several requests (≤ 400 each) with progress; 复原刚才隐藏的 undoes it', async () => {
  const m = await mock(big);
  const { ctx, page } = await newPage(browser);
  const posts = postsOf(page);
  await openReview(page, m);
  const before = Object.keys(index(m).photos).filter((h) => index(m).photos[h].hidden);
  assert.equal(before.length, 2);
  // 慢一点，才看得到「第 1 / 2 批」
  await page.route('**/api/catalog', async (route) => {
    if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 400));
    return route.continue();
  });
  await openTidy(page);
  const exp = await expected(page, '', 6);
  // A、C、D、E 都超过 6 张；B 只有 6 张，只隐藏连拍的；整个隐藏的项目不算
  assert.ok(exp.hide.length > 400, 'more than one request: ' + exp.hide.length);
  assert.ok(exp.hide.length <= 800);
  const hideN = exp.hide.length.toLocaleString('en-US');
  assert.match(await page.textContent('#rv-keep-info'), new RegExp('留下 ' + exp.keep.length + ' 张、隐藏 ' + hideN + ' 张'));
  await page.click('#rv-keep-all');
  await page.waitForSelector('#rv-ask:not([hidden])');
  assert.match(await page.textContent('#rv-ask-num'), new RegExp('会隐藏 ' + hideN + ' 张（可以复原），留下 ' + exp.keep.length + ' 张'));
  assert.match(await page.textContent('#rv-ask-num'), /要送 2 次/);
  await page.click('#rv-ask [data-ask="ok"]');
  await page.waitForFunction(() => /第 1 \/ 2 批/.test(document.querySelector('#rv-keep-msg').textContent + document.querySelector('#rv-save .msg').textContent));
  assert.equal(await page.isDisabled('#rv-purge-go'), true, 'no delete while hiding');
  await page.waitForFunction((n) => document.querySelector('#rv-keep-msg').textContent.indexOf('已隐藏 ' + n + ' 张') >= 0, hideN, { timeout: 15000 });
  const hides = posts.filter((b) => b.op === 'hide');
  assert.equal(hides.length, 2, 'two requests');
  assert.ok(hides.every((b) => b.photos.length + b.projects.length <= 400), hides.map((b) => b.photos.length).join(','));
  assert.deepEqual(sorted([].concat(...hides.map((b) => b.photos))), sorted(exp.hide));
  const idx = index(m);
  assert.deepEqual(sorted(Object.keys(idx.photos).filter((h) => idx.photos[h].hidden)), sorted(exp.hide.concat(before)));
  assert.equal(await page.evaluate(() => MB.clReview.unsaved()), 0);
  // 复原刚才隐藏的（之前就隐藏的 2 张不动）
  await page.click('#rv-keep-msg [data-act="keep-undo"]');
  await page.waitForFunction((n) => document.querySelector('#rv-keep-msg').textContent.indexOf('已复原刚才隐藏的 ' + n + ' 张') >= 0, hideN, { timeout: 15000 });
  const unhides = posts.filter((b) => b.op === 'unhide');
  assert.equal(unhides.length, 2);
  assert.ok(unhides.every((b) => b.photos.length <= 400));
  const idx2 = index(m);
  assert.deepEqual(sorted(Object.keys(idx2.photos).filter((h) => idx2.photos[h].hidden)), sorted(before));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('review space: delete hidden photos — needs the typed 删除, saves edits first, ≤ 1,000 per request, photos and Blob files gone, budget and log updated', async () => {
  const m = await mock(big);
  const { ctx, page } = await newPage(browser);
  const posts = postsOf(page);
  await openReview(page, m);
  const idx0 = index(m);
  const hidden = Object.keys(idx0.photos).filter((h) => idx0.photos[h].hidden || idx0.projects[idx0.photos[h].p].hidden);
  assert.equal(hidden.length, 1010 + 2);
  const keys = hidden.map((h) => idx0.photos[h].k);
  assert.ok(keys.every((k) => m.adapter.read(k)), 'files exist before');
  const budget0 = await page.textContent('#rv-budget');
  await openTidy(page);
  assert.match(await page.textContent('#rv-purge-info'), /已隐藏 1,012 张 · 约 [\d.]+ MB（2 个项目）/);
  assert.match(await page.textContent('#rv-purge-info'), /删掉后空间约 [\d.,]+ → [\d.,]+ \/ 950 MB/);
  assert.match(await page.textContent('#rv-purge'), /找不回来/);
  assert.match(await page.textContent('#rv-purge'), /旧方案.*空白/);
  // 没打「删除」：按不了
  assert.equal(await page.isDisabled('#rv-purge-go'), true);
  await page.fill('#rv-purge-word', '删');
  assert.equal(await page.isDisabled('#rv-purge-go'), true);
  await page.fill('#rv-purge-word', '删 除');
  assert.equal(await page.isDisabled('#rv-purge-go'), true);
  await page.fill('#rv-purge-word', 'delete');
  assert.equal(await page.isDisabled('#rv-purge-go'), true);
  // 先改一个标签（还没保存）：删之前要先送出去
  const keepH = big.P[A].hs[0];
  await page.selectOption('#rv-filters select[data-f="pid"]', big.P[A].pid);
  await page.click('#rv-grid .rv-card[data-h="' + keepH + '"]');
  await page.click('#drawer .chips[data-kind="room"] .chip[data-v="kitchen"]');
  await page.click('#drawer .dr-x');
  assert.equal(await page.evaluate(() => MB.clReview.unsaved()), 1);
  await page.fill('#rv-purge-word', '删除');
  assert.equal(await page.isDisabled('#rv-purge-go'), false);
  assert.match(await page.textContent('#rv-purge-go'), /删除 1,012 张隐藏的照片/);
  await page.click('#rv-purge-go');
  await page.waitForFunction(() => /已删除 1,012 张 · 空间约 [\d.,]+ \/ 950 MB/.test(document.querySelector('#rv-purge-msg').textContent), null, { timeout: 20000 });
  // 顺序：先 patch，再两批删除（1,000 + 12）
  const ops = posts.map((b) => b.op);
  assert.equal(ops[0], 'patch', ops.join(','));
  const purges = posts.filter((b) => b.op === 'purge');
  assert.deepEqual(purges.map((b) => b.photos.length), [1000, 12]);
  assert.ok(purges.every((b) => b.confirm === '删除'));
  assert.deepEqual(sorted([].concat(...purges.map((b) => b.photos))), sorted(hidden));
  // 伺服器：照片、整个删光的项目都不在了；Blob 档也删了
  const idx = await serverIndex(m);
  assert.ok(hidden.every((h) => !idx.photos[h]), 'purged photos are gone from the index');
  assert.equal(idx.projects[big.P[F].pid], undefined, 'project with every photo deleted is removed');
  assert.equal(idx.projects[big.P[C].pid].n, 9);
  assert.equal(idx.photos[keepH].room, 'kitchen', 'the unsaved edit was saved first');
  assert.ok(keys.every((k) => !m.adapter.read(k)), 'Blob files deleted');
  const gone = await fetch(m.blob + keys[0]);
  assert.equal(gone.status, 404);
  assert.equal(photoBlobs(m).length, Object.keys(idx.photos).length, 'the other photos are still there');
  assert.ok(idx.log.some((e) => e.op === 'purge' && e.by === 'Ana' && e.n === 1000));
  assert.ok(Array.isArray(idx.purged) && hidden.every((h) => idx.purged.indexOf(h) >= 0));
  // 画面：输入框清掉、数字更新、空间变小
  assert.equal(await page.inputValue('#rv-purge-word'), '');
  assert.equal(await page.isDisabled('#rv-purge-go'), true);
  assert.match(await page.textContent('#rv-purge-info'), /已隐藏 0 张/);
  const budget1 = await page.textContent('#rv-budget');
  assert.ok(spaceOf(budget1) < spaceOf(budget0) - 150, budget0 + ' → ' + budget1);
  const q = await page.evaluate(() => MB.cl.cat.quota);
  assert.ok(budget1.indexOf(await page.evaluate((n) => MB.cl.n(n), q.writes)) >= 0, 'budget shows the server count after the delete: ' + budget1);
  assert.match(await page.textContent('#rv-purge-last'), /上次删除：Ana · .* · 12 张/);
  // 最近修改：看得到是谁删的
  await page.click('#rv-logbtn');
  const log = await page.$$eval('#rv-log li', (els) => els.map((e) => e.textContent));
  assert.match(log[0], /Ana 删除 12 张/);
  assert.match(log[1], /Ana 删除 1,000 张/);
  assert.equal(await page.$$eval('#rv-log li.del', (els) => els.length), 2);
  assert.equal(await page.$('#rv-filters option[value="' + big.P[F].pid + '"]'), null, 'deleted project left the project list');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('review space: session lost before deleting → login overlay, then the delete goes on (by = the new login)', async () => {
  const m = await mock(small);
  const { ctx, page } = await newPage(browser);
  await openReview(page, m);
  await openTidy(page);
  await page.fill('#rv-purge-word', '删除');
  await ctx.clearCookies();
  await page.click('#rv-purge-go');
  await page.waitForSelector('#login.overlay:not([hidden])');
  assert.match(await page.textContent('#rv-purge-msg'), /登入过期/);
  assert.equal(Object.keys(index(m).photos).length, 40, 'nothing deleted without a session');
  await page.fill('#login-name', 'Ben');
  await page.fill('#login-pass', PASSWORD);
  await page.click('#login-go');
  await page.waitForFunction(() => /已删除 5 张/.test(document.querySelector('#rv-purge-msg').textContent), null, { timeout: 10000 });
  const idx = index(m);
  assert.equal(Object.keys(idx.photos).length, 35);
  assert.ok(idx.log.some((e) => e.op === 'purge' && e.by === 'Ben'));
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('review space: this month\'s writes used up (507) and store suspended (503 storage_blocked) → clear messages; hides are put back, nothing deleted', async () => {
  const m = await mock(small);
  const { pid } = small.P[A];
  const { ctx, page } = await newPage(browser);
  await openReview(page, m);
  await page.evaluate(() => { MB.cl.backoff = function () { return 30; }; });
  await hook(m, 'usage?writes=1995');
  await page.click('#rv-reload');
  await page.waitForFunction(() => document.querySelector('#rv-budget').classList.contains('over'));
  assert.match(await page.textContent('#rv-budget'), /1,995 \/ 1,800/);
  // 删除 → 507
  await openTidy(page);
  await page.fill('#rv-purge-word', '删除');
  await page.click('#rv-purge-go');
  await page.waitForFunction(() => /写入次数快用完了/.test(document.querySelector('#rv-purge-msg').textContent));
  const msg = await page.textContent('#rv-purge-msg');
  assert.match(msg, /为了不让 Vercel 停掉案例库/);
  assert.match(msg, /下个月 1 号/);
  assert.equal(Object.keys(index(m).photos).length, 40, 'nothing deleted');
  assert.equal(await page.inputValue('#rv-purge-word'), '', 'has to type 删除 again');
  // 只留最好的 → 507：画面改回去
  await page.selectOption('#rv-filters select[data-f="pid"]', pid);
  await page.click('#rv-proj [data-act="keep-proj"]');
  await page.click('#rv-ask [data-ask="ok"]');
  await page.waitForFunction(() => /写入次数快用完了/.test(document.querySelector('#rv-keep-msg').textContent));
  assert.match(await page.textContent('#rv-keep-msg'), /画面已经改回去/);
  assert.equal(hiddenIn(index(m), pid).length, 0);
  assert.equal(await page.evaluate((p) => Object.values(MB.cl.cat.photos).filter((ph) => ph.p === p && ph.hidden).length, pid), 0, 'hides put back on screen');
  await page.waitForFunction(() => document.querySelectorAll('#rv-grid .rv-card').length === 20);
  // store 被 Vercel 暂停
  await hook(m, 'usage?writes=10');
  m.setBlocked(true);
  try {
    await page.fill('#rv-purge-word', '删除');
    await page.click('#rv-purge-go');
    await page.waitForFunction(() => /案例库被 Vercel 暂停中，等恢复之后再删/.test(document.querySelector('#rv-purge-msg').textContent));
    await page.click('#rv-proj [data-act="keep-proj"]');
    await page.click('#rv-ask [data-ask="ok"]');
    await page.waitForFunction(() => /案例库被 Vercel 暂停中/.test(document.querySelector('#rv-keep-msg').textContent));
  } finally {
    m.setBlocked(false);
  }
  assert.equal(Object.keys(index(m).photos).length, 40);
  assert.equal(hiddenIn(index(m), pid).length, 0);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('review space: someone else un-hides a photo meanwhile → 400 not_hidden → reloaded and told; nothing deleted', async () => {
  const m = await mock(small);
  const { ctx, page } = await newPage(browser);
  await openReview(page, m);
  await openTidy(page);
  assert.match(await page.textContent('#rv-purge-info'), /已隐藏 5 张/);
  await page.fill('#rv-purge-word', '删除');
  // 另一个人（另一个视窗）复原了 C 的一张
  const other = await newPage(browser);
  await loginOk(other.page, m.url, 'Ben');
  const h = small.P[C].hs[10];
  const r = await other.page.evaluate((h) => fetch('/api/catalog', { method: 'POST', headers: { 'X-VISI': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'unhide', photos: [h] }) }).then((x) => x.status), h);
  assert.equal(r, 200);
  await other.ctx.close();
  await page.click('#rv-purge-go');
  await page.waitForFunction(() => /刚被别人复原了/.test(document.querySelector('#rv-purge-msg').textContent));
  assert.equal(Object.keys(index(m).photos).length, 40, 'nothing deleted');
  await page.waitForFunction(() => /已隐藏 4 张/.test(document.querySelector('#rv-purge-info').textContent), null, { timeout: 8000 });
  assert.equal(await page.inputValue('#rv-purge-word'), '');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('review space: 390 px wide → no sideways scrolling (budget, 整理空间, project bar, confirm box, drawer)', async () => {
  const m = await mock(small);
  await hook(m, 'usage?writes=1234');
  const { ctx, page } = await newPage(browser, { viewport: { width: 390, height: 844 } });
  await openReview(page, m);
  await noHScroll(page, 'review');
  await openTidy(page);
  await page.fill('#rv-purge-word', '删除');
  await noHScroll(page, 'tidy open');
  await page.screenshot({ path: shotPath('review-space-390.png'), fullPage: true });
  await page.selectOption('#rv-filters select[data-f="pid"]', small.P[A].pid);
  await page.waitForSelector('#rv-proj [data-act="keep-proj"]');
  await noHScroll(page, 'project bar');
  await page.click('#rv-proj [data-act="keep-proj"]');
  await page.waitForSelector('#rv-ask:not([hidden])');
  await noHScroll(page, 'confirm box');
  await page.screenshot({ path: shotPath('review-space-ask-390.png') });
  await page.click('#rv-ask [data-ask="ok"]');
  await page.waitForFunction(() => !MB.clReview.unsaved() && /已隐藏/.test(document.querySelector('#rv-keep-msg').textContent));
  await page.click('#rv-proj [data-act="proj-edit"]');
  await page.waitForSelector('#drawer [data-act="unhide-proj-photos"]');
  // 抽屉滑进来要 0.28 秒：滑好了再量
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#drawer')).transform === 'none');
  await noHScroll(page, 'project drawer');
  await page.screenshot({ path: shotPath('review-space-drawer-390.png') });
  await page.click('#drawer .dr-x');
  // 桌面截图（自己看版面用）
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: shotPath('review-space-1440.png') });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

/* ------------------------------------------------------------ */
test('review space: a project with ≤ N photos still keeps one per shot (same rule as the upload page)', async () => {
  const m = await mock(small);
  const { pid } = small.P[B];
  const { ctx, page } = await newPage(browser);
  const posts = postsOf(page);
  await openReview(page, m);
  await page.selectOption('#rv-filters select[data-f="pid"]', pid);
  await page.waitForFunction(() => document.querySelectorAll('#rv-grid .rv-card').length === 6);
  const exp = await expected(page, pid, 6);
  // 厨房、浴室各有一组连拍（dHash 只差 2 bit）：6 张里只有 4 个镜头
  assert.equal(exp.keep.length, 4);
  assert.equal(exp.hide.length, 2);
  const shots = await page.evaluate((hs) => hs.map((h) => MB.cl.cat.photos[h].shot), exp.keep.concat(exp.hide));
  assert.equal(new Set(shots).size, 4, 'each hidden photo shares a shot with a kept one');
  await page.click('#rv-proj [data-act="keep-proj"]');
  await page.waitForSelector('#rv-ask:not([hidden])');
  assert.match(await page.textContent('#rv-ask-num'), /会隐藏 2 张（可以复原），留下 4 张/);
  assert.match(await page.textContent('#rv-ask-num'), /同一个角度重复拍的/);
  await page.click('#rv-ask [data-ask="ok"]');
  await waitServer(() => hiddenIn(index(m), pid).length === 2);
  assert.deepEqual(sorted(hiddenIn(index(m), pid)), sorted(exp.hide));
  assert.equal(posts.filter((b) => b.op === 'hide').length, 1);
  // 再按一次：没有可以隐藏的了
  await page.waitForFunction(() => !MB.clReview.state().bulk);
  await page.click('#rv-proj [data-act="keep-proj"]');
  await page.waitForSelector('#rv-ask:not([hidden])');
  assert.match(await page.textContent('#rv-ask-num'), /4 张都留下.*不用隐藏/);
  assert.equal(await page.isDisabled('#rv-ask [data-ask="ok"]'), true);
  await page.click('#rv-ask [data-ask="no"]');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('review space: while a multi-batch delete runs, 复原 is refused (it would be deleted anyway); a restore that shows up in a newer list stops the next batch', async () => {
  const pidF = big.P[F].pid;
  // 1. 删除中：抽屉的「复原这个项目」按不了；硬按也不会改（不会出现「画面上复原了、伺服器照删」）
  {
    const m = await mock(big);
    const { ctx, page } = await newPage(browser);
    const posts = postsOf(page);
    await openReview(page, m);
    let held = false;
    await page.route('**/api/catalog', async (route) => {
      const req = route.request();
      if (req.method() === 'POST' && req.postDataJSON().op === 'purge' && !held) { held = true; await new Promise((r) => setTimeout(r, 4000)); }
      return route.continue();
    });
    await openTidy(page);
    await page.fill('#rv-purge-word', '删除');
    await page.click('#rv-purge-go');
    await page.waitForFunction(() => /删除中/.test(document.querySelector('#rv-purge-msg').textContent));
    // 业务改变主意：打开那个隐藏的项目想复原
    await page.check('#rv-filters input[data-f="hidden"]');
    await page.selectOption('#rv-filters select[data-f="pid"]', pidF);
    await page.click('#rv-proj [data-act="proj-edit"]');
    await page.waitForSelector('#drawer [data-act="hide-project"]');
    assert.match(await page.textContent('#drawer [data-act="hide-project"]'), /复原这个项目/);
    assert.equal(await page.isDisabled('#drawer [data-act="hide-project"]'), true, 'restore button is disabled while deleting');
    await page.evaluate(() => { const b = document.querySelector('#drawer [data-act="hide-project"]'); b.disabled = false; b.click(); });
    assert.equal(await page.evaluate((p) => !!MB.cl.cat.projects[p].hidden, pidF), true, 'not restored on screen');
    assert.equal(await page.evaluate(() => MB.clReview.unsaved()), 0, 'nothing queued');
    await page.waitForFunction(() => /正在删除隐藏的照片：等删完再隐藏或复原/.test(document.querySelector('#toast').textContent));
    await page.waitForFunction(() => /已删除 1,012 张/.test(document.querySelector('#rv-purge-msg').textContent), null, { timeout: 20000 });
    assert.equal(posts.filter((b) => b.op === 'unhide').length, 0);
    assert.equal((await serverIndex(m)).projects[pidF], undefined);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    assert.deepEqual(page.errors, []);
    await ctx.close();
  }
  // 2. 第 1 批送出去之后，别人复原了那个项目、这边重新载入看到了：第 2 批不送
  {
    const m = await mock(big);
    const { ctx, page } = await newPage(browser);
    const posts = postsOf(page);
    await openReview(page, m);
    let release, sent = false;
    const gate = new Promise((r) => { release = r; });
    await page.route('**/api/catalog', async (route) => {
      const req = route.request();
      if (req.method() === 'POST' && req.postDataJSON().op === 'purge' && !sent) {
        sent = true;
        const resp = await route.fetch();       // 伺服器已经删好第 1 批，回应先压着
        await gate;
        return route.fulfill({ response: resp });
      }
      return route.continue();
    });
    await openTidy(page);
    const total = Object.keys(index(m).photos).length;
    await page.fill('#rv-purge-word', '删除');
    await page.click('#rv-purge-go');
    await waitServer(() => Object.keys(index(m).photos).length === total - 1000);
    const other = await newPage(browser);
    await loginOk(other.page, m.url, 'Ben');
    const st = await other.page.evaluate((p) => fetch('/api/catalog', { method: 'POST', headers: { 'X-VISI': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'unhide', projects: [p] }) }).then((x) => x.status), pidF);
    assert.equal(st, 200);
    await other.ctx.close();
    await page.click('#rv-reload');
    await page.waitForFunction((p) => MB.cl.cat.projects[p] && !MB.cl.cat.projects[p].hidden, pidF);
    release();
    await page.waitForFunction(() => /刚被复原了/.test(document.querySelector('#rv-purge-msg').textContent), null, { timeout: 15000 });
    const msg = await page.textContent('#rv-purge-msg');
    assert.match(msg, /有 \d+ 张刚被复原了，所以后面的没删（已经删好的 1,000 张不受影响）/);
    assert.equal(posts.filter((b) => b.op === 'purge').length, 1, 'the second batch was never sent');
    const idx = await serverIndex(m);
    assert.ok(idx.projects[pidF] && !idx.projects[pidF].hidden, 'restored project is still there');
    assert.ok(Object.keys(idx.photos).filter((h) => idx.photos[h].p === pidF).length >= 10);
    assert.equal(await page.inputValue('#rv-purge-word'), '');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    assert.deepEqual(page.errors, []);
    await ctx.close();
  }
});

test('review space: the typed 删除 confirms only the hidden photos shown at that moment; Enter in the box never deletes', async () => {
  const m = await mock(small);
  const { ctx, page } = await newPage(browser);
  const posts = postsOf(page);
  await openReview(page, m);
  await openTidy(page);
  await page.fill('#rv-purge-word', '删除');
  assert.equal(await page.isDisabled('#rv-purge-go'), false);
  assert.match(await page.textContent('#rv-purge-go'), /删除 5 张隐藏的照片/);
  // Enter（例如输入法选字的那一下）：不删
  await page.press('#rv-purge-word', 'Enter');
  await page.waitForTimeout(500);
  assert.equal(posts.filter((b) => b.op === 'purge').length, 0, 'Enter does not delete');
  assert.equal(Object.keys(index(m).photos).length, 40);
  // 重新载入（隐藏的一样）：「删除」还在
  await page.click('#rv-reload');
  await page.waitForFunction(() => /已重新载入/.test(document.querySelector('#toast').textContent));
  assert.equal(await page.inputValue('#rv-purge-word'), '删除');
  assert.equal(await page.isDisabled('#rv-purge-go'), false);
  // 又隐藏了一张：刚才打的「删除」不算了
  const h = small.P[B].hs[0];
  await page.click('#rv-grid .rv-card[data-h="' + h + '"]');
  await page.click('#drawer [data-act="hide-photo"]');
  await page.click('#drawer .dr-x');
  assert.equal(await page.inputValue('#rv-purge-word'), '');
  assert.equal(await page.isDisabled('#rv-purge-go'), true);
  assert.match(await page.textContent('#rv-purge-msg'), /隐藏的照片变了（现在 6 张）：要删的话再打一次「删除」/);
  assert.match(await page.textContent('#rv-purge-go'), /删除 6 张隐藏的照片/);
  // 再打一次就可以删：还没送出的隐藏先送，再删 6 张
  await page.fill('#rv-purge-word', '删除');
  await page.click('#rv-purge-go');
  await page.waitForFunction(() => /已删除 6 张/.test(document.querySelector('#rv-purge-msg').textContent), null, { timeout: 10000 });
  const ops = posts.map((b) => b.op);
  assert.deepEqual(ops, ['hide', 'purge'], ops.join(','));
  assert.equal(posts[1].photos.length, 6);
  assert.equal(index(m).photos[h], undefined);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('review space: tag edits that cannot be saved (507 writes used up, 503 store suspended) are kept, not retried forever, explained in plain words, and do not block the delete', async () => {
  const m = await mock(small);
  const { ctx, page } = await newPage(browser);
  const posts = postsOf(page);
  const patches = () => posts.filter((b) => b.op === 'patch').length;
  await openReview(page, m);
  // 重试、自动保存都调快：真的一直重试的话一秒就会送很多次
  await page.evaluate(() => { MB.cl.backoff = function () { return 30; }; MB.clReview.idleMs = 60; MB.clReview.maxWaitMs = 120; });
  // 1,960：改标签（1,950 起）不收了，删除（1,990 前）还可以
  await hook(m, 'usage?writes=1960');
  await page.click('#rv-reload');
  await page.waitForFunction(() => /1,960/.test(document.querySelector('#rv-budget').textContent));
  const h = small.P[A].hs[0];
  await page.selectOption('#rv-filters select[data-f="pid"]', small.P[A].pid);
  await page.click('#rv-grid .rv-card[data-h="' + h + '"]');
  await page.click('#drawer .chips[data-kind="room"] .chip[data-v="kitchen"]');
  await page.click('#drawer .dr-x');
  await page.waitForFunction(() => /写入次数用完了，改的标签先存不进去/.test(document.querySelector('#rv-save .msg').textContent));
  const save = await page.textContent('#rv-save .msg');
  assert.match(save, /按「保存」/);
  assert.doesNotMatch(save, /507|quota|storage|[（(]\d{3}/, 'no codes on screen: ' + save);
  const n0 = patches();
  assert.equal(n0, 1);
  await page.waitForTimeout(1200);
  assert.equal(patches(), n0, 'no automatic retries');
  assert.equal(await page.evaluate(() => MB.clReview.unsaved()), 1, 'the edit is kept on the page');
  // 再改一个：也不会自动送
  await page.click('#rv-grid .rv-card[data-h="' + small.P[A].hs[1] + '"]');
  await page.click('#drawer .chips[data-kind="room"] .chip[data-v="kitchen"]');
  await page.click('#drawer .dr-x');
  await page.waitForTimeout(600);
  assert.equal(patches(), n0);
  // 删除照样可以（删除就是这时候要做的事）
  await openTidy(page);
  await page.fill('#rv-purge-word', '删除');
  await page.click('#rv-purge-go');
  await page.waitForFunction(() => /已删除 5 张/.test(document.querySelector('#rv-purge-msg').textContent), null, { timeout: 10000 });
  assert.match(await page.textContent('#rv-purge-msg'), /改的标签还没存进去/);
  assert.equal(Object.keys(index(m).photos).length, 35);
  assert.equal(patches(), n0, 'no extra try before deleting (it cannot be saved this month)');
  await page.waitForTimeout(800);
  assert.equal(patches(), n0, 'no loop after the delete either');
  assert.equal(await page.evaluate(() => MB.clReview.unsaved()), 2);
  assert.equal(await page.evaluate((h) => MB.cl.cat.photos[h].room, h), 'kitchen', 'still shown after the reload');
  // store 被暂停：一样不重试、讲白话
  await hook(m, 'usage?writes=10');
  m.setBlocked(true);
  try {
    await page.click('#rv-savebtn');
    await page.waitForFunction(() => /案例库被 Vercel 暂停中，改的标签先存不进去/.test(document.querySelector('#rv-save .msg').textContent));
    const n1 = patches();
    await page.waitForTimeout(1000);
    assert.equal(patches(), n1, 'no automatic retries while suspended');
    assert.doesNotMatch(await page.textContent('#rv-save .msg'), /503|storage_blocked/);
  } finally {
    m.setBlocked(false);
  }
  // 恢复之后按「保存」：存进去
  await page.click('#rv-savebtn');
  await page.waitForFunction(() => MB.clReview.unsaved() === 0 && /已保存/.test(document.querySelector('#rv-save .msg').textContent));
  assert.equal(index(m).photos[h].room, 'kitchen');
  assert.equal(index(m).photos[small.P[A].hs[1]].room, 'kitchen');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});
