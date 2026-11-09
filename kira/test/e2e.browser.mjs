// 浏览器端到端（Playwright，已装 Chromium）：npm run build && npm run preview（另开）→ npm run test:browser
//   KIRA_URL=http://localhost:5182 node test/e2e.browser.mjs [--video]
// --video：顺便录 30 秒示范短视频到 public/help/kira-demo.webm（给新人看）
import { createRequire } from 'module';
import { mkdirSync, renameSync, existsSync, readdirSync, rmSync, readFileSync } from 'fs';
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
  // 输出语言 EN（新客户默认）：WhatsApp 文字不夹中文（客户名「陈先生」是业务自己打的，不算）
  const HAN = /\p{Script=Han}/u;
  const wa = decodeURIComponent((await p.locator('a:has-text("WhatsApp")').getAttribute('href')).split('?text=')[1] || '');
  const waHan = wa.replace('陈先生', '').split('\n').filter((l) => HAN.test(l));
  check('EN WhatsApp text has no Chinese ("K1 Wardrobe · … · 2 doors")', !waHan.length && /K1 Wardrobe · 1\.20 × 2\.70 × 0\.60 m · 2 doors/.test(wa), waHan.join(' | '));
  await p.getByRole('button', { name: /Quote 报价单/ }).click();
  await slow(1500);
  const pics = await p.locator('.quote-print-sheet .kira-pics svg').count();
  check('quotation shows elevation + 3D beside the lines', pics >= 2, `${pics} svg`);
  const sheetText = await p.locator('.quote-print-sheet').textContent();
  check('quotation lists K1 with door / carcass / side panel lines', /K1/.test(sheetText) && /Carcass/.test(sheetText) && /Side Panel/.test(sheetText));
  check('EN quotation sheet (incl. picture labels) has no Chinese', !HAN.test(sheetText.replace('陈先生', '')), (sheetText.replace('陈先生', '').match(/\p{Script=Han}+/gu) || []).join(' '));
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
  await m.close();

  // ---------- 手机：返回键不离开 KIRA、自定义房间名、打毫米、报价单小图 + 820 px 长图 ----------
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  const q = await pc.newPage();
  const qerr = [];
  q.on('pageerror', (e) => qerr.push(e.message));
  const onKira = () => q.url().startsWith(URL);
  const guardState = () => q.evaluate(() => !!(history.state && history.state.kiraModal));
  await q.goto('about:blank');
  await q.goto(URL);
  await q.getByRole('button', { name: /Skip 跳过/ }).waitFor();
  await q.waitForTimeout(100);
  await q.goBack();
  await q.waitForTimeout(300);
  check('phone Back closes the guide and stays on KIRA', onKira() && (await q.getByRole('button', { name: /Skip 跳过/ }).count()) === 0, q.url());
  await q.getByRole('button', { name: /New/ }).first().tap();
  // 自定义房间名：手机上单独一行，打得了字
  const room = q.locator('input[placeholder="Custom room 自定义区域名"]').first();
  const rb = await room.boundingBox();
  await room.tap();
  await room.fill('Prayer room 祈祷室');
  check('phone custom room name input is usable', rb && rb.width >= 150 && (await room.inputValue()) === 'Prayer room 祈祷室', `width ${rb?.width}`);
  // 楼高打毫米 2700 → 2.70 m，有提示
  const qc = q.locator('input[placeholder="2.70"]').first();
  await qc.fill('2700');
  await qc.blur();
  await q.waitForTimeout(100);
  const ceilNote = await q.locator('[data-mm-note]').first().textContent().catch(() => '');
  check('ceiling typed in mm (2700) becomes 2.70 m with a hint', (await q.locator('input[placeholder="2.70"]').first().inputValue()) === '2.70' && /2700 mm → 2\.70 m/.test(ceilNote), ceilNote);
  // 编辑器：改过 → 返回键先问；继续编辑 → 还在；不保存 → 关掉，仍在 KIRA
  await q.getByRole('button', { name: /Add cabinet 加柜子/ }).first().tap();
  await q.locator('.hover-lift', { hasText: '衣柜' }).tap();
  await q.waitForTimeout(150);
  check('wardrobe goes to the 2.70 m ceiling', (await q.locator('label:has-text("Height 高") input').inputValue()) === '2.70');
  const qw = q.locator('label:has-text("Width 总宽") input');
  await qw.fill('1800');
  await qw.press('Enter');
  const wNote = await q.locator('label:has-text("Width 总宽") [data-mm-note]').textContent().catch(() => '');
  check('width typed in mm (1800) becomes 1.80 m with a hint', (await qw.inputValue()) === '1.80' && /1800 mm → 1\.80 m/.test(wNote), wNote);
  await q.goBack();
  await q.waitForTimeout(300);
  const asked = await q.getByRole('button', { name: /Keep editing 继续编辑/ }).count();
  await q.getByRole('button', { name: /Keep editing 继续编辑/ }).tap();
  await q.waitForTimeout(200);
  check('phone Back on a changed cabinet asks first and stays on KIRA', asked === 1 && onKira() && (await q.getByRole('button', { name: /Add 加入报价/ }).count()) === 1);
  await q.goBack();
  await q.waitForTimeout(300);
  await q.getByRole('button', { name: /Discard 不保存/ }).tap();
  await q.waitForTimeout(300);
  check('Back → Discard closes the editor, still on KIRA', onKira() && (await q.getByRole('button', { name: /Add 加入报价/ }).count()) === 0, q.url());
  // 正常加入 → 不留多余历史记录
  await q.getByRole('button', { name: /Add cabinet 加柜子/ }).first().tap();
  await q.locator('.hover-lift', { hasText: '衣柜' }).tap();
  await q.getByRole('button', { name: /Add 加入报价/ }).tap();
  await q.waitForTimeout(300);
  check('saving the cabinet leaves no stray history entry', !(await guardState()) && (await q.getByText('Edit 编辑').count()) === 1);
  // 报价单预览（手机）：小图看得到
  await q.getByRole('button', { name: /报价 Quote/ }).tap();
  await q.getByRole('button', { name: /Quote 报价单/ }).first().tap();
  await q.waitForTimeout(500);
  const prev = await q.evaluate(() => [...document.querySelectorAll('.quote-print-sheet .kira-pics svg')]
    .map((s) => s.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => Math.round(r.width)));
  check('phone quote preview shows the cabinet pictures', prev.length >= 2 && prev.every((w) => w >= 60), JSON.stringify(prev));
  // 长图：截图那一刻的版面（820 px、小图大小、小图位置）
  await q.evaluate(() => {
    const n = document.querySelector('.quote-print-sheet');
    new MutationObserver(() => {
      if (n.style.flexShrink !== '0' || window.__cap) return;
      const s = n.getBoundingClientRect();
      const bar = n.querySelector('.no-print').getBoundingClientRect().height; // 工具栏不进长图
      const pics = [...n.querySelectorAll('.kira-pics')].filter((e) => e.getBoundingClientRect().width > 0);
      const r = pics[0].getBoundingClientRect();
      window.__cap = { w: s.width, svgs: pics.flatMap((e) => [...e.querySelectorAll('svg')].map((v) => Math.round(v.getBoundingClientRect().width))),
        rect: { x: r.left - s.left, y: r.top - s.top - bar, w: r.width, h: r.height } };
    }).observe(n, { attributes: true, attributeFilter: ['style'] });
  });
  const [ldl] = await Promise.all([q.waitForEvent('download', { timeout: 60000 }), q.getByRole('button', { name: /Long image/ }).tap()]);
  const png = readFileSync(await ldl.path());
  const pngW = png.readUInt32BE(16);
  const cap = await q.evaluate(() => window.__cap);
  // 长图里小图那一块：数非白色像素（有图 ≫ 5%）
  const ink = await q.evaluate(async ({ b64, r }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(Math.round(r.x * 2), Math.round(r.y * 2), Math.round(r.w * 2), Math.round(r.h * 2)).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) n += 1;
    return n / (d.length / 4);
  }, { b64: png.toString('base64'), r: cap.rect });
  check('phone long image is the full 820 px layout (≥ 800 px)', pngW >= 1600 && cap.w >= 800, `png ${pngW}px @2x, sheet ${cap.w}px`);
  check('phone long image contains the cabinet pictures', cap.svgs.length >= 2 && cap.svgs.every((w) => w >= 60) && ink > 0.05, `svg ${JSON.stringify(cap.svgs)}, ink ${(ink * 100).toFixed(1)}%`);
  await q.goBack();
  await q.waitForTimeout(300);
  check('phone Back closes the quote preview, still on KIRA', onKira() && (await q.locator('.quote-print-sheet').count()) === 0, q.url());
  await q.goBack();
  await q.waitForTimeout(300);
  check('no stray history entries left (next Back leaves KIRA)', q.url() === 'about:blank', q.url());
  check('no browser errors (phone 2)', qerr.length === 0, qerr.join(' | '));
  await pc.close();
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
process.exit(failed ? 1 : 0);
