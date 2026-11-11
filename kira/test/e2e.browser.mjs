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
  const logos = await p.evaluate(() => [...document.querySelectorAll('.quote-print-sheet [data-quote-logo]')].map((i) => [i.getAttribute('alt'), i.complete && i.naturalWidth > 0]));
  // 只有定制橱柜的报价：只印 SAIL 那页（RICCIONE 总览页要同时有家具才出现）
  check('quotation prints the official SAIL logo, every logo image loaded', logos.some(([a]) => a === 'SAIL BY RICCIONE REKA') && logos.every(([, ok]) => ok), JSON.stringify(logos));
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
  // =================== 第二版「画框框」 ===================
  const T2 = await import('../src/planner/templates.js');
  const B2 = await import('../src/planner/blocks.js');
  const BR2 = await import('../src/planner/bridge.js');
  const barPrice = async (pg) => rm(await pg.locator('text=这个柜子').locator('xpath=../div[2]').textContent());

  // ---------- 电脑：空白柜子 → 拖出一个框 → 开放区 → 价钱对；拖分隔线 → Ctrl+Z ----------
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const d = await dctx.newPage();
  const derr = [];
  d.on('pageerror', (e) => derr.push(e.message));
  await d.goto(URL);
  await d.getByRole('button', { name: /Skip 跳过/ }).click();
  await d.getByRole('button', { name: /New/ }).first().click();
  const dc = d.locator('input[placeholder="2.70"]').first();
  await dc.fill('2.7'); await dc.blur();
  await d.getByRole('button', { name: /Add cabinet 加柜子/ }).first().click();
  await d.getByRole('button', { name: /空白柜子 Blank cabinet/ }).click();
  check('v2 blank cabinet opens straight in Blocks mode', (await d.locator('[data-block-canvas]').count()) === 1);
  const big = await d.locator('[data-block-canvas] rect[data-block$="|"]').boundingBox();
  await d.mouse.move(big.x + big.width * 0.3, big.y + big.height * 0.3);
  await d.mouse.down();
  await d.mouse.move(big.x + big.width * 0.5, big.y + big.height * 0.45, { steps: 4 });
  await d.mouse.move(big.x + big.width * 0.7, big.y + big.height * 0.55, { steps: 4 });
  await d.mouse.up();
  await d.locator('[data-cell-panel] [data-type="open"]').click();
  const sz = (await d.locator('[data-cell-size]').textContent()).match(/(\d+) × (\d+)/);
  const [cw, ch] = [Number(sz[1]), Number(sz[2])];
  const cells = await d.locator('[data-block-canvas] rect[data-block]:not([data-block$="|base"])').count();
  let bc = T2.newCabinet('blank', { ceilingH: 2700 });
  const x0 = Math.round((1200 - cw) / 20) * 10;
  bc = { ...bc, frames: [B2.carveRect(bc.frames[0], '', { x: x0, y: 800, w: cw, h: ch }, { type: 'open' })] };
  const expBlank = Math.round(BR2.cabinetTotal(bc));
  const gotBlank = await barPrice(d);
  check('v2 desktop: drag a box in a blank cabinet → open block, price as expected', cells === 5 && gotBlank === expBlank, `${cw}×${ch}, ${cells} blocks, got ${gotBlank}, expected ${expBlank}`);
  const before = await barPrice(d);
  const cut = await d.locator('[data-cut]').first().boundingBox();
  await d.mouse.move(cut.x + cut.width / 2, cut.y + cut.height / 2);
  await d.mouse.down();
  await d.mouse.move(cut.x + cut.width / 2 + 50, cut.y + cut.height / 2, { steps: 5 });
  await d.mouse.up();
  const dragged = await barPrice(d);
  await d.keyboard.press('Control+z');
  await d.waitForTimeout(100);
  const undone = await barPrice(d);
  check('v2 desktop: drag a divider changes sizes, Ctrl+Z puts it back', dragged !== before && undone === before, `${before} → ${dragged} → ${undone}`);
  await d.locator('[data-block-canvas]').screenshot({ path: path.join(outDir, 'v2-desktop-blank.png') });
  // 复查修正：点一下分隔线（几乎没动）不算画过；没顶柜的衣柜改格子类型后设定栏还在
  await d.getByRole('button', { name: /Add 加入报价/ }).click();
  await d.getByRole('button', { name: /Add cabinet 加柜子/ }).first().click();
  await d.getByRole('button', { name: /衣柜 Wardrobe/ }).click();
  await d.getByRole('button', { name: /分上下 Top \+ bottom/ }).click();
  await d.getByRole('button', { name: /画框框 Blocks/ }).click();
  const tc = await d.locator('[data-cut]').first().boundingBox();
  await d.mouse.move(tc.x + tc.width / 2, tc.y + tc.height / 2);
  await d.mouse.down();
  await d.mouse.move(tc.x + tc.width / 2 + 0.6, tc.y + tc.height / 2);
  await d.mouse.up();
  const notCustom = (await d.locator('[data-restore]').count()) === 0; // 没被当成手画过（模板设定本身可以撤销，所以不看撤销键）
  const nc = await d.locator('[data-block-canvas] rect[data-block$="|1.0"]').boundingBox();
  await d.mouse.click(nc.x + nc.width / 2, nc.y + nc.height * 0.3);
  await d.locator('[data-cell-panel] [data-type="open"]').click();
  const stays = (await d.locator('[data-cell-panel]').count()) === 1 && (await d.locator('[data-block-canvas] rect[data-block$="|1.0"]').count()) === 1;
  const fixedH = (await d.locator('[data-cell-panel] label:has-text("Height 高")').count()) === 0;
  check('v2 review fixes: tapping a divider is not an edit; block panel stays after an edit; full-height block shows fixed height', notCustom && stays && fixedH, `notCustom ${notCustom} stays ${stays} fixedH ${fixedH}`);
  // 飘板模板：1.2 m × 3 块，25mm 隐形层板销，A 系列 → 3 × RM 1,235；报价单英文行
  await d.getByRole('button', { name: /Add 加入报价/ }).click();
  await d.getByRole('button', { name: /Add cabinet 加柜子/ }).first().click();
  await d.getByRole('button', { name: /飘板 \/ 层架 Floating shelves/ }).click();
  const shelfPrice = await barPrice(d);
  await d.getByRole('button', { name: /Add 加入报价/ }).click();
  await d.getByRole('button', { name: /Quote 报价单/ }).first().click();
  await d.waitForTimeout(400);
  const ssheet = await d.locator('.quote-print-sheet').textContent();
  check('v2 floating shelves template: 3 boards × RM 1,235, EN quote line', shelfPrice === 3705 && /Floating Shelf 25 mm hidden pins/.test(ssheet), `got ${shelfPrice}`);
  check('v2 no browser errors (desktop)', derr.length === 0, derr.join(' | '));
  await dctx.close();

  // ---------- 手机（触控）：衣柜 → 画框框 → 点一格 → 竖切一刀 → 系列 C → 报价单两行；返回键；还原提示 ----------
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const v = await mctx.newPage();
  const verr = [];
  v.on('pageerror', (e) => verr.push(e.message));
  await v.goto(URL);
  await v.getByRole('button', { name: /Skip 跳过/ }).tap();
  await v.getByRole('button', { name: /New/ }).first().tap();
  const vc = v.locator('input[placeholder="2.70"]').first();
  await vc.fill('2.7'); await vc.blur();
  await v.getByRole('button', { name: /Add cabinet 加柜子/ }).first().tap();
  await v.locator('.hover-lift', { hasText: '衣柜' }).tap();
  await v.getByRole('button', { name: /画框框 Blocks/ }).tap();
  const cell = v.locator('[data-block-canvas] rect[data-block$="|0.0"]');
  const cb = await cell.boundingBox();
  await v.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height * 0.25);
  await v.waitForTimeout(150);
  check('v2 phone: tap a block opens its settings', (await v.locator('[data-cell-panel]').count()) === 1);
  await v.locator('[data-split="v"]').tap();
  const vsz = await v.locator('[data-cell-size]').textContent();
  await v.locator('[data-cell-series] [data-series="C"]').tap();
  let wc = T2.newCabinet('wardrobe', { ceilingH: 2700 });
  let wf = B2.splitLeaf(wc.frames[0], '0.0', 'v');
  wf = B2.setLeaf(wf, B2.leafAt(wf, 1, 1), { series: { door: 'C' } });
  wc = { ...wc, frames: [wf] };
  const expW = Math.round(BR2.cabinetTotal(wc));
  const gotW = await barPrice(v);
  check('v2 phone: split → left half selected (300 × 2100) → series C, price as expected', /300 × 2100/.test(vsz) && gotW === expW, `${vsz}, got ${gotW}, expected ${expW}`);
  await v.screenshot({ path: path.join(outDir, 'v2-phone-blocks.png') });
  // 返回键：先关格子设定栏，再问是否保存
  await v.goBack();
  await v.waitForTimeout(300);
  const panelClosed = (await v.locator('[data-cell-panel]').count()) === 0 && (await v.getByRole('button', { name: /Add 加入报价/ }).count()) === 1
    && (await v.getByRole('button', { name: /Keep editing 继续编辑/ }).count()) === 0;
  await v.goBack();
  await v.waitForTimeout(300);
  const askSave = (await v.getByRole('button', { name: /Keep editing 继续编辑/ }).count()) === 1;
  check('v2 phone Back: closes the block panel first, then asks to save', panelClosed && askSave);
  await v.getByRole('button', { name: /Keep editing 继续编辑/ }).tap();
  await v.waitForTimeout(200);
  await v.getByRole('button', { name: /Add 加入报价/ }).tap();
  await v.waitForTimeout(300);
  await v.getByRole('button', { name: /报价 Quote/ }).tap();
  await v.getByRole('button', { name: /Quote 报价单/ }).first().tap();
  await v.waitForTimeout(500);
  const vsheet = await v.locator('.quote-print-sheet').textContent();
  const fmt = expW.toLocaleString('en-US');
  check('v2 quote sheet: separate Door A and Door C rows, total right', /Door: A Series/.test(vsheet) && /Door: C Series/.test(vsheet) && vsheet.includes(fmt), `expects ${fmt}`);
  await v.goBack();
  await v.waitForTimeout(300);
  // 模板设定和画框框同一个画面：改顶柜高 → 手切的格子还在；改总宽让门数变了 → 照模板重做 + 提示，按撤销回来
  await v.getByRole('button', { name: /设计 Design/ }).tap();
  await v.getByText('Edit 编辑').first().tap();
  await v.waitForTimeout(200);
  const reopenBlocks = (await v.locator('[data-block-canvas]').count()) === 1;
  const blocksBefore = await v.locator('[data-block-canvas] rect[data-block]:not([data-block$="|base"])').count();
  const th = v.locator('label:has-text("Top 顶柜高") input');
  await th.fill('0.6'); await th.press('Enter');
  await v.waitForTimeout(200);
  const blocksAfter = await v.locator('[data-block-canvas] rect[data-block]:not([data-block$="|base"])').count();
  const keptC = /Closed C|封闭区 C/.test(await v.locator('[data-block-canvas]').textContent());
  check('v2 sync: blocks always on screen with the template settings; top-box height change keeps the hand-cut block + series C', reopenBlocks && blocksAfter === blocksBefore && blocksBefore === 9 && keptC, `blocks ${blocksBefore} → ${blocksAfter}, C kept ${keptC}`);
  const priceTop = await barPrice(v);
  const vw = v.locator('label:has-text("Width 总宽") input');
  await vw.fill('1.8'); await vw.press('Enter');
  await v.waitForTimeout(200);
  const note = await v.locator('[data-rebuilt-note]').count();
  const exp18 = Math.round(BR2.cabinetTotal(T2.updateSpec(T2.newCabinet('wardrobe', { ceilingH: 2700 }), { W: 1800, topH: 600 })));
  const got18 = await barPrice(v);
  await v.locator('[data-rebuilt-note] button').tap();
  await v.waitForTimeout(200);
  const back = (await barPrice(v)) === priceTop && (await vw.inputValue()) === '2.40' && (await v.locator('[data-rebuilt-note]').count()) === 0;
  check('v2 sync: width change that changes the door count → rebuilt from template with a note; Undo brings the blocks back', note === 1 && got18 === exp18 && back, `note ${note}, got ${got18} expected ${exp18}, undo ok ${back}`);
  check('v2 no browser errors (phone)', verr.length === 0, verr.join(' | '));
  await mctx.close();

  // =================== 第二版追加 2：柜体像乐高 + 电视墙 ===================
  const PR = await import('../src/constants/pricing.js');
  const sec = (pg, title) => pg.locator('section', { hasText: title });
  // ---------- 电脑：电视柜 + 两侧高柜 + 吊柜 → 柜体模式把吊柜拖到顶（贴齐 2.70）→ 加飘板 → 电视墙 → 报价单 ----------
  const xctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const x = await xctx.newPage();
  const xerr = [];
  x.on('pageerror', (e) => xerr.push(e.message));
  await x.goto(URL);
  await x.getByRole('button', { name: /Skip 跳过/ }).click();
  await x.getByRole('button', { name: /New/ }).first().click();
  const xc = x.locator('input[placeholder="2.70"]').first();
  await xc.fill('2.7'); await xc.blur();
  await x.getByRole('button', { name: /Add cabinet 加柜子/ }).first().click();
  await x.getByRole('button', { name: /TV & display/ }).click();
  await sec(x, 'Side tall cabinets').getByRole('button', { name: /No 没有/ }).click();
  await sec(x, 'Top cabinet above TV').getByRole('button', { name: /No 没有/ }).click();
  const tvPrice = await barPrice(x);
  await x.locator('[data-mode]').getByRole('button', { name: /柜体 Boxes/ }).click();
  const up = await x.locator('[data-block-canvas] rect[data-block*="-upper|"]').first().boundingBox();
  const pxmm = up.height / 400; // 吊柜高 400
  await x.mouse.move(up.x + up.width * 0.25, up.y + up.height / 2);
  await x.mouse.down();
  await x.mouse.move(up.x + up.width * 0.25, up.y + up.height / 2 - 150 * pxmm, { steps: 4 });
  await x.mouse.move(up.x + up.width * 0.25, up.y + up.height / 2 - 285 * pxmm, { steps: 4 });
  const lbl = await x.locator('[data-drag-label]').count();
  await x.mouse.up();
  const topTxt = await x.locator('[data-box-top]').textContent();
  const yVal = await x.locator('[data-box-panel] label:has-text("Off floor 离地") input').inputValue();
  check('v2+ desktop: drag the top cabinet up → snaps to the tower tops 2.70 m (off floor 2.30), price unchanged',
    /2\.70/.test(topTxt) && yVal === '2.30' && lbl === 1 && (await barPrice(x)) === tvPrice, `${topTxt} · y ${yVal} · label ${lbl}`);
  await x.keyboard.press('Control+z');
  await x.waitForTimeout(100);
  const yUndo = await x.locator('[data-box-panel] label:has-text("Off floor 离地") input').inputValue();
  await x.keyboard.press('Control+Shift+z');
  check('v2+ desktop: Ctrl+Z puts the box back, Ctrl+Shift+Z moves it again', yUndo === '2.00' && (await x.locator('[data-box-panel] label:has-text("Off floor 离地") input').inputValue()) === '2.30', `undo ${yUndo}`);
  // 改模板设定（低柜高）→ 吊柜留在顶上
  await x.keyboard.press('Escape');
  await x.locator('label:has-text("Low height 低柜高") input').fill('0.45');
  await x.locator('label:has-text("Low height 低柜高") input').press('Enter');
  const up2 = await x.locator('[data-block-canvas] rect[data-block*="-upper|"]').first().boundingBox();
  await x.mouse.click(up2.x + up2.width * 0.25, up2.y + up2.height / 2);
  const yKeep = await x.locator('[data-box-panel] label:has-text("Off floor 离地") input').inputValue();
  check('v2+ desktop: template change keeps the moved box at the top', yKeep === '2.30', `y ${yKeep}`);
  await x.keyboard.press('Escape');
  const p0 = await barPrice(x);
  await x.locator('[data-add="shelf"]').click();
  const p1 = await barPrice(x);
  check('v2+ desktop: + add box → floating shelves (3 × RM 1,235) added, selected', p1 - p0 === 3705 && (await x.locator('[data-box-panel]').count()) === 1, `+${p1 - p0}`);
  await x.locator('[data-box-panel] [data-remove-frame]').click();
  const p2 = await barPrice(x);
  await x.locator('[data-add="shelf"]').click();
  check('v2+ desktop: delete box removes its price', p2 === p0, `${p0} → ${p2}`);
  await sec(x, 'TV feature wall').getByRole('button', { name: /No 没有/ }).click();
  const p3 = await barPrice(x);
  const wallExp = Math.round(1.8 * 2.7 * PR.cnyToMyr(PR.seriesById('A').panel));
  check('v2+ desktop: TV feature wall on → + 1.80 × 2.70 m wall panel', Math.abs((p3 - p1) - wallExp) <= 1, `+${p3 - p1}, expected ${wallExp}`);
  await x.locator('[data-block-canvas]').screenshot({ path: path.join(outDir, 'v2plus-boxes.png') });
  await x.getByRole('button', { name: /Add 加入报价/ }).click();
  await x.getByRole('button', { name: /Quote 报价单/ }).first().click();
  await x.waitForTimeout(400);
  const xsheet = await x.locator('.quote-print-sheet').textContent();
  check('v2+ quote sheet has "Feature Wall: A Series" and the floating shelf', /Feature Wall: A Series/.test(xsheet) && /Floating Shelf/.test(xsheet));
  await x.locator('.quote-print-sheet').screenshot({ path: path.join(outDir, 'v2plus-quote.png') });
  check('v2+ no browser errors (desktop)', xerr.length === 0, xerr.join(' | '));
  await xctx.close();

  // ---------- 手机（触控）：柜体模式点选 → 设定栏打离地 → 删柜体；返回键先关设定栏 ----------
  const yctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const y = await yctx.newPage();
  const yerr = [];
  y.on('pageerror', (e) => yerr.push(e.message));
  await y.goto(URL);
  await y.getByRole('button', { name: /Skip 跳过/ }).tap();
  await y.getByRole('button', { name: /New/ }).first().tap();
  const yc = y.locator('input[placeholder="2.70"]').first();
  await yc.fill('2.7'); await yc.blur();
  await y.getByRole('button', { name: /Add cabinet 加柜子/ }).first().tap();
  await y.locator('.hover-lift', { hasText: '电视柜' }).tap();
  await sec(y, 'Top cabinet above TV').getByRole('button', { name: /No 没有/ }).tap();
  await y.locator('[data-mode]').getByRole('button', { name: /柜体 Boxes/ }).tap();
  const yu = await y.locator('[data-block-canvas] rect[data-block*="-upper|"]').first().boundingBox();
  await y.touchscreen.tap(yu.x + yu.width * 0.2, yu.y + yu.height / 2);
  const tapped = (await y.locator('[data-box-panel]').count()) === 1 && (await y.locator('[data-move]').count()) === 1 && (await y.locator('[data-edge]').count()) === 4;
  const yin = y.locator('[data-box-panel] label:has-text("Off floor 离地") input');
  await yin.fill('2.3'); await yin.press('Enter');
  const ytop = await y.locator('[data-box-top]').textContent();
  check('v2+ phone: tap a box → panel with move / edge handles; type off-floor 2.30 → top 2.70', tapped && /2\.70/.test(ytop), `tapped ${tapped} · ${ytop}`);
  await y.goBack();
  await y.waitForTimeout(200);
  const closed = (await y.locator('[data-box-panel]').count()) === 0 && (await y.getByRole('button', { name: /Add 加入报价/ }).count()) === 1;
  const yu2 = await y.locator('[data-block-canvas] rect[data-block*="-upper|"]').first().boundingBox();
  await y.touchscreen.tap(yu2.x + yu2.width * 0.2, yu2.y + yu2.height / 2);
  await y.locator('[data-box-panel] [data-remove-frame]').tap();
  const gone = (await y.locator('[data-block-canvas] rect[data-block*="-upper|"]').count()) === 0;
  check('v2+ phone: Back closes the box panel first; delete box removes it', closed && gone, `closed ${closed} gone ${gone}`);
  await y.locator('[data-block-canvas]').screenshot({ path: path.join(outDir, 'v2plus-phone.png') });
  check('v2+ no browser errors (phone)', yerr.length === 0, yerr.join(' | '));
  await yctx.close();

  // =================== 第三版：户型图 ===================
  const FIX = path.join(here, 'fixtures');
  const planPt = (pg) => (x, y) => pg.evaluate(([x, y]) => { const s = document.querySelector('[data-plan-svg]'); const q = s.createSVGPoint(); q.x = x; q.y = y; const r = q.matrixTransform(s.getScreenCTM()); return [r.x, r.y]; }, [x, y]);
  // ---------- 电脑：上传 PNG → 定比例 2.70 → 画 2.4 m → 衣柜 → 图上拖到 3.0 m → 厨房正对 0.8 m → 走道提醒 → 报价单索引图 → PDF 第 2 页 → 全屏返回键 ----------
  const pctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const g = await pctx.newPage();
  const gerr = [];
  g.on('pageerror', (e) => gerr.push(e.message));
  await g.goto(URL);
  await g.getByRole('button', { name: /Skip 跳过/ }).click();
  await g.getByRole('button', { name: /New/ }).first().click();
  const gc = g.locator('input[placeholder="2.70"]').first();
  await gc.fill('2.7'); await gc.blur();
  await g.locator('[data-plan-file]').setInputFiles(path.join(FIX, 'floorplan.png'));
  await g.waitForSelector('[data-plan-svg] image', { timeout: 15000 });
  const gp = planPt(g);
  const gclick = async (x, y) => { const [a, b] = await gp(x, y); await g.mouse.click(a, b); };
  const gdrag = async (x0, y0, x1, y1) => {
    const [a, b] = await gp(x0, y0), [c, d] = await gp(x1, y1);
    await g.mouse.move(a, b); await g.mouse.down();
    await g.mouse.move((a + c) / 2, (b + d) / 2, { steps: 3 }); await g.mouse.move(c, d, { steps: 3 }); await g.mouse.up();
  };
  await gclick(100, 60); await gclick(370, 60);
  await g.locator('[data-plan-scale-input]').fill('2700');
  await g.locator('[data-plan-scale-ok]').click();
  check('v3 desktop: upload PNG + set scale (2 points, typed 2700) → 10 mm per px', /1 px = 10\.0 mm/.test(await g.locator('[data-plan-board]').innerText()));
  await g.locator('[data-plan-mode="draw"]').click();
  await gdrag(104, 104, 344, 164);
  await g.getByRole('button', { name: /衣柜 Wardrobe/ }).click();
  const w0 = await g.locator('label:has-text("Width 总宽") input').inputValue();
  await g.getByRole('button', { name: /Add 加入报价/ }).click();
  check('v3 desktop: draw a 2.40 m box → pick wardrobe → editor width 2.40, K1 on the plan', w0 === '2.40' && (await g.locator('[data-pcab]').count()) === 1, `width ${w0}`);
  await gclick(224, 134);
  await gdrag(344, 134, 404, 134); // 右边往右 60 px = 600 mm
  const selSize = await g.locator('[data-plan-sel-size]').textContent();
  await g.locator('[data-plan-edit]').click();
  const w1 = await g.locator('label:has-text("Width 总宽") input').inputValue();
  await g.locator('label:has-text("Width 总宽") input').fill('2.7');
  await g.locator('label:has-text("Width 总宽") input').press('Enter');
  await g.getByRole('button', { name: /Done 完成/ }).click();
  await gclick(200, 134);
  const selSize2 = await g.locator('[data-plan-sel-size]').textContent();
  check('v3 desktop: drag the edge on the plan → editor shows 3.00; editor 2.70 → plan box follows', /3\.00 × 0\.60/.test(selSize) && w1 === '3.00' && /2\.70 × 0\.60/.test(selSize2), `${selSize} · editor ${w1} · ${selSize2}`);
  // 厨房正对、相距 0.8 m（画在下面再转 180°）
  await g.locator('[data-plan-mode="draw"]').click();
  await gdrag(104, 244, 344, 304);
  await g.getByRole('button', { name: /厨房 Kitchen/ }).click();
  await g.getByRole('button', { name: /Add 加入报价/ }).click();
  const [kx, ky] = [224, 274];
  await gclick(kx, ky);
  await g.locator('[data-plan-rotate]').click(); await g.locator('[data-plan-rotate]').click();
  await g.waitForTimeout(150);
  const aisle = await g.locator('[data-plan-aisle="warn"]').count();
  const wtxt = (await g.locator('[data-plan-warnings]').textContent().catch(() => '')) || '';
  check('v3 desktop: kitchen facing the wardrobe 0.80 m apart → red aisle line + "厨房走道只有 800"', aisle >= 1 && /厨房走道只有 800/.test(wtxt), `${aisle} lines · ${wtxt}`);
  await g.locator('[data-plan-edit]').click();
  const edWarn = await g.locator('section:has-text("Check 提醒")').textContent().catch(() => '');
  await g.getByRole('button', { name: /Done 完成/ }).click();
  check('v3 desktop: the aisle warning also shows in the cabinet editor', /kitchen aisle only 800|厨房走道只有 800/.test(edWarn || ''), edWarn);
  await g.locator('[data-plan-board]').screenshot({ path: path.join(outDir, 'v3-plan-board.png') });
  // 报价单：平面索引图页
  await g.getByRole('button', { name: /Quote 报价单/ }).first().click();
  await g.waitForSelector('[data-plan-page] [data-plan-figure] image', { timeout: 15000 });
  await g.waitForTimeout(300);
  const fig = await g.evaluate(() => { const im = document.querySelector('[data-plan-page] [data-plan-figure] image'); return (im?.getAttribute('href') || '').slice(0, 11); });
  const ptext = await g.locator('[data-plan-page]').textContent();
  const HAN3 = /\p{Script=Han}/u;
  check('v3 quote: floor plan index page (image as data URL, K1 + K2, EN text without Chinese)', fig === 'data:image/' && /Floor Plan Index/.test(ptext) && /K1/.test(ptext) && /K2/.test(ptext) && !HAN3.test(ptext), `${fig} · ${(ptext.match(/\p{Script=Han}+/gu) || []).join(' ')}`);
  await g.locator('[data-plan-page]').screenshot({ path: path.join(outDir, 'v3-plan-page.png') });
  const [pdl] = await Promise.all([g.waitForEvent('download', { timeout: 30000 }), g.getByRole('button', { name: /Long image/ }).click()]);
  const lp = await pdl.path();
  const lbuf = readFileSync(lp);
  check('v3 long image with the floor plan page downloads', /\.png$/.test(pdl.suggestedFilename()) && lbuf.length > 50000, `${lbuf.length} bytes`);
  await g.goBack(); // 返回键关掉报价单
  await g.waitForTimeout(200);
  // PDF 选第 2 页
  await g.locator('[data-plan-file]').setInputFiles(path.join(FIX, 'floorplan-2p.pdf'));
  await g.waitForSelector('[data-pdf-pages] [data-pdf-page="2"]', { timeout: 20000 });
  await g.locator('[data-pdf-page="2"]').click();
  await g.waitForFunction(() => document.querySelectorAll('[data-plan-select] option').length === 2, null, { timeout: 20000 });
  await g.waitForSelector('[data-plan-svg] image', { timeout: 15000 });
  const pname = await g.locator('[data-plan-name]').inputValue();
  check('v3 desktop: PDF upload → pick page 2 → second floor plan', pname === 'Plan 2 户型图 2' && (await g.locator('[data-plan-scale]').count()) === 1, pname);
  // 全屏 → 返回键先关全屏，还在 KIRA
  await g.locator('[data-plan-full]').click();
  await g.waitForTimeout(200);
  const fullOn = await g.evaluate(() => getComputedStyle(document.querySelector('[data-plan-board]')).position === 'fixed');
  await g.goBack();
  await g.waitForTimeout(300);
  const fullOff = await g.evaluate(() => getComputedStyle(document.querySelector('[data-plan-board]')).position !== 'fixed');
  check('v3 desktop: Back closes the full-screen floor plan first, stays on KIRA', fullOn && fullOff && g.url().startsWith(URL.replace(/\/$/, '')), g.url());
  check('v3 no browser errors (desktop)', gerr.length === 0, gerr.join(' | '));
  await pctx.close();

  // ---------- AI 识图（/api/plan-ai 用假的回答，不花钱）：密码 → AI 读到的比例 → 2 个建议 → 取消 1 个 → 加入 → 撤销 ----------
  const aiAnswer = JSON.parse(readFileSync(path.join(FIX, 'plan-ai-demo.json'), 'utf8'));
  const actx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ap = await actx.newPage();
  const aerr = [];
  ap.on('pageerror', (e) => aerr.push(e.message));
  let aiCalls = 0, aiBody = null;
  await ap.route('**/api/plan-ai', async (route) => {
    aiCalls += 1;
    aiBody = route.request().postDataJSON();
    if (route.request().headers()['x-kira-ai-passcode'] !== 'team123') return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'passcode' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: aiAnswer, model: 'claude-opus-5-5', usage: { input: 2600, output: 1400 } }) });
  });
  await ap.goto(URL);
  await ap.getByRole('button', { name: /Skip 跳过/ }).click();
  await ap.getByRole('button', { name: /New/ }).first().click();
  await ap.locator('[data-plan-file]').setInputFiles(path.join(FIX, 'floorplan.png'));
  await ap.waitForSelector('[data-plan-svg] image', { timeout: 15000 });
  await ap.locator('[data-plan-ai]').click();
  await ap.getByRole('button', { name: /Read 开始/ }).click();
  await ap.locator('[data-plan-ai-pass]').fill('wrong');
  await ap.locator('[data-plan-ai-pass-ok]').click();
  await ap.waitForSelector('[data-plan-ai-panel="pass"] >> text=团队密码不对', { timeout: 10000 });
  await ap.locator('[data-plan-ai-pass]').fill('team123');
  await ap.locator('[data-plan-ai-pass-ok]').click();
  await ap.waitForSelector('[data-plan-ai-scale-ok]', { timeout: 10000 });
  check('v3 AI: wrong passcode is refused, right one works; image sent ≤ 1568 px as JPEG', aiCalls === 2 && aiBody.w === 1200 && aiBody.h === 800 && aiBody.image.startsWith('/9j/'), `${aiCalls} calls, ${aiBody?.w}×${aiBody?.h}`);
  await ap.locator('[data-plan-ai-scale-ok]').click(); // 还没定比例：用 AI 读到的 2.70 m
  await ap.waitForSelector('[data-plan-ai-list]');
  const items = await ap.locator('[data-plan-ai-item="ok"]').count();
  const dashed = await ap.locator('[data-plan-ai-overlay] rect').count();
  check('v3 AI: scale from the printed 2700 → 2 suggestions (wardrobe + L kitchen) drawn dashed on the plan', items === 2 && dashed >= 2 && /1 px = 10\.0 mm/.test(await ap.locator('[data-plan-board]').innerText()), `${items} items, ${dashed} rects`);
  await ap.locator('[data-plan-board]').screenshot({ path: path.join(outDir, 'v3-plan-ai-suggest.png') });
  await ap.locator('[data-plan-ai-item="ok"] input').first().uncheck();
  await ap.locator('[data-plan-ai-add]').click();
  await ap.waitForTimeout(300);
  const placed = await ap.locator('[data-pcab]').count();
  const kitchenRoom = await ap.locator('text=Dry Kitchen 干厨').count();
  check('v3 AI: untick the wardrobe, add → only the kitchen goes in (new room Dry Kitchen, on the plan)', placed === 1 && kitchenRoom > 0 && (await ap.locator('[data-plan-ai-panel]').count()) === 0, `placed ${placed}, room ${kitchenRoom}`);
  await ap.locator('[data-plan-undo]').click();
  await ap.waitForTimeout(200);
  check('v3 AI: Undo takes the added cabinets back out', (await ap.locator('[data-pcab]').count()) === 0);
  await ap.locator('[data-plan-board]').screenshot({ path: path.join(outDir, 'v3-plan-ai.png') });
  // 第二次：这次浏览器开着就记住密码，不再问；出错照实显示
  await ap.unroute('**/api/plan-ai');
  await ap.route('**/api/plan-ai', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'not_configured' }) }));
  await ap.locator('[data-plan-ai]').click();
  await ap.getByRole('button', { name: /Read 开始/ }).click();
  await ap.waitForSelector('[data-plan-ai-error]', { timeout: 10000 });
  check('v3 AI: passcode remembered this session; server errors shown in plain words', /AI 还没设定/.test(await ap.locator('[data-plan-ai-error]').innerText()) && (await ap.locator('[data-plan-ai-pass]').count()) === 0);
  check('v3 no browser errors (AI)', aerr.length === 0, aerr.join(' | '));
  await actx.close();

  // ---------- 找得到 AI：最上面「✨ 户型图」→ 选图 → 上传完自动问 AI；Ukur 量尺里「用这张图做户型图」→ 同一张图 + 校准比例带过去 ----------
  const fctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const fp = await fctx.newPage();
  const ferr = [];
  fp.on('pageerror', (e) => ferr.push(e.message));
  let fCalls = 0, fBody = null;
  await fp.route('**/api/plan-ai', async (route) => {
    fCalls += 1;
    fBody = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: aiAnswer, model: 'claude-opus-5-5', usage: { input: 2600, output: 1400 } }) });
  });
  await fp.goto(URL);
  await fp.getByRole('button', { name: /Skip 跳过/ }).click();
  await fp.getByRole('button', { name: /New/ }).first().click();
  const topBtns = await fp.locator('[data-top-plan-ai], [data-top-measure]').evaluateAll((els) => els.map((e) => e.hasAttribute('data-top-plan-ai') ? 'ai' : 'ukur'));
  check('find AI: the top of the quote shows "✨ 户型图 · AI" first, then Ukur', topBtns.join(',') === 'ai,ukur', topBtns.join(','));
  await fp.locator('[data-top-plan-ai]').locator('..').screenshot({ path: path.join(outDir, 'v3-top-buttons.png') });
  const [fc] = await Promise.all([fp.waitForEvent('filechooser'), fp.locator('[data-top-plan-ai]').click()]);
  await fc.setFiles(path.join(FIX, 'floorplan.png'));
  await fp.getByRole('button', { name: /Read 开始/ }).click({ timeout: 15000 });
  await fp.locator('[data-plan-ai-pass]').fill('team123');
  await fp.locator('[data-plan-ai-pass-ok]').click();
  await fp.waitForSelector('[data-plan-ai-scale-ok]', { timeout: 10000 });
  check('find AI: top button → pick the image → upload → AI starts by itself', fCalls === 1 && (await fp.locator('[data-plan-svg] image').count()) === 1);
  // Ukur 量尺：上传 → 校准 2.7 m → 「用这张图做户型图 · AI 识图」
  await fp.getByRole('button', { name: /New/ }).first().click();
  await fp.locator('[data-top-measure]').click();
  check('find AI: Ukur shows the "go to AI" bar even before an image', /去户型图 · AI 识图/.test(await fp.locator('[data-measure-to-plan]').innerText()));
  await fp.locator('.fixed.inset-0 input[type=file]').first().setInputFiles(path.join(FIX, 'floorplan.png'));
  const uimg = fp.locator('.fixed.inset-0 img[alt="plan"]');
  await uimg.waitFor();
  const ub = await uimg.boundingBox();
  const uk = ub.width / 1200;
  await fp.mouse.click(ub.x + 100 * uk, ub.y + 60 * uk);
  await fp.mouse.click(ub.x + 370 * uk, ub.y + 60 * uk);
  await fp.locator('.fixed.inset-0 input[type=number]').first().fill('2.7');
  await fp.locator('.fixed.inset-0').getByRole('button', { name: 'Set', exact: true }).click();
  await fp.locator('[data-measure-to-plan]').click();
  await fp.getByRole('button', { name: /Read 开始/ }).click({ timeout: 15000 });
  await fp.waitForSelector('[data-plan-ai-list]', { timeout: 10000 });
  const ktxt = (await fp.locator('[data-plan-board]').innerText()).match(/1 px = ([\d.]+) mm/);
  check('find AI: Ukur → "use this image" → new floor plan with the Ukur scale (≈10 mm/px), AI runs straight to suggestions (passcode remembered)',
    fCalls === 2 && (await fp.locator('.fixed.inset-0 img[alt="plan"]').count()) === 0 && ktxt && Math.abs(Number(ktxt[1]) - 10) < 0.4 && Math.abs(fBody.mmPerPx - 10) < 0.4 && (await fp.locator('[data-plan-ai-item="ok"]').count()) === 2,
    `${fCalls} calls, ${ktxt?.[1]} mm/px, sent ${fBody?.mmPerPx}`);
  await fp.locator('[data-plan-board]').screenshot({ path: path.join(outDir, 'v3-ukur-to-ai.png') });
  check('find AI: no browser errors', ferr.length === 0, ferr.join(' | '));
  await fctx.close();

  // ---------- 复查修正：上传很慢（toBlob 延迟 2.5 s）时改报价 / 换报价，不会被旧的报价盖回去 ----------
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sctx.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, ...a) { setTimeout(() => orig.call(this, cb, ...a), 2500); };
  });
  const sp3 = await sctx.newPage();
  const serr = [];
  sp3.on('pageerror', (e) => serr.push(e.message));
  await sp3.goto(URL);
  await sp3.getByRole('button', { name: /Skip 跳过/ }).click();
  await sp3.getByRole('button', { name: /New/ }).first().click();
  const nameIn = sp3.locator('input').nth(1);
  await nameIn.fill('Before');
  await sp3.locator('[data-plan-file]').setInputFiles(path.join(FIX, 'floorplan.png'));
  await sp3.waitForTimeout(300);
  await nameIn.fill('Edited during upload');
  await sp3.waitForSelector('[data-plan-svg] image', { timeout: 20000 });
  await sp3.waitForTimeout(300);
  const keptName = await nameIn.inputValue();
  check('v3 review fix: typing during a slow upload is not overwritten when the upload finishes', keptName === 'Edited during upload', keptName);
  // 上传中按 New 开另一份报价 → 两份都在、id 不重复、B 的名字还在
  await sp3.locator('[data-plan-file]').setInputFiles(path.join(FIX, 'floorplan.png'));
  await sp3.waitForTimeout(300);
  await sp3.getByRole('button', { name: /New/ }).first().click();
  await sp3.locator('input').nth(1).fill('Customer B');
  await sp3.waitForTimeout(4000);
  const recs = await sp3.evaluate(() => { const s = JSON.parse(localStorage.getItem('kira.records.v1') || '{}'); return (s.records || []).map((r) => [r.id, r.meta?.name || '', (r.plans || []).length]); });
  const ids = recs.map((r) => r[0]);
  const b = recs.find((r) => r[1] === 'Customer B');
  check('v3 review fix: switching quotes during an upload keeps both quotes (no overwrite, no duplicate id)',
    new Set(ids).size === ids.length && !!b && b[2] === 0 && recs.some((r) => r[1] === 'Edited during upload' && r[2] === 1) && (await sp3.locator('input').nth(1).inputValue()) === 'Customer B', JSON.stringify(recs));
  check('v3 no browser errors (slow upload)', serr.length === 0, serr.join(' | '));
  await sctx.close();

  // ---------- 手机（触控）：上传 → 点两点定比例 → 点两个对角画柜子 → 衣柜 ----------
  const hctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const hp = await hctx.newPage();
  const herr = [];
  hp.on('pageerror', (e) => herr.push(e.message));
  await hp.goto(URL);
  await hp.getByRole('button', { name: /Skip 跳过/ }).tap();
  await hp.getByRole('button', { name: /New/ }).first().tap();
  check('v3 phone: floor plan board is open by default with the AI button showing', (await hp.locator('[data-plan-ai]').count()) === 1 && (await hp.locator('[data-plan-empty-ai]').count()) === 1);
  await hp.locator('[data-plan-file]').setInputFiles(path.join(FIX, 'floorplan.png'));
  await hp.waitForSelector('[data-plan-svg] image', { timeout: 15000 });
  await hp.locator('[data-plan-svg]').scrollIntoViewIfNeeded();
  const hpp = planPt(hp);
  const htap = async (x, y) => { const [a, b] = await hpp(x, y); await hp.touchscreen.tap(a, b); };
  await htap(100, 60); await htap(370, 60);
  await hp.locator('[data-plan-scale-input]').fill('2.7');
  await hp.locator('[data-plan-scale-ok]').tap();
  await hp.locator('[data-plan-mode="draw"]').tap();
  await hp.locator('[data-plan-svg]').scrollIntoViewIfNeeded();
  await htap(104, 104); await htap(344, 164);
  await hp.locator('.hover-lift', { hasText: '衣柜' }).tap();
  const hw = await hp.locator('label:has-text("Width 总宽") input').inputValue();
  await hp.getByRole('button', { name: /Add 加入报价/ }).tap();
  check('v3 phone: tap two points for scale, tap two corners to draw → wardrobe 2.40 on the plan', hw === '2.40' && (await hp.locator('[data-pcab]').count()) === 1, `width ${hw}`);
  await hp.locator('[data-plan-board]').screenshot({ path: path.join(outDir, 'v3-plan-phone.png') });
  check('v3 no browser errors (phone)', herr.length === 0, herr.join(' | '));
  await hctx.close();
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
process.exit(failed ? 1 : 0);
