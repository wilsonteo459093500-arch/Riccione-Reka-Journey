// 蓝图 VII · 参考案例（SPEC §9.2）：客人选的案例（点开 = 详情，只看不改）+「更多像你的家」（最像的 6 个，一排可以左右滑）。
// 懒载入（蓝图先出来，案例库读好了再补上）；案例库是空的就整节不出现。

import { useEffect, useMemo, useState } from 'react';
import { t } from '../../shared/i18n.js';
import * as C from '../../shared/cases.js';
import CaseCard from './CaseCard.jsx';
import CaseDetail, { useCaseBoards } from './CaseDetail.jsx';
import './home.css';
import './blueprint.css';

export default function BlueprintCases({ profile }) {
  const [all, setAll] = useState(null);
  const [detail, setDetail] = useState(null);
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
  if (!res) return null;
  const byId = new Map([...res.picks, ...res.rest].map((m) => [m.case.id, m]));
  const mine = (profile.cases || []).map((r) => byId.get(r.id) || (all.find((c) => c.id === r.id) ? { case: all.find((c) => c.id === r.id), reasons: [] } : null)).filter(Boolean);
  const mineIds = new Set(mine.map((m) => m.case.id));
  const more = res.picks.filter((m) => !mineIds.has(m.case.id));
  if (!mine.length && !more.length) return null;
  const list = [...mine, ...more];
  const idx = detail ? list.findIndex((m) => m.case.id === detail.case.id) : -1;
  return (
    <div className="hj-bp-cases">
      {mine.length > 0 && (
        <div className="hj-bp-row is-mine">
          {mine.map((m) => (
            <CaseCard key={m.case.id} match={m} on onOpen={() => setDetail(m)} />
          ))}
        </div>
      )}
      {more.length > 0 && (
        <>
          <p className="bp-sub">{t('更多像你的家')}</p>
          <div className="hj-bp-row is-more">
            {more.map((m) => (
              <CaseCard key={m.case.id} match={m} onOpen={() => setDetail(m)} />
            ))}
          </div>
        </>
      )}
      {detail && (
        <CaseDetail
          key={detail.case.id}
          match={list.find((m) => m.case.id === detail.case.id) || detail}
          readOnly
          hasNext={list.length > 1}
          onNext={() => setDetail(list[(idx + 1) % list.length])}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
