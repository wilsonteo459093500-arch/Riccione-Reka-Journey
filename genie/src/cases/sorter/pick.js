// 每个项目自动挑：一张封面（清楚、曝光好、横的、宽）+ 最多 17 张「不一样」的（指纹差得多、颜色 / 房间不一样）。
//   · 每个房间最多 4 张（没标房间的算同一个「房间」）—— 客人按房间看，一个客厅拍了 30 张也只挑最好最不一样的 4 张；
//     照片最少的房间先挑（每个房间都有一张了，才挑第二张…），客人每个房间都看得到；
//   · 细节特写（门板、拉手、木纹、收口）另外最多 4 张，不占房间的名额，排在最后；
//   · 几乎同一个角度（> 0.93 像）的不硬凑。
// 重复的、不合适的（截图、单据、太小、糊、太暗、工地）先藏起来 —— 员工点一下就能拿回来。

import { clusterNear } from './dupes.js';
import { hamming, hashWords, LIMITS } from './imgmath.js';
import { deltaE } from './color.js';

export const PICK = { max: 18, perRoom: 4, details: 4, near: 0.93, lambda: 0.55, simBits: 56 };
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};

/** 细节特写：员工 / AI 标过的（detail: true / false）优先，没标就看文件名 / 子文件夹（view 'detail'） */
export const isDetail = (p) => (typeof p?.detail === 'boolean' ? p.detail : p?.view === 'detail');
/** 房间名额按哪个「房间」算：没标房间的都算同一个（''） */
const roomKey = (p) => p.room || '';

/** 直接藏起来的理由（flags 里「太亮」只扣分，不藏） */
export function rejectReasons(a) {
  if (!a) return [];
  return (a.flags || []).filter((f) => f !== 'bright');
}

/**
 * 在项目里比一比：相对清晰度（和这个项目的中位数比）。→ Map<key, q'>（0–1）
 * 同一个项目里的照片一般是同一台相机 / 同一个渲染器，比绝对值更公平。
 */
export function relativeQuality(photos) {
  const med = median(photos.filter((p) => p.a).map((p) => p.a.sharp));
  const out = new Map();
  for (const p of photos) {
    if (!p.a) continue;
    const rel = med > 0 ? clamp01(0.5 + Math.log2(Math.max(1, p.a.sharp) / med) / 3) : 0.5;
    out.set(p.key, Math.round((0.72 * p.a.q + 0.28 * rel) * 1000) / 1000);
  }
  return out;
}

const aspect = (a) => (a?.w && a?.h ? a.w / a.h : 1);

/** 封面分：清楚好看 + 横的 + 宽画幅 + 客厅 / 餐厅 + 实景优先（客人看的是「我们做过的家」） */
export function coverScore(p, q, { hasPhotoView = false } = {}) {
  const r = aspect(p.a);
  let s = q;
  if (r >= 1.05) s += 0.12;
  if (r >= 1.25 && r <= 1.95) s += 0.06;
  if (p.room === 'living' || p.room === 'dining') s += 0.05;
  if (p.view === 'photo') s += 0.04;
  if (p.view === 'render' && hasPhotoView) s -= 0.03;
  return s;
}

/** 两张照片有多像（0–1）：构图（指纹）70 % + 颜色 30 % */
export function similarity(a, b, W = new Map()) {
  const wa = W.get(a.key) || hashWords(a.a.hash);
  const wb = W.get(b.key) || hashWords(b.a.hash);
  const d = hamming(wa, wb);
  const s1 = clamp01(1 - d / PICK.simBits);
  const ca = a.a.colours?.[0]?.lab;
  const cb = b.a.colours?.[0]?.lab;
  const s2 = ca && cb ? Math.exp(-deltaE(ca, cb) / 20) : 0.5;
  return 0.7 * s1 + 0.3 * s2;
}

/**
 * 自动挑选。photos：[{ key, a (分析结果 | null), room, view, detail?, t }]；opt.crossDup：Set<key>（在别的项目里已经有了）
 * opt.max / perRoom / details：总数、每个房间（不算细节）、细节特写的上限（默认 PICK）
 * → { cover, picked:[key…]（封面在第一个，细节特写在最后）, dupOf:Map<key, 留下的那张>, rejects:Map<key, [理由]>, q:Map<key, q'> }
 */
