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
//   desc: '一句话说明（中文）',
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
//   },
//   sections: Section[],
//   summary?: (ctx) => SummaryBlock | null,  // 文档末尾自动统计 / 结论
//   checks?: (ctx) => string[],              // 额外的填写提醒（导出前提示）
//   text?: (ctx) => string,                  // WhatsApp 文案；无则用通用摘要
//   filename?: (ctx) => string,              // 导出文件名（不含扩展名）
// }
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
//       maxRows?: number, addLabel?: string, emptyText?: {zh,en},
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
//   { key, type, label: {zh,en} | string, placeholder?, hint?, required?,
//     options?: string[] | [{ v, zh, en? }],   // select / radio / chips
//     multiple?: bool, allowCustom?: bool,     // chips
//     bind?: BindKey,                          // 新建时自动带入
//     default?: any | (ctx) => any,
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
