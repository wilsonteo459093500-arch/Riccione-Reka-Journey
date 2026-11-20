// ============================================================
// 飘板 Floating shelf 价格表（用户提供，2026-11）：每块板按「宽度档」计价，人民币零售价
//   → 马币 = MROUND(人民币 × 1.3 ÷ 1.65, 5)（同 pricing.js 的 cnyToMyr）
// 系列分组：A/B/C · D/E/F · G/H/I · J/K（跟这块板的门板系列）
// 宽度档：W ≤ 第一档上限 → 第一档（不到 600 也按第一档 = 最小计价）；超过最长 → 分成几块等长的板，每块照档计价
// pricing.js 是旧报价工具原样复制（sha256 锁住），所以飘板价格单独放这里。
// ============================================================
import { cnyToMyr } from './pricing.js';

export const SHELF_GROUPS = [
  { id: 'ABC', series: ['A', 'B', 'C'] },
  { id: 'DEF', series: ['D', 'E', 'F'] },
  { id: 'GHI', series: ['G', 'H', 'I'] },
  { id: 'JK', series: ['J', 'K'] },
];
export const shelfGroup = (series) => (SHELF_GROUPS.find((g) => g.series.includes(series)) || SHELF_GROUPS[0]).id;

export const SHELF_KINDS = [
  {
    id: 'pin', t: 18, zh: '18 / 25–36mm 飘板 · 一字层板销', en: '18 / 25–36 mm shelf · rod pins',
    short: { zh: '一字层板销', en: 'rod pins' },
    minW: 600, maxW: 1500, minD: 200, maxD: 250, brackets: [1000, 1200, 1500],
    cny: { ABC: [470, 570, 670], DEF: [770, 870, 970], GHI: [1070, 1170, 1270], JK: [1370, 1470, 1570] },
  },
  {
    id: 'if25', t: 25, zh: '25mm 飘板 · IF 隐形层板销', en: '25 mm shelf · hidden IF pins',
    short: { zh: '25mm 隐形层板销', en: '25 mm hidden pins' },
    minW: 600, maxW: 2000, minD: 165, maxD: 300, brackets: [1000, 1600, 2000],
    cny: { ABC: [1070, 1570, 2070], DEF: [1270, 1770, 2270], GHI: [1470, 1970, 2470], JK: [1670, 2170, 2670] },
  },
  {
    id: 'if36', t: 36, zh: '36mm 飘板 · IF 隐形层板销', en: '36 mm shelf · hidden IF pins',
    short: { zh: '36mm 隐形层板销', en: '36 mm hidden pins' },
    minW: 600, maxW: 2000, minD: 165, maxD: 300, brackets: [1000, 1600, 2000],
    cny: { ABC: [1370, 1870, 2370], DEF: [1570, 2070, 2570], GHI: [1770, 2270, 2770], JK: [1970, 2470, 2970] },
  },
  {
    id: 'heavy50', t: 50, zh: '50mm 飘板 · 5 寸重型层板销', en: '50 mm shelf · 5" heavy pins',
    short: { zh: '50mm 重型层板销', en: '50 mm heavy pins' },
    minW: 600, maxW: 2000, minD: 165, maxD: 300, brackets: [1000, 1600, 2000],
    cny: { ABC: [1870, 2170, 2670], DEF: [2070, 2370, 2870], GHI: [2270, 2570, 3070], JK: [2470, 2770, 3270] },
  },
];
export const DEFAULT_SHELF_KIND = 'if25';
export const shelfKind = (id) => SHELF_KINDS.find((k) => k.id === id) || SHELF_KINDS.find((k) => k.id === DEFAULT_SHELF_KIND);

// 一块长 W 的板 → [{ w, bracket, cny, myr }]（超过最长就分成 n 块等长）
export function shelfBoards(kindId, series, W) {
  const k = shelfKind(kindId);
  const w0 = Math.max(0, Math.round(Number(W) || 0));
  if (!w0) return [];
  const n = Math.max(1, Math.ceil(w0 / k.maxW));
  const g = shelfGroup(series);
  const out = [];
  for (let i = 0; i < n; i++) {
    const w = Math.floor(w0 / n) + (i < w0 % n ? 1 : 0);
    let b = k.brackets.findIndex((lim) => w <= lim);
    if (b < 0) b = k.brackets.length - 1;
    const cny = k.cny[g][b];
    out.push({ w, bracket: b, cny, myr: cnyToMyr(cny) });
  }
  return out;
}

// 宽度档的文字：「≤1.00 m」「1.00–1.60 m」
export const bracketLabel = (kindId, b) => {
  const k = shelfKind(kindId);
  const hi = (k.brackets[b] / 1000).toFixed(2);
  return b === 0 ? `≤${hi} m` : `${(k.brackets[b - 1] / 1000).toFixed(2)}–${hi} m`;
};
