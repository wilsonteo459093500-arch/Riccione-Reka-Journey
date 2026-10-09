// 报告模板注册表 —— 新增一种报告：写一个模板文件，在这里登记即可。
import measurement from './measurement.js';
import preInstall from './preInstall.js';
import siteNotice from './siteNotice.js';
import dailyReport from './dailyReport.js';
import qualityCheck from './qualityCheck.js';
import finalInspection from './finalInspection.js';
import handover from './handover.js';

export const TEMPLATES = [
  measurement,
  preInstall,
  siteNotice,
  dailyReport,
  qualityCheck,
  finalInspection,
  handover,
].sort((a, b) => (a.stage || 99) - (b.stage || 99));

const BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

export const getTemplate = (id) => BY_ID[id] || null;

/** 选择页分组 */
export const GROUPS = [
  { id: 'message', zh: '发群 / 发师傅', en: 'Messages', hint: '一键出 WhatsApp 文案 + 照片', kinds: ['message'] },
  { id: 'checklist', zh: '检查表 / 报告', en: 'Checklists', hint: '逐项打勾拍照 → PDF / Word / Excel', kinds: ['checklist'] },
];
