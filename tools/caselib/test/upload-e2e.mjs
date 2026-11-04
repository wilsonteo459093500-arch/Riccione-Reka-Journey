/* ============================================================
   caselib.html（上传 / 审核）浏览器端到端测试
   node --test tools/caselib/test/upload-e2e.mjs        （或直接 node 这个档）
   每个情境自己开一个 mock server（tools/caselib/mock-server.mjs，记忆体储存），
   用 Playwright 选假文件夹（upload-fixtures.py 产生），再直接看 mock 存了什么。
   截图：$CASELIB_SCRATCH/shots/（没设就在 os.tmpdir()/caselib-upload/shots）
   ============================================================ */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { cpSync, rmSync, utimesSync } from 'node:fs';
import { startMock } from '../mock-server.mjs';
import {
  fixtures, launch, newPage, login, loginOk, selectFolder, waitHashed, startAndWait, waitDone,
  index, photoBlobs, packBlobs, sha16, hamming, byName, photosOf, shotPath, PASSWORD, BASE
} from './upload-kit.mjs';

const SETIA = 'Setia Alam 原木 陈先生';
const VERT = 'M Vertica 奶油风 林太太';
const BANG = 'Bangsar 轻法式 Mr Tan';

let info, browser;
const mocks = [];
// /api/photo 把这个月的写入次数在记忆体里留 30 秒（每个 mock 的清单路径都一样）：每个情境先清掉，不然上一个测试的额度会带过来
const photoMod = await import(new URL('../../../invite/api/photo.js', import.meta.url).href);
async function mock(opts) {
  photoMod.resetQuotaCache();
  const m = await startMock(Object.assign({ port: 0, blobPort: 0, password: PASSWORD }, opts || {}));
  mocks.push(m);
  return m;
}

before(async () => {
  info = await fixtures();
  browser = await launch();
});
after(async () => {
  if (browser) await browser.close();
  for (const m of mocks) await m.close();
});

