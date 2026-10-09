// ============================================================
// Word 导出 DOCX EXPORT
// ------------------------------------------------------------
// 只读文档模型（lib/docmodel.js → { meta, blocks }），与 PDF / Excel 内容一致。
// 浏览器（Vite 动态 import）与 Node（测试）通用：Packer.toArrayBuffer → Blob。
//
// 版式（照公司 Word 模板）：A4 竖版 · 抬头 logo + 角标 · 中文为主英文为辅 ·
// 章节条（奶油底 + 赤陶左边线）· 检查表 / 表格 / 照片 / 统计 / 签名 ·
// 每页页脚「公司 · 报告 · 第 X / Y 页」，第 2 页起有细抬头。
//
// exportDocx(model, media, { logo }) → Promise<Blob>
//   media.get(id) → { kind, blob, thumb, poster?, w, h, duration?, caption? } | null
//   logo = PNG 的 ArrayBuffer | Uint8Array | Blob（可省略）
// ============================================================
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeightRule,
  ImageRun,
  LineRuleType,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { modelMedia } from '../docmodel.js';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ---------- 版式常量 ----------
const MM = 1440 / 25.4; // 1mm = 56.7 DXA（twips）
const PX = 96 / 25.4; // 1mm = 3.78px（ImageRun 尺寸单位）
const PAGE = { w: 11906, h: 16838, top: 720, bottom: 794, side: 737, header: 397, footer: 397 };
const TW = PAGE.w - PAGE.side * 2; // 正文宽 10432 DXA ≈ 184mm
const PAD = 90; // 单元格左右内边距

// 品牌色（来自公司 Word 模板）
const C = {
  ink: '2B2A27',
  body: '55524B',
  muted: '8A857C',
  faint: 'B3ACA0',
  line: 'E4DCCB',
  cream: 'F8F4EB',
  cream2: 'F1EBDE',
  photoBg: 'FCFAF6',
  terracotta: 'B5623A',
};
// warn 用 PDF（components/doc/theme.js）的琥珀色：与 fail 的红区分开（有条件开工 ≠ NO-GO）
const TONE = { pass: '3F7A4F', fail: 'B8452F', na: '8A857C', warn: 'B7791F', neutral: '55524B' };
const TINT = { pass: 'EAF2EC', fail: 'F8E5E0', na: 'F1EFEA', warn: 'FBF3E1', neutral: 'F8F4EB' };

const FONT = { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Microsoft YaHei', cs: 'Arial' };
// ☑ ☐ ★ ▶ 用符号字体：Windows Word 显示为单色字形，可按结果着色（缺字体时由系统替换）
const SYM = { ascii: 'Segoe UI Symbol', hAnsi: 'Segoe UI Symbol', eastAsia: 'Segoe UI Symbol', cs: 'Segoe UI Symbol' };
const BOX_ON = '☑';
const BOX_OFF = '☐';
const NBSP = String.fromCharCode(0xa0);

// ---------- 小工具 ----------
const sum = (a) => a.reduce((s, x) => s + x, 0);
const hex = (c, fb = C.terracotta) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim());
  return m ? m[1].toUpperCase() : fb;
};

// XML 不允许的控制字符 / 落单代理项（手机输入法偶尔会带进来）→ 删掉，避免 Word 报「内容有问题」
const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF]|\uFFFE|\uFFFF/;
function clean(s) {
  if (s == null) return '';
  const str = String(s);
  if (!BAD.test(str)) return str;
  let out = '';
  for (let i = 0; i < str.length; i += 1) {
    const c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = str.charCodeAt(i + 1);
      if (n >= 0xdc00 && n <= 0xdfff) {
        out += str[i] + str[i + 1];
        i += 1;
      }
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) continue;
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0xfffe || c === 0xffff) continue;
    out += str[i];
  }
  return out;
}

/** 双语标签统一成 { zh, en }（字符串 = 只有 zh） */
function lab(x) {
  if (x == null || x === '') return { zh: '', en: '' };
  if (typeof x === 'string' || typeof x === 'number') return { zh: clean(x).trim(), en: '' };
  const zh = clean(x.zh || '').trim();
  const en = clean(x.en || '').trim();
  return en === zh ? { zh, en: '' } : { zh, en };
}

/** 整数列宽，按权重分配，保证总和 = total */
function splitWidths(total, weights) {
  const ws = weights.map((w) => (w > 0 ? w : 1));
  const s = sum(ws);
  const out = ws.map((w) => Math.floor((total * w) / s));
  out[out.length - 1] += total - sum(out);
  return out;
}

// ---------- 文字 / 段落 ----------
function T(text, o = {}) {
  return new TextRun({
    text: clean(text),
    size: Math.round((o.size ?? 9) * 2),
    color: o.color ?? C.ink,
    bold: o.bold || undefined,
    italics: o.italic || undefined,
    characterSpacing: o.spacing || undefined,
    font: o.font,
    break: o.br || undefined,
    underline: o.underline ? {} : undefined,
  });
}

/** 多行文字 → 同一段落里用换行分隔的 runs */
function TL(text, o = {}) {
  const lines = clean(text).replace(/\r\n?/g, '\n').split('\n');
  return lines.map((ln, i) => T(ln, { ...o, br: i ? 1 : 0 }));
}

function P(children, o = {}) {
  const spacing = { before: o.before ?? 0, after: o.after ?? 0 };
  if (o.line) {
    spacing.line = o.line;
    spacing.lineRule = o.exact ? LineRuleType.EXACT : LineRuleType.AUTO;
  }
  return new Paragraph({
    children: [].concat(children ?? []).filter(Boolean),
    alignment: o.align,
    spacing,
    keepNext: o.keep || undefined,
    keepLines: o.keepLines || undefined,
    indent: o.indent,
    border: o.border,
    tabStops: o.tabs,
  });
}

/** 固定高度的空段落（块间距；两个表格之间必须隔一个段落，否则 Word 会把它们并成一张表） */
const gap = (h = 160, keep = false) =>
  new Paragraph({
    children: [],
    spacing: { before: 0, after: 0, line: Math.max(20, Math.round(h)), lineRule: LineRuleType.EXACT },
    keepNext: keep || undefined,
  });

/** 双语 runs：中文主（粗）+ 英文次（小号灰） */
function bi(label, o = {}) {
  const l = lab(label);
  const runs = [];
  if (l.zh) runs.push(T(l.zh, { size: o.zhSize ?? 9, bold: o.bold, italic: o.zhItalic, color: o.zhColor ?? C.ink, spacing: o.zhSpacing }));
  if (l.en) {
    const sep = l.zh && !o.enBreak ? (o.sep ?? ' ') : '';
    runs.push(
      T(sep + l.en, {
        size: o.enSize ?? 7.5,
        color: o.enColor ?? C.muted,
        italic: o.enItalic,
        bold: o.enBold,
        spacing: o.enSpacing,
        br: l.zh && o.enBreak ? 1 : 0,
      }),
    );
  }
  return runs;
}

