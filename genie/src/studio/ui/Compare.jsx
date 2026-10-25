// 对照 · Compare（SPEC §8.4）：案例照片 vs 客人自己家的 3D，同一个画面里对着看。
//   横屏 / 电脑：先是左上角一张小卡（≈ 300 × 200，挨着情绪面板），照片是镜头最近那个房间的（没有就用封面）；
//                点一下 → 左右分开：照片在左（默认 50 %，中间的分隔线拖 30–70 %），3D 在右半边重新取景（StudioApp 告诉引擎 setInsets）。
//   竖着的 iPad：上面 45 % 照片、下面 3D（分隔线上下拖 30–60 %）。
//   手机：左上角「我的家 | 案例照片」切换，照片整屏淡入淡出。
// 照片底下一排小图可以换；许愿模式一样能用（不下载任何东西）。照片只在打开时读（1600 大图），关掉就释放。

import { useEffect, useMemo, useRef, useState } from 'react';
import { t, L } from '../../shared/i18n.js';
import { Icon } from './kit.jsx';

/** 3D 里的房间 → 案例照片里最像的房间（按顺序找） */
const NEAR = {
  living: ['living', 'family', 'dining'],
  family: ['family', 'living'],
  dining: ['dining', 'living', 'kitchen'],
  kitchen: ['kitchen', 'dining'],
  master: ['master', 'bedroom'],
  bedroom: ['bedroom', 'master', 'kids'],
  kids: ['kids', 'bedroom'],
  study: ['study', 'living'],
  foyer: ['foyer', 'living'],
  walkin: ['walkin', 'master'],
  bath: ['bath'],
  balcony: ['balcony', 'living'],
};

/** 大图底下垫的小图（480，列表里已经读过） */
const under = (im) => (im?.thumbUrl && im.thumbUrl !== im.url ? { backgroundImage: `url("${im.thumbUrl}")` } : {});

/** 照片（不含整个家的鸟瞰）里，和这个房间最像的一张；没有 → 封面 */
export function pickImage(images, roomType) {
  const list = (images || []).filter((im) => im && (im.url || im.thumbUrl));
  if (!list.length) return null;
  for (const r of NEAR[roomType] || []) {
    const hit = list.find((im) => im.room === r);
    if (hit) return hit;
  }
  return list.find((im) => im.cover) || list[0];
}

function Thumbs({ images, cur, onPick, roomName }) {
  if (!images || images.length < 2) return null;
  return (
    <div className="st-cmp-thumbs" role="listbox" aria-label={t('案例照片')}>
      {images.map((im) => (
        <button key={im.id} type="button" role="option" aria-selected={cur?.id === im.id} className={cur?.id === im.id ? 'on' : ''} onClick={() => onPick(im)} data-sfx="page" title={roomName(im.room)}>
          <img src={im.thumbUrl || im.url} alt="" loading="lazy" decoding="async" draggable={false} />
        </button>
      ))}
    </div>
  );
}

/**
 * c：案例（照片已经 resolveImages 过：img.url / img.thumbUrl）；layout 'land' | 'port' | 'phone'；
 * mode：'pip' | 'split'（land）· 'split'（port）· 'home' | 'photo'（phone）；split：照片那一边占多少（0–1）；
 * roomType：镜头最近的房间类型；roomName(id)：照片房间的名字；onMode / onSplit / onClose。
 */
