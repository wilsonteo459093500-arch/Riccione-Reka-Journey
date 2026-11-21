// 浏览器测试（体检第 4 阶段「资料不丢」，2026-11-21）：真的开 Chromium 点一遍首页的「资料安全」。
// npm run test:browser 会跑（在展厅播放那一份后面）。自己起 Vite、建样例项目，全过才退出 0。
//
//   1. 首页：长期保存的状态、7 天没备份的项目变黄、顶部说「N 个项目该备份了」；没人用的图片自动清掉并说腾出多少
//   2. 项目卡片上的「备份」：下载一份，卡片变成「已备份 · 刚刚」
//   3. 恢复同一个项目的备份：问「更新原项目 / 另存一份」—— 更新不会多出一份；另存多一份「副本」；这台电脑上没有 → 不问，照原 id 恢复
//   4. 全部备份到资料夹（用浏览器自带的私有资料夹代替真的资料夹）：每个项目一个文件；没改过的第二次不重写；改过名的旧文件换掉
//   5. 打包成一个文件 → 再恢复：已经有的默认跳过
//   6. Material Board 页的「下载画板和材质库的备份」→ 首页恢复：合并，不重复
//   7. 正在编辑的项目，它换下来的图不清；关掉编辑器后才清
//   8. 导入 PDF 可以取消：不留项目、不留图片
//   9. 清除本机全部资料：别的分页开着 → 不删、说清楚；关掉后打「清除」→ 全部删光、回到登录页
//
// 截图：SHOTS=<资料夹> 存几张关键画面（PR 里用）。

import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync, readFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
// 用一般的设定档（launchPersistentContext），跟设计师平常开 Chrome 一样：
// Playwright 预设的临时无痕设定档里，从 IndexedDB 读回存起来的资料夹会让 Chromium 整个当掉（2026-11-21 在 GitHub 的机器上撞到，本机重现过）
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const AUTH_HASH = /AUTH_HASH = '([0-9a-f]+)'/.exec(readFileSync(path.join(ROOT, 'src/store/auth.js'), 'utf8'))[1];
const TMP = mkdtempSync(path.join(os.tmpdir(), 'ukir-data-'));
const DAY = 24 * 3600 * 1000;

const steps = [];
const step = (name, fn) => steps.push({ name, fn });

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
// 中文文件名：系统语系不是 UTF-8 时 Chromium 会把下载的文件名换成「download」（真的电脑上不会），这里指定 UTF-8
const context = await chromium.launchPersistentContext(mkdtempSync(path.join(os.tmpdir(), 'ukir-profile-')), {
  env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: SHOTS ? 2 : 1,
  acceptDownloads: true,
});
// 「选资料夹」换成浏览器自带的私有资料夹（真的选择窗口在无头浏览器里点不了）
await context.addInitScript(() => {
  window.showDirectoryPicker = async () => {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle('UKIR 备份', { create: true });
  };
});
const page = context.pages()[0] || (await context.newPage());
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
const shot = async (name, p = page, fullPage = false) => SHOTS && p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });

// ---------------- 小工具 ----------------

const db = (fn, arg) => page.evaluate(fn, arg);
const projectList = () =>
  db(async () => {
    const { listProjects } = await import('/src/store/db.js');
    return (await listProjects()).map((p) => ({ id: p.id, name: p.name, rev: p.rev }));
  });
const refsOf = (id) =>
  db(async (id) => {
    const { getProject } = await import('/src/store/db.js');
    const { collectAssetSrcs, assetIdOf } = await import('/src/store/assets.js');
    return [...collectAssetSrcs(await getProject(id))].map(assetIdOf);
  }, id);
const assetIds = () =>
  db(async () => {
    const { listAssetInfo } = await import('/src/store/db.js');
    return (await listAssetInfo()).map((a) => a.id);
  });
const folderFiles = () =>
  db(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('UKIR 备份', { create: true });
    const out = [];
    for await (const [name] of dir.entries()) out.push(name);
    return out.sort();
  });
