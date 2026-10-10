import React, { useEffect, useMemo } from 'react';
import { Palette, ArrowUpRight, Info } from 'lucide-react';
import { MATERIALS_PER_PAGE } from '../../../engine/layouts.js';
import { requestThumbs, useThumbsSig } from '../thumbs.js';
import { Section, btnPrimary } from '../ui.jsx';
import { Swatch } from '../MaterialPicker.jsx';

// 本案材料页：色板全部来自「材料清单」，这里只做概览 + 跳转。

export default function MaterialsInspector({ project, onGoTab }) {
  const mats = project.materials || [];
  const pending = mats.filter((m) => m.pending).length;
  const noImage = mats.filter((m) => !m.image).length;
  const pages = Math.max(1, Math.ceil(mats.length / MATERIALS_PER_PAGE));
  const srcs = useMemo(() => mats.map((m) => m.image).filter(Boolean), [mats]);
  useThumbsSig(srcs);
  useEffect(() => requestThumbs(srcs), [srcs]);
  const layoutNote = !mats.length
    ? '还没有材料'
    : mats.length <= 12
      ? '两行大色板（与定稿一致）'
      : mats.length <= MATERIALS_PER_PAGE
        ? '三行紧凑色板'
        : `自动分成 ${pages} 页`;

  return (
    <div className="space-y-3">
      <Section title="本案材料" icon={Palette} right={<span className="text-[11px] text-bp-faint">{mats.length} 种 · {layoutNote}</span>}>
        <div className="flex items-start gap-1.5 rounded-lg bg-bp-tint px-2.5 py-2 mb-3 text-[11px] text-bp-muted leading-snug">
          <Info className="w-3.5 h-3.5 mt-px shrink-0 text-bp-eyebrow" />
          这一页的色板来自「材料清单」—— 改名称、编号、换色板照片、调整顺序都在那边，所有效果图页会一起更新。
        </div>
        {mats.length > 0 && (
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {mats.slice(0, 36).map((m) => (
              <span key={m.id} className="block" title={[m.name, m.code].filter(Boolean).join(' ')}>
                <Swatch mat={m} size={44} />
              </span>
            ))}
          </div>
        )}
        {(pending > 0 || noImage > 0) && (
          <ul className="mb-3 space-y-0.5 text-[11px] text-bp-warn">
            {pending > 0 && <li>· {pending} 种标着「待确认」</li>}
            {noImage > 0 && <li>· {noImage} 种还没有色板照片（页面上显示灰色块）</li>}
          </ul>
        )}
        <button type="button" className={`${btnPrimary} w-full`} onClick={() => onGoTab?.('materials')}>
          打开材料清单
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </Section>
    </div>
  );
}
