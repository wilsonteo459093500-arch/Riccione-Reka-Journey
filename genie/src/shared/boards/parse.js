// 溪岸板材 · 文件名 → 序号 / 厂家编号 / 树种 / 纹理 / 名字（纯函数，Node + 浏览器；SPEC §3.3 + §8 R7 / R8）。
//
// 老板文件夹「溪岸--板材高清贴图 / 板材贴图」里的几种写法（ref/NAMES.md）：
//   1号红橡乱纹 · 2白橡直纹（没有「号」）· 7号黑胡桃XA-TP-01 · 13号桦木乱纹素板          ← 序号 + 树种 + 纹理 [+ 标记] [+ 厂家编号]
//   2810 · 6162 · P1                                                          ← 烤漆色号（纯色）
//   檀雾橡AG337 · 浅川橡02AG273 · 淡山云AK218AL · 秋夕胡桃AGM229E                 ← 诗意名字 [+ 02 变体] + 厂家编号
//   GPC003绅士灰八角藤编 · XT011藤编 · U702AK097AL                               ← 编号在前
//   桑榆藤编 · 深砚灰 · 寂境-大板 / 寂境-小板 · 白蜡乱纹XA-TP-06                   ← 只有名字 / 大板 + 小板
// 序号是这块板在公司里的编号；厂家编号（XA-TP-01）可以重复（7号 / 8号都是），只给员工看。
// 板的 id 第一次存的时候定下来，以后不改、不重用（R8）：sail-<序号> · sail-c<编号> · sail-x<指纹>。

import { SPECIES, GRAINS, FLAGS, KIND_WORDS, SIZE_WORDS, CODE_FAMILIES, LOST_NAME } from './vocab.js';

const HAN = '\\u3400-\\u9fff';
const IS_HAN = new RegExp(`[${HAN}]`);
const IMAGE_EXT = /^(jpe?g|png|webp)$/;
const CONVERT_EXT = /^(tiff?|heic|heif|bmp|gif|psd)$/;

const byLen = (a) => [...a].sort((x, y) => y.zh.length - x.zh.length);
// 结构词（把名字切开的）：树种 · 纹理 · 标记 · 大小板
const STRUCT = byLen([
  ...SPECIES.map((e) => ({ ...e, t: 'species' })),
  ...GRAINS.map((e) => ({ ...e, t: 'grain' })),
  ...FLAGS.map((e) => ({ ...e, t: 'flag' })),
  ...SIZE_WORDS.map((e) => ({ ...e, t: 'size' })),
]);
const KINDW = byLen(KIND_WORDS);

/** 厂家编号：带横线的（XA-TP-01、SG-PK02-1、MS-2810）在哪里都认 */
export const DASH_CODE = /[A-Z]{1,4}(?:-[A-Z0-9]{1,6}){1,3}/;
/** 字母 + 数字的编号（AG033A、AK096AL、GKL018Y、AGM229E、AG305TD、P1） */
export const ALNUM_CODE = /^[A-Z]{1,4}\d{1,4}[A-Z]{0,3}$/;
const TAIL_CODE = /([A-Z]{1,4}\d{2,4}[A-Z]{0,3})$/;
const HEAD_CODE = new RegExp(`^([A-Z]{1,4}\\d{2,4}[A-Z]{0,3})[\\s\\-_]*(?=[${HAN}])`);
const COPY = /(\s*-\s*副本(\s*\(\d+\))?|\s*-\s*copy(\s*\(\d+\))?|\s*\(\d+\)|\s+copy(\s*\d+)?|\s*拷贝(\s*\d+)?)$/i;

/** 全角 → 半角（NFKC）、只留文件名（路径里可能有 Windows 用户名，永远不存）、去掉 Windows / 企业微信的「副本」后缀 */
export function normalizeName(file) {
  let s = String(file ?? '').normalize('NFKC');
  s = s.replace(/\\/g, '/').split('/').pop();
  const base = s;
  const m = s.match(/\.([a-z0-9]{2,5})$/i);
  const ext = m ? m[1].toLowerCase() : '';
  if (m) s = s.slice(0, -m[0].length);
  let copySuffix = false;
  while (COPY.test(s)) {
    s = s.replace(COPY, '');
    copySuffix = true;
  }
  s = s.replace(/[‐‑‒–—―－]/g, '-').replace(/\s+/g, ' ').trim();
  return { base, stem: s, ext, copySuffix };
}

