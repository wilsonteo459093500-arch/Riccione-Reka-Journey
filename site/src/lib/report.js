// 报告数据：新建 / 带入项目资料 / 进度 / 填写提醒
import { allFields, allItems, resolveScale, L } from '../templates/schema.js';
import { todayISO } from './format.js';

export const uid = (p = '') =>
  p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** 项目的「工地称呼」：Tuai Timur Residence 17-3（Hailey） */
export function siteLabel(project) {
  if (!project) return '';
  const base = [project.name, project.unit].filter(Boolean).join(' ');
  return project.client ? `${base}（${project.client}）` : base;
}

/** 解析 bind 键 → 值 */
export function resolveBind(bind, ctx) {
  if (!bind) return undefined;
  if (bind === 'today') return ctx.today || todayISO();
  const [ns, key] = bind.split('.');
  if (ns === 'project') {
    if (!ctx.project) return undefined;
    if (key === 'siteLabel') return siteLabel(ctx.project);
    return ctx.project[key];
  }
  if (ns === 'settings') return ctx.settings?.[key];
  return undefined;
}

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const isEmpty = (v) =>
  v == null || v === '' || (Array.isArray(v) && v.length === 0);

/** 统一的模板上下文（模板里 default / summary / text / filename 都拿到它） */
export function makeCtx({ template, report, project, settings, previous }) {
  return {
    template,
    report: report || { values: {}, items: {}, tables: {}, signatures: {} },
    project: project || null,
    settings: settings || {},
    previous: previous || [],
    today: todayISO(),
  };
}

function fieldDefault(field, ctx) {
  const bound = resolveBind(field.bind, ctx);
  if (!isEmpty(bound)) return clone(bound);
  if (field.default !== undefined) {
    return typeof field.default === 'function' ? field.default(ctx) : clone(field.default);
  }
  if (field.type === 'photos' || field.type === 'list') return [];
  if (field.type === 'chips' && field.multiple) return [];
  return '';
}

/** 新建一份报告（含默认值 / 项目资料带入） */
export function createReport(template, { project, settings, previous } = {}) {
  const now = Date.now();
  const report = {
    id: uid('r_'),
    templateId: template.id,
    templateVersion: template.version || 1,
    projectId: project?.id || null,
    title: '',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    values: {},
    items: {},
    tables: {},
    signatures: {},
  };
  const ctx = makeCtx({ template, report, project, settings, previous });
  report.autofill = {};
  for (const f of allFields(template)) {
    report.values[f.key] = fieldDefault(f, ctx);
    if (isAuto(f) && !isEmpty(report.values[f.key])) report.autofill[f.key] = clone(report.values[f.key]);
  }
  for (const { item } of allItems(template)) {
    if (item.input) {
      report.items[item.id] = { value: fieldDefault(item.input, ctx), photos: [] };
    }
  }
  for (const s of template.sections) {
    if (s.type === 'table') {
      report.tables[s.id] = Array.from({ length: s.minRows || 0 }, () => ({ photos: [] }));
    }
    if (s.type === 'signatures') {
      for (const r of s.roles) {
        const name = resolveBind(r.bind, ctx);
        report.signatures[r.id] = { name: name || '', date: '', image: null };
      }
    }
  }
  report.title = reportTitle(template, report, project);
  return report;
}

/** 会随项目变化的字段：绑定了项目资料，或默认值是函数（如预计工期） */
const isAuto = (f) => (f.bind && f.bind.startsWith('project.')) || typeof f.default === 'function';
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

function safeDefault(f, ctx) {
  try {
    return fieldDefault(f, ctx);
  } catch {
    return '';
  }
}

/**
 * 换项目：只覆盖「空的」或「仍是自动带入值」的字段，用户手改过的不动。
 * 自动带入值记录在 report.autofill 里（旧报告没有记录时，与旧项目推算的值比较）。
 */
export function applyProject(template, report, project, settings, oldProject, previous = []) {
  const next = clone(report);
  next.projectId = project?.id || null;
  next.autofill = { ...(report.autofill || {}) };
  const ctxNew = makeCtx({ template, report: next, project, settings, previous });
  const ctxOld = makeCtx({ template, report: next, project: oldProject, settings, previous });
  for (const f of allFields(template)) {
    if (!isAuto(f)) continue;
    const cur = next.values[f.key];
    const auto = f.key in next.autofill ? same(cur, next.autofill[f.key]) : same(cur, safeDefault(f, ctxOld));
    if (isEmpty(cur) || auto) {
      const v = safeDefault(f, ctxNew);
      next.values[f.key] = v == null ? '' : clone(v);
      if (isEmpty(v)) delete next.autofill[f.key];
      else next.autofill[f.key] = clone(v);
    }
  }
  next.title = reportTitle(template, next, project);
  return next;
}

