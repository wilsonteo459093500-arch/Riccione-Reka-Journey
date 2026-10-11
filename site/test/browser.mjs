// 浏览器测试：每个模板 × 语言 × 变体 → 生成 PDF + 手机宽度预览截图（npm run test:browser）
//   双语 both：full / empty / long（和以前一样）
//   中文 zh：full / empty / long；英文 en：full / empty / long / english（用户填写的内容全是英文）
//     / enraw（同上，自动带入的「项目（客户）」保持 App 原样）/ enempty（英文项目 + 出厂设置新建、没填：App 写的默认值原样）
// 每页内容都不能溢出（溢出 = 被裁掉）；long（超长备注 / 填写 / 单元格 / 多行文字）另查每段末尾标记都看得到、
// 手机预览缩放后分页和 PDF 一样。
// 语言检查（截图前的 DOM 文字）：
//   en + english / enraw / enempty：一个中文字都不能有；zh：渲染器写死的英文（Check Item / Page n of N / Generated…）一个都不能有。
//   出自模型的（模板固定文字、选项、App 自动带入的值 / 默认值没按语言出）记为 ⚠ 警告；STRICT=1 时警告也算失败（验收用）。
// 产物：test/out/<id>-<variant>.pdf、test/out/<id>-preview.png；单语加语言前缀 <id>-<lang>-<variant>.pdf
// 用法：node test/browser.mjs [模板 id 子串]
//   环境变量：LANGS=both,zh,en  VARIANTS（双语）  ZH_VARIANTS  EN_VARIANTS  STRICT=1
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'out');
mkdirSync(OUT, { recursive: true });
const only = process.argv[2];
const VARIANTS = (process.env.VARIANTS || 'full,empty,long').split(',');
const PLAN = {
  both: VARIANTS,
  zh: (process.env.ZH_VARIANTS || 'full,empty,long').split(','),
  en: (process.env.EN_VARIANTS || 'full,empty,long,english,enraw,enempty').split(','),
};
const LANGS = (process.env.LANGS || 'both,zh,en').split(',').filter((l) => PLAN[l]);
const STRICT = process.env.STRICT === '1';
const EN_CONTENT = ['english', 'enraw', 'enempty']; // 英文项目的夹具（harness.jsx）

// ---- 语言检查 ----
const CJK_RUN = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]+/g;
// 渲染器（components/doc）自己写死的英文：中文文件里一个都不能出现
const RENDER_EN = /\b(No\.|Check Item|Standard|Method|Result|Remarks?|Page \d+ of|cont\.|photos?|PHOTOS?|Video|Missing|video shared separately|No photos|Name|Date|Generated|DELIVERY SYSTEM|Conclusion|CONCLUSION|\d+ items?)(?![\w-])/g;
// 渲染器写死的中文：英文文件里一个都不能出现（english 夹具时整份文件都不能有中文，这个是兜底的归因）
const RENDER_ZH = ['检查项目', '检查项与标准', '标准要求', '检查方法', '判定', '照片缺失', '视频请见群组', '未附照片', '姓名', '日期', '生成', '交付体系', '（续', '其中关键项', '结论', '影像'];
const WORD = /[A-Za-z][A-Za-z'’-]*/g;
// 中文原表本来就用的缩写 / 专有名词（中文文件里出现没问题）
const ABBR = /^(PDF|SO|Punch|GO|NO-GO|NA|mm|cm|V-SMOOTH|SAIL|Sail|SS|PIC|OK|QC|ID|WhatsApp|Lark)$/;
const around = (text, at, len) => JSON.stringify(text.slice(Math.max(0, at - 18), at + len + 18).replace(/\s+/g, ' '));

/**
 * 页面文字的语言检查 → { errors（渲染器的问题）, warnings（出自模型 / 模板固定文字） }
 * 模型里出现过的字符串 = 模板 / 用户数据；不在模型里的 = 渲染器自己加的
 */
function langIssues({ lang, variant, text, modelStrings, enHalves, userCJK, own }) {
  const errors = [];
  const warnings = [];
  const inModel = (frag) => modelStrings.some((s) => s.includes(frag));
  if (lang === 'en') {
    // 英文项目的夹具：整份文件不能有中文（enraw / enempty 里 App 自动带入的值 / 默认值算模型，不算夹具错误）
    if (EN_CONTENT.includes(variant)) {
      if (variant === 'english' && userCJK.length) errors.push(`english 夹具的用户数据里有中文：${userCJK.slice(0, 5).join(' | ')}`);
      for (const m of text.matchAll(CJK_RUN)) {
        const where = around(text, m.index, m[0].length);
        (inModel(m[0]) ? warnings : errors).push(`英文文件里有中文 ${JSON.stringify(m[0])}：${where}${inModel(m[0]) ? '（出自模型 / 模板）' : ''}`);
      }
    }
    for (const w of RENDER_ZH) {
      const at = text.indexOf(w);
      if (at >= 0 && !inModel(w)) errors.push(`英文文件里有渲染器的中文 ${JSON.stringify(w)}：${around(text, at, w.length)}`);
    }
  }
  if (lang === 'zh') {
    for (const m of text.matchAll(RENDER_EN)) {
      if (!inModel(m[0])) errors.push(`中文文件里有渲染器的英文 ${JSON.stringify(m[0])}：${around(text, m.index, m[0].length)}`);
    }
    // 双语标签的英文那一半（Pass / Remarks / Inspector…）不应出现在中文文件里
    for (const en of enHalves) {
      const re = new RegExp(`(^|[^\\w])${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`);
      const m = re.exec(text);
      if (m) warnings.push(`中文文件里有双语标签的英文 ${JSON.stringify(en)}：${around(text, m.index, en.length + 1)}`);
    }
    // 其余英文单词：要么出自中文标签 / 用户填写 / 公司名，要么是原表本来就用的缩写，否则是模板里没按语言出的英文
    const ok = new Set(own.join(' ').match(WORD) || []);
    const stray = new Map();
    for (const m of text.matchAll(WORD)) {
      const w = m[0];
      if (w.length < 2 || ABBR.test(w) || ok.has(w) || [...ok].some((x) => x.startsWith(w))) continue;
      if (!stray.has(w)) stray.set(w, around(text, m.index, w.length));
    }
    if (stray.size) warnings.push(`中文文件里的英文单词 ${[...stray.keys()].slice(0, 20).join(' ')}（如 ${[...stray.values()][0]}）`);
  }
  return { errors, warnings };
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const require = createRequire(import.meta.url);
    for (const p of ['/opt/node22/lib/node_modules/playwright', 'playwright']) {
      try {
        return require(p);
      } catch {
        /* 下一个 */
      }
    }
    throw new Error('找不到 Playwright：npm i -g playwright 或设置 NODE_PATH');
  }
}

