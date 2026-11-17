// 户型图「AI 识图」：浏览器这边只负责缩图、带上身份、调 /api/plan-ai（钥匙在服务器）
//   正式版：带 Supabase 登录 token；预览 / 本机模式：带团队密码（这次浏览器开着时记住）
import { supabase, cloudConfigured } from './supabase.js';
import { getPlanBlob } from './planImages.js';
import { darkGrid, trimBorders } from '../planner/wallSnap.js';

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

// 自动去边：缩成小张看四周是不是一整片黑 / 白 → 原图 px 的 { x, y, w, h }
function autoCrop(img) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const k = Math.min(1, 500 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = Math.round(0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2]);
  const [x0, y0, x1, y1] = trimBorders(gray, w, h);
  // 留一点边（0.5%），换回原图 px
  const pad = Math.round(Math.max(W, H) * 0.005);
  const X0 = Math.max(0, Math.floor(x0 / k) - pad), Y0 = Math.max(0, Math.floor(y0 / k) - pad);
  const X1 = Math.min(W, Math.ceil((x1 + 1) / k) + pad), Y1 = Math.min(H, Math.ceil((y1 + 1) / k) + pad);
  return { x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 };
}

// 把原图的 crop 那一块缩到长边 ≤ AI_MAX_SIDE → JPEG + 深色格（贴墙用，同一张图）
async function shrink(blob, area) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new PlanAiError('no_image')); i.src = url; });
    const W = img.naturalWidth, H = img.naturalHeight;
    let crop = area && area.w > 10 && area.h > 10
      ? { x: Math.max(0, Math.round(area.x)), y: Math.max(0, Math.round(area.y)), w: Math.round(Math.min(area.w, W - area.x)), h: Math.round(Math.min(area.h, H - area.y)) }
      : autoCrop(img);
    if (!(crop.w > 10 && crop.h > 10)) crop = { x: 0, y: 0, w: W, h: H };
    const k = Math.min(1, AI_MAX_SIDE / Math.max(crop.w, crop.h));
    const w = Math.max(1, Math.round(crop.w * k)), h = Math.max(1, Math.round(crop.h * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
    const data = c.toDataURL('image/jpeg', 0.85).split(',')[1];
    const dark = darkGrid(g.getImageData(0, 0, w, h).data, w, h);
    return { data, w, h, crop, dark };
  } finally { URL.revokeObjectURL(url); }
}

// area：只读这一块（原图 px { x, y, w, h }），不给 = 整张（自动去黑边 / 白边）
// cabinets：图上已经有的柜子 [{ code, box:[x0,y0,x1,y1] 原图 px }]（告诉 AI 不要重复建议）
// → { result, sentW, sentH, crop, dark, usage, model }；出错丢 PlanAiError（code 见上）
export async function readPlanWithAi(plan, { mmPerPx = 0, ceilingH = 0, passcode = '', area = null, cabinets = [] } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new PlanAiError('offline');
  const blob = await getPlanBlob(plan?.image?.path);
  if (!blob) throw new PlanAiError('no_image');
  const { data, w, h, crop, dark } = await shrink(blob, area);
  // 送去的图是原图的一块、又缩小了：比例跟着换
  const s = w / crop.w; // 原图 px → 送去 px
  const sentMmPerPx = mmPerPx > 0 ? mmPerPx / s : 0;
  const toSent = (b) => [(b[0] - crop.x) * s, (b[1] - crop.y) * s, (b[2] - crop.x) * s, (b[3] - crop.y) * s].map((v) => Math.round(v));
  const sentCabs = (cabinets || []).map((c) => ({ code: String(c.code || ''), box: toSent(c.box), template: String(c.template || '') }))
    .filter((c) => c.box[2] > 0 && c.box[3] > 0 && c.box[0] < w && c.box[1] < h).slice(0, 40);
  const headers = await authHeaders(passcode);
  let res;
  try {
    res = await fetch('/api/plan-ai', { method: 'POST', headers, body: JSON.stringify({ image: data, w, h, mmPerPx: sentMmPerPx, ceilingH, cabinets: sentCabs, crop }) });
  } catch { throw new PlanAiError('offline'); }
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new PlanAiError(res.status === 404 || res.ok ? 'unavailable' : 'server', res.status); // 本机开发 / 没有部署 api
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new PlanAiError(body?.error || 'server', res.status);
  // image：送去 AI 的那张 JPEG（base64）只放在内存，👎 反馈时一起送（看得到 AI 当时看的图）；readId 把同一次识图的反馈串起来
  return { result: body.result, sentW: w, sentH: h, crop, dark, usage: body.usage || null, model: body.model || '', image: data, readId: newReadId() };
}

const newReadId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// 正式版：Supabase 登录 token；预览 / 本机模式：团队密码
async function authHeaders(passcode) {
  const headers = { 'Content-Type': 'application/json' };
  if (cloudConfigured && supabase) {
    const { data: s } = await supabase.auth.getSession();
    const token = s?.session?.access_token;
    if (!token) throw new PlanAiError('login_required');
    headers.Authorization = `Bearer ${token}`;
  } else if (passcode) headers['x-kira-ai-passcode'] = passcode;
  return headers;
}

// ---------------- 👎 反馈（/api/plan-feedback）----------------
// payload：{ kind:'bad'|'missing'|'added', readId, reasons, note, template?, suggestion?, ai?, picks?, image? }
// → { ok:true } ；没设定（503 not_configured）/ 没网 / 没部署 api → 丢 PlanAiError（前端改成复制到剪贴板）
export async function sendPlanFeedback(payload, { passcode = '' } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new PlanAiError('offline');
  const headers = await authHeaders(passcode);
  let res;
  try {
    res = await fetch('/api/plan-feedback', { method: 'POST', headers, body: JSON.stringify(payload) });
  } catch { throw new PlanAiError('offline'); }
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new PlanAiError('unavailable', res.status);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new PlanAiError(body?.error || 'server', res.status);
  return body;
}

// 反馈要带的 AI 资料（不带深色格 dark、不带图；图另外只送一次）+ 户型图大小 / 比例（以后可以重跑 buildSuggestions）
export const feedbackAi = (r, plan = null) => (r ? {
  result: r.result, sentW: r.sentW, sentH: r.sentH, crop: r.crop, model: r.model,
  plan: plan ? { w: plan.image?.w || 0, h: plan.image?.h || 0, scale: plan.scale || null } : null,
} : null);
// 一个建议 → 反馈要存的样子（柜子本身太大，只留关键的）
export const feedbackSuggestion = (x) => (x ? {
  id: x.id, template: x.template, room: x.room, roomName: x.roomName, ok: !!x.ok, pick: x.pick !== false,
  lenMm: x.lenMm || null, reason: x.reason || null, why: x.why || [], notes: x.notes || [], note: x.note || '',
  place: x.cab?.place || null, group: x.group || null, part: x.part || null,
} : null);
