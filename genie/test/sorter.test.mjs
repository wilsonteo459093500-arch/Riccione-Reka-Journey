// 案例整理（src/cases/sorter/*.js）的纯逻辑：读文件夹名、分组、指纹 / 去重、清晰度 / 曝光 / 截图判断、主色、自动挑选、
// 生成案例、拆案例包、AI 预填（假的 Gemini）。照片都是这里用代码画出来的（不用任何真实照片）。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { setData, getData } = await import('../src/cases/sorter/data.js');
setData(JSON.parse(fs.readFileSync(ROOT + 'src/cases/sorter/data.json', 'utf8')));
const P = await import('../src/cases/sorter/parse.js');
const G = await import('../src/cases/sorter/group.js');
const X = await import('../src/cases/sorter/exif.js');
const M = await import('../src/cases/sorter/imgmath.js');
const K = await import('../src/cases/sorter/color.js');
const D = await import('../src/cases/sorter/dupes.js');
const PK = await import('../src/cases/sorter/pick.js');
const B = await import('../src/cases/sorter/build.js');
const PA = await import('../src/cases/sorter/pack.js');
const AI = await import('../src/cases/sorter/ai.js');
const C = await import('../src/shared/cases.js');
const { MAT_BY_ID, fits } = await import('../src/shared/materials.js');
const { DREAMER_BY_CODE } = await import('../src/shared/dreamers.js');