/** 双语两段：中文一段 + 英文一段（标准 / 方法栏） */
function biParas(label, o = {}) {
  const l = lab(label);
  const out = [];
  if (l.zh) out.push(P(T(l.zh, { size: o.zhSize ?? 8, color: o.zhColor ?? C.body }), { keep: o.keep }));
  if (l.en) out.push(P(T(l.en, { size: o.enSize ?? 7, color: C.muted, italic: o.enItalic }), { keep: o.keep, before: l.zh ? 10 : 0 }));
  return out;
}

const isUrl = (v) => {
  const s = String(v || '').trim();
  if (!/^https?:\/\/\S+$/i.test(s)) return false;
  try {
    return !!new URL(s);
  } catch {
    return false;
  }
};

/** 链接 → 可点击（赤陶色下划线）；其他 → 普通文字 */
function textOrLink(value, o = {}, A = C.terracotta) {
  const s = clean(value).trim();
  if (isUrl(s)) {
    return [new ExternalHyperlink({ link: encodeURI(decodeURISafe(s)), children: [T(s, { ...o, size: (o.size ?? 9) - 0.5, color: A, underline: true })] })];
  }
  return TL(value, o);
}

function decodeURISafe(s) {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

// ---------- 表格 ----------
const line = (color = C.line, size = 4, style = BorderStyle.SINGLE) => ({ style, size, color });
const NIL = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const GRID = { top: line(), bottom: line(), left: line(), right: line(), insideHorizontal: line(), insideVertical: line() };
const NO_BORDERS = { top: NIL, bottom: NIL, left: NIL, right: NIL, insideHorizontal: NIL, insideVertical: NIL };
const CELL_MARGINS = { top: 45, bottom: 45, left: PAD, right: PAD };

function TC(children, o = {}) {
  const kids = [].concat(children ?? []).filter(Boolean);
  return new TableCell({
    children: kids.length ? kids : [P([])],
    width: o.w ? { size: Math.round(o.w), type: WidthType.DXA } : undefined,
    columnSpan: o.span > 1 ? o.span : undefined,
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    verticalAlign: o.top ? VerticalAlign.TOP : o.bottom ? VerticalAlign.BOTTOM : VerticalAlign.CENTER,
    borders: o.borders,
    margins: o.margins,
  });
}

// 「行不可跨页」只给不太高的行：Word 里不可拆分的行若比一页还高，超出页底的部分直接被裁掉
// （LibreOffice 有时也会裁），所以长备注 / 长文本所在的行按估算高度改成允许跨页拆开。
const LONG_MM = 100; // 约 25 行 8pt 文字；整页正文约 270mm，估算偏小一倍也不会超页

/** 估算文字在 width（DXA）宽的格子里排出来的高度（mm）：显式换行 + 按字宽折行 */
function textH(text, pt, width) {
  const s = clean(text);
  if (!s.trim()) return 0;
  const per = Math.max(5, width / MM);
  let n = 0;
  for (const ln of s.replace(/\r\n?/g, '\n').split('\n')) n += Math.max(1, Math.ceil(textMm(ln, pt) / per));
  return n * pt * 0.3528 * 1.4;
}

/** 双语文字（中文一段 + 英文一段）的估算高度 */
const biH = (x, width, zhPt = 8, enPt = 7) => {
  const l = lab(x);
  return textH(l.zh, zhPt, width) + textH(l.en, enPt, width);
};

function TR(cells, o = {}) {
  return new TableRow({
    children: cells,
    cantSplit: o.cantSplit ?? true,
    tableHeader: o.header || undefined,
    height: o.minH ? { value: Math.round(o.minH), rule: HeightRule.ATLEAST } : undefined,
  });
}

function TBL(widths, rows, o = {}) {
  const ws = widths.map((w) => Math.round(w));
  return new Table({
    rows,
    columnWidths: ws,
    width: { size: sum(ws), type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: o.borders ?? GRID,
    margins: o.margins ?? CELL_MARGINS,
  });
}

/** 单格整宽框（章节条 / 说明框 / 结论框） */
function box(children, { fill, left, margins, w = TW } = {}) {
  return TBL([w], [TR([TC(children, { w, fill, borders: { top: NIL, bottom: NIL, right: NIL, left: left || NIL } })])], {
    borders: NO_BORDERS,
    margins: margins ?? { top: 70, bottom: 70, left: 150, right: 150 },
  });
}

// ---------- 媒体 ----------
async function bytesOf(src) {
  if (!src) return null;
  let u8 = null;
  if (src instanceof Uint8Array) u8 = src;
  else if (src instanceof ArrayBuffer) u8 = new Uint8Array(src);
  else if (ArrayBuffer.isView(src)) u8 = new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
  else if (typeof src.arrayBuffer === 'function') u8 = new Uint8Array(await src.arrayBuffer());
  if (!u8 || !u8.length) return null;
  // 视图偏移不为 0 时复制一份，避免下游把整个底层 buffer 写进文件
  return u8.byteOffset || u8.byteLength !== u8.buffer.byteLength ? u8.slice() : u8;
}

const be16 = (b, i) => (b[i] << 8) | b[i + 1];
const be32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le32 = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);

function jpegSize(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const m = b[i + 1];
    if (m === 0xff) {
      i += 1;
      continue;
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: be16(b, i + 5), w: be16(b, i + 7) };
    }
    i += 2 + be16(b, i + 2);
  }
  return { w: 0, h: 0 };
}

/** 看文件头判断格式 + 尺寸（Word 只认 jpg / png / gif / bmp） */
function imageInfo(b) {
  if (!b || b.length < 26) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: 'png', w: be32(b, 16), h: be32(b, 20) };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'jpg', ...jpegSize(b) };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { type: 'gif', w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
  if (b[0] === 0x42 && b[1] === 0x4d) return { type: 'bmp', w: Math.abs(le32(b, 18)), h: Math.abs(le32(b, 22)) };
  return null;
}

async function toImage(src, fbW, fbH) {
  const data = await bytesOf(src).catch(() => null);
  const info = imageInfo(data);
  if (!info) return null;
  let { w, h } = info;
  if (!(w > 0 && h > 0)) {
    w = fbW > 0 ? fbW : 4;
    h = fbH > 0 ? fbH : 3;
  }
  return { data, type: info.type, w, h };
}

/** 预加载文档里引用的全部媒体 → Map<id, { kind, img|null, caption, duration }>；读不到的跳过 */
async function loadMedia(model, media) {
  const M = new Map();
  if (!media || typeof media.get !== 'function') return M;
  await Promise.all(
    modelMedia(model).map(async (ref) => {
      try {
        const m = await media.get(ref.id);
        if (!m) return;
        const kind = m.kind || ref.kind || 'photo';
        // 照片用原图（长边 1600），不认识的格式退回缩略图；视频用封面
        // 照片在 Word 里最大约 42mm 宽：360px 缩略图已有 ~218dpi，文件小很多；签名用原图
        const cands = kind === 'video' ? [m.poster, m.thumb] : kind === 'signature' ? [m.blob, m.thumb] : [m.thumb, m.blob];
        let img = null;
        for (const c of cands) {
          img = await toImage(c, m.w, m.h);
          if (img) break;
        }
        if (!img && kind !== 'video') return;
        M.set(ref.id, { kind, img, caption: clean(m.caption || ref.caption || '').trim(), duration: m.duration });
      } catch {
        /* 单张媒体出错不影响整份文档 */
      }
    }),
  );
  return M;
}

