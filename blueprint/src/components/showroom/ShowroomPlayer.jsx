// 展厅播放：在展厅大屏上「滑着看」方案。内容、版面和导出的 PPT 一模一样（renderDeck → exportableSlides），只是动起来。
//
// 控制：鼠标滚轮 / 触控板、触控大屏拖动（上下或左右都行）、方向键 / 空格 / PageDown；停手后轻轻吸到最近的一页，
//       所以停下来的画面永远是完整原图（见 showroom/motion.js 的铁律）。
// 角落：目录（跳到任一空间）· 音乐（第一次点选一首，存在本机）· 全屏 · 退出；鼠标不动 2.5 秒后自动隐藏。

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, Music, VolumeX, Maximize, X } from 'lucide-react';
import SlideCanvas from '../SlideCanvas.jsx';
import { renderDeck, exportableSlides } from '../../engine/deck.js';
import { metaOf, resolveUrl } from '../../store/assets.js';
import { getAssetRecord, putAssetRecord } from '../../store/db.js';
import { buildStops, transitionKind, transitionWeight, indexOf, SECTION_NAMES } from '../../showroom/timeline.js';
import { layerMotion, frameAt, snapTarget, cssOf, clamp01, plan3dMotion, enterProgress } from '../../showroom/motion.js';
import { plan3dKey, peekPlan3d, requestPlan3d, onPlan3dProgress } from '../../showroom/build3dCache.js';
import { matchRoom } from '../../showroom/build3d.js';
import { sketchFrame } from '../../showroom/sketch.js';
import { sketchGeom, peekSketch, requestSketch, onSketchReady } from '../../showroom/sketchCache.js';

const WHEEL_UNIT = 900; // 滚轮 / 触控板：滚多少 px 走一页
const SMOOTH = 0.075; // 每帧（60fps）追上目标的比例：越小越慢越稳
const MIN_SPEED = 0.0035 / 16.7; // 最后一小段的最低速度（页 / ms）
const IDLE_SNAP_MS = 650; // 停手多久后吸到最近一页（触控板慢慢滑、中途停一下也不会被拉回去）
const JUMP_MS = 1400; // 目录跳转的过渡时长
const CHROME_HIDE_MS = 2500;
const MUSIC_ID = 'showroom-music'; // 背景音乐存在素材库里的固定 id（不属于任何项目）
const MUSIC_VOLUME = 0.55;

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

/** 背景音乐：存在本机 IndexedDB；淡入淡出 */
function useMusic() {
  const audio = useRef(null);
  const fade = useRef(0);
  const [hasTrack, setHasTrack] = useState(false);
  const [playing, setPlaying] = useState(false);

  const load = useCallback((blob) => {
    if (audio.current) {
      audio.current.pause();
      URL.revokeObjectURL(audio.current.src);
    }
    const a = new Audio(URL.createObjectURL(blob));
    a.loop = true;
    a.volume = 0;
    audio.current = a;
    setHasTrack(true);
  }, []);

  useEffect(() => {
    let alive = true;
    getAssetRecord(MUSIC_ID)
      .then((rec) => alive && rec?.blob && load(rec.blob))
      .catch(() => {});
    return () => {
      alive = false;
      cancelAnimationFrame(fade.current);
      if (audio.current) {
        audio.current.pause();
        URL.revokeObjectURL(audio.current.src);
      }
    };
  }, [load]);

  const ramp = useCallback((to, ms, done) => {
    const a = audio.current;
    if (!a) return;
    cancelAnimationFrame(fade.current);
    const from = a.volume;
    const t0 = performance.now();
    const step = (now) => {
      const p = clamp01((now - t0) / ms);
      a.volume = from + (to - from) * p;
      if (p < 1) fade.current = requestAnimationFrame(step);
      else done?.();
    };
    fade.current = requestAnimationFrame(step);
  }, []);

  const play = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    a.play()
      .then(() => {
        setPlaying(true);
        ramp(MUSIC_VOLUME, 1500);
      })
      .catch(() => setPlaying(false));
  }, [ramp]);

  const pause = useCallback(() => {
    setPlaying(false);
    ramp(0, 900, () => audio.current?.pause());
  }, [ramp]);

  const choose = useCallback(
    async (file) => {
      if (!file) return;
      await putAssetRecord({ id: MUSIC_ID, projectId: null, blob: file, mime: file.type || 'audio/mpeg', w: 0, h: 0, ts: Date.now(), name: file.name });
      load(file);
      setTimeout(play, 0);
    },
    [load, play]
  );

  return { hasTrack, playing, play, pause, choose };
}

