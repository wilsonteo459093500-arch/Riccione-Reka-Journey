// 把渲染器输出的「图形清单」（纯数据，单位 mm，SVG 坐标 y 向下）画成 <svg>。
// 渲染器（elevation.js / axo.js）只产出数据，可以在 Node 里测试；这里只负责画。
// 文字一律走 React 文本节点（自动转义，不用 innerHTML）。
export default function SvgShapes({ scene, width, height, className, style, title }) {
  if (!scene) return null;
  const { viewBox, shapes = [] } = scene;
  return (
    <svg viewBox={viewBox.join(' ')} width={width} height={height} className={className} style={style}
      xmlns="http://www.w3.org/2000/svg" role="img" aria-label={title || ''} preserveAspectRatio="xMidYMid meet">
      {shapes.map((s, i) => {
        const common = { fill: s.fill ?? 'none', stroke: s.stroke ?? 'none', strokeWidth: s.sw ?? 0, opacity: s.opacity,
          strokeDasharray: s.dash, strokeLinejoin: 'round', strokeLinecap: 'round' };
        if (s.t === 'rect') return <rect key={i} x={s.x} y={s.y} width={Math.max(0, s.w)} height={Math.max(0, s.h)} rx={s.rx} {...common} />;
        if (s.t === 'line') return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} {...common} fill="none" />;
        if (s.t === 'circle') return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} {...common} />;
        if (s.t === 'path') return <path key={i} d={s.d} {...common} />;
        if (s.t === 'poly') return <polygon key={i} points={s.points.map((p) => p.join(',')).join(' ')} {...common} />;
        if (s.t === 'text') return (
          <text key={i} x={s.x} y={s.y} fontSize={s.size} textAnchor={s.anchor || 'start'} fill={s.fill || '#2D3E36'}
            fontWeight={s.weight} fontFamily="Manrope, system-ui, sans-serif" dominantBaseline={s.baseline || 'alphabetic'}
            transform={s.rotate ? `rotate(${s.rotate} ${s.x} ${s.y})` : undefined}>{s.text}</text>
        );
        return null;
      })}
    </svg>
  );
}
