// 案例整理 · 分组（纯函数）
//   1. 「城市-姓名-风格」的项目文件夹 = 一个项目（里面的子文件夹 = 房间 / 效果图 / 实景提示）
//   2. 其它文件夹 = 一个项目
//   3. 「平」的文件夹（不是项目写法的、或者照片直接放在城市 / 顶层里）→ 按拍摄时间的空档 + 文件名序号再分开
// 员工之后可以改名、合并、拆开、跳过。

import { getData, index } from './data.js';
import { classifyPath, fileKey, fileKind, hashKey, isJunk, isNameLike, roomOf, viewOf, specialOf } from './parse.js';

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** 文件名里的序号：「IMG_0123.jpg」→ { pre:'img_', n:123 } */
export function seqOf(name) {
  const m = /^(.*?)(\d+)(?=\D*$)/.exec(String(name || '').replace(/\.[^.]+$/, ''));
  return m ? { pre: m[1].toLowerCase(), n: +m[2] } : { pre: String(name || '').toLowerCase(), n: null };
}

export const TIME = { gapH: 3, seqGapMin: 30, mergeSingleH: 24 };

/**
 * 「平」的文件夹：按时间分成几次拍摄。files：[{ key, name, t }]（t = EXIF 拍摄时间，没有就用修改时间）
 * → [[key…]…]（每组一次拍摄；时间先后排好）
 */
export function timeSplit(files, opt = {}) {
  const o = { ...TIME, ...opt };
  const list = [...files].sort((a, b) => (a.t ?? 0) - (b.t ?? 0) || byName(a, b));
  const out = [];
  let cur = null;
  let prev = null;
  for (const f of list) {
    const gap = prev && f.t != null && prev.t != null ? f.t - prev.t : 0;
    const s1 = prev ? seqOf(prev.name) : null;
    const s2 = seqOf(f.name);
    const seqBreak = !!(s1 && (s1.pre !== s2.pre || (s1.n != null && s2.n != null && Math.abs(s2.n - s1.n) > 40)));
    const brk = !cur || gap > o.gapH * 3600e3 || (seqBreak && gap > o.seqGapMin * 60e3);
    if (brk) {
      cur = { keys: [], t0: f.t, t1: f.t };
      out.push(cur);
    }
    cur.keys.push(f.key);
    cur.t1 = f.t;
    prev = f;
  }
  // 单独一张：离前一组不到一天就并过去（零散的截图、单据不会自己变成一个「项目」）
  const merged = [];
  for (const c of out) {
    const last = merged[merged.length - 1];
    if (last && c.keys.length === 1 && c.t0 != null && last.t1 != null && c.t0 - last.t1 < o.mergeSingleH * 3600e3) {
      last.keys.push(...c.keys);
      last.t1 = c.t1;
    } else merged.push(c);
  }
  return merged.map((c) => c.keys);
}

/** 文件夹名能不能显示：认得出来的词（城市、房间、风格、特殊文件夹…）才显示；像人名的 → 不显示 */
export function safeFolderName(seg, names = []) {
  const s = String(seg || '');
  if (!s || s.startsWith('_')) return '';
  if (names.some((n) => n && s.includes(n))) return '';
  const { cities } = index();
  if (cities.has(s.toLowerCase()) || roomOf(s) || viewOf(s) || specialOf(s)) return s;
  if (isNameLike(s)) return '';
  if (/^[㐀-鿿]{1,6}$/.test(s) && !/[\d]/.test(s)) return ''; // 短短的中文 = 可能是人名 / 家名，保守起见不显示
  return s;
}

/**
 * 列出来的文件 → 项目分组。
 * entries：[{ path, name, size, mtime }]（浏览器里还带 file）
 * → { groups, files: Map<key, item>, skipped, names, stats }
 *   item = { key, path, name, size, mtime, kind, room, view, sub, groupId }
 *   group = { id, dir, kind:'home'|'showroom'|'event', collection, city, styles, raw, series, boards, materials, flat, keys:[…], seq }
 */
