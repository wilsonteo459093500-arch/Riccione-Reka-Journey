// 走进去（SPEC §5 · §10）：人的眼睛走进家里的那一层界面。StudioApp 懒加载它（点了金色的「走进去」才下载这一块）。
//   挂上去 → createWalk(engine, …) + enter()（镜头从大门飞进去）；卸下 → dispose()（马上回到鸟瞰，一个像素都不变）；
//   方案变了（换材质、挪家具、收藏角度、撤销）→ controller.update(project)。
//   「回到全屋」（data-walk="exit"，脚本点它）→ 先 controller.exit()（飞回去），再 onExit()。键盘 Esc：先收起工具面板，再回到全屋。
//   排版：左上「回到全屋」+ 撤销 · 右上小地图 · 左下摇杆 · 下面居中工具轮（正在用的工具的面板在它上面）· 潘吉带逛在摇杆上面。
//   上面居中（提示 api.flash 的位置）、许愿模式右下角外壳的胶囊那一块都留空（walk.css）。飞进 / 飞出的时候界面藏起来。
//   第一次走进去（这一页开着的期间；不存）潘吉自动带逛；之后只有按「带我逛逛」才开始。
// props = { engine, project, api, wish, staff, onExit }
import './words.js';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../../shared/i18n.js';
import { Icon } from '../ui/kit.jsx';
import { createWalk } from './controller.js';
import Joystick from './Joystick.jsx';
import Minimap from './Minimap.jsx';
import ToolWheel from './ToolWheel.jsx';
import TourBubble from './TourBubble.jsx';
import PaintTray from './PaintTray.jsx';
import FurnishPanel from './FurnishPanel.jsx';
import LightPanel from './LightPanel.jsx';
import MeasureLayer from './MeasureLayer.jsx';
import PhotoPanel from './PhotoPanel.jsx';
import './walk.css';

/** 工具 → 画在工具轮上面的面板（量尺另外画在整层上：标签要跟着 3D 的点走） */
export const PANELS = { paint: PaintTray, floor: PaintTray, furnish: FurnishPanel, light: LightPanel, photo: PhotoPanel };

const STUCK_MS = 7000; // 飞了这么久还没好：先把「回到全屋」露出来（别把人关在里面）
const IDLE_TOUR = { running: false, index: -1, total: 0, stop: null, line: null, phase: 'idle' };

// 这一页开着的期间走进去过没有（第一次潘吉自动带逛）。故意不存：下一位客人重新载入页面又是第一次
let toured = false;

const cls = (...a) => a.filter(Boolean).join(' ');

/** 事件给的可能是 { phase } / { fi } / { room }，也可能直接是值 */
export const phaseOf = (e) => (typeof e === 'string' ? e : e?.phase || null);
export const floorOf = (e) => (Number.isInteger(e) ? e : Number.isInteger(e?.fi) ? e.fi : null);
export function roomOf(plan, e) {
  const r = e && typeof e === 'object' && 'room' in e ? e.room : e;
  if (!r) return null;
  if (typeof r === 'object') return r;
  for (const f of plan?.floors || []) for (const x of f.rooms || []) if (x.id === r) return x;
  return null;
}

function useMedia(q) {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia?.(q) : null;
    if (!mq) return undefined;
    const up = () => setOn(mq.matches);
    up();
    mq.addEventListener?.('change', up);
    return () => mq.removeEventListener?.('change', up);
  }, [q]);
  return on;
}

