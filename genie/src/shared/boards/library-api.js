// 溪岸板材 · 登记表（纯 JS：Node 和浏览器都能跑；不 import materials.js —— materials.js 反过来用这里）。
//
// 一块板材 = MAT_BY_ID 里的一个普通材质（情绪、配色、雷区、案例匹配、分享链接全部照常），多一个 `board` 块。
// 它不进程序化的 MATERIALS 数组（自动换材质、色标测试、材质栏的程序化分类都不变）。
//
// ── 板材记录（library.js 里的一条 / 板材包 boards[] 里的一条；字段由导入器 src/shared/boards/derive.js 等算出）──
//   id      'sail-7' | 'sail-c2810' | 'sail-x<hash>'   第一次存的时候定下，之后永远不变、不重用（R8）
//   rev     1, 2 …                                     改一次 +1；同一个 id 取 rev 高的那份（R11 c）
//   seq     7 | null        序号（7号）            code   'XA-TP-01' | '2810' | ''（厂家编号，可以重复）
//   label?  { zh, en }      显示名（不填 = 「7号 · 黑胡桃」/「2810 · 墨绿」/ 名字）
//   name    { zh, en }      名字（员工可改）       series / species / grain('crown'|'straight'|null) / flags[] / file（只有文件名）
//   kind    'wood' | 'solid' | 'stone' | 'weave'     weave（织系列编织门）在 3D 里只是资料，不上任何表面（R6）
//   finish  'matte' | 'softtouch' | 'satin' | 'gloss'
//   hex '#5E4433' · dark '#4C362A' · lab [L,a,b] · light 0–1 · warm −1–1 · mood [cozy,bright,moody] · tags[] · rough? · proc?（近似色木纹用哪种树：oak/maple/walnut/teak/cherry）
//   mm      [across, along]  这张图（顺纹竖放）盖住的真实尺寸（毫米）
//   tiers   { 256: [w, h], 1024: [w, h] }  存了哪些分辨率（顺纹方向的像素：256 = 预览 / 省电，1024 = 完整）
//   seam?   { u: 'ok'|'baked'|'fail', v: … }   横纹（u）/ 顺纹（v）方向能不能无缝平铺（导入器量的；baked = 只烤了那一个方向）
//   uses    ['cabinetry', 'feature']   能用在哪里（R1：只有柜体（含室内门）和主题墙板）
//   fav · hidden · near（最接近的程序化材质 id）· hash（dHash，16 位十六进制）· at（导入日期）
//   img     false = 只有资料、没有贴图（--meta-only 合并的）→ 3D 用近似色的程序化贴图，不去下载
//   v?      贴图文件的内容版本（合并脚本写；网址的 ?v=，换了图网址就变）
//
// ── 随网站的那份（library.js）──
//   单独一块，用到的时候才下载：boards/bundled.js 的 bundledBoards()（3D 工作室开机、案例库、有板材的案例详情）。
//   测验 / 入口页 / 许愿模式外壳不下载它（测验配案例只看 case.materials，R11 a）。
//
// ── 贴图从哪里来（R10：本机板材包 → 有 CONFIG.boards.base 时才上网）──
//   本机：src/shared/boards/device.js 用 addImageSource({ name, has(id, hash), blob(id, tier), chip(id) }) 登记 IndexedDB；
//   网上：CONFIG.boards.base + `${id}/${tier}.webp?v=…`（tier = 256 | 1024 | 'chip'），记录的 img !== false 时才用。

import { CONFIG } from '../config.js';

