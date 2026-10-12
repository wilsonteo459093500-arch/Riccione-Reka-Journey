// AI 读平面图（Google Gemini，浏览器直连，key 只在本机、只放在 x-goog-api-key 请求头里：不进网址、不进日志、不进错误信息）。
//
// 两遍：
//   第一遍 findPlans（flash，快）：一整页图纸上找出每一张平面图（一楼 / 二楼 / 三楼…）的框，不管标题栏、立面图、手机 / 浏览器的外框；
//   第二遍 readFloor（pro，准）：每一层单独裁出来、用原本的分辨率送去读 —— 尺寸字先读（定比例），再读房间、楼梯、门窗。
// 拼起来（比例、去重叠、对齐楼层、楼梯）是 sheet.js 的纯函数。
// 测试：test/ai.test.mjs 用假的 fetch 和录好的回答，沙盒里从来不连 Gemini。

import { uid, ROOM_TYPES } from './model.js';
import { t } from '../../shared/i18n.js';
import { normalizeFound, readToMetres, tileRooms, snapOpenings, scaleFromDims, estimateScale, roomTypeOf as roomTypeOfSheet, okBox, boxPx } from './sheet.js';

export const roomTypeOf = roomTypeOfSheet;

// ───────────── 提示词（DESIGN §2.4 / §2.6，一字不改） ─────────────

export const FIND_PROMPT = `You are looking at ONE page of an architectural drawing set for a landed house in Malaysia, or a photo / phone screenshot of such a page.
The page may hold several drawings side by side: floor plans (GROUND FLOOR PLAN, FIRST FLOOR PLAN, SECOND FLOOR PLAN, ROOF PLAN),
elevations, sections, a site / key / location plan, notes, and a title block with stamps and signatures.
If this is a screenshot, ignore the phone status bar, the browser address bar, PDF-viewer toolbars and page counters.

Find EVERY floor plan drawing on the page. Return ONLY JSON:
{
  "page_box_2d": [ymin, xmin, ymax, xmax],          // the drawing sheet itself, excluding phone / browser / viewer chrome
  "is_photo_or_screenshot": true | false,
  "plans": [
    { "title": "the drawing title exactly as printed, e.g. GROUND FLOOR PLAN or PELAN LANTAI BAWAH",
      "level": "ground" | "mezzanine" | "first" | "second" | "third" | "roof" | "other",
      "box_2d": [ymin, xmin, ymax, xmax],           // the whole plan INCLUDING its dimension strings, EXCLUDING its title and other drawings
      "units": "mm" | "ft-in" | "m" | "unknown",
      "scale_text": "1:100" | null,
      "unit_label": "e.g. INTERMEDIATE LOT, END LOT, TYPE A" | null }
  ],
  "other_drawings": [ { "kind": "elevation" | "section" | "site_plan" | "key_plan" | "title_block" | "notes" | "other", "box_2d": [ymin, xmin, ymax, xmax] } ]
}
Rules:
- box_2d values are normalised 0-1000 over THIS image, in the order [ymin, xmin, ymax, xmax].
- A floor plan shows walls, doors and room names seen from above. Elevations and sections (the building seen from the side) are NOT floor plans.
- Malaysian naming: GROUND FLOOR = "ground" (TINGKAT BAWAH / LANTAI BAWAH / ARAS BAWAH); FIRST FLOOR = "first" (TINGKAT SATU / LANTAI ATAS / TINGKAT 1); SECOND FLOOR = "second".
- Plans are often printed in any order (FIRST FLOOR may be on the left). Report each with its own level.
- If the same floor is drawn for two house types, return both with their unit_label.
- If there is no floor plan on the page, return "plans": [].`;

