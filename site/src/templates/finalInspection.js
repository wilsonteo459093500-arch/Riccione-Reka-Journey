// 完工终检表 FINAL INSPECTION REPORT（内部文件，无需出示客户）
// 来源：Template_Sail_Final_Inspection_Report_Internal.docx
// 27 项终检（Ⅰ–Ⅵ）→ 不合格记入整改清单（Ⅶ）→ 复验合格关闭 → 才约客户交付
import { L } from './schema.js';
import { countResults, val } from './helpers.js';
import { fmtDate } from '../lib/format.js';

const I = (no, zhT, enT, zhS, enS) => ({
  id: `fi${no}`,
  no: String(no),
  title: { zh: zhT, en: enT },
  desc: { zh: zhS, en: enS },
});

const remark = { label: { zh: '备注', en: 'Remarks' } };

// 整改清单下拉选项（与表下图例一致）
const CATEGORY = ['安装质量', '板件损伤', '缺件', '尺寸偏差', '水电', '硬装损伤', '其他'];
const OWNER = ['安装班组', '工厂', '物流', '硬装单位', '其他'];
const SEVERITY = [
  { v: '高', zh: '高', en: 'High' },
  { v: '中', zh: '中', en: 'Medium' },
  { v: '低', zh: '低', en: 'Low' },
];
const RECHECK = [
  { v: 'P', zh: '合格', en: 'Pass' },
  { v: 'F', zh: '不合格', en: 'Fail' },
];
const CONCLUSION = [
  { v: 'pass', zh: '合格 — 可安排交付', en: 'Passed — Ready for Handover' },
  { v: 'rectify', zh: '需整改', en: 'Rectification Needed' },
];

const LOG_COLS = ['loc', 'category', 'desc', 'owner', 'severity', 'target', 'recheck', 'closed'];

const filled = (v) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0);

/** 整改清单里「有内容」的行（空行不算）；n = 表内原行号（从 1 起） */
function logRows(ctx) {
  const rows = ctx.report?.tables?.rectification || [];
  return rows
    .map((r, i) => ({ ...(r || {}), n: i + 1 }))
    .filter((r) => LOG_COLS.some((k) => filled(r[k])) || filled(r.before) || filled(r.after) || filled(r.photos));
}

/** 关闭 = 复验合格 + 填了关闭日 */
const isClosed = (r) => r.recheck === 'P' && filled(r.closed);

