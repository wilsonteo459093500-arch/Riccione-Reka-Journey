// 家具的悬停提示 + 选中后的小工具条（纸色玻璃胶囊，按钮 ≥ 44px）。
// 浮在画布上时：量自己的真实宽度，只在「两块面板之间」那段空着的画布里移动（不钻到情绪面板 / 日光面板下面）。
// 手机（≤ 600px）：工具条不浮在模型中间，而是停在底部、时间滑杆正上方（docked，由 StudioApp 放进底部那一列）。
// 公司做的（offer.js：定制柜、墙板）名字旁边一个安静的金色「我们做」；活动家具（沙发、桌椅、床）写「家具示意」（通用的样子，
// 不是公司的产品）；灯、绿植、地毯、家电、窗帘不标。客人家里留下来的（主材质那一面锁住了，例如保留的胡桃木橱柜）写「保留你家原有」，
// 不写「我们做」（和材质板一样）。

import { useLayoutEffect, useRef, useState } from 'react';
import { CATALOG } from '../engine/furniture.js';
import { MAT_BY_ID } from '../../shared/materials.js';
import { t, L } from '../../shared/i18n.js';
import { FurnIcon, Icon, freeBand, toolbarBottom } from './kit.jsx';
import { offerTagOf } from '../offer.js';

/**
 * 我们做（金色）/ 我们做 · 电视柜（电视墙的墙面不是墙板时）/ 保留你家原有（主材质锁住的定制柜）/ 家具示意（中性）/ 什么都不写。
 * 主题墙、电视墙看现在的主题墙材质（微水泥、石灰墙、刷漆是背景，不是我们做的墙板）—— offer.js offerTagOf
 */
function OfferTag({ kind, materials, locked }) {
  const tag = offerTagOf(kind, { materials, locked });
  if (tag === 'kept')
    return (
      <i className="st-offer-tag kept">
        <Icon name="lock" size={10} stroke={2.2} />
        {t('保留你家原有')}
      </i>
    );
  if (tag === 'make' || tag === 'console')
    return (
      <i className="st-offer-tag">
        <Icon name="make" size={10} stroke={2.2} />
        {tag === 'console' ? t('我们做 · 电视柜') : t('我们做')}
      </i>
    );
  if (tag === 'illu') return <i className="st-offer-tag illu">{t('家具示意')}</i>;
  return null;
}

/** 量元素的宽高（语言、内容变了会变）；只在真的变了时才重画 */
function useBox(initial) {
  const ref = useRef(null);
  const [box, setBox] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setBox((b) => (Math.abs(b.w - w) > 0.5 || Math.abs(b.h - h) > 0.5 ? { w, h } : b));
    };
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box];
}

export function HoverTip({ hover, materials, locked }) {
  const [ref, box] = useBox({ w: 220, h: 46 });
  const def = CATALOG[hover.item?.kind];
  if (!def) return null;
  const m = MAT_BY_ID[materials[def.slot]];
  const top = hover.y - 10;
  const { L: lo, R: hi } = freeBand(top, top + box.h);
  // 默认在光标右边；右边放不下就翻到左边，再夹在空着的那段里
  let x = hover.x + 16;
  if (x + box.w > hi) x = hover.x - 16 - box.w;
  x = Math.max(lo, Math.min(hi - box.w, x));
  return (
    <div ref={ref} className="glass hovertip" style={{ left: x, top }}>
      <span className="hovertip-ico">
        <FurnIcon kind={hover.item.kind} size={18} stroke={1.6} />
      </span>
      <span>
        <b>
          {L(def)}
          {m && <i> · {L(m)}</i>}
          <OfferTag kind={hover.item.kind} materials={materials} locked={locked} />
        </b>
        <em>{def.wall ? t('点一下选中') : t('拖动移动 · 点一下旋转或移走')}</em>
      </span>
    </div>
  );
}

export function SelectionBar({ item, pos, materials, locked, onRotate, onRemove, onDuplicate, onVariant, onClose, docked = false }) {
  const [ref, box] = useBox({ w: 380, h: 60 });
  const def = CATALOG[item.kind];
  const m = MAT_BY_ID[materials[def?.slot]];
  let style;
  if (!docked && pos) {
    // 条在家具上方 14px；不高过工具条；左右只在两块面板之间
    const top = Math.max(toolbarBottom() + 10, pos.y - 14 - box.h);
    const { L: lo, R: hi } = freeBand(top, top + box.h);
    const left = Math.max(lo, Math.min(hi - box.w, pos.x - box.w / 2));
    style = { left, top };
  }
  return (
    <div ref={ref} className={`glass selbar ${docked ? 'docked' : ''}`} style={style} role="toolbar" aria-label={L(def)}>
      <div className="selbar-name">
        <FurnIcon kind={item.kind} size={18} stroke={1.6} />
        <span>
          <b>
            {L(def)}
            {!docked && <OfferTag kind={item.kind} materials={materials} locked={locked} />}
          </b>
          {/* 手机（停在底部）：名字那一行很窄，「我们做 / 家具示意」放到材质那一行（可以折成两行），名字不被挤成「沙发…」 */}
          {(m || docked) && (
            <em>
              {m && L(m)}
              {docked && <OfferTag kind={item.kind} materials={materials} locked={locked} />}
            </em>
          )}
        </span>
      </div>
      <span className="selbar-sep" />
      {!def?.wall && (
        <button type="button" onClick={onRotate} title={t('旋转 90° (R)')} aria-label={t('旋转')}>
          <Icon name="rotate" size={18} />
          <span>{t('旋转')}</span>
        </button>
      )}
      {onVariant && (
        <button type="button" onClick={onVariant} title={t('换一款')} aria-label={t('换款')}>
          <Icon name="swap" size={18} />
          <span>{t('换款')}</span>
        </button>
      )}
      <button type="button" onClick={onDuplicate} title={t('复制')} aria-label={t('复制')}>
        <Icon name="copy" size={18} />
        <span>{t('复制')}</span>
      </button>
      <button type="button" className="danger" onClick={onRemove} title={t('移走 (Delete)')} aria-label={t('移走')}>
        <Icon name="trash" size={18} />
        <span>{t('移走')}</span>
      </button>
      <button type="button" className="x" onClick={onClose} aria-label={t('取消选中')} title={t('取消选中')}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
