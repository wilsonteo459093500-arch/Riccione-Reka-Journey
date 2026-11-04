/* ============================================================
   案例库「存在这台电脑」模式（本机）浏览器测试
   node --test tools/caselib/test/local-mode.mjs
   - mock 只拿来给静态网站：本机模式一个 /api 请求都不能到伺服器（m.apiHits() = 0、Blob 0 次 put）
   - 选「存在这台电脑」→ 只填名字 → 拖文件夹 → 照片存在这个浏览器（caselib-sw.js + IndexedDB）
   - 文件夹名自动标风格、区域；子文件夹名自动标空间、柜类（客户名字不会进任何标签）
   - 审核：改标签、隐藏、只留最好的 N 张、删除（档案一起删）
   - 汇出标签档 → 新的浏览器（另一台电脑）：先汇入文件夹再汇入标签档 / 先汇入标签档再汇入文件夹，结果一样
   - 重新整理都还在；VISI 同一个网址显示「本机案例库」，帮我挑挑得到本机的案例，方案页的照片载得出来，PPTX 放得进去
   - 隐私：客户名字（陈先生…）、文件夹名、档案路径不在方案 HTML / 讲稿 / PPTX 里
   - 少了照片的电脑：方案页是占位框，体检说「这台电脑没有（要先汇入那个项目的文件夹）」；那几张照样留着（选图、换风格不会换掉，自动配图先问）
   - 登入框上点「云端」只是问问：登入成功才换；service worker 管着的这一页也照样问到伺服器（X-Caselib-Mode）
   - 登出后 VISI 说「本机案例库登出了（照片都还在）」；「不用等了」清掉等照片的标签
   - 换回云端：/api/* 又到伺服器（本机资料不删）；VISI 不会把本机的照片当成已删除；邀请页（index.html）永远不被 service worker 管
   名字都是假的（upload-fixtures.py 的「陈先生」「林太太」「Mr Tan」「测试客户」）
   ============================================================ */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { startMock } from '../mock-server.mjs';
import { fixtures, launch, selectFolder, waitHashed, startAndWait, photoBlobs, shotPath, PASSWORD, BASE } from './upload-kit.mjs';

let browser, info, m;
const A = {};              // Ana：传照片、改标签、汇出标签档
let tagsFile = '';
let exported = null;
// 方案、讲稿、PPTX 里绝不能出现的：客户名字、文件夹名、档案路径
const BAD = ['陈先生', '林太太', 'Mr Tan', '测试客户', '黄小姐', 'Mdm Lee', 'Setia Alam 原木', 'M Vertica 奶油风', 'Bangsar 轻法式', 'Cheras 现代', 'Kepong 简约',
  '厨房/', '主卧/', '电视墙/', 'IMG_0001', 'K_01', 'B_01'];
const leaks = (t) => BAD.filter((w) => String(t).indexOf(w) > -1);

before(async () => {
  info = await fixtures();
  m = await startMock({ port: 0, blobPort: 0, password: PASSWORD });
  browser = await launch();
});
after(async () => {
  if (browser) await browser.close();
  if (m) await m.close();
});

/* ---------- 工具 ---------- */
async function ctxPage(opts) {
  const ctx = await browser.newContext({ viewport: (opts && opts.viewport) || { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/401|404|Unauthorized|Failed to load resource/.test(msg.text())) page.errors.push('console: ' + msg.text()); });
  page.on('dialog', (d) => d.accept());
  return { ctx, page };
}
async function localLogin(page, name) {
  await page.goto(m.url + '/caselib');
  await page.waitForSelector('#login:not([hidden])');
  if (await page.getAttribute('#mode-local', 'aria-pressed') !== 'true') await page.click('#mode-local');
  await page.fill('#login-name', name);
  await page.click('#login-go');
  await page.waitForSelector('#tabs:not([hidden])', { timeout: 20000 });
  await page.waitForFunction(() => MB.cl.cat && MB.cl.cat.quota && MB.cl.cat.quota.plan === 'local', null, { timeout: 20000 });
}
async function upload(page, dir) {
  await page.click('#tabs [data-tab="upload"]');
  await selectFolder(page, dir);
  await waitHashed(page);
  await startAndWait(page);
}
// 这个浏览器的清单（经 service worker，full：有项目名，只给测试看）
function localIndex(page) {
  return page.evaluate(() => fetch('/api/catalog?view=full', { cache: 'no-store' }).then((r) => r.json()));
}
// IndexedDB 'caselib-local' 直接读（不经 service worker）
function idb(page, store, what) {
  return page.evaluate(([store, what]) => new Promise((ok, fail) => {
    const r = indexedDB.open('caselib-local');
    r.onsuccess = () => {
      const d = r.result;
      const os = d.transaction(store).objectStore(store);
      const q = what === 'keys' ? os.getAllKeys() : os.get(what);
      q.onsuccess = () => { ok(q.result && what === 'index' ? q.result.index : q.result); d.close(); };
      q.onerror = () => fail(q.error);
    };
    r.onerror = () => fail(r.error);
  }), [store, what]);
}
const byName = (idx, name) => { const pid = Object.keys(idx.projects).find((p) => idx.projects[p].name === name); return pid ? Object.assign({ pid }, idx.projects[pid]) : null; };
const photosOf = (idx, pid) => Object.keys(idx.photos).filter((h) => idx.photos[h].p === pid).map((h) => Object.assign({ hash: h }, idx.photos[h]));
const byF = (idx, pid, f) => photosOf(idx, pid).find((x) => x.f === f);
const tagsOf = (x) => ({ room: x.room, cabinets: x.cabinets, style: x.style, hero: x.hero, desc: x.desc, status: x.status, hidden: !!x.hidden });
async function waitFor(fn, ms, what) {
  const end = Date.now() + (ms || 15000);
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out: ' + (what || fn));
    await new Promise((r) => setTimeout(r, 150));
  }
}
const ROOT = '案例图';
const SETIA = 'Setia Alam 原木 陈先生', VERT = 'M Vertica 奶油风 林太太', BANG = 'Bangsar 轻法式 Mr Tan';

