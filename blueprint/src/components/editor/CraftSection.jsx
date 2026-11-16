import React, { useMemo } from 'react';
import { Gem, Plus } from 'lucide-react';
import { Section, inputCls } from './ui.jsx';
import { updateSlide, NOW } from './ops.js';
import { langOf } from '../../engine/lang.js';
import {
  CRAFT_VOCAB, CRAFT_STATUS, CRAFT_MAX, detectCrafts, tickedCrafts, toggleCraft, playableCrafts, craftText, isPlayable, craftPhoto,
} from '../../showroom/craft.js';

// 效果图页 · 设计特点（展厅播放）：程序从这一页的图纸文字认出来 → 设计师打勾 → 展厅播放才出现。
// 文字（名称、一句话、好处）全部来自词库（showroom/craft.js，老板审过才算数），这里只勾、不改字。

const STATUS_CHIP = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  official: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const clip = (s, n = 36) => (s.length > n ? `${s.slice(0, n)}…` : s);

export default function CraftSection({ project, slide, change }) {
  const ticked = tickedCrafts(slide);
  const tickedIds = new Set(ticked.map((e) => e.id));
  const found = useMemo(() => detectCrafts(slide), [slide]);
  const foundById = new Map(found.map((x) => [x.id, x]));
  const lang = langOf(project);
  const held = new Map(playableCrafts(slide, { lang }).held.map((h) => [h.entry.id, h.why]));
  const set = (id, on) => change((p) => updateSlide(p, slide.id, (s) => ({ ...s, crafts: toggleCraft(s.crafts, id, on) })), NOW);
  // 先列勾过的（按勾的先后），再列认出来但还没勾的
  const rows = [...ticked, ...found.filter((x) => !tickedIds.has(x.id)).map((x) => x.entry)];
  const rest = CRAFT_VOCAB.filter((e) => !tickedIds.has(e.id) && !foundById.has(e.id));

  return (
    <Section title="设计特点 · 展厅播放" icon={Gem} right={<span className="text-[11px] text-bp-faint">勾了 {ticked.length} 个</span>}>
      <p className="text-[11px] leading-relaxed text-bp-faint mb-2">
        程序只在这一页的图纸文字（标注、视角名、材料部位）里找词库的名称，找到才建议；打勾才会在展厅播放里出现。
        一个房间最多讲 {CRAFT_MAX} 个；文字用词库的定义（老板审过才播），这里改不了。
      </p>
      {!rows.length && <div className="text-xs text-bp-faint mb-2">这一页的图纸文字里没认出词库里的工艺 / 手法。图上确实有的，可以从下面手动加。</div>}
      <div className="space-y-1.5">
        {rows.map((entry) => {
          const on = tickedIds.has(entry.id);
          const hit = foundById.get(entry.id);
          const t = craftText(entry, lang);
          const why = on ? held.get(entry.id) : null;
          return (
            <label
              key={entry.id}
              className={`flex gap-2 rounded-xl border p-2 cursor-pointer ${on ? 'border-bp-ink/30 bg-bp-tint/60' : 'border-bp-line bg-bp-tint/20'}`}
            >
              <input type="checkbox" className="mt-0.5 shrink-0" checked={on} onChange={(e) => set(entry.id, e.target.checked)} />
              {craftPhoto(entry.id) && (
                <img
                  src={craftPhoto(entry.id).src}
                  alt=""
                  className="w-12 h-12 rounded-md object-cover shrink-0"
                  title={craftPhoto(entry.id).source === 'reference' ? '示意图（别家品牌的照片，卡片上会标「示意」）' : '溪岸的照片'}
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm text-bp-ink">{entry.zh}</span>
                  <span className={`text-[10px] px-1.5 rounded border ${STATUS_CHIP[entry.status]}`} title={entry.source ? `来源：${entry.source}` : undefined}>
                    {CRAFT_STATUS[entry.status]}
                  </span>
                </span>
                <span className="block text-[11px] text-bp-faint mt-0.5">
                  {hit ? `图纸 · ${hit.evidence.where}：「${clip(hit.evidence.text)}」` : '手动加的（图纸文字里没写）'}
                </span>
                {on && (
                  <span className="block text-[11px] text-bp-muted mt-0.5">
                    {t.zh.feature && <span className="block">特点：{t.zh.feature}</span>}
                    {t.zh.advantage && <span className="block">优势：{t.zh.advantage}</span>}
                  </span>
                )}
                {why && <span className="block text-[11px] text-amber-700 mt-0.5">暂不播放：{why}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {rest.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5 text-bp-faint shrink-0" />
          <select
            className={`${inputCls} !py-1 text-xs`}
            value=""
            aria-label="从词库手动加一个设计特点"
            onChange={(e) => e.target.value && set(e.target.value, true)}
          >
            <option value="">从词库加（图上有、但图纸没写的）…</option>
            <optgroup label="工艺细节">
              {rest.filter((e) => e.group === 'craft').map((e) => (
                <option key={e.id} value={e.id}>{`${e.zh}${isPlayable(e) ? '' : '（待审）'}`}</option>
              ))}
            </optgroup>
            <optgroup label="溪岸系列">
              {rest.filter((e) => e.group === 'series').map((e) => (
                <option key={e.id} value={e.id}>{e.zh}</option>
              ))}
            </optgroup>
            <optgroup label="设计手法">
              {rest.filter((e) => e.group === 'method').map((e) => (
                <option key={e.id} value={e.id}>{`${e.zh}${isPlayable(e) ? '' : '（待审）'}`}</option>
              ))}
            </optgroup>
          </select>
        </div>
      )}
    </Section>
  );
}
