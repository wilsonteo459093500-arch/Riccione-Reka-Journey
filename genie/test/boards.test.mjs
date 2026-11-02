// 溪岸板材 · 导入器（builder B）的纯逻辑：文件名解析、id、颜色 → 情绪数字、雷区标签、类别（R2）、尺寸（R5）、分辨率（R10）、
// 接缝（R3）、编织边框（R4）、目录建议、板材包（拆包 / 往返 / 检查）、这台设备的板材库、合并脚本（scripts/import-boards.mjs）。
// 图片都是这里用代码画的；老板的 5 张样板只用量出来的数字（test/fixtures/boards/features.json，R13）—— 像素永远不进这个仓库。
// 跑法：node test/boards.test.mjs（npm test 会一起跑）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const P = await import('../src/shared/boards/parse.js');
const V = await import('../src/shared/boards/vocab.js');
const D = await import('../src/shared/boards/derive.js');
const T = await import('../src/shared/boards/tiers.js');
const CAT = await import('../src/shared/boards/catalog.js');
const SEED = await import('../src/shared/boards/catalog-seed.js');
const PK = await import('../src/shared/boards/pack.js');
const DEV = await import('../src/shared/boards/device.js');
const A = await import('../src/cases/boards/analyse.js');
const R = await import('../src/cases/boards/record.js');
const M = await import('../src/shared/materials.js');
const { COLOR_TAGS, COLOR_FAMILIES } = await import('../src/shared/colorTags.js');
const EN = (await import('../src/shared/i18n/en.js')).default;
const MERGE = await import('../scripts/import-boards.mjs');

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
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ───────────────────────── 1. 文件名解析（design/parse.mjs 的 27 条 + review/exp_parse.mjs 的 27 条 + 老板文件夹的写法） ─────────────────────────

function table(rows, label) {
  const parsed = P.assignIds(rows.map(([f]) => P.parseBoardName(f)));
  rows.forEach(([f, exp], i) => {
    const p = parsed[i];
    const got = { seq: p.seq, species: p.species?.zh ?? null, grain: p.grain?.v ?? null, code: p.code, id: p.id, cat: p.catHint, hint: p.hint, flags: p.flags, finish: p.finish, raw: p.raw, series: p.series, seriesNo: p.seriesNo, name: p.name, copy: p.copySuffix, shared: p.sharedCode, size: p.size, variant: p.variant };
    for (const [k, v] of Object.entries(exp)) {
      if (k === 'warn') ok(p.warnings.includes(v), `${label} ${f}: 提醒 ${v}`, p.warnings.join(','));
      else if (k === 'nowarn') ok(!p.warnings.includes(v), `${label} ${f}: 没有提醒 ${v}`, p.warnings.join(','));
      else ok(eq(got[k] ?? null, v), `${label} ${f}: ${k}`, `${JSON.stringify(got[k])} ≠ ${JSON.stringify(v)}`);
    }
  });
  return parsed;
}

// 老板文件夹截图里的 15 个名字（SPEC §1）
table(
  [
    ['1号红橡乱纹.jpg', { seq: 1, species: '红橡', grain: 'crown', code: null, id: 'sail-1', cat: 'wood' }],
    // 同一个序号两块板：写了「号」的那个拿 sail-2，另一个 sail-2-b；两行都提醒（存之前员工要确认）
    ['2白橡直纹.jpg', { seq: 2, species: '白橡', grain: 'straight', code: null, id: 'sail-2-b', warn: 'seq-without-hao' }],
    ['2号红橡乱纹XA-TP-10.jpg', { seq: 2, species: '红橡', grain: 'crown', code: 'XA-TP-10', id: 'sail-2', warn: 'seq-duplicate' }],
    ['3号白蜡乱纹XA-TP-05.jpg', { seq: 3, species: '白蜡', grain: 'crown', code: 'XA-TP-05', id: 'sail-3' }],
    ['5号红樱桃乱纹.jpg', { seq: 5, species: '红樱桃', grain: 'crown', id: 'sail-5' }],
    ['6号红樱桃乱纹.jpg', { seq: 6, species: '红樱桃', grain: 'crown', id: 'sail-6' }],
    ['7号黑胡桃XA-TP-01.jpg', { seq: 7, species: '黑胡桃', grain: null, code: 'XA-TP-01', id: 'sail-7', shared: ['sail-8'] }],
    ['8号黑胡桃XA-TP-01.jpg', { seq: 8, species: '黑胡桃', grain: null, code: 'XA-TP-01', id: 'sail-8', shared: ['sail-7'] }],
    ['11号卡斯楠.jpg', { seq: 11, species: '卡斯楠', grain: null, id: 'sail-11' }],
    ['13号桦木乱纹素板.jpg', { seq: 13, species: '桦木', grain: 'crown', flags: ['plain'], id: 'sail-13' }],
    ['14号欧桦木乱纹.jpg', { seq: 14, species: '欧桦木', grain: 'crown', id: 'sail-14' }],
    ['15号卡斯楠.jpg', { seq: 15, species: '卡斯楠', id: 'sail-15' }],
    ['2810.jpg', { seq: null, code: '2810', cat: 'solid', hint: 'strong', id: 'sail-c2810' }],
    ['6162.jpg', { seq: null, code: '6162', cat: 'solid', id: 'sail-c6162' }],
    ['6165.jpg', { seq: null, code: '6165', cat: 'solid', id: 'sail-c6165' }],
  ],
  '真名'
);
// design/parse.mjs 的 12 个边界
table(
  [
    ['７号黑胡桃ＸＡ－ＴＰ－０１.JPG', { seq: 7, species: '黑胡桃', code: 'XA-TP-01' }],
    ['7号黑胡桃XA-TP-01 - 副本.jpg', { seq: 7, copy: true }],
    ['7号黑胡桃XA-TP-01(1).jpg', { seq: 7, copy: true }],
    ['板材贴图/20号白橡直纹肤感.jpeg', { seq: 20, species: '白橡', grain: 'straight', finish: 'softtouch' }],
    ['21号胡桃木纹同步.png', { seq: 21, species: '胡桃', raw: ['木纹'], flags: ['emboss'] }],
    ['22号沙比利.webp', { seq: 22, species: '沙比利' }],
    ['30号云杉直纹.jpg', { seq: 30, species: null, grain: 'straight', raw: ['云杉'] }],
    ['罗维尔素岩03野径.jpg', { seq: null, series: '罗维尔素岩', seriesNo: '03', name: '野径', cat: 'stone' }],
    ['MS-2810.jpg', { code: 'MS-2810' }],
    ['9号黑胡桃.tif', { seq: 9, warn: 'export-as-jpg' }],
    ['说明.pdf', { warn: 'not-an-image' }],
    ['新板材.jpg', { seq: null, warn: 'no-key', raw: ['新板材'] }],
  ],
  '边界'
);
// review/exp_parse.mjs 的 27 个（R7）
table(
  [
    ['1号红橡乱纹.jpg', { seq: 1, id: 'sail-1' }],
    ['2白橡直纹.jpg', { seq: 2, id: 'sail-2-b', warn: 'seq-duplicate' }],
    ['2号红橡乱纹XA-TP-10.jpg', { seq: 2, id: 'sail-2' }],
    ['7号黑胡桃XA-TP-01.jpg', { seq: 7, id: 'sail-7' }],
    ['8号黑胡桃XA-TP-01.jpg', { seq: 8, id: 'sail-8' }],
    ['2810.jpg', { code: '2810', id: 'sail-c2810', cat: 'solid' }],
    ['6162.jpg', { code: '6162', id: 'sail-c6162' }],
    ['P1.jpg', { code: 'P1', id: 'sail-cp1', cat: 'solid', seq: null }],
    ['6991.jpg', { code: '6991', cat: 'solid' }],
    ['9130.jpg', { code: '9130', cat: 'solid' }],
    ['AG033A.jpg', { code: 'AG033A', id: 'sail-cag033a', seq: null, nowarn: 'no-key' }],
    ['AK096AL.jpg', { code: 'AK096AL', nowarn: 'no-key' }],
    ['GKL018Y.jpg', { code: 'GKL018Y', cat: 'solid', series: '烤漆' }],
    ['XA-TP-02.jpg', { code: 'XA-TP-02', cat: 'wood', series: '木皮' }],
    ['XA-TP-03白橡直纹半透.jpg', { code: 'XA-TP-03', species: '白橡', grain: 'straight', flags: ['semi'], finish: 'matte' }],
    ['9号 黑胡桃乱纹.jpg', { seq: 9, species: '黑胡桃', grain: 'crown' }],
    ['16号白橡直纹 XA-TP-03.jpg', { seq: 16, code: 'XA-TP-03', species: '白橡' }],
    ['2810 墨绿.jpg', { seq: null, code: '2810', name: '墨绿', id: 'sail-c2810-b', warn: 'code-duplicate' }],
    ['2810-墨绿.jpg', { seq: null, code: '2810', name: '墨绿' }],
    ['6162鼠尾草.jpg', { seq: null, code: '6162', name: '鼠尾草' }],
    ['织系列-桑榆.jpg', { cat: 'weave', series: '织系列', name: '桑榆' }],
    ['编织膜墨染.jpg', { cat: 'weave', series: '织系列', name: '墨染' }],
    ['SG-BZ01.jpg', { code: 'SG-BZ01', cat: 'weave', series: '织系列' }],
    ['微信图片_20261019031800.jpg', { seq: null, code: null, name: null, raw: [], warn: 'name-lost' }],
    ['mmexport1697712345678.jpg', { name: null, warn: 'name-lost' }],
    ['IMG_20261019_0318.jpg', { name: null, warn: 'name-lost' }],
    ['s24.jpg', { seq: null, code: null, warn: 'no-key' }],
  ],
  'R7'
);
// 老板的完整文件夹（ref/NAMES.md）里的其他写法
table(
  [
    ['檀雾橡AG337.jpg', { code: 'AG337', name: '檀雾橡', species: '橡', cat: 'wood', hint: 'strong', id: 'sail-cag337' }],
    ['浅川橡02AG273.jpg', { code: 'AG273', variant: '02', name: '浅川橡 02', cat: 'wood' }],
    ['淡山云AK218AL.jpg', { code: 'AK218AL', name: '淡山云', cat: 'solid', hint: 'weak' }],
    ['沙岩杏AG368.jpg', { code: 'AG368', cat: 'solid', hint: 'weak' }],
    ['云岫洞石AG318.jpg', { code: 'AG318', cat: 'stone', hint: 'weak' }],
    ['秋夕胡桃AGM229E.jpg', { code: 'AGM229E', species: '胡桃', cat: 'wood' }],
    ['璞林AG305TD.jpg', { code: 'AG305TD', name: '璞林', cat: null }],
    ['素岩02AG285A.jpg', { code: 'AG285A', variant: '02', cat: 'stone' }],
    ['U702AK097AL.jpg', { code: 'U702AK097AL' }],
    ['GPC003绅士灰八角藤编.jpg', { code: 'GPC003', cat: 'weave', hint: 'strong', series: '藤编' }],
    ['XT011藤编.jpg', { code: 'XT011', cat: 'weave', series: '藤编' }],
    ['桑榆藤编.jpg', { cat: 'weave', name: '桑榆藤编', warn: 'no-key' }],
    ['云脚织AG306.jpg', { code: 'AG306', cat: 'weave', hint: 'weak', series: null }],
    ['深砚灰.jpg', { cat: 'solid', name: '深砚灰' }],
    ['白蜡乱纹XA-TP-06.jpg', { code: 'XA-TP-06', species: '白蜡', grain: 'crown', seq: null }],
    ['结疤白橡.jpg', { species: '白橡', flags: ['knot'] }],
    ['寂境-大板.jpg', { size: 'big', name: '寂境' }],
    ['寂境-小板.jpg', { size: 'small', name: '寂境', warn: 'small-sample' }],
    ['海洋板.jpg', { cat: null, name: '海洋板' }],
  ],
  '文件夹'
);
{
  const p = P.parseBoardName('C:\\Users\\某人\\Desktop\\板材贴图\\7号黑胡桃XA-TP-01.jpg');
  ok(p.file === '7号黑胡桃XA-TP-01.jpg' && !/[\\/]/.test(p.file), '只留文件名（路径里的用户名不进记录）', p.file);
  ok(P.basename('a/b\\c/7号.jpg') === '7号.jpg', 'basename');
  ok(P.naturalCompare('8号', '11号') < 0 && P.naturalCompare('2810', '6162') < 0, 'Windows 的顺序：8号 在 11号 前面');
  ok(P.isColourCode('2810') && P.isColourCode('P1') && !P.isColourCode('AG337') && !P.isColourCode('XA-TP-01'), '只有色号是客人看得到的编号');
  const d = P.displayName({ seq: 7, code: 'XA-TP-01', name: { zh: '黑胡桃', en: 'Black walnut' } });
  ok(d.zh === '7号 · 黑胡桃' && d.en === 'No. 7 · Black walnut', '显示名：7号 · 黑胡桃（厂家编号不在里面）', JSON.stringify(d));
  ok(P.displayName({ seq: null, code: 'AG337', name: { zh: '檀雾橡', en: '檀雾橡 · Oak' } }).zh === '檀雾橡', '颗粒板编号也不在客人的显示名里');
  ok(P.displayName({ seq: null, code: '2810', name: { zh: '', en: '' } }).zh === '2810 · 纯色', '色号：2810 · 纯色');
  ok(eq(P.boardName(P.parseBoardName('13号桦木乱纹素板.jpg')), { zh: '桦木乱纹素板', en: 'Birch, crown cut, plain board' }), '名字：认得的词翻成英文');
  ok(P.boardName(P.parseBoardName('深原胡桃AG359.jpg')).en === '深原胡桃 · Walnut', '诗意名字：中文原样 + 树种英文');
  const rec = { seq: 7, code: 'XA-TP-01', name: { zh: '黑胡桃', en: 'Black walnut' }, series: '木皮', file: '7号黑胡桃XA-TP-01.jpg' };
  ok(['7', '7号', 'No. 7', 'XA-TP-01', 'xatp01', '黑胡桃', 'walnut', '木皮'].every((q) => P.boardMatches(rec, q)) && !P.boardMatches(rec, '8号'), '搜索：序号 / 编号 / 名字都找得到');
}

