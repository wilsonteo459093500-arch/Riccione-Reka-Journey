// Material Board 纯函数 —— 排版、标题块几何、prompt 拼装、本案材料导入差集。不碰 DOM，Node 可测。
//
// 画板坐标系：宽固定 100 单位，高 = 100 / 画幅比（boardH）；
// item = { id, dataUrl, aspect(宽/高), x, y, w, rot(度), label, materialId? }，x/y 为左上角，高 = w / aspect。

import {
  RATIOS, BGS, DEFAULT_BOARD, DEFAULT_SUBTITLE, BG_TONE, FRAME_NOTE, SPACE_NOTE, FLATLAY_PROMPT, FLATLAY_ASPECT,
  TITLE_FONTS, GOLD,
} from './constants.js';

export const ratioOf = (ratioId) => RATIOS.find((r) => r.id === ratioId) || RATIOS[0];
export const bgOf = (bgId) => BGS.find((b) => b.id === bgId) || BGS[0];
export const fontOf = (fontId) => TITLE_FONTS.find((f) => f.id === fontId) || TITLE_FONTS[0];
export const boardHeight = (ratioId) => 100 / ratioOf(ratioId).ratio;
export const flatlayAspect = (ratioId) => FLATLAY_ASPECT[ratioId] || '3:4';

/** 方案封面位置的宽高比：左文右图的右半边 810×1080，满版 16:9 */
export const coverSlotRatio = (layout) => (layout === 'full' ? 16 / 9 : 810 / 1080);

/** 画板比例与封面位置差多少（> 8% 就要补边，否则会被裁掉） */
export const coverRatioMismatch = (ratioId, layout) => {
  const slot = coverSlotRatio(layout);
  return Math.abs(ratioOf(ratioId).ratio - slot) / slot > 0.08;
};

/** 画板方向：portrait 适合「左文右图」封面，landscape 适合满版封面 */
export function orientationOf(ratioId) {
  const r = ratioOf(ratioId).ratio;
  if (Math.abs(r - 1) < 0.01) return 'square';
  return r < 1 ? 'portrait' : 'landscape';
}

/** 按长边算导出尺寸 */
export function exportSize(ratioId, longEdge) {
  const r = ratioOf(ratioId).ratio;
  return r >= 1
    ? { W: Math.round(longEdge), H: Math.round(longEdge / r) }
    : { W: Math.round(longEdge * r), H: Math.round(longEdge) };
}

/** 标题区占用：顶部 / 底部 / 无（居中标题不让位） */
const reservedSide = (titlePos) => (titlePos === 'c' ? null : (titlePos || 'bl')[0] === 't' ? 'top' : 'bottom');

/** 整齐网格排版：给标题预留一条（跟随标题位置在上或下） */
export function gridLayout(items, boardH, { titlePos = 'bl' } = {}) {
  const n = items.length;
  if (!n) return items;
  const side = reservedSide(titlePos);
  const reserve = side ? 16 : 0;
  const top0 = side === 'top' ? reserve : 0;
  const usableH = boardH - reserve;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * (100 / usableH))));
  const rows = Math.ceil(n / cols);
  const gap = 3;
  const w = (100 - gap * (cols + 1)) / cols;
  const rowH = (usableH - gap * (rows + 1)) / rows;
  return items.map((it, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const aspect = it.aspect || 1;
    const cellW = Math.min(w, rowH * aspect);
    return {
      ...it,
      w: cellW,
      x: gap + c * (w + gap) + (w - cellW) / 2,
      y: top0 + gap + r * (rowH + gap) + Math.max(0, (rowH - cellW / aspect) / 2),
      rot: 0,
    };
  });
}

/** 杂志拼贴排版：大小错落、轻微旋转（确定性，同样输入同样结果） */
export function collageLayout(items, boardH, { titlePos = 'bl' } = {}) {
  const n = items.length;
  if (!n) return items;
  const side = reservedSide(titlePos);
  const reserve = side ? 18 : 0;
  const top0 = side === 'top' ? reserve : 0;
  const usableH = boardH - reserve;
  return items.map((it, i) => {
    const aspect = it.aspect || 1;
    const big = i === 0;
    const w = big ? 38 : 18 + ((i * 13) % 14);
    const h = w / aspect;
    const cx = big ? 30 : 12 + ((i * 41) % 72);
    const cy = big ? usableH * 0.4 - h / 2 : 6 + ((i * 29) % Math.max(8, usableH - h - 8));
    return {
      ...it,
      w,
      x: Math.max(2, Math.min(96 - w, cx)),
      y: top0 + Math.max(2, Math.min(usableH - h - 2, cy)),
      rot: big ? 0 : ((i * 37) % 9) - 4,
    };
  });
}

/** 新素材的错落落点（避免一叠在同一处） */
export function nextSlot(count) {
  return { x: 6 + ((count * 17) % 55), y: 6 + ((count * 11) % 40) };
}