async function loadLogo(logo) {
  if (!logo) return null;
  try {
    return await toImage(logo, 700, 268);
  } catch {
    return null;
  }
}

/** 按最大宽高（mm）等比缩放 → { w, h } mm */
function fit(img, maxW, maxH) {
  const s = Math.min(maxW / img.w, maxH / img.h);
  return { w: img.w * s, h: img.h * s };
}

function imgRun(img, maxW, maxH) {
  const s = fit(img, maxW, maxH);
  return new ImageRun({
    type: img.type,
    data: img.data,
    transformation: { width: Math.max(1, Math.round(s.w * PX)), height: Math.max(1, Math.round(s.h * PX)) },
  });
}

const fmtDur = (sec) => {
  const n = Math.round(Number(sec) || 0);
  return n > 0 ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : '';
};

/** 视频说明：▶ 视频（0:42）请见群组（▶ 用符号字体，避免被显示成彩色 emoji） */
function videoRuns(sec, o = {}) {
  const d = fmtDur(sec);
  return [T('▶ ', { ...o, font: SYM }), T(d ? `视频（${d}）请见群组` : '视频 请见群组', o)];
}

/** 可用的媒体（过滤掉读不到的） */
const avail = (refs, M) => (refs || []).filter((r) => r && r.id && M.has(r.id));

/**
 * 照片组 → 无框内嵌表格（统一的相册格子）：每格 ≤ maxW × maxH mm，等比居中，
 * 一行 3–4 张，图说 / 视频说明在图下。width = 可用宽度 DXA。
 */
function photoBlock(refs, M, { width = TW - 2 * PAD, maxW = 42, maxH = 32 } = {}) {
  const list = avail(refs, M).map((r) => M.get(r.id));
  if (!list.length) return [];
  const out = [];
  const gapMm = 3;
  const availMm = width / MM;
  const w = Math.max(10, Math.min(maxW, availMm - gapMm));
  const perLine = Math.max(1, Math.floor(availMm / (w + gapMm)));
  const slot = Math.floor(Math.min(width / perLine, (w + gapMm) * MM));
  const withImg = list.filter((m) => m.img);
  if (withImg.length) {
    const cols = Math.min(perLine, withImg.length);
    const rows = [];
    for (let i = 0; i < withImg.length; i += cols) {
      const cells = [];
      for (let j = 0; j < cols; j += 1) {
        const m = withImg[i + j];
        const kids = [];
        if (m) {
          kids.push(P(imgRun(m.img, w, maxH), { align: AlignmentType.CENTER }));
          const cap = { size: 7, color: C.muted };
          if (m.kind === 'video') kids.push(P(videoRuns(m.duration, cap), { align: AlignmentType.CENTER, before: 20 }));
          else if (m.caption) kids.push(P(T(m.caption, cap), { align: AlignmentType.CENTER, before: 20 }));
        }
        cells.push(TC(kids, { w: slot, top: true }));
      }
      rows.push(TR(cells));
    }
    out.push(TBL(Array(cols).fill(slot), rows, { borders: NO_BORDERS, margins: { top: 40, bottom: 40, left: 0, right: 0 } }));
  }
  // 没有封面的视频：只写一行文字
  for (const m of list.filter((x) => !x.img)) out.push(P(videoRuns(m.duration, { size: 7.5, color: C.muted }), { before: 30 }));
  return out;
}

// ---------- 抬头 ----------
function headerBlock(meta, logo, A) {
  const out = [];
  const W = splitWidths(TW, [55, 45]);
  const left = [];
  if (logo && meta.brand !== 'plain') left.push(P(imgRun(logo, 38, 16)));
  else left.push(P(T(meta.company || '溪岸 Sail by Riccione Reka', { size: 12, bold: true })));
  const right = [];
  const b = meta.badge;
  if (b) {
    const l = lab(b);
    if (b.sub) {
      // { zh: '内部文件', en: 'INTERNAL', sub: {zh,en} } → INTERNAL · 内部文件 / 无需出示客户 not for client
      const s = lab(b.sub);
      right.push(
        P(
          [
            l.en && T(l.en, { size: 8, bold: true, color: A, spacing: 30 }),
            l.en && l.zh && T(' · ', { size: 8, color: A }),
            l.zh && T(l.zh, { size: 8, bold: true }),
          ],
          { align: AlignmentType.RIGHT },
        ),
      );
      if (s.zh || s.en) {
        right.push(P(bi(s, { zhSize: 7, zhColor: C.muted, enSize: 7, enItalic: true }), { align: AlignmentType.RIGHT, before: 20 }));
      }
    } else {
      // { zh: 'INTERNAL · 内部文件', en: '无需出示客户 not for client' }
      if (l.zh) right.push(P(T(l.zh, { size: 8, bold: true, color: A, spacing: 20 }), { align: AlignmentType.RIGHT }));
      if (l.en) right.push(P(T(l.en, { size: 7, italic: true, color: C.muted }), { align: AlignmentType.RIGHT, before: 20 }));
    }
  } else if (meta.brand === 'vsmooth' && !/V-SMOOTH/i.test(meta.kicker || '')) {
    right.push(P(T('V-SMOOTH', { size: 9, bold: true, color: A, spacing: 60 }), { align: AlignmentType.RIGHT }));
  }
  out.push(
    TBL(W, [TR([TC(left, { w: W[0], bottom: true }), TC(right, { w: W[1], bottom: true })])], {
      borders: { ...NO_BORDERS, bottom: line(A, 8) },
      margins: { top: 0, bottom: 90, left: 0, right: 0 },
    }),
  );

  if (meta.kicker) out.push(P(T(meta.kicker, { size: 7.5, bold: true, color: A, spacing: 24 }), { before: 150 }));
  const t = lab(meta.title);
  out.push(
    P(
      [
        t.zh && T(t.zh, { size: 20, bold: true }),
        t.en && T((t.zh ? '   ' : '') + t.en, { size: t.zh ? 10.5 : 18, bold: true, color: A, spacing: t.zh ? 30 : 10 }),
      ],
      { before: meta.kicker ? 50 : 170, after: 40 },
    ),
  );
  // 副标题整体斜体：中文赤陶、英文灰
  const st = lab(meta.subtitle);
  if (st.zh || st.en) {
    out.push(P(bi(st, { zhSize: 9, zhColor: A, zhItalic: true, enSize: 8, enItalic: true, sep: '   ' }), { after: 40 }));
  }
  if (meta.intro?.length) {
    const kids = [];
    meta.intro.forEach((it, i) => {
      const l = lab(it);
      if (l.zh) kids.push(P(T(l.zh, { size: 8.5, color: C.body }), { before: i ? 90 : 0 }));
      if (l.en) kids.push(P(T(l.en, { size: 7.5, color: C.muted }), { before: l.zh ? 20 : i ? 90 : 0 }));
    });
    if (kids.length) {
      out.push(gap(100), box(kids, { fill: C.cream, left: line(A, 12), margins: { top: 90, bottom: 90, left: 180, right: 180 } }));
    }
  }
  if (meta.legend) out.push(P(legendRuns(meta.legend, A), { before: 100 }));
  return out;
}

