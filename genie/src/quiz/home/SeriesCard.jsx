// 溪岸五大系列 · 客人这边（docs/showcase/SERIES.md §3）：
//   · SeriesCard —— 案例那一步标题旁边的一张小卡：「最适合你的系列」+ 名字（自然线 / 实木的 family）+ 品牌那一句（title）+ 一两句理由；
//     点一下展开：系列的 body + note（雾山还有佩索阿那一句）、「也适合你：…」（第二个）、「看{0}的家」（看全部，筛好这个系列；
//     这台设备上有这个系列的真实案例才有）。客人挑了别的系列的真实案例 → 重新排（recommendSeries 的 chosen），名字换掉时被光扫一下。
//   · SeriesTag —— 案例卡上的小牌子「溪岸 · 空山」（案例写了系列才有）。
//   · BlueprintSeries —— 蓝图 VIII · 建议的系列：最适合的那个（名字、title、理由）+ 第二个一行（Blueprint.jsx 懒载入）。
// 文字只用品牌手册的原文（series.js 的 SERIES，英文在 en-cases.js）；理由只说客人自己的答案（seriesReasonText），
// 永远不提预算、时间、员工的笔记。三个小色卡 = 这个系列的材质（SERIES_TARGET.mats，程序化的材质，只是示意）。

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import fx from '../../shared/fx.js';
import { t, L } from '../../shared/i18n.js';
import { MAT_BY_ID } from '../../shared/materials.js';
import { SERIES_BY_KEY, SERIES_TARGET, recommendSeries, seriesKeyOf, seriesReasonText } from '../../shared/series.js';
import * as C from '../../shared/cases.js';
import { Spark } from './icons.jsx';
import { Swatch } from './kit.jsx';
import './showcase.css';

