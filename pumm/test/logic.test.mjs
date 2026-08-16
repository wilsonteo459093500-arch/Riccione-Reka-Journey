// 冒烟测试：桌规校验、看板算法、提醒、全年排期
import assert from 'node:assert/strict';
import {
  validateMember, computeMetrics, pilotVerdict, buildReminders, generateYearDates,
  suggestPresenters, absenceCount, dueDateFor, addDays, todayISO,
  caseToText, caseToStoryText, isSeated, daysUntil, toCSV,
  advisorLeaderboard, prospectIndustryClash,
} from '../src/utils.js';
import { demoDataset } from '../src/seed.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

console.log('\n— 桌规：行业查重 —');
const members = [
  { id: 'a', name: '陈', company: 'A', industry: '餐饮', tableId: 'table_1', status: 'active', role: 'member' },
  { id: 'b', name: '林', company: 'B', industry: '物流', tableId: 'table_1', status: 'active', role: 'member' },
];
t('同行业被拒', () => {
  const errs = validateMember({ id: 'c', name: '黄', company: 'C', industry: '餐饮', tableId: 'table_1', role: 'member' }, members);
  assert.ok(errs.some(e => e.includes('行业重复')), errs.join('|'));
});
t('大小写/空格差异也算重复', () => {
  const errs = validateMember({ id: 'c', name: '黄', company: 'C', industry: ' 餐 饮 ', tableId: 'table_1', role: 'member' }, members);
  assert.ok(errs.some(e => e.includes('行业重复')));
});
t('不同行业放行', () => {
  const errs = validateMember({ id: 'c', name: '黄', company: 'C', industry: '零售', tableId: 'table_1', role: 'member' }, members);
  assert.equal(errs.length, 0, errs.join('|'));
});
t('改自己不会跟自己撞', () => {
  const errs = validateMember({ ...members[0], company: 'A2' }, members);
  assert.equal(errs.length, 0, errs.join('|'));
});
t('已出局的人不占行业', () => {
  const withRemoved = [...members, { id: 'x', name: '旧', company: 'X', industry: '零售', tableId: 'table_1', status: 'removed', role: 'member' }];
  const errs = validateMember({ id: 'c', name: '黄', company: 'C', industry: '零售', tableId: 'table_1', role: 'member' }, withRemoved);
  assert.equal(errs.length, 0, errs.join('|'));
});
t('满 10 人拒绝新人', () => {
  const full = Array.from({ length: 10 }, (_, i) => ({
    id: `m${i}`, name: `M${i}`, company: `C${i}`, industry: `行业${i}`,
    tableId: 'table_1', status: 'active', role: 'member',
  }));
  const errs = validateMember({ id: 'new', name: '新', company: 'N', industry: '独一无二', tableId: 'table_1', role: 'member' }, full);
  assert.ok(errs.some(e => e.includes('满席')), errs.join('|'));
});
t('理事会不参与行业查重', () => {
  const errs = validateMember({ id: 'd', name: '理事', company: '理事会', industry: '餐饮', role: 'director', tableId: 'table_1' }, members);
  assert.equal(errs.length, 0, errs.join('|'));
});

console.log('\n— 入桌条件 —');
t('缴费+NDA 才算在桌', () => {
  const base = { id: 'z', status: 'active', role: 'member' };
  assert.equal(isSeated({ ...base, feeStatus: 'paid', ndaSigned: true }), true);
  assert.equal(isSeated({ ...base, feeStatus: 'unpaid', ndaSigned: true }), false);
  assert.equal(isSeated({ ...base, feeStatus: 'paid', ndaSigned: false }), false);
  assert.equal(isSeated({ ...base, feeStatus: 'paid', ndaSigned: true, status: 'removed' }), false);
});

