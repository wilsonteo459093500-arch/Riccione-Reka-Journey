// 模板：完工终检表 FINAL INSPECTION REPORT
import assert from 'node:assert/strict';
import { createReport, makeCtx, issues, progress, siteLabel } from '../src/lib/report.js';
import { buildDocModel, modelMedia } from '../src/lib/docmodel.js';
import { allItems } from '../src/templates/schema.js';
import { fillReport, SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fixtures.mjs';

const t = (await import('../src/templates/finalInspection.js')).default;

const ctxOf = (report) => makeCtx({ template: t, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
const model = (report) => buildDocModel({ template: t, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
const blank = () => createReport(t, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });

/** 把第 n 项判为 r */
const mark = (report, nos, r) => nos.forEach((no) => { report.items[`fi${no}`] = { r, note: '', photos: [] }; });


// checks() 可返回字符串或 { text, sectionId, target }：测试只比较文字
const checksText = (ctx) => (t.checks(ctx) || []).map((x) => (typeof x === 'string' ? x : x.text));

export const tests = [
  ['基本信息', () => {
    assert.equal(t.id, 'final-inspection');
    assert.equal(t.kind, 'checklist');
    assert.equal(t.stage, 6);
    assert.equal(t.short, 'FIR');
    assert.equal(t.doc.badge.zh, 'INTERNAL · 内部文件');
    assert.equal(t.doc.badge.en, '无需出示客户 not for client');
    assert.equal(t.doc.subtitle.en, 'Pass this gate before booking the handover.');
    assert.equal(t.doc.subtitle.zh, '终检合格，才约客户交付。');
  }],
  ['27 项，按节 3/5/8/5/3/3，编号连续', () => {
    const items = allItems(t);
    assert.equal(items.length, 27);
    assert.deepEqual(items.map((x) => x.item.no), Array.from({ length: 27 }, (_, i) => String(i + 1)));
    const lists = t.sections.filter((s) => s.type === 'checklist');
    assert.deepEqual(lists.map((s) => s.no), ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ']);
    assert.deepEqual(lists.map((s) => s.items.length), [3, 5, 8, 5, 3, 3]);
    assert.ok(lists.every((s) => s.scale === 'pass-fail' && s.resultLayout === 'columns' && !s.remark.requiredWhen));
    assert.equal(new Set(items.map((x) => x.item.id)).size, 27);
    // 原表没有 ★ / 【影像】标记
    assert.ok(items.every((x) => !x.item.key && !x.item.media));
  }],
  ['原文逐字', () => {
    const byNo = Object.fromEntries(allItems(t).map((x) => [x.item.no, x.item]));
    assert.deepEqual(byNo['1'].title, { zh: '板材核对', en: 'Board Spec' });
    assert.equal(byNo['4'].desc.zh, '安装效果与图纸一致；重点检查上下封板/收边，避免“假的一门到顶”。');
    assert.equal(byNo['4'].desc.en, "Matches drawings; check top/bottom fillers to avoid a 'fake floor-to-ceiling' look.");
    assert.equal(byNo['7'].desc.en, 'Doors flush & aligned; even gaps (recommended 2–3mm).');
    assert.equal(byNo['13'].desc.zh, '高门板（≥1.5m）建议 ≥3 只铰链；更高/更重门板按标准加配，防下坠。');
    assert.equal(byNo['18'].desc.zh, '拼缝直顺、颜色接近；无明显高低差；行业参考：缝宽约 0.3–0.8mm（以现场石材/工艺为准）。');
    assert.deepEqual(byNo['27'].title, { zh: '照片记录', en: 'Photo Record' });
    const rule = t.sections.find((s) => s.id === 'fail-rule');
    assert.equal(rule.tone, 'warn');
    assert.match(rule.lines[0].zh, /勾选「不合格」的项目必须记入下方整改清单，复验合格后方可关闭。/);
    const legend = t.sections.find((s) => s.id === 'rectification-legend');
    assert.ok(legend.lines.some((l) => l.zh === '严重度 Severity：高（影响交付）/ 中 / 低'));
  }],
  ['新建报告带入项目 / 签名', () => {
    const r = blank();
    assert.equal(r.values.project, siteLabel(SAMPLE_PROJECT));
    assert.equal(r.values.so, 'SO-2026-0917');
    assert.match(r.values.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(r.tables.rectification, []);
    assert.equal(r.signatures.installer_sup.name, 'Wilson');
    assert.equal(r.signatures.designer.name, 'Mei Ling');
    assert.equal(r.signatures.handover.name, '');
  }],
  ['文档模型：full / pass / empty 都能生成', () => {
    for (const variant of ['full', 'pass', 'empty']) {
      const r = fillReport(t, variant);
      const m = model(r);
      assert.deepEqual(m.blocks.map((b) => b.type), [
        'fields', 'checklist', 'checklist', 'checklist', 'checklist', 'checklist', 'checklist',
        'note', 'table', 'note', 'summary', 'fields', 'note', 'signatures',
      ], variant);
      assert.equal(m.blocks.filter((b) => b.type === 'checklist').reduce((n, b) => n + b.rows.length, 0), 27);
      assert.equal(m.meta.badge.zh, 'INTERNAL · 内部文件');
      assert.match(m.meta.filename, /^完工终检_/);
      const tbl = m.blocks.find((b) => b.type === 'table');
      assert.equal(tbl.columns.length, 8);
      const sum = m.blocks.find((b) => b.type === 'summary');
      assert.equal(sum.items.length, 5);
      assert.ok(sum.items.every((i) => typeof i.value === 'string' && i.tone));
      assert.ok(Array.isArray(checksText(ctxOf(r))));
      assert.ok(Array.isArray(issues(t, r, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS })));
      const p = progress(t, r);
      assert.ok(p.total === 27 + 3, `progress total ${p.total}`);
      if (variant === 'empty') {
        assert.equal(tbl.empty, true);
        assert.deepEqual(tbl.emptyText, { zh: '无整改项', en: 'No rectification items' });
      } else {
        assert.equal(p.pct, 100);
        assert.equal(tbl.rows.length, 3);
        assert.deepEqual(tbl.rows[0].photoGroups.map((g) => g.key), ['before', 'after']);
        assert.ok(modelMedia(m).length > 0);
      }
    }
  }],
  ['summary 空报告不报错', () => {
    const empty = { values: {}, items: {}, tables: {}, signatures: {} };
    for (const rep of [empty, {}, undefined]) {
      const s = t.summary(makeCtx({ template: t, report: rep }));
      assert.ok(s && s.items.length === 5);
      assert.equal(s.items[2].value, '27 项 items');
      assert.equal(s.items[4].value, '未选择 Not selected');
      assert.deepEqual(checksText(makeCtx({ template: t, report: rep })), []);
    }
    assert.match(t.filename(makeCtx({ template: t, report: empty })), /^完工终检/);
  }],
  ['summary 统计整改关闭', () => {
    const r = blank();
    mark(r, [1, 2], 'F');
    r.tables.rectification = [
      { loc: '主卧衣柜', recheck: 'P', closed: '2026-10-12', before: ['m_photo1'], after: ['m_photo2'] },
      { photos: [] }, // 空行不算
      { loc: '鞋柜', desc: '门板划痕', before: ['m_photo3'] },
    ];
    r.values.result = 'rectify';
    const s = t.summary(ctxOf(r));
    const by = Object.fromEntries(s.items.map((i) => [i.label.en, i]));
    assert.equal(by.Fail.value, '2 项 items');
    assert.equal(by.Fail.tone, 'fail');
    assert.equal(by.Rectification.value, '2 项 items · 已关闭 1 closed');
    assert.equal(by.Rectification.tone, 'warn');
    assert.equal(by.Conclusion.value, '需整改 Rectification Needed');
    assert.equal(by.Conclusion.tone, 'fail');
    r.tables.rectification[2] = { ...r.tables.rectification[2], recheck: 'P', closed: '2026-10-13', after: ['m_photo4'] };
    r.values.recheckDate = '2026-10-13';
    const s2 = t.summary(ctxOf(r));
    assert.equal(s2.items[4].tone, 'pass');
    assert.match(s2.items[4].value, /复验合格 2026-10-13/);
    assert.deepEqual(checksText(ctxOf(r)), []);
  }],
  ['checks：不合格未记入整改 / 结论矛盾 / 关单照片', () => {
    const r = blank();
    mark(r, [3, 9, 18], 'F');
    let c = checksText(ctxOf(r));
    assert.ok(c.includes('有 3 项不合格还没记入整改清单'), c.join(' | '));

    r.tables.rectification = [{ loc: '厨房', desc: '台面拼缝高低差', before: ['m_photo1'] }];
    r.values.result = 'pass';
    c = checksText(ctxOf(r));
    assert.ok(c.includes('有 2 项不合格还没记入整改清单'));
    assert.ok(c.some((x) => x.includes('还有 1 项整改未关闭')));
    assert.ok(c.some((x) => x.includes('还有 3 项不合格未复验关闭')));
    const sum = t.summary(ctxOf(r));
    assert.equal(sum.items[4].tone, 'warn');

    r.tables.rectification = [
      { loc: '厨房', recheck: 'P', closed: '2026-10-12' },
      { loc: '鞋柜', closed: '2026-10-12', before: ['m_photo1'] },
    ];
    c = checksText(ctxOf(r));
    assert.ok(c.includes('整改第 1 项缺少问题照片'));
    assert.ok(c.includes('整改第 1 项已关闭，但缺少复验照片'));
    assert.ok(c.includes('整改第 2 项填了关闭日，但复验未选「合格」'));
    assert.ok(c.every((x) => typeof x === 'string'));

    // issues() 会带上模板 checks
    const list = issues(t, r, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    assert.ok(list.some((i) => i.text === '有 1 项不合格还没记入整改清单'));
    // 不合格不强制写备注（改为记入整改清单）
    assert.ok(!list.some((i) => i.level === 'error'));
  }],
  ['全部合格 + 结论合格 → 无提醒', () => {
    const r = fillReport(t, 'pass');
    r.tables.rectification = [];
    r.values.result = 'pass';
    assert.deepEqual(checksText(ctxOf(r)), []);
    const s = t.summary(ctxOf(r));
    assert.equal(s.items[1].value, '0 项 items');
    assert.equal(s.items[4].value, '合格 — 可安排交付 Passed — Ready for Handover');
    assert.equal(s.items[4].tone, 'pass');
  }],
];
