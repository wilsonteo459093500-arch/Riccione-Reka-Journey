// 案例展示 · 界面这一层（src/quiz/home/CaseDetail.jsx · CaseGallery.jsx · Lightbox.jsx · CaseBrowser.jsx · CasesStep.jsx · BlueprintCases.jsx）
// 里面不碰画面的几样小规则：
//   「这个家用了」的板材名字（永远不出厂家编号 / 板材 id）· 几层弹出画面共用的滚动锁 · 相册的两指碰到 · 照片标签那一排滚到哪里 ·
//   全屏看图的两指捏完 / 转了 iPad · 眉题不断行 · 看全部的筛选不藏在自己的滚动框里 · 页脚 / 蓝图的字。
// .jsx 用 esbuild（Vite 自带）打包成一个临时的 ESM 再 import：src 里的 .js（cases.js、materials.js…）不打进去，
// 用 Node 自己的那一份 —— 和这里 import 的是同一个模块（板材登记表是同一张）。
// 跑法：node test/showcase-ui.test.mjs（npm test 会一起跑：test/showcase.test.mjs 最后 import 它）
//
// 板材是测试自己编的（id 用保留的前缀 TEST_ID_PREFIX，名字都是「测试…」，编号都是假的）。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as C from '../src/shared/cases.js';
import { CONFIG } from '../src/shared/config.js';
import { MAT_BY_ID, registerBoards, unregisterBoards } from '../src/shared/materials.js';
import { TEST_ID_PREFIX } from '../src/shared/boards/library-api.js';
import { setLang as setLang0, t } from '../src/shared/i18n.js';
import EN from '../src/shared/i18n/en.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src') + path.sep;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const setLang = (l) => setLang0(l, { reload: false });

