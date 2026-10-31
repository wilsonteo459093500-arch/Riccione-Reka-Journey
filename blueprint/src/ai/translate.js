// 「AI 翻译」：English / 中英版里还没有英文的中文 → 一批批交给文字模型 → 清洗 → 写进翻译记忆（project.translations）。
// 纯逻辑与网络调用分开：parse / sanitize / chunk 可在 Node 测。

import { analyzeImage } from './gemini.js';
import { extractJson } from './polish.js';
import { buildTranslatePrompt } from './prompts.js';
import { hasCJKText, straightQuotes } from '../engine/lang.js';

/** 一次请求最多几条（太多容易漏条 / 超时） */
export const TRANSLATE_BATCH = 40;

const MAX_LEN = { room: 60, view: 60, role: 60, label: 60, team: 60, material: 80, note: 240, text: 400 };

/**
 * 模型给的英文 → 能直接放进页面的英文；不合格返回 ''（还带中文、太长、空）
 * @param {string} raw
 * @param {string} kind
 */
export function sanitizeEn(raw, kind = 'text') {
  let s = straightQuotes(String(raw ?? ''))
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
  s = s.replace(/\s*[·•・‧∙⋅]\s*/g, ' · ');
  if (kind !== 'note' && kind !== 'text') s = s.replace(/[.。]+$/, '');
  if (!s || hasCJKText(s)) return '';
  if (s.length > (MAX_LEN[kind] || 400)) return '';
  return s;
}

/** 分批（按顺序，每批 ≤ size 条），并给每条编号 t1…tN（模型按编号回） */
export function chunkItems(items, size = TRANSLATE_BATCH) {
  const out = [];
  (items || []).forEach((it, i) => {
    if (i % size === 0) out.push([]);
    out[out.length - 1].push({ ...it, id: `t${i + 1}` });
  });
  return out;
}

/**
 * 解析模型回复：{"items":[{"id","en"}]}（也接受直接是数组、或用 zh 对应）→ [{ zh, en }]
 * @param {string|object} text
 * @param {Array<{ id:string, zh:string, kind:string }>} batch
 */
export function parseTranslateResponse(text, batch) {
  const data = extractJson(text);
  const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : Array.isArray(data?.translations) ? data.translations : [];
  const byId = new Map(batch.map((it) => [it.id, it]));
  const byZh = new Map(batch.map((it) => [it.zh, it]));
  const out = [];
  const seen = new Set();
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const it = byId.get(String(row.id ?? '').trim()) || byZh.get(String(row.zh ?? '').trim());
    if (!it || seen.has(it.zh)) continue;
    const en = sanitizeEn(row.en ?? row.english ?? row.text, it.kind);
    if (!en) continue;
    seen.add(it.zh);
    out.push({ zh: it.zh, en });
  }
  return out;
}

/**
 * 翻译一组缺英文的中文
 * @param {Array<{ zh:string, kind:string }>} items
 * @param {object} settings  AI 设置（apiKey 等）
 * @param {{ context?:string, onProgress?:(done:number,total:number)=>void, signal?:AbortSignal, request?:Function }} opts
 *   request：替换网络请求（测试用），签名同 analyzeImage
 * @returns {Promise<{ pairs:Array<{zh,en}>, failed:number, errors:string[] }>}
 */
export async function translateItems(items, settings, { context = '', onProgress, signal, request = analyzeImage } = {}) {
  const batches = chunkItems(items);
  const pairs = [];
  const errors = [];
  let failed = 0;
  let done = 0;
  onProgress?.(0, items.length);
  for (const batch of batches) {
    if (signal?.aborted) break;
    try {
      const text = await request(settings, buildTranslatePrompt({ items: batch, context }), null, { json: true });
      const got = parseTranslateResponse(text, batch);
      pairs.push(...got);
      failed += batch.length - got.length;
    } catch (e) {
      if (signal?.aborted) break;
      failed += batch.length;
      errors.push(e?.message || String(e));
      // 没配 key / key 无效：后面的批次也会一样失败，直接停
      if (/API key|key 无效|401|403/.test(e?.message || '')) break;
    }
    done += batch.length;
    onProgress?.(Math.min(done, items.length), items.length);
  }
  return { pairs, failed, errors };
}
