// 员工 · 案例库（cases.html）—— 公司做过的家 + 3D 风格方案：上架、打标签、排序、看示范客人会配到什么。
//
// 只给员工：入口页「员工 · 案例库」按住 3 秒打开（带 ?staff=1）；直接打开这一页也要先按住 3 秒。许愿模式里没有任何路到这里。
// 资料：src/shared/cases.js（随网站发布的 manifest + 这台设备上改过 / 新增的，rev 大的赢）。
// 照片：这一页可以选文件（员工页）；浏览器里压成 1600 + 480 WebP（重新画一次 = EXIF / GPS 都没了），只存在这台设备，
//       「导出」时内嵌进案例包（WISH-cases-YYYYMMDD.json），之后由负责的人合并回 src/cases/manifest.json。
// 「用示范客人看看」：三位示范客人（或这台设备上存的客人蓝图）→ 客人会看到的四个家 + 只有员工看得到的分数明细。
//
// 声音 / 动效：installSfx 盖住所有按钮；多选标签 data-sfx="choice"，拖动 grab / drop，删除 = 金尘（fx.dissolve）。

import { Component, Suspense, lazy, memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ArrowDown, ArrowDownUp, ArrowLeft, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Eye, EyeOff, FolderTree, GripVertical, ImagePlus, Layers, LockKeyhole, Plus, RotateCcw, Sparkles, Star, Trash2, TriangleAlert, Upload, X } from 'lucide-react';
import LangToggle from '../shared/LangToggle.jsx';
import { t, L, isEn } from '../shared/i18n.js';
import * as C from '../shared/cases.js';
import { SERIES, SERIES_BY_KEY, seriesKeyOf } from '../shared/series.js';
import { MATERIALS, MAT_BY_ID, SLOTS, SLOT_BY_ID, CATEGORIES, fits, onBoards } from '../shared/materials.js';
import { idLabel, factoryCode, boardsOn } from '../shared/boards/match.js';
import { swatchURL } from '../shared/textures.js';
import { DREAMERS, DREAMER_BY_CODE, AXES, HIDDEN_AXES } from '../shared/dreamers.js';
import { MOODS } from '../shared/moods.js';
import { TEMPLATES } from '../studio/plan/model.js';
import { buildProfile, loadArchive } from '../shared/profile.js';
import * as FLOW from '../quiz/flow.js';
import { sfx } from '../shared/sfx.js';
import fx from '../shared/fx.js';
import { useHold } from '../wish/useHold.js';

// GUEST 的「最像你的 4 个家」（客人真正看到的那一屏）：文件还没写好时用这里自己的简版
const GUEST_STEP = import.meta.glob('../quiz/home/CasesStep.jsx');
const loadGuestStep = GUEST_STEP['../quiz/home/CasesStep.jsx'];
const GuestCasesStep = loadGuestStep ? lazy(loadGuestStep) : null;
// 案例整理（SORTER）记下的城市 / 系列 / 提到的材料：只给员工看，存在这台电脑（不在案例里）
const SorterNote = lazy(() => import('./sorter/Note.jsx'));
// 「这个家用了」下面的溪岸板材（案例原板 + 还用了）：用到才载入
const BoardRows = lazy(() => import('./boards/BoardPicker.jsx'));

const clone = (o) => JSON.parse(JSON.stringify(o));
/** 列举用的分隔：中文「、」，英文「, 」 */
const listSep = () => (isEn() ? ', ' : '、');
const fmtTime = (h) => {
  if (h == null) return '—';
  const H = Math.floor(h);
  const M = Math.round((h - H) * 60);
  return `${String(H).padStart(2, '0')}:${String(M === 60 ? 0 : M).padStart(2, '0')}`;
};
const STATUS_LABEL = { live: '已上架', draft: '草稿', hidden: '隐藏' };
const KIND_LABEL = { project: '我们做过的家', concept: '3D 风格方案' };
const TEMPLATE_FOR = { condo: 'condo3', terrace: 'terrace2', semid: 'semid2', bungalow: 'semid2', townhouse: 'terrace2', other: 'condo3' };

// 家具款式（3D 自动摆放用：furnish(…, { style })）
const FURNITURE = [
  { id: 'sofa', zh: '沙发', opts: [['classic', '经典'], ['curvy', '弧形'], ['lshape', 'L 形']] },
  { id: 'coffeeTable', zh: '茶几', opts: [['round', '圆'], ['rect', '方'], ['stone', '石材']] },
  { id: 'diningTable', zh: '餐桌', opts: [['round', '圆桌'], ['rect', '长桌']] },
  { id: 'armchair', zh: '单椅', opts: [['classic', '经典'], ['lounge', '休闲']] },
  { id: 'rug', zh: '地毯', opts: [['rect', '方'], ['round', '圆']] },
  { id: 'handle', zh: '柜门', opts: [['none', '隐藏拉手'], ['bar', '拉手']] },
  { id: 'plants', zh: '绿植', opts: [['few', '少'], ['some', '一些'], ['many', '很多']] },
];

// ───────────────────────── 示范客人（SPEC §11.4；不是真的客人） ─────────────────────────

const SAMPLES = [
  { id: 'peggy', name: 'Peggy', picks: 'room:a wall:c touch:a guest:a sofa:c night:c floor:a kitchen:a table:c weekend:b', wishes: ['storage', 'clean', 'kids'], avoid: ['marble'], life: { cook: 'heavy', who: ['kids'] }, ratio: 20, home: { type: 'condo', sizeSqft: 1050, bedrooms: 3, bathrooms: 2, scope: ['whole'] } },
  { id: 'ken', name: 'Ken & Mei', picks: 'room:b wall:d touch:b guest:c sofa:b night:a floor:e kitchen:c table:d weekend:a', wishes: ['host', 'photo', 'work'], avoid: ['rattan', 'pink'], life: { cook: 'light', who: [] }, ratio: 45, home: { type: 'bungalow', sizeSqft: 3800, bedrooms: 5, bathrooms: 5, scope: ['living', 'dining', 'kitchen'] } },
  { id: 'aisha', name: 'Aisha', picks: 'room:f wall:b touch:a guest:b sofa:c night:c floor:a kitchen:b table:c weekend:a', wishes: ['host', 'kitchen', 'pets'], avoid: ['grey', 'black'], life: { cook: 'heavy', who: ['cat'] }, ratio: 40, home: { type: 'terrace', sizeSqft: 1700, bedrooms: 4, bathrooms: 3, scope: ['living', 'kitchen', 'dining'] } },
];
function sampleProfile(s) {
  const pairs = Object.fromEntries(s.picks.split(' ').map((x) => x.split(':')).map(([k, v]) => [k, { pick: v, ms: 2200, left: 'abcd' }]));
  const p = buildProfile({ name: s.name, players: 'solo', pairs, wishes: s.wishes, avoid: s.avoid, life: s.life, ratio: s.ratio, ratioTouched: true }, { id: `SAMPLE-${s.id}` }, { PAIRS: FLOW.PAIRS, LIFE: FLOW.LIFE });
  return { ...p, home: { ...s.home } };
}

// ───────────────────────── 小零件 ─────────────────────────

/** 设备上的照片要先读成 object URL（只读需要的那几张）；离开时放掉 */
function useResolved(c, opts) {
  const [r, setR] = useState(null);
  const key = c ? `${c.id}:${c.rev}:${(c.images || []).map((im) => im.id + (im.cover ? '*' : '')).join(',')}` : '';
  useEffect(() => {
    if (!c) return undefined;
    let alive = true;
    let got = null;
    C.resolveImages(c, opts).then((x) => {
      got = x;
      if (alive) setR(x);
      else C.releaseImages(x);
    });
    return () => {
      alive = false;
      if (got) C.releaseImages(got);
    };
  }, [key]);
  return r;
}

function Swatch({ id, size = 40 }) {
  const url = useMemo(() => {
    try {
      return id && MAT_BY_ID[id] ? swatchURL(id, 96) : '';
    } catch {
      return '';
    }
  }, [id]);
  return <i className="mg-sw" style={{ width: size, height: size, backgroundImage: url ? `url(${url})` : 'none', backgroundColor: MAT_BY_ID[id]?.color }} aria-hidden="true" />;
}

const dreamerName = (code) => {
  const d = DREAMER_BY_CODE[code];
  return d ? `${d.num} · ${L({ zh: d.zh, en: d.en })}` : code;
};

function Seg({ value, options, onChange, label, small = true }) {
  const i = Math.max(0, options.findIndex((o) => o[0] === value));
  return (
    <div className={`seg ${small ? 'seg-sm' : ''} mg-seg`} style={{ '--n': options.length, '--i': i }} role="radiogroup" aria-label={label}>
      <span className="seg-thumb" aria-hidden="true" />
      {options.map(([v, zh]) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} className={v === value ? 'on' : ''} onClick={() => v !== value && onChange(v)}>
          {t(zh)}
        </button>
      ))}
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }) {
  const v = value ?? min;
  return (
    <div className="mg-stepper">
      <span>{t(label)}</span>
      <div className="mg-stepper-ctl">
        <button type="button" data-sfx="minus" aria-label={t('少一个')} disabled={v <= min} onClick={() => onChange(Math.max(min, v - 1))}>
          −
        </button>
        <b>{value == null ? '—' : v}</b>
        <button type="button" data-sfx="plus" aria-label={t('多一个')} disabled={v >= max} onClick={() => onChange(Math.min(max, v + 1))}>
          +
        </button>
      </div>
    </div>
  );
}

function Field({ label, children, hint, id }) {
  return (
    <section className="mg-field" id={id}>
      <h4>{t(label)}</h4>
      {hint && <p className="mg-hint">{t(hint)}</p>}
      {children}
    </section>
  );
}

/** 两行输入：中文 / English（中文那一格的示例永远是中文、英文那一格是英文：不跟着界面语言换） */
function Pair({ value, onChange, multi = false, zhPh, enPh }) {
  const Tag = multi ? 'textarea' : 'input';
  return (
    <div className="mg-pair">
      <label>
        <span>中</span>
        <Tag value={value?.zh || ''} placeholder={zhPh || ''} rows={multi ? 3 : undefined} lang="zh-Hans" onChange={(e) => onChange({ ...value, zh: e.target.value })} />
      </label>
      <label>
        <span>EN</span>
        <Tag value={value?.en || ''} placeholder={enPh || ''} rows={multi ? 3 : undefined} lang="en" onChange={(e) => onChange({ ...value, en: e.target.value })} />
      </label>
    </div>
  );
}

