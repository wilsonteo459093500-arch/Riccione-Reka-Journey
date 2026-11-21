// 展厅播放 · 播放前检查：点「展厅播放」先过一遍，有问题在客人来之前就看到，不是播到那一页才发现。
//
// 和「导出前检查」同一套页面提醒（renderDeck 的 warnings、缺英文、本机找不到的图），再加只有播放才有的三样：
//   · 满版效果图右下角的说明栏放不下（timeline.js 记在停点的 notes 上）
//   · 3D 户型开场画不出来（播放时跳过那一页）
//   · 导出时说「满版大图不显示说明」—— 播放时说明另有一栏，这句不适用，去掉
// 纯函数，Node 里可测；浏览器里的状态（缺图、3D 画好没）由调用方传进来。

import { exportHealth } from '../lib/langUi.js';
import { isMissWarning } from '../engine/lang.js';

/** 「满版大图不显示说明与材料 —— …」：播放时说明有一栏，只剩材料那半句；只说说明的整句不要 */
export function showWarning(w) {
  const m = /^满版大图不显示(说明与材料|说明|材料)/.exec(String(w || ''));
  if (!m) return w;
  if (m[1] === '说明') return null;
  return '满版大图左下角只印前几行材料，其余的播放时看不到 —— 要全部列出来请换成「图文」版式';
}

/**
 * @param {object[]} stops  buildStops() 的结果
 * @param {{ missingImages?:(page:object)=>number, plan3d?:(floor:object)=>'ready'|'pending'|'failed' }} opts
 * @returns {{
 *   issues: { key, slideId, page:number, label, level:'error'|'warn', msgs:string[] }[],  page = 第几个停点（从 1 数）
 *   missing: object|null,   缺英文汇总（同 exportHealth）
 *   pending3d: number,      还在准备的 3D 开场
 *   ok: boolean             一条提醒都没有
 * }}
 */
export function showroomHealth(stops, { missingImages = () => 0, plan3d = () => 'ready' } = {}) {
  const issues = [];
  let pending3d = 0;
  (stops || []).forEach((s, i) => {
    const msgs = [];
    let level = 'warn';
    if (s.plan3d) {
      const st = plan3d(s.plan3d);
      if (st === 'pending') pending3d += 1;
      if (st === 'failed') {
        level = 'error';
        msgs.push('3D 户型开场画不出来 —— 播放时会跳过这一页（到「3D 立体图」重新核对一次坐标可以修好）');
      }
    } else {
      // 设计特点那一页用的是同一张效果图，原页已经查过，不重复报
      if (!s.craft) {
        for (const w of s.page?.warnings || []) {
          if (isMissWarning(w)) continue;
          const t = showWarning(w);
          if (t) msgs.push(t);
        }
        const n = missingImages(s.page) || 0;
        if (n) {
          level = 'error';
          msgs.push(n > 1 ? `${n} 张图片在本机找不到 —— 播放时那几处是空的` : '有一张图片在本机找不到 —— 播放时那里是空的');
        }
      }
      if (s.notes && s.notes.shown < s.notes.total) {
        msgs.push(`设计说明写了 ${s.notes.total} 条，播放时右下角只放得下前 ${s.notes.shown} 条 —— 要全部显示请精简文字，或换成「图文」版式`);
      }
      if (s.notes?.cut) msgs.push(`有 ${s.notes.cut} 条设计说明超过 3 行，播放时后面截短了`);
    }
    if (msgs.length) issues.push({ key: s.key, slideId: s.slide?.id || null, page: i + 1, label: s.label || '', level, msgs: [...new Set(msgs)] });
  });
  const pages = (stops || []).filter((s) => !s.craft && !s.plan3d).map((s) => s.page);
  const { missing } = exportHealth(pages);
  return { issues, missing, pending3d, ok: !issues.length && !missing };
}

/** 清单按「会出洋相的」排前面 */
export const sortIssues = (issues) => [...(issues || [])].sort((a, b) => (a.level === b.level ? a.page - b.page : a.level === 'error' ? -1 : 1));
