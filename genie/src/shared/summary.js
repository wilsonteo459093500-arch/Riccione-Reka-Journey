// 档案 → 一段排好版的文字（WhatsApp 给设计师 / 复制到 CRM）。

import { DREAMER_BY_CODE, AXES } from './dreamers.js';
import { MAT_BY_ID, SLOT_BY_ID } from './materials.js';
import { CONFIG, hostFromCode } from './config.js';

const LIFE_LABEL = {
  saturday: { sofa: '沙发追剧', kitchen: '厨房做早午餐', window: '窗边看书', workout: '在家运动', bed: '赖床' },
  home: { drop: '鞋包随手放', tidy: '马上归位', flop: '直接瘫沙发', fridge: '先找吃的' },
  cook: { heavy: '天天爆炒', light: '轻食', coffee: '咖啡吧', rare: '几乎不开火' },
  bell: { shoes: '玄关的鞋', table: '餐桌杂物', clothes: '沙发上的衣服', counter: '厨房台面', toys: '孩子的玩具', nothing: '没什么好藏' },
  who: { baby: '小宝宝', kids: '小孩', teen: '青少年', elder: '长辈', dog: '狗', cat: '猫', helper: '帮佣', guests: '常有客人留宿', wfh: '在家办公', altar: '神台' },
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

export const lifeLabel = (k, v) => LIFE_LABEL[k]?.[v] || v;

const mm = (x) => (x ? `${Number(x).toLocaleString('en-US')}mm` : '—');

export function profileText(p, plan, link = '') {
  const d = DREAMER_BY_CODE[p.code];
  const host = hostFromCode(p.host);
  const L = [];
  L.push(`✨ GENIE 梦想家蓝图 · ${p.name || '贵宾'}`);
  L.push(`牌：${d?.num} ${d?.zh}（${d?.en}）· ${p.code}`);
  L.push(AXES.map((ax) => `${ax.a.zh}${p.axes[ax.id]}%/${ax.b.zh}${100 - p.axes[ax.id]}%`).join('  '));
  L.push('');
  L.push(`🏠 生活：周六${lifeLabel('saturday', p.life.saturday) || '—'}；回家${lifeLabel('home', p.life.home) || '—'}；厨房${lifeLabel('cook', p.life.cook) || '—'}；最想藏${lifeLabel('bell', p.life.bell) || '—'}`);
  if (p.life.who?.length) L.push(`👨‍👩‍👧 同住：${p.life.who.map((v) => lifeLabel('who', v)).join('、')}`);
  L.push(`📦 收纳：鞋 ${plan.shoes} 双 → 鞋柜 ${mm(plan.shoeCabinetMM)}；衣柜目标 ${mm(plan.wardrobeMM)}（长挂 ${mm(plan.longHangMM)}）；书墙 ${mm(plan.bookshelfMM)}；家电 ${plan.applianceCount} 件；大件 ${plan.bulky} 类；藏 ${100 - plan.displayPct} : 展 ${plan.displayPct}`);
  L.push(`🪔 三个愿望：${(p.wishes || []).map((w, i) => `${i + 1}.${WISH_LABEL[w] || w}`).join(' ')}`);
  if (p.avoid?.length) L.push(`🚫 雷区：${p.avoid.map((a) => AVOID_LABEL[a] || a).join('、')}`);
  if (p.wish) L.push(`💬 一个愿望：「${p.wish}」`);
  L.push('');
  L.push(`🎨 材质：${['floor', 'walls', 'cabinetry', 'countertop', 'upholstery'].map((s) => `${SLOT_BY_ID[s].zh} ${MAT_BY_ID[p.materials[s]]?.zh || '—'}`).join(' · ')}`);
  if (d?.design) L.push(`📐 设计语言：${d.design.style}；${d.design.kelvin}；${d.design.doors}`);
  if (link) {
    L.push('');
    L.push(`🔗 打开蓝图 / 3D：${link}`);
  }
  if (host) L.push(`— 由 ${host.name} 陪同`);
  return L.join('\n');
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
