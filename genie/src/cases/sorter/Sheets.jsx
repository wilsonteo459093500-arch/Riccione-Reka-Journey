// 案例整理 · 弹出来的卡：看大图、选房间、AI 帮我填、存进案例库 / 导出、键盘说明、改名 / 合并。

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Library, Merge, Scissors, Sparkles, Star, X, Check, TriangleAlert, Loader } from 'lucide-react';
import { t, L, isEn } from '../../shared/i18n.js';
import { ROOMS, roomLabel } from '../../shared/cases.js';
import { MAT_BY_ID, fits } from '../../shared/materials.js';
import fx from '../../shared/fx.js';
import { sfx } from '../../shared/sfx.js';
import { whyLabel } from './Row.jsx';
import { fmtMB } from './pack.js';
import { getData } from './data.js';

/** AI 只回答真的房间（不会回答「整个家（3D）」） */
const ROOM_CHOICES = ROOMS.filter((r) => r.id !== 'plan3d');
/**
 * 员工标房间的快捷键（RoomPicker 打开时：按 R，或者点照片下面的房间小标签）。
 * 常用的用数字，少用的用英文首字母；标完一张自动跳到下一张。
 */
export const ROOM_KEYS = [
  ['1', 'living'],
  ['2', 'dining'],
  ['3', 'kitchen'],
  ['4', 'master'],
  ['5', 'bedroom'],
  ['6', 'kids'],
  ['7', 'study'],
  ['8', 'bath'],
  ['9', 'foyer'],
  ['0', 'plan3d'],
  ['F', 'family'],
  ['W', 'walkin'],
  ['B', 'balcony'],
];
const KEY_OF = Object.fromEntries(ROOM_KEYS.map(([k, r]) => [r, k]));
const ROOM_OF_KEY = Object.fromEntries(ROOM_KEYS.map(([k, r]) => [k.toLowerCase(), r]));
const PICK_ROOMS = ROOM_KEYS.map(([, r]) => ROOMS.find((x) => x.id === r)).filter(Boolean);

export function Veil({ children, onClose, full = false }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className={`mg-veil so-veil ${full ? 'is-full' : ''}`} onPointerDown={(e) => e.target === e.currentTarget && (sfx.play('close'), onClose())}>
      {children}
    </div>
  );
}

function SheetHead({ title, onClose }) {
  return (
    <header>
      <b>{title}</b>
      <button type="button" className="mg-x" data-sfx="close" aria-label={t('关闭')} onClick={onClose}>
        <X size={18} strokeWidth={2} />
      </button>
    </header>
  );
}

// ───────────────────────── 看大图 ─────────────────────────

