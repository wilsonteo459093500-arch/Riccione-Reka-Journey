/* ============================================================
   案例库 · 照文件夹名字分项目、标风格（浏览器测试，本机模式）
   node --test tools/caselib/test/folder-names.mjs
   公司的文件夹格式「日期-城市-客户-风格」，有的放在月份文件夹里（客户名字都是假的）：
     案例/2024年3月上海案例/202403上海-测试甲-简约现代+侘寂风/水吧柜-测试甲-1.jpg …
     案例/20180711-上海-测试丙-现代/…   案例/20210513-上海-测试丁-现代美式/…
   1. 新上传：月份文件夹自动拆开，一个客户的家一个项目；风格照名字（两种都标），档名「水吧柜」→ 餐边柜；新风格筛得到
   2. 旧资料（月份文件夹当成一个项目汇入的）：审核页「按文件夹名字整理」→ 先问要不要拆 → 拆成一个家一个项目，再照名字标；
      AI 标错的照片风格被名字盖掉；照片 id 不变
   ============================================================ */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startMock } from '../mock-server.mjs';
import { fixtures, launch, selectFolder, waitHashed, startAndWait, shotPath, PASSWORD, BASE } from './upload-kit.mjs';

async function waitFor(fn, ms, what) {
  const end = Date.now() + (ms || 15000);
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out: ' + (what || fn));
    await new Promise((r) => setTimeout(r, 150));
  }
}

let browser, info, m, root;
const MONTH = '2024年3月上海案例';
const JIA = '202403上海-测试甲-简约现代+侘寂风', YI = '202403上海-测试乙-奶油';
const BING = '20180711-上海-测试丙-现代', DING = '20210513-上海-测试丁-现代美式';

before(async () => {
  info = await fixtures();
  // 用精选测试图（每张都不一样）排出公司的文件夹结构
  root = join(BASE, 'company', '案例');
  rmSync(join(BASE, 'company'), { recursive: true, force: true });
  const src = (p) => join(info.curate, p);
  const put = (from, to) => { mkdirSync(join(root, to, '..'), { recursive: true }); copyFileSync(src(from), join(root, to)); };
  put(info.cheras + '/厨房/K_01.jpg', MONTH + '/' + JIA + '/水吧柜-测试甲-1.jpg');
  put(info.cheras + '/厨房/K_02.jpg', MONTH + '/' + JIA + '/客厅-测试甲-2.jpg');
  put(info.cheras + '/主卧/M_01.jpg', MONTH + '/' + YI + '/厨房/IMG_1.jpg');
  put(info.cheras + '/电视墙/T_01.jpg', MONTH + '/杂项/IMG_2.jpg');
  put(info.kepong + '/P_01.jpg', BING + '/IMG_3.jpg');
  put(info.kepong + '/P_03.jpg', DING + '/IMG_4.jpg');
  put(info.kepong + '/P_05.jpg', DING + '/书桌-设计师-测试丁-1.jpg');
  put(info.cheras + '/主卧/M_02.jpg', BING + '/衣柜-设计师-测试丙-2.jpg');
  put(info.cheras + '/电视墙/T_02.jpg', BING + '/玄关柜-设计师-测试丙-3.jpg');
  m = await startMock({ port: 0, blobPort: 0, password: PASSWORD });
  browser = await launch();
});
after(async () => {
  if (browser) await browser.close();
  if (m) await m.close();
});

async function ctxPage() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('dialog', (d) => { page.lastDialog = d.message(); d.accept(d.type() === 'prompt' ? '删除' : undefined); });
  await page.goto(m.url + '/caselib');
  await page.waitForSelector('#login:not([hidden])');
  if (await page.getAttribute('#mode-local', 'aria-pressed') !== 'true') await page.click('#mode-local');
  await page.fill('#login-name', 'Ana');
  await page.click('#login-go');
  await page.waitForSelector('#tabs:not([hidden])', { timeout: 20000 });
  await page.waitForFunction(() => MB.cl.cat && MB.cl.cat.quota && MB.cl.cat.quota.plan === 'local', null, { timeout: 20000 });
  return { ctx, page };
}
const localIndex = (page) => page.evaluate(() => fetch('/api/catalog?view=full', { cache: 'no-store' }).then((r) => r.json()));
const byName = (idx, name) => Object.keys(idx.projects).find((p) => idx.projects[p].name === name);
const photosOf = (idx, pid) => Object.keys(idx.photos).filter((h) => idx.photos[h].p === pid);

