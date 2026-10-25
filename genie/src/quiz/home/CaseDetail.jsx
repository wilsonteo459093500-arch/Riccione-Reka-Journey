// 案例详情（SPEC §4 detail sheet）：底部升起的一张纸。
//   左（横放）/ 上（竖放、手机）：照片 —— 可以左右滑；下面一排小图（480），大图（1600）打开时才读。
//   右：{种类} · {房子} · 名字 · 「3D 风格方案 · 不是真实业主的家」/ 地点 · 故事 · 为什么适合你（≤ 3）·
//       这个家用了（六个主要表面的色卡；公司做的那几样带「我们做」）· 我们做（业主 + LEAD NOTE 6：只有定制柜、墙板、门）vs
//       家具示意（活动家具：通用的样子，不是公司的产品）+ 只是背景（地板、灯、窗帘、天花、墙漆 —— 不是公司做的：
//       3D 里保留你家原有的，或只是中性的背景；没有「合作伙伴」）·
//       ✓ 选这个案例 / 已选 · 下一个 · ✕。
// 设备上的照片（员工在 iPad 上加的）先 resolveImages()，关掉时 releaseImages()。

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, ChevronRight } from 'lucide-react';
import fx from '../../shared/fx.js';
import { t, L, isEn } from '../../shared/i18n.js';
import { MAT_BY_ID, SLOT_BY_ID, onBoards } from '../../shared/materials.js';
import * as C from '../../shared/cases.js';
import { boardsSoon } from '../../shared/boards/soon.js';
import { isOfferSlot, offerKinds, offersWorktop, splitSupply, lab } from '../../shared/home.js';
import { SwatchCover, propertyTag, capFirst } from './CaseCard.jsx';
import { Swatch } from './kit.jsx';

/**
 * 这些案例用了这台设备还不认得的溪岸板材（随网站的板材库是单独一块、展厅 iPad 的板材包在 IndexedDB）：
 * 读一次（最多等 400 ms，R11 f），读好了（或者晚一点才读好）→ 返回的数字 +1，用它的界面重算（色卡、名字、理由）。
 */
export function useCaseBoards(cases) {
  const [v, setV] = useState(0);
  const need = (cases || []).some((c) => c && C.caseBoardList(c).some((b) => !b.known));
  useEffect(() => {
    if (!need) return undefined;
    let alive = true;
    const bump = () => alive && setV((x) => x + 1);
    const off = onBoards(bump);
    boardsSoon(400).then(bump);
    return () => {
      alive = false;
      off();
    };
  }, [need]);
  return v;
}

