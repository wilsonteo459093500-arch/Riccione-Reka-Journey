// 文件语言：中文 / English / 中英（lib/lang.js + 文档模型 + 七个模板）
import assert from 'node:assert/strict';
import { LANGS, normLang, reportLang, tx, localize, localizeDeep, labelParts, labelText, latinOnly } from '../src/lib/lang.js';
import { buildDocModel, formatFieldValue } from '../src/lib/docmodel.js';
import { createReport, makeCtx, siteLabel } from '../src/lib/report.js';
import { buildText } from '../src/lib/text.js';
import { resolveScale, normOptions } from '../src/templates/schema.js';
import { pick, say, plural, asciiParens, fileName, optionText, fmtDateEn, shownValue, shownValues, defaultTextIn, siteLabelIn, deptIn, deptEn } from '../src/templates/helpers.js';
import { TEMPLATES } from '../src/templates/index.js';
import { fillReport, SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fixtures.mjs';

const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]/;
const byId = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
const qc = byId['quality-check'];

// 模板的单语写法要核心（lib/lang.js / lib/docmodel.js）认得才进文档：
//   1. 标签 / 选项的 zhOnly / enOnly（localize、formatFieldValue）
//   2. doc.zhOnly / doc.enOnly（抬头小字 / 图例 / 页脚是整行字符串，要 buildDocModel 合并进 meta）
//   3. 字段 display（自动带入的固定文字按文件语言显示）
// 核心还没合入 core-request.patch 时，依赖它的断言跳过并醒目提示；合入后自动生效，不用改测试。
const OVERRIDES = localize({ zh: '中', enOnly: 'EN' }, 'en').en === 'EN';
const DOC_OVERRIDES = buildDocModel({ template: qc, report: { values: {} }, lang: 'en' }).meta.legend === qc.doc.enOnly.legend;
const PROBE = { id: 'probe', name: { zh: '探', en: 'Probe' }, sections: [{ id: 's', type: 'fields', fields: [{ key: 'a', type: 'text', label: 'a', display: () => 'shown' }] }] };
const DISPLAY = buildDocModel({ template: PROBE, report: { values: { a: 'raw' } }, lang: 'en' }).blocks[0].fields[0].value === 'shown';
const CORE = { OVERRIDES, DOC_OVERRIDES, DISPLAY };
const WHAT = { OVERRIDES: 'localize 认 zhOnly / enOnly', DOC_OVERRIDES: 'buildDocModel 合并 doc.zhOnly / enOnly', DISPLAY: 'buildDocModel 用字段 display' };
/** 依赖核心的断言：缺哪项就跳过并醒目提示 */
const needCore = (name, keys = Object.keys(CORE)) => {
  const miss = keys.filter((k) => !CORE[k]);
  if (!miss.length) return false;
  console.log(`    ⚠ 跳过「${name}」：核心还没合入 core-request.patch（缺：${miss.map((k) => WHAT[k]).join('；')}）`);
  return true;
};
const needOverrides = (name) => needCore(name, ['OVERRIDES']);

