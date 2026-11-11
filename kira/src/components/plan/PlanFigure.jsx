// 报价单「平面索引图」：户型图 + 柜子外框 + K1 / K2 编号（纯 SVG，长图 / 打印都出得来）
//   href 用 data URL（截图时不用再下载）；只画放在这张图上的柜子；默认整张图（crop 才裁到柜子周围）
import { BLOCK_COLORS, INK } from '../../render/palette.js';
import { mmPerPx, placedFootprint } from '../../planner/plan.js';

export default function PlanFigure({ plan, href, cabinets = [], crop = false, style }) {
  const k = mmPerPx(plan);
  const W = plan?.image?.w || 1, H = plan?.image?.h || 1;
  const placed = k > 0 ? cabinets.filter((c) => c.place?.planId === plan.id).map((c) => ({ c, fp: placedFootprint(c) })) : [];
  let vb = [0, 0, W, H];
  if (crop && placed.length) {
    const xs = placed.flatMap(({ fp }) => [fp.bbox[0] / k, fp.bbox[2] / k]), ys = placed.flatMap(({ fp }) => [fp.bbox[1] / k, fp.bbox[3] / k]);
    const pad = Math.max(W, H) * 0.08;
    const x0 = Math.max(0, Math.min(...xs) - pad), y0 = Math.max(0, Math.min(...ys) - pad);
    const x1 = Math.min(W, Math.max(...xs) + pad), y1 = Math.min(H, Math.max(...ys) + pad);
    // 至少留整张图一半大小（看得出在屋子哪里）
    const cw = Math.max(x1 - x0, W * 0.5), ch = Math.max(y1 - y0, H * 0.5);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    vb = [Math.max(0, Math.min(W - cw, cx - cw / 2)), Math.max(0, Math.min(H - ch, cy - ch / 2)), Math.min(W, cw), Math.min(H, ch)];
  }
  const u = Math.max(vb[2], vb[3]) / 600; // 线宽 / 字号跟着图的大小
  return (
    <svg viewBox={vb.join(' ')} style={{ width: '100%', height: 'auto', display: 'block', ...style }} data-plan-figure>
      <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} fill="#fff" />
      {href && <image href={href} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />}
      {placed.map(({ c, fp }) => {
        const b = fp.bbox.map((v) => v / k);
        return (
          <g key={c.id}>
            {fp.parts.map((p) => {
              const r = p.rect.map((v) => v / k);
              return <rect key={p.id} x={r[0]} y={r[1]} width={r[2] - r[0]} height={r[3] - r[1]} fill={p.floor ? BLOCK_COLORS.closed : 'none'} fillOpacity={0.85}
                stroke={INK} strokeWidth={1.4 * u} strokeDasharray={p.floor ? undefined : `${4 * u} ${3 * u}`} />;
            })}
            <text x={(b[0] + b[2]) / 2} y={(b[1] + b[3]) / 2} fontSize={Math.min(16 * u, (b[3] - b[1]) * 0.7, (b[2] - b[0]) * 0.45)} textAnchor="middle" dominantBaseline="central" fill={INK} fontWeight={700}>{c.code}</text>
          </g>
        );
      })}
    </svg>
  );
}
