// ============================================================
// 文档模型 DOC MODEL
// ------------------------------------------------------------
// 模板 + 填报数据 → 与输出格式无关的「文档块」列表。
// PDF（components/doc）、Word（export/docx.js）、Excel（export/xlsx.js）
// 都只读这个模型，保证三种输出内容完全一致。
//
// DocModel = {
//   meta: { templateId, kind, brand, accent, title, subtitle, kicker, badge,
//           intro: [{zh,en}], legend, footer, filename, reportTitle,
//           status, generatedAt, company, dept },
//   blocks: Block[]
// }
//
// Block:
//   { type: 'fields', id, no?, title?, note?, layout: 'grid'|'list', columns,
//     fields: [{ key, label:{zh,en}, kind, value, lines?, photos?, video?, span, empty }] }
//       kind: 'inline' | 'block'(多行文本) | 'list'(逐行) | 'photos' | 'video'
//   { type: 'checklist', id, no?, title, note?, options: Opt[],
//     resultLayout: 'columns'|'inline'|'ticks', showStandard,
//     showMethod, remarkLabel, counts: { total, key },
//     rows: [{ id, no, key, media, title, desc, method, input, inputLabel, value, lines,
//              result: Opt|null, options: Opt[], remark, photos }] }
//   { type: 'table', id, no?, title, note?, columns: [{ key, label, width }],
//     rows: [{ cells: { [key]: string }, photoGroups: [{ key, label, photos }], photos }],
//     empty: bool, emptyText }
//   { type: 'signatures', id, title?, declaration?, roles: [{ id, label, name, date, image }] }
//   { type: 'note', id, title?, tone, lines: [{zh,en}] }
//   { type: 'summary', title, items: [{ label, value, tone }], conclusion? }
//
// Opt = { v, zh, en, tone }
// MediaRef = { id, kind: 'photo'|'video'|'signature', caption? }
//   渲染器用 media 加载器把 id 换成 blob / url。
// ============================================================
import { resolveScale, normOptions, L } from '../templates/schema.js';
import { makeCtx, reportTitle } from './report.js';
import { fmtDate, fmtTime, safeFilename, todayISO } from './format.js';

const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

const ref = (id, kind = 'photo') => (id ? { id, kind } : null);
const refs = (ids, kind = 'photo') => (ids || []).filter(Boolean).map((id) => ({ id, kind }));

/** 把一个字段值格式化成文档里显示的字符串 / 行 */
export function formatFieldValue(field, value) {
  const t = field.type;
  if (t === 'photos') return { kind: 'photos', value: '', photos: refs(value) };
  if (t === 'video') return { kind: 'video', value: '', video: ref(value, 'video') };
  if (t === 'list') {
    const lines = (value || []).map((s) => String(s).trim()).filter(Boolean);
    return { kind: 'list', value: lines.join('\n'), lines };
  }
  if (t === 'textarea') return { kind: 'block', value: value ? String(value) : '' };
  if (t === 'date') return { kind: 'inline', value: value ? fmtDate(value) : '' };
  if (t === 'time') return { kind: 'inline', value: value ? fmtTime(value) : '' };
  if (t === 'yesno') {
    if (value === true || value === 'Y') return { kind: 'inline', value: '是 Yes' };
    if (value === false || value === 'N') return { kind: 'inline', value: '否 No' };
    return { kind: 'inline', value: '' };
  }
  if (t === 'select' || t === 'radio' || t === 'chips') {
    const opts = normOptions(field.options || []);
    const arr = Array.isArray(value) ? value : isEmpty(value) ? [] : [value];
    const labels = arr.map((v) => {
      const o = opts.find((x) => x.v === v);
      return o ? L(o) : String(v);
    });
    return { kind: 'inline', value: labels.join(' / ') };
  }
  return { kind: 'inline', value: value == null ? '' : String(value) };
}

function fieldsBlock(section, template, report) {
  const layout = section.layout || (template.kind === 'message' ? 'list' : 'grid');
  return {
    type: 'fields',
    id: section.id,
    no: section.no,
    title: section.title,
    note: section.note,
    layout,
    columns: section.columns || (layout === 'grid' ? 2 : 1),
    fields: section.fields
      .filter((f) => !f.hidden)
      .map((f) => {
        const v = report.values?.[f.key];
        const out = formatFieldValue(f, v);
        return {
          key: f.key,
          label: typeof f.label === 'string' ? { zh: f.label } : f.label,
          span: f.span || (out.kind === 'block' || out.kind === 'list' || out.kind === 'photos' ? section.columns || 2 : 1),
          empty: isEmpty(v),
          ...out,
        };
      }),
  };
}

function checklistBlock(section, report) {
  const scale = resolveScale(section.scale);
  const rows = section.items.map((it) => {
    const a = report.items?.[it.id] || {};
    const options = resolveScale(it.scale || scale).options;
    let value = '';
    let lines;
    if (it.input) {
      const f = formatFieldValue(it.input, a.value);
      value = f.value;
      lines = f.lines;
    }
    return {
      id: it.id,
      no: it.no,
      key: !!it.key,
      media: !!it.media,
      title: it.title,
      desc: it.desc || null,
      method: it.method || null,
      input: !!it.input,
      inputLabel: it.input ? it.input.label : null,
      value,
      lines,
      result: it.input ? null : options.find((o) => o.v === a.r) || null,
      options,
      remark: (a.note || '').trim(),
      photos: refs(a.photos),
    };
  });
  return {
    type: 'checklist',
    id: section.id,
    no: section.no,
    title: section.title,
    note: section.note,
    options: scale.options,
    // 'columns' = 每个选项一列（如 Pass | Fail 两列打勾）；'inline' = 一列里列出 □P □F □NA；
    // 只有 1 个选项（如交付清单「完成」）时渲染成打勾清单
    resultLayout: scale.options.length === 1 ? 'ticks' : section.resultLayout || 'inline',
    showStandard: !!section.showStandard,
    showMethod: !!section.showMethod,
    remarkLabel: section.remark?.label || { zh: '备注', en: 'Remarks' },
    counts: {
      total: section.items.length,
      key: section.items.filter((i) => i.key).length,
    },
    rows,
  };
}

