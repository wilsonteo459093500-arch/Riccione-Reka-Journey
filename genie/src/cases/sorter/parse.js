// 案例整理 · 读文件夹名字（纯函数，Node 测试直接跑）
//
// 老板的文件夹（企业微盘下载到 Windows）：
//   <顶层>/<城市>/<城市-姓名-风格[-风格][-材料]>/[效果图|实景|客厅…]/照片
//   <顶层>/2025活动/…（活动：默认跳过）  <顶层>/各地展厅/…（展厅：另一类，默认不导入，永远不当成「家」去配对）
//   <顶层>/最新案例集合/…（可能和城市里的项目重复：靠照片指纹去重）
//
// 隐私（最重要）：项目名里的「姓名」是真人的名字 → 只拿来在界面上把它遮掉（redact），
// 不显示、不存进案例、不进案例包、不发给 AI。城市只是内部资料（员工页上看得到，客人永远看不到）。

import { getData, index } from './data.js';

// ───────────────────────── 小工具 ─────────────────────────

/** cyrb53：53 位的字符串指纹（文件 key、案例 id 用；不是加密，只是不把路径原样存下来） */
export function hash53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
export const hashKey = (str) => hash53(String(str)).toString(36);

/** 一张照片的 key：路径 + 大小 + 修改时间（同一个文件夹再打开一次 → 同样的 key → 直接用缓存） */
export const fileKey = (f) => 'f' + hashKey(`${f.path}|${f.size}|${f.mtime}`);

const lower = (s) => String(s || '').toLowerCase();
const HAN = /[㐀-鿿]/;
const SEP = /\s*[-－—–]\s*/; // 项目名用「-」分段（也认全角）

