// 场前审核表 PRE-INSTALLATION SITE AUDIT（V-SMOOTH · 5O）
// 来源：Pre-installation Site Checklist（场前审核表）.docx —— 5O 五步：订单 · 现场 · 客户 · 运输 · 开场
// 原文逐字照抄（含半角 , : 标点）；★ = 关键项，【影像】= 需拍照或录影存档
import { countResults, keyFails, allFails } from './helpers.js';
import { fmtDate } from '../lib/format.js';

// 原表判定栏：☐ 是 Pass   ☐ 否 Fail / ☐ 不适用 N.A.
const scale = {
  id: '5o',
  options: [
    { v: 'P', zh: '是', en: 'Pass', tone: 'pass' },
    { v: 'F', zh: '否', en: 'Fail', tone: 'fail' },
    { v: 'NA', zh: '不适用', en: 'N.A.', tone: 'na' },
  ],
};

// 签核：开工判定
const GONOGO = {
  id: 'gonogo',
  options: [
    { v: 'GO', zh: '可开工', en: 'GO', tone: 'pass' },
    { v: 'COND', zh: '有条件开工', en: 'Conditional', tone: 'warn' },
    { v: 'NOGO', zh: '暂停进场', en: 'NO-GO', tone: 'fail' },
  ],
};

// 判定显示文字（与原表一致）
const DECISION_TEXT = { GO: 'GO 可开工', COND: '有条件开工', NOGO: 'NO-GO 暂停进场' };
const DECISION_ID = 'pis_01';
const REMARK_ID = 'pis_04';

const remark = { label: { zh: '异常说明 / 整改责任人', en: 'Remarks / PIC' }, requiredWhen: ['F'] };

const KEY = { key: true };
const KEY_MEDIA = { key: true, media: true };

// 判定项：id = pi{节}_{原表序号}；原表无英文行的项目只有 zh
const I = (sec, no, zh, en, flags = {}) => ({
  id: `pi${sec}_${no}`,
  no,
  title: en ? { zh, en } : { zh },
  ...flags,
});

// 填写项（差异 / 视频链接 / 带队人 / 搬运动线 / 备注）：placeholder = 原表「填写示例」
const W = (sec, no, title, input) => ({
  id: `pi${sec}_${no}`,
  no,
  title,
  input: { label: title, ...input },
});

// O1–O5 共用的判定节
const O = (n, title, note, items) => ({
  id: `o${n}`,
  type: 'checklist',
  no: `O${n}`,
  title,
  note,
  scale,
  resultLayout: 'inline',
  remark,
  items,
});

const O_IDS = ['o1', 'o2', 'o3', 'o4', 'o5'];
const ref = (s, it) => `${s.no}-${it.no}`;

/** O1–O5 统计：关键项总数 / 已判定 / 不通过、一般项不通过 */
function audit(ctx) {
  const items = ctx.report?.items || {};
  const out = { keyTotal: 0, keyDone: 0, keyPass: 0, keyFails: [], generalFails: [], empty: 0 };
  for (const s of ctx.template.sections) {
    if (!O_IDS.includes(s.id)) continue;
    for (const it of s.items) {
      if (it.input) continue;
      const r = items[it.id]?.r;
      if (!r) out.empty += 1;
      if (!it.key) continue;
      out.keyTotal += 1;
      if (r) out.keyDone += 1;
      if (r === 'P') out.keyPass += 1;
    }
  }
  out.keyFails = keyFails(ctx).filter((f) => O_IDS.includes(f.section.id));
  out.generalFails = allFails(ctx).filter((f) => !f.item.key && O_IDS.includes(f.section.id));
  return out;
}

