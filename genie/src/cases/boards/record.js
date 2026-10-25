// 溪岸板材导入 · 一行（一个文件）→ 一条板材记录（纯函数：Node 测试直接跑）。
//   row = { key, file, name, size, mtime, parsed（parseBoardName）, proposal（matchCatalog）, res（worker 的分析 + 出图）, edits（员工改的）, id, existing }
// 员工改的 > 采用了的目录建议 > 文件名 / 分析的默认值。记录的字段见 library-api.js 顶上（builder B 的 T0）。

import { boardName, isColourCode, naturalCompare, samePixels, parseBoardName } from '../../shared/boards/parse.js';
import { deriveNumbers, tagsFor, sizeOf, batchDensity, nearestProcedural, colourWord, lookWords } from '../../shared/boards/derive.js';
import { FINISH_BY_V } from '../../shared/boards/vocab.js';

export const KIND_LIST = ['wood', 'solid', 'stone', 'weave'];

/**
 * 这个类别默认用在哪（R1：只有柜体（含室内门）和墙板；编织 v1 只是资料）。
 * 石纹：先只做墙板 —— 除非是颗粒板（三聚氰胺饰面的柜体板，目录的「颗粒板」系列：沉云岩、云岫洞石…），那就柜体也能做。
 */
export function defaultUses(kind, series = '') {
  if (kind === 'weave' || kind === 'ask') return [];
  if (kind === 'stone') return String(series || '') === '颗粒板' ? ['cabinetry', 'feature'] : ['feature'];
  return ['cabinetry', 'feature'];
}

/** near 从哪些类别里找（柜体也用的石纹板 → 漆：柜体放不了石材，case.materials.cabinetry 要放得上） */
export function nearCats(kind, uses) {
  if (kind === 'stone') return uses.includes('cabinetry') ? ['paint'] : ['stone'];
  if (kind === 'solid') return ['paint'];
  return ['wood'];
}

/**
 * 目录建议采用到什么程度：
 *   'row'  = 员工一行一行按的「采用」（目录的编号也用，哪怕文件名里没有）；
 *   'bulk' = 「全部采用目录建议」（只有编号 / 色号对上的那些行；名字、系列、表面用目录的，编号永远只用文件名里的）
 */
export function acceptLevel(row) {
  const a = row.edits?.accept;
  if (!a || !row.proposal) return null;
  return a === 'bulk' ? 'bulk' : 'row';
}
/** 「全部采用」只采用编号 / 色号对上的建议（按文件名 / 名字猜的要员工对照实物，一行一行按） */
export const sureProposal = (p) => !!p && (p.by === 'code' || p.by === 'colour');

const LATIN = /[A-Za-z]/;
/** 名字有没有真正的英文（不是中文原样、也不是「中文 · 说明」） */
export const hasEnglish = (n) => !!(n && LATIN.test(n.en || '') && !(n.zh && String(n.en).startsWith(n.zh)));
/**
 * 英文名：认得的词翻成英文（Black walnut, crown cut）；诗意名字（深松、晓山白）= 中文 + · + 看得懂的说明
 * （目录的 look：Pure white；没有就按颜色：Light wood / Deep green / Beige stone）
 */
export function withEnglish(name, row) {
  const zh = String(name?.zh || '');
  const en = String(name?.en || '');
  if (!zh || LATIN.test(en)) return { zh, en: en || zh };
  const hex = row?.res?.stats?.hex;
  const kind = valueOf(row, 'kind');
  // 目录的 look 只在编号 / 色号对上（或员工按了采用）的时候用 —— 按名字猜的目录条目可能根本不是这块板
  const look = sureProposal(row?.proposal) || acceptLevel(row) ? row.proposal.entry?.look : '';
  const word = lookWords(look) || (hex ? colourWord(hex, kind === 'ask' ? 'solid' : kind) : '');
  return { zh, en: word ? `${zh} · ${word}` : zh };
}
/**
 * 目录的名字 → { zh, en }：全是认得的词 → 翻成英文（欧桦乱纹 → European birch, crown cut）；
 * 诗意名字 → 中文 + 目录的 look（沙棕橡 · Sandy light oak）；再不行 → 中文 + 树种 / 颜色
 */
function catalogName(zh, row) {
  const pc = parseBoardName(`${zh}.jpg`);
  const fromCat = boardName(pc);
  if (!pc.raw.length && (pc.species || pc.grain) && LATIN.test(fromCat.en || '')) return { zh, en: fromCat.en };
  const look = lookWords(row?.proposal?.entry?.look);
  if (look) return { zh, en: `${zh} · ${look}` };
  if (LATIN.test(fromCat.en || '')) return { zh, en: fromCat.en };
  return withEnglish({ zh, en: '' }, row);
}

