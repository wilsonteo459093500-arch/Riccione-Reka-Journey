// 浏览器测试：每个模板 × full / empty → 生成 PDF + 手机宽度预览截图（npm run test:browser）
// 产物：test/out/<id>-<variant>.pdf、test/out/<id>-preview.png
// 用法：node test/browser.mjs [模板 id 子串]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'out');
mkdirSync(OUT, { recursive: true });
const only = process.argv[2];
const VARIANTS = (process.env.VARIANTS || 'full,empty').split(',');

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const require = createRequire(import.meta.url);
    for (const p of ['/opt/node22/lib/node_modules/playwright', 'playwright']) {
      try {
        return require(p);
      } catch {
        /* 下一个 */
      }
    }
    throw new Error('找不到 Playwright：npm i -g playwright 或设置 NODE_PATH');
  }
}

/** 逐个 import 模板（未写完 / 报错的跳过） */
async function templateIds() {
  const dir = join(ROOT, 'src', 'templates');
  const ids = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.js') || ['index.js', 'schema.js', 'helpers.js'].includes(f)) continue;
    try {
      const t = (await import(pathToFileURL(join(dir, f)).href)).default;
      if (t?.id && Array.isArray(t.sections)) ids.push({ id: t.id, stage: t.stage || 99 });
    } catch (e) {
      console.log(`  - 跳过 ${f}: ${e.message}`);
    }
  }
  return ids.sort((a, b) => a.stage - b.stage).map((x) => x.id);
}

const pdfPages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

const ids = (await templateIds()).filter((id) => !only || id.includes(only));
const { chromium } = await loadPlaywright();
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const BASE = (server.resolvedUrls?.local?.[0] || `http://127.0.0.1:${server.httpServer.address().port}/`).replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

let pass = 0;
let fail = 0;
try {
  for (const id of ids) {
    for (const variant of VARIANTS) {
      const label = `${id} › ${variant}`;
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'zh-CN' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`console: ${m.text()}`);
      });
      try {
        await page.goto(`${BASE}/test/harness.html?t=${encodeURIComponent(id)}&v=${variant}`);
        await page.getByText('与导出的 PDF 一致').waitFor({ timeout: 60000 });
        const previewPages = await page.locator('[data-page]').count();
        assert.ok(previewPages >= 1, '预览没有页面');
        if (variant === 'full') {
          await page.waitForTimeout(150);
          await page.screenshot({ path: join(OUT, `${id}-preview.png`), fullPage: true });
        }
        const b64 = await page.evaluate(() => window.__exportPdf());
        const buf = Buffer.from(b64, 'base64');
        assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-', '不是 PDF');
        const n = pdfPages(buf);
        assert.ok(n >= 1, 'PDF 没有页面');
        assert.equal(n, previewPages, `PDF 页数 ${n} ≠ 预览页数 ${previewPages}`);
        const ms = await page.evaluate(() => window.__exportMs);
        writeFileSync(join(OUT, `${id}-${variant}.pdf`), buf);
        // 每页一张图（发群用）：只抽第一个模板测，省时间
        if (id === ids[0] && variant === VARIANTS[0]) {
          const imgs = await page.evaluate(() => window.__exportImages());
          assert.equal(imgs.length, n, '图片张数 ≠ 页数');
          for (const b of imgs) assert.ok(b.startsWith('/9j/'), '不是 JPEG');
          writeFileSync(join(OUT, `${id}-page1.jpg`), Buffer.from(imgs[0], 'base64'));
        }
        assert.deepEqual(errors, [], errors.join('\n'));
        pass += 1;
        console.log(`  ✓ ${label}: ${n} 页 · ${(buf.length / 1024).toFixed(0)} KB · ${ms} ms`);
      } catch (e) {
        fail += 1;
        console.log(`  ✗ ${label}\n    ${e?.stack || e}${errors.length ? `\n    ${errors.join('\n    ')}` : ''}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${pass} passed, ${fail} failed · 产物在 test/out/`);
process.exit(fail ? 1 : 0);
