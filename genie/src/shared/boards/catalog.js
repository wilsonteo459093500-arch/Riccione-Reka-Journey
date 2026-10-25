// 溪岸板材 · 文件名 ↔ 品牌目录（catalog-seed.json）的配对（纯函数；R10：v1 不读 PDF）。
// 配上了只是「建议」：导入器的「目录建议」一栏给员工看，一行一行「采用」或「全部采用」，不会自动改任何东西。
//
// 怎么配（一个比一个弱）：
//   code   文件名里的编号 = 目录的编号（AG294 ↔ AG294A/B/D：同一个颜色，A/B/D 是厚度）
//   colour 烤漆色号（2810 ↔ GKL001YJ「≈ 色号 2810」，P1 ↔ 色号 P1）
//   file   整理目录的人认出来「这个文件就是它」（1号红橡乱纹 ↔ XA-TP-09）—— 只建议编号，员工确认
//   name   名字对上（桑榆藤编 ↔ 织系列 桑榆）

import { codeSlug, normalizeName } from './parse.js';

/** 编号拆成底 + 厚度 / 封边后缀：AG294A → { base: 'AG294', suffix: 'A' }；带横线的（XA-TP-01）原样 */
export function splitCode(code) {
  const c = String(code || '')
    .normalize('NFKC')
    .toUpperCase()
    .trim();
  const m = c.match(/^([A-Z]{1,4}\d{2,4})([A-Z]{0,3})$/);
  if (m) return { base: m[1], suffix: m[2] };
  return { base: c, suffix: '' };
}

/** 目录建一次索引 */
export function indexSeed(seed) {
  const byCode = new Map();
  const byBase = new Map();
  const byColour = new Map();
  const byFile = new Map();
  const byName = [];
  const push = (m, k, e) => {
    if (!k) return;
    const a = m.get(k);
    if (a) a.push(e);
    else m.set(k, [e]);
  };
  for (const e of seed || []) {
    for (const c of e.codes || [e.code]) {
      push(byCode, codeSlug(c), e);
      const { base } = splitCode(c);
      if (base !== c) push(byBase, codeSlug(base), e);
      else push(byBase, codeSlug(c), e);
    }
    if (e.colourNo) push(byColour, String(e.colourNo).toUpperCase(), e);
    for (const f of e.files || []) push(byFile, normalizeName(f).stem, e);
    if (e.name && e.name.length >= 2) byName.push(e);
  }
  byName.sort((a, b) => b.name.length - a.name.length);
  return { byCode, byBase, byColour, byFile, byName, size: (seed || []).length };
}

const one = (arr) => (arr && arr.length ? arr : null);

/**
 * 一个解析过的文件名（parseBoardName 的结果）→ 目录建议，或 null。
 * @returns {{ entry, by: 'code'|'colour'|'file'|'name', fields: { code?, name?, series?, family?, kind?, grain?, finish?, proc? }, alts: number } | null}
 */
export function matchCatalog(p, index) {
  if (!p || !index?.size) return null;
  let hits = null;
  let by = null;
  if (p.code) {
    hits = one(index.byCode.get(codeSlug(p.code))) || one(index.byBase.get(codeSlug(splitCode(p.code).base)));
    if (hits) by = 'code';
    if (!hits && /^(\d{3,6}|P\d{1,2})$/i.test(p.code)) {
      hits = one(index.byColour.get(p.code.toUpperCase()));
      if (hits) by = 'colour';
    }
  }
  if (!hits && p.stem) {
    hits = one(index.byFile.get(p.stem));
    if (hits) by = 'file';
  }
  if (!hits && p.name && !p.code && p.seq == null) {
    const e = index.byName.find((x) => p.name.includes(x.name));
    if (e) {
      hits = [e];
      by = 'name';
    }
  }
  if (!hits) return null;
  const entry = hits[0];
  const fields = {};
  // 编号：文件名里没有、目录认得出来（file / name）→ 建议目录的编号；有色号的（2810）不换成 GKL 编号
  if (!p.code && (by === 'file' || by === 'name') && entry.code) fields.code = entry.code;
  if (entry.name && (by !== 'colour' || !p.name)) fields.name = entry.name;
  if (entry.series) fields.series = entry.series;
  if (entry.family) fields.family = entry.family;
  if (entry.kind) fields.kind = entry.kind;
  if (entry.grain) fields.grain = entry.grain;
  if (entry.finish) fields.finish = entry.finish;
  if (entry.proc) fields.proc = entry.proc;
  return { entry, by, fields, alts: hits.length - 1 };
}

/** 目录建议里，和这一行现在的资料不一样的那几项（界面只列这些；都一样 = 不用显示） */
export function catalogDiff(rec, proposal) {
  if (!proposal) return {};
  const out = {};
  const f = proposal.fields;
  if (f.code && f.code !== rec.code) out.code = f.code;
  if (f.name && f.name !== rec.name?.zh) out.name = f.name;
  if (f.series && f.series !== rec.series) out.series = f.series;
  if (f.kind && f.kind !== rec.kind) out.kind = f.kind;
  if (f.finish && f.finish !== rec.finish) out.finish = f.finish;
  return out;
}

/**
 * 一段文字（案例整理记下的「提到的材料」，例：罗维尔素岩03野径、XA-TP-01、7号）→ 板材库里可能是它的几块（最像的在前）。
 * 给案例库的「文件夹里提到：… → 是不是这块？」用（builder C 的 BoardPicker）。
 */
export function boardsForText(text, records, { max = 3 } = {}) {
  const s = String(text || '')
    .normalize('NFKC')
    .trim();
  if (!s || !records?.length) return [];
  const scored = [];
  const seqM = s.match(/(\d{1,3})\s*号/);
  const codes = [...s.matchAll(/[A-Z]{1,4}(?:-[A-Z0-9]{1,6}){1,3}|[A-Z]{1,4}\d{2,4}[A-Z]{0,3}|\b\d{4,6}\b/g)].map((m) => m[0]);
  for (const r of records) {
    let score = 0;
    if (seqM && r.seq === +seqM[1]) score += 3;
    for (const c of codes) {
      if (r.code && codeSlug(r.code) === codeSlug(c)) score += 4;
      else if (r.code && splitCode(r.code).base === splitCode(c).base) score += 3;
    }
    const nz = r.name?.zh || '';
    if (nz.length >= 2 && s.includes(nz)) score += 2 + Math.min(2, nz.length / 3);
    else if (nz.length >= 2) {
      // 名字的一部分（野径 ⊂ 罗维尔素岩03野径）
      for (let L = Math.min(nz.length, 4); L >= 2; L--) {
        if ([...Array(nz.length - L + 1)].some((_, i) => s.includes(nz.slice(i, i + L)))) {
          score += L / 2;
          break;
        }
      }
    }
    if (score >= 2) scored.push({ r, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.r);
}