const READ_TEMPLATE = `This image is ONE floor plan cropped from an architectural drawing: "{title}" ({level}) of a {houseKind} in Malaysia.
The same sheet also shows: {otherTitles}.
Return ONLY JSON matching the schema.
1. Coordinates: box_2d = [ymin, xmin, ymax, xmax] normalised 0-1000 over THIS image.
2. DIMENSIONS FIRST. For every dimension string you can read clearly (along the edges and inside the plan), give its text exactly as printed
   ("3600", "3,600", "12'-6\\"", "3.6m"), "axis": "x" if it measures left-right or "y" if it measures up-down, and box_2d of the dimension
   line from tick to tick. Give the outermost overall width / depth texts if printed. Skip any number you are not sure about.
3. footprint_box_2d: the outer face of the external walls of the enclosed house on this floor (exclude an open car porch, balcony, planter boxes).
4. rooms: one entry per space. Rectangles on wall CENTRE lines. Rooms tile the floor: neighbours share edges exactly and nothing overlaps.
   Split an L-shaped space into two rectangles with the same label. Unlabelled passages and landings are "corridor".
   The staircase is type "stair" (box = the whole stairwell incl. landings). VOID / OPEN TO BELOW / AIR WELL is type "void".
5. Type mapping: Master Bedroom / Bedroom 1 → master; Bedroom 2, 3, 4 → bedroom; Family / Family Hall / Family Area → family;
   Living / Hall → living; Dining → dining; Dry Kitchen / Wet Kitchen → kitchen; Bath / Toilet / WC / Powder → bath;
   Yard / Utility / Laundry / Service → utility; Car Porch / Porch / Driveway → porch; Balcony / Terrace → balcony;
   W.I.R. / Walk-in → walkin; Store / Stor → store; Study / Prayer Room → study; Foyer / Entrance → foyer; Kids → kids.
6. stairs: also return each staircase with "up": the direction you walk when starting UP the first flight
   ("N" = towards the top of the image, "S", "E" = right, "W" = left; null if you cannot tell) and "shape": "straight", "L" or "U".
7. doors: the opening in the wall (not the swing arc), kind "door" (hinged), "sliding" (sliding / folding / full-height glass) or
   "opening" (no door). windows: the window segment on the wall; full_height true for full-height glazing.
8. Ignore furniture, sanitary fittings, hatching, grid lines, north arrows and any text that is not a room name.`;

/** 第二遍的提示词：ctx = { title, level, houseKind, otherTitles } */
export function readPrompt(ctx = {}) {
  const others = Array.isArray(ctx.otherTitles) ? ctx.otherTitles.filter(Boolean).join(', ') : ctx.otherTitles;
  const v = {
    title: String(ctx.title || 'FLOOR PLAN').replace(/"/g, "'").slice(0, 80),
    level: ctx.level || 'other',
    houseKind: ctx.houseKind || 'house',
    otherTitles: others || 'nothing else',
  };
  return READ_TEMPLATE.replace(/\{(title|level|houseKind|otherTitles)\}/g, (m, k) => v[k]);
}

export const PAGES_PROMPT = `This image is a grid of numbered page thumbnails from one architectural drawing set. Which pages contain FLOOR PLANS (walls and rooms seen from above, e.g. GROUND / FIRST FLOOR PLAN)? Ignore covers, lists, site / location plans, elevations, sections, schedules, electrical and plumbing layouts. Return ONLY JSON: {"pages":[{"page": number, "levels": ["ground"|"first"|"second"|"roof"|"other"]}]}.`;

// ───────────── responseSchema（OpenAPI 子集；propertyOrdering 让模型按顺序答：尺寸先） ─────────────

const BOX = { type: 'ARRAY', items: { type: 'INTEGER' }, minItems: 4, maxItems: 4 };
const LEVEL_ENUM = ['ground', 'mezzanine', 'first', 'second', 'third', 'roof', 'other'];

export const FIND_SCHEMA = {
  type: 'OBJECT',
  properties: {
    page_box_2d: BOX,
    is_photo_or_screenshot: { type: 'BOOLEAN' },
    plans: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          level: { type: 'STRING', enum: LEVEL_ENUM },
          box_2d: BOX,
          units: { type: 'STRING', enum: ['mm', 'ft-in', 'm', 'unknown'] },
          scale_text: { type: 'STRING', nullable: true },
          unit_label: { type: 'STRING', nullable: true },
        },
        required: ['title', 'level', 'box_2d'],
        propertyOrdering: ['title', 'level', 'box_2d', 'units', 'scale_text', 'unit_label'],
      },
    },
    other_drawings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { kind: { type: 'STRING', enum: ['elevation', 'section', 'site_plan', 'key_plan', 'title_block', 'notes', 'other'] }, box_2d: BOX },
        required: ['kind', 'box_2d'],
        propertyOrdering: ['kind', 'box_2d'],
      },
    },
  },
  required: ['page_box_2d', 'is_photo_or_screenshot', 'plans'],
  propertyOrdering: ['page_box_2d', 'is_photo_or_screenshot', 'plans', 'other_drawings'],
};

