// ============================================================
// KIRA 户型图「AI 识图」—— Vercel Node function（POST /api/plan-ai）
// 钥匙（ANTHROPIC_API_KEY）只在服务器；浏览器送缩图上来，这里问 Claude，回传结构化的读图结果。
//
// 谁能用：
//   · 正式版（设了 VITE_SUPABASE_URL）：要登录 —— Authorization: Bearer <Supabase access token>，向 Supabase 验证
//   · 预览版（没有 Supabase）：要团队密码 —— x-kira-ai-passcode = KIRA_AI_PASSCODE
//   · 两样都没设定 / 没有 ANTHROPIC_API_KEY → 503
// 回传 { result, model, usage }；result 的坐标 = 送上来那张图的像素（src/planner/planAi.js 换算成柜子）
// ============================================================
import Anthropic from '@anthropic-ai/sdk';
import { timingSafeEqual } from 'node:crypto';

export const MODEL = 'claude-opus-5-5';
const MAX_BODY_CHARS = 6_000_000; // base64 图 ≈ 4.5 MB
const TEMPLATES = ['wardrobe', 'kitchen', 'tv', 'shoe'];
const ROOM_TYPES = ['kitchen', 'master', 'bedroom', 'living', 'dining', 'entrance', 'bathroom', 'other'];

const point = { type: 'array', items: { type: 'number' }, description: '[x, y] in image pixels' };
export const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scale', 'rooms', 'suggestions', 'notes'],
  properties: {
    scale: {
      type: 'object',
      additionalProperties: false,
      required: ['found', 'a', 'b', 'mm'],
      description: 'A printed dimension on the plan: the two ends of the dimension line and its value in millimetres. found=false when no readable dimension.',
      properties: { found: { type: 'boolean' }, a: point, b: point, mm: { type: 'number' } },
    },
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'name', 'box'],
        properties: {
          type: { type: 'string', enum: ROOM_TYPES },
          name: { type: 'string', description: 'Short unique English name, e.g. "Master Bedroom", "Bedroom 2", "Kitchen"' },
          box: { type: 'array', items: { type: 'number' }, description: '[x0, y0, x1, y1] inner bounds of the room in image pixels' },
        },
      },
    },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['template', 'room', 'segments', 'confidence', 'note'],
        properties: {
          template: { type: 'string', enum: TEMPLATES },
          confidence: { type: 'string', enum: ['high', 'low'], description: 'low when the wall, the room or the scale is hard to read' },
          room: { type: 'string', description: 'The name of one of the rooms above' },
          segments: {
            type: 'array',
            items: { type: 'array', items: { type: 'number' } },
            description: 'Each [x0, y0, x1, y1]: the stretch of the wall\'s inner face (the room side of the wall line) the cabinet stands against, in image pixels, horizontal or vertical, inside the room\'s box. One segment, except a kitchen: 2 for an L or a galley, 3 for a U, in order, sharing corner points for L / U.',
          },
          note: { type: 'string', description: 'One short plain sentence: why here (English, no quotes or JSON)' },
        },
      },
    },
    notes: { type: 'string', description: 'Anything the salesperson should check (English, short)' },
  },
};

export const SYSTEM_PROMPT = `You read residential floor plans (Malaysian condos, apartments and landed houses) for a custom-cabinet company and suggest where its standard cabinets go, so a salesperson can quote quickly.

Cabinet types you may suggest:
- wardrobe: in bedrooms, against a solid wall with no door or window, not blocking the room door swing. Master bedroom usually 2.4-3.0 m, other bedrooms 1.5-2.4 m.
- kitchen: base and top cabinets along the kitchen counter walls. One straight wall, an L (two walls meeting at a corner), a U (three walls) or a galley (two facing walls). Keep clear of doors; a window over the sink is fine.
- tv: the TV wall in the living room, usually the long solid wall facing the sofa area.
- shoe: a shoe / foyer cabinet beside the main entrance door, usually 1.0-1.5 m.

Cover the whole plan: one wardrobe in every bedroom and the master bedroom, the kitchen, the living room TV wall and a shoe cabinet at the main entrance. A sheet may show several floors side by side (for example "GROUND FLOOR PLAN" and "FIRST FLOOR PLAN"); read every floor. When a wall or a room is hard to read, still give your best suggestion with confidence "low" instead of leaving it out. Skip only rooms that have no possible wall, and rooms that already have a cabinet listed below.

Give positions as segments along the inner face of the wall (the side facing into the room, not the outside of the building) in the image's pixel coordinates (origin top-left, x to the right, y down). Segments are horizontal or vertical and lie inside the room; a cabinet never crosses a door opening. Rooms are boxes of their inner walls. Measure lengths from the plan's own scale or printed dimensions when you can. Do not give depths or heights: the company's templates set those. Notes are short plain English sentences.

If the plan prints a dimension (for example "3000", "3.0m" or "10'0\\"") along a dimension line, report one clear one as the scale (the two ends of the line and the value in millimetres). If none is readable, set scale.found to false.`;

