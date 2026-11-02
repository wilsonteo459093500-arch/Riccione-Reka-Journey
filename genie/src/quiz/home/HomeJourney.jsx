// 「带它回家」—— 揭晓之后：你的家（H1–H5：类型 · 在哪里 · 现在 · 大小 · 做哪里）→ 最像你的家（C）→ 户型图（P）→ 留下来的颜色（K）→ 这是你的家吗（R）→ 生成（G）。
// SPEC §1 / §3–§7。QuizApp 在 #home=<档案号>（继续）/ #plan=<档案号>（之后再给户型图）时把这一页放进来。
//
//   · 每走一步都把档案（withHome）存回这台设备的存档 —— 重新整理 / iPad 收掉分页回来，接着走（sessionStorage 记在哪一步）；
//   · 户型图一到手就在后面开始读（STUDIO 的 readPlan，懒载入）：客人接着选留下来的颜色，读好了再看「这是你的家吗？」；
//   · 许愿模式（展厅 iPad）：拍户型图用页面里的相机，或者请员工在员工区帮忙上传（外壳把文件发进来：{type:'plan-file'}）——
//     客人这里永远没有文件选择；3 分钟没人碰 →「还在吗？」→ 下一位客人（和许愿之旅一样）；
//   · 生成：档案（你的家 + 选的案例 + 留下来的颜色 + 读好的小平面）打包进 studio.html?from=home&case=…#p=…；
//     户型图本身（照片 / PDF、读出来的平面）只存在这台设备的 IndexedDB（handoff.js），不进链接。
// 画面：H / P / K / R 在金马伦高原的晨光里；C 是一张安静的纸（照片自己说话）；G 回到暮色（仪式时刻）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Play as PlayIcon, House, Camera as CameraIcon } from 'lucide-react';
import Pangie from '../../shared/Pangie.jsx';
import { CONFIG } from '../../shared/config.js';
import { t, L, withLang } from '../../shared/i18n.js';
import { voice, lineText, lineOf } from '../../shared/voice.js';
import { sfx } from '../../shared/sound.js';
import fx from '../../shared/fx.js';
import { isWishMode, tellShell } from '../../shared/zen.js';
import { saveToArchive, storagePlan } from '../../shared/profile.js';
import { profileText, postProfile } from '../../shared/summary.js';
import { normalizeHome, withHome, needsKeep, templateFor, planHint, packForStudio, askBudgetOn, KEEP_SLOTS } from '../../shared/home.js';
import * as C from '../../shared/cases.js';
import { APPLIANCES } from '../flow.js';
import Scenery, { usesPhoto } from '../Scenery.jsx';
import { cue, settle } from '../moments.js';
import { HomeSteps, Head, Next, ReadingPill, prewarmSwatches } from './kit.jsx';
import { TypeStep, WhereStep, StatusStep, SizeStep, ScopeStep } from './PropertySteps.jsx';
import CasesStep from './CasesStep.jsx';
import PlanStep, { fileOk, decodable } from './PlanStep.jsx';
import Camera, { canUseCamera } from './Camera.jsx';
import KeepStep from './KeepStep.jsx';
import PlanConfirm, { relabelLocal, removeLocal, planFacts } from './PlanConfirm.jsx';
import GenerateStep from './GenerateStep.jsx';
import './home.css';

