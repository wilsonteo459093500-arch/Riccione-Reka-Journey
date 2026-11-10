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
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
process.exit(failed ? 1 : 0);