/** 表格节的照片槽：photoSlots（多组，如「问题照片 / 复验照片」）或单组 photos */
export function tablePhotoSlots(section) {
  if (Array.isArray(section.photoSlots) && section.photoSlots.length) return section.photoSlots;
  if (section.photos) return [{ key: 'photos', label: section.photos.label || { zh: '照片', en: 'Photos' } }];
  return [];
}

function tableBlock(section, report) {
  const raw = report.tables?.[section.id] || [];
  const slots = tablePhotoSlots(section);
  const rows = raw
    .map((r) => {
      const cells = {};
      for (const c of section.columns) cells[c.key] = formatFieldValue(c, r[c.key]).value;
      const photoGroups = slots
        .map((s) => ({ key: s.key, label: s.label, photos: refs(r[s.key]) }))
        .filter((g) => g.photos.length);
      return { cells, photoGroups, photos: photoGroups.flatMap((g) => g.photos) };
    })
    .filter((r) => Object.values(r.cells).some((v) => !isEmpty(v)) || r.photos.length);
  return {
    type: 'table',
    id: section.id,
    no: section.no,
    title: section.title,
    note: section.note,
    columns: section.columns.map((c) => ({
      key: c.key,
      label: typeof c.label === 'string' ? { zh: c.label } : c.label,
      width: c.width || 1,
    })),
    rows,
    empty: rows.length === 0,
    emptyText: section.emptyText || { zh: '无', en: 'None' },
  };
}

function signaturesBlock(section, report) {
  return {
    type: 'signatures',
    id: section.id,
    title: section.title,
    declaration: section.declaration || null,
    roles: section.roles.map((r) => {
      const s = report.signatures?.[r.id] || {};
      return {
        id: r.id,
        label: { zh: r.zh, en: r.en },
        name: s.name || '',
        date: s.date ? fmtDate(s.date) : '',
        image: ref(s.image, 'signature'),
      };
    }),
  };
}

/**
 * @param {{ template, report, project?, settings? }} args
 * @returns DocModel
 */
export function buildDocModel({ template, report, project, settings }) {
  const ctx = makeCtx({ template, report, project, settings });
  const blocks = [];
  for (const s of template.sections) {
    if (s.hidden) continue;
    if (s.type === 'fields') blocks.push(fieldsBlock(s, template, report));
    else if (s.type === 'checklist') blocks.push(checklistBlock(s, report));
    else if (s.type === 'table') blocks.push(tableBlock(s, report));
    else if (s.type === 'signatures') blocks.push(signaturesBlock(s, report));
    else if (s.type === 'note')
      blocks.push({ type: 'note', id: s.id, title: s.title, tone: s.tone || 'info', lines: s.lines || [] });
    else if (s.type === 'summary') blocks.push({ type: 'summary-slot', id: s.id });
  }

  // 自动统计 / 结论：放在 summary 占位处；没有占位就放在第一个签名块之前
  const summary = typeof template.summary === 'function' ? template.summary(ctx) : null;
  const slot = blocks.findIndex((b) => b.type === 'summary-slot');
  if (summary) {
    const blk = { type: 'summary', ...summary };
    if (slot >= 0) blocks.splice(slot, 1, blk);
    else {
      const sig = blocks.findIndex((b) => b.type === 'signatures');
      if (sig >= 0) blocks.splice(sig, 0, blk);
      else blocks.push(blk);
    }
  } else if (slot >= 0) blocks.splice(slot, 1);

  const doc = template.doc || {};
  const fname =
    typeof template.filename === 'function'
      ? template.filename(ctx)
      : [template.name.zh, report.values?.project, report.values?.date || todayISO()].filter(Boolean).join('_');

  return {
    meta: {
      templateId: template.id,
      kind: template.kind,
      brand: doc.brand || 'sail',
      accent: template.accent || '#B5623A',
      title: doc.title || template.name,
      subtitle: doc.subtitle || null,
      kicker: doc.kicker || '',
      badge: doc.badge || null,
      intro: doc.intro || [],
      legend: doc.legend || '',
      footer: doc.footer || '',
      filename: safeFilename(fname),
      reportTitle: report.title || reportTitle(template, report, project),
      status: report.status,
      generatedAt: new Date().toISOString(),
      company: settings?.company || '溪岸 Sail by Riccione Reka',
      dept: settings?.dept || '安装部',
    },
    blocks,
  };
}

/** 文档模型里引用的全部媒体（渲染前预加载用） */
export function modelMedia(model) {
  const out = new Map();
  const add = (r) => r && r.id && out.set(r.id, r);
  for (const b of model.blocks) {
    if (b.type === 'fields') for (const f of b.fields) { (f.photos || []).forEach(add); add(f.video); }
    if (b.type === 'checklist') for (const r of b.rows) r.photos.forEach(add);
    if (b.type === 'table') for (const r of b.rows) r.photos.forEach(add);
    if (b.type === 'signatures') for (const r of b.roles) add(r.image);
  }
  return [...out.values()];
}
