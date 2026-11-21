// 浏览器实测：3 支「手机」同一个房间走一整局（同一个浏览器、?net=local 用分页之间的转送）
// 用法：先 npx vite --port 5175，再 node test/browser/room.browser.mjs [截图资料夹]
// 要镜像里装好的 Playwright（CI 不跑：play 没把 playwright 列进依赖）
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.PLAY_URL || 'http://localhost:5175';
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1 });
const errors = [];
const open = async (who, path) => {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  p.on('dialog', (d) => d.accept());
  await p.goto(`${BASE}${path}${path.includes('?') ? '&' : '?'}net=local&as=${who}`);
  return p;
};
const shot = async (p, name) => SHOTS && p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const step = (s) => console.log(`· ${s}`);

async function enterCode(p, code) {
  for (const c of code) await p.locator('.cb-input .cb-color').nth(c).click();
  await p.locator('.cb-input .btn.primary').click();
}
async function hostState(host, code) {
  return host.evaluate((c) => JSON.parse(localStorage.getItem(`play.host.host.${c}`)), code);
}

try {
  // 房主
  const host = await open('host', '/');
  await host.evaluate(() => localStorage.setItem('play.host.name', JSON.stringify('爸爸')));
  await host.reload();
  await shot(host, '01-home');
  await host.locator('[data-game="codebreaker"] .game-main').click();
  await host.getByTestId('new-codebreaker').click();
  await host.waitForURL(/\/j\/[A-Z0-9]{4}/);
  const code = (await host.getByTestId('room-code').textContent()).trim();
  step(`开房 ${code}`);

  // 两个人加入（第一次要输入名字）
  const kids = [];
  for (const [who, name] of [['p1', '小明'], ['p2', '小红']]) {
    const p = await open(who, `/j/${code}`);
    await p.locator('input.input').fill(name);
    await p.locator('form button[type=submit]').click();
    await p.getByText('等房主开始').waitFor();
    kids.push(p);
  }
  await host.locator('.players li').nth(2).waitFor();
  assert.equal(await host.locator('.players li').count(), 3);
  await shot(host, '02-lobby-host');
  await shot(kids[0], '03-lobby-player');
  step('两个人加入，房主看到 3 个人');

  // 玩家不能改设定
  assert.equal(await kids[0].locator('.choice').first().isDisabled(), true);

  // 比快
  await host.getByTestId('start').click();
  await kids[0].locator('.cb-input').waitFor();
  let st = await hostState(host, code);
  const secret = st.game.secret;
  assert.equal(secret.length, 3);
  const wrong = [...secret].reverse();
  await enterCode(kids[1], wrong);
  await kids[1].locator('.cb-history .cb-row').first().waitFor();
  await shot(kids[1], '04-race-guess');
  await enterCode(kids[0], secret);
  await kids[0].getByText('猜中了').first().waitFor();
  await enterCode(kids[1], secret);
  await enterCode(host, secret);
  for (const p of [host, ...kids]) await p.getByText('这一局结果').waitFor();
  await shot(kids[0], '05-race-results');
  const first = await host.locator('.ranking li').first().textContent();
  assert.ok(first.includes('小明'), first);
  step('比快：小明第一，三个人都看到结果和答案');

  // 回大厅 → 轮流出题
  await host.getByRole('button', { name: '回大厅' }).click();
  await host.getByRole('button', { name: /轮流出题/ }).click();
  await kids[0].locator('.choice.on', { hasText: '轮流出题' }).waitFor();
  await host.getByTestId('start').click();
  await host.getByText('出一组密码让大家猜').waitFor();
  await kids[0].getByText('等 爸爸 出题').waitFor();
  await enterCode(host, [0, 1, 2]);
  await kids[0].locator('.cb-input').waitFor();
  await enterCode(kids[0], [2, 1, 0]);
  await host.getByText('大家猜到哪里了').waitFor();
  await host.locator('.cb-progress .cb-row').first().waitFor();
  await shot(host, '06-setter-watching');
  await enterCode(kids[0], [0, 1, 2]);
  for (let i = 0; i < 8; i++) {
    await enterCode(kids[1], [3, 2, 1]);
    await kids[1].locator('.cb-history .cb-row').nth(i).waitFor();
  }
  await host.getByText('这一局结果').waitFor();
  st = await hostState(host, code);
  assert.equal(st.game.scores[st.hostPid] >= 1, true, '难倒小红，出题人得分');
  await shot(kids[1], '07-setter-results');
  step('轮流出题：房主出题、看得到大家猜什么；小红没猜中，房主得分');

  // 下一局换小明出题
  await host.getByRole('button', { name: '下一局' }).click();
  await kids[0].getByText('出一组密码让大家猜').waitFor();
  await host.getByText('等 小明 出题').waitFor();
  step('下一局换小明出题');

  // 固定网址
  await host.evaluate(() => localStorage.setItem('play.host.slug', JSON.stringify('wilson')));
  await host.reload();
  await host.getByText('等 小明 出题').waitFor();
  const visitor = await open('p3', '/r/wilson');
  await visitor.waitForURL(new RegExp(`/j/${code}`), { timeout: 10_000 });
  step('扫固定网址 /r/wilson → 自动跳进房间（房主重新整理后也接得回来）');
  await visitor.locator('input.input').fill('阿姨');
  await visitor.locator('form button[type=submit]').click();
  await visitor.getByText('这一局已经开始了').first().waitFor();
  step('中途加入的人先在旁边看');

  // 踢人：房主中途回大厅 → 请出阿姨 → 阿姨看到通知
  await host.getByRole('button', { name: '回大厅' }).click();
  await host.getByTestId('start').waitFor();
  const row = host.locator('.players li', { hasText: '阿姨' });
  await row.getByRole('button', { name: '请出' }).click();
  await visitor.getByText('你被房主请出房间了').waitFor();
  await host.locator('.players li', { hasText: '阿姨' }).waitFor({ state: 'detached' });
  await shot(visitor, '09-kicked');
  step('房主中途回大厅、请出阿姨，阿姨看到通知');

  // 一个人玩
  const solo = await open('solo', '/solo/codebreaker');
  for (let i = 0; i < 8; i++) {
    await enterCode(solo, [0, 1, 2]);
    if (await solo.locator('.cb-done').isVisible()) break;
  }
  await solo.locator('.cb-done').waitFor();
  await shot(solo, '08-solo-done');
  step('一个人玩：猜完会显示答案');

  assert.deepEqual(errors, []);
  console.log('全部通过');
} catch (e) {
  console.error('失败：', e.message);
  console.error(errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
