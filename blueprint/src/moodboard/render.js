// 画板 → 画布（导出 PNG / 设为方案封面）。几何全部来自 layout.js，与网页预览同一套计算。

import {
  titleBlockMetrics, legendEntries, legendLayout, badgeOf, exportSize, bgOf, fontOf, isLightColor, SUB_TRACKING,
} from './layout.js';
import { loadImageEl, drawWatermark } from './images.js';
import { canvasToBlob } from '../store/assets.js';

export const LEGEND_FONT = 'Outfit,"Noto Sans SC",system-ui,sans-serif';
const INK = '#241C12';

/** 画布写字前先把网页字体（含中文子集）加载好，最多等 3 秒 */
export async function ensureFonts(board, extraText = '') {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const font = fontOf(board.titleFont).css;
  const title = (board.title || '').trim() || 'Aa';
  const sub = (board.subtitle || '').trim().toUpperCase() || 'A';
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`600 48px ${font}`, title),
        document.fonts.load(`500 24px ${font}`, sub),
        document.fonts.load(`500 24px ${LEGEND_FONT}`, extraText || 'A'),
        document.fonts.load(`600 24px ${LEGEND_FONT}`, '0123456789'),
      ]),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch {
    /* 字体加载失败就用回退字体 */
  }
}

/** 封面文字块（金线 + 标题 + 副标题） */
export function drawTitleBlock(ctx, W, H, board, { defaultColor, shadow }) {
  const m = titleBlockMetrics(W, H, board, defaultColor);
  if (!m) return;
  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(26,22,20,0.35)';
    ctx.shadowBlur = W * 0.008;
  }
  ctx.fillStyle = m.gold;
  ctx.fillRect(m.ruleX, m.top, m.ruleW, m.ruleH);
  ctx.textAlign = m.align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = m.color;
  if (m.title) {
    ctx.font = `600 ${m.titleFs}px ${m.fontCss}`;
    ctx.fillText(m.title, m.x, m.titleY);
  }
  if (m.subtitle) {
    ctx.font = `500 ${m.subFs}px ${m.fontCss}`;
    ctx.globalAlpha = 0.72;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${m.subFs * SUB_TRACKING}px`;
    ctx.fillText(m.subtitle, m.x, m.subY);
  }
  ctx.restore();
}

function measurer(ctx) {
  return (text, fs) => {
    ctx.font = `500 ${fs}px ${LEGEND_FONT}`;
    return ctx.measureText(text).width;
  };
}

function drawBadge(ctx, cx, cy, r, no) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(36,28,18,0.86)';
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 ${r * 1.1}px ${LEGEND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(no), cx, cy + r * 0.05);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** 编号圆点 + 右上角图例清单卡 */
function drawLegend(ctx, W, H, items) {
  const rows = legendEntries(items);
  if (!rows.length) return;
  const byId = new Map(items.map((it) => [it.id, it]));
  for (const r of rows) {
    const b = badgeOf(byId.get(r.id), W);
    drawBadge(ctx, b.cx, b.cy, b.r, r.no);
  }
  const L = legendLayout(W, H, rows, measurer(ctx));
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(L.bx, L.by, L.boxW, L.boxH, L.radius);
  else ctx.rect(L.bx, L.by, L.boxW, L.boxH);
  ctx.fill();
  for (const r of L.rows) {
    drawBadge(ctx, r.cx, r.cy, L.cr, r.no);
    ctx.fillStyle = INK;
    ctx.font = `500 ${L.fs}px ${LEGEND_FONT}`;
    ctx.fillText(r.label, r.tx, r.ty, L.maxTextW);
  }
  ctx.restore();
}

/**
 * 手动画板 → canvas
 * @param {{ items, board, longEdge?:number, withTitle?:boolean, withLegend?:boolean }} opts
 *   设为方案封面时 withTitle / withLegend 都为 false（标题在 PPT 里是可编辑文字）
 */
export async function renderBoardCanvas({ items, board, longEdge = 2400, withTitle = true, withLegend = true }) {
  const { W, H } = exportSize(board.ratioId, longEdge);
  const bg = bgOf(board.bgId);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg.color;
  ctx.fillRect(0, 0, W, H);
  if (withTitle || withLegend) await ensureFonts(board, items.map((it) => it.label || '').join(''));

  const s = W / 100;
  for (const it of items) {
    const img = await loadImageEl(it.dataUrl).catch(() => null);
    if (!img) continue;
    const aspect = img.naturalWidth / img.naturalHeight || it.aspect || 1;
    const w = it.w * s;
    const h = w / aspect;
    ctx.save();
    ctx.translate(it.x * s + w / 2, it.y * s + h / 2);
    ctx.rotate(((it.rot || 0) * Math.PI) / 180);
    ctx.shadowColor = 'rgba(26,22,20,0.18)';
    ctx.shadowBlur = W * 0.015;
    ctx.shadowOffsetY = W * 0.006;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  if (withLegend) drawLegend(ctx, W, H, items);
  if (withTitle) drawTitleBlock(ctx, W, H, board, { defaultColor: bg.ink, shadow: false });
  return canvas;
}

/** AI 实拍图 → canvas（可选叠标题；底色跟随画板，所以默认字色用该底色的墨色） */
export async function renderFlatlayCanvas(dataUrl, board, { withTitle = true } = {}) {
  const img = await loadImageEl(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  if (withTitle) {
    await ensureFonts(board);
    const ink = bgOf(board.bgId).ink;
    const color = board.titleColor || ink;
    drawTitleBlock(ctx, canvas.width, canvas.height, board, { defaultColor: ink, shadow: isLightColor(color) });
  }
  return canvas;
}

/** 下载用：烙上 logo 水印后转 PNG Blob */
export async function finishForDownload(canvas, watermark) {
  await drawWatermark(canvas, watermark);
  return await canvasToBlob(canvas, 'image/png');
}

/**
 * 封面用：把画板补到封面位置的比例（四周补画板底色），放进 PPT 时不会被裁掉材料。
 * 比例差不多（≤ 1%）就原样返回。
 */
export function padToAspect(canvas, aspect, color) {
  const r = canvas.width / canvas.height;
  if (Math.abs(r - aspect) / aspect <= 0.01) return canvas;
  const W = r < aspect ? Math.round(canvas.height * aspect) : canvas.width;
  const H = r < aspect ? canvas.height : Math.round(canvas.width / aspect);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(canvas, Math.round((W - canvas.width) / 2), Math.round((H - canvas.height) / 2));
  return out;
}

/** 封面用：无字、无水印的 JPEG */
export const canvasToCoverBlob = (canvas) => canvasToBlob(canvas, 'image/jpeg', 0.92);