// 词表的英文和词典一样（界面上 t() 翻出来的就是记录里的英文）
for (const e of [...V.SPECIES, ...V.GRAINS, ...V.FLAGS, ...V.FINISHES, ...V.KINDS, ...V.USES]) ok(EN[e.zh] === e.en, `词表「${e.zh}」的英文和词典一样`, `${EN[e.zh]} ≠ ${e.en}`);
for (const e of [...V.KIND_WORDS, ...V.SIZE_WORDS]) ok(EN[e.zh] != null, `词表「${e.zh}」有英文`);
for (const e of V.SERIES) ok(EN[e.zh] === e.en, `系列「${e.zh}」的英文和词典一样（${e.en}）`, String(EN[e.zh]));

// ───────────────────────── 2. id 第一次定下就不改（R8） ─────────────────────────
{
  const known = [
    { id: 'sail-2', seq: 4, file: '2白橡直纹.jpg', hash: '0f0f0f0f0f0f0f0f', px: [4880, 2440], hex: '#A78F6C' }, // 员工把序号 2 改成了 4
    { id: 'sail-c2810', seq: null, code: '2810', file: '2810.jpg', hash: 'aaaaaaaaaaaaaaaa', px: [2000, 2000], hex: '#2D453D' },
  ];
  const items = [P.parseBoardName('2白橡直纹.jpg'), P.parseBoardName('2号红橡乱纹XA-TP-10.jpg'), P.parseBoardName('2810 墨绿.jpg'), P.parseBoardName('6162.jpg')];
  items[0].hash = '0f0f0f0f0f0f0f0f';
  items[0].px = [4880, 2440];
  items[0].hex = '#A68F6C';
  items[1].hash = 'f0f0f0f0f0f0f0f0';
  items[2].hash = 'aaaaaaaaaaaaaaab'; // 换了名字的同一张图（指纹差 1 位）
  items[2].px = [2000, 2000];
  items[2].hex = '#2D453D';
  items[3].hash = 'aaaaaaaaaaaaaaaa'; // 指纹一样、大小一样，但颜色完全不一样（纯色板 dHash 都很像）→ 不是同一块
  items[3].px = [2000, 2000];
  items[3].hex = '#ACB196';
  P.assignIds(items, { known, taken: ['sail-2-b'] });
  ok(items[0].id === 'sail-2' && items[0].existing === 'sail-2', '重新导入同一张图：用原来的 id（序号改成 4 也一样）');
  ok(items[1].id === 'sail-2-c', '新的 2号：sail-2、sail-2-b 都被占了（删掉的 id 也不重用）→ sail-2-c', items[1].id);
  ok(items[2].id === 'sail-c2810' && items[2].existing === 'sail-c2810', '文件改名（2810 → 2810 墨绿）：同一块板，同一个 id', items[2].id);
  ok(items[3].id === 'sail-c6162' && !items[3].existing, '纯色板：指纹像但颜色不一样 → 不当成同一块');
  // 重新导入：同一批文件名、像素全换了（重新扫描过）→ 每块板认回原来的 id，不多出 -b（R8：像素认不出来再看序号 / 编号 / 文件名）
  {
    const H = (c) => c.repeat(16);
    const known = [
      { id: 'sail-1', seq: 1, code: '', file: '1号红橡乱纹.jpg', hash: H('1'), px: [4880, 2440], hex: '#523C35', kind: 'wood' },
      { id: 'sail-2', seq: 2, code: 'XA-TP-10', file: '2号红橡乱纹XA-TP-10.jpg', hash: H('2'), px: [4880, 2440], hex: '#3B3B3B', kind: 'wood' },
      { id: 'sail-2-b', seq: 2, code: '', file: '2白橡直纹.jpg', hash: H('3'), px: [4880, 2440], hex: '#A78F6C', kind: 'wood' },
      { id: 'sail-7', seq: 7, code: 'XA-TP-01', file: '7号黑胡桃XA-TP-01.jpg', hash: H('7'), px: [4880, 2440], hex: '#5E4433', kind: 'wood', fav: true },
      { id: 'sail-8', seq: 8, code: 'XA-TP-01', file: '8号黑胡桃XA-TP-01.jpg', hash: H('8'), px: [4880, 2440], hex: '#5E4232', kind: 'wood' },
      { id: 'sail-c2810', seq: null, code: '2810', file: '2810.jpg', hash: H('a'), px: [1000, 1000], hex: '#2E453D', kind: 'solid' },
      { id: 'sail-cag337', seq: null, code: 'AG337', file: '檀雾橡AG337.jpg', hash: H('b'), px: [2440, 1220], hex: '#8C8273', kind: 'wood' },
      { id: 'sail-c6991', seq: null, code: '6991', file: '6991.jpg', hash: '1355b193b3b3b3b3', px: [1000, 1000], hex: '#1C1C1C', kind: 'solid' },
    ];
    const files = [
      ['1号红橡乱纹.jpg', 'c'],
      ['2号红橡乱纹XA-TP-10.jpg', 'd'],
      ['2白橡直纹.jpg', 'e'],
      ['7号黑胡桃XA-TP-01.jpg', 'f'],
      ['7号黑胡桃XA-TP-01 - 副本.jpg', '7'], // 旧扫描的副本（像素和板材库里的 sail-7 一样）
      ['8号黑胡桃XA-TP-01.jpg', '9'],
      ['2810.jpg', '0'],
      ['2810(1).jpg', 'a'], // 旧的 2810 的副本
      ['檀雾橡AG337.jpg', '4'],
      ['6991.jpg', null], // 没换的图
      ['7023.jpg', null], // 另一块灰：和 6991 一样大、dHash 一样，颜色差 5
    ];
    const items = files.map(([f, c]) => Object.assign(P.parseBoardName(f), { hash: c ? H(c) : '1355b193b3b3b3b3', px: /^(2810|6991|7023)/.test(f) ? [1000, 1000] : f.startsWith('檀') ? [2440, 1220] : [4880, 2440], hex: f === '7023.jpg' ? '#212121' : f === '6991.jpg' ? '#1C1C1C' : '#777777' }));
    P.assignIds(items, { known, taken: [] });
    const by = Object.fromEntries(items.map((p) => [p.file, p]));
    for (const [f, id] of [['1号红橡乱纹.jpg', 'sail-1'], ['2号红橡乱纹XA-TP-10.jpg', 'sail-2'], ['2白橡直纹.jpg', 'sail-2-b'], ['7号黑胡桃XA-TP-01.jpg', 'sail-7'], ['8号黑胡桃XA-TP-01.jpg', 'sail-8'], ['2810.jpg', 'sail-c2810'], ['檀雾橡AG337.jpg', 'sail-cag337'], ['6991.jpg', 'sail-c6991']])
      ok(by[f].id === id && by[f].existing === id && !by[f].warnings.some((w) => /duplicate/.test(w)), `换了新图的 ${f} → 原来的 ${id}（rev + 1），没有「序号重复」`, `${by[f].id} ${by[f].matchedBy} ${by[f].warnings}`);
    ok(by['7号黑胡桃XA-TP-01.jpg'].matchedBy === 'keys' && by['6991.jpg'].matchedBy === 'pixels', '认回来的方式：新图靠序号 / 编号，没换的图靠像素');
    ok(!by['7号黑胡桃XA-TP-01 - 副本.jpg'].existing && by['7号黑胡桃XA-TP-01 - 副本.jpg'].warnings.includes('copy') && !by['2810(1).jpg'].existing && by['2810(1).jpg'].warnings.includes('copy'), '旧图的「副本」/「(1)」：原件在同一批里 → 不认领原来的 id（跳过）', `${by['7号黑胡桃XA-TP-01 - 副本.jpg'].id} ${by['2810(1).jpg'].id}`);
    ok(by['7023.jpg'].id === 'sail-c7023' && !by['7023.jpg'].existing, '7023（灰）和 6991 的像素指纹一样、颜色差 5 → 不是同一块，新的 sail-c7023', by['7023.jpg'].id);
    const newIds = items.filter((p) => !p.existing && !p.copySuffix).map((p) => p.id);
    ok(eq(newIds, ['sail-c7023']), '只多了 7023 这一块，没有 -b 的 id', JSON.stringify(newIds));
  }
  // 两块几乎一样的灰（纯色板）：编号不一样 → 一定不是同一块；没有编号时颜色要几乎一样（≤ 2）
  {
    const a = { hash: '1355b193b3b3b3b3', px: [1000, 1000], hex: '#1C1C1C', code: '6991', kind: 'solid' };
    const b = { hash: '1355b193b3b3b3b3', px: [1000, 1000], hex: '#1D1D1D', code: '7023', kind: 'solid' };
    ok(!P.samePixels(a, b) && !P.samePixels(b, a), '两块灰，编号不一样（6991 / 7023）→ 不是同一块（就算像素指纹和颜色都几乎一样）');
    ok(P.samePixels({ ...a, code: null }, { ...b, code: null }), '没有编号、颜色差 1 → 同一张图');
    ok(!P.samePixels({ ...a, code: null }, { ...b, code: null, hex: '#212121' }), '纯色、颜色差 5 → 不是同一块（木纹可以差到 6）');
    ok(P.samePixels({ ...a, kind: 'wood', code: null }, { ...b, kind: 'wood', code: null, hex: '#212121' }), '木纹：颜色差 5 还算同一张图');
    ok(!P.samePixels({ ...a, seq: 3, code: null, kind: 'wood' }, { ...b, seq: 4, code: null, kind: 'wood' }) && P.samePixels({ ...a, seq: 3, code: null, kind: 'wood', file: '3号.jpg' }, { ...b, seq: 4, code: null, kind: 'wood', file: '3号.jpg' }), '序号不一样 → 不是同一块（除非是同一个文件：员工在板材库里改过序号）');
    const mk = (f, hex) => ({ name: f, parsed: P.parseBoardName(f), res: { hash: '1355b193b3b3b3b3', px: [1000, 1000], kind: 'solid', stats: { hex } }, edits: {} });
    const rows = R.markDupes([mk('6991.jpg', '#1C1C1C'), mk('7023.jpg', '#1D1D1D')]);
    ok(!rows[0].dupOf && !rows[1].dupOf, '导入器：6991 和 7023 不会被当成「同一张图」跳过');
  }
  const x = P.assignIds([Object.assign(P.parseBoardName('IMG_0318.jpg'), { hash: '1234567890abcdef' })])[0];
  ok(x.id === 'sail-x12345678', '没名字的：sail-x + 像素指纹（换名字也不变）', x.id);
  ok(P.assignIds([P.parseBoardName('9号黑胡桃.tif')])[0].id === null, '.tif 不导入，不占 id');
}