/** 列表里显示的标题：模板名 · 项目 · 日期 */
export function reportTitle(template, report, project) {
  const v = report.values || {};
  const date = v.date || '';
  const where = project ? siteLabel(project) : v.project || v.address || '';
  return [template.name.zh, where, date].filter(Boolean).join(' · ');
}

function itemAnswered(item, answer) {
  if (item.input) return !isEmpty(answer?.value);
  return !!answer?.r;
}

/** 进度：{ done, total, pct } — 判定项 + 必填字段 */
export function progress(template, report) {
  let done = 0;
  let total = 0;
  for (const f of allFields(template)) {
    if (!f.required) continue;
    total += 1;
    if (!isEmpty(report.values?.[f.key])) done += 1;
  }
  for (const { item } of allItems(template)) {
    total += 1;
    if (itemAnswered(item, report.items?.[item.id])) done += 1;
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 100 };
}

/**
 * 导出前的填写提醒（不阻止导出，只提示）。
 * 返回 [{ level: 'error'|'warn', text, sectionId, target }]
 */
export function issues(template, report, { project, settings } = {}) {
  const out = [];
  for (const s of template.sections) {
    if (s.type === 'fields') {
      for (const f of s.fields) {
        if (f.required && isEmpty(report.values?.[f.key])) {
          out.push({ level: 'warn', text: `未填写：${L(f.label, 'zh')}`, sectionId: s.id, target: f.key });
        }
      }
    }
    if (s.type === 'checklist') {
      let empty = 0;
      for (const it of s.items) {
        const a = report.items?.[it.id];
        if (!itemAnswered(it, a)) {
          empty += 1;
          continue;
        }
        if (it.input) continue;
        const scale = resolveScale(it.scale || s.scale);
        const opt = scale.options.find((o) => o.v === a.r);
        const need = s.remark?.requiredWhen || [];
        if (need.includes(a.r) && !(a.note || '').trim()) {
          out.push({
            level: 'error',
            text: `第 ${it.no} 项「${L(it.title, 'zh')}」判定为${opt?.zh || a.r}，需写明${L(s.remark?.label, 'zh') || '备注'}`,
            sectionId: s.id,
            target: it.id,
          });
        }
        if (it.media && (!a.photos || a.photos.length === 0) && opt?.tone !== 'na') {
          out.push({
            level: 'warn',
            text: `第 ${it.no} 项「${L(it.title, 'zh')}」需要影像存档，还没有照片`,
            sectionId: s.id,
            target: it.id,
          });
        }
      }
      if (empty) {
        out.push({ level: 'warn', text: `${L(s.title, 'zh')}：还有 ${empty} 项未填`, sectionId: s.id });
      }
    }
  }
  if (typeof template.checks === 'function') {
    const ctx = makeCtx({ template, report, project, settings });
    for (const t of template.checks(ctx) || []) out.push({ level: 'warn', text: t });
  }
  return out;
}

/** 报告里引用到的全部媒体 id（删除报告时一起清理） */
export function mediaIds(report) {
  const ids = new Set();
  const add = (arr) => (arr || []).forEach((id) => id && ids.add(id));
  for (const v of Object.values(report.values || {})) {
    if (Array.isArray(v)) add(v.filter((x) => typeof x === 'string' && x.startsWith('m_')));
    else if (typeof v === 'string' && v.startsWith('m_')) ids.add(v);
  }
  for (const a of Object.values(report.items || {})) add(a?.photos);
  for (const rows of Object.values(report.tables || {})) {
    for (const r of rows || []) {
      for (const v of Object.values(r || {})) {
        if (Array.isArray(v)) add(v.filter((x) => typeof x === 'string' && x.startsWith('m_')));
      }
    }
  }
  for (const s of Object.values(report.signatures || {})) if (s?.image) ids.add(s.image);
  return [...ids];
}

/** 复制一份报告（用于「照上次再写一份」）：保留字段，清掉判定 / 照片 / 签名 */
export function duplicateReport(template, src, { project, settings, previous } = {}) {
  const fresh = createReport(template, { project, settings, previous });
  for (const f of allFields(template)) {
    if (f.type === 'photos' || f.type === 'video' || f.bind === 'today') continue;
    if (f.keepOnDuplicate === false || typeof f.default === 'function') continue;
    const v = src.values?.[f.key];
    if (!isEmpty(v)) fresh.values[f.key] = clone(v);
  }
  fresh.title = reportTitle(template, fresh, project);
  return fresh;
}
