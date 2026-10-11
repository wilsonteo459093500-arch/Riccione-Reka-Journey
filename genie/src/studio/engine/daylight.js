// 24 小时光影（马来西亚：约 7:10 日出、19:20 日落，太阳几乎从头顶划过）。纯函数。
// 输出太阳方向（考虑房子朝向 north）、颜色、强度，天空颜色，室内灯的亮度（0 白天 → 1 深夜）。

const SUNRISE = 7.15;
const SUNSET = 19.3;

const KEYS = [
  // hour, bgTop, bgBottom, hemiSky, hemiGround, sunColor
  [0, '#0C1411', '#1A231D', '#2A3A4A', '#1A1512', '#9FB4D8'],
  [5.6, '#13201B', '#2A2E28', '#344A58', '#231C18', '#A9BCDD'],
  [6.6, '#3A4A4A', '#B9937A', '#8FA0AA', '#4A3A30', '#FFB08A'],
  [7.6, '#3E5070', '#A88E7A', '#B9C8E4', '#6E5A48', '#FFC89A'],
  [10, '#3F5577', '#7F8C9A', '#CFE0F2', '#8A7A66', '#FFF1DE'],
  [13, '#42587A', '#87939F', '#D8E6F5', '#94826C', '#FFF6E8'],
  [16.4, '#3E5266', '#9A8B78', '#D6DCE4', '#8E7A62', '#FFE2BC'],
  [18.2, '#3C4A5C', '#E2A06E', '#C9AE98', '#6E5040', '#FF9F5E'],
  [19.2, '#25332F', '#B86A4E', '#6A7480', '#3A2C26', '#FF7E4A'],
  [20.2, '#122019', '#2E2E2A', '#344A58', '#221B17', '#9FB4D8'],
  [24, '#0C1411', '#1A231D', '#2A3A4A', '#1A1512', '#9FB4D8'],
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

/**
 * @param {number} hour 0–24
 * @param {number} northDeg 北方在平面图上的角度（0 = 图纸上方 = -z）
 */
export function daylight(hour, northDeg = 0) {
  const h = ((hour % 24) + 24) % 24;
  const [bgTop, bgBottom, hemiSky, hemiGround, sunColor] = keyAt(h);
  const f = (h - SUNRISE) / (SUNSET - SUNRISE);
  const up = f > -0.03 && f < 1.03;
  const elevDeg = up ? 4 + 58 * Math.sin(Math.max(0, Math.min(1, f)) * Math.PI) : 35;
  // 方位：东(90°) → 南(180°) → 西(270°)；夜里用月亮，挂在西南高处
  const azDeg = up ? 90 + 180 * Math.max(0, Math.min(1, f)) : 220;
  const az = ((azDeg + northDeg) * Math.PI) / 180;
  const el = (elevDeg * Math.PI) / 180;
  // 平面图坐标：北 = -z，东 = +x
  const dir = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
  const dayFade = up ? smooth(-0.03, 0.06, f) * (1 - smooth(0.94, 1.03, f)) : 0;
  const sunIntensity = up ? 0.4 + 2.5 * dayFade * (0.6 + 0.4 * Math.sin(Math.max(0, Math.min(1, f)) * Math.PI)) : 0.22;
  const night = 1 - smooth(0, 1, Math.min((h - 6.2) / 1.1, (19.6 - h) / 1.2));
  const evening = h > 12 ? smooth(17.4, 18.6, h) : smooth(7.5, 6.6, h);
  return {
    hour: h,
    dir,
    up,
    elevDeg,
    sunColor: up ? sunColor : '#9FB4D8',
    sunIntensity,
    hemiSky,
    hemiGround,
    hemiIntensity: 0.22 + 0.5 * dayFade,
    bgTop,
    bgBottom,
    night: Math.max(0, Math.min(1, night)),
    lamps: Math.max(Math.max(0, Math.min(1, night)), evening * 0.55),
    exposure: 0.92 + 0.3 * Math.max(0, Math.min(1, night)),
    beams: up ? dayFade * (1 - smooth(25, 55, elevDeg)) : 0,
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
