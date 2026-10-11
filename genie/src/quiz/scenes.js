// 许愿之旅的风景（像旅行杂志的跨页）：马来西亚 + 四川。每一段一个地方，画在潘吉提问的背后。
//
// ── 换成真照片（有授权的）──────────────────────────────────────────────
// 1. 把照片放进 genie/public/scenes/，文件名用下面的 id：例如 public/scenes/welcome.webp
//    建议：横幅 2400×1600 左右、WebP、质量 70–80、每张 < 400 KB（展厅 Wi-Fi 也快）。
// 2. 在对应的条目里填：photo: '/scenes/welcome.webp'
//                      credit: '摄影：某某 / Unsplash'（会显示在地名后面，像杂志的图片来源）
//                      focus: '50% 40%'（画面重点的位置 = CSS object-position，竖屏 iPad / 手机会裁两边）
// 3. 有 photo 就显示照片（自动加上下渐变遮罩，字才看得清），没有就显示代码画的风景。
//    换场景时淡入淡出，下一张照片会提前预载。
// palette = 代码画风景时用的主色（天空 → 远山 → 近景），海报也会用到。
// ────────────────────────────────────────────────────────────────────

export const SCENES = {
  welcome: {
    id: 'welcome',
    place: { zh: '金马伦高原', en: 'Cameron Highlands' },
    area: { zh: '马来西亚 · 彭亨', en: 'Pahang, Malaysia' },
    region: 'MY',
    tone: 'light',
    photo: '',
    credit: '',
    focus: '50% 45%',
    palette: ['#DCE7E1', '#F7F0DF', '#C7D5CC', '#9DB98A', '#577A4B'],
  },
  intuition: {
    id: 'intuition',
    place: { zh: '稻城亚丁', en: 'Yading' },
    area: { zh: '中国 · 四川', en: 'Sichuan, China' },
    region: 'SC',
    tone: 'light',
    photo: '',
    credit: '',
    focus: '50% 35%',
    palette: ['#D5E2E2', '#F6F3EA', '#F7F8F5', '#C99E55', '#41604C'],
  },
  life: {
    id: 'life',
    place: { zh: '大汉山国家公园', en: 'Taman Negara' },
    area: { zh: '马来西亚 · 彭亨', en: 'Pahang, Malaysia' },
    region: 'MY',
    tone: 'light',
    photo: '',
    credit: '',
    focus: '50% 55%',
    palette: ['#DCE6D6', '#C2D3BF', '#8AA886', '#8FB8AE', '#3E5A3F'],
  },
  treasure: {
    id: 'treasure',
    place: { zh: '九寨沟', en: 'Jiuzhaigou' },
    area: { zh: '中国 · 四川', en: 'Sichuan, China' },
    region: 'SC',
    tone: 'light',
    photo: '',
    credit: '',
    focus: '50% 50%',
    palette: ['#E3ECE8', '#F3F1E8', '#7E9C86', '#3FA49A', '#C98950'],
  },
  wishes: {
    id: 'wishes',
    place: { zh: '京那巴鲁山', en: 'Mount Kinabalu' },
    area: { zh: '马来西亚 · 沙巴', en: 'Sabah, Malaysia' },
    region: 'MY',
    tone: 'light',
    photo: '',
    credit: '',
    focus: '50% 55%',
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
  return SCENES[step.chapter] ? step.chapter : step.chapter === 'nogo' ? 'nogo' : 'welcome';
}

/** 蓝图 / 海报：按梦想家的温度选一张（暖 → 京那巴鲁的金色日出，清 → 九寨沟的湖） */
export const sceneForProfile = (p) => ((p?.axes?.temp ?? 50) >= 50 ? 'wishes' : 'treasure');
