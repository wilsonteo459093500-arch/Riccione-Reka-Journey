#!/usr/bin/env node
// 真浏览器走一遍：手机尺寸打开邀请函 → 拆信 → 填回复 → 送出 → 主人页看到名单。
// 也测「没接存储」时会改走 WhatsApp。截图存到 SHOTS 目录。
//   node test/browser.mjs [shotsDir]
// 需要 playwright（全局装的也行）和 Chromium。

import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.resolve(process.argv[2] || path.join(ROOT, '.data', 'shots'));

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try {
      return require(p);
    } catch {
      /* next */
    }
  }
  throw new Error('playwright not found');
}

function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'dev.mjs')], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    const onData = (d) => {
      out += d;
      const m = out.match(/http:\/\/localhost:(\d+)/);
      if (m) resolve({ child, url: `http://localhost:${m[1]}` });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('exit', (code) => reject(new Error(`dev server exited ${code}: ${out}`)));
    setTimeout(() => reject(new Error('dev server timeout')), 10000);
  });
}

const failures = [];
function check(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else {
    console.log('  ✗ ' + msg);
    failures.push(msg);
  }
}

async function main() {
  const { chromium, devices } = loadPlaywright();
  await mkdir(SHOTS, { recursive: true });
  const dataDir = await mkdtemp(path.join(tmpdir(), 'party-e2e-'));
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];

  /* ---------- 1) 有存储：完整流程 ---------- */
  const s1 = await startServer({ PORT: '8791', PARTY_STORE_DIR: dataDir, PARTY_HOST_KEY: 'e2e-key' });
  try {
    console.log('有存储：');
    const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'zh-CN' });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    await page.goto(s1.url + '/?to=Ah%20Meng', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(SHOTS, '01-cover.png') });
    check((await page.textContent('body')).includes('Ah Meng'), '封面写上客人名字');

    await page.click('#openBtn');
    await page.waitForFunction(() => document.body.dataset.state === 'open', null, { timeout: 8000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SHOTS, '02-opened.png') });

    // 往下滑，让标注、动画都跑起来
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 500) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(350);
    }
    await page.evaluate(() => document.querySelector('#photo, [data-section="photo"]')?.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(SHOTS, '03-photo.png') });
    await page.screenshot({ path: path.join(SHOTS, '03b-full.png'), fullPage: true });

    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(wide <= 0, `整页滑完没有被撑宽（多出 ${wide}px）`);

    const bodyText = await page.textContent('body');
    for (const fact of ['14/11/2026', '29-18, Jalan Haji Jaib, 84000 Muar, Johor', 'Wilson麻坡家', '张丞鹤', 'DUDU', '未来首富一岁生日', '干爹干妈召集会', '股票代码 1122']) {
      check(bodyText.includes(fact), `页面有「${fact}」`);
    }
    // 股票代码是 DUDU 真正生日 11/22，不是开会日期
    check(!bodyText.includes('1411'), '没有旧股票代码 1411');

    // 相册：7 张、点开大图、下一张、关闭
    await page.locator('#gallery').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    check((await page.locator('#reel .snap').count()) === 7, '相册有 7 张照片');
    await page.screenshot({ path: path.join(SHOTS, '03c-gallery.png') });
    await page.click('#reel .snap-btn >> nth=0');
    await page.waitForSelector('#lightbox:not([hidden])');
    await page.click('#lbNext');
    check((await page.textContent('#lbCount')).trim() === '2 / 7', '大图可以翻到下一张');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, '03d-lightbox.png') });
    await page.click('#lbClose');
    check(await page.isHidden('#lightbox'), '大图可以关闭');
    const broken = await page.evaluate(() => Array.from(document.querySelectorAll('#reel img')).filter((i) => i.complete && i.naturalWidth === 0).length);
    check(broken === 0, '相册图片都载得出来');

    // 回复
    await page.locator('#rsvpForm').scrollIntoViewIfNeeded();
    const nameVal = await page.inputValue('#rsvpForm [name="name"]');
    check(nameVal === 'Ah Meng', '名字已预填');
    await page.click('#rsvpForm .choice .yes');
    await page.click('[data-step="adults:+1"]');
    await page.click('[data-step="kids:+1"]');
    await page.click('[data-step="kids:+1"]');
    await page.click('#rsvpForm .chips label:has([value="vegetarian"])');
    await page.fill('#rsvpForm [name="wish"]', 'DUDU 生日快乐，干爹来了！');
    await page.screenshot({ path: path.join(SHOTS, '04-form.png') });
    await page.click('#rsvpSubmit');
    await page.waitForSelector('#rsvpDone:not([hidden])', { timeout: 8000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SHOTS, '05-done-yes.png') });
    check((await page.textContent('#rsvpDone')).includes('Ah Meng'), '成功画面写上名字');

    // 再打开 → 记得已回复，可修改
    await page.reload({ waitUntil: 'networkidle' });
    const remembered = await page.evaluate(() => !!localStorage.getItem('dudu.rsvp'));
    check(remembered, '本机记住了回复');

    // 再打开：先看到「欢迎回来」，再改成来不了
    await page.click('#openBtn');
    await page.waitForFunction(() => document.body.dataset.state === 'open', null, { timeout: 8000 });
    await page.locator('#welcomeBack').scrollIntoViewIfNeeded();
    check((await page.textContent('#welcomeBack')).includes('Ah Meng'), '再打开时看到「欢迎回来」');
    if (await page.isVisible('#wbEdit')) {
      await page.click('#wbEdit');
      await page.waitForTimeout(900); // 等平滑卷动停下
      await page.click('#rsvpForm .choice .no');
      check(await page.isChecked('#rsvpForm [name="attending"][value="no"]'), '改成「来不了」');
      await page.click('#rsvpSubmit');
      await page.waitForSelector('#rsvpDone:not([hidden])', { timeout: 8000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SHOTS, '06-done-no.png') });
      check(true, '可以修改回复');
    } else {
      check(false, '再打开时看得到「修改回复」');
    }

    // 英文
    await page.goto(s1.url + '/?lang=en', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(SHOTS, '07-cover-en.png') });
    await page.click('#openBtn');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SHOTS, '08-opened-en.png') });

    // 主人页
    const host = await ctx.newPage();
    host.on('pageerror', (e) => consoleErrors.push('host: ' + String(e)));
    await host.goto(s1.url + '/host', { waitUntil: 'networkidle' });
    await host.fill('#keyInput', 'wrong');
    await host.click('#loginForm button[type=submit]');
    await host.waitForTimeout(1200);
    check((await host.textContent('#loginMsg')).includes('密码不对'), '主人页：错密码被拒');
    await host.fill('#keyInput', 'e2e-key');
    await host.click('#loginForm button[type=submit]');
    await host.waitForSelector('#board:not([hidden])', { timeout: 5000 });
    await host.waitForTimeout(1000);
    await host.screenshot({ path: path.join(SHOTS, '09-host.png'), fullPage: true });
    const hostText = await host.textContent('#guestList');
    check(hostText.includes('Ah Meng'), '主人页看得到 Ah Meng');
    check(hostText.includes('来不了'), '主人页显示已改成来不了');

    await ctx.close();
  } finally {
    s1.child.kill();
  }

  /* ---------- 2) 没接存储：WhatsApp 后备 ---------- */
  const s2 = await startServer({ PORT: '8792', PARTY_NO_STORE: '1' });
  try {
    console.log('没接存储：');
    const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'zh-CN' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    await page.goto(s2.url + '/', { waitUntil: 'networkidle' });
    await page.click('#openBtn');
    await page.waitForTimeout(1500);
    await page.locator('#rsvpForm').scrollIntoViewIfNeeded();
    await page.fill('#rsvpForm [name="name"]', 'Mei Ling');
    await page.click('#rsvpForm .choice .yes');
    const popup = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
    await page.click('#rsvpSubmit');
    const pop = await popup;
    await page.waitForTimeout(1500);
    const waHref = await page.getAttribute('#waLink', 'href').catch(() => null);
    const popUrl = pop ? pop.url() : '';
    const waUrl = /wa\.me|whatsapp/.test(popUrl) ? popUrl : waHref || '';
    check(/wa\.me\/60163881919/.test(waUrl) || /api\.whatsapp\.com/.test(waUrl), 'WhatsApp 后备链接指向主人号码');
    check(decodeURIComponent(waUrl).includes('Mei Ling'), 'WhatsApp 文字带名字');
    await page.screenshot({ path: path.join(SHOTS, '10-fallback.png') });

    // 主人页：密码对了但没接存储 → 照样进得去，看到接存储步骤和发邀请
    const host = await ctx.newPage();
    host.on('pageerror', (e) => consoleErrors.push('host: ' + String(e)));
    await host.goto(s2.url + '/host', { waitUntil: 'networkidle' });
    await host.fill('#keyInput', 'wrong');
    await host.click('#loginForm button[type=submit]');
    await host.waitForTimeout(1200);
    check((await host.textContent('#loginMsg')).includes('密码不对'), '没接存储：错密码照样被拒');
    await host.fill('#keyInput', 'dev');
    await host.click('#loginForm button[type=submit]');
    const inBoard = await host.waitForSelector('#board:not([hidden])', { timeout: 5000 }).then(() => true, () => false);
    check(inBoard, '没接存储：对的密码进得了名册页');
    check(await host.isVisible('#setupCard'), '没接存储：显示接存储步骤');
    check(!(await host.isVisible('.h-stats')), '没接存储：不显示 0 人的假统计');
    check(await host.isVisible('#genText'), '没接存储：发专属邀请照样能用');
    await host.screenshot({ path: path.join(SHOTS, '10b-host-nostore.png'), fullPage: true });
    await host.reload({ waitUntil: 'networkidle' });
    await host.waitForTimeout(800);
    check(await host.isVisible('#setupCard'), '没接存储：重新打开不用再输密码');
    await ctx.close();
  } finally {
    s2.child.kill();
  }

  /* ---------- 3) 窄屏 + 减少动态 ---------- */
  const s3 = await startServer({ PORT: '8793', PARTY_STORE_DIR: dataDir });
  try {
    console.log('窄屏 / reduced motion：');
    const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    await page.goto(s3.url + '/', { waitUntil: 'networkidle' });
    await page.click('#openBtn');
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 0, `320px 宽没有横向卷动（多出 ${overflow}px）`);
    await page.screenshot({ path: path.join(SHOTS, '11-narrow.png'), fullPage: true });
    await ctx.close();
  } finally {
    s3.child.kill();
  }

  await browser.close();
  await rm(dataDir, { recursive: true, force: true });

  check(consoleErrors.length === 0, '没有 JS 错误' + (consoleErrors.length ? '：' + consoleErrors.join(' | ') : ''));
  console.log(`\n截图：${SHOTS}`);
  if (failures.length) {
    console.log(`\n${failures.length} 项没过`);
    process.exit(1);
  }
  console.log('\n全部通过');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
