// 案例包（WISH-cases-YYYYMMDD.json，格式和 cases.js exportPack 一样）太大时自动拆成几份，每份 ≤ 20 MB。
// 每一份都是完整的案例包（可以单独导入另一台 iPad，或者让负责的人用 scripts/import-cases.mjs --pack 一份一份合并）。
// 一个案例的照片永远在同一份里（不会被拆开）。

export const PACK_MAX = 20 * 1024 * 1024;
const OVERHEAD = 256; // 包头（kind、v、exportedAt…）

/** 一个案例在包里大约占多少字节：文字 JSON + 每张 1600 照片的 base64（× 4/3）+ data: 前缀 */
export function caseBytes(caseJsonLength, photoBytes = []) {
  return caseJsonLength + 2 + photoBytes.reduce((s, b) => s + Math.ceil(b / 3) * 4 + 64, 0);
}

/**
 * items：[{ id, bytes }]（按想要的顺序）→ [{ ids:[…], bytes }]
 * 按顺序装：装不下就开新的一份；单个案例本身就超过上限 → 它自己一份（oversize: true，界面会提示）。
 */
export function splitPack(items, max = PACK_MAX) {
  const parts = [];
  let cur = null;
  for (const it of items) {
    const b = Math.max(0, it.bytes | 0);
    if (!cur || cur.bytes + b > max) {
      cur = { ids: [], bytes: OVERHEAD };
      parts.push(cur);
    }
    cur.ids.push(it.id);
    cur.bytes += b;
    if (cur.bytes > max) cur.oversize = true;
  }
  return parts;
}

const pad = (n) => String(n).padStart(2, '0');
/** WISH-cases-20261019.json · 拆开时 WISH-cases-20261019-1of3.json */
export function partFileName(i, n, d = new Date()) {
  const base = `WISH-cases-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  return n > 1 ? `${base}-${i}of${n}.json` : `${base}.json`;
}

export const fmtMB = (b) => (b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0);