function ChromeButton({ onClick, title, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-2 h-11 px-4 rounded-full bg-black/35 text-white/85 text-sm backdrop-blur-sm hover:bg-black/55 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      {children}
    </button>
  );
}

/** 效果图的「线稿 → 上色」画布：放在效果图原来的框里（同样的裁切），逐帧合成 */
function SketchEl({ el, entry, lineQ, colQ }) {
  const ref = useRef(null);
  const buf = useRef(null);
  const { pl, W, H } = sketchGeom(el);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!buf.current || buf.current.width !== W || buf.current.height !== H) buf.current = ctx.createImageData(W, H);
    sketchFrame(entry.an, entry.src, lineQ, colQ, buf.current.data);
    ctx.putImageData(buf.current, 0, 0);
  }, [entry, lineQ, colQ, W, H]);
  return (
    <div style={{ position: 'absolute', left: pl.x, top: pl.y, width: pl.w, height: pl.h, overflow: 'hidden' }}>
      <canvas ref={ref} width={W} height={H} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

/**
 * 3D 户型开场那一层：关键帧（墙升起、柜子出现）交叉淡化 + 原平面图 + 房间高亮 + 推近
 * 画布内部 1920 × 1080（关键帧 1600 × 900 放大），按 SlideCanvas 一样等比缩放到 width
 */
function Plan3dLayer({ stop, m, width }) {
  const ref = useRef(null);
  const entry = peekPlan3d(plan3dKey(stop.plan3d));
  const W = 1920;
  const H = 1080;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#F3EEE7';
    ctx.fillRect(0, 0, W, H);
    if (!entry) return;
    const { built, frames, plan } = entry;
    const k = W / built.w; // 关键帧 → 画布
    // 推近：以要去的房间中心为原点
    const area = m.zoomArea >= 0 ? built.final.floorAreas[m.zoomArea] : null;
    const fm = built.final.fm;
    const toCanvas = (x, y) => [(fm[0] * x + fm[2] * y + fm[4]) * k, (fm[1] * x + fm[3] * y + fm[5]) * k];
    let cx = W / 2;
    let cy = H / 2;
    if (area) [cx, cy] = toCanvas((area.box[0] + area.box[2]) / 2, (area.box[1] + area.box[3]) / 2);
    if (m.zoom !== 1) ctx.setTransform(m.zoom, 0, 0, m.zoom, cx * (1 - m.zoom), cy * (1 - m.zoom));
    // 关键帧（还没画好的帧用最近的一张顶上）
    const pick = (i) => {
      for (let d = 0; d < frames.length + entry.total; d++) {
        if (frames[i - d]) return frames[i - d];
        if (frames[i + d]) return frames[i + d];
      }
      return null;
    };
    const i0 = Math.floor(m.frameT + 1e-6);
    const frac = m.frameT - i0;
    const a = pick(i0);
    if (a) ctx.drawImage(a, 0, 0, W, H);
    const b = frac > 1e-3 ? frames[i0 + 1] : null;
    if (b) {
      ctx.globalAlpha = frac;
      ctx.drawImage(b, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    // 原平面图：开场先在纸上，再淡成 3D
    const pr = built.final.plan;
    if (plan && pr && m.planAlpha > 0) {
      ctx.globalAlpha = m.planAlpha;
      ctx.fillStyle = '#F3EEE7';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(plan, pr[0] * k, pr[1] * k, (pr[2] - pr[0]) * k, (pr[3] - pr[1]) * k);
      ctx.globalAlpha = 1;
    }
    // 房间高亮（地面上一块暖金色）
    for (const h of m.highlights) {
      const ar = built.final.floorAreas[h.i];
      if (!ar) continue;
      ctx.save();
      ctx.globalAlpha = h.alpha;
      ctx.fillStyle = 'rgba(214, 170, 96, 0.42)';
      ctx.strokeStyle = 'rgba(160, 112, 52, 0.9)';
      ctx.lineWidth = 3;
      for (const r of ar.rects) {
        const pts = [
          [r[0], r[1]],
          [r[2], r[1]],
          [r[2], r[3]],
          [r[0], r[3]],
        ].map(([x, y]) => toCanvas(x, y));
        ctx.beginPath();
        pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  });
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: m.opacity }}>
      <canvas ref={ref} width={W} height={H} style={{ width, height: (width * 9) / 16, display: 'block' }} />
    </div>
  );
}