/** 删除 / 放弃前问一句（页面里的小卡片，和入口页同一种） */
function useAsk() {
  const [q, setQ] = useState(null);
  const res = useRef(null);
  const ask = (o) =>
    new Promise((r) => {
      res.current?.(false);
      res.current = r;
      setQ(o);
    });
  const done = (v) => {
    const r = res.current;
    res.current = null;
    setQ(null);
    r?.(v);
  };
  const card = q && (
    <div className="mg-veil" onPointerDown={(e) => e.target === e.currentTarget && (sfx.play('close'), done(false))}>
      <div className="mg-ask" role="alertdialog" aria-modal="true" aria-labelledby="mg-ask-t">
        <span className={`mg-ask-ico ${q.danger ? 'is-danger' : q.warn ? 'is-warn' : ''}`} aria-hidden="true">
          {q.danger ? <Trash2 size={22} strokeWidth={1.8} /> : q.warn ? <TriangleAlert size={22} strokeWidth={1.8} /> : <Sparkles size={22} strokeWidth={1.8} />}
        </span>
        <h2 id="mg-ask-t">{q.title}</h2>
        {q.body && <p>{q.body}</p>}
        <div className="mg-ask-acts">
          <button type="button" className="btn-ghost" autoFocus onClick={() => done(false)}>
            {q.cancel || t('取消')}
          </button>
          <button type="button" className="btn-gold" onClick={() => done(true)}>
            {q.ok}
          </button>
        </div>
      </div>
    </div>
  );
  return [card, ask];
}

