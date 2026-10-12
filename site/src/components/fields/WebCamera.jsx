// 网页相机：在页面里直接打开后置摄像头拍照 / 录像（getUserMedia），不经过系统相机 / 相册选择器。
// 给打不开系统选择器的手机用（华为没有谷歌 Chrome、App 内置浏览器等）。
// 每拍一张立刻交给 onPhoto（马上存进报告，浏览器中途被关掉也不丢）；录像停下时交给 onVideo。
// 父组件打开时才挂载（每次打开都是新的），关掉就卸载。
import { useEffect, useRef, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import { Sheet, Spinner, useUI } from '../ui/UI.jsx';
import { t, tb } from '../../lib/i18n.js';
import { pickVideoType, inAppBrowser, isAndroid, isHuawei } from '../../lib/camera.js';
import { CameraHelpSteps, CopyLinkButtons, permissionText } from './CameraHelp.jsx';

const MAX_REC = 5 * 60; // 录像最长 5 分钟

function errorText(name) {
  // App 内置浏览器：多半是 App 不让网页用相机（各 App 报的错不一样），去系统设置里也改不了 → 先用浏览器打开
  if (inAppBrowser() && name !== 'NotReadableError' && name !== 'TrackStartError') {
    return {
      title: t('这个 App 里不能用相机', "This app doesn't allow the camera"),
      body: tb(
        'WhatsApp / 微信等 App 里打开的网页用不了相机。请点右上角「⋮」→「在浏览器中打开」，或复制链接到浏览器打开。',
        'Pages opened inside WhatsApp / WeChat and similar apps cannot use the camera. Tap "⋮" at the top right → "Open in browser", or copy the link into your browser.',
      ),
      inApp: true,
    };
  }
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return {
      title: t('相机权限被拒绝', 'Camera permission denied'),
      body: `${tb('请允许浏览器使用相机：', 'Allow the browser to use the camera: ')}${permissionText()}\n${tb(
        '浏览器里点地址栏左边的图标，也要允许这个网站用相机。改好后点「再试一次」。',
        'In the browser, tap the icon next to the address bar and allow this site to use the camera too. Then tap "Try again".',
      )}`,
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return { title: t('找不到摄像头', 'No camera found'), body: tb('这台设备没有可用的摄像头。', 'This device has no usable camera.') };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      title: t('摄像头被占用', 'Camera is busy'),
      body: tb('摄像头正被别的 App 使用。请关掉相机 / 视频通话等 App 后点「再试一次」。', 'Another app is using the camera. Close camera / video-call apps, then tap "Try again".'),
    };
  }
  return {
    title: t('打不开网页相机', "Couldn't open the web camera"),
    body: tb('这个浏览器不支持在网页里用相机。请换「华为浏览器」或其他浏览器打开本网址。', "This browser can't use the camera inside a web page. Open this link in Huawei Browser or another browser."),
    steps: true, // 网页相机用不了：下面给让系统相机能用的办法
  };
}

const fmtSecs = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// 手机实际怎么拿（逆时针转了几度）：看重力方向。安卓 / 鸿蒙竖着拿时 y≈+9.8；左转 90°（右边朝上）x≈+9.8
function heldAngle(g) {
  if (!g) return 0;
  const { x = 0, y = 0 } = g;
  if (Math.abs(x) > Math.abs(y) + 2) return x > 0 ? 90 : 270;
  if (y < -4) return 180;
  return 0;
}

// 画面转正：屏幕锁定竖屏时横着拿，摄像头给的画面是歪的（网页相机拍的照片没有方向标记，要自己转）
function drawRotated(v, ccw) {
  const w = v.videoWidth;
  const h = v.videoHeight;
  const c = document.createElement('canvas');
  const swap = ccw === 90 || ccw === 270;
  c.width = swap ? h : w;
  c.height = swap ? w : h;
  const ctx = c.getContext('2d');
  if (ccw === 90) {
    ctx.translate(0, c.height);
    ctx.rotate(-Math.PI / 2);
  } else if (ccw === 270) {
    ctx.translate(c.width, 0);
    ctx.rotate(Math.PI / 2);
  } else if (ccw === 180) {
    ctx.translate(w, h);
    ctx.rotate(Math.PI);
  }
  ctx.drawImage(v, 0, 0, w, h);
  return c;
}

