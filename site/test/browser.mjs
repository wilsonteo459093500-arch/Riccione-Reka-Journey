// 浏览器测试：每个模板 × full / empty / long → 生成 PDF + 手机宽度预览截图（npm run test:browser）
// 每页内容都不能溢出（溢出 = 被裁掉）；long（超长备注 / 填写 / 单元格 / 多行文字）另查每段末尾标记都看得到、
// 手机预览缩放后分页和 PDF 一样。
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
const VARIANTS = (process.env.VARIANTS || 'full,empty,long').split(',');

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

/** 预览里每页内容框的溢出（scrollHeight > clientHeight = 有内容被裁掉） */
const overflowed = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-page-body]')]
      .map((b, i) => ({ page: i + 1, over: b.scrollHeight - b.clientHeight }))
      .filter((x) => x.over > 0),
  );

/** 标记文字是否在某页内容框的可见区域里（DOM 里有但被裁掉的不算） */
const invisibleMarkers = (page) =>
  page.evaluate(() =>
    (window.__longMarkers || []).filter(
      (mk) =>
        ![...document.querySelectorAll('[data-page-body]')].some((box) => {
          const cb = box.getBoundingClientRect();
          const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = walker.nextNode())) {
            const at = n.data.indexOf(mk);
            if (at < 0) continue;
            const rg = document.createRange();
            rg.setStart(n, at);
            rg.setEnd(n, at + mk.length);
            const r = rg.getBoundingClientRect();
            if (r.height > 0 && r.top >= cb.top - 1 && r.bottom <= cb.bottom + 1) return true;
          }
          return false;
        }),
    ),
  );

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
        const over = await overflowed(page);
        assert.deepEqual(over, [], `内容超出页面被裁掉：${JSON.stringify(over)}`);
        if (variant === 'long') {
          const marks = await page.evaluate(() => window.__longMarkers.length);
          assert.ok(marks > 0, 'long 变体没有标记');
          const missing = await invisibleMarkers(page);
          assert.deepEqual(missing, [], `长内容末尾看不到（被裁掉 / 丢了）：${missing.join(' ')}`);
          // 没封面的视频显示「视频 Video」占位、0 字节照片显示「照片缺失」占位（不是坏图）
          if (await page.evaluate(() => window.__model.blocks.some((b) => b.type === 'checklist'))) {
            assert.ok((await page.getByText('视频 Video', { exact: true }).count()) >= 1, '没封面的视频没有显示占位');
            assert.ok((await page.getByText('照片缺失 Missing', { exact: true }).count()) >= 1, '0 字节照片没有显示「缺失」');
          }
          // 手机预览缩放（343 / 366 / 390px 宽）和 PDF（不缩放）每页内容一样，包括几十页的全部超长报告
          const diffs = await page.evaluate(() => window.__scaleCheck());
          assert.deepEqual(diffs, [], `预览缩放后分页和 PDF 不一样：${diffs.join('；')}`);
        }
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
        assert.equal(await page.evaluate(() => window.__exportClipped), 0, 'PDF 里有内容被截断（clipped > 0）');
        writeFileSync(join(OUT, `${id}-${variant}.pdf`), buf);
        // 每页一张图（发群用）：只抽第一个模板测，省时间
        if (id === ids[0] && variant === VARIANTS[0]) {
          const imgs = await page.evaluate(() => window.__exportImages());
          assert.equal(imgs.length, n, '图片张数 ≠ 页数');
          for (const b of imgs) assert.ok(b.startsWith('/9j/'), '不是 JPEG');
          writeFileSync(join(OUT, `${id}-page1.jpg`), Buffer.from(imgs[0], 'base64'));
          // 截图失败：中文提示、不漏 html2canvas 克隆 iframe；偶发失败降分辨率重试成功
          const f = await page.evaluate(() => window.__exportFailures());
          assert.match(f.permanent, /内存不足/, `截图失败的提示不对：${f.permanent}`);
          assert.equal(f.leakedAfterPermanent, 0, '截图失败后留下了 html2canvas iframe');
          assert.equal(f.transient, 'ok', '偶发截图失败没有重试成功');
          assert.ok(f.transientRetried, '偶发截图失败没有走重试');
          assert.equal(f.leakedAfterTransient, 0, '重试后留下了 html2canvas iframe');
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
