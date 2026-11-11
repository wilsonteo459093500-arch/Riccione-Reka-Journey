// 户型图「AI 识图」：浏览器这边只负责缩图、带上身份、调 /api/plan-ai（钥匙在服务器）
//   正式版：带 Supabase 登录 token；预览 / 本机模式：带团队密码（这次浏览器开着时记住）
import { supabase, cloudConfigured } from './supabase.js';
import { getPlanBlob } from './planImages.js';

export const AI_MAX_SIDE = 1568; // Claude 看图的建议长边（更大只会被缩小，白花钱）
const PASS_KEY = 'kira.aiPasscode';
export const needsPasscode = () => !cloudConfigured;
export const savedPasscode = () => { try { return sessionStorage.getItem(PASS_KEY) || ''; } catch { return ''; } };
export const savePasscode = (v) => { try { if (v) sessionStorage.setItem(PASS_KEY, v); else sessionStorage.removeItem(PASS_KEY); } catch { /* ignore */ } };

// 错误代码 → 业务看得懂的话
export const AI_ERRORS = {
  not_configured: { en: 'AI is not set up yet (the server has no key)', zh: 'AI 还没设定（服务器没有钥匙）' },
  key_invalid: { en: 'The AI key on the server is not valid', zh: '服务器上的 AI 钥匙不对' },
  login_required: { en: 'Please sign in again', zh: '请重新登录' },
  passcode: { en: 'Wrong team passcode', zh: '团队密码不对' },
  refused: { en: 'The AI declined to read this image', zh: 'AI 不肯看这张图' },
  too_long: { en: 'The AI answer was cut off — try again', zh: 'AI 的回答太长被截断了，再试一次' },
  bad_output: { en: 'The AI answer could not be read — try again', zh: 'AI 的回答读不懂，再试一次' },
  busy: { en: 'AI is busy — try again in a minute', zh: 'AI 现在很忙，一分钟后再试' },
  timeout: { en: 'The AI took too long — try again', zh: 'AI 太久没回，再试一次' },
  unavailable: { en: 'AI only works on the online version', zh: 'AI 只在网上版本可以用' },
  offline: { en: 'No internet connection', zh: '没有网络' },
  no_image: { en: 'The floor plan image is not available on this device', zh: '这台设备上找不到这张户型图' },
};
export class PlanAiError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
export const aiErrorText = (e) => { const t = AI_ERRORS[e?.code]; return t ? `${t.zh} — ${t.en}` : `AI 出错了 AI error${e?.status ? ` (${e.status})` : ''}`; };

async function shrink(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new PlanAiError('no_image')); i.src = url; });
    const k = Math.min(1, AI_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    const data = c.toDataURL('image/jpeg', 0.85).split(',')[1];
    return { data, w, h };
  } finally { URL.revokeObjectURL(url); }
}

// → { result, sentW, sentH, usage, model }；出错丢 PlanAiError（code 见上）
export async function readPlanWithAi(plan, { mmPerPx = 0, ceilingH = 0, passcode = '' } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new PlanAiError('offline');
  const blob = await getPlanBlob(plan?.image?.path);
  if (!blob) throw new PlanAiError('no_image');
  const { data, w, h } = await shrink(blob);
  // 送去的图比原图小：比例跟着换
  const sentMmPerPx = mmPerPx > 0 ? mmPerPx * ((plan.image.w || w) / w) : 0;
  const headers = { 'Content-Type': 'application/json' };
  if (cloudConfigured && supabase) {
    const { data: s } = await supabase.auth.getSession();
    const token = s?.session?.access_token;
    if (!token) throw new PlanAiError('login_required');
    headers.Authorization = `Bearer ${token}`;
  } else if (passcode) headers['x-kira-ai-passcode'] = passcode;
  let res;
  try {
    res = await fetch('/api/plan-ai', { method: 'POST', headers, body: JSON.stringify({ image: data, w, h, mmPerPx: sentMmPerPx, ceilingH }) });
  } catch { throw new PlanAiError('offline'); }
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new PlanAiError(res.status === 404 || res.ok ? 'unavailable' : 'server', res.status); // 本机开发 / 没有部署 api
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new PlanAiError(body?.error || 'server', res.status);
  return { result: body.result, sentW: w, sentH: h, usage: body.usage || null, model: body.model || '' };
}
