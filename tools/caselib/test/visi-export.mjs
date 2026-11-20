/* ============================================================
   VISI 体检计划第 3 阶段 · 浏览器测试
   node --test tools/caselib/test/visi-export.mjs
   1. 案例库（本机模式）多选 →「导出给 VISI」→ zip：照片没有拍摄资料、json 没有客户名字 / 项目名 / 档名，
      tools/visi/import-builtin.mjs 检查全部合格
   2. VISI 图库「老板审图」：没登入开不了；登入后按「不发」→ 图库看不到、存在这台电脑、清单复制得出来；「放回」回来
   截图存到 $VISI_SHOTS（有设才存）
   ============================================================ */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMock } from '../mock-server.mjs';
import { fixtures, launch, selectFolder, waitHashed, startAndWait, PASSWORD } from './upload-kit.mjs';
import { check, jpegMeta } from '../../visi/import-builtin.mjs';
import { loadVisi } from '../../visi/test/load.mjs';

let browser, info, m;
const SHOTS = process.env.VISI_SHOTS || '';
const BAD = ['陈先生', '林太太', 'Mr Tan', '测试客户', '黄小姐', 'Mdm Lee', 'Setia Alam', 'M Vertica', 'Bangsar', 'Cheras', 'Kepong',
  '厨房/', '主卧/', 'IMG_0', 'K_01', 'B_01', 'local-cases'];

before(async () => {
  info = await fixtures();
  m = await startMock({ port: 0, blobPort: 0, password: PASSWORD });
  browser = await launch();
});
after(async () => {
  if (browser) await browser.close();
  if (m) await m.close();
});

async function ctxPage(viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 900 }, acceptDownloads: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.errors = [];
  page.dialogs = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('dialog', (d) => { page.dialogs.push(d.message()); d.accept(); });
  return { ctx, page };
}

