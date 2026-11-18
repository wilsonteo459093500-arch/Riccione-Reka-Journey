/* ============================================================
   二维码：名片 / 活动 / NFC 的连结 → SVG（画面）或 PNG（印出来）
   用 qrcode-generator（纯 JS、没有依赖）；纠错 M 级（印在海报、桌卡上被折到一点也扫得到）
   ============================================================ */
import qrcode from 'qrcode-generator';

/** 文字 → 方块矩阵（true = 黑） */
export function qrMatrix(text, level = 'M') {
  const qr = qrcode(0, level);
  qr.addData(String(text || ''), 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const rows = [];
  for (let r = 0; r < n; r += 1) {
    const row = [];
    for (let c = 0; c < n; c += 1) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
}

/** SVG path（每个黑格一个 1×1 方块，连续的合成一条） + 边长；外面留 4 格白边（扫码器需要） */
export function qrPath(text, margin = 4) {
  const m = qrMatrix(text);
  const n = m.length;
  let d = '';
  for (let r = 0; r < n; r += 1) {
    let c = 0;
    while (c < n) {
      if (!m[r][c]) { c += 1; continue; }
      let e = c;
      while (e < n && m[r][e]) e += 1;
      d += `M${c + margin} ${r + margin}h${e - c}v1h${c - e}z`;
      c = e;
    }
  }
  return { d, size: n + margin * 2 };
}

export function qrSvg(text, { fg = '#1C1917', bg = '#FFFFFF' } = {}) {
  const { d, size } = qrPath(text);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
}

/**
 * 印刷用 PNG：二维码 + 下面两行字（例：「Wilson · 扫码交换联络方式」）
 * 只在浏览器用（canvas）
 */
export async function qrPng(text, { title = '', sub = '', px = 1200 } = {}) {
  const m = qrMatrix(text);
  const n = m.length;
  const margin = 4;
  const cell = Math.floor(px / (n + margin * 2));
  const side = cell * (n + margin * 2);
  const textH = title || sub ? Math.round(side * 0.2) : 0;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side + textH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1C1917';
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) if (m[r][c]) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
  if (textH) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const font = '"PingFang SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif';
    if (title) { ctx.font = `600 ${Math.round(side * 0.055)}px ${font}`; ctx.fillText(title, side / 2, side + textH * 0.3, side * 0.9); }
    if (sub) { ctx.fillStyle = '#6B645A'; ctx.font = `${Math.round(side * 0.038)}px ${font}`; ctx.fillText(sub, side / 2, side + textH * (title ? 0.68 : 0.45), side * 0.9); }
  }
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