export function Preview({ s, pool, gid, k0, onClose }) {
  const g = s.groups.find((x) => x.id === gid);
  const order = useMemo(() => (g ? s.orderOf(g) : []), [g, s]);
  const [k, setK] = useState(k0);
  const [img, setImg] = useState(null);
  const i = order.indexOf(k);
  useEffect(() => {
    let alive = true;
    let url = null;
    setImg(null);
    const f = s.files.get(k);
    if (!f?.file) return undefined;
    pool
      .run({ op: 'preview', file: f.file, long: 1400 }, { urgent: true })
      .then(({ blob, w, h }) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setImg({ url, w, h });
      })
      .catch(() => alive && setImg({ error: true }));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [k]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' && i < order.length - 1) setK(order[i + 1]);
      if (e.key === 'ArrowLeft' && i > 0) setK(order[i - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [i, order]);
  if (!g) return null;
  const picked = s.pickedOf(g);
  const isPicked = picked.includes(k);
  const isCover = picked[0] === k;
  const a = s.an.get(k);
  const why = s.hiddenWhy(g, k);
  const toggle = () => {
    const cur = s.pickedOf(g);
    s.setDecision(g.id, { picked: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] });
  };
  return (
    <Veil onClose={onClose} full>
      <div className="so-lb" role="dialog" aria-modal="true" aria-label={t('看大图')}>
        <header className="so-lb-top">
          <b>{L(s.label(g))}</b>
          <span>
            {i + 1} / {order.length}
          </span>
          <button type="button" className="mg-x" data-sfx="close" aria-label={t('关闭')} onClick={onClose}>
            <X size={18} strokeWidth={2} />
          </button>
        </header>
        <div className="so-lb-stage">
          <button type="button" className="so-lb-nav" disabled={i <= 0} aria-label={t('上一张')} onClick={() => setK(order[i - 1])}>
            <ChevronLeft size={26} strokeWidth={1.8} />
          </button>
          <div className="so-lb-img">{img?.url ? <img src={img.url} alt="" /> : img?.error ? <p>{t('这张图打不开')}</p> : <Loader className="so-spin" size={26} strokeWidth={1.6} aria-hidden="true" />}</div>
          <button type="button" className="so-lb-nav" disabled={i >= order.length - 1} aria-label={t('下一张')} onClick={() => setK(order[i + 1])}>
            <ChevronRight size={26} strokeWidth={1.8} />
          </button>
        </div>
        <footer className="so-lb-foot">
          <span className="so-lb-meta">
            {a && `${a.w}×${a.h}`}
            {why?.length > 0 && <em> · {why.map(whyLabel).join(' · ')}</em>}
            {s.roomOf(g, k) && <em> · {roomLabel(s.roomOf(g, k))}</em>}
          </span>
          <span className="so-sp" />
          <button type="button" className="btn-ghost so-mini" data-sfx="tap" onClick={() => (s.split(g.id, k), onClose())} disabled={i <= 0}>
            <Scissors size={15} strokeWidth={2} aria-hidden="true" />
            {t('从这张开始拆成新项目')}
          </button>
          <button type="button" className={`btn-line small ${isCover ? 'so-on' : ''}`} data-sfx="select" onClick={() => s.setDecision(g.id, { picked: isPicked ? picked : [k, ...picked], cover: k })}>
            <Star size={15} strokeWidth={2} fill={isCover ? 'currentColor' : 'none'} aria-hidden="true" />
            {isCover ? t('封面') : t('设为封面')}
          </button>
          <button type="button" className={isPicked ? 'btn-primary small' : 'btn-line small'} data-sfx="choice" onClick={toggle}>
            {isPicked ? <Check size={15} strokeWidth={2.4} aria-hidden="true" /> : null}
            {isPicked ? t('要这张') : t('要这张？')}
          </button>
        </footer>
      </div>
    </Veil>
  );
}

// ───────────────────────── 选房间 ─────────────────────────

export function RoomPicker({ s, gid, k, anchor, onClose, onNext }) {
  const g = s.groups.find((x) => x.id === gid);
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    const r = anchor?.getBoundingClientRect?.();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const w = Math.min(360, W - 24);
    if (!r) return setPos({ left: (W - w) / 2, top: H / 3, w });
    const left = Math.max(12, Math.min(W - w - 12, r.left - 20));
    const below = r.bottom + 8;
    setPos({ left, top: below + 250 > H ? Math.max(12, r.top - 258) : below, w });
  }, [anchor]);
  const set = (room, { next = false } = {}) => {
    const rooms = { ...(s.decision(gid).rooms || {}) };
    if (room) rooms[k] = room;
    else delete rooms[k];
    s.setDecision(gid, { rooms });
    if (next && onNext) onNext(k);
    else onClose();
  };
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    // 键盘：数字 / 字母 = 标这张，然后跳到下一张；⌫ = 不知道；Esc = 关
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') return onClose();
      const room = ROOM_OF_KEY[String(e.key).toLowerCase()];
      if (room) {
        e.preventDefault();
        sfx.play('select'); // 点按钮的声音由 installSfx 管；键盘这里自己响一下
        set(room, { next: true });
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        sfx.play('deselect');
        set(null, { next: true });
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  });
  if (!g || !pos) return null;
  const cur = s.roomOf(g, k);
  return (
    <div ref={ref} className="so-pop" role="dialog" aria-label={t('这张是哪个房间')} style={{ left: pos.left, top: pos.top, width: pos.w }}>
      <p>{t('这张是哪个房间')}</p>
      <div className="so-pop-chips" data-sfx="radio">
        {PICK_ROOMS.map((r) => (
          <button key={r.id} type="button" className={`chip so-chip ${cur === r.id ? 'on' : ''}`} aria-pressed={cur === r.id} onClick={() => set(r.id)}>
            <kbd>{KEY_OF[r.id]}</kbd>
            {L(r)}
          </button>
        ))}
        <button type="button" className={`chip so-chip ${cur ? '' : 'on'}`} onClick={() => set(null)}>
          <kbd>⌫</kbd>
          {t('不知道')}
        </button>
      </div>
      <small className="so-pop-tip">{t('按键标好，自动跳到下一张')}</small>
    </div>
  );
}

