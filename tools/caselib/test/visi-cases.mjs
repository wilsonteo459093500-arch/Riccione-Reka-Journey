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
  const allowed = 'area,cabinets,desc,en,h,hero,hidden,id,label,pid,plabel,ptype,rooms,series,shot,src,stale,status,style,thumb,traits,w,zh';
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
    for (let i = 0; i < 24; i++) {
      const p = MB.newProject({});
      // 一半有客户说的风格（原木：假资料只有 2 个原木的家），一半只有系列（雾山：4 个家）
      p.id = 'p-sug-' + i; p.direction = 'misty'; p.caseStyle = i % 2 ? 'wood' : '';
      p.property.area = 'Setia Alam'; p.property.type = 'Terrace';
      p.rooms = ['kitchen', 'living'].map(MB.newRoom);
      p.rooms.forEach((r) => { r.images = MB.autoPick(p, r, []); });
      const used = {};
      p.rooms.forEach((r) => r.images.forEach((x) => { used[MB.shotKey(x)] = 1; }));
      const refs = MB.suggestCases(p, MB.makeResolver.last, 3);
      runs.push({ cs: p.caseStyle, refs, pids: refs.map((x) => MB.caseOf(x).pid), series: refs.map((x) => MB.caseOf(x).series), styles: refs.map((x) => MB.caseOf(x).style),
        clash: refs.filter((x) => used[MB.shotKey(x)]), bad: refs.filter((x) => a.bad.indexOf(x) > -1) });
    }
    return runs;
  }, { bad: HIDDEN.concat(UNSURE) });
  const good = r.every((x) => !x.clash.length && !x.bad.length && x.series.every((s) => s === 'misty') && new Set(x.pids).size === x.refs.length &&
    (x.cs ? x.refs.length === 2 && x.styles.every((s) => s === x.cs) : x.refs.length === 3));
  ok('D6 suggestCases → distinct projects, same series, none already on a room page, never unsure / hidden; with a client style only that style (fewer rather than padded)',
    good, JSON.stringify(r.find((x) => !(new Set(x.pids).size === x.refs.length && (x.cs ? x.refs.length === 2 : x.refs.length === 3))) || r[0]));
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
  // 原木的家只有 2 个：只放 2 个，不拿别的风格（日式）凑满 3 个 —— 不然体检马上说「案例和方案风格不一样」
  const chk = await page.evaluate(() => { const id = localStorage.getItem('sail-mb-active'); return MB.store.getProject(id).then((p) => MB.checkProject(MB.normalizeProject(p), MB.makeResolver.last).items.map((x) => x.text)); });
  ok('E2 brief import with cases available auto-fills 参考空间 with the client\'s style only (2 wood homes), and the check has nothing to say about it',
    briefP.cases.length === 2 && briefP.cases.every((c) => /^c:/.test(c.ref)) &&
    new Set(briefP.cases.map((c) => byH[c.ref.slice(2)].pid)).size === 2 &&
    briefP.cases.every((c) => fx.projects[byH[c.ref.slice(2)].project].style === 'wood') && !chk.some((t) => /案例和方案风格不一样/.test(t)),
    JSON.stringify(briefP.cases) + ' ' + chk.filter((t) => /案例/.test(t)).join(' ; '));
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
  // 参考空间放不同的家：挑一张跟已经放着的不同家的
  const have = (await current(page)).cases.map((c) => byH[c.ref.slice(2)].pid);
  const caseRows = page.locator('#match-list .match-row').filter({ has: page.locator('[data-match-case]') });
  let firstCase = caseRows.first();
  for (let i = 0; i < await caseRows.count(); i++) {
    const rr = await caseRows.nth(i).getAttribute('data-ref');
    if (have.indexOf(byH[rr.slice(2)].pid) < 0) { firstCase = caseRows.nth(i); break; }
  }
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
  // 说明草稿 = 「为什么」的前两项（一句 ≤ 20 字 / 12 words，体检不会马上说太长）
  const draft = why.split(' · ').slice(0, 2).join(' · ');
  ok('F2 「放进参考空间」: the first two facts of the why become that case\'s note draft (editable textarea)', !!c && c.note === draft && ta.indexOf(draft) > -1 && done === 1, JSON.stringify(c) + ' ta=' + JSON.stringify(ta) + ' why=' + why);
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