let n = 0;
let failed = 0;
async function test(name, fn) {
  n++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 5).join('\n    ')}`);
  }
}

/** src 里的这个 .js（连它 import 的）Node 自己 import 得了吗（不碰 .css / .jsx，例如 fx.js 就 import 了 fx.css） */
const SAFE = new Map();
function nodeSafe(abs) {
  if (SAFE.has(abs)) return SAFE.get(abs);
  SAFE.set(abs, true);
  const deps = [...fs.readFileSync(abs, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?['"](\.\.?\/[^'"]+)['"]/g)].map((m) => path.resolve(path.dirname(abs), m[1]));
  const ok = deps.every((d) => /\.m?js$/.test(d) && fs.existsSync(d) && nodeSafe(d));
  SAFE.set(abs, ok);
  return ok;
}

/** 打包一个 .jsx（连它 import 的 .jsx、React、图标一起）；src 里 Node 自己 import 得了的 .js 不打进去（和测试用同一份） */
async function loadJsx(rel) {
  const r = await build({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    logLevel: 'silent',
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'src-js-external',
        setup(b) {
          b.onResolve({ filter: /^\.\.?\// }, (a) => {
            const abs = path.resolve(a.resolveDir, a.path);
            if (abs.startsWith(SRC) && /\.m?js$/.test(abs) && nodeSafe(abs)) return { path: pathToFileURL(abs).href, external: true };
            return undefined;
          });
        },
      },
    ],
  });
  const file = path.join(os.tmpdir(), `showcase-ui-${process.pid}-${path.basename(rel)}.mjs`);
  fs.writeFileSync(file, r.outputFiles[0].text);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

console.log('案例展示 · 界面（showcase-ui）');

const G = await loadJsx('src/quiz/home/CaseGallery.jsx');
const D = await loadJsx('src/quiz/home/CaseDetail.jsx');
const LB = await loadJsx('src/quiz/home/Lightbox.jsx');

// ───────────────────────── 1. 「这个家用了」：板材的名字 ─────────────────────────

const P = TEST_ID_PREFIX;
const rec = (id, hex, extra) => ({ id: `${P}${id}`, rev: 1, hex, kind: 'wood', finish: 'matte', near: 'walnut', ...extra });
const BOARDS = [
  rec('u7', '#5E4433', { seq: 7, code: 'XT-TP-81', name: { zh: '测试胡桃', en: 'Test walnut' } }),
  // 只有编号（「XT-TP-82.jpg」这种文件名）：没有名字 → 标签就是 id
  rec('u-noname', '#694330', { code: 'XT-TP-82' }),
  // 员工把编号当名字写进去了
  rec('u-codename', '#7A5A40', { code: 'XT883', name: { zh: 'XT883', en: 'XT883' } }),
  // 最接近的程序化材质不认得 → 只能说「溪岸板材」
  rec('u-nonear', '#806040', { code: 'XT-TP-84', near: 'no-such-material' }),
];
const B = Object.fromEntries(BOARDS.map((r) => [r.id.slice(P.length), r.id]));
const reg = registerBoards(BOARDS, { src: 'bundled' });
const FACTORY = /XT-TP-8|XT883/i;

await test('「这个家用了」：有客人的名字就用（「7号 · 名字」）；没有 → 最接近的材质的名字 →「溪岸板材」；永远不退回板材自己的标签（编号 / id）', async () => {
  assert.deepEqual(reg.skipped, []);
  const walnut = MAT_BY_ID.walnut;
  assert.ok(walnut && !walnut.board, 'walnut is a procedural material');
  for (const lang of ['zh', 'en']) {
    setLang(lang);
    try {
      assert.equal(D.matGuestName(MAT_BY_ID[B.u7]), C.boardGuestName(B.u7));
      assert.match(D.matGuestName(MAT_BY_ID[B.u7]), /7/);
      for (const id of [B['u-noname'], B['u-codename']]) {
        const name = D.matGuestName(MAT_BY_ID[id]);
        assert.ok(name, id);
        assert.ok(!FACTORY.test(name) && !name.includes(P) && !name.includes(id), `${lang} ${id} → ${name}`);
        assert.equal(name, C.boardGuestName(id) || (lang === 'en' ? walnut.en : walnut.zh), `${id}: guest name, else the near material`);
      }
      assert.equal(D.matGuestName(MAT_BY_ID[B['u-nonear']]), t('溪岸板材'), 'no near material → 溪岸板材');
      // 程序化材质：照旧是它自己的名字
      assert.equal(D.matGuestName(walnut), lang === 'en' ? walnut.en : walnut.zh);
      assert.equal(D.matGuestName(null), '');
    } finally {
      setLang('zh');
    }
  }
  // 板材整个关掉（boardGuestName 一律 ''）也不会把编号漏出来
  const had = Object.prototype.hasOwnProperty.call(CONFIG.boards, 'on');
  const was = CONFIG.boards.on;
  CONFIG.boards.on = false;
  try {
    for (const r of BOARDS) assert.ok(!FACTORY.test(D.matGuestName(MAT_BY_ID[r.id])), r.id);
  } finally {
    if (had) CONFIG.boards.on = was;
    else delete CONFIG.boards.on;
  }
  assert.ok(EN['溪岸板材'], '溪岸板材 has English');
  // 详情里「这个家用了」那一格用的就是它
  assert.match(read('src/quiz/home/CaseDetail.jsx'), /<b>\{matGuestName\(mat\)\}<\/b>/);
  assert.ok(!/boardGuestName\(mat\.id\) \|\| L\(mat\)/.test(read('src/quiz/home/CaseDetail.jsx')), 'no fallback to the raw board label');
});

// ───────────────────────── 2. 滚动锁（几层弹出画面一起拿掉也还原） ─────────────────────────

await test('滚动锁：几层共用一个、数着用；按「父亲先、孩子后」一起拿掉（许愿模式整页重来）也还原成原来的值；放开两次只算一次', () => {
  const html = { style: { overflow: '' } };
  const had = 'document' in globalThis;
  const old = globalThis.document;
  globalThis.document = { documentElement: html };
  try {
    const browser = G.lockScroll();
    assert.equal(html.style.overflow, 'hidden');
    const detail = G.lockScroll();
    const lightbox = G.lockScroll();
    // React 18 拿掉整棵树：父亲的清理先跑
    browser();
    assert.equal(html.style.overflow, 'hidden', 'still locked while the detail / lightbox are up');
    detail();
    detail();
    assert.equal(html.style.overflow, 'hidden', 'a second unlock from the same layer does not count');
    lightbox();
    assert.equal(html.style.overflow, '', 'last one out restores the page');
    // 原来就有值的：还原成原来的
    html.style.overflow = 'clip';
    const a = G.lockScroll();
    const b = G.lockScroll();
    a();
    b();
    assert.equal(html.style.overflow, 'clip');
  } finally {
    if (had) globalThis.document = old;
    else delete globalThis.document;
  }
  // 三层都用它（不再自己记、自己还原）
  for (const f of ['CaseDetail.jsx', 'CaseBrowser.jsx', 'Lightbox.jsx']) {
    const s = read(`src/quiz/home/${f}`);
    assert.match(s, /const unlock = lockScroll\(\);/, f);
    assert.match(s, /\bunlock\(\);/, f);
    assert.ok(!/style\.overflow = prev/.test(s), `${f}: no own save / restore`);
  }
});

// ───────────────────────── 3. 相册：两指碰到 ─────────────────────────

await test('相册：第二根手指不拖、不换照片（正在拖的那一下放掉、弹回来）；只有开始拖的那根手指放开才结束', () => {
  const touch = (id, primary = true) => ({ pointerId: id, pointerType: 'touch', isPrimary: primary });
  const drag = { id: 1, type: 'touch' };
  assert.equal(G.secondTouch(null, touch(1)), false, 'first finger starts a drag');
  assert.equal(G.secondTouch(drag, touch(2, false)), true, 'second finger (not primary)');
  assert.equal(G.secondTouch(drag, { pointerId: 2, pointerType: 'touch' }), true, 'second finger, browser without isPrimary');
  assert.equal(G.secondTouch(null, touch(2, false)), true, 'a non-primary finger never starts a drag');
  assert.equal(G.secondTouch(drag, touch(1)), false, 'same finger');
  assert.equal(G.secondTouch({ id: 1, type: 'mouse' }, { pointerId: 1, pointerType: 'mouse', isPrimary: true }), false, 'mouse: a stale drag is simply replaced');
  const s = read('src/quiz/home/CaseGallery.jsx');
  assert.match(s, /if \(secondTouch\(drag\.current, e\)\) \{\s*if \(drag\.current\) \{\s*drag\.current = null;\s*snapBack\(\);/);
  // onUp：先比对是不是同一根手指，才清掉
  assert.match(s, /const onUp = \(e\) => \{\s*const d = drag\.current;[^]*?if \(!d \|\| d\.id !== e\.pointerId\) return;\s*drag\.current = null;/);
});

// ───────────────────────── 4. 照片标签那一排 ─────────────────────────

await test('照片标签：现在这个完整露出来（不压在淡出去的那一截里）；停在两个标签中间（最左边不会只剩半个字）；看得到就不动', () => {
  const FADE = 22;
  const GAP = 6;
  // 十个标签，各 100 宽，中间空 6；看得到 400 宽
  const chips = Array.from({ length: 10 }, (_, k) => ({ x: 3 + k * 106, w: 100 }));
  const max = chips[9].x + 100 + 21 - 400;
  const clear = (L, a) => {
    const c = chips[a];
    return c.x - L >= (L > 1 ? FADE : 0) - 0.5 && L + 400 - (c.x + c.w) >= (L < max - 1 ? FADE : 0) - 0.5;
  };
  const aligned = (L) => L === 0 || chips.some((c, k) => k && Math.abs(L - (c.x - GAP)) < 1);
  assert.equal(G.tabScroll(chips, 0, 0, 400, max, FADE, GAP), null, 'already in view');
  assert.equal(G.tabScroll(chips, 2, 0, 400, max, FADE, GAP), null, 'already in view');
  for (let a = 3; a < 9; a++) {
    const L = G.tabScroll(chips, a, 0, 400, max, FADE, GAP);
    assert.ok(L != null && clear(L, a), `chip ${a} clear of the fades at ${L}`);
    assert.ok(aligned(L), `chip ${a}: stops between two chips (${L})`);
  }
  // 最后一个：对齐的位置都放不下 → 最右边（CaseGallery 会在最后补上空，让最右边也正好在两个标签中间）
  assert.equal(G.tabScroll(chips, 9, 0, 400, max, FADE, GAP), Math.round(max));
  assert.equal(G.tabScroll(chips, 0, max, 400, max, FADE, GAP), 0, 'back to the first one');
  assert.equal(G.tabScroll(chips, 42, 0, 400, max, FADE, GAP), null);
  const css = read('src/quiz/home/showcase.css');
  for (const cls of ['.cv-tabs.is-l', '.cv-tabs.is-r', '.cv-tabs.is-l.is-r']) assert.ok(css.includes(`${cls} {`), cls);
  assert.ok(!/\.cv-tabs \{[^}]*mask-image/.test(css), 'no fade on a side that cannot scroll');
});

// ───────────────────────── 5. 全屏看图：捏完 / 转了 iPad ─────────────────────────

await test('全屏看图：捏到不到 1.05 倍放手 → 回到 1×，剩下那根手指不接着拖（不会又放大一点点、左右滑照样换照片）；还放大着才接着拖', () => {
  const rest = { x: 300, y: 200 };
  for (const s of [1, 1.01, 1.03, 1.049]) {
    const e = LB.pinchEnd({ s, x: 4, y: -2 }, rest, 5);
    assert.deepEqual(e.z, { s: 1, x: 0, y: 0 }, `s=${s}`);
    assert.equal(e.g, null, `s=${s}: the remaining finger does nothing`);
  }
  const e = LB.pinchEnd({ s: 1.6, x: 12, y: -8 }, rest, 5);
  assert.deepEqual(e.z, { s: 1.6, x: 12, y: -8 });
  assert.deepEqual(e.g, { kind: 'pan', x0: 300, y0: 200, t0: 5, z0: { s: 1.6, x: 12, y: -8 }, moved: true });
  assert.equal(LB.pinchEnd({ s: 2, x: 0, y: 0 }, null).g, null, 'both fingers up → no gesture');
  const s = read('src/quiz/home/Lightbox.jsx');
  assert.match(s, /const end = pinchEnd\(z\.current, rest, performance\.now\(\)\);\s*g\.current = end\.g;/);
});

await test('全屏看图：转了 iPad（4:3 照片放大 4 倍、拖到最上面）→ 按新的大小重新夹回来，不会露出一条黑边', () => {
  // 横放 1180 × 820（许愿模式）：照片 797 × 598，照片中心比屏幕中心高 47 → 最多拖到 y = 833
  const land = LB.clampPan(4, 0, 9999, { w: 797, h: 598 }, { w: 1180, h: 820 }, -47);
  assert.equal(land.y, 833);
  // 竖放 820 × 1180：照片 820 × 615 → 最多 687（以前留着 833：上面一条 146 px 的黑边）
  const port = LB.clampPan(4, land.x, land.y, { w: 820, h: 615 }, { w: 820, h: 1180 }, -47);
  assert.equal(port.y, 687);
  assert.equal(LB.clampPan(1, 50, 50, { w: 820, h: 615 }, { w: 820, h: 1180 }, -47).x, 0, 'smaller than the screen → centred');
  const s = read('src/quiz/home/Lightbox.jsx');
  assert.match(s, /useLayoutEffect\(\(\) => \{\s*if \(z\.current\.s > 1\) setZoom\(z\.current\.s, z\.current\.x, z\.current\.y\);\s*\}, \[vp\.w, vp\.h\]\);/);
});

// ───────────────────────── 6. 字 / 版面 ─────────────────────────

await test('详情眉题：「约 1,180 sq ft」整个不断行；中文界面不转大写（SQ FT）—— 只改详情这一个眉题', () => {
  const c = { property: { type: 'condo', bedrooms: 3, bathrooms: 2, sizeSqft: 1180 } };
  const zh = D.placeOf(c);
  assert.ok(zh.includes('约 1,180 sq ft'), zh);
  setLang('en');
  try {
    assert.ok(D.placeOf(c).endsWith('~1,180 sq ft'), D.placeOf(c));
  } finally {
    setLang('zh');
  }
  const css = read('src/quiz/home/showcase.css');
  assert.match(css, /html:not\(\[lang='en'\]\) \.cv-sheet \.cs-info > \.eyebrow \{\s*text-transform: none;/);
});

await test('看全部（≥ 1000 px）：筛选不藏在自己的滚动框里（跟着页面滚，放得下才贴着不动）', () => {
  const css = read('src/quiz/home/showcase.css');
  const wide = css.slice(css.indexOf('@media (min-width: 1000px)'));
  const rule = /\.cv-br-filters \{([^}]*)\}/.exec(wide)?.[1] || '';
  assert.ok(!/overflow|max-height|position/.test(rule), rule);
  assert.match(wide, /\.cv-br-filters\.is-stick \{\s*position: sticky;/);
  assert.match(read('src/quiz/home/CaseBrowser.jsx'), /className=\{`cv-br-filters \$\{stick \? 'is-stick' : ''\}`\}/);
});

await test('案例那一步：只选了一个 →「就用这一个」/ Use this one；蓝图的按钮和案例那一步同一句「看全部 {0} 个家」；页脚不透出后面的字', () => {
  assert.equal(EN['就用这一个'], 'Use this one');
  assert.match(read('src/quiz/home/CasesStep.jsx'), /chosen\.length === 1 \? t\('就用这一个'\)/);
  const bp = read('src/quiz/home/BlueprintCases.jsx');
  assert.match(bp, /t\('看全部 \{0\} 个家', \[total\]\)/);
  assert.ok(!/更多案例'/.test(bp));
  const home = read('src/quiz/home/home.css');
  assert.match(home, /\.cs-foot \{[^}]*background: linear-gradient\(rgba\(var\(--bg-rgb\), 0\), var\(--bg\) 22px\);/);
  assert.match(home, /\.cs-wrap \{[^}]*padding: clamp\(28px, 7vh, 86px\) 28px calc\(130px \+ env\(safe-area-inset-bottom\)\);/);
});

unregisterBoards(BOARDS.map((r) => r.id), { src: 'bundled' });
console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
