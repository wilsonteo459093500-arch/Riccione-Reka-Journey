// 展厅播放：在展厅大屏上「滑着看」方案。内容、版面和导出的 PPT 一模一样（renderDeck → exportableSlides），只是动起来。
//
// 控制：鼠标滚轮（一格翻一页）/ 触控板（跟手滑，滑过一小段就翻过去）、触控大屏拖动（上下或左右都行）、
//       点一下（左边四分之一 = 上一页，其余 = 下一页）、方向键 / 空格 / PageDown；停手后吸到一页上，
//       所以停下来的画面永远是完整原图（见 showroom/motion.js 的铁律）。Esc 按两次才退出（免得讲解时误碰）。
// 角落：目录（跳到任一空间）· 音乐（第一次点选一首，存在本机）· 全屏 · 退出；鼠标不动 2.5 秒后自动隐藏。
// 大屏上不出洋相：播放时屏幕常亮（Wake Lock）；动效出错 → 这一页退回静态原图（ShowroomBoundary.jsx）；
//       3D 开场画不出来 → 跳过那一页；编辑器在下面整个停用（inert），它的快捷键收不到按键。

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, Music, VolumeX, Maximize, X, Eye, EyeOff } from 'lucide-react';
import SlideCanvas from '../SlideCanvas.jsx';
import { renderDeck, exportableSlides } from '../../engine/deck.js';
import { metaOf, resolveUrl } from '../../store/assets.js';
import { getAssetRecord, putAssetRecord } from '../../store/db.js';
import { buildStops, transitionKind, transitionWeight, indexOf, SECTION_NAMES } from '../../showroom/timeline.js';
import { layerMotion, frameAt, snapTarget, snapToward, isWheelStep, cssOf, clamp01, plan3dMotion, enterProgress, morphRects } from '../../showroom/motion.js';
import { plan3dKey, peekPlan3d, requestPlan3d, onPlan3dProgress, plan3dState } from '../../showroom/build3dCache.js';
import { Boundary, StillPage, EscHint } from './ShowroomBoundary.jsx';
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
const WHEEL_STREAM_MS = 120; // 两下滚轮隔多久算「另一下」：有刻度的滚轮一格翻一页，一口气连滚（或触控板一甩的惯性）只算一次
const TAP_MS = 500; // 按下到放开不超过这么久、又没拖动 = 点一下
const TAP_BACK_ZONE = 0.25; // 点屏幕左边这么宽 = 上一页，其余 = 下一页
const ESC_CONFIRM_MS = 3000; // 第一次 Esc 后多久内再按一次才退出
// 只在本机开发时有：浏览器测试用它故意弄坏一层，看「出错不空白」有没有接住（正式版构建时这一行整个去掉）
const devBreak = (what) => {
  if (import.meta.env?.DEV && typeof window !== 'undefined' && window.__showroomBreak === what) throw new Error(`测试：${what} 故意出错`);
};

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

/**
 * 屏幕常亮：停在一页讲久了，屏幕不会自己变黑（Screen Wake Lock，Chrome / Edge / Safari 都有）。
 * 切到别的窗口时浏览器会自动放掉，切回来再申请一次。浏览器不支持 → 什么都不做（播放前检查会提醒去关电脑的睡眠）。
 */
export const canKeepAwake = () => typeof navigator !== 'undefined' && !!navigator.wakeLock?.request;
function useKeepAwake() {
  useEffect(() => {
    if (!canKeepAwake()) return undefined;
    let alive = true;
    let lock = null;
    const ask = async () => {
      if (!alive || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        const l = await navigator.wakeLock.request('screen');
        if (alive) lock = l;
        else l.release?.().catch(() => {});
      } catch {
        // 省电模式、页面在后台：申请不到就算了，下次回到前台再试
      }
    };
    ask();
    document.addEventListener('visibilitychange', ask);
    document.addEventListener('fullscreenchange', ask);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', ask);
      document.removeEventListener('fullscreenchange', ask);
      lock?.release?.().catch(() => {});
    };
  }, []);
}

/**
 * 全屏时把 Esc 留给播放器（Chrome / Edge 的 Keyboard Lock）：按一下 Esc 是「再按一次退出」的提示，不会直接退出全屏。
 * 不支持的浏览器：第一下 Esc 先退出全屏（浏览器自己的规矩），播放器还在，再按两次才退出。
 */