test('案例库「导出给 VISI」：zip 里的照片没有拍摄资料，清单没有客户名字，导入脚本检查全部合格', async () => {
  const { ctx, page } = await ctxPage();
  await page.goto(m.url + '/caselib');
  await page.waitForSelector('#login:not([hidden])');
  if (await page.getAttribute('#mode-local', 'aria-pressed') !== 'true') await page.click('#mode-local');
  await page.fill('#login-name', 'Ana');
  await page.click('#login-go');
  await page.waitForSelector('#tabs:not([hidden])', { timeout: 20000 });
  await page.click('#tabs [data-tab="upload"]');
  await selectFolder(page, info.root);
  await waitHashed(page);
  await startAndWait(page);

  await page.click('#tabs [data-tab="review"]');
  await page.waitForSelector('#rv-grid .rv-card');
  await page.click('[data-multi="on"]');
  await page.click('[data-multi="page"]');
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'caselib-export-bar.png'), clip: { x: 0, y: 0, width: 1440, height: 900 } });
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.click('[data-multi="visi"]');
  const file = await dl;
  assert.match(page.dialogs[0], /导出 \d+ 张给 VISI 内置图库/);
  assert.match(page.dialogs[0], /不导出 \d+ 张：还没分空间/, '没分空间的照片另外说');
  assert.match(page.dialogs[0], /不会带出去：客户名字/);
  assert.match(file.suggestedFilename(), /^visi-内置图库-\d{8}-\d+张\.zip$/);
  const zip = join(mkdtempSync(join(tmpdir(), 'visi-zip-')), 'x.zip');
  await file.saveAs(zip);
  const dir = mkdtempSync(join(tmpdir(), 'visi-unzip-'));
  execFileSync('unzip', ['-q', zip, '-d', dir]);
  const listing = execFileSync('unzip', ['-Z1', zip]).toString();
  const raw = readFileSync(join(dir, 'visi-photos.json'), 'utf8');
  for (const w of BAD) {
    assert.ok(!raw.includes(w), 'json 漏出：' + w);
    assert.ok(!listing.includes(w), 'zip 档名漏出：' + w);
  }
  const man = JSON.parse(raw);
  assert.ok(man.photos.length >= 2);
  for (const p of man.photos) assert.deepEqual(jpegMeta(readFileSync(join(dir, p.file))), [], p.file + ' 还有拍摄资料');
  const res = check(loadVisi(), dir, man, { includeUnsure: true });
  assert.deepEqual(res.bad, []);
  assert.equal(res.ok.length, man.photos.length);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('VISI「老板审图」：要登入；不发 → 图库看不到、清单复制得出来；放回就回来', async () => {
  const { ctx, page } = await ctxPage();
  await page.goto(m.url + '/visi');
  await page.waitForFunction(() => window.MB && MB.bossHidden);
  await page.click('[data-tab="library"]');
  await page.click('#boss-start');
  await page.waitForFunction(() => /要先用团队密码登入/.test(document.querySelector('#toast').textContent));
  assert.equal(await page.isHidden('#boss-tools'), true, '没登入开不了');

  const st = await page.evaluate((pw) => fetch('api/session', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-VISI': '1' }, body: JSON.stringify({ name: 'Boss', password: pw }) }).then((r) => r.status), PASSWORD);
  assert.equal(st, 200);
  await page.click('#boss-start');
  await page.waitForSelector('#boss-tools:not([hidden])');
  await page.waitForSelector('[data-boss-hide]');
  // 系列页专用的官方照片没有「不发」
  assert.equal(await page.locator('.lib-item.reserved [data-boss-hide]').count(), 0);
  const ref = await page.locator('.lib-item:has([data-boss-hide])').first().getAttribute('data-ref');
  await page.locator(`.lib-item[data-ref="${ref}"] [data-boss-hide]`).click();
  await page.waitForSelector(`.lib-item.boss-off[data-ref="${ref}"]`);
  assert.equal(await page.textContent('#boss-count'), '不发 1 张');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('visi.bossHidden.v1')));
  assert.deepEqual(Object.keys(saved), [ref]);
  const inLib = await page.evaluate((r) => MB.allImages([]).some((im) => im.ref === r), ref);
  assert.equal(inLib, false, '图库、自动配图看不到');
  if (SHOTS) {
    await page.locator('#boss-panel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(SHOTS, 'visi-boss-review.png'), fullPage: false });
    await page.locator(`.lib-item.boss-off[data-ref="${ref}"]`).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(SHOTS, 'visi-boss-hidden.png'), fullPage: false });
  }
  await page.click('#boss-copy');
  const txt = await page.inputValue('#boss-out');
  assert.match(txt, /^VISI 老板审图 · \d{4}-\d{2}-\d{2} · 不发 1 张\n/);
  assert.ok(txt.includes(ref));

  // 重新整理还在
  await page.reload();
  await page.waitForFunction(() => window.MB && MB.bossHidden);
  assert.equal(await page.evaluate((r) => MB.photoRetired(r) && MB.retiredKind(r), ref), 'boss');
  await page.click('[data-tab="library"]');
  await page.click('#boss-start');
  await page.locator(`.lib-item.boss-off[data-ref="${ref}"] [data-boss-show]`).click();
  await page.waitForSelector(`.lib-item:not(.boss-off)[data-ref="${ref}"]`);
  assert.equal(await page.evaluate((r) => MB.photoRetired(r), ref), false);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('VISI 图库：空间按钮的数字不算系列页专用的照片（选不进去的）', async () => {
  const { ctx, page } = await ctxPage();
  await page.goto(m.url + '/visi');
  await page.waitForFunction(() => window.MB && MB.allImages);
  await page.click('[data-tab="library"]');
  const r = await page.evaluate(() => {
    const all = MB.allImages([]);
    const want = all.filter((im) => !im.reserved && im.rooms.includes('kitchen')).length;
    const btn = document.querySelector('#lib-filter [data-filter="kitchen"]');
    const tiles = [...document.querySelectorAll('#lib-grid .lib-item')];
    return { want, label: btn && btn.textContent, reservedLast: tiles.findIndex((t) => t.classList.contains('reserved')) };
  });
  assert.equal(r.label, '厨房 ' + r.want);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});
