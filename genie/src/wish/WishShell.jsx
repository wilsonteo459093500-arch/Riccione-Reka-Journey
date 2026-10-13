// 客户许愿模式的外壳（展厅 iPad）：
//   · 许愿之旅 → 揭晓 → 蓝图 → 3D 都在同一个 iframe 里换页；禅意曲子（src/shared/music/，垫着大自然的声音）由外壳播放，换页不会断。
//   · 子页面用 postMessage 报告进度（src/shared/zen.js 的 tellShell），音乐跟着变（音乐 SPEC §7，src/shared/music/moods.js 的
//     musicFor —— 单独打开的许愿之旅用同一套）：欢迎 / 生活 / 雷区《晨光》· 直觉《溪岸》（三秒的选择中间不会「叮」）·
//     宝藏 / 愿望《竹影》· 神灯 / 读懂你《暮色》（子页面发 mood）· 揭晓《星灯》· 蓝图《归家》×0.5 · 3D《归家》（天黑《归家·夜》）×0.25 ·
//     蓝图 / 3D 超过 CONFIG.idle.fadeMs 没人碰 → ×0.12，一碰就回来（CONFIG.wishDuck）。每个愿望的铃声是按钮音效负责（不响两次）。
//   · 潘吉说话（src/shared/voice.js）：外壳是唯一真的出声的地方（iPad 只解锁一次，活得比每一次 iframe 重新载入都久）；
//     iframe 里的许愿之旅只按编号要台词、自己动嘴（voice.serve）。她一开口音乐就让开（zen.talk：音乐 −7.5 dB、自然声 −2 dB）。
//   · 一个音乐小胶囊 → 面板：音量 · 静音（音乐 + 按钮音效 + 潘吉一起；只对这一位客人有效）·
//     三个开关：按钮音效 · 自然声 · 潘吉说话（「潘吉说话」记在这台设备上；下一位客人会复原成这一位开始时的样子）。
//     声音被系统暂停（锁屏、来电、切去 WhatsApp）时显示「轻触继续音乐」，那一下轻触先恢复声音。
//   · 员工区：长按 WISH 字标约 3 秒（有进度圈）→ 下一位客人 · 设计师版 · 结束许愿模式 · 语言。客人不会误触。
//   · 下一位客人：一道晨光扫过整个画面（fx.wipe dawn），光盖住的那一刻换成新的欢迎页；声音全部复原（音乐《晨光》、音量、
//     静音、按钮音效、自然声、潘吉）；潘吉说「谢谢你来许愿，下次见！」（闲置自动重来时不说：没人在）。
//     iframe 自己的「返回 / 前进」记录里不能留着上一位客人的页面（3D 会打开他的方案、底座写着他的名字）：
//     客人只要离开过第一个页面（进过 3D、从 3D 回到蓝图、换过语言 …），就把整个 <iframe> 重建（换 key），
//     连同它的浏览记录一起丢掉；只有一直停在第一个许愿之旅页面里的，才只发 {type:'restart'} 原地重新开始（展厅断网也能用）。
//   · 同源 iframe：每次载入都在子页面的 document 上挂监听 —— 客人的任何一下点击都顺便恢复音乐、算作「有人在用」。
//   · 动效（动效 SPEC §6.2）：每个按钮按下去都有光（main.jsx 的 fx.install）；面板从胶囊那一角弹出、收起时 180 ms 退回；
//     员工区打开时一道光扫过 WISH 字标；设计师版 = 那一行被光扫过 → 一道纸色的光换页。

import { useEffect, useRef, useState } from 'react';
import { RotateCcw, PencilRuler, Power, X, Play, Volume1, Volume2, VolumeX, AudioLines, Leaf, MessageCircleMore } from 'lucide-react';
import LangToggle from '../shared/LangToggle.jsx';
import { BRAND, CONFIG } from '../shared/config.js';
import { t, getLang, setLang, useLang } from '../shared/i18n.js';
import { applyMusic, musicFor, isNightHour } from '../shared/zen.js';
import { sfx } from '../shared/sfx.js';
import { voice } from '../shared/voice.js';
import { useVoiceOn } from '../shared/Pangie.jsx';
import fx from '../shared/fx.js';
import { bindZenLifecycle, releaseWake, exitFullscreen, startWish, wishStartUrl, MUSIC_DEFAULTS } from './start.js';
import { layersLabel } from './sounds.js';
import { useHold } from './useHold.js';

