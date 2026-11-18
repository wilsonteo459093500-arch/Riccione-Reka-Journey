/* ============================================================
   案例库 · AI 看图标风格、柜子（浏览器测试，本机模式）
   node --test tools/caselib/test/ai-local.mjs
   - Anthropic API 用 Playwright 拦下来回假的结果（一个请求都不会真的送出去）
   - 送出去的只有照片（长边 ≤ 1024px 的 JPEG）：没有文件夹名、客户名字、档案路径
   - 先试几张 → 全部；key 错整批停、讲白话；人确认过的照片不被改；看过的不重看
   - 标好之后审核页按柜类筛得到；「这个项目看过了，全部确认」
   名字都是假的（upload-fixtures.py 的「测试客户」）
   ============================================================ */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMock } from '../mock-server.mjs';
import { fixtures, launch, selectFolder, waitHashed, startAndWait, shotPath, PASSWORD } from './upload-kit.mjs';

let browser, info, m;
// 只出现在文件夹名、档名里的字（「现代」「厨房」这些是词表，提示词里本来就有）
const BAD = ['测试客户', '测试', 'Cheras', 'Kepong', 'K_01', 'K_02', 'M_01', 'T_01', 'P_01', '.jpg'];

before(async () => {
  info = await fixtures();
  m = await startMock({ port: 0, blobPort: 0, password: PASSWORD });
  browser = await launch();
});
after(async () => {
  if (browser) await browser.close();
  if (m) await m.close();
});

async function waitFor(fn, ms, what) {
  const end = Date.now() + (ms || 15000);
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out: ' + (what || fn));
    await new Promise((r) => setTimeout(r, 150));
  }
}
function localIndex(page) {
  return page.evaluate(() => fetch('/api/catalog?view=full', { cache: 'no-store' }).then((r) => r.json()));
}
// JPEG 的宽高（SOF0 / SOF2）
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const mk = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (mk === 0xc0 || mk === 0xc2) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