export const READ_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    overall_width_text: { type: 'STRING', nullable: true },
    overall_depth_text: { type: 'STRING', nullable: true },
    dimensions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { text: { type: 'STRING' }, axis: { type: 'STRING', enum: ['x', 'y'] }, box_2d: BOX },
        required: ['text', 'axis', 'box_2d'],
        propertyOrdering: ['text', 'axis', 'box_2d'],
      },
    },
    footprint_box_2d: BOX,
    rooms: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { label: { type: 'STRING' }, type: { type: 'STRING', enum: Object.keys(ROOM_TYPES) }, box_2d: BOX },
        required: ['label', 'type', 'box_2d'],
        propertyOrdering: ['label', 'type', 'box_2d'],
      },
    },
    stairs: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { box_2d: BOX, up: { type: 'STRING', enum: ['N', 'E', 'S', 'W'], nullable: true }, shape: { type: 'STRING', enum: ['straight', 'L', 'U'] } },
        required: ['box_2d'],
        propertyOrdering: ['box_2d', 'up', 'shape'],
      },
    },
    doors: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { box_2d: BOX, kind: { type: 'STRING', enum: ['door', 'sliding', 'opening'] } },
        required: ['box_2d', 'kind'],
        propertyOrdering: ['box_2d', 'kind'],
      },
    },
    windows: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { box_2d: BOX, full_height: { type: 'BOOLEAN' } },
        required: ['box_2d'],
        propertyOrdering: ['box_2d', 'full_height'],
      },
    },
  },
  required: ['dimensions', 'footprint_box_2d', 'rooms', 'stairs', 'doors', 'windows'],
  propertyOrdering: ['title', 'overall_width_text', 'overall_depth_text', 'dimensions', 'footprint_box_2d', 'rooms', 'stairs', 'doors', 'windows'],
};

export const PAGES_SCHEMA = {
  type: 'OBJECT',
  properties: {
    pages: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          page: { type: 'INTEGER' },
          kind: { type: 'STRING', enum: ['floor_plans', 'other'] },
          levels: { type: 'ARRAY', items: { type: 'STRING', enum: ['ground', 'first', 'second', 'roof', 'other'] } },
        },
        required: ['page'],
        propertyOrdering: ['page', 'kind', 'levels'],
      },
    },
  },
  required: ['pages'],
  propertyOrdering: ['pages'],
};

// ───────────── 选模型 ─────────────

