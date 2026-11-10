// ============================================================
// 第二版「画框框」：直接在柜身切分树（frame.body）上切格子、拖线、删格、改格子。
// 规则：
//   · 所有函数都返回新 frame，不改原物件。
//   · 尺寸一律整数 mm；同一个切分的 sizes 加起来刚好 = 那一段的宽 / 高。
//   · 每格最少 MIN_BLOCK（100 mm）；模板本来就比 100 窄的格子不会再被压窄。
//   · 格子用「路径」认：从 body 往下数第几个孩子，例如 "1.0"；body 本身是一格时为 ""。
//   · 坐标：柜身左下角为原点，x 向右、y 向上（同 layoutLeaves）。
// 轴：'x' = 宽（split 'v' 左→右）；'y' = 高（split 'h' 下→上）。
// ============================================================
import { layoutLeaves, bodyHeight, normBase, splitEven } from './model.js';

export const MIN_BLOCK = 100;
export const SNAP = 10;
export const EDGE_SNAP = 60;

const SPLIT_OF = { x: 'v', y: 'h' };
const AXIS_OF = { v: 'x', h: 'y' };
const int = (v) => Math.round(Number(v) || 0);
export const snap = (v, g = SNAP) => Math.round((Number(v) || 0) / g) * g;

// ---------------- 路径 ----------------
export const parsePath = (p) => (p === '' || p == null ? [] : String(p).split('.').map(Number));
export const joinPath = (a) => a.join('.');

export function getNode(body, path) {
  let n = body;
  for (const i of parsePath(path)) { if (!n || n.leaf || !n.children) return null; n = n.children[i]; }
  return n || null;
}

function setNodeAt(node, idx, fn) {
  if (!idx.length) return fn(node);
  const [i, ...rest] = idx;
  const children = node.children.slice();
  children[i] = setNodeAt(children[i], rest, fn);
  return { ...node, children };
}
const replaceNode = (body, path, fn) => setNodeAt(body, parsePath(path), fn);

// 每个节点的矩形（含路径）
function walk(node, x, y, w, h, path, visit) {
  if (!node) return;
  visit(node, { x, y, w, h }, path);
  if (node.leaf || !node.children) return;
  let off = 0;
  node.children.forEach((c, i) => {
    const s = node.sizes?.[i] || 0;
    const p = path === '' ? String(i) : `${path}.${i}`;
    if (node.split === 'v') walk(c, x + off, y, s, h, p, visit);
    else walk(c, x, y + off, w, s, p, visit);
    off += s;
  });
}

const dims = (frame) => ({ W: Math.max(0, int(frame.W)), Hb: Math.max(0, int(bodyHeight(frame))) });

export function nodeBox(frame, path) {
  const { W, Hb } = dims(frame);
  let out = null;
  walk(frame.body, 0, 0, W, Hb, '', (n, r, p) => { if (p === String(path ?? '')) out = r; });
  return out;
}

// ---------------- 读 ----------------
// 每一格 { path, x, y, w, h, node }
export function leafBoxes(frame) {
  const { W, Hb } = dims(frame);
  return layoutLeaves(frame.body, 0, 0, W, Hb).map(({ path, x, y, w, h, node }) => ({ path, x, y, w, h, node }));
}

// 分隔线 { path, k, dir, pos, from, to }：path 的切分里第 k−1 和第 k 个孩子之间那条线
//   dir 'v' = 竖线（x = pos，y 从 from 到 to）；'h' = 横线（y = pos）
export function cutLines(frame) {
  const { W, Hb } = dims(frame);
  const out = [];
  walk(frame.body, 0, 0, W, Hb, '', (n, r, path) => {
    if (n.leaf || !n.children) return;
    let off = 0;
    n.children.forEach((_, k) => {
      if (k > 0) out.push(n.split === 'v'
        ? { path, k, dir: 'v', pos: r.x + off, from: r.y, to: r.y + r.h }
        : { path, k, dir: 'h', pos: r.y + off, from: r.x, to: r.x + r.w });
      off += n.sizes?.[k] || 0;
    });
  });
  return out;
}