function useEscLock() {
  useEffect(() => {
    const kb = typeof navigator !== 'undefined' ? navigator.keyboard : null;
    if (!kb?.lock) return undefined;
    const sync = () => {
      if (document.fullscreenElement) kb.lock(['Escape']).catch(() => {});
      else kb.unlock?.();
    };
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      kb.unlock?.();
    };
  }, []);
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
    if (!entry?.built) return;
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
  const areas = entry?.built?.final.floorAreas || [];
  const next = role === 'a' && kind === 'enter' ? stops[k + 1]?.slide : null;
  return { frames: entry?.total || 1, areas: areas.length, target: next ? matchRoom(areas, next) : -1 };
}

/** 设计特点的过渡：效果图从原页的框（含裁切）移到设计特点页左边（整张）—— 两头和两页的原样一模一样 */
function MorphImg({ fromEl, toEl, t }) {
  const { clip, img } = morphRects(fromEl, toEl, t);
  const url = resolveUrl(toEl.src);
  return (
    <div style={{ position: 'absolute', left: clip.x, top: clip.y, width: clip.w, height: clip.h, overflow: 'hidden' }}>
      {url && <img src={url} alt="" draggable={false} style={{ position: 'absolute', left: img.x - clip.x, top: img.y - clip.y, width: img.w, height: img.h, maxWidth: 'none' }} />}
    </div>
  );
}

/** 一层（一页）：整层透明度 + 每个元素的动效；换到效果图页时，效果图换成「线稿 → 上色」画布 */
function Layer({ stop, role, kind, f, width, peer }) {
  // 3D 开场的前后两页：离开的楼层页照「从无到有」淡出；进来的效果图页照常线稿 → 上色
  const k2 = kind === 'build' ? 'sketch' : kind === 'enter' ? (stop.hero >= 0 ? 'sketch' : 'cut') : kind;
  // 从 3D 停点进房间：先让 3D 图高亮、推近，这一页晚一点才开始画线稿
  const m = layerMotion(role, k2, kind === 'enter' && role === 'b' ? enterProgress(f) : f, stop.page.els);
  const heroEl = stop.hero >= 0 ? stop.page.els[stop.hero] : null;
  const entry = m.sketch && heroEl ? peekSketch(sketchGeom(heroEl).key) : null;
  // 进设计特点（role b）：效果图从上一页（peer）那张的框移过来
  const fromEl = kind === 'craft' && role === 'b' && peer && peer.hero >= 0 ? peer.page.els[peer.hero] : null;
  const elStyle = useCallback((el, i) => ((entry && i === stop.hero) || (fromEl && el.name === 'photo:craft') ? null : cssOf(m.el(el, i))), [m, entry, stop.hero, fromEl]);
  const replaceEl = useCallback(
    (el, i) => {
      if (entry && i === stop.hero) return <SketchEl el={el} entry={entry} lineQ={m.sketch.lineQ} colQ={m.sketch.colQ} />;
      if (fromEl && el.name === 'photo:craft') return <MorphImg fromEl={fromEl} toEl={el} t={m.morph ?? 1} />;
      return null;
    },
    [entry, stop.hero, m, fromEl]
  );
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: m.opacity }}>
      <SlideCanvas
        slide={stop.page}
        width={width}
        resolveUrl={resolveUrl}
        elStyle={elStyle}
        replaceEl={entry || fromEl ? replaceEl : undefined}
        noBg={kind === 'craft' && role === 'a'}
      />
    </div>
  );
}

/** 舞台上的一层或两层（停在一页 = 一层；两页之间 = 两层） */
function StageLayers({ stops, view, width }) {
  devBreak('layers');
  const layers = [{ role: 'a', k: view.a }];
  if (view.b != null) layers.push({ role: 'b', k: view.b });
  // 进设计特点：原页（不画底色）盖在设计特点页上面 —— 字淡掉时还在纸面上，效果图由下面那层接手移过去
  return (view.kind === 'craft' ? [...layers].reverse() : layers).map((l) =>
    stops[l.k].plan3d ? (
      <Plan3dLayer key={stops[l.k].key} stop={stops[l.k]} width={width} m={plan3dMotion(l.role, view.kind, view.f, plan3dInfo(stops, l.k, l.role, view.kind))} />
    ) : (
      <Layer key={stops[l.k].key} stop={stops[l.k]} role={l.role} kind={view.kind} f={view.f} width={width} peer={l.role === 'b' ? stops[view.a] : null} />
    )
  );
}

/** 一个停点的静态画面（动效出错时顶上）：一般的页 = 这一页原样；3D 开场 = 这层楼的原平面图 */
function StillStop({ stop, width }) {
  if (!stop) return null;
  if (!stop.plan3d) return <StillPage page={stop.page} width={width} label={stop.label} />;
  const url = resolveUrl(stop.plan3d.plan);
  return (
    <div data-showroom-still="plan" style={{ position: 'absolute', inset: 0, background: '#F3EEE7' }} className="flex items-center justify-center">
      {url ? <img src={url} alt="" draggable={false} style={{ maxWidth: '86%', maxHeight: '86%', objectFit: 'contain' }} /> : <div className="text-[#7B593D] text-2xl tracking-[0.2em]">{stop.label}</div>}
    </div>
  );
}

