// pdf.js 的 CMap 与标准字体：没嵌入中文字体的 PDF（Acrobat / 关了字体嵌入的导出）靠它们才读得出字、画得出字。
// 文件在构建前由 scripts/copy_pdfjs_assets.mjs 从 node_modules/pdfjs-dist 复制到 public/pdfjs/。
const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';

export const PDFJS_DOC_OPTIONS = {
  cMapUrl: `${BASE}pdfjs/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${BASE}pdfjs/standard_fonts/`,
};