/** 模型里所有字符串（媒体 id、生成时间除外），带路径，方便报错时定位 */
function strings(node, path = '', out = []) {
  if (node == null) return out;
  if (typeof node === 'string') out.push([path, node]);
  else if (Array.isArray(node)) node.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (typeof node === 'object') {
    if (typeof node.id === 'string' && /^(photo|video|signature)$/.test(node.kind)) return out; // MediaRef
    for (const [k, v] of Object.entries(node)) {
      if (k === 'generatedAt' || k === 'templateId' || k === 'id' || k === 'key') continue;
      strings(v, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

/** 文档模型里所有 { zh, en } 标签 */
function labels(node, out = []) {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) node.forEach((x) => labels(x, out));
  else {
    if ('zh' in node || 'en' in node) out.push(node);
    for (const v of Object.values(node)) labels(v, out);
  }
  return out;
}

const withoutStamp = (m) => ({ ...m, meta: { ...m.meta, generatedAt: '' } });

// ---------- 英文内容的报告（项目 / 人名 / 备注全用英文写，用户数据里没有中文） ----------
const EN_PROJECT = {
  id: 'p_en',
  name: 'Seri Maya Condo',
  client: 'Mr Tan',
  unit: 'B-12-3',
  address: 'Seri Maya Condo, Block B, 12-3, Jalan Seri Maya, 47100 Puchong',
  mapLink: 'https://maps.app.goo.gl/demo',
  so: 'SO-2026-1001',
  designer: 'Rachel Lim',
  startDate: '2026-10-08',
  plannedDays: 5,
  entryNote: 'Register at the guard house with IC',
  parking: 'Basement visitor bays',
};
// 默认文件语言 English：新建时自动带出的文字（工期 / 进场天数）也是英文
const EN_SETTINGS = { name: 'Jason Lee', phone: '012-3456789', dept: 'Installation Team', company: 'Sail by Riccione Reka', docLang: 'en' };

/** 按模板结构自动填一份「用户内容全英文」的报告（选项照常选，选项文字由模板给英文） */
export function englishReport(template) {
  const report = createReport(template, { project: EN_PROJECT, settings: EN_SETTINGS });
  report.lang = 'en';
  let n = 0;
  const photo = () => `m_photo${(n++ % 7) + 1}`;
  const textFor = (f) => {
    const t = f.type;
    if (t === 'date') return '2026-10-09';
    if (t === 'time') return '09:00';
    if (t === 'number') return 3;
    if (t === 'tel') return '012-3456789';
    if (t === 'url') return 'https://drive.google.com/drive/folders/demo';
    if (t === 'yesno') return 'Y';
    if (t === 'list') return ['Lay floor protection first', 'Clear rubbish daily'];
    if (t === 'textarea') return 'Shoe cabinet and wardrobe carcasses installed.\nSite cleaned, protection intact.';
    if (['select', 'radio'].includes(t)) return normOptions(f.options)[0]?.v ?? '';
    if (t === 'chips') {
      const opts = normOptions(f.options).map((o) => o.v);
      return f.multiple ? [...opts.slice(0, 2), 'Balcony cabinet'] : opts[0];
    }
    return `Sample ${f.key}`;
  };
  for (const s of template.sections) {
    if (s.type === 'fields') {
      for (const f of s.fields) {
        if (f.type === 'photos') report.values[f.key] = [photo(), photo()];
        else if (f.type === 'video') report.values[f.key] = 'm_video';
        else if (f.type === 'date' && report.values[f.key]) continue;
        else if (f.key === 'duration' || f.key === 'entry') continue; // 自动带出（默认语言 English）
        else report.values[f.key] = textFor(f);
      }
    }
    if (s.type === 'checklist') {
      s.items.forEach((it, idx) => {
        if (it.input) {
          report.items[it.id] = { value: textFor(it.input), photos: idx % 3 === 0 ? [photo()] : [] };
          return;
        }
        const opts = resolveScale(it.scale || s.scale).options;
        const r = opts.length > 1 && idx % 4 === 3 ? opts[1].v : opts[0].v;
        report.items[it.id] = { r, note: idx % 4 === 3 ? 'Gap 3mm too wide, adjusted on site' : '', photos: idx % 3 === 0 ? [photo()] : [] };
      });
    }
    if (s.type === 'table') {
      report.tables[s.id] = [0, 1].map((i) => {
        const row = { photos: [] };
        for (const slot of s.photoSlots || []) row[slot.key] = [photo()];
        for (const c of s.columns) {
          if (['select', 'radio', 'chips'].includes(c.type)) row[c.key] = normOptions(c.options)[i]?.v ?? '';
          else if (c.type === 'date') row[c.key] = `2026-10-1${i}`;
          else row[c.key] = `Kitchen wall cabinet ${i + 1}`;
        }
        return row;
      });
    }
    if (s.type === 'signatures') {
      s.roles.forEach((r, i) => {
        report.signatures[r.id] = { name: ['Ahmad', 'Jason Lee', 'Rachel Lim'][i % 3], date: '2026-10-09', image: 'm_sig' };
      });
    }
  }
  // 自动带入的「工地称呼」（Seri Maya Condo B-12-3（Mr Tan））保持 App 原样：英文文件里由字段 display 换半角括号
  return report;
}

export const tests = [
  // ---------- lib/lang.js ----------
  ['lang：normLang / reportLang / LANGS', () => {
    assert.deepEqual(LANGS.map((l) => l.v), ['zh', 'en', 'both']);
    assert.equal(normLang('zh'), 'zh');
    assert.equal(normLang('en'), 'en');
    for (const x of ['both', '', undefined, null, 'fr', 'ZH']) assert.equal(normLang(x), 'both');
    assert.equal(reportLang({ lang: 'en' }, { docLang: 'zh' }), 'en'); // 报告上的优先
    assert.equal(reportLang({}, { docLang: 'zh' }), 'zh');
    assert.equal(reportLang(null, null), 'both');
  }],
  ['lang：tx 写死的成对文字', () => {
    assert.equal(tx('zh', '备注', 'Remarks'), '备注');
    assert.equal(tx('en', '备注', 'Remarks'), 'Remarks');
    assert.equal(tx('both', '备注', 'Remarks'), '备注 Remarks');
    assert.equal(tx('both', '第 1 / 2 页', 'Page 1 of 2', ' · '), '第 1 / 2 页 · Page 1 of 2');
    assert.equal(tx(undefined, '是', 'Yes'), '是 Yes');
    // 缺一半时用另一半顶上，不留孤零零的分隔符
    assert.equal(tx('zh', '', 'Only EN'), 'Only EN');
    assert.equal(tx('en', '只有中文', ''), '只有中文');
    assert.equal(tx('both', '', 'EN', ' · '), 'EN');
    assert.equal(tx('both', '中', undefined, ' · '), '中');
    assert.equal(tx('en'), '');
  }],
  ['lang：localize 规整一个标签（保留 v / tone 等其他键）', () => {
    const opt = { v: 'P', zh: '合格', en: 'Pass', tone: 'pass' };
    assert.equal(localize(opt, 'both'), opt);
    assert.deepEqual(localize(opt, 'zh'), { v: 'P', zh: '合格', en: '', tone: 'pass' });
    assert.deepEqual(localize(opt, 'en'), { v: 'P', zh: '', en: 'Pass', tone: 'pass' });
    assert.deepEqual(opt, { v: 'P', zh: '合格', en: 'Pass', tone: 'pass' }); // 不改原对象
    // 缺哪种用另一种
    assert.deepEqual(localize({ zh: '只有中文' }, 'en'), { zh: '', en: '只有中文' });
    assert.deepEqual(localize({ en: 'English only' }, 'zh'), { zh: 'English only', en: '' });
    // 不是标签的不动
    const ref = { id: 'm_1', kind: 'photo' };
    assert.equal(localize(ref, 'en'), ref);
    assert.equal(localize('字符串', 'en'), '字符串');
    assert.equal(localize(null, 'zh'), null);
    const arr = [{ zh: 'a', en: 'b' }];
    assert.equal(localize(arr, 'zh'), arr);
  }],
  ['lang：单语覆盖 zhOnly / enOnly（双语照旧）', () => {
    if (needOverrides('单语覆盖')) return;
    const l = { zh: '★ 必查 Mandatory　·　P 合格 Pass', zhOnly: '★ 必查　·　P 合格', enOnly: '★ Mandatory  ·  P Pass' };
    assert.equal(localize(l, 'both'), l);
    assert.equal(labelText(localize(l, 'both')), '★ 必查 Mandatory　·　P 合格 Pass');
    assert.deepEqual(localize(l, 'zh'), { zh: '★ 必查　·　P 合格', en: '' });
    assert.deepEqual(localize(l, 'en'), { zh: '', en: '★ Mandatory  ·  P Pass' });
    // 原表只有中文：只给 enOnly
    assert.deepEqual(localize({ zh: '项目 / 客户', enOnly: 'Project / Client' }, 'zh'), { zh: '项目 / 客户', en: '' });
    assert.deepEqual(localize({ zh: '项目 / 客户', enOnly: 'Project / Client' }, 'en'), { zh: '', en: 'Project / Client' });
    // 选项（v / tone 保留）
    assert.deepEqual(localize({ v: '鞋柜', zh: '鞋柜', enOnly: 'Shoe cabinet' }, 'en'), { v: '鞋柜', zh: '', en: 'Shoe cabinet' });
    // 模板侧的 pick() 与核心一致
    for (const lang of ['zh', 'en', 'both']) assert.equal(pick(l, lang), labelText(localize(l, lang)), lang);
  }],
  ['lang：localizeDeep 整个模型（媒体引用 / 非标签对象不动）', () => {
    const model = {
      meta: { lang: 'en', title: { zh: '安装质检清单', en: 'INSTALLATION QUALITY CHECKLIST' }, intro: [{ zh: '说明', en: 'Intro' }], company: 'Sail' },
      blocks: [
        {
          type: 'checklist',
          title: { zh: '质检', en: 'Inspection' },
          options: [{ v: 'P', zh: '合格', en: 'Pass', tone: 'pass' }],
          rows: [{ id: 'qc1', title: { zh: '柜体', en: 'Cabinet' }, photos: [{ id: 'm_1', kind: 'photo' }], remark: '用户写的备注', counts: { total: 3 } }],
        },
        { type: 'signatures', roles: [{ id: 'a', label: { zh: '签名', en: 'Sign' }, image: { id: 'm_sig', kind: 'signature' }, name: '陈先生' }] },
      ],
    };
    const snapshot = JSON.stringify(model);
    assert.equal(localizeDeep(model, 'both'), model);
    const en = localizeDeep(model, 'en');
    assert.equal(JSON.stringify(model), snapshot); // 不改原对象
    assert.deepEqual(en.meta.title, { zh: '', en: 'INSTALLATION QUALITY CHECKLIST' });
    assert.deepEqual(en.meta.intro, [{ zh: '', en: 'Intro' }]);
    assert.equal(en.meta.company, 'Sail');
    assert.deepEqual(en.blocks[0].options[0], { v: 'P', zh: '', en: 'Pass', tone: 'pass' });
    assert.deepEqual(en.blocks[0].rows[0].photos, [{ id: 'm_1', kind: 'photo' }]);
    assert.deepEqual(en.blocks[0].rows[0].counts, { total: 3 });
    assert.equal(en.blocks[0].rows[0].remark, '用户写的备注'); // 用户内容不翻译
    assert.deepEqual(en.blocks[1].roles[0].image, { id: 'm_sig', kind: 'signature' });
    assert.equal(en.blocks[1].roles[0].name, '陈先生');
    const zh = localizeDeep(model, 'zh');
    assert.deepEqual(zh.blocks[1].roles[0].label, { zh: '签名', en: '' });
  }],
  ['lang：labelParts / labelText（单语时没有副行）', () => {
    assert.deepEqual(labelParts({ zh: '备注', en: 'Remarks' }), { primary: '备注', secondary: 'Remarks' });
    assert.deepEqual(labelParts({ zh: '备注', en: '' }), { primary: '备注', secondary: '' });
    assert.deepEqual(labelParts({ zh: '', en: 'Remarks' }), { primary: 'Remarks', secondary: '' });
    assert.deepEqual(labelParts('SO No.'), { primary: 'SO No.', secondary: '' });
    assert.deepEqual(labelParts(null), { primary: '', secondary: '' });
    assert.equal(labelText({ zh: '备注', en: 'Remarks' }), '备注 Remarks');
    assert.equal(labelText({ zh: '备注', en: 'Remarks' }, ' · '), '备注 · Remarks');
    assert.equal(labelText({ zh: '', en: 'Remarks' }, ' · '), 'Remarks');
  }],
  ['lang：latinOnly 公司名 / 部门去中文', () => {
    assert.equal(latinOnly('溪岸 Sail by Riccione Reka'), 'Sail by Riccione Reka');
    assert.equal(latinOnly('Sail · 溪岸'), 'Sail');
    assert.equal(latinOnly('安装部', 'Installation Department'), 'Installation Department');
    assert.equal(latinOnly('（溪岸）Riccione Reka'), 'Riccione Reka');
    assert.equal(latinOnly(''), '');
  }],
  ['helpers：say / pick / plural / asciiParens / fileName / optionText / fmtDateEn', () => {
    const ctx = (lang) => ({ lang });
    assert.equal(say(ctx('zh'), '3 项', '3 items', '3 项 items'), '3 项');
    assert.equal(say(ctx('en'), '3 项', '3 items', '3 项 items'), '3 items');
    assert.equal(say(ctx('both'), '3 项', '3 items', '3 项 items'), '3 项 items');
    assert.equal(say({}, '无', 'None'), '无 None'); // 手搭的 ctx 没有 lang = 双语
    assert.equal(pick({ zh: '合格', en: 'Pass' }, 'both'), '合格 Pass');
    assert.equal(pick({ zh: '合格', en: 'Pass' }, 'zh'), '合格');
    assert.equal(pick({ zh: '只有中文', enOnly: 'Chinese only' }, 'en'), 'Chinese only');
    assert.equal(pick({ zh: '只有中文', enOnly: 'Chinese only' }, 'both'), '只有中文');
    assert.equal(pick('SO No.', 'zh'), 'SO No.');
    assert.equal(plural(1, 'item'), '1 item');
    assert.equal(plural(0, 'item'), '0 items');
    assert.equal(plural(2, 'entry', 'entries'), '2 entries');
    assert.equal(asciiParens('Tuai Timur Residence 17-3（Hailey）'), 'Tuai Timur Residence 17-3 (Hailey)');
    assert.equal(fileName(ctx('en'), '安装质检', 'Installation_QC', 'A 1（B）', '', '2026-10-09'), 'Installation_QC_A 1 (B)_2026-10-09');
    assert.equal(fileName(ctx('zh'), '安装质检', 'Installation_QC', 'A 1（B）', '2026-10-09'), '安装质检_A 1（B）_2026-10-09');
    assert.equal(fileName(ctx('both'), '安装质检', 'Installation_QC'), '安装质检');
    const opts = [{ v: '鞋柜', zh: '鞋柜', enOnly: 'Shoe cabinet' }, '衣帽间'];
    assert.equal(optionText(opts, '鞋柜', 'en'), 'Shoe cabinet');
    assert.equal(optionText(opts, '鞋柜', 'zh'), '鞋柜');
    assert.equal(optionText(opts, '阳台柜', 'en'), '阳台柜'); // 自己填的原样
    assert.equal(fmtDateEn('2026-10-09'), 'Fri, 9 Oct');
    assert.equal(fmtDateEn(''), '');
  }],

  // ---------- 文档模型 ----------
  ['文档模型：字段值（是 / 否、选项）按语言', () => {
    const yn = { type: 'yesno' };
    assert.deepEqual(['zh', 'en', 'both'].map((l) => formatFieldValue(yn, 'Y', l).value), ['是', 'Yes', '是 Yes']);
    assert.deepEqual(['zh', 'en', 'both'].map((l) => formatFieldValue(yn, false, l).value), ['否', 'No', '否 No']);
    const sel = { type: 'select', options: [{ v: '高', zh: '高', en: 'High' }, '其他'] };
    assert.deepEqual(['zh', 'en', 'both'].map((l) => formatFieldValue(sel, '高', l).value), ['高', 'High', '高 High']);
    assert.equal(formatFieldValue(sel, '自己填的', 'en').value, '自己填的');
    assert.equal(formatFieldValue({ type: 'chips', options: sel.options }, ['高', '其他'], 'en').value, 'High / 其他');
    if (needOverrides('选项 enOnly')) return;
    const area = { type: 'chips', options: [{ v: '厨房 Kitchen', zh: '厨房 Kitchen', zhOnly: '厨房', enOnly: 'Kitchen' }] };
    assert.deepEqual(['zh', 'en', 'both'].map((l) => formatFieldValue(area, ['厨房 Kitchen'], l).value), ['厨房', 'Kitchen', '厨房 Kitchen']);
  }],
  ['文档模型：安装质检 zh / en / both 抽查（标签、选项、统计、文件名、公司名）', () => {
    const r = fillReport(qc);
    r.values.date = '2026-10-09';
    const m = (lang) => buildDocModel({ template: qc, report: r, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang });
    const [zh, en, both] = [m('zh'), m('en'), m('both')];
    assert.deepEqual([zh.meta.lang, en.meta.lang, both.meta.lang], ['zh', 'en', 'both']);
    // 不给 lang：报告 / 设置都没选 = 中英，与 both 一样
    assert.deepEqual(withoutStamp(buildDocModel({ template: qc, report: r, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS })), withoutStamp(both));
    assert.equal(buildDocModel({ template: qc, report: { ...r, lang: 'en' }, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS }).meta.lang, 'en');
    // 标签
    assert.deepEqual(zh.meta.title, { zh: '安装质检清单', en: '' });
    assert.deepEqual(en.meta.title, { zh: '', en: 'INSTALLATION QUALITY CHECKLIST' });
    assert.deepEqual(both.meta.title, { zh: '安装质检清单', en: 'INSTALLATION QUALITY CHECKLIST' });
    const cl = (x) => x.blocks.find((b) => b.type === 'checklist');
    assert.deepEqual(cl(zh).rows[0].title, { zh: '柜体水平 / 垂直', en: '' });
    assert.deepEqual(cl(en).rows[0].title, { zh: '', en: 'Cabinet level & plumb' });
    assert.deepEqual(cl(en).rows[0].desc, { zh: '', en: 'Level / plumb deviation ≤ 2 mm per metre' });
    assert.deepEqual(cl(zh).remarkLabel, { zh: '备注 / Punch#', en: '' });
    assert.deepEqual(cl(en).options.map((o) => [o.v, o.zh, o.en, o.tone]), [['P', '', 'Pass', 'pass'], ['F', '', 'Fail', 'fail'], ['NA', '', 'N/A', 'na']]);
    assert.deepEqual(cl(zh).rows[3].result, { v: 'F', zh: '不合格', en: '', tone: 'fail' });
    assert.equal(cl(en).rows[3].remark, '左侧门板缝隙偏大 3mm，已调整'); // 用户写的备注原样
    // 统计
    const sum = (x) => Object.fromEntries(x.blocks.find((b) => b.type === 'summary').items.map((i, k) => [k, i.value]));
    assert.deepEqual(sum(both), { 0: '14 项 items', 1: '4 项 items', 2: '4 项 items', 3: '3 项 items', 4: '0 项 items' });
    assert.deepEqual(sum(zh), { 0: '14 项', 1: '4 项', 2: '4 项', 3: '3 项', 4: '0 项' });
    assert.deepEqual(sum(en), { 0: '14 items', 1: '4 items', 2: '4 items', 3: '3 items', 4: '0 items' });
    // 文件名 / 公司名 / 部门
    assert.equal(zh.meta.filename, '安装质检_Tuai Timur Residence 17-3（Hailey）_2026-10-09');
    assert.equal(both.meta.filename, zh.meta.filename);
    assert.equal(en.meta.filename, 'Installation_QC_Tuai Timur Residence 17-3 (Hailey)_2026-10-09');
    assert.equal(zh.meta.company, '溪岸 Sail by Riccione Reka');
    assert.equal(en.meta.company, 'Sail by Riccione Reka');
    assert.equal(en.meta.dept, 'Installation Department');
    // 单语里没有一个标签同时带两种语言
    for (const l of labels(zh)) assert.ok(!l.en, JSON.stringify(l));
    for (const l of labels(en)) assert.ok(!l.zh, JSON.stringify(l));
  }],
  ['文档模型：抬头小字 / 图例 / 页脚是整行字符串（双语照原表；单语用 doc.zhOnly / enOnly）', () => {
    for (const t of TEMPLATES) {
      const d = t.doc || {};
      for (const k of ['kicker', 'legend', 'footer']) if (d[k] != null) assert.equal(typeof d[k], 'string', `${t.id}.${k}`);
      for (const k of ['kicker', 'legend', 'footer']) if (d.enOnly?.[k] != null) assert.ok(!CJK.test(d.enOnly[k]), `${t.id}.enOnly.${k}`);
      for (const k of ['kicker', 'legend', 'footer']) if (d.zhOnly?.[k] != null) assert.ok(!/Mandatory|Pass|Fail|form per/.test(d.zhOnly[k]), `${t.id}.zhOnly.${k}`);
      const m = buildDocModel({ template: t, report: fillReport(t, 'empty'), project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang: 'both' });
      for (const k of ['kicker', 'legend', 'footer']) assert.equal(m.meta[k], d[k] || '', `${t.id}.${k}`);
    }
  }],
  ['文档模型：七个模板 zh / en / both 都能生成，双语 = 不选语言', () => {
    for (const t of TEMPLATES) {
      for (const variant of ['full', 'empty']) {
        const r = fillReport(t, variant);
        const base = buildDocModel({ template: t, report: r, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
        assert.deepEqual(withoutStamp(buildDocModel({ template: t, report: r, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang: 'both' })), withoutStamp(base));
        for (const lang of ['zh', 'en']) {
          const m = buildDocModel({ template: t, report: r, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang });
          assert.equal(m.blocks.length, base.blocks.length, `${t.id} ${lang}`);
          assert.ok(!strings(m).some(([, s]) => /undefined|\[object/.test(s)), `${t.id} ${lang}`);
          const other = lang === 'zh' ? 'en' : 'zh';
          for (const l of labels(m)) assert.ok(!l[other], `${t.id} ${lang}: ${JSON.stringify(l)}`);
        }
        // 文件名：纯英文用英文前缀，中文 / 双语用原来的中文前缀
        const fn = (lang) => buildDocModel({ template: t, report: r, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang }).meta.filename;
        assert.equal(fn('zh'), base.meta.filename, t.id);
        assert.ok(!CJK.test(fn('en').replace(/Tuai Timur Residence 17-3 \(Hailey\)/, '')), `${t.id}: ${fn('en')}`);
      }
    }
  }],
  ['模板 summary：双语与原来逐字一致（数量写成「n 项 items」）', () => {
    for (const t of TEMPLATES) {
      if (typeof t.summary !== 'function') continue;
      const r = fillReport(t, 'full');
      const ctx = (lang) => makeCtx({ template: t, report: r, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang });
      const both = t.summary(ctx('both'));
      assert.deepEqual(t.summary(makeCtx({ template: t, report: r, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS })), both);
      const en = t.summary(ctx('en'));
      const zh = t.summary(ctx('zh'));
      assert.equal(en.items.length, both.items.length);
      for (const it of en.items) assert.ok(!/ 项|项 items|无 None|未选择/.test(it.value), `${t.id}: ${it.value}`);
      for (const it of zh.items) assert.ok(!/\bitems?\b|None|Not selected|closed/.test(it.value), `${t.id}: ${it.value}`);
    }
  }],

  // ---------- 验收：纯英文 / 纯中文的整份文档 ----------
  ['纯英文：英文内容的报告，七个模板的文档模型 / 文案 / 文件名都没有中文', () => {
    if (needCore('纯英文整份无中文')) return;
    for (const t of TEMPLATES) {
      const r = englishReport(t);
      const m = buildDocModel({ template: t, report: r, project: EN_PROJECT, settings: EN_SETTINGS });
      assert.equal(m.meta.lang, 'en');
      // reportTitle（新建时存的中文列表标题）由渲染器换成英文标题，这里不查
      const bad = strings(m).filter(([p, s]) => p !== 'meta.reportTitle' && CJK.test(s));
      assert.deepEqual(bad, [], `${t.id}: ${bad.map(([p, s]) => `${p} = ${s}`).join('\n')}`);
      const text = buildText({ template: t, report: r, project: EN_PROJECT, settings: EN_SETTINGS });
      assert.ok(!CJK.test(text), `${t.id}:\n${text}`);
      assert.ok(!CJK.test(m.meta.filename), m.meta.filename);
    }
  }],
  ['纯中文：七个模板的文档模型里没有双语标签的英文半边', () => {
    if (needCore('纯中文无英文半边', ['OVERRIDES', 'DOC_OVERRIDES'])) return;
    const m = buildDocModel({ template: qc, report: fillReport(qc), project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang: 'zh' });
    assert.equal(m.meta.kicker, '溪岸 Sail · 每个单位 / 区域填写一份');
    assert.equal(m.meta.legend, '★ 必查　·　P 合格　·　F 不合格　·　NA 不适用');
    assert.deepEqual(m.meta.subtitle, { zh: '质检 21 项 · 重点抽查', en: '' });
    // 原表双语写法里的英文（PDF / SO / Punch / GO / NO-GO / N/A / mm / 品牌名等中文原文本来就用的除外）
    const EN_HALF = /\b(Pass|Fail|Remarks?|Mandatory|Category|Owner|Severity|Closing Rule|One form per unit|not for client|Kitchen|Wardrobe|Shoe Cabinet|items?|None|Not selected|closed|Audit|No\.)/;
    for (const t of TEMPLATES) {
      const r = fillReport(t, 'full');
      const m = buildDocModel({ template: t, report: r, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang: 'zh' });
      const fixed = [
        ...labels(m).map((l) => l.zh),
        ...m.blocks.flatMap((b) => (b.type === 'summary' ? [...b.items.map((i) => i.value), b.conclusion?.value, b.conclusion?.note] : [])),
        ...m.blocks.flatMap((b) => (b.type === 'fields' ? b.fields.filter((f) => ['chips', 'select', 'radio'].includes(t.sections.flatMap((s) => s.fields || []).find((x) => x.key === f.key)?.type)).map((f) => f.value) : [])),
      ].filter(Boolean);
      const bad = fixed.filter((s) => EN_HALF.test(s));
      assert.deepEqual(bad, [], t.id);
    }
  }],

  ['原表混写的标签：纯中文另给写法（SO No. → SO 编号、质检副标题去掉 Audit），双语 / 英文照旧', () => {
    for (const id of ['final-inspection', 'handover']) {
      const t = byId[id];
      const so = t.sections.flatMap((s) => s.fields || []).find((f) => f.key === 'so');
      assert.deepEqual(so.label, { zh: 'SO No.', zhOnly: 'SO 编号' }, id);
      assert.equal(pick(so.label, 'zh'), 'SO 编号');
      assert.equal(pick(so.label, 'en'), 'SO No.');
      assert.equal(pick(so.label, 'both'), 'SO No.');
      const m = (lang) => buildDocModel({ template: t, report: fillReport(t, 'empty'), project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang });
      const soOf = (x) => x.blocks.flatMap((b) => b.fields || []).find((f) => f.key === 'so').label;
      assert.equal(labelText(soOf(m('both'))), 'SO No.', id);
      assert.equal(labelText(soOf(m('en'))), 'SO No.', id);
      if (OVERRIDES) assert.equal(labelText(soOf(m('zh'))), 'SO 编号', id);
    }
    assert.equal(pick(qc.doc.subtitle, 'zh'), '质检 21 项 · 重点抽查');
    assert.equal(pick(qc.doc.subtitle, 'both'), '质检 21 项 · 重点抽查 Audit 21-Item Inspection & Spot-Check Audit');
    assert.equal(pick(qc.doc.subtitle, 'en'), '21-Item Inspection & Spot-Check Audit');
  }],

  // ---------- 字段 display：新建时自动带入的固定文字 ----------
  ['字段 display：自动带入的固定文字按文件语言写，改过的照原样，中文 / 双语原样', () => {
    const fieldOf = (t, key) => t.sections.flatMap((s) => s.fields || []).find((f) => f.key === key);
    const ctxOf = (t, lang, extra = {}) => makeCtx({ template: t, report: { values: {}, autofill: {} }, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang, ...extra });
    const show = (t, key, v, lang, extra) => shownValue(fieldOf(t, key), v, ctxOf(t, lang, extra));
    // 进场通知：默认规定 / 收工前 / 物料 / 登记 / 停车 —— 逐行认默认文字
    const sn = byId['site-notice'];
    const rules = createReport(sn, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS }).values.rules;
    assert.equal(rules[0], 'Hacking 无时段限制，碎料当场装袋'); // 存的仍是中文默认
    assert.deepEqual(show(sn, 'rules', rules, 'en'), [
      'Hacking: no time restriction; bag debris on the spot',
      'Lay protection on the corridor, lift and unit floor before moving anything in',
      'Rubbish: clear on the same day',
      'No smoking inside the unit',
      'Company uniform and safety shoes',
    ]);
    for (const lang of ['zh', 'both']) assert.equal(show(sn, 'rules', rules, lang), rules);
    assert.deepEqual(show(sn, 'rules', ['Hacking 只限 10:00–16:00', ' 单位内禁烟 '], 'en'), ['Hacking 只限 10:00–16:00', 'No smoking inside the unit']);
    assert.equal(show(sn, 'beforeLeave', ['全场巡一遍拍视频'], 'en')[0], 'Walk the whole site and record a video');
    assert.equal(show(sn, 'materials', '已在现场', 'en'), 'Already on site');
    assert.equal(show(sn, 'materials', '明天 10 点到货', 'en'), '明天 10 点到货');
    assert.equal(show(sn, 'entryNote', 'Guard house 登记，带护照', 'en'), 'Register at guard house with passport');
    assert.equal(show(sn, 'parking', '访客停车场', 'en'), 'Visitor parking');
    assert.equal(show(sn, 'parking', 'B2 访客位', 'en'), 'B2 访客位');
    assert.equal(show(sn, 'parking', '访客停车场', 'zh'), '访客停车场');
    // 每日汇报：预计工期两种写法互换；落款；没地址时带入的工地称呼
    const dr = byId['daily-report'];
    assert.equal(show(dr, 'duration', '剩余 4 天（今天第 2 天 / 共 5 天）', 'en'), '4 days left (today is day 2 of 5)');
    assert.equal(show(dr, 'duration', '4 days left (today is day 2 of 5)', 'zh'), '剩余 4 天（今天第 2 天 / 共 5 天）');
    assert.equal(show(dr, 'duration', '4 days left (today is day 2 of 5)', 'both'), '剩余 4 天（今天第 2 天 / 共 5 天）');
    assert.equal(show(dr, 'duration', '剩余 4 天（今天第 2 天 / 共 5 天）', 'both'), '剩余 4 天（今天第 2 天 / 共 5 天）');
    assert.equal(show(dr, 'duration', '大约一周 ', 'en'), '大约一周 '); // 自己写的原样（连空格）
    assert.equal(show(dr, 'dept', '安装部', 'en'), 'Installation Department');
    assert.equal(show(dr, 'dept', '安装部', 'zh'), '安装部');
    assert.equal(show(dr, 'dept', 'Installation Team', 'en', { settings: { dept: 'Installation Team' } }), 'Installation Team');
    assert.equal(show(dr, 'dept', '溪岸安装部 Sail Install', 'en', { settings: { dept: '溪岸安装部 Sail Install' } }), 'Sail Install');
    assert.equal(show(dr, 'dept', '陈师傅', 'en'), '陈师傅'); // 报告里改过的落款照原样
    assert.equal(deptIn('', ctxOf(dr, 'en')), '');
    assert.equal(deptEn('安装部'), 'Installation Department');
    const label = siteLabel(SAMPLE_PROJECT); // Tuai Timur Residence 17-3（Hailey）
    assert.equal(show(dr, 'address', label, 'en'), 'Tuai Timur Residence 17-3 (Hailey)');
    assert.equal(show(dr, 'address', label, 'both'), label);
    // 场前审核：进场日期 · 天数；项目 / 客户
    const pi = byId['pre-install'];
    assert.equal(show(pi, 'entry', '2026-10-08 · 5 天', 'en'), '2026-10-08 · 5 days');
    assert.equal(show(pi, 'entry', '2026-10-08 · 1 天', 'en'), '2026-10-08 · 1 day');
    assert.equal(show(pi, 'entry', '2026-10-08 · 5 days', 'zh'), '2026-10-08 · 5 天');
    assert.equal(show(pi, 'entry', '2026-10-08 · 5 天', 'both'), '2026-10-08 · 5 天');
    assert.equal(show(pi, 'entry', '10/8 开始，约一周', 'en'), '10/8 开始，约一周');
    // 工地称呼（project.siteLabel）：只换自动带入的；用户自己打的全角括号照原样；中文 / 双语原样
    for (const [t, key] of [[pi, 'client'], [qc, 'project'], [byId['final-inspection'], 'project'], [byId.handover, 'project']]) {
      assert.equal(show(t, key, label, 'en'), 'Tuai Timur Residence 17-3 (Hailey)', t.id);
      assert.equal(show(t, key, label, 'zh'), label, t.id);
      assert.equal(show(t, key, label, 'both'), label, t.id);
      assert.equal(show(t, key, '别的楼盘（陈先生）', 'en'), '别的楼盘（陈先生）', t.id);
      // 项目没传进来时认 report.autofill 记下的自动值
      const ctx = makeCtx({ template: t, report: { values: {}, autofill: { [key]: label } }, lang: 'en' });
      assert.equal(shownValue(fieldOf(t, key), label, ctx), 'Tuai Timur Residence 17-3 (Hailey)', t.id);
    }
    assert.equal(siteLabelIn(label, makeCtx({ project: SAMPLE_PROJECT, lang: 'en' }), { key: 'x' }), 'Tuai Timur Residence 17-3 (Hailey)');
    // defaultTextIn / shownValues / 出错兜底
    const tr = defaultTextIn({ 默认: 'Default' });
    assert.equal(tr('默认', { lang: 'en' }), 'Default');
    assert.equal(tr('默认', { lang: 'zh' }), '默认');
    assert.equal(tr('toString', { lang: 'en' }), 'toString'); // 不认原型链上的键
    assert.equal(shownValue({ display: () => { throw new Error('x'); } }, 'raw', {}), 'raw');
    assert.equal(shownValue({ display: () => undefined }, 'raw', {}), 'raw');
    assert.equal(shownValue({}, 'raw', {}), 'raw');
    const r = createReport(sn, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    const sv = shownValues(makeCtx({ template: sn, report: r, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang: 'en' }));
    assert.equal(sv.materials, 'Already on site');
    assert.equal(sv.project, r.values.project); // 没有 display 的字段不动
    assert.equal(r.values.materials, '已在现场'); // 不改存的值
    assert.deepEqual(shownValues(makeCtx({ template: sn, report: r, lang: 'both' })), r.values);
  }],
  ['字段 display：存的值不变 ——「照这份再写一份」保留改过的规定，默认文字不变成函数默认值', () => {
    const sn = byId['site-notice'];
    for (const key of ['rules', 'beforeLeave', 'materials', 'entryNote', 'parking']) {
      const f = sn.sections.flatMap((s) => s.fields || []).find((x) => x.key === key);
      assert.notEqual(typeof f.default, 'function', key); // 函数默认值在复制时会被重算、丢掉改过的内容
      assert.equal(typeof f.display, 'function', key);
    }
  }],
  ['文档模型：自动带入的固定文字跟着文件语言（新建时选的语言不影响；改过的照原样）', () => {
    if (needCore('文档模型用字段 display')) return;
    const valueOf = (m, key) => m.blocks.flatMap((b) => b.fields || []).find((f) => f.key === key)?.value;
    // 默认文件语言 English、设置里部门还是出厂的「安装部」：新建后直接导出英文
    const SE = { ...EN_SETTINGS, dept: '安装部' };
    for (const id of ['site-notice', 'daily-report']) {
      const t = byId[id];
      const r = createReport(t, { project: EN_PROJECT, settings: SE });
      const m = buildDocModel({ template: t, report: r, project: EN_PROJECT, settings: SE, lang: 'en' });
      const bad = m.blocks.flatMap((b) => b.fields || []).filter((f) => CJK.test(f.value || ''));
      assert.deepEqual(bad.map((f) => `${f.key} = ${f.value}`), [], id);
      if (id === 'daily-report') assert.equal(valueOf(m, 'dept'), 'Installation Department');
      if (id === 'site-notice') assert.equal(valueOf(m, 'rules').split('\n')[3], 'No smoking inside the unit');
    }
    // 中英建的报告在导出页换成 English / 反过来：工期、进场天数跟着换
    const dr = byId['daily-report'];
    const pi = byId['pre-install'];
    const SB = { ...SAMPLE_SETTINGS };
    const rb = createReport(dr, { project: SAMPLE_PROJECT, settings: SB });
    const durZh = rb.values.duration;
    assert.ok(/天/.test(durZh), durZh);
    assert.ok(!CJK.test(valueOf(buildDocModel({ template: dr, report: { ...rb, lang: 'en' }, project: SAMPLE_PROJECT, settings: SB }), 'duration')));
    assert.equal(valueOf(buildDocModel({ template: dr, report: rb, project: SAMPLE_PROJECT, settings: SB }), 'duration'), durZh); // 双语照旧
    const re = createReport(dr, { project: SAMPLE_PROJECT, settings: { ...SB, docLang: 'en' } });
    assert.ok(/day/.test(re.values.duration), re.values.duration);
    assert.equal(valueOf(buildDocModel({ template: dr, report: { ...re, lang: 'zh' }, project: SAMPLE_PROJECT, settings: SB }), 'duration'), durZh);
    const pe = createReport(pi, { project: SAMPLE_PROJECT, settings: SB });
    assert.equal(valueOf(buildDocModel({ template: pi, report: { ...pe, lang: 'en' }, project: SAMPLE_PROJECT, settings: SB }), 'entry'), '2026-10-08 · 5 days');
    assert.equal(valueOf(buildDocModel({ template: pi, report: { ...pe, lang: 'en' }, project: SAMPLE_PROJECT, settings: SB }), 'client'), 'Tuai Timur Residence 17-3 (Hailey)');
    // 改过的照原样
    const edited = { ...rb, lang: 'en', values: { ...rb.values, duration: '大约一周', dept: '陈师傅' } };
    const me = buildDocModel({ template: dr, report: edited, project: SAMPLE_PROJECT, settings: SB });
    assert.equal(valueOf(me, 'duration'), '大约一周');
    assert.equal(valueOf(me, 'dept'), '陈师傅');
  }],
  ['纯英文新建（自动带入 / 默认值都没改）：七个模板的文档模型 / 文案 / 文件名都没有中文', () => {
    if (needCore('纯英文新建无中文')) return;
    const SE = { ...EN_SETTINGS, dept: '安装部' }; // 部门还是出厂的「安装部」
    for (const t of TEMPLATES) {
      const r = createReport(t, { project: EN_PROJECT, settings: SE });
      const m = buildDocModel({ template: t, report: r, project: EN_PROJECT, settings: SE });
      assert.equal(m.meta.lang, 'en');
      const bad = strings(m).filter(([p, s]) => p !== 'meta.reportTitle' && CJK.test(s));
      assert.deepEqual(bad, [], `${t.id}: ${bad.map(([p, s]) => `${p} = ${s}`).join('\n')}`);
      const text = buildText({ template: t, report: r, project: EN_PROJECT, settings: SE });
      assert.ok(!CJK.test(text), `${t.id}:\n${text}`);
      assert.ok(!CJK.test(m.meta.filename), m.meta.filename);
    }
  }],
];
