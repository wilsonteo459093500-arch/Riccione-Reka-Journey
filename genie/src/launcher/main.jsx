// 入口页（员工用）：
//   · 客户许愿模式 —— 大按钮。就在这一页里打开（同一个 Zen 实例）：声音必须在「按下按钮」的这一下开启，
//     所以欢迎画面出现时就已经有音乐；客人在欢迎画面选「中文开始 / Begin in English」。
//     许愿模式开着的时候这一页被重新载入（下拉刷新、Safari 把分页收掉再打开）：回到许愿模式的开场，不会露出这一页。
//   · 两个分开的功能：许愿之旅（客人自己的手机 / 分享链接；展厅 iPad 用许愿模式）/ 3D 梦想工作室（设计师、销售用）。
//     许愿之旅用 location.replace 打开：客人在里面按「返回」，回不到这一页。3D 工作室带 ?staff=1（设计师版、方案列表）。
//   · 本机的梦想家蓝图：收在「员工 · 本机蓝图」里，锁着 —— 和许愿模式的员工区一样要按住 3 秒才打开；
//     离开这一页、切去别的 app、锁屏、按「返回」回来，都会自己锁上。每一行用 ?staff=1 打开（才有设计师版）。
//   · 员工 · 案例库：和本机蓝图一样锁着（按住 3 秒），打开后才看得到「打开案例库」（cases.html?staff=1，员工给案例打标签、排序、上架）；
//     离开这一页就锁上。案例库那一页是单独打包的，这里只在开好以后才去数一下有几个案例（不拖慢入口页）。
//   · 声音（src/shared/sfx.js）：每个按钮都有自己的声音（确认 / 下一步 / 打开 / 移除 …，WISH_RULES 认 class）。
//   · 动效（src/shared/fx.js，克制）：按下去缩一点 + 指尖一圈光（大卡片缩得更少）；唯一的金色「开始」每隔几秒被光轻轻扫过；
//     按「客户许愿模式」= 一道晨光扫过整页，光盖住的那一刻换成许愿模式的开场；删掉的蓝图化成金尘，其余几行顺势补上。
//   · 删除 / 清空前问一句：页面里的一张小卡片（不是系统的 confirm() —— 那个没有声音、在 iPad 上是灰色的系统框）：
//     「删除」= 金色（确认的声音）、「取消」= 返回的声音、点卡片外面 = 收起的声音；卡片收起以后那一行才化成金尘。

import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ArrowRight, ChevronDown, Cuboid, Footprints, Images, LockKeyhole, LockKeyholeOpen, Tablet, Trash2 } from 'lucide-react';
import '../shared/base.css';
import './launcher.css';
import Pangie, { Lamp } from '../shared/Pangie.jsx';
import LangToggle from '../shared/LangToggle.jsx';
import { BRAND, CONFIG } from '../shared/config.js';
import { t, tj, L, isEn, guideName, useLang } from '../shared/i18n.js';
import WishMode from '../wish/WishMode.jsx';
import { startWish, savedHost, saveHost } from '../wish/start.js';
import { useHold } from '../wish/useHold.js';
import { loadArchive, removeFromArchive, clearArchive } from '../shared/profile.js';
import { sweepKept, clearStaffNotes, dropStaffNote } from '../shared/keep.js';
import { DREAMER_BY_CODE } from '../shared/dreamers.js';
import { installSfx, sfx } from '../shared/sfx.js';
import fx, { useGleam } from '../shared/fx.js';

// 这个分页正在客户许愿模式里（sessionStorage：关掉分页就没了）
const WISH_ON = 'genie.wish.on';
const wishOn = () => {
  try {
    return sessionStorage.getItem(WISH_ON) === '1';
  } catch {
    return false;
  }
};
const markWish = (on) => {
  try {
    if (on) sessionStorage.setItem(WISH_ON, '1');
    else sessionStorage.removeItem(WISH_ON);
  } catch {
    /* ignore */
  }
};

// 中文模式：英文做装饰小字；英文模式：中文做那一行小字（像精品店的双语名牌）
const pair = (zh, en) => (isEn() ? { main: t(zh), alt: zh, altLang: 'zh-Hans' } : { main: zh, alt: en, altLang: 'en' });

