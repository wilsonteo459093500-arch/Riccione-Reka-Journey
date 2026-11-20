/* ============================================================
   案例库云端模式改存 Supabase：浏览器测试
   node --test tools/caselib/test/supabase-cloud.mjs
   - 伺服器用正式的 supabaseAdapter 打「假的 Supabase」（真的 HTTP：tools/caselib/fake-supabase.mjs）
   - 登入（团队密码）→ 上传页写「云端案例库（Supabase）· 没有每月的次数限制」→ 拖文件夹上传
   - 照片、缩图包存进 bucket；清单只在资料表（不公开）
   - 审核页额度那行写 Supabase；缩图从 Supabase 的公开网址载得出来；改标签、隐藏、删除（bucket 的档也删掉）
   名字都是假的（upload-fixtures.py 的「测试客户」）
   ============================================================ */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMock } from '../mock-server.mjs';
import { startFakeSupabase } from '../fake-supabase.mjs';
import { fixtures, launch, newPage, loginOk, selectFolder, waitHashed, startAndWait, shotPath, PASSWORD } from './upload-kit.mjs';

let browser, info, m, sb;
before(async () => {
  info = await fixtures();
  sb = await startFakeSupabase();
  m = await startMock({ port: 0, blobPort: 0, password: PASSWORD, supabase: sb });
  browser = await launch();
});
after(async () => {
  if (browser) await browser.close();
  if (m) await m.close();
  if (sb) await sb.close();
});

async function waitFor(fn, ms, what) {
  const end = Date.now() + (ms || 15000);
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out: ' + (what || fn));
    await new Promise((r) => setTimeout(r, 150));
  }
}
const indexRow = () => [...sb.rows.values()].find((r) => /^catalog\/.+\/index\.json$/.test(r.path));
const index = () => { const r = indexRow(); return r ? JSON.parse(r.body) : null; };

test('cloud mode on Supabase: upload a folder, photos land in the bucket, review shows them from Supabase, tag / hide / delete work', async () => {
  const { ctx, page } = await newPage(browser);
  page.on('dialog', (d) => d.accept());
  await loginOk(page, m.url, 'Ana');
  assert.equal(await page.evaluate(() => MB.cl.cat.quota.plan), 'supabase');

  // ---- 上传页：只看空间，没有每月的次数限制 ----
  await page.click('#tabs [data-tab="upload"]');
  await selectFolder(page, info.curate);
  await waitHashed(page);
  const box = await page.textContent('.budget');
  assert.match(box, /云端案例库（Supabase）/);
  assert.match(box, /没有每月的次数限制/);
  assert.doesNotMatch(box, /写入次数 \/ 月|Vercel/);
  await page.screenshot({ path: shotPath('supabase-upload.png') });
  await startAndWait(page);

  let idx = index();
  const hs = Object.keys(idx.photos);
  assert.equal(hs.length, 14);
  assert.equal(idx.base, sb.url + '/storage/v1/object/public/visi-cases/');
  hs.forEach((h) => assert.ok(sb.objects.has(idx.photos[h].k), 'photo in bucket: ' + idx.photos[h].k));
  assert.ok([...sb.objects.keys()].some((k) => k.startsWith('t/')), 'thumb packs in bucket');
  assert.ok(![...sb.objects.keys()].some((k) => k.startsWith('catalog/')), 'index never in the public bucket');

  // ---- 审核页 ----
  await page.evaluate(() => { MB.clReview.hideMs = 200; MB.clReview.idleMs = 400; });
  await page.click('#tabs [data-tab="review"]');
  await page.waitForSelector('#rv-grid .rv-card');
  await page.waitForFunction(() => /^云端（Supabase）· 空间约 .+ \/ 700 MB/.test(document.querySelector('#rv-budget').textContent));
  // 打开一张：大图从 Supabase 的公开网址载得出来
  const h0 = hs.sort()[0];
  await page.click('#rv-grid .rv-card[data-h="' + h0 + '"]');
  const full = await page.getAttribute('#drawer .dr-img img', 'data-full');
  assert.ok(full && full.startsWith(sb.url + '/storage/v1/object/public/visi-cases/c/'), full);
  await page.evaluate((u) => { document.querySelector('#drawer .dr-img img').src = u; }, full);
  await page.waitForFunction(() => document.querySelector('#drawer .dr-img img').naturalWidth > 0);
  // 改标签 → 存进 Supabase 的清单
  await page.click('#drawer .chips[data-kind="cabinets"] .chip[data-v="wardrobe"]');
  await page.click('#rv-savebtn');
  await waitFor(() => { const i = index(); return i && i.photos[h0].cabinets.indexOf('wardrobe') >= 0 && i.photos[h0].status === 'confirmed'; }, 10000, 'tag saved');
  // 隐藏 → 删除：bucket 里的档也删掉
  const k0 = index().photos[h0].k;
  await page.click('#drawer [data-act="hide-photo"]');
  await waitFor(() => { const i = index(); return i && i.photos[h0].hidden; }, 10000, 'hidden');
  await page.click('#drawer .dr-x');
  const tidyOpen = await page.getAttribute('#rv-tidy-head', 'aria-expanded');
  if (tidyOpen !== 'true') await page.click('#rv-tidy-head');
  assert.match(await page.textContent('#rv-tidy-why'), /云端案例库（Supabase）：没有每月的次数限制/);
  await page.fill('#rv-purge-word', '删除');
  await page.click('#rv-purge-go');
  await page.waitForFunction(() => /已删除 1 张/.test(document.querySelector('#rv-purge-msg').textContent), null, { timeout: 15000 });
  assert.ok(!sb.objects.has(k0));
  assert.ok(!index().photos[h0]);
  await page.screenshot({ path: shotPath('supabase-review.png') });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});
