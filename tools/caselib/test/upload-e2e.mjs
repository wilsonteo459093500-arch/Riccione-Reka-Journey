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
import { startMock } from '../mock-server.mjs';
import {
  fixtures, launch, newPage, login, loginOk, selectFolder, waitHashed, startAndWait, waitDone,
  index, photoBlobs, packBlobs, sha16, hamming, byName, photosOf, shotPath, PASSWORD
} from './upload-kit.mjs';

const SETIA = 'Setia Alam 原木 陈先生';
const VERT = 'M Vertica 奶油风 林太太';
const BANG = 'Bangsar 轻法式 Mr Tan';

let info, browser;
const mocks = [];
async function mock(opts) {
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
  // 6000×4000 → 1600 长边，≤ 3.5 MB
  const big = photosOf(idx, pV.pid).find((p) => p.f === 'big_6000.jpg');
  assert.deepEqual([big.w, big.h], [1600, 1067]);
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
    assert.ok(Math.max(ph.w, ph.h) <= 1600);
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
  assert.match(budget0, /本月 Blob 写入约 [\d,]+ \/ 2,000/);
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
  const n = (t) => +t.replace(/[^\d/]/g, '').split('/')[0];
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

test('over the Hobby budget → clear warning, start needs «我知道»', async () => {
  const now = Date.now();
  const m = await mock({ seed: { index: { v: 1, rev: 3, base: '', projects: {}, photos: {}, log: [{ op: 'addPhotos', by: 'X', ts: now - 1000, n: 1995 }] } } });
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  await selectFolder(page, dirname(info.soloA));
  await waitHashed(page);
  const est = await page.evaluate(() => MB.clUpload.estimate());
  assert.equal(est.u.writes, 1995 + 2 + 1);
  assert.equal(est.over, true);
  assert.equal(await page.isVisible('.budget.over .b-warn'), true);
  assert.match(await page.textContent('.b-warn'), /超过免费额度/);
  assert.equal(await page.isDisabled('#start'), true);
  await page.check('#over-ok');
  await page.waitForFunction(() => !document.querySelector('#start').disabled);
  await page.screenshot({ path: shotPath('upload-over-budget-1440.png'), fullPage: true });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('budget: this month\'s writes come from the server counter (the 300-entry log under-counts)', async () => {
  const now = Date.now();
  const month = new Date().toISOString().slice(0, 7);
  // log 只剩 300 笔「改标签」（之前上传的纪录已经被挤掉）；伺服器的计数说这个月已经写了 1,997 次（再传 4 张就超过）
  const log = Array.from({ length: 300 }, (_, i) => ({ op: 'patch', by: 'X', ts: now - 100000 + i, n: 1 }));
  const m = await mock({ seed: { index: { v: 1, rev: 300, base: '', projects: {}, photos: {}, log, usage: { [month]: { writes: 1997 } } } } });
  const { ctx, page } = await newPage(browser);
  await loginOk(page, m.url, 'Ana');
  await selectFolder(page, dirname(info.soloA));
  await waitHashed(page);
  const est = await page.evaluate(() => MB.clUpload.estimate());
  assert.equal(est.u.writes, 1997, 'not 300 + 1 from the log');
  assert.equal(est.over, true);
  assert.equal(await page.isDisabled('#start'), true);
  // 储存空间也算每天的备份（最多 7 份整份清单）
  assert.ok(est.u.bytes >= 7 * JSON.stringify(await page.evaluate(() => MB.cl.cat)).length * 0.9, 'backups counted in storage');
  // 审核分页也看得到这个月用了多少
  await page.click('#tabs [data-tab="review"]');
  await page.waitForFunction(() => /1,997/.test(document.querySelector('#rv-budget').textContent));
  assert.ok(await page.$eval('#rv-budget', (e) => e.classList.contains('warn')));
  assert.deepEqual(page.errors, []);
  await ctx.close();
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
