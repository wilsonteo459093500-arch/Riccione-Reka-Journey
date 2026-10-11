// 客户许愿模式的外壳（展厅 iPad）：
//   · 许愿之旅 → 揭晓 → 蓝图 → 3D 都在同一个 iframe 里换页；大自然禅意音乐由外壳播放，换页不会断。
//   · 子页面用 postMessage 报告进度（src/shared/zen.js 的 tellShell），音乐跟着变（老板定的）：
//       欢迎 / 生活 / 雷区 = calm · 直觉（12 组限时二选一）= intuition（不出风铃、鸟声）· 宝藏 / 三个愿望 = focus ·
//       揭晓 = 一个亮音 → bright · 蓝图 ×0.5 · 3D ×0.25（calm / night 跟着 3D 里的时间）·
//       蓝图 / 3D 超过 CONFIG.idle.fadeMs 没人碰 → ×0.12，一碰就回来（CONFIG.wishDuck）。
//   · 一个音乐小胶囊：只有音量和静音（静音同时关掉音效；只对这一位客人有效）。
//     声音被系统暂停（锁屏、来电、切去 WhatsApp）时显示「轻触继续音乐」，那一下轻触先恢复声音。
//   · 员工区：长按 WISH 字标约 3 秒（有进度圈）→ 下一位客人 · 设计师版 · 结束许愿模式 · 语言。客人不会误触。
//   · 下一位客人：在许愿之旅 / 蓝图时只发 {type:'restart'}，不重新载入（展厅断网也能用）；只有在 3D 时才重新载入。
//   · 同源 iframe：每次载入都在子页面的 document 上挂监听 —— 客人的任何一下点击都顺便恢复音乐、算作「有人在用」。

import { useEffect, useRef, useState } from 'react';
import { RotateCcw, PencilRuler, Power, X, Play, Volume1, Volume2, VolumeX } from 'lucide-react';
import LangToggle from '../shared/LangToggle.jsx';
import { BRAND, CONFIG } from '../shared/config.js';
import { t, getLang, setLang, useLang } from '../shared/i18n.js';
import { bindZenLifecycle, releaseWake, exitFullscreen, startWish, wishStartUrl } from './start.js';
import { layersLabel } from './sounds.js';

const HOLD_MS = 3000; // 员工区：按住 3 秒
const PANEL_MS = 25000; // 面板开着没人碰，自己收起来
const SESSION_KEY = 'genie.session.v1';
const PAGES = ['quiz', 'blueprint', 'studio'];
const LEVEL = { quiz: 1, blueprint: 'blueprint', studio: 'studio' }; // zen.duck() 认这几个名字（CONFIG.wishDuck）
const FADE_MS = CONFIG.idle?.fadeMs ?? 600000;

const isLive = (zen) => (typeof zen.isLive === 'function' ? zen.isLive() : !!(zen.running && zen.ctx?.state === 'running'));
const resume = (zen) => Promise.resolve(typeof zen.resume === 'function' ? zen.resume() : zen.ctx?.resume?.()).catch(() => false);
const duck = (zen, level, seconds) => zen.duck?.(level, seconds);

/** 员工区的入口：长按 WISH 字标，一圈细线慢慢画满（3 秒）才打开；短按什么都不会发生 */
function HoldMark({ onDone, label }) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const t0 = useRef(0);
  const fired = useRef(false);
  const stop = () => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (!fired.current) setP(0);
  };
  const start = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    fired.current = false;
    t0.current = performance.now();
    cancelAnimationFrame(raf.current);
    const tick = (now) => {
      const k = Math.min(1, Math.max(0, (now - t0.current) / HOLD_MS));
      setP(k);
      if (k >= 1) {
        fired.current = true;
        raf.current = 0;
        onDone();
        setTimeout(() => setP(0), 450);
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <button
      type="button"
      className={`ws-mark ${p > 0 ? 'is-holding' : ''} ${p >= 1 ? 'is-done' : ''}`}
      aria-label={label}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="ws-ring" viewBox="0 0 88 44" aria-hidden="true">
        <path d="M44 1.5H66.5A20.5 20.5 0 0 1 66.5 42.5H21.5A20.5 20.5 0 0 1 21.5 1.5Z" pathLength="100" style={{ strokeDashoffset: 100 - p * 100 }} />
      </svg>
      <b>{BRAND.app}</b>
    </button>
  );
}

