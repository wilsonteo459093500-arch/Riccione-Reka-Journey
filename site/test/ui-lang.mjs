// 界面语言检查：English 模式下把每个页面扫一遍，屏幕上不应出现中文
//   - 用英文资料建项目 / 7 种报告（判定、不合格待写备注、表格行），这样屏幕上出现的中文只可能是没翻译的界面文字
//   - 跳过：语言开关本身（data-lang-switch，中 / EN / 中/EN 是给两种人看的）、跟文件语言走的内容（data-doc-lang：
//     文档预览页、WhatsApp 文案预览）、输入框里的值
//   - 也扫 placeholder / aria-label / title
// 用法：node test/ui-lang.mjs            → 有中文就列出来并以非 0 退出
//       node test/ui-lang.mjs --shots    → 另外存 English / 中英 两套截图到 test/out/ui-lang/（看排版有没有挤）
//       node test/ui-lang.mjs --only=home,settings   → 只扫部分页面（home projects settings editor export crew dialog）
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'out', 'ui-lang');
mkdirSync(OUT, { recursive: true });
const SHOTS = process.argv.includes('--shots');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const g = execSync('npm root -g').toString().trim();
    return createRequire(join(g, 'noop.js'))('playwright');
  }
}

const { chromium } = await loadPlaywright();
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5191, strictPort: false } });
await server.listen();
const BASE = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// 新手机、系统语言英文 → 应该自动是 English
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'en-US',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
});

const found = new Map(); // screen → [text]
const problems = [];
const settle = () => page.waitForTimeout(350);

async function scan(screen) {
  const hits = await page.evaluate(() => {
    const CJK = /[　-〿㐀-鿿豈-﫿＀-￯]/;
    const out = [];
    const skip = (el) => el.closest('[data-lang-switch], [data-doc-lang], script, style, noscript, textarea, input, select option');
    const visible = (el) => {
      if (!el.getClientRects().length) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const s = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (!s || !CJK.test(s)) continue;
      const el = n.parentElement;
      if (!el || skip(el) || !visible(el)) continue;
      out.push(s.slice(0, 100));
    }
    for (const el of document.querySelectorAll('[placeholder],[aria-label],[title],option')) {
      if (el.closest('[data-lang-switch], [data-doc-lang]')) continue;
      for (const a of ['placeholder', 'aria-label', 'title']) {
        const v = el.getAttribute(a);
        if (v && CJK.test(v)) out.push(`@${a}=${v.slice(0, 100)}`);
      }
      if (el.tagName === 'OPTION' && CJK.test(el.textContent)) out.push(`<option>${el.textContent.slice(0, 100)}`);
    }
    return [...new Set(out)];
  });
  if (hits.length) found.set(screen, [...(found.get(screen) || []), ...hits]);
  return hits;
}

async function shot(name) {
  if (SHOTS) await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
}

// 每次都整页重新加载（换 query 参数），这样直接写进本机数据库的资料 / 设置会被读到
let nav = 0;
async function go(hash) {
  nav += 1;
  await page.goto(`${BASE}/?n=${nav}#${hash}`);
  await page.waitForFunction(() => document.querySelector('#root')?.children.length && !document.querySelector('.animate-spin:only-child'));
  await settle();
}

// 关掉打开的弹层（Esc）
async function closeSheet() {
  await page.keyboard.press('Escape').catch(() => {});
  await settle();
}

