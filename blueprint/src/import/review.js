// 导入后「请核对这几处」：程序认得没把握的地方（analyze.js 的结果）→ 一张清单。纯函数，无 DOM。
// 认字规则不在这里改（那是 labels.js / analyze.js 的事）；这里只把「这一处是猜的」说出来，交给设计师核对、打勾。
//
// ReviewDraft = { kind, page, floorKey?, text, detail }
//   kind：
//     room-prev     没认出这一页的标题，空间名沿用上一页
//     room-none     没认出空间名（前面也没有可以沿用的）
//     room-unknown  认出了标题，但不是常用的空间名（空间名 / 英文名是照原稿的字拆的）
//     materials-prev  效果图页没有自己的色板，材料照同一空间的另一页放（连着几页照同一页的合成一条）
//     no-materials  效果图页没有材料
//     no-floor      效果图页不在任何楼层里（排在第一个楼层页之前）
//     no-floors     整份原稿没认出楼层
//     floor-guess   楼层是从 '1F' 这种写法推断的（一楼还是 GF 上面那层，要看整份方案）
//     page-unused   原稿这一页没用上（不是效果图、楼层页、封面…）

export const REVIEW_KINDS = {
  'room-prev': '空间名',
  'room-none': '空间名',
  'room-unknown': '空间名',
  'materials-prev': '材料',
  'no-materials': '材料',
  'no-floor': '楼层',
  'no-floors': '楼层',
  'floor-guess': '楼层',
  'page-unused': '没用上的原稿页',
};

const q = (s) => `「${String(s || '').trim()}」`;
const short = (s, n = 24) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

const pagesText = (ps) => (ps.length > 1 && ps[ps.length - 1] - ps[0] === ps.length - 1 ? `第 ${ps[0]}–${ps[ps.length - 1]} 页` : `第 ${ps.join('、')} 页`);
const materialsPrevDetail = (it) =>
  `原稿${pagesText(it.pages)}没有自己的色板，程序照同一空间（${it.room || '同一空间'}）第 ${it.from} 页的材料放了（最多 3 种）。看一眼${it.pages.length > 1 ? '这几页' : '这一页'}的柜子是不是这些材料。`;

/**
 * @param {object} analysis  analyzePages() 的结果
 * @returns {Array<{ kind, page:number|null, floorKey?:string, text:string, detail:string }>}  按原稿页序；整份方案的（no-floors）在最前
 */
export function buildReview(analysis) {
  const out = [];
  const views = analysis?.views || [];
  const floors = analysis?.floors || [];
  const floorByKey = new Map(floors.map((f) => [f.key, f]));

  if (views.length && !floors.length) {
    out.push({
      kind: 'no-floors',
      page: null,
      text: '原稿没有认出楼层',
      detail: '整套没分楼层。需要分的话，到「项目信息 → 楼层」加楼层，再在每页右边的「楼层」里选。',
    });
  }

  for (const f of floors) {
    if (!f.nfGuess) continue;
    out.push({
      kind: 'floor-guess',
      page: f.nfGuess.page || f.page || null,
      floorKey: f.key,
      text: `${q(f.nfGuess.text)}认成了${q(f.zh)}`,
      detail: analysis.nfAboveGround
        ? '这份方案另外写了 GF，所以 1F 当成 GF 上面那层。不对的话，在这一页把楼层名改掉（整层一起变）。'
        : '照中文习惯 1F = 一楼。如果这份方案的 1F 其实是 GF 上面那层，在这一页把楼层名改掉（整层一起变）。',
    });
  }

  for (const v of views) {
    const title = short(v.titleRaw);
    const titleNote = title ? `这一页的标题${q(title)}没认出来。` : '这一页没有认出标题。';
    if (v.roomFrom === 'prev') {
      out.push({ kind: 'room-prev', page: v.page, text: `空间名沿用了上一页的${q(v.room || v.roomEn)}`, detail: `${titleNote}是同一个空间就打勾，不是就在右边改「房间」。` });
    } else if (v.roomFrom === 'none') {
      out.push({ kind: 'room-none', page: v.page, text: '没认出空间名', detail: `${titleNote}在右边填「房间」。` });
    } else if (v.roomFrom === 'title' && !v.roomKnown) {
      out.push({
        kind: 'room-unknown',
        page: v.page,
        text: `${q(v.room || v.roomEn)}不是常用的空间名`,
        detail: `空间名和英文名是照原稿${title ? q(title) : '的字'}拆出来的，看一眼对不对。`,
      });
    }
    if (v.inherited && v.inheritedFrom) {
      const last = out[out.length - 1];
      const run = last?.kind === 'materials-prev' && last.from === v.inheritedFrom && last.room === v.room ? last : null;
      if (run) {
        run.pages.push(v.page);
        run.detail = materialsPrevDetail(run);
      } else {
        const item = { kind: 'materials-prev', page: v.page, pages: [v.page], from: v.inheritedFrom, room: v.room, text: `材料照原稿第 ${v.inheritedFrom} 页放的`, detail: '' };
        item.detail = materialsPrevDetail(item);
        out.push(item);
      }
    }
    if (!v.materials?.length) {
      out.push({ kind: 'no-materials', page: v.page, text: '这页没有材料', detail: '原稿这一页没认出色板或材料编号，同一空间的其它页也没有可以沿用的。' });
    }
    if (!v.floorKey && floors.length) {
      out.push({ kind: 'no-floor', page: v.page, text: '不在任何楼层里', detail: '这一页排在第一个楼层页之前。要归到哪一层，在右边「楼层」里选。' });
    }
  }

  for (const pg of analysis?.pages || []) {
    if (pg.kind !== 'other' || pg.used) continue;
    const t = short(pg.title);
    out.push({
      kind: 'page-unused',
      page: pg.n,
      text: `原稿第 ${pg.n} 页没用上`,
      detail: `${t ? `${q(t)}：` : ''}不是效果图、楼层页或封面。要用的话，在页面列表里「后面加一页」放进去。`,
    });
  }

  return out
    .map((x, i) => ({ x, i }))
    .sort((a, b) => (a.x.page ?? -1) - (b.x.page ?? -1) || a.i - b.i)
    .map(({ x }) => {
      const { from: _f, room: _r, pages: _p, ...rest } = x;
      return rest;
    });
}