// ───────────────────────── 3. 颜色 → 3D 的数字（在程序化材质上拟合的） ─────────────────────────
{
  let sl = 0;
  let sw = 0;
  let sm = 0;
  let n = 0;
  let nm = 0;
  for (const m of M.MATERIALS) {
    if (m.cat !== 'wood' && m.cat !== 'paint') continue;
    const d = D.deriveNumbers({ hex: m.color, kind: m.cat === 'wood' ? 'wood' : 'solid' });
    sl += (d.light - m.light) ** 2;
    sw += (d.warm - m.warm) ** 2;
    for (let i = 0; i < 3; i++) {
      sm += (d.mood[i] - m.mood[i]) ** 2;
      nm++;
    }
    n++;
  }
  const rl = Math.sqrt(sl / n);
  const rw = Math.sqrt(sw / n);
  const rm = Math.sqrt(sm / nm);
  ok(rl <= 0.05, `light rmse ≤ 0.05（${rl.toFixed(3)}）`);
  ok(rw <= 0.2, `warm rmse ≤ 0.2（${rw.toFixed(3)}）`);
  ok(rm <= 0.08, `mood rmse ≤ 0.08（${rm.toFixed(3)}）`);
  // 雷区的色系：和 colorTags.js 登记的一样（≥ 90 %）
  let agree = 0;
  let tot = 0;
  for (const m of M.MATERIALS) {
    if (!['wood', 'paint', 'stone', 'tile'].includes(m.cat)) continue;
    const fam = (COLOR_TAGS[m.id] || []).filter((t) => COLOR_FAMILIES.includes(t) && t !== 'grey' && t !== 'black');
    const got = D.tagsFor({ hex: m.color, kind: m.cat === 'wood' ? 'wood' : 'solid', light: m.light }).filter((t) => COLOR_FAMILIES.includes(t) && t !== 'grey' && t !== 'black');
    tot++;
    if (eq([...fam].sort(), [...got].sort())) agree++;
  }
  ok(agree / tot >= 0.9, `雷区色系和 colorTags.js 一样 ≥ 90 %（${agree}/${tot}）`);
  ok(D.tagsFor({ hex: '#5E4433', kind: 'wood', light: 0.22 }).includes('darkwood'), '深的木纹 = 深木色');
  ok(D.tagsFor({ hex: '#F4F2EE', kind: 'solid', finish: 'gloss' }).includes('glossy'), '亮光 = 亮面');
  ok(D.tagsFor({ hex: '#5E5D62', kind: 'stone' }).includes('concrete'), '石纹 = 水泥感');
  ok(D.tagsFor({ hex: '#A39384', kind: 'weave', series: '藤编' }).includes('rattan'), '藤编 = 藤编');
  ok(D.dE00([50, 2.6772, -79.7751], [50, 0, -82.7485]).toFixed(4) === '2.0425', 'CIEDE2000（Sharma 2005 的第一组）');
  // design/derive.mjs 的 15 块（老板文件夹截图的颜色）：快照
  const SNAP = [
    ['1号红橡乱纹', '#523C35', 'sail-1', 'wood', 0.18, 0.3, [0.44, 0.06, 0.78], ['darkwood'], 'walnut'],
    ['2白橡直纹', '#A78F6C', 'sail-2-b', 'wood', 0.56, 0.32, [0.69, 0.45, 0.25], [], 'light-oak'], // 不是人字拼（只是地板的铺法）
    ['2号红橡乱纹XA-TP-10', '#3B3B3B', 'sail-2', 'wood', 0.15, 0.01, [0.32, 0.04, 0.87], ['grey', 'darkwood'], 'ebony-oak'],
    ['3号白蜡乱纹XA-TP-05', '#D0D1CC', 'sail-3', 'wood', 0.82, 0.01, [0.37, 0.83, 0.08], ['grey'], 'maple'],
    ['5号红樱桃乱纹', '#441B10', 'sail-5', 'wood', 0.05, 0.63, [0.3, 0, 0.97], ['black', 'darkwood'], 'walnut'],
    ['6号红樱桃乱纹', '#47372C', 'sail-6', 'wood', 0.15, 0.23, [0.37, 0.03, 0.85], ['darkwood'], 'ebony-oak'],
    ['7号黑胡桃XA-TP-01', '#5E4433', 'sail-7', 'wood', 0.22, 0.37, [0.51, 0.1, 0.69], ['darkwood'], 'walnut'],
    ['8号黑胡桃XA-TP-01', '#5E4232', 'sail-8', 'wood', 0.22, 0.39, [0.51, 0.09, 0.7], ['darkwood'], 'walnut'],
    ['11号卡斯楠', '#2D282A', 'sail-11', 'wood', 0.06, 0.08, [0.2, 0, 1], ['black', 'darkwood'], 'ebony-oak'],
    ['13号桦木乱纹素板', '#A68C73', 'sail-13', 'wood', 0.55, 0.32, [0.7, 0.44, 0.25], [], 'greige-oak'],
    ['14号欧桦木乱纹', '#713B1B', 'sail-14', 'wood', 0.22, 0.81, [0.65, 0.08, 0.63], ['darkwood'], 'walnut'],
    ['15号卡斯楠', '#724227', 'sail-15', 'wood', 0.25, 0.69, [0.64, 0.11, 0.61], ['darkwood'], 'walnut'],
    ['2810', '#2D453D', 'sail-c2810', 'solid', 0.15, -0.15, [0.28, 0.04, 0.9], ['green'], 'olive'], // 墨绿 → 绿色系的漆，不是炭灰
    ['6162', '#ACB196', 'sail-c6162', 'solid', 0.65, 0.24, [0.63, 0.57, 0.17], ['green'], 'sage'],
    ['6165', '#7B7C5A', 'sail-c6165', 'solid', 0.42, 0.4, [0.7, 0.29, 0.39], ['green'], 'olive'],
  ];
  const ps = P.assignIds(SNAP.map(([n]) => P.parseBoardName(n + '.jpg')));
  SNAP.forEach(([name, hex, id, kind, light, warm, mood, tags, nearId], i) => {
    const d = D.deriveNumbers({ hex, kind });
    const got = [ps[i].id, ps[i].catHint || 'solid', d.light, d.warm, d.mood, D.tagsFor({ hex, kind, light: d.light }), D.nearestProcedural(d.lab, kind, M.MATERIALS).id];
    ok(eq(got, [id, kind, light, warm, mood, tags, nearId]), `15 块的快照：${name}`, JSON.stringify(got));
  });
}