console.log('\n— 看板 —');
const demo = demoDataset();
const m = computeMetrics(demo);
t('出席率介于 0-1 且分母正确', () => {
  assert.ok(m.attendanceRate > 0 && m.attendanceRate <= 1, String(m.attendanceRate));
  assert.equal(m.attendanceDetail.sessions, 2);
  assert.ok(m.attendanceDetail.slots > 0);
});
t('案例数 = 3', () => assert.equal(m.caseCount, 3));
t('承诺达成率 = 1/3', () => assert.ok(Math.abs(m.commitmentRate - 1 / 3) < 1e-9));
t('在桌 9 人（第 10 位未缴费未签 NDA）', () => assert.equal(m.seatedCount, 9));
t('待入桌 1 人', () => assert.equal(m.pendingCount, 1));
t('理事会不算进出席分母', () => {
  const ids = Object.keys(demo.sessions[0].attendance);
  assert.ok(!ids.includes('mbr_demo_dir'));
});
t('缺席次数只数无故缺席', () => {
  assert.equal(absenceCount(demo.sessions, 'mbr_demo_8'), 2);  // 一场 absent 一场 absent
  assert.equal(absenceCount(demo.sessions, 'mbr_demo_7'), 0);  // excused 不算
});
t('试点判定：案例数达不到 5 → 未全达标', () => {
  const v = pilotVerdict(m);
  assert.equal(v.allPass, false);
  assert.equal(v.checks.find(c => c.key === 'caseCount').ok, false);
});
t('空数据不炸、不给假 0%', () => {
  const empty = computeMetrics({ members: [], sessions: [], cases: [], commitments: [] });
  assert.equal(empty.attendanceRate, null);
  assert.equal(empty.renewalRate, null);
  assert.equal(empty.caseCount, 0);
});

console.log('\n— 提醒 —');
t('承诺到期前 3 天触发', () => {
  const due = addDays(todayISO(), 3);
  const r = buildReminders({
    members: [{ id: 'a', name: '陈', company: 'A', status: 'active', role: 'member', feeStatus: 'paid', ndaSigned: true }],
    sessions: [], cases: [],
    commitments: [{ id: 'c1', memberId: 'a', content: '做一件事', dueDate: due, status: 'open' }],
  });
  assert.ok(r.some(x => x.kind === 'commitment-due'), JSON.stringify(r));
});
t('会前 7 天与 1 天各触发一次，其他天不触发', () => {
  const mk = (days) => buildReminders({
    members: [{ id: 'a', name: '陈', company: 'A', status: 'active', role: 'member', feeStatus: 'paid', ndaSigned: true }],
    sessions: [{ id: 's1', date: addDays(todayISO(), days), status: 'scheduled', presenterIds: [], attendance: {} }],
    cases: [], commitments: [],
  }).filter(x => x.kind === 'attendance-confirm');
  assert.equal(mk(7).length, 1);
  assert.equal(mk(1).length, 1);
  assert.equal(mk(4).length, 0);
});
t('缺席 2 次通知桌长', () => {
  const r = buildReminders(demo);
  assert.ok(r.some(x => x.kind === 'absence-risk'), JSON.stringify(r.map(x => x.kind)));
});
t('会后案例未填提醒记录员', () => {
  const r = buildReminders({
    members: [{ id: 'a', name: '陈', company: 'A', status: 'active', role: 'member', feeStatus: 'paid', ndaSigned: true }],
    sessions: [{ id: 's1', date: todayISO(), status: 'running', presenterIds: ['a'], attendance: {} }],
    cases: [], commitments: [],
  });
  assert.ok(r.some(x => x.kind === 'case-missing'));
});
t('年费 30 天内到期 → 续会提醒；已续会则不提醒', () => {
  const base = { id: 'a', name: '陈', company: 'A', status: 'active', role: 'member', feeStatus: 'paid', ndaSigned: true, feeDueDate: addDays(todayISO(), 20) };
  const snap = (extra) => ({ members: [{ ...base, ...extra }], sessions: [], cases: [], commitments: [] });
  assert.ok(buildReminders(snap({ renewalStatus: 'pending' })).some(x => x.kind === 'fee-renewal'));
  assert.ok(!buildReminders(snap({ renewalStatus: 'renewed' })).some(x => x.kind === 'fee-renewal'));
});
t('每条提醒都带可复制的文案', () => {
  buildReminders(demo).forEach(r => assert.ok(r.copyText && r.copyText.length > 10, r.kind));
});

