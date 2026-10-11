// 进场通知 SITE ENTRY NOTICE —— 发给 subcon：几点到、怎么进、做什么、收工前做什么
// 来源：现场主管 WhatsApp 进场通知（【进场通知】Tuai Timur Residence – Hailey 单位安装）
// 主输出 = text()（WhatsApp 文案，逐字对齐原文格式）；PDF 由文档模型通用生成。
// 文件语言：中文 = 原文；English = 同结构的英文版；中英 = 与中文版相同（原来的文案）。用户填写的内容原样输出。
import { val, langOf, optionText, fmtDateEn, fileName, shownValues, defaultTextIn } from './helpers.js';
import { addDays, fmtDateCN, fmtTime, parseISODate, toISODate } from '../lib/format.js';

const pad = (n) => String(n).padStart(2, '0');

// 🗺️ 用完整 emoji 写法（U+1F5FA U+FE0F），手机 / 浏览器都显示彩色图标
const MAP = '\u{1F5FA}️';

const RULES = [
  'Hacking 无时段限制，碎料当场装袋',
  '走廊、电梯、单位地面先铺保护垫再搬运',
  '垃圾：当天清走',
  '单位内禁烟',
  '统一着装、安全鞋',
];

const BEFORE_LEAVE = ['每柜每日进度照发群', '全场巡一遍拍视频', '关水、断电、垃圾清、锁门窗'];

const ENTRY_NOTE = 'Guard house 登记，带护照';
const PARKING = '访客停车场';
const MATERIALS = '已在现场';

// 默认文字的英文：纯英文文件 / 文案里，没改过的默认行（逐行比对）换成英文；自己写 / 改过的照原样。
// 存的值仍是中文默认（「照这份再写一份」照样保留改过的规定）；换写法在生成文件时做（字段 display）。
const DEFAULT_EN = {
  'Hacking 无时段限制，碎料当场装袋': 'Hacking: no time restriction; bag debris on the spot',
  '走廊、电梯、单位地面先铺保护垫再搬运': 'Lay protection on the corridor, lift and unit floor before moving anything in',
  '垃圾：当天清走': 'Rubbish: clear on the same day',
  '单位内禁烟': 'No smoking inside the unit',
  '统一着装、安全鞋': 'Company uniform and safety shoes',
  '每柜每日进度照发群': 'Post daily progress photos of every cabinet to the group',
  '全场巡一遍拍视频': 'Walk the whole site and record a video',
  '关水、断电、垃圾清、锁门窗': 'Water off, power off, rubbish cleared, doors & windows locked',
  [ENTRY_NOTE]: 'Register at guard house with passport', // 与原文一样短：文件里仍和「停车」并排一行
  [PARKING]: 'Visitor parking',
  [MATERIALS]: 'Already on site',
};
const defaultIn = defaultTextIn(DEFAULT_EN);

// 选项：存的值仍是中文；enOnly = 纯英文文件 / 英文文案显示的文字（中文 / 双语照旧）
const OPT = (zh, enOnly) => ({ v: zh, zh, enOnly });

const WORK_TYPES = [
  OPT('单位安装', 'Unit installation'),
  OPT('柜体安装', 'Cabinet installation'),
  OPT('门板安装', 'Door panel installation'),
  OPT('台面安装', 'Countertop installation'),
  OPT('补装 / 整改', 'Touch-up / rectification'),
  OPT('维修', 'Repair'),
];

const AREAS = [
  OPT('鞋柜', 'Shoe cabinet'),
  OPT('主卧柜', 'Master bedroom wardrobe'),
  OPT('电视柜', 'TV cabinet'),
  OPT('次卧柜', 'Bedroom wardrobe'),
  OPT('厨房', 'Kitchen'),
  OPT('书柜', 'Bookshelf'),
  OPT('浴室柜', 'Bathroom vanity'),
  OPT('餐边柜', 'Sideboard'),
  OPT('衣帽间', 'Walk-in wardrobe'),
];

