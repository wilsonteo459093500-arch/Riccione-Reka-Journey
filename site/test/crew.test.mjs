// 师傅链接：打包 / 解析、合并项目、今天该打开哪份汇报、按开工日期推算第几天
import assert from 'node:assert/strict';
import dailyReport, { autoDuration } from '../src/templates/dailyReport.js';
import { addDays, todayISO } from '../src/lib/format.js';
import {
  crewLink, crewPayload, crewPayloadOf, parseCrew, mergeCrewProject, hasOwnWork, todayReport, crewMessage,
} from '../src/lib/crew.js';

const PROJECT = {
  id: 'p_tuai',
  name: 'Tuai Timur Residence',
  unit: '17-3',
  client: 'Hailey',
  so: 'SO-2026-0917',
  designer: 'Mei Ling',
  notes: '内部：报价 RM 38,000',
  address: 'Unit 17-3, Tuai Timur Residence,\nKuala Lumpur',
  mapLink: 'https://maps.app.goo.gl/5icvqNRxPNDEBmcv7?g_st=ac',
  plannedDays: 5,
  startDate: '2026-10-08',
  entryNote: 'Guard house 登记，带护照',
  parking: '访客停车场',
  updatedAt: 1000,
};
const SETTINGS = { name: 'Wilson', phone: '016-3881819', company: '溪岸' };
const ORIGIN = 'https://tora-riccione-reka.vercel.app';

