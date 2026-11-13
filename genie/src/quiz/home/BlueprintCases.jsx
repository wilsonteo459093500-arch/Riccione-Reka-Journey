// 蓝图 VII · 参考案例（SPEC §9.2）：客人选的案例（点开 = 详情，只看不改）+「更多像你的家」（最像的 6 个，一排可以左右滑）
// +「更多案例」（看全部的家，只看：CaseBrowser readOnly，懒载入）。详情里有「相似的家」（只看，不能选）。
// 懒载入（蓝图先出来，案例库读好了再补上）；案例库是空的就整节不出现。设备上的照片：卡片只读封面 + 两张小图，用完收回。

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { t } from '../../shared/i18n.js';
import * as C from '../../shared/cases.js';
import CaseCard from './CaseCard.jsx';
import CaseDetail, { useCaseBoards } from './CaseDetail.jsx';
import { useCardCovers } from './CaseGallery.jsx';
import './home.css';
import './blueprint.css';

const CaseBrowser = lazy(() => import('./CaseBrowser.jsx'));

export default function BlueprintCases({ profile }) {
  const [all, setAll] = useState(null);
  const [detail, setDetail] = useState(null);
  const [browse, setBrowse] = useState(false);
  useEffect(() => {
    let alive = true;
    C.listCases()
      .then((l) => alive && setAll(l || []))
      .catch(() => alive && setAll([]));
    return () => {
      alive = false;
    };
  }, []);
  const bv = useCaseBoards(all); // 案例原板读好了再配一次（理由里说得出那块板）
  const res = useMemo(() => (all ? C.matchCases(profile, all, { limit: 6 }) : null), [all, profile, bv]);
  const total = useMemo(() => (all ? C.browseCases(profile, all).total : 0), [all, profile, bv]);
  const { mine, more } = useMemo(() => {
    if (!res) return { mine: [], more: [] };
    const byId = new Map([...res.picks, ...res.rest].map((m) => [m.case.id, m]));
    const own = (profile.cases || []).map((r) => byId.get(r.id) || (all.find((c) => c.id === r.id) ? { case: all.find((c) => c.id === r.id), reasons: [] } : null)).filter(Boolean);
    const ids = new Set(own.map((m) => m.case.id));
    return { mine: own, more: res.picks.filter((m) => !ids.has(m.case.id)) };
  }, [res, profile, all]);
  const list = useMemo(() => [...mine, ...more], [mine, more]);
  const covers = useCardCovers(list.map((m) => m.case));
  if (!res) return null;
  if (!mine.length && !more.length) return null;
  const idx = detail ? list.findIndex((m) => m.case.id === detail.case.id) : -1;
  const withCover = (m) => (covers[m.case.id] ? { ...m, case: covers[m.case.id] } : m);
  return (
    <div className="hj-bp-cases">
      {mine.length > 0 && (
        <div className="hj-bp-row is-mine">
          {mine.map((m) => (
            <CaseCard key={m.case.id} match={withCover(m)} on onOpen={() => setDetail(m)} />
          ))}
        </div>
      )}
      {more.length > 0 && (
        <>
          <p className="bp-sub">{t('更多像你的家')}</p>
          <div className="hj-bp-row is-more">
            {more.map((m) => (
              <CaseCard key={m.case.id} match={withCover(m)} onOpen={() => setDetail(m)} />
            ))}
          </div>
        </>
      )}
      {total > list.length && (
        <p className="cv-bp-more">
          <button type="button" className="btn-line small cv-all" onClick={() => setBrowse(true)} data-sfx="open">
            <span>{t('更多案例')}</span>
            <small>{t('{0} 个家', [total])}</small>
            <ChevronRight size={17} strokeWidth={2} aria-hidden="true" />
          </button>
        </p>
      )}
      {detail && (
        <CaseDetail
          key={detail.case.id}
          match={list.find((m) => m.case.id === detail.case.id) || detail}
          readOnly
          hasNext={list.length > 1}
          onNext={() => setDetail(list[(idx + 1) % list.length])}
          onClose={() => setDetail(null)}
          all={all}
          profile={profile}
        />
      )}
      {browse && (
        <Suspense fallback={null}>
          <CaseBrowser profile={profile} cases={all} readOnly onClose={() => setBrowse(false)} />
        </Suspense>
      )}
    </div>
  );
}