// 点 (x, y) 落在哪一格 → path（没有就 null）
export function leafAt(frame, x, y) {
  const hit = leafBoxes(frame).find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  return hit ? hit.path : null;
}

// ---------------- 尺寸分配（整数、加起来刚好 = target） ----------------
// 一个节点沿某轴最少要多大（模板里本来就比 100 窄的格子：以现在的宽度为下限）
function minSize(node, axis, cur) {
  if (!node || node.leaf || !node.children?.length) return Math.min(MIN_BLOCK, Math.max(0, cur));
  if (node.split === SPLIT_OF[axis]) return node.children.reduce((a, c, i) => a + minSize(c, axis, node.sizes?.[i] || 0), 0);
  return Math.max(...node.children.map((c) => minSize(c, axis, cur)));
}

function scaleSizes(sizes, target) {
  const sum = sizes.reduce((a, b) => a + b, 0);
  if (sum <= 0) return splitEven(target, sizes.length);
  const ideal = sizes.map((s) => (s * target) / sum);
  const out = ideal.map(Math.floor);
  let rem = target - out.reduce((a, b) => a + b, 0);
  ideal.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (rem > 0) { out[i] += 1; rem -= 1; } });
  return out;
}

// mode：'end' 由最后一个吸收（拖右边 / 上边的线）；'start' 由第一个；'tallest' 由最大的；'scale' 等比例
export function distribute(sizes, mins, target, mode = 'end') {
  const cur = sizes.map(int);
  const sum = cur.reduce((a, b) => a + b, 0);
  const d = target - sum;
  if (d === 0) return cur;
  const minSum = mins.reduce((a, b) => a + b, 0);
  if (mode === 'scale' || target < minSum) {
    const out = scaleSizes(cur, target);
    if (target >= minSum) { // 等比例后有格子小过下限 → 从最宽裕的格子借
      for (let guard = 0; guard < 1000; guard++) {
        const i = out.findIndex((v, k) => v < mins[k]);
        if (i < 0) break;
        let j = -1, best = 0;
        out.forEach((v, k) => { if (v - mins[k] > best) { best = v - mins[k]; j = k; } });
        if (j < 0) break;
        const amt = Math.min(mins[i] - out[i], best);
        out[i] += amt; out[j] -= amt;
      }
    }
    return out;
  }
  const idx = cur.map((_, i) => i);
  const order = mode === 'start' ? idx : mode === 'tallest' ? idx.slice().sort((a, b) => cur[b] - cur[a] || b - a) : idx.reverse();
  const out = cur.slice();
  if (d > 0) { out[order[0]] += d; return out; }
  let rem = -d;
  for (const i of order) { const take = Math.min(rem, Math.max(0, out[i] - mins[i])); out[i] -= take; rem -= take; if (!rem) break; }
  return out;
}

// 把节点沿 axis 改成 size（往下递归，保证每一层加起来刚好）
export function fitAxis(node, axis, size, mode = 'end') {
  if (!node || node.leaf || !node.children?.length) return node;
  if (node.split === SPLIT_OF[axis]) {
    const cur = node.children.map((_, i) => int(node.sizes?.[i]));
    const mins = node.children.map((c, i) => minSize(c, axis, cur[i]));
    const sizes = distribute(cur, mins, size, mode);
    const children = node.children.map((c, i) => fitAxis(c, axis, sizes[i], mode));
    return { ...node, sizes, children };
  }
  return { ...node, children: node.children.map((c) => fitAxis(c, axis, size, mode)) };
}

// 整理：同方向的切分摊平到父节点；只剩一个孩子的切分收起
export function tidy(node) {
  if (!node || node.leaf || !node.children) return node;
  let kids = node.children.map(tidy);
  let sizes = node.children.map((_, i) => int(node.sizes?.[i]));
  const flatK = [], flatS = [];
  kids.forEach((c, i) => {
    if (c && !c.leaf && c.split === node.split && c.children?.length) { c.children.forEach((g, j) => { flatK.push(g); flatS.push(int(c.sizes?.[j])); }); }
    else { flatK.push(c); flatS.push(sizes[i]); }
  });
  kids = flatK; sizes = flatS;
  if (kids.length === 1) return kids[0];
  return { ...node, sizes, children: kids };
}

