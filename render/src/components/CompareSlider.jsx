import React, { useState } from 'react';
import { ChevronsLeftRight } from 'lucide-react';

/** 前后对比滑块：before 显示在左侧（按 pos% 裁切），after 铺满底层 */
export default function CompareSlider({ before, after }) {
  const [pos, setPos] = useState(50);

  return (
    <div className="relative w-full max-h-[80vh] rounded-xl overflow-hidden select-none bg-black">
      <img src={after} alt="效果图" className="w-full max-h-[80vh] object-contain" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before} alt="原图" className="w-full h-full object-contain" draggable={false} />
      </div>

      <div className="absolute inset-y-0 pointer-events-none" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -translate-x-1/2 w-0.5 bg-white/90" />
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center text-sail-ink">
          <ChevronsLeftRight size={18} />
        </div>
      </div>

      <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-black/50 text-white text-xs">原图</div>
      <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-black/50 text-white text-xs">效果图</div>

      <input
        type="range"
        min="0"
        max="100"
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        className="compare-range absolute inset-0 w-full h-full cursor-ew-resize"
        aria-label="拖动对比原图与效果图"
      />
    </div>
  );
}
