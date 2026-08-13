// Gemini 图像模型客户端 —— 浏览器直连 generativelanguage.googleapis.com，
// API key 只存在本机 localStorage，不经过任何中间服务器。

import { SETTINGS_KEY, DEFAULT_SETTINGS, LEGACY_DEFAULT_MODEL } from '../constants.js';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    // 旧默认模型静默升级到 Nano Banana 2；用户在设置里手动保存过的选择（userPinnedModel）不动
    if (merged.model === LEGACY_DEFAULT_MODEL && !merged.userPinnedModel) {
      merged.model = DEFAULT_SETTINGS.model;
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, userPinnedModel: true }));
}

function endpoint(settings, path) {
  const base = (settings.baseUrl || DEFAULT_SETTINGS.baseUrl).replace(/\/+$/, '');
  return `${base}${path}`;
}

function friendlyError(status, message) {
  if (status === 400 && /api key/i.test(message || '')) return 'API key 无效，请到设置里检查。';
  if (status === 401 || status === 403) return 'API key 无权限或已失效，请到设置里检查。';
  if (status === 429) {
    if (/per\s*day|PerDay|daily/i.test(message || '')) {
      return '今天的免费额度用完了。明天会重置；想不受限制，去 Google AI Studio 开通按量付费（约 US$0.04/张，无月费）。';
    }
    return '已重试多次仍被限流（免费 key 每分钟额度很小）。选 1 张、等 1 分钟再试；想稳定出图，去 Google AI Studio 开通按量付费（约 US$0.04/张）。';
  }
  if (status === 404) {
    return '当前模型不可用（可能预览版已下线或你的账号没权限）。到设置 → 高级选项把模型换成 gemini-2.5-flash-image 再试。';
  }
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 图像理解 / 文字分析（设计顾问审图用）。
 * @param {object} settings { apiKey, baseUrl }
 * @param {string} model    文字模型 id（如 gemini-2.5-flash）
 * @param {string} prompt   分析指令
 * @param {object} image    { mimeType, base64 }
 * @returns {Promise<string>} 文字点评
 */
export async function analyzeImage(settings, model, prompt, image) {
  if (!settings.apiKey) throw new Error('还没有配置 API key，点右上角设置。');
  const url = endpoint(settings, `/v1beta/models/${model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`);
  const parts = [{ inline_data: { mime_type: image.mimeType, data: image.base64 } }, { text: prompt }];

  let res = null;
  let data = null;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
    });
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (res.ok || !retryable || attempt >= 2) break;
    await sleep((parseRetryDelaySeconds(data) ?? 10 * 2 ** attempt) * 1000);
  }
  if (!res.ok) throw new Error(friendlyError(res.status, data?.error?.message));

  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('')
    .trim();
  if (!text) throw new Error('模型没有返回点评，请重试。');
  return text;
}

/** 测试 key / 模型是否可用 */
export async function testConnection(settings) {
  const url = endpoint(settings, `/v1beta/models/${settings.model}?key=${encodeURIComponent(settings.apiKey)}`);
  const res = await fetch(url);
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

/**
 * 生成一张图。撞到限流 (429) 或服务端错误 (5xx) 会自动等待并重试最多 3 次，
 * 等待时间优先采用 Google 返回的建议值，并通过 onWait 告知 UI。
 * @param {object} settings  { apiKey, model, baseUrl }
 * @param {string} prompt    完整英文 prompt
 * @param {object|null} image  { mimeType, base64 }
 * @param {string|null} aspectRatio 仅文字模式使用，如 '16:9'
 * @param {(seconds: number, attempt: number) => void} [onWait] 重试等待回调
 * @returns {Promise<string>} 图片 dataURL
 */
export async function generateImage(settings, prompt, image, aspectRatio, onWait) {
  if (!settings.apiKey) throw new Error('还没有配置 API key，点右上角设置。');

  // image 可以是单张 { mimeType, base64 }，也可以是多张数组（如 flat-lay 合成）
  const images = Array.isArray(image) ? image : image ? [image] : [];
  const parts = images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } }));
  parts.push({ text: prompt });

  const generationConfig = { responseModalities: ['TEXT', 'IMAGE'] };
  const imageConfig = {};
  if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
  // 2.5 只支持 1K；新模型（3.1+）显式要 2K 高清输出（值必须大写，小写会被静默忽略）
  if (!/2\.5-flash-image/.test(settings.model || '')) imageConfig.imageSize = '2K';
  if (Object.keys(imageConfig).length) generationConfig.imageConfig = imageConfig;

  const url = endpoint(
    settings,
    `/v1beta/models/${settings.model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`
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

    // 今日额度耗尽重试也没用，直接报错
    if (res.status === 429 && /per\s*day|PerDay|daily/i.test(data?.error?.message || '')) break;

    const waitSec = parseRetryDelaySeconds(data) ?? Math.min(60, 10 * 2 ** attempt);
    onWait?.(waitSec, attempt + 1);
    await sleep(waitSec * 1000);
  }

  if (!res.ok) {
    throw new Error(friendlyError(res.status, data?.error?.message));
  }

  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`请求被安全策略拦截（${blockReason}），换一下描述或图片试试。`);
  }

  const candidateParts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = candidateParts.find((p) => p.inlineData?.data || p.inline_data?.data);
  if (!imagePart) {
    const text = candidateParts.find((p) => p.text)?.text;
    throw new Error(text ? `模型没有返回图片：${text.slice(0, 160)}` : '模型没有返回图片，请重试。');
  }

  const inline = imagePart.inlineData || imagePart.inline_data;
  const mime = inline.mimeType || inline.mime_type || 'image/png';
  return `data:${mime};base64,${inline.data}`;
}