// ───────────────────────── 4. 是什么板（R2）：老板的 5 张 + 合成的 6 张，11/11 ─────────────────────────
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/boards/features.json'), 'utf8'));
{
  let right = 0;
  for (const r of FX.rows) {
    const k = D.kindFromPixels(r);
    if (k === r.truth) right++;
    else ok(false, `像素判类别：${r.id} 应该是 ${r.truth}`, k);
  }
  ok(right === 11 && FX.rows.length === 11, `像素判类别 ${right}/11`);
  ok(FX.rows.every((r) => !/[\\/]/.test(r.id)) && !JSON.stringify(FX).includes('data:image'), '样板只有数字，没有像素');
  // 文件名 / 目录先说了算
  const s22 = FX.rows.find((r) => r.id === 'real-s22');
  ok(D.decideKind({ catalogKind: 'stone', hint: 'wood', hintStrength: 'strong', stats: s22 }).kind === 'stone', '目录 > 文件名');
  ok(D.decideKind({ hint: 'wood', hintStrength: 'strong', stats: s22 }).kind === 'wood', '文件名的树种词 > 像素');
  ok(D.decideKind({ hint: 'solid', hintStrength: 'weak', stats: FX.rows.find((r) => r.id === 'real-s24') }).kind === 'wood', '像素（有纹）> 名字里的弱提示');
  ok(D.decideKind({ catalogKind: 'solid', hint: 'weave', hintStrength: 'weak', stats: null }).kind === 'solid', '云脚织AG306：目录说是颗粒板布纹（纯色），不是编织膜');
  ok(D.decideKind({ stats: { Lstd: 5, LstdFine: 5, cohOverview: 0.4, cohFine: 0.4, perRows: 0.2, perCols: 0.2 } }).kind === 'ask', '认不出来 → ask（员工选）');
  // 纹的方向：横纹 → 转 90°
  ok(D.grainDir(FX.rows.find((r) => r.id === 'real-s24').grainDeg) === 'h' && D.grainDir(FX.rows.find((r) => r.id === 'synth-15号卡斯楠').grainDeg) === 'v' && D.grainDir(129) === 'diag', '纹向：横 / 竖 / 斜');
}

// ───────────────────────── 5. 尺寸（R5）+ 分辨率（R10） ─────────────────────────
{
  // s24：2000 × 929 横纹 → 顺纹竖放 929 × 2000 → 长边 2440、一个 px/mm
  const s24 = D.sizeOf({ kind: 'wood', w: 929, h: 2000 });
  ok(eq(s24.mm, [1133, 2440]) && s24.rule === 'aspect' && !s24.flag, `s24 → 1133 × 2440 mm（不拉伸）`, JSON.stringify(s24));
  const s23 = D.sizeOf({ kind: 'wood', w: 1479, h: 2000 });
  ok(eq(s23.mm, [1804, 2440]), 's23 → 1804 × 2440 mm', JSON.stringify(s23.mm));
  ok(Math.abs(s24.mm[0] / 929 - s24.mm[1] / 2000) < 0.002, '两个方向一样的 mm/px');
  ok(eq(D.sizeOf({ kind: 'wood', w: 1500, h: 1500 }).mm, [1220, 1220]), '方的、没有整板可比 → 长边 1220');
  const dens = D.batchDensity([
    { kind: 'wood', w: 2440, h: 4880 },
    { kind: 'wood', w: 2400, h: 4880 },
    { kind: 'wood', w: 2440, h: 4800 },
    { kind: 'solid', w: 1000, h: 1000 },
  ]);
  ok(near(dens, 4840 / 2440, 0.05), '同一批 3 张整板 → 像素密度', String(dens));
  ok(D.batchDensity([{ kind: 'wood', w: 2440, h: 4880 }, { kind: 'wood', w: 929, h: 2000 }, { kind: 'wood', w: 1479, h: 2000 }]) === null, '大小不一样的整板（聊天软件缩过）→ 不用密度');
  ok(eq(D.sizeOf({ kind: 'wood', w: 3000, h: 3000, density: 2 }).mm, [1500, 1500]), '3000² · 2 px/mm → 1500 mm');
  const big = D.sizeOf({ kind: 'wood', w: 3000, h: 3000, density: 0.5 });
  ok(big.mm[1] === 2800 && big.flag, '长边夹在 2800 以内，只记一个不出声的 flag', JSON.stringify(big));
  ok(eq(D.sizeOf({ kind: 'solid', w: 2000, h: 2000 }).mm, [600, 600]), '纯色 600 × 600');
  const wv = D.sizeOf({ kind: 'weave', w: 1019, h: 1468, period: 14 });
  ok(eq(wv.mm, [291, 419]) && wv.rule === 'weave', '编织：每半个循环（一次压挑）2 mm → s26 裁边后 ≈ 290 × 400 mm（R5）', JSON.stringify(wv.mm));
  ok(!('suggest' in s24) && !('suggestion' in big), '没有「建议尺寸」（R5：不缩小真实的胡桃）');
  // 分辨率：顺纹 256 / 1024，不放大，纯色最多 512
  ok(eq(T.tierDims(2440, 4880, 1024), [512, 1024]) && eq(T.tierDims(2440, 4880, 256), [128, 256]), '4880 × 2440 整板 → 512 × 1024 / 128 × 256');
  ok(eq(T.tierDims(929, 2000, 1024), [476, 1024]), 's24 → 476 × 1024（按原图比例）');
  ok(eq(T.tierDims(300, 600, 1024), [300, 600]), '不放大');
  ok(eq(T.tierDims(2000, 2000, 1024, { kind: 'solid' }), [512, 512]), '纯色 1024 档 = 512²');
  ok(eq(T.tierDims(4000, 1000, 1024), [1024, 256]), '很扁的图：横纹那边也不超过 1024');
  ok(T.gpuBytes([512, 1024]) === (512 * 1024 * 16) / 3, 'GPU 字节（RGBA8 + mipmap）');
}

// ───────────────────────── 6. 接缝（R3）：每个方向分开量，只烤横纹那一个方向 ─────────────────────────
{
  const s24 = FX.rows.find((r) => r.id === 'real-s24').seam;
  const seamOf = (x) => ({ ...x, ok: x.seam <= A.SEAM_RULE.ratio * x.inner + A.SEAM_RULE.eps });
  ok(!seamOf(s24.x).ok && seamOf(s24.y).ok, 's24：顺纹（原图左右）接不上，横纹（原图上下）接得上');
  const uv = A.seamUV({ x: seamOf(s24.x), y: seamOf(s24.y) }, 90);
  ok(uv.u === 'ok' && uv.v === 'fail', '转 90° 以后：u（横纹）ok，v（顺纹）fail → 3D 顺纹方向镜像接', JSON.stringify(uv));
  const s22 = FX.rows.find((r) => r.id === 'real-s22').seam;
  ok(seamOf(s22.x).ok && seamOf(s22.y).ok, 's22（纯色）两个方向都接得上');
  // 合成：左右不一样的图 → 只烤横纹方向，烤完左右两边接得上，中间不动
  const w = 64;
  const h = 32;
  const img = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    img[i] = img[i + 1] = img[i + 2] = Math.round((x / (w - 1)) * 200 + ((x * 7 + y * 3) % 11));
    img[i + 3] = 255;
  }
  const edgeGap = (a) => {
    let s = 0;
    for (let y = 0; y < h; y++) s += Math.abs(a[(y * w) * 4] - a[(y * w + w - 1) * 4]);
    return s / h;
  };
  const out = A.bakeAcross(img, w, h, 0.1);
  ok(edgeGap(img) > 150 && edgeGap(out) < 2, `烤完左右接得上（${edgeGap(img).toFixed(0)} → ${edgeGap(out).toFixed(0)}）`);
  ok(out[(10 * w + 32) * 4] === img[(10 * w + 32) * 4], '中间保持原样');
  // 板中间的记号（节疤）不会在两边留下影子：只动两边各 6 % 的一条带
  {
    const W2 = 400;
    const H2 = 8;
    const im = new Uint8ClampedArray(W2 * H2 * 4).fill(100);
    for (let y = 0; y < H2; y++) for (let x = 190; x < 210; x++) im[(y * W2 + x) * 4] = 250; // 中间一个红记号
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) im[(y * W2 + x) * 4 + 3] = 255;
    const o = A.bakeAcross(im, W2, H2, 0.06);
    let ghost = 0;
    let changed = 0;
    for (let y = 0; y < H2; y++)
      for (let x = 0; x < W2; x++) {
        const i = (y * W2 + x) * 4;
        if ((x < 60 || x > 340) && o[i] !== 100) ghost++;
        if (x >= 24 && x < W2 - 24 && o[i] !== im[i]) changed++;
      }
    ok(ghost === 0 && changed === 0, `中间的记号不会在两边出现影子；带子（6 %）以外一个像素都不动（影子 ${ghost}，动了 ${changed}）`);
  }
}

