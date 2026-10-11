// 界面语言 English：进场通知 / 每日汇报 / 安装质检 / 交付清单 + 首页分组 —— App 里显示的模板文字都有英文
// （首页说明、节标题 / 说明、字段标签 / 输入框提示 / 字段说明、检查项、选项、签名、填写提醒）；中文界面照旧；文件不受影响。
// 界面取字规则同 lib/i18n.js uiLabel：English = enOnly || en || zh，所以这里用 localize(label, 'en')。
import assert from 'node:assert/strict';
import siteNotice from '../src/templates/siteNotice.js';
import dailyReport from '../src/templates/dailyReport.js';
import qualityCheck from '../src/templates/qualityCheck.js';
import handover from '../src/templates/handover.js';
import { GROUPS } from '../src/templates/index.js';
import { resolveScale, allFields } from '../src/templates/schema.js';
import { localize } from '../src/lib/lang.js';
import { applyUiLang, getUiLang, uiText } from '../src/lib/i18n.js';
import { createReport, issues, makeCtx } from '../src/lib/report.js';
import { buildDocModel } from '../src/lib/docmodel.js';
import { SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fixtures.mjs';

const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]/;
const TEMPLATES = [siteNotice, dailyReport, qualityCheck, handover];
const opts = { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS };

/** 界面 English 模式显示的文字（字符串 = 中文） */
const uiEn = (l) => (l == null ? '' : typeof l === 'string' ? l : localize(l, 'en').en || '');

/** 模板里 App 界面会显示的全部文字：[位置, 标签] */
function uiLabels(t) {
  const out = [['name', t.name], ['desc', t.desc]];
  const field = (where, f) => {
    out.push([`${where}.label`, f.label]);
    if (f.placeholder != null) out.push([`${where}.placeholder`, f.placeholder]);
    if (f.hint != null) out.push([`${where}.hint`, f.hint]);
    for (const o of f.options || []) out.push([`${where}.option`, o]);
  };
  for (const s of t.sections) {
    const at = `${t.id}/${s.id}`;
    if (s.title) out.push([`${at}.title`, s.title]);
    if (s.note) out.push([`${at}.note`, s.note]);
    if (s.type === 'fields') s.fields.forEach((f) => field(`${at}/${f.key}`, f));
    if (s.type === 'checklist') {
      if (s.remark?.label) out.push([`${at}.remark`, s.remark.label]);
      for (const o of resolveScale(s.scale).options) out.push([`${at}.scale`, o]);
      for (const it of s.items) {
        out.push([`${at}/${it.id}.title`, it.title]);
        if (it.desc) out.push([`${at}/${it.id}.desc`, it.desc]);
        if (it.method) out.push([`${at}/${it.id}.method`, it.method]);
        if (it.input) field(`${at}/${it.id}.input`, it.input);
      }
    }
    if (s.type === 'signatures') {
      if (s.declaration) out.push([`${at}.declaration`, s.declaration]);
      for (const r of s.roles) out.push([`${at}/${r.id}`, r]);
    }
    if (s.type === 'note') s.lines.forEach((l, i) => out.push([`${at}.line${i}`, l]));
  }
  return out;
}

/** checks() 的文字（可返回字符串或 { text }），按界面语言 */
const checksText = (t, report, lang) => (t.checks(makeCtx({ template: t, report, ...opts, lang })) || []).map((x) => (typeof x === 'string' ? x : x.text));

/** 中文 = 原文；English = en；中英 =「中文 / English」；English 不含中文 */
function assertChecks(t, report, zh, en) {
  assert.deepEqual(checksText(t, report, 'zh'), zh);
  assert.deepEqual(checksText(t, report, 'en'), en);
  assert.deepEqual(checksText(t, report, 'both'), zh.map((z, i) => `${z} / ${en[i]}`));
  assert.ok(!CJK.test(en.join('\n')), en.join('\n'));
}

/** 临时切换界面语言（测完恢复，免得影响其他测试里 issues() 的默认语言） */
function withUiLang(lang, fn) {
  const prev = getUiLang();
  applyUiLang(lang);
  try {
    return fn();
  } finally {
    applyUiLang(prev);
  }
}

