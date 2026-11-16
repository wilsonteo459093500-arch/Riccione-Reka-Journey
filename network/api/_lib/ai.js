/* ============================================================
   人脉 App · 呼叫 Claude 的共用部分
   ------------------------------------------------------------
   • key 只在服务器（ANTHROPIC_API_KEY），前端永远拿不到
   • Sonnet 5.5 的请求开了服务器端 fallback（"default"）：
     安全分类器误拒时由 API 自动换模型重跑，不用我们自己写重试
   • 结构化输出用 output_config.format（json_schema），回来的第一段文字就是 JSON
   ============================================================ */
import Anthropic from '@anthropic-ai/sdk';
import { HttpError } from './http.js';

let shared = null;
export function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, { error: 'ai_not_configured', message: '服务器还没设 ANTHROPIC_API_KEY' });
  }
  if (!shared) shared = new Anthropic({ maxRetries: 2, timeout: 55_000 });
  return shared;
}

export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** 回应里所有 text 拼起来 */
export function textOf(message) {
  return (message.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * 从文字里挖出 JSON 物件：整段就是 JSON / ```json 区块 / 第一个 { 到最后一个 }。
 * 挖不到回 null。
 */
export function extractJson(text) {
  if (!text) return null;
  const tries = [text.trim()];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) tries.push(fence[1].trim());
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a >= 0 && b > a) tries.push(text.slice(a, b + 1));
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === 'object') return v;
    } catch { /* 试下一种 */ }
  }
  return null;
}

/** 模型拒答 / 截断 → 给前端看得懂的错误 */
export function checkStop(message) {
  if (message.stop_reason === 'refusal') {
    throw new HttpError(422, { error: 'ai_refused', message: 'AI 没有回答这一则（被安全规则挡下），可以手动填写' });
  }
  if (message.stop_reason === 'max_tokens') {
    throw new HttpError(502, { error: 'ai_truncated', message: 'AI 回答太长被截断，请再试一次' });
  }
}

/** 把 API 错误翻成前端看得懂的状态码 */
export function mapAiError(e) {
  if (e instanceof HttpError) return e;
  if (e instanceof Anthropic.RateLimitError) return new HttpError(429, { error: 'ai_busy', message: 'AI 太忙，等一下再试' });
  if (e instanceof Anthropic.AuthenticationError) return new HttpError(503, { error: 'ai_key_invalid', message: 'ANTHROPIC_API_KEY 不对' });
  if (e instanceof Anthropic.BadRequestError) return new HttpError(400, { error: 'ai_bad_request', message: String(e.message).slice(0, 300) });
  if (e instanceof Anthropic.APIConnectionError) return new HttpError(504, { error: 'ai_unreachable', message: '连不上 AI，请再试一次' });
  if (e instanceof Anthropic.APIError) return new HttpError(502, { error: 'ai_error', message: String(e.message).slice(0, 300) });
  return e;
}

/** 前端送来的图片：只收 jpeg/png/webp，base64，单张 ≤ 3.5MB */
export function cleanImages(images, max = 2) {
  if (!Array.isArray(images) || !images.length) throw new HttpError(400, { error: 'no_image' });
  return images.slice(0, max).map((img) => {
    const media_type = String((img && img.media_type) || '');
    let data = String((img && img.data) || '');
    if (data.startsWith('data:')) data = data.slice(data.indexOf(',') + 1);
    if (!/^image\/(jpeg|png|webp)$/.test(media_type)) throw new HttpError(400, { error: 'bad_image_type' });
    if (!data || data.length > 3.5 * 1024 * 1024 * 1.37 || !/^[A-Za-z0-9+/=\s]+$/.test(data.slice(0, 200))) {
      throw new HttpError(400, { error: 'bad_image' });
    }
    return { type: 'image', source: { type: 'base64', media_type, data: data.replace(/\s+/g, '') } };
  });
}