async function goHome() {
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await page.locator('[data-testid="data-panel"]').waitFor();
}
async function reloadHome() {
  await page.goto(`${base}/#/`); // 只换 # 后面不会重新载入
  await page.reload();
  await page.locator('[data-testid="data-panel"]').waitFor();
  await page.waitForTimeout(300);
}
const card = (name) => page.locator('[data-testid="project-card"]', { hasText: name });
async function toast(re, timeout = 15000) {
  await page.locator('body').getByText(re).first().waitFor({ timeout });
}
async function download(click) {
  const [d] = await Promise.all([page.waitForEvent('download'), click()]);
  const file = path.join(TMP, d.suggestedFilename());
  await d.saveAs(file);
  return { file, name: d.suggestedFilename() };
}

/** 建一个项目（两张效果图）；ageDays = 几天前建的 */
const makeProject = (name, ageDays = 0) =>
  db(
    async ({ name, ageDays, DAY }) => {
      const { newProject, assembleDeck, uid } = await import('/src/engine/model.js');
      const { storeBlob } = await import('/src/store/assets.js');
      const { saveProject } = await import('/src/store/db.js');
      const paint = (a, b) =>
        new Promise((resolve) => {
          const c = document.createElement('canvas');
          c.width = 800;
          c.height = 450;
          const g = c.getContext('2d');
          const grad = g.createLinearGradient(0, 0, 800, 450);
          grad.addColorStop(0, a);
          grad.addColorStop(1, b);
          g.fillStyle = grad;
          g.fillRect(0, 0, 800, 450);
          c.toBlob(resolve, 'image/jpeg', 0.85);
        });
      const p = newProject({ name, info: { client: 'Mr Demo', location: 'Demo Town', date: '2026 · 11' } });
      const views = [];
      for (const [a, b] of [['#c9b79c', '#5b4a36'], ['#a7b5a0', '#2f3a2c']]) {
        views.push({ id: uid('s'), kind: 'view', enabled: true, floorId: null, layout: 'auto', image: await storeBlob(await paint(a, b), { projectId: p.id }), room: '客厅', roomEn: 'Living', subtitle: '', materials: [], notes: [] });
      }
      p.slides = assembleDeck(views);
      p.createdAt = Date.now() - ageDays * DAY;
      return (await saveProject(p)).id;
    },
    { name, ageDays, DAY }
  );

/** 存一张图（ageHours 小时前存的），不挂到项目上 */
const strayAsset = (projectId, ageHours) =>
  db(
    async ({ projectId, ageHours }) => {
      const { putAssetRecord } = await import('/src/store/db.js');
      const id = `a-stray-${Math.random().toString(36).slice(2, 8)}`;
      const blob = new Blob([new Uint8Array(200 * 1024)], { type: 'image/jpeg' });
      await putAssetRecord({ id, projectId, blob, mime: 'image/jpeg', w: 10, h: 10, ts: Date.now() - ageHours * 3600 * 1000 });
      return id;
    },
    { projectId, ageHours }
  );

/** 把现有的图片都当成 hours 小时前存的（1 小时内存的图不会被自动清，测试里要「放旧」） */
const ageAllAssets = (hours) =>
  db(async (hours) => {
    const { listAssetInfo, getAssetRecord, putAssetRecord } = await import('/src/store/db.js');
    for (const a of await listAssetInfo()) {
      const rec = await getAssetRecord(a.id);
      await putAssetRecord({ ...rec, ts: Math.min(rec.ts, Date.now() - hours * 3600 * 1000) });
    }
  }, hours);

let oldId = '';
let newId = '';
let oldBackup = '';

// ---------------- 测试 ----------------