// ───────────────────────── 7. 像素统计 + 编织边框（R4）：合成图 ─────────────────────────
function rgba(w, h, f) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = f(x, y);
    const i = (y * w + x) * 4;
    a[i] = v[0];
    a[i + 1] = v[1];
    a[i + 2] = v[2];
    a[i + 3] = 255;
  }
  return { data: a, w, h };
}
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
{
  // 横纹木头：沿 x 方向的条纹（L 沿 y 起伏）
  const wood = (w, h) => rgba(w, h, (x, y) => {
    const s = 0.5 + 0.5 * Math.sin(y / 3.1 + Math.sin(x / 90) * 2) + (rnd() - 0.5) * 0.15;
    return [110 + 50 * s, 80 + 36 * s, 60 + 26 * s];
  });
  const solid = (w, h) => rgba(w, h, () => {
    const n = (rnd() - 0.5) * 3;
    return [172 + n, 177 + n, 150 + n];
  });
  const weaveFn = (border) => (x, y) => {
    const [l, t, r, b] = border;
    const inside = x >= l && x < W - r && y >= t && y < H - b;
    const sgn = inside ? 1 : -1;
    const u = (x / 12 + (sgn * y) / 16) * 2 * Math.PI;
    const cell = (Math.floor(x / 6) + Math.floor(y / 8)) % 2;
    const k = 0.5 + 0.35 * Math.sin(u) * (1 - 0.6 * cell) + 0.15 * cell + (rnd() - 0.5) * 0.04;
    return [150 - 110 * k, 132 - 100 * k, 122 - 96 * k];
  };
  const W = 600;
  const H = 800;
  const sW = A.statsOf(wood(512, 256), wood(512, 512));
  ok(D.kindFromPixels(sW) === 'wood' && D.grainDir(sW.grainDeg) === 'h', '合成横纹木头 → wood、横纹', JSON.stringify(sW));
  const sS = A.statsOf(solid(256, 256), solid(400, 400));
  ok(D.kindFromPixels(sS) === 'solid', '合成纯色 → solid', JSON.stringify(sS));
  const border = [47, 62, 55, 58];
  const wv = rgba(W, H, weaveFn(border));
  const cx = (W - 512) / 2;
  const cy = (H - 512) / 2;
  const fine = rgba(512, 512, (x, y) => {
    const i = ((y + cy) * W + x + cx) * 4;
    return [wv.data[i], wv.data[i + 1], wv.data[i + 2]];
  });
  const sV = A.statsOf(wv, fine);
  ok(D.kindFromPixels(sV) === 'weave', '合成编织 → weave', JSON.stringify(sV));
  ok(near(sV.period, 14, 2.5), '编织的循环 ≈ 14 px（横 12、竖 16）', String(sV.period));
  const bd = A.detectBorder(A.grey(wv.data, W, H), W, H);
  ok(near(bd.l, 47, 4) && near(bd.r, 55, 4) && near(bd.t, 62, 4) && near(bd.b, 58, 4), '编织小样的边框 47 / 55 / 62 / 58 ± 4 px', JSON.stringify(bd));
  const crop = A.weaveCrop(bd, sV.period, W, H);
  ok(crop[0] === bd.l + Math.round(sV.period) && crop[1] === bd.t + Math.round(sV.period), '裁切 = 边框 + 一个循环', JSON.stringify(crop));
  ok(near(FX.s26Border.l, 47, 4) && near(FX.s26Border.r, 55, 4) && near(FX.s26Border.t, 62, 4) && near(FX.s26Border.b, 58, 4), 's26（老板的织系列样板）量出来的边框 ± 4 px');
  const h1 = A.dhash64(A.grey(sW.data || wood(64, 32).data, 64, 32), 64, 32);
  ok(/^[0-9a-f]{16}$/.test(h1), 'dHash 64 位 = 16 位十六进制');
}

// ───────────────────────── 8. 目录种子 + 配对（R10：v1 不读 PDF） ─────────────────────────
const seedList = await SEED.loadSeed();
const IDX = CAT.indexSeed(seedList);
{
  ok(seedList.length === 147, `目录种子 147 条（${seedList.length}）`);
  const series = new Set(seedList.map((e) => e.series));
  ok(eq([...series].sort(), ['原木', '木皮', '烤漆', '织系列', '藤编', '颗粒板'].sort()), '只有板材类：颗粒板 · 烤漆 · 木皮 · 原木 · 织系列 · 藤编（台面 / 五金 / 玻璃不在里面）', [...series].join(','));
  ok(seedList.every((e) => ['wood', 'solid', 'stone', 'weave'].includes(e.kind) && e.code !== undefined), '每条都有类别');
  for (let i = 1; i <= 14; i++) ok(seedList.some((e) => e.code === `XA-TP-${String(i).padStart(2, '0')}`), `木皮 XA-TP-${String(i).padStart(2, '0')}`);
  for (let i = 1; i <= 25; i++) ok(seedList.some((e) => e.code === `XA-SM-${String(i).padStart(2, '0')}`), `原木 XA-SM-${String(i).padStart(2, '0')}`);
  for (const c of ['P1', '6991', '7068', '9130', '6186', '7031', '7050', '7052', '7023', '7045', '9172']) ok(seedList.some((e) => e.code === c), `烤漆色号 ${c}`);
  const m = (f) => CAT.matchCatalog(P.parseBoardName(f), IDX);
  const a = m('晓山白AG294.jpg');
  ok(a?.by === 'code' && a.fields.name === '晓山白' && a.fields.series === '颗粒板' && a.fields.kind === 'solid', 'AG294 ↔ AG294A/B/D（厚度后缀）', JSON.stringify(a?.fields));
  ok(m('浅川橡02AG273.jpg')?.fields.kind === 'wood', 'AG273 浅川橡 = 木纹');
  ok(m('沉云岩AG317.jpg')?.fields.kind === 'stone', 'AG317 沉云岩 = 石纹');
  ok(m('云脚织AG306.jpg')?.fields.kind === 'solid', 'AG306 云脚织 = 颗粒板布纹（纯色），不是编织膜');
  const b = m('2810.jpg');
  ok(b?.by === 'colour' && b.fields.series === '烤漆' && !b.fields.code, '2810 ↔ GKL001YJ「≈ 色号 2810」：系列建议，编号不换');
  const c = m('1号红橡乱纹.jpg');
  ok(c?.by === 'file' && c.fields.code === 'XA-TP-09' && c.fields.name === '红橡乱纹', '1号红橡乱纹 ↔ XA-TP-09（整理目录时认出来的，建议编号）', JSON.stringify(c?.fields));
  const d = m('桑榆藤编.jpg');
  ok(d?.by === 'name' && d.entry.key === 'woven-SG-BZ01' && d.fields.series === '织系列', '桑榆藤编 ↔ 织系列 桑榆 SG-BZ01');
  ok(m('7号黑胡桃XA-TP-01.jpg')?.fields.finish === 'matte' && m('5号红樱桃乱纹.jpg')?.fields.finish === 'satin', '表面：半透 = 哑光，封闭 = 缎面');
  ok(m('新板材.jpg') === null, '对不上就没有建议');
  ok(eq(CAT.catalogDiff({ code: 'AG294', name: { zh: '晓山白' }, series: '颗粒板', kind: 'solid', finish: 'matte' }, a), {}), '都一样 = 没有要采用的');
  const recs = [
    { id: 'sail-x1', name: { zh: '野径' }, code: 'AG237A' },
    { id: 'sail-7', seq: 7, name: { zh: '黑胡桃' }, code: 'XA-TP-01' },
    { id: 'sail-c2810', name: { zh: '' }, code: '2810' },
  ];
  ok(CAT.boardsForText('罗维尔素岩03野径', recs)[0]?.id === 'sail-x1', '「文件夹里提到：罗维尔素岩03野径」→ 野径');
  ok(CAT.boardsForText('XA-TP-01', recs)[0]?.id === 'sail-7' && CAT.boardsForText('7号', recs)[0]?.id === 'sail-7', '编号 / 序号也找得到');
}

