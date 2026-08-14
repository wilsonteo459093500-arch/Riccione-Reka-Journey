import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createTimeline, cubicBezier } from 'animejs';
import { Play, Pause, RotateCcw, Repeat } from 'lucide-react';
import { buildMotionSpec, flatTracks, animeProps, easeParams, selectorFor, slideAt } from '../services/motion.js';

/**
 * 动态帖的实时舞台 —— 真正在播，不是一张定帧截图。
 *
 * 之前这里是个 iframe 塞静态 HTML，只能看到第一屏；要看动效得先下载文件、
 * 再拿浏览器打开。改成 anime.js 驱动同一份 spec 之后，进度条能拖，
 * 每一帧都跟导出的 MP4 对得上。
 */
export default function MotionStage({ storyboard, width = 1080, height = 1920, scale = 0.26 }) {
  const spec = useMemo(() => buildMotionSpec(storyboard, { width, height }), [storyboard, width, height]);
  const rootRef = useRef(null);
  const tlRef = useRef(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const loopRef = useRef(loop);
  loopRef.current = loop;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const total = spec.total * 1000;
    const tl = createTimeline({
      autoplay: false,
      defaults: { ease: 'linear' },
      onUpdate: (self) => setT(self.currentTime / 1000),
      onComplete: () => {
        if (loopRef.current) {
          tl.seek(0);
          tl.play();
        } else {
          setPlaying(false);
        }
      },
    });

    flatTracks(spec).forEach((track) => {
      const el = root.querySelector(selectorFor(track));
      if (!el) return;
      tl.add(
        el,
        {
          ...animeProps(track),
          duration: track.duration * 1000,
          ease: cubicBezier(...easeParams(track.easing)),
        },
        track.start * 1000
      );
    });

    // 最后一屏的元素动画早就走完了，但那一屏还要停留。
    // 不撑到 total，进度条会在片子还没放完时就跑到头。
    tl.set(root, { opacity: 1 }, total);

    tl.seek(0);
    tlRef.current = tl;
    setT(0);
    setPlaying(false);

    return () => {
      tl.pause();
      tl.revert?.();
      tlRef.current = null;
    };
  }, [spec]);

  function toggle() {
    const tl = tlRef.current;
    if (!tl) return;
    if (playing) {
      tl.pause();
      setPlaying(false);
    } else {
      if (tl.currentTime >= spec.total * 1000 - 16) tl.seek(0);
      tl.play();
      setPlaying(true);
    }
  }

  function restart() {
    const tl = tlRef.current;
    if (!tl) return;
    tl.seek(0);
    setT(0);
  }

  function scrub(e) {
    const tl = tlRef.current;
    if (!tl) return;
    const secs = Number(e.target.value);
    tl.pause();
    setPlaying(false);
    tl.seek(secs * 1000);
    setT(secs);
  }

  const current = slideAt(spec, t);
  const pal = spec.palette;
  const pad = Math.round(width * 0.09);

  return (
    <div className="space-y-2">
      <div
        className="relative overflow-hidden rounded-xl border border-sail-line mx-auto"
        style={{ width: width * scale, height: height * scale, background: pal.bg }}
      >
        <div
          ref={rootRef}
          className="absolute top-0 left-0 origin-top-left"
          style={{ width, height, background: pal.bg, transform: `scale(${scale})` }}
        >
          {spec.slides.map((s) => (
            <div
              key={s.index}
              data-slide={s.index}
              style={{ position: 'absolute', inset: 0, opacity: 0, willChange: 'opacity' }}
            >
              <div
                data-el="bg"
                style={{
                  position: 'absolute',
                  inset: 0,
                  willChange: 'transform',
                  background:
                    s.bgKind === 'gradient'
                      ? `linear-gradient(160deg, ${pal.bg} 0%, ${mix(pal.accent, pal.bg, 0.18)} 100%)`
                      : pal.bg,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  padding: pad,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  gap: Math.round(width * 0.028),
                }}
              >
                <div
                  data-el="kicker"
                  style={{
                    opacity: 0,
                    willChange: 'transform, opacity',
                    font: `600 ${Math.round(width * 0.032)}px/1 "DM Sans", system-ui, sans-serif`,
                    letterSpacing: '.32em',
                    color: pal.accent,
                  }}
                >
                  {String(s.index + 1).padStart(2, '0')}
                </div>
                <h1
                  style={{
                    margin: 0,
                    font: `700 ${Math.round(width * 0.096)}px/1.18 "Fraunces", Georgia, serif`,
                    color: pal.ink,
                    letterSpacing: '-.01em',
                  }}
                >
                  {s.chars.map((ch, ci) => (
                    <span
                      key={ci}
                      data-char={ci}
                      style={{ display: 'inline-block', opacity: 0, willChange: 'transform, opacity, filter' }}
                    >
                      {ch === ' ' ? ' ' : ch}
                    </span>
                  ))}
                </h1>
                {s.sub && (
                  <p
                    data-el="sub"
                    style={{
                      margin: 0,
                      opacity: 0,
                      willChange: 'transform, opacity, filter',
                      font: `400 ${Math.round(width * 0.038)}px/1.5 "DM Sans", "Noto Sans SC", system-ui, sans-serif`,
                      color: mix(pal.ink, pal.bg, 0.38),
                    }}
                  >
                    {s.sub}
                  </p>
                )}
                <div
                  data-el="rule"
                  style={{
                    height: Math.max(3, Math.round(width * 0.005)),
                    background: pal.accent,
                    borderRadius: 99,
                    transformOrigin: 'left center',
                    transform: 'scaleX(0)',
                    willChange: 'transform',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          className="w-8 h-8 rounded-lg bg-sail-green-deep text-white flex items-center justify-center shrink-0 hover:opacity-90"
          title={playing ? '暂停' : '播放'}
        >
          {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
        </button>
        <button
          onClick={restart}
          className="w-8 h-8 rounded-lg border border-sail-line text-sail-muted flex items-center justify-center shrink-0 hover:bg-sail-tint"
          title="回到开头"
        >
          <RotateCcw size={13} />
        </button>
        <button
          onClick={() => setLoop((v) => !v)}
          className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
            loop ? 'border-sail-green-deep/40 bg-sail-tint text-sail-green-deep' : 'border-sail-line text-sail-faint'
          }`}
          title={loop ? '循环中' : '不循环'}
        >
          <Repeat size={13} />
        </button>
        <input
          type="range"
          min={0}
          max={spec.total}
          step={1 / spec.fps}
          value={t}
          onChange={scrub}
          className="flex-1 accent-sail-green-deep"
        />
        <span className="text-[11px] font-mono text-sail-faint tabular-nums shrink-0 w-20 text-right">
          {t.toFixed(2)} / {spec.total.toFixed(1)}s
        </span>
      </div>

      {current && (
        <p className="text-[11px] text-sail-faint leading-relaxed">
          第 {current.index + 1} 屏 · 主文案 {CHAR_LABEL[current.charMotion] || current.charMotion}
          {current.sub ? ` · 副文案 ${ENTER_LABEL[current.subMotion] || current.subMotion}` : ''}
        </p>
      )}
    </div>
  );
}

const CHAR_LABEL = { charUp: '逐字上浮', charBlur: '逐字对焦', charScale: '逐字弹入', wholeUp: '整句上浮' };
const ENTER_LABEL = {
  fadeUp: '上浮淡入',
  fadeDown: '下沉淡入',
  slideLeft: '从右滑入',
  slideRight: '从左滑入',
  scaleIn: '轻微放大',
  blurIn: '虚焦对上',
  maskUp: '遮罩上推',
  wipe: '横向擦出',
  none: '直接出现',
};

/** color-mix 在 React inline style 里不稳，自己算一下 */
function mix(a, b, ratio) {
  const p = (h) => {
    const s = String(h).replace('#', '');
    const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
  };
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const m = (x, y) => Math.round(x * (1 - ratio) + y * ratio);
  return `rgb(${m(r1, r2)}, ${m(g1, g2)}, ${m(b1, b2)})`;
}
