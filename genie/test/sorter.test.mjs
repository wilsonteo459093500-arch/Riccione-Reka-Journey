// 案例整理（src/cases/sorter/*.js）的纯逻辑：读文件夹名、分组、指纹 / 去重、清晰度 / 曝光 / 截图判断、主色、自动挑选、
// 生成案例、拆案例包、AI 预填（假的 Gemini）、导入脚本的「细节」/ 员工说明（scripts/import-cases.mjs）。
// 照片都是这里用代码画出来的（不用任何真实照片）。
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
  // 细节特写（案例展示 §4）：子文件夹 / 文件名里的词 → detail；照片类型（实景 / 效果图）照样认
  const dv = getData().views.find((v) => v.view === 'detail');
  ok(dv && ['细节', '特写', '局部', '近景', 'detail', 'close-up', 'closeup', 'macro'].every((w) => dv.words.includes(w)), 'data.json 有「细节」这一类（8 个词）');
  ok(['细节', '特写', '局部', '近景', 'Detail', 'CLOSE-UP', 'closeup', 'macro'].every((w) => P.detailOf(`x/${w}01.jpg`)) && !P.detailOf('x/客厅01.jpg'), 'detailOf：这些词都认（不分大小写）');
  ok(P.viewOf('细节') === 'detail' && P.viewOf('实景/细节') === 'photo' && P.viewOf('效果图 特写') === 'render' && P.viewOf('客厅') === null, 'viewOf：只有「细节」= detail；「实景/细节」还是实景');
  const d1 = P.classifyPath('案例/上海/上海-测试甲-原木/实景/细节/拉手.jpg');
  ok(d1.view === 'photo' && d1.detail === true, '「实景/细节」：实景照片 + 细节特写', JSON.stringify([d1.view, d1.detail]));
  const d2 = P.classifyPath('案例/上海/上海-测试甲-原木/厨房 特写.jpg');
  ok(d2.view === 'detail' && d2.detail && d2.room === 'kitchen', '「厨房 特写」：厨房的细节特写');
  const d3 = P.classifyPath('案例/上海/上海-测试甲-原木/效果图/Close-up_handle.jpg');
  ok(d3.view === 'render' && d3.detail, '效果图里的细节特写还是效果图');
  ok(!P.classifyPath('案例/上海/上海-测试甲-原木/客厅01.jpg').detail, '普通照片不是细节');
  const d5 = P.classifyPath('案例/上海/上海-测试甲-细节控原木/IMG_1.jpg');
  ok(!d5.detail && d5.view !== 'detail', '项目文件夹名里的「细节」不会让整个项目都变成细节特写');
  ok(G.safeFolderName('细节', []) === '细节', '「细节」文件夹名可以显示');
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
  const rd = G.buildGroups([e('案例/上海/上海-测试甲-原木/细节/a.jpg'), e('案例/上海/上海-测试甲-原木/客厅/b.jpg')]);
  ok(eq([...rd.files.values()].map((f) => [f.name, f.detail]), [['a.jpg', true], ['b.jpg', false]]) && rd.groups.length === 1, '分组：每张照片带着 detail（细节子文件夹和客厅在同一个项目里）');
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
  ok(!M.analysePixels(a, { w: 4000, h: 3000, view: 'detail' }).flags.some((f) => ['site', 'shot', 'doc', 'plan'].includes(f)), '文件夹叫「细节」→ 不算工地 / 截图 / 单据');
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
  ok(r.picked[0] === r.cover && r.picked.length <= PK.PICK.max, `封面在第一个，最多 ${PK.PICK.max} 张`);
  ok(r.picked.length === 4 && ['portrait', 'kitchen', 'bed'].every((k) => r.picked.includes(k)), '这个项目合适的都挑进来（客厅 2 张没超过每个房间 4 张）', JSON.stringify(r.picked));
  ok(!(r.picked.includes('wide') && r.picked.includes('wideBurst')), '连拍只留一张');
  ok(r.dupOf.has('wideBurst') || r.dupOf.has('wide'), '连拍的另一张记成重复（找得回来）');
  ok(r.rejects.get('blurry')?.includes('blur') && r.rejects.get('dark')?.includes('dark') && r.rejects.get('shot')?.includes('shot'), '糊 / 暗 / 截图被藏起来（理由都在）');
  ok(!r.picked.some((k) => ['blurry', 'dark', 'shot', 'pending'].includes(k)), '被藏的和还没分析的不会被挑');
  ok(r.picked.includes('kitchen') && r.picked.includes('bed'), '不同的房间都挑进来（多样）');
  const r2 = PK.autoPick(photos, { crossDup: new Set(['kitchen']) });
  ok(!r2.picked.includes('kitchen'), '在别的项目里已经有的照片不挑');
  ok(PK.autoPick([]).cover === null, '空的项目');
}

