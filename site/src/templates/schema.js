// ============================================================
// 报告模板契约 TEMPLATE CONTRACT
// ------------------------------------------------------------
// 每份报告 = 一个纯数据模板（本目录下一个文件）。表单页、PDF、Word、
// Excel、WhatsApp 文案全部由同一份模板 + 同一份填报数据生成，
// 改模板 = 所有输出一起改。
//
// Template = {
//   id: 'quality-check',            // 唯一，存进报告里，发布后不要改
//   version: 1,
//   kind: 'checklist' | 'message',  // message = 以 WhatsApp 文案为主（进场通知 / 每日汇报）
//   name: { zh, en },               // 选择页卡片标题
//   short: 'QC',                    // 卡片角标（2–4 字符）
//   desc: { zh, en },               // 首页卡片一句话（只在 App 界面显示，跟界面语言，见下「界面语言」）
//   icon: 'ClipboardCheck',         // lucide-react 图标名，见 components/ui/Icon.jsx
//   accent: '#B5623A',              // 卡片 / 文档强调色
//   stage: 1..7,                    // 项目流程顺序（选择页排序）
//   doc: {
//     brand: 'sail' | 'vsmooth' | 'plain',  // 文档抬头样式
//     badge?: { zh, en },           // 右上角标签，如 INTERNAL · 内部文件
//     kicker?: string,              // 标题上方小字，如 'V-SMOOTH · 5O'
//     title: { zh, en },
//     subtitle?: { zh, en },
//     intro?: [{ zh, en }],         // 抬头下的说明段落（目标 / 规则）
//     legend?: string,              // 图例一行
//     footer?: string,              // 末页页脚
//     zhOnly?: { kicker?, legend?, footer? },  // 纯中文 / 纯英文文件改用的整行文字（见下「文件语言」）
//     enOnly?: { kicker?, legend?, footer? },
//   },
//   sections: Section[],
//   summary?: (ctx) => SummaryBlock | null,  // 文档末尾自动统计 / 结论
//   checks?: (ctx) => (string | { text, sectionId?, target? })[],  // 额外的填写提醒（编辑 / 导出页），跟界面语言
//   text?: (ctx) => string,                  // WhatsApp 文案；无则用通用摘要
//   filename?: (ctx) => string,              // 导出文件名（不含扩展名）
// }
//
// 文件语言（lib/lang.js）：生成的文件可选 中文 'zh' / English 'en' / 中英 'both'（默认，= 原来的双语）。
// 只换固定文字，用户填写的内容原样输出。
//   - 所有 { zh, en } 标签（标题、说明、字段、检查项、选项、签名、声明、备注行…）由文档模型自动取对应语言。
//   - 单语覆盖：任何标签都可以再带 zhOnly / enOnly —— 纯中文 / 纯英文文件改用这段文字，双语文件照旧
//     显示 zh / en。用于：原表只有中文的标签（补 enOnly，如场前审核表）；中英写在同一行的文字
//     （zh = 原文整行，另给 zhOnly / enOnly，如终检整改图例）；英文行其实是中文的徽章 / 副标题。
//     选项同理：{ v: '鞋柜', zh: '鞋柜', enOnly: 'Shoe cabinet' }（存的值 v 不变，旧报告照样认得）。
//   - doc.kicker / legend / footer 是整行字符串（渲染器原样打印），单语版本放 doc.zhOnly / doc.enOnly。
//   - summary / filename / text 拿到 ctx.lang 与 ctx.t(zh, en)；拼出来的数量 / 结论用 helpers.say(ctx, zh, en, both)，
//     both 给原来的写法（如 '3 项 items'）保证双语输出逐字不变；文件名用 helpers.fileName(ctx, 中文前缀, 英文前缀, …)。
//   - WhatsApp 文案：中文 = 原文，English = 同结构的英文版，中英 = 原来的文案（逐字不变；不选语言时就是它）。
//   - 字段 display(value, ctx, field)：存的值在文件 / 文案里怎么显示（文档模型和 text() 都按它）。只用来把
//     「新建时自动带入的固定文字」换成文件语言 —— 默认规定 / 默认物料（helpers.defaultTextIn）、预计工期、
//     进场天数、工地称呼的全角括号（helpers.siteLabelIn）、落款「安装部」（helpers.deptIn）；只换与自动值
//     完全相同的，用户写 / 改过的照原样；中文 / 双语 = 中文写法（与改版前一致）。存的值不变（「照这份再写一份」
//     照样保留改过的内容，导出页换语言也立即生效）。
//
// 界面语言（lib/i18n.js，settings.uiLang：App 界面 中文 / English / 中英；和上面的文件语言是两个设置）。
// 表单页、首页卡片、填写提醒跟界面语言；生成的文件仍只跟文件语言。
//   - 界面取字（uiLabel / uiText / uiOption）：中文 = zhOnly || zh；English = enOnly || en || zh；
//     中英 = 中文主行 + 英文小字（与原来的双语界面一样）。所以 App 里显示的每段文字都要有英文，English 界面才完整：
//   - 只在 App 里显示、文件不读的文字写成 { zh, en }（字符串 = 只有中文）：template.desc、字段 placeholder / hint、
//     表格 addLabel、选择页分组的 hint（index.js GROUPS）。新加这类属性前先确认 lib/docmodel.js、lib/text.js、
//     lib/export/*、components/doc/* 不读它；文件也读的就保持原来的形状。
//   - 文件也用的标签（字段 / 检查项 / 选项 / 节标题 / 签名…）原表只有中文时补 enOnly，不要补 en：补 en 会改变双语文件；
//     enOnly 同时就是 English 界面显示的文字。选项同理 { v, zh, enOnly }，存的值 v 不变。
//   - checks(ctx)：issues() 传进来的 ctx.lang = 界面语言，提醒写成 ctx.t('中文原文', 'English', ' / ')
//     （中文界面与原文逐字一致；中英 =「中文 / English」，与通用提醒一致）。
//   - summary(ctx) 在文件里按文件语言；编辑页的统计卡片用界面语言调用它。text / filename 只按文件语言。
//   - 字段 display：English 界面的输入框也按它显示自动带入的固定文字（components/fields/FieldInput.jsx uiShownValue），
//     存的值不变。
//
// Section（type 决定渲染方式）:
//   { id, type: 'fields', no?, title?, note?, fields: Field[], columns?: 1|2|3,
//       layout?: 'grid' | 'list' }   // 默认 checklist 模板用 grid，message 模板用 list
//   { id, type: 'checklist', no?, title, note?, scale: Scale | SCALE key,
//       resultLayout?: 'columns' | 'inline',   // columns = 每个选项一列打勾（Pass | Fail）
//       showStandard?: bool, showMethod?: bool,
//       remark?: { label: {zh,en}, requiredWhen?: ['F'] },
//       items: Item[] }
//   { id, type: 'table', no?, title, note?, columns: Field[], minRows?: number,
//       maxRows?: number, addLabel?: {zh,en} | string, emptyText?: {zh,en},   // addLabel 只在 App 里显示
//       photos?: { label:{zh,en} }                      // 每行一组照片 → row.photos
//       photoSlots?: [{ key, label:{zh,en} }],          // 每行多组照片 → row[key]（如 before / after）
//       seedFromFails?: true }                          // 编辑页出现「从不合格项生成」按钮
//   { id, type: 'summary' }   // 可选：template.summary() 的摆放位置（默认在签名前）
//   { id, type: 'signatures', title?, declaration?: {zh,en}, roles: [{ id, zh, en, bind? }] }
//   { id, type: 'note', title?, tone?: 'info'|'warn', lines: [{ zh, en }] }
//
// Item（检查项）:
//   { id, no: '01', title: {zh,en}, desc?: {zh,en}, method?: {zh,en},
//     key?: true,        // ★ 关键项 / 必查项
//     media?: true,      // 【影像】需拍照 / 录影存档
//     input?: Field,     // 该项不是判定，而是填写（如「搬运动线」）
//     scale?: Scale }    // 覆盖本节的判定选项（如「开工判定」GO / NO-GO）
//
// Field（字段）:
//   { key, type, label: {zh,en} | string, required?,
//     placeholder?: {zh,en} | string, hint?: {zh,en} | string,   // 输入框提示 / 字段下方说明：只在 App 里显示
//     options?: string[] | [{ v, zh, en?, zhOnly?, enOnly? }],   // select / radio / chips
//     multiple?: bool, allowCustom?: bool,     // chips
//     bind?: BindKey,                          // 新建时自动带入
//     default?: any | (ctx) => any,
//     display?: (value, ctx, field) => value,  // 文件里怎么显示（见上「文件语言」）
//     span?: 1|2|3,                            // 文档信息栏占几格
//     max?: number,                            // photos 上限
//     rows?: number }                          // textarea 行数
//   type: text | textarea | date | time | number | tel | url | select |
//         radio | chips | yesno | list | photos | video
//
// BindKey: 'project.name' | 'project.client' | 'project.unit' | 'project.address'
//   | 'project.so' | 'project.designer' | 'project.mapLink' | 'project.siteLabel'
//   | 'settings.name' | 'settings.phone' | 'settings.dept' | 'today'
//
// 填报数据 Report（存在本机 IndexedDB）:
//   { id, templateId, templateVersion, projectId, title, status: 'draft'|'done',
//     createdAt, updatedAt,
//     values:     { [fieldKey]: any },                       // 所有 fields 节共用
//     items:      { [itemId]: { r, note, photos: [mediaId], value } },
//     tables:     { [sectionId]: [{ ...cells, photos: [mediaId] }] },
//     signatures: { [roleId]: { name, date, image: mediaId } } }
// ============================================================

