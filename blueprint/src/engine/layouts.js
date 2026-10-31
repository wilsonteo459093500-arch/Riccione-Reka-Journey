// 方案页版式 —— 坐标全部取自已定稿的 Dreamhouse Blueprint PPT（第 15–55 页），保证生成结果与定稿一致。
// 每个函数：(数据, ctx) → { bg, els, warnings }；ctx = { meta(src)→{w,h}|null, project, tr }
// tr = 这一页的翻译器（engine/lang.js makeTranslator）：华文 = 定稿原样；English = 全英文；中英 = 中文为主、英文写在下面。
// 不传 tr 时按华文排（测试 / 旧调用）。

import { C, TS, BRAND_FOOTER, SLIDE_W, SLIDE_H } from '../theme.js';
import { rect, gradRect, img, text, richText, measureText, countLines, lineHeightPx, hasCJK } from './spec.js';
import { clientLine, floorsLine } from './model.js';
import { enAlreadyIn, floorTitleEn, floorsLineEn } from './lang.js';

const withNat = (el, ctx) => {
  const nat = el.src && ctx?.meta ? ctx.meta(el.src) : null;
  return nat ? { ...el, nat } : el;
};

/** 没传翻译器 = 华文 */
const ZH_TR = { lang: 'zh', misses: [], en: () => '', show: (s) => String(s ?? ''), room: () => '' };
const trOf = (ctx) => ctx?.tr || ZH_TR;

// 中英版：英文副行（跟在中文下面，小一号、浅一点）
const EN2 = { font: 'serif', size: 18, color: C.muted };
const EN2_DARK = { font: 'serif', size: 18, color: C.lightMuted };
const EN2_LH = lineHeightPx(18); // 28.8
// 中英版：标题下面的英文小字（大写）
const SUBLINE = { font: 'sans', size: 18, spacing: 3.6, color: C.faint };
const SUBLINE_DARK = { font: 'sans', size: 18, spacing: 3.6, color: C.lightMuted };

const up = (s) => String(s ?? '').toUpperCase();

/** 中英版的「中文 · ENGLISH」小标签；英文已经写在中文里（「隐形门 · Hidden door」）就不重复 */
function biLabel(zh, en) {
  return en && !enAlreadyIn(zh, en) ? `${zh} · ${up(en)}` : zh;
}

// ---------------------------------------------------------------------------
// 共用部件
// ---------------------------------------------------------------------------

export function footer(dark, rightLabel, { ruleW = 1728, rightEdge = 1824 } = {}) {
  const els = [
    rect(96, 983.7, ruleW, 1, dark ? C.light : C.line, dark ? 0.25 : 1),
    text(96, 1002.6, 600, 41.4, BRAND_FOOTER, dark ? TS.footBrandDark : TS.footBrand),
  ];
  if (rightLabel) {
    els.push(text(rightEdge - 600, 1005.4, 602.7, 35.8, rightLabel, dark ? TS.footRightDark : TS.footRight, { align: 'r' }));
  }
  return els;
}

/** 材料显示值：名称 + 编号（编号用无衬线小字，与定稿一致） */
function materialRuns(mat, dark, unnamed = '未命名材料') {
  const name = (mat?.name || '').trim() || (mat?.code ? '' : unnamed);
  const code = (mat?.code || '').trim();
  const runs = [];
  if (name) runs.push({ ...(dark ? TS.valueDark : TS.value), text: name });
  if (code) runs.push({ ...(dark ? TS.codeDark : TS.code), text: `${name ? ' ' : ''}${code}` });
  if (!runs.length) runs.push({ ...(dark ? TS.valueDark : TS.value), text: '—' });
  return runs;
}

function materialValueWidth(mat) {
  const name = (mat?.name || '').trim();
  const code = (mat?.code || '').trim();
  return measureText(name, 'serif', 22.5) + (code ? measureText(` ${code}`, 'sans', 18, 2.52) : 0);
}

/** 材料的英文名（英文 / 中英版用；没有中文名 = ''） */
const matEn = (mat, tr) => ((mat?.name || '').trim() ? tr.en(mat.name, 'material') : '');

/**
 * 材料值（按语言）：
 *   华文 → 名称 + 编号；English → 英文名 + 编号（缺英文先用中文）；中英 → 名称 + 编号，英文名另起一行（second）
 */
function materialValue(mat, tr) {
  if (tr.lang === 'zh' || !mat) return { main: mat, second: '' };
  const en = matEn(mat, tr);
  if (tr.lang === 'en') return { main: { ...mat, name: en || mat.name }, second: '' };
  return { main: mat, second: en && !enAlreadyIn(mat.name, en) ? en : '' };
}

const viewTitle = (v) => [v.room, v.subtitle].map((s) => (s || '').trim()).filter(Boolean).join(' · ') || '未命名';

const viewEyebrow = (v, floor) =>
  [floor?.en, (v.roomEn || '').trim().toUpperCase()].filter(Boolean).join(' · ') || 'DESIGN';

const floorFooter = (floor) => (floor ? [floor.en, floor.zh].filter(Boolean).join(' · ') : 'DESIGN · 03');

/**
 * 效果图页的标题区文字：{ eyebrow, title, sub, titleField, subField }
 *   华文：GROUND FLOOR · LIVING AREA / 客厅 · 电视柜
 *   English：GROUND FLOOR / Living Area · TV Cabinet
 *   中英：GROUND FLOOR / 客厅 · 电视柜 / LIVING AREA · TV CABINET
 */
function viewHead(view, floor, tr) {
  if (tr.lang === 'zh') return { eyebrow: viewEyebrow(view, floor), title: viewTitle(view), sub: '', titleField: 'title', subField: null };
  const room = (view.room || '').trim();
  const subtitle = (view.subtitle || '').trim();
  const roomEn = room || (view.roomEn || '').trim() ? tr.room(view) : '';
  const subEn = subtitle ? tr.en(subtitle, 'view') : '';
  const eyebrow = (floor?.en || '').trim() || 'DESIGN';
  const enField = subtitle ? 'subtitleEn' : 'roomEn';
  if (tr.lang === 'en') {
    const title = [roomEn || room, subEn || subtitle].filter(Boolean).join(' · ') || 'Untitled';
    return { eyebrow, title, sub: '', titleField: enField, subField: null };
  }
  const sub = up([roomEn, subEn].filter(Boolean).join(' · '));
  return { eyebrow, title: viewTitle(view), sub, titleField: 'title', subField: enField };
}

