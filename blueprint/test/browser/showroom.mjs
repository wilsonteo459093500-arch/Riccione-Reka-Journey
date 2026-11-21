// 第一个浏览器测试（体检第 1 阶段，2026-11-21）：真的开 Chromium 走一遍「展厅播放」。
// npm run test:browser —— 自己起 Vite（本机开发模式）、建一个样例项目、走完下面几段，全过才退出 0。
//
//   1. 开着「调整版面」、选中一张照片去播放：方向键翻得动；退出后方案没被偷偷改（体检发现一 · 2，实测重现过）
//   2. 点「展厅播放」先出检查清单；中英版 4 条长说明 → 清单上说「只放得下前几条」
//   3. Esc 按一次不退出（出提示），再按一次才退出
//   4. 鼠标滚轮一格翻一页；点右边下一页、点左边上一页
//   5. 满版效果图的说明栏不冲出屏幕、不压右上角的 logo
//   6. 播放时申请了屏幕常亮，退出后放掉
//   7. 动效那一层出错 → 这一页退回静态原图，翻页照常；播放器出错 → 最简单的翻页器，还能翻、能退出
//
// 截图：SHOTS=<资料夹> npm run test:browser 会把几张关键画面存下来（PR 里用）。

import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const AUTH_HASH = /AUTH_HASH = '([0-9a-f]+)'/.exec(readFileSync(path.join(ROOT, 'src/store/auth.js'), 'utf8'))[1];

const steps = [];
const step = (name, fn) => steps.push({ name, fn });

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: SHOTS ? 2 : 1 });
// 登录；屏幕常亮换成数得到的假货（无头浏览器里真的那个申请不到）
await context.addInitScript((hash) => {
  localStorage.setItem('blueprint.auth.v1', hash);
  window.__wake = { asked: 0, held: 0 };
  Object.defineProperty(Navigator.prototype, 'wakeLock', {
    configurable: true,
    get: () => ({
      request: async () => {
        window.__wake.asked += 1;
        window.__wake.held += 1;
        const lock = { released: false };
        lock.release = async () => {
          if (!lock.released) window.__wake.held -= 1;
          lock.released = true;
        };
        return lock;
      },
    }),
  });
}, AUTH_HASH);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