step('首页：长期保存、7 天没备份变黄、没人用的图片自动清掉', async () => {
  await page.goto(`${base}/`);
  await page.evaluate((hash) => localStorage.setItem('blueprint.auth.v1', hash), AUTH_HASH);
  await page.reload();
  await page.locator('[data-testid="data-panel"]').waitFor();
  oldId = await makeProject('老项目 Muar', 10);
  newId = await makeProject('新项目 Puchong', 1);
  const stray = await strayAsset('p-gone', 5); // 删掉的项目留下的
  const fresh = await strayAsset('p-importing', 0.1); // 刚存的：可能正在导入，不能清
  await reloadHome();

  const persist = await page.locator('[data-testid="persist-state"]').getAttribute('data-state');
  assert.ok(['on', 'off', 'unsupported'].includes(persist), `长期保存要显示状态（现在：${persist}）`);
  assert.equal(await card('老项目').getAttribute('data-backup'), 'due', '建了 10 天、没备份过 → 黄');
  assert.equal(await card('新项目').getAttribute('data-backup'), 'never');
  assert.match(await card('新项目').locator('[data-testid="backup-state"]').innerText(), /还没备份过/);
  assert.match(await page.locator('[data-testid="backup-due"]').innerText(), /1 个项目改过、7 天以上没备份/);
  await page.locator('[data-testid="cleaned"]').waitFor({ timeout: 10000 });
  assert.match(await page.locator('[data-testid="cleaned"]').innerText(), /1 张没用的图片，腾出 200 KB/);
  const ids = await assetIds();
  assert.ok(!ids.includes(stray), '没人用的旧图清掉了');
  assert.ok(ids.includes(fresh), '刚存的图留着');
  if (persist === 'off') {
    await page.getByRole('button', { name: '怎么开' }).click();
    await page.locator('[data-testid="persist-ask"]').waitFor();
    await shot('2-长期保存没开-怎么开');
    await page.getByRole('button', { name: '关闭' }).last().click();
  }
  await shot('1-首页-资料安全', page, true);
});

step('项目卡片上的「备份」：下载一份，卡片变成「已备份」、黄色那句消失', async () => {
  const { file, name } = await download(() => card('老项目').locator('[data-testid="project-backup"]').click());
  oldBackup = file;
  assert.match(name, /老项目 Muar\.blueprint\.zip$/);
  await page.waitForFunction(() => document.querySelector('[data-testid="project-card"][data-backup="fresh"]'));
  assert.match(await card('老项目').locator('[data-testid="backup-state"]').innerText(), /已备份 · 刚刚/);
  assert.equal(await page.locator('[data-testid="backup-due"]').count(), 0);
});

