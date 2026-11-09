// 检查从旧报价工具复制来的文件有没有被改动（VENDOR.json 记录了复制时的 sha256）。
//   npm run check:vendor            → 列出和记录不一样的文件
//   npm run check:vendor -- --accept → 有意修改后（例如公司改价格表），把当前 sha256 记进 VENDOR.json
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
const vendor = JSON.parse(readFileSync('VENDOR.json', 'utf8'));
const accept = process.argv.includes('--accept');
let changed = 0;
for (const [file, info] of Object.entries(vendor.files)) {
  const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (sha !== info.sha256) {
    changed += 1;
    console.log(`${accept ? 'accepted' : 'CHANGED '}  ${file}`);
    if (accept) info.sha256 = sha;
  }
}
if (accept) writeFileSync('VENDOR.json', JSON.stringify(vendor, null, 2) + '\n');
console.log(changed ? `${changed} file(s) ${accept ? 'accepted' : 'differ from VENDOR.json'}` : 'all vendored files match VENDOR.json');
process.exit(changed && !accept ? 1 : 0);