/** 只留文件名（给记录 / 包用：永远不带路径） */
export const basename = (file) => String(file ?? '').normalize('NFC').replace(/\\/g, '/').split('/').pop();

/** 编号 → id 用的写法：小写字母数字（XA-TP-01 → xatp01） */
export const codeSlug = (code) =>
  String(code || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/** 烤漆色号这类「编号就是名字」的（客人也看得到）：纯数字、P1 */
export const isColourCode = (code) => /^(\d{3,6}|P\d{1,2})$/.test(String(code || ''));

/** 一段文字切成词：结构词（树种 / 纹理 / 标记 / 大小板）切开名字，认不出来的连成一段留在 raw */
function tokenize(s) {
  const toks = [];
  let raw = '';
  let i = 0;
  const flush = () => {
    const w = raw.replace(/^[\s\-_]+|[\s\-_]+$/g, '');
    if (w) toks.push({ t: 'raw', zh: w });
    raw = '';
  };
  while (i < s.length) {
    const hit = STRUCT.find((x) => s.startsWith(x.zh, i));
    if (hit) {
      flush();
      toks.push(hit);
      i += hit.zh.length;
    } else {
      raw += s[i];
      i++;
    }
  }
  flush();
  return toks;
}

/** 名字里「是什么板」的词：strong 的一个就够；weak 取最后一个（诗意名字的中心词在最后） */
function kindWords(s) {
  const found = [];
  let i = 0;
  while (i < s.length) {
    const st = STRUCT.find((x) => s.startsWith(x.zh, i));
    if (st) {
      i += st.zh.length;
      continue;
    }
    const k = KINDW.find((x) => s.startsWith(x.zh, i));
    if (k) {
      found.push(k);
      i += k.zh.length;
    } else i++;
  }
  return found;
}

function codeFamily(code) {
  return code ? CODE_FAMILIES.find((f) => f.re.test(code)) || null : null;
}

/**
 * 解析一个板材文件名。
 * @returns {{ file, ext, stem, seq:number|null, seqHasHao:boolean, code:string|null, variant:string|null,
 *   species:{zh,en,proc}|null, grain:{zh,en,v}|null, flags:string[], finish:string|null, size:'big'|'small'|null,
 *   series:string|null, seriesNo:string|null, name:string|null, catHint:'wood'|'solid'|'stone'|'weave'|null,
 *   hint:'strong'|'weak'|null, raw:string[], warnings:string[], copySuffix:boolean, image:boolean }}
 */
export function parseBoardName(file) {
  const { base, stem, ext, copySuffix } = normalizeName(file);
  const out = {
    file: base,
    ext,
    stem,
    seq: null,
    seqHasHao: false,
    code: null,
    variant: null,
    species: null,
    grain: null,
    flags: [],
    finish: null,
    size: null,
    series: null,
    seriesNo: null,
    name: null,
    catHint: null,
    hint: null,
    raw: [],
    warnings: [],
    copySuffix,
    image: IMAGE_EXT.test(ext),
  };
  if (!out.image) out.warnings.push(CONVERT_EXT.test(ext) ? 'export-as-jpg' : 'not-an-image');
  let s = stem;

  // 0) 聊天软件 / 相机改过的名字：名字已经丢了 → 不编一个假名字
  if (LOST_NAME.test(s)) {
    out.warnings.push('name-lost', 'no-key');
    return out;
  }

  // 1) 大板 / 小板（同一块板的整张扫描和小样）
  const sz = s.match(/[\s\-_]*(大板|小板)$/);
  if (sz) {
    out.size = sz[1] === '大板' ? 'big' : 'small';
    s = s.slice(0, sz.index);
  }

  // 2) 只有编号：2810 · 6162 · P1 · AG033A · MS-2810 · U702AK097AL
  const compact = s.replace(/[\s_]+/g, '');
  if (/^\d{3,6}$/.test(compact) || ALNUM_CODE.test(compact) || new RegExp(`^${DASH_CODE.source}$`).test(compact) || (/^[A-Z0-9]{4,14}$/.test(compact) && /[A-Z]/.test(compact) && /\d/.test(compact))) {
    out.code = compact;
    return finish(out, '');
  }

  // 3) 带横线的厂家编号在哪里都认（XA-TP-01、SG-PK02-1）
  const dm = s.match(DASH_CODE);
  if (dm) {
    out.code = dm[0];
    s = (s.slice(0, dm.index) + ' ' + s.slice(dm.index + dm[0].length)).trim();
  }

  // 4) 前面的数字（R7）：后面有「号」= 序号；没有「号」时只有 ≤ 3 位 + 后面紧跟树种 / 纹理词才算序号，否则是色号（2810 墨绿 · 6162鼠尾草）
  const lead = s.match(/^(?:No\.?\s*|#)?0*(\d{1,6})\s*(号)?/i);
  if (lead && lead[0].trim()) {
    const digits = lead[1];
    const rest = s.slice(lead[0].length).replace(/^[\s\-_]+/, '');
    const vocabNext = STRUCT.some((x) => (x.t === 'species' || x.t === 'grain') && rest.startsWith(x.zh));
    if (lead[2] && digits.length <= 4) {
      out.seq = +digits;
      out.seqHasHao = true;
      s = rest;
    } else if (!lead[2] && digits.length <= 3 && vocabNext) {
      out.seq = +digits;
      out.warnings.push('seq-without-hao');
      s = rest;
    } else if (!lead[2] && !out.code && (digits.length >= 3 || !rest) && (!rest || IS_HAN.test(rest[0]))) {
      out.code = digits;
      s = rest;
    }
  }

  // 5) 编号在前（GPC003绅士灰八角藤编、XT011藤编）/ 编号在后（檀雾橡AG337、浅川橡02AG273、璞林AG305TD）
  if (!out.code) {
    const hm = s.match(HEAD_CODE);
    if (hm) {
      out.code = hm[1];
      s = s.slice(hm[0].length);
    } else {
      const tm = s.replace(/\s+$/, '').match(TAIL_CODE);
      if (tm && tm.index > 0) {
        out.code = tm[1];
        s = s.slice(0, tm.index);
      }
    }
  }
  s = s.replace(/^[\s\-_]+|[\s\-_]+$/g, '');
  // 名字后面紧跟两位数 = 变体（浅川橡02、素岩02）
  if (out.code && out.seq == null) {
    const vm = s.match(new RegExp(`^([${HAN}].*?)\\s*(\\d{2})$`));
    if (vm) {
      out.variant = vm[2];
      s = vm[1];
    }
  }

  // 6) 供应商色卡的写法：<系列><两三位数><名字>，例：罗维尔素岩03野径（没有序号、没有编号时）
  if (out.seq == null && !out.code) {
    const sw = s.match(new RegExp(`^([${HAN}]{2,8}?)(\\d{2,3})([${HAN}]{1,8})$`));
    if (sw) {
      out.series = sw[1];
      out.seriesNo = sw[2];
      out.name = sw[3];
      const k = kindWords(sw[1]).pop();
      if (k) {
        out.catHint = k.kind;
        out.hint = 'weak';
      }
      return out;
    }
  }
  return finish(out, s);
}

/** 剩下的名字 → 树种 / 纹理 / 标记 / 「是什么板」，再决定提示 */
function finish(out, s) {
  const toks = tokenize(s);
  for (const tk of toks) {
    if (tk.t === 'species') out.species = { zh: tk.zh, en: tk.en, proc: tk.proc }; // 两个树种词：最后一个是中心词（墨白橡 → 白橡）
    else if (tk.t === 'grain') out.grain = out.grain || { zh: tk.zh, en: tk.en, v: tk.v };
    else if (tk.t === 'flag') {
      if (!out.flags.includes(tk.v)) out.flags.push(tk.v);
      if (tk.finish) out.finish = tk.finish;
    } else if (tk.t === 'size') out.size = out.size || tk.v;
    else if (tk.t === 'raw') out.raw.push(tk.zh);
  }
  // 名字 = 文件名里剩下的那段（系列词「织系列」「编织膜」拿掉，前后的 - _ 空格去掉）
  let name = s;
  for (const k of KINDW) if (k.strip) name = name.split(k.zh).join(' ');
  name = name.replace(/\s+/g, ' ').replace(/^[\s\-_]+|[\s\-_]+$/g, '').trim();
  if (name) out.name = out.variant ? `${name} ${out.variant}` : name;

  // 是什么板：编号家族 / 树种纹理 / strong 词 → strong；否则名字里最后一个 weak 词
  const fam = codeFamily(out.code);
  const kw = kindWords(s);
  const strongW = kw.find((k) => k.strong);
  const flagKind = FLAGS.find((f) => f.kind && out.flags.includes(f.v));
  if (strongW && strongW.kind === 'weave') set(out, 'weave', 'strong');
  else if (fam?.kind === 'weave') set(out, 'weave', 'strong');
  else if (out.species || out.grain) set(out, 'wood', 'strong');
  else if (fam) set(out, fam.kind, 'strong');
  else if (strongW) set(out, strongW.kind, 'strong');
  else if (flagKind) set(out, flagKind.kind, 'weak');
  else if (kw.length) set(out, kw[kw.length - 1].kind, 'weak');
  if (strongW?.series) out.series = strongW.series;
  else if (fam?.series && !out.series) out.series = fam.series;
  if (out.catHint === 'weave' && out.hint === 'strong' && !out.series) out.series = '织系列';
  if (out.seq == null && !out.code) out.warnings.push('no-key');
  return out;
}

function set(out, kind, hint) {
  out.catHint = kind;
  out.hint = hint;
}

/** 文件名的 32 位指纹（没有像素指纹时给 sail-x 用；36 进制 5 位） */
export function hashWord(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return (h >>> 0).toString(36).padStart(7, '0').slice(0, 5);
}

/** 两个 64 位 dHash（16 位十六进制）差几位 */
export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i += 4) {
    let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16);
    while (x) {
      d += x & 1;
      x >>>= 1;
    }
  }
  return d;
}

