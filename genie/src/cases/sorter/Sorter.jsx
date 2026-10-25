// 员工 · 案例整理（cases.html?staff=1&sorter=1）—— 把老板电脑上的一整个照片文件夹（9 000+ 张）变成一个精选的案例库。
//   选文件夹 / 拖进来 → 自动按项目分组 → worker 在后台看每一张（指纹、清晰度、曝光、主色…）→ 每个项目自动挑封面 + 5 张
//   → 员工一行一行确认（风格、房子、业主同意）→ 存成草稿案例 / 导出案例包（每份 ≤ 20 MB）
// 只给员工：从案例库（已经按住 3 秒解锁）进来；许愿模式里没有任何路到这里。
// 隐私：照片只在这台电脑上处理；只有员工自己按「AI 帮我填」才会把小图发给 Google；文件夹里的人名永远不显示、不进案例。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FolderTree, Images, Keyboard, Library, Download, Pause, Play, Sparkles, ChevronDown, ChevronUp, Info } from 'lucide-react';
import LangToggle from '../../shared/LangToggle.jsx';
import { t, L, isEn, useLang } from '../../shared/i18n.js';
import { PROPERTY_TYPES } from '../../shared/cases.js';
import { sfx } from '../../shared/sfx.js';
import fx from '../../shared/fx.js';
import DATA from './data.json';
import { setData, getData } from './data.js';
import { fromFiles, fromDrop, canPickFolder } from './listing.js';
import { Session, Thumbs } from './session.js';
import { bestPerStyle } from './pick.js';
import { Pool } from './pool.js';
import Row from './Row.jsx';
import { Preview, RoomPicker, Rename, MergePick, Help, AiSheet, OutputSheet, aiPref, aiTargets, hasAiKey, runAutoTag } from './Sheets.jsx';
import './sorter.css';

setData(DATA);

const FILTERS = [
  ['todo', '未看'],
  ['ready', '好了'],
  ['skip', '跳过'],
  ['all', '全部'],
];
const nf = (n) => Math.round(n).toLocaleString('en-US');
/** 「每种风格先做最好的 N 个」的选项（0 = 全部） */
const BEST_N = [0, 3, 5, 10, 20];
// 员工自己的小习惯（这台电脑）：风格筛选、每种风格几个
const PREF_KEY = 'genie.sorter.view.v1';
const loadPref = () => {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {};
  } catch {
    return {};
  }
};
const savePref = (p) => {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* 隐私模式：只在这一页记得 */
  }
};
// 第一眼只画 6 行（一屏放得下 2–3 行），剩下的趁空闲每次补 6 行：一行有十几张小图，一次画 24 行在慢电脑上会卡住 ~1 秒
const FIRST = 6;
const STEP = 6;
function fmtDur(sec) {
  if (sec == null || !isFinite(sec)) return '—';
  if (sec < 60) return t('{0} 秒', [Math.max(1, Math.round(sec))]);
  const m = Math.round(sec / 60);
  return m < 60 ? t('{0} 分钟', [m]) : t('{0} 小时 {1} 分', [Math.floor(m / 60), m % 60]);
}
const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

// ───────────────────────── 开始：选文件夹 / 拖进来 ─────────────────────────