let failed = 0;
let passed = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${msg}${extra ? ' — ' + extra : ''}`);
  }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ───────────────────────── 资料表 ─────────────────────────
{
  const d = getData();
  for (const s of d.styles) {
    for (const [slot, ids] of Object.entries(s.mats)) for (const id of ids) ok(MAT_BY_ID[id] && fits(id, slot), `风格 ${s.id} 的 ${slot} 材质 ${id} 存在且适合`);
    ok(s.dreamers.every((c) => DREAMER_BY_CODE[c]), `风格 ${s.id} 的牌都存在`);
    ok(s.en && s.zh, `风格 ${s.id} 有中英文名`);
  }
  ok(d.styles[0].id === '原木' && d.styles[1].id === '侘寂', '风格顺序：原木、侘寂在最前面（老板最强的两个）');
  for (const ids of Object.values(d.supplyByRoom)) for (const id of ids) ok(!!C.SUPPLY_BY_ID[id], `supplyByRoom 的 ${id} 是 SUPPLY 的 id`);
  ok(new Set(d.boards.map((b) => b.name)).size === d.boards.length, '板材名字不重复');
  ok(d.boards.some((b) => b.name === '罗维尔' && b.code === 'AK153A') && d.boards.some((b) => b.name === '野径' && b.code === 'AG237A'), '板材：罗维尔 = AK153A、野径 = AG237A（LEAD NOTE 7）');
}

// ───────────────────────── 读文件夹名 ─────────────────────────
{
  const cases = {
    '上海-甲乙-极简原木风-罗维尔素岩03野径': { styles: ['原木'], names: ['甲乙'], boards: ['罗维尔', '素岩', '野径'] },
    '上海-丙丁-侘寂+中古风': { styles: ['侘寂', '中古'], names: ['丙丁'] },
    '上海-测试戊-简约现代+侘寂风': { styles: ['极简', '侘寂'], names: ['测试戊'] },
    '上海-乐乐-自然中古': { styles: ['中古'], names: ['乐乐'] },
    '上海-己庚-南洋风-法式风': { styles: ['南洋', '法式'], names: ['己庚'] },
    '北京-测试辛-混搭风': { styles: ['混搭'], names: ['测试辛'] },
    '北京-测试壬-极简风': { styles: ['极简'], names: ['测试壬'] },
    '北京-美式复古': { styles: ['美式复古'], names: [] },
    '南京-测试癸-原木简约': { styles: ['原木'], names: ['测试癸'] },
    '南京-测试子-微侘寂': { styles: ['侘寂'], names: ['测试子'] },
    '广州-测试甲-轻法式-奶油风': { styles: ['法式', '奶油'], names: ['测试甲'] },
    '成都-测试乙-骨骼线': { styles: ['原木', '中古'], names: ['测试乙'], series: ['骨骼线'] },
    '上海-春和-极简风': { styles: ['极简'], names: ['春和'] }, // 人名碰巧是板材名：仍然当人名
    '成都-Lily-轻奢风': { styles: [], names: ['Lily'], raw: ['轻奢'] },
  };
  for (const [name, exp] of Object.entries(cases)) {
    const p = P.parseProjectName(name);
    ok(eq(p.styles, exp.styles), `风格：${name}`, JSON.stringify(p.styles));
    ok(eq(p.names, exp.names), `人名被认出来（只用来遮掉）：${name}`, JSON.stringify(p.names));
    if (exp.boards) ok(eq(p.boards.map((b) => b.name), exp.boards), `材料：${name}`, JSON.stringify(p.boards));
    if (exp.series) ok(eq(p.series, exp.series), `系列：${name}`);
    if (exp.raw) ok(eq(p.raw, exp.raw), `认不出来的风格词留给员工：${name}`);
    const flat = JSON.stringify({ ...p, names: [] });
    for (const n of exp.names) ok(!flat.includes(n), `人名不在其它字段里：${name}`);
  }
  const p1 = P.parseProjectName('上海-甲乙-极简原木风-罗维尔素岩03野径');
  ok(p1.boards.find((b) => b.name === '素岩')?.variant === '03', '「素岩03」= 素岩 + 变体 03');
  ok(P.parseProjectName('上海-测试丙-织').series.includes('织'), '单独的「织」= 织系列');
  ok(!P.parseProjectName('上海-测试丙-轻衫织').series.length || P.parseProjectName('上海-测试丙-轻衫织').boards[0]?.name === '轻衫织', '「轻衫织」是板材（布纹 → 织系列）');
  ok(P.redact('上海-甲乙-极简/甲乙家客厅.jpg', ['甲乙']) === '上海-··-极简/··家客厅.jpg', 'redact 把人名换成 ··');

  const c1 = P.classifyPath('案例/上海/上海-甲乙-极简原木风-罗维尔素岩03野径/效果图/客厅01.jpg');
  ok(c1.city === '上海' && c1.projectSeg === '上海-甲乙-极简原木风-罗维尔素岩03野径' && c1.view === 'render' && c1.room === 'living' && !c1.flat, '路径：城市 / 项目 / 效果图 / 客厅');
  ok(P.classifyPath('案例/2025活动/年会/1.jpg').special === 'event', '2025活动 = 活动');
  ok(P.classifyPath('案例/各地展厅/成都展厅/a.jpg').special === 'showroom', '各地展厅 = 展厅');
  const c2 = P.classifyPath('案例/最新案例集合/上海-丙丁-侘寂+中古风/b.jpg');
  ok(c2.special === 'collection' && c2.city === '上海' && !c2.flat, '最新案例集合里的项目');
  ok(P.classifyPath('案例/手机导出/IMG_1.jpg').flat, '不是项目写法的文件夹 → 按时间再分');
  ok(P.classifyPath('案例/上海/IMG_9.jpg').flat && P.classifyPath('案例/上海/IMG_9.jpg').city === '上海', '照片直接放在城市文件夹里 → 平的');
  ok(P.classifyPath('上海-甲乙-极简原木风/x.jpg').projectSeg === '上海-甲乙-极简原木风', '只选了一个项目文件夹');
  ok(P.classifyPath('案例/南京/南京-测试辛-原木简约/厨房/1.jpg').room === 'kitchen', '子文件夹「厨房」= 房间提示');
  const up = P.classifyPath('Downloads/案例/上海/上海-测试甲-极简原木风/a.jpg');
  ok(up.projectSeg === '上海-测试甲-极简原木风' && up.city === '上海', '选的是顶层文件夹的上一层也认得出项目');
  const gen = P.classifyPath('Downloads/案例/上海/测试家/客厅/a.jpg');
  ok(gen.projectSeg === '测试家' && gen.city === '上海' && gen.room === 'living' && gen.flat, '不按写法命名的项目文件夹：城市后面那一段');
  ok(P.classifyPath('案例/各地展厅/成都展厅/a.jpg').projDir === '案例/各地展厅/成都展厅', '展厅子文件夹 = 一组');
  ok(P.fileKind('a.HEIC') === 'heic' && P.fileKind('a.jpg') === 'image' && P.fileKind('a.mp4') === 'other', 'fileKind');
  ok(P.fileKey({ path: 'a/b.jpg', size: 1, mtime: 2 }) === P.fileKey({ path: 'a/b.jpg', size: 1, mtime: 2 }) && P.fileKey({ path: 'a/b.jpg', size: 1, mtime: 2 }) !== P.fileKey({ path: 'a/b.jpg', size: 1, mtime: 3 }), '文件 key = 路径 + 大小 + 修改时间（稳定）');
}

// ───────────────────────── 分组 ─────────────────────────
{
  const H = 3600e3;
  const e = (path, mtime = 1.7e12, size = 1000) => ({ path, name: path.split('/').pop(), size, mtime });
  const entries = [
    ...[1, 2, 3, 4].map((i) => e(`案例/上海/上海-测试甲-极简原木风-罗维尔/IMG_${i}.jpg`)),
    ...[1, 2].map((i) => e(`案例/上海/上海-测试乙-侘寂+中古风/效果图/r${i}.jpg`)),
    ...[1, 2].map((i) => e(`案例/上海/上海-测试乙-侘寂+中古风/实景/p${i}.jpg`)),
    e('案例/北京/北京-美式复古/a.jpg'),
    e('案例/2025活动/年会/a.jpg'),
    e('案例/各地展厅/成都展厅/a.jpg'),
    e('案例/最新案例集合/上海-测试甲-极简原木风-罗维尔/IMG_1.jpg'),
    e('案例/上海/上海-测试甲-极简原木风-罗维尔/x.HEIC'),
    e('案例/上海/上海-测试甲-极简原木风-罗维尔/walkthrough.mp4'),
    e('案例/上海/.DS_Store'),
    // 平的文件夹：三次拍摄（隔了几天）+ 一张零散截图
    ...[0, 1, 2].flatMap((day) => [1, 2, 3].map((i) => e(`案例/手机导出/IMG_${day * 100 + i}.jpg`, 1.7e12 + day * 48 * H + i * 60e3))),
    e('案例/手机导出/Screenshot_9.png', 1.7e12 + 2 * 48 * H + 10 * 60e3),
  ];
  const r = G.buildGroups(entries);
  ok(r.stats.images === entries.length - 2, '照片数（mp4、.DS_Store 不算）', String(r.stats.images));
  ok(r.stats.heic === 1 && r.stats.other === 1, 'HEIC 1 张（之后试着读）、其它文件 1 个（跳过）');
  ok(r.skipped.length === 1 && r.skipped[0].reason === 'other', '跳过列表');
  const byDir = Object.fromEntries(r.groups.filter((g) => !g.collection).map((g) => [g.folder, g]));
  ok(byDir['上海-测试乙-侘寂+中古风'].keys.length === 4, '项目里的子文件夹（效果图 / 实景）属于同一个项目');
  ok(byDir['年会'].kind === 'event' && byDir['成都展厅'].kind === 'showroom', '活动 / 展厅是另外的类');
  ok(r.groups.filter((g) => g.collection).length === 1, '最新案例集合里的项目标记 collection');
  ok(r.names.includes('测试甲') && r.names.includes('测试乙'), '收集到的人名（只用来遮）');
  for (const g of r.groups) {
    const l = G.groupLabel(g, { names: r.names });
    ok(!r.names.some((n) => l.zh.includes(n) || l.en.includes(n)), `项目名不含人名：${l.zh}`);
  }
  ok(G.groupLabel(byDir['上海-测试甲-极简原木风-罗维尔'], { names: r.names }).zh.startsWith('上海 · 原木'), '项目名 = 城市 · 风格 · 编号');
  const again = G.buildGroups(entries);
  ok(eq(again.groups.map((g) => g.id), r.groups.map((g) => g.id)), '同一个文件夹再打开一次，分组 id 一样');
  const split = G.splitFlat(r.groups, r.files);
  const flat = split.filter((g) => g.from);
  ok(flat.length === 3, '平的文件夹按拍摄时间分成 3 次', String(flat.length));
  ok(flat.reduce((s, g) => s + g.keys.length, 0) === 10, '零散的截图并进了最近的一组');
  ok(eq(G.splitFlat(again.groups, again.files).map((g) => g.id), split.map((g) => g.id)), '拆出来的 id 也稳定');
  // 序号换前缀 + 时间断开半小时以上 → 也分开
  const seq = G.timeSplit([
    { key: 'a', name: 'IMG_0001.jpg', t: 0 },
    { key: 'b', name: 'IMG_0002.jpg', t: 60e3 },
    { key: 'c', name: 'DSC_5001.jpg', t: 45 * 60e3 },
    { key: 'd', name: 'DSC_5002.jpg', t: 46 * 60e3 },
  ]);
  ok(seq.length === 2, '文件名序号换了 + 隔了 45 分钟 → 两组');
  const [h, t2] = G.splitGroup({ id: 'g1', keys: ['a', 'b', 'c'] }, 'b');
  ok(eq(h.keys, ['a']) && eq(t2.keys, ['b', 'c']) && t2.id !== h.id, '拆开');
  const m = G.mergeGroups({ id: 'x', keys: ['a'], styles: ['原木'] }, { id: 'y', keys: ['b', 'a'], styles: ['侘寂'] });
  ok(eq(m.keys, ['a', 'b']) && eq(m.styles, ['原木', '侘寂']), '合并');
  ok(G.safeFolderName('张三家', []) === '' && G.safeFolderName('手机导出 2024', []) === '手机导出 2024' && G.safeFolderName('客厅', []) === '客厅', '像人名的文件夹名不显示');
}

// ───────────────────────── EXIF ─────────────────────────
{
  // 手工拼一个最小的 JPEG：SOI + APP1(EXIF：Orientation 6、Make、DateTimeOriginal) + SOF0(4000×3000)
  const le = true;
  const tiff = [];
  const u16 = (v) => [v & 255, (v >> 8) & 255];
  const u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  const make = 'Canon\0';
  const dto = '2024:05:17 14:32:08\0';
  // IFD0 @8: 3 entries (Orientation, Make, ExifIFD) ; data after
  const ifd0 = 8;
  const n0 = 3;
  const ifd0End = ifd0 + 2 + n0 * 12 + 4;
  const makeOff = ifd0End;
  const exifOff = makeOff + make.length;
  const dtoOff = exifOff + 2 + 12 + 4;
  tiff.push(...[0x49, 0x49], ...u16(42), ...u32(ifd0));
  tiff.push(...u16(n0));
  tiff.push(...u16(0x0112), ...u16(3), ...u32(1), ...u16(6), 0, 0);
  tiff.push(...u16(0x010f), ...u16(2), ...u32(make.length), ...u32(makeOff));
  tiff.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifOff));
  tiff.push(...u32(0));
  tiff.push(...[...make].map((c) => c.charCodeAt(0)));
  tiff.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(dto.length), ...u32(dtoOff), ...u32(0));
  tiff.push(...[...dto].map((c) => c.charCodeAt(0)));
  const app1 = [...[...'Exif'].map((c) => c.charCodeAt(0)), 0, 0, ...tiff];
  const bytes = [0xff, 0xd8, 0xff, 0xe1, ((app1.length + 2) >> 8) & 255, (app1.length + 2) & 255, ...app1, 0xff, 0xc0, 0, 17, 8, (3000 >> 8) & 255, 3000 & 255, (4000 >> 8) & 255, 4000 & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9];
  const meta = X.readMeta(Uint8Array.from(bytes).buffer);
  ok(meta.type === 'jpeg' && meta.make === 'Canon' && meta.orientation === 6, 'EXIF：类型、相机、方向', JSON.stringify(meta));
  ok(meta.w === 3000 && meta.h === 4000, '方向 6 = 竖着拍 → 宽高对调（3000×4000）');
  ok(meta.dto === Date.UTC(2024, 4, 17, 14, 32, 8), '拍摄时间');
  void le;
  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(png.buffer).setUint32(16, 1170);
  new DataView(png.buffer).setUint32(20, 2532);
  const pm = X.readMeta(png.buffer);
  ok(pm.type === 'png' && pm.w === 1170 && pm.h === 2532, 'PNG 尺寸');
  const heic = new Uint8Array(32);
  heic.set([0, 0, 0, 24, ...[...'ftypheic'].map((c) => c.charCodeAt(0))]);
  ok(X.readMeta(heic.buffer).type === 'heic', '认出 HEIC');
}

// ───────────────────────── 代码画的「照片」 ─────────────────────────
function rnd(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296);
}
/** 一个「房间」：墙 / 地 / 柜子三块颜色 + 几条线 + 噪点。shift = 镜头平移的像素，light = 亮度倍数 */
function room({ w = 512, h = 384, wall = [236, 228, 214], floor = [120, 82, 55], cab = [200, 170, 120], seed = 1, shift = 0, light = 1, horizon = 0.62, cabX = 0.55 } = {}) {
  const r = rnd(seed);
  const d = new Uint8ClampedArray(w * h * 4);
  const lines = Array.from({ length: 14 }, () => ({ x: Math.floor(r() * w), y0: Math.floor(r() * h * 0.6), len: 20 + Math.floor(r() * 120) }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const X0 = x + shift;
      let c = y > h * horizon ? floor : X0 > w * cabX && y > h * 0.25 ? cab : wall;
      if (y > h * horizon && (X0 >> 5) % 2 === 0) c = c.map((v) => v * 0.9); // 地板缝
      let v = c.map((q) => q * light + (r() - 0.5) * 10);
      for (const L of lines) if (Math.abs(X0 - L.x) < 2 && y > L.y0 && y < L.y0 + L.len) v = v.map((q) => q * 0.35);
      const j = (y * w + x) * 4;
      d[j] = v[0];
      d[j + 1] = v[1];
      d[j + 2] = v[2];
      d[j + 3] = 255;
    }
  }
  return { data: d, width: w, height: h };
}
function blur(img, rad = 4) {
  const { width: w, height: h, data } = img;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = [0, 0, 0];
      let n = 0;
      for (let dy = -rad; dy <= rad; dy++)
        for (let dx = -rad; dx <= rad; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          const j = (yy * w + xx) * 4;
          s[0] += data[j];
          s[1] += data[j + 1];
          s[2] += data[j + 2];
          n++;
        }
      const j = (y * w + x) * 4;
      out[j] = s[0] / n;
      out[j + 1] = s[1] / n;
      out[j + 2] = s[2] / n;
      out[j + 3] = 255;
    }
  return { ...img, data: out };
}
function screenshot() {
  const w = 236;
  const h = 512;
  const img = room({ w, h, seed: 9 });
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (y < 22 || y > h - 36) {
        const j = (y * w + x) * 4;
        d[j] = d[j + 1] = d[j + 2] = 250;
        if (y < 22 && x > 10 && x < 30 && y > 8 && y < 14) d[j] = d[j + 1] = d[j + 2] = 20; // 时间
      }
    }
  return img;
}
function documentPage() {
  const w = 384;
  const h = 512;
  const d = new Uint8ClampedArray(w * h * 4).fill(252);
  for (let y = 40; y < h - 40; y += 14)
    for (let x = 30; x < w - 30 - ((y * 7) % 90); x++)
      for (let k = 0; k < 3; k++) {
        if (x % 9 === 0) continue;
        const j = ((y + k) * w + x) * 4;
        d[j] = d[j + 1] = d[j + 2] = 30;
      }
  for (let i = 3; i < d.length; i += 4) d[i] = 255;
  return { data: d, width: w, height: h };
}

{
  const a = room({ seed: 1 });
  const a2 = room({ seed: 1, shift: 3, light: 1.04 }); // 连拍：挪一点、亮一点
  const b = room({ seed: 2, wall: [90, 96, 100], floor: [200, 200, 196], cab: [40, 40, 44], horizon: 0.45, cabX: 0.2 });
  const g = (img) => M.toGray(img.data, img.width, img.height);
  const ha = M.dhash(g(a), 512, 384);
  const ha2 = M.dhash(g(a2), 512, 384);
  const hb = M.dhash(g(b), 512, 384);
  ok(ha.length === 32, '指纹 = 128 位（32 个十六进制字）');
  ok(M.hamming(ha, ha2) <= D.DUP.near, `连拍的两张指纹很接近（${M.hamming(ha, ha2)} 位）`);
  ok(M.hamming(ha, hb) > 30, `不同的房间指纹差很多（${M.hamming(ha, hb)} 位）`);
  const sa = M.lapVar(g(a), 512, 384);
  const sb = M.lapVar(g(blur(a, 3)), 512, 384);
  ok(sa > 4 * sb, `清晰度：清楚的 ${Math.round(sa)} ≫ 糊的 ${Math.round(sb)}`);
  const full = M.analysePixels(a, { w: 4000, h: 3000, make: 'Canon', type: 'jpeg' });
  ok(!full.flags.length, '正常的照片没有被藏的理由', JSON.stringify(full.flags));
  ok(full.colours.length === 3 && Math.abs(full.colours.reduce((s, c) => s + c.share, 0) - 1) < 0.01, '三个主色，占比加起来 = 1');
  ok(M.analysePixels(blur(a, 6), { w: 4000, h: 3000, make: 'Canon' }).flags.includes('blur'), '糊的照片：blur');
  const dark = room({ seed: 3, light: 0.18 });
  ok(M.analysePixels(dark, { w: 4000, h: 3000, make: 'Canon' }).flags.includes('dark'), '太暗：dark');
  ok(M.analysePixels(a, { w: 640, h: 480 }).flags.includes('small'), '太小（长边 < 800）：small');
  const shot = M.analysePixels(screenshot(), { w: 1170, h: 2532, type: 'png' });
  ok(shot.flags.includes('shot'), `手机截图：shot（${shot.signals.shot}）`);
  ok(!M.analysePixels(room({ w: 288, h: 512, seed: 4 }), { w: 1080, h: 1920, type: 'png' }).flags.includes('shot'), '竖的效果图（没有状态栏）不算截图');
  const doc = M.analysePixels(documentPage(), { w: 2480, h: 3508, type: 'jpeg' });
  ok(doc.flags.includes('doc'), `单据 / 文件：doc（${doc.signals.doc}）`);
  ok(!M.analysePixels(room({ seed: 5, wall: [246, 245, 242], floor: [235, 233, 228], cab: [250, 250, 250] }), { w: 4000, h: 3000, make: 'Canon' }).flags.includes('doc'), '白色的房间不算单据');
  ok(M.analysePixels(a, { w: 4000, h: 3000, view: 'site' }).flags.includes('site'), '文件夹叫「工地 / 施工」→ site');
  ok(full.q > M.analysePixels(blur(a, 3), { w: 4000, h: 3000 }).q, '质量分：清楚 > 糊');
}

// ───────────────────────── 主色 / 色系 ─────────────────────────
{
  const fam = (id) => K.familyOfLab(B.matLab(id));
  ok(fam('walnut') === 'darkwood' && fam('smoked-oak') === 'darkwood', '胡桃 / 烟熏橡 → darkwood（和雷区「深木色」同一个词）');
  ok(fam('light-oak') === 'wood' && fam('teak') === 'wood', '浅橡 / 柚木 → wood');
  ok(['beige', 'white'].includes(fam('cream-lacquer')) && fam('oat') === 'beige' && fam('gallery-white') === 'white', '奶油 / 燕麦 / 画廊白');
  ok(fam('grey-tile') === 'grey' && fam('microcement') === 'grey' && fam('black-matte') === 'black', '灰砖 / 微水泥 / 黑');
  ok(fam('sage') === 'green' && fam('dusty-blue') === 'blue' && fam('terracotta') === 'red', '鼠尾草绿 / 雾霾蓝 / 陶土红');
  // 三色图 → k-means 找回三个颜色
  const px = [];
  const cols = [K.rgbToLab(105, 67, 48), K.rgbToLab(234, 224, 206), K.rgbToLab(157, 153, 146)];
  [0.5, 0.3, 0.2].forEach((share, i) => {
    for (let n = 0; n < share * 1000; n++) px.push(...cols[i].map((v) => v + ((n * 7) % 5) - 2));
  });
  const km = K.kmeansLab(Float32Array.from(px), 3);
  ok(km.length === 3 && Math.abs(km[0].share - 0.5) < 0.03 && K.deltaE(km[0].lab, cols[0]) < 4, 'k-means 找回主色和占比', JSON.stringify(km));
  const pal = K.paletteOf([{ colours: km }, { colours: km, weight: 0.5 }]);
  ok(pal.families.darkwood > 0.4 && pal.swatches.length >= 3, '一组照片的色系：胡桃色为主');
  const back = K.labToRgb(...K.rgbToLab(120, 80, 50));
  ok(Math.abs(back[0] - 120) <= 1 && Math.abs(back[1] - 80) <= 1 && Math.abs(back[2] - 50) <= 1, 'Lab ↔ RGB 来回一致');
  ok(K.cssOfLab([50, 0, 0]).startsWith('rgb('), '色点用 rgb()，不写死颜色');
}

// ───────────────────────── 去重 ─────────────────────────
{
  const g = (img) => M.toGray(img.data, img.width, img.height);
  const h = (seed, o = {}) => M.dhash(g(room({ seed, ...o })), 512, 384);
  const items = [
    { key: 'a1', hash: h(1), t: 0 },
    { key: 'a2', hash: h(1, { shift: 2 }), t: 1000 },
    { key: 'a3', hash: h(1, { light: 1.06 }), t: 2000 },
    { key: 'b1', hash: h(7, { horizon: 0.4, cabX: 0.3 }), t: 3000 },
    { key: 'c1', hash: h(11, { horizon: 0.75, cabX: 0.8, wall: [120, 140, 130] }), t: 99999 },
  ];
  const cl = D.clusterNear(items);
  ok(cl.length === 1 && eq([...cl[0]].sort(), ['a1', 'a2', 'a3']), '近似重复 / 连拍归成一簇', JSON.stringify(cl));
  const cross = [
    { key: 'x1', group: 'city', hash: h(1) },
    { key: 'x2', group: 'city', hash: h(7, { horizon: 0.4, cabX: 0.3 }) },
    { key: 'y1', group: 'coll', hash: h(1, { shift: 1 }) },
    { key: 'y2', group: 'coll', hash: h(7, { horizon: 0.4, cabX: 0.3, light: 1.03 }) },
    { key: 'y3', group: 'coll', hash: h(21, { horizon: 0.3, cabX: 0.1, wall: [60, 60, 60] }) },
  ];
  const pairs = D.crossPairs(cross);
  ok(pairs.length === 2, '跨文件夹找到 2 对重复', JSON.stringify(pairs));
  const gk = Object.fromEntries(cross.map((x) => [x.key, x.group]));
  const cd = D.collectionDupes(pairs, (k) => gk[k], (gid) => gid === 'coll', (gid) => (gid === 'coll' ? 3 : 2));
  ok(cd.dupGroup.get('coll')?.of === 'city' && cd.dupPhoto.size === 2, '「最新案例集合」的项目 2/3 张在城市项目里 → 整个项目算重复');
}

// ───────────────────────── 自动挑选 ─────────────────────────
{
  const mk = (key, img, meta = {}, extra = {}) => ({ key, a: M.analysePixels(img, { make: 'Canon', ...meta }), ...extra });
  const photos = [
    mk('portrait', room({ w: 384, h: 512, seed: 30 }), { w: 3000, h: 4000 }, { room: 'living' }),
    mk('wide', room({ seed: 31 }), { w: 4000, h: 3000 }, { room: 'living', t: 0 }),
    mk('wideBurst', room({ seed: 31, shift: 2 }), { w: 4000, h: 3000 }, { room: 'living', t: 1500 }),
    mk('kitchen', room({ seed: 32, horizon: 0.5, cabX: 0.1, cab: [90, 60, 40] }), { w: 4000, h: 3000 }, { room: 'kitchen' }),
    mk('bed', room({ seed: 33, horizon: 0.7, cabX: 0.75, wall: [220, 210, 200], floor: [150, 120, 90] }), { w: 4000, h: 3000 }, { room: 'master' }),
    mk('blurry', blur(room({ seed: 34, horizon: 0.55 }), 6), { w: 4000, h: 3000 }),
    mk('dark', room({ seed: 35, light: 0.15 }), { w: 4000, h: 3000 }),
    mk('shot', screenshot(), { w: 1170, h: 2532, type: 'png', make: '' }),
    { key: 'pending', a: null },
  ];
  const r = PK.autoPick(photos);
  ok(r.cover === 'wide' || r.cover === 'wideBurst', `封面是横的、清楚的那张（${r.cover}）`);
  ok(r.picked[0] === r.cover && r.picked.length <= 6, '封面在第一个，最多 6 张');
  ok(!(r.picked.includes('wide') && r.picked.includes('wideBurst')), '连拍只留一张');
  ok(r.dupOf.has('wideBurst') || r.dupOf.has('wide'), '连拍的另一张记成重复（找得回来）');
  ok(r.rejects.get('blurry')?.includes('blur') && r.rejects.get('dark')?.includes('dark') && r.rejects.get('shot')?.includes('shot'), '糊 / 暗 / 截图被藏起来（理由都在）');
  ok(!r.picked.some((k) => ['blurry', 'dark', 'shot', 'pending'].includes(k)), '被藏的和还没分析的不会被挑');
  ok(r.picked.includes('kitchen') && r.picked.includes('bed'), '不同的房间都挑进来（多样）');
  const r2 = PK.autoPick(photos, { crossDup: new Set(['kitchen']) });
  ok(!r2.picked.includes('kitchen'), '在别的项目里已经有的照片不挑');
  ok(PK.autoPick([]).cover === null, '空的项目');
}

// ───────────────────────── 生成案例 ─────────────────────────
{
  const st = B.styleOf(['原木']);
  ok(st.dreamers[0] === 'WMNH' && st.axes.temp === 80 && st.axes.texture === 80, '原木 → 主牌 WMNH（暖、朴）');
  const wabi = B.styleOf(['侘寂', '中古']);
  ok(wabi.dreamers[0] === 'WMND' && wabi.dreamers.length <= 3, '侘寂 + 中古 → 主牌 WMND');
  ok(B.styleOf(['南洋']).features.includes('rattan'), '南洋 → 藤编（照片里看得见，雷区会用）');
  const walnutCream = [{ lab: B.matLab('walnut'), share: 0.45 }, { lab: B.matLab('cream-lacquer'), share: 0.35 }, { lab: B.matLab('smoked-oak'), share: 0.2 }];
  const mats = B.suggestMaterials(['原木'], walnutCream, ['living', 'kitchen']);
  ok(mats.cabinetry === 'walnut', `胡桃 + 奶油的照片 → 柜体挑胡桃（${mats.cabinetry}）`);
  for (const [slot, id] of Object.entries(mats)) ok(fits(id, slot), `建议的材质 ${slot}=${id} 适合这个表面`);
  ok(mats.countertop, '照片里有厨房 → 也挑台面');
  ok(!B.suggestMaterials(['原木'], walnutCream, ['living']).countertop, '没有厨房 → 不挑台面');
  const title = B.titleOf({ styles: ['原木'], type: 'condo', bedrooms: 3, families: { darkwood: 0.4, beige: 0.3, wood: 0.2 } });
  ok(title.zh === '原木 · 胡桃色与米白 · 三房公寓' && title.en === 'Natural wood · walnut & cream · 3-bedroom condo', '标题：风格 · 颜色 · 房子', JSON.stringify(title));
  ok(B.titleOf({ styles: ['侘寂', '中古'], type: 'terrace' }).zh === '侘寂中古 · 排屋', '两个风格');
  ok(B.caseIdFor('案例/上海/上海-甲乙-极简') === B.caseIdFor('案例/上海/上海-甲乙-极简') && B.caseIdFor('x').startsWith('p-') && B.caseIdFor('x', 'showroom').startsWith('sr-'), '案例 id 稳定、不含路径');
  const g = { id: 'g1', dir: '案例/上海/上海-测试甲-极简原木风-罗维尔', kind: 'home', city: '上海', styles: ['原木'], raw: [], keys: ['k1', 'k2'] };
  const shots = [
    { key: 'k1', room: 'living', view: 'photo', image: { id: '01', w: 1600, h: 1200, device: true, src: '', thumb: '' } },
    { key: 'k2', room: 'kitchen', view: 'render', image: { id: '02', w: 1600, h: 1200, device: true, src: '', thumb: '' } },
  ];
  const c = B.caseFromGroup(g, { styles: ['原木'], type: 'condo', bedrooms: 3, consent: true }, shots, { families: { darkwood: 0.4, beige: 0.4 }, swatches: walnutCream });
  ok(c.kind === 'project' && c.status === 'draft' && c.consent === true, '新案例 = 我们的项目、草稿（员工再上架）');
  ok(c.images[0].cover && c.images[1].kind === 'render' && eq(c.rooms, ['living', 'kitchen']), '封面、效果图标记、房间');
  ok(c.supplies.firm.includes('kitchen') && c.supplies.firm.includes('tvWall'), '公司做的：按房间预填（厨房橱柜、电视墙）');
  const v = C.validateCase(c, { forLive: true });
  ok(v.ok, '生成的案例（有业主同意）可以直接通过上架检查', JSON.stringify(v.errors));
  ok(!C.validateCase({ ...c, consent: false }, { forLive: true }).ok, '没有业主同意 → 不能上架');
  const json = JSON.stringify(c);
  for (const bad of ['测试甲', '上海', '罗维尔', '案例/']) ok(!json.includes(bad), `案例里没有「${bad}」（人名 / 城市 / 文件夹 / 材料笔记都不进案例）`);
  const sr = B.caseFromGroup({ ...g, kind: 'showroom' }, { styles: ['原木'], type: 'other', consent: true }, shots);
  ok(sr.kind === 'showroom' && sr.status === 'hidden' && !sr.consent && sr.id.startsWith('sr-'), '展厅：kind showroom、永远藏着、不会被配对');
  ok(C.matchCases({ code: 'WMNH', axes: { temp: 80, density: 80, texture: 80, storage: 80 } }, [{ ...sr, status: 'live', consent: true }], { allowDrafts: true }).picks.length === 0, '展厅就算被改成上架、员工预览也不配');
  ok(!C.validateCase({ ...sr, status: 'live' }, { forLive: true }).ok, '展厅不能上架');
  // 房间：没标的空着（不再猜成客厅）；整个家的 3D 鸟瞰 = plan3d
  const shots2 = [
    { key: 'k1', room: null, view: 'photo', image: { id: '01', w: 1600, h: 1200, device: true, src: '', thumb: '' } },
    { key: 'k2', room: 'plan3d', view: 'render', image: { id: '02', w: 1600, h: 1200, device: true, src: '', thumb: '' } },
    { key: 'k3', room: 'kitchen', view: 'photo', image: { id: '03', w: 1600, h: 1200, device: true, src: '', thumb: '' } },
  ];
  const c2 = B.caseFromGroup(g, { styles: ['原木'], type: 'condo', bedrooms: 3, consent: true }, shots2);
  ok(eq(c2.images.map((im) => [im.room, im.kind]), [['', 'photo'], ['plan3d', 'plan3d'], ['kitchen', 'photo']]), '没标 = 空着；鸟瞰 = plan3d', JSON.stringify(c2.images.map((im) => [im.room, im.kind])));
  ok(eq(c2.rooms, ['kitchen']), '房间清单只算标了的（不含 3D 鸟瞰）', JSON.stringify(c2.rooms));
  ok(P.classifyPath('案例/上海/上海-测试甲-原木/全屋3D鸟瞰.jpg').room === 'plan3d' && P.classifyPath('案例/上海/上海-测试甲-原木/3D户型.jpg').view === 'render', '文件名「鸟瞰 / 3D户型」= 整个家（3D），是效果图不是图纸');
  ok(C.matchCases({ code: 'WMNH', axes: { temp: 80, density: 80, texture: 80, storage: 80 } }, [sr]).picks.length === 0, '展厅案例不会出现在客人的配对里');
  const live = { ...c, status: 'live' };
  const m = C.matchCases({ code: 'WMNH', axes: { temp: 80, density: 80, texture: 80, storage: 80 }, hidden: { light: 80, curve: 50, social: 50 } }, [live]);
  ok(m.picks[0]?.case.id === c.id && m.picks[0].reasons[0]?.kind === 'card', '上架以后：原木的客人（WMNH）配得到，理由「和你的牌一样」');
}

// ───────────────────────── 一个下午做得完：先做最好的、故事模板 ─────────────────────────
{
  const q = new Map([['a', 0.9], ['b', 0.8], ['c', 0.7], ['d', 0.2]]);
  const good = PK.projectScore({ picked: ['a', 'b', 'c', 'd'], q, rooms: ['living', 'kitchen', 'master', null] });
  const thin = PK.projectScore({ picked: ['d'], q, rooms: [null] });
  ok(good > thin && good <= 1 && thin >= 0, '项目分：照片好、张数多、房间多的在前', `${good} vs ${thin}`);
  ok(PK.projectScore({ picked: [] }) === 0, '没有照片 = 0 分');
  const items = [
    { id: 'w1', style: '原木', score: 0.5 },
    { id: 'w2', style: '原木', score: 0.9 },
    { id: 'w3', style: '原木', score: 0.7 },
    { id: 'z1', style: '侘寂', score: 0.4 },
    { id: 'f1', style: '法式', score: 0.99 },
    { id: 'n1', style: '', score: 0.8 },
  ];
  const order = getData().styles.map((x) => x.id);
  ok(eq(PK.bestPerStyle(items, 2, order), ['w2', 'w3', 'z1', 'f1', 'n1']), '每种风格最好的 2 个；原木、侘寂排在前，没有风格的最后', JSON.stringify(PK.bestPerStyle(items, 2, order)));
  ok(PK.bestPerStyle(items, 0, order).length === items.length, 'N = 0 → 全部');
  const st = B.storyOf({ styles: ['原木'], type: 'condo', bedrooms: 3, firm: ['kitchen', 'wardrobe', 'sofa'], materials: { cabinetry: 'walnut', countertop: 'quartz-travertine', walls: 'warm-white' } });
  ok(st.zh.startsWith('原木风格的三房公寓') && st.zh.includes('厨房橱柜、衣柜都是我们做的') && !st.zh.includes('沙发') && st.zh.includes('胡桃木柜体'), '故事：风格 · 房子 · 我们做的（不提家具）· 材质', st.zh);
  ok(/^A natural wood 3-bedroom condo — we made the kitchen cabinets and wardrobes\. Walnut cabinetry/.test(st.en) && !/[一-鿿]/.test(st.en), '英文故事', st.en);
  ok(eq(B.storyOf({ styles: [] }), { zh: '', en: '' }), '没有风格 → 先不写故事');
  ok(B.storyOf({ styles: ['南洋', '法式'], type: 'condo', firm: [] }).en === 'A Nanyang tropical & French condo.', '专有名词保持大写', B.storyOf({ styles: ['南洋', '法式'], type: 'condo', firm: [] }).en);
  const g2 = { id: 'g9', dir: '案例/上海/上海-测试庚-原木', kind: 'home', city: '上海', styles: ['原木'], raw: [], keys: ['k1'] };
  const shot = [{ key: 'k1', room: 'kitchen', view: 'photo', image: { id: '01', w: 1600, h: 1200, device: true, src: '', thumb: '' } }];
  const c9 = B.caseFromGroup(g2, { styles: ['原木'], type: 'condo', bedrooms: 2, consent: true }, shot);
  ok(c9.story.zh.startsWith('原木风格的两房公寓') && c9.story.en.startsWith('A natural wood 2-bedroom condo'), '草稿案例自带两句故事', JSON.stringify(c9.story));
  ok(!JSON.stringify(c9.story).includes('测试庚') && !JSON.stringify(c9.story).includes('上海'), '故事里没有人名 / 城市');
  const kept = B.caseFromGroup(g2, { styles: ['原木'], type: 'condo', consent: true }, shot, undefined, { prev: { id: c9.id, story: { zh: '员工写的', en: 'Staff wrote this' } } });
  ok(kept.story.zh === '员工写的', '员工改过的故事不会被盖掉');
}

// ───────────────────────── 案例包拆分 ─────────────────────────
{
  const MB = 1024 * 1024;
  const items = Array.from({ length: 30 }, (_, i) => ({ id: 'c' + i, bytes: PA.caseBytes(3000, [200e3, 180e3, 220e3, 150e3, 210e3, 190e3]) }));
  const parts = PA.splitPack(items, 20 * MB);
  ok(parts.every((p) => p.bytes <= 20 * MB), '每份 ≤ 20 MB');
  ok(eq(parts.flatMap((p) => p.ids), items.map((x) => x.id)), '每个案例刚好一次、顺序不变');
  ok(parts.length === Math.ceil(items.reduce((s, x) => s + x.bytes, 0) / (20 * MB)) || parts.length === Math.ceil(items.reduce((s, x) => s + x.bytes, 0) / (20 * MB)) + 1, `份数合理（${parts.length}）`);
  const big = PA.splitPack([{ id: 'a', bytes: 5 * MB }, { id: 'huge', bytes: 25 * MB }, { id: 'b', bytes: 1 * MB }], 20 * MB);
  ok(big.length === 3 && big[1].oversize && eq(big[1].ids, ['huge']), '单个超大的案例自己一份（标 oversize）');
  const d = new Date(2026, 9, 19);
  ok(PA.partFileName(1, 1, d) === 'WISH-cases-20261019.json' && PA.partFileName(2, 3, d) === 'WISH-cases-20261019-2of3.json', '文件名');
  ok(PA.caseBytes(100, [300]) === 100 + 2 + 400 + 64, 'base64 估算');
}

// ───────────────────────── AI 预填（假的 Gemini） ─────────────────────────
{
  const rooms = C.ROOMS.map((r) => r.id);
  const matsBy = { floor: ['light-oak', 'walnut', 'microcement'], walls: ['warm-white', 'oat'], cabinetry: ['walnut', 'cream-lacquer'], countertop: ['quartz-white'], upholstery: ['linen'] };
  const v = AI.vocab({ rooms, mats: matsBy });
  const prompt = AI.promptOf(3, v);
  for (const bad of ['上海', '甲乙', '测试', '.jpg', '/']) ok(!prompt.includes(bad), `发给 AI 的说明里没有「${bad}」`);
  ok(!v.rooms.includes('plan3d'), 'AI 不会回答「整个家（3D）」');
  const calls = [];
  const fake = async (settings, opts) => {
    calls.push({ settings, opts });
    return { json: { photos: [{ i: 1, room: 'living' }, { i: 2, room: 'kitchen' }, { i: 3, room: 'garage' }, { i: 9, room: 'bath' }], styles: ['S2', 'S1', 'Moon'], materials: { floor: 'walnut', walls: 'navy-paint', cabinetry: 'cream-lacquer' }, colours: ['walnut', 'cream', 'neon'] } };
  };
  const imagePart = (src) => ({ inline_data: { mime_type: 'image/jpeg', data: String(src).split(',')[1] || '' } });
  const out = await AI.autoTagGroup({ images: ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB', 'data:image/jpeg;base64,CCCC'], settings: { apiKey: 'TEST' }, call: fake, imagePart, v });
  ok(calls.length === 1 && calls[0].opts.parts.length === 4 && calls[0].opts.tier === 'flash', '一个项目 = 一次请求（3 张小图 + 说明）');
  ok(eq(out.rooms, ['living', 'kitchen', null]), '房间：不认得的（garage）、超出范围的都丢掉', JSON.stringify(out.rooms));
  ok(eq(out.styles, ['侘寂', '原木']), '风格：S2 = 侘寂、S1 = 原木，不认得的丢掉', JSON.stringify(out.styles));
  ok(eq(out.materials, { floor: 'walnut', cabinetry: 'cream-lacquer' }), '材质：不在可选列表里的（navy-paint）丢掉');
  ok(eq(out.colours, ['walnut', 'cream']), '颜色词');
}

console.log(`${failed ? '✗' : '✓'} 案例整理：${passed} 项通过${failed ? `，${failed} 项没过` : ''}`);
if (failed) process.exit(1);
