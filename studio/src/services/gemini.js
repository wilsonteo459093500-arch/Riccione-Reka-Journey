// Gemini 客户端 —— 浏览器直连 generativelanguage.googleapis.com。
// API key 只存在本机 localStorage，不经过任何中间服务器。
//
// 三种能力：
//   1. generateJSON  —— 文本 / 多模态推理，强制返回 JSON（拆解、排剪辑、写文案都走它）
//   2. uploadVideo   —— Files API 断点上传，让模型「看完整条视频」（含声音）
//   3. generateImage —— 出图（封面 / 案例图 / 动态帖单帧）

import {
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  TEXT_MODEL_CANDIDATES,
  IMAGE_MODEL_CANDIDATES,
} from '../constants.js';

const TEXT_MODEL_CACHE = 'riccione.studio.textModel';
const IMAGE_MODEL_CACHE = 'riccione.studio.imageModel';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function base(settings) {
  return (settings.baseUrl || DEFAULT_SETTINGS.baseUrl).replace(/\/+$/, '');
}

function endpoint(settings, path) {
  return `${base(settings)}${path}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function friendlyError(status, message) {
  if (status === 400 && /api key/i.test(message || '')) return 'API key 无效，请到设置里检查。';
  if (status === 401 || status === 403) return 'API key 无权限或已失效，请到设置里检查。';
  if (status === 413) return '文件太大了，换一条更短的视频，或让系统改用「抽帧分析」。';
  if (status === 429) {
    if (/per\s*day|PerDay|daily/i.test(message || '')) {
      return '今天的免费额度用完了。明天会重置；想不受限制，去 Google AI Studio 开通按量付费。';
    }
    return '被限流了（免费 key 每分钟额度很小）。等 1 分钟再试，或去 AI Studio 开通按量付费。';
  }
  if (status === 404) return '当前模型不可用，到设置 → 高级里换一个模型再试。';
  if (status >= 500) return 'AI 服务暂时不稳定，稍后重试即可。';
  return message || `请求失败（HTTP ${status}）`;
}

/** 从 429 响应里解析 Google 建议的重试等待秒数 */
function parseRetryDelaySeconds(data) {
  for (const d of data?.error?.details || []) {
    if (String(d['@type'] || '').includes('RetryInfo') && d.retryDelay) {
      const m = String(d.retryDelay).match(/([\d.]+)/);
      if (m) return Math.min(60, Math.ceil(Number(m[1])));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 核心推理调用
// ---------------------------------------------------------------------------

/**
 * 调一次 generateContent。被限流 / 5xx 会自动退避重试。
 * @param {object} settings
 * @param {string} model
 * @param {Array} parts   Gemini parts 数组（text / inline_data / file_data 混合）
 * @param {object} [opts] { json: boolean, temperature: number, onWait: fn }
 */
async function callModel(settings, model, parts, opts = {}) {
  if (!settings.apiKey) throw new Error('还没有配置 API key，点右上角设置。');

  const generationConfig = { temperature: opts.temperature ?? 0.7 };
  if (opts.json) generationConfig.responseMimeType = 'application/json';
  if (opts.maxTokens) generationConfig.maxOutputTokens = opts.maxTokens;

  const url = endpoint(
    settings,
    `/v1beta/models/${model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`
  );

  const MAX_RETRIES = 3;
  let res = null;
  let data = null;

  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig }),
    });

    data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON body */
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (res.ok || !retryable || attempt >= MAX_RETRIES) break;
    if (res.status === 429 && /per\s*day|PerDay|daily/i.test(data?.error?.message || '')) break;

    const waitSec = parseRetryDelaySeconds(data) ?? Math.min(60, 10 * 2 ** attempt);
    opts.onWait?.(waitSec, attempt + 1);
    await sleep(waitSec * 1000);
  }

  if (!res.ok) {
    const err = new Error(friendlyError(res.status, data?.error?.message));
    err.modelNotFound = res.status === 404;
    throw err;
  }

  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) throw new Error(`请求被安全策略拦截（${blockReason}），换个说法或换张图试试。`);

  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('')
    .trim();

  if (!text) {
    const finish = data?.candidates?.[0]?.finishReason;
    throw new Error(finish === 'MAX_TOKENS' ? '内容太长被截断了，减少素材数量再试。' : '模型没有返回内容，请重试。');
  }
  return text;
}

/** 按候选列表依次尝试模型，只有 404 才换下一个；成功的记进 localStorage */
async function withModelFallback(settings, cacheKey, candidates, run) {
  const cached = localStorage.getItem(cacheKey);
  const list = [...new Set([cached, ...candidates].filter(Boolean))];
  let lastErr = null;
  for (const model of list) {
    try {
      const out = await run(model);
      localStorage.setItem(cacheKey, model);
      return out;
    } catch (e) {
      lastErr = e;
      if (!e.modelNotFound) throw e;
    }
  }
  throw lastErr || new Error('没有可用的模型。');
}

/** 从模型返回里抠出 JSON（防止偶尔带 ```json 围栏或前后废话） */
function parseJson(text) {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    // 退而求其次：截取第一个 { 到最后一个 }
    const s = t.indexOf('{');
    const e = t.lastIndexOf('}');
    if (s >= 0 && e > s) {
      try {
        return JSON.parse(t.slice(s, e + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error('模型返回的不是合法 JSON，请重试一次。');
  }
}

/**
 * 让模型返回结构化 JSON。
 * @param {object} settings
 * @param {Array} parts  Gemini parts（至少含一个 {text}）
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
export async function generateJSON(settings, parts, opts = {}) {
  const preferred = settings.textModel ? [settings.textModel] : [];
  const text = await withModelFallback(
    settings,
    TEXT_MODEL_CACHE,
    [...preferred, ...TEXT_MODEL_CANDIDATES],
    (model) => callModel(settings, model, parts, { ...opts, json: true, maxTokens: opts.maxTokens ?? 32768 })
  );
  return parseJson(text);
}

/** 纯文本返回（趋势解读之类不需要严格结构的场景） */
export async function generateText(settings, parts, opts = {}) {
  const preferred = settings.textModel ? [settings.textModel] : [];
  return withModelFallback(settings, TEXT_MODEL_CACHE, [...preferred, ...TEXT_MODEL_CANDIDATES], (model) =>
    callModel(settings, model, parts, opts)
  );
}

// ---------------------------------------------------------------------------
// Files API —— 让模型看完整条视频（含声音），比抽帧强得多
// ---------------------------------------------------------------------------

/**
 * 断点上传一个文件到 Gemini Files API，返回可直接用的 file_data part。
 * 浏览器端可能因 CORS 拿不到 upload URL —— 这种情况抛 err.corsBlocked，
 * 让调用方回退到本地抽帧。
 *
 * @param {object} settings
 * @param {File|Blob} file
 * @param {(stage: string, pct: number) => void} [onProgress]
 * @returns {Promise<{file_data:{mime_type:string,file_uri:string}}>}
 */
export async function uploadVideo(settings, file, onProgress) {
  if (!settings.apiKey) throw new Error('还没有配置 API key，点右上角设置。');
  const mime = file.type || 'video/mp4';

  onProgress?.('准备上传…', 5);
  const startRes = await fetch(
    endpoint(settings, `/upload/v1beta/files?key=${encodeURIComponent(settings.apiKey)}`),
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(file.size),
        'X-Goog-Upload-Header-Content-Type': mime,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: file.name || 'reference' } }),
    }
  ).catch((e) => {
    const err = new Error(`上传通道打不开：${e.message}`);
    err.corsBlocked = true;
    throw err;
  });

  if (!startRes.ok) {
    let msg = '';
    try {
      msg = (await startRes.json())?.error?.message || '';
    } catch {
      /* ignore */
    }
    throw new Error(friendlyError(startRes.status, msg));
  }

  const uploadUrl = startRes.headers.get('x-goog-upload-url') || startRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) {
    // 浏览器没被允许读到这个响应头 —— 走抽帧兜底
    const err = new Error('浏览器拿不到上传地址（CORS 限制）');
    err.corsBlocked = true;
    throw err;
  }

  onProgress?.('上传中…', 25);
  const putRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: file,
  });
  if (!putRes.ok) throw new Error(friendlyError(putRes.status, '文件上传失败'));

  const uploaded = (await putRes.json())?.file;
  if (!uploaded?.uri) throw new Error('上传成功但没拿到文件地址，请重试。');

  // 等 Google 把视频处理成可分析状态
  onProgress?.('Google 正在处理视频…', 55);
  const id = uploaded.name; // 形如 files/abc123
  for (let i = 0; i < 60; i++) {
    const stat = await fetch(
      endpoint(settings, `/v1beta/${id}?key=${encodeURIComponent(settings.apiKey)}`)
    ).then((r) => (r.ok ? r.json() : null));
    if (stat?.state === 'ACTIVE') {
      onProgress?.('准备分析…', 85);
      return { file_data: { mime_type: stat.mimeType || mime, file_uri: stat.uri } };
    }
    if (stat?.state === 'FAILED') throw new Error('Google 处理这条视频失败了，换个格式（建议 mp4）再试。');
    onProgress?.('Google 正在处理视频…', Math.min(80, 55 + i * 2));
    await sleep(2000);
  }
  throw new Error('视频处理超时，换条更短的视频再试。');
}

