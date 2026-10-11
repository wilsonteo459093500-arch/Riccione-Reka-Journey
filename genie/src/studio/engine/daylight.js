// 24 小时光影（马来西亚：约 7:10 日出、19:20 日落，太阳几乎从头顶划过）。纯函数。
// 输出：太阳方向（考虑房子朝向 north）、颜色、强度；天空（环境光 IBL 的天穹：天顶 / 地平线 / 地面反光）；
// 窗口进来的天光；背景（虚化的室内照片：窗外的天色 + 房间暗部）；室内灯（0 白天 → 1 深夜）；曝光。
// 色调跟着溪岸 SAIL × 大自然：白天中性偏暖、黄昏琥珀、夜里林间暮色（深绿蓝）+ 暖灯。

const SUNRISE = 7.15;
const SUNSET = 19.3;

// hour, zenith, horizon, ground(地面反光), sun, bgSky(背景窗外), bgRoom(背景室内暗部)
// 内容色（光照），不随 VI 换色
const KEYS = [
  [0, '#1A2A44', '#2E4050', '#141814', '#9FB4D8', '#1E2C33', '#0E1311'],
  [5.6, '#22304C', '#46505E', '#181814', '#A9BCDD', '#2C3640', '#121613'],
  [6.6, '#4A6488', '#E6B694', '#3C342C', '#FFB890', '#C9A48E', '#2A2824'],
  [7.6, '#6486AE', '#F0DCC8', '#5C5446', '#FFD9B4', '#DCD2C4', '#383632'],
  [10, '#6E91BA', '#E4E9EC', '#686052', '#FFF0DC', '#E1E4E0', '#45443F'],
  [13, '#7297C0', '#ECEFF0', '#6C6456', '#FFF6EA', '#E9EBE7', '#4A4945'],
  [16.4, '#6C8CB4', '#EEDFCC', '#685C4C', '#FFE3C0', '#E4D8C6', '#44403A'],
  [18.2, '#56709A', '#F0B07C', '#544636', '#FFAA6A', '#E4B288', '#33302C'],
  [19.2, '#34446A', '#C47C66', '#2E2822', '#FF8A58', '#9C6E62', '#23201D'],
  [20.2, '#1C2A44', '#3A4656', '#151713', '#9FB4D8', '#26323C', '#111512'],
  [24, '#1A2A44', '#2E4050', '#141814', '#9FB4D8', '#1E2C33', '#0E1311'],
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
  return {
    hour: h,
    dir,
    up,
    elevDeg,
    sunColor: up ? sunColor : '#9FB4D8',
    sunIntensity,
    // 半球光只留一点「地面反光」的暖意，主要的填充光交给 IBL（有方向，体积感更好）
    hemiSky: zenith,
    hemiGround: ground,
    hemiIntensity: 0.06 + 0.16 * dayFade,
    // IBL 天穹
    skyZenith: zenith,
    skyHorizon: horizon,
    skyGround: ground,
    envIntensity: 0.3 + 0.7 * dayFade + 0.25 * night,
    // 窗口进来的天光（RectAreaLight）：白天 1，黄金时段略暖，夜里 0
    windowColor: mixHex(horizon, '#FFFFFF', 0.35),
    windowLight: dayFade * (0.75 + 0.25 * arc),
    // 背景：虚化的室内照片（上部是窗，下部是房间暗部 / 地面）
    bgTop: bgSky,
    bgBottom: bgRoom,
    bgSky,
    bgRoom,
    golden,
    night,
    lamps,
    // 曝光跟着时段：白天略收、夜里略提（PBR Neutral 色调映射下颜色基本不偏）
    exposure: 1.0 + 0.14 * night - 0.06 * dayFade * arc + 0.14 * golden,
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