/* ============================================================
   O · 复审修正：只自动用空间照、只挑方案的风格、房型说法、说明草稿、
       没登入的电脑看不到的照片不丢掉、登出记得住、登入过期不再自动挑、需求卡旧草稿
   ============================================================ */
{
  // privacy-1：平面图 / 截图（标「其他」、auto）、没人看过的新照片（项目定了风格）—— 不会被自动放进方案
  const r = await page.evaluate(() => {
    const orig = MB.cases().slice();
    const wood = orig.filter((c) => c.style === 'wood' && MB.caseUsable(c) && c.rooms[0] === 'kitchen');
    const extra = [];
    wood.slice(0, 4).forEach((c, i) => {
      const a = 'c:ff' + String(i).padStart(14, '0'), b = 'c:ee' + String(i).padStart(14, '0');
      extra.push(Object.assign({}, c, { id: a, shot: a, rooms: ['other'], status: 'auto', cabinets: ['kitchen', 'island'], hero: true }));
      extra.push(Object.assign({}, c, { id: b, shot: b, rooms: [], status: 'new', cabinets: [], hero: false }));
    });
    MB.setCases(orig.concat(extra));
    const res = MB.makeResolver([]);
    const bad = {}; extra.forEach((c) => { bad[c.id] = 1; });
    let hitsS = 0, hitsM = 0, nS = 0, nM = 0;
    for (let i = 0; i < 80; i++) {
      const p = MB.newProject({}); p.id = 'p-priv-' + i; p.direction = 'misty'; p.caseStyle = i % 2 ? 'wood' : '';
      p.property.area = 'Setia Alam'; p.property.type = 'Terrace';
      p.rooms = [MB.newRoom('kitchen')];
      MB.suggestCases(p, res, 3).forEach((x) => { nS++; if (bad[x]) hitsS++; });
      MB.matchCases(p, res).forEach((x) => { nM++; if (bad[x.ref]) hitsM++; });
    }
    // 体检：真的印了一张「其他」、一张没人看过的
    const p = MB.newProject({}); p.id = 'p-priv-check'; p.direction = 'misty'; p.client.names = 'Mr Ong';
    p.rooms = [MB.newRoom('kitchen')]; p.rooms[0].images = [wood[0].id]; p.rooms[0].manual = true;
    p.cases = [{ ref: extra[0].id, note: null }, { ref: extra[1].id, note: null }];
    const items = MB.checkProject(p, res).items.map((x) => x.level + '|' + x.text + '|' + x.goto);
    MB.setCases(orig); MB.makeResolver([]);
    return { hitsS, hitsM, nS, nM, items };
  });
  ok('O1 suggestCases / 帮我挑 never pick a floor plan / screenshot (room other) or an unreviewed photo', r.hitsS === 0 && r.hitsM === 0 && r.nS > 50 && r.nM > 50, JSON.stringify({ hitsS: r.hitsS, hitsM: r.hitsM, nS: r.nS, nM: r.nM }));
  ok('O1b check warns when a printed case photo is not a tagged space photo (平面图 / 截图) or unreviewed', r.items.some((x) => /^warn\|用了不是空间照、或还没人看过的公司案例照片.*\|cases$/.test(x)), r.items.filter((x) => /案例/.test(x)).join(' ; '));
}
{
  // visi-3：帮我挑只挑方案系列 / 客户说的风格（微侘寂的方案：案例库没有 → 0 张，不拿别的风格凑）
  const r = await page.evaluate(() => {
    const res = MB.makeResolver.last, out = {};
    [['wabi', ''], ['misty', 'wood'], ['misty', ''], ['skeleton', 'modern']].forEach(([dir, cs]) => {
      const p = MB.newProject({}); p.id = 'p-m-' + dir + cs; p.direction = dir; p.caseStyle = cs;
      p.rooms = ['kitchen', 'living', 'master'].map(MB.newRoom);
      const series = MB.dir(p).series;
      const list = MB.matchCases(p, res);
      out[dir + '/' + cs] = { n: list.length, off: list.filter((x) => { const c = MB.caseOf(x.ref); return c.series !== series && !(cs && c.style === cs); }).map((x) => MB.caseOf(x.ref).style) };
    });
    return out;
  });
  ok('O2 帮我挑 only suggests the proposal\'s series / the client\'s style (wabi → none)', r['wabi/'].n === 0 && Object.values(r).every((x) => !x.off.length) && r['misty/wood'].n > 0 && r['skeleton/modern'].n > 0, JSON.stringify(r));
}
{
  // visi-5：客户是商用 / 店屋 / 认不出的房型：不说「也是有地住宅」
  const r = await page.evaluate((a) => {
    const im = (ref) => { const c = MB.caseOf(ref); return { ref, series: c.series, rooms: c.rooms, area: c.area, ptype: c.ptype, traits: c.traits, zh: c.zh, en: c.en, label: c.label }; };
    const out = {};
    ['商用 Commercial', 'Shop lot', 'Townhouse', 'Condo', 'Terrace', 'Semi-D'].forEach((t) => {
      const p = MB.newProject({}); p.property.area = 'Puchong'; p.property.type = t; p.needs = [];
      out[t] = MB.caseNote(p, im(a.terrace), 'zh') + ' / ' + MB.caseNote(p, im(a.terrace), 'en');
    });
    const p2 = MB.newProject({}); p2.property.type = 'Condo'; p2.property.area = 'KL';
    out.condoCondo = MB.caseNote(p2, im(a.condo), 'zh') + ' / ' + MB.caseNote(p2, im(a.condo), 'en');
    return out;
  }, { terrace: P1REFS[0], condo: 'c:' + fx.photos.find((p) => p.project === 3 && !p.hidden && !p.unsure).h });
  ok('O3 caseNote: no 「也是有地住宅」 for Commercial / shop lot / townhouse clients; condo ↔ condo and landed ↔ landed still said',
    ['商用 Commercial', 'Shop lot', 'Townhouse', 'Condo'].every((t) => !/有地住宅|landed home|也是公寓|a condo/i.test(r[t])) &&
    /也是有地住宅/.test(r['Semi-D']) && /also a landed home/i.test(r['Semi-D']) && /也是排屋/.test(r.Terrace) && /也是公寓/.test(r.condoCondo) && /also a condo/i.test(r.condoCondo), JSON.stringify(r));
}
{
  // visi-7：「放进参考空间」—— 双语方案存 null（印的时候华文、英文各自写）；英文方案只取两项（体检不说太长）；同一个家只放一次
  const mk = (lang, cases) => page.evaluate((a) => {
    const p = MB.newProject({}); p.lang = a.lang; p.direction = 'misty'; p.caseStyle = 'wood';
    p.client.names = 'Mr Ong'; p.property.area = 'Setia Alam'; p.property.type = 'Terrace';
    p.needs = [{ key: 'elderly' }];
    p.rooms = ['kitchen', 'foyer'].map(MB.newRoom); p.cases = a.cases;
    return JSON.parse(JSON.stringify(p));
  }, { lang, cases: cases || [] });
  // pid：只点这个家的那一行（参考空间已经有这个家 → 应该不放）
  const place = async (lang, cases, pid) => {
    await importProject(page, await mk(lang, cases));
    await page.click('[data-tab="rooms"]');
    await page.click('#cases-match');
    await page.waitForSelector('#match-modal.on');
    await page.waitForTimeout(400);
    const rows = page.locator('#match-list .match-row').filter({ has: page.locator('[data-match-case]') });
    let row = null;
    for (let i = 0; i < await rows.count(); i++) {
      const ref = await rows.nth(i).getAttribute('data-ref');
      if (!pid || byH[ref.slice(2)].pid === pid) { row = rows.nth(i); break; }
    }
    if (row) { await row.locator('[data-match-case]').click(); await page.waitForTimeout(300); }
    await page.click('#match-modal [data-close]');
    await page.waitForTimeout(700);
    const p = await current(page);
    const deck = await page.innerText('#deck').catch(() => '');
    const items = await page.evaluate(() => { const id = localStorage.getItem('sail-mb-active'); return MB.store.getProject(id).then((x) => MB.checkProject(MB.normalizeProject(x), MB.makeResolver.last).items.map((i) => i.text)); });
    return { p, deck, items, clicked: !!row };
  };
  const bi = await place('bi');
  const biCard = bi.p.cases[0] ? await page.evaluate((ref) => { const id = localStorage.getItem('sail-mb-active'); return MB.store.getProject(id).then((x) => { const p = MB.normalizeProject(x); const c = MB.caseCards(p, MB.makeResolver.last, 'bi')[0]; return c ? c.line : null; }); }, bi.p.cases[0].ref) : null;
  ok('O4 bilingual proposal: 「放进参考空间」 stores note null, the card prints both zh and en', bi.p.cases.length === 1 && bi.p.cases[0].note === null && biCard && typeof biCard === 'object' && !!biCard.zh && !!biCard.en,
    JSON.stringify(bi.p.cases) + ' ' + JSON.stringify(biCard));
  // 参考空间已经有 Setia Alam 陈先生家的一张：帮我挑里同一个家的另一张不放进去
  const same = await place('zh', [{ ref: P1REFS[2], note: null }], P1.pid);
  ok('O4b a second photo of the same home is not added to 参考空间', same.clicked && same.p.cases.length === 1 && same.p.cases[0].ref === P1REFS[2], JSON.stringify({ clicked: same.clicked, cases: same.p.cases }));
  const en = await place('en');
  const note = en.p.cases[0] && en.p.cases[0].note;
  ok('O4c English proposal: note draft is the first two facts (≤ 12 words) and the check does not call it too long',
    !!note && note.split(' · ').length <= 2 && note.split(/\s+/).length <= 14 && !en.items.some((t) => /写得太长/.test(t)), JSON.stringify(note) + ' ' + en.items.filter((t) => /太长/.test(t)).join());
}
{
  // visi-2：同事导出的方案（rooms / 参考空间都是 c:），在没登入过的电脑打开
  const exported = await page.evaluate((a) => {
    const p = MB.newProject({}); p.id = 'p-export'; p.direction = 'misty'; p.client.names = 'Mr Ong';
    p.rooms = ['kitchen', 'living'].map(MB.newRoom);
    p.rooms[0].images = [a.k[0], a.k[1]]; p.rooms[1].images = [a.k[4]];
    p.cases = [{ ref: a.k[2], note: null }, { ref: a.k[3], note: null }];
    return JSON.parse(JSON.stringify(p));
  }, { k: P1REFS });
  const fresh = await open(mock.url);
  const dialogs = [];
  fresh.page.on('dialog', (d) => dialogs.push(d.message()));
  await importProject(fresh.page, exported);
  const items = await fresh.page.evaluate(() => { const id = localStorage.getItem('sail-mb-active'); return MB.store.getProject(id).then((x) => MB.checkProject(MB.normalizeProject(x), MB.makeResolver.last).items.map((i) => i.level + '|' + i.text + '|' + i.goto)); });
  ok('O5 imported proposal on a never-logged-in computer: the check says how many case photos cannot be seen and points to 图库 (log in)',
    items.some((x) => /^warn\|有 5 张公司案例照片这台电脑看不到 —— 先登入公司案例库\|library$/.test(x)), items.filter((x) => /案例/.test(x)).join(' ; '));
  // 选图弹窗按「确定」、换风格：看不到的 c: 照片照样留着
  await fresh.page.click('[data-tab="rooms"]');
  await fresh.page.locator('#room-list [data-room-pick]').first().click();
  await fresh.page.waitForSelector('#pick-modal.on');
  const title = await fresh.page.textContent('#pick-title');
  await fresh.page.click('#pick-ok');
  await fresh.page.waitForTimeout(300);
  await fresh.page.click('#cases-pick');
  await fresh.page.waitForSelector('#pick-modal.on');
  await fresh.page.click('#pick-ok');
  await fresh.page.waitForTimeout(300);
  await fresh.page.click('[data-tab="style"]');
  await fresh.page.click('#dir-cards [data-dir="skeleton"]');
  await fresh.page.waitForTimeout(800);
  const after = await current(fresh.page);
  const kept = after.rooms[0].images.filter((x) => /^c:/.test(x)).length === 2 && after.rooms[1].images.indexOf(P1REFS[4]) > -1 &&
    after.cases.map((c) => c.ref).join() === [P1REFS[2], P1REFS[3]].join();
  ok('O5b picker 「确定」 and a direction change keep the c: refs this computer cannot see', kept && /看不到，会留着/.test(title), JSON.stringify({ rooms: after.rooms.map((r) => r.images), cases: after.cases, title }));
  // 自动配图前会先问
  await fresh.page.click('[data-tab="rooms"]');
  await fresh.page.locator('#room-list [data-room-auto]').first().click();
  await fresh.page.waitForTimeout(300);
  ok('O5c 自动配图 on a room with unseen case photos asks first', dialogs.some((m) => /这台电脑看不到/.test(m)), dialogs.join(' | '));
  ok('O5d no /api request from the never-logged-in computer', fresh.api.length === 0, fresh.api.join());
  await fresh.ctx.close();
}
{
  // visi-9：登入过期（401）→ 存着的清单只解析方案里已经放的；不再自动挑、帮我挑也不用
  const s = await open(mock.url);
  await login(s.page);
  const before = await s.page.evaluate(() => MB.cases().filter(MB.caseUsable).length);
  await s.ctx.clearCookies();
  await s.page.evaluate(() => MB.cloud.refresh(true));
  await s.page.waitForTimeout(500);
  const r = await s.page.evaluate((a) => {
    const res = MB.makeResolver.last;
    const p = MB.newProject({}); p.id = 'p-stale'; p.direction = 'misty'; p.caseStyle = 'wood'; p.client.names = 'Mr Ong';
    p.rooms = [MB.newRoom('kitchen')];
    const auto = MB.autoPick(p, p.rooms[0], []);
    p.cases = [{ ref: a.ref, note: null }];
    return { st: MB.cloud.status(), usable: MB.cases().filter(MB.caseUsable).length, stale: MB.cases().every((c) => c.stale),
      resolves: !!res(a.ref), auto, suggest: MB.suggestCases(p, res, 3), match: MB.matchCases(p, res).length,
      items: MB.checkProject(p, res).items.map((x) => x.level + '|' + x.text + '|' + x.goto) };
  }, { ref: P1REFS[2] });
  await s.page.click('[data-tab="library"]');
  await s.page.waitForTimeout(300);
  const box = await s.page.innerText('#cloud-panel');
  ok('O6 session expired (401): cached cases only resolve refs — not used for auto-pick, suggestions or 帮我挑',
    before === 57 && r.st.status === 'login' && r.stale && r.usable === 0 && r.resolves && !r.auto.some((x) => /^c:/.test(x)) && !r.suggest.length && !r.match &&
    !(await s.page.isVisible('#lib-match')), JSON.stringify({ before, st: r.st, usable: r.usable, auto: r.auto, suggest: r.suggest, match: r.match }));
  ok('O6b check warns that printed case photos cannot be confirmed until you log in again; box says the cache is display-only',
    r.items.some((x) => /^warn\|公司案例库登入过期：1 张案例照片没办法确认还能不能用\|library$/.test(x)) && /登入过期了.*不会再自动挑/.test(box), r.items.filter((x) => /案例/.test(x)).join(' ; ') + ' || ' + box.slice(0, 160));
  // 重新登入：又能自动挑
  await s.page.fill('#cloud-panel [data-cloud-login] [name=name]', 'Ana');
  await s.page.fill('#cloud-panel [data-cloud-login] [name=pw]', 'test-pass');
  await s.page.click('#cloud-panel [data-cloud-login] button');
  await s.page.waitForFunction(() => MB.cases().filter(MB.caseUsable).length === 57, null, { timeout: 8000 }).catch(() => {});
  ok('O6c logging in again makes the cases usable again', await s.page.evaluate(() => MB.cases().filter(MB.caseUsable).length === 57 && !MB.cloud.status().stale));
  // visi-8：登出 → 重新整理：不会又显示「已登入：Ana」、不再问伺服器、存着的也不再自动挑
  await s.page.click('#cloud-panel [data-cloud-logout]');
  await s.page.waitForTimeout(500);
  s.api.length = 0;
  await s.page.reload();
  await s.page.waitForSelector('#deck .pg');
  await s.page.waitForTimeout(800);
  await s.page.click('[data-tab="library"]');
  await s.page.waitForTimeout(300);
  const box2 = await s.page.innerText('#cloud-panel');
  const st2 = await s.page.evaluate(() => ({ st: MB.cloud.status(), usable: MB.cases().filter(MB.caseUsable).length, n: MB.cases().length, user: localStorage.getItem('sail-visi-cases-user') }));
  ok('O7 logout survives a reload: login box (not 「已登入：Ana」), no /api request, cached cases kept but not auto-used',
    !/已登入/.test(box2) && !/登入过期/.test(box2) && /团队密码/.test(box2) && await s.page.isVisible('#cloud-panel [name=pw]') && st2.st.status !== 'ok' && !st2.st.user && st2.user === null &&
    st2.n === 60 && st2.usable === 0 && s.api.length === 0, JSON.stringify({ box: box2.slice(0, 120), st2, api: s.api }));
  await s.ctx.close();
}
{
  // privacy-5：需求卡改名前存的草稿（自然原木、侘寂）：回来时照样勾着（换成新名字）
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  await pg.goto(mock.url + '/brief');
  await pg.evaluate(() => localStorage.setItem('sail-brief-draft', JSON.stringify({ name: 'Mr Ong', style: ['自然原木 Natural wood', '侘寂 Wabi-sabi'] })));
  await pg.reload();
  await pg.waitForTimeout(400);
  const checked = await pg.$$eval('input[name=style]:checked', (els) => els.map((e) => e.value));
  await pg.evaluate(() => document.dispatchEvent(new Event('change')));
  const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('sail-brief-draft')).style);
  ok('O8 brief draft saved with the old style names keeps the picks (原木 / 微侘寂) after the rename', JSON.stringify(checked) === JSON.stringify(['原木 Natural wood', '微侘寂 Subtle wabi-sabi']) &&
    JSON.stringify(saved) === JSON.stringify(checked), JSON.stringify({ checked, saved }));
  await ctx.close();
}