/** 3D 停点的动效参数（要去的房间：下一页效果图的空间名对到 3D 图上的房间） */
function plan3dInfo(stops, k, role, kind) {
  const stop = stops[k];
  const entry = peekPlan3d(plan3dKey(stop.plan3d));
  const areas = entry?.built.final.floorAreas || [];
  const next = role === 'a' && kind === 'enter' ? stops[k + 1]?.slide : null;
  return { frames: entry?.total || 1, areas: areas.length, target: next ? matchRoom(areas, next) : -1 };
}

/** 一层（一页）：整层透明度 + 每个元素的动效；换到效果图页时，效果图换成「线稿 → 上色」画布 */
function Layer({ stop, role, kind, f, width }) {
  // 3D 开场的前后两页：离开的楼层页照「从无到有」淡出；进来的效果图页照常线稿 → 上色
  const k2 = kind === 'build' ? 'sketch' : kind === 'enter' ? (stop.hero >= 0 ? 'sketch' : 'cut') : kind;
  // 从 3D 停点进房间：先让 3D 图高亮、推近，这一页晚一点才开始画线稿
  const m = layerMotion(role, k2, kind === 'enter' && role === 'b' ? enterProgress(f) : f, stop.page.els);
  const heroEl = stop.hero >= 0 ? stop.page.els[stop.hero] : null;
  const entry = m.sketch && heroEl ? peekSketch(sketchGeom(heroEl).key) : null;
  const elStyle = useCallback((el, i) => (entry && i === stop.hero ? null : cssOf(m.el(el, i))), [m, entry, stop.hero]);
  const replaceEl = useCallback(
    (el, i) => (entry && i === stop.hero ? <SketchEl el={el} entry={entry} lineQ={m.sketch.lineQ} colQ={m.sketch.colQ} /> : null),
    [entry, stop.hero, m]
  );
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: m.opacity }}>
      <SlideCanvas slide={stop.page} width={width} resolveUrl={resolveUrl} elStyle={elStyle} replaceEl={entry ? replaceEl : undefined} />
    </div>
  );
}