// ---------------- 鉴权 ----------------
const same = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

export async function checkAccess(req, env, fetchImpl = fetch) {
  const url = env.VITE_SUPABASE_URL, anon = env.VITE_SUPABASE_ANON_KEY;
  if (url && anon) {
    const auth = String(req.headers?.authorization || '');
    if (!auth.startsWith('Bearer ')) return { ok: false, status: 401, error: 'login_required' };
    try {
      const r = await fetchImpl(`${url.replace(/\/$/, '')}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
      return r.ok ? { ok: true, mode: 'login' } : { ok: false, status: 401, error: 'login_required' };
    } catch {
      return { ok: false, status: 503, error: 'auth_unreachable' };
    }
  }
  if (!env.KIRA_AI_PASSCODE) return { ok: false, status: 503, error: 'not_configured' };
  return same(req.headers?.['x-kira-ai-passcode'], env.KIRA_AI_PASSCODE) ? { ok: true, mode: 'passcode' } : { ok: false, status: 401, error: 'passcode' };
}

// ---------------- 问 Claude ----------------
// 图上已有的柜子：[{ code, box:[x0,y0,x1,y1] }]（送去那张图的 px）
export function cabinetFacts(cabinets) {
  const list = (Array.isArray(cabinets) ? cabinets : []).slice(0, 40)
    .filter((c) => Array.isArray(c?.box) && c.box.length === 4 && c.box.every((v) => Number.isFinite(Number(v))))
    .map((c) => `${String(c.code || 'cabinet').replace(/[^\w -]/g, '').slice(0, 12)} at [${c.box.map((v) => Math.round(Number(v))).join(', ')}]`);
  return list.length ? `Cabinets already drawn on the plan (do not suggest these again): ${list.join('; ')}.` : '';
}

export async function readPlan(client, { image, w, h, mmPerPx, ceilingH, cabinets }) {
  const facts = [
    `The image is ${w} x ${h} pixels.`,
    mmPerPx > 0 ? `The salesperson already set the scale: 1 pixel = ${Number(mmPerPx).toFixed(2)} mm in this image.` : 'The scale is not set yet.',
    ceilingH > 0 ? `Ceiling height ${ceilingH} mm.` : '',
    cabinetFacts(cabinets),
  ].filter(Boolean).join(' ');
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: RESULT_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: `${facts}\nRead this floor plan and suggest the cabinets.` },
      ],
    }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') return { status: 422, body: { error: 'refused', detail: msg.stop_details?.explanation || null } };
  if (msg.stop_reason === 'max_tokens') return { status: 502, body: { error: 'too_long' } };
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let result;
  try { result = JSON.parse(text); } catch { return { status: 502, body: { error: 'bad_output' } }; }
  return { status: 200, body: { result, model: msg.model, usage: { input: msg.usage?.input_tokens || 0, output: msg.usage?.output_tokens || 0 } } };
}

// ---------------- handler ----------------
export function createHandler({ env = process.env, makeClient = () => new Anthropic({ timeout: 55_000, maxRetries: 1 }), fetchImpl = fetch } = {}) {
  return async function handler(req, res) {
    const send = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
    if (req.method !== 'POST') return send(405, { error: 'method' });
    if (!env.ANTHROPIC_API_KEY) return send(503, { error: 'not_configured' });
    const access = await checkAccess(req, env, fetchImpl);
    if (!access.ok) return send(access.status, { error: access.error });
    let body = req.body;
    if (typeof body === 'string') { if (body.length > MAX_BODY_CHARS) return send(413, { error: 'too_big' }); try { body = JSON.parse(body); } catch { return send(400, { error: 'bad_json' }); } }
    const image = typeof body?.image === 'string' ? body.image : '';
    const w = Math.round(Number(body?.w)), h = Math.round(Number(body?.h));
    if (!image || image.length > MAX_BODY_CHARS || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) return send(400, { error: 'bad_image' });
    if (!(w > 0 && h > 0 && w <= 4000 && h <= 4000)) return send(400, { error: 'bad_size' });
    try {
      const r = await readPlan(makeClient(), { image, w, h, mmPerPx: Number(body?.mmPerPx) || 0, ceilingH: Number(body?.ceilingH) || 0, cabinets: body?.cabinets });
      return send(r.status, r.body);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) return send(503, { error: 'key_invalid' });
      if (e instanceof Anthropic.RateLimitError) return send(429, { error: 'busy' });
      if (e instanceof Anthropic.APIConnectionTimeoutError) return send(504, { error: 'timeout' });
      if (e instanceof Anthropic.APIError) return send(502, { error: 'ai_error', status: e.status || null });
      return send(500, { error: 'server' });
    }
  };
}

export default createHandler();
