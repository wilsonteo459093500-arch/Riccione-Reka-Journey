// 案例整理 · 一个项目一行：挑好的照片（封面在前）+ 被藏起来的（重复 / 不合适）+ 风格 / 房子 / 几房 / 业主同意 + 好了 / 跳过。
// 点照片 = 要 / 不要；星星 = 封面；房间小标签 = 改房间；放大镜 = 看大图。键盘：见「键盘」说明。

import { memo, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Merge, Pencil, RotateCcw, Scissors, Star, ZoomIn, X, TriangleAlert, CircleCheck } from 'lucide-react';
import { t, L, isEn } from '../../shared/i18n.js';
import { PROPERTY_TYPES, roomLabel } from '../../shared/cases.js';
import { getData, index } from './data.js';
import { cssOfLab } from './color.js';

const WHY = { dup: '重复', cross: '别的项目里有', blur: '模糊', dark: '太暗', shot: '截图', doc: '单据 / 文件', site: '工地', small: '太小', plan: '图纸', bright: '过曝' };
export const whyLabel = (w) => t(WHY[w] || w);
const BEDS = [1, 2, 3, 4, 5];

/** 一张小图：滚到附近才去拿（IndexedDB / worker），离开时让出内存 */
export function Thumb({ thumbs, k, className = '' }) {
  const [url, setUrl] = useState(() => thumbs.peek(k));
  const ref = useRef(null);
  useEffect(() => {
    let alive = true;
    thumbs.hold(k);
    const cur = thumbs.peek(k);
    if (cur) {
      setUrl(cur);
      return () => thumbs.release(k);
    }
    setUrl(null);
    const el = ref.current;
    let io = null;
    const go = () => thumbs.want(k, (u) => alive && setUrl(u));
    if (el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (es) => {
          if (es.some((e) => e.isIntersecting)) {
            io.disconnect();
            go();
          }
        },
        { rootMargin: '700px 0px' }
      );
      io.observe(el);
    } else go();
    return () => {
      alive = false;
      io?.disconnect();
      thumbs.release(k);
    };
  }, [k, thumbs]);
  return (
    <span ref={ref} className={`so-thumb ${url ? 'is-in' : ''} ${className}`}>
      {url && <img src={url} alt="" loading="lazy" decoding="async" draggable={false} />}
    </span>
  );
}

function Photo({ s, g, k, cover, picked, thumbs, focus, onPick, onCover, onRoom, onZoom, onSplit, why }) {
  const room = s.roomOf(g, k);
  return (
    <figure className={`so-ph ${cover ? 'is-cover' : ''} ${picked ? 'is-picked' : 'is-out'} ${focus ? 'is-focus' : ''}`} data-k={k}>
      <button type="button" className="so-ph-img" aria-pressed={picked} data-sfx="choice" title={picked ? t('点一下：不要这张') : t('点一下：要这张')} onClick={() => onPick(k)}>
        <Thumb thumbs={thumbs} k={k} />
        {picked && (
          <span className="so-ph-check" aria-hidden="true">
            <Check size={13} strokeWidth={3} />
          </span>
        )}
        {cover && <span className="so-ph-badge">{t('封面')}</span>}
        {!picked && why?.length > 0 && <span className="so-ph-why">{why.map(whyLabel).join(' · ')}</span>}
      </button>
      <div className="so-ph-tools">
        <button type="button" className={`so-ph-star ${cover ? 'on' : ''}`} data-sfx="select" aria-label={t('设为封面')} title={t('设为封面')} onClick={() => onCover(k)}>
          <Star size={14} strokeWidth={2} fill={cover ? 'currentColor' : 'none'} />
        </button>
        {picked ? (
          <button type="button" className={`so-ph-room ${room ? '' : 'is-empty'}`} data-sfx="open" title={room ? `${roomLabel(room)} · ${t('这张是哪个房间')}` : t('这张是哪个房间')} onClick={(e) => onRoom(k, e.currentTarget)}>
            {room ? roomLabel(room) : t('房间？')}
          </button>
        ) : (
          <span className="so-sp" />
        )}
        <button type="button" className="so-ph-zoom" data-sfx="open" aria-label={t('看大图')} title={t('看大图')} onClick={() => onZoom(k)}>
          <ZoomIn size={14} strokeWidth={2} />
        </button>
        {onSplit && (
          <button type="button" className="so-ph-zoom" data-sfx="tap" aria-label={t('从这张开始拆成新项目')} title={t('从这张开始拆成新项目')} onClick={() => onSplit(k)}>
            <Scissors size={14} strokeWidth={2} />
          </button>
        )}
      </div>
    </figure>
  );
}

