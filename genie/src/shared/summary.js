// 档案 → 一段排好版的文字（WhatsApp 给设计师 / 复制到 CRM），跟着当前语言出中文或英文。

import { DREAMER_BY_CODE, AXES } from './dreamers.js';
import { MAT_BY_ID, SLOT_BY_ID } from './materials.js';
import { BRAND, CONFIG, hostFromCode } from './config.js';
import { insights } from './profile.js';
import { t, L, isEn } from './i18n.js';

const LIFE_LABEL = {
  saturday: { sofa: '沙发追剧', kitchen: '厨房做早午餐', window: '窗边看书', workout: '在家运动', bed: '赖床' },
  home: { drop: '鞋包随手放', tidy: '马上归位', flop: '直接瘫沙发', fridge: '先找吃的' },
  cook: { heavy: '天天爆炒', light: '轻食', coffee: '咖啡吧', rare: '几乎不开火' },
  bell: { shoes: '玄关的鞋', table: '餐桌杂物', clothes: '沙发上的衣服', counter: '厨房台面', toys: '孩子的玩具', nothing: '没什么好藏' },
  who: { baby: '小宝宝', kids: '小孩', teen: '青少年', elder: '长辈', dog: '狗', cat: '猫', helper: '帮佣', guests: '常有客人留宿', wfh: '在家办公', altar: '神台 / 祖先牌位', fengshui: '有风水要求' },
};
export const WISH_LABEL = {
  storage: '收纳多到用不完',
  clean: '一尘不染好打理',
  light: '阳光满屋',
  kitchen: '厨房超好用',
  kids: '孩子玩得安心',
  pets: '毛孩子友好',
  sleep: '安静好睡',
  work: '在家办公有效率',
  host: '招待朋友有面子',
  photo: '拍照很出片',
  health: '零甲醛、健康环保',
  value: '每一分钱花在刀刃上',
};
export const AVOID_LABEL = {
  white: '纯白',
  beige: '米黄',
  grey: '灰色',
  black: '黑色',
  darkwood: '深木色',
  pink: '粉色',
  green: '绿色',
  blue: '蓝色',
  yellow: '黄 / 金色',
  red: '红 / 橙',
  glossy: '亮面高光',
  marble: '大理石纹',
  gold: '金色金属',
  concrete: '水泥工业风',
  velvet: '丝绒',
  leather: '皮革',
  rattan: '藤编',
  herringbone: '人字拼',
  glassdoor: '玻璃柜门',
  openshelf: '开放层板',
  wallpaper: '花纹墙纸',
};

export const lifeLabel = (k, v) => t(LIFE_LABEL[k]?.[v] || v);

const mm = (x) => (x ? `${Number(x).toLocaleString('en-US')}mm` : '—');
const listSep = () => (isEn() ? ', ' : '、');
const LEVEL_ICON = { conflict: '⚠️', note: '📐' };

/**
 * 档案 → WhatsApp / CRM 文字（跟着当前语言：中文原样，英文查词典）。
 * 客人看得到 WhatsApp 输入框，所以「见面要聊」只放 conflict / note，不放 tip（沟通建议、报价话术）。
 */
export function profileText(p, plan, link = '') {
  const d = DREAMER_BY_CODE[p.code];
  const host = hostFromCode(p.host);
  const touched = p.storage?.touched;
  // 宝藏那几题客人没动过 → 标出来（只在新答案里有 touched 时才标）
  const unsure = (k) => (touched && !touched[k] ? t('（默认值，未确认）') : '');
  const gap = isEn() ? ' ' : '';
  const out = [];
  out.push(`✨ ${t('{0} 梦想家蓝图 · {1}', [BRAND.app, p.name || t('贵宾')])}`);
  out.push(t('牌：{0} {1}（{2}）· {3}', [d?.num, isEn() ? d?.en : d?.zh, isEn() ? d?.zh : d?.en, p.code]));
  out.push(AXES.map((ax) => `${L(ax.a)}${gap}${p.axes[ax.id]}%/${L(ax.b)}${gap}${100 - p.axes[ax.id]}%`).join('  '));
  out.push('');
  const life = p.life || {};
  out.push(`🏠 ${t('生活：周六{0}；回家{1}；厨房{2}；最想藏{3}', [lifeLabel('saturday', life.saturday) || '—', lifeLabel('home', life.home) || '—', lifeLabel('cook', life.cook) || '—', lifeLabel('bell', life.bell) || '—'])}`);
  if (life.who?.length) out.push(`👨‍👩‍👧 ${t('同住：{0}', [life.who.map((v) => lifeLabel('who', v)).join(listSep())])}`);
  const store = [
    t('鞋 {0} 双 → 鞋柜 {1}', [plan.shoes, mm(plan.shoeCabinetMM)]) + unsure('shoes'),
    t('衣柜目标 {0}（长挂 {1}）', [mm(plan.wardrobeMM), mm(plan.longHangMM)]) + unsure('wardrobe'),
    t('书墙 {0}', [mm(plan.bookshelfMM)]) + unsure('books'),
    t('家电 {0} 件', [plan.applianceCount]),
    t('大件 {0} 类', [plan.bulky]),
    t('藏 {0} : 展 {1}', [100 - plan.displayPct, plan.displayPct]) + unsure('ratio'),
  ];
  out.push(`📦 ${t('收纳：{0}', [store.join(isEn() ? '; ' : '；')])}`);
  out.push(`🪔 ${t('三个愿望：{0}', [(p.wishes || []).map((w, i) => `${i + 1}.${t(WISH_LABEL[w] || w)}`).join(' ')])}`);
  if (p.avoid?.length) out.push(`🚫 ${t('雷区：{0}', [p.avoid.map((a) => t(AVOID_LABEL[a] || a)).join(listSep())])}`);
  if (p.wish) out.push(`💬 ${t('一个愿望：「{0}」', [p.wish])}`);
  out.push('');
  const mats = ['floor', 'walls', 'cabinetry', 'countertop', 'upholstery'].map((s) => `${L(SLOT_BY_ID[s])} ${L(MAT_BY_ID[p.materials?.[s]]) || '—'}`);
  out.push(`🎨 ${t('材质：{0}', [mats.join(' · ')])}`);
  if (d?.design) out.push(`📐 ${t('设计语言：{0}；{1}；{2}', [t(d.design.style), t(d.design.kelvin), t(d.design.doors)])}`);
  const talk = insights(p, plan)
    .filter((x) => x.level !== 'tip')
    .sort((x, y) => (x.level === 'conflict' ? 0 : 1) - (y.level === 'conflict' ? 0 : 1))
    .slice(0, 6);
  if (talk.length) {
    out.push('');
    out.push(`🗣 ${t('见面要聊')}`);
    for (const x of talk) out.push(`${LEVEL_ICON[x.level] || '•'} ${x.text}`);
  }
  if (link) {
    out.push('');
    out.push(`🔗 ${t('打开蓝图 / 3D：{0}', [link])}`);
  }
  if (host) out.push(t('— 由 {0} 陪同', [host.name]));
  return out.join('\n');
}

export function waLink(text, to = CONFIG.inbox) {
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/** 选填：同时 POST 一份到表单服务（失败不打断客人） */
export async function postProfile(profile, text) {
  if (!CONFIG.endpoint) return false;
  try {
    await fetch(CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'genie', submittedAt: new Date().toISOString(), text, profile }),
    });
    return true;
  } catch {
    return false;
  }
}
