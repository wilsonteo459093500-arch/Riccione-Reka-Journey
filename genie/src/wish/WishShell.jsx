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
//   · 员工区：长按 WISH 字标约 3 秒（有进度圈）→ 下一位客人 · 设计师版 · 帮客人上传户型图 · 结束许愿模式 · 语言。客人不会误触。
//   · 「带它回家」（揭晓之后：你的家 · 案例 · 户型图 · 生成，子页面报 page:'home'）：音乐和蓝图一样《归家》×0.5；
//     客人按「请员工帮我上传」→ 子页面发 {type:'plan-wait', on}，WISH 字标上亮一颗金色的小点；员工在员工区「帮客人上传户型图」
//     选文件（文件选择只在员工区里，客人碰不到）→ 外壳发 {type:'plan-file', file} 给子页面（P / K / R 屏或 3D）去读。
//     iframe 可以用相机（allow camera）：客人在许愿模式里拍户型图用的是页面里的相机，不是文件选择。
//   · 最后一步（业主 2026-10-19）：客人走完「带它回家」、在 3D 里看见自己的家（studio.html?from=home）几秒以后，胶囊旁边升起一颗
//     金色的「交给设计师」→ 一张纸：称呼 + WhatsApp + PDPA 同意 →「预约免费量房」·「把我的家发到 WhatsApp」（src/quiz/home/LeadSheet.jsx）。
//     名单只存在这台 iPad（localStorage 'genie.leads.v1'）；员工区多一行「客人名单」：看名单、一按导出 CSV（Excel 打得开）、
//     按一下用 WhatsApp 把客人自己的家发给他、清空（按两下）。客人碰不到员工区，所以这里的下载 / WhatsApp 都只有员工用得到。
//   · 下一位客人：一道晨光扫过整个画面（fx.wipe dawn），光盖住的那一刻换成新的欢迎页；声音全部复原（音乐《晨光》、音量、
//     静音、按钮音效、自然声、潘吉）；潘吉说「谢谢你来许愿，下次见！」（闲置自动重来时不说：没人在）。
//     她道别的时候音乐留在原来那一页的音量（3D 的 ×0.25），说完才用 3 秒慢慢回到《晨光》—— 不会在她说话时涨上来。
//   · 换文档的那一下（蓝图 → 3D、下一位客人重建 iframe）：iframe 在新页面画出来之前是空的。外壳在它上面盖一层不动的光
//     （.ws-veil：暮色 = 深绿 + 神灯的一团暖光；晨光 = 纸色 + 金色的光晕），接住子页面那一道光；新页面画好了再 420 ms 淡掉。
//     客人看到的是一整段连续的光，不会「暗 → 一下子亮成空白的纸色 → 又暗」。子页面离开前发 {type:'leaving', tone}；
//     没发的话（旧版本）iframe 的 pagehide 里看到它自己的换页光（.fx-wipe）也一样接住。
//     iframe 自己的「返回 / 前进」记录里不能留着上一位客人的页面（3D 会打开他的方案、底座写着他的名字）：
//     客人只要离开过第一个页面（进过 3D、从 3D 回到蓝图、换过语言 …），就把整个 <iframe> 重建（换 key），
//     连同它的浏览记录一起丢掉；只有一直停在第一个许愿之旅页面里的，才只发 {type:'restart'} 原地重新开始（展厅断网也能用）。
//   · 同源 iframe：每次载入都在子页面的 document 上挂监听 —— 客人的任何一下点击都顺便恢复音乐、算作「有人在用」。
//   · 动效（动效 SPEC §6.2）：每个按钮按下去都有光（main.jsx 的 fx.install）；面板从胶囊那一角弹出、收起时 180 ms 退回；
//     员工区打开时一道光扫过 WISH 字标；设计师版 = 那一行被光扫过 → 一道纸色的光换页。

import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { RotateCcw, PencilRuler, Power, X, Play, Volume1, Volume2, VolumeX, AudioLines, Leaf, MessageCircleMore, FileUp, Users, Check } from 'lucide-react';
import LangToggle from '../shared/LangToggle.jsx';
import { BRAND, CONFIG } from '../shared/config.js';
import { t, getLang, setLang, useLang } from '../shared/i18n.js';
import { applyMusic, musicFor, isNightHour } from '../shared/zen.js';
import { sfx } from '../shared/sfx.js';
import { voice } from '../shared/voice.js';
import { useVoiceOn } from '../shared/Pangie.jsx';
import fx, { useGleam } from '../shared/fx.js';
import { bindZenLifecycle, releaseWake, exitFullscreen, startWish, wishStartUrl, MUSIC_DEFAULTS } from './start.js';
import { layersLabel } from './sounds.js';
import { sweepKept } from '../shared/keep.js';
import { useHold } from './useHold.js';