// ───────────────────────── 9. 板材包：拆包、往返、检查、隐私 ─────────────────────────
function fakeWebp(w, h, pad = 64) {
  const n = 30 + pad;
  const b = new Uint8Array(n);
  b.set([82, 73, 70, 70]);
  const sz = n - 8;
  b[4] = sz & 255;
  b[5] = (sz >> 8) & 255;
  b[6] = (sz >> 16) & 255;
  b[7] = sz >>> 24;
  b.set([87, 69, 66, 80, 86, 80, 56, 76], 8);
  const cs = n - 20;
  b[16] = cs & 255;
  b[17] = (cs >> 8) & 255;
  b[18] = (cs >> 16) & 255;
  b[20] = 0x2f;
  const v = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  b[21] = v & 255;
  b[22] = (v >> 8) & 255;
  b[23] = (v >> 16) & 255;
  b[24] = (v >>> 24) & 255;
  for (let i = 25; i < n; i++) b[i] = (i * 31 + w) & 255;
  return b;
}
function board(id, extra = {}) {
  return {
    id,
    rev: 1,
    seq: null,
    code: '',
    file: `${id}.jpg`,
    name: { zh: id, en: id },
    kind: 'wood',
    finish: 'matte',
    hex: '#5E4433',
    dark: '#4C362A',
    light: 0.22,
    warm: 0.37,
    mood: [0.5, 0.1, 0.7],
    tags: ['darkwood'],
    mm: [1133, 2440],
    tiers: { 256: [119, 256], 1024: [476, 1024] },
    seam: { u: 'ok', v: 'fail' },
    uses: ['cabinetry', 'feature'],
    hash: '0123456789abcdef',
    img: true,
    ...extra,
  };
}
function imagesFor(recs, pad = 2000) {
  const m = new Map();
  for (const r of recs) {
    m.set(PK.imageKey(r.id, 1024), fakeWebp(r.tiers[1024][0], r.tiers[1024][1], pad));
    m.set(PK.imageKey(r.id, 256), fakeWebp(r.tiers[256][0], r.tiers[256][1], pad / 8));
    m.set(PK.imageKey(r.id, 'chip'), fakeWebp(128, 128, 200));
  }
  return m;
}
{
  ok(eq(PK.webpInfo(fakeWebp(476, 1024)), { w: 476, h: 1024, type: 'lossless' }), 'WebP 文件头：VP8L 的宽高');
  ok(PK.webpInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(40).fill(0)])) === null, 'JPEG 不是 WebP');
  const recs = Array.from({ length: 12 }, (_, i) => board(`sail-${i + 1}`, { seq: i + 1 }));
  const imgs = imagesFor(recs, 120000);
  const parts = PK.buildPacks({ records: recs, images: imgs, max: 600 * 1024, date: new Date(2026, 9, 24) });
  ok(parts.length > 1, `拆成 ${parts.length} 份`);
  ok(parts.every((p) => p.bytes <= 600 * 1024), '每份都 ≤ 上限（base64 之后）', parts.map((p) => p.bytes).join(','));
  ok(eq(parts.flatMap((p) => p.ids).sort(), recs.map((r) => r.id).sort()) && new Set(parts.flatMap((p) => p.ids)).size === recs.length, '每块板只在一份里');
  ok(parts[0].name === `WISH-boards-20261024-p1of${parts.length}.json` && PK.partName(1, 1, new Date(2026, 9, 24)) === 'WISH-boards-20261024.json', '文件名 WISH-boards-YYYYMMDD[-p1ofN].json');
  let roundTrip = true;
  for (const p of parts) {
    const r = PK.readPack(p.text);
    ok(r.ok && r.rejected.length === 0 && r.boards.length === p.ids.length, `第 ${p.name} 份单独读得出来`);
    for (const b of r.boards) for (const t of PK.IMAGE_TIERS) {
      const a = r.images.get(PK.imageKey(b.id, t)).bytes;
      const o = imgs.get(PK.imageKey(b.id, t));
      if (a.length !== o.length || a.some((v, i) => v !== o[i])) roundTrip = false;
    }
  }
  ok(roundTrip, '往返：每张图一个字节都不差');
  const big = PK.buildPacks({ records: recs, images: imgs, date: new Date(2026, 9, 24) });
  ok(big.length === 1, '默认 20 MB：一份装得下');
  // 隐私：只有 basename，没有白名单外的字段
  const leaky = board('sail-99', { file: 'C:\\Users\\某人\\Desktop\\板材贴图\\7号.jpg', path: '/Users/x/板材贴图/7号.jpg', owner: 'x' });
  const one = PK.buildPacks({ records: [leaky], images: imagesFor([leaky]) })[0];
  const doc = JSON.parse(one.text);
  ok(doc.boards[0].file === '7号.jpg' && !('path' in doc.boards[0]) && !('owner' in doc.boards[0]), '包里的记录：只有文件名、没有路径和别的字段');
  ok(!/Users|Desktop|板材贴图\\\\/.test(JSON.stringify(doc.boards)), '包里找不到路径');
  // 检查
  const bad = JSON.parse(one.text);
  bad.images['sail-99/1024'] = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
  const rb = PK.readPack(JSON.stringify(bad));
  ok(rb.boards.length === 0 && rb.rejected[0]?.id === 'sail-99' && /WebP/.test(rb.rejected[0].zh), '不是 WebP 的图 → 这块板不导入');
  const dims = JSON.parse(one.text);
  dims.images['sail-99/1024'] = PK.bytesToDataURL(fakeWebp(500, 1000));
  ok(PK.readPack(JSON.stringify(dims)).rejected[0]?.zh === '贴图大小和记录对不上', '图的大小和记录对不上 → 不导入');
  ok(PK.readPack('{"kind":"wish-cases","v":1}').errors[0]?.zh === '这是案例包，请在案例库里导入', '案例包 → 说清楚');
  ok(PK.readPack('not json').errors.length === 1, '读不出来的文件');
  ok(!PK.validateBoard(board('sail-w', { kind: 'weave', uses: ['cabinetry'] })).ok, '编织只是资料：不能用在柜体上');
  ok(!PK.validateBoard(board('sail-u', { uses: ['woodwork'] })).ok, '活动家具不能用板材（R1）');
  ok(!PK.validateBoard(board('Sail 7')).ok && !PK.validateBoard(board('sail-f', { file: 'a/b.jpg' })).ok, 'id / 文件名不对 → 不合格');
  ok(PK.newer({ rev: 2 }, { rev: 1 }) && !PK.newer({ rev: 1 }, { rev: 1 }) && PK.newer({ rev: 1 }, { rev: 1 }, { force: true }), 'rev 高的赢；一样高要 force');
}

// ───────────────────────── 10. 这台设备的板材库（Node 里用内存） ─────────────────────────
{
  DEV._resetDevice();
  // 测试自己编的板用保留的前缀 sail-t-（导入器永远不会给出这种 id）：合进真实板材以后也不会撞到随网站的那份
  const r1 = board('sail-t-501', { seq: 501, name: { zh: '测试板', en: 'Test board' } });
  const p1 = PK.buildPacks({ records: [r1], images: imagesFor([r1]) })[0];
  const s1 = await DEV.importPacks([p1.text]);
  ok(s1.added === 1 && M.MAT_BY_ID['sail-t-501']?.board?.src === 'device', '导入板材包 → 马上进材质库（src: device）', JSON.stringify(s1));
  ok(M.MAT_BY_ID['sail-t-501'].zh === '501号 · 测试板', '显示名');
  const s2 = await DEV.importPacks([p1.text]);
  ok(s2.skipped === 1 && s2.added === 0, '同一个包再导一次：跳过');
  const up = await DEV.updateDeviceBoard('sail-t-501', { fav: true });
  ok(up.rev === 2 && M.MAT_BY_ID['sail-t-501'].board.fav, '星标：rev + 1，马上生效');
  ok((await DEV.deviceImage('sail-t-501', 1024))?.size > 0, '贴图存在这台设备上');
  const ex = await DEV.exportPacks();
  ok(ex.length === 1 && ex[0].ids[0] === 'sail-t-501', '导出这台设备的板');
  await DEV.deleteDeviceBoards(['sail-t-501']);
  ok(!M.MAT_BY_ID['sail-t-501'] && (await DEV.knownIds()).has('sail-t-501'), '删掉：材质库里没有了，id 记住不重用');
  DEV._resetDevice();
}

