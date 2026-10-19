// 左侧：SET THE MOOD —— 一键情绪（客人的梦想家配色 + Cosy / Bright / Moody）＋ 情绪仪表 ＋ 一句话 ＋ 材质板（点一个表面）。
// 设计师打开客人档案时，底下多一张「收纳对账」（StorageCheck，由 StudioApp 传进来）。
// 面板放不下时里面可以滚：下面还有东西就在底边淡出（上面滚过去了就在顶边淡出），不会硬生生切在一格材质板中间。
// 从「带它回家」进来（选过参考案例）：最上面多一排「参考案例」（选过的案例 + 我的牌，点一下换一个，可撤销）；
// 客人家里留下来的表面在材质板上标「保留」；色温调和、明暗建议在情绪仪表下面（建议只是建议，点了才换）。
// 公司做的（柜体 = 定制柜、台面、木 / 石主题墙 = 墙板 —— offer.js）在材质板上一个金色小记号 + 一行图例「我们做」；
// 沙发、木作家具只是示意；地板、墙漆、窗帘、灯这些只是背景 —— 都不标（客人家里留下来的照样标「保留」）。

import { useLayoutEffect, useRef } from 'react';
import { MOODS, moodMeter, moodSentence } from '../../shared/moods.js';
import { SLOTS, MAT_BY_ID } from '../../shared/materials.js';
import { avoidMaterials } from '../../shared/profile.js';
import { swatchURL } from '../../shared/textures.js';
import { t, L, isEn } from '../../shared/i18n.js';
import { Icon, slotName, chipName, lockList, OfferMark } from './kit.jsx';
import { isOfferSlot } from '../offer.js';
import { BRAND } from '../../shared/config.js';

// 情绪色来自 base.css 的 token（--mood-*），不在这里写颜色
const MOOD_TINT = { cozy: 'var(--mood-cozy)', bright: 'var(--mood-bright)', moody: 'var(--mood-moody)' };
const MOOD_NAME = { cozy: { zh: '温暖', en: 'Cosy' }, bright: { zh: '明亮', en: 'Bright' }, moody: { zh: '沉浸', en: 'Moody' } };
const SUB = { 'golden hour': '金色黄昏', midday: '正午', 'after dark': '入夜' };
const paletteOf = (m) => ['walls', 'floor', 'upholstery', 'feature', 'accents'].map((s) => MAT_BY_ID[m[s]]?.color || 'var(--line)');

/** 滚动区的边缘淡出：data-fade = top | bottom | both | ''（只改 DOM 属性，滚动时不重画 React） */
function useEdgeFade(ref, deps) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const rest = el.scrollHeight - el.clientHeight - el.scrollTop;
      const top = el.scrollTop > 2;
      const bottom = rest > 2;
      const v = top && bottom ? 'both' : bottom ? 'bottom' : top ? 'top' : '';
      if ((el.dataset.fade || '') !== v) el.dataset.fade = v;
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    // 面板自己变高变矮、里面任何一块变高（收纳对账展开、「见面时要聊的」打开、一句话换行）都重新量
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    if (ro) {
      ro.observe(el);
      for (const c of el.children) ro.observe(c);
    }
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const SUGGEST = { walls: '让墙面亮一点？', floor: '地板换浅一点？' };

/**
 * 「参考案例」那一排：items = [{ id, title, cover, palette, missing } | { id: null, card: true, num, name }]，active = 正在用的 id（我的牌 = null）。
 * compact = 手机时间滑杆上面的那一条（小一点、横着滑）。
 */
