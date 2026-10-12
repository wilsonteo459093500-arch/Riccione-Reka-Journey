// 纯函数夹具（Node 与浏览器共用，不依赖 node:fs）：按模板结构自动填一份报告。
import { createReport } from '../src/lib/report.js';
import { resolveScale, normOptions } from '../src/templates/schema.js';

export const SAMPLE_PROJECT = {
  id: 'p_demo',
  name: 'Tuai Timur Residence',
  client: 'Hailey',
  unit: '17-3',
  address: 'Tuai Timur Residence, Unit 17-3, Jalan Tuai Timur, 50450 Kuala Lumpur',
  mapLink: 'https://maps.app.goo.gl/5icvqNRxPNDEBmcv7?g_st=ac',
  so: 'SO-2026-0917',
  designer: 'Mei Ling',
  startDate: '2026-10-08',
  plannedDays: 5,
  entryNote: 'Guard house 登记，带护照',
  parking: '访客停车场',
};

export const SAMPLE_SETTINGS = {
  name: 'Wilson',
  phone: '016-3881819',
  dept: '安装部',
  company: '溪岸 Sail by Riccione Reka',
};

const SAMPLE_TEXT = ['已按图纸核对，无异常', '左侧门板缝隙偏大 3mm，已调整', 'Punch #12 — 已通知工厂补件', '客户要求加装感应灯', ''];

/**
 * 按模板自动填写。variant: 'full'（全部填写，含不合格项）| 'empty'（只建不填）| 'pass'（全部合格）
 */
export function fillReport(template, variant = 'full') {
  const report = createReport(template, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, previous: [] });
  if (variant === 'empty') return report;
  let n = 0;
  const photo = () => `m_photo${(n++ % 7) + 1}`;
  for (const s of template.sections) {
    if (s.type === 'fields') {
      for (const f of s.fields) {
        const cur = report.values[f.key];
        if (f.type === 'photos') report.values[f.key] = [photo(), photo(), photo()];
        else if (f.type === 'video') report.values[f.key] = 'm_video';
        else if (cur != null && cur !== '' && !(Array.isArray(cur) && !cur.length)) continue;
        else if (f.type === 'date') report.values[f.key] = '2026-10-09';
        else if (f.type === 'time') report.values[f.key] = '09:00';
        else if (f.type === 'number') report.values[f.key] = 3;
        else if (f.type === 'tel') report.values[f.key] = '012-3456789';
        else if (f.type === 'url') report.values[f.key] = 'https://drive.google.com/drive/folders/demo';
        else if (f.type === 'yesno') report.values[f.key] = 'Y';
        else if (f.type === 'list') report.values[f.key] = ['第一条示例', '第二条示例'];
        else if (['select', 'radio'].includes(f.type)) report.values[f.key] = normOptions(f.options)[0]?.v ?? '';
        else if (f.type === 'chips') {
          const opts = normOptions(f.options).map((o) => o.v);
          report.values[f.key] = f.multiple ? opts.slice(0, 2) : opts[0];
        } else if (f.type === 'textarea') report.values[f.key] = '今日完成鞋柜与主卧衣柜柜体安装，门板明天到场。\n现场已清理，保护膜完好。';
        else report.values[f.key] = `示例 ${f.key}`;
      }
    }
    if (s.type === 'checklist') {
      s.items.forEach((it, idx) => {
        if (it.input) {
          const t = it.input.type;
          report.items[it.id] = {
            value: t === 'list' ? ['B2 卸货 → 货梯 → 18F', '客厅堆放区'] : t === 'textarea' ? '主卧窗台石未完成 / 硬装单位 / 10月12日前' : '示例填写内容',
            photos: idx % 3 === 0 ? [photo()] : [],
          };
          return;
        }
        const opts = resolveScale(it.scale || s.scale).options;
        let r = opts[0].v;
        if (variant === 'full' && opts.length > 1 && idx % 5 === 3) r = opts[1].v;
        if (variant === 'full' && opts.length > 2 && idx % 7 === 5) r = opts[2].v;
        report.items[it.id] = {
          r,
          note: idx % 5 === 3 ? SAMPLE_TEXT[1] : idx % 4 === 0 ? SAMPLE_TEXT[0] : '',
          photos: idx % 3 === 0 ? [photo(), photo()] : idx % 4 === 1 ? [photo()] : [],
        };
      });
    }
    if (s.type === 'table') {
      const rows = [];
      for (let i = 0; i < 3; i += 1) {
        const row = { photos: i === 0 ? [photo(), photo()] : [] };
        for (const slot of s.photoSlots || []) row[slot.key] = i === 0 ? [photo()] : i === 1 ? [photo()] : [];
        for (const c of s.columns) {
          if (['select', 'radio', 'chips'].includes(c.type)) row[c.key] = normOptions(c.options)[i % normOptions(c.options).length]?.v ?? '';
          else if (c.type === 'date') row[c.key] = `2026-10-1${i}`;
          else row[c.key] = i === 0 ? '主卧衣柜左门板' : `示例 ${c.key} ${i + 1}`;
        }
        rows.push(row);
      }
      report.tables[s.id] = rows;
    }
    if (s.type === 'signatures') {
      s.roles.forEach((r, i) => {
        report.signatures[r.id] = {
          name: report.signatures[r.id]?.name || ['Ah Keong', 'Wilson', 'Mei Ling'][i % 3],
          date: '2026-10-09',
          image: i < 2 ? 'm_sig' : null,
        };
      });
    }
  }
  return report;
}