// ───────────────────────── 11. 一行 → 一条记录（导入器） ─────────────────────────
{
  const p = P.parseBoardName('7号黑胡桃XA-TP-01.jpg');
  const row = {
    key: 'k',
    name: p.file,
    parsed: p,
    proposal: CAT.matchCatalog(p, IDX),
    edits: {},
    id: 'sail-7',
    res: { kind: 'wood', rot: 90, crop: [0, 0, 0, 0], px: [2000, 929], hash: '0123456789abcdef', stats: { hex: '#614D3F', dark: '#5A4639', period: 0 }, seam: { u: 'ok', v: 'fail' }, tiers: { 256: [119, 256], 1024: [476, 1024] }, decided: { by: 'name' } },
  };
  const rec = R.buildRecord(row, { materials: M.MATERIALS, at: '2026-10-24' });
  ok(rec && PK.validateBoard(rec).ok, '记录合格', JSON.stringify(PK.validateBoard(rec || {}).errors));
  ok(eq(rec.mm, [1133, 2440]) && rec.sizeRule === 'aspect' && rec.rot === 90 && rec.proc === 'walnut' && rec.near === 'walnut', '尺寸 / 转向 / 近似色木纹', JSON.stringify([rec.mm, rec.rot, rec.proc, rec.near]));
  ok(eq(rec.uses, ['cabinetry', 'feature']) && rec.name.zh === '黑胡桃' && rec.series === '木皮', '默认：柜体 · 门 + 墙板；名字来自文件名（目录建议没采用前不改）');
  ok(R.buildRecord({ ...row, edits: { accept: true } }, { materials: M.MATERIALS }).name.zh === '黑胡桃乱纹', '采用目录建议 → 目录的名字');
  ok(R.buildRecord({ ...row, edits: { accept: true, name: { zh: '7号板', en: 'Board 7' } } }, { materials: M.MATERIALS }).name.zh === '7号板', '员工改的 > 目录建议');
  ok(eq(R.buildRecord({ ...row, edits: { kind: 'weave' } }, { materials: M.MATERIALS }).uses, []), '编织：不能用在任何表面');
  ok(eq(R.buildRecord({ ...row, edits: { kind: 'stone' } }, { materials: M.MATERIALS }).uses, ['feature']), '石纹：先只做墙板');
  ok(R.buildRecord({ ...row, edits: { skip: true } }) === null, '不导入的不出记录');
  const nameless = { ...row, parsed: P.parseBoardName('IMG_0318.jpg'), proposal: null, edits: {} };
  ok(R.needsName(nameless) && R.buildRecord(nameless, { materials: M.MATERIALS }) === null && R.rowWarnings(nameless).includes('need-name'), '没名字、没序号、没编号：先起名字才存');
  ok(R.buildRecord({ ...nameless, edits: { name: { zh: '烟灰橡', en: 'Smoky oak' } } }, { materials: M.MATERIALS })?.name.zh === '烟灰橡', '起了名字就能存');
  const ex = { ...rec };
  ok(R.buildRecord({ ...row, existingRec: ex }, { materials: M.MATERIALS }).rev === 1, '和存过的一样：rev 不变');
  ok(R.buildRecord({ ...row, existingRec: ex, edits: { fav: true } }, { materials: M.MATERIALS }).rev === 2, '改了：rev + 1');
  // 目录建议：「全部采用」只用编号 / 色号对上的；编号永远只用文件名里的；英文名不被中文盖掉
  {
    const mkRow = (f, res = {}) => {
      const pp = P.parseBoardName(f);
      return { key: f, name: pp.file, parsed: pp, proposal: CAT.matchCatalog(pp, IDX), edits: {}, id: 'sail-t-x', res: { kind: 'wood', rot: 0, crop: [0, 0, 0, 0], px: [2440, 1220], hash: '0123456789abcdef', stats: { hex: '#A68C73', dark: '#9A8068', period: 0 }, seam: { u: 'ok', v: 'fail' }, tiers: { 256: [128, 256], 1024: [512, 1024] }, decided: { by: 'name' }, ...res } };
    };
    const birch = mkRow('13号桦木乱纹素板.jpg');
    ok(birch.proposal?.by === 'file' && !R.sureProposal(birch.proposal), '13号桦木乱纹素板 → 目录「欧桦乱纹 XA-TP-13」是猜的（按文件名）');
    const rowAcc = { ...birch, edits: { accept: 'row' } };
    ok(R.valueOf(rowAcc, 'code') === 'XA-TP-13' && R.valueOf(rowAcc, 'name').zh === '欧桦乱纹' && R.valueOf(rowAcc, 'name').en === 'European birch, crown cut', '一行一行按「采用」：目录的编号 + 名字，英文从目录名字里认得的词来', JSON.stringify(R.valueOf(rowAcc, 'name')));
    const bulk = { ...birch, edits: { accept: 'bulk' } };
    ok(R.valueOf(bulk, 'code') === '', '「全部采用」：文件名里没有的编号不加', R.valueOf(bulk, 'code'));
    const walnut = mkRow('7号黑胡桃XA-TP-01.jpg');
    ok(R.sureProposal(walnut.proposal) && R.valueOf({ ...walnut, edits: { accept: 'bulk' } }, 'code') === 'XA-TP-01', '编号对上的：「全部采用」照样（编号本来就在文件名里）');
    ok(R.valueOf({ ...walnut, edits: { accept: 'bulk' } }, 'name').en === 'Black walnut, crown cut', '采用目录名字「黑胡桃乱纹」→ 英文 Black walnut, crown cut（不是中文）', R.valueOf({ ...walnut, edits: { accept: 'bulk' } }, 'name').en);
    const sand = mkRow('沙棕橡AK167A.jpg', { stats: { hex: '#957253', dark: '#8A694B', period: 0 } });
    ok(/^沙棕橡 · Sandy light oak$/.test(R.valueOf({ ...sand, edits: { accept: 'bulk' } }, 'name').en), '诗意名字 + 目录的 look：沙棕橡 · Sandy light oak', R.valueOf({ ...sand, edits: { accept: 'bulk' } }, 'name').en);
    const pine = mkRow('深松.jpg', { stats: { hex: '#2B2724', dark: '#221F1C', period: 0 } });
    ok(!R.sureProposal(pine.proposal) && /^深松 · /.test(R.valueOf(pine, 'name').en) && /[A-Za-z]/.test(R.valueOf(pine, 'name').en), '只有中文的名字：英文界面「深松 · 说明」', R.valueOf(pine, 'name').en);
    const rec2 = R.buildRecord({ ...pine, edits: { name: { zh: '烟灰橡', en: '' } } }, { materials: M.MATERIALS });
    ok(/^烟灰橡 · [A-Z]/.test(rec2.name.en) && !R.hasEnglish(rec2.name) && R.hasEnglish({ zh: '黑胡桃', en: 'Black walnut' }), '员工起的中文名：存的英文 =「中文 · 说明」，「没有英文名」筛选找得到它', rec2.name.en);
    // 颗粒板的石纹（沉云岩AG317、云岫洞石AG318）：柜体也能做；别的石纹先只做墙板
    const rock = mkRow('沉云岩AG317.jpg', { kind: 'stone', stats: { hex: '#4F555C', dark: '#454A50', period: 0 } });
    ok(eq(R.valueOf(rock, 'uses'), ['cabinetry', 'feature']), '颗粒板石纹（编号对上目录）：默认柜体 · 门 + 墙板', JSON.stringify(R.valueOf(rock, 'uses')));
    const recRock = R.buildRecord(rock, { materials: M.MATERIALS });
    ok(M.MATERIALS.find((m) => m.id === recRock.near)?.cat === 'paint', '柜体也用的石纹板：near 是漆（柜体放不了石材）', recRock.near);
    ok(eq(R.defaultUses('stone', ''), ['feature']) && eq(R.defaultUses('stone', '颗粒板'), ['cabinetry', 'feature']), '别的石纹先只做墙板');
    // near 不会是人字拼（地板的铺法），色相相同优先
    const oak = R.buildRecord(mkRow('2白橡直纹.jpg', { stats: { hex: '#A78F6C', dark: '#9A8262', period: 0 } }), { materials: M.MATERIALS });
    ok(oak.near && !M.MATERIALS.find((m) => m.id === oak.near).tex.pattern && M.MATERIALS.find((m) => m.id === oak.near).tex.species === 'oak', '直纹白橡：near 是不拼花的橡木', oak.near);
    const green = D.nearestProcedural(D.hexLab('#2E453D'), 'solid', M.MATERIALS, { tags: ['green'] });
    ok(['sage', 'sage-lacquer', 'olive', 'verde'].includes(green.id), '墨绿 2810：near 在绿色系里（不是炭灰）', green.id);
    const grey = D.nearestProcedural(D.hexLab('#8C8273'), 'wood', M.MATERIALS, { proc: 'oak', tags: [] });
    ok(['greige-oak', 'smoked-oak'].includes(grey.id), '灰调橡木（檀雾橡）：near 是灰调 / 烟熏橡木（不是胡桃）', grey.id);
  }
  // 重新导入（新的扫描图，认回原来的 id）：员工以前确认过的资料照旧，只换图（rev + 1）
  {
    const pp = P.parseBoardName('2白橡直纹.jpg');
    const ex = { id: 'sail-2-b', rev: 3, seq: 4, code: 'XA-TP-03', name: { zh: '白橡直纹', en: 'White oak, rift cut' }, series: '木皮', kind: 'wood', finish: 'satin', uses: ['feature'], fav: true, hidden: false, hex: '#A78F6C' };
    const row = { key: 'r', name: pp.file, parsed: pp, proposal: CAT.matchCatalog(pp, IDX), edits: {}, id: 'sail-2-b', existing: 'sail-2-b', existingRec: ex, res: { kind: 'wood', rot: 90, crop: [0, 0, 0, 0], px: [4880, 2440], hash: 'abcdefabcdefabcd', stats: { hex: '#B09670', dark: '#A08660', period: 0 }, seam: { u: 'ok', v: 'fail' }, tiers: { 256: [128, 256], 1024: [512, 1024] }, decided: { by: 'name' } } };
    const got = ['seq', 'code', 'series', 'finish', 'uses', 'fav'].map((k) => R.valueOf(row, k));
    ok(eq(got, [4, 'XA-TP-03', '木皮', 'satin', ['feature'], true]) && R.valueOf(row, 'name').en === 'White oak, rift cut', '重新导入：序号 / 编号 / 系列 / 表面 / 用在哪 / ★ / 英文名都用板材库里的', JSON.stringify(got));
    const rec = R.buildRecord(row, { materials: M.MATERIALS });
    ok(rec.id === 'sail-2-b' && rec.rev === 4 && rec.hash === 'abcdefabcdefabcd' && rec.seq === 4, '新图 → 同一个 id，rev + 1', JSON.stringify([rec.id, rec.rev, rec.seq]));
  }
  // 搜索：数字找序号 / 色号（一模一样），P1 找编号，短的不看文件名
  {
    const recs = [{ seq: 23, name: { zh: '测试', en: 'Test' } }, { seq: null, code: '', file: '微信图片_20261019032300.jpg', name: { zh: '烟熏胡桃', en: '' } }, { code: '7023', name: { zh: '', en: '' } }, { seq: 2, code: 'XA-TP-10', name: { zh: '红橡乱纹' } }, { seq: 13, code: 'XA-TP-13' }, { code: 'P1' }];
    const hit = (q) => recs.filter((r) => P.boardMatches(r, q)).map((r) => r.seq ?? r.code);
    ok(eq(hit('23号'), [23]) && eq(hit('23'), [23]), '「23号」只找 23 号（不找文件名里的 …032300、色号 7023）', JSON.stringify(hit('23号')));
    ok(eq(hit('2号'), [2]) && eq(hit('7023'), ['7023']), '「2号」只找 2 号；「7023」找色号', JSON.stringify(hit('2号')));
    ok(eq(hit('P1'), ['P1']) && eq(hit('p1'), ['P1']), '「P1」只找编号 P1（不找 XA-TP-10 / 13）', JSON.stringify(hit('P1')));
    ok(eq(hit('XA-TP'), [2, 13]) && eq(hit('烟熏'), ['']) , '编号的一段、名字照样找得到', JSON.stringify(hit('XA-TP')));
  }
  // 同一张图两份：原件留着，副本跳过
  const mk = (f, hash) => ({ name: f, parsed: P.parseBoardName(f), res: { hash, px: [10, 10], stats: { hex: '#111111' } }, edits: {} });
  const rows = R.markDupes([mk('7号黑胡桃XA-TP-01 - 副本.jpg', 'ffffffffffffffff'), mk('7号黑胡桃XA-TP-01.jpg', 'ffffffffffffffff')]);
  ok(rows[0].dupOf === '7号黑胡桃XA-TP-01.jpg' && !rows[1].dupOf, '同一张图：副本跳过，原件留着');
}

