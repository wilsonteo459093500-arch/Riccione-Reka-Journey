// 颜色守门（DESIGN.md §6「颜色的来源」）：界面颜色只用 src/shared/base.css 的变量，canvas / three.js 用 src/shared/palette.js。
// 这个测试把 src/ 里写死的颜色（#RGB / #RRGGBB / #RRGGBBAA）都找出来：只有下面「内容色」名单里的文件可以有；
// 界面文件里个别必须写死的值（例如二维码一定要纯白），连同值一起列在 VALUES 里。新加的界面代码请用 var(--…) 或 PALETTE。

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

// 整个文件都是「内容色」：VI 本身、角色、材质、日光、风景、测验插图、平面图的房间底色……不跟着界面换
const CONTENT = [
  'src/shared/base.css', // VI 变量本身
  'src/shared/palette.js', // canvas / three.js 用的 VI
  'src/shared/pangieArt.js', // 潘吉的角色色
  'src/shared/lampArt.js', // 神灯的角色色
  'src/shared/materials.js', // 材质色
  'src/shared/textures.js', // 材质贴图
  'src/shared/dreamers.js', // 16 张梦想家牌的配色
  'src/shared/colorTags.js', // 颜色标签
  'src/studio/engine/daylight.js', // 一天的光
  'src/studio/engine/furniture.js', // 家具本身的颜色（布、金属、植物）
  'src/studio/plan/model.js', // 平面图上的房间底色
  'src/quiz/paint.jsx', // 代码画的风景（没有照片时）
  'src/quiz/scenes.js', // 风景的天空 / 遮罩色
  'src/quiz/flow.js', // 直觉题的小房间配色
  'src/quiz/vignettes/', // 直觉题照片的离线渲染
  'src/studio/diag.js', // 开发用的诊断面板（?diag=1），不是给客人看的界面
];

// 界面文件里允许写死的个别值（小写）
const VALUES = {
  'src/quiz/quiz.css': ['#d8c7a8', '#ece2cf', '#2c2824', '#191613', '#f4ecdc', '#e2d6c0', '#fff'], // 宝藏图示的木色 / 纸色、打印用白底
  'src/quiz/Blueprint.jsx': ['#ffffff'], // 二维码的留白一定要纯白，扫码才稳
};

const HEX = /(?<![\w&#/-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/g;

/** 去掉注释（注释里写色号说明是允许的）；字符串、模板字符串原样保留 */
function stripComments(src, css) {
  let out = '';
  let i = 0;
  let q = null; // 当前在哪种引号里
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\') {
        out += d ?? '';
        i += 2;
        continue;
      }
      if (c === q) q = null;
      i++;
      continue;
    }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      const chunk = src.slice(i, end < 0 ? src.length : end + 2);
      out += chunk.replace(/[^\n]/g, ' ');
      i += chunk.length;
      continue;
    }
    // JS 的行注释（CSS 里 // 不是注释，例如 url(https://…)）
    if (!css && c === '/' && d === '/' && !/[:\w]/.test(src[i - 1] || '')) {
      const end = src.indexOf('\n', i);
      i = end < 0 ? src.length : end;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') q = c;
    out += c;
    i++;
  }
  return out;
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(js|jsx|css|mjs)$/.test(name)) files.push(p);
  }
  return files;
}

const isContent = (rel) => CONTENT.some((c) => (c.endsWith('/') ? rel.startsWith(c) : rel === c));

let failed = 0;
let checked = 0;
let contentFiles = 0;
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (isContent(rel)) {
    contentFiles++;
    continue;
  }
  checked++;
  const code = stripComments(readFileSync(file, 'utf8'), file.endsWith('.css'));
  const allowed = new Set(VALUES[rel] || []);
  const lines = code.split('\n');
  lines.forEach((line, k) => {
    for (const m of line.matchAll(HEX)) {
      if (allowed.has(m[0].toLowerCase())) continue;
      failed++;
      console.log(`  ✗ ${rel}:${k + 1} 写死的颜色 ${m[0]} —— 用 base.css 的 var(--…)（界面）或 palette.js 的 PALETTE（canvas / three.js）`);
    }
  });
}

if (failed) {
  console.log(`\n颜色守门：${failed} 处写死的颜色（查了 ${checked} 个界面文件）`);
  process.exit(1);
}
console.log(`✓ 颜色守门：${checked} 个界面文件都只用 VI 变量（${contentFiles} 个内容色文件不查）`);
