// 溪岸板材 · 这台设备上的板材（IndexedDB 'genie-boards'；Node 里用内存）。
//   boards  id → 板材记录（员工在办公室电脑「存到这台电脑」的，或者展厅 iPad「导入板材包」的）
//   images  'sail-7/1024' · 'sail-7/256' · 'sail-7/chip' → WebP Blob（顺纹竖放）
//   cache   导入器的分析结果（键 = 文件名 + 大小 + 修改时间的指纹，不存路径）· '#ids' = 这台设备用过的全部 id（删了也不重用，R8）
//
// boardsReady()：把这台设备的板材登记进材质库（registerBoards src:'device'）+ 登记贴图来源（addImageSource），
// 同时把随网站发布的那份（boards/bundled.js，单独一块，用到才下载）登记好 —— 用板材的页面等它一个就够。
// 3D 工作室 / 案例库开始时等它（只有引用的板材不在 MAT_BY_ID 里时才需要等，R11 f）。只在这台设备上，不经过任何服务器。

import { registerBoards, unregisterBoards, addImageSource, boardsEpoch } from './library-api.js';
import { bundledBoards } from './bundled.js';
import { readPack, buildPacks, imageKey, newer, cleanRecord, IMAGE_TIERS } from './pack.js';

const DB = 'genie-boards';
const STORES = ['boards', 'images', 'cache'];
const IDS_KEY = '#ids';

// ───────────────────────── 仓库（IndexedDB / 内存） ─────────────────────────

const mem = { boards: new Map(), images: new Map(), cache: new Map() };
let dbp = null;
const hasIDB = () => typeof indexedDB !== 'undefined';

function open() {
  if (!hasIDB()) return Promise.resolve(null);
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    let req;
    try {
      req = indexedDB.open(DB, 1);
    } catch {
      res(null);
      return;
    }
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => res(null);
    req.onblocked = () => res(null);
  });
  return dbp;
}

async function getAll(store) {
  const db = await open();
  if (!db) return new Map(mem[store]);
  return new Promise((res) => {
    const out = new Map();
    const t = db.transaction(store, 'readonly');
    const os = t.objectStore(store);
    const rk = os.getAllKeys();
    const rv = os.getAll();
    t.oncomplete = () => {
      const ks = rk.result || [];
      const vs = rv.result || [];
      for (let i = 0; i < ks.length; i++) out.set(ks[i], vs[i]);
      res(out);
    };
    t.onerror = () => res(out);
    t.onabort = () => res(out);
  });
}

async function getMany(store, keys) {
  const db = await open();
  const out = new Map();
  if (!db) {
    for (const k of keys) if (mem[store].has(k)) out.set(k, mem[store].get(k));
    return out;
  }
  if (!keys.length) return out;
  return new Promise((res) => {
    const t = db.transaction(store, 'readonly');
    const os = t.objectStore(store);
    for (const k of keys) {
      const r = os.get(k);
      r.onsuccess = () => {
        if (r.result !== undefined) out.set(k, r.result);
      };
    }
    t.oncomplete = () => res(out);
    t.onerror = () => res(out);
    t.onabort = () => res(out);
  });
}

async function putMany(store, entries) {
  if (!entries.length) return;
  const db = await open();
  if (!db) {
    for (const [k, v] of entries) mem[store].set(k, v);
    return;
  }
  await new Promise((res) => {
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    for (const [k, v] of entries) os.put(v, k);
    t.oncomplete = res;
    t.onerror = res;
    t.onabort = res;
  });
}

async function delMany(store, keys) {
  if (!keys.length) return;
  const db = await open();
  if (!db) {
    for (const k of keys) mem[store].delete(k);
    return;
  }
  await new Promise((res) => {
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    for (const k of keys) os.delete(k);
    t.oncomplete = res;
    t.onerror = res;
    t.onabort = res;
  });
}

// ───────────────────────── 贴图来源（给 3D / 色卡用；同步查） ─────────────────────────

const HAS = new Map(); // id → dHash（这台设备有这块板的贴图）
const CHIPS = new Map(); // id → object URL（色卡，开机读一次；很小）
let unSource = null;
let srcEpoch = -1; // resetBoards（测试）会清掉全部贴图来源 → 下次要重新登记

const toBlob = (v) => (v instanceof Blob ? v : v ? new Blob([v], { type: 'image/webp' }) : null);

function setChip(id, blob) {
  const old = CHIPS.get(id);
  if (old && typeof URL !== 'undefined') URL.revokeObjectURL(old);
  CHIPS.delete(id);
  if (blob && typeof URL !== 'undefined' && URL.createObjectURL) CHIPS.set(id, URL.createObjectURL(toBlob(blob)));
}

