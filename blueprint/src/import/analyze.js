// 原始页面（pdfExtract.js）→ 方案结构：楼层 / 空间视角 / 材料 / 备注。纯函数，无 DOM、无 pdf.js。
//
// Analysis = {
//   info:      { client, location, date, sourceFile },
//   floors:    [{ key, zh, en, imageKey, planKey }],
//   materials: [{ key, name, code, pending, imageKey }],                        // 全稿去重，按首次出现排序
//   views:     [{ page, floorKey, imageKey, room, roomEn, subtitle, materials:[{ role, materialKey }],
//                notes:[{ label, text }], renderAspect, inherited }],          // inherited = 材料沿用同一空间的其它视角
//   pages:     [{ n, kind:'cover'|'title'|'floor'|'view'|'end'|'other', title }],
//   report:    string[],                                                         // 每页一行，便于人工核对
// }

import {
  parseRoomTitle, parseFloorLabel, parseMaterialLabel, materialKey, parseFileName, parseClientLine, formatPdfDate,
  parseNoteText, looksLikeMaterial, inferRole, findCode, joinLines, hasHan, SUBTITLE_KEYWORDS, ROLE_WORDS,
} from './labels.js';

// ---------------------------------------------------------------------------
// 几何工具
// ---------------------------------------------------------------------------

const area = (b) => Math.max(0, b.w) * Math.max(0, b.h);

