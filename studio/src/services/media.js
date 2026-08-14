// 本地媒体处理 —— 读取 / 压缩 / 探测时长 / 抽帧，全部在浏览器里完成，不上传第三方。

const IMAGE_MAX_EDGE = 1400; // 送模型的图片最长边
const THUMB_EDGE = 320;
const FRAME_MAX_EDGE = 768; // 抽帧分析用的帧尺寸（够看清构图，又不至于撑爆 payload）

/** 请求体里 inline 视频的安全上限：Gemini 单请求 20MB，base64 会膨胀 4/3 */
export const INLINE_MAX_BYTES = 14 * 1024 * 1024;

// ---------------------------------------------------------------------------
// 通用
// ---------------------------------------------------------------------------

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

export function dataUrlToInput(dataUrl) {
  const [head, base64] = dataUrl.split(',');
  const mimeType = head.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  return { dataUrl, mimeType, base64 };
}

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 3.4 → "0:03.4"；用于时间轴显示 */
export function fmtTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

export function fmtBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// 图片
// ---------------------------------------------------------------------------

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片无法解码'));
    img.src = src;
  });
}

function drawScaled(source, sw, sh, maxEdge, quality = 0.88) {
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** 用户选的图片 → 可发送给模型的对象 */
export async function prepareImage(file) {
  const rawUrl = await fileToDataUrl(file);
  try {
    const img = await loadImageEl(rawUrl);
    const dataUrl = drawScaled(img, img.naturalWidth, img.naturalHeight, IMAGE_MAX_EDGE);
    return {
      dataUrl,
      mimeType: 'image/jpeg',
      base64: dataUrl.split(',')[1],
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  } catch {
    // 少数 HEIC 之类浏览器解不了 —— 原样送，让模型自己试
    const mimeType = file.type || 'image/jpeg';
    return { dataUrl: rawUrl, mimeType, base64: rawUrl.split(',')[1], width: 0, height: 0 };
  }
}

export async function makeThumb(dataUrl, edge = THUMB_EDGE) {
  try {
    const img = await loadImageEl(dataUrl);
    return drawScaled(img, img.naturalWidth, img.naturalHeight, edge, 0.75);
  } catch {
    return dataUrl;
  }
}

// ---------------------------------------------------------------------------
// 视频
// ---------------------------------------------------------------------------

function loadVideoEl(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    const done = () => {
      if (!v.duration || !Number.isFinite(v.duration)) {
        reject(new Error('读不到视频时长，换个格式（建议 mp4 / H.264）再试'));
        return;
      }
      resolve(v);
    };
    v.onloadedmetadata = done;
    v.onerror = () => reject(new Error('这个视频浏览器打不开，建议转成 mp4 (H.264) 再上传'));
    v.src = url;
  });
}

/** 探测时长 / 分辨率，并返回一个可用于播放的 objectURL（用完记得 revoke） */
export async function probeVideo(file) {
  const url = URL.createObjectURL(file);
  const v = await loadVideoEl(url).catch((e) => {
    URL.revokeObjectURL(url);
    throw e;
  });
  return {
    url,
    duration: v.duration,
    width: v.videoWidth,
    height: v.videoHeight,
    aspect: v.videoWidth && v.videoHeight ? `${v.videoWidth}:${v.videoHeight}` : '',
  };
}

function seekTo(video, t) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('抽帧超时')), 12000);
    const onSeeked = () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      // 给解码器一帧的时间把画面真正画出来
      requestAnimationFrame(() => resolve());
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = Math.min(Math.max(0, t), Math.max(0, video.duration - 0.05));
  });
}

/**
 * 均匀抽帧 —— 大文件走不了 Files API 时的兜底分析方式，也用来做素材缩略图。
 * @param {string} url objectURL
 * @param {number} count 帧数
 * @param {(pct:number)=>void} [onProgress]
 * @returns {Promise<Array<{t:number, dataUrl:string, base64:string, mimeType:string}>>}
 */
export async function sampleFrames(url, count = 16, onProgress) {
  const v = await loadVideoEl(url);
  const dur = v.duration;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, FRAME_MAX_EDGE / Math.max(v.videoWidth, v.videoHeight));
  canvas.width = Math.max(2, Math.round(v.videoWidth * scale));
  canvas.height = Math.max(2, Math.round(v.videoHeight * scale));
  const ctx = canvas.getContext('2d');

  const frames = [];
  for (let i = 0; i < count; i++) {
    // 首尾各留一点，避免抓到黑场
    const t = dur * ((i + 0.5) / count);
    try {
      await seekTo(v, t);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      frames.push({ t, dataUrl, base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
    } catch {
      /* 单帧失败就跳过，不中断整体 */
    }
    onProgress?.(Math.round(((i + 1) / count) * 100));
  }
  v.src = '';
  if (!frames.length) throw new Error('一帧都抽不出来，换个视频格式（mp4 / H.264）再试');
  return frames;
}

/** 取一张封面缩略图（默认取 1 秒处） */
export async function videoThumb(url, at = 1) {
  try {
    const v = await loadVideoEl(url);
    await seekTo(v, Math.min(at, v.duration * 0.3));
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, THUMB_EDGE / Math.max(v.videoWidth, v.videoHeight));
    canvas.width = Math.max(2, Math.round(v.videoWidth * scale));
    canvas.height = Math.max(2, Math.round(v.videoHeight * scale));
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', 0.72);
    v.src = '';
    return out;
  } catch {
    return null;
  }
}

/** 小视频直接 inline 给模型（含声音，分析质量最好） */
export async function videoToInline(file) {
  const dataUrl = await fileToDataUrl(file);
  return { inline_data: { mime_type: file.type || 'video/mp4', data: dataUrl.split(',')[1] } };
}

// ---------------------------------------------------------------------------
// 下载
// ---------------------------------------------------------------------------

export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
