// 浏览器端到端 · 体检 2026-11-19「阶段 1A 修钱」（问题 2、4、8、9、10）
//   npm run build && npm run preview（另开）→ npm run test:browser（接在 e2e.browser.mjs 后面跑）
//   KIRA_URL=http://localhost:5182 node test/e2e.money.browser.mjs
// 报价资料直接放进本机（kira.records.v1），不用一步步点出来；/api/plan-ai 用假的回答，不花钱。
import { createRequire } from 'module';
import { mkdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { newCabinet, updateSpec } from '../src/planner/templates.js';
import { computeRecordQuote, cabinetTotal } from '../src/planner/bridge.js';
import { setPlanSize } from '../src/planner/plan.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const XLSX = require('xlsx');
const URL = process.env.KIRA_URL || 'http://localhost:5182/';
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');
const FIX = path.join(here, 'fixtures');
mkdirSync(outDir, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`); };
const rm = (s) => Number(String(s).replace(/[^\d.-]/g, ''));
const sum = (a) => a.reduce((x, y) => x + y, 0);

// 一份有零头的报价：衣柜 1.45 / 2.33 m、L 型厨房带岩板、电视柜 3.17 m
const record = (over = {}) => {
  const w = newCabinet('wardrobe', { ceilingH: 2700 });
  const kitchen = { ...updateSpec(newCabinet('kitchen'), { shape: 'L', walls: [{ len: 2880 }, { len: 2000 }], tall: { on: true, kind: 'oven' }, stone: true }), code: 'K3' };
  const tv = { ...updateSpec(newCabinet('tv', { ceilingH: 2700 }), { W: 3170, sides: { on: true, which: 'both' }, upper: { on: true } }), code: 'K4' };
  const now = Date.now();
  return {
    id: 'rec_money', app: 'kira', schema: 1, ownerId: null, groupId: 'rec_money',
    meta: { name: 'Mr Tan', phone: '', location: 'Mont Kiara', ref: '', pic: '', version: '1', outputLang: 'en', date: '2026-11-20' },
    defaults: { door: 'A', carcass: 'A' },
    zones: [
      { id: 'z1', name: 'Master Bedroom 主卧', items: [], ceilingH: 2700, collapsed: false, cabinets: [{ ...updateSpec(w, { W: 1450 }), id: 'cab_w1', code: 'K1' }, { ...updateSpec(w, { W: 2330 }), id: 'cab_w2', code: 'K2' }] },
      { id: 'z2', name: 'Dry Kitchen 干厨', items: [], ceilingH: 2700, collapsed: false, cabinets: [kitchen] },
      { id: 'z3', name: 'Living Room 客厅', items: [], ceilingH: 2700, collapsed: false, cabinets: [tv] },
    ],
    looseItems: [], adjustPct: 0, looseAdjustPct: 0, cabinetNote: '', looseNote: '', createdAt: now, updatedAt: now,
    ...over,
  };
};
// 开一个已经有这份报价的页面（跳过新人引导；AI 团队密码已记住）
const openWith = async (browser, rec, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...opts });
  await ctx.addInitScript((store) => {
    if (!localStorage.getItem('kira.records.v1')) localStorage.setItem('kira.records.v1', store);
    localStorage.setItem('kira.onboarded.v1', '1');
    sessionStorage.setItem('kira.aiPasscode', 'team123');
  }, JSON.stringify({ records: [rec], activeId: rec.id }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL);
  await p.waitForSelector('[data-discount-pct]', { timeout: 15000 });
  return { ctx, p, errors };
};
// 报价单上每个房间：{ rows:[{ label, unit, amount }], sub }（只看画面上看得到的那一版；明细行 = 5 格）
const sheetZones = (p) => p.evaluate(() => {
  const num = (s) => Number(String(s).replace(/[^\d.-]/g, ''));
  return [...document.querySelectorAll('.quote-print-sheet [data-zone-subtotal]')].map((sub) => {
    const rows = [...sub.closest('table').querySelectorAll('tbody tr')].filter((tr) => getComputedStyle(tr).display !== 'none' && tr.children.length === 5 && !tr.querySelector('[data-zone-subtotal]'));
    return { sub: num(sub.textContent), rows: rows.map((tr) => ({ label: tr.children[0].textContent.trim(), unit: num(tr.children[3].textContent), amount: num(tr.children[4].textContent) })) };
  });
});
const sheetTotal = async (p, label) => rm((await p.locator('.quote-print-sheet').innerText()).match(new RegExp(`${label}[^\\n]*\\n?\\s*RM ([\\d,]+)`))?.[1] ?? 'NaN');
const excelRows = async (p) => {
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.getByRole('button', { name: /^\s*Excel\s*$/ }).click()]);
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile(await dl.path()).Sheets.Quotation, { header: 1, defval: '' });
  const zones = []; const totals = {}; let cur = [];
  rows.forEach((r) => {
    if (typeof r[1] === 'number' && typeof r[4] === 'number') cur.push({ label: String(r[0]).trim(), unit: r[3], amount: r[4] });
    else if (r[3] === 'Sub-Total') { zones.push({ rows: cur, sub: r[4] }); cur = []; }
    else if (typeof r[4] === 'number') totals[String(r[3]).split(' (')[0].split(' ·')[0]] = r[4];
  });
  return { zones, totals, name: dl.suggestedFilename() };
};
const addsUp = (zones) => zones.length === 3 && zones.every((z) => z.rows.length > 0 && sum(z.rows.map((r) => r.amount)) === z.sub);
const gaps = (zones) => zones.map((z) => `${sum(z.rows.map((r) => r.amount))}/${z.sub}`).join(' ');

const browser = await chromium.launch();
try {
  // ---------- 问题 10 + 4：报价单 / Excel 逐行加起来 = 小计 = 总额；净价版岩板印 RM 800 ----------
  const q = computeRecordQuote(record());
  {
    const { ctx, p, errors } = await openWith(browser, record());
    // 零售版
    await p.getByRole('button', { name: /Quote 报价单/ }).click();
    await p.waitForSelector('.quote-print-sheet [data-zone-subtotal]');
    let zs = await sheetZones(p);
    check('#10 retail quotation: every room\'s rows add up to its sub-total', addsUp(zs), gaps(zs));
    check('#10 retail quotation: sub-totals add up to the total, and the total is the same money as before', sum(zs.map((z) => z.sub)) === q.gross && (await sheetTotal(p, 'Total')) === q.net && zs.every((z, i) => z.sub === q.zoneResults[i].subtotal), `${sum(zs.map((z) => z.sub))} vs ${q.gross}`);
    await p.locator('.quote-print-sheet [data-zone-subtotal]').nth(0).locator('xpath=ancestor::div[1]').screenshot({ path: path.join(outDir, 'money-retail-sheet.png') });
    await p.keyboard.press('Escape');
    await p.locator('.quote-print-overlay button:has(svg.lucide-x)').click().catch(() => {});
    await p.waitForSelector('.quote-print-sheet', { state: 'detached' });
    let xl = await excelRows(p);
    check('#10 retail Excel (the real downloaded file): rows = sub-total, sub-totals = total', addsUp(xl.zones) && sum(xl.zones.map((z) => z.sub)) === xl.totals.Total && xl.totals.Total === q.net, `${gaps(xl.zones)} total ${xl.totals.Total}`);

    // 设计师净价版 30+10
    await p.getByRole('button', { name: 'Designer 净价' }).click();
    await p.locator('[data-designer-disc]').fill('30+10');
    await p.locator('[data-designer-disc]').blur();
    const supply = Math.round((q.gross - q.excluded) * 0.63) + Math.round(q.excluded);
    await p.getByRole('button', { name: /Quote 报价单/ }).click();
    await p.waitForSelector('.quote-print-sheet [data-zone-subtotal]');
    zs = await sheetZones(p);
    const stone = zs.flatMap((z) => z.rows).filter((r) => /Sintered Stone/.test(r.label));
    check('#4 designer NET quotation: stone rows print RM 800 / L.m (not the discounted RM 504)', stone.length === 2 && stone.every((r) => r.unit === 800) && sum(stone.map((r) => r.amount)) === 3424, JSON.stringify(stone));
    const door = zs[1].rows.find((r) => /Door: A Series/.test(r.label));
    check('#4 designer NET quotation: other rows still carry the supply discount (× 0.63)', !!door && door.unit < 800 && door.unit > 0, JSON.stringify(door));
    check('#4/#10 designer NET quotation: rows = sub-total, sub-totals = Designer Total', addsUp(zs) && sum(zs.map((z) => z.sub)) === supply && (await sheetTotal(p, 'Designer Total')) === supply, `${gaps(zs)} · ${sum(zs.map((z) => z.sub))} vs ${supply}`);
    await p.locator('.quote-print-sheet [data-zone-subtotal]').nth(1).locator('xpath=ancestor::div[1]').screenshot({ path: path.join(outDir, 'money-net-sheet.png') }); // 厨房那一段（有岩板）
    await p.locator('.quote-print-overlay button:has(svg.lucide-x)').click();
    await p.waitForSelector('.quote-print-sheet', { state: 'detached' });
    xl = await excelRows(p);
    const xstone = xl.zones.flatMap((z) => z.rows).filter((r) => /Sintered Stone/.test(r.label));
    check('#4/#10 designer NET Excel (downloaded): stone at RM 800, rows = sub-total, sub-totals = Designer Total', /_DESIGNER_NET\.xlsx$/.test(xl.name) && xstone.length === 2 && xstone.every((r) => r.unit === 800) && addsUp(xl.zones) && sum(xl.zones.map((z) => z.sub)) === supply && xl.totals['Designer Total'] === supply, `${gaps(xl.zones)} total ${xl.totals['Designer Total']} vs ${supply}`);

    // ---------- 问题 9：折扣只能 0–100% ----------
    await p.locator('[data-designer-disc]').fill('150');
    await p.locator('[data-designer-disc]').blur();
    check('#9 designer discount 150 → 100 (supply price cannot go negative)', (await p.locator('[data-designer-disc]').inputValue()) === '100' && /零售 × 0%/.test(await p.locator('[data-designer-disc]').locator('xpath=..').innerText()), await p.locator('[data-designer-disc]').inputValue());
    await p.locator('[data-designer-disc]').fill('30+10');
    await p.locator('[data-designer-disc]').blur();
    await p.getByRole('button', { name: 'Retail 零售' }).click();
    const pct = p.locator('[data-discount-pct]');
    const netNow = async () => rm(await pct.locator('xpath=ancestor::div[contains(@class,"mt-2")][1]/preceding-sibling::div[1]').innerText().then((t) => t.match(/RM [\d,-]+/g).pop()));
    await pct.fill('150');
    await p.waitForFunction(() => document.querySelector('[data-discount-pct]').value === '100');
    const over = await netNow();
    await p.screenshot({ path: path.join(outDir, 'money-discount.png') });
    check('#9 discount 150% → the box goes back to 100 and says why; the total is the stone only, never negative', over === q.excluded && over > 0 && (await p.locator('text=折扣只能填 0–100%').count()) > 0, `net ${over}`);
    await pct.fill('-10');
    await p.waitForFunction(() => document.querySelector('[data-discount-pct]').value === '0');
    check('#9 discount −10% → 0 (no hidden surcharge)', (await netNow()) === q.gross, `net ${await netNow()}`);
    await pct.fill('7');
    check('#9 a normal discount (7%) is untouched', (await netNow()) === computeRecordQuote(record({ adjustPct: 7 })).net, `net ${await netNow()}`);
    check('no browser errors (quotation / Excel / discount)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // 旧记录里已经存了 150% 的：打开就照 100% 算
  {
    const { ctx, p } = await openWith(browser, record({ adjustPct: 150 }));
    check('#9 an old quote saved with 150% opens as 100%', (await p.locator('[data-discount-pct]').inputValue()) === '100');
    await ctx.close();
  }

  // ---------- 问题 2：AI 加进来的柜子照房间楼高（主卧 3.0 m）----------
  const aiAnswer = JSON.parse(readFileSync(path.join(FIX, 'plan-ai-demo.json'), 'utf8'));
  // 假回答是整张原图的 px；送去的图会去白边 → 换成送去那张图的 px（同真的 AI）
  const toSent = (ans, body) => {
    const c = body.crop || { x: 0, y: 0, w: body.w }, k = body.w / c.w;
    const P = (pt) => [(pt[0] - c.x) * k, (pt[1] - c.y) * k];
    const B = (b) => [...P([b[0], b[1]]), ...P([b[2], b[3]])];
    return { ...ans, scale: { ...ans.scale, a: P(ans.scale.a), b: P(ans.scale.b) }, rooms: ans.rooms.map((r) => ({ ...r, box: B(r.box) })), suggestions: ans.suggestions.map((sg) => ({ ...sg, segments: sg.segments.map(B) })) };
  };
  const mockAi = (p, ans) => p.route('**/api/plan-ai', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: toSent(ans, route.request().postDataJSON()), model: 'claude-opus-5-5', usage: { input: 2600, output: 1400 } }) }));
  const empty = (ceilingH) => record({ zones: [{ id: 'z1', name: 'Master Bedroom 主卧', items: [], cabinets: [], ceilingH, collapsed: false }] });
  const readPlan = async (p) => {
    await p.locator('[data-plan-file]').setInputFiles(path.join(FIX, 'floorplan.png'));
    await p.waitForSelector('[data-plan-svg] image', { timeout: 15000 });
    await p.locator('[data-plan-ai]').click();
    await p.getByRole('button', { name: /Read 开始/ }).click();
    await p.waitForSelector('[data-plan-ai-panel="result"]', { timeout: 15000 });
  };
  for (const ceilingH of [3000, null]) {
    const { ctx, p, errors } = await openWith(browser, empty(ceilingH));
    await mockAi(p, aiAnswer);
    await readPlan(p);
    await p.locator('[data-plan-ai-scale-ok]').click();
    await p.waitForSelector('[data-plan-ai-list]');
    await p.locator('[data-plan-ai-add]').click();
    await p.waitForSelector('[data-plan-ai-panel]', { state: 'detached' });
    const saved = await p.waitForFunction(() => {
      const r = JSON.parse(localStorage.getItem('kira.records.v1') || '{}').records?.[0];
      const z = r?.zones?.find((x) => x.name === 'Master Bedroom 主卧');
      return z?.cabinets?.length ? z.cabinets[0] : null;
    }, null, { timeout: 10000 }).then((h) => h.jsonValue());
    const want = ceilingH || 2700;
    const byHand = setPlanSize(newCabinet('wardrobe', { ceilingH: ceilingH || undefined }), { W: saved.spec.W }).cab;
    const cardTxt = await p.locator('body').innerText(); // 柜子卡片上写着「2.40 × 3.00 × 0.60 m」
    check(ceilingH ? '#2 AI wardrobe added to a 3.00 m room is built 3.00 m tall and priced like one added by hand' : '#2 room with no ceiling height → AI wardrobe stays at the default 2.70 m',
      saved.spec.H === want && Math.round(cabinetTotal(saved)) === Math.round(cabinetTotal(byHand)) && cardTxt.includes(`${(saved.spec.W / 1000).toFixed(2)} × ${(want / 1000).toFixed(2)} × 0.60 m`),
      `H ${saved.spec.H}, RM ${Math.round(cabinetTotal(saved))} vs by hand RM ${Math.round(cabinetTotal(byHand))}`);
    if (ceilingH) {
      const low = setPlanSize(newCabinet('wardrobe', {}), { W: saved.spec.W }).cab;
      check('#2 the 3.00 m wardrobe costs more than the same one at 2.70 m (the under-quote is gone)', cabinetTotal(saved) > cabinetTotal(low) * 1.09, `RM ${Math.round(cabinetTotal(saved))} vs RM ${Math.round(cabinetTotal(low))}`);
      await p.locator('text=K1').first().scrollIntoViewIfNeeded();
      await p.screenshot({ path: path.join(outDir, 'money-ai-ceiling.png') });
    }
    if (!ceilingH) {
      // ---------- 楼高提醒（用户 11/20 选方案 2）：AI 先加进没楼高的房间 → 补填 3.00 → 提醒 → 按了才做到顶 ----------
      const savedCab = () => p.evaluate(() => JSON.parse(localStorage.getItem('kira.records.v1')).records[0].zones.find((x) => x.name === 'Master Bedroom 主卧').cabinets[0]);
      const ceil = p.locator('input[placeholder="2.70"]').first();
      const setCeil = async (v) => { await ceil.fill(v); await ceil.blur(); };
      check('ceiling reminder: no ceiling filled → no reminder', (await p.locator('[data-ceiling-stale]').count()) === 0);
      await setCeil('3');
      await p.waitForSelector('[data-ceiling-stale]', { timeout: 5000 });
      const bar = await p.locator('[data-ceiling-stale]').innerText();
      const before = await savedCab();
      const at30 = setPlanSize(newCabinet('wardrobe', { ceilingH: 3000 }), { W: before.spec.W }).cab;
      const plus = Math.round(cabinetTotal(at30) - cabinetTotal(before));
      check('ceiling reminder: fill in 3.00 → "K1 还是 2.70 m · 总价 +RM …", and the wardrobe has NOT changed by itself',
        /楼高 3\.00 m，但 K1 还是 2\.70 m/.test(bar) && bar.replace(/\u00a0/g, ' ').includes(`+RM ${plus.toLocaleString('en-MY')}`) && before.spec.H === 2700, bar.replace(/\s+/g, ' '));
      await p.locator('[data-ceiling-stale]').scrollIntoViewIfNeeded();
      await p.locator('[data-ceiling-stale]').locator('xpath=..').screenshot({ path: path.join(outDir, 'money-ceiling-reminder.png') });
      await p.locator('[data-ceiling-fit]').click();
      await p.waitForSelector('[data-ceiling-done]');
      const after = await savedCab();
      check('ceiling reminder: "Fit all" → K1 becomes 3.00 m, same price as one made by hand in a 3.00 m room; "undo" offered',
        after.spec.H === 3000 && Math.round(cabinetTotal(after)) === Math.round(cabinetTotal(at30)) && (await p.locator('[data-ceiling-stale]').count()) === 0 && (await p.locator('body').innerText()).includes(`${(after.spec.W / 1000).toFixed(2)} × 3.00 × 0.60 m`),
        `H ${after.spec.H}`);
      await p.locator('[data-ceiling-done]').scrollIntoViewIfNeeded();
      await p.locator('[data-ceiling-done]').locator('xpath=..').screenshot({ path: path.join(outDir, 'money-ceiling-done.png') });
      await p.locator('[data-ceiling-undo]').click();
      await p.waitForSelector('[data-ceiling-done]', { state: 'detached' });
      check('ceiling reminder: "Undo" → back to 2.70 m and no reminder for 3.00 any more', (await savedCab()).spec.H === 2700 && (await p.locator('[data-ceiling-stale]').count()) === 0);
      await setCeil('3.1');
      await p.waitForSelector('[data-ceiling-stale]', { timeout: 5000 });
      check('ceiling reminder: a different ceiling (3.10) asks again', /K1 还是 2\.70 m/.test(await p.locator('[data-ceiling-stale]').innerText()));
      await p.locator('[data-ceiling-keep]').click();
      await p.waitForSelector('[data-ceiling-stale]', { state: 'detached' });
      await p.reload();
      await p.waitForSelector('[data-discount-pct]');
      check('ceiling reminder: "Keep" → hidden, the wardrobe stays 2.70 m, still hidden after reloading', (await p.locator('[data-ceiling-stale]').count()) === 0 && (await savedCab()).spec.H === 2700);
    }
    check(`no browser errors (AI add, ceiling ${ceilingH || 'not set'})`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 问题 8：AI 读到的比例不合理 → 不给「用这个」，请业务自己量 ----------
  {
    const { ctx, p, errors } = await openWith(browser, empty(null));
    await mockAi(p, { ...aiAnswer, scale: { ...aiAnswer.scale, mm: 90000 } }); // 同一条尺寸线读成 90 米
    await readPlan(p);
    await p.waitForSelector('[data-plan-ai-scale-bad]', { timeout: 10000 });
    const txt = await p.locator('[data-plan-ai-scale-bad]').innerText();
    check('#8 AI reads the scale as 90 m → not offered; the message says why and asks to measure a wall',
      (await p.locator('[data-plan-ai-scale-ok]').count()) === 0 && /90\.00 m/.test(txt) && /卧室变成 164\.00 米宽/.test(txt) && /量一道墙/.test(txt) && (await p.locator('[data-plan-ai-list]').count()) === 0, txt.replace(/\s+/g, ' '));
    check('#8 the board is already in "set scale" mode so the salesperson can tap two points', (await p.locator('[data-plan-scale]').count()) === 1);
    await p.locator('[data-plan-board]').screenshot({ path: path.join(outDir, 'money-scale-bad.png') });
    check('no browser errors (AI scale check)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
process.exit(failed ? 1 : 0);
