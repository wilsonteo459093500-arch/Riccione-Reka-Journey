// 核心：报告新建 / 项目带入 / 文档模型
import assert from 'node:assert/strict';
import qualityCheck from '../src/templates/qualityCheck.js';
import measurement from '../src/templates/measurement.js';
import handover from '../src/templates/handover.js';
import preInstall from '../src/templates/preInstall.js';
import finalInspection from '../src/templates/finalInspection.js';
import siteNotice from '../src/templates/siteNotice.js';
import { createReport, applyProject, refreshAuto, duplicateReport, progress, issues, mediaIds, siteLabel } from '../src/lib/report.js';
import { addDays } from '../src/lib/format.js';
import { buildDocModel, modelMedia } from '../src/lib/docmodel.js';
import { fmtDateCN, fmtDateDot } from '../src/lib/format.js';
import { fillReport, SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fixtures.mjs';

export const tests = [
  ['日期格式', () => {
    assert.equal(fmtDateCN('2026-10-09'), '10月9日 周五');
    assert.equal(fmtDateDot('2026-10-08'), '2026.10.8');
  }],
  ['新建报告带入项目与设置', () => {
    const r = createReport(qualityCheck, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    assert.equal(r.values.project, siteLabel(SAMPLE_PROJECT));
    assert.equal(r.values.so, 'SO-2026-0917');
    assert.equal(r.values.inspector, 'Wilson');
    assert.equal(r.signatures.inspector.name, 'Wilson');
    assert.match(r.values.date, /^\d{4}-\d{2}-\d{2}$/);
  }],
  ['换项目只覆盖未手改的字段', () => {
    const r = createReport(qualityCheck, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    r.values.so = '手改的 SO';
    const p2 = { ...SAMPLE_PROJECT, id: 'p2', name: 'Other Condo', so: 'SO-2' };
    const n = applyProject(qualityCheck, r, p2, SAMPLE_SETTINGS, SAMPLE_PROJECT);
    assert.equal(n.values.so, '手改的 SO');
    assert.match(n.values.project, /Other Condo/);
  }],
  ['项目资料改过后再换项目：旧项目的自动带入值仍会被替换', () => {
    const a0 = { ...SAMPLE_PROJECT, client: '', so: '' };
    const r = createReport(qualityCheck, { project: a0, settings: SAMPLE_SETTINGS });
    const aEdited = { ...a0, client: 'Hailey', so: 'SO-1' }; // 之后在项目页补了资料
    const b = { ...SAMPLE_PROJECT, id: 'p_b', name: 'Other Condo', unit: '9-9', client: 'Ali', so: 'SO-B' };
    const n = applyProject(qualityCheck, r, b, SAMPLE_SETTINGS, aEdited);
    assert.match(n.values.project, /Other Condo/);
    assert.equal(n.values.so, 'SO-B');
    assert.equal(n.autofill.so, 'SO-B');
  }],
  ['不合格必须写备注', () => {
    const r = createReport(qualityCheck, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    r.items.qc3 = { r: 'F', note: '', photos: [] };
    const list = issues(qualityCheck, r);
    assert.ok(list.some((i) => i.level === 'error' && i.target === 'qc3'));
  }],
  ['文档模型完整', () => {
    const r = fillReport(qualityCheck);
    const m = buildDocModel({ template: qualityCheck, report: r, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    assert.deepEqual(m.blocks.map((b) => b.type), ['fields', 'checklist', 'summary', 'signatures']);
    assert.equal(m.blocks[1].rows.length, 21);
    assert.ok(modelMedia(m).length > 0);
    assert.equal(progress(qualityCheck, r).pct, 100);
    assert.ok(mediaIds(r).includes('m_sig'));
  }],
  ['换项目：客户签名人跟着换（未签名、仍是自动带入时）', () => {
    const r = createReport(measurement, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    assert.equal(r.signatures.customer.name, 'Hailey');
    const b = { ...SAMPLE_PROJECT, id: 'p_b', client: 'Mr Tan' };
    const n = applyProject(measurement, r, b, SAMPLE_SETTINGS, SAMPLE_PROJECT);
    assert.equal(n.values.customer, 'Mr Tan');
    assert.equal(n.signatures.customer.name, 'Mr Tan');
    // 手改过的姓名不动
    const r2 = { ...r, signatures: { ...r.signatures, customer: { ...r.signatures.customer, name: '陈先生' } } };
    assert.equal(applyProject(measurement, r2, b, SAMPLE_SETTINGS, SAMPLE_PROJECT).signatures.customer.name, '陈先生');
  }],
  ['改交付日期：30 天 / 1 年回访日期跟着重算', () => {
    const r = createReport(handover, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    const d = addDays(r.values.date, 3);
    const n = refreshAuto(handover, { ...r, values: { ...r.values, date: d } }, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    assert.equal(n.values.followup30, addDays(d, 30));
    // 手改过的不动
    const r2 = { ...r, values: { ...r.values, followup30: '2027-01-01', date: d } };
    assert.equal(refreshAuto(handover, r2, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS }).values.followup30, '2027-01-01');
  }],
  ['场前审核：选填项（差异 / 备注）空着也能到 100%', () => {
    const r = createReport(preInstall, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    for (const s of preInstall.sections) {
      if (s.type !== 'checklist') continue;
      for (const it of s.items) {
        if (it.input) r.items[it.id] = { value: it.input.optional ? '' : '已填' };
        else r.items[it.id] = { r: it.scale ? 'GO' : 'P' };
      }
    }
    for (const f of preInstall.sections.flatMap((s) => (s.type === 'fields' ? s.fields : []))) if (f.required) r.values[f.key] = r.values[f.key] || 'x';
    assert.equal(progress(preInstall, r).pct, 100);
    assert.ok(!issues(preInstall, r).some((i) => /还有 \d+ 项未填/.test(i.text)));
  }],
  ['终检「照这份再写一份」不复制综合结论', () => {
    const r = createReport(finalInspection, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    r.values.result = 'pass';
    r.values.recheckDate = '2026-10-09';
    const d = duplicateReport(finalInspection, r, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    assert.equal(d.values.result, '');
    assert.equal(d.values.recheckDate, '');
  }],
  ['进场通知：默认日期按建报告那天的明天，换项目不会跳日期', () => {
    const r = createReport(siteNotice, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    const old = { ...r, createdAt: new Date(2026, 9, 8, 21, 0).getTime(), values: { ...r.values, date: '2026-10-09' }, autofill: { ...r.autofill, date: '2026-10-09' } };
    const n = applyProject(siteNotice, old, { ...SAMPLE_PROJECT, id: 'p2', name: 'B' }, SAMPLE_SETTINGS, SAMPLE_PROJECT);
    assert.equal(n.values.date, '2026-10-09');
  }],
];