/** 图例一行：★ 赤陶色，其余正文色 */
function legendRuns(text, A) {
  const parts = clean(text).split('★');
  const runs = [];
  parts.forEach((p, i) => {
    if (i) runs.push(T('★', { size: 8, color: A, font: SYM }));
    if (p) runs.push(T(p, { size: 7.5, color: C.body }));
  });
  return runs;
}

// ---------- 章节条 ----------
// 章节条做成内容表格的第一行（表头，跨页重复）：Word / LibreOffice 都只在同一张表的行之间
// 遵守「与下段同页」，单独一张表时标题会孤零零留在页底。

/** 章节条内容：'{no}  {EN} · {zh}' + 说明 + '共 N 项 · 其中关键项 K 项' */
function headParas(b, A, counts) {
  const t = lab(b.title);
  if (!t.zh && !t.en && !b.no) return null;
  const runs = [];
  if (b.no) runs.push(T(String(b.no), { size: 11, bold: true, color: A }), T('   ', { size: 10 }));
  if (t.en) runs.push(T(t.en, { size: 9.5, bold: true, color: A, spacing: 16 }));
  if (t.en && t.zh) runs.push(T('  ·  ', { size: 9.5, bold: true, color: A }));
  if (t.zh) runs.push(T(t.zh, { size: 10.5, bold: true }));
  const kids = [P(runs, { keep: true })];
  const n = lab(b.note);
  if (n.zh || n.en) {
    kids.push(P(bi(n, { zhSize: 8, zhColor: C.body, enSize: 7.5, enItalic: true, sep: '   ' }), { keep: true, before: 30 }));
  }
  if (counts?.key) {
    kids.push(P(T(`共 ${counts.total} 项 · 其中关键项 ${counts.key} 项`, { size: 7.5, color: C.muted }), { keep: true, before: 30 }));
  }
  return kids;
}

const HEAD_MARGINS = { top: 70, bottom: 70, left: 150, right: 150 };

/**
 * 表格里的章节条行 + 间隔行。span = 表格网格列数。
 * repeat：跨页重复（与列标题一起）；rule：间隔行下边画一条细线（作为下方第一行的上边框）。
 */
function headRows(b, A, { counts, span = 1, repeat = true, rule = true } = {}) {
  const kids = headParas(b, A, counts);
  if (!kids) return [];
  const heading = TR(
    [TC(kids, { w: TW, span, fill: C.cream2, margins: HEAD_MARGINS, borders: { top: NIL, right: NIL, bottom: NIL, left: line(A, 24) } })],
    { header: repeat },
  );
  const spacer = new TableRow({
    tableHeader: repeat || undefined,
    cantSplit: true,
    height: { value: 80, rule: HeightRule.EXACT },
    children: [
      TC([P([], { keep: true, line: 20, exact: true })], {
        w: TW,
        span,
        borders: { top: NIL, left: NIL, right: NIL, bottom: rule ? line() : NIL },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      }),
    ],
  });
  return [heading, spacer];
}

/** 独立章节条（放在「整块不分页」容器里用） */
function sectionHead(b, A, counts) {
  const kids = headParas(b, A, counts);
  return kids ? [box(kids, { fill: C.cream2, left: line(A, 24), margins: HEAD_MARGINS }), gap(80, true)] : [];
}

