// ============================================================
// KIRA 同步模型 —— 纯函数（不碰 React / Supabase），Node 测试直接跑（test/sync.test.mjs）
// QuoteApp 只负责：什么时候调用、把结果存进 localStorage / 推上云。
//
// 本机存储（每台设备 / 每个浏览器一份）：
//   kira.records.v1    { records, activeId }   离线也能开、能改
//   kira.pending.v1    [id]                    本机改了、还没成功上云
//   kira.pendingDel.v1 [id]                    本机删了、云端还没确认删掉（tombstone：有网重试，拉云端时滤掉）
//   kira.deleted.v1    { id: 删除时间 }         本机删过的 id（两个标签页（tab）互相合并时，不把对方删掉的带回来）
//   kira.cloudInit.v1  '1'                     本机模式做的报价已排队上云（每台设备只做一次）
//
// 规则：
//   1. 每条记录比 updatedAt：本机有待同步的改动、且比云端新 → 留本机并上传；
//      否则以云端为准，并把这条从待同步里拿掉（旧的离线改动不能盖掉同事更新的版本）。
//   2. 云端没有的记录：本机待同步 → 上传（新做的 / 本机模式做的）；没在待同步 → 别人已删 → 本机也删。
//   3. 不替别人上传：主人是别人、云端又没有的记录（共用设备上前一个人没传上去的）→ 不上传，等主人自己登录。
//   4. 本机删了、云端还没确认 → 拉云端 / 实时推送时都当它不存在，有网就重试删除。
// ============================================================

export const STORE_KEY = 'kira.records.v1';
export const PENDING_KEY = 'kira.pending.v1';
export const PENDING_DEL_KEY = 'kira.pendingDel.v1';
export const DELETED_KEY = 'kira.deleted.v1';
export const CLOUD_INIT_KEY = 'kira.cloudInit.v1';
// 退出登录时从这台设备清掉的（下一个账号看不到、也不会替前一个人上传）
export const DEVICE_KEYS = [STORE_KEY, PENDING_KEY, PENDING_DEL_KEY, DELETED_KEY];

export const updatedAtOf = (r) => (Number.isFinite(r?.updatedAt) ? r.updatedAt : 0);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const META_TEXT = ['name', 'phone', 'location', 'ref', 'pic', 'version', 'outputLang', 'date'];

// ---- 坏资料保护：不是对象 / 没有 id → 丢掉；meta / zones / looseItems 形状不对 → 补成安全值。
//      没问题的记录原样返回（同一个对象），方便比较有没有变。
import { cleanPlans } from '../../planner/plan.js';

export function cleanRecord(r) {
  if (!isObj(r) || typeof r.id !== 'string' || !r.id) return null;
  let out = r;
  const fix = (k, v) => { if (out === r) out = { ...r }; out[k] = v; };
  if (!isObj(r.meta)) fix('meta', {});
  else {
    let meta = r.meta;
    for (const k of META_TEXT) {
      if (k in r.meta && typeof r.meta[k] !== 'string') { if (meta === r.meta) meta = { ...r.meta }; meta[k] = str(r.meta[k]); }
    }
    if (meta !== r.meta) fix('meta', meta);
  }
  if (typeof r.groupId !== 'string' || !r.groupId) fix('groupId', r.id); // 旧记录没有 groupId → 各自成组
  if (!Array.isArray(r.zones)) fix('zones', []);
  else if (r.zones.some((z) => !isObj(z))) fix('zones', r.zones.filter(isObj));
  if (r.looseItems !== undefined && !Array.isArray(r.looseItems)) fix('looseItems', []);
  // 第三版：户型图（旧记录没有 = 当成 []，读的地方一律 r.plans || []；坏的才清洗，不改 schema 版本）
  if (r.plans !== undefined) {
    if (!Array.isArray(r.plans)) fix('plans', []);
    else if (r.plans.some((p) => !isObj(p) || typeof p.id !== 'string' || !isObj(p.image) || typeof p.image.path !== 'string')) fix('plans', cleanPlans(r.plans));
  }
  if (r.updatedAt !== undefined && !Number.isFinite(r.updatedAt)) fix('updatedAt', Number(r.updatedAt) || 0);
  return out;
}

