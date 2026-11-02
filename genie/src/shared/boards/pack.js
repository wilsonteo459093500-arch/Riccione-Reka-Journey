// 溪岸板材 · 板材包（WISH-boards-YYYYMMDD[-p1of2].json）—— 办公室电脑导出，展厅 iPad 导入，负责人用 scripts/import-boards.mjs 合进网站。
// 纯函数（Node + 浏览器）。和案例包一个思路：JSON + data: 网址的 WebP；每一份 ≤ 20 MB（base64 之后），一块板永远不会拆到两份里，
// 每一份都可以单独导入（顺序随便）。
//
//   { kind: 'wish-boards', v: 1, packId, part, parts, exportedAt,
//     boards: [ 板材记录（字段见 library-api.js 顶上；只有白名单里的字段，文件名只有 basename）],
//     images: { 'sail-7/1024': 'data:image/webp;base64,…', 'sail-7/256': …, 'sail-7/chip': … } }
//
// 隐私：包里没有路径（Windows 的路径里有用户名）、没有原图、没有 EXIF（重新画过的 WebP）。

import { splitPack } from '../../cases/sorter/pack.js';
// 只留文件名（和 parse.js 的 basename 一样；这里自己写一行：板材包的代码不用带上文件名解析和整张词表）
const basename = (file) => String(file ?? '').normalize('NFC').replace(/\\/g, '/').split('/').pop();

export const PACK_KIND = 'wish-boards';
export const PACK_V = 1;
export const PACK_MAX = 20 * 1024 * 1024;
export const IMAGE_TIERS = ['256', '1024', 'chip'];
export const CHIP_MAX = 128;
const ID_RE = /^sail-[a-z0-9-]{1,40}$/;
const KINDS = ['wood', 'solid', 'stone', 'weave'];
const FINISHES = ['matte', 'softtouch', 'satin', 'gloss'];
const SLOTS = ['cabinetry', 'feature'];
const SEAM = ['ok', 'baked', 'fail'];

/** 记录里能出这台电脑的字段（别的一律不带：原图路径、员工的临时状态……） */
export const RECORD_KEYS = [
  'id', 'rev', 'seq', 'code', 'file', 'series', 'family', 'species', 'grain', 'flags', 'name', 'kind', 'finish',
  'hex', 'dark', 'lab', 'light', 'warm', 'mood', 'tags', 'rough', 'proc',
  'mm', 'sizeRule', 'sizeFlag', 'px', 'rot', 'flip', 'crop', 'seam', 'tiers',
  'uses', 'fav', 'hidden', 'near', 'hash', 'at', 'img',
];

/** 只留白名单字段；文件名只留 basename（去掉路径） */
export function cleanRecord(rec) {
  const out = {};
  for (const k of RECORD_KEYS) if (rec[k] !== undefined) out[k] = rec[k];
  if (out.file != null) out.file = basename(out.file);
  if (out.name && typeof out.name === 'object') out.name = { zh: String(out.name.zh || ''), en: String(out.name.en || '') };
  return out;
}

const isHex = (h) => /^#[0-9A-F]{6}$/i.test(String(h || ''));
const isDims = (d) => Array.isArray(d) && d.length === 2 && d.every((v) => Number.isInteger(v) && v > 0 && v <= 4096);

/** 检查一条记录 → { ok, errors: [{ field, zh }], warnings: [...] } */
export function validateBoard(rec) {
  const errors = [];
  const warnings = [];
  const err = (field, zh) => errors.push({ field, zh });
  if (!rec || typeof rec !== 'object') return { ok: false, errors: [{ field: 'record', zh: '不是一条板材记录' }], warnings };
  if (!ID_RE.test(String(rec.id || ''))) err('id', '板材 id 不对');
  if (!(Number.isInteger(rec.rev) && rec.rev >= 1)) err('rev', '版本号不对');
  if (!KINDS.includes(rec.kind)) err('kind', '类别不认识');
  if (!FINISHES.includes(rec.finish)) err('finish', '表面不认识');
  if (!isHex(rec.hex)) err('hex', '颜色不对');
  if (rec.seq != null && !(Number.isInteger(rec.seq) && rec.seq >= 0 && rec.seq < 100000)) err('seq', '序号不对');
  if (!rec.name || typeof rec.name !== 'object') err('name', '缺名字');
  if (!(Array.isArray(rec.mm) && rec.mm.length === 2 && rec.mm.every((v) => +v > 0 && +v <= 6000))) err('mm', '尺寸不对');
  if (!Array.isArray(rec.uses) || rec.uses.some((u) => !SLOTS.includes(u))) err('uses', '用在哪里不对（只有柜体和墙板）');
  if (rec.kind === 'weave' && rec.uses?.length) err('uses', '编织只是资料，不能铺到表面上');
  if (rec.file != null && /[\\/]/.test(String(rec.file))) err('file', '文件名里不能有路径');
  if (rec.tiers && typeof rec.tiers === 'object') {
    for (const [t, d] of Object.entries(rec.tiers)) if (!['256', '1024'].includes(String(t)) || !isDims(d)) err('tiers', '分辨率不对');
  } else if (rec.img !== false) err('tiers', '缺分辨率');
  if (rec.seam && (!SEAM.includes(rec.seam.u) || !SEAM.includes(rec.seam.v))) err('seam', '无缝资料不对');
  if (rec.hash != null && !/^[0-9a-f]{16}$/.test(String(rec.hash))) err('hash', '指纹不对');
  if (rec.sizeFlag) warnings.push({ field: 'mm', zh: '比例可能不对' });
  return { ok: errors.length === 0, errors, warnings };
}

