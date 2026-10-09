// 文档分页：DocModel → 原子（不可拆分的最小排版单位）→ 按测量高度装页
// ------------------------------------------------------------
// 原子 Atom = { kind, space, keep?, group?, ... }
//   space  与上一个原子的间距（在页首时忽略）
//   keep   与下一个原子同页（标题不落单、行与第一行照片同页）
//   group  所属表格 id：换页后在新页顶部重复表头（contHead）
// 纯函数、无 DOM：同样的输入永远得到同样的分页。
import { PHOTO, FIRST_AVAIL, CONT_AVAIL } from './theme.js';

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const isText = (s) => s != null && String(s).trim() !== '';

/** 长文本按段落切块（每块约 ≤ maxChars），单段过长再硬切，避免一个原子超过一页 */
export function splitText(text, maxChars = 520) {
  const paras = [];
  for (const p of String(text || '').split('\n')) {
    if (p.length <= maxChars * 1.6) paras.push(p);
    else for (let i = 0; i < p.length; i += maxChars) paras.push(p.slice(i, i + maxChars));
  }
  const out = [];
  let cur = [];
  let len = 0;
  for (const p of paras) {
    if (cur.length && len + p.length > maxChars) {
      out.push(cur.join('\n'));
      cur = [];
      len = 0;
    }
    cur.push(p);
    len += p.length + 1;
  }
  if (cur.length) out.push(cur.join('\n'));
  return out.length ? out : [''];
}

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

function fieldsAtoms(push, b) {
  const hasHead = headAtoms(push, b, b.layout === 'list' ? 18 : 22);
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
      } else if (f.kind === 'block' && isText(f.value) && String(f.value).length > 520) {
        splitText(f.value).forEach((t, k) =>
          push({ kind: 'listRow', block: b, cells: [{ ...f, value: t }], cont: k > 0, space: k ? 0 : sp() }),
        );
      } else if (f.kind === 'list' && (f.lines || []).length > 14) {
        chunk(f.lines, 12).forEach((ls, k) =>
          push({ kind: 'listRow', block: b, cells: [{ ...f, lines: ls }], cont: k > 0, space: k ? 0 : sp() }),
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
    rows.forEach((cells) => push({ kind: 'gridRow', block: b, cols, cells, space: sp() }));
  };
  for (const f of b.fields) {
    const full = f.kind === 'photos' || f.kind === 'video' || f.kind === 'block' || f.kind === 'list';
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
    } else if (f.kind === 'block' && isText(f.value) && String(f.value).length > 520) {
      splitText(f.value).forEach((t, k) =>
        push({ kind: 'gridRow', block: b, cols, cells: [{ field: { ...f, value: t }, span: cols, cont: k > 0 }], space: k ? 0 : sp() }),
      );
    } else if (f.kind === 'list' && (f.lines || []).length > 14) {
      chunk(f.lines, 12).forEach((ls, k) =>
        push({ kind: 'gridRow', block: b, cols, cells: [{ field: { ...f, lines: ls }, span: cols, cont: k > 0 }], space: k ? 0 : sp() }),
      );
    } else {
      push({ kind: 'gridRow', block: b, cols, cells: [{ field: f, span: cols }], space: sp() });
    }
  }
  flushNormal();
}

function checklistAtoms(push, b) {
  const ticks = b.resultLayout === 'ticks';
  const hasHead = headAtoms(push, b, 22);
  if (!ticks) push({ kind: 'clHead', block: b, keep: true, space: hasHead ? 0 : 16 });
  const group = ticks ? null : b.id;
  b.rows.forEach((row, ri) => {
    const lines = chunk(row.photos || [], PHOTO.sm.per);
    push({
      kind: ticks ? 'tick' : 'clRow',
      block: b,
      row,
      ri,
      keep: lines.length > 0,
      hasPhotos: lines.length > 0,
      group,
      space: ticks && ri === 0 && !hasHead ? 16 : 0,
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

function tableAtoms(push, b) {
  const hasHead = headAtoms(push, b, 22);
  push({ kind: 'tblHead', block: b, keep: true, space: hasHead ? 0 : 16 });
  if (b.empty) {
    push({ kind: 'tblEmpty', block: b, group: b.id, space: 0 });
    return;
  }
  b.rows.forEach((row, ri) => {
    // 每张照片带上所属组名（问题照片 / 复验照片），前后对比可并排
    const tiles = (row.photoGroups || []).flatMap((g) => g.photos.map((p) => ({ ...p, tag: g.label })));
    const lines = chunk(tiles, PHOTO.sm.per);
    push({ kind: 'tblRow', block: b, row, ri, keep: lines.length > 0, hasPhotos: lines.length > 0, group: b.id, space: 0 });
    lines.forEach((ph, li) =>
      push({ kind: 'photoLine', block: b, photos: ph, size: 'sm', frame: 'table', indent: 28, tagged: true, lineEnd: li === lines.length - 1, group: b.id, space: 0 }),
    );
  });
}

/**
 * DocModel → 原子列表 + 每个表格的「续页表头」原子
 * @returns {{ atoms: Atom[], heads: { [group]: Atom } }}
 */
export function buildAtoms(model) {
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
    if (b.type === 'fields') fieldsAtoms(push, b);
    else if (b.type === 'checklist') {
      checklistAtoms(push, b);
      if (b.resultLayout !== 'ticks') heads[b.id] = { kind: 'contHead', block: b, space: 0 };
    } else if (b.type === 'table') {
      tableAtoms(push, b);
      heads[b.id] = { kind: 'contHead', block: b, space: 0 };
    } else if (b.type === 'summary') {
      const hasHead = headAtoms(push, b, 22, { summary: true });
      push({ kind: 'summary', block: b, space: hasHead ? 0 : 16 });
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