function IndexPanel({ stops, current, width, onPick, onClose, music, craftPreview, onCraftPreview }) {
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
            <ChromeButton
              onClick={() => onCraftPreview(!craftPreview)}
              title={craftPreview ? '关掉：只放老板审过定义的设计特点' : '内部预览：定义还没审过的设计特点也放出来（卡片上标「待审」），别在客人面前开'}
            >
              {craftPreview ? <Eye size={16} /> : <EyeOff size={16} />}
              {craftPreview ? '正在预览待审的设计特点' : '预览待审的设计特点'}
            </ChromeButton>
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
  devBreak('player');
  const pages = useMemo(() => exportableSlides(renderDeck(project, { meta: metaOf })), [project]);
  // 内部预览：待审的设计特点也放（只在这次打开有效，下次打开又关上 —— 免得在客人面前忘了关）
  const [craftPreview, setCraftPreview] = useState(false);
  const allStops = useMemo(() => buildStops(pages, project, { craftPreview }), [pages, project, craftPreview]);
  // 3D 开场画不出来的楼层：跳过那个停点（以前是整屏只剩米色）。failed3d = 画不出来的停点 key 连成的字串，变了才重排
  const [failed3d, setFailed3d] = useState('');
  const stops = useMemo(() => (failed3d ? allStops.filter((st) => !st.plan3d || plan3dState(st.plan3d) !== 'failed') : allStops), [allStops, failed3d]);
  const count = stops.length;
  const vp = useViewport();
  const stageW = Math.min(vp.w, (vp.h * 16) / 9);
  const stageH = (stageW * 9) / 16;

  const [view, setView] = useState({ a: 0, b: null, f: 0, kind: 'cut', pos: 0 });
  const [chrome, setChrome] = useState(true);
  const [showIndex, setShowIndex] = useState(false);
  const music = useMusic();
  useKeepAwake();
  useEscLock();
  const [escHint, setEscHint] = useState(false);
  const escAt = useRef(-1e9);
  const escTimer = useRef(0);
  useEffect(() => () => clearTimeout(escTimer.current), []);

  const target = useRef(0);
  const cur = useRef(0);
  const lastInput = useRef(0);
  const drag = useRef(null);
  const jump = useRef(null);
  // 滚轮手势：from = 这一下从哪一页开始；active = 还没吸附；last = 上一下滚轮的时间；streamStepped = 这一口气已经翻过一页
  const wheel = useRef({ from: 0, active: false, last: -1e9, streamStepped: false });
  const tickFailed = useRef(false);
  const openedAt = useRef(performance.now());
  const chromeTimer = useRef(0);
  const indexOpen = useRef(false);
  indexOpen.current = showIndex;

  // 打开 / 关上「预览待审」会多出 / 少掉设计特点停点：留在同一页（按停点 key 找回来），不跳到别处
  const prevStops = useRef(stops);
  useEffect(() => {
    const before = prevStops.current;
    prevStops.current = stops;
    if (before === stops) return;
    const key = before[Math.round(cur.current)]?.key;
    let k = stops.findIndex((st) => st.key === key);
    if (k < 0) k = Math.min(Math.round(cur.current), stops.length - 1);
    cur.current = target.current = Math.max(0, k);
    jump.current = null;
  }, [stops]);

  const clampPos = useCallback((p) => Math.min(Math.max(p, 0), Math.max(0, count - 1)), [count]);
  /** 当前位置往 dir 方向的那一段过渡要滑多长（「从无到有」慢一些） */
  const weightAt = useCallback(
    (pos, dir) => {
      const a = dir >= 0 ? Math.floor(pos + 1e-6) : Math.ceil(pos - 1e-6) - 1;
      return a < 0 || a + 1 >= count ? 1 : transitionWeight(transitionKind(stops, a, a + 1));
    },
    [stops, count]
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
    const step = (now) => {
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
          return;
        }
      }
      if (!drag.current && now - lastInput.current > IDLE_SNAP_MS) {
        // 滚轮 / 触控板：往一个方向滑过一小段就翻过去（不用滑过半页）；其他（拖动、按键）照旧吸到最近一页
        const g = wheel.current;
        target.current = g.active ? snapToward(target.current, g.from, count) : snapTarget(target.current, count);
        g.active = false;
      }
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
    };
    // 这一帧算错了也不能让画面定住：直接站到目标那一页（静态原图），下一帧照常
    const tick = (now) => {
      try {
        step(now);
      } catch (err) {
        if (!tickFailed.current) console.error('[展厅播放] 动画这一帧出错，已直接停到目标页', err);
        tickFailed.current = true;
        jump.current = null;
        cur.current = target.current = snapTarget(target.current, count);
        set({ a: cur.current, b: null, f: 0, kind: 'cut', pos: cur.current });
      }
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
    const failed = () =>
      allStops
        .filter((st) => st.plan3d && plan3dState(st.plan3d) === 'failed')
        .map((st) => st.key)
        .join('|');
    for (const st of allStops) if (st.plan3d) requestPlan3d(st.plan3d);
    setFailed3d(failed());
    return onPlan3dProgress(() => setFailed3d(failed()));
  }, [allStops]);

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
      const vertical = Math.abs(e.deltaY) >= Math.abs(e.deltaX);
      const px = (vertical ? e.deltaY : e.deltaX) * unit;
      if (!px) return;
      const g = wheel.current;
      const now = performance.now();
      if (now - g.last > WHEEL_STREAM_MS) g.streamStepped = false; // 新的一口气
      g.last = now;
      if (g.streamStepped) return; // 这一口气已经翻过一页：剩下的（连滚、惯性）不再翻
      if (!g.active) {
        g.from = Math.round(target.current);
        g.active = true;
      }
      if (isWheelStep(vertical ? e : { deltaMode: e.deltaMode }, px, window.devicePixelRatio)) {
        // 有刻度的滚轮：一格翻一页
        g.streamStepped = true;
        g.active = false;
        goTo(g.from + Math.sign(px));
        return;
      }
      // 触控板 / 无刻度滚轮：跟手滑，最多到前后一页；停手后滑过一小段就翻过去（tick 里的 snapToward）
      const moved = px / WHEEL_UNIT / weightAt(target.current, px);
      target.current = clampPos(Math.min(Math.max(target.current + moved, g.from - 1), g.from + 1));
      lastInput.current = now;
      jump.current = null;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [goTo, clampPos, weightAt]);

  // 键盘
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (e.repeat) return; // 按住不放（全屏时长按 Esc = 退出全屏）不算第二次
        if (indexOpen.current) {
          setShowIndex(false);
          return;
        }
        // 按两次才退出：讲解时误碰一下不会掉回编辑器
        const now = performance.now();
        if (now - escAt.current < ESC_CONFIRM_MS) {
          close();
          return;
        }
        escAt.current = now;
        setEscHint(true);
        clearTimeout(escTimer.current);
        escTimer.current = setTimeout(() => setEscHint(false), ESC_CONFIRM_MS);
        return;
      }
      if (indexOpen.current || e.metaKey || e.ctrlKey || e.altKey) return;
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
    wheel.current.active = false;
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
    // 点一下（没拖动、很快放开）：左边四分之一 = 上一页，其余 = 下一页
    // （刚打开的半秒内不算：连点两下「开始播放」，第二下不该把第一页翻过去）
    if (!d.axis && e.type === 'pointerup' && performance.now() - d.t < TAP_MS && d.t - openedAt.current > 500) {
      goTo(Math.round(target.current) + (e.clientX / Math.max(1, window.innerWidth) < TAP_BACK_ZONE ? -1 : 1));
      return;
    }
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
      role="dialog"
      aria-modal="true"
      aria-label="展厅播放"
      data-testid="showroom"
      data-showroom-mode="player"
      data-pos={view.pos.toFixed(3)}
      data-count={count}
      data-stop={stops[Math.min(count - 1, Math.max(0, Math.round(view.pos)))]?.key}
    >
      <div style={{ position: 'absolute', left: (vp.w - stageW) / 2, top: (vp.h - stageH) / 2, width: stageW, height: stageH, overflow: 'hidden' }}>
        {/* 动效这一层出错（线稿画布、3D 开场…）：这一页退回静态原图，翻页照常；翻到别的页再试一次动效 */}
        <Boundary resetKey={`${view.a}|${view.b ?? ''}`} what="动效" fallback={<StillStop stop={stops[Math.min(count - 1, Math.max(0, Math.round(view.pos)))]} width={stageW} />}>
          <StageLayers stops={stops} view={view} width={stageW} />
        </Boundary>
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
        <ChromeButton onClick={close} title="退出展厅播放（或按两次 Esc）">
          <X size={16} />
        </ChromeButton>
      </div>

      {escHint && !showIndex && <EscHint />}

      {showIndex && (
        <IndexPanel
          stops={stops}
          current={Math.round(view.pos)}
          width={vp.w}
          music={music}
          craftPreview={craftPreview}
          onCraftPreview={setCraftPreview}
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
