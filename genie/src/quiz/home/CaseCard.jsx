// 一张案例卡（C 屏，SPEC §4）：封面 + 两张房间小图、房子类型、「3D 示意」/「我们做过的家」、名字、一行地点、
// 「我们做」那一行（业主 + LEAD NOTE 6：只列定制柜、墙板、门；活动家具只是示意，地板、灯、窗帘从来不写成公司做的）、
// 四个色点、一条理由、「选这个 / 已选」。
// 只读 480 的小图（列表要快：40 个案例 / 200 张照片也只读封面）；还没有照片 → 用这个家的材质拼一张色卡。

import { memo } from 'react';
import { Check } from 'lucide-react';
import { t, L } from '../../shared/i18n.js';
import * as C from '../../shared/cases.js';
import { splitSupply, lab } from '../../shared/home.js';
import { Spark } from './icons.jsx';
import { Swatch } from './kit.jsx';

const SWATCH_SLOTS = ['floor', 'walls', 'cabinetry', 'upholstery', 'feature'];

/** 没有照片的案例：主表面的材质拼一张（第一块是地板，占两行）。
 *  最多画 112 px（CSS 放大，本来就是一张柔和的色块）：240 / 480 px 的色卡一张要 0.3–2 秒的计算，不值得 */
export const COVER_PX_MAX = 112;
export function SwatchCover({ c, px = COVER_PX_MAX }) {
  const m = C.caseMaterials(c);
  const ids = SWATCH_SLOTS.map((s) => m[s]).filter(Boolean);
  const P = Math.min(COVER_PX_MAX, px);
  return (
    <span className="cs-swatch" aria-hidden="true">
      {ids.map((id, i) => (
        <Swatch key={`${id}-${i}`} id={id} px={i ? Math.round(P / 2) : P} className="cs-swatch-i" />
      ))}
    </span>
  );
}

export const propertyTag = (c) => {
  const p = C.PROPERTY_BY_ID?.[c?.property?.type];
  return p && c.property.type !== 'other' ? t(p.zh) : '';
};

/** 「衣柜 · 厨房橱柜 · 电视墙」：这个家里公司做的（最多三样，SUPPLY.firm 的顺序；沙发、餐桌椅、床这些活动家具不算） */
export const firmLine = (c, n = 3) =>
  splitSupply(c?.supplies?.firm || []).offer
    .map((id) => C.SUPPLY_BY_ID?.[id])
    .filter(Boolean)
    .slice(0, n)
    .map((s) => L(s))
    .join(' · ');

// 卡片上的小牌子要短（英文「3D concept」，SPEC §4）；详情里才写全「3D 风格方案 · 不是真实业主的家」
const CONCEPT_BADGE = { zh: '3D 示意 · 风格方案', en: '3D concept' };
/** 理由那一行的第一个字母大写（英文的「warm and minimal, like you」）；中文不变 */
export const capFirst = (s) => (s && /^[a-z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s || '');

export const kindBadge = (c) => (C.isConcept(c) ? lab(CONCEPT_BADGE) : t('我们做过的家'));

function CaseCard({ match, on, onToggle, onOpen }) {
  const c = match.case;
  const cover = C.coverOf(c);
  const thumbs = (c.images || []).filter((im) => im !== cover).slice(0, 2);
  const dots = C.casePalette(c).slice(0, 4);
  const why = match.reasons?.[0] ? capFirst(C.reasonText(match.reasons[0])) : '';
  const title = L(c.title);
  const tag = propertyTag(c);
  const firm = firmLine(c);
  const open = (e) => {
    if (e.target.closest?.('.cs-pick')) return;
    onOpen?.(e);
  };
  return (
    <article
      className={`cs-card ${on ? 'on' : ''}`}
      onClick={open}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.target.closest?.('.cs-pick') && (e.preventDefault(), onOpen?.(e))}
      tabIndex={0}
      role="button"
      aria-label={t('看看「{0}」', [title])}
      data-sfx="open"
      data-case={c.id}
    >
      <div className="cs-cover">
        {cover ? (
          <img src={C.imageURL(c, cover, 480)} alt={L(cover.alt) || title} loading="lazy" decoding="async" width="480" height="360" />
        ) : (
          <SwatchCover c={c} />
        )}
        {tag && <span className="cs-tag">{tag}</span>}
        <span className={`cs-render ${C.isConcept(c) ? '' : 'is-real'}`}>{kindBadge(c)}</span>
        {thumbs.length > 0 && (
          <span className="cs-thumbs" aria-hidden="true">
            {thumbs.map((im) => (
              <img key={im.id} src={C.imageURL(c, im, 480)} alt="" loading="lazy" decoding="async" />
            ))}
          </span>
        )}
        {onToggle && (
        <button
          type="button"
          className="cs-pick"
          aria-pressed={on}
          data-sfx={on ? 'deselect' : 'select'}
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.(e);
          }}
        >
          <i aria-hidden="true">{on ? <Check size={12} strokeWidth={3} /> : null}</i>
          {on ? t('已选') : t('选这个')}
        </button>
        )}
      </div>
      <div className="cs-body">
        <h3>{title}</h3>
        <p className="cs-place">{String(C.placeLine(c) || '').replace(/ sq ft/g, '\u00a0sq\u00a0ft')}</p>
        {firm && (
          <p className="cs-offer">
            <b>{t('我们做')}</b>
            <span>{firm}</span>
          </p>
        )}
        <span className="cs-dots" aria-hidden="true">
          {dots.map((d) => (
            <i key={d.slot} style={{ background: d.color }} />
          ))}
        </span>
        {why && (
          <p className="cs-why">
            <Spark />
            <span>{why}</span>
          </p>
        )}
      </div>
    </article>
  );
}

export default memo(CaseCard);
