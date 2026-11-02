#!/usr/bin/env node
/* ============================================================
   VISI × 公司案例库 · Playwright 测试
   ------------------------------------------------------------
   跑法（repo 根目录）：node tools/caselib/test/visi-cases.mjs
     CASELIB_SCRATCH=<资料夹>  假资料、截图、PPTX 放这里（预设 os.tmpdir()/caselib-test）
     SHOTS=1                   顺便截图（图库的公司案例筛选、帮我挑；1440×900 与 390×844）
   不是 *.test.mjs：`node --test tools/caselib/test/` 不会载入它（要开浏览器，跑比较久）。
   每条 PASS / FAIL 一行；有 FAIL 时 exit code = 1。

   假资料：visi-fixture.mjs（6 个假项目、60 张色块 JPEG，文件夹名带假的客户名「陈先生」…）。
   起两个 mock：一个有 CORS（正式的 Blob 应该要有），一个没有（测 PPTX 的退路）；再起一个
   python 静态网站（没有 /api）确认 VISI 跟以前一样。
   ============================================================ */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { startMock } from '../mock-server.mjs';
import { buildSeed } from './visi-fixture.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INVITE = path.resolve(HERE, '../../../invite');
const SP = path.join(process.env.CASELIB_SCRATCH || path.join(tmpdir(), 'caselib-test'), 'visi');
const SHOTS = path.join(SP, 'shots');
const TAKE = !!process.env.SHOTS;
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let fails = 0;
function ok(id, cond, info) {
  if (!cond) fails++;
  results.push((cond ? 'PASS ' : 'FAIL ') + id + (info != null && info !== '' ? '  ' + String(info).slice(0, 700) : ''));
  console.log(results[results.length - 1]);
}
function note(id, s) { results.push('INFO ' + id + '  ' + String(s).slice(0, 900)); console.log(results[results.length - 1]); }

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

const browser = await chromium.launch({ args: ['--proxy-bypass-list=127.0.0.1;localhost'] });
const fx = await buildSeed(browser);
fx.seed.index.rev = 7;   // 正式清单写过几次：测 If-None-Match / 304
fs.writeFileSync(path.join(SP, 'seed.json'), JSON.stringify(fx.seed));
const mock = await startMock({ port: 0, blobPort: 0, cors: true, password: 'test-pass', seed: fx.seed });
const mockNoCors = await startMock({ port: 0, blobPort: 0, cors: false, password: 'test-pass', seed: fx.seed });
note('setup', 'mock ' + mock.url + ' (cors) · ' + mockNoCors.url + ' (no cors) · ' + fx.photos.length + ' photos / ' + fx.projects.length + ' projects · out ' + SP);

const BAD = fx.names.concat(fx.clients, fx.fpaths, ['/厨房/', 'IMG_1']);
/** 字里有没有任何不能外流的字（文件夹名、客户名、档案路径） */
function leaks(text) { return BAD.filter((w) => String(text).indexOf(w) > -1); }
const byH = {};
fx.photos.forEach((p) => { byH[p.h] = p; });
const P1 = fx.projects[0];   // Setia Alam 原木 陈先生