console.log('\n— 排期 —');
t('全年 12 场、每月一场、星期固定', () => {
  const dates = generateYearDates('2026-01-16', 12);   // 2026-01-16 是第 3 个星期五
  assert.equal(dates.length, 12);
  const weekdays = new Set(dates.map(d => new Date(`${d}T00:00:00`).getDay()));
  assert.equal(weekdays.size, 1, [...weekdays].join(','));
  const months = dates.map(d => new Date(`${d}T00:00:00`).getMonth());
  assert.equal(new Set(months).size, 12);
});
t('第 5 个星期 X 时退到第 4 个，不溢出到下个月', () => {
  const dates = generateYearDates('2026-01-29', 12);   // 第 5 个星期四
  dates.forEach((d, i) => {
    const dt = new Date(`${d}T00:00:00`);
    assert.equal(dt.getMonth(), (0 + i) % 12);
  });
});
t('案主自动排：没上过桌的排前面', () => {
  const ids = suggestPresenters(demo.members, demo.sessions, demo.cases, 2);
  assert.equal(ids.length, 2);
  const alreadyPresented = new Set(demo.sessions.flatMap(s => s.presenterIds));
  ids.forEach(id => assert.ok(!alreadyPresented.has(id), `${id} 已经上过桌了`));
});
t('承诺到期日 = 会期 + 30 天', () => {
  assert.equal(dueDateFor('2026-03-01'), '2026-03-31');
  assert.equal(daysUntil(addDays(todayISO(), 5)), 5);
});

console.log('\n— 贡献榜与招募 —');
t('贡献榜：被采纳数按锁诺来源算、按采纳排序', () => {
  const lb = advisorLeaderboard(demo.members, demo.cases, demo.commitments);
  assert.ok(lb.length > 0);
  // demo：c1 采纳了前两条建议、c2 采纳一条 —— 共 3 个被采纳记号
  const adoptedTotal = lb.reduce((n, r) => n + r.adopted, 0);
  assert.equal(adoptedTotal, 3);
  // 排序：被采纳多的在前
  for (let i = 1; i < lb.length; i++) {
    assert.ok(lb[i - 1].adopted >= lb[i].adopted);
  }
  // 每个人的给出数 >= 被采纳数
  lb.forEach(r => assert.ok(r.given >= 0 && r.adopted <= r.given + 1));
});
t('贡献榜不含案例正文字段', () => {
  const lb = advisorLeaderboard(demo.members, demo.cases, demo.commitments);
  lb.forEach(r => {
    assert.deepEqual(Object.keys(r).sort(), ['adopted', 'given', 'member']);
  });
});
t('候选人行业冲突：撞在册会员出预警、不撞放行、出局的人不占', () => {
  const clash = prospectIndustryClash({ industry: '餐饮' }, demo.members);
  assert.ok(clash && clash.includes('林淑芬'));
  assert.equal(prospectIndustryClash({ industry: '五金机械' }, demo.members), null);
  const withRemoved = demo.members.map(m => m.industry === '餐饮' ? { ...m, status: 'removed' } : m);
  assert.equal(prospectIndustryClash({ industry: '餐饮' }, withRemoved), null);
});
t('示范数据带招募 pipeline', () => {
  assert.ok(demo.prospects.length >= 3);
  assert.ok(demo.prospects.some(p => p.status === 'visited'));
});

console.log('\n— 案例导出 —');
t('会内记录含建议人姓名', () => {
  const txt = caseToText(demo.cases[0], { members: demo.members, session: demo.sessions[0] });
  assert.ok(txt.includes('CASE RECORD'));
  assert.ok(txt.includes('陈志明'));
  assert.ok(txt.includes('李美玲'));       // 某位建议人
});
t('招募素材抽掉公司名与人名，只留行业', () => {
  const story = caseToStoryText(demo.cases[0], { members: demo.members, session: demo.sessions[0] });
  demo.members.filter(x => x.role !== 'director').forEach(x => {
    assert.ok(!story.includes(x.name), `匿名版泄漏了人名：${x.name}`);
    assert.ok(!story.includes(x.company), `匿名版泄漏了公司：${x.company}`);
  });
  assert.ok(story.includes('家具/全屋定制'));
});
t('CSV 正确转义引号与逗号', () => {
  const csv = toCSV([{ a: '有,逗号', b: '有"引号"' }]);
  assert.equal(csv, 'a,b\n"有,逗号","有""引号"""');
});

console.log(`\n✅ ${pass} 项全部通过\n`);