/** 整块不分页：单格无框表格 + 行不可拆分（统计 / 签名这类短块）；split = 内容很长，允许跨页 */
function keepTogether(children, split = false) {
  const kids = [...children];
  if (!(kids[kids.length - 1] instanceof Paragraph)) kids.push(gap(20));
  return TBL([TW], [TR([TC(kids, { w: TW, top: true, borders: { top: NIL, bottom: NIL, left: NIL, right: NIL } })], { cantSplit: !split })], {
    borders: NO_BORDERS,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
}

// ---------- 信息栏 fields ----------
function fieldValue(f, M, width, A, o = {}) {
  const size = o.size ?? 9;
  if (f.kind === 'photos') return photoBlock(f.photos, M, { width });
  if (f.kind === 'video') return photoBlock(f.video ? [f.video] : [], M, { width });
  if (f.kind === 'list') {
    const lines = (f.lines || []).map(clean).filter((s) => s.trim());
    return lines.map((ln, i) =>
      P([T('•', { size, color: A, bold: true }), T(`${NBSP}${NBSP}${ln}`, { size })], {
        indent: { left: 220, hanging: 220 },
        before: i ? 30 : 0,
      }),
    );
  }
  const v = clean(f.value);
  if (!v.trim()) return [];
  return [P(textOrLink(v, { size }, A))];
}

/** 照片超过两行（> 8 张）的字段：所在行允许跨页拆开 */
const manyPhotos = (f, M) => f.kind === 'photos' && avail(f.photos, M).length > 8;

/** 字段值文字的估算高度（mm）；照片 / 视频按张数另算（manyPhotos） */
function fieldH(f, width, size = 9) {
  if (f.kind === 'list') return sum((f.lines || []).map((ln) => textH(ln, size, width - 220)));
  if (f.kind === 'photos' || f.kind === 'video') return 0;
  return textH(f.value, size, width);
}

/** 网格信息栏：奶油底标签格 + 值格，按 columns / span 排 */
function fieldsGrid(b, M, A) {
  const cols = Math.max(1, Math.min(4, Number(b.columns) || 2));
  const labW = { 1: 2300, 2: 1800, 3: 1380, 4: 1150 }[cols];
  const pairs = splitWidths(TW, Array(cols).fill(1));
  const widths = [];
  for (const pw of pairs) widths.push(labW, pw - labW);

  // 排行：按 span 从左到右装，装不下换行；行尾空位并入最后一格
  const rows = [];
  let cur = [];
  let used = 0;
  for (const f of b.fields) {
    const span = Math.max(1, Math.min(cols, Number(f.span) || 1));
    if (used + span > cols) {
      rows.push(cur);
      cur = [];
      used = 0;
    }
    cur.push({ f, span });
    used += span;
  }
  if (cur.length) rows.push(cur);

  const trs = rows.map((r) => {
    const u = sum(r.map((x) => x.span));
    if (u < cols) r[r.length - 1].span += cols - u;
    const cells = [];
    let gi = 0;
    let h = 0;
    for (const { f, span } of r) {
      const vw = sum(widths.slice(2 * gi + 1, 2 * (gi + span)));
      const isMedia = (f.kind === 'photos' || f.kind === 'video') && !f.empty;
      cells.push(TC(P(bi(f.label, { zhSize: 8, bold: true, enSize: 6.5 }), { before: isMedia ? 40 : 0 }), { w: widths[2 * gi], fill: C.cream, top: isMedia }));
      cells.push(TC(fieldValue(f, M, vw - 2 * PAD, A), { w: vw, span: 2 * span - 1, top: isMedia }));
      h = Math.max(h, fieldH(f, vw - 2 * PAD));
      gi += span;
    }
    // 照片很多 / 文字很长的行允许跨页拆开，其余行不拆
    return TR(cells, { minH: 440, cantSplit: !(h > LONG_MM || r.some((x) => manyPhotos(x.f, M))) });
  });
  return TBL(widths, [...headRows(b, A, { span: widths.length }), ...trs]);
}

/** 文案式（进场通知 / 每日汇报）：标签一行、值一段，照片在下 */
function fieldsList(b, M, A) {
  const rows = headRows(b, A, { repeat: false, rule: false });
  b.fields.forEach((f, i) => {
    // 标签不设「与下段同页」：否则整节会被串成一块整体挪页
    const kids = [P(bi(f.label, { zhSize: 9.5, bold: true, enSize: 7.5 }), { before: i ? 140 : 60, after: 40 })];
    const vals = fieldValue(f, M, TW, A, { size: 10 });
    kids.push(...(vals.length ? vals : [P(T('—', { size: 10, color: C.faint }))]));
    const long = manyPhotos(f, M) || fieldH(f, TW, 10) > LONG_MM;
    rows.push(TR([TC(kids, { w: TW, top: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } })], { cantSplit: !long }));
  });
  return TBL([TW], rows, { borders: NO_BORDERS });
}

function fieldsBlock(b, M, A) {
  if (!b.fields?.length) return [];
  return [b.layout === 'list' ? fieldsList(b, M, A) : fieldsGrid(b, M, A)];
}

// ---------- 检查表 checklist ----------
const sameOptions = (a, b) => a.map((o) => o.v).join('|') === b.map((o) => o.v).join('|');

function checklistCols(b) {
  const cols = [{ k: 'no', w: b.showStandard ? 480 : 560, label: { zh: 'No.' }, center: true }];
  const hasDesc = b.rows.some((r) => r.desc);
  cols.push({
    k: 'item',
    flex: 1,
    label: !b.showStandard && hasDesc ? { zh: '检查项与标准', en: 'Inspection Item & Standard' } : { zh: '检查项', en: 'Item' },
  });
  if (b.showStandard) cols.push({ k: 'std', flex: 1.25, label: { zh: '标准要求', en: 'Standard' } });
  if (b.showMethod) cols.push({ k: 'method', flex: 0.95, label: { zh: '检查方法', en: 'Method' } });
  if (b.resultLayout === 'columns') {
    const ow = b.options.length > 3 ? 640 : 740;
    b.options.forEach((o) => cols.push({ k: 'opt', opt: o, w: ow, label: { zh: o.zh, en: o.en }, center: true }));
  } else {
    cols.push({ k: 'result', w: b.showStandard ? 1750 : 1950, label: { zh: '结果', en: 'Result' } });
  }
  cols.push({ k: 'remark', w: b.showStandard ? 1700 : 2100, label: b.remarkLabel || { zh: '备注', en: 'Remarks' } });
  const fixed = sum(cols.filter((c) => c.w).map((c) => c.w));
  const flex = cols.filter((c) => c.flex);
  const fw = splitWidths(TW - fixed, flex.map((c) => c.flex));
  flex.forEach((c, i) => {
    c.w = fw[i];
  });
  return cols;
}

function headerCell(c, A) {
  return TC(P(bi(c.label, { zhSize: 7.5, bold: true, enSize: 6.5, enBreak: true }), { align: c.center ? AlignmentType.CENTER : undefined, keep: true }), {
    w: c.w,
    fill: C.cream,
    borders: { bottom: line(A, 8) },
  });
}

/** 检查项标题：★ + 中文粗体 + 【影像】，英文一行；无「标准」栏时把说明写在下面 */
function itemParas(r, b, A, keep, inTicks = false) {
  const t = lab(r.title);
  const p1 = [];
  if (r.key) p1.push(T('★ ', { size: 9, bold: true, color: A, font: SYM }));
  p1.push(T(t.zh || t.en || '', { size: 9, bold: !inTicks }));
  if (inTicks && t.zh && t.en) p1.push(T(`   ${t.en}`, { size: 7.5, color: C.muted }));
  if (r.media) p1.push(T('  【影像】', { size: 7, color: C.muted }));
  const out = [P(p1, { keep })];
  if (!inTicks && t.zh && t.en) out.push(P(T(t.en, { size: 7.5, color: C.muted }), { keep, before: 10 }));
  if (!b.showStandard && r.desc) {
    const d = lab(r.desc);
    if (d.zh) out.push(P(T(d.zh, { size: 8, color: C.body }), { keep, before: 40 }));
    if (d.en) out.push(P(T(d.en, { size: 7, color: C.muted, italic: true }), { keep, before: 10 }));
  }
  return out;
}

/** 估算文字宽度（mm），用来决定选项一行排几个 */
function textMm(s, pt) {
  let u = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c >= 0x2e80) u += 1;
    else if (c === 0x20 || c === 0xa0) u += 0.3;
    else if (/[A-Z]/.test(ch)) u += 0.7;
    else u += 0.56;
  }
  return u * pt * 0.3528 * 1.08;
}

/**
 * 结果选项：☑ 合格 Pass   ☐ 不合格 Fail …
 * 一行放得下就一行，否则按宽度换行（选项本身不拆开）。width = 可用宽度 DXA
 */
function inlineOptions(r, keep, { width, align } = {}) {
  const tokens = r.options.map((o) => {
    const on = r.result?.v === o.v;
    const tone = TONE[o.tone] || C.ink;
    const zh = clean(o.zh || o.en || o.v);
    const en = o.en && o.zh ? clean(o.en) : '';
    return {
      w: textMm(BOX_ON, 9.5) + textMm(`${NBSP}${zh}`, 8) + (en ? textMm(`${NBSP}${en}`, 6.5) : 0),
      runs: [
        T(on ? BOX_ON : BOX_OFF, { size: 9.5, bold: on, color: on ? tone : C.faint, font: SYM }),
        T(`${NBSP}${zh}`, { size: 8, bold: on, color: on ? tone : C.muted }),
        en ? T(`${NBSP}${en}`, { size: 6.5, color: on ? tone : C.faint }) : null,
      ].filter(Boolean),
    };
  });
  const maxMm = width ? width / MM : 1e9;
  const sepMm = textMm('   ', 8);
  const lines = [];
  let cur = [];
  let used = 0;
  for (const tk of tokens) {
    const need = cur.length ? used + sepMm + tk.w : tk.w;
    if (cur.length && need > maxMm) {
      lines.push(cur);
      cur = [tk];
      used = tk.w;
    } else {
      cur.push(tk);
      used = need;
    }
  }
  if (cur.length) lines.push(cur);
  return lines.map((ln, i) =>
    P(
      ln.flatMap((tk, j) => (j ? [T('   ', { size: 8 }), ...tk.runs] : tk.runs)),
      { keep, align, before: i ? 30 : 0 },
    ),
  );
}

/** 填写型检查项的值（多行 / 逐行） */
function inputParas(r, keep, size = 8.5) {
  const lines = r.lines?.length ? r.lines : clean(r.value).split('\n');
  const ls = lines.map(clean).filter((s) => s.trim());
  return ls.map((ln, i) => P(T(ln, { size }), { keep, before: i ? 20 : 0 }));
}

function remarkParas(text, keep) {
  return text ? [P(TL(text, { size: 8 }), { keep })] : [];
}

