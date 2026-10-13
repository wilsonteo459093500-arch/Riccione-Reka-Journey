// 许愿之旅 —— 主流程（状态机）。
// 路由：
//   quiz.html                    从头开始（?from=wilson&for=Peggy 预填陪同人 / 称呼）
//   quiz.html#bp=<编码档案>       打开一份分享出去的蓝图（?staff=1 才有设计师版）
//   quiz.html#id=<档案号>         打开本机存档里的蓝图
//   ?mode=wish                   在许愿模式外壳里（外壳管音乐、员工区、语言）
//
// 视觉：白天的纸 + 风景（每一章一个地方）；擦神灯、章节翻牌、揭晓进入暮色（.dusk）。
// 声音：每一下触碰都有声音（main.jsx 的 installSfx）；潘吉说她的台词（voice.js，对话泡泡 = 她说的那一句）；
// 单独打开时自己放背景音乐（moments.js 的 zen，跟着每一章换曲子），许愿模式里外壳放，这里只用 tellShell 告诉外壳。

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Volume2, VolumeX, RotateCcw, Play as PlayIcon, MessageCircleMore, MessageCircleOff } from 'lucide-react';
import Pangie, { useTalking, useVoiceOn } from '../shared/Pangie.jsx';
import LangToggle from '../shared/LangToggle.jsx';
import { BRAND, CONFIG } from '../shared/config.js';
import { CHAPTERS, STEPS, PAIRS, LIFE, APPLIANCES, WISHES } from './flow.js';
import { buildProfile, saveToArchive, unpackJSON, findInArchive, storagePlan } from '../shared/profile.js';
import { profileText, postProfile } from '../shared/summary.js';
import { isMuted, setMuted, sfx } from '../shared/sound.js';
import { isWishMode, tellShell } from '../shared/zen.js';
import { voice, lineText, talkState } from '../shared/voice.js';
import fx from '../shared/fx.js';
import { t, tj, guideName, setLang } from '../shared/i18n.js';
import { cue, zen, startMusic } from './moments.js';
import { Odo } from './ui.jsx';
import Scenery, { usesPhoto } from './Scenery.jsx';
import { sceneFor } from './scenes.js';
import Stones from './Stones.jsx';
import { keepWords } from './typo.jsx';
import {
  Welcome,
  LampRub,
  Interlude,
  PairStep,
  LifeStep,
  ShoesStep,
  WardrobeStep,
  BooksStep,
  AppliancesStep,
  BulkyStep,
  RatioStep,
  WishesStep,
  SplurgeStep,
  NogoStep,
  OneWishStep,
  shuffled,
} from './steps.jsx';
import Reveal from './Reveal.jsx';
import Blueprint from './Blueprint.jsx';

const SESSION_KEY = 'genie.session.v1';
const STALE_MS = 10 * 60 * 1000;
const WISH = isWishMode();
/** 网址带 ?staff=1（员工打开存档的蓝图）。Blueprint.jsx 在载入时就定下了员工身份 → 换下一位客人时要整页重新载入 */
const STAFF_URL = (() => {
  try {
    return new URLSearchParams(location.search).get('staff') === '1';
  } catch {
    return false;
  }
})();
const DUSK_STEPS = new Set(['lamp', 'reveal']);

const initialAnswers = (name = '') => ({
  name,
  players: 'solo',
  pairs: {},
  life: {},
  shoes: 30,
  wardrobeDoors: 3,
  wardrobeFit: 'ok',
  longHang: 'some',
  books: 4,
  appliances: [],
  bulky: [],
  ratio: 25,
  ratioTouched: false,
  touched: {},
  wishes: [],
  wishOrder: shuffled(WISHES.map((w) => w.v)),
  splurge: '',
  avoid: [],
  oneWish: '',
});