/* ============================================================ */
test('local mode: 「存在这台电脑」 asks only for a name; dropped folders are stored in this browser (0 Blob put, /api never reaches the server) and tagged from folder names', async () => {
  const { ctx, page } = await ctxPage();
  A.ctx = ctx; A.page = page;
  await page.goto(m.url + '/caselib');
  await page.waitForSelector('#login:not([hidden])');
  // 还没选过：先选好「存在这台电脑」，不用密码
  assert.equal(await page.getAttribute('#mode-local', 'aria-pressed'), 'true');
  assert.match(await page.textContent('#mode-local'), /存在这台电脑（免费，现在就能用）/);
  assert.match(await page.textContent('#mode-cloud'), /云端（Vercel，现在暂停中）/);
  assert.equal(await page.isVisible('#login-pass'), false, 'no team password in local mode');
  assert.equal((await page.textContent('#local-note')).trim(), '本机案例库：照片存在这台电脑的浏览器里，同事看不到；要给同事用，就把同一个文件夹给他汇入，再汇入你的标签档。');
  await page.waitForFunction(() => /已用约 .+ \/ 可用约 /.test(document.querySelector('#local-space').textContent));
  await page.screenshot({ path: shotPath('local-login.png') });
  assert.equal(m.apiHits().hits, 0, 'the login card asks nothing');
  await page.fill('#login-name', 'Ana');
  await page.click('#login-go');
  await page.waitForSelector('#tabs:not([hidden])', { timeout: 20000 });
  await page.waitForFunction(() => MB.cl.cat && MB.cl.cat.quota);
  const st = await page.evaluate(() => ({
    mode: localStorage.getItem('caselib-mode'), flag: localStorage.getItem('sail-visi-cases'), user: localStorage.getItem('sail-visi-cases-user'),
    ctl: !!navigator.serviceWorker.controller, plan: MB.cl.cat.quota.plan, who: document.querySelector('#who-mode').textContent,
    sw: document.querySelector('#mode-switch').textContent, hint: document.querySelector('[data-pane="upload"] .local-only').offsetParent !== null
  }));
  assert.deepEqual(st, { mode: 'local', flag: '1', user: 'Ana', ctl: true, plan: 'local', who: '存在这台电脑', sw: '改用云端', hint: true });
  // 浏览器答应一直保留了没有：没答应就一直显示提醒（叫他备份标签档）
  await page.waitForFunction(() => MB.cl.persisted !== null);
  const keep = await page.evaluate(() => ({ ok: MB.cl.persisted, hidden: document.querySelector('#local-keep').hidden, t: document.querySelector('#local-keep').textContent }));
  assert.equal(keep.hidden, keep.ok === true, JSON.stringify(keep));
  if (!keep.ok) assert.match(keep.t, /浏览器还没答应一直保留.*汇出标签档/);
  const q = await page.evaluate(() => MB.cl.cat.quota);
  assert.equal(q.uploadCap, null);
  assert.equal(q.writeCap, null);
  assert.equal(q.writesLeft, null);
  assert.ok(q.bytesCap > 0 && q.bytesLeft > 0, JSON.stringify(q));
  // 跟伺服器一样的规则：GET session → 名字；写入没有 X-VISI → 403；名字太长 → 400
  const rules = await page.evaluate(async () => ({
    me: await fetch('/api/session').then((r) => r.json()),
    noHeader: await fetch('/api/catalog', { method: 'POST', body: '{"op":"patch","source":"human"}', headers: { 'Content-Type': 'application/json' } }).then((r) => r.json().then((j) => r.status + ' ' + j.error + ' ' + r.headers.get('content-type'))),
    noConfirm: await fetch('/api/catalog', { method: 'POST', body: '{"op":"purge","photos":["0123456789abcdef"]}', headers: { 'X-VISI': '1', 'Content-Type': 'application/json' } }).then((r) => r.json().then((j) => r.status + ' ' + j.error)),
    etag: await fetch('/api/catalog?view=visi').then((r) => r.headers.get('etag')).then((e) => fetch('/api/catalog?view=visi', { headers: { 'If-None-Match': e } }).then((r) => e + ' ' + r.status)),
    // 伺服器那种 ETag（rev 一样）：不算（VISI 存着云端的清单时不会拿错）
    cloudTag: await fetch('/api/catalog?view=visi', { headers: { 'If-None-Match': '"rev-0"' } }).then((r) => r.status),
    longName: await fetch('/api/session', { method: 'POST', body: JSON.stringify({ name: 'x'.repeat(31) }), headers: { 'X-VISI': '1', 'Content-Type': 'application/json' } }).then((r) => r.status),
    notJpeg: await fetch('/api/photo?h=0123456789abcdef', { method: 'POST', body: new Blob(['hello'], { type: 'image/jpeg' }), headers: { 'X-VISI': '1', 'Content-Type': 'image/jpeg' } }).then((r) => r.json().then((j) => r.status + ' ' + j.error)),
    badOp: await fetch('/api/catalog', { method: 'POST', body: '{"op":"nope"}', headers: { 'X-VISI': '1', 'Content-Type': 'application/json' } }).then((r) => r.json().then((j) => r.status + ' ' + j.error)),
    view: await fetch('/api/catalog?view=x').then((r) => r.status)
  }));
  assert.deepEqual(rules, { me: { name: 'Ana' }, noHeader: '403 cross_site application/json; charset=utf-8', noConfirm: '400 confirm', etag: '"local-rev-0" 304', cloudTag: 200,
    longName: 400, notJpeg: '415 not_jpeg', badOp: '400 op', view: 400 });

  // 拖「案例图」总文件夹（3 个项目）：没有额度上限，精选预设关着（还是可以打开）
  await page.click('#tabs [data-tab="upload"]');
  await selectFolder(page, info.root);
  await waitHashed(page);
  assert.match(await page.textContent('#plan .budget'), /存在这台电脑 · 已用约 [\d.,]+ (MB|GB) \/ 可用约 [\d.,]+ (MB|GB)/);
  assert.equal(await page.isVisible('#cur-on'), true, 'curated mode still available');
  assert.equal(await page.isChecked('#cur-on'), false, 'curated mode off by default');
  await startAndWait(page);
  await upload(page, info.curate);

  const idx = await localIndex(page);
  assert.equal(Object.keys(idx.photos).length, 11 + 14, 'root (11 unique) + curate (14)');
  const s = byName(idx, SETIA), v = byName(idx, VERT), b = byName(idx, BANG);
  assert.deepEqual([s.style, s.area], ['wood', 'Setia Alam']);
  assert.deepEqual([v.style, v.area], ['cream', ''], '「M Vertica」 is not obviously a place (could be a name): area stays empty');
  assert.deepEqual([b.style, b.area], ['french', 'Bangsar']);
  // 同一个 pid（跟伺服器一样算）：之后搬回云端项目 id 不变
  const pidOk = await page.evaluate(([n, pid]) => MB.cl.pidOf(n).then((x) => x === pid && MB.clCore.pidOf(n) === pid), [SETIA, s.pid]);
  assert.equal(pidOk, true);
  for (const f of ['厨房/K_01.jpg', '厨房/K_02.png']) assert.deepEqual(tagsOf(byF(idx, s.pid, f)), { room: 'kitchen', cabinets: ['kitchen'], style: '', hero: false, desc: { zh: '', en: '' }, status: 'auto', hidden: false }, f);
  assert.equal(byF(idx, s.pid, 'IMG_0001.jpg').status, 'new', 'no sub-folder → nothing guessed');
  assert.equal(byF(idx, s.pid, 'IMG_0002.jpg').shot, byF(idx, s.pid, 'IMG_0001.jpg').hash, 'near-duplicate grouped into one shot');
  const ch = byName(idx, info.cheras), kp = byName(idx, info.kepong);
  assert.deepEqual([ch.style, ch.area], ['', ''], '「现代」 alone is not a style word → nothing guessed');
  assert.deepEqual([kp.style, kp.area], ['modern', 'Kepong']);
  const chRooms = photosOf(idx, ch.pid).map((x) => x.f.split('/')[0] + '=' + x.room + ':' + x.cabinets.join('+')).sort();
  assert.deepEqual(chRooms, ['主卧=master:', '主卧=master:', '主卧=master:', '厨房=kitchen:kitchen', '厨房=kitchen:kitchen', '厨房=kitchen:kitchen', '厨房=kitchen:kitchen', '电视墙=living:tvwall', '电视墙=living:tvwall']);
  // 客户名字不在任何标签里
  const tagText = JSON.stringify(Object.values(idx.projects).map((p) => [p.area, p.style, p.ptype, p.traits]).concat(Object.values(idx.photos).map(tagsOf)));
  assert.deepEqual(['陈先生', '林太太', 'Mr Tan', '测试客户', '测试'].filter((w) => tagText.includes(w)), []);
  // 文件夹名自动标的记成「自动」（之后同事的标签档可以盖掉）
  assert.equal(s.by, 'Claude');
  assert.equal(byF(idx, s.pid, '厨房/K_01.jpg').by, 'Claude');

  // 一个都没到伺服器：Blob 0 次写入、/api 0 次
  assert.deepEqual(m.apiHits(), { hits: 0, paths: [] });
  assert.equal(m.adapter.stats().puts, 0);
  assert.equal(m.adapter.stats().gets, 0);
  assert.equal(photoBlobs(m).length, 0);

  // 照片、缩图包从 /local-cases/ 来（PPTX 用 mode:'cors' 拿：要有 ACAO）
  const k = byF(idx, s.pid, '厨房/K_01.jpg').k, pack = s.packs[0];
  assert.equal(idx.base, m.url + '/local-cases/');
  const files = await page.evaluate(async ([k, pack]) => {
    const r = await fetch('/local-cases/' + k, { mode: 'cors' });
    const b = await r.arrayBuffer();
    const head = await fetch('/local-cases/' + k, { method: 'HEAD' });
    const p = await fetch('/local-cases/' + pack).then((x) => x.json());
    const miss = await fetch('/local-cases/c/0000000000000000-nope.jpg');
    const bad = await fetch('/local-cases/../caselib.html');
    const etag = r.headers.get('etag');
    const again = await fetch('/local-cases/' + k, { headers: { 'If-None-Match': etag } });
    return { st: r.status, type: r.headers.get('content-type'), len: +r.headers.get('content-length'), size: b.byteLength, jpeg: new Uint8Array(b)[0] === 0xff,
      etag: !!etag, cc: r.headers.get('cache-control'), acao: r.headers.get('access-control-allow-origin'), head: head.status + ':' + head.headers.get('content-length'),
      packKeys: Object.keys(p).length, packOk: Object.values(p).every((x) => /^data:image\/jpeg;base64,/.test(x)), miss: miss.status, bad: bad.status, again: again.status };
  }, [k, pack]);
  assert.deepEqual(files, { st: 200, type: 'image/jpeg', len: files.size, size: files.size, jpeg: true, etag: true, cc: 'no-cache', acao: '*', head: '200:' + files.size,
    packKeys: files.packKeys, packOk: true, miss: 404, bad: files.bad, again: 304 });
  assert.ok(files.packKeys >= 1 && files.size > 1000);
  // 给 VISI 的版本：跟伺服器一样拿掉项目名、档案路径、纪录
  const vis = await page.evaluate(() => fetch('/api/catalog?view=visi').then((r) => r.text()));
  assert.deepEqual(leaks(vis), []);
  assert.ok(!/"(name|f|log|purged)":/.test(vis), 'visi view keeps no name / f / log / purged');
  assert.deepEqual(page.errors, []);
});