/** 检查项下方的整宽照片行 */
function photoRow(r, M, span) {
  const photos = avail(r.photos, M);
  if (!photos.length) return null;
  const t = lab(r.title);
  const kids = [
    P(
      [
        T(`照片 Photos${r.no ? ` · ${r.no}` : ''}`, { size: 7, bold: true, color: C.muted }),
        T(`  ${t.zh || t.en}  ·  ${photos.length} 张`, { size: 7, color: C.muted }),
      ],
      { before: 10 },
    ),
    ...photoBlock(photos, M, { width: TW - 2 * PAD }),
  ];
  // 超过两行照片（> 8 张）允许跨页拆开
  return TR([TC(kids, { span, w: TW, fill: C.photoBg, top: true, borders: { top: line(C.line, 4, BorderStyle.DOTTED) } })], {
    cantSplit: photos.length <= 8,
  });
}

function checklistTable(b, M, A) {
  const cols = checklistCols(b);
  const widths = cols.map((c) => c.w);
  const resIdx = cols.findIndex((c) => c.k === 'opt' || c.k === 'result');
  const nRes = cols.filter((c) => c.k === 'opt' || c.k === 'result').length;
  const resW = sum(widths.slice(resIdx, resIdx + nRes));
  const remW = widths[widths.length - 1];
  const rows = [...headRows(b, A, { counts: b.counts, span: cols.length }), TR(cols.map((c) => headerCell(c, A)), { header: true })];

  for (const r of b.rows) {
    const keep = avail(r.photos, M).length > 0; // 有照片：本行与照片行同页
    const failed = r.result?.tone === 'fail';
    const cells = [];
    let h = 0; // 本行最高一格的估算高度（mm）
    for (const c of cols.slice(0, resIdx)) {
      if (c.k === 'no') {
        cells.push(TC(P(T(r.no ?? '', { size: 8, bold: true, color: C.muted }), { align: AlignmentType.CENTER, keep }), { w: c.w }));
      } else if (c.k === 'item') {
        cells.push(TC(itemParas(r, b, A, keep), { w: c.w }));
        h = Math.max(h, biH(r.title, c.w - 2 * PAD, 9, 7.5) + (b.showStandard ? 0 : biH(r.desc, c.w - 2 * PAD)));
      } else if (c.k === 'std') {
        cells.push(TC(biParas(r.desc, { keep }), { w: c.w }));
        h = Math.max(h, biH(r.desc, c.w - 2 * PAD));
      } else if (c.k === 'method') {
        cells.push(TC(biParas(r.method, { keep }), { w: c.w }));
        h = Math.max(h, biH(r.method, c.w - 2 * PAD));
      }
    }
    if (r.input) {
      // 填写型：值横跨「结果 + 备注」
      const kids = [...inputParas(r, keep)];
      if (r.remark) kids.push(P([T('备注 ', { size: 7, color: C.muted }), ...TL(r.remark, { size: 8, color: C.body })], { keep, before: 30 }));
      cells.push(TC(kids, { w: resW + remW, span: nRes + 1 }));
      const vw = resW + remW - 2 * PAD;
      h = Math.max(h, textH(r.lines?.length ? r.lines.join('\n') : r.value, 8.5, vw) + textH(r.remark, 8, vw));
    } else {
      if (b.resultLayout === 'columns' && sameOptions(r.options, b.options)) {
        cols.slice(resIdx, resIdx + nRes).forEach((c) => {
          const on = r.result?.v === c.opt.v;
          const tone = TONE[c.opt.tone] || C.ink;
          cells.push(
            TC(P(T(on ? BOX_ON : BOX_OFF, { size: 11, bold: on, color: on ? tone : C.faint, font: SYM }), { align: AlignmentType.CENTER, keep }), {
              w: c.w,
              fill: on && c.opt.tone === 'fail' ? TINT.fail : undefined,
            }),
          );
        });
      } else {
        // inline，或本项自带不同的选项（如 GO / NO-GO）
        const align = b.resultLayout === 'columns' ? AlignmentType.CENTER : undefined;
        cells.push(TC(inlineOptions(r, keep, { width: resW - 2 * PAD, align }), { w: resW, span: nRes, fill: failed ? TINT.fail : undefined }));
      }
      cells.push(TC(remarkParas(r.remark, keep), { w: remW }));
      h = Math.max(h, textH(r.remark, 8, remW - 2 * PAD));
    }
    // 备注 / 填写内容很长的行允许跨页拆开（否则 Word 裁掉超出一页的部分）
    rows.push(TR(cells, { cantSplit: h <= LONG_MM }));
    const pr = photoRow(r, M, cols.length);
    if (pr) rows.push(pr);
  }
  return TBL(widths, rows);
}

/** 打勾清单（单选项，如交付清单「完成」）：☐ | 中文 + 英文（灰）+ 备注 */
function ticksTable(b, M, A) {
  const widths = [620, TW - 620];
  const rows = headRows(b, A, { counts: b.counts, span: 2 });
  for (const r of b.rows) {
    const keep = avail(r.photos, M).length > 0;
    const sel = r.result;
    const tone = sel ? TONE[sel.tone] || C.ink : C.faint;
    const kids = itemParas(r, b, A, keep, true);
    if (r.input) kids.push(...inputParas(r, keep));
    else if (r.options.length > 1) kids.push(...inlineOptions(r, keep, { width: widths[1] - 2 * PAD }));
    if (r.remark) {
      kids.push(P([T('备注 Remarks：', { size: 7, bold: true, color: C.muted }), ...TL(r.remark, { size: 8, color: C.body })], { keep, before: 30 }));
    }
    const mark = r.input || r.options.length > 1 ? '' : sel ? BOX_ON : BOX_OFF;
    const vw = widths[1] - 2 * PAD;
    const h = biH(r.title, vw, 9, 7.5) + biH(r.desc, vw) + (r.input ? textH(r.lines?.length ? r.lines.join('\n') : r.value, 8.5, vw) : 0) + textH(r.remark, 8, vw);
    rows.push(
      TR(
        [
          TC(P(T(mark, { size: 11, bold: !!sel, color: tone, font: SYM }), { align: AlignmentType.CENTER, keep }), {
            w: widths[0],
            fill: sel?.tone === 'fail' ? TINT.fail : C.cream,
          }),
          TC(kids, { w: widths[1] }),
        ],
        { cantSplit: h <= LONG_MM },
      ),
    );
    const pr = photoRow(r, M, 2);
    if (pr) rows.push(pr);
  }
  return TBL(widths, rows);
}

function checklistBlock(b, M, A) {
  if (!b.rows?.length) {
    const head = sectionHead(b, A, b.counts);
    return head.length ? [keepTogether(head)] : [];
  }
  return [b.resultLayout === 'ticks' ? ticksTable(b, M, A) : checklistTable(b, M, A)];
}

