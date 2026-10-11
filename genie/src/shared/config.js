// WISH by RICCIONE REKA · 全局配置 —— 改这一份就能换软件名、精灵名字、收件 WhatsApp、团队成员。
// 与 invite/assets/js/config.js 同一套号码与团队；新同事两边各加一行。
// （代码文件夹仍叫 genie/、本机存储键仍是 genie.*：改了会丢掉已存的客人档案，所以内部名不动。）

export const BRAND = {
  app: 'WISH',
  by: 'by RICCIONE REKA',
  full: 'WISH by RICCIONE REKA',
  house: '溪岸 SAIL',
  reading: '梦想家占卜',
  readingEn: 'The Dream Home Reading',
  studio: '3D 梦想工作室',
  studioEn: 'WISH Studio',
  plinth: 'WISH · RICCIONE REKA · 溪岸 SAIL',
  venue: 'RICCIONE Malaysia · Setia Alam',
};

// 软件叫 WISH（许愿）；向导是住在神灯里的熊猫精灵：Pan(da) + (Ge)nie。英文念「潘-吉」，尾音和 Genie 一样；
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
  // 客户许愿模式的音乐：默认是现场合成的大自然禅意声景（溪水、微风、颂钵、风铃、鸟）。
  // 想用公司自己有版权的曲子：把 mp3 放进 public/music/，这里填 '/music/xxx.mp3'（自然声仍会垫在底下）。
  wishMusic: '',
  wishVolume: 0.7,
};

export function hostFromCode(code) {
  const c = String(code || '').toLowerCase();
  return CONFIG.team.find((t) => t.code === c) || null;
}
