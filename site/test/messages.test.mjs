// 文案类模板：进场通知 / 每日汇报 + 通用 WhatsApp 摘要 + 分享照片顺序
import assert from 'node:assert/strict';
import siteNotice, { fmtDrawingVersion } from '../src/templates/siteNotice.js';
import dailyReport, { durationText, dayNumber, autoDuration } from '../src/templates/dailyReport.js';
import qualityCheck from '../src/templates/qualityCheck.js';
import { allFields } from '../src/templates/schema.js';
import { createReport, duplicateReport, issues, makeCtx } from '../src/lib/report.js';
import { buildDocModel, modelMedia } from '../src/lib/docmodel.js';
import { addDays, todayISO } from '../src/lib/format.js';
import { buildText, photoListForShare } from '../src/lib/text.js';
import { fillReport, SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fixtures.mjs';

const P = SAMPLE_PROJECT;
const S = SAMPLE_SETTINGS;
const text = (template, report, extra = {}) => buildText({ template, report, project: P, settings: S, ...extra });
const ctxOf = (template, report) => makeCtx({ template, report, project: P, settings: S });

// 用户原文（区域行去掉了 ']' 前多余的空格）
const NOTICE = `【进场通知】Tuai Timur Residence – Hailey 单位安装

📅 日期：10月9日 周五
📍 地点：Tuai Timur Residence，单位 17-3
🗺️ 导航：https://maps.app.goo.gl/5icvqNRxPNDEBmcv7?g_st=ac

⏰ 时间
8:45 到场集合
9:00 开工，16:30 开始收拾，17:00 离场
午休 [12:00–13:00]

🚪 进场
Guard house 登记，带护照
停车：访客停车场
现场负责人：Wilson 016-3881819。任何问题找我

🔨 施工规定
Hacking 无时段限制，碎料当场装袋
走廊、电梯、单位地面先铺保护垫再搬运
垃圾：当天清走
单位内禁烟
统一着装、安全鞋

📋 当日任务
区域：[鞋柜 / 主卧柜 / 电视柜]
按 [2026.09.12] 版深化图纸施工，开工前逐柜核对位置再动工
物料：已在现场

✅ 收工前
每柜每日进度照发群
全场巡一遍拍视频
关水、断电、垃圾清、锁门窗`;

const DAILY = [
  '每日安装进度汇报：',
  '溪岸定制安装汇报',
  '1、地址：Tuai Timur Residence, Unit 17-3, Jalan Tuai Timur, 50450 Kuala Lumpur',
  '2、预计工期：预计 5 天（今天第 1 天）',
  '3、今日内容：鞋柜、主卧衣柜柜体安装完成',
  '4、明天是否继续：是',
  '5、施工现场卫生：已清理（见图）',
  '6、水电门窗：已关闭（见图）（附退场视频）',
  '7、下一步计划：明天安装电视柜及门板',
  '8、温馨提示：门板明早 9 点到货，请保安预留货梯',
  `${' '.repeat(26)}安装部`,
  `${' '.repeat(25)}2026.10.8`,
].join('\n');

function notice() {
  const r = createReport(siteNotice, { project: P, settings: S });
  r.values.date = '2026-10-09';
  r.values.areas = ['鞋柜', '主卧柜', '电视柜'];
  r.values.drawingVersion = '2026-09-12';
  return r;
}

function daily(previous = []) {
  const r = createReport(dailyReport, { project: P, settings: S, previous });
  Object.assign(r.values, {
    date: '2026-10-08',
    todayWork: '鞋柜、主卧衣柜柜体安装完成',
    progressPhotos: ['m_photo1', 'm_photo2'],
    continueTomorrow: '是',
    hygiene: '已清理',
    hygienePhotos: ['m_photo3'],
    utilities: '已关闭',
    utilitiesPhotos: ['m_photo4'],
    exitVideo: 'm_video',
    nextPlan: '明天安装电视柜及门板',
    tips: '门板明早 9 点到货，请保安预留货梯',
  });
  return r;
}

const prev = (id, date, extra = {}) => ({ id, templateId: 'daily-report', projectId: P.id, values: { date }, ...extra });

// 其他 agent 并行写的模板：存在就测，不存在跳过
async function maybe(path) {
  try {
    return (await import(path)).default;
  } catch {
    return null;
  }
}

export const tests = [
  ['进场通知：结构', () => {
    assert.equal(siteNotice.id, 'site-notice');
    assert.equal(siteNotice.kind, 'message');
    assert.equal(siteNotice.stage, 3);
    assert.equal(siteNotice.icon, 'Megaphone');
    assert.equal(siteNotice.accent, '#2F4A3C');
    assert.deepEqual(siteNotice.doc.title, { zh: '进场通知', en: 'SITE ENTRY NOTICE' });
    assert.deepEqual(
      siteNotice.sections.map((s) => s.title.zh),
      ['基本', '时间', '进场', '施工规定', '当日任务', '收工前', '附加'],
    );
    const keys = allFields(siteNotice).map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const k of ['project', 'client', 'workType', 'date', 'location', 'unit', 'mapLink', 'arrive', 'start', 'pack', 'leave', 'lunch',
      'entryNote', 'parking', 'picName', 'picPhone', 'rules', 'areas', 'drawingVersion', 'materials', 'beforeLeave', 'extra', 'photos']) {
      assert.ok(keys.includes(k), `缺字段 ${k}`);
    }
  }],
  ['进场通知：默认值（明天 / 项目 / 设置带入）', () => {
    const r = createReport(siteNotice, { project: P, settings: S });
    const v = r.values;
    assert.equal(v.date, addDays(todayISO(), 1));
    assert.equal(v.project, 'Tuai Timur Residence');
    assert.equal(v.location, 'Tuai Timur Residence');
    assert.equal(v.client, 'Hailey');
    assert.equal(v.unit, '17-3');
    assert.equal(v.mapLink, P.mapLink);
    assert.equal(v.picName, 'Wilson');
    assert.equal(v.picPhone, '016-3881819');
    assert.equal(v.lunch, '12:00–13:00');
    assert.equal(v.rules.length, 5);
    assert.equal(v.beforeLeave.length, 3);
    assert.deepEqual(v.areas, []);
    // 没有项目也能新建：登记 / 停车用默认值
    const bare = createReport(siteNotice, {});
    assert.equal(bare.values.entryNote, 'Guard house 登记，带护照');
    assert.equal(bare.values.parking, '访客停车场');
    assert.equal(bare.values.location, '');
  }],
  ['进场通知：文案与原文逐字一致', () => {
    const out = text(siteNotice, notice());
    assert.equal(out, NOTICE);
    assert.ok(out.includes('\u{1F5FA}️ 导航'));
    assert.ok(!out.includes('电视柜 ]'));
  }],
  ['进场通知：空值整行省略 + 备注块', () => {
    const r = notice();
    Object.assign(r.values, { client: '', mapLink: '', unit: '', lunch: '', drawingVersion: '', extra: '钥匙在保安处\n\n货梯已预约 8:30', pack: '' });
    const out = text(siteNotice, r);
    const ls = out.split('\n');
    assert.equal(ls[0], '【进场通知】Tuai Timur Residence 单位安装');
    assert.ok(ls.includes('📍 地点：Tuai Timur Residence'));
    assert.ok(!out.includes('导航'));
    assert.ok(!out.includes('午休'));
    assert.ok(ls.includes('9:00 开工，17:00 离场'));
    assert.ok(ls.includes('按最新版深化图纸施工，开工前逐柜核对位置再动工'));
    assert.ok(out.endsWith('关水、断电、垃圾清、锁门窗\n\n📌 备注\n钥匙在保安处\n货梯已预约 8:30'));
    assert.ok(!/\n\n\n/.test(out));
    // 自定义区域 + 规定删光 → 整块省略
    r.values.areas = ['鞋柜', '阳台柜'];
    r.values.rules = ['', '  '];
    const out2 = text(siteNotice, r);
    assert.ok(out2.includes('区域：[鞋柜 / 阳台柜]'));
    assert.ok(!out2.includes('🔨'));
  }],
  ['进场通知：图纸版本补零', () => {
    assert.equal(fmtDrawingVersion('2026-09-12'), '2026.09.12');
    assert.equal(fmtDrawingVersion('2026-1-5'), '2026.01.05');
    assert.equal(fmtDrawingVersion(''), '');
    assert.equal(fmtDrawingVersion('V3'), 'V3');
  }],
  ['进场通知：填写提醒 / 文件名', () => {
    const r = createReport(siteNotice, { project: P, settings: { ...S, phone: '' } });
    r.values.date = '';
    const w = siteNotice.checks(ctxOf(siteNotice, r));
    assert.ok(w.some((t) => t.includes('日期')));
    assert.ok(w.some((t) => t.includes('区域')));
    assert.ok(w.some((t) => t.includes('电话')));
    assert.deepEqual(siteNotice.checks(ctxOf(siteNotice, notice())), []);
    assert.ok(issues(siteNotice, r).some((i) => i.text.includes('区域')));
    assert.equal(siteNotice.filename(ctxOf(siteNotice, notice())), '进场通知_Tuai Timur Residence_2026-10-09');
  }],
  ['每日汇报：结构', () => {
    assert.equal(dailyReport.id, 'daily-report');
    assert.equal(dailyReport.kind, 'message');
    assert.equal(dailyReport.stage, 4);
    assert.equal(dailyReport.icon, 'CalendarCheck');
    assert.deepEqual(dailyReport.doc.title, { zh: '溪岸定制安装汇报', en: 'DAILY INSTALLATION REPORT' });
    const f = Object.fromEntries(allFields(dailyReport).map((x) => [x.key, x]));
    assert.deepEqual(
      ['address', 'duration', 'todayWork', 'continueTomorrow', 'hygiene', 'utilities', 'nextPlan', 'tips'].map((k) => f[k].label.zh),
      ['1、地址', '2、预计工期', '3、今日内容', '4、明天是否继续', '5、施工现场卫生', '6、水电门窗', '7、下一步计划', '8、温馨提示'],
    );
    assert.equal(f.exitVideo.type, 'video');
    assert.equal(f.progressPhotos.max, 30);
    assert.ok(f.todayWork.required && f.date.required);
  }],
  ['每日汇报：文案与格式逐字一致', () => {
    assert.equal(text(dailyReport, daily()), DAILY);
  }],
  ['每日汇报：多行 / 空值 / 无照片', () => {
    const r = daily();
    Object.assign(r.values, {
      address: 'Tuai Timur Residence, Unit 17-3,\nJalan Tuai Timur\n50450 Kuala Lumpur',
      todayWork: '鞋柜柜体完成\n\n主卧衣柜柜体完成 ',
      hygienePhotos: [],
      utilitiesPhotos: [],
      exitVideo: '',
      nextPlan: '',
      tips: '',
      continueTomorrow: '否',
    });
    const ls = text(dailyReport, r).split('\n');
    assert.equal(ls[2], '1、地址：Tuai Timur Residence, Unit 17-3，Jalan Tuai Timur，50450 Kuala Lumpur');
    assert.deepEqual(ls.slice(4, 7), ['3、今日内容：', '鞋柜柜体完成', '主卧衣柜柜体完成']);
    assert.equal(ls[7], '4、明天是否继续：否');
    assert.equal(ls[8], '5、施工现场卫生：已清理');
    assert.equal(ls[9], '6、水电门窗：已关闭');
    assert.equal(ls[10], '7、下一步计划：—');
    assert.equal(ls[11], '8、温馨提示：无');
    // 只有视频没有照片
    r.values.exitVideo = 'm_video';
    assert.ok(text(dailyReport, r).includes('6、水电门窗：已关闭（附退场视频）'));
  }],
  ['每日汇报：预计工期递减', () => {
    assert.equal(durationText(5, 1), '预计 5 天（今天第 1 天）');
    assert.equal(durationText(5, 2), '剩余 4 天（今天第 2 天 / 共 5 天）');
    assert.equal(durationText(5, 5), '剩余 1 天（今天第 5 天 / 共 5 天）');
    assert.equal(durationText(5, 6), '已超出预计工期（今天第 6 天 / 原定 5 天）');
    assert.equal(durationText('5', 3), '剩余 3 天（今天第 3 天 / 共 5 天）');
    assert.equal(durationText(undefined, 1), '');
    assert.equal(durationText('', 2), '');
    assert.equal(durationText(0, 1), '');
  }],
  ['每日汇报：之前的汇报计数（同日 / 更晚 / 其他项目不算）', () => {
    const previous = [
      prev('a', '2026-10-07'),
      prev('b', '2026-10-06'),
      prev('c', '2026-10-06'), // 同一天补发
      prev('d', '2026-10-08'), // 与本报告同一天
      prev('e', '2026-10-10'), // 更晚
      prev('f', '2026-10-05', { projectId: 'p_other' }),
      prev('g', '2026-10-05', { templateId: 'quality-check' }),
      prev('h', ''),
      { id: 'i', values: { date: '2026-10-01' } }, // 调用方已过滤，没有 templateId / projectId 也算
    ];
    assert.equal(dayNumber(previous, '2026-10-08', { projectId: P.id }), 4);
    assert.equal(dayNumber([], '2026-10-08'), 1);
    assert.equal(dayNumber(previous, '', { projectId: P.id }), 1);
    assert.equal(dayNumber([prev('x', '2026-10-07'), prev('self', '2026-10-01')], '2026-10-08', { reportId: 'self' }), 2);
    const ctx = { project: P, previous, report: { id: 'r1', values: { date: '2026-10-08' } }, today: '2026-10-20' };
    assert.equal(autoDuration(ctx), '剩余 2 天（今天第 4 天 / 共 5 天）');
    assert.equal(autoDuration({ ...ctx, project: { ...P, plannedDays: 3 } }), '已超出预计工期（今天第 4 天 / 原定 3 天）');
    assert.equal(autoDuration({ ...ctx, project: { ...P, plannedDays: '' } }), '');
    // 新建时按今天算：前两天各一份 → 今天第 3 天
    const t = todayISO();
    const r = createReport(dailyReport, { project: P, settings: S, previous: [prev('y', addDays(t, -2)), prev('z', addDays(t, -1)), prev('w', t)] });
    assert.equal(r.values.duration, '剩余 3 天（今天第 3 天 / 共 5 天）');
    assert.equal(r.values.date, t);
    // 「照上次再写一份」：工期重新计算，今日内容 / 下一步计划清空
    const src = daily();
    const dup = duplicateReport(dailyReport, src, { project: P, settings: S, previous: [prev('y', addDays(t, -1))] });
    assert.equal(dup.values.duration, '剩余 4 天（今天第 2 天 / 共 5 天）');
    assert.equal(dup.values.todayWork, '');
    assert.equal(dup.values.nextPlan, '');
    assert.equal(dup.values.tips, src.values.tips);
  }],
  ['每日汇报：填写提醒 / 文件名', () => {
    const r = createReport(dailyReport, { project: P, settings: S });
    const w = dailyReport.checks(ctxOf(dailyReport, r));
    assert.ok(w.some((t) => t.includes('卫生')));
    assert.ok(w.some((t) => t.includes('水电门窗')));
    assert.ok(w.some((t) => t.includes('退场视频')));
    assert.ok(issues(dailyReport, r).some((i) => i.text.includes('今日内容')));
    assert.deepEqual(dailyReport.checks(ctxOf(dailyReport, daily())), []);
    r.values.utilities = '未关闭';
    assert.ok(dailyReport.checks(ctxOf(dailyReport, r)).some((t) => t.includes('未关闭')));
    assert.equal(dailyReport.filename(ctxOf(dailyReport, daily())), '安装汇报_Tuai Timur Residence 17-3（Hailey）_2026-10-08');
  }],
  ['空报告生成文案不报错', () => {
    for (const t of [siteNotice, dailyReport, qualityCheck]) {
      for (const r of [createReport(t, {}), fillReport(t, 'empty'), { values: {} }, {}]) {
        const a = buildText({ template: t, report: r });
        const b = buildText({ template: t, report: r, project: P, settings: S, previous: [] });
        assert.equal(typeof a, 'string');
        assert.ok(b.length > 0);
      }
    }
    const e = buildText({ template: dailyReport, report: { values: {} } }).split('\n');
    assert.equal(e[2], '1、地址：—');
    assert.equal(e[e.length - 1], `${' '.repeat(26)}安装部`);
    assert.equal(buildText({ template: siteNotice, report: { values: {} } }).split('\n')[0], '【进场通知】');
  }],
  ['文案模板的文档模型（PDF / Word / Excel 用）', () => {
    for (const [t, r] of [[siteNotice, notice()], [dailyReport, daily()], [siteNotice, fillReport(siteNotice)], [dailyReport, fillReport(dailyReport)]]) {
      const m = buildDocModel({ template: t, report: r, project: P, settings: S });
      assert.equal(m.meta.kind, 'message');
      assert.ok(m.blocks.length >= 4 && m.blocks.every((b) => b.type === 'fields'));
      assert.ok(m.meta.filename.length > 0);
    }
    const m = buildDocModel({ template: dailyReport, report: daily(), project: P, settings: S });
    const ids = modelMedia(m).map((x) => x.id);
    assert.deepEqual(ids, ['m_photo1', 'm_photo2', 'm_photo3', 'm_photo4', 'm_video']);
  }],
  ['通用摘要：安装质检清单', () => {
    const r = fillReport(qualityCheck);
    r.values.date = '2026-10-09';
    const out = text(qualityCheck, r);
    assert.equal(out, [
      '【安装质检清单】Tuai Timur Residence 17-3（Hailey）',
      '📅 2026-10-09 · Wilson',
      '✅ 合格 14 · ❌ 不合格 4 · ➖ 不适用 3 · ⬜ 未填 0',
      '',
      '❌ 不合格项：',
      '4. 柜体与墙面收口 — 左侧门板缝隙偏大 3mm，已调整',
      '9. 拉手 / 五金 — 左侧门板缝隙偏大 3mm，已调整',
      '14. 防水打胶 — 左侧门板缝隙偏大 3mm，已调整',
      '19. 撕掉标签 — 左侧门板缝隙偏大 3mm，已调整',
      '',
      '— Wilson',
    ].join('\n'));
    // ★ 必查项不合格 + 未填
    r.items.qc3 = { r: 'F', note: '吊码少 1 个\n已补', photos: [] };
    delete r.items.qc21;
    const out2 = text(qualityCheck, r);
    assert.ok(out2.includes('✅ 合格 12 · ❌ 不合格 5 · ➖ 不适用 3 · ⬜ 未填 1'));
    assert.ok(out2.includes('3. 吊柜固定 ★ — 吊码少 1 个；已补'));
    // 全部合格
    const ok = fillReport(qualityCheck, 'pass');
    assert.ok(text(qualityCheck, ok).includes('✅ 无不合格项'));
  }],
  ['通用摘要：按 tone 统计（是 / 否、GO / NO-GO）', () => {
    const tpl = {
      id: 'demo',
      kind: 'checklist',
      name: { zh: '示例清单', en: 'Demo' },
      sections: [
        { id: 'f', type: 'fields', fields: [{ key: 'project', type: 'text', label: '项目', bind: 'project.siteLabel' }] },
        {
          id: 'c',
          type: 'checklist',
          title: { zh: '检查', en: 'Check' },
          scale: 'yes-no-na',
          items: [
            { id: 'a', no: '1', title: { zh: '电源到位' } },
            { id: 'b', no: '2', title: { zh: '地面完成' }, key: true },
            { id: 'c', no: '3', title: { zh: '开工判定' }, scale: { id: 'gonogo', options: [{ v: 'GO', zh: 'GO 可开工', tone: 'pass' }, { v: 'NOGO', zh: 'NO-GO 暂缓', tone: 'fail' }] } },
            { id: 'd', no: '4', title: { zh: '搬运动线' }, input: { key: 'route', type: 'text', label: '动线' } },
          ],
        },
      ],
      summary: () => ({ title: { zh: '统计' }, items: [], conclusion: { label: { zh: '建议', en: 'Advice' }, value: 'NO-GO 暂缓开工', tone: 'fail' } }),
    };
    const r = createReport(tpl, { project: P, settings: S });
    r.values.date = '2026-10-09';
    r.items = { a: { r: 'Y' }, b: { r: 'N', note: '瓷砖未铺' }, c: { r: 'NOGO' }, d: { value: 'B2 → 货梯' } };
    const out = text(tpl, r);
    assert.equal(out, [
      '【示例清单】Tuai Timur Residence 17-3（Hailey）',
      '📅 2026-10-09 · Wilson',
      '✅ 是/GO 可开工 1 · ❌ 否/NO-GO 暂缓 2 · ➖ 不适用 0 · ⬜ 未填 0',
      '',
      '❌ 问题项：',
      '2. 地面完成 ★【否】 — 瓷砖未铺',
      '3. 开工判定【NO-GO 暂缓】',
      '',
      '📌 建议：NO-GO 暂缓开工',
      '',
      '— Wilson',
    ].join('\n'));
  }],
  ['通用摘要：打勾清单（未完成）+ 编号重复加节号', () => {
    const sec = (no, ids) => ({ id: `s${no}`, type: 'checklist', no, title: { zh: `节 ${no}` }, scale: 'done', items: ids.map((id, i) => ({ id, no: String(i + 1), title: { zh: `事项 ${id}` } })) });
    const tpl = { id: 'tick', name: { zh: '打勾清单' }, sections: [sec('Ⅰ', ['a', 'b']), sec('Ⅱ', ['c'])] };
    const r = { values: { date: '2026-10-09' }, items: { a: { r: 'Y' } } };
    assert.equal(buildText({ template: tpl, report: r, settings: S }), [
      '【打勾清单】',
      '📅 2026-10-09 · Wilson',
      '✅ 完成 1 · ⬜ 未完成 2',
      '',
      '⬜ 未完成项：',
      'Ⅰ-2. 事项 b',
      'Ⅱ-1. 事项 c',
      '',
      '— Wilson',
    ].join('\n'));
    r.items.b = { r: 'Y' };
    r.items.c = { r: 'Y' };
    assert.ok(buildText({ template: tpl, report: r }).includes('✅ 全部完成'));
  }],
  ['通用摘要：其他模板（存在才测）', async () => {
    const names = ['measurement', 'preInstall', 'finalInspection', 'handover'];
    for (const n of names) {
      const t = await maybe(`../src/templates/${n}.js`);
      if (!t) continue;
      for (const variant of ['full', 'pass', 'empty']) {
        const r = fillReport(t, variant);
        const out = text(t, r);
        assert.ok(out.startsWith(`【${t.name.zh}】`), `${n} ${variant}`);
        assert.ok(!out.includes('undefined') && !out.includes('[object'), `${n} ${variant}: ${out}`);
      }
    }
  }],
  ['分享照片顺序：字段 → 检查项 → 表格 → 视频', () => {
    const tpl = {
      id: 'demo2',
      name: { zh: '示例' },
      sections: [
        { id: 'f1', type: 'fields', fields: [{ key: 'pics', type: 'photos', label: '照片' }, { key: 'vid', type: 'video', label: '视频' }, { key: 'note', type: 'text', label: '备注' }] },
        { id: 'c', type: 'checklist', items: [{ id: 'i1', title: { zh: '一' } }, { id: 'i2', title: { zh: '二' } }] },
        { id: 't', type: 'table', columns: [{ key: 'x', type: 'text', label: 'X' }], photoSlots: [{ key: 'before', label: { zh: '前' } }, { key: 'after', label: { zh: '后' } }] },
        { id: 'f2', type: 'fields', fields: [{ key: 'more', type: 'photos', label: '更多' }, { key: 'hiddenPics', type: 'photos', label: '隐藏', hidden: true }] },
        { id: 'sig', type: 'signatures', roles: [{ id: 'a', zh: '签名' }] },
      ],
    };
    const report = {
      values: { pics: ['m_1', 'm_2'], vid: 'm_v', note: 'm_not_media', more: ['m_3', 'm_1'], hiddenPics: ['m_h'] },
      items: { i1: { r: 'P', photos: ['m_4'] }, i2: { r: 'F', photos: ['m_5', 'm_6'] } },
      tables: { t: [{ x: 'a', before: ['m_7'], after: ['m_8'] }, { x: 'b', before: [], after: ['m_9'] }] },
      signatures: { a: { image: 'm_sig' } },
    };
    assert.deepEqual(photoListForShare(tpl, report), ['m_1', 'm_2', 'm_3', 'm_4', 'm_5', 'm_6', 'm_7', 'm_8', 'm_9', 'm_v']);
    assert.deepEqual(photoListForShare(dailyReport, daily()), ['m_photo1', 'm_photo2', 'm_photo3', 'm_photo4', 'm_video']);
    assert.deepEqual(photoListForShare(siteNotice, notice()), []);
    assert.deepEqual(photoListForShare(dailyReport, {}), []);
  }],
];
