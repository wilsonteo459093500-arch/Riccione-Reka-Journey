// P.L.A.Y 字标：四个彩色方块，跟密码机的颜色一样
const TILES = [
  ['P', '#E5484D'],
  ['L', '#F2B705'],
  ['A', '#2F6FED'],
  ['Y', '#2DA44E'],
];

export function Logo({ size = 44 }) {
  return (
    <span className="logo" aria-label="P.L.A.Y">
      {TILES.map(([ch, color], i) => (
        <span key={ch} className="logo-tile" style={{ background: color, width: size, height: size, fontSize: size * 0.58, transform: `rotate(${[-4, 3, -2, 4][i]}deg)` }}>
          {ch}
        </span>
      ))}
    </span>
  );
}