// 结构变了（切 / 删 / 拖框）才整理；只改类型 / 尺寸 / 底座不整理 → 格子路径不变，选中的格子不会跑掉
const withBody = (frame, body) => ({ ...frame, body: tidy(body) });
const keepBody = (frame, body) => ({ ...frame, body });

// ---------------- 改 ----------------
const copyLeaf = (n) => { const c = { ...n }; if (n.series) c.series = { ...n.series }; return c; };

// 切一刀：dir 'v' 竖切（左右两格）/ 'h' 横切（上下两格）；at = 离这格左边 / 下边多少 mm，默认对半
export function splitLeaf(frame, path, dir, at) {
  const node = getNode(frame.body, path);
  const box = nodeBox(frame, path);
  if (!node?.leaf || !box) return frame;
  const L = dir === 'v' ? box.w : box.h;
  if (L < MIN_BLOCK * 2) return frame;
  let a = at == null ? Math.floor(L / 2) : int(at);
  a = Math.min(L - MIN_BLOCK, Math.max(MIN_BLOCK, a));
  const b = L - a;
  const A = copyLeaf(node), B = copyLeaf(node);
  // 抽屉 / 飘板横切：按高度比例分数量，每格至少 1
  for (const [type, key] of [['drawer', 'drawers'], ['shelf', 'shelves']]) {
    if (node.type === type && dir === 'h') {
      const n = Math.max(1, int(node[key]) || 1);
      A[key] = Math.max(1, Math.round((n * a) / L));
      B[key] = Math.max(1, n - A[key]);
    }
  }
  const idx = parsePath(path);
  if (idx.length) {
    const parentPath = joinPath(idx.slice(0, -1));
    const parent = getNode(frame.body, parentPath);
    const i = idx[idx.length - 1];
    if (parent.split === dir) {
      return withBody(frame, replaceNode(frame.body, parentPath, (p) => {
        const sizes = p.sizes.slice(); const children = p.children.slice();
        sizes.splice(i, 1, a, b); children.splice(i, 1, A, B);
        return { ...p, sizes, children };
      }));
    }
  }
  return withBody(frame, replaceNode(frame.body, path, () => ({ split: dir, sizes: [a, b], children: [A, B] })));
}

// 电脑拖框：在一格里拖出长方形 → 最多切 4 刀，变成独立的一格（patch 例如 { type:'open' }）
//   离格子边 60 mm 以内贴齐；切下来不到 100 mm 的边条不切；框本身小于 100 × 100 就不切
export function carveRect(frame, path, rect, patch = {}) {
  const box = nodeBox(frame, path);
  const node = getNode(frame.body, path);
  if (!box || !node?.leaf) return frame;
  const bx0 = box.x, bx1 = box.x + box.w, by0 = box.y, by1 = box.y + box.h;
  const fix = (v, lo, hi) => {
    let s = Math.min(hi, Math.max(lo, snap(v)));
    if (s - lo < Math.max(EDGE_SNAP, MIN_BLOCK)) s = lo;
    if (hi - s < Math.max(EDGE_SNAP, MIN_BLOCK)) s = hi;
    return s;
  };
  const xa = Math.min(rect.x, rect.x + rect.w), xb = Math.max(rect.x, rect.x + rect.w);
  const ya = Math.min(rect.y, rect.y + rect.h), yb = Math.max(rect.y, rect.y + rect.h);
  const x0 = fix(xa, bx0, bx1), x1 = fix(xb, bx0, bx1), y0 = fix(ya, by0, by1), y1 = fix(yb, by0, by1);
  if (x1 - x0 < MIN_BLOCK || y1 - y0 < MIN_BLOCK) return frame;
  if (x0 === bx0 && x1 === bx1 && y0 === by0 && y1 === by1) return Object.keys(patch).length ? setLeaf(frame, path, patch) : frame;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let f = frame;
  const cut = (dir, abs) => {
    const p = leafAt(f, cx, cy); const b = nodeBox(f, p);
    const off = dir === 'v' ? abs - b.x : abs - b.y;
    const L = dir === 'v' ? b.w : b.h;
    if (off > 0 && off < L) f = splitLeaf(f, p, dir, off);
  };
  // 先竖切成左 | 中 | 右，再把中间那条横切成下 | 中 | 上
  if (x0 > bx0) cut('v', x0);
  if (x1 < bx1) cut('v', x1);
  if (y0 > by0) cut('h', y0);
  if (y1 < by1) cut('h', y1);
  const p = leafAt(f, cx, cy);
  return Object.keys(patch).length ? setLeaf(f, p, patch) : f;
}

