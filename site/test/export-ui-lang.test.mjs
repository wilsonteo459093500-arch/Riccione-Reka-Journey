// 导出页组件的界面语言（components/SummaryCard.jsx、LangPicker.jsx、doc/DocPreview.jsx）：
//   - 统计卡片跟界面语言：English 界面（统计用界面语言算）没有中文；中英 = 中文 + 英文，不重复（「登记 Punch」）
//   - 文件语言选择：标题默认按界面语言；三个选项是语言自称，放在 data-lang-switch 里
//   - 文档预览的加载 / 页数提示按界面语言（预览页本身跟文件语言，带 data-doc-lang）
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]/;

const PROJECT = { id: 'p_t', name: 'Tuai Timur Residence', unit: '17-3', client: 'Hailey', address: 'Jalan Tuai Timur', startDate: '', plannedDays: 5 };
const SETTINGS = { name: 'Wilson', phone: '016-3881819', dept: 'Installation', company: 'Sail by Riccione Reka' };

async function open() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: ROOT,
    logLevel: 'silent',
    appType: 'custom',
    cacheDir: join(tmpdir(), 'tora-export-ssr-cache'),
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const require = createRequire(import.meta.url);
  const { createElement } = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const i18n = await server.ssrLoadModule('/src/lib/i18n.js');
  const report = await server.ssrLoadModule('/src/lib/report.js');
  const { TEMPLATES } = await server.ssrLoadModule('/src/templates/index.js');
  const SummaryCard = (await server.ssrLoadModule('/src/components/SummaryCard.jsx')).default;
  const LangPicker = (await server.ssrLoadModule('/src/components/LangPicker.jsx')).default;
  const html = (el, props) => renderToStaticMarkup(createElement(el, props));
  /** 新建报告 → 按界面语言算 summary（导出页 / 编辑页的做法） */
  const summaryIn = (template, lang) => {
    const r = report.createReport(template, { project: PROJECT, settings: SETTINGS, previous: [] });
    return template.summary(report.makeCtx({ template, report: r, project: PROJECT, settings: SETTINGS, lang }));
  };
  return { server, i18n, TEMPLATES, SummaryCard, LangPicker, html, summaryIn };
}

const text = (markup) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** 去掉 data-lang-switch 那一块（语言自称，两种人都要看得懂） */
const withoutSwitch = (markup) => markup.replace(/<div[^>]*data-lang-switch[^>]*>[\s\S]*?<\/div>/g, '');

export const tests = [
  ['统计卡片：English 界面没有中文；中文只中文；中英 = 中文 + 英文且不重复', async () => {
    const { server, i18n, TEMPLATES, SummaryCard, html, summaryIn } = await open();
    try {
      const withSummary = TEMPLATES.filter((t) => typeof t.summary === 'function');
      assert.ok(withSummary.length >= 3, '应有带自动统计的模板');
      for (const t of withSummary) {
        i18n.applyUiLang('en');
        const en = text(html(SummaryCard, { summary: summaryIn(t, 'en') }));
        assert.doesNotMatch(en, CJK, `${t.id} English 统计卡片还有中文：${en}`);
        assert.match(en, /Auto-calculated/);

        i18n.applyUiLang('zh');
        const zh = text(html(SummaryCard, { summary: summaryIn(t, 'zh') }));
        assert.match(zh, /自动计算/);
        assert.doesNotMatch(zh, /Auto-calculated|\bSummary\b/, `${t.id} 中文统计卡片带了英文：${zh}`);

        i18n.applyUiLang('both');
        const both = text(html(SummaryCard, { summary: summaryIn(t, 'both') }));
        assert.match(both, /自动计算 Auto-calculated/);
        assert.match(both, /Summary/, `${t.id} 中英统计卡片没有英文标题`);
      }
      // 「登记 Punch」/ Punch：中英时不写成「登记 Punch Punch」
      const qc = TEMPLATES.find((t) => t.id === 'quality-check');
      i18n.applyUiLang('both');
      const both = text(html(SummaryCard, { summary: summaryIn(qc, 'both') }));
      assert.match(both, /合格 Pass/);
      assert.match(both, /登记 Punch/);
      assert.doesNotMatch(both, /Punch Punch/);
      // 没有标题时的兜底
      i18n.applyUiLang('en');
      assert.match(text(html(SummaryCard, { summary: { items: [{ label: { zh: '合格', en: 'Pass' }, value: '1 item' }] } })), /^Summary Auto-calculated Pass 1 item$/);
      i18n.applyUiLang('zh');
      assert.match(text(html(SummaryCard, { summary: { items: [] } })), /^统计 自动计算$/);
    } finally {
      i18n.applyUiLang('zh');
      await server.close();
    }
  }],

  ['文件语言选择：标题默认跟界面语言；选项是语言自称（data-lang-switch）', async () => {
    const { server, i18n, LangPicker, html } = await open();
    try {
      i18n.applyUiLang('zh');
      const zh = html(LangPicker, { value: 'both', onChange() {} });
      assert.match(zh, /文件语言/);
      assert.match(zh, /role="radiogroup"[^>]*aria-label="文件语言"[^>]*data-lang-switch|data-lang-switch[^>]*role="radiogroup"/);
      for (const l of ['中文', 'English', '中英']) assert.ok(zh.includes(`>${l}</button>`), `缺少选项 ${l}`);

      i18n.applyUiLang('en');
      const en = html(LangPicker, { value: 'en', onChange() {}, hint: 'Fixed wording in the files' });
      assert.match(en, /Document language/);
      assert.match(en, /aria-label="Document language"/);
      assert.doesNotMatch(text(withoutSwitch(en)), CJK, `English 文件语言卡片（选项以外）还有中文：${text(en)}`);
      for (const l of ['中文', 'English', '中英']) assert.ok(en.includes(`>${l}</button>`), `English 界面也保留语言自称 ${l}`);

      // 调用方传的标题 / 说明原样显示（说明可多行）
      i18n.applyUiLang('both');
      const both = html(LangPicker, { value: 'zh', onChange() {}, title: '文件默认语言 Default document language', hint: '一\nOne' });
      assert.match(both, /文件默认语言 Default document language/);
      assert.match(both, /whitespace-pre-line[^>]*>一\nOne</);
    } finally {
      i18n.applyUiLang('zh');
      await server.close();
    }
  }],

  ['文档预览：加载提示跟界面语言', async () => {
    const { server, i18n, html } = await open();
    try {
      const DocPreview = (await server.ssrLoadModule('/src/components/doc/DocPreview.jsx')).default;
      const media = { get: async () => null };
      const model = { blocks: [] };
      i18n.applyUiLang('zh');
      assert.match(text(html(DocPreview, { model, media })), /正在排版预览…/);
      i18n.applyUiLang('en');
      const en = text(html(DocPreview, { model, media }));
      assert.match(en, /Preparing preview…/);
      assert.doesNotMatch(en, CJK);
    } finally {
      i18n.applyUiLang('zh');
      await server.close();
    }
  }],
];