const PANEL_MS = 25000; // 面板开着没人碰，自己收起来
const PANEL_OUT_MS = 180; // 面板收起的那一下（动效 SPEC：180 ms ease-in）
const SESSION_KEY = 'genie.session.v1';
const PAGES = ['quiz', 'blueprint', 'studio'];
const LEVEL = { quiz: 1, blueprint: 'blueprint', studio: 'studio' }; // zen.duck() 认这几个名字（CONFIG.wishDuck）
const FADE_MS = CONFIG.idle?.fadeMs ?? 600000;

const isLive = (zen) => (typeof zen.isLive === 'function' ? zen.isLive() : !!(zen.running && zen.ctx?.state === 'running'));
const resume = (zen) => Promise.resolve(typeof zen.resume === 'function' ? zen.resume() : zen.ctx?.resume?.()).catch(() => false);
const duck = (zen, level, seconds) => zen.duck?.(level, seconds);

/** 面板关掉时多留 ms 毫秒（播收起的动画）：→ [现在要画哪一个面板, 是不是正在收起] */
function useLinger(value, ms) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (value) {
      setShown(value);
      return undefined;
    }
    const id = setTimeout(() => setShown(null), fx.motion.reduced ? 0 : ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return [value || shown, !value && !!shown];
}

/** 员工区的入口：长按 WISH 字标，一圈细线慢慢画满（3 秒）才打开；短按什么都不会发生（只有一声轻触） */
function HoldMark({ onDone, label, markRef }) {
  const { p, bind } = useHold(onDone);
  return (
    <button
      ref={markRef}
      type="button"
      data-fx="none"
      className={`ws-mark ${p > 0 ? 'is-holding' : ''} ${p >= 1 ? 'is-done' : ''}`}
      aria-label={label}
      {...bind}
    >
      <svg className="ws-ring" viewBox="0 0 88 44" aria-hidden="true">
        <path d="M44 1.5H66.5A20.5 20.5 0 0 1 66.5 42.5H21.5A20.5 20.5 0 0 1 21.5 1.5Z" pathLength="100" style={{ strokeDashoffset: 100 - p * 100 }} />
      </svg>
      <b>{BRAND.app}</b>
    </button>
  );
}

/** iOS 设置那样的一行开关：整行都可以按（按下去指尖有光，不缩放）；声音 = 打开 / 关闭（sfx 认 role=switch） */
function SwitchRow({ icon: Icon, label, on, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="ws-row" data-fx-depth="1" onClick={() => onChange(!on)}>
      <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
      <span className="ws-row-label">{label}</span>
      <span className="ws-switch" aria-hidden="true">
        <i />
      </span>
    </button>
  );
}

