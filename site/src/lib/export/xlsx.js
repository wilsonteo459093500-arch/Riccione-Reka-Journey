// ============================================================
// Excel 导出 XLSX EXPORT
// ------------------------------------------------------------
// 只读文档模型（lib/docmodel.js → { meta, blocks }），与 PDF / Word 内容一致。
// 浏览器（Vite 动态 import）与 Node（测试）通用：writeBuffer → Blob。
//
// 两张表：
//   ① 报告：可直接打印的 A4 表单（抬头 / 信息栏 / 章节 / 检查表 / 照片 / 统计 / 签名）
//   ② 数据 Data：一行一个检查项 + 字段 + 表格，方便筛选、统计、导入 Lark
//
// exportXlsx(model, media, { logo }) → Promise<Blob>
//   media.get(id) → { kind, blob, thumb, poster?, w, h, duration?, caption? } | null
// ============================================================
import { modelMedia } from '../docmodel.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ---------- 品牌色 ----------
const C = {
  ink: 'FF2B2A27',
  body: 'FF55524B',
  muted: 'FF8A857C',
  faint: 'FFB3ACA0',
  line: 'FFE4DCCB',
  cream: 'FFF8F4EB',
  cream2: 'FFF1EBDE',
  white: 'FFFFFFFF',
  terra: 'FFB5623A',
};
// warn 用 PDF（components/doc/theme.js）的琥珀色：与 fail 的红区分开（有条件开工 ≠ NO-GO）
const TONE = { pass: 'FF3F7A4F', fail: 'FFB8452F', na: 'FF8A857C', warn: 'FFB7791F', neutral: 'FF55524B' };
const TINT = { pass: 'FFEAF2EC', fail: 'FFF8E5E0', na: 'FFF1EFEA', warn: 'FFFBF3E1', neutral: 'FFF8F4EB' };
const FONT = 'Microsoft YaHei';

// ---------- 版式：8 列网格 ----------
// A 序号 | B 检查项 | C 标准 | D 方法 | E F G 结果 | H 备注
const COLS = [6, 30, 22, 15, 8, 8, 8, 24];
const NCOL = COLS.length;
const colPx = (w) => Math.round(w * 7 + 5); // Excel 默认字体下的列宽像素（近似）
const COL_PX = COLS.map(colPx);
const COL_X = COL_PX.map((_, i) => COL_PX.slice(0, i).reduce((s, w) => s + w, 0)); // 每列左边缘 px
const EMU_PX = 9525;
const EMU_PT = 12700;
const PHOTO_H = 96; // 照片高度 px
const PHOTO_MAX_W = 150;
const GAP = 8;

// ---------- 小工具 ----------
const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const clean = (s) => (s == null ? '' : String(s).replace(BAD, ''));

function lab(x) {
  if (x == null || x === '') return { zh: '', en: '' };
  if (typeof x === 'string' || typeof x === 'number') return { zh: clean(x).trim(), en: '' };
  const zh = clean(x.zh || '').trim();
  const en = clean(x.en || '').trim();
  return en === zh ? { zh, en: '' } : { zh, en };
}
const both = (x, sep = ' ') => {
  const l = lab(x);
  return [l.zh, l.en].filter(Boolean).join(sep);
};

