// P.L.A.Y 字标：四块像素字块，一上一下轻轻跳
import { Sprite, LETTERS } from './pixel.jsx';

const TILES = [
  ['P', '#e04a3c', '#9c2a22'],
  ['L', '#f2c14e', '#b7791f'],
  ['A', '#3c7fd1', '#22508f'],
  ['Y', '#5fae3b', '#346b1f'],
];

export function Logo({ scale = 5 }) {
  return (
    <span className="logo" aria-label="P.L.A.Y">
      {TILES.map(([ch, c, d], i) => (
        <span key={ch} className="logo-tile" style={{ '--tile': c, '--tile-d': d, animationDelay: `${i * 0.15}s` }}>
          <Sprite rows={LETTERS[ch].map((r) => r.replaceAll('#', 'w'))} pal={{ w: '#fff8e6' }} scale={scale} />
          {i < 3 ? <span className="logo-dot" /> : null}
        </span>
      ))}
    </span>
  );
}
