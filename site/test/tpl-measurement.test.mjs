// 模板：复尺确认表 FINAL MEASUREMENT & CONFIRMATION CHECKLIST
import assert from 'node:assert/strict';
import measurement from '../src/templates/measurement.js';
import { allItems, allFields, resolveScale } from '../src/templates/schema.js';
import { createReport, makeCtx, issues, progress } from '../src/lib/report.js';
import { buildDocModel, modelMedia } from '../src/lib/docmodel.js';
import { fillReport, SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fixtures.mjs';

const t = measurement;
const lists = t.sections.filter((s) => s.type === 'checklist');
const opts = { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS };
const model = (report) => buildDocModel({ template: t, report, ...opts });
const ctxOf = (report) => makeCtx({ template: t, report, ...opts });
const byId = () => Object.fromEntries(allItems(t).map(({ item }) => [item.id, item]));


// checks() 可返回字符串或 { text, sectionId, target }：测试只比较文字
const checksText = (ctx) => (t.checks(ctx) || []).map((x) => (typeof x === 'string' ? x : x.text));

export const tests = [
  ['结构：A–D 四节，共 22 项', () => {
    assert.equal(t.id, 'measurement');
    assert.equal(t.kind, 'checklist');
    assert.equal(t.stage, 1);
    assert.equal(t.short, 'FM');
    assert.equal(t.icon, 'Ruler');
    assert.equal(t.doc.brand, 'vsmooth');
    assert.equal(allItems(t).length, 22);
    assert.deepEqual(lists.map((s) => s.no), ['A', 'B', 'C', 'D']);
    assert.deepEqual(lists.map((s) => s.items.length), [3, 6, 7, 6]);
    for (const s of lists) {
      assert.equal(resolveScale(s.scale).id, 'yes-no-na');
      assert.equal(s.resultLayout, 'columns');
      assert.deepEqual(s.remark.requiredWhen, ['N']);
      assert.deepEqual(s.items.map((i) => i.no), s.items.map((_, k) => `${s.no}${k + 1}`));
      assert.deepEqual(s.items.map((i) => i.id), s.items.map((_, k) => `fm${s.no}${k + 1}`));
    }
    const ids = allItems(t).map(({ item }) => item.id);
    assert.equal(new Set(ids).size, ids.length);
    const keys = allFields(t).map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual(keys, ['customer', 'so', 'address', 'date', 'supervisor', 'designer', 'notes', 'photos']);
    // 原表无 ★ / 【影像】标记，也没有单独的说明栏
    assert.ok(allItems(t).every(({ item }) => !item.key && !item.media && item.desc === undefined));
  }],
  ['原文逐字', () => {
    const it = byId();
    assert.deepEqual(it.fmA1.title, { zh: '提前至少1天联系客户,确认确图当事人当天到场', en: 'Confirm ≥1 day ahead that the decision-maker will be on site' });
    assert.deepEqual(it.fmA3.title, { zh: '已收齐电器型号与尺寸(油烟机、水槽、冰箱等)', en: 'Appliance models & dimensions received (hood, sink, fridge, etc.)' });
    assert.deepEqual(it.fmB2.title, { zh: '墙体垂直、平整;倾斜处加大离墙距,确保柜深不受影响', en: 'Walls plumb & flat; widen wall gap at slanted areas so cabinet depth is unaffected' });
    assert.deepEqual(it.fmC6.title, { zh: 'L型/U型柜体每面离墙 ≥20mm,见光侧板后飘(现场裁切收口)', en: 'L/U-shape cabinets: ≥20 mm wall gap per side; exposed end panels scribed on site' });
    assert.deepEqual(it.fmD3.title, { zh: '带灯带柜体:确认现场灯线预留情况及加装费用', en: 'Cabinets with LED: confirm wiring provision & additional charges' });
    assert.deepEqual(it.fmD6.title, { zh: '告知下单后图纸不再修改', en: 'Inform that no drawing changes are allowed after order placement' });
    assert.deepEqual(lists.map((s) => s.title.en), ['PRE-VISIT PREPARATION', 'SITE CONDITION CHECK', 'MEASUREMENT VS DRAWING', 'CUSTOMER ON-SITE CONFIRMATION']);
    assert.deepEqual(lists.map((s) => s.note.zh), ['出发前完成', '到场先查', '逐空间复核', '当面完成']);
    assert.deepEqual(lists[3].note, { zh: '当面完成', en: 'Complete with customer present' });
    assert.deepEqual(lists[0].remark.label, { zh: '异常记录 / 处理方案', en: 'Remarks & Action' });
    assert.deepEqual(t.doc.title, { zh: '复尺确认表', en: 'FINAL MEASUREMENT & CONFIRMATION CHECKLIST' });
    assert.equal(t.doc.intro[0].zh, '填写说明 逐项勾选;凡勾「否」必须在右栏写明处理方案与负责人;不适用项勾 N/A。');
    assert.equal(t.doc.intro[0].en, 'Tick item by item. Any “No” must state the corrective action & person-in-charge in the remarks column. Tick N/A if not applicable.');
    assert.equal(t.doc.footer, '溪岸 Sail by Riccione Reka  ·  自然主义生活体验馆  ·  V-SMOOTH 交付体系');
    const sig = t.sections.find((s) => s.type === 'signatures');
    assert.match(sig.declaration.zh, /^客户确认声明 {2}本人已到场参与复尺,.*下单后图纸与规格不再更改。$/);
    assert.match(sig.declaration.en, /^I was present at the final measurement .* after order placement\.$/);
    assert.deepEqual(sig.roles.map((r) => [r.zh, r.en]), [['客户签名', 'Customer Signature'], ['复尺人员签名', 'Site Supervisor Signature']]);
  }],
  ['新建：带入客户 / SO / 地址 / 复尺人员 / 设计师 / 签名人', () => {
    const r = createReport(t, opts);
    assert.equal(r.values.customer, 'Hailey');
    assert.equal(r.values.so, 'SO-2026-0917');
    assert.equal(r.values.address, SAMPLE_PROJECT.address);
    assert.equal(r.values.supervisor, 'Wilson');
    assert.equal(r.values.designer, 'Mei Ling');
    assert.match(r.values.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(r.values.photos, []);
    assert.equal(r.signatures.customer.name, 'Hailey');
    assert.equal(r.signatures.supervisor.name, 'Wilson');
    assert.deepEqual(progress(t, r), { done: 2, total: 24, pct: 8 });
  }],
  ['full / pass / empty：文档模型 + 统计 + 提醒不报错', () => {
    for (const variant of ['full', 'pass', 'empty']) {
      const r = fillReport(t, variant);
      const m = model(r);
      assert.deepEqual(m.blocks.map((b) => b.type), ['fields', 'checklist', 'checklist', 'checklist', 'checklist', 'fields', 'summary', 'signatures']);
      const cl = m.blocks.filter((b) => b.type === 'checklist');
      assert.ok(cl.every((b) => b.resultLayout === 'columns' && b.options.length === 3));
      assert.equal(cl.reduce((n, b) => n + b.rows.length, 0), 22);
      assert.equal(m.meta.brand, 'vsmooth');
      assert.ok(m.meta.filename.startsWith('复尺确认_Hailey_'));
      const checks = checksText(ctxOf(r));
      assert.ok(Array.isArray(checks) && checks.every((s) => typeof s === 'string'));
      const list = issues(t, r, opts);
      assert.ok(Array.isArray(list));
      const p = progress(t, r);
      const sum = m.blocks.find((b) => b.type === 'summary');
      const v = Object.fromEntries(sum.items.map((i) => [i.label.en, i.value]));
      if (variant === 'empty') {
        assert.equal(v.Yes, '0 项 items');
        assert.equal(v['Not checked'], '22 项 items');
        assert.equal(v['Action needed'], '无 None');
        assert.equal(checks.length, 2);
        assert.equal(modelMedia(m).length, 0);
        assert.equal(p.done, 2);
      } else {
        assert.equal(p.pct, 100);
        assert.equal(v['Not checked'], '0 项 items');
        assert.equal(checks.length, 0); // 两个签名都有图
        assert.ok(modelMedia(m).length > 0);
        assert.ok(!list.some((i) => i.level === 'error')); // 夹具里勾「否」的都写了备注
        if (variant === 'pass') {
          assert.equal(v.Yes, '22 项 items');
          assert.equal(v['Action needed'], '无 None');
        } else {
          assert.ok(sum.items.find((i) => i.label.en === 'No').tone === 'fail');
          assert.match(v['Action needed'], /^A\d|^[B-D]\d/);
        }
      }
    }
  }],
  ['完全空白的报告：summary / checks 不报错', () => {
    for (const bare of [{ values: {}, items: {}, tables: {}, signatures: {} }, {}]) {
      const ctx = makeCtx({ template: t, report: bare });
      const s = t.summary(ctx);
      assert.equal(s.items.find((i) => i.label.en === 'Not checked').value, '22 项 items');
      assert.equal(s.items.find((i) => i.label.en === 'Action needed').value, '无 None');
      assert.deepEqual(checksText(ctx), ['客户还未签名：请客户阅读「客户确认声明」后签名', '复尺人员还未签名']);
      assert.equal(t.filename(ctx), '复尺确认');
    }
    assert.doesNotThrow(() => model({ values: {}, items: {}, tables: {}, signatures: {} }));
  }],
  ['勾「否」：未写处理方案报错，写了进待处理清单', () => {
    const r = createReport(t, opts);
    r.items.fmB3 = { r: 'N', note: '', photos: [] };
    r.items.fmA1 = { r: 'Y', note: '', photos: [] };
    let list = issues(t, r, opts);
    const err = list.filter((i) => i.level === 'error');
    assert.equal(err.length, 1);
    assert.equal(err[0].target, 'fmB3');
    assert.match(err[0].text, /^第 B3 项「吊柜墙面可承重,墙面无造型物阻碍安装」判定为否，需写明异常记录 \/ 处理方案$/);
    let s = t.summary(ctxOf(r));
    assert.equal(s.items.find((i) => i.label.en === 'Action needed').value, 'B3 吊柜墙面可承重,墙面无造型物阻碍安装（未写处理方案）');
    r.items.fmB3.note = '加装背板加固 / 负责人 Wilson';
    list = issues(t, r, opts);
    assert.ok(!list.some((i) => i.level === 'error'));
    s = t.summary(ctxOf(r));
    const v = Object.fromEntries(s.items.map((i) => [i.label.en, i]));
    assert.equal(v.Yes.value, '1 项 items');
    assert.equal(v.No.value, '1 项 items');
    assert.equal(v['Not checked'].value, '20 项 items');
    assert.equal(v['Action needed'].value, 'B3 吊柜墙面可承重,墙面无造型物阻碍安装（加装背板加固 / 负责人 Wilson）');
    assert.equal(v['Action needed'].tone, 'fail');
    // 签名提醒：有客户签名图后只剩复尺人员
    r.signatures.customer.image = 'm_sig';
    assert.deepEqual(checksText(ctxOf(r)), ['复尺人员还未签名']);
    assert.ok(issues(t, r, opts).some((i) => i.text === '复尺人员还未签名'));
  }],
];