const SOURCE = {
  name: 'device',
  has: (id, hash) => HAS.has(id) && (!hash || !HAS.get(id) || HAS.get(id) === hash),
  blob: async (id, tier) => toBlob((await getMany('images', [imageKey(id, tier)])).get(imageKey(id, tier))),
  chip: (id) => CHIPS.get(id) || null,
};

function ensureSource() {
  if (unSource && srcEpoch === boardsEpoch()) return;
  unSource?.();
  unSource = addImageSource(SOURCE);
  srcEpoch = boardsEpoch();
}

// ───────────────────────── 开机：登记这台设备的板材 ─────────────────────────

let readyP = null;
let readyEpoch = -1;

/**
 * 这台设备的板材 + 随网站的板材都登记好了（读 IndexedDB、下载 library.js 那一块，两个一起；第一次之后直接给同一个 Promise）
 * → { count }（这台设备的块数）。不会 reject。
 */
export function boardsReady() {
  if (readyP && readyEpoch === boardsEpoch()) return readyP;
  readyEpoch = boardsEpoch();
  readyP = Promise.all([bundledBoards(), readDevice()]).then(([, dev]) => dev);
  return readyP;
}

function readDevice() {
  return (async () => {
    try {
      const recs = [...(await getAll('boards')).values()].filter((r) => r && r.id);
      const imgKeys = await imageKeys();
      for (const r of recs) if (imgKeys.has(imageKey(r.id, '1024')) || imgKeys.has(imageKey(r.id, '256'))) HAS.set(r.id, r.hash || '');
      const chips = await getMany(
        'images',
        recs.filter((r) => imgKeys.has(imageKey(r.id, 'chip'))).map((r) => imageKey(r.id, 'chip'))
      );
      for (const [k, b] of chips) setChip(k.split('/')[0], b);
      ensureSource();
      if (recs.length) registerBoards(recs, { src: 'device' });
      return { count: recs.length };
    } catch {
      ensureSource();
      return { count: 0 };
    }
  })();
}

async function imageKeys() {
  const db = await open();
  if (!db) return new Set(mem.images.keys());
  return new Promise((res) => {
    const t = db.transaction('images', 'readonly');
    const r = t.objectStore('images').getAllKeys();
    t.oncomplete = () => res(new Set(r.result || []));
    t.onerror = () => res(new Set());
    t.onabort = () => res(new Set());
  });
}

// ───────────────────────── 读 / 存 / 删 ─────────────────────────

/** 这台设备上的全部板材记录 */
export async function deviceRecords() {
  return [...(await getAll('boards')).values()].filter((r) => r && r.id);
}

/** 一张贴图（tier = 256 | 1024 | 'chip'）→ Blob | null */
export async function deviceImage(id, tier) {
  return toBlob((await getMany('images', [imageKey(id, tier)])).get(imageKey(id, tier)));
}

/** 这台设备用过的全部 id（删掉的也算：id 不重用，R8） */
export async function knownIds() {
  const recs = await getAll('boards');
  const ids = (await getMany('cache', [IDS_KEY])).get(IDS_KEY) || [];
  return new Set([...recs.keys(), ...ids]);
}

async function rememberIds(ids) {
  const cur = new Set((await getMany('cache', [IDS_KEY])).get(IDS_KEY) || []);
  let changed = false;
  for (const id of ids)
    if (!cur.has(id)) {
      cur.add(id);
      changed = true;
    }
  if (changed) await putMany('cache', [[IDS_KEY, [...cur]]]);
}

/**
 * 存到这台设备：记录 + 贴图（Map 'id/tier' → Blob | Uint8Array）。存完马上登记进材质库（这台设备的 3D 立刻看得到）。
 * 只换给了的贴图；没给贴图的板保留原来的。
 */
export async function saveDeviceBoards(records, images = new Map()) {
  const recs = records.map(cleanRecord);
  await putMany('images', [...images].map(([k, v]) => [k, toBlob(v)]));
  await putMany('boards', recs.map((r) => [r.id, r]));
  await rememberIds(recs.map((r) => r.id));
  const keys = await imageKeys();
  for (const r of recs) {
    if (keys.has(imageKey(r.id, '1024')) || keys.has(imageKey(r.id, '256'))) HAS.set(r.id, r.hash || '');
    const chip = images.get(imageKey(r.id, 'chip'));
    if (chip) setChip(r.id, chip);
  }
  ensureSource();
  registerBoards(recs, { src: 'device' });
  return { saved: recs.length };
}

