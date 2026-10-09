// 方案页版式 —— 坐标全部取自已定稿的 Dreamhouse Blueprint PPT（第 15–55 页），保证生成结果与定稿一致。
// 每个函数：(数据, ctx) → { bg, els, warnings }；ctx = { meta(src)→{w,h}|null, project }

import { C, TS, BRAND_FOOTER, SLIDE_W, SLIDE_H } from '../theme.js';
import { rect, gradRect, img, text, richText, measureText, countLines, lineHeightPx, hasCJK } from './spec.js';
import { clientLine, floorsLine } from './model.js';

const withNat = (el, ctx) => {
  const nat = el.src && ctx?.meta ? ctx.meta(el.src) : null;
  return nat ? { ...el, nat } : el;
};

// ---------------------------------------------------------------------------
// 共用部件
// ---------------------------------------------------------------------------

export function footer(dark, rightLabel, { ruleW = 1728, rightEdge = 1824 } = {}) {
  const els = [
    rect(96, 983.7, ruleW, 1, dark ? C.light : C.line, dark ? 0.25 : 1),
    text(96, 1002.6, 600, 41.4, BRAND_FOOTER, dark ? TS.footBrandDark : TS.footBrand),
  ];
  if (rightLabel) {
    els.push(text(rightEdge - 600, 1005.4, 602.7, 35.8, rightLabel, dark ? TS.footRightDark : TS.footRight, { align: 'r' }));
  }
  return els;
}

/** 材料显示值：名称 + 编号（编号用无衬线小字，与定稿一致） */
function materialRuns(mat, dark) {
  const name = (mat?.name || '').trim() || (mat?.code ? '' : '未命名材料');
  const code = (mat?.code || '').trim();
  const runs = [];
  if (name) runs.push({ ...(dark ? TS.valueDark : TS.value), text: name });
  if (code) runs.push({ ...(dark ? TS.codeDark : TS.code), text: `${name ? ' ' : ''}${code}` });
  if (!runs.length) runs.push({ ...(dark ? TS.valueDark : TS.value), text: '—' });
  return runs;
}

function materialValueWidth(mat) {
  const name = (mat?.name || '').trim();
  const code = (mat?.code || '').trim();
  return measureText(name, 'serif', 22.5) + (code ? measureText(` ${code}`, 'sans', 18, 2.52) : 0);
}

const viewTitle = (v) => [v.room, v.subtitle].map((s) => (s || '').trim()).filter(Boolean).join(' · ') || '未命名';

const viewEyebrow = (v, floor) =>
  [floor?.en, (v.roomEn || '').trim().toUpperCase()].filter(Boolean).join(' · ') || 'DESIGN';

const floorFooter = (floor) => (floor ? [floor.en, floor.zh].filter(Boolean).join(' · ') : 'DESIGN · 03');

// ---------------------------------------------------------------------------
// 本案材料（定稿第 15 页）：6 列 × 2 行，超出由 deck.js 分页
// ---------------------------------------------------------------------------

// ≤12 种：定稿的 2 行大格；13–18 种：3 行紧凑格（避免第二页只剩一两种）；更多才分页
export const MATERIALS_PER_PAGE = 18;

export function layoutMaterials(materials, ctx, opts = {}) {
  if (materials.length > 12) return layoutMaterialsCompact(materials, ctx, opts);
  return layoutMaterialsRegular(materials, ctx, opts);
}

function materialsHeader(ctx, page, pages) {
  const info = ctx.project?.info || {};
  const who = clientLine(info).toUpperCase();
  const caption = ['MATERIAL PALETTE', who, pages > 1 ? `${page}/${pages}` : ''].filter(Boolean).join(' · ');
  return [
    text(96, 96, 900, 35.8, 'MATERIALS · 材料', TS.eyebrow),
    rect(96, 151.8, 56, 1, C.rule),
    text(96, 180.8, 900, 80.8, '本案材料', { font: 'serif', size: 48, color: C.ink }, { lineSpacing: 83.43 }),
    text(1024, 227.7, 802.7, 33.9, caption, { font: 'sans', size: 18, spacing: 5.76, color: C.faint }, { align: 'r' }),
  ];
}

