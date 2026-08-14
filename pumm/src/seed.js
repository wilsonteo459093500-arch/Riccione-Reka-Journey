// =====================================================================
// 首次启动的数据
//
// bootstrapMembers() —— 空桌开局：只有桌长、记录员、理事会三个账号。
//                       真会员由桌长自己一个个加，行业查重才有意义。
// demoDataset()      —— 「载入示范数据」按钮用：一桌 10 人 + 两场会 +
//                       案例 + 承诺，让人五秒钟看懂这系统在干嘛。
// =====================================================================

import { TABLE, DEFAULT_PIN } from './constants.js';
import { uid, todayISO, addDays, dueDateFor } from './utils.js';

const base = (over) => ({
  id: uid('mbr'),
  tableId: TABLE.id,
  name: '', company: '', industry: '',
  role: 'member',
  joinedAt: todayISO(),
  feeStatus: 'unpaid',
  feeAmount: 0,
  feeDueDate: '',
  renewalStatus: 'pending',
  ndaSigned: false,
  status: 'active',
  phone: '',
  pin: DEFAULT_PIN,
  notes: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

export function bootstrapMembers() {
  return [
    base({ id: 'mbr_chair', name: '桌长', company: '（请改成你的公司）', industry: '（请填行业）',
           role: 'chair', feeStatus: 'paid', ndaSigned: true }),
    base({ id: 'mbr_recorder', name: '记录员', company: '—', industry: '（请填行业）',
           role: 'recorder', feeStatus: 'paid', ndaSigned: true }),
    base({ id: 'mbr_director', name: 'Star Director', company: '理事会', industry: '',
           role: 'director' }),
  ];
}

// ---------------------------------------------------------------------
// 示范数据
// ---------------------------------------------------------------------
const DEMO_PEOPLE = [
  ['陈志明', '明达家私', '家具/全屋定制'],
  ['林淑芬', '芬记饮食集团', '餐饮'],
  ['黄国强', '强联物流', '物流'],
  ['李美玲', '美玲会计事务所', '会计/税务'],
  ['吴伟豪', '豪盛建材', '建材'],
  ['郑丽华', '丽华美容连锁', '美容/健康'],
  ['张家豪', '家豪汽车服务', '汽车服务'],
  ['刘秀珍', '珍珠幼教中心', '教育培训'],
  ['杨志伟', '伟业包装印刷', '包装印刷'],
  ['何淑仪', '淑仪电商', '电商'],
];

export function demoDataset() {
  const today = todayISO();
  const lastMonth = addDays(today, -30);
  const twoMonthsAgo = addDays(today, -60);

  const members = DEMO_PEOPLE.map(([name, company, industry], i) =>
    base({
      id: `mbr_demo_${i + 1}`,
      name, company, industry,
      role: i === 0 ? 'chair' : i === 1 ? 'recorder' : 'member',
      joinedAt: addDays(today, -200),
      feeStatus: i === 9 ? 'unpaid' : 'paid',
      feeAmount: i === 9 ? 0 : 12000,
      feeDueDate: addDays(today, i === 8 ? 20 : 165),
      renewalStatus: 'pending',
      ndaSigned: i !== 9,
      pin: DEFAULT_PIN,
    })
  );
  // 再放一个理事会账号，方便体验「只看数字」的视角
  members.push(base({ id: 'mbr_demo_dir', name: '理事会代表', company: '理事会', industry: '', role: 'director' }));

  const seated = members.filter(m => m.role !== 'director' && m.feeStatus === 'paid' && m.ndaSigned);
  const mark = (statusFor) => Object.fromEntries(seated.map((m, i) => [m.id, statusFor(i)]));

  const s1 = {
    id: 'ses_demo_1', tableId: TABLE.id, date: twoMonthsAgo,
    presenterIds: ['mbr_demo_1'], status: 'closed',
    attendance: mark(i => (i === 7 ? 'absent' : i === 6 ? 'excused' : 'present')),
    takeaways: [], notes: '', closedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const s2 = {
    id: 'ses_demo_2', tableId: TABLE.id, date: lastMonth,
    presenterIds: ['mbr_demo_2', 'mbr_demo_3'], status: 'closed',
    attendance: mark(i => (i === 7 ? 'absent' : 'present')),
    takeaways: [], notes: '', closedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const s3 = {
    id: 'ses_demo_3', tableId: TABLE.id, date: addDays(today, 6),
    presenterIds: ['mbr_demo_4', 'mbr_demo_5'], status: 'scheduled',
    attendance: {}, takeaways: [], notes: '',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };

  const advisorsFor = (exceptId) => seated.filter(m => m.id !== exceptId).slice(0, 6);

  const c1 = {
    id: 'case_demo_1', tableId: TABLE.id, sessionId: s1.id, presenterId: 'mbr_demo_1',
    problemStatement: '两个老师傅带不动新人，出货一慢客户就跑，我不敢接大单。',
    questions: [
      { id: uid('q'), text: '新人留不住，是薪水问题还是没人教？', askerId: 'mbr_demo_4' },
      { id: uid('q'), text: '老师傅愿不愿意教？教了对他有什么好处？', askerId: 'mbr_demo_2' },
      { id: uid('q'), text: '大单跑掉那次，实际是慢了几天？', askerId: 'mbr_demo_5' },
    ],
    advices: advisorsFor('mbr_demo_1').map((m, i) => ({
      id: uid('adv'),
      advisorId: m.id,
      text: [
        '把老师傅的工序拍成视频，先解决「教」这件事，不要靠口传。',
        '给老师傅带徒津贴，徒弟出师才发，绑他的利益。',
        '先拆一个最简单的工序给新人做熟，别一上来就全流程。',
        '接大单前先做一次产能试算，慢几天要提前跟客户讲。',
        '我这行也是这样，最后是把工序拆成三级，人才留得住。',
        '找一个愿意管人的老二，你自己不要下场带人。',
      ][i] || '一人一条。',
    })),
    commitmentText: '这个月把主力工序拍成 5 支教学视频，交给新人先学。',
    commitmentDue: dueDateFor(twoMonthsAgo),
    archivedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };

  const c2 = {
    id: 'case_demo_2', tableId: TABLE.id, sessionId: s2.id, presenterId: 'mbr_demo_2',
    problemStatement: '三家分店，只有我在的那家赚钱，另外两家一直亏。',
    questions: [
      { id: uid('q'), text: '两家亏的店，店长是谁请的？', askerId: 'mbr_demo_1' },
      { id: uid('q'), text: '你一个月去那两家几次？', askerId: 'mbr_demo_6' },
    ],
    advices: advisorsFor('mbr_demo_2').slice(0, 5).map((m, i) => ({
      id: uid('adv'),
      advisorId: m.id,
      text: [
        '先看单店损益表，别看总账，你可能在补贴亏的那两家。',
        '店长没有分红就不会当自己的店，先改分配。',
        '把你那家的做法写成一页 SOP，不写下来就复制不了。',
        '关掉最差那家，止血比救活便宜。',
        '每周固定一天巡店，固定问同样五个问题。',
      ][i] || '一人一条。',
    })),
    commitmentText: '30 天内做出三家店各自的单店损益表，下场带来。',
    commitmentDue: dueDateFor(lastMonth),
    archivedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };

  const c3 = {
    id: 'case_demo_3', tableId: TABLE.id, sessionId: s2.id, presenterId: 'mbr_demo_3',
    problemStatement: '油价涨了，报价不敢起，做越多亏越多。',
    questions: [{ id: uid('q'), text: '上次调价是什么时候？', askerId: 'mbr_demo_4' }],
    advices: advisorsFor('mbr_demo_3').slice(0, 4).map((m, i) => ({
      id: uid('adv'),
      advisorId: m.id,
      text: [
        '先算出每一趟的真实成本，你现在是凭感觉报价。',
        '挑三个最小的客户先起价，试市场反应。',
        '合约加油价浮动条款，不要一年一价。',
        '砍掉最远那条线，那条线大概率是亏的。',
      ][i] || '一人一条。',
    })),
    commitmentText: '两周内算出每趟真实成本，然后对三个小客户调价。',
    commitmentDue: dueDateFor(lastMonth),
    archivedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };

  const mkCommitment = (kase, sessionId, memberId, status, note) => ({
    id: uid('cmt'), tableId: TABLE.id, caseId: kase.id, sessionId,
    memberId, content: kase.commitmentText, dueDate: kase.commitmentDue,
    status, reviewNote: note || '',
    reviewedAt: status === 'open' ? null : new Date().toISOString(),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });

  const commitments = [
    mkCommitment(c1, s1.id, 'mbr_demo_1', 'done', '拍了 5 支，新人上手快了两周。'),
    mkCommitment(c2, s2.id, 'mbr_demo_2', 'open', ''),
    mkCommitment(c3, s2.id, 'mbr_demo_3', 'open', ''),
  ];

  return {
    members,
    sessions: [s1, s2, s3],
    cases: [c1, c2, c3],
    commitments,
  };
}

export { base as newMemberTemplate };
