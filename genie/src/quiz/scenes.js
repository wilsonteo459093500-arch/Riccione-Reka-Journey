// 许愿之旅的风景（像旅行杂志的跨页）：马来西亚 + 四川。每一段一个地方，画在潘吉提问的背后。
//
// ── 照片（有授权的；现在 5 张是业主自己拍的 / 买的，所以 credit 留空）────────────────
// 1. 照片放进 genie/public/scenes/：大图 <id>.webp（约 2000 px 宽）+ 小图 <id>-sm.webp（约 1200 px），
//    WebP、质量 70–80、去掉 EXIF；大图 < 400 KB、小图 ≈ 120 KB（展厅 Wi-Fi 也快）。
// 2. 在对应的条目里填：
//      photo:   '/scenes/<id>.webp'      photoSm: '/scenes/<id>-sm.webp'
//      photoW:  [小图宽, 大图宽]（像素，给 srcset 用；竖图例如 [900, 1500]）
//      credit:  '摄影：某某 / Unsplash'（有就显示在地名后面，像杂志的图片来源；自己的照片留空）
//      focus:   '60% 55%'（画面重点 = CSS object-position；横屏用它）
//      focusPortrait: '62% 50%'（选填：竖屏 iPad / 手机两边会被裁掉，用这个）
//      scrim:   { top, bottom, wash, sat }（字的可读性：上 / 下各一层纸色渐变的浓度 0–1、
//               整张照片的暖纸色薄雾 0–0.2、饱和度 0.8–1。暗的照片 top 要高一点，太艳的 sat 低一点）
//      tone:    'light' | 'dark'（照片上地名的字是深色还是浅色）
// 3. 有 photo 就显示照片（加上下渐变 + 一层很淡的暖纸色，让每张都像同一本杂志）；
//    照片载不到（onError）就自动退回代码画的风景。换场景时淡入淡出，下一张会提前预载（同一套 srcset）。
// 4. palette = 代码画风景时用的主色（天空 → 远山 → 近景）。
// ────────────────────────────────────────────────────────────────────

export const SCENES = {
  welcome: {
    id: 'welcome',
    place: { zh: '金马伦高原', en: 'Cameron Highlands' },
    area: { zh: '马来西亚 · 彭亨', en: 'Pahang, Malaysia' },
    region: 'MY',
    tone: 'light',
    photo: '/scenes/welcome.webp',
    photoSm: '/scenes/welcome-sm.webp',
    photoW: [1200, 2000],
    credit: '',
    focus: '60% 55%',
    focusPortrait: '64% 55%',
    scrim: { top: 0.4, bottom: 0.3, wash: 0.08, sat: 0.86 },
    palette: ['#DCE7E1', '#F7F0DF', '#C7D5CC', '#9DB98A', '#577A4B'],
  },
  intuition: {
    id: 'intuition',
    place: { zh: '稻城亚丁', en: 'Yading' },
    area: { zh: '中国 · 四川', en: 'Sichuan, China' },
    region: 'SC',
    tone: 'light',
    photo: '/scenes/intuition.webp',
    photoSm: '/scenes/intuition-sm.webp',
    photoW: [900, 1500],
    credit: '',
    focus: '55% 30%',
    focusPortrait: '55% 40%',
    scrim: { top: 0.42, bottom: 0.32, wash: 0.08, sat: 0.9 },
    palette: ['#D5E2E2', '#F6F3EA', '#F7F8F5', '#C99E55', '#41604C'],
  },
  life: {
    id: 'life',
    place: { zh: '大汉山国家公园', en: 'Taman Negara' },
    area: { zh: '马来西亚 · 彭亨', en: 'Pahang, Malaysia' },
    region: 'MY',
    tone: 'light',
    photo: '/scenes/life.webp',
    photoSm: '/scenes/life-sm.webp',
    photoW: [1200, 2000],
    credit: '',
    focus: '50% 60%',
    focusPortrait: '58% 60%',
    scrim: { top: 0.72, bottom: 0.42, wash: 0.16, sat: 0.92 },
    palette: ['#DCE6D6', '#C2D3BF', '#8AA886', '#8FB8AE', '#3E5A3F'],
  },
  treasure: {
    id: 'treasure',
    place: { zh: '九寨沟', en: 'Jiuzhaigou' },
    area: { zh: '中国 · 四川', en: 'Sichuan, China' },
    region: 'SC',
    tone: 'light',
    photo: '/scenes/treasure.webp',
    photoSm: '/scenes/treasure-sm.webp',
    photoW: [1200, 2000],
    credit: '',
    focus: '50% 55%',
    focusPortrait: '42% 55%',
    scrim: { top: 0.55, bottom: 0.36, wash: 0.12, sat: 0.8 },
    palette: ['#E3ECE8', '#F3F1E8', '#7E9C86', '#3FA49A', '#C98950'],
  },
  wishes: {
    id: 'wishes',
    place: { zh: '京那巴鲁山', en: 'Mount Kinabalu' },
    area: { zh: '马来西亚 · 沙巴', en: 'Sabah, Malaysia' },
    region: 'MY',
    tone: 'light',
    photo: '/scenes/wishes.webp',
    photoSm: '/scenes/wishes-sm.webp',
    photoW: [1200, 2000],
    credit: '',
    focus: '45% 40%',
    focusPortrait: '50% 40%',
    scrim: { top: 0.42, bottom: 0.46, wash: 0.1, sat: 0.9 },
    palette: ['#DCE2DC', '#F7D9A0', '#FFF4D6', '#F3E7D3', '#3E3A34'],
  },
  nogo: {
    id: 'nogo',
    place: { zh: '四姑娘山', en: 'Siguniang Mountains' },
    area: { zh: '中国 · 四川', en: 'Sichuan, China' },
    region: 'SC',
    tone: 'light',
    photo: '',
    credit: '',
    focus: '50% 40%',
    palette: ['#DDE4DE', '#EDEFE8', '#C2CEC6', '#6E877A', '#3D5548'],
  },
  dusk: {
    id: 'dusk',
    place: { zh: '瓜拉雪兰莪的萤火虫', en: 'Fireflies of Kuala Selangor' },
    area: { zh: '马来西亚 · 雪兰莪', en: 'Selangor, Malaysia' },
    region: 'MY',
    tone: 'dark',
    photo: '',
    credit: '',
    focus: '50% 60%',
    palette: ['#1A2420', '#8A6B45', '#121A16', '#233029', '#E9D29A'],
  },
};

/** 每一步用哪一段风景（擦神灯、章节翻牌、揭晓 = 暮色的萤火河） */
export function sceneFor(step) {
  if (!step) return 'welcome';
  if (step.id === 'welcome') return 'welcome';
  if (step.id === 'lamp' || step.id === 'reveal' || step.interlude) return 'dusk';
  return SCENES[step.chapter] ? step.chapter : 'welcome';
}

/** 照片的 srcset（小图 + 大图） */
export const srcSetOf = (s) => (s?.photo ? [s.photoSm && `${s.photoSm} ${s.photoW?.[0] || 1200}w`, `${s.photo} ${s.photoW?.[1] || 2000}w`].filter(Boolean).join(', ') : '');

/** 蓝图 / 海报：按梦想家的温度选一张（暖 → 京那巴鲁的金色日出，清 → 九寨沟的湖） */
export const sceneForProfile = (p) => ((p?.axes?.temp ?? 50) >= 50 ? 'wishes' : 'treasure');
