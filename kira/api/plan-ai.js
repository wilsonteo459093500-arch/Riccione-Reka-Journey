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
const TEMPLATES = ['wardrobe', 'kitchen', 'tv', 'shoe', 'sideboard', 'desk', 'vanity', 'blank'];
const ROOM_TYPES = ['kitchen', 'master', 'bedroom', 'living', 'dining', 'entrance', 'study', 'utility', 'bathroom', 'balcony', 'other'];

const point = { type: 'array', items: { type: 'number' }, description: '[x, y] in image pixels' };
export const DOOR_TO = ['main', 'entry', 'bathroom', 'balcony', 'closet', 'other'];
const seg = (description) => ({ type: 'array', items: { type: 'number' }, description });
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
        required: ['type', 'name', 'box', 'doors', 'windows', 'bed'],
        properties: {
          type: { type: 'string', enum: ROOM_TYPES, description: 'living also covers a family hall / flexi area; utility = laundry, store room, utility room; balcony also covers yards, terraces, porches, the car porch and A/C ledges; other = stairs, corridors and anything else' },
          name: { type: 'string', description: 'Short unique English name, e.g. "Master Bedroom", "Bedroom 2", "Kitchen"' },
          box: { type: 'array', items: { type: 'number' }, description: '[x0, y0, x1, y1] inner bounds of the room in image pixels' },
          doors: {
            type: 'array',
            description: 'Door openings in this room\'s walls. Empty when none are visible.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['seg', 'to'],
              properties: {
                seg: seg('[x0, y0, x1, y1]: the opening along the wall, in image pixels'),
                to: { type: 'string', enum: DOOR_TO, description: 'main = the main entrance door of the house (from outside, the porch or the car porch); entry = the door you walk into this room through; bathroom = an en-suite / toilet door; balcony = a door out to a balcony, yard or terrace' },
              },
            },
          },
          windows: { type: 'array', items: seg('[x0, y0, x1, y1]: a window along the wall, in image pixels'), description: 'Windows in this room\'s walls. Empty when none.' },
          bed: seg('Bedrooms only: [x0, y0, x1, y1] where the bed goes, planned before the wardrobe. Empty array for other rooms.'),
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
            description: 'Each [x0, y0, x1, y1]: the stretch of the wall\'s inner face (the room side of the wall line) the cabinet stands against, in image pixels, horizontal or vertical, inside the room\'s box. One segment, except a kitchen (2 for an L or a galley, 3 for a U) and an L-shaped wardrobe (2), in order, sharing the corner point for an L / U.',
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
- wardrobe: in bedrooms. Plan each bedroom in this order:
  1. Mark the room's doors (entry, bathroom, balcony) and windows.
  2. Place the bed first: headboard against a solid wall (not across a door, preferably not under a window), master bedroom 1.8 x 2.0 m, other bedrooms 1.5 x 2.0 m (1.0 x 2.0 m if the room is small), with a 0.6 m walkway at the foot and on at least one side. Report it as the room's bed box.
  3. Then the wardrobe, on a wall the bed does not use: best on the wall with the entry door (beside the door, clear of its swing) or a short side wall. Never on the headboard wall, never touching the bed or its walkways, and keep 0.6 m clear in front of the wardrobe doors.
  4. Never along a window, and never within 0.8 m of a bathroom or balcony door.
  Lengths: master bedroom usually 2.4-3.0 m, other bedrooms 1.5-2.4 m. When no single free wall in the master bedroom takes 2.4 m, an L-shaped wardrobe (2 segments meeting at a corner) is fine.
