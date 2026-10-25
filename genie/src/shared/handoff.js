// 户型图交接（许愿之旅 → 3D 工作室，同一台设备）：客人在 P 屏拍 / 选的户型图、读出来的平面图，存在这台设备的 IndexedDB
// 'genie-handoff' v1 —— store 'plans'（profileId → { v:1, plan, underlays, source, confidence, at }）、store 'files'（profileId → 原图）。
// 和 'genie-studio' 是两个数据库：工作室的数据库不用升版本，还开着的旧分页不受影响。
// 超过 CONFIG.keepDays 天的记录，每次打开时删掉（PDPA：不需要了就删；0 = 不删）。
// 链接里放不下原图：compactPlan() 把平面图压成只有房间 / 门窗 / 楼梯的小对象（0.01 m），超过 6,000 字就不放（null）。
// Node（测试）里没有 indexedDB：自动退回到内存里的 Map，接口一样。

import { CONFIG } from './config.js';

const DB = 'genie-handoff';
const VER = 1;
const STORES = ['plans', 'files'];
export const INLINE_MAX = 6000;

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const now = () => Date.now();
const fresh = (rec, at = now(), days = CONFIG.keepDays) => {
  if (!rec) return false;
  if (!(days > 0)) return true;
  const t = Date.parse(rec.at || '');
  return !Number.isFinite(t) || at - t <= days * 86400000;
};

// ───────────────────────── 存储（IndexedDB / 内存） ─────────────────────────

const mem = { plans: new Map(), files: new Map() };
let dbp = null;
let swept = false;

function hasIDB() {
  try {
    return typeof indexedDB !== 'undefined' && !!indexedDB;
  } catch {
    return false;
  }
}

function open() {
  if (!hasIDB()) return Promise.resolve(null);
  if (!dbp) {
    dbp = new Promise((res) => {
      try {
        const r = indexedDB.open(DB, VER);
        r.onupgradeneeded = () => {
          for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s);
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
        r.onblocked = () => res(null);
      } catch {
        res(null);
      }
    }).then(async (d) => {
      if (d && !swept) {
        swept = true;
        await sweep(d).catch(() => {});
      }
      return d;
    });
  }
  return dbp;
}

function tx(d, store, mode, fn) {
  return new Promise((res) => {
    try {
      const t = d.transaction(store, mode);
      const r = fn(t.objectStore(store));
      let out = null;
      if (r) r.onsuccess = () => (out = r.result ?? null);
      t.oncomplete = () => res(out);
      t.onerror = () => res(null);
      t.onabort = () => res(null);
    } catch {
      res(null);
    }
  });
}

async function get(store, key) {
  const d = await open();
  if (!d) return mem[store].get(key) ?? null;
  return tx(d, store, 'readonly', (s) => s.get(key));
}

async function put(store, key, val) {
  const d = await open();
  if (!d) {
    if (val == null) mem[store].delete(key);
    else mem[store].set(key, val);
    return true;
  }
  await tx(d, store, 'readwrite', (s) => (val == null ? s.delete(key) : s.put(val, key)));
  return true;
}

/** 删掉过期的（打开数据库时做一次） */
async function sweep(d) {
  const at = now();
  for (const store of STORES) {
    await new Promise((res) => {
      try {
        const t = d.transaction(store, 'readwrite');
        const c = t.objectStore(store).openCursor();
        c.onsuccess = () => {
          const cur = c.result;
          if (!cur) return;
          if (!fresh(cur.value, at)) cur.delete();
          cur.continue();
        };
        t.oncomplete = res;
        t.onerror = res;
        t.onabort = res;
      } catch {
        res();
      }
    });
  }
}

/** 测试用：清空内存里的记录、重新跑过期清理 */
export function _resetHandoff() {
  mem.plans.clear();
  mem.files.clear();
  swept = false;
  dbp = null;
}

// ───────────────────────── 平面图 ─────────────────────────

/** 存读好的平面图（R 屏「对，就是它」）：{ plan: v2, underlays: { floorId: { src, x, y, w, h, … } }, source, confidence } */
export async function putHomePlan(profileId, { plan, underlays = null, source = null, confidence = null } = {}) {
  if (!profileId || !isObj(plan)) return false;
  const rec = { v: 1, plan, underlays: isObj(underlays) ? underlays : null, source: source || null, confidence: Number.isFinite(confidence) ? confidence : null, at: new Date().toISOString() };
  try {
    return await put('plans', String(profileId), rec);
  } catch {
    return false;
  }
}