const shot = async (name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const showroom = page.locator('[data-testid="showroom"]');
const pos = async () => Number(await showroom.getAttribute('data-pos'));
/** 等播放器停到第 k 个停点；等不到 → 报出当时停在哪（好查是哪一步没翻过去） */
async function waitPos(k, what = '') {
  try {
    await page.waitForFunction((n) => Math.abs(Number(document.querySelector('[data-testid="showroom"]')?.dataset.pos) - n) < 1e-3, k, { timeout: 30000 });
  } catch {
    const at = await showroom.getAttribute('data-pos').catch(() => '（播放器不在了）');
    throw new Error(`${what || '翻页'}：等第 ${k} 个停点，30 秒后还停在 ${at}`);
  }
}
const savedProject = (id) =>
  page.evaluate(async (pid) => {
    const { getProject } = await import('/src/store/db.js');
    const p = await getProject(pid);
    return JSON.stringify({ slides: p.slides, floors: p.floors, materials: p.materials });
  }, id);
async function openShow() {
  await page.getByRole('button', { name: '展厅播放' }).click();
  await page.locator('[data-testid="showroom-preflight"]').waitFor();
  await page.locator('[data-testid="showroom-start"]').click();
  await showroom.waitFor();
  await waitPos(0);
  await page.waitForTimeout(650); // 刚打开的半秒内点击不算翻页
}
async function closeShow() {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await showroom.waitFor({ state: 'detached' });
}

let projectId = '';
let fullKey = '';

step('建样例项目、打开编辑器', async () => {
  await page.goto(`${base}/`);
  await page.reload();
  projectId = await page.evaluate(async () => {
    const { newProject } = await import('/src/engine/model.js');
    const { storeBlob } = await import('/src/store/assets.js');
    const { saveProject } = await import('/src/store/db.js');
    const paint = (w, h, a, b) =>
      new Promise((resolve) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, a);
        grad.addColorStop(1, b);
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(60,40,20,0.55)';
        for (let i = 0; i < 6; i++) g.fillRect(w * (0.08 + i * 0.15), h * 0.3, w * 0.1, h * 0.55); // 几扇「柜门」，线稿有东西可画
        c.toBlob(resolve, 'image/jpeg', 0.85);
      });
    const p = newProject({ name: '浏览器测试', info: { client: 'Mr Demo', location: 'Demo Town', date: '2026 · 11', lang: 'bi' } });
    const img = async (a, b) => storeBlob(await paint(1600, 900, a, b), { projectId: p.id });
    const long = [
      { label: '隐形门', text: '整面护墙板里藏了一扇通往储物间的门，液压闭门器配反弹器，关上以后和墙面的分缝完全对齐，看不出门在哪里。' },
      { label: '灯光', text: '吊柜底部和开放格里都嵌了 3000K 的 LED 灯带，晚上不开主灯也够亮，柜体的木纹在暖光下会更明显一些。' },
      { label: '收纳', text: '电视柜下方整排抽屉做了阻尼滑轨，最右边一格留给路由器和机顶盒，背板开了散热孔，线都从墙里走。' },
      { label: '台面', text: '岛台用整块岩板，四边做了海棠角，转角摸上去是圆的；台面往客厅一侧挑出 30 公分，可以坐两个人。' },
    ];
    p.floors = [{ id: 'f1', zh: '一楼', en: 'GROUND FLOOR', image: null }];
    p.materials = [{ id: 'm1', name: '浅川橡', code: 'AG273', image: await img('#c9a57a', '#8a6238') }];
    const view = (id, room, subtitle, layout, image, notes = []) => ({ id, kind: 'view', enabled: true, floorId: 'f1', layout, image, room, subtitle, materials: [{ role: '柜体', materialId: 'm1' }], notes });
    p.slides = [
      { id: 's-floor', kind: 'floor', floorId: 'f1', enabled: true },
      view('v-full', '客厅', '电视墙', 'full', await img('#d8c7ad', '#6f5a45'), long),
      view('v-plate', '厨房', '岛台', 'plate', await img('#cfd6d2', '#55605c')),
      view('v-bed', '主人房', '衣橱', 'plate', await img('#e3d6c8', '#7a6a5d')),
    ];
    await saveProject(p);
    return p.id;
  });
  await page.goto(`${base}/#/p/${projectId}`);
  await page.reload();
  await page.getByRole('button', { name: '展厅播放' }).waitFor();
});

step('开着「调整版面」、选中照片去播放：方向键翻得动，方案没被偷偷改', async () => {
  // 到一张效果图页，打开「调整版面」，点中照片
  await page.locator('[data-slide-list]').getByText('岛台', { exact: false }).first().click();
  await page.getByRole('button', { name: '调整版面' }).click();
  const photo = page.locator('[data-testid="adjust-layer"] [data-adjust-type="photo"]').first();
  await photo.waitFor();
  await photo.click({ position: { x: 30, y: 30 } });
  await page.locator('[data-testid="adjust-bar"]').waitFor();
  // 先证明这个状态下方向键真的归「调整版面」管（不然这一段测不出东西）：在编辑器里按一下，方案会变
  const before = await savedProject(projectId);
  await page.keyboard.press('ArrowRight');
  let armedAt = before;
  for (let i = 0; i < 50 && armedAt === before; i++) {
    await page.waitForTimeout(200);
    armedAt = await savedProject(projectId);
  }
  assert.notEqual(armedAt, before, '编辑器里选中照片时，方向键是在挪图（这一段的前提）');
  await page.waitForTimeout(900); // 等自动保存落定
  const armed = await savedProject(projectId);

  await openShow();
  await page.keyboard.press('ArrowRight');
  await waitPos(1);
  await page.keyboard.press('ArrowDown');
  await waitPos(2);
  await page.keyboard.press('ArrowLeft');
  await waitPos(1);
  // 编辑器整个停用
  assert.equal(await page.locator('[inert]').count(), 1, '播放时编辑器是 inert');
  await closeShow();
  assert.equal(await page.locator('[inert]').count(), 0, '退出后编辑器恢复');
  await page.waitForTimeout(900); // 自动保存是 600 ms 防抖：要是偷偷改了，这时已经存进去
  assert.equal(await savedProject(projectId), armed, '播放时按方向键没有改到方案');
  // 退出「调整版面」，后面几段从干净的编辑器开始
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
});

