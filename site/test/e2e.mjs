// 端到端：用手机尺寸的浏览器把整个流程走一遍
//   设置 → 建项目 → 每种报告：判定 / 拍照 / 签名 → 导出 PDF / Word / Excel / 文案
// 需要 Playwright（npm run test:e2e），产物在 test/out/e2e/
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'out', 'e2e');
const ASSETS = join(ROOT, 'test', 'assets');
mkdirSync(OUT, { recursive: true });

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const g = execSync('npm root -g').toString().trim();
    return createRequire(join(g, 'noop.js'))('playwright');
  }
}

const only = process.argv[2];
const { chromium } = await loadPlaywright();
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5181, strictPort: false } });
await server.listen();
const BASE = server.resolvedUrls.local[0].replace(/\/$/, '');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  acceptDownloads: true,
  locale: 'zh-CN',
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
});

const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
const results = [];

try {
  await page.goto(`${BASE}/`);
  await page.getByText('今天做哪份报告').waitFor();
  await shot('00-home-empty');

  // 设置
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByPlaceholder('例：Wilson').fill('Wilson');
  await page.getByPlaceholder('例：016-3881819').fill('016-3881819');
  await page.getByText('已保存', { exact: true }).first().waitFor(); // 自动保存

  // 项目
  await page.getByRole('button', { name: '项目', exact: true }).click();
  await page.getByRole('button', { name: '新项目' }).click();
  await page.getByPlaceholder('例：Tuai Timur Residence').fill('Tuai Timur Residence');
  await page.getByPlaceholder('例：17-3').fill('17-3');
  await page.getByPlaceholder('例：Hailey').fill('Hailey');
  await page.getByPlaceholder('例：SO-2026-0917').fill('SO-2026-0917');
  await page.getByPlaceholder('门牌 / 路名 / 邮编 / 城市').fill('Unit 17-3, Tuai Timur Residence, Kuala Lumpur');
  await page.getByPlaceholder('https://maps.app.goo.gl/…').fill('https://maps.app.goo.gl/5icvqNRxPNDEBmcv7?g_st=ac');
  await page.getByPlaceholder('例：5').fill('5');
  await page.getByRole('button', { name: '保存项目' }).click();
  await page.getByText('Tuai Timur Residence 17-3（Hailey）').first().waitFor();
  await shot('01-projects');

  await page.getByRole('button', { name: '报告', exact: true }).click();
  await page.getByText('今天做哪份').waitFor();
  await shot('02-home');

  const cards = await page.locator('main section').first().locator('button.card').count();
  const allNames = await page.locator('main button.card div.text-\\[15px\\]').allTextContents();
  assert.ok(allNames.length >= 7, `首页应有 7 张报告卡片，实际 ${allNames.length}（${cards}）`);

  for (const name of allNames) {
    if (only && !name.includes(only)) continue;
    const tag = name.replace(/\s+/g, '');
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click();
    await page.getByRole('dialog').getByText('Tuai Timur Residence 17-3（Hailey）').first().click(); // 选项目
    await page.getByText('已自动保存').first().waitFor();

    // 判定：每个检查项点第一个选项（「完成」型则点勾）
    const itemCards = page.locator('[id^="item-"]');
    const n = await itemCards.count();
    for (let i = 0; i < n; i += 1) {
      const card = itemCards.nth(i);
      const opts = card.locator('div.mt-3.flex.gap-2 > button');
      if ((await opts.count()) > 0) {
        // 每 6 项点一次第二个选项（通常是「不合格 / 否」），并写备注
        const pickSecond = i % 6 === 3 && (await opts.count()) > 1;
        await opts.nth(pickSecond ? 1 : 0).click();
        if (pickSecond) {
          const ta = card.locator('textarea').first();
          if (await ta.count()) await ta.fill('左门板缝隙偏大，已安排明天调整 / 负责人 Ah Keong');
        }
      } else {
        const tick = card.getByRole('button', { name: '完成' });
        if (await tick.count()) await tick.click();
      }
    }

    // 拍照：第一个「相册」输入框塞两张照片
    const inputs = page.locator('input[type="file"][multiple][accept="image/*"]');
    if ((await inputs.count()) > 0) {
      await inputs.first().setInputFiles([join(ASSETS, 'photo1.jpg'), join(ASSETS, 'photo2.jpg')]);
      await page.waitForTimeout(800);
    }
    // 给第一个检查项也加照片
    if (n > 0) {
      const camBtn = itemCards.first().getByRole('button', { name: '照片' });
      if (await camBtn.count()) await camBtn.click();
      const itemInput = itemCards.first().locator('input[type="file"][multiple]');
      if (await itemInput.count()) {
        await itemInput.setInputFiles([join(ASSETS, 'photo3.jpg')]);
        await page.waitForTimeout(600);
      }
    }

    // 签名：第一个签名框
    const signBtn = page.getByRole('button', { name: '点此手写签名' }).first();
    if (await signBtn.count()) {
      await signBtn.scrollIntoViewIfNeeded();
      await signBtn.click();
      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + 30, box.y + box.height * 0.6);
      await page.mouse.down();
      for (let k = 0; k < 24; k += 1) {
        await page.mouse.move(box.x + 30 + k * 11, box.y + box.height * (0.6 + 0.2 * Math.sin(k / 2)));
      }
      await page.mouse.up();
      await page.getByRole('dialog').getByRole('button', { name: '确认签名', exact: true }).click();
      await page.waitForTimeout(400);
    }

    await page.waitForTimeout(700); // 自动保存
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(`10-${tag}-editor`);

    // 导出
    await page.getByRole('button', { name: /预览 & 导出|生成文案/ }).click();
    await page.getByRole('button', { name: /生成/ }).first().waitFor();
    await shot(`11-${tag}-export`);

    const row = { template: name, files: {} };
    if (await page.getByText('WhatsApp 文案').count()) {
      row.text = await page.locator('div.whitespace-pre-wrap').first().textContent();
      writeFileSync(join(OUT, `${tag}.txt`), row.text);
    }
    for (const ext of ['pdf', 'docx', 'xlsx']) {
      const card = page.locator(`[data-format="${ext}"]`);
      await card.getByRole('button', { name: /生成/ }).click();
      await card.getByRole('button', { name: /下载/ }).waitFor({ timeout: 90_000 });
      const [dl] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: /下载/ }).click()]);
      const path = join(OUT, `${tag}.${ext}`);
      await dl.saveAs(path);
      row.files[ext] = path;
    }
    results.push(row);
    await shot(`12-${tag}-exported`);

    // 回首页
    await page.goto(`${BASE}/#/`);
    await page.getByText('今天做哪份').waitFor();
  }

  // 复制一份（明天的日报）
  const menus = page.getByRole('button', { name: '更多' });
  if (await menus.count()) {
    await menus.first().click();
    await page.getByRole('button', { name: /照这份再写一份/ }).click();
    await page.getByText('已自动保存').first().waitFor();
    await shot('20-duplicated');
  }
  // ---- 回归：模拟手机上照片处理慢（每张 1.5 秒）----
  await page.goto(`${BASE}/#/`);
  await page.getByText('今天做哪份').waitFor();
  await page.evaluate(() => {
    const orig = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function slow(cb, ...a) {
      setTimeout(() => orig.call(this, cb, ...a), 1500);
    };
  });
  await page.getByRole('button', { name: /^安装质检清单/ }).first().click();
  await page.getByRole('dialog').getByText('Tuai Timur Residence 17-3（Hailey）').first().click();
  await page.getByText('已自动保存').first().waitFor();
  const card1 = page.locator('[id^="item-"]').nth(0);
  // ① 照片处理中点「不合格」并写备注 → 照片处理完不能把判定 / 备注冲掉
  await card1.getByRole('button', { name: '照片' }).click();
  await card1.locator('input[type="file"][multiple]').setInputFiles([join(ASSETS, 'photo4.jpg')]);
  await card1.locator('div.mt-3.flex.gap-2 > button').nth(1).click();
  await card1.locator('textarea').first().fill('门板缝隙过大，明天整改');
  await page.waitForTimeout(4000);
  assert.equal(await card1.locator('textarea').first().inputValue(), '门板缝隙过大，明天整改', '照片回写冲掉了备注');
  assert.match(await card1.locator('div.mt-3.flex.gap-2 > button').nth(1).getAttribute('class'), /bg-fail/, '照片回写冲掉了「不合格」');
  assert.ok((await card1.locator('img').count()) >= 1, '照片没加上');
  // ② 照片处理中直接返回 → 照片仍要存进报告
  const card2 = page.locator('[id^="item-"]').nth(1);
  await card2.getByRole('button', { name: '照片' }).click();
  await card2.locator('input[type="file"][multiple]').setInputFiles([join(ASSETS, 'photo5.jpg'), join(ASSETS, 'photo6.jpg'), join(ASSETS, 'photo7.jpg')]);
  await page.getByRole('button', { name: '返回' }).click();
  await page.getByText('今天做哪份').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await page.locator('main button', { hasText: '安装质检清单' }).filter({ hasText: '草稿' }).first().click();
  await page.getByText('已自动保存').first().waitFor();
  assert.equal(await page.locator('[id^="item-"]').nth(1).locator('img').count(), 3, '整批照片处理中离开，照片丢了');
  assert.equal(await page.locator('[id^="item-"]').nth(0).locator('textarea').first().inputValue(), '门板缝隙过大，明天整改');
  await shot('30-regression-slow-photo');
  console.log('✓ 回归：照片处理慢时判定 / 备注 / 照片都不丢');

  // ---- 回归：安卓拍照时内存不够、浏览器被系统关掉（模拟：点「拍照」后不选，直接重新加载）----
  const card6 = page.locator('[id^="item-"]').nth(6);
  const itemId = await card6.getAttribute('id');
  await card6.getByRole('button', { name: '照片' }).click();
  await Promise.all([page.waitForEvent('filechooser'), card6.getByRole('button', { name: '拍照', exact: true }).click()]);
  await page.reload();
  await page.getByText('刚才的照片没收到').waitFor();
  await shot('31-regression-camera-killed');
  await page.getByRole('button', { name: '知道了' }).click();
  await page.waitForTimeout(900);
  const box6 = await page.locator(`#${itemId}`).boundingBox();
  assert.ok(box6 && box6.y > 0 && box6.y < 844, `没有滚回原来的检查项（y=${box6?.y}）`);
  // 正常选好照片 → 重新加载不应误报
  await page.locator(`#${itemId}`).getByRole('button', { name: '照片' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator(`#${itemId}`).getByRole('button', { name: '相册', exact: true }).click()]);
  await chooser.setFiles([join(ASSETS, 'photo1.jpg')]);
  await page.locator(`#${itemId} img`).first().waitFor();
  await page.waitForTimeout(800);
  await page.reload();
  await page.getByText('已自动保存').first().waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.getByText('刚才的照片没收到').count(), 0, '正常选了照片，重新加载后却提示没收到');
  console.log('✓ 回归：拍照时页面被系统关掉会提示并滚回原处；正常选照片不误报');
} finally {
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  await server.close();
}

console.log(JSON.stringify({ templates: results.map((r) => [r.template, Object.keys(r.files)]), errors }, null, 2));
if (errors.length) {
  console.error(`\n${errors.length} 个浏览器错误`);
  process.exit(1);
}
console.log(`\n✓ e2e 完成：${results.length} 种报告，产物在 test/out/e2e/`);