class Boundary extends Component {
  constructor(p) {
    super(p);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  render() {
    return this.state.err ? this.props.fallback : this.props.children;
  }
}

// ───────────────────────── 列表里的一张卡 ─────────────────────────

function Tile({ c, sel, i, onOpen, onGrip, dragging }) {
  const r = useResolved(c, { coverOnly: true, thumbsOnly: true });
  const cover = C.coverOf(r || c);
  const src = cover ? C.imageURL(r || c, cover, 480) : '';
  const st = c.status === 'live' ? (c.kind === 'concept' ? 'seed' : 'live') : c.status;
  const p = c.property || {};
  // 溪岸系列写了就跟在后面（一眼看得出哪几个家还没定系列）
  const sr = SERIES_BY_KEY[seriesKeyOf(c.series)];
  const line = [C.PROPERTY_BY_ID[p.type] && p.type !== 'other' ? t(C.PROPERTY_BY_ID[p.type].zh) : '', p.bedrooms ? t('{0} 房', [p.bedrooms]) : '', c.scope === 'rooms' ? t('部分房间') : '', sr ? L(sr) : ''].filter(Boolean).join(' · ');
  return (
    <li className={`mg-tile ${sel ? 'is-sel' : ''} ${dragging ? 'is-ghosted' : ''}`} data-id={c.id} style={{ '--fx-i': Math.min(i, 10) }}>
      <button type="button" className="mg-tile-open" data-fx-depth="0.985" data-sfx="open" onClick={() => onOpen(c)} aria-label={L(c.title) || t('未命名')}>
        <span className="mg-tile-img">
          {src ? <img src={src} alt="" loading="lazy" decoding="async" width="480" height="360" /> : <span className="mg-noimg">{t('还没有照片')}</span>}
        </span>
        <span className="mg-tile-b">
          <b>{L(c.title) || t('未命名')}</b>
          <small>{line || '—'}</small>
          <span className="mg-dots" aria-hidden="true">
            {C.casePalette(c)
              .slice(0, 5)
              .map((x) => (
                <i key={x.slot} style={{ background: x.color }} />
              ))}
          </span>
        </span>
      </button>
      <span className="mg-badges">
        <span className={`mg-st is-${st}`}>{st === 'seed' ? t('种子') : st === 'live' ? t('已上架') : t(STATUS_LABEL[c.status])}</span>
        {c.origin !== 'bundled' && <span className="mg-st is-local">{c.origin === 'device' ? t('只在这台设备') : t('这台设备改过')}</span>}
      </span>
      <button type="button" className="mg-grip" aria-label={t('拖动排序')} title={t('拖动排序')} data-sfx="grab" data-fx-ripple="off" onPointerDown={(e) => onGrip(e, c)} onKeyDown={(e) => onGrip(e, c)}>
        <GripVertical size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </li>
  );
}

// ───────────────────────── 材质选择（每个表面一格） ─────────────────────────

function MatPicker({ slot, value, onPick, onClose }) {
  const s = SLOT_BY_ID[slot];
  const list = MATERIALS.filter((m) => fits(m.id, slot));
  const cats = CATEGORIES.filter((cat) => list.some((m) => m.cat === cat.id));
  return (
    <div className="mg-veil" onPointerDown={(e) => e.target === e.currentTarget && (sfx.play('close'), onClose())}>
      <div className="mg-sheet mg-mats" role="dialog" aria-modal="true" aria-label={L(s)}>
        <header>
          <b>{t('选「{0}」的材质', [L(s)])}</b>
          <button type="button" className="mg-x" aria-label={t('关闭')} data-sfx="close" onClick={onClose}>
            <X size={18} strokeWidth={1.8} />
          </button>
        </header>
        <div className="mg-mats-body">
          {cats.map((cat) => (
            <div key={cat.id} className="mg-mats-cat">
              <h5>{L(cat)}</h5>
              <div className="mg-mats-grid" data-sfx="radio">
                {list
                  .filter((m) => m.cat === cat.id)
                  .map((m) => (
                    <button key={m.id} type="button" className={m.id === value ? 'on' : ''} aria-pressed={m.id === value} onClick={() => onPick(m.id)}>
                      <Swatch id={m.id} size={52} />
                      <span>{L(m)}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <footer>
          <button type="button" className="btn-line small" onClick={() => onPick(null)}>
            {t('不指定（用主牌的材质）')}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ───────────────────────── 照片 ─────────────────────────

/** 这一页第一次加照片时请浏览器长期保留这台设备的照片（C.askPersist；整页只问一次） */
let persistAsked = false;
const MB = 1024 * 1024;
/** 数字的千位逗号（中英文一样）；Intl 只建一次（toLocaleString 每次都建一个，很慢） */
const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
/** 字节 → MB（10 MB 以下留一位小数） */
const fmtMB = (b) => {
  const v = Math.max(0, b) / MB;
  return NUM.format(v < 10 ? Math.round(v * 10) / 10 : Math.round(v));
};
/** 「按房间排」：ROOMS 的顺序；没标房间的排在认得的后面，整个家（3D）永远最后 */
const ROOM_RANK = Object.fromEntries(C.ROOMS.filter((r) => r.id !== 'plan3d').map((r, i) => [r.id, i]));
const isPlan = (im) => im.room === 'plan3d' || im.kind === 'plan3d';
const photoRank = (im) => (isPlan(im) ? 1000 : ROOM_RANK[im.room] ?? 500);
/** case.roomsMade 照这个顺序写（和 cases.js 整理出来的一样：房间按 ROOMS，全屋最后） */
const MADE_ORDER = [...C.ROOMS.filter((r) => r.id !== 'plan3d').map((r) => r.id), C.ROOM_HOME];
/** 「{0} 张照片」：一张的时候英文是单数（和客人那边 CaseDetail 一样） */
export const photosText = (n) => (n === 1 ? t('1 张照片') : t('{0} 张照片', [n]));

/**
 * 加照片：一张一张来 —— 先压缩，压好了才写进这台设备。
 * 压不了 = 这张照片打不开：说一声，接着下一张。
 * 压好了却写不进去 = 这台设备的空间出了问题（iPad 的 WebKit 空间满了不一定说 QuotaExceeded）：后面的也存不进去 →
 * 停下来说空间不够，不要每张都说「打不开」，也不要再压后面的。
 * on.added(im, room)：存好一张；on.done(k)：处理完第 k 张；on.flash(msg, 'error')。compress 可以换掉（测试用）。回来：存好了几张。
 */
export async function addPhotos(caseId, files, on, compress = C.compressImage) {
  let k = 0;
  let saved = 0;
  for (const f of files) {
    // 认不出房间 = 先空着（「房间？」），不要猜成客厅
    const room = guessRoom(f.name) || C.ROOM_UNKNOWN;
    let big = null;
    try {
      big = await compress(f, { maxW: 1600, maxH: 1600 });
    } catch {
      on.flash(t('这张照片打不开：{0}', [f.name]), 'error');
    }
    if (big) {
      let im;
      try {
        im = await C.putImage(caseId, f, { room, blobs: { 1600: big.blob, w: big.w, h: big.h } });
      } catch (e) {
        console.warn('[cases]', e);
        on.flash(t('这台设备的空间不够了：后面的照片没有存进去'), 'error');
        break;
      }
      on.added(im, room);
      saved++;
    }
    on.done(++k);
  }
  return saved;
}

/**
 * 存一个案例（保存 / 上架 / 藏起来都走这里）：先存案例，存好了才删掉编辑器里移除的设备照片 ——
 * 存不进去的话，这台设备上那一版还指着它们。
 * 存不进去 → 抛出原来的错误，pending（新加的 / 移除的照片）原样留着：再存一次、或者「放弃改动」都还对得上。
 * 存的时候才加进来 / 移除的照片不在存的这一版里：留在 pending 里等下一次。
 */
export async function commitCase(next, pending) {
  const adds = [...pending.current.adds];
  const drops = [...pending.current.drops];
  const saved = await C.saveCase(next);
  const cur = pending.current;
  pending.current = { adds: cur.adds.filter((id) => !adds.includes(id)), drops: cur.drops.filter((id) => !drops.includes(id)) };
  for (const id of drops) {
    try {
      await C.dropImage(next.id, id);
    } catch {
      /* 案例已经存好了：删不掉的那张只是多占一点空间 */
    }
  }
  return saved;
}

/** 存不进去的时候说什么：空间不够了 / 别的问题（改动都还在编辑器里） */
export const saveFailText = (e) => (C.isQuotaError(e) ? t('这台设备的空间不够了：这次的改动没有存进去') : t('没存进去：改动都还在，再存一次试试'));

/**
 * 一张小图（480）的网址。随网站的照片直接给网址（<img loading="lazy">）；
 * 设备上的照片等它快滚到眼前（编辑器里上下 400 px 以内）才从 IndexedDB 读成 object URL，换掉 / 离开时放掉。
 * 每张只读一次：加照片、改顺序、换封面、打说明都不会把其它照片再读一遍。
 */
function useThumb(ref, caseId, im) {
  const dev = !!im?.device;
  const id = im?.id || '';
  const [got, setGot] = useState(null); // { key, url }
  const key = `${caseId}/${id}`;
  useEffect(() => {
    if (!dev || !id) return undefined;
    let alive = true;
    let res = null;
    let io = null;
    const load = () => {
      io?.disconnect();
      io = null;
      C.loadImageURL({ id: caseId }, { id, device: true }, 480).then((r) => {
        if (!alive) return r.release();
        res = r;
        setGot({ key, url: r.url });
      });
    };
    const el = ref.current;
    if (el && typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && load(), { root: el.closest('.mg-edit'), rootMargin: '400px 0px' });
      io.observe(el);
    } else load();
    return () => {
      alive = false;
      io?.disconnect();
      res?.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dev]);
  if (!im) return '';
  if (!dev) return C.imageURL(null, im, 480);
  return got?.key === key ? got.url : '';
}

/** 这台设备的照片空间（navigator.storage）：dep 变了 300 ms 后重新量一次；refresh() 马上量 */
function useStorage(dep) {
  const [info, setInfo] = useState(null);
  const seq = useRef(0);
  const refresh = useCallback(() => {
    const k = ++seq.current;
    return C.storageInfo().then((x) => {
      if (k === seq.current) setInfo(x);
    });
  }, []);
  useEffect(() => {
    const id = setTimeout(refresh, 300);
    return () => clearTimeout(id);
  }, [dep, refresh]);
  return [info, refresh];
}

/** 照片下面一行：这台设备已用多少、还剩多少；剩不到 150 MB 或用了 85 % 以上就提醒先导出 */
const StorageLine = memo(function StorageLine({ info, asked, device }) {
  if (!info?.quota) return null;
  const free = Math.max(0, info.quota - info.usage);
  const used = Math.min(1, info.usage / info.quota);
  const warn = free < 150 * MB || used > 0.85;
  return (
    <div className={`mg-store ${warn ? 'is-warn' : ''}`}>
      <span className="mg-store-bar" aria-hidden="true">
        <i style={{ '--p': `${Math.max(used * 100, 1).toFixed(1)}%` }} />
      </span>
      <p>{t('这台设备的照片空间：已用 {0} MB · 还有约 {1} MB', [fmtMB(info.usage), fmtMB(free)])}</p>
      {warn && (
        <p className="mg-store-warn">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden="true" />
          <span>{t('空间快满了（大约还能放 {0} 张照片）：先「导出」备份，再移除用不到的照片。', [NUM.format(Math.floor(free / C.PHOTO_EST_BYTES))])}</span>
        </p>
      )}
      {asked && !info.persisted && device && <p className="mg-store-note">{t('浏览器没答应长期保留：空间紧张时可能会清掉这里的照片，记得常「导出」。')}</p>}
    </div>
  );
});

/**
 * 照片说明的一格：打的字先进这一格自己的 state（只重画这一格，字马上出来）；画完这一帧以后才用 startTransition 写回案例 ——
 * 整个编辑器（40 张照片 + 所有栏位）重画不挡打字，下一个字来了还可以打断它。一帧里打了好几个字只写回一次；离开这一格马上写回。
 * 案例里的值变了：是自己写回去的（可能是打到一半的旧字）就不管；不是 = 外面改的（放弃改动、重新打开）→ 跟着换（不用先离开这一格）。
 */
function CapInput({ value, onCommit, ...rest }) {
  const [v, setV] = useState(value);
  const ref = useRef(null);
  if (!ref.current) ref.current = { text: value, last: value, sent: new Set(), queued: false, alive: true };
  const s = ref.current;
  s.commit = onCommit;
  useEffect(() => {
    s.alive = true;
    return () => {
      s.alive = false;
    };
  }, [s]);
  useLayoutEffect(() => {
    if (s.sent.has(value)) {
      if (value === s.text) s.sent.clear(); // 写回去的都到了
      return;
    }
    s.text = s.last = value;
    s.sent.clear();
    setV(value);
  }, [s, value]);
  const send = (x) => {
    s.last = x;
    s.sent.add(x);
    s.commit(x);
  };
  return (
    <input
      {...rest}
      value={v}
      onChange={(e) => {
        s.text = e.target.value;
        setV(s.text);
        if (s.queued) return;
        s.queued = true;
        requestAnimationFrame(() =>
          setTimeout(() => {
            s.queued = false;
            if (s.alive && s.text !== s.last) startTransition(() => send(s.text));
          }, 0)
        );
      }}
      onBlur={() => s.text !== s.last && send(s.text)}
    />
  );
}

/** 一张照片的格子：只比较这张照片自己的资料（patch 每次都是新对象），别的照片改了它不重画 */
const TILE_KEYS = ['id', 'room', 'kind', 'cover', 'detail', 'device', 'src', 'thumb'];
const sameTile = (a, b) =>
  a.i === b.i &&
  a.n === b.n &&
  a.caseId === b.caseId &&
  a.act === b.act &&
  TILE_KEYS.every((k) => a.im[k] === b.im[k]) &&
  (a.im.caption?.zh || '') === (b.im.caption?.zh || '') &&
  (a.im.caption?.en || '') === (b.im.caption?.en || '');

const PhotoTile = memo(function PhotoTile({ caseId, im, i, n, act }) {
  const fig = useRef(null);
  const src = useThumb(fig, caseId, im);
  const known = !!C.ROOM_BY_ID[im.room];
  const plan = isPlan(im);
  const cls = [im.cover ? 'is-cover' : '', im.detail && !plan ? 'is-detail' : ''].filter(Boolean).join(' ');
  return (
    <figure ref={fig} className={cls || undefined} data-id={im.id}>
      <span className="mg-ph">
        {src ? <img src={src} alt="" loading="lazy" decoding="async" draggable={false} /> : <i />}
        <button type="button" className="mg-ph-star" aria-pressed={!!im.cover} aria-label={t('设为封面')} title={t('设为封面')} onClick={() => act('cover', im.id)}>
          <Star size={14} strokeWidth={2} fill={im.cover ? 'currentColor' : 'none'} />
        </button>
        <button type="button" className="mg-ph-x" aria-label={t('移除这张')} title={t('移除这张')} data-sfx="chipRemove" onClick={() => act('remove', im.id)}>
          <X size={13} strokeWidth={2.2} />
        </button>
        {!plan && (
          <button type="button" className="mg-ph-detail" aria-pressed={!!im.detail} title={t('标成细节特写（柜门、拉手、板材纹理、收口）')} data-sfx="choice" onClick={() => act('detail', im.id)}>
            {t('细节')}
          </button>
        )}
        {n > 1 && (
          <span className="mg-ph-mv">
            <button type="button" aria-label={t('往前')} data-sfx="drop" disabled={i === 0} onClick={() => act('move', im.id, -1)}>
              <ChevronLeft size={14} />
            </button>
            <button type="button" aria-label={t('往后')} data-sfx="drop" disabled={i === n - 1} onClick={() => act('move', im.id, 1)}>
              <ChevronRight size={14} />
            </button>
          </span>
        )}
      </span>
      <figcaption className={known ? '' : 'is-unknown'}>
        <select value={known ? im.room : ''} aria-label={t('房间')} onChange={(e) => act('room', im.id, e.target.value)}>
          {!known && <option value="">{t('房间？')}</option>}
          {C.ROOMS.map((rm) => (
            <option key={rm.id} value={rm.id}>
              {L(rm)}
            </option>
          ))}
        </select>
        {/* 说明：中文那一格的示例永远是中文、英文那一格是英文（和 Pair 一样） */}
        <label className="mg-ph-cap">
          <span aria-hidden="true">中</span>
          <CapInput value={im.caption?.zh || ''} placeholder="照片说明" lang="zh-Hans" maxLength={80} aria-label={t('照片说明（中文）')} onCommit={(x) => act('caption', im.id, { lang: 'zh', value: x })} />
        </label>
        <label className="mg-ph-cap">
          <span aria-hidden="true">EN</span>
          <CapInput value={im.caption?.en || ''} placeholder="Caption" lang="en" maxLength={160} aria-label={t('照片说明（英文）')} onCommit={(x) => act('caption', im.id, { lang: 'en', value: x })} />
        </label>
      </figcaption>
    </figure>
  );
}, sameTile);

function Photos({ draft, patch, pending, onBusy, flash, busy }) {
  const input = useRef(null);
  const grid = useRef(null);
  const imgs = draft.images || [];
  const n = imgs.length;
  const full = n >= C.PHOTO_MAX;
  const [asked, setAsked] = useState(persistAsked);
  const [store, refresh] = useStorage(`${n}:${draft.rev}`);
  // 每张照片的按钮都用同一个 act（不会变）→ 打字时其它照片的格子不用重画；patch / pending 从这里拿最新的
  const live = useRef(null);
  live.current = { patch, pending };
  /** 改顺序 / 移除：先量、再改、弹簧滑到新位置（fx.layout） */
  const relayout = (fn) =>
    fx.layout(
      () => [...(grid.current?.querySelectorAll('figure') || [])],
      () => flushSync(fn)
    );
  const act = useCallback((type, id, v) => {
    const { patch: p, pending: pend } = live.current;
    const edit = (fn) =>
      p((x) => {
        const y = x?.images?.find((z) => z.id === id);
        if (y) fn(y, x);
      });
    if (type === 'cover') p((x) => x.images.forEach((y) => (y.cover = y.id === id)));
    else if (type === 'remove')
      relayout(() =>
        p((x) => {
          const gone = x.images.find((y) => y.id === id);
          x.images = x.images.filter((y) => y.id !== id);
          if (gone?.device) pend.current.drops.push(id);
          if (gone?.cover && x.images[0]) x.images[0].cover = true;
        })
      );
    else if (type === 'move')
      relayout(() =>
        p((x) => {
          const i = x.images.findIndex((y) => y.id === id);
          const j = i + v;
          if (i < 0 || j < 0 || j >= x.images.length) return;
          [x.images[i], x.images[j]] = [x.images[j], x.images[i]];
        })
      );
    else if (type === 'room')
      edit((y, x) => {
        y.room = v;
        y.kind = y.room === 'plan3d' ? 'plan3d' : y.kind === 'plan3d' ? (x.kind === 'project' ? 'photo' : 'render') : y.kind;
        if (y.kind === 'plan3d') y.detail = false;
      });
    else if (type === 'detail') edit((y) => (y.detail = !y.detail));
    else if (type === 'caption') edit((y) => (y.caption = { zh: '', en: '', ...y.caption, [v.lang]: v.value }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 按房间排：封面永远第一张，其它照 ROOMS 的顺序（没标房间的在后面、整个家（3D）最后）；同一个房间里保持原来的先后
  const sortByRoom = () => {
    const order = imgs
      .map((im, i) => ({ im, i }))
      .sort((a, b) => (b.im.cover ? 1 : 0) - (a.im.cover ? 1 : 0) || photoRank(a.im) - photoRank(b.im) || a.i - b.i)
      .map((x) => x.im.id);
    if (order.join() !== imgs.map((im) => im.id).join())
      relayout(() =>
        patch((x) => {
          const by = new Map(x.images.map((y) => [y.id, y]));
          x.images = [...order.map((id) => by.get(id)).filter(Boolean), ...x.images.filter((y) => !order.includes(y.id))];
        })
      );
    flash(t('已按房间排好'));
  };

  const add = async (files) => {
    const picked = [...(files || [])].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (!picked.length) return;
    // 一个案例最多 PHOTO_MAX 张：多出来的不加，告诉员工几张没加进来
    const list = picked.slice(0, Math.max(0, C.PHOTO_MAX - n));
    if (list.length < picked.length) flash(t('最多 {0} 张照片：有 {1} 张没加进来', [C.PHOTO_MAX, picked.length - list.length]), 'error');
    if (!list.length) return;
    if (!persistAsked) {
      persistAsked = true;
      C.askPersist().finally(() => {
        setAsked(true);
        refresh();
      });
    }
    onBusy(t('正在压缩照片 {0}/{1}', [0, list.length]));
    await addPhotos(draft.id, list, {
      added: (im, room) => {
        pending.current.adds.push(im.id);
        patch((d) => {
          d.images = [...(d.images || []), im];
          if (!d.images.some((x) => x.cover)) d.images[0].cover = true;
          if (room && room !== 'plan3d' && !d.rooms.includes(room)) d.rooms.push(room);
        });
      },
      done: (k) => onBusy(k < list.length ? t('正在压缩照片 {0}/{1}', [k, list.length]) : null),
      flash,
    });
    onBusy(null);
    refresh();
  };

  return (
    <Field id="mg-f-photos" label="照片（第一张是封面）" hint="点星星换封面；每张选一下是哪个房间（「房间？」= 还没标，客人看不到房间名字）。这里加的照片只存在这台设备，「导出」时会一起带走。">
      <p className="mg-hint">{t('「细节」= 柜门、拉手、板材纹理、收口这类近照，客人那边单独一格；说明写一句就好，客人看大图时看得到。')}</p>
      <div className="mg-ph-bar">
        <span className={`mg-ph-count ${full ? 'is-full' : ''}`}>{t('{0} / {1} 张', [n, C.PHOTO_MAX])}</span>
        {n > 1 && (
          <button type="button" className="mg-link mg-ph-sort" data-sfx="apply" onClick={sortByRoom}>
            <ArrowDownUp size={14} strokeWidth={2} aria-hidden="true" />
            {t('按房间排')}
          </button>
        )}
      </div>
      <div className="mg-photos" ref={grid}>
        {imgs.map((im, i) => (
          <PhotoTile key={im.id} caseId={draft.id} im={im} i={i} n={n} act={act} />
        ))}
        <button type="button" className={`mg-ph-add ${full ? 'is-full' : ''}`} data-sfx="open" disabled={full || !!busy} onClick={() => input.current?.click()}>
          <ImagePlus size={22} strokeWidth={1.6} aria-hidden="true" />
          <span>{full ? t('满了 · 最多 {0} 张', [C.PHOTO_MAX]) : t('加照片')}</span>
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <StorageLine info={store} asked={asked} device={imgs.some((im) => im.device)} />
    </Field>
  );
}

// ───────────────────────── 每个房间我们做了什么 ─────────────────────────

/** 一个房间最多几块板（和 cases.js cleanRoomsMade 一样） */
const BOARDS_PER_ROOM = 4;

/** 板材登记好了 / 变了（「这个家用了」的 BoardRows 载入后读这台设备的板材包）→ 重新画板的名字和色卡 */
function useBoardsV() {
  const [v, setV] = useState(0);
  useEffect(() => onBoards(() => setV((x) => x + 1)), []);
  return v;
}

/** 板的色卡：板材库里有 → 真实色卡 / 近似色；还不认得 → 虚线斜纹 */
function BoardSw({ id, v, size = 28 }) {
  const m = MAT_BY_ID[id];
  const url = useMemo(() => {
    try {
      return m?.board ? swatchURL(id, 96) || '' : '';
    } catch {
      return '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, m, v]);
  if (!m?.board) return <i className="mg-sw is-unknown" style={{ width: size, height: size }} aria-hidden="true" />;
  return <i className="mg-sw" style={{ width: size, height: size, backgroundImage: url ? `url(${url})` : 'none', backgroundColor: m.color }} aria-hidden="true" />;
}

/** 房间那一行左边的小图（这个房间的封面 / 第一张；全屋 = 案例封面） */
function MadeThumb({ caseId, im }) {
  const ref = useRef(null);
  const src = useThumb(ref, caseId, im);
  return <span ref={ref} className="mg-made-thumb">{src ? <img src={src} alt="" loading="lazy" decoding="async" draggable={false} /> : null}</span>;
}

/**
 * 「每个房间我们做了什么」：一个房间一行（C.caseRoomsMade(draft, { staff:true })），点开改。
 * 没改过的房间是「自动」（照「我们做」和溪岸板材推算）；改了任何一样 → roomsMade[room] 存下这个房间现在的全部（我们做、板、说明），
 * 之后这个房间就照员工写的；「恢复自动」= 删掉 roomsMade[room]。
 */
function RoomsMade({ draft, patch }) {
  const v = useBoardsV();
  const [open, setOpen] = useState(null);
  const rows = C.caseRoomsMade(draft, { staff: true });
  const caseBoards = C.caseBoardList(draft).map((b) => b.id);
  const boardsShown = boardsOn();
  const write = (room, fn) =>
    patch((d) => {
      const row = C.caseRoomsMade(d, { staff: true }).find((r) => r.room === room);
      const m = row?.made ? clone(row.made) : { firm: [], boards: [], note: { zh: '', en: '' } };
      fn(m);
      // 我们做的照 SUPPLY_OFFER 的顺序；房间照 MADE_ORDER 的顺序写
      m.firm = C.SUPPLY_OFFER.map((s) => s.id).filter((id) => m.firm.includes(id));
      m.boards = [...new Set(m.boards)].slice(0, BOARDS_PER_ROOM);
      const next = { ...(d.roomsMade || {}), [room]: m };
      d.roomsMade = Object.fromEntries(MADE_ORDER.filter((r) => next[r]).map((r) => [r, next[r]]));
    });
  const reset = (room) =>
    patch((d) => {
      const { [room]: _, ...rest } = d.roomsMade || {};
      d.roomsMade = rest;
    });
  const toggle = (arr, x) => (arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);
  return (
    <Field id="mg-f-made" label="每个房间我们做了什么" hint="客人在案例详情里一个房间一行地看。「自动」= 照「我们做」和溪岸板材推算的；改了任何一样，这个房间就照你写的。">
      <div className="mg-made">
        {rows.map((row) => {
          const on = open === row.room;
          const made = row.made;
          const home = row.room === C.ROOM_HOME;
          const summary = [...row.firm.map((f) => f.label), ...row.boards.map((b) => b.name), row.note].filter(Boolean).join(listSep());
          const offRoom = !home && !row.derived && !draft.rooms.includes(row.room);
          const ids = [...caseBoards, ...made.boards.filter((id) => !caseBoards.includes(id))];
          const fullBoards = made.boards.length >= BOARDS_PER_ROOM;
          const bodyId = `mg-made-${row.room}`;
          return (
            <div key={row.room} className={`mg-made-row ${on ? 'is-open' : ''}`}>
              <button type="button" className="mg-made-head" aria-expanded={on} aria-controls={bodyId} data-sfx={on ? 'close' : 'open'} onClick={() => setOpen(on ? null : row.room)}>
                <MadeThumb caseId={draft.id} im={row.cover} />
                <span className="mg-made-t">
                  <b>
                    <span>{row.label}</span>
                    {row.derived && <em className="mg-made-auto">{t('自动')}</em>}
                    {!home && <small>{photosText(row.images)}</small>}
                  </b>
                  {/* 没写的房间：客人「每个房间我们做了什么」里少这一行，照片（相册的房间标签）照样看得到 */}
                  <small className={summary ? '' : 'is-empty'}>{summary || t('没写：客人在「每个房间」里看不到这一行（照片照常显示）')}</small>
                  {offRoom && <small className="mg-made-off">{t('这个房间不在「做了哪些地方」里')}</small>}
                </span>
                <ChevronDown className="mg-made-chev" size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
              {on && (
                <div className="mg-made-body" id={bodyId}>
                  <p className="mg-sub">{t('我们做')}</p>
                  <div className="chips mg-chips mg-made-firm" data-sfx="choice">
                    {C.SUPPLY_OFFER.map((s) => {
                      const sel = made.firm.includes(s.id);
                      return (
                        <button key={s.id} type="button" className={`chip ${sel ? 'on' : ''}`} aria-pressed={sel} onClick={() => write(row.room, (m) => (m.firm = toggle(m.firm, s.id)))}>
                          {L(s)}
                        </button>
                      );
                    })}
                  </div>
                  {boardsShown && (
                    <>
                      <p className="mg-sub">{t('溪岸板材')}</p>
                      {ids.length ? (
                        <div className="mg-made-boards" data-sfx="choice">
                          {ids.map((id) => {
                            const sel = made.boards.includes(id);
                            const known = !!MAT_BY_ID[id]?.board;
                            const code = known ? factoryCode(id) : '';
                            return (
                              <button
                                key={id}
                                type="button"
                                className={`mg-bchip ${sel ? 'on' : ''}`}
                                aria-pressed={sel}
                                disabled={!sel && fullBoards}
                                title={!sel && fullBoards ? t('每个房间最多 4 块板') : undefined}
                                onClick={() => write(row.room, (m) => (m.boards = toggle(m.boards, id)))}
                              >
                                <BoardSw id={id} v={v} />
                                <span>{known ? L(MAT_BY_ID[id]) : idLabel(id)}</span>
                                {code && <small>{code}</small>}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mg-hint">{t('这个案例还没填溪岸板材（在「这个家用了」里选）。')}</p>
                      )}
                    </>
                  )}
                  <p className="mg-sub">{t('一句说明（客人看得到）')}</p>
                  <Pair value={made.note} onChange={(nv) => write(row.room, (m) => (m.note = nv))} zhPh="例：岛台下面一整排抽屉，锅具全收进去" enPh="e.g. A full run of drawers under the island for every pot and pan" />
                  {!row.derived && (
                    <button type="button" className="mg-link mg-made-reset" data-sfx="back" onClick={() => reset(row.room)}>
                      <RotateCcw size={13} strokeWidth={2} aria-hidden="true" />
                      {t('恢复自动')}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Field>
  );
}

// ───────────────────────── 溪岸五大系列（docs/showcase/SERIES.md §4） ─────────────────────────

/**
 * 「溪岸系列」：这个家做的是五大系列的哪一个（骨骼线 · 空山 · 织 · 雾山 · 侘寂东方，品牌手册的顺序）+「未定」（null）。
 * 员工只看名字（没有编号）；选了以后下面一行是这个系列的总称（雾山没有）+ 一句话（照品牌手册），一眼认得出没选错。
 * 存的是 key（case.series）；旧案例 migrateCase 已经整理成 key 或 null，打开不会算「改过」。
 */
function SeriesField({ value, onChange }) {
  const key = seriesKeyOf(value);
  const s = SERIES_BY_KEY[key];
  return (
    <Field id="mg-f-series" label="溪岸系列" hint="这个家做的是溪岸哪一个系列。客人在卡片和详情里看到「溪岸 · 空山」这样的小标签；和客人最适合的系列一样的家会排前面。拿不准就先选「未定」。">
      <div className="chips mg-chips mg-series" data-sfx="radio" role="group" aria-label={t('溪岸系列')}>
        {SERIES.map((x) => (
          <button key={x.key} type="button" className={`chip ${key === x.key ? 'on' : ''}`} aria-pressed={key === x.key} onClick={() => onChange(x.key)}>
            {L(x)}
          </button>
        ))}
        <button type="button" className={`chip mg-series-none ${key ? '' : 'on'}`} aria-pressed={!key} onClick={() => onChange(null)}>
          {t('未定')}
        </button>
      </div>
      {s ? (
        <p className="mg-series-line">
          {s.family && <small>{L(s.family)}</small>}
          <span>{L(s.title)}</span>
        </p>
      ) : (
        <p className="mg-hint mg-series-line is-none">{t('还没定：客人那边不显示系列标签，也不会因为系列排前。')}</p>
      )}
    </Field>
  );
}

// 文件名 → 房间（和 scripts/import-cases.mjs 同一套的简版）
function guessRoom(name) {
  const s = String(name).toLowerCase();
  const W = [
    ['plan3d', ['鸟瞰', '轴测', '3d户型', '户型3d', '整个家', 'overview', 'aerial', 'dollhouse', 'whole home', 'whole-home']],
    ['master', ['主卧', 'master']],
    ['kids', ['儿童', 'kid']],
    ['study', ['书房', 'study', 'office']],
    ['bath', ['浴室', '厕所', 'bath', 'toilet']],
    ['kitchen', ['厨房', 'kitchen']],
    ['dining', ['餐厅', 'dining']],
    ['foyer', ['玄关', 'foyer', 'entry']],
    ['bedroom', ['卧室', 'bedroom', 'bed']],
    ['living', ['客厅', 'living']],
  ];
  for (const [room, ws] of W) if (ws.some((w) => s.includes(w))) return room;
  return null;
}

// ───────────────────────── 编辑器 ─────────────────────────

function Editor({ draft, patch, errors, dirty, pending, onSave, onDiscard, onDelete, onHide, onPreview, onClose, onMove, flash, isNew }) {
  const [busy, setBusy] = useState(null);
  const [pick, setPick] = useState(null); // 正在选材质的表面
  const [moreSlots, setMoreSlots] = useState(false);
  const chips = C.chipsFromStyle(draft.style);
  const guess = C.guessDreamers(draft.style, 3);
  const st = draft.style;
  const mats = draft.materials || {};
  const eff = C.caseMaterials(draft);
  const errOf = (f) => errors.filter((e) => e.field === f);
  const setChip = (id, v) =>
    patch((d) => {
      const next = { ...C.chipsFromStyle(d.style), [id]: v };
      const s = C.styleFromChips(next);
      // 只改这一条轴：其它轴保留员工原来的数字（种子是精确值）
      const ax = AXES.some((a) => a.id === id) ? 'axes' : 'hidden';
      d.style[ax][id] = s[ax][id];
    });
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const originLine = [t(KIND_LABEL[draft.kind]), isNew ? t('新的') : t('第 {0} 版', [draft.rev]), draft.origin === 'bundled' ? t('随网站发布') : draft.origin === 'override' ? t('这台设备改过') : t('只在这台设备')].join(' · ');
  const keySlots = C.KEY_SLOTS;
  const restSlots = SLOTS.map((s) => s.id).filter((s) => !keySlots.includes(s));
  return (
    <div className="mg-ed">
      <header className="mg-ed-head">
        <button type="button" className="mg-back only-narrow" data-sfx="back" onClick={onClose}>
          <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" />
          <span>{t('案例库')}</span>
        </button>
        <p className="mg-eyebrow">{isNew ? t('新增案例') : t('编辑案例')}</p>
        <h2>{L(draft.title) || t('未命名')}</h2>
        <small>{originLine}</small>
        {!isNew && (
          <div className="mg-order">
            <span>{t('排序')}</span>
            <button type="button" aria-label={t('往前')} onClick={() => onMove(-1)}>
              <ArrowUp size={15} strokeWidth={2} />
            </button>
            <button type="button" aria-label={t('往后')} onClick={() => onMove(1)}>
              <ArrowDown size={15} strokeWidth={2} />
            </button>
          </div>
        )}
      </header>

      <Photos draft={draft} patch={patch} pending={pending} onBusy={setBusy} flash={flash} busy={busy} />
      <Suspense fallback={null}>
        <SorterNote id={draft.id} />
      </Suspense>
      {errOf('images').map((e, i) => (
        <p key={i} className="mg-err">
          {t(e.zh)}
        </p>
      ))}

      <Field label="这是" id="mg-f-kind">
        <Seg
          value={draft.kind}
          options={[
            ['project', '我们做过的家'],
            ['concept', '3D 风格方案'],
          ]}
          onChange={(v) => patch((d) => (d.kind = v))}
          label={t('这是')}
        />
        {draft.kind === 'concept' && <p className="mg-hint">{t('客人看到的是「3D 示意 · 风格方案」，故事写「给谁」，不要写成真实业主的家。')}</p>}
      </Field>

      <Field label="标题" id="mg-f-title">
        <Pair value={draft.title} onChange={(v) => patch((d) => (d.title = v))} zhPh="例：Setia Eco 的绿意排屋" enPh="e.g. A green terrace in Setia Eco" />
        {errOf('title').map((e, i) => (
          <p key={i} className="mg-err">
            {t(e.zh)}
          </p>
        ))}
      </Field>
      <Field label="故事（120 字以内）" hint="写这个家为谁做、解决了什么。客人在详情里看到。">
        <Pair value={draft.story} multi onChange={(v) => patch((d) => (d.story = v))} />
      </Field>
      <Field label="地点 · 年份（选填）">
        <Pair value={draft.place} onChange={(v) => patch((d) => (d.place = v))} zhPh="例：Setia Alam · 2024" enPh="e.g. Setia Alam · 2024" />
      </Field>

      <Field label="房子" id="mg-f-property">
        <div className="chips mg-chips" data-sfx="radio">
          {C.PROPERTY_TYPES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip ${draft.property.type === p.id ? 'on' : ''}`}
              onClick={() =>
                patch((d) => {
                  d.property.type = p.id;
                  if (!d.template) d.template = TEMPLATE_FOR[p.id];
                })
              }
            >
              {t(p.zh)}
            </button>
          ))}
        </div>
        {errOf('property').map((e, i) => (
          <p key={i} className="mg-err">
            {t(e.zh)}
          </p>
        ))}
        <div className="mg-row">
          <label className="mg-num">
            <span>{t('大小')}</span>
            <input
              type="number"
              inputMode="numeric"
              min="200"
              max="20000"
              step="10"
              value={draft.property.sizeSqft ?? ''}
              placeholder="1,100"
              onChange={(e) => patch((d) => (d.property.sizeSqft = e.target.value === '' ? null : Math.max(0, +e.target.value)))}
            />
            <em>sq ft</em>
          </label>
          <Stepper label="卧室" value={draft.property.bedrooms} min={1} max={8} onChange={(v) => patch((d) => (d.property.bedrooms = v))} />
          <Stepper label="浴室" value={draft.property.bathrooms} min={1} max={8} onChange={(v) => patch((d) => (d.property.bathrooms = v))} />
          <Stepper label="几层" value={draft.property.storeys} min={1} max={4} onChange={(v) => patch((d) => (d.property.storeys = v))} />
        </div>
        <p className="mg-sub">{t('3D 户型模板')}</p>
        <div className="chips mg-chips" data-sfx="radio">
          {TEMPLATES.filter((x) => !x.hidden).map((tp) => (
            <button key={tp.id} type="button" className={`chip ${draft.template === tp.id ? 'on' : ''}`} onClick={() => patch((d) => (d.template = tp.id))}>
              {L(tp)}
            </button>
          ))}
        </div>
      </Field>

      <Field label="做了哪些地方" id="mg-f-rooms">
        <Seg
          value={draft.scope}
          options={[
            ['whole', '全屋'],
            ['rooms', '部分房间'],
          ]}
          onChange={(v) => patch((d) => (d.scope = v))}
          label={t('做了哪些地方')}
        />
        <div className="chips mg-chips" data-sfx="choice">
          {C.ROOMS.filter((r) => r.id !== 'plan3d').map((r) => (
            <button key={r.id} type="button" className={`chip ${draft.rooms.includes(r.id) ? 'on' : ''}`} aria-pressed={draft.rooms.includes(r.id)} onClick={() => patch((d) => (d.rooms = toggle(d.rooms, r.id)))}>
              {L(r)}
            </button>
          ))}
        </div>
        {errOf('rooms').map((e, i) => (
          <p key={i} className="mg-err">
            {t(e.zh)}
          </p>
        ))}
      </Field>
      <RoomsMade draft={draft} patch={patch} />

      <SeriesField value={draft.series} onChange={(k) => patch((d) => (d.series = k))} />

      <Field label="风格（点一点，不用填数字）">
        <div className="mg-axis">
          {[...AXES, ...HIDDEN_AXES].map((ax) => (
            <div key={ax.id} className="mg-axis-row">
              <span>{L(ax)}</span>
              <Seg
                value={chips[ax.id]}
                options={[
                  ['a', ax.a.zh],
                  ['mid', '中'],
                  ['b', ax.b.zh],
                ]}
                onChange={(v) => setChip(ax.id, v)}
                label={L(ax)}
              />
            </div>
          ))}
        </div>
        <div className="mg-guess">
          <span>
            {t('看起来最像：')}
            <b>{dreamerName(guess[0])}</b>
          </span>
          <span className="mg-guess-also">
            {t('也适合：')}
            {guess.slice(1).map((g) => (
              <button key={g} type="button" className="mg-link" disabled={st.dreamers.includes(g) || st.dreamers.length >= 3} onClick={() => patch((d) => (d.style.dreamers = [...d.style.dreamers, g].slice(0, 3)))}>
                {dreamerName(g)} ＋
              </button>
            ))}
          </span>
        </div>
        <p className="mg-sub">{t('这个案例的牌（第一张 = 主牌，最多三张）')}</p>
        <div className="mg-dreamers">
          {st.dreamers.map((code, i) => (
            <span key={code} className={`mg-dreamer ${i === 0 ? 'is-main' : ''}`}>
              <button type="button" disabled={i === 0} onClick={() => patch((d) => (d.style.dreamers = [code, ...d.style.dreamers.filter((x) => x !== code)]))} title={t('设为主牌')}>
                {i === 0 && <Star size={12} strokeWidth={2} fill="currentColor" aria-hidden="true" />}
                {dreamerName(code)}
              </button>
              <button type="button" className="mg-dreamer-x" aria-label={t('移除')} data-sfx="chipRemove" onClick={() => patch((d) => (d.style.dreamers = d.style.dreamers.filter((x) => x !== code)))}>
                <X size={12} strokeWidth={2.2} />
              </button>
            </span>
          ))}
          {!st.dreamers.length && (
            <button type="button" className="mg-link" onClick={() => patch((d) => (d.style.dreamers = [guess[0]]))}>
              {t('用「{0}」当主牌', [dreamerName(guess[0])])}
            </button>
          )}
        </div>
      </Field>

      <Field label="这个家特别做到了" hint="客人的三个愿望对得上时，卡片上会写出你填的那一句。">
        <div className="chips mg-chips" data-sfx="choice">
          {FLOW.WISHES.map((w) => (
            <button key={w.v} type="button" className={`chip ${st.wishes.includes(w.v) ? 'on' : ''}`} aria-pressed={st.wishes.includes(w.v)} onClick={() => patch((d) => (d.style.wishes = toggle(d.style.wishes, w.v)))}>
              {w.icon} {t(w.label)}
            </button>
          ))}
        </div>
        {st.wishes.map((w) => (
          <div key={w} className="mg-wishnote">
            <span>{t((FLOW.WISHES.find((x) => x.v === w) || {}).label || w)}</span>
            <Pair value={draft.wishNotes?.[w] || { zh: '', en: '' }} onChange={(v) => patch((d) => (d.wishNotes = { ...d.wishNotes, [w]: v }))} zhPh="例：整面顶天立地柜，杂物全收进去" enPh="e.g. A full wall of floor-to-ceiling storage" />
          </div>
        ))}
      </Field>

      <Field label="照片里看得见" hint="客人的雷区踩到这些，就不会给他看这个家。">
        <div className="chips mg-chips" data-sfx="choice">
          {C.FEATURES.map((f) => (
            <button key={f.id} type="button" className={`chip ${st.features.includes(f.id) ? 'on' : ''}`} aria-pressed={st.features.includes(f.id)} onClick={() => patch((d) => (d.style.features = toggle(d.style.features, f.id)))}>
              {t(f.zh)}
            </button>
          ))}
        </div>
      </Field>

      <Field label="这个家用了" hint="选最接近照片的材质；没选的用主牌的。3D 会照这些把案例放进客人的家。" id="mg-f-materials">
        <div className="mg-quick">
          <label>
            <span>{t('用梦想家的材质开始')}</span>
            <select
              value=""
              onChange={(e) => {
                const code = e.target.value;
                if (!code) return;
                sfx.play('apply');
                patch((d) => {
                  d.materials = { ...DREAMER_BY_CODE[code].materials };
                  if (!d.style.dreamers.length) d.style.dreamers = [code];
                });
              }}
            >
              <option value="">{t('选一张牌…')}</option>
              {DREAMERS.map((d) => (
                <option key={d.code} value={d.code}>
                  {dreamerName(d.code)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mg-mats-list">
          {[...keySlots, ...(moreSlots ? restSlots : [])].map((slot) => (
            <button key={slot} type="button" className={`mg-mat ${mats[slot] ? '' : 'is-inherit'}`} data-sfx="open" onClick={() => setPick(slot)}>
              <Swatch id={eff[slot]} size={36} />
              <span>
                <small>{L(SLOT_BY_ID[slot])}</small>
                <b>{eff[slot] ? L(MAT_BY_ID[eff[slot]]) : '—'}</b>
                {!mats[slot] && eff[slot] && <em>{t('主牌的')}</em>}
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="mg-link" aria-expanded={moreSlots} onClick={() => setMoreSlots((v) => !v)}>
          {moreSlots ? t('收起其它表面') : t('其它 {0} 个表面（软装、木作、五金…）', [restSlots.length])}
        </button>
        {errOf('materials').map((e, i) => (
          <p key={i} className="mg-err">
            {t(e.zh)}
          </p>
        ))}
        <Suspense fallback={null}>
          <BoardRows draft={draft} patch={patch} errors={errOf('boards')} />
        </Suspense>
      </Field>

      <Field label="情绪 · 时间">
        <div className="chips mg-chips" data-sfx="radio">
          {MOODS.map((m) => (
            <button key={m.id} type="button" className={`chip ${draft.mood === m.id ? 'on' : ''}`} onClick={() => patch((d) => (d.mood = m.id))}>
              {L(m)}
            </button>
          ))}
        </div>
        <label className="mg-range">
          <span>{t('3D 里的时间')}</span>
          <input type="range" min="6" max="23" step="0.25" value={draft.time ?? 14} style={{ '--p': `${(((draft.time ?? 14) - 6) / 17) * 100}%` }} onChange={(e) => patch((d) => (d.time = +e.target.value))} />
          <b>{fmtTime(draft.time ?? 14)}</b>
        </label>
      </Field>

      <Field label="家具款式" hint="3D 自动摆家具时照这个挑款式。">
        <div className="mg-furn">
          {FURNITURE.map((f) => (
            <div key={f.id} className="mg-furn-row">
              <span>{t(f.zh)}</span>
              <Seg value={draft.furniture?.[f.id] ?? f.opts[0][0]} options={f.opts} onChange={(v) => patch((d) => (d.furniture = { ...d.furniture, [f.id]: v }))} label={t(f.zh)} />
            </div>
          ))}
          <label className="mg-range">
            <span>{t('展示的比例')}</span>
            <input type="range" min="0" max="60" step="5" value={draft.furniture?.displayPct ?? 15} style={{ '--p': `${((draft.furniture?.displayPct ?? 15) / 60) * 100}%` }} onChange={(e) => patch((d) => (d.furniture = { ...d.furniture, displayPct: +e.target.value }))} />
            <b>{draft.furniture?.displayPct ?? 15}%</b>
          </label>
        </div>
      </Field>

      <Field label="我们做 · 家具 · 现场搭配" hint="金色 = 我们做（定制柜、台面、墙板、门）；台面跟着厨房橱柜、浴室柜一起算。家具只是示意（通用款，不是我们的产品）；现场搭配只是背景。">
        {[
          ['offer', '我们做', C.SUPPLY_OFFER],
          ['furniture', '家具（只是示意）', C.SUPPLY_FURNITURE],
        ].map(([g, title, list]) => (
          <div key={g} className={`mg-supply ${g === 'offer' ? 'is-firm' : 'is-furniture'}`}>
            <h5>{t(title)}</h5>
            <div className="chips mg-chips" data-sfx="choice">
              {list.map((s) => (
                <button key={s.id} type="button" className={`chip ${draft.supplies.firm.includes(s.id) ? 'on' : ''}`} aria-pressed={draft.supplies.firm.includes(s.id)} onClick={() => patch((d) => (d.supplies.firm = toggle(d.supplies.firm, s.id)))}>
                  {L(s)}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="mg-supply">
          <h5>{t('现场搭配')}</h5>
          <div className="chips mg-chips" data-sfx="choice">
            {C.SUPPLY.context.map((s) => (
              <button key={s.id} type="button" className={`chip ${draft.supplies.context.includes(s.id) ? 'on' : ''}`} aria-pressed={draft.supplies.context.includes(s.id)} onClick={() => patch((d) => (d.supplies.context = toggle(d.supplies.context, s.id)))}>
                {L(s)}
              </button>
            ))}
          </div>
        </div>
      </Field>

      <Field label="产品（选填）" hint="公司的目录还没有：先空着也可以。">
        {(draft.products || []).map((p, i) => (
          <div key={i} className="mg-product">
            <Seg
              value={p.kind}
              options={[
                ['cabinet', '柜子'],
                ['furniture', '家具'],
              ]}
              onChange={(v) => patch((d) => (d.products[i].kind = v))}
              label={t('产品')}
            />
            <Pair value={p.name} onChange={(v) => patch((d) => (d.products[i].name = v))} zhPh="例：岛台 + 吧台椅" enPh="e.g. Island with bar stools" />
            <button type="button" className="mg-link is-danger" data-sfx="chipRemove" onClick={() => patch((d) => d.products.splice(i, 1))}>
              {t('移除')}
            </button>
          </div>
        ))}
        <button type="button" className="mg-link" data-sfx="chipAdd" onClick={() => patch((d) => (d.products = [...(d.products || []), { id: `pr${Date.now().toString(36)}`, name: { zh: '', en: '' }, kind: 'cabinet', note: { zh: '', en: '' } }]))}>
          <Plus size={14} strokeWidth={2} aria-hidden="true" /> {t('加一个产品')}
        </button>
      </Field>

      {draft.kind === 'project' && (
        <label className={`mg-consent ${errOf('consent').length ? 'is-err' : ''}`} id="mg-f-consent">
          <input type="checkbox" checked={!!draft.consent} onChange={(e) => patch((d) => (d.consent = e.target.checked))} />
          <i aria-hidden="true">
            <Check size={13} strokeWidth={2.6} />
          </i>
          <span>
            <b>{t('业主同意展示这些照片')}</b>
            <small>{t('没有勾，这个家只能存草稿，客人看不到。')}</small>
          </span>
        </label>
      )}

      {errors.length > 0 && (
        <div className="mg-errors" role="alert">
          <b>{t('还差一点才能上架：')}</b>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{t(e.zh)}</li>
            ))}
          </ul>
        </div>
      )}

      <footer className="mg-acts">
        {busy && <p className="mg-busy">{busy}</p>}
        <div className="mg-acts-main">
          <button type="button" className="btn-primary small mg-save" data-sfx="confirm" disabled={!!busy} onClick={() => onSave('live')}>
            {t('保存并上架')}
          </button>
          <button type="button" className="btn-line small" disabled={!!busy} onClick={() => onSave('draft')}>
            {t('存草稿')}
          </button>
          {dirty && (
            <button type="button" className="mg-link" data-sfx="back" onClick={onDiscard}>
              {t('放弃改动')}
            </button>
          )}
        </div>
        {/* 存 / 放弃一行；看看 / 藏起来 / 删除是下面一行字（编辑器只有 460 px 宽：英文三个按钮放不下一行，字不缩短） */}
        <div className="mg-acts-sub">
          <button type="button" className="mg-link mg-prev-btn" data-sfx="open" onClick={onPreview}>
            <Eye size={14} aria-hidden="true" />
            {t('用示范客人看看')}
          </button>
          {!isNew && (
            <button type="button" className="mg-link" onClick={onHide}>
              {draft.status === 'hidden' ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
              {draft.status === 'hidden' ? t('取消隐藏') : t('先藏起来')}
            </button>
          )}
          {!isNew && (
            <button type="button" className="mg-link is-danger" data-sfx="chipRemove" onClick={onDelete}>
              <Trash2 size={14} aria-hidden="true" />
              {draft.origin === 'bundled' || draft.origin === 'override' ? t('从这台设备移除') : t('删除')}
            </button>
          )}
        </div>
      </footer>
      {pick && (
        <MatPicker
          slot={pick}
          value={mats[pick]}
          onClose={() => setPick(null)}
          onPick={(id) => {
            patch((d) => {
              if (id) d.materials = { ...d.materials, [pick]: id };
              else {
                const { [pick]: _, ...rest } = d.materials;
                d.materials = rest;
              }
            });
            setPick(null);
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────── 预览：示范客人会看到什么 ─────────────────────────

const PART_LABEL = { style: '风格', hidden: '明暗线条', card: '牌', wish: '愿望', prop: '房子', size: '大小', scope: '房间', pick: '选的图', real: '真实项目', series: '系列', swap: '要换' };
const PART_HINT = { hidden: '明暗 · 线条 · 社交', series: '这个家的溪岸系列 = 客人最适合的（第二适合的加得少一点）', swap: '踩到雷区的表面，3D 里会帮客人换掉（每个表面扣一点）' };

function GuestCard({ m }) {
  const c = m.case;
  const r = useResolved(c, { coverOnly: true, thumbsOnly: true });
  const cover = C.coverOf(r || c);
  const src = cover ? C.imageURL(r || c, cover, 480) : '';
  return (
    <article className="mg-gcard">
      <span className="mg-gcard-img">
        {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <i />}
        {c.kind === 'concept' && <em>{t('3D 示意 · 风格方案')}</em>}
      </span>
      <div>
        <b>{L(c.title)}</b>
        <small>{C.placeLine(c)}</small>
        <span className="mg-dots" aria-hidden="true">
          {C.casePalette(c)
            .slice(0, 4)
            .map((x) => (
              <i key={x.slot} style={{ background: x.color }} />
            ))}
        </span>
        {m.reasons[0] && <p className="mg-why">{C.reasonText(m.reasons[0])}</p>}
      </div>
    </article>
  );
}

function Preview({ list, draft, onClose }) {
  const archive = useMemo(() => {
    try {
      return loadArchive().slice(0, 6);
    } catch {
      return [];
    }
  }, []);
  const people = useMemo(() => [...SAMPLES.map((s) => ({ key: s.id, label: s.name, profile: sampleProfile(s), sample: true })), ...archive.map((p) => ({ key: p.id, label: p.name || t('贵宾'), profile: p }))], [archive]);
  const [who, setWho] = useState(people[0].key);
  const person = people.find((p) => p.key === who) || people[0];
  // 「上架以后」的样子：正在编辑的这个当作已上架（客人永远看不到草稿）；其它草稿 / 隐藏的不算
  const cases = useMemo(() => {
    const others = list.filter((c) => c.id !== draft?.id);
    return draft ? [{ ...draft, status: 'live', consent: true }, ...others] : others;
  }, [list, draft]);
  const res = useMemo(() => C.matchCases(person.profile, cases, { limit: 4 }), [person, cases]);
  const p = person.profile;
  const d = DREAMER_BY_CODE[p.code];
  const rows = [...res.picks.map((m, i) => ({ m, rank: i + 1 })), ...res.rest.map((m) => ({ m, rank: null }))];
  const sum = (parts, kind) => parts.filter((x) => x.kind === kind).reduce((s, x) => s + x.v, 0);
  // 这位客人整列都是 0 的分项不显示（表格才放得下）
  const cols = Object.keys(PART_LABEL).filter((k) => rows.some(({ m }) => sum(m.parts, k)));
  return (
    <div className="mg-veil is-full" onPointerDown={(e) => e.target === e.currentTarget && (sfx.play('close'), onClose())}>
      <div className="mg-sheet mg-prev" role="dialog" aria-modal="true" aria-labelledby="mg-prev-t">
        <header>
          <div>
            <p className="mg-eyebrow">{t('只有员工看得到')}</p>
            <b id="mg-prev-t">{t('用示范客人看看')}</b>
          </div>
          <button type="button" className="mg-x" aria-label={t('关闭')} data-sfx="close" onClick={onClose}>
            <X size={18} strokeWidth={1.8} />
          </button>
        </header>
        <div className="chips mg-chips mg-people" data-sfx="radio">
          {people.map((x) => (
            <button key={x.key} type="button" className={`chip ${x.key === who ? 'on' : ''}`} onClick={() => setWho(x.key)}>
              {x.label}
              {x.sample ? '' : ` · ${x.profile.code || ''}`}
            </button>
          ))}
        </div>
        <p className="mg-prev-who">
          {[d ? dreamerName(p.code) : p.code, p.home?.type ? C.placeLine({ property: { type: p.home.type, bedrooms: p.home.bedrooms, sizeSqft: p.home.sizeSqft } }) : t('还没答「你的家」'), (p.avoid || []).length ? t('雷区：{0}', [(p.avoid || []).map(C.noGoLabel).filter(Boolean).join(listSep())]) : '']
            .filter(Boolean)
            .join(' · ')}
        </p>
        {draft && <p className="mg-hint">{t('正在编辑的「{0}」按上架以后的样子算。', [L(draft.title) || t('未命名')])}</p>}
        <div className="mg-prev-body">
          <section className="mg-prev-guest" aria-label={t('客人看到的')}>
            <h5>{t('客人看到的')}</h5>
            <Boundary fallback={<FallbackGuest res={res} />}>
              {GuestCasesStep ? (
                <Suspense fallback={<FallbackGuest res={res} />}>
                  <div className="mg-guest-frame">
                    <GuestCasesStep profile={p} cases={cases} preview onDone={() => {}} />
                  </div>
                </Suspense>
              ) : (
                <FallbackGuest res={res} />
              )}
            </Boundary>
          </section>
          <section className="mg-prev-score" aria-label={t('分数明细')}>
            <h5>{t('分数明细（客人看不到）')}</h5>
            <div className="mg-table-wrap">
              <table className="mg-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('案例')}</th>
                    <th>{t('总分')}</th>
                    {cols.map((k) => (
                      <th key={k} title={PART_HINT[k] ? t(PART_HINT[k]) : undefined}>
                        {t(PART_LABEL[k])}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ m, rank }) => (
                    <tr key={m.case.id} className={`${rank ? 'is-pick' : ''} ${m.case.id === draft?.id ? 'is-me' : ''}`}>
                      <td>{rank || '·'}</td>
                      <th scope="row">{L(m.case.title)}</th>
                      <td>
                        <b>{m.score.toFixed(2)}</b>
                      </td>
                      {cols.map((k) => {
                        const v = sum(m.parts, k);
                        return <td key={k}>{v ? v.toFixed(2) : ''}</td>;
                      })}
                    </tr>
                  ))}
                  {res.excluded.map((e) => {
                    const c = cases.find((x) => x.id === e.id);
                    return (
                      <tr key={e.id} className={`is-out ${e.id === draft?.id ? 'is-me' : ''}`}>
                        <td>✕</td>
                        <th scope="row">{L(c?.title) || e.id}</th>
                        <td colSpan={cols.length + 1}>{t('避开：{0}', [e.tags.map(C.noGoLabel).filter(Boolean).join(listSep())])}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mg-hint">{t('前四名之后用「多样」挑：和已经选上的太像的会往后排。')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function FallbackGuest({ res }) {
  if (!res.picks.length) return <p className="mg-empty">{t('没有配得上的家（全部被雷区避开了）。')}</p>;
  return (
    <div className="mg-guest">
      {res.picks.map((m) => (
        <GuestCard key={m.case.id} m={m} />
      ))}
      {res.excluded.length > 0 && <p className="mg-hint">{t('已经帮你避开用了「{0}」的家', [[...new Set(res.excluded.flatMap((e) => e.tags))].map(C.noGoLabel).filter(Boolean).join(listSep())])}</p>}
    </div>
  );
}

// ───────────────────────── 员工的门 ─────────────────────────

function Gate({ onOpen }) {
  const { p, bind } = useHold(() => {
    sfx.play('open');
    onOpen();
  });
  return (
    <div className="mg-gate">
      <button type="button" className={`mg-gate-btn ${p > 0 ? 'is-holding' : ''}`} data-sfx="tap" data-fx-ripple="off" {...bind}>
        <span className="mg-gate-lock" aria-hidden="true">
          <svg className="mg-gate-ring" viewBox="0 0 40 40">
            <circle className="mg-gate-track" cx="20" cy="20" r="18.5" />
            <circle className="mg-gate-fill" cx="20" cy="20" r="18.5" pathLength="100" style={{ strokeDashoffset: 100 - p * 100 }} />
          </svg>
          <LockKeyhole size={20} strokeWidth={1.8} />
        </span>
        <b>{t('员工 · 案例库')}</b>
        <span>{t('按住 3 秒打开')}</span>
      </button>
      <a className="mg-gate-home" href="index.html">
        {t('回到入口')}
      </a>
    </div>
  );
}

// ───────────────────────── 整页 ─────────────────────────

const FILTERS = [
  ['all', '全部', () => true],
  ['ours', '我们的', (c) => c.kind === 'project'],
  ['seed', '种子', (c) => c.kind === 'concept'],
  ['draft', '草稿', (c) => c.status === 'draft'],
  ['hidden', '隐藏', (c) => c.status === 'hidden'],
];

export default function CaseManager() {
  const staff = useMemo(() => new URLSearchParams(location.search).get('staff') === '1', []);
  const [open, setOpen] = useState(staff);
  const [all, setAll] = useState(null);
  const [filter, setFilter] = useState('all');
  const [draft, setDraft] = useState(null);
  const [base, setBase] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [errors, setErrors] = useState([]);
  const [preview, setPreview] = useState(false);
  const [toast, setToast] = useState(null);
  const [dragId, setDragId] = useState(null);
  const pending = useRef({ adds: [], drops: [] });
  const importInput = useRef(null);
  const listRef = useRef(null);
  const edRef = useRef(null);
  const [askCard, ask] = useAsk();

  const reload = async () => {
    const l = await C.listCases({ includeDrafts: true, includeHidden: true });
    setAll(l);
    return l;
  };
  useEffect(() => {
    if (open) reload();
  }, [open]);
  useEffect(() => {
    document.title = `${t('案例库')} · WISH`;
  }, []);

  const flash = (msg, kind = 'ok') => {
    setToast({ msg, kind, k: Date.now() });
    if (kind === 'error') sfx.play('error');
  };
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);
  /** 存不进去（空间满了 / 别的问题）：改动都还在编辑器里，说一声就好 */
  const saveFailed = (e) => {
    console.warn('[cases]', e);
    flash(saveFailText(e), 'error');
  };

  const dirty = !!draft && JSON.stringify(draft) !== base;
  const patch = (fn) =>
    setDraft((d) => {
      const n = clone(d);
      fn(n);
      return n;
    });

  const dropPendingAdds = async () => {
    const id = draft?.id;
    for (const img of pending.current.adds) if (id) await C.dropImage(id, img);
    pending.current = { adds: [], drops: [] };
  };

  const confirmLeave = async () => {
    if (!dirty) return true;
    const yes = await ask({ title: t('还没存，要放弃改动吗？'), body: t('这个案例刚才的改动会不见。'), ok: t('放弃改动'), danger: true });
    if (yes) await dropPendingAdds();
    return yes;
  };

  const openCase = async (c) => {
    if (draft?.id === c.id) return;
    if (!(await confirmLeave())) return;
    pending.current = { adds: [], drops: [] };
    const d = clone(c);
    setDraft(d);
    setBase(JSON.stringify(d));
    setIsNew(false);
    setErrors([]);
    requestAnimationFrame(() => edRef.current?.scrollTo?.({ top: 0 }));
  };

  const newCase = async () => {
    if (!(await confirmLeave())) return;
    pending.current = { adds: [], drops: [] };
    const d = { ...C.newCase('project'), origin: 'device' };
    setDraft(d);
    setBase(JSON.stringify(d));
    setIsNew(true);
    setErrors([]);
  };

  const close = async () => {
    if (!(await confirmLeave())) return;
    setDraft(null);
    setErrors([]);
  };

  const save = async (status) => {
    const next = { ...draft, status };
    const v = C.validateCase(next, { forLive: status === 'live' });
    if (!v.ok) {
      setErrors(v.errors);
      sfx.play('error');
      const first = v.errors[0]?.field;
      const el = document.getElementById(`mg-f-${first}`) || edRef.current?.querySelector('.mg-errors');
      el?.scrollIntoView?.({ behavior: fx.motion.reduced ? 'auto' : 'smooth', block: 'center' });
      return;
    }
    // 一半以上的照片还没标房间：提醒一下（不挡上架）
    const warn = status === 'live' ? C.caseWarnings(next).find((w) => w.field === 'images') : null;
    if (warn) {
      const yes = await ask({
        title: t('还有照片没标房间'),
        body: t('{0} / {1} 张照片还没标房间：客人看到的照片不会写房间名字，3D 里「对照片」也配不上房间。', warn.vars),
        ok: t('还是上架'),
        cancel: t('先去标房间'),
        warn: true,
      });
      if (!yes) {
        document.getElementById('mg-f-photos')?.scrollIntoView?.({ behavior: fx.motion.reduced ? 'auto' : 'smooth', block: 'center' });
        return;
      }
    }
    let saved;
    try {
      saved = await commitCase(next, pending);
    } catch (e) {
      saveFailed(e);
      return;
    }
    const l = await reload();
    const now = l.find((c) => c.id === saved.id) || saved;
    setDraft(clone(now));
    setBase(JSON.stringify(clone(now)));
    setIsNew(false);
    setErrors([]);
    flash(status === 'live' ? t('已上架：客人现在可以配到这个家') : t('已存成草稿（客人看不到）'));
    const head = edRef.current?.querySelector('.mg-ed-head');
    if (head) fx.scan(head, { sound: false });
  };

  const discard = async () => {
    await dropPendingAdds();
    setDraft(JSON.parse(base));
    setErrors([]);
  };

  const remove = async () => {
    const bundled = draft.origin === 'bundled' || draft.origin === 'override';
    const yes = await ask({
      title: bundled ? t('从这台设备移除「{0}」？', [L(draft.title)]) : t('删除「{0}」？', [L(draft.title) || t('未命名')]),
      body: bundled ? t('它是随网站发布的案例：这台设备上会隐藏起来，随时可以在「隐藏」里取消。') : t('连照片一起删掉，找不回来（导出过的案例包里还有）。'),
      ok: bundled ? t('移除') : t('删除'),
      danger: true,
    });
    if (!yes) return;
    const id = draft.id;
    await dropPendingAdds();
    const tile = listRef.current?.querySelector(`[data-id="${CSS.escape(id)}"]`);
    setDraft(null);
    await C.deleteCase(id);
    const commit = () => reload();
    if (tile?.isConnected) fx.dissolve(tile, { origin: 'right', duration: 520, delay: 40, tone: 'paper' }).then(commit);
    else commit();
    flash(bundled ? t('已在这台设备上隐藏') : t('已删除'));
  };

  const hideToggle = async () => {
    // 取消隐藏：种子回到上架；我们的案例先回到草稿（上架要再检查一次）。改到一半的内容一起存下来
    const st = draft.status === 'hidden' ? (draft.kind === 'concept' ? 'live' : 'draft') : 'hidden';
    let saved;
    try {
      saved = await commitCase({ ...draft, status: st }, pending);
    } catch (e) {
      saveFailed(e);
      return;
    }
    const l = await reload();
    const now = l.find((c) => c.id === draft.id) || saved;
    setDraft(clone(now));
    setBase(JSON.stringify(clone(now)));
    flash(st === 'hidden' ? t('已隐藏（客人看不到）') : t('已取消隐藏'));
  };

  const ordered = all || [];
  const commitOrder = async (ids) => {
    await C.setOrder(ids);
    await reload();
  };
  const move = async (delta) => {
    const ids = ordered.map((c) => c.id);
    const i = ids.indexOf(draft.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const els = [...(listRef.current?.querySelectorAll('.mg-tile') || [])];
    sfx.play('drop');
    fx.layout(els, () => flushSync(() => setAll(ids.map((id) => ordered.find((c) => c.id === id)))));
    await C.setOrder(ids);
  };

  // 拖动排序：按住把手 → 一张「影子卡」跟着手指；经过别的卡就换位置（弹簧动画）；放手存起来
  const onGrip = (e, c) => {
    if (e.type === 'keydown') {
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        const ids = ordered.map((x) => x.id);
        const i = ids.indexOf(c.id);
        const j = i + (e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1);
        if (j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        sfx.play('drop');
        setAll(ids.map((id) => ordered.find((x) => x.id === id)));
        C.setOrder(ids);
        requestAnimationFrame(() => listRef.current?.querySelector(`[data-id="${CSS.escape(c.id)}"] .mg-grip`)?.focus());
      }
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    const tile = e.currentTarget.closest('.mg-tile');
    const rect = tile.getBoundingClientRect();
    const ghost = tile.cloneNode(true);
    ghost.classList.add('mg-ghost');
    Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, left: `${rect.left}px`, top: `${rect.top}px` });
    document.body.appendChild(ghost);
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    let ids = ordered.map((x) => x.id);
    setDragId(c.id);
    let raf = 0;
    let last = null;
    const onMove = (ev) => {
      ghost.style.left = `${ev.clientX - dx}px`;
      ghost.style.top = `${ev.clientY - dy}px`;
      last = ev;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        ghost.style.pointerEvents = 'none';
        const under = document.elementFromPoint(last.clientX, last.clientY)?.closest?.('.mg-tile');
        const overId = under?.dataset?.id;
        if (!overId || overId === c.id) return;
        const r2 = under.getBoundingClientRect();
        const after = last.clientX > r2.left + r2.width / 2;
        const next = ids.filter((x) => x !== c.id);
        const k = next.indexOf(overId) + (after ? 1 : 0);
        next.splice(k, 0, c.id);
        if (next.join() === ids.join()) return;
        ids = next;
        const els = [...(listRef.current?.querySelectorAll('.mg-tile') || [])];
        sfx.play('tick');
        fx.layout(els, () => flushSync(() => setAll(ids.map((id) => ordered.find((x) => x.id === id)))));
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      cancelAnimationFrame(raf);
      ghost.remove();
      setDragId(null);
      sfx.play('drop');
      commitOrder(ids);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const doExport = async () => {
    const blob = await C.exportPack();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = C.packFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    flash(t('已导出 {0}', [C.packFileName()]));
  };
  const doImport = async (file) => {
    if (!file) return;
    let r;
    try {
      r = await C.importPack(file);
    } catch (e) {
      // 写到一半存不进去（多半是空间满了）：已经导进来的照样列出来
      console.warn('[cases]', e);
      await reload();
      flash(C.isQuotaError(e) ? t('这台设备的空间不够了：案例包没有全部导进来') : t('案例包没有全部导进来，再试一次'), 'error');
      return;
    }
    await reload();
    if (r.errors.length && !r.added && !r.updated) flash(t(r.errors[0].zh), 'error');
    else flash(t('新增 {0} · 更新 {1} · 跳过 {2}', [r.added, r.updated, r.skipped]));
  };

  if (!open) return <Gate onOpen={() => setOpen(true)} />;

  const counts = Object.fromEntries(FILTERS.map(([id, , f]) => [id, (all || []).filter(f).length]));
  const shown = (all || []).filter(FILTERS.find((f) => f[0] === filter)[2]);
  return (
    <div className={`mg ${draft ? 'is-editing' : ''}`}>
      <section className="mg-list" aria-label={t('案例库')}>
        <header className="mg-top">
          <a className="mg-home" href="index.html" data-sfx="back" aria-label={t('回到入口')}>
            <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" />
          </a>
          <h1>
            {t('案例库')}
            <small>{t('员工')}</small>
          </h1>
          <span className="mg-sp" />
          <LangToggle compact />
        </header>
        <div className="mg-tools">
          <button type="button" className="btn-line small mg-sec" data-sfx="open" aria-label={t('导入案例包')} title={t('导入案例包')} onClick={() => importInput.current?.click()}>
            <Upload size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{t('导入案例包')}</span>
          </button>
          <button type="button" className="btn-line small mg-sec" aria-label={t('导出')} title={t('导出')} onClick={doExport}>
            <Download size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{t('导出')}</span>
          </button>
          {/* 溪岸板材（boards importer）：板材库 + 办公室电脑导入「板材贴图」文件夹 + 店里 iPad 导入板材包 */}
          <a className="btn-line small mg-sec mg-boards" href={`cases.html?staff=1&boards=1${isEn() ? '&lang=en' : ''}`} data-sfx="open" aria-label={t('板材 · Boards')} title={t('溪岸板材：导入老板电脑上的板材贴图，客人在 3D 里看到真的板')}>
            <Layers size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{t('板材 · Boards')}</span>
          </a>
          {/* 案例整理（SORTER）：把一整个照片文件夹（几千张）分项目、去重、挑封面，存成草稿案例 */}
          <a className="btn-line small mg-sec" href="cases.html?staff=1&sorter=1" data-sfx="open" aria-label={t('整理照片文件夹')} title={t('整理照片文件夹')}>
            <FolderTree size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{t('整理照片文件夹')}</span>
          </a>
          <button type="button" className="btn-primary small mg-new" data-sfx="open" onClick={newCase}>
            <Plus size={17} strokeWidth={2} aria-hidden="true" />
            <span>{t('新增案例')}</span>
          </button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              doImport(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        <div className="chips mg-filters" data-sfx="radio" role="tablist" aria-label={t('筛选')}>
          {FILTERS.map(([id, zh]) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} className={`chip ${filter === id ? 'on' : ''}`} onClick={() => setFilter(id)}>
              {t(zh)} <b>{counts[id] ?? 0}</b>
            </button>
          ))}
        </div>
        {all == null ? (
          <p className="mg-empty">{t('正在读案例库…')}</p>
        ) : shown.length === 0 ? (
          <p className="mg-empty">{filter === 'ours' ? t('还没有我们做过的家：用「新增案例」或「导入案例包」加进来。') : t('这里还没有案例。')}</p>
        ) : (
          <ul className="mg-grid" ref={listRef}>
            {shown.map((c, i) => (
              <Tile key={c.id} c={c} i={i} sel={draft?.id === c.id} dragging={dragId === c.id} onOpen={openCase} onGrip={onGrip} />
            ))}
          </ul>
        )}
        <p className="mg-foot">{t('排在前面的先推荐给客人（同分的时候）。照片很多也没关系：列表只读小图。')}</p>
      </section>
      <aside className="mg-edit" ref={edRef} aria-label={t('编辑案例')}>
        {draft ? (
          <Editor
            key={draft.id}
            draft={draft}
            patch={patch}
            errors={errors}
            dirty={dirty}
            pending={pending}
            isNew={isNew}
            onSave={save}
            onDiscard={discard}
            onDelete={remove}
            onHide={hideToggle}
            onPreview={() => setPreview(true)}
            onClose={close}
            onMove={move}
            flash={flash}
          />
        ) : (
          <div className="mg-ed-empty">
            <Sparkles size={26} strokeWidth={1.5} aria-hidden="true" />
            <p>{t('点一个案例来编辑，或者「新增案例」。')}</p>
            <button type="button" className="btn-line small" data-sfx="open" onClick={() => setPreview(true)}>
              <Eye size={16} strokeWidth={1.8} aria-hidden="true" />
              {t('用示范客人看看')}
            </button>
          </div>
        )}
      </aside>
      {preview && all && <Preview list={all.filter((c) => c.status !== 'hidden' && c.status !== 'draft')} draft={draft} onClose={() => setPreview(false)} />}
      {toast && (
        <div key={toast.k} className={`mg-toast ${toast.kind === 'error' ? 'is-error' : ''}`} role="status">
          {toast.msg}
        </div>
      )}
      {askCard}
    </div>
  );
}