step('点「展厅播放」先出检查清单：4 条长说明 → 提醒只放得下前几条', async () => {
  await page.getByRole('button', { name: '展厅播放' }).click();
  const pre = page.locator('[data-testid="showroom-preflight"]');
  await pre.waitFor();
  assert.equal(await showroom.count(), 0, '还没开始播放');
  assert.equal(await pre.getAttribute('data-ok'), '0');
  const issues = await page.locator('[data-testid="showroom-issues"]').innerText();
  assert.match(issues, /设计说明写了 4 条，播放时右下角只放得下前 \d 条/);
  assert.match(await pre.innerText(), /屏幕保持常亮/);
  await shot('1-检查清单');
  // 取消 = 不播放
  await page.getByRole('button', { name: '取消' }).click();
  await pre.waitFor({ state: 'detached' });
  assert.equal(await showroom.count(), 0);
});

step('Esc 按一次不退出（出提示），再按一次才退出；播放时屏幕常亮，退出后放掉', async () => {
  await openShow();
  assert.ok((await page.evaluate(() => window.__wake.held)) >= 1, '播放时申请了屏幕常亮');
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="showroom-esc-hint"]').waitFor();
  assert.equal(await showroom.count(), 1, '按一次 Esc 还在播放');
  await shot('2-Esc-提示');
  await page.keyboard.press('Escape');
  await showroom.waitFor({ state: 'detached' });
  await page.waitForFunction(() => window.__wake.held === 0);
});

step('滚轮一格翻一页；点右边下一页、点左边上一页', async () => {
  await openShow();
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 100);
  await waitPos(1, '滚轮往下一格');
  await page.waitForTimeout(200);
  await page.mouse.wheel(0, 100);
  await waitPos(2, '滚轮再往下一格');
  await page.waitForTimeout(200);
  await page.mouse.wheel(0, -100);
  await waitPos(1, '滚轮往上一格');
  // 触控板那样的小步（Playwright 的 mouse.wheel 一律报成「有刻度的一格」，所以这里自己发事件：小步、wheelDeltaY 不是 120 的倍数）：
  // 滑过一小段（不到半页）停手，也翻过去，不弹回
  const trackpad = (dy, times) =>
    page.evaluate(
      async ([d, n]) => {
        const el = document.querySelector('[data-testid="showroom"]');
        for (let i = 0; i < n; i++) {
          el.dispatchEvent(new WheelEvent('wheel', { deltaY: d, deltaMode: 0, bubbles: true, cancelable: true, clientX: 640, clientY: 400 }));
          await new Promise((r) => setTimeout(r, 16));
        }
      },
      [dy, times]
    );
  await page.waitForTimeout(200);
  await trackpad(33, 12);
  await waitPos(2, '触控板小步滑过一小段');
  // 只滑一点点：回到原页
  await page.waitForTimeout(200);
  await trackpad(10, 2);
  await page.waitForTimeout(1500);
  await waitPos(2, '只滑一点点应该回原页');
  // 点击
  await page.mouse.click(60, 400);
  await waitPos(1, '点左边');
  await page.mouse.click(900, 400);
  await waitPos(2, '点右边');
  await closeShow();
});