export default function WalkMode({ engine, project, api, wish = false, staff = false, onExit }) {
  const [ctl, setCtl] = useState(null);
  const [phase, setPhase] = useState('flying-in');
  const [tool, setTool] = useState('walk');
  const [fi, setFi] = useState(0);
  const [room, setRoom] = useState(null);
  const [tour, setTour] = useState(IDLE_TOUR);
  const [going, setGoing] = useState(null); // 点了楼层标签、正在走过去的那一层
  const [stuck, setStuck] = useState(false);
  const phone = useMedia('(max-width: 600px)');
  const compact = useMedia('(max-width: 1023px)');

  const root = useRef(null);
  const dock = useRef(null);
  const exiting = useRef(false);
  const projRef = useRef(project);
  projRef.current = project;
  const sent = useRef(project); // controller 手里的是哪一份方案
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const toolRef = useRef(tool);
  toolRef.current = tool;

  const leave = useCallback(() => {
    exiting.current = true;
    exitRef.current?.();
  }, []);

  // ── 控制器：挂上去就走进去，卸下就马上回到鸟瞰 ──
  useEffect(() => {
    if (!engine) return undefined;
    let alive = true;
    let inside = false; // 看到过「出去」以外的状态（控制器自己退出来 → 外面也关掉）
    const c = createWalk(engine, { project: projRef.current, api, wish });
    sent.current = projRef.current;
    const offs = [
      c.on?.('state', (e) => {
        const p = phaseOf(e);
        if (!alive || !p) return;
        if (p !== 'out') inside = true;
        setPhase(p);
        if (p === 'out' && inside && !exiting.current) leave();
      }),
      c.on?.('floor', (e) => {
        const f = floorOf(e);
        if (alive && f != null) setFi(f);
      }),
      c.on?.('room', (e) => alive && setRoom(e && typeof e === 'object' && 'room' in e ? (e.room ?? null) : (e ?? null))),
      c.on?.('tourState', (s) => alive && s && setTour({ ...IDLE_TOUR, ...s })),
      c.on?.('tour', () => {
        const s = c.tour?.state?.();
        if (alive && s) setTour({ ...IDLE_TOUR, ...s });
      }),
      // 走着走着出错：控制器自己一下子退出来（'state' out → 上面关掉这一层），这里只说一声
      c.on?.('error', () => alive && !exiting.current && api?.flash?.(t('走进去出了点问题，已回到全屋'), 4200)),
    ];
    setCtl(c);
    Promise.resolve()
      .then(() => c.enter())
      .then(() => {
        if (!alive || exiting.current) return;
        setPhase((p) => (p === 'flying-in' ? c.phase || 'walking' : p));
        const p = c.pose?.();
        if (Number.isInteger(p?.fi)) setFi(p.fi);
      })
      .catch((err) => {
        if (!alive || exiting.current) return;
        if (import.meta.env?.DEV) console.error('[walk]', err);
        try {
          c.dispose();
        } catch {
          /* 已经退干净了 */
        }
        api?.flash?.(t('走进去出了点问题，已回到全屋'), 4200);
        leave();
      });
    return () => {
      alive = false;
      for (const off of offs) if (typeof off === 'function') off();
      c.dispose();
    };
  }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 方案变了：交给控制器（家具变了它会重算能走的地方） ──
  useEffect(() => {
    if (!ctl || project === sent.current) return;
    sent.current = project;
    ctl.update?.(project);
  }, [ctl, project]);

  // ── 工具 ──
  useEffect(() => {
    ctl?.setTool?.(tool);
  }, [ctl, tool]);
  const pick = (id) => {
    if (id !== 'walk' && ctl?.tour?.running) ctl.tour.stop(); // 拿起工具 = 自己逛了
    setTool(id);
  };
  const close = useCallback(() => setTool('walk'), []);

  // ── 第一次走进去：潘吉自动带逛 ──
  const live = phase === 'walking';
  useEffect(() => {
    if (!live || !ctl || toured) return;
    toured = true;
    ctl.tour?.start?.();
  }, [live, ctl]);

  // ── 回到全屋 ──
  const exit = async () => {
    if (exiting.current) {
      // 已经在飞回去了但卡住（「回到全屋」是靠 STUCK_MS 才露出来的）：马上退出
      if (stuck) {
        try {
          ctl?.dispose();
        } catch {
          /* 已经退干净了 */
        }
        exitRef.current?.();
      }
      return;
    }
    exiting.current = true;
    if (ctl?.tour?.running) ctl.tour.stop();
    try {
      await ctl?.exit?.();
    } catch {
      /* 卸载时 dispose() 会马上退干净 */
    }
    exitRef.current?.();
  };
  const exitNow = useRef(exit);
  exitNow.current = exit;

  // 飞太久：露出「回到全屋」
  useEffect(() => {
    if (live) return setStuck(false);
    const tm = setTimeout(() => setStuck(true), STUCK_MS);
    return () => clearTimeout(tm);
  }, [live]);

  // Esc：先收起工具面板，再回到全屋（确认框开着的时候让它自己处理）
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.repeat) return;
      if (e.target?.closest?.('input,textarea,select') || document.querySelector('.s-modal-wrap')) return;
      if (toolRef.current !== 'walk') setTool('walk');
      else exitNow.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 工具轮 + 面板有多高（手机上摇杆、潘吉跟着往上让）
  useLayoutEffect(() => {
    const el = dock.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => root.current?.style.setProperty('--walk-dock-h', `${Math.round(el.offsetHeight)}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── 小地图、摇杆 ──
  const stopTour = () => ctl?.tour?.running && ctl.tour.stop();
  const walkTo = (p) => {
    stopTour();
    ctl?.walkTo?.(p);
  };
  const goFloor = (i) => {
    stopTour();
    setGoing(i);
    Promise.resolve(ctl?.goFloor?.(i))
      .catch(() => false)
      .then(() => setGoing((g) => (g === i ? null : g)));
  };
  const joy = (x, y) => {
    if ((x || y) && ctl?.tour?.running) ctl.tour.stop();
    ctl?.joystick?.(x, y);
  };

  const canUndo = live && !!api?.canUndo?.();
  const here = roomOf(project?.plan, room);
  const Panel = live ? PANELS[tool] : null;
  const panelProps = { ctl, engine, project, api, wish, staff, room: here, fi, mode: tool, onClose: close };
  const showTour = live && (tour.running || tool === 'walk');

  return (
    <div ref={root} className={cls('walk-ui', live && 'is-live', !live && stuck && 'is-stuck', phone && 'is-phone', `tool-${tool}`)}>
      <div className="walk-top">
        <button type="button" className="walk-exit glass" data-walk="exit" data-sfx="back" onClick={exit}>
          <Icon name="home" size={17} />
          <span>{t('回到全屋')}</span>
        </button>
        {canUndo && (
          <button type="button" className="walk-undo glass" aria-label={t('撤销')} title={t('撤销')} onClick={() => api.undo?.()}>
            <Icon name="undo" size={18} />
          </button>
        )}
      </div>

      <Minimap ctl={ctl} plan={project?.plan} fi={fi} room={here} going={going} size={phone ? 'phone' : compact ? 'compact' : 'wide'} onWalk={walkTo} onFloor={goFloor} />

      {live && tool === 'measure' && <MeasureLayer {...panelProps} />}

      {showTour && <TourBubble {...tour} onNext={() => ctl?.tour?.next?.()} onSkip={() => ctl?.tour?.stop?.()} onStart={tool === 'walk' ? () => ctl?.tour?.start?.() : undefined} />}

      <Joystick onMove={joy} disabled={!live} />

      <div ref={dock} className="walk-dock">
        {Panel && (
          <div className="walk-panel-slot" key={tool}>
            <Panel {...panelProps} />
          </div>
        )}
        <ToolWheel tool={tool} onPick={pick} />
      </div>
    </div>
  );
}
