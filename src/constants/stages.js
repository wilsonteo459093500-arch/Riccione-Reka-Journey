// ============================================================
// THE SAIL METHOD — owners + 6 chapters (V-SMOOTH)
// ============================================================
export const OWNERS = {
  SD: { label: 'SD', full: '销售设计 Sales Designer', color: '#8B6F4E' },
  SS: { label: 'SS', full: '现场主管 Site Supervisor', color: '#5C7A4A' },
  WH: { label: 'WH', full: '仓储 Warehouse', color: '#A8896B' },
  PU: { label: '采购', full: '采购 Purchasing', color: '#6B5D4F' },
};

export const STAGES = [
  {
    code: 'V',
    name: 'VISION',
    nameCN: '洞察',
    framework: 'BOND',
    label: '客户洞察 + 建立信任',
    en: 'Discovery & Trust',
    tagline: 'Listen first. Understand the home before designing.',
    taglineCN: '先聆听 — 在动笔之前，理解整个家。',
    owner: 'SD',
    days: '销售前 / Pre-deposit',
    linkedForms: [{ formCode: 'SPACE_SURVEY', gate: 'V3' }],
    gates: [
      { id: 'V1', short: 'BOND-1 Begin', label: '首次接触 + 客户档案建档', en: 'First contact + customer profile' },
      { id: 'V2', short: 'BOND-2 Observe', label: '展厅接待 + 现场感知', en: 'Showroom + initial site visit' },
      { id: 'V3', short: 'BOND-3 Need', label: '客户空间问卷 (28项) 完成', en: 'Space Survey completed (28 items)' },
      { id: 'V4', short: 'BOND-4 Deposit', label: '定金到账 + 双方签字', en: 'Deposit received + sign-off' },
    ],
  },
  {
    code: 'S',
    name: 'START',
    nameCN: '启动',
    framework: '4S',
    label: '项目启动 + 精准复尺',
    en: 'Kickoff & Re-measurement',
    tagline: 'Start clean. Every millimeter measured.',
    taglineCN: '干净启动 — 每一毫米都丈量过。',
    owner: 'SD',
    days: '1-2 周 / 1-2 weeks',
    linkedForms: [{ formCode: 'MEASUREMENT', gate: 'S2' }],
    gates: [
      { id: 'S1', short: '4S-1 Start', label: '项目启动: 项目编号 + 团队群组 + 文件夹', en: 'Kickoff: Project ID + team group + folder' },
      { id: 'S2', short: '4S-2 Survey', label: '现场量尺核查表 (20项) 完成', en: 'Site Measurement form (20 items) done' },
      { id: 'S3', short: '4S-3 Sign', label: '图纸客户签核 (未签不下采购单)', en: 'Drawing sign-off by client (no PO until signed)' },
      { id: 'S4', short: '4S-4 Source', label: '采购单 PO 下达 + 锁定交期', en: 'Purchase Order placed + timeline locked' },
    ],
  },
  {
    code: 'M',
    name: 'MAKE',
    nameCN: '匠造',
    framework: '3M',
    label: '生产监控 + 客户透明',
    en: 'Production with Transparency',
    tagline: 'Crafted, not assembled. Quality monitored weekly.',
    taglineCN: '匠造 — 不是装配。每周质量复检。',
    owner: 'PU',
    days: '4-8 周 / 4-8 weeks',
    linkedForms: [],
    gates: [
      { id: 'M1', short: '3M-Site', label: 'Monitor Site · 工地状态每周更新', en: 'Site weekly update' },
      { id: 'M2', short: '3M-Product', label: 'Monitor Product · 生产节点 + 交期', en: 'Production schedule + delivery date' },
      { id: 'M3', short: '3M-Customer', label: 'Monitor Customer · 客户下一步告知', en: 'Customer next-step communications' },
    ],
  },
  {
    code: 'O',
    name: 'ONSITE',
    nameCN: '就位',
    framework: '5O',
    label: '到货核查 + 现场就绪',
    en: 'Arrival & Site Readiness',
    tagline: 'Goods arrive complete. Site is ready before install begins.',
    taglineCN: '货到齐 — 场就绪。安装开始之前万无一失。',
    owner: 'SS',
    days: '3-7 天 / 3-7 days',
    linkedForms: [{ formCode: 'SITE_CHECK', gate: 'O2' }],
    gates: [
      { id: 'O1', short: '5O-Product', label: '产品点货 + 开箱核查 + 分单标签', en: 'Product inspection + unboxing + tagging' },
      { id: 'O2', short: '5O-Onsite', label: '场地检查表 (20项) 完成 · 现场就绪', en: 'Site Check form (20 items) done · Site ready' },
      { id: 'O3', short: '5O-Order', label: '尾款 + 交货单 DO 确认', en: 'Final payment + Delivery Order confirmed' },
      { id: 'O4', short: '5O-Operate', label: '排车 + 安装队排期', en: 'Logistics + crew scheduled' },
      { id: 'O5', short: '5O-Owner', label: '客户告知: 安装日期 + 准备事项', en: 'Customer notified: install date + preparation' },
    ],
  },
  {
    code: 'T',
    name: 'TACKLE',
    nameCN: '安装',
    framework: '5T',
    label: '现场安装 + 每日跟踪',
    en: 'Installation with Daily Tracking',
    tagline: 'Installed with care. Tracked every day. On time, on plan.',
    taglineCN: '精心安装 — 每日跟踪。按时按图，万无一失。',
    owner: 'SS',
    days: '1-2 周 / 1-2 weeks',
    linkedForms: [{ formCode: 'INSTALL_QC', gate: 'T3' }],
    hasDailyReports: true,
    dailyReportsGate: 'T4',
    gates: [
      { id: 'T1', short: '5T-Tagged', label: '分区贴标 + 物料分发到位', en: 'Tagged staging + material distribution' },
      { id: 'T2', short: '5T-Targeted', label: '按图安装核查 (On-design install)', en: 'On-design installation check' },
      { id: 'T3', short: '5T-Test', label: '安装质量检查表 (20项) 完成', en: 'Install QC form (20 items) done' },
      { id: 'T4', short: '5T-Track', label: '每日安装报告 + 4 项安全检查全通过', en: 'Daily Reports + 4 safety checks all pass' },
      { id: 'T5', short: '5T-Tidy', label: 'Punch List 全部关单', en: 'Punch list cleared' },
    ],
  },
  {
    code: 'H',
    name: 'HANDOVER',
    nameCN: '交付',
    framework: '5H',
    label: '验收交付 + 长期关系',
    en: 'Handover & Legacy',
    tagline: 'Sign off only when 100% satisfied. The relationship begins here.',
    taglineCN: '客户百分百满意时, 才是真正的交付。关系从这里开始。',
    owner: 'SS',
    days: '1-2 天 / 1-2 days',
    linkedForms: [{ formCode: 'HANDOVER', gate: 'H1' }],
    gates: [
      { id: 'H1', short: '5H-Handover', label: '最终验收表 (16项) 全部 Pass', en: 'Final Handover form (16 items) all Pass' },
      { id: 'H2', short: '5H-Hold', label: '成品保护到位 (膜/护角)', en: 'Product protection in place' },
      { id: 'H3', short: '5H-Habitable', label: '现场可使用状态 (无残留)', en: 'Site ready for daily use' },
      { id: 'H4', short: '5H-How-to', label: '使用 + 保养讲解 + 操作视频', en: 'Usage + maintenance briefing + video' },
      { id: 'H5', short: '5H-Heart', label: '客户评价 + 转介绍动作', en: 'Customer review + referral action' },
    ],
  },
];

