import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, SkipBack, AlertTriangle } from 'lucide-react';
import { beatById } from '../constants.js';
import { withOutputTimes } from '../services/exporters.js';

/**
 * 用真实素材把剪辑方案「走」一遍 —— 不是渲染，是顺序播放每个 slot 的 in→out。
 * 够用来判断节奏对不对、哪一拍该再短一点，省掉一整轮真渲染。
 */
export default function StoryboardPlayer({ plan, assets }) {
  // 必须 memo：rows / byId 每次重算会让下面的播放 effect 每帧重跑，直接死循环
  const rows = useMemo(() => withOutputTimes(plan.timeline || []), [plan.timeline]);
  const byId = useMemo(() => Object.fromEntries(assets.map((a) => [a.id, a])), [assets]);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0); // 当前 slot 内已播秒数
  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const rafRef = useRef(null);
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;

  const row = rows[idx];
  const asset = row ? byId[row.assetId] : null;
  const total = rows.reduce((s, r) => s + r.output_duration, 0);
  const playedBefore = rows.slice(0, idx).reduce((s, r) => s + r.output_duration, 0);

  const clearTimers = useCallback(() => {
    clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);
  }, []);

  const advance = useCallback(() => {
    setIdx((i) => {
      if (i + 1 >= rows.length) {
        setPlaying(false);
        return i;
      }
      return i + 1;
    });
    setElapsed(0);
  }, [rows.length]);

  // 换 slot 时才归零计时（暂停不该把进度抹掉）
  useEffect(() => {
    setElapsed(0);
  }, [idx]);

  // 当前 slot 的播放逻辑
  useEffect(() => {
    clearTimers();
    if (!row) return;

    const v = videoRef.current;
    const isVideo = asset && asset.kind === 'video' && asset.url;

    if (isVideo && v) {
      const start = Number(row.in) || 0;
      const stop = Number(row.out) || start + 1;
      v.playbackRate = Number(row.speed) || 1;

      const seekAndGo = () => {
        try {
          v.currentTime = start;
        } catch {
          /* 有些格式要等 metadata */
        }
        if (playing) v.play().catch(() => setPlaying(false));
        else v.pause();
      };

      if (v.src !== asset.url) {
        v.src = asset.url;
        v.onloadedmetadata = seekAndGo;
      } else {
        seekAndGo();
      }

      const tick = () => {
        if (!videoRef.current) return;
        const t = videoRef.current.currentTime;
        setElapsed(Math.max(0, t - start));
        if (t >= stop - 0.03) {
          advance();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      if (playing) rafRef.current = requestAnimationFrame(tick);
    } else if (playing) {
      // 静图 / 缺素材：按 slot 时长走计时器，暂停后从原处接着走
      const already = elapsedRef.current;
      const remaining = Math.max(0, row.output_duration - already);
      const t0 = performance.now();
      const tick = () => {
        const e = already + (performance.now() - t0) / 1000;
        setElapsed(e);
        if (e >= row.output_duration) return advance();
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      timerRef.current = setTimeout(advance, remaining * 1000);
    }

    return clearTimers;
  }, [idx, playing, row, asset, advance, clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (!rows.length) return null;

  const missing = !asset;
  const pct = total ? ((playedBefore + Math.min(elapsed, row?.output_duration || 0)) / total) * 100 : 0;
  const meta = beatById(row?.beat);

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[520px] mx-auto w-full flex items-center justify-center">
        {missing ? (
          <div className="text-center text-white/60 px-6">
            <AlertTriangle size={26} className="mx-auto mb-2" />
            <p className="text-sm">这一拍的素材不在当前会话里</p>
            <p className="text-xs mt-1 text-white/40">重新把原文件拖进来就能预览</p>
          </div>
        ) : asset.kind === 'image' ? (
          <img
            src={asset.thumbFull || asset.thumb}
            alt=""
            className="w-full h-full object-cover"
            style={{
              transform: `scale(${1 + Math.min(0.09, (elapsed / Math.max(0.1, row.output_duration)) * 0.09)})`,
              transition: 'transform 80ms linear',
            }}
          />
        ) : (
          <video ref={videoRef} playsInline muted className="w-full h-full object-contain" />
        )}

        {/* 字幕叠层 */}
        {row?.onscreen_text && (
          <div className="absolute inset-x-0 bottom-10 px-6 text-center pointer-events-none">
            <span className="inline-block px-3 py-1.5 rounded-lg bg-black/55 text-white text-base font-semibold leading-snug">
              {row.onscreen_text}
            </span>
          </div>
        )}

        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <span
            className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-white"
            style={{ background: meta.color }}
          >
            {meta.label}
          </span>
          <span className="px-2 py-0.5 rounded-md text-[11px] bg-black/55 text-white/85">
            {idx + 1}/{rows.length} · {row.output_duration.toFixed(1)}s
          </span>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-sail-line overflow-hidden">
        <div className="h-full bg-sail-green" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => {
            setIdx(0);
            setElapsed(0);
          }}
          className="p-2 rounded-lg border border-sail-line text-sail-muted hover:bg-sail-tint"
        >
          <SkipBack size={16} />
        </button>
        <button
          onClick={() => {
            if (!playing && idx >= rows.length - 1 && elapsed >= (row?.output_duration || 0) - 0.05) setIdx(0);
            setPlaying(!playing);
          }}
          className="px-5 py-2 rounded-xl bg-sail-green-deep text-white font-medium flex items-center gap-2"
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
          {playing ? '暂停' : '走一遍'}
        </button>
        <span className="text-xs text-sail-faint tabular-nums w-20">
          {(playedBefore + Math.min(elapsed, row?.output_duration || 0)).toFixed(1)} / {total.toFixed(1)}s
        </span>
      </div>

      {/* slot 缩略条 */}
      <div className="flex gap-1 overflow-x-auto thin-scroll pb-1">
        {rows.map((r, i) => {
          const a = byId[r.assetId];
          const m = beatById(r.beat);
          return (
            <button
              key={r.slot ?? i}
              onClick={() => {
                setIdx(i);
                setElapsed(0);
              }}
              title={`${m.label} · ${r.output_duration.toFixed(1)}s`}
              className={`relative shrink-0 w-12 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                i === idx ? 'border-sail-green-deep' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
              style={{ background: a?.thumb ? undefined : '#E8E2D7' }}
            >
              {a?.thumb ? (
                <img src={a.thumb} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="flex items-center justify-center w-full h-full text-[10px] text-sail-faint">?</span>
              )}
              <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: m.color }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