function when(iso) {
  try {
    return new Date(iso).toLocaleString(isEn() ? 'en-GB' : 'zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function ArchiveRow({ p, i = 0, onRemove }) {
  const d = DREAMER_BY_CODE[p.code];
  const swatch = d?.palette?.length ? `linear-gradient(90deg, ${d.palette.map((c, i, a) => `${c} ${(i / a.length) * 100}% ${((i + 1) / a.length) * 100}%`).join(', ')})` : 'none';
  return (
    <li className="ln-row fx-blur-in" style={{ '--fx-i': Math.min(i, 8), '--fx-step': '45ms', '--fx-dur': '520ms', '--fx-delay': '80ms' }}>
      <span className="ln-mini" style={{ '--sw': swatch }} aria-hidden="true">
        {d?.num}
      </span>
      <div className="ln-row-main">
        <b>{p.name || t('贵宾')}</b>
        <span>{[d ? L({ zh: d.zh, en: d.en }) : '', p.code, when(p.createdAt)].filter(Boolean).join(' · ')}</span>
      </div>
      <a className="ln-btn" href={`quiz.html?staff=1#id=${encodeURIComponent(p.id)}`}>
        {t('蓝图')}
      </a>
      <button type="button" className="ln-del" aria-label={t('删除')} title={t('删除')} onClick={(e) => onRemove(p, e.currentTarget.closest('li'))}>
        <Trash2 size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </li>
  );
}

const ASK_OUT_MS = 180; // 卡片收起（动效 SPEC：180 ms ease-in）

/**
 * 删除前问一句的小卡片（代替 confirm()）。按钮的声音照 WISH_RULES 的按钮等级：.btn-gold = 确认、.btn-ghost = 返回；
 * 点卡片外面 / Esc = 取消（收起的声音）。焦点先放在「取消」上（删除是不能反悔的那一个），Tab 只在两个按钮之间转。
 */
function AskCard({ title, body, ok, onDone }) {
  const [out, setOut] = useState(false);
  const closing = useRef(false);
  const cancelBtn = useRef(null);
  const okBtn = useRef(null);
  const fin = useRef(onDone);
  fin.current = onDone;

  const finish = (v) => {
    if (closing.current) return;
    closing.current = true;
    setOut(true);
    setTimeout(() => fin.current(v), fx.motion.reduced ? 0 : ASK_OUT_MS);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    const before = document.activeElement;
    cancelBtn.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        sfx.play('back');
        finishRef.current(false);
      } else if (e.key === 'Tab') {
        // 焦点只在这两个按钮之间
        e.preventDefault();
        (document.activeElement === cancelBtn.current ? okBtn.current : cancelBtn.current)?.focus();
      }
    };
    const onVis = () => document.visibilityState === 'hidden' && finishRef.current(false); // 切走 / 锁屏：当作取消（本机蓝图也会自己锁上）
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('visibilitychange', onVis);
      if (before?.isConnected) before.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className={`ln-ask-veil ${out ? 'is-out' : ''}`}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        sfx.play('close'); // 点卡片外面收起：和面板的暗色背景一样有一声
        finish(false);
      }}
    >
      <div className="ln-ask" role="alertdialog" aria-modal="true" aria-labelledby="ln-ask-title" aria-describedby={body ? 'ln-ask-body' : undefined}>
        <span className="ln-ask-ico" aria-hidden="true">
          <Trash2 size={22} strokeWidth={1.8} />
        </span>
        <h2 id="ln-ask-title">{title}</h2>
        {body && <p id="ln-ask-body">{body}</p>}
        <div className="ln-ask-acts">
          <button ref={cancelBtn} type="button" className="btn-ghost" onClick={() => finish(false)}>
            {t('取消')}
          </button>
          <button ref={okBtn} type="button" className="btn-gold" onClick={() => finish(true)}>
            {ok}
          </button>
        </div>
      </div>
    </div>
  );
}

