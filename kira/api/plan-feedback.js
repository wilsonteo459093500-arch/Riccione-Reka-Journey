// ============================================================
// KIRA「AI 识图」反馈 —— Vercel Node function（POST /api/plan-feedback）
// 业务在建议旁边按 👎 选原因 / 报「漏了柜子」/ 按「加入报价」时，存一笔反馈给以后调规则用。
//
// 谁能用：同 /api/plan-ai（正式版要登录、预览版要团队密码）—— checkAccess。
// 存哪里：Supabase（服务器端 service key，只在 Vercel，不进浏览器）
//   · 表 public.kira_ai_feedback（kira/supabase/kira_ai_feedback.sql）
//   · 送去 AI 的那张图：私有 bucket kira-ai-feedback/<read_id>.jpg（同一次识图只传一次，前端控制）
// 环境变量：KIRA_FEEDBACK_SUPABASE_URL、KIRA_FEEDBACK_SERVICE_KEY（Production + Preview）；没设 → 503 not_configured
// ============================================================
import { checkAccess } from './plan-ai.js';

export const FEEDBACK_KINDS = ['bad', 'missing', 'added'];
export const FEEDBACK_REASONS = ['bed', 'wall', 'length', 'doorWindow', 'room', 'type', 'other'];
const MAX_BODY_CHARS = 4_000_000;
const MAX_JSON_CHARS = 300_000;
const MAX_IMAGE_CHARS = 3_000_000; // base64 JPEG（长边 ≤ 1568 一般 200–600 KB）
const READ_ID = /^[a-z0-9-]{6,40}$/;

const jsonSize = (v) => { try { return JSON.stringify(v ?? null).length; } catch { return Infinity; } };

// 前端送来的东西 → 要存的那一行；不合格 → { error }
export function cleanFeedback(body) {
  const kind = String(body?.kind || '');
  if (!FEEDBACK_KINDS.includes(kind)) return { error: 'bad_kind' };
  const readId = String(body?.readId || '');
  if (!READ_ID.test(readId)) return { error: 'bad_read_id' };
  const reasons = [...new Set((Array.isArray(body?.reasons) ? body.reasons : []).map(String).filter((r) => FEEDBACK_REASONS.includes(r)))];
  const note = String(body?.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (kind === 'bad' && !reasons.length && !note) return { error: 'empty' };
  if (kind === 'missing' && !note && !body?.template) return { error: 'empty' };
  const template = body?.template == null ? null : String(body.template).slice(0, 20);
  const suggestion = body?.suggestion ?? null;
  const ai = body?.ai ?? null;
  const picks = body?.picks ?? null;
  if (jsonSize(suggestion) > MAX_JSON_CHARS || jsonSize(ai) > MAX_JSON_CHARS || jsonSize(picks) > MAX_JSON_CHARS) return { error: 'too_big' };
  const image = typeof body?.image === 'string' && body.image ? body.image : null;
  if (image && (image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200)))) return { error: 'bad_image' };
  return { row: { read_id: readId, kind, reasons, note, template, suggestion, ai, picks }, image };
}

export function createHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function handler(req, res) {
    const send = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
    if (req.method !== 'POST') return send(405, { error: 'method' });
    const url = String(env.KIRA_FEEDBACK_SUPABASE_URL || '').replace(/\/$/, ''), key = env.KIRA_FEEDBACK_SERVICE_KEY;
    if (!/^https:\/\//.test(url) || !key) return send(503, { error: 'not_configured' });
    const access = await checkAccess(req, env, fetchImpl);
    if (!access.ok) return send(access.status, { error: access.error });
    let body = req.body;
    if (typeof body === 'string') { if (body.length > MAX_BODY_CHARS) return send(413, { error: 'too_big' }); try { body = JSON.parse(body); } catch { return send(400, { error: 'bad_json' }); } }
    const c = cleanFeedback(body);
    if (c.error) return send(400, { error: c.error });
    const who = access.mode === 'login' ? (access.email || 'login') : 'preview';
    const auth = { apikey: key, Authorization: `Bearer ${key}` };
    try {
      let imagePath = null;
      if (c.image) {
        imagePath = `${c.row.read_id}.jpg`;
        const up = await fetchImpl(`${url}/storage/v1/object/kira-ai-feedback/${imagePath}`, {
          method: 'POST', headers: { ...auth, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: Buffer.from(c.image, 'base64'),
        });
        if (!up.ok) imagePath = null; // 图传不上也照样存文字反馈
      }
      const r = await fetchImpl(`${url}/rest/v1/kira_ai_feedback`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ ...c.row, who, image_path: imagePath }),
      });
      if (!r.ok) return send(502, { error: 'store_failed', status: r.status });
      return send(200, { ok: true, image: !!imagePath });
    } catch {
      return send(502, { error: 'store_failed' });
    }
  };
}

export default createHandler();
