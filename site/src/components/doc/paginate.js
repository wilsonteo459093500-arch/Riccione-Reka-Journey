// 文档分页：DocModel → 原子（不可拆分的最小排版单位）→ 按测量高度装页
// ------------------------------------------------------------
// 原子 Atom = { kind, space, keep?, group?, ... }
//   space  与上一个原子的间距（在页首时忽略）
//   keep   与下一个原子同页（标题不落单、行与第一行照片同页）
//   group  所属表格 id：换页后在新页顶部重复表头（contHead）
//   cont   长文字切出来的续块（检查表 / 表格续行：序号、项目、判定格留空，同一列接着写）
//   fit    可重切的文字 key：实测仍超过一页时，DocPages 按 fit[key] 缩小切块再排一次
// 纯函数、无 DOM：同样的输入永远得到同样的分页。
import { PHOTO, FIRST_AVAIL, CONT_AVAIL, CONTENT_W } from './theme.js';

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const isText = (s) => s != null && String(s).trim() !== '';

// ---- 列宽（blocks.jsx 渲染和这里切块共用一份） ----

/** 检查表列宽 */
export function clLayout(b) {
  const NO = 34;
  const std = b.showStandard ? 160 : 0;
  const meth = b.showMethod ? 122 : 0;
  const n = (b.options || []).length || 1;
  const optW = n <= 2 ? 54 : 46;
  const res = b.resultLayout === 'columns' ? optW * n : 104;
  const rem = std && meth ? 128 : std || meth ? 140 : 150;
  const item = CONTENT_W - NO - std - meth - res - rem;
  return { NO, item, std, meth, res, optW, rem };
}

export function tblLayout(b) {
  const NO = 28;
  const avail = CONTENT_W - NO;
  const total = b.columns.reduce((s, c) => s + (c.width || 1), 0) || 1;
  let acc = 0;
  const ws = b.columns.map((c, i) => {
    if (i === b.columns.length - 1) return avail - acc;
    const w = Math.floor((avail * (c.width || 1)) / total);
    acc += w;
    return w;
  });
  return { NO, ws };
}

export const GRID_LABEL_W = { 1: 140, 2: 104, 3: 86 };
export const LONG_VALUE = 22; // 超过这个长度的统计值不放小卡片，改成整行

// ---- 文字折行估算（宁多勿少：估多了只是块切小一点，估少了会被裁掉） ----
// 中文 / 全角 ≈ 1em，其余 ≈ 0.6em；每行再扣 2em 吸收英文按词换行、中文不能半个字的损失
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;
const charW = (ch, size) => (ch.length > 1 || WIDE.test(ch) ? size : size * 0.6);
const lineW = (width, size) => Math.max(size * 2, width - size * 2);
function textW(s, size) {
  let w = 0;
  for (const ch of s) w += charW(ch, size);
  return w;
}

/** 估算折行后的行数：每个 '\n' 段至少 1 行 */
export function textLines(text, width, size) {
  const eff = lineW(width, size);
  let n = 0;
  for (const p of String(text ?? '').split('\n')) n += Math.max(1, Math.ceil(textW(p, size) / eff));
  return n;
}

