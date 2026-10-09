// 模板可复用的小工具（模板文件里 import 用）
import { resolveScale } from './schema.js';

/**
 * 统计某个 checklist 节（或全部节）的判定结果。
 * 返回 { P: 3, F: 1, NA: 0, _empty: 2, _total: 6, _keyFail: 1 }
 */
export function countResults(ctx, sectionId = null) {
  const out = { _empty: 0, _total: 0, _keyFail: 0 };
  for (const s of ctx.template.sections) {
    if (s.type !== 'checklist') continue;
    if (sectionId && s.id !== sectionId) continue;
    for (const it of s.items) {
      if (it.input) continue; // 填写型不计入判定
      out._total += 1;
      const a = ctx.report.items?.[it.id];
      const r = a?.r;
      if (!r) {
        out._empty += 1;
        continue;
      }
      out[r] = (out[r] || 0) + 1;
      const opt = resolveScale(it.scale || s.scale).options.find((o) => o.v === r);
      if (it.key && opt?.tone === 'fail') out._keyFail += 1;
    }
  }
  return out;
}

/** 关键项（★）中判定为 fail 的项目列表 */
export function keyFails(ctx) {
  const out = [];
  for (const s of ctx.template.sections) {
    if (s.type !== 'checklist') continue;
    for (const it of s.items) {
      if (!it.key || it.input) continue;
      const r = ctx.report.items?.[it.id]?.r;
      const opt = resolveScale(it.scale || s.scale).options.find((o) => o.v === r);
      if (opt?.tone === 'fail') out.push({ section: s, item: it });
    }
  }
  return out;
}

/** 所有判定为 fail 的项目 */
export function allFails(ctx) {
  const out = [];
  for (const s of ctx.template.sections) {
    if (s.type !== 'checklist') continue;
    for (const it of s.items) {
      if (it.input) continue;
      const r = ctx.report.items?.[it.id]?.r;
      const opt = resolveScale(it.scale || s.scale).options.find((o) => o.v === r);
      if (opt?.tone === 'fail') out.push({ section: s, item: it, answer: ctx.report.items[it.id] });
    }
  }
  return out;
}

/** 取字段值（values 命名空间） */
export const val = (ctx, key) => ctx.report.values?.[key];
