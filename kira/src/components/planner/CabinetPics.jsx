// 柜子小图：线稿立面 + 小 3D（工具里的卡片、报价单明细旁边都用这个）
import { useMemo } from 'react';
import SvgShapes from '../../render/SvgShapes.jsx';
import { elevationScene } from '../../render/elevation.js';
import { axoScene } from '../../render/axo.js';

export function useScenes(cab, { lang = 'both', dims = true } = {}) {
  return useMemo(() => {
    try {
      return {
        elev: elevationScene(cab, { style: 'drawing', dims, lang }),
        axo: axoScene(cab, { yaw: cab?.view?.yaw ?? -30 }),
      };
    } catch (e) {
      return { elev: null, axo: null };
    }
  }, [cab, lang, dims]);
}

// height：图高（CSS 长度）。宽的柜子（厨房）上下叠，窄的左右并排。
export default function CabinetPics({ cab, lang = 'both', height = '45mm', dims = true, gap = 6 }) {
  const { elev, axo } = useScenes(cab, { lang, dims });
  if (!elev && !axo) return null;
  const aspect = elev ? elev.viewBox[2] / Math.max(1, elev.viewBox[3]) : 1;
  const stack = aspect > 1.35;
  return (
    <div className="kira-pics" style={{ display: 'flex', flexDirection: stack ? 'column' : 'row', gap, alignItems: 'flex-start', breakInside: 'avoid' }}>
      {elev && <SvgShapes scene={elev} title={`${cab.code} elevation`} style={{ height: stack ? `calc(${height} * 0.8)` : height, width: 'auto', maxWidth: stack ? '100%' : '50%', display: 'block' }} />}
      {axo && <SvgShapes scene={axo} title={`${cab.code} 3D`} style={{ height: stack ? `calc(${height} * 0.8)` : height, width: 'auto', maxWidth: stack ? '100%' : '50%', display: 'block' }} />}
    </div>
  );
}
