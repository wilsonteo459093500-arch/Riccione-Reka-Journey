// Excel 导出：每个模板 full / empty 都能生成，重新打开后结构正确；文件语言 中文 / English / 中英
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ExcelJS from 'exceljs';
import { buildDocModel } from '../src/lib/docmodel.js';
import { exportXlsx } from '../src/lib/export/xlsx.js';
import { createReport } from '../src/lib/report.js';
import { labelText } from '../src/lib/lang.js';
import { allItems, resolveScale, normOptions } from '../src/templates/schema.js';
import { fillReport, sampleMedia, mediaLoader, imageSize, SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fixtures.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, 'out');
mkdirSync(OUT, { recursive: true });
const LOGO = readFileSync(join(DIR, '..', 'public', 'sail-logo.png'));

const FILES = ['measurement', 'preInstall', 'siteNotice', 'dailyReport', 'qualityCheck', 'finalInspection', 'handover'];

async function load(name) {
  try {
    return (await import(`../src/templates/${name}.js`)).default;
  } catch {
    return null;
  }
}

async function roundTrip(template, variant) {
  const report = fillReport(template, variant);
  const model = buildDocModel({ template, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
  const blob = await exportXlsx(model, mediaLoader(sampleMedia()), { logo: LOGO });
  const buf = Buffer.from(await blob.arrayBuffer());
  writeFileSync(join(OUT, `${template.id}-${variant}.xlsx`), buf);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return { wb, buf, model };
}

export const tests = [];

for (const name of FILES) {
  tests.push([`${name}：full / empty 导出并能重新打开`, async () => {
    const t = await load(name);
    if (!t) return;
    for (const variant of ['full', 'empty']) {
      const { wb, buf, model } = await roundTrip(t, variant);
      assert.ok(buf.length > 5000, `${t.id} ${variant} 文件太小`);
      assert.equal(wb.worksheets.length, 2);
      const [sheet, data] = wb.worksheets;
      assert.equal(data.name, '数据 Data');
      // 标题在报告页前几行
      const texts = [];
      sheet.eachRow((row) => row.eachCell((c) => texts.push(typeof c.value === 'object' && c.value?.richText ? c.value.richText.map((x) => x.text).join('') : String(c.value ?? ''))));
      assert.ok(texts.some((s) => s.includes(model.meta.title.zh)), `${t.id} 报告页缺标题`);
      // 数据页的检查项行数 = 模板检查项数
      const items = allItems(t).length;
      if (items) {
        const af = typeof data.autoFilter === 'string' ? data.autoFilter : '';
        const m = /^A(\d+):J(\d+)$/.exec(af);
        assert.ok(m, `${t.id} 数据页缺筛选范围（${af}）`);
        const n = Number(m[2]) - Number(m[1]);
        assert.equal(n, items, `${t.id} 数据页应有 ${items} 行检查项，实际 ${n}`);
      }
      if (variant === 'full') {
        const imgs = sheet.getImages();
        assert.ok(imgs.length > 1, `${t.id} full 应有照片（实际 ${imgs.length}）`);
        for (const im of imgs) {
          assert.ok(im.range.tl.nativeCol >= 0 && im.range.tl.nativeCol < 8, '图片锚点越界');
        }
      }
    }
  }]);
}

// ---------- 报告页读取小工具 ----------
const textOf = (v) => (v && typeof v === 'object' && v.richText ? v.richText.map((x) => x.text).join('') : v == null ? '' : String(v));
const colNo = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

/** 报告页所有非空格子：{ row, col, right, text }（right = 合并区域的最右列） */
function cellsOf(ws) {
  const right = new Map();
  for (const m of ws.model.merges || []) {
    const [, c1, r1, c2] = /^([A-Z]+)(\d+):([A-Z]+)\d+$/.exec(m);
    right.set(`${r1}:${colNo(c1)}`, colNo(c2));
  }
  const out = [];
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (c, col) => {
      const text = textOf(c.value);
      // 合并区域只取主格（其余格的 value 也会返回主格内容）
      if (text && c.master.address === c.address) out.push({ row: r, col, right: right.get(`${r}:${col}`) || col, text, cell: c });
    });
  });
  return out;
}
const widthOf = (ws, c1, c2) => {
  let s = 0;
  // exceljs 不写宽 9 的列（当作默认列宽），读回来是 undefined
  for (let c = c1; c <= c2; c += 1) s += ws.getColumn(c).width ?? 9;
  return s;
};