export default {
  id: 'final-inspection',
  version: 1,
  kind: 'checklist',
  stage: 6,
  name: { zh: '完工终检表', en: 'Final Inspection Report' },
  short: 'FIR',
  desc: '27 项终检 · 整改复验 · 合格才约客户交付',
  icon: 'BadgeCheck',
  accent: '#B5623A',
  doc: {
    brand: 'sail',
    badge: { zh: 'INTERNAL · 内部文件', en: '无需出示客户 not for client' },
    title: { zh: '完工终检表', en: 'FINAL INSPECTION REPORT' },
    subtitle: { zh: '终检合格，才约客户交付。', en: 'Pass this gate before booking the handover.' },
  },
  sections: [
    {
      id: 'info',
      type: 'fields',
      columns: 3,
      fields: [
        { key: 'project', type: 'text', label: { zh: '项目', en: 'Project' }, bind: 'project.siteLabel', required: true },
        { key: 'so', type: 'text', label: 'SO No.', bind: 'project.so' },
        { key: 'date', type: 'date', label: { zh: '终检日期', en: 'Inspection Date' }, bind: 'today', required: true },
      ],
    },
    {
      id: 'material',
      type: 'checklist',
      no: 'Ⅰ',
      title: { zh: '材料验收', en: 'MATERIAL' },
      scale: 'pass-fail',
      resultLayout: 'columns',
      remark,
      items: [
        I(1, '板材核对', 'Board Spec',
          '检查板材色号、基材、厚度是否与合同/样板一致；重点确认对花/纹理方向。',
          'Verify color code, substrate, thickness match contract/sample; confirm grain direction & matching.'),
        I(2, '封边检查', 'Edge Banding',
          '封边严密光滑，无脱胶/溢胶/开裂/黑线；白色封边轻微线痕属行业容差，但需整体干净。',
          'Tight & smooth; no peeling, glue residue, cracking, black lines. Minor lines on white banding are tolerance but finish must be clean.'),
        I(3, '五金核对', 'Hardware',
          '品牌/型号与合同一致；确认铰链/导轨为缓冲（Soft-close）或二段力配置；数量按门板尺寸达标。',
          'Brand/model match contract; confirm soft-close / two-stage hinges & runners; quantity meets door size requirement.'),
      ],
    },
    {
      id: 'appearance',
      type: 'checklist',
      no: 'Ⅱ',
      title: { zh: '外观验收', en: 'APPEARANCE' },
      scale: 'pass-fail',
      resultLayout: 'columns',
      remark,
      items: [
        I(4, '整体效果', 'Design Match',
          '安装效果与图纸一致；重点检查上下封板/收边，避免“假的一门到顶”。',
          'Matches drawings; check top/bottom fillers to avoid a \'fake floor-to-ceiling\' look.'),
        I(5, '柜体稳固', 'Stability',
          '柜体结构结实，推拉无明显晃动；吊柜固定牢固（无松动/无异响）。',
          'Solid structure; no shaking; wall cabinets secured without movement/noise.'),
        I(6, '表面检查', 'Surface',
          '撕开保护膜检查：门板/面板无磕碰、无划痕、无鼓包/起泡、无色差异常。',
          'Remove protective film: no chips/scratches/bubbles; no abnormal color difference.'),
        I(7, '平整度', 'Alignment',
          '门板在同一平面，上下齐平；门缝/抽缝均匀（建议 2–3mm）。',
          'Doors flush & aligned; even gaps (recommended 2–3mm).'),
        I(8, '收口打胶', 'Caulking',
          '柜体与墙体/顶面/地板间缝隙按约定打胶（防霉胶），胶线顺直、无污染。',
          'Seal gaps with agreed anti-mold silicone; straight lines; no stains.'),
      ],
    },
    {
      id: 'internal',
      type: 'checklist',
      no: 'Ⅲ',
      title: { zh: '内部与功能', en: 'INTERNAL & FUNCTION' },
      scale: 'pass-fail',
      resultLayout: 'columns',
      remark,
      items: [
        I(9, '开关手感', 'Operation',
          '门/抽屉开关顺畅无异响；缓冲/反弹器工作正常（建议每个点至少测试 3 次）。',
          'Smooth operation; soft-close/push-to-open works (test each point at least 3 times).'),
        I(10, '内部五金', 'Accessories',
          '衣撑、裤架、拉篮、转角拉篮等安装稳固，推拉顺滑，限位/防脱落有效。',
          'Rails, racks, baskets secured; smooth sliding; anti-drop/limit works.'),
        I(11, '透光检查', 'Light Leakage',
          '检查横板与竖板连接处是否透光/透缝（缝隙过大），必要时调整/补胶。',
          'Check joint gaps causing light leakage; adjust/reseal if needed.'),
        I(12, '美化处理', 'Finishing',
          '钉子眼/孔位已用同色美容贴/孔盖处理；内部无外露螺丝头。',
          'Nail/screw holes covered with matching caps; no exposed screw heads.'),
        I(13, '铰链数量', 'Hinge Qty',
          '高门板（≥1.5m）建议 ≥3 只铰链；更高/更重门板按标准加配，防下坠。',
          'Tall doors (≥1.5m): recommend ≥3 hinges; add more for heavier/taller doors to prevent sagging.'),
        I(14, '透气孔', 'Ventilation',
          '鞋柜/橱柜是否按约定开透气孔；孔位整齐、无毛刺、带装饰盖（如约定）。',
          'Vent holes installed as agreed; neat cut, no burrs; with cover cap if specified.'),
        I(15, '活动层板', 'Shelves',
          '层板可调且稳固；排孔数量/高度按图纸/约定完成；层板不翘曲。',
          'Adjustable & stable; drilling per drawing; shelves not warped.'),
        I(16, '灯光系统', 'Lighting',
          '灯带位置正确、无裸点（见光不见灯）；感应器灵敏；线路与变压器隐藏合理并可维护。',
          'Correct LED position; no visible dots; sensors responsive; wiring/driver hidden neatly and serviceable.'),
      ],
    },
    {
      id: 'countertop',
      type: 'checklist',
      no: 'Ⅳ',
      title: { zh: '台面验收', en: 'COUNTERTOP' },
      scale: 'pass-fail',
      resultLayout: 'columns',
      remark,
      items: [
        I(17, '水平与固定', 'Level & Support',
          '台面水平稳定无晃动；支撑点充足；台面外沿出沿一致，转角无崩边。',
          'Countertop level & stable; adequate support; consistent overhang; no chipped corners.'),
        I(18, '拼缝标准', 'Seams',
          '拼缝直顺、颜色接近；无明显高低差；行业参考：缝宽约 0.3–0.8mm（以现场石材/工艺为准）。',
          'Seams straight with close color match; no lippage; ref. tolerance seam width ~0.3–0.8mm depending on material/craft.'),
        I(19, '倒角抛光', 'Edge Finish',
          '边缘倒角一致、触感顺滑不刮手；抛光均匀，无阴阳面。',
          'Consistent chamfer; smooth touch; even polish without patchiness.'),
        I(20, '开孔与防水', 'Cut-out & Waterproof',
          '水槽/炉灶开孔边缘打磨；切口处防水封胶到位；挡水/止水条按图纸。',
          'Cut-outs polished; waterproof seal applied; water-stop/backsplash per drawing.'),
        I(21, '硅胶与收口', 'Silicone & Filler',
          '台面与墙面/挡水条胶线顺直、无发霉/空鼓；胶色与台面协调。',
          'Neat silicone lines; no hollow spots/mold; color matches countertop.'),
      ],
    },
    {
      id: 'tolerance',
      type: 'checklist',
      no: 'Ⅴ',
      title: { zh: '尺寸与容差', en: 'TOLERANCE' },
      scale: 'pass-fail',
      resultLayout: 'columns',
      remark,
      items: [
        I(22, '垂直水平', 'Plumb & Level',
          '柜体垂直/水平一致；连接处无台阶；踢脚线与柜体线条平直。',
          'Cabinets plumb & level; no steps at joints; toe-kick line straight.'),
        I(23, '踢脚/收口', 'Toe-kick & Filler',
          '踢脚/收边高度一致，收口条宽窄统一；与墙面贴合良好；避免明显“大缝”。',
          'Consistent toe-kick/filler size; good wall contact; avoid obvious large gaps.'),
        I(24, '门缝抽缝', 'Gaps',
          '门缝/抽缝一致；转角位对齐；把手/拉手高度一致（如有）。',
          'Uniform gaps; aligned corners; consistent handle heights if applicable.'),
      ],
    },
    {
      id: 'closing',
      type: 'checklist',
      no: 'Ⅵ',
      title: { zh: '保护与收尾', en: 'PROTECTION & CLOSING' },
      scale: 'pass-fail',
      resultLayout: 'columns',
      remark,
      items: [
        I(25, '现场保护', 'Site Protection',
          '地面、墙面、电梯等无刮伤；保护到位并在终检前清理撤除。',
          'No damage to floor/walls/lift; protection applied and removed neatly.'),
        I(26, '清洁标准', 'Cleaning',
          '无锯末/灰尘/胶渍（建议白手套标准）；台面与柜内干净无残胶。',
          'Dust/glue free (white-glove standard); countertop and cabinet interiors clean.'),
        I(27, '照片记录', 'Photo Record',
          '关键角度拍照存档：全景、台面拼缝、收口、门缝抽缝、五金细节、灯光效果。',
          'Photo record: overall, seams, fillers, gaps, hardware, lighting effects.'),
      ],
    },
    {
      id: 'fail-rule',
      type: 'note',
      tone: 'warn',
      lines: [
        {
          zh: '★ 勾选「不合格」的项目必须记入下方整改清单，复验合格后方可关闭。',
          en: 'Any item marked Fail must be logged in the Rectification Log below and closed only after re-inspection passes.',
        },
      ],
    },
    {
      id: 'rectification',
      type: 'table',
      no: 'Ⅶ',
      title: { zh: '整改与复验记录', en: 'RECTIFICATION LOG' },
      minRows: 0,
      seedFromFails: true,
      addLabel: '添加整改项',
      emptyText: { zh: '无整改项', en: 'No rectification items' },
      columns: [
        { key: 'loc', type: 'text', label: { zh: '位置（柜体/区域）', en: 'Location' } },
        { key: 'category', type: 'select', label: { zh: '类别', en: 'Category' }, options: CATEGORY },
        { key: 'desc', type: 'textarea', label: { zh: '问题描述', en: 'Description of Issue' }, width: 2 },
        { key: 'owner', type: 'select', label: { zh: '责任方', en: 'Owner' }, options: OWNER },
        { key: 'severity', type: 'select', label: { zh: '严重度', en: 'Severity' }, options: SEVERITY },
        { key: 'target', type: 'date', label: { zh: '目标日期', en: 'Target' } },
        { key: 'recheck', type: 'select', label: { zh: '复验', en: 'Re-inspection' }, options: RECHECK },
        { key: 'closed', type: 'date', label: { zh: '关闭日', en: 'Closed' } },
      ],
      photoSlots: [
        { key: 'before', label: { zh: '问题照片', en: 'Issue photo' } },
        { key: 'after', label: { zh: '复验照片', en: 'Re-inspection photo' } },
      ],
    },
    {
      id: 'rectification-legend',
      type: 'note',
      tone: 'info',
      lines: [
        { zh: '类别 Category：安装质量 / 板件损伤 / 缺件 / 尺寸偏差 / 水电 / 硬装损伤 / 其他' },
        { zh: '责任方 Owner：安装班组 / 工厂 / 物流 / 硬装单位 / 其他' },
        { zh: '严重度 Severity：高（影响交付）/ 中 / 低' },
        {
          zh: '★ 关单规则 Closing Rule：每项须附「问题照片 + 整改后复验照片」；全部整改项须在交付前关闭。',
          en: 'Each item requires an issue photo + a post-fix re-inspection photo; all items must close before handover.',
        },
      ],
    },
    // 统计放在结论之前：先看数字，再下结论
    { id: 'summary', type: 'summary' },
    {
      id: 'conclusion',
      type: 'fields',
      title: { zh: '综合结论', en: 'Overall Conclusion' },
      columns: 2,
      fields: [
        { key: 'result', type: 'radio', label: { zh: '综合结论', en: 'Overall Conclusion' }, options: CONCLUSION, span: 2, required: true, keepOnDuplicate: false },
        { key: 'rectifiedDate', type: 'date', label: { zh: '整改完成日期', en: 'Rectification Completed' }, keepOnDuplicate: false },
        { key: 'recheckDate', type: 'date', label: { zh: '复验合格日期', en: 'Re-inspection Passed' }, keepOnDuplicate: false },
      ],
    },
    {
      id: 'conclusion-note',
      type: 'note',
      tone: 'warn',
      lines: [
        {
          zh: '★ 终检合格后，方可联系客户安排交付日期。',
          en: 'Only after passing may the handover appointment be booked.',
        },
      ],
    },
    {
      id: 'signoff',
      type: 'signatures',
      roles: [
        { id: 'installer_sup', zh: '安装主管', en: 'INSTALLATION SUPERVISOR', bind: 'settings.name' },
        { id: 'designer', zh: '设计师', en: 'DESIGNER', bind: 'project.designer' },
        { id: 'handover', zh: '交付管家', en: 'HANDOVER MANAGER' },
      ],
    },
  ],
  // 结果统计：合格 / 不合格 / 未检查 / 整改项（已关闭）/ 结论
  summary(ctx) {
    const c = countResults(ctx);
    const P = c.P || 0;
    const F = c.F || 0;
    const rows = logRows(ctx);
    const closed = rows.filter(isClosed).length;
    const open = rows.length - closed;

    const result = val(ctx, 'result');
    const opt = CONCLUSION.find((o) => o.v === result);
    const recheckDate = val(ctx, 'recheckDate');
    const rectifiedDate = val(ctx, 'rectifiedDate');
    let conclusion = '未选择 Not selected';
    let tone = 'warn';
    if (result === 'pass') {
      conclusion = L(opt);
      tone = F > closed || open || c._empty ? 'warn' : 'pass'; // 还有未检查项时不能显示绿色
    } else if (result === 'rectify') {
      conclusion = L(opt);
      if (filled(recheckDate)) {
        conclusion += ` · 复验合格 ${fmtDate(recheckDate)}`;
        tone = open ? 'warn' : 'pass';
      } else if (filled(rectifiedDate)) {
        conclusion += ` · 整改完成 ${fmtDate(rectifiedDate)}`;
        tone = 'warn';
      } else {
        tone = 'fail';
      }
    } else if (filled(result)) {
      conclusion = String(result);
    }

    return {
      title: { zh: '结果统计', en: 'Summary' },
      items: [
        { label: { zh: '合格', en: 'Pass' }, value: `${P} 项 items`, tone: 'pass' },
        { label: { zh: '不合格', en: 'Fail' }, value: `${F} 项 items`, tone: F ? 'fail' : 'neutral' },
        { label: { zh: '未检查', en: 'Not checked' }, value: `${c._empty || 0} 项 items`, tone: c._empty ? 'warn' : 'neutral' },
        {
          label: { zh: '整改项', en: 'Rectification' },
          value: `${rows.length} 项 items · 已关闭 ${closed} closed`,
          tone: open ? 'warn' : rows.length ? 'pass' : 'neutral',
        },
        { label: { zh: '结论', en: 'Conclusion' }, value: conclusion, tone },
      ],
    };
  },
  checks(ctx) {
    const out = [];
    const c = countResults(ctx);
    const F = c.F || 0;
    const rows = logRows(ctx);
    const closed = rows.filter(isClosed).length;
    const open = rows.length - closed;
    const result = val(ctx, 'result');

    if (val(ctx, 'result') === 'pass' && countResults(ctx)._empty) out.push({ text: '结论为「合格 — 可安排交付」，但还有检查项未检查', sectionId: 'conclusion' });
    if (F > rows.length) out.push({ text: `有 ${F - rows.length} 项不合格还没记入整改清单`, sectionId: 'rectification' });
    if (result === 'pass') {
      if (open) out.push({ text: `结论为「合格 — 可安排交付」，但还有 ${open} 项整改未关闭`, sectionId: 'conclusion' });
      if (F > closed) out.push({ text: `结论为「合格 — 可安排交付」，但还有 ${F - closed} 项不合格未复验关闭`, sectionId: 'conclusion' });
    }
    if (result === 'rectify' && filled(val(ctx, 'recheckDate')) && open) {
      out.push({ text: `已填复验合格日期，但还有 ${open} 项整改未关闭`, sectionId: 'conclusion' });
    }
    // ★ 关单规则：每项须附「问题照片 + 整改后复验照片」
    rows.forEach((r) => {
      const { n } = r;
      if (!filled(r.before)) out.push({ text: `整改第 ${n} 项缺少问题照片`, sectionId: 'rectification' });
      if (isClosed(r) && !filled(r.after)) out.push({ text: `整改第 ${n} 项已关闭，但缺少复验照片`, sectionId: 'rectification' });
      if (filled(r.closed) && r.recheck !== 'P') out.push({ text: `整改第 ${n} 项填了关闭日，但复验未选「合格」`, sectionId: 'rectification' });
    });
    return out;
  },
  filename(ctx) {
    const v = ctx.report.values || {};
    return ['完工终检', v.project, v.date].filter(Boolean).join('_');
  },
};