/* ============================================================ */
test('local mode review: edit tags, hide, 只留最好的 N 张 and delete (files deleted too) all work in this browser', async () => {
  const page = A.page;
  await page.evaluate(() => { MB.clReview.hideMs = 200; MB.clReview.idleMs = 400; });
  await page.click('#tabs [data-tab="review"]');
  await page.waitForSelector('#rv-grid .rv-card');
  await page.waitForFunction(() => /^存在这台电脑 · 已用约 /.test(document.querySelector('#rv-budget').textContent));
  let idx = await localIndex(page);
  const s = byName(idx, SETIA);
  // 改一张：空间、柜类 → 变「已确认」
  const rot = byF(idx, s.pid, 'IMG_0003_rot.jpg');
  await page.selectOption('#rv-filters select[data-f="pid"]', s.pid);
  await page.click('#rv-grid .rv-card[data-h="' + rot.hash + '"]');
  await page.click('#drawer .chips[data-kind="room"] .chip[data-v="living"]');
  await page.click('#drawer .chips[data-kind="cabinets"] .chip[data-v="tvcab"]');
  await page.click('#drawer .chips[data-kind="style"] .chip[data-v="wood"]');
  // 项目资料：家庭特点（自动标的风格、区域还在）
  await page.click('#drawer [data-act="proj-edit"]');
  await page.click('#drawer .chips[data-kind="traits"] .chip[data-v="kids"]');
  await page.click('#rv-savebtn');
  idx = await waitFor(async () => { const x = await localIndex(page); return x.photos[rot.hash].status === 'confirmed' && x.projects[s.pid].traits.length ? x : null; }, 15000, 'saved');
  assert.deepEqual(tagsOf(idx.photos[rot.hash]), { room: 'living', cabinets: ['tvcab'], style: 'wood', hero: false, desc: { zh: '', en: '' }, status: 'confirmed', hidden: false });
  assert.equal(idx.photos[rot.hash].by, 'Ana');
  assert.deepEqual(idx.projects[s.pid].traits, ['kids']);
  assert.equal(idx.projects[s.pid].style, 'wood');
  await page.click('#drawer .dr-x');
  // 「按文件夹名字自动标」：人改过的不动（这张已确认）
  await page.click('#rv-auto');
  await page.waitForFunction(() => /自动标|没有可以自动标/.test(document.querySelector('#rv-tags-msg').textContent));
  idx = await localIndex(page);
  assert.equal(idx.photos[rot.hash].room, 'living', 'auto tags never override a confirmed photo');

  // 隐藏一张（连拍的那张）
  const dup = byF(idx, s.pid, 'IMG_0002.jpg');
  await page.click('#rv-grid .rv-card[data-h="' + dup.hash + '"]');
  await page.click('#drawer [data-act="hide-photo"]');
  await waitFor(async () => !!(await localIndex(page)).photos[dup.hash].hidden, 10000, 'hidden');
  await page.click('#drawer .dr-x');

  // 只留最好的 3 张（Cheras：9 张、两组连拍）
  const ch = byName(idx, info.cheras);
  await page.selectOption('#rv-filters select[data-f="pid"]', ch.pid);
  await page.waitForSelector('#rv-proj [data-act="keep-proj"]');
  const plan = await page.evaluate((pid) => MB.clReview.keepPlan(pid, 3), ch.pid);
  assert.equal(plan.hide.length, 6);
  await page.click('#rv-proj [data-act="keep-proj"]');
  await page.fill('#rv-ask-n', '3');
  await page.click('#rv-ask [data-ask="ok"]');
  idx = await waitFor(async () => { const x = await localIndex(page); return photosOf(x, ch.pid).filter((p) => p.hidden).length === 6 ? x : null; }, 15000, 'keep best 3');
  assert.deepEqual(photosOf(idx, ch.pid).filter((p) => p.hidden).map((p) => p.hash).sort(), plan.hide.slice().sort());

  // 删除隐藏的照片：要打「删除」；清单、档案一起删
  const gone = Object.keys(idx.photos).filter((h) => idx.photos[h].hidden);
  const goneK = gone.map((h) => idx.photos[h].k);
  assert.equal(gone.length, 7);
  if (await page.getAttribute('#rv-tidy-head', 'aria-expanded') !== 'true') await page.click('#rv-tidy-head');
  await page.fill('#rv-purge-word', '删除');
  await page.click('#rv-purge-go');
  await page.waitForFunction(() => /已删除 7 张/.test(document.querySelector('#rv-purge-msg').textContent), null, { timeout: 15000 });
  idx = await localIndex(page);
  assert.equal(gone.filter((h) => idx.photos[h]).length, 0);
  assert.deepEqual(idx.purged.slice().sort(), gone.slice().sort());
  const keys = await idb(page, 'files', 'keys');
  assert.deepEqual(goneK.filter((k) => keys.indexOf(k) > -1), [], 'the photo files are deleted too');
  assert.equal(await page.evaluate((k) => fetch('/local-cases/' + k).then((r) => r.status), goneK[0]), 404);
  // 照片档 = 清单里的照片（没有多出来没人用的档）
  const photoKeys = keys.filter((k) => /^c\//.test(k)).sort();
  assert.deepEqual(photoKeys, Object.values(idx.photos).map((x) => x.k).sort());
  assert.equal(idx.log.filter((e) => e.op === 'purge').length, 1);
  // 再拖同一个文件夹：删过的不会又传上来
  await page.click('#tabs [data-tab="upload"]');
  await selectFolder(page, info.curate);
  await waitHashed(page);
  assert.match(await page.textContent('#plan'), /删过 6 张（不重传）/);
  await page.click('#replan');
  assert.deepEqual(m.apiHits().hits, 0);
  assert.deepEqual(page.errors, []);
});

/* ============================================================ */
test('标签档: export (tags only) → another browser imports the folder then the tags, a third imports the tags first → same tags; reload keeps everything', async () => {
  const page = A.page;
  // A 改掉自动猜的：Bangsar 的风格（文件夹名猜轻法式 → 改奶油风）、一张厨房照片自动标的橱柜（清掉 → 已确认）
  let a0 = await localIndex(page);
  const bg = byName(a0, BANG), k2 = byF(a0, byName(a0, SETIA).pid, '厨房/K_02.png');
  assert.deepEqual([bg.style, k2.cabinets, k2.status], ['french', ['kitchen'], 'auto']);
  const fixed = await page.evaluate((b) => fetch('/api/catalog', { method: 'POST', headers: { 'X-VISI': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()),
    { op: 'patch', source: 'human', projects: { [bg.pid]: { style: 'cream' } }, photos: { [k2.hash]: { cabinets: [] } } });
  assert.equal(fixed.changed, 2);
  await page.evaluate(() => MB.cl.loadCatalog(true));
  await page.click('#tabs [data-tab="review"]');
  await page.waitForSelector('#rv-export');
  assert.match(await page.textContent('#rv-export'), /汇出标签档（备份）/);
  assert.match(await page.getAttribute('#rv-export', 'title'), /客户名字.*不要传给客户/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#rv-export')]);
  tagsFile = join(BASE, 'local-tags-' + process.pid + '.json');
  await dl.saveAs(tagsFile);
  assert.match(dl.suggestedFilename(), /^visi-标签档-\d{8}-\d+张\.json$/);
  const text = readFileSync(tagsFile, 'utf8');
  exported = JSON.parse(text);
  const aIdx = await localIndex(page);
  assert.equal(exported.kind, 'visi-caselib-tags');
  assert.equal(exported.v, 1);
  assert.equal(Object.keys(exported.photos).length, Object.keys(aIdx.photos).length);
  assert.ok(!/"(f|k|url)":|data:image|厨房\/|IMG_0001|local-cases/.test(text), 'no image data, no file paths');
  await page.waitForFunction(() => /已汇出/.test(document.querySelector('#rv-tags-msg').textContent));
  assert.match(await page.textContent('#rv-tags-msg'), /档里有项目的文件夹名（客户名字）：只给同事/);

  // B：另一台电脑 —— 先汇入同一个文件夹（只有「案例图」），再汇入标签档
  const B = await ctxPage();
  await localLogin(B.page, 'Ben');
  await upload(B.page, info.root);
  await B.page.click('#tabs [data-tab="review"]');
  await B.page.waitForSelector('#rv-import', { state: 'attached' });
  await B.page.setInputFiles('#rv-import', tagsFile);
  await B.page.waitForFunction(() => /^套用了 \d+ 张、\d+ 个项目/.test(document.querySelector('#rv-tags-msg').textContent), null, { timeout: 15000 });
  const msg = await B.page.textContent('#rv-tags-msg');
  // A 有、B 还没有的：Cheras 留下的 3 张 + Kepong 5 张
  assert.match(msg, /，8 张这台电脑还没有照片，等汇入那个文件夹后会自动套用。/);
  let bIdx = await localIndex(B.page);
  const sA = byName(aIdx, SETIA), sB = byName(bIdx, SETIA);
  assert.equal(sB.pid, sA.pid, 'same folder name → same project id on every computer');
  const rot = byF(aIdx, sA.pid, 'IMG_0003_rot.jpg');
  assert.deepEqual(tagsOf(bIdx.photos[rot.hash]), tagsOf(aIdx.photos[rot.hash]), 'a confirmed photo gets the same tags');
  assert.deepEqual(sB.traits, ['kids']);
  assert.equal(bIdx.photos[rot.hash].by, 'Ben');
  // 共同的照片：标签都一样（A 删掉的那张不在标签档：B 那边留着自动标的）
  for (const h of Object.keys(aIdx.photos)) if (bIdx.photos[h]) assert.deepEqual(tagsOf(bIdx.photos[h]), tagsOf(aIdx.photos[h]), h);
  // 先汇入文件夹再汇入标签档：A 改过的自动风格、清掉的柜子也照 A 的（不是 B 自动猜的）
  for (const pid of Object.keys(bIdx.projects)) {
    const a = aIdx.projects[pid], b = bIdx.projects[pid];
    assert.deepEqual([b.area, b.style, b.ptype, b.traits], [a.area, a.style, a.ptype, a.traits], 'folder first: ' + a.name);
  }
  assert.equal(bIdx.projects[bg.pid].style, 'cream');
  assert.deepEqual([bIdx.photos[k2.hash].cabinets, bIdx.photos[k2.hash].status], [[], 'confirmed']);
  // 等照片的只数照片（Cheras 3 + Kepong 5；项目不算）
  assert.match(await B.page.textContent('#rv-tags-msg'), /还有 8 张照片的标签在等/);
  // 再汇入一次同一个档：都一样了 —— 说「已经一样，不用改」，不是「套用了 0 张」
  await B.page.setInputFiles('#rv-import', tagsFile);
  await B.page.waitForFunction(() => /张已经一样，不用改/.test(document.querySelector('#rv-tags-msg').textContent), null, { timeout: 15000 });
  assert.doesNotMatch(await B.page.textContent('#rv-tags-msg'), /套用了 0 张/);
  // 之后才汇入那个文件夹：等着的标签自动套用
  await upload(B.page, info.curate);
  bIdx = await localIndex(B.page);
  for (const h of Object.keys(aIdx.photos)) assert.deepEqual(tagsOf(bIdx.photos[h]), tagsOf(aIdx.photos[h]), 'after the folder: ' + h);
  for (const pid of Object.keys(aIdx.projects)) assert.deepEqual([bIdx.projects[pid].area, bIdx.projects[pid].style], [aIdx.projects[pid].area, aIdx.projects[pid].style], pid);
  assert.equal(bIdx.pendingTags, 0);
  assert.deepEqual(B.page.errors, []);
  await B.ctx.close();

  // C：先汇入标签档（这台电脑一张都还没有），再汇入两个文件夹
  const Cc = await ctxPage();
  await localLogin(Cc.page, 'Mia');
  await Cc.page.click('#tabs [data-tab="review"]');
  await Cc.page.waitForSelector('#rv-import', { state: 'attached' });
  await Cc.page.setInputFiles('#rv-import', tagsFile);
  await Cc.page.waitForFunction(() => /^套用了 0 张、0 个项目，\d+ 张这台电脑还没有照片/.test(document.querySelector('#rv-tags-msg').textContent), null, { timeout: 15000 });
  assert.match(await Cc.page.textContent('#rv-tags-msg'), new RegExp('，' + Object.keys(exported.photos).length + ' 张这台电脑还没有照片'));
  await upload(Cc.page, info.root);
  await upload(Cc.page, info.curate);
  let cIdx = await localIndex(Cc.page);
  for (const h of Object.keys(aIdx.photos)) assert.deepEqual(tagsOf(cIdx.photos[h]), tagsOf(aIdx.photos[h]), 'tags first, folder later: ' + h);
  for (const pid of Object.keys(aIdx.projects)) {
    const a = aIdx.projects[pid], c = cIdx.projects[pid];
    assert.deepEqual([c.area, c.style, c.ptype, c.traits], [a.area, a.style, a.ptype, a.traits], pid);
  }
  assert.equal(cIdx.pendingTags, 0);
  // 重新整理：都还在（service worker 照样接手）
  const before = Object.keys(cIdx.photos).length;
  await Cc.page.reload();
  await Cc.page.waitForSelector('#tabs:not([hidden])', { timeout: 20000 });
  await Cc.page.waitForFunction(() => MB.cl.cat && MB.cl.cat.quota, null, { timeout: 20000 });
  cIdx = await localIndex(Cc.page);
  assert.equal(Object.keys(cIdx.photos).length, before);
  assert.equal(await Cc.page.textContent('#who-name'), 'Mia');
  assert.equal(await Cc.page.evaluate(() => !!navigator.serviceWorker.controller), true);
  assert.deepEqual(Cc.page.errors, []);
  await Cc.ctx.close();
  assert.deepEqual(m.apiHits().hits, 0);
});

/* ============================================================ */
test('VISI on the same address: 「本机案例库」, 帮我挑 picks local cases with reasons, the deck shows local photos, PPTX embeds them, no client name anywhere', async () => {
  const { page, ctx } = A;
  // VISI 的 /visi 范围先拿掉：第一次打开（service worker 还没管这一页）也要照样拿得到照片
  await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.filter((r) => /\/visi$/.test(new URL(r.scope).pathname)).map((r) => r.unregister()))));
  const vp = await ctx.newPage();
  vp.errors = [];
  vp.on('pageerror', (e) => vp.errors.push(e.message));
  vp.on('dialog', (d) => d.accept());
  await vp.goto(m.url + '/visi');
  await vp.waitForSelector('#deck .pg');
  await vp.waitForFunction(() => MB.cloud.status().status === 'ok' && MB.cloud.status().local && MB.cases().length > 0, null, { timeout: 20000 });
  assert.equal(await vp.evaluate(() => !!navigator.serviceWorker.controller), true);
  await vp.click('[data-tab="library"]');
  await vp.waitForFunction(() => /本机案例库 · \d+ 张（存在这台电脑）/.test(document.querySelector('#cloud-panel').textContent));
  const box = await vp.textContent('#cloud-panel');
  assert.ok(!/暂停中|团队密码|Vercel/.test(box), box);
  // 再多两个同系列的项目（日式、北欧：跟原木同一个系列），帮我挑才有得挑
  await upload(page, dirname(info.soloA));
  await upload(page, dirname(info.soloB));
  let aIdx = await localIndex(page);
  // 这几个项目的照片放在最上层（没有子文件夹）：在审核标好空间（经 service worker 的一般 patch）
  const v = byName(aIdx, VERT);
  const more = {};
  ['Ipoh 日式 黄小姐', 'Puchong 北欧 Mdm Lee'].forEach((n) => {
    photosOf(aIdx, byName(aIdx, n).pid).sort((x, y) => (x.f < y.f ? -1 : 1)).forEach((x, i) => {
      more[x.hash] = [{ room: 'kitchen', cabinets: ['kitchen'] }, { room: 'living', cabinets: ['tvwall'] }, { room: 'master', cabinets: ['wardrobe'] }, { room: 'dining', cabinets: ['sideboard'] }][i % 4];
    });
  });
  const vf = (f) => byF(aIdx, v.pid, f).hash;
  const vh = { master: vf('V_02.jpg'), living: vf('big_6000.jpg') };
  const sh = { hash: Object.keys(aIdx.photos).find((h) => aIdx.photos[h].f === 'shared.jpg') };   // 两个项目都有：只存一次
  const patched = await page.evaluate((b) => fetch('/api/catalog', { method: 'POST', headers: { 'X-VISI': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()),
    { op: 'patch', source: 'human', photos: Object.assign({ [vh.master]: { room: 'master', cabinets: ['wardrobe'] }, [vh.living]: { room: 'living', cabinets: ['tvwall'] }, [sh.hash]: { room: 'dining' } }, more) });
  assert.equal(patched.changed, 3 + 8);
  await vp.click('[data-tab="library"]');
  await vp.click('[data-cloud-refresh]');
  await vp.waitForFunction((h) => (MB.caseOf('c:' + h) || {}).rooms && MB.caseOf('c:' + h).rooms[0] === 'master', vh.master, { timeout: 15000 });
  aIdx = await localIndex(page);
  const cases = await vp.evaluate(() => MB.cases().map((c) => ({ id: c.id, src: c.src, usable: MB.caseUsable(c) })));
  assert.equal(cases.length, Object.keys(aIdx.photos).length);
  assert.ok(cases.every((c) => c.src.indexOf(m.url + '/local-cases/c/') === 0), cases[0].src);
  // 帮我挑：一份原木风、有厨房、主卧、客厅的方案（厨房、主卧、参考空间先放一张本机的案例）
  const s = byName(aIdx, SETIA);
  const kitchen = photosOf(aIdx, s.pid).filter((x) => x.room === 'kitchen').map((x) => 'c:' + x.hash);
  const living = 'c:' + vh.living;
  const proj = await vp.evaluate(([k0, master, living]) => {
    const p = MB.newProject({});
    p.id = 'p-local'; p.lang = 'bi'; p.direction = 'misty'; p.caseStyle = 'wood';
    p.client.names = 'Mr & Mrs Ong'; p.property = { name: 'Eco Grandeur', area: 'Setia Alam', type: 'Terrace', size: '' };
    p.needs = [{ key: 'cook_daily' }];
    p.rooms = ['kitchen', 'master', 'living', 'dining'].map(MB.newRoom);
    p.rooms[0].images = [k0]; p.rooms[0].manual = true;
    p.rooms[1].images = [master]; p.rooms[1].manual = true;
    p.cases = [{ ref: living, note: null }];
    p.visit.date = '2026-12-12';
    return MB.normalizeProject(p);
  }, [kitchen[0], 'c:' + vh.master, living]);
  await vp.click('[data-tab="library"]');
  await vp.setInputFiles('#proj-import', { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ type: 'visi-project', v: 1, project: proj })) });
  await vp.waitForTimeout(900);
  const picks = await vp.evaluate(() => MB.store.getProject(localStorage.getItem('sail-mb-active')).then((p) => MB.matchCases(MB.normalizeProject(p), MB.makeResolver.last).map((x) => ({ ref: x.ref, zh: x.why.zh, en: x.why.en }))));
  assert.ok(picks.length >= 3, JSON.stringify(picks));
  assert.ok(picks.every((x) => /^c:[0-9a-f]{16}$/.test(x.ref) && x.zh && x.en), JSON.stringify(picks));
  // 「为什么」用的是自动标的标签（风格来自文件夹名、空间来自子文件夹 / 审核）
  assert.ok(picks.some((x) => /同样是原木风格|厨房有橱柜|同样是/.test(x.zh)), picks.map((x) => x.zh).join(' | '));
  assert.deepEqual(leaks(JSON.stringify(picks)), []);
  // 面板也一样
  await vp.click('[data-tab="rooms"]');
  await vp.click('#cases-match');
  await vp.waitForSelector('#match-modal.on');
  await vp.waitForFunction(() => document.querySelectorAll('#match-list .match-row').length >= 3);
  const rowWhy = await vp.$$eval('#match-list .match-why', (els) => els.map((e) => e.textContent));
  assert.ok(rowWhy.every((t) => t.trim().length > 0));
  await vp.click('#match-modal [data-close]');
  // 方案页：本机的案例照片载得出来
  await vp.waitForFunction(() => {
    const ims = [...document.querySelectorAll('#deck img')].filter((i) => (i.getAttribute('src') || '').indexOf('/local-cases/c/') > -1);
    return ims.length >= 3 && ims.every((i) => i.complete && i.naturalWidth > 0);
  }, null, { timeout: 20000 });
  const deck = await vp.evaluate(() => document.querySelector('#deck').innerHTML);
  assert.deepEqual(leaks(deck), []);
  assert.ok(!/ph-gone/.test(deck), 'no placeholder: every case photo is on this computer');
  await vp.screenshot({ path: shotPath('local-visi-deck.png') });
  // 讲稿、文案、案例卡
  const texts = await vp.evaluate(() => MB.store.getProject(localStorage.getItem('sail-mb-active')).then((p) => {
    p = MB.normalizeProject(p);
    const out = [];
    MB.pageList(p, MB.makeResolver.last).forEach((pg) => ['zh', 'en', 'bi'].forEach((L) => out.push(MB.pageNotes(p, pg, L))));
    out.push(['zh', 'en'].map((L) => JSON.stringify(MB.writeCopy(p, L))).join('\n'));
    out.push(['zh', 'en', 'bi'].map((L) => JSON.stringify(MB.caseCards(p, MB.makeResolver.last, L))).join('\n'));
    return out.join('\n');
  }));
  assert.ok(texts.length > 500);
  assert.deepEqual(leaks(texts), []);
  // PPTX：本机的案例照片放得进去（同一个网址，不用 CORS 设定）
  const [dl] = await Promise.all([vp.waitForEvent('download', { timeout: 90000 }), vp.click('#btn-pptx')]);
  const file = join(BASE, 'local-mode-' + process.pid + '.pptx');
  await dl.saveAs(file);
  const py = 'import zipfile,hashlib,json,sys\nz=zipfile.ZipFile(sys.argv[1])\nx=[];m=[]\nfor n in z.namelist():\n  b=z.read(n)\n  if n.endswith(".xml") or n.endswith(".rels"): x.append(b.decode("utf-8","replace"))\n  if n.startswith("ppt/media/"): m.append(hashlib.sha256(b).hexdigest())\nprint(json.dumps({"xml":"\\n".join(x),"media":m}))';
  const z = JSON.parse(execFileSync('python3', ['-I', '-c', py, file], { maxBuffer: 256 * 1024 * 1024 }).toString());
  const want = [kitchen[0], 'c:' + vh.master].map((ref) => aIdx.photos[ref.slice(2)].k);
  const hashes = await vp.evaluate((ks) => Promise.all(ks.map((k) => fetch('/local-cases/' + k).then((r) => r.arrayBuffer()).then((b) => crypto.subtle.digest('SHA-256', b))
    .then((d) => [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')))), want);
  assert.ok(hashes.every((h) => z.media.indexOf(h) > -1), 'PPTX embeds the local case photos (' + z.media.length + ' media)');
  assert.ok(!/放不进去/.test(await vp.textContent('#toast')));
  assert.deepEqual(leaks(z.xml), []);
  assert.deepEqual(vp.errors, []);
  assert.deepEqual(m.apiHits().hits, 0, 'VISI in local mode never asks the server');
  A.project = proj;
  await vp.close();
});

/* ============================================================ */
test('a computer that does not have some case photos: placeholders (no broken image), 体检 says 这台电脑没有（要先汇入那个项目的文件夹）, and they are kept', async () => {
  const D = await ctxPage();
  const dialogs = [];
  D.page.on('dialog', (d) => dialogs.push(d.message()));
  await localLogin(D.page, 'Dee');
  await upload(D.page, info.soloA);          // 只有别的项目
  const vp = D.page;
  await vp.goto(m.url + '/visi');
  await vp.waitForSelector('#deck .pg');
  await vp.waitForFunction(() => MB.cloud.status().status === 'ok' && MB.cloud.status().local && MB.cases().length === 4, null, { timeout: 20000 });
  await vp.click('[data-tab="library"]');
  // 第三个空间是自动配的、放着一张这台电脑没有的案例照片（Bangsar 的，别页没用到）：换风格时不能被换掉
  const proj = JSON.parse(JSON.stringify(A.project));
  const aIdx = await localIndex(A.page);
  const absent = 'c:' + photosOf(aIdx, byName(aIdx, BANG).pid)[0].hash;
  proj.rooms[2].images = [absent]; proj.rooms[2].manual = false;
  await vp.setInputFiles('#proj-import', { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ type: 'visi-project', v: 1, project: proj })) });
  await vp.waitForTimeout(1200);
  const items = await vp.evaluate(() => MB.store.getProject(localStorage.getItem('sail-mb-active')).then((x) => MB.checkProject(MB.normalizeProject(x), MB.makeResolver.last).items.map((i) => i.level + '|' + i.text)));
  assert.ok(items.some((x) => /\|有 4 张案例照片这台电脑没有（要先汇入那个项目的文件夹）$/.test(x)), items.join('\n'));
  assert.ok(!items.some((x) => /已经被删除|登入公司案例库|暂停中/.test(x)), items.join('\n'));
  const deck = await vp.evaluate(() => ({
    gone: document.querySelectorAll('#deck .ph-gone').length,
    text: [...document.querySelectorAll('#deck .ph-gone')].map((e) => e.textContent).join('|'),
    broken: [...document.querySelectorAll('#deck img')].filter((i) => i.complete && !i.naturalWidth).length
  }));
  assert.ok(deck.gone >= 2, JSON.stringify(deck));
  assert.match(deck.text, /这台电脑没有这张案例照片（要先汇入那个项目的文件夹）/);
  assert.equal(deck.broken, 0);
  // 选图按「确定」、换风格：这台电脑没有的照样留着（汇入那个文件夹就回来），不会悄悄换掉
  const current = () => vp.evaluate(() => MB.store.getProject(localStorage.getItem('sail-mb-active')).then((x) => MB.normalizeProject(x)));
  await vp.click('[data-tab="rooms"]');
  await vp.locator('#room-list [data-room-pick]').first().click();
  await vp.waitForSelector('#pick-modal.on');
  const title = await vp.textContent('#pick-title');
  await vp.click('#pick-ok');
  await vp.waitForTimeout(300);
  await vp.click('#cases-pick');
  await vp.waitForSelector('#pick-modal.on');
  await vp.click('#pick-ok');
  await vp.waitForTimeout(300);
  await vp.click('[data-tab="style"]');
  await vp.click('#dir-cards [data-dir="skeleton"]');
  await vp.waitForTimeout(900);
  const after = await current();
  assert.match(title, /这台电脑看不到，会留着（汇入那个项目的文件夹就看得到）/);
  assert.ok(!/按「加入所选」就拿掉/.test(title), title);
  assert.deepEqual([after.rooms[0].images, after.rooms[1].images, after.rooms[2].images, after.cases.map((c) => c.ref)],
    [proj.rooms[0].images, proj.rooms[1].images, [absent], [proj.cases[0].ref]], JSON.stringify(after.rooms.map((r) => r.images)));
  // 自动配图：先问（按了取消就不动）
  D.page.removeAllListeners('dialog');
  D.page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  await vp.click('[data-tab="rooms"]');
  await vp.locator('#room-list [data-room-auto]').nth(2).click();      // 客厅（自动配的，放着那张）
  await vp.waitForTimeout(400);
  assert.ok(dialogs.some((x) => /张公司案例照片这台电脑看不到（要先汇入那个项目的文件夹）/.test(x)), dialogs.join(' | '));
  assert.deepEqual((await current()).rooms.map((r) => r.images), after.rooms.map((r) => r.images));
  assert.deepEqual(vp.errors, []);
  await D.ctx.close();
});

/* ============================================================ */
test('two tabs (案例库 + VISI = two service workers) writing at the same time: no update is lost', async () => {
  const { page, ctx } = A;
  const vp = await ctx.newPage();
  await vp.goto(m.url + '/visi');
  await vp.waitForSelector('#deck .pg');
  await vp.waitForFunction(() => !!navigator.serviceWorker.controller && MB.cloud.status().status === 'ok', null, { timeout: 20000 });
  const scopes = await vp.evaluate(() => navigator.serviceWorker.getRegistrations().then((rs) => rs.map((r) => new URL(r.scope).pathname).sort()));
  assert.deepEqual(scopes, ['/caselib', '/visi']);
  const idx0 = await localIndex(page);
  const hs = Object.keys(idx0.photos).sort().slice(0, 16);
  const send = (pg, list, tag) => pg.evaluate(([list, tag]) => Promise.all(list.map((h) => fetch('/api/catalog', {
    method: 'POST', headers: { 'X-VISI': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'patch', source: 'human', photos: { [h]: { desc: { en: tag + ' ' + h.slice(0, 4) } } } })
  }).then((r) => r.status))), [list, tag]);
  const [a, b] = await Promise.all([send(page, hs.slice(0, 8), 'from caselib'), send(vp, hs.slice(8), 'from visi')]);
  assert.deepEqual(a.concat(b), Array(16).fill(200));
  const idx1 = await localIndex(page);
  assert.equal(idx1.rev, idx0.rev + 16, 'every write got its own revision');
  hs.forEach((h, i) => assert.equal(idx1.photos[h].desc.en, (i < 8 ? 'from caselib ' : 'from visi ') + h.slice(0, 4), h));
  await vp.close();
});

/* ============================================================ */
test('switching back to 云端: /api/* reaches the server again, local photos are kept; the invite page is never controlled by the service worker', async () => {
  const { page, ctx } = A;
  // 邀请页（给客户看的）：本机模式开着、service worker 装着，也不会被它管
  const inv = await ctx.newPage();
  for (const path of ['/', '/index.html', '/brief']) {
    await inv.goto(m.url + path);
    await inv.waitForLoadState('load');
    await inv.waitForTimeout(300);
    assert.equal(await inv.evaluate(() => !!navigator.serviceWorker.controller), false, path + ' is not controlled');
  }
  await inv.close();
  const before = Object.keys((await idb(page, 'meta', 'index')).photos).length;
  assert.ok(before >= 18, 'photos in this browser: ' + before);
  // 换成云端
  await page.goto(m.url + '/caselib');
  await page.waitForSelector('#tabs:not([hidden])', { timeout: 20000 });
  assert.equal(m.apiHits().hits, 0);
  await Promise.all([page.waitForEvent('load'), page.click('#mode-switch')]);
  await page.waitForSelector('#login:not([hidden])');
  await page.waitForSelector('#login-pass', { state: 'visible' });
  assert.equal(await page.getAttribute('#mode-cloud', 'aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), false, 'no service worker after switching to the cloud');
  await waitFor(() => m.apiHits().paths.indexOf('GET /api/session') > -1, 10000, 'GET /api/session reached the server');
  await page.fill('#login-name', 'Ana');
  await page.fill('#login-pass', PASSWORD);
  await page.click('#login-go');
  await page.waitForSelector('#tabs:not([hidden])');
  await page.waitForFunction(() => MB.cl.cat && MB.cl.cat.quota && MB.cl.cat.quota.plan === 'hobby', null, { timeout: 15000 });
  assert.ok(m.apiHits().paths.indexOf('GET /api/catalog') > -1);
  assert.equal(await page.evaluate(() => Object.keys(MB.cl.cat.photos).length), 0, 'the cloud library is the server one');
  assert.equal(await page.textContent('#who-mode'), '云端');
  // 本机的资料一张都没少
  assert.equal(Object.keys((await idb(page, 'meta', 'index')).photos).length, before);
  // 云端模式的 VISI：方案里本机的案例照片不会变成「已删除」（不 HEAD、不换掉），体检说改回「存在这台电脑」就看得到
  const vp = await ctx.newPage();
  vp.errors = [];
  vp.on('pageerror', (e) => vp.errors.push(e.message));
  vp.on('dialog', (d) => d.accept());
  await vp.goto(m.url + '/visi');
  await vp.waitForSelector('#deck .pg');
  await vp.waitForFunction(() => !MB.cloud.status().local && MB.cloud.status().status === 'ok', null, { timeout: 20000 });
  await vp.click('[data-tab="library"]');
  await vp.setInputFiles('#proj-import', { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ type: 'visi-project', v: 1, project: A.project })) });
  await vp.waitForTimeout(1500);
  const cv = await vp.evaluate(() => MB.store.getProject(localStorage.getItem('sail-mb-active')).then((x) => {
    const p = MB.normalizeProject(x), refs = MB.caseRefsIn(p);
    return { refs, gone: refs.map((r) => MB.caseGone(r)), where: refs.map((r) => MB.cloud.elsewhere(r)),
      items: MB.checkProject(p, MB.makeResolver.last).items.map((i) => i.level + '|' + i.text), deleted: document.querySelectorAll('#deck .ph-gone[data-gone="deleted"]').length };
  }));
  assert.ok(cv.refs.length >= 3, JSON.stringify(cv));
  assert.deepEqual(cv.gone, cv.refs.map(() => ''), 'not deleted');
  assert.deepEqual(cv.where, cv.refs.map(() => 'local'));
  assert.ok(cv.items.some((x) => new RegExp('^warn\\|有 ' + cv.refs.length + ' 张是本机案例库的照片：改回「存在这台电脑」就看得到$').test(x)), cv.items.join('\n'));
  assert.ok(!cv.items.some((x) => /已经被删除|这台电脑没有/.test(x)), cv.items.join('\n'));
  assert.equal(cv.deleted, 0);
  assert.deepEqual(vp.errors, []);
  await vp.close();
  // 再换回这台电脑：照片都还在
  await Promise.all([page.waitForEvent('load'), page.click('#mode-switch')]);
  await page.waitForSelector('#login:not([hidden])');
  assert.equal(await page.getAttribute('#mode-local', 'aria-pressed'), 'true');
  const hits = m.apiHits().hits;
  await page.fill('#login-name', 'Ana');
  await page.click('#login-go');
  await page.waitForSelector('#tabs:not([hidden])', { timeout: 20000 });
  await page.waitForFunction(() => MB.cl.cat && MB.cl.cat.quota && MB.cl.cat.quota.plan === 'local', null, { timeout: 20000 });
  assert.equal(await page.evaluate(() => Object.keys(MB.cl.cat.photos).length), before);
  assert.equal(m.apiHits().hits, hits, 'local again: nothing reaches the server');
  assert.deepEqual(page.errors, []);
});

