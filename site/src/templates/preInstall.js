// 场前审核表 PRE-INSTALLATION SITE AUDIT（V-SMOOTH · 5O）
// 来源：Pre-installation Site Checklist（场前审核表）.docx —— 5O 五步：订单 · 现场 · 客户 · 运输 · 开场
// 原文逐字照抄（含半角 , : 标点）；★ = 关键项，【影像】= 需拍照或录影存档
// 原表大多只有中文：每个标签另配 enOnly（纯英文文件用；中文 / 双语文件不显示，与原表一致）
import { countResults, keyFails, allFails, langOf, say, plural, fileName, siteLabelIn } from './helpers.js';
import { fmtDate } from '../lib/format.js';
import { reportLang } from '../lib/lang.js';

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

// 判定显示文字（与原表一致）；纯英文文件用 DECISION_EN
const DECISION_TEXT = { GO: 'GO 可开工', COND: '有条件开工', NOGO: 'NO-GO 暂停进场' };
const DECISION_EN = { GO: 'GO — Cleared to start', COND: 'Conditional start', NOGO: 'NO-GO — Entry on hold' };
const DECISION_ID = 'pis_01';
const REMARK_ID = 'pis_04';

const remark = { label: { zh: '异常说明 / 整改责任人', en: 'Remarks / PIC' }, requiredWhen: ['F'] };

const KEY = { key: true };
const KEY_MEDIA = { key: true, media: true };

// 判定项：id = pi{节}_{原表序号}；原表无英文行的项目只有 zh。
// enOnly = 纯英文文件里的整句（原表英文行只是大写短标题，单独看意思不全）
const I = (sec, no, zh, en, enOnly, flags = {}) => ({
  id: `pi${sec}_${no}`,
  no,
  title: en ? { zh, en, enOnly } : { zh, enOnly },
  ...flags,
});

// 填写项（差异 / 视频链接 / 带队人 / 搬运动线 / 备注）：placeholder = 原表「填写示例」
// placeholder 只在 App 输入框里显示（不进文件）：{ zh, en } 跟界面语言
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

/**
 * 「进场日期 · 天数」自动带入的写法按文件语言显示：English「2026-10-08 · 5 days」，中文 / 双语「2026-10-08 · 5 天」。
 * 只换这两种自动写法，自己写的照原样。
 */