/** const [askCard, ask] = useAsk();  if (!(await ask({ title, body, ok }))) return;  —— 卡片收起以后才 resolve */
function useAsk() {
  const [q, setQ] = useState(null);
  const pending = useRef(null);
  const seq = useRef(0);
  const ask = (o) =>
    new Promise((resolve) => {
      pending.current?.(false); // 又问了一次：上一个当作取消
      pending.current = resolve;
      seq.current += 1;
      setQ({ ...o, key: seq.current });
    });
  const done = (v) => {
    const r = pending.current;
    pending.current = null;
    setQ(null);
    r?.(v);
  };
  useEffect(() => () => pending.current?.(false), []);
  return [q ? <AskCard key={q.key} title={q.title} body={q.body} ok={q.ok} onDone={done} /> : null, ask];
}

/** 员工 · 本机蓝图：锁着。按住 3 秒（一圈金线画满）才打开；打开后轻触就锁上 */
function Archive({ list, onRemove, onClear }) {
  const [open, setOpen] = useState(false);
  const swallow = useRef(false); // 刚按住打开：松手那一下的 click 不要又把它锁上
  const { p, bind } = useHold(
    () => {
      swallow.current = true;
      sfx.play('open'); // 按满 3 秒的那一刻（按下去那一下只是「笃」：短按什么都不会打开）
      setOpen(true);
    },
    { enabled: !open }
  );

  // 离开这一页（打开一份蓝图、切去别的 app、锁屏）或按「返回」回到这一页：一律锁上
  useEffect(() => {
    const lock = () => setOpen(false);
    const onVis = () => {
      if (document.visibilityState === 'hidden') lock();
    };
    window.addEventListener('pagehide', lock);
    window.addEventListener('pageshow', lock);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', lock);
      window.removeEventListener('pageshow', lock);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const ring = open ? 1 : p;
  return (
    <section className={`ln-archive ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className={`ln-archive-head ${p > 0 && !open ? 'is-holding' : ''}`}
        aria-expanded={open}
        aria-controls="ln-archive-body"
        data-sfx={open ? undefined : 'tap'}
        data-fx-ripple="off"
        {...bind}
        onPointerDown={(e) => {
          if (open) swallow.current = false;
          bind.onPointerDown(e);
        }}
        onKeyDown={(e) => {
          if (open) swallow.current = false;
          bind.onKeyDown(e);
        }}
        onClick={() => {
          if (swallow.current) {
            swallow.current = false;
            return;
          }
          if (open) setOpen(false);
        }}
      >
        <span className="ln-lock" aria-hidden="true">
          <svg className="ln-ring" viewBox="0 0 40 40">
            <circle className="ln-lock-track" cx="20" cy="20" r="18.5" />
            <circle className="ln-lock-fill" cx="20" cy="20" r="18.5" pathLength="100" style={{ strokeDashoffset: 100 - ring * 100 }} />
          </svg>
          {open ? <LockKeyholeOpen size={17} strokeWidth={1.8} /> : <LockKeyhole size={17} strokeWidth={1.8} />}
        </span>
        <span className="ln-archive-text">
          <b>{t('员工 · 本机蓝图（{0}）', [list.length])}</b>
          <span>{open ? t('轻触锁上') : t('按住 3 秒打开')}</span>
        </span>
        <ChevronDown className="ln-chev" size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {open && (
        <div className="ln-archive-body" id="ln-archive-body">
          <p className="ln-note">{t('只存在这台设备。「蓝图」会打开设计师版 —— 不要在客人面前打开。')}</p>
          {list.length === 0 ? (
            <p className="ln-empty">{t('还没有。客人许完愿会自动存在这里（只存在这台设备）。')}</p>
          ) : (
            <ul className="ln-list">
              {list.map((x, i) => (
                <ArchiveRow key={x.id} p={x} i={i} onRemove={onRemove} />
              ))}
            </ul>
          )}
          <div className="ln-archive-foot">
            {CONFIG.keepDays > 0 && <p className="ln-note">{t('建好超过 {0} 天的蓝图会自动删掉（客人手上的链接还能打开）。', [CONFIG.keepDays])}</p>}
            {list.length > 0 && (
              <button type="button" className="ln-clear" onClick={(e) => onClear(e.currentTarget.closest('.ln-archive-body')?.querySelectorAll('.ln-row'))}>
                <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                <span>{t('清空本机全部蓝图')}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** 员工 · 案例库：锁着（按住 3 秒），打开后一个按钮去 cases.html?staff=1。离开这一页就锁上 */
function CaseLibrary() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(null);
  const swallow = useRef(false);
  const { p, bind } = useHold(
    () => {
      swallow.current = true;
      sfx.play('open');
      setOpen(true);
    },
    { enabled: !open }
  );
  // 数一下有几个案例（案例库的资料是另外一块，入口页先画好再去拿）
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      import('../shared/cases.js')
        .then((C) => C.listCases({ includeDrafts: true, includeHidden: true }))
        .then((l) => alive && setCount({ all: l.length, live: l.filter((c) => c.status === 'live').length, draft: l.filter((c) => c.status === 'draft').length }))
        .catch(() => {});
    }, 600);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [open]);
  useEffect(() => {
    const lock = () => setOpen(false);
    const onVis = () => {
      if (document.visibilityState === 'hidden') lock();
    };
    window.addEventListener('pagehide', lock);
    window.addEventListener('pageshow', lock);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', lock);
      window.removeEventListener('pageshow', lock);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  const ring = open ? 1 : p;
  return (
    <section className={`ln-archive ln-cases ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className={`ln-archive-head ${p > 0 && !open ? 'is-holding' : ''}`}
        aria-expanded={open}
        aria-controls="ln-cases-body"
        data-sfx={open ? undefined : 'tap'}
        data-fx-ripple="off"
        {...bind}
        onPointerDown={(e) => {
          if (open) swallow.current = false;
          bind.onPointerDown(e);
        }}
        onKeyDown={(e) => {
          if (open) swallow.current = false;
          bind.onKeyDown(e);
        }}
        onClick={() => {
          if (swallow.current) {
            swallow.current = false;
            return;
          }
          if (open) setOpen(false);
        }}
      >
        <span className="ln-lock" aria-hidden="true">
          <svg className="ln-ring" viewBox="0 0 40 40">
            <circle className="ln-lock-track" cx="20" cy="20" r="18.5" />
            <circle className="ln-lock-fill" cx="20" cy="20" r="18.5" pathLength="100" style={{ strokeDashoffset: 100 - ring * 100 }} />
          </svg>
          {open ? <LockKeyholeOpen size={17} strokeWidth={1.8} /> : <LockKeyhole size={17} strokeWidth={1.8} />}
        </span>
        <span className="ln-archive-text">
          <b>{count ? t('员工 · 案例库（{0}）', [count.all]) : t('员工 · 案例库')}</b>
          <span>{open ? t('轻触锁上') : t('按住 3 秒打开')}</span>
        </span>
        <ChevronDown className="ln-chev" size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {open && (
        <div className="ln-archive-body" id="ln-cases-body">
          <p className="ln-note">{t('公司做过的家 + 3D 风格方案：打标签、排序、上架，客人许完愿就从这里挑最像他的家。只给员工用 —— 不要在客人面前打开。')}</p>
          {count && <p className="ln-cases-count">{t('上架 {0} · 草稿 {1}', [count.live, count.draft])}</p>}
          <a className="ln-cases-go" href="cases.html?staff=1" data-sfx="open" data-fx-depth="0.98">
            <Images size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>{t('打开案例库')}</span>
            <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
          </a>
        </div>
      )}
    </section>
  );
}

function Launcher() {
  const lang = useLang();
  const [list, setList] = useState(loadArchive);
  const [wish, setWish] = useState(wishOn); // 许愿模式开着时被重新载入：回到许愿模式的开场
  const [primed, setPrimed] = useState(false);
  const [host, setHost] = useState(savedHost);
  const cta = useRef(null);
  const entering = useRef(false);
  const [askCard, ask] = useAsk();
  useGleam(cta, !wish, { first: 1400, every: 6400 }); // 唯一的金色「开始」：隔一阵子被光轻轻扫过（不出声）

  useEffect(() => {
    if (!wish) document.title = 'WISH · by Riccione Reka';
  }, [wish, lang]);

  // 从别的页面「返回」到这一页（bfcache）：本机蓝图可能多了几份；过了保留期的客人名单 / 员工记录顺手删掉（keep.js）
  useEffect(() => {
    sweepKept();
    const f = () => {
      sweepKept();
      setList(loadArchive());
    };
    window.addEventListener('pageshow', f);
    return () => window.removeEventListener('pageshow', f);
  }, []);

  if (wish)
    return (
      <WishMode
        primed={primed}
        host={host}
        onExit={() => {
          markWish(false);
          setWish(false);
          setPrimed(false);
          setList(loadArchive());
          window.scrollTo(0, 0);
        }}
      />
    );

  const journey = pair('许愿之旅', BRAND.readingEn);
  const studio = pair('3D 梦想工作室', '3D Dream Studio');
  const wishName = pair('客户许愿模式', 'Wish Mode');
  // 先问一句（页面里的小卡片）；确定了，删掉的那一行从右边开始化成金尘；其余几行顺势补上（fx.layout 的弹簧，不跳）
  const remove = async (p, row) => {
    const yes = await ask({
      title: t('删除 {0} 的蓝图？', [p.name || t('这位贵宾')]),
      body: t('只删掉这台设备上的这一份，客人手上的链接还能打开。'),
      ok: t('删除'),
    });
    if (!yes) return;
    // 存档马上删（金尘要半秒以上，很卡时好几秒：这期间换页 / 锁屏也不会「删了又回来」）；画面上的那一行等金尘散完再收
    removeFromArchive(p.id);
    dropStaffNote(p.id); // 员工记的预算跟着这份蓝图一起删
    const commit = () => setList(loadArchive());
    if (!row?.isConnected) return commit(); // 本机蓝图在卡片开着的时候锁上了：直接删
    fx.dissolve(row, { origin: 'right', duration: 520, delay: 40, tone: 'paper' }).then(() => {
      const rest = [...(row.parentNode?.children || [])].filter((n) => n !== row);
      fx.layout(rest, () => flushSync(commit));
    });
  };
  const clear = async (rows) => {
    const yes = await ask({
      title: t('删除这台设备上全部 {0} 份蓝图？', [list.length]),
      body: t('删了就找不回来（客人手上的链接还能打开）。'),
      ok: t('全部删除'),
    });
    if (!yes) return;
    clearArchive(); // 同上：存档马上清，画面等金尘
    clearStaffNotes(); // 员工记的预算（genie.staffnotes.v1）也一起清，不留没有蓝图的预算
    const commit = () => setList(loadArchive());
    const els = [...(rows || [])].filter((el) => el.isConnected);
    if (!els.length) return commit();
    Promise.all(els.map((el, i) => fx.dissolve(el, { origin: 'right', duration: 480, delay: 40 + Math.min(i, 9) * 45, tone: 'paper' }))).then(commit);
  };
  // 客户许愿模式：声音、全屏、屏幕常亮都必须在这一下点击里开启；画面由一道晨光换过去
  const enterWish = () => {
    if (entering.current) return;
    entering.current = true;
    startWish();
    markWish(true);
    setPrimed(true);
    fx.wipe(null, { tone: 'dawn', duration: 1000 }).mid.then(() => {
      entering.current = false;
      setWish(true);
      window.scrollTo(0, 0);
    });
  };

  return (
    <div className="ln">
      <header className="ln-head">
        <div className="ln-brand">
          <b>{BRAND.app}</b>
          <span>
            {BRAND.by} · {BRAND.house}
          </span>
        </div>
        <LangToggle />
      </header>

      <main className="ln-main">
        <section className="ln-hero">
          <Pangie mood="wink" size={150} className="ln-pangie" />
          <div className="ln-hero-text">
            <p className="ln-eyebrow" lang={isEn() ? 'zh-Hans' : 'en'}>
              {isEn() ? '梦想的家，在动工之前' : 'The dream home, before it is built'}
            </p>
            <h1 className="ln-h1">
              {t('先读懂一个家，')}
              <br />
              {t('再把它变出来。')}
            </h1>
            <p className="ln-lead">
              {tj('客人第一次到展厅：先和熊猫精灵{0}花几分钟许个愿，说出他心里的家；', [guideName()])}
              {isEn() ? ' ' : ''}
              {t('设计师接着打开 3D 工作室，把平面图和他的答案，马上变成看得见的概念。')}
            </p>
          </div>
        </section>

        <section className="ln-wish dusk" aria-labelledby="ln-wish-title">
          <i className="ln-ff" aria-hidden="true" />
          <i className="ln-ff b" aria-hidden="true" />
          <i className="ln-ff c" aria-hidden="true" />
          <button type="button" className="ln-wish-go" data-fx-depth="0.985" onClick={enterWish}>
            <span className="ln-lamp" aria-hidden="true">
              <Lamp size={86} glow={1} smoke />
            </span>
            <span className="ln-wish-text">
              <b id="ln-wish-title">{wishName.main}</b>
              <em lang={wishName.altLang}>{wishName.alt}</em>
              <span>{t('按下就开始：大自然禅意音乐 + 潘吉带客人从许愿一路走到 3D')}</span>
              <small>{t('全屏 · 屏幕常亮 · 长按 WISH 字标 3 秒打开员工区')}</small>
            </span>
            <span ref={cta} className="ln-wish-cta">
              {t('开始')}
              <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
            </span>
          </button>
          {CONFIG.team.length > 1 && (
            <label className="ln-host">
              <span>{t('陪同人')}</span>
              <select
                value={host}
                onChange={(e) => {
                  setHost(e.target.value);
                  saveHost(e.target.value);
                }}
              >
                <option value="">{t('（不指定）')}</option>
                {CONFIG.team.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        <div className="ln-cards">
          <a
            className="ln-card"
            data-fx-depth="0.98"
            href="quiz.html"
            onClick={(e) => {
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // 在新分页打开：照旧
              e.preventDefault();
              // 等按键声响完再换页（不然声音被切掉）。不留下这一页的记录：客人在许愿之旅里按「返回」，回不到员工的入口页
              setTimeout(() => location.replace('quiz.html'), 220);
            }}
          >
            <span className="ln-card-top">
              <span className="ln-num">I</span>
              <span className="ln-ico" aria-hidden="true">
                <Footprints size={22} strokeWidth={1.7} />
              </span>
            </span>
            <b className="ln-card-title">{journey.main}</b>
            <em className="ln-alt" lang={journey.altLang}>
              {journey.alt}
            </em>
            <span className="ln-desc">{t('客人自己的手机 · 分享链接 · 约 10 分钟。五张牌：直觉、生活、宝藏、三个愿望、雷区 → 挑参考案例 → 在 3D 里看见自己的家。')}</span>
            <span className="ln-tip">
              <Tablet size={16} strokeWidth={1.8} aria-hidden="true" />
              <span>{t('展厅 iPad 请用上面的「客户许愿模式」。')}</span>
            </span>
            <span className="ln-go">
              {t('开始许愿')}
              <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
            </span>
          </a>
          <a className="ln-card" data-fx-depth="0.98" href="studio.html?staff=1">
            <span className="ln-card-top">
              <span className="ln-num">II</span>
              <span className="ln-ico" aria-hidden="true">
                <Cuboid size={22} strokeWidth={1.7} />
              </span>
            </span>
            <b className="ln-card-title">{studio.main}</b>
            <em className="ln-alt" lang={studio.altLang}>
              {studio.alt}
            </em>
            <span className="ln-desc">{t('给设计师 / 销售 · 电脑 / 大屏。上传平面图 → 自动生成 3D；拖拽换材质、一键情绪、24 小时光影；演示模式可当展厅宣传片。')}</span>
            <span className="ln-go">
              {t('打开工作室')}
              <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
            </span>
          </a>
        </div>

        <Archive list={list} onRemove={remove} onClear={clear} />
        <CaseLibrary />
      </main>

      <footer className="ln-foot">
        {BRAND.plinth} · {BRAND.venue}
      </footer>
      {askCard}
    </div>
  );
}

installSfx({ fx }); // 整页的按钮一按就有声音（WISH 音效，src/shared/sfx.js）；动效的声音也走这里（同一下不响两次）
fx.install(); // 每个按钮按下去都有光：缩一点 + 指尖一圈暖光（src/shared/fx.js）

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Launcher />
  </StrictMode>
);
