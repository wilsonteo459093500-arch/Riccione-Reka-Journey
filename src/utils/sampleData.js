const emptyForms = () => ({
  SPACE_SURVEY: { answers: {} },
  MEASUREMENT: { answers: {} },
  SITE_CHECK: { answers: {} },
  INSTALL_QC: { answers: {} },
  HANDOVER: { answers: {} },
});

export const sampleProjects = () => {
  const today = new Date();
  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };
  const daysAhead = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  return [
    {
      id: 'p_001', name: 'Bukit Jelutong · 林宅', client: 'Mr. Lim',
      address: 'Bukit Jelutong, Shah Alam', propertyType: '别墅 Villa', area: '180㎡',
      moveIn: daysAhead(45), createdAt: daysAgo(30), updatedAt: daysAgo(2),
      gates: { A1: true, A2: true, A3: true, A4: true, B1: true, B2: true, B3: true, B4: true, C1: true, C2: true, C3: false },
      assigned: { SD: 'Wilson', SS: 'Ah Keong', WH: 'Wei Han', PU: 'Lim Jie' },
      notes: { B2: '现场墙体不直, L 型柜留 25mm 离墙距' },
      risks: [{ id: 'r1', text: '客户未确认 W6 付款节点', severity: 'medium', stage: 'C', createdAt: daysAgo(3) }],
      attachments: {}, forms: emptyForms(), dailyReports: [],
    },
    {
      id: 'p_002', name: 'Mont Kiara · Tan Residence', client: 'Ms. Tan',
      address: 'Mont Kiara, KL', propertyType: '公寓 Condo', area: '120㎡',
      moveIn: daysAhead(20), createdAt: daysAgo(75), updatedAt: daysAgo(1),
      gates: { A1: true, A2: true, A3: true, A4: true, B1: true, B2: true, B3: true, B4: true, C1: true, C2: true, C3: true, D1: true, D2: true, D3: true, D4: true, D5: false, D6: false },
      assigned: { SD: 'Wilson', SS: 'Ah Keong', WH: 'Wei Han', PU: 'Lim Jie' },
      notes: {},
      risks: [{ id: 'r2', text: '电梯尺寸限制, 2700mm 装饰线需现场接驳', severity: 'low', stage: 'D', createdAt: daysAgo(5) }],
      attachments: {}, forms: emptyForms(), dailyReports: [],
    },
    {
      id: 'p_003', name: 'Setia Alam · 黄宅', client: 'Mr. Wong',
      address: 'Setia Alam, Shah Alam', propertyType: '半独立 Semi-D', area: '220㎡',
      moveIn: daysAhead(7), createdAt: daysAgo(95), updatedAt: daysAgo(0),
      gates: { A1: true, A2: true, A3: true, A4: true, B1: true, B2: true, B3: true, B4: true, C1: true, C2: true, C3: true, D1: true, D2: true, D3: true, D4: true, D5: true, D6: true, E1: false, E2: false, E3: false, E4: false, E5: false },
      assigned: { SD: 'Wilson', SS: 'Ah Keong', WH: 'Wei Han', PU: 'Lim Jie' },
      notes: { D6: 'Punch list 5 项已修 3, 剩衣柜柜门下垂 + 厨房硅胶补' },
      risks: [], attachments: {}, forms: emptyForms(),
      dailyReports: [
        {
          id: 'dr_s1', date: daysAgo(5).slice(0, 10),
          progress: '主卧衣柜柜体定位与底座完成, 客厅电视柜柜体上墙, 厨房上柜全部安装完毕',
          issues: '', author: 'Ah Keong',
          eodChecks: { water: true, electric: true, closure: true, cleanup: true },
          eodNote: '明日: 主卧抽屉柜组装 + 客厅柜门安装',
          photos: [],
          createdAt: daysAgo(5), updatedAt: daysAgo(5),
        },
        {
          id: 'dr_s2', date: daysAgo(4).slice(0, 10),
          progress: '主卧抽屉柜全部完成, 客厅柜门 8 扇全部装上, 厨房下柜安装至 70%',
          issues: '客厅 L 型柜与墙体差 8mm, 现场切割收边条解决',
          author: 'Ah Keong',
          eodChecks: { water: true, electric: true, closure: true, cleanup: true },
          eodNote: '明日: 厨房下柜收尾, 阳台洗衣柜组装',
          photos: [],
          createdAt: daysAgo(4), updatedAt: daysAgo(4),
        },
        {
          id: 'dr_s3', date: daysAgo(3).slice(0, 10),
          progress: '全屋柜体安装基本完成, 五金件 (拉手/铰链/滑轨) 调试, LED 灯全部点亮测试',
          issues: '衣柜 1 扇柜门下垂需返工, 厨房 1 处硅胶补',
          author: 'Ah Keong',
          eodChecks: { water: true, electric: true, closure: true, cleanup: false },
          eodNote: '现场有少量残料, 明日上午一并清理后做最终安装质量检查',
          photos: [],
          createdAt: daysAgo(3), updatedAt: daysAgo(3),
        },
      ],
    },
    {
      id: 'p_004', name: 'KLCC · Chen Suite', client: 'Mrs. Chen',
      address: 'KLCC, KL', propertyType: '公寓 Condo', area: '95㎡',
      moveIn: daysAhead(75), createdAt: daysAgo(10), updatedAt: daysAgo(1),
      gates: { A1: true, A2: false },
      assigned: { SD: 'Wilson', SS: 'Ah Keong', WH: 'Wei Han', PU: 'Lim Jie' },
      notes: {}, risks: [], attachments: {}, forms: emptyForms(), dailyReports: [],
    },
  ];
};
