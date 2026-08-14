// 内容矩阵的体检 —— prompt 里写了六条硬规矩，但模型总会违反其中一两条。
//
// 「在 prompt 里说清楚」和「保证它做到」是两件事。下面这些检查用代码算，
// 算出来的问题直接摆在 UI 上，让人一眼看到哪一条要重做 ——
// 而不是等发出去三条之后才发现开场镜头全一样。

const OPEN_GAP = 2.0; // 两条内容的开场镜头，用同一素材时至少要隔这么久

/** "A3 6.2-7.0" / "A3 6.2–7.0s" / "A3" → { assetId, from, to } */
export function parseOpenWith(str) {
  const s = String(str || '').trim();
  const id = (s.match(/\b([A-Za-z]\d+)\b/) || [])[1] || '';
  const range = s.match(/(\d+(?:\.\d+)?)\s*[-–~至到]\s*(\d+(?:\.\d+)?)/);
  return {
    assetId: id,
    from: range ? Number(range[1]) : null,
    to: range ? Number(range[2]) : null,
  };
}

const overlaps = (a, b, pad = 0) =>
  a.from != null && b.from != null && a.from - pad < b.to && b.from - pad < a.to;

/** 这段时间落在素材标注的可用片段里吗 */
function insideBestMoment(label, from, to) {
  const ms = label?.best_moments || [];
  if (!ms.length) return null; // 没标注，无从判断
  return ms.some((m) => from >= Number(m.start) - 0.5 && to <= Number(m.end) + 0.5);
}

const VAGUE = [/^展示/, /^介绍/, /案例展示/, /全屋定制$/, /设计理念/, /品牌实力/, /^分享/];

/**
 * 给一份矩阵做体检。
 * @returns {Array<{level:'error'|'warn', pieceId?:string, kind:string, msg:string}>}
 */
export function auditMatrix(matrix, assets = []) {
  const pieces = matrix?.pieces || [];
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]));
  const issues = [];
  const add = (level, kind, msg, pieceId) => issues.push({ level, kind, msg, pieceId });

  // ---- 1. 开场镜头不能撞 ----
  const opens = pieces.map((p) => ({ id: p.id, ...parseOpenWith(p.open_with) }));
  for (let i = 0; i < opens.length; i++) {
    for (let j = i + 1; j < opens.length; j++) {
      const [a, b] = [opens[i], opens[j]];
      if (!a.assetId || a.assetId !== b.assetId) continue;
      const noRange = a.from == null || b.from == null;
      if (noRange || overlaps(a, b, OPEN_GAP)) {
        add(
          'error',
          'open',
          `${a.id} 和 ${b.id} 用同一个开场镜头（${a.assetId}${noRange ? '' : ` ${a.from}s / ${b.from}s`}）。前 1.5 秒决定一切 —— 两条开头一样，第二条就是隐形的。`,
          b.id
        );
      }
    }
  }

  // ---- 2. 引用的时间段必须真的存在 ----
  pieces.forEach((p) => {
    (p.uses || []).forEach((u) => {
      const a = byId[u.assetId];
      if (!a) return add('error', 'asset', `${p.id} 引用了不存在的素材 ${u.assetId}`, p.id);
      const [from, to] = [Number(u.from), Number(u.to)];
      if (a.kind === 'image') return;
      if (!(to > from)) return add('error', 'range', `${p.id} 的 ${u.assetId} 时间段无效（${u.from}→${u.to}）`, p.id);
      if (a.duration && to > Number(a.duration) + 0.1) {
        add('error', 'range', `${p.id} 要用 ${u.assetId} 的 ${from}–${to}s，但这条素材只有 ${Number(a.duration).toFixed(1)}s`, p.id);
      } else if (insideBestMoment(a.label, from, to) === false) {
        add('warn', 'range', `${p.id} 用的 ${u.assetId} ${from}–${to}s 不在标注的可用片段里，剪之前先看一眼`, p.id);
      }
    });
  });

  // ---- 3. 好镜头要摊开 ----
  const usage = {};
  pieces.forEach((p) => new Set((p.uses || []).map((u) => u.assetId)).forEach((id) => (usage[id] = (usage[id] || 0) + 1)));
  Object.entries(usage)
    .filter(([, n]) => n > 2)
    .forEach(([id, n]) => add('warn', 'overuse', `${byId[id]?.name || id} 被 ${n} 条内容用到了。观众认得出同一个画面 —— 确认每条里它承担的作用真的不同。`));

  // ---- 4. 格式不能单一 ----
  const types = new Set(pieces.map((p) => p.type).filter(Boolean));
  if (pieces.length >= 4 && types.size < 4) {
    add('error', 'variety', `${pieces.length} 条里只有 ${types.size} 种形式（${[...types].join('、')}）。连续刷到同一种节奏，第三条就划走了 —— 至少要 4 种。`);
  }
  if (pieces.length >= 5 && !pieces.some((p) => /动态图文|图文帖/.test(p.type || ''))) {
    add('warn', 'variety', '一条不消耗素材的内容都没有。动态图文帖是缺素材时唯一稳定的产能，建议至少留一条。');
  }

  // ---- 5. 一条只讲一件事 ----
  pieces.forEach((p) => {
    const idea = (p.one_idea || '').trim();
    if (!idea) return add('error', 'idea', `${p.id} 没写清楚只讲哪一件事`, p.id);
    if (idea.length < 6 || VAGUE.some((re) => re.test(idea))) {
      add('warn', 'idea', `${p.id} 的观点太笼统（「${idea}」）。「玄关柜为什么做 60 深不做 35」才是一条内容，「案例展示」是一个筐。`, p.id);
    }
  });

  // ---- 6. 素材利用率 ----
  const used = new Set(pieces.flatMap((p) => (p.uses || []).map((u) => u.assetId)));
  const idle = assets.filter((a) => !used.has(a.id));
  if (idle.length) {
    add('warn', 'coverage', `${idle.length} 条素材一次都没用上：${idle.slice(0, 5).map((a) => a.name).join('、')}${idle.length > 5 ? ' 等' : ''}。要么是真的不能用，要么是漏了一个选题。`);
  }

  return issues;
}

