// 网页相机：在页面里直接打开后置摄像头拍照 / 录像（getUserMedia），不经过系统相机 / 相册选择器。
// 给打不开系统选择器的手机用（华为没有谷歌 Chrome、App 内置浏览器等）。
// 每拍一张立刻交给 onPhoto（马上存进报告，浏览器中途被关掉也不丢）；录像停下时交给 onVideo。
import { useEffect, useRef, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import { Sheet, Spinner } from '../ui/UI.jsx';
import { t, tb } from '../../lib/i18n.js';
import { pickVideoType, isHuawei } from '../../lib/camera.js';
import { CameraHelpSteps } from './CameraHelp.jsx';

const MAX_REC = 5 * 60; // 录像最长 5 分钟

function errorText(name) {
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return {
      title: t('相机权限被拒绝', 'Camera permission denied'),
      body: isHuawei()
        ? tb(
            '请允许浏览器使用相机：「设置」→「应用和服务」→「权限管理」→「华为浏览器」→「相机」选「允许」（找不到就在「设置」最上面搜「权限管理」；开着「超级隐私模式」要先关掉）。浏览器里点地址栏左边的图标，也要允许这个网站用相机。然后回到这里再试。',
            'Allow the browser to use the camera: Settings → Apps & services → Permission manager → Huawei Browser → Camera → Allow (search "Permission manager" at the top of Settings if you can\'t find it; turn off "Super Privacy Mode" if it is on). In the browser, tap the icon next to the address bar and allow this site to use the camera too. Then come back and try again.',
          )
        : tb(
            '请允许浏览器使用相机：手机「设置」→「应用」→ 你用的浏览器 →「权限」→「相机」选「允许」；浏览器地址栏左边的图标里也要允许这个网站用相机。然后回到这里再试。',
            'Allow the browser to use the camera: phone Settings → Apps → your browser → Permissions → Camera → Allow. Also allow this site to use the camera from the icon next to the address bar. Then come back and try again.',
          ),
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return { title: t('找不到摄像头', 'No camera found'), body: tb('这台设备没有可用的摄像头。', 'This device has no usable camera.') };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      title: t('摄像头被占用', 'Camera is busy'),
      body: tb('摄像头正被别的 App 使用。请关掉相机 / 视频通话等 App 后再试。', 'Another app is using the camera. Close camera / video-call apps and try again.'),
    };
  }
  return {
    title: t('打不开网页相机', "Couldn't open the web camera"),
    body: tb('这个浏览器不支持在网页里用相机。请换「华为浏览器」或其他浏览器打开本网址。', "This browser can't use the camera inside a web page. Open this link in Huawei Browser or another browser."),
  };
}

