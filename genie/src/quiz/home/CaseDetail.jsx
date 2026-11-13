// 案例详情（SPEC §4 detail sheet + docs/showcase/SPEC.md §2）：底部升起、iPad 上差不多满屏的一张纸。
//   左（横放 ≥ 901 px，固定不动）/ 上（竖放、手机）：相册（CaseGallery：照片标签、大图、说明、一排小图 → 全屏看图）。
//   右（自己滚）：{种类} · {房子} · 名字 · 「3D 风格方案 · 不是真实业主的家」/ 地点 · 故事 · 为什么适合你（≤ 3）·
//       房子档案（caseFacts）· 每个房间我们做了什么（caseRoomsMade：点一行 → 相册切到那个房间）·
//       这个家用了（六个主要表面的色卡；公司做的那几样带「我们做」）· 我们做（业主 + LEAD NOTE 6：只有定制柜、墙板、门）vs
//       家具示意（活动家具：通用的样子，不是公司的产品）+ 只是背景（地板、灯、窗帘、天花、墙漆 —— 不是公司做的：
//       3D 里保留你家原有的，或只是中性的背景；没有「合作伙伴」）· 这个家里的产品 ·
//       相似的家（similarCases，给了 all 才有：点一个 → 同一张纸里看它，「← 返回」回来；没有 readOnly 就可以选）·
//       ✓ 选这个案例 / 已选 · 下一个 · ✕。
// props：match、on、onToggle(e)、onNext、onClose、hasNext、readOnly（以前就有的，照旧）
//        + all（案例列表：相似的家）、profile（客人档案：相似的家避开雷区、理由）、isOn(c)、onToggleCase(c, e)（相似的家也能选）。
//   onToggle / onToggleCase 回 'full'（已经三个了）→ 这张纸自己说「最多三个哦」。
// 设备上的照片（员工在 iPad 上加的）一张一张读（useImageStore），关掉时全部收回；永远不会一次读出全部的 1600。
// 挂在 body 上（createPortal）：蓝图那张纸有 transform 动画，fixed 的东西放在它里面会被它框住、跑到纸的底下。
// 客人看不到：厂家板号（只有「7号 · 黑胡桃」这种名字，C.boardGuestName）、价钱、预算、时间、员工的备注。

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, ChevronRight, ChevronLeft } from 'lucide-react';
import fx from '../../shared/fx.js';
import { t, L, isEn } from '../../shared/i18n.js';
import { MAT_BY_ID, SLOT_BY_ID, onBoards } from '../../shared/materials.js';
import * as C from '../../shared/cases.js';
import { boardsSoon } from '../../shared/boards/soon.js';
import { isOfferSlot, offerKinds, offersWorktop, splitSupply, lab } from '../../shared/home.js';
import { propertyTag, capFirst, kindBadge } from './CaseCard.jsx';
import { Swatch } from './kit.jsx';
import CaseGallery, { useImageStore, pushLayer, indexIn, CaseThumb, inWish } from './CaseGallery.jsx';
import './showcase.css';

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

const listSep = () => (isEn() ? ', ' : '、');
const placeOf = (c) => String(C.placeLine(c) || '').replace(/ sq ft/g, ' sq ft');