// 拖分隔线：path 切分里第 k−1 / k 个孩子之间的线移动 delta mm（两边各至少 100）
export function moveCut(frame, path, k, delta) {
  const node = getNode(frame.body, path);
  if (!node || node.leaf || !(k > 0 && k < node.children.length)) return frame;
  const axis = AXIS_OF[node.split];
  const a = k - 1, b = k;
  const curA = int(node.sizes[a]), curB = int(node.sizes[b]);
  const minA = minSize(node.children[a], axis, curA), minB = minSize(node.children[b], axis, curB);
  const d = Math.max(minA - curA, Math.min(curB - minB, int(delta)));
  if (!d) return frame;
  return keepBody(frame, replaceNode(frame.body, path, (n) => {
    const sizes = n.sizes.map(int); const children = n.children.slice();
    sizes[a] = curA + d; sizes[b] = curB - d;
    children[a] = fitAxis(children[a], axis, sizes[a], 'end');
    children[b] = fitAxis(children[b], axis, sizes[b], 'start');
    return { ...n, sizes, children };
  }));
}

// 这格的宽 / 高由哪一个切分决定：最近一个同方向的祖先 { path, i }（这格就在它第 i 个孩子里）
function ownerSplit(body, path, axis) {
  const idx = parsePath(path);
  for (let d = idx.length - 1; d >= 0; d--) {
    const pp = joinPath(idx.slice(0, d));
    const p = getNode(body, pp);
    if (p && p.split === SPLIT_OF[axis] && p.children?.length > 1) return { path: pp, i: idx[d], node: p }; // 只有一个孩子的切分 = 整个高 / 宽
  }
  return null;
}

// 在设定栏打宽 / 高：差额由右边 / 上面那格吸收；是最后一格就由前一格吸收
// 返回 frame；整个柜身就这一格宽（或高）的，改不了 → 原样返回
export function resizeLeaf(frame, path, axis, mm) {
  const own = ownerSplit(frame.body, path, axis);
  if (!own) return frame;
  const cur = int(own.node.sizes[own.i]);
  const delta = int(mm) - cur;
  if (!delta) return frame;
  if (own.i < own.node.children.length - 1) return moveCut(frame, own.path, own.i + 1, delta);
  return moveCut(frame, own.path, own.i, -delta);
}
export const canResize = (frame, path, axis) => !!ownerSplit(frame.body, path, axis);

// 删掉这格，并到旁边那格（左边 / 下面优先；它是第一格就并到右边 / 上面）
export function removeLeaf(frame, path) {
  const idx = parsePath(path);
  if (!idx.length) return frame;
  const parentPath = joinPath(idx.slice(0, -1));
  const i = idx[idx.length - 1];
  return withBody(frame, replaceNode(frame.body, parentPath, (p) => {
    const axis = AXIS_OF[p.split];
    const sizes = p.sizes.map(int); const children = p.children.slice();
    const j = i > 0 ? i - 1 : i + 1;
    const grow = sizes[j] + sizes[i];
    children[j] = fitAxis(children[j], axis, grow, j < i ? 'end' : 'start');
    sizes[j] = grow;
    sizes.splice(i, 1); children.splice(i, 1);
    return { ...p, sizes, children };
  }));
}