// 「交给设计师」那一步 + 员工区的客人名单：用到的时候才载入（外壳一开始要快）
const loadLead = () => import('../quiz/home/LeadSheet.jsx');
const LeadSheet = lazy(loadLead);
const LeadsPanel = lazy(() => loadLead().then((m) => ({ default: m.LeadsPanel })));
const LEADS_KEY = 'genie.leads.v1';
const leadCount = () => {
  try {
    const l = JSON.parse(localStorage.getItem(LEADS_KEY) || '[]');
    return Array.isArray(l) ? l.length : 0;
  } catch {
    return 0;
  }
};
const CTA_AFTER_MS = 6000; // 进 3D 多久以后才升起「交给设计师」（先让客人看看自己的家）

const PANEL_MS = 25000; // 面板开着没人碰，自己收起来
const PANEL_OUT_MS = 180; // 面板收起的那一下（动效 SPEC：180 ms ease-in）
const SESSION_KEY = 'genie.session.v1';
const PAGES = ['quiz', 'blueprint', 'home', 'studio'];
const LEVEL = { quiz: 1, blueprint: 'blueprint', home: 'blueprint', studio: 'studio' }; // zen.duck() 认这几个名字（CONFIG.wishDuck）
const FADE_MS = CONFIG.idle?.fadeMs ?? 600000;
const VEIL_TONES = ['dusk', 'dawn', 'paper'];
const VEIL_CAP = { load: 8000, quiz: 2500 }; // 光最多盖多久（新页面一直没报到也不会挡着客人）
const BYE_CAP_MS = 5000; // 潘吉道别最多等这么久，音乐才回到《晨光》（她没出声 = 马上）

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
function HoldMark({ onDone, label, markRef, dot = false }) {
  const { p, bind } = useHold(onDone);
  return (
    <button
      ref={markRef}
      type="button"
      data-fx="none"
      className={`ws-mark ${p > 0 ? 'is-holding' : ''} ${p >= 1 ? 'is-done' : ''} ${dot ? 'has-dot' : ''}`}
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
  const [planWait, setPlanWait] = useState(false); // 客人在等员工帮忙上传户型图（WISH 字标上的金点）
  const planInput = useRef(null);
  // 最后一步：这一位客人（3D 里是他的家）· 交给设计师的那张纸 · 已经留好的那一条 · 员工区现在是不是在看名单
  const [guest, setGuest] = useState(null);
  const [guestLink, setGuestLink] = useState('');
  const [ctaOn, setCtaOn] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadDone, setLeadDone] = useState(null);
  const [staffView, setStaffView] = useState('main');
  const [leads, setLeads] = useState(0);
  const ctaT = useRef(0);
  const ctaRef = useRef(null);
  const guestRound = useRef(0);
  const guestId = useRef(null); // 子页面说「这一位要去看 3D 里的家了」（home-done）时记下的档案号
  const armedDoc = useRef(null); // 已经认过客人的那一个 3D 文档（load 和 3D 自己报到，谁先到都只认一次）

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
  const rootEl = useRef(null);
  const veilEl = useRef(null);
  const veil = useRef(null); // 盖着的光：{ tone, until: 'load'（下一个文档载好）| 页面名（子页面报到） }
  const veilT = useRef(0);
  const musicHeld = useRef(null); // 潘吉在道别：音乐先别回到《晨光》（{ volTouched }）

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

  // ── 换文档时盖住 iframe 的那一层光（直接改 DOM：pagehide 里也要在同一帧盖上，不等 React 重画） ──
  /** 盖上：tone = dusk | dawn | paper；until = 'load' | 页面名；instant = 不淡入（外壳自己的换页光正盖着、或旧页面已经在卸载） */
  const raiseVeil = (tone, { until = 'load', instant = false } = {}) => {
    const el = veilEl.current;
    if (!el) return;
    veil.current = { tone, until };
    clearTimeout(veilT.current);
    el.dataset.tone = VEIL_TONES.includes(tone) ? tone : 'dusk';
    el.classList.toggle('is-instant', !!instant);
    el.classList.add('is-on');
    if (rootEl.current) rootEl.current.dataset.veil = el.dataset.tone;
    veilT.current = setTimeout(() => dropVeil({ now: true }), VEIL_CAP[until] ?? VEIL_CAP.load);
  };
  /** 旧页面正在卸载：还在淡入的光马上盖满 */
  const solidVeil = () => veilEl.current?.classList.add('is-instant');
  /** 新页面画出来了（再等两帧，确定已经画上去）→ 420 ms 淡掉 */
  const dropVeil = ({ now = false } = {}) => {
    const v = veil.current;
    if (!v) return;
    veil.current = null;
    clearTimeout(veilT.current);
    const go = () => {
      if (veil.current) return; // 这期间又盖上了（例如又一次换页）
      veilEl.current?.classList.remove('is-on', 'is-instant');
      if (rootEl.current) delete rootEl.current.dataset.veil;
    };
    if (now || typeof requestAnimationFrame !== 'function') go();
    else requestAnimationFrame(() => requestAnimationFrame(go));
  };

  /** 音乐回到一位新客人的样子：音量回默认、《晨光》、原音量（duckSec 秒涨回来） */
  const resetMusic = ({ duckSec, volume = true } = {}) => {
    if (volume) {
      const v = MUSIC_DEFAULTS.volume;
      setVol(v);
      zen.setVolume(v);
    }
    const step = musicFor('page', { page: 'quiz' });
    applyMusic(zen, step && duckSec ? { ...step, duckSec } : step);
  };

  /** 潘吉道别（bye = say() 的 promise）：说完（最多 BYE_CAP_MS）才让音乐用 3 秒回到《晨光》；没有道别 = 现在就回 */
  const musicAfterGoodbye = (bye) => {
    const hold = { volTouched: false };
    musicHeld.current = hold;
    const release = () => {
      if (musicHeld.current !== hold) return;
      musicHeld.current = null;
      resetMusic({ duckSec: bye ? 3 : undefined, volume: !hold.volTouched });
    };
    if (!bye) return release();
    let cap = 0;
    Promise.race([bye, new Promise((r) => (cap = setTimeout(r, BYE_CAP_MS)))]).then(
      () => {
        clearTimeout(cap);
        release();
      },
      () => {
        clearTimeout(cap);
        release();
      }
    );
    return undefined;
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
    if (veil.current?.until === p) dropVeil();
    if (!musicHeld.current) applyMusic(zen, musicFor('page', { page: p, night: night.current }));
  };

  const reloadFrame = () => {
    round.current += 1;
    setSrc(makeUrl(getLang(), round.current));
  };

  /** 声音的开关全部回到一位新客人的样子（在手指里调用：iOS 上顺便把被暂停的声音接回来）；音乐本身交给 resetMusic */
  const resetControls = () => {
    sfxOffRef.current = false;
    setSfxOff(false);
    setMute(false);
    setNatureOn(MUSIC_DEFAULTS.nature);
    if (voice.enabled !== voiceAtGuest.current) setVoiceOn(voiceAtGuest.current);
    night.current = false;
    idleDucked.current = false;
    lastAct.current = Date.now();
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

  /** 员工帮客人上传户型图：文件选择只在员工区里；选好 → 交给 iframe 里的页面去读，面板收起 */
  const sendPlan = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    post({ type: 'plan-file', file });
    setPlanWait(false);
    sfx.play('confirm');
    setPanel(null);
  };

  /** 下一位客人。goodbye：员工按的（潘吉道别）；闲置自动重来时没人在，不说 */
  const nextGuest = ({ goodbye = true } = {}) => {
    if (wiping.current || leavingRef.current) return;
    wiping.current = true;
    setPanel(null);
    const wasMuted = mutedRef.current;
    resetControls();
    voice.newGuest();
    setPlanWait(false);
    resetLead();
    sweepKept(); // 展厅 iPad 可能好几天不关：过了保留期的客人名单 / 员工记录在这里按时删掉（keep.js）
    greetDue.current = false; // 下一位客人：封面自己在第一下轻触时打招呼
    voiceAtGuest.current = voice.enabled;
    // 她道别的时候音乐还是原来那一页的音量；说完再用 3 秒回到《晨光》（同一句话里不会涨 17 dB）
    musicAfterGoodbye(goodbye && !wasMuted ? voice.say('bye.next') : null);
    const w = fx.wipe(null, { tone: 'dawn', duration: 1000 });
    w.mid.then(() => {
      // 光最厚的那一刻在它底下盖一层晨光：光走过去以后看到的是同一片晨光，新的欢迎页画好了它才淡掉（不是空白的纸色 → 一下子跳出来）
      raiseVeil('dawn', { until: 'quiz', instant: true });
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
    setLeads(leadCount());
    setStaffView('main');
    setLeadOpen(false);
    setPanel('staff');
  };

  // ── 最后一步：交给设计师 ──
  /** 下一位客人 / 结束：这一位的一切都放掉 */
  const resetLead = () => {
    guestRound.current += 1;
    guestId.current = null;
    armedDoc.current = null;
    clearTimeout(ctaT.current);
    setGuest(null);
    setGuestLink('');
    setCtaOn(false);
    setLeadOpen(false);
    setLeadDone(null);
  };
  /**
   * 3D 页载好了（iframe 的 load，或者 3D 自己先报到 {type:'page', page:'studio'} —— 字体这些外部样式还在读的时候
   * load 会晚很久）：是「带它回家」生成的那一个家 → 认出这一位客人，几秒后升起「交给设计师」。同一个文档只认一次。
   */
  const onStudioLoad = (win) => {
    let doc = null;
    try {
      doc = win?.document || null;
    } catch {
      doc = null;
    }
    if (!doc || armedDoc.current === doc) return;
    armedDoc.current = doc;
    const r = guestRound.current;
    loadLead()
      .then(async (m) => {
        const p = await m.guestFromStudio(win, guestId.current);
        if (!p || r !== guestRound.current) return;
        setGuest((g) => (g?.id === p.id ? g : p));
        setLeadDone(m.leadFor(p.id)); // 这一位已经留过（回到 3D）：直接是 ✓；换了一位：清掉
        m.homeLinkFor(p).then((l) => r === guestRound.current && setGuestLink(l));
        clearTimeout(ctaT.current);
        ctaT.current = setTimeout(() => r === guestRound.current && setCtaOn(true), fx.motion.reduced ? 800 : CTA_AFTER_MS);
      })
      .catch(() => {});
  };
  const openLead = (e) => {
    markActive();
    if (e?.currentTarget) fx.scan(e.currentTarget, { sound: null });
    setPanel(null);
    setLeadOpen(true);
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
    else if (d.type === 'page') {
      goPage(d.page);
      if (d.page === 'studio') onStudioLoad(frame.current?.contentWindow);
    } else if (d.type === 'leaving') {
      // 子页面换页的光正盖着、马上就要 location.assign：外壳接住，盖到新页面载好（蓝图 → 3D：暮色）
      if (!wiping.current && !leavingRef.current) raiseVeil(VEIL_TONES.includes(d.tone) ? d.tone : 'dusk', { until: 'load' });
    }
    else if (d.type === 'mood' || d.type === 'chapter' || d.type === 'reveal') applyMusic(zen, musicFor(d.type, d));
    else if (d.type === 'time') {
      night.current = isNightHour(d.hour);
      if (whereRef.current === 'studio') applyMusic(zen, musicFor('time', d));
    } else if (d.type === 'idle-reset') nextGuest({ goodbye: false });
    else if (d.type === 'plan-wait') setPlanWait(!!d.on);
    else if (d.type === 'home-done') {
      // 客人按了「生成我的家」（或蓝图上的「在 3D 里看见」）：记下是哪一位，先把最后一步那一包载进来
      if (typeof d.id === 'string') guestId.current = d.id;
      loadLead();
    }
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
      clearTimeout(veilT.current);
      musicHeld.current = null;
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
    // 换文档时盖着的光：新的页面载好了（3D 这时已经是自己的深色「正在搭建你的家…」）→ 两帧后淡掉
    if (veil.current?.until === 'load') dropVeil();
    if (!win || !doc) return;
    try {
      if (/studio/.test(win.location.pathname)) {
        goPage('studio');
        onStudioLoad(win); // 「带它回家」生成的家：几秒后升起「交给设计师」
      } else {
        clearTimeout(ctaT.current);
        setCtaOn(false);
        if (!/(^|[#&])(bp|id|home|plan)=/.test(win.location.hash.slice(1)) && whereRef.current !== 'quiz') goPage('quiz');
      }
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
    // 子页面要换文档了（它自己的 location.assign）：已经盖上的光马上盖满；还没盖（旧版本没发 'leaving'）但它的换页光
    // 正在画面上 → 照那道光的颜色盖上，等新页面载好。外壳自己换 iframe（下一位客人、结束）时不管
    const onHide = () => {
      if (wiping.current || leavingRef.current) return;
      if (veil.current) return solidVeil();
      let tone = null;
      try {
        const band = doc.querySelector('.fx-wipe.is-page');
        if (band) tone = VEIL_TONES.find((x) => band.classList.contains(`fx-${x}`)) || 'paper';
      } catch {
        /* ignore */
      }
      if (tone) raiseVeil(tone, { until: 'load', instant: true });
      return undefined;
    };
    win.addEventListener('pagehide', onHide);
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
      try {
        win.removeEventListener('pagehide', onHide);
      } catch {
        /* 旧的 window 已经没了 */
      }
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
  // 「交给设计师」升起来以后，每隔一阵被光扫一下（像揭晓的金色按钮）
  useGleam(ctaRef, where === 'studio' && !!guest && ctaOn && !leadDone && !leadOpen, { first: 1400, every: 7000 });

  return (
    <div ref={rootEl} className={`ws ws-${where} ${dusk ? 'is-dusk' : ''} ${leaving ? 'is-leaving' : ''}`}>
      <iframe ref={frame} key={src} src={src} title={t('WISH 许愿模式')} className="ws-frame" onLoad={onLoad} allow="fullscreen; autoplay; clipboard-write; camera" />
      {/* 换文档时接住画面的那一层光（raiseVeil / dropVeil 直接改它的 class，不经过 React） */}
      <div ref={veilEl} className="ws-veil" aria-hidden="true">
        <i />
      </div>

      <div className={`ws-dock ${tone}`}>
        <HoldMark label={planWait ? t('员工区：按住 3 秒 · 客人在等员工上传户型图') : t('员工区：按住 3 秒')} markRef={markRef} onDone={openStaff} dot={planWait} />
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
        {/* 最后一步：客人在 3D 里看过自己的家 → 「交给设计师」（留好了 = 安静的一颗 ✓，按了再看一次谢谢卡） */}
        {/* 面板（声音 / 员工区）打开时先收起来：横放时它浮在胶囊上面，会被面板压住一角 */}
        {where === 'studio' && guest && ctaOn && !shownPanel && (
          <button
            ref={ctaRef}
            type="button"
            className={`ws-lead-cta ${leadDone ? 'is-done' : ''}`}
            onClick={openLead}
            data-sfx={leadDone ? 'open' : 'confirm'}
            aria-haspopup="dialog"
          >
            {leadDone ? <Check size={16} strokeWidth={2.6} aria-hidden="true" /> : <span aria-hidden="true">✦</span>}
            <span>{leadDone ? t('已交给设计师') : t('交给设计师')}</span>
          </button>
        )}
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
                if (musicHeld.current) musicHeld.current.volTouched = true; // 潘吉道别时就调了音量：说完不要把它改回默认
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

      {shownPanel === 'staff' && staffView === 'leads' && (
        <div className={`${popCls('staff')} ws-pop-leads`} role="dialog" aria-label={t('客人名单')} onPointerDown={() => setPoke((n) => n + 1)}>
          <Suspense fallback={null}>
            <LeadsPanel onBack={() => (setStaffView('main'), setLeads(leadCount()))} onPoke={() => setPoke((n) => n + 1)} />
          </Suspense>
        </div>
      )}

      {shownPanel === 'staff' && staffView !== 'leads' && (
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
            {/* 客人说「请员工帮我上传」：员工在这里选文件（客人那一页永远没有文件选择） */}
            <button
              type="button"
              className={`ws-act ${planWait ? 'is-wait' : ''}`}
              onClick={() => planInput.current?.click()}
              disabled={where !== 'home' && where !== 'studio'}
              data-sfx="open"
            >
              <i>
                <FileUp size={20} strokeWidth={1.8} aria-hidden="true" />
              </i>
              <span>
                <b>{t('帮客人上传户型图')}</b>
                <em>{where === 'home' || where === 'studio' ? (planWait ? t('客人在等：照片、截图、PDF 都可以') : t('照片、截图、PDF 都可以')) : t('到了「户型图」那一步才能上传')}</em>
              </span>
            </button>
            <input ref={planInput} type="file" accept="image/*,application/pdf" className="ws-file" tabIndex={-1} aria-hidden="true" onChange={sendPlan} />
            {/* 客人留下的联系方式（只在这台 iPad）：看名单、导出 CSV */}
            <button
              type="button"
              className="ws-act"
              onClick={() => {
                loadLead();
                setStaffView('leads');
              }}
              data-sfx="open"
            >
              <i>
                <Users size={20} strokeWidth={1.8} aria-hidden="true" />
              </i>
              <span>
                <b>{t('客人名单（{0}）', [leads])}</b>
                <em>{t('称呼、WhatsApp、预算 · 导出 Excel（CSV）')}</em>
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

      {/* 交给我们的设计师：称呼 + WhatsApp + PDPA →「预约免费量房」·「把我的家发到 WhatsApp」 */}
      {leadOpen && guest && (
        <Suspense fallback={null}>
          <LeadSheet
            key={guest.id}
            profile={guest}
            link={guestLink}
            done={leadDone}
            onSaved={(l) => setLeadDone(l)}
            onClose={() => {
              setLeadOpen(false);
              markActive();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