export function buildGroups(entries) {
  const files = new Map();
  const skipped = [];
  const byDir = new Map();
  const names = new Set();
  let heic = 0;
  let other = 0;
  const dirCache = new Map();
  for (const e of entries) {
    if (isJunk(e.name)) continue;
    const kind = fileKind(e.name);
    const c = classifyPath(e.path || e.name, dirCache);
    for (const n of c.project?.names || []) names.add(n);
    if (kind === 'other') {
      other++;
      skipped.push({ path: e.path, reason: 'other' });
      continue;
    }
    if (kind === 'heic') heic++;
    const key = fileKey(e);
    const item = { key, path: e.path || e.name, name: e.name, size: e.size, mtime: e.mtime, kind, room: c.room, view: c.view, sub: c.sub, file: e.file, groupId: null };
    files.set(key, item);
    let g = byDir.get(c.projDir);
    if (!g) {
      const p = c.project || { styles: [], raw: [], series: [], boards: [], materials: [], names: [], conv: false };
      g = {
        id: 'g' + hashKey('dir|' + c.projDir),
        dir: c.projDir,
        folder: c.projectSeg || c.dirs[c.dirs.length - 1] || '',
        kind: c.special === 'showroom' ? 'showroom' : c.special === 'event' ? 'event' : 'home',
        collection: c.special === 'collection',
        city: c.city || '',
        styles: [...p.styles],
        raw: [...p.raw],
        series: [...p.series],
        boards: [...p.boards],
        materials: [...p.materials],
        flat: c.flat,
        keys: [],
      };
      byDir.set(c.projDir, g);
    }
    g.keys.push(key);
    item.groupId = g.id;
  }
  const groups = [...byDir.values()];
  numberGroups(groups);
  const stats = {
    images: files.size,
    heic,
    other,
    projects: groups.filter((g) => g.kind === 'home').length,
    showrooms: groups.filter((g) => g.kind === 'showroom').length,
    events: groups.filter((g) => g.kind === 'event').length,
    cities: new Set(groups.map((g) => g.city).filter(Boolean)).size,
  };
  return { groups, files, skipped, names: [...names], stats };
}

/** 每个城市里的项目编号（按文件夹路径排，稳定）：标签「上海 · 原木 · 3」 */
export function numberGroups(groups) {
  const per = new Map();
  for (const g of [...groups].sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : (a.part || 0) - (b.part || 0)))) {
    const k = `${g.kind}|${g.city}`;
    const n = (per.get(k) || 0) + 1;
    per.set(k, n);
    g.seq = n;
  }
  return groups;
}

/**
 * 「平」的文件夹按时间再分。times：Map<key, 拍摄时间（毫秒）>（EXIF 读到了的）；没读到用修改时间。
 * 返回新的 groups（不平的原样）。拆出来的组 id = 原 id + 第一张的 key（再打开同一个文件夹还是同样的 id）。
 */
export function splitFlat(groups, files, times = new Map()) {
  const out = [];
  for (const g of groups) {
    if (!g.flat || g.keys.length < 2 || g.kind !== 'home') {
      out.push(g);
      continue;
    }
    const list = g.keys.map((k) => {
      const f = files.get(k);
      return { key: k, name: f?.name || '', t: times.get(k) ?? f?.mtime ?? null };
    });
    const parts = timeSplit(list);
    if (parts.length <= 1) {
      out.push(g);
      continue;
    }
    parts.forEach((keys, i) => {
      const id = g.id + '-' + hashKey(keys[0]).slice(0, 6);
      const ng = { ...g, id, keys, part: i + 1, parts: parts.length, from: g.id };
      for (const k of keys) {
        const f = files.get(k);
        if (f) f.groupId = id;
      }
      out.push(ng);
    });
  }
  return numberGroups(out);
}

/** 合并：b 的照片并进 a（a 的名字、风格留着；b 没有的风格补进来） */
export function mergeGroups(a, b) {
  return {
    ...a,
    keys: [...a.keys, ...b.keys.filter((k) => !a.keys.includes(k))],
    styles: [...new Set([...(a.styles || []), ...(b.styles || [])])],
    series: [...new Set([...(a.series || []), ...(b.series || [])])],
    boards: [...(a.boards || []), ...(b.boards || []).filter((x) => !(a.boards || []).some((y) => y.name === x.name))],
    merged: [...(a.merged || []), b.id],
  };
}

/** 拆开：从 key 这一张（含）开始，后面的变成一个新项目 */
export function splitGroup(g, key, order = g.keys) {
  const i = order.indexOf(key);
  if (i <= 0) return [g];
  const head = order.slice(0, i);
  const tail = order.slice(i);
  return [
    { ...g, keys: head },
    { ...g, id: g.id + '-s' + hashKey(key).slice(0, 5), keys: tail, split: g.id, seq: g.seq },
  ];
}

/** 显示用的项目名（客人看不到；人名永远不在里面）：{ zh, en } */
export function groupLabel(g, { names = [] } = {}) {
  const d = getData();
  const { styleById, specialById } = index();
  const cityEn = d.cityEn?.[g.city] || g.city;
  const st = (g.styles || []).map((s) => styleById[s]).filter(Boolean);
  const zhStyle = st.length ? st.map((s) => s.zh).join(' + ') : (g.raw || [])[0] || '';
  const enStyle = st.length ? st.map((s) => s.en).join(' + ') : (g.raw || [])[0] || '';
  const sp = g.kind !== 'home' ? specialById[g.kind] : g.collection ? specialById.collection : null;
  const folder = g.flat ? safeFolderName(g.folder, names) : '';
  const zh = [sp?.zh, g.city, zhStyle || folder || '未标风格', g.seq ? String(g.seq) : '']
    .filter(Boolean)
    .join(' · ');
  const en = [sp?.en, cityEn, enStyle || folder || 'No style yet', g.seq ? String(g.seq) : '']
    .filter(Boolean)
    .join(' · ');
  return { zh, en };
}