// ---------- 行数估算 ----------
// 字宽单位：1 ≈ 1/1.1 个 Excel 列宽字符。中文 2；大写字母、数字、m / w 这类宽字母更宽
// （全大写、编号多的英文按 1 算会少算行，文字掉出格子底部）
const wide = (ch) => ch.charCodeAt(0) > 0x2e7f;
const unitsOf = (ch) => (wide(ch) ? 2 : /[A-Zmw@%#&]/.test(ch) ? 1.4 : /[0-9]/.test(ch) ? 1.25 : 1);
const NO_START = /[，。、；：！？）」』】》〉]/; // 避头：中文标点不放行首，跟着前一个字
// 每行能放几个单位。Excel / LibreOffice 按整数像素画字：9.5pt 和 10pt 一样大（13px），8pt 是 11px
const capOf = (widthChars, fontPt) => Math.max(4, widthChars * 1.1) / (Math.round((fontPt * 4) / 3) / 13);

/**
 * 一段文字（不含换行）按每行 cap 个单位贪心折行，返回每行开头的下标（chars 里的位置）。
 * 和 Excel 一样只在空格后、中文字前后换行；英文单词放不下整个挪到下一行，比一整行还长的串（网址等）才按字断。
 */
function wrapStarts(chars, cap) {
  const starts = [0];
  let x = 0;
  let i = 0;
  while (i < chars.length) {
    let j = i;
    if (wide(chars[j])) j += 1;
    else while (j < chars.length && chars[j] !== ' ' && !wide(chars[j])) j += 1;
    while (j < chars.length && NO_START.test(chars[j])) j += 1;
    let k = j;
    while (k < chars.length && chars[k] === ' ') k += 1; // 行尾的空格不占地方
    let body = 0;
    for (let t = i; t < j; t += 1) body += unitsOf(chars[t]);
    if (x > 0 && x + body > cap) {
      starts.push(i);
      x = 0;
    }
    if (body > cap) {
      for (let t = i; t < j; t += 1) {
        const u = unitsOf(chars[t]);
        if (x > 0 && x + u > cap) {
          starts.push(t);
          x = 0;
        }
        x += u;
      }
    } else x += body;
    x += k - j;
    i = k;
  }
  return starts;
}

/** 文本在给定列宽（字符）里大约占几行 */
function lines(text, widthChars, fontPt = 10) {
  if (!text) return 1;
  const cap = capOf(widthChars, fontPt);
  let n = 0;
  for (const para of String(text).split('\n')) n += wrapStarts([...para], cap).length;
  return n;
}
const spanWidth = (c1, c2) => COLS.slice(c1 - 1, c2).reduce((s, w) => s + w, 0);

// Excel 行高上限 409pt（≈ 28 行 10pt 字）：更长的文字切成几段，每段一行（续行），不会被截掉
const MAX_LINES = 26;

/**
 * 把文字切成每段不超过 max 行（和 lines() 同一套折行）。在估算的换行处切，
 * 所以英文单词 / 编号（如 Q020、3mm）不会从中间断开。first = 第一段的行数上限（同格里前面还有别的文字时用）。
 */
function chunks(text, widthChars, fontPt = 10, max = MAX_LINES, first = max) {
  const s = text == null ? '' : String(text);
  if (lines(s, widthChars, fontPt) <= first) return [s];
  const cap = capOf(widthChars, fontPt);
  const out = [];
  let cur = [];
  let used = 0;
  let budget = Math.max(1, first);
  for (const para of s.split('\n')) {
    const chars = [...para];
    const st = wrapStarts(chars, cap);
    let a = 0;
    while (a < st.length) {
      if (used >= budget) {
        out.push(cur.join('\n'));
        cur = [];
        used = 0;
        budget = max;
      }
      const b = Math.min(st.length, a + budget - used);
      cur.push(chars.slice(st[a], b < st.length ? st[b] : chars.length).join(''));
      used += b - a;
      a = b;
    }
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

function sheetName(s, fallback) {
  const n = clean(s).replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31);
  return n || fallback;
}

// ---------- 媒体 ----------
async function bytesOf(src) {
  if (!src) return null;
  if (src instanceof Uint8Array) return src;
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  if (ArrayBuffer.isView(src)) return new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
  if (typeof src.arrayBuffer === 'function') return new Uint8Array(await src.arrayBuffer());
  return null;
}

function imageInfo(b) {
  if (!b || b.length < 26) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { ext: 'png', w: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0 };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i += 1;
        continue;
      }
      const m = b[i + 1];
      if (m === 0xff || m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        i += m === 0xff ? 1 : 2;
        continue;
      }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { ext: 'jpeg', h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return { ext: 'jpeg', w: 0, h: 0 };
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { ext: 'gif', w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
  return null;
}

/** 预加载文档引用的媒体 → Map<id, { kind, data, ext, w, h, caption, duration }> */
async function loadMedia(model, media) {
  const M = new Map();
  if (!media || typeof media.get !== 'function') return M;
  await Promise.all(
    modelMedia(model).map(async (ref) => {
      try {
        const m = await media.get(ref.id);
        if (!m) return;
        const kind = m.kind || ref.kind || 'photo';
        // Excel 里照片约 100px 高：用缩略图足够清楚、文件小；签名用原图（透明 PNG）
        const cands = kind === 'video' ? [m.poster, m.thumb] : kind === 'signature' ? [m.blob, m.thumb] : [m.thumb, m.blob];
        for (const c of cands) {
          const data = await bytesOf(c);
          const info = imageInfo(data);
          if (!info) continue;
          const w = info.w || m.w || 4;
          const h = info.h || m.h || 3;
          M.set(ref.id, { kind, data, ext: info.ext, w, h, caption: clean(m.caption || '').trim(), duration: m.duration });
          return;
        }
        // 视频没截到封面：没有图可放，但仍记下来，文档里写「▶ 视频（时长）请见群组」
        if (kind === 'video') M.set(ref.id, { kind, data: null, caption: clean(m.caption || '').trim(), duration: m.duration });
      } catch {
        /* 单张出错不影响整份 */
      }
    }),
  );
  return M;
}

function fmtDur(sec) {
  if (!sec) return '';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const videoText = (m) => `▶ 视频${m.duration ? `（${fmtDur(m.duration)}）` : ''}请见群组`;

// ---------- 写表 ----------
function createWriter(wb, ws, M, accent) {
  let r = 0; // 当前行号（1 起；r = 最后写过的行）
  const imageIds = new Map();
  const thin = { style: 'thin', color: { argb: C.line } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };

  const font = (o = {}) => ({ name: FONT, size: o.size || 10, bold: !!o.bold, italic: !!o.italic, color: { argb: o.color || C.ink } });
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  function row(height) {
    r += 1;
    const rw = ws.getRow(r);
    if (height) rw.height = Math.min(409, Math.max(12, height));
    return r;
  }

  /** 写单元格（可合并 c1..c2） */
  function cell(rr, c1, c2, value, o = {}) {
    if (c2 > c1) ws.mergeCells(rr, c1, rr, c2);
    const cl = ws.getCell(rr, c1);
    cl.value = value;
    cl.font = font(o);
    cl.alignment = {
      vertical: o.valign || 'top',
      horizontal: o.align || 'left',
      wrapText: o.wrap !== false,
      indent: o.indent || 0,
    };
    if (o.fill) cl.fill = fill(o.fill);
    if (o.border) {
      for (let c = c1; c <= c2; c += 1) {
        const x = ws.getCell(rr, c);
        x.border = { ...box, ...(o.leftBar && c === c1 ? { left: { style: 'thick', color: { argb: typeof o.leftBar === 'string' ? o.leftBar : accent } } } : {}) };
        if (o.fill && c > c1) x.fill = fill(o.fill);
      }
    }
    return cl;
  }

  const rich = (parts) => ({ richText: parts.filter((p) => p && p.text).map((p) => ({ text: clean(p.text), font: font(p) })) });

  function imageId(m) {
    if (imageIds.has(m)) return imageIds.get(m);
    const id = wb.addImage({ buffer: m.data, extension: m.ext });
    imageIds.set(m, id);
    return id;
  }

  // exceljs 4.4.0 的坑：相邻两个锚点用同一个 imageId 时，第二个会指到别的图
  // （worksheet-xform 按位置存 rel，却按 imageId 取）。如两个签名同一张图 → 第二个显示成柜子照片。
  // 所以和上一个锚点同 id 时，另登记一份新的。
  let lastId = -1;

  /** 在第 rr 行从像素 x 处放图（oneCellAnchor：起点在所在列内，宽度可跨列） */
  function placeImage(m, rr, x, y, w, h) {
    let col = 0;
    while (col < NCOL - 1 && x >= COL_X[col] + COL_PX[col]) col += 1;
    const off = Math.max(0, Math.min(x - COL_X[col], COL_PX[col] - 2));
    let id = imageId(m);
    if (id === lastId) id = wb.addImage({ buffer: m.data, extension: m.ext });
    lastId = id;
    ws.addImage(id, {
      tl: { nativeCol: col, nativeColOff: Math.round(off * EMU_PX), nativeRow: rr - 1, nativeRowOff: Math.round(y * EMU_PX) },
      ext: { width: Math.round(w), height: Math.round(h) },
      editAs: 'oneCell',
    });
  }

  /**
   * 照片行：从第 startCol 列开始横排，放不下自动换行。
   * label 写在 startCol 之前的单元格里。返回写了几行。
   */
  function photos(ids, { label = '照片 Photos', startCol = 2, labelFill = C.cream } = {}) {
    const all = (ids || []).map((ref) => ({ ref, m: M.get(ref.id) }));
    const items = all.filter((x) => x.m && x.m.data);
    // 放不进图的（视频没封面 / 照片已删除）也要写一句，不能整行消失（PDF 显示 Missing，Word 保留文字）
    const lost = all.filter((x) => !(x.m && x.m.data));
    const lostTxt = lost.filter((x) => x.m).map((x) => videoText(x.m));
    const nPhoto = lost.filter((x) => !x.m && x.ref.kind !== 'video').length;
    if (nPhoto) lostTxt.push(nPhoto > 1 ? `照片缺失 ×${nPhoto}` : '照片缺失');
    if (lost.some((x) => !x.m && x.ref.kind === 'video')) lostTxt.push('视频缺失');
    if (!items.length) {
      if (!lostTxt.length) return 0;
      const rr = row(Math.max(startCol > 1 ? lines(label, spanWidth(1, startCol - 1), 8) * 11 + 6 : 0, 20));
      if (startCol > 1) cell(rr, 1, startCol - 1, label, { size: 8, color: C.muted, fill: labelFill, border: true });
      cell(rr, startCol, NCOL, lostTxt.join('　·　'), { size: 9, color: C.muted, valign: 'middle', border: true, fill: 'FFFCFAF6' });
      return 1;
    }
    const x0 = COL_X[startCol - 1] + 6;
    const xMax = COL_X[NCOL - 1] + COL_PX[NCOL - 1] - 6;
    const sized = items.map(({ m }) => {
      const s = Math.min(PHOTO_H / m.h, PHOTO_MAX_W / m.w);
      return { m, w: m.w * s, h: m.h * s };
    });
    // 分行
    const rowsOf = [];
    let cur = [];
    let x = x0;
    for (const it of sized) {
      if (cur.length && x + it.w > xMax) {
        rowsOf.push(cur);
        cur = [];
        x = x0;
      }
      cur.push({ ...it, x });
      x += it.w + GAP;
    }
    if (cur.length) rowsOf.push(cur);

    rowsOf.forEach((list, i) => {
      const caps = list
        .map((it) => (it.m.kind === 'video' ? `▶ 视频 ${fmtDur(it.m.duration)}（请见群组）` : it.m.caption))
        .filter(Boolean);
      if (i === 0) caps.push(...lostTxt);
      const hPx = PHOTO_H + 10 + (caps.length ? 4 + lines(caps.join('　·　'), spanWidth(startCol, NCOL), 8) * 12 : 0);
      const rr = row(hPx * 0.75);
      if (startCol > 1) cell(rr, 1, startCol - 1, i === 0 ? label : '', { size: 8, color: C.muted, fill: labelFill, border: true });
      cell(rr, startCol, NCOL, caps.join('　·　'), { size: 8, color: C.muted, valign: 'bottom', border: true, fill: 'FFFCFAF6' });
      for (const it of list) placeImage(it.m, rr, it.x, 5, it.w, it.h);
    });
    return rowsOf.length;
  }

  return { row, cell, rich, photos, placeImage, font, fill, get r() { return r; }, set r(v) { r = v; } };
}

// ---------- 各块 ----------
function writeHeader(w, ws, model, logoImg) {
  const meta = model.meta || {};
  const title = lab(meta.title);
  const accent = `FF${String(meta.accent || '#B5623A').replace('#', '').toUpperCase()}`;

  // 第 1 行：logo + 角标
  const r1 = w.row(48);
  if (logoImg) {
    const h = 54;
    w.placeImage(logoImg, r1, 4, 6, (logoImg.w / logoImg.h) * h, h);
  }
  const badge = meta.badge ? lab(meta.badge) : meta.brand === 'vsmooth' ? { zh: 'V-SMOOTH', en: '' } : null;
  if (badge) {
    w.cell(r1, 6, 8, w.rich([
      { text: badge.zh, bold: true, color: accent, size: 9 },
      badge.en ? { text: `\n${badge.en}`, italic: true, color: C.muted, size: 8 } : null,
    ]), { align: 'right', valign: 'middle' });
  }
  if (meta.kicker) {
    const rr = w.row(16);
    w.cell(rr, 1, NCOL, meta.kicker, { size: 8, color: C.muted });
  }
  // 标题
  const rt = w.row(30);
  w.cell(rt, 1, NCOL, w.rich([
    { text: title.zh || title.en, bold: true, size: 18 },
    title.en && title.zh ? { text: `   ${title.en.toUpperCase()}`, bold: true, size: 10, color: accent } : null,
  ]), { valign: 'middle' });
  if (meta.subtitle) {
    const s = lab(meta.subtitle);
    const txt = [s.zh, s.en].filter(Boolean).join('   ');
    const rr = w.row(lines(txt, spanWidth(1, NCOL), 9) * 13 + 4);
    w.cell(rr, 1, NCOL, txt, { italic: true, size: 9, color: accent });
  }
  for (const p of meta.intro || []) {
    const l = lab(p);
    const width = spanWidth(1, NCOL);
    const h = lines(l.zh, width, 9.5) * 14 + (l.en ? lines(l.en, width * 1.15, 8.5) * 12 : 0) + 6;
    const rr = w.row(h);
    w.cell(rr, 1, NCOL, w.rich([
      { text: l.zh, size: 9.5, color: C.body },
      l.en ? { text: `\n${l.en}`, size: 8.5, color: C.muted, italic: true } : null,
    ]));
  }
  if (meta.legend) {
    const rr = w.row(18);
    w.cell(rr, 1, NCOL, meta.legend, { size: 9, color: C.body, fill: C.cream, valign: 'middle', indent: 1 });
  }
  w.row(8);
  return accent;
}

function writeHeading(w, block, accent, extra) {
  const t = lab(block.title);
  if (!t.zh && !t.en && !block.no) return;
  const name = [t.en ? t.en.toUpperCase() : '', t.zh].filter(Boolean).join(' · ');
  const head = [block.no, name].filter(Boolean).join('   ');
  const rr = w.row(22);
  w.cell(rr, 1, extra ? 5 : NCOL, head, { bold: true, size: 11, color: accent, fill: C.cream2, border: true, leftBar: true, valign: 'middle', indent: 1 });
  if (extra) w.cell(rr, 6, NCOL, extra, { size: 8, color: C.muted, fill: C.cream2, border: true, valign: 'middle', align: 'right' });
  if (block.note) {
    const notes = Array.isArray(block.note) ? block.note : [block.note];
    for (const n of notes) {
      const l = lab(n);
      const txt = [l.zh, l.en].filter(Boolean).join('\n');
      const rr2 = w.row(lines(txt, spanWidth(1, NCOL), 9) * 13 + 4);
      w.cell(rr2, 1, NCOL, txt, { size: 9, color: C.body, italic: !l.zh });
    }
  }
}

function writeFields(w, block, accent) {
  writeHeading(w, block, accent);
  const grid = block.layout === 'grid' && (block.columns || 2) >= 2;
  const labelCell = (rr, c1, c2, f) => {
    const l = lab(f.label);
    w.cell(rr, c1, c2, w.rich([{ text: l.zh || l.en, bold: true, size: 9, color: C.body }, l.zh && l.en ? { text: `\n${l.en}`, size: 7.5, color: C.muted } : null]), {
      fill: C.cream,
      border: true,
    });
  };
  // 标签（中文 9pt 粗 + 英文 7.5pt）的高度也算进行高，窄格（E:F）里的长标签不会被截
  const labelH = (f, c1, c2) => {
    const l = lab(f.label);
    const width = spanWidth(c1, c2);
    return lines(l.zh || l.en, width, 9) * 12 + (l.zh && l.en ? lines(l.en, width, 7.5) * 10 : 0) + 6;
  };
  const valueOf = (f) => (f.kind === 'list' ? (f.lines || []).map((s) => `• ${s}`).join('\n') : f.value || '');
  const pending = [];
  const flushPair = () => {
    if (!pending.length) return;
    const [a, b] = pending.splice(0);
    const va = valueOf(a);
    const vb = b ? valueOf(b) : '';
    const h = Math.max(
      Math.max(lines(va, spanWidth(3, 4), 10), b ? lines(vb, spanWidth(7, 8), 10) : 1, 2) * 14 + 4,
      labelH(a, 1, 2),
      b ? labelH(b, 5, 6) : 0,
    );
    const rr = w.row(h);
    labelCell(rr, 1, 2, a);
    w.cell(rr, 3, 4, va, { border: true });
    if (b) {
      labelCell(rr, 5, 6, b);
      w.cell(rr, 7, 8, vb, { border: true });
    } else {
      w.cell(rr, 5, 8, '', { border: true });
    }
  };
  for (const f of block.fields) {
    if (f.kind === 'photos' || f.kind === 'video') {
      flushPair();
      const refs = f.kind === 'video' ? (f.video ? [f.video] : []) : f.photos || [];
      const l = lab(f.label);
      if (!refs.length) {
        const rr = w.row(Math.max(labelH(f, 1, 2), 18));
        labelCell(rr, 1, 2, f);
        w.cell(rr, 3, NCOL, '—', { border: true, color: C.faint });
        continue;
      }
      w.photos(refs, { label: [l.zh, l.en].filter(Boolean).join('\n'), startCol: 3 });
      continue;
    }
    const long = f.kind === 'block' || f.kind === 'list' || !grid || (f.value || '').length > 40;
    if (long) {
      flushPair();
      // 太长的值切成几行（续行），每行不超过 Excel 行高上限
      chunks(valueOf(f), spanWidth(3, NCOL), 10).forEach((v, i) => {
        const rr = w.row(Math.max(lines(v, spanWidth(3, NCOL), 10) * 14 + 4, i ? 0 : Math.max(labelH(f, 1, 2), 32)));
        if (i) w.cell(rr, 1, 2, '（续）', { size: 8, color: C.faint, fill: C.cream, border: true });
        else labelCell(rr, 1, 2, f);
        w.cell(rr, 3, NCOL, v, { border: true });
      });
      continue;
    }
    pending.push(f);
    if (pending.length === 2) flushPair();
  }
  flushPair();
  w.row(6);
}

function itemRich(w, row) {
  const t = lab(row.title);
  const d = row.desc ? lab(row.desc) : null;
  return w.rich([
    row.key ? { text: '★ ', bold: true, color: C.terra } : null,
    { text: t.zh || t.en, bold: true, size: 10 },
    row.media ? { text: ' 【影像】', size: 8, color: C.terra } : null,
    t.zh && t.en ? { text: `\n${t.en}`, size: 8, color: C.muted } : null,
    d && d.zh ? { text: `\n${d.zh}`, size: 9, color: C.body } : null,
    d && d.en ? { text: `\n${d.en}`, size: 8, color: C.muted, italic: true } : null,
  ]);
}
/** 富文本格的行数：每段按自己的字号估（英文 8pt 按 10pt 估会多出好几行空白）。parts = [[文字, 字号], …] */
const richLines = (parts, width) => parts.reduce((n, [text, pt]) => n + (text ? lines(text, width, pt) : 0), 0);
// 与 itemRich 对应（desc = false 时只有标题）
const itemParts = (row, desc = true) => {
  const t = lab(row.title);
  const d = desc && row.desc ? lab(row.desc) : {};
  return [[`${row.key ? '★ ' : ''}${t.zh || t.en}${row.media ? ' 【影像】' : ''}`, 10], [t.zh && t.en ? t.en : '', 8], [d.zh, 9], [d.en, 8]];
};
const labParts = (x) => {
  const l = lab(x);
  return [[l.zh, 9], [l.en, 8]];
};

function writeChecklist(w, block, accent) {
  const extra = block.counts?.key ? `共 ${block.counts.total} 项 · 其中关键项 ${block.counts.key} 项` : `共 ${block.counts?.total ?? block.rows.length} 项`;
  writeHeading(w, block, accent, extra);
  const opts = block.options || [];
  const layout = block.resultLayout;

  if (layout === 'ticks') {
    const width = spanWidth(2, NCOL);
    for (const row of block.rows) {
      const on = !!row.result;
      const t = lab(row.title);
      // 备注太长切成续行；第一段和标题同一格，少放几行
      const head = lines([t.zh, t.en].filter(Boolean).join('\n'), width, 10);
      const rem = row.remark ? chunks(`备注：${row.remark}`, width, 10, MAX_LINES, MAX_LINES - head) : [];
      const txt = [t.zh, t.en, rem[0] || ''].filter(Boolean).join('\n');
      const rr = w.row(Math.max(lines(txt, width, 10), 1) * 14 + 6);
      w.cell(rr, 1, 1, on ? '☑' : '☐', { align: 'center', bold: on, size: 12, color: on ? TONE.pass : C.faint, border: true });
      w.cell(rr, 2, NCOL, w.rich([
        row.media ? { text: '【影像】', size: 8, color: C.terra } : null,
        { text: t.zh || t.en, size: 10 },
        t.zh && t.en ? { text: `\n${t.en}`, size: 8, color: C.muted } : null,
        rem[0] ? { text: `\n${rem[0]}`, size: 9, color: C.body, italic: true } : null,
      ]), { border: true });
      for (const part of rem.slice(1)) {
        const r2 = w.row(lines(part, width, 10) * 14 + 6);
        w.cell(r2, 1, 1, '', { border: true });
        w.cell(r2, 2, NCOL, part, { size: 9, color: C.body, italic: true, border: true });
      }
      w.photos(row.photos);
    }
    w.row(6);
    return;
  }

  // 列分配：序号 A；检查项 B..；标准 / 方法可选；结果 E–G；备注 H
  const itemEnd = block.showStandard ? 2 : block.showMethod ? 3 : 4;
  const stdCols = block.showStandard ? [3, block.showMethod ? 3 : 4] : null;
  const methodCols = block.showMethod ? [4, 4] : null;
  const resCols = layout === 'columns' && opts.length <= 3 ? opts.map((_, i) => 5 + i) : null;

  // 表头（行高按最高的表头文字算）
  const heads = [[1, 1, '序号', 'No.', 'center'], [2, itemEnd, '检查项', 'Check Item']];
  if (stdCols) heads.push([stdCols[0], stdCols[1], '标准要求', 'Standard']);
  if (methodCols) heads.push([4, 4, '检查方法', 'Method']);
  if (resCols) {
    resCols.forEach((c, i) => heads.push([c, c, opts[i].zh, opts[i].en, 'center']));
    for (let c = 5 + resCols.length; c <= 7; c += 1) heads.push([c, c, '', '']);
  } else heads.push([5, 7, '结果', 'Result', 'center']);
  heads.push([8, 8, lab(block.remarkLabel).zh || '备注', lab(block.remarkLabel).en || 'Remarks']);
  const hr = w.row(Math.max(28, ...heads.map(([c1, c2, zh, en]) => lines(zh, spanWidth(c1, c2), 9) * 12 + (en ? lines(en, spanWidth(c1, c2), 7.5) * 10 : 0) + 6)));
  for (const [c1, c2, zh, en, align = 'left'] of heads) {
    w.cell(hr, c1, c2, w.rich([{ text: zh, bold: true, size: 9 }, en ? { text: `\n${en}`, size: 7.5, color: C.muted } : null]), {
      fill: C.cream,
      border: true,
      align,
      valign: 'middle',
    });
  }

  for (const row of block.rows) {
    const failed = row.result?.tone === 'fail';
    const tint = failed ? TINT.fail : null;
    const valueTxt = row.input ? (row.lines?.length ? row.lines.map((s) => `• ${s}`).join('\n') : row.value || '') : '';
    // 备注（H）/ 填写内容（E:H）太长 → 切成续行
    const rc = chunks(row.input ? '' : row.remark, 24, 9);
    const vc = row.input ? chunks(valueTxt, spanWidth(5, 8), 10) : [''];
    const h = Math.max(
      Math.max(
        richLines(itemParts(row, !block.showStandard), spanWidth(2, itemEnd)),
        row.desc && stdCols ? richLines(labParts(row.desc), spanWidth(stdCols[0], stdCols[1])) : 1,
        row.method && methodCols ? richLines(labParts(row.method), 15) : 1,
        lines(rc[0], 24, 9),
        resCols ? 1 : opts.length,
        2,
      ) *
        13 +
        8,
      row.input ? lines(vc[0], spanWidth(5, 8), 10) * 14 + 6 : 0,
    );
    const rr = w.row(h);
    w.cell(rr, 1, 1, row.no, { align: 'center', border: true, color: C.body, fill: tint });
    if (block.showStandard) {
      const t = lab(row.title);
      w.cell(rr, 2, itemEnd, w.rich([
        row.key ? { text: '★ ', bold: true, color: C.terra } : null,
        { text: t.zh || t.en, bold: true },
        row.media ? { text: ' 【影像】', size: 8, color: C.terra } : null,
        t.zh && t.en ? { text: `\n${t.en}`, size: 8, color: C.muted } : null,
      ]), { border: true, fill: tint });
      const d = lab(row.desc);
      w.cell(rr, stdCols[0], stdCols[1], w.rich([{ text: d.zh, size: 9, color: C.body }, d.en ? { text: `\n${d.en}`, size: 8, color: C.muted, italic: true } : null]), {
        border: true,
        fill: tint,
      });
    } else {
      w.cell(rr, 2, itemEnd, itemRich(w, row), { border: true, fill: tint });
    }
    if (methodCols) {
      const m = lab(row.method);
      w.cell(rr, 4, 4, w.rich([{ text: m.zh, size: 9, color: C.body }, m.en ? { text: `\n${m.en}`, size: 8, color: C.muted, italic: true } : null]), {
        border: true,
        fill: tint,
      });
    }
    const rOpts = row.options || opts;
    const ticks = resCols && rOpts.length <= resCols.length;
    if (row.input) {
      const il = lab(row.inputLabel);
      w.cell(rr, 5, 8, vc[0] || (il.zh ? `（${il.zh}）` : ''), { border: true, color: valueTxt ? C.ink : C.faint, fill: tint });
    } else {
      if (ticks) {
        resCols.forEach((c, i) => {
          const o = rOpts[i];
          const on = o && row.result?.v === o.v;
          w.cell(rr, c, c, o ? (on ? '☑' : '☐') : '', {
            align: 'center',
            valign: 'middle',
            size: 12,
            bold: on,
            color: on ? TONE[o.tone] || C.ink : C.faint,
            fill: on ? TINT[o.tone] || null : tint,
            border: true,
          });
        });
        for (let c = 5 + resCols.length; c <= 7; c += 1) w.cell(rr, c, c, '', { border: true, fill: tint });
      } else {
        w.cell(rr, 5, 7, w.rich(
          rOpts.map((o, i) => {
            const on = row.result?.v === o.v;
            return { text: `${i ? '\n' : ''}${on ? '☑' : '☐'} ${o.zh}${o.en ? ` ${o.en}` : ''}`, bold: on, size: 9, color: on ? TONE[o.tone] || C.ink : C.faint };
          }),
        ), { border: true, fill: row.result ? TINT[row.result.tone] || tint : tint, valign: 'middle' });
      }
      w.cell(rr, 8, 8, rc[0], { border: true, size: 9, color: failed ? TONE.fail : C.ink, fill: tint });
    }
    // 续行：同样的合并格 / 边框 / 底色；序号、结果留空，检查项写「（续）」
    for (let k = 1; k < Math.max(rc.length, vc.length); k += 1) {
      const r2 = w.row(Math.max(lines(rc[k] || '', 24, 9) * 13 + 8, row.input ? lines(vc[k] || '', spanWidth(5, 8), 10) * 14 + 6 : 0));
      w.cell(r2, 1, 1, '', { border: true, fill: tint });
      w.cell(r2, 2, itemEnd, '（续）', { size: 8, color: C.faint, border: true, fill: tint });
      if (stdCols) w.cell(r2, stdCols[0], stdCols[1], '', { border: true, fill: tint });
      if (methodCols) w.cell(r2, 4, 4, '', { border: true, fill: tint });
      if (row.input) {
        w.cell(r2, 5, 8, vc[k] || '', { border: true, fill: tint });
        continue;
      }
      if (ticks) for (let c = 5; c <= 7; c += 1) w.cell(r2, c, c, '', { border: true, fill: tint });
      else w.cell(r2, 5, 7, '', { border: true, fill: tint });
      w.cell(r2, 8, 8, rc[k] || '', { border: true, size: 9, color: failed ? TONE.fail : C.ink, fill: tint });
    }
    w.photos(row.photos);
  }
  w.row(6);
}

/**
 * 表格列 → 第 c0..H 格。列比格多时才把相邻的列合并成一格（上下叠写「列名：值」），而且只合并必要的次数；
 * 哪几列合并、每格占几列都试一遍（列少，很快），按实际列宽挑：每列分到的宽度 ÷ 权重（width，合并的几列分摊），
 * 从最窄的比起，越宽越好。这样「问题描述」（width 2）这种主要内容列不会落进 15 字的窄格。
 */
function fitColumns(cols, c0 = 2) {
  // 列太多时（模板不会这样），超出的先并进最后一列，免得组合数爆炸
  const keys = cols.length > 12 ? [...cols.slice(0, 11).map((c) => [c]), cols.slice(11)] : cols.map((c) => [c]);
  const wt = keys.map((g) => g.reduce((s, c) => s + (c.width || 1), 0));
  const n = Math.min(keys.length, NCOL - c0 + 1); // 分成几格
  const better = (x, y) => {
    for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
  };
  let best = null;
  // 一组 = { i0, i1：第 i0..i1-1 列；a, b：占第 a..b 格 }；正好 n 组，所有格都用上
  const walk = (i, slot, groups) => {
    const left = n - groups.length;
    if (!left) {
      if (i !== keys.length || slot !== NCOL + 1) return;
      const score = [];
      for (const g of groups) {
        let sum = 0;
        for (let k = g.i0; k < g.i1; k += 1) sum += wt[k];
        for (let k = g.i0; k < g.i1; k += 1) score.push(spanWidth(g.a, g.b) / sum);
      }
      score.sort((p, q) => p - q);
      if (!best || better(score, best.score)) best = { score, groups: groups.map((g) => ({ ...g })) };
      return;
    }
    for (let i1 = i + 1; i1 <= keys.length - left + 1; i1 += 1) {
      for (let b = slot; b <= NCOL - left + 1; b += 1) {
        groups.push({ i0: i, i1, a: slot, b });
        walk(i1, b + 1, groups);
        groups.pop();
      }
    }
  };
  if (n > 0) walk(0, c0, []);
  return (best ? best.groups : []).map((g) => ({ a: g.a, b: g.b, cols: keys.slice(g.i0, g.i1).flat() }));
}

function writeTable(w, block, accent) {
  writeHeading(w, block, accent);
  const cols = block.columns || [];
  // A 列 = 行号 #（与 PDF / Word 一致，填写提醒里的「整改第 n 项」才对得上）；表格列从 B 起
  const groups = fitColumns(cols, 2);
  const ranges = groups.map((g) => [g.a, g.b]);
  const join = (g, k) => g.cols.map((x) => lab(x.label)[k]).filter(Boolean).join(' / ');
  const heads = groups.map((g) => ({ a: g.a, b: g.b, zh: join(g, 'zh'), en: join(g, 'en') }));
  // 表头行高按最高的表头文字算（窄列里的长表头不会被截）
  const hr = w.row(Math.max(28, ...heads.map((x) => lines(x.zh, spanWidth(x.a, x.b), 9) * 12 + (x.en ? lines(x.en, spanWidth(x.a, x.b), 7.5) * 10 : 0) + 6)));
  w.cell(hr, 1, 1, '#', { bold: true, size: 9, fill: C.cream, border: true, align: 'center', valign: 'middle' });
  for (const x of heads) {
    w.cell(hr, x.a, x.b, w.rich([{ text: x.zh, bold: true, size: 9 }, x.en ? { text: `\n${x.en}`, size: 7.5, color: C.muted } : null]), {
      fill: C.cream,
      border: true,
      valign: 'middle',
    });
  }
  if (block.empty) {
    const rr = w.row(20);
    w.cell(rr, 1, NCOL, both(block.emptyText) || '无', { color: C.muted, border: true, align: 'center', valign: 'middle' });
    w.row(6);
    return;
  }
  block.rows.forEach((r, ri) => {
    const texts = groups.map((g) => {
      if (g.cols.length > 1) return g.cols.map((x) => `${lab(x.label).zh || lab(x.label).en}：${r.cells[x.key] || '—'}`).join('\n');
      return r.cells[g.cols[0].key] || '';
    });
    // 太长的格子切成续行（行号只写在第一行）
    const parts = texts.map((t, i) => chunks(t, spanWidth(ranges[i][0], ranges[i][1]), 9.5));
    for (let k = 0; k < Math.max(1, ...parts.map((p) => p.length)); k += 1) {
      const rr = w.row(Math.max(...parts.map((p, i) => lines(p[k] || '', spanWidth(ranges[i][0], ranges[i][1]), 9.5)), 1) * 13 + 8);
      w.cell(rr, 1, 1, k ? '' : String(ri + 1), { border: true, align: 'center', bold: true, size: 9, color: C.muted });
      ranges.forEach(([a, b], i) => w.cell(rr, a, b, parts[i][k] || '', { border: true, size: 9.5 }));
    }
    // 照片组标签放 A:B（A 列太窄，「复验照片 Re-inspection photo」会被截）
    for (const g of r.photoGroups || []) w.photos(g.photos, { label: both(g.label, '\n'), startCol: 3 });
  });
  w.row(6);
}

const LONG_VALUE = 22; // 与 PDF 一致：超过这个长度的统计值不放小卡片，改成整行

/** 把 8 列切成 k 段连续的列：按实际列宽，让最窄的一段尽量宽（列宽不均，平均分会出现很窄的格） */
function splitCols(k) {
  let best = null;
  const walk = (start, left, acc) => {
    if (left === 1) {
      const all = [...acc, [start, NCOL]];
      const min = Math.min(...all.map(([a, b]) => spanWidth(a, b)));
      if (!best || min > best.min) best = { min, all };
      return;
    }
    for (let end = start; end <= NCOL - left + 1; end += 1) walk(end + 1, left - 1, [...acc, [start, end]]);
  };
  walk(1, Math.max(1, Math.min(k, NCOL)), []);
  return best.all;
}

function writeSummary(w, block, accent) {
  writeHeading(w, { title: block.title || { zh: '结果统计', en: 'Summary' } }, accent);
  const items = block.items || [];
  const valueOf = (it) => clean(typeof it.value === 'string' ? it.value : both(it.value));
  const tiles = items.filter((it) => valueOf(it).length <= LONG_VALUE);
  const longs = items.filter((it) => valueOf(it).length > LONG_VALUE);
  // 小卡片：每行最多 4 张、各行张数尽量平均；行高按最高的一张（标签 + 值）算
  const per = tiles.length ? Math.ceil(tiles.length / Math.ceil(tiles.length / 4)) : 1;
  for (let i = 0; i < tiles.length; i += per) {
    const chunk = tiles.slice(i, i + per);
    const ranges = splitCols(chunk.length);
    const texts = chunk.map((it) => {
      const l = lab(it.label);
      return [`${l.zh}${l.en ? ` ${l.en}` : ''}`, valueOf(it)];
    });
    const rr = w.row(Math.max(34, ...texts.map(([lt, v], k) => lines(lt, spanWidth(...ranges[k]), 8) * 11 + lines(v, spanWidth(...ranges[k]), 11) * 15 + 8)));
    chunk.forEach((it, k) => {
      w.cell(rr, ranges[k][0], ranges[k][1], w.rich([
        { text: texts[k][0], size: 8, color: C.muted },
        { text: `\n${texts[k][1]}`, bold: true, size: 11, color: TONE[it.tone] || C.ink },
      ]), { fill: TINT[it.tone] || C.cream, border: true, align: 'center', valign: 'middle' });
    });
  }
  // 长的（如「待处理」列出不合格项和备注）：整行，标签 A:B + 值 C:H，太长切成续行
  for (const it of longs) {
    const l = lab(it.label);
    const tone = TONE[it.tone] ? it.tone : 'neutral';
    const lh = lines(l.zh || l.en, spanWidth(1, 2), 9) * 12 + (l.zh && l.en ? lines(l.en, spanWidth(1, 2), 7.5) * 10 : 0) + 6;
    chunks(valueOf(it), spanWidth(3, NCOL), 10).forEach((v, k) => {
      const rr = w.row(Math.max(lines(v, spanWidth(3, NCOL), 10) * 14 + 6, k ? 0 : lh));
      const head = w.rich([{ text: l.zh || l.en, bold: true, size: 9, color: C.body }, l.zh && l.en ? { text: `\n${l.en}`, size: 7.5, color: C.muted } : null]);
      w.cell(rr, 1, 2, k ? '（续）' : head, { size: 8, color: C.faint, fill: TINT[tone], border: true, leftBar: TONE[tone] });
      w.cell(rr, 3, NCOL, v, { color: TONE[tone], fill: TINT[tone], border: true });
    });
  }
  if (block.conclusion) {
    const cn = block.conclusion;
    const value = typeof cn.value === 'string' ? cn.value : both(cn.value);
    const note = cn.note ? (typeof cn.note === 'string' ? cn.note : both(cn.note, '\n')) : '';
    const label = both(cn.label) || '结论 Conclusion';
    const width = spanWidth(1, NCOL) - 2;
    const rr = w.row(Math.max(26, lines(`${label}：${value}`, width, 12) * 17 + (note ? lines(note, width, 9) * 12 : 0) + 8));
    w.cell(rr, 1, NCOL, w.rich([
      { text: `${label}：`, size: 9, color: C.white },
      { text: clean(value), bold: true, size: 12, color: C.white },
      note ? { text: `\n${note}`, size: 9, color: C.white } : null,
    ]), { fill: TONE[cn.tone] || TONE.neutral, valign: 'middle', indent: 1 });
  }
  w.row(6);
}

function writeNote(w, block, accent) {
  if (block.title) writeHeading(w, block, accent);
  for (const ln of block.lines || []) {
    const l = lab(ln);
    const width = spanWidth(1, NCOL);
    const rr = w.row(lines(l.zh, width, 9) * 13 + (l.en ? lines(l.en, width * 1.15, 8) * 11 : 0) + 4);
    w.cell(rr, 1, NCOL, w.rich([
      { text: l.zh, size: 9, color: block.tone === 'warn' ? C.terra : C.body },
      l.en ? { text: `${l.zh ? '\n' : ''}${l.en}`, size: 8, color: C.muted, italic: true } : null,
    ]));
  }
  w.row(4);
}

function writeSignatures(w, block, accent, M) {
  writeHeading(w, { title: block.title || { zh: '签名确认', en: 'SIGN-OFF' } }, accent);
  if (block.declaration) {
    const l = lab(block.declaration);
    const width = spanWidth(1, NCOL);
    const rr = w.row(lines(l.zh, width, 9) * 13 + (l.en ? lines(l.en, width * 1.15, 8) * 11 : 0) + 6);
    w.cell(rr, 1, NCOL, w.rich([{ text: l.zh, size: 9, color: C.body }, l.en ? { text: `\n${l.en}`, size: 8, color: C.muted, italic: true } : null]), {
      fill: C.cream,
    });
  }
  const roles = block.roles || [];
  if (!roles.length) return;
  const n = roles.length;
  const base = Math.floor(NCOL / n);
  const ranges = roles.map((_, i) => [1 + i * base, i === n - 1 ? NCOL : (i + 1) * base]);
  const r1 = w.row(28);
  roles.forEach((ro, i) => {
    const l = lab(ro.label);
    w.cell(r1, ranges[i][0], ranges[i][1], w.rich([{ text: l.zh, bold: true, size: 9.5 }, l.en ? { text: `\n${l.en}`, size: 7.5, color: C.muted } : null]), {
      fill: C.cream,
      border: true,
      valign: 'middle',
    });
  });
  const r2 = w.row(52);
  roles.forEach((ro, i) => {
    w.cell(r2, ranges[i][0], ranges[i][1], '', { border: true });
    const m = ro.image ? M.get(ro.image.id) : null;
    if (m && m.data) {
      const maxW = COL_X[ranges[i][1] - 1] + COL_PX[ranges[i][1] - 1] - COL_X[ranges[i][0] - 1] - 16;
      const s = Math.min(58 / m.h, Math.min(220, maxW) / m.w);
      w.placeImage(m, r2, COL_X[ranges[i][0] - 1] + 8, 6, m.w * s, m.h * s);
    }
  });
  const r3 = w.row(30);
  roles.forEach((ro, i) => {
    w.cell(r3, ranges[i][0], ranges[i][1], w.rich([
      { text: `姓名 Name：${ro.name || ''}`, size: 9 },
      { text: `\n日期 Date：${ro.date || ''}`, size: 9, color: C.body },
    ]), { border: true });
  });
  w.row(6);
}

// ---------- 数据表 ----------
function writeData(ws, model, M) {
  const thin = { style: 'thin', color: { argb: C.line } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const headFont = { name: FONT, size: 10, bold: true, color: { argb: C.ink } };
  const bodyFont = { name: FONT, size: 10, color: { argb: C.ink } };
  const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.cream2 } };
  ws.columns = [
    { width: 18 }, { width: 8 }, { width: 34 }, { width: 30 }, { width: 7 }, { width: 7 },
    { width: 12 }, { width: 12 }, { width: 36 }, { width: 9 },
  ];
  let r = 0;
  const put = (values, { head = false } = {}) => {
    r += 1;
    const rw = ws.getRow(r);
    values.forEach((v, i) => {
      const c = rw.getCell(i + 1);
      c.value = typeof v === 'string' ? clean(v) : v;
      c.font = head ? headFont : bodyFont;
      c.alignment = { vertical: 'top', wrapText: true };
      c.border = border;
      if (head) c.fill = headFill;
    });
    return r;
  };

  const checklists = model.blocks.filter((b) => b.type === 'checklist');
  let itemStart = 0;
  let itemEnd = 0;
  if (checklists.length) {
    itemStart = put(['节 Section', '序号 No.', '检查项 Item', 'Item (EN)', '关键 Key', '影像 Media', '结果 Result', 'Result (EN)', '备注 Remarks', '照片数 Photos'], { head: true });
    for (const b of checklists) {
      const sec = [b.no, lab(b.title).zh || lab(b.title).en].filter(Boolean).join(' ');
      for (const row of b.rows) {
        const t = lab(row.title);
        const res = row.input
          ? [row.lines?.length ? row.lines.join(' / ') : row.value || '', '']
          : row.result
            ? [row.result.zh || row.result.v, row.result.en || '']
            : ['', ''];
        const rr = put([sec, String(row.no ?? ''), t.zh, t.en, row.key ? '★' : '', row.media ? '✓' : '', res[0], res[1], row.remark || '', row.photos.filter((p) => M.has(p.id)).length]);
        if (row.result) {
          const tone = row.result.tone;
          ws.getCell(rr, 7).font = { ...bodyFont, bold: true, color: { argb: TONE[tone] || C.ink } };
        }
      }
    }
    itemEnd = r;
    ws.autoFilter = { from: { row: itemStart, column: 1 }, to: { row: itemEnd, column: 10 } };
    ws.views = [{ state: 'frozen', ySplit: itemStart, showGridLines: true }];
    r += 1;
  }

  const fieldBlocks = model.blocks.filter((b) => b.type === 'fields');
  if (fieldBlocks.length) {
    r += 1;
    put(['字段 Field', '', '内容 Value', '', '', '', '', '', '', ''], { head: true });
    ws.mergeCells(r, 1, r, 2);
    ws.mergeCells(r, 3, r, 10);
    for (const b of fieldBlocks) {
      for (const f of b.fields) {
        const l = lab(f.label);
        let v = f.kind === 'list' ? (f.lines || []).join('\n') : f.value || '';
        if (f.kind === 'photos') v = `${(f.photos || []).filter((p) => M.has(p.id)).length} 张照片`;
        if (f.kind === 'video') v = f.video ? '已附视频' : '';
        put([[l.zh, l.en].filter(Boolean).join(' '), '', v, '', '', '', '', '', '', '']);
        ws.mergeCells(r, 1, r, 2);
        ws.mergeCells(r, 3, r, 10);
      }
    }
  }

  for (const b of model.blocks.filter((x) => x.type === 'table')) {
    r += 2;
    const t = lab(b.title);
    ws.getCell(r, 1).value = clean([b.no, t.zh, t.en].filter(Boolean).join(' '));
    ws.getCell(r, 1).font = { ...headFont, size: 11 };
    const cols = b.columns.slice(0, 9);
    put(['#', ...cols.map((c) => lab(c.label).zh || lab(c.label).en)], { head: true });
    b.rows.forEach((row, i) => put([String(i + 1), ...cols.map((c) => row.cells[c.key] || '')]));
    if (b.empty) put(['', both(b.emptyText) || '无']);
  }

  const sig = model.blocks.find((x) => x.type === 'signatures');
  if (sig) {
    r += 2;
    put(['签名 Sign-off', '', '姓名 Name', '', '日期 Date', '', '已签 Signed', '', '', ''], { head: true });
    for (const ro of sig.roles) put([both(ro.label), '', ro.name || '', '', ro.date || '', '', ro.image && M.has(ro.image.id) ? '✓' : '', '', '', '']);
  }
}

// ---------- 入口 ----------
async function loadExcel() {
  const mod = await import('exceljs');
  const X = mod.default || mod;
  const Workbook = X.Workbook || X.default?.Workbook;
  if (!Workbook) throw new Error('Excel 引擎加载失败');
  return Workbook;
}

/**
 * @param {DocModel} model
 * @param {{ get(id): Promise<Media|null> }} media
 * @param {{ logo?: ArrayBuffer|Uint8Array|Blob }} opts
 * @returns {Promise<Blob>}
 */
export async function exportXlsx(model, media, { logo } = {}) {
  const Workbook = await loadExcel();
  const meta = model.meta || {};
  const [M, logoImg] = await Promise.all([
    loadMedia(model, media),
    (async () => {
      const data = await bytesOf(logo).catch(() => null);
      const info = imageInfo(data);
      return info ? { data, ext: info.ext, w: info.w || 700, h: info.h || 268 } : null;
    })(),
  ]);

  const wb = new Workbook();
  wb.creator = meta.company || '溪岸 Sail by Riccione Reka';
  wb.created = new Date();
  wb.title = clean(meta.reportTitle || '');

  const title = lab(meta.title);
  const ws = wb.addWorksheet(sheetName(title.zh || title.en, '报告'), {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.25 },
    },
    headerFooter: {
      oddFooter: `&L&8${clean(meta.company || '溪岸 Sail by Riccione Reka').replace(/&/g, '&&')} · ${clean(meta.reportTitle || '').replace(/&/g, '&&').slice(0, 60)}&R&8第 &P / &N 页`,
    },
    properties: { defaultRowHeight: 16 },
  });
  ws.columns = COLS.map((width) => ({ width }));

  const w = createWriter(wb, ws, M, `FF${String(meta.accent || '#B5623A').replace('#', '').toUpperCase()}`);
  const accent = writeHeader(w, ws, model, logoImg);
  for (const b of model.blocks) {
    if (b.type === 'fields') writeFields(w, b, accent);
    else if (b.type === 'checklist') writeChecklist(w, b, accent);
    else if (b.type === 'table') writeTable(w, b, accent);
    else if (b.type === 'summary') writeSummary(w, b, accent);
    else if (b.type === 'note') writeNote(w, b, accent);
    else if (b.type === 'signatures') writeSignatures(w, b, accent, M);
  }
  if (meta.footer) {
    const rr = w.row(18);
    w.cell(rr, 1, NCOL, meta.footer, { size: 8, color: C.muted, align: 'center' });
  }
  const rr = w.row(16);
  w.cell(rr, 1, NCOL, `${clean(meta.company || '溪岸 Sail by Riccione Reka')} · 生成于 ${String(meta.generatedAt || '').slice(0, 16).replace('T', ' ')}`, {
    size: 7.5,
    color: C.faint,
    align: 'right',
  });
  ws.pageSetup.printArea = `A1:H${w.r}`;

  writeData(wb.addWorksheet('数据 Data'), model, M);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: XLSX_MIME });
}
