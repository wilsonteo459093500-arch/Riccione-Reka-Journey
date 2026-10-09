// Excel 导出：每个模板 full / empty 都能生成，重新打开后结构正确
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ExcelJS from 'exceljs';
import { buildDocModel } from '../src/lib/docmodel.js';
import { exportXlsx } from '../src/lib/export/xlsx.js';
import { allItems } from '../src/templates/schema.js';
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
  for (let c = c1; c <= c2; c += 1) s += ws.getColumn(c).width;
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