export function CaseRow({ items, active, onPick, compact = false }) {
  if (!items?.length) return null;
  return (
    <section className={`st-cases ${compact ? 'compact glass' : ''}`} aria-label={t('参考案例')}>
      <div className="sec-head">
        <span>{t('参考案例')}</span>
        {!compact && <em>{t('点一下换一个')}</em>}
      </div>
      <div className="st-case-row" role="radiogroup" aria-label={t('参考案例')}>
        {items.map((it) => {
          const on = it.card ? active === null : active === it.id;
          return (
            <button
              key={it.id || 'card'}
              type="button"
              role="radio"
              aria-checked={on}
              data-sfx={on ? 'none' : 'apply'}
              className={`st-case ${on ? 'on' : ''} ${it.card ? 'card' : ''}`}
              onClick={(e) => !on && onPick(it.card ? null : it.id, e.currentTarget)}
              title={it.title}
            >
              {it.card ? (
                <span className="st-case-art st-case-card" aria-hidden="true">
                  <b>{it.num}</b>
                  <i>{it.name}</i>
                </span>
              ) : (
                // 案例的配色条垫在底下：封面还在读（或者没有照片）时也不是一块空白；封面读好了淡入盖上
                <span className="st-case-art">
                  <span className="st-case-pal" aria-hidden="true">
                    {(it.palette || []).slice(0, 4).map((c, i) => (
                      <i key={i} style={{ background: c }} />
                    ))}
                  </span>
                  {it.cover && <img src={it.cover} alt="" decoding="async" draggable={false} onLoad={(e) => e.currentTarget.classList.add('in')} />}
                </span>
              )}
              <span className="st-case-title">{it.card ? t('我的牌') : it.title}</span>
              {/* 这个案例里公司做的那几样（案例的 supplies.firm）：安静的一行 */}
              {!compact && !it.card && it.make?.length > 0 && (
                <span className="st-case-make">
                  <Icon name="make" size={10} stroke={2} />
                  <span>{it.make.join(isEn() ? ', ' : '、')}</span>
                </span>
              )}
              {it.missing && !compact && <em className="st-case-note">{t('参考案例在展厅 iPad 上')}</em>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function MoodPanel({ project, dreamer, staff = false, slot, onSlot, onMood, onToggle, chip, note, extra, cases, onCase, onSuggest, onRaw }) {
  const inner = useRef(null);
  useEdgeFade(inner, [!!chip, !!note, !!extra, !!cases?.items?.length]);
  const locked = project.locked || {};
  const keepLocked = (m) => (Object.keys(locked).length ? { ...m, ...locked } : m);
  const soft = (project.softened || []).filter((x) => x.why === 'temp');
  const sugs = (project.suggestions || []).filter((x) => SUGGEST[x.slot] && project.materials[x.slot] !== x.to && !locked[x.slot]);
  const hasLock = Object.keys(locked).length > 0;
  // 材质板上有没有「我们做」的格子（柜体、台面、木 / 石主题墙；客人家里留下来的不算）
  const anyOffer = SLOTS.some((s) => isOfferSlot(s.id, project.materials[s.id]) && !locked[s.id]);
  const meter = moodMeter(project.materials, project.time);
  const sent = moodSentence(project.materials, project.time);
  const avoid = project.profile?.avoid || [];
  const presets = MOODS.map((m) => ({
    id: m.id,
    name: isEn() ? m.en : m.zh, // Cosy / Bright / Moody 是固定的英文名，不走词典
    sub: t(SUB[m.sub] || m.sub),
    colors: paletteOf(keepLocked(avoid.length ? avoidMaterials(m.materials, avoid).materials : m.materials)),
  }));
  if (dreamer && project.profile) {
    // 和 StudioApp.applyMood('dreamer') 套上去的是同一套：温暖做底 + 客人的材质，再避开雷区 —— 预览和点下去的一样
    const dm = { ...(MOODS.find((m) => m.id === 'cozy')?.materials || {}), ...(project.profile.materials || {}) };
    // 牌号（XI）；四个字母的代号（CMRH）只在设计师版再标一次（上面的梦想家卡本来就写着）—— 客人版把位置留给名字（The Urban Minimalist）
    const sub = staff ? `${dreamer.num} · ${project.profile.code}` : dreamer.num;
    const colors = avoid.length || Object.keys(locked).length ? paletteOf(keepLocked(avoid.length ? avoidMaterials(dm, avoid).materials : dm)) : dreamer.palette;
    presets.unshift({ id: 'dreamer', name: L(dreamer), sub, colors, dreamer: true });
  }

  return (
    <aside className="glass panel mood-panel" aria-label={t('情绪 · 材质 · 光')}>
      <button type="button" className="panel-fab" onClick={onToggle} aria-label={t('展开情绪面板')} title={t('情绪 · 材质 · 光')}>
        <Icon name="palette" size={20} />
      </button>
      <div className="mp-inner" ref={inner}>
        <header className="mp-head">
          <div>
            <p className="eyebrow">{t('情绪 · 材质 · 光')}</p>
            <h2 className="mp-title">{t('定个情绪')}</h2>
          </div>
          <button type="button" className="ibtn sm" onClick={onToggle} aria-label={t('收起面板')} title={t('收起面板')}>
            <Icon name="panelClose" size={18} />
          </button>
        </header>
        <p className="mp-desc">{t('一块会自己长成房间的情绪板：把木、石、布、漆拖到任何表面，挪一挪家具，再把太阳拉过天空。')}</p>
        {chip}
        {note}
        {cases?.items?.length > 0 && <CaseRow items={cases.items} active={cases.active} onPick={onCase} />}

        <div className={`presets n${presets.length}`} role="radiogroup" aria-label={t('一键情绪')}>
          {presets.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={project.mood === p.id} className={`preset ${project.mood === p.id ? 'on' : ''} ${p.dreamer ? 'dreamer' : ''}`} onClick={() => onMood(p.id)}>
              <span className="preset-pal" aria-hidden="true">
                {p.colors.map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
              </span>
              <b>
                {p.dreamer && <Icon name="sparkles" size={14} />}
                {/* 名字自己一个盒子：b 是 flex，省略号只对盒子里的字生效 */}
                <span className="preset-name">{p.name}</span>
              </b>
              <em>{p.sub}</em>
            </button>
          ))}
        </div>

        <div className="meters" aria-label={t('情绪仪表')}>
          {['cozy', 'bright', 'moody'].map((k) => (
            <div key={k} className={`meter ${sent.top === k ? 'top' : ''}`}>
              <span>{isEn() ? MOOD_NAME[k].en : MOOD_NAME[k].zh}</span>
              <b>{meter[k]}%</b>
              <i>
                <em style={{ width: `${meter[k]}%`, background: MOOD_TINT[k] }} />
              </i>
            </div>
          ))}
        </div>
        <p className="mood-sentence">{sent.text}</p>
        {(sugs.length > 0 || soft.length > 0) && (
          <div className="st-notes">
            {soft.length > 0 && (
              <p className="st-soft">
                <Icon name="sparkles" size={14} />
                <span>{t('为了配你家的{0}，{1} 样小东西换了颜色', [lockList(locked), soft.length])}</span>
                {onRaw && (
                  <button type="button" className="st-link" onClick={onRaw}>
                    {t('还原案例原样')}
                  </button>
                )}
              </p>
            )}
            {sugs.length > 0 && (
              <div className="st-sugs">
                {sugs.map((sg) => (
                  <button key={sg.slot} type="button" className="st-sug" data-sfx="apply" onClick={() => onSuggest?.(sg)}>
                    <span className="sample xs">
                      <img src={swatchURL(sg.to, 48) || ''} alt="" draggable={false} />
                    </span>
                    <span>{t(SUGGEST[sg.slot])}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <section className="moodboard">
          <div className="sec-head">
            <span>{t('材质板 · MOODBOARD')}</span>
            <em>{slot ? t('再点一下取消') : t('点一个表面')}</em>
          </div>
          {/* 图例：金色小记号 = 我们做；小锁 = 你家原有的（K 屏选了「保留」）—— 板上真的有那个记号才写那一条 */}
          {(anyOffer || hasLock) && (
            <p className="st-legend">
              {anyOffer && (
                <span>
                  <OfferMark />
                  {t('我们做')}
                </span>
              )}
              {hasLock && (
                <span>
                  <span className="st-legend-lock" aria-hidden="true">
                    <Icon name="lock" size={9} stroke={2.2} />
                  </span>
                  {t('保留你家原有')}
                </span>
              )}
            </p>
          )}
          <div className="mb-grid">
            {SLOTS.map((s) => {
              const m = MAT_BY_ID[project.materials[s.id]];
              // 和材质栏一样拆成「系列 + 名字」（石英石 / 洞石纹、Quartz / Travertine）：窄格子里不截断、不留单个字
              const { fam, name } = chipName(m);
              // 客人家里留下来的（锁住的）不是我们要做的
              const offer = isOfferSlot(s.id, m?.id) && !locked[s.id];
              return (
                <button
                  key={s.id}
                  type="button"
                  data-slot={s.id}
                  className={`mb-tile ${slot === s.id ? 'on' : ''}`}
                  onClick={() => onSlot(s.id)}
                  aria-pressed={slot === s.id}
                  aria-label={`${slotName(s)} · ${L(m)}${offer ? ` · ${t('我们做')}` : ''}${locked[s.id] ? ` · ${t('保留你家原有')}` : ''}`}
                  title={m ? (isEn() ? L(m) : `${m.zh} · ${m.en}`) : undefined}
                >
                  <span className="sample sm">
                    <img src={swatchURL(m?.id, 96) || ''} alt="" draggable={false} />
                    {offer && <OfferMark />}
                  </span>
                  {locked[s.id] && (
                    <span className="st-lock" title={t('你家现有的，锁住了')}>
                      <Icon name="lock" size={10} />
                      {t('已保留')}
                    </span>
                  )}
                  <span className="mb-slot">{slotName(s)}</span>
                  <span className={`mb-mat ${fam ? 'has-fam' : ''}`}>
                    {fam && <i>{fam}</i>}
                    <b>{name}</b>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        {extra}
        <footer className="mp-brand" aria-hidden="true">
          <b>{BRAND.app}</b>
          <span>{BRAND.by}</span>
        </footer>
      </div>
    </aside>
  );
}
