// 「AI 润色」—— 看效果图，把导入时机械生成的标题（「视角二」、原稿备注）改写成定稿那种简短的视角名、
// 大写英文小标题和双语备注。只给建议（[{ slideId, before, patch }]），由设计师在 PolishDialog 里勾选后套用。
// 纯函数（分组 / JSON 解析 / 校验 / 生成补丁）全部导出，便于 Node 测试；网络请求只在 polishProject 里。

import { analyzeImage } from './gemini.js';
import { toInlineImage } from '../store/assets.js';
import { findFloor, findMaterial } from '../engine/model.js';
import { buildPolishPrompt } from './prompts.js';

export const MAX_PER_GROUP = 6; // 每次请求最多几张图
export const SUBTITLE_MAX = 12; // 视角名最长字数（含「 · 」）
export const ROOM_EN_MAX = 40;
export const NOTE_LABEL_MAX = 32;
export const NOTE_TEXT_MAX = 80;
export const IMAGE_EDGE = 768; // 发给模型的图片最长边

/** 时间 / 光线限定词：原标题里有就必须保留 */
const QUALIFIERS = ['白天', '夜晚', '日景', '夜景', '傍晚', '晚上'];

const chars = (s) => Array.from(String(s ?? ''));
const len = (s) => chars(s).length;
const cut = (s, n) => chars(s).slice(0, n).join('');
const CJK_RE = /[⺀-鿿豈-﫿＀-￯]/;

// ---------------------------------------------------------------------------
// 分组：同一楼层同一空间的连续效果图一起发（模型才能保证视角名互不重复）
// ---------------------------------------------------------------------------

/** 可润色的页：启用的效果图页，排除 AI 立体图 */
export const isPolishable = (s) => !!s && s.kind === 'view' && s.enabled !== false && s.tag !== '3d';

/** 均分成每份 ≤ max（7 → 4 + 3，而不是 6 + 1） */
export function chunkBalanced(list, max = MAX_PER_GROUP) {
  const n = Math.max(1, Math.ceil(list.length / Math.max(1, max)));
  const size = Math.ceil(list.length / n);
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * 连续的效果图页按 floorId + room 分组；章节页 / 公司页等会打断分组，停用页、立体图页跳过但不打断。
 * @returns {Array<{ floorId, room, label, slides, part, parts }>}
 */
export function groupViewSlides(project, { onlySlideIds, maxPerGroup = MAX_PER_GROUP } = {}) {
  const only = onlySlideIds ? new Set(onlySlideIds) : null;
  const runs = [];
  let cur = null;
  for (const s of project?.slides || []) {
    if (!s || s.kind !== 'view') {
      cur = null;
      continue;
    }
    if (!isPolishable(s) || (only && !only.has(s.id))) continue;
    const room = (s.room || '').trim();
    const key = `${s.floorId || ''}\u0000${room}`;
    if (cur && cur.key === key) cur.slides.push(s);
    else {
      cur = { key, floorId: s.floorId || null, room, slides: [s] };
      runs.push(cur);
    }
  }
  const groups = [];
  for (const run of runs) {
    const floor = run.floorId ? findFloor(project, run.floorId) : null;
    const chunks = chunkBalanced(run.slides, maxPerGroup);
    chunks.forEach((slides, i) => {
      const base = [floor?.zh, run.room].filter(Boolean).join(' · ') || '效果图';
      groups.push({
        floorId: run.floorId,
        floorLabel: floor?.zh || '',
        room: run.room,
        label: chunks.length > 1 ? `${base}（${i + 1}/${chunks.length}）` : base,
        slides,
        part: i + 1,
        parts: chunks.length,
      });
    });
  }
  return groups;
}

/** 发给模型的单页文字（材料写成「role: name code」，只作参考） */
export function slideBrief(slide, project, id = slide?.id) {
  const notes = (slide.notes || [])
    .filter((n) => n && ((n.text || '').trim() || (n.label || '').trim()))
    .map((n) => ({ label: (n.label || '').trim(), text: (n.text || '').trim() }));
  const materials = (slide.materials || []).map((r) => {
    const m = project ? findMaterial(project, r.materialId) : null;
    const name = [m?.name, m?.code].map((s) => (s || '').trim()).filter(Boolean).join(' ');
    return `${(r.role || '材料').trim()}: ${name || '—'}`;
  });
  const brief = { id, room: slide.room || '', roomEn: slide.roomEn || '', subtitle: slide.subtitle || '', notes };
  if (materials.length) brief.materials = materials;
  return brief;
}

// ---------------------------------------------------------------------------
// JSON 解析：去代码块、容忍前后多余文字 / 尾逗号
// ---------------------------------------------------------------------------

/** 从 start（'{' 或 '['）开始找配对的闭括号，跳过字符串里的括号；找不到返回 -1 */
function matchBracket(s, start) {
  const stack = [];
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') {
      if (stack.pop() !== ch) return -1;
      if (!stack.length) return i;
    }
  }
  return -1;
}

