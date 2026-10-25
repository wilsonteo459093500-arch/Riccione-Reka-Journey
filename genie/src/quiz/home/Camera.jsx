// 展厅 iPad 的相机（SPEC §5.2）：许愿模式里客人不能选文件，所以在页面里直接开后置相机拍户型图
// （纸本的，或者客人手机屏幕上的那一张都可以）。
//   · 金色的四个角（大约 A4 的比例）+「四个角都在框里 · 拿稳一点」；
//   · 支持的话有「补光」（track.getCapabilities().torch）；
//   · 拍 = 整个画面 → canvas → JPEG 0.92 → 「清楚吗？」[重拍 · 用这张]；
//   · 关掉、切到别的 app、页面收起：相机马上停（不留着一直亮着的指示灯）；
//   · 照片只存在这台 iPad（之后交给 handoff.js 的 IndexedDB，跟着 CONFIG.keepDays 过期），不进相簿。

import { useEffect, useRef, useState } from 'react';
import { X, RotateCcw, Check, Flashlight } from 'lucide-react';
import fx from '../../shared/fx.js';
import { t } from '../../shared/i18n.js';

export const canUseCamera = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export default function Camera({ onShot, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [state, setState] = useState('starting'); // starting | live | preview | error
  const [shot, setShot] = useState(null); // { blob, url }
  const [torch, setTorch] = useState({ can: false, on: false });
  const shutterRef = useRef(null);
  const shotRef = useRef(null);
  shotRef.current = shot;

  const stop = () => {
    const s = streamRef.current;
    streamRef.current = null;
    s?.getTracks?.().forEach((tr) => {
      try {
        tr.stop();
      } catch {
        /* ignore */
      }
    });
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const alive = useRef(true);
  const start = async () => {
    setState('starting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } },
      });
      // 相机还在开的时候卡片已经关了 / 页面收起了：拿到的画面马上停掉（不留一个亮着的指示灯）
      if (!alive.current || document.hidden || shotRef.current) {
        s.getTracks().forEach((tr) => tr.stop());
        return;
      }
      streamRef.current?.getTracks?.().forEach((tr) => tr.stop());
      streamRef.current = s;
      const v = videoRef.current;
      if (v) {
        v.srcObject = s;
        await v.play().catch(() => {});
      }
      const track = s.getVideoTracks?.()[0];
      let can = false;
      try {
        can = !!track?.getCapabilities?.().torch;
      } catch {
        can = false;
      }
      setTorch({ can, on: false });
      setState('live');
    } catch {
      setState('error');
    }
  };

  useEffect(() => {
    alive.current = true;
    start();
    // 页面收起 / 切走：相机马上停；回来时（还开着这张卡）重新开
    const onVis = () => {
      if (document.hidden) stop();
      else if (!shotRef.current) start();
    };
    const onHide = () => stop();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      alive.current = false;
      stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => shot?.url && URL.revokeObjectURL(shot.url), [shot]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] });
      setTorch((x) => ({ ...x, on }));
    } catch {
      setTorch({ can: false, on: false });
    }
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    if (shutterRef.current) fx.scan(shutterRef.current, { duration: 260, sound: null });
    c.toBlob(
      (blob) => {
        if (!blob) return;
        stop(); // 拍好了：先关相机（预览的时候不用一直亮着）
        setShot({ blob, url: URL.createObjectURL(blob) });
        setState('preview');
      },
      'image/jpeg',
      0.92
    );
  };

  const retake = () => {
    setShot(null);
    start();
  };

  const use = () => {
    if (!shot) return;
    const file = new File([shot.blob], `plan-${Date.now()}.jpg`, { type: 'image/jpeg' });
    onShot?.(file);
  };

  const close = () => {
    stop();
    onClose?.();
  };

  return (
    <div className="pp-cam" role="dialog" aria-modal="true" aria-label={t('对准户型图')}>
      <header>
        <button type="button" onClick={close} data-sfx="close">
          <X size={16} strokeWidth={2} aria-hidden="true" />
          <span>{t('取消')}</span>
        </button>
        <span>{state === 'preview' ? t('清楚吗？') : t('对准户型图')}</span>
        {torch.can && state === 'live' ? (
          <button type="button" className={torch.on ? 'on' : ''} aria-pressed={torch.on} onClick={toggleTorch} data-sfx="toggle">
            <Flashlight size={16} strokeWidth={2} aria-hidden="true" />
            <span>{t('补光')}</span>
          </button>
        ) : (
          <span className="pp-sp" aria-hidden="true" />
        )}
      </header>
      <div className="pp-view">
        {state === 'error' ? (
          <div className="pp-cam-msg">{t('相机打不开 —— 请员工帮你上传，或者先用示范户型。')}</div>
        ) : state === 'preview' && shot ? (
          <img src={shot.url} alt={t('刚拍的户型图')} />
        ) : (
          <>
            <video ref={videoRef} playsInline muted autoPlay />
            <div className="pp-guide" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <span className="pp-hint">{t('四个角都在框里 · 拿稳一点')}</span>
          </>
        )}
      </div>
      <footer>
        {state === 'preview' ? (
          <>
            <span />
            <div className="pp-cam-acts">
              <button type="button" className="btn btn-line" onClick={retake} data-sfx="back">
                <RotateCcw size={18} strokeWidth={1.9} aria-hidden="true" />
                <span>{t('重拍')}</span>
              </button>
              <button type="button" className="btn btn-gold" onClick={use} data-sfx="confirm">
                <Check size={18} strokeWidth={2.2} aria-hidden="true" />
                <span>{t('用这张')}</span>
              </button>
            </div>
            <span />
          </>
        ) : (
          <>
            <small>{t('纸本 / 手机屏幕都行')}</small>
            <button ref={shutterRef} type="button" className="pp-shutter" onClick={capture} disabled={state !== 'live'} aria-label={t('拍照')} data-sfx="confirm" />
            <small>{t('只存在这台 iPad')}</small>
          </>
        )}
      </footer>
    </div>
  );
}