/** 给 UI 用的统计 */
export function matrixStats(matrix, assets = []) {
  const pieces = matrix?.pieces || [];
  const used = new Set(pieces.flatMap((p) => (p.uses || []).map((u) => u.assetId)));
  const byType = {};
  pieces.forEach((p) => (byType[p.type || '未分类'] = (byType[p.type || '未分类'] || 0) + 1));
  return {
    count: pieces.length,
    types: byType,
    totalSeconds: pieces.reduce((s, p) => s + (Number(p.duration_s) || 0), 0),
    coverage: assets.length ? used.size / assets.length : 0,
    usedCount: used.size,
    assetCount: assets.length,
    needsShooting: pieces.filter((p) => p.needs_shooting?.length).length,
  };
}

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * 把 calendar 里的「周三」这种说法落成真实日期。
 * 模型排的是节奏，具体哪一天要能看到日历上的位置，不然没法执行。
 *
 * @param {object} matrix
 * @param {Date} [start] 从哪天算第 1 周（默认下一个周一）
 */
export function scheduleMatrix(matrix, start) {
  const base = start ? new Date(start) : nextMonday();
  const byId = Object.fromEntries((matrix?.pieces || []).map((p) => [p.id, p]));

  return (matrix?.calendar || []).map((w) => {
    const weekStart = new Date(base);
    weekStart.setDate(base.getDate() + ((Number(w.week) || 1) - 1) * 7);
    return {
      week: Number(w.week) || 1,
      shape: w.shape || '',
      weekStart,
      slots: (w.slots || []).map((s) => {
        const idx = WEEKDAY.indexOf(String(s.day || '').trim());
        const d = new Date(weekStart);
        // 周一是这一周的第 0 天；WEEKDAY 里周一 = 1
        if (idx >= 0) d.setDate(weekStart.getDate() + ((idx + 6) % 7));
        return { ...s, date: d, piece: byId[s.pieceId] || null };
      }),
    };
  });
}

function nextMonday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d;
}

export const fmtDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
