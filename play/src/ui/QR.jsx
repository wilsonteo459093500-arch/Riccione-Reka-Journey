import { useMemo } from 'react';
import { qrPath } from '../lib/qr.js';

export function QR({ text, size = 200, label }) {
  const { n, d } = useMemo(() => qrPath(text), [text]);
  const m = 2; // 白边
  return (
    <svg className="qr" width={size} height={size} viewBox={`${-m} ${-m} ${n + m * 2} ${n + m * 2}`} role="img" aria-label={label || text} shapeRendering="crispEdges">
      <rect x={-m} y={-m} width={n + m * 2} height={n + m * 2} fill="#fff" />
      <path d={d} fill="#111" />
    </svg>
  );
}