/* ---------- 页面工具 ---------- */
async function open(url, opts) {
  opts = opts || {};
  const ctx = opts.ctx || await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], api = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  page.on('request', (r) => { if (/\/api\//.test(r.url())) api.push(r.method() + ' ' + new URL(r.url()).pathname); });
  await page.goto(url + '/visi');
  await page.waitForSelector('#deck .pg');
  return { ctx, page, errors, api };
}
async function login(page) {
  await page.click('[data-tab="library"]');
  await page.fill('#cloud-panel [data-cloud-login] [name=name]', 'Ana');
  await page.fill('#cloud-panel [data-cloud-login] [name=pw]', 'test-pass');
  await page.click('#cloud-panel [data-cloud-login] button');
  await page.waitForFunction(() => MB.cases().length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(300);
}
/** 现在打开的方案（app 存进 IndexedDB 之后读回来） */
async function current(page) {
  await page.waitForTimeout(700);   // 存档有 400ms 的防抖
  return page.evaluate(async () => {
    const id = localStorage.getItem('sail-mb-active');
    return MB.store.getProject(id);
  });
}
/** 把一份方案经 app 的「导入方案」打开 */
async function importProject(page, p) {
  await page.click('[data-tab="library"]');
  const file = Buffer.from(JSON.stringify({ type: 'visi-project', v: 1, project: p }));
  await page.setInputFiles('#proj-import', { name: 'p.json', mimeType: 'application/json', buffer: file });
  await page.waitForTimeout(900);
}

/* ============================================================
   A · 没登入过 / 静态网站：一个 /api 请求都不发，跟以前一样
   ============================================================ */
{
  const { ctx, page, errors, api } = await open(mock.url);
  await page.click('[data-tab="library"]');
  await page.waitForTimeout(400);
  const box = await page.innerText('#cloud-panel');
  ok('A1 fresh browser on the mock: no /api request, no console error', api.length === 0 && errors.length === 0, JSON.stringify({ api, errors }));
  ok('A2 library shows the 公司案例库 login box (名字 + 团队密码)', /团队密码/.test(box) && await page.isVisible('#cloud-panel [name=pw]'), box.slice(0, 120));
  ok('A3 no 公司案例 source chip and no 帮我挑 before login', !(await page.isVisible('#lib-filter [data-src="cases"]')) && !(await page.isVisible('#lib-match')));
  // 错密码：挡下、讯息是华文、没有 pageerror
  await page.fill('#cloud-panel [name=name]', 'Ana');
  await page.fill('#cloud-panel [name=pw]', 'nope');
  await page.click('#cloud-panel [data-cloud-login] button');
  await page.waitForFunction(() => /密码不对/.test(document.querySelector('#cloud-panel [data-cloud-msg]').textContent), null, { timeout: 8000 }).catch(() => {});
  ok('A4 wrong password is refused with a Chinese message', /密码不对/.test(await page.innerText('#cloud-panel')) && !errors.some((e) => /pageerror/.test(e)), errors.join(' | '));
  // 对的密码、按 Enter 登入（游标还在密码框）：图库马上多了「公司案例」
  await page.fill('#cloud-panel [name=pw]', 'test-pass');
  await page.press('#cloud-panel [name=pw]', 'Enter');
  await page.waitForFunction(() => MB.cases().length > 0, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  ok('A5 login with Enter → library shows the 公司案例 source and 帮我挑 right away',
    await page.isVisible('#lib-filter [data-src="cases"]') && await page.isVisible('#lib-match') && /已登入/.test(await page.innerText('#cloud-panel')));
  await ctx.close();
}
{
  // python 静态网站：没有 /api
  const port = await freePort();
  const py = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: INVITE, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const base = 'http://127.0.0.1:' + port;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], api = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (/\/api\//.test(r.url())) api.push(r.url()); });
  page.on('dialog', (d) => d.accept());
  await page.goto(base + '/visi.html');
  await page.waitForSelector('#deck .pg');
  const pages = await page.locator('#deck .pg').count();
  const st = await page.evaluate(() => MB.cloud.status().status);
  for (const t of ['brief', 'style', 'rooms', 'plan', 'visit', 'copy', 'library']) { await page.click('[data-tab="' + t + '"]'); await page.waitForTimeout(120); }
  ok('B1 static site (no /api): VISI renders, no request to /api, no console error', pages >= 8 && api.length === 0 && errors.length === 0 && st === 'idle',
    JSON.stringify({ pages, st, api, errors }));
  await page.fill('#cloud-panel [name=name]', 'Ana');
  await page.fill('#cloud-panel [name=pw]', 'x');
  await page.click('#cloud-panel [data-cloud-login] button');
  await page.waitForTimeout(1200);
  const msg = await page.innerText('#cloud-panel');
  ok('B2 static site: trying to log in says there is no case library here (no throw)', /没有公司案例库/.test(msg) && !errors.some((e) => /pageerror/.test(e)), msg.slice(0, 160));
  await ctx.close();
  py.kill();
}

/* ============================================================
   C · 登入、清单、隐私（存在这台电脑的东西里没有项目名、档名）
   ============================================================ */
const main = await open(mock.url);
const page = main.page;
await login(page);
{
  const r = await page.evaluate(() => ({ st: MB.cloud.status(), n: MB.cases().length, usable: MB.cases().filter(MB.caseUsable).length,
    keys: Object.keys(MB.cases()[0]).sort().join(','), projects: MB.cloud.projects() }));
  ok('C1 login → catalog loaded (60 photos, 57 usable: 2 unsure + 1 hidden left out of auto use)', r.st.status === 'ok' && r.n === 60 && r.usable === 57, JSON.stringify(r.st) + ' ' + r.n + '/' + r.usable);
  const allowed = 'area,cabinets,desc,en,h,hero,hidden,id,label,pid,plabel,ptype,rooms,series,shot,src,status,style,thumb,traits,w,zh';
  ok('C2 entries() carry only whitelisted fields (no name / f)', r.keys === allowed, r.keys);
  ok('C3 project labels are 「区域 · 风格 · #n」, never the folder name', r.projects.length === 6 && r.projects.every((x) => /^[^·]+ · [^·]+ · #\d+$/.test(x.label) && !leaks(x.label).length),
    r.projects.map((x) => x.label).join(' | '));
  const stored = await page.evaluate(() => new Promise((res) => {
    const req = indexedDB.open('sail-visi-cases');
    req.onsuccess = () => {
      const db = req.result, out = {};
      const t = db.transaction(['meta', 'packs'], 'readonly');
      t.objectStore('meta').getAll().onsuccess = (e) => { out.meta = e.target.result; };
      t.objectStore('packs').getAll().onsuccess = (e) => { out.packs = e.target.result.length; };
      t.oncomplete = () => res(JSON.stringify(out.meta) + '|packs=' + out.packs);
    };
    req.onerror = () => res('ERR');
  }));
  ok('C4 what VISI stores (IndexedDB sail-visi-cases) has no folder name, client name or file path', stored.length > 1000 && !leaks(stored).length && !/"f"\s*:/.test(stored) && !/"name"\s*:/.test(stored),
    leaks(stored).join(',') + ' len=' + stored.length);
  const view = await page.evaluate(() => fetch('api/catalog?view=visi').then((r) => r.text()));
  ok('C5 GET /api/catalog?view=visi has no folder name / f path', !leaks(view).length, leaks(view).join(','));
  // 304：再问一次（同一个 rev）
  const before = main.api.length;
  const st2 = await page.evaluate(() => MB.cloud.refresh(true));
  ok('C6 refresh with the same rev → 304, still ok', st2.status === 'ok' && st2.rev === 7 && main.api.length === before + 1, JSON.stringify(st2));
}

/* ============================================================
   D · 模型：c: ref、autoPick、suggestCases、matchCases、caseNote
   ============================================================ */
const HIDDEN = fx.photos.filter((p) => p.hidden).map((p) => 'c:' + p.h);
const UNSURE = fx.photos.filter((p) => p.unsure).map((p) => 'c:' + p.h);
const P1REFS = fx.photos.filter((p) => p.project === 0 && !p.hidden && !p.unsure).map((p) => 'c:' + p.h);
{
  const r = await page.evaluate((a) => {
    const p = MB.newProject({});
    p.id = 'p-norm-test';
    p.rooms = ['kitchen', 'living'].map(MB.newRoom);
    p.rooms[0].images = [a.k1, a.hidden, 'b:wabi-1'];
    p.images.cover = a.k2;
    p.cases = [{ ref: a.k3, note: '自己写的' }, { ref: a.twin, note: null }, { ref: a.unsure, note: null }];
    p.caseStyle = 'wood'; p.cabinets = ['island', 'nope', 'kitchen', 'island'];
    const n = MB.normalizeProject(JSON.parse(JSON.stringify(p)));
    const res = MB.makeResolver([]);
    return { rooms: n.rooms[0].images, cover: n.images.cover, cases: n.cases.map((c) => c.ref), caseStyle: n.caseStyle, cabinets: n.cabinets,
      resolves: [a.k1, a.hidden, a.unsure].map((x) => !!res(x)), bad: MB.normalizeProject({ caseStyle: 'evil<', cabinets: ['<x>'], rooms: [] }) };
  }, { k1: P1REFS[0], k2: P1REFS[4], k3: P1REFS[2], twin: 'c:' + fx.photos[1].h, hidden: HIDDEN[0], unsure: UNSURE[0] });
  // P1 的第 1、2 张是同一个镜头（twin）：参考空间只留一张
  ok('D1 normalizeProject keeps c: refs (rooms, slots, cases; hidden / unsure still resolve); same shot deduped',
    r.rooms.length === 3 && r.cover && r.cases.length === 3 && r.resolves.every(Boolean) && r.caseStyle === 'wood' && r.cabinets.join() === 'island,kitchen',
    JSON.stringify(Object.assign({}, r, { bad: undefined })).slice(0, 400));
  const r2 = await page.evaluate(() => { const p = MB.normalizeProject({ cases: [{ ref: 'c:' + 'a'.repeat(16) }, { ref: 'c:../../x' }, { ref: 'c:<img>' }] }); return p.cases.map((c) => c.ref); });
  ok('D2 normalizeProject: hostile c: refs dropped, well-formed unknown kept (resolves later)', r2.length === 1 && r2[0] === 'c:' + 'a'.repeat(16), JSON.stringify(r2));
  ok('D3 hostile caseStyle / cabinets dropped', r.bad.caseStyle === '' && r.bad.cabinets.length === 0, JSON.stringify({ caseStyle: r.bad.caseStyle, cabinets: r.bad.cabinets }));
}
{
  // autoPick：同系列的案例优先；绝不挑 unsure / 隐藏的；30 个不同的方案 id 都一样
  const r = await page.evaluate((a) => {
    const out = { heroes: [], bad: [], series: [], offSeries: [] };
    for (let i = 0; i < 30; i++) {
      const p = MB.newProject({});
      p.id = 'p-auto-' + i;
      p.direction = 'misty'; p.caseStyle = i % 2 ? 'wood' : '';
      p.cabinets = ['island'];
      p.rooms = ['foyer', 'living', 'kitchen', 'master', 'study'].map(MB.newRoom);
      p.rooms.forEach((r) => { r.images = MB.autoPick(p, r, []); });
      p.rooms.forEach((r) => {
        out.heroes.push(r.images[0] || '');
        r.images.forEach((ref) => {
          if (a.bad.indexOf(ref) > -1) out.bad.push(ref);
          const c = MB.caseOf(ref);
          if (c) { out.series.push(c.series); if (c.series !== 'misty') out.offSeries.push(ref); }
        });
      });
    }
    out.caseHeroes = out.heroes.filter((x) => x.indexOf('c:') === 0).length;
    return out;
  }, { bad: HIDDEN.concat(UNSURE) });
  ok('D4 autoPick: heroes are same-series cases (misty) when available; never unsure / hidden; no other series',
    r.caseHeroes >= 140 && !r.bad.length && !r.offSeries.length, 'caseHeroes=' + r.caseHeroes + '/150 bad=' + r.bad.join() + ' off=' + r.offSeries.length);
  // 内置图库还是有用：微侘寂（案例库没有这个风格）照旧用内置图
  const w = await page.evaluate(() => {
    const p = MB.newProject({}); p.id = 'p-wabi'; p.direction = 'wabi';
    const k = MB.newRoom('kitchen'); p.rooms = [k];
    return MB.autoPick(p, k, []);
  });
  ok('D5 autoPick for a style the case library lacks (wabi) still uses builtins', w.length > 0 && w.every((x) => x.indexOf('b:') === 0), w.join());
}
{
  const r = await page.evaluate((a) => {
    const runs = [];
    for (let i = 0; i < 12; i++) {
      const p = MB.newProject({});
      p.id = 'p-sug-' + i; p.direction = 'misty'; p.caseStyle = 'wood';
      p.property.area = 'Setia Alam'; p.property.type = 'Terrace';
      p.rooms = ['kitchen', 'living'].map(MB.newRoom);
      p.rooms.forEach((r) => { r.images = MB.autoPick(p, r, []); });
      const used = {};
      p.rooms.forEach((r) => r.images.forEach((x) => { used[MB.shotKey(x)] = 1; }));
      const refs = MB.suggestCases(p, MB.makeResolver.last, 3);
      runs.push({ refs, pids: refs.map((x) => MB.caseOf(x).pid), series: refs.map((x) => MB.caseOf(x).series),
        clash: refs.filter((x) => used[MB.shotKey(x)]), bad: refs.filter((x) => a.bad.indexOf(x) > -1) });
    }
    return runs;
  }, { bad: HIDDEN.concat(UNSURE) });
  const good = r.every((x) => x.refs.length === 3 && new Set(x.pids).size === 3 && x.series.every((s) => s === 'misty') && !x.clash.length && !x.bad.length);
  ok('D6 suggestCases → 3 distinct projects, same series, none already on a room page, never unsure / hidden', good, JSON.stringify(r.find((x) => !(x.refs.length === 3 && new Set(x.pids).size === 3)) || r[0]));
}

/* ---------- 需求卡「有长辈同住、天天开火、Setia Alam 排屋、原木」→ 带入 → 帮我挑 ---------- */
const BRIEF = [
  '【溪岸 · 客户需求卡】', '——————————————', '姓名：Mr & Mrs Ong', 'WhatsApp：012-888 1234', '〔房产〕',
  '楼盘 / 单位：Eco Grandeur, Setia Alam', '面积：2200 sq ft', '房型：排屋 Terrace', '〔需求〕', '定制范围：厨房 Kitchen、衣柜 Wardrobe、鞋柜 Shoe cabinet',
  '风格倾向：原木 Natural wood', '〔生活习惯〕', '家庭构成：夫妻 + 长辈', '还有谁：长辈同住 Parents', '做饭频率：天天开火 Daily',
  '〔下一步〕', '方便到馆：周六 Saturday', '——————————————', '接待：Wilson Teo', '（由溪岸线上需求卡自动生成）'
].join('\n');
let briefP = null;
{
  await page.click('#proj-new');
  await page.click('[data-tab="brief"]');
  await page.fill('#brief-text', BRIEF);
  await page.click('#brief-apply');
  await page.waitForTimeout(600);
  briefP = await current(page);
  ok('E1 brief import: 原木 → caseStyle wood + direction misty; cabinets from scope + needs; area / type set',
    briefP.caseStyle === 'wood' && briefP.direction === 'misty' && ['kitchen', 'island', 'wardrobe', 'shoe'].every((k) => briefP.cabinets.indexOf(k) > -1) &&
    briefP.property.area === 'Setia Alam' && /Terrace/.test(briefP.property.type) && briefP.needs.some((n) => n.key === 'elderly') && briefP.needs.some((n) => n.key === 'cook_daily'),
    JSON.stringify({ cs: briefP.caseStyle, dir: briefP.direction, cab: briefP.cabinets, prop: briefP.property, needs: briefP.needs.map((n) => n.key) }));
  ok('E2 brief import with cases available auto-fills 参考空间 with 3 cases from 3 projects',
    briefP.cases.length === 3 && briefP.cases.every((c) => /^c:/.test(c.ref)) &&
    new Set(briefP.cases.map((c) => byH[c.ref.slice(2)].pid)).size === 3, JSON.stringify(briefP.cases));
  ok('E3 帮我挑 is offered right after the brief is pasted', await page.isVisible('#brief-match'), await page.innerText('#brief-match').catch(() => ''));
}
let matches = [];
{
  matches = await page.evaluate((p) => MB.matchCases(p, MB.makeResolver.last), briefP);
  const facts = (m) => m.facts.length;
  const top3 = matches.slice(0, 3);
  const per = {};
  matches.forEach((m) => { const pid = byH[m.ref.slice(2)].pid; per[pid] = (per[pid] || 0) + 1; });
  ok('E4 matchCases → 6–9 items, ≤ 2 per project', matches.length >= 6 && matches.length <= 9 && Object.values(per).every((n) => n <= 2), matches.length + ' ' + JSON.stringify(per));
  ok('E5 top 3 each match ≥ 2 facts', top3.length === 3 && top3.every((m) => facts(m) >= 2), top3.map((m) => m.why.zh).join(' | '));
  // 「为什么」里的每一项都要真的对得上（照假资料逐项核对）
  const lies = [];
  matches.forEach((m) => {
    const ph = byH[m.ref.slice(2)], pr = fx.projects[ph.project];
    const zh = m.why.zh;
    if (/Setia Alam/.test(zh) && pr.area !== 'Setia Alam') lies.push(zh + ' (area ' + pr.area + ')');
    if (/排屋/.test(zh) && pr.ptype !== 'terrace') lies.push(zh + ' (ptype ' + pr.ptype + ')');
    if (/有地住宅/.test(zh) && ['landed', 'terrace', 'semid', 'bungalow'].indexOf(pr.ptype) < 0) lies.push(zh);
    if (/长辈/.test(zh) && pr.traits.indexOf('elderly') < 0) lies.push(zh + ' (traits ' + pr.traits + ')');
    if (/小孩/.test(zh)) lies.push(zh + ' (brief has no kids)');
    if (/原木/.test(zh) && pr.style !== 'wood') lies.push(zh + ' (style ' + pr.style + ')');
    const cab = /(厨房|客厅|玄关|主卧|儿童房|餐厅|书房|浴室|衣帽间|客房)有(.+?)(?: ·|$)/.exec(zh);
    if (cab) {
      const ROOMZH = { 厨房: 'kitchen', 客厅: 'living', 玄关: 'foyer', 主卧: 'master', 儿童房: 'bedroom', 餐厅: 'dining', 书房: 'study', 浴室: 'bathroom', 衣帽间: 'walkin', 客房: 'guest' };
      const CABZH = { 橱柜: 'kitchen', 衣柜: 'wardrobe', 展示柜: 'display', 书柜: 'bookcase', 床尾柜: 'bedend', 化妆台: 'dresser', 中岛: 'island', 电视柜: 'tvcab', 电视墙: 'tvwall', 房门: 'door', 鞋柜: 'shoe', 浴室柜: 'bathvanity', 护墙板: 'wallpanel', 餐边柜: 'sideboard', 定制床: 'bed' };
      if (ph.room !== ROOMZH[cab[1]] || ph.cabinets.indexOf(CABZH[cab[2]]) < 0) lies.push(zh + ' (photo ' + ph.room + ' ' + ph.cabinets + ')');
    }
    if (leaks(zh + m.why.en).length) lies.push('LEAK ' + zh);
  });
  ok('E6 every why states only true facts and never a project / client name', !lies.length && matches.length > 0, lies.join(' || ') || matches.map((m) => m.why.zh).join(' | '));
  const used = await page.evaluate((p) => {
    const plan = MB.deckImages(p, MB.makeResolver.last), u = {};
    Object.keys(plan.rooms).forEach((k) => plan.rooms[k].forEach((x) => { u[MB.shotKey(x)] = 1; }));
    Object.keys(plan.slot).forEach((k) => { if (plan.slot[k]) u[MB.shotKey(plan.slot[k])] = 1; });
    plan.glance.forEach((x) => { u[MB.shotKey(x)] = 1; });
    p.cases.forEach((c) => { u[MB.shotKey(c.ref)] = 1; });
    return u;
  }, briefP);
  const clash = matches.filter((m) => used[m.ref] || HIDDEN.indexOf(m.ref) > -1 || UNSURE.indexOf(m.ref) > -1);
  ok('E7 matchCases skips unsure / hidden and photos (shots) already in the deck', !clash.length, clash.map((m) => m.ref).join());
  ok('E8 matches carry a use: a room uid of this proposal or \'cases\'',
    matches.every((m) => m.use === 'cases' || briefP.rooms.some((r) => r.uid === m.use)), matches.map((m) => m.use).join());
  note('E matches', matches.map((m) => m.score + ' ' + m.why.zh + ' → ' + m.use).join(' | '));
}
{
  // 帮我挑的面板：放进参考空间 → 那一句变成说明草稿；放进厨房 → 那一间的主图
  await page.evaluate(() => {
    // 参考空间先清掉一个位置
    return null;
  });
  await page.click('[data-tab="rooms"]');
  await page.waitForTimeout(200);
  // 先拿掉自动挑的一个参考空间，留位置
  await page.locator('#cases-list .case-row').last().locator('[data-case-del]').click({ force: true });
  await page.waitForTimeout(200);
  await page.click('#cases-match');
  await page.waitForSelector('#match-modal.on');
  await page.waitForTimeout(500);
  const rows = await page.locator('#match-list .match-row').count();
  const firstCase = page.locator('#match-list .match-row').filter({ has: page.locator('[data-match-case]') }).first();
  const ref = await firstCase.getAttribute('data-ref');
  // 方案是英文的（新方案默认 en）就用英文那一句，华文 / 双语用华文
  const lang = (await current(page)).lang;
  const why = await firstCase.getAttribute(lang === 'en' ? 'data-why-en' : 'data-why-zh');
  await firstCase.locator('[data-match-case]').click();
  await page.waitForTimeout(300);
  const done = await page.locator('#match-list .match-row[data-ref="' + ref + '"] .match-done').count();
  const roomBtn = page.locator('#match-list [data-match-room]').first();
  const roomRow = roomBtn.locator('xpath=ancestor::div[contains(@class,"match-row")]');
  const roomRef = await roomRow.getAttribute('data-ref');
  const roomUid = await roomBtn.getAttribute('data-match-room');
  await roomBtn.click();
  await page.waitForTimeout(300);
  if (TAKE) await page.screenshot({ path: path.join(SHOTS, 'match-1440.png') });
  await page.click('#match-modal [data-close]');
  await page.waitForTimeout(700);
  const p = await current(page);
  const c = p.cases.find((x) => x.ref === ref);
  const r = p.rooms.find((x) => x.uid === roomUid);
  const ta = await page.locator('#cases-list textarea').evaluateAll((els) => els.map((e) => e.value));
  ok('F1 帮我挑 panel lists the matches with a why and buttons', rows >= 6 && !!why, rows + ' rows');
  ok('F2 「放进参考空间」: the why becomes that case\'s note draft (editable textarea)', !!c && c.note === why && ta.indexOf(why) > -1 && done === 1, JSON.stringify(c) + ' ta=' + JSON.stringify(ta));
  ok('F3 「放进<空间>」: the case becomes that room\'s hero, room marked manual', !!r && r.images[0] === roomRef && r.manual === true, JSON.stringify(r && r.images));
  briefP = p;
}
{
  // caseNote：同一区 → 「同在 Setia Alam」
  const r = await page.evaluate((a) => {
    const p = MB.newProject({}); p.property.area = 'Setia Alam'; p.property.type = 'Terrace';
    p.needs = [{ key: 'elderly' }];
    const c = MB.caseOf(a.ref);
    const im = { ref: a.ref, series: c.series, rooms: c.rooms, area: c.area, ptype: c.ptype, traits: c.traits, zh: c.zh, en: c.en, label: c.label };
    return { zh: MB.caseNote(p, im, 'zh'), en: MB.caseNote(p, im, 'en') };
  }, { ref: P1REFS[0] });
  ok('F4 caseNote for a Setia Alam terrace case → 「同在 Setia Alam」+ type + elderly', /同在 Setia Alam/.test(r.zh) && /排屋/.test(r.zh) && /长辈/.test(r.zh) && /Also in Setia Alam/.test(r.en), JSON.stringify(r));
}

/* ============================================================
   G · 隐私：deck HTML、讲稿、文案、PPTX 都找不到文件夹名、客户名、档案路径
   ============================================================ */
const PRIV = await page.evaluate((a) => {
  const p = MB.newProject({});
  p.id = 'p-privacy'; p.lang = 'bi'; p.direction = 'misty'; p.caseStyle = 'wood';
  p.client.names = 'Mr & Mrs Ong'; p.property = { name: 'Eco Grandeur', area: 'Setia Alam', type: 'Terrace', size: '' };
  p.host.name = 'Wilson Teo'; p.host.wa = '60123456789';
  p.needs = [{ key: 'elderly' }, { key: 'cook_daily' }];
  p.rooms = ['foyer', 'living', 'kitchen', 'master'].map(MB.newRoom);
  const byRoom = {};
  a.refs.forEach((x) => { const c = MB.caseOf(x); (byRoom[c.rooms[0]] = byRoom[c.rooms[0]] || []).push(x); });
  p.rooms.forEach((r) => { r.images = (byRoom[r.key] || []).slice(0, 1); r.manual = true; });
  p.images.cover = a.cover;
  p.cases = a.cases.map((x) => ({ ref: x, note: null }));
  p.pages.team = true; p.pages.practical = true; p.pages.chapter = true;
  p.visit.date = '2026-12-12';
  return MB.normalizeProject(p);
}, { refs: P1REFS, cover: P1REFS[6], cases: [P1REFS[2], P1REFS[4], 'c:' + fx.photos[11].h] });
await importProject(page, PRIV);
{
  const deck = await page.evaluate(() => document.querySelector('#deck').innerHTML);
  const caseSrcs = (deck.match(/http:\/\/127\.0\.0\.1:\d+\/c\/[0-9a-f]{16}-[A-Za-z0-9]+\.jpg/g) || []).length;
  ok('G1 deck HTML uses case photos (blob URLs) and contains no folder / client name / f path', caseSrcs >= 5 && !leaks(deck).length, 'caseSrcs=' + caseSrcs + ' leaks=' + leaks(deck).join(','));
  const notes = await page.evaluate(() => {
    const id = localStorage.getItem('sail-mb-active');
    return MB.store.getProject(id).then((p) => {
      p = MB.normalizeProject(p);
      const out = [];
      MB.pageList(p, MB.makeResolver.last).forEach((pg) => ['zh', 'en', 'bi'].forEach((L) => out.push(MB.pageNotes(p, pg, L))));
      const copy = ['zh', 'en'].map((L) => JSON.stringify(MB.writeCopy(p, L))).join('\n');
      const letter = ['zh', 'en'].map((L) => MB.draftLetter(p, L)).join('\n');
      const cards = ['zh', 'en', 'bi'].map((L) => JSON.stringify(MB.caseCards(p, MB.makeResolver.last, L))).join('\n');
      return { notes: out.join('\n'), copy, letter, cards, nCases: MB.caseRefs(p).length };
    });
  });
  ok('G2 all speaker notes (MB.pageNotes × zh/en/bi) contain no folder / client name / f path', notes.notes.length > 500 && !leaks(notes.notes).length, leaks(notes.notes).join(','));
  ok('G3 WhatsApp / copy texts and the letter contain no folder / client name / f path', notes.copy.length > 500 && !leaks(notes.copy + notes.letter).length, leaks(notes.copy + notes.letter).join(','));
  ok('G4 case cards (deck + PPTX captions) contain no folder / client name / f path', notes.nCases === 3 && !leaks(notes.cards).length, leaks(notes.cards).join(','));
  // 讲稿里的案例那一句：用区域 / 房型 / 家庭（同在 Setia Alam），不是项目名
  ok('G5 speaker notes for the cases page use facts like 「同在 Setia Alam」', /同在 Setia Alam/.test(notes.notes), '');
  // ⑥ 文案页（销售复制的那几则）
  await page.click('[data-tab="copy"]');
  await page.waitForTimeout(300);
  const copyUi = await page.evaluate(() => [...document.querySelectorAll('#copy-list textarea')].map((t) => t.value).join('\n'));
  ok('G6 ⑥ copy pane texts contain no folder / client name / f path', copyUi.length > 200 && !leaks(copyUi).length, leaks(copyUi).join(','));
}
/** 用 app 的「导出 PPTX」按钮导出，回 { file, toast } */
async function exportPptx(pg, name) {
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 90000 }), pg.click('#btn-pptx')]);
  const file = path.join(SP, name + '.pptx');
  await dl.saveAs(file);
  await pg.waitForTimeout(400);
  return { file, toast: await pg.textContent('#toast') };
}
/** pptx → { xml（全部 XML 接起来）, media:[sha256] } */
function readPptx(file) {
  const py = 'import zipfile,hashlib,json,sys\nz=zipfile.ZipFile(sys.argv[1])\nx=[];m=[]\nfor n in z.namelist():\n  b=z.read(n)\n  if n.endswith(".xml") or n.endswith(".rels"): x.append(b.decode("utf-8","replace"))\n  if n.startswith("ppt/media/"): m.append(hashlib.sha256(b).hexdigest())\nprint(json.dumps({"xml":"\\n".join(x),"media":m}))';
  return JSON.parse(execFileSync('python3', ['-I', '-c', py, file], { maxBuffer: 256 * 1024 * 1024 }).toString());
}
const caseHashes = {};
fx.photos.forEach((p) => { caseHashes[createHash('sha256').update(Buffer.from(p.bytes, 'base64')).digest('hex')] = p.h; });
{
  const out = await exportPptx(page, 'visi-cases-cors');
  const z = readPptx(out.file);
  const embedded = z.media.filter((h) => caseHashes[h]);
  ok('H1 PPTX with CORS: case photos are embedded', embedded.length >= 5 && /PPTX 已导出$/.test(out.toast.trim()), embedded.length + ' case images · toast=' + out.toast);
  ok('H2 PPTX XML (slides + notes) contains no folder / client name / f path', z.xml.length > 10000 && !leaks(z.xml).length, leaks(z.xml).join(','));
}
{
  // 没有 CORS 的 Blob：照样导出，告诉业务几张放不进去
  const nc = await open(mockNoCors.url);
  await login(nc.page);
  await importProject(nc.page, PRIV);
  const out = await exportPptx(nc.page, 'visi-cases-nocors');
  const z = readPptx(out.file);
  const embedded = z.media.filter((h) => caseHashes[h]);
  const m = /有 (\d+) 张公司案例照片放不进去/.exec(out.toast || '');
  const want = await nc.page.evaluate(() => new Set([...document.querySelectorAll('#deck img')].map((i) => i.getAttribute('src')).filter((s) => MB.cloud.isCaseSrc(s))).size);
  ok('H3 PPTX without CORS: export still succeeds, no case image embedded, toast says how many', fs.statSync(out.file).size > 50000 && embedded.length === 0 && !!m && +m[1] === want && want >= 5,
    'toast=' + out.toast + ' want=' + want + ' embedded=' + embedded.length);
  ok('H4 no-CORS PPTX also leaks nothing', !leaks(z.xml).length, leaks(z.xml).join(','));
  // 没有 CORS：缩图包也载不到 → 图库改用原图，不会一直空着
  await nc.page.click('[data-tab="library"]');
  await nc.page.click('#lib-filter [data-src="cases"]');
  await nc.page.waitForTimeout(1500);
  const waits = await nc.page.locator('#lib-grid .img-wait').count();
  const imgs = await nc.page.locator('#lib-grid .lib-item.case img').count();
  ok('H5 no CORS: library falls back to full images instead of empty thumbs', waits === 0 && imgs > 0, 'waits=' + waits + ' imgs=' + imgs);
  await nc.ctx.close();
}

/* ============================================================
   I · 重新整理、API 坏了（500）：存着的案例照样解析得到
   ============================================================ */
{
  await page.reload();
  await page.waitForSelector('#deck .pg');
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({ n: MB.cases().length, st: MB.cloud.status().status,
    imgs: [...document.querySelectorAll('#deck img')].filter((i) => MB.cloud.isCaseSrc(i.getAttribute('src'))).length }));
  ok('I1 reload: cached cases load before the first render (c: refs resolve)', r.n === 60 && r.imgs >= 5, JSON.stringify(r));
  const p = await current(page);
  ok('I2 reload: the proposal still has its c: refs', p.cases.length === 3 && p.cases.every((c) => /^c:/.test(c.ref)) && p.rooms.some((x) => x.images.some((y) => /^c:/.test(y))), JSON.stringify(p.cases));
  mock.setDown(true);
  const errs0 = main.errors.length;
  await page.reload();
  await page.waitForSelector('#deck .pg');
  await page.evaluate(() => MB.cloud.refresh(true));
  await page.waitForTimeout(500);
  const d = await page.evaluate(() => ({ n: MB.cases().length, st: MB.cloud.status(),
    imgs: [...document.querySelectorAll('#deck img')].filter((i) => MB.cloud.isCaseSrc(i.getAttribute('src'))).length }));
  await page.click('[data-tab="library"]');
  const box = await page.innerText('#cloud-panel');
  const pageErr = main.errors.slice(errs0).filter((e) => /pageerror/.test(e));
  ok('I3 API down (500): cached cases still resolve and render, status offline, box says so, no page error',
    d.n === 60 && d.imgs >= 5 && d.st.status === 'offline' && /暂时连不上/.test(box) && !pageErr.length, JSON.stringify(d) + ' ' + pageErr.join());
  mock.setDown(false);
  // 伺服器回来了：按「更新」（或一分钟后自己再试）就恢复
  await page.click('#cloud-panel [data-cloud-refresh]');
  await page.waitForTimeout(800);
  const back = await page.evaluate(() => MB.cloud.status().status);
  ok('I4 API back up → 更新 restores status ok', back === 'ok' && /已登入/.test(await page.innerText('#cloud-panel')), back);
}

