#!/usr/bin/env node
// VISI 体检计划第 3 阶段：把案例库「导出给 VISI」的 zip 放进 VISI 内置图库。
//
//   unzip visi-内置图库-….zip -d <scratch>/sail-export
//   node tools/visi/import-builtin.mjs <scratch>/sail-export [--include-unsure] [--dry-run]
//
// 做的事：
//   1. 读 visi-photos.json（kind = visi-builtin-export），每张检查：id 是 16 码、空间是 VISI 认得的、
//      档案路径就是 photos/<空间>/<id>.jpg、真的是 JPEG、里面没有 EXIF / GPS / XMP（canvas 重画过的不会有）
//   2. 照片复制到 invite/assets/img/sail/<id>.jpg（新档名：assets/img 快取一年，同名换图看不到）
//   3. 写 invite/assets/js/visi/photos-sail.js 的清单（已经有的 id 不动、不重复）
//   分类「不确定」的照片预设不放（--include-unsure 才放）。任何一张不合格就整批不放，列出原因。
//   说明文字只用「风格 + 空间」（原木厨房 / Natural wood kitchen）：AI 写的描述不印给客户。
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVisi } from './test/load.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IMG_DIR = path.join(ROOT, 'invite/assets/img/sail');
const LIST = path.join(ROOT, 'invite/assets/js/visi/photos-sail.js');
const BEGIN = '/* SAIL-PHOTOS-BEGIN */', END = '/* SAIL-PHOTOS-END */';

/** JPEG 里有没有带拍摄资料的区段（APP1 Exif / XMP、APP13 IPTC）：回找到的名字 */
export function jpegMeta(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return ['不是 JPEG'];
  const found = [];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break;
    const m = buf[i + 1];
    if (m === 0xda || m === 0xd9) break;            // 影像资料开始 / 结束
    const len = buf.readUInt16BE(i + 2);
    const head = buf.subarray(i + 4, i + 4 + 32).toString('latin1');
    if (m === 0xe1 && head.startsWith('Exif')) found.push('EXIF');
    if (m === 0xe1 && head.startsWith('http://ns.adobe.com/xap')) found.push('XMP');
    if (m === 0xed) found.push('IPTC');
    i += 2 + len;
  }
  return found;
}

/** 读现在的清单（photos-sail.js 里 BEGIN / END 中间那段 JSON） */
export function readList(file = LIST) {
  if (!existsSync(file)) return [];
  const s = readFileSync(file, 'utf8');
  const a = s.indexOf(BEGIN), b = s.indexOf(END);
  if (a < 0 || b < 0) throw new Error('photos-sail.js 找不到清单的记号');
  return JSON.parse(s.slice(a + BEGIN.length, b).trim() || '[]');
}

export function writeList(list, file = LIST) {
  const s = readFileSync(file, 'utf8');
  const a = s.indexOf(BEGIN), b = s.indexOf(END);
  const body = '[\n' + list.map((x) => '    ' + JSON.stringify(x)).join(',\n') + '\n  ]';
  writeFileSync(file, s.slice(0, a + BEGIN.length) + body + s.slice(b));
}

/** 一张 → 内置图库的那一行 */
export function entryOf(MB, p) {
  const st = (MB.CASE_STYLES || []).find((x) => x.key === p.style);
  const room = MB.ROOM[p.room];
  return {
    id: 'b:s-' + p.id, src: 'assets/img/sail/' + p.id + '.jpg', w: p.w, h: p.h,
    series: '', style: p.style || '', rooms: [p.room],
    en: st ? st.en + ' ' + room.en.toLowerCase() : room.en,
    zh: st ? st.zh + room.zh : room.zh + '实景'
  };
}

/** 检查整批：回 { ok:[{p, src}], skip:[{id, why}], bad:[{id, why}] } */
export function check(MB, dir, man, opt = {}) {
  const ok = [], skip = [], bad = [];
  if (!man || man.kind !== 'visi-builtin-export' || !Array.isArray(man.photos)) {
    bad.push({ id: '-', why: 'visi-photos.json 不是案例库「导出给 VISI」的档' });
    return { ok, skip, bad };
  }
  const have = new Set((opt.have || []).map((x) => x.id));
  const seen = new Set();
  for (const p of man.photos) {
    const id = String(p && p.id);
    if (!/^[0-9a-f]{16}$/.test(id)) { bad.push({ id, why: 'id 不对' }); continue; }
    if (seen.has(id)) { skip.push({ id, why: '同一个档里重复' }); continue; }
    seen.add(id);
    if (!MB.ROOM[p.room]) { bad.push({ id, why: 'VISI 不认得这个空间：' + p.room }); continue; }
    if (p.file !== 'photos/' + p.room + '/' + id + '.jpg') { bad.push({ id, why: '档案路径不对：' + p.file }); continue; }
    if (p.unsure && !opt.includeUnsure) { skip.push({ id, why: '分类标了「不确定」' }); continue; }
    if (have.has('b:s-' + id)) { skip.push({ id, why: '已经在内置图库' }); continue; }
    const src = path.join(dir, p.file);
    if (!existsSync(src)) { bad.push({ id, why: '找不到照片档' }); continue; }
    const meta = jpegMeta(readFileSync(src));
    if (meta.length) { bad.push({ id, why: '照片里还有 ' + meta.join(' / ') }); continue; }
    if (!(p.w > 0 && p.h > 0)) { bad.push({ id, why: '没有宽高' }); continue; }
    if (p.style && !(MB.CASE_STYLES || []).some((x) => x.key === p.style)) p.style = '';
    ok.push({ p, src });
  }
  return { ok, skip, bad };
}

function main(argv) {
  const dir = argv.find((a) => !a.startsWith('--'));
  if (!dir) { console.error('用法：node tools/visi/import-builtin.mjs <解压后的资料夹> [--include-unsure] [--dry-run]'); process.exit(2); }
  const man = JSON.parse(readFileSync(path.join(dir, 'visi-photos.json'), 'utf8'));
  const MB = loadVisi();
  const list = readList();
  const res = check(MB, dir, man, { includeUnsure: argv.includes('--include-unsure'), have: list });
  res.skip.forEach((x) => console.log('跳过', x.id, x.why));
  if (res.bad.length) {
    res.bad.forEach((x) => console.error('不合格', x.id, x.why));
    console.error(`有 ${res.bad.length} 张不合格：整批都没放进去。`);
    process.exit(1);
  }
  const add = res.ok.map(({ p }) => entryOf(MB, p));
  const count = {};
  add.forEach((e) => { count[e.rooms[0]] = (count[e.rooms[0]] || 0) + 1; });
  console.log(`放进 ${add.length} 张：` + Object.entries(count).map(([k, n]) => MB.ROOM[k].zh + ' ' + n).join('、'));
  if (argv.includes('--dry-run')) return;
  mkdirSync(IMG_DIR, { recursive: true });
  let bytes = 0;
  for (const { p, src } of res.ok) {
    const to = path.join(IMG_DIR, p.id + '.jpg');
    copyFileSync(src, to);
    bytes += statSync(to).size;
  }
  writeList(list.concat(add));
  console.log(`照片 ${(bytes / 1048576).toFixed(1)} MB → invite/assets/img/sail/；清单 → invite/assets/js/visi/photos-sail.js`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