// ───────────────────────── 改名 / 合并 ─────────────────────────

export function Rename({ s, gid, onClose }) {
  const g = s.groups.find((x) => x.id === gid);
  const [v, setV] = useState(() => (g ? s.decision(gid).label || L(s.label(g)) : ''));
  if (!g) return null;
  const save = () => {
    s.setDecision(gid, { label: v.trim() || undefined });
    onClose();
  };
  return (
    <Veil onClose={onClose}>
      <form
        className="mg-ask so-ask"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h2>{t('改项目的名字')}</h2>
        <p>{t('只在整理的时候给员工看；客人看到的标题由风格 + 房子自动生成。不要写客人的名字。')}</p>
        <input className="so-input" value={v} onChange={(e) => setV(e.target.value)} autoFocus maxLength={40} />
        <div className="mg-ask-acts">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('取消')}
          </button>
          <button type="submit" className="btn-gold">
            {t('好')}
          </button>
        </div>
      </form>
    </Veil>
  );
}

export function MergePick({ s, gid, onPick, onClose }) {
  const g = s.groups.find((x) => x.id === gid);
  if (!g) return null;
  const near = s.groups.filter((x) => x.id !== gid && x.kind === g.kind && (x.city === g.city || !g.city)).slice(0, 60);
  return (
    <Veil onClose={onClose}>
      <div className="mg-sheet so-sheet" role="dialog" aria-modal="true">
        <SheetHead title={t('把「{0}」并到哪个项目？', [L(s.label(g))])} onClose={onClose} />
        <div className="so-sheet-body so-merge">
          {near.map((x) => (
            <button key={x.id} type="button" className="so-merge-row" data-sfx="drop" onClick={() => onPick(gid, x.id)}>
              <Merge size={15} strokeWidth={2} aria-hidden="true" />
              <b>{L(s.label(x))}</b>
              <span>{t('{0} 张', [x.keys.length])}</span>
            </button>
          ))}
          {!near.length && <p className="so-muted">{t('同一个城市里没有别的项目。')}</p>}
        </div>
      </div>
    </Veil>
  );
}

// ───────────────────────── 键盘 ─────────────────────────

const KEYS = [
  ['J / ↓', '下一个项目'],
  ['K / ↑', '上一个项目'],
  ['1 – 9', '风格（再按一次取消）'],
  ['⇧1 – ⇧6', '房子类型'],
  ['C', '业主同意 ✓'],
  ['↵', '好了，下一个'],
  ['X', '跳过这个项目'],
  ['← / →', '在照片之间移动'],
  ['空格', '要 / 不要这张'],
  ['S', '设为封面'],
  ['E', '展开 / 收起其它照片'],
  ['V', '看大图'],
  ['R', '给这张标房间（1 客厅 · 2 餐厅 · 3 厨房 · 4 主卧 · 5 卧室 · 6 儿童房 · 7 书房 · 8 浴室 · 9 玄关 · 0 整个家 3D · F 起居厅 · W 衣帽间 · B 阳台；标完跳到下一张）'],
  ['?', '这张说明'],
];
export function Help({ onClose }) {
  return (
    <Veil onClose={onClose}>
      <div className="mg-sheet so-sheet so-help" role="dialog" aria-modal="true">
        <SheetHead title={t('键盘：一只手就能整理完')} onClose={onClose} />
        <div className="so-sheet-body">
          <dl className="so-keys">
            {KEYS.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{t(k)}</kbd>
                </dt>
                <dd>{t(v)}</dd>
              </div>
            ))}
          </dl>
          <p className="so-muted">{t('目标：一个项目 30 秒 —— 看一眼照片，按风格、房子、C、回车。')}</p>
        </div>
      </div>
    </Veil>
  );
}