// ---------------------------------------------------------------------------
// 出图
// ---------------------------------------------------------------------------

/**
 * 生成一张图。
 * @param {object} settings
 * @param {string} prompt
 * @param {Array<{mimeType:string,base64:string}>|null} images 参考图（可空）
 * @param {string|null} aspectRatio 如 '9:16'（只在纯文生图时有效）
 * @returns {Promise<string>} dataURL
 */
export async function generateImage(settings, prompt, images, aspectRatio, onWait, imageSize = '2K') {
  if (!settings.apiKey) throw new Error('还没有配置 API key，点右上角设置。');

  const list = Array.isArray(images) ? images : images ? [images] : [];
  const parts = list.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } }));
  parts.push({ text: prompt });

  const preferred = settings.imageModel ? [settings.imageModel] : [];
  return withModelFallback(
    settings,
    IMAGE_MODEL_CACHE,
    [...preferred, ...IMAGE_MODEL_CANDIDATES],
    async (model) => {
      const generationConfig = { responseModalities: ['TEXT', 'IMAGE'] };
      const imageConfig = {};
      if (aspectRatio && !list.length) imageConfig.aspectRatio = aspectRatio;
      // imageSize 必须大写，小写会被 API 静默忽略。
      // 2.5-flash-image 只到 1K，给它更高的值没有意义。
      imageConfig.imageSize = /2\.5-flash-image/.test(model)
        ? '1K'
        : String(imageSize || '2K').toUpperCase();
      generationConfig.imageConfig = imageConfig;

      const url = endpoint(
        settings,
        `/v1beta/models/${model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`
      );

      let res = null;
      let data = null;
      for (let attempt = 0; ; attempt++) {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig }),
        });
        data = null;
        try {
          data = await res.json();
        } catch {
          /* ignore */
        }
        const retryable = res.status === 429 || res.status >= 500;
        if (res.ok || !retryable || attempt >= 3) break;
        if (res.status === 429 && /per\s*day|PerDay|daily/i.test(data?.error?.message || '')) break;
        const waitSec = parseRetryDelaySeconds(data) ?? Math.min(60, 10 * 2 ** attempt);
        onWait?.(waitSec, attempt + 1);
        await sleep(waitSec * 1000);
      }

      if (!res.ok) {
        const err = new Error(friendlyError(res.status, data?.error?.message));
        err.modelNotFound = res.status === 404;
        throw err;
      }

      const candidate = data?.candidates?.[0];
      const candidateParts = candidate?.content?.parts || [];
      const imagePart = candidateParts.find((p) => p.inlineData?.data || p.inline_data?.data);

      if (!imagePart) {
        // 安全拦截要跟「模型抽风」分开报，因为处理方式完全不同：
        // 前者必须改写 prompt，后者重试一次通常就好。
        const reason = candidate?.finishReason;
        if (reason === 'IMAGE_SAFETY' || reason === 'SAFETY') {
          const err = new Error('这张图被安全过滤器拦下了（重试没用，得改写画面描述）。');
          err.safetyBlocked = true;
          throw err;
        }
        if (reason === 'PROHIBITED_CONTENT') {
          const err = new Error('这个题材被内容政策直接禁止，换个画面概念吧。');
          err.safetyBlocked = true;
          err.hardBlock = true;
          throw err;
        }
        if (reason === 'RECITATION') {
          const err = new Error('生成结果太接近已有的受版权保护画面，换个描述重试。');
          err.safetyBlocked = true;
          throw err;
        }
        const text = candidateParts.find((p) => p.text)?.text;
        throw new Error(text ? `模型没有返回图片：${text.slice(0, 160)}` : '模型没有返回图片，请重试。');
      }
      const inline = imagePart.inlineData || imagePart.inline_data;
      const m = inline.mimeType || inline.mime_type || 'image/png';
      return `data:${m};base64,${inline.data}`;
    }
  );
}

/** 测试 key 是否可用 */
export async function testConnection(settings) {
  const model = settings.textModel || TEXT_MODEL_CANDIDATES[0];
  const res = await fetch(
    endpoint(settings, `/v1beta/models/${model}?key=${encodeURIComponent(settings.apiKey)}`)
  );
  if (!res.ok) {
    let msg = '';
    try {
      msg = (await res.json())?.error?.message || '';
    } catch {
      /* ignore */
    }
    throw new Error(friendlyError(res.status, msg));
  }
  return true;
}
