// GENIE by RICCIONE REKA · 全局配置 —— 改这一份就能换精灵名字、收件 WhatsApp、团队成员。
// 与 invite/assets/js/config.js 同一套号码与团队；新同事两边各加一行。

export const BRAND = {
  app: 'GENIE',
  by: 'by RICCIONE REKA',
  house: '溪岸 SAIL',
  reading: '梦想家占卜',
  readingEn: 'The Dream Home Reading',
  studio: '3D 梦想工作室',
  studioEn: 'Genie Studio',
  plinth: 'GENIE · RICCIONE REKA · 溪岸 SAIL',
  venue: 'RICCIONE Malaysia · Setia Alam',
};

// 熊猫精灵向导：Pan(da) + (Ge)nie。英文念「潘-吉」，尾音和 Genie 一样；
// 中文「盼」= 许愿，「吉」= 吉祥。想换名字，只改这里。
// 备选：Jinbao 金宝（Jinn + 宝宝）· Pandini 潘迪尼（Panda + Houdini）· Genda 精达
export const GUIDE = {
  name: '盼吉',
  nameEn: 'Pangie',
};

export const CONFIG = {
  // 蓝图送到哪个 WhatsApp（纯数字，国际码开头）
  inbox: '60189661919',
  // 选填：任何接受 JSON POST 的地址（Formspree / Supabase Edge Function / Apps Script）。
  // 留空 = 只存本机 + WhatsApp。失败不会打断客人。
  endpoint: '',
  team: [{ code: 'wilson', name: 'Wilson Teo', role: '溪岸 Sail by Riccione Reka', wa: '60189661919' }],
};

export function hostFromCode(code) {
  const c = String(code || '').toLowerCase();
  return CONFIG.team.find((t) => t.code === c) || null;
}