step('恢复同一个项目：问「更新 / 另存」；更新不多一份，另存多一份「副本」；这台电脑上没有就直接照原 id 恢复', async () => {
  // 先改一下名字（模拟备份之后又改过）
  await db(async (id) => {
    const { getProject, saveProject } = await import('/src/store/db.js');
    const p = await getProject(id);
    await saveProject({ ...p, name: '老项目 Muar（改过）' }, p.rev);
  }, oldId);
  await reloadHome();
  assert.equal(await card('老项目').getAttribute('data-backup'), 'changed');
  await ageAllAssets(3);
  const oldRefs = await refsOf(oldId);

  await page.locator('[data-testid="restore-input"]').setInputFiles(oldBackup);
  await page.locator('[data-testid="restore-update"]').waitFor();
  assert.ok(await page.getByText('这个项目这台电脑上已经有了').isVisible());
  await shot('3-恢复-更新还是另存');
  await page.locator('[data-testid="restore-update"]').click();
  await page.waitForFunction((id) => window.location.hash === `#/p/${id}`, oldId, { timeout: 20000 });
  await goHome();
  let list = await projectList();
  assert.equal(list.length, 2, '更新原项目：不多出一份');
  assert.equal(list.find((p) => p.id === oldId).name, '老项目 Muar', '换回备份里的名字');
  assert.equal(await card('老项目').getAttribute('data-backup'), 'fresh', '恢复的就是备份那一版');
  // 换下来的旧图：自动清（这时编辑器已经关了）
  await reloadHome();
  const after = await assetIds();
  const newRefs = await refsOf(oldId);
  assert.equal(newRefs.length, 2);
  assert.ok(newRefs.every((id) => after.includes(id)), '恢复进来的图留着');
  assert.ok(oldRefs.every((id) => !after.includes(id)), '换下来的旧图清掉了');

  await page.locator('[data-testid="restore-input"]').setInputFiles(oldBackup);
  await page.locator('[data-testid="restore-copy"]').click();
  await page.waitForFunction(() => /^#\/p\//.test(window.location.hash), null, { timeout: 20000 });
  await goHome();
  list = await projectList();
  assert.equal(list.length, 3);
  assert.ok(list.some((p) => p.name === '老项目 Muar（副本）' && p.id !== oldId), '另存一份：名字加「副本」、新 id');

  // 这台电脑上没有：删掉原项目再恢复 → 不问，照原 id
  await card('老项目 Muar').filter({ hasNotText: '副本' }).getByRole('button', { name: '删除项目' }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await toast(/已删除/);
  await page.locator('[data-testid="restore-input"]').setInputFiles(oldBackup);
  await page.waitForFunction((id) => window.location.hash === `#/p/${id}`, oldId, { timeout: 20000 });
  await goHome();
  assert.equal((await projectList()).length, 3);
});

step('全部备份到资料夹：每个项目一个文件；没改过的不重写；改过名的旧文件换掉', async () => {
  await page.locator('[data-testid="backup-folder"]').click();
  await toast(/已备份到资料夹「UKIR 备份」：写了 3 个项目/);
  let files = await folderFiles();
  assert.equal(files.length, 3, files.join(' / '));
  assert.ok(files.every((f) => /· [0-9a-z]{6}\.blueprint\.zip$/.test(f)));
  assert.match(await page.locator('[data-testid="all-backup-at"]').innerText(), /上次：刚刚 · 资料夹「UKIR 备份」/);
  assert.match(await page.locator('[data-testid="backup-folder"]').innerText(), /备份到「UKIR 备份」/);

  await page.locator('[data-testid="backup-folder"]').click();
  await toast(/项目都没改过/);

  await db(async (id) => {
    const { getProject, saveProject } = await import('/src/store/db.js');
    const p = await getProject(id);
    await saveProject({ ...p, name: '新项目 Puchong 第二版' }, p.rev);
  }, newId);
  await reloadHome();
  await page.locator('[data-testid="backup-folder"]').click();
  await toast(/写了 1 个项目，2 个没改过的不用重写/);
  files = await folderFiles();
  assert.equal(files.length, 3, '改过名：旧名字那份换掉，不是多一份');
  assert.ok(files.some((f) => f.startsWith('新项目 Puchong 第二版 · ')));
});

step('打包成一个文件 → 再恢复：这台电脑上已经有的默认跳过', async () => {
  const { file, name } = await download(() => page.locator('[data-testid="backup-file"]').click());
  assert.match(name, /^UKIR STUDIO 全部备份 \d{4}-\d{2}-\d{2}\.blueprint\.zip$/);
  await page.locator('[data-testid="restore-input"]').setInputFiles(file);
  await page.locator('[data-testid="restore-all-go"]').waitFor();
  assert.ok(await page.getByText('3 个这台电脑上已经有了').isVisible());
  await shot('4-恢复全部备份');
  await page.locator('[data-testid="restore-all-go"]').click();
  await toast(/全部备份恢复好了：跳过 3 个这里已经有的/);
  assert.equal((await projectList()).length, 3);
});

step('Material Board：页面上能下载画板和材质库的备份；首页恢复是合并、不重复', async () => {
  await db(async () => {
    const { putBoard } = await import('/src/moodboard/store.js');
    const { putLibraryItem } = await import('/src/moodboard/library.js');
    const { STANDALONE_ID, DEFAULT_BOARD } = await import('/src/moodboard/constants.js');
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const dataUrl = c.toDataURL('image/png');
    await putBoard({ id: 'b-test', projectId: STANDALONE_ID, name: '测试画板', board: DEFAULT_BOARD || {}, items: [{ id: 'i1', dataUrl, aspect: 1, w: 20, x: 10, y: 10, rot: 0, label: '测试木纹' }], createdAt: Date.now(), ts: Date.now() });
    await putLibraryItem({ id: 'm-test', dataUrl, name: '测试木纹', cat: 'wood', ts: Date.now() });
  });
  await page.evaluate(() => {
    window.location.hash = '#/boards';
  });
  await page.locator('[data-testid="boards-backup"]').waitFor();
  const { file, name } = await download(() => page.locator('[data-testid="boards-backup"]').click());
  assert.equal(name, 'Material Board · 画板与材质库.blueprint.zip');
  await page.getByText(/上次备份 刚刚/).waitFor();
  await goHome();
  assert.match(await page.locator('[data-testid="boards-backup-state"]').innerText(), /已备份/);
  await page.locator('[data-testid="restore-input"]').setInputFiles(file);
  await toast(/这台电脑上都有了/);
});

step('正在编辑的项目：它换下来的图先不清，关掉编辑器后才清', async () => {
  const stray = await strayAsset(newId, 5);
  await ageAllAssets(3);
  const editor = await context.newPage();
  await editor.goto(`${base}/#/p/${encodeURIComponent(newId)}`);
  await editor.getByRole('button', { name: '展厅播放' }).waitFor({ timeout: 20000 });
  await reloadHome();
  assert.ok((await assetIds()).includes(stray), '编辑器开着：不清');
  await editor.close();
  await page.waitForTimeout(300);
  await reloadHome();
  await page.waitForTimeout(500);
  assert.ok(!(await assetIds()).includes(stray), '编辑器关了：清掉');
});

step('导入 PDF 可以取消：不留项目、不留图片', async () => {
  const beforeProjects = (await projectList()).length;
  const beforeAssets = (await assetIds()).length;
  // 让导入程序晚 3 秒才载入，好按得到「取消」
  await page.route('**/src/import/importPdf.js*', async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  await page.locator('input[type=file][accept^="application/pdf"]').setInputFiles({ name: '测试方案.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
  await page.locator('[data-testid="import-cancel"]').waitFor();
  await shot('5-导入可以取消');
  await page.locator('[data-testid="import-cancel"]').click();
  await toast(/已取消导入/);
  await page.unroute('**/src/import/importPdf.js*');
  assert.equal(await page.locator('[data-testid="import-cancel"]').count(), 0, '导入窗口关掉了');
  assert.equal((await projectList()).length, beforeProjects);
  assert.equal((await assetIds()).length, beforeAssets);
});

step('清除本机全部资料：别的分页开着不删；关掉后打「清除」→ 删光、回到登录页', async () => {
  const other = await context.newPage();
  await other.goto(`${base}/#/`);
  await other.locator('[data-testid="data-panel"]').waitFor();
  await page.locator('[data-testid="wipe-open"]').click();
  await page.locator('[data-testid="wipe-word"]').fill('清除');
  await shot('6-清除本机全部资料');
  await page.locator('[data-testid="wipe-go"]').click();
  await page.getByText(/还有 1 个 UKIR STUDIO 分页开着/).waitFor();
  assert.equal((await projectList()).length, 3, '没删');
  await other.close();
  await page.waitForTimeout(300);
  await Promise.all([page.waitForEvent('load'), page.locator('[data-testid="wipe-go"]').click()]);
  await page.getByText('与 UKIR STUDIO 同一组账号').waitFor({ timeout: 15000 });
  const left = await page.evaluate(async () => ({
    dbs: (await indexedDB.databases()).map((d) => d.name).filter((n) => /blueprint|ukir|sail/.test(n)),
    ls: Object.keys(localStorage),
  }));
  assert.deepEqual(left.dbs, [], `库都删了（还剩：${left.dbs.join(', ')}）`);
  assert.deepEqual(left.ls, []);
});

let failed = 0;
try {
  for (const s of steps) {
    try {
      await s.fn();
      console.log(`  ✓ 浏览器 › 资料不丢 › ${s.name}`);
    } catch (e) {
      failed += 1;
      console.log(`  ✗ 浏览器 › 资料不丢 › ${s.name}\n      ${String(e?.stack || e).split('\n').slice(0, 8).join('\n      ')}`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `失败-资料-${steps.indexOf(s) + 1}.png`) }).catch(() => {});
      break; // 后面几段接着前面的状态
    }
  }
  if (!failed && pageErrors.length) {
    failed += 1;
    console.log(`  ✗ 浏览器 › 资料不丢 › 页面报错：\n      ${pageErrors.slice(0, 5).join('\n      ')}`);
  }
} finally {
  await context.close();
  await server.close();
}
console.log(`\n浏览器测试（资料不丢）：${failed ? '没过' : `${steps.length}/${steps.length} 段全过`}`);
process.exit(failed ? 1 : 0);
