// C · 最像你的 4 个家（SPEC §4）。默认导出 = 员工案例库预览也用这一个（cases.html?staff=1 → CaseManager 的「用示范客人看看」）。
//   props：{ profile, cases?（不给就自己 listCases()）, preview?（员工预览：不说话、页脚不固定在屏幕底、不跳走）, onDone?(chosen: Case[]) }
//   · 案例 = matchCases(profile, cases, { limit: 4 })：草稿 / 隐藏 / 没有业主同意的真实项目永远不会到客人这里（cases.js 再挡一次）；
//   · 挑一到三个 → onDone([案例…])；「都不太像」→ 下一组 4 个（rest）；第二次（或者没有下一组）→「那就先用你的牌」→ onDone([])；
//   · 点卡片（不是「选这个」）→ 详情；第 4 个 → 摇一摇 +「最多三个哦」；
//   · 一个案例都没有（案例库还是空的）：不是预览就直接 onDone([])（用牌的材质往下走）。
//   · 「看全部 {0} 个家」→ CaseBrowser（懒载入的一层：筛选 + 全部的家）；详情里有「相似的家」。
//     选 / 取消 不管从哪里按（卡片、详情、相似的家、看全部）都走同一个 toggle：最多三个、同一句「最多三个哦」；关掉那一层也不会丢。
// 隐私：理由只用客人看得到的事实（reasonText）；雷区提示只说「已经帮你避开用了『X』的家」。

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import Pangie from '../../shared/Pangie.jsx';
import fx from '../../shared/fx.js';
import { voice } from '../../shared/voice.js';
import { t, tj, L, isEn } from '../../shared/i18n.js';
import { DREAMER_BY_CODE } from '../../shared/dreamers.js';
import * as C from '../../shared/cases.js';
import CaseCard from './CaseCard.jsx';
import CaseDetail, { useCaseBoards } from './CaseDetail.jsx';
import { useCardCovers } from './CaseGallery.jsx';
import { phrased } from '../typo.jsx';
import { Odo } from '../ui.jsx';
import './home.css';

const MAX = 3;
const listSep = () => (isEn() ? ', ' : '、');
// 看全部的家：点了才下载（案例那一步自己这一块保持很小）
const CaseBrowser = lazy(() => import('./CaseBrowser.jsx'));