/** 备注 / 材料行的小标签（按语言）+ 点它时定位的输入框 */
function noteLabel(n, i, tr) {
  if (tr.lang === 'zh') return { text: (n.label || '备注').trim(), field: `notes.${i}.label` };
  const zh = (n.label || '').trim() || '备注';
  const en = tr.en((n.label || '').trim() || '备注', 'label');
  if (tr.lang === 'en') return { text: up(en || zh), field: `notes.${i}.labelEn` };
  return { text: biLabel(zh, en), field: `notes.${i}.label` };
}

function roleLabel(r, i, tr) {
  if (tr.lang === 'zh') return { text: (r.role || '材料').trim(), field: `materials.${i}.role` };
  const zh = (r.role || '').trim() || '材料';
  const en = tr.en((r.role || '').trim() || '材料', 'role');
  if (tr.lang === 'en') return { text: up(en || zh), field: `materials.${i}.roleEn` };
  return { text: biLabel(zh, en), field: `materials.${i}.role` };
}

/** 备注正文（按语言）：{ main, second } —— 中英版 second = 英文（写在中文下面） */
function noteBody(n, tr) {
  const zh = (n.text || '').trim();
  if (tr.lang === 'zh' || !zh) return { main: zh, second: '' };
  const en = tr.en(zh, 'note');
  if (tr.lang === 'en') return { main: en || zh, second: '' };
  return { main: zh, second: en && !enAlreadyIn(zh, en) ? en : '' };
}

// ---------------------------------------------------------------------------
// 本案材料（定稿第 15 页）：6 列 × 2 行，超出由 deck.js 分页
// ---------------------------------------------------------------------------

// ≤12 种：定稿的 2 行大格；13–18 种：3 行紧凑格（避免第二页只剩一两种）；更多才分页
export const MATERIALS_PER_PAGE = 18;

export function layoutMaterials(materials, ctx, opts = {}) {
  const tr = trOf(ctx);
  if (tr.lang === 'bi') return materials.length > 12 ? layoutMaterialsCompactBi(materials, ctx, opts) : layoutMaterialsRegularBi(materials, ctx, opts);
  if (materials.length > 12) return layoutMaterialsCompact(materials, ctx, opts);
  return layoutMaterialsRegular(materials, ctx, opts);
}

function materialsHeader(ctx, page, pages) {
  const tr = trOf(ctx);
  const info = ctx.project?.info || {};
  const who = clientLine(info).toUpperCase();
  const caption = ['MATERIAL PALETTE', who, pages > 1 ? `${page}/${pages}` : ''].filter(Boolean).join(' · ');
  const en = tr.lang === 'en';
  return [
    text(96, 96, 900, 35.8, en ? 'MATERIALS' : 'MATERIALS · 材料', TS.eyebrow),
    rect(96, 151.8, 56, 1, C.rule),
    text(96, 180.8, 900, 80.8, en ? 'Selected Materials' : '本案材料', { font: 'serif', size: 48, color: C.ink }, { lineSpacing: 83.43 }),
    text(1024, 227.7, 802.7, 33.9, caption, { font: 'sans', size: 18, spacing: 5.76, color: C.faint }, { align: 'r' }),
  ];
}

/** 色板下面的名称（English 版用英文名，缺英文先用中文） */
function materialNameOf(m, tr, fallback) {
  const zh = (m.name || '').trim();
  if (tr.lang === 'en') return matEn(m, tr) || zh || m.code || fallback;
  return zh || m.code || fallback;
}

function layoutMaterialsCompact(materials, ctx, { page = 1, pages = 1 } = {}) {
  const tr = trOf(ctx);
  const unnamed = tr.lang === 'en' ? 'Unnamed material' : '未命名材料';
  const els = materialsHeader(ctx, page, pages);
  const cellW = 261.3;
  const cellH = 120;
  const step = 293.33;
  const rows = [288, 516, 744];
  materials.slice(0, 18).forEach((m, i) => {
    const x = 96 + (i % 6) * step;
    const y = rows[Math.floor(i / 6)];
    if (m.image) els.push(withNat(img(x, y, cellW, cellH, m.image, { edit: { field: `material:${m.id}` } }), ctx));
    else els.push(rect(x, y, cellW, cellH, C.placeholder));
    const name = materialNameOf(m, tr, unnamed);
    const code = m.name ? (m.code || '').trim() : '';
    if (tr.lang === 'en') {
      // 英文名长：最多折两行（第三排也放得下：744 + 120 + 10 + 2×31 + 34 < 983）
      const lines = Math.min(2, countLines(name, 'serif', 19.5, 0, 287.5));
      const nh = 40 + (lines - 1) * 31;
      els.push({ ...text(x, y + cellH + 10, 287.5, nh, name, { font: 'serif', size: 19.5, color: C.ink }, { edit: { field: `material:${m.id}` } }), autofit: 'shrink', ...(lines > 1 ? { fitWrap: true } : { nowrap: true }) });
      if (code) els.push(text(x, y + cellH + 10 + nh, 287.5, 33.9, code, { font: 'sans', size: 16.5, spacing: 2.52, color: C.faint }));
      return;
    }
    els.push({ ...text(x, y + cellH + 10, 287.5, 40, name, { font: 'serif', size: 19.5, color: C.ink }, { edit: { field: `material:${m.id}` } }), autofit: 'shrink', nowrap: true });
    if (code) els.push(text(x, y + cellH + 50, 287.5, 33.9, code, { font: 'sans', size: 16.5, spacing: 2.52, color: C.faint }));
  });
  els.push(...footer(false, 'DESIGN · 03'));
  return { bg: C.paper, els, warnings: [] };
}