step('满版效果图的说明栏不冲出屏幕、不压右上角的 logo', async () => {
  await openShow();
  // 翻到满版那一页
  for (let i = 0; i < 12 && (await showroom.getAttribute('data-stop')) !== fullKey; i++) {
    if (!fullKey) {
      fullKey = await page.evaluate(async (pid) => {
        const { getProject } = await import('/src/store/db.js');
        const { renderDeck, exportableSlides } = await import('/src/engine/deck.js');
        const { metaOf } = await import('/src/store/assets.js');
        const p = await getProject(pid);
        return exportableSlides(renderDeck(p, { meta: metaOf })).find((pg) => pg.slideId === 'v-full').key;
      }, projectId);
      if ((await showroom.getAttribute('data-stop')) === fullKey) break;
    }
    const at = Math.round(await pos());
    await page.keyboard.press('ArrowRight');
    await waitPos(at + 1);
  }
  assert.equal(await showroom.getAttribute('data-stop'), fullKey);
  await page.waitForTimeout(300);
  const box = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="showroom"] > div');
    const s = stage.getBoundingClientRect();
    const texts = [...stage.querySelectorAll('*')].filter((el) => el.children.length === 0 && /隐形门|Hidden|液压/.test(el.textContent || ''));
    const tops = texts.map((el) => el.getBoundingClientRect().top);
    return { stageTop: s.top, stageH: s.height, top: Math.min(...tops), n: texts.length, hasLast: /台面/.test(stage.textContent || '') };
  });
  assert.ok(box.n > 0, '说明栏在画面上');
  assert.ok(box.top >= box.stageTop + box.stageH * 0.4, `说明栏最高到屏幕中间上下（top ${box.top}）`);
  assert.equal(box.hasLast, false, '放不下的最后一条没有显示');
  await shot('3-说明栏不冲出屏幕');
  await closeShow();
});

step('动效出错 → 这一页退回静态原图，翻页照常；播放器出错 → 最简单的翻页器', async () => {
  await openShow();
  await page.evaluate(() => {
    window.__showroomBreak = 'layers';
  });
  await page.keyboard.press('ArrowRight');
  await page.locator('[data-showroom-still="page"]').first().waitFor();
  await waitPos(1);
  assert.equal(await showroom.getAttribute('data-showroom-mode'), 'player', '播放器还在（只是这一页没有动效）');
  assert.ok((await page.locator('[data-showroom-still="page"] img').count()) + (await page.locator('[data-showroom-still="page"] *').count()) > 0, '静态页有内容，不是空白');
  await shot('4-动效出错退回静态原图');
  // 修好了（下一页不再出错）：翻过去，动效回来
  await page.evaluate(() => {
    window.__showroomBreak = '';
  });
  await page.keyboard.press('ArrowRight');
  await waitPos(2);
  assert.equal(await page.locator('[data-showroom-still]').count(), 0, '翻到别的页，动效再试一次、恢复了');
  // 播放器本身出错
  await page.evaluate(() => {
    window.__showroomBreak = 'player';
  });
  await page.keyboard.press('ArrowRight');
  await page.locator('[data-showroom-mode="static"]').waitFor();
  await page.evaluate(() => {
    window.__showroomBreak = '';
  });
  await page.keyboard.press('ArrowRight');
  await waitPos(1);
  await page.keyboard.press('ArrowRight');
  await waitPos(2);
  assert.ok((await page.locator('[data-showroom-mode="static"] [data-showroom-still="page"]').count()) === 1, '翻页器画的是这一页的原图');
  await page.keyboard.press('Escape');
  assert.equal(await showroom.count(), 1, '翻页器里 Esc 也要按两次');
  await page.keyboard.press('Escape');
  await showroom.waitFor({ state: 'detached' });
});

let failed = 0;
try {
  for (const s of steps) {
    try {
      await s.fn();
      console.log(`  ✓ 浏览器 › ${s.name}`);
    } catch (e) {
      failed += 1;
      console.log(`  ✗ 浏览器 › ${s.name}\n      ${String(e?.stack || e).split('\n').slice(0, 8).join('\n      ')}`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `失败-${steps.indexOf(s) + 1}.png`) }).catch(() => {});
      break; // 后面几段接着前面的状态，前面坏了就不用跑了
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n浏览器测试：${failed ? '没过' : `${steps.length}/${steps.length} 段全过`}`);
process.exit(failed ? 1 : 0);