// Client-facing simplified language (for ClientShareView)
export const CLIENT_STAGES = {
  V: { label: 'Vision · 洞察', desc: '我们倾听您的生活方式与收纳需求 / We listen to understand how you live' },
  S: { label: 'Start · 启动', desc: '深化设计与现场精准量尺 / Detailed design + precise on-site measurement' },
  M: { label: 'Make · 匠造', desc: '工厂排程生产与品质把控 / Production scheduling + quality monitoring' },
  O: { label: 'Onsite · 就位', desc: '货物运抵与现场就绪准备 / Goods arrived + site preparation' },
  T: { label: 'Tackle · 安装', desc: '专业团队现场安装 / Professional team installation' },
  H: { label: 'Handover · 交付', desc: '完工验收与长期售后关怀 / Final inspection + long-term after-care' },
};

// Stage code remap from legacy A-E to V-SMOOTH (gates + stage codes).
// Used by storage migrations to upgrade existing data.
export const LEGACY_GATE_REMAP = {
  A1: 'V1', A2: 'V2', A3: 'V3', A4: 'V4',
  S1: 'S1', // already start
  B1: 'S1', B2: 'S2', B3: 'S3', B4: 'S4',
  C1: 'M1', C2: 'M2', C3: 'M3',
  D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4',
  D5: 'T3', D6: 'T5',
  E1: 'H1', E2: 'H2', E3: 'H3', E4: 'H4', E5: 'H5',
};
export const LEGACY_STAGE_REMAP = { A: 'V', B: 'S', C: 'M', D: 'O', E: 'H' };