/* ============================================================
   P · 案例库被 Vercel 暂停（免费额度用完）、案例照片被删掉：VISI 不出现破图
   ------------------------------------------------------------
   暂停中照片网址都回 403：方案里已经放的案例照片照样解析（方案打得开），但印成占位框；
   自动配的空间、版位改用内置照片；图库、帮我挑、自动挑都不用案例，而且说清楚为什么；体检叫他先别发。
   恢复（按「更新」）就回来。被删掉的 c: 照片也印占位框，体检叫他换一张。内置、自己的照片不受影响
   ============================================================ */
const BLOCKED_MSG = '公司案例库暂停中：Vercel 的免费额度用完了，案例照片暂时不能用。内置照片和你自己的照片照常可以用。';
/** 方案页（#deck）里的 <img>：指着案例库网址的几张、没载出来的（破图）、占位框、载出来的内置图 */
async function deckImgs(pg) {
  return pg.evaluate(async (blob) => {
    const ims = [...document.querySelectorAll('#deck img')];
    await Promise.all(ims.map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 5000); }))));
    const src = (i) => i.getAttribute('src') || '';
    return {
      n: ims.length,
      caseSrc: ims.filter((i) => src(i).indexOf(blob) === 0).length,
      broken: ims.filter((i) => !i.naturalWidth).map((i) => src(i).slice(0, 90)),
      gone: [...document.querySelectorAll('#deck .ph-gone')].map((e) => e.getAttribute('data-gone')),
      builtin: ims.filter((i) => /assets\/img\//.test(src(i)) && i.naturalWidth > 0).length
    };
  }, mock.blob);
}
const hook = (q) => fetch(mock.blob + '__mock/' + q, { method: 'POST' }).then((r) => r.json());
const checkItems = (pg) => pg.evaluate(() => { const id = localStorage.getItem('sail-mb-active'); return MB.store.getProject(id).then((x) => MB.checkProject(MB.normalizeProject(x), MB.makeResolver.last).items.map((i) => i.level + '|' + i.text + '|' + i.goto)); });
{
  const t = await open(mock.url);
  const tp = t.page;
  await login(tp);
  // 一份方案：厨房、客厅是销售亲手放的案例；玄关是自动配的案例；主卧亲手放内置图；封面亲手选了一张案例；参考空间 2 个案例
  const other = 'c:' + fx.photos.find((p) => p.project === 3 && !p.hidden && !p.unsure && p.room === 'kitchen').h;
  const BLK = await tp.evaluate((a) => {
    const p = MB.newProject({});
    p.id = 'p-blocked'; p.lang = 'zh'; p.direction = 'misty'; p.caseStyle = 'wood';
    p.client.names = 'Mr Test'; p.host.name = 'Ana'; p.host.wa = '60123456789'; p.visit.date = '2026-12-12';
    p.rooms = ['kitchen', 'living', 'foyer', 'master'].map(MB.newRoom);
    p.rooms[0].images = [a.k[0], a.k[2]]; p.rooms[0].manual = true;
    p.rooms[1].images = [a.k[3]]; p.rooms[1].manual = true;
    p.rooms[2].images = [a.k[5]]; p.rooms[2].manual = false;
    const bm = MB.BUILTIN.filter((b) => b.series === 'misty' && b.rooms.indexOf('master') > -1)[0];
    p.rooms[3].images = [bm.id]; p.rooms[3].manual = true;
    p.images.cover = a.k[8];
    p.cases = [{ ref: a.k[4], note: null }, { ref: a.other, note: null }];
    return MB.normalizeProject(p);
  }, { k: P1REFS, other });
  await importProject(tp, BLK);
  const before = await deckImgs(tp);
  ok('P0 before: the proposal prints its case photos (blob URLs, all loaded)', before.caseSrc >= 6 && !before.broken.length && !before.gone.length, JSON.stringify(before));

  // ---- 暂停：伺服器回 503 storage_blocked、照片网址回 403 ----
  await hook('blocked?on=1');
  const apiBefore = t.api.length;
  await tp.evaluate(() => MB.cloud.refresh(true));
  await tp.waitForTimeout(500);
  const st = await tp.evaluate((a) => ({ st: MB.cloud.status(), n: MB.cases().length, usable: MB.cases().filter(MB.caseUsable).length,
    resolves: a.refs.every((x) => !!MB.makeResolver.last(x)), srcs: MB.cases().filter((c) => c.src).length }), { refs: [P1REFS[0], other] });
  ok('P1 GET /api/catalog 503 storage_blocked → status blocked (not unavailable); cached cases still resolve, none usable, no photo URL handed out',
    st.st.status === 'blocked' && st.st.blocked && st.n === 60 && st.usable === 0 && st.resolves && st.srcs === 0 && t.api.length === apiBefore + 1, JSON.stringify(st));
  const blk = await deckImgs(tp);
  const plan = await tp.evaluate(() => { const id = localStorage.getItem('sail-mb-active'); return MB.store.getProject(id).then((x) => { const p = MB.normalizeProject(x); const d = MB.deckImages(p, MB.makeResolver.last); return { foyer: d.rooms[p.rooms[2].uid], master: d.rooms[p.rooms[3].uid], cover: d.slot.cover }; }); });
  ok('P2 deck while blocked: no <img> points at the case library, nothing broken; hand-placed case photos are placeholders (2 kitchen + living + cover + 2 cases)',
    blk.caseSrc === 0 && !blk.broken.length && blk.gone.length === 6 && blk.gone.every((g) => g === 'blocked'), JSON.stringify(blk));
  ok('P3 the auto-picked foyer falls back to a built-in photo; the hand-placed built-in master photo is unchanged and prints',
    plan.foyer.length > 0 && plan.foyer.every((x) => /^b:/.test(x)) && /^b:/.test(plan.master[0]) && blk.builtin >= 3, JSON.stringify(plan) + ' builtin=' + blk.builtin);
  // 自动挑 / 帮我挑：一张案例都不用
  const picks = await tp.evaluate(() => { const id = localStorage.getItem('sail-mb-active'); return MB.store.getProject(id).then((x) => {
    const p = MB.normalizeProject(x), res = MB.makeResolver.last;
    const k = MB.newRoom('kitchen'), d = MB.newRoom('dining'); p.rooms.push(k, d);
    return { k: MB.autoPick(p, k, []), d: MB.autoPick(p, d, []), suggest: MB.suggestCases(p, res, 3), match: MB.matchCases(p, res), lib: MB.allImages([]).filter((im) => im.isCase).length,
      slots: (function () { const pl = MB.deckImages(p, res); return Object.keys(pl.slot).map((s) => pl.slot[s]).concat(pl.glance).filter((r) => r && /^c:/.test(r) && r !== p.images.cover); })() };
  }); });
  ok('P4 while blocked autoPick / deckImages / suggestCases / 帮我挑 / gallery use no c: refs',
    picks.k.length > 0 && !picks.k.concat(picks.d).some((x) => /^c:/.test(x)) && !picks.suggest.length && !picks.match.length && picks.lib === 0 && !picks.slots.length, JSON.stringify(picks));
  // 画面：图库那一格、参考空间、选图弹窗都有那一句；图库没有「公司案例」来源
  await tp.click('[data-tab="library"]');
  await tp.waitForTimeout(300);
  const box = await tp.innerText('#cloud-panel');
  const casesChip = await tp.isVisible('#lib-filter [data-src="cases"]');
  const builtinTiles = await tp.locator('#lib-grid .lib-item:not(.case) img').count();
  ok('P5 library: the case box shows the 暂停中 banner, no 公司案例 source, built-in photos still listed', box.indexOf(BLOCKED_MSG) > -1 && !casesChip && builtinTiles > 5, box.slice(0, 200) + ' chip=' + casesChip + ' tiles=' + builtinTiles);
  await tp.click('[data-tab="rooms"]');
  await tp.waitForTimeout(300);
  const casesBanner = await tp.locator('#cases-panel [data-cases-blocked]').isVisible() && (await tp.textContent('#cases-panel [data-cases-blocked]')) === BLOCKED_MSG;
  const tags = await tp.$$eval('#room-list .case-tag', (els) => els.map((e) => e.textContent));
  const roomBroken = await tp.$$eval('#room-list img, #cases-list img', (ims) => ims.filter((i) => !/^data:|^blob:|assets\/img\//.test(i.getAttribute('src') || '')).map((i) => i.getAttribute('src')));
  ok('P6 ③: 参考空间 shows the banner; placed case photos are tagged 暂时打不开 and show cached thumbnails (no case-library URL)', casesBanner && tags.filter((x) => x === '暂时打不开').length >= 4 && !roomBroken.length,
    JSON.stringify({ casesBanner, tags, roomBroken }));
  await tp.locator('#room-list [data-room-pick]').first().click();
  await tp.waitForSelector('#pick-modal.on');
  const pickBanner = await tp.locator('#pick-modal [data-cases-blocked]').isVisible();
  const pickTitle = await tp.textContent('#pick-title');
  await tp.click('#pick-ok');
  await tp.waitForTimeout(500);
  const keptKitchen = (await current(tp)).rooms[0].images;
  ok('P7 picker: banner shown; 「加入所选」 keeps the case photos that cannot open right now', pickBanner && /暂时打不开（案例库暂停中），会留着/.test(pickTitle) && keptKitchen.join() === [P1REFS[0], P1REFS[2]].join(),
    JSON.stringify({ pickBanner, pickTitle, keptKitchen }));
  // 帮我挑、自动挑 3 个：说明为什么挑不了（不是一声不响地空着）
  const matchVisible = await tp.isVisible('#cases-match');
  await tp.click('#cases-match');
  await tp.waitForSelector('#match-modal.on');
  await tp.waitForTimeout(200);
  const matchText = await tp.innerText('#match-modal');
  await tp.click('#match-modal [data-close]');
  await tp.click('#cases-auto');
  await tp.waitForTimeout(200);
  const toast = await tp.textContent('#toast');
  const casesAfter = (await current(tp)).cases.map((c) => c.ref);
  ok('P8 帮我挑 / 自动挑 3 个 explain the pause instead of returning nothing silently; 参考空间 untouched',
    matchVisible && /帮我挑现在挑不了/.test(matchText) && matchText.indexOf(BLOCKED_MSG) > -1 && toast.indexOf(BLOCKED_MSG) > -1 && casesAfter.join() === [P1REFS[4], other].join(),
    JSON.stringify({ matchVisible, matchText: matchText.slice(0, 200), toast, casesAfter }));
  const items = await checkItems(tp);
  ok('P9 体检 (bad): 有 6 张公司案例照片暂时打不开（案例库暂停中），先别发给客户', items.some((x) => /^bad\|有 6 张公司案例照片暂时打不开（案例库暂停中），先别发给客户\|/.test(x)) &&
    !items.some((x) => /这台电脑看不到/.test(x)), items.filter((x) => /案例/.test(x)).join(' ; '));
  // 打印：占位框里那行提醒不印；PPTX：照样导出，没有案例照片、也没有那行提醒
  await tp.emulateMedia({ media: 'print' });
  const printVis = await tp.$$eval('#deck .ph-gone .todo', (els) => els.map((e) => getComputedStyle(e).visibility));
  await tp.emulateMedia({ media: 'screen' });
  const out = await exportPptx(tp, 'visi-blocked');
  const z = readPptx(out.file);
  ok('P10 PDF print hides the placeholder note; PPTX still exports (no case image, no note text, no leak)',
    printVis.length === 6 && printVis.every((v) => v === 'hidden') && /PPTX 已导出/.test(out.toast) && !z.media.some((h) => caseHashes[h]) && !/暂时打不开|案例库暂停中/.test(z.xml) && !leaks(z.xml).length,
    JSON.stringify({ printVis, toast: out.toast, media: z.media.length }));
  // 重新整理（伺服器也连不上）：记得是暂停中 —— 第一次排版就没有破图
  mock.setDown(true);
  await tp.reload();
  await tp.waitForSelector('#deck .pg');
  const first = await tp.evaluate((blob) => ({ caseSrc: [...document.querySelectorAll('#deck img')].filter((i) => (i.getAttribute('src') || '').indexOf(blob) === 0).length,
    gone: document.querySelectorAll('#deck .ph-gone').length, blocked: MB.cloud.status().blocked }), mock.blob);
  await tp.waitForTimeout(800);
  const later = await tp.evaluate(() => MB.cloud.status());
  await tp.click('[data-tab="rooms"]');
  await tp.waitForTimeout(600);
  const roomImgs = await tp.$$eval('#room-list img, #cases-list img', (ims, blob) => ({ data: ims.filter((i) => /^data:image\/jpeg/.test(i.src)).length,
    lib: ims.filter((i) => (i.getAttribute('src') || '').indexOf(blob) === 0).length }), mock.blob);
  mock.setDown(false);
  ok('P11 reload while blocked (API down too): the first render already uses placeholders (blocked remembered), still blocked after the failed refresh; ③ shows the thumbnails saved on this computer',
    first.blocked && first.caseSrc === 0 && first.gone === 6 && later.blocked && later.status === 'offline' && roomImgs.data >= 3 && roomImgs.lib === 0,
    JSON.stringify({ first, later, roomImgs }));

  // ---- 恢复：按「更新」→ 照片回来 ----
  await hook('blocked?on=0');
  await tp.click('[data-tab="library"]');
  await tp.click('#cloud-panel [data-cloud-refresh]');
  await tp.waitForTimeout(900);
  const back = await deckImgs(tp);
  const st2 = await tp.evaluate(() => ({ st: MB.cloud.status(), usable: MB.cases().filter(MB.caseUsable).length }));
  const box2 = await tp.innerText('#cloud-panel');
  const auto2 = await tp.evaluate(() => { const id = localStorage.getItem('sail-mb-active'); return MB.store.getProject(id).then((x) => {
    const p = MB.normalizeProject(x), k = MB.newRoom('kitchen'); p.rooms.push(k);
    return { k: MB.autoPick(p, k, []), foyer: MB.deckImages(p, MB.makeResolver.last).rooms[p.rooms[2].uid] };
  }); });
  ok('P12 unblock + 更新 → status ok, cases usable again, banner gone, deck shows the case photos again (loaded), auto foyer back to its case photo',
    st2.st.status === 'ok' && !st2.st.blocked && st2.usable === 57 && box2.indexOf(BLOCKED_MSG) < 0 && back.caseSrc >= 6 && !back.broken.length && !back.gone.length &&
    auto2.k.some((x) => /^c:/.test(x)) && auto2.foyer[0] === P1REFS[5], JSON.stringify({ st: st2, back, auto2 }));
  ok('P13 no page errors in the blocked session', !t.errors.filter((e) => /pageerror/.test(e)).length, t.errors.filter((e) => /pageerror/.test(e)).join(' | '));

  // ---- 被删掉：审核页释放空间删了一张（隐藏的那张）+ 一个清单里从来没有的 c: ----
  const DEAD = HIDDEN[0], NEVER = 'c:' + '0f'.repeat(8);
  const DEL = await tp.evaluate((a) => {
    const p = MB.newProject({});
    p.id = 'p-deleted'; p.lang = 'zh'; p.direction = 'misty'; p.client.names = 'Mr Test'; p.visit.date = '2026-12-12';
    p.rooms = ['kitchen', 'living'].map(MB.newRoom);
    p.rooms[0].images = [a.dead, a.k0]; p.rooms[0].manual = true;
    const bl = MB.BUILTIN.filter((b) => b.series === 'misty' && b.rooms.indexOf('living') > -1)[0];
    p.rooms[1].images = [bl.id]; p.rooms[1].manual = true;
    p.cases = [{ ref: a.never, note: null }];
    return MB.normalizeProject(p);
  }, { dead: DEAD, k0: P1REFS[0], never: NEVER });
  await importProject(tp, DEL);
  const purge = await tp.evaluate((h) => fetch('api/catalog', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-VISI': '1' },
    body: JSON.stringify({ op: 'purge', photos: [h], confirm: '删除' }) }).then((r) => r.json().then((j) => ({ s: r.status, j }))), DEAD.slice(2));
  await tp.evaluate(() => MB.cloud.refresh(true));
  await tp.waitForTimeout(600);
  const del = await deckImgs(tp);
  const delItems = await checkItems(tp);
  await tp.click('[data-tab="rooms"]');
  await tp.waitForTimeout(300);
  const delTags = await tp.$$eval('#room-list .case-tag, #cases-list .case-tag', (els) => els.map((e) => e.textContent));
  const k0src = await tp.evaluate((ref) => MB.makeResolver.last(ref).src, P1REFS[0]);
  const k0shown = await tp.$$eval('#deck img', (ims, s) => ims.some((i) => i.getAttribute('src') === s && i.naturalWidth > 0), k0src);
  ok('P14 purged / unknown c: refs (catalog current) → placeholders, nothing broken; the kitchen\'s other case photo and the built-in still print',
    purge.s === 200 && purge.j.removed === 1 && del.gone.filter((g) => g === 'deleted').length === 2 && !del.broken.length && k0shown && del.builtin >= 2,
    JSON.stringify({ purge, del, k0shown }));
  ok('P15 体检: 有 2 张案例照片已经被删除，请换一张 (bad); ③ tags them 已删除', delItems.some((x) => /^bad\|有 2 张案例照片已经被删除，请换一张\|/.test(x)) &&
    !delItems.some((x) => /这台电脑看不到/.test(x)) && delTags.filter((x) => x === '已删除').length === 2, delItems.filter((x) => /案例/.test(x)).join(' ; ') + ' tags=' + delTags.join());
  await tp.locator('#room-list [data-room-pick]').first().click();
  await tp.waitForSelector('#pick-modal.on');
  const delTitle = await tp.textContent('#pick-title');
  await tp.click('#pick-ok');
  await tp.waitForTimeout(500);
  const afterPick = (await current(tp)).rooms[0].images;
  ok('P16 picker says the deleted photo will be removed; 「加入所选」 drops it and keeps the rest', /已经被删除，按「加入所选」就拿掉/.test(delTitle) && afterPick.join() === P1REFS[0],
    JSON.stringify({ delTitle, afterPick }));
  // 占位的那一份（被删掉的）进讲稿、文案、案例卡片也不出错、不外流
  const txt = await tp.evaluate(() => { const id = localStorage.getItem('sail-mb-active'); return MB.store.getProject(id).then((x) => {
    const p = MB.normalizeProject(x), res = MB.makeResolver.last, out = [];
    MB.pageList(p, res).forEach((pg) => ['zh', 'en', 'bi'].forEach((L) => out.push(MB.pageNotes(p, pg, L))));
    ['zh', 'en'].forEach((L) => out.push(JSON.stringify(MB.writeCopy(p, L)), JSON.stringify(MB.caseCards(p, res, L))));
    return out.join('\n');
  }); });
  const pe = t.errors.filter((e) => /pageerror/.test(e));
  ok('P16b with deleted / paused photos: speaker notes, copy and case cards build without errors and leak nothing; no page errors', txt.length > 300 && !leaks(txt).length && !pe.length,
    leaks(txt).join(',') + ' ' + pe.join(' | '));
  await t.ctx.close();
}
{
  // 伺服器问不到（500）时，用一张照片试：回 403 才算暂停中；网路出错、伺服器 500 本身不会挡案例；一天最多试一次
  const t = await open(mock.url);
  const heads = [];
  t.page.on('request', (r) => { if (r.method() === 'HEAD' && r.url().indexOf(mock.blob) === 0) heads.push(r.url()); });
  await login(t.page);
  mock.setDown(true);
  await t.page.evaluate(() => MB.cloud.refresh(true));
  await t.page.waitForTimeout(500);
  const glitch = await t.page.evaluate(() => MB.cloud.status());
  ok('P17 API 500 alone (photos fine) never blocks: one probe, answer 200, status offline, cases still usable',
    glitch.status === 'offline' && !glitch.blocked && heads.length === 1 && await t.page.evaluate(() => MB.cases().filter(MB.caseUsable).length === 57), JSON.stringify({ glitch, heads: heads.length }));
  await hook('blocked?on=1');
  await t.page.evaluate(() => MB.cloud.refresh(true));
  await t.page.waitForTimeout(400);
  const limited = await t.page.evaluate(() => MB.cloud.status());
  await t.page.evaluate(() => MB.cloud.probe());
  await t.page.waitForTimeout(300);
  const probed = await t.page.evaluate(() => ({ st: MB.cloud.status(), usable: MB.cases().filter(MB.caseUsable).length }));
  ok('P18 probe at most once a day (second offline refresh does not probe); a probe answering 403 → blocked (status stays offline)',
    !limited.blocked && heads.length === 2 && probed.st.blocked && probed.st.status === 'offline' && probed.usable === 0, JSON.stringify({ limited, probed, heads: heads.length }));
  await hook('blocked?on=0');
  mock.setDown(false);
  await t.page.evaluate(() => MB.cloud.refresh(true));
  await t.page.waitForTimeout(400);
  const ok2 = await t.page.evaluate(() => ({ st: MB.cloud.status(), usable: MB.cases().filter(MB.caseUsable).length }));
  ok('P19 API back → unblocked', ok2.st.status === 'ok' && !ok2.st.blocked && ok2.usable === 57, JSON.stringify(ok2));
  // 503 not_configured 还是「这个网址没有案例库」（不是暂停中）；507 quota 算暂停中
  const kinds = await t.page.evaluate(async () => {
    const real = window.fetch, out = {};
    const fake = (status, body) => function (u, o) {
      if (String(u).indexOf('api/catalog') > -1) return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
      return real.apply(this, arguments);
    };
    window.fetch = fake(503, { error: 'not_configured' });
    out.nc = await MB.cloud.refresh(true);
    window.fetch = fake(507, { error: 'quota', reason: 'writes', writesLeft: 0, bytesLeft: 1 });
    out.q = await MB.cloud.refresh(true);
    window.fetch = real;
    out.back = await MB.cloud.refresh(true);
    return { nc: [out.nc.status, out.nc.blocked], q: [out.q.status, out.q.blocked], back: [out.back.status, out.back.blocked] };
  });
  ok('P20 503 not_configured stays 「unavailable」 (not blocked); 507 quota → blocked; a later good refresh → ok',
    kinds.nc.join() === 'unavailable,false' && kinds.q.join() === 'blocked,true' && kinds.back.join() === 'ok,false', JSON.stringify(kinds));
  await t.ctx.close();
}

/* ============================================================
   Q · 审核找到的几个洞
   ------------------------------------------------------------
   Q1–Q3  这台电脑的清单是旧的（10 分钟内才问过）：照片刚被删掉 → 那张载不出来，马上换占位框、去问伺服器，
          体检说「已经被删除」；登入过期（伺服器问不到）时 HEAD 那一张，回 404 一样当成删掉了
   Q4     案例库刚被暂停、10 分钟一次的更新还没问到：照片 403 → 马上问伺服器 → 暂停中、全部占位框
   Q5–Q7  暂停中照体检说的「换成内置照片」：选图弹窗最上面一排可以拿掉暂停中的那几张，新挑的不会被挤掉、
          什么都不改按「确定」主图还是主图、4 张上限算进暂停中的
   Q8     暂停中又连不上 / 登入过期：「更新」的提醒先说问不到、要登入，不说「还在暂停中」；登入框不说「照样显示」
   每个浏览器都关掉 HTTP 快取（正式的照片网址 max-age 一年）：重新整理时照片真的去网路拿 —— 跟另一台电脑一样
   ============================================================ */
{
  const nocache = async (t) => { const cdp = await t.ctx.newCDPSession(t.page); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); t.cdp = cdp; };
  const post = (pg, body) => pg.evaluate((b) => fetch('api/catalog', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-VISI': '1' },
    body: JSON.stringify(b) }).then((r) => r.json().then((j) => ({ s: r.status, j }))), body);
  const deckOf = (pg) => pg.evaluate(async (blob) => {
    const ims = [...document.querySelectorAll('#deck img')];
    await Promise.all(ims.map((im) => (im.complete ? null : new Promise((r) => { im.addEventListener('load', r); im.addEventListener('error', r); setTimeout(r, 5000); }))));
    const src = (i) => i.getAttribute('src') || '';
    return { caseSrc: ims.filter((i) => src(i).indexOf(blob) === 0).length, broken: ims.filter((i) => !i.naturalWidth).map((i) => src(i).slice(0, 90)),
      gone: [...document.querySelectorAll('#deck .ph-gone')].map((e) => e.getAttribute('data-gone')) };
  }, mock.blob);
  const editorBroken = (pg) => pg.$$eval('#room-list img, #cases-list img', (ims) => ims.filter((i) => i.complete && !i.naturalWidth).length);
  const X = UNSURE[0];   // 不确定的照片：手放的照样印；先隐藏才删得掉
  const kx = fx.photos.find((p) => 'c:' + p.h === X).k;
  const mkX = (id) => (a) => {
    const p = MB.newProject({});
    p.id = a.id; p.lang = 'zh'; p.direction = 'misty'; p.client.names = 'Mr Test'; p.visit.date = '2026-12-12';
    p.rooms = ['kitchen'].map(MB.newRoom);
    p.rooms[0].images = [a.x, a.k0]; p.rooms[0].manual = true;
    return MB.normalizeProject(p);
  };
  const A = await open(mock.url); await nocache(A); await login(A.page);
  const B = await open(mock.url); await nocache(B); await login(B.page);
  for (const [t, id] of [[A, 'p-stale-a'], [B, 'p-stale-b']]) {
    const proj = await t.page.evaluate(mkX(id), { id, x: X, k0: P1REFS[0] });
    await importProject(t.page, proj);
  }
  const a0 = await deckOf(A.page);
  ok('Q0 before the purge: both salespeople\'s proposals print the case photo (loaded)', a0.caseSrc >= 2 && !a0.broken.length && !a0.gone.length, JSON.stringify(a0));
  // 老板在审核页：隐藏 → 删除（释放空间）。A、B 的 VISI 都没有去问
  const hid = await post(A.page, { op: 'hide', photos: [X.slice(2)] });
  const pur = await post(A.page, { op: 'purge', photos: [X.slice(2)], confirm: '删除' });

  // Q1 · A 重新整理（10 分钟内才问过：不问伺服器就当最新）→ 那张 404
  const aGets = A.api.filter((x) => x === 'GET /api/catalog').length;
  await A.page.reload();
  await A.page.waitForSelector('#deck .pg');
  await A.page.waitForFunction((x) => MB.caseGone(x) === 'deleted', X, { timeout: 8000 }).catch(() => {});
  await A.page.waitForTimeout(500);
  const a1 = await deckOf(A.page);
  const aItems = await checkItems(A.page);
  const aGets2 = A.api.filter((x) => x === 'GET /api/catalog').length;
  ok('Q1 stale catalog (asked < 10 min ago) + photo purged since: the failed photo triggers a refresh at once → placeholder (deleted), no broken image',
    hid.s === 200 && pur.s === 200 && pur.j.removed === 1 && a1.caseSrc >= 1 && !a1.broken.length && a1.gone.join() === 'deleted' && aGets2 === aGets + 1,
    JSON.stringify({ hid: hid.s, pur: pur.s, a1, gets: [aGets, aGets2] }));
  ok('Q2 体检 then says 有 1 张案例照片已经被删除，请换一张 (bad)', aItems.some((x) => /^bad\|有 1 张案例照片已经被删除，请换一张\|/.test(x)), aItems.filter((x) => /案例/.test(x)).join(' ; '));
  await A.page.click('[data-tab="rooms"]');
  await A.page.waitForTimeout(400);
  ok('Q2b ③ shows no broken thumbnail for it either', (await editorBroken(A.page)) === 0 && (await A.page.$$eval('#room-list .case-tag', (els) => els.map((e) => e.textContent))).indexOf('已删除') > -1);

  // Q3 · B 的登入过期了（伺服器问不到清单）：HEAD 那一张，404 → 一样当成删掉了
  const heads = [];
  B.page.on('request', (r) => { if (r.method() === 'HEAD' && r.url().indexOf(mock.blob) === 0) heads.push(r.url()); });
  await B.ctx.clearCookies();
  await B.page.reload();
  await B.page.waitForSelector('#deck .pg');
  await B.page.waitForFunction((x) => MB.caseGone(x) === 'deleted', X, { timeout: 8000 }).catch(() => {});
  await B.page.waitForTimeout(500);
  const b1 = await deckOf(B.page);
  const bSt = await B.page.evaluate(() => MB.cloud.status());
  const bItems = await checkItems(B.page);
  ok('Q3 login expired (API answers 401): the failed photo is checked with HEAD → 404 → placeholder (deleted), 体检 says it was deleted; the other case photo still prints',
    bSt.status === 'login' && heads.some((u) => u.indexOf(kx) > -1) && !b1.broken.length && b1.gone.join() === 'deleted' && b1.caseSrc >= 1 &&
    bItems.some((x) => /^bad\|有 1 张案例照片已经被删除，请换一张\|/.test(x)), JSON.stringify({ st: bSt.status, heads: heads.length, b1, items: bItems.filter((x) => /案例/.test(x)) }));
  const abErrors = A.errors.concat(B.errors).filter((e) => /pageerror/.test(e));
  await A.ctx.close(); await B.ctx.close();

  // Q4 · C：案例库刚被暂停，C 10 分钟内才问过（还不知道）→ 重新整理，照片 403 → 马上问 → 暂停中
  const pick3 = [1, 2, 3].map((pi) => 'c:' + fx.photos.find((p) => p.project === pi && !p.hidden && !p.unsure && !p.twin).h);
  const C = await open(mock.url); await nocache(C); await login(C.page);
  const CP = await C.page.evaluate((a) => {
    const p = MB.newProject({});
    p.id = 'p-paused-pick'; p.lang = 'zh'; p.direction = 'misty'; p.client.names = 'Mr Test'; p.visit.date = '2026-12-12';
    p.rooms = ['kitchen'].map(MB.newRoom);
    const bk = MB.BUILTIN.filter((b) => b.rooms.indexOf('kitchen') > -1)[0];
    p.rooms[0].images = [a.d, bk.id]; p.rooms[0].manual = true;
    p.cases = a.cases.map((ref) => ({ ref, note: null }));
    return MB.normalizeProject(p);
  }, { d: P1REFS[0], cases: pick3 });
  await importProject(C.page, CP);
  const c0 = await deckOf(C.page);
  await hook('blocked?on=1');
  await C.page.reload();
  await C.page.waitForSelector('#deck .pg');
  await C.page.waitForFunction(() => MB.cloud.status().blocked, null, { timeout: 8000 }).catch(() => {});
  await C.page.waitForTimeout(600);
  const c1 = await deckOf(C.page);
  const cSt = await C.page.evaluate(() => MB.cloud.status());
  ok('Q4 store suspended but not yet known (asked < 10 min ago): photos answer 403 → refresh at once → blocked; every placed case photo is a placeholder, nothing broken',
    c0.caseSrc >= 4 && !c0.broken.length && cSt.status === 'blocked' && cSt.blocked && c1.caseSrc === 0 && !c1.broken.length && c1.gone.length === 4 && c1.gone.every((g) => g === 'blocked'),
    JSON.stringify({ c0, cSt: cSt.status, c1 }));

  // Q5 · 参考空间 3 张都暂停中，照体检说的换成内置照片：最上面那排拿掉 2 张，挑 2 张内置 → 内置的真的放进去
  const cp = C.page;
  await cp.click('[data-tab="rooms"]');
  await cp.waitForTimeout(300);
  await cp.click('#cases-pick');
  await cp.waitForSelector('#pick-modal.on');
  await cp.waitForTimeout(300);
  const heldN = await cp.locator('#pick-held .lib-item.sel').count();
  const bRefs = await cp.$$eval('#pick-grid .lib-item:not(.case)', (els) => els.map((e) => e.getAttribute('data-ref')).filter((r) => /^b:/.test(r)));
  // 两张不同的照片（同一张的不同裁切，参考空间只放一次）
  const [pk1, pk2] = await cp.evaluate((refs) => { const k = MB.shotKey || ((r) => r), out = []; refs.forEach((r) => { if (out.length < 2 && !out.some((x) => k(x) === k(r))) out.push(r); }); return out; }, bRefs);
  await cp.click('#pick-grid [data-ref="' + pk1 + '"]');
  const fullToast = await cp.textContent('#toast');
  for (const ref of pick3.slice(0, 2)) await cp.click('#pick-held [data-ref="' + ref + '"]');
  await cp.click('#pick-grid [data-ref="' + pk1 + '"]');
  await cp.click('#pick-grid [data-ref="' + pk2 + '"]');
  await cp.click('#pick-ok');
  await cp.waitForTimeout(500);
  const casesNow = (await current(cp)).cases.map((c) => c.ref);
  ok('Q5 picker (cases, all 3 paused): paused photos sit in a strip on top, count toward the 3; the salesperson takes 2 out, picks 2 built-ins → p.cases = [paused #3, built-in, built-in]',
    heldN === 3 && /先在最上面点一下把它拿掉/.test(fullToast) && casesNow.join() === [pick3[2], pk1, pk2].join(), JSON.stringify({ heldN, fullToast, casesNow, pk1, pk2 }));

  // Q6 · 厨房 [暂停中的案例（主图）, 内置]：什么都不改按「确定」→ 顺序不变（主图还是那张）
  const k0 = (await current(cp)).rooms[0].images.slice();
  await cp.locator('#room-list [data-room-pick]').first().click();
  await cp.waitForSelector('#pick-modal.on');
  await cp.waitForTimeout(200);
  const heroCap = await cp.textContent('#pick-held .lib-item.sel .cap');
  await cp.click('#pick-ok');
  await cp.waitForTimeout(500);
  const k1 = (await current(cp)).rooms[0].images;
  ok('Q6 picker (room): pressing 加入所选 without changes keeps the paused hero first (no reordering)', k1.join() === k0.join() && k0[0] === P1REFS[0] && /主图/.test(heroCap),
    JSON.stringify({ k0, k1, heroCap }));

  // Q7 · 4 张上限算进暂停中的那张；拿掉它，新挑的内置照片补上、第一张变主图
  await cp.locator('#room-list [data-room-pick]').first().click();
  await cp.waitForSelector('#pick-modal.on');
  await cp.waitForTimeout(200);
  const more = (await cp.$$eval('#pick-grid .lib-item:not(.case)', (els) => els.map((e) => e.getAttribute('data-ref')))).filter((r) => r !== k0[1]).slice(0, 3);
  await cp.click('#pick-grid [data-ref="' + more[0] + '"]');
  await cp.click('#pick-grid [data-ref="' + more[1] + '"]');
  await cp.click('#pick-grid [data-ref="' + more[2] + '"]');
  const capToast = await cp.textContent('#toast');
  await cp.click('#pick-held [data-ref="' + P1REFS[0] + '"]');
  await cp.click('#pick-grid [data-ref="' + more[2] + '"]');
  await cp.click('#pick-ok');
  await cp.waitForTimeout(500);
  const k2 = (await current(cp)).rooms[0].images;
  ok('Q7 picker (room): the 4-photo limit counts the paused photo (5th pick refused with a reason); after taking it out the picks fill in → [built-in, 3 new]',
    /一页最多 4 张|最多 4 张/.test(capToast) && /先在最上面点一下把它拿掉/.test(capToast) && k2.join() === [k0[1]].concat(more).join() && k2.length === 4,
    JSON.stringify({ capToast, k2, more }));

  // Q8 · 暂停中又连不上 / 登入过期：「更新」先说问不到、要重新登入（不说「还在暂停中」）
  await cp.click('[data-tab="library"]');
  mock.setDown(true);
  await cp.click('#cloud-panel [data-cloud-refresh]');
  await cp.waitForTimeout(900);
  const offToast = await cp.textContent('#toast');
  const offBox = await cp.innerText('#cloud-panel');
  mock.setDown(false);
  await C.ctx.clearCookies();
  await cp.click('#cloud-panel [data-cloud-refresh]');
  await cp.waitForTimeout(900);
  const loginToast = await cp.textContent('#toast');
  const loginBox = await cp.innerText('#cloud-panel');
  const st8 = await cp.evaluate(() => MB.cloud.status());
  ok('Q8 blocked + offline → 「暂时连不上」; blocked + login expired → 「要重新登入 —— 登入后才知道案例库恢复了没有」; the login box no longer says the photos 照样显示',
    /暂时连不上/.test(offToast) && !/还在暂停中/.test(offToast) && /上次知道的是暂停中/.test(offBox) && !/先用这台电脑存着的/.test(offBox) &&
    st8.status === 'login' && st8.blocked && /要重新登入 —— 登入后才知道案例库恢复了没有/.test(loginToast) &&
    loginBox.indexOf(BLOCKED_MSG) > -1 && /占位框/.test(loginBox) && !/照样显示/.test(loginBox),
    JSON.stringify({ offToast, offBox: offBox.slice(0, 160), loginToast, loginBox: loginBox.slice(0, 220), st8: st8.status }));
  const qe = abErrors.concat(C.errors.filter((e) => /pageerror/.test(e)));
  ok('Q9 no page errors in the Q sessions', !qe.length, qe.join(' | '));
  await hook('blocked?on=0');
  await C.ctx.close();
}

const pageErrors = main.errors.filter((e) => /pageerror/.test(e));
ok('Z no uncaught page errors in the main session', !pageErrors.length, pageErrors.join(' | '));
note('console errors (expected only from the deliberate 401 / 500 / no-CORS steps)', main.errors.filter((e) => !/pageerror/.test(e)).length);

await browser.close();
await mock.close();
await mockNoCors.close();
console.log('\n' + results.filter((r) => r.startsWith('PASS')).length + ' passed, ' + results.filter((r) => r.startsWith('FAIL')).length + ' failed');
process.exit(fails ? 1 : 0);