function Start({ onEntries, listing }) {
  const dirRef = useRef(null);
  const filesRef = useRef(null);
  const [over, setOver] = useState(false);
  const folderOK = useMemo(() => canPickFolder(), []);
  const pick = async (list) => {
    const t0 = performance.now();
    const entries = fromFiles(list);
    onEntries(entries, performance.now() - t0);
  };
  // 只在开发服务器里：浏览器检查脚本用它把测试文件夹交进来（正式版没有这一段）
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    window.__sorterPick = (files) => pick(files); // 和「选择文件夹」走同一条路（列文件的时间也一样量）
    return () => delete window.__sorterPick;
  }, []);
  const onDrop = async (e) => {
    e.preventDefault();
    setOver(false);
    const t0 = performance.now();
    listing.set(0);
    const entries = await fromDrop(e.dataTransfer, { onCount: (n) => listing.set(n) });
    onEntries(entries, performance.now() - t0);
  };
  return (
    <section className="so-start">
      <p className="so-eyebrow">{t('员工 · 案例库')}</p>
      <h1>{t('案例整理')}</h1>
      <p className="so-lead">{t('把一整个照片文件夹（几千张也可以）变成一个精选的案例库：自动分项目、去掉重复和不合适的、挑好封面。你只要一行一行点一下确认。')}</p>
      <div
        className={`so-drop ${over ? 'is-over' : ''} ${listing.n != null ? 'is-busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!over) setOver(true);
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
        onDrop={onDrop}
      >
        <span className="so-drop-ico" aria-hidden="true">
          <FolderTree size={34} strokeWidth={1.4} />
        </span>
        {listing.n != null ? (
          <>
            <b>{t('正在列文件… {0}', [nf(listing.n)])}</b>
            <span>{t('只读名字、大小和日期，很快。')}</span>
          </>
        ) : (
          <>
            <b>{folderOK ? t('把整个照片文件夹拖到这里') : t('选几张照片')}</b>
            <span>{t('照片只在这台电脑上处理，不会上传到任何地方。')}</span>
            <div className="so-drop-acts">
              {folderOK && (
                <button type="button" className="btn-primary" data-sfx="open" onClick={() => dirRef.current?.click()}>
                  <FolderTree size={18} strokeWidth={1.8} aria-hidden="true" />
                  {t('选择文件夹')}
                </button>
              )}
              <button type="button" className={folderOK ? 'btn-line' : 'btn-primary'} data-sfx="open" onClick={() => filesRef.current?.click()}>
                <Images size={18} strokeWidth={1.8} aria-hidden="true" />
                {folderOK ? t('只选几张照片') : t('选照片')}
              </button>
            </div>
          </>
        )}
        <input
          ref={dirRef}
          type="file"
          hidden
          multiple
          webkitdirectory=""
          directory=""
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={filesRef}
          type="file"
          hidden
          multiple
          accept="image/*,.heic,.heif"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <ol className="so-steps">
        <li>
          <b>{t('自动分组')}</b>
          <span>{t('按「城市-姓名-风格」的项目文件夹分；其它文件夹按拍摄时间分。')}</span>
        </li>
        <li>
          <b>{t('自动挑选')}</b>
          <span>{t('每个项目挑一张封面 + 最多 5 张；重复、模糊、截图、单据先藏起来（找得回来）。')}</span>
        </li>
        <li>
          <b>{t('你来确认')}</b>
          <span>{t('点风格、房子、业主同意 → 存成草稿案例，或者导出案例包给另一台 iPad。')}</span>
        </li>
      </ol>
      <p className="so-fine">
        <Info size={14} strokeWidth={2} aria-hidden="true" />
        {t('文件夹名字里的客户 / 设计师名字只用来认项目：不显示、不进案例、不导出。HEIC 照片：Safari 读得了；Chrome / Edge 请先导出成 JPG。')}
      </p>
    </section>
  );
}

// ───────────────────────── 进度条 ─────────────────────────

function Progress({ s }) {
  const p = s.progress;
  if (!p.total) return null;
  const pct = Math.min(100, (p.done / Math.max(1, p.total)) * 100);
  return (
    <div className={`so-prog ${p.running ? 'is-run' : 'is-done'}`} role="status">
      <div className="so-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <p>
        {p.running ? (
          <>
            {t('正在看照片 {0} / {1}', [nf(p.done), nf(p.total)])}
            {p.rate > 0 && <span> · {t('每秒 {0} 张', [p.rate.toFixed(p.rate < 10 ? 1 : 0)])}</span>}
            {p.eta != null && <span> · {t('大约还要 {0}', [fmtDur(p.eta)])}</span>}
            {p.paused && <b> · {t('暂停了')}</b>}
          </>
        ) : (
          <>{t('照片都看完了：{0} 张', [nf(p.done)])}</>
        )}
      </p>
      {p.running && (
        <button type="button" className="btn-ghost so-mini" data-sfx="tap" onClick={() => s.pause(!p.paused)}>
          {p.paused ? <Play size={15} strokeWidth={2} aria-hidden="true" /> : <Pause size={15} strokeWidth={2} aria-hidden="true" />}
          {p.paused ? t('继续') : t('暂停')}
        </button>
      )}
    </div>
  );
}

// ───────────────────────── 整页 ─────────────────────────

export default function Sorter() {
  const lang = useLang?.() ?? (isEn() ? 'en' : 'zh');
  const [phase, setPhase] = useState('start');
  const [listingN, setListingN] = useState(null);
  const [, setV] = useState(0);
  const sRef = useRef(null);
  const poolRef = useRef(null);
  const thumbsRef = useRef(null);
  const [filter, setFilter] = useState('todo');
  const [city, setCity] = useState('');
  const [styleF, setStyleF] = useState(() => loadPref().style || '');
  const [bestN, setBestN] = useState(() => (BEST_N.includes(loadPref().best) ? loadPref().best : 0));
  useEffect(() => savePref({ style: styleF, best: bestN }), [styleF, bestN]);
  const [focus, setFocus] = useState(null);
  const [focusKey, setFocusKey] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const listRef = useRef(null);
  const s = sRef.current;
  // 「AI 帮我填」：这台电脑有 Gemini key 才提；员工同意过「以后自动」→ 照片看完就在后台帮忙填房间和风格
  const [hasKey, setHasKey] = useState(false);
  const [aiRun, setAiRun] = useState(null); // { i, n } 后台正在填
  const aiCtl = useRef(null);
  const offered = useRef(false);
  const aiPaused = useRef(false); // 员工按了「停」：这一次整理就不再自动（以后照旧，想关掉在「AI 帮我填」里取消勾选）
  useEffect(() => {
    if (phase !== 'work') return undefined;
    let alive = true;
    hasAiKey().then((k) => alive && setHasKey(k));
    return () => {
      alive = false;
    };
  }, [phase]);
  useEffect(() => () => aiCtl.current?.abort(), []);
  useEffect(() => {
    if (phase !== 'work' || !s || !hasKey || aiCtl.current || aiPaused.current) return;
    const targets = aiTargets(s);
    // 第一次：看完 3 个项目就主动问一次（还是要员工按「同意」）
    if (aiPref() !== 'auto') {
      if (!offered.current && !sheet && targets.length >= 3) {
        offered.current = true;
        setSheet({ type: 'ai', offered: true });
      }
      return;
    }
    // 同意过「以后自动」：攒够 3 个（或者全部看完了）就在后台填，一次一批
    if (!targets.length || (s.progress.running && targets.length < 3)) return;
    const ctl = new AbortController();
    aiCtl.current = ctl;
    setAiRun({ i: 0, n: targets.length });
    runAutoTag(s, poolRef.current, targets, { signal: ctl.signal, onProg: (p) => !ctl.signal.aborted && setAiRun({ i: p.i, n: p.n }) }).then((r) => {
      if (aiCtl.current === ctl) aiCtl.current = null;
      setAiRun(null);
      if (ctl.signal.aborted) return; // 员工按了「停」：那边已经说过了
      if (r.err && r.err !== 'nokey') setToast({ msg: r.err, kind: 'error' });
      else if (r.ok) setToast({ msg: t('AI 填好了 {0} 个项目', [r.ok]) });
      if (r.err) setHasKey(false);
    });
  });
  const stopAi = () => {
    aiPaused.current = true;
    aiCtl.current?.abort();
    aiCtl.current = null;
    setAiRun(null);
    setToast({ msg: t('AI 先停了：这次整理不再自动帮你填') });
  };

  useEffect(() => {
    document.title = `${t('案例整理')} · WISH`;
  }, [lang]);
  useEffect(
    () => () => {
      sRef.current?.destroy();
      thumbsRef.current?.destroy();
      poolRef.current?.destroy();
    },
    []
  );
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(id);
  }, [toast]);
  // 关页面 / 刷新前：分析结果、小图、进度写完
  useEffect(() => {
    const flush = () => sRef.current?.destroy();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const onEntries = useCallback(async (entries, listMs) => {
    const tS = performance.now();
    if (!entries.length) {
      setListingN(null);
      setToast({ msg: t('这里面没有照片。') });
      return;
    }
    const t0 = performance.now();
    if (!poolRef.current) poolRef.current = new Pool();
    sRef.current?.destroy();
    thumbsRef.current?.destroy();
    poolRef.current.clear();
    const sess = new Session(entries, { listMs, pool: poolRef.current });
    sess.groupMs = performance.now() - t0;
    const th = new Thumbs(sess, poolRef.current);
    sess.onThumb = (k, b) => th.offer(k, b);
    sRef.current = sess;
    thumbsRef.current = th;
    sess.on(() => setV((x) => x + 1));
    const t1 = performance.now();
    const cached = await sess.resume();
    sess.cached = cached;
    sess.resumeMs = performance.now() - t1;
    // 只在开发服务器里给浏览器检查脚本看进度：正式版不挂到 window 上（会话里有从文件夹名认出来的人名、完整路径）
    if (import.meta.env.DEV) window.__sorter = sess;
    // 分项目 + 读缓存是上一段；第一批行等下一帧开头再画（不和它们挤在同一个任务里；分页在后台没有帧 → 最多等 120 ms）
    await new Promise((r) => {
      const tm = setTimeout(r, 120);
      requestAnimationFrame(() => {
        clearTimeout(tm);
        r();
      });
    });
    setListingN(null);
    setPhase('work');
    setFilter('todo');
    sess.readyMs = performance.now() - tS;
    // 第一批行画出来以后再响（第一次要建 AudioContext）、再开始分析（几百个文件排进后台线程）：不和第一帧挤在同一个任务里
    setTimeout(() => {
      if (sRef.current !== sess) return;
      sfx.play('open');
      sess.start();
    }, 150);
  }, []);

  // ───────────── 现在看得到的项目 ─────────────
  const D0 = getData();
  const styleOrder = D0.styles.map((x) => x.id);
  const base = s
    ? s.groups.filter((g) => {
        if (g.kind !== 'home' && !s.include[g.kind]) return false;
        if (city && g.city !== city) return false;
        if (styleF === '-' ? s.stylesOf(g).length : styleF && !s.stylesOf(g).includes(styleF)) return false;
        if (filter === 'all') return true;
        return s.stateOf(g) === filter;
      })
    : [];
  // 每种风格先做最好的 N 个（照片好、张数够、房间多的在前；原木、侘寂排在最前）
  const visible = s && bestN > 0
    ? (() => {
        const ids = bestPerStyle(base.map((g) => ({ id: g.id, style: styleF && styleF !== '-' ? styleF : s.stylesOf(g)[0] || '', score: s.scoreOf(g) })), bestN, styleOrder);
        const byId = new Map(base.map((g) => [g.id, g]));
        return ids.map((id) => byId.get(id));
      })()
    : base;
  const [sticky, setSticky] = useState(null); // 刚按了「好了 / 跳过」的那一行：焦点离开前还留在列表里
  const shown = sticky && s && !visible.some((g) => g.id === sticky) ? s.groups.filter((g) => visible.includes(g) || g.id === sticky) : visible;
  const focusG = s && (shown.find((g) => g.id === focus) || shown[0]);
  const fid = focusG?.id || null;
  // 一次只画前面几十行，剩下的趁空闲慢慢补上（几百个项目也不会卡住第一眼）
  const [limit, setLimit] = useState(FIRST);
  useEffect(() => setLimit(FIRST), [filter, city, phase, styleF, bestN]);
  const fIdx = shown.findIndex((g) => g.id === fid);
  const need = Math.max(limit, fIdx + 12);
  useEffect(() => {
    if (need >= shown.length) return undefined;
    const ric = window.requestIdleCallback || ((f) => setTimeout(f, 40));
    const cic = window.cancelIdleCallback || clearTimeout;
    const id = ric(() => setLimit((l) => Math.max(l, need) + STEP));
    return () => cic(id);
  }, [need, shown.length]);
  const drawn = shown.slice(0, need);

  const scrollTo = (gid) =>
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector(`[data-gid="${CSS.escape(gid)}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: fx.motion.reduced ? 'auto' : 'smooth' });
    });
  const moveFocus = (delta) => {
    if (!shown.length) return;
    const i = Math.max(0, shown.findIndex((g) => g.id === fid));
    const j = Math.min(shown.length - 1, Math.max(0, i + delta));
    const gid = shown[j].id;
    setFocus(gid);
    setFocusKey(null);
    if (sticky && sticky !== gid) setSticky(null);
    scrollTo(gid);
    sfx.play('tick');
  };

  const act = (what, gid, extra) => {
    if (!s) return;
    const g = s.groups.find((x) => x.id === gid);
    if (!g) return;
    if (what === 'split') {
      const parts = s.split(gid, extra);
      if (parts) setToast({ msg: t('拆成了两个项目') });
      return;
    }
    const el = listRef.current?.querySelector(`[data-gid="${CSS.escape(gid)}"]`);
    if (what === 'ready') {
      const miss = s.readyCheck(g);
      if (miss.length) {
        if (el) fx.nope(el);
        setToast({ msg: t('还差：{0}', [miss.map((m) => t(m === 'style' ? '风格' : m === 'type' ? '房子' : '照片')).join(isEn() ? ', ' : '、')]), kind: 'error' });
        return;
      }
      if (el) fx.scan(el, { sound: false });
      sfx.play('confirm');
    } else if (what === 'skip') sfx.play('cross');
    s.setDecision(gid, { state: what });
    if (what === 'ready' || what === 'skip') {
      // 下一个：列表里它后面的那一个
      const i = shown.findIndex((x) => x.id === gid);
      const next = shown.slice(i + 1).find((x) => x.id !== gid) || shown.slice(0, i).reverse()[0];
      setSticky(filter === 'all' ? null : gid);
      if (next) {
        setFocus(next.id);
        setFocusKey(null);
        scrollTo(next.id);
      }
    }
  };

  // ───────────── 键盘 ─────────────
  // 最后一次是用 Tab 走到按钮上的（不是鼠标 / 手指点的）→ 回车 / 空格按那个按钮。
  // 不能只看 :focus-visible —— 鼠标点过一个按钮以后再按任何键，浏览器也会给它焦点框。
  const tabNav = useRef(false);
  useEffect(() => {
    const down = () => (tabNav.current = false);
    const key = (e) => {
      if (e.key === 'Tab') tabNav.current = true;
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, []);
  useEffect(() => {
    if (phase !== 'work' || !s) return undefined;
    const onKey = (e) => {
      if (sheet || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const g = focusG;
      const k = e.key;
      // 用 Tab 走到一个按钮上再按回车 / 空格 = 按那个按钮；鼠标点过的按钮不算，回车照样是「好了，下一个」
      const btn = e.target?.closest?.('button, a, [role="button"], label');
      if ((k === 'Enter' || k === ' ') && btn) {
        if (tabNav.current) return;
        e.preventDefault();
        btn.blur();
      }
      if (k === 'j' || k === 'ArrowDown') {
        e.preventDefault();
        moveFocus(1);
        return;
      }
      if (k === 'k' || k === 'ArrowUp') {
        e.preventDefault();
        moveFocus(-1);
        return;
      }
      if (k === '?') {
        setSheet({ type: 'help' });
        return;
      }
      if (!g) return;
      const d = s.decision(g.id);
      const D = getData();
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit && e.shiftKey) {
        const p = PROPERTY_TYPES[+digit[1] - 1];
        if (p) {
          e.preventDefault();
          s.setDecision(g.id, { type: d.type === p.id ? undefined : p.id });
          sfx.play('select');
        }
        return;
      }
      if (digit && !e.shiftKey) {
        const st = D.styles[+digit[1] - 1];
        if (st) {
          const cur = s.stylesOf(g);
          s.setDecision(g.id, { styles: cur.includes(st.id) ? cur.filter((x) => x !== st.id) : [...cur, st.id] });
          sfx.play(cur.includes(st.id) ? 'chipRemove' : 'chipAdd');
        }
        return;
      }
      const lower = k.toLowerCase();
      if (lower === 'c' && g.kind !== 'showroom') {
        s.setDecision(g.id, { consent: !d.consent });
        sfx.play(d.consent ? 'toggleOff' : 'toggleOn');
        return;
      }
      if (k === 'Enter') {
        e.preventDefault();
        act('ready', g.id);
        return;
      }
      if (lower === 'x') {
        act('skip', g.id);
        return;
      }
      if (lower === 'e') {
        toggleExpand(g.id);
        return;
      }
      const order = expanded.has(g.id) ? s.orderOf(g) : s.pickedOf(g);
      if (k === 'ArrowRight' || k === 'ArrowLeft') {
        e.preventDefault();
        if (!order.length) return;
        const i = order.indexOf(focusKey);
        const j = i < 0 ? 0 : Math.min(order.length - 1, Math.max(0, i + (k === 'ArrowRight' ? 1 : -1)));
        setFocusKey(order[j]);
        return;
      }
      const fk = focusKey && g.keys.includes(focusKey) ? focusKey : null;
      if (k === ' ' && fk) {
        e.preventDefault();
        const cur = s.pickedOf(g);
        s.setDecision(g.id, { picked: cur.includes(fk) ? cur.filter((x) => x !== fk) : [...cur, fk] });
        sfx.play(cur.includes(fk) ? 'deselect' : 'select');
        return;
      }
      if (lower === 's' && fk) {
        const cur = s.pickedOf(g);
        s.setDecision(g.id, { picked: cur.includes(fk) ? cur : [fk, ...cur], cover: fk });
        sfx.play('select');
        return;
      }
      if (lower === 'v' && (fk || s.pickedOf(g)[0])) setSheet({ type: 'preview', gid: g.id, k: fk || s.pickedOf(g)[0] });
      // R = 给这张（没有选中就从封面开始）标房间；按键标好自动跳到下一张
      if (lower === 'r') {
        const k0 = fk || s.pickedOf(g)[0];
        if (!k0) return;
        e.preventDefault();
        openRoom(g.id, k0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const photoEl = (gid, k) => listRef.current?.querySelector(`[data-gid="${CSS.escape(gid)}"] [data-k="${CSS.escape(k)}"]`);
  const openRoom = (gid, k) => {
    setFocus(gid);
    setFocusKey(k);
    const el = photoEl(gid, k);
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    setSheet({ type: 'room', gid, k, anchor: el?.querySelector('.so-ph-room') || el, kbd: true });
  };
  /** 标完一张：跳到同一行的下一张（挑好的照片；展开时也包括其它照片），最后一张标完就关 */
  const nextRoom = (gid, k) => {
    const g = s?.groups.find((x) => x.id === gid);
    if (!g) return setSheet(null);
    const order = expanded.has(gid) ? s.orderOf(g) : s.pickedOf(g);
    const nk = order[order.indexOf(k) + 1];
    if (!nk) {
      setSheet(null);
      const left = s.pickedOf(g).filter((x) => !s.roomOf(g, x)).length;
      setToast({ msg: left ? t('还有 {0} 张没标房间', [left]) : t('这个项目的房间都标好了') });
      return;
    }
    openRoom(gid, nk);
  };

  const toggleExpand = (gid) =>
    setExpanded((cur) => {
      const n = new Set(cur);
      if (n.has(gid)) n.delete(gid);
      else n.add(gid);
      return n;
    });

  const setInclude = (kind, on) => {
    s.include = { ...s.include, [kind]: on };
    s.saveSoon();
    if (on) s.start();
    s.changed(true);
  };

  // ───────────── 画 ─────────────
  if (phase !== 'work' || !s) {
    return (
      <div className="so so-page">
        <header className="so-top">
          <a className="mg-home" href={`cases.html?staff=1${isEn() ? '&lang=en' : ''}`} data-sfx="back" aria-label={t('回到案例库')}>
            <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" />
          </a>
          <span className="so-crumb">{t('案例库')}</span>
          <span className="so-sp" />
          <LangToggle compact />
        </header>
        <Start
          onEntries={(entries, ms) => {
            setListingN(entries.length);
            setTimeout(() => onEntries(entries, ms), 30);
          }}
          listing={{ n: listingN, set: setListingN }}
        />
        {toast && (
          <div key={toast.msg} className="mg-toast" role="status">
            {toast.msg}
          </div>
        )}
      </div>
    );
  }

  const c = s.counts();
  const cities = [...new Set(s.groups.filter((g) => g.kind === 'home').map((g) => g.city).filter(Boolean))];
  const D = getData();
  const readyGs = s.groups.filter((g) => s.stateOf(g) === 'ready' && (g.kind === 'home' || s.include[g.kind]));
  const readyPhotos = readyGs.reduce((n, g) => n + s.pickedOf(g).length, 0);
  const savedN = readyGs.filter((g) => s.decision(g.id).saved && !s.dirty(g)).length;
  const heicFailed = [...s.failed.values()].filter((x) => x === 'heic').length;
  const decodeFailed = s.failed.size - heicFailed;

  return (
    <div className="so so-page is-work">
      <header className="so-top">
        <a className="mg-home" href={`cases.html?staff=1${isEn() ? '&lang=en' : ''}`} data-sfx="back" aria-label={t('回到案例库')}>
          <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" />
        </a>
        <h1>
          {t('案例整理')}
          <small>{t('员工')}</small>
        </h1>
        <p className="so-stats">{t('{0} 张照片 · {1} 个项目 · {2} 个城市', [nf(s.stats.images), nf(s.stats.projects), s.stats.cities])}</p>
        <span className="so-sp" />
        <button type="button" className="so-icon-btn so-kbd-btn" data-sfx="open" aria-label={t('键盘')} title={t('键盘')} onClick={() => setSheet({ type: 'help' })}>
          <Keyboard size={18} strokeWidth={1.8} />
        </button>
        <LangToggle compact />
      </header>

      <Progress s={s} />

      <div className="so-tools">
        <div className="chips so-filters" role="tablist" aria-label={t('筛选')} data-sfx="radio">
          {FILTERS.map(([id, zh]) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} className={`chip ${filter === id ? 'on' : ''}`} onClick={() => (setFilter(id), setSticky(null))}>
              {t(zh)} <b>{c[id] ?? 0}</b>
            </button>
          ))}
        </div>
        {cities.length > 1 && (
          <label className="so-select">
            <span>{t('城市')}</span>
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">{t('全部城市')}</option>
              {cities.map((x) => (
                <option key={x} value={x}>
                  {isEn() ? D.cityEn?.[x] || x : x}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="so-select">
          <span>{t('风格')}</span>
          <select value={styleF} onChange={(e) => (setStyleF(e.target.value), setSticky(null))}>
            <option value="">{t('全部风格')}</option>
            {D.styles.map((st) => (
              <option key={st.id} value={st.id}>
                {t('先做{0}', [L(st)])}
              </option>
            ))}
            <option value="-">{t('还没有风格的')}</option>
          </select>
        </label>
        <label className="so-select">
          <span>{t('每种风格')}</span>
          <select value={bestN} onChange={(e) => (setBestN(+e.target.value), setSticky(null))}>
            {BEST_N.map((n) => (
              <option key={n} value={n}>
                {n ? t('最好的 {0} 个', [n]) : t('全部')}
              </option>
            ))}
          </select>
        </label>
        <span className="so-sp" />
        {aiRun ? (
          <span className="so-ai-run" role="status">
            <Sparkles size={15} strokeWidth={1.8} aria-hidden="true" />
            {t('AI 正在帮你填房间和风格 {0} / {1}', [Math.min(aiRun.i + 1, aiRun.n), aiRun.n])}
            <button type="button" className="btn-ghost so-mini" data-sfx="cross" onClick={stopAi}>
              {t('停')}
            </button>
          </span>
        ) : (
          <button type="button" className={`btn-line small so-ai-btn ${hasKey ? 'is-key' : ''}`} data-sfx="open" onClick={() => setSheet({ type: 'ai' })}>
            <Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />
            {hasKey ? t('AI 帮我填房间和风格') : t('AI 帮我填')}
          </button>
        )}
      </div>

      <div className={`so-skipped ${showSkipped ? 'is-open' : ''}`}>
        <button type="button" className="so-skipped-head" data-sfx="open" aria-expanded={showSkipped} onClick={() => setShowSkipped(!showSkipped)}>
          <Info size={15} strokeWidth={2} aria-hidden="true" />
          <span>
            {[
              s.stats.events ? t('活动 {0} 个（默认不导入）', [c.event]) : null,
              s.stats.showrooms ? t('展厅 {0} 个（默认不导入）', [c.showroom]) : null,
              heicFailed ? t('HEIC {0} 张这个浏览器读不了', [heicFailed]) : s.stats.heic ? t('HEIC {0} 张', [s.stats.heic]) : null,
              decodeFailed ? t('{0} 张打不开', [decodeFailed]) : null,
              s.stats.other ? t('视频 / 其它文件 {0} 个（跳过）', [s.stats.other]) : null,
              s.cached ? t('上次看过的 {0} 张直接用了', [nf(s.cached)]) : null,
              t('列文件 {0} 毫秒', [Math.round(s.listMs + (s.groupMs || 0))]),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {showSkipped ? <ChevronUp size={16} strokeWidth={2} /> : <ChevronDown size={16} strokeWidth={2} />}
        </button>
        {showSkipped && (
          <div className="so-skipped-body">
            {s.stats.showrooms > 0 && (
              <label className="so-switch">
                <input type="checkbox" checked={!!s.include.showroom} onChange={(e) => setInclude('showroom', e.target.checked)} />
                <span>{t('也整理展厅照片（存成「展厅」，永远不会当成客人的家去配对）')}</span>
              </label>
            )}
            {s.stats.events > 0 && (
              <label className="so-switch">
                <input type="checkbox" checked={!!s.include.event} onChange={(e) => setInclude('event', e.target.checked)} />
                <span>{t('也整理活动照片')}</span>
              </label>
            )}
            {heicFailed > 0 && <p className="so-tip">{t('HEIC 是 iPhone 的照片格式：用 Mac 上的 Safari 打开这一页就读得了；或者在电脑上先把它们导出 / 另存为 JPG 再拖进来。')}</p>}
            {s.skipped.length > 0 && (
              <ul className="so-skip-list">
                {s.skipped.slice(0, 40).map((x) => (
                  <li key={x.path}>{s.safe(x.path.split('/').slice(-2).join(' / '))}</li>
                ))}
                {s.skipped.length > 40 && <li>…</li>}
              </ul>
            )}
          </div>
        )}
      </div>

      <main className="so-list" ref={listRef} aria-label={t('项目')}>
        {shown.length === 0 ? (
          <div className="so-done">
            <Library size={26} strokeWidth={1.4} aria-hidden="true" />
            <p>{filter === 'todo' ? (s.progress.running ? t('正在看照片，项目会一个一个出现…') : t('都看完了！存进案例库，或者导出案例包。')) : t('这里还没有项目。')}</p>
          </div>
        ) : (
          drawn.map((g) => (
            <Row
              key={g.id}
              s={s}
              g={g}
              sig={s.rowSig(g)}
              lang={lang}
              thumbs={thumbsRef.current}
              focused={g.id === fid}
              focusKey={g.id === fid ? focusKey : null}
              expanded={expanded.has(g.id)}
              onFocus={(gid) => {
                setFocus(gid);
                setFocusKey(null);
                if (sticky && sticky !== gid) setSticky(null);
              }}
              onExpand={toggleExpand}
              onZoom={(gid, k) => setSheet({ type: 'preview', gid, k })}
              onRoom={(gid, k, anchor) => setSheet({ type: 'room', gid, k, anchor })}
              onMerge={(gid, target) => (target ? (s.merge(target, gid), setToast({ msg: t('已经并进去了') })) : setSheet({ type: 'merge', gid }))}
              onRename={(gid) => setSheet({ type: 'rename', gid })}
              onAct={act}
            />
          ))
        )}
      </main>

      <footer className="so-out-bar">
        <p>
          <b>{t('好了 {0} 个项目', [readyGs.length])}</b>
          <span>
            {t('{0} 张照片', [readyPhotos])}
            {savedN > 0 && ' · ' + t('已存 {0} 个', [savedN])}
          </span>
        </p>
        <span className="so-sp" />
        <button type="button" className="btn-line small" data-sfx="open" disabled={!readyGs.length} onClick={() => setSheet({ type: 'out', mode: 'export' })}>
          <Download size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>{t('导出案例包')}</span>
        </button>
        <button type="button" className="btn-primary small" data-sfx="open" disabled={!readyGs.length} onClick={() => setSheet({ type: 'out', mode: 'save' })}>
          <Library size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>{t('存进案例库')}</span>
        </button>
      </footer>

      {sheet?.type === 'preview' && <Preview s={s} pool={poolRef.current} gid={sheet.gid} k0={sheet.k} onClose={() => setSheet(null)} />}
      {sheet?.type === 'room' && <RoomPicker key={sheet.k} s={s} gid={sheet.gid} k={sheet.k} anchor={sheet.anchor} onClose={() => setSheet(null)} onNext={(k) => nextRoom(sheet.gid, k)} />}
      {sheet?.type === 'rename' && <Rename s={s} gid={sheet.gid} onClose={() => setSheet(null)} />}
      {sheet?.type === 'merge' && (
        <MergePick
          s={s}
          gid={sheet.gid}
          onPick={(from, into) => {
            s.merge(into, from);
            setSheet(null);
            setToast({ msg: t('已经并进去了') });
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'help' && <Help onClose={() => setSheet(null)} />}
      {sheet?.type === 'ai' && <AiSheet s={s} pool={poolRef.current} offered={!!sheet.offered} onClose={() => setSheet(null)} onDone={(n) => setToast({ msg: t('AI 填好了 {0} 个项目', [n]) })} />}
      {sheet?.type === 'out' && <OutputSheet s={s} mode={sheet.mode} onClose={() => setSheet(null)} />}
      {toast && (
        <div key={toast.msg} className={`mg-toast ${toast.kind === 'error' ? 'is-error' : ''}`} role="status">
          {toast.msg}
        </div>
      )}
    </div>
  );
}
