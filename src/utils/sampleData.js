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
      gates: { V1: true, V2: true, V3: true, V4: true, S1: true, S2: true, S3: true, S4: true, M1: true, M2: true, M3: false },
      assigned: { SD: 'Wilson', SS: 'Ah Keong', WH: 'Wei Han', PU: 'Lim Jie' },
      notes: { S2: '现场墙体不直, L 型柜留 25mm 离墙距' },
      risks: [{ id: 'r1', text: '客户未确认 W6 付款节点', severity: 'medium', stage: 'M', createdAt: daysAgo(3) }],
      attachments: {}, forms: emptyForms(), dailyReports: [], defects: [],
    },
    {
      id: 'p_002', name: 'Mont Kiara · Tan Residence', client: 'Ms. Tan',
      address: 'Mont Kiara, KL', propertyType: '公寓 Condo', area: '120㎡',
      moveIn: daysAhead(20), createdAt: daysAgo(75), updatedAt: daysAgo(1),
      gates: { V1: true, V2: true, V3: true, V4: true, S1: true, S2: true, S3: true, S4: true, M1: true, M2: true, M3: true, O1: true, O2: true, O3: true, O4: true, O5: true, T1: true, T2: true, T3: false, T4: false, T5: false },
      assigned: { SD: 'Wilson', SS: 'Ah Keong', WH: 'Wei Han', PU: 'Lim Jie' },
      notes: {},
      risks: [{ id: 'r2', text: '电梯尺寸限制, 2700mm 装饰线需现场接驳', severity: 'low', stage: 'O', createdAt: daysAgo(5) }],
      attachments: {}, forms: emptyForms(), dailyReports: [], defects: [],
    },
    {
      id: 'p_003', name: 'Setia Alam · 黄宅', client: 'Mr. Wong',
      address: 'Setia Alam, Shah Alam', propertyType: '半独立 Semi-D', area: '220㎡',
      moveIn: daysAhead(7), createdAt: daysAgo(95), updatedAt: daysAgo(0),
      gates: { V1: true, V2: true, V3: true, V4: true, S1: true, S2: true, S3: true, S4: true, M1: true, M2: true, M3: true, O1: true, O2: true, O3: true, O4: true, O5: true, T1: true, T2: true, T3: true, T4: true, T5: true, H1: false, H2: false, H3: false, H4: false, H5: false },
      assigned: { SD: 'Wilson', SS: 'Ah Keong', WH: 'Wei Han', PU: 'Lim Jie' },
      notes: { T5: 'Punch list 5 项已修 3, 剩衣柜柜门下垂 + 厨房硅胶补' },
      risks: [], attachments: {}, forms: emptyForms(),
      dailyReports: [
        {
          id: 'dr_s1', date: daysAgo(5).slice(0, 10),
          progress: '主卧衣柜柜体定位与底座完成, 客厅电视柜柜体上墙, 厨房上柜全部安装完毕',
          issues: '', author: 'Ah Keong',
          eodChecks: { water: true, electric: true, closure: true, cleanup: true },
          eodNote: '明日: 主卧抽屉柜组装 + 客厅柜门安装', photos: [],
          createdAt: daysAgo(5), updatedAt: daysAgo(5),
        },
        {
          id: 'dr_s2', date: daysAgo(4).slice(0, 10),
          progress: '主卧抽屉柜全部完成, 客厅柜门 8 扇全部装上, 厨房下柜安装至 70%',
          issues: '客厅 L 型柜与墙体差 8mm, 现场切割收边条解决', author: 'Ah Keong',
          eodChecks: { water: true, electric: true, closure: true, cleanup: true },
          eodNote: '明日: 厨房下柜收尾, 阳台洗衣柜组装', photos: [],
          createdAt: daysAgo(4), updatedAt: daysAgo(4),
        },
        {
          id: 'dr_s3', date: daysAgo(3).slice(0, 10),
          progress: '全屋柜体安装基本完成, 五金件 (拉手/铰链/滑轨) 调试, LED 灯全部点亮测试',
          issues: '衣柜 1 扇柜门下垂需返工, 厨房 1 处硅胶补', author: 'Ah Keong',
          eodChecks: { water: true, electric: true, closure: true, cleanup: false },
          eodNote: '现场有少量残料, 明日上午一并清理后做最终安装质量检查', photos: [],
          createdAt: daysAgo(3), updatedAt: daysAgo(3),
        },
      ],
      defects: [
        {
          id: 'def_001',
          item: '主卧衣柜门板 #3 (左侧)',
          itemEn: 'Master wardrobe door panel #3 (left)',
          description: '表面划痕约 15mm, 客户拒收 — 需补货',
          descriptionEn: 'Surface scratch ~15mm, rejected by client — needs replacement',
          severity: 'medium', status: 'ordered',
          discoveredBy: 'Ah Keong', discoveredAtStage: 'T2',
          reorderRef: 'RO-2024-0623', eta: daysAhead(7),
          resolutionNote: '', photos: [],
          history: [
            { at: daysAgo(2), by: 'Ah Keong', from: null, to: 'open', note: '现场发现, 已拍照存档' },
            { at: daysAgo(1), by: 'Lim Jie', from: 'open', to: 'ordered', note: '补货单 RO-2024-0623 已提交工厂, 预计 7 天到货' },
          ],
          createdAt: daysAgo(2), updatedAt: daysAgo(1),
        },
        {
          id: 'def_002',
          item: '厨房上柜铰链 (1 个)',
          itemEn: 'Kitchen upper cabinet hinge (1 piece)',
          description: '铰链阻尼失效, 关门有撞击声 — 现场更换',
          descriptionEn: 'Hinge damper failed, slamming on close — replaced on site',
          severity: 'low', status: 'closed',
          discoveredBy: 'Ah Keong', discoveredAtStage: 'T3',
          reorderRef: '', eta: '',
          resolutionNote: '从备件箱取 1 个替换, 现场 5 分钟搞定', photos: [],
          history: [
            { at: daysAgo(2), by: 'Ah Keong', from: null, to: 'open', note: '安装质量检查时发现' },
            { at: daysAgo(2), by: 'Ah Keong', from: 'open', to: 'closed', note: '现场更换完毕, 客户已确认' },
          ],
          createdAt: daysAgo(2), updatedAt: daysAgo(2),
        },
      ],
      afterSales: [
        {
          id: 'as_001',
          category: 'adjustment',
          issue: '客厅吊柜底部 LED 灯条偶尔闪烁, 客户要求上门调试',
          status: 'open',
          driveLink: '',
          resolutionNote: '',
          photos: [],
          createdBy: 'Wilson',
          createdAt: daysAgo(1),
          updatedAt: daysAgo(1),
        },
      ],
    },
    {
      id: 'p_004', name: 'KLCC · Chen Suite', client: 'Mrs. Chen',
      address: 'KLCC, KL', propertyType: '公寓 Condo', area: '95㎡',
      moveIn: daysAhead(75), createdAt: daysAgo(10), updatedAt: daysAgo(1),
      gates: { V1: true, V2: false },
      assigned: { SD: 'Wilson', SS: 'Ah Keong', WH: 'Wei Han', PU: 'Lim Jie' },
      notes: {}, risks: [], attachments: {}, forms: emptyForms(), dailyReports: [], defects: [],
    },
  ];
};