export default function WishShell({ zen, host = '', startLang, greet = false, onReady, onExit }) {
  useLang(); // 员工区换语言时外壳不重新载入，只重画
  const frame = useRef(null);
  const round = useRef(0);
  const makeUrl = (l, r = 0) => `${wishStartUrl(host)}&lang=${l}${r ? `&r=${r}` : ''}`;
  const [src, setSrc] = useState(() => makeUrl(startLang || getLang()));
  const [where, setWhere] = useState('quiz');
  const [panel, setPanel] = useState(null); // null | 'music' | 'staff'
  const [shownPanel, closing] = useLinger(panel, PANEL_OUT_MS);
  const [vol, setVol] = useState(() => zen.volume ?? MUSIC_DEFAULTS.volume);
  const [muted, setMuted] = useState(false);
  const [sfxOff, setSfxOff] = useState(false);
  const [nature, setNature] = useState(() => (zen.natureOn != null ? !!zen.natureOn : MUSIC_DEFAULTS.nature));
  const [voiceOn, setVoiceOn] = useVoiceOn();
  const [live, setLive] = useState(true);
  const [grace, setGrace] = useState(true); // 刚开始那两秒声音还在启动，不要闪「轻触继续音乐」
  const [dusk, setDusk] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [poke, setPoke] = useState(0); // 面板里有人在操作 → 重新计时

  const whereRef = useRef('quiz');
  const mutedRef = useRef(false);
  const sfxOffRef = useRef(false);
  const night = useRef(false); // 3D 里现在是不是晚上（《归家·夜》）
  const greetDue = useRef(!!greet); // 开场之后的第一个封面：潘吉打招呼（排在「来啦来啦！」后面）
  const voiceAtGuest = useRef(voice.enabled); // 这一位客人开始时「潘吉说话」开着吗（下一位客人复原成这样）
  const voiceBridge = useRef(null);
  const markRef = useRef(null);
  const lastAct = useRef(Date.now());
  const idleDucked = useRef(false);
  const restartFallback = useRef(0);
  const detachChild = useRef(null);
  const readySent = useRef(false);
  const leavingRef = useRef(false);
  const wiping = useRef(false);
  // 现在这个 <iframe> 载入过几个页面（重建 = 换 src / key 就从 0 算起）；len = 第一页载好时整个分页的浏览记录有几条
  const loads = useRef({ src: '', n: 0, len: 0 });

  const post = (msg) => {
    try {
      frame.current?.contentWindow?.postMessage({ source: 'genie-shell', ...msg }, location.origin);
    } catch {
      /* ignore */
    }
  };

  const markActive = () => {
    lastAct.current = Date.now();
    if (idleDucked.current) {
      idleDucked.current = false;
      duck(zen, LEVEL[whereRef.current], 1.5);
    }
  };

  // 按钮音效：外壳自己 + iframe 里的子页面一起（只管这一位客人，不写进本机）
  const syncSfx = () => {
    const off = mutedRef.current || sfxOffRef.current;
    sfx.setMuted(off, { persist: false });
    post({ type: 'sfx', muted: off });
  };

  /** 一个静音管全部：音乐、按钮音效、潘吉 */
  const setMute = (m) => {
    mutedRef.current = m;
    setMuted(m);
    zen.setMuted(m);
    voice.setMuted(m);
    syncSfx();
  };

  const setSfx = (on) => {
    sfxOffRef.current = !on;
    setSfxOff(!on);
    syncSfx();
  };

  const setNatureOn = (on) => {
    setNature(on);
    zen.setNature?.(on);
  };

  const greetIfDue = () => {
    if (!greetDue.current) return;
    greetDue.current = false;
    voice.say('welcome.hello', { mode: 'queue', delay: 900 });
  };

  const goPage = (p) => {
    if (!PAGES.includes(p)) return;
    whereRef.current = p;
    setWhere(p);
    idleDucked.current = false;
    lastAct.current = Date.now();
    if (p === 'quiz') {
      clearTimeout(restartFallback.current);
      greetIfDue();
    }
    applyMusic(zen, musicFor('page', { page: p, night: night.current }));
  };

  const reloadFrame = () => {
    round.current += 1;
    setSrc(makeUrl(getLang(), round.current));
  };

  /** 声音全部回到一位新客人的样子（在手指里调用：iOS 上顺便把被暂停的声音接回来） */
  const resetSound = () => {
    sfxOffRef.current = false;
    setSfxOff(false);
    setMute(false);
    const v = MUSIC_DEFAULTS.volume;
    setVol(v);
    zen.setVolume(v);
    setNatureOn(MUSIC_DEFAULTS.nature);
    if (voice.enabled !== voiceAtGuest.current) setVoiceOn(voiceAtGuest.current);
    night.current = false;
    idleDucked.current = false;
    lastAct.current = Date.now();
    applyMusic(zen, musicFor('page', { page: 'quiz' })); // 《晨光》、原音量
    if (zen.running && !isLive(zen)) resume(zen).then(() => setLive(isLive(zen)));
  };

  /** 换成新的欢迎页（一道晨光盖住画面的那一刻做） */
  const restartChild = () => {
    clearTimeout(restartFallback.current);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    let quizChild = false;
    try {
      quizChild = /quiz/.test(frame.current.contentWindow.location.pathname);
    } catch {
      /* ignore */
    }
    // 一直没离开过第一个页面 = iframe 没有浏览记录可以「返回 / 前进」到上一位客人的蓝图或 3D
    // （浏览记录变长了 = 页面里也加过记录，例如 #… 锚点：一样重建）
    const firstPage = loads.current.src === src && loads.current.n <= 1 && history.length <= loads.current.len;
    if (whereRef.current !== 'studio' && quizChild && firstPage) {
      post({ type: 'restart' });
      // 子页面回到欢迎页会报 page:'quiz'；2.5 秒还没回音（旧版本 / 卡住）才重新载入
      restartFallback.current = setTimeout(reloadFrame, 2500);
    } else reloadFrame(); // 新的 <iframe>：上一位客人的浏览记录跟着旧的那个一起丢掉
    whereRef.current = 'quiz';
    setWhere('quiz');
  };

  /** 下一位客人。goodbye：员工按的（潘吉道别）；闲置自动重来时没人在，不说 */
  const nextGuest = ({ goodbye = true } = {}) => {
    if (wiping.current || leavingRef.current) return;
    wiping.current = true;
    setPanel(null);
    const wasMuted = mutedRef.current;
    resetSound();
    voice.newGuest();
    greetDue.current = false; // 下一位客人：封面自己在第一下轻触时打招呼
    voiceAtGuest.current = voice.enabled;
    if (goodbye && !wasMuted) voice.say('bye.next');
    const w = fx.wipe(null, { tone: 'dawn', duration: 1000 });
    w.mid.then(() => {
      fx.reset();
      restartChild();
    });
    w.done.then(() => {
      wiping.current = false;
    });
  };

  const openDesigner = (e) => {
    const row = e?.currentTarget;
    if (row) fx.scan(row, { sound: null });
    // 光扫过那一行 → 面板收起 → 一道纸色的光换页，光盖住的那一刻蓝图换成设计师版
    fx.clock.after(260, () => {
      setPanel(null);
      const w = fx.wipe(null, { tone: 'paper', duration: 820 });
      w.mid.then(() => post({ type: 'designer' }));
    });
  };

  const pickLang = (l) => {
    setLang(l, { reload: false });
    post({ type: 'lang', lang: l });
    setPoke((n) => n + 1);
    // 子页面没接住（还没支持 lang 消息）就自己带 ?lang= 重新载入它（进度在 sessionStorage / localStorage，不会丢）
    setTimeout(() => {
      try {
        const w = frame.current?.contentWindow;
        const d = w?.document;
        const cur = /^en/i.test(d?.documentElement?.lang || '') ? 'en' : 'zh';
        if (cur !== l && d?.readyState === 'complete') {
          const u = new URL(w.location.href);
          u.searchParams.set('lang', l);
          w.location.replace(u.href);
        }
      } catch {
        /* ignore */
      }
    }, 1600);
  };

  const endWish = async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setPanel(null);
    voice.cancel();
    fx.wipe(null, { tone: 'paper', duration: 900 }); // 一道纸色的光，外壳在它后面淡成纸色
    setLeaving(true);
    try {
      await zen.stop(1.5); // 音乐 1.5 秒淡出（zen.stop 也会放开屏幕常亮）
    } catch {
      /* ignore */
    }
    releaseWake();
    exitFullscreen();
    onExit?.();
  };

  const openStaff = () => {
    sfx.play('open'); // 按满 3 秒的那一刻（按下去的那一下已经「笃」过了）
    if (markRef.current) fx.scan(markRef.current, { sound: null });
    setPanel('staff');
  };

  const onPill = () => {
    markActive();
    if (!zen.running) {
      startWish(); // 声音根本没开起来（极少见）：就在这一下轻触里开
      return;
    }
    if (!mutedRef.current && !isLive(zen)) {
      resume(zen).then(() => setLive(isLive(zen)));
      return;
    }
    setPanel((p) => (p === 'music' ? null : 'music'));
  };

  // 子页面的消息 → 音乐 / 换页 / 潘吉（用 ref 拿最新的函数）
  const onChild = useRef(null);
  onChild.current = (d) => {
    if (d.type === 'voice') voiceBridge.current?.handle(d);
    else if (d.type === 'page') goPage(d.page);
    else if (d.type === 'mood' || d.type === 'chapter' || d.type === 'reveal') applyMusic(zen, musicFor(d.type, d));
    else if (d.type === 'time') {
      night.current = isNightHour(d.hour);
      if (whereRef.current === 'studio') applyMusic(zen, musicFor('time', d));
    } else if (d.type === 'idle-reset') nextGuest({ goodbye: false });
    // 'wish'：每个愿望的铃声是按钮音效 wishAdd（客人按下去的那一下），音乐不再响自己的铃
  };

  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== location.origin || e.data?.source !== 'genie') return;
      if (frame.current && e.source && e.source !== frame.current.contentWindow) return;
      onChild.current(e.data);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // 开始：这一位客人有声音、《晨光》、原音量；锁屏 / 切 app → 暂停，回来 → 恢复
  useEffect(() => {
    zen.setMuted(false);
    zen.setMood('calm');
    duck(zen, 1, 0.5);
    sfx.setMuted(false, { persist: false, confirm: false });
    voice.setMuted(false);
    const unbind = bindZenLifecycle(zen);
    const g = setTimeout(() => setGrace(false), 2500);
    return () => {
      unbind?.();
      clearTimeout(g);
      clearTimeout(restartFallback.current);
      detachChild.current?.();
    };
  }, [zen]);

  // 潘吉：替 iframe 里的页面说话；她开口时音乐让开（叠在页面的音量上：蓝图 0.5、3D 0.25、闲置 0.12）
  useEffect(() => {
    const vb = voice.serve(post);
    voiceBridge.current = vb;
    const offDuck = voice.attachMusic(zen, { pageLevel: () => (idleDucked.current ? 'idle' : LEVEL[whereRef.current]) });
    return () => {
      vb.off();
      if (voiceBridge.current === vb) voiceBridge.current = null;
      offDuck();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zen]);

  // 声音是不是真的在出声：onState 一变就更新；再加一个慢轮询兜底
  useEffect(() => {
    const prev = zen.onState;
    const upd = () => setLive(isLive(zen));
    zen.onState = (s) => {
      try {
        prev?.(s);
      } catch {
        /* ignore */
      }
      upd();
    };
    const id = setInterval(upd, 1500);
    document.addEventListener('visibilitychange', upd);
    upd();
    return () => {
      zen.onState = prev;
      clearInterval(id);
      document.removeEventListener('visibilitychange', upd);
    };
  }, [zen]);

  // 蓝图 / 3D：很久没人碰 → 音乐淡到很小（不清空页面，设计师可能对着讲很久）；一碰就回来
  useEffect(() => {
    const onAct = () => markActive();
    window.addEventListener('pointerdown', onAct, true);
    window.addEventListener('keydown', onAct, true);
    const id = setInterval(() => {
      const w = whereRef.current;
      if ((w === 'blueprint' || w === 'studio') && !idleDucked.current && Date.now() - lastAct.current > FADE_MS) {
        idleDucked.current = true;
        duck(zen, 'idle', 8);
      }
    }, 3000);
    return () => {
      window.removeEventListener('pointerdown', onAct, true);
      window.removeEventListener('keydown', onAct, true);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zen]);

  // 面板开着没人碰就自己收起来（员工区不会一直开着给客人看到）
  useEffect(() => {
    if (!panel) return undefined;
    const id = setTimeout(() => setPanel(null), PANEL_MS);
    return () => clearTimeout(id);
  }, [panel, poke]);

  const onLoad = () => {
    const f = frame.current;
    if (!f) return;
    if (loads.current.src !== src) loads.current = { src, n: 0, len: 0 };
    loads.current.n += 1;
    if (loads.current.n === 1) loads.current.len = history.length;
    detachChild.current?.();
    detachChild.current = null;
    let win = null;
    let doc = null;
    try {
      win = f.contentWindow;
      doc = f.contentDocument;
    } catch {
      /* ignore */
    }
    if (!readySent.current) {
      readySent.current = true;
      onReady?.();
    }
    if (!win || !doc) return;
    try {
      if (/studio/.test(win.location.pathname)) goPage('studio');
      else if (!/(^|[#&])(bp|id)=/.test(win.location.hash.slice(1)) && whereRef.current !== 'quiz') goPage('quiz');
    } catch {
      /* ignore */
    }
    // 客人用子页面自己的「中 / EN」换了语言：外壳跟着换（不重新载入）
    try {
      const cl = /^en/i.test(doc.documentElement.lang || '') ? 'en' : 'zh';
      if (cl !== getLang()) setLang(cl, { reload: false });
    } catch {
      /* ignore */
    }
    post({ type: 'sfx', muted: mutedRef.current || sfxOffRef.current });

    const onUp = () => {
      if (!isLive(zen)) resume(zen).then(() => setLive(isLive(zen)));
      markActive();
    };
    const onAct = () => markActive();
    const wheel = { capture: true, passive: true };
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('pointerdown', onAct, true);
    doc.addEventListener('keydown', onAct, true);
    doc.addEventListener('wheel', onAct, wheel);
    // 仪式时刻（擦神灯、翻牌、揭晓）子页面进入暮色：胶囊跟着换成夜色玻璃
    let mo = null;
    const body = doc.body;
    const readDusk = () => setDusk(!!body?.classList.contains('is-dusk'));
    if (body) {
      mo = new MutationObserver(readDusk);
      mo.observe(body, { attributes: true, attributeFilter: ['class'] });
    }
    readDusk();
    detachChild.current = () => {
      doc.removeEventListener('pointerup', onUp, true);
      doc.removeEventListener('pointerdown', onAct, true);
      doc.removeEventListener('keydown', onAct, true);
      doc.removeEventListener('wheel', onAct, wheel);
      mo?.disconnect();
    };
  };

  const playing = live && !muted;
  const stalled = !muted && !live && !grace && !leaving;
  const pillLabel = stalled ? t('轻触继续音乐') : muted ? t('已静音') : t('自然之声');
  const tone = dusk ? 'dusk' : '';
  const popCls = (kind) => `ws-pop ws-${kind} ${tone} ${closing ? 'is-closing' : ''}`;

  return (
    <div className={`ws ws-${where} ${dusk ? 'is-dusk' : ''} ${leaving ? 'is-leaving' : ''}`}>
      <iframe ref={frame} key={src} src={src} title={t('WISH 许愿模式')} className="ws-frame" onLoad={onLoad} allow="fullscreen; autoplay; clipboard-write" />

      <div className={`ws-dock ${tone}`}>
        <HoldMark label={t('员工区：按住 3 秒')} markRef={markRef} onDone={openStaff} />
        <button
          type="button"
          className={`ws-pill ${stalled ? 'is-stalled' : ''} ${muted ? 'is-muted' : ''}`}
          onClick={onPill}
          aria-expanded={panel === 'music'}
          aria-label={stalled ? t('轻触继续音乐') : t('音乐')}
          data-sfx={stalled ? 'tap' : undefined}
        >
          {stalled ? (
            <Play size={15} strokeWidth={2.2} className="ws-play" aria-hidden="true" />
          ) : muted ? (
            <VolumeX size={18} strokeWidth={1.9} className="ws-muted-ico" aria-hidden="true" />
          ) : (
            <span className={`ws-bars ${playing ? 'on' : ''}`} aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          )}
          <span className="ws-pill-label">{pillLabel}</span>
        </button>
      </div>

      {shownPanel && <div className={`ws-scrim ${shownPanel} ${closing ? 'is-closing' : ''}`} onPointerDown={() => setPanel(null)} />}

      {shownPanel === 'music' && (
        <div className={popCls('music')} role="dialog" aria-label={t('自然之声')} onPointerDown={() => setPoke((n) => n + 1)}>
          <header className="ws-pop-head">
            <div>
              <b>{t('自然之声')}</b>
              <span>{layersLabel()}</span>
            </div>
            <button type="button" className="ws-x" onClick={() => setPanel(null)} aria-label={t('关闭')}>
              <X size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </header>
          <label className="ws-vol">
            <Volume1 size={18} strokeWidth={1.8} aria-hidden="true" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={vol}
              aria-label={t('音量')}
              style={{ '--v': `${Math.round(vol * 100)}%` }}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVol(v);
                zen.setVolume(v);
                if (mutedRef.current && v > 0) setMute(false);
              }}
            />
            <Volume2 size={18} strokeWidth={1.8} aria-hidden="true" />
          </label>
          <button type="button" className={`ws-mute ${muted ? 'is-on' : ''}`} aria-pressed={muted} onClick={() => setMute(!muted)}>
            {muted ? <Volume2 size={18} strokeWidth={1.8} aria-hidden="true" /> : <VolumeX size={18} strokeWidth={1.8} aria-hidden="true" />}
            <span>{muted ? t('打开声音') : t('静音')}</span>
          </button>
          <div className={`ws-rows ${muted ? 'is-muted' : ''}`}>
            <SwitchRow icon={AudioLines} label={t('按钮音效')} on={!sfxOff} onChange={setSfx} />
            <SwitchRow icon={Leaf} label={t('自然声')} on={nature} onChange={setNatureOn} />
            <SwitchRow icon={MessageCircleMore} label={t('潘吉说话')} on={voiceOn} onChange={setVoiceOn} />
          </div>
        </div>
      )}

      {shownPanel === 'staff' && (
        <div className={popCls('staff')} role="dialog" aria-label={t('员工')} onPointerDown={() => setPoke((n) => n + 1)}>
          <header className="ws-pop-head">
            <div>
              <b>{t('员工')}</b>
              <span>{t('客人看不到这里')}</span>
            </div>
            <button type="button" className="ws-x" onClick={() => setPanel(null)} aria-label={t('关闭')}>
              <X size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </header>
          <div className="ws-acts">
            <button type="button" className="ws-act" onClick={() => nextGuest()}>
              <i>
                <RotateCcw size={20} strokeWidth={1.8} aria-hidden="true" />
              </i>
              <span>
                <b>{t('下一位客人')}</b>
                <em>{t('清空进度，回到开头；音乐、音量和声音都回到默认')}</em>
              </span>
            </button>
            <button type="button" className="ws-act" onClick={openDesigner} disabled={where !== 'blueprint'}>
              <i>
                <PencilRuler size={20} strokeWidth={1.8} aria-hidden="true" />
              </i>
              <span>
                <b>{t('设计师版')}</b>
                <em>{where === 'blueprint' ? t('在这份蓝图上打开设计师版') : t('到了蓝图页才能打开')}</em>
              </span>
            </button>
            <button type="button" className="ws-act is-end" onClick={endWish}>
              <i>
                <Power size={20} strokeWidth={1.8} aria-hidden="true" />
              </i>
              <span>
                <b>{t('结束许愿模式')}</b>
                <em>{t('音乐淡出，回到入口页')}</em>
              </span>
            </button>
          </div>
          <div className="ws-lang">
            <span>{t('语言')}</span>
            <LangToggle onPick={pickLang} />
          </div>
        </div>
      )}
    </div>
  );
}