function entryShown(v, ctx) {
  if (typeof v !== 'string') return v;
  if (langOf(ctx) === 'en') {
    const m = /^(\d{4}-\d{2}-\d{2}) · (\d+) 天$/.exec(v.trim());
    return m ? `${m[1]} · ${plural(Number(m[2]), 'day')}` : v;
  }
  const m = /^(\d{4}-\d{2}-\d{2}) · (\d+) days?$/.exec(v.trim());
  return m ? `${m[1]} · ${m[2]} 天` : v;
}

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
  // 首页卡片一句话（只在 App 界面显示，跟界面语言）
  desc: { zh: '5O 五步核查 · ★ 关键项不过不得开工', en: '5O five-step check · No start if any ★ key item fails' },
  icon: 'ClipboardList',
  accent: '#AE4E37',
  doc: {
    brand: 'vsmooth',
    kicker: 'V-SMOOTH  ·  5O',
    title: { zh: '场前审核表', en: 'Pre-Installation Site Audit' },
    // 原表副标题两行都是中文（第二行占了 en 的位置）：单语文件各给一行完整的
    subtitle: {
      zh: '按 5O 五步核查:订单 · 现场 · 客户 · 运输 · 开场',
      en: '现场主管填写,项目经理复核',
      zhOnly: '按 5O 五步核查:订单 · 现场 · 客户 · 运输 · 开场；现场主管填写,项目经理复核',
      enOnly: '5O check: Order · Onsite · Owner · Operate · Open — filled by site supervisor, reviewed by PM',
    },
    legend: '图例:  ★ = 关键项,不通过则不得开工     【影像】= 需拍照或录影存档',
    footer: '本表未完成、未判定「可开工」,不得安排送装。',
    // 纯英文文件的图例 / 页脚（原表只有中文）
    enOnly: {
      legend: 'Legend:  ★ = Key item, work must not start if it fails     PHOTO = Photo / video record required',
      footer: 'Do not schedule delivery or installation until this form is complete and the decision is "GO".',
    },
  },
  sections: [
    {
      // 原表抬头三行两列
      id: 'info',
      type: 'fields',
      columns: 2,
      fields: [
        { key: 'client', type: 'text', label: { zh: '项目 / 客户', enOnly: 'Project / Client' }, bind: 'project.siteLabel', required: true, display: siteLabelIn },
        { key: 'address', type: 'text', label: { zh: '地址 / 单位', enOnly: 'Address / Unit' }, bind: 'project.address' },
        { key: 'date', type: 'date', label: { zh: '审核日期', enOnly: 'Audit date' }, bind: 'today', required: true },
        {
          key: 'supervisor',
          type: 'text',
          label: { zh: '现场主管 / 电话', enOnly: 'Site supervisor / Phone' },
          default: (ctx) => [ctx.settings?.name, ctx.settings?.phone].filter(Boolean).join(' '),
        },
        {
          key: 'entry',
          type: 'text',
          label: { zh: '进场日期 · 天数', enOnly: 'Entry date · Days' },
          placeholder: { zh: '例：2026-10-08 · 5 天', en: 'e.g. 2026-10-08 · 5 days' },
          // 项目有开工日期 / 预计天数时自动带入：2026-10-08 · 5 天（默认文件语言是 English 时写 5 days）
          default: (ctx) => {
            const p = ctx.project;
            if (!p?.startDate) return '';
            const n = p.plannedDays;
            const days = n ? (reportLang(ctx.report, ctx.settings) === 'en' ? plural(n, 'day') : `${n} 天`) : '';
            return [fmtDate(p.startDate), days].filter(Boolean).join(' · ');
          },
          display: entryShown,
        },
        { key: 'hours', type: 'text', label: { zh: '授权施工时段', enOnly: 'Permitted working hours' }, placeholder: { zh: '例：9:00–17:00', en: 'e.g. 9:00–17:00' } },
      ],
    },
    O(1, { zh: '订单就位', en: 'ORDER' }, {
      zh: '钱和图 — 尾款没到、图纸不是最新版,一律不安排送装',
      enOnly: 'Money & drawings — no delivery or installation until the final payment is in and the drawings are the latest version',
    }, [
      I(1, '01', '尾款已到账,可安排送装', 'FINAL PAYMENT RECEIVED',
        'Final payment received; delivery & installation can be scheduled', KEY),
      I(1, '02', '客户回签的最新深化图已在手,现场以此版为准', 'LATEST SIGNED DRAWINGS ON HAND',
        'Latest client-signed shop drawings on hand; the site follows this version', KEY),
    ]),
    O(2, { zh: '现场核查', en: 'ONSITE' }, {
      zh: '硬装的落地 + 场地整洁 + 一支视频把全屋硬装状况拍进去',
      enOnly: 'Renovation works completed + clean site + one video capturing the condition of the whole unit',
    }, [
      I(2, '01', '硬装已全部完成,复尺后现场无改动 (贴砖 / 油漆 / 门槛 / 管线点位都没动)', 'HARDSCAPE DONE, NO CHANGES',
        'All renovation works completed; no site changes since final measurement (tiling / painting / door sills / M&E points untouched)', KEY),
      I(2, '02', '电位 / 水位抽查:与图纸一致,不被柜体挡住', 'M&E SPOT-CHECK VS DRAWINGS',
        'Power / water points spot-checked: match the drawings and not blocked by cabinets', KEY),
      I(2, '03', '现场干净干燥,可直接施工 (无渗水返潮、无杂物堆积)', 'CLEAN, DRY, WORKABLE',
        'Site clean and dry, ready to work (no leaks or damp, no clutter)', KEY),
      I(2, '04', '临时水电可用,够师傅施工', '',
        'Temporary water & power available and sufficient for the crew', KEY),
      W(2, '05', { zh: '差异 / 未完成事项', enOnly: 'Discrepancies / outstanding items' }, {
        key: 'diffs',
        optional: true, // 没有差异时留空即可
        type: 'textarea',
        placeholder: { zh: '填写示例:哪里 / 差什么 / 谁负责 / 几时好', en: 'e.g. Where / what is outstanding / who is responsible / when done' },
      }),
      W(2, '06', { zh: '进场视频链接', en: 'VIDEO LINK', enOnly: 'Site video link' }, {
        key: 'videoLink',
        type: 'url',
        placeholder: { zh: '填写示例:Google Drive / Dropbox 链接', en: 'e.g. Google Drive / Dropbox link' },
      }),
      I(2, '07', '全屋一镜到底:每个房间从门口慢慢转一圈,边拍边报房间名', 'EVERY ROOM, ONE CONTINUOUS TAKE',
        'Whole unit in one continuous take: in every room, pan slowly from the doorway and call out the room name', KEY_MEDIA),
      I(2, '08', '要装柜的墙面全部拍清楚:墙面、地面、天花交界看得到', 'ALL CABINET WALLS CAPTURED',
        'Every cabinet wall filmed clearly, with the wall / floor / ceiling junctions visible', KEY_MEDIA),
      I(2, '09', '电位 / 水位逐个特写,拍到位置与高度 (用卷尺或手掌作参照)', 'M&E POINTS CLOSE-UP',
        'Close-up of every power / water point showing position and height (tape or hand for scale)', KEY_MEDIA),
      I(2, '10', '既有缺陷、梁 / 管 / 消防等凸出物已拍到特写 (免责存证)', 'DEFECTS & OBSTRUCTIONS',
        'Close-ups of existing defects and protrusions such as beams / pipes / fire services (liability record)', KEY_MEDIA),
    ]),
    O(3, { zh: '客户与物业', en: 'OWNER' }, {
      zh: '客户点头、物业放行 — 人才进得去',
      enOnly: 'Client agrees, management approves — only then can the crew get in',
    }, [
      I(3, '01', '物业手续齐全:施工准证 / 押金 / 工人登记', 'PERMIT & REGISTRATION',
        'Management paperwork complete: work permit / deposit / worker registration', KEY),
      I(3, '02', '客户已确认进场日期与施工时段,同意我方进场', 'OWNER CONFIRMED SCHEDULE',
        'Client has confirmed the entry date and working hours and agreed to our entry', KEY),
      I(3, '03', '带队人已指定,联络方式已交客户与项目经理', '',
        'Team leader assigned; contact details given to the client and the project manager'),
      W(3, '04', { zh: '带队人 / 电话', enOnly: 'Team leader / Phone' }, {
        key: 'leader',
        type: 'text',
        placeholder: { zh: '填写示例:姓名 + 联络号码', en: 'e.g. Name + contact number' },
        default: () => '',
      }),
    ]),
    O(4, { zh: '运输安装', en: 'OPERATE' }, {
      zh: '橱柜运得进来、完好到场,师傅安排到位',
      enOnly: 'Cabinets can be brought in and arrive intact; crew arranged',
    }, [
      I(4, '01', '货梯已预约,轿厢尺寸与载重装得下最大板件', 'LIFT BOOKED & FITS LARGEST PANEL',
        'Service lift booked; car size and load capacity fit the largest panel', KEY),
      I(4, '02', '门洞 / 走廊 / 转角可搬运,卸货区已安排', '',
        'Doorways / corridors / corners clear for carrying; unloading area arranged'),
      I(4, '03', '师傅人数与进场日期已确认,符合授权施工时段', 'CREW & SCHEDULE CONFIRMED',
        'Crew size and entry date confirmed, within the permitted working hours', KEY),
      I(4, '04', '到货数量与装箱单核对无误,外观无破损受潮', 'COUNT & CONDITION VERIFIED',
        'Delivered quantity matches the packing list; no damage or moisture', KEY_MEDIA),
      W(4, '05', { zh: '搬运动线', enOnly: 'Carrying route' }, {
        key: 'route',
        type: 'textarea',
        placeholder: { zh: '填写示例:例: B2 卸货 → 货梯 → 18F → 客厅堆放区', en: 'e.g. Unload at B2 → service lift → 18F → living room staging area' },
      }),
    ]),
    O(5, { zh: '开场就位', en: 'OPEN' }, {
      zh: '铺开场地:保护、按图分区落位、垃圾车 — 师傅一到就能开工',
      enOnly: 'Set up the site: protection, zoned staging per drawings, rubbish bins — the crew can start on arrival',
    }, [
      I(5, '01', '保护垫覆盖全段搬运动线,货梯与公共区已保护', 'PROTECTION LAID',
        'Protection mats cover the whole carrying route; lift and common areas protected', KEY_MEDIA),
      I(5, '02', '物料按 Floor Plan 分区贴标 (厨房 / 卧室 / 客厅),大件不挡通道', 'STAGED PER FLOOR PLAN',
        'Materials labelled and zoned per the floor plan (kitchen / bedroom / living); large items not blocking walkways', KEY),
      I(5, '03', '易碎品 (玻璃 / 镜面 / 石材) 单独放置,清晰标记', 'FRAGILE MARKED',
        'Fragile items (glass / mirrors / stone) stored separately and clearly marked', KEY),
      I(5, '04', '垃圾桶 / 垃圾车已安排,清运方式已确认,每日收工清场已交代工人', 'WASTE PLAN IN PLACE',
        'Bins / rubbish cart arranged, disposal confirmed, crew briefed to clear up at the end of each day'),
    ]),
    // 系统统计 + 建议放在签核判定之前，方便现场主管 / 项目经理对照
    { id: 'summary', type: 'summary' },
    {
      // 原表序号就是 01、04（中间跳号），照抄
      id: 'decision',
      type: 'checklist',
      title: { zh: '签核', en: 'SIGN-OFF' },
      note: { zh: '判定 → 签名', enOnly: 'Decide → sign' },
      scale,
      resultLayout: 'inline',
      remark,
      items: [
        { id: DECISION_ID, no: '01', title: { zh: '开工判定', en: 'GO / NO-GO DECISION', enOnly: 'GO / NO-GO decision' }, scale: GONOGO },
        W('s', '04', { zh: '备注 / 整改责任人与期限', enOnly: 'Remarks / person in charge & deadline' }, {
          key: 'remarks',
          optional: true, // 只有「有条件开工」时必填（见 checks）
          type: 'textarea',
          placeholder: { zh: '填写示例:事项 / 负责人 / 完成期限', en: 'e.g. Issue / person in charge / deadline' },
        }),
      ],
    },
    {
      id: 'rule',
      type: 'note',
      tone: 'warn',
      title: { zh: '开工判定', en: 'GO / NO-GO DECISION' },
      lines: [
        { zh: 'GO 可开工     全部关键项通过、无未结异常。', enOnly: 'GO — Cleared to start     All key items passed; no open issues.' },
        {
          zh: '有条件开工     关键项通过,一般异常已列明责任人与期限,不影响安装。',
          enOnly: 'Conditional start     Key items passed; general issues listed with person in charge and deadline, not affecting installation.',
        },
        {
          zh: 'NO-GO 暂停进场     有关键项不通过。整改并复核通过后才可进场。',
          enOnly: 'NO-GO — Entry on hold     A key item failed. Entry only after rectification and a passed re-check.',
        },
        {
          zh: '规则:任一关键项(★)判定为「否 Fail」,一律不得开工。现场主管无权放行,须由项目经理复核。',
          zhOnly: '规则:任一关键项(★)判定为「否」,一律不得开工。现场主管无权放行,须由项目经理复核。',
          enOnly: 'Rule: if any key item (★) is marked "No / Fail", work must not start. The site supervisor cannot give clearance; the project manager must review.',
        },
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
  // 文字按文件语言：中文 / English；双语与原来逐字一致（见 helpers.say）
  summary(ctx) {
    const a = audit(ctx);
    const en = langOf(ctx) === 'en';
    const items = O_IDS.map((id) => {
      const s = ctx.template.sections.find((x) => x.id === id);
      const c = countResults(ctx, id);
      const parts = en ? [`Pass ${c.P || 0}`, `Fail ${c.F || 0}`] : [`是 ${c.P || 0}`, `否 ${c.F || 0}`];
      if (c.NA) parts.push(en ? `N.A. ${c.NA}` : `不适用 ${c.NA}`);
      if (c._empty) parts.push(en ? `Unanswered ${c._empty}` : `未填 ${c._empty}`);
      const tone = c._keyFail ? 'fail' : c.F ? 'warn' : c._empty ? 'neutral' : 'pass';
      return { label: { zh: `${s.no} ${s.title.zh}`, en: s.title.en, enOnly: `${s.no} ${s.title.en}` }, value: parts.join(' · '), tone };
    });
    items.push({
      label: { zh: '★ 关键项通过', en: 'Key items passed', enOnly: '★ Key items passed' },
      value: `${a.keyPass} / ${a.keyTotal}`,
      tone: a.keyPass === a.keyTotal ? 'pass' : 'neutral',
    });
    items.push({
      label: { zh: '★ 关键项不通过', en: 'Key items failed', enOnly: '★ Key items failed' },
      value: say(ctx, `${a.keyFails.length} 项`, plural(a.keyFails.length, 'item'), `${a.keyFails.length} 项 items`),
      tone: a.keyFails.length ? 'fail' : 'neutral',
    });
    const d = ctx.report?.items?.[DECISION_ID]?.r;
    const dOpt = GONOGO.options.find((o) => o.v === d);
    items.push({
      label: { zh: '开工判定（已选）', en: 'Decision', enOnly: 'Decision (selected)' },
      value: dOpt ? (en ? DECISION_EN[d] : DECISION_TEXT[d]) : say(ctx, '未选择', 'Not selected'),
      tone: dOpt ? dOpt.tone : 'warn',
    });

    // 系统建议：任一 ★ 否 → NO-GO；关键项未判定完 → 未完成；一般项有否 → 有条件开工；否则 GO
    // 双语沿用原来的中文结论（DECISION_TEXT 本身已带 GO / NO-GO）
    const refs = (list) => list.map((f) => ref(f.section, f.item)).join(en ? ', ' : '、');
    let conclusion;
    if (a.keyFails.length) {
      conclusion = en
        ? { value: DECISION_EN.NOGO, tone: 'fail', note: `A key item failed. Entry only after rectification and a passed re-check. (${refs(a.keyFails)})` }
        : { value: 'NO-GO 暂停进场', tone: 'fail', note: `有关键项不通过。整改并复核通过后才可进场。（${refs(a.keyFails)}）` };
    } else if (a.keyDone < a.keyTotal) {
      const n = a.keyTotal - a.keyDone;
      conclusion = en
        ? { value: 'Incomplete', tone: 'warn', note: `${plural(n, 'key item')} (★) not yet checked` }
        : { value: '未完成', tone: 'warn', note: `还有 ${n} 个关键项(★)未判定` };
    } else if (a.generalFails.length) {
      const n = a.generalFails.length;
      conclusion = en
        ? { value: DECISION_EN.COND, tone: 'warn', note: `${plural(n, 'general issue')} (${refs(a.generalFails)}): list the person in charge and deadline; installation not affected` }
        : { value: '有条件开工', tone: 'warn', note: `一般异常 ${n} 项（${refs(a.generalFails)}），须列明责任人与期限,不影响安装` };
    } else {
      const rest = a.empty ? (en ? ` (${plural(a.empty, 'general item')} not yet checked)` : `（另有 ${a.empty} 个一般项未判定）`) : '';
      conclusion = en
        ? { value: DECISION_EN.GO, tone: 'pass', note: `All key items passed; no open issues.${rest}` }
        : { value: 'GO 可开工', tone: 'pass', note: `全部关键项通过、无未结异常。${rest}` };
    }
    return {
      title: { zh: '结果统计', en: 'Summary' },
      items,
      conclusion: { label: { zh: '系统建议', en: 'Suggested', enOnly: 'Suggested decision' }, ...conclusion },
    };
  },
  // 导出前提醒：判定与 ★ 结果矛盾、未判定、有条件开工未列责任人、未经项目经理复核
  // 提醒文字跟界面语言（ctx.lang）；中英时与通用提醒一样「中文 / English」
  checks(ctx) {
    const out = [];
    const tt = (zh, en) => ctx.t(zh, en, ' / ');
    const a = audit(ctx);
    const items = ctx.report?.items || {};
    const d = items[DECISION_ID]?.r;
    if (!d) {
      out.push({ text: tt('未选择开工判定（GO / 有条件开工 / NO-GO）', 'No start decision selected (GO / Conditional / NO-GO)'), target: DECISION_ID });
      return out;
    }
    if (d === 'GO' && a.keyFails.length) out.push({ text: tt('有关键项不通过，不能判定 GO', 'A key item failed — cannot choose GO'), target: DECISION_ID });
    if (d === 'COND' && a.keyFails.length) {
      out.push({ text: tt('有关键项不通过，不能判定「有条件开工」', 'A key item failed — cannot choose "Conditional"'), target: DECISION_ID });
    }
    if ((d === 'GO' || d === 'COND') && !a.keyFails.length && a.keyDone < a.keyTotal) {
      const n = a.keyTotal - a.keyDone;
      out.push(tt(`还有 ${n} 个关键项(★)未判定，不能放行`, `${plural(n, 'key item')} (★) not checked yet — cannot give clearance`));
    }
    if (d === 'GO' && !a.keyFails.length && a.generalFails.length) {
      const n = a.generalFails.length;
      out.push(tt(`有 ${n} 项一般异常未结，应判定「有条件开工」`, `${plural(n, 'general issue')} still open — choose "Conditional"`));
    }
    if (d === 'COND' && !String(items[REMARK_ID]?.value || '').trim()) {
      out.push({
        text: tt(
          '有条件开工须在「备注 / 整改责任人与期限」列明事项 / 负责人 / 完成期限',
          'Conditional start: list the issue / person in charge / deadline under "Remarks / person in charge & deadline"',
        ),
        target: 'pis_04',
      });
    }
    if (d === 'GO' || d === 'COND') {
      const pm = ctx.report?.signatures?.pm;
      if (!pm || (!String(pm.name || '').trim() && !pm.image)) {
        out.push({
          text: tt('现场主管无权放行，须由项目经理复核签名', 'The site supervisor cannot give clearance — the project manager must review and sign'),
          sectionId: 'signoff',
        });
      }
    }
    return out;
  },
  filename(ctx) {
    const v = ctx.report?.values || {};
    return fileName(ctx, '场前审核', 'Pre-Install_Audit', v.client, v.date);
  },
};