// ───────────────────────── WebP 文件头（不用图片库：只看前 30 个字节） ─────────────────────────

/** WebP 的宽高（不是 WebP / 坏的 = null）：RIFF…WEBP + VP8 / VP8L / VP8X */
export function webpInfo(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length < 30) return null;
  const tag = (o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return null;
  const riffSize = b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24);
  if (riffSize + 8 > b.length + 1 || riffSize < 12) return null;
  const chunk = tag(12);
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff, type: 'lossy' };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1, type: 'lossless' };
  }
  if (chunk === 'VP8X') {
    return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)), type: 'extended' };
  }
  return null;
}

// ───────────────────────── base64 / data: 网址（Node + 浏览器都能用） ─────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  let out = '';
  const n = bytes.length;
  for (let i = 0; i < n; i += 3) {
    const a = bytes[i];
    const b = i + 1 < n ? bytes[i + 1] : 0;
    const c = i + 2 < n ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)] + (i + 1 < n ? B64[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < n ? B64[c & 63] : '=');
  }
  return out;
}
export function fromBase64(s) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const bytesToDataURL = (bytes, mime = 'image/webp') => `data:${mime};base64,${toBase64(bytes)}`;
/** data: 网址 → { mime, bytes }（不是 base64 的 data: 网址 = null） */
export function dataURLBytes(url) {
  const m = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]*)$/i.exec(String(url || ''));
  if (!m) return null;
  try {
    return { mime: m[1].toLowerCase(), bytes: fromBase64(m[2].replace(/\s+/g, '')) };
  } catch {
    return null;
  }
}

export const imageKey = (id, tier) => `${id}/${tier}`;