export const SCALES = {
  'pass-fail': {
    id: 'pass-fail',
    options: [
      { v: 'P', zh: '合格', en: 'Pass', tone: 'pass' },
      { v: 'F', zh: '不合格', en: 'Fail', tone: 'fail' },
    ],
  },
  'pass-fail-na': {
    id: 'pass-fail-na',
    options: [
      { v: 'P', zh: '合格', en: 'Pass', tone: 'pass' },
      { v: 'F', zh: '不合格', en: 'Fail', tone: 'fail' },
      { v: 'NA', zh: '不适用', en: 'N/A', tone: 'na' },
    ],
  },
  'yes-no-na': {
    id: 'yes-no-na',
    options: [
      { v: 'Y', zh: '是', en: 'Yes', tone: 'pass' },
      { v: 'N', zh: '否', en: 'No', tone: 'fail' },
      { v: 'NA', zh: '不适用', en: 'N/A', tone: 'na' },
    ],
  },
  done: {
    id: 'done',
    options: [{ v: 'Y', zh: '完成', en: 'Done', tone: 'pass' }],
  },
};

export const FIELD_TYPES = [
  'text', 'textarea', 'date', 'time', 'number', 'tel', 'url',
  'select', 'radio', 'chips', 'yesno', 'list', 'photos', 'video',
];