export default function CasesStep({ profile, cases: given, preview = false, onDone, initial = [] }) {
  const [list, setList] = useState(given || null);
  const [round, setRound] = useState(0);
  const [chosen, setChosen] = useState(() => initial.filter(Boolean));
  const [detail, setDetail] = useState(null);
  const [browse, setBrowse] = useState(false);
  const [toast, setToast] = useState('');
  const [leaving, setLeaving] = useState(false);
  const footRef = useRef(null);
  const toastT = useRef(0);
  const doneOnce = useRef(false);

  useEffect(() => {
    if (given) {
      setList(given);
      return undefined;
    }
    let alive = true;
    C.listCases()
      .then((l) => alive && setList(l || []))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [given]);

  // 案例原板读好了再配一次：理由里说得出那块板（「这个家用的就是溪岸 7号 · 黑胡桃」）
  const bv = useCaseBoards(list);
  const res = useMemo(() => (list ? C.matchCases(profile, list, { limit: 4 }) : null), [profile, list, bv]);
  const shown = useMemo(() => {
    if (!res) return [];
    return round === 0 ? res.picks : res.rest.slice(0, 4);
  }, [res, round]);
  const hasMore = round === 0 && (res?.rest?.length || 0) > 0;

  // 案例库是空的：直接用牌的材质往下走（预览时只说一句）
  useEffect(() => {
    if (preview || !res || doneOnce.current) return;
    if (!res.picks.length && !res.rest.length) {
      doneOnce.current = true;
      onDone?.([], { empty: true });
    }
  }, [res, preview]); // eslint-disable-line react-hooks/exhaustive-deps

  // 潘吉：「这些家和你的牌最像。挑一两个你喜欢的。」（预览不说）
  useEffect(() => {
    if (preview) return undefined;
    voice.say('cases.enter', { delay: 700 });
    return () => voice.stopIf('cases.enter');
  }, [preview]);

  useEffect(() => () => clearTimeout(toastT.current), []);

  // 设备上的照片（员工在 iPad 上加的）：卡片只读封面 + 两张小图的 480；页脚的小头像（从「看全部」选的家也要有）只读封面；用完放掉
  const urls = useCardCovers(shown.map((m) => m.case));
  const pickUrls = useCardCovers(chosen, { thumbs: 0 });
  const withUrls = (m) => (urls[m.case.id] ? { ...m, case: urls[m.case.id] } : m);
  const thumbOf = (c) => {
    const r = urls[c.id] || pickUrls[c.id] || c;
    const cv = C.coverOf(r);
    return cv ? C.imageURL(r, cv, 480) : '';
  };
  // 「看全部 {0} 个家」：这位客人能看到的家一共几个（雷区一定要避开的不算）
  const total = useMemo(() => (list ? C.browseCases(profile, list).total : 0), [profile, list, bv]);

  const flash = (msg) => {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(''), 1800);
  };

  const isOn = (c) => chosen.some((x) => x.id === c.id);
  /** 选 / 取消（卡片、详情、相似的家、看全部都用这一个）→ 'on' | 'off' | 'full'（已经三个了：摇一摇 +「最多三个哦」） */
  const toggle = (c, e) => {
    const btn = e?.currentTarget;
    if (isOn(c)) {
      setChosen((cur) => cur.filter((x) => x.id !== c.id));
      return 'off';
    }
    if (chosen.length >= MAX) {
      if (btn) fx.nope(btn);
      flash(t('最多三个哦'));
      return 'full';
    }
    setChosen((cur) => [...cur, c]);
    const card = btn?.closest('.cs-card, .cv-sim') || btn;
    if (card) fx.scan(card, { sound: null, duration: 380 });
    // 一粒光从卡片飞到页脚的小头像（「看全部」开着 = 那一层自己的页脚；详情开着 = 页脚在纸后面，不飞）
    const dock = document.querySelector('.cv-veil') ? null : (document.querySelector('.cv-br:not(.is-read)') || footRef.current)?.querySelector('.cs-picked');
    if (card && dock && !fx.motion.reduced) fx.mote(card, dock, { delay: 120 });
    return 'on';
  };

  const finish = (e, picked) => {
    if (leaving || preview) return;
    setLeaving(true);
    if (e?.currentTarget) fx.scan(e.currentTarget);
    setTimeout(() => onDone?.(picked), fx.motion.reduced ? 0 : 320);
  };

  const none = (e) => {
    if (hasMore) {
      setRound(1);
      if (e?.currentTarget) fx.scan(e.currentTarget, { duration: 300, sound: null });
      window.scrollTo?.({ top: 0, behavior: 'smooth' });
      return;
    }
    finish(e, []);
  };

  if (!res) {
    return (
      <div className={`cs-wrap ${preview ? 'is-preview' : ''}`}>
        <p className="lead">{t('正在找最像你的家…')}</p>
      </div>
    );
  }

  const d = DREAMER_BY_CODE[profile?.code];
  // 牌的名字（不带罗马数字：英文里「closest to I · …」读起来像「我」）
  const card = d ? (isEn() ? L({ zh: d.zh, en: d.en }) : `「${d.zh}」`) : '';
  const n = shown.length;
  const allReal = n > 0 && shown.every((m) => !C.isConcept(m.case));
  const anyConcept = shown.some((m) => C.isConcept(m.case));
  const name = (profile?.name || '').trim();
  const eyebrow = round === 1 ? t('再看看这 {0} 个', [n]) : name ? t('为 {0} 挑的 {1} 个家 · 和 {2} 最像', [name, n, card]) : t('为你挑的 {0} 个家 · 和 {1} 最像', [n, card]);
  const title = round === 1 ? t('那这些呢？') : allReal ? t('这些是我们做过的家') : t('最像你的 {0} 个家', [n]);
  const lead = `${t('挑一到三个你喜欢的，我会把它放进你的家。')}${anyConcept ? t('标着「3D 示意」的是我们画的风格方案。') : ''}`;
  const excludedTags = [...new Set((res.excluded || []).flatMap((x) => x.tags))].map(C.noGoLabel).filter(Boolean);
  const detailIdx = detail ? shown.findIndex((m) => m.case.id === detail.case.id) : -1;

  return (
    <div className={`cs-wrap ${preview ? 'is-preview' : ''}`}>
      <header className="cs-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="h-title">{phrased(title)}</h2>
          <p className="lead">{phrased(lead, { sentences: false })}</p>
          {(excludedTags.length > 0 || total > n) && (
            <div className="cv-head-row">
              {excludedTags.length > 0 && <p className="cs-excl">{t('已经帮你避开用了「{0}」的家', [excludedTags.slice(0, 3).join(listSep())])}</p>}
              {total > n && (
                <button type="button" className="cv-all-link" onClick={() => setBrowse(true)} data-sfx="open">
                  <span>{t('看全部 {0} 个家', [total])}</span>
                  <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>
        {!preview && (
          <span className="cs-mini" aria-hidden="true">
            <Pangie mood="happy" prop="ball" size={80} speaker />
          </span>
        )}
      </header>
      {n === 0 ? (
        <p className="lead">{t('案例库里还没有上架的家。')}</p>
      ) : (
        <div className="cs-grid" key={round}>
          {shown.map((m0) => {
            const m = withUrls(m0);
            return <CaseCard key={m.case.id} match={m} on={isOn(m.case)} onToggle={(e) => toggle(m0.case, e)} onOpen={() => setDetail(m0)} />;
          })}
        </div>
      )}
      {total > n && (
        <p className="cs-more">
          <button type="button" className="btn-line small cv-all" onClick={() => setBrowse(true)} data-sfx="open">
            <span>{t('看全部 {0} 个家', [total])}</span>
            <ChevronRight size={17} strokeWidth={2} aria-hidden="true" />
          </button>
        </p>
      )}
      <div className={`cs-foot ${preview ? 'is-inline' : ''}`} ref={footRef}>
        <span className="cs-picked" aria-hidden="true">
          {chosen.map((c) => {
            const u = thumbOf(c);
            return u ? <img key={c.id} src={u} alt="" draggable={false} /> : <i key={c.id} />;
          })}
        </span>
        <button type="button" className="btn btn-primary" disabled={!chosen.length || leaving} onClick={(e) => finish(e, chosen)} data-sfx="confirm">
          <span>{chosen.length === 1 ? t('就用这一个') : chosen.length ? tj('就用这 {0} 个', [<Odo key="n" value={chosen.length} />]) : t('先选一个')}</span>
        </button>
        <button type="button" className="btn btn-line" onClick={none} disabled={leaving}>
          <span>{hasMore ? t('都不太像') : t('那就先用你的牌')}</span>
        </button>
        <span className={`cs-note ${toast ? 'is-toast' : ''}`} role="status">
          {toast || t('最多 3 个')}
        </span>
      </div>
      {detail && (
        <CaseDetail
          key={detail.case.id}
          match={shown.find((m) => m.case.id === detail.case.id) || detail}
          on={isOn(detail.case)}
          hasNext={shown.length > 1}
          onToggle={(e) => toggle(detail.case, e)}
          onNext={() => setDetail(shown[(detailIdx + 1) % shown.length] || null)}
          onClose={() => setDetail(null)}
          all={list}
          profile={profile}
          isOn={isOn}
          onToggleCase={toggle}
        />
      )}
      {browse && (
        <Suspense fallback={null}>
          <CaseBrowser profile={profile} cases={list} isOn={isOn} onToggleCase={toggle} chosen={chosen} pickedThumb={thumbOf} onClose={() => setBrowse(false)} />
        </Suspense>
      )}
    </div>
  );
}