/** 理由的第一个字母大写（英文）；中文不变 */
const cap = (s) => (s && /^[a-z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s || '');

/** 案例的系列 → { key, name, tag:「溪岸 · 空山」}；没写系列 → null */
export function caseSeries(c) {
  const s = SERIES_BY_KEY[seriesKeyOf(c?.series)];
  return s ? { key: s.key, name: L(s), tag: t('溪岸 · {0}', [L(s)]) } : null;
}

/** 案例卡 / 蓝图上的小牌子「溪岸 · 空山」 */
export function SeriesTag({ c, className = '' }) {
  const s = caseSeries(c);
  return s ? <span className={`cv-sr-tag ${className}`}>{s.tag}</span> : null;
}

/**
 * 建议的系列（客人挑的案例算进去）。chosen 只看 id + 系列：同一批案例换了新的对象（读出了照片）不重算。
 * → recommendSeries 的结果（五个都在，最合适的在前）
 */
export function useSeriesRec(profile, chosen = []) {
  const sig = (chosen || []).map((c) => `${c?.id}:${seriesKeyOf(c?.series) || ''}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => recommendSeries(profile, { chosen }), [profile, sig]);
}

/** 说得出「最适合你」吗：有理由，或者第一个真的比第二个高（客人什么都没答 → 五个一样，不说） */
export const seriesShown = (rec) => !!rec?.[0] && (rec[0].reasons.length > 0 || rec[0].score > (rec[1]?.score ?? 0) + 1e-9);

const SAME_SERIES = '和最适合你的系列一样：{0}';
/**
 * 配对的理由跟着系列卡走：matchCases 只看客人的答案（「和最适合你的系列一样：织」），客人挑了别的系列的真实案例以后
 * 系列卡换成了空山 —— 同一屏不能一边说织一边说空山。top = 现在最适合的（算进挑的案例），base = 只看答案的那个。
 * 两个一样 → 原样（配对自己的理由不动）；不一样 → 别的系列的家拿掉那一句，这个系列的家加上那一句（放在后面：
 * 卡片上那一句照旧是配对挑的、每张卡不一样的那一句；详情的「为什么适合你」里看得到；最多三句）。
 */
export function withSeriesTop(m, top, base) {
  if (!m?.case || !top || top === base) return m;
  const k = seriesKeyOf(m.case.series);
  if (!k) return m;
  const rs = m.reasons || [];
  const has = rs.some((r) => r.kind === 'series');
  if (k !== top) return has ? { ...m, reasons: rs.filter((r) => r.kind !== 'series') } : m;
  if (has) return m;
  const s = SERIES_BY_KEY[k];
  const sr = { kind: 'series', key: SAME_SERIES, vars: [{ zh: s.zh, en: s.en }] };
  // 「这个家的柜体我会帮你换掉」（雷区换面）一定留着：在第一条就还在第一条，在最后就还在最后
  const sw = rs.filter((r) => r.kind === 'swap');
  if (!sw.length) return { ...m, reasons: [...rs.slice(0, 2), sr] };
  const other = rs.filter((r) => r.kind !== 'swap');
  const body = other.slice(0, Math.max(0, 3 - 1 - sw.length));
  return { ...m, reasons: rs[0].kind === 'swap' ? [...sw, ...body, sr] : [...body, sr, ...sw] };
}

/** 一个 hook 拿齐：rec（算进挑的案例）、top / base（见 withSeriesTop）、fix(match) → 理由跟着系列卡的 match */
export function useSeriesTop(profile, chosen = []) {
  const rec = useSeriesRec(profile, chosen);
  const rec0 = useSeriesRec(profile, []);
  const top = seriesShown(rec) ? rec[0].key : null;
  const base = seriesShown(rec0) ? rec0[0].key : null;
  const fix = useMemo(() => (m) => withSeriesTop(m, top, base), [top, base]);
  return { rec, top, base, fix };
}

/**
 * 客人选过的案例（档案里只存 id / 标题）→ 这台设备上的案例对象：只认现在还能给客人看的（C.guestPool：有了真实项目以后
 * 以前选的 3D 方案不算、业主收回同意的不算）；这台设备上没有、但引用里写了系列的，照样算（只用它的系列）。
 */
export function chosenCases(profile, all) {
  if (!all) return [];
  const pool = new Map(C.guestPool(all).map((c) => [c.id, c]));
  return (profile?.cases || []).map((r) => pool.get(r?.id) || (r?.series && !all.some((c) => c.id === r.id) ? r : null)).filter(Boolean);
}

/** 这个系列的三块材质（示意的小色卡，叠在一起） */
function SeriesMats({ k, px = 44 }) {
  const ids = (SERIES_TARGET[k]?.mats || []).filter((id) => MAT_BY_ID[id]).slice(0, 3);
  if (!ids.length) return null;
  return (
    <span className="cv-sr-mats" aria-hidden="true">
      {ids.map((id) => (
        <Swatch key={id} id={id} px={px} className="cv-sr-mat" />
      ))}
    </span>
  );
}

/** 名字那一行：「空山」+ 小字「溪岸 · 自然线系列」（雾山没有 family：只写名字） */
function SeriesName({ s, as: Tag = 'span' }) {
  return (
    <Tag className="cv-sr-name">
      <b>{L(s)}</b>
      {s.family && <small>{L(s.family)}</small>}
    </Tag>
  );
}

/**
 * 案例那一步的系列卡。
 * props：rec（useSeriesRec 的结果）、counts（{ [key]: n } 这位客人看得到的这个系列的家有几个）、onBrowse(key)（看全部，筛好这个系列）
 */
export default function SeriesCard({ rec, counts = {}, onBrowse }) {
  const [open, setOpen] = useState(false);
  // 读屏：换了系列才说一句（第一次出来不说）
  const [said, setSaid] = useState('');
  const id = `cv-sr-${useId().replace(/:/g, '')}`;
  const ref = useRef(null);
  const top = rec?.[0];
  const key = top?.key;
  const prev = useRef(key);
  // 换了一个系列（客人挑了别的系列的真实案例）：名字那一块被光扫一下（第一次出来不扫）
  useEffect(() => {
    if (!key || prev.current === key) return;
    prev.current = key;
    setSaid(t('最适合你的系列：{0}', [L(SERIES_BY_KEY[key])]));
    if (ref.current && !fx.motion.reduced) fx.scan(ref.current, { sound: null, duration: 420 });
  }, [key]);
  if (!seriesShown(rec)) return null;
  const s = SERIES_BY_KEY[key];
  const second = rec[1] ? SERIES_BY_KEY[rec[1].key] : null;
  const reasons = top.reasons
    .slice(0, 2)
    .map((r) => cap(seriesReasonText(r)))
    .filter(Boolean);
  const n = counts[key] || 0;
  return (
    <section ref={ref} className={`cv-sr ${open ? 'is-open' : ''}`} aria-label={t('最适合你的系列')}>
      <button type="button" className="cv-sr-top" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} data-sfx={open ? 'close' : 'open'}>
        <SeriesMats k={key} />
        <span className="cv-sr-eyebrow">{t('最适合你的系列')}</span>
        {/* 名字换了 = 整块换一个（淡入） */}
        <span className="cv-sr-id" key={key}>
          <SeriesName s={s} />
          <span className="cv-sr-title">{L(s.title)}</span>
        </span>
        {reasons.length > 0 && (
          <span className="cv-sr-whys">
            {reasons.map((r) => (
              <span key={r}>
                <Spark size={13} />
                {r}
              </span>
            ))}
          </span>
        )}
        <span className="cv-sr-more-l">
          {open ? t('收起') : t('读读这个系列')}
          <ChevronDown size={15} strokeWidth={2.2} aria-hidden="true" />
        </span>
      </button>
      <div className="cv-sr-more" id={id} aria-hidden={!open}>
        <div>
          <p className="cv-sr-body">{L(s.body)}</p>
          <p className="cv-sr-note">{L(s.note)}</p>
          {s.quote && <p className="cv-sr-quote">{L(s.quote)}</p>}
          {second && (
            <p className="cv-sr-alt">
              <span>{t('也适合你：{0}', [L(second)])}</span>
              <em>{L(second.title)}</em>
            </p>
          )}
          {n > 0 && onBrowse && (
            <button type="button" className="cv-all-link cv-sr-go" tabIndex={open ? 0 : -1} onClick={() => onBrowse(key)} data-sfx="open">
              <span>{t('看{0}的家', [L(s)])}</span>
              <small>{n}</small>
              <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <span className="sr-only" role="status">
        {said}
      </span>
    </section>
  );
}

/**
 * 蓝图 VIII · 建议的系列。客人选过的案例（profile.cases 只存 id / 标题）从这台设备的案例库找回来（才知道它是哪个系列）；
 * 找不到（换了一部手机打开链接）就只用客人的答案。读案例库的时候先不出来（一下子就好）。
 */
export function BlueprintSeries({ profile }) {
  const [all, setAll] = useState(null);
  useEffect(() => {
    let alive = true;
    C.listCases()
      .then((l) => alive && setAll(l || []))
      .catch(() => alive && setAll([]));
    return () => {
      alive = false;
    };
  }, []);
  const chosen = useMemo(() => chosenCases(profile, all), [all, profile]);
  const rec = useSeriesRec(profile, chosen);
  if (!all || !seriesShown(rec)) return null;
  const s = SERIES_BY_KEY[rec[0].key];
  const second = rec[1] ? SERIES_BY_KEY[rec[1].key] : null;
  const reasons = rec[0].reasons.map((r) => cap(seriesReasonText(r))).filter(Boolean);
  return (
    <div className="cv-bp-sr">
      <div className="cv-bp-sr-main">
        <SeriesMats k={s.key} px={56} />
        <p className="cv-sr-eyebrow">{t('最适合你的系列')}</p>
        <SeriesName s={s} as="h4" />
        <p className="cv-sr-title">{L(s.title)}</p>
        {reasons.length > 0 && (
          <ul className="cv-sr-whys">
            {reasons.map((r) => (
              <li key={r}>
                <Spark size={13} />
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>
      {second && (
        <p className="cv-sr-alt">
          <span>{t('也适合你：{0}', [L(second)])}</span>
          <em>{L(second.title)}</em>
        </p>
      )}
    </div>
  );
}