/** 拖动：限制在画板内（允许出血一半） */
export function clampMove(orig, dx, dy, boardH) {
  return {
    x: Math.max(-orig.w / 2, Math.min(100 - orig.w / 2, orig.x + dx)),
    y: Math.max(-2, Math.min(boardH - 4, orig.y + dy)),
  };
}

export const clampWidth = (w) => Math.max(4, Math.min(96, w));

/** 规范化到 (-180, 180] */
export function normalizeDeg(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * 旋转手柄：以 (cx,cy) 为圆心，从 (x0,y0) 拖到 (x1,y1)，返回新角度（度）。
 * 靠近 0 / ±90 / 180 时吸附（snap 度以内）。
 */
export function rotationFromDrag({ cx, cy, x0, y0, x1, y1, origRot = 0, snap = 4 }) {
  const a0 = Math.atan2(y0 - cy, x0 - cx);
  const a1 = Math.atan2(y1 - cy, x1 - cx);
  let rot = normalizeDeg(origRot + ((a1 - a0) * 180) / Math.PI);
  for (const t of [-180, -90, 0, 90, 180]) {
    if (Math.abs(rot - t) <= snap) rot = t === -180 ? 180 : t;
  }
  return Math.round(rot * 10) / 10;
}

/** 图例编号：有名称的素材按图层顺序编号 */
export function legendEntries(items) {
  let no = 0;
  return items
    .filter((it) => (it.label || '').trim())
    .map((it) => ({ id: it.id, no: ++no, label: it.label.trim() }));
}

// ---------------------------------------------------------------------------
// 项目 → 画板
// ---------------------------------------------------------------------------

/** 材料标签：「名称 编号」 */
export function materialLabel(m) {
  return [m?.name, m?.code].map((s) => (s || '').trim()).filter(Boolean).join(' ');
}

/** 还没上画板、且有图的本案材料（按 materialId 去重，旧画板没 materialId 时按标签去重） */
export function materialsToImport(materials, items) {
  const ids = new Set(items.map((it) => it.materialId).filter(Boolean));
  const labels = new Set(items.map((it) => (it.label || '').trim()).filter(Boolean));
  const seen = new Set();
  return (materials || []).filter((m) => {
    if (!m?.image || ids.has(m.id) || seen.has(m.id)) return false;
    const label = materialLabel(m);
    if (label && labels.has(label)) return false;
    seen.add(m.id);
    return true;
  });
}

/**
 * 把新导入的素材并进画板：再去一次重（异步期间画板可能变了），
 * 原画板为空时整体排成网格，否则错落追加。
 */
export function mergeImported(prev, incoming, boardH, { titlePos = 'bl' } = {}) {
  const ids = new Set(prev.map((it) => it.materialId).filter(Boolean));
  const fresh = incoming.filter((it) => !it.materialId || !ids.has(it.materialId));
  if (!fresh.length) return prev;
  if (!prev.length) return gridLayout(fresh, boardH, { titlePos });
  return [
    ...prev,
    ...fresh.map((it, i) => ({ ...it, ...nextSlot(prev.length + i), w: it.w || 18, rot: 0 })),
  ];
}

/** 画板默认标题：封面大标题 || 客户 · 地点；副标题 || THE DREAM HOUSE JOURNEY */
export function defaultTitles(info) {
  info = info || {};
  const title =
    (info.coverTitle || '').trim() ||
    [info.client, info.location].map((s) => (s || '').trim()).filter(Boolean).join(' · ');
  const subtitle = (info.coverSubtitle || '').trim() || DEFAULT_SUBTITLE;
  return { title, subtitle };
}

/** 新画板的设置（继承当前画幅 / 底色，标题取项目信息） */
export function newBoardSettings(info, inherit = {}) {
  return {
    ...DEFAULT_BOARD,
    ...(inherit.ratioId ? { ratioId: inherit.ratioId } : {}),
    ...(inherit.bgId ? { bgId: inherit.bgId } : {}),
    ...(info === null ? {} : defaultTitles(info)), // null = 独立画板：标题留空（与旧版 UKIR STUDIO 一致）
  };
}

// ---------------------------------------------------------------------------
// AI 实拍排版 prompt
// ---------------------------------------------------------------------------

/**
 * @param {{ bgId?, ratioId?, titlePos?, labels?: string[], notes?: string, story?: string }} opts
 *   labels[i] 对应第 i 张输入图（空字符串 = 无名称）
 */
export function buildFlatlayPrompt({ bgId = 'paper', ratioId = 'p34', titlePos = 'bl', labels = [], notes = '', story = '' } = {}) {
  const lines = [FLATLAY_PROMPT.replace('{SPACE}', SPACE_NOTE[titlePos] || SPACE_NOTE.bl)];
  lines.push(`Backdrop: ${BG_TONE[bgId] || BG_TONE.paper}, filling the entire frame.`);
  lines.push(`Frame: ${FRAME_NOTE[ratioId] || FRAME_NOTE.p34}.`);
  const named = labels.map((l, i) => ((l || '').trim() ? `Sample ${i + 1}: ${l.trim()}` : null)).filter(Boolean);
  if (named.length) {
    lines.push(
      `Sample identities (reference images in the given order; for your understanding only — never write them in the image): ${named.join('; ')}.`
    );
  }
  const s = (story || '').trim();
  if (s) {
    lines.push(
      `Client story — add lifestyle props that tell it, styled naturally and scaled realistically, always secondary to the material samples and never hiding more than a small corner of any sample: ${s}. ` +
        'One understated classic prop (a dried olive branch or a small handmade ceramic bowl) may balance the composition.'
    );
  } else {
    lines.push('Styling props: at most one or two understated props (a dried olive branch, a small handmade ceramic bowl) if space allows.');
  }
  const n = (notes || '').trim();
  if (n) lines.push(`Designer styling preferences — FOLLOW THESE STRICTLY for how each sample is cut, shaped and arranged: ${n}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 标题块几何（画布导出与网页预览共用，保证所见即所得）
// ---------------------------------------------------------------------------

/**
 * @returns {null | { align:'left'|'center'|'right', x, top, ruleX, ruleW, ruleH, titleFs, subFs, titleY, subY, color, fontCss, blockH }}
 *   titleY / subY 为文字基线（alphabetic）；null = 没有标题文字
 */
export function titleBlockMetrics(W, H, board, defaultColor) {
  const title = (board.title || '').trim();
  const subtitle = (board.subtitle || '').trim();
  if (!title && !subtitle) return null;
  const scale = board.titleScale || 1;
  const pos = board.titlePos || 'bl';
  const m = W * 0.045;
  const titleFs = W * 0.032 * scale;
  const subFs = W * 0.014 * scale;
  const ruleH = Math.max(3, W * 0.0022);
  const gapA = W * 0.02 * scale;
  const gapB = W * 0.016 * scale;
  const blockH = ruleH + gapA + (title ? titleFs : 0) + (subtitle ? (title ? gapB : 0) + subFs : 0);
  const top = pos[0] === 't' ? m : pos === 'c' ? (H - blockH) / 2 : H - m - blockH;
  const center = pos === 'c';
  const right = pos[1] === 'r';
  const align = center ? 'center' : right ? 'right' : 'left';
  const x = center ? W / 2 : right ? W - m : m;
  const ruleW = W * 0.05;
  const ruleX = center ? W / 2 - ruleW / 2 : right ? W - m - ruleW : m;
  let y = top + ruleH + gapA;
  let titleY = null;
  let subY = null;
  if (title) {
    titleY = y + titleFs * 0.82;
    y += titleFs;
  }
  if (subtitle) {
    subY = y + (title ? gapB : 0) + subFs * 0.82;
  }
  return {
    align, x, top, blockH, ruleX, ruleW, ruleH, titleFs, subFs, titleY, subY,
    title, subtitle: subtitle.toUpperCase(),
    color: board.titleColor || defaultColor,
    fontCss: fontOf(board.titleFont).css,
    gold: GOLD,
  };
}

/** 文件名里去掉不安全字符 */
export function safeFileName(s, fallback = 'riccione') {
  const out = String(s || '')
    .replace(/[\\/:*?"<>|\s·•・｜]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return out || fallback;
}

/** 副标题字距（相对字号） */
export const SUB_TRACKING = 0.16;

/**
 * 图例清单卡（右上角）与素材编号圆点的几何。measure(text, fontPx) → 文字宽度（画布 / SVG 共用）。
 * 行数多时自动缩小字号，保证整卡不超过画板高度的 90%。
 */
export function legendLayout(W, H, rows, measure) {
  if (!rows.length) return null;
  const n = rows.length;
  const fs = Math.min(W * 0.014, (H * 0.9) / (3.64 + (n - 1) * 1.7));
  const lh = fs * 1.7;
  const pad = fs * 1.2;
  const cr = fs * 0.62;
  const gap = fs * 0.5;
  const textW = Math.max(...rows.map((r) => measure(r.label, fs)));
  const boxW = Math.min(W * 0.34, textW + pad * 2 + cr * 2 + gap);
  const boxH = pad * 2 + (n - 1) * lh + cr * 2;
  const bx = W - boxW - W * 0.025;
  const by = W * 0.025;
  const maxTextW = boxW - pad * 2 - cr * 2 - gap;
  return {
    fs, cr, bx, by, boxW, boxH, radius: fs, maxTextW,
    rows: rows.map((r, i) => {
      const cy = by + pad + cr + i * lh;
      return { ...r, cx: bx + pad + cr, cy, tx: bx + pad + cr * 2 + gap, ty: cy + fs * 0.35 };
    }),
  };
}

/** 素材左上角的编号圆点（不随素材旋转） */
export function badgeOf(item, W) {
  const s = W / 100;
  const r = W * 0.011;
  return { r, cx: (item.x + 1.2) * s + r, cy: item.y * s + r + W * 0.004 };
}

/** #RRGGBB 是否浅色（决定标题阴影 / 叠字颜色） */
export function isLightColor(hex) {
  const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
  if (!m) return true;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
}
