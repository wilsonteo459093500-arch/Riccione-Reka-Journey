// 展厅播放 · 开场（像新 iPhone 开机的「Hello」）。盖在方案页上面的一层，按时间播（文案、时间轴在 showroom/intro.js）：
//   Hello → Selamat datang → 你好（手写）→ 你好，{名字} → 几句话一句一句浮现 → 行至溪岸，回归生活的美好 →
//   木纹 U 一笔画出 + 落款 +「轻触开始」→ 轻触：这一层慢慢淡掉，下面就是方案第一页。
// 声音：溪水声（showroom/creek.js 现场合成）；已上传展厅音乐的话，品牌句那一屏淡入。右上角静音 / 退出，鼠标不动 2.5 秒自动藏起来。
// 操作：点一下 / 空格 / Enter / → —— 还没播完 = 跳到最后一屏；在最后一屏 = 开始看方案。Esc 交给外层（退出展厅播放）。

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import { UKIR_MARK } from '../BrandMark.jsx';
import { FONTS } from '../../theme.js';
import { introScreens, introTimeline, introFrame, introSkipTarget, introMusicAt, END_CTA_AT, FADE_IN, LEAVE_MS } from '../../showroom/intro.js';
import { createCreek } from '../../showroom/creek.js';

const PAPER = '#F3EEE7'; // 和 3D 户型画布、方案纸面同色：淡出时接得上
const INK = '#241C12';
const MUTED = '#6E6353';
const CHROME_HIDE_MS = 2500;

const SCRIPT_CSS = "'Allura','Cormorant Garamond',cursive";
const BRUSH_CSS = "'Ma Shan Zheng','Noto Serif SC',serif";
const SERIF_EN_CSS = "'Cormorant Garamond','Noto Serif SC',serif";
const SONG_CSS = FONTS.songL.css;
const OUTFIT = "'Outfit','Noto Sans SC',system-ui,sans-serif";

// 很淡的纸纹（SVG 噪点）
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.14 0 0 0 0 0.11 0 0 0 0 0.07 0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

const lines = (s) => String(s || '').split('\n');

