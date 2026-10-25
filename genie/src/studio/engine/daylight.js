// 24 小时光影（马来西亚：约 7:10 日出、19:20 日落，太阳几乎从头顶划过）。纯函数。
// 输出：太阳方向（考虑房子朝向 north）、颜色、强度；天空（环境光 IBL 的天穹：天顶 / 地平线 / 地面反光）；
// 窗口进来的天光；背景（虚化的室内照片：窗外的天色 + 房间暗部）；室内灯（0 白天 → 1 深夜）；曝光；
// 白平衡（像相机：按主光部分校正，材质不被染色）；夜里的补光（苔绿石板色，房子的轮廓不沉进黑背景）。
// 色调跟着 VI「晨光溪岸」：白天中性偏暖、黄昏琥珀 + 暖灰天顶、夜里苔绿石板色（不是藏青 / 紫）+ 暖灯。

const SUNRISE = 7.15;
const SUNSET = 19.3;

// 室内灯（约 2700K 的暖光）—— 内容色（光照），不随 VI 换色
export const LAMP = {
  pool: '#FFBE7C', // 灯池的初值
  lamp: '#FFBB76', // 落地灯 / 吊灯 / 台灯的位置
  ceiling: '#FFC896', // 没有灯具的房间：吸顶的柔光
  beam: '#FFC88A', // 光柱的初值（之后跟着太阳的颜色）
};

// 月光：银灰里带一点苔绿（VI 的夜色），不是蓝 —— 内容色（光照），不随 VI 换色
export const MOON = '#BCC5BF';
// 夜里的补光（像展台上方一盏很弱的冷白灯）：苔绿石板色，只为了让墙头、底座、地面的轮廓读得出来
export const NIGHT_FILL = '#9DB0A8';

// hour, zenith, horizon, ground(地面反光), sun, bgSky(背景窗外), bgRoom(背景室内暗部)
// 内容色（光照），不随 VI 换色。
// 黄昏 / 夜里 / 月亮都是 VI 的低饱和色（饱和度 ≤ .25）：夜 = 苔绿石板 #1E2621–#2E3A36，黄昏天顶 = 暖灰（不是蓝紫）。
// 白天天顶还是天空的蓝 —— 只用在背景窗外的渐变上；环境光 / 半球光里天色最多占 20%（Engine 里中和成暖灰）。
const KEYS = [
  [0, '#1E2621', '#2B3430', '#141814', MOON, '#1F2723', '#0E1311'],
  [5.6, '#262E2A', '#4A4A45', '#181814', MOON, '#2C3330', '#121613'],
  [6.6, '#59625E', '#E2BC9E', '#3C342C', '#FFB890', '#C9A48E', '#2A2824'],
  [7.6, '#6486AE', '#F0DCC8', '#5C5446', '#FFD9B4', '#DCD2C4', '#383632'],
  [10, '#6E91BA', '#E4E9EC', '#686052', '#FFF0DC', '#E1E4E0', '#45443F'],
  [13, '#7297C0', '#ECEFF0', '#6C6456', '#FFF6EA', '#E9EBE7', '#4A4945'],
  [16.4, '#6C8CB4', '#EEDFCC', '#685C4C', '#FFE3C0', '#E4D8C6', '#44403A'],
  [18.2, '#6A675F', '#F0B07C', '#544636', '#FFAA6A', '#E4B288', '#33302C'],
  [19.2, '#3D403B', '#B4876A', '#2E2822', '#FF8A58', '#8E7362', '#23201D'],
  [20.2, '#222B27', '#363E3A', '#151713', MOON, '#26302B', '#111512'],
  [24, '#1E2621', '#2B3430', '#141814', MOON, '#1F2723', '#0E1311'],
];

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
const toLin = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
/** 线性空间、亮度归一成 1 的色度（只要「什么颜色」，不要「多亮」） */
function chroma(hex) {
  const c = hexToRgb(hex).map(toLin);
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] || 1;
  return c.map((v) => v / l);
}

/**
 * 白平衡增益（线性 RGB）：把光源的颜色往白校正 adapt 那么多（0 = 不校正，1 = 完全变白），按亮度归一（明暗不变）。
 */
function gains(hex, adapt) {
  const ill = chroma(hex);
  const g = ill.map((v) => 1 / Math.max(0.2, 1 + (v - 1) * adapt));
  const l = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2] || 1;
  return g.map((v) => +(v / l).toFixed(4));
}
// 室内灯按 ~2700K 校正八成：灯罩、灯泡本身（自发光）还是暖的，照到的材质接近本色（海军蓝不会变紫、亚麻不会变橙）
const WB_LAMP = gains(LAMP.lamp, 0.8);

function keyAt(h) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [h0] = KEYS[i];
    const [h1] = KEYS[i + 1];
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0 || 1);
      return KEYS[i].slice(1).map((c, k) => mixHex(c, KEYS[i + 1][k + 1], t));
    }
  }
  return KEYS[0].slice(1);
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * @param {number} hour 0–24
 * @param {number} northDeg 北方在平面图上的角度（0 = 图纸上方 = -z）
 */
