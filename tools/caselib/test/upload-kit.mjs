/* ============================================================
   上传页（caselib.html）浏览器测试的共用工具 —— 不是测试档本身
   - fixtures()：用 upload-fixtures.py 产生假文件夹（有就沿用；脚本改了才重产）
   - launch()：Playwright Chromium。一定要 LANG=C.UTF-8：
     不然 Chromium 读不到中文路径的档案（File 大小 0、NotReadableError）
   - 资料夹：CASELIB_SCRATCH/{fixtures,shots}，没设就放 os.tmpdir()/caselib-upload
   - 名字都是假的；照片是 PIL 画的方块
   ============================================================ */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../../..');
export const BASE = process.env.CASELIB_SCRATCH || join(tmpdir(), 'caselib-upload');
export const FIX = join(BASE, 'fixtures');
export const SHOTS = join(BASE, 'shots');
export const PASSWORD = 'test-pass';   // 同一个 process 的 mock 要用同一个密码（写在 process.env）

const PW = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';

// 几个测试档同时跑（node --test 一个档一个 process）：用 lock 资料夹排队，免得互相删掉对方产生到一半的档
export async function fixtures() {
  const script = join(HERE, 'upload-fixtures.py');
  const stamp = join(FIX, '.stamp');
  const want = createHash('sha256').update(readFileSync(script)).digest('hex');
  const ready = () => {
    try { return JSON.parse(readFileSync(stamp, 'utf8')).sha === want && existsSync(join(FIX, 'info.json')); } catch (e) { return false; }
  };
  const read = () => JSON.parse(readFileSync(join(FIX, 'info.json'), 'utf8'));
  if (ready()) return read();
  mkdirSync(BASE, { recursive: true });
  const lock = FIX + '.lock';
  for (;;) {
    try { mkdirSync(lock); break; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    await new Promise((r) => setTimeout(r, 400));
    if (ready()) return read();
    // 上次跑到一半被中断留下的 lock（超过 5 分钟）
    try { if (Date.now() - statSync(lock).mtimeMs > 300000) rmSync(lock, { recursive: true, force: true }); } catch (e) { /* 别人刚好删掉了 */ }
  }
  try {
    if (ready()) return read();
    const r = spawnSync('python3', ['-I', script, FIX], { encoding: 'utf8', maxBuffer: 1 << 24 });
    if (r.status !== 0) throw new Error('upload-fixtures.py failed: ' + r.stderr);
    const info = JSON.parse(r.stdout.trim().split('\n').pop());
    writeFileSync(join(FIX, 'info.json'), JSON.stringify(info));
    writeFileSync(stamp, JSON.stringify({ sha: want }));
    return info;
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

export async function launch() {
  const { chromium } = await import(PW);
  // 只连 127.0.0.1，不需要 proxy
  return chromium.launch({ env: Object.assign({}, process.env, { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }) });
}

// 一个新的 context（自己的 cookie、IndexedDB）+ 收集页面错误
export async function newPage(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/401|Unauthorized|Failed to load resource/.test(m.text())) page.errors.push('console: ' + m.text()); });
  return { ctx, page };
}

// 云端（Vercel）登入。还没选过存在哪里时，登入框预设是「存在这台电脑」：先点「云端」
export async function login(page, url, name, pass) {
  if (url) await page.goto(url + '/caselib');
  await page.waitForSelector('#login:not([hidden])');
  if (await page.isVisible('#mode-cloud') && await page.getAttribute('#mode-cloud', 'aria-pressed') !== 'true') {
    await page.click('#mode-cloud');
    await page.waitForSelector('#login-pass', { state: 'visible' });
    await page.waitForSelector('#login-go:not([disabled])');
  }
  await page.fill('#login-name', name || 'Ana');
  await page.fill('#login-pass', pass == null ? PASSWORD : pass);
  await page.click('#login-go');
}
export async function loginOk(page, url, name) {
  await login(page, url, name);
  await page.waitForSelector('#tabs:not([hidden])');
  await page.waitForFunction(() => window.MB && MB.cl && MB.cl.cat, null, { timeout: 15000 });
}

export async function selectFolder(page, dir) {
  await page.setInputFiles('#pick', dir);
  await page.waitForSelector('#plan:not([hidden])');
}
// 预览比对完成（每张都有 hash 了）
export async function waitHashed(page, timeout) {
  await page.waitForFunction(() => {
    const S = MB.clUpload.state();
    return S.scan && !S.hashing && S.items.every((it) => !it.p.include || it.h);
  }, null, { timeout: timeout || 60000 });
  await page.evaluate(() => MB.clUpload.drawNow());
}
export async function startAndWait(page, timeout) {
  await page.click('#start');
  await waitDone(page, timeout);
}
export async function waitDone(page, timeout) {
  await page.waitForFunction(() => MB.clUpload.state().done && !MB.clUpload.busy() && !MB.clUpload.commits().busy, null, { timeout: timeout || 120000 });
  await page.evaluate(() => MB.clUpload.drawNow());
}

/* ---------- 直接看 mock 的储存 ---------- */
export function index(m) {
  const b = m.adapter.read(m.indexPath);
  return b ? JSON.parse(b.body.toString('utf8')) : null;
}
export function photoBlobs(m) {
  return [...m.adapter.store.keys()].filter((k) => k.indexOf('c/') === 0);
}
export function packBlobs(m) {
  return [...m.adapter.store.keys()].filter((k) => k.indexOf('t/') === 0);
}
export function sha16(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
}
export function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < 16; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } }
  return d;
}
export function byName(idx, name) {
  const pid = Object.keys(idx.projects).find((p) => idx.projects[p].name === name);
  return pid ? Object.assign({ pid }, idx.projects[pid]) : null;
}
export function photosOf(idx, pid) {
  return Object.keys(idx.photos).filter((h) => idx.photos[h].p === pid).map((h) => Object.assign({ hash: h }, idx.photos[h]));
}

export function shotPath(name) {
  mkdirSync(SHOTS, { recursive: true });
  return join(SHOTS, name);
}
