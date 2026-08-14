// =====================================================================
// PUMM ROUNDTABLE — 领域常量
//
// 这个文件是「业务规格」在代码里的落点：桌规、TABLE 五步、角色权限。
// 改规则先改这里，UI 一律读这里，不要在组件里硬写数字。
// =====================================================================

// ---------------------------------------------------------------------
// 单桌配置（第一版只有一桌，写死在这里；数据表仍带 tableId）
// ---------------------------------------------------------------------
export const TABLE = {
  id: 'table_1',
  name: 'PUMM ROUNDTABLE 一桌',
  seatLimit: 10,           // 每桌 10 人
  annualFee: 0,            // 年费金额（RM），桌长可在会员页按人填写实收
  currency: 'RM',
  sessionHours: 3.5,
  commitmentDays: 30,      // 1 诺 · 30 天
};

// ---------------------------------------------------------------------
// 角色与权限 —— 规格第 5 节
//
// 「这一节不是技术偏好，是信任设计。」
// 会员看不到别人的案例内容；理事会只看统计数字。
// 任何渲染案例正文的地方，必须先过 can(role, 'viewCaseContent')。
// ---------------------------------------------------------------------
export const ROLES = {
  chair:    { key: 'chair',    label: '桌长 Chair',        color: '#23303D', note: '全部功能 + 主持模式' },
  recorder: { key: 'recorder', label: '记录员 Recorder',   color: '#B08D4F', note: '建立／编辑案例、归档' },
  member:   { key: 'member',   label: '会员 Member',       color: '#3F7D5C', note: '只看自己的承诺、桌规、日期' },
  director: { key: 'director', label: 'Star Director 理事会', color: '#7C8087', note: '只看统计数字与出席率' },
};

export const ROLE_KEYS = Object.keys(ROLES);

// 能力矩阵。列出的角色 = 有权限。
const CAPABILITIES = {
  manageMembers:    ['chair'],                          // 增删会员、年费、NDA、出局
  manageSchedule:   ['chair'],                          // 全年日期、案主排序
  recordAttendance: ['chair', 'recorder'],
  runSession:       ['chair', 'recorder'],              // 主持模式
  viewCaseContent:  ['chair', 'recorder'],              // ★ 案例正文（保密核心）
  editCase:         ['chair', 'recorder'],
  exportCase:       ['chair', 'recorder'],
  viewAllCommitments: ['chair', 'recorder'],
  reviewCommitment: ['chair', 'recorder'],
  viewStats:        ['chair', 'recorder', 'director'],  // 看板数字（不含案例正文）
  viewMemberList:   ['chair', 'recorder'],
  viewReminders:    ['chair', 'recorder'],
};

export function can(role, capability) {
  const allowed = CAPABILITIES[capability];
  if (!allowed) return false;
  return allowed.includes(role);
}

// 每个角色进来后能看到的页签（顺序即导航顺序）
export const ROLE_TABS = {
  chair:    ['dashboard', 'members', 'schedule', 'run', 'commitments', 'cases', 'reminders', 'rules'],
  recorder: ['dashboard', 'schedule', 'run', 'commitments', 'cases', 'reminders', 'rules'],
  member:   ['me', 'schedule', 'rules'],
  director: ['dashboard', 'rules'],
};

export const TAB_LABELS = {
  dashboard:   '看板',
  members:     '会员与桌',
  schedule:    '排期与出席',
  run:         '会议运行',
  commitments: '承诺追踪',
  cases:       '案例资产',
  reminders:   '提醒',
  rules:       '桌规',
  me:          '我的',
};

// ---------------------------------------------------------------------
// TABLE 五步 —— 每场会的顺序
// ---------------------------------------------------------------------
export const TABLE_STEPS = [
  { key: 'T', name: '上桌', metric: '10 人',    module: '会员与桌' },
  { key: 'A', name: '只问', metric: '30 分钟',  module: '会议运行 — 提问记录' },
  { key: 'B', name: '出策', metric: '一人一条', module: '会议运行 — 建议逐条' },
  { key: 'L', name: '锁诺', metric: '1 诺 · 30 天', module: '承诺追踪' },
  { key: 'E', name: '留证', metric: '1 页',     module: '案例资产' },
];