/** 列不出模型时用的（顺序已经是 pro 档） */
export const FALLBACK_MODELS = ['gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-pro-latest', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-flash-latest'];
const DROP = /lite|tts|image|embed|live|audio|native|nano|robotics|computer-use|learnlm|aqa/i;

function parseModel(name) {
  const n = String(name || '').replace(/^models\//, '').trim();
  if (!/^gemini-/i.test(n) || DROP.test(n)) return null;
  const latest = /^gemini-(pro|flash)-latest$/i.exec(n);
  if (latest) return { name: n, cls: latest[1].toLowerCase(), ver: -1, latest: true, stable: true };
  const m = /^gemini-(\d+(?:\.\d+)?)-(pro|flash)\b/i.exec(n);
  if (!m) return null;
  const rest = n.slice(m[0].length);
  return { name: n, cls: m[2].toLowerCase(), ver: Number(m[1]), latest: false, stable: !/preview|exp/i.test(rest), plain: rest === '' };
}

/**
 * 纯函数：模型名单 → 试的顺序。只留 gemini-*（有 generateContent 的，名单是对象时）；去掉 lite / tts / image / embedding…；
 * pro 档：pro 新版本优先（同一版本正式版在 preview 前面，*-pro-latest 紧跟最好的那个 pro），然后 flash；flash 档：flash 在前。指定的模型排第一。
 */
export function rankModels(list, tier = 'pro', named = '') {
  const names = (list || [])
    .filter((m) => typeof m === 'string' || !m?.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => (typeof m === 'string' ? m : m.name));
  const parsed = [];
  const seen = new Set();
  for (const n of names) {
    const p = parseModel(n);
    if (p && !seen.has(p.name)) {
      seen.add(p.name);
      parsed.push(p);
    }
  }
  const order = (cls) => {
    const xs = parsed.filter((p) => p.cls === cls && !p.latest);
    xs.sort((a, b) => b.ver - a.ver || Number(b.stable) - Number(a.stable) || Number(!!b.plain) - Number(!!a.plain) || a.name.localeCompare(b.name));
    const lat = parsed.filter((p) => p.cls === cls && p.latest);
    return [...xs.slice(0, 1), ...lat, ...xs.slice(1)].map((p) => p.name);
  };
  const pro = order('pro');
  const flash = order('flash');
  const out = tier === 'flash' ? [...flash, ...pro] : [...pro, ...flash];
  const n = String(named || '').replace(/^models\//, '').trim();
  return n && n !== 'auto' ? [n, ...out.filter((x) => x !== n)] : out;
}
export const isFlash = (name) => /flash/i.test(String(name || ''));

const baseOf = (settings) => String(settings?.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
function checkBase(base) {
  if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) throw aiError('base', t('接口地址要以 https:// 开头。'));
}
/** key 的指纹（不是 key）：换了 key 就不用旧的模型名单 */
function keyPrint(key) {
  let h = 2166136261;
  for (let i = 0; i < String(key || '').length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
}
const MODELS_KEY = 'genie.models.v1';
const MODELS_TTL = 6 * 3600 * 1000;
function ss() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

/** GET /v1beta/models（key 在请求头里），sessionStorage 缓存 6 小时。失败 → null（用 FALLBACK_MODELS） */
export async function listModels(settings, { signal, fetchImpl } = {}) {
  const base = baseOf(settings);
  const kp = keyPrint(settings?.apiKey);
  const store = ss();
  try {
    const c = JSON.parse(store?.getItem(MODELS_KEY) || 'null');
    if (c && c.base === base && c.kp === kp && Date.now() - c.at < MODELS_TTL && Array.isArray(c.names) && c.names.length) return c.names;
  } catch {
    /* 坏的缓存 */
  }
  const f = fetchImpl || globalThis.fetch;
  try {
    checkBase(base);
    const names = [];
    let token = '';
    for (let page = 0; page < 4; page++) {
      const res = await f(`${base}/v1beta/models?pageSize=200${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`, { method: 'GET', headers: { 'x-goog-api-key': settings.apiKey }, signal });
      if (!res.ok) return null;
      const data = await res.json();
      for (const m of data?.models || []) if (!m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent')) names.push(String(m.name || '').replace(/^models\//, ''));
      token = data?.nextPageToken || '';
      if (!token) break;
    }
    if (!names.length) return null;
    try {
      store?.setItem(MODELS_KEY, JSON.stringify({ base, kp, at: Date.now(), names }));
    } catch {
      /* 存不了就算了 */
    }
    return names;
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    return null;
  }
}

/** 这一档要试的模型（顺序） */
export async function modelsFor(settings, tier, opts = {}) {
  const named = settings?.visionModel && settings.visionModel !== 'auto' ? settings.visionModel : '';
  const listed = await listModels(settings, opts);
  const ranked = rankModels(listed && listed.length ? listed : FALLBACK_MODELS, tier, named);
  return ranked.length ? ranked : rankModels(FALLBACK_MODELS, tier, named);
}

// ───────────── 调用 ─────────────

function aiError(code, message, extra = {}) {
  const e = new Error(message);
  e.code = code;
  Object.assign(e, extra);
  return e;
}

/** 服务器的话里万一带了 key：抹掉（错误信息会显示在界面上） */
function scrub(msg, key) {
  let s = String(msg || '').slice(0, 300);
  if (key && key.length > 6) s = s.split(key).join('•••');
  return s.replace(/AIza[0-9A-Za-z_-]{20,}/g, '•••');
}

// 这个会话里，某个模型不认 mediaResolution / responseSchema：记下来，下次直接不送
const FLAGS = new Map();
export function _resetModelFlags() {
  FLAGS.clear();
}

const NOT_FOUND = /not found|not supported|unknown model|not available|is not found|does not exist|unsupported model/i;
const TIMEOUT = { pro: 180000, flash: 60000 };
const wait = (ms, signal) =>
  new Promise((ok, no) => {
    const tm = setTimeout(ok, ms);
    signal?.addEventListener?.('abort', () => {
      clearTimeout(tm);
      no(aiError('cancel', t('已取消')));
    });
  });

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* 落到下面 */
      }
    }
    throw aiError('bad-json', t('AI 的回复不是有效的 JSON，请重试。'));
  }
}

/**
 * 叫一次 Gemini（按顺序试模型）。
 * opts = { tier: 'pro' | 'flash', parts: [{ inline_data }…, { text }], schema, signal, timeoutMs, fetchImpl, sleep }
 * → { json, text, model, downgraded, tried }
 * 404 / 「模型不存在」→ 下一个模型；429 → 下一个（pro 用完 → flash，downgraded: true）；400 说 mediaResolution / responseSchema 不认 → 去掉那一项再试一次；
 * 401 / 403 / key 无效 → 停（key 的问题）；5xx → 2 秒后重试一次，再不行下一个；超时（pro 180 s / flash 60 s）→ 停，code 'timeout'。
 */
export async function callGemini(settings, opts = {}) {
  const { tier = 'pro', parts = [], schema = null, signal, fetchImpl, sleep = wait } = opts;
  if (!settings?.apiKey) throw aiError('key', t('还没有设置 Gemini API key（右上角 ⚙️）。'));
  const base = baseOf(settings);
  checkBase(base);
  const f = fetchImpl || globalThis.fetch;
  const models = opts.models || (await modelsFor(settings, tier, { signal, fetchImpl }));
  const tried = [];
  let quota = false;
  let lastErr = null;
  for (const model of models) {
    const flags = { ...(FLAGS.get(model) || {}) };
    let retried5xx = false;
    let retriedField = 0;
    for (;;) {
      tried.push(model);
      const generationConfig = { responseMimeType: 'application/json', temperature: 0 };
      if (schema && !flags.noSchema) generationConfig.responseSchema = schema;
      if (!flags.noMedia) generationConfig.mediaResolution = 'MEDIA_RESOLUTION_HIGH';
      const body = { contents: [{ role: 'user', parts }], generationConfig };
      const ctl = new AbortController();
      let timedOut = false;
      const ms = opts.timeoutMs || (isFlash(model) ? TIMEOUT.flash : TIMEOUT.pro);
      const tm = setTimeout(() => {
        timedOut = true;
        ctl.abort();
      }, ms);
      const onAbort = () => ctl.abort();
      if (signal) {
        if (signal.aborted) {
          clearTimeout(tm);
          throw aiError('cancel', t('已取消'));
        }
        signal.addEventListener('abort', onAbort);
      }
      let res;
      let data = null;
      try {
        res = await f(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
          body: JSON.stringify(body),
          signal: ctl.signal,
        });
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      } catch (e) {
        clearTimeout(tm);
        signal?.removeEventListener?.('abort', onAbort);
        if (signal?.aborted) throw aiError('cancel', t('已取消'));
        if (timedOut) throw aiError('timeout', t('AI 读太久了（超过 {0} 秒），请重试；或者换一张更清楚的图。', [Math.round(ms / 1000)]), { model });
        throw aiError('network', t('连不上 AI 服务：请检查网络再试。'), { model });
      }
      clearTimeout(tm);
      signal?.removeEventListener?.('abort', onAbort);
      if (res.ok) {
        const cand = data?.candidates?.[0];
        const text = (cand?.content?.parts || [])
          .filter((p) => !p.thought)
          .map((p) => p.text || '')
          .join('');
        if (!text) {
          lastErr = aiError('empty', t('AI 没有回复内容，换一张更清楚的平面图再试。'), { model });
          break; // 下一个模型
        }
        let json;
        try {
          json = parseJSON(text);
        } catch (e) {
          lastErr = e;
          break;
        }
        const downgraded = tier === 'pro' && isFlash(model) && !isFlash(models[0]);
        return { json, text, model, downgraded, quota: downgraded && quota, tried };
      }
      const status = res.status;
      const msg = scrub(data?.error?.message || '', settings.apiKey);
      if (status === 401 || status === 403 || (status === 400 && /api[\s_-]?key|API_KEY_INVALID|permission/i.test(msg))) {
        throw aiError('key', t('API key 无效或没有权限，请到设置里检查。'), { status });
      }
      if (status === 400 && /media_?resolution/i.test(msg) && !flags.noMedia && retriedField < 2) {
        flags.noMedia = true;
        FLAGS.set(model, { ...(FLAGS.get(model) || {}), noMedia: true });
        retriedField++;
        continue;
      }
      if (status === 400 && /response_?schema|schema/i.test(msg) && !flags.noSchema && retriedField < 2) {
        flags.noSchema = true;
        FLAGS.set(model, { ...(FLAGS.get(model) || {}), noSchema: true });
        retriedField++;
        continue;
      }
      if (status === 404 || (status === 400 && NOT_FOUND.test(msg))) {
        lastErr = aiError('model', t('识别模型不可用，到设置 → 高级 换一个模型（例如 gemini-2.5-flash）。'), { status });
        break;
      }
      if (status === 429) {
        quota = true;
        lastErr = aiError('quota', t('AI 额度或频率到上限了，稍后再试。'), { status });
        break;
      }
      if (status >= 500) {
        if (!retried5xx) {
          retried5xx = true;
          await sleep(2000, signal);
          continue;
        }
        lastErr = aiError('server', t('AI 服务暂时不稳定，稍后重试。'), { status });
        break;
      }
      throw aiError('http', msg ? t('AI 请求失败：{0}', [msg]) : t('AI 请求失败（HTTP {0}）', [status]), { status });
    }
  }
  throw lastErr || aiError('model', t('没有可用的识别模型。'));
}

