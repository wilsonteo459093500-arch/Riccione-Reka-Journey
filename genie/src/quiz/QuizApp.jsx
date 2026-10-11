// 梦想家占卜 —— 主流程（状态机）。
// 路由：
//   quiz.html                    从头开始（?from=wilson&for=Peggy 预填陪同人 / 称呼）
//   quiz.html#bp=<编码档案>       打开一份分享出去的蓝图
//   quiz.html#id=<档案号>         打开本机存档里的蓝图

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Pangie from '../shared/Pangie.jsx';
import { BRAND, GUIDE } from '../shared/config.js';
import { CHAPTERS, STEPS, PAIRS, LIFE, APPLIANCES } from './flow.js';
import { buildProfile, saveToArchive, unpackJSON, findInArchive, storagePlan } from '../shared/profile.js';
import { profileText, postProfile } from '../shared/summary.js';
import { isMuted, setMuted, sfx } from '../shared/sound.js';
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
} from './steps.jsx';
import Reveal from './Reveal.jsx';
import Blueprint from './Blueprint.jsx';

const SESSION_KEY = 'genie.session.v1';

const INITIAL = {
  name: '',
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
  wishes: [],
  splurge: '',
  avoid: [],
  oneWish: '',
};

const ENTER_LINES = {
  pair: ['别想太多，3 秒！', '第一感觉最准 ✨', '跟着心走～', '不用解释，选就对了', '这题很多人会犹豫哦', '盼吉在看你的直觉 👀'],
  life: ['想象一个普通的星期六 ☀️', '说真话，盼吉不会笑你', '生活怎么过，家就怎么做'],
  shoes: '盼吉在数鞋子… 👀 大概就好',
  wardrobe: '衣柜是全屋定制的心脏 ❤️',
  books: '书和收藏，都是你的故事 📚',
  appliances: '小家电最爱抢台面了！',
  bulky: '这些大家伙，最常被忘记',
  ratio: '拖拖看，柜子会变哦 ✨',
  wishes: '只能三个哦，选最想要的 ✨',
  splurge: '钱要花在你最在乎的地方 💛',
  nogo: '讨厌的东西，盼吉一个都不会放进你的家 💣',
  onewish: '最后一句，盼吉会抄在蓝图上 ✍️',
};

function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (s && Array.isArray(s.answers?.wishes)) return s;
  } catch {
    /* ignore */
  }
  return null;
}

function parseRoute() {
  const h = location.hash.slice(1);
  if (h.startsWith('bp=')) return { kind: 'bp', packed: h.slice(3) };
  if (h.startsWith('id=')) return { kind: 'id', id: decodeURIComponent(h.slice(3)) };
  return { kind: 'play' };
}

function Constellation({ chapter }) {
  const idx = CHAPTERS.findIndex((c) => c.id === chapter);
  return (
    <div className="constellation" aria-label="进度">
      {CHAPTERS.map((c, i) => (
        <span key={c.id} className={`star ${i < idx ? 'done' : i === idx ? 'now' : ''}`} title={c.zh}>
          <i>✦</i>
          <em>{c.num}</em>
        </span>
      ))}
    </div>
  );
}

function TopBar({ chapter, onBack, canBack, progress }) {
  const [mute, setMute] = useState(isMuted());
  return (
    <header className="topbar">
      <button type="button" className="icon-btn" onClick={onBack} disabled={!canBack} aria-label="上一步">
        ←
      </button>
      <div className="brand">
        <b>{BRAND.app}</b>
        <span>{BRAND.by}</span>
      </div>
      {chapter ? <Constellation chapter={chapter} /> : <div className="constellation-ph" />}
      <div className="progress-pct" title="蓝图完成度">
        蓝图 {Math.round(progress * 100)}%
      </div>
      <button
        type="button"
        className="icon-btn"
        onClick={() => {
          setMuted(!mute);
          setMute(!mute);
        }}
        aria-label={mute ? '打开声音' : '静音'}
      >
        {mute ? '🔇' : '🔊'}
      </button>
    </header>
  );
}

function Companion({ mood, line, prop }) {
  return (
    <aside className="companion" aria-live="polite">
      <div className="bubble" key={line}>
        {line}
      </div>
      <Pangie mood={mood} prop={prop} size={118} />
    </aside>
  );
}