// ───────────────────────── 拆包 + 写包 ─────────────────────────

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
/** WISH-boards-20261024.json · 拆开时 WISH-boards-20261024-p1of2.json */
export function partName(i, n, d = new Date()) {
  return n > 1 ? `WISH-boards-${ymd(d)}-p${i}of${n}.json` : `WISH-boards-${ymd(d)}.json`;
}
export function newPackId(d = new Date()) {
  return `b-${ymd(d)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 一块板在包里占多少字节（记录 JSON + 每张图的 base64 + 键和 data: 前缀） */
export function boardPackBytes(rec, imageSizes) {
  return JSON.stringify(cleanRecord(rec)).length + 2 + imageSizes.reduce((s, b) => s + Math.ceil(b / 3) * 4 + 64, 0);
}

/**
 * 写板材包（可以拆成几份）。
 * @param {{ records: object[], images: Map<string, Uint8Array>, max?: number, date?: Date, packId?: string }} o
 *   images 的键 = 'sail-7/1024'；值 = WebP 的字节
 * @returns {{ name: string, text: string, ids: string[], bytes: number, oversize?: boolean }[]}
 */
export function buildPacks({ records, images, max = PACK_MAX, date = new Date(), packId = newPackId(date) }) {
  const recs = records.map(cleanRecord);
  const items = recs.map((r) => ({
    id: r.id,
    bytes: boardPackBytes(
      r,
      IMAGE_TIERS.map((t) => images.get(imageKey(r.id, t))?.length || 0).filter(Boolean)
    ),
  }));
  const plan = splitPack(items, max - 512);
  const byId = new Map(recs.map((r) => [r.id, r]));
  const exportedAt = date.toISOString();
  return plan.map((p, i) => {
    const imgs = {};
    for (const id of p.ids)
      for (const t of IMAGE_TIERS) {
        const b = images.get(imageKey(id, t));
        if (b) imgs[imageKey(id, t)] = bytesToDataURL(b, webpInfo(b) ? 'image/webp' : sniffMime(b));
      }
    const doc = { kind: PACK_KIND, v: PACK_V, packId, part: i + 1, parts: plan.length, exportedAt, boards: p.ids.map((id) => byId.get(id)), images: imgs };
    const text = JSON.stringify(doc);
    return { name: partName(i + 1, plan.length, date), text, ids: p.ids, bytes: text.length, ...(p.oversize ? { oversize: true } : {}) };
  });
}

function sniffMime(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  return 'application/octet-stream';
}

/**
 * 读一份板材包（文字或已经 parse 过的对象）→ 检查每一块板和每一张图。
 *   一块板的记录不对、或者它的图不是 WebP / 大小和记录不一样 → 这块板不导入（rejected），别的照常。
 * @returns {{ ok, packId, part, parts, exportedAt, boards: object[], images: Map<string, { mime, bytes }>, rejected: [{ id, zh }], errors: [{ zh }], warnings: [{ id, zh }] }}
 */
export function readPack(input) {
  const out = { ok: false, packId: null, part: 1, parts: 1, exportedAt: null, boards: [], images: new Map(), rejected: [], errors: [], warnings: [] };
  let doc = input;
  if (typeof input === 'string') {
    try {
      doc = JSON.parse(input);
    } catch {
      out.errors.push({ zh: '这个文件不是板材包（读不出来）' });
      return out;
    }
  }
  if (!doc || doc.kind !== PACK_KIND) {
    out.errors.push({ zh: doc?.kind === 'wish-cases' ? '这是案例包，请在案例库里导入' : '这个文件不是板材包' });
    return out;
  }
  if (doc.v !== PACK_V) {
    out.errors.push({ zh: '板材包的版本太新，请先更新网站' });
    return out;
  }
  out.packId = String(doc.packId || '');
  out.part = Number.isInteger(doc.part) ? doc.part : 1;
  out.parts = Number.isInteger(doc.parts) ? doc.parts : 1;
  out.exportedAt = doc.exportedAt || null;
  const imgs = doc.images && typeof doc.images === 'object' ? doc.images : {};
  const seen = new Set();
  for (const raw of Array.isArray(doc.boards) ? doc.boards : []) {
    const rec = cleanRecord(raw || {});
    const v = validateBoard(rec);
    if (!v.ok) {
      out.rejected.push({ id: rec.id || '?', zh: v.errors[0].zh });
      continue;
    }
    if (seen.has(rec.id)) {
      out.rejected.push({ id: rec.id, zh: '同一个包里有两块一样 id 的板' });
      continue;
    }
    seen.add(rec.id);
    for (const w of v.warnings) out.warnings.push({ id: rec.id, zh: w.zh });
    const mine = new Map();
    let bad = null;
    for (const t of IMAGE_TIERS) {
      const url = imgs[imageKey(rec.id, t)];
      if (url == null) continue;
      const d = dataURLBytes(url);
      const info = d && d.mime === 'image/webp' ? webpInfo(d.bytes) : null;
      if (!info) {
        bad = '贴图不是 WebP（请用 Chrome / Edge 重新导出）';
        break;
      }
      const want = t === 'chip' ? null : rec.tiers?.[t];
      if (want && (info.w !== want[0] || info.h !== want[1])) {
        bad = '贴图大小和记录对不上';
        break;
      }
      if (t === 'chip' && (info.w > CHIP_MAX || info.h > CHIP_MAX)) {
        bad = '色卡太大';
        break;
      }
      mine.set(imageKey(rec.id, t), { mime: 'image/webp', bytes: d.bytes });
    }
    if (bad) {
      out.rejected.push({ id: rec.id, zh: bad });
      continue;
    }
    if (rec.img !== false && !mine.has(imageKey(rec.id, '1024'))) out.warnings.push({ id: rec.id, zh: '这块板没有贴图，只有资料' });
    for (const [k, v2] of mine) out.images.set(k, v2);
    out.boards.push(rec);
  }
  // 不属于任何一块板的图：不要
  for (const k of Object.keys(imgs)) if (!seen.has(k.split('/')[0])) out.warnings.push({ id: k, zh: '多出来的贴图（没有对应的板），已跳过' });
  out.ok = out.boards.length > 0 || (out.rejected.length === 0 && Array.isArray(doc.boards));
  return out;
}

/** rev 高的赢；一样高：force 才换（合并脚本 / iPad 导入都用这条） */
export function newer(incoming, existing, { force = false } = {}) {
  if (!existing) return true;
  if ((incoming.rev || 1) > (existing.rev || 1)) return true;
  return force && (incoming.rev || 1) === (existing.rev || 1);
}