function layoutMaterialsCompact(materials, ctx, { page = 1, pages = 1 } = {}) {
  const els = materialsHeader(ctx, page, pages);
  const cellW = 261.3;
  const cellH = 120;
  const step = 293.33;
  const rows = [288, 516, 744];
  materials.slice(0, 18).forEach((m, i) => {
    const x = 96 + (i % 6) * step;
    const y = rows[Math.floor(i / 6)];
    if (m.image) els.push(withNat(img(x, y, cellW, cellH, m.image, { edit: { field: `material:${m.id}` } }), ctx));
    else els.push(rect(x, y, cellW, cellH, C.placeholder));
    const name = (m.name || '').trim() || m.code || '未命名材料';
    const code = m.name ? (m.code || '').trim() : '';
    els.push({ ...text(x, y + cellH + 10, 287.5, 40, name, { font: 'serif', size: 19.5, color: C.ink }, { edit: { field: `material:${m.id}` } }), autofit: 'shrink', nowrap: true });
    if (code) els.push(text(x, y + cellH + 50, 287.5, 33.9, code, { font: 'sans', size: 16.5, spacing: 2.52, color: C.faint }));
  });
  els.push(...footer(false, 'DESIGN · 03'));
  return { bg: C.paper, els, warnings: [] };
}

function layoutMaterialsRegular(materials, ctx, { page = 1, pages = 1 } = {}) {
  const els = materialsHeader(ctx, page, pages);
  const cellW = 261.3;
  const cellH = 190;
  const step = 293.33;
  const rows = [300, 620.1];
  materials.slice(0, 12).forEach((m, i) => {
    const x = 96 + (i % 6) * step;
    const y = rows[Math.floor(i / 6)];
    if (m.image) {
      els.push(withNat(img(x, y, cellW, cellH, m.image, { edit: { field: `material:${m.id}` } }), ctx));
    } else {
      els.push(rect(x, y, cellW, cellH, C.placeholder));
    }
    const name = (m.name || '').trim() || m.code || '未命名材料';
    const code = m.name ? (m.code || '').trim() : '';
    const lines = Math.min(3, countLines(name, 'serif', 21, 0, 287.5));
    els.push(text(x, y + 208, 287.5, 44.2 + (lines - 1) * 40.2, name, { font: 'serif', size: 21, color: C.ink }, { edit: { field: `material:${m.id}` } }));
    if (code) els.push(text(x, y + 254.2 + (lines - 1) * 40.2, 287.5, 33.9, code, { font: 'sans', size: 18, spacing: 2.52, color: C.faint }));
  });
  if (!materials.length) {
    els.push(text(96, 420, 1728, 60, '还没有材料 —— 在「材料清单」里添加，或从 PDF 自动识别。', { font: 'serif', size: 24, color: C.faint }));
  }
  els.push(...footer(false, 'DESIGN · 03'));
  return { bg: C.paper, els, warnings: materials.length ? [] : ['本案材料为空'] };
}

// ---------------------------------------------------------------------------
// 楼层章节页（定稿第 16 / 44 页）：满版效果图 + 压暗 + 左下楼层名 + 右下空间清单
// ---------------------------------------------------------------------------

