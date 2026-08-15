// 逐帧验证：导出的 HTML 在真实浏览器里 seek 得对不对。
//
// 需要 Playwright，所以不进默认的 `npm test`：
//   npm run test:browser
// 先跑一次 `npm test` 生成 test/out/post.html。

// Playwright 是可选依赖 —— 默认的 `npm test` 不需要它。
// 没装就说清楚怎么装，不要甩一个 ERR_MODULE_NOT_FOUND 给人猜。
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('这套需要 Playwright：\n  npm i -D playwright\n  npx playwright install chromium\n然后先跑一次 `npm test` 生成 test/out/post.html。');
  process.exit(1);
}
import assert from 'node:assert';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// post.html 由 `npm test` 里的 motion 套件生成到 test/out/
const DIR = join(dirname(fileURLToPath(import.meta.url)), 'out');
const URL = `file://${DIR}/post.html`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });

/** 停在某一时刻，回报画面上到底是什么状态 */
async function frameAt(t) {
  await page.goto(`${URL}?t=${t}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 5000 });
  return page.evaluate(() => {
    const slides = [...document.querySelectorAll('[data-slide]')].map((el, i) => ({
      i,
      opacity: Number(getComputedStyle(el).opacity),
      headline: el.querySelector('.headline')?.textContent || '',
      chars: [...el.querySelectorAll('[data-char]')].map((c) => Number(getComputedStyle(c).opacity)),
      rule: getComputedStyle(el.querySelector('[data-el="rule"]')).transform,
      bg: getComputedStyle(el.querySelector('[data-el="bg"]')).transform,
    }));
    return { slides, duration: window.compositionDuration };
  });
}

const visible = (f) => f.slides.filter((s) => s.opacity > 0.5);

// 每屏的中点：只有那一屏该是实的
const CHECKS = [
  { t: 1.2, slide: 0 },
  { t: 3.4, slide: 1 },
  { t: 5.5, slide: 2 },
  { t: 7.4, slide: 3 },
  { t: 9.7, slide: 4 },
];

for (const c of CHECKS) {
  const f = await frameAt(c.t);
  const v = visible(f);
  assert.strictEqual(v.length, 1, `${c.t}s 应该只有 1 屏可见，实际 ${v.length} 屏：${v.map((x) => x.i).join(',')}`);
  assert.strictEqual(v[0].i, c.slide, `${c.t}s 应该看到第 ${c.slide + 1} 屏，实际是第 ${v[0].i + 1} 屏`);
  // 停到这一屏的中点时，字应该已经全部进场完毕
  const dim = v[0].chars.filter((o) => o < 0.99).length;
  assert.strictEqual(dim, 0, `${c.t}s 第 ${c.slide + 1} 屏还有 ${dim} 个字没进完`);
  console.log(`  ${String(c.t).padStart(4)}s → 第 ${v[0].i + 1} 屏「${v[0].headline}」 ${v[0].chars.length} 字全实`);
}

// 第 0 帧：第一屏在，但字还没开始进
const f0 = await frameAt(0);
assert.strictEqual(visible(f0).length, 1, '0s 应该有 1 屏');
assert.strictEqual(visible(f0)[0].i, 0, '0s 应该是第 1 屏');
assert.ok(f0.slides[0].chars.every((o) => o < 0.01), '0s 主文案应该还没出现');
assert.ok(f0.slides[0].rule.includes('matrix'), '0s 下划线应该是 scaleX(0)');
console.log('     0s → 第 1 屏底已在，文字未进场 ✓');

// 逐字动画：中途那一帧，越靠前的字必须越实 —— 这才是「错开」真的生效了
const mid = await frameAt(0.42);
const cs = mid.slides[0].chars;
for (let i = 1; i < cs.length; i++) {
  assert.ok(cs[i] <= cs[i - 1] + 1e-6, `第 ${i} 个字(${cs[i]}) 比第 ${i - 1} 个字(${cs[i - 1]}) 还实，错开方向反了`);
}
assert.ok(cs[0] - cs[cs.length - 1] > 0.2, `0.42s 首尾字的差只有 ${(cs[0] - cs[cs.length - 1]).toFixed(2)}，几乎没错开`);
assert.ok(cs[0] > 0.9, '首字在 0.42s 应该基本进完');
console.log(`  0.42s → 逐字梯度 ${cs.map((o) => o.toFixed(2)).join(' → ')} ✓`);

// 叠化：交界处两屏都是半透明
const cross = await frameAt(2.32);
const partial = cross.slides.filter((s) => s.opacity > 0.02 && s.opacity < 0.98);
assert.ok(partial.length >= 1, `2.32s 交界处应该有屏在叠化，实际 ${JSON.stringify(cross.slides.map((s) => s.opacity))}`);
console.log(`  2.32s → 叠化中，${partial.length} 屏处于半透明 ✓`);

// 背景缓推真的在动（同一屏的两个时刻，transform 不同）
const a = await frameAt(4.9);
const b = await frameAt(6.6);
assert.notStrictEqual(a.slides[2].bg, b.slides[2].bg, '背景缓推没有变化');
console.log('  背景缓推在动 ✓');

// seek 必须是幂等的 —— 同一个 t 两次要给出完全一样的画面，否则逐帧渲染会抖
const r1 = await frameAt(5.5);
const r2 = await frameAt(5.5);
assert.deepStrictEqual(r1.slides, r2.slides, 'seek 不是确定性的');
console.log('  同一时刻两次 seek 结果一致 ✓');

// 抽三帧存图，肉眼确认
for (const t of [0.34, 3.4, 9.7]) {
  await page.goto(`${URL}?t=${t}`);
  await page.waitForSelector('body[data-ready="1"]');
  await page.screenshot({ path: join(DIR, `frame_${String(t).replace('.', '_')}.png`) });
}

// 不带 ?t= 时应该自己播起来
await page.goto(URL);
const p1 = await page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-slide="0"] [data-char="0"]')).opacity));
await page.waitForTimeout(700);
const p2 = await page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-slide="0"] [data-char="0"]')).opacity));
assert.ok(p2 > p1, `直接打开应该自动播放（${p1} → ${p2}）`);
console.log(`  直接打开自动播放 ✓（第 1 个字 ${p1.toFixed(2)} → ${p2.toFixed(2)}）`);

await browser.close();
console.log('\n✅ 浏览器端全部通过');