/** 逐个 import 模板（未写完 / 报错的跳过） */
async function templateIds() {
  const dir = join(ROOT, 'src', 'templates');
  const ids = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.js') || ['index.js', 'schema.js', 'helpers.js'].includes(f)) continue;
    try {
      const t = (await import(pathToFileURL(join(dir, f)).href)).default;
      if (t?.id && Array.isArray(t.sections)) ids.push({ id: t.id, stage: t.stage || 99 });
    } catch (e) {
      console.log(`  - 跳过 ${f}: ${e.message}`);
    }
  }
  return ids.sort((a, b) => a.stage - b.stage).map((x) => x.id);
}

const pdfPages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

/** 预览里每页内容框的溢出（scrollHeight > clientHeight = 有内容被裁掉） */
const overflowed = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-page-body]')]
      .map((b, i) => ({ page: i + 1, over: b.scrollHeight - b.clientHeight }))
      .filter((x) => x.over > 0),
  );

/** 标记文字是否在某页内容框的可见区域里（DOM 里有但被裁掉的不算） */
const invisibleMarkers = (page) =>
  page.evaluate(() =>
    (window.__longMarkers || []).filter(
      (mk) =>
        ![...document.querySelectorAll('[data-page-body]')].some((box) => {
          const cb = box.getBoundingClientRect();
          const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = walker.nextNode())) {
            const at = n.data.indexOf(mk);
            if (at < 0) continue;
            const rg = document.createRange();
            rg.setStart(n, at);
            rg.setEnd(n, at + mk.length);
            const r = rg.getBoundingClientRect();
            if (r.height > 0 && r.top >= cb.top - 1 && r.bottom <= cb.bottom + 1) return true;
          }
          return false;
        }),
    ),
  );

const ids = (await templateIds()).filter((id) => !only || id.includes(only));
const { chromium } = await loadPlaywright();
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const BASE = (server.resolvedUrls?.local?.[0] || `http://127.0.0.1:${server.httpServer.address().port}/`).replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