// 只有字、不出声的泡泡（直觉题上她绝不开口；星期六那一题和章节牌重复；愿望页的提示）
const ENTER_LINES = {
  pair: ['第一眼喜欢哪个？', '第一感觉最准 ✨', '跟着心走～', '不用解释，选就对了', '看图就好，没有对错 🌿', '潘吉在看你的直觉 👀'],
  life: ['想象一个普通的星期六 ☀️'],
  wishes: '只能三个哦，选最想要的 ✨',
};
// 进到这一题，潘吉说的那一句（voice-lines.js）：泡泡里的字 = lineText(id)，和她说的一字不差（声音 SPEC §6.2）
const ENTER_VOICE = {
  'life:home': 'life.home',
  'life:cook': 'life.cook',
  'life:bell': 'life.bell',
  'life:who': 'life.who',
  shoes: 'tr.shoes',
  wardrobe: 'tr.wardrobe',
  books: 'tr.books',
  appliances: 'tr.appliances',
  bulky: 'tr.bulky',
  ratio: 'tr.ratio',
  splurge: 'wishes.splurge',
  nogo: 'nogo.enter',
  onewish: 'onewish.enter',
};

/** 潘吉的对话泡泡里不放 emoji（安静一点、精致一点） */
const plain = (s) =>
  String(s || '')
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/\s+([！？。，])/g, '$1')
    .trim();

function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (s && Array.isArray(s.answers?.wishes)) return s;
  } catch {
    /* ignore */
  }
  return null;
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function parseRoute() {
  const h = location.hash.slice(1);
  if (h.startsWith('bp=')) return { kind: 'bp', packed: h.slice(3) };
  if (h.startsWith('id=')) return { kind: 'id', id: decodeURIComponent(h.slice(3)) };
  return { kind: 'play' };
}

function TopBar({ chapter, sub, onBack, canBack, progress, done }) {
  const [mute, setMute] = useState(isMuted());
  const [voiceOn, setVoiceOn] = useVoiceOn();
  const pct = Math.round(progress * 100);
  // 一个静音：按钮音效 + 背景音乐 + 潘吉说话一起（单独打开的许愿之旅；许愿模式里外壳管）
  const toggleMute = () => {
    const m = !mute;
    setMuted(m);
    setMute(m);
    voice.setMuted(m);
    if (zen) {
      zen.setMuted(m);
      if (!m && !zen.running) startMusic(); // 开始时是静音的：现在在这一下里开音乐（接着这一章的曲子）
    }
  };
  return (
    <header className="topbar">
      <div className="tb-left">
        {/* 神灯、章节牌上也有这个按钮，那里没有「题」：叫「返回」 */}
        <button type="button" className="nav-back" onClick={onBack} disabled={!canBack} aria-label={t('返回')}>
          <ChevronLeft size={22} strokeWidth={2} aria-hidden="true" />
          <span>{t('返回')}</span>
        </button>
        <div className="brand tb-brand">
          <b>{BRAND.app}</b>
          <span>{BRAND.by}</span>
        </div>
      </div>
      <div className="tb-mid">
        <Stones chapter={chapter} sub={sub} done={done} />
      </div>
      <div className="tb-right">
        <span className="progress-pct" title={t('蓝图完成度')} role="img" aria-label={t('蓝图 {0}%', [pct])}>
          {/* 宽屏：一行字；手机：一个小圆环（中间是百分比），省一整行 */}
          <svg className="pct-ring" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15.5" className="pct-track" />
            <circle cx="18" cy="18" r="15.5" className="pct-fill" pathLength="100" style={{ strokeDashoffset: 100 - pct }} />
          </svg>
          {/* 百分比像里程表一样滚上去 */}
          <span className="pct-num" aria-hidden="true">
            <Odo value={pct} />
            <small>%</small>
          </span>
          <span className="pct-text" aria-hidden="true">
            {tj('蓝图 {0}%', [<Odo key="n" value={pct} />])}
          </span>
        </span>
        <LangToggle compact />
        {/* 潘吉说话（记在这台设备上）：开 / 关 —— 字幕（对话泡泡）照常 */}
        {!WISH && (
          <button
            type="button"
            className="icon-btn tb-voice"
            data-sfx="toggle"
            onClick={() => setVoiceOn(!voiceOn)}
            aria-label={t('潘吉说话')}
            aria-pressed={voiceOn}
          >
            {voiceOn ? <MessageCircleMore size={20} strokeWidth={1.8} /> : <MessageCircleOff size={20} strokeWidth={1.8} />}
          </button>
        )}
        {!WISH && (
          <button type="button" className="icon-btn" onClick={toggleMute} aria-label={mute ? t('打开声音') : t('静音')} aria-pressed={mute}>
            {mute ? <VolumeX size={20} strokeWidth={1.8} /> : <Volume2 size={20} strokeWidth={1.8} />}
          </button>
        )}
      </div>
    </header>
  );
}

