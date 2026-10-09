// 复尺确认表 FINAL MEASUREMENT & CONFIRMATION CHECKLIST
// 来源：Final_Measurement_Checklist（Final Version）.xlsx —— 复尺 4 步，客户到场确认后签字下单
import { L } from './schema.js';
import { countResults, allFails } from './helpers.js';

// 检查项：id = fm{节}{序号}，no = 原表序号（A1…D6）；原表一格「中文\nEnglish」拆成 {zh, en}
const I = (sec, n, zh, en) => ({
  id: `fm${sec}${n}`,
  no: `${sec}${n}`,
  title: { zh, en },
});

// 原表右栏：凡勾「否」必须写明处理方案与负责人
const remark = {
  label: { zh: '异常记录 / 处理方案', en: 'Remarks & Action' },
  requiredWhen: ['N'],
};

// 四个检查节共用：是 / 否 / N/A 三列打勾
const list = (id, no, title, note, items) => ({
  id,
  type: 'checklist',
  no,
  title,
  note,
  scale: 'yes-no-na',
  resultLayout: 'columns',
  remark,
  items,
});

export default {
  id: 'measurement',
  version: 1,
  kind: 'checklist',
  stage: 1,
  name: { zh: '复尺确认表', en: 'Final Measurement Checklist' },
  short: 'FM',
  desc: '复尺 4 步 · 客户现场确认 · 签字下单',
  icon: 'Ruler',
  accent: '#A98B57',
  doc: {
    brand: 'vsmooth',
    kicker: '溪岸 SAIL BY RICCIONE REKA · V-SMOOTH',
    title: { zh: '复尺确认表', en: 'FINAL MEASUREMENT & CONFIRMATION CHECKLIST' },
    intro: [
      {
        zh: '填写说明 逐项勾选;凡勾「否」必须在右栏写明处理方案与负责人;不适用项勾 N/A。',
        en: 'Tick item by item. Any “No” must state the corrective action & person-in-charge in the remarks column. Tick N/A if not applicable.',
      },
    ],
    footer: '溪岸 Sail by Riccione Reka  ·  自然主义生活体验馆  ·  V-SMOOTH 交付体系',
  },
  sections: [
    {
      // 原表抬头三行两列：客户 | SO、地址 | 日期、复尺人员 | 设计师
      id: 'info',
      type: 'fields',
      columns: 2,
      fields: [
        { key: 'customer', type: 'text', label: { zh: '客户姓名', en: 'Customer' }, bind: 'project.client', required: true },
        { key: 'so', type: 'text', label: { zh: 'SO 编号', en: 'SO No.' }, bind: 'project.so' },
        { key: 'address', type: 'text', label: { zh: '项目地址', en: 'Site Address' }, bind: 'project.address' },
        { key: 'date', type: 'date', label: { zh: '复尺日期', en: 'Date' }, bind: 'today', required: true },
        { key: 'supervisor', type: 'text', label: { zh: '复尺人员', en: 'Site Supervisor' }, bind: 'settings.name' },
        { key: 'designer', type: 'text', label: { zh: '随行设计师', en: 'Designer' }, bind: 'project.designer' },
      ],
    },
    list(
      'prep',
      'A',
      { zh: '复尺前准备', en: 'PRE-VISIT PREPARATION' },
      { zh: '出发前完成', en: 'Complete before departure' },
      [
        I('A', 1, '提前至少1天联系客户,确认确图当事人当天到场', 'Confirm ≥1 day ahead that the decision-maker will be on site'),
        I('A', 2, '备齐测量工具,携带客户已签名的最终图纸', 'Bring measuring tools & the customer-signed final drawings'),
        I('A', 3, '已收齐电器型号与尺寸(油烟机、水槽、冰箱等)', 'Appliance models & dimensions received (hood, sink, fridge, etc.)'),
      ],
    ),
    list(
      'site',
      'B',
      { zh: '现场条件检查', en: 'SITE CONDITION CHECK' },
      { zh: '到场先查', en: 'Check upon arrival' },
      [
        I('B', 1, '电梯/楼梯尺寸足够,大件板材与柜体可进场', 'Lift / staircase clearance allows large panels & carcasses in'),
        I('B', 2, '墙体垂直、平整;倾斜处加大离墙距,确保柜深不受影响', 'Walls plumb & flat; widen wall gap at slanted areas so cabinet depth is unaffected'),
        I('B', 3, '吊柜墙面可承重,墙面无造型物阻碍安装', 'Hanging-cabinet wall can bear load; no wall features obstruct installation'),
        I('B', 4, '强弱电箱、可视对讲、开关插座、吊灯射灯均已避让,柜体安装后仍可正常使用', 'DB box, intercom, switches, sockets & lights avoided; all remain usable after installation'),
        I('B', 5, '上下水管、梁、柱、地漏与柜体无冲突', 'Plumbing, beams, columns & floor traps clear of all cabinets'),
        I('B', 6, '踢脚线、石膏线、窗台石、晾衣架、地面拼花已避让或已在图纸调整', 'Skirting, cornice, window sill, drying rack & floor pattern avoided or adjusted in drawing'),
      ],
    ),
    list(
      'measure',
      'C',
      { zh: '尺寸与图纸复核', en: 'MEASUREMENT VS DRAWING' },
      { zh: '逐空间复核', en: 'Verify space by space' },
      [
        I('C', 1, '按空间顺序逐项复核尺寸,现场与最终图纸一致', 'Re-measure space by space; site dimensions tally with the final drawings'),
        I('C', 2, '各柜体深度不阻碍过道通行;电视柜对正沙发,贵妃位不挡道', 'Cabinet depths keep walkways clear; TV unit centred to sofa, chaise unobstructed'),
        I('C', 3, '扣除衣柜深度后,床位、床头柜、过道与窗帘位空间充足', 'After wardrobe depth, space for bed, bedside tables, walkway & curtains is adequate'),
        I('C', 4, '窗帘盒与窗帘杆位置已预留,不影响柜门开启', 'Curtain box & rod positions reserved; cabinet doors open freely'),
        I('C', 5, '电视背景墙造型、吊顶深度与射灯不与柜体冲突', 'TV backdrop, ceiling depth & spotlights do not clash with cabinets'),
        I('C', 6, 'L型/U型柜体每面离墙 ≥20mm,见光侧板后飘(现场裁切收口)', 'L/U-shape cabinets: ≥20 mm wall gap per side; exposed end panels scribed on site'),
        I('C', 7, '狭窄空间使用双侧板;三面入墙必须双侧板,逐柜下单', 'Double side panels in tight spaces; mandatory for 3-side built-ins, order carcass by carcass'),
      ],
    ),
    list(
      'confirm',
      'D',
      { zh: '客户现场确认', en: 'CUSTOMER ON-SITE CONFIRMATION' },
      { zh: '当面完成', en: 'Complete with customer present' },
      [
        I('D', 1, '用卷尺现场放样柜体尺寸与位置,让客户实际体验', 'Tape out cabinet size & position on site for the customer to experience'),
        I('D', 2, '与客户最终确认柜体花色、款式、材质无误', 'Final confirmation of colours, profiles & materials with the customer'),
        I('D', 3, '带灯带柜体:确认现场灯线预留情况及加装费用', 'Cabinets with LED: confirm wiring provision & additional charges'),
        I('D', 4, '告知障碍物处理方法及可能产生的瑕疵', 'Explain how obstacles will be handled & possible resulting imperfections'),
        I('D', 5, '告知安装工期自复尺下单日起算', 'Inform that lead time starts from the order date after final measurement'),
        I('D', 6, '告知下单后图纸不再修改', 'Inform that no drawing changes are allowed after order placement'),
      ],
    ),
    {
      // 原表「补充记录」空白栏；现场照片为 App 新增（选填）
      id: 'notes',
      type: 'fields',
      title: { zh: '补充记录', en: 'Additional Notes' },
      columns: 1,
      fields: [
        { key: 'notes', type: 'textarea', label: { zh: '补充记录', en: 'Additional Notes' }, rows: 4, keepOnDuplicate: false },
        { key: 'photos', type: 'photos', label: { zh: '现场照片', en: 'Site photos' }, max: 20 },
      ],
    },
    {
      id: 'signoff',
      type: 'signatures',
      declaration: {
        zh: '客户确认声明  本人已到场参与复尺,确认以上各项内容、最终图纸、花色与款式无误,同意据此下单;知悉安装工期自下单日起算,下单后图纸与规格不再更改。',
        en: 'I was present at the final measurement and confirm that all items above, the final drawings, colours & profiles are correct. I agree to proceed with the order, and acknowledge that the lead time starts from the order date and no changes to drawings or specifications are allowed after order placement.',
      },
      roles: [
        { id: 'customer', zh: '客户签名', en: 'Customer Signature', bind: 'project.client' },
        { id: 'supervisor', zh: '复尺人员签名', en: 'Site Supervisor Signature', bind: 'settings.name' },
      ],
    },
  ],
  // 结果统计：是 / 否 / N/A / 未勾选 + 勾「否」的待处理清单
  summary(ctx) {
    const c = countResults(ctx);
    const Y = c.Y || 0;
    const N = c.N || 0;
    const NA = c.NA || 0;
    const empty = c._empty || 0;
    const todo = allFails(ctx).map(({ item, answer }) => {
      const note = (answer?.note || '').trim();
      return `${item.no} ${L(item.title, 'zh')}${note ? `（${note}）` : '（未写处理方案）'}`;
    });
    const MAX = 6;
    return {
      title: { zh: '结果统计', en: 'Summary' },
      items: [
        { label: { zh: '是', en: 'Yes' }, value: `${Y} 项 items`, tone: 'pass' },
        { label: { zh: '否', en: 'No' }, value: `${N} 项 items`, tone: N ? 'fail' : 'neutral' },
        { label: { zh: '不适用', en: 'N/A' }, value: `${NA} 项 items`, tone: 'na' },
        { label: { zh: '未勾选', en: 'Not checked' }, value: `${empty} 项 items`, tone: empty ? 'warn' : 'neutral' },
        {
          label: { zh: '待处理', en: 'Action needed' },
          value: todo.length
            ? todo.slice(0, MAX).join('；') + (todo.length > MAX ? `；等共 ${todo.length} 项` : '')
            : '无 None',
          tone: todo.length ? 'fail' : 'neutral',
        },
      ],
    };
  },
  // 勾「否」未写处理方案 → 已由 remark.requiredWhen 报错；这里只提醒签名
  checks(ctx) {
    const out = [];
    const sig = ctx.report?.signatures || {};
    if (!sig.customer?.image) out.push({ text: '客户还未签名：请客户阅读「客户确认声明」后签名', sectionId: 'signoff' });
    if (!sig.supervisor?.image) out.push({ text: '复尺人员还未签名', sectionId: 'signoff' });
    return out;
  },
  filename(ctx) {
    const v = ctx.report?.values || {};
    return ['复尺确认', v.customer, v.date].filter(Boolean).join('_');
  },
};