/** 改一块板的资料（星标、名字、序号…）：rev + 1，存起来，重新登记 */
export async function updateDeviceBoard(id, patch) {
  const cur = (await getMany('boards', [id])).get(id);
  if (!cur) return null;
  const next = cleanRecord({ ...cur, ...patch, id, rev: (cur.rev || 1) + 1 });
  await putMany('boards', [[id, next]]);
  registerBoards([next], { src: 'device' });
  return next;
}

/** 从这台设备删掉（记录 + 贴图）；随网站发布的同一块板（如果有）会重新顶上。id 记住，不会再给别的板用 */
export async function deleteDeviceBoards(ids) {
  await rememberIds(ids);
  await delMany('boards', ids);
  await delMany('images', ids.flatMap((id) => IMAGE_TIERS.map((t) => imageKey(id, t))));
  for (const id of ids) {
    HAS.delete(id);
    setChip(id, null);
  }
  unregisterBoards(ids, { src: 'device' });
  return { deleted: ids.length };
}

// ───────────────────────── 导入器的分析缓存 ─────────────────────────

/** 文件的指纹（文件名 + 大小 + 修改时间；不带路径） */
export const fileKey = (f) => `f:${String(f.name || '').normalize('NFC')}|${f.size | 0}|${f.lastModified ?? f.mtime ?? 0}`;
export const cacheGet = async (keys) => getMany('cache', keys);
export const cachePut = async (entries) => putMany('cache', entries);
export async function cacheClear() {
  const all = await getAll('cache');
  await delMany(
    'cache',
    [...all.keys()].filter((k) => k !== IDS_KEY)
  );
}

// ───────────────────────── 板材包：导入（iPad）/ 导出（办公室电脑） ─────────────────────────

const bytesOf = async (v) => (v instanceof Uint8Array ? v : v instanceof Blob ? new Uint8Array(await v.arrayBuffer()) : v ? new Uint8Array(v) : null);

/**
 * 导入一份或几份板材包（File / 文字）。rev 高的赢；一样的跳过。图和资料分开：只有资料的包不会把这台设备的图丢掉（R11 c）。
 * @returns {{ added, updated, skipped, rejected: [{ id, zh }], errors: [{ zh }], parts: [{ name, part, parts, packId }] }}
 */
export async function importPacks(files) {
  const sum = { added: 0, updated: 0, skipped: 0, rejected: [], errors: [], warnings: [], parts: [] };
  const existing = new Map((await deviceRecords()).map((r) => [r.id, r]));
  for (const f of files) {
    const text = typeof f === 'string' ? f : await f.text();
    const p = readPack(text);
    sum.parts.push({ name: f.name || '', part: p.part, parts: p.parts, packId: p.packId });
    sum.errors.push(...p.errors);
    sum.rejected.push(...p.rejected);
    sum.warnings.push(...p.warnings);
    const recs = [];
    const imgs = new Map();
    for (const r of p.boards) {
      const cur = existing.get(r.id);
      if (!newer(r, cur)) {
        sum.skipped++;
        continue;
      }
      if (cur) sum.updated++;
      else sum.added++;
      recs.push(r);
      existing.set(r.id, r);
      for (const t of IMAGE_TIERS) {
        const im = p.images.get(imageKey(r.id, t));
        if (im) imgs.set(imageKey(r.id, t), new Blob([im.bytes], { type: im.mime }));
      }
    }
    if (recs.length) await saveDeviceBoards(recs, imgs);
  }
  return sum;
}

/**
 * 导出板材包（这台设备上的板；ids 不给 = 全部）→ [{ name, blob, ids, bytes }]，每份 ≤ 20 MB。
 */
export async function exportPacks({ ids = null, max, date = new Date() } = {}) {
  const recs = (await deviceRecords()).filter((r) => !ids || ids.includes(r.id));
  const keys = recs.flatMap((r) => IMAGE_TIERS.map((t) => imageKey(r.id, t)));
  const got = await getMany('images', keys);
  const images = new Map();
  for (const [k, v] of got) images.set(k, await bytesOf(v));
  const parts = buildPacks({ records: recs, images, max, date });
  return parts.map((p) => ({ name: p.name, ids: p.ids, bytes: p.bytes, oversize: p.oversize, blob: new Blob([p.text], { type: 'application/json' }) }));
}

/** 测试用：清掉内存里的资料 */
export function _resetDevice() {
  for (const s of STORES) mem[s].clear();
  for (const id of [...CHIPS.keys()]) setChip(id, null);
  HAS.clear();
  readyP = null;
  unSource?.();
  unSource = null;
}