function Row({ s, g, sig, thumbs, focused, expanded, focusKey, onFocus, onExpand, onZoom, onRoom, onMerge, onRename, onAct }) {
  void sig;
  const d = s.decision(g.id);
  const state = s.stateOf(g);
  const share = s.analysedShare(g);
  const picked = s.pickedOf(g);
  const cover = picked[0] || null;
  const auto = s.auto.get(g.id);
  const styles = s.stylesOf(g);
  const label = L(s.label(g));
  const others = g.keys.filter((k) => !picked.includes(k));
  const hiddenN = others.filter((k) => s.hiddenWhy(g, k)).length;
  const dupN = others.filter((k) => (s.hiddenWhy(g, k) || [])[0] === 'dup' || (s.hiddenWhy(g, k) || [])[0] === 'cross').length;
  const failed = g.keys.filter((k) => s.failed.has(k)).length;
  const pal = share >= 1 ? s.paletteOf(g) : null;
  const dupOf = s.cross.dupGroup.get(g.id);
  const dupTarget = dupOf ? s.groups.find((x) => x.id === dupOf.of) : null;
  const miss = s.readyCheck(g);
  const noRoom = picked.filter((k) => !s.roomOf(g, k)).length;
  const saved = d.saved && !s.dirty(g);
  const { styleById } = index();
  const D = getData();

  const setD = (patch) => s.setDecision(g.id, patch);
  const togglePick = (k) => {
    const cur = s.pickedOf(g);
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    setD({ picked: next, cover: cur.includes(k) && d.cover === k ? undefined : d.cover, state: state === 'skip' ? 'todo' : d.state });
  };
  const setCover = (k) => {
    const cur = s.pickedOf(g);
    setD({ picked: cur.includes(k) ? cur : [k, ...cur], cover: k });
  };
  const toggleStyle = (id) => {
    const cur = styles;
    setD({ styles: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  return (
    <article
      className={`so-row is-${state} ${focused ? 'is-focus' : ''} ${saved ? 'is-saved' : ''}`}
      data-gid={g.id}
      onPointerDown={() => !focused && onFocus(g.id)}
      aria-label={label}
    >
      <header className="so-row-head">
        <div className="so-row-name">
          <h3>
            {label}
            <button type="button" className="so-icon" data-sfx="open" aria-label={t('改名字')} title={t('改名字（只有员工看得到）')} onClick={() => onRename(g.id)}>
              <Pencil size={13} strokeWidth={2} />
            </button>
          </h3>
          <p className="so-row-sub">
            {t('{0} 张 · 挑了 {1} 张', [g.keys.length, picked.length])}
            {dupN > 0 && <span> · {t('重复 {0}', [dupN])}</span>}
            {hiddenN - dupN > 0 && <span> · {t('不合适 {0}', [hiddenN - dupN])}</span>}
            {failed > 0 && <span className="so-warn"> · {t('读不了 {0}', [failed])}</span>}
            {noRoom > 0 && picked.length > 0 && (
              <span className={noRoom * 2 > picked.length ? 'so-warn-soft' : ''}>
                {' · '}
                {t('{0} 张没标房间', [noRoom])} <kbd>R</kbd>
              </span>
            )}
          </p>
          {(g.series?.length > 0 || g.boards?.length > 0 || g.materials?.length > 0 || g.raw?.length > 0) && (
            <p className="so-notes" title={t('从文件夹名字读到的（只给员工看）')}>
              {(g.series || []).map((x) => (
                <span key={'s' + x} className="so-note is-series">
                  {L(index().seriesById[x] || { zh: x, en: x })}
                </span>
              ))}
              {(g.boards || []).map((b) => (
                <span key={'b' + b.name + b.variant} className="so-note">
                  {b.name}
                  {b.variant}
                  {b.code && <small>{b.code}</small>}
                </span>
              ))}
              {(g.materials || []).map((m) => (
                <span key={'m' + m} className="so-note is-raw">
                  {s.safe(m)}
                </span>
              ))}
              {(g.raw || []).map((m) => (
                <span key={'r' + m} className="so-note is-raw">
                  {t('风格词：{0}', [s.safe(m)])}
                </span>
              ))}
            </p>
          )}
        </div>
        {pal && pal.swatches.length > 0 && (
          <span className="so-pal" aria-hidden="true">
            {pal.swatches.slice(0, 4).map((c, i) => (
              <i key={i} style={{ background: cssOfLab(c.lab), flexGrow: Math.max(0.6, c.share * 4) }} />
            ))}
          </span>
        )}
        <span className={`so-pill is-${saved ? 'saved' : s.dirty(g) ? 'dirty' : state}`}>
          {saved ? t('已存进案例库') : s.dirty(g) ? t('改过，要再存') : state === 'ready' ? t('好了') : state === 'skip' ? t('跳过') : t('未看')}
        </span>
      </header>

      {dupTarget && state === 'skip' && !d.state && (
        <div className="so-dup">
          <TriangleAlert size={15} strokeWidth={2} aria-hidden="true" />
          <span>{t('和「{0}」重复（{1}% 的照片一样），先跳过。', [L(s.label(dupTarget)), Math.round(dupOf.share * 100)])}</span>
          <button type="button" className="btn-line small" data-sfx="drop" onClick={() => onMerge(g.id, dupTarget.id)}>
            <Merge size={14} strokeWidth={2} aria-hidden="true" />
            {t('并进去')}
          </button>
          <button type="button" className="btn-ghost so-mini" onClick={() => setD({ state: 'todo' })}>
            {t('还是要它')}
          </button>
        </div>
      )}

      <div className="so-strip">
        {share < 1 && !picked.length ? (
          <div className="so-wait">
            {Array.from({ length: Math.min(4, g.keys.length) }, (_, i) => (
              <span key={i} className="so-thumb so-skel" />
            ))}
            <span className="so-wait-t">{t('正在看照片 {0} / {1}', [Math.round(share * g.keys.length), g.keys.length])}</span>
          </div>
        ) : (
          picked.map((k) => (
            <Photo key={k} s={s} g={g} k={k} cover={k === cover} picked thumbs={thumbs} focus={focused && focusKey === k} onPick={togglePick} onCover={setCover} onRoom={(kk, el) => onRoom(g.id, kk, el)} onZoom={(kk) => onZoom(g.id, kk)} />
          ))
        )}
        {!picked.length && share >= 1 && <p className="so-empty">{t('没有合适的照片 —— 点「其它照片」挑几张，或者跳过这个项目。')}</p>}
        {others.length > 0 && (
          <button type="button" className={`so-more ${expanded ? 'on' : ''}`} data-sfx="open" aria-expanded={expanded} onClick={() => onExpand(g.id)}>
            {expanded ? <ChevronUp size={16} strokeWidth={2} /> : <ChevronDown size={16} strokeWidth={2} />}
            <span>{expanded ? t('收起') : t('其它照片 {0}', [others.length])}</span>
          </button>
        )}
      </div>

      {expanded && (
        <div className="so-others">
          {s.orderOf(g)
            .filter((k) => !picked.includes(k))
            .map((k) => (
              <Photo key={k} s={s} g={g} k={k} cover={false} picked={false} why={s.hiddenWhy(g, k)} thumbs={thumbs} focus={focused && focusKey === k} onPick={togglePick} onCover={setCover} onRoom={(kk, el) => onRoom(g.id, kk, el)} onZoom={(kk) => onZoom(g.id, kk)} onSplit={(kk) => onAct('split', g.id, kk)} />
            ))}
        </div>
      )}

      <div className="so-tags">
        <div className="so-set" role="group" aria-label={t('风格')}>
          <span className="so-set-l">{t('风格')}</span>
          {D.styles.map((st, i) => (
            <button key={st.id} type="button" className={`chip so-chip ${styles.includes(st.id) ? 'on' : ''}`} aria-pressed={styles.includes(st.id)} data-sfx="chip" onClick={() => toggleStyle(st.id)}>
              {i < 9 && <kbd>{i + 1}</kbd>}
              {L(st)}
              {d.aiStyles?.includes(st.id) && !g.styles?.includes(st.id) && <small className="so-ai">AI</small>}
            </button>
          ))}
        </div>
        <div className="so-set" role="radiogroup" aria-label={t('房子')}>
          <span className="so-set-l">{t('房子')}</span>
          {PROPERTY_TYPES.map((p, i) => (
            <button key={p.id} type="button" role="radio" aria-checked={d.type === p.id} className={`chip so-chip ${d.type === p.id ? 'on' : ''}`} data-sfx="radio" onClick={() => setD({ type: d.type === p.id ? undefined : p.id })}>
              <kbd>⇧{i + 1}</kbd>
              {t(p.zh)}
            </button>
          ))}
        </div>
        <div className="so-set so-set-tight" role="radiogroup" aria-label={t('几房（选填）')}>
          <span className="so-set-l">{t('几房（选填）')}</span>
          {BEDS.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={d.bedrooms === n} className={`chip so-chip so-num ${d.bedrooms === n ? 'on' : ''}`} data-sfx="radio" onClick={() => setD({ bedrooms: d.bedrooms === n ? undefined : n })}>
              {n === 5 ? '5+' : n}
            </button>
          ))}
        </div>
        <div className="so-row-foot">
          <label className={`so-consent ${d.consent ? 'on' : ''}`} data-sfx="toggle">
            <input type="checkbox" checked={!!d.consent} onChange={(e) => setD({ consent: e.target.checked })} disabled={g.kind === 'showroom'} />
            <span className="so-box" aria-hidden="true">
              <Check size={13} strokeWidth={3} />
            </span>
            <span>{g.kind === 'showroom' ? t('展厅照片：不会给客人配对') : t('业主同意展示（上架前一定要有）')}</span>
            <kbd>C</kbd>
          </label>
          <span className="so-sp" />
          {miss.length > 0 && state !== 'skip' && (
            <span className="so-miss">
              {t('还差：{0}', [miss.map((m) => t(m === 'style' ? '风格' : m === 'type' ? '房子' : '照片')).join(isEn() ? ', ' : '、')])}
            </span>
          )}
          {state === 'skip' ? (
            <button type="button" className="btn-line small" data-sfx="back" onClick={() => onAct('todo', g.id)}>
              <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
              {t('不跳过了')}
            </button>
          ) : (
            <button type="button" className="btn-ghost so-mini" data-sfx="cross" onClick={() => onAct('skip', g.id)}>
              <X size={15} strokeWidth={2} aria-hidden="true" />
              {t('跳过')}
              <kbd>X</kbd>
            </button>
          )}
          <button type="button" className={`btn-primary small so-ok ${state === 'ready' ? 'is-on' : ''}`} disabled={miss.length > 0} onClick={() => onAct(state === 'ready' ? 'todo' : 'ready', g.id)}>
            {state === 'ready' ? <CircleCheck size={16} strokeWidth={2} aria-hidden="true" /> : <Check size={16} strokeWidth={2.4} aria-hidden="true" />}
            {state === 'ready' ? t('好了') : t('好了，下一个')}
            <kbd>↵</kbd>
          </button>
        </div>
      </div>
    </article>
  );
}

export default memo(Row, (a, b) => a.sig === b.sig && a.focused === b.focused && a.expanded === b.expanded && a.focusKey === b.focusKey && a.lang === b.lang && a.g === b.g);
