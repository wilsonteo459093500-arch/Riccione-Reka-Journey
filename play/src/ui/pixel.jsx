// 像素小图：全部用 SVG 方块画（不用图片档、不会糊）
import { useMemo } from 'react';

/**
 * 用字串画像素图。rows 每一行一样长；'.' 是透明，其他字照 pal 上色。
 * scale = 每格几个 CSS 像素
 */
export function Sprite({ rows, pal, scale = 3, title, className = '' }) {
  const h = rows.length;
  const w = rows[0].length;
  const rects = useMemo(() => {
    const out = [];
    rows.forEach((row, y) => {
      // 同一行同色连在一起的合成一个长方形（方块少一点）
      let x = 0;
      while (x < w) {
        const ch = row[x];
        let x2 = x + 1;
        while (x2 < w && row[x2] === ch) x2++;
        if (ch !== '.' && ch !== ' ' && pal[ch]) out.push(<rect key={`${x}-${y}`} x={x} y={y} width={x2 - x} height={1} fill={pal[ch]} />);
        x = x2;
      }
    });
    return out;
  }, [rows, pal, w]);
  return (
    <svg
      className={`sprite ${className}`}
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {rects}
    </svg>
  );
}

// 5×7 的像素字母（字标和图示用，不靠字体）
export const LETTERS = {
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
};

/** 一块彩色像素字块（字标、游戏图示、奖牌） */
export function Tile({ children, color, dark, size = 48, className = '', style }) {
  return (
    <span
      className={`tile ${className}`}
      style={{ '--tile': color, '--tile-d': dark || 'rgba(0,0,0,.35)', width: size, height: size, fontSize: size >= 48 ? 24 : 18, ...style }}
    >
      {children}
    </span>
  );
}

export function Check({ scale = 3 }) {
  return (
    <Sprite
      scale={scale}
      title="✓"
      pal={{ g: '#5fae3b', k: '#2f5e1c' }}
      rows={['.......kk', '......kgk', 'kk...kgk.', 'kgk.kgk..', '.kgkgk...', '..kgk....', '...k.....']}
    />
  );
}

export function Cross({ scale = 3 }) {
  return (
    <Sprite
      scale={scale}
      title="✕"
      pal={{ r: '#d9483b', k: '#6b1d16' }}
      rows={['kk...kk', 'krk.krk', '.krkrk.', '..krk..', '.krkrk.', 'krk.krk', 'kk...kk']}
    />
  );
}

export function Crown({ scale = 2 }) {
  return (
    <Sprite
      scale={scale}
      title="👑"
      pal={{ y: '#f2c14e', o: '#b7791f', r: '#d9483b', k: '#5a3214' }}
      rows={['k...k...k', 'yk.kyk.ky', 'yykyyykyy', 'yyyyyyyyy', 'yyryyyryy', 'yyyyyyyyy', 'ooooooooo']}
    />
  );
}

const MEDAL = [
  ['#f2c14e', '#a8741a'],
  ['#d7dde4', '#7c8794'],
  ['#d98e4a', '#8a4f1e'],
];
export function Medal({ place }) {
  const [c, d] = MEDAL[place] || ['#c9b48a', '#7a6440'];
  return (
    <Tile color={c} dark={d} size={30} className="medal">
      {place + 1}
    </Tile>
  );
}

/** 一闪一闪的三个方块（等待中） */
export function Dots() {
  return (
    <span className="px-dots" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}