test('new upload: month folders split into one project per home, styles read from names (two kept), file names give cabinets', async () => {
  const { ctx, page } = await ctxPage();
  await page.click('#tabs [data-tab="upload"]');
  await selectFolder(page, root);
  await waitHashed(page);
  const names = await page.evaluate(() => MB.clUpload.state().scan.projects.map((p) => p.name).sort());
  assert.deepEqual(names, [BING, DING, JIA, YI, MONTH].sort(), 'month folder keeps only what is not a home');
  await startAndWait(page);
  const idx = await localIndex(page);
  const pj = byName(idx, JIA), pd = byName(idx, DING), pb = byName(idx, BING);
  assert.deepEqual([idx.projects[pj].style, idx.projects[pj].style2], ['modern', 'wabi']);
  assert.deepEqual([idx.projects[pd].style, idx.projects[pd].style2], ['modern', 'american']);
  assert.equal(idx.projects[pb].style, 'modern');
  const bar = photosOf(idx, pj).find((h) => /^水吧柜/.test(idx.photos[h].f));
  assert.deepEqual(idx.photos[bar].cabinets, ['sideboard']);
  assert.equal(idx.photos[bar].room, 'dining');
  // 客户名字不进任何标签
  const tags = JSON.stringify(Object.values(idx.photos).map((x) => [x.room, x.cabinets, x.style, x.style2]));
  assert.ok(!/测试/.test(tags));
  // 审核页：「美式」筛得到测试丁的两张，「微侘寂」筛得到测试甲的两张
  await page.click('#tabs [data-tab="review"]');
  await page.waitForSelector('#rv-grid .rv-card');
  await page.selectOption('#rv-filters select[data-f="style"]', 'american');
  await page.waitForFunction(() => document.querySelectorAll('#rv-grid .rv-card').length === 2);
  await page.selectOption('#rv-filters select[data-f="style"]', 'wabi');
  await page.waitForFunction(() => document.querySelectorAll('#rv-grid .rv-card').length === 2);
  assert.match(await page.textContent('#rv-grid .rv-card .cap em'), /现代简约 \+ 微侘寂/);
  await page.selectOption('#rv-filters select[data-f="style"]', '');
  // 项目资料：第二种风格那一排
  await page.selectOption('#rv-filters select[data-f="pid"]', pd);
  await page.click('#rv-proj [data-act="proj-edit"]');
  await page.waitForSelector('#drawer .chips[data-kind="pstyle2"] .chip.on[data-v="american"]');
  await page.screenshot({ path: shotPath('folder-names-project.png') });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('old data: a month folder imported as one project is split by 「按文件夹名字整理」, then tagged from names (AI styles overruled)', async () => {
  const { ctx, page } = await ctxPage();
  // 像以前那样：整个月份文件夹当一个项目汇入
  await page.click('#tabs [data-tab="upload"]');
  await selectFolder(page, join(root, MONTH));
  await page.click('[data-mode="single"]');
  await waitHashed(page);
  assert.deepEqual(await page.evaluate(() => MB.clUpload.state().scan.projects.map((p) => p.name)), [MONTH]);
  await startAndWait(page);
  let idx = await localIndex(page);
  const pm = byName(idx, MONTH);
  const hs = photosOf(idx, pm);
  assert.equal(hs.length, 4);
  // 假装 AI 之前把一张标成轻法式（机器标的：自动标签）
  const bar = hs.find((h) => /水吧柜/.test(idx.photos[h].f));
  await page.evaluate((h) => fetch('/api/catalog', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-VISI': '1' },
    body: JSON.stringify({ op: 'patch', source: 'auto', photos: { [h]: { style: 'french' } }, projects: {} }) }).then((r) => r.json()), bar);

  await page.click('#tabs [data-tab="review"]');
  await page.waitForSelector('#rv-grid .rv-card');
  await page.click('#rv-auto');
  await page.waitForFunction(() => /拆成了 2 个新项目/.test(document.querySelector('#rv-tags-msg').textContent), null, { timeout: 15000 });
  assert.match(page.lastDialog, /要拆成 2 个项目吗/);
  idx = await localIndex(page);
  const pj = byName(idx, JIA), py = byName(idx, YI);
  assert.ok(pj && py, 'two homes');
  assert.equal(idx.photos[bar].p, pj, 'same photo id, moved to its home');
  assert.equal(idx.photos[bar].f, '水吧柜-测试甲-1.jpg');
  assert.deepEqual([idx.projects[pj].style, idx.projects[pj].style2], ['modern', 'wabi']);
  assert.equal(idx.photos[bar].style, '', 'AI style overruled by the folder name');
  assert.deepEqual(idx.photos[bar].cabinets, ['sideboard']);
  assert.equal(idx.projects[py].style, 'cream');
  // 杂项留在月份项目
  assert.equal(photosOf(idx, pm).length, 1);
  // 再按一次：没有可以拆的，也不问
  page.lastDialog = '';
  await page.click('#rv-auto');
  await page.waitForFunction(() => /没有可以再按名字标的了|已按文件夹名字标好/.test(document.querySelector('#rv-tags-msg').textContent), null, { timeout: 15000 });
  assert.equal(page.lastDialog, '');
  await page.screenshot({ path: shotPath('folder-names-regroup.png') });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('product filter from file names; delete one photo, several picked photos, and a whole project', async () => {
  const { ctx, page } = await ctxPage();
  await page.click('#tabs [data-tab="upload"]');
  await selectFolder(page, root);
  await waitHashed(page);
  await startAndWait(page);
  let idx = await localIndex(page);
  const pb = byName(idx, BING), pd = byName(idx, DING), pj = byName(idx, JIA);
  const desk = photosOf(idx, pd).find((h) => /^书桌/.test(idx.photos[h].f));
  assert.equal(idx.photos[desk].product, '书桌');
  assert.deepEqual(idx.photos[desk].cabinets, [], 'a product outside the 15 cabinet kinds keeps only its product');
  const shoe = photosOf(idx, pb).find((h) => /^玄关柜/.test(idx.photos[h].f));
  assert.deepEqual([idx.photos[shoe].product, idx.photos[shoe].cabinets], ['玄关柜', ['shoe']]);
  // 客户名字、IMG 不会变成产品
  assert.ok(Object.values(idx.photos).every((x) => !x.product || /^(水吧柜|书桌|衣柜|玄关柜)$/.test(x.product)), JSON.stringify(Object.values(idx.photos).map((x) => x.product)));

  await page.click('#tabs [data-tab="review"]');
  await page.waitForSelector('#rv-grid .rv-card');
  const opts = await page.$$eval('#rv-filters select[data-f="prod"] option', (os) => os.map((o) => o.textContent));
  assert.ok(opts.some((t) => /^书桌（1）$/.test(t)) && opts.some((t) => /^水吧柜（1）$/.test(t)), opts.join(' | '));
  await page.selectOption('#rv-filters select[data-f="prod"]', '书桌');
  await page.waitForFunction(() => document.querySelectorAll('#rv-grid .rv-card').length === 1);
  await page.selectOption('#rv-filters select[data-f="prod"]', '');

  // 1. 照片上「删除这张」：照片和档案都没了
  const k = idx.photos[desk].k;
  const status = (key) => page.evaluate((k) => fetch('/local-cases/' + k, { cache: 'no-store' }).then((r) => r.status), key);
  assert.equal(await status(k), 200, 'file is there before deleting');
  await page.click('#rv-grid .rv-card[data-h="' + desk + '"]');
  await page.click('#drawer [data-act="delete-photo"]');
  await waitFor(async () => !(await localIndex(page)).photos[desk], 15000, 'photo deleted');
  assert.match(page.lastDialog, /删除这张照片/);
  assert.equal(await status(k), 404);

  // 2. 多选两张一起删
  idx = await localIndex(page);
  const two = photosOf(idx, pb).slice(0, 2);
  await page.click('#rv-multi [data-multi="on"]');
  for (const h of two) await page.click('#rv-grid .rv-card[data-h="' + h + '"]');
  assert.match(await page.textContent('#rv-multi'), /已选 2 张/);
  await page.screenshot({ path: shotPath('multi-delete.png') });
  await page.click('#rv-multi [data-multi="delete"]');
  await waitFor(async () => { const i = await localIndex(page); return two.every((h) => !i.photos[h]); }, 15000, 'picked deleted');
  await page.click('#rv-multi [data-multi="off"]');

  // 3. 删除整个项目（要打「删除」）：项目和它的照片都没了；别的家照样在
  idx = await localIndex(page);
  const jiaPhotos = photosOf(idx, pj);
  assert.ok(jiaPhotos.length >= 1);
  await page.selectOption('#rv-filters select[data-f="pid"]', pj);
  await page.click('#rv-proj [data-act="delete-project"]');
  await waitFor(async () => { const i = await localIndex(page); return !i.projects[pj] && jiaPhotos.every((h) => !i.photos[h]); }, 15000, 'project deleted');
  idx = await localIndex(page);
  assert.ok(idx.projects[pd] && photosOf(idx, pd).length >= 1, 'other homes untouched');
  for (const h of photosOf(idx, pd)) assert.equal(await status(idx.photos[h].k), 200, 'other homes keep their files');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});