let pass = 0;
let fail = 0;
let warned = 0;
const counts = {}; // `${id}/${lang}/${variant}` → 页数
const runs = [];
for (const id of ids) for (const lang of LANGS) for (const variant of PLAN[lang]) runs.push({ id, lang, variant });
try {
  for (const { id, lang, variant } of runs) {
    const both = lang === 'both';
    const label = both ? `${id} › ${variant}` : `${id} › ${lang} › ${variant}`;
    const tag = both ? variant : `${lang}-${variant}`;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'zh-CN' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`console: ${m.text()}`);
    });
    try {
      await page.goto(`${BASE}/test/harness.html?t=${encodeURIComponent(id)}&v=${variant}${both ? '' : `&lang=${lang}`}`);
      await page.getByText('与导出的 PDF 一致').waitFor({ timeout: 60000 });
      const previewPages = await page.locator('[data-page]').count();
      assert.ok(previewPages >= 1, '预览没有页面');
      const over = await overflowed(page);
      assert.deepEqual(over, [], `内容超出页面被裁掉：${JSON.stringify(over)}`);
      if (variant === 'long') {
        const marks = await page.evaluate(() => window.__longMarkers.length);
        assert.ok(marks > 0, 'long 变体没有标记');
        const missing = await invisibleMarkers(page);
        assert.deepEqual(missing, [], `长内容末尾看不到（被裁掉 / 丢了）：${missing.join(' ')}`);
        // 没封面的视频显示「视频 Video」占位、0 字节照片显示「照片缺失」占位（不是坏图）；单语只写一种
        if (await page.evaluate(() => window.__model.blocks.some((b) => b.type === 'checklist'))) {
          const PH = { both: ['视频 Video', '照片缺失 Missing'], zh: ['视频', '照片缺失'], en: ['Video', 'Missing'] }[lang];
          assert.ok((await page.getByText(PH[0], { exact: true }).count()) >= 1, '没封面的视频没有显示占位');
          assert.ok((await page.getByText(PH[1], { exact: true }).count()) >= 1, '0 字节照片没有显示「缺失」');
        }
        // 手机预览缩放（343 / 366 / 390px 宽）和 PDF（不缩放）每页内容一样，包括几十页的全部超长报告
        const diffs = await page.evaluate(() => window.__scaleCheck());
        assert.deepEqual(diffs, [], `预览缩放后分页和 PDF 不一样：${diffs.join('；')}`);
      }
      // 语言：模型带的语言对不对 + 页面文字检查
      assert.equal(await page.evaluate(() => window.__model.meta.lang || 'both'), lang, '文档模型的语言不对');
      if (!both) {
        const data = await page.evaluate(() => window.__langData());
        const { errors: le, warnings: lw } = langIssues({ lang, variant, ...data });
        assert.deepEqual(le, [], `语言检查不通过：\n      ${le.slice(0, 12).join('\n      ')}`);
        if (lw.length) {
          warned += lw.length;
          console.log(`  ⚠ ${label}: ${lw.length} 处出自模板固定文字\n      ${lw.slice(0, 6).join('\n      ')}`);
          if (STRICT) assert.deepEqual(lw, [], 'STRICT：模板固定文字没按语言出');
        }
      }
      if (variant === 'full' || EN_CONTENT.includes(variant)) {
        await page.waitForTimeout(150);
        await page.screenshot({ path: join(OUT, both ? `${id}-preview.png` : `${id}-${tag}-preview.png`), fullPage: true });
      }
      const b64 = await page.evaluate(() => window.__exportPdf());
      const buf = Buffer.from(b64, 'base64');
      assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-', '不是 PDF');
      const n = pdfPages(buf);
      assert.ok(n >= 1, 'PDF 没有页面');
      assert.equal(n, previewPages, `PDF 页数 ${n} ≠ 预览页数 ${previewPages}`);
      const ms = await page.evaluate(() => window.__exportMs);
      assert.equal(await page.evaluate(() => window.__exportClipped), 0, 'PDF 里有内容被截断（clipped > 0）');
      writeFileSync(join(OUT, `${id}-${tag}.pdf`), buf);
      counts[`${id}/${lang}/${variant}`] = n;
      // 每页一张图（发群用）：只抽第一个模板测，省时间
      if (both && id === ids[0] && variant === VARIANTS[0]) {
        const imgs = await page.evaluate(() => window.__exportImages());
        assert.equal(imgs.length, n, '图片张数 ≠ 页数');
        for (const b of imgs) assert.ok(b.startsWith('/9j/'), '不是 JPEG');
        writeFileSync(join(OUT, `${id}-page1.jpg`), Buffer.from(imgs[0], 'base64'));
        // 截图失败：中文提示、不漏 html2canvas 克隆 iframe；偶发失败降分辨率重试成功
        const f = await page.evaluate(() => window.__exportFailures());
        assert.match(f.permanent, /内存不足/, `截图失败的提示不对：${f.permanent}`);
        assert.equal(f.leakedAfterPermanent, 0, '截图失败后留下了 html2canvas iframe');
        assert.equal(f.transient, 'ok', '偶发截图失败没有重试成功');
        assert.ok(f.transientRetried, '偶发截图失败没有走重试');
        assert.equal(f.leakedAfterTransient, 0, '重试后留下了 html2canvas iframe');
      }
      assert.deepEqual(errors, [], errors.join('\n'));
      pass += 1;
      console.log(`  ✓ ${label}: ${n} 页 · ${(buf.length / 1024).toFixed(0)} KB · ${ms} ms`);
    } catch (e) {
      fail += 1;
      console.log(`  ✗ ${label}\n    ${e?.stack || e}${errors.length ? `\n    ${errors.join('\n    ')}` : ''}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
writeFileSync(join(OUT, 'page-counts.json'), `${JSON.stringify(counts, null, 2)}\n`);
console.log(`\n${pass} passed, ${fail} failed${warned ? ` · ⚠ ${warned} 处模板固定文字没按语言出` : ''} · 产物在 test/out/（页数：page-counts.json）`);
process.exit(fail ? 1 : 0);
