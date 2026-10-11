// 情绪：三个一键预设（Cozy / Bright / Moody）＋ 情绪仪表的计算 ＋ 一句话描述。
// 仪表像 The Sims 的需求条：每换一次材质、每拖一下时间，数字马上动 —— 即时反馈让人停不下来。

import { SLOTS, MAT_BY_ID, hexToRgb } from './materials.js';
import { COLOR_TAGS } from './colorTags.js';
import { t, L, isEn } from './i18n.js';

export const MOODS = [
  {
    id: 'cozy',
    zh: '温暖',
    en: 'Cozy',
    sub: 'golden hour',
    time: 18.4,
    materials: {
      floor: 'smoked-oak',
      walls: 'sand-limewash',
      feature: 'walnut',
      cabinetry: 'light-oak',
      countertop: 'travertine',
      tile: 'zellige-white',
      upholstery: 'navy-velvet',
      bedding: 'linen',
      rugs: 'oat-knit',
      woodwork: 'walnut',
      accents: 'rust-wool',
      curtains: 'linen',
      metal: 'brass',
    },
  },
  {
    id: 'bright',
    zh: '明亮',
    en: 'Bright',
    sub: 'midday',
    time: 12.8,
    materials: {
      floor: 'white-oak',
      walls: 'gallery-white',
      feature: 'light-oak',
      cabinetry: 'white-lacquer',
      countertop: 'carrara',
      tile: 'zellige-white',
      upholstery: 'boucle',
      bedding: 'cotton-white',
      rugs: 'grey-wool',
      woodwork: 'light-oak',
      accents: 'sage-linen',
      curtains: 'cotton-white',
      metal: 'matte-black',
    },
  },
  {
    id: 'moody',
    zh: '沉浸',
    en: 'Moody',
    sub: 'after dark',
    time: 22.2,
    materials: {
      floor: 'walnut',
      walls: 'charcoal',
      feature: 'ebony-oak',
      cabinetry: 'black-matte',
      countertop: 'nero',
      tile: 'nero',
      upholstery: 'cognac-leather',
      bedding: 'charcoal-felt',
      rugs: 'rust-wool',
      woodwork: 'walnut',
      accents: 'ochre-velvet',
      curtains: 'charcoal-felt',
      metal: 'brass',
    },
  },
];

export const MOOD_BY_ID = Object.fromEntries(MOODS.map((m) => [m.id, m]));

/** 一天里的光对情绪的贡献 [cozy, bright, moody] */
export function timeMood(h) {
  const t = ((h % 24) + 24) % 24;
  if (t < 6 || t >= 21) return [0.3, 0, 0.75];
  if (t < 9) return [0.35, 0.55, 0.1];
  if (t < 16) return [0.15, 0.85, 0.05];
  if (t < 19.3) return [0.8, 0.3, 0.15];
  return [0.55, 0.05, 0.5];
}

/** 当前材质 + 时间 → 三个百分比（加起来 100） */
export function moodMeter(materials, hour) {
  const acc = [0, 0, 0];
  let wsum = 0;
  for (const s of SLOTS) {
    const mat = MAT_BY_ID[materials?.[s.id]];
    if (!mat) continue;
    for (let i = 0; i < 3; i++) acc[i] += mat.mood[i] * s.weight;
    wsum += s.weight;
  }
  if (wsum > 0) for (let i = 0; i < 3; i++) acc[i] /= wsum;
  const tm = timeMood(hour);
  const mix = acc.map((v, i) => v * 0.7 + tm[i] * 0.3);
  const total = mix.reduce((a, b) => a + b, 0) || 1;
  const pct = mix.map((v) => Math.round((v / total) * 100));
  pct[0] += 100 - pct.reduce((a, b) => a + b, 0);
  return { cozy: pct[0], bright: pct[1], moody: pct[2] };
}