// ───────────────────────── 自动挑选 · 更多照片（案例展示 §4：18 张，每个房间 4 张 + 细节特写 4 张） ─────────────────────────
// 「分析好的照片」直接造出来：指纹随机（彼此差很多 = 都不一样），颜色也各不一样
const R9 = rnd(4242);
const hex32 = () => Array.from({ length: 4 }, () => ((R9() * 4294967296) >>> 0).toString(16).padStart(8, '0')).join('');
let phN = 0;
const ph = (room, o = {}) => ({
  key: o.key || `p${++phN}`,
  room: room || null,
  view: o.view || 'photo',
  ...('detail' in o ? { detail: o.detail } : {}),
  t: null,
  a: { hash: hex32(), sharp: o.sharp ?? 300 + R9() * 200, q: o.q ?? 0.6 + R9() * 0.3, flags: o.flags || [], colours: [{ lab: [30 + R9() * 50, R9() * 40 - 20, R9() * 40 - 20] }], w: o.w ?? 4000, h: o.h ?? 3000 },
});
const roomCount = (list) => {
  const n = {};
  for (const p of list) if (!PK.isDetail(p)) n[p.room || '?'] = (n[p.room || '?'] || 0) + 1;
  return n;
};
{
  ok(PK.PICK.max === 18 && PK.PICK.perRoom === 4 && PK.PICK.details === 4 && PK.PICK.near === 0.93, 'PICK：最多 18 张 · 每个房间 4 张 · 细节 4 张 · 太像（> 0.93）不挑');
  const many = [
    ...Array.from({ length: 10 }, () => ph('living')),
    ...Array.from({ length: 8 }, () => ph('kitchen')),
    ...Array.from({ length: 6 }, () => ph('master')),
    ...Array.from({ length: 5 }, () => ph('dining')),
    ...Array.from({ length: 3 }, () => ph('bath')),
    ...Array.from({ length: 9 }, () => ph(null)),
    ...Array.from({ length: 4 }, () => ph('kitchen', { view: 'detail' })),
    ...Array.from({ length: 3 }, () => ph(null, { detail: true })),
  ];
  const byKey = new Map(many.map((p) => [p.key, p]));
  const r = PK.autoPick(many);
  const picked = r.picked.map((k) => byKey.get(k));
  ok(r.picked.length === 18 && new Set(r.picked).size === 18, `照片多的项目挑满 18 张（${r.picked.length}）`);
  const per = roomCount(picked);
  ok(Object.values(per).every((n) => n <= 4), '每个房间最多 4 张（没标房间的算同一个「房间」）', JSON.stringify(per));
  ok(Object.keys(per).length === 6 && Math.max(...Object.values(per)) - Math.min(...Object.values(per)) <= 1, '每个房间都挑到、挑得平均（照片最少的房间先挑）', JSON.stringify(per));
  const rooms1 = new Set(picked.slice(0, 6).map((p) => p.room || '?'));
  ok(rooms1.size === 6, '前 6 张 = 每个房间一张（客人先看到整个家）', JSON.stringify([...rooms1]));
  ok(picked.filter(PK.isDetail).length === 4, '细节特写挑 4 张（房间照片再多也给细节留位子）');
  ok(r.picked[0] === r.cover && !PK.isDetail(picked[0]), '封面在第一个，不是细节特写');
  const firstD = picked.findIndex(PK.isDetail);
  ok(firstD === 14 && picked.slice(firstD).every(PK.isDetail), '细节特写排在最后（案例里照片的顺序）');
  ok(eq(PK.autoPick(many).picked, r.picked), '同样的照片 → 同样的结果');
  ok(PK.autoPick(many, { max: 6 }).picked.length === 6, 'opt.max 还能用');
  ok(Object.values(roomCount(PK.autoPick(many, { perRoom: 2 }).picked.map((k) => byKey.get(k)))).every((n) => n <= 2), 'opt.perRoom 还能用');
  ok(PK.autoPick(many, { details: 0 }).picked.map((k) => byKey.get(k)).every((p) => !PK.isDetail(p)), 'opt.details = 0 → 不挑细节');

  // 以前最多 6 张；现在 5 个房间 × 3 张 = 15 张都挑
  const five = ['living', 'kitchen', 'master', 'dining', 'study'].flatMap((rm) => [ph(rm), ph(rm), ph(rm)]);
  ok(PK.autoPick(five).picked.length === 15, '5 个房间各 3 张 → 15 张都挑（以前只挑 6 张）');
  // 都没标房间：算同一个房间 → 4 张（R / AI 标好房间以后，再按房间多挑）；细节另外算
  const flat = Array.from({ length: 12 }, () => ph(null));
  ok(PK.autoPick(flat).picked.length === 4, '都没标房间 = 一个「房间」→ 最多 4 张');
  ok(PK.autoPick([...flat, ph(null, { view: 'detail' }), ph(null, { view: 'detail' })]).picked.length === 6, '没标房间的 4 张 + 细节 2 张');

  // 员工 / AI 说「不是细节」（detail: false）比文件名优先：算回厨房的名额
  const kitchen = [ph('kitchen'), ph('kitchen'), ph('kitchen'), ph('kitchen', { view: 'detail', detail: false }), ph('kitchen', { view: 'detail', detail: false }), ph('kitchen', { view: 'detail' })];
  const rk = PK.autoPick(kitchen).picked.map((k) => kitchen.find((p) => p.key === k));
  ok(PK.isDetail({ view: 'detail' }) && !PK.isDetail({ view: 'detail', detail: false }) && PK.isDetail({ view: 'photo', detail: true }), 'isDetail：标过的优先，没标看 view');
  ok(rk.length === 5 && rk.filter((p) => !PK.isDetail(p)).length === 4 && rk.filter(PK.isDetail).length === 1, '厨房 5 张「不是细节」只挑 4 张 + 1 张细节', JSON.stringify(rk.map((p) => [p.view, p.detail])));

  // 细节特写不会被藏起来（不像工地 / 截图 / 单据 / 图纸），也不按「比别的照片糊」藏（近拍的背景本来就是虚的）
  const mixed = [
    ...Array.from({ length: 6 }, () => ph('living', { sharp: 400 })),
    ph('kitchen', { key: 'softRoom', sharp: 60 }),
    ph('kitchen', { key: 'softDetail', sharp: 60, view: 'detail' }),
    ph('kitchen', { key: 'sharpBlurFlag', sharp: 20, view: 'detail', flags: ['blur'] }),
    ph('bath', { key: 'site', view: 'site' }),
  ];
  const rm = PK.autoPick(mixed);
  ok(rm.rejects.get('softRoom')?.includes('blur') && !rm.rejects.has('softDetail'), '比别的照片糊很多：房间照片藏起来，细节特写不藏');
  ok(rm.rejects.get('sharpBlurFlag')?.includes('blur') && rm.rejects.get('site')?.includes('site'), '真的糊（分析说 blur）的细节、工地照片照样藏');
  ok(rm.picked.includes('softDetail'), '细节特写被挑进来');

  // 封面：细节特写再好看也不当封面；只有细节特写的项目才用细节当封面
  const shiny = ph('kitchen', { key: 'shinyDetail', view: 'detail', q: 0.99, w: 4000, h: 2400 });
  const rc = PK.autoPick([shiny, ph('living', { key: 'plain', q: 0.5, w: 3000, h: 4000 }), ph('bath', { q: 0.45, w: 3000, h: 4000 })]);
  ok(rc.cover === 'plain' && rc.picked.includes('shinyDetail') && rc.picked[rc.picked.length - 1] === 'shinyDetail', `封面是房间照片（${rc.cover}），细节排最后`);
  const onlyD = Array.from({ length: 6 }, () => ph(null, { view: 'detail' }));
  const ro = PK.autoPick(onlyD);
  ok(ro.cover && ro.picked.length === 4, '只有细节特写：细节当封面，最多 4 张');

  // 近似重复照样只留一张（连拍 / 同一个角度）
  const base = ph('living', { key: 'shot1', q: 0.8 });
  const twin = { ...ph('living', { key: 'shot2', q: 0.7 }), a: { ...base.a, q: 0.7, hash: base.a.hash.slice(0, 31) + ((parseInt(base.a.hash[31], 16) ^ 1).toString(16)) } };
  const rt = PK.autoPick([base, twin, ph('kitchen'), ph('master')]);
  ok(!(rt.picked.includes('shot1') && rt.picked.includes('shot2')) && rt.dupOf.get('shot2') === 'shot1', '差 1 位的两张 = 重复：只留好的那张');

  // 项目分（「每种风格先做最好的」）意思不变：5 张就算「张数够」
  const q = new Map(Array.from({ length: 18 }, (_, i) => [`k${i}`, 0.8]));
  const keys = [...q.keys()];
  const rooms4 = ['living', 'kitchen', 'master', 'dining'];
  ok(PK.projectScore({ picked: keys.slice(0, 5), q, rooms: rooms4 }) === PK.projectScore({ picked: keys, q, rooms: [...rooms4, ...rooms4] }), '项目分：5 张和 18 张一样（张数 5 张满分，没变）');
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
  // 细节特写：detail: true（客人那边有「细节」一栏）；效果图的细节还是效果图；上次存的同一张照片，员工写的说明留着
  const img = (id) => ({ id, w: 1600, h: 1200, device: true, src: '', thumb: '' });
  const shots3 = [
    { key: 'k1', room: 'living', view: 'photo', image: img('01') },
    { key: 'k2', room: 'kitchen', view: 'detail', image: img('02') },
    { key: 'k3', room: 'kitchen', view: 'render', detail: true, image: img('03') },
    { key: 'k4', room: 'kitchen', view: 'detail', detail: false, image: img('04') },
    { key: 'k5', room: 'living', view: 'photo', image: img('05'), prev: { caption: { zh: '员工写的说明', en: 'Staff caption' }, alt: { zh: '替代文字', en: 'Alt text' } } },
  ];
  const c3 = B.caseFromGroup(g, { styles: ['原木'], type: 'condo', bedrooms: 3, consent: true }, shots3);
  ok(eq(c3.images.map((im) => [im.kind, im.detail]), [['photo', false], ['photo', true], ['render', true], ['photo', false], ['photo', false]]), '细节：view detail / 员工标的；效果图的细节还是效果图', JSON.stringify(c3.images.map((im) => [im.kind, im.detail])));
  ok(c3.images[4].caption?.zh === '员工写的说明' && c3.images[4].caption?.en === 'Staff caption' && c3.images[4].alt.en === 'Alt text', '同一张照片再存一次：员工写的说明 / 替代文字留着', JSON.stringify(c3.images[4]));
  ok(eq(c3.images[0].caption, { zh: '', en: '' }) && c3.images[0].cover && !c3.images[0].detail, '新照片：说明空着，封面不是细节');
  ok(C.validateCase(c3, { forLive: true }).ok, '有细节特写的案例照样能上架', JSON.stringify(C.validateCase(c3, { forLive: true }).errors));
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

// ───────────────────────── 再存一次（build.js）：员工在案例库里做的都留着 ─────────────────────────
{
  const g = { id: 'g5', dir: '案例/上海/上海-测试丁-原木', kind: 'home', city: '上海', styles: ['原木'], raw: [], keys: ['k1', 'k2', 'k3'] };
  const img = (id, o = {}) => ({ id, w: 1600, h: 1200, device: true, src: '', thumb: '', ...o });
  const dec = { styles: ['原木'], type: 'condo', bedrooms: 3, consent: true };
  const first = B.caseFromGroup(g, dec, [
    { key: 'k1', room: 'living', view: 'photo', image: img('01') },
    { key: 'k2', room: 'kitchen', view: 'photo', image: img('02') },
  ]);
  // 员工在案例库里：上架、每个房间做了什么、板材、工期、把 02 标成细节、自己加了一张照片（设成封面）
  const made = { kitchen: { firm: ['kitchen'], boards: ['sail-7'], note: { zh: '整面高柜', en: 'Full-height cabinets' } } };
  const lib = C.migrateCase({
    ...first,
    status: 'live',
    roomsMade: made,
    boards: { cabinetry: 'sail-7' },
    boardsAlso: ['sail-9'],
    time: 6,
    images: [
      { ...first.images[1], detail: true, caption: { zh: '拉手', en: 'Handle' }, cover: false },
      { ...first.images[0], cover: false },
      img('dk3x', { room: 'dining', cover: true, caption: { zh: '员工加的', en: 'Staff added' } }),
    ],
  });
  const P1 = lib.images.find((x) => x.id === '01');
  const P2 = lib.images.find((x) => x.id === '02');
  const own = lib.images.find((x) => x.id === 'dk3x');
  // 整理工具里又改了点东西（多挑了一张），再存：照片在 session 里按案例库的顺序排好、标好封面（这里直接给）
  const again = B.caseFromGroup(g, { ...dec, consent: undefined }, [
    { key: 'k2', room: 'kitchen', view: 'photo', image: img('02'), prev: P2 },
    { key: 'k1', room: 'living', view: 'photo', image: img('01'), prev: P1 },
    { key: null, keep: true, image: own, prev: own, cover: true },
    { key: 'k3', room: 'master', view: 'photo', image: img('03') },
  ], undefined, { prev: lib });
  ok(again.status === 'live' && again.consent === true, '再存一次：上架的还是上架、业主同意留着', JSON.stringify([again.status, again.consent]));
  ok(eq(again.roomsMade, made), '再存一次：每个房间做了什么留着', JSON.stringify(again.roomsMade));
  ok(eq(again.boards, { cabinetry: 'sail-7' }) && eq(again.boardsAlso, ['sail-9']) && again.time === 6, '再存一次：板材、工期留着');
  ok(eq(again.images.map((x) => [x.id, x.detail, x.cover]), [['02', true, false], ['01', false, false], ['dk3x', false, true], ['03', false, false]]), '再存一次：员工标的细节、排的顺序、挑的封面、自己加的照片都留着', JSON.stringify(again.images.map((x) => [x.id, x.detail, x.cover])));
  ok(again.images[0].caption.zh === '拉手' && again.images[2].caption.en === 'Staff added' && again.images[2].room === 'dining', '说明 / 员工加的照片原样留着');
  ok(eq(again.rooms.sort(), ['dining', 'kitchen', 'living', 'master']), '房间清单算上员工加的照片');
  // 整理工具明明白白说「不是细节」→ 整理工具说了算
  const no = B.caseFromGroup(g, dec, [{ key: 'k2', room: 'kitchen', view: 'photo', detail: false, image: img('02'), prev: P2 }], undefined, { prev: lib });
  ok(no.images[0].detail === false, '整理工具标过「不是细节」→ 盖过案例库里的');
  // 整理工具里拿掉了「业主同意」→ 不能再给客人看（退回草稿）
  const off = B.caseFromGroup(g, { ...dec, consent: false }, [{ key: 'k1', room: 'living', view: 'photo', image: img('01'), prev: P1 }], undefined, { prev: lib });
  ok(off.consent === false && off.status === 'draft', '整理工具里拿掉业主同意 → 退回草稿', JSON.stringify([off.consent, off.status]));
  const hid = B.caseFromGroup(g, dec, [{ key: 'k1', room: 'living', view: 'photo', image: img('01') }], undefined, { prev: { ...lib, status: 'hidden' } });
  ok(hid.status === 'hidden', '藏起来的还藏着');
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
  ok(eq(out.details, [false, false, false]), '没说是细节 = 都不是');
  // 细节特写（案例展示 §4）：说明里问、schema 里有；只有明明白白的 true 才算
  ok(/close-up detail/i.test(prompt) && prompt.includes('"detail":true'), '发给 AI 的说明里问「是不是细节特写」');
  ok(AI.SCHEMA.properties.photos.items.properties.detail?.type === 'BOOLEAN' && eq(AI.SCHEMA.properties.photos.items.required, ['i', 'room']), 'SCHEMA：每张照片可以带 detail（不是必填）');
  const fake2 = async () => ({ json: { photos: [{ i: 1, room: 'kitchen', detail: true }, { i: 2, room: 'living', detail: 'yes' }, { i: 3, room: 'garage', detail: true }, { i: 9, room: 'bath', detail: true }, { i: 1.5, room: 'bath', detail: true }], styles: ['S1'] } });
  const out2 = await AI.autoTagGroup({ images: ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB', 'data:image/jpeg;base64,CCCC'], settings: { apiKey: 'TEST' }, call: fake2, imagePart, v });
  ok(eq(out2.details, [true, false, true]) && eq(out2.rooms, ['kitchen', 'living', null]), '细节：true 才算（"yes" 不算）；房间不认得也照样记细节；超出范围的丢掉', JSON.stringify([out2.details, out2.rooms]));
  // 用到员工的决定上：只填还没填的（和房间一样）
  const dec = { rooms: { b: 'dining' }, detail: { c: false } };
  const patch = AI.answerPatch(dec, ['a', 'b', 'c', 'd'], { rooms: ['kitchen', 'living', 'bath', null], details: [true, true, true, true], styles: ['原木'], materials: {}, colours: [] }, (k) => k === 'd');
  ok(eq(patch.rooms, { b: 'dining', a: 'kitchen', c: 'bath' }), 'AI 的房间：员工标过的不动，没标的才填', JSON.stringify(patch.rooms));
  ok(eq(patch.detail, { c: false, a: true, b: true }), 'AI 的细节：员工说「不是」的不动；文件名已经说是细节的（d）不用再记', JSON.stringify(patch.detail));
  ok(eq(patch.aiStyles, ['原木']) && patch.aiMats === undefined && !('ai' in patch), '风格只是建议；没有材质 = 不写');
  ok(eq(dec, { rooms: { b: 'dining' }, detail: { c: false } }), '不改原来的决定（给一个新的补丁）');
}

// ───────────────────────── 整理一次（Session，Node 里跑：假的 worker 池、假的 AI、设备案例库在内存里） ─────────────────────────
{
  const S = await import('../src/cases/sorter/session.js');
  C._resetDevice();
  const dir = '案例/上海/上海-测试甲-原木';
  const names = ['客厅1.jpg', '客厅2.jpg', '客厅3.jpg', '客厅4.jpg', '客厅5.jpg', '客厅6.jpg', '厨房1.jpg', '厨房 细节 拉手.jpg', 'closeup-grain.jpg', 'IMG_1.jpg'];
  const entries = names.map((name, i) => ({ path: `${dir}/${name}`, name, size: 1000 + i, mtime: 1.7e12 + i * 1000 }));
  const runs = [];
  const pool = {
    run: async (task) => {
      runs.push(task.op);
      if (task.op === 'compress') return { 1600: new Blob(['big']), 480: new Blob(['small']), w: 1600, h: 1200 };
      throw new Error('cancelled');
    },
    pause() {},
    clear() {},
  };
  const s = new S.Session(entries, { pool });
  ok(s.groups.length === 1, '一个项目');
  const g = s.groups[0];
  const keyOf = (name) => g.keys.find((k) => s.files.get(k).name === name);
  for (const k of g.keys) s.an.set(k, ph(null).a);
  s._repick(g);
  const picked = s.pickedOf(g);
  const kHandle = keyOf('厨房 细节 拉手.jpg');
  const kGrain = keyOf('closeup-grain.jpg');
  ok(s.detailOf(g, kHandle) && s.detailOf(g, kGrain) && !s.detailOf(g, keyOf('客厅1.jpg')), '文件名说是细节 → 细节特写');
  ok(picked.length === 8 && picked.filter((k) => s.files.get(k).name.startsWith('客厅')).length === 4, `客厅 6 张挑 4 张；厨房 1、没标房间 1、细节 2 → 一共 8 张（${picked.length}）`);
  ok(eq(picked.slice(-2).sort(), [kHandle, kGrain].sort()), '细节特写在最后');
  // 员工：「这张不是细节」→ 算回没标房间的照片；再改回来
  s.setDetail(g.id, kGrain, false);
  ok(!s.detailOf(g, kGrain) && s.decision(g.id).detail[kGrain] === false && s.pickedOf(g).includes(kGrain) && s.pickedOf(g).at(-1) === kHandle, '员工说不是细节：重新挑（它变成普通照片）');
  s.setDetail(g.id, kGrain, true);
  ok(s.detailOf(g, kGrain) && s.decision(g.id).detail[kGrain] === true, '改回来：又是细节');
  // 员工把一张客厅照片标成细节：客厅空出一个位子
  const k1 = keyOf('客厅1.jpg');
  s.setDetail(g.id, k1, true);
  ok(s.detailOf(g, k1) && s.pickedOf(g).filter((k) => s.files.get(k).name.startsWith('客厅') && !s.detailOf(g, k)).length === 4, '一张客厅标成细节 → 客厅还能再挑一张');
  s.setDetail(g.id, k1, false);
  // AI（假的）：说「厨房1」是细节特写 → 只填员工还没填的
  const fakeAi = async (settings, opts) => {
    ok(opts.schema === AI.SCHEMA && opts.parts.length === s.pickedOf(g).length + 1, '一次请求：每张挑好的小图 + 说明');
    return { json: { photos: s.pickedOf(g).map((k, i) => ({ i: i + 1, room: s.files.get(k).name.startsWith('厨房') ? 'kitchen' : 'living', ...(s.files.get(k).name === '厨房1.jpg' ? { detail: true } : {}) })), styles: ['S1'] } };
  };
  const keys = s.pickedOf(g);
  const r = await AI.autoTagGroup({ images: keys.map(() => 'data:image/jpeg;base64,AAAA'), settings: { apiKey: 'TEST' }, call: fakeAi, imagePart: (src) => ({ inline_data: { data: src } }), v: AI.vocab({ rooms: C.ROOMS.map((x) => x.id), mats: {} }) });
  s.setDecision(g.id, { ...AI.answerPatch(s.decision(g.id), keys, r, (k) => s.detailOf(g, k)), ai: Date.now() });
  ok(s.detailOf(g, keyOf('厨房1.jpg')) && s.decision(g.id).detail[keyOf('厨房1.jpg')] === true && s.decision(g.id).detail[k1] === false, 'AI 说是细节 → 记下来；员工说过「不是」的不动');
  ok(s.roomOf(g, keyOf('IMG_1.jpg')) === 'living' || !s.pickedOf(g).includes(keyOf('IMG_1.jpg')), 'AI 填了房间');
  // 存进案例库：细节特写 → detail: true；员工在案例库写的说明，同一张照片再存一次还在
  s.setDecision(g.id, { styles: ['原木'], type: 'condo', consent: true, state: 'ready' });
  const out = await s.saveToLibrary([g.id]);
  ok(out.saved.length === 1 && !out.skipped.length, '存好了', JSON.stringify(out));
  const c = await C.getCase(out.saved[0]);
  const fin = s.pickedOf(g);
  ok(c.images.length === fin.length && c.images.every((im, i) => im.detail === s.detailOf(g, fin[i])), '案例照片的 detail = 整理时的「细节」', JSON.stringify(c.images.map((im) => [im.id, im.detail])));
  ok(c.images.filter((im) => im.detail).length === 3 && c.images.at(-1).detail && c.images[0].cover && !c.images[0].detail, '3 张细节特写排在最后；封面不是细节');
  ok(eq(s.decision(g.id).saved.keys, fin), '记下每个编号是哪一张照片（只有指纹 key）');
  c.images[1].caption = { zh: '员工写的说明', en: 'Staff caption' };
  await C.saveCase(c);
  s.setDecision(g.id, { bedrooms: 2 }); // 改了 → 要再存
  ok(s.dirty(g), '改过 → 要再存');
  const out2 = await s.saveToLibrary([g.id]);
  const c2 = await C.getCase(out2.saved[0]);
  ok(out2.saved[0] === out.saved[0] && c2.images[1].caption?.zh === '员工写的说明', '再存一次：同一张照片的说明留着', JSON.stringify(c2.images[1]));
  ok(!JSON.stringify(c2).includes('测试甲') && !JSON.stringify(c2).includes('上海'), '案例里没有人名 / 城市');
  ok(runs.every((op) => op === 'compress'), '只用到压缩（没有别的 worker 活）');
  s.destroy();
  C._resetDevice();
}

// ───────────────────────── 整理工具再存一次 / 存不进去（Session）─────────────────────────
// 存过的项目不会因为挑照片的规则变了就变成「改过」；再存一次员工在案例库里做的都留着；空间满了不会一直转圈、不留下没人要的照片
{
  const S = await import('../src/cases/sorter/session.js');
  C._resetDevice();
  const pool = {
    run: async (task) => {
      if (task.op === 'compress') return { 1600: new Blob(['big']), 480: new Blob(['small']), w: 1600, h: 1200 };
      throw new Error('cancelled');
    },
    pause() {},
    clear() {},
  };
  const mk = (dir, names) => names.map((name, i) => ({ path: `${dir}/${name}`, name, size: 2000 + i, mtime: 1.7e12 + i * 1000 }));
  const hasPhoto = async (cid, imgId) => {
    const r = await C.loadImageURL({ id: cid }, { id: imgId, device: true }, 1600);
    r.release();
    return !!r.url;
  };
  const dirA = '案例/上海/上海-测试乙-原木';
  const dirB = '案例/上海/上海-测试丙-侘寂';
  const s = new S.Session([...mk(dirA, ['客厅1.jpg', '客厅2.jpg', '客厅3.jpg', '客厅4.jpg', '客厅5.jpg', '厨房1.jpg', '厨房2.jpg', '主卧1.jpg']), ...mk(dirB, ['客厅1.jpg', '厨房1.jpg', '主卧1.jpg'])], { pool });
  const gA = s.groups.find((g) => g.dir === dirA);
  const gB = s.groups.find((g) => g.dir === dirB);
  const ready = { styles: ['原木'], type: 'condo', consent: true, state: 'ready' };
  for (const g of [gA, gB]) {
    for (const k of g.keys) s.an.set(k, ph(null).a);
    s._repick(g);
    s.setDecision(g.id, ready);
  }
  const out = await s.saveToLibrary([gA.id]);
  const cid = out.saved[0];
  const keysA = s.pickedOf(gA);
  ok(out.saved.length === 1 && !s.dirty(gA) && eq(s.decision(gA.id).saved.keys, keysA), '存好了、没改过');

  // 挑照片的规则变了（以后的版本）：存过的项目照样是存的那几张，不会变成「改过，要再存」
  const max0 = PK.PICK.max;
  PK.PICK.max = 3;
  s._repick(gA);
  ok(s.auto.get(gA.id).picked.length <= 3 && eq(s.pickedOf(gA), keysA) && !s.dirty(gA), '存过的项目：自动挑的规则变了 → 还是存的那几张、不算改过', JSON.stringify([s.auto.get(gA.id).picked.length, s.pickedOf(gA).length]));
  PK.PICK.max = max0;
  s._repick(gA);
  s.setDecision(gA.id, { picked: keysA.slice(0, -1) });
  ok(s.dirty(gA), '员工自己拿掉一张 → 改过');
  s.setDecision(gA.id, { picked: undefined });
  ok(!s.dirty(gA) && eq(s.pickedOf(gA), keysA), '放回去 → 又是存的那几张');

  // 员工在案例库里：上架、写每个房间做了什么、把 02 标成细节、写说明、把最后一张排到最前、自己加一张照片当封面
  const c = await C.getCase(cid);
  const added = await C.putImage(cid, null, { blobs: { 1600: new Blob(['own']), 480: new Blob(['own-s']), w: 1600, h: 1200 }, room: 'dining' });
  const imgs = c.images.map((im) => ({ ...im, cover: false, ...(im.id === '02' ? { detail: true, caption: { zh: '员工写的', en: 'Staff wrote' } } : {}) }));
  const lib = [imgs.at(-1), ...imgs.slice(0, -1), { ...added, cover: true }];
  const made = { living: { firm: ['tvWall'], boards: [], note: { zh: '电视墙', en: 'TV wall' } } };
  await C.saveCase({ ...c, status: 'live', roomsMade: made, images: lib });
  s.setDecision(gA.id, { bedrooms: 3 }); // 整理工具里又改了点东西 → 要再存
  ok(s.dirty(gA), '改过 → 要再存');
  await s.saveToLibrary([gA.id]);
  const c2 = await C.getCase(cid);
  ok(c2.status === 'live' && c2.consent && eq(c2.roomsMade, made), '再存一次：上架的还是上架、每个房间做了什么留着', JSON.stringify([c2.status, c2.roomsMade]));
  ok(eq(c2.images.map((im) => im.id), lib.map((im) => im.id)), '再存一次：员工排的顺序留着', JSON.stringify(c2.images.map((im) => im.id)));
  const im02 = c2.images.find((im) => im.id === '02');
  ok(im02.detail === true && im02.caption.zh === '员工写的', '再存一次：员工在案例库里标的细节、写的说明留着');
  ok(c2.images.find((im) => im.id === added.id)?.cover && c2.images.filter((im) => im.cover).length === 1 && (await hasPhoto(cid, added.id)), '再存一次：员工自己加的照片、挑的封面留着');
  // 整理工具里明明白白说「不是细节」→ 整理工具说了算
  s.setDetail(gA.id, s.decision(gA.id).saved.keys[1], false);
  await s.saveToLibrary([gA.id]);
  ok((await C.getCase(cid)).images.find((im) => im.id === '02').detail === false, '整理工具标「不是细节」→ 盖过案例库里的');

  // 以前的版本存的（saved 里没有 keys）、员工没点过照片：打开以后不会都变成「改过」；员工再改资料才算
  const dB = s.decision(gB.id);
  s.dec.set(gB.id, { ...dB, saved: { caseId: 'p-old', at: 1, sig: 'old-sig', bytes: 1, json: 1 } });
  await s.resume();
  ok(!s.dirty(gB) && s.decision(gB.id).saved.nopick === true, '以前的版本存的项目：打开以后不是「改过，要再存」');
  PK.PICK.max = 2;
  s._repick(gB);
  ok(!s.dirty(gB), '挑照片的规则再变也一样');
  PK.PICK.max = max0;
  s._repick(gB);
  s.setDecision(gB.id, { bedrooms: 4 });
  ok(s.dirty(gB), '员工改了资料 → 改过');
  // 旧的、员工点过照片的：指纹本来就对得上，不重新盖章
  s.dec.set(gB.id, { ...dB, picked: s.pickedOf(gB), saved: { caseId: 'p-old', at: 1, sig: '' } });
  s.dec.get(gB.id).saved.sig = s.sigOf(gB);
  await s.resume();
  ok(!s.dirty(gB) && !s.decision(gB.id).saved.nopick, '旧的、员工点过照片的：指纹照旧');

  // 空间满了（第 3 张照片写不进去）：不会卡住、说是空间不够；写进去的照片删掉；后面的项目不再试
  s.dec.set(gB.id, { ...ready });
  const cidB = B.caseIdFor(gB.dir, gB.kind);
  const quota = () => Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
  C._failWrites((store, key) => (store === 'photos' && key.startsWith(`${cidB}/03/`) ? quota() : null));
  s.setDecision(gA.id, { bedrooms: 2 });
  const revA = (await C.getCase(cid)).rev;
  const out3 = await s.saveToLibrary([gB.id, gA.id]);
  C._failWrites(null);
  ok(!out3.saved.length && eq(out3.skipped, [{ gid: gB.id, why: ['space'] }]) && C.isQuotaError(out3.error), '空间满了：saveToLibrary 照样回来，说是空间不够', JSON.stringify(out3.skipped));
  ok(!(await hasPhoto(cidB, '01')) && !(await hasPhoto(cidB, '02')) && !(await C.getCase(cidB)) && !s.decision(gB.id).saved, '存不进去的项目：写进去的照片删掉了（没有案例指着）、没有案例、不算存过');
  ok((await C.getCase(cid)).rev === revA && s.dirty(gA), '空间满了：后面的项目不再试（还是「要再存」）');
  // 再存一次的时候案例写不进去：旧案例的照片一张都不删
  const cA = await C.getCase(cid);
  C._failWrites((store) => (store === 'cases' ? quota() : null));
  const out4 = await s.saveToLibrary([gA.id]);
  C._failWrites(null);
  const still = await Promise.all(cA.images.map((im) => hasPhoto(cid, im.id)));
  ok(eq(out4.skipped, [{ gid: gA.id, why: ['space'] }]) && still.every(Boolean) && (await C.getCase(cid)).rev === cA.rev, '再存一次存不进去：旧案例和它的照片都还在', JSON.stringify(still));
  // 不是空间的问题：这个项目跳过（why error），后面的照样存
  C._failWrites((store, key) => (store === 'photos' && key.startsWith(`${cidB}/01/`) ? new Error('boom') : null));
  const out5 = await s.saveToLibrary([gB.id, gA.id]);
  C._failWrites(null);
  ok(eq(out5.skipped, [{ gid: gB.id, why: ['error'] }]) && eq(out5.saved, [cid]) && !C.isQuotaError(out5.error), '别的错误：这个项目跳过，后面的照样存', JSON.stringify([out5.skipped, out5.saved]));
  s.destroy();
  C._resetDevice();
}

// ───────────────────────── 导入脚本（scripts/import-cases.mjs）：文件名「细节」、再导入一次员工写的说明 / 细节 / 顺序留着 ─────────────────────────
// --dry-run：不转照片（不用 Pillow / Chromium），只看 manifest 怎么变；照片文件是空的假文件
{
  const os = await import('node:os');
  const path = await import('node:path');
  const IC = await import('../scripts/import-cases.mjs');
  ok(['05 厨房 细节.jpg', 'closeup-handle.jpg', 'Close-Up 2.JPG', '局部.png', '特写_门板.jpg', 'detail.jpg', 'Macro01.jpg', '近景.jpg'].every(IC.guessDetail), 'guessDetail：细节 / 特写 / 局部 / 近景 / detail / close-up / closeup / macro');
  ok(!IC.guessDetail('01 客厅.jpg') && !IC.guessDetail('closet.jpg') && IC.guessRoom('05 厨房 细节.jpg') === 'kitchen', '普通照片不是细节；细节照片照样认房间');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wish-sorter-import-'));
  try {
    const src = path.join(tmp, 'photos');
    const home = path.join(src, 'demo-home');
    fs.mkdirSync(home, { recursive: true });
    for (const f of ['01 客厅.jpg', '02 厨房 细节.jpg', '03 closeup handle.jpg', '04 主卧.jpg']) fs.writeFileSync(path.join(home, f), 'x');
    const manifest = path.join(tmp, 'manifest.json');
    const run = () => IC.importCases({ src, out: path.join(tmp, 'out'), manifest, engine: 'pillow', dry: true, quiet: true });
    const r1 = await run();
    const c1 = r1.manifest.cases.find((c) => c.id === 'p-demo-home');
    ok(eq(r1.added, ['p-demo-home']) && eq(c1.images.map((im) => [im.id, im.room, im.detail]), [['01', 'living', false], ['02', 'kitchen', true], ['03', '', true], ['04', 'master', false]]), '新导入：文件名说是细节 → detail: true', JSON.stringify(c1.images.map((im) => [im.id, im.room, im.detail])));
    ok(c1.images.every((im) => eq(im.caption, { zh: '', en: '' })) && C.validateCase(C.migrateCase(c1)).ok, '新导入：说明空着；是合格的草稿');

    // 员工在 iPad 上改过（导出案例包再合并进 manifest）：排了顺序、写了说明、标了细节；然后文件夹里多了一张照片，再导入一次
    const staff = JSON.parse(JSON.stringify(c1));
    const im = (id) => staff.images.find((x) => x.id === id);
    im('01').caption = { zh: '客厅的电视墙', en: 'The TV wall' };
    im('01').alt = { zh: '客厅', en: 'Living room' };
    im('04').detail = true; // 员工：主卧这张其实是衣柜门的特写
    im('02').detail = false; // 员工取消了，但文件名写着「细节」→ 还是细节（和房间一样：文件名优先）
    staff.images = [im('03'), im('01'), im('02'), im('04')].map((x) => ({ ...x, cover: x.id === '03' }));
    staff.title = { zh: '员工改的标题', en: 'Staff title' };
    staff.rev = 3;
    fs.writeFileSync(manifest, JSON.stringify({ kind: 'wish-cases', v: 1, updatedAt: '', cases: [staff] }));
    fs.writeFileSync(path.join(home, '05 餐厅.jpg'), 'x');
    const r2 = await run();
    const c2 = r2.manifest.cases.find((c) => c.id === 'p-demo-home');
    ok(eq(r2.updated, ['p-demo-home']) && c2.rev === 4 && c2.title.zh === '员工改的标题', '再导入：更新、rev + 1、员工的标题留着');
    ok(eq(c2.images.map((x) => x.id), ['03', '01', '02', '04', '05']), '员工排的顺序留着，新照片接在后面', JSON.stringify(c2.images.map((x) => x.id)));
    const im2 = (id) => c2.images.find((x) => x.id === id);
    ok(eq(im2('01').caption, { zh: '客厅的电视墙', en: 'The TV wall' }) && im2('01').alt.en === 'Living room', '员工写的说明 / 替代文字按编号留着');
    ok(im2('04').detail === true && im2('02').detail === true && im2('05').detail === false && im2('03').detail === true, '细节：员工标的留着；文件名写着「细节」的一定是细节', JSON.stringify(c2.images.map((x) => [x.id, x.detail])));
    ok(im2('03').cover && c2.images.filter((x) => x.cover).length === 1, '员工挑的封面留着');
    ok(C.validateCase(C.migrateCase(c2)).ok, '还是合格的案例');

    // 再跑一次（什么都没改）= 没变
    fs.writeFileSync(manifest, JSON.stringify(r2.manifest));
    const r3 = await run();
    ok(eq(r3.unchanged, ['p-demo-home']) && !r3.updated.length, '什么都没改 → 没变（员工排的顺序不算改动）');

    // 同一个编号换成了另一张照片（大小不一样）→ 不把旧的说明安到新照片上
    const m4 = JSON.parse(JSON.stringify(r2.manifest));
    Object.assign(m4.cases[0].images.find((x) => x.id === '01'), { w: 900, h: 1600 });
    fs.writeFileSync(manifest, JSON.stringify(m4));
    const c4 = (await run()).manifest.cases[0];
    ok(eq(c4.images.find((x) => x.id === '01').caption, { zh: '', en: '' }) && c4.images.find((x) => x.id === '01').alt.zh === '', '同一个编号、大小不一样 = 换了照片：说明不留');

    // 文件夹中间多了一张（排在前面）：后面的编号都往后挪 —— 员工写的说明、细节、房间、顺序、封面跟着照片（源文件）走，不跟着编号
    const home5 = path.join(tmp, 'photos5', 'shift-home');
    fs.mkdirSync(home5, { recursive: true });
    for (const f of ['01 客厅.jpg', '02 厨房.jpg', '03 主卧.jpg', '04 IMG.jpg']) fs.writeFileSync(path.join(home5, f), 'x');
    const manifest5 = path.join(tmp, 'manifest5.json');
    const run5 = () => IC.importCases({ src: path.join(tmp, 'photos5'), out: path.join(tmp, 'out5'), manifest: manifest5, engine: 'pillow', dry: true, quiet: true });
    const byFile = (c, f) => c.images.find((x) => x.srcName === IC.srcNameOf(f));
    const a1 = (await run5()).manifest.cases[0];
    ok(['01 客厅.jpg', '02 厨房.jpg', '03 主卧.jpg', '04 IMG.jpg'].every((f, i) => byFile(a1, f)?.id === String(i + 1).padStart(2, '0')) && !JSON.stringify(a1).includes('.jpg'), '每张照片记下源文件名的指纹（文件名本身不进 manifest）');
    const st = JSON.parse(JSON.stringify(a1));
    byFile(st, '01 客厅.jpg').caption = { zh: '客厅：电视墙', en: 'Living: TV wall' };
    Object.assign(byFile(st, '02 厨房.jpg'), { caption: { zh: '厨房：白橡橱柜', en: 'Kitchen: white oak' }, alt: { zh: '厨房', en: 'Kitchen' }, detail: true });
    byFile(st, '03 主卧.jpg').caption = { zh: '主卧：到顶衣柜', en: 'Master: full-height wardrobe' };
    byFile(st, '04 IMG.jpg').room = 'study'; // 文件名认不出来，员工标的
    const coverId = byFile(st, '02 厨房.jpg').id;
    st.images = ['03 主卧.jpg', '01 客厅.jpg', '02 厨房.jpg', '04 IMG.jpg'].map((f) => ({ ...byFile(st, f), cover: byFile(st, f).id === coverId }));
    fs.writeFileSync(manifest5, JSON.stringify({ kind: 'wish-cases', v: 1, updatedAt: '', cases: [st] }));
    fs.writeFileSync(path.join(home5, '01b 拉手细节.jpg'), 'x'); // 排在 01 和 02 中间
    const a2 = (await run5()).manifest.cases[0];
    const f2 = (f) => byFile(a2, f);
    ok(f2('01b 拉手细节.jpg').id === '02' && f2('02 厨房.jpg').id === '03' && f2('03 主卧.jpg').id === '04', '中间多了一张：后面的编号往后挪', JSON.stringify(a2.images.map((x) => x.id)));
    ok(f2('01 客厅.jpg').caption.zh === '客厅：电视墙' && f2('02 厨房.jpg').caption.zh === '厨房：白橡橱柜' && f2('02 厨房.jpg').alt.en === 'Kitchen' && f2('03 主卧.jpg').caption.zh === '主卧：到顶衣柜', '说明 / 替代文字跟着照片走（不跑到别的照片上）', JSON.stringify(a2.images.map((x) => [x.id, x.caption.zh])));
    ok(eq(f2('01b 拉手细节.jpg').caption, { zh: '', en: '' }) && f2('01b 拉手细节.jpg').detail === true && f2('02 厨房.jpg').detail === true && f2('03 主卧.jpg').detail === false && f2('04 IMG.jpg').detail === false, '细节跟着照片走；新照片说明空着', JSON.stringify(a2.images.map((x) => [x.id, x.detail])));
    ok(f2('04 IMG.jpg').room === 'study' && f2('02 厨房.jpg').room === 'kitchen' && f2('01b 拉手细节.jpg').room === '', '员工标的房间跟着照片走');
    ok(eq(a2.images.map((x) => x.srcName), ['03 主卧.jpg', '01 客厅.jpg', '02 厨房.jpg', '04 IMG.jpg', '01b 拉手细节.jpg'].map(IC.srcNameOf)), '员工排的顺序跟着照片走，新照片接在后面');
    ok(f2('02 厨房.jpg').cover && a2.images.filter((x) => x.cover).length === 1, '员工挑的封面跟着照片走');

    // 旧的 manifest（没记 srcName）：照片没变 → 补记 srcName，不算改动（rev 不变）；说明按编号 + 大小认
    const legacy = JSON.parse(JSON.stringify(a2));
    for (const x of legacy.images) delete x.srcName;
    fs.writeFileSync(manifest5, JSON.stringify({ kind: 'wish-cases', v: 1, updatedAt: '', cases: [legacy] }));
    const r6 = await run5();
    const a6 = r6.manifest.cases[0];
    ok(eq(r6.unchanged, [a2.id]) && a6.rev === legacy.rev && eq(a6.images.map((x) => x.srcName), a2.images.map((x) => x.srcName)) && eq(a6.images.map((x) => x.caption), a2.images.map((x) => x.caption)), '旧的 manifest：补记 srcName，rev 不变、说明照旧', JSON.stringify([r6.unchanged, a6.rev, legacy.rev]));

    // iPad 存的案例没有 srcName（只有导入脚本用）：案例包合并回 manifest 的时候，同一张照片记过的接着用
    fs.writeFileSync(manifest5, JSON.stringify({ kind: 'wish-cases', v: 1, updatedAt: '', cases: [a2] }));
    const packCase = { ...C.migrateCase(a2), rev: a2.rev + 1 };
    const r7 = await IC.mergePack({ pack: { kind: 'wish-cases', v: 1, cases: [packCase] }, out: path.join(tmp, 'out5'), manifest: manifest5, engine: 'pillow', dry: true, quiet: true });
    ok(!packCase.images.some((x) => 'srcName' in x) && eq(r7.manifest.cases[0].images.map((x) => x.srcName), a2.images.map((x) => x.srcName)), '案例包合并回来：srcName 接着用');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log(`${failed ? '✗' : '✓'} 案例整理：${passed} 项通过${failed ? `，${failed} 项没过` : ''}`);
if (failed) process.exit(1);