// ───────────────────────── 12. 合并脚本（scripts/import-boards.mjs）：临时文件夹 ─────────────────────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wish-boards-'));
  const lib = path.join(tmp, 'library.js');
  const out = path.join(tmp, 'public');
  fs.writeFileSync(lib, MERGE.libraryText([]));
  const recs = [board('sail-1', { seq: 1 }), board('sail-c2810', { code: '2810', kind: 'solid', tiers: { 256: [256, 256], 1024: [512, 512] }, mm: [600, 600] })];
  const pack1 = path.join(tmp, 'p1.json');
  fs.writeFileSync(pack1, PK.buildPacks({ records: recs, images: imagesFor(recs) })[0].text);
  // --dry：什么都不写
  const dry = await MERGE.planMerge({ packs: [pack1], out, library: lib, metaOnly: false, dry: true, force: false, remove: [] });
  ok(dry.ok && dry.summary.added.length === 2 && !fs.existsSync(out), '--dry：算出要新增 2 块，什么都没写');
  // 完整合并
  const r1 = await MERGE.planMerge({ packs: [pack1], out, library: lib, metaOnly: false, force: false, remove: [] });
  MERGE.writeMerge({ out, library: lib }, r1.plan);
  ok(fs.existsSync(path.join(out, 'sail-1/1024.webp')) && fs.existsSync(path.join(out, 'sail-1/256.webp')) && fs.existsSync(path.join(out, 'sail-1/chip.webp')), '贴图写到 public/boards/<id>/{256,1024,chip}.webp');
  let L = await MERGE.readLibrary(lib);
  ok(L.length === 2 && L.every((r) => r.img === true) && L[0].id === 'sail-1', '记录合进 library.js（木纹在前），img: true');
  ok(L.every((r) => !('file' in r) && !('px' in r) && !('at' in r) && !('crop' in r)), '公开的 library.js 没有原来的文件名 / 像素大小 / 裁切 / 日期（隐私：员工的文件名里可能有客人的名字）');
  ok(L.every((r) => /^[0-9a-f]{8}$/.test(r.v || '')) && L[0].v === MERGE.imageVersion({ 1024: fs.readFileSync(path.join(out, 'sail-1/1024.webp')), 256: fs.readFileSync(path.join(out, 'sail-1/256.webp')), chip: fs.readFileSync(path.join(out, 'sail-1/chip.webp')) }), 'v = 写出去的 WebP 的指纹（网址的 ?v=）', JSON.stringify(L.map((r) => r.v)));
  ok(MERGE.validateLibrary(L, { out }).ok, '合完：library.js 和 public/boards/ 对得上（每块板三张 WebP，大小和记录一样）', MERGE.validateLibrary(L, { out }).errors.join('；'));
  // rev：一样的跳过，高的赢
  const r2 = await MERGE.planMerge({ packs: [pack1], out, library: lib, metaOnly: false, force: false, remove: [] });
  ok(r2.summary.skipped.length === 2 && r2.summary.added.length === 0, '同一个包再合一次：rev 没有更高 → 跳过');
  const v2 = [board('sail-1', { seq: 1, rev: 2, fav: true })];
  const pack2 = path.join(tmp, 'p2.json');
  fs.writeFileSync(pack2, PK.buildPacks({ records: v2, images: imagesFor(v2) })[0].text);
  const r3 = await MERGE.planMerge({ packs: [pack2], out, library: lib, metaOnly: false, force: false, remove: [] });
  MERGE.writeMerge({ out, library: lib }, r3.plan);
  L = await MERGE.readLibrary(lib);
  ok(r3.summary.updated[0] === 'sail-1' && L.find((r) => r.id === 'sail-1').fav === true && L.length === 2, 'rev 2 盖过 rev 1，别的板不动');
  ok(MERGE.validateLibrary(L, { out }).ok && L.find((r) => r.id === 'sail-1').v === MERGE.imageVersion({ 1024: fs.readFileSync(path.join(out, 'sail-1/1024.webp')), 256: fs.readFileSync(path.join(out, 'sail-1/256.webp')), chip: fs.readFileSync(path.join(out, 'sail-1/chip.webp')) }), '再合一次（换了图）：v 跟着新的图');
  const r3b = await MERGE.planMerge({ packs: [pack1], out, library: lib, metaOnly: false, force: true, remove: [] });
  ok(r3b.summary.skipped.includes('sail-1'), 'rev 低的包：force 也不盖（只有一样高才用 force）');
  // 坏的 WebP：什么都不写
  const badDoc = JSON.parse(fs.readFileSync(pack2, 'utf8'));
  badDoc.boards[0].rev = 3;
  badDoc.images['sail-1/1024'] = 'data:image/webp;base64,' + Buffer.from('RIFFxxxxWEBPnope').toString('base64');
  const pack3 = path.join(tmp, 'p3.json');
  fs.writeFileSync(pack3, JSON.stringify(badDoc));
  const before = fs.readFileSync(lib, 'utf8');
  const r4 = await MERGE.planMerge({ packs: [pack3], out, library: lib, metaOnly: false, force: false, remove: [] });
  ok(!r4.ok && r4.rejected[0]?.id === 'sail-1' && fs.readFileSync(lib, 'utf8') === before, '坏的 WebP → 不合格，什么都没写');
  // --meta-only：只合资料（没有贴图的新板 img: false；网站上已经有同一张图的老板照样 img: true）
  const v3 = [board('sail-c6162', { code: '6162', kind: 'solid', tiers: { 256: [256, 256], 1024: [512, 512] }, mm: [600, 600], hex: '#ACB196' }), board('sail-1', { seq: 1, rev: 4 })];
  const pack4 = path.join(tmp, 'p4.json');
  fs.writeFileSync(pack4, PK.buildPacks({ records: v3, images: imagesFor(v3) })[0].text);
  const r5 = await MERGE.planMerge({ packs: [pack4], out, library: lib, metaOnly: true, force: false, remove: [] });
  MERGE.writeMerge({ out, library: lib }, r5.plan);
  L = await MERGE.readLibrary(lib);
  ok(L.find((r) => r.id === 'sail-c6162').img === false && !fs.existsSync(path.join(out, 'sail-c6162')), '--meta-only：新板只有资料（img: false），没写贴图');
  ok(L.find((r) => r.id === 'sail-1').img === true && L.find((r) => r.id === 'sail-1').rev === 4, '--meta-only：网站上已经有同一张图 → img 还是 true');
  ok(L.find((r) => r.id === 'sail-1').v && !('v' in L.find((r) => r.id === 'sail-c6162')), '--meta-only：图没换 → v 留着；没有图的板没有 v');
  ok(MERGE.validateLibrary(L, { out }).ok, '--meta-only 之后照样对得上（img: false 的板不需要图）', MERGE.validateLibrary(L, { out }).errors.join('；'));
  // --remove = 隐藏（id 永远不删）
  const r6 = await MERGE.planMerge({ packs: [], out, library: lib, metaOnly: false, force: false, remove: ['sail-c2810'] });
  MERGE.writeMerge({ out, library: lib }, r6.plan);
  L = await MERGE.readLibrary(lib);
  ok(L.find((r) => r.id === 'sail-c2810')?.hidden === true && L.find((r) => r.id === 'sail-c2810').rev === 2, '--remove：设成隐藏、rev + 1，记录还在');
  ok(/^export const LIBRARY = \[\n {2}\{"id":"sail-1"/m.test(fs.readFileSync(lib, 'utf8')), 'library.js 一条一行（diff 好看）');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// 一份合进来的板材库（5 块 + public/boards 的图）对得上；少了图、大小不对、带了文件名 → 查得出来
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wish-boards-lib-'));
  const out = path.join(tmp, 'boards');
  const recs = [
    board('sail-t-1', { seq: 1 }),
    board('sail-t-2', { seq: 2, hex: '#A78F6C' }),
    board('sail-t-c2810', { code: '2810', kind: 'solid', tiers: { 256: [256, 256], 1024: [512, 512] }, mm: [600, 600], hex: '#2E453D' }),
    board('sail-t-cag318', { code: 'AG318', kind: 'stone', hex: '#B9B2A6' }),
    board('sail-t-csgbz01', { code: 'SG-BZ01', kind: 'weave', uses: [], mm: [290, 400], tiers: { 256: [192, 256], 1024: [768, 1024] }, hex: '#62554F' }),
  ];
  const imgs = imagesFor(recs, 64);
  for (const [k, b] of imgs) {
    const [id, t] = k.split('/');
    fs.mkdirSync(path.join(out, id), { recursive: true });
    fs.writeFileSync(path.join(out, id, `${t}.webp`), b);
  }
  const lib = recs.map((r) => MERGE.leanRecord(r));
  const v = MERGE.validateLibrary(lib, { out });
  ok(v.ok, '5 块板 + 15 张 WebP：对得上', v.errors.join('；'));
  ok(eq(MERGE.validateLibrary([...lib, lib[0]], { out }).errors.map((e) => e.split('：')[1]), ['id 重复']), 'id 重复 → 查得出来');
  ok(MERGE.validateLibrary([{ ...lib[0], file: 'IMG_0001.jpg' }], { out }).errors.some((e) => e.includes('file')), '公开的板材库带了原来的文件名 → 查得出来');
  fs.rmSync(path.join(out, 'sail-t-2/chip.webp'));
  ok(MERGE.validateLibrary(lib, { out }).errors.some((e) => e.includes('sail-t-2') && e.includes('chip.webp')), '少了一张图 → 查得出来');
  fs.writeFileSync(path.join(out, 'sail-t-1/1024.webp'), fakeWebp(400, 1024));
  ok(MERGE.validateLibrary(lib, { out }).errors.some((e) => e.includes('sail-t-1') && e.includes('400 × 1024')), '图的大小和记录不一样 → 查得出来');
  ok(MERGE.validateLibrary([{ ...lib[1], img: false }], { out }).ok, 'img: false（只有资料）的板不需要图');
  // 往返：这 5 块打成板材包 → 合进一个空的 library.js → 读回来一样（只少了不公开的字段）
  const lib2 = path.join(tmp, 'library.js');
  fs.writeFileSync(lib2, MERGE.libraryText([]));
  const pk = path.join(tmp, 'p.json');
  fs.writeFileSync(pk, PK.buildPacks({ records: recs, images: imagesFor(recs, 64) })[0].text);
  const out2 = path.join(tmp, 'boards2');
  const plan = await MERGE.planMerge({ packs: [pk], out: out2, library: lib2, metaOnly: false, force: false, remove: [] });
  MERGE.writeMerge({ out: out2, library: lib2 }, plan.plan);
  const back = await MERGE.readLibrary(lib2);
  const strip = (r) => JSON.stringify(Object.fromEntries(Object.entries(MERGE.leanRecord(r)).filter(([k]) => k !== 'v').sort()));
  ok(back.length === 5 && recs.every((r) => strip(back.find((b) => b.id === r.id)) === strip(r)) && MERGE.validateLibrary(back, { out: out2 }).ok, '往返：板材包 → library.js → 读回来一样', JSON.stringify(back.map((b) => b.id)));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// 随网站的板材库（src/shared/boards/library.js + public/boards/）：出厂是空的；负责人用 import-boards.mjs 合进真实板材以后也要对得上
{
  const { LIBRARY } = await import('../src/shared/boards/library.js');
  const pub = path.join(ROOT, 'public/boards');
  const v = MERGE.validateLibrary(LIBRARY, { out: pub });
  ok(Array.isArray(LIBRARY) && v.ok, `随网站的板材库（${LIBRARY.length} 块）每条合格、id 不重复、没有文件名，贴图都在 public/boards/`, v.errors.slice(0, 5).join('；'));
  // （用合成的板材库跑的那一遍 —— test/fixtures/boards/merged.mjs —— library.js 换掉了，public/boards/ 没换：这一项不查）
  const dirs = fs.existsSync(pub) ? fs.readdirSync(pub).filter((f) => !f.startsWith('.')) : [];
  const ids = new Set(LIBRARY.map((r) => r.id));
  if (!process.env.WISH_MERGED_LIBRARY) ok(dirs.every((d) => ids.has(d)), 'public/boards/ 里没有板材库以外的图（空的板材库 = 一张都没有）', dirs.filter((d) => !ids.has(d)).join(', '));
  ok(LIBRARY.every((r) => !String(r.id).startsWith('sail-t-')), '随网站的板材库里没有测试用的 id（sail-t-…）');
  const fx = path.join(ROOT, 'test/fixtures/boards');
  ok(fs.readdirSync(fx).every((f) => /\.(json|m?js)$/.test(f)), 'test/fixtures/boards 里只有数字和代码（没有图片）');
}

console.log(`${failed ? '✗' : '✓'} 溪岸板材 · 导入器：${passed} 项通过${failed ? `，${failed} 项没过` : ''}`);
if (failed) process.exit(1);