// 一串记录：清洗 + 按 id 去重（同 id 留较新的）
export function cleanRecords(list) {
  const byId = new Map();
  for (const r0 of Array.isArray(list) ? list : []) {
    const r = cleanRecord(r0);
    if (!r) continue;
    const prev = byId.get(r.id);
    if (!prev || updatedAtOf(r) > updatedAtOf(prev)) byId.set(r.id, r);
  }
  return [...byId.values()];
}

export function cleanStore(s) {
  const records = cleanRecords(s?.records);
  const activeId = typeof s?.activeId === 'string' && records.some((r) => r.id === s.activeId) ? s.activeId : null;
  return { records, activeId };
}

export const newestId = (records) => {
  let best = null;
  for (const r of records) if (!best || updatedAtOf(r) > updatedAtOf(best)) best = r;
  return best?.id || null;
};
const keepActive = (records, activeId) => (activeId && records.some((r) => r.id === activeId) ? activeId : newestId(records));

// 可以用「我」的身份上传吗？云端已有 → 只是更新（owner_id 由数据库锁住，同事本来就能改）；
// 云端没有 → 等于新建，owner 会变成上传的人 → 只上传自己的、或本机模式做的（没有主人）
export const canUpload = (r, userId, cloudIds) =>
  !!userId && !!r && (!r.ownerId || r.ownerId === userId || !!cloudIds?.has(r.id));

// 本机模式 → 云端：第一次开云端时，本机已有、没有主人（从没上过云）的记录都要排队上传
export const localOnlyIds = (records) => (records || []).filter((r) => r && r.id && !r.ownerId).map((r) => r.id);

// ---- 拉云端后合并（只算，不改任何东西）
//   返回 store：新的本机资料；push：要上传的记录；settle：从待同步里拿掉的 id；
//   confirmDel：云端已确认删掉的 tombstone；retryDel：还在云端、要重试删除的；dropped：别人删掉、本机跟着删的
export function mergePull({ local, cloud, pending, pendingDel = new Set(), userId = null }) {
  const localRecs = local?.records || [];
  const localById = new Map(localRecs.map((r) => [r.id, r]));
  const cloudIds = new Set();
  const fromCloud = [];
  const push = [];
  const settle = [];
  const retryDel = [];
  for (const c of cleanRecords(cloud)) {
    cloudIds.add(c.id);
    if (pendingDel.has(c.id)) { retryDel.push(c.id); continue; }
    const l = localById.get(c.id);
    const isPending = pending.has(c.id);
    if (l && isPending && updatedAtOf(l) > updatedAtOf(c)) {
      const rec = l.ownerId === (c.ownerId || l.ownerId) ? l : { ...l, ownerId: c.ownerId || l.ownerId || null };
      fromCloud.push(rec);
      push.push(rec);
    } else {
      // 云端为准；内容相同（同一个 updatedAt、同一个主人）就沿用本机那份对象，少重画
      fromCloud.push(l && updatedAtOf(l) === updatedAtOf(c) && (l.ownerId || null) === (c.ownerId || null) ? l : c);
      if (isPending) settle.push(c.id);
    }
  }
  const confirmDel = [...pendingDel].filter((id) => !cloudIds.has(id));
  const localOnly = [];
  const dropped = [];
  for (const r of localRecs) {
    if (cloudIds.has(r.id) || pendingDel.has(r.id)) continue;
    if (pending.has(r.id)) {
      localOnly.push(r);
      if (canUpload(r, userId, cloudIds)) push.push(r);
    } else dropped.push(r.id);
  }
  for (const id of pending) if (!localById.has(id)) settle.push(id);
  const records = [...localOnly, ...fromCloud];
  return { store: { records, activeId: keepActive(records, local?.activeId) }, push, settle, confirmDel, retryDel, dropped, cloudIds };
}