- kitchen: base and top cabinets along the kitchen counter walls. One straight wall, an L (two walls meeting at a corner), a U (three walls) or a galley (two facing walls). Keep clear of doors; a window over the sink is fine.
- tv: the TV wall in the living room, usually the long solid wall facing the sofa area.
- shoe: a shoe / foyer cabinet beside the main entrance door, usually 1.0-1.5 m: on the same wall as the door, just past the door opening on the side away from the door swing. Never inside the area the door swings through, and never on the wall the door leaf opens against.
- sideboard: a dining-room sideboard, or a dry-kitchen counter outside the wet kitchen, 1.2-3.0 m on a solid wall.
- desk: a study desk in a study room, 1.2-2.4 m, preferably along a wall by the window.
- vanity: a dressing table, 0.8-1.4 m (only as an extra in a bedroom, never instead of its wardrobe).
- blank: a full-height storage cabinet for a utility / laundry / store room, 0.9-2.4 m.

Think room by room: every room gets its own set of cabinets, except bathrooms / toilets, balconies, yards, terraces, porches, the car porch, A/C ledges, stairs and corridors. The main cabinet per room: bedroom and master bedroom = wardrobe; kitchen = kitchen; living room and family hall = tv; dining = sideboard; foyer / entrance = shoe; study = desk; utility, laundry or store room = blank. A sheet may show several floors side by side (for example "GROUND FLOOR PLAN" and "FIRST FLOOR PLAN"); read every floor. When a wall or a room is hard to read, still give your best suggestion with confidence "low" instead of leaving it out. Skip only rooms that have no possible wall.
The shoe cabinet is required: whenever the plan shows the main entrance door, mark that door with to "main" and always suggest a shoe cabinet. When the plan has a foyer / entrance room, the shoe cabinet goes inside that foyer, against any of its walls (prefer one the door does not swing into); otherwise place it beside the main door (inside, on the same wall just past the door opening, clear of its swing), with confidence "low" if unsure.
Cabinets already drawn on the plan are listed below with their type. Do not suggest the same type again where one is already drawn, but still suggest every other type: for example a cabinet in the living room that is not a tv cabinet does not cover the TV wall.

Give positions as segments along the inner face of the wall (the side facing into the room, not the outside of the building) in the image's pixel coordinates (origin top-left, x to the right, y down). Segments are horizontal or vertical and lie inside the room; a cabinet never crosses a door opening. Rooms are boxes of their inner walls; for every room also list its door openings and windows (empty arrays when none), and for bedrooms the planned bed box (empty array for other rooms). Measure lengths from the plan's own scale or printed dimensions when you can. Do not give depths or heights: the company's templates set those. Notes are short plain English sentences.

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
      if (!r.ok) return { ok: false, status: 401, error: 'login_required' };
      let email = '';
      try { email = String((await r.json())?.email || ''); } catch { /* 只要知道登录了就好 */ }
      return { ok: true, mode: 'login', email };
    } catch {
      return { ok: false, status: 503, error: 'auth_unreachable' };
    }
  }
  if (!env.KIRA_AI_PASSCODE) return { ok: false, status: 503, error: 'not_configured' };
  return same(req.headers?.['x-kira-ai-passcode'], env.KIRA_AI_PASSCODE) ? { ok: true, mode: 'passcode' } : { ok: false, status: 401, error: 'passcode' };
}

// ---------------- 问 Claude ----------------
// 图上已有的柜子：[{ code, box:[x0,y0,x1,y1], template? }]（送去那张图的 px）—— 带种类，AI 只跳过同一种
export function cabinetFacts(cabinets) {
  const list = (Array.isArray(cabinets) ? cabinets : []).slice(0, 40)
    .filter((c) => Array.isArray(c?.box) && c.box.length === 4 && c.box.every((v) => Number.isFinite(Number(v))))
    .map((c) => {
      const type = /^[a-z]{2,12}$/.test(String(c.template || '')) ? ` (${c.template})` : '';
      return `${String(c.code || 'cabinet').replace(/[^\w -]/g, '').slice(0, 12)} at [${c.box.map((v) => Math.round(Number(v))).join(', ')}]${type}`;
    });
  return list.length ? `Cabinets already drawn on the plan (do not suggest the same type again there): ${list.join('; ')}.` : '';
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