export const BOARD_SLOTS = ['cabinetry', 'feature'];
export const BOARD_KINDS = ['wood', 'solid', 'stone', 'weave'];
/** 顺纹方向的像素：256 = 预览（也是省电档 / 显卡吃紧后用的），1024 = 完整（iPad 和电脑都一样，R10） */
export const BOARD_TIERS = [256, 1024];
export const FINISHES = ['matte', 'softtouch', 'satin', 'gloss'];
/** 表面处理 → 粗糙度（整块一个值：v1 是平的法线 + 固定的 ORM，R10） */
export const FINISH_ROUGH = { matte: 0.62, softtouch: 0.72, satin: 0.45, gloss: 0.2 };
const KIND_ORDER = { wood: 0, solid: 1, stone: 2, weave: 3 };
export const BOARD_ID_RE = /^sail-[a-z0-9-]{1,40}$/;
/**
 * 测试编的板材用的 id 前缀（'sail-t-1'、'sail-t-lru3' …）：导入器只会给出 sail-<数字> / sail-c<编号> / sail-x<指纹>
 * （parse.js boardId），所以真实板材永远不会和测试的撞在一起。
 */
export const TEST_ID_PREFIX = 'sail-t-';

/** 全部登记的板材（材质对象；随网站的 + 这台设备导入的，隐藏的也在 —— 界面自己过滤） */
export const BOARDS = [];
/** id → 材质对象 */
export const BOARD_BY_ID = {};

const STORE = new Map(); // id → { bundled?: rec, device?: rec, … }（每个来源各一份；用 rev 高的）
const SOURCES = []; // 贴图来源（本机 IndexedDB …）
const LISTENERS = new Set();
let TABLE = null; // materials.js 的 MAT_BY_ID（bindMatTable）
let VERSION = 0;
let EPOCH = 0; // resetBoards 的次数

const cfg = () => CONFIG.boards || {};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (Number.isFinite(+v) ? +v : d);

// ───────────────────────────── 颜色小工具（纯函数） ─────────────────────────────