/* ============================================================
   J · 检查：印出来的案例照片是不确定 / 已隐藏；案例风格对不上
   ============================================================ */
{
  const r = await page.evaluate((a) => {
    const p = MB.newProject({});
    p.id = 'p-check'; p.direction = 'misty'; p.caseStyle = 'wood';
    p.client.names = 'Mr Ong';
    const k = MB.newRoom('kitchen'); p.rooms = [k];
    k.images = [a.unsure]; k.manual = true;
    p.cases = [{ ref: a.hidden, note: null }, { ref: a.cream, note: null }];
    const items = MB.checkProject(p, MB.makeResolver.last).items.map((x) => x.level + '|' + x.text + '|' + x.goto);
    return items;
  }, { unsure: UNSURE[0], hidden: HIDDEN[0], cream: 'c:' + fx.photos.find((p) => p.project === 2 && !p.unsure && !p.hidden).h });
  ok('J1 check warns about a printed unsure case photo (goes to that room)', r.some((x) => /^warn\|用了还没确认的公司案例照片/.test(x) && /room:/.test(x)), r.filter((x) => /案例/.test(x)).join(' ; '));
  ok('J2 check warns about a printed hidden case photo (goes to 参考空间)', r.some((x) => /^warn\|用了已经隐藏的公司案例照片.*\|cases$/.test(x)), r.filter((x) => /隐藏/.test(x)).join(' ; '));
  ok('J3 rule 13: case style 奶油风 vs proposal 原木 (same series) is flagged', r.some((x) => /案例和方案风格不一样.*奶油风，方案是原木/.test(x)), r.filter((x) => /风格/.test(x)).join(' ; '));
}