async function exportSheet(template, report, media = sampleMedia()) {
  const model = buildDocModel({ template, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
  const blob = await exportXlsx(model, mediaLoader(media), { logo: LOGO });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  return { wb, ws: wb.worksheets[0], model };
}
const maxRowHeight = (ws) => {
  let max = 0;
  ws.eachRow({ includeEmpty: true }, (row) => { max = Math.max(max, row.height || 0); });
  return max;
};

tests.push(['长备注 / 多行文字切成续行：不顶到 409pt 行高上限，一个字都不丢', async () => {
  // 质检：1225 字备注（H 列）+ END 标记；英文长备注不在单词 / 编号中间断开
  const qc = await load('qualityCheck');
  const item = qc.sections.find((s) => s.type === 'checklist').items.find((i) => !i.input);
  const base = '现场检查发现柜门铰链松动需要重新调整并复检确认安装位置正确';
  const cjk = base.repeat(Math.ceil(1225 / base.length)).slice(0, 1225) + '【END-QC】';
  const en = Array.from({ length: 70 }, (_, i) => `Z${String(i + 1).padStart(3, '0')} left door gap too wide, hinge adjusted and re-sealed.`).join(' ');
  for (const note of [cjk, en]) {
    const report = fillReport(qc, 'full');
    report.items[item.id] = { ...report.items[item.id], r: 'F', note };
    const { ws } = await exportSheet(qc, report);
    assert.ok(maxRowHeight(ws) < 409, `行高顶到上限 ${maxRowHeight(ws)}（文字会被截）`);
    const parts = cellsOf(ws).filter((c) => c.col === 8 && note.includes(c.text));
    assert.ok(parts.length > 1, '长备注应切成多行');
    assert.equal(parts.map((c) => c.text).join(''), note, '续行拼起来应等于原备注');
    // 续行：检查项格写「（续）」，序号格留空
    const r2 = parts[1].row;
    assert.equal(textOf(ws.getCell(r2, 2).value), '（续）');
    assert.equal(textOf(ws.getCell(r2, 1).value), '');
    for (const p of parts.slice(0, -1)) assert.ok(!/[!-~]$/.test(p.text) || !/^[!-~]/.test(parts[parts.indexOf(p) + 1].text), `英文 / 编号被切断：…${p.text.slice(-8)}`);
  }
  // 日报：55 行短句的「今日内容」
  const daily = await load('dailyReport');
  const report = fillReport(daily, 'full');
  report.values.todayWork = Array.from({ length: 55 }, (_, i) => `${i + 1}号柜OK`).join('\n') + '\nEND-DAILY';
  const { ws } = await exportSheet(daily, report);
  assert.ok(maxRowHeight(ws) < 409, `行高顶到上限 ${maxRowHeight(ws)}`);
  const parts = cellsOf(ws).filter((c) => c.col === 3 && c.right === 8 && /号柜OK|END-DAILY/.test(c.text));
  assert.ok(parts.length > 1, '多行文字应切成多行');
  assert.equal(parts.map((c) => c.text).join('\n'), report.values.todayWork);
  // 终检整改表：超长问题描述
  const fi = await load('finalInspection');
  const r3 = fillReport(fi, 'full');
  r3.tables.rectification[0].desc = cjk;
  const out = await exportSheet(fi, r3);
  assert.ok(maxRowHeight(out.ws) < 409, `整改表行高顶到上限 ${maxRowHeight(out.ws)}`);
  const descParts = cellsOf(out.ws).filter((c) => c.text.length > 1 && cjk.includes(c.text));
  assert.equal(descParts.map((c) => c.text).join(''), cjk);
}]);

tests.push(['结果统计：长值整行显示，小卡片不会太窄，标签和值都放得下', async () => {
  for (const [name, variant] of [['measurement', 'full'], ['handover', 'full'], ['handover', 'empty'], ['preInstall', 'full'], ['finalInspection', 'full']]) {
    const t = await load(name);
    const { ws, model } = await exportSheet(t, fillReport(t, variant));
    const sum = model.blocks.find((b) => b.type === 'summary');
    const cells = cellsOf(ws);
    for (const it of sum.items) {
      const value = String(it.value);
      const label = it.label.zh;
      if (value.length > 22) {
        // 整行：标签 A:B，值 C:H
        const v = cells.find((c) => c.text === value);
        assert.ok(v, `${t.id} 缺统计值 ${label}`);
        assert.equal(v.col, 3, `${t.id}「${label}」应整行显示（C 列起）`);
        assert.equal(v.right, 8);
        assert.ok(textOf(ws.getCell(v.row, 1).value).startsWith(label), `${t.id}「${label}」标签不见了`);
      } else {
        const tile = cells.find((c) => c.text.endsWith(`\n${value}`) && c.text.startsWith(label));
        assert.ok(tile, `${t.id} 缺统计卡片 ${label}`);
        assert.ok(widthOf(ws, tile.col, tile.right) >= 22, `${t.id}「${label}」卡片太窄（${widthOf(ws, tile.col, tile.right)} 字）`);
        // 行高够放标签 + 值（各至少一行）
        assert.ok(ws.getRow(tile.row).height >= 34, `${t.id}「${label}」卡片行太矮`);
      }
    }
  }
}]);

tests.push(['标签 / 表头算进行高；整改表有行号 #；照片组标签不挤在 A 列', async () => {
  // 质检：「区域（厨房 / 衣柜 / 其他）Area (Kitchen / Wardrobe / Other)」在窄格 E:F，中英文各要两行
  const qc = await load('qualityCheck');
  const { ws } = await exportSheet(qc, fillReport(qc, 'full'));
  const area = cellsOf(ws).find((c) => c.text.startsWith('区域（厨房'));
  assert.equal(area.col, 5);
  assert.ok(ws.getRow(area.row).height >= 44, `区域标签行太矮（${ws.getRow(area.row).height}pt）`);

  // 终检整改表：A 列行号，表头从 B 起，照片组标签占 A:B
  const fi = await load('finalInspection');
  const out = await exportSheet(fi, fillReport(fi, 'full'));
  const cells = cellsOf(out.ws);
  const loc = cells.find((c) => c.text.startsWith('位置（柜体/区域）'));
  assert.equal(loc.col, 2, '表格列应从 B 列起');
  assert.equal(textOf(out.ws.getCell(loc.row, 1).value), '#');
  assert.ok(out.ws.getRow(loc.row).height >= 28);
  const nums = [1, 2, 3].map((i) => cells.find((c) => c.col === 1 && c.text === String(i) && c.row > loc.row));
  assert.ok(nums.every(Boolean), '整改表缺行号');
  for (const g of cells.filter((c) => c.text.startsWith('复验照片') || c.text.startsWith('问题照片'))) {
    if (g.row > loc.row) assert.equal(g.right, 2, '照片组标签应占 A:B');
  }

  // 交付清单 empty：没照片的媒体字段，两行标签的行高不能是 18pt
  const ho = await load('handover');
  const e = await exportSheet(ho, fillReport(ho, 'empty'));
  const media = cellsOf(e.ws).find((c) => c.text.startsWith('产品验收照'));
  assert.ok(e.ws.getRow(media.row).height >= 28, `空媒体字段行太矮（${e.ws.getRow(media.row).height}pt）`);
}]);

tests.push(['整改表：问题描述不挤进窄格，只在列比格多时合并短列，合并格的中英文表头都不丢', async () => {
  const fi = await load('finalInspection');
  const { ws, model } = await exportSheet(fi, fillReport(fi, 'full'));
  const cells = cellsOf(ws);
  const hr = cells.find((c) => c.col === 1 && c.text === '#').row;
  const heads = cells.filter((c) => c.row === hr && c.col > 1);
  // 问题描述（width 2，主要内容）至少 22 字宽（之前被挤到 15 字的 D 列，英文长描述最后一行被截）
  const desc = heads.find((c) => c.text.includes('问题描述'));
  assert.ok(widthOf(ws, desc.col, desc.right) >= 22, `问题描述列太窄（${widthOf(ws, desc.col, desc.right)} 字）`);
  assert.ok(!desc.text.split('\n')[0].includes(' / '), '问题描述不该和别的列合并');
  // 8 列 → 7 格：只合并一次；合并格的英文表头和中文一一对应（之前「复验 / 关闭日」只写了 Re-inspection）
  assert.equal(heads.length, 7);
  for (const h of heads) {
    const [zh, en] = h.text.split('\n');
    assert.equal(zh.split(' / ').length, en.split(' / ').length, `表头中英文对不上：${h.text}`);
  }
  // 每列的值都在（合并格写成「列名：值」）
  const table = model.blocks.find((b) => b.type === 'table');
  const first = cells.filter((c) => c.row === hr + 1).map((c) => c.text).join('\n');
  for (const col of table.columns) {
    const v = table.rows[0].cells[col.key];
    if (v) assert.ok(first.includes(v), `整改第 1 项缺「${col.label.zh}」：${v}`);
  }
}]);

tests.push(['行高够实际排版用：英文按单词折行、大写 / 数字更宽、9.5pt 按 13px 算（LibreOffice 实测）', async () => {
  // NEED = LibreOffice 24.2 对同样文字、同样列宽 / 字号算出的最佳行高（pt）。
  // 以前按「1 个英文字母 = 1 个单位、不考虑单词换行」估，下面几种行高不够，最后几行掉出格子底部。
  const EN = ['Left door gap too wide; hinge adjusted and re-sealed with silicone.', 'Customer asked to check the right drawer runner, noisy when closing.', 'Factory to supply a new wardrobe top panel, ETA next Tuesday.'];
  const WORDS = ['hinge', 'door', 'gap', 'adjusted', 'silicone', 'panel', 'drawer', 'runner', 'wardrobe', 'kitchen', 'carcass', 'misaligned', 'replaced', 'factory', 'sealed'];
  const CASES = [
    // 质检 H 列备注（24 字宽，9pt）
    ['remark', EN.concat(EN).join(' '), 169.4],
    ['remark', EN.map((s) => s.toUpperCase()).join(' '), 113.4],
    ['remark', Array.from({ length: 40 }, (_, i) => `${WORDS[i % WORDS.length]}${i + 100}`).join(' '), 202.95],
    ['remark', 'A'.repeat(300), 169.4],
    ['remark', '现场检查发现柜门铰链松动需要重新调整并复检确认安装位置正确'.repeat(8), 204.45],
    // 日报「今日内容」（C:H，10pt）
    ['field', Array.from({ length: 6 }, () => 'SITE CLEARED, ALL CABINETS INSTALLED, DOORS ALIGNED, HANDLES FITTED, PROTECTIVE FILM REMOVED.').join(' '), 97],
    // 终检整改表问题描述（22 字宽，9.5pt）
    ['desc', [0, 1, 2, 0].map((i) => EN[i]).join(''), 156.7],
    ['desc', [0, 1, 2, 0, 1, 2].map((i) => EN[i]).join(''), 228.35],
  ];
  const qc = await load('qualityCheck');
  const item = qc.sections.find((s) => s.type === 'checklist').items.find((i) => !i.input);
  const daily = await load('dailyReport');
  const fi = await load('finalInspection');
  for (const [where, text, need] of CASES) {
    let out;
    if (where === 'remark') {
      const report = fillReport(qc, 'full');
      report.items[item.id] = { ...report.items[item.id], r: 'F', note: text };
      out = await exportSheet(qc, report);
    } else if (where === 'field') {
      const report = fillReport(daily, 'full');
      report.values.todayWork = text;
      out = await exportSheet(daily, report);
    } else {
      const report = fillReport(fi, 'full');
      report.tables.rectification[0].desc = text;
      out = await exportSheet(fi, report);
    }
    const c = cellsOf(out.ws).find((x) => x.text === text);
    assert.ok(c, `${where} 文字不完整（被切开了？）：${text.slice(0, 30)}…`);
    if (where === 'desc') assert.ok(widthOf(out.ws, c.col, c.right) >= 22);
    const h = out.ws.getRow(c.row).height;
    assert.ok(h >= need, `${where} 行高 ${h}pt < 实际需要 ${need}pt：${text.slice(0, 40)}…`);
  }
}]);

tests.push(['视频没封面 / 照片都删了：字段标签照样写，注明「请见群组 / 照片缺失」', async () => {
  const t = await load('dailyReport');
  const report = fillReport(t, 'full');
  report.values.progressPhotos = ['gone1', 'gone2'];
  const media = sampleMedia();
  media.set('m_video', { ...media.get('m_video'), poster: null, thumb: null });
  const { ws } = await exportSheet(t, report, media);
  const cells = cellsOf(ws);
  const video = cells.find((c) => c.text.startsWith('退场视频'));
  assert.ok(video, '退场视频标签不见了');
  assert.equal(textOf(ws.getCell(video.row, 3).value), '▶ 视频（0:42）请见群组');
  const photos = cells.find((c) => c.text.startsWith('今日进度照'));
  assert.ok(photos, '今日进度照标签不见了');
  assert.match(textOf(ws.getCell(photos.row, 3).value), /照片缺失/);
}]);

tests.push(['每个图片锚点都指向它自己的图（exceljs 相邻同图锚点错位）', async () => {
  // 两个签名角色用同一张签名图（m_sig）→ exceljs 4.4.0 会把第二个指到别的照片
  for (const name of FILES) {
    const t = await load(name);
    if (!t) continue;
    const { wb, ws } = await exportSheet(t, fillReport(t, 'full'));
    const imgs = ws.getImages();
    for (const im of imgs) {
      const { buffer } = wb.getImage(Number(im.imageId));
      const s = imageSize(Buffer.from(buffer));
      const want = im.range.ext.width / im.range.ext.height;
      assert.ok(Math.abs(want - s.w / s.h) / (s.w / s.h) < 0.05, `${t.id} 第 ${im.range.tl.nativeRow + 1} 行的图片锚点指错了图（锚点比例 ${want.toFixed(2)}，图片 ${s.w}×${s.h}）`);
    }
    const sigs = imgs.filter((im) => Math.abs(im.range.ext.width / im.range.ext.height - 3) < 0.05);
    if (sigs.length) assert.ok(sigs.every((im) => wb.getImage(Number(im.imageId)).extension === 'png'), `${t.id} 签名格显示的不是签名图`);
  }
}]);

tests.push(['有条件开工（warn）用琥珀色，与 NO-GO（fail）区分', async () => {
  const t = await load('preInstall');
  const report = fillReport(t, 'full');
  report.items.pis_01 = { ...report.items.pis_01, r: 'COND' };
  const { ws } = await exportSheet(t, report);
  const tile = cellsOf(ws).find((c) => c.text.startsWith('开工判定（已选）'));
  assert.ok(tile, '缺开工判定卡片');
  assert.equal(tile.cell.fill.fgColor.argb, 'FFFBF3E1');
  assert.equal(tile.cell.value.richText[1].font.color.argb, 'FFB7791F');
}]);

tests.push(['缺媒体 / 无 logo / 控制字符 不报错', async () => {
  const t = await load('qualityCheck');
  const report = fillReport(t, 'full');
  report.items.qc1.note = 'bad\u0007char\u0000';
  const model = buildDocModel({ template: t, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
  const blob = await exportXlsx(model, { get: async () => null });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  assert.equal(wb.worksheets[0].getImages().length, 0);
}]);

// ============================================================
// 文件语言：中文 'zh' / English 'en' / 中英 'both'
// ============================================================
const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]/;
const CJK_RUN = /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]+/g;

// ---------- 英文内容的报告（项目 / 人名 / 备注 / 照片说明全用英文写，用户数据里没有中文） ----------
const EN_PROJECT = {
  id: 'p_en',
  name: 'Seri Maya Condo',
  client: 'Mr Tan',
  unit: 'B-12-3',
  address: 'Seri Maya Condo, Block B, 12-3, Jalan Seri Maya, 47100 Puchong',
  mapLink: 'https://maps.app.goo.gl/demo',
  so: 'SO-2026-1001',
  designer: 'Rachel Lim',
  startDate: '2026-10-08',
  plannedDays: 5,
  entryNote: 'Register at the guard house with IC',
  parking: 'Basement visitor bays',
};
const EN_SETTINGS = { name: 'Jason Lee', phone: '012-3456789', dept: 'Installation Team', company: 'Sail by Riccione Reka', docLang: 'en' };
const EN_LONG = Array.from({ length: 40 }, (_, i) => `Z${String(i + 1).padStart(3, '0')} left door gap too wide, hinge adjusted and re-sealed.`).join(' ');

/** 按模板结构填一份「用户内容全英文」的报告；long = 第一个判定项写超长备注（出续行） */
function englishReport(template, { long = false } = {}) {
  const report = createReport(template, { project: EN_PROJECT, settings: EN_SETTINGS });
  report.lang = 'en';
  let n = 0;
  const photo = () => `m_photo${(n++ % 7) + 1}`;
  const textFor = (f) => {
    const t = f.type;
    if (t === 'date') return '2026-10-09';
    if (t === 'time') return '09:00';
    if (t === 'number') return 3;
    if (t === 'tel') return '012-3456789';
    if (t === 'url') return 'https://drive.google.com/drive/folders/demo';
    if (t === 'yesno') return 'Y';
    if (t === 'list') return ['Lay floor protection first', 'Clear rubbish daily'];
    if (t === 'textarea') return 'Shoe cabinet and wardrobe carcasses installed.\nSite cleaned, protection intact.';
    if (['select', 'radio'].includes(t)) return normOptions(f.options)[0]?.v ?? '';
    if (t === 'chips') {
      const opts = normOptions(f.options).map((o) => o.v);
      return f.multiple ? [...opts.slice(0, 2), 'Balcony cabinet'] : opts[0];
    }
    return `Sample ${f.key}`;
  };
  let first = true;
  for (const s of template.sections) {
    if (s.type === 'fields') {
      for (const f of s.fields) {
        if (f.type === 'photos') report.values[f.key] = [photo(), photo()];
        else if (f.type === 'video') report.values[f.key] = 'm_video';
        else report.values[f.key] = textFor(f);
      }
    }
    if (s.type === 'checklist') {
      s.items.forEach((it, idx) => {
        if (it.input) {
          report.items[it.id] = { value: textFor(it.input), photos: idx % 3 === 0 ? [photo()] : [] };
          return;
        }
        const opts = resolveScale(it.scale || s.scale).options;
        const r = opts.length > 1 && idx % 4 === 3 ? opts[1].v : opts[0].v;
        const note = long && first ? EN_LONG : idx % 4 === 3 ? 'Gap 3mm too wide, adjusted on site' : '';
        first = false;
        report.items[it.id] = { r, note, photos: idx % 3 === 0 ? [photo()] : [] };
      });
    }
    if (s.type === 'table') {
      report.tables[s.id] = [0, 1].map((i) => {
        const row = { photos: [] };
        for (const slot of s.photoSlots || []) row[slot.key] = [photo()];
        for (const c of s.columns) {
          if (['select', 'radio', 'chips'].includes(c.type)) row[c.key] = normOptions(c.options)[i]?.v ?? '';
          else if (c.type === 'date') row[c.key] = `2026-10-1${i}`;
          else row[c.key] = `Kitchen wall cabinet ${i + 1}`;
        }
        return row;
      });
    }
    if (s.type === 'signatures') {
      s.roles.forEach((r, i) => {
        report.signatures[r.id] = { name: ['Ahmad', 'Jason Lee', 'Rachel Lim'][i % 3], date: '2026-10-09', image: 'm_sig' };
      });
    }
  }
  // 自动带入的「工地称呼」带全角括号（核心 siteLabel），这里按用户自己输入英文的样子写
  for (const [k, v] of Object.entries(report.values)) {
    if (typeof v === 'string' && CJK.test(v)) report.values[k] = 'Seri Maya Condo B-12-3 (Mr Tan)';
  }
  return report;
}
/** 照片说明也用英文（用户写的） */
function englishMedia() {
  const media = sampleMedia();
  for (const m of media.values()) if (m.caption) m.caption = m.caption.replace('现场照片', 'Site photo');
  return media;
}

/** 模型里所有字符串（带路径） */
function modelStrings(node, path = '', out = []) {
  if (node == null) return out;
  if (typeof node === 'string') out.push([path, node]);
  else if (Array.isArray(node)) node.forEach((x, i) => modelStrings(x, `${path}[${i}]`, out));
  else if (typeof node === 'object') for (const [k, v] of Object.entries(node)) modelStrings(v, path ? `${path}.${k}` : k, out);
  return out;
}
/** 模型里的字符串按 fn 改写（返回新模型） */
function mapStrings(node, fn, path = '') {
  if (node == null) return node;
  if (typeof node === 'string') return fn(node, path);
  if (Array.isArray(node)) return node.map((x, i) => mapStrings(x, fn, `${path}[${i}]`));
  if (typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, mapStrings(v, fn, path ? `${path}.${k}` : k)]));
  return node;
}