const tryParse = (s) => {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    try {
      return { ok: true, value: JSON.parse(s.replace(/,\s*([}\]])/g, '$1')) }; // 尾逗号
    } catch {
      return { ok: false };
    }
  }
};

/** 模型回复 → JSON 值；解析失败抛错（err.parse = true） */
export function extractJson(text) {
  if (text && typeof text === 'object') return text;
  let s = String(text ?? '').replace(/^﻿/, '').trim();
  const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  else s = s.replace(/^```(?:json|JSON)?\s*/, '').replace(/```\s*$/, '').trim();

  const direct = tryParse(s);
  if (direct.ok) return direct.value;

  for (let from = 0; from < s.length; ) {
    const start = s.slice(from).search(/[{[]/);
    if (start < 0) break;
    const at = from + start;
    const end = matchBracket(s, at);
    if (end > at) {
      const r = tryParse(s.slice(at, end + 1));
      if (r.ok) return r.value;
    }
    from = at + 1;
  }
  const err = new Error('AI 返回的内容不是有效的 JSON');
  err.parse = true;
  throw err;
}

// ---------------------------------------------------------------------------
// 清洗：视角名 / 英文名 / 备注
// ---------------------------------------------------------------------------

/** 统一分隔符为「 · 」 */
export const normalizeDots = (s) =>
  String(s ?? '')
    .replace(/\s*[·•・‧∙⋅]\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .replace(/^( · )+|( · )+$/g, '')
    .trim();

/**
 * 视角名：去引号 / 去重复的空间名 / 保留「白天 / 夜晚」/ 限长（优先删中间段，再截断第一段）
 * @param {string} raw
 * @param {{ room?:string, before?:string }} ctx
 */
export function sanitizeSubtitle(raw, { room = '', before = '' } = {}) {
  if (typeof raw !== 'string') return '';
  let s = raw.replace(/[\r\n]+/g, ' ').trim();
  s = s.replace(/^["'“”‘’「『【《(（\s]+|["'“”‘’」』】》)）\s]+$/g, '');
  s = normalizeDots(s).replace(/[。．，,;；!！]+$/, '').trim();
  const r = (room || '').trim();
  if (r && s.startsWith(r) && len(s) > len(r)) s = normalizeDots(s.slice(r.length).replace(/^[\s·:：\-—]+/, ''));
  if (!s) return '';

  const segs = s.split(' · ').filter(Boolean);
  for (const q of QUALIFIERS) {
    if ((before || '').includes(q) && !s.includes(q)) segs.push(q);
  }
  const joined = () => segs.join(' · ');
  while (len(joined()) > SUBTITLE_MAX && segs.length > 2) {
    // 删掉中间的非限定段（「衣柜 · 化妆台 · 夜晚」→「衣柜 · 夜晚」）
    let idx = -1;
    for (let i = segs.length - 2; i >= 1; i--) if (!QUALIFIERS.includes(segs[i])) { idx = i; break; }
    if (idx < 0) break;
    segs.splice(idx, 1);
  }
  let out = joined();
  if (len(out) > SUBTITLE_MAX) {
    const tail = segs.slice(1).join(' · ');
    const room0 = SUBTITLE_MAX - (tail ? len(tail) + 3 : 0);
    out = room0 >= 2 ? [cut(segs[0], room0), tail].filter(Boolean).join(' · ') : cut(out, SUBTITLE_MAX);
  }
  return out.trim();
}

/** 英文小标题：大写、只留常用字符、≤ 40 字（按单词截断） */
export function sanitizeRoomEn(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9 &'/\-.+]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[\s&'/\-.+]+|[\s&'/\-+]+$/g, '');
  if (s.length > ROOM_EN_MAX) {
    const head = s.slice(0, ROOM_EN_MAX + 1);
    const sp = head.lastIndexOf(' ');
    s = (sp > 10 ? head.slice(0, sp) : s.slice(0, ROOM_EN_MAX)).trim();
  }
  return s;
}

/** 备注标签：统一「中文 · English」；「隐形门 Hidden door」→「隐形门 · Hidden door」 */
export function sanitizeNoteLabel(raw) {
  let s = normalizeDots(typeof raw === 'string' ? raw : '').replace(/[：:]+$/, '').trim();
  if (!s.includes(' · ')) {
    const m = s.match(/^([^A-Za-z]*[⺀-鿿][^A-Za-z]*?)\s*([A-Za-z][A-Za-z0-9 &'/\-.]*)$/);
    if (m && CJK_RE.test(m[1])) s = `${m[1].trim()} · ${m[2].trim()}`;
  }
  return cut(s, NOTE_LABEL_MAX).trim();
}

export function sanitizeNoteText(raw) {
  const s = (typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : '').replace(/\s+/g, ' ').trim();
  return cut(s, NOTE_TEXT_MAX).trim();
}

/** 备注数组 → [{ label, text }]（不是数组返回 null = 不改） */
export function sanitizeNotes(raw) {
  if (!Array.isArray(raw)) return null;
  return raw
    .map((n) => (typeof n === 'string' ? { label: '', text: n } : n))
    .filter((n) => n && typeof n === 'object')
    .map((n) => ({ label: sanitizeNoteLabel(n.label), text: sanitizeNoteText(n.text) }))
    .filter((n) => n.label || n.text);
}

// ---------------------------------------------------------------------------
// 模型回复 → 每页的建议（校验类型、忽略未知 id）
// ---------------------------------------------------------------------------

function itemsOf(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const k of ['slides', 'results', 'items', 'pages', 'data']) if (Array.isArray(value[k])) return value[k];
  if ('subtitle' in value || 'roomEn' in value || 'notes' in value) return [value];
  // { v1: {...}, v2: {...} }
  return Object.entries(value)
    .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
    .map(([id, v]) => ({ id, ...v }));
}

/**
 * @param {string|object} text  模型回复
 * @param {Array<{ key:string, slide:object }>} entries  本组的页（key = 发给模型的短 id，如 'v1'）
 * @returns {Map<string, { subtitle?, roomEn?, notes? }>}  key → 清洗前的字段（只保留类型正确的）
 */
export function parsePolishResponse(text, entries) {
  const items = itemsOf(extractJson(text)).filter((it) => it && typeof it === 'object');
  const byKey = new Map(entries.map((e, i) => [e.key, i]));
  const byId = new Map(entries.map((e, i) => [e.slide?.id, i]));
  const positional = items.length === entries.length;
  const out = new Map();
  items.forEach((it, idx) => {
    let i;
    const rawId = it.id ?? it.key ?? it.slideId;
    if (rawId != null && rawId !== '') {
      const id = String(rawId).trim();
      i = byKey.get(id) ?? byId.get(id) ?? (/^\d+$/.test(id) ? byKey.get(`v${id}`) : undefined);
      if (i === undefined) return; // 未知 id：忽略
    } else if (positional) {
      i = idx;
    } else return;
    const key = entries[i].key;
    if (out.has(key)) return;
    const fields = {};
    if (typeof it.subtitle === 'string') fields.subtitle = it.subtitle;
    if (typeof it.roomEn === 'string') fields.roomEn = it.roomEn;
    else if (typeof it.room_en === 'string') fields.roomEn = it.room_en;
    if (Array.isArray(it.notes)) fields.notes = it.notes;
    if (Object.keys(fields).length) out.set(key, fields);
  });
  if (!out.size) {
    const err = new Error('AI 的回复里没有可用的建议');
    err.parse = true;
    throw err;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 生成补丁：只留真正变了的字段；材料永远不动
// ---------------------------------------------------------------------------

const cleanNotes = (notes) =>
  (notes || [])
    .filter((n) => n && ((n.text || '').trim() || (n.label || '').trim()))
    .map((n) => ({ label: (n.label || '').trim(), text: (n.text || '').trim() }));

const sameNotes = (a, b) => a.length === b.length && a.every((n, i) => n.label === b[i].label && n.text === b[i].text);

export const beforeOf = (slide) => ({
  subtitle: slide.subtitle || '',
  roomEn: slide.roomEn || '',
  notes: (slide.notes || []).map((n) => ({ label: n?.label || '', text: n?.text || '' })),
});

/**
 * @param {Array<{ key, slide }>} entries
 * @param {Map<string, object>} results  parsePolishResponse 的输出
 * @returns {Array<{ slideId, before, patch }>}  只含有改动的页
 */
export function buildPatches(entries, results) {
  // 1) 英文名：同一空间统一（取出现最多的）
  const votes = new Map();
  for (const e of entries) {
    const v = sanitizeRoomEn(results.get(e.key)?.roomEn);
    if (v) votes.set(v, (votes.get(v) || 0) + 1);
  }
  let roomEn = '';
  for (const [v, n] of votes) if (!roomEn || n > votes.get(roomEn)) roomEn = v;

  const rows = entries.map((e) => {
    const { slide } = e;
    const before = beforeOf(slide);
    const r = results.get(e.key);
    const patch = {};
    if (r) {
      const sub = sanitizeSubtitle(r.subtitle, { room: slide.room, before: before.subtitle });
      if (sub && sub !== before.subtitle.trim()) patch.subtitle = sub;

      if (roomEn && roomEn !== before.roomEn.trim().toUpperCase()) patch.roomEn = roomEn;

      // 备注：原来没有就不加（防编造）；条数不超过原来的；清空不算数
      const old = cleanNotes(slide.notes);
      const next = sanitizeNotes(r.notes);
      if (old.length && next && next.length) {
        const capped = next.slice(0, old.length);
        if (!sameNotes(capped, old)) patch.notes = capped;
      }
    }
    return { slideId: slide.id, before, patch };
  });

  // 2) 同组视角名去重：撞名时撤回「改出来的那个」
  const finalSub = (row) => (row.patch.subtitle ?? row.before.subtitle).trim();
  for (let guard = 0; guard < rows.length * 2; guard++) {
    let changed = false;
    for (let i = 0; i < rows.length && !changed; i++) {
      for (let j = 0; j < i && !changed; j++) {
        if (!finalSub(rows[i]) || finalSub(rows[i]) !== finalSub(rows[j])) continue;
        const victim = rows[i].patch.subtitle !== undefined ? rows[i] : rows[j].patch.subtitle !== undefined ? rows[j] : null;
        if (victim) {
          delete victim.patch.subtitle;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  return rows.filter((row) => Object.keys(row.patch).length);
}

/** 套用补丁（编辑器 onApply 可直接用）：只认 subtitle / roomEn / notes 三个字段 */
export function applyPolishPatches(project, patches) {
  const map = new Map((patches || []).map((p) => [p.slideId, p.patch || {}]));
  if (!map.size) return project;
  return {
    ...project,
    slides: (project.slides || []).map((s) => {
      const patch = map.get(s.id);
      if (!patch) return s;
      const next = { ...s };
      if (typeof patch.subtitle === 'string') next.subtitle = patch.subtitle;
      if (typeof patch.roomEn === 'string') next.roomEn = patch.roomEn;
      if (Array.isArray(patch.notes)) next.notes = patch.notes.map((n) => ({ label: n.label || '', text: n.text || '' }));
      return next;
    }),
  };
}

// ---------------------------------------------------------------------------
// 调用模型
// ---------------------------------------------------------------------------

async function polishGroup(project, settings, group) {
  const entries = group.slides.map((slide, i) => ({ key: `v${i + 1}`, slide }));
  const images = [];
  const imageOrder = [];
  for (const e of entries) {
    if (!e.slide.image) continue;
    try {
      const im = await toInlineImage(e.slide.image, IMAGE_EDGE);
      images.push({ mimeType: im.mimeType, base64: im.base64 });
      imageOrder.push(e.key);
    } catch {
      /* 图丢了就只看文字 */
    }
  }
  const prompt = buildPolishPrompt({
    floor: group.floorLabel,
    room: group.room,
    briefs: entries.map((e) => slideBrief(e.slide, project, e.key)),
    imageOrder,
  });
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await analyzeImage(settings, prompt, images, { json: true });
    try {
      return buildPatches(entries, parsePolishResponse(text, entries));
    } catch (e) {
      if (!e.parse) throw e;
      lastErr = e; // 回复格式不对：同一组再问一次
    }
  }
  throw lastErr;
}

/**
 * 润色整套（或 onlySlideIds 指定的页）。
 * - 解析失败的组重试一次，仍失败就跳过（onGroupError 通知）并继续；
 * - 网络 / key / 额度错误：一组都没成功时直接抛出；已有结果时停下并返回已完成的部分（onGroupError 通知，fatal = true）。
 * @param {object} project
 * @param {object} settings
 * @param {{ onProgress?:(done:number,total:number,label:string)=>void, onlySlideIds?:string[],
 *           signal?:{aborted:boolean}, onGroupError?:(err:Error, group:object, fatal:boolean)=>void }} opts
 * @returns {Promise<Array<{ slideId, before:{subtitle, roomEn, notes}, patch:{ subtitle?, roomEn?, notes? } }>>}
 */
export async function polishProject(project, settings, { onProgress, onlySlideIds, signal, onGroupError } = {}) {
  if (!settings?.apiKey) throw new Error('还没有配置 API key，点右上角设置。');
  const groups = groupViewSlides(project, { onlySlideIds });
  const out = [];
  let succeeded = 0;
  for (let k = 0; k < groups.length; k++) {
    if (signal?.aborted) break;
    onProgress?.(k, groups.length, groups[k].label);
    try {
      out.push(...(await polishGroup(project, settings, groups[k])));
      succeeded += 1;
    } catch (e) {
      const fatal = !e.parse;
      onGroupError?.(e, groups[k], fatal);
      if (fatal) {
        if (!succeeded) throw e;
        break;
      }
    }
  }
  onProgress?.(groups.length, groups.length, '');
  return out;
}