/** 一行现在的值（员工改的 > 采用的目录建议 > 默认） */
export function valueOf(row, field) {
  const e = row.edits || {};
  if (e[field] !== undefined) return e[field];
  const level = acceptLevel(row);
  const f = level ? row.proposal.fields : {};
  const p = row.parsed;
  const r = row.res;
  // 已经在板材库里的板（重新导入 / 新的扫描图）：员工以前确认过的资料（名字、序号、编号、系列、类别、表面、用在哪）照旧，只换图
  const ex = row.existingRec || null;
  switch (field) {
    case 'kind':
      return ex?.kind || r?.kind || (p.catHint && p.hint === 'strong' ? p.catHint : 'ask');
    case 'seq':
      return ex ? ex.seq ?? null : p.seq;
    case 'code':
      // 编号只有员工一行一行确认过才用目录的（文件名里没有的编号会进设计师的下单资料）
      return (level === 'row' ? f.code : null) ?? (ex ? ex.code || '' : p.code ?? '');
    case 'name': {
      if (f.name) return catalogName(f.name, row);
      if (ex?.name?.zh) return { zh: ex.name.zh, en: ex.name.en || '' };
      const bn = boardName(p);
      // 诗意名字 + 树种（檀雾橡 · Oak）：编号对上目录的，用目录的 look 说得更清楚（檀雾橡 · Grey-washed oak）
      const look = sureProposal(row.proposal) ? lookWords(row.proposal.entry?.look) : '';
      if (look && bn.zh && String(bn.en).startsWith(`${bn.zh} · `)) return { zh: bn.zh, en: `${bn.zh} · ${look}` };
      return withEnglish(bn, row);
    }
    case 'series':
      return f.series ?? (ex ? ex.series || '' : p.series) ?? '';
    case 'finish':
      return ex?.finish ?? p.finish ?? f.finish ?? 'matte';
    case 'uses':
      if (Array.isArray(ex?.uses) && (!row.edits?.kind || row.edits.kind === ex.kind)) return [...ex.uses];
      // 系列：采用了的 / 文件名里的；编号对上目录的（沉云岩AG317 = 颗粒板）没按采用也算
      return defaultUses(valueOf(row, 'kind'), valueOf(row, 'series') || (sureProposal(row.proposal) ? row.proposal.fields.series || '' : ''));
    case 'fav':
      return !!row.existingRec?.fav;
    case 'hidden':
      return !!row.existingRec?.hidden;
    case 'rot':
      return r?.rot ?? 0;
    case 'crop':
      return r?.crop ?? [0, 0, 0, 0];
    case 'skip':
      return autoSkip(row);
    default:
      return undefined;
  }
}

/** 自动不导入的：不是图片、副本 / 和别的一样的图、同名大板的小板 */
export function autoSkip(row) {
  const w = row.parsed.warnings;
  return !row.parsed.image || w.includes('copy') || w.includes('small-sample') || !!row.dupOf;
}

/** 转过、裁过以后的像素（顺纹竖放：w = 横纹，h = 顺纹） */
export function finalPx(row) {
  const r = row.res;
  if (!r?.px) return null;
  const [l, t, rr, b] = valueOf(row, 'crop');
  const cw = r.px[0] - l - rr;
  const ch = r.px[1] - t - b;
  const rot = valueOf(row, 'rot');
  return rot === 90 || rot === 270 ? [ch, cw] : [cw, ch];
}

/** 同一批的整板密度（R5：≥ 3 张差不多大的整板才算） */
export function densityOf(rows) {
  return batchDensity(
    rows
      .filter((r) => r.res && !valueOf(r, 'skip'))
      .map((r) => {
        const px = finalPx(r);
        return { kind: valueOf(r, 'kind'), w: px[0], h: px[1] };
      })
  );
}