export default function Compare({ c, layout, mode, split = 0.5, roomType, roomName = () => '', onMode, onSplit, onClose, pipAt }) {
  const images = useMemo(() => (c?.images || []).filter((im) => im.url || im.thumbUrl), [c]);
  const auto = useMemo(() => pickImage(images, roomType), [images, roomType]);
  const [pick, setPick] = useState(null);
  const cur = (pick && images.find((im) => im.id === pick)) || auto;
  useEffect(() => setPick(null), [c?.id]);
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);

  // 手机：「我的家 | 案例照片」一直在（照片点了才读）；其他排法照片读好了才出现
  if ((!c || !cur) && layout !== 'phone') return null;
  const label = cur ? roomName(cur.room) : '';
  const big = cur ? cur.url || cur.thumbUrl : '';
  const choose = (im) => setPick(im.id);

  // 分隔线：拖一拖（横屏左右、竖屏上下）
  const onDown = (e) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId };
    setDragging(true);
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const v = layout === 'port' ? e.clientY / innerHeight : e.clientX / innerWidth;
    onSplit?.(layout === 'port' ? Math.min(0.6, Math.max(0.3, v)) : Math.min(0.7, Math.max(0.3, v)));
  };
  const onUp = () => {
    drag.current = null;
    setDragging(false);
  };
  const divider = (
    <div
      className={`st-divider ${layout} ${dragging ? 'drag' : ''}`}
      style={layout === 'port' ? { top: `${split * 100}%` } : { left: `${split * 100}%` }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="separator"
      aria-orientation={layout === 'port' ? 'horizontal' : 'vertical'}
      aria-label={t('拖一拖，调整对照的大小')}
      data-sfx="grab"
    >
      <span className="st-divider-knob">
        <Icon name="swap" size={15} />
      </span>
    </div>
  );

  if (layout === 'phone') {
    return (
      <>
        <div className="st-seg glass" role="tablist" aria-label={t('对照')}>
          <button type="button" role="tab" aria-selected={mode !== 'photo'} className={mode !== 'photo' ? 'on' : ''} data-sfx={mode !== 'photo' ? 'none' : 'page'} onClick={() => onMode('home')}>
            {t('我的家')}
          </button>
          <button type="button" role="tab" aria-selected={mode === 'photo'} className={mode === 'photo' ? 'on' : ''} data-sfx={mode === 'photo' ? 'none' : 'page'} onClick={() => onMode('photo')}>
            {t('案例照片')}
          </button>
        </div>
        <section className={`st-cmp-phone ${mode === 'photo' ? 'show' : ''}`} style={mode === 'photo' ? under(cur) : undefined} aria-hidden={mode !== 'photo'} aria-label={t('案例照片')}>
          {mode === 'photo' && cur && (
            <>
              <img key={cur.id} className="st-cmp-img" src={big} alt={cur.alt && typeof cur.alt === 'object' ? L(cur.alt) : ''} decoding="async" draggable={false} />
              <span className="st-cmp-label">{label ? t('案例照片 · {0}', [label]) : t('案例照片')}</span>
              <Thumbs images={images} cur={cur} onPick={choose} roomName={roomName} />
            </>
          )}
        </section>
      </>
    );
  }

  if (layout === 'land' && mode === 'pip') {
    return (
      <div className="st-pip glass" style={pipAt ? { left: pipAt.left, top: pipAt.top } : undefined}>
        <button type="button" className="st-pip-open" onClick={() => onMode('split')} data-sfx="open" aria-label={t('点一下放大对照')}>
          <img src={cur.thumbUrl || big} alt="" decoding="async" draggable={false} />
          <span className="st-cmp-label">{label ? t('案例照片 · {0}', [label]) : t('案例照片')}</span>
          <span className="st-pip-hint">{t('点一下放大对照')}</span>
        </button>
        <button type="button" className="st-cmp-x" onClick={onClose} aria-label={t('关闭对照')} data-sfx="close">
          <Icon name="close" size={14} />
        </button>
      </div>
    );
  }

  // 分开对照：横屏左右、竖屏上下（大图还在读的时候，先用已经读好的小图垫着 —— 不会是一块黑）
  const style = { ...(layout === 'port' ? { height: `${split * 100}%` } : { width: `${split * 100}%` }), ...under(cur) };
  return (
    <>
      <section className={`st-split ${layout}`} style={style} aria-label={t('案例照片')}>
        <img key={cur.id} className="st-cmp-img" src={big} alt={cur.alt && typeof cur.alt === 'object' ? L(cur.alt) : ''} decoding="async" draggable={false} />
        <span className="st-cmp-label">{label ? t('案例照片 · {0}', [label]) : t('案例照片')}</span>
        <button type="button" className="st-cmp-x" onClick={onClose} aria-label={t('关闭对照')} data-sfx="close">
          <Icon name="close" size={15} />
        </button>
        <Thumbs images={images} cur={cur} onPick={choose} roomName={roomName} />
      </section>
      {divider}
      <span className={`st-mine-label ${layout}`} style={layout === 'port' ? { top: `calc(${split * 100}% + 12px)` } : { left: `calc(${split * 100}% + 14px)` }}>
        {t('你的家 · 示意')}
      </span>
    </>
  );
}
