// 拍照 / 相册兼容（华为没有谷歌 Chrome、App 内置浏览器）：
//   A 普通安卓：点「拍照」直接打开系统选择器（不靠代码 click()）；点了没弹出 → 提示 → 网页相机拍 2 张存进报告；
//     弹出了（页面失焦）不误报；普通手机不多出「网页相机」按钮
//   B 华为浏览器：多一个「网页相机」，拍照 + 每日汇报退场视频用网页相机录像
//   C App 内置浏览器（Android WebView）：顶部提示用浏览器打开，可关掉
//   D 相机权限被拒：网页相机里说明怎么开权限
//   E English 界面：上面这些新界面没有中文
// 用 Chromium 的假摄像头（--use-fake-device-for-media-stream），产物在 test/out/camera/
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'out', 'camera');
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

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  huawei: 'Mozilla/5.0 (Linux; Android 12; HarmonyOS; NOH-AN00; HMSCore 6.13.0.302) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 HuaweiBrowser/15.0.4.312 Mobile Safari/537.36',
  webview: 'Mozilla/5.0 (Linux; Android 12; NOH-AN00 Build/HUAWEINOH-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0.5735.196 Mobile Safari/537.36',
};

const { chromium } = await loadPlaywright();
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5193, strictPort: false } });
await server.listen();
const BASE = server.resolvedUrls.local[0].replace(/\/$/, '');
const fakeCam = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: fakeCam });
const errors = [];
let nav = 0;

async function newPage(ua, { lang = 'zh', camera = true, b = browser } = {}) {
  const context = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: lang === 'en' ? 'en-US' : 'zh-CN',
    userAgent: ua,
    permissions: camera ? ['camera', 'clipboard-read', 'clipboard-write'] : [],
  });
  // 数一数有没有代码去 click() 选文件框（应该一次都没有：要靠手指直接点到 input）
  await context.addInitScript(() => {
    window.__fileClicks = 0;
    const orig = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') window.__fileClicks += 1;
      return orig.call(this);
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return page;
}

async function go(page, hash) {
  nav += 1;
  await page.goto(`${BASE}/?n=${nav}#${hash}`);
  await page.waitForFunction(() => document.querySelector('#root')?.children.length && !document.querySelector('.animate-spin:only-child'));
  await page.waitForTimeout(300);
}

// 准备：项目 + 安装质检清单 + 每日汇报
async function seed(page, uiLang = 'zh') {
  await go(page, '/');
  return page.evaluate(async (uiLang) => {
    const { db, setSetting } = await import('/src/lib/db.js');
    const { createReport } = await import('/src/lib/report.js');
    const { getTemplate } = await import('/src/templates/index.js');
    const now = Date.now();
    const P = { id: 'p_cam', name: 'Tuai Timur Residence', unit: '17-3', client: 'Hailey', address: 'Unit 17-3, Kuala Lumpur', startDate: '2026-10-08', plannedDays: 5, createdAt: now, updatedAt: now };
    const S = { name: 'Wilson', phone: '016-3881819', dept: 'Installation', company: 'Sail by Riccione Reka', uiLang, crewChosen: true };
    await db.put('projects', P);
    await setSetting('settings', S);
    const qc = createReport(getTemplate('quality-check'), { project: P, settings: S, previous: [] });
    const daily = createReport(getTemplate('daily-report'), { project: P, settings: S, previous: [] });
    await db.put('reports', qc);
    await db.put('reports', daily);
    return { qc: qc.id, daily: daily.id };
  }, uiLang);
}

const thumbs = (scope) => scope.locator('img');
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) });

// 第一个检查项，展开照片区
async function firstItem(page) {
  const card = page.locator('[id^="item-"]').first();
  const toggle = card.getByRole('button', { name: /^(照片|Photos?)$/ });
  if (await toggle.count()) await toggle.first().click();
  return card;
}

// 网页相机里拍 n 张，点完成
async function shootWebCam(page, n) {
  const dialog = page.getByRole('dialog');
  const shutter = dialog.locator('[data-shutter]');
  await shutter.waitFor();
  await page.waitForFunction(() => {
    const b = document.querySelector('[data-shutter]');
    const v = document.querySelector('[role="dialog"] video');
    return b && !b.disabled && v && v.videoWidth > 0;
  }, null, { timeout: 15000 });
  for (let i = 0; i < n; i++) {
    await shutter.click();
    await page.waitForTimeout(350);
  }
  await dialog.getByRole('button', { name: new RegExp(`^(完成|Done).*\\(${n}\\)$`) }).click();
  await dialog.waitFor({ state: 'detached' });
}