const rgbOf = (hex) => {
  const n = parseInt(String(hex || '').replace('#', ''), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : null;
};
/** 两个平均色差多少（RGB 最大的那一个通道，0–255） */
export const hexGap = (a, b) => {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return A && B ? Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2])) : 0;
};
const isSolid = (x) => x?.kind === 'solid' || (!x?.kind && x?.catHint === 'solid');
/**
 * 两边的序号 / 编号对不上（都有序号但不一样，或都有编号但不一样）—— 那就不是同一块板，
 * 除非是同一个文件名（员工在板材库里把序号 2 改成了 4，再导入原来那个文件）。
 */
export function keysConflict(a, b) {
  if (a?.file && b?.file && a.file === b.file) return false;
  if (a?.seq != null && b?.seq != null && +a.seq !== +b.seq) return true;
  if (a?.code && b?.code && codeSlug(a.code) !== codeSlug(b.code)) return true;
  return false;
}
/**
 * 像素是不是同一块板（换了名字 / 重新导入，R8）：dHash 差 ≤ 4 位、原图像素一样大、平均色几乎一样，而且序号 / 编号不打架。
 * 纯色板几乎没有纹，dHash 都差不多（7023 和 6991 两块灰的 dHash 一样）：纯色要平均色差 ≤ 2，编号不一样就一定不是同一块。
 */
