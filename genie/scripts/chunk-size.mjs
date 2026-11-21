// 打包以后量一量：每个页面第一次打开要下载多少（gzip，和 vite build 报的一样用 level 6）。
// 用法：npx vite build && node scripts/chunk-size.mjs [--save] [--dist <别的打包目录>]
//   --save  把这次的结果写进 scripts/chunk-baseline.json（以后跟它比）
// 3D 工作室的主程序（studio.html 的入口 js）超过 STUDIO_MAX 就退出 1。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ai = process.argv.indexOf('--dist');
const DIST = ai > 0 ? process.argv[ai + 1] : join(ROOT, 'dist');
const BASE = join(ROOT, 'scripts', 'chunk-baseline.json');
const STUDIO_MAX = 397.5; // kB gzip（HANDOFF：≈ 396；走进去的接口最多加 ~1.5）

const kb = (n) => Math.round(n / 10) / 100;
const gz = (file) => gzipSync(readFileSync(file), { level: 6 }).length;

if (!existsSync(DIST)) {
  console.error('没有 dist/ —— 先 npx vite build');
  process.exit(2);
}

const pages = readdirSync(DIST).filter((f) => f.endsWith('.html'));
const out = { at: new Date().toISOString().slice(0, 10), pages: {} };
for (const page of pages) {
  const html = readFileSync(join(DIST, page), 'utf8');
  const entry = (html.match(/<script type="module"[^>]*src="\/([^"]+)"/) || [])[1];
  const pre = [...html.matchAll(/rel="modulepreload"[^>]*href="\/([^"]+)"/g)].map((m) => m[1]);
  const css = [...html.matchAll(/rel="stylesheet"[^>]*href="\/([^"]+)"/g)].map((m) => m[1]);
  const files = [entry, ...pre, ...css].filter(Boolean);
  let total = 0;
  for (const f of files) total += gz(join(DIST, f));
  out.pages[page.replace('.html', '')] = {
    entry: entry ? kb(gz(join(DIST, entry))) : 0,
    firstLoad: kb(total),
    files: files.length,
  };
}

const assets = readdirSync(join(DIST, 'assets'));
const walk = assets.filter((f) => /^(WalkMode|walk)[-.]/i.test(f) && f.endsWith('.js'));
out.walk = walk.reduce((s, f) => s + kb(gz(join(DIST, 'assets', f))), 0);
out.walk = Math.round(out.walk * 100) / 100;

const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : null;
const diff = (a, b) => (b == null ? '' : ` (${a - b >= 0 ? '+' : ''}${(a - b).toFixed(2)})`);
console.log('page        entry kB        first-load kB (files)');
for (const [name, p] of Object.entries(out.pages)) {
  const b = base?.pages?.[name];
  console.log(`${name.padEnd(10)} ${String(p.entry).padStart(8)}${diff(p.entry, b?.entry).padEnd(10)} ${String(p.firstLoad).padStart(9)}${diff(p.firstLoad, b?.firstLoad).padEnd(10)} (${p.files}${b ? ` vs ${b.files}` : ''})`);
}
console.log(`walk chunk (lazy): ${out.walk} kB${walk.length ? ` — ${walk.join(', ')}` : ''}`);

if (process.argv.includes('--save')) {
  writeFileSync(BASE, JSON.stringify(out, null, 2) + '\n');
  console.log(`saved → ${BASE}`);
}

const studio = out.pages.studio?.entry || 0;
if (studio > STUDIO_MAX) {
  console.error(`✗ studio entry ${studio} kB > ${STUDIO_MAX} kB`);
  process.exit(1);
}
console.log(`✓ studio entry ${studio} kB ≤ ${STUDIO_MAX} kB`);