// ---- 实时推送（别人改了 / 删了一行）
export function applyRealtime(store, ev, { pending = new Set(), pendingDel = new Set() } = {}) {
  const none = { store, settle: [] };
  if (!ev) return none;
  if (ev.type === 'delete') {
    const settle = pending.has(ev.id) ? [ev.id] : [];
    if (!store.records.some((r) => r.id === ev.id)) return { store, settle };
    const records = store.records.filter((r) => r.id !== ev.id);
    return { store: { records, activeId: store.activeId === ev.id ? newestId(records) : store.activeId }, settle };
  }
  const c = cleanRecord(ev.record);
  if (!c || pendingDel.has(c.id)) return none; // 本机已删、云端删除还在排队 → 不让它回来
  const i = store.records.findIndex((r) => r.id === c.id);
  if (i < 0) return { store: { ...store, records: [c, ...store.records] }, settle: [] };
  const l = store.records[i];
  if (pending.has(c.id) && updatedAtOf(l) > updatedAtOf(c)) {
    // 本机正在改、而且更新 → 留本机（只补上云端的主人）
    if (l.ownerId || !c.ownerId) return none;
    const records = [...store.records];
    records[i] = { ...l, ownerId: c.ownerId };
    return { store: { ...store, records }, settle: [] };
  }
  if (updatedAtOf(l) === updatedAtOf(c) && (l.ownerId || null) === (c.ownerId || null)) return { store, settle: pending.has(c.id) ? [c.id] : [] };
  const records = [...store.records];
  records[i] = c;
  return { store: { ...store, records }, settle: pending.has(c.id) ? [c.id] : [] };
}

// ---- 两个标签页（tab）：别的标签页写了 kira.records.v1 → 按 id 合并，同 id 留较新的；对方 / 自己删过的不带回来。
//      没变就返回原来的 mine（不触发重画 / 重写，避免两个标签页来回写）
export function mergeTabs(mine, theirs, deleted = {}) {
  const gone = (id) => Object.prototype.hasOwnProperty.call(deleted, id);
  const byId = new Map();
  for (const r of mine.records) if (!gone(r.id)) byId.set(r.id, r);
  for (const t of cleanRecords(theirs?.records)) {
    if (gone(t.id)) continue;
    const m = byId.get(t.id);
    if (!m || updatedAtOf(t) > updatedAtOf(m)) byId.set(t.id, t);
  }
  const records = [...byId.values()];
  if (records.length === mine.records.length && records.every((r, i) => r === mine.records[i])) return mine;
  return { records, activeId: keepActive(records, mine.activeId) };
}

// 从 store 里拿掉一批 id（别的标签页删的）
export function dropIds(store, ids) {
  const set = new Set(ids);
  if (!store.records.some((r) => set.has(r.id))) return store;
  const records = store.records.filter((r) => !set.has(r.id));
  return { records, activeId: set.has(store.activeId) ? newestId(records) : store.activeId };
}

// ---- 删除记录（本机删过的 id → 时间）；只留最近 30 天、最多 500 条
const DELETED_MAX = 500;
const DELETED_DAYS = 30;
export function addDeleted(log, ids, now = Date.now()) {
  const next = { ...log };
  ids.forEach((id) => { next[id] = now; });
  return pruneDeleted(next, now);
}
export function pruneDeleted(log, now = Date.now()) {
  const cutoff = now - DELETED_DAYS * 864e5;
  const entries = Object.entries(log || {}).filter(([id, t]) => id && Number.isFinite(t) && t >= cutoff);
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, DELETED_MAX));
}
export function unionDeleted(a, b) {
  const out = { ...a };
  for (const [id, t] of Object.entries(b || {})) if (Number.isFinite(t) && !(out[id] >= t)) out[id] = t;
  return out;
}