const LIGHT_PHRASE = (h) => {
  const t = ((h % 24) + 24) % 24;
  if (t < 5.5) return '深夜的几盏暖灯';
  if (t < 8.5) return '清晨薄薄的日光';
  if (t < 11) return '上午干净的阳光';
  if (t < 15.5) return '正午明亮的顶光';
  if (t < 17.5) return '午后斜斜的光';
  if (t < 19.3) return '低垂的金色夕阳';
  if (t < 21) return '天黑前的蓝调时刻';
  return '夜里的氛围灯';
};

const FEEL = {
  cozy: { adj: '温暖而柔和', word: '很 cozy' },
  bright: { adj: '通透又清爽', word: '很明亮' },
  moody: { adj: '深邃有态度', word: '很沉浸' },
};

/** 「砂洗石灰墙面、烟熏橡地板，加上低垂的金色夕阳：温暖而柔和。整体读起来 —— 很 cozy。」（跟着当前语言） */
export function moodSentence(materials, hour) {
  const meter = moodMeter(materials, hour);
  const top = Object.entries(meter).sort((a, b) => b[1] - a[1])[0][0];
  const wall = MAT_BY_ID[materials?.walls];
  const floor = MAT_BY_ID[materials?.floor];
  const parts = [];
  if (wall) parts.push(t('{0}墙面', [L(wall)]));
  if (floor) parts.push(t('{0}地板', [L(floor)]));
  return {
    top,
    text: t('{0}，加上{1}：{2}。整体读起来 —— {3}。', [parts.join(isEn() ? ', ' : '、'), t(LIGHT_PHRASE(hour)), t(FEEL[top].adj), t(FEEL[top].word)]),
  };
}

// ───────────────────────── 颜色 / 质感标签（雷区用） ─────────────────────────

function hsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

/**
 * 材质 → 一组标签，雷区选项按标签排除。
 * 色系（白 / 米黄 / 粉 / 绿 / 黄 / 红 / 蓝 / 深木色）以 colorTags.js 的登记为准；灰、黑仍按明度算。
 * 没登记的材质才按颜色猜（木头只看深浅，不分色系）。
 */
export function tagsOf(mat) {
  const tags = new Set();
  if (!mat) return tags;
  const { h, s, l } = hsl(mat.color);
  if (l < 0.2) tags.add('black');
  if (s < 0.12 && l >= 0.2 && l <= 0.88) tags.add('grey');
  const known = COLOR_TAGS[mat.id];
  if (known) for (const tag of known) tags.add(tag);
  else if (mat.cat === 'wood') {
    if (mat.light < 0.4) tags.add('darkwood');
  } else {
    if (l > 0.88 && s < 0.25) tags.add('white');
    if (s >= 0.12 && l >= 0.2) {
      if ((h >= 330 || h < 15) && l > 0.6) tags.add('pink');
      else if (h < 25 || h >= 330) tags.add('red');
      else if (h < 50 && l > 0.62 && s < 0.45) tags.add('beige');
      else if (h < 50) tags.add(l < 0.45 ? 'red' : 'yellow');
      else if (h < 70) tags.add('yellow');
      else if (h < 170) tags.add('green');
      else if (h < 260) tags.add('blue');
    }
  }
  if (mat.clearcoat >= 0.3 || (mat.cat !== 'metal' && mat.rough < 0.35)) tags.add('glossy');
  if (mat.tex.type === 'marble') tags.add('marble');
  if (mat.id === 'brass' || mat.id === 'bronze') tags.add('gold');
  if (mat.tex.type === 'concrete' && !mat.tex.quartz) tags.add('concrete'); // 纯白石英石借用细水泥的贴图，但不算「水泥感」
  if (mat.tex.type === 'velvet') tags.add('velvet');
  if (mat.tex.type === 'leather') tags.add('leather');
  if (mat.tex.type === 'rattan') tags.add('rattan');
  if (mat.tex.pattern === 'herringbone') tags.add('herringbone');
  return tags;
}