export const TONES = ['pass', 'fail', 'na', 'warn', 'neutral'];

/** 解析节 / 项上的 scale（可以是 key 或内联对象）。 */
export function resolveScale(scale) {
  if (!scale) return SCALES['pass-fail-na'];
  if (typeof scale === 'string') return SCALES[scale] || SCALES['pass-fail-na'];
  return scale;
}

/** 双语文本 → 单个字符串。label 可以是字符串或 {zh,en}。 */
export function L(label, mode = 'both', sep = ' ') {
  if (label == null) return '';
  if (typeof label === 'string') return label;
  const zh = label.zh || '';
  const en = label.en || '';
  if (mode === 'zh') return zh || en;
  if (mode === 'en') return en || zh;
  if (!zh) return en;
  if (!en) return zh;
  return `${zh}${sep}${en}`;
}

/** 选项统一成 { v, zh, en }。 */
export function normOptions(options = []) {
  return options.map((o) => (typeof o === 'string' ? { v: o, zh: o } : o));
}

/** 找出模板里所有字段（fields 节），按出现顺序。 */
export function allFields(template) {
  const out = [];
  for (const s of template.sections) if (s.type === 'fields') out.push(...s.fields);
  return out;
}

/** 找出模板里所有检查项（含所在节）。 */
export function allItems(template) {
  const out = [];
  for (const s of template.sections) {
    if (s.type !== 'checklist') continue;
    for (const it of s.items) out.push({ section: s, item: it });
  }
  return out;
}