export default function CaseDetail({ match, on, onToggle, onNext, onClose, hasNext = true, readOnly = false }) {
  const [res, setRes] = useState(match.case);
  const [i, setI] = useState(0);
  const [big, setBig] = useState({});
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(null);
  const swipe = useRef(null);
  const c = res;
  const imgs = c.images || [];
  const img = imgs[i];

  useEffect(() => {
    let alive = true;
    let resolved = null;
    setI(Math.max(0, (match.case.images || []).findIndex((im) => im.cover)));
    setBig({});
    C.resolveImages(match.case)
      .then((r) => {
        resolved = r;
        if (alive) setRes(r);
        else C.releaseImages(r);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (resolved) C.releaseImages(resolved);
    };
  }, [match.case]);

  // 键盘：Esc 关、← → 换照片（读最新的 close / step，监听只装一次）
  const keys = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') keys.current?.close();
      else if (e.key === 'ArrowRight') keys.current?.step(1);
      else if (e.key === 'ArrowLeft') keys.current?.step(-1);
    };
    window.addEventListener('keydown', onKey);
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    // 焦点放到 ✕ 上：等纸升起的第一帧画完（双 rAF）再放 —— 同一个任务里 focus() 会逼浏览器马上排版整张纸（iPad 上 ~0.3 s）
    let r1 = 0;
    let r2 = 0;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      window.removeEventListener('keydown', onKey);
      html.style.overflow = prev;
    };
  }, []);

  const step = (d) => {
    if (imgs.length < 2) return;
    setI((k) => (k + d + imgs.length) % imgs.length);
  };
  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, fx.motion.reduced ? 0 : 200);
  };
  keys.current = { close, step };

  // 案例原板（柜体 · 门、墙板）：这台设备认得了就是真的板（真的色卡 + 「7号 · 黑胡桃」，客人看不到厂家编号）
  const bv = useCaseBoards([c]);
  const mats = useMemo(() => {
    const m = C.caseMaterials(c);
    return C.KEY_SLOTS.filter((s) => MAT_BY_ID[m[s]]).map((s) => ({ slot: s, mat: MAT_BY_ID[m[s]] }));
  }, [c, bv]);
  // 照片里还用了的溪岸板材（例如织系列编织门：只是资料，3D 不铺）—— 这台设备认得的才写；客人只看序号 + 名字（没有厂家编号）
  const alsoBoards = useMemo(
    () =>
      C.caseBoardList(c)
        .filter((b) => !b.slot && b.known)
        .map((b) => {
          const m = MAT_BY_ID[b.id];
          const series = m.board.series && !L(m).includes(m.board.series) ? t(m.board.series) : '';
          return series ? `${series} · ${L(m)}` : L(m);
        }),
    [c, bv]
  );
  const split = splitSupply(c.supplies?.firm || []);
  const firm = split.offer.map((id) => C.SUPPLY_BY_ID[id]).filter(Boolean);
  const illu = split.illustration.map((id) => C.SUPPLY_BY_ID[id]).filter(Boolean);
  const kinds = offerKinds(c.supplies?.firm || [], { featureMat: C.caseMaterials(c).feature });
  // 台面只有在公司做了厨房橱柜 / 浴室柜的案例里才算「我们做」
  const worktop = offersWorktop(c.supplies?.firm || []);
  const ctx = (c.supplies?.context || []).map((id) => C.SUPPLY_BY_ID[id]).filter(Boolean);
  const reasons = (match.reasons || []).slice(0, 3).map((r) => capFirst(C.reasonText(r))).filter(Boolean);
  const concept = C.isConcept(c);
  // 「1,200 sq ft」不在中间断行（手机上眉题第二行只剩一个 FT）
  const place = String(C.placeLine(c) || '').replace(/ sq ft/g, '\u00a0sq\u00a0ft');
  const tag = propertyTag(c);
  const head = concept ? t('3D 风格方案') : t('我们做过的家');
  const sub = concept ? t('3D 风格方案 · 不是真实业主的家') : L(c.place) && L(c.place) !== place ? L(c.place) : '';
  const products = Array.isArray(c.products) ? c.products.filter((p) => p && (p.name?.zh || p.name?.en)) : [];
  const large = img ? C.imageURL(c, img, 1600) : '';
  const small = img ? C.imageURL(c, img, 480) : '';

  return (
    <div className={`cs-veil ${closing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={L(c.title)} onClick={close}>
      <div className="cs-sheet" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} type="button" className="cs-x" onClick={close} aria-label={t('关闭')} data-sfx="close">
          <X size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <div
          className="cs-gal"
          onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
          onPointerUp={(e) => {
            const s = swipe.current;
            swipe.current = null;
            if (!s) return;
            const dx = e.clientX - s.x;
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s.y)) step(dx < 0 ? 1 : -1);
          }}
        >
          {img ? (
            <img
              key={img.id}
              src={big[img.id] ? large : small}
              className={big[img.id] ? '' : 'is-loading'}
              alt={L(img.alt) || L(c.title)}
              decoding="async"
              onLoad={() => {
                // 先放 480 的小图，1600 的大图读好再换上（打开时才读）
                if (big[img.id]) return;
                const hi = new Image();
                hi.decoding = 'async';
                hi.onload = () => setBig((b) => ({ ...b, [img.id]: true }));
                hi.src = large;
              }}
            />
          ) : (
            <SwatchCover c={c} />
          )}
          {imgs.length > 1 && (
            <div className="cs-strip">
              {imgs.slice(0, 5).map((im, k) => (
                <button key={im.id} type="button" className={k === i ? 'on' : ''} aria-pressed={k === i} aria-label={C.roomLabel(im.room) || t('照片 {0}', [k + 1])} onClick={() => setI(k)} data-sfx="radio">
                  <img src={C.imageURL(c, im, 480)} alt="" loading="lazy" decoding="async" />
                  <span>{C.roomLabel(im.room)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="cs-info">
          <p className="eyebrow">{[head, place || tag].filter(Boolean).join(' · ')}</p>
          <h2>{L(c.title)}</h2>
          {sub && <p className="cs-placel">{sub}</p>}
          {L(c.story) && <p className="cs-story">{L(c.story)}</p>}
          {reasons.length > 0 && (
            <>
              <h4>{t('为什么适合你')}</h4>
              <ul className="cs-whys">
                {reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}
          {mats.length > 0 && (
            <>
              <h4>{t('这个家用了')}</h4>
              <div className="cs-mats">
                {mats.map(({ slot, mat }) => (
                  <figure key={slot}>
                    <Swatch id={mat.id} px={96} className="cs-mat-sw" />
                    <figcaption>
                      {L(SLOT_BY_ID[slot])}
                      <b>{L(mat)}</b>
                      {isOfferSlot(slot, mat.id) && (slot !== 'countertop' || worktop) && <i className="cs-ours">{t('我们做')}</i>}
                    </figcaption>
                  </figure>
                ))}
              </div>
              {alsoBoards.length > 0 && <p className="cs-boards-also">{t('这个家还用了溪岸板材：{0}', [alsoBoards.join(isEn() ? ', ' : '、')])}</p>}
            </>
          )}
          {(firm.length > 0 || illu.length > 0 || ctx.length > 0) && (
            <>
              <h4>{t('我们做的 · 只是示意')}</h4>
              <div className="cs-supply">
                {firm.length > 0 && (
                  <div className="cs-firm">
                    <b>{t('我们做')}</b>
                    {kinds.length > 0 && <small>{kinds.map(lab).join(' · ')}</small>}
                    {firm.map((s) => (
                      <span key={s.id}>{L(s)}</span>
                    ))}
                  </div>
                )}
                {(illu.length > 0 || ctx.length > 0) && (
                  <div className="cs-ctx">
                    {illu.length > 0 && (
                      <>
                        <b>{t('家具示意')}</b>
                        {illu.map((s) => (
                          <span key={s.id}>{L(s)}</span>
                        ))}
                        <em>{t('活动家具只是示意（通用的样子）；我们的成品家具，展厅里可以看看。')}</em>
                      </>
                    )}
                    {ctx.length > 0 && (
                      <>
                        <b className={illu.length ? 'cs-ctx-2' : ''}>{t('只是背景')}</b>
                        {ctx.map((s) => (
                          <span key={s.id}>{L(s)}</span>
                        ))}
                        <em>{t('这些不是我们做的：3D 里会保留你家原有的，或只是中性的背景。')}</em>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          {products.length > 0 && (
            <>
              <h4>{t('这个家里的产品')}</h4>
              <ul className="cs-products">
                {products.map((p) => (
                  <li key={p.id || L(p.name)}>
                    {L(p.name)}
                    {L(p.note) && <small>{L(p.note)}</small>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="cs-acts">
            {!readOnly && (
              <button type="button" className={`btn btn-gold ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={(e) => onToggle?.(e)} data-sfx={on ? 'deselect' : 'select'}>
                <Check size={18} strokeWidth={2.2} aria-hidden="true" />
                <span>{on ? t('已选') : t('选这个案例')}</span>
              </button>
            )}
            {hasNext && (
              <button type="button" className="btn btn-line" onClick={onNext} data-sfx="next">
                <span>{t('下一个')}</span>
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