// ───────────────────────── AI 帮我填 ─────────────────────────

/** 「AI 帮我填」的设定（这台电脑）：'auto' = 员工同意过，以后看完照片就自动帮忙填房间和风格 */
export const AI_PREF_KEY = 'genie.sorter.ai.v1';
export const aiPref = () => {
  try {
    return localStorage.getItem(AI_PREF_KEY) || '';
  } catch {
    return '';
  }
};
export const setAiPref = (v) => {
  try {
    if (v) localStorage.setItem(AI_PREF_KEY, v);
    else localStorage.removeItem(AI_PREF_KEY);
  } catch {
    /* 隐私模式：只在这一页记得 */
  }
};
/** 还没看、照片分析完、还没用过 AI 的项目 */
export const aiTargets = (s) => s.groups.filter((g) => (g.kind === 'home' || s.include[g.kind]) && s.stateOf(g) === 'todo' && s.analysedShare(g) >= 1 && s.pickedOf(g).length && !s.decision(g.id).ai);
/** 这台设备上有没有 Gemini key（3D 工作室的设置）—— 没有就不提 AI */
export async function hasAiKey() {
  try {
    const { loadSettings } = await import('../../studio/store.js');
    return !!loadSettings()?.apiKey;
  } catch {
    return false;
  }
}

/**
 * 把这些项目挑好的照片（每个项目最多 6 张，≈ 512 px，没有元数据）发给 Gemini，预填房间、风格、材质、颜色。
 * 只填员工还没填的房间；风格只是建议（带「AI」小字），员工按「好了」才算。
 * → { ok, err, stopped }
 */
export async function runAutoTag(s, pool, targets, { signal, onProg } = {}) {
  const { loadSettings } = await import('../../studio/store.js');
  const settings = loadSettings();
  if (!settings?.apiKey) return { ok: 0, err: 'nokey' };
  const { callGemini, imagePart } = await import('../../studio/plan/ai.js');
  const { autoTagGroup, vocab, AI_SLOTS } = await import('./ai.js');
  const D = getData();
  const mats = Object.fromEntries(AI_SLOTS.map((slot) => [slot, [...new Set(D.styles.flatMap((st) => st.mats?.[slot] || []))].filter((id) => MAT_BY_ID[id] && fits(id, slot))]));
  const v = vocab({ rooms: ROOM_CHOICES.map((r) => r.id), mats });
  let ok = 0;
  for (let i = 0; i < targets.length; i++) {
    if (signal?.aborted) return { ok, stopped: true };
    const g = targets[i];
    onProg?.({ i, n: targets.length, ok });
    try {
      const keys = s.pickedOf(g).slice(0, 6);
      const images = [];
      for (const k of keys) {
        const { blob } = await pool.run({ op: 'preview', file: s.files.get(k).file, long: 512, type: 'image/jpeg', q: 0.8 }, { urgent: true });
        images.push(
          await new Promise((res) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.readAsDataURL(blob);
          })
        );
      }
      const r = await autoTagGroup({ images, settings, call: callGemini, imagePart, v, signal });
      const d = s.decision(g.id);
      const rooms = { ...(d.rooms || {}) };
      keys.forEach((k, j) => {
        if (r.rooms[j] && !rooms[k]) rooms[k] = r.rooms[j];
      });
      s.setDecision(g.id, { rooms, aiStyles: r.styles, aiMats: Object.keys(r.materials).length ? r.materials : undefined, aiColours: r.colours, ai: Date.now() });
      ok++;
    } catch (e) {
      if (e?.code === 'cancel' || signal?.aborted) return { ok, stopped: true };
      if (e?.code === 'key' || e?.code === 'quota') return { ok, err: e.message || 'key' };
    }
  }
  onProg?.({ i: targets.length, n: targets.length, ok });
  return { ok };
}

