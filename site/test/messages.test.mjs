// 文案类模板：进场通知 / 每日汇报 + 通用 WhatsApp 摘要 + 分享照片顺序
import assert from 'node:assert/strict';
import siteNotice, { fmtDrawingVersion } from '../src/templates/siteNotice.js';
import dailyReport, { durationText, durationIn, dayNumber, autoDuration } from '../src/templates/dailyReport.js';
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
// 中文文案（原来的逐字格式）；不给 lang 时按报告 / 设置，默认中英 = 原来的文案（逐字不变）
const zhText = (template, report, extra = {}) => text(template, report, { lang: 'zh', ...extra });
const ctxOf = (template, report, lang) => makeCtx({ template, report, project: P, settings: S, lang });
const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u3000-\u303F]/;

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

// 同一份通知的英文版：结构 / 时间 / 链接不变，默认规定等换成英文
const NOTICE_EN = `[Site Entry Notice] Tuai Timur Residence – Hailey · Unit installation

📅 Date: Fri, 9 Oct
📍 Location: Tuai Timur Residence, Unit 17-3
🗺️ Map: https://maps.app.goo.gl/5icvqNRxPNDEBmcv7?g_st=ac

⏰ Time
8:45 Assemble on site
9:00 Start work, 16:30 Start packing up, 17:00 Leave site
Lunch break [12:00–13:00]

🚪 Site Entry
Register at guard house with passport
Parking: Visitor parking
Person in charge: Wilson 016-3881819. Contact me for any issues

🔨 Site Rules
Hacking: no time restriction; bag debris on the spot
Lay protection on the corridor, lift and unit floor before moving anything in
Rubbish: clear on the same day
No smoking inside the unit
Company uniform and safety shoes

📋 Today's Tasks
Areas: [Shoe cabinet / Master bedroom wardrobe / TV cabinet]
Follow shop drawing version [2026.09.12]; check each cabinet's position before starting work
Materials: Already on site

✅ Before Leaving
Post daily progress photos of every cabinet to the group
Walk the whole site and record a video
Water off, power off, rubbish cleared, doors & windows locked`;

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