export const tests = [
  ['界面 English：模板里 App 显示的文字都有英文（不含中文）', () => {
    for (const t of TEMPLATES) {
      const labels = uiLabels(t);
      assert.ok(labels.length > 15, t.id);
      for (const [where, l] of labels) {
        const en = uiEn(l);
        assert.ok(en && !CJK.test(en), `${where} 缺英文：${JSON.stringify(l)}`);
      }
    }
  }],
  ['首页说明 / 输入框提示 / 字段说明是 { zh, en }：中文界面 = 原文，中英 = 中文 + 英文', () => {
    for (const t of TEMPLATES) {
      assert.ok(CJK.test(t.desc.zh) && t.desc.en && !CJK.test(t.desc.en), t.id);
      for (const f of allFields(t)) {
        for (const k of ['placeholder', 'hint']) {
          const v = f[k];
          if (v == null || !CJK.test(typeof v === 'string' ? v : v.zh)) continue;
          assert.ok(typeof v === 'object' && v.en && !CJK.test(v.en), `${t.id}/${f.key}.${k}`);
          assert.equal(localize(v, 'zh').zh, v.zh);
        }
      }
    }
    assert.equal(siteNotice.desc.zh, '发给 subcon：几点到、怎么进、做什么、收工前做什么');
    assert.equal(dailyReport.desc.zh, '每天收工发群：进度、卫生、水电门窗、退场视频');
    assert.equal(qualityCheck.desc.zh, '21 项质检 · SS 每日抽查 3–5 项 × 2–3 个柜体并拍照');
    assert.equal(handover.desc.zh, '五个 H 一条线 · 交付当天按顺序打勾拍照');
    const f = (t, key) => allFields(t).find((x) => x.key === key);
    assert.deepEqual(f(siteNotice, 'date').hint, { zh: '默认明天', en: 'Defaults to tomorrow' });
    assert.equal(f(siteNotice, 'extra').placeholder.zh, '其他要交代的（钥匙、货梯预约、配合工种…）');
    assert.equal(f(siteNotice, 'mapLink').placeholder, 'https://maps.app.goo.gl/…');
    assert.deepEqual(f(dailyReport, 'duration').placeholder, { zh: '例：预计 5 天（今天第 1 天）', en: 'e.g. Est. 5 days (today is day 1)' });
    assert.equal(f(dailyReport, 'duration').hint.zh, '按项目「预计安装天数」自动倒数：第一天发总工期，往后依次递减（可手改）');
    // 界面实际显示：中文 / English / 中英
    const ph = f(dailyReport, 'tips').placeholder;
    assert.equal(withUiLang('zh', () => uiText(ph)), '日常小提示或工种协调配合');
    assert.equal(withUiLang('en', () => uiText(ph)), 'Daily tips or coordination with other trades');
    assert.equal(withUiLang('both', () => uiText(ph)), '日常小提示或工种协调配合 Daily tips or coordination with other trades');
    // 编号标签：English 界面用 enOnly 的「3. Today's work」，中英照旧「3、今日内容」+ 英文小字
    assert.equal(withUiLang('en', () => uiText(f(dailyReport, 'todayWork').label)), "3. Today's work");
    assert.equal(withUiLang('both', () => uiText(f(dailyReport, 'todayWork').label)), "3、今日内容 Today's work");
  }],
  ['首页分组：说明 hint 是 { zh, en }，中文照旧', () => {
    assert.deepEqual(GROUPS.map((g) => g.hint.zh), ['一键出 WhatsApp 文案 + 照片', '逐项打勾拍照 → PDF / Word / Excel']);
    for (const g of GROUPS) {
      assert.ok(g.zh && g.en && !CJK.test(g.en) && g.hint.en && !CJK.test(g.hint.en), g.id);
      assert.equal(withUiLang('en', () => uiText(g.hint)), g.hint.en);
      assert.equal(withUiLang('zh', () => uiText(g.hint)), g.hint.zh);
    }
  }],
  ['进场通知：填写提醒 中文 / English / 中英', () => {
    const r = createReport(siteNotice, { ...opts, settings: { ...SAMPLE_SETTINGS, phone: '' } });
    r.values.date = '';
    r.values.mapLink = '';
    assertChecks(
      siteNotice,
      r,
      ['还没选进场日期', '还没选「当日任务」的施工区域', '现场负责人电话未填（可在「设置」里填一次）', '没有导航链接，师傅可能找不到工地'],
      [
        'No site entry date selected yet',
        `No work areas selected under "Today's tasks"`,
        'Person-in-charge phone not filled in (set it once in Settings)',
        'No map link — installers may not find the site',
      ],
    );
    assert.ok(issues(siteNotice, r, { ...opts, lang: 'en' }).some((i) => i.text === 'No map link — installers may not find the site'));
    assert.ok(issues(siteNotice, r, { ...opts, lang: 'zh' }).some((i) => i.text === '没有导航链接，师傅可能找不到工地'));
  }],
  ['每日汇报：填写提醒 中文 / English / 中英', () => {
    const r = createReport(dailyReport, opts);
    r.values.hygiene = '未清理';
    r.values.utilities = '未关闭';
    assertChecks(
      dailyReport,
      r,
      [
        '还没有今日进度照',
        '「5、施工现场卫生」还没有照片',
        '「6、水电门窗」还没有照片',
        '还没有退场视频（收工前全场巡一遍拍视频）',
        '施工现场卫生为「未清理」',
        '水电门窗为「未关闭」，离场前请确认',
      ],
      [
        'No progress photos for today yet',
        '"5. Site cleanliness" has no photos yet',
        '"6. Water / power / doors & windows" has no photos yet',
        'No exit video yet (walk the whole site and record a video before leaving)',
        'Site cleanliness is marked "Not cleaned"',
        'Water / power / doors & windows marked "Not yet off & locked" — please check before leaving',
      ],
    );
    // 提醒里引用的选项英文与选项本身一致
    const opt = (key, v) => allFields(dailyReport).find((x) => x.key === key).options.find((o) => o.v === v).enOnly;
    assert.equal(opt('hygiene', '未清理'), 'Not cleaned');
    assert.equal(opt('utilities', '未关闭'), 'Not yet off & locked');
    assert.ok(issues(dailyReport, r, { ...opts, lang: 'en' }).some((i) => i.text === 'No progress photos for today yet'));
  }],
  ['交付清单：填写提醒 中文 / English / 中英', () => {
    const bare = { values: {}, items: {}, tables: {}, signatures: {} };
    assertChecks(handover, bare, ['未填写 30天回访日期', '未填写 1年回访日期'], ['30-day follow-up date not filled in', '1-year follow-up date not filled in']);
    const r = createReport(handover, opts);
    r.values.date = '2026-10-09';
    r.values.followup30 = '2026-10-09';
    r.values.followup1y = '2026-10-01';
    assertChecks(
      handover,
      r,
      ['30天回访日期不晚于交付日期，请核对', '1年回访日期不晚于交付日期，请核对'],
      ['30-day follow-up date is not after the handover date — please check', '1-year follow-up date is not after the handover date — please check'],
    );
    // 仍带跳转位置
    assert.ok(handover.checks(makeCtx({ template: handover, report: r, lang: 'en' })).every((x) => x.sectionId === 'followup'));
    assert.ok(issues(handover, r, { ...opts, lang: 'en' }).some((i) => i.text.startsWith('30-day follow-up date is not after')));
  }],
  ['文件不读界面文字：输入框提示 / 字段说明 / 首页说明不会进文档模型', () => {
    for (const t of TEMPLATES) {
      const report = createReport(t, opts);
      for (const lang of ['zh', 'en', 'both']) {
        const json = JSON.stringify(buildDocModel({ template: t, report, ...opts, lang }));
        for (const l of [t.desc, ...allFields(t).flatMap((f) => [f.placeholder, f.hint])]) {
          if (!l || typeof l !== 'object') continue;
          assert.ok(!json.includes(l.zh) && !json.includes(l.en), `${t.id} ${lang}: ${JSON.stringify(l)}`);
        }
      }
    }
  }],
];