/** 图纸版本：'2026-09-12' → '2026.09.12'（补零，与深化图纸版本号写法一致） */
export function fmtDrawingVersion(iso) {
  const d = parseISODate(iso);
  if (!d) return String(iso || '').trim();
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

const str = (v) => (v == null ? '' : String(v).trim());
const lines = (v) => (Array.isArray(v) ? v : str(v).split('\n')).map(str).filter(Boolean);
const arr = (v) => (Array.isArray(v) ? v : str(v) ? [v] : []).map(str).filter(Boolean);

export default {
  id: 'site-notice',
  version: 1,
  kind: 'message',
  stage: 3,
  name: { zh: '进场通知', en: 'Site Entry Notice' },
  short: '进场',
  // 首页卡片一句话、输入框提示（placeholder）、字段说明（hint）只在 App 界面显示，跟界面语言：{ zh, en }
  desc: { zh: '发给 subcon：几点到、怎么进、做什么、收工前做什么', en: "For subcons: arrival time, site entry, today's tasks, before-leaving checks" },
  icon: 'Megaphone',
  accent: '#2F4A3C',
  doc: {
    brand: 'sail',
    title: { zh: '进场通知', en: 'SITE ENTRY NOTICE' },
    subtitle: { zh: '发给安装师傅 / Subcon', en: 'For installers & subcontractors' },
  },
  sections: [
    {
      id: 'basic',
      type: 'fields',
      title: { zh: '基本', en: 'BASICS' },
      layout: 'grid',
      columns: 2,
      fields: [
        { key: 'project', type: 'text', label: { zh: '项目', en: 'Project' }, bind: 'project.name', required: true, placeholder: { zh: '例：Tuai Timur Residence', en: 'e.g. Tuai Timur Residence' } },
        { key: 'client', type: 'text', label: { zh: '客户', en: 'Client' }, bind: 'project.client', placeholder: { zh: '例：Hailey', en: 'e.g. Hailey' } },
        {
          key: 'workType',
          type: 'chips',
          label: { zh: '工作内容', en: 'Work type' },
          options: WORK_TYPES,
          allowCustom: true,
          default: '单位安装',
        },
        {
          key: 'date',
          type: 'date',
          label: { zh: '日期', en: 'Date' },
          // 以「建报告那天」为准的明天：之后换项目 / 隔天再改，不会自动跳到新的明天
          default: (ctx) => addDays(ctx.report?.createdAt ? toISODate(new Date(ctx.report.createdAt)) : ctx.today, 1),
          hint: { zh: '默认明天', en: 'Defaults to tomorrow' },
        },
        { key: 'location', type: 'text', label: { zh: '地点', en: 'Location' }, bind: 'project.name', hint: { zh: '默认 = 项目名，可改成楼盘 / 栋别', en: 'Defaults to the project name; can be changed to the development / block' } },
        { key: 'unit', type: 'text', label: { zh: '单位', en: 'Unit' }, bind: 'project.unit', placeholder: { zh: '例：17-3', en: 'e.g. 17-3' } },
        { key: 'mapLink', type: 'url', label: { zh: '导航', en: 'Map link' }, bind: 'project.mapLink', placeholder: 'https://maps.app.goo.gl/…', span: 2 },
      ],
    },
    {
      id: 'time',
      type: 'fields',
      title: { zh: '时间', en: 'SCHEDULE' },
      layout: 'grid',
      columns: 3,
      fields: [
        { key: 'arrive', type: 'time', label: { zh: '到场集合', en: 'Assemble' }, default: '08:45' },
        { key: 'start', type: 'time', label: { zh: '开工', en: 'Start work' }, default: '09:00' },
        { key: 'pack', type: 'time', label: { zh: '开始收拾', en: 'Start pack-up' }, default: '16:30' },
        { key: 'leave', type: 'time', label: { zh: '离场', en: 'Leave site' }, default: '17:00' },
        { key: 'lunch', type: 'text', label: { zh: '午休', en: 'Lunch break' }, default: '12:00–13:00', placeholder: '12:00–13:00', hint: { zh: '留空 = 不写午休', en: 'Leave blank to leave out the lunch break' } },
      ],
    },
    {
      id: 'entry',
      type: 'fields',
      title: { zh: '进场', en: 'SITE ENTRY' },
      fields: [
        { key: 'entryNote', type: 'text', label: { zh: '登记', en: 'Registration' }, bind: 'project.entryNote', default: ENTRY_NOTE, display: defaultIn },
        { key: 'parking', type: 'text', label: { zh: '停车', en: 'Parking' }, bind: 'project.parking', default: PARKING, display: defaultIn },
        { key: 'picName', type: 'text', label: { zh: '现场负责人', en: 'Person in charge' }, bind: 'settings.name' },
        { key: 'picPhone', type: 'tel', label: { zh: '负责人电话', en: 'PIC phone' }, bind: 'settings.phone', placeholder: { zh: '例：016-3881819', en: 'e.g. 016-3881819' } },
      ],
    },
    {
      id: 'rules',
      type: 'fields',
      title: { zh: '施工规定', en: 'SITE RULES' },
      fields: [
        {
          key: 'rules',
          type: 'list',
          label: { zh: '施工规定', en: 'Site rules' },
          default: RULES,
          display: defaultIn,
          placeholder: { zh: '一条规定', en: 'A site rule' },
          hint: { zh: '每条一行，按物业规定增删（如 Hacking 时段）', en: 'One rule per line; add or remove to match building rules (e.g. hacking hours)' },
        },
      ],
    },
    {
      id: 'task',
      type: 'fields',
      title: { zh: '当日任务', en: "TODAY'S TASKS" },
      fields: [
        {
          key: 'areas',
          type: 'chips',
          label: { zh: '区域', en: 'Areas' },
          options: AREAS,
          multiple: true,
          allowCustom: true,
        },
        {
          key: 'drawingVersion',
          type: 'date',
          label: { zh: '深化图纸版本', en: 'Shop-drawing version' },
          hint: { zh: '按此版深化图纸施工，开工前逐柜核对位置再动工', en: "Work to this shop-drawing version; check each cabinet's position before starting" },
        },
        { key: 'materials', type: 'text', label: { zh: '物料', en: 'Materials' }, default: MATERIALS, display: defaultIn },
      ],
    },
    {
      id: 'leave',
      type: 'fields',
      title: { zh: '收工前', en: 'BEFORE LEAVING' },
      fields: [
        {
          key: 'beforeLeave',
          type: 'list',
          label: { zh: '收工前', en: 'Before leaving' },
          default: BEFORE_LEAVE,
          display: defaultIn,
          placeholder: { zh: '收工前要做的事', en: 'Something to do before leaving' },
        },
      ],
    },
    {
      id: 'extra',
      type: 'fields',
      title: { zh: '附加', en: 'EXTRAS' },
      fields: [
        {
          key: 'extra',
          type: 'textarea',
          label: { zh: '备注', en: 'Notes' },
          rows: 3,
          placeholder: { zh: '其他要交代的（钥匙、货梯预约、配合工种…）', en: 'Anything else to pass on (keys, service-lift booking, other trades…)' },
          keepOnDuplicate: false,
        },
        {
          key: 'photos',
          type: 'photos',
          label: { zh: '附图 / 现场照片', en: 'Drawings & site photos' },
          max: 20,
          hint: { zh: '图纸截图、现场照片 —— 分享文案时一起发', en: 'Drawing screenshots and site photos — sent along with the message' },
        },
      ],
    },
  ],
  // 提醒文字跟界面语言（ctx.lang）；中英时与通用提醒一样「中文 / English」
  checks(ctx) {
    const out = [];
    const tt = (zh, en) => ctx.t(zh, en, ' / ');
    if (!str(val(ctx, 'date'))) out.push(tt('还没选进场日期', 'No site entry date selected yet'));
    if (!arr(val(ctx, 'areas')).length) out.push(tt('还没选「当日任务」的施工区域', `No work areas selected under "Today's tasks"`));
    if (!str(val(ctx, 'picPhone'))) out.push(tt('现场负责人电话未填（可在「设置」里填一次）', 'Person-in-charge phone not filled in (set it once in Settings)'));
    if (!str(val(ctx, 'mapLink'))) out.push(tt('没有导航链接，师傅可能找不到工地', 'No map link — installers may not find the site'));
    return out;
  },
  // WhatsApp 文案：中文逐行对齐原文；值为空的行自动省略。English = 同结构的英文版；中英 = 原来的中文文案（逐字不变）
  text(ctx) {
    return noticeText(ctx, langOf(ctx) === 'en' ? 'en' : 'zh');
  },
  filename(ctx) {
    const v = ctx.report.values || {};
    return fileName(ctx, '进场通知', 'Site_Entry_Notice', v.project, v.date);
  },
};

/** 一种语言的进场通知（lang = 'zh' | 'en'）；默认文字按字段 display 换好（与文件里一致） */
function noticeText(ctx, lang) {
  const en = lang === 'en';
  const v = shownValues(ctx);
  const project = str(v.project) || str(v.location);
  const client = str(v.client);
  const workType = en ? optionText(WORK_TYPES, v.workType, 'en') : str(v.workType);
  const head = [project, client].filter(Boolean).join(' – ');
  const title = en
    ? `[Site Entry Notice] ${[head, workType].filter(Boolean).join(' · ')}`.trim()
    : `【进场通知】${[head, workType].filter(Boolean).join(' ')}`;

  const blocks = [[title]];

  // 📅 📍 🗺️
  const where = [];
  const location = str(v.location) || str(v.project);
  const unit = str(v.unit);
  if (str(v.date)) where.push(en ? `📅 Date: ${fmtDateEn(v.date)}` : `📅 日期：${fmtDateCN(v.date)}`);
  if (location || unit) {
    where.push(
      en
        ? `📍 Location: ${[location, unit && `Unit ${unit}`].filter(Boolean).join(', ')}`
        : `📍 地点：${[location, unit && `单位 ${unit}`].filter(Boolean).join('，')}`,
    );
  }
  if (str(v.mapLink)) where.push(en ? `${MAP} Map: ${str(v.mapLink)}` : `${MAP} 导航：${str(v.mapLink)}`);
  if (where.length) blocks.push(where);

  // ⏰ 时间
  const time = [];
  if (str(v.arrive)) time.push(en ? `${fmtTime(v.arrive)} Assemble on site` : `${fmtTime(v.arrive)} 到场集合`);
  const day = en
    ? [
        str(v.start) && `${fmtTime(v.start)} Start work`,
        str(v.pack) && `${fmtTime(v.pack)} Start packing up`,
        str(v.leave) && `${fmtTime(v.leave)} Leave site`,
      ].filter(Boolean)
    : [
        str(v.start) && `${fmtTime(v.start)} 开工`,
        str(v.pack) && `${fmtTime(v.pack)} 开始收拾`,
        str(v.leave) && `${fmtTime(v.leave)} 离场`,
      ].filter(Boolean);
  if (day.length) time.push(day.join(en ? ', ' : '，'));
  if (str(v.lunch)) time.push(en ? `Lunch break [${str(v.lunch)}]` : `午休 [${str(v.lunch)}]`);
  if (time.length) blocks.push([en ? '⏰ Time' : '⏰ 时间', ...time]);

  // 🚪 进场
  const entry = [];
  if (str(v.entryNote)) entry.push(str(v.entryNote));
  if (str(v.parking)) entry.push(en ? `Parking: ${str(v.parking)}` : `停车：${str(v.parking)}`);
  const pic = [str(v.picName), str(v.picPhone)].filter(Boolean).join(' ');
  if (pic) entry.push(en ? `Person in charge: ${pic}. Contact me for any issues` : `现场负责人：${pic}。任何问题找我`);
  if (entry.length) blocks.push([en ? '🚪 Site Entry' : '🚪 进场', ...entry]);

  // 🔨 施工规定
  const rules = lines(v.rules);
  if (rules.length) blocks.push([en ? '🔨 Site Rules' : '🔨 施工规定', ...rules]);

  // 📋 当日任务
  const task = [];
  const areas = arr(v.areas).map((a) => (en ? optionText(AREAS, a, 'en') : a));
  if (areas.length) task.push(en ? `Areas: [${areas.join(' / ')}]` : `区域：[${areas.join(' / ')}]`);
  const ver = fmtDrawingVersion(v.drawingVersion);
  if (en) {
    task.push(
      ver
        ? `Follow shop drawing version [${ver}]; check each cabinet's position before starting work`
        : "Follow the latest shop drawings; check each cabinet's position before starting work",
    );
  } else {
    task.push(ver ? `按 [${ver}] 版深化图纸施工，开工前逐柜核对位置再动工` : '按最新版深化图纸施工，开工前逐柜核对位置再动工');
  }
  if (str(v.materials)) task.push(en ? `Materials: ${str(v.materials)}` : `物料：${str(v.materials)}`);
  blocks.push([en ? "📋 Today's Tasks" : '📋 当日任务', ...task]);

  // ✅ 收工前
  const leave = lines(v.beforeLeave);
  if (leave.length) blocks.push([en ? '✅ Before Leaving' : '✅ 收工前', ...leave]);

  // 📌 备注（用户写的，原样）
  const extra = lines(v.extra);
  if (extra.length) blocks.push([en ? '📌 Notes' : '📌 备注', ...extra]);

  return blocks.map((b) => b.join('\n')).join('\n\n');
}