const SMALL = '(max-width: 560px)';
// 潘吉和他的话泡泡不能盖住的东西：能点的，还有算出来的结果（.calc）、小标题（.field-label）
const TAPPABLE =
  '.stage button, .stage input, .stage textarea, .stage a[href], .stage [role="button"], .stage [role="slider"], .stage .calc, .stage .field-label';
const overlaps = (a, b) => a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 2 && a.bottom > b.top + 2;
/** 「探头」时往下缩掉的比例（和 quiz.css 的 .companion.is-peek 一致） */
const PEEK = 0.58;

/**
 * 话泡泡收窄到「刚好」：先按最大宽度排，再找出行数不变的最窄宽度 —— 两行一样长，
 * 不会有一个字孤零零掉在第二行（「心 / 脏」），泡泡也不会右边空一大块。
 */
function fitBubble(el) {
  if (!el) return;
  el.style.width = '';
  const cs = getComputedStyle(el);
  const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const lh = parseFloat(cs.lineHeight) || 21;
  const h = el.offsetHeight;
  if (h - pad < lh * 1.5) return; // 一行：本来就刚好
  let lo = el.offsetWidth / 2;
  let hi = el.offsetWidth;
  for (let k = 0; k < 9 && hi - lo > 1; k++) {
    const mid = (lo + hi) / 2;
    el.style.width = `${mid}px`;
    if (el.offsetHeight > h) lo = mid;
    else hi = mid;
  }
  el.style.width = `${Math.ceil(hi)}px`;
}

/** 每次量的时候现拿一次（题目卡里的东西会变：选了答案、结果多一行） */
function tappableRects() {
  const out = [];
  for (const el of document.querySelectorAll(TAPPABLE)) {
    const q = el.getBoundingClientRect();
    if (q.width && q.height) out.push(q);
  }
  return out;
}

/**
 * 潘吉陪在右下角。他的话泡泡绝不盖住能点的东西、也不盖住算出来的结果：
 * 每次说话前先量一下（题目卡刚换上来时等它落定），撞到就不说；滚动、题目卡变高（选了答案、结果多一行）时再量；
 * 手机上第一下点击就收起、几秒后也自己收起。
 * 他自己也一样：身子挡到 → 往下缩成「探头」；连头都挡到 → 整个躲到下面，滚到空的地方再出来。
 */
