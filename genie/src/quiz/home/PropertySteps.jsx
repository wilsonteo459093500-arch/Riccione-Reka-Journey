// 「你的家」五题（SPEC §3 + 业主 2026-10-19）：H1 房子类型 · H2 在哪里（州 + 地区，不问地址）· H3 现在的状态 ·
// H4 大概多大 + 几房几卫几层 · H5 做哪些地方 + 什么时候住进去（+ 预算：只在员工的设备上问，答案只给员工看）。
// 一屏一题；单选题选了就走（useSinglePick 的光 + 金尘），慢一点的题有「下一步」（useAdvance）。
// 选项都是资料（src/shared/home.js）：老板改说法、改档位只改那一份。
// 「谁住在这里」不再问：许愿之旅「生活」那一章已经问过（老人 / 小孩 / 宠物），配案例、给设计师都用那一份。

import { useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import fx from '../../shared/fx.js';
import { t } from '../../shared/i18n.js';
import {
  PROPERTY_BY_V,
  PROPERTY_TILES,
  tileOn,
  STATES,
  STATE_BY_V,
  AREA_MAX,
  STATUS,
  SCOPE,
  TIMELINE,
  BUDGET,
  lab,
  defaultsFor,
  typicalSize,
  isLanded,
  sqm,
  courtsText,
  fmtSqft,
  sizeToPos,
  posToSize,
  COURT_SQFT,
  staffNoteOf,
  setStaffNote,
} from '../../shared/home.js';
import { Segmented, Odo } from '../ui.jsx';
import { Head, Next, useSinglePick, useAdvance, Counter } from './kit.jsx';
import { HouseArt } from './icons.jsx';

export const HOME_TOTAL = 5;
const eyebrow = (n) => t('你的家 · {0} / {1}', [n, HOME_TOTAL]);
const touch = (home, ...keys) => ({ touched: { ...(home.touched || {}), ...Object.fromEntries(keys.map((k) => [k, true])) } });

/** H1 · 你的家是 —— （八格：公寓 · 单层排屋 · 双层排屋 · 半独立 · 独立洋房 · 城镇屋 · 店屋 · 其他 / 商业） */
export function TypeStep({ home, set, next }) {
  const { optsRef, pick } = useSinglePick(next);
  const choose = (tile, e) =>
    pick(e, () => {
      const st = tile.storeys ?? null;
      const d = defaultsFor(tile.type, st);
      const tc = home.touched || {};
      const patch = { type: tile.type, storeys: d.storeys };
      if (st != null) patch.touched = { ...tc, storeys: true };
      // 换了类型：没亲手动过的数字跟着换成这一类的常见值
      if (!tc.bedrooms) patch.bedrooms = d.bedrooms;
      if (!tc.bathrooms) patch.bathrooms = d.bathrooms;
      if (!tc.size) {
        patch.sizeSqft = typicalSize(tile.type, patch.bedrooms ?? home.bedrooms, d.storeys);
        patch.sizeSure = true;
      }
      set(patch);
    });
  return (
    <div className="step hj-card">
      <Head eyebrow={eyebrow(1)} title={t('你的家是 ——')} lead={t('选最接近的就好，我去案例库里挑最像的给你看。')} />
      <div ref={optsRef} className="hj-types n8" data-sfx="radio">
        {PROPERTY_TILES.map((tile) => {
          const p = PROPERTY_BY_V[tile.type];
          const on = tileOn(tile, home);
          return (
            <button key={tile.key} type="button" className={`hj-type ${on ? 'on' : ''}`} aria-pressed={on} onClick={(e) => choose(tile, e)} data-tile={tile.key}>
              <HouseArt kind={tile.art || tile.type} />
              <b>{lab(tile.zh ? tile : p)}</b>
              <small>{lab(tile.sub || p.sub)}</small>
              <span className="hj-tick" aria-hidden="true">
                <Check size={14} strokeWidth={2.6} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** H2 · 你的家在哪里？—— 州 + 地区（一张短短的常见地区表；不在表上就写几个字）。从不问地址 */
export function WhereStep({ home, set, next }) {
  const advance = useAdvance(next);
  const areaRef = useRef(null);
  const st = STATE_BY_V[home.state];
  const [own, setOwn] = useState(() => !!(home.areaText && !home.area));
  const pickState = (v, e) => {
    const same = home.state === v;
    set({ state: same ? null : v, area: null, areaText: '' });
    setOwn(v === 'abroad' && !same);
    if (!same && e?.currentTarget) fx.scan(e.currentTarget, { duration: 280, sound: null });
    // 手机上：地区那一排在下面，滑过去给客人看
    if (!same) setTimeout(() => areaRef.current?.scrollIntoView?.({ behavior: fx.motion.reduced ? 'auto' : 'smooth', block: 'nearest' }), 120);
  };
  const pickArea = (v, e) => {
    const same = home.area === v;
    set({ area: same ? null : v, areaText: '' });
    setOwn(false);
    if (!same && e?.currentTarget) fx.scan(e.currentTarget, { duration: 280, sound: null });
  };
  const chooseOwn = (e) => {
    setOwn(true);
    set({ area: null });
    if (e?.currentTarget) fx.scan(e.currentTarget, { duration: 280, sound: null });
    setTimeout(() => areaRef.current?.querySelector('input')?.focus({ preventScroll: true }), 60);
  };
  const go = (e) => {
    set({ areaText: (home.areaText || '').trim().slice(0, AREA_MAX), ...touch(home, 'where') });
    advance(e, () => areaRef.current?.querySelector('.chip.on') || e.currentTarget);
  };
  const abroad = home.state === 'abroad';
  return (
    <div className="step hj-card hj-where">
      <Head eyebrow={eyebrow(2)} title={t('你的家在哪里？')} lead={t('州和地区就好，不用写地址。')} />
      <div className="chips center ink-chips hj-states" role="radiogroup" aria-label={t('州')} data-sfx="radio">
        {STATES.map((s) => (
          <button key={s.v} type="button" role="radio" aria-checked={home.state === s.v} className={`chip ${home.state === s.v ? 'on' : ''} ${s.v === 'abroad' ? 'is-quiet' : ''}`} onClick={(e) => pickState(s.v, e)}>
            {lab(s)}
          </button>
        ))}
      </div>
      <div className={`hj-areas ${st ? 'is-on' : ''}`} ref={areaRef}>
        {st && (st.areas.length > 0 || abroad) && (
          <>
            <span className="field-label">{abroad ? t('哪个国家、哪个城市？') : t('{0}的哪一区？', [lab(st)])}</span>
            {!abroad && (
              <div className="chips center ink-chips" role="radiogroup" aria-label={t('地区')} data-sfx="radio">
                {st.areas.map((a) => (
                  <button key={a.v} type="button" role="radio" aria-checked={home.area === a.v} className={`chip ${home.area === a.v ? 'on' : ''}`} onClick={(e) => pickArea(a.v, e)}>
                    {lab(a)}
                  </button>
                ))}
                <button type="button" role="radio" aria-checked={own} className={`chip is-quiet ${own ? 'on' : ''}`} onClick={chooseOwn}>
                  {t('其他地区')}
                </button>
              </div>
            )}
            {(own || abroad) && (
              <label className="hj-own">
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  enterKeyHint="done"
                  maxLength={AREA_MAX}
                  value={home.areaText || ''}
                  placeholder={abroad ? t('例如：新加坡') : t('例如：Setia Alam（不用写地址）')}
                  aria-label={abroad ? t('哪个国家、哪个城市？') : t('其他地区')}
                  onChange={(e) => set({ areaText: e.target.value.slice(0, AREA_MAX), area: null })}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
              </label>
            )}
          </>
        )}
      </div>
      <div className="q-actions">
        {home.state ? (
          <Next onClick={go}>{t('下一步')}</Next>
        ) : (
          <button type="button" className="btn btn-line" onClick={go} data-sfx="next">
            <span>{t('先跳过')}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** H3 · 它现在是 —— */
export function StatusStep({ home, set, next }) {
  const { optsRef, pick } = useSinglePick(next);
  return (
    <div className="step hj-card">
      <Head eyebrow={eyebrow(3)} title={t('它现在是 ——')} lead={t('新房、旧房都可以，我会照着它来准备。')} />
      <div ref={optsRef} className="hj-types n4" data-sfx="radio">
        {STATUS.map((s) => (
          <button key={s.v} type="button" className={`hj-type ${home.status === s.v ? 'on' : ''}`} aria-pressed={home.status === s.v} onClick={(e) => pick(e, () => set({ status: s.v }))}>
            <HouseArt kind={s.v} set="status" />
            <span className="hj-tt">
              <b>{lab(s)}</b>
              <small>{lab(s.sub)}</small>
            </span>
            <span className="hj-tick" aria-hidden="true">
              <Check size={14} strokeWidth={2.6} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** 一个羽毛球场 vs 这个家一层的占地（面积 ÷ 层数）：两块按真实比例画 */
function Plate({ sqft, storeys }) {
  const per = Math.max(150, (Number(sqft) || 0) / Math.max(1, storeys || 1));
  const CA = 2.2; // 球场 13.4 × 6.1 m
  const FA = 1.45; // 家的占地（看起来像房子的比例）
  const wc = Math.sqrt(COURT_SQFT * CA);
  const hc = Math.sqrt(COURT_SQFT / CA);
  const wf = Math.sqrt(per * FA);
  const hf = Math.sqrt(per / FA);
  const u = Math.min(64 / Math.max(hc, hf), 168 / (wc + wf));
  const gap = 12;
  const total = (wc + wf) * u + gap;
  const x0 = (200 - total) / 2;
  const mid = 44;
  const R = (x, w, h) => ({ x: x.toFixed(1), y: (mid - (h * u) / 2).toFixed(1), width: (w * u).toFixed(1), height: (h * u).toFixed(1) });
  const court = R(x0, wc, hc);
  const foot = R(x0 + wc * u + gap, wf, hf);
  return (
    <figure className="hj-plate" aria-hidden="true">
      <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet">
        <rect className="hj-court-r" rx="1.5" {...court} />
        <line className="hj-court-l" x1={(+court.x + +court.width / 2).toFixed(1)} x2={(+court.x + +court.width / 2).toFixed(1)} y1={court.y} y2={(+court.y + +court.height).toFixed(1)} />
        {storeys > 1 && <rect className="hj-foot-r is-back" rx="2" {...foot} x={(+foot.x + 4).toFixed(1)} y={(+foot.y - 4).toFixed(1)} />}
        <rect className="hj-foot-r" rx="2" {...foot} />
      </svg>
      <figcaption>
        {t('一个羽毛球场')} <b>≈ {fmtSqft(COURT_SQFT)} sq ft</b>
      </figcaption>
    </figure>
  );
}

/** H4 · 大概多大？ */
export function SizeStep({ home, set, next }) {
  const advance = useAdvance(next);
  const numRef = useRef(null);
  const landed = isLanded(home);
  const d = defaultsFor(home.type, home.storeys);
  const beds = home.bedrooms ?? d.bedrooms;
  const baths = home.bathrooms ?? d.bathrooms;
  const storeys = landed ? home.storeys ?? d.storeys : 1;
  const sqft = home.sizeSqft || typicalSize(home.type, beds, storeys);
  const pos = sizeToPos(sqft);
  const unsure = home.sizeSure === false;
  const setBeds = (v) => {
    const patch = { bedrooms: v, ...touch(home, 'bedrooms') };
    // 还没定大小（不确定 / 没动过）：大小跟着房数估
    if (unsure || !home.touched?.size) patch.sizeSqft = typicalSize(home.type, v, storeys);
    set(patch);
  };
  const setStoreys = (v) => {
    const patch = { storeys: v, ...touch(home, 'storeys') };
    if (unsure || !home.touched?.size) patch.sizeSqft = typicalSize(home.type, beds, v);
    set(patch);
  };
  const estimate = (e) => {
    const was = unsure;
    set({ sizeSure: !was ? false : true, sizeSqft: typicalSize(home.type, beds, storeys), ...(was ? {} : touch(home, 'sizeUnsure')) });
    if (!was && numRef.current) fx.scan(numRef.current, { sound: null, duration: 420 });
    e?.currentTarget && !was && fx.scan(e.currentTarget, { duration: 280, sound: null });
  };
  return (
    <div className="step hj-card hj-size">
      <Head eyebrow={eyebrow(4)} title={t('大概多大？')} lead={t('看房契、售楼册上的 built-up 就好；不确定也没关系。')} />
      <div className="hj-size-row">
        <Plate sqft={sqft} storeys={storeys} />
        <div>
          <div className="hj-big" ref={numRef}>
            <b>
              <Odo value={sqft} />
            </b>
            <span>sq ft</span>
            <em>
              ≈ {sqm(sqft)} m² · {courtsText(sqft)}
              {unsure ? ` · ${t('先帮你估的')}` : ''}
            </em>
          </div>
          <div className="slider">
            <input
              type="range"
              min="0"
              max="1000"
              step="1"
              value={Math.round(pos * 1000)}
              aria-label={t('大概多大？')}
              aria-valuetext={`${fmtSqft(sqft)} sq ft`}
              style={{ '--p': `${pos * 100}%` }}
              onChange={(e) => set({ sizeSqft: posToSize(Number(e.target.value) / 1000), sizeSure: true, ...touch(home, 'size') })}
            />
          </div>
          <div className="chips center">
            <button type="button" className={`chip ${unsure ? 'on' : ''}`} aria-pressed={unsure} onClick={estimate} data-sfx="choice">
              {t('不确定，帮我估')}
            </button>
          </div>
        </div>
      </div>
      <div className={`hj-steppers ${landed ? '' : 'n2'}`}>
        <Counter label={t('卧室')} value={beds} min={1} max={7} plus onChange={setBeds} />
        <Counter label={t('浴室')} value={baths} min={1} max={6} onChange={(v) => set({ bathrooms: v, ...touch(home, 'bathrooms') })} />
        {landed && <Counter label={t('几层')} value={storeys} min={1} max={4} onChange={setStoreys} />}
      </div>
      <div className="q-actions">
        <Next
          onClick={(e) => {
            // 第一次就按下一步：把画面上的默认值写进去（设计师版会标「默认值，未确认」）
            set({ sizeSqft: sqft, bedrooms: beds, bathrooms: baths, storeys });
            advance(e, () => numRef.current);
          }}
        >
          {t('下一步')}
        </Next>
      </div>
    </div>
  );
}

/**
 * H5 · 这一次，想做哪些地方？ + 希望什么时候住进去？（+ 预算）
 * 预算：askBudget = 只在员工的设备上（许愿模式 / 设计师版）问；客人点的写进这台设备的员工记录（setStaffNote），
 * 不写进 home（不进档案、不进链接、之后的每一屏都看不到）。
 */
export function ScopeStep({ home, set, next, profileId, askBudget = false }) {
  const advance = useAdvance(next);
  const chipsRef = useRef(null);
  const scope = home.scope || [];
  const [budget, setBudget] = useState(() => (askBudget ? staffNoteOf(profileId).budget || null : null));
  const toggle = (v, e) => {
    const s = new Set(scope);
    const adding = !s.has(v);
    if (v === 'whole') {
      set({ scope: adding ? ['whole'] : [] });
    } else {
      s.delete('whole');
      adding ? s.add(v) : s.delete(v);
      set({ scope: SCOPE.map((x) => x.v).filter((x) => s.has(x)) });
    }
    if (adding && e?.currentTarget) fx.scan(e.currentTarget, { duration: 280, sound: null });
  };
  const pickBudget = (v, e) => {
    const nv = budget === v ? null : v;
    setBudget(nv);
    setStaffNote(profileId, { budget: nv, budgetBy: nv ? 'guest' : null });
    if (nv && e?.currentTarget) fx.scan(e.currentTarget, { duration: 280, sound: null });
  };
  const timeline = useMemo(() => TIMELINE.map((x) => ({ v: x.v, label: lab(x) })), []);
  return (
    <div className={`step hj-card hj-scope ${askBudget ? 'has-budget' : ''}`}>
      <Head eyebrow={eyebrow(5)} title={t('这一次，想做哪些地方？')} lead={t('可以多选。整间一起做，就点「全屋」。')} />
      <div className="chips center ink-chips" ref={chipsRef}>
        {SCOPE.map((s) => (
          <button key={s.v} type="button" className={`chip ${scope.includes(s.v) ? 'on' : ''}`} aria-pressed={scope.includes(s.v)} onClick={(e) => toggle(s.v, e)} data-sfx="chip">
            {lab(s)}
          </button>
        ))}
      </div>
      <div className="field center">
        <span className="field-label">{t('希望什么时候住进去？')}</span>
        <Segmented
          className={home.timeline ? '' : 'is-empty'}
          options={timeline}
          value={home.timeline}
          label={t('希望什么时候住进去？')}
          onChange={(v) => set({ timeline: v })}
        />
      </div>
      {askBudget && (
        <div className="field center hj-budget">
          <span className="field-label">{t('你心里大概的范围？')}</span>
          <div className="chips center ink-chips" role="radiogroup" aria-label={t('你心里大概的范围？')} data-sfx="radio">
            {BUDGET.map((b) => (
              <button key={b.v} type="button" role="radio" aria-checked={budget === b.v} className={`chip ${budget === b.v ? 'on' : ''} ${b.v === 'unsure' ? 'is-quiet' : ''}`} onClick={(e) => pickBudget(b.v, e)}>
                {lab(b)}
              </button>
            ))}
          </div>
          <small className="hj-budget-note">{t('整个项目的预算，只给设计师参考 —— 不会出现在你的蓝图和链接里。')}</small>
        </div>
      )}
      <div className="q-actions">
        <Next
          onClick={(e) => {
            if (!scope.length) set({ scope: ['whole'] });
            advance(e, () => chipsRef.current?.querySelector('.chip.on') || e.currentTarget);
          }}
        >
          {t('看看为我挑的家')}
        </Next>
      </div>
    </div>
  );
}

export { PROPERTY_BY_V };