export const tests = [
  ['打包 → 解析：只带约定字段，中文 / 换行不乱码', () => {
    const link = crewLink(PROJECT, SETTINGS, ORIGIN);
    assert.match(link, /^https:\/\/tora-riccione-reka\.vercel\.app\/#\/crew\/[A-Za-z0-9_-]+$/);
    const d = parseCrew(link);
    assert.equal(d.template, 'daily-report');
    assert.equal(d.project.id, 'p_tuai');
    assert.equal(d.project.address, PROJECT.address);
    assert.equal(d.project.entryNote, 'Guard house 登记，带护照');
    assert.equal(d.project.plannedDays, '5');
    assert.equal(d.project.so, undefined);
    assert.equal(d.project.designer, undefined);
    assert.equal(d.project.notes, undefined);
    assert.deepEqual(d.by, { name: 'Wilson', phone: '016-3881819' });
    assert.equal(d.at, 1000);
    // 只给那一段、前后有空格、WhatsApp 里带了别的文字
    assert.equal(parseCrew(`  ${crewPayload(PROJECT, SETTINGS)} `).project.name, 'Tuai Timur Residence');
    assert.equal(parseCrew(crewMessage('x', link)).project.unit, '17-3');
    assert.equal(crewPayloadOf(link), crewPayload(PROJECT, SETTINGS));
  }],
  ['坏链接 / 被改过的链接返回 null，不信任里面的多余字段', () => {
    assert.equal(parseCrew(''), null);
    assert.equal(parseCrew('https://tora-riccione-reka.vercel.app/#/'), null);
    assert.equal(parseCrew('not a link at all'), null);
    assert.equal(parseCrew('AAAAAAAAAAAA'), null);
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    assert.equal(parseCrew(enc({ v: 1, p: { id: 'x' } })), null, '没有项目名称');
    assert.equal(parseCrew(enc({ v: 2, p: { id: 'x', name: 'y' } })), null, '未知版本');
    const d = parseCrew(enc({ v: 1, p: { id: 'x', name: 'y', shared: { at: 9e15 }, __proto__: { evil: 1 }, so: 'S' }, by: 'oops' }));
    assert.deepEqual(Object.keys(d.project).sort(), ['id', 'name']);
    assert.equal({}.evil, undefined);
    assert.deepEqual(d.by, { name: '', phone: '' });
  }],
  ['合并项目：新的导入 / 自己的不动 / 旧链接不覆盖 / 新链接整份替换', () => {
    const data = parseCrew(crewLink(PROJECT, SETTINGS, ORIGIN));
    const fresh = mergeCrewProject(null, data);
    assert.equal(fresh.id, 'p_tuai');
    assert.equal(fresh.shared.at, 1000);
    assert.equal(fresh.shared.by.name, 'Wilson');
    assert.equal(mergeCrewProject({ ...PROJECT }, data), null, '主管自己点开测试，不能改自己的项目');
    assert.equal(mergeCrewProject({ ...fresh, createdAt: 5 }, data), null, '同一条链接再点一次');
    const newer = parseCrew(crewLink({ ...PROJECT, plannedDays: 7, parking: '', updatedAt: 2000 }, SETTINGS, ORIGIN));
    const merged = mergeCrewProject({ ...fresh, createdAt: 5 }, newer);
    assert.equal(merged.plannedDays, '7');
    assert.equal(merged.parking, undefined, '主管删掉的字段也清掉');
    assert.equal(merged.createdAt, 5);
    assert.equal(merged.shared.at, 2000);
  }],
  ['新手机才切换成师傅模式', () => {
    assert.equal(hasOwnWork([], []), false);
    assert.equal(hasOwnWork([{ id: 'a', shared: {} }], [{ projectId: 'a' }]), false);
    assert.equal(hasOwnWork([{ id: 'a', shared: {} }, { id: 'b' }], []), true);
    assert.equal(hasOwnWork([{ id: 'a', shared: {} }], [{ projectId: null }]), true);
    assert.equal(hasOwnWork([], [{ projectId: 'gone' }]), true);
  }],
  ['今天的汇报：已有就打开，否则照最近一份再写，都没有就新建', () => {
    const today = todayISO();
    const project = mergeCrewProject(null, parseCrew(crewLink(PROJECT, SETTINGS, ORIGIN)));
    // 都没有 → 新建
    const a = todayReport(dailyReport, project, [], {});
    assert.equal(a.created, true);
    assert.equal(a.report.projectId, 'p_tuai');
    assert.equal(a.report.values.date, today);
    // 昨天有一份 → 照着写：今日内容清空、照片清空、明天计划保留
    const y = {
      ...a.report,
      id: 'r_y',
      values: { ...a.report.values, date: addDays(today, -1), todayWork: '鞋柜完成', progressPhotos: ['m1'], nextPlan: '主卧衣柜' },
      updatedAt: 1,
    };
    const future = { ...y, id: 'r_f', values: { ...y.values, date: addDays(today, 3) } };
    const other = { ...y, id: 'r_o', projectId: 'p_other' };
    const b = todayReport(dailyReport, project, [y, future, other], {});
    assert.equal(b.created, true);
    assert.notEqual(b.report.id, 'r_y');
    assert.equal(b.report.values.date, today);
    assert.equal(b.report.values.todayWork, '');
    assert.deepEqual(b.report.values.progressPhotos, []);
    // 今天已有 → 直接打开（多份时取最近改过的）
    const t1 = { ...y, id: 'r_t1', values: { ...y.values, date: today }, updatedAt: 5 };
    const t2 = { ...y, id: 'r_t2', values: { ...y.values, date: today }, updatedAt: 9 };
    const c = todayReport(dailyReport, project, [y, t1, t2], {});
    assert.equal(c.created, false);
    assert.equal(c.report.id, 'r_t2');
  }],
  ['预计工期：这台手机没有之前的汇报时，按开工日期推算第几天', () => {
    const P = { id: 'p', plannedDays: 5, startDate: '2026-10-06' };
    const ctx = (date, previous = [], project = P) => ({ project, previous, report: { id: 'r', values: { date } }, today: date });
    assert.equal(autoDuration(ctx('2026-10-08')), '剩余 3 天（今天第 3 天 / 共 5 天）');
    assert.equal(autoDuration(ctx('2026-10-06')), '预计 5 天（今天第 1 天）');
    assert.equal(autoDuration(ctx('2026-10-01')), '预计 5 天（今天第 1 天）', '开工之前');
    assert.equal(autoDuration(ctx('2026-10-08', [], { ...P, startDate: '' })), '预计 5 天（今天第 1 天）');
    // 之前那份没写第几天（旧报告）：汇报计数 + 开工到第一份之间的天数
    const old = [{ id: 'a', templateId: 'daily-report', projectId: 'p', values: { date: '2026-10-07', todayWork: '柜体' } }];
    assert.equal(autoDuration(ctx('2026-10-09', old)), '剩余 3 天（今天第 3 天 / 共 5 天）');
    // 只点开没填的草稿、开工前的汇报都不算
    const drafts = [
      { id: 'd1', templateId: 'daily-report', projectId: 'p', values: { date: '2026-10-07' } },
      { id: 'd2', templateId: 'daily-report', projectId: 'p', values: { date: '2026-10-05', todayWork: '量尺' } },
    ];
    assert.equal(autoDuration(ctx('2026-10-08', drafts)), '剩余 3 天（今天第 3 天 / 共 5 天）');
    // 主管把链接提前一天发来，师傅当晚点开看看（空草稿）→ 开工当天仍是第 1 天
    const eve = [{ id: 'e', templateId: 'daily-report', projectId: 'p', values: { date: '2026-10-05', duration: '预计 5 天（今天第 1 天）' } }];
    assert.equal(autoDuration(ctx('2026-10-06', eve)), '预计 5 天（今天第 1 天）');
  }],
  ['预计工期：师傅中途接手，之后每天接着往下数（不会倒退回第 2 天）', () => {
    // 开工 10-05，主管在自己手机上发了 4 天；师傅 10-09 用新手机第一次点链接
    const P = { id: 'p', plannedDays: 10, startDate: '2026-10-05' };
    const device = [];
    const day = (date, extra = {}) => {
      const duration = autoDuration({ project: P, previous: device, report: { id: `r_${date}`, values: { date } }, today: date });
      device.push({ id: `r_${date}`, templateId: 'daily-report', projectId: 'p', values: { date, duration, todayWork: '安装', ...extra } });
      return duration;
    };
    assert.equal(day('2026-10-09'), '剩余 6 天（今天第 5 天 / 共 10 天）');
    assert.equal(day('2026-10-10'), '剩余 5 天（今天第 6 天 / 共 10 天）');
    assert.equal(day('2026-10-12'), '剩余 4 天（今天第 7 天 / 共 10 天）', '周日没开工，跳过的日子不算');
    // 师傅手改了天数 → 第二天照改过的数
    device[device.length - 1].values.duration = '剩余 3 天（今天第 8 天 / 共 10 天）';
    assert.equal(day('2026-10-13'), '剩余 2 天（今天第 9 天 / 共 10 天）');
  }],
];
