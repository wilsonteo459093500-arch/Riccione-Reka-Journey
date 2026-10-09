// 安装质检清单 INSTALLATION QUALITY CHECKLIST
// 来源：Sail-Installation-Quality-Checklist-CN-EN.docx（与 Lark 内部表同步）
import { countResults } from './helpers.js';

const scale = {
  id: 'qc-pfna',
  options: [
    { v: 'P', zh: '合格', en: 'Pass', tone: 'pass' },
    { v: 'F', zh: '不合格', en: 'Fail', tone: 'fail' },
    { v: 'NA', zh: '不适用', en: 'N/A', tone: 'na' },
  ],
};

const I = (no, zhT, enT, zhS, enS, zhM, enM, key = false) => ({
  id: `qc${no}`,
  no: String(no),
  title: { zh: zhT, en: enT },
  desc: { zh: zhS, en: enS },
  method: { zh: zhM, en: enM },
  ...(key ? { key: true } : {}),
});

export default {
  id: 'quality-check',
  version: 1,
  kind: 'checklist',
  stage: 5,
  name: { zh: '安装质检清单', en: 'Installation Quality Checklist' },
  short: 'QC',
  desc: '21 项质检 · SS 每日抽查 3–5 项 × 2–3 个柜体并拍照',
  icon: 'ShieldCheck',
  accent: '#B75A47',
  doc: {
    brand: 'sail',
    kicker: '溪岸 Sail · 每个单位 / 区域填写一份 One form per unit / area',
    title: { zh: '安装质检清单', en: 'INSTALLATION QUALITY CHECKLIST' },
    subtitle: { zh: '质检 21 项 · 重点抽查 Audit', en: '21-Item Inspection & Spot-Check Audit' },
    intro: [
      {
        zh: '安装工人按以下标准施工；SS 每日抽查 3–5 项 × 2–3 个柜体并拍照。吊柜固定、台面接缝、打胶收口（★）为必查项。不合格 → 拍照 → 登记 Punch List → 整改后复查；Punch 编号填入本表备注栏。',
        en: 'Installers must work to the standards below. The Site Supervisor (SS) spot-checks 3–5 items × 2–3 cabinets daily, with photos. Wall-cabinet fixing, countertop joints and sealant finishing (★) are mandatory checks. Fail → photo → log in the Punch List → re-inspect after rectification; write the Punch # in the Remarks column.',
      },
      {
        zh: '以下 21 项为默认标准，与 Lark《Installation Quality Checklist》同步；如有更新，以内部表为准。',
        en: 'The 21 items below are the default standard, synced with the Lark checklist; the internal version prevails if updated.',
      },
    ],
    legend: '★ 必查 Mandatory　·　P 合格 Pass　·　F 不合格 Fail　·　NA 不适用 N/A',
  },
  sections: [
    {
      id: 'info',
      type: 'fields',
      title: { zh: '基本信息', en: 'PROJECT INFO' },
      columns: 3,
      fields: [
        { key: 'project', type: 'text', label: { zh: '项目名称', en: 'Project' }, bind: 'project.siteLabel', required: true },
        { key: 'so', type: 'text', label: { zh: 'SO 编号', en: 'SO No.' }, bind: 'project.so' },
        { key: 'date', type: 'date', label: { zh: '检查日期', en: 'Date' }, bind: 'today', required: true },
        {
          key: 'area',
          type: 'chips',
          label: { zh: '区域（厨房 / 衣柜 / 其他）', en: 'Area (Kitchen / Wardrobe / Other)' },
          options: ['厨房 Kitchen', '衣柜 Wardrobe', '鞋柜 Shoe Cabinet', '电视柜 TV Cabinet', '浴室柜 Vanity'],
          multiple: true,
          allowCustom: true,
          required: true,
        },
        { key: 'installer', type: 'text', label: { zh: '安装师傅', en: 'Installer' } },
        { key: 'inspector', type: 'text', label: { zh: 'SS 检查人', en: 'Inspector (SS)' }, bind: 'settings.name' },
      ],
    },
    {
      id: 'items',
      type: 'checklist',
      title: { zh: '质检 21 项', en: '21-ITEM INSPECTION' },
      scale,
      showStandard: true,
      showMethod: true,
      remark: { label: { zh: '备注 / Punch#', en: 'Remarks / Punch #' }, requiredWhen: ['F'] },
      items: [
        I(1, '柜体水平 / 垂直', 'Cabinet level & plumb', '水平、垂直偏差 ≤ 2mm/m', 'Level / plumb deviation ≤ 2 mm per metre', '水平尺 / 激光测量', 'Spirit level / laser'),
        I(2, '相邻柜体拼缝', 'Joints between cabinets', '拼缝平整，台面高低差 ≤ 1mm', 'Joints flush; height difference ≤ 1 mm', '目测 + 直尺 / 塞尺', 'Visual + straightedge / feeler gauge'),
        I(3, '吊柜固定', 'Wall-cabinet fixing', '固定点足数、吊码受力，手压无晃动', 'Enough fixing points; brackets bearing load; no movement under hand pressure', '手压测试 + 拍固定件特写', 'Hand-press test + close-up photo of fixings', true),
        I(4, '柜体与墙面收口', 'Cabinet-to-wall finishing', '缝隙均匀，收口条 / 打胶处理到位', 'Even gaps; filler strip / sealant neatly finished', '目测', 'Visual'),
        I(5, '门板缝隙', 'Door gaps', '门缝均匀一致（约 2mm），偏差 ≤ 1mm', 'Gaps even & consistent (approx. 2 mm); deviation ≤ 1 mm', '目测 + 卡尺', 'Visual + caliper'),
        I(6, '门板平整', 'Door alignment', '相邻门板高低差 ≤ 1mm，开合无碰擦', 'Adjacent doors within 1 mm; no rubbing on open / close', '目测 + 开合测试', 'Visual + open-close test'),
        I(7, '铰链', 'Hinges', '缓冲正常、开合顺畅、螺丝紧固', 'Soft-close works; smooth action; screws tight', '逐门开合测试', 'Open-close test on every door'),
        I(8, '抽屉 / 滑轨', 'Drawers / runners', '推拉顺畅、阻尼回弹、无异响', 'Smooth glide; soft-close return; no noise', '每柜抽 3 个测试', 'Test 3 drawers per cabinet'),
        I(9, '拉手 / 五金', 'Handles / hardware', '安装牢固、位置高度一致', 'Firmly fixed; consistent position & height', '目测 + 手感', 'Visual + touch'),
        I(10, '封边', 'Edge banding', '无脱胶、崩边、划痕', 'No peeling, chipping or scratches', '目测 + 手摸', 'Visual + touch'),
        I(11, '板面外观', 'Panel surfaces', '无划伤、色差、破损', 'No scratches, colour variation or damage', '强光斜照目测', 'Visual under angled strong light'),
        I(12, '台面接缝', 'Countertop joints', '接缝平顺、无明显落差与胶痕', 'Seams smooth; no visible step or glue marks', '目测 + 手摸', 'Visual + touch', true),
        I(13, '台面开孔', 'Countertop cut-outs', '水槽 / 灶具开孔尺寸正确、边缘打磨', 'Sink / hob cut-outs correct size; edges polished', '对照实物复核', 'Verify against actual units'),
        I(14, '防水打胶', 'Waterproof sealant', '台面靠墙、水槽周边胶线连续防水', 'Continuous seal along wall edge & around sink', '目测', 'Visual'),
        I(15, '打胶收口', 'Sealant finishing', '胶线均匀、无断胶漏胶、颜色正确', 'Bead even; no breaks or gaps; correct colour', '目测', 'Visual', true),
        I(16, '灯带 / 电器', 'Lighting / appliances', '通电测试正常、走线隐蔽', 'Power-on test OK; wiring concealed', '通电测试', 'Power-on test'),
        I(17, '水槽通水', 'Sink water test', '通水测试，下水无渗漏', 'Run water; no leaks at drainage', '通水 3 分钟观察', 'Run water 3 min & observe'),
        I(18, '内部配件', 'Internal accessories', '层板、挂杆、配件安装齐全', 'Shelves, rails & accessories complete', '对照清单', 'Check against list'),
        I(19, '撕掉标签', 'Remove labels', '确保抽屉内和肉眼可见地方没有任何标签', 'No labels inside drawers or anywhere visible', '目测', 'Visual'),
        I(20, '柜内清洁', 'Interior cleaning', '无胶渍、粉尘、包装残留', 'No glue marks, dust or packaging residue', '目测', 'Visual'),
        I(21, '硬装保护', 'Site protection', '周边地板 / 墙面 / 门套无损伤，保护膜完好', 'Floors / walls / door frames undamaged; protective film intact', '目测，损伤即进 Punch', 'Visual; any damage → Punch List'),
      ],
    },
    {
      id: 'signoff',
      type: 'signatures',
      title: { zh: '确认签名', en: 'SIGN-OFF' },
      roles: [
        { id: 'installer', zh: '安装师傅', en: 'Installer' },
        { id: 'inspector', zh: 'SS 检查人', en: 'Inspector (SS)', bind: 'settings.name' },
        { id: 'pm', zh: '项目经理', en: 'Project Manager' },
      ],
    },
  ],
  // 结果统计 Summary：合格 __ 项 · 不合格 __ 项 · 登记 Punch __ 项
  summary(ctx) {
    const c = countResults(ctx, 'items');
    const punch = Object.values(ctx.report.items || {}).filter(
      (a) => a && a.r === 'F' && (a.note || '').trim(),
    ).length;
    return {
      title: { zh: '结果统计', en: 'Summary' },
      items: [
        { label: { zh: '合格', en: 'Pass' }, value: `${c.P || 0} 项 items`, tone: 'pass' },
        { label: { zh: '不合格', en: 'Fail' }, value: `${c.F || 0} 项 items`, tone: c.F ? 'fail' : 'neutral' },
        { label: { zh: '登记 Punch', en: 'Punch' }, value: `${punch} 项 items`, tone: punch ? 'warn' : 'neutral' },
        { label: { zh: '不适用', en: 'N/A' }, value: `${c.NA || 0} 项 items`, tone: 'na' },
        { label: { zh: '未检查', en: 'Not checked' }, value: `${c._empty || 0} 项 items`, tone: c._empty ? 'warn' : 'neutral' },
      ],
    };
  },
  filename(ctx) {
    const v = ctx.report.values || {};
    return ['安装质检', v.project, v.date].filter(Boolean).join('_');
  },
};