export default {
  id: 'pre-install',
  version: 1,
  kind: 'checklist',
  stage: 2,
  name: { zh: '场前审核表', en: 'Pre-Installation Site Audit' },
  short: '5O',
  desc: '5O 五步核查 · ★ 关键项不过不得开工',
  icon: 'ClipboardList',
  accent: '#AE4E37',
  doc: {
    brand: 'vsmooth',
    kicker: 'V-SMOOTH  ·  5O',
    title: { zh: '场前审核表', en: 'Pre-Installation Site Audit' },
    subtitle: { zh: '按 5O 五步核查:订单 · 现场 · 客户 · 运输 · 开场', en: '现场主管填写,项目经理复核' },
    legend: '图例:  ★ = 关键项,不通过则不得开工     【影像】= 需拍照或录影存档',
    footer: '本表未完成、未判定「可开工」,不得安排送装。',
  },
  sections: [
    {
      // 原表抬头三行两列
      id: 'info',
      type: 'fields',
      columns: 2,
      fields: [
        { key: 'client', type: 'text', label: { zh: '项目 / 客户' }, bind: 'project.siteLabel', required: true },
        { key: 'address', type: 'text', label: { zh: '地址 / 单位' }, bind: 'project.address' },
        { key: 'date', type: 'date', label: { zh: '审核日期' }, bind: 'today', required: true },
        {
          key: 'supervisor',
          type: 'text',
          label: { zh: '现场主管 / 电话' },
          default: (ctx) => [ctx.settings?.name, ctx.settings?.phone].filter(Boolean).join(' '),
        },
        {
          key: 'entry',
          type: 'text',
          label: { zh: '进场日期 · 天数' },
          placeholder: '例：2026-10-08 · 5 天',
          // 项目有开工日期 / 预计天数时自动带入：2026-10-08 · 5 天
          default: (ctx) => {
            const p = ctx.project;
            if (!p?.startDate) return '';
            return [fmtDate(p.startDate), p.plannedDays ? `${p.plannedDays} 天` : ''].filter(Boolean).join(' · ');
          },
        },
        { key: 'hours', type: 'text', label: { zh: '授权施工时段' }, placeholder: '例：9:00–17:00' },
      ],
    },
    O(1, { zh: '订单就位', en: 'ORDER' }, { zh: '钱和图 — 尾款没到、图纸不是最新版,一律不安排送装' }, [
      I(1, '01', '尾款已到账,可安排送装', 'FINAL PAYMENT RECEIVED', KEY),
      I(1, '02', '客户回签的最新深化图已在手,现场以此版为准', 'LATEST SIGNED DRAWINGS ON HAND', KEY),
    ]),
    O(2, { zh: '现场核查', en: 'ONSITE' }, { zh: '硬装的落地 + 场地整洁 + 一支视频把全屋硬装状况拍进去' }, [
      I(2, '01', '硬装已全部完成,复尺后现场无改动 (贴砖 / 油漆 / 门槛 / 管线点位都没动)', 'HARDSCAPE DONE, NO CHANGES', KEY),
      I(2, '02', '电位 / 水位抽查:与图纸一致,不被柜体挡住', 'M&E SPOT-CHECK VS DRAWINGS', KEY),
      I(2, '03', '现场干净干燥,可直接施工 (无渗水返潮、无杂物堆积)', 'CLEAN, DRY, WORKABLE', KEY),
      I(2, '04', '临时水电可用,够师傅施工', '', KEY),
      W(2, '05', { zh: '差异 / 未完成事项' }, {
        key: 'diffs',
        type: 'textarea',
        placeholder: '填写示例:哪里 / 差什么 / 谁负责 / 几时好',
      }),
      W(2, '06', { zh: '进场视频链接', en: 'VIDEO LINK' }, {
        key: 'videoLink',
        type: 'url',
        placeholder: '填写示例:Google Drive / Dropbox 链接',
      }),
      I(2, '07', '全屋一镜到底:每个房间从门口慢慢转一圈,边拍边报房间名', 'EVERY ROOM, ONE CONTINUOUS TAKE', KEY_MEDIA),
      I(2, '08', '要装柜的墙面全部拍清楚:墙面、地面、天花交界看得到', 'ALL CABINET WALLS CAPTURED', KEY_MEDIA),
      I(2, '09', '电位 / 水位逐个特写,拍到位置与高度 (用卷尺或手掌作参照)', 'M&E POINTS CLOSE-UP', KEY_MEDIA),
      I(2, '10', '既有缺陷、梁 / 管 / 消防等凸出物已拍到特写 (免责存证)', 'DEFECTS & OBSTRUCTIONS', KEY_MEDIA),
    ]),
    O(3, { zh: '客户与物业', en: 'OWNER' }, { zh: '客户点头、物业放行 — 人才进得去' }, [
      I(3, '01', '物业手续齐全:施工准证 / 押金 / 工人登记', 'PERMIT & REGISTRATION', KEY),
      I(3, '02', '客户已确认进场日期与施工时段,同意我方进场', 'OWNER CONFIRMED SCHEDULE', KEY),
      I(3, '03', '带队人已指定,联络方式已交客户与项目经理', ''),
      W(3, '04', { zh: '带队人 / 电话' }, {
        key: 'leader',
        type: 'text',
        placeholder: '填写示例:姓名 + 联络号码',
        default: () => '',
      }),
    ]),
    O(4, { zh: '运输安装', en: 'OPERATE' }, { zh: '橱柜运得进来、完好到场,师傅安排到位' }, [
      I(4, '01', '货梯已预约,轿厢尺寸与载重装得下最大板件', 'LIFT BOOKED & FITS LARGEST PANEL', KEY),
      I(4, '02', '门洞 / 走廊 / 转角可搬运,卸货区已安排', ''),
      I(4, '03', '师傅人数与进场日期已确认,符合授权施工时段', 'CREW & SCHEDULE CONFIRMED', KEY),
      I(4, '04', '到货数量与装箱单核对无误,外观无破损受潮', 'COUNT & CONDITION VERIFIED', KEY_MEDIA),
      W(4, '05', { zh: '搬运动线' }, {
        key: 'route',
        type: 'textarea',
        placeholder: '填写示例:例: B2 卸货 → 货梯 → 18F → 客厅堆放区',
      }),
    ]),
    O(5, { zh: '开场就位', en: 'OPEN' }, { zh: '铺开场地:保护、按图分区落位、垃圾车 — 师傅一到就能开工' }, [
      I(5, '01', '保护垫覆盖全段搬运动线,货梯与公共区已保护', 'PROTECTION LAID', KEY_MEDIA),
      I(5, '02', '物料按 Floor Plan 分区贴标 (厨房 / 卧室 / 客厅),大件不挡通道', 'STAGED PER FLOOR PLAN', KEY),
      I(5, '03', '易碎品 (玻璃 / 镜面 / 石材) 单独放置,清晰标记', 'FRAGILE MARKED', KEY),
      I(5, '04', '垃圾桶 / 垃圾车已安排,清运方式已确认,每日收工清场已交代工人', 'WASTE PLAN IN PLACE'),
    ]),
    // 系统统计 + 建议放在签核判定之前，方便现场主管 / 项目经理对照
    { id: 'summary', type: 'summary' },
    {
      // 原表序号就是 01、04（中间跳号），照抄
      id: 'decision',
      type: 'checklist',
      title: { zh: '签核', en: 'SIGN-OFF' },
      note: { zh: '判定 → 签名' },
      scale,
      resultLayout: 'inline',
      remark,
      items: [
        { id: DECISION_ID, no: '01', title: { zh: '开工判定', en: 'GO / NO-GO DECISION' }, scale: GONOGO },
        W('s', '04', { zh: '备注 / 整改责任人与期限' }, {
          key: 'remarks',
          type: 'textarea',
          placeholder: '填写示例:事项 / 负责人 / 完成期限',
        }),
      ],
    },
    {
      id: 'rule',
      type: 'note',
      tone: 'warn',
      title: { zh: '开工判定', en: 'GO / NO-GO DECISION' },
      lines: [
        { zh: 'GO 可开工     全部关键项通过、无未结异常。' },
        { zh: '有条件开工     关键项通过,一般异常已列明责任人与期限,不影响安装。' },
        { zh: 'NO-GO 暂停进场     有关键项不通过。整改并复核通过后才可进场。' },
        { zh: '规则:任一关键项(★)判定为「否 Fail」,一律不得开工。现场主管无权放行,须由项目经理复核。' },
      ],
    },
    {
      id: 'signoff',
      type: 'signatures',
      roles: [
        { id: 'supervisor', zh: '现场主管', en: 'SITE SUPERVISOR', bind: 'settings.name' },
        { id: 'pm', zh: '项目经理 / 店长复核', en: 'PROJECT MANAGER' },
      ],
    },
  ],
  // 结果统计：每个 O 的是 / 否 + 关键项 + 系统建议（GO / 有条件开工 / NO-GO）
  summary(ctx) {
    const a = audit(ctx);
    const items = O_IDS.map((id) => {
      const s = ctx.template.sections.find((x) => x.id === id);
      const c = countResults(ctx, id);
      const parts = [`是 ${c.P || 0}`, `否 ${c.F || 0}`];
      if (c.NA) parts.push(`不适用 ${c.NA}`);
      if (c._empty) parts.push(`未填 ${c._empty}`);
      const tone = c._keyFail ? 'fail' : c.F ? 'warn' : c._empty ? 'neutral' : 'pass';
      return { label: { zh: `${s.no} ${s.title.zh}`, en: s.title.en }, value: parts.join(' · '), tone };
    });
    items.push({
      label: { zh: '★ 关键项通过', en: 'Key items passed' },
      value: `${a.keyPass} / ${a.keyTotal}`,
      tone: a.keyPass === a.keyTotal ? 'pass' : 'neutral',
    });
    items.push({
      label: { zh: '★ 关键项不通过', en: 'Key items failed' },
      value: `${a.keyFails.length} 项 items`,
      tone: a.keyFails.length ? 'fail' : 'neutral',
    });
    const d = ctx.report?.items?.[DECISION_ID]?.r;
    const dOpt = GONOGO.options.find((o) => o.v === d);
    items.push({
      label: { zh: '开工判定（已选）', en: 'Decision' },
      value: dOpt ? DECISION_TEXT[d] : '未选择 Not selected',
      tone: dOpt ? dOpt.tone : 'warn',
    });

    // 系统建议：任一 ★ 否 → NO-GO；关键项未判定完 → 未完成；一般项有否 → 有条件开工；否则 GO
    const refs = (list) => list.map((f) => ref(f.section, f.item)).join('、');
    let conclusion;
    if (a.keyFails.length) {
      conclusion = { value: 'NO-GO 暂停进场', tone: 'fail', note: `有关键项不通过。整改并复核通过后才可进场。（${refs(a.keyFails)}）` };
    } else if (a.keyDone < a.keyTotal) {
      conclusion = { value: '未完成', tone: 'warn', note: `还有 ${a.keyTotal - a.keyDone} 个关键项(★)未判定` };
    } else if (a.generalFails.length) {
      conclusion = { value: '有条件开工', tone: 'warn', note: `一般异常 ${a.generalFails.length} 项（${refs(a.generalFails)}），须列明责任人与期限,不影响安装` };
    } else {
      const rest = a.empty ? `（另有 ${a.empty} 个一般项未判定）` : '';
      conclusion = { value: 'GO 可开工', tone: 'pass', note: `全部关键项通过、无未结异常。${rest}` };
    }
    return {
      title: { zh: '结果统计', en: 'Summary' },
      items,
      conclusion: { label: { zh: '系统建议', en: 'Suggested' }, ...conclusion },
    };
  },
  // 导出前提醒：判定与 ★ 结果矛盾、未判定、有条件开工未列责任人、未经项目经理复核
  checks(ctx) {
    const out = [];
    const a = audit(ctx);
    const items = ctx.report?.items || {};
    const d = items[DECISION_ID]?.r;
    if (!d) {
      out.push('未选择开工判定（GO / 有条件开工 / NO-GO）');
      return out;
    }
    if (d === 'GO' && a.keyFails.length) out.push('有关键项不通过，不能判定 GO');
    if (d === 'COND' && a.keyFails.length) out.push('有关键项不通过，不能判定「有条件开工」');
    if ((d === 'GO' || d === 'COND') && !a.keyFails.length && a.keyDone < a.keyTotal) {
      out.push(`还有 ${a.keyTotal - a.keyDone} 个关键项(★)未判定，不能放行`);
    }
    if (d === 'GO' && !a.keyFails.length && a.generalFails.length) {
      out.push(`有 ${a.generalFails.length} 项一般异常未结，应判定「有条件开工」`);
    }
    if (d === 'COND' && !String(items[REMARK_ID]?.value || '').trim()) {
      out.push('有条件开工须在「备注 / 整改责任人与期限」列明事项 / 负责人 / 完成期限');
    }
    if (d === 'GO' || d === 'COND') {
      const pm = ctx.report?.signatures?.pm;
      if (!pm || (!String(pm.name || '').trim() && !pm.image)) out.push('现场主管无权放行，须由项目经理复核签名');
    }
    return out;
  },
  filename(ctx) {
    const v = ctx.report?.values || {};
    return ['场前审核', v.client, v.date].filter(Boolean).join('_');
  },
};
