import React from 'react';
import { LayoutGrid, Type, Wand2, Image as ImageIcon, Info } from 'lucide-react';
import { COVER_LAYOUTS, coverTexts } from '../../../engine/layouts.js';
import { metaOf } from '../../../store/assets.js';
import { updateCover, updateInfo, NOW } from '../ops.js';
import { Section, Field, inputCls, btnPrimary, btnGhost } from '../ui.jsx';
import ImageField from '../ImageField.jsx';
import { CompanyTexts } from './CompanyInspector.jsx';

// 方案封面（「03 方案」章节封面）：Material Board 图、三种版式、标题 / 副标题。
// 没有 Board 时这一页退回定稿的「方案 · 设计图」章节页（可逐段改字）。

/** 版式示意小图 */
function LayoutThumb({ id }) {
  const board = <span className="absolute inset-y-0 right-0 w-[42%] bg-gradient-to-br from-[#d9cbb2] via-[#bfa98a] to-[#8f7a5f]" />;
  const lines = (dark) => (
    <span className="absolute left-[8%] top-[34%] w-[40%] space-y-[3px]">
      <span className={`block h-[2px] w-1/3 ${dark ? 'bg-[#A9835A]' : 'bg-[#B8995A]'}`} />
      <span className={`block h-[5px] w-full rounded-sm ${dark ? 'bg-[#F2ECE0]' : 'bg-[#241C12]'}`} />
      <span className={`block h-[3px] w-2/3 rounded-sm ${dark ? 'bg-[#D8C8A8]/70' : 'bg-[#6E6353]/60'}`} />
    </span>
  );
  if (id === 'full') {
    return (
      <span className="relative block w-full aspect-video rounded-md overflow-hidden bg-gradient-to-br from-[#d9cbb2] via-[#a8916f] to-[#5c4a36]">
        <span className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <span className="absolute left-[8%] bottom-[16%] w-[45%] space-y-[3px]">
          <span className="block h-[2px] w-1/4 bg-[#B8995A]" />
          <span className="block h-[5px] w-full rounded-sm bg-[#F2ECE0]" />
          <span className="block h-[3px] w-2/3 rounded-sm bg-[#D8C8A8]/70" />
        </span>
      </span>
    );
  }
  const dark = id === 'split-dark';
  return (
    <span className={`relative block w-full aspect-video rounded-md overflow-hidden ${dark ? 'bg-[#211A12]' : 'bg-[#F5F0E6] ring-1 ring-inset ring-black/5'}`}>
      {board}
      {lines(dark)}
    </span>
  );
}

export default function CoverInspector({ project, slide, change, notify, onGoTab }) {
  const cover = project.cover || {};
  const info = project.info || {};
  const layout = cover.layout || 'split-light';
  const auto = coverTexts({ ...project, info: { ...info, coverTitle: '', coverSubtitle: '' } });
  const meta = cover.image ? metaOf(cover.image) : null;
  const landscape = meta?.w && meta?.h && meta.w / meta.h > 1.2;

  return (
    <div className="space-y-3">
      <Section title="Material Board" icon={ImageIcon}>
        {!cover.image && (
          <div className="flex items-start gap-1.5 rounded-lg bg-bp-tint px-2.5 py-2 mb-2.5 text-[11px] text-bp-muted leading-snug">
            <Info className="w-3.5 h-3.5 mt-px shrink-0 text-bp-eyebrow" />
            还没有 Material Board —— 现在这一页用的是定稿的「方案 · 设计图」章节页。做好 Board 后它会成为方案章节的封面（公司封面保持原样）。
          </div>
        )}
        <ImageField
          project={project}
          src={cover.image || null}
          notify={notify}
          field="cover.image"
          removeLabel="移除"
          lowResWidth={900}
          maxEdge={4096}
          onChange={(src) => change((p) => updateCover(p, { image: src || null }), NOW)}
          hint={cover.image ? '移除后退回「方案 · 设计图」章节页' : '也可以直接上传自己做好的 Board 图'}
        />
        <button type="button" className={`${btnPrimary} w-full mt-3`} onClick={() => onGoTab?.('board')}>
          <Wand2 className="w-4 h-4" />
          {cover.image ? '去改 Material Board' : '去做 Material Board'}
        </button>
      </Section>

      <Section title="封面版式" icon={LayoutGrid}>
        <div className="grid grid-cols-3 gap-2">
          {COVER_LAYOUTS.map((l) => {
            const active = l.id === layout;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => change((p) => updateCover(p, { layout: l.id }), NOW)}
                className={`rounded-xl p-1.5 text-left border transition-colors ${
                  active ? 'border-bp-gold bg-bp-tint ring-1 ring-bp-gold' : 'border-bp-line hover:border-bp-rule'
                }`}
              >
                <LayoutThumb id={l.id} />
                <span className={`block mt-1 text-[10px] leading-tight ${active ? 'text-bp-ink font-medium' : 'text-bp-muted'}`}>{l.label}</span>
              </button>
            );
          })}
        </div>
        {!cover.image && <p className="mt-2 text-[11px] text-bp-faint">有了 Material Board 才会用到这里的版式。</p>}
        {cover.image && landscape && layout !== 'full' && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-bp-warn/10 px-2.5 py-1.5 text-[11px] text-bp-ink">
            这张 Board 是横版，用「满版大图」更好看
            <button type="button" className={btnGhost} onClick={() => change((p) => updateCover(p, { layout: 'full' }), NOW)}>
              换成满版
            </button>
          </div>
        )}
      </Section>

      <Section title="封面文字" icon={Type}>
        <Field label="大标题" hint={cover.image ? '留空 = 自动用「客户 · 地点」' : '有 Material Board 时生效；留空 = 自动用「客户 · 地点」'}>
          <input
            data-field="coverTitle"
            className={inputCls}
            value={info.coverTitle || ''}
            placeholder={auto.title}
            onChange={(e) => change((p) => updateInfo(p, { coverTitle: e.target.value }))}
          />
        </Field>
        <Field label="副标题" className="mt-2.5" hint="页面上自动转大写">
          <input
            data-field="coverSubtitle"
            className={inputCls}
            value={info.coverSubtitle || ''}
            placeholder={auto.subtitle}
            onChange={(e) => change((p) => updateInfo(p, { coverSubtitle: e.target.value }))}
          />
        </Field>
      </Section>

      {!cover.image && <CompanyTexts project={project} slide={slide} change={change} onGoTab={onGoTab} title="章节页文字" />}
    </div>
  );
}
