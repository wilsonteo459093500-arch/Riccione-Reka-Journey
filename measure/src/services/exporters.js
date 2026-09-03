import { MM_PER_FT, kindOf, BILLABLE } from '../constants.js';
import { itemMm, summarize } from './summary.js';
import { pathLength, segments, midpoint } from './geometry.js';
import { fmtMoney } from './units.js';

/**
 * 下载文件名只用 ASCII —— Chromium 遇到非 ASCII 的 download 属性会整个丢掉，
 * 存成没有扩展名的 "download"。项目名是中文时就退回日期戳。
 */
export function safeFilename(base, ext) {
  const slug = String(base || '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `ukur-${slug ? `${slug}-` : ''}${stamp}.${ext}`;
}

export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http / 老浏览器兜底
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** 发 WhatsApp / 微信用的纯文字摘要 */
export function buildSummaryText({ name, items, mmPerPx, calib, rates, showQuote }) {
  const s = summarize(items, mmPerPx, rates);
  const lines = [];
  lines.push(`📐 ${name || '户型图量尺'} · 橱柜延尺预估`);
  if (calib?.mm && mmPerPx) {
    lines.push(`比例：标定 ${Math.round(calib.mm)} mm，1 px ≈ ${mmPerPx.toFixed(2)} mm`);
  }
  lines.push('');

  for (const k of s.byKind) {
    if (!k.count) continue;
    lines.push(`【${k.label}】${(k.mm / 1000).toFixed(2)} m / ${k.ft.toFixed(2)} ft（${k.count} 段）`);
    items
      .filter((i) => !i.hidden && i.kind === k.id && i.points.length >= 2)
      .forEach((i) => {
        const mm = itemMm(i, mmPerPx) || 0;
        lines.push(`  · ${i.label}：${Math.round(mm)} mm / ${(mm / MM_PER_FT).toFixed(2)} ft`);
      });
  }

  lines.push('');
  lines.push(`合计（地柜+吊柜+高柜+台面）：${(s.totalMm / 1000).toFixed(2)} m / ${s.totalFt.toFixed(2)} ft`);

  if (showQuote && s.totalAmount > 0) {
    lines.push('');
    lines.push('预估报价（按尺）：');
    for (const k of s.byKind) {
      if (!BILLABLE.includes(k.id) || !k.count || !k.rate) continue;
      lines.push(`  · ${k.label} ${k.ft.toFixed(2)} ft × ${fmtMoney(k.rate)}/ft = ${fmtMoney(k.amount)}`);
    }
    lines.push(`  合计约 ${fmtMoney(s.totalAmount)}`);
  }

  if (s.checks.length) {
    lines.push('');
    lines.push('校验：');
    s.checks.forEach((c) =>
      lines.push(`  · ${c.label}：量得 ${Math.round(c.measured)} / 图纸 ${Math.round(c.expected)} mm，误差 ${c.errPct.toFixed(1)}%`)
    );
  }

  lines.push('');
  lines.push('※ 按户型图比例估算，实际以现场复尺为准。');
  return lines.join('\n');
}

export function buildCsv({ items, mmPerPx }) {
  const head = ['序号', '名称', '分类', '段数', '长度(mm)', '长度(m)', '长度(ft)', '计入汇总'];
  const rows = items.map((i, idx) => {
    const mm = itemMm(i, mmPerPx) || 0;
    return [
      idx + 1,
      `"${(i.label || '').replace(/"/g, '""')}"`,
      kindOf(i.kind).label,
      Math.max(0, i.points.length - 1),
      Math.round(mm),
      (mm / 1000).toFixed(3),
      (mm / MM_PER_FT).toFixed(3),
      i.hidden ? '否' : '是',
    ].join(',');
  });
  // ﻿: Excel 打开中文不乱码
  return `﻿${head.join(',')}\n${rows.join('\n')}\n`;
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 导出「带标注的户型图」PNG —— 直接发给客户/工厂看 */
export async function exportAnnotatedPng({ plan, items, calib, mmPerPx, name, rates, showQuote }) {
  const img = await loadImg(plan.dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, plan.width, plan.height);

  const base = Math.max(canvas.width, canvas.height);
  const lw = Math.max(2, base / 500);
  const fs = Math.max(12, base / 70);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const label = (text, at, color) => {
    ctx.font = `600 ${fs}px "DM Sans", "Noto Sans SC", system-ui, sans-serif`;
    ctx.lineWidth = fs / 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeText(text, at.x, at.y);
    ctx.fillStyle = color;
    ctx.fillText(text, at.x, at.y);
  };

  const drawPath = (points, color, dash) => {
    ctx.setLineDash(dash || []);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, lw * 1.6, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  if (calib?.points?.length === 2 && calib.mm) {
    drawPath(calib.points, '#2563EB', [lw * 3, lw * 2]);
    label(`标定 ${Math.round(calib.mm)}`, midpoint(calib.points[0], calib.points[1]), '#2563EB');
  }

  for (const item of items) {
    if (item.hidden || item.points.length < 2) continue;
    const color = kindOf(item.kind).color;
    drawPath(item.points, color);
    for (const seg of segments(item.points)) {
      const mm = mmPerPx ? seg.len * mmPerPx : null;
      if (mm) label(`${Math.round(mm)}`, midpoint(seg.a, seg.b), color);
    }
    const total = mmPerPx ? pathLength(item.points) * mmPerPx : 0;
    const last = item.points[item.points.length - 1];
    if (item.points.length > 2 && total) {
      label(`${item.label} · Σ${Math.round(total)}`, { x: last.x, y: last.y - fs * 1.4 }, color);
    } else {
      label(item.label, { x: last.x, y: last.y - fs * 1.4 }, color);
    }
  }

  // 右下角汇总卡
  const s = summarize(items, mmPerPx, rates);
  const rows = [`${name || '户型图量尺'}`];
  for (const k of s.byKind) {
    if (!k.count) continue;
    rows.push(`${k.label}  ${(k.mm / 1000).toFixed(2)} m / ${k.ft.toFixed(2)} ft`);
  }
  rows.push(`合计  ${(s.totalMm / 1000).toFixed(2)} m / ${s.totalFt.toFixed(2)} ft`);
  if (showQuote && s.totalAmount > 0) rows.push(`预估  ${fmtMoney(s.totalAmount)}`);
  rows.push('按比例估算，以现场复尺为准');

  ctx.textAlign = 'left';
  ctx.font = `600 ${fs}px "DM Sans", "Noto Sans SC", system-ui, sans-serif`;
  const pad = fs * 0.9;
  const lineH = fs * 1.6;
  const boxW = Math.max(...rows.map((r) => ctx.measureText(r).width)) + pad * 2;
  const boxH = rows.length * lineH + pad * 1.4;
  const bx = canvas.width - boxW - pad;
  const by = canvas.height - boxH - pad;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = '#E8E2D7';
  ctx.lineWidth = lw;
  roundRect(ctx, bx, by, boxW, boxH, fs * 0.6);
  ctx.fill();
  ctx.stroke();
  rows.forEach((r, i) => {
    ctx.fillStyle = i === 0 ? '#2D4A3E' : i === rows.length - 1 ? '#9A8F7E' : '#1A1614';
    ctx.font = `${i === 0 ? '700' : '500'} ${i === rows.length - 1 ? fs * 0.78 : fs}px "DM Sans", "Noto Sans SC", system-ui, sans-serif`;
    ctx.fillText(r, bx + pad, by + pad * 0.9 + lineH * (i + 0.5));
  });

  return canvas.toDataURL('image/png');
}