function layoutMaterialsRegular(materials, ctx, { page = 1, pages = 1 } = {}) {
  const tr = trOf(ctx);
  const en = tr.lang === 'en';
  const els = materialsHeader(ctx, page, pages);
  const cellW = 261.3;
  const cellH = 190;
  const step = 293.33;
  const list = materials.slice(0, 12);
  const nameOf = (m) => materialNameOf(m, tr, en ? 'Unnamed material' : '未命名材料');
  // 名称最多两行（再长就缩字号）；第一排有两行的名称时，第二排整体下移（编号不会被下一排的色板盖住），
  // 这时第二排名称限一行，免得编号压到页脚线
  const wantLines = (m) => Math.min(2, countLines(nameOf(m), 'serif', 21, 0, 287.5));
  const row1Extra = Math.max(0, ...list.slice(0, 6).map((m) => wantLines(m) - 1)) * 40.2;
  const rows = [300, 620.1 + row1Extra];
  const maxLinesAt = (i) => (i >= 6 && row1Extra ? 1 : 2);
  list.forEach((m, i) => {
    const x = 96 + (i % 6) * step;
    const y = rows[Math.floor(i / 6)];
    if (m.image) {
      els.push(withNat(img(x, y, cellW, cellH, m.image, { edit: { field: `material:${m.id}` } }), ctx));
    } else {
      els.push(rect(x, y, cellW, cellH, C.placeholder));
    }
    const name = nameOf(m);
    const code = m.name ? (m.code || '').trim() : '';
    const lines = Math.min(maxLinesAt(i), wantLines(m));
    els.push({
      ...text(x, y + 208, 287.5, 44.2 + (lines - 1) * 40.2, name, { font: 'serif', size: 21, color: C.ink }, { edit: { field: `material:${m.id}` } }),
      autofit: 'shrink',
      ...(maxLinesAt(i) === 1 ? { nowrap: true } : { fitWrap: true }),
    });
    if (code) els.push(text(x, y + 254.2 + (lines - 1) * 40.2, 287.5, 33.9, code, { font: 'sans', size: 18, spacing: 2.52, color: C.faint }));
  });
  if (!materials.length) {
    els.push(text(96, 420, 1728, 60, en ? 'No materials yet — add them in the Materials list.' : '还没有材料 —— 在「材料清单」里添加，或从 PDF 自动识别。', { font: 'serif', size: 24, color: C.faint }));
  }
  els.push(...footer(false, 'DESIGN · 03'));
  return { bg: C.paper, els, warnings: materials.length ? [] : ['本案材料为空'] };
}

// 中英版本案材料：中文名、英文名（小一号）、编号三行；每格的文字高度按实际行数排，第二排跟着第一排下移
const BI_EN_SIZE = 16;
const BI_EN_LH = lineHeightPx(BI_EN_SIZE) + 2; // 27.6

function layoutMaterialsRegularBi(materials, ctx, { page = 1, pages = 1 } = {}) {
  const tr = trOf(ctx);
  const els = materialsHeader(ctx, page, pages);
  const cellW = 261.3;
  const cellH = 190;
  const step = 293.33;
  const list = materials.slice(0, 12);
  const info = list.map((m) => {
    const zh = (m.name || '').trim() || m.code || '未命名材料';
    const en = matEn(m, tr);
    const second = en && !enAlreadyIn(zh, en) ? en : '';
    return {
      m,
      zh,
      en: second,
      code: m.name ? (m.code || '').trim() : '',
      zhLines: Math.min(2, countLines(zh, 'serif', 21, 0, 287.5)),
      enLines: second ? Math.min(2, countLines(second, 'serif', BI_EN_SIZE, 0, 287.5)) : 0,
    };
  });
  const blockH = (c, zhLines = c.zhLines, enLines = c.enLines) => 44.2 + (zhLines - 1) * 40.2 + (enLines ? enLines * BI_EN_LH + 2 : 0) + (c.code ? 36 : 0);
  // 第二排：先按各自的行数排；第一排最高的那格决定第二排往下移多少；放不下就让第二排都只排一行
  const row1H = Math.max(0, ...info.slice(0, 6).map((c) => blockH(c)));
  const row2Y = Math.max(620.1, 300 + cellH + 18 + row1H + 36);
  let row2Compact = false;
  if (info.length > 6 && row2Y + cellH + 18 + Math.max(...info.slice(6).map((c) => blockH(c))) > 975) row2Compact = true;
  const rows = [300, row2Y];
  info.forEach((c, i) => {
    const { m } = c;
    const x = 96 + (i % 6) * step;
    const y = rows[Math.floor(i / 6)];
    if (m.image) els.push(withNat(img(x, y, cellW, cellH, m.image, { edit: { field: `material:${m.id}` } }), ctx));
    else els.push(rect(x, y, cellW, cellH, C.placeholder));
    const one = i >= 6 && row2Compact;
    const zhLines = one ? 1 : c.zhLines;
    const enLines = one ? Math.min(1, c.enLines) : c.enLines;
    let ty = y + 208;
    els.push({
      ...text(x, ty, 287.5, 44.2 + (zhLines - 1) * 40.2, c.zh, { font: 'serif', size: 21, color: C.ink }, { edit: { field: `material:${m.id}` } }),
      autofit: 'shrink',
      ...(zhLines === 1 ? { nowrap: true } : { fitWrap: true }),
    });
    ty += 44.2 + (zhLines - 1) * 40.2;
    if (c.en) {
      els.push({
        ...text(x, ty - 4, 287.5, enLines * BI_EN_LH + 2, c.en, { ...EN2, size: BI_EN_SIZE }, { edit: { field: `material:${m.id}` } }),
        autofit: 'shrink',
        ...(enLines === 1 ? { nowrap: true } : { fitWrap: true }),
      });
      ty += enLines * BI_EN_LH + 2;
    }
    if (c.code) els.push(text(x, ty, 287.5, 33.9, c.code, { font: 'sans', size: 18, spacing: 2.52, color: C.faint }));
  });
  if (!materials.length) {
    els.push(text(96, 420, 1728, 60, '还没有材料 —— 在「材料清单」里添加，或从 PDF 自动识别。', { font: 'serif', size: 24, color: C.faint }));
  }
  els.push(...footer(false, 'DESIGN · 03'));
  return { bg: C.paper, els, warnings: materials.length ? [] : ['本案材料为空'] };
}