// 英文版（用户填写的内容用英文写的一份，见 dailyEn()）
const DAILY_EN = [
  'Daily Installation Progress Report:',
  'Sail Custom Installation Report',
  '1. Address: Tuai Timur Residence, Unit 17-3, Jalan Tuai Timur, 50450 Kuala Lumpur',
  '2. Planned duration: Est. 5 days (today is day 1)',
  "3. Today's work: Shoe cabinet and master bedroom wardrobe carcasses installed",
  '4. Continue tomorrow: Yes',
  '5. Site cleanliness: Cleaned (see photos)',
  '6. Water / power / doors & windows: Off & locked (see photos) (exit video attached)',
  '7. Next plan: TV cabinet and door panels tomorrow',
  '8. Reminders: Door panels arrive 9am, please book the service lift',
  `${' '.repeat(26)}Installation Department`,
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
  // 不带开工日期：否则「第几天」会按真实的今天推算，逐字比对随日期变化
  const r = createReport(dailyReport, { project: { ...P, startDate: '' }, settings: S, previous });
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

/** 用户内容全用英文写的每日汇报（选项 / 工期 / 落款仍是 App 默认的中文值） */
function dailyEn() {
  const r = daily();
  Object.assign(r.values, {
    todayWork: 'Shoe cabinet and master bedroom wardrobe carcasses installed',
    nextPlan: 'TV cabinet and door panels tomorrow',
    tips: 'Door panels arrive 9am, please book the service lift',
  });
  return r;
}

const prev = (id, date, extra = {}) => ({ id, templateId: 'daily-report', projectId: P.id, values: { date, todayWork: '柜体安装' }, ...extra });

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
    // 不选语言（中英）= 原来的文案
    const out = text(siteNotice, notice());
    assert.equal(out, NOTICE);
    assert.equal(zhText(siteNotice, notice()), NOTICE);
    assert.equal(text(siteNotice, notice(), { lang: 'both' }), NOTICE);
    assert.ok(out.includes('\u{1F5FA}️ 导航'));
    assert.ok(!out.includes('电视柜 ]'));
    // 报告 / 设置里选了中文也一样
    assert.equal(text(siteNotice, { ...notice(), lang: 'zh' }), NOTICE);
    assert.equal(text(siteNotice, notice(), { settings: { ...S, docLang: 'zh' } }), NOTICE);
  }],
  ['进场通知：英文版；中英 = 原来的中文文案', () => {
    const r = notice();
    const en = text(siteNotice, r, { lang: 'en' });
    assert.equal(en, NOTICE_EN);
    assert.ok(!CJK.test(en), en);
    // 中英（也是没选语言时的默认）= 原来的中文文案，不附英文版
    assert.equal(text(siteNotice, r, { lang: 'both' }), NOTICE);
    assert.equal(text(siteNotice, r), NOTICE);
    assert.equal(text(siteNotice, { ...r, lang: 'en' }), NOTICE_EN);
    assert.equal(text(siteNotice, r, { settings: { ...S, docLang: 'en' } }), NOTICE_EN);
    assert.equal(siteNotice.text(ctxOf(siteNotice, r, 'en')), NOTICE_EN);
    // 用户自己写 / 改过的内容原样输出；默认规定只换没改过的那几行
    Object.assign(r.values, {
      workType: '厨房翻新',
      areas: ['鞋柜', '阳台柜'],
      rules: ['Hacking 只限 10:00–16:00', '单位内禁烟'],
      parking: 'B2 访客位',
      extra: '钥匙在保安处',
      entryNote: '',
    });
    const ls = text(siteNotice, r, { lang: 'en' }).split('\n');
    assert.equal(ls[0], '[Site Entry Notice] Tuai Timur Residence – Hailey · 厨房翻新');
    assert.ok(ls.includes('Areas: [Shoe cabinet / 阳台柜]'));
    assert.ok(ls.includes('Hacking 只限 10:00–16:00'));
    assert.ok(ls.includes('No smoking inside the unit'));
    assert.ok(ls.includes('Parking: B2 访客位'));
    assert.deepEqual(ls.slice(-2), ['📌 Notes', '钥匙在保安处']);
    assert.ok(!ls.some((l) => /Register at guard house/.test(l)));
    // 空值整行省略，英文版同样
    Object.assign(r.values, { client: '', workType: '', mapLink: '', lunch: '', drawingVersion: '', pack: '', date: '' });
    const e2 = text(siteNotice, r, { lang: 'en' }).split('\n');
    assert.equal(e2[0], '[Site Entry Notice] Tuai Timur Residence');
    assert.ok(e2.includes('9:00 Start work, 17:00 Leave site'));
    assert.ok(e2.includes("Follow the latest shop drawings; check each cabinet's position before starting work"));
    assert.ok(!e2.some((l) => /Map:|Lunch|Date:/.test(l)));
    assert.equal(buildText({ template: siteNotice, report: { values: {} }, lang: 'en' }).split('\n')[0], '[Site Entry Notice]');
  }],
  ['进场通知：空值整行省略 + 备注块', () => {
    const r = notice();
    Object.assign(r.values, { client: '', mapLink: '', unit: '', lunch: '', drawingVersion: '', extra: '钥匙在保安处\n\n货梯已预约 8:30', pack: '' });
    const out = text(siteNotice, r);
    assert.equal(zhText(siteNotice, r), out);
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
    assert.equal(zhText(siteNotice, r), out2);
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
    assert.equal(siteNotice.filename(ctxOf(siteNotice, notice(), 'zh')), '进场通知_Tuai Timur Residence_2026-10-09');
    assert.equal(siteNotice.filename(ctxOf(siteNotice, notice(), 'en')), 'Site_Entry_Notice_Tuai Timur Residence_2026-10-09');
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
    // 不选语言（中英）= 原来的文案
    assert.equal(text(dailyReport, daily()), DAILY);
    assert.equal(text(dailyReport, daily(), { lang: 'both' }), DAILY);
    assert.equal(zhText(dailyReport, daily()), DAILY);
    assert.equal(text(dailyReport, { ...daily(), lang: 'zh' }), DAILY);
  }],
  ['每日汇报：英文版；中英 = 原来的中文文案', () => {
    const r = dailyEn();
    const en = text(dailyReport, r, { lang: 'en' });
    assert.equal(en, DAILY_EN);
    assert.ok(!CJK.test(en), en);
    const zh = text(dailyReport, r, { lang: 'zh' });
    assert.ok(zh.startsWith('每日安装进度汇报：\n') && zh.endsWith(`${' '.repeat(26)}安装部\n${' '.repeat(25)}2026.10.8`), zh);
    assert.equal(text(dailyReport, r, { lang: 'both' }), zh);
    assert.equal(text(dailyReport, r), zh);
    // 用户写的中文内容在英文版里原样保留
    assert.ok(text(dailyReport, daily(), { lang: 'en' }).includes("3. Today's work: 鞋柜、主卧衣柜柜体安装完成"));
    // 多行 / 空值 / 否 / 未清理 / 自己写的工期 / 自定义落款
    Object.assign(r.values, {
      address: 'Tuai Timur Residence, Unit 17-3,\nJalan Tuai Timur\n50450 Kuala Lumpur',
      todayWork: 'Shoe cabinet\n\nWardrobe ',
      continueTomorrow: '否',
      hygiene: '未清理',
      hygienePhotos: [],
      utilities: '未关闭',
      utilitiesPhotos: [],
      exitVideo: '',
      nextPlan: '',
      tips: '',
      duration: 'About a week',
      dept: 'Sail Install Team',
    });
    const ls = text(dailyReport, r, { lang: 'en' }).split('\n');
    assert.equal(ls[2], '1. Address: Tuai Timur Residence, Unit 17-3, Jalan Tuai Timur, 50450 Kuala Lumpur');
    assert.equal(ls[3], '2. Planned duration: About a week');
    assert.deepEqual(ls.slice(4, 7), ["3. Today's work:", 'Shoe cabinet', 'Wardrobe']);
    assert.equal(ls[7], '4. Continue tomorrow: No');
    assert.equal(ls[8], '5. Site cleanliness: Not cleaned');
    assert.equal(ls[9], '6. Water / power / doors & windows: Not yet off & locked');
    assert.equal(ls[10], '7. Next plan: —');
    assert.equal(ls[11], '8. Reminders: None');
    assert.equal(ls[12], `${' '.repeat(26)}Sail Install Team`);
    // 空报告：英文版不报错，落款用英文
    const e = buildText({ template: dailyReport, report: { values: {} }, lang: 'en' }).split('\n');
    assert.equal(e[2], '1. Address: —');
    assert.equal(e[e.length - 1], `${' '.repeat(26)}Installation Department`);
  }],
  ['每日汇报：预计工期中英互换（自动生成的写法才换）', () => {
    assert.equal(durationText(5, 1, 'en'), 'Est. 5 days (today is day 1)');
    assert.equal(durationText(5, 2, 'en'), '4 days left (today is day 2 of 5)');
    assert.equal(durationText(5, 5, 'en'), '1 day left (today is day 5 of 5)');
    assert.equal(durationText(5, 6, 'en'), 'Over the planned duration (today is day 6; planned 5 days)');
    assert.equal(durationText(1, 1, 'en'), 'Est. 1 day (today is day 1)');
    assert.equal(durationText('', 2, 'en'), '');
    for (const [t, k] of [[5, 1], [5, 2], [5, 5], [5, 6], [1, 1], [12, 3]]) {
      assert.equal(durationIn(durationText(t, k), 'en'), durationText(t, k, 'en'));
      assert.equal(durationIn(durationText(t, k, 'en'), 'zh'), durationText(t, k));
      // 同一种语言照原样
      assert.equal(durationIn(durationText(t, k), 'zh'), durationText(t, k));
    }
    assert.equal(durationIn('预计5天（今天第1天）', 'zh'), '预计5天（今天第1天）');
    assert.equal(durationIn('大约一周', 'en'), '大约一周');
    assert.equal(durationIn('', 'en'), '');
    // 默认文件语言是 English：新建时直接写英文工期，第二天接着英文的「day k」往下数
    const NP = { ...P, startDate: '' };
    const SE = { ...S, docLang: 'en' };
    const t0 = todayISO();
    const r1 = createReport(dailyReport, { project: NP, settings: SE, previous: [] });
    assert.equal(r1.values.duration, 'Est. 5 days (today is day 1)');
    const r2 = createReport(dailyReport, {
      project: NP,
      settings: SE,
      previous: [prev('y', addDays(t0, -1), { values: { date: addDays(t0, -1), todayWork: 'x', duration: 'Est. 5 days (today is day 1)' } })],
    });
    assert.equal(r2.values.duration, '4 days left (today is day 2 of 5)');
    // 中文接英文也认得
    const r3 = createReport(dailyReport, {
      project: NP,
      settings: S,
      previous: [prev('y', addDays(t0, -1), { values: { date: addDays(t0, -1), todayWork: 'x', duration: '3 days left (today is day 3 of 5)' } })],
    });
    assert.equal(r3.values.duration, '剩余 2 天（今天第 4 天 / 共 5 天）');
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
    assert.equal(zhText(dailyReport, r), ls.join('\n'));
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
      { id: 'i', values: { date: '2026-10-01', todayWork: '进场' } }, // 调用方已过滤，没有 templateId / projectId 也算
      prev('j', '2026-10-02', { values: { date: '2026-10-02' } }), // 只点开没填的草稿不算
    ];
    assert.equal(dayNumber(previous, '2026-10-08', { projectId: P.id }), 4);
    assert.equal(dayNumber([], '2026-10-08'), 1);
    assert.equal(dayNumber(previous, '', { projectId: P.id }), 1);
    assert.equal(dayNumber([prev('x', '2026-10-07'), prev('self', '2026-10-01')], '2026-10-08', { reportId: 'self' }), 2);
    // 不带开工日期（开工日期的规则见 crew.test.mjs）
    const NP = { ...P, startDate: '' };
    const ctx = { project: NP, previous, report: { id: 'r1', values: { date: '2026-10-08' } }, today: '2026-10-20' };
    assert.equal(autoDuration(ctx), '剩余 2 天（今天第 4 天 / 共 5 天）');
    assert.equal(autoDuration({ ...ctx, project: { ...NP, plannedDays: 3 } }), '已超出预计工期（今天第 4 天 / 原定 3 天）');
    assert.equal(autoDuration({ ...ctx, project: { ...NP, plannedDays: '' } }), '');
    // 新建时按今天算：前两天各一份 → 今天第 3 天
    const t = todayISO();
    const r = createReport(dailyReport, { project: NP, settings: S, previous: [prev('y', addDays(t, -2)), prev('z', addDays(t, -1)), prev('w', t)] });
    assert.equal(r.values.duration, '剩余 3 天（今天第 3 天 / 共 5 天）');
    assert.equal(r.values.date, t);
    // 「照上次再写一份」：工期重新计算，今日内容 / 下一步计划清空
    const src = daily();
    const dup = duplicateReport(dailyReport, src, { project: NP, settings: S, previous: [prev('y', addDays(t, -1))] });
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
    assert.equal(dailyReport.filename(ctxOf(dailyReport, daily(), 'zh')), '安装汇报_Tuai Timur Residence 17-3（Hailey）_2026-10-08');
    assert.equal(dailyReport.filename(ctxOf(dailyReport, daily(), 'en')), 'Daily_Installation_Report_Tuai Timur Residence 17-3 (Hailey)_2026-10-08');
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
    // 中文 = 中英（原来的文案）
    assert.equal(buildText({ template: dailyReport, report: { values: {} }, lang: 'zh' }), e.join('\n'));
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
    // 不选语言（中英）= 原来的文案；这份没有结论行，中文版与它相同
    const out = text(qualityCheck, r);
    assert.equal(zhText(qualityCheck, r), out);
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
    assert.equal(zhText(qualityCheck, r), out2);
    // 全部合格
    const ok = fillReport(qualityCheck, 'pass');
    assert.ok(text(qualityCheck, ok).includes('✅ 无不合格项'));
  }],
  ['通用摘要：英文版 / 中英版（安装质检清单）', () => {
    const r = fillReport(qualityCheck);
    r.values.date = '2026-10-09';
    for (const id of Object.keys(r.items)) if (r.items[id].note) r.items[id].note = 'Left door gap 3mm too wide, adjusted';
    const en = text(qualityCheck, r, { lang: 'en' });
    assert.equal(en, [
      '[Installation Quality Checklist] Tuai Timur Residence 17-3 (Hailey)',
      '📅 2026-10-09 · Wilson',
      '✅ Pass 14 · ❌ Fail 4 · ➖ N/A 3 · ⬜ Not filled 0',
      '',
      '❌ Failed items:',
      '4. Cabinet-to-wall finishing — Left door gap 3mm too wide, adjusted',
      '9. Handles / hardware — Left door gap 3mm too wide, adjusted',
      '14. Waterproof sealant — Left door gap 3mm too wide, adjusted',
      '19. Remove labels — Left door gap 3mm too wide, adjusted',
      '',
      '— Wilson',
    ].join('\n'));
    assert.ok(!CJK.test(en));
    const zh = text(qualityCheck, r, { lang: 'zh' });
    assert.ok(zh.startsWith('【安装质检清单】') && zh.includes('✅ 合格 14 · ❌ 不合格 4'));
    // 中英 = 原来的文案（不附英文版）
    assert.equal(text(qualityCheck, r), zh);
    assert.ok(!text(qualityCheck, r).includes('[Installation Quality Checklist]'));
    // ★ + 多行备注；全部合格
    r.items.qc3 = { r: 'F', note: 'One bracket missing\nFixed', photos: [] };
    assert.ok(text(qualityCheck, r, { lang: 'en' }).includes('3. Wall-cabinet fixing ★ — One bracket missing; Fixed'));
    assert.ok(text(qualityCheck, fillReport(qualityCheck, 'pass'), { lang: 'en' }).includes('✅ No failed items'));
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
    assert.equal(zhText(tpl, r), out);
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
    // 英文版：选项 / 标签用英文（缺英文时退回中文）
    assert.equal(text(tpl, r, { lang: 'en' }), [
      '[Demo] Tuai Timur Residence 17-3 (Hailey)',
      '📅 2026-10-09 · Wilson',
      '✅ Yes/GO 可开工 1 · ❌ No/NO-GO 暂缓 2 · ➖ N/A 0 · ⬜ Not filled 0',
      '',
      '❌ Issues:',
      '2. 地面完成 ★ [No] — 瓷砖未铺',
      '3. 开工判定 [NO-GO 暂缓]',
      '',
      '📌 Advice: NO-GO 暂缓开工',
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
    assert.equal(buildText({ template: tpl, report: r, settings: S, lang: 'en' }), [
      '[打勾清单]',
      '📅 2026-10-09 · Wilson',
      '✅ Done 1 · ⬜ Not done 2',
      '',
      '⬜ Not done:',
      'Ⅰ-2. 事项 b',
      'Ⅱ-1. 事项 c',
      '',
      '— Wilson',
    ].join('\n'));
    assert.equal(buildText({ template: tpl, report: r, settings: S, lang: 'zh' }), buildText({ template: tpl, report: r, settings: S }));
    r.items.b = { r: 'Y' };
    r.items.c = { r: 'Y' };
    assert.ok(buildText({ template: tpl, report: r }).includes('✅ 全部完成'));
    assert.ok(!buildText({ template: tpl, report: r }).includes('All done'));
    assert.ok(buildText({ template: tpl, report: r, lang: 'en' }).includes('✅ All done'));
  }],
  ['文案：自动带入的工期 / 落款 / 默认规定跟着文案语言（新建时选的语言不影响；改过的照原样）', () => {
    // 中英（默认）建的日报，导出页换成 English
    const r = daily();
    r.values.duration = '剩余 4 天（今天第 2 天 / 共 5 天）';
    const en = text(dailyReport, r, { lang: 'en' }).split('\n');
    assert.equal(en[3], '2. Planned duration: 4 days left (today is day 2 of 5)');
    assert.equal(en.at(-2), `${' '.repeat(26)}Installation Department`);
    // English 建的（工期是英文写法），换成中文 / 中英：中文写法
    const re = { ...r, values: { ...r.values, duration: '4 days left (today is day 2 of 5)' } };
    assert.equal(text(dailyReport, re, { lang: 'zh' }).split('\n')[3], '2、预计工期：剩余 4 天（今天第 2 天 / 共 5 天）');
    assert.equal(text(dailyReport, re).split('\n')[3], '2、预计工期：剩余 4 天（今天第 2 天 / 共 5 天）');
    // 报告里改过的落款 / 工期照原样（不再把「陈师傅」换成 Installation Department）
    const edited = { ...r, values: { ...r.values, dept: '陈师傅', duration: '大约一周' } };
    const ee = text(dailyReport, edited, { lang: 'en' }).split('\n');
    assert.equal(ee[3], '2. Planned duration: 大约一周');
    assert.equal(ee.at(-2), `${' '.repeat(26)}陈师傅`);
    // 「设置」里的部门是英文：照写
    assert.equal(text(dailyReport, { ...r, values: { ...r.values, dept: 'Sail Install Team' } }, { lang: 'en', settings: { ...S, dept: 'Sail Install Team' } }).split('\n').at(-2), `${' '.repeat(26)}Sail Install Team`);
    // 项目没地址：带入的工地称呼在英文里换半角括号
    const noAddr = { ...P, address: '' };
    const rn = createReport(dailyReport, { project: noAddr, settings: S });
    assert.equal(rn.values.address, 'Tuai Timur Residence 17-3（Hailey）');
    assert.equal(buildText({ template: dailyReport, report: rn, project: noAddr, settings: S, lang: 'en' }).split('\n')[2], '1. Address: Tuai Timur Residence 17-3 (Hailey)');
    assert.equal(buildText({ template: dailyReport, report: rn, project: noAddr, settings: S }).split('\n')[2], '1、地址：Tuai Timur Residence 17-3（Hailey）');
    // 进场通知：默认文字与文件里一样按 display 换（存的值不变）
    const n = notice();
    assert.ok(text(siteNotice, n, { lang: 'en' }).includes('Register at guard house with passport\nParking: Visitor parking'));
    assert.equal(n.values.entryNote, 'Guard house 登记，带护照');
  }],
  ['通用摘要：中英 = 原来的文案（终检结论照原来的双语写法；中文只取中文）', async () => {
    let fi;
    try {
      fi = (await import('../src/templates/finalInspection.js')).default;
    } catch {
      return;
    }
    const r = fillReport(fi);
    r.values.result = 'pass';
    const both = text(fi, r);
    const line = both.split('\n').find((l) => l.startsWith('📌'));
    assert.ok(line.startsWith('📌 结论：合格 — 可安排交付 Passed — Ready for Handover'), line);
    assert.equal(text(fi, r, { lang: 'both' }), both);
    assert.ok(text(fi, r, { lang: 'zh' }).split('\n').some((l) => l.startsWith('📌 结论：合格 — 可安排交付') && !l.includes('Passed')));
    assert.ok(text(fi, r, { lang: 'en' }).includes('📌 Conclusion: Passed — Ready for Handover'));
    r.values.result = '';
    assert.ok(text(fi, r).includes('📌 结论：未选择 Not selected'));
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
        assert.ok(!out.includes(`[${t.name.en}]`), `${n} ${variant}: 中英 = 原来的文案，不附英文版`);
        assert.ok(!out.includes('undefined') && !out.includes('[object'), `${n} ${variant}: ${out}`);
        const zh = text(t, r, { lang: 'zh' });
        const en = text(t, r, { lang: 'en' });
        // 中英与中文只差在结论行（中英照原来的双语结论，如「合格 — 可安排交付 Passed — Ready for Handover」）
        const noConclusion = (x) => x.split('\n').filter((l) => !l.startsWith('📌')).join('\n');
        assert.equal(noConclusion(out), noConclusion(zh), `${n} ${variant}`);
        assert.ok(en.startsWith(`[${t.name.en}] `), `${n} ${variant}: ${en}`);
        // 中文版里没有英文选项名；英文版里除了用户填写的备注 / 项目名，没有中文
        assert.ok(!/ Pass | Fail |Not filled|Suggested/.test(zh), `${n} ${variant}: ${zh}`);
        const fixed = en.split('\n').filter((l) => !l.includes(' — ') && !l.startsWith('[')).join('\n');
        assert.ok(!CJK.test(fixed), `${n} ${variant}: ${fixed}`);
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