export const DEFAULT_INTERIOR = { closed: 'shelves', glass: 'shelves', open: 'shelves', drawer: 'drawers', void: 'appliance', shelf: '' };
export const SHELF_PITCH = 350; // 飘板默认间距 → 块数 = max(1, round(高 / 350))
const TYPE_ONLY_INTERIOR = new Set(['drawers', 'appliance', 'hood']);

// 改格子：type / drawers / drawerKind / interior / series
//   改类型时给默认值：抽屉 = max(1, round(高/200)) 个，厨房全展、其他半展；空位的里面 = appliance
//   series：{ door?, carcass? }；传 null 或两样都空 → 清掉（跟柜子）
export function setLeaf(frame, path, patch = {}, { kitchen = false } = {}) {
  const node = getNode(frame.body, path);
  const box = nodeBox(frame, path);
  if (!node?.leaf || !box) return frame;
  return keepBody(frame, replaceNode(frame.body, path, (n) => {
    const out = { ...n, ...patch };
    if ('series' in patch) {
      const s = patch.series || {};
      const clean = {};
      if (s.door) clean.door = s.door;
      if (s.carcass) clean.carcass = s.carcass;
      if (Object.keys(clean).length) out.series = clean; else delete out.series;
    }
    if (patch.type && patch.type !== n.type) {
      if (patch.type === 'drawer') {
        if (!('drawers' in patch)) out.drawers = Math.max(1, Math.round(box.h / 200));
        if (!('drawerKind' in patch)) out.drawerKind = kitchen ? 'full' : 'half';
      } else { delete out.drawers; delete out.drawerKind; }
      if (patch.type === 'shelf') {
        if (!('shelves' in patch)) out.shelves = Math.max(1, Math.round(box.h / SHELF_PITCH));
        if (!('shelfKind' in patch)) out.shelfKind = n.shelfKind || 'if25';
      } else { delete out.shelves; delete out.shelfKind; }
      if (!('interior' in patch)) {
        if (patch.type === 'drawer' || patch.type === 'void' || patch.type === 'shelf' || !n.interior || TYPE_ONLY_INTERIOR.has(n.interior)) out.interior = DEFAULT_INTERIOR[patch.type];
      }
    }
    if (out.type === 'drawer') out.drawers = Math.max(1, Math.min(12, int(out.drawers) || 1));
    if (out.type === 'shelf') out.shelves = Math.max(1, Math.min(20, int(out.shelves) || 1));
    if (out.interior === '' || out.interior == null) delete out.interior;
    return out;
  }));
}

// 把柜身修整到刚好 W × Hb（'tallest'：每一栏最高的那格吸收；'scale'：等比例）
export function fitBody(frame, W, Hb, mode = 'tallest') {
  let body = fitAxis(frame.body, 'x', int(W), mode === 'tallest' ? 'end' : mode);
  body = fitAxis(body, 'y', int(Hb), mode);
  return { ...frame, body };
}

// 改底座（踢脚 / 柜脚 / 底层架空 / 悬挂 / 无 + 高度）：柜身高 = 总高 − 底座，差额由每一栏最高的那格吸收
export function setBase(frame, base) {
  const b = normBase(base);
  const H = Math.max(0, int(frame.H));
  const h = Math.min(b.h, Math.max(0, H - MIN_BLOCK));
  const next = { ...frame, base: { ...b, h } };
  return fitBody(next, int(frame.W), H - h, 'tallest');
}

// 自检：每一层加起来刚好、全是整数（测试和开发用）
export function checkBody(frame) {
  const { W, Hb } = dims(frame);
  const errs = [];
  walk(frame.body, 0, 0, W, Hb, '', (n, r, p) => {
    if (n.leaf || !n.children) return;
    const total = n.split === 'v' ? r.w : r.h;
    const sum = n.sizes.reduce((a, b) => a + b, 0);
    if (sum !== total) errs.push(`${p || 'body'}: ${sum} ≠ ${total}`);
    if (n.sizes.length !== n.children.length) errs.push(`${p || 'body'}: sizes/children length`);
    n.sizes.forEach((s) => { if (!Number.isInteger(s)) errs.push(`${p || 'body'}: ${s} not integer`); });
  });
  return errs;
}