/** 这台设备上存着的平面图（过期 / 没有 → null） */
export async function getHomePlan(profileId) {
  if (!profileId) return null;
  try {
    const rec = await get('plans', String(profileId));
    if (!isObj(rec) || !isObj(rec.plan)) return null;
    if (!fresh(rec)) {
      await put('plans', String(profileId), null);
      return null;
    }
    return rec;
  } catch {
    return null;
  }
}

/** 平面图 + 原图一起删掉 */
export async function dropHomePlan(profileId) {
  if (!profileId) return;
  try {
    await put('plans', String(profileId), null);
    await put('files', String(profileId), null);
  } catch {
    /* ignore */
  }
}

/** 存客人拍 / 选的原图（读不清时也留着给设计师） */
export async function putPlanFile(profileId, blob) {
  if (!profileId || !blob) return false;
  try {
    return await put('files', String(profileId), { v: 1, blob, type: blob.type || '', name: blob.name || '', at: new Date().toISOString() });
  } catch {
    return false;
  }
}

export async function getPlanFile(profileId) {
  if (!profileId) return null;
  try {
    const rec = await get('files', String(profileId));
    if (!rec) return null;
    if (!fresh(rec)) {
      await put('files', String(profileId), null);
      return null;
    }
    return rec.blob || null;
  } catch {
    return null;
  }
}

// ───────────────────────── 链接里的小平面图 ─────────────────────────

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * 平面图（v2）→ 链接里放得下的小对象：只有楼层（天花高）、房间（类型 / 位置 / 大小）、门窗、楼梯；坐标 0.01 m。
 * 房间名字、底图、元数据都不放。JSON 超过 6,000 字 → null（链接太长，就只靠这台设备的 IndexedDB）。
 */
export function compactPlan(plan) {
  if (!isObj(plan) || !Array.isArray(plan.floors) || !plan.floors.length) return null;
  const out = {
    v: 2,
    n: r2(plan.north || 0),
    f: plan.floors.map((f) => {
      const one = {
        i: String(f.id),
        c: r2(f.ceil ?? 2.8),
        r: (f.rooms || []).filter(isObj).map((r) => {
          const x = [String(r.id), String(r.type || 'living'), r2(r.x), r2(r.y), r2(r.w), r2(r.d)];
          if (r.stairId) x.push(String(r.stairId));
          return x;
        }),
        o: (f.openings || []).filter(isObj).map((o) => {
          const x = [String(o.kind || 'door'), r2(o.x1), r2(o.y1), r2(o.x2), r2(o.y2)];
          if (o.sill != null) x.push(r2(o.sill));
          return x;
        }),
      };
      if (f.height != null) one.h = r2(f.height);
      return one;
    }),
  };
  const st = (plan.stairs || []).filter(isObj).map((s) => ({ id: s.id, from: s.from, to: s.to ?? null, x: r2(s.x), y: r2(s.y), w: r2(s.w), d: r2(s.d), shape: s.shape, up: s.up, ...(s.turn ? { turn: s.turn } : {}), ...(s.width != null ? { width: r2(s.width) } : {}) }));
  if (st.length) out.s = st;
  return JSON.stringify(out).length > INLINE_MAX ? null : out;
}

/** compactPlan() 的反过来：→ plan v2（再交给 migratePlan 规范化） */
export function expandPlan(c) {
  if (!isObj(c) || !Array.isArray(c.f) || !c.f.length) return null;
  let k = 0;
  return {
    v: 2,
    name: '',
    north: Number(c.n) || 0,
    floors: c.f.map((f, i) => ({
      id: String(f.i || `f${i}`),
      level: i,
      name: '',
      ceil: Number(f.c) || 2.8,
      ...(f.h != null ? { height: Number(f.h) } : {}),
      rooms: (f.r || []).map(([id, type, x, y, w, d, stairId]) => ({ id: String(id), type, name: '', x, y, w, d, ...(stairId ? { stairId } : {}) })),
      openings: (f.o || []).map(([kind, x1, y1, x2, y2, sill]) => ({ id: `o${++k}`, kind, x1, y1, x2, y2, ...(sill != null ? { sill } : {}) })),
    })),
    stairs: Array.isArray(c.s) ? c.s.map((s) => ({ ...s })) : [],
  };
}