export default function CaseDetail({ match, on, onToggle, onNext, onClose, hasNext = true, readOnly = false, all = null, profile = null, isOn = null, onToggleCase = null }) {
  // 相似的家点进去的那几步（最后一个 = 现在看的）；「← 返回」退一步
  const [stack, setStack] = useState([]);
  const cur = stack.length ? stack[stack.length - 1] : match;
  const c = cur.case;
  const sub = stack.length > 0;
  const [tab, setTab] = useState('all');
  const [idx, setIdx] = useState(() => indexIn(C.galleryImages(match.case, 'all'), C.coverOf(match.case)));
  const [closing, setClosing] = useState(false);
  const [toast, setToast] = useState('');
  const closeRef = useRef(null);
  const sheetRef = useRef(null);
  const infoRef = useRef(null);
  const toastT = useRef(0);
  const store = useImageStore();
  const wish = useRef(inWish()).current;

  const tabs = useMemo(() => C.galleryTabs(c), [c]);
  const list = useMemo(() => C.galleryImages(c, tab), [c, tab]);
  const i = Math.min(idx, Math.max(0, list.length - 1));

  // 键盘：Esc 关、← → 换照片（读最新的 close / step，监听只装一次；全屏看图开着的时候是它的）
  const keys = useRef(null);
  useEffect(() => {
    const pop = pushLayer((e) => {
      if (e.key === 'Escape') keys.current?.close();
      else if (e.key === 'ArrowRight') keys.current?.step(1);
      else if (e.key === 'ArrowLeft') keys.current?.step(-1);
    }, sheetRef);
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
      pop();
      html.style.overflow = prev;
    };
  }, []);
  useEffect(() => () => clearTimeout(toastT.current), []);

  const step = (d) => {
    if (list.length < 2) return;
    setIdx((k) => (Math.min(k, list.length - 1) + d + list.length) % list.length);
  };
  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, fx.motion.reduced ? 0 : 200);
  };
  keys.current = { close, step };

  const flash = (msg) => {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(''), 1800);
  };
  /** 换一个家（相似的家 / 返回）：相册回到「全部」的封面，两边都滚回最上面；焦点放到「← 返回」（没有了就是 ✕） */
  const showCase = (x) => {
    setTab('all');
    setIdx(indexIn(C.galleryImages(x, 'all'), C.coverOf(x)));
    infoRef.current?.scrollTo?.({ top: 0 });
    sheetRef.current?.scrollTo?.({ top: 0 });
    requestAnimationFrame(() => (sheetRef.current?.querySelector('.cv-back') || closeRef.current)?.focus({ preventScroll: true }));
  };
  const openSimilar = (x) => {
    // 理由：这位客人为什么会喜欢它（和配对一样的句子；没有客人档案就不写）
    const reasons = profile ? C.matchCases(profile, [x], { limit: 1 }).picks[0]?.reasons || [] : [];
    setStack((s) => [...s, { case: x, reasons }]);
    showCase(x);
  };
  const back = () => {
    const prev = stack.length > 1 ? stack[stack.length - 2] : match;
    setStack((s) => s.slice(0, -1));
    showCase(prev.case);
  };
  /** 每个房间那一行：相册切到那个房间（那个房间的封面）；一栏的时候滚回相册 */
  const openRoom = (r) => {
    const imgs = C.galleryImages(c, r.tab);
    setTab(r.tab);
    setIdx(indexIn(imgs, r.cover));
    sheetRef.current?.scrollTo?.({ top: 0, behavior: fx.motion.reduced ? 'auto' : 'smooth' });
  };
  /** 换照片标签：现在这张也在新标签里就停在它上面；不在 →「全部」回到封面，房间 / 细节从第一张开始 */
  const changeTab = (id) => {
    const next = C.galleryImages(c, id);
    const k = next.indexOf(list[i]);
    setTab(id);
    setIdx(k >= 0 ? k : id === 'all' ? indexIn(next, null) : 0);
  };

  // 选：最先打开的那个家用 on / onToggle（以前的写法），相似的家用 isOn / onToggleCase
  const curOn = sub ? !!isOn?.(c) : on ?? !!isOn?.(c);
  const canPick = !readOnly && (sub ? !!onToggleCase : !!(onToggle || onToggleCase));
  const pick = (e) => {
    const r = sub ? onToggleCase?.(c, e) : onToggle ? onToggle(e) : onToggleCase?.(c, e);
    if (r === 'full') flash(t('最多三个哦'));
  };

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
        .map((b) => C.boardGuestName(b.id))
        .filter(Boolean),
    [c, bv]
  );
  const facts0 = useMemo(() => C.caseFacts(c), [c]);
  const rooms = useMemo(() => C.caseRoomsMade(c), [c, bv]);
  const sims = useMemo(() => (Array.isArray(all) ? C.similarCases(c, all, { n: 4, profile }) : []), [c, all, profile]);
  const cabinet = C.caseMaterials(c).cabinetry;

  const split = splitSupply(c.supplies?.firm || []);
  const firm = split.offer.map((id) => C.SUPPLY_BY_ID[id]).filter(Boolean);
  const illu = split.illustration.map((id) => C.SUPPLY_BY_ID[id]).filter(Boolean);
  const kinds = offerKinds(c.supplies?.firm || [], { featureMat: C.caseMaterials(c).feature });
  // 台面只有在公司做了厨房橱柜 / 浴室柜的案例里才算「我们做」
  const worktop = offersWorktop(c.supplies?.firm || []);
  const ctx = (c.supplies?.context || []).map((id) => C.SUPPLY_BY_ID[id]).filter(Boolean);
  const reasons = (cur.reasons || []).slice(0, 3).map((r) => capFirst(C.reasonText(r))).filter(Boolean);
  const concept = C.isConcept(c);
  // 「1,200 sq ft」不在中间断行（手机上眉题第二行只剩一个 FT）
  const place = placeOf(c);
  const tag = propertyTag(c);
  const head = concept ? t('3D 风格方案') : t('我们做过的家');
  const sub0 = concept ? t('3D 风格方案 · 不是真实业主的家') : L(c.place) && L(c.place) !== place ? L(c.place) : '';
  // 地区已经写在名字下面了：房子档案里不再说一遍
  const facts = facts0.filter((f) => !(f.k === 'area' && f.value === sub0));
  const products = Array.isArray(c.products) ? c.products.filter((p) => p && (p.name?.zh || p.name?.en)) : [];
  const title = L(c.title);
  const prevTitle = sub ? L((stack.length > 1 ? stack[stack.length - 2] : match).case.title) : '';

  const lead = (
    <>
      <button ref={closeRef} type="button" className="cs-x cv-x" onClick={close} aria-label={t('关闭')} data-sfx="close">
        <X size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {sub && (
        <button type="button" className="cv-back" onClick={back} aria-label={t('返回「{0}」', [prevTitle])} data-sfx="back">
          <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
          <span>{t('返回')}</span>
        </button>
      )}
    </>
  );

  return createPortal(
    <div className={`cs-veil cv-veil ${closing ? 'is-closing' : ''} ${wish ? 'is-wish' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={close}>
      <div className="cs-sheet cv-sheet" ref={sheetRef} onClick={(e) => e.stopPropagation()}>
        <CaseGallery key={c.id} c={c} tabs={tabs} tab={tab} onTab={changeTab} list={list} index={i} onIndex={setIdx} store={store} lead={lead} title={title} />
        <div className="cs-info cv-info" ref={infoRef} key={`i-${c.id}`}>
          <p className="eyebrow">{[head, place || tag].filter(Boolean).join(' · ')}</p>
          <h2>{title}</h2>
          {sub0 && <p className="cs-placel">{sub0}</p>}
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
          {facts.length > 0 && (
            <>
              <h4>{t('房子档案')}</h4>
              <dl className="cv-facts">
                {facts.map((f) => (
                  <div key={f.k} className={`is-${f.k}`}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {rooms.length > 0 && (
            <>
              <h4>{t('每个房间我们做了什么')}</h4>
              <ul className="cv-rooms">
                {rooms.map((r) => (
                  <li key={r.room}>
                    <RoomRow r={r} c={c} store={store} cabinet={cabinet} onOpen={r.images > 0 ? () => openRoom(r) : null} />
                  </li>
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
                      <b>{C.isBoardId(mat.id) ? C.boardGuestName(mat.id) || L(mat) : L(mat)}</b>
                      {isOfferSlot(slot, mat.id) && (slot !== 'countertop' || worktop) && <i className="cs-ours">{t('我们做')}</i>}
                    </figcaption>
                  </figure>
                ))}
              </div>
              {alsoBoards.length > 0 && <p className="cs-boards-also">{t('这个家还用了溪岸板材：{0}', [alsoBoards.join(listSep())])}</p>}
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
          {sims.length > 0 && (
            <>
              <h4>{t('相似的家')}</h4>
              <div className="cv-sims">
                {sims.map(({ case: x }) => (
                  <SimCard key={x.id} c={x} store={store} on={!!isOn?.(x)} onOpen={() => openSimilar(x)} onToggle={readOnly || !onToggleCase ? null : (e) => (onToggleCase(x, e) === 'full' ? flash(t('最多三个哦')) : null)} />
                ))}
              </div>
            </>
          )}
          <div className="cs-acts">
            {canPick && (
              <button type="button" className={`btn btn-gold ${curOn ? 'is-on' : ''}`} aria-pressed={curOn} onClick={pick} data-sfx={curOn ? 'deselect' : 'select'}>
                <Check size={18} strokeWidth={2.2} aria-hidden="true" />
                <span>{curOn ? t('已选') : t('选这个案例')}</span>
              </button>
            )}
            {!sub && hasNext && (
              <button type="button" className="btn btn-line" onClick={onNext} data-sfx="next">
                <span>{t('下一个')}</span>
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
            <span className={`cv-toast ${toast ? 'is-on' : ''}`} role="status">
              {toast}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** 每个房间一行：房间的小图（没有照片 → 这个家柜子的色卡）· 名字 · 我们做的那几样 · 板材（色卡 + 客人看的名字）· 员工的说明 */
function RoomRow({ r, c, store, cabinet, onOpen }) {
  const Tag = onOpen ? 'button' : 'div';
  const props = onOpen ? { type: 'button', onClick: onOpen, 'data-sfx': 'radio', 'aria-label': t('看{0}的照片', [r.label]) } : {};
  return (
    <Tag className={`cv-room ${onOpen ? 'is-tap' : ''}`} {...props}>
      {r.cover ? (
        <CaseThumb c={c} img={r.cover} store={store} className="cv-room-pic" />
      ) : (
        <span className="cv-pic cv-room-pic is-none">{cabinet && MAT_BY_ID[cabinet] ? <Swatch id={cabinet} px={56} className="cv-room-sw" /> : null}</span>
      )}
      <span className="cv-room-txt">
        <b>
          {r.label}
          {onOpen && r.room !== C.ROOM_HOME && <small>{r.images === 1 ? t('1 张照片') : t('{0} 张照片', [r.images])}</small>}
        </b>
        {r.firm.length > 0 && (
          <span className="cv-room-firm">
            <i className="cs-ours">{t('我们做')}</i>
            {r.firm.map((f) => f.label).join(' · ')}
          </span>
        )}
        {r.boards.length > 0 && (
          <span className="cv-room-boards">
            {r.boards.map((b) => (
              <span key={b.id} className="cv-board">
                <Swatch id={b.id} px={40} className="cv-board-sw" />
                {b.name}
              </span>
            ))}
          </span>
        )}
        {r.note && <em>{r.note}</em>}
      </span>
      {onOpen && <ChevronRight className="cv-room-go" size={16} strokeWidth={2} aria-hidden="true" />}
    </Tag>
  );
}

/** 相似的家：小卡片（封面 · 种类 · 名字 · 一行地点 · 选这个） */
function SimCard({ c, store, on, onOpen, onToggle }) {
  const title = L(c.title);
  return (
    <article
      className={`cv-sim ${on ? 'on' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={t('看看「{0}」', [title])}
      onClick={(e) => !e.target.closest?.('.cv-sim-pick') && onOpen()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.target.closest?.('.cv-sim-pick') && (e.preventDefault(), onOpen())}
      data-sfx="open"
      data-case={c.id}
    >
      <span className="cv-sim-cover">
        <CaseThumb c={c} img={C.coverOf(c)} store={store} />
        <span className={`cs-render ${C.isConcept(c) ? '' : 'is-real'}`}>{kindBadge(c)}</span>
      </span>
      <b>{title}</b>
      <small>{placeOf(c)}</small>
      {onToggle && (
        <button
          type="button"
          className="cv-sim-pick"
          aria-pressed={on}
          aria-label={on ? t('已选「{0}」', [title]) : t('选「{0}」', [title])}
          data-sfx={on ? 'deselect' : 'select'}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(e);
          }}
        >
          <i aria-hidden="true">{on ? <Check size={12} strokeWidth={3} /> : null}</i>
          {on ? t('已选') : t('选这个')}
        </button>
      )}
    </article>
  );
}
