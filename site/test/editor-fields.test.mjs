// 填写页字段的界面语言（components/fields/FieldInput.jsx）：
//   - English 界面：新建时自动带入的中文固定文字（默认规定 / 物料、预计工期、落款「安装部」、工地称呼全角括号）
//     在输入框里按字段 display 显示成英文；存的值不变（中文 / 中英文件不受影响）
//   - 中文 / 中英界面：照旧显示存的值
//   - 字段标签：中文只中文、English 只英文、中英 = 中文 + 英文小字
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]/;

const PROJECT = { id: 'p_t', name: 'Tuai Timur Residence', unit: '17-3', client: 'Hailey', address: '', startDate: '', plannedDays: 5 };
const SETTINGS = { name: 'Wilson', phone: '016-3881819', dept: '安装部' };

/** Vite SSR 加载 FieldInput（和它用到的 i18n / 模板是同一份模块实例） */
async function open() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: ROOT,
    logLevel: 'silent',
    appType: 'custom',
    cacheDir: join(tmpdir(), 'tora-editor-ssr-cache'),
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const require = createRequire(import.meta.url);
  const { createElement } = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const i18n = await server.ssrLoadModule('/src/lib/i18n.js');
  const report = await server.ssrLoadModule('/src/lib/report.js');
  const { TEMPLATES } = await server.ssrLoadModule('/src/templates/index.js');
  const fi = await server.ssrLoadModule('/src/components/fields/FieldInput.jsx');
  const html = (el, props) => renderToStaticMarkup(createElement(el, props));
  const byId = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
  const field = (tid, key) => byId[tid].sections.flatMap((s) => s.fields || []).find((f) => f.key === key);
  /** 新建一份报告 + lang = 'en' 的上下文（编辑页传给 FieldInput 的 displayCtx） */
  const make = (tid) => {
    const template = byId[tid];
    const r = report.createReport(template, { project: PROJECT, settings: SETTINGS, previous: [] });
    const ctxEn = report.makeCtx({ template, report: r, project: PROJECT, settings: SETTINGS, lang: 'en' });
    return { template, r, ctxEn };
  };
  return { server, i18n, fi, html, field, make };
}

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** 输入框 / 多行框里的值 */
const inputValues = (markup) => [
  ...[...markup.matchAll(/<input\b[^>]*>/g)].map((m) => decode(/\svalue="([^"]*)"/.exec(m[0])?.[1] ?? '')),
  ...[...markup.matchAll(/<textarea\b[^>]*>([^<]*)<\/textarea>/g)].map((m) => decode(m[1])),
];

/** 自动带入、带 display 的字段：[模板, 字段] */
const AUTO = [
  ['daily-report', 'duration'],
  ['daily-report', 'dept'],
  ['daily-report', 'address'],
  ['site-notice', 'rules'],
  ['site-notice', 'beforeLeave'],
  ['site-notice', 'materials'],
  ['site-notice', 'entryNote'],
  ['site-notice', 'parking'],
  ['quality-check', 'project'],
];

export const tests = [
  ['English 界面：自动带入的中文固定文字在输入框里显示成英文，存的值不变；中文 / 中英照旧', async () => {
    const { server, i18n, fi, html, field, make } = await open();
    try {
      for (const [tid, key] of AUTO) {
        const f = field(tid, key);
        assert.ok(f && typeof f.display === 'function', `${tid}.${key} 应有 display`);
        const { r, ctxEn } = make(tid);
        const stored = r.values[key];
        const flat = [].concat(stored ?? []).join('\n');
        assert.ok(flat && CJK.test(flat), `${tid}.${key} 自动带入的值应是中文写法：${flat}`);
        const before = JSON.stringify(stored);

        i18n.applyUiLang('en');
        const shown = fi.uiShownValue(f, stored, ctxEn);
        assert.doesNotMatch([].concat(shown).join('\n'), CJK, `${tid}.${key} English 界面仍显示中文：${shown}`);
        // 输入框里显示的就是英文写法
        const markup = html(fi.default, { field: f, value: stored, onChange() {}, displayCtx: ctxEn });
        const vals = inputValues(markup).filter(Boolean);
        assert.ok(vals.length, `${tid}.${key} 没渲染出输入框`);
        for (const v of vals) assert.doesNotMatch(v, CJK, `${tid}.${key} 输入框里还是中文：${v}`);
        assert.equal(JSON.stringify(stored), before, '显示不能改到存的值');

        for (const lang of ['zh', 'both']) {
          i18n.applyUiLang(lang);
          assert.equal(fi.uiShownValue(f, stored, ctxEn), stored, `${lang} 界面应原样显示存的值`);
          const m = html(fi.default, { field: f, value: stored, onChange() {}, displayCtx: ctxEn });
          assert.ok(inputValues(m).some((v) => CJK.test(v)), `${tid}.${key} ${lang} 界面输入框应是存的中文`);
        }
      }
    } finally {
      i18n.applyUiLang('zh');
      await server.close();
    }
  }],
  ['English 界面：自己写 / 改过的值原样显示；列表只换与默认相同的行', async () => {
    const { server, i18n, fi, field, make } = await open();
    try {
      i18n.applyUiLang('en');
      const { r, ctxEn } = make('site-notice');
      const rules = field('site-notice', 'rules');
      const mixed = ['电梯只可用货梯', r.values.rules[0], 'Bring own ladder'];
      const shown = fi.uiShownValue(rules, mixed, ctxEn);
      assert.equal(shown.length, 3);
      assert.equal(shown[0], '电梯只可用货梯', '自己写的中文行不换');
      assert.doesNotMatch(shown[1], CJK, '默认行换成英文');
      assert.equal(shown[2], 'Bring own ladder');
      const materials = field('site-notice', 'materials');
      assert.equal(fi.uiShownValue(materials, '板材 3 包', ctxEn), '板材 3 包');
      const d = make('daily-report');
      assert.equal(fi.uiShownValue(field('daily-report', 'dept'), '安装二组', d.ctxEn), '安装二组');
      // 没有 displayCtx（如表格列、检查项里的输入）→ 原样
      assert.equal(fi.uiShownValue(materials, r.values.materials, null), r.values.materials);
    } finally {
      i18n.applyUiLang('zh');
      await server.close();
    }
  }],
  ['字段标签：中文只中文、English 只英文、中英 = 中文 + 英文小字', async () => {
    const { server, i18n, fi, html } = await open();
    try {
      const f = { key: 'x', type: 'text', label: { zh: '物料', en: 'Materials' }, required: true };
      const text = (lang) => {
        i18n.applyUiLang(lang);
        return html(fi.FieldLabel, { field: f }).replace(/<[^>]+>/g, '|');
      };
      assert.match(text('zh'), /物料/);
      assert.doesNotMatch(text('zh'), /Materials/);
      assert.match(text('en'), /Materials/);
      assert.doesNotMatch(text('en'), CJK);
      assert.match(text('both'), /物料.*Materials/);
      // 选项按钮（≤ 4 个选项的 select / radio / yesno）
      const yn = { key: 'y', type: 'yesno', label: 'y' };
      i18n.applyUiLang('en');
      const en = html(fi.default, { field: yn, value: '', onChange() {} });
      assert.match(en, />Yes</);
      assert.doesNotMatch(en, CJK);
      i18n.applyUiLang('zh');
      const zh = html(fi.default, { field: yn, value: '', onChange() {} });
      assert.match(zh, />是</);
      assert.doesNotMatch(zh, /Yes/);
    } finally {
      i18n.applyUiLang('zh');
      await server.close();
    }
  }],
];
