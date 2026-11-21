#!/usr/bin/env node
// VISI 体检计划第 3 阶段（下半）：老板在 VISI 图库「老板审图」按「复制清单」贴给 Claude 的那段字 → 放进正式版。
//
//   node tools/visi/retire.mjs <清单.txt> [--dry-run]
//
// 清单一行一张：「b:s-0123… · 原木厨房 · 厨房」。
//   - 溪岸真实案例（b:s-…，在 photos-sail.js）：这支脚本直接在那一行加 "retired": "owner"。
//     photos-sail.js 会把它从图库拿掉、放进 MB.RETIRED_BUILTIN：自动配图不再用，旧方案照样印得出来，体检提醒换掉。
//     照片档留着、不删、不改名。
//   - 其他内置照片（data.js / photos.js 手写的那批）：列出来，照 README 手动移到 photos.js 的 MB.RETIRED_BUILTIN（gone(…, 'owner')）。
//   - 认不得的 id：整批不动，先问清楚。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVisi } from './test/load.mjs';
import { readList, writeList } from './import-builtin.mjs';

/** 那段字 → id（照出现的顺序，不重复） */
export function parseIds(text) {
  const ids = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\s*(b:[A-Za-z0-9_-]+)\s*(?:·|$)/.exec(line);
    if (m && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/** 回 { sail: 这次标的, already: 早就拿掉的, manual: 要手动移的, unknown: 认不得的 }；list 里的那几行直接改 */
export function retire(MB, list, ids) {
  const res = { sail: [], already: [], manual: [], unknown: [] };
  const live = new Set((MB.BUILTIN || []).map((b) => b.id));
  const gone = new Set((MB.RETIRED_BUILTIN || []).map((b) => b.id));
  for (const id of ids) {
    const row = list.find((x) => x.id === id);
    if (row) {
      if (row.retired) res.already.push(id); else { row.retired = 'owner'; res.sail.push(id); }
    } else if (gone.has(id)) res.already.push(id);
    else if (live.has(id)) res.manual.push(id);
    else res.unknown.push(id);
  }
  return res;
}

function main(argv) {
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) { console.error('用法：node tools/visi/retire.mjs <清单.txt> [--dry-run]'); process.exit(2); }
  const ids = parseIds(readFileSync(file, 'utf8'));
  const list = readList();
  const res = retire(loadVisi(), list, ids);
  if (res.unknown.length) { console.error('认不得的 id（整批不动）：\n  ' + res.unknown.join('\n  ')); process.exit(1); }
  console.log(`清单 ${ids.length} 张：溪岸真实案例 ${res.sail.length} 张标成「老板退回」；早就拿掉的 ${res.already.length} 张`);
  if (res.manual.length) console.log('要手动移到 photos.js 的 MB.RETIRED_BUILTIN（owner）：\n  ' + res.manual.join('\n  '));
  if (argv.includes('--dry-run') || !res.sail.length) return;
  writeList(list);
  console.log('photos-sail.js 已更新');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
