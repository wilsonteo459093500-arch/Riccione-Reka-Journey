// Gemini 图像模型客户端 —— 浏览器直连 generativelanguage.googleapis.com，
// API key 只存在本机 localStorage，不经过任何中间服务器。

import { SETTINGS_KEY, DEFAULT_SETTINGS } from '../constants.js';

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

function endpoint(settings, path) {
  const base = (settings.baseUrl || DEFAULT_SETTINGS.baseUrl).replace(/\/+$/, '');
  return `${base}${path}`;
}

function friendlyError(status, message) {
  if (status === 400 && /api key/i.test(message || '')) return 'API key 无效，请到设置里检查。';
  if (status === 401 || status === 403) return 'API key 无权限或已失效，请到设置里检查。';
  if (status === 429) return '请求太频繁（限流），等几十秒再试，或减少同时生成的张数。';
  if (status >= 500) return 'AI 服务暂时不稳定，稍后重试即可。';
  return message || `请求失败（HTTP ${status}）`;
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
 * 生成一张图。
 * @param {object} settings  { apiKey, model, baseUrl }
 * @param {string} prompt    完整英文 prompt
 * @param {object|null} image  { mimeType, base64 }
 * @param {string|null} aspectRatio 仅文字模式使用，如 '16:9'
 * @returns {Promise<string>} 图片 dataURL
 */
export async function generateImage(settings, prompt, image, aspectRatio) {
  if (!settings.apiKey) throw new Error('还没有配置 API key，点右上角设置。');

  const parts = [];
  if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
  parts.push({ text: prompt });

  const generationConfig = { responseModalities: ['TEXT', 'IMAGE'] };
  if (!image && aspectRatio) {
    generationConfig.imageConfig = { aspectRatio };
  }

  const url = endpoint(
    settings,
    `/v1beta/models/${settings.model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`
  );

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig }),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
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
