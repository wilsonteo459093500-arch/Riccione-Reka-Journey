// AI 识别平面图（Google Gemini，浏览器直连，key 只在本机）。
// 让模型用它最擅长的「0–1000 归一化框」回答房间 / 门 / 窗，再用图上的总尺寸换算成米。
// AI 只负责 80%，剩下的由设计师在编辑器里拖一拖校正 —— 人机各做各擅长的。

import { snapPlan, uid, ROOM_TYPES } from './model.js';

const TYPES = Object.keys(ROOM_TYPES).join('|');

export const DETECT_PROMPT = `You are reading an architectural FLOOR PLAN image of one residential unit (Malaysian / Asian plans; dimension strings usually in mm; labels may be English, Chinese or Malay).
Return ONLY JSON with exactly this shape:
{
  "overall_width_mm": number | null,
  "overall_depth_mm": number | null,
  "footprint": [ymin, xmin, ymax, xmax],
  "rooms": [ { "label": string, "type": "${TYPES}", "box": [ymin, xmin, ymax, xmax] } ],
  "doors": [ { "box": [ymin, xmin, ymax, xmax] } ],
  "windows": [ { "box": [ymin, xmin, ymax, xmax], "full_height": boolean } ]
}
Rules:
- All boxes are axis-aligned and normalized to 0-1000 over the whole image (y first, like object detection).
- "footprint" = outer boundary of the unit's walls. overall_width_mm / overall_depth_mm = total outside dimensions read from the dimension strings along the plan edges (null if not printed).
- Room boxes follow wall centre lines, tile the footprint and must not overlap. Split an L-shaped room into two rectangles of the same type.
- Living and dining usually share one open space: return two adjacent rectangles (living, dining).
- Mapping: Master / Bedroom 1 → master; other bedrooms → bedroom; WC / toilet / bath → bath; yard / service / laundry / drying → utility; WIR / walk-in → walkin; car porch / porch / front yard → porch; balcony / terrace → balcony; store → store; entrance / lobby → foyer; dry / wet kitchen → kitchen.
- Door box = the opening gap in the wall (not the swing arc). Window box = the window segment on an external wall. full_height = true for sliding / balcony doors.
- Ignore furniture, text blocks, title blocks, north arrows and dimension lines.`;

/** 模型给的房间类型 → ROOM_TYPES；没给 / 给错的按名字猜（车廊、晒衣处这些马来西亚常见叫法） */
export function roomTypeOf(type, label = '') {
  const l = String(label || '').toLowerCase();
  if (/porch|anjung|car\s*park|front\s*yard|车廊|前院/.test(l)) return 'porch';
  if (/yard|service|laundry|drying|dobi|晒衣|工作阳台/.test(l)) return 'utility';
  if (ROOM_TYPES[type]) return type;
  return 'bedroom';
}

function friendly(status, msg) {
  if (status === 400 && /api key/i.test(msg || '')) return 'API key 无效，请到设置里检查。';
  if (status === 401 || status === 403) return 'API key 无权限或已失效，请到设置里检查。';
  if (status === 429) return `AI 额度或频率到上限了，稍后再试。${msg ? `（${String(msg).slice(0, 120)}）` : ''}`;
  if (status === 404) return '识别模型不可用，到设置 → 高级 换一个模型（例如 gemini-2.5-flash）。';
  if (status >= 500) return 'AI 服务暂时不稳定，稍后重试。';
  return msg || `请求失败（HTTP ${status}）`;
}

async function callGemini(settings, model, prompt, dataUrl) {
  const base = String(settings.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  if (!/^https:\/\//.test(base) && !/^http:\/\/localhost/.test(base)) throw new Error('接口地址要以 https:// 开头。');
  const [meta, b64] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(meta)?.[1] || 'image/jpeg';
  const res = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const e = new Error(friendly(res.status, data?.error?.message));
    e.notFound = res.status === 404;
    throw e;
  }
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new Error('AI 没有回复内容，换一张更清楚的平面图再试。');
  return text;
}

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('AI 的回复不是有效的 JSON，请重试。');
  }
}

/**
 * @param {object} settings { apiKey, baseUrl, visionModel }
 * @param {{src,width,height}} image
 * @param {{ widthM?: number }} hint 用户填的整体宽度（米），图上读不到尺寸时用
 * @returns {Promise<{ plan, underlay, info }>}
 */
