// 构建 / 开发前：把 pdf.js 的 CMap 与标准字体复制到 public/pdfjs/（见 src/import/pdfjsAssets.js）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', 'pdfjs-dist');
const dst = path.join(root, 'public', 'pdfjs');
for (const dir of ['cmaps', 'standard_fonts']) {
  const from = path.join(src, dir);
  if (!fs.existsSync(from)) {
    console.warn(`[copy_pdfjs_assets] 找不到 ${from}，跳过`);
    continue;
  }
  fs.rmSync(path.join(dst, dir), { recursive: true, force: true });
  fs.mkdirSync(path.join(dst, dir), { recursive: true });
  fs.cpSync(from, path.join(dst, dir), { recursive: true });
}
console.log('[copy_pdfjs_assets] public/pdfjs/ 已更新');
