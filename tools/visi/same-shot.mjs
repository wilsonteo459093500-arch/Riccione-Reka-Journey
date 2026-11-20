#!/usr/bin/env node
// VISI 体检计划第 3 阶段（下半）：新照片放进内置图库之后，找出「同一张」的，整份方案才不会重复。
//
//   node tools/visi/same-shot.mjs            只看：列出同一张的组、要人看一眼的配对
//   node tools/visi/same-shot.mjs --write    把同一组写进 photos-sail.js 那几行的 shot
//   node tools/visi/same-shot.mjs --all      旧的内置照片之间也两两比（平常只比「至少一张是溪岸真实案例」的）
//
// 怎么算同一张（tools/visi/same_shot.py，PIL + numpy）：
//   - 连拍、同一个档存了两份：dHash 距离 ≤ 8（跟案例库精选同一个门槛）
//   - 一张是另一张的裁切 / 缩图：模板比对 NCC ≥ 0.94（跟 README 以前的 samephoto.py 同一个门槛）
//   - 差一点的（dHash 9–14、NCC 0.85–0.94）不自动算：列出来，Claude 打开两张图看过，
//     是同一张（或同一间换个角度、看起来重复）就手动在 photos-sail.js 那一行加 "shot": "<另一张的 id>"，再跑一次 --write
// 写法：同一组里有旧的内置照片 → shot = 那张在 model.js SAME_SHOT 的带头；全是新照片 → shot = 清单里最前面那张。
//   model.js 读每一行的 shot，跟 SAME_SHOT 一样当同一张（系列页专用的那几张，同一组的新照片也跟着只留给系列页）。
//   两张旧的内置照片是同一张：这支脚本不改 model.js，列出来请手动加进 SAME_SHOT。
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVisi } from './test/load.mjs';
import { readList, writeList } from './import-builtin.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
export const DHASH_SAME = 8, NCC_SAME = 0.94;

/** 叫 python 比对：photos = [{ id, file, new }] → [{ a, b, d, ncc, f }] */
export function compare(photos, all = false) {
  const r = spawnSync('python3', [path.join(HERE, 'same_shot.py')], { input: JSON.stringify({ photos, all }), encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error('same_shot.py 跑不起来：' + (r.stderr || r.error));
  return JSON.parse(r.stdout).pairs;
}

/** 配对 → 分组。
    ids：全部照片的 id（照清单顺序）；oldLead(id)：旧内置照片在 SAME_SHOT 的带头（没有就是自己）；
    links：已经写在清单里的 shot（[id, shot]），照样算同一组 —— 手动加的不会被洗掉。
    回 { shot: { 新照片 id: 带头 }, groups: [[id…]], maybe: [配对], oldOnly: [[旧 id, 旧 id]] } */
export function group(ids, pairs, { isNew, oldLead = (x) => x, links = [] } = {}) {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const join = (a, b) => { if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b)); };
  ids.forEach((id) => { if (!isNew(id)) join(id, oldLead(id)); });
  links.forEach(([a, b]) => join(a, b));
  const maybe = [], oldOnly = [];
  for (const p of pairs) {
    const same = p.d <= DHASH_SAME || p.ncc >= NCC_SAME;
    if (!same) { if (find(p.a) !== find(p.b)) maybe.push(p); continue; }
    if (!isNew(p.a) && !isNew(p.b)) { if (oldLead(p.a) !== oldLead(p.b)) oldOnly.push([p.a, p.b]); continue; }
    join(p.a, p.b);
  }
  const by = new Map();
  ids.forEach((id) => { const r = find(id); if (!by.has(r)) by.set(r, []); by.get(r).push(id); });
  const shot = {}, groups = [];
  for (const g of by.values()) {
    if (g.length < 2 || !g.some(isNew)) continue;
    const old = g.filter((id) => !isNew(id));
    const lead = old.length ? oldLead(old[0]) : g[0];
    g.forEach((id) => { if (isNew(id) && id !== lead) shot[id] = lead; });
    groups.push(g);
  }
  return { shot, groups, maybe: maybe.filter((p) => find(p.a) !== find(p.b)), oldOnly };
}

function main(argv) {
  const MB = loadVisi();
  const list = readList();
  const isNew = (id) => id.startsWith('b:s-');
  const live = MB.BUILTIN.filter((b) => !b.retired);
  const photos = live.map((b) => ({ id: b.id, file: path.join(ROOT, 'invite', b.src), new: isNew(b.id) }));
  const nNew = photos.filter((p) => p.new).length;
  console.log(`比对 ${photos.length} 张（溪岸真实案例 ${nNew} 张）…`);
  const pairs = compare(photos, argv.includes('--all'));
  const src = Object.fromEntries(live.map((b) => [b.id, b.src]));
  const res = group(photos.map((p) => p.id), pairs, {
    isNew, oldLead: (id) => MB.shotKey(id),
    links: list.filter((x) => x.shot && !x.retired).map((x) => [x.id, x.shot])
  });
  res.groups.forEach((g) => console.log('同一张：' + g.join(' = ')));
  res.oldOnly.forEach(([a, b]) => console.log(`旧照片之间：${a} = ${b} —— 请手动加进 model.js 的 SAME_SHOT`));
  res.maybe.forEach((p) => console.log(`要看一眼：${p.a}  ${p.b}  dHash ${p.d} · NCC ${p.ncc}\n    invite/${src[p.a]}\n    invite/${src[p.b]}`));
  console.log(`同一张 ${res.groups.length} 组；要看一眼 ${res.maybe.length} 对`);
  if (!argv.includes('--write')) return;
  let n = 0;
  list.forEach((x) => {
    const want = res.shot[x.id];
    if (want && x.shot !== want) { x.shot = want; n++; }
    if (!want && x.shot && !x.retired && res.groups.some((g) => g.includes(x.id))) { delete x.shot; n++; }   // 这一张现在是带头
  });
  writeList(list);
  console.log(`photos-sail.js：改了 ${n} 行的 shot`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