export const samePixels = (a, b) =>
  !!(a?.hash && b?.hash) &&
  hamming(a.hash, b.hash) <= 4 &&
  (!a.px || !b.px || (a.px[0] === b.px[0] && a.px[1] === b.px[1])) &&
  (!a.hex || !b.hex || hexGap(a.hex, b.hex) <= (isSolid(a) || isSolid(b) ? 2 : 6)) &&
  !keysConflict(a, b);

/** Windows 文件夹的排法（数字按大小：8号 在 11号 前面） */
const COLL = typeof Intl !== 'undefined' ? new Intl.Collator('zh', { numeric: true, sensitivity: 'base' }) : null;
export const naturalCompare = (a, b) => (COLL ? COLL.compare(String(a), String(b)) : String(a).localeCompare(String(b)));

/** 这块板新的 id 的底（还没去重） */
export function baseId(p) {
  if (p.seq != null) return `sail-${p.seq}`;
  if (p.code) return `sail-c${codeSlug(p.code)}`;
  const h = p.hash ? p.hash.slice(0, 8) : hashWord(p.file || p.stem || '');
  return `sail-x${h}`;
}

/**
 * 新的扫描图（像素换了）是不是板材库里已有的那块（R8：像素认不出来时，再看序号 / 编号 / 文件名）：
 *   同一个序号 + 同一个编号 · 同一个序号（两边都没有编号）· 没有序号、同一个编号 · 同一个文件名。
 * 返回 0 = 不是；数字越小越确定（同时有几块都像的时候取最确定的那块）。
 */
export function sameBoardRank(p, r) {
  if (!p || !r) return 0;
  const pc = codeSlug(p.code);
  const rc = codeSlug(r.code);
  const sameFile = !!(p.file && r.file && p.file === r.file);
  if (keysConflict(p, r)) return 0;
  if (p.seq != null && r.seq != null && +p.seq === +r.seq) {
    if (pc && rc) return 1;
    if (!pc && !rc) return sameFile ? 1 : 2;
  }
  if (p.seq == null && r.seq == null && pc && pc === rc) return sameFile ? 1 : 3;
  if (sameFile) return 4;
  return 0;
}