// ---- 读写小工具（storage 可以是 localStorage 或测试用的假对象；出错一律不抛）
export const readJSON = (storage, key, fallback) => {
  try { const raw = storage?.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
};
export const readSet = (storage, key) => {
  const v = readJSON(storage, key, []);
  return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
};
export const readDeleted = (storage) => {
  const v = readJSON(storage, DELETED_KEY, {});
  return pruneDeleted(isObj(v) ? v : {});
};
export const writeJSON = (storage, key, value) => {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
};
export const writeSet = (storage, key, set) => writeJSON(storage, key, [...set]);
export const clearDevice = (storage) => {
  DEVICE_KEYS.forEach((k) => { try { storage?.removeItem(k); } catch (e) { /* ignore */ } });
};

// ---- 开 app 时读本机：资料（清洗过坏资料）+ 待同步 / 待删除 / 删除记录。
//      云端模式第一次打开（这台设备以前是本机模式）→ 本机模式做的报价（没有主人）全部排队上传，
//      不会被第一次拉云端冲掉；上传的人就是主人。标记 kira.cloudInit.v1，每台设备只做一次。
export function bootDevice(storage, { cloud = false } = {}) {
  const store = cleanStore(readJSON(storage, STORE_KEY, null) || {});
  const pending = readSet(storage, PENDING_KEY);
  if (cloud && storage && !readJSON(storage, CLOUD_INIT_KEY, null)) {
    localOnlyIds(store.records).forEach((id) => pending.add(id));
    if (writeSet(storage, PENDING_KEY, pending)) writeJSON(storage, CLOUD_INIT_KEY, 1);
  }
  return { store, pending, pendingDel: readSet(storage, PENDING_DEL_KEY), deleted: readDeleted(storage) };
}

// ---- 写本机资料。整份写不下（超出浏览器容量 ~5 MB）→ 先保住「待同步 + 正在看的」，
//      其余按最近更新排，能放多少放多少；结果交给界面显示（不再默默失败）。
//   返回 { status: 'ok' | 'trimmed' | 'failed', kept, total }
let fitHint = Infinity; // 上次写得下的条数（下次先试它，免得每次都试很多遍）
// canDrop(id)：只有确定已在云端（且不待同步）的报价才可以不存本机；纯本机模式下一份都不能丢 → 写不下就 'failed'、留着上一份
export function persistStore(storage, store, keepIds = new Set(), canDrop = () => true) {
  const total = store.records.length;
  if (!storage) return { status: 'failed', kept: 0, total };
  try {
    storage.setItem(STORE_KEY, JSON.stringify(store));
    fitHint = Infinity;
    return { status: 'ok', kept: total, total };
  } catch (e) { /* 多半是 QuotaExceededError → 下面只存一部分 */ }
  const must = [];
  const rest = [];
  for (const r of store.records) (keepIds.has(r.id) || r.id === store.activeId || !canDrop(r.id) ? must : rest).push(r);
  rest.sort((a, b) => updatedAtOf(b) - updatedAtOf(a));
  const mustJSON = must.map((r) => JSON.stringify(r));
  const restJSON = rest.map((r) => JSON.stringify(r));
  const tail = `],"activeId":${JSON.stringify(store.activeId ?? null)}}`;
  const tryN = (n) => {
    try { storage.setItem(STORE_KEY, '{"records":[' + mustJSON.concat(restJSON.slice(0, n)).join(',') + tail); return true; } catch (e) { return false; }
  };
  // 上次写得下的条数先试一次（打字时每次都要写，别每次都从头试）
  if (fitHint < rest.length && tryN(fitHint)) return { status: 'trimmed', kept: must.length + fitHint, total };
  if (!tryN(0)) return { status: 'failed', kept: 0, total }; // 连待同步的都放不下（本机留着上一份）
  let lo = 0; // 写得下（storage 里现在就是这一份）
  let hi = Math.min(rest.length, fitHint) - 1; // 再多就放不下
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (tryN(mid)) lo = mid; else hi = mid - 1;
  }
  fitHint = lo;
  return { status: 'trimmed', kept: must.length + lo, total };
}
export const _resetFitHint = () => { fitHint = Infinity; };

// ---- 分页读完整张表：Supabase「Max rows」默认 1000，一次最多回这么多、多的会被悄悄截掉 → 用 .range() 一页一页拿，
//      直到拿到短页 / 空页（有 count 时读满 count 为止；Max rows 设得比一页小也不会提早停）。makeQuery() 每次回一个新查询。
export const PAGE_ROWS = 1000;
export async function selectAll(makeQuery, page = PAGE_ROWS, maxPages = 500) {
  const out = [];
  for (let from = 0, n = 0; n < maxPages; n += 1) {
    const { data, error, count } = await makeQuery().range(from, from + page - 1);
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    from += rows.length;
    if (!rows.length || (Number.isFinite(count) ? from >= count : rows.length < page)) return out;
  }
  return out;
}
