// POLISHER-REG：回归 / 隐私 / 速度这一轮修的几件事，各留一个看门的检查。
//   · 色卡在后台线程画（swatchWorker.js，交回 BMP，不经过 canvas）；kit.jsx 用 module worker，起不来才在主线程画
//   · 案例封面色卡最多 112 px；案例详情的焦点等两帧再放（不在第一次渲染的同一个任务里逼浏览器排版）
//   · 预算那一题打开（只在员工的设备上问）
//   · v1 拿掉的两题（色盘、书架）的图不再打包
//   · 案例整理：第一眼只画几行，屏幕外的行按真实高度占位
//   · 许愿模式：音效只用弱引用记着最近按的那个元素（关掉的员工区不会被留在内存里）
// 跑：node test/reg.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATERIALS } from '../src/shared/materials.js';
import { CONFIG } from '../src/shared/config.js';
import { askBudgetOn } from '../src/shared/home.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let n = 0;
let failed = 0;
async function test(name, fn) {
  n++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 4).join('\n    ')}`);
  }
}

console.log('回归 · 速度 · 隐私（POLISHER-REG）');

await test('swatch worker: renders every material off the main thread and hands back a BMP (no canvas, no GPU read-back)', async () => {
  const sent = [];
  globalThis.self = { postMessage: (m) => sent.push(m) };
  const W = await import('../src/quiz/home/swatchWorker.js');
  assert.equal(typeof globalThis.self.onmessage, 'function');
  const ids = MATERIALS.map((m) => m.id);
  const t0 = performance.now();
  for (const id of ids) globalThis.self.onmessage({ data: { key: `${id}@112`, id, px: 112 } });
  const ms = performance.now() - t0;
  globalThis.self.onmessage({ data: { key: 'nope@96', id: 'nope', px: 96 } });
  assert.equal(sent.length, ids.length + 1);
  for (const m of sent.slice(0, -1)) {
    assert.ok(m.blob instanceof Blob, m.key);
    assert.equal(m.blob.type, 'image/bmp');
    assert.equal(m.blob.size, 54 + 112 * 3 * 112, m.key);
  }
  assert.ok(sent.at(-1).error, 'unknown material → error message, no crash');
  // the BMP is the swatch: header + the top-left pixel (bottom-up rows) = renderSwatch's first pixel
  const { renderSwatch } = await import('../src/shared/textures.js');
  const rgba = renderSwatch('walnut', 40);
  const u8 = new Uint8Array(await W.bmpBlob(rgba, 40).arrayBuffer());
  assert.equal(String.fromCharCode(u8[0], u8[1]), 'BM');
  const dv = new DataView(u8.buffer);
  assert.equal(dv.getInt32(18, true), 40);
  assert.equal(dv.getInt32(22, true), 40);
  assert.equal(dv.getUint16(28, true), 24);
  const top = 54 + 39 * 120; // file row 39 = image row 0 (row = 40·3 = 120 bytes)
  assert.deepEqual([u8[top + 2], u8[top + 1], u8[top]], [rgba[0], rgba[1], rgba[2]]);
  console.log(`    (${ids.length} swatches at 112 px in ${Math.round(ms)} ms on this machine, off the main thread in the app)`);
  delete globalThis.self;
});

await test('kit.jsx: swatches go to a module worker (main-thread idle path only as the fallback); covers ≤ 112 px; detail focus waits two frames', () => {
  const kit = read('src/quiz/home/kit.jsx');
  assert.match(kit, /new Worker\(new URL\('\.\/swatchWorker\.js', import\.meta\.url\), \{ type: 'module' \}\)/);
  assert.match(kit, /workerBroke/, 'a broken / silent worker falls back to the main thread');
  const card = read('src/quiz/home/CaseCard.jsx');
  assert.match(card, /export const COVER_PX_MAX = 112;/);
  assert.match(card, /Math\.min\(COVER_PX_MAX, px\)/);
  const detail = read('src/quiz/home/CaseDetail.jsx');
  assert.ok(!/px=\{480\}/.test(detail), 'no 480 px swatch cover');
  assert.match(detail, /requestAnimationFrame\(\(\) => \{\s*r2 = requestAnimationFrame\(\(\) => closeRef\.current\?\.focus\(\{ preventScroll: true \}\)\)/);
  assert.ok(!/\}\); \/\/ eslint-disable-line react-hooks\/exhaustive-deps/.test(detail), 'the key / focus effect no longer re-runs on every render');
});

await test('budget question is on (owner), and only on staff devices (Wish Mode / ?staff=1)', () => {
  assert.equal(CONFIG.home.askBudget, true);
  assert.equal(askBudgetOn({ config: CONFIG, wish: true }), true);
  assert.equal(askBudgetOn({ config: CONFIG, staff: true }), true);
  assert.equal(askBudgetOn({ config: CONFIG }), false);
});

await test('quiz: the retired palette / shelf pictures are not bundled (only their text labels stay for old profiles)', () => {
  const v = read('src/quiz/Vignette.jsx');
  assert.match(v, /'!\.\/vignettes\/img\/\{palette,shelf\}-\*\.webp'/);
  const left = fs.readdirSync(path.join(ROOT, 'src/quiz/vignettes/img')).filter((f) => /^(palette|shelf)-/.test(f));
  assert.deepEqual(left, []);
});

await test('sorter: first paint draws a few rows; off-screen rows keep a realistic placeholder height; thumbs lazy', () => {
  const s = read('src/cases/sorter/Sorter.jsx');
  const first = Number(/const FIRST = (\d+);/.exec(s)?.[1]);
  const step = Number(/const STEP = (\d+);/.exec(s)?.[1]);
  assert.ok(first > 0 && first <= 8, `FIRST ${first}`);
  assert.ok(step > 0 && step <= 8, `STEP ${step}`);
  const css = read('src/cases/sorter/sorter.css');
  assert.match(css, /\.so-row \{[^}]*content-visibility: auto;[^}]*contain-intrinsic-size: auto 520px;/s);
  assert.match(read('src/cases/sorter/Row.jsx'), /<img src=\{url\} alt="" loading="lazy" decoding="async"/);
});

await test('Wish Mode: sfx holds the last-pressed element only weakly (a closed staff panel / lead sheet is not kept alive between guests)', () => {
  const s = read('src/shared/sfx.js');
  assert.ok(!/el: res\.el\b/.test(s), 'press.el is not a strong reference');
  assert.match(s, /const weakEl = \(el\) => \(el && typeof WeakRef === 'function' \? new WeakRef\(el\) : el \|\| null\);/);
  assert.match(s, /this\.pending = \{ name, opts, at: now\(\), el: weakEl\(el\) \};/);
});

console.log(`\n${n - failed} / ${n} passed`);
if (failed) process.exit(1);