/* ------------------------------------------------------------ */
test('login: wrong password is rejected, right one shows who is logged in', async () => {
  const m = await mock();
  const { ctx, page } = await newPage(browser);
  await login(page, m.url, 'Ana', 'nope');
  await page.waitForSelector('#login-err.on');
  assert.match(await page.textContent('#login-err'), /团队密码不对/);
  assert.equal(await page.isHidden('#tabs'), true, 'tabs stay hidden');
  assert.equal(await page.isHidden('.cl-pane[data-pane="upload"]'), true, 'upload pane stays hidden');
  // 空名字
  await page.fill('#login-name', '');
  await page.fill('#login-pass', PASSWORD);
  await page.click('#login-go');
  assert.match(await page.textContent('#login-err'), /名字/);
  // 对的
  await page.fill('#login-name', 'Ana');
  await page.click('#login-go');
  await page.waitForSelector('#tabs:not([hidden])');
  assert.equal(await page.textContent('#who-name'), 'Ana');
  // 重新整理：cookie 还在，不用再登入
  await page.reload();
  await page.waitForSelector('#tabs:not([hidden])');
  assert.equal(await page.isHidden('#login'), true);
  // 登出 → 回到登入卡
  await page.click('#logout');
  await page.waitForSelector('#login:not([hidden])');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

/* ------------------------------------------------------------
   主流程：一个总文件夹（3 个项目）→ 预览 → 上传 → 检查储存 → 再选一次 → 审核
   ------------------------------------------------------------ */
const A = {};   // 这几个测试共用：mock、页面
test('upload: plan preview lists projects, skipped files and the Blob estimate', async () => {
  A.m = await mock();
  const { ctx, page } = await newPage(browser);
  A.ctx = ctx; A.page = page;
  await loginOk(page, A.m.url, 'Ana');
  await selectFolder(page, info.root);
  await waitHashed(page);

  const S = await page.evaluate(() => {
    const s = MB.clUpload.state();
    return {
      mode: s.scan.mode,
      projects: s.projects.map((p) => ({ name: p.name, n: p.items.length, skipped: p.skipped.length })),
      skipped: s.scan.skipped.map((x) => ({ rel: x.rel, reason: x.reason }))
    };
  });
  assert.equal(S.mode, 'split', 'a root folder that only holds folders = one project per sub-folder');
  assert.deepEqual(S.projects.map((p) => p.name).sort(), [BANG, VERT, SETIA].sort());
  for (const p of S.projects) assert.equal(p.n, info.projects[p.name].photos, 'photo count for ' + p.name);
  const reasons = {};
  S.skipped.forEach((x) => { reasons[x.reason] = (reasons[x.reason] || 0) + 1; });
  assert.deepEqual(reasons, { heic: 1, raw: 1, video: 1, other: 1, big: 1, junk: 4 }, JSON.stringify(S.skipped));
  const rel = S.skipped.map((x) => x.rel);
  for (const want of ['案例图/' + SETIA + '/IMG_0005.HEIC', '案例图/' + SETIA + '/clip.mp4', '案例图/' + SETIA + '/厨房/Thumbs.db',
    '案例图/' + VERT + '/DSC_001.NEF', '案例图/' + VERT + '/brief.pdf', '案例图/' + BANG + '/.DS_Store', '案例图/' + BANG + '/huge.jpg',
    '案例图/desktop.ini', '案例图/Thumbs.db']) {
    assert.ok(rel.includes(want), 'skipped list has ' + want);
  }
  // 画面：HEIC 提示、项目表、比对结果、估算
  const txt = await page.textContent('#plan-body');
  assert.match(txt, /HEIC/);
  assert.match(txt, /另存为 JPG/);
  assert.match(txt, /11 张新照片/);
  assert.match(txt, /重复 1 张/);
  for (const n of [SETIA, VERT, BANG]) assert.ok(txt.includes(n), 'project row ' + n);
  const est = await page.evaluate(() => MB.clUpload.estimate());
  assert.equal(est.photos, 11);
  assert.equal(est.writes, 11 + 3 * 2 + 1, '11 photos + (pack + index) × 3 projects + 1 daily backup');
  assert.equal(est.over, false);
  assert.equal(await page.isDisabled('#start'), false);
  assert.match(await page.textContent('#start'), /11/);
  // 手动切成「一个项目」再切回来
  await page.click('[data-mode="single"]');
  await page.waitForFunction(() => MB.clUpload.state().projects.length === 1);
  assert.equal(await page.evaluate(() => MB.clUpload.state().projects[0].name), '案例图');
  await page.click('[data-mode="split"]');
  await page.waitForFunction(() => MB.clUpload.state().projects.length === 3);
  await waitHashed(page);
  await page.screenshot({ path: shotPath('upload-plan-1440.png'), fullPage: true });
  assert.deepEqual(page.errors, []);
});

test('upload: run stores each unique photo once, fixes rotation, groups near-duplicates', async () => {
  const { page } = A, m = A.m;
  m.adapter.resetStats();
  await startAndWait(page);
  const sum = await page.textContent('#sum-body');
  assert.match(sum, /这次新增\s*11\s*张/);
  const counts = await page.evaluate(() => MB.clUpload.state().counts);
  assert.equal(counts.committed, 11);
  assert.equal(counts.dup, 1);
  assert.equal(counts.failed, 0);
  assert.equal(counts.bad, 0);

  const idx = index(m);
  assert.equal(Object.keys(idx.projects).length, 3);
  assert.equal(Object.keys(idx.photos).length, 11);
  assert.equal(photoBlobs(m).length, 11, 'one photo put per unique photo');
  assert.equal(m.adapter.stats().puts, 11 + 3 + 3, '11 photos + 3 thumb packs + 3 index writes');
  assert.equal(packBlobs(m).length, 3);

  // 同一个档放两个项目：只存一次，放在第一个（项目照名字排：M Vertica 在 Setia 前面）
  const hShared = sha16(join(info.root, SETIA, 'shared.jpg'));
  assert.equal(sha16(join(info.root, VERT, 'shared.jpg')), hShared);
  const pV = byName(idx, VERT), pS = byName(idx, SETIA), pB = byName(idx, BANG);
  assert.equal(idx.photos[hShared].p, pV.pid);
  assert.equal(pV.n, 3);
  assert.equal(pS.n, 5);
  assert.equal(pB.n, 3);
  assert.match(sum, /重复的照片（1）/);

  const S = photosOf(idx, pS.pid);
  const find = (f) => S.find((p) => p.f === f);
  // EXIF 转向 6：存的是横的，转正后是直的
  const rot = find('IMG_0003_rot.jpg');
  assert.ok(rot, 'rotated photo uploaded');
  assert.ok(rot.w < rot.h, 'portrait after orientation fix: ' + rot.w + '×' + rot.h);
  assert.deepEqual([rot.w, rot.h], [800, 1200]);
  const rotBytes = m.adapter.read(rot.k).body;
  assert.deepEqual([...rotBytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.equal(rotBytes.includes(Buffer.from('Exif')), false, 'EXIF / GPS stripped by re-encoding');
  // 子文件夹留在项目里（f = 项目内的路径）；PNG 也收，存成 JPEG
  assert.ok(find('厨房/K_01.jpg'));
  const png = find('厨房/K_02.png');
  assert.ok(png, 'PNG accepted');
  assert.deepEqual([...m.adapter.read(png.k).body.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  // 6000×4000 → 1200 长边（免费方案空间有限），≤ 3.5 MB
  const big = photosOf(idx, pV.pid).find((p) => p.f === 'big_6000.jpg');
  assert.deepEqual([big.w, big.h], [1200, 800]);
  assert.ok(m.adapter.read(big.k).body.length <= 3.5 * 1024 * 1024);
  // 近似重复（裁一点、亮一点）同一个 shot；其它各自一组
  const p1 = find('IMG_0001.jpg'), p2 = find('IMG_0002.jpg');
  assert.ok(hamming(p1.dh, p2.dh) <= 6, 'near-duplicate dHash distance ' + hamming(p1.dh, p2.dh));
  assert.equal(p1.shot, p1.hash);
  assert.equal(p2.shot, p1.hash, 'near-duplicates share a shot');
  for (const h of Object.keys(idx.photos)) if (h !== p2.hash) assert.equal(idx.photos[h].shot, h, 'distinct photo ' + idx.photos[h].f + ' leads its own shot');
  // 每张都有 k、尺寸、dHash、谁传的
  for (const h of Object.keys(idx.photos)) {
    const ph = idx.photos[h];
    assert.match(ph.k, new RegExp('^c/' + h + '-'));
    assert.match(ph.dh, /^[0-9a-f]{16}$/);
    assert.equal(ph.by, 'Ana');
    assert.equal(ph.status, 'new');
    assert.ok(Math.max(ph.w, ph.h) <= 1200);
    assert.equal(ph.sz, m.adapter.read(ph.k).body.length, 'sz = stored JPEG bytes');
  }
  // 缩图包：每个项目一包，每张都有 320px 的 dataURL
  for (const p of [pV, pS, pB]) {
    assert.equal(p.packs.length, 1);
    const pack = JSON.parse(m.adapter.read(p.packs[0]).body.toString('utf8'));
    for (const ph of photosOf(idx, p.pid)) assert.match(pack[ph.hash] || '', /^data:image\/jpeg;base64,/, 'thumb for ' + ph.f);
  }
  // 日志清空了
  assert.equal(await page.evaluate(() => Object.keys(MB.clUpload.journal()).length), 0);
  // 截图（上传完）
  await page.screenshot({ path: shotPath('upload-1440.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: shotPath('upload-390.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.deepEqual(page.errors, []);
});

test('upload: selecting the same folder again = zero new puts, no re-hash, merge notice', async () => {
  const { page } = A, m = A.m;
  m.adapter.resetStats();
  const hashBefore = await page.evaluate(() => MB.clWork.stats().hash);
  await selectFolder(page, info.root);
  await waitHashed(page);
  assert.equal(await page.evaluate(() => MB.clWork.stats().hash), hashBefore, 'hashes come from the IndexedDB cache');
  const txt = await page.textContent('#plan-body');
  assert.match(txt, /已有同名项目 5 张，将合并/);
  assert.match(txt, /已有同名项目 3 张，将合并/);
  assert.match(txt, /0 张新照片 · 已在库里 11 张 · 重复 1 张/);
  assert.equal(await page.isDisabled('#start'), true);
  assert.match(await page.textContent('#start'), /没有新照片/);
  assert.equal(m.adapter.stats().puts, 0);

  // 重新整理页面（记忆体清空，IndexedDB 还在）再选：一样 0 次 hash、0 次写入
  await page.reload();
  await page.waitForSelector('#tabs:not([hidden])');
  await page.waitForFunction(() => MB.cl.cat);
  await selectFolder(page, info.root);
  await waitHashed(page);
  assert.equal(await page.evaluate(() => MB.clWork.stats().hash), 0, 'no hashing after reload either');
  assert.equal(await page.isDisabled('#start'), true);
  assert.equal(m.adapter.stats().puts, 0, 'zero Blob writes');
  assert.deepEqual(page.errors, []);
});

/* ---------- 审核 ---------- */
async function serverPhoto(m, f) {
  const idx = index(m);
  const h = Object.keys(idx.photos).find((x) => idx.photos[x].f === f);
  return Object.assign({ hash: h }, idx.photos[h]);
}

test('review: edit room / cabinets / style / hero, 保存 → confirmed and by = login name', async () => {
  const { page } = A, m = A.m;
  await page.click('#tabs [data-tab="review"]');
  await page.waitForSelector('#rv-grid .rv-card');
  // 真实项目名只在这里出现
  const opts = await page.textContent('#rv-filters select[data-f="pid"]');
  for (const n of [SETIA, VERT, BANG]) assert.ok(opts.includes(n), 'project name in review: ' + n);
  assert.equal(await page.$$eval('#rv-grid .rv-card', (els) => els.length), 11);
  // 只看 Setia
  const pS = byName(index(m), SETIA);
  await page.selectOption('#rv-filters select[data-f="pid"]', pS.pid);
  await page.waitForFunction(() => document.querySelectorAll('#rv-grid .rv-card').length === 5);
  assert.match(await page.textContent('#rv-proj'), new RegExp(SETIA));

  const p1 = await serverPhoto(m, 'IMG_0001.jpg');
  await page.click('#rv-grid .rv-card[data-h="' + p1.hash + '"]');
  await page.waitForSelector('#drawer.on');
  assert.match(await page.textContent('#drawer .dr-path'), new RegExp(SETIA + '.*IMG_0001'));
  await page.click('#drawer .chips[data-kind="room"] .chip[data-v="kitchen"]');
  await page.click('#drawer .chips[data-kind="cabinets"] .chip[data-v="island"]');
  await page.click('#drawer .chips[data-kind="cabinets"] .chip[data-v="kitchen"]');
  await page.click('#drawer .chips[data-kind="style"] .chip[data-v="french"]');
  await page.click('#drawer .switch');
  assert.match(await page.textContent('#rv-save .msg'), /未保存\s*4\s*项/);
  assert.equal(await page.isVisible('#tab-review-dot'), true);
  await page.click('#rv-savebtn');
  await page.waitForFunction(() => MB.clReview.unsaved() === 0 && /已保存/.test(document.querySelector('#rv-save .msg').textContent));
  const s1 = await serverPhoto(m, 'IMG_0001.jpg');
  assert.equal(s1.room, 'kitchen');
  assert.deepEqual(s1.cabinets, ['kitchen', 'island'], 'cabinets kept in vocab order');
  assert.equal(s1.style, 'french');
  assert.equal(s1.hero, true);
  assert.equal(s1.status, 'confirmed');
  assert.equal(s1.by, 'Ana');
  // 重新从伺服器拿：画面跟伺服器一致
  await page.click('#rv-reload');
  await page.waitForTimeout(300);
  const card = await page.textContent('#rv-grid .rv-card[data-h="' + p1.hash + '"]');
  assert.match(card, /已确认/);
  assert.match(card, /厨房/);
  assert.match(card, /轻法式/);

  // 「确认 ✓ 下一张」：只确认、换下一张（重新载入后已确认的排到最后，从第一张开始）
  await page.click('#rv-grid .rv-card >> nth=0');
  const before = await page.evaluate(() => MB.clReview.state().sel);
  assert.notEqual(before, p1.hash);
  await page.click('#drawer [data-act="ok-next"]');
  const after = await page.evaluate(() => MB.clReview.state().sel);
  assert.notEqual(after, before, 'moved to the next photo');
  // 自动保存不再每 3 秒一次（每次保存都是一次 Blob 写入）：停手 45 秒才存 —— 3.5 秒后伺服器还没变
  assert.equal(await page.evaluate(() => MB.clReview.idleMs), 45000);
  await page.waitForTimeout(3500);
  assert.notEqual(index(m).photos[before].status, 'confirmed', 'not saved 3.5 s after the edit');
  assert.equal(await page.evaluate(() => MB.clReview.unsaved()), 1);
  assert.match(await page.textContent('#rv-save .msg'), /停手 45 秒后自动保存/);
  // 切到别的分页：马上存
  await page.click('#tabs [data-tab="upload"]');
  await waitServer(() => index(m).photos[before].status === 'confirmed' && index(m).photos[before].room === '', 8000);
  await page.click('#tabs [data-tab="review"]');
  await page.waitForSelector('#drawer.on');
  // 停手才存：连点 3 下（间隔比停手时间短）只送一次
  await page.evaluate(() => { MB.clReview.idleMs = 1200; });
  const posts = [];
  const onReq = (r) => { if (r.method() === 'POST' && /\/api\/catalog$/.test(r.url())) posts.push(r.postDataJSON()); };
  page.on('request', onReq);
  const nextH = after;
  await page.click('#drawer .chips[data-kind="room"] .chip[data-v="kitchen"]');
  await page.waitForTimeout(500);
  await page.click('#drawer .chips[data-kind="room"] .chip[data-v="dining"]');
  await page.waitForTimeout(500);
  await page.click('#drawer .chips[data-kind="room"] .chip[data-v="living"]');
  await page.waitForFunction(() => MB.clReview.unsaved() === 0 && !MB.clReview.state().saving, null, { timeout: 8000 });
  page.off('request', onReq);
  assert.equal(posts.length, 1, 'debounced into one patch: ' + JSON.stringify(posts));
  assert.equal(posts[0].photos[nextH].room, 'living');
  assert.equal(index(m).photos[nextH].room, 'living');
  assert.equal(index(m).photos[nextH].by, 'Ana');
  // 明确选「待确认」：之后改别的栏位也保持待确认
  await page.click('#drawer .chips[data-kind="status"] .chip[data-v="unsure"]');
  await page.click('#drawer .chips[data-kind="cabinets"] .chip[data-v="tvcab"]');
  await page.click('#rv-savebtn');
  await page.waitForFunction(() => MB.clReview.unsaved() === 0 && !MB.clReview.state().saving);
  assert.equal(index(m).photos[nextH].status, 'unsure');
  assert.deepEqual(index(m).photos[nextH].cabinets, ['tvcab']);
  await page.screenshot({ path: shotPath('review-edit-1440.png') });
  assert.deepEqual(page.errors, []);
});

test('review: project panel (area, ptype, traits, style) saves with by = login name', async () => {
  const { page } = A, m = A.m;
  const pS = byName(index(m), SETIA);
  await page.click('#rv-proj [data-act="proj-edit"]');
  await page.waitForSelector('#drawer .dr-title');
  assert.equal(await page.textContent('#drawer .dr-title'), SETIA);
  await page.fill('#drawer input[data-pfield="area"]', 'Setia Alam');
  await page.click('#drawer .chips[data-kind="ptype"] .chip[data-v="terrace"]');
  await page.click('#drawer .chips[data-kind="traits"] .chip[data-v="elderly"]');
  await page.click('#drawer .chips[data-kind="traits"] .chip[data-v="kids"]');
  await page.click('#drawer .chips[data-kind="pstyle"] .chip[data-v="wood"]');
  await page.click('#rv-savebtn');
  await page.waitForFunction(() => MB.clReview.unsaved() === 0 && !MB.clReview.state().saving);
  const pr = index(m).projects[pS.pid];
  assert.equal(pr.area, 'Setia Alam');
  assert.equal(pr.ptype, 'terrace');
  assert.deepEqual(pr.traits, ['elderly', 'kids']);
  assert.equal(pr.style, 'wood');
  assert.equal(pr.by, 'Ana');
  // 没自己风格的照片跟着项目风格
  await page.selectOption('#rv-filters select[data-f="style"]', 'wood');
  await page.waitForTimeout(200);
  assert.equal(await page.$$eval('#rv-grid .rv-card', (els) => els.length), 4, 'photo with its own style (french) is not «wood»');
  await page.selectOption('#rv-filters select[data-f="style"]', '');
  assert.match(await page.textContent('#rv-proj'), /Setia Alam · 排屋 · 原木 · 长辈同住 · 有小孩/);
  assert.deepEqual(page.errors, []);
});

test('review: hide / unhide a photo and a project', async () => {
  const { page } = A, m = A.m;
  await page.click('#drawer .dr-x');
  const p2 = await serverPhoto(m, 'IMG_0002.jpg');
  await page.click('#rv-grid .rv-card[data-h="' + p2.hash + '"]');
  await page.click('#drawer [data-act="hide-photo"]');
  await waitServer(() => index(m).photos[p2.hash].hidden);
  assert.equal(index(m).photos[p2.hash].hidden.by, 'Ana');
  assert.match(await page.textContent('#rv-grid .rv-card[data-h="' + p2.hash + '"]'), /已隐藏/);
  assert.match(await page.textContent('#drawer [data-act="hide-photo"]'), /复原这张/);
  // 重新筛选：隐藏的不见；勾「显示已隐藏」又出现
  await page.click('#rv-reload');
  await page.waitForFunction((h) => !document.querySelector('#rv-grid .rv-card[data-h="' + h + '"]'), p2.hash);
  await page.check('#rv-filters input[data-f="hidden"]');
  await page.waitForSelector('#rv-grid .rv-card[data-h="' + p2.hash + '"].hid');
  await page.click('#rv-grid .rv-card[data-h="' + p2.hash + '"]');
  await page.click('#drawer [data-act="hide-photo"]');
  await waitServer(() => !index(m).photos[p2.hash].hidden);
  // 整个项目
  const pB = byName(index(m), BANG);
  await page.selectOption('#rv-filters select[data-f="pid"]', pB.pid);
  await page.click('#rv-proj [data-act="proj-edit"]');
  await page.click('#drawer [data-act="hide-project"]');
  await waitServer(() => index(m).projects[pB.pid].hidden);
  assert.equal(index(m).projects[pB.pid].hidden.by, 'Ana');
  assert.equal(await page.$$eval('#rv-grid .rv-card.hid', (els) => els.length), 3, 'all photos of a hidden project look hidden');
  await page.click('#drawer [data-act="hide-project"]');
  await waitServer(() => !index(m).projects[pB.pid].hidden);
  // 最近修改：有 Ana 的纪录
  await page.click('#rv-logbtn');
  assert.match(await page.textContent('#rv-log'), /Ana/);
  assert.match(await page.textContent('#rv-log'), /隐藏|复原/);
  await page.click('#rv-logbtn');
  await page.uncheck('#rv-filters input[data-f="hidden"]');
  await page.selectOption('#rv-filters select[data-f="pid"]', '');
  await page.click('#drawer .dr-x');
  assert.deepEqual(page.errors, []);
});

test('review: quick hides go out together (one write); hide + unhide before sending = no write; month counter shown', async () => {
  const { page } = A, m = A.m;
  await page.evaluate(() => { MB.clReview.hideMs = 1500; });
  const ids = await page.$$eval('#rv-grid .rv-card', (els) => els.slice(0, 3).map((e) => e.getAttribute('data-h')));
  const before = m.adapter.stats().puts;
  const budget0 = await page.textContent('#rv-budget');
  assert.match(budget0, /写入约 [\d,]+/);
  for (const h of ids) {
    await page.click('#rv-grid .rv-card[data-h="' + h + '"]');
    await page.click('#drawer [data-act="hide-photo"]');
  }
  assert.ok(await page.evaluate(() => MB.clReview.unsaved()) >= 3, 'pending hides count as unsaved (beforeunload asks)');
  await waitServer(() => ids.every((h) => index(m).photos[h].hidden), 8000);
  assert.equal(m.adapter.stats().puts - before, 1, 'three hides = one Blob write');
  // 按了又按回去：不用送
  const mid = m.adapter.stats().puts;
  await page.click('#drawer [data-act="hide-photo"]');     // 复原第 3 张
  await page.click('#drawer [data-act="hide-photo"]');     // 又隐藏
  await page.waitForTimeout(2500);
  assert.equal(m.adapter.stats().puts, mid, 'toggled back before sending → nothing written');
  // 全部复原（一次）
  await page.check('#rv-filters input[data-f="hidden"]');
  for (const h of ids) {
    await page.click('#rv-grid .rv-card[data-h="' + h + '"]');
    await page.click('#drawer [data-act="hide-photo"]');
  }
  await page.click('#rv-savebtn');                         // 「保存」也会马上送隐藏 / 复原
  await waitServer(() => ids.every((h) => !index(m).photos[h].hidden), 4000);
  assert.equal(m.adapter.stats().puts - mid, 1);
  await page.uncheck('#rv-filters input[data-f="hidden"]');
  await page.click('#drawer .dr-x');
  const budget1 = await page.textContent('#rv-budget');
  const n = (t) => +((t.match(/写入约 ([\d,]+)/) || [0, '0'])[1].replace(/,/g, ''));
  assert.ok(n(budget1) >= n(budget0) + 2, budget0 + ' → ' + budget1);
  await page.evaluate(() => { MB.clReview.hideMs = 4000; });
  assert.deepEqual(page.errors, []);
});

async function waitServer(fn, ms) {
  const end = Date.now() + (ms || 8000);
  while (Date.now() < end) { if (fn()) return; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server state not reached: ' + fn);
}

test('review: session lost mid-queue → login overlay, edits kept and saved after login', async () => {
  const { page, ctx } = A, m = A.m;
  const p = await serverPhoto(m, 'B_01.jpg');
  await page.click('#rv-grid .rv-card[data-h="' + p.hash + '"]');
  await ctx.clearCookies();
  await page.click('#drawer .chips[data-kind="room"] .chip[data-v="dining"]');
  await page.click('#drawer .chips[data-kind="cabinets"] .chip[data-v="sideboard"]');
  await page.click('#rv-savebtn');
  await page.waitForSelector('#login.overlay:not([hidden])');
  assert.equal(await page.isVisible('#login-why'), true);
  assert.equal(await page.evaluate(() => MB.clReview.unsaved()), 2, 'queue kept while logged out');
  assert.equal(index(m).photos[p.hash].room, '', 'nothing saved without a session');
  await page.fill('#login-name', 'Ben');
  await page.fill('#login-pass', PASSWORD);
  await page.click('#login-go');
  await page.waitForFunction(() => MB.clReview.unsaved() === 0 && !MB.clReview.state().saving, null, { timeout: 10000 });
  const s = index(m).photos[p.hash];
  assert.equal(s.room, 'dining');
  assert.deepEqual(s.cabinets, ['sideboard']);
  assert.equal(s.by, 'Ben');
  assert.equal(await page.textContent('#who-name'), 'Ben');
  assert.deepEqual(page.errors, []);
});

test('review: network failure while saving → visible message, retried automatically', async () => {
  const { page } = A, m = A.m;
  const p = await serverPhoto(m, 'B_02.jpg');
  await page.click('#rv-grid .rv-card[data-h="' + p.hash + '"]');
  let failed = 0;
  await page.route('**/api/catalog', (route) => {
    if (route.request().method() === 'POST' && failed < 1) { failed++; return route.abort('internetdisconnected'); }
    return route.continue();
  });
  await page.click('#drawer .chips[data-kind="room"] .chip[data-v="study"]');
  await page.click('#rv-savebtn');
  await page.waitForFunction(() => /网路断了.*秒后自动重试/.test(document.querySelector('#rv-save .msg').textContent));
  assert.equal(failed, 1);
  await page.waitForFunction(() => MB.clReview.unsaved() === 0 && !MB.clReview.state().saving, null, { timeout: 15000 });
  assert.equal(index(m).photos[p.hash].room, 'study');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.click('#drawer .dr-x');
  // 审核截图（1440 / 390）
  await page.selectOption('#rv-filters select[data-f="pid"]', '');
  await page.click('#rv-grid .rv-card >> nth=1');
  await page.waitForTimeout(400);
  await page.screenshot({ path: shotPath('review-1440.png') });
  await page.click('#drawer .dr-x');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath('review-390.png'), fullPage: true });
  await page.click('#rv-grid .rv-card >> nth=0');
  await page.waitForTimeout(400);
  await page.screenshot({ path: shotPath('review-edit-390.png') });
  await page.click('#drawer .dr-x');
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.deepEqual(page.errors, []);
});

test('review: thumbnails come from packs; without Blob CORS they fall back to the full image', async () => {
  const m = A.m;
  // 新的 context：没有这次上传留下的缩图、也没有 IndexedDB 快取
  const one = await newPage(browser);
  await loginOk(one.page, m.url, 'Cy');
  await one.page.click('#tabs [data-tab="review"]');
  await one.page.waitForFunction(() => [...document.querySelectorAll('#rv-grid .rv-card img')].every((i) => i.getAttribute('src')), null, { timeout: 10000 });
  const srcs = await one.page.$$eval('#rv-grid .rv-card img', (els) => els.map((e) => e.getAttribute('src')));
  assert.ok(srcs.length >= 10 && srcs.every((s) => s.indexOf('data:image/jpeg;base64,') === 0), 'thumbs from packs');
  await one.ctx.close();

  m.setCors(false);
  const two = await newPage(browser);
  two.page.errors = [];
  await loginOk(two.page, m.url, 'Cy');
  await two.page.click('#tabs [data-tab="review"]');
  await two.page.waitForFunction(() => [...document.querySelectorAll('#rv-grid .rv-card img')].every((i) => i.getAttribute('src')), null, { timeout: 10000 });
  const srcs2 = await two.page.$$eval('#rv-grid .rv-card img', (els) => els.map((e) => e.getAttribute('src')));
  assert.ok(srcs2.every((s) => s.indexOf(m.blob + 'c/') === 0), 'full images when packs cannot be read: ' + srcs2[0]);
  m.setCors(true);
  await two.ctx.close();
});

/* ------------------------------------------------------------ */
test('two browser windows upload different projects at the same time: both commit', async () => {
  const m = await mock();
  m.adapter.conflictNext(2);          // 两边一定会撞到：先送两次冲突，mutate 要重试
  const a = await newPage(browser), b = await newPage(browser);
  await loginOk(a.page, m.url, 'Ana');
  await loginOk(b.page, m.url, 'Ben');
  await selectFolder(a.page, dirname(info.soloA));
  await selectFolder(b.page, dirname(info.soloB));
  await Promise.all([waitHashed(a.page), waitHashed(b.page)]);
  await Promise.all([a.page.click('#start'), b.page.click('#start')]);
  await Promise.all([waitDone(a.page), waitDone(b.page)]);
  const idx = index(m);
  const pa = byName(idx, 'Ipoh 日式 黄小姐'), pb = byName(idx, 'Puchong 北欧 Mdm Lee');
  assert.ok(pa && pb, 'both projects exist');
  assert.equal(pa.n, 4);
  assert.equal(pb.n, 4);
  assert.equal(photosOf(idx, pa.pid).every((p) => p.by === 'Ana'), true);
  assert.equal(photosOf(idx, pb.pid).every((p) => p.by === 'Ben'), true);
  assert.equal(photoBlobs(m).length, 8);
  assert.ok(m.adapter.stats().conflicts >= 2, 'injected conflicts were retried');
  assert.deepEqual(a.page.errors.concat(b.page.errors), []);
  await a.ctx.close(); await b.ctx.close();
});

test('crash mid-upload (page reloaded) then resume: no photo is uploaded twice', async () => {
  const m = await mock();
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  // 前 8 张照片放行；之后的照片、登记都先扣住（像网路断在半路）。
  // 「当掉」：扣住的全部 abort（请求根本没到伺服器），旧页面的重试也一律断掉，
  // 直到新页面载入才放行 —— 这样「已上传」的就只有那 8 张
  let photos = 0, phase = 'block';
  const held = [];
  await page.route('**/api/photo**', (route) => {
    if (phase === 'pass') return route.continue();
    if (phase === 'crash') return route.abort('connectionreset');
    if (photos < 8) { photos++; return route.continue(); }
    held.push(route);
  });
  await page.route('**/api/catalog', (route) => {
    if (phase === 'pass' || route.request().method() === 'GET') return route.continue();
    if (phase === 'crash') return route.abort('connectionreset');
    held.push(route);
  });
  await selectFolder(page, dirname(info.many));
  await waitHashed(page);
  await page.click('#start');
  await page.waitForFunction(() => Object.keys(MB.clUpload.journal()).length === 8, null, { timeout: 60000 });
  assert.equal(photoBlobs(m).length, 8);
  assert.equal(index(m), null, 'nothing committed yet');
  // 当掉：扣住的请求断掉，直接重新整理（关页前的提醒按「离开」）
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.type()); d.accept(); });
  phase = 'crash';
  await Promise.all(held.map((r) => r.abort('connectionreset').catch(() => {})));
  page.once('domcontentloaded', () => { phase = 'pass'; });
  await page.reload();
  await page.waitForSelector('#tabs:not([hidden])');
  assert.deepEqual(dialogs, ['beforeunload'], 'leaving while uploading asks first');
  // 开机就把日志里的 8 张补登记（不重传）
  await page.waitForSelector('#up-recover:not([hidden])');
  await waitServer(() => index(m) && Object.keys(index(m).photos).length === 8, 15000);
  await page.waitForFunction(() => /补登记好了/.test(document.querySelector('#up-recover').textContent));
  assert.equal(photoBlobs(m).length, 8);
  // 再选同一个文件夹：8 张已在库里，传剩下的 18 张
  await selectFolder(page, dirname(info.many));
  await waitHashed(page);
  assert.match(await page.textContent('#plan-body'), /已有同名项目 8 张，将合并/);
  assert.match(await page.textContent('#start'), /18/);
  await startAndWait(page);
  const idx = index(m);
  const p = byName(idx, 'Klang 现代简约 Mr Ong');
  assert.equal(p.n, info.manyN);
  assert.equal(photoBlobs(m).length, info.manyN, 'photo puts == unique photos (26)');
  assert.equal(await page.evaluate(() => MB.clUpload.state().counts.known), 8);
  assert.equal(await page.evaluate(() => MB.clUpload.state().counts.committed), 18);
  // 18 张跨过 20 的门槛吗？没有：这次 1 包；第一次补登记 1 包 → 共 2 包
  assert.equal(p.packs.length, 2);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('photo uploads failing → retried, then «重试失败的» finishes them; pause / resume', async () => {
  const m = await mock();
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  await page.evaluate(() => { MB.cl.backoff = function () { return 40; }; });   // 测试不必等真的退避时间
  // 第 6 张之后的照片：伺服器回 500（请求没到 mock，不会有多余的 Blob）
  let ok = 0, failedReq = 0;
  await page.route('**/api/photo**', (route) => {
    if (ok < 6) { ok++; return route.continue(); }
    failedReq++;
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"storage","message":"test"}' });
  });
  await selectFolder(page, dirname(info.many));
  await waitHashed(page);
  await startAndWait(page);
  const c = await page.evaluate(() => MB.clUpload.state().counts);
  assert.equal(c.committed, 6);
  assert.equal(c.failed, 20);
  assert.equal(failedReq, 20 * 4, 'each failed photo tried 1 + 3 times');
  assert.match(await page.textContent('#sum-body'), /失败[\s\S]*20/);
  assert.equal(await page.isVisible('#retry-failed'), true);
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // 重试：途中暂停 → 不再送新的照片；继续 → 全部完成
  let sent = 0;
  await page.route('**/api/photo**', async (route) => { sent++; await new Promise((r) => setTimeout(r, 150)); return route.continue(); });
  await page.click('#retry-failed');
  await page.waitForFunction(() => MB.clUpload.state().counts.uploaded >= 12);
  await page.click('#pause');
  assert.equal(await page.evaluate(() => MB.clUpload.state().paused), true);
  await page.waitForFunction(() => { const s = MB.clUpload.state(); return s.up === 0 && s.proc === 0; });
  const atPause = sent;
  await page.waitForTimeout(800);
  assert.equal(sent, atPause, 'no new photo requests while paused');
  assert.match(await page.textContent('#run-body'), /已暂停/);
  // 暂停时把已上传的先登记
  await page.waitForFunction(() => MB.clUpload.commits().pending === 0 && !MB.clUpload.commits().busy);
  await page.click('#pause');
  await waitDone(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const idx = index(m);
  assert.equal(byName(idx, 'Klang 现代简约 Mr Ong').n, info.manyN);
  assert.equal(photoBlobs(m).length, info.manyN, 'no duplicates after retries');
  assert.equal(await page.evaluate(() => MB.clUpload.state().counts.failed), 0);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('session expires during an upload → login box, then the upload continues; screen kept awake', async () => {
  const m = await mock();
  const { ctx, page } = await newPage(browser);
  // Headless Chromium 没有 wakeLock：换一个会记次数的假的
  await page.addInitScript(() => {
    window.__wake = { req: 0, rel: 0 };
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: () => { __wake.req++; return Promise.resolve({ release: () => { __wake.rel++; return Promise.resolve(); }, addEventListener() {} }); } }
    });
  });
  await loginOk(page, m.url, 'Ana');
  let n = 0;
  await page.route('**/api/photo**', async (route) => { n++; await new Promise((r) => setTimeout(r, 60)); return route.continue(); });
  await selectFolder(page, dirname(info.many));
  await waitHashed(page);
  await page.click('#start');
  await page.waitForFunction(() => MB.clUpload.state().counts.uploaded >= 5);
  assert.ok(await page.evaluate(() => __wake.req) >= 1, 'wake lock requested while uploading');
  await ctx.clearCookies();
  await page.waitForSelector('#login.overlay:not([hidden])', { timeout: 15000 });
  await page.waitForFunction(() => /登入过期/.test(document.querySelector('#run-note').textContent));
  assert.equal(await page.evaluate(() => MB.clUpload.busy()), true, 'upload is waiting, not lost');
  await page.fill('#login-name', 'Ana');
  await page.fill('#login-pass', PASSWORD);
  await page.click('#login-go');
  await waitDone(page);
  assert.equal(byName(index(m), 'Klang 现代简约 Mr Ong').n, info.manyN);
  assert.equal(photoBlobs(m).length, info.manyN, 'nothing uploaded twice across the re-login');
  assert.equal(await page.evaluate(() => MB.clUpload.state().counts.failed), 0);
  assert.ok(await page.evaluate(() => __wake.rel) >= 1, 'wake lock released when done');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

/* ------------------------------------------------------------
   免费方案的额度：上限以伺服器为准（quota），没有「照样上传」；放不下就自动少传（每个项目先留最重要的）
   ------------------------------------------------------------ */
const MONTH = () => new Date().toISOString().slice(0, 7);
function seedUsage(writes, extra) {
  return { index: Object.assign({ v: 1, rev: 3, base: '', projects: {}, photos: {}, log: [], usage: { [MONTH()]: { writes } } }, extra || {}) };
}
// 比对、分析都好了（精选挑好了）
async function waitSel(page, timeout) {
  await page.waitForFunction(() => { const s = MB.clUpload.selection(); return s.ready && !s.analyzing; }, null, { timeout: timeout || 30000 });
  await page.evaluate(() => MB.clUpload.drawNow());
}
const sel = (page) => page.evaluate(() => MB.clUpload.selection());
const projSel = (s, name) => s.projects.find((p) => p.name === name);
async function openProject(page, name) {
  const i = await page.evaluate((n) => MB.clUpload.state().projects.findIndex((p) => p.name === n), name);
  const gi = await page.evaluate((k) => MB.clUpload.state().projects[k].gi, i);
  await page.click('[data-open="' + gi + '"]');
  await page.waitForSelector('.pg[data-pg="' + gi + '"] .pg-cell');
  return gi;
}
// 在格子里点一张（f = 项目里的路径）
async function tick(page, gi, f) {
  const id = await page.evaluate(([k, f]) => MB.clUpload.state().projects[k].items.find((it) => it.f === f).id, [gi, f]);
  await page.click('.pg[data-pg="' + gi + '"] input[data-pick="' + id + '"]');
  await page.evaluate(() => MB.clUpload.drawNow());
}
async function setN(page, n) {
  await page.fill('#cur-n', String(n));
  await page.press('#cur-n', 'Tab');
  await waitSel(page);
}

test('near the free-plan cap → selection is cut down fairly (best photos of every project first), start works, never a 507; no «照样上传» override', async () => {
  // 这个月已经写了 1,785 次：上限 1,800 → 还剩 15（今天第一次写入还要 1 次备份）
  const m = await mock({ seed: seedUsage(1785) });
  const { ctx, page } = await newPage(browser);
  const got507 = [];
  page.on('response', (r) => { if (r.status() === 507) got507.push(r.url()); });
  await loginOk(page, m.url, 'Ana');
  assert.equal(await page.evaluate(() => MB.cl.cat.quota.writes), 1785, 'quota comes from the server (GET ?view=full)');
  await selectFolder(page, info.root);
  await waitHashed(page);
  await waitSel(page);
  const s = await sel(page);
  assert.equal(s.cur, true, '11 new photos do not fit → curated mode switched itself on');
  // 精选（每个项目最多 6、同一个镜头一张）挑了 4 + 3 + 3 = 10 张，写入要 10 + 3 × 2 = 16 > 14
  // → 每个项目轮流：第 1 张 3 次、之后每张 1 次 → 3 + 3 + 2 = 8 张（14 次）
  assert.equal(s.total, 8);
  assert.equal(s.cut, 2);
  assert.equal(projSel(s, BANG).sel.length, 3);
  assert.equal(projSel(s, VERT).sel.length, 3);
  assert.equal(projSel(s, SETIA).sel.length, 2);
  assert.ok(!projSel(s, SETIA).sel.includes('IMG_0002.jpg') || !projSel(s, SETIA).sel.includes('IMG_0001.jpg'), 'one per shot');
  assert.equal(await page.$('#over-ok'), null, 'the «我知道，照样上传» override is gone');
  const box = await page.textContent('.budget');
  assert.match(box, /这个月还能传约 12 张 · 空间还够约 [\d,]+ 张/);
  assert.match(box, /这个月的额度只够再传约 8 张/);
  assert.match(box, /已先选好每个项目最重要的照片，其余的 2 张下个月再传/);
  assert.match(await page.textContent('#plan-body'), /2 张额度不够，下个月/);
  const est = await page.evaluate(() => MB.clUpload.estimate());
  assert.equal(est.photos, 8);
  assert.equal(est.writes, 8 + 3 * 2 + 1);
  assert.ok(est.writes <= 15);
  assert.equal(await page.isDisabled('#start'), false);
  assert.match(await page.textContent('#start'), /开始上传 8 张/);
  // 自己多勾一张（额度不够的那张）：自己勾的优先，总数还是不超过 —— 别的项目自动挑的让位
  const gi = await openProject(page, SETIA);
  const cutF = projSel(s, SETIA).cut[0];
  await tick(page, gi, cutF);
  const s2 = await sel(page);
  assert.ok(projSel(s2, SETIA).sel.includes(cutF), 'manual tick kept');
  assert.equal(projSel(s2, SETIA).touched, true);
  assert.ok(s2.total <= 8, 'never more than the quota allows: ' + s2.total);
  assert.match(await page.textContent('.pg[data-pg="' + gi + '"] .pg-count'), /选了 3 \/ 5 张/);
  await page.screenshot({ path: shotPath('upload-quota-cut-1440.png'), fullPage: true });
  await startAndWait(page);
  const idx = index(m);
  assert.equal(Object.keys(idx.photos).length, s2.total);
  assert.ok(photosOf(idx, byName(idx, SETIA).pid).some((p) => p.f === cutF), 'the manually ticked photo was uploaded');
  assert.deepEqual(got507, [], 'the server never had to refuse');
  assert.ok(idx.usage[MONTH()].writes <= 1800, 'writes this month ' + idx.usage[MONTH()].writes);
  const c = await page.evaluate(() => MB.clUpload.state().counts);
  assert.equal(c.failed, 0);
  assert.equal(c.skip, 11 - s2.total, 'the rest are «这次不传», not failed');
  assert.match(await page.textContent('#sum-body'), /这次不传/);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('budget: this month\'s writes come from the server\'s quota (the 300-entry log under-counts); the review tab shows them too', async () => {
  const now = Date.now();
  // log 只剩 300 笔「改标签」（之前上传的纪录已经被挤掉）；伺服器的计数说这个月已经写了 1,799 次：一张都不能传了
  const log = Array.from({ length: 300 }, (_, i) => ({ op: 'patch', by: 'X', ts: now - 100000 + i, n: 1 }));
  const m = await mock({ seed: seedUsage(1799, { rev: 300, log }) });
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  const q = await page.evaluate(() => MB.cl.cat.quota);
  assert.equal(q.plan, 'hobby');
  assert.equal(q.writes, 1799);
  assert.equal(q.uploadCap, 1800);
  assert.equal(q.writesLeft, 1);
  await selectFolder(page, dirname(info.soloA));
  await waitHashed(page);
  await waitSel(page);
  const est = await page.evaluate(() => MB.clUpload.estimate());
  assert.equal(est.u.writes, 1799, 'not 300 + 1 from the log');
  assert.equal(est.allowed, 0);
  assert.equal(await page.isDisabled('#start'), true);
  // 储存空间：伺服器算的（照片 + 缩图包 + 清单 × 8 份）
  assert.ok(est.u.bytes >= 7 * JSON.stringify(await page.evaluate(() => MB.cl.cat)).length * 0.9, 'backups counted in storage');
  // 审核分页也看得到这个月用了多少（超过上传上限的 80% → warn）
  await page.click('#tabs [data-tab="review"]');
  await page.waitForFunction(() => /1,799/.test(document.querySelector('#rv-budget').textContent));
  assert.ok(await page.$eval('#rv-budget', (e) => e.classList.contains('warn')));
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('writes at 1,800 → start disabled with the reason (and ticking by hand is refused); space full → reason says free space in 审核', async () => {
  const m = await mock({ seed: seedUsage(1800) });
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  await selectFolder(page, dirname(info.soloA));
  await waitHashed(page);
  await waitSel(page);
  assert.equal(await page.isDisabled('#start'), true);
  assert.match(await page.textContent('#start'), /这个月不能再传了/);
  const plan = await page.textContent('#plan-body');
  assert.match(plan, /这个月的写入次数用完了/);
  assert.match(plan, /下个月 1 号再传/);
  assert.match(plan, /这个月还能传约 0 张/);
  assert.equal((await sel(page)).zero, 'writes');
  assert.equal(await page.evaluate(() => MB.clWork.stats().analyze), 0, 'nothing can be uploaded → no analysis either');
  // 自己勾也不行
  const gi = await openProject(page, 'Ipoh 日式 黄小姐');
  await tick(page, gi, 'A_01.jpg');
  await page.waitForSelector('#toast.on');
  assert.match(await page.textContent('#toast'), /写入次数用完了/);
  assert.equal((await sel(page)).total, 0);
  assert.equal(await page.isChecked('.pg[data-pg="' + gi + '"] .pg-cell input'), false);
  await page.screenshot({ path: shotPath('upload-quota-zero-1440.png'), fullPage: true });
  // 空间满了（写入次数还够）
  await fetch(m.blob + '__mock/usage?writes=100', { method: 'POST' });
  await fetch(m.blob + '__mock/ballast?bytes=' + (950 * 1024 * 1024), { method: 'POST' });
  await selectFolder(page, dirname(info.soloA));
  await waitHashed(page);
  await waitSel(page);
  assert.equal((await sel(page)).zero, 'bytes');
  assert.equal(await page.isDisabled('#start'), true);
  assert.match(await page.textContent('#plan-body'), /空间满了[\s\S]*先到「审核」删除隐藏的照片，释放空间/);
  assert.equal(photoBlobs(m).length, 0, 'nothing uploaded');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('curated mode: N per project, one per shot, spread over sub-folders; a manual tick uploads it; changing N re-picks untouched projects; library photos count toward N', async () => {
  const m = await mock();
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  const CH = info.cheras, KP = info.kepong;
  await selectFolder(page, info.curate);
  await waitHashed(page);
  await waitSel(page);
  // 全部放得下：精选预设关着，14 张全传、也不必分析
  let s = await sel(page);
  assert.equal(s.cur, false);
  assert.equal(s.total, 14);
  assert.equal(await page.evaluate(() => MB.clWork.stats().analyze), 0);
  await page.check('#cur-on');
  await waitSel(page);
  assert.equal(await page.evaluate(() => MB.clWork.stats().analyze), 14, 'every new photo analysed once (2 workers)');
  s = await sel(page);
  assert.equal(s.curN, 6, 'default N = MB.clPick.DEFAULT_N');
  const room = (f) => f.split('/')[0];
  const ch = projSel(s, CH).sel;
  assert.equal(ch.length, 6, 'Cheras: 9 photos / 7 shots → 6');
  assert.ok(!(ch.includes('厨房/K_01.jpg') && ch.includes('厨房/K_01b.jpg')), 'one per shot (K_01)');
  assert.ok(!(ch.includes('主卧/M_01.jpg') && ch.includes('主卧/M_01b.jpg')), 'one per shot (M_01)');
  assert.deepEqual([...new Set(ch.map(room))].sort(), ['主卧', '厨房', '电视墙'].sort(), 'every room gets a photo');
  assert.equal(projSel(s, KP).sel.length, 5);
  // N = 2：每个项目重挑 —— 照片最多的两个空间各一张
  await setN(page, 2);
  s = await sel(page);
  assert.deepEqual(projSel(s, CH).sel.map(room).sort(), ['主卧', '厨房'].sort());
  assert.ok(projSel(s, CH).sel.includes('厨房/K_01.jpg') || projSel(s, CH).sel.includes('厨房/K_02.jpg'), 'a landscape kitchen photo, not the tall one: ' + projSel(s, CH).sel);
  assert.equal(projSel(s, KP).sel.length, 2);
  // 展开 Cheras：小图（看得到的才做）、预选的打勾、「选了 2 / 9 张」
  const gi = await openProject(page, CH);
  await page.waitForFunction((g) => [...document.querySelectorAll('.pg[data-pg="' + g + '"] .pg-img img')].filter((i) => (i.getAttribute('src') || '').startsWith('blob:')).length >= 9, gi, { timeout: 20000 });
  assert.match(await page.textContent('.pg[data-pg="' + gi + '"] .pg-count'), /选了 2 \/ 9 张/);
  assert.equal(await page.$$eval('.pg[data-pg="' + gi + '"] .pg-cell.sel', (els) => els.length), 2);
  assert.match(await page.textContent('.pg[data-pg="' + gi + '"]'), /同一个镜头，已挑一张/);
  // 自己勾一张电视墙的 → 这个项目之后照自己勾的
  await tick(page, gi, '电视墙/T_01.jpg');
  s = await sel(page);
  assert.equal(projSel(s, CH).touched, true);
  assert.ok(projSel(s, CH).sel.includes('电视墙/T_01.jpg'));
  assert.equal(projSel(s, CH).sel.length, 3);
  assert.match(await page.textContent('.pg[data-pg="' + gi + '"] .pg-count'), /选了 3 \/ 9 张/);
  // N = 4：自己动过的不变，没动过的重挑
  await setN(page, 4);
  s = await sel(page);
  assert.equal(projSel(s, CH).sel.length, 3, 'touched project keeps the manual picks');
  assert.equal(projSel(s, KP).sel.length, 4, 'untouched project re-picked');
  await page.screenshot({ path: shotPath('upload-curated-1440.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: shotPath('upload-curated-390.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const chosen = projSel(s, CH).sel.slice().sort();
  // 收起：小图放掉
  assert.ok(await page.evaluate(() => MB.clUpload.previewUrls()) >= 9);
  await page.click('[data-open="' + gi + '"]');
  assert.equal(await page.evaluate(() => MB.clUpload.previewUrls()), 0, 'object URLs revoked when collapsed');
  await startAndWait(page);
  let idx = index(m);
  assert.deepEqual(photosOf(idx, byName(idx, CH).pid).map((p) => p.f).sort(), chosen);
  assert.equal(byName(idx, KP).n, 4);
  assert.equal(photoBlobs(m).length, 7, 'only the picked photos were uploaded');
  // 再拖一次同一个文件夹：不必再分析（IndexedDB 快取）；库里的算在 N 里 —— Cheras 已有 3 张 → 只再挑 1 张，Kepong 已有 4 张 → 0
  const anBefore = await page.evaluate(() => MB.clWork.stats().analyze);
  await selectFolder(page, info.curate);
  await waitHashed(page);
  await page.check('#cur-on');
  await waitSel(page);
  assert.equal(await page.evaluate(() => MB.clWork.stats().analyze), anBefore, 'analysis comes from the IndexedDB cache');
  s = await sel(page);
  assert.equal(s.curN, 4, 'N is remembered');
  assert.equal(projSel(s, CH).existing, 3);
  assert.equal(projSel(s, CH).sel.length, 1);
  assert.equal(projSel(s, KP).existing, 4);
  assert.deepEqual(projSel(s, KP).sel, []);
  // 跟库里同一个镜头的连拍不挑
  for (const f of projSel(s, CH).sel) assert.ok(!/_01b/.test(f) || !chosen.includes(f.replace('b.jpg', '.jpg')), 'not a burst of a library photo: ' + f);
  assert.match(await page.textContent('#start'), /开始上传 1 张/);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('purged photos (删过) are not uploaded again by default; ticking one by hand uploads it', async () => {
  const m = await mock();
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  await selectFolder(page, dirname(info.soloA));
  await waitHashed(page);
  await startAndWait(page);
  const idx0 = index(m);
  const pid = byName(idx0, 'Ipoh 日式 黄小姐').pid;
  const gone = photosOf(idx0, pid).filter((p) => p.f === 'A_01.jpg' || p.f === 'A_02.jpg').map((p) => p.hash);
  // 审核页的「删除隐藏的照片」：先隐藏、再删
  const r = await page.evaluate(async (hs) => {
    const post = (b) => fetch('/api/catalog', { method: 'POST', headers: { 'X-VISI': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((x) => x.json());
    await post({ op: 'hide', photos: hs });
    return post({ op: 'purge', photos: hs, confirm: '删除' });
  }, gone);
  assert.equal(r.removed, 2);
  await page.evaluate(() => MB.cl.loadCatalog(true));
  assert.deepEqual((await page.evaluate(() => MB.cl.cat.purged)).slice().sort(), gone.slice().sort());
  m.adapter.resetStats();
  await selectFolder(page, dirname(info.soloA));
  await waitHashed(page);
  await waitSel(page);
  let s = await sel(page);
  assert.deepEqual(projSel(s, 'Ipoh 日式 黄小姐').purged.sort(), ['A_01.jpg', 'A_02.jpg']);
  assert.equal(s.total, 0);
  assert.match(await page.textContent('#plan-body'), /删过 2 张（不重传）/);
  assert.equal(await page.isDisabled('#start'), true);
  assert.match(await page.textContent('#start'), /没有新照片要传/);
  const gi = await openProject(page, 'Ipoh 日式 黄小姐');
  assert.match(await page.textContent('.pg[data-pg="' + gi + '"]'), /删过，不重传/);
  assert.match(await page.textContent('.pg[data-pg="' + gi + '"]'), /已在库里/);
  await tick(page, gi, 'A_02.jpg');
  s = await sel(page);
  assert.deepEqual(projSel(s, 'Ipoh 日式 黄小姐').sel, ['A_02.jpg']);
  assert.match(await page.textContent('#start'), /开始上传 1 张/);
  await startAndWait(page);
  const idx = index(m);
  assert.equal(byName(idx, 'Ipoh 日式 黄小姐').n, 3);
  assert.ok(photosOf(idx, pid).some((p) => p.f === 'A_02.jpg'));
  assert.ok(!photosOf(idx, pid).some((p) => p.f === 'A_01.jpg'), 'the other purged photo stays gone');
  assert.equal(m.adapter.stats().puts, 1 + 1 + 1, 'one photo + its thumb pack + the index');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('Pro plan (BLOB_PLAN=pro): no limits, no auto curated mode, «Pro 方案：不限额度»', async () => {
  const old = process.env.BLOB_PLAN;
  process.env.BLOB_PLAN = 'pro';
  try {
    const m = await mock({ seed: seedUsage(5000) });
    const { ctx, page } = await newPage(browser);
    await loginOk(page, m.url, 'Ana');
    assert.equal(await page.evaluate(() => MB.cl.cat.quota.plan), 'pro');
    await selectFolder(page, info.root);
    await waitHashed(page);
    await waitSel(page);
    const s = await sel(page);
    assert.equal(s.plan, 'pro');
    assert.equal(s.cur, false);
    assert.equal(s.total, 11);
    assert.equal(s.cut, 0);
    assert.equal(s.allowed, null);
    const box = await page.textContent('.budget');
    assert.match(box, /Pro 方案：不限额度/);
    assert.doesNotMatch(box, /这个月还能传/);
    assert.equal(await page.$('.budget .b-warn'), null);
    assert.match(await page.textContent('#start'), /开始上传 11 张/);
    await startAndWait(page);
    assert.equal(Object.keys(index(m).photos).length, 11);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  } finally {
    if (old == null) delete process.env.BLOB_PLAN; else process.env.BLOB_PLAN = old;
  }
});

test('free-plan cap hit mid-run (507 quota) → stops cleanly (no retry storm), uploaded photos are registered, the rest wait for next month', async () => {
  const m = await mock();
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  await page.evaluate(() => { MB.cl.backoff = function () { return 40; }; });
  let ok = 0, refused = 0;
  await page.route('**/api/photo**', (route) => {
    if (ok < 6) { ok++; return route.continue(); }
    refused++;
    return route.fulfill({ status: 507, contentType: 'application/json', body: '{"error":"quota","reason":"writes","writesLeft":0,"bytesLeft":900000000}' });
  });
  await selectFolder(page, dirname(info.many));
  await waitHashed(page);
  await startAndWait(page, 60000);
  const S = await page.evaluate(() => { const s = MB.clUpload.state(); return { fatal: s.fatal, kind: s.stopKind, counts: s.counts, wait: s.items.filter((it) => it.st === 'wait').length }; });
  assert.equal(S.kind, 'quota');
  assert.match(S.fatal, /这个月的免费额度快用完了，已经自动停下来，免得 Vercel 把案例库停权/);
  assert.match(S.fatal, /传好的照片都已经登记/);
  assert.match(S.fatal, /下个月再传/);
  assert.ok(refused <= 3, 'stopped right away (only the uploads already in flight): ' + refused);
  assert.equal(S.counts.failed, 0, 'not failed — still to do');
  assert.ok(S.wait >= 17, 'the rest stay waiting: ' + S.wait);
  const idx = index(m);
  assert.equal(byName(idx, 'Klang 现代简约 Mr Ong').n, 6, 'the 6 uploaded photos are registered');
  assert.equal(await page.evaluate(() => Object.keys(MB.clUpload.journal()).length), 0);
  assert.match(await page.textContent('#sum-body'), /上传停止了[\s\S]*免费额度快用完了/);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('507 on registration → the uploaded photos stay in this computer\'s journal (one try, no retry storm) and are registered next time', async () => {
  const m = await mock();
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  await page.evaluate(() => { MB.cl.backoff = function () { return 40; }; });
  let posts = 0;
  await page.route('**/api/catalog', (route) => {
    if (route.request().method() === 'GET') return route.continue();
    posts++;
    return route.fulfill({ status: 507, contentType: 'application/json', body: '{"error":"quota","reason":"writes","writesLeft":0,"bytesLeft":900000000}' });
  });
  await selectFolder(page, dirname(info.soloA));
  await waitHashed(page);
  await startAndWait(page, 60000);
  assert.equal(posts, 1);
  assert.equal(await page.evaluate(() => Object.keys(MB.clUpload.journal()).length), 4);
  assert.equal(await page.evaluate(() => MB.clUpload.commits().halt), true);
  assert.equal(index(m), null, 'nothing registered');
  assert.match(await page.textContent('#sum-body'), /还有 4 张已经传上去、还没登记：资料留在这台电脑，下次打开这一页会自动补登记/);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  // 下次打开：自动补登记（不重传）
  await page.reload();
  await page.waitForSelector('#tabs:not([hidden])');
  await page.waitForFunction(() => /补登记好了/.test(document.querySelector('#up-recover').textContent), null, { timeout: 15000 });
  assert.equal(byName(index(m), 'Ipoh 日式 黄小姐').n, 4);
  assert.equal(photoBlobs(m).length, 4);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

/* ---------- 读不到的档、空间不够、开始时额度变少、分析失败、伺服器没设定好、连拍 ---------- */
const BURST = {};       // 两个连拍测试共用：dHash、精选挑了哪几张
// 比对完（读不到的也算）
async function waitSettled(page, timeout) {
  await page.waitForFunction(() => {
    const S = MB.clUpload.state();
    return S.scan && !S.hashing && S.items.every((it) => !it.p.include || it.h || it.hashErr);
  }, null, { timeout: timeout || 60000 });
  await page.evaluate(() => MB.clUpload.drawNow());
}
const PER_PHOTO = (200 + 30) * 1024;     // upload.js 的 EST_PHOTO + EST_THUMB

test('a photo that cannot be read (changed on disk after choosing the folder) is listed and skipped — it does not lock the start button near the cap', async () => {
  // 复制一份（要改档案的修改时间：Chromium 读到的 File 跟磁碟上的不一样就读不到）
  const dir = join(BASE, 'unread-' + process.pid);
  rmSync(dir, { recursive: true, force: true });
  cpSync(info.soloA, join(dir, 'Ipoh 日式 黄小姐'), { recursive: true });
  const f3 = join(dir, 'Ipoh 日式 黄小姐', 'A_03.jpg');
  utimesSync(f3, 1700000000, 1700000000);
  // 这个月已写 1,795 次：还剩 5（今天第一次写入还要 1 次备份）→ 4 次 → 3 张新照片放不下（3 + 2 = 5）
  const m = await mock({ seed: seedUsage(1795) });
  const { ctx, page } = await newPage(browser);
  const got507 = [];
  page.on('response', (r) => { if (r.status() === 507) got507.push(r.url()); });
  await loginOk(page, m.url, 'Ana');
  // 选好文件夹、还没开始比对时（先扣住清单）把 A_03 改掉
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route((u) => u.pathname === '/api/catalog', async (route) => { if (route.request().method() === 'GET') await held; return route.continue(); });
  await selectFolder(page, dir);
  await page.waitForTimeout(200);
  utimesSync(f3, 1700000100, 1700000100);
  release();
  await waitSettled(page);
  await waitSel(page);
  let s = await sel(page);
  const P = projSel(s, 'Ipoh 日式 黄小姐');
  assert.deepEqual(P.unread, ['A_03.jpg']);
  assert.equal(s.hashedAll, true, 'a file that cannot be read counts as settled');
  assert.equal(s.cur, true, '3 readable new photos do not fit → curated mode on');
  assert.equal(s.total, 2, '4 writes = first photo 3 + second 1');
  assert.equal(s.cutBy, 'writes');
  const plan = await page.textContent('#plan-body');
  assert.match(plan, /✓ 比对完成：3 张新照片/);
  assert.match(plan, /1 张读不到，这次不传：Ipoh 日式 黄小姐\/A_03\.jpg/);
  assert.match(plan, /这个月的额度只够再传约 2 张/);
  assert.equal(await page.isDisabled('#start'), false);
  assert.match(await page.textContent('#start'), /开始上传 2 张/);
  const gi = await openProject(page, 'Ipoh 日式 黄小姐');
  const cell = await page.evaluate((g) => {
    const it = MB.clUpload.state().projects[g].items.find((x) => x.f === 'A_03.jpg');
    const c = document.querySelector('.pg[data-pg="' + g + '"] .pg-cell[data-id="' + it.id + '"]');
    return { badge: c.querySelector('.pg-badge').textContent, disabled: c.querySelector('input').disabled };
  }, gi);
  assert.deepEqual(cell, { badge: '读不到', disabled: true });
  await page.screenshot({ path: shotPath('upload-unread-1440.png'), fullPage: true });
  await startAndWait(page);
  const idx = index(m);
  assert.equal(Object.keys(idx.photos).length, 2);
  assert.deepEqual(got507, []);
  const c = await page.evaluate(() => MB.clUpload.state().counts);
  assert.equal(c.failed, 0);
  assert.equal(c.bad, 1);
  assert.match(await page.textContent('#sum-body'), /没传成功的（1）[\s\S]*A_03\.jpg[\s\S]*读不到这个档/);
  // 再选一次：又在比对前被改了 → 读不到；改回来 →「再读一次」就读得到
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  let release2;
  const held2 = new Promise((r) => { release2 = r; });
  await page.route((u) => u.pathname === '/api/catalog', async (route) => { if (route.request().method() === 'GET') await held2; return route.continue(); });
  await selectFolder(page, dir);
  await page.waitForTimeout(200);
  utimesSync(f3, 1700000200, 1700000200);
  release2();
  await waitSettled(page);
  assert.deepEqual(projSel(await sel(page), 'Ipoh 日式 黄小姐').unread, ['A_03.jpg']);
  utimesSync(f3, 1700000100, 1700000100);
  await page.click('#rehash');
  await waitSettled(page);
  s = await sel(page);
  assert.deepEqual(projSel(s, 'Ipoh 日式 黄小姐').unread, [], '«再读一次» reads it once the file is back');
  assert.ok(await page.evaluate(() => !!MB.clUpload.state().items.find((it) => it.f === 'A_03.jpg').h));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  assert.deepEqual(page.errors, []);
  await ctx.close();
  rmSync(dir, { recursive: true, force: true });
});

test('space (not writes) is the limit → the plan says «空间只够», tells you to free space in 审核 (not «下个月»); a 507 bytes mid-run says the same', async () => {
  const m = await mock();
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  // 空间只剩约 2.5 张（写入次数还很多）
  const left = await page.evaluate(() => MB.cl.cat.quota.bytesLeft);
  await fetch(m.blob + '__mock/ballast?bytes=' + Math.floor(left - 2.5 * PER_PHOTO), { method: 'POST' });
  photoMod.resetQuotaCache();
  await page.evaluate(() => MB.cl.loadCatalog(true));
  await selectFolder(page, dirname(info.soloA));
  await waitHashed(page);
  await waitSel(page);
  const s = await sel(page);
  assert.equal(s.M, 2);
  assert.ok(s.N > 100);
  assert.equal(s.total, 2);
  assert.equal(s.cut, 2);
  assert.equal(s.cutBy, 'bytes');
  const box = await page.textContent('.budget');
  assert.match(box, /空间只够再传约 2 张/);
  assert.match(box, /先到「审核」删除隐藏的照片，释放空间，再拖同一个文件夹接着传/);
  assert.doesNotMatch(box, /下个月/);
  const plan = await page.textContent('#plan-body');
  assert.match(plan, /2 张空间不够/);
  assert.doesNotMatch(plan, /额度不够，下个月/);
  const gi = await openProject(page, 'Ipoh 日式 黄小姐');
  assert.match(await page.textContent('.pg[data-pg="' + gi + '"]'), /空间不够/);
  assert.doesNotMatch(await page.textContent('.pg[data-pg="' + gi + '"]'), /下个月/);
  // 自己多勾一张：空间不够
  await tick(page, gi, projSel(s, 'Ipoh 日式 黄小姐').cut[0]);
  await page.waitForSelector('#toast.on');
  assert.match(await page.textContent('#toast'), /空间只够这次传约 2 张/);
  await page.screenshot({ path: shotPath('upload-space-cut-1440.png'), fullPage: true });
  await startAndWait(page);
  assert.equal(Object.keys(index(m).photos).length, 2 + 1, '2 photos + the ballast');
  await ctx.close();

  // 上传中伺服器说空间满了（507 reason bytes）
  const m2 = await mock();
  const two = await newPage(browser);
  await loginOk(two.page, m2.url, 'Ana');
  let ok = 0;
  await two.page.route('**/api/photo**', (route) => {
    if (ok < 2) { ok++; return route.continue(); }
    return route.fulfill({ status: 507, contentType: 'application/json', body: '{"error":"quota","reason":"bytes","writesLeft":1500,"bytesLeft":1000}' });
  });
  await selectFolder(two.page, dirname(info.many));
  await waitHashed(two.page);
  await startAndWait(two.page, 60000);
  const fatal = await two.page.evaluate(() => MB.clUpload.state().fatal);
  assert.match(fatal, /案例库的空间快满了，已经自动停下来/);
  assert.match(fatal, /传好的照片都已经登记/);
  assert.match(fatal, /先到「审核」删除隐藏的照片，释放空间/);
  assert.doesNotMatch(fatal, /下个月/);
  assert.equal(byName(index(m2), 'Klang 现代简约 Mr Ong').n, 2);
  await two.page.unrouteAll({ behavior: 'ignoreErrors' });
  assert.deepEqual(page.errors.concat(two.page.errors), []);
  await two.ctx.close();
});

test('quota shrinks between plan and start (someone else uploaded) with curated mode off and nothing analysed → the run is trimmed before it starts, never a 507', async () => {
  // 1,700 次：26 张全放得下（精选关着、不分析）
  const m = await mock({ seed: seedUsage(1700) });
  const { ctx, page } = await newPage(browser);
  const got507 = [];
  page.on('response', (r) => { if (r.status() === 507) got507.push(r.url()); });
  await loginOk(page, m.url, 'Ana');
  await selectFolder(page, dirname(info.many));
  await waitHashed(page);
  await waitSel(page);
  const s = await sel(page);
  assert.equal(s.cur, false);
  assert.equal(s.total, 26);
  assert.equal(await page.evaluate(() => MB.clWork.stats().analyze), 0);
  // 别人刚好用掉了：剩 15 次（-1 备份 = 14 → 3 + 11 = 12 张）
  await fetch(m.blob + '__mock/usage?writes=1785', { method: 'POST' });
  photoMod.resetQuotaCache();
  await startAndWait(page, 60000);
  const st = await page.evaluate(() => { const x = MB.clUpload.state(); return { counts: x.counts, fatal: x.fatal, note: x.note }; });
  assert.deepEqual(got507, [], 'trimmed before uploading, the server never had to refuse');
  assert.equal(st.fatal, '');
  assert.equal(st.counts.committed, 12);
  assert.equal(st.counts.skip, 14);
  assert.equal(st.counts.failed, 0);
  const idx = index(m);
  assert.ok(idx.usage[MONTH()].writes <= 1800, 'writes this month ' + idx.usage[MONTH()].writes);
  // 没分析过：照档名顺序留
  assert.deepEqual(photosOf(idx, byName(idx, 'Klang 现代简约 Mr Ong').pid).map((p) => p.f).sort(),
    Array.from({ length: 12 }, (_, i) => 'K' + String(i + 1).padStart(2, '0') + '.jpg'));
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('analysis that fails (decode) is not remembered; outside curated mode the photo is still uploaded, and it can be ticked by hand', async () => {
  const m = await mock();
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  // 分析时暂时读不出 A_02（像记忆体不够）；压图时读得出来
  await page.evaluate(() => {
    const orig = MB.clWork.analyze;
    MB.clWork.analyze = function (f, o) {
      if (f.name === 'A_02.jpg') { const e = new Error('decode'); e.code = 'decode'; return Promise.reject(e); }
      return orig(f, o);
    };
  });
  await selectFolder(page, dirname(info.soloA));
  await waitHashed(page);
  await page.check('#cur-on');
  await waitSel(page);
  let s = await sel(page);
  let P = projSel(s, 'Ipoh 日式 黄小姐');
  assert.equal(P.bad, 1);
  assert.equal(P.sel.length, 3, 'curated mode does not pick the photo it could not read');
  assert.ok(!P.sel.includes('A_02.jpg'));
  assert.match(await page.textContent('#plan-body'), /1 张读不出来，不挑/);
  const rec = await page.evaluate(() => MB.clStore.all('files'));
  assert.equal(rec.filter((r) => r.bad).length, 0, 'a failed analysis is not saved in IndexedDB');
  // 精选关掉：照样排进上传
  await page.uncheck('#cur-on');
  await waitSel(page);
  s = await sel(page);
  assert.equal(s.total, 4);
  assert.ok(projSel(s, 'Ipoh 日式 黄小姐').sel.includes('A_02.jpg'));
  // 精选打开、自己勾回来
  await page.check('#cur-on');
  await waitSel(page);
  const gi = await openProject(page, 'Ipoh 日式 黄小姐');
  const id = await page.evaluate((g) => MB.clUpload.state().projects[g].items.find((x) => x.f === 'A_02.jpg').id, gi);
  assert.equal(await page.isDisabled('.pg[data-pg="' + gi + '"] input[data-pick="' + id + '"]'), false, 'can be ticked by hand');
  assert.match(await page.textContent('.pg[data-pg="' + gi + '"] .pg-cell[data-id="' + id + '"] .pg-badge'), /读不出来/);
  await tick(page, gi, 'A_02.jpg');
  s = await sel(page);
  assert.ok(projSel(s, 'Ipoh 日式 黄小姐').sel.includes('A_02.jpg'));
  await startAndWait(page);
  const idx = index(m);
  assert.equal(byName(idx, 'Ipoh 日式 黄小姐').n, 4);
  assert.ok(photosOf(idx, byName(idx, 'Ipoh 日式 黄小姐').pid).some((p) => p.f === 'A_02.jpg'), 'uploaded: compressing decided, not the failed analysis');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('the catalog answers 503 not_configured → plain words (ask the boss to set up Vercel), no code, no «check the network»', async () => {
  const m = await mock();
  const { ctx, page } = await newPage(browser);
  await page.route((u) => u.pathname === '/api/catalog', (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"not_configured"}' });
  });
  await login(page, m.url, 'Ana');
  await page.waitForSelector('#tabs:not([hidden])');
  await selectFolder(page, dirname(info.soloA));
  await page.waitForFunction(() => MB.cl.catErr && MB.cl.catErr.code === 'not_configured');
  await page.waitForTimeout(300);
  await page.evaluate(() => MB.clUpload.drawNow());
  assert.equal(await page.isDisabled('#start'), true);
  assert.match(await page.textContent('#start'), /现在不能上传/);
  const why = await page.textContent('.go-why');
  assert.match(why, /请老板到 Vercel 设定好/);
  assert.doesNotMatch(why, /not_configured|503|请检查网路/);
  assert.doesNotMatch(await page.textContent('#toast'), /not_configured/);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('near-duplicates: a burst with something small added is one shot (curated picks one)', async () => {
  const m = await mock();
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  await selectFolder(page, dirname(info.burst));
  await waitHashed(page);
  await page.check('#cur-on');
  await waitSel(page);
  const dh = await page.evaluate(() => { const o = {}; MB.clUpload.state().items.forEach((it) => { o[it.f] = it.dh; }); return o; });
  BURST.dh = dh;
  BURST.sel = projSel(await sel(page), info.burstName).sel;
  const SAME = await page.evaluate(() => MB.clPick.SAME_SHOT);
  assert.ok(hamming(dh['IMG_A.jpg'], dh['IMG_A_burst.jpg']) <= SAME, 'burst distance ' + hamming(dh['IMG_A.jpg'], dh['IMG_A_burst.jpg']));
  assert.ok(hamming(dh['IMG_A.jpg'], dh['IMG_B.jpg']) > SAME);
  BURST.same = SAME;
  assert.ok(!(BURST.sel.includes('IMG_A.jpg') && BURST.sel.includes('IMG_A_burst.jpg')), 'one per shot: ' + BURST.sel);
  assert.ok(BURST.sel.includes('IMG_B.jpg'));
  assert.deepEqual(page.errors, []);
  await ctx.close();
});
// 裁 2%、亮 8% 的连拍（手动了一点再拍）在 1200px 下 dHash 差 7 左右：精选的门槛是 8（伺服器分组仍是 6），只挑一张
test('near-duplicates: a slightly re-framed burst (crop 2 %, 8 % brighter) is one shot', () => {
  assert.ok(BURST.dh, 'previous test ran');
  const d = hamming(BURST.dh['IMG_A.jpg'], BURST.dh['IMG_A_reframed.jpg']);
  assert.ok(d <= BURST.same, 're-framed burst distance ' + d + ' > ' + BURST.same);
  assert.ok(!(BURST.sel.includes('IMG_A.jpg') && BURST.sel.includes('IMG_A_reframed.jpg')), 'one per shot: ' + BURST.sel);
});

test('Blob stops taking writes mid-upload (503 storage_blocked) → the run stops with a clear message instead of grinding on', async () => {
  const m = await mock();
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  await page.evaluate(() => { MB.cl.backoff = function () { return 40; }; });
  let ok = 0, blockedReq = 0;
  await page.route('**/api/photo**', (route) => {
    if (ok < 4) { ok++; return route.continue(); }
    blockedReq++;
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"storage_blocked","message":"BlobStoreSuspendedError: Vercel Blob: This store has been suspended."}' });
  });
  await selectFolder(page, dirname(info.many));
  await waitHashed(page);
  await startAndWait(page, 60000);
  const S = await page.evaluate(() => { const s = MB.clUpload.state(); return { fatal: s.fatal, counts: s.counts, wait: s.items.filter((it) => it.st === 'wait').length }; });
  assert.match(S.fatal, /Vercel Blob 暂停了写入/);
  assert.match(S.fatal, /suspended/);
  assert.ok(blockedReq <= 4, 'stopped right away (no 4 tries × every remaining photo): ' + blockedReq);
  assert.equal(S.counts.failed, 0, 'photos are not marked failed — they are still to do');
  assert.ok(S.wait >= 20, 'the rest stay waiting: ' + S.wait);
  assert.match(await page.textContent('#sum-body'), /上传停止了[\s\S]*Vercel Blob 暂停了写入/);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('Blob rate limit (429 storage_busy, retryAfter) → waits the time the server asked for', async () => {
  const m = await mock();
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  await page.evaluate(() => { MB.cl.backoff = function () { return 40; }; });
  const times = [];
  await page.route('**/api/photo**', (route) => {
    times.push(Date.now());
    if (times.length === 1) return route.fulfill({ status: 429, contentType: 'application/json', headers: { 'Retry-After': '2' }, body: '{"error":"storage_busy","retryAfter":2,"message":"rate limited"}' });
    return route.continue();
  });
  await selectFolder(page, dirname(info.soloA));
  await waitHashed(page);
  await startAndWait(page, 60000);
  assert.equal(byName(index(m), 'Ipoh 日式 黄小姐').n, 4);
  // 第一张被限流：同一张的下一次至少等 2 秒（不是 40 ms 的退避）
  const firstRetry = times.slice(1).find((t, i) => t - times[0] >= 1900);
  assert.ok(firstRetry, 'a retry came ≥ 2 s later: ' + times.map((t) => t - times[0]).join(','));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('reload right after committing while the CDN still serves the old catalog → nothing is uploaded again', async () => {
  const m = await mock();
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  const stale = await page.evaluate(async () => { const r = await fetch('/api/catalog?view=full', { cache: 'no-store' }); return { body: await r.text(), etag: r.headers.get('ETag') }; });
  await selectFolder(page, dirname(info.soloA));
  await waitHashed(page);
  await startAndWait(page);
  assert.equal(byName(index(m), 'Ipoh 日式 黄小姐').n, 4);
  // 公开 Blob 的 CDN：一分钟内还给写入前的清单
  await page.route((u) => u.pathname === '/api/catalog' && u.searchParams.get('view') === 'full', (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', headers: { ETag: stale.etag }, body: stale.body });
  });
  await page.reload();
  await page.waitForSelector('#tabs:not([hidden])');
  await page.waitForFunction(() => MB.cl.cat);
  m.adapter.resetStats();
  await selectFolder(page, dirname(info.soloA));
  await waitHashed(page);
  assert.equal(await page.evaluate(() => MB.cl.cat.rev), 0, 'really got the stale catalog');
  assert.match(await page.textContent('#plan-body'), /0 张新照片 · 已在库里 4 张/);
  assert.equal(await page.isDisabled('#start'), true);
  assert.equal(m.adapter.stats().puts, 0, 'zero Blob writes');
  assert.ok(await page.evaluate(() => MB.cl.minRev) >= 1, 'minRev restored from IndexedDB');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('login: too many wrong passwords → «密码错太多次» (429), the right one is blocked too', async () => {
  const session = await import(new URL('../../../invite/api/session.js', import.meta.url).href);
  session.resetLoginLimiter();
  try {
    const m = await mock();
    for (let i = 0; i < 5; i++) {
      const r = await fetch(m.url + '/api/session', { method: 'POST', headers: { 'X-VISI': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X', password: 'guess' + i }) });
      assert.equal(r.status, 401);
    }
    const { ctx, page } = await newPage(browser);
    await login(page, m.url, 'Ana');
    await page.waitForSelector('#login-err.on');
    assert.match(await page.textContent('#login-err'), /密码错太多次了.*约 10 分钟后再试/);
    assert.equal(await page.isHidden('#tabs'), true);
    await ctx.close();
  } finally {
    session.resetLoginLimiter();
  }
});