export default function WishShell({ zen, host = '', startLang, onReady, onExit }) {
  useLang(); // 员工区换语言时外壳不重新载入，只重画
  const frame = useRef(null);
  const round = useRef(0);
  const makeUrl = (l, r = 0) => `${wishStartUrl(host)}&lang=${l}${r ? `&r=${r}` : ''}`;
  const [src, setSrc] = useState(() => makeUrl(startLang || getLang()));
  const [where, setWhere] = useState('quiz');
  const [panel, setPanel] = useState(null); // null | 'music' | 'staff'
  const [vol, setVol] = useState(() => zen.volume ?? CONFIG.wishVolume ?? 0.7);
  const [muted, setMuted] = useState(false);
  const [live, setLive] = useState(true);
  const [grace, setGrace] = useState(true); // 刚开始那两秒声音还在启动，不要闪「轻触继续音乐」
  const [dusk, setDusk] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [poke, setPoke] = useState(0); // 面板里有人在操作 → 重新计时

  const whereRef = useRef('quiz');
  const mutedRef = useRef(false);
  const timeMood = useRef('calm');
  const lastAct = useRef(Date.now());
  const idleDucked = useRef(false);
  const restartFallback = useRef(0);
  const detachChild = useRef(null);
  const readySent = useRef(false);
  const leavingRef = useRef(false);

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

  const setMute = (m) => {
    mutedRef.current = m;
    setMuted(m);
    zen.setMuted(m);
    post({ type: 'sfx', muted: m }); // 一个静音同时管音乐和音效；不写进本机
  };

  const goPage = (p) => {
    if (!PAGES.includes(p)) return;
    whereRef.current = p;
    setWhere(p);
    idleDucked.current = false;
    lastAct.current = Date.now();
    if (p === 'quiz') {
      clearTimeout(restartFallback.current);
      zen.setMood('calm');
    } else if (p === 'studio') zen.setMood(timeMood.current);
    else if (zen.mood === 'night') zen.setMood('calm');
    duck(zen, LEVEL[p], p === 'quiz' ? 2 : 3);
  };

  const chapterMusic = (ch) => {
    if (ch === 'intuition') {
      zen.setMood('intuition');
      if (zen.mood !== 'intuition') {
        zen.setMood('calm'); // 旧版声景没有 intuition：保持 calm，也不点缀
        return;
      }
    } else zen.setMood(ch === 'treasure' || ch === 'wishes' ? 'focus' : 'calm');
    zen.accent('chapter');
  };

  const reloadFrame = () => {
    round.current += 1;
    setSrc(makeUrl(getLang(), round.current));
  };

  const nextGuest = () => {
    setPanel(null);
    clearTimeout(restartFallback.current);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    setMute(false);
    zen.setMood('calm');
    timeMood.current = 'calm';
    let quizChild = false;
    try {
      quizChild = /quiz/.test(frame.current.contentWindow.location.pathname);
    } catch {
      /* ignore */
    }
    if (whereRef.current !== 'studio' && quizChild) {
      post({ type: 'restart' });
      // 子页面回到欢迎页会报 page:'quiz'；2.5 秒还没回音（旧版本 / 卡住）才重新载入
      restartFallback.current = setTimeout(reloadFrame, 2500);
    } else reloadFrame();
    whereRef.current = 'quiz';
    setWhere('quiz');
    idleDucked.current = false;
    lastAct.current = Date.now();
    duck(zen, 1, 2);
  };

  const openDesigner = () => {
    post({ type: 'designer' });
    setPanel(null);
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

  // 子页面的消息 → 音乐 / 换页（用 ref 拿最新的函数）
  const onChild = useRef(null);
  onChild.current = (d) => {
    if (d.type === 'page') goPage(d.page);
    else if (d.type === 'chapter') chapterMusic(d.chapter);
    else if (d.type === 'wish') zen.accent('wish');
    else if (d.type === 'reveal') {
      zen.accent('reveal');
      zen.setMood('bright');
    } else if (d.type === 'time') {
      timeMood.current = d.hour >= 19.6 || d.hour < 6.4 ? 'night' : 'calm';
      if (whereRef.current === 'studio') zen.setMood(timeMood.current);
    } else if (d.type === 'idle-reset') nextGuest();
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

  // 开始：这一位客人有声音、calm、原音量；锁屏 / 切 app → 暂停，回来 → 恢复
  useEffect(() => {
    zen.setMuted(false);
    zen.setMood('calm');
    duck(zen, 1, 0.5);
    const unbind = bindZenLifecycle(zen);
    const g = setTimeout(() => setGrace(false), 2500);
    return () => {
      unbind?.();
      clearTimeout(g);
      clearTimeout(restartFallback.current);
      detachChild.current?.();
    };
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
    post({ type: 'sfx', muted: mutedRef.current });

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

  return (
    <div className={`ws ws-${where} ${dusk ? 'is-dusk' : ''} ${leaving ? 'is-leaving' : ''}`}>
      <iframe ref={frame} key={src} src={src} title={t('WISH 许愿模式')} className="ws-frame" onLoad={onLoad} allow="fullscreen; autoplay; clipboard-write" />

      <div className={`ws-dock ${tone}`}>
        <HoldMark label={t('员工区：按住 3 秒')} onDone={() => setPanel('staff')} />
        <button
          type="button"
          className={`ws-pill ${stalled ? 'is-stalled' : ''} ${muted ? 'is-muted' : ''}`}
          onClick={onPill}
          aria-expanded={panel === 'music'}
          aria-label={stalled ? t('轻触继续音乐') : t('音乐')}
        >
          {stalled ? (
            <Play size={15} strokeWidth={2.2} className="ws-play" aria-hidden="true" />
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

      {panel && <div className={`ws-scrim ${panel}`} onPointerDown={() => setPanel(null)} />}

      {panel === 'music' && (
        <div className={`ws-pop ws-music ${tone}`} role="dialog" aria-label={t('自然之声')} onPointerDown={() => setPoke((n) => n + 1)}>
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
        </div>
      )}

      {panel === 'staff' && (
        <div className={`ws-pop ws-staff ${tone}`} role="dialog" aria-label={t('员工')} onPointerDown={() => setPoke((n) => n + 1)}>
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
            <button type="button" className="ws-act" onClick={nextGuest}>
              <i>
                <RotateCcw size={20} strokeWidth={1.8} aria-hidden="true" />
              </i>
              <span>
                <b>{t('下一位客人')}</b>
                <em>{t('清空进度，回到开头；音乐回到平静')}</em>
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