/** 一行行的字（换行 = 分行，不靠自动折行） */
function Lines({ text, style }) {
  return (
    <div style={style}>
      {lines(text).map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

/** 木纹 U：每一笔用 stroke-dashoffset 画出来（像刻出来的） */
function DrawnMark({ draw, size }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} fill="none" stroke={INK} strokeWidth={UKIR_MARK.stroke * 0.8} strokeLinecap="round" strokeLinejoin="round" aria-label="UKIR STUDIO" role="img">
      {UKIR_MARK.paths.map((d, i) => {
        // 外框先画，木纹一道接一道跟上
        const k = Math.min(1, Math.max(0, (draw - i * 0.1) / 0.6));
        return <path key={i} d={d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - k} />;
      })}
      {UKIR_MARK.knot && <ellipse {...UKIR_MARK.knot} opacity={Math.max(0, (draw - 0.8) / 0.2)} />}
    </svg>
  );
}

/**
 * 开场的一帧（纯函数：没有 hook，测试里直接调用）
 * @param {{ frame: ReturnType<typeof introFrame> }} props
 */
export function IntroScreen({ frame }) {
  const s = frame?.screen;
  if (!s || s.type === 'rest') return <div data-intro="rest" />;
  const move = { opacity: frame.opacity, transform: `translate3d(0, ${frame.ty}px, 0)`, filter: frame.blur > 0.05 ? `blur(${frame.blur.toFixed(2)}px)` : 'none' };

  if (s.type === 'hello') {
    const p = frame.write * 118;
    const mask = `linear-gradient(90deg, #000 ${p - 18}%, transparent ${p}%)`;
    const brush = s.font === 'brush';
    return (
      <div data-intro="hello" style={{ ...move, maskImage: mask, WebkitMaskImage: mask, whiteSpace: 'nowrap' }}>
        <span
          style={{
            fontFamily: brush ? BRUSH_CSS : SCRIPT_CSS,
            fontSize: brush ? 'clamp(64px, min(10vw, 17vh), 180px)' : 'clamp(60px, min(11vw, 19vh), 200px)',
            lineHeight: 1.1,
            color: INK,
            letterSpacing: brush ? '0.08em' : 0,
            padding: '0 0.2em',
          }}
        >
          {s.text}
        </span>
      </div>
    );
  }

  if (s.type === 'end') {
    return (
      <div data-intro="end" style={{ opacity: frame.opacity, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <DrawnMark draw={frame.draw} size="clamp(56px, 9vh, 92px)" />
        <div style={{ marginTop: '1.4em', fontFamily: OUTFIT, fontSize: 'clamp(10px, 1.4vh, 13px)', letterSpacing: '0.46em', paddingLeft: '0.46em', color: MUTED, opacity: frame.draw }}>UKIR STUDIO</div>
        <div style={{ marginTop: '3.2em', opacity: frame.foot, transform: `translate3d(0, ${(1 - frame.foot) * 6}px, 0)`, textAlign: 'center' }}>
          <div style={{ fontFamily: SONG_CSS, fontWeight: 300, fontSize: 'clamp(13px, 1.9vh, 18px)', letterSpacing: '0.16em', color: INK }}>{s.main}</div>
          {s.sub && <div style={{ marginTop: '0.6em', fontFamily: SERIF_EN_CSS, fontStyle: 'italic', fontSize: 'clamp(13px, 1.8vh, 17px)', letterSpacing: '0.04em', color: MUTED }}>{s.sub}</div>}
        </div>
      </div>
    );
  }

  const en = s.lang === 'en';
  return (
    <div data-intro="line" data-id={s.id} style={{ ...move, textAlign: 'center' }}>
      <Lines
        text={s.main}
        style={{
          fontFamily: en ? SERIF_EN_CSS : SONG_CSS,
          fontWeight: en ? 400 : 300,
          fontSize: en ? 'clamp(24px, min(3vw, 5.2vh), 52px)' : 'clamp(20px, min(2.5vw, 4.4vh), 44px)',
          letterSpacing: en ? '0.02em' : '0.14em',
          lineHeight: en ? 1.45 : 1.9,
          color: INK,
        }}
      />
      {s.sub && (
        <Lines
          text={s.sub}
          style={{ marginTop: '1.4em', fontFamily: SERIF_EN_CSS, fontStyle: 'italic', fontSize: 'clamp(14px, min(1.5vw, 2.6vh), 24px)', letterSpacing: '0.03em', lineHeight: 1.5, color: MUTED }}
        />
      )}
    </div>
  );
}

function CornerButton({ onClick, title, children }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      aria-label={title}
      className="h-9 w-9 inline-flex items-center justify-center rounded-full text-[#6E6353] hover:text-[#241C12] hover:bg-black/5 transition-colors"
    >
      {children}
    </button>
  );
}

/**
 * @param {{ project:object, music?:{ hasTrack:boolean, playing:boolean, play():void, pause():void }, onDone:()=>void, onExit:()=>void }} props
 */
export default function ShowroomIntro({ project, music, onDone, onExit }) {
  const tl = useMemo(() => introTimeline(introScreens(project)), [project]);
  const musicAt = useMemo(() => introMusicAt(tl), [tl]);
  const [t, setT] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [muted, setMuted] = useState(false);
  const [chrome, setChrome] = useState(false);
  const base = useRef(0);
  const raf = useRef(0);
  const creek = useRef(null);
  const musicStarted = useRef(false);
  const chromeTimer = useRef(0);
  const musicRef = useRef(music);
  musicRef.current = music;
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  const startMusic = useCallback(() => {
    const m = musicRef.current;
    if (musicStarted.current || mutedRef.current || !m?.hasTrack) return;
    musicStarted.current = true;
    if (!m.playing) m.play();
  }, []);

  // 时钟：最后一屏的字都出来之后就不用再逐帧更新了（「轻触开始」的呼吸是 CSS 动画）
  const run = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const stopAt = tl.endAt + END_CTA_AT + FADE_IN + 200;
    const step = (now) => {
      const v = now - base.current;
      setT(v);
      if (v >= musicAt) startMusic();
      if (v < stopAt) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [tl, musicAt, startMusic]);
  useEffect(() => {
    base.current = performance.now();
    run();
    return () => cancelAnimationFrame(raf.current);
  }, [run]);

  // 溪水声
  useEffect(() => {
    const c = createCreek();
    creek.current = c;
    c.start();
    return () => c.fadeOut(1600);
  }, []);

  const poke = useCallback(() => {
    setChrome(true);
    clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => setChrome(false), CHROME_HIDE_MS);
  }, []);
  useEffect(() => () => clearTimeout(chromeTimer.current), []);

  const frame = introFrame(t, tl);

  const leave = useCallback(() => {
    setLeaving(true);
    creek.current?.fadeOut(2600);
    setTimeout(() => onDone?.(), LEAVE_MS);
  }, [onDone]);

  const advance = useCallback(() => {
    if (leaving) return;
    const now = performance.now();
    if (now - base.current < tl.endAt) {
      // 还没播完：跳到最后一屏
      base.current = now - introSkipTarget(tl);
      run();
      return;
    }
    leave();
  }, [leaving, tl, leave, run]);

  useEffect(() => {
    const onKey = (e) => {
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance]);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    creek.current?.setMuted(m);
    if (m && music?.playing) music.pause();
    else if (!m && musicStarted.current && music?.hasTrack && !music.playing) music.play();
  };

  return (
    <div
      className="absolute inset-0 z-20 select-none overflow-hidden"
      style={{ background: PAPER, opacity: leaving ? 0 : 1, transition: `opacity ${LEAVE_MS}ms ease`, cursor: chrome ? 'pointer' : 'none', touchAction: 'none' }}
      onPointerDown={(e) => {
        e.stopPropagation();
        creek.current?.resume();
      }}
      onPointerMove={poke}
      onClick={advance}
      data-testid="showroom-intro"
      data-screen={frame.screen?.type}
    >
      {/* 晨光：一道很慢移动的柔光（像阳光扫过墙面）+ 纸纹 */}
      <div
        className="intro-light absolute pointer-events-none"
        style={{ inset: '-20%', background: 'radial-gradient(ellipse 55% 45% at 32% 30%, rgba(255,251,243,0.95), rgba(255,251,243,0) 70%)' }}
      />
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(ellipse at 50% 120%, rgba(110,99,83,0.10), rgba(110,99,83,0) 60%)' }} />
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRAIN, opacity: 0.35, mixBlendMode: 'multiply' }} />

      <div className="absolute inset-x-0 flex items-center justify-center px-6" style={{ top: 0, bottom: '8%' }}>
        <IntroScreen frame={frame} />
      </div>

      {frame.atEnd && (
        <div className="absolute inset-x-0 flex justify-center pointer-events-none" style={{ bottom: '9%', opacity: frame.cta }}>
          <span className="intro-breathe" style={{ fontFamily: SONG_CSS, fontWeight: 300, fontSize: 'clamp(12px, 1.7vh, 16px)', letterSpacing: '0.3em', paddingLeft: '0.3em', color: MUTED }}>
            {frame.screen.cta}
          </span>
        </div>
      )}

      <div className={`absolute top-5 right-5 flex items-center gap-1 transition-opacity duration-500 ${chrome && !leaving ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <CornerButton onClick={toggleMute} title={muted ? '开声音' : '静音'}>
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </CornerButton>
        <CornerButton onClick={() => onExit?.()} title="退出展厅播放（Esc）">
          <X size={17} />
        </CornerButton>
      </div>
    </div>
  );
}
