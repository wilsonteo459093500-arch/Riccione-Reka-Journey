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
const TONE = { pass: 'FF3F7A4F', fail: 'FFB8452F', na: 'FF8A857C', warn: 'FFB5623A', neutral: 'FF55524B' };
const TINT = { pass: 'FFEAF2EC', fail: 'FFF8E5E0', na: 'FFF1EFEA', warn: 'FFF8EDE4', neutral: 'FFF8F4EB' };
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

/** 文本在给定列宽（字符）里大约占几行（中文按 2 个字符宽） */
function lines(text, widthChars, fontPt = 10) {
  if (!text) return 1;
  const scale = fontPt / 10;
  const cap = Math.max(4, widthChars * 1.1);
  let n = 0;
  for (const para of String(text).split('\n')) {
    let units = 0;
    for (const ch of para) units += ch.charCodeAt(0) > 0x2e7f ? 2 : 1;
    n += Math.max(1, Math.ceil((units * scale) / cap));
  }
  return n;
}
const spanWidth = (c1, c2) => COLS.slice(c1 - 1, c2).reduce((s, w) => s + w, 0);

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
        x.border = { ...box, ...(o.leftBar && c === c1 ? { left: { style: 'thick', color: { argb: accent } } } : {}) };
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

  /** 在第 rr 行从像素 x 处放图（oneCellAnchor：起点在所在列内，宽度可跨列） */
  function placeImage(m, rr, x, y, w, h) {
    let col = 0;
    while (col < NCOL - 1 && x >= COL_X[col] + COL_PX[col]) col += 1;
    const off = Math.max(0, Math.min(x - COL_X[col], COL_PX[col] - 2));
    ws.addImage(imageId(m), {
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
    const items = (ids || []).map((ref) => ({ ref, m: M.get(ref.id) })).filter((x) => x.m);
    if (!items.length) return 0;
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
      const hPx = PHOTO_H + 10 + (caps.length ? 16 : 0);
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
  const valueOf = (f) => (f.kind === 'list' ? (f.lines || []).map((s) => `• ${s}`).join('\n') : f.value || '');
  const pending = [];
  const flushPair = () => {
    if (!pending.length) return;
    const [a, b] = pending.splice(0);
    const va = valueOf(a);
    const vb = b ? valueOf(b) : '';
    const h = Math.max(lines(va, spanWidth(3, 4), 10), b ? lines(vb, spanWidth(7, 8), 10) : 1, 2) * 14 + 4;
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
        const rr = w.row(18);
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
      const v = valueOf(f);
      const rr = w.row(Math.max(lines(v, spanWidth(3, NCOL), 10), 2) * 14 + 4);
      labelCell(rr, 1, 2, f);
      w.cell(rr, 3, NCOL, v, { border: true });
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
const itemText = (row) => {
  const t = lab(row.title);
  const d = row.desc ? lab(row.desc) : {};
  return [`${row.key ? '★ ' : ''}${t.zh}`, t.en, d.zh, d.en].filter(Boolean).join('\n');
};

function writeChecklist(w, block, accent) {
  const extra = block.counts?.key ? `共 ${block.counts.total} 项 · 其中关键项 ${block.counts.key} 项` : `共 ${block.counts?.total ?? block.rows.length} 项`;
  writeHeading(w, block, accent, extra);
  const opts = block.options || [];
  const layout = block.resultLayout;

  if (layout === 'ticks') {
    for (const row of block.rows) {
      const on = !!row.result;
      const t = lab(row.title);
      const txt = [t.zh, t.en, row.remark ? `备注：${row.remark}` : ''].filter(Boolean).join('\n');
      const rr = w.row(Math.max(lines(txt, spanWidth(2, NCOL), 10), 1) * 14 + 6);
      w.cell(rr, 1, 1, on ? '☑' : '☐', { align: 'center', bold: on, size: 12, color: on ? TONE.pass : C.faint, border: true });
      w.cell(rr, 2, NCOL, w.rich([
        row.media ? { text: '【影像】', size: 8, color: C.terra } : null,
        { text: t.zh || t.en, size: 10 },
        t.zh && t.en ? { text: `\n${t.en}`, size: 8, color: C.muted } : null,
        row.remark ? { text: `\n备注：${row.remark}`, size: 9, color: C.body, italic: true } : null,
      ]), { border: true });
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

  // 表头
  const hr = w.row(28);
  const hdr = (c1, c2, zh, en, align = 'left') =>
    w.cell(hr, c1, c2, w.rich([{ text: zh, bold: true, size: 9 }, en ? { text: `\n${en}`, size: 7.5, color: C.muted } : null]), {
      fill: C.cream,
      border: true,
      align,
      valign: 'middle',
    });
  hdr(1, 1, '序号', 'No.', 'center');
  hdr(2, itemEnd, '检查项', 'Check Item');
  if (stdCols) hdr(stdCols[0], stdCols[1], '标准要求', 'Standard');
  if (methodCols) hdr(4, 4, '检查方法', 'Method');
  if (resCols) {
    resCols.forEach((c, i) => hdr(c, c, opts[i].zh, opts[i].en, 'center'));
    for (let c = 5 + resCols.length; c <= 7; c += 1) hdr(c, c, '', '');
  } else hdr(5, 7, '结果', 'Result', 'center');
  hdr(8, 8, lab(block.remarkLabel).zh || '备注', lab(block.remarkLabel).en || 'Remarks');

  for (const row of block.rows) {
    const failed = row.result?.tone === 'fail';
    const tint = failed ? TINT.fail : null;
    const std = row.desc && block.showStandard ? both(row.desc, '\n') : '';
    const method = row.method && block.showMethod ? both(row.method, '\n') : '';
    const itemTxt = block.showStandard ? [lab(row.title).zh, lab(row.title).en].join('\n') : itemText(row);
    const valueTxt = row.input ? (row.lines?.length ? row.lines.map((s) => `• ${s}`).join('\n') : row.value || '') : '';
    const h =
      Math.max(
        lines(itemTxt, spanWidth(2, itemEnd), 10),
        std ? lines(std, spanWidth(stdCols[0], stdCols[1]), 9) : 1,
        method ? lines(method, 15, 9) : 1,
        lines(row.remark, 24, 9),
        row.input ? lines(valueTxt, spanWidth(5, 8), 10) : 1,
        resCols ? 1 : opts.length,
        2,
      ) *
        13 +
      8;
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
    if (row.input) {
      const il = lab(row.inputLabel);
      w.cell(rr, 5, 8, valueTxt || (il.zh ? `（${il.zh}）` : ''), { border: true, color: valueTxt ? C.ink : C.faint, fill: tint });
    } else {
      const rOpts = row.options || opts;
      if (resCols && rOpts.length <= resCols.length) {
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
      w.cell(rr, 8, 8, row.remark, { border: true, size: 9, color: failed ? TONE.fail : C.ink, fill: tint });
    }
    w.photos(row.photos);
  }
  w.row(6);
}

function writeTable(w, block, accent) {
  writeHeading(w, block, accent);
  const cols = block.columns || [];
  // 映射到 8 列：列少时把多余宽度给权重最大的列；列多时多出来的合并进最后一格
  const n = Math.min(cols.length, NCOL);
  const spans = Array(n).fill(1);
  let extra = NCOL - n;
  if (extra > 0) {
    const order = cols.slice(0, n).map((c, i) => [c.width || 1, i]).sort((a, b) => b[0] - a[0]);
    let k = 0;
    while (extra > 0) {
      spans[order[k % order.length][1]] += 1;
      extra -= 1;
      k += 1;
    }
  }
  const ranges = [];
  let c = 1;
  for (let i = 0; i < n; i += 1) {
    ranges.push([c, c + spans[i] - 1]);
    c += spans[i];
  }
  const hr = w.row(28);
  ranges.forEach(([a, b], i) => {
    const l = lab(cols[i].label);
    const more = i === n - 1 && cols.length > n ? cols.slice(n).map((x) => lab(x.label).zh).join(' / ') : '';
    w.cell(hr, a, b, w.rich([{ text: l.zh + (more ? ` / ${more}` : ''), bold: true, size: 9 }, l.en ? { text: `\n${l.en}`, size: 7.5, color: C.muted } : null]), {
      fill: C.cream,
      border: true,
      valign: 'middle',
    });
  });
  if (block.empty) {
    const rr = w.row(20);
    w.cell(rr, 1, NCOL, both(block.emptyText) || '无', { color: C.muted, border: true, align: 'center', valign: 'middle' });
    w.row(6);
    return;
  }
  for (const r of block.rows) {
    const texts = ranges.map((_, i) => {
      if (i === n - 1 && cols.length > n) return cols.slice(n - 1).map((x) => `${lab(x.label).zh}：${r.cells[x.key] || '—'}`).join('\n');
      return r.cells[cols[i].key] || '';
    });
    const h = Math.max(...texts.map((t, i) => lines(t, spanWidth(ranges[i][0], ranges[i][1]), 9.5)), 1) * 13 + 8;
    const rr = w.row(h);
    ranges.forEach(([a, b], i) => w.cell(rr, a, b, texts[i], { border: true, size: 9.5 }));
    for (const g of r.photoGroups || []) w.photos(g.photos, { label: both(g.label, '\n'), startCol: 2 });
  }
  w.row(6);
}

function writeSummary(w, block, accent) {
  writeHeading(w, { title: block.title || { zh: '结果统计', en: 'Summary' } }, accent);
  const items = block.items || [];
  if (items.length) {
    const per = Math.max(1, Math.floor(NCOL / Math.min(items.length, 4)));
    for (let i = 0; i < items.length; i += 4) {
      const chunk = items.slice(i, i + 4);
      const rr = w.row(34);
      chunk.forEach((it, k) => {
        const c1 = 1 + k * per;
        const c2 = k === chunk.length - 1 ? NCOL : c1 + per - 1;
        const l = lab(it.label);
        w.cell(rr, c1, c2, w.rich([
          { text: `${l.zh}${l.en ? ` ${l.en}` : ''}`, size: 8, color: C.muted },
          { text: `\n${clean(typeof it.value === 'string' ? it.value : both(it.value))}`, bold: true, size: 11, color: TONE[it.tone] || C.ink },
        ]), { fill: TINT[it.tone] || C.cream, border: true, align: 'center', valign: 'middle' });
      });
    }
  }
  if (block.conclusion) {
    const cn = block.conclusion;
    const value = typeof cn.value === 'string' ? cn.value : both(cn.value);
    const note = cn.note ? (typeof cn.note === 'string' ? cn.note : both(cn.note, '\n')) : '';
    const rr = w.row(26 + (note ? lines(note, spanWidth(1, NCOL), 9) * 12 : 0));
    w.cell(rr, 1, NCOL, w.rich([
      { text: `${both(cn.label)}：`, size: 9, color: C.white },
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
    if (m) {
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
