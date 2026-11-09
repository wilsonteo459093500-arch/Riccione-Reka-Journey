// KIRA 字标：一个分格的柜子 + K（和 public/icon.svg 同一个图形）
export default function KiraMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-label="KIRA" role="img" className="shrink-0">
      <rect width="512" height="512" rx="96" fill="#2D3E36" />
      <rect x="112" y="136" width="288" height="240" rx="6" fill="none" stroke="#B8945E" strokeWidth="14" />
      <line x1="256" y1="136" x2="256" y2="376" stroke="#B8945E" strokeWidth="10" />
      <line x1="112" y1="296" x2="400" y2="296" stroke="#B8945E" strokeWidth="10" />
      <text x="256" y="262" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="150" fill="#FAF8F3">K</text>
    </svg>
  );
}
