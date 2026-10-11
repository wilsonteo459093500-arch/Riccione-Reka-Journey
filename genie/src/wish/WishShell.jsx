// 客户许愿模式（客户体验模式）的外壳：
//   · 按下按钮的那一刻开始播放大自然禅意音乐（Zen 声景）；
//   · 占卜 → 蓝图 → 3D 都在同一个外壳里（iframe）进行，所以换页时音乐不会断；
//   · 子页面用 postMessage 报告进度：翻章节、许愿、揭晓、3D 里的时间 —— 音乐跟着变；
//   · 员工专用的动作（下一位、结束）要长按，免得客人误触。

import { useEffect, useRef, useState } from 'react';
import Pangie from '../shared/Pangie.jsx';
import { GUIDE } from '../shared/config.js';

const HOLD_MS = 1200;

function HoldButton({ children, onHold, className = '' }) {
  const [p, setP] = useState(0);
  const timer = useRef(null);
  const t0 = useRef(0);
  const start = (e) => {
    e.preventDefault();
    t0.current = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0.current) / HOLD_MS);
      setP(k);
      if (k >= 1) {
        setP(0);
        onHold();
        return;
      }
      timer.current = requestAnimationFrame(tick);
    };
    timer.current = requestAnimationFrame(tick);
  };
  const end = () => {
    cancelAnimationFrame(timer.current);
    setP(0);
  };
  return (
    <button type="button" className={`ws-hold ${className}`} onPointerDown={start} onPointerUp={end} onPointerLeave={end} onPointerCancel={end} style={{ '--p': p }}>
      <i />
      <span>{children}</span>
    </button>
  );
}

export default function WishShell({ zen, startUrl, onExit }) {
  const frame = useRef(null);
  const [src, setSrc] = useState(startUrl);
  const [where, setWhere] = useState('quiz');
  const [open, setOpen] = useState(false);
  const [vol, setVol] = useState(zen.volume);
  const [muted, setMuted] = useState(zen.muted);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [round, setRound] = useState(0);

  // 子页面的消息 → 音乐
  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== location.origin || e.data?.source !== 'genie') return;
      const d = e.data;
      if (d.type === 'page') setWhere(d.page);
      else if (d.type === 'chapter') {
        zen.setMood(d.chapter === 'treasure' || d.chapter === 'wishes' ? 'focus' : 'calm');
        zen.accent('chapter');
      } else if (d.type === 'wish') zen.accent('wish');
      else if (d.type === 'reveal') {
        zen.accent('reveal');
        zen.setMood('bright');
      } else if (d.type === 'time') zen.setMood(d.hour >= 19.6 || d.hour < 6.4 ? 'night' : 'calm');
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [zen]);

  const postToChild = (msg) => {
    try {
      frame.current?.contentWindow?.postMessage({ source: 'genie-shell', ...msg }, location.origin);
    } catch {
      /* ignore */
    }
  };

  const onLoad = () => {
    try {
      const path = frame.current.contentWindow.location.pathname;
      setWhere(/studio/.test(path) ? 'studio' : 'quiz');
    } catch {
      /* ignore */
    }
    postToChild({ type: 'sfx', muted: sfxMuted });
  };

  const nextGuest = () => {
    try {
      sessionStorage.removeItem('genie.session.v1');
    } catch {
      /* ignore */
    }
    zen.setMood('calm');
    setRound((r) => r + 1);
    setSrc(`${startUrl}${startUrl.includes('?') ? '&' : '?'}r=${round + 1}`);
    setOpen(false);
  };

  return (
    <div className={`ws ws-${where}`}>
      <iframe ref={frame} key={src} src={src} title="WISH 许愿模式" className="ws-frame" onLoad={onLoad} allow="fullscreen; autoplay; clipboard-write; web-share" />

      <div className={`ws-ctrl ${open ? 'open' : ''}`}>
        <button type="button" className="ws-pill" onClick={() => setOpen((o) => !o)} aria-label="音乐">
          <span className={`ws-bars ${muted ? 'off' : ''}`}>
            <i />
            <i />
            <i />
            <i />
          </span>
          <em>{muted ? '已静音' : '自然之声'}</em>
        </button>
        {open && (
          <div className="ws-panel">
            <div className="ws-row">
              <Pangie mood="mystic" prop="ball" size={54} float={false} />
              <p>
                {GUIDE.name}正在为你播放
                <br />
                <b>溪水 · 微风 · 颂钵 · 风铃</b>
              </p>
            </div>
            <label className="ws-vol">
              音量
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={vol}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVol(v);
                  zen.setVolume(v);
                  if (muted && v > 0) {
                    setMuted(false);
                    zen.setMuted(false);
                  }
                }}
              />
            </label>
            <div className="ws-btns">
              <button
                type="button"
                onClick={() => {
                  setMuted((m) => !m);
                  zen.setMuted(!muted);
                }}
              >
                {muted ? '🔈 打开音乐' : '🔇 音乐静音'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSfxMuted((m) => !m);
                  postToChild({ type: 'sfx', muted: !sfxMuted });
                }}
              >
                {sfxMuted ? '🔔 打开音效' : '🔕 关掉音效'}
              </button>
            </div>
            <div className="ws-staff">
              <span>员工（长按）</span>
              <HoldButton onHold={nextGuest}>↺ 下一位客人</HoldButton>
              <HoldButton className="end" onHold={onExit}>
                ⏻ 结束许愿模式
              </HoldButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