/** dataURL → Gemini 的图片 part */
export function imagePart(src) {
  const [meta, b64] = String(src || '').split(',');
  const mime = /data:([^;]+)/.exec(meta)?.[1] || 'image/jpeg';
  return { inline_data: { mime_type: mime, data: b64 || '' } };
}

// ───────────── 第一遍 / 第二遍 / 找页 ─────────────

/** 第一遍：一页上的每一张平面图。image = { src, width, height }（2048 px 的整页） */
export async function findPlans(settings, image, opts = {}) {
  const r = await callGemini(settings, { ...opts, tier: 'flash', schema: FIND_SCHEMA, parts: [imagePart(image.src), { text: FIND_PROMPT }] });
  return { raw: r.json, found: normalizeFound(r.json, image.width, image.height), model: r.model, downgraded: r.downgraded };
}

/** 第二遍：读一层（裁好的图）。ctx = { title, level, houseKind, otherTitles } */
export async function readFloor(settings, image, ctx = {}, opts = {}) {
  const r = await callGemini(settings, { ...opts, tier: 'pro', schema: READ_SCHEMA, parts: [imagePart(image.src), { text: readPrompt(ctx) }] });
  const read = r.json || {};
  if (!Array.isArray(read.rooms) || !read.rooms.some((x) => okBox(x?.box_2d))) throw aiError('empty', t('AI 在这一层没有找到房间：换一张更清楚的图，或者自己描。'), { model: r.model });
  return { read, model: r.model, downgraded: r.downgraded, quota: r.quota };
}

