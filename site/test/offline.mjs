// 离线验证（生产构建 + service worker）：联网打开一次 → 断网 → 重开 App → 新建报告 → 预览 → 生成 PDF
// 先 npm run build；用法：node test/offline.mjs
import { preview } from 'vite';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return createRequire(join(execSync('npm root -g').toString().trim(), 'noop.js'))('playwright');
  }
}
const { chromium } = await loadPlaywright();
const server = await preview({ root: ROOT, preview: { port: 4183, strictPort: false }, logLevel: 'error' });
const BASE = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(`${BASE}/`);
  await page.getByText('今天做哪份报告').waitFor();
  // 等 SW 安装并预缓存完成
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    for (let i = 0; i < 100 && !reg.active; i += 1) await new Promise((r) => setTimeout(r, 100));
  });
  await page.waitForTimeout(1500);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const c = await caches.open(keys.find((k) => k.startsWith('site-')));
    return (await c.keys()).length;
  });
  assert.ok(cached >= 10, `预缓存文件太少：${cached}`);

  await ctx.setOffline(true);
  await page.reload();
  await page.getByText('今天做哪份报告').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: /^安装质检清单/ }).first().click();
  await page.getByRole('dialog').getByPlaceholder('例：Tuai Timur Residence').fill('Offline Test Condo');
  await page.getByRole('dialog').getByRole('button', { name: '保存项目' }).click();
  await page.getByText('已自动保存').first().waitFor();
  await page.locator('[id^="item-"]').nth(0).locator('div.mt-3.flex.gap-2 > button').nth(0).click();
  await page.getByRole('button', { name: /预览 & 导出/ }).click();
  await page.locator('[data-format="pdf"]').waitFor();
  await page.waitForSelector('[data-page]', { timeout: 20000 }); // 预览离线也能渲染
  await page.locator('[data-format="pdf"]').getByRole('button', { name: /生成/ }).click();
  await page.locator('[data-format="pdf"]').getByRole('button', { name: /下载/ }).waitFor({ timeout: 60000 });
  await page.locator('[data-format="xlsx"]').getByRole('button', { name: /生成/ }).click();
  await page.locator('[data-format="xlsx"]').getByRole('button', { name: /下载/ }).waitFor({ timeout: 60000 });
  console.log(`✓ 离线可用：预缓存 ${cached} 个文件；断网后打开 App、新建报告、预览、生成 PDF / Excel 都正常`);
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
if (errors.length) {
  console.error(errors);
  process.exit(1);
}
