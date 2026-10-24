// 中英双语检查：src 里每一句界面中文，英文词典里都要有。
// 跑法：node test/i18n.test.mjs（npm test 会一起跑）
//
// 规则（和 src/shared/i18n.js 的 t() 一致）：
//   · key = 中文原文去掉前后的表情 / 箭头 / 点号 / 空格，中间的空白合成一个空格；
//   · 有插值的句子写成占位符：t('约 {0} 双', [n]) —— 不要把模板字符串 `约 ${n} 双` 直接丢进 t()；
//   · 英文里的 {0} {1} 要和中文 key 一一对应。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from '@babel/parser';
import traverseMod from '@babel/traverse';
import EN from '../src/shared/i18n/en.js';
import EXP from '../src/shared/i18n/en-export.js';

const traverse = traverseMod.default || traverseMod;
// 导出给设计师（src/studio/export/**）的词在 en-export.js：跟着导出代码懒加载（ExportSheet 用 addWords 并进来），
// 所以只有那个文件夹里的代码可以查它；别的地方的中文还是要在 en.js 的总表里。
const EXPORT_DIR = `${path.sep}src${path.sep}studio${path.sep}export${path.sep}`;
const lookup = (file, key) => EN[key] ?? (file.includes(EXPORT_DIR) ? EXP[key] : undefined);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HAN = /[一-鿿]/;
const EDGE_CH = '[\\s\\p{So}\\p{Extended_Pictographic}\\uFE0F\\u200D→←↑↓·•…≈+]';
const EDGE = new RegExp(`^${EDGE_CH}+|${EDGE_CH}+$`, 'gu');
const norm = (s) => s.replace(/\s+/g, ' ').replace(EDGE, '').trim();

function walk(dir, acc = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(jsx?|mjs)$/.test(f) && !p.includes(`${path.sep}i18n`)) acc.push(p);
  }
  return acc;
}

const missing = new Map();
const badTpl = [];
let checked = 0;

for (const file of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file);
  const code = fs.readFileSync(file, 'utf8');
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const need = (raw, node) => {
    const key = norm(raw);
    if (!HAN.test(key) || /gl_FragColor|uniform |#include/.test(raw)) return;
    checked++;
    if (lookup(file, key) == null && !missing.has(key)) missing.set(key, `${rel}:${node.loc.start.line}`);
  };
  traverse(ast, {
    StringLiteral(p) {
      if (p.parent.type === 'ImportDeclaration') return;
      if (HAN.test(p.node.value)) need(p.node.value, p.node);
    },
    TemplateLiteral(p) {
      const q = p.node.quasis.map((x) => x.value.cooked);
      if (!q.some((s) => HAN.test(s))) return;
      const callee = p.parent.type === 'CallExpression' && p.parent.arguments[0] === p.node ? p.parent.callee : null;
      if (callee && ['t', 'tj'].includes(callee.name) && p.node.expressions.length) {
        badTpl.push(`${rel}:${p.node.loc.start.line}  t(\`…\${}…\`) —— 改成 t('…{0}…', [值])`);
      }
      let s = '';
      q.forEach((part, i) => {
        s += part;
        if (i < p.node.expressions.length) s += `{${i}}`;
      });
      need(s, p.node);
    },
    JSXText(p) {
      if (HAN.test(p.node.value)) need(p.node.value, p.node);
    },
  });
}

// html 标题 / 描述
for (const f of fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of s.matchAll(/<title>([^<]+)<\/title>|content="([^"]+)"/g)) {
    const v = m[1] || m[2];
    if (HAN.test(v)) {
      checked++;
      const k = norm(v);
      if (EN[k] == null && !missing.has(k)) missing.set(k, f);
    }
  }
}

const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
const phBad = [...Object.entries(EN), ...Object.entries(EXP)].filter(([k, v]) => v !== '' && ph(k) !== ph(v));
// en-export.js 不能进总表（不然又回到四个页面的第一块里）；和总表重复的词要一样（并进来以后不会把界面上的英文换掉）
const enIndex = fs.readFileSync(path.join(ROOT, 'src/shared/i18n/en.js'), 'utf8');
const expLeak = /en-export/.test(enIndex) ? ['src/shared/i18n/en.js imports en-export.js'] : [];
const expClash = Object.entries(EXP).filter(([k, v]) => EN[k] != null && EN[k] !== v).map(([k, v]) => `${k}: en.js「${EN[k]}」≠ en-export.js「${v}」`);

let fail = 0;
if (missing.size) {
  fail++;
  console.log(`✗ ${missing.size} 句中文还没有英文（加到 src/shared/i18n/ 里对应的词典）：`);
  for (const [k, where] of missing) console.log(`    ${where}  ${k}`);
}
if (badTpl.length) {
  fail++;
  console.log('✗ t() 里用了模板字符串：');
  badTpl.forEach((x) => console.log('    ' + x));
}
if (phBad.length) {
  fail++;
  console.log('✗ 占位符对不上：');
  phBad.forEach(([k, v]) => console.log(`    ${k}  →  ${v}`));
}
if (expLeak.length || expClash.length) {
  fail++;
  console.log('✗ en-export.js：');
  [...expLeak, ...expClash].forEach((x) => console.log('    ' + x));
}
if (fail) process.exit(1);
console.log(`✓ 中英双语：${checked} 处中文都有英文（词典 ${Object.keys(EN).length} 句 + 导出 ${Object.keys(EXP).length} 句）`);