const WISH = isWishMode();
const STAFF = (() => {
  try {
    return !WISH && new URLSearchParams(location.search).get('staff') === '1';
  } catch {
    return false;
  }
})();
const SESSION_KEY = 'genie.home.v1';
const HOME_STEPS = ['type', 'where', 'status', 'size', 'scope'];
// 预算：只在员工的设备上问（许愿模式 / 设计师版），答案只进这台设备的员工记录（home.js 开头）
const ASK_BUDGET = askBudgetOn({ config: CONFIG, wish: WISH, staff: STAFF });
const PLAN_STEPS = ['plan', 'wait', 'keep', 'read', 'confirm', 'unreadable'];
const stepIndex = (s) => (HOME_STEPS.includes(s) ? 0 : s === 'cases' ? 1 : s === 'generate' ? 3 : 2);
// 进到这一屏，潘吉说的那一句（voice-lines.js 的 home 组）；泡泡 = lineText(id)，一字不差
const VOICE = { type: 'home.enter', size: 'home.size', plan: 'plan.enter', wait: 'plan.staff', read: 'plan.reading', keep: 'keep.enter', confirm: 'plan.done', generate: 'gen.ready' };
// 只有字、不出声的泡泡
const BUBBLE = { where: '不用写地址哦', status: '新房、旧房都可以', scope: '快好了！', unreadable: '' };
const BAD_FILE = '这张图打不开，换一张试试？（JPG、PNG、PDF 都可以）';

// STUDIO 的读图 / 交接模块：懒载入（许愿之旅的包里不带 three.js、pdf.js）；还没做好也不会坏 —— 当作「读不清」
const READER = import.meta.glob('../../studio/guest/readPlan.js');
const HANDOFF = import.meta.glob('../../shared/handoff.js');
const loadReader = () => {
  const injected = typeof window !== 'undefined' && window.__wishReadPlan; // 浏览器测试用的假读图（不会碰真的 Gemini）
  if (injected) return Promise.resolve(injected);
  const f = READER['../../studio/guest/readPlan.js'];
  return f ? f().catch(() => null) : Promise.resolve(null);
};
const loadHandoff = () => {
  const f = HANDOFF['../../shared/handoff.js'];
  return f ? f().catch(() => null) : Promise.resolve(null);
};

function loadSession(id) {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    return s && s.id === id ? s : null;
  } catch {
    return null;
  }
}
function saveSession(id, step) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, step, ts: Date.now() }));
  } catch {
    /* ignore */
  }
}
export function clearHomeSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** 没有记下在哪一步时：从档案里推（第一个还没答的） */
function derive(home, profile) {
  if (!home.type) return 'type';
  if (!home.state && !home.touched?.where) return 'where';
  if (!home.status) return 'status';
  if (!home.sizeSqft || !home.bedrooms) return 'size';
  if (!home.timeline && !home.scope?.length) return 'scope';
  if (!home.casesDone && !profile?.cases?.length) return 'cases';
  const st = home.plan?.state;
  if (!st || st === 'none' || st === 'reading') return 'plan';
  if (st === 'staff') return 'wait';
  return 'generate';
}

const okRead = (r) => r && (r.status === 'ok' || r.status === 'rough') && r.plan?.floors?.some((f) => f.rooms?.length);

