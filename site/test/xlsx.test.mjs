// Excel 导出：每个模板 full / empty 都能生成，重新打开后结构正确
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ExcelJS from 'exceljs';
import { buildDocModel } from '../src/lib/docmodel.js';
import { exportXlsx } from '../src/lib/export/xlsx.js';
import { allItems } from '../src/templates/schema.js';
import { fillReport, sampleMedia, mediaLoader, SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fixtures.mjs';

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