/**
 * 读几层，同时最多 2 个（免费的 pro 每分钟次数很少）。items = [{ key, image, ctx }]
 * → [{ key, ok, read?, error?, model?, downgraded? }]，顺序和 items 一样；onProgress(key, 'start' | 'done' | 'error', info)
 */
export async function readFloors(settings, items, { concurrency = 2, onProgress, ...opts } = {}) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      const it = items[i];
      onProgress?.(it.key, 'start');
      try {
        const r = await readFloor(settings, it.image, it.ctx, opts);
        out[i] = { key: it.key, ok: true, ...r };
        onProgress?.(it.key, 'done', r);
      } catch (e) {
        if (e?.code === 'cancel' || e?.code === 'key') throw e;
        out[i] = { key: it.key, ok: false, error: e };
        onProgress?.(it.key, 'error', e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

/** 扫描的 PDF（没有文字层）：把所有页的小图拼成一张编号的网格，问 flash 哪几页是平面图 → [{ page, levels }] */
export async function findPlanPagesAI(settings, contact, { pages = 999, ...opts } = {}) {
  const r = await callGemini(settings, { ...opts, tier: 'flash', schema: PAGES_SCHEMA, parts: [imagePart(contact.src), { text: PAGES_PROMPT }] });
  const list = Array.isArray(r.json?.pages) ? r.json.pages : [];
  const seen = new Set();
  return list
    .map((p) => ({ page: Math.round(Number(p?.page)), kind: p?.kind || 'floor_plans', levels: Array.isArray(p?.levels) ? p.levels.filter((l) => typeof l === 'string') : [] }))
    .filter((p) => p.page >= 1 && p.page <= pages && p.kind !== 'other' && !seen.has(p.page) && seen.add(p.page))
    .map(({ page, levels }) => ({ page, levels }));
}

function imageSize(src) {
  return new Promise((ok, no) => {
    if (typeof Image === 'undefined') return no(new Error('no Image'));
    const im = new Image();
    im.onload = () => ok({ width: im.naturalWidth, height: im.naturalHeight });
    im.onerror = () => no(aiError('image', t('底图读不出来，请重新上传平面图。')));
    im.src = src;
  });
}

/**
 * 编辑器「重新识别这一层」：用这一层的底图（读图时裁好的那张）再读一遍。
 * 比例沿用底图现在的（设计师可能校准过，这样楼层之间还是对齐的）。
 * → { floor: { rooms, openings }, info }（米，和底图同一个坐标）
 */
export async function rereadFloor(settings, underlay, ctx = {}, opts = {}) {
  if (!underlay?.src) throw aiError('image', t('这一层还没有底图：先上传平面图。'));
  let iw = underlay.iw;
  let ih = underlay.ih;
  if (!(iw > 0 && ih > 0)) ({ width: iw, height: ih } = await imageSize(underlay.src));
  const level = { ground: 'ground', first: 'first', second: 'second', third: 'third' }[ctx.level] || ctx.level || 'other';
  const { read, model, downgraded } = await readFloor(settings, { src: underlay.src, width: iw, height: ih }, { title: ctx.title || '', level, houseKind: ctx.houseKind || 'house', otherTitles: ctx.otherTitles || '' }, { signal: ctx.signal || opts.signal, fetchImpl: opts.fetchImpl, sleep: opts.sleep, models: opts.models });
  const k = underlay.w > 0 ? underlay.w / iw : (scaleFromDims(read.dimensions, iw, ih) || estimateScale(read, iw, ih) || { mPerPx: 0.01 }).mPerPx;
  const dims = scaleFromDims(read.dimensions, iw, ih);
  const prefix = ctx.floorId ? `${ctx.floorId}-` : '';
  const m = readToMetres(read, iw, ih, k, (p) => `${prefix}${uid(p)}`);
  const tiled = tileRooms(m.rooms, { footprint: m.footprint });
  const so = snapOpenings(tiled.rooms, m.openings);
  const dx = Number(underlay.x) || 0;
  const dy = Number(underlay.y) || 0;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const rooms = tiled.rooms.map(({ label, gap, ...r }) => ({ ...r, id: r.id.startsWith(prefix) && prefix ? r.id : `${prefix}${uid('r')}`, x: r3(r.x + dx), y: r3(r.y + dy) }));
  const openings = so.openings.map((o) => ({ ...o, x1: r3(o.x1 + dx), x2: r3(o.x2 + dx), y1: r3(o.y1 + dy), y2: r3(o.y2 + dy) }));
  return {
    floor: { rooms, openings },
    info: { scaleSource: underlay.w > 0 ? 'underlay' : 'estimate', dimsRatio: dims ? +(dims.mPerPx / k).toFixed(3) : null, rooms: rooms.length, openings: openings.length, fixes: { ...tiled.report, openingsDropped: so.dropped }, model, downgraded },
  };
}

// ───────────── 旧接口（单层、整张图）：保留给旧的调用和测试 ─────────────

export const DETECT_PROMPT = `You are reading an architectural FLOOR PLAN image of one residential unit (Malaysian / Asian plans; dimension strings usually in mm; labels may be English, Chinese or Malay).
Return ONLY JSON with exactly this shape:
{
  "overall_width_mm": number | null,
  "overall_depth_mm": number | null,
  "footprint": [ymin, xmin, ymax, xmax],
  "rooms": [ { "label": string, "type": "${Object.keys(ROOM_TYPES).join('|')}", "box": [ymin, xmin, ymax, xmax] } ],
  "doors": [ { "box": [ymin, xmin, ymax, xmax] } ],
  "windows": [ { "box": [ymin, xmin, ymax, xmax], "full_height": boolean } ]
}
Rules:
- All boxes are axis-aligned and normalized to 0-1000 over the whole image (y first, like object detection).
- "footprint" = outer boundary of the unit's walls. overall_width_mm / overall_depth_mm = total outside dimensions read from the dimension strings along the plan edges (null if not printed).
- Room boxes follow wall centre lines, tile the footprint and must not overlap. Split an L-shaped room into two rectangles of the same type.
- Living and dining usually share one open space: return two adjacent rectangles (living, dining).
- Mapping: Master / Bedroom 1 → master; other bedrooms → bedroom; WC / toilet / bath → bath; yard / service / laundry / drying → utility; WIR / walk-in → walkin; car porch / porch / front yard → porch; balcony / terrace → balcony; store → store; entrance / lobby → foyer; dry / wet kitchen → kitchen; staircase → stair.
- Door box = the opening gap in the wall (not the swing arc). Window box = the window segment on an external wall. full_height = true for sliding / balcony doors.
- Ignore furniture, text blocks, title blocks, north arrows and dimension lines.`;

/**
 * 旧的一步识别（单层、整张图）：{ plan (v1 一层), underlay, info }。比例：填的宽 → 图上的总尺寸 → 按门宽估 → 按形状猜（不再悄悄用 12 m）。
 */
export async function detectPlan(settings, image, hint = {}, opts = {}) {
  const r = await callGemini(settings, { ...opts, tier: 'pro', parts: [imagePart(image.src), { text: DETECT_PROMPT }] });
  return convertDetection(r.json, image, hint);
}

/** 纯函数：旧格式的回答 → plan（v1 一层，米）+ 底图摆放。房间铺好不重叠，门窗只放在墙上。 */
export function convertDetection(j, image, hint = {}) {
  const W = image.width;
  const H = image.height;
  const rawRooms = (j?.rooms || []).filter((r) => okBox(r?.box));
  const fp = okBox(j?.footprint) ? j.footprint.map(Number) : null;
  const all = rawRooms.map((r) => r.box.map(Number));
  const foot = fp || (all.length ? [Math.min(...all.map((b) => b[0])), Math.min(...all.map((b) => b[1])), Math.max(...all.map((b) => b[2])), Math.max(...all.map((b) => b[3]))] : [0, 0, 1000, 1000]);
  const fb = boxPx(foot, W, H);
  const fpW = fb.x1 - fb.x0;
  const fpH = fb.y1 - fb.y0;
  const read = {
    footprint_box_2d: foot,
    rooms: rawRooms.map((r) => ({ label: r.label || '', type: roomTypeOf(r.type, r.label), box_2d: r.box })),
    doors: (j?.doors || []).filter((d) => okBox(d?.box)).map((d) => ({ box_2d: d.box, kind: d.kind || 'door' })),
    windows: (j?.windows || []).filter((w) => okBox(w?.box)).map((w) => ({ box_2d: w.box, full_height: !!w.full_height })),
  };
  let widthM = null;
  let source = null;
  if (hint.widthM > 0) [widthM, source] = [hint.widthM, 'known'];
  else if (j?.overall_width_mm > 0) [widthM, source] = [j.overall_width_mm / 1000, 'dims'];
  else if (j?.overall_depth_mm > 0 && fpH > 0) [widthM, source] = [(j.overall_depth_mm / 1000) * (fpW / fpH), 'dims'];
  if (!(widthM >= 3 && widthM <= 60)) {
    const est = estimateScale(read, W, H);
    widthM = est ? est.mPerPx * fpW : 11;
    source = est ? est.source : 'guess';
  }
  const mpp = widthM / Math.max(1, fpW);
  const m = readToMetres(read, W, H, mpp, uid);
  const ox = fb.x0 * mpp;
  const oy = fb.y0 * mpp;
  const shift = (r) => ({ ...r, x: r.x - ox, y: r.y - oy });
  const tiled = tileRooms(m.rooms.map(shift), { footprint: m.footprint ? shift(m.footprint) : null });
  const rooms = tiled.rooms.map(({ label, gap, ...r }) => ({ ...r, name: r.name || ROOM_TYPES[r.type]?.zh || '' }));
  const so = snapOpenings(rooms, m.openings.map((o) => ({ ...o, x1: o.x1 - ox, x2: o.x2 - ox, y1: o.y1 - oy, y2: o.y2 - oy })));
  const out = { v: 1, name: '平面图', wallH: 2.8, north: 0, rooms, openings: so.openings };
  const underlay = { src: image.src, x: -ox, y: -oy, w: W * mpp, h: H * mpp, opacity: 0.55, iw: W, ih: H };
  return { plan: out, underlay, info: { rooms: rooms.length, openings: so.openings.length, widthM: +widthM.toFixed(2), fromDims: source === 'dims', scaleSource: source, fixes: tiled.report } };
}