function Companion({ mood, line, prop, stepId, speaker = true }) {
  const text = plain(line);
  // 她在说话：身子和泡泡可以点（点一下 = 跳过这一句）；手机上说完之前泡泡不自己收起来
  const talking = useTalking();
  const [show, setShow] = useState(false);
  const [pose, setPose] = useState('up'); // up | peek | away
  const bubble = useRef(null);
  const body = useRef(null);
  const enteredAt = useRef(performance.now());
  const hits = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (!r.width) return false;
    return tappableRects().some((q) => overlaps(q, r));
  };
  // 话泡泡排好后、量会不会撞到东西之前，先收窄到刚好（字体晚到 / 转屏时再收一次）
  useLayoutEffect(() => {
    if (!text) return undefined;
    const fit = () => fitBubble(bubble.current);
    fit();
    document.fonts?.ready.then(fit).catch(() => {});
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [text]);
  useEffect(() => {
    enteredAt.current = performance.now();
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // 站着时的位置：offset* 不受 transform 影响（探头 / 躲下去的动画进行中也量得准）
        const el = body.current;
        const box = el?.offsetParent?.getBoundingClientRect();
        if (!el || !box || !el.offsetWidth) return;
        const left = box.left + el.offsetLeft;
        const top = box.top + el.offsetTop;
        const r = { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight, height: el.offsetHeight };
        const rects = tappableRects();
        if (!rects.some((q) => overlaps(q, r))) return setPose('up');
        // 探头时只露出上面那一截（头）：头也挡到 → 整个躲下去
        const head = { left: r.left, right: r.right, top: r.top + r.height * PEEK, bottom: Math.min(innerHeight, r.bottom + r.height * PEEK) };
        setPose(rects.some((q) => overlaps(q, head)) ? 'away' : 'peek');
      });
    };
    // 卡片落定后量一次；字体 / 图片晚到可能把卡片撑高，再量一次
    const t1 = setTimeout(measure, 700);
    const t2 = setTimeout(measure, 1600);
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    // 题目卡变高 / 变矮（选了「6 门以上」，结果那一行变成两行）：再量
    const card = document.querySelector('.stage > .step');
    const ro = typeof ResizeObserver === 'function' && card ? new ResizeObserver(measure) : null;
    ro?.observe(card);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [stepId]);
  useEffect(() => {
    setShow(false);
    if (!text) return undefined;
    const small = window.matchMedia?.(SMALL).matches;
    let raf = 0;
    const check = () => setShow(!hits(bubble.current) && !hits(body.current));
    // 题目卡换上来要 ~0.65 秒：等它落定再量
    const wait = Math.max(0, enteredAt.current + 680 - performance.now());
    const t1 = setTimeout(() => (raf = requestAnimationFrame(check)), wait);
    // 之后只会收起（滚动、题目卡变高后撞到了），不会自己又冒出来
    const recheck = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => hits(bubble.current) && setShow(false));
    };
    const hide = () => setShow(false);
    window.addEventListener('scroll', recheck, { passive: true });
    window.addEventListener('resize', recheck);
    const card = document.querySelector('.stage > .step');
    const ro = typeof ResizeObserver === 'function' && card ? new ResizeObserver(recheck) : null;
    ro?.observe(card);
    if (small) window.addEventListener('pointerdown', hide, true);
    let t2 = 0;
    const autoHide = () => {
      if (talkState.get() === 'pangie') t2 = setTimeout(autoHide, 600);
      else hide();
    };
    if (small) t2 = setTimeout(autoHide, wait + 3200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('scroll', recheck);
      window.removeEventListener('resize', recheck);
      window.removeEventListener('pointerdown', hide, true);
    };
  }, [text, stepId]);
  return (
    <aside className={`companion ${pose !== 'up' ? `is-${pose}` : ''} ${talking && speaker ? 'is-speaking' : ''}`} aria-live="polite">
      {text && (
        <div className={`bubble ${show && pose === 'up' ? 'is-shown' : ''}`} key={text} ref={bubble} data-voice-skip="">
          {keepWords(text)}
        </div>
      )}
      <span
        className="companion-body"
        ref={body}
        {...(talking && speaker ? { role: 'button', 'aria-label': t('跳过这一句'), 'data-fx-ripple': 'off', 'data-fx-depth': '0.96' } : {})}
      >
        <Pangie mood={mood} prop={prop} size={112} speaker={speaker} />
      </span>
    </aside>
  );
}

/** 一张安静的小卡片：潘吉 + 一句话 + 两个大按钮（闲置提示 / 继续上次的进度） */
function Prompt({ title, body, primary, secondary, speaker = false }) {
  return (
    <div className="prompt-veil" role="dialog" aria-modal="true" aria-label={title}>
      <div className="prompt">
        <Pangie mood="think" prop="none" size={104} float={false} speaker={speaker} />
        <h2 className="h-title">{title}</h2>
        {body && <p className="lead">{body}</p>}
        <div className="prompt-actions">
          {secondary}
          {primary}
        </div>
      </div>
    </div>
  );
}

function Countdown({ ms }) {
  const [left, setLeft] = useState(Math.ceil(ms / 1000));
  useEffect(() => {
    const end = Date.now() + ms;
    const id = setInterval(() => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 500);
    return () => clearInterval(id);
  }, [ms]);
  // 倒数的数字像里程表一样滚（不出声）
  return <>{tj('{0} 秒后，潘吉会为下一位客人重新开始。', [<Odo key="n" value={left} />])}</>;
}