/** 整本工作簿里所有会显示 / 存下来的文字：表名、页眉页脚、每个格子（合并区只取主格）、文件属性 */
function workbookStrings(wb) {
  const out = [['wb.title', wb.title || ''], ['wb.creator', wb.creator || '']];
  for (const ws of wb.worksheets) {
    out.push([`${ws.name} 表名`, ws.name]);
    for (const k of ['oddHeader', 'oddFooter', 'evenHeader', 'evenFooter', 'firstHeader', 'firstFooter']) if (ws.headerFooter?.[k]) out.push([`${ws.name} ${k}`, ws.headerFooter[k]]);
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (c) => {
        if (c.master.address !== c.address) return;
        const text = textOf(c.value);
        if (text) out.push([`${ws.name}!${c.address}`, text]);
      });
    });
  }
  return out;
}

async function exportLang(template, report, { lang, project = SAMPLE_PROJECT, settings = SAMPLE_SETTINGS, media = sampleMedia(), model: mapModel, logo = LOGO } = {}) {
  let model = buildDocModel({ template, report, project, settings, lang });
  if (mapModel) model = mapModel(model);
  const blob = await exportXlsx(model, mediaLoader(media), { logo });
  const buf = Buffer.from(await blob.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return { wb, ws: wb.worksheets[0], data: wb.worksheets[1], model, buf };
}

/** 模板 doc.zhOnly / enOnly 的整行文字（抬头小字 / 图例 / 页脚）docmodel 还没合并时，这几行由核心负责，这里不算渲染器的错 */
const metaText = (x) => (x == null ? '' : typeof x === 'string' ? x : labelText(x));
const metaLinesOf = (model) => [model.meta.kicker, model.meta.legend, model.meta.footer].map(metaText).filter(Boolean);

tests.push(['语言：七个模板 zh / en / both 都能导出；表名、页脚页码、数据页表头按语言', async () => {
  for (const name of FILES) {
    const t = await load(name);
    if (!t) continue;
    const report = fillReport(t, 'full');
    const out = {};
    for (const lang of ['zh', 'en', 'both']) {
      out[lang] = await exportLang(t, report, { lang });
      writeFileSync(join(OUT, `${t.id}-lang-${lang}.xlsx`), out[lang].buf);
    }
    const hasItems = allItems(t).length > 0;
    // 表名
    assert.deepEqual(out.zh.wb.worksheets.map((s) => s.name)[1], '数据');
    assert.deepEqual(out.en.wb.worksheets.map((s) => s.name)[1], 'Data');
    assert.deepEqual(out.both.wb.worksheets.map((s) => s.name)[1], '数据 Data');
    assert.equal(out.zh.ws.name, out.zh.model.meta.title.zh.slice(0, 31), t.id);
    // 英文表名：标题本身（≤ 31 字），太长时断在单词之间（不留半个词 / 落单的 &）
    const enTitle = out.en.model.meta.title.en.replace(/[[\]:*?/\\]/g, ' ').trim();
    const enName = out.en.ws.name;
    assert.ok(enName.length <= 31 && enTitle.startsWith(enName), `${t.id} 英文表名：${enName}`);
    if (enTitle.length > 31) assert.ok(/^\s/.test(enTitle.slice(enName.length)) && !/[&\s]$/.test(enName), `${t.id} 英文表名断在单词中间：${enName}`);
    else assert.equal(enName, enTitle);
    assert.ok(!CJK.test(out.en.ws.name), `${t.id} 英文表名：${out.en.ws.name}`);
    // 页脚页码
    assert.match(out.zh.ws.headerFooter.oddFooter, /&R&8第 &P \/ &N 页$/);
    assert.match(out.en.ws.headerFooter.oddFooter, /&R&8Page &P of &N$/);
    assert.match(out.both.ws.headerFooter.oddFooter, /&R&8第 &P \/ &N 页$/);
    // 生成时间那行
    const gen = (o) => cellsOf(o.ws).find((c) => / · (生成于|Generated) \d{4}-/.test(c.text))?.text || '';
    assert.match(gen(out.zh), / · 生成于 \d{4}-/);
    assert.match(gen(out.en), /^Sail by Riccione Reka · Generated \d{4}-/);
    assert.match(gen(out.both), / · 生成于 \d{4}-/);
    // 主题：中文 / 双语照旧用 exceljs 默认主题；英文换成字体的英文名
    assert.ok(out.zh.wb._themes.theme1.includes('typeface="宋体"') && out.both.wb._themes.theme1.includes('typeface="宋体"'), `${t.id} 中文 / 双语主题应照旧`);
    assert.ok(out.en.wb._themes.theme1.includes('typeface="SimSun"') && out.en.wb._themes.theme1.includes('typeface="Malgun Gothic"'), `${t.id} 英文主题字体名`);
    // 数据页：双语 10 列（检查项 / 结果各有英文列），单语 8 列，表头只写一种语言
    if (hasItems) {
      const head = (o) => o.data.getRow(Number(/^A(\d+)/.exec(o.data.autoFilter)[1])).values.slice(1).map(textOf);
      assert.deepEqual(head(out.both), ['节 Section', '序号 No.', '检查项 Item', 'Item (EN)', '关键 Key', '影像 Media', '结果 Result', 'Result (EN)', '备注 Remarks', '照片数 Photos']);
      assert.deepEqual(head(out.zh), ['节', '序号', '检查项', '关键', '影像', '结果', '备注', '照片数']);
      assert.deepEqual(head(out.en), ['Section', 'No.', 'Item', 'Key', 'Media', 'Result', 'Remarks', 'Photos']);
      for (const lang of ['zh', 'en']) {
        const m = /^A(\d+):H(\d+)$/.exec(out[lang].data.autoFilter);
        assert.ok(m, `${t.id} ${lang} 数据页筛选范围应到 H 列（${out[lang].data.autoFilter}）`);
        assert.equal(Number(m[2]) - Number(m[1]), allItems(t).length, `${t.id} ${lang} 数据页检查项行数`);
      }
      // 结果列（F）：zh 只写选项中文（合格），en 只写英文（Pass）；双语照旧中文 G 列 + 英文 H 列
      const rows = (o) => o.model.blocks.filter((b) => b.type === 'checklist').flatMap((b) => b.rows);
      const start = (o) => Number(/^A(\d+)/.exec(o.data.autoFilter)[1]);
      rows(out.zh).forEach((row, i) => {
        if (!row.result) return;
        const w = (o, col) => textOf(o.data.getCell(start(o) + 1 + i, col).value);
        const both = rows(out.both)[i].result;
        assert.equal(w(out.zh, 6), both.zh, `${t.id} zh 第 ${i + 1} 项结果`);
        assert.equal(w(out.en, 6), both.en || both.zh, `${t.id} en 第 ${i + 1} 项结果`);
        assert.deepEqual([w(out.both, 7), w(out.both, 8)], [both.zh, both.en || ''], `${t.id} both 第 ${i + 1} 项结果`);
      });
    }
  }
}]);

tests.push(['纯英文：英文内容的报告，七个模板的 Excel 没有一个中文字 / 全角标点（格子、表名、页脚、文件属性）', async () => {
  for (const name of FILES) {
    const t = await load(name);
    if (!t) continue;
    for (const long of [false, true]) {
      const report = englishReport(t, { long });
      // ① 渲染器本身：模型里（核心 / 模板还没给英文的）中文一律换成 X，只留报告名（自动生成的「模板中文名 · 项目（客户）· 日期」由渲染器换成英文）
      //    → 输出必须一个中文字 / 全角标点都没有
      const clean = await exportLang(t, report, {
        lang: 'en', project: EN_PROJECT, settings: EN_SETTINGS, media: englishMedia(),
        model: (m) => mapStrings(m, (s, p) => (p === 'meta.reportTitle' || !CJK.test(s) ? s : 'X')),
      });
      assert.equal(clean.model.meta.lang, 'en');
      assert.ok(CJK.test(clean.model.meta.reportTitle), '夹具：报告名应是自动生成的中文名（测渲染器换英文）');
      const bad = workbookStrings(clean.wb).filter(([, s]) => CJK.test(s));
      assert.deepEqual(bad, [], `${t.id}${long ? '（长备注）' : ''} 英文 Excel 里有中文：\n${bad.map(([w, s]) => `${w} = ${JSON.stringify(s).slice(0, 120)}`).join('\n')}`);
      // 报告名换成英文标题、半角括号，页脚里不会切出半个括号
      const foot = clean.ws.headerFooter.oddFooter;
      assert.ok(foot.includes(`${clean.model.meta.title.en.replace(/&/g, '&&')} · Seri Maya Condo B-12-3 (Mr Tan)`), foot);
      assert.equal((foot.match(/\(/g) || []).length, (foot.match(/\)/g) || []).length, `页脚括号不成对：${foot}`);
      assert.ok(clean.wb.title.startsWith(clean.model.meta.title.en), clean.wb.title);
      // 主题（xl/theme/theme1.xml）里的字体名也不带中日韩文字（exceljs 默认主题写的是 宋体 / ＭＳ Ｐゴシック / 맑은 고딕…）
      const theme = clean.wb._themes?.theme1;
      assert.ok(typeof theme === 'string' && theme.includes('<a:theme'), `${t.id} 读不到主题`);
      assert.deepEqual(theme.match(/typeface="[^"]*[^\x00-\x7f][^"]*"/g), null, `${t.id} 英文 Excel 的主题里有中日韩字体名`);
      assert.ok(!/[^\x00-\x7f]/.test(theme), `${t.id} 英文 Excel 的主题里有非 ASCII 文字`);

      // ② 真实模型：输出里若还有中文，只能是模型里原样带来的（核心 / 模板的英文还没补齐），渲染器自己不加
      const real = await exportLang(t, report, { lang: 'en', project: EN_PROJECT, settings: EN_SETTINGS, media: englishMedia() });
      const src = modelStrings(real.model).filter(([p]) => p !== 'meta.reportTitle' && !/zhOnly$/.test(p)).map(([, s]) => s).filter((s) => CJK.test(s));
      const leaks = [];
      for (const [where, s] of workbookStrings(real.wb)) {
        for (const run of s.match(CJK_RUN) || []) {
          if (!src.some((x) => x.includes(run))) leaks.push(`${where}: 「${run}」 in ${JSON.stringify(s).slice(0, 100)}`);
        }
      }
      assert.deepEqual(leaks, [], `${t.id} 渲染器自己写出了中文：\n${leaks.join('\n')}`);
    }
  }
}]);

tests.push(['纯中文：七个模板的 Excel 没有双语标签的英文半边（写死的表头 / 页码 / 生成时间，模板标签的英文）', async () => {
  // 渲染器写死的英文半边
  const FIXED_EN = /\b(Check Item|Standard|Method|Result|Remarks?|Photos?|missing|shared separately|cont\.|Name|Date|Generated|Page|Data|Section|Key|Media|Field|Value|Sign-off|SIGN-OFF|Signed|items?|None|Conclusion|Summary|Pass|Fail|Yes|Done|PHOTO)\b/;
  for (const name of FILES) {
    const t = await load(name);
    if (!t) continue;
    for (const variant of ['full', 'empty']) {
      const report = fillReport(t, variant);
      const { wb, model } = await exportLang(t, report, { lang: 'zh' });
      const both = buildDocModel({ template: t, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang: 'both' });
      // zh 模型里本来就有的英文（用户填的、中文原文里的 Punch / SO / PDF…；核心还没单语化的抬头小字 / 图例行）不算
      const zhText = modelStrings(model).map(([, s]) => s).join('\n');
      const meta = metaLinesOf(model);
      const out = workbookStrings(wb).filter(([, s]) => !meta.includes(s));
      const fixed = out.filter(([, s]) => FIXED_EN.test(s) && !zhText.includes(s.match(FIXED_EN)[0]));
      assert.deepEqual(fixed, [], `${t.id} ${variant} 中文 Excel 里有写死的英文：\n${fixed.map(([w, s]) => `${w} = ${JSON.stringify(s).slice(0, 100)}`).join('\n')}`);
      // 双语模型里每个标签的英文半边（≥ 4 个字、不是中文原文的一部分）都不该出现在中文文件里
      const halves = new Set();
      const walk = (n) => {
        if (n == null || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        if (typeof n.zh === 'string' && typeof n.en === 'string' && n.zh && n.en.trim().length >= 4 && !n.zh.includes(n.en) && !zhText.includes(n.en)) halves.add(n.en.trim());
        Object.values(n).forEach(walk);
      };
      walk(both);
      const all = out.map(([w, s]) => [w, s]);
      const hits = [];
      for (const h of halves) for (const [w, s] of all) if (s.includes(h)) hits.push(`${w}: 「${h}」 in ${JSON.stringify(s).slice(0, 100)}`);
      assert.deepEqual(hits, [], `${t.id} ${variant} 中文 Excel 里有英文半边：\n${hits.slice(0, 20).join('\n')}`);
    }
  }
}]);

tests.push(['单语：没有空的副行 / 落单的分隔符；单行标签的行不留第二行的空', async () => {
  for (const name of FILES) {
    const t = await load(name);
    if (!t) continue;
    for (const [lang, report, project, settings] of [['zh', fillReport(t, 'full'), SAMPLE_PROJECT, SAMPLE_SETTINGS], ['en', englishReport(t), EN_PROJECT, EN_SETTINGS]]) {
      const { wb, model } = await exportLang(t, report, { lang, project, settings });
      for (const [where, s] of workbookStrings(wb)) {
        assert.ok(!/^\n|\n$|\n\n/.test(s), `${t.id} ${lang} ${where} 有空行：${JSON.stringify(s)}`);
        assert.ok(!/^[\s·/：:]*[·：:]\s*$|^\s*·|·\s*$/.test(s), `${t.id} ${lang} ${where} 分隔符落单：${JSON.stringify(s)}`);
        assert.ok(!/undefined|\[object/.test(s), `${t.id} ${lang} ${where}：${s}`);
      }
      // 富文本格：每段都有字（单语不会写出只有换行的副行）
      wb.worksheets[0].eachRow((row) => row.eachCell((c) => {
        if (c.value?.richText) for (const p of c.value.richText) assert.ok(p.text.replace(/\n/g, '').length, `${t.id} ${lang} ${c.address} 富文本里有空段`);
      }));
      // 信息栏：两个单行标签 + 单行值 → 行高不按两行算（双语至少 32pt）
      const ws = wb.worksheets[0];
      const f = model.blocks.find((b) => b.type === 'fields' && b.fields.some((x) => x.kind === 'inline' && x.value));
      if (f) {
        const lab0 = f.fields.find((x) => x.kind === 'inline' && x.value);
        // 核心还没处理 zhOnly / enOnly 时，导出用模板的单语写法
        const text = lang === 'en' ? lab0.label.enOnly || lab0.label.en : lab0.label.zhOnly || lab0.label.zh;
        const c = cellsOf(ws).find((x) => x.text === text);
        assert.ok(c, `${t.id} ${lang} 找不到标签 ${text}`);
        if (lines1(text) && String(lab0.value).length < 20) assert.ok(ws.getRow(c.row).height < 32, `${t.id} ${lang}「${text}」行高 ${ws.getRow(c.row).height}pt：单语标签只有一行`);
      }
    }
  }
}]);
// 短标签（一行放得下）
const lines1 = (s) => String(s).length <= 12 && !s.includes('\n');

tests.push(['单语：写死的文字按语言（续行、照片缺失、视频、备注前缀、【影像】、签名姓名 / 日期、件数）', async () => {
  // 质检：长备注续行 + 照片已删 + 视频没封面
  const qc = await load('qualityCheck');
  const item = qc.sections.find((s) => s.type === 'checklist').items.find((i) => !i.input);
  const media = sampleMedia();
  media.set('m_video', { ...media.get('m_video'), poster: null, thumb: null });
  const zhNote = '现场检查发现柜门铰链松动需要重新调整并复检确认安装位置正确'.repeat(30);
  for (const [lang, note, cont, photoMiss, video, name, items] of [
    ['zh', zhNote, '（续）', '照片缺失', '▶ 视频（0:42）请见群组', '姓名：', /^共 \d+ 项$/],
    ['en', EN_LONG.repeat(2), '(cont.)', '2 photos missing', '▶ Video (0:42) shared separately', 'Name: ', /^\d+ items · \d+ key items$/],
    ['both', zhNote, '（续）', '照片缺失 ×2', '▶ 视频（0:42）请见群组', '姓名 Name：', /^共 \d+ 项 · 其中关键项 \d+ 项$/],
  ]) {
    const report = fillReport(qc, 'full');
    report.items[item.id] = { ...report.items[item.id], r: 'F', note, photos: ['gone1', 'gone2', 'm_video'] };
    const { ws } = await exportSheetLang(qc, report, lang, media);
    const cells = cellsOf(ws);
    const parts = cells.filter((c) => c.col === 8 && note.includes(c.text));
    assert.ok(parts.length > 1, `${lang} 长备注应切成续行`);
    assert.equal(parts.map((c) => c.text).join(''), note, `${lang} 续行拼起来应等于原备注`);
    assert.equal(textOf(ws.getCell(parts[1].row, 2).value), cont, `${lang} 续行标记`);
    const lost = cells.find((c) => c.text.includes(video));
    assert.ok(lost, `${lang} 缺「${video}」`);
    assert.ok(lost.text.includes(photoMiss), `${lang} 缺「${photoMiss}」：${lost.text}`);
    assert.ok(cells.some((c) => c.text.startsWith(name)), `${lang} 签名缺「${name}」`);
    if (lang !== 'zh') assert.ok(cells.some((c) => items.test(c.text)), `${lang} 节标题件数`);
    else assert.ok(cells.some((c) => /^共 \d+ 项 · 其中关键项 \d+ 项$/.test(c.text)), 'zh 节标题件数');
  }
  // 交付清单（打勾清单）：备注前缀、影像标记
  const ho = await load('handover');
  const hoItem = ho.sections.find((s) => s.type === 'checklist' && s.items.some((i) => i.media)).items.find((i) => i.media);
  for (const [lang, prefix, tag] of [['zh', '备注：', '【影像】'], ['en', 'Remarks: ', '[PHOTO] '], ['both', '备注：', '【影像】']]) {
    const report = fillReport(ho, 'full');
    report.items[hoItem.id] = { ...report.items[hoItem.id], r: 'Y', note: 'Checked OK' };
    const { ws } = await exportSheetLang(ho, report, lang);
    const c = cellsOf(ws).find((x) => x.text.includes(`${prefix}Checked OK`));
    assert.ok(c, `${lang} 打勾清单备注前缀应是「${prefix}」`);
    assert.ok(c.text.startsWith(tag), `${lang} 影像标记应是「${tag}」：${c.text.slice(0, 30)}`);
  }
  // 照片行左边的标签
  for (const [lang, label] of [['zh', '照片'], ['en', 'Photos'], ['both', '照片 Photos']]) {
    const { ws } = await exportSheetLang(qc, fillReport(qc, 'full'), lang);
    assert.ok(cellsOf(ws).some((c) => c.col === 1 && c.text === label), `${lang} 照片行标签应是「${label}」`);
  }
}]);

async function exportSheetLang(template, report, lang, media = sampleMedia()) {
  const out = await exportLang(template, report, { lang, media });
  return { ...out, ws: out.wb.worksheets[0] };
}

tests.push(['单语：模板的 zhOnly / enOnly 写法生效（核心还没处理时由导出兜底），双语照旧', async () => {
  // 终检整改图例：原表中英写在一行 → zh 只要中文那半句，en 用英文整句
  const fi = await load('finalInspection');
  const legend = fi.sections.find((s) => s.type === 'note' && s.lines?.some((l) => l.zhOnly));
  if (legend) {
    const l0 = legend.lines.find((l) => l.zhOnly);
    const zh = cellsOf((await exportSheetLang(fi, fillReport(fi, 'full'), 'zh')).ws).map((c) => c.text);
    const en = cellsOf((await exportSheetLang(fi, englishReport(fi), 'en')).ws).map((c) => c.text);
    const both = cellsOf((await exportSheetLang(fi, fillReport(fi, 'full'), 'both')).ws).map((c) => c.text);
    assert.ok(zh.includes(l0.zhOnly), `zh 应写「${l0.zhOnly}」`);
    assert.ok(en.includes(l0.enOnly), `en 应写「${l0.enOnly}」`);
    assert.ok(both.some((s) => s.startsWith(l0.zh)), 'both 照原表');
  }
  // 场前审核：原表只有中文的字段标签 → en 用 enOnly
  const pi = await load('preInstall');
  const f = pi.sections.find((s) => s.type === 'fields').fields.find((x) => x.label?.enOnly && !x.label.en);
  if (f) {
    const { ws } = await exportSheetLang(pi, englishReport(pi), 'en');
    assert.ok(cellsOf(ws).some((c) => c.text === f.label.enOnly), `en 字段标签应是「${f.label.enOnly}」`);
    // 窄格（E:F）里的英文长标签也算进行高
    const narrow = cellsOf(ws).filter((c) => c.col === 5 && c.right === 6 && lines1(c.text) === false && !c.text.includes('\n'));
    for (const c of narrow) if (c.text.length > 16) assert.ok(ws.getRow(c.row).height >= 30, `「${c.text}」两行标签行太矮（${ws.getRow(c.row).height}pt）`);
  }
}]);

tests.push(['双语：与不选语言逐格一致（文字 / 行高 / 合并 / 页脚 / 表名），写死的成对文字照旧', async () => {
  for (const name of FILES) {
    const t = await load(name);
    if (!t) continue;
    const report = fillReport(t, 'full');
    const a = await exportLang(t, report, {});
    const b = await exportLang(t, report, { lang: 'both' });
    const snap = (o) => o.wb.worksheets.map((ws) => {
      const rows = [];
      ws.eachRow({ includeEmpty: true }, (row, r) => rows.push([r, row.height, row.values.map((v) => (v && v.richText ? v.richText.map((x) => `${x.text}|${x.font?.size}|${x.font?.color?.argb}`).join('¦') : textOf(v)))]));
      return { name: ws.name, footer: ws.headerFooter?.oddFooter, merges: [...(ws.model.merges || [])].sort(), rows: JSON.stringify(rows).replace(/(生成于 )[\d: -]+/g, '$1') };
    });
    assert.deepEqual(snap(b), snap(a), `${t.id} both ≠ 默认`);
  }
  // 写死的成对文字照旧（双语）
  const qc = await load('qualityCheck');
  const { ws, wb } = await exportSheetLang(qc, fillReport(qc, 'full'), 'both');
  const cells = cellsOf(ws).map((c) => c.text);
  for (const s of ['序号\nNo.', '检查项\nCheck Item', '标准要求\nStandard', '检查方法\nMethod', '结果\nResult', '备注 / Punch#\nRemarks / Punch #']) assert.ok(cells.includes(s), `双语表头「${s.replace('\n', ' / ')}」`);
  assert.ok(cells.some((s) => s.startsWith('姓名 Name：') && s.includes('\n日期 Date：')), '双语签名姓名 / 日期');
  assert.ok(cells.some((s) => s === '照片 Photos'), '双语照片标签');
  assert.equal(wb.worksheets[1].name, '数据 Data');
}]);

// ---------- 单语排版：窄格里的英文长单词 / 抬头小字的形状 / 数据页列宽 ----------
// 与 xlsx.js 同一套字宽估算：中文 2、大写 / m / w 1.4、数字 1.25、其余 1；粗体宽 8%；每行能放 capAt 个单位
const unitsOfCh = (ch) => (ch.charCodeAt(0) > 0x2e7f ? 2 : /[A-Zmw@%#&]/.test(ch) ? 1.4 : /[0-9]/.test(ch) ? 1.25 : 1);
const capAt = (w, pt) => Math.max(4, w * 1.1) / (Math.round((pt * 4) / 3) / 13);
const unitsOfStr = (s) => [...s].reduce((n, ch) => n + unitsOfCh(ch), 0);
/** 放不下一行的英文词（空格、中文字前后、连字符后都能换行） */
const tooWide = (text, width, pt, bold) =>
  String(text)
    .split(/\s+|(?<=-)/)
    .flatMap((w) => w.split(/[⺀-￿]+/))
    .filter((w) => w && unitsOfStr(w) * (bold ? 1.08 : 1) > capAt(width, pt));
// exceljs 读回字号会取整（7.5 → 7）：按 7.5 算（导出只会用 7.5，不会真的用 7）
const ptOf = (font) => (font?.size === 7 ? 7.5 : font?.size || 10);
/** 两张表里所有粗体文字（表头 / 标签 / 标题）：每个英文词都放得下一行 */
function boldWordsTooWide(wb) {
  const out = [];
  for (const ws of wb.worksheets) {
    for (const c of cellsOf(ws)) {
      const width = widthOf(ws, c.col, c.right);
      const runs = c.cell.value?.richText || [{ text: c.text, font: c.cell.font }];
      for (const run of runs) {
        if (!run.font?.bold) continue;
        for (const w of tooWide(run.text, width, ptOf(run.font), true)) out.push(`${ws.name}!${c.cell.address}（${width} 宽 ${ptOf(run.font)}pt）「${w}」 in ${JSON.stringify(run.text).slice(0, 60)}`);
      }
    }
  }
  return out;
}

tests.push(['单语：窄格里的英文长单词不从中间断开（终检整改表 G 列表头「Re-inspection」降字号），双语照旧', async () => {
  const fi = await load('finalInspection');
  const col = fi.sections.find((s) => s.type === 'table').columns.find((c) => c.key === 'recheck');
  for (const lang of ['en', 'zh', 'both']) {
    const { ws } = lang === 'en'
      ? await exportLang(fi, englishReport(fi), { lang, project: EN_PROJECT, settings: EN_SETTINGS, media: englishMedia() })
      : await exportLang(fi, fillReport(fi, 'full'), { lang });
    const cells = cellsOf(ws);
    const hr = cells.find((c) => c.col === 1 && c.text === '#').row;
    const main = lang === 'en' ? col.label.en : col.label.zh;
    const h = cells.find((c) => c.row === hr && c.text.split('\n')[0] === main);
    assert.ok(h, `${lang} 找不到「${main}」表头`);
    const runs = h.cell.value.richText;
    const width = widthOf(ws, h.col, h.right);
    if (lang === 'en') {
      // 9pt 粗体时「inspection」比 8 宽的格还宽 → LibreOffice 排成 Re- / inspectio / n；降到放得下的字号
      assert.equal(runs.length, 1);
      assert.ok(runs[0].font.size < 9, `en「${main}」表头应降字号（实际 ${runs[0].font.size}pt）`);
      assert.deepEqual(tooWide(runs[0].text, width, ptOf(runs[0].font), true), [], `en「${main}」表头放不下`);
      assert.ok(ws.getRow(hr).height >= 28);
    } else {
      assert.equal(runs[0].text, main);
      assert.equal(runs[0].font.size, 9, `${lang} 表头主行照旧 9pt`);
      if (lang === 'both') assert.deepEqual([runs[1].text, runs[1].font.size], [`\n${col.label.en}`, 7], 'both 英文副行照旧 7.5pt');
      else assert.equal(runs.length, 1);
    }
  }
  // 七个模板：单语文件两张表里的粗体文字（表头 / 标签 / 标题），每个英文词都放得下一行
  for (const name of FILES) {
    const t = await load(name);
    if (!t) continue;
    for (const lang of ['en', 'zh']) {
      const { wb } = lang === 'en'
        ? await exportLang(t, englishReport(t), { lang, project: EN_PROJECT, settings: EN_SETTINGS, media: englishMedia() })
        : await exportLang(t, fillReport(t, 'full'), { lang });
      const bad = boldWordsTooWide(wb);
      assert.deepEqual(bad, [], `${t.id} ${lang} 有放不下一行的英文词（会从中间断开）：\n${bad.join('\n')}`);
    }
  }
}]);

tests.push(['抬头小字 / 图例 / 页脚是 { zh, en } 对象时（核心按语言规整后可能交来的形状）写成一行文字；字符串照旧', async () => {
  const qc = await load('qualityCheck');
  const d = qc.doc;
  const report = fillReport(qc, 'full');
  for (const [lang, meta, want] of [
    ['en', { kicker: { zh: '', en: d.enOnly.kicker }, legend: { zh: '', en: d.enOnly.legend }, footer: { zh: '', en: 'End of form' } }, [d.enOnly.kicker, d.enOnly.legend, 'End of form']],
    ['zh', { kicker: { zh: d.zhOnly.kicker, en: '' }, legend: { zh: d.zhOnly.legend, en: '' }, footer: { zh: '表尾', en: '' } }, [d.zhOnly.kicker, d.zhOnly.legend, '表尾']],
    // 还没按语言规整、带单语写法的对象：导出兜底用 enOnly
    ['en', { kicker: { zh: d.kicker, en: '', zhOnly: d.zhOnly.kicker, enOnly: d.enOnly.kicker }, legend: { zh: d.legend, enOnly: d.enOnly.legend }, footer: '' }, [d.enOnly.kicker, d.enOnly.legend]],
    ['both', { kicker: { zh: '溪岸 Sail', en: 'One form per unit' }, legend: d.legend, footer: { zh: '表尾', en: 'End of form' } }, ['溪岸 Sail One form per unit', d.legend, '表尾 End of form']],
    // 空对象 / 空串：不写空行
    ['en', { kicker: { zh: '', en: '' }, legend: '', footer: { zh: '', en: '' } }, []],
  ]) {
    const { wb, ws } = await exportLang(qc, report, { lang, model: (m) => ({ ...m, meta: { ...m.meta, ...meta } }) });
    const texts = workbookStrings(wb).map(([, s]) => s);
    for (const s of want) assert.ok(texts.includes(s), `${lang} 应有「${s}」`);
    assert.ok(!texts.some((s) => /\[object|\{"|"zh"/.test(s)), `${lang} 把对象当文字写出来了：${texts.find((s) => /\[object|\{"|"zh"/.test(s))}`);
    if (!want.length) {
      // 第 2 行就是标题（没有抬头小字那一行）
      assert.equal(textOf(ws.getCell(2, 1).value), qc.doc.title.en, '空的抬头小字不该占一行');
    }
  }
}]);

tests.push(['数据页（单语）：英文节名列放得下；整改表每列分到够宽的格（问题描述不挤进 7 宽的列）；签名日期不折行；双语照旧', async () => {
  const fi = await load('finalInspection');
  const table = fi.sections.find((s) => s.type === 'table');
  for (const lang of ['en', 'zh', 'both']) {
    const out = lang === 'en'
      ? await exportLang(fi, englishReport(fi), { lang, project: EN_PROJECT, settings: EN_SETTINGS, media: englishMedia() })
      : await exportLang(fi, fillReport(fi, 'full'), { lang });
    const ws = out.data;
    const cells = cellsOf(ws);
    const labelOf = (c) => (lang === 'en' ? c.label.en : c.label.zh);
    // 整改表：表头行 = # + 每列列名
    const hr = cells.find((c) => c.col === 1 && c.text === '#').row;
    const heads = cells.filter((c) => c.row === hr);
    const rows = out.model.blocks.find((b) => b.type === 'table').rows;
    assert.ok(rows.length >= 2, '夹具：整改表应有内容');
    if (lang === 'both') {
      // 双语照旧：一列对一列（A 列 #，表格列从 B 起），不合并
      assert.deepEqual(heads.map((c) => [c.col, c.right, c.text]), [[1, 1, '#'], ...table.columns.map((c, i) => [i + 2, i + 2, c.label.zh])]);
    } else {
      assert.deepEqual(heads.map((c) => c.text), ['#', ...table.columns.map(labelOf)], `${lang} 表头`);
      for (const c of table.columns) {
        const h = heads.find((x) => x.text === labelOf(c));
        const w = widthOf(ws, h.col, h.right);
        assert.ok(w >= (c.width || 1) * 14, `${lang}「${h.text}」只分到 ${w} 宽`);
      }
      // 每行的值写在列名所在的格（合并区的主格）里
      rows.forEach((row, i) => {
        assert.equal(textOf(ws.getCell(hr + 1 + i, 1).value), String(i + 1));
        table.columns.forEach((c, k) => assert.equal(textOf(ws.getCell(hr + 1 + i, heads[k + 1].col).value), row.cells[c.key] || '', `${lang} 第 ${i + 1} 行「${labelOf(c)}」`));
      });
    }
    // 签名：单语的日期放在够宽的列（双语照旧在 E 列）
    const dateHead = cells.find((c) => c.text === tx3(lang, '日期', 'Date'));
    assert.ok(dateHead, `${lang} 数据页缺签名日期列`);
    if (lang === 'both') assert.equal(dateHead.col, 5);
    else {
      assert.ok(widthOf(ws, dateHead.col, dateHead.right) >= 12, `${lang} 签名日期列太窄`);
      assert.equal(textOf(ws.getCell(dateHead.row + 1, dateHead.col).value), '2026-10-09');
      const nameHead = cells.find((c) => c.row === dateHead.row && c.text === tx3(lang, '姓名', 'Name'));
      assert.ok(widthOf(ws, nameHead.col, nameHead.right) >= 30, `${lang} 签名姓名列太窄`);
    }
    // 纯英文：A 列的大写节名（如「Ⅵ PROTECTION & CLOSING」）一行放得下，检查项行不会都变两倍高
    if (lang === 'en') {
      const [, a, z] = /^A(\d+):[A-Z]+(\d+)$/.exec(ws.autoFilter);
      const width = ws.getColumn(1).width;
      for (let r = Number(a) + 1; r <= Number(z); r += 1) {
        const sec = textOf(ws.getCell(r, 1).value);
        assert.ok(unitsOfStr(sec) <= capAt(width, 10), `en 数据页节名「${sec}」在 ${width} 宽的 A 列放不下`);
      }
    }
  }
}]);
const tx3 = (lang, zh, en) => (lang === 'zh' ? zh : lang === 'en' ? en : `${zh} ${en}`);