export function autoPick(photos, opt = {}) {
  const max = opt.max ?? PICK.max;
  const perRoom = opt.perRoom ?? PICK.perRoom;
  const maxDetails = opt.details ?? PICK.details;
  const crossDup = opt.crossDup || new Set();
  const ready = photos.filter((p) => p.a && p.a.hash);
  const q = relativeQuality(ready);
  const rejects = new Map();
  const med = median(ready.map((p) => p.a.sharp));
  for (const p of ready) {
    const r = rejectReasons(p.a);
    // 相对糊：比这个项目的中位数糊很多，绝对值也低（细节特写不比：近拍的背景本来就是虚的）
    if (!r.includes('blur') && !isDetail(p) && med > 0 && p.a.sharp < med * 0.22 && p.a.sharp < LIMITS.soft) r.push('blur');
    if (p.view === 'site' && !r.includes('site')) r.push('site');
    if ((p.view === 'shot' || p.view === 'doc' || p.view === 'plan') && !r.length) r.push(p.view === 'plan' ? 'plan' : p.view);
    if (r.length) rejects.set(p.key, r);
  }
  // 近似重复：每一簇留下最好的那张（优先没被藏起来的）
  const dupOf = new Map();
  const clusters = clusterNear(ready.map((p) => ({ key: p.key, hash: p.a.hash, t: p.t })));
  for (const c of clusters) {
    const best = [...c].sort((x, y) => (rejects.has(x) ? 1 : 0) - (rejects.has(y) ? 1 : 0) || (q.get(y) || 0) - (q.get(x) || 0))[0];
    for (const k of c) if (k !== best) dupOf.set(k, best);
  }
  for (const k of crossDup) if (!dupOf.has(k)) dupOf.set(k, k);
  const cands = ready.filter((p) => !rejects.has(p.key) && !dupOf.has(p.key));
  if (!cands.length) return { cover: null, picked: [], dupOf, rejects, q };
  const hasPhotoView = cands.some((p) => p.view === 'photo');
  const W = new Map(cands.map((p) => [p.key, hashWords(p.a.hash)]));
  // 封面：规则不变；只是有房间照片的时候，不拿细节特写当封面
  const coverPool = cands.some((p) => !isDetail(p)) ? cands.filter((p) => !isDetail(p)) : cands;
  let cover = coverPool[0];
  for (const p of coverPool) if (coverScore(p, q.get(p.key), { hasPhotoView }) > coverScore(cover, q.get(cover.key), { hasPhotoView })) cover = p;
  const picked = [cover];
  const rooms = new Set(); // 已经有照片的房间（细节不算）：新房间加一点分
  const perRoomN = new Map(); // 每个房间挑了几张（细节不算）
  let nDetail = 0;
  const add = (p) => {
    if (isDetail(p)) nDetail++;
    else {
      perRoomN.set(roomKey(p), (perRoomN.get(roomKey(p)) || 0) + 1);
      if (p.room) rooms.add(p.room);
    }
  };
  add(cover);
  const pool = cands.filter((p) => p !== cover);
  // 和已经挑的最像的那张有多像（每挑一张只和新挑的那张比一次）
  const red = new Map(pool.map((p) => [p.key, similarity(p, cover, W)]));
  const nOf = (p) => perRoomN.get(roomKey(p)) || 0;
  // reserve：先给细节特写留几个位子（房间照片很多的项目，细节也挑得进来）
  const fill = (reserve) => {
    while (picked.length < max && pool.length) {
      const roomsLeft = picked.length - nDetail < max - reserve;
      // 房间照片：只从「挑得最少」的房间里挑（满 perRoom 张的房间不再挑）
      let level = Infinity;
      if (roomsLeft) for (const p of pool) if (!isDetail(p)) level = Math.min(level, nOf(p));
      let bi = -1;
      let bv = -Infinity;
      pool.forEach((p, i) => {
        if (isDetail(p) ? nDetail >= maxDetails : !roomsLeft || level >= perRoom || nOf(p) !== level) return; // 名额满了 / 别的房间还少
        const v = (q.get(p.key) || 0) - PICK.lambda * red.get(p.key) + (!isDetail(p) && p.room && !rooms.has(p.room) ? 0.06 : 0);
        if (v > bv) {
          bv = v;
          bi = i;
        }
      });
      if (bi < 0) return;
      const p = pool.splice(bi, 1)[0];
      // 和已经挑的太像（几乎同一个角度），就不硬凑满
      if (red.get(p.key) > PICK.near) continue;
      picked.push(p);
      add(p);
      for (const x of pool) red.set(x.key, Math.max(red.get(x.key), similarity(x, p, W)));
    }
  };
  fill(Math.min(maxDetails, pool.filter(isDetail).length));
  fill(0); // 留给细节的位子没用完（太像 / 不够）→ 再让房间照片补上
  // 顺序：封面 → 房间照片（挑的先后）→ 细节特写（案例里照片的顺序就是这个）
  const order = [cover, ...picked.slice(1).filter((p) => !isDetail(p)), ...picked.slice(1).filter(isDetail)];
  return { cover: cover.key, picked: order.map((p) => p.key), dupOf, rejects, q };
}

/**
 * 一个项目「值不值得先做」（0–1）：挑好的前三张有多好 60 % + 挑到几张（5 张满分）25 % + 拍到几个房间（4 个满分）15 %。
 * 「每种风格先做最好的 N 个」用：9 000 张照片一个下午做不完，先把最好的原木 / 侘寂项目上架。
 */
export function projectScore({ picked = [], q = new Map(), rooms = [] } = {}) {
  if (!picked.length) return 0;
  const qs = picked.map((k) => q.get(k) || 0).sort((a, b) => b - a).slice(0, 3);
  const mq = qs.reduce((s, x) => s + x, 0) / qs.length;
  const n = Math.min(1, picked.length / 5);
  const r = Math.min(1, new Set(rooms.filter((x) => x && x !== 'plan3d')).size / 4);
  return Math.round((0.6 * mq + 0.25 * n + 0.15 * r) * 1000) / 1000;
}

/**
 * 每种风格只留最好的 n 个。items：[{ id, style（第一个风格标签；没有 = ''）, score }]，styleOrder：风格的先后（原木、侘寂在前）。
 * → 留下来的 id，按风格先后、分数高低排好
 */
export function bestPerStyle(items = [], n = 5, styleOrder = []) {
  const rank = (s) => {
    const i = styleOrder.indexOf(s);
    return i < 0 ? styleOrder.length + (s ? 0 : 1) : i;
  };
  const by = new Map();
  for (const it of items) {
    const k = it.style || '';
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(it);
  }
  const out = [];
  for (const k of [...by.keys()].sort((a, b) => rank(a) - rank(b))) {
    const list = by.get(k).sort((a, b) => b.score - a.score);
    out.push(...(n > 0 ? list.slice(0, n) : list).map((x) => x.id));
  }
  return out;
}
