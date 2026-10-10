// 撤销 / 重做历史（纯函数，Node 可测）
//   past   ：之前的项目快照（不可变数据，结构共享，60 份也很省内存）
//   future ：撤销后可重做的快照
//   sig/ts ：上一次改动的「签名」与时间 —— 连续打字（同一字段、纯插入 / 删除）合并成一步

export const HISTORY_LIMIT = 60;
export const COALESCE_MS = 1200;

export const emptyHistory = () => ({ past: [], future: [], sig: null, ts: 0 });

/**
 * 记一步：把改动前的快照压进 past。
 * 与上一步签名相同、且间隔 < coalesceMs 时合并（保留这一串输入之前的快照）。
 */
export function recordChange(h, prevSnapshot, { sig = null, now = Date.now(), limit = HISTORY_LIMIT, coalesceMs = COALESCE_MS } = {}) {
  if (sig && h.sig === sig && now - h.ts < coalesceMs && h.past.length) {
    return { past: h.past, future: [], sig, ts: now };
  }
  const past = [...h.past, prevSnapshot];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, future: [], sig, ts: now };
}

/** 撤销：返回 { hist, project }；没有可撤销的返回 null */
export function undoStep(h, current) {
  if (!h.past.length) return null;
  return {
    project: h.past[h.past.length - 1],
    hist: { past: h.past.slice(0, -1), future: [...h.future, current], sig: null, ts: 0 },
  };
}

/** 重做：返回 { hist, project }；没有可重做的返回 null */
export function redoStep(h, current) {
  if (!h.future.length) return null;
  return {
    project: h.future[h.future.length - 1],
    hist: { past: [...h.past, current], future: h.future.slice(0, -1), sig: null, ts: 0 },
  };
}

/** a → b 是否像「打字」：只在一处连续插入或删除（输入法一次上屏多个字也算） */
export function isTypingEdit(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a === b) return true;
  if (a.startsWith('asset:') || b.startsWith('asset:')) return false;
  const min = Math.min(a.length, b.length);
  let pre = 0;
  while (pre < min && a[pre] === b[pre]) pre += 1;
  let suf = 0;
  while (suf < min - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf += 1;
  return pre + suf >= min;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function walk(a, b, path, out, depth) {
  if (a === b) return true;
  if (typeof a === 'string' && typeof b === 'string') {
    // 换图（asset 引用）永远单独一步；同一字段的文字改动都算「打字」——
    // 中文输入法上屏时是把拼音整段替换成汉字（"麻坡ma'po" → '麻坡码坡'），也要和前面的输入合成一步
    if (a.startsWith('asset:') || b.startsWith('asset:')) return false;
    out.push(path);
    return true;
  }
  if (depth <= 0) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false; // 增删 / 移动 = 结构改动，不合并
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      const ida = a[i]?.id;
      const idb = b[i]?.id;
      if (ida !== idb) return false;
      if (!walk(a[i], b[i], `${path}[${ida ?? i}]`, out, depth - 1)) return false;
    }
    return true;
  }
  if (isObj(a) && isObj(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (k === 'updatedAt' || a[k] === b[k]) continue;
      // 新增字段从 undefined 变成字符串（第一次输入）也算打字
      const va = a[k] === undefined && typeof b[k] === 'string' ? '' : a[k];
      const vb = b[k] === undefined && typeof a[k] === 'string' ? '' : b[k];
      if (!walk(va, vb, `${path}.${k}`, out, depth - 1)) return false;
    }
    return true;
  }
  return false;
}

/**
 * 改动签名：只有「若干字符串字段被连续输入」时才返回签名（字段路径列表），其余（开关、换图、增删、排序）返回 null。
 * 两次改动签名相同 + 间隔很短 → 合并成一步撤销。
 */
export function changeSignature(prev, next) {
  if (!isObj(prev) || !isObj(next) || prev === next) return null;
  const out = [];
  if (!walk(prev, next, '', out, 8) || !out.length) return null;
  return out.sort().join('|');
}