/** 同一张图出现两次（像素指纹一样、大小一样）：后面那张标「一样」，不导入 */
export function markDupes(rows) {
  const seen = [];
  // 序号 / 编号 / 类别也带上：两块纯色灰（6991 / 7023）像素指纹一样，但编号不一样 → 不是同一张图
  const key = (r) => ({ hash: r.res.hash, px: r.res.px, hex: r.res.stats?.hex, kind: r.res.kind, seq: valueOf(r, 'seq'), code: valueOf(r, 'code') || null });
  // 原件在前（没有「副本」「(1)」的那个），然后按 Windows 的顺序
  for (const r of [...rows].sort((a, b) => a.parsed.copySuffix - b.parsed.copySuffix || naturalCompare(a.parsed.stem, b.parsed.stem))) {
    r.dupOf = null;
    if (!r.res?.hash) continue;
    const first = seen.find((s) => samePixels(key(s), key(r)));
    if (first) r.dupOf = first.name;
    else seen.push(r);
  }
  return rows;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * 一行 → 板材记录（还不能存的：没分析完、不导入、类别还没选 → null）。
 * @param {object} row
 * @param {{ density?: number|null, materials?: object[], at?: string }} o
 */
export function buildRecord(row, { density = null, materials = [], at = today(), preview = false } = {}) {
  const r = row.res;
  if (!r || (!preview && (!row.id || valueOf(row, 'skip')))) return null;
  let kind = valueOf(row, 'kind');
  if (preview && !KIND_LIST.includes(kind)) kind = r.decided?.pixels && KIND_LIST.includes(r.decided.pixels) ? r.decided.pixels : 'solid';
  if (!KIND_LIST.includes(kind)) return null;
  if (!preview && needsName(row)) return null;
  const p = row.parsed;
  const finish = valueOf(row, 'finish');
  const hex = r.stats.hex;
  const num = deriveNumbers({ hex, kind, finish });
  const name = withEnglish(valueOf(row, 'name'), row);
  const series = valueOf(row, 'series');
  const [fw, fh] = finalPx(row);
  const sz = row.edits?.mm ? { mm: row.edits.mm, rule: 'manual', flag: false } : sizeOf({ kind, w: fw, h: fh, density, period: r.stats.period });
  const tags = tagsFor({ hex, lab: num.lab, kind, finish, light: num.light, series, look: row.proposal?.entry?.look || '' });
  const proc = kind === 'wood' ? p.species?.proc || row.proposal?.fields?.proc || null : null;
  const uses = kind === 'weave' ? [] : valueOf(row, 'uses');
  // 最接近的程序化材质：同一个色相、同一种树优先，不要人字拼（柜门不是地板的铺法）
  const near = nearestProcedural(num.lab, kind, materials, { proc, tags, cats: nearCats(kind, uses) });
  const ex = row.existingRec;
  const rec = {
    id: row.id,
    rev: 1,
    seq: valueOf(row, 'seq') ?? null,
    code: valueOf(row, 'code') || '',
    file: row.name,
    series: series || '',
    family: row.edits?.accept ? row.proposal?.fields?.family || '' : '',
    species: p.species?.zh || '',
    grain: kind === 'wood' ? p.grain?.v ?? row.proposal?.fields?.grain ?? null : null,
    flags: [...p.flags],
    name: { zh: name.zh || '', en: name.en || name.zh || '' },
    kind,
    finish,
    hex,
    dark: r.stats.dark,
    lab: num.lab,
    light: num.light,
    warm: num.warm,
    mood: num.mood,
    tags,
    rough: FINISH_BY_V[finish]?.rough ?? num.rough,
    proc,
    mm: sz.mm,
    sizeRule: sz.rule,
    sizeFlag: !!sz.flag,
    px: r.px,
    rot: valueOf(row, 'rot'),
    crop: valueOf(row, 'crop'),
    seam: r.seam,
    tiers: r.tiers,
    uses,
    fav: valueOf(row, 'fav'),
    hidden: valueOf(row, 'hidden'),
    near: near?.id || '',
    hash: r.hash,
    at: ex?.at || at,
    img: true,
  };
  if (rec.proc == null) delete rec.proc;
  if (ex) rec.rev = sameRecord(rec, ex) ? ex.rev || 1 : (ex.rev || 1) + 1;
  return rec;
}

const SAME_KEYS = ['seq', 'code', 'file', 'series', 'name', 'kind', 'finish', 'hex', 'mm', 'rot', 'crop', 'tiers', 'uses', 'fav', 'hidden', 'hash'];
/** 和已经存过的那份一样（不用 rev + 1，不用再存） */
export function sameRecord(a, b) {
  return SAME_KEYS.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
}

/** 没有名字、没有序号、也没有编号：客人会看到一串 id —— 先起个名字才存（聊天软件改过名的文件常这样） */
export function needsName(row) {
  return valueOf(row, 'seq') == null && !valueOf(row, 'code') && !(valueOf(row, 'name').zh || '').trim();
}

/** 这一行的提醒（界面上的黄 / 红小签）：code → 文字在 warnText */
export function rowWarnings(row) {
  const out = [];
  const w = row.parsed.warnings;
  const kind = valueOf(row, 'kind');
  // 员工已经起了名字（或填了序号 / 编号）：「文件名丢了」「没有序号也没有编号」不再要处理（界面改成一个灰的「原文件名：…」）
  const named = !!((row.edits?.name?.zh || '').trim() || row.edits?.seq != null || (row.edits?.code || '').trim());
  for (const c of ['name-lost', 'no-key', 'seq-duplicate', 'code-duplicate', 'name-duplicate', 'seq-without-hao', 'export-as-jpg', 'not-an-image', 'copy', 'small-sample']) {
    if (!w.includes(c)) continue;
    if (named && (c === 'name-lost' || c === 'no-key')) continue;
    if (c === 'seq-duplicate' && row.edits?.seqOk) continue;
    out.push(c);
  }
  if (row.dupOf) out.push('dup-pixels');
  if (row.res && kind === 'ask') out.push('ask');
  if (!valueOf(row, 'skip') && needsName(row)) out.push('need-name');
  if (row.res && kind === 'wood' && row.res.grain === 'diag' && row.edits?.rot === undefined) out.push('diag');
  if (row.res?.jpeg) out.push('jpeg');
  if (row.error) out.push('error');
  return out;
}

/** 提醒里哪些要员工处理（红），哪些只是知道一下（黄） */
export const WARN_SEVERE = new Set(['ask', 'need-name', 'name-lost', 'seq-duplicate', 'error', 'jpeg']);
/** 一行只放一条提醒：最要紧的那条（红的在前，按这个顺序） */
const WARN_ORDER = ['error', 'jpeg', 'ask', 'need-name', 'name-lost', 'seq-duplicate', 'dup-pixels', 'copy', 'small-sample', 'diag', 'no-key', 'code-duplicate', 'name-duplicate', 'seq-without-hao', 'export-as-jpg', 'not-an-image'];
export function topWarning(warns) {
  return [...warns].sort((a, b) => WARN_ORDER.indexOf(a) - WARN_ORDER.indexOf(b))[0] || null;
}
/** 起了名字的「文件名丢了」行：只留一个灰的说明「原文件名：…」 */
export const renamedFromLost = (row) => !!(row.parsed.warnings.includes('name-lost') && (row.edits?.name?.zh || '').trim());

/** 中文的提醒文字（界面用 t() 翻成英文） */
export const WARN_TEXT = {
  'name-lost': '文件名丢了（聊天软件改过名）',
  'no-key': '没有序号也没有编号',
  'seq-duplicate': '序号重复，请改成对的序号',
  'code-duplicate': '同一个编号有两个文件',
  'name-duplicate': '同名的文件有两个',
  'seq-without-hao': '文件名没有「号」',
  'export-as-jpg': '这种格式读不了，请另存成 JPG',
  'not-an-image': '不是图片，跳过',
  copy: '副本，跳过',
  'small-sample': '小板（同名的大板做贴图）',
  'dup-pixels': '和另一张是同一张图，跳过',
  ask: '请选类别',
  'need-name': '起个名字再存（客人会看到这个名字）',
  diag: '纹是斜的，请转一下',
  jpeg: '这个浏览器编不出 WebP，请用 Chrome / Edge',
  error: '这张图读不出来',
};

/** 排序：要处理的在前（类别没定的最前），然后按 Windows 文件夹的顺序 */
export function sortRows(rows) {
  const rank = (r) => {
    const w = rowWarnings(r);
    if (valueOf(r, 'skip')) return 3;
    if (w.includes('ask') || w.includes('error') || w.includes('need-name')) return 0;
    if (w.some((c) => WARN_SEVERE.has(c))) return 1;
    return 2;
  };
  return [...rows].sort((a, b) => rank(a) - rank(b) || naturalCompare(a.name, b.name));
}

/** 「显示名」（和 3D 里一样）：7号 · 黑胡桃 / 2810 · 纯色 / 檀雾橡 */
export function rowLabel(row) {
  const seq = valueOf(row, 'seq');
  const n = valueOf(row, 'name');
  const code = valueOf(row, 'code');
  if (seq != null) return { head: `${seq}号`, headEn: `No. ${seq}`, zh: n.zh, en: n.en };
  if (code && isColourCode(code)) return { head: code, headEn: code, zh: n.zh, en: n.en };
  return { head: '', headEn: '', zh: n.zh || code, en: n.en || n.zh || code };
}