// ---------- 表格 table ----------
function photoGroupsContent(r, M) {
  const src = r.photoGroups?.length ? r.photoGroups : [{ key: 'photos', label: { zh: '照片', en: 'Photos' }, photos: r.photos }];
  const groups = src.map((g) => ({ label: g.label, photos: avail(g.photos, M) })).filter((g) => g.photos.length);
  if (!groups.length) return null;
  const labelP = (g) => P(bi(g.label, { zhSize: 7.5, bold: true, zhColor: C.body, enSize: 6.5 }), { before: 10 });
  if (groups.length === 1) return [labelP(groups[0]), ...photoBlock(groups[0].photos, M, { width: TW - 2 * PAD })];
  // 多组（问题照片 | 复验照片）并排对照
  const inner = TW - 2 * PAD;
  const ws = splitWidths(inner, groups.map(() => 1));
  const cells = groups.map((g, i) =>
    TC([labelP(g), ...photoBlock(g.photos, M, { width: ws[i] - 120, maxW: 40 })], {
      w: ws[i],
      top: true,
      borders: i ? { left: line(C.line, 4, BorderStyle.DOTTED) } : undefined,
    }),
  );
  return [TBL(ws, [TR(cells)], { borders: NO_BORDERS, margins: { top: 0, bottom: 0, left: 60, right: 60 } })];
}

function tableBlock(b, M, A) {
  const noW = 460;
  const widths = [noW, ...splitWidths(TW - noW, b.columns.map((c) => Number(c.width) || 1))];
  const header = TR(
    [headerCell({ w: noW, label: { zh: '#' }, center: true }, A), ...b.columns.map((c, i) => headerCell({ w: widths[i + 1], label: c.label }, A))],
    { header: true },
  );
  const rows = [...headRows(b, A, { span: widths.length }), header];
  if (b.empty || !b.rows.length) {
    const e = lab(b.emptyText);
    const text = e.zh || e.en ? [e.zh, e.en].filter(Boolean).join(' ') : '无 None';
    rows.push(TR([TC(P(T(text, { size: 8, italic: true, color: C.muted }), { align: AlignmentType.CENTER }), { span: widths.length, w: TW })], { minH: 420 }));
  } else {
    b.rows.forEach((r, i) => {
      const photos = photoGroupsContent(r, M);
      const keep = !!photos;
      // 单元格文字很长（如 1800 字问题描述）的行允许跨页拆开
      const h = Math.max(0, ...b.columns.map((c, j) => textH(r.cells?.[c.key] ?? '', 8, widths[j + 1] - 2 * PAD)));
      rows.push(
        TR(
          [
            TC(P(T(String(i + 1), { size: 8, bold: true, color: C.muted }), { align: AlignmentType.CENTER, keep }), { w: noW }),
            ...b.columns.map((c, j) => TC(P(TL(r.cells?.[c.key] ?? '', { size: 8 }), { keep }), { w: widths[j + 1] })),
          ],
          { cantSplit: h <= LONG_MM },
        ),
      );
      if (photos) {
        const n = avail(r.photos, M).length;
        rows.push(
          TR([TC(photos, { span: widths.length, w: TW, fill: C.photoBg, top: true, borders: { top: line(C.line, 4, BorderStyle.DOTTED) } })], {
            cantSplit: n <= 8,
          }),
        );
      }
    });
  }
  return [TBL(widths, rows)];
}

// ---------- 统计 summary ----------
function summaryBlock(b, A) {
  const out = [...sectionHead({ title: b.title || { zh: '结果统计', en: 'Summary' } }, A)];
  const items = b.items || [];
  const short = (it) => clean(it.value ?? '').length <= 24;
  const tiles = items.filter(short);
  const longs = items.filter((it) => !short(it));
  const tiers = [];
  if (tiles.length) {
    const nRows = Math.ceil(tiles.length / 5);
    const per = Math.ceil(tiles.length / nRows);
    for (let i = 0; i < tiles.length; i += per) tiers.push(tiles.slice(i, i + per));
  }
  const white = line('FFFFFF', 18);
  const tileBorders = { top: white, bottom: white, left: white, right: white, insideHorizontal: white, insideVertical: white };
  tiers.forEach((chunk, ti) => {
    const ws = splitWidths(TW, chunk.map(() => 1));
    const cells = chunk.map((it, i) => {
      const tone = TONE[it.tone] ? it.tone : 'neutral';
      return TC(
        [
          P(bi(it.label, { zhSize: 7.5, bold: true, zhColor: C.body, enSize: 6.5 }), { align: AlignmentType.CENTER }),
          P(T(clean(it.value ?? ''), { size: 10.5, bold: true, color: TONE[tone] }), { align: AlignmentType.CENTER, before: 30 }),
        ],
        { w: ws[i], fill: TINT[tone] },
      );
    });
    if (ti) out.push(gap(20));
    out.push(TBL(ws, [TR(cells, { minH: 680 })], { borders: tileBorders, margins: { top: 70, bottom: 70, left: 80, right: 80 } }));
  });
  // 长清单（如复尺「待处理」带用户备注）可能很长：估算高度，太高时行 / 整块都允许跨页
  let longH = 0;
  if (longs.length) {
    if (tiers.length) out.push(gap(60));
    const ws = [2500, TW - 2500];
    out.push(
      TBL(
        ws,
        longs.map((it) => {
          const tone = TONE[it.tone] ? it.tone : 'neutral';
          const h = textH(it.value ?? '', 8.5, ws[1] - 2 * PAD);
          longH += h;
          return TR(
            [
              TC(P(bi(it.label, { zhSize: 8, bold: true, zhColor: C.body, enSize: 6.5 })), { w: ws[0], fill: TINT[tone], borders: { left: line(TONE[tone], 18) } }),
              TC(P(TL(it.value ?? '', { size: 8.5, color: TONE[tone] })), { w: ws[1] }),
            ],
            { cantSplit: h <= LONG_MM },
          );
        }),
      ),
    );
  }
  const c0 = b.conclusion;
  if (c0) {
    const c = typeof c0 === 'string' ? { value: c0 } : c0.value != null ? c0 : { value: [c0.zh, c0.en].filter(Boolean).join(' ') };
    const tone = TONE[c.tone] ? c.tone : 'neutral';
    const head = c.label ? bi(c.label, { zhSize: 9, bold: true, enSize: 7.5 }) : [T('结论 ', { size: 9, bold: true }), T('Conclusion', { size: 7.5, color: C.muted })];
    const kids = [P([...head, T('：', { size: 9 }), T(clean(c.value), { size: 11, bold: true, color: TONE[tone] })])];
    if (c.note) kids.push(P(TL(c.note, { size: 8, color: C.body }), { before: 40 }));
    longH += textH(c.note, 8, TW - 360);
    out.push(gap(80), box(kids, { fill: TINT[tone], left: line(TONE[tone], 24), margins: { top: 90, bottom: 90, left: 180, right: 180 } }));
  }
  return [keepTogether(out, longH > LONG_MM)];
}

// ---------- 说明 note ----------
function noteBlock(b, A) {
  const warn = b.tone === 'warn';
  const out = [];
  const t = lab(b.title);
  if (t.zh || t.en) out.push(P(bi(t, { zhSize: 9, bold: true, zhColor: warn ? A : C.ink, enSize: 7.5, enBold: true }), { keep: true, after: 50 }));
  const lines = (b.lines || []).map(lab).filter((l) => l.zh || l.en);
  lines.forEach((l, i) => {
    out.push(
      P(
        [l.zh && T(l.zh, { size: 8, color: warn ? A : C.body }), l.en && T((l.zh ? '  ' : '') + l.en, { size: 7.5, italic: true, color: warn ? A : C.muted })],
        { after: 40, keep: i < lines.length - 1 },
      ),
    );
  });
  return out;
}