function clamp(b, W, H) {
  const x0 = Math.max(0, b.x);
  const y0 = Math.max(0, b.y);
  const x1 = Math.min(W, b.x + b.w);
  const y1 = Math.min(H, b.y + b.h);
  return { ...b, x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

function contains(box, pt, pad = 0) {
  return pt.x >= box.x - pad && pt.x <= box.x + box.w + pad && pt.y >= box.y - pad && pt.y <= box.y + box.h + pad;
}

/** 两个矩形的边距（重叠 = 0） */
function rectDistance(a, b) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

function unionBox(boxes) {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const pad2 = (n) => String(n).padStart(2, '0');
const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const viewNo = (k) => `视角${k <= 10 ? CN_NUM[k] : ` ${k}`}`;

// ---------------------------------------------------------------------------
// 文字块：相邻的行拼成块（一条标签 / 一条标注）
// ---------------------------------------------------------------------------

/**
 * @param {object[]} lines
 * @param {(line)=>any} containerOf  同一块的行必须属于同一个容器（同一张色板内 / 外）
 */
function groupBlocks(lines, containerOf = () => null) {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const blocks = [];
  for (const line of sorted) {
    let best = null;
    for (const b of blocks) {
      const last = b.lines[b.lines.length - 1];
      const fs = Math.max(line.fs, last.fs);
      const vgap = line.y - (last.y + last.h);
      if (vgap > 0.95 * fs || vgap < -0.4 * fs) continue;
      if (line.fs / last.fs > 1.45 || last.fs / line.fs > 1.45) continue;
      const ov = Math.min(line.x + line.w, b.box.x + b.box.w) - Math.max(line.x, b.box.x);
      if (ov <= 0 && Math.abs(line.x - last.x) > 2 * fs) continue;
      if (containerOf(line) !== b.container) continue;
      if (!best || vgap < best.vgap) best = { b, vgap };
    }
    if (best) {
      best.b.lines.push(line);
      best.b.box = unionBox([best.b.box, line]);
    } else {
      blocks.push({ lines: [line], box: { x: line.x, y: line.y, w: line.w, h: line.h }, container: containerOf(line) });
    }
  }
  return blocks;
}

/** 以 '*' / '※' 开头的行另起一条 */
function splitItems(block) {
  const items = [];
  for (const l of block.lines) {
    if (!items.length || /^[*※•]/.test(l.text)) items.push([l]);
    else items[items.length - 1].push(l);
  }
  return items;
}

const isNoise = (t) => {
  const s = String(t || '').replace(/\s+/g, '');
  if (!s) return true;
  if (/^[\d\s.\-–/]+$/.test(s) && s.length <= 3) return true; // 页码
  return s.length < 2 && !hasHan(s);
};

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

const CONTACT_RE = /www\.|\.com\b|\+\s*6\s*0|whats\s*app|showroom|instagram|facebook|地址|电话|联系|微信|wechat|qr/i;
const TITLE_RE = /设计图|设计方案|方案|效果图|3\s*D|design|proposal|presentation|concept/i;
const PLAN_RE = /平面图|平面布置|布置图|layout\s*plan|floor\s*plan|\bplan\b/i;

/**
 * @param {{ meta?:{ numPages, title, creationDate }, pages: object[] }} raw  extractPdf() 的结果
 * @param {{ fileName?: string }} [opts]
 */
export function analyzePages(raw, { fileName } = {}) {
  const rawPages = raw?.pages || [];
  const meta = raw?.meta || {};
  const N = rawPages.length;

  // -------------------------------------------------------------------------
  // 1) 全稿图片统计：多页同位置重复出现、身上没有材料文字的小图 = logo / 装饰
  // -------------------------------------------------------------------------
  const occ = new Map(); // key → [{ n, box, frac, labelled }]
  for (const p of rawPages) {
    const W = p.width || 720;
    const H = p.height || 540;
    for (const im of p.images || []) {
      const box = clamp(im, W, H);
      if (!area(box)) continue;
      // 身上或附近（≤40pt，和分配标签的半径一致）有材料文字 → 是色板，不会是 logo
      const labelled = (p.lines || []).some((l) => (contains(box, center(l)) || rectDistance(l, box) <= 40) && looksLikeMaterial(l.text));
      if (!occ.has(im.key)) occ.set(im.key, []);
      occ.get(im.key).push({ n: p.n, box, frac: area(box) / (W * H), labelled });
    }
  }
  const decor = new Set();
  for (const [key, list] of occ) {
    const pagesSeen = new Set(list.map((o) => o.n));
    if (pagesSeen.size < 3) continue;
    if (list.some((o) => o.labelled)) continue;
    if (median(list.map((o) => o.frac)) > 0.12) continue;
    const cx = median(list.map((o) => center(o.box).x));
    const cy = median(list.map((o) => center(o.box).y));
    const steady = list.filter((o) => Math.hypot(center(o.box).x - cx, center(o.box).y - cy) <= 36).length;
    if (steady / list.length >= 0.6) decor.add(key);
  }

  // 同一张图出现在几页（横幅装饰条判断用）
  const pagesWith = new Map([...occ].map(([key, list]) => [key, new Set(list.map((o) => o.n)).size]));

  // -------------------------------------------------------------------------
  // 1b) 页面固定元素：同一行字在 3 页以上同一位置重复（网址 / 电话 / 品牌 / 页码）→ 不参与分析
  //     材料标签、编号、'*' 备注永远保留；普通文字要出现在一半以上的页面才算
  // -------------------------------------------------------------------------
  const FURNITURE_HINT = /www\.|\.com\b|\+\s*6\s*0|whats\s*app|instagram|facebook|sail|riccione|reka|溪岸|^(?:p\.?\s*)?#{1,3}(?:\s*\/\s*#{1,3})?$/i;
  const lineKey = (l, W, H) => `${l.text.replace(/\d+/g, '#')}@${Math.round((l.x / W) * 50)}:${Math.round((l.y / H) * 50)}`;
  const lineCount = new Map();
  for (const p of rawPages) {
    const seen = new Set();
    for (const l of p.lines || []) {
      const k = lineKey(l, p.width || 720, p.height || 540);
      if (seen.has(k)) continue;
      seen.add(k);
      lineCount.set(k, (lineCount.get(k) || 0) + 1);
    }
  }
  const isFurniture = (l, W, H) => {
    if (N < 3) return false;
    const c = lineCount.get(lineKey(l, W, H)) || 0;
    if (c < 3) return false;
    if (/^[*※•]/.test(l.text) || findCode(l.text) || looksLikeMaterial(l.text)) return false;
    if (FURNITURE_HINT.test(l.text.replace(/\d+/g, '#'))) return true;
    // 其它重复文字：只认页边的小字（页眉页脚）；材料部位（'柜体 & 柜门'、'台面：'）和空间 / 楼层标题永远保留
    // （同一空间连续几页、固定色板栏的版式里，它们本来就会在同一位置重复）
    const margin = l.y < 0.08 * H || l.y + l.h > 0.92 * H;
    const roleLike = ROLE_WORDS.some((r) => l.text.startsWith(r)) || /[：:]\s*$/.test(l.text);
    const titleLike = parseRoomTitle(l.text).known || !!parseFloorLabel(l.text);
    return c >= Math.max(3, 0.5 * N) && margin && l.fs < 13 && !roleLike && !titleLike;
  };
  const anyText = rawPages.some((p) => (p.lines || []).length > 0);

  // -------------------------------------------------------------------------
  // 2) 逐页分类 + 视角解析
  // -------------------------------------------------------------------------
  const pages = [];
  const floors = [];
  const views = [];
  const matMap = new Map(); // materialKey → { key, name, code, pending, imageKey, roles: Map }
  const matOrder = [];
  const detail = new Map(); // page n → { swatches, insets, unlabeled }
  let curFloor = null;
  let pendingPlan = null;
  let titleLines = [];
  const pageNotes = new Map(); // 非视角页的报告文字
  const report = (n, kind, text) => pageNotes.set(n, text);

  const addMaterial = (parsed, imageKey) => {
    const key = materialKey(parsed);
    if (!key) return null;
    let m = matMap.get(key);
    if (!m) {
      m = { key, name: parsed.name || '', code: parsed.code || '', pending: !!parsed.pending, imageKey: imageKey || null, roles: new Map() };
      matMap.set(key, m);
      matOrder.push(m);
    } else {
      if (!m.name && parsed.name) m.name = parsed.name;
      if (!m.imageKey && imageKey) m.imageKey = imageKey;
      if (parsed.pending) m.pending = true;
    }
    if (parsed.role) m.roles.set(parsed.role, (m.roles.get(parsed.role) || 0) + 1);
    return key;
  };

  const floorFor = (f) => {
    let fl = floors.find((x) => x.zh === f.zh && x.en === f.en);
    if (!fl) {
      fl = { key: `f${floors.length + 1}`, zh: f.zh, en: f.en, imageKey: null, planKey: null };
      floors.push(fl);
    }
    return fl;
  };

  for (const p of rawPages) {
    const W = p.width || 720;
    const H = p.height || 540;
    const PA = W * H;
    const lines = (p.lines || []).filter((l) => !isNoise(l.text) && !isFurniture(l, W, H));
    const text = lines.map((l) => l.text).join(' ');
    const imgs = (p.images || [])
      .map((im) => ({ ...clamp(im, W, H), key: im.key, pxW: im.pxW, pxH: im.pxH, raw: im }))
      .filter((im) => area(im) > 0);
    // 贴着上 / 下边的通栏横条：细条，或多页重复（标题页 / 楼层页的风景条）才是装饰；只出现一次的宽幅图是效果图
    const isStrip = (im) =>
      im.w >= 0.9 * W && im.h <= 0.5 * H && (im.y + im.h >= 0.95 * H || im.y <= 0.05 * H) && (im.h <= 0.15 * H || (pagesWith.get(im.key) || 0) >= 2);
    const content = imgs.filter((im) => !decor.has(im.key) && !isStrip(im)).sort((a, b) => area(b) - area(a));
    let big = content[0] && area(content[0]) / PA >= 0.18 ? content[0] : null;
    // 最大的图若是阴影 / 低清底图：另一张图盖住它 70% 以上、像素更多 → 那张才是效果图
    const px = (im) => (im.pxW || 0) * (im.pxH || 0);
    for (let guard = 0; big && guard < 3; guard++) {
      const cur = big;
      const better = content.find(
        (im) => im !== cur && im.key !== cur.key && overlapArea(im, cur) >= 0.7 * area(cur) && px(im) > 1.5 * px(cur) && area(im) / PA >= 0.18
      );
      if (!better) break;
      big = better;
    }
    const fullBleed = imgs.some((im) => area(im) / PA >= 0.85);
    const seenView = views.length > 0;

    // —— 尾页（联系方式）
    const contactLines = lines.filter((l) => CONTACT_RE.test(l.text)).length;
    if (p.n >= N - 1 && (contactLines >= 2 || (!big && CONTACT_RE.test(text) && lines.length >= 2))) {
      pages.push({ n: p.n, kind: 'end', title: '联系页' });
      report(p.n, 'end', '联系页');
      continue;
    }

    // —— 楼层章节页
    let floorLabel = lines.length && lines.length <= 6 && text.length <= 60 ? parseFloorLabel(text) : null;
    if (!floorLabel && !big && lines.length && lines.length <= 12) {
      // 章节页上还列了本层空间（'主人房 · 中厅 · 客房'）：字号最大的几行里有一行是纯楼层标签就算
      const maxFs = Math.max(...lines.map((l) => l.fs));
      const cand = lines.filter((l) => l.fs >= 0.8 * maxFs && l.text.length <= 30).map((l) => parseFloorLabel(l.text)).find(Boolean);
      if (cand) floorLabel = cand;
    }
    if (floorLabel && (!big || area(big) / PA >= 0.85)) {
      curFloor = floorFor(floorLabel);
      if (pendingPlan && !curFloor.planKey) curFloor.planKey = pendingPlan;
      pendingPlan = null;
      pages.push({ n: p.n, kind: 'floor', title: `${curFloor.zh} ${curFloor.en}` });
      report(p.n, 'floor', `${curFloor.zh} ${curFloor.en}`);
      continue;
    }

    // —— 封面（第一页，满版图、几乎没字）
    const roomTitled = lines.some((l) => l.fs >= 13 && parseRoomTitle(l.text).known);
    const labelled = lines.some((l) => looksLikeMaterial(l.text));
    if (p.n === 1 && N > 1 && anyText && (fullBleed || (big && area(big) / PA >= 0.6)) && lines.length <= 3 && !roomTitled && !labelled) {
      pages.push({ n: p.n, kind: 'cover', title: '封面' });
      report(p.n, 'cover', '封面');
      continue;
    }

    // —— 方案标题页（在第一个视角之前，写着「设计图 / 3D design / 方案」，没有效果图）
    if (!seenView && !big && lines.length && lines.length <= 8 && (TITLE_RE.test(text) || lines.some((l) => parseClientLine(l.text).client))) {
      titleLines = lines.map((l) => l.text);
      const t = lines.slice().sort((a, b) => b.fs - a.fs || a.y - b.y).map((l) => l.text).join(' · ');
      pages.push({ n: p.n, kind: 'title', title: t });
      report(p.n, 'title', t);
      continue;
    }

    // 页面写着空间标题 / 材料标签，却只有一张通栏横图（同一张横幅效果图用在了两页）→ 它就是效果图
    if (!big && (roomTitled || labelled)) {
      big = imgs.filter((im) => isStrip(im) && !decor.has(im.key) && area(im) / PA >= 0.18).sort((a, b) => area(b) - area(a))[0] || null;
    }

    if (!big) {
      const t = lines.slice(0, 2).map((l) => l.text).join(' ');
      pages.push({ n: p.n, kind: 'other', title: t });
      report(p.n, 'other', t || '（无文字）');
      continue;
    }

    // —— 效果图页 ------------------------------------------------------------
    const render = big;
    const renderArea = area(render);
    const others = content.filter((im) => im !== render && im.key !== render.key);
    // 文字是否落在某张图上
    const linesIn = (box) => lines.filter((l) => contains(box, center(l), 0.5));

    // 色板候选：比效果图小得多；和效果图重叠的小图只有身上 / 紧挨着有材料文字才算色板（否则是细节插图）
    const swatches = [];
    const insets = [];
    for (const im of others) {
      if (area(im) / PA < 0.003 || area(im) >= 0.45 * renderArea) continue;
      const ov = overlapArea(im, render) / area(im);
      if (ov > 0.2) {
        const near = lines.filter((l) => rectDistance(l, im) <= 12 && looksLikeMaterial(l.text));
        if (near.length && near.some((l) => contains(im, center(l)))) swatches.push(im);
        else insets.push(im);
        continue;
      }
      swatches.push(im);
    }
    const swatchOf = (l) => swatches.find((s) => contains(s, center(l), 0.5)) || null;

    // 标题：页面上方 18% 内、最大字号（≥ 13pt）、不在色板上、不含材料编号；上方没有 → 找页面底部（效果图下方）
    const inRenderBox = (l) => contains({ x: render.x + 1, y: render.y + 1, w: render.w - 2, h: render.h - 2 }, center(l));
    const pickTitle = (cands) => {
      if (!cands.length) return [];
      const maxFs = Math.max(...cands.map((l) => l.fs));
      const big1 = cands.filter((l) => l.fs >= 0.85 * maxFs);
      const y0 = Math.min(...big1.map((l) => l.y));
      return big1.filter((l) => l.y <= y0 + 1.6 * maxFs).sort((a, b) => a.y - b.y || a.x - b.x);
    };
    let titleSet = pickTitle(lines.filter((l) => l.y < 0.18 * H && l.fs >= 13 && !swatchOf(l) && !findCode(l.text)));
    const titleable = (l) => !swatchOf(l) && !findCode(l.text) && !inRenderBox(l) && !/^[*※•]/.test(l.text);
    if (!titleSet.length) titleSet = pickTitle(lines.filter((l) => l.y > 0.78 * H && l.fs >= 13 && titleable(l)));
    // 竖版 / 杂志式排版：标题在效果图下方的中间位置 → 效果图外字号明显偏大（≥ 16pt）的那行
    if (!titleSet.length) titleSet = pickTitle(lines.filter((l) => l.fs >= 16 && titleable(l)));
    if (titleSet.length) {
      // 中文大标题下面紧跟一行小字英文名（'客厅' / 'LIVING AREA'）：也是标题
      const maxFs = Math.max(...titleSet.map((l) => l.fs));
      const bottom = Math.max(...titleSet.map((l) => l.y + l.h));
      const left = Math.min(...titleSet.map((l) => l.x));
      const right = Math.max(...titleSet.map((l) => l.x + l.w));
      const en = lines.find(
        (l) =>
          !titleSet.includes(l) &&
          /^[A-Za-z][A-Za-z0-9 &'’.\-]{2,}$/.test(l.text) &&
          l.y >= bottom - 0.3 * maxFs &&
          l.y - bottom <= 1.2 * maxFs &&
          (Math.abs(l.x - left) <= 1.5 * maxFs || (l.x < right && l.x + l.w > left)) &&
          !swatchOf(l) &&
          !findCode(l.text)
      );
      if (en && titleSet.every((l) => hasHan(l.text))) titleSet = [...titleSet, en];
    }
    const titleText = joinLines(titleSet.map((l) => l.text));

    const rest = lines.filter((l) => !titleSet.includes(l));
    const inRender = (l) => contains({ x: render.x + 1, y: render.y + 1, w: render.w - 2, h: render.h - 2 }, center(l));
    const labelLines = rest.filter((l) => !inRender(l) || swatchOf(l));
    const annoLines = rest.filter((l) => inRender(l) && !swatchOf(l));

    // —— 平面布置图：挂到楼层上，不当效果图
    if (PLAN_RE.test(titleText)) {
      if (curFloor && !curFloor.planKey) curFloor.planKey = render.key;
      else pendingPlan = render.key;
      pages.push({ n: p.n, kind: 'other', title: `平面布置图 · ${titleText}` });
      report(p.n, 'other', `平面布置图 · ${titleText}`);
      continue;
    }

    // 标签块 → 色板
    const labelBlocks = groupBlocks(labelLines, swatchOf);
    const assigned = new Map(); // swatch → [{ block, d }]
    const freeBlocks = [];
    for (const blk of labelBlocks) {
      const first = blk.lines[0].text;
      if (/^[*※•]/.test(first)) {
        freeBlocks.push(blk);
        continue;
      }
      const joined = blk.lines.map((l) => l.text).join('\n');
      let best = null;
      for (const s of swatches) {
        const inside = blk.container === s || contains(s, center(blk.box), 0.5);
        const d = inside ? 0 : rectDistance(blk.box, s);
        if (d > 40) continue;
        const above = !inside && blk.box.y + blk.box.h <= s.y + 2;
        const score = d * (above ? 1.6 : 1);
        if (!best || score < best.score) best = { s, d, score, inside };
      }
      if (best && (best.inside || looksLikeMaterial(joined))) {
        if (!assigned.has(best.s)) assigned.set(best.s, []);
        assigned.get(best.s).push({ block: blk, ...best });
      } else {
        freeBlocks.push(blk);
      }
    }

    // 每张色板：在它身上的块全部合并；身外的只取最近的一块，其余块另找空闲色板或当备注
    const matsHere = [];
    const leftovers = [];
    for (const [s, list] of assigned) {
      const insideBlocks = list.filter((x) => x.inside);
      let chosen;
      if (insideBlocks.length) {
        chosen = insideBlocks.map((x) => x.block);
        leftovers.push(...list.filter((x) => !x.inside).map((x) => x.block));
      } else {
        list.sort((a, b) => a.score - b.score);
        chosen = [list[0].block];
        leftovers.push(...list.slice(1).map((x) => x.block));
      }
      const blkLines = chosen.flatMap((b) => b.lines).sort((a, b) => a.y - b.y || a.x - b.x);
      matsHere.push({ swatch: s, lines: blkLines });
    }
    for (const blk of leftovers) {
      const free = swatches
        .filter((s) => !assigned.has(s))
        .map((s) => ({ s, d: rectDistance(blk.box, s) }))
        .filter((x) => x.d <= 40)
        .sort((a, b) => a.d - b.d)[0];
      if (free) {
        assigned.set(free.s, [{ block: blk, d: free.d, inside: false }]);
        matsHere.push({ swatch: free.s, lines: blk.lines });
      } else {
        freeBlocks.push(blk);
      }
    }

    const viewMats = [];
    const notes = [];
    const pushNote = (n, free, y) => {
      if (n && !notes.some((x) => x.text === n.text)) notes.push({ ...n, free, y });
    };
    matsHere.sort((a, b) => a.swatch.y - b.swatch.y || a.swatch.x - b.swatch.x);
    for (const { swatch, lines: ls } of matsHere) {
      const parsed = parseMaterialLabel(ls.map((l) => l.text).join('\n'));
      if (!parsed.name && !parsed.code) continue;
      const key = addMaterial(parsed, swatch.key);
      if (key && !viewMats.some((m) => m.materialKey === key)) viewMats.push({ role: parsed.role, materialKey: key, explicit: !!parsed.role });
    }
    // 没有色板的标签：有编号（或「部位：」写法且紧挨其它标签）的仍算材料，其它当备注
    for (const blk of freeBlocks) {
      const joined = blk.lines.map((l) => l.text).join('\n');
      const parsedNote = /^[*※•]/.test(blk.lines[0].text) ? null : parseMaterialLabel(joined);
      const nearLabels = matsHere.some((m) => rectDistance(unionBox(m.lines), blk.box) <= 60);
      if (parsedNote && looksLikeMaterial(joined) && (parsedNote.code || (parsedNote.role && nearLabels))) {
        const key = addMaterial(parsedNote, null);
        if (key && !viewMats.some((m) => m.materialKey === key)) viewMats.push({ role: parsedNote.role, materialKey: key, explicit: !!parsedNote.role });
        continue;
      }
      for (const item of splitItems(blk)) pushNote(parseNoteText(item.map((l) => l.text)), true, item[0].y);
    }
    // 效果图上的标注
    for (const blk of groupBlocks(annoLines)) {
      for (const item of splitItems(blk)) pushNote(parseNoteText(item.map((l) => l.text)), false, item[0].y);
    }
    notes.sort((a, b) => a.y - b.y);

    // 空间标题
    let parsedTitle = titleText ? parseRoomTitle(titleText) : null;
    if (parsedTitle && !parsedTitle.room && !parsedTitle.roomEn) parsedTitle = null;
    const prev = views[views.length - 1];
    // 标题里写了楼层（'二楼 主人房'、'GF Living Room'）→ 以标题为准
    if (parsedTitle?.floor) curFloor = floorFor(parsedTitle.floor);
    const v = {
      page: p.n,
      floorKey: curFloor ? curFloor.key : null,
      imageKey: render.key,
      room: parsedTitle ? parsedTitle.room : prev?.room || '',
      roomEn: parsedTitle ? parsedTitle.roomEn : prev?.roomEn || '',
      feature: parsedTitle ? parsedTitle.feature : prev?.feature || '',
      qualifier: parsedTitle ? parsedTitle.qualifier : '',
      subtitle: '',
      materials: viewMats,
      notes,
      renderAspect: render.pxW && render.pxH ? Math.round((render.pxW / render.pxH) * 1000) / 1000 : Math.round((render.w / render.h) * 1000) / 1000,
      inherited: false,
      inheritedNotes: false,
      titleRaw: titleText,
      renderFullWidth: render.w >= 0.95 * W,
    };
    views.push(v);
    detail.set(p.n, { swatches: swatches.length, insets: insets.length, unlabeled: swatches.filter((s) => !assigned.has(s)).length });
    pages.push({ n: p.n, kind: 'view', title: '' }); // 标题在后面统一补
  }

  // -------------------------------------------------------------------------
  // 3) 材料部位补全：本页没写部位 → 用该材料在其它页最常见的部位 → 按名称推断
  // -------------------------------------------------------------------------
  //    同页已有同名部位（'柜体 & 柜门' 已被别的材料占用）→ 记作「搭配」；排序：写明部位的在前，「搭配」最后
  for (const v of views) {
    const explicitRoles = new Set(v.materials.filter((vm) => vm.explicit).map((vm) => vm.role));
    for (const vm of v.materials) {
      if (vm.role) continue;
      const m = matMap.get(vm.materialKey);
      const top = m ? [...m.roles.entries()].sort((a, b) => b[1] - a[1])[0] : null;
      const role = top ? top[0] : inferRole(m?.name);
      vm.role = role && explicitRoles.has(role) ? '搭配' : role;
    }
    // 柜体 / 柜门（主材）在前 → 其它写明部位的 → 推断部位的 → 「搭配」
    const rank = (vm) => (vm.role === '搭配' ? 3 : !vm.explicit ? 2 : /柜体|柜门|柜身/.test(vm.role) ? 0 : 1);
    v.materials = v.materials
      .map((vm, i) => ({ vm, i }))
      .sort((a, b) => rank(a.vm) - rank(b.vm) || a.i - b.i)
      .map(({ vm }) => ({ role: vm.role, materialKey: vm.materialKey }));
  }

  // -------------------------------------------------------------------------
  // 4) 同一空间连续视角：没有色板的页沿用最近一页的材料（最多 3 种，便于满版排版）
  // -------------------------------------------------------------------------
  const runs = [];
  for (const v of views) {
    const last = runs[runs.length - 1];
    if (last && last[0].room === v.room && last[0].floorKey === v.floorKey) last.push(v);
    else runs.push([v]);
  }
  //    既没材料也没备注的页，再沿用同一空间页面上的文字说明（'* 开门方式：免拉手' 这类整页备注，不含图上标注）
  const nearest = (run, v, pick) => {
    const own = run.filter((o) => o !== v && pick(o));
    return own.filter((o) => o.page < v.page).pop() || own.find((o) => o.page > v.page) || null;
  };
  for (const run of runs) {
    const ownMats = new Set(run.filter((v) => v.materials.length));
    const ownNotes = new Set(run.filter((v) => v.notes.length));
    for (const v of run) {
      if (ownMats.has(v) || ownNotes.has(v)) {
        if (!ownMats.has(v)) {
          const src = nearest(run, v, (o) => ownMats.has(o));
          if (src) {
            v.materials = src.materials.slice(0, 3).map((m) => ({ ...m }));
            v.inherited = true;
          }
        }
        continue;
      }
      const src = nearest(run, v, (o) => ownMats.has(o));
      if (src) {
        v.materials = src.materials.slice(0, 3).map((m) => ({ ...m }));
        v.inherited = true;
      }
      const srcN = nearest(run, v, (o) => ownNotes.has(o) && o.notes.some((n) => n.free));
      if (srcN) {
        v.notes = srcN.notes.filter((n) => n.free).map((n) => ({ ...n }));
        v.inheritedNotes = true;
      }
    }
  }

  // 备注整理：标题里已经写了的短标注不重复（'卫生间隐形门'）；同一中文标签全稿统一成双语（'隐形门' → '隐形门 · Hidden door'）
  const bilingual = new Map();
  for (const v of views) for (const n of v.notes) if (/ · [A-Za-z]/.test(n.label)) bilingual.set(n.label.split(' · ')[0], n.label);
  for (const v of views) {
    const titleText = [v.room, v.feature].join(' ').replace(/\s+/g, '');
    v.notes = v.notes
      .filter((n) => !(n.text.replace(/\s+/g, '').length <= 7 && titleText.includes(n.text.replace(/\s+/g, ''))))
      .map((n) => (bilingual.has(n.label) ? { ...n, label: bilingual.get(n.label) } : n));
    // 两条以上的短标注（'推拉玻璃柜'、'5 × 抽屉柜'）合并成一条「设计亮点」，免得右侧说明挤爆
    const isCallout = (n) => ['keyword', 'generic'].includes(n.via) && n.text.replace(/\s+/g, '').length <= 9 && !/[，,。；;]/.test(n.text) && !/是|会|能|可|有|要|让|做|加|配|用|放|避免|建议/.test(n.text);
    const callouts = v.notes.filter(isCallout);
    if (callouts.length >= 2) {
      const merged = { label: '设计亮点', text: callouts.map((n) => n.text).join(' · '), via: 'merged', free: callouts.every((n) => n.free) };
      const firstIdx = v.notes.indexOf(callouts[0]);
      const restNotes = v.notes.filter((n) => !callouts.includes(n));
      restNotes.splice(Math.min(firstIdx, restNotes.length), 0, merged);
      v.notes = restNotes;
    }
  }

  // -------------------------------------------------------------------------
  // 5) 副标题：唯一的一条备注做副标题（「客厅 · 隐形门」），重复的标题编号「视角二、视角三…」
  // -------------------------------------------------------------------------
  const seenTitles = new Map();
  for (const v of views) {
    if (!v.feature && !v.qualifier && v.notes.length === 1 && !v.inheritedNotes && ['term', 'lead', 'colon'].includes(v.notes[0].via)) {
      const zh = (v.notes[0].label || '').split(' · ')[0].trim();
      if (SUBTITLE_KEYWORDS.has(zh)) v.feature = zh;
    }
    const k = [v.floorKey, v.room, v.feature, v.qualifier].join('|');
    const count = (seenTitles.get(k) || 0) + 1;
    seenTitles.set(k, count);
    v.subtitle = [v.feature, count > 1 ? viewNo(count) : '', v.qualifier].filter(Boolean).join(' · ');
  }

  // 楼层章节页背景：该层第一张满幅横图
  for (const f of floors) {
    const v = views.find((x) => x.floorKey === f.key && x.renderFullWidth && x.renderAspect >= 1.7);
    f.imageKey = v ? v.imageKey : null;
  }

  // -------------------------------------------------------------------------
  // 6) 项目信息：文件名 → 标题页 → PDF 元数据
  // -------------------------------------------------------------------------
  const fromFile = parseFileName(fileName || '');
  let client = fromFile.client;
  let location = fromFile.location;
  if (!client || !location) {
    for (const t of titleLines) {
      const r = parseClientLine(t);
      if (r.client) {
        client = client || r.client;
        location = location || r.location;
        break;
      }
    }
  }
  const info = {
    client: client || '',
    location: location || '',
    date: fromFile.date || formatPdfDate(meta.creationDate) || '',
    sourceFile: String(fileName || '').replace(/^.*[\\/]/, ''),
  };

  // -------------------------------------------------------------------------
  // 7) 输出整理 + 报告
  // -------------------------------------------------------------------------
  const materials = matOrder.map(({ key, name, code, pending, imageKey }) => ({ key, name, code, pending, imageKey }));
  const floorByKey = new Map(floors.map((f) => [f.key, f]));
  const reportLines = [];
  for (const pg of pages) {
    if (pg.kind === 'view') {
      const v = views.find((x) => x.page === pg.n);
      const title = [v.room, v.subtitle].filter(Boolean).join(' · ') || '（无标题）';
      pg.title = title;
      const fl = v.floorKey ? floorByKey.get(v.floorKey)?.zh : '—';
      const mats = v.materials
        .map((m) => {
          const mat = matMap.get(m.materialKey);
          const label = mat?.code || mat?.name || m.materialKey;
          return `${m.role || '材料'}=${label}${mat?.pending ? '(待确认)' : ''}${mat && !mat.imageKey ? '[无图]' : ''}`;
        })
        .join(', ');
      const notes = v.notes.map((n) => `${n.label}=${n.text}`).join('; ');
      const d = detail.get(v.page);
      const extra = [];
      if (d?.insets) extra.push(`细节插图 ${d.insets}`);
      if (d?.unlabeled) extra.push(`无标签小图 ${d.unlabeled}`);
      reportLines.push(
        `p${pad2(pg.n)} view ${fl} ${title}` +
          (mats ? ` | mats${v.inherited ? '↺' : ''}: ${mats}` : '') +
          (notes ? ` | notes${v.inheritedNotes ? '↺' : ''}: ${notes}` : '') +
          (extra.length ? ` | ${extra.join(', ')}` : '')
      );
    } else {
      reportLines.push(`p${pad2(pg.n)} ${pg.kind} ${pageNotes.get(pg.n) || pg.title || ''}`.trim());
    }
  }

  return {
    info,
    floors: floors.map(({ key, zh, en, imageKey, planKey }) => ({ key, zh, en, imageKey, planKey })),
    materials,
    views: views.map(({ page, floorKey, imageKey, room, roomEn, subtitle, materials: ms, notes, renderAspect, inherited }) => ({
      page, floorKey, imageKey, room, roomEn, subtitle, materials: ms, notes: notes.map(({ label, text }) => ({ label, text })), renderAspect, inherited,
    })),
    pages,
    report: reportLines,
  };
}