export default function HomeJourney({ profile: p0, start, ui, onBlueprint, onRestart, onProfile }) {
  const { TopBar, Companion, Prompt, Countdown } = ui;
  const [profile, setProfile] = useState(p0);
  const [home, setHome] = useState(() => normalizeHome(p0.home));
  const [chosen, setChosen] = useState([]);
  const [step, setStep] = useState(() => start || loadSession(p0.id)?.step || derive(normalizeHome(p0.home), p0));
  const [trail, setTrail] = useState([]);
  const [reading, setReading] = useState({ state: 'idle', pct: 0 });
  const [draft, setDraft] = useState(null); // R 屏正在改名字的平面
  const [more, setMore] = useState({ state: 'idle', pct: 0 }); // R 屏「再拍下一层」
  const moreRef = useRef(false); // 下一份到手的文件（相机 / 员工上传）= 下一层
  const moreAbort = useRef(null);
  const draftRef = useRef(null);
  draftRef.current = draft;
  const readingRef = useRef(null);
  const [planErr, setPlanErr] = useState('');
  const [cam, setCam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bubble, setBubble] = useState(null); // 临时换掉的一句（例如「我还没有户型图」之后）
  const [idlePrompt, setIdlePrompt] = useState(false);
  const readAbort = useRef(null);
  readingRef.current = reading;
  const stepRef = useRef(step);
  stepRef.current = step;
  const homeRef = useRef(home);
  homeRef.current = home;
  const keepSeen = useRef(false);
  const thumbUrl = useRef('');
  const noCases = useRef(false); // 案例库是空的：返回时跳过 C 屏

  // 选过的案例（档案里只存 { id, rev, title }）→ 完整的案例
  useEffect(() => {
    const refs = p0.cases || [];
    if (!refs.length) return undefined;
    let alive = true;
    C.listCases()
      .then((all) => {
        if (!alive) return;
        const byId = new Map((all || []).map((c) => [c.id, c]));
        setChosen(refs.map((r) => byId.get(r.id)).filter(Boolean));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [p0]);

  // 存回这台设备（每一步）：你的家 + 选的案例
  const persist = useCallback(
    (h = homeRef.current, cs) => {
      setProfile((cur) => {
        const next = withHome(cur, h, cs);
        saveToArchive(next);
        onProfile?.(next);
        return next;
      });
    },
    [onProfile]
  );

  const set = useCallback((patch) => setHome((h) => ({ ...h, ...patch })), []);

  const go = useCallback(
    (to, { push = true } = {}) => {
      if (!to) return;
      const from = stepRef.current;
      if (push && from !== to) setTrail((tr) => [...tr, from]);
      if (to === 'keep') keepSeen.current = true;
      setBubble(null);
      setStep(to);
      window.scrollTo(0, 0);
    },
    []
  );

  useEffect(() => {
    saveSession(p0.id, step);
    persist(homeRef.current);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // 音乐 / 外壳：这一页叫 'home'（《归家》× 0.5，和蓝图一样）；G 是暮色
  useEffect(() => {
    cue('page', { page: 'home' });
    return () => tellShell('plan-wait', { on: false });
  }, []);
  const dusk = step === 'generate';
  useEffect(() => {
    document.body.classList.toggle('is-dusk', dusk);
    if (dusk) cue('mood', { mood: 'dusk' });
    return () => document.body.classList.remove('is-dusk');
  }, [dusk]);

  // 潘吉说这一屏的那一句（离开这一屏就停）
  useEffect(() => {
    const id = VOICE[step];
    if (!id) return undefined;
    voice.say(id, { delay: 700, mode: lineOf(id)?.mode === 'queue' ? 'queue' : undefined });
    return () => voice.stopIf(id);
  }, [step]);

  // 「还在吗？」（许愿模式）：和许愿之旅同一套时间（CONFIG.idle）
  useEffect(() => {
    if (!idlePrompt) return undefined;
    voice.say('idle.still', { delay: 300 });
    return () => voice.stopIf('idle.still');
  }, [idlePrompt]);
  useEffect(() => {
    if (!WISH) return undefined;
    const { quizMs = 180000, promptMs = 30000 } = CONFIG.idle || {};
    let t1;
    let t2;
    let t3;
    const fire = () => {
      tellShell('idle-reset');
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
  }, [step, onRestart]);

  // 用完就放掉：户型图的小缩图、正在读的那一次
  useEffect(
    () => () => {
      readAbort.current?.abort?.();
      moreAbort.current?.abort?.();
      if (thumbUrl.current) URL.revokeObjectURL(thumbUrl.current);
    },
    []
  );

  // 案例屏出来 2 秒后：先把读图的那一包载进来（到了户型图那一步就不用等）
  useEffect(() => {
    if (step !== 'cases') return undefined;
    const id = setTimeout(() => loadReader(), 2000);
    return () => clearTimeout(id);
  }, [step]);

  // 户型图那一屏（客人在拍照 / 选文件）：空闲时先把 K 屏的色卡一张张画好（K 屏一按「保留」就有，不会卡一下）
  useEffect(() => {
    if (step !== 'plan' || !needsKeep(homeRef.current)) return;
    for (const k of KEEP_SLOTS) prewarmSwatches(k.swatches, 112);
  }, [step]);

  // 「你的家」最后一题：先把最可能出现的 4 张封面读进来
  useEffect(() => {
    if (step !== 'scope') return undefined;
    let alive = true;
    C.listCases()
      .then((all) => {
        if (!alive) return;
        const m = C.matchCases({ ...profile, home: homeRef.current }, all || [], { limit: 4 });
        for (const x of m.picks) {
          const cv = C.coverOf(x.case);
          if (cv && !cv.device) {
            const im = new Image();
            im.decoding = 'async';
            im.src = C.imageURL(x.case, cv, 480);
          }
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ───────── 户型图：读 ─────────
  const planNext = useCallback(() => {
    const st = homeRef.current.plan?.state;
    if (st === 'read' || st === 'rough') return 'generate';
    if (st === 'later' || st === 'unreadable') return 'generate';
    if (st === 'staff') return 'wait';
    return null; // 由 reading 决定
  }, []);

  const afterRead = useCallback((r) => (okRead(r) ? 'confirm' : 'unreadable'), []);

  // 读图在后面跑（不等它）：客人接着往下走；读好了，正在等它的那一屏自己往下走
  const runRead = useCallback(
    async (file, from, ac) => {
      const mod = await loadReader();
      let res = null;
      const t0 = performance.now();
      if (typeof mod?.readPlan === 'function') {
        try {
          res = await mod.readPlan(file, {
            hint: planHint(homeRef.current),
            signal: ac?.signal,
            onProgress: (p) => {
              if (readAbort.current !== ac) return;
              setReading((r) => (r.state === 'reading' ? { ...r, pct: Math.max(r.pct, Number(p?.pct) || 0), eta: p?.etaSec } : r));
            },
          });
        } catch {
          res = { status: 'error' };
        }
      } else res = { status: 'unreadable', source: null, issues: [] };
      if (readAbort.current !== ac || res?.status === 'cancelled') return;
      // 读得太快（读不清 / 测试用的假读图）：进度条至少走一下，不要一闪而过
      const left = 700 - (performance.now() - t0);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      if (readAbort.current !== ac) return;
      res = { ...(res || { status: 'error' }), from };
      const ok = okRead(res);
      setReading((r) => ({ ...r, state: 'done', pct: 100, result: res }));
      setDraft(ok ? res.plan : null);
      // 读好了也先不算数：客人在 R 屏点「对，就是它」（或读不清时点「先这样」）才写进档案
      // 读不清也留着原图给设计师（只在这台设备）
      if (!ok)
        loadHandoff().then((m) => {
          try {
            m?.putPlanFile?.(profile.id, file);
          } catch {
            /* ignore */
          }
        });
      const s = stepRef.current;
      if (s === 'read') go(afterRead(res), { push: false });
      else if (s === 'wait') go(needsKeep(homeRef.current) && !keepSeen.current ? 'keep' : afterRead(res));
    },
    [go, afterRead, profile.id]
  );

  /** 一份户型图到手（拍的 / 选的 / 员工传的）：先看打不打得开，然后在后面开始读 → true；打不开 → false（P 屏显示一句） */
  const startRead = useCallback(
    async (file, from) => {
      setPlanErr('');
      if (!fileOk(file) || !(await decodable(file))) {
        setPlanErr(t(BAD_FILE));
        if (stepRef.current !== 'plan') go('plan');
        return false;
      }
      readAbort.current?.abort?.();
      moreAbort.current?.abort?.();
      moreRef.current = false;
      setMore({ state: 'idle', pct: 0 });
      const ac = typeof AbortController === 'function' ? new AbortController() : {};
      readAbort.current = ac;
      if (thumbUrl.current) URL.revokeObjectURL(thumbUrl.current);
      thumbUrl.current = /^image\//.test(file.type || '') ? URL.createObjectURL(file) : '';
      tellShell('plan-wait', { on: false });
      setDraft(null);
      setReading({ state: 'reading', pct: 3, file, thumb: thumbUrl.current, from });
      setHome((h) => ({ ...h, plan: { ...h.plan, state: 'reading', source: from } }));
      runRead(file, from, ac);
      return true;
    },
    [go, runRead]
  );

  /**
   * R 屏「再拍下一层」：客人说有两层、只读到一层 → 新的一张读成下一层，叠在 R 屏正在改的平面上（改过的名字留着）。
   * 读不出来 → appendFloor 原样还回来 → 「这一张我读不清」。原来那一层不动。
   */
  const readMore = useCallback(async (file, from) => {
    moreRef.current = false;
    tellShell('plan-wait', { on: false });
    if (!fileOk(file) || !(await decodable(file))) return setMore({ state: 'bad', pct: 0 });
    const mod = await loadReader();
    const base0 = readingRef.current?.result;
    const plan0 = draftRef.current || base0?.plan;
    if (typeof mod?.readPlan !== 'function' || typeof mod?.appendFloor !== 'function' || !plan0) return setMore({ state: 'failed', pct: 0 });
    moreAbort.current?.abort?.();
    const ac = typeof AbortController === 'function' ? new AbortController() : {};
    moreAbort.current = ac;
    setMore({ state: 'reading', pct: 3, from });
    const hint = planHint(homeRef.current);
    let res = null;
    try {
      res = await mod.readPlan(file, {
        hint: { ...hint, floor: plan0.floors?.length || 1 },
        signal: ac.signal,
        onProgress: (p) => moreAbort.current === ac && setMore((m) => (m.state === 'reading' ? { ...m, pct: Math.max(m.pct, Number(p?.pct) || 0) } : m)),
      });
    } catch {
      res = { status: 'error' };
    }
    if (moreAbort.current !== ac || res?.status === 'cancelled') return;
    const base = { ...(base0 || {}), plan: plan0 };
    let merged = base;
    try {
      merged = okRead(res) ? await mod.appendFloor(base, res, { hint }) : base;
    } catch {
      merged = base;
    }
    if (moreAbort.current !== ac) return;
    if (merged === base || !okRead(merged) || (merged.plan.floors?.length || 0) <= (plan0.floors?.length || 0)) return setMore({ state: 'failed', pct: 0 });
    setReading((r) => ({ ...r, result: { ...merged, from: r.result?.from || from } }));
    setDraft(merged.plan);
    setMore({ state: 'done', pct: 100 });
    sfx.play('land');
  }, []);

  const addFloor = (from, file) => {
    if (file) return readMore(file, from);
    if (from === 'camera') {
      moreRef.current = true;
      return setCam(true);
    }
    if (from === 'staff') {
      moreRef.current = true;
      tellShell('plan-wait', { on: true });
      setMore({ state: 'staff', pct: 0 });
    }
    return undefined;
  };

  // 许愿模式的员工区：员工帮客人上传的户型图（外壳 → 这一页）
  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== location.origin || e.data?.source !== 'genie-shell' || e.data.type !== 'plan-file') return;
      const file = e.data.file;
      if (!file || !PLAN_STEPS.includes(stepRef.current)) return;
      // R 屏在等下一层（客人点了「请员工帮我上传」）：这一张是下一层
      if (moreRef.current && stepRef.current === 'confirm') return void readMore(file, 'staff');
      startRead(file, 'staff').then((ok) => {
        if (!ok) return;
        const s = stepRef.current;
        if (s === 'plan' || s === 'wait') go(needsKeep(homeRef.current) && !keepSeen.current ? 'keep' : 'read');
        else if (s === 'confirm' || s === 'unreadable') go('read');
      });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [startRead, readMore, go]);

  // 回到「正在读」那一屏时已经读好了：直接往下走
  useEffect(() => {
    if (step === 'read' && reading.state === 'done') go(afterRead(reading.result), { push: false });
  }, [step, reading.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // ───────── 每一屏 ─────────
  const back = () => {
    if (cam) return setCam(false);
    const tr = [...trail];
    let prev = tr.pop();
    while (prev && ((prev === 'cases' && noCases.current) || prev === 'read')) prev = tr.pop();
    if (!prev) return onBlueprint?.();
    setTrail(tr);
    setStep(prev);
    window.scrollTo(0, 0);
  };

  const onPlanFile = async (file, from) => {
    const ok = await startRead(file, from);
    if (ok && stepRef.current === 'plan') go(needsKeep(homeRef.current) ? 'keep' : 'read');
  };

  const chooseLater = (e) => {
    readAbort.current?.abort?.();
    setReading({ state: 'idle', pct: 0 });
    tellShell('plan-wait', { on: false });
    setHome((h) => ({ ...h, plan: { state: 'later', source: null }, template: templateFor(h) }));
    voice.say('plan.later', { mode: 'interrupt' });
    setBubble(lineText('plan.later'));
    const btn = e?.currentTarget;
    settle(null, fx.clock.wait(900), () => go(needsKeep(homeRef.current) ? 'keep' : 'generate'), 1400);
    if (btn) fx.scan(btn, { sound: null });
  };

  const chooseStaff = () => {
    setHome((h) => ({ ...h, plan: { state: 'staff', source: 'staff' } }));
    tellShell('plan-wait', { on: true });
    go('wait');
  };

  const afterKeep = () => {
    const nx = planNext();
    if (nx) return go(nx);
    if (reading.state === 'reading') return go('read');
    if (reading.state === 'done') return go(afterRead(reading.result));
    return go('generate');
  };

  const confirmYes = async () => {
    moreAbort.current?.abort?.();
    moreRef.current = false;
    tellShell('plan-wait', { on: false });
    const plan = draft || reading.result?.plan;
    const facts = planFacts(plan);
    const res = reading.result || {};
    const m = await loadHandoff();
    let inline = null;
    try {
      await m?.putHomePlan?.(profile.id, { plan, underlays: res.underlays, source: res.source, confidence: res.confidence });
      if (reading.file) await m?.putPlanFile?.(profile.id, reading.file);
      inline = m?.compactPlan ? m.compactPlan(plan) : null;
    } catch {
      inline = null;
    }
    setHome((h) => ({
      ...h,
      plan: {
        state: res.status === 'rough' ? 'rough' : 'read',
        source: reading.from || h.plan?.source || null,
        floors: facts.floors,
        rooms: facts.rooms,
        summary: { bedrooms: facts.bedrooms, bathrooms: facts.bathrooms, areaSqft: facts.areaSqft },
        confidence: Number.isFinite(res.confidence) ? Math.round(res.confidence * 100) / 100 : undefined,
        ...(inline ? { inline } : {}),
      },
    }));
    go('generate');
  };

  const relabel = async (roomId, type) => {
    const mod = await loadReader();
    setDraft((p) => (typeof mod?.relabelRoom === 'function' ? mod.relabelRoom(p, roomId, type) : relabelLocal(p, roomId, type)));
  };
  const remove = async (roomId) => {
    const mod = await loadReader();
    setDraft((p) => (typeof mod?.removeRoom === 'function' ? mod.removeRoom(p, roomId) : removeLocal(p, roomId)));
  };

  const retake = () => {
    readAbort.current?.abort?.();
    moreAbort.current?.abort?.();
    moreRef.current = false;
    setMore({ state: 'idle', pct: 0 });
    tellShell('plan-wait', { on: false });
    setReading({ state: 'idle', pct: 0 });
    setDraft(null);
    setHome((h) => ({ ...h, plan: { state: 'none', source: null } }));
    go('plan');
  };

  // G：生成我的家 → 3D
  const generate = async (e) => {
    if (busy) return;
    setBusy(true);
    const btn = e?.currentTarget;
    if (btn) fx.scan(btn);
    sfx.play('achievement');
    const h = { ...homeRef.current, done: true, template: homeRef.current.template || templateFor(homeRef.current) };
    const p = withHome(profile, h, chosen);
    saveToArchive(p);
    onProfile?.(p);
    clearHomeSession();
    // 许愿模式的外壳：这一位客人走完了「带它回家」（3D 里出现「留下联系方式」那一步用）
    tellShell('home-done', { id: p.id });
    if (CONFIG.endpoint) postProfile(p, profileText(p, storagePlan(p.storage, APPLIANCES), '', { client: true }));
    // 链接太长（> 6,000 字）：小平面不放进链接（同一台设备从 IndexedDB 读；别的设备用示范户型）
    const { packed } = await packForStudio(p);
    const q = new URLSearchParams();
    if (WISH) q.set('mode', 'wish');
    else if (STAFF) q.set('staff', '1');
    q.set('from', 'home');
    if (p.caseId) q.set('case', p.caseId);
    const href = withLang(new URL(`studio.html?${q.toString()}#p=${packed}`, location.href).href);
    const w = fx.wipe(null, { tone: 'dusk', duration: 900, hold: true });
    settle(
      null,
      w.mid,
      () => {
        tellShell('leaving', { to: 'studio', tone: 'dusk' });
        location.assign(href);
      },
      900
    );
  };

  // ───────── 画面 ─────────
  const matchProfile = useMemo(() => ({ ...profile, home }), [profile, home]);
  const caseMats = useMemo(() => (chosen[0] ? C.caseMaterials(chosen[0]) : profile.materials || {}), [chosen, profile]);

  let body = null;
  const nextOf = (s) => () => go(s);
  if (step === 'type') body = <TypeStep home={home} set={set} next={nextOf('where')} />;
  else if (step === 'where') body = <WhereStep home={home} set={set} next={nextOf('status')} />;
  else if (step === 'status') body = <StatusStep home={home} set={set} next={nextOf('size')} />;
  else if (step === 'size') body = <SizeStep home={home} set={set} next={nextOf('scope')} />;
  else if (step === 'scope') body = <ScopeStep home={home} set={set} next={nextOf('cases')} profileId={profile.id} askBudget={ASK_BUDGET} />;
  else if (step === 'cases')
    body = (
      <CasesStep
        profile={matchProfile}
        initial={chosen}
        onDone={(cs, info) => {
          if (info?.empty) noCases.current = true;
          setChosen(cs);
          const h = { ...homeRef.current, casesDone: true };
          setHome(h);
          persist(h, cs);
          go(home.plan?.state === 'read' || home.plan?.state === 'rough' ? (needsKeep(h) ? 'keep' : 'generate') : 'plan');
        }}
      />
    );
  else if (step === 'plan')
    body = (
      <PlanStep
        caseTitle={chosen[0] ? L(chosen[0].title) : ''}
        wish={WISH}
        canCamera={canUseCamera()}
        error={planErr}
        onFile={onPlanFile}
        onCamera={() => setCam(true)}
        onStaff={chooseStaff}
        onLater={chooseLater}
      />
    );
  else if (step === 'wait')
    body = (
      <div className="step hj-card pp-wait">
        <Pangie mood="happy" prop="none" size={104} float={false} speaker />
        <Head eyebrow={t('最后一步')} title={lineText('plan.staff')} lead={t('员工在员工区上传好，我就会马上开始读。')} />
        <div className="q-actions">
          {needsKeep(home) && !keepSeen.current && <Next onClick={() => go('keep')}>{t('先选留下来的颜色')}</Next>}
          <button type="button" className="btn btn-line" onClick={chooseLater}>
            <House size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>{t('我还没有户型图')}</span>
          </button>
        </div>
      </div>
    );
  else if (step === 'keep') body = <KeepStep home={home} set={set} caseMats={caseMats} reading={reading} thumb={reading.thumb} next={afterKeep} />;
  else if (step === 'read')
    body = (
      <div className="step hj-card pp-wait">
        <Pangie mood="think" prop="magnifier" size={110} float={false} speaker />
        <Head eyebrow={t('户型图')} title={lineText('plan.reading')} />
        <ReadingPill reading={reading} thumb={reading.thumb} />
        {Number.isFinite(reading.eta) && reading.eta > 2 && <p className="pp-eta">{t('大约还要 {0} 秒', [Math.round(reading.eta)])}</p>}
      </div>
    );
  else if (step === 'confirm' && draft)
    body = (
      <PlanConfirm
        result={reading.result}
        plan={draft}
        home={home}
        onRelabel={relabel}
        onRemove={remove}
        onYes={confirmYes}
        onRetake={retake}
        more={more}
        onAddFloor={addFloor}
        wish={WISH}
        canCamera={canUseCamera()}
      />
    );
  else if (step === 'confirm' || step === 'unreadable')
    body = (
      <div className="step hj-card pp-wait">
        <Pangie mood="think" prop="magnifier" size={104} float={false} />
        <Head eyebrow={t('户型图')} title={t('这张我读不清')} lead={t('先用最接近的示范户型给你看，设计师会照你的户型图重新画。')} />
        <div className="q-actions">
          <button type="button" className="btn btn-line" onClick={retake} data-sfx="back">
            {WISH ? <CameraIcon size={18} strokeWidth={1.8} aria-hidden="true" /> : <RotateCcw size={18} strokeWidth={1.8} aria-hidden="true" />}
            <span>{t('再拍一张')}</span>
          </button>
          <Next
            onClick={() => {
              setHome((h) => ({ ...h, plan: { ...h.plan, state: 'unreadable' }, template: templateFor(h) }));
              go(needsKeep(homeRef.current) && !keepSeen.current ? 'keep' : 'generate');
            }}
          >
            {t('先这样')}
          </Next>
        </div>
      </div>
    );
  else if (step === 'generate') body = <GenerateStep profile={profile} home={home} chosen={chosen} onGo={generate} busy={busy} />;

  const plain = step === 'cases';
  const scene = dusk ? 'dusk' : 'welcome';
  const line = bubble ?? (VOICE[step] && !['wait', 'read', 'generate'].includes(step) ? lineText(VOICE[step]) : BUBBLE[step] ? t(BUBBLE[step]) : '');
  const showCompanion = !plain && !dusk && !['wait', 'read', 'unreadable'].includes(step) && !(step === 'confirm' && !draft);
  const prop = ['read', 'keep', 'confirm'].includes(step) ? 'magnifier' : 'ball';

  return (
    <div className={`qz ${dusk ? 'dusk' : 'morning'} qz-home ${plain ? 'is-plain cs-page' : ''} ${!plain && usesPhoto(scene) ? 'on-photo' : ''} ${WISH ? 'is-wish' : ''}`}>
      {!plain && <Scenery scene={scene} next={scene} />}
      <TopBar mid={<HomeSteps now={stepIndex(step)} />} onBack={back} canBack={!busy} pct={false} />
      {plain ? (
        <main className="stage-cases" key={step}>
          {body}
        </main>
      ) : (
        <main className={`stage ${showCompanion ? 'has-companion' : ''} ${HOME_STEPS.includes(step) || step === 'keep' ? '' : 'is-wide'}`} key={step}>
          {body}
        </main>
      )}
      {showCompanion && <Companion mood={step === 'confirm' ? 'happy' : 'idle'} line={line} stepId={`home:${step}`} prop={prop} speaker={!idlePrompt} />}
      {cam && (
        <Camera
          onClose={() => {
            moreRef.current = false;
            setCam(false);
          }}
          onShot={(file) => {
            setCam(false);
            if (moreRef.current && stepRef.current === 'confirm') readMore(file, 'camera');
            else onPlanFile(file, 'camera');
          }}
        />
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
    </div>
  );
}
