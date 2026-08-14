// 体检的公共底座。
//
// 「量产」和「再切」各自都要做体检，而且有一条规则是**同一条**：
// 两条内容的开场不能撞 —— 前 1.5 秒决定一切，两条开头一样，第二条在信息流里是隐形的。
//
// 这条规则原本在两个文件里各写了一遍，连 2.0 秒这个阈值都各定义了一次。
// 同一条规则有两份实现，迟早会飘：改了一边忘另一边，然后两个页面对「撞车」的判断不一致。
//
// issue 的字段名也统一到这里。以前一处叫 pieceId、一处叫 id，
// 结果两个页面各写了一遍几乎相同的渲染代码。

/** 两条内容的开场至少要隔这么久（秒） */
export const OPEN_GAP = 2.0;

/**
 * 统一的问题条目。
 * @param {'error'|'warn'} level  error = 硬伤，不改会出废片或废内容；warn = 值得看一眼
 * @param {string} kind  分类 slug，UI 用来分组
 * @param {string} msg   给人看的话，要说清「为什么这是问题」，不能只说「有问题」
 * @param {string} [ref] 关联到哪一条（piece id / short id），没有就是全局问题
 */
export const issue = (level, kind, msg, ref) => ({ level, kind, msg, ref });

/** 收集器：`const { add, issues } = collector()` */
export function collector() {
  const issues = [];
  return {
    issues,
    add: (level, kind, msg, ref) => issues.push(issue(level, kind, msg, ref)),
  };
}

/** 硬伤优先，其次保持原顺序 */
export const sortIssues = (issues = []) =>
  [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));

export const countIssues = (issues = []) => ({
  errors: issues.filter((i) => i.level === 'error').length,
  warns: issues.filter((i) => i.level === 'warn').length,
});

export const issuesFor = (issues = [], ref) => issues.filter((i) => i.ref === ref);

/**
 * 开场撞车检测 —— 「量产」和「再切」共用这一份实现。
 *
 * @param {Array<{ref:string, source?:string|null, from:number|null, to:number|null}>} opens
 *        source 是「开场镜头取自哪里」：量产是素材 id，再切都来自同一条主片所以传 null。
 *        from/to 是开场那一小段在该来源上的位置；只有一个时间点就 from=to。
 * @param {object} [opts] { gap, unknownIsClash }
 *        unknownIsClash：两条用同一来源但都没写时间段时，是否保守判为撞车。
 * @returns {Array<{a:string, b:string, source:string|null, gap:number|null}>}
 */
export function findOpeningClashes(opens = [], { gap = OPEN_GAP, unknownIsClash = true } = {}) {
  const out = [];
  for (let i = 0; i < opens.length; i++) {
    for (let j = i + 1; j < opens.length; j++) {
      const [a, b] = [opens[i], opens[j]];
      // 来源不同 = 画面不同 = 不可能撞
      if ((a.source ?? null) !== (b.source ?? null)) continue;

      const unknown = a.from == null || b.from == null;
      if (unknown) {
        if (unknownIsClash) out.push({ a: a.ref, b: b.ref, source: a.source ?? null, gap: null });
        continue;
      }
      // 两段各自向外扩 gap 秒后如果还相交，就算太近
      if (a.from - gap < b.to && b.from - gap < a.to) {
        const distance = Math.max(0, Math.max(a.from, b.from) - Math.min(a.to, b.to));
        out.push({ a: a.ref, b: b.ref, source: a.source ?? null, gap: distance });
      }
    }
  }
  return out;
}

/**
 * 把若干区间合并后算总覆盖长度。
 * 「量产」算素材利用率、「再切」算主片利用率都要用 ——
 * 不合并的话，0–10 和 5–15 两段会被算成 20 秒，利用率虚高一倍。
 */
export function mergedSpan(spans = []) {
  const clean = spans
    .map(([a, b]) => [Number(a), Number(b)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);

  let covered = 0;
  let start = null;
  let end = null;
  for (const [a, b] of clean) {
    if (end === null || a > end) {
      if (end !== null) covered += end - start;
      [start, end] = [a, b];
    } else {
      end = Math.max(end, b);
    }
  }
  if (end !== null) covered += end - start;
  return Number(covered.toFixed(2));
}