function hexRgb(hex) {
  const h = String(hex || '').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [128, 128, 128];
}
const toHex = (r, g, b) =>
  `#${[r, g, b]
    .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** sRGB hex → CIE L*（0–100） */
export function lightnessOf(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => lin(v / 255));
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y;
}

// ───────────────────────────── 记录 → 材质对象 ─────────────────────────────

/** 近似色木纹用哪种程序化木：记录的 proc（导入器从树种词表定的）→ 英文名里的树种 → 橡木 */
const PROC = [
  [/walnut|kasnan|castanea/i, 'walnut'],
  [/cherry/i, 'cherry'],
  [/teak/i, 'teak'],
  [/maple/i, 'maple'],
];
function procOf(rec) {
  if (['oak', 'maple', 'walnut', 'teak', 'cherry'].includes(rec.proc)) return rec.proc;
  const s = `${rec.name?.en || ''} ${rec.species || ''}`;
  for (const [re, p] of PROC) if (re.test(s)) return p;
  return 'oak';
}

/** 近似色（程序化）贴图的参数：加载中 / 离线 / 没有贴图 / 关掉照片时都用它（用板材自己量出来的颜色） */
export function twinTex(rec) {
  const base = String(rec.hex || '').toUpperCase(); // normRecord 已经保证是 #RRGGBB
  if (rec.kind === 'wood') {
    const [r, g, b] = hexRgb(base);
    const dark = /^#[0-9a-f]{6}$/i.test(rec.dark || '') ? rec.dark.toUpperCase() : toHex(r * 0.72, g * 0.7, b * 0.68);
    return { type: 'wood', base, grain: dark, species: procOf(rec) };
  }
  if (rec.kind === 'stone') return { type: 'concrete', base, fine: true };
  if (rec.kind === 'weave') return { type: 'linen', base };
  return { type: 'paint', base, smooth: true };
}

/** 这块板默认能用在哪里（记录没写 uses 时） */
export function defaultUses(kind) {
  if (kind === 'weave') return [];
  if (kind === 'stone') return ['feature'];
  return ['cabinetry', 'feature'];
}

/** 颜色号（2810、6162、P1）：客人认得的名字，可以进显示名；别的编号（XA-TP-01、AG337、GKL018Y…）是厂家编号，只给员工看 */
export const isColourCode = (code) => /^(\d{3,6}|P\d{1,2})$/.test(String(code || ''));

/** 显示名：「7号 · 黑胡桃」/「2810 · 墨绿」/ 名字（厂家编号永远不进显示名） */
export function boardLabel(rec) {
  if (rec.label?.zh) return { zh: rec.label.zh, en: rec.label.en || rec.label.zh };
  const nz = rec.name?.zh || rec.name?.en || '';
  const ne = rec.name?.en || rec.name?.zh || '';
  if (rec.seq != null && rec.seq !== '') return { zh: nz ? `${rec.seq}号 · ${nz}` : `${rec.seq}号`, en: ne ? `No. ${rec.seq} · ${ne}` : `No. ${rec.seq}` };
  const code = String(rec.code || '');
  if (isColourCode(code)) return { zh: nz ? `${code} · ${nz}` : code, en: ne ? `${code} · ${ne}` : code };
  return { zh: nz || rec.id, en: ne || rec.id };
}

/** 记录补齐默认值（坏的返回 null：id 不对、类别不认识、没有量出来的颜色） */
export function normRecord(rec) {
  if (!rec || typeof rec !== 'object' || !BOARD_ID_RE.test(String(rec.id || ''))) return null;
  const kind = BOARD_KINDS.includes(rec.kind) ? rec.kind : null;
  if (!kind) return null;
  const finish = FINISHES.includes(rec.finish) ? rec.finish : 'matte';
  if (!/^#[0-9a-f]{6}$/i.test(rec.hex || '')) return null; // 颜色是从板材的像素量出来的：没有就不是一条完整的记录
  const hex = rec.hex.toUpperCase();
  const Ls = lightnessOf(hex);
  const mm = Array.isArray(rec.mm) && rec.mm.length === 2 && rec.mm.every((v) => +v > 0) ? rec.mm.map(Number) : kind === 'wood' ? [1220, 2440] : [600, 600];
  const uses = (Array.isArray(rec.uses) ? rec.uses : defaultUses(kind)).filter((s) => BOARD_SLOTS.includes(s));
  return {
    ...rec,
    rev: Math.max(1, Math.round(num(rec.rev, 1))),
    kind,
    finish,
    hex,
    mm,
    uses: kind === 'weave' ? [] : uses,
    light: clamp(num(rec.light, -0.13 + (1.136 * Ls) / 100), 0, 1),
    warm: clamp(num(rec.warm, 0), -1, 1),
    mood: Array.isArray(rec.mood) && rec.mood.length === 3 ? rec.mood.map((v) => clamp(num(v, 0.4), 0, 1)) : [0.4, 0.5, 0.3],
    tags: Array.isArray(rec.tags) ? rec.tags.map(String) : [],
    tiers: rec.tiers && typeof rec.tiers === 'object' ? rec.tiers : {},
    fav: !!rec.fav,
    hidden: !!rec.hidden,
  };
}

/**
 * 记录 → 材质对象（和 materials.js 里的程序化材质同一个形状，多一个 board 块）。
 * board.chip 是 getter：本机板材包登记之后、或关掉照片（CONFIG.boards.photo = false）之后，拿到的就是新的。
 */
export function boardMat(rec0, { src = 'device' } = {}) {
  const rec = normRecord(rec0);
  if (!rec) return null;
  const { kind, finish } = rec;
  const label = boardLabel(rec);
  const rough = clamp(num(rec.rough, FINISH_ROUGH[finish]), 0.05, 1);
  const id = rec.id;
  const board = {
    id,
    rev: rec.rev,
    seq: rec.seq ?? null,
    code: rec.code || '',
    name: { zh: rec.name?.zh || '', en: rec.name?.en || rec.name?.zh || '' },
    series: rec.series || '',
    species: rec.species || '',
    grain: rec.grain ?? null,
    flags: Array.isArray(rec.flags) ? rec.flags : [],
    kind,
    finish,
    mm: rec.mm,
    tiers: rec.tiers,
    seam: rec.seam || null,
    uses: rec.uses,
    fav: rec.fav,
    hidden: rec.hidden,
    near: rec.near || '',
    tags: rec.tags,
    hash: rec.hash || '',
    v: typeof rec.v === 'string' ? rec.v : '',
    img: rec.img !== false,
    file: rec.file || '',
    at: rec.at || '',
    src,
    rec,
    get chip() {
      return chipURL(id);
    },
  };
  return {
    id,
    zh: label.zh,
    en: label.en,
    cat: kind === 'wood' ? 'wood' : kind === 'stone' ? 'stone' : 'paint',
    tex: twinTex(rec),
    rough,
    metal: 0,
    sheen: 0,
    clearcoat: finish === 'gloss' ? 0.6 : 0,
    ccRough: 0.08,
    color: rec.hex,
    mood: rec.mood,
    warm: rec.warm,
    light: rec.light,
    board,
  };
}

// ───────────────────────────── 登记表 ─────────────────────────────

function resolve(id) {
  const per = STORE.get(id);
  let best = null;
  for (const [src, rec] of Object.entries(per || {})) if (!best || rec.rev > best.rec.rev || (rec.rev === best.rec.rev && src === 'bundled')) best = { src, rec };
  const old = BOARD_BY_ID[id];
  if (!best) {
    delete BOARD_BY_ID[id];
    if (TABLE && TABLE[id]?.board) delete TABLE[id];
    return old ? 'removed' : null;
  }
  // 同一份资料再登记一次（开机、重新导入同一个包）：什么都不变，材质对象也不换
  if (old && old.board.src === best.src && (old.board.rec === best.rec || JSON.stringify(old.board.rec) === JSON.stringify(best.rec))) return null;
  const mat = boardMat(best.rec, { src: best.src });
  BOARD_BY_ID[id] = mat;
  if (TABLE) TABLE[id] = mat;
  return old ? 'updated' : 'added';
}

function rebuildList() {
  const list = Object.values(BOARD_BY_ID).sort((a, b) => {
    const A = a.board;
    const B = b.board;
    if (KIND_ORDER[A.kind] !== KIND_ORDER[B.kind]) return KIND_ORDER[A.kind] - KIND_ORDER[B.kind];
    const sa = A.seq ?? Infinity;
    const sb = B.seq ?? Infinity;
    if (sa !== sb) return sa - sb;
    return String(A.code || a.id).localeCompare(String(B.code || b.id));
  });
  BOARDS.length = 0;
  BOARDS.push(...list);
}

function emit() {
  VERSION++;
  for (const fn of [...LISTENERS]) {
    try {
      fn(VERSION);
    } catch {
      /* 一个监听器出错不影响别的 */
    }
  }
}

/** materials.js 用：登记的板材同时写进 MAT_BY_ID（只绑一次） */
export function bindMatTable(table) {
  TABLE = table;
  for (const [id, mat] of Object.entries(BOARD_BY_ID)) table[id] = mat;
}

/**
 * 登记一批板材记录（幂等）。同一个 id：rev 高的赢；rev 一样时随网站的那份赢（资料和贴图分开 —— 贴图见 addImageSource）。
 * @returns {{ added: string[], updated: string[], skipped: string[] }}
 */
export function registerBoards(records, { src = 'device' } = {}) {
  const out = { added: [], updated: [], skipped: [] };
  for (const r of Array.isArray(records) ? records : []) {
    const rec = normRecord(r);
    if (!rec) {
      out.skipped.push(String(r?.id ?? '?'));
      continue;
    }
    const per = STORE.get(rec.id) || {};
    per[src] = rec;
    STORE.set(rec.id, per);
    const how = resolve(rec.id);
    if (how === 'added') out.added.push(rec.id);
    else if (how === 'updated') out.updated.push(rec.id);
  }
  if (out.added.length || out.updated.length) {
    rebuildList();
    emit();
  }
  return out;
}

/** 拿掉某个来源的记录（员工在板材库里删一块本机板材）；别的来源还有就退回那一份 */
export function unregisterBoards(ids, { src = 'device' } = {}) {
  let n = 0;
  for (const id of ids || []) {
    const per = STORE.get(id);
    if (!per || !per[src]) continue;
    delete per[src];
    if (!Object.keys(per).length) STORE.delete(id);
    if (resolve(id)) n++;
  }
  if (n) {
    rebuildList();
    emit();
  }
  return n;
}

/**
 * 测试用：登记表回到「什么都没有」—— 每个来源（随网站的 bundled、这台设备的 device …）的记录、MAT_BY_ID 里的板材行、
 * 贴图来源全部拿掉（{ sources: false } = 贴图来源留着）。测试一开头调一次：合进真实板材之后测试照样是绿的
 * （测试自己编的板材一律用保留的前缀 TEST_ID_PREFIX，导入器永远不会给出这种 id）。
 * 之后再 await bundledBoards()（boards/bundled.js）会把随网站的那份重新登记。
 * @returns {number} 拿掉了几块
 */
export function resetBoards({ sources = true } = {}) {
  const ids = new Set([...STORE.keys(), ...Object.keys(BOARD_BY_ID)]);
  STORE.clear();
  for (const id of ids) {
    delete BOARD_BY_ID[id];
    if (TABLE && TABLE[id]?.board) delete TABLE[id];
  }
  if (sources) SOURCES.length = 0;
  EPOCH++;
  rebuildList();
  emit();
  return ids.size;
}
/** 每 resetBoards 一次 +1（boards/bundled.js 用它判断要不要重新登记随网站的那份） */
export const boardsEpoch = () => EPOCH;

/** id → 材质对象 | null */
export function boardOf(id) {
  return BOARD_BY_ID[id] || null;
}
export function isBoard(id) {
  return !!BOARD_BY_ID[id];
}
/** 板材变了（登记 / 删除 / 本机贴图来源登记）就通知；返回取消函数 */
export function onBoards(fn) {
  LISTENERS.add(fn);
  return () => LISTENERS.delete(fn);
}
/** 每变一次 +1（React 的依赖用） */
export function boardsVersion() {
  return VERSION;
}

/** 这块板能不能放到这个表面（slot = materials.js 的 SLOT_BY_ID[x]）：只有柜体 / 主题墙，按 uses；织系列哪里都不放 */
export function boardFits(mat, slot) {
  const b = mat?.board;
  if (!b || !slot) return false;
  return b.kind !== 'weave' && BOARD_SLOTS.includes(slot.id) && b.uses.includes(slot.id) && slot.cats.includes(mat.cat);
}

/** 能放到这个表面的板材（slotId 空 = 全部能上 3D 的）；hidden = true 连隐藏的一起 */
export function boardsFor(slotId, { hidden = false, slotById } = {}) {
  return BOARDS.filter((m) => (hidden || !m.board.hidden) && m.board.kind !== 'weave' && (!slotId || (m.board.uses.includes(slotId) && (!slotById || boardFits(m, slotById[slotId])))));
}

/** 点一下板材色块、又没选表面时去哪里（R1：柜体，不是木头默认的地板） */
export function boardDefaultSlot(mat) {
  const u = mat?.board?.uses || [];
  return u.includes('cabinetry') ? 'cabinetry' : u[0] || 'cabinetry';
}

// ───────────────────────────── 贴图来源 ─────────────────────────────

/**
 * 登记一个贴图来源（本机 IndexedDB 板材包）：
 *   { name: 'device', has(id, hash) → boolean（同步）, blob(id, tier) → Promise<Blob|null>, chip(id) → url|null（同步） }
 * has 要核对 hash：同一个 id、同一张图（dHash 一样）才算（R11 c：只有资料的网站记录不会把本机的贴图丢掉）。
 */
export function addImageSource(s) {
  if (!s || typeof s.has !== 'function' || typeof s.blob !== 'function') return () => {};
  SOURCES.push(s);
  emit();
  return () => {
    const i = SOURCES.indexOf(s);
    if (i >= 0) SOURCES.splice(i, 1);
    emit();
  };
}

/**
 * 网上的贴图网址（没有 base、或者这块板只有资料时 = null）。
 * 带 ?v=<这张图的版本>：public/boards/ 按「一年不变」缓存（vercel.json），换了新图（重新合并）网址就跟着变。
 * 版本 = 记录的 v（合并脚本按贴图文件的内容算的）→ 没有就用图的指纹（dHash）前 8 位。
 */
export function netURL(id, tier) {
  const b = BOARD_BY_ID[id]?.board;
  const base = cfg().base;
  if (!b || !b.img || !base) return null;
  const v = picVersion(b);
  return base + boardPath(id, tier) + (v ? `?v=${encodeURIComponent(v)}` : '');
}

/** 这张图的版本（网址的 ?v= 和引擎的贴图 key 用）：内容版本 v → dHash 前 8 位 → '' */
export function picVersion(b) {
  return String(b?.v || '').slice(0, 16) || String(b?.hash || '').slice(0, 8);
}

/** 贴图在 public/boards/ 里的相对路径（scripts/import-boards.mjs 写文件也用它，两边永远一致）：'<id>/<tier>.webp'，tier = 256 | 1024 | 'chip' */
export function boardPath(id, tier) {
  return `${id}/${tier}.webp`;
}

/**
 * 这块板的照片贴图从哪里拿：本机板材包优先，其次网上（CONFIG.boards.base）；都没有 / 关掉照片 = null（→ 近似色的程序化贴图）。
 * @returns {{ name: string, blob?: (tier) => Promise<Blob|null>, url?: (tier) => string } | null}
 */
export function photoSource(id) {
  const b = BOARD_BY_ID[id]?.board;
  if (!b || cfg().photo === false || b.kind === 'weave') return null;
  for (const s of SOURCES) {
    try {
      if (s.has(id, b.hash)) return { name: s.name || 'device', blob: (tier) => s.blob(id, tier) };
    } catch {
      /* 来源坏了就跳过 */
    }
  }
  if (netURL(id, 1024)) return { name: 'net', url: (tier) => netURL(id, tier) };
  return null;
}

/** 色卡图（真实板材的中间一块）：本机的 → 网上的 → null（null 时 textures.js 画近似色的色卡） */
export function chipURL(id) {
  const b = BOARD_BY_ID[id]?.board;
  if (!b || cfg().photo === false) return null;
  for (const s of SOURCES) {
    try {
      if (s.has(id, b.hash)) {
        const u = s.chip?.(id);
        if (u) return u;
      }
    } catch {
      /* 跳过 */
    }
  }
  return netURL(id, 'chip');
}

/**
 * 读一张板材贴图（tier = 256 | 1024 | 'chip'）：本机 → 网上（不是图片、404 被改写成首页的，都当没有）。拿不到 = null，不会抛错。
 * 设计师导出可以用它把 1024 的贴图放进文件包。
 */
export async function loadBoardImage(id, tier, { signal } = {}) {
  const src = photoSource(id);
  if (!src) return null;
  try {
    if (src.blob) return (await src.blob(tier)) || null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
    const res = await fetch(src.url(tier), { signal, credentials: 'same-origin' });
    if (!res.ok || !/^image\//.test(res.headers.get('content-type') || '')) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** 给设计师导出 / 简报用的一行资料（厂家编号也在里面 —— 只能用在员工 / 设计师的地方） */
export function boardInfo(id) {
  const m = BOARD_BY_ID[id];
  if (!m) return null;
  const b = m.board;
  return {
    id,
    label: { zh: m.zh, en: m.en },
    seq: b.seq,
    code: b.code,
    name: b.name,
    series: b.series,
    kind: b.kind,
    finish: b.finish,
    grain: b.grain,
    species: b.species,
    uses: b.uses,
    mm: b.mm,
    hex: m.color,
    near: b.near,
    chip: b.chip,
    url: (tier = 1024) => netURL(id, tier),
    load: (tier = 1024) => loadBoardImage(id, tier),
  };
}

// 3D 用的纯计算（photoUV / tierDims / texBytes …）在 src/studio/engine/boardUV.js：只有 3D 工作室用，不放进客人页面共用的这一块。
