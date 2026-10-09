// 核心：报告新建 / 项目带入 / 文档模型
import assert from 'node:assert/strict';
import qualityCheck from '../src/templates/qualityCheck.js';
import { createReport, applyProject, progress, issues, mediaIds, siteLabel } from '../src/lib/report.js';
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
];