export function AiSheet({ s, pool, onClose, onDone, offered = false }) {
  const [phase, setPhase] = useState('ask'); // ask | run | done | nokey | error
  const [prog, setProg] = useState({ i: 0, n: 0, ok: 0, err: '' });
  // 这台电脑以后自动帮我填（员工同意过一次就记住；随时可以在这里取消）—— 一开始不勾（自己弹出来的也一样）：
  // 以后每一批都自动发给 AI 要员工自己勾（opt-in）
  const [auto, setAuto] = useState(() => aiPref() === 'auto');
  const ctl = useRef(null);
  const targets = aiTargets(s);
  const photos = targets.reduce((n, g) => n + Math.min(6, s.pickedOf(g).length), 0);
  useEffect(() => () => ctl.current?.abort(), []);
  const run = async () => {
    if (!(await hasAiKey())) {
      setPhase('nokey');
      return;
    }
    setAiPref(auto ? 'auto' : '');
    ctl.current = new AbortController();
    setPhase('run');
    const res = await runAutoTag(s, pool, targets, { signal: ctl.current.signal, onProg: (p) => setProg((x) => ({ ...x, ...p, err: '' })) });
    if (res.err === 'nokey') return setPhase('nokey');
    if (res.err) {
      setProg((x) => ({ ...x, err: res.err }));
      setPhase('error');
      return;
    }
    setProg((p) => ({ ...p, i: targets.length, ok: res.ok }));
    setPhase('done');
    sfx.play('achievement');
    onDone?.(res.ok);
  };
  return (
    <Veil onClose={onClose}>
      <div className="mg-sheet so-sheet so-ai" role="dialog" aria-modal="true">
        <SheetHead title={t('AI 帮我填（选用）')} onClose={onClose} />
        <div className="so-sheet-body">
          {phase === 'ask' && (
            <>
              <p className="so-lead">{t('AI 看一看每个项目挑好的照片，帮你预填：每张是哪个房间、风格、主要材质、颜色。你再确认就好。')}</p>
              <div className="so-privacy">
                <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" />
                <div>
                  <b>{t('照片会发给 Google')}</b>
                  <p>{t('只发挑好的照片的小图（约 512 px，没有拍摄资料 / 位置），用这台设备上已经设置的 Gemini key。文件夹名字、城市、人名、文件名都不会发出去。不按这个按钮，什么都不会离开这台电脑。')}</p>
                </div>
              </div>
              <p className="so-muted">{targets.length ? t('{0} 个还没看的项目 · {1} 张小图', [targets.length, photos]) : t('没有需要 AI 的项目（只做还没看、已经分析完、还没用过 AI 的）。')}</p>
              <label className="so-switch so-ai-auto">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                <span>{t('以后在这台电脑上：照片看完就自动帮我填房间和风格（同样只发小图；随时可以在这里关掉）')}</span>
              </label>
            </>
          )}
          {phase === 'run' && (
            <div className="so-run">
              <Loader className="so-spin" size={22} strokeWidth={1.8} aria-hidden="true" />
              <p>{t('AI 正在看第 {0} / {1} 个项目…', [prog.i + 1, prog.n])}</p>
              <div className="so-bar">
                <i style={{ width: `${(prog.i / Math.max(1, prog.n)) * 100}%` }} />
              </div>
            </div>
          )}
          {phase === 'done' && <p className="so-lead">{t('填好了 {0} 个项目：带「AI」的是它猜的，看一眼对不对再按「好了」。', [prog.ok])}</p>}
          {phase === 'nokey' && <p className="so-lead">{t('这台设备还没有设置 Gemini key（在 3D 工作室的设置里）。不用 AI 也完全可以整理。')}</p>}
          {phase === 'error' && <p className="so-lead so-warn">{prog.err || t('AI 暂时用不了，稍后再试。')}</p>}
        </div>
        <footer className="so-sheet-foot">
          {phase === 'ask' && (
            <>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  if (!auto && aiPref() === 'auto') setAiPref('');
                  onClose();
                }}
              >
                {t('不用了')}
              </button>
              <button type="button" className="btn-primary small" disabled={!targets.length} onClick={run}>
                <Sparkles size={16} strokeWidth={2} aria-hidden="true" />
                {t('同意，发送 {0} 个项目', [targets.length])}
              </button>
            </>
          )}
          {phase === 'run' && (
            <button type="button" className="btn-line small" onClick={() => ctl.current?.abort()}>
              {t('停下来')}
            </button>
          )}
          {(phase === 'done' || phase === 'nokey' || phase === 'error') && (
            <button type="button" className="btn-primary small" onClick={onClose}>
              {t('好')}
            </button>
          )}
        </footer>
      </div>
    </Veil>
  );
}

