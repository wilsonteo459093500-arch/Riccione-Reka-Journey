// 二维码 → SVG 路径（qrcode-generator，纠错 M）
import qrcode from 'qrcode-generator';

export function qrMatrix(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const cells = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) cells.push([c, r]);
  return { n, cells };
}

export function qrPath(text) {
  const { n, cells } = qrMatrix(text);
  return { n, d: cells.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('') };
}
