/* ============================================================
   人脉 App · 呼叫 Claude 的共用部分
   ------------------------------------------------------------
   • key 只在服务器（ANTHROPIC_API_KEY），前端永远拿不到
   • Sonnet 5.5 的请求开了服务器端 fallback（"default"）：
     安全分类器误拒时由 API 自动换模型重跑，不用我们自己写重试
   • 结构化输出用 output_config.format（json_schema），回来的第一段文字就是 JSON
   • 体检第 3 阶段：每个功能一个「期限」（Vercel 60 秒就砍函数）。
     SDK 自己不重试、每次呼叫只给剩下的时间；时间不够就直接回「AI 想太久了」，
     不会再出现等 55 秒 × 3 次、被服务器砍掉变成看不懂的 504
   ============================================================ */
import Anthropic from '@anthropic-ai/sdk';
import { HttpError } from './http.js';

let shared = null;
export function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, { error: 'ai_not_configured', message: '服务器还没设 ANTHROPIC_API_KEY' });
  }
  if (!shared) shared = new Anthropic({ maxRetries: 0, timeout: 50_000 });
  return shared;
}

/* ---------- 期限 ---------- */

/** 每个功能最多花多久（毫秒）。Vercel 函数 60 秒上限，留 6–8 秒给登入检查、记账、回传 */
export const DEADLINES = {
  scan_card: 25_000,   // 名片：Haiku 平常 3–6 秒；25 秒还没好就是卡住了
  talk: 52_000,        // 对话整理：长逐字稿要久一点
  assess: 52_000,      // 深度分析（Sonnet）
  company: 52_000,     // 公司背景（Sonnet + 网页搜索，可能分好几段）
};

/** 超时给使用者看的话（每个功能不一样，告诉他下一步怎么办） */
export const TIMEOUT_HINT = {
  scan_card: '名片这次没读到，可以再按一次，或先手动填名字和电话',
  talk: '内容可能太长了，试试分成两三段，一段一段整理',
  assess: '这次没有结果，也没有写进档案；再按一次通常就好',
  company: '公司背景这次没查完；再按一次通常就好',
};

/**
 * 建一个期限。left() = 还剩几毫秒
 * @param {number} ms
 * @param {string} feature  DEADLINES 的 key（超时讯息用）
 */
export function makeDeadline(ms, feature = '', now = Date.now) {
  const end = now() + ms;
  return { feature, ms, left: () => end - now() };
}

export function timeoutError(deadline, usage = null) {
  const sec = Math.round(((deadline && deadline.ms) || 50_000) / 1000);
  const hint = TIMEOUT_HINT[deadline && deadline.feature] || '请再试一次';
  const e = new HttpError(504, { error: 'ai_timeout', message: `AI 想太久了（超过 ${sec} 秒）。${hint}` });
  if (usage) e.usage = usage;
  return e;
}

const SAFETY_MS = 1_500;   // 留给我们自己收尾
const MIN_CALL_MS = 4_000; // 剩不到这么多就不开新的一次呼叫

function retryable(e) {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return false; // 超时就是超时，再试也一样慢
  if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError) return true;
  if (e instanceof Anthropic.APIConnectionError) return true;
  return !!(e && (e.status === 529 || e.status === 503));
}

/**
 * 在期限内呼叫一次 AI：call(requestOptions) → message
 * • 每次只给剩下的时间（timeout），SDK 不自己重试
 * • 忙线 / 连线断掉 → 时间还够就再试一次
 * • 超时 → 504 ai_timeout（讯息照功能写）
 */
export async function callWithin(deadline, call) {
  if (!deadline) return call(undefined);
  for (let attempt = 0; ; attempt++) {
    const left = deadline.left() - SAFETY_MS;
    if (left < MIN_CALL_MS) throw timeoutError(deadline);
    try {
      return await call({ timeout: left, maxRetries: 0 });
    } catch (e) {
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw timeoutError(deadline);
      if (attempt === 0 && retryable(e) && deadline.left() - SAFETY_MS > MIN_CALL_MS * 2) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      throw mapAiError(e);
    }
  }
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

/**
 * 模型拒答 / 截断 → 给前端看得懂的错误。
 * usage：这次已经花掉的钱（错误也要记账）；truncatedMsg：截断时给的话（对话整理要叫人分段，不是「再试一次」）
 */
export function checkStop(message, usage = null, truncatedMsg = '') {
  let e = null;
  if (message.stop_reason === 'refusal') {
    e = new HttpError(422, { error: 'ai_refused', message: 'AI 没有回答这一则（被安全规则挡下），可以手动填写' });
  } else if (message.stop_reason === 'max_tokens') {
    e = new HttpError(502, { error: 'ai_truncated', message: truncatedMsg || 'AI 回答太长被截断，请再试一次' });
  }
  if (e) {
    if (usage) e.usage = usage;
    throw e;
  }
}

/** AI 回的格式坏了：502，附上已经花掉的钱 */
export function badOutput(usage = null, message = 'AI 回的格式不对，请再试一次') {
  const e = new HttpError(502, { error: 'ai_bad_output', message });
  if (usage) e.usage = usage;
  return e;
}

/** 把 API 错误翻成前端看得懂的状态码 */
export function mapAiError(e) {
  if (e instanceof HttpError) return e;
  if (e instanceof Anthropic.RateLimitError) return new HttpError(429, { error: 'ai_busy', message: 'AI 太忙，等一下再试' });
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new HttpError(504, { error: 'ai_timeout', message: 'AI 想太久了，请再试一次' });
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