const fmtSecs = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function WebCamera({ open, onClose, mode = 'photo', left = 99, onPhoto, onVideo }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const [state, setState] = useState('starting'); // starting | ready | error
  const [errName, setErrName] = useState('');
  const [facing, setFacing] = useState('environment');
  const [canFlip, setCanFlip] = useState(false);
  const [shots, setShots] = useState(0);
  const [lastUrl, setLastUrl] = useState('');
  const [flash, setFlash] = useState(false);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const isVideo = mode === 'video';

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // 打开 / 换前后摄像头：重新取画面
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setState('starting');
    setErrName('');
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        setState('ready');
        navigator.mediaDevices
          .enumerateDevices?.()
          .then((list) => !cancelled && setCanFlip(list.filter((d) => d.kind === 'videoinput').length > 1))
          .catch(() => {});
      } catch (e) {
        if (!cancelled) {
          setState('error');
          setErrName(e?.name || 'Error');
        }
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, facing]);

  // 关掉时：正在录就先停下（停下会保存），清掉预览图
  useEffect(() => {
    if (open) return undefined;
    setShots(0);
    setRecording(false);
    setSecs(0);
    setLastUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return '';
    });
    return undefined;
  }, [open]);

  // 录像计时 + 到时间自动停
  useEffect(() => {
    if (!recording) return undefined;
    const start = Date.now();
    const timer = setInterval(() => {
      const s = (Date.now() - start) / 1000;
      setSecs(s);
      if (s >= MAX_REC) stopRec();
    }, 250);
    return () => clearInterval(timer);
  }, [recording]); // eslint-disable-line react-hooks/exhaustive-deps

  const shoot = () => {
    const v = videoRef.current;
    if (!v?.videoWidth || shots >= left) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    c.toBlob(
      (blob) => {
        c.width = c.height = 0;
        if (!blob) return;
        const now = Date.now();
        onPhoto?.(new File([blob], `photo-${now}.jpg`, { type: 'image/jpeg', lastModified: now }));
        setShots((n) => n + 1);
        setLastUrl((u) => {
          if (u) URL.revokeObjectURL(u);
          return URL.createObjectURL(blob);
        });
      },
      'image/jpeg',
      0.92,
    );
  };

  const startRec = () => {
    const stream = streamRef.current;
    if (!stream || recRef.current) return;
    const type = pickVideoType();
    let rec;
    try {
      rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 2_500_000 } : undefined);
    } catch {
      rec = new MediaRecorder(stream);
    }
    const chunks = [];
    const started = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      recRef.current = null;
      setRecording(false);
      const mime = (rec.mimeType || type || 'video/webm').split(';')[0];
      if (!chunks.length) return;
      const now = Date.now();
      const file = new File(chunks, `video-${now}.${/mp4/.test(mime) ? 'mp4' : 'webm'}`, { type: mime, lastModified: now });
      file.durationHint = (now - started) / 1000; // webm 没写时长，用录的秒数
      onVideo?.(file);
      onClose?.();
    };
    rec.start(1000);
    recRef.current = rec;
    setSecs(0);
    setRecording(true);
  };

  function stopRec() {
    try {
      if (recRef.current?.state === 'recording') recRef.current.stop();
    } catch {
      /* ignore */
    }
  }

  const close = () => {
    if (recRef.current) {
      stopRec(); // 停下后 onstop 会保存并关闭
      return;
    }
    onClose?.();
  };

  const err = state === 'error' ? errorText(errName) : null;
  const full = !isVideo && shots >= left;

  return (
    <Sheet open={open} onClose={close} title={isVideo ? t('网页相机 · 录像', 'Web camera · Video') : t('网页相机', 'Web camera')} tall
      footer={
        err ? (
          <button type="button" className="btn-primary mb-1 w-full" onClick={close}>
            {t('关闭', 'Close')}
          </button>
        ) : (
          <div className="mb-1 flex items-center justify-between gap-3">
            <button
              type="button"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-cream-deep text-ink-soft disabled:opacity-40"
              onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
              disabled={!canFlip || recording || state !== 'ready'}
              aria-label={t('切换前后摄像头', 'Switch camera')}
            >
              <Icon name="RefreshCw" size={20} />
            </button>
            {isVideo ? (
              <button
                type="button"
                className={`flex h-16 w-16 items-center justify-center rounded-full ring-4 ring-fail/30 ${recording ? 'bg-white' : 'bg-fail'} disabled:opacity-40`}
                onClick={() => (recording ? stopRec() : startRec())}
                disabled={state !== 'ready'}
                aria-label={recording ? t('停止录像', 'Stop recording') : t('开始录像', 'Start recording')}
              >
                {recording ? <span className="h-6 w-6 rounded-md bg-fail" /> : <span className="h-6 w-6 rounded-full bg-white" />}
              </button>
            ) : (
              <button
                type="button"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-white ring-4 ring-terra/40 active:scale-95 disabled:opacity-40"
                onClick={shoot}
                disabled={state !== 'ready' || full}
                aria-label={t('拍照', 'Take photo')}
                data-shutter
              >
                <span className="h-12 w-12 rounded-full bg-terra" />
              </button>
            )}
            <button type="button" className="btn-ghost h-12 min-w-[4.5rem] px-3 text-[14px]" onClick={close} disabled={recording}>
              {isVideo ? t('取消', 'Cancel') : shots ? `${t('完成', 'Done')} (${shots})` : t('关闭', 'Close')}
            </button>
          </div>
        )
      }
    >
      {err ? (
        <div className="space-y-3 py-2">
          <div className="rounded-xl bg-fail/10 p-3">
            <div className="text-[15px] font-bold text-fail">{err.title}</div>
            <div className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">{err.body}</div>
          </div>
          <CameraHelpSteps />
        </div>
      ) : (
        <div className="flex h-full flex-col gap-2 pb-2">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-contain" playsInline muted autoPlay />
            {state === 'starting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
                <Spinner size={26} />
                <div className="whitespace-pre-line px-6 text-center text-[13px]">
                  {tb('正在打开摄像头…第一次会问要不要允许相机，请点「允许」。', 'Opening the camera… The first time you will be asked to allow the camera — tap "Allow".')}
                </div>
              </div>
            )}
            {flash && <div className="absolute inset-0 bg-white/70" />}
            {recording && (
              <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[13px] font-semibold text-white">
                <span className="h-2 w-2 animate-pulse rounded-full bg-fail" /> {fmtSecs(secs)} / {fmtSecs(MAX_REC)}
              </div>
            )}
            {!isVideo && lastUrl && (
              <img src={lastUrl} alt="" className="absolute bottom-3 left-3 h-16 w-16 rounded-lg object-cover ring-2 ring-white" />
            )}
          </div>
          <div className="whitespace-pre-line text-center text-[12px] text-ink-mute">
            {isVideo
              ? tb('录好点停止就会保存；网页相机录的视频没有声音。', 'Tap stop to save. Videos from the web camera have no sound.')
              : full
                ? tb('已到照片上限。', 'Photo limit reached.')
                : tb('每拍一张都会马上存进报告，拍完点「完成」。', 'Each photo is saved to the report right away. Tap "Done" when finished.')}
          </div>
        </div>
      )}
    </Sheet>
  );
}