const results = [];
try {
  // ---------- A 普通安卓 ----------
  {
    const page = await newPage(UA.android);
    const ids = await seed(page);
    await go(page, `/r/${ids.qc}`);
    const card = await firstItem(page);

    // 1. 点「拍照」→ 直接弹出系统选择器（相机）
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), card.getByRole('button', { name: '拍照', exact: true }).click()]);
    assert.equal(await chooser.element().getAttribute('accept'), 'image/*');
    assert.equal(await chooser.element().getAttribute('capture'), 'environment');
    await chooser.setFiles([join(ASSETS, 'photo1.jpg')]);
    await thumbs(card).first().waitFor();
    assert.equal(await page.evaluate(() => window.__fileClicks), 0, '还在用代码 click() 打开选文件框');
    assert.equal(await card.getByRole('button', { name: '网页相机', exact: true }).count(), 0, '普通手机不该多出「网页相机」');
    results.push('A1 点「拍照」直接弹出系统相机（没有代码 click），选好的照片进报告');

    // 2. 弹出了（页面失焦）→ 不提示
    await Promise.all([page.waitForEvent('filechooser'), card.getByRole('button', { name: '相册', exact: true }).click()]);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(2600);
    assert.equal(await page.getByText('相机 / 相册没有打开？').count(), 0, '弹出了选择器还提示没打开');
    results.push('A2 选择器弹出来（页面失焦）不误报');

    // 2b. 浏览器自己没相机权限：Chromium 立刻「取消」、什么都不弹 → 马上提示（不用等）
    const [ch2] = await Promise.all([page.waitForEvent('filechooser'), card.getByRole('button', { name: '拍照', exact: true }).click()]);
    await ch2.element().evaluate((el) => el.dispatchEvent(new Event('cancel')));
    await page.getByText('相机 / 相册没有打开？').waitFor({ timeout: 1000 });
    await card.getByRole('button', { name: '关闭提示' }).click();
    // 真的弹出过再取消（页面先失焦）→ 不提示
    const [ch3] = await Promise.all([page.waitForEvent('filechooser'), card.getByRole('button', { name: '拍照', exact: true }).click()]);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await ch3.element().evaluate((el) => el.dispatchEvent(new Event('cancel')));
    await page.waitForTimeout(2600);
    assert.equal(await page.getByText('相机 / 相册没有打开？').count(), 0, '弹出后用户取消，不该提示');
    results.push('A2b 浏览器没相机权限（立刻取消、没弹出）马上提示；真弹出过再取消不提示');

    // 3. 点了什么都没弹出 → 提示 → 网页相机拍 2 张
    await page.evaluate(() => window.focus());
    await Promise.all([page.waitForEvent('filechooser'), card.getByRole('button', { name: '相册', exact: true }).click()]);
    await page.getByText('相机 / 相册没有打开？').waitFor({ timeout: 5000 });
    await shot(page, 'A3-noshow-card');
    const before = await thumbs(card).count();
    await card.getByRole('button', { name: '用网页相机拍' }).click();
    await shot(page, 'A3-webcam');
    await shootWebCam(page, 2);
    await page.waitForFunction((n) => document.querySelectorAll('[id^="item-"]')[0].querySelectorAll('img').length >= n, before + 2, { timeout: 15000 });
    assert.equal(await page.getByText('相机 / 相册没有打开？').count(), 0, '用网页相机后提示应收起');
    results.push('A3 点了没弹出 → 按钮下提示 → 网页相机拍 2 张，存进报告');

    // 4. 「怎么解决」弹层 + 设置页入口
    await Promise.all([page.waitForEvent('filechooser'), card.getByRole('button', { name: '相册', exact: true }).click()]);
    await page.getByText('相机 / 相册没有打开？').waitFor({ timeout: 5000 });
    await card.getByRole('button', { name: '怎么解决' }).click();
    await page.getByText('允许浏览器用相机和照片').waitFor();
    await shot(page, 'A4-help');
    await page.keyboard.press('Escape');
    await go(page, '/settings');
    await page.getByRole('button', { name: /拍照 \/ 相册打不开？/ }).click();
    await page.getByText('允许浏览器用相机和照片').waitFor();
    assert.equal(await page.getByText('用手机浏览器打开，不要在 App 里直接开').count(), 0, '已经在浏览器里了，不该先叫人用浏览器打开');
    // 设置里可以打开「总是显示网页相机按钮」→ 普通手机照片区也有了
    await page.getByText('照片区总是显示「网页相机」按钮').click();
    await page.keyboard.press('Escape');
    await go(page, `/r/${ids.qc}`);
    const cardW = await firstItem(page);
    await cardW.getByRole('button', { name: '网页相机', exact: true }).waitFor();
    await page.evaluate(() => localStorage.removeItem('tora.webcam'));
    results.push('A4 「怎么解决」和设置页都能打开解决办法；设置里可打开「总是显示网页相机」');
    // 数据：重新打开报告，照片都在（1 张系统相机 + 2 张网页相机）
    await go(page, `/r/${ids.qc}`);
    const card2 = await firstItem(page);
    await page.waitForTimeout(800);
    assert.ok((await thumbs(card2).count()) >= 3, `重新打开后照片不够（${await thumbs(card2).count()}）`);
    results.push('A5 重新打开报告，系统相机 + 网页相机的照片都在');
    await page.context().close();
  }

  // ---------- B 华为浏览器 ----------
  {
    const page = await newPage(UA.huawei);
    const ids = await seed(page);
    await go(page, `/r/${ids.qc}`);
    assert.equal(await page.getByText('你正在 App 里直接打开 TORA').count(), 0, '华为浏览器不是 App 内置浏览器，不该提示');
    const card = await firstItem(page);
    const tile = card.getByRole('button', { name: '网页相机', exact: true });
    await tile.waitFor();
    await shot(page, 'B1-huawei-tiles');
    await tile.click();
    await shootWebCam(page, 1);
    await thumbs(card).first().waitFor({ timeout: 15000 });
    results.push('B1 华为浏览器：照片区多一个「网页相机」，拍了存进报告');

    // 横着拿（屏幕锁竖屏）：照片要转正。假摄像头给 640×480 横画面；右边朝上（x≈+9.8）→ 逆时针转 90° → 竖图
    const dims = async () =>
      page.evaluate(async () => {
        const { db } = await import('/src/lib/db.js');
        const all = (await db.getAll('media')).filter((m) => m.kind === 'photo').sort((a, b) => a.createdAt - b.createdAt);
        const m = all[all.length - 1];
        return m ? { w: m.w, h: m.h } : null;
      });
    const before1 = await dims();
    assert.ok(before1 && before1.w > before1.h, `竖着拿拍的应是横图（摄像头原样）：${JSON.stringify(before1)}`);
    await tile.click();
    await page.locator('[data-shutter]').waitFor();
    await page.waitForFunction(() => document.querySelector('[role="dialog"] video')?.videoWidth > 0, null, { timeout: 15000 });
    await page.evaluate(() => {
      const e = new Event('devicemotion');
      Object.defineProperty(e, 'accelerationIncludingGravity', { value: { x: 9.8, y: 0.2, z: 0.5 } });
      window.dispatchEvent(e);
    });
    await shootWebCam(page, 1);
    await page.waitForTimeout(1500);
    const rotated = await dims();
    assert.ok(rotated && rotated.h > rotated.w, `横着拿拍的照片没转正：${JSON.stringify(rotated)}`);
    results.push('B1b 屏幕锁竖屏、横着拿：网页相机照片自动转正');

    // 上限：检查项最多 12 张，已有 10 张 → 网页相机只能再拍 2 张（不能拍一半就停，也不能超）
    await page.evaluate(async (rid) => {
      const { db } = await import('/src/lib/db.js');
      const r = await db.get('reports', rid);
      const first = Object.keys(r.items).find((k) => r.items[k]?.photos) || Object.keys(r.items)[0];
      const keep = r.items[first]?.photos || [];
      r.items[first] = { ...(r.items[first] || {}), photos: [...keep, ...Array.from({ length: Math.max(0, 10 - keep.length) }, (_, i) => `m_fake${i}`)] };
      await db.put('reports', r);
    }, ids.qc);
    await go(page, `/r/${ids.qc}`);
    const cardL = await firstItem(page);
    await cardL.getByRole('button', { name: '网页相机', exact: true }).click();
    const shutterL = page.locator('[data-shutter]');
    await page.waitForFunction(() => document.querySelector('[role="dialog"] video')?.videoWidth > 0, null, { timeout: 15000 });
    await shutterL.click();
    await page.waitForTimeout(400);
    assert.equal(await shutterL.isDisabled(), false, '还差 1 张就不让拍了（照片被算了两次）');
    await shutterL.click();
    await page.waitForTimeout(500);
    assert.equal(await shutterL.isDisabled(), true, '到 12 张上限还能拍');
    await page.getByRole('dialog').getByRole('button', { name: /^完成 \(2\)$/ }).click();
    results.push('B1c 网页相机按真实剩余张数拍：已有 10 张时正好再拍 2 张');

    // 每日汇报：退场视频用网页相机录
    await go(page, `/r/${ids.daily}`);
    const recBtn = page.getByRole('button', { name: /用网页相机录像/ });
    await recBtn.scrollIntoViewIfNeeded();
    await recBtn.click();
    const dialog = page.getByRole('dialog');
    const start = dialog.getByRole('button', { name: '开始录像' });
    await page.waitForFunction(() => {
      const v = document.querySelector('[role="dialog"] video');
      return v && v.videoWidth > 0;
    }, null, { timeout: 15000 });
    await start.click();
    await page.waitForTimeout(2500);
    await shot(page, 'B2-recording');
    await dialog.getByRole('button', { name: '停止录像' }).click();
    await dialog.waitFor({ state: 'detached', timeout: 10000 });
    await page.getByText('已添加视频').waitFor({ timeout: 20000 });
    await shot(page, 'B2-video-added');
    results.push('B2 每日汇报退场视频：网页相机录像，停止后存进报告');
    await page.context().close();
  }

  // ---------- C App 内置浏览器 ----------
  {
    const page = await newPage(UA.webview);
    await seed(page);
    await go(page, '/');
    await page.getByText('你正在 App 里直接打开 TORA').waitFor();
    await shot(page, 'C1-inapp-banner');
    await page.getByRole('button', { name: '复制链接' }).first().click();
    await page.getByText(/链接已复制|复制失败/).first().waitFor();
    // 普通打开：复制的是首页（本机的报告地址换个浏览器打不开）
    const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    assert.ok(/\/#\/$/.test(copied), `复制的不是首页：${copied}`);
    await page.getByRole('button', { name: '关闭提示' }).first().click();
    assert.equal(await page.getByText('你正在 App 里直接打开 TORA').count(), 0);
    results.push('C1 App 内置浏览器：顶部提示用浏览器打开、能复制链接（首页）、能关掉');

    // 师傅链接进来：跳到报告页后，复制的仍是师傅链接（换个浏览器打开能重新导入项目）
    const payload = await page.evaluate(async () => {
      const { db, getSetting } = await import('/src/lib/db.js');
      const { crewPayload } = await import('/src/lib/crew.js');
      return crewPayload(await db.get('projects', 'p_cam'), await getSetting('settings', {}));
    });
    await page.evaluate(() => sessionStorage.clear());
    await go(page, `/crew/${payload}`);
    await page.waitForFunction(() => location.hash.startsWith('#/r/'), null, { timeout: 15000 });
    await page.getByRole('button', { name: '复制链接' }).first().click();
    await page.waitForTimeout(300);
    const crewCopied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    assert.ok(crewCopied.includes(`#/crew/${payload}`), `师傅进来后复制的不是师傅链接：${crewCopied.slice(0, 80)}`);
    assert.equal(await page.locator('a[href^="intent:"]').count(), 0, '普通 WebView 不该给 intent 链接（可能直接打不开）');
    results.push('C2 师傅链接进来后跳到报告页，复制的仍是师傅链接；普通 WebView 不给 intent 链接');
    await page.context().close();
  }

  // ---------- D 相机权限被拒 ----------
  {
    // 无头 Chromium 弹不出权限框，只会报 NotSupportedError；真手机被拒是 NotAllowedError → D1 模拟这个
    const denyBrowser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-fake-device-for-media-stream'] });
    const page = await newPage(UA.huawei, { camera: false, b: denyBrowser });
    await page.context().addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    const ids = await seed(page);
    await go(page, `/r/${ids.qc}`);
    const card = await firstItem(page);
    await card.getByRole('button', { name: '网页相机', exact: true }).click();
    await page.getByText('相机权限被拒绝').waitFor({ timeout: 15000 });
    await page.getByRole('dialog').getByText(/应用和服务/).waitFor();
    await shot(page, 'D1-denied');
    assert.equal(await page.getByRole('button', { name: '再试一次' }).count(), 1);
    results.push('D1 相机权限被拒：网页相机里说明华为怎么打开权限，可「再试一次」');
    // App 内置浏览器里打不开（各 App 报的错不一样，这里是 NotSupportedError）：提示用浏览器打开（不是去改系统权限）
    const wv = await newPage(UA.webview, { camera: false, b: denyBrowser });
    const ids2 = await seed(wv);
    await go(wv, `/r/${ids2.qc}`);
    const c2 = await firstItem(wv);
    await c2.getByRole('button', { name: '网页相机', exact: true }).click();
    await wv.getByText('这个 App 里不能用相机').waitFor({ timeout: 15000 });
    await wv.getByRole('dialog').getByRole('button', { name: '复制链接' }).waitFor();
    assert.equal(await wv.getByRole('button', { name: '再试一次' }).count(), 0, 'App 里再试也没用，不该给「再试一次」');
    results.push('D2 App 内置浏览器里相机打不开：提示用浏览器打开 + 复制链接');
    await denyBrowser.close();
  }

  // ---------- E English：新界面没有中文 ----------
  {
    const page = await newPage(UA.huawei, { lang: 'en' });
    const ids = await seed(page, 'en');
    await go(page, `/r/${ids.qc}`);
    const card = await firstItem(page);
    const cjk = async (where) => {
      const hits = await page.evaluate(() => {
        const CJK = /[　-〿㐀-鿿＀-￯]/;
        const out = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
          const el = n.parentElement;
          if (!el || el.closest('[data-lang-switch],[data-doc-lang],textarea,input') || !el.getClientRects().length) continue;
          if (CJK.test(n.nodeValue)) out.push(n.nodeValue.trim().slice(0, 60));
        }
        for (const el of document.querySelectorAll('[aria-label],[placeholder]')) {
          if (el.closest('[data-lang-switch]')) continue;
          for (const a of ['aria-label', 'placeholder']) if (CJK.test(el.getAttribute(a) || '')) out.push(`@${a}=${el.getAttribute(a)}`);
        }
        return [...new Set(out)];
      });
      assert.deepEqual(hits, [], `${where} 还有中文：${hits.join(' | ')}`);
    };
    await Promise.all([page.waitForEvent('filechooser'), card.getByRole('button', { name: 'Gallery', exact: true }).click()]);
    await page.getByText("Camera / gallery didn't open?").waitFor({ timeout: 5000 });
    await cjk('提示卡片');
    await card.getByRole('button', { name: 'How to fix' }).click();
    await page.getByText('Allow the browser to use the camera and photos').waitFor();
    await cjk('解决办法弹层');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await card.getByRole('button', { name: 'Web camera', exact: true }).click();
    await page.locator('[data-shutter]').waitFor();
    await cjk('网页相机');
    await shot(page, 'E1-en-webcam');
    results.push('E1 English：提示卡片 / 解决办法 / 网页相机没有中文');
    await page.context().close();
  }
} catch (e) {
  errors.push(`脚本出错：${e.stack || e.message}`);
} finally {
  await browser.close();
  await server.close();
}

for (const r of results) console.log(`✓ ${r}`);
const real = errors.filter((e) => !/Permission|NotAllowedError|getUserMedia/i.test(e));
for (const e of real) console.log(`✗ ${e}`);
console.log(real.length ? `\n${real.length} 个问题` : `\n✓ 拍照 / 相册兼容：${results.length} 项都通过（产物在 test/out/camera/）`);
process.exit(real.length ? 1 : 0);