// ───────────────────────── 存进案例库 / 导出案例包 ─────────────────────────

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

export function OutputSheet({ s, mode, onClose }) {
  const [phase, setPhase] = useState('ask');
  const [prog, setProg] = useState(null);
  const [res, setRes] = useState(null);
  const ready = s.groups.filter((g) => s.stateOf(g) === 'ready' && (g.kind === 'home' || s.include[g.kind]));
  const toSave = ready.filter((g) => !s.decision(g.id).saved || s.dirty(g));
  const photos = toSave.reduce((n, g) => n + s.pickedOf(g).length, 0);
  const noConsent = ready.filter((g) => !s.decision(g.id).consent && g.kind === 'home').length;
  // 只是「存」、又都存过没改 → 不用再压，直接去案例库
  const nothing = mode !== 'export' && ready.length > 0 && !toSave.length;
  const libHref = `cases.html?staff=1${isEn() ? '&lang=en' : ''}`;
  const go = async () => {
    setPhase('run');
    const r = await s.saveToLibrary(
      toSave.map((g) => g.id),
      { onStep: (p) => setProg(p) }
    );
    let parts = null;
    if (mode === 'export') {
      setProg({ exporting: true });
      const ids = ready.map((g) => s.decision(g.id).saved?.caseId).filter(Boolean);
      parts = await s.exportPacks(ids);
      for (let i = 0; i < parts.length; i++) {
        download(parts[i].blob, parts[i].name);
        if (i < parts.length - 1) await new Promise((r2) => setTimeout(r2, 450));
      }
    }
    setRes({ ...r, parts });
    setPhase('done');
    sfx.play('achievement');
    const el = document.querySelector('.so-out-done');
    if (el) fx.scan(el, { sound: false });
  };
  return (
    <Veil onClose={phase === 'run' ? () => {} : onClose}>
      <div className="mg-sheet so-sheet so-out" role="dialog" aria-modal="true">
        <SheetHead title={mode === 'export' ? t('导出案例包') : t('存进案例库')} onClose={phase === 'run' ? () => {} : onClose} />
        <div className="so-sheet-body">
          {phase === 'ask' && (
            <>
              <p className="so-lead">
                {nothing
                  ? t('这些项目都已经在案例库里了。') + ' ' + t('改过的项目会再存一次；没改过的不用再压。')
                  : mode === 'export'
                  ? t('「好了」的 {0} 个项目先存进这台设备的案例库（草稿），再导出成案例包（WISH-cases-日期.json，太大会自动拆成每份 20 MB 以内）。另一台 iPad 可以「导入案例包」。', [ready.length])
                  : t('「好了」的 {0} 个项目会存成草稿案例：照片压成 1600 px 大图 + 480 px 小图（WebP，拍摄资料 / 位置都去掉）。草稿客人看不到 —— 在案例库里检查一下、上架就好。', [ready.length])}
              </p>
              <ul className="so-facts">
                {toSave.length > 0 && <li>{t('这次要压缩：{0} 个项目 · {1} 张照片', [toSave.length, photos])}</li>}
                {ready.length - toSave.length > 0 && <li>{t('已经存过、没改过的：{0} 个（不用再压）', [ready.length - toSave.length])}</li>}
                {noConsent > 0 && <li className="so-warn">{t('{0} 个还没勾「业主同意」：可以存草稿，但上架前一定要勾', [noConsent])}</li>}
                <li>{t('标题自动生成（风格 · 颜色 · 房子），不会用文件夹名字；城市、人名不会进案例。')}</li>
              </ul>
            </>
          )}
          {phase === 'run' && (
            <div className="so-run">
              <Loader className="so-spin" size={22} strokeWidth={1.8} aria-hidden="true" />
              <p>{prog?.exporting ? t('正在做案例包…') : prog ? t('正在压缩照片 {0}/{1}', [prog.photos, prog.photosTotal]) : t('准备中…')}</p>
              <div className="so-bar">
                <i style={{ width: `${prog?.photosTotal ? (prog.photos / prog.photosTotal) * 100 : prog?.exporting ? 100 : 4}%` }} />
              </div>
            </div>
          )}
          {phase === 'done' && res && (
            <div className="so-out-done">
              <p className="so-lead">
                <Check size={18} strokeWidth={2.4} aria-hidden="true" />{' '}
                {res.parts
                  ? t('案例包做好了：{0} 个案例。', [res.parts.reduce((n, p) => n + p.ids.length, 0)]) + (res.saved.length ? ' ' + t('其中 {0} 个是这次新存的草稿。', [res.saved.length]) : '')
                  : res.saved.length
                  ? t('存好了 {0} 个草稿案例。', [res.saved.length])
                  : t('这些项目都已经在案例库里了。')}
                {res.skipped.length > 0 && ' ' + t('{0} 个还缺资料，没存。', [res.skipped.length])}
              </p>
              {res.parts && (
                <ul className="so-parts">
                  {res.parts.map((p) => (
                    <li key={p.name}>
                      <b>{p.name}</b>
                      <span>
                        {t('{0} 个案例', [p.ids.length])} · {fmtMB(p.blob.size)} MB{p.oversize ? ' · ' + t('超过 20 MB（一个项目的照片太多）') : ''}
                      </span>
                      <button type="button" className="btn-line small" data-sfx="tap" onClick={() => download(p.blob, p.name)}>
                        <Download size={15} strokeWidth={2} aria-hidden="true" />
                        {t('再下载一次')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {res.parts?.length > 1 && <p className="so-muted">{t('合并到网站时每一份各跑一次：node scripts/import-cases.mjs --pack <文件>')}</p>}
            </div>
          )}
        </div>
        <footer className="so-sheet-foot">
          {phase === 'ask' && (
            <>
              <button type="button" className="btn-ghost" onClick={onClose}>
                {t('取消')}
              </button>
              {nothing ? (
                <a className="btn-primary small" href={libHref} data-sfx="open">
                  <Library size={16} strokeWidth={2} aria-hidden="true" />
                  {t('去案例库上架')}
                </a>
              ) : (
                <button type="button" className="btn-primary small" disabled={!ready.length} onClick={go}>
                  {mode === 'export' ? <Download size={16} strokeWidth={2} aria-hidden="true" /> : <Library size={16} strokeWidth={2} aria-hidden="true" />}
                  {mode === 'export' ? t('存好并导出') : t('存进案例库')}
                </button>
              )}
            </>
          )}
          {phase === 'done' && (
            <>
              <button type="button" className="btn-ghost" onClick={onClose}>
                {t('继续整理')}
              </button>
              <a className="btn-primary small" href={libHref} data-sfx="open">
                <Library size={16} strokeWidth={2} aria-hidden="true" />
                {t('去案例库上架')}
              </a>
            </>
          )}
        </footer>
      </div>
    </Veil>
  );
}