export function splitPath(p) {
  return String(p || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

const IMG = /\.(jpe?g|png|webp|avif|gif|bmp)$/i;
const HEIC = /\.(heic|heif)$/i;
/** 'image' | 'heic' | 'other'（视频、PDF、PSD、CAD… 跳过） */
export function fileKind(name) {
  if (HEIC.test(name)) return 'heic';
  if (IMG.test(name)) return 'image';
  return 'other';
}
/** 系统 / 下载工具留下的小文件（.DS_Store、Thumbs.db、._xxx）—— 不算照片，也不列进「跳过」 */
export const isJunk = (name) => /^(\.|~\$|thumbs\.db$|desktop\.ini$)/i.test(String(name || ''));

/** 在一段文字里按「长词优先」找词：→ { hits:[{ id, w, at }], rest }（rest = 没被认出来的部分） */
export function scanWords(text, list, key = 'id') {
  const src = String(text || '');
  const low = lower(src);
  const hits = [];
  let rest = '';
  let i = 0;
  while (i < low.length) {
    const m = list.find((x) => x.w && low.startsWith(x.w, i));
    if (m) {
      hits.push({ [key]: m[key], w: src.slice(i, i + m.w.length), at: i });
      i += m.w.length;
    } else {
      rest += src[i];
      i++;
    }
  }
  return { hits, rest };
}

const stripSuffix = (s) => {
  let out = String(s || '').trim();
  for (const suf of getData().suffixes) if (lower(out).endsWith(lower(suf))) out = out.slice(0, -suf.length);
  return out.replace(/^[\s+＋&、,，·._]+|[\s+＋&、,，·._]+$/g, '');
};
const endsWithSuffix = (s) => getData().suffixes.some((suf) => lower(s).trim().endsWith(lower(suf)) && s.trim().length > suf.length);

/** 看起来像人名：2–4 个汉字，或者 1–2 个不带数字的英文字 */
export function isNameLike(s) {
  const x = String(s || '').trim();
  if (!x) return false;
  if (/^[㐀-鿿·]{2,4}$/.test(x)) return true;
  if (/^[A-Za-z][A-Za-z'.]*(\s+[A-Za-z][A-Za-z'.]*)?$/.test(x) && x.length <= 20) return true;
  return false;
}

/** 材料名（板材色卡的名字，例：罗维尔 = AK153A；名字后面紧跟的数字 = 变体，例：素岩03） */
export function scanBoards(text) {
  const { boards } = index();
  const src = String(text || '');
  const hits = [];
  let rest = '';
  let i = 0;
  while (i < src.length) {
    const b = boards.find((x) => src.startsWith(x.name, i));
    if (b) {
      i += b.name.length;
      const v = /^\d{1,3}/.exec(src.slice(i));
      if (v) i += v[0].length;
      hits.push({ name: b.name, code: b.code || '', variant: v ? v[0] : '' });
    } else {
      rest += src[i];
      i++;
    }
  }
  return { hits, rest };
}

const isCity = (s) => index().cities.has(lower(s));

export function specialOf(seg) {
  const { specials } = index();
  const low = lower(seg);
  const exact = specials.find((x) => x.w === low);
  if (exact) return exact.id;
  const part = specials.find((x) => x.w.length >= 2 && low.includes(x.w));
  return part ? part.id : null;
}

// ───────────────────────── 项目名 ─────────────────────────

/** 一段文字里的风格 / 系列 / 板材，剩下认不出来的文字 */
function analyseToken(tok) {
  const { styleWords, seriesWords, seriesById } = index();
  const st = scanWords(tok, styleWords);
  const se = scanWords(st.rest, seriesWords);
  const series = se.hits.map((h) => h.id);
  let rest = se.rest;
  // 「织」只有单独一段（或「织系列」）才算系列，免得「轻衫织」这种板材名也被当成系列
  for (const s of Object.values(seriesById)) if ((s.exact || []).includes(stripSuffix(rest).trim())) {
    series.push(s.id);
    rest = '';
  }
  const bd = scanBoards(rest);
  return { styles: st.hits.map((h) => h.id), series, boards: bd.hits, rest: bd.rest, styled: endsWithSuffix(tok) };
}

/**
 * 一个项目文件夹的名字 → 结构化资料。
 * { city, styles:[id], raw:[string], series:[id], boards:[{ name, code, variant }], materials:[string],
 *   names:[string]（只用来遮掉，不能显示 / 存）, conv:boolean（符合「城市-姓名-风格」的写法） }
 */
export function parseProjectName(name, { cityHint = '' } = {}) {
  const parts = String(name || '')
    .split(SEP)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = { city: cityHint || '', styles: [], raw: [], series: [], boards: [], materials: [], names: [], conv: false };
  if (!parts.length) return out;
  let i = 0;
  if (isCity(parts[0])) {
    out.city = parts[0];
    i = 1;
  }
  let nameSlot = true; // 城市后面的第一段：不是风格，就当成人名（哪怕它碰巧和某个板材同名 —— 宁可少显示）
  for (; i < parts.length; i++) {
    const tok = parts[i];
    if (nameSlot) {
      nameSlot = false;
      if (!/\d/.test(tok) && isNameLike(tok)) {
        const a = analyseToken(tok);
        if (!a.styles.length && !a.series.length) {
          out.names.push(tok);
          continue;
        }
      }
    }
    const sub = tok.split(/\s*[+＋&、,，]\s*/).filter(Boolean);
    let styled = false;
    const leftovers = [];
    for (const s of sub) {
      const a = analyseToken(s);
      if (a.styles.length || a.series.length) styled = true;
      out.styles.push(...a.styles);
      out.series.push(...a.series);
      out.boards.push(...a.boards);
      const rest = stripSuffix(a.rest);
      if (rest && /[\p{L}\p{N}]/u.test(rest)) leftovers.push({ rest, styledTok: a.styled, hadKnown: !!(a.styles.length || a.series.length || a.boards.length) });
    }
    for (const lo of leftovers) {
      const r = lo.rest;
      if (lo.styledTok && !/\d/.test(r) && HAN.test(r) && r.length <= 6) out.raw.push(r); // 「轻奢风」→ 认不出来的风格词，留给员工对应
      else if (/\d|[A-Za-z]{2}\d/.test(r) || lo.hadKnown) out.materials.push(r); // 「素岩03」「XA-TP-01」这类
      else if (isNameLike(r)) out.names.push(r); // 不确定 → 当成人名遮掉（宁可少显示）
      else out.materials.push(r);
    }
  }
  out.styles = [...new Set(out.styles)];
  out.series = [...new Set(out.series)];
  out.raw = [...new Set(out.raw)];
  out.materials = [...new Set(out.materials)];
  out.conv = parts.length >= 2 && (!!out.city || out.styles.length > 0);
  // 系列暗示风格（文件夹只写了「骨骼线」时）
  if (!out.styles.length) {
    const { seriesById } = index();
    for (const s of out.series) for (const st of seriesById[s]?.implies || []) if (!out.styles.includes(st)) out.styles.push(st);
  }
  // 布纹板（…织 / …格）属于「织」系列（data.json 里 boardFamily 的那个系列）
  const woven = Object.values(index().seriesById).find((x) => x.boardFamily);
  if (woven && out.boards.some((b) => /织$|格$/.test(b.name)) && !out.series.includes(woven.id)) out.series.push(woven.id);
  return out;
}

/** 这一段像不像「城市-姓名-风格」的项目文件夹 */
export function looksLikeProject(seg) {
  const parts = String(seg || '').split(SEP).filter(Boolean);
  if (parts.length < 2) return false;
  const p = parseProjectName(seg);
  return !!p.city || p.styles.length > 0 || p.series.length > 0;
}

// ───────────────────────── 房间 / 照片类型（子文件夹、文件名） ─────────────────────────

export function roomOf(text) {
  const { roomWords } = index();
  const low = lower(text);
  return roomWords.find((x) => low.includes(x.w))?.room || null;
}
export function viewOf(text) {
  const { viewWords } = index();
  const low = lower(text);
  return viewWords.find((x) => low.includes(x.w))?.view || null;
}

/** 把人名遮掉（界面上任何一段从文件夹 / 文件名来的文字都要先过这一关） */
export function redact(str, names = []) {
  let s = String(str || '');
  for (const n of names) if (n && n.length >= 2) s = s.split(n).join('··');
  return s;
}

// ───────────────────────── 一条路径 ─────────────────────────

/**
 * 「顶层/上海/上海-甲乙-极简原木风/效果图/IMG_01.jpg」→
 * { segs, name, dirs, special, city, projectSeg, project, sub:[…], room, view, projDir, flat }
 *   projDir：分组用的文件夹（项目文件夹的路径；没有项目文件夹 = 它所在的「容器」文件夹，flat:true → 按拍摄时间分）
 */
/** 一个文件夹（不含文件名）的结构：容器、项目、子文件夹。同一个文件夹只算一次（9 000 张照片也只有几百个文件夹） */
function classifyDirs(dirs) {
  let special = null;
  let city = '';
  // 项目文件夹：路径里第一个「城市-姓名-风格」的那一段；它前面的都是容器（选的顶层、上一层、特殊文件夹、城市）。
  // 没有这种写法的：最后一个「城市 / 特殊文件夹」后面的那一段就是项目；都没有 → 选的顶层下面那一段。
  let k = dirs.findIndex((seg) => looksLikeProject(seg));
  let last = -1;
  const upto = k >= 0 ? k : dirs.length;
  for (let i = 0; i < upto; i++) {
    const sp = specialOf(dirs[i]);
    if (sp) {
      if (!special) special = sp;
      last = i;
    } else if (isCity(dirs[i])) {
      city = dirs[i];
      last = i;
    }
  }
  if (k < 0) k = last >= 0 ? last + 1 : 1;
  const projectSeg = dirs[k] || null;
  const sub = projectSeg ? dirs.slice(k + 1) : [];
  const project = projectSeg ? parseProjectName(projectSeg, { cityHint: city }) : null;
  if (project && !city) city = project.city;
  const projDir = projectSeg ? dirs.slice(0, k + 1).join('/') : dirs.join('/');
  const subText = sub.join('/');
  return { special, city, projectSeg, project, sub, subText, projDir, projView: projectSeg ? viewOf(projectSeg) : null, flat: !project?.conv };
}

/**
 * 「顶层/上海/上海-甲乙-极简原木风/效果图/IMG_01.jpg」→
 * { segs, name, dirs, special, city, projectSeg, project, sub:[…], room, view, projDir, flat }
 *   projDir：分组用的文件夹（项目文件夹的路径；没有项目文件夹 = 它所在的「容器」文件夹，flat:true → 按拍摄时间分）
 * cache：Map（同一批文件共用，文件夹只分析一次）
 */
export function classifyPath(path, cache = null) {
  const segs = splitPath(path);
  const name = segs[segs.length - 1] || '';
  const dirs = segs.slice(0, -1);
  const dk = dirs.join('/');
  let d = cache?.get(dk);
  if (!d) {
    d = classifyDirs(dirs);
    cache?.set(dk, d);
  }
  const hintText = d.subText ? d.subText + '/' + name : name;
  return {
    segs,
    name,
    dirs,
    special: d.special,
    city: d.city,
    projectSeg: d.projectSeg,
    project: d.project,
    sub: d.sub,
    room: roomOf(hintText),
    view: viewOf(hintText) || d.projView,
    projDir: d.projDir,
    // 不是「城市-姓名-风格」的文件夹（或者照片直接放在容器里）→ 里面可能混了好几个项目：按拍摄时间再分
    flat: d.flat,
  };
}
