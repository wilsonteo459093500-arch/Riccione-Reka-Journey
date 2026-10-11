// 模板：交付执行清单 HANDOVER CHECKLIST
import assert from 'node:assert/strict';
import handover from '../src/templates/handover.js';
import { allItems, allFields, L } from '../src/templates/schema.js';
import { createReport, makeCtx, issues, progress, siteLabel } from '../src/lib/report.js';
import { buildDocModel, modelMedia } from '../src/lib/docmodel.js';
import { addDays } from '../src/lib/format.js';
import { fillReport, SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fixtures.mjs';

const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u3000-\u303F]/;

const lists = handover.sections.filter((s) => s.type === 'checklist');
const model = (report) => buildDocModel({ template: handover, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
const ctxOf = (report, lang) => makeCtx({ template: handover, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang });


// checks() 可返回字符串或 { text, sectionId, target }：测试只比较文字
// 提醒文字跟界面语言（ctx.lang）：默认按中文界面比对（与原来逐字一致），English / 中英另测
const checksText = (ctx, lang = 'zh') => (handover.checks(makeCtx({ ...ctx, lang })) || []).map((x) => (typeof x === 'string' ? x : x.text));

export const tests = [
  ['结构：5 个 H，共 20 项', () => {
    assert.equal(handover.id, 'handover');
    assert.equal(handover.kind, 'checklist');
    assert.equal(handover.stage, 7);
    assert.equal(allItems(handover).length, 20);
    assert.deepEqual(lists.map((s) => s.no), ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ']);
    assert.deepEqual(lists.map((s) => s.title.en), ['HABITABLE', 'HANDOVER', 'HOW TO', 'HOLD', 'HEART']);
    assert.deepEqual(lists.map((s) => s.items.length), [5, 4, 4, 5, 2]);
    for (const s of lists) {
      assert.equal(s.scale, 'done');
      assert.deepEqual(s.items.map((i) => i.no), s.items.map((_, k) => String(k + 1)));
    }
    const ids = allItems(handover).map(({ item }) => item.id);
    assert.equal(new Set(ids).size, ids.length);
    const keys = allFields(handover).map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(allItems(handover).every(({ item }) => !item.key));
    assert.deepEqual(
      allItems(handover).filter(({ item }) => item.media).map(({ item }) => item.id),
      ['ho1_5', 'ho3_3', 'ho4_1', 'ho4_2', 'ho4_3', 'ho4_5'],
    );
  }],
  ['原文逐字', () => {
    const t = Object.fromEntries(allItems(handover).map(({ item }) => [item.id, item.title]));
    assert.deepEqual(t.ho1_1, { zh: '全屋清洁完成，柜内外无粉尘胶渍', en: 'Full cleaning completed — interiors & exteriors free of dust and adhesive' });
    assert.deepEqual(t.ho1_2, { zh: '所有标签贴纸已撕除（板材·五金·玻璃·台面）', en: 'All stickers & labels peeled off — panels · hardware · glass · worktop' });
    assert.deepEqual(t.ho2_2, { zh: 'Follow-up 项当场记入 List 的售后跟进记录', en: 'Follow-up items recorded in the Issue Log on the List' });
    assert.deepEqual(t.ho4_1, { zh: '产品验收照（每区≥1张）', en: 'Acceptance photos — per area' });
    assert.deepEqual(t.ho5_1, { zh: '客户已扫码填写反馈表', en: 'Feedback form completed on site (QR)' });
    assert.deepEqual(lists[1].note, { zh: '对客环节，用 Handover List', en: 'the client-facing moment' });
    assert.deepEqual(handover.doc.subtitle, { zh: '五个 H 一条线，按顺序执行。', en: 'Five H, one run — tick in order.' });
    const f = Object.fromEntries(allFields(handover).map((x) => [x.key, x]));
    assert.deepEqual(f.followup30.label, { zh: '30天回访日期', en: '30-Day follow-up' });
    assert.deepEqual(f.followup1y.label, { zh: '1年回访日期', en: '1-Year follow-up' });
  }],
  ['新建：带入项目 / PIC / 回访日期默认', () => {
    const r = createReport(handover, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    assert.equal(r.values.project, siteLabel(SAMPLE_PROJECT));
    assert.equal(r.values.so, 'SO-2026-0917');
    assert.equal(r.values.pic, 'Wilson');
    assert.match(r.values.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(r.values.followup30, addDays(r.values.date, 30));
    assert.equal(r.values.followup1y, addDays(r.values.date, 365));
    assert.deepEqual(r.values.acceptPhotos, []);
    assert.equal(checksText(ctxOf(r)).length, 0);
  }],
  ['full / pass / empty：文档模型 + 统计 + 提醒不报错', () => {
    for (const variant of ['full', 'pass', 'empty']) {
      const r = fillReport(handover, variant);
      const m = model(r);
      assert.deepEqual(m.blocks.map((b) => b.type), ['fields', 'checklist', 'checklist', 'checklist', 'checklist', 'checklist', 'fields', 'fields', 'summary']);
      const cl = m.blocks.filter((b) => b.type === 'checklist');
      assert.ok(cl.every((b) => b.resultLayout === 'ticks'));
      assert.equal(cl.reduce((n, b) => n + b.rows.length, 0), 20);
      assert.ok(m.meta.filename.startsWith('交付清单'));
      assert.ok(Array.isArray(checksText(ctxOf(r))));
      assert.ok(Array.isArray(issues(handover, r, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS })));
      const p = progress(handover, r);
      const sum = m.blocks.at(-1);
      assert.equal(sum.items[0].value, variant === 'empty' ? '0 / 20 项 items' : '20 / 20 项 items');
      if (variant === 'empty') {
        assert.equal(p.done, 2); // 项目 + 日期 自动带入
        assert.equal(sum.items.find((i) => i.label.en === 'Remaining').tone, 'warn');
        assert.equal(modelMedia(m).length, 0);
      } else {
        assert.equal(p.pct, 100);
        assert.equal(sum.items.find((i) => i.label.en === 'Remaining').value, '无 None');
        assert.ok(modelMedia(m).length > 0);
      }
    }
  }],
  ['完全空白的报告：summary / checks 不报错', () => {
    const bare = { values: {}, items: {}, tables: {}, signatures: {} };
    const s = handover.summary(makeCtx({ template: handover, report: bare }));
    assert.equal(s.items[0].value, '0 / 20 项 items');
    assert.match(s.items.find((i) => i.label.en === 'Remaining').value, /^Ⅰ-1 全屋清洁完成.*等共 20 项$/);
    assert.deepEqual(checksText(makeCtx({ template: handover, report: bare })), ['未填写 30天回访日期', '未填写 1年回访日期']);
    assert.equal(handover.summary(makeCtx({ template: handover, report: {} })).items[0].value, '0 / 20 项 items');
    assert.doesNotThrow(() => model(bare));
  }],
  ['提醒：影像项缺照片 / 回访日期早于交付', () => {
    const r = createReport(handover, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    r.items.ho4_1 = { r: 'Y', note: '', photos: [] };
    r.values.followup30 = r.values.date;
    const list = issues(handover, r, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    assert.ok(list.some((i) => i.target === 'ho4_1' && /影像/.test(i.text)));
    assert.ok(list.some((i) => /30天回访日期不晚于交付日期/.test(i.text)));
    const s = handover.summary(ctxOf(r));
    assert.equal(s.items[0].value, '1 / 20 项 items');
    assert.equal(L(s.items[4].label, 'zh'), 'Ⅳ 成品保护与收场');
    assert.equal(s.items[4].value, '1 / 5');
  }],
  ['summary / 文件名 / 徽章：中文 / English / 双语', () => {
    const r = createReport(handover, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    r.values.date = '2026-10-09';
    r.values.followup30 = '2026-11-08';
    r.values.followup1y = '';
    r.items.ho1_1 = { r: 'Y' };
    const sum = (lang) => handover.summary(ctxOf(r, lang)).items;
    const [both, zh, en] = [sum('both'), sum('zh'), sum('en')];
    assert.equal(both[0].value, '1 / 20 项 items');
    assert.equal(zh[0].value, '1 / 20 项');
    assert.equal(en[0].value, '1 / 20 items');
    assert.equal(en[1].label.enOnly, 'Ⅰ HABITABLE');
    assert.match(both[6].value, /^Ⅰ-2 所有标签贴纸已撕除（板材·五金·玻璃·台面）；.*；等共 19 项$/);
    assert.equal(zh[6].value, both[6].value);
    assert.match(en[6].value, /^Ⅰ-2 All stickers & labels peeled off — panels · hardware · glass · worktop; .*; 19 in total$/);
    assert.equal(both[7].value, '30天 2026-11-08 · 1年 —');
    assert.equal(en[7].value, '30-day 2026-11-08 · 1-year —');
    assert.ok(!CJK.test(en.map((i) => i.value).join('\n')));
    // 全部完成
    const done = fillReport(handover, 'pass');
    assert.deepEqual(['both', 'zh', 'en'].map((l) => handover.summary(ctxOf(done, l)).items[6].value), ['无 None', '无', 'None']);
    assert.equal(handover.filename(ctxOf(r, 'en')), 'Handover_Checklist_Tuai Timur Residence 17-3 (Hailey)_2026-10-09');
    assert.equal(handover.filename(ctxOf(r, 'zh')), '交付清单_Tuai Timur Residence 17-3（Hailey）_2026-10-09');
    // 徽章：双语照原表；单语各一行
    assert.deepEqual([handover.doc.badge.zh, handover.doc.badge.en], ['INTERNAL · 内部文件', '无需出示客户 not for client']);
    assert.equal(handover.doc.badge.zhOnly, '内部文件 · 无需出示客户');
    assert.equal(handover.doc.badge.enOnly, 'INTERNAL · Not for client');
  }],
];