export async function detectPlan(settings, image, hint = {}) {
  if (!settings?.apiKey) throw new Error('还没有设置 Gemini API key（右上角 ⚙️）。');
  const models = [...new Set([settings.visionModel, 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-pro'].filter(Boolean))];
  let raw = null;
  let lastErr = null;
  for (const m of models) {
    try {
      raw = await callGemini(settings, m, DETECT_PROMPT, image.src);
      break;
    } catch (e) {
      lastErr = e;
      if (!e.notFound) throw e;
    }
  }
  if (!raw) throw lastErr || new Error('没有可用的识别模型。');
  return convertDetection(parseJSON(raw), image, hint);
}

/** 纯函数：模型回答 → plan（米）+ 底图摆放。Node 可测。 */
export function convertDetection(j, image, hint = {}) {
  const W = image.width;
  const H = image.height;
  const fp = Array.isArray(j.footprint) && j.footprint.length === 4 ? j.footprint : null;
  const allBoxes = (j.rooms || []).map((r) => r.box).filter((b) => Array.isArray(b) && b.length === 4);
  const foot = fp || [Math.min(...allBoxes.map((b) => b[0])), Math.min(...allBoxes.map((b) => b[1])), Math.max(...allBoxes.map((b) => b[2])), Math.max(...allBoxes.map((b) => b[3]))];
  const fpWpx = ((foot[3] - foot[1]) / 1000) * W;
  const fpHpx = ((foot[2] - foot[0]) / 1000) * H;
  let widthM = hint.widthM || (j.overall_width_mm ? j.overall_width_mm / 1000 : null);
  if (!widthM && j.overall_depth_mm) widthM = (j.overall_depth_mm / 1000) * (fpWpx / fpHpx);
  if (!widthM || !isFinite(widthM) || widthM < 3 || widthM > 60) widthM = 12;
  const mpp = widthM / fpWpx; // 米 / 像素
  const toM = (b) => {
    const [y0, x0, y1, x1] = b;
    return {
      x: (((x0 - foot[1]) / 1000) * W) * mpp,
      y: (((y0 - foot[0]) / 1000) * H) * mpp,
      w: (((x1 - x0) / 1000) * W) * mpp,
      d: (((y1 - y0) / 1000) * H) * mpp,
    };
  };
  const rooms = (j.rooms || [])
    .filter((r) => Array.isArray(r.box) && r.box.length === 4)
    .map((r) => {
      const t = roomTypeOf(r.type, r.label);
      const m = toM(r.box);
      return { id: uid('r'), type: t, name: (r.label || ROOM_TYPES[t].zh).slice(0, 16), x: m.x, y: m.y, w: Math.max(0.8, m.w), d: Math.max(0.8, m.d) };
    })
    .filter((r) => r.w * r.d > 0.6);
  const openings = [];
  const addOpening = (b, kind) => {
    const m = toM(b);
    if (m.w >= m.d) openings.push({ id: uid('o'), kind, x1: m.x, x2: m.x + m.w, y1: m.y + m.d / 2, y2: m.y + m.d / 2 });
    else openings.push({ id: uid('o'), kind, x1: m.x + m.w / 2, x2: m.x + m.w / 2, y1: m.y, y2: m.y + m.d });
  };
  for (const d of j.doors || []) if (Array.isArray(d.box) && d.box.length === 4) addOpening(d.box, 'door');
  for (const w of j.windows || []) if (Array.isArray(w.box) && w.box.length === 4) addOpening(w.box, w.full_height ? 'slider' : 'window');
  const plan = snapPlan({ v: 1, name: '平面图', wallH: 2.8, north: 0, rooms, openings }, 0.25);
  const underlay = {
    src: image.src,
    x: -((foot[1] / 1000) * W) * mpp,
    y: -((foot[0] / 1000) * H) * mpp,
    w: W * mpp,
    h: H * mpp,
    opacity: 0.55,
  };
  return { plan, underlay, info: { rooms: plan.rooms.length, openings: plan.openings.length, widthM: +widthM.toFixed(2), fromDims: !!j.overall_width_mm } };
}