export default function WebCamera({ onClose, mode = 'photo', left = 99, onPhoto, onVideo }) {
  const { toast } = useUI();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const closingRef = useRef(false);
  const urlRef = useRef('');
  const gravityRef = useRef(null);
  const limit = useRef(left); // 打开时还能拍几张（拍了马上存，外面的剩余数会跟着变，不能再拿来比）
  const taken = useRef(0); // 同步计数：连点快门也不会超
  const [attempt, setAttempt] = useState(0); // 「再试一次」
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
  const webm = isVideo && !/mp4/.test(pickVideoType());

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // 打开 / 换前后摄像头 / 再试一次：重新取画面
  useEffect(() => {
    let cancelled = false;
    setState('starting');
    setErrName('');
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no getUserMedia'), { name: 'NotSupportedError' });
        const stream = await navigator.mediaDevices.getUserMedia({
          // 录像用 720p：老手机软件编码 1080p 会卡
          video: isVideo
            ? { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
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
  }, [facing, attempt, isVideo]);

  // 记下手机怎么拿（只看安卓 / 鸿蒙：iPhone 的方向数值相反，而且要先授权）
  useEffect(() => {
    if (isVideo || !(isAndroid() || isHuawei())) return undefined;
    const on = (e) => {
      const g = e.accelerationIncludingGravity;
      if (g && (g.x != null || g.y != null)) gravityRef.current = { x: g.x || 0, y: g.y || 0 };
    };
    window.addEventListener('devicemotion', on);
    return () => window.removeEventListener('devicemotion', on);
  }, [isVideo]);

  // 卸载：停掉录像、释放预览图
  useEffect(
    () => () => {
      try {
        if (recRef.current?.state === 'recording') recRef.current.stop();
      } catch {
        /* ignore */
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

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
    if (!v?.videoWidth || taken.current >= limit.current) return;
    taken.current += 1;
    const screenAngle = ((globalThis.screen?.orientation?.angle ?? globalThis.orientation ?? 0) + 360) % 360;
    const ccw = (heldAngle(gravityRef.current) - screenAngle + 360) % 360;
    const c = drawRotated(v, ccw);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    c.toBlob(
      (blob) => {
        c.width = c.height = 0;
        if (!blob) {
          taken.current -= 1;
          return;
        }
        const now = Date.now();
        onPhoto?.(new File([blob], `photo-${now}.jpg`, { type: 'image/jpeg', lastModified: now }));
        setShots(taken.current);
        const u = URL.createObjectURL(blob);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = u;
        setLastUrl(u);
      },
      'image/jpeg',
      0.92,
    );
  };

  const recFailed = () => {
    recRef.current = null;
    setRecording(false);
    toast(t('没有录到画面，请再试一次', 'Nothing was recorded — please try again'), 'error');
    if (closingRef.current) onClose?.();
  };

  const startRec = () => {
    const stream = streamRef.current;
    if (!stream || recRef.current) return;
    const type = pickVideoType();
    let rec;
    try {
      rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 2_500_000 } : undefined);
    } catch {
      try {
        rec = new MediaRecorder(stream);
      } catch {
        toast(t('这个浏览器不能用网页相机录像', "This browser can't record video in a web page"), 'error');
        return;
      }
    }
    const chunks = [];
    const started = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };
    rec.onerror = () => recFailed();
    rec.onstop = () => {
      if (!chunks.length) {
        recFailed();
        return;
      }
      recRef.current = null;
      setRecording(false);
      const mime = (rec.mimeType || type || 'video/webm').split(';')[0];
      const now = Date.now();
      const file = new File(chunks, `video-${now}.${/mp4/.test(mime) ? 'mp4' : 'webm'}`, { type: mime, lastModified: now });
      file.durationHint = (now - started) / 1000; // webm 没写时长，用录的秒数
      onVideo?.(file);
      onClose?.();
    };
    try {
      rec.start(1000);
    } catch {
      toast(t('这个浏览器不能用网页相机录像', "This browser can't record video in a web page"), 'error');
      return;
    }
    recRef.current = rec;
    setSecs(0);
    setRecording(true);
  };

  function stopRec() {
    try {
      if (recRef.current?.state === 'recording') recRef.current.stop();
    } catch {
      recFailed();
    }
  }

  const close = () => {
    if (recRef.current) {
      closingRef.current = true;
      stopRec(); // 停下后 onstop 会保存并关闭
      return;
    }
    onClose?.();
  };

  const err = state === 'error' ? errorText(errName) : null;
  const full = !isVideo && shots >= limit.current;

  return (
    <Sheet open onClose={close} title={isVideo ? t('网页相机 · 录像', 'Web camera · Video') : t('网页相机', 'Web camera')} tall
      footer={
        err ? (
          <div className="mb-1 flex gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={close}>
              {t('关闭', 'Close')}
            </button>
            {!err.inApp && (
              <button type="button" className="btn-primary flex-1" onClick={() => setAttempt((n) => n + 1)}>
                <Icon name="RotateCcw" size={16} /> {t('再试一次', 'Try again')}
              </button>
            )}
          </div>
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
            {err.inApp && <CopyLinkButtons />}
          </div>
          {err.steps && <CameraHelpSteps inWebCam />}
        </div>
      ) : (
        <div className="flex h-full flex-col gap-2 pb-2">
          <div className="relative min-h-[45vh] flex-1 overflow-hidden rounded-2xl bg-black">
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
              ? webm
                ? tb(
                    '录好点停止就会保存；网页相机录的视频没有声音，格式是 WebM，WhatsApp 里可能要当文件打开。能用「录视频」就优先用。',
                    'Tap stop to save. Web-camera videos have no sound and are saved as WebM, which WhatsApp may only open as a file. Use "Record video" when it works.',
                  )
                : tb('录好点停止就会保存；网页相机录的视频没有声音。', 'Tap stop to save. Videos from the web camera have no sound.')
              : full
                ? tb('已到照片上限。', 'Photo limit reached.')
                : limit.current < 99
                  ? tb(`每拍一张都会马上存进报告，还能拍 ${limit.current - shots} 张，拍完点「完成」。`, `Each photo is saved to the report right away — ${limit.current - shots} more allowed. Tap "Done" when finished.`)
                  : tb('每拍一张都会马上存进报告，拍完点「完成」。', 'Each photo is saved to the report right away. Tap "Done" when finished.')}
          </div>
        </div>
      )}
    </Sheet>
  );
}