// ---------------------------------------------------------------------
// 一场会的时间结构（3.5 小时）—— 主持模式按这个顺序跑
// minutes 用于计时器；perPresenter 表示每位案主都要走一遍
// ---------------------------------------------------------------------
export const SESSION_PHASES = [
  { key: 'review',   name: '承诺复盘',   minutes: 30, step: null, perPresenter: false,
    hint: '拉出上一场所有未结承诺，逐个确认完成／未完成。' },
  { key: 'state',    name: '案主陈述',   minutes: 15, step: 'T', perPresenter: true,
    hint: '案主用一句话说清问题，其余人只听。' },
  { key: 'ask',      name: '只提问',     minutes: 30, step: 'A', perPresenter: true,
    hint: '只提问，不许给建议。记下每一问和提问人。' },
  { key: 'advise',   name: '轮流给建议', minutes: 40, step: 'B', perPresenter: true,
    hint: '一人一条，每人必须开口。逐条记下建议人。' },
  { key: 'commit',   name: '锁诺',       minutes: 15, step: 'L', perPresenter: true,
    hint: '案主承诺下月一件行动，30 天到期。' },
  { key: 'takeaway', name: '收尾 takeaway', minutes: 10, step: 'E', perPresenter: false,
    hint: '每人一句带走的话，散会。' },
];

export const PHASE_MAP = Object.fromEntries(SESSION_PHASES.map(p => [p.key, p]));

// ---------------------------------------------------------------------
// 桌规 —— 系统强制执行的部分标了 [系统]
// ---------------------------------------------------------------------
export const TABLE_RULES = [
  { text: '每桌 10 人，行业不得重复。', enforced: '[系统] 新增会员时对同桌行业查重，重复则拒绝。' },
  { text: '每月一次半天，全年日期年初一次排好。', enforced: '[系统] 排期页一次生成全年日期。' },
  { text: '全员签保密协议（NDA）后才算入桌。', enforced: '[系统] 未签 NDA 不计入在桌人数，不能当案主。' },
  { text: '无故缺席累计 2 次 → 自动出局。', enforced: '[系统] 达 2 次预警桌长，由桌长确认出局。' },
  { text: '年费一次收足全年，未到账不得入桌。', enforced: '[系统] 未到账不计入在桌人数，不能当案主。' },
  { text: '给答案的必须是同桌的老板，桌长只控流程、不给答案。', enforced: '[系统] 每条建议都必须挂建议人，桌长的建议单独标示。' },
];

// ---------------------------------------------------------------------
// 会员状态
// ---------------------------------------------------------------------
export const FEE_STATUS = {
  unpaid: { label: '未到账', color: '#9C3D2E' },
  paid:   { label: '已到账', color: '#3F7D5C' },
};

export const MEMBER_STATUS = {
  active:  { label: '在桌',  color: '#3F7D5C' },
  removed: { label: '已出局', color: '#7C8087' },
};

export const ATTENDANCE_STATUS = {
  present: { label: '出席', color: '#3F7D5C', short: '到' },
  excused: { label: '请假', color: '#C0843A', short: '假' },
  absent:  { label: '缺席', color: '#9C3D2E', short: '缺' },
};

export const COMMITMENT_STATUS = {
  open:   { label: '未结', color: '#C0843A' },
  done:   { label: '完成', color: '#3F7D5C' },
  missed: { label: '未完成', color: '#9C3D2E' },
};

export const SESSION_STATUS = {
  scheduled: { label: '已排期', color: '#7C8087' },
  running:   { label: '进行中', color: '#B08D4F' },
  closed:    { label: '已结束', color: '#23303D' },
};

// 行业清单只是输入提示，可自由填写；查重按最终文本比对。
export const INDUSTRY_SUGGESTIONS = [
  '家具/全屋定制', '建材', '房地产', '装修工程', '餐饮', '零售', '电商',
  '物流', '制造业', '包装印刷', '汽车服务', '教育培训', '医疗/诊所',
  '美容/健康', '金融/保险', '会计/税务', '法律', '广告/公关', 'IT/软件',
  '农业/食品加工', '旅游/酒店', '人力资源', '清洁服务', '五金机械',
];

// ---------------------------------------------------------------------
// 看板目标 —— 规格第 7 节。前三个数是试点桌的成败判定。
// ---------------------------------------------------------------------
export const METRIC_TARGETS = {
  attendanceRate: { label: '出席率',     target: 0.8, unit: '%', gate: true,
    formula: 'present / (在桌人数 × 已结束场次)' },
  renewalRate:    { label: '续会率',     target: 0.8, unit: '%', gate: true,
    formula: '续费会员 / 上年度会员' },
  caseCount:      { label: '案例数',     target: 5,   unit: '个', gate: true,
    formula: 'cases 计数（三场累计 ≥ 5）' },
  commitmentRate: { label: '承诺达成率', target: null, unit: '%', gate: false,
    formula: 'done / 总承诺' },
};

export const APP_NAME = 'PUMM ROUNDTABLE';
export const APP_TAGLINE = '老板帮老板';
export const SESSION_KEY = 'pumm-session';
export const DEFAULT_PIN = '1234';