// ---------- 签名 signatures ----------
function signaturesBlock(b, M, A) {
  const out = [...sectionHead(b, A)];
  const d = lab(b.declaration);
  if (d.zh || d.en) {
    const kids = [];
    if (d.zh) kids.push(P(T(d.zh, { size: 8.5, color: C.body })));
    if (d.en) kids.push(P(T(d.en, { size: 7.5, italic: true, color: C.muted }), { before: d.zh ? 40 : 0 }));
    out.push(box(kids, { fill: C.cream, left: line(A, 12), margins: { top: 90, bottom: 90, left: 180, right: 180 } }), gap(100, true));
  }
  const roles = b.roles || [];
  if (roles.length) {
    const per = roles.length <= 4 ? roles.length : 3;
    const ws = splitWidths(TW, Array(per).fill(1));
    const SIG_H = 16; // mm
    const rows = [];
    for (let i = 0; i < roles.length; i += per) {
      const chunk = roles.slice(i, i + per);
      const cells = [];
      for (let j = 0; j < per; j += 1) {
        const r = chunk[j];
        if (!r) {
          cells.push(TC([], { w: ws[j] }));
          continue;
        }
        const img = r.image && M.get(r.image.id)?.img;
        const kids = [P(bi(r.label, { zhSize: 9, bold: true, enSize: 7, enSpacing: 10 }), { keep: true })];
        if (img) {
          const s = fit(img, 45, SIG_H);
          kids.push(P(imgRun(img, 45, SIG_H), { keep: true, before: Math.round((SIG_H - s.h) * MM) + 80 }));
        } else {
          kids.push(gap(Math.round(SIG_H * MM) + 80, true));
        }
        kids.push(P([], { keep: true, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.ink, space: 1 } } }));
        kids.push(P([T('签名 Signature', { size: 6.5, color: C.faint })], { keep: true, before: 20 }));
        kids.push(P([T('姓名 Name：', { size: 7.5, color: C.muted }), T(clean(r.name), { size: 9 })], { keep: true, before: 60 }));
        kids.push(P([T('日期 Date：', { size: 7.5, color: C.muted }), T(clean(r.date), { size: 9 })], { before: 30 }));
        cells.push(TC(kids, { w: ws[j], top: true }));
      }
      rows.push(TR(cells));
    }
    out.push(TBL(ws, rows, { borders: NO_BORDERS, margins: { top: 60, bottom: 60, left: 60, right: 360 } }));
  }
  return out.length ? [keepTogether(out)] : [];
}

// ---------- 页眉 / 页脚 ----------
function pageHeader(meta, logo, A) {
  const t = lab(meta.title);
  const left = logo && meta.brand !== 'plain' ? [imgRun(logo, 17, 7)] : [T('溪岸 Sail', { size: 8, bold: true })];
  return new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TW }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.line, space: 4 } },
        children: [
          ...left,
          new TextRun({ children: [new Tab()], size: 14 }),
          T(t.zh, { size: 7.5, bold: true, color: C.body }),
          t.en ? T(`  ${t.en}`, { size: 6.5, color: A, spacing: 16 }) : null,
        ].filter(Boolean),
      }),
    ],
  });
}

function pageFooter(meta) {
  const left = [meta.company, meta.reportTitle].map((s) => clean(s).trim()).filter(Boolean).join(' · ');
  return new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TW }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.line, space: 4 } },
        children: [
          T(left.length > 96 ? `${left.slice(0, 95)}…` : left, { size: 7, color: C.muted }),
          new TextRun({
            children: [new Tab(), '第 ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES, ' 页'],
            size: 14,
            color: C.muted,
          }),
        ],
      }),
    ],
  });
}

const pad2 = (n) => String(n).padStart(2, '0');

function fmtGenerated(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ---------- 组装 ----------
function buildChildren(model, M, logo, A) {
  const meta = model.meta || {};
  const kids = [...headerBlock(meta, logo, A)];
  for (const b of model.blocks || []) {
    let part = [];
    try {
      if (b.type === 'fields') part = fieldsBlock(b, M, A);
      else if (b.type === 'checklist') part = checklistBlock(b, M, A);
      else if (b.type === 'table') part = tableBlock(b, M, A);
      else if (b.type === 'summary') part = summaryBlock(b, A);
      else if (b.type === 'note') part = noteBlock(b, A);
      else if (b.type === 'signatures') part = signaturesBlock(b, M, A);
    } catch (e) {
      // 单块出错只写一行提示，不让整份导出失败
      part = [P(T(`（此部分无法生成：${e?.message || e}）`, { size: 8, italic: true, color: TONE.fail }))];
    }
    if (part.length) kids.push(gap(b.type === 'note' ? 120 : 220), ...part);
  }
  if (meta.footer) kids.push(P(T(meta.footer, { size: 8, bold: true, color: A }), { align: AlignmentType.CENTER, before: 240 }));
  const gen = fmtGenerated(meta.generatedAt);
  kids.push(
    P(T(`${meta.dept ? `${clean(meta.dept)} · ` : ''}TORA 生成 Generated ${gen}`, { size: 6.5, color: C.faint }), {
      align: AlignmentType.CENTER,
      before: meta.footer ? 60 : 300,
    }),
  );
  return kids;
}

/**
 * 文档模型 → Word（.docx）Blob
 * @param {object} model  buildDocModel() 的结果
 * @param {{ get(id): Promise<object|null> }} media  媒体加载器
 * @param {{ logo?: ArrayBuffer|Uint8Array|Blob }} [opts]
 * @returns {Promise<Blob>}
 */
export async function exportDocx(model, media, { logo } = {}) {
  const meta = model?.meta || {};
  const A = hex(meta.accent);
  const [M, logoImg] = await Promise.all([loadMedia(model || { blocks: [] }, media), loadLogo(logo)]);
  const t = lab(meta.title);

  const doc = new Document({
    creator: clean(meta.company || '溪岸 Sail by Riccione Reka'),
    lastModifiedBy: 'TORA by Riccione Reka',
    title: clean(meta.reportTitle || t.zh || 'Report'),
    subject: [t.zh, t.en].filter(Boolean).join(' '),
    description: clean(meta.reportTitle || ''),
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 18, color: C.ink, language: { value: 'en-US', eastAsia: 'zh-CN' } },
          paragraph: { spacing: { before: 0, after: 0, line: 252, lineRule: LineRuleType.AUTO } },
        },
      },
    },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size: { width: PAGE.w, height: PAGE.h, orientation: PageOrientation.PORTRAIT },
            margin: { top: PAGE.top, bottom: PAGE.bottom, left: PAGE.side, right: PAGE.side, header: PAGE.header, footer: PAGE.footer },
          },
        },
        headers: {
          first: new Header({ children: [new Paragraph({ children: [] })] }),
          default: pageHeader(meta, logoImg, A),
        },
        footers: { first: pageFooter(meta), default: pageFooter(meta) },
        children: buildChildren(model || { meta: {}, blocks: [] }, M, logoImg, A),
      },
    ],
  });

  const buf = await Packer.toArrayBuffer(doc);
  return new Blob([buf], { type: DOCX_MIME });
}
