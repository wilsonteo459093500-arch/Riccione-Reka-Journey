// 近似重复 / 连拍：照片指纹（dHash 128 位）差几位以内 = 同一张（或几乎同一张）。
//   · 项目里面：两两比（一个项目最多几百张，很快）
//   · 跨文件夹（「最新案例集合」和城市里的项目重复）：前 64 位分成 8 段做「桶」，同一个桶里的才细比（9 000 张也不慢）

import { hamming, hashWords } from './imgmath.js';

export const DUP = { near: 10, burst: 20, burstMs: 8000, cross: 12 };

/** 并查集 */
function uf(n) {
  const p = Array.from({ length: n }, (_, i) => i);
  const find = (x) => (p[x] === x ? x : (p[x] = find(p[x])));
  return { find, join: (a, b) => (p[find(a)] = find(b)) };
}

/**
 * 一个项目里的照片分成「几乎一样」的几簇。
 * items：[{ key, hash, t? }] → [[key…]…]（只返回 ≥ 2 张的簇）
 * 规则：差 ≤ near 位 = 重复；差 ≤ burst 位 且 拍摄时间相差 ≤ burstMs = 连拍
 */
export function clusterNear(items, o = {}) {
  const { near, burst, burstMs } = { ...DUP, ...o };
  const W = items.map((x) => (x.hash ? hashWords(x.hash) : null));
  const u = uf(items.length);
  for (let i = 0; i < items.length; i++) {
    if (!W[i]) continue;
    for (let j = i + 1; j < items.length; j++) {
      if (!W[j]) continue;
      const d = hamming(W[i], W[j]);
      if (d <= near) u.join(i, j);
      else if (d <= burst && items[i].t != null && items[j].t != null && Math.abs(items[i].t - items[j].t) <= burstMs) u.join(i, j);
    }
  }
  const groups = new Map();
  items.forEach((x, i) => {
    const r = u.find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(x.key);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}

/**
 * 跨项目的重复。items：[{ key, group, hash }] → [{ a, b, d }]（a、b 在不同的项目里）
 * 8 段 × 8 位的桶：差 ≤ 7 位的一定至少有一段完全一样；再用完整的 128 位确认（≤ cross）。
 */
export function crossPairs(items, { cross = DUP.cross } = {}) {
  const W = items.map((x) => (x.hash ? hashWords(x.hash) : null));
  const buckets = new Map();
  items.forEach((x, i) => {
    if (!W[i]) return;
    for (let b = 0; b < 8; b++) {
      const word = W[i][b >> 2];
      const byte = (word >>> ((b & 3) * 8)) & 0xff;
      const k = b * 256 + byte;
      let l = buckets.get(k);
      if (!l) buckets.set(k, (l = []));
      l.push(i);
    }
  });
  const seen = new Set();
  const out = [];
  for (const l of buckets.values()) {
    if (l.length < 2 || l.length > 400) continue; // 太大的桶（纯色图之类）不比，免得变慢
    for (let x = 0; x < l.length; x++) {
      for (let y = x + 1; y < l.length; y++) {
        const i = l[x];
        const j = l[y];
        if (items[i].group === items[j].group) continue;
        const pk = i < j ? i * 1e6 + j : j * 1e6 + i;
        if (seen.has(pk)) continue;
        seen.add(pk);
        const d = hamming(W[i], W[j]);
        if (d <= cross) out.push({ a: items[i].key, b: items[j].key, d });
      }
    }
  }
  return out;
}

/**
 * 「最新案例集合」里的项目，和城市里的哪个项目重复。
 * pairs：crossPairs 的结果；groupOf：key → groupId；isCollection(groupId)；sizeOf(groupId) = 照片数
 * → { dupPhoto: Map<key, 另一边的 key>, dupGroup: Map<集合里的 groupId, { of: groupId, share }> }
 * 集合里一个项目有 ≥ 50 % 的照片在同一个城市项目里出现 → 整个项目算重复（默认跳过，能合并过去）。
 */
export function collectionDupes(pairs, groupOf, isCollection, sizeOf) {
  const dupPhoto = new Map();
  const hits = new Map();
  for (const { a, b } of pairs) {
    const ga = groupOf(a);
    const gb = groupOf(b);
    let [x, y, gx, gy] = [a, b, ga, gb];
    if (!isCollection(ga) && isCollection(gb)) [x, y, gx, gy] = [b, a, gb, ga];
    if (!isCollection(gx) || isCollection(gy)) continue; // 只管「集合 ↔ 城市」
    if (!dupPhoto.has(x)) {
      dupPhoto.set(x, y);
      const m = hits.get(gx) || new Map();
      m.set(gy, (m.get(gy) || 0) + 1);
      hits.set(gx, m);
    }
  }
  const dupGroup = new Map();
  for (const [g, m] of hits) {
    let best = null;
    let n = 0;
    for (const [t, c] of m) if (c > n) [best, n] = [t, c];
    const share = n / Math.max(1, sizeOf(g));
    if (share >= 0.5) dupGroup.set(g, { of: best, share: Math.round(share * 100) / 100 });
  }
  return { dupPhoto, dupGroup };
}