function Play({ onDone, onRestart }) {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const saved = useMemo(() => {
    const s = loadSession();
    if (!s) return null;
    // 许愿模式：超过 10 分钟的旧进度 = 上一位客人留下的，直接重新开始
    if (WISH && s.idx > 0 && Date.now() - (s.ts || 0) > STALE_MS) {
      clearSession();
      return null;
    }
    return s;
  }, []);
  const [idx, setIdx] = useState(saved?.idx ?? 0);
  const [answers, setAnswers] = useState(() => {
    if (!saved?.answers) return initialAnswers(params.get('for') || '');
    const restored = { ...initialAnswers(), ...saved.answers };
    // 旧版本存下的进度没有这两个字段：保持 undefined（= 当作动过），不要替客人补成「没动过」
    if (saved.answers.ratioTouched === undefined) delete restored.ratioTouched;
    if (saved.answers.touched === undefined) delete restored.touched;
    return restored;
  });
  const [pangie, setPangie] = useState({ mood: 'idle', line: '' });
  const [resume, setResume] = useState(() => !WISH && !!saved && saved.idx > 0 && Date.now() - (saved.ts || 0) > STALE_MS);
  const [idlePrompt, setIdlePrompt] = useState(false);
  const [profile, setProfile] = useState(null);
  const reactTimer = useRef(null);

  const step = STEPS[idx];
  const host = params.get('from') || '';

  useEffect(() => {
    if (step.id === 'reveal') return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ idx, answers, ts: Date.now() }));
    } catch {
      /* ignore */
    }
  }, [idx, answers, step.id]);

  const set = useCallback((patch) => setAnswers((a) => ({ ...a, ...patch })), []);
  // 只在「还是同一题」时前进 / 后退：连点、过期的计时器都不会多跳一题
  const next = useCallback(() => setIdx((i) => (i === idx ? Math.min(STEPS.length - 1, i + 1) : i)), [idx]);
  // 走完一章的最后一题（下一页是章节牌）：「达成」—— 古筝的一段琶音（光点落进踏脚石的那一刻）
  const achieved = useRef(-1);
  const advance = useCallback(() => {
    const cur = STEPS[idx];
    const nx = STEPS[idx + 1];
    if (achieved.current !== idx && cur?.chapter && !cur.interlude && nx?.interlude) {
      achieved.current = idx;
      sfx.play('achievement');
    }
    next();
  }, [idx, next]);
  const back = useCallback(() => setIdx((i) => (i === idx ? Math.max(0, i - 1) : i)), [idx]);
  const say = useCallback((mood, line, ms = 1600) => {
    clearTimeout(reactTimer.current);
    setPangie({ mood, line });
    reactTimer.current = setTimeout(() => setPangie((p) => ({ ...p, mood: 'idle' })), ms);
  }, []);
  useEffect(() => () => clearTimeout(reactTimer.current), []);

  // 进入每一关时，潘吉说一句
  useEffect(() => {
    const [kind, sub] = step.id.split(':');
    const vid = ENTER_VOICE[step.id];
    let line = '';
    if (vid) line = lineText(vid);
    else if (kind === 'pair') {
      const n = PAIRS.findIndex((p) => p.id === sub);
      line = t(ENTER_LINES.pair[n % ENTER_LINES.pair.length]);
    } else if (kind === 'life') {
      const l = ENTER_LINES.life[LIFE.findIndex((x) => x.id === sub)];
      line = l ? t(l) : '';
    } else line = ENTER_LINES[kind] ? t(ENTER_LINES[kind]) : '';
    const ch = CHAPTERS.find((c) => c.id === step.chapter);
    setPangie({ mood: ch?.mode === 'slow' ? 'think' : 'idle', line });
    window.scrollTo(0, 0);
    // 音乐：章节牌 = 这一章的曲子 + 一声点缀；开场 = 《晨光》；神灯 = 《暮色》（许愿模式：告诉外壳；单独打开：自己的音乐）
    if (step.interlude) cue('chapter', { chapter: step.chapter });
    if (step.id === 'welcome') cue('page', { page: 'quiz' });
    if (step.id === 'lamp') cue('mood', { mood: 'dusk' });
    // 潘吉说这一题的那一句（题目卡落定后 0.7 秒）；离开这一题就停
    if (!vid) return undefined;
    voice.say(vid, { delay: 700 });
    return () => voice.stopIf(vid);
  }, [step.id, step.chapter, step.interlude]);

  // 「还在吗？」：潘吉问一句（在提示卡上的那只潘吉开口；右下角那只这时不说话）
  useEffect(() => {
    if (!idlePrompt) return undefined;
    voice.say('idle.still', { delay: 300 });
    return () => voice.stopIf('idle.still');
  }, [idlePrompt]);

  // 许愿模式：一题停了 3 分钟没人碰 → 「还在吗？」；再 30 秒没回应 → 告诉外壳换下一位客人。
  // 开场也一样，只要已经填了称呼 / 选了谁来许愿：客人走开了，名字不能留在框里等下一位客人。
  const welcomeDirty = idx === 0 && (!!String(answers.name || '').trim() || (answers.players || 'solo') !== 'solo');
  useEffect(() => {
    if (!WISH || (idx === 0 && !welcomeDirty) || step.id === 'reveal') return undefined;
    const { quizMs = 180000, promptMs = 30000 } = CONFIG.idle || {};
    let t1;
    let t2;
    let t3;
    const fire = () => {
      tellShell('idle-reset');
      // 没有外壳（直接打开 ?mode=wish）或外壳没回应：自己重新开始
      t3 = setTimeout(onRestart, window.parent === window ? 0 : 2500);
    };
    const arm = () => {
      clearTimeout(t1);
      clearTimeout(t2);
      t1 = setTimeout(() => {
        setIdlePrompt(true);
        t2 = setTimeout(fire, promptMs);
      }, quizMs);
    };
    const onAct = () => {
      setIdlePrompt(false);
      arm();
    };
    arm();
    window.addEventListener('pointerdown', onAct, true);
    window.addEventListener('keydown', onAct, true);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('pointerdown', onAct, true);
      window.removeEventListener('keydown', onAct, true);
    };
  }, [idx, step.id, onRestart, welcomeDirty]);

  const finish = async (oneWish) => {
    const full = { ...answers, oneWish };
    const p = buildProfile(full, { host }, { PAIRS, LIFE });
    saveToArchive(p);
    postProfile(p, profileText(p, storagePlan(p.storage, APPLIANCES)));
    setProfile(p);
    clearSession();
    setIdx(STEPS.findIndex((s) => s.id === 'reveal'));
  };

  const questions = STEPS.filter((s) => !s.interlude && s.chapter);
  const answered = STEPS.slice(0, idx).filter((s) => !s.interlude && s.chapter).length;
  const progress = step.id === 'reveal' ? 1 : answered / questions.length;
  const chQs = questions.filter((s) => s.chapter === step.chapter);
  const subProgress = chQs.length ? (chQs.findIndex((s) => s.id === step.id) + 1) / chQs.length : 0;

  let body = null;
  const [kind, sub] = step.id.split(':');
  const pairIdx = PAIRS.findIndex((p) => p.id === sub);
  const lifeIdx = LIFE.findIndex((l) => l.id === sub);
  const props = { answers, set, next: advance, say };

  if (step.id === 'welcome') body = <Welcome {...props} />;
  else if (step.id === 'lamp') body = <LampRub next={advance} name={answers.name} />;
  else if (step.interlude) body = <Interlude key={step.id} chapter={step.chapter} next={advance} />;
  else if (kind === 'pair')
    body = (
      <PairStep
        key={step.id}
        pair={PAIRS[pairIdx]}
        index={pairIdx}
        total={PAIRS.length}
        timed={(answers.players || 'solo') === 'solo'}
        onPick={(pick, ms, reaction, left) => {
          setAnswers((a) => ({ ...a, pairs: { ...a.pairs, [sub]: { pick, ms, left } } }));
          say('happy', reaction ? t(reaction) : t('收到 ✨'), 900);
        }}
        onDone={advance}
      />
    );
  else if (kind === 'life')
    body = (
      <LifeStep
        key={step.id}
        item={LIFE[lifeIdx]}
        index={lifeIdx}
        total={LIFE.length}
        value={answers.life[sub]}
        onChange={(v) => setAnswers((a) => ({ ...a, life: { ...a.life, [sub]: v } }))}
        next={advance}
      />
    );
  else if (step.id === 'shoes') body = <ShoesStep {...props} />;
  else if (step.id === 'wardrobe') body = <WardrobeStep {...props} />;
  else if (step.id === 'books') body = <BooksStep {...props} />;
  else if (step.id === 'appliances') body = <AppliancesStep {...props} />;
  else if (step.id === 'bulky') body = <BulkyStep {...props} />;
  else if (step.id === 'ratio') body = <RatioStep {...props} />;
  else if (step.id === 'wishes') body = <WishesStep {...props} />;
  else if (step.id === 'splurge') body = <SplurgeStep {...props} />;
  else if (step.id === 'nogo') body = <NogoStep {...props} />;
  else if (step.id === 'onewish') body = <OneWishStep {...props} finish={finish} />;
  else if (step.id === 'reveal' && profile) body = <Reveal profile={profile} onOpen={() => onDone(profile)} />;

  const dusk = DUSK_STEPS.has(step.id) || !!step.interlude;
  const scene = sceneFor(step);
  const nextScene = sceneFor(STEPS[idx + 1]);
  const showCompanion = !['welcome', 'lamp', 'reveal'].includes(step.id) && !step.interlude;
  const chapter = CHAPTERS.find((c) => c.id === step.chapter);

  useEffect(() => {
    document.body.classList.toggle('is-dusk', dusk);
    return () => document.body.classList.remove('is-dusk');
  }, [dusk]);

  return (
    <div className={`qz ${dusk ? 'dusk' : 'morning'} qz-${kind} mode-${chapter?.mode || 'none'} ${step.id === 'welcome' ? 'is-cover' : ''} ${usesPhoto(scene) ? 'on-photo' : ''} ${WISH ? 'is-wish' : ''}`}>
      <Scenery scene={scene} next={nextScene} />
      {step.id !== 'welcome' && (
        <TopBar
          chapter={step.chapter}
          sub={subProgress}
          onBack={back}
          canBack={idx > 0 && step.id !== 'reveal'}
          progress={progress}
          done={step.id === 'reveal'}
        />
      )}
      <main className={`stage ${showCompanion ? 'has-companion' : ''}`} key={step.id}>
        {body}
      </main>
      {showCompanion && (
        <Companion mood={pangie.mood} line={pangie.line} stepId={step.id} prop={step.chapter === 'treasure' ? 'magnifier' : 'ball'} speaker={!idlePrompt} />
      )}
      {idlePrompt && (
        <Prompt
          speaker
          title={t('还在吗？')}
          body={<Countdown ms={(CONFIG.idle || {}).promptMs || 30000} />}
          secondary={
            <button type="button" className="btn btn-line big" data-sfx="back" onClick={onRestart}>
              <RotateCcw size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{t('重新开始')}</span>
            </button>
          }
          primary={
            <button type="button" className="btn btn-primary big" onClick={() => setIdlePrompt(false)}>
              <PlayIcon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{t('继续')}</span>
            </button>
          }
        />
      )}
      {resume && (
        <Prompt
          title={answers.name ? t('继续 {0} 上次的进度？', [answers.name]) : t('继续上次的进度？')}
          body={t('也可以从头开始，给下一位客人。')}
          secondary={
            <button type="button" className="btn btn-line big" data-sfx="back" onClick={onRestart}>
              <RotateCcw size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{t('重新开始')}</span>
            </button>
          }
          primary={
            <button type="button" className="btn btn-primary big" onClick={() => setResume(false)}>
              <PlayIcon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{t('继续')}</span>
            </button>
          }
        />
      )}
    </div>
  );
}