/* ============================================================
   K · 图库：来源 × 空间 × 风格 · 柜类 · 项目、分页、同项目
   ============================================================ */
{
  await page.click('[data-tab="library"]');
  await page.click('#lib-filter [data-src="cases"]');
  await page.waitForTimeout(1200);
  const n1 = await page.locator('#lib-grid .lib-item.case').count();
  const pager = await page.innerText('#lib-pager');
  ok('K1 公司案例 source: 48 per page, pager shows 2 pages', n1 === 48 && /第 1 \/ 2 页/.test(pager), n1 + ' ' + pager);
  const thumbs = await page.$$eval('#lib-grid .lib-item.case img', (ims) => ims.filter((i) => /^data:image\/jpeg/.test(i.src)).length);
  ok('K2 case tiles use the 320px thumbnail packs (data URLs), not the full photos', thumbs >= 40, thumbs + ' thumbs');
  await page.selectOption('#lib-cfilter [data-cf="style"]', 'wood');
  await page.waitForTimeout(200);
  await page.selectOption('#lib-cfilter [data-cf="cab"]', 'island');
  await page.waitForTimeout(300);
  const refs = await page.$$eval('#lib-grid .lib-item.case', (els) => els.map((e) => e.getAttribute('data-ref')));
  const okStyle = refs.every((x) => { const p = byH[x.slice(2)]; return fx.projects[p.project].style === 'wood' && p.cabinets.indexOf('island') > -1 && !p.unsure && !p.hidden; });
  ok('K3 风格 × 柜类 filters (原木 × 中岛) show only matching, usable cases', refs.length >= 2 && okStyle, refs.length + ' ' + refs.join());
  if (TAKE) await page.screenshot({ path: path.join(SHOTS, 'library-1440.png') });
  const opts = await page.$$eval('#lib-cfilter [data-cf="pid"] option', (os) => os.map((o) => o.textContent));
  ok('K4 项目 filter labels are 「区域 · 风格 · #n」 (no folder names)', opts.length >= 2 && !leaks(opts.join('|')).length && opts.slice(1).every((t) => /#\d+/.test(t)), opts.join(' | '));
  await page.click('#lib-cfilter [data-cf-clear]');
  await page.waitForTimeout(300);
  const tile = page.locator('#lib-grid .lib-item.case').first();
  const pid = await tile.locator('[data-same-proj]').getAttribute('data-same-proj');
  await tile.hover();
  await tile.locator('[data-same-proj]').click();
  await page.waitForTimeout(400);
  const same = await page.$$eval('#lib-grid .lib-item.case', (els) => els.map((e) => e.getAttribute('data-ref')));
  ok('K5 「同项目」 shows only that project\'s photos', same.length >= 5 && same.every((x) => byH[x.slice(2)].pid === pid), same.length + ' of ' + pid);
  const titleLeak = await page.$$eval('#lib-grid [title], #pick-grid [title]', (els) => els.map((e) => e.title).join('|'));
  ok('K6 tile tooltips show the project label, never the folder name', !leaks(titleLeak).length, titleLeak.slice(0, 200));
  // 选图弹窗：同一套筛选
  await page.click('[data-tab="rooms"]');
  await page.locator('.room-card').first().locator('[data-room-pick]').click();
  await page.waitForSelector('#pick-modal.on');
  await page.click('#pick-filter [data-src="cases"]');
  await page.waitForTimeout(600);
  const pk = await page.locator('#pick-grid .lib-item.case').count();
  const pkCf = await page.isVisible('#pick-cfilter [data-cf="style"]');
  ok('K7 picker has the same source / 风格 × 柜类 × 项目 filters for 公司案例', pk > 0 && pkCf, pk + ' cases');
  await page.click('#pick-modal [data-close]');
}

/* ============================================================
   L · 速度：3000 张假案例，deckImages < 30 ms
   ============================================================ */
{
  const r = await page.evaluate(() => {
    const styles = MB.CASE_STYLES.map((s) => s.key), rooms = ['foyer', 'living', 'dining', 'kitchen', 'master', 'walkin', 'bathroom', 'bedroom', 'study', 'guest'];
    const cabs = MB.CASE_CABINETS.map((c) => c.key);
    const list = [];
    for (let i = 0; i < 3000; i++) {
      const h = (0x1000000000000 + i * 7919).toString(16).padStart(16, '0').slice(-16);
      const st = MB.caseStyle(styles[i % styles.length]);
      list.push({ id: 'c:' + h, src: 'http://127.0.0.1:1/c/' + h + '.jpg', thumb: '', w: i % 3 ? 1600 : 1200, h: i % 3 ? 1200 : 1600,
        style: st.key, series: st.series, cabinets: [cabs[i % cabs.length], cabs[(i * 7) % cabs.length]], rooms: [rooms[i % rooms.length]],
        pid: 'p' + String(i % 120).padStart(10, '0'), area: ['Setia Alam', 'Shah Alam', 'Puchong'][i % 3], ptype: ['terrace', 'condo', 'semid'][i % 3],
        traits: i % 4 ? [] : ['elderly'], shot: 'c:' + h, hero: i % 5 === 0, status: i % 17 ? 'confirmed' : 'unsure', hidden: i % 41 === 0,
        desc: { zh: '', en: '' }, label: st.zh, zh: st.zh, en: st.en });
    }
    const keep = MB.cases().slice();
    MB.setCases(list);
    const res = MB.makeResolver([]);
    const p = MB.newProject({});
    p.id = 'p-perf'; p.direction = 'misty'; p.caseStyle = 'wood'; p.cabinets = ['kitchen', 'island', 'wardrobe'];
    p.property.area = 'Setia Alam'; p.property.type = 'Terrace'; p.needs = [{ key: 'elderly' }, { key: 'cook_daily' }];
    p.rooms = ['foyer', 'living', 'dining', 'kitchen', 'master', 'bedroom'].map(MB.newRoom);
    p.rooms.forEach((r) => { r.images = MB.autoPick(p, r, []); });
    p.cases = MB.suggestCases(p, res, 3).map((ref) => ({ ref, note: null }));
    const t = [];
    for (let i = 0; i < 12; i++) { const a = performance.now(); MB.deckImages(p, res); t.push(performance.now() - a); }
    t.sort((a, b) => a - b);
    const m0 = performance.now(); const mc = MB.matchCases(p, res); const mt = performance.now() - m0;
    const a0 = performance.now(); MB.autoPick(p, p.rooms[3], []); const at = performance.now() - a0;
    const r0 = performance.now(); MB.renderDeck(p, { resolve: res, cases: [], venue: {} }); const rt = performance.now() - r0;
    MB.setCases(keep); MB.makeResolver([]);
    return { median: t[6], max: t[11], match: mt, matchN: mc.length, autoPick: at, render: rt, heroes: p.rooms.map((r) => r.images[0]).filter((x) => /^c:/.test(x)).length };
  });
  ok('L1 deckImages with 3000 synthetic cases < 30 ms (median of 12)', r.median < 30, JSON.stringify(r));
  note('L timings', 'deckImages median ' + r.median.toFixed(1) + ' ms, max ' + r.max.toFixed(1) + ' · matchCases ' + r.match.toFixed(1) + ' ms (' + r.matchN + ') · autoPick ' + r.autoPick.toFixed(1) + ' ms · renderDeck ' + r.render.toFixed(1) + ' ms');
}

/* ============================================================
   M · 截图（SHOTS=1）：图库的公司案例筛选、帮我挑 · 1440×900 与 390×844
   ============================================================ */
if (process.env.SHOTS) {
  const mob = await open(mock.url, { viewport: { width: 390, height: 844 } });
  await login(mob.page);
  await importProject(mob.page, PRIV);
  await mob.page.click('[data-tab="library"]');
  await mob.page.click('#lib-filter [data-src="cases"]');
  await mob.page.waitForTimeout(1200);
  await mob.page.locator('#lib-filter').scrollIntoViewIfNeeded();
  await mob.page.screenshot({ path: path.join(SHOTS, 'library-390.png') });
  const sw = await mob.page.evaluate(() => document.documentElement.scrollWidth);
  ok('M1 390px: library with 公司案例 filters has no horizontal scroll', sw <= 390, 'scrollWidth=' + sw);
  await mob.page.click('#lib-match');
  await mob.page.waitForSelector('#match-modal.on');
  await mob.page.waitForTimeout(800);
  await mob.page.screenshot({ path: path.join(SHOTS, 'match-390.png') });
  await mob.page.click('#match-modal [data-close]');
  await mob.page.click('[data-tab="rooms"]');
  await mob.page.locator('#cases-panel').scrollIntoViewIfNeeded();
  await mob.page.screenshot({ path: path.join(SHOTS, 'cases-390.png') });
  ok('M2 390px: no page errors', !mob.errors.filter((e) => /pageerror/.test(e)).length, mob.errors.join(' | '));
  await mob.ctx.close();
  // 1440 的帮我挑面板（从图库打开）
  await page.click('[data-tab="library"]');
  await page.click('#lib-match');
  await page.waitForSelector('#match-modal.on');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, 'match-lib-1440.png') });
  await page.click('#match-modal [data-close]');
  await page.click('[data-tab="rooms"]');
  await page.locator('#cases-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, 'cases-1440.png') });
}