function layoutMaterialsCompactBi(materials, ctx, { page = 1, pages = 1 } = {}) {
  const tr = trOf(ctx);
  const els = materialsHeader(ctx, page, pages);
  const cellW = 261.3;
  const cellH = 100;
  const step = 293.33;
  const rows = [288, 516, 744];
  materials.slice(0, 18).forEach((m, i) => {
    const x = 96 + (i % 6) * step;
    const y = rows[Math.floor(i / 6)];
    if (m.image) els.push(withNat(img(x, y, cellW, cellH, m.image, { edit: { field: `material:${m.id}` } }), ctx));
    else els.push(rect(x, y, cellW, cellH, C.placeholder));
    const zh = (m.name || '').trim() || m.code || '未命名材料';
    const en = matEn(m, tr);
    const second = en && !enAlreadyIn(zh, en) ? en : '';
    const code = m.name ? (m.code || '').trim() : '';
    let ty = y + cellH + 8;
    els.push({ ...text(x, ty, 287.5, 40, zh, { font: 'serif', size: 19.5, color: C.ink }, { edit: { field: `material:${m.id}` } }), autofit: 'shrink', nowrap: true });
    ty += 38;
    if (second) {
      els.push({ ...text(x, ty, 287.5, 30, second, { ...EN2, size: 15 }, { edit: { field: `material:${m.id}` } }), autofit: 'shrink', nowrap: true });
      ty += 28;
    }
    if (code) els.push(text(x, ty, 287.5, 33.9, code, { font: 'sans', size: 16.5, spacing: 2.52, color: C.faint }));
  });
  els.push(...footer(false, 'DESIGN · 03'));
  return { bg: C.paper, els, warnings: [] };
}

// ---------------------------------------------------------------------------
// 楼层章节页（定稿第 16 / 44 页）：满版效果图 + 压暗 + 左下楼层名 + 右下空间清单
// ---------------------------------------------------------------------------