export default function QuizApp() {
  const [route, setRoute] = useState(parseRoute);
  const [profile, setProfile] = useState(null);
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState('');
  const [round, setRound] = useState(0);
  // 许愿模式：员工区按了「设计师版」，蓝图还在打开中时先记着（客人正在玩的时候不记，免得结束时漏给客人）
  const [designerReq, setDesignerReq] = useState(false);
  const live = useRef({ profile: null, kind: route.kind });
  live.current = { profile, kind: route.kind };

  useEffect(() => {
    document.title = t('许愿之旅 · WISH by Riccione Reka');
  }, []);

  // 潘吉的声音：页面一打开就准备好（iPad 第一下触碰就能解锁）。单独打开时：她说话的时候背景音乐轻一点；
  // 切到别的 app / 锁屏 → 音乐停下来，回来接着放（许愿模式里这些都是外壳的事）
  useEffect(() => {
    voice.init();
    if (!zen) return undefined;
    const offDuck = voice.attachMusic(zen);
    const onVis = () => {
      if (!zen.running) return;
      if (document.hidden) zen.pause();
      else zen.resume();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      offDuck();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const restart = useCallback(() => {
    // 下一位客人：潘吉的「一位客人一次」的话（招呼、揭晓、蓝图）重新算；画布上的金尘清掉
    voice.newGuest();
    fx.reset();
    clearSession();
    try {
      // 下一位客人：不要带着上一位的称呼（?for=），也不能带着员工身份（?staff=1）和上一份蓝图（#…）
      const u = new URL(location.href);
      const staff = STAFF_URL || u.searchParams.has('staff');
      u.searchParams.delete('for');
      u.searchParams.delete('staff');
      if (staff) {
        // 员工身份在载入时就定下了（Blueprint 的 STAFF）：整页重新载入，下一位客人从干净的网址开始
        location.replace(u.pathname + u.search);
        return;
      }
      history.replaceState(null, '', u.pathname + u.search);
    } catch {
      /* ignore */
    }
    setProfile(null);
    setFresh(false);
    setError('');
    setMuted(false, { persist: false });
    voice.setMuted(false);
    zen?.setMuted(false);
    setDesignerReq(false);
    setRoute({ kind: 'play' });
    setRound((r) => r + 1);
    window.scrollTo(0, 0);
  }, []);
  const restartRef = useRef(restart);
  restartRef.current = restart;

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    // 许愿模式外壳 → 这一页
    const onMsg = (e) => {
      if (e.origin !== location.origin || e.data?.source !== 'genie-shell') return;
      const { type } = e.data;
      if (type === 'sfx') setMuted(!!e.data.muted, { persist: false });
      else if (type === 'restart') restartRef.current();
      else if (type === 'lang') setLang(e.data.lang);
      else if (type === 'designer' && (live.current.profile || live.current.kind !== 'play')) setDesignerReq(true);
    };
    window.addEventListener('message', onMsg);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('message', onMsg);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (route.kind === 'bp') {
      unpackJSON(route.packed)
        .then((p) => alive && (p?.code ? setProfile(p) : setError(t('这条蓝图链接打不开，可能复制时少了一截。'))))
        .catch(() => alive && setError(t('这条蓝图链接打不开，可能复制时少了一截。')));
    } else if (route.kind === 'id') {
      const p = findInArchive(route.id);
      p ? setProfile(p) : setError(t('这台设备上找不到这份蓝图。'));
    }
    return () => {
      alive = false;
    };
  }, [route]);

  if (error)
    return (
      <div className="qz morning is-plain">
        <main className="stage">
          <div className="step step-note">
            <Pangie mood="think" size={150} />
            <h2 className="h-title">{error}</h2>
            <button type="button" className="btn btn-gold big" onClick={restart}>
              <span>{t('重新许愿')}</span>
            </button>
          </div>
        </main>
      </div>
    );

  if (profile) {
    // 展厅里打开的蓝图（刚做完 / 本机存档 / 员工 / 带陪同人 ?from=）：结尾的按钮是「下一位」；客人在家打开分享的链接则是「重新许愿」
    const showroom = fresh || route.kind === 'id' || STAFF_URL || !!new URLSearchParams(location.search).get('from');
    return <Blueprint key={profile.id} profile={profile} fresh={fresh} onRestart={restart} designerOpen={designerReq} showroom={showroom} />;
  }
  if (route.kind !== 'play')
    return (
      <div className="qz morning is-plain">
        <main className="stage">
          <div className="step step-note">
            <Pangie mood="mystic" size={140} />
            <p className="lead center">{t('{0}正在打开蓝图…', [guideName()])}</p>
          </div>
        </main>
      </div>
    );
  return (
    <Play
      key={round}
      onRestart={restart}
      onDone={(p) => {
        setFresh(true);
        setDesignerReq(false);
        setProfile(p);
        // 留住做好的蓝图：返回 / 重新整理 / iPad 收掉分页后还在（Blueprint 打包好后会换成 #bp=…）
        try {
          history.replaceState(null, '', `${location.pathname}${location.search}#id=${encodeURIComponent(p.id)}`);
        } catch {
          /* ignore */
        }
        window.scrollTo(0, 0);
      }}
    />
  );
}