/* ============================================================
   N · 需求卡：新的风格选项（跟案例库同一套）三种语言的卡都认；旧卡读出一样的方向
   ============================================================ */
{
  const r = await page.evaluate(async () => {
    const card = window.SAIL_BRIEF_CARD;
    function mk(lang, styles) {
      const L = (k) => card.label(k, lang) + card.colon(lang);
      return [card.title(lang), card.rule, L('name') + 'Mr Test', L('style') + styles.join(card.join(lang)), card.rule, card.footer(lang)].join('\n');
    }
    const NEW = ['原木 Natural wood', '微侘寂 Subtle wabi-sabi', '奶油风 Cream style', '轻法式 Light French', '中古 Mid-century',
      '现代简约 Modern minimal', '日式 Japandi', '北欧 Nordic', '轻奢 Modern luxe'];
    const out = { neu: {}, old: {}, langs: {} };
    NEW.forEach((s) => { const st = MB.briefToSetup(MB.parseBrief(mk('zh', [s]))); out.neu[s] = st.direction + '/' + st.caseStyle; });
    ['自然原木 Natural wood', '现代简约 Modern minimal', '侘寂 Wabi-sabi', '日式 Japandi', '北欧 Nordic', '轻奢 Modern luxe', '中古 Mid-century', '还没想好 Not decided']
      .forEach((s) => { const st = MB.briefToSetup(MB.parseBrief(mk('zh', [s]))); out.old[s] = st.direction + '/' + st.caseStyle; });
    ['zh', 'en', 'bi'].forEach((l) => { const st = MB.briefToSetup(MB.parseBrief(mk(l, ['奶油风 Cream style', '原木 Natural wood']))); out.langs[l] = st.direction + '/' + st.caseStyle; });
    const html = await fetch('brief.html').then((x) => x.text());
    out.options = [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('input[name=style]')].map((i) => i.value);
    out.caseStyles = MB.CASE_STYLES.map((s) => s.zh + ' ' + s.en);
    return out;
  });
  const wantNew = { '原木 Natural wood': 'misty/wood', '微侘寂 Subtle wabi-sabi': 'wabi/wabi', '奶油风 Cream style': 'misty/cream', '轻法式 Light French': 'weaving/french',
    '中古 Mid-century': 'weaving/midcentury', '现代简约 Modern minimal': 'skeleton/modern', '日式 Japandi': 'misty/japandi', '北欧 Nordic': 'misty/nordic', '轻奢 Modern luxe': 'mountain/luxe' };
  const wantOld = { '自然原木 Natural wood': 'misty', '现代简约 Modern minimal': 'skeleton', '侘寂 Wabi-sabi': 'wabi', '日式 Japandi': 'misty', '北欧 Nordic': 'misty',
    '轻奢 Modern luxe': 'mountain', '中古 Mid-century': 'weaving', '还没想好 Not decided': 'null' };
  ok('N1 new brief style options → direction + caseStyle (all 9)', Object.keys(wantNew).every((k) => r.neu[k] === wantNew[k]), JSON.stringify(r.neu));
  ok('N2 old brief cards still parse to the same direction', Object.keys(wantOld).every((k) => String(r.old[k]).split('/')[0] === wantOld[k]), JSON.stringify(r.old));
  ok('N3 zh / en / bi cards all read the new options (first one wins: 奶油风)', ['zh', 'en', 'bi'].every((l) => r.langs[l] === 'misty/cream'), JSON.stringify(r.langs));
  ok('N4 brief.html style options = the case style list (+ 还没想好), value format 「华文 English」',
    JSON.stringify(r.options) === JSON.stringify(r.caseStyles.concat(['还没想好 Not decided'])), JSON.stringify(r.options));
}

const pageErrors = main.errors.filter((e) => /pageerror/.test(e));
ok('Z no uncaught page errors in the main session', !pageErrors.length, pageErrors.join(' | '));
note('console errors (expected only from the deliberate 401 / 500 / no-CORS steps)', main.errors.filter((e) => !/pageerror/.test(e)).length);

await browser.close();
await mock.close();
await mockNoCors.close();
console.log('\n' + results.filter((r) => r.startsWith('PASS')).length + ' passed, ' + results.filter((r) => r.startsWith('FAIL')).length + ' failed');
process.exit(fails ? 1 : 0);