/**
 * 给一整个文件夹定 id（R8：id 第一次存的时候定下来，之后不改、不重用）。
 *   items：parseBoardName 的结果（可以带 hash / px / hex / kind）· known：已经有的板（这台设备 + 随网站发布的，含隐藏的）
 *   1) 像素一样（samePixels）→ 用它原来的 id（p.existing = id，p.matchedBy = 'pixels'）
 *   2) 像素换了（重新扫描过的同一块板）：同一个序号 + 编号 / 同一个序号 / 同一个编号 / 同一个文件名 → 原来的 id（matchedBy = 'keys'，存的时候 rev + 1）
 *      同一个编号有几块（7号 / 8号都是 XA-TP-01）只在说得清是哪一块时才认（序号也一样，或者文件名一样）
 *   「副本」「(1)」那一份：同一批里有原件时永远不认领已有的 id（原件才是那块板）
 *   3) 新板：sail-<序号> / sail-c<编号> / sail-x<指纹>；同一个序号有两块（2白橡直纹 + 2号红橡乱纹）→ 写了「号」的那个拿 sail-2，
 *      另一个 sail-2-b + 提醒 seq-duplicate（存之前要员工确认）
 *   · 厂家编号重复没关系（7号 / 8号都是 XA-TP-01），只列出来（p.sharedCode）
 * 改了 p.id / p.existing / p.matchedBy / p.warnings / p.sharedCode，返回同一个数组。
 */
export function assignIds(items, { known = [], taken = [] } = {}) {
  const used = new Set([...taken, ...known.map((r) => r.id)]);
  const claimed = new Set();
  const order = [...items].sort(
    (a, b) =>
      (a.seq ?? 1e9) - (b.seq ?? 1e9) ||
      a.copySuffix - b.copySuffix ||
      !!b.seqHasHao - !!a.seqHasHao ||
      naturalCompare(a.stem ?? a.file, b.stem ?? b.file) ||
      naturalCompare(a.file, b.file)
  );
  const live = [];
  for (const p of order) {
    p.id = null;
    p.existing = null;
    p.matchedBy = null;
    if (p.image !== false) live.push(p); // .tif / .pdf / .zip：不导入，不占 id
  }
  // 同一批里有原件的「副本」：不认领已有的 id
  const plain = new Set(live.filter((p) => !p.copySuffix).map((p) => p.stem));
  const mayClaim = (p) => !(p.copySuffix && plain.has(p.stem));
  const claim = (p, r, by) => {
    p.id = r.id;
    p.existing = r.id;
    p.matchedBy = by;
    claimed.add(r.id);
  };
  // 1) 像素一样
  for (const p of live) {
    if (!p.hash || !mayClaim(p)) continue;
    const r = known.find((x) => !claimed.has(x.id) && samePixels(p, x));
    if (r) claim(p, r, 'pixels');
  }
  // 2) 像素换了：序号 / 编号 / 文件名（只认说得清的那一块）
  for (const p of live) {
    if (p.id || !mayClaim(p)) continue;
    let best = null;
    let rank = 9;
    let ties = 0;
    for (const r of known) {
      if (claimed.has(r.id)) continue;
      const k = sameBoardRank(p, r);
      if (!k) continue;
      if (k < rank) {
        best = r;
        rank = k;
        ties = 1;
      } else if (k === rank) ties++;
    }
    if (best && ties === 1) claim(p, best, 'keys');
  }
  // 3) 新板
  for (const p of live) {
    if (p.id) continue;
    const b = baseId(p);
    let id = b;
    let n = 0;
    while (used.has(id)) {
      n++;
      id = `${b}-${String.fromCharCode(97 + n)}`;
    }
    if (n) p.warnings.push(p.copySuffix ? 'copy' : p.seq != null ? 'seq-duplicate' : p.code ? 'code-duplicate' : 'name-duplicate');
    used.add(id);
    p.id = id;
  }
  // 同一个序号的另一块板（这一批新加的，或板材库里已经有的）：也提醒 —— 客人会看到两个「2号」。
  // 两块都已经在板材库里（以前就决定两个都留 2号）→ 不再问
  const knownSeq = new Map();
  for (const r of known) if (r.seq != null && !r.hidden) knownSeq.set(+r.seq, [...(knownSeq.get(+r.seq) || []), r.id]);
  const fresh = live.filter((p) => p.seq != null && !p.existing && !(p.copySuffix && plain.has(p.stem)));
  for (const p of live) {
    if (p.seq == null || p.warnings.includes('seq-duplicate') || (p.copySuffix && plain.has(p.stem))) continue;
    const others = new Set(fresh.filter((x) => +x.seq === +p.seq).map((x) => x.id));
    if (!p.existing) for (const id of knownSeq.get(+p.seq) || []) others.add(id);
    others.delete(p.id);
    if (p.existing) others.delete(p.existing);
    if (others.size) p.warnings.push('seq-duplicate');
  }
  // 大板 + 小板：同名的小板不另外导入（大板做贴图）
  const bigs = new Set(items.filter((p) => p.size === 'big' && p.name).map((p) => p.name));
  for (const p of items) if (p.size === 'small' && p.name && bigs.has(p.name)) p.warnings.push('small-sample');
  // 共用的厂家编号
  const byCode = new Map();
  for (const p of items) if (p.code) byCode.set(p.code, [...(byCode.get(p.code) || []), p.id]);
  for (const p of items) {
    const ids = p.code ? byCode.get(p.code) : null;
    p.sharedCode = ids && ids.length > 1 ? ids.filter((x) => x !== p.id) : undefined;
  }
  return items;
}

