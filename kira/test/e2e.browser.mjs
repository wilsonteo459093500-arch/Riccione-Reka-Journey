// 浏览器端到端（Playwright，已装 Chromium）：npm run build && npm run preview（另开）→ npm run test:browser
//   KIRA_URL=http://localhost:5182 node test/e2e.browser.mjs [--video]
// --video：顺便录 30 秒示范短视频到 public/help/kira-demo.webm（给新人看）
import { createRequire } from 'module';
import { mkdirSync, renameSync, existsSync, readdirSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const URL = process.env.KIRA_URL || 'http://localhost:5182/';
const VIDEO = process.argv.includes('--video');
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');
mkdirSync(outDir, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`); };
const rm = (s) => Number(String(s).replace(/[^\d.]/g, ''));

const browser = await chromium.launch();
try {
  // ---------- 电脑：新客户 → 楼高 → 衣柜 1.2 m → 报价单有小图 ----------
  const vidDir = path.join(outDir, 'video');
  if (VIDEO) { rmSync(vidDir, { recursive: true, force: true }); mkdirSync(vidDir, { recursive: true }); }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, ...(VIDEO ? { recordVideo: { dir: vidDir, size: { width: 1280, height: 800 } } } : {}) });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const slow = (ms) => (VIDEO ? p.waitForTimeout(ms * 2) : Promise.resolve()); // 录影放慢一倍，新人看得清

  await p.goto(URL);
  await slow(1200);
  await p.getByRole('button', { name: /Skip 跳过/ }).click();
  await p.getByRole('button', { name: /New/ }).first().click();
  await slow(500);
  await p.locator('input').nth(1).fill('Mr Tan 陈先生');
  await p.locator('input[type=tel]').fill('012-345 6789');
  await slow(600);
  const ceiling = p.locator('input[placeholder="2.70"]').first();
  await ceiling.fill('2.7');
  await ceiling.blur();
  await p.locator('select').first().selectOption({ label: 'Master Bedroom 主卧' });
  await slow(500);
  await p.getByRole('button', { name: /Add cabinet 加柜子/ }).first().click();
  await slow(700);
  await p.getByRole('button', { name: /衣柜 Wardrobe/ }).click();
  await slow(900);
  const width = p.locator('label:has-text("Width 总宽") input');
  await width.fill('1.2');
  await width.press('Enter');
  await slow(900);
  await p.getByRole('button', { name: /立体 3D/ }).click();
  await slow(600);
  await p.locator('input[type=range]').fill('-15');
  await slow(900);
  const total = rm(await p.locator('text=这个柜子').locator('xpath=../div[2]').textContent());
  // 1.2 × 2.7 × (530 + 1080) + 两侧见光板 2 × 0.6 × 2.7 × 530 = 6933.6 → RM 6,934
  check('wardrobe 1.2 × 2.7 m price = RM 6,934 (old-tool rules)', total === 6934, `got ${total}`);
  await p.getByRole('button', { name: /Add 加入报价/ }).click();
  await slow(800);
  check('cabinet card appears with code K1', (await p.locator('text=K1').count()) > 0);
  await p.getByRole('button', { name: /Quote 报价单/ }).click();
  await slow(1500);
  const pics = await p.locator('.quote-print-sheet .kira-pics svg').count();
  check('quotation shows elevation + 3D beside the lines', pics >= 2, `${pics} svg`);
  const sheetText = await p.locator('.quote-print-sheet').textContent();
  check('quotation lists K1 with door / carcass / side panel lines', /K1/.test(sheetText) && /Carcass/.test(sheetText) && /Side Panel/.test(sheetText));
  await p.locator('.quote-print-sheet').screenshot({ path: path.join(outDir, 'quote-sheet.png') });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.getByRole('button', { name: /Long image/ }).click()]);
  check('long image downloads', /\.png$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  await slow(800);
  check('no browser errors (desktop)', errors.length === 0, errors.join(' | '));
  await ctx.close();
  if (VIDEO) {
    const f = readdirSync(vidDir).find((x) => x.endsWith('.webm'));
    const dest = path.join(here, '..', 'public', 'help');
    mkdirSync(dest, { recursive: true });
    if (f) { renameSync(path.join(vidDir, f), path.join(dest, 'kira-demo.webm')); console.log('  ▶ video → public/help/kira-demo.webm'); }
  }

  // ---------- 手机：底部 tab + 示范报价 + 厨房 L 型 ----------
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const merr = [];
  m.on('pageerror', (e) => merr.push(e.message));
  await m.goto(URL);
  await m.getByRole('button', { name: /Skip 跳过/ }).click();
  await m.getByRole('button', { name: /Demo 示范报价/ }).first().click();
  check('phone bottom tabs', (await m.getByRole('button', { name: /设计 Design/ }).count()) === 1);
  await m.getByText('Edit 编辑').nth(1).click();
  const kitchen3d = await m.getByRole('button', { name: /立体 3D/ });
  await kitchen3d.click();
  check('kitchen L 3D renders', (await m.locator('svg polygon').count()) > 50);
  await m.screenshot({ path: path.join(outDir, 'phone-kitchen-3d.png') });
  check('no browser errors (phone)', merr.length === 0, merr.join(' | '));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
process.exit(failed ? 1 : 0);