/* ============================================================ */
test('login card: tapping 云端 only asks the server (switches after a cloud login); 登出 keeps the photos and VISI says so; 「不用等了」', async () => {
  const { ctx, page } = await ctxPage();
  await localLogin(page, 'Kim');
  await upload(page, info.soloA);
  // 标签档里有很多这台电脑没有的：「不用等了」
  await page.click('#tabs [data-tab="review"]');
  await page.waitForSelector('#rv-import', { state: 'attached' });
  await page.setInputFiles('#rv-import', tagsFile);
  await page.waitForFunction(() => /还有 \d+ 张照片的标签在等/.test(document.querySelector('#rv-tags-msg').textContent), null, { timeout: 15000 });
  await page.click('#rv-tags-msg [data-act="clear-pending"]');
  await page.waitForFunction(() => /不再等那 \d+ 张照片的标签/.test(document.querySelector('#rv-tags-msg').textContent), null, { timeout: 15000 });
  assert.equal((await localIndex(page)).pendingTags, 0);
  assert.equal(await page.$('#rv-tags-msg [data-act="clear-pending"]'), null);
  const n = Object.keys((await localIndex(page)).photos).length;
  // VISI 先打开过一次（存着本机的清单）
  const v0 = await ctx.newPage();
  await v0.goto(m.url + '/visi');
  await v0.waitForFunction(() => MB.cloud.status().status === 'ok' && MB.cloud.status().local && MB.cases().length > 0, null, { timeout: 20000 });
  await v0.close();
  // 登出：VISI 说照片都还在，只要再填名字
  await Promise.all([page.waitForEvent('load'), page.click('#logout')]);
  await page.waitForSelector('#login:not([hidden])');
  const vp = await ctx.newPage();
  await vp.goto(m.url + '/visi');
  await vp.waitForSelector('#deck .pg');
  await vp.waitForFunction(() => MB.cloud.status().cached && MB.cloud.status().local, null, { timeout: 20000 });
  await vp.click('[data-tab="library"]');
  await vp.waitForFunction(() => /本机案例库登出了/.test(document.querySelector('#cloud-panel').textContent), null, { timeout: 10000 });
  const box = await vp.textContent('#cloud-panel');
  assert.match(box, new RegExp('本机案例库登出了（' + n + ' 张照片都还在这台电脑）'));
  assert.ok(!/拖进去/.test(box), box);
  await vp.click('[data-tab="rooms"]');
  assert.match(await vp.textContent('#cases-cloud'), /本机案例库登出了/);
  await vp.close();
  // 登入框：点「云端」→ 问伺服器（这一页还被 service worker 管着，也照样问到伺服器），但还不算换
  assert.equal(await page.getAttribute('#mode-local', 'aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true);
  const hits = m.apiHits().hits;
  await page.click('#mode-cloud');
  await page.waitForSelector('#login-pass', { state: 'visible' });
  await waitFor(() => m.apiHits().hits > hits, 10000, 'GET /api/session reached the server from a controlled page');
  assert.equal(await page.evaluate(() => localStorage.getItem('caselib-mode')), 'local', 'not switched yet');
  assert.equal((await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length))), 2);
  // 点回来、重新整理：还是这台电脑
  await page.click('#mode-local');
  await page.reload();
  await page.waitForSelector('#login:not([hidden])');
  assert.equal(await page.getAttribute('#mode-local', 'aria-pressed'), 'true');
  // 再点云端、真的登入：这时才换（service worker 取消，本机资料留着）
  await page.click('#mode-cloud');
  await page.waitForSelector('#login-pass', { state: 'visible' });
  await page.fill('#login-name', 'Kim');
  await page.fill('#login-pass', PASSWORD);
  await page.click('#login-go');
  await page.waitForSelector('#tabs:not([hidden])');
  await page.waitForFunction(() => MB.cl.cat && MB.cl.cat.quota && MB.cl.cat.quota.plan === 'hobby', null, { timeout: 15000 });
  await waitFor(() => page.evaluate(() => localStorage.getItem('caselib-mode') === 'cloud' && navigator.serviceWorker.getRegistrations().then((r) => r.length === 0)), 10000, 'switched after the cloud login');
  assert.equal(await page.evaluate(() => document.querySelector('#local-keep').hidden), true, 'no local storage banner in cloud mode');
  assert.equal(Object.keys((await idb(page, 'meta', 'index')).photos).length, n, 'local photos kept');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});