try {
  // ---------- 0. 新手机：系统英文 → 默认 English ----------
  await page.goto(`${BASE}/`);
  await page.locator('[data-lang-switch]').first().waitFor({ timeout: 20000 });
  const checked = await page.locator('[data-lang-switch] [aria-checked="true"]').first().getAttribute('aria-label');
  if (checked !== 'English') problems.push(`新手机（系统英文）默认界面语言应为 English，实际：${checked}`);

  // ---------- 1. 用英文资料准备数据 ----------
  const ids = await page.evaluate(async () => {
    const { db, setSetting } = await import('/src/lib/db.js');
    const { createReport } = await import('/src/lib/report.js');
    const { TEMPLATES } = await import('/src/templates/index.js');
    const { resolveScale, normOptions } = await import('/src/templates/schema.js');
    const now = Date.now();
    const P = {
      id: 'p_en', name: 'Tuai Timur Residence', unit: '17-3', client: 'Hailey',
      address: 'Unit 17-3, Jalan Tuai Timur, 50450 Kuala Lumpur', mapLink: 'https://maps.app.goo.gl/x',
      so: 'SO-2026-0917', designer: 'Mei Ling', startDate: '2026-10-08', plannedDays: 5,
      entryNote: 'Register at the guard house', parking: 'Visitor parking', createdAt: now, updatedAt: now,
    };
    const S = { name: 'Wilson', phone: '016-3881819', dept: 'Installation', company: 'Sail by Riccione Reka', uiLang: 'en' };
    await db.put('projects', P);
    await setSetting('settings', S);
    const out = {};
    for (const t of TEMPLATES) {
      const r = createReport(t, { project: P, settings: S, previous: [] });
      for (const s of t.sections) {
        if (s.type === 'checklist') {
          s.items.forEach((it, i) => {
            if (it.input) {
              r.items[it.id] = { ...(r.items[it.id] || {}), value: it.input.type === 'number' ? 3 : 'Sample text' };
              return;
            }
            const sc = resolveScale(it.scale || s.scale);
            const fail = sc.options.find((o) => o.tone === 'fail') || sc.options[0];
            const pass = sc.options.find((o) => o.tone === 'pass') || sc.options[0];
            if (i === 0) r.items[it.id] = { r: fail.v, note: '', photos: [] };
            else if (i === 1) r.items[it.id] = { r: pass.v, note: 'Checked OK', photos: [] };
          });
        }
        if (s.type === 'table') {
          const row = {};
          for (const c of s.columns || []) {
            if (c.options) row[c.key] = normOptions(c.options)[0].v;
            else if (c.type === 'date') row[c.key] = '2026-10-10';
            else if (c.type === 'number') row[c.key] = 2;
            else if (c.type === 'yesno') row[c.key] = true;
            else row[c.key] = 'Sample';
          }
          r.tables[s.id] = [row];
        }
      }
      await db.put('reports', r);
      out[t.id] = r.id;
    }
    return out;
  });

  // ---------- 2. 列表页 ----------
  if (want('home')) {
    await go('/');
    await scan('home');
    await shot('en-home');
    // 选报告 → 选项目弹层
    const card = page.locator('main button.card').first();
    if (await card.count()) {
      await card.click();
      await settle();
      await scan('home › 选项目弹层');
      await shot('en-home-picker');
      await closeSheet();
    }
    // 报告行「更多」菜单
    const more = page.getByRole('button', { name: 'More' }).first();
    if (await more.count()) {
      await more.click();
      await settle();
      await scan('home › 报告菜单');
      await shot('en-home-menu');
      await closeSheet();
    } else problems.push('首页报告行找不到 aria-label="More" 的菜单按钮（English）');
  }

  if (want('projects')) {
    await go('/projects');
    await scan('projects');
    await shot('en-projects');
    await go('/projects/new');
    await scan('projects › 新项目');
    await shot('en-project-new');
    await go('/projects/p_en');
    await scan('projects › 编辑项目');
    await shot('en-project-edit');
  }

  if (want('settings')) {
    await go('/settings');
    await scan('settings');
    await shot('en-settings');
  }

  // ---------- 3. 每种报告：填写页 + 导出页 ----------
  for (const [tid, rid] of Object.entries(ids)) {
    if (want('editor')) {
      await go(`/r/${rid}`);
      // 展开所有「更多说明」等折叠内容
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await settle();
      await scan(`editor › ${tid}`);
      await shot(`en-editor-${tid}`);
    }
    if (want('export')) {
      await go(`/r/${rid}/export`);
      await page.waitForTimeout(1500);
      await scan(`export › ${tid}`);
      await shot(`en-export-${tid}`);
    }
  }

  // ---------- 4. 师傅模式首页 + 师傅链接页 ----------
  if (want('crew')) {
    const payload = await page.evaluate(async () => {
      const { db, getSetting, setSetting } = await import('/src/lib/db.js');
      const { crewPayload } = await import('/src/lib/crew.js');
      const p = await db.get('projects', 'p_en');
      const s = await getSetting('settings', {});
      return crewPayload(p, s);
    });
    await go(`/crew/${payload}`);
    await page.waitForTimeout(1200);
    await scan('crew › 师傅链接打开');
    await shot('en-crew-open');
    await page.evaluate(async () => {
      const { getSetting, setSetting } = await import('/src/lib/db.js');
      await setSetting('settings', { ...(await getSetting('settings', {})), crew: true, crewChosen: true });
    });
    await go('/');
    await scan('crew › 师傅模式首页');
    await shot('en-crew-home');
    await page.evaluate(async () => {
      const { getSetting, setSetting } = await import('/src/lib/db.js');
      await setSetting('settings', { ...(await getSetting('settings', {})), crew: false });
    });
  }

  // ---------- 5. 拍照被系统关掉后的提示框 ----------
  if (want('dialog')) {
    await page.evaluate(() => localStorage.setItem('tora.picker', JSON.stringify({ kind: 'camera', at: Date.now() })));
    await go('/');
    await page.waitForTimeout(500);
    await scan('dialog › 拍照中断提示');
    await shot('en-dialog-interrupt');
  }

  // ---------- 6. 中英模式截图（只看排版） ----------
  if (SHOTS) {
    await page.evaluate(async () => {
      const { getSetting, setSetting } = await import('/src/lib/db.js');
      await setSetting('settings', { ...(await getSetting('settings', {})), uiLang: 'both' });
    });
    for (const [name, hash] of [['home', '/'], ['projects', '/projects'], ['settings', '/settings'], ['editor-qc', `/r/${ids['quality-check']}`], ['export-qc', `/r/${ids['quality-check']}/export`], ['editor-daily', `/r/${ids['daily-report']}`]]) {
      await go(hash);
      await page.waitForTimeout(600);
      await shot(`both-${name}`);
    }
  }
} catch (e) {
  problems.push(`脚本出错：${e.stack || e.message}`);
} finally {
  await browser.close();
  await server.close();
}

let bad = 0;
for (const [screen, hits] of found) {
  console.log(`\n✗ ${screen}`);
  for (const h of [...new Set(hits)]) console.log(`    ${h}`);
  bad += hits.length;
}
for (const p of problems) console.log(`\n✗ ${p}`);
for (const e of errors) console.log(`\n⚠ ${e}`);
if (!bad && !problems.length) console.log('\n✓ English 模式下各页面没有残留中文');
else console.log(`\n共 ${bad} 处中文残留，${problems.length} 个问题`);
process.exit(bad || problems.length ? 1 : 0);