export function roomsLines(rooms, maxW = 720, { font = 'serif', size = 22.5, spacing = 2.25, max = 4 } = {}) {
  const lines = [];
  let cur = '';
  for (const r of rooms) {
    const next = cur ? `${cur} · ${r}` : r;
    if (cur && measureText(next, font, size, spacing) > maxW) {
      lines.push(cur);
      cur = r;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, max);
}

const countShown = (lines) => lines.join(' · ').split(' · ').filter(Boolean).length;

/**
 * @param {object} floor
 * @param {string[]} rooms     这一层的空间（中文，按出现顺序）
 * @param {string|null} image
 * @param {object} ctx
 * @param {string[]} [roomsEn] 与 rooms 一一对应的英文（English / 中英版用）
 */
export function layoutFloor(floor, rooms, image, ctx, roomsEn = []) {
  const tr = trOf(ctx);
  const els = [];
  if (image) els.push(withNat(img(0, 0, SLIDE_W, SLIDE_H, image, { edit: { field: 'image' } }), ctx));
  els.push(rect(0, 0, SLIDE_W, SLIDE_H, C.overlay, 0.34));
  els.push(gradRect(0, 0, SLIDE_W, SLIDE_H, 270, [
    { pos: 0, color: C.overlay, alpha: 0.82 },
    { pos: 60, color: C.overlay, alpha: 0 },
  ]));
  const floorWarnings = [];
  if (tr.lang === 'en') {
    const fen = (floor?.en || '').trim();
    els.push(text(96, 813.3, 1100, 35.8, fen ? `${fen} · DESIGN` : 'DESIGN', TS.eyebrowDark, { edit: { field: 'floor.en' } }));
    els.push(text(96, 869, 1100, 119, floorTitleEn(fen) || floor?.zh || 'Design', { font: 'serif', size: 60, spacing: 3, color: C.light }, { edit: { field: 'floor.en' } }));
    const names = rooms.map((r, i) => roomsEn[i] || r);
    const lines = roomsLines(names);
    const shown = countShown(lines);
    if (shown < names.length) floorWarnings.push(`本层空间太多，楼层页只显示了 ${shown} / ${names.length} 个`);
    if (lines.length) {
      els.push({ ...text(824, 760, 1002.7, 228, lines.join('\n'), { font: 'serif', size: 22.5, spacing: 1.5, color: C.light }, { align: 'r', valign: 'b', lineSpacing: 139.57 }), nowrap: true });
    }
    return { bg: C.dark, els, warnings: [...(image ? [] : ['楼层章节页没有背景图']), ...floorWarnings] };
  }
  els.push(text(96, 813.3, 1100, 35.8, `${floor?.en || 'DESIGN'} · 设计图`, TS.eyebrowDark, { edit: { field: 'floor.en' } }));
  els.push(text(96, 869, 1100, 119, floor?.zh || '方案', { font: 'serif', size: 60, spacing: 14.4, color: C.light }, { edit: { field: 'floor.zh' } }));
  if (tr.lang === 'bi') {
    // 中文空间清单（最多 3 行）+ 英文清单（小一号，最多 3 行），右下角底边对齐
    const zhLines = roomsLines(rooms, 720, { max: 3 });
    const shown = countShown(zhLines);
    if (shown < rooms.length) floorWarnings.push(`本层空间太多，楼层页只显示了 ${shown} / ${rooms.length} 个`);
    const names = rooms.slice(0, shown).map((r, i) => roomsEn[i] || '').filter(Boolean);
    const enLines = names.length ? roomsLines(names, 900, { font: 'serif', size: 18, spacing: 1, max: 3 }) : [];
    const paras = [
      ...zhLines.map((l) => ({ align: 'r', lineSpacing: 139.57, runs: [{ font: 'serif', size: 22.5, spacing: 2.25, color: C.light, text: l }] })),
      ...enLines.map((l, k) => ({ align: 'r', lineSpacing: k === 0 ? 180 : 125, runs: [{ font: 'serif', size: 18, spacing: 1, color: C.lightMuted, text: l }] })),
    ];
    if (paras.length) {
      const h = zhLines.length * lineHeightPx(22.5, 139.57) + enLines.length * lineHeightPx(18, 125) + (enLines.length ? lineHeightPx(18, 55) : 0) + 12;
      els.push({ ...richText(824, 988 - h, 1002.7, h, paras, { valign: 'b' }), nowrap: true });
    }
    return { bg: C.dark, els, warnings: [...(image ? [] : ['楼层章节页没有背景图']), ...floorWarnings] };
  }
  const lines = roomsLines(rooms);
  const shown = countShown(lines);
  if (shown < rooms.length) floorWarnings.push(`本层空间太多，楼层页只显示了 ${shown} / ${rooms.length} 个`);
  if (lines.length) {
    els.push({ ...text(824, 760, 1002.7, 228, lines.join('\n'), { font: 'serif', size: 22.5, spacing: 2.25, color: C.light }, { align: 'r', valign: 'b', lineSpacing: 139.57 }), nowrap: true });
  }
  return { bg: C.dark, els, warnings: [...(image ? [] : ['楼层章节页没有背景图']), ...floorWarnings] };
}

// ---------------------------------------------------------------------------
// 效果图 · 满版（定稿第 20/21/25/27… 页）
// ---------------------------------------------------------------------------

export function layoutViewFull(view, floor, ctx) {
  const tr = trOf(ctx);
  const bi = tr.lang === 'bi';
  const els = [];
  const warnings = [];
  if (view.image) els.push(withNat(img(0, 0, SLIDE_W, SLIDE_H, view.image, { edit: { field: 'image' } }), ctx));
  else warnings.push('缺少效果图');
  els.push(gradRect(0, 0, SLIDE_W, SLIDE_H, 270, [
    { pos: 0, color: C.overlay, alpha: 0.92 },
    { pos: 30, color: C.overlay, alpha: 0.72 },
    { pos: 60, color: C.overlay, alpha: 0 },
  ]));

  // 右下：材料 / 备注列。先量左下标题区要多宽，剩下的宽度给右侧列；一行放不下就往上叠第二行（最多 2 行）
  const head = viewHead(view, floor, tr);
  const { eyebrow, title, sub } = head;
  const leftNeed = Math.min(
    1180,
    96 + Math.max(measureText(eyebrow, 'sans', 18, 7.56), measureText(title, 'serif', 42), sub ? measureText(sub, 'sans', 18, 3.6) : 0) + 72
  );
  const colsMinX = Math.max(leftNeed, 760);
  const avail = 1824 - colsMinX;
  const GAP = 64;
  const cols = [
    ...(view.notes || []).map((n, i) => ({ n, i })).filter(({ n }) => (n.text || n.label || '').trim())
      .map(({ n, i }) => {
        const lab = noteLabel(n, i, tr);
        const body = noteBody(n, tr);
        return { kind: 'note', i, label: lab.text, labelField: lab.field, text: body.main, second: body.second, zhLabel: (n.label || '备注').trim() };
      }),
    ...(view.materials || []).map((r, i) => {
      const mat = ctx.project ? (ctx.project.materials || []).find((m) => m.id === r.materialId) : null;
      const lab = roleLabel(r, i, tr);
      const val = materialValue(mat, tr);
      return { kind: 'mat', i, materialId: r.materialId, label: lab.text, labelField: lab.field, mat, shown: val.main, second: val.second };
    }),
  ].map((col) => {
    const labelW = measureText(col.label, 'sans', 18, 3.6);
    const valueW = col.kind === 'mat' ? materialValueWidth(col.shown) : measureText(col.text, 'serif', 22.5);
    const secondW = col.second ? measureText(col.second, 'serif', 18) : 0;
    const w = Math.min(avail, 520, Math.max(labelW, valueW, secondW) * 1.06 + 12);
    const valueLines = col.kind === 'mat' ? Math.min(2, countLines(`${col.shown?.name || ''} ${col.shown?.code || ''}`, 'serif', 22.5, 0, w)) : Math.min(3, countLines(col.text, 'serif', 22.5, 0, w));
    const secondLines = col.second ? Math.min(col.kind === 'mat' ? 2 : 3, countLines(col.second, 'serif', 18, 0, w)) : 0;
    const mainH = valueLines * 36 + 11;
    return { ...col, w, mainH, secondLines, valueH: mainH + (secondLines ? secondLines * EN2_LH + 4 : 0) };
  });
  // 按阅读顺序装行：第 1 行（最靠下）放前几项，放不下的进第 2 行
  const rowsOfCols = [[]];
  let used = 0;
  for (const col of cols) {
    const need = (rowsOfCols[rowsOfCols.length - 1].length ? GAP : 0) + col.w;
    if (used + need > avail && rowsOfCols[rowsOfCols.length - 1].length) {
      rowsOfCols.push([]);
      used = 0;
    }
    rowsOfCols[rowsOfCols.length - 1].push(col);
    used += (rowsOfCols[rowsOfCols.length - 1].length > 1 ? GAP : 0) + col.w;
  }
  const shown = rowsOfCols.slice(0, 2);
  const hidden = rowsOfCols.slice(2).reduce((n, r) => n + r.length, 0);
  if (hidden) warnings.push(`满版页右下放不下全部 ${cols.length} 项（隐藏了 ${hidden} 项）—— 建议切换成「框图」版式`);
  for (const col of cols) {
    if (col.kind === 'mat' && !col.mat) warnings.push(col.materialId ? `第 ${col.i + 1} 项材料已被删除` : `第 ${col.i + 1} 项还没选材料`);
    if (col.kind === 'note' && countLines(col.text, 'serif', 22.5, 0, col.w) > 3) {
      warnings.push(`备注「${col.zhLabel}」太长，满版页只放得下三行 —— 建议精简，或切换成「框图」版式`);
    }
  }
  let bottom = 1012;
  shown.forEach((row) => {
    const rowValueH = Math.max(...row.map((c) => c.valueH));
    let right = 1824;
    for (const col of [...row].reverse()) {
      const x = right - col.w;
      const valueY = bottom - col.valueH;
      const labelEl = text(x, valueY - 39.8, col.w + 24, 35.8, col.label, TS.labelDark, { edit: { field: col.labelField } });
      els.push(tr.lang === 'zh' ? labelEl : { ...labelEl, autofit: 'shrink', nowrap: true });
      if (col.kind === 'mat') {
        els.push(richText(x, valueY, col.w + 24, col.mainH, [{ runs: materialRuns(col.shown, true, tr.lang === 'en' ? 'Unnamed material' : '未命名材料') }], { edit: { field: `materials.${col.i}` } }));
      } else {
        els.push(text(x, valueY, col.w, col.mainH, col.text, TS.valueDark, { edit: { field: tr.lang === 'en' ? `notes.${col.i}.textEn` : `notes.${col.i}.text` } }));
      }
      if (bi && col.second) {
        const field = col.kind === 'mat' ? `materials.${col.i}.nameEn` : `notes.${col.i}.textEn`;
        els.push(text(x, valueY + col.mainH - 7, col.w + (col.kind === 'mat' ? 24 : 0), col.secondLines * EN2_LH + 8, col.second, EN2_DARK, { edit: { field } }));
      }
      right = x - GAP;
    }
    bottom -= rowValueH + 39.8 + 28;
  });

  // 左下：英文小标题 + 标题（+ 中英版的英文标题），底边对齐 1012，标题折行时往上长
  const titleW = colsMinX - 96 - 48;
  const tSize = countLines(title, 'serif', 42, 0, titleW) > 1 ? 34 : 42;
  const tLines = Math.min(3, countLines(title, 'serif', tSize, 0, titleW));
  const tH = tSize * 1.7 + (tLines - 1) * lineHeightPx(tSize, 83.61);
  const subH = sub ? 33.9 : 0;
  const tY = 1012 - tH - (sub ? subH + 10 : 0);
  els.push({ ...text(96, tY - 49.9, titleW, 33.9, eyebrow, TS.eyebrowDark, { edit: { field: tr.lang === 'zh' ? 'roomEn' : 'floor' } }), nowrap: true, autofit: 'shrink' });
  els.push(text(96, tY, titleW, tH, title, { font: 'serif', size: tSize, color: C.light }, { lineSpacing: 83.61, edit: { field: head.titleField } }));
  if (sub) els.push({ ...text(96, tY + tH + 10, titleW, subH, sub, SUBLINE_DARK, { edit: { field: head.subField } }), nowrap: true, autofit: 'shrink' });
  return { bg: C.dark, els, warnings };
}

// ---------------------------------------------------------------------------
// 效果图 · 框图（定稿第 17/22/26… 页）：左图右文
// ---------------------------------------------------------------------------

export function layoutViewFramed(view, floor, ctx) {
  const tr = trOf(ctx);
  const bi = tr.lang === 'bi';
  const els = [];
  const warnings = [];
  if (view.image) {
    els.push(withNat(img(96, 96, 1140, 864, view.image, { fit: 'contain', ax: 0, ay: 0.5, edit: { field: 'image' } }), ctx));
  } else {
    els.push(rect(96, 96, 1140, 864, C.placeholder));
    warnings.push('缺少效果图');
  }
  const X = 1300;
  const W = 576.4;
  const head = viewHead(view, floor, tr);
  els.push(text(X, 96, 540, 63.8, head.eyebrow, TS.eyebrow, { edit: { field: tr.lang === 'zh' ? 'roomEn' : 'floor' } }));
  els.push(rect(X, 179.8, 56, 1, C.rule));
  const title = head.title;
  // 标题超过两行时降到 34pt，避免第三行只剩一两个字
  const tSize = countLines(title, 'serif', 42, 0, W) > 2 ? 34 : 42;
  const tLines = Math.min(3, countLines(title, 'serif', tSize, 0, W));
  const tLineH = lineHeightPx(tSize, 90.58);
  els.push(text(X, 212.8, W, Math.max(76.8, tLines * tLineH + 16), title, { font: 'serif', size: tSize, color: C.ink }, { lineSpacing: 90.58, edit: { field: head.titleField } }));
  // 中英版：标题下面的英文标题（最多两行）
  let subH = 0;
  if (head.sub) {
    const subLines = Math.min(2, countLines(head.sub, 'sans', 18, 3.6, W));
    subH = subLines * lineHeightPx(18, 120) + 8;
    els.push({ ...text(X, 212.8 + tLines * tLineH + 14, W, subH, head.sub, SUBLINE, { lineSpacing: 120, edit: { field: head.subField } }), autofit: 'shrink', fitWrap: true });
    subH += 14;
  }

  // i = 在 view.notes / view.materials 里的原始序号（edit 字段与数据下标一致）
  const notes = (view.notes || []).map((n, i) => ({ n, i })).filter(({ n }) => (n.text || n.label || '').trim());
  const mats = view.materials || [];
  const rows = [
    ...notes.map(({ n, i }) => ({ kind: 'note', i, n, label: noteLabel(n, i, tr), body: noteBody(n, tr) })),
    ...mats.map((r, i) => {
      const mat = (ctx.project?.materials || []).find((m) => m.id === r.materialId) || null;
      return { kind: 'mat', i, r, mat, label: roleLabel(r, i, tr), value: materialValue(mat, tr) };
    }),
  ];
  const foot = tr.lang === 'en' ? (floor?.en || 'DESIGN · 03') : floorFooter(floor);
  if (!rows.length) {
    els.push(...footer(false, foot));
    return { bg: C.paper, els, warnings };
  }

  const top = 212.8 + tLines * tLineH + subH + 59.9;
  const lineH = 36;
  const secondLinesOf = (row, compact) => {
    const s = row.kind === 'note' ? row.body.second : row.value.second;
    if (!s) return 0;
    return Math.min(row.kind === 'note' ? 3 : 2, countLines(s, 'serif', 18, 0, row.kind === 'note' ? W : compact ? 436 : 412));
  };
  const measureRow = (row, compact) => {
    const extra = secondLinesOf(row, compact) ? secondLinesOf(row, compact) * EN2_LH + 4 : 0;
    if (row.kind === 'note') {
      const lines = Math.min(4, countLines(tr.lang === 'zh' ? row.n.text || '' : row.body.main || '', 'serif', 22.5, 0, W));
      return (compact ? 96 : 129.7) + (lines - 1) * lineH + extra;
    }
    const shown = row.value.main;
    const lines = Math.min(2, countLines(`${shown?.name || ''} ${shown?.code || ''}`, 'serif', 22.5, 0, compact ? 436 : 412));
    return (compact ? 100 : 136.9) + (lines - 1) * lineH + extra;
  };
  const limit = 965;
  let compact = rows.reduce((s, r) => s + measureRow(r, false), top) > limit;
  if (compact && rows.reduce((s, r) => s + measureRow(r, true), top) > limit) {
    warnings.push('右侧说明太多放不下 —— 建议拆成两页，或删掉部分备注');
  }

  let y = top;
  els.push(rect(X, y, 524, 1, C.line));
  for (const row of rows) {
    const h = measureRow(row, compact);
    const second = secondLinesOf(row, compact);
    const extra = second ? second * EN2_LH + 4 : 0;
    if (row.kind === 'note') {
      els.push(text(X, y + (compact ? 16 : 24.9), W, 35.8, row.label.text, TS.label, { edit: { field: row.label.field } }));
      const bodyY = y + (compact ? 52 : 62.7);
      const bodyH = h - (compact ? 60 : 82) - extra;
      // 华文版沿用原文（不 trim，与定稿一致）
      const bodyText = tr.lang === 'zh' ? row.n.text || '' : row.body.main || '';
      els.push(text(X, bodyY, W, bodyH, bodyText, TS.value, { edit: { field: tr.lang === 'en' ? `notes.${row.i}.textEn` : `notes.${row.i}.text` } }));
      if (second) {
        const zhLines = Math.min(4, countLines(bodyText, 'serif', 22.5, 0, W));
        els.push(text(X, bodyY + zhLines * lineH + 2, W, second * EN2_LH + 8, row.body.second, EN2, { edit: { field: `notes.${row.i}.textEn` } }));
      }
    } else {
      const sw = compact ? 64 : 88;
      const sy = y + (compact ? 18 : 24.9);
      const mat = row.mat;
      if (mat?.image) els.push(withNat(img(X, sy, sw, sw, mat.image, { edit: { field: `materials.${row.i}` } }), ctx));
      else els.push(rect(X, sy, sw, sw, C.placeholder));
      const tx = X + sw + 24;
      const tw = 1824 - tx;
      const lab = text(tx, sy + 3.6, tw, 35.8, row.label.text, TS.label, { edit: { field: row.label.field } });
      els.push(tr.lang === 'zh' ? lab : { ...lab, autofit: 'shrink', nowrap: true });
      const valueY = sy + (compact ? 34 : 41.4);
      const valueH = h - (compact ? 52 : 66) - extra;
      els.push(richText(tx, valueY, tw, valueH, [{ runs: materialRuns(row.value.main, false, tr.lang === 'en' ? 'Unnamed material' : '未命名材料') }], { edit: { field: `materials.${row.i}` } }));
      if (second) {
        // 英文名紧跟在中文名下面（中文名几行就往下几行）
        const zhLines = Math.min(2, countLines(`${row.value.main?.name || ''} ${row.value.main?.code || ''}`, 'serif', 22.5, 0, compact ? 436 : 412));
        els.push(text(tx, valueY + zhLines * lineH + 2, tw, second * EN2_LH + 8, row.value.second, EN2, { edit: { field: `materials.${row.i}.nameEn` } }));
      }
      if (!mat) warnings.push(row.r.materialId ? `第 ${row.i + 1} 项材料已被删除` : `第 ${row.i + 1} 项还没选材料`);
    }
    y += h;
    els.push(rect(X, y, 524, 1, C.line));
  }
  els.push(...footer(false, foot));
  return { bg: C.paper, els, warnings };
}

/** 满版 / 框图自动判断：有备注或材料多 → 框图；图不够宽（< 1.55）→ 框图；其余满版 */
export function autoLayout(view, nat) {
  const nMat = (view.materials || []).length;
  const nNotes = (view.notes || []).filter((n) => (n.text || '').trim()).length;
  if (nNotes >= 1 || nMat >= 4) return 'framed';
  const aspect = nat && nat.w && nat.h ? nat.w / nat.h : 1.5;
  return aspect >= 1.55 ? 'full' : 'framed';
}

/** 节奏调整：避免连续 3 页以上同一版式（只在「两种都合适」的页上调整） */
export function applyLayoutRhythm(views, metaFn) {
  const canFull = (v) => {
    const nat = v.image ? metaFn(v.image) : null;
    return autoLayout({ ...v, materials: (v.materials || []).slice(0, 3) }, nat) === 'full' && (v.materials || []).length <= 3;
  };
  const out = views.map((v) => ({ ...v, layout: v.layout && v.layout !== 'auto' ? v.layout : autoLayout(v, v.image ? metaFn(v.image) : null) }));
  for (let i = 2; i < out.length; i++) {
    const a = out[i - 2].layout;
    const b = out[i - 1].layout;
    const c = out[i].layout;
    if (a === b && b === c) {
      if (c === 'framed' && canFull(out[i])) out[i] = { ...out[i], layout: 'full' };
      else if (c === 'full') out[i] = { ...out[i], layout: 'framed' };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 方案封面（Material Board）—— 公司封面保持原版，这一页作为「方案」章节的封面
//   split-light：左文右图（浅底，接 Material Board 的米白背景）
//   split-dark ：左文右图（深底）
//   full       ：Material Board 满版 + 左下标题 + 右下 logo
// ---------------------------------------------------------------------------

export const COVER_LAYOUTS = [
  { id: 'split-light', label: '左文右图 · 浅色' },
  { id: 'split-dark', label: '左文右图 · 深色' },
  { id: 'full', label: '满版大图' },
];

/**
 * 方案封面的大标题 / 副标题（留空时自动）。tr 只在 English 版有用：自填的中文标题换成英文
 */
export function coverTexts(project, tr = null) {
  const info = project?.info || {};
  const en = tr?.lang === 'en';
  const custom = (info.coverTitle || '').trim();
  const auto = [info.client, info.location].map((s) => (s || '').trim()).filter(Boolean).join(' · ');
  let title = custom || auto || (en ? 'Design Proposal' : '方案 · 设计图');
  if (en && hasCJK(title)) title = tr.en(title, 'text') || title;
  let subtitle = (info.coverSubtitle || '').trim() || 'THE DREAM HOUSE JOURNEY';
  if (en && hasCJK(subtitle)) subtitle = tr.en(subtitle, 'text') || subtitle;
  return { title, subtitle };
}

export function layoutDesignCover(project, ctx) {
  const tr = trOf(ctx);
  const cover = project.cover || {};
  const layout = cover.layout || 'split-light';
  const { title, subtitle } = coverTexts(project, tr);
  // 标题统一用思源宋体（Ogg 是付费字体，多数电脑没有，回退成无衬线会很难看）；纯英文标题略小一号
  const titleFont = 'serif';
  const titleSize = hasCJK(title) ? 60 : 54;
  const meta = tr.lang === 'en' ? `Design Proposal  ·  ${floorsLineEn(project.floors)}` : `方案 · 设计图  ·  ${floorsLine(project.floors)}`;
  const els = [];

  if (layout === 'full') {
    els.push(withNat(img(0, 0, SLIDE_W, SLIDE_H, cover.image, { edit: { field: 'cover.image' } }), ctx));
    els.push(gradRect(0, 0, SLIDE_W, SLIDE_H, 270, [
      { pos: 0, color: C.overlay, alpha: 0.72 },
      { pos: 32, color: C.overlay, alpha: 0.3 },
      { pos: 58, color: C.overlay, alpha: 0 },
    ]));
    const tLines = Math.min(2, countLines(title, titleFont, titleSize, 0, 1300));
    const tH = tLines * lineHeightPx(titleSize, 92);
    const tY = 960 - 44 - 18 - tH;
    els.push(rect(96, tY - 34, 72, 3, C.boardGold));
    els.push(text(96, tY, 1300, tH + 10, title, { font: titleFont, size: titleSize, color: C.light }, { lineSpacing: 92, edit: { field: 'coverTitle' } }));
    els.push(text(96, tY + tH + 18, 1300, 40, subtitle.toUpperCase(), { font: 'sans', size: 20, spacing: 7.56, color: C.lightMuted }, { edit: { field: 'coverSubtitle' } }));
    els.push(img(1824 - 236, 1080 - 72 - 106.7, 236, 106.7, '/template/cover-2.png', { fit: 'stretch' }));
    return { bg: C.dark, els, warnings: [] };
  }

  const dark = layout === 'split-dark';
  const boardX = 1110;
  els.push(withNat(img(boardX, 0, SLIDE_W - boardX, SLIDE_H, cover.image, { edit: { field: 'cover.image' } }), ctx));
  const colW = boardX - 96 - 72;
  const tLines = Math.min(3, countLines(title, titleFont, titleSize, 0, colW));
  const tH = tLines * lineHeightPx(titleSize, 92);
  const blockH = 35.8 + 26 + 3 + 40 + tH + 24 + 40 + 56 + 47;
  let y = Math.max(140, (SLIDE_H - blockH) / 2 - 20);
  els.push(text(96, y, colW, 35.8, 'SECTION THREE · DESIGN', dark ? TS.eyebrowDark : TS.eyebrow));
  y += 35.8 + 26;
  els.push(rect(96, y, 72, 3, dark ? C.gold : C.boardGold));
  y += 3 + 40;
  els.push(text(96, y, colW, tH + 10, title, { font: titleFont, size: titleSize, color: dark ? C.light : C.ink }, { lineSpacing: 92, edit: { field: 'coverTitle' } }));
  y += tH + 24;
  els.push(text(96, y, colW, 40, subtitle.toUpperCase(), { font: 'sans', size: 20, spacing: 7.56, color: dark ? C.lightMuted : C.muted }, { edit: { field: 'coverSubtitle' } }));
  y += 40 + 56;
  els.push(text(96, y, colW, 47, meta, { font: 'serif', size: 22.5, spacing: 2.7, color: dark ? C.darkMuted : C.faint }));
  els.push(...footer(dark, 'SECTION 03', { ruleW: boardX - 96 - 64, rightEdge: boardX - 64 }));
  return { bg: dark ? C.dark : C.paper, els, warnings: [] };
}

// ---------------------------------------------------------------------------
// 本案服务团队（定稿第 55 页），按 info.team 动态分栏
// ---------------------------------------------------------------------------

export function layoutTeam(team, ctx) {
  const tr = trOf(ctx);
  const en = tr.lang === 'en';
  const bi = tr.lang === 'bi';
  const els = [];
  els.push(text(96, 96, 900, 33.9, 'PROJECT TEAM', TS.eyebrow));
  els.push(rect(96, 149.9, 56, 1, C.rule));
  els.push(text(96, 182.9, 900, 87.2, en ? 'Your Project Team' : '本案服务团队', { font: 'serif', size: 48, color: C.ink }, { lineSpacing: 90.38 }));
  els.push(text(96, 298.1, 900, 61, en ? 'One team beside you, from design to delivery.' : '从方案到交付，一个团队全程陪伴。', { font: 'serif', size: 22.5, color: C.muted }, { lineSpacing: 132.59 }));
  if (bi) els.push(text(96, 350, 900, 40, 'One team beside you, from design to delivery.', EN2));
  // idx = 在 info.team 里的原始序号（edit 字段与数据下标一致）
  const members = (team || []).map((m, idx) => ({ ...m, idx })).filter((m) => (m.name || '').trim() || (m.role || '').trim()).slice(0, 6);
  const warnings = [];
  if (!members.some((m) => (m.name || '').trim())) warnings.push('服务团队还没填名字（项目信息 → 服务团队）');
  const n = Math.max(1, members.length);
  const colW = 1728 / n;
  members.forEach((m, i) => {
    const x = 96 + i * colW;
    const pad = i ? 32.9 : 0;
    const w = colW - pad - 8;
    els.push(rect(x, 520, colW, 1, C.rule));
    if (i) els.push(rect(x, 520, 1, 267.8, C.line));
    els.push(text(x + pad, 560.9, w, 33.9, (m.en || '').toUpperCase(), { font: 'sans', size: 18, spacing: 5.4, color: C.eyebrow }, { edit: { field: `team.${m.idx}.en` } }));
    const name = (m.name || '').trim() || '—';
    const nameFont = hasCJK(name) ? 'serif' : 'display';
    // 名字一行放下：放不下就把字号缩小（最小 28pt），还放不下给提示
    const nameW = measureText(name, nameFont, 45);
    const nameSize = nameW > (w - 6) * 0.97 ? Math.max(28, Math.floor((45 * (w - 6) * 0.97) / nameW * 2) / 2) : 45;
    if (measureText(name, nameFont, nameSize) > (w - 6) * 0.97) warnings.push(`「${name}」太长，名字会折成两行 —— 可以只写名字或英文名`);
    els.push({ ...text(x + pad, 618.8, w, 70, name, { font: nameFont, size: nameSize, color: C.ink }, { lineSpacing: 72, valign: 'b', edit: { field: `team.${m.idx}.name` } }), nowrap: true });
    const role = (m.role || '').trim();
    if (en) {
      els.push(text(x + pad, 704.8, w, 47, role ? tr.en(role, 'team') || role : '', { font: 'serif', size: 22.5, color: C.ink }, { edit: { field: `team.${m.idx}.roleEn` } }));
    } else {
      els.push(text(x + pad, 704.8, w, 47, m.role || '', { font: 'serif', size: 22.5, color: C.ink }, { edit: { field: `team.${m.idx}.role` } }));
      const roleEn = bi && role ? tr.en(role, 'team') : '';
      if (roleEn && !enAlreadyIn(role, roleEn)) els.push({ ...text(x + pad, 748, w, 34, roleEn, EN2, { edit: { field: `team.${m.idx}.roleEn` } }), autofit: 'shrink', nowrap: true });
    }
  });
  els.push(...footer(false, 'SERVICE · 04'));
  return { bg: C.paper, els, warnings };
}