test('AI tagging: key stays on this computer, only the photo is sent, trial → all, bad key stops, confirmed photos untouched, project confirm', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());

  // ---- 假的 Anthropic API ----
  const calls = [];
  let mode = 'ok', n = 0;
  await ctx.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = JSON.parse(req.postData());
    calls.push({ headers: req.headers(), body, mode });
    if (mode === '401') return route.fulfill({ status: 401, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
    n++;
    const j = n % 3 === 0
      ? { room: 'master', cabinets: ['wardrobe'], style: 'cream', styleSure: false, sure: false }
      : { room: 'living', cabinets: ['wardrobe', 'tvwall'], style: 'luxe', styleSure: true, sure: true };
    return route.fulfill({
      status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors),
      body: JSON.stringify({ id: 'msg_' + n, type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn',
        content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(j) }],
        usage: { input_tokens: 900, output_tokens: 120, cache_read_input_tokens: 1400 } })
    });
  });

  // ---- 本机模式登入、汇入精选用的两个项目（共 14 张）----
  await page.goto(m.url + '/caselib');
  await page.waitForSelector('#login:not([hidden])');
  if (await page.getAttribute('#mode-local', 'aria-pressed') !== 'true') await page.click('#mode-local');
  await page.fill('#login-name', 'Ana');
  await page.click('#login-go');
  await page.waitForSelector('#tabs:not([hidden])', { timeout: 20000 });
  await page.waitForFunction(() => MB.cl.cat && MB.cl.cat.quota && MB.cl.cat.quota.plan === 'local', null, { timeout: 20000 });
  await page.click('#tabs [data-tab="upload"]');
  await selectFolder(page, info.curate);
  await waitHashed(page);
  await startAndWait(page);

  await page.evaluate(() => { MB.clReview.idleMs = 400; MB.clAi.TRIAL = 4; MB.clAi.TRIAL_PER_PROJECT = 2; });
  await page.click('#tabs [data-tab="review"]');
  await page.waitForSelector('#rv-grid .rv-card');
  let idx = await localIndex(page);
  const hs = Object.keys(idx.photos);
  assert.equal(hs.length, 14);
  const pidOf = (name) => Object.keys(idx.projects).find((p) => idx.projects[p].name === name);
  const kepong = pidOf(info.kepong), cheras = pidOf(info.cheras);

  // 人先确认一张（Kepong 的第一张）：AI 不能改它
  const kh = hs.filter((h) => idx.photos[h].p === kepong).sort((a, b) => (idx.photos[a].f < idx.photos[b].f ? -1 : 1));
  const human = kh[0];
  await page.click('#rv-grid .rv-card[data-h="' + human + '"]');
  await page.click('#drawer .chips[data-kind="cabinets"] .chip[data-v="shoe"]');
  await page.click('#rv-savebtn');
  await waitFor(async () => (await localIndex(page)).photos[human].status === 'confirmed', 10000, 'human confirmed');
  await page.click('#drawer .dr-x');

  // ---- 打开面板、存 key（Enter）----
  await page.click('#rv-ai-open');
  await page.waitForSelector('#rv-ai:not([hidden]) #rv-ai-key');
  await page.fill('#rv-ai-key', 'not-a-key');
  await page.click('#rv-ai [data-ai="save-key"]');
  await page.waitForFunction(() => /不像 Anthropic 的 API key/.test(document.querySelector('#rv-ai').textContent));
  await page.fill('#rv-ai-key', 'sk-ant-api03-FAKE-for-tests-only');
  await page.press('#rv-ai-key', 'Enter');
  await page.waitForFunction(() => /key 存好了/.test(document.querySelector('#rv-ai').textContent));
  assert.equal(await page.evaluate(() => localStorage.getItem('caselib-ai-key')), 'sk-ant-api03-FAKE-for-tests-only');
  assert.match(await page.textContent('#rv-ai'), /还有 13 张要看（2 个项目）/);
  await page.screenshot({ path: shotPath('ai-panel.png'), clip: await page.$eval('#rv-tags', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height }; }) });

  // ---- 先试 4 张（每个项目 2 张）----
  await page.click('#rv-ai [data-ai="trial"]');
  await page.waitForFunction(() => /好了：看了 4 张/.test(document.querySelector('#rv-ai').textContent), null, { timeout: 30000 });
  assert.equal(calls.length, 4);
  for (const c of calls) {
    assert.equal(c.headers['x-api-key'], 'sk-ant-api03-FAKE-for-tests-only');
    assert.equal(c.headers['anthropic-dangerous-direct-browser-access'], 'true');
    assert.equal(c.body.model, 'claude-opus-5-5');
    const text = JSON.stringify(c.body);
    const img = c.body.messages[0].content.find((b) => b.type === 'image');
    const scrubbed = text.replace(img.source.data, '');
    const leaked = BAD.filter((w) => scrubbed.includes(w));
    assert.deepEqual(leaked, [], 'request leaks folder / file names');
    const sz = jpegSize(Buffer.from(img.source.data, 'base64'));
    assert.ok(sz && Math.max(sz.w, sz.h) <= 1024 && Math.max(sz.w, sz.h) >= 1000, 'photo shrunk to 1024px: ' + JSON.stringify(sz));
  }
  idx = await localIndex(page);
  const tagged = hs.filter((h) => idx.photos[h].status === 'auto' || idx.photos[h].status === 'unsure');
  assert.ok(tagged.length >= 4);
  // Kepong（文件夹名有「简约」：项目风格已经是现代简约）：名字优先 —— AI 不改项目风格，也不替照片写风格（只补柜类、空间）
  assert.equal(idx.projects[kepong].style, 'modern');
  assert.ok(kh.slice(1, 3).every((h) => idx.photos[h].cabinets.join() === 'wardrobe,tvwall' || idx.photos[h].status === 'unsure'));
  assert.ok(kh.slice(1, 3).every((h) => !idx.photos[h].style), 'no AI photo style in a project named with a style');
  // 人确认过的那张一个字都没动
  assert.deepEqual(idx.photos[human].cabinets, ['shoe']);
  assert.equal(idx.photos[human].status, 'confirmed');

  // ---- key 错：整批停、讲白话、没送出的不算看过 ----
  mode = '401';
  await page.click('#rv-ai [data-ai="all"]');
  await page.waitForFunction(() => /API key 不对/.test(document.querySelector('#rv-ai').textContent), null, { timeout: 20000 });
  assert.ok(calls.length > 4);
  await page.waitForFunction(() => /还有 9 张要看/.test(document.querySelector('#rv-ai').textContent), null, { timeout: 10000 });

  // ---- 好了：全部看完，不重看 ----
  mode = 'ok';
  await page.click('#rv-ai [data-ai="all"]');
  await page.waitForFunction(() => /好了：看了 9 张/.test(document.querySelector('#rv-ai').textContent), null, { timeout: 30000 });
  assert.equal(calls.filter((c) => c.mode === 'ok').length, 13, '13 photos looked at once each');
  await page.waitForFunction(() => /没有要看的照片了/.test(document.querySelector('#rv-ai').textContent), null, { timeout: 10000 });
  idx = await localIndex(page);
  assert.ok(hs.every((h) => h === human || ['auto', 'unsure'].includes(idx.photos[h].status)));
  assert.deepEqual(idx.photos[human].cabinets, ['shoe']);
  // Cheras 的子文件夹已经自动标过空间、柜子（厨房 → 橱柜）：只填空的，不盖掉
  const kitchen = hs.filter((h) => idx.photos[h].p === cheras && idx.photos[h].f.indexOf('厨房/') === 0);
  assert.ok(kitchen.length && kitchen.every((h) => idx.photos[h].room === 'kitchen' && idx.photos[h].cabinets[0] === 'kitchen'));

  // ---- 审核页按柜类筛得到 ----
  await page.selectOption('#rv-filters select[data-f="cab"]', 'wardrobe');
  await page.waitForFunction(() => document.querySelectorAll('#rv-grid .rv-card').length > 0);
  await page.selectOption('#rv-filters select[data-f="cab"]', '');

  // ---- 这个项目看过了，全部确认 ----
  await page.selectOption('#rv-filters select[data-f="pid"]', kepong);
  await page.waitForSelector('#rv-proj [data-act="confirm-proj"]');
  const nAuto = hs.filter((h) => idx.photos[h].p === kepong && idx.photos[h].status === 'auto').length;
  assert.match(await page.textContent('#rv-proj [data-act="confirm-proj"]'), new RegExp(nAuto + ' 张全部确认'));
  await page.screenshot({ path: shotPath('ai-project.png') });
  await page.click('#rv-proj [data-act="confirm-proj"]');
  await page.click('#rv-savebtn');
  await waitFor(async () => {
    const i = await localIndex(page);
    return hs.filter((h) => i.photos[h].p === kepong).every((h) => i.photos[h].status !== 'auto');
  }, 10000, 'project confirmed');
  idx = await localIndex(page);
  assert.ok(hs.filter((h) => idx.photos[h].p === kepong && idx.photos[h].status === 'unsure').length >= 1, 'unsure ones stay unsure');
  assert.equal(await page.$('#rv-proj [data-act="confirm-proj"]'), null);

  // 清除 key
  await page.click('#rv-ai [data-ai="clear-key"]');
  assert.equal(await page.evaluate(() => localStorage.getItem('caselib-ai-key')), null);
  assert.deepEqual(errors, []);
  await ctx.close();
});
