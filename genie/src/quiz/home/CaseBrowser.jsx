// 看全部的家（docs/showcase/SPEC.md §2，懒载入）：满屏的一层 —— 顶上「全部的家 · {0} 个家」+ ✕；
// 筛选（种类 · 房子 · 房间 · 风格，数字 = browseCases 的 facets，没筛选时的数）；按和这位客人像不像排好的案例卡；
// 页脚：选了的小头像 + 「选好了」（关掉这一层，回到案例那一步）。
//   选 / 取消 和案例那一步是同一个 toggle（CasesStep 的；最多三个，「最多三个哦」）—— 关掉这一层、打开详情、换筛选都不会丢。
//   点卡片 → 案例详情（在这一层上面；「下一个」= 筛选结果里的下一个）。
//   readOnly（蓝图的参考案例）：只看，不能选，没有页脚。
//   雷区一定要避开的家永远不在这里（照旧说「已经帮你避开用了『X』的家」）；草稿 / 隐藏的 / 没有业主同意的真实项目也不会有（guestPool）。
// 设备上的照片：卡片只读封面 + 两张小图（useCardCovers），关掉时收回。挂在 body 上（createPortal）。
// props：{ profile, cases, isOn(c), onToggleCase(c, e) → 'on' | 'off' | 'full', chosen: Case[], pickedThumb(c) → url, onClose, readOnly }

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, RotateCcw } from 'lucide-react';
import fx from '../../shared/fx.js';
import { t, isEn } from '../../shared/i18n.js';
import * as C from '../../shared/cases.js';
import CaseCard from './CaseCard.jsx';
import CaseDetail, { useCaseBoards } from './CaseDetail.jsx';
import { pushLayer, lockScroll, useCardCovers, inWish, noSave } from './CaseGallery.jsx';
import './showcase.css';