/** 名字（不带序号）：zh = 文件名里的名字；en = 认得的词就翻成英文，诗意名字保留中文（专有名词）+ 树种英文 */
export function boardName(p) {
  const zh = p.name || (p.species ? p.species.zh : '') || '';
  const wordsOnly = !p.raw.length && (p.species || p.grain);
  let en;
  if (wordsOnly) {
    en = [p.species?.en, p.grain?.en?.toLowerCase(), p.flags.includes('plain') ? 'plain board' : null, p.flags.includes('knot') ? 'knotty' : null].filter(Boolean).join(', ');
    if (p.variant) en += ` ${p.variant}`;
  } else if (zh) en = p.species ? `${zh} · ${p.species.en}` : zh;
  else en = '';
  return { zh, en };
}

/** 显示名：7号 · 黑胡桃 / No. 7 · Black walnut；色号 2810 · 纯色；厂家编号（XA-TP-01）不在这里（只给员工看） */
export function displayName(rec) {
  const n = rec.name || { zh: '', en: '' };
  if (rec.seq != null) return { zh: `${rec.seq}号 · ${n.zh || '—'}`, en: `No. ${rec.seq} · ${n.en || n.zh || '—'}` };
  if (rec.code && isColourCode(rec.code)) return { zh: `${rec.code} · ${n.zh || '纯色'}`, en: `${rec.code} · ${n.en || n.zh || 'Solid colour'}` };
  if (n.zh || n.en) return { zh: n.zh || n.en, en: n.en || n.zh };
  return { zh: rec.code || '未命名', en: rec.code || 'Untitled' };
}

/**
 * 搜索：序号（7、7号）、编号（XA-TP-01、xatp01）、名字（黑胡桃、walnut）都找得到。
 *   · 只有数字（23、23号、No. 23）= 找序号，一模一样才算（或者一样的色号 2810）—— 不会找到文件名 …032300 里的 23；
 *   · P1 这种 = 找编号，一模一样才算（不会找到 XA-TP-10）；
 *   · 别的：编号 / 名字 / 系列 / 树种里有这几个字；不到 4 个字不看文件名（mmexport…234567 不会被「23」找到）
 */
export function boardMatches(rec, q) {
  const s = String(q || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
  if (!s) return true;
  const num = s.match(/^(?:no\.?\s*|#)?0*(\d{1,6})\s*号?$/);
  if (num) return (rec.seq != null && +rec.seq === +num[1]) || (isColourCode(rec.code) && /^\d+$/.test(rec.code) && +rec.code === +num[1]);
  if (/^p\d{1,2}$/.test(s)) return String(rec.code || '').toLowerCase() === s;
  const fields = [rec.code, codeSlug(rec.code), rec.name?.zh, rec.name?.en, rec.series, rec.species, rec.seq != null ? `${rec.seq}号` : ''];
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  const file = String(rec.file || '').toLowerCase();
  return s.split(/\s+/).every((w) => hay.includes(w) || hay.includes(codeSlug(w) || '\u0000') || (w.length >= 4 && file.includes(w)));
}