function Play({ onDone }) {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const saved = useMemo(loadSession, []);
  const [idx, setIdx] = useState(saved?.idx ?? 0);
  const [answers, setAnswers] = useState(() => saved?.answers || { ...INITIAL, name: params.get('for') || '' });
  const [pangie, setPangie] = useState({ mood: 'idle', line: '' });
  const [profile, setProfile] = useState(null);
  const reactTimer = useRef(null);

  const step = STEPS[idx];
  const host = params.get('from') || '';

  useEffect(() => {
    if (step.id === 'reveal') return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ idx, answers }));
    } catch {
      /* ignore */
    }
  }, [idx, answers, step.id]);

  const set = useCallback((patch) => setAnswers((a) => ({ ...a, ...patch })), []);
  const next = useCallback(() => setIdx((i) => Math.min(STEPS.length - 1, i + 1)), []);
  const back = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const say = useCallback((mood, line, ms = 1600) => {
    clearTimeout(reactTimer.current);
    setPangie({ mood, line });
    reactTimer.current = setTimeout(() => setPangie((p) => ({ ...p, mood: 'idle' })), ms);
  }, []);

  // 进入每一关时，盼吉说一句
  useEffect(() => {
    const [kind, sub] = step.id.split(':');
    let line = '';
    if (kind === 'pair') {
      const n = PAIRS.findIndex((p) => p.id === sub);
      line = ENTER_LINES.pair[n % ENTER_LINES.pair.length];
    } else if (kind === 'life') line = LIFE.find((l) => l.id === sub)?.whisper || ENTER_LINES.life[LIFE.findIndex((l) => l.id === sub) % 3];
    else line = ENTER_LINES[kind] || '';
    const ch = CHAPTERS.find((c) => c.id === step.chapter);
    setPangie({ mood: ch?.mode === 'slow' ? 'think' : 'idle', line });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step.id, step.chapter]);

  const finish = async (oneWish) => {
    const full = { ...answers, oneWish };
    const p = buildProfile(full, { host }, { PAIRS, LIFE });
    saveToArchive(p);
    postProfile(p, profileText(p, storagePlan(p.storage, APPLIANCES)));
    setProfile(p);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    setIdx(STEPS.findIndex((s) => s.id === 'reveal'));
  };

  const answered = STEPS.slice(0, idx).filter((s) => !s.interlude && s.chapter).length;
  const totalQ = STEPS.filter((s) => !s.interlude && s.chapter).length;
  const progress = answered / totalQ;

  let body = null;
  const [kind, sub] = step.id.split(':');
  const pairIdx = PAIRS.findIndex((p) => p.id === sub);
  const lifeIdx = LIFE.findIndex((l) => l.id === sub);
  const props = { answers, set, next, say };

  if (step.id === 'welcome') body = <Welcome {...props} />;
  else if (step.id === 'lamp') body = <LampRub next={next} name={answers.name} />;
  else if (step.interlude) body = <Interlude key={step.id} chapter={step.chapter} next={next} />;
  else if (kind === 'pair')
    body = (
      <PairStep
        key={step.id}
        pair={PAIRS[pairIdx]}
        index={pairIdx}
        total={PAIRS.length}
        onPick={(pick, ms, reaction) => {
          setAnswers((a) => ({ ...a, pairs: { ...a.pairs, [sub]: { pick, ms } } }));
          say(ms < 1600 ? 'wow' : 'happy', ms < 1600 ? `秒选！${reaction || ''}` : reaction || '收到 ✨', 900);
          setTimeout(next, 650);
        }}
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
        next={next}
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

  const showCompanion = !['welcome', 'lamp', 'reveal'].includes(step.id) && !step.interlude;
  const chapter = CHAPTERS.find((c) => c.id === step.chapter);

  return (
    <div className={`play chapter-${step.chapter || 'none'} mode-${chapter?.mode || 'none'}`}>
      <TopBar chapter={step.chapter} onBack={back} canBack={idx > 0 && step.id !== 'reveal'} progress={step.id === 'reveal' ? 1 : progress} />
      <main className="stage" key={step.id}>
        {body}
      </main>
      {showCompanion && <Companion mood={pangie.mood} line={pangie.line} prop={step.chapter === 'treasure' ? 'magnifier' : 'ball'} />}
    </div>
  );
}

export default function QuizApp() {
  const [route, setRoute] = useState(parseRoute);
  const [profile, setProfile] = useState(null);
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState('');
  const [round, setRound] = useState(0);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    let alive = true;
    if (route.kind === 'bp') {
      unpackJSON(route.packed)
        .then((p) => alive && (p?.code ? setProfile(p) : setError('这条蓝图链接打不开，可能复制时少了一截。')))
        .catch(() => alive && setError('这条蓝图链接打不开，可能复制时少了一截。'));
    } else if (route.kind === 'id') {
      const p = findInArchive(route.id);
      p ? setProfile(p) : setError('这台设备上找不到这份蓝图。');
    }
    return () => {
      alive = false;
    };
  }, [route]);

  const restart = () => {
    setProfile(null);
    setFresh(false);
    setError('');
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    history.replaceState(null, '', location.pathname + location.search);
    setRoute({ kind: 'play' });
    setRound((r) => r + 1);
    sfx.tap();
  };

  if (error)
    return (
      <div className="play">
        <main className="stage">
          <div className="step center">
            <Pangie mood="think" size={170} />
            <h2 className="h-title">{error}</h2>
            <button type="button" className="btn-gold" onClick={restart}>
              重新占卜
            </button>
          </div>
        </main>
      </div>
    );

  if (profile) return <Blueprint profile={profile} fresh={fresh} onRestart={restart} />;
  if (route.kind !== 'play')
    return (
      <div className="play">
        <main className="stage">
          <div className="step center">
            <Pangie mood="mystic" size={150} />
            <p className="lead center">{GUIDE.name}正在打开蓝图…</p>
          </div>
        </main>
      </div>
    );
  return (
    <Play
      key={round}
      onDone={(p) => {
        setFresh(true);
        setProfile(p);
        window.scrollTo(0, 0);
      }}
    />
  );
}