const EMPTY = { kind: 'all', type: [], room: [], style: [] };
// 两栏时筛选贴着不动的那一块：顶上让出顶栏（showcase.css .cv-br-filters.is-stick 的 top: 92px），
// 底下让出页脚（「选好了」那一条，大概 104 px；只看的没有页脚）—— 最下面一组不能藏在页脚后面
const STICK_TOP = 92;
const FOOT_ROOM = 104;
const listSep = () => (isEn() ? ', ' : '、');
const flip = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export default function CaseBrowser({ profile, cases, isOn, onToggleCase, chosen = [], pickedThumb, onClose, readOnly = false }) {
  const [filters, setFilters] = useState(EMPTY);
  const [detail, setDetail] = useState(null);
  const [closing, setClosing] = useState(false);
  const [toast, setToast] = useState('');
  const closeRef = useRef(null);
  const rootRef = useRef(null);
  const gridRef = useRef(null);
  const toastT = useRef(0);
  const wish = useRef(inWish()).current;

  const bv = useCaseBoards(cases);
  // 列表跟着筛选；数字（facets / total / 避开了哪些）browseCases 本来就按没筛选的那一批算
  const res = useMemo(() => C.browseCases(profile, cases || [], filters), [profile, cases, filters, bv]);
  const shown = res.list;
  const covers = useCardCovers(shown.map((m) => m.case));
  const on = (c) => !!isOn?.(c);
  const filtered = filters.kind !== 'all' || filters.type.length > 0 || filters.room.length > 0 || filters.style.length > 0;

  useEffect(() => {
    const pop = pushLayer((e) => e.key === 'Escape' && keys.current?.close(), rootRef);
    const unlock = lockScroll();
    const back = document.activeElement;
    let r1 = 0;
    let r2 = 0;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      pop();
      unlock();
      if (back && back.isConnected) back.focus?.({ preventScroll: true });
    };
  }, []);
  useEffect(() => () => clearTimeout(toastT.current), []);

  // 两栏（≥ 1000 px）：筛选整个放得进一屏（顶栏和页脚中间）才贴着不动；放不下就跟着页面一起滚 ——
  // 不能自己藏一个滚动框（iPad 横放时「风格」那一组整个在页脚后面，看不出来还能往下滑）
  const filtersRef = useRef(null);
  const [stick, setStick] = useState(false);
  useLayoutEffect(() => {
    const el = filtersRef.current;
    if (!el) return undefined;
    const read = () => setStick(window.innerWidth >= 1000 && el.offsetHeight <= window.innerHeight - STICK_TOP - (readOnly ? 24 : FOOT_ROOM));
    read();
    window.addEventListener('resize', read);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    ro?.observe(el);
    return () => {
      window.removeEventListener('resize', read);
      ro?.disconnect();
    };
  }, []);

  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose?.(), fx.motion.reduced ? 0 : 220);
  };
  const keys = useRef(null);
  keys.current = { close };

  const flash = (msg) => {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(''), 1800);
  };
  const toggle = (c, e) => {
    const r = onToggleCase?.(c, e);
    if (r === 'full') flash(t('最多三个哦'));
    return r;
  };
  const setF = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    // 换了筛选：回到最上面（结果从第一个开始看）。左右两栏（≥ 1000 px）时筛选和结果一起滚：
    // 不滚，免得客人刚点的那颗（在筛选栏下面）一下子跑到屏幕外
    const twoCol = typeof matchMedia === 'function' && matchMedia('(min-width: 1000px)').matches;
    if (!twoCol) rootRef.current?.querySelector('.cv-br-scroll')?.scrollTo?.({ top: 0, behavior: fx.motion.reduced ? 'auto' : 'smooth' });
  };

  const excludedTags = [...new Set((res.excluded || []).flatMap((x) => x.tags))].map(C.noGoLabel).filter(Boolean);
  const f = res.facets;
  const groups = [
    f.type.length > 1 && { key: 'type', label: t('房子'), items: f.type.map((x) => ({ id: x.id, n: x.n, label: x.label })) },
    f.room.length > 1 && { key: 'room', label: t('房间'), items: f.room.map((x) => ({ id: x.id, n: x.n, label: x.label })) },
    f.style.length > 1 && { key: 'style', label: t('风格'), items: f.style.map((x) => ({ id: x.code, n: x.n, label: x.label })) },
  ].filter(Boolean);
  const kinds = f.kind.length > 1 ? [{ id: 'all', n: res.total, label: t('全部') }, ...f.kind] : [];
  const idx = detail ? shown.findIndex((m) => m.case.id === detail.case.id) : -1;
  const withCover = (m) => (covers[m.case.id] ? { ...m, case: covers[m.case.id] } : m);

  return createPortal(
    <div ref={rootRef} className={`cv-br ${closing ? 'is-closing' : ''} ${wish ? 'is-wish' : ''} ${readOnly ? 'is-read' : ''}`} role="dialog" aria-modal="true" aria-labelledby="cv-br-t">
      <div className="cv-br-scroll">
        <header className="cv-br-head">
          <button ref={closeRef} type="button" className="cs-x cv-x" onClick={close} aria-label={t('关闭')} data-sfx="close">
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
          <div>
            <p className="eyebrow">{readOnly ? t('参考案例') : t('挑一到三个你喜欢的')}</p>
            <h2 id="cv-br-t">{t('全部的家')}</h2>
          </div>
          <p className="cv-br-n" aria-live="polite">
            {filtered ? t('{0} / {1} 个家', [shown.length, res.total]) : t('{0} 个家', [res.total])}
          </p>
        </header>
        <div className="cv-br-body">
          {(kinds.length > 0 || groups.length > 0) && (
            <aside ref={filtersRef} className={`cv-br-filters ${stick ? 'is-stick' : ''}`} aria-label={t('筛选')}>
              {kinds.length > 0 && (
                <div className="cv-fgroup">
                  <span className="cv-flabel">{t('种类')}</span>
                  <div className="cv-fchips" role="group" aria-label={t('种类')} data-sfx="radio">
                    {kinds.map((k) => (
                      <button key={k.id} type="button" className={`cv-fchip ${filters.kind === k.id ? 'on' : ''}`} aria-pressed={filters.kind === k.id} onClick={() => setF({ kind: k.id })}>
                        {k.label}
                        <small>{k.n}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {groups.map((g) => (
                <div key={g.key} className="cv-fgroup">
                  <span className="cv-flabel">{g.label}</span>
                  <div className="cv-fchips" role="group" aria-label={g.label} data-sfx="chip">
                    {g.items.map((x) => {
                      const sel = filters[g.key].includes(x.id);
                      return (
                        <button key={x.id} type="button" className={`cv-fchip ${sel ? 'on' : ''}`} aria-pressed={sel} onClick={() => setF({ [g.key]: flip(filters[g.key], x.id) })}>
                          {x.label}
                          <small>{x.n}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </aside>
          )}
          <section className="cv-br-main">
            <p className="cv-br-lead">
              <span>{t('按和你像不像排好了。')}</span>
              {excludedTags.length > 0 && <span className="cs-excl">{t('已经帮你避开用了「{0}」的家', [excludedTags.slice(0, 3).join(listSep())])}</span>}
              {filtered && (
                <button type="button" className="cv-fclear" onClick={() => setF(EMPTY)} data-sfx="back">
                  <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
                  <span>{t('清除筛选')}</span>
                </button>
              )}
            </p>
            {shown.length ? (
              <div className="cv-br-grid" ref={gridRef}>
                {shown.map((m) => (
                  <CaseCard key={m.case.id} match={withCover(m)} on={on(m.case)} onToggle={readOnly ? undefined : (e) => toggle(m.case, e)} onOpen={() => setDetail(m)} />
                ))}
              </div>
            ) : (
              <div className="cv-br-none">
                <p>{t('没有符合的家')}</p>
                <button type="button" className="btn-line small" onClick={() => setF(EMPTY)} data-sfx="back">
                  <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
                  <span>{t('清除筛选')}</span>
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
      {!readOnly && (
        <footer className="cv-br-foot">
          <span className="cs-picked" aria-hidden="true">
            {chosen.map((c) => {
              const u = pickedThumb?.(c) || '';
              return u ? <img key={c.id} src={u} alt="" {...noSave} /> : <i key={c.id} />;
            })}
          </span>
          <span className={`cs-note ${toast ? 'is-toast' : ''}`} role="status">
            {toast || (chosen.length ? t('选了 {0} 个 · 最多 3 个', [chosen.length]) : t('最多 3 个'))}
          </span>
          <button type="button" className="btn btn-primary cv-br-done" onClick={close} data-sfx="close">
            <Check size={18} strokeWidth={2.2} aria-hidden="true" />
            <span>{t('选好了')}</span>
          </button>
        </footer>
      )}
      {detail && (
        <CaseDetail
          key={detail.case.id}
          match={shown.find((m) => m.case.id === detail.case.id) || detail}
          on={on(detail.case)}
          onToggle={readOnly ? undefined : (e) => toggle(detail.case, e)}
          hasNext={shown.length > 1}
          onNext={() => setDetail(shown[(idx + 1) % shown.length] || null)}
          onClose={() => setDetail(null)}
          readOnly={readOnly}
          all={cases}
          profile={profile}
          isOn={isOn}
          onToggleCase={readOnly ? null : toggle}
        />
      )}
    </div>,
    document.body
  );
}
