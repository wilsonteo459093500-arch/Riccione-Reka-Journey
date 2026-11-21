// 「请核对这几处」清单（project.review）：导入时生成（import/review.js），编辑器里打勾消掉。纯函数。
//
// project.review = {
//   createdAt,
//   items: [{ id, kind, page, slideId?, floorId?, text, detail, done?:true }],
// }
//   slideId = 跳到哪一页（效果图页 / 楼层章节页）；没有 = 整份方案的事（no-floors）或原稿页（page-unused）
//
// 一条什么时候不再算「要核对」：
//   - 打了勾（done）
//   - 那一页删掉了 / 那一层删掉了（gone）
//   - 已经改好了（fixed）：没有材料的页加了材料、没楼层的页选了楼层、没空间名的页填了、没楼层的方案加了楼层
//   「空间名沿用上一页」「不是常用空间名」「1F 认成二楼」「原稿页没用上」改没改看不出来，一定要设计师打勾

import { uid } from '../engine/model.js';

/**
 * 导入：草稿（原稿页码 / 楼层 key）→ 存进项目的清单（页 id / 楼层 id）
 * @param {Array} drafts  import/review.js buildReview()
 * @param {{ project:object, floorId:Map<string,string> }} ctx  project 已排好 slides（view 页带 sourcePage）
 * @returns {object|null}  没有要核对的 → null
 */
export function reviewFromDrafts(drafts, { project, floorId }) {
  if (!drafts?.length) return null;
  const slides = project.slides || [];
  const viewByPage = new Map();
  for (const s of slides) if (s.kind === 'view' && s.sourcePage && !viewByPage.has(s.sourcePage)) viewByPage.set(s.sourcePage, s.id);
  const floorSlideOf = (fid) => slides.find((s) => s.kind === 'floor' && s.floorId === fid)?.id || null;
  const items = [];
  for (const d of drafts) {
    const item = { id: uid('r'), kind: d.kind, page: d.page ?? null, text: d.text, detail: d.detail || '' };
    if (d.kind === 'floor-guess') {
      const fid = floorId?.get(d.floorKey);
      if (!fid) continue;
      item.floorId = fid;
      const sid = floorSlideOf(fid);
      if (sid) item.slideId = sid;
    } else if (d.kind !== 'page-unused' && d.kind !== 'no-floors') {
      const sid = viewByPage.get(d.page);
      if (!sid) continue;
      item.slideId = sid;
    }
    items.push(item);
  }
  return items.length ? { createdAt: Date.now(), items } : null;
}

/** 这一条现在的状态：'open' 要核对 | 'done' 打了勾 | 'fixed' 已经改好了 | 'gone' 那一页 / 那一层不在了 */
export function reviewStatus(project, item) {
  const slide = item.slideId ? (project.slides || []).find((s) => s.id === item.slideId) : null;
  if (item.slideId && !slide) return 'gone';
  if (item.floorId && !(project.floors || []).some((f) => f.id === item.floorId)) return 'gone';
  if (item.done) return 'done';
  switch (item.kind) {
    case 'no-materials':
      return slide?.materials?.length ? 'fixed' : 'open';
    case 'no-floor':
      return slide?.floorId ? 'fixed' : 'open';
    case 'room-none':
      return String(slide?.room || '').trim() ? 'fixed' : 'open';
    case 'no-floors':
      return (project.floors || []).length ? 'fixed' : 'open';
    default:
      return 'open';
  }
}

/** 清单（不含 gone）每条带 status；按存的顺序（原稿页序） */
export function reviewList(project) {
  return (project?.review?.items || []).map((it) => ({ ...it, status: reviewStatus(project, it) })).filter((it) => it.status !== 'gone');
}

/** 还要核对的条数 */
export const openReviewCount = (project) => reviewList(project).filter((it) => it.status === 'open').length;

/** 某一页还要核对的 */
export const slideReview = (project, slideId) => reviewList(project).filter((it) => it.slideId === slideId && it.status === 'open');

/** 打勾 / 取消打勾 */
export function setReviewDone(project, id, done = true) {
  const items = project?.review?.items;
  if (!items?.some((it) => it.id === id)) return project;
  return {
    ...project,
    review: {
      ...project.review,
      items: items.map((it) => {
        if (it.id !== id) return it;
        if (done) return { ...it, done: true };
        const { done: _d, ...rest } = it;
        return rest;
      }),
    },
  };
}
