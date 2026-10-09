// 进场通知 SITE ENTRY NOTICE —— 发给 subcon：几点到、怎么进、做什么、收工前做什么
// 来源：现场主管 WhatsApp 进场通知（【进场通知】Tuai Timur Residence – Hailey 单位安装）
// 主输出 = text()（WhatsApp 文案，逐字对齐原文格式）；PDF 由文档模型通用生成。
import { val } from './helpers.js';
import { addDays, fmtDateCN, fmtTime, parseISODate } from '../lib/format.js';

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

const AREAS = ['鞋柜', '主卧柜', '电视柜', '次卧柜', '厨房', '书柜', '浴室柜', '餐边柜', '衣帽间'];

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
  desc: '发给 subcon：几点到、怎么进、做什么、收工前做什么',
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
        { key: 'project', type: 'text', label: { zh: '项目', en: 'Project' }, bind: 'project.name', required: true, placeholder: '例：Tuai Timur Residence' },
        { key: 'client', type: 'text', label: { zh: '客户', en: 'Client' }, bind: 'project.client', placeholder: '例：Hailey' },
        {
          key: 'workType',
          type: 'chips',
          label: { zh: '工作内容', en: 'Work type' },
          options: ['单位安装', '柜体安装', '门板安装', '台面安装', '补装 / 整改', '维修'],
          allowCustom: true,
          default: '单位安装',
        },
        {
          key: 'date',
          type: 'date',
          label: { zh: '日期', en: 'Date' },
          default: (ctx) => addDays(ctx.today, 1),
          hint: '默认明天',
        },
        { key: 'location', type: 'text', label: { zh: '地点', en: 'Location' }, bind: 'project.name', hint: '默认 = 项目名，可改成楼盘 / 栋别' },
        { key: 'unit', type: 'text', label: { zh: '单位', en: 'Unit' }, bind: 'project.unit', placeholder: '例：17-3' },
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
        { key: 'lunch', type: 'text', label: { zh: '午休', en: 'Lunch break' }, default: '12:00–13:00', placeholder: '12:00–13:00', hint: '留空 = 不写午休' },
      ],
    },
    {
      id: 'entry',
      type: 'fields',
      title: { zh: '进场', en: 'SITE ENTRY' },
      fields: [
        { key: 'entryNote', type: 'text', label: { zh: '登记', en: 'Registration' }, bind: 'project.entryNote', default: 'Guard house 登记，带护照' },
        { key: 'parking', type: 'text', label: { zh: '停车', en: 'Parking' }, bind: 'project.parking', default: '访客停车场' },
        { key: 'picName', type: 'text', label: { zh: '现场负责人', en: 'Person in charge' }, bind: 'settings.name' },
        { key: 'picPhone', type: 'tel', label: { zh: '负责人电话', en: 'PIC phone' }, bind: 'settings.phone', placeholder: '例：016-3881819' },
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
          placeholder: '一条规定',
          hint: '每条一行，按物业规定增删（如 Hacking 时段）',
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
          hint: '按此版深化图纸施工，开工前逐柜核对位置再动工',
        },
        { key: 'materials', type: 'text', label: { zh: '物料', en: 'Materials' }, default: '已在现场' },
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
          placeholder: '收工前要做的事',
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
          placeholder: '其他要交代的（钥匙、货梯预约、配合工种…）',
          keepOnDuplicate: false,
        },
        {
          key: 'photos',
          type: 'photos',
          label: { zh: '附图 / 现场照片', en: 'Drawings & site photos' },
          max: 20,
          hint: '图纸截图、现场照片 —— 分享文案时一起发',
        },
      ],
    },
  ],
  checks(ctx) {
    const out = [];
    if (!str(val(ctx, 'date'))) out.push('还没选进场日期');
    if (!arr(val(ctx, 'areas')).length) out.push('还没选「当日任务」的施工区域');
    if (!str(val(ctx, 'picPhone'))) out.push('现场负责人电话未填（可在「设置」里填一次）');
    if (!str(val(ctx, 'mapLink'))) out.push('没有导航链接，师傅可能找不到工地');
    return out;
  },
  // WhatsApp 文案：逐行对齐原文；值为空的行自动省略
  text(ctx) {
    const v = ctx.report.values || {};
    const project = str(v.project) || str(v.location);
    const client = str(v.client);
    const workType = str(v.workType);
    const head = [project, client].filter(Boolean).join(' – ');
    const title = `【进场通知】${[head, workType].filter(Boolean).join(' ')}`;

    const blocks = [[title]];

    // 📅 📍 🗺️
    const where = [];
    const location = str(v.location) || str(v.project);
    const unit = str(v.unit);
    if (str(v.date)) where.push(`📅 日期：${fmtDateCN(v.date)}`);
    if (location || unit) where.push(`📍 地点：${[location, unit && `单位 ${unit}`].filter(Boolean).join('，')}`);
    if (str(v.mapLink)) where.push(`${MAP} 导航：${str(v.mapLink)}`);
    if (where.length) blocks.push(where);

    // ⏰ 时间
    const time = [];
    if (str(v.arrive)) time.push(`${fmtTime(v.arrive)} 到场集合`);
    const day = [
      str(v.start) && `${fmtTime(v.start)} 开工`,
      str(v.pack) && `${fmtTime(v.pack)} 开始收拾`,
      str(v.leave) && `${fmtTime(v.leave)} 离场`,
    ].filter(Boolean);
    if (day.length) time.push(day.join('，'));
    if (str(v.lunch)) time.push(`午休 [${str(v.lunch)}]`);
    if (time.length) blocks.push(['⏰ 时间', ...time]);

    // 🚪 进场
    const entry = [];
    if (str(v.entryNote)) entry.push(str(v.entryNote));
    if (str(v.parking)) entry.push(`停车：${str(v.parking)}`);
    const pic = [str(v.picName), str(v.picPhone)].filter(Boolean).join(' ');
    if (pic) entry.push(`现场负责人：${pic}。任何问题找我`);
    if (entry.length) blocks.push(['🚪 进场', ...entry]);

    // 🔨 施工规定
    const rules = lines(v.rules);
    if (rules.length) blocks.push(['🔨 施工规定', ...rules]);

    // 📋 当日任务
    const task = [];
    const areas = arr(v.areas);
    if (areas.length) task.push(`区域：[${areas.join(' / ')}]`);
    const ver = fmtDrawingVersion(v.drawingVersion);
    task.push(ver ? `按 [${ver}] 版深化图纸施工，开工前逐柜核对位置再动工` : '按最新版深化图纸施工，开工前逐柜核对位置再动工');
    if (str(v.materials)) task.push(`物料：${str(v.materials)}`);
    blocks.push(['📋 当日任务', ...task]);

    // ✅ 收工前
    const leave = lines(v.beforeLeave);
    if (leave.length) blocks.push(['✅ 收工前', ...leave]);

    // 📌 备注
    const extra = lines(v.extra);
    if (extra.length) blocks.push(['📌 备注', ...extra]);

    return blocks.map((b) => b.join('\n')).join('\n\n');
  },
  filename(ctx) {
    const v = ctx.report.values || {};
    return ['进场通知', v.project, v.date].filter(Boolean).join('_');
  },
};
