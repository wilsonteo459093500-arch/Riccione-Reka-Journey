// 密码机的颜色 + 形状（色弱也分得出来），像素画。
// 顺序跟 shared/codebreaker-vectors.json 的 colors 一样。
// 形状用数学画在 14×14 格子上，程序自动加深色外框、左上亮、右下暗。
import { useMemo } from 'react';
import { Sprite } from '../../ui/pixel.jsx';

export const PALETTE = [
  { color: '#e04a3c', light: '#ff8a6b', dark: '#9c2a22', shape: 'circle', name: { zh: '红', en: 'red' } },
  { color: '#f2c14e', light: '#ffe48a', dark: '#b7791f', shape: 'triangle', name: { zh: '黄', en: 'yellow' } },
  { color: '#3c7fd1', light: '#7fb6ff', dark: '#22508f', shape: 'square', name: { zh: '蓝', en: 'blue' } },
  { color: '#5fae3b', light: '#9fdc6a', dark: '#346b1f', shape: 'diamond', name: { zh: '绿', en: 'green' } },
  { color: '#9b5fc0', light: '#cf9cf0', dark: '#5e3480', shape: 'star', name: { zh: '紫', en: 'purple' } },
  { color: '#f08a2c', light: '#ffbe73', dark: '#a8551a', shape: 'hexagon', name: { zh: '橙', en: 'orange' } },
  { color: '#e8669a', light: '#ffa6c8', dark: '#a33a66', shape: 'heart', name: { zh: '粉', en: 'pink' } },
  { color: '#2fb3a5', light: '#7fe6d8', dark: '#1a7268', shape: 'cross', name: { zh: '青', en: 'teal' } },
];

const N = 14;
const C = (N - 1) / 2;

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const star = Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  const r = i % 2 ? 3.1 : 7.2;
  return [C + r * Math.cos(a), C + 0.6 + r * Math.sin(a)];
});
const hex = Array.from({ length: 6 }, (_, i) => {
  const a = (i * Math.PI) / 3;
  return [C + 6.9 * Math.cos(a), C + 6.2 * Math.sin(a)];
});

const SHAPES = {
  circle: (x, y) => (x - C) ** 2 + (y - C) ** 2 <= 6.6 ** 2,
  triangle: (x, y) => y >= 0.5 && y <= 12.8 && Math.abs(x - C) <= (y + 0.2) * 0.55,
  square: (x, y) => x >= 0.6 && x <= 12.4 && y >= 0.6 && y <= 12.4,
  diamond: (x, y) => Math.abs(x - C) + Math.abs(y - C) <= 7,
  star: (x, y) => inPoly(x, y, star),
  hexagon: (x, y) => inPoly(x, y, hex),
  heart: (x, y) => {
    const u = (x - C) / 6.2;
    const v = -(y - C - 0.6) / 6.2;
    return (u * u + v * v - 0.62) ** 3 - u * u * v * v * v <= 0;
  },
  cross: (x, y) => (Math.abs(x - C) <= 2.4 && y >= 0.5 && y <= 12.5) || (Math.abs(y - C) <= 2.4 && x >= 0.5 && x <= 12.5),
};

/** 形状 → 一行行的字串：k 外框、l 亮、c 本色、d 暗 */
export function pegRows(shape) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N && SHAPES[shape](x, y);
  const rows = [];
  for (let y = 0; y < N; y++) {
    let row = '';
    for (let x = 0; x < N; x++) {
      if (!inside(x, y)) row += '.';
      else if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) row += 'k';
      else if (!inside(x - 2, y) || !inside(x, y - 2)) row += 'l';
      else if (!inside(x + 2, y) || !inside(x, y + 2)) row += 'd';
      else row += 'c';
    }
    rows.push(row);
  }
  return rows;
}

const ROWS = Object.fromEntries(Object.keys(SHAPES).map((s) => [s, pegRows(s)]));

export function Peg({ c, size = 28, lang = 'zh' }) {
  const p = c == null || c < 0 ? null : PALETTE[c];
  const pal = useMemo(() => (p ? { k: '#2b1a10', l: p.light, c: p.color, d: p.dark } : null), [p]);
  if (!p) return <span className="peg peg-empty" style={{ width: size, height: size }} />;
  return <Sprite rows={ROWS[p.shape]} pal={pal} scale={size / N} title={p.name[lang]} className="peg" />;
}

/** ■■ □ 的提示 */
export function Feedback({ exact, near, slots }) {
  const dots = [];
  for (let i = 0; i < exact; i++) dots.push('exact');
  for (let i = 0; i < near; i++) dots.push('near');
  while (dots.length < slots) dots.push('none');
  return (
    <span className="fb" aria-label={`${exact} / ${near}`}>
      {dots.map((d, i) => (
        <span key={i} className={`fb-dot fb-${d}`} />
      ))}
    </span>
  );
}