// 硬切时优先切在这些字后面 / 开括号前面（括号里的编号如【P12】不拆开）
const BREAK = /[\s,.;:!?，。；：！？、）)】」』]/;
const OPEN = /[（(【「『]/;
const CLOSE = /[）)】」』]/;
// 一个字（字形簇）中间不能切：组合符 / 变体选择符 / 键帽 / 肤色 / 标签字符前面、ZWJ 后面、国旗的两个字母之间
const GLUE = /^[\p{M}\u200D\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/u;
const RI = /^[\u{1F1E6}-\u{1F1FF}]/u;
function glued(p, k) {
  if (k <= 0 || k >= p.length) return false;
  const c = p.charCodeAt(k);
  if (c >= 0xdc00 && c <= 0xdfff) return true; // 代理对中间
  if (p[k - 1] === '\u200D' || GLUE.test(p.slice(k, k + 2))) return true;
  if (!RI.test(p.slice(k, k + 2))) return false;
  let n = 0; // 前面连着奇数个区域字母 = 切在一面国旗中间
  for (let j = k; j >= 2 && RI.test(p.slice(j - 2, j)); j -= 2) n += 1;
  return n % 2 === 1;
}

/**
 * 长文本切块，保证每块都放得进一页：按段落装块，每块 ≤ maxChars 字、估算 ≤ maxLines 行
 * （width > 0 时按列宽 / 字号估算折行，每个 '\n' 段至少算 1 行；width = 0 时只数段数）。
 * 稍长的段落（≤ 1.5 倍）整段成块；更长的段落硬切：切点前 24 字内有没配对的开括号（【P0001-ABCD】编号）
 * 就切在开括号前，否则尽量切在标点 / 空格后面；永远不切在一个字（emoji 序列、组合符）中间。
 * opts 也可以直接传数字 = maxChars。
 */
export function splitText(text, opts = {}) {
  const { maxChars = 520, maxLines = Infinity, width = 0, size = 11 } = typeof opts === 'number' ? { maxChars: opts } : opts;
  const eff = width > 0 ? lineW(width, size) : 0;
  // 估算一段的行数；超过 cap 行就不往下数了（一大段每切一刀都重数整段会变成 O(n²)）
  const linesOf = (p, cap) => {
    if (!eff) return 1;
    const lim = cap * eff;
    let w = 0;
    for (const ch of p) {
      w += charW(ch, size);
      if (w > lim) break;
    }
    return Math.max(1, Math.ceil(w / eff));
  };
  // 从 p 开头切出 ≤ lines 行、≤ chars 字的一截，返回切点（至少一个字）。
  // soft = 当前块里已经有内容：返回 0 表示剩下的地方放不下（括号编号 / 一个字太宽），先换块
  const cutAt = (p, lines, chars, soft) => {
    const cap = lines * eff;
    let w = 0;
    let i = 0;
    while (i < p.length && i < chars) {
      const ch = String.fromCodePoint(p.codePointAt(i));
      if (eff) {
        w += charW(ch, size);
        if (w > cap) break;
      }
      i += ch.length;
    }
    if (i === 0) i = String.fromCodePoint(p.codePointAt(0)).length;
    if (i >= p.length) return p.length;
    for (let k = i - 1; k >= Math.max(0, i - 24); k -= 1) {
      if (CLOSE.test(p[k])) break;
      if (OPEN.test(p[k])) {
        if ((k > 0 || soft) && !glued(p, k)) return k;
        break;
      }
    }
    for (let k = i; k > Math.max(0, i - 12); k -= 1) if ((BREAK.test(p[k - 1]) || OPEN.test(p[k])) && !glued(p, k)) return k;
    let k = i;
    while (k > 0 && k > i - 32 && glued(p, k)) k -= 1;
    if (glued(p, k)) return i; // 乱码式的超长组合符串：照切
    if (k > 0 || soft) return k;
    for (k = i; k < i + 32 && glued(p, k); ) k += 1; // 一个字（很长的 emoji 序列）都放不下：整个放进来
    return k;
  };
  const out = [];
  let cur = [];
  let lines = 0;
  let chars = 0;
  const flush = () => {
    if (cur.length) out.push(cur.join('\n'));
    cur = [];
    lines = 0;
    chars = 0;
  };
  for (let p of String(text ?? '').split('\n')) {
    while (true) {
      const pl = linesOf(p, maxLines * 1.5);
      if (lines + pl <= maxLines && chars + p.length <= maxChars) {
        cur.push(p);
        lines += pl;
        chars += p.length + 1;
        break;
      }
      if (pl <= maxLines * 1.5 && p.length <= maxChars * 1.6) {
        flush();
        cur.push(p);
        lines = pl;
        chars = p.length + 1;
        break;
      }
      // 段落太长：先用掉当前块剩下的空间（剩得太少就先换块），切出一截
      if (cur.length && (maxLines - lines < 2 || maxChars - chars < 20)) {
        flush();
        continue;
      }
      const k = cutAt(p, maxLines - lines, maxChars - chars, cur.length > 0);
      if (!k) {
        flush();
        continue;
      }
      cur.push(p.slice(0, k));
      flush();
      p = p.slice(k);
      if (!p) break;
    }
  }
  flush();
  return out.length ? out : [''];
}

// 长文字切块的目标高度（≈ 1/4 页）：块小一点，换页时页尾留白也小；不到 1.5 倍的不切
const CHUNK_H = 240;
const budget = (lh, fit = 1) => Math.max(1, Math.floor((CHUNK_H * fit) / lh));

/** 一段文字 → 若干块（不用切时原样一块） */
function textSegs(text, width, size, lh, fit = 1) {
  const maxLines = budget(lh, fit);
  if (!isText(text) || textLines(text, width, size) <= maxLines * 1.5) return [text];
  return splitText(text, { maxChars: Infinity, maxLines, width, size });
}

/** 列表逐条装块（按估算折行行数）；单条太长再切开，续上的半条不画圆点（contLine） */
function bulletSegs(lines, width, size, lh, fit = 1) {
  const maxLines = budget(lh, fit);
  const w = width - 12; // 圆点 + 间距
  const n = lines.map((l) => textLines(l, w, size));
  if (n.reduce((s, x) => s + x, 0) <= maxLines * 1.5) return [{ lines }];
  const out = [];
  let cur = [];
  let used = 0;
  let contLine = false;
  const flush = () => {
    if (cur.length) out.push({ lines: cur, contLine });
    cur = [];
    used = 0;
    contLine = false;
  };
  lines.forEach((l, i) => {
    if (used + n[i] <= maxLines) {
      cur.push(l);
      used += n[i];
      return;
    }
    if (n[i] <= maxLines * 1.5) {
      flush();
      cur.push(l);
      used = n[i];
      return;
    }
    splitText(l, { maxChars: Infinity, maxLines, width: w, size }).forEach((p, k) => {
      flush();
      contLine = k > 0;
      cur.push(p);
      used = textLines(p, w, size);
    });
  });
  flush();
  return out;
}

// 各处长文字所在列的文字宽度（扣掉内边距 / 边框）、字号、行高，与 blocks.jsx 对应
const gridTextW = (cols, span = cols) => Math.round((span * CONTENT_W) / cols) - (GRID_LABEL_W[cols] || 80) - 19;
const TICK_W = CONTENT_W - 42;
const SUM_LONG_W = CONTENT_W - 3 - 150 - 12; // 统计整行：左边条 + 标签列 + 右内边距

/** 网格信息栏：按 span 分行，最后一格补满整行 */
export function gridRows(fields, cols) {
  const rows = [];
  let cur = [];
  let used = 0;
  const flush = () => {
    if (!cur.length) return;
    cur[cur.length - 1].span += cols - used;
    rows.push(cur);
    cur = [];
    used = 0;
  };
  for (const f of fields) {
    const span = Math.max(1, Math.min(cols, f.span || 1));
    if (used + span > cols) flush();
    cur.push({ field: f, span });
    used += span;
  }
  flush();
  return rows;
}

// ---- 各类块 → 原子 ----

function headAtoms(push, b, space, extra = {}) {
  if (!b.title || !(b.title.zh || b.title.en || typeof b.title === 'string')) return false;
  push({ kind: 'secHead', block: b, keep: true, space, ...extra });
  return true;
}

function fieldsAtoms(push, b, fit) {
  const hasHead = headAtoms(push, b, b.layout === 'list' ? 18 : 22);
  const keyOf = (f) => `${b.id}:${f.key}`;
  const first = { space: hasHead ? 0 : 16 };
  let firstUsed = false;
  const sp = () => {
    if (firstUsed) return 0;
    firstUsed = true;
    return first.space;
  };

  if (b.layout === 'list') {
    // 文案类：连续的短字段两两并排；长文本 / 列表 / 照片 / 视频独占一行
    const fields = b.fields;
    let i = 0;
    while (i < fields.length) {
      const f = fields[i];
      const short = (x) => x && x.kind === 'inline' && (x.span || 1) < 2 && String(x.value || '').length <= 40;
      if (short(f) && short(fields[i + 1])) {
        push({ kind: 'listRow', block: b, cells: [fields[i], fields[i + 1]], space: sp() });
        i += 2;
        continue;
      }
      if (f.kind === 'photos' && f.photos?.length) {
        const lines = chunk(f.photos, PHOTO.lg.per);
        push({ kind: 'listRow', block: b, cells: [f], mediaHead: true, keep: true, space: sp() });
        lines.forEach((ph, li) =>
          push({ kind: 'photoLine', block: b, photos: ph, size: 'lg', frame: 'none', space: li ? PHOTO.lg.gap : 6, lineEnd: li === lines.length - 1 }),
        );
      } else if ((f.kind === 'block' || f.kind === 'inline') && isText(f.value)) {
        // 长文字（字多或行多）切成几块，块间可换页
        textSegs(f.value, CONTENT_W, 12, 18, fit[keyOf(f)]).forEach((t, k) =>
          push({ kind: 'listRow', block: b, cells: [{ ...f, value: t }], cont: k > 0, fit: keyOf(f), space: k ? 0 : sp() }),
        );
      } else if (f.kind === 'list' && (f.lines || []).length) {
        bulletSegs(f.lines, CONTENT_W, 12, 18, fit[keyOf(f)]).forEach((s, k) =>
          push({ kind: 'listRow', block: b, cells: [{ ...f, lines: s.lines, contLine: s.contLine }], cont: k > 0, fit: keyOf(f), space: k ? 0 : sp() }),
        );
      } else {
        push({ kind: 'listRow', block: b, cells: [f], space: sp() });
      }
      i += 1;
    }
    return;
  }

  // 网格：信息表格
  const cols = Math.max(1, b.columns || 2);
  const normal = [];
  const flushNormal = () => {
    if (!normal.length) return;
    const rows = gridRows(normal.splice(0), cols);
    rows.forEach((cells) => push({ kind: 'gridRow', block: b, cols, cells, fit: cells.map((c) => keyOf(c.field)), space: sp() }));
  };
  const GW = gridTextW(cols);
  for (const f of b.fields) {
    // 很长的单行字段（如一大段地址）：独占一行，按长文字切
    const long =
      f.kind === 'inline' &&
      isText(f.value) &&
      textLines(f.value, gridTextW(cols, Math.max(1, Math.min(cols, f.span || 1))), 11) > budget(16, fit[keyOf(f)]) * 1.5;
    const full = f.kind === 'photos' || f.kind === 'video' || f.kind === 'block' || f.kind === 'list' || long;
    if (!full) {
      normal.push(f);
      continue;
    }
    flushNormal();
    if (f.kind === 'photos' && f.photos?.length) {
      const lines = chunk(f.photos, PHOTO.sm.per);
      push({ kind: 'gridRow', block: b, cols, cells: [{ field: f, span: cols }], mediaHead: true, keep: true, space: sp() });
      lines.forEach((ph, li) =>
        push({ kind: 'photoLine', block: b, photos: ph, size: 'sm', frame: 'grid', space: 0, lineEnd: li === lines.length - 1 }),
      );
    } else if ((f.kind === 'block' || long) && isText(f.value)) {
      textSegs(f.value, GW, 11, 16, fit[keyOf(f)]).forEach((t, k) =>
        push({ kind: 'gridRow', block: b, cols, cells: [{ field: { ...f, value: t }, span: cols, cont: k > 0 }], fit: keyOf(f), space: k ? 0 : sp() }),
      );
    } else if (f.kind === 'list' && (f.lines || []).length) {
      bulletSegs(f.lines, GW, 11, 16, fit[keyOf(f)]).forEach((s, k) =>
        push({
          kind: 'gridRow',
          block: b,
          cols,
          cells: [{ field: { ...f, lines: s.lines, contLine: s.contLine }, span: cols, cont: k > 0 }],
          fit: keyOf(f),
          space: k ? 0 : sp(),
        }),
      );
    } else {
      push({ kind: 'gridRow', block: b, cols, cells: [{ field: f, span: cols }], space: sp() });
    }
  }
  flushNormal();
}

/** 填写项的内容（文字或逐行列表）→ 若干块 */
function inputSegs(row, width, fit) {
  if (row.lines && row.lines.length) return bulletSegs(row.lines, width, 10.5, 16, fit);
  return textSegs(row.value, width, 10.5, 16, fit).map((value) => ({ value }));
}

/**
 * 检查项的长备注 / 长填写内容切成几段 → [{ row, remarkCont? }]
 * 第一段跟检查项同一行，后面的段是续行（序号 / 项目 / 判定格留空，同一列接着写）。
 */
function rowSegs(b, row, ticks, fit) {
  if (ticks) {
    // 打勾清单：填写内容和备注都在同一宽列里，先填写内容、再备注
    const ins = row.input ? inputSegs(row, TICK_W, fit) : [null];
    const rems = textSegs(row.remark, TICK_W, 10, 15, fit);
    if (ins.length === 1 && rems.length === 1) return [{ row }];
    const out = ins.map((s) => ({ row: { ...row, ...(s || {}), remark: '' } }));
    out[out.length - 1].row.remark = rems[0];
    rems.slice(1).forEach((t) => out.push({ row: { ...row, input: false, remark: t }, remarkCont: true }));
    return out;
  }
  const Lc = clLayout(b);
  const segs = row.input
    ? inputSegs(row, Lc.res + Lc.rem - 15, fit)
    : textSegs(row.remark, Lc.rem - 15, 10, 15, fit).map((remark) => ({ remark }));
  if (segs.length === 1) return [{ row }];
  return segs.map((s) => ({ row: { ...row, ...s } }));
}

function checklistAtoms(push, b, fit) {
  const ticks = b.resultLayout === 'ticks';
  const hasHead = headAtoms(push, b, 22);
  if (!ticks) push({ kind: 'clHead', block: b, keep: true, space: hasHead ? 0 : 16 });
  const group = ticks ? null : b.id;
  b.rows.forEach((row, ri) => {
    const lines = chunk(row.photos || [], PHOTO.sm.per);
    const key = `${b.id}:${ri}`;
    const segs = rowSegs(b, row, ticks, fit[key]);
    // 照片跟最后一段走
    segs.forEach((s, si) => {
      const last = si === segs.length - 1;
      push({
        kind: ticks ? 'tick' : 'clRow',
        block: b,
        row: s.row,
        ri,
        cont: si > 0,
        remarkCont: !!s.remarkCont,
        fit: key,
        keep: last && lines.length > 0,
        hasPhotos: last && lines.length > 0,
        group,
        space: ticks && ri === 0 && si === 0 && !hasHead ? 16 : 0,
      });
    });
    lines.forEach((ph, li) =>
      push({
        kind: 'photoLine',
        block: b,
        photos: ph,
        size: 'sm',
        frame: ticks ? 'grid' : 'table',
        indent: ticks ? 30 : 34,
        label: li === 0,
        lineEnd: li === lines.length - 1,
        group,
        space: 0,
      }),
    );
  });
}

function tableAtoms(push, b, fit) {
  const hasHead = headAtoms(push, b, 22);
  push({ kind: 'tblHead', block: b, keep: true, space: hasHead ? 0 : 16 });
  if (b.empty) {
    push({ kind: 'tblEmpty', block: b, group: b.id, space: 0 });
    return;
  }
  const T = tblLayout(b);
  b.rows.forEach((row, ri) => {
    // 每张照片带上所属组名（问题照片 / 复验照片），前后对比可并排
    const tiles = (row.photoGroups || []).flatMap((g) => g.photos.map((p) => ({ ...p, tag: g.label })));
    const lines = chunk(tiles, PHOTO.sm.per);
    // 单元格太长：每列各自切块，续行同一列接着写（序号留空）；照片跟最后一段走
    const key = `${b.id}:${ri}`;
    const cols = b.columns.map((c, i) => textSegs(row.cells[c.key], T.ws[i] - 13, 10, 15, fit[key]));
    const n = Math.max(1, ...cols.map((s) => s.length));
    for (let k = 0; k < n; k += 1) {
      const last = k === n - 1;
      const r = n === 1 ? row : { ...row, cells: Object.fromEntries(b.columns.map((c, i) => [c.key, cols[i][k] ?? ''])) };
      push({ kind: 'tblRow', block: b, row: r, ri, cont: k > 0, fit: key, keep: last && lines.length > 0, hasPhotos: last && lines.length > 0, group: b.id, space: 0 });
    }
    lines.forEach((ph, li) =>
      push({ kind: 'photoLine', block: b, photos: ph, size: 'sm', frame: 'table', indent: 28, tagged: true, lineEnd: li === lines.length - 1, group: b.id, space: 0 }),
    );
  });
}

/**
 * 统计块：通常一个原子；有很长的统计值（如「待处理」逐条列出备注）时拆成
 * 卡片 / 每条长值的每一块 / 结论 几个原子（part），块间可换页。
 */
function summaryAtoms(push, b, hasHead, fit) {
  const key = `${b.id || 'summary'}:summary`;
  const all = b.items || [];
  const isLong = (it) => String(it.value ?? '').length > LONG_VALUE;
  const longs = all.filter(isLong);
  const segs = longs.map((it) => textSegs(String(it.value ?? ''), SUM_LONG_W, 10.5, 16, fit[key]));
  if (segs.every((x) => x.length === 1)) {
    push({ kind: 'summary', block: b, fit: key, space: hasHead ? 0 : 16 });
    return;
  }
  let first = true;
  const sp = (gap) => {
    const v = first ? (hasHead ? 0 : 16) : gap;
    first = false;
    return v;
  };
  if (all.some((it) => !isLong(it))) push({ kind: 'summary', block: b, part: 'cards', fit: key, space: sp(0) });
  longs.forEach((it, li) =>
    segs[li].forEach((t, k) =>
      push({ kind: 'summary', block: b, part: 'long', item: { ...it, value: t }, cont: k > 0, fit: key, space: k ? 0 : sp(8) }),
    ),
  );
  if (b.conclusion) push({ kind: 'summary', block: b, part: 'conclusion', fit: key, space: sp(10) });
}

/**
 * DocModel → 原子列表 + 每个表格的「续页表头」原子
 * fit[key]（< 1）：实测仍超过一页的文字，按比例缩小切块（DocPages 自动重排时传入）
 * @returns {{ atoms: Atom[], heads: { [group]: Atom } }}
 */
export function buildAtoms(model, { fit = {} } = {}) {
  const atoms = [];
  const heads = {};
  const push = (a) => {
    atoms.push(a);
    return a;
  };
  const meta = model.meta || {};
  push({ kind: 'header', space: 0 });
  (meta.intro || []).forEach((p, k) => push({ kind: 'intro', p, space: k ? 6 : 4 }));
  if (isText(meta.legend)) push({ kind: 'legend', text: meta.legend, space: 10 });

  for (const b of model.blocks || []) {
    if (b.type === 'fields') fieldsAtoms(push, b, fit);
    else if (b.type === 'checklist') {
      checklistAtoms(push, b, fit);
      if (b.resultLayout !== 'ticks') heads[b.id] = { kind: 'contHead', block: b, space: 0 };
    } else if (b.type === 'table') {
      tableAtoms(push, b, fit);
      heads[b.id] = { kind: 'contHead', block: b, space: 0 };
    } else if (b.type === 'summary') {
      const hasHead = headAtoms(push, b, 22, { summary: true });
      summaryAtoms(push, b, hasHead, fit);
    } else if (b.type === 'note') {
      push({ kind: 'note', block: b, space: 10 });
    } else if (b.type === 'signatures') {
      const hasHead = headAtoms(push, b, 22);
      push({ kind: 'sig', block: b, space: hasHead ? 0 : 24 });
    }
  }
  if (isText(meta.footer)) push({ kind: 'endNote', text: meta.footer, space: 20 });

  // 备注紧跟上一个块（「★ 不合格须记入…」不单独落到下一页）
  for (let i = 1; i < atoms.length; i += 1) {
    const prev = atoms[i - 1];
    if (atoms[i].kind === 'note' && !['header', 'intro', 'legend'].includes(prev.kind)) prev.keep = true;
  }

  // 长文本 / 长列表切出来的续块：前一块不画分隔线（看起来是同一段）
  for (let i = 1; i < atoms.length; i += 1) {
    const a = atoms[i];
    if (a.cont || (a.kind === 'gridRow' && a.cells?.[0]?.cont)) atoms[i - 1].contNext = true;
  }

  // 块内首 / 末原子标记（收边线用；不影响高度）
  for (let i = 0; i < atoms.length; i += 1) {
    const a = atoms[i];
    const prev = atoms[i - 1];
    const next = atoms[i + 1];
    a.firstInBlock = !prev || prev.block !== a.block || prev.kind === 'secHead';
    a.lastInBlock = !next || next.block !== a.block;
  }
  return { atoms, heads };
}

/**
 * 一页都放不下的原子（含续页表头）→ [{ i, room }]；room = 这个原子在续页上最多能占的高度。
 * DocPages 用它决定重切（有 fit key）还是警告（会被裁切）。
 */
export function overTall(atoms, heights, headHeights = {}, contAvail = CONT_AVAIL) {
  const out = [];
  atoms.forEach((a, i) => {
    const room = contAvail - (a.group && headHeights[a.group] != null ? headHeights[a.group] : 0);
    if (Math.max(0, heights[i] || 0) > room) out.push({ i, room });
  });
  return out;
}

/**
 * 装页。heights[i] = 原子 i 的实测高度；headHeights[group] = 续页表头高度。
 * @returns {Array<Array<{ atom: number } | { cont: string }>>}
 */
export function paginate(atoms, heights, headHeights = {}, { firstAvail = FIRST_AVAIL, contAvail = CONT_AVAIL } = {}) {
  const pages = [];
  let cur = null;
  const open = () => {
    cur = { items: [], used: 0, real: 0, avail: pages.length === 0 ? firstAvail : contAvail };
    pages.push(cur);
  };
  open();
  const n = atoms.length;
  const h = (i) => Math.max(0, heights[i] || 0);
  const headH = (k) => (atoms[k].group && headHeights[atoms[k].group] != null ? headHeights[atoms[k].group] : 0);
  const big = (k) => h(k) + headH(k) > contAvail; // 一页都放不下的原子（超长文字）→ 裁切显示
  for (let i = 0; i < n; i += 1) {
    const a = atoms[i];
    const need = (cur.real ? a.space || 0 : 0) + h(i);
    // keep-with-next 链：标题 + 表头 + 第一行 / 行 + 第一行照片 一起换页
    let chain = need;
    let j = i;
    let hasBig = big(i);
    while (atoms[j].keep && j + 1 < n && j - i < 4) {
      j += 1;
      chain += (atoms[j].space || 0) + h(j);
      if (big(j)) hasBig = true;
    }
    const contH = headH(i);
    // 整条链一页都放不下：普通情况只保证自己；链里有超高原子则标题跟它一起换页
    if (!hasBig && chain - need + h(i) + contH > contAvail) chain = need;
    // 本页只有「要跟着下一个走」的原子（如节标题）时，超高原子直接放下，不再换页
    const onlyKeeps = cur.real > 0 && cur.items.every((it) => !('atom' in it) || atoms[it.atom].keep);
    const force = big(i) && onlyKeeps;
    if (cur.real && !force && cur.used + chain > cur.avail) {
      open();
      if (contH) {
        cur.items.push({ cont: a.group });
        cur.used += contH;
      }
      cur.items.push({ atom: i });
      cur.used += h(i);
    } else {
      cur.items.push({ atom: i });
      cur.used += need;
    }
    cur.real += 1;
  }
  return pages.map((p) => p.items);
}