export function roomsLines(rooms, maxW = 720) {
  const lines = [];
  let cur = '';
  for (const r of rooms) {
    const next = cur ? `${cur} · ${r}` : r;
    if (cur && measureText(next, 'serif', 22.5, 2.25) > maxW) {
      lines.push(cur);
      cur = r;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

export function layoutFloor(floor, rooms, image, ctx) {
  const els = [];
  if (image) els.push(withNat(img(0, 0, SLIDE_W, SLIDE_H, image, { edit: { field: 'image' } }), ctx));
  els.push(rect(0, 0, SLIDE_W, SLIDE_H, C.overlay, 0.34));
  els.push(gradRect(0, 0, SLIDE_W, SLIDE_H, 270, [
    { pos: 0, color: C.overlay, alpha: 0.82 },
    { pos: 60, color: C.overlay, alpha: 0 },
  ]));
  els.push(text(96, 813.3, 1100, 35.8, `${floor?.en || 'DESIGN'} · 设计图`, TS.eyebrowDark, { edit: { field: 'floor.en' } }));
  els.push(text(96, 869, 1100, 119, floor?.zh || '方案', { font: 'serif', size: 60, spacing: 14.4, color: C.light }, { edit: { field: 'floor.zh' } }));
  const lines = roomsLines(rooms);
  if (lines.length) {
    els.push({ ...text(824, 760, 1002.7, 228, lines.join('\n'), { font: 'serif', size: 22.5, spacing: 2.25, color: C.light }, { align: 'r', valign: 'b', lineSpacing: 139.57 }), nowrap: true });
  }
  return { bg: C.dark, els, warnings: image ? [] : ['楼层章节页没有背景图'] };
}

// ---------------------------------------------------------------------------
// 效果图 · 满版（定稿第 20/21/25/27… 页）
// ---------------------------------------------------------------------------

export function layoutViewFull(view, floor, ctx) {
  const els = [];
  const warnings = [];
  if (view.image) els.push(withNat(img(0, 0, SLIDE_W, SLIDE_H, view.image, { edit: { field: 'image' } }), ctx));
  else warnings.push('缺少效果图');
  els.push(gradRect(0, 0, SLIDE_W, SLIDE_H, 270, [
    { pos: 0, color: C.overlay, alpha: 0.92 },
    { pos: 30, color: C.overlay, alpha: 0.72 },
    { pos: 60, color: C.overlay, alpha: 0 },
  ]));

  // 右下：材料 / 备注列。先量左下标题区要多宽，剩下的宽度给右侧列；一行放不下就往上叠第二行（最多 2 行）
  const eyebrow = viewEyebrow(view, floor);
  const title = viewTitle(view);
  const leftNeed = Math.min(1180, 96 + Math.max(measureText(eyebrow, 'sans', 18, 7.56), measureText(title, 'serif', 42)) + 72);
  const colsMinX = Math.max(leftNeed, 760);
  const avail = 1824 - colsMinX;
  const GAP = 64;
  const cols = [
    ...(view.notes || []).map((n, i) => ({ n, i })).filter(({ n }) => (n.text || n.label || '').trim())
      .map(({ n, i }) => ({ kind: 'note', i, label: (n.label || '备注').trim(), text: (n.text || '').trim() })),
    ...(view.materials || []).map((r, i) => ({ kind: 'mat', i, materialId: r.materialId, label: (r.role || '材料').trim(), mat: ctx.project ? (ctx.project.materials || []).find((m) => m.id === r.materialId) : null })),
  ].map((col) => {
    const labelW = measureText(col.label, 'sans', 18, 3.6);
    const valueW = col.kind === 'mat' ? materialValueWidth(col.mat) : measureText(col.text, 'serif', 22.5);
    const w = Math.min(avail, 520, Math.max(labelW, valueW) * 1.06 + 12);
    const valueLines = col.kind === 'mat' ? Math.min(2, countLines(`${col.mat?.name || ''} ${col.mat?.code || ''}`, 'serif', 22.5, 0, w)) : Math.min(3, countLines(col.text, 'serif', 22.5, 0, w));
    return { ...col, w, valueH: valueLines * 36 + 11 };
  });
  // 按阅读顺序装行：第 1 行（最靠下）放前几项，放不下的进第 2 行
  const rowsOfCols = [[]];
  let used = 0;
  for (const col of cols) {
    const need = (rowsOfCols[rowsOfCols.length - 1].length ? GAP : 0) + col.w;
    if (used + need > avail && rowsOfCols[rowsOfCols.length - 1].length) {
      rowsOfCols.push([]);
      used = 0;
    }
    rowsOfCols[rowsOfCols.length - 1].push(col);
    used += (rowsOfCols[rowsOfCols.length - 1].length > 1 ? GAP : 0) + col.w;
  }
  const shown = rowsOfCols.slice(0, 2);
  const hidden = rowsOfCols.slice(2).reduce((n, r) => n + r.length, 0);
  if (hidden) warnings.push(`满版页右下放不下全部 ${cols.length} 项（隐藏了 ${hidden} 项）—— 建议切换成「框图」版式`);
  for (const col of cols) {
    if (col.kind === 'mat' && !col.mat) warnings.push(col.materialId ? `第 ${col.i + 1} 项材料已被删除` : `第 ${col.i + 1} 项还没选材料`);
  }
  let bottom = 1012;
  shown.forEach((row) => {
    const rowValueH = Math.max(...row.map((c) => c.valueH));
    let right = 1824;
    for (const col of [...row].reverse()) {
      const x = right - col.w;
      const valueY = bottom - col.valueH;
      els.push(text(x, valueY - 39.8, col.w + 24, 35.8, col.label, TS.labelDark, { edit: { field: col.kind === 'mat' ? `materials.${col.i}.role` : `notes.${col.i}.label` } }));
      if (col.kind === 'mat') {
        els.push(richText(x, valueY, col.w + 24, col.valueH, [{ runs: materialRuns(col.mat, true) }], { edit: { field: `materials.${col.i}` } }));
      } else {
        els.push(text(x, valueY, col.w, col.valueH, col.text, TS.valueDark, { edit: { field: `notes.${col.i}.text` } }));
      }
      right = x - GAP;
    }
    bottom -= rowValueH + 39.8 + 28;
  });

  // 左下：英文小标题 + 标题，底边对齐 1012，标题折行时往上长
  const titleW = colsMinX - 96 - 48;
  const tSize = countLines(title, 'serif', 42, 0, titleW) > 1 ? 34 : 42;
  const tLines = Math.min(3, countLines(title, 'serif', tSize, 0, titleW));
  const tH = tSize * 1.7 + (tLines - 1) * lineHeightPx(tSize, 83.61);
  const tY = 1012 - tH;
  els.push({ ...text(96, tY - 49.9, titleW, 33.9, eyebrow, TS.eyebrowDark, { edit: { field: 'roomEn' } }), nowrap: true, autofit: 'shrink' });
  els.push(text(96, tY, titleW, tH, title, { font: 'serif', size: tSize, color: C.light }, { lineSpacing: 83.61, edit: { field: 'title' } }));
  return { bg: C.dark, els, warnings };
}

// ---------------------------------------------------------------------------
// 效果图 · 框图（定稿第 17/22/26… 页）：左图右文
// ---------------------------------------------------------------------------

export function layoutViewFramed(view, floor, ctx) {
  const els = [];
  const warnings = [];
  if (view.image) {
    els.push(withNat(img(96, 96, 1140, 864, view.image, { fit: 'contain', ax: 0, ay: 0.5, edit: { field: 'image' } }), ctx));
  } else {
    els.push(rect(96, 96, 1140, 864, C.placeholder));
    warnings.push('缺少效果图');
  }
  const X = 1300;
  const W = 576.4;
  els.push(text(X, 96, 540, 63.8, viewEyebrow(view, floor), TS.eyebrow, { edit: { field: 'roomEn' } }));
  els.push(rect(X, 179.8, 56, 1, C.rule));
  const title = viewTitle(view);
  // 标题超过两行时降到 34pt，避免第三行只剩一两个字
  const tSize = countLines(title, 'serif', 42, 0, W) > 2 ? 34 : 42;
  const tLines = Math.min(3, countLines(title, 'serif', tSize, 0, W));
  const tLineH = lineHeightPx(tSize, 90.58);
  els.push(text(X, 212.8, W, Math.max(76.8, tLines * tLineH + 16), title, { font: 'serif', size: tSize, color: C.ink }, { lineSpacing: 90.58, edit: { field: 'title' } }));

  // i = 在 view.notes / view.materials 里的原始序号（edit 字段与数据下标一致）
  const notes = (view.notes || []).map((n, i) => ({ n, i })).filter(({ n }) => (n.text || n.label || '').trim());
  const mats = view.materials || [];
  const rows = [
    ...notes.map(({ n, i }) => ({ kind: 'note', i, n })),
    ...mats.map((r, i) => ({ kind: 'mat', i, r, mat: (ctx.project?.materials || []).find((m) => m.id === r.materialId) || null })),
  ];
  if (!rows.length) {
    els.push(...footer(false, floorFooter(floor)));
    return { bg: C.paper, els, warnings };
  }

  const top = 212.8 + tLines * tLineH + 59.9;
  const lineH = 36;
  const measureRow = (row, compact) => {
    if (row.kind === 'note') {
      const lines = Math.min(4, countLines(row.n.text || '', 'serif', 22.5, 0, W));
      return (compact ? 96 : 129.7) + (lines - 1) * lineH;
    }
    const lines = Math.min(2, countLines(`${row.mat?.name || ''} ${row.mat?.code || ''}`, 'serif', 22.5, 0, compact ? 436 : 412));
    return (compact ? 100 : 136.9) + (lines - 1) * lineH;
  };
  const limit = 965;
  let compact = rows.reduce((s, r) => s + measureRow(r, false), top) > limit;
  if (compact && rows.reduce((s, r) => s + measureRow(r, true), top) > limit) {
    warnings.push('右侧说明太多放不下 —— 建议拆成两页，或删掉部分备注');
  }

  let y = top;
  els.push(rect(X, y, 524, 1, C.line));
  for (const row of rows) {
    const h = measureRow(row, compact);
    if (row.kind === 'note') {
      const lab = (row.n.label || '备注').trim();
      els.push(text(X, y + (compact ? 16 : 24.9), W, 35.8, lab, TS.label, { edit: { field: `notes.${row.i}.label` } }));
      els.push(text(X, y + (compact ? 52 : 62.7), W, h - (compact ? 60 : 82), row.n.text || '', TS.value, { edit: { field: `notes.${row.i}.text` } }));
    } else {
      const sw = compact ? 64 : 88;
      const sy = y + (compact ? 18 : 24.9);
      const mat = row.mat;
      if (mat?.image) els.push(withNat(img(X, sy, sw, sw, mat.image, { edit: { field: `materials.${row.i}` } }), ctx));
      else els.push(rect(X, sy, sw, sw, C.placeholder));
      const tx = X + sw + 24;
      const tw = 1824 - tx;
      els.push(text(tx, sy + 3.6, tw, 35.8, (row.r.role || '材料').trim(), TS.label, { edit: { field: `materials.${row.i}.role` } }));
      els.push(richText(tx, sy + (compact ? 34 : 41.4), tw, h - (compact ? 52 : 66), [{ runs: materialRuns(mat, false) }], { edit: { field: `materials.${row.i}` } }));
      if (!mat) warnings.push(row.r.materialId ? `第 ${row.i + 1} 项材料已被删除` : `第 ${row.i + 1} 项还没选材料`);
    }
    y += h;
    els.push(rect(X, y, 524, 1, C.line));
  }
  els.push(...footer(false, floorFooter(floor)));
  return { bg: C.paper, els, warnings };
}

/** 满版 / 框图自动判断：有备注或材料多 → 框图；图不够宽（< 1.55）→ 框图；其余满版 */
export function autoLayout(view, nat) {
  const nMat = (view.materials || []).length;
  const nNotes = (view.notes || []).filter((n) => (n.text || '').trim()).length;
  if (nNotes >= 1 || nMat >= 4) return 'framed';
  const aspect = nat && nat.w && nat.h ? nat.w / nat.h : 1.5;
  return aspect >= 1.55 ? 'full' : 'framed';
}

/** 节奏调整：避免连续 3 页以上同一版式（只在「两种都合适」的页上调整） */
export function applyLayoutRhythm(views, metaFn) {
  const canFull = (v) => {
    const nat = v.image ? metaFn(v.image) : null;
    return autoLayout({ ...v, materials: (v.materials || []).slice(0, 3) }, nat) === 'full' && (v.materials || []).length <= 3;
  };
  const out = views.map((v) => ({ ...v, layout: v.layout && v.layout !== 'auto' ? v.layout : autoLayout(v, v.image ? metaFn(v.image) : null) }));
  for (let i = 2; i < out.length; i++) {
    const a = out[i - 2].layout;
    const b = out[i - 1].layout;
    const c = out[i].layout;
    if (a === b && b === c) {
      if (c === 'framed' && canFull(out[i])) out[i] = { ...out[i], layout: 'full' };
      else if (c === 'full') out[i] = { ...out[i], layout: 'framed' };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 方案封面（Material Board）—— 公司封面保持原版，这一页作为「方案」章节的封面
//   split-light：左文右图（浅底，接 Material Board 的米白背景）
//   split-dark ：左文右图（深底）
//   full       ：Material Board 满版 + 左下标题 + 右下 logo
// ---------------------------------------------------------------------------

export const COVER_LAYOUTS = [
  { id: 'split-light', label: '左文右图 · 浅色' },
  { id: 'split-dark', label: '左文右图 · 深色' },
  { id: 'full', label: '满版大图' },
];

export function coverTexts(project) {
  const info = project?.info || {};
  const title = (info.coverTitle || '').trim() || [info.client, info.location].map((s) => (s || '').trim()).filter(Boolean).join(' · ') || '方案 · 设计图';
  const subtitle = (info.coverSubtitle || '').trim() || 'THE DREAM HOUSE JOURNEY';
  return { title, subtitle };
}

export function layoutDesignCover(project, ctx) {
  const cover = project.cover || {};
  const layout = cover.layout || 'split-light';
  const { title, subtitle } = coverTexts(project);
  // 标题统一用思源宋体（Ogg 是付费字体，多数电脑没有，回退成无衬线会很难看）；纯英文标题略小一号
  const titleFont = 'serif';
  const titleSize = hasCJK(title) ? 60 : 54;
  const meta = `方案 · 设计图  ·  ${floorsLine(project.floors)}`;
  const els = [];

  if (layout === 'full') {
    els.push(withNat(img(0, 0, SLIDE_W, SLIDE_H, cover.image, { edit: { field: 'cover.image' } }), ctx));
    els.push(gradRect(0, 0, SLIDE_W, SLIDE_H, 270, [
      { pos: 0, color: C.overlay, alpha: 0.72 },
      { pos: 32, color: C.overlay, alpha: 0.3 },
      { pos: 58, color: C.overlay, alpha: 0 },
    ]));
    const tLines = Math.min(2, countLines(title, titleFont, titleSize, 0, 1300));
    const tH = tLines * lineHeightPx(titleSize, 92);
    const tY = 960 - 44 - 18 - tH;
    els.push(rect(96, tY - 34, 72, 3, C.boardGold));
    els.push(text(96, tY, 1300, tH + 10, title, { font: titleFont, size: titleSize, color: C.light }, { lineSpacing: 92, edit: { field: 'coverTitle' } }));
    els.push(text(96, tY + tH + 18, 1300, 40, subtitle.toUpperCase(), { font: 'sans', size: 20, spacing: 7.56, color: C.lightMuted }, { edit: { field: 'coverSubtitle' } }));
    els.push(img(1824 - 236, 1080 - 72 - 106.7, 236, 106.7, '/template/cover-2.png', { fit: 'stretch' }));
    return { bg: C.dark, els, warnings: [] };
  }

  const dark = layout === 'split-dark';
  const boardX = 1110;
  els.push(withNat(img(boardX, 0, SLIDE_W - boardX, SLIDE_H, cover.image, { edit: { field: 'cover.image' } }), ctx));
  const colW = boardX - 96 - 72;
  const tLines = Math.min(3, countLines(title, titleFont, titleSize, 0, colW));
  const tH = tLines * lineHeightPx(titleSize, 92);
  const blockH = 35.8 + 26 + 3 + 40 + tH + 24 + 40 + 56 + 47;
  let y = Math.max(140, (SLIDE_H - blockH) / 2 - 20);
  els.push(text(96, y, colW, 35.8, 'SECTION THREE · DESIGN', dark ? TS.eyebrowDark : TS.eyebrow));
  y += 35.8 + 26;
  els.push(rect(96, y, 72, 3, dark ? C.gold : C.boardGold));
  y += 3 + 40;
  els.push(text(96, y, colW, tH + 10, title, { font: titleFont, size: titleSize, color: dark ? C.light : C.ink }, { lineSpacing: 92, edit: { field: 'coverTitle' } }));
  y += tH + 24;
  els.push(text(96, y, colW, 40, subtitle.toUpperCase(), { font: 'sans', size: 20, spacing: 7.56, color: dark ? C.lightMuted : C.muted }, { edit: { field: 'coverSubtitle' } }));
  y += 40 + 56;
  els.push(text(96, y, colW, 47, meta, { font: 'serif', size: 22.5, spacing: 2.7, color: dark ? C.darkMuted : C.faint }));
  els.push(...footer(dark, 'SECTION 03', { ruleW: boardX - 96 - 64, rightEdge: boardX - 64 }));
  return { bg: dark ? C.dark : C.paper, els, warnings: [] };
}

// ---------------------------------------------------------------------------
// 本案服务团队（定稿第 55 页），按 info.team 动态分栏
// ---------------------------------------------------------------------------

export function layoutTeam(team) {
  const els = [];
  els.push(text(96, 96, 900, 33.9, 'PROJECT TEAM', TS.eyebrow));
  els.push(rect(96, 149.9, 56, 1, C.rule));
  els.push(text(96, 182.9, 900, 87.2, '本案服务团队', { font: 'serif', size: 48, color: C.ink }, { lineSpacing: 90.38 }));
  els.push(text(96, 298.1, 900, 61, '从方案到交付，一个团队全程陪伴。', { font: 'serif', size: 22.5, color: C.muted }, { lineSpacing: 132.59 }));
  // idx = 在 info.team 里的原始序号（edit 字段与数据下标一致）
  const members = (team || []).map((m, idx) => ({ ...m, idx })).filter((m) => (m.name || '').trim() || (m.role || '').trim()).slice(0, 6);
  const warnings = [];
  if (!members.some((m) => (m.name || '').trim())) warnings.push('服务团队还没填名字（项目信息 → 服务团队）');
  const n = Math.max(1, members.length);
  const colW = 1728 / n;
  members.forEach((m, i) => {
    const x = 96 + i * colW;
    const pad = i ? 32.9 : 0;
    const w = colW - pad - 8;
    els.push(rect(x, 520, colW, 1, C.rule));
    if (i) els.push(rect(x, 520, 1, 267.8, C.line));
    els.push(text(x + pad, 560.9, w, 33.9, (m.en || '').toUpperCase(), { font: 'sans', size: 18, spacing: 5.4, color: C.eyebrow }, { edit: { field: `team.${m.idx}.en` } }));
    const name = (m.name || '').trim() || '—';
    els.push(text(x + pad, 618.8, w, 70, name, { font: hasCJK(name) ? 'serif' : 'display', size: 45, color: C.ink }, { lineSpacing: 72, edit: { field: `team.${m.idx}.name` } }));
    els.push(text(x + pad, 704.8, w, 47, m.role || '', { font: 'serif', size: 22.5, color: C.ink }, { edit: { field: `team.${m.idx}.role` } }));
  });
  els.push(...footer(false, 'SERVICE · 04'));
  return { bg: C.paper, els, warnings };
}