export function daylight(hour, northDeg = 0) {
  const h = ((hour % 24) + 24) % 24;
  const [zenith, horizon, ground, sunColor, bgSky, bgRoom] = keyAt(h);
  const f = (h - SUNRISE) / (SUNSET - SUNRISE);
  const up = f > -0.03 && f < 1.03;
  const arc = Math.sin(clamp01(f) * Math.PI);
  const elevDeg = up ? 4 + 58 * arc : 35;
  // 方位：东(90°) → 南(180°) → 西(270°)；夜里用月亮，挂在西南高处
  const azDeg = up ? 90 + 180 * clamp01(f) : 220;
  const az = ((azDeg + northDeg) * Math.PI) / 180;
  const el = (elevDeg * Math.PI) / 180;
  // 平面图坐标：北 = -z，东 = +x
  const dir = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
  const dayFade = up ? smooth(-0.035, 0.05, f) * (1 - smooth(0.94, 1.03, f)) : 0;
  // 正午不再「曝」：太阳最强 ~2.7，低角度时稍弱、更暖（大气）
  const sunIntensity = up ? 0.35 + 2.35 * dayFade * (0.6 + 0.4 * arc) : 0.55;
  const night = clamp01(1 - smooth(0, 1, Math.min((h - 6.2) / 1.1, (19.6 - h) / 1.2)));
  const evening = h > 12 ? smooth(17.4, 18.6, h) : smooth(7.5, 6.6, h);
  // 黄金时段（日出后 / 日落前）：光更暖、更斜，体积光最明显
  const golden = up ? Math.max(1 - smooth(0.0, 0.16, f), smooth(0.8, 0.98, f)) * dayFade : 0;
  const lamps = Math.max(night, evening * 0.55);
  const sunC = up ? sunColor : MOON;
  // 窗外（天光卡）的颜色：跟背景照片里窗外的天色一致；白天按日光强度再提亮一点（窗是屋里最亮的地方），夜里就是深苔绿的夜色
  const paneSky = mixHex(bgSky, '#FFFFFF', 0.18 * dayFade);
  return {
    hour: h,
    dir,
    up,
    elevDeg,
    sunColor: sunC,
    sunIntensity,
    // 白平衡（像室内摄影，线性 RGB 增益）。按光源分两组，各自校正：
    // wb —— 太阳（和它在环境光里的暖晕、光柱）：白天几乎不动；黄金时段校正一半（阳光照到的地方仍是金色，但材质不被染橙、不发紫）；
    //       夜里不校正（月光、夜色本来就是 VI 的苔绿石板色，校正反而会变蓝）。
    // wbLamp —— 室内灯（和环境光里的几块暖灯面）：按灯的颜色校正八成。
    wb: up ? gains(sunC, (0.42 + 0.08 * golden) * dayFade) : [1, 1, 1],
    wbLamp: WB_LAMP,
    // 夜里的补光：苔绿石板色、柔和、不投影 —— 像展台上方一盏弱灯，墙头 / 底座 / 地面的轮廓读得出来；灯仍然是主角。
    // （深色方案在引擎里再按「房间测光」加一点：炭灰墙 + 胡桃木的「沉浸」不会沉成一片黑，浅色方案也不会被照成白天）
    fillColor: NIGHT_FILL,
    fillIntensity: 0.3 * night,
    // 夜里的灯：亮一点、照得远一点（暖光的灯池铺到墙和地板上），乘在每盏灯自己的强度 / 照射距离上
    lampPower: 1 + 0.5 * night,
    lampReach: 1 + 0.35 * night,
    // 半球光只留一点「地面反光」的暖意，主要的填充光交给 IBL（有方向，体积感更好）
    hemiSky: zenith,
    hemiGround: ground,
    hemiIntensity: 0.06 + 0.16 * dayFade,
    // IBL 天穹
    skyZenith: zenith,
    skyHorizon: horizon,
    skyGround: ground,
    // 夜里的环境光主要是「被灯照亮的天花板」反下来的暖光（EnvStudio），所以夜里也要有一定强度
    envIntensity: 0.3 + 0.7 * dayFade + 0.5 * night,
    // 窗口进来的天光（RectAreaLight）：白天 1，黄金时段略暖，夜里 0
    windowColor: mixHex(horizon, '#FFFFFF', 0.35),
    windowLight: dayFade * (0.75 + 0.25 * arc),
    // 背景：虚化的室内照片（上部是窗，下部是房间暗部 / 地面）
    bgTop: bgSky,
    bgBottom: bgRoom,
    bgSky,
    bgRoom,
    paneSky,
    golden,
    night,
    lamps,
    // 曝光跟着时段：白天略收、黄金时段略提；夜里像室内夜景摄影那样按房间曝光，再提 ~0.45 EV
    // （房子和底座不沉进黑背景，夜色背景仍然很暗，灯仍然最亮）
    exposure: (1.0 + 0.14 * night - 0.06 * dayFade * arc + 0.2 * golden) * 2 ** (0.45 * night),
    beams: up ? dayFade * (1 - smooth(25, 55, elevDeg)) : 0,
    // 环境贴图缓存键：每半小时一档（只有跨档才重建 PMREM）
    envKey: `${Math.round(h * 2) / 2}|${Math.round(northDeg)}`,
  };
}

export function fmtTime(h) {
  const t = ((h % 24) + 24) % 24;
  const hh = Math.floor(t);
  const mm = Math.round((t - hh) * 60);
  return `${String(mm === 60 ? hh + 1 : hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`;
}

export const DAY_PRESETS = [
  { id: 'morning', zh: '清晨', en: 'Morning', hour: 7.6 },
  { id: 'midday', zh: '正午', en: 'Midday', hour: 12.8 },
  { id: 'evening', zh: '傍晚', en: 'Evening', hour: 18.5 },
  { id: 'night', zh: '深夜', en: 'Night', hour: 22.2 },
];
