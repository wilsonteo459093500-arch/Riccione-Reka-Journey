// 颜色 + 形状（色弱也分得出来）。顺序跟 shared/codebreaker-vectors.json 的 colors 一样。
export const PALETTE = [
  { color: '#E5484D', shape: 'circle', name: { zh: '红', en: 'red' } },
  { color: '#F2B705', shape: 'triangle', name: { zh: '黄', en: 'yellow' } },
  { color: '#2F6FED', shape: 'square', name: { zh: '蓝', en: 'blue' } },
  { color: '#2DA44E', shape: 'diamond', name: { zh: '绿', en: 'green' } },
  { color: '#8E4EC6', shape: 'star', name: { zh: '紫', en: 'purple' } },
  { color: '#F76B15', shape: 'hexagon', name: { zh: '橙', en: 'orange' } },
  { color: '#E93D82', shape: 'heart', name: { zh: '粉', en: 'pink' } },
  { color: '#12A594', shape: 'cross', name: { zh: '青', en: 'teal' } },
];

const SHAPES = {
  circle: <circle cx="12" cy="12" r="9" />,
  triangle: <path d="M12 2.8 22 20.5H2z" />,
  square: <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />,
  diamond: <path d="M12 1.8 22.2 12 12 22.2 1.8 12z" />,
  star: <path d="m12 1.8 3 6.6 7.2.7-5.4 4.9 1.6 7.1L12 17.4l-6.4 3.7 1.6-7.1-5.4-4.9 7.2-.7z" />,
  hexagon: <path d="M7 3h10l5 9-5 9H7l-5-9z" />,
  heart: <path d="M12 21.2s-9.5-5.8-9.5-12A5.3 5.3 0 0 1 12 5.6a5.3 5.3 0 0 1 9.5 3.6c0 6.2-9.5 12-9.5 12z" />,
  cross: <path d="M8.5 2.5h7v6h6v7h-6v6h-7v-6h-6v-7h6z" />,
};

export function Peg({ c, size = 30, lang = 'zh' }) {
  if (c == null || c < 0) return <span className="peg peg-empty" style={{ width: size, height: size }} />;
  const p = PALETTE[c];
  return (
    <svg className="peg" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={p.name[lang]}>
      <g fill={p.color} stroke="rgba(0,0,0,.18)" strokeWidth="1">
        {SHAPES[p.shape]}
      </g>
    </svg>
  );
}

/** ●● ○ 的提示 */
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