function IndexPanel({ stops, current, width, onPick, onClose, music }) {
  const groups = useMemo(() => indexOf(stops), [stops]);
  const fileRef = useRef(null);
  const thumbW = width >= 1400 ? 248 : 200;
  return (
    <div
      className="absolute inset-0 z-20 bg-black/85 backdrop-blur-sm overflow-y-auto"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onClick={onClose}
    >
      <div className="max-w-[1680px] mx-auto px-8 py-10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-8">
          <div className="text-white/90 text-lg tracking-[0.3em]">目录</div>
          <div className="flex items-center gap-2">
            <ChromeButton onClick={() => fileRef.current?.click()} title="换一首背景音乐">
              <Music size={16} />
              {music.hasTrack ? '换音乐' : '选背景音乐'}
            </ChromeButton>
            <ChromeButton onClick={onClose} title="关闭目录">
              <X size={16} />
            </ChromeButton>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              music.choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        {groups.map((g, gi) => (
          <section key={gi} className="mb-8">
            <div className="text-white/50 text-xs tracking-[0.3em] mb-3">{SECTION_NAMES[g.section] || g.section}</div>
            <div className="flex flex-wrap gap-4">
              {g.items.map((it) => {
                const active = stops[current]?.segment === it.segment;
                return (
                  <button
                    key={it.stop}
                    type="button"
                    onClick={() => onPick(it.stop)}
                    className={`text-left rounded-lg overflow-hidden ring-2 transition ${active ? 'ring-white' : 'ring-transparent hover:ring-white/50'}`}
                    style={{ width: thumbW }}
                  >
                    {stops[it.stop].plan3d ? (
                      <div style={{ position: 'relative', width: thumbW, height: (thumbW * 9) / 16 }}>
                        <Plan3dLayer stop={stops[it.stop]} width={thumbW} m={plan3dMotion('a', 'cut', 0, { frames: peekPlan3d(plan3dKey(stops[it.stop].plan3d))?.total || 1, areas: 0 })} />
                      </div>
                    ) : (
                      <SlideCanvas slide={stops[it.stop].page} width={thumbW} resolveUrl={resolveUrl} />
                    )}
                    <div className="px-2 py-1.5 text-[13px] text-white/80 bg-white/5 truncate">{it.label}</div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function ShowroomPlayer({ project, onClose }) {
  const pages = useMemo(() => exportableSlides(renderDeck(project, { meta: metaOf })), [project]);
  const stops = useMemo(() => buildStops(pages, project), [pages, project]);
  const count = stops.length;
  const vp = useViewport();
  const stageW = Math.min(vp.w, (vp.h * 16) / 9);
  const stageH = (stageW * 9) / 16;

  const [view, setView] = useState({ a: 0, b: null, f: 0, kind: 'cut', pos: 0 });
  const [chrome, setChrome] = useState(true);
  const [showIndex, setShowIndex] = useState(false);
  const music = useMusic();

  const target = useRef(0);
  const cur = useRef(0);
  const lastInput = useRef(0);
  const drag = useRef(null);
  const jump = useRef(null);
  const chromeTimer = useRef(0);
  const indexOpen = useRef(false);
  indexOpen.current = showIndex;

  const clampPos = useCallback((p) => Math.min(Math.max(p, 0), Math.max(0, count - 1)), [count]);
  /** 一次手势最多走到当前页的前后一页：讲解时不会一下滑过好几页 */
  /** 当前位置往 dir 方向的那一段过渡要滑多长（「从无到有」慢一些） */
  const weightAt = useCallback(
    (pos, dir) => {
      const a = dir >= 0 ? Math.floor(pos + 1e-6) : Math.ceil(pos - 1e-6) - 1;
      return a < 0 || a + 1 >= count ? 1 : transitionWeight(transitionKind(stops, a, a + 1));
    },
    [stops, count]
  );
  const nudge = useCallback(
    (raw) => {
      const base = cur.current;
      const delta = raw / weightAt(target.current, raw);
      target.current = clampPos(Math.min(Math.max(target.current + delta, Math.floor(base) - 1), Math.ceil(base) + 1));
      lastInput.current = performance.now();
      jump.current = null;
    },
    [clampPos, weightAt]
  );
  const goTo = useCallback(
    (k) => {
      const to = clampPos(k);
      const from = Math.round(cur.current);
      if (Math.abs(to - from) <= 1) {
        target.current = to;
        lastInput.current = 0;
        return;
      }
      // 远距离跳转：不一路滑过中间的页，直接从这一页过渡到那一页
      jump.current = { from, to, t0: performance.now() };
    },
    [clampPos]
  );

  // 动画循环：当前位置平滑追上目标；停手后吸到最近一页
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const set = (next) =>
      setView((v) => (v.a === next.a && v.b === next.b && Math.abs(v.f - next.f) < 1e-4 && v.kind === next.kind ? v : next));
    const tick = (now) => {
      const dt = Math.min(64, now - last);
      last = now;
      const j = jump.current;
      if (j) {
        const p = clamp01((now - j.t0) / JUMP_MS);
        if (p >= 1) {
          jump.current = null;
          cur.current = target.current = j.to;
        } else {
          set({ a: j.from, b: j.to, f: p, kind: 'cut', pos: j.to });
          raf = requestAnimationFrame(tick);
          return;
        }
      }
      if (!drag.current && now - lastInput.current > IDLE_SNAP_MS) target.current = snapTarget(target.current, count);
      const d = target.current - cur.current;
      // 「从无到有」那段（按键 / 吸附时）走得慢一些
      const w = weightAt(cur.current, d);
      const k = 1 - Math.pow(1 - SMOOTH / w, dt / 16.7);
      // 前半段按比例追（慢慢停），最后一小段用最低速度走完（不会拖着一点点尾巴不到位）
      const minStep = (MIN_SPEED * dt) / w;
      let step = d * k;
      if (Math.abs(step) < minStep) step = Math.sign(d) * Math.min(Math.abs(d), minStep);
      cur.current = Math.abs(d) < 5e-4 ? target.current : cur.current + step;
      const fr = frameAt(cur.current, count);
      set({ ...fr, kind: fr.b == null ? 'cut' : transitionKind(stops, fr.a, fr.b), pos: cur.current });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [count, stops, weightAt]);

  // 线稿分析好了 → 重画（分析在背景线程里跑）
  const [, setSketchTick] = useState(0);
  useEffect(() => onSketchReady(() => setSketchTick((t) => t + 1)), []);
  useEffect(() => onPlan3dProgress(() => setSketchTick((t) => t + 1)), []);
  // 3D 开场的关键帧：一打开就在空闲时开始画（讲品牌那几页的时间够画完）
  useEffect(() => {
    for (const st of stops) if (st.plan3d) requestPlan3d(st.plan3d);
  }, [stops]);

  // 角落按钮：动一下鼠标 / 碰一下屏幕就出来，2.5 秒不动就藏起来
  const poke = useCallback(() => {
    setChrome(true);
    clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => setChrome(false), CHROME_HIDE_MS);
  }, []);
  useEffect(() => {
    poke();
    return () => clearTimeout(chromeTimer.current);
  }, [poke]);

  const close = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    onClose?.();
  }, [onClose]);

  // 滚轮 / 触控板（要 passive:false 才能挡住页面本身的滚动）
  const root = useRef(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (indexOpen.current) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1;
      const dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      nudge((dy * unit) / WHEEL_UNIT);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [nudge]);

  // 键盘
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (indexOpen.current) setShowIndex(false);
        else close();
        return;
      }
      if (indexOpen.current) return;
      const fwd = ['ArrowDown', 'ArrowRight', 'PageDown', ' ', 'Enter'];
      const back = ['ArrowUp', 'ArrowLeft', 'PageUp'];
      if (fwd.includes(e.key)) goTo(Math.round(target.current) + 1);
      else if (back.includes(e.key)) goTo(Math.round(target.current) - 1);
      else if (e.key === 'Home') goTo(0);
      else if (e.key === 'End') goTo(count - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, close, count]);

  // 触控大屏 / 鼠标拖动：手指往上（或往左）= 往后翻；放手带一点惯性，然后吸到最近一页
  const onPointerDown = (e) => {
    poke();
    if (showIndex || e.button > 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), start: target.current, axis: null, v: 0, lx: e.clientX, ly: e.clientY, lt: performance.now() };
    jump.current = null;
  };
  const onPointerMove = (e) => {
    poke();
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.axis && Math.hypot(dx, dy) > 8) d.axis = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x';
    if (!d.axis) return;
    const raw = -(d.axis === 'y' ? dy : dx);
    const span = (d.axis === 'y' ? vp.h * 0.85 : vp.w * 0.85) * weightAt(d.start, raw);
    const move = raw / span;
    target.current = clampPos(Math.min(Math.max(d.start + move, Math.floor(d.start) - 1), Math.ceil(d.start) + 1));
    const now = performance.now();
    const step = d.axis === 'y' ? e.clientY - d.ly : e.clientX - d.lx;
    if (now > d.lt) d.v = (-step / span / (now - d.lt)) * 0.6 + d.v * 0.4; // 页 / ms
    d.lx = e.clientX;
    d.ly = e.clientY;
    d.lt = now;
    lastInput.current = now;
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.axis) {
      // 快速一甩：不到半页也翻过去
      const fling = d.v * 220;
      const base = d.start;
      target.current = clampPos(Math.min(Math.max(target.current + fling, Math.floor(base) - 1), Math.ceil(base) + 1));
    }
    lastInput.current = performance.now() - IDLE_SNAP_MS + 60;
  };

  // 提前把后面几页的图解码好（滑到时不闪）
  useEffect(() => {
    for (let k = Math.max(0, view.a - 1); k <= Math.min(count - 1, view.a + 3); k += 1) {
      for (const el of stops[k].page.els) {
        if (el.t !== 'img' || !el.src) continue;
        const url = resolveUrl(el.src);
        if (!url) continue;
        const im = new Image();
        im.src = url;
        im.decode?.().catch(() => {});
      }
      // 后面几张效果图先在背景线程里算好线稿
      const hero = stops[k].hero >= 0 ? stops[k].page.els[stops[k].hero] : null;
      if (hero) requestSketch(hero, resolveUrl(hero.src));
    }
  }, [view.a, stops, count]);

  if (!count) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center gap-4 text-white/80">
        <div>这份方案还没有可播放的页面（全部页面都隐藏了？）</div>
        <ChromeButton onClick={close} title="退出">
          <X size={16} /> 退出
        </ChromeButton>
      </div>
    );
  }

  const layers = [{ role: 'a', k: view.a }];
  if (view.b != null) layers.push({ role: 'b', k: view.b });
  const progress = count > 1 ? clamp01(view.pos / (count - 1)) : 1;

  return (
    <div
      ref={root}
      className="fixed inset-0 z-[100] bg-black select-none overflow-hidden"
      style={{ touchAction: 'none', cursor: chrome ? 'auto' : 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-testid="showroom"
      data-pos={view.pos.toFixed(3)}
    >
      <div style={{ position: 'absolute', left: (vp.w - stageW) / 2, top: (vp.h - stageH) / 2, width: stageW, height: stageH, overflow: 'hidden' }}>
        {layers.map((l) =>
          stops[l.k].plan3d ? (
            <Plan3dLayer
              key={stops[l.k].key}
              stop={stops[l.k]}
              width={stageW}
              m={plan3dMotion(l.role, view.kind, view.f, plan3dInfo(stops, l.k, l.role, view.kind))}
            />
          ) : (
            <Layer key={stops[l.k].key} stop={stops[l.k]} role={l.role} kind={view.kind} f={view.f} width={stageW} />
          )
        )}
      </div>

      {/* 进度：底部一条很细的线 */}
      <div className="absolute left-0 bottom-0 h-[2px] bg-white/10 w-full pointer-events-none">
        <div className="h-full bg-white/50" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className={`absolute top-5 right-5 z-10 flex items-center gap-2 transition-opacity duration-500 ${chrome ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <ChromeButton onClick={() => setShowIndex(true)} title="目录">
          <LayoutGrid size={16} /> 目录
        </ChromeButton>
        <ChromeButton
          onClick={() => (!music.hasTrack ? setShowIndex(true) : music.playing ? music.pause() : music.play())}
          title={!music.hasTrack ? '背景音乐（在目录里选一首）' : music.playing ? '关音乐' : '开音乐'}
        >
          {music.playing ? <Music size={16} /> : <VolumeX size={16} />}
        </ChromeButton>
        <ChromeButton
          onClick={() => (document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.())?.catch?.(() => {})}
          title="全屏"
        >
          <Maximize size={16} />
        </ChromeButton>
        <ChromeButton onClick={close} title="退出展厅播放（Esc）">
          <X size={16} />
        </ChromeButton>
      </div>

      {showIndex && (
        <IndexPanel
          stops={stops}
          current={Math.round(view.pos)}
          width={vp.w}
          music={music}
          onClose={() => setShowIndex(false)}
          onPick={(k) => {
            setShowIndex(false);
            goTo(k);
          }}
        />
      )}
    </div>
  );
}
