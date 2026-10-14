// 读图的纯函数（IMPORT）：一页图纸 → 每一层的平面图 → 米 → 不重叠的房间 → 对齐楼层 → 楼梯 → v2 plan。
// 不碰 DOM、不连网络，Node 可测（test/ai.test.mjs）。参考实现：floors/proto/sheet.mjs（已用录好的回答端到端验过）。
//
// 坐标：图片用像素（x 向右、y 向下）；plan 用米（x 向右、y 向下）。Gemini 的框：[ymin, xmin, ymax, xmax]，0–1000 归一化。
// 比例从来不悄悄用 12 m：读图上的尺寸 → 设计师填的一个已知尺寸 → 按门宽估 → 按形状猜；用了哪一种写在 report.scale.source。

import { ROOM_TYPES, migratePlan, defaultStairShape, defaultStairUp, checkPlan, stairFlights, buildWalls } from './model.js';

export const PAD = 0.03; // 裁图 = 第一遍的框四边各多 3 %（尺寸线在图边上）
export const DOOR_M = 0.85; // 马来西亚平面图的门：750–900（房门）/ 900–1000（大门）
export const LOWRES_PXM = 60; // 每米少于 60 像素：图上的字和尺寸读不清
export const LEVELS = ['ground', 'mezzanine', 'first', 'second', 'third', 'roof', 'other'];
/** 楼层 → 楼层 id（模板也用 gf / ff） */
export const LEVEL_IDS = { ground: 'gf', mezzanine: 'mz', first: 'ff', second: 'sf', third: 'tf' };

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN;
};
const OUT = new Set(['porch', 'balcony']);

// ───────────── 文字 → 数字 ─────────────

/** '3600' '3,600' '3600mm' '3.6m' '3.60' "12'-6\"" "12' 6\"" "20'" '20 ft' '6"' → 毫米（不像长度 → null） */
export function parseDimText(text) {
  if (text == null) return null;
  const s = String(text)
    .trim()
    .toLowerCase()
    .replace(/[’′‘`]/g, "'")
    .replace(/[”″“]/g, '"')
    .replace(/''/g, '"')
    .replace(/\s+/g, ' ');
  if (!s) return null;
  let mm = null;
  const ft =
    /^(\d+(?:\.\d+)?)\s*'\s*(?:-?\s*(\d+(?:\.\d+)?)\s*(?:"|in)?)?$/.exec(s) ||
    /^(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)\.?\s*(?:-?\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|")?\.?)?$/.exec(s) ||
    /^(\d+(?:\.\d+)?)\s*(?:尺|呎)(?:\s*(\d+(?:\.\d+)?)\s*寸)?$/.exec(s);
  const inch = /^(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)$/.exec(s);
  if (ft) mm = Number(ft[1]) * 304.8 + (ft[2] ? Number(ft[2]) * 25.4 : 0);
  else if (inch) mm = Number(inch[1]) * 25.4;
  else {
    const m = /^(\d{1,3}(?:[,\s]\d{3})+|\d+(?:\.\d+)?)\s*(mm|m|cm|米|毫米|公尺)?$/.exec(s);
    if (!m) return null;
    const v = Number(m[1].replace(/[,\s]/g, ''));
    let unit = /^(米|公尺)$/.test(m[2] || '') ? 'm' : /^毫米$/.test(m[2] || '') ? 'mm' : m[2];
    if (!unit) unit = /\./.test(m[1]) && v < 40 ? 'm' : 'mm';
    mm = unit === 'm' ? v * 1000 : unit === 'cm' ? v * 10 : v;
  }
  mm = Math.round(mm);
  return mm >= 300 && mm <= 60000 ? mm : null;
}

// 「FIRST SCHEDULE」（买卖合约的附表一）、「JADUAL PERTAMA」不是楼层：先去掉。FIRST / SECOND 后面要跟 FLOOR / STOREY / PLAN 才算楼层。
const NOT_LEVEL = /\b(FIRST|SECOND|THIRD|FOURTH|FIFTH|1ST|2ND|3RD|4TH)\s+(SCHEDULE|SCHED\.?|EDITION|ISSUE|REVISION|SUBMISSION|AMENDMENT)\b|\bJADUAL\s+(PERTAMA|KEDUA|KETIGA|KEEMPAT)\b|\bSCHEDULE\s+[A-Z0-9]+\b/g;
const FL = String.raw`\s*(?:FLOOR|FLR|FL\b|STOREY|STORY|LEVEL|PLAN)`;
// 缩写（G.F. / F.F.）只在图名结尾或后面跟 PLAN 时算（F.F.L. = 完成面标高，不是楼层）
const AB = String.raw`(?=\s+(?:PLAN|LAYOUT)\b|\s*$)`;
// 中文的楼层叫法（正则字面量，不是界面文字）
const ZH_LV = { ground: /一楼|首层|底层|地面层|楼下/, first: /二楼|楼上/, second: /三楼/, third: /四楼/ };
const RE_GROUND = new RegExp(String.raw`\b(?:GROUND|LOWER)${FL}|\bG\.?\s?F\.?${AB}|\b(?:TINGKAT BAWAH|LANTAI BAWAH|ARAS BAWAH|ARAS TANAH)\b|` + ZH_LV.ground.source);
const RE_FIRST = new RegExp(String.raw`\b(?:FIRST|1ST|UPPER)${FL}|\bF\.?\s?F\.?${AB}|\b(?:TINGKAT (?:SATU|1)|LANTAI (?:ATAS|SATU|1)|ARAS (?:SATU|1))\b|` + ZH_LV.first.source);
const RE_SECOND = new RegExp(String.raw`\b(?:SECOND|2ND)${FL}|\bS\.?\s?F\.?${AB}|\b(?:TINGKAT (?:DUA|2)|LANTAI (?:DUA|2)|ARAS (?:DUA|2))\b|` + ZH_LV.second.source);
const RE_THIRD = new RegExp(String.raw`\b(?:THIRD|3RD)${FL}|\b(?:TINGKAT (?:TIGA|3)|LANTAI (?:TIGA|3)|ARAS (?:TIGA|3))\b|` + ZH_LV.third.source);

/** 图名（英文 / 马来文 / 中文）→ 楼层；图名比模型给的 level 可信 */
export function levelOf(level, title = '') {
  const t = String(title || '').toUpperCase().replace(NOT_LEVEL, ' ');
  if (/ROOF|BUMBUNG|屋顶|天台/.test(t)) return 'roof';
  if (/MEZZ|夹层/.test(t)) return 'mezzanine';
  if (RE_GROUND.test(t)) return 'ground';
  if (RE_FIRST.test(t)) return 'first';
  if (RE_SECOND.test(t)) return 'second';
  if (RE_THIRD.test(t)) return 'third';
  // 图名里的 FIRST SCHEDULE 让模型以为是二楼：图名只有附表、没有楼层字 → 模型的 first 也不算
  if (level === 'first' && new RegExp(NOT_LEVEL.source).test(String(title || '').toUpperCase())) return 'other';
  return LEVELS.includes(level) ? level : 'other';
}

/** PDF 一页的文字 → 「像不像平面图」的分数（≥ 5 = 像）。DESIGN §2.2 */
export function pageTextScore(text) {
  const s = String(text || '').toUpperCase().replace(/\s+/g, ' ');
  if (!s.trim()) return 0;
  const count = (re) => (s.match(re) || []).length;
  let score = 5 * Math.min(2, count(/FLOOR\s+PLAN/g)) + 5 * Math.min(2, count(/PELAN\s+(LANTAI|TINGKAT|ARAS)/g));
  for (const w of ['GROUND', 'FIRST', 'SECOND', 'TINGKAT']) if (new RegExp(`\\b${w}\\b`).test(s)) score += 1;
  if (/\b(ELECTRICAL|PLUMBING|PAIP|ELEVATIONS?|SECTIONS?|KERATAN|PANDANGAN|ROOF|BUMBUNG|LOKASI|TAPAK|SITE)\b/.test(s)) score -= 2;
  return score;
}

// ───────────── 框 ─────────────

export const boxPx = (b, W, H) => ({ x0: (b[1] / 1000) * W, y0: (b[0] / 1000) * H, x1: (b[3] / 1000) * W, y1: (b[2] / 1000) * H });
export const okBox = (b) => Array.isArray(b) && b.length === 4 && b.every((v) => Number.isFinite(Number(v))) && Number(b[2]) > Number(b[0]) && Number(b[3]) > Number(b[1]);
export function iouBox(a, b) {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const i = ix * iy;
  const u = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - i;
  return u > 0 ? i / u : 0;
}
const iouRect = (p, q) => {
  const ix = Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x));
  const iy = Math.max(0, Math.min(p.y + p.d, q.y + q.d) - Math.max(p.y, q.y));
  const i = ix * iy;
  const u = p.w * p.d + q.w * q.d - i;
  return u > 0 ? i / u : 0;
};

/** 找到的平面图 → 裁图范围：四边各多 pad（尺寸线在边上），不超出纸 */
export function cropBox(b, page, pad = PAD) {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  return { x0: Math.max(page.x0, b.x0 - w * pad), y0: Math.max(page.y0, b.y0 - h * pad), x1: Math.min(page.x1, b.x1 + w * pad), y1: Math.min(page.y1, b.y1 + h * pad) };
}

/**
 * 第一遍的回答 → 按楼层排好的平面图（像素 = 第一遍收到的那张图）。
 * 去掉无效的框；level 以图名为准；同一张图回了两次 → 留大的；按楼层排（不按左右）；屋顶 / 其他默认不要。
 */
export function normalizeFound(resp, W, H) {
  const page = okBox(resp?.page_box_2d) ? boxPx(resp.page_box_2d, W, H) : { x0: 0, y0: 0, x1: W, y1: H };
  let plans = (Array.isArray(resp?.plans) ? resp.plans : [])
    .filter((p) => p && okBox(p.box_2d))
    .map((p) => {
      const box = boxPx(p.box_2d.map(Number), W, H);
      return {
        title: String(p.title || '').slice(0, 60),
        level: levelOf(p.level, p.title),
        box,
        unit: p.unit_label ? String(p.unit_label).slice(0, 40) : null,
        units: p.units || 'unknown',
        scaleText: p.scale_text || null,
      };
    })
    .filter((p) => p.box.x1 - p.box.x0 > 8 && p.box.y1 - p.box.y0 > 8);
  const area = (p) => (p.box.x1 - p.box.x0) * (p.box.y1 - p.box.y0);
  plans = plans.filter((p, i) => !plans.some((q, j) => j !== i && iouBox(p.box, q.box) > 0.6 && (area(q) > area(p) || (area(q) === area(p) && j < i))));
  // 一页上只有「其他」的平面图（公寓单位、TYPE B 户型图）：那就是这一户的一层 → 一楼，要读
  const real = (p) => p.level !== 'roof' && p.level !== 'other';
  if (!plans.some(real)) plans = plans.map((p) => (p.level === 'other' ? { ...p, level: 'ground', single: true } : p));
  plans.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.box.x0 - b.box.x0);
  const units = [...new Set(plans.map((p) => p.unit).filter(Boolean))];
  const others = (Array.isArray(resp?.other_drawings) ? resp.other_drawings : []).filter((o) => o && okBox(o.box_2d)).map((o) => ({ kind: o.kind || 'other', box: boxPx(o.box_2d.map(Number), W, H) }));
  return {
    page,
    screenshot: !!resp?.is_photo_or_screenshot,
    units,
    others,
    plans: plans.map((p, i) => ({ ...p, key: `p${i}`, crop: cropBox(p.box, page), include: p.level !== 'roof' && p.level !== 'other' })),
  };
}

/** 给第二遍的提示：是什么房子（排屋 / 半独立 / 房子） */
export function houseKind(found) {
  const plans = (found?.plans || []).filter((p) => p.include !== false);
  // 公寓的户型图（TYPE B）：图名没有楼层
  if (plans.length && plans.every((p) => p.single)) return 'residential unit (apartment or single-storey house)';
  const n = new Set(plans.map((p) => p.level)).size;
  const storey = n >= 3 ? 'three-storey ' : n === 2 ? 'double-storey ' : '';
  const units = (found?.units || []).join(' ').toUpperCase();
  const ratios = plans.map((p) => (p.box.y1 - p.box.y0) / Math.max(1, p.box.x1 - p.box.x0)).map((r) => Math.max(r, 1 / r));
  const ratio = ratios.length ? median(ratios) : 1;
  if (/INTERMEDIATE|END LOT|CORNER LOT|TERES|TERRACE|LOT TENGAH|LOT HUJUNG/.test(units) || ratio >= 2.2) return `${storey}terraced house`;
  if (/SEMI|BERKEMBAR/.test(units) || ratio >= 1.4) return `${storey}semi-detached house`;
  if (/BUNGALOW|BANGLO/.test(units)) return `${storey}bungalow`;
  return `${storey}house`;
}

// ───────────── 比例 ─────────────

/**
 * 尺寸字 → 每个裁图像素几米。每一条读得清的尺寸 = 一个估计（数值 ÷ 两个箭头之间的像素）；
 * 离中位数 > 6 % 的不要（1800 读成 180 这种）；至少两条一致，或一条横跨裁图一半以上的总尺寸。
 */
export function scaleFromDims(dims, cropW, cropH, { tol = 0.06, aniso = false } = {}) {
  const est = [];
  for (const d of dims || []) {
    const mm = parseDimText(d?.text);
    if (!mm || !okBox(d.box_2d)) continue;
    const b = boxPx(d.box_2d.map(Number), cropW, cropH);
    const axis = d.axis === 'y' || d.axis === 'x' ? d.axis : b.y1 - b.y0 > b.x1 - b.x0 ? 'y' : 'x';
    const ext = axis === 'y' ? b.y1 - b.y0 : b.x1 - b.x0;
    const span = axis === 'y' ? ext / cropH : ext / cropW;
    if (ext < 8) continue;
    est.push({ k: mm / 1000 / ext, w: ext, span, axis, text: String(d.text) });
  }
  if (!est.length) return null;
  const pool = (list) => {
    if (!list.length) return null;
    const m = median(list.map((e) => e.k));
    const used = list.filter((e) => Math.abs(e.k / m - 1) <= tol);
    if (used.length < 2 && !(used.length === 1 && used[0].span >= 0.5)) return null;
    const sw = used.reduce((t, e) => t + e.w, 0);
    const k = used.reduce((t, e) => t + e.k * e.w, 0) / sw;
    // rms = 加权的均方根偏差（「误差约」用它；spread = 最差的那一条）
    const rms = Math.sqrt(used.reduce((t, e) => t + e.w * (e.k / k - 1) ** 2, 0) / sw);
    return { k, used, spread: Math.max(...used.map((e) => Math.abs(e.k / k - 1))), rms };
  };
  // 拍斜的照片（已经拉正）：上下方向还是被压扁了一点（手机斜着拍）→ 横、竖各自算比例，aspect = 竖 / 横
  if (aniso) {
    const px = pool(est.filter((e) => e.axis === 'x'));
    const py = pool(est.filter((e) => e.axis === 'y'));
    if (px && py) {
      const aspect = py.k / px.k;
      if (aspect > 0.8 && aspect < 1.25) {
        const used = [...px.used, ...py.used];
        return { mPerPx: px.k, aspect: Math.abs(aspect - 1) >= 0.015 ? aspect : 1, n: used.length, spread: Math.max(px.spread, py.spread), rms: Math.max(px.rms, py.rms), rejected: est.filter((e) => !used.includes(e)).map((e) => e.text), source: 'dims' };
      }
    }
  }
  const p = pool(est);
  if (!p) return null;
  return { mPerPx: p.k, aspect: 1, n: p.used.length, spread: p.spread, rms: p.rms, rejected: est.filter((e) => !p.used.includes(e)).map((e) => e.text), source: 'dims' };
}

/** 外框的长宽比 → 常见的房子宽度：排屋 20 尺 = 6.1 m · 半独立 9.6 m · 其他 11 m */
export const guessWidth = (ratio) => (ratio >= 1.8 ? 6.1 : ratio >= 1.15 ? 9.6 : 11);

/** 读不到尺寸：按门宽（≈ 0.85 m）估；没有门 → 按形状猜。一定会标出来，绝不悄悄用 12 m。 */
export function estimateScale(read, cropW, cropH) {
  const lens = (read?.doors || [])
    .filter((d) => d && d.kind !== 'sliding' && d.kind !== 'opening' && okBox(d.box_2d))
    .map((d) => {
      const b = boxPx(d.box_2d.map(Number), cropW, cropH);
      return Math.max(b.x1 - b.x0, b.y1 - b.y0);
    })
    .filter((v) => v > 2);
  let fp = okBox(read?.footprint_box_2d) ? boxPx(read.footprint_box_2d.map(Number), cropW, cropH) : null;
  if (!fp) {
    const rs = (read?.rooms || []).filter((r) => r && okBox(r.box_2d) && !OUT.has(r.type)).map((r) => boxPx(r.box_2d.map(Number), cropW, cropH));
    if (rs.length) fp = { x0: Math.min(...rs.map((b) => b.x0)), y0: Math.min(...rs.map((b) => b.y0)), x1: Math.max(...rs.map((b) => b.x1)), y1: Math.max(...rs.map((b) => b.y1)) };
  }
  const fw = fp ? fp.x1 - fp.x0 : null;
  const fd = fp ? fp.y1 - fp.y0 : null;
  if (lens.length >= 3) {
    const k = DOOR_M / median(lens);
    if (!fw || (fw * k > 3.5 && fw * k < 30)) return { mPerPx: k, n: lens.length, source: 'doors', widthM: fw ? r2(fw * k) : null };
  }
  if (!fw || !fd) return null;
  const ratio = Math.max(fw, fd) / Math.min(fw, fd);
  const widthM = guessWidth(ratio);
  return { mPerPx: widthM / Math.min(fw, fd), n: 0, source: 'guess', widthM };
}

/** 同一页的几层用同一个像素比例裁的：每层的答案合起来算一个比例 */
export function sheetScale(perFloor) {
  const ok = (perFloor || []).filter(Boolean);
  const dims = ok.filter((s) => s.source === 'dims');
  if (dims.length) {
    const n = dims.reduce((t, s) => t + s.n, 0);
    const aspect = dims.reduce((t, s) => t + (s.aspect || 1) * s.n, 0) / n;
    return { mPerPx: dims.reduce((t, s) => t + s.mPerPx * s.n, 0) / n, aspect: Math.abs(aspect - 1) >= 0.015 ? aspect : 1, n, spread: Math.max(...dims.map((s) => s.spread || 0)), rms: Math.sqrt(dims.reduce((t, s) => t + (s.rms || 0) ** 2 * s.n, 0) / n), rejected: dims.flatMap((s) => s.rejected || []), source: 'dims' };
  }
  const doors = ok.filter((s) => s.source === 'doors');
  if (doors.length) return { mPerPx: median(doors.map((s) => s.mPerPx)), n: doors.reduce((t, s) => t + s.n, 0), source: 'doors' };
  return ok[0] ? { ...ok[0] } : null;
}

/**
 * 截图 / 照片清不清楚：每层平面图在原图上有几像素宽、每米几像素。
 * plans: [{ srcPxW, mPerSrcPx? }]（mPerSrcPx = 读完以后每个原图像素几米）。< 60 px/m 或是截图 → 显示提示。
 */
export function lowResReport(plans, { screenshot = false } = {}) {
  const ws = (plans || []).map((p) => p?.srcPxW).filter((v) => v > 0);
  const planPx = ws.length ? Math.round(Math.min(...ws)) : 0;
  const ks = (plans || []).map((p) => p?.mPerSrcPx).filter((v) => v > 0);
  // 还没读：平面图的框连尺寸线大约 = 房子宽 + 2 m，排屋 ≈ 8 m
  const pxPerM = ks.length ? Math.round(1 / Math.max(...ks)) : planPx ? Math.round(planPx / 8) : 0;
  return { lowRes: !!screenshot || (pxPerM > 0 && pxPerM < LOWRES_PXM), screenshot: !!screenshot, pxPerM, planPx };
}

// ───────────── 房间类型 / 名字 ─────────────

const LABEL_TYPES = [
  [/porch|anjung|car\s*park|garage|driveway|front\s*yard|petak\s*kereta|车廊|车库|前院/i, 'porch'],
  [/air\s*well|open\s*to\s*below|\bvoid\b|ruang\s*terbuka|挑空|天井/i, 'void'],
  [/stair|tangga|楼梯/i, 'stair'],
  [/yard|service|laundry|drying|dobi|utility|ampaian|后院|晒衣|工作阳台|洗衣/i, 'utility'],
  [/balcon|terrace|balkoni|阳台|露台/i, 'balcony'],
  [/w\.?\s?i\.?\s?r\.?\b|walk[-\s]?in|wardrobe|衣帽/i, 'walkin'],
  [/\b(bath|toilet|w\.?\s?c|powder|shower|tandas|bilik\s*air|m\.?\s?bath)\b|bathroom|卫生间|浴室|厕所|洗手间/i, 'bath'],
  [/kitchen|dapur|厨房/i, 'kitchen'],
  [/dining|makan|餐厅|饭厅/i, 'dining'],
  [/family|keluarga|起居|家庭厅/i, 'family'],
  [/living|ruang\s*tamu|\bhall\b|客厅|大厅/i, 'living'],
  [/master|bedroom\s*1\b|bilik\s*(tidur\s*)?utama|主卧/i, 'master'],
  [/kid|child|anak|儿童/i, 'kids'],
  [/study|office|prayer|surau|solat|library|书房|祈祷/i, 'study'],
  [/store|stor\b|storage|储物|杂物/i, 'store'],
  [/foyer|entrance|lobby|serambi|玄关|门厅/i, 'foyer'],
  [/corridor|passage|landing|lobi|koridor|走廊|过道/i, 'corridor'],
  [/bed|bilik|room|卧|房/i, 'bedroom'],
];

/**
 * 模型给的类型 + 图上的字 → ROOM_TYPES。车廊、后院这些常见叫法图上的字优先；
 * 模型给的是笼统的类型（卧室 / 客厅 / 储物 / 走廊）而字说得更清楚（UTAMA / MASTER → 主卧、KELUARGA / FAMILY → 起居厅、
 * ALMARI PAKAIAN / W.I.R. → 衣帽间）→ 用字的；都对不上 → 卧室（旧行为）/ 没有字 → 走廊
 */
export function roomTypeOf(type, label = '') {
  const l = String(label || '');
  if (/porch|anjung|car\s*park|garage|driveway|front\s*yard|车廊|前院/i.test(l)) return 'porch';
  if (/\ba[./]?\s?c\.?\s*(ledge|area|platform)|air[-\s]?con|compressor|planter|冷气|空调/i.test(l)) return 'balcony';
  if (/yard|service|laundry|drying|dobi|晒衣|工作阳台/i.test(l)) return 'utility';
  if (/stair|tangga|楼梯/i.test(l)) return 'stair';
  if (!ROOM_TYPES[type] || ['bedroom', 'living', 'store', 'corridor'].includes(type)) {
    const bathy = /\b(bath|toilet|w\.?\s?c|tandas|shower)\b|bilik\s*air|bathroom|浴室|厕所/i.test(l);
    if (/keluarga|family|起居|家庭厅/i.test(l)) return 'family';
    if (/almari\s*pakaian|w\.?\s?i\.?\s?r\.?\b|walk[-\s]?in|衣帽/i.test(l)) return 'walkin';
    if (!bathy && /bilik\s*(tidur\s*)?utama|\bmaster\b|主卧/i.test(l)) return 'master';
  }
  if (ROOM_TYPES[type]) return type;
  for (const [re, t] of LABEL_TYPES) if (re.test(l)) return t;
  return l.trim() ? 'bedroom' : 'corridor';
}

// 只是重复类型的字（LIVING、MASTER BEDROOM、RUANG TAMU…）不留名字：界面显示本地化的类型名
const GENERIC = new RegExp(
  '^(' +
    [
      // 英文
      'living( room| hall| area)?', 'hall', 'dining( room| area| hall)?', 'kitchen', 'master( bed ?room)?', 'bed ?room', 'bath ?(room)?', 'toilet', 'w\\.?\\s?c\\.?',
      'yard', 'balcony', 'car ?porch', 'porch', 'corridor', 'passage', 'foyer', 'entrance', 'store( ?room)?', 'stor', 'study', 'family( hall| area| room)?',
      'stair(s|case)?', 'void', 'w\\.?\\s?i\\.?\\s?r\\.?', 'walk[- ]?in( wardrobe| closet)?', 'utility', 'laundry', 'landing',
      // 马来文
      'ruang tamu', 'ruang makan', 'dapur', 'bilik air', 'bilik( tidur)?( utama)?', 'tangga', 'anjung( kereta)?', 'koridor', 'balkoni', 'serambi', 'stor',
      'ruang keluarga', 'ruang dobi', 'ampaian', 'almari pakaian', 'laman', 'lobi',
    ].join('|') +
    ')$',
  'i',
);

// 有意思的名字 → 界面上能翻译的中文名（英文版靠词典：湿厨房 → Wet kitchen、卧室 4 → Bedroom 4）
const NAMED = [
  [/^(wet kitchen|dapur basah)$/i, '湿厨房'],
  [/^(dry kitchen|dapur kering)$/i, '干厨房'],
  [/^(m\.? ?bath(room)?|master (bath(room)?|toilet)|en-?suite|bilik air utama)$/i, '主卧浴室'],
  [/^(common (bath(room)?|toilet)|c\.? ?bath)$/i, '公共浴室'],
  [/^(guest ?(bed)?room|bilik tamu)$/i, '客房'],
  [/^a[./]?\s?c\.?\s*(ledge|area|platform)$/i, '空调台'],
];

/**
 * 图上的字 → 房间名：重复类型的不留（英文 / 马来文）；常见的有名字的房间 → 能翻译的中文名；
 * 「BEDROOM 4」「BILIK TIDUR 4」→「卧室 4」、「BATH 2」「BILIK AIR 2」→「浴室 2」；其他全大写的英文改成 Title Case。
 */
export function cleanLabel(label) {
  let s = String(label || '').replace(/\s+/g, ' ').trim();
  if (!s || GENERIC.test(s)) return '';
  for (const [re, zh] of NAMED) if (re.test(s)) return zh;
  const num = /^(bed ?room|bedrm|bilik( tidur)?|room|br)\.? ?(\d)$/i.exec(s);
  if (num) return '卧室 ' + num[3]; // 英文版：词典里有「卧室 1」…「卧室 9」
  const bn = /^(bath ?(room)?|toilet|bilik air|tandas|w\.?c\.?)\.? ?(\d)$/i.exec(s);
  if (bn) return '浴室 ' + bn[3];
  if (/^[^a-z]*$/.test(s) && /[A-Z]/.test(s)) s = s.toLowerCase().replace(/(^|[\s(./-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  return s.slice(0, 24);
}

// ───────────── 读图结果 → 米 ─────────────

const KIND = { door: 'door', sliding: 'slider', opening: 'open', slider: 'slider', open: 'open', window: 'window' };
const defaultUid = (p) => `${p}${Math.random().toString(36).slice(2, 7)}`;

/** 一层的第二遍回答 → 米（原点 = 裁图左上角）：rooms / openings / stairs / footprint */
export function readToMetres(read, cropW, cropH, mPerPx, uid = defaultUid) {
  const M = (b) => {
    const p = boxPx(b.map(Number), cropW, cropH);
    return { x: p.x0 * mPerPx, y: p.y0 * mPerPx, w: (p.x1 - p.x0) * mPerPx, d: (p.y1 - p.y0) * mPerPx };
  };
  const rooms = (read?.rooms || [])
    .filter((r) => r && okBox(r.box_2d))
    .map((r) => {
      const type = roomTypeOf(r.type, r.label);
      return { id: uid('r'), type, name: type === 'stair' || type === 'void' ? '' : cleanLabel(r.label), label: String(r.label || '').slice(0, 40), ...M(r.box_2d) };
    });
  const openings = [];
  const add = (b, kind, extra = {}) => {
    const m = M(b);
    if (m.w >= m.d) openings.push({ id: uid('o'), kind, x1: m.x, x2: m.x + m.w, y1: m.y + m.d / 2, y2: m.y + m.d / 2, ...extra });
    else openings.push({ id: uid('o'), kind, x1: m.x + m.w / 2, x2: m.x + m.w / 2, y1: m.y, y2: m.y + m.d, ...extra });
  };
  for (const d of read?.doors || []) if (d && okBox(d.box_2d)) add(d.box_2d, KIND[d.kind] || 'door');
  for (const w of read?.windows || []) if (w && okBox(w.box_2d)) add(w.box_2d, w.full_height ? 'slider' : 'window');
  const stairs = (read?.stairs || []).filter((s) => s && okBox(s.box_2d)).map((s) => ({ ...M(s.box_2d), up: ['N', 'E', 'S', 'W'].includes(s.up) ? s.up : null, shape: ['straight', 'L', 'U'].includes(s.shape) ? s.shape : null }));
  const footprint = okBox(read?.footprint_box_2d) ? M(read.footprint_box_2d) : null;
  // 楼梯在 stairs 里、房间表里没有 → 补一个楼梯间
  for (const s of stairs) if (!rooms.some((r) => r.type === 'stair' && iouRect(r, s) > 0.3)) rooms.push({ id: uid('r'), type: 'stair', name: '', label: '', x: s.x, y: s.y, w: s.w, d: s.d });
  return { rooms, openings, stairs, footprint };
}

// ───────────── 重叠和空隙 ─────────────

function cluster(vals, tol, pins = []) {
  const s = [...vals, ...pins].sort((a, b) => a - b);
  const groups = [];
  for (const v of s) {
    const g = groups[groups.length - 1];
    if (g && v - g[g.length - 1] <= tol) g.push(v);
    else groups.push([v]);
  }
  const pinSet = new Set(pins.map((v) => +v.toFixed(6)));
  const value = groups.map((g) => {
    const p = g.find((v) => pinSet.has(+v.toFixed(6)));
    return p != null ? p : Math.round((g.reduce((a, b) => a + b, 0) / g.length) * 20) / 20;
  });
  return (v) => {
    const i = groups.findIndex((q) => v >= q[0] - 1e-9 && v <= q[q.length - 1] + 1e-9);
    return i >= 0 ? value[i] : v;
  };
}

/**
 * AI 画的房间（会重叠、有缝）→ 铺满一层、不重叠的矩形。
 * 坐标压缩：边先吸附（≤ snap），每条边切一刀成网格，每一格只给一个房间（盖住它的最小的框：浴室框画在卧室框里 → 浴室从卧室挖出来；
 * pin 的房间（楼梯）盖住的格子一定归它）。房子外框里的空格：≥ fillMin m²、两边都 ≥ 0.8 m、三面有房间 → 补成「走廊」（gap: true），
 * 否则并给共边最长的邻居。每个房间的格子再合回矩形（L 形 = 两个同类型的矩形，id、id-2）。太窄的条（< minSliver）并给邻居。
 * 这一步以后房间不再移动（不要再跑 snapPlan：它会重新吸附边，又弄出重叠）。
 */
export function tileRooms(input, { snap = 0.2, footprint = null, voids = [], minSliver = 0.35, fillMin = 1.2 } = {}) {
  const pinned = input.filter((r) => r.pin);
  const pinsX = pinned.flatMap((r) => [r.x, r.x + r.w]);
  const pinsY = pinned.flatMap((r) => [r.y, r.y + r.d]);
  const sx = cluster(input.filter((r) => !r.pin).flatMap((r) => [r.x, r.x + r.w]).concat(footprint ? [footprint.x, footprint.x + footprint.w] : []), snap, pinsX);
  const sy = cluster(input.filter((r) => !r.pin).flatMap((r) => [r.y, r.y + r.d]).concat(footprint ? [footprint.y, footprint.y + footprint.d] : []), snap, pinsY);
  const rooms = input
    .map((r) => {
      const x0 = sx(r.x);
      const y0 = sy(r.y);
      return { ...r, x: x0, y: y0, w: sx(r.x + r.w) - x0, d: sy(r.y + r.d) - y0 };
    })
    .filter((r) => r.w > 0.05 && r.d > 0.05);
  const report = { overlaps: 0, filled: 0, absorbed: 0, split: 0, dropped: [] };
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.05 && Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y) > 0.05) report.overlaps++;
    }
  const fp = footprint ? { x: sx(footprint.x), y: sy(footprint.y), x1: sx(footprint.x + footprint.w), y1: sy(footprint.y + footprint.d) } : null;
  const xs = [...new Set(rooms.flatMap((r) => [r.x, r.x + r.w]).concat(fp ? [fp.x, fp.x1] : []).map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
  const ys = [...new Set(rooms.flatMap((r) => [r.y, r.y + r.d]).concat(fp ? [fp.y, fp.y1] : []).map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
  const nx = Math.max(0, xs.length - 1);
  const ny = Math.max(0, ys.length - 1);
  const own = new Int32Array(nx * ny).fill(-1);
  const at = (i, j) => j * nx + i;
  const inside = (r, x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.d;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      if (voids.some((v) => inside(v, cx, cy))) {
        own[at(i, j)] = -2;
        continue;
      }
      let best = -1;
      for (let k = 0; k < rooms.length; k++) {
        if (!inside(rooms[k], cx, cy)) continue;
        if (best < 0) best = k;
        else if (rooms[k].pin && !rooms[best].pin) best = k;
        else if (!!rooms[k].pin === !!rooms[best].pin && rooms[k].w * rooms[k].d < rooms[best].w * rooms[best].d) best = k;
      }
      own[at(i, j)] = best;
    }
  const cw = (i) => xs[i + 1] - xs[i];
  const ch = (j) => ys[j + 1] - ys[j];
  const inFp = (i, j) => !fp || ((xs[i] + xs[i + 1]) / 2 > fp.x && (xs[i] + xs[i + 1]) / 2 < fp.x1 && (ys[j] + ys[j + 1]) / 2 > fp.y && (ys[j] + ys[j + 1]) / 2 < fp.y1);
  // 和一组格子共边最长的邻居房间（开放空间稍微优先）；楼梯间不收别人的格子
  const neighbour = (cells, exclude = -1) => {
    const set = new Set(cells.map(([i, j]) => at(i, j)));
    const len = new Map();
    for (const [i, j] of cells)
      for (const [di, dj, l] of [
        [1, 0, ch(j)],
        [-1, 0, ch(j)],
        [0, 1, cw(i)],
        [0, -1, cw(i)],
      ]) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= ny || set.has(at(a, b))) continue;
        const o = own[at(a, b)];
        if (o >= 0 && o !== exclude && !rooms[o].pin) len.set(o, (len.get(o) || 0) + l + (/^(corridor|living|family|dining|foyer)$/.test(rooms[o].type) ? 1e-3 : 0));
      }
    let best = -1;
    for (const [o, l] of len) if (best < 0 || l > len.get(best)) best = o;
    return best;
  };
  const seen = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (own[at(i, j)] !== -1 || seen[at(i, j)]) continue;
      const comp = [];
      const stack = [[i, j]];
      seen[at(i, j)] = 1;
      while (stack.length) {
        const [a, b] = stack.pop();
        comp.push([a, b]);
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const p = a + di;
          const q = b + dj;
          if (p < 0 || q < 0 || p >= nx || q >= ny || seen[at(p, q)] || own[at(p, q)] !== -1) continue;
          seen[at(p, q)] = 1;
          stack.push([p, q]);
        }
      }
      if (!comp.every(([a, b]) => inFp(a, b))) continue; // 房子外面（车廊缺口、L 形外框）
      const i0 = Math.min(...comp.map((c) => c[0]));
      const i1 = Math.max(...comp.map((c) => c[0]));
      const j0 = Math.min(...comp.map((c) => c[1]));
      const j1 = Math.max(...comp.map((c) => c[1]));
      const W = xs[i1 + 1] - xs[i0];
      const D = ys[j1 + 1] - ys[j0];
      const area = comp.reduce((t, [a, b]) => t + cw(a) * ch(b), 0);
      const touches = (cells) => cells.some(([a, b]) => a >= 0 && b >= 0 && a < nx && b < ny && own[at(a, b)] >= 0);
      const sideRooms = [
        touches(comp.map(([a, b]) => [a - 1, b])),
        touches(comp.map(([a, b]) => [a + 1, b])),
        touches(comp.map(([a, b]) => [a, b - 1])),
        touches(comp.map(([a, b]) => [a, b + 1])),
      ];
      const sideEdge = [i0 === 0, i1 === nx - 1, j0 === 0, j1 === ny - 1];
      const sides = sideRooms.filter(Boolean).length;
      const edges = sideEdge.filter((e, q) => e && !sideRooms[q]).length;
      // 房子外框的缺口（L 形房子、车廊旁边）：贴着外边、只有 ≤ 2 面有房间 → 留空，不是走廊
      if (area >= fillMin && Math.min(W, D) >= 0.8 && sides <= 2 && edges >= 1) continue;
      if (area >= fillMin && Math.min(W, D) >= 0.8 && sides + edges >= 3 && sides >= 2) {
        rooms.push({ id: `gap${report.filled}`, type: 'corridor', name: '', x: xs[i0], y: ys[j0], w: W, d: D, gap: true });
        for (const [a, b] of comp) own[at(a, b)] = rooms.length - 1;
        report.filled++;
      } else {
        const nb = neighbour(comp);
        if (nb >= 0) {
          for (const [a, b] of comp) own[at(a, b)] = nb;
          report.absorbed++;
        }
      }
    }
  const rectsOf = (k) => {
    const runs = [];
    for (let j = 0; j < ny; j++) {
      let i = 0;
      while (i < nx) {
        if (own[at(i, j)] !== k) {
          i++;
          continue;
        }
        let e = i;
        while (e + 1 < nx && own[at(e + 1, j)] === k) e++;
        runs.push({ i0: i, i1: e, j0: j, j1: j });
        i = e + 1;
      }
    }
    const out = [];
    for (const r of runs) {
      const prev = out.find((q) => q.i0 === r.i0 && q.i1 === r.i1 && q.j1 === r.j0 - 1);
      if (prev) prev.j1 = r.j1;
      else out.push({ ...r });
    }
    return out;
  };
  const areaOf = (q) => (xs[q.i1 + 1] - xs[q.i0]) * (ys[q.j1 + 1] - ys[q.j0]);
  const moves = new Uint8Array(nx * ny); // 同一格搬了两次还是细条：不再搬（免得两个房间来回推）
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let k = 0; k < rooms.length; k++) {
      if (rooms[k].pin) continue;
      const rs = rectsOf(k);
      const biggest = rs.reduce((m, q) => (!m || areaOf(q) > areaOf(m) ? q : m), null);
      for (const q of rs) {
        const W = xs[q.i1 + 1] - xs[q.i0];
        const D = ys[q.j1 + 1] - ys[q.j0];
        // 太窄的条；或者房间被切开以后的小块（< 0.8 m，比如框歪了一点留下的边角）
        if (Math.min(W, D) >= minSliver && (q === biggest || Math.min(W, D) >= 0.8)) continue;
        if (moves[at(q.i0, q.j0)] >= 2) continue;
        // 细条：沿着长边一段一段分给两侧的房间（每段给对面连续最长的那个房间），房间就还是方的
        const thinY = D < W;
        const len = thinY ? q.i1 - q.i0 + 1 : q.j1 - q.j0 + 1;
        const side = (s, n) => {
          const [i, j] = thinY ? [q.i0 + n, s < 0 ? q.j0 - 1 : q.j1 + 1] : [s < 0 ? q.i0 - 1 : q.i1 + 1, q.j0 + n];
          if (i < 0 || j < 0 || i >= nx || j >= ny) return -1;
          const o = own[at(i, j)];
          return o >= 0 && o !== k && !rooms[o].pin ? o : -1;
        };
        const runOf = (s, n) => {
          const o = side(s, n);
          if (o < 0) return 0;
          let e = n;
          while (e + 1 < len && side(s, e + 1) === o) e++;
          return e - n + 1;
        };
        let any = false;
        let n = 0;
        while (n < len) {
          const ra = runOf(-1, n);
          const rb = runOf(1, n);
          const s = ra >= rb ? -1 : 1;
          const run = Math.max(ra, rb);
          if (!run) {
            n++;
            continue;
          }
          const o = side(s, n);
          for (let m = n; m < n + run; m++)
            if (thinY) for (let j = q.j0; j <= q.j1; j++) (own[at(q.i0 + m, j)] = o), moves[at(q.i0 + m, j)]++;
            else for (let i = q.i0; i <= q.i1; i++) (own[at(i, q.j0 + m)] = o), moves[at(i, q.j0 + m)]++;
          any = true;
          n += run;
        }
        if (!any) {
          const cells = [];
          for (let j = q.j0; j <= q.j1; j++) for (let i = q.i0; i <= q.i1; i++) cells.push([i, j]);
          const nb = neighbour(cells, k);
          if (nb < 0) continue;
          for (const [a, b] of cells) (own[at(a, b)] = nb), moves[at(a, b)]++;
        }
        changed = true;
        report.absorbed++;
      }
    }
    if (!changed) break;
  }
  const out = [];
  for (let k = 0; k < rooms.length; k++) {
    const rs = rectsOf(k);
    if (!rs.length) {
      report.dropped.push(rooms[k].name || rooms[k].label || rooms[k].type);
      continue;
    }
    if (rs.length > 1) report.split++;
    rs.sort((p, q) => (xs[q.i1 + 1] - xs[q.i0]) * (ys[q.j1 + 1] - ys[q.j0]) - (xs[p.i1 + 1] - xs[p.i0]) * (ys[p.j1 + 1] - ys[p.j0]));
    rs.forEach((q, n) => {
      const { pin, ...room } = rooms[k];
      out.push({ ...room, id: n ? `${rooms[k].id}-${n + 1}` : rooms[k].id, x: r3(xs[q.i0]), y: r3(ys[q.j0]), w: r3(xs[q.i1 + 1] - xs[q.i0]), d: r3(ys[q.j1 + 1] - ys[q.j0]) });
    });
  }
  return { rooms: out, report };
}

/**
 * 门窗放到铺好的房间上，房间一个都不动：每个门窗去最近的墙线（房间的边）、在 reach 以内、裁到墙的长度；找不到就丢掉。
 */
export function snapOpenings(rooms, openings, reach = 0.35) {
  const lines = { h: [], v: [] };
  for (const r of rooms) {
    lines.h.push({ c: r.y, a: r.x, b: r.x + r.w }, { c: r.y + r.d, a: r.x, b: r.x + r.w });
    lines.v.push({ c: r.x, a: r.y, b: r.y + r.d }, { c: r.x + r.w, a: r.y, b: r.y + r.d });
  }
  const out = [];
  let dropped = 0;
  const lost = [];
  for (const o of openings) {
    const horiz = Math.abs(o.x2 - o.x1) >= Math.abs(o.y2 - o.y1);
    const a = horiz ? Math.min(o.x1, o.x2) : Math.min(o.y1, o.y2);
    const b = horiz ? Math.max(o.x1, o.x2) : Math.max(o.y1, o.y2);
    const c = horiz ? (o.y1 + o.y2) / 2 : (o.x1 + o.x2) / 2;
    let best = null;
    for (const l of horiz ? lines.h : lines.v) {
      const ov = Math.min(b, l.b) - Math.max(a, l.a);
      const d = Math.abs(l.c - c);
      if (ov > Math.min(0.3, (b - a) / 2) && d <= reach && (!best || d < best.d - 1e-6 || (Math.abs(d - best.d) < 1e-6 && ov > best.ov))) best = { ...l, d, ov };
    }
    if (!best) {
      dropped++;
      lost.push(o);
      continue;
    }
    const same = (horiz ? lines.h : lines.v).filter((l) => Math.abs(l.c - best.c) < 1e-6);
    const lo = Math.min(...same.map((l) => l.a));
    const hi = Math.max(...same.map((l) => l.b));
    const p = Math.max(lo, a);
    const q = Math.min(hi, b);
    if (q - p < 0.3) {
      dropped++;
      continue;
    }
    // 两扇门叠在同一段墙上（模型回了两次）→ 留一扇
    const dup = out.find((x) => (horiz ? x.y1 === best.c && x.y2 === best.c : x.x1 === best.c && x.x2 === best.c) && Math.min(q, horiz ? x.x2 : x.y2) - Math.max(p, horiz ? x.x1 : x.y1) > 0.5 * (q - p));
    if (dup) {
      dropped++;
      continue;
    }
    out.push(horiz ? { ...o, x1: r2(p), x2: r2(q), y1: best.c, y2: best.c } : { ...o, x1: best.c, x2: best.c, y1: r2(p), y2: r2(q) });
  }
  return { openings: out, dropped, lost };
}

// ───────────── 低清的图（walls.js 没把握时）：按图上的墨迹查一查门和开放空间（DESIGN §2.12 B.5） ─────────────

const OPEN_LIKE = new Set(['living', 'dining', 'kitchen', 'family', 'foyer', 'corridor']);

/**
 * 沿着一条墙线（米）看图上有没有墙：每一个位置数垂直方向 ±band 里的墨点；≥ 2（两条细线 / 实心墙）= 有墙。
 * 墙线可能和图上的墙差一点（AI 的框）：先在 ±search 里找墨迹最多的那条平行线。
 * → { c（图上的墙在哪，米）, frac（[a, b] 里有墙的比例）, at(a, b) → 那一段有墙的比例 }
 */
export function wallInk(ink, mPerPx, seg, { dx = 0, dy = 0, band = 0.11, search = 0.3 } = {}) {
  const { mask, width: W, height: H } = ink;
  const k = 1 / mPerPx; // 每米几像素
  const horiz = seg.axis === 'x';
  const toPx = (v, isX) => (v - (isX ? dx : dy)) * k;
  const a = toPx(seg.a, horiz);
  const b = toPx(seg.b, horiz);
  const c0 = toPx(seg.c, !horiz);
  const hb = Math.max(2, Math.round(band * k));
  const at = (u, v) => {
    const x = Math.round(horiz ? u : v);
    const y = Math.round(horiz ? v : u);
    return x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
  };
  const lo = Math.max(0, Math.floor(Math.min(a, b)));
  const hi = Math.min(horiz ? W - 1 : H - 1, Math.ceil(Math.max(a, b)));
  if (hi - lo < 3) return { c: seg.c, frac: 0, at: () => 0 };
  // 一个位置上「有墙」：垂直方向 ±band 里 ≥ 2 个墨点，而且是两条线（空心墙）或一整块（实心墙）
  const presentAt = (u, c) => {
    let n = 0;
    let runs = 0;
    let prev = false;
    for (let d = -hb; d <= hb; d++) {
      const on = at(u, c + d);
      if (on) n++;
      if (on && !prev) runs++;
      prev = on;
    }
    return n >= 2 && (runs >= 2 || n >= Math.max(3, hb * 0.5));
  };
  // 找墙：±search 里「有墙」的位置最多的那条平行线（空心墙要两条线都在带里，所以不是找墨最多的一条线）
  const sr = Math.round(search * k);
  const step = Math.max(1, Math.round(0.01 * k));
  let best = c0;
  let bestV = -1;
  for (let o = -sr; o <= sr; o += step) {
    let v = 0;
    for (let u = lo; u <= hi; u += 3) if (presentAt(u, c0 + o)) v++;
    if (v > bestV || (v === bestV && Math.abs(o) < Math.abs(best - c0))) {
      bestV = v;
      best = c0 + o;
    }
  }
  const present = new Uint8Array(hi - lo + 1);
  for (let u = lo; u <= hi; u++) present[u - lo] = presentAt(u, best) ? 1 : 0;
  const fracOf = (p, q) => {
    const s = Math.max(lo, Math.round(toPx(Math.min(p, q), horiz)));
    const e = Math.min(hi, Math.round(toPx(Math.max(p, q), horiz)));
    if (e - s < 2) return 0;
    let n = 0;
    for (let u = s; u <= e; u++) n += present[u - lo];
    return n / (e - s + 1);
  };
  // 墨的浓度（每个位置在带里有几个墨点）：实心墙浓、推拉门 / 窗的细线淡
  const dens = new Uint16Array(hi - lo + 1);
  for (let u = lo; u <= hi; u++) {
    let n = 0;
    for (let d = -hb; d <= hb; d++) if (at(u, best + d)) n++;
    dens[u - lo] = n;
  }
  const densOf = (p, q) => {
    const s0 = Math.max(lo, Math.round(toPx(Math.min(p, q), horiz)));
    const e0 = Math.min(hi, Math.round(toPx(Math.max(p, q), horiz)));
    if (e0 - s0 < 2) return 0;
    let n = 0;
    for (let u = s0; u <= e0; u++) n += dens[u - lo];
    return n / (e0 - s0 + 1);
  };
  return { c: r3(best / k + (horiz ? dy : dx)), frac: fracOf(seg.a, seg.b), at: fracOf, dens: densOf };
}

/**
 * 门的画法：铰链那头一条垂直于墙的门扇（开着，长 = 门宽）+ 一段四分之一圆弧（虚线也算）从门扇的头画到门洞另一头。
 * 两样都要在（同一个铰链、同一个半径）才算真的门 —— 只看弧线会被家具（床、洗碗盆）骗。
 * 门的框不准（± 0.15 m）、门宽不准（± 20 %）、双开门（半径 = 一半）→ 小范围搜一下。→ { arc, leaf, ok }（最好的那个候选）
 */
export function doorSwing(ink, mPerPx, seg, { dx = 0, dy = 0, minLeaf = 0.8, peaks: maxPeaks = 1 } = {}) {
  const { mask, width: W, height: H } = ink;
  const k = 1 / mPerPx;
  const horiz = seg.axis === 'x';
  const rr = Math.max(1, Math.round(0.02 * k));
  const near = (x, y) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    for (let v = -rr; v <= rr; v++)
      for (let u = -rr; u <= rr; u++) {
        const X = xi + u;
        const Y = yi + v;
        if (X >= 0 && Y >= 0 && X < W && Y < H && mask[Y * W + X]) return true;
      }
    return false;
  };
  const px = (along, across) => (horiz ? [(along - dx) * k, (across - dy) * k] : [(across - dx) * k, (along - dy) * k]);
  const frac = (pts) => {
    let n = 0;
    let hit = 0;
    for (const [al, ac] of pts) {
      const [x, y] = px(al, ac);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      n++;
      if (near(x, y)) hit++;
    }
    return n >= pts.length * 0.7 ? hit / n : 0;
  };
  const len = seg.b - seg.a;
  let best = { arc: 0, leaf: 0, ok: false, s: 0 };
  const N = 24;
  const fine = Math.max(0.005, 0.5 / k); // 半个像素
  for (const hingeAtA of [true, false])
    for (const side of [-1, 1]) {
      // 1. 门扇：铰链附近（± 0.15 m，逐像素）找一条从墙边垂直伸出去的实线（≥ 0.5 m 长）
      const dir = hingeAtA ? 1 : -1; // 从铰链指向另一头
      const h0 = hingeAtA ? seg.a : seg.b;
      const cands = [];
      for (let off = -0.15; off <= 0.15 + 1e-9; off += fine) {
        const h = h0 + off;
        const pts = [];
        for (let i = 0; i < 14; i++) pts.push([h, seg.c + side * (0.16 + (0.36 * i) / 13)]);
        cands.push({ leaf: frac(pts), h });
      }
      // 默认只试最强的那条线；peaks > 1（救回房间中间的门时）：铰链旁边常常还有一条垂直的墙线（门洞的边、外墙）→ 最强的几条（相隔 ≥ 4 cm）都试弧线
      cands.sort((p, q) => q.leaf - p.leaf); // 一样强：先试最左 / 最上那条（稳定排序，和以前一样）
      const peaks = [];
      for (const q of cands) if (q.leaf >= minLeaf && peaks.length < maxPeaks && peaks.every((p) => Math.abs(p.h - q.h) >= 0.04)) peaks.push(q);
      if (!peaks.length) {
        if (cands[0] && cands[0].leaf > best.leaf && best.arc === 0) best = { ...best, leaf: cands[0].leaf };
        continue;
      }
      // 2. 弧：从这个铰链，半径 = 门宽（± 20 %；双开门 = 一半），角度 0 = 沿着墙，90° = 门扇；两头 12 % 不看
      for (const { h } of peaks) {
        for (const rf of [0.5, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2]) {
          const R = len * rf;
          if (R < 0.35) continue;
          const arcPts = [];
          for (let i = 0; i < N; i++) {
            const t = ((0.12 + (0.76 * i) / (N - 1)) * Math.PI) / 2;
            arcPts.push([h + dir * R * Math.cos(t), seg.c + side * R * Math.sin(t)]);
          }
          // 弧要整段都有（三段各 ≥ 30 %），不是几个地方碰巧有线
          const thirds = [0, 1, 2].map((q) => frac(arcPts.slice((q * N) / 3, ((q + 1) * N) / 3)));
          const arc = Math.min(frac(arcPts), ...thirds.map((v) => Math.min(1, v / 0.6)));
          if (arc < 0.3) continue;
          // 门扇要一直伸到弧那里（0.16 m → 0.9 R 都是实线）
          const lp = [];
          for (let i = 0; i < 16; i++) lp.push([h, seg.c + side * (0.16 + ((0.9 * R - 0.16) * i) / 15)]);
          const leaf = frac(lp);
          const sc = Math.min(arc, leaf);
          if (sc > best.s) best = { arc, leaf, ok: arc >= 0.45 && leaf >= 0.8, s: sc, r: R, side, hingeAtA };
        }
      }
    }
  return best;
}

/**
 * tileRooms 之后（低清 / walls.js 没把握）用图上的墨迹再查一次：
 *  (a) 门 / 开口 / 推拉门：那一段墙上图里是实心的墙（没有缺口）→ 是 AI 多加的门，去掉；
 *  (b) 客厅 / 餐厅 / 厨房 / 起居厅 / 玄关 / 走廊 相邻、共边上图里没有墙 → 加一个「打通」，不砌墙；
 *  (c) 门窗落在不会有墙的地方（两边都是开放空间）→ 去掉。
 * rooms / openings：米（这一层的坐标，图 = 裁图像素 × mPerPx + (dx, dy)）。→ { openings, report: { doorsDropped, openConnections, offWall } }
 */
export function inkCheck(rooms, openings, ink, mPerPx, { dx = 0, dy = 0, srcPxPerM = Infinity } = {}) {
  const report = { doorsDropped: 0, openConnections: 0, offWall: 0 };
  const hasInk = !!ink?.mask && mPerPx > 0;
  // 门要看得清墙线、门扇、弧线：原图每米 ≥ 45 像素（100 mm 的墙 ≥ 4.5 像素）才敢说「这里没有门」。手机截图（≈ 25 px/m）不删门
  const sharp = hasInk && srcPxPerM >= 45;
  const open = (r) => !!ROOM_TYPES[r?.type]?.open;
  // 每条房间边 → 两边是谁
  const edges = [];
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const p = rooms[i];
      const q = rooms[j];
      const ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
      const oy = Math.min(p.y + p.d, q.y + q.d) - Math.max(p.y, q.y);
      if (Math.abs(p.y + p.d - q.y) < 0.02 || Math.abs(q.y + q.d - p.y) < 0.02) {
        if (ox > 0.3) edges.push({ axis: 'x', c: Math.abs(p.y + p.d - q.y) < 0.02 ? q.y : p.y, a: Math.max(p.x, q.x), b: Math.min(p.x + p.w, q.x + q.w), p, q });
      } else if (Math.abs(p.x + p.w - q.x) < 0.02 || Math.abs(q.x + q.w - p.x) < 0.02) {
        if (oy > 0.3) edges.push({ axis: 'y', c: Math.abs(p.x + p.w - q.x) < 0.02 ? q.x : p.x, a: Math.max(p.y, q.y), b: Math.min(p.y + p.d, q.y + q.d), p, q });
      }
    }
  const onEdge = (o, e) => {
    const horiz = Math.abs(o.y1 - o.y2) < 1e-6;
    if (horiz !== (e.axis === 'x')) return false;
    const c = horiz ? o.y1 : o.x1;
    const [a, b] = horiz ? [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)] : [Math.min(o.y1, o.y2), Math.max(o.y1, o.y2)];
    return Math.abs(c - e.c) < 0.02 && Math.min(b, e.b) - Math.max(a, e.a) > 0.5 * (b - a);
  };
  const out = [];
  for (const o0 of openings) {
    let o = o0;
    const e = edges.find((q) => onEdge(o, q));
    // (c) 两边都是开放空间：那里不会有墙，门窗没有地方装
    if (e && open(e.p) && open(e.q)) {
      report.offWall++;
      continue;
    }
    // 窗、推拉门（细线画在墙里）不查；「打通」和门要查
    if (!sharp || o.kind === 'window' || o.kind === 'slider') {
      out.push(o);
      continue;
    }
    // (a) 门洞那一段：有开启弧线 = 真的门；没有弧线、墙在那里又是连着的（跟两边的墙一样）= AI 多加的
    const horiz = Math.abs(o.y1 - o.y2) < 1e-6;
    const [a, b] = horiz ? [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)] : [Math.min(o.y1, o.y2), Math.max(o.y1, o.y2)];
    const c = horiz ? o.y1 : o.x1;
    const pad = 0.6;
    const w = wallInk(ink, mPerPx, { axis: horiz ? 'x' : 'y', c, a: a - pad, b: b + pad }, { dx, dy });
    const swing = o.kind === 'door' ? doorSwing(ink, mPerPx, { axis: horiz ? 'x' : 'y', c: w.c, a, b }, { dx, dy }) : { ok: false };
    if (swing.ok) o = { ...o, arc: true };
    const m = (b - a) * 0.2;
    const inGap = w.at(a + m, b - m);
    const around = Math.max(w.at(a - pad, a - 0.05), w.at(b + 0.05, b + pad));
    if (!swing.ok && around >= 0.5 && inGap >= 0.75) {
      report.doorsDropped++;
      continue;
    }
    out.push(o);
  }
  // (b) 开放空间之间没有墙 → 打通（墙只在一边是开放空间、另一边不是的时候才会砌：厨房 / 晒衣处…）
  for (const e of hasInk ? edges : []) {
    const pOpen = OPEN_LIKE.has(e.p.type);
    const qOpen = OPEN_LIKE.has(e.q.type);
    if (!pOpen || !qOpen || (open(e.p) && open(e.q))) continue;
    const w = wallInk(ink, mPerPx, e, { dx, dy });
    if (w.frac > 0.25) continue;
    // 已经有门窗在这条边上：留着
    if (out.some((o) => onEdge(o, e))) continue;
    const horiz = e.axis === 'x';
    out.push(horiz ? { id: `open-${e.p.id}-${e.q.id}`, kind: 'open', x1: r2(e.a), x2: r2(e.b), y1: e.c, y2: e.c } : { id: `open-${e.p.id}-${e.q.id}`, kind: 'open', x1: e.c, x2: e.c, y1: r2(e.a), y2: r2(e.b) });
    report.openConnections++;
  }
  return { openings: out, report };
}

// ───────────── 对齐楼层 ─────────────

function env(rooms) {
  let rs = rooms.filter((r) => !OUT.has(r.type));
  if (!rs.length) rs = rooms;
  if (!rs.length) return { x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0 };
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.d));
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
export const enclosedBox = env;

/**
 * 上一层摆在下一层的哪里？候选：楼梯对楼梯；外框左 / 右 / 中 × 上 / 下 / 中对齐。
 * 分数 = 上层墙落在下层墙上的米数（±0.15）− 4 × 悬空的围合面积（车廊算有支撑）+ 楼梯对上 2 分；再按几乎重合的墙线的中位残差微调。
 */
export function alignFloors(lower, upper) {
  if (!lower?.rooms?.length || !upper?.rooms?.length) return { dx: 0, dy: 0, by: null, score: 0 };
  const L = env(lower.rooms);
  const U = env(upper.rooms);
  const cands = [];
  const sl = lower.rooms.filter((r) => r.type === 'stair');
  const su = upper.rooms.filter((r) => r.type === 'stair');
  for (const a of sl) for (const b of su) if (Math.abs(a.w * a.d - b.w * b.d) / (a.w * a.d) < 0.5) cands.push({ dx: a.x + a.w / 2 - (b.x + b.w / 2), dy: a.y + a.d / 2 - (b.y + b.d / 2), by: 'stairs' });
  for (const ax of ['x0', 'x1', 'cx']) for (const ay of ['y0', 'y1', 'cy']) cands.push({ dx: L[ax] - U[ax], dy: L[ay] - U[ay], by: 'walls' });
  const edgesOf = (rooms, dx = 0, dy = 0) =>
    rooms.flatMap((r) => [
      { axis: 'x', c: r.y + dy, a: r.x + dx, b: r.x + r.w + dx },
      { axis: 'x', c: r.y + r.d + dy, a: r.x + dx, b: r.x + r.w + dx },
      { axis: 'y', c: r.x + dx, a: r.y + dy, b: r.y + r.d + dy },
      { axis: 'y', c: r.x + r.w + dx, a: r.y + dy, b: r.y + r.d + dy },
    ]);
  const lowerEdges = edgesOf(lower.rooms);
  const covered = (x, y) => lower.rooms.some((r) => x > r.x - 0.05 && x < r.x + r.w + 0.05 && y > r.y - 0.05 && y < r.y + r.d + 0.05);
  const score = (c) => {
    let s = 0;
    for (const e of edgesOf(upper.rooms, c.dx, c.dy)) for (const f of lowerEdges) if (e.axis === f.axis && Math.abs(e.c - f.c) < 0.15) s += Math.max(0, Math.min(e.b, f.b) - Math.max(e.a, f.a));
    let over = 0;
    for (const r of upper.rooms.filter((q) => !OUT.has(q.type)))
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (!covered(r.x + c.dx + ((i + 0.5) * r.w) / 6, r.y + c.dy + ((j + 0.5) * r.d) / 6)) over += (r.w * r.d) / 36;
    return s - 4 * over + (c.by === 'stairs' ? 2 : 0);
  };
  let best = null;
  for (const c of cands) {
    c.score = score(c);
    if (!best || c.score > best.score) best = c;
  }
  const res = { x: [], y: [] };
  for (const e of edgesOf(upper.rooms, best.dx, best.dy))
    for (const f of lowerEdges) if (e.axis === f.axis && Math.abs(e.c - f.c) < 0.15 && Math.min(e.b, f.b) - Math.max(e.a, f.a) > 0.5) res[e.axis === 'y' ? 'x' : 'y'].push(f.c - e.c);
  const dx = best.dx + (res.x.length ? median(res.x) : 0);
  const dy = best.dy + (res.y.length ? median(res.y) : 0);
  return { dx: r3(dx), dy: r3(dy), by: best.by, score: r2(best.score) };
}

// ───────────── 楼梯 ─────────────

const WALKABLE = new Set(['corridor', 'living', 'family', 'dining', 'foyer', 'stair', 'utility', 'kitchen', 'porch', 'balcony', 'study']);
const roomAt = (rooms, x, y, skip) => rooms.find((r) => r !== skip && x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.d) || null;
const DIRV = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };

/** 直跑楼梯往哪边上：出口（上层，up 那一头外面）和入口（下层，另一头外面）都是能走的地方的那个方向 */
function guessUp(rect, lowerRooms, upperRooms) {
  const vertical = rect.d >= rect.w;
  const cands = vertical ? ['N', 'S'] : ['E', 'W'];
  const end = (dir, off) => {
    const [vx, vy] = DIRV[dir];
    return { x: rect.x + rect.w / 2 + vx * (rect.w / 2 + off), y: rect.y + rect.d / 2 + vy * (rect.d / 2 + off) };
  };
  const walk = (rooms, p) => {
    const r = roomAt(rooms, p.x, p.y);
    return r ? (WALKABLE.has(r.type) ? 2 : 0) : -1;
  };
  const scored = cands.map((dir) => {
    const ex = end(dir, 0.3);
    const en = end(OPP[dir], 0.3);
    return { dir, s: walk(upperRooms, ex) + walk(lowerRooms, en) };
  });
  scored.sort((a, b) => b.s - a.s);
  if (scored[0].s === scored[1].s) return { up: defaultStairUp(rect.w, rect.d), sure: false };
  return { up: scored[0].dir, sure: scored[0].s >= 4 };
}

/**
 * 相邻两层的楼梯间配成一座楼梯（对齐以后 IoU ≥ 0.3）。矩形用下层的（下层画得完整、有 UP 箭头）；
 * up / shape 先用下层第二遍读到的，没有就按「出口在上层能走的地方」猜（标 review）。下层的楼梯间在上层找不到 → 也连上去。
 * floors: [{ id, rooms, stairs?: [{ x, y, w, d, up, shape }] }]（自下而上，已对齐）。
 */
export function stairsFromRooms(floors) {
  const out = [];
  let n = 1;
  for (let i = 0; i + 1 < floors.length; i++) {
    const lo = floors[i];
    const hi = floors[i + 1];
    const used = new Set();
    // 同一层共一整条边的楼梯块（墙线把一座楼梯切成两段）先合成一块
    const loStairs = mergeTouching(lo.rooms.filter((r) => r.type === 'stair'));
    const hiStairs = mergeTouching(hi.rooms.filter((r) => r.type === 'stair'));
    const cands = [];
    for (const a of loStairs) {
      // 已经从更下面一层上来、又不往上的楼梯间（顶层的到达口）不算
      let best = null;
      for (const b of hiStairs.filter((r) => !used.has(r))) {
        const v = iouRect(a, b);
        if (v >= 0.3 && (!best || v > best.v)) best = { b, v };
      }
      if (best) used.add(best.b);
      else if (out.some((s) => s.to === lo.id && iouRect(s, a) > 0.5)) continue; // 下面上来的到达口，上面没有楼梯
      const info = (lo.stairs || []).map((s) => ({ s, v: iouRect(s, a) })).filter((q) => q.v > 0.3).sort((p, q) => q.v - p.v)[0]?.s;
      const shape = info?.shape || defaultStairShape(a.w, a.d);
      let up = info?.up || null;
      let review = false;
      if (!up) {
        const g = guessUp(a, lo.rooms, hi.rooms);
        up = g.up;
        review = !g.sure || shape !== 'straight';
      }
      const fits = stairFit(a, { shape, up }, lo.rise > 0 ? lo.rise : 3.2).fits;
      cands.push({ id: null, from: lo.id, to: hi.id, x: r3(a.x), y: r3(a.y), w: r3(a.w), d: r3(a.d), shape, up, matched: !!best, review, fits });
    }
    // 同两层之间两座以上的楼梯：只留跑得下的（马来西亚的排屋 / 半独立只有一座）；都跑不下 → 留最大的那座
    let keep = cands;
    if (cands.length > 1) {
      const ok = cands.filter((c) => c.fits);
      keep = ok.length ? ok : [[...cands].sort((p, q) => q.w * q.d - p.w * p.d)[0]];
    }
    for (const c of keep) {
      const { fits, ...s } = c;
      out.push({ ...s, id: `s${n++}`, ...(fits ? {} : { review: true }) });
    }
  }
  return out;
}

/**
 * 配好楼梯以后整理每层的楼梯间：几块拼成的楼梯 → 一块（= 楼梯的矩形）；没配上楼梯、又不是到达口的楼梯块 → 走廊（不留没有楼梯的「楼梯间」）。
 * floors: buildFloors 的楼层（下标 = stairs 的 from / to）。原地改 rooms。
 */
function tidyStairRooms(floors, stairs) {
  floors.forEach((f, i) => {
    const mine = stairs.filter((s) => s.from === i || s.to === i);
    if (!f.rooms.some((r) => r.type === 'stair')) return;
    const covered = (r) => mine.find((s) => {
      const ix = Math.min(r.x + r.w, s.x + s.w) - Math.max(r.x, s.x);
      const iy = Math.min(r.y + r.d, s.y + s.d) - Math.max(r.y, s.y);
      return ix > 0.05 && iy > 0.05 && (ix * iy) / (r.w * r.d) > 0.6;
    });
    const out = [];
    const done = new Set();
    for (const r of f.rooms) {
      if (r.type !== 'stair') {
        out.push(r);
        continue;
      }
      const s = covered(r);
      if (!s) {
        out.push(floors.length > 1 ? { ...r, type: 'corridor', name: '' } : r);
        continue;
      }
      if (done.has(s)) continue; // 同一座楼梯的另一块：已经并进去了
      done.add(s);
      out.push({ ...r, x: s.x, y: s.y, w: s.w, d: s.d });
    }
    f.rooms = out;
  });
}

// ───────────── 整页 → v2 plan ─────────────

const shiftRoom = (r, dx, dy) => ({ ...r, x: r3(r.x + dx), y: r3(r.y + dy) });
const shiftOpening = (o, dx, dy) => ({ ...o, x1: r3(o.x1 + dx), x2: r3(o.x2 + dx), y1: r3(o.y1 + dy), y2: r3(o.y2 + dy) });

/** 比例合不合理：一楼宽 3.5–30 m；卧室面积的中位数 4–64 ㎡ */
export function scaleSane(floors) {
  const g = floors[0];
  if (!g || !g.rooms.length) return true;
  const e = env(g.rooms);
  const W = Math.min(e.x1 - e.x0, e.y1 - e.y0);
  if (!(W > 3.5 && W < 30)) return false;
  const beds = floors.flatMap((f) => f.rooms).filter((r) => r.type === 'bedroom' || r.type === 'master');
  if (beds.length) {
    const a = median(beds.map((r) => r.w * r.d));
    if (!(a > 4 && a < 64)) return false;
  }
  return true;
}

/**
 * 一页上读到的几层 → v2 plan + 每层的底图摆放 + 报告。
 * floors: [{ level, title, read, cropW, cropH, src?, page?, box?, srcScale?, walls? }]（自下而上）
 *   read = 第二遍的回答；cropW / cropH = 送给 AI 的那张裁图的像素；srcScale = 裁图像素 / 原图像素（截图放大 ×2 → 2）；
 *   walls = plan/walls.js 的 extractWalls 结果（裁图像素），quality ≥ 0.6 时按图上的墙重建（fuse 传进来）。
 * opts: { scale?: { mPerPx, source }（设计师填了已知尺寸 → 'known'）, name, north, screenshot, uid, fuse? }
 * → { plan, underlays: { [floorId]: { src, x, y, w, h, opacity, iw, ih } }, report }
 */
/**
 * 一页的比例（第 1 步，assemblePlan 也用它）：同一页的几层合起来算；设计师填的优先。
 * floors: [{ read, cropW, cropH, photo? }]；photo = 拍的照片（已经拉正）→ 横竖各算一个比例（aspect = 竖 / 横，裁图要在 y 方向拉 aspect 倍才是方的）。
 * → { mPerPx（横向，每个裁图像素几米）, aspect, source: 'dims'|'doors'|'guess'|'known', n, spread?, rejected? }
 */
/**
 * 一条尺寸链（同一排的分段尺寸）在图上是不是首尾相接：AI 把尺寸字配错了线（每一段都短一截）→ 段和段之间有空。
 * → 平均空出来的比例（0 = 接得刚好；没有 ≥ 3 段的链 → null）
 */
export function chainGap(dims) {
  const segs = (dims || [])
    .filter((d) => parseDimText(d?.text) && okBox(d.box_2d))
    .map((d) => {
      const [y0, x0, y1, x1] = d.box_2d.map(Number);
      const axis = d.axis === 'x' || d.axis === 'y' ? d.axis : y1 - y0 > x1 - x0 ? 'y' : 'x';
      return axis === 'x' ? { axis, a: x0, b: x1, c: (y0 + y1) / 2 } : { axis, a: y0, b: y1, c: (x0 + x1) / 2 };
    });
  const fr = [];
  for (const axis of ['x', 'y']) {
    const list = segs.filter((s) => s.axis === axis).sort((p, q) => p.c - q.c);
    // 同一排（垂直方向差 ≤ 12 / 1000）的分成一条链；最长的那段是总尺寸，不算
    const rows = [];
    for (const s of list) {
      const r = rows.find((q) => Math.abs(q[0].c - s.c) <= 12);
      if (r) r.push(s);
      else rows.push([s]);
    }
    for (const r of rows) {
      if (r.length < 3) continue;
      const ch = r.sort((p, q) => p.a - q.a);
      const span = ch[ch.length - 1].b - ch[0].a;
      if (!(span > 0)) continue;
      let gap = 0;
      for (let i = 1; i < ch.length; i++) gap += Math.max(0, ch[i].a - ch[i - 1].b);
      fr.push(gap / span);
    }
  }
  return fr.length ? fr.reduce((s, v) => s + v, 0) / fr.length : null;
}

/**
 * 同一页几层的比例：各层只用自己的尺寸算出来差 > 6 % → 不平均。每个候选（某一层自己的比例）打分：
 * 拿它量每一层 AI 框的外框（footprint）对那一层写的总宽（overall_width_text；外框到外墙皮，比中线多 0–0.4 m 都算对）
 * + 那一层尺寸链首尾相不相接 + 它自己的 rms；分数最低的用。→ { scale?（选了某一层）, spread（层间差）, idx（选的是第几层） } | null
 */
export function pickFloorScale(withRead, per) {
  const ok = per.map((s, i) => ({ s, f: withRead[i], i })).filter((q) => q.s && q.s.source === 'dims');
  if (ok.length < 2) return null;
  const ks = ok.map((q) => q.s.mPerPx);
  const spread = Math.max(...ks) / Math.min(...ks) - 1;
  if (spread <= 0.06) return { spread };
  const fit = (k) => {
    let err = 0;
    let n = 0;
    for (const q of ok) {
      const W = parseDimText(q.f.read.overall_width_text) / 1000;
      if (!(W > 2) || !okBox(q.f.read.footprint_box_2d)) continue;
      const fp = boxPx(q.f.read.footprint_box_2d.map(Number), q.f.cropW, q.f.cropH);
      // 图可能是横着画的：横、竖两个方向取对得上的那个
      const e = (px) => Math.max(0, Math.abs(px * k - W - 0.2) - 0.2) / W;
      err += Math.min(e(fp.x1 - fp.x0), e(fp.y1 - fp.y0));
      n++;
    }
    return n ? err / n : 0;
  };
  const scored = ok.map((q) => ({ ...q, v: fit(q.s.mPerPx) + (chainGap(q.f.read.dimensions) ?? 0.05) + (q.s.rms || 0) }));
  scored.sort((p, q) => p.v - q.v || p.i - q.i);
  const best = scored[0];
  const rms = Math.sqrt((best.s.rms || 0) ** 2 + spread ** 2);
  return { spread, idx: best.i, scale: { ...best.s, rms, floorSpread: spread, floorPick: best.i } };
}

export function pageScale(floorsIn, opts = {}) {
  const withRead = (floorsIn || []).filter((f) => f && f.read);
  if (opts.scale?.mPerPx > 0) return { n: 0, aspect: 1, ...opts.scale, source: opts.scale.source || 'known' };
  if (!withRead.length) return null;
  const per = withRead.map((f) => scaleFromDims(f.read.dimensions, f.cropW, f.cropH, { aniso: !!f.photo }));
  // 几层各自的比例差 > 6 %：不平均（AI 把某一层的尺寸字配错了尺寸线），用「自己对得上」的那层，并提醒
  const pick = pickFloorScale(withRead, per);
  let scale = pick?.scale || sheetScale(per);
  if (scale && pick && !pick.scale && pick.spread > 0) scale = { ...scale, rms: Math.sqrt((scale.rms || 0) ** 2 + (pick.spread / 2) ** 2), floorSpread: pick.spread };
  if (!scale) scale = sheetScale(withRead.map((f) => estimateScale(f.read, f.cropW, f.cropH)));
  if (!scale) scale = { mPerPx: 6.1 / Math.max(1, withRead[0].cropW * 0.8), n: 0, source: 'guess', widthM: 6.1 };
  return { aspect: 1, ...scale };
}

export function assemblePlan(floorsIn, opts = {}) {
  let input = (floorsIn || []).filter((f) => f && (f.read || f.src));
  let k = 0;
  const uid = opts.uid || ((p) => `${p}${++k}`);
  const report = { scale: null, floors: [], aligned: null, warnings: [], lowRes: false, stairs: 0 };
  if (!input.some((f) => f.read)) return { plan: migratePlan(null), underlays: {}, report: { ...report, warnings: [{ code: 'none', zh: '没有读到任何一层' }] } };
  const withRead = input.filter((f) => f.read);

  // 1. 比例：同一页的几层合起来算；设计师填的优先
  let scale = pageScale(withRead, opts);
  // 照片压扁了（aspect ≠ 1）：每层的裁图在 y 方向当成 aspect 倍高（框是 0–1000 归一化的，读图结果不用改；底图按 w / h 拉伸显示）
  const aspect = scale.aspect > 0.8 && scale.aspect < 1.25 ? scale.aspect : 1;
  if (aspect !== 1) input = input.map((f) => ({ ...f, imgH: f.cropH, cropH: f.cropH * aspect }));
  const build = (k) => buildFloors(input, k, uid, opts);
  let built = build(scale.mPerPx);
  if (scale.source !== 'known' && !scaleSane(built.floors)) {
    // 比例不合理（读错了尺寸）：改成按形状猜，并提醒填一个已知尺寸
    const g0 = built.floors[0];
    const e = env(g0.rooms);
    const w = e.x1 - e.x0;
    const d = e.y1 - e.y0;
    if (w > 0 && d > 0) {
      const widthM = guessWidth(Math.max(w, d) / Math.min(w, d));
      const k2 = scale.mPerPx * (widthM / Math.min(w, d));
      scale = { mPerPx: k2, aspect, n: 0, source: 'guess', widthM, reason: 'sanity', was: scale.source };
      built = build(k2);
    }
  }
  const { floors, aligned, stairs } = built;
  report.aligned = aligned;
  report.stairs = stairs.length;

  // 2. 一楼围合部分的左上角 = (0, 0)
  const e0 = env(floors[0].rooms);
  const ox = Number.isFinite(e0.x0) ? e0.x0 : 0;
  const oy = Number.isFinite(e0.y0) ? e0.y0 : 0;
  const ids = new Set();
  const fid = (lv, i) => {
    let id = LEVEL_IDS[lv] || `f${i}`;
    while (ids.has(id)) id = `${id}${i}`;
    ids.add(id);
    return id;
  };
  const multi = floors.length > 1;
  const v2floors = floors.map((f, i) => {
    const id = fid(f.level, i);
    f.id = id;
    const { ceil, height } = FLOOR_H(i, floors.length);
    return {
      id,
      level: i,
      name: '',
      height,
      ceil,
      rooms: f.rooms.map((r) => {
        const { label, gap, pin, ...room } = shiftRoom(r, -ox, -oy);
        return { ...room, id: `${id}-${r.id}` };
      }),
      openings: f.openings.map((o) => ({ ...shiftOpening(o, -ox, -oy), id: `${id}-${o.id}` })),
      meta: { import: { page: f.page ?? 1, box: f.box || null, scale: +scale.mPerPx.toPrecision(6), title: f.title || '', ...(f.srcScale > 1 ? { srcScale: f.srcScale } : {}) } },
    };
  });
  const v2stairs = stairs.map((s) => {
    const { matched, review, from, to, ...st } = s;
    return { ...st, from: floors[from].id, to: floors[to].id, x: r3(s.x - ox), y: r3(s.y - oy) };
  });
  const plan = migratePlan({ v: 2, name: opts.name || '', north: Number(opts.north) || 0, floors: v2floors, stairs: v2stairs });

  // 3. 底图：每层的裁图，按这一层的位移摆
  const underlays = {};
  floors.forEach((f, i) => {
    if (!f.src) return;
    underlays[v2floors[i].id] = { src: f.src, x: r3(f.dx - ox), y: r3(f.dy - oy), w: r3(f.cropW * scale.mPerPx), h: r3(f.cropH * scale.mPerPx), opacity: 0.55, iw: f.cropW, ih: Math.round(f.imgH || f.cropH) };
  });

  // 4. 报告
  const g = plan.floors[0];
  const eg = env(g.rooms);
  report.scale = {
    source: scale.source,
    n: scale.n || 0,
    spread: scale.spread != null ? r3(scale.spread) : null,
    errPct: scale.rms != null ? Math.max(0.5, Math.round(scale.rms * 1000) / 10) : scale.spread != null ? Math.max(0.5, Math.round(scale.spread * 1000) / 10) : null,
    mPerPx: scale.mPerPx,
    aspect: r3(aspect),
    widthM: Number.isFinite(eg.x1 - eg.x0) ? r2(eg.x1 - eg.x0) : null,
    depthM: Number.isFinite(eg.y1 - eg.y0) ? r2(eg.y1 - eg.y0) : null,
    rejected: scale.rejected || [],
    reason: scale.reason || null,
    floorSpread: scale.floorSpread != null ? r3(scale.floorSpread) : null,
  };
  const overlaps = checkPlan(plan).filter((s) => s.code === 'overlap').length;
  report.overlapsLeft = overlaps;
  floors.forEach((f, i) => {
    report.floors.push({ id: plan.floors[i].id, level: f.level, title: f.title || '', rooms: plan.floors[i].rooms.filter((r) => !r.stairId).length, openings: plan.floors[i].openings.length, fixes: f.fixes, walls: f.wallsReport || null, unnamed: f.unnamed || 0 });
  });
  report.unnamed = floors.reduce((t, f) => t + (f.unnamed || 0), 0);
  const lr = lowResReport(
    withRead.map((f) => ({ srcPxW: (f.cropW || 0) / (f.srcScale || 1), mPerSrcPx: scale.mPerPx * (f.srcScale || 1) })),
    { screenshot: !!opts.screenshot },
  );
  report.lowRes = lr.lowRes;
  report.pxPerM = lr.pxPerM;
  report.planPx = lr.planPx;
  if (multi && !stairs.length) report.warnings.push({ code: 'noStairs', zh: '没认出楼梯：请在编辑器里用「楼梯」工具画上' });
  if (stairs.some((s) => s.review)) report.warnings.push({ code: 'stairDir', zh: '楼梯往哪边上是猜的：请在编辑器里点楼梯看一下' });
  // 一楼（或单独的一户）没有大门：提醒设计师自己加
  if (plan.floors[0]?.rooms.some((r) => !r.stairId) && !hasEntrance(plan.floors[0])) report.warnings.push({ code: 'noEntrance', zh: '没找到大门：请在编辑器里用「门」工具加上' });
  // 几层图上的尺寸对不上：用了其中一层的比例 → 请填一个已知尺寸
  if (scale.floorSpread > 0.06 && scale.floorPick != null) {
    const readIdx = input.map((f, i) => (f.read ? i : -1)).filter((i) => i >= 0);
    const pf = plan.floors[readIdx[scale.floorPick]];
    if (pf) report.warnings.push({ code: 'scaleFloors', zh: '各层图上的尺寸对不上（差 {0}%）：先按{1}的比例，请填一个已知尺寸核对', vars: [Math.round(scale.floorSpread * 100), { floor: pf.id }] });
  }
  floors.forEach((f, i) => {
    if (!plan.floors[i].rooms.some((r) => !r.stairId)) report.warnings.push({ code: 'empty', zh: '{0}没有读到房间：用底图自己描', vars: [{ floor: plan.floors[i].id }] });
  });
  return { plan, underlays, report };
}

/**
 * 墙优先的结果（walls.js + fuse）和 AI 房间框铺出来的结果对不对得上：
 * 围合外框的宽 / 深差 ≤ 8 %；按面积算，AI 的房间 ≥ 70 % 在墙优先的结果里有同类型的房间盖住一半以上。→ { ok, score, why }
 */
export function roomsAgree(fused, tiled) {
  const enc = (rs) => rs.filter((r) => !OUT.has(r.type));
  const box = (rs) => {
    const q = enc(rs).length ? enc(rs) : rs;
    return { x0: Math.min(...q.map((r) => r.x)), y0: Math.min(...q.map((r) => r.y)), x1: Math.max(...q.map((r) => r.x + r.w)), y1: Math.max(...q.map((r) => r.y + r.d)) };
  };
  if (!fused.length || !tiled.length) return { ok: false, score: 0, why: 'empty' };
  const a = box(fused);
  const b = box(tiled);
  const dw = Math.abs(a.x1 - a.x0 - (b.x1 - b.x0)) / (b.x1 - b.x0);
  const dd = Math.abs(a.y1 - a.y0 - (b.y1 - b.y0)) / (b.y1 - b.y0);
  if (dw > 0.08 || dd > 0.08) return { ok: false, score: 0, why: 'outline' };
  const inter = (p, q) => Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)) * Math.max(0, Math.min(p.y + p.d, q.y + q.d) - Math.max(p.y, q.y));
  let tot = 0;
  let good = 0;
  for (const t of tiled.filter((r) => !r.gap && r.type !== 'corridor')) {
    const ar = t.w * t.d;
    tot += ar;
    const cov = fused.filter((f) => f.type === t.type).reduce((s, f) => s + inter(t, f), 0);
    if (cov >= 0.5 * ar) good += ar;
  }
  const score = tot ? good / tot : 1;
  return { ok: score >= 0.7, score: Math.round(score * 100) / 100, why: score >= 0.7 ? null : 'rooms' };
}

/**
 * 墙优先的结果里少了 AI 读到的门：AI 的门先吸到墙优先的房间边上；那里图上有门的证据（doorSwing 或墙上的缺口），
 * 而墙优先在同一段墙上没有开口 → 加回去。两边都是开放空间（不会有墙）的不加。→ { openings, restored }
 */
export function restoreDoors(rooms, fused, aiOpenings, ink, mPerPx, { dx = 0, dy = 0, uid = defaultUid } = {}) {
  const doors = (aiOpenings || []).filter((o) => o.kind === 'door' || o.kind === 'slider');
  if (!doors.length || !ink?.mask) return { openings: fused, restored: 0 };
  const snapped = snapOpenings(rooms, doors).openings;
  const out = [...fused];
  let restored = 0;
  const open = (r) => !!ROOM_TYPES[r?.type]?.open;
  for (const o of snapped) {
    const horiz = Math.abs(o.y1 - o.y2) < 1e-6;
    const c = horiz ? o.y1 : o.x1;
    const [a, b] = horiz ? [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)] : [Math.min(o.y1, o.y2), Math.max(o.y1, o.y2)];
    // 墙优先在这一段已经有开口（窗以外的都算）
    const hasIdx = out.findIndex((q) => {
      const qh = Math.abs(q.y1 - q.y2) < 1e-6;
      if (qh !== horiz || q.kind === 'window') return false;
      const qc = qh ? q.y1 : q.x1;
      const [qa, qb] = qh ? [Math.min(q.x1, q.x2), Math.max(q.x1, q.x2)] : [Math.min(q.y1, q.y2), Math.max(q.y1, q.y2)];
      return Math.abs(qc - c) < 0.25 && Math.min(b, qb) - Math.max(a, qa) > 0.3 * (b - a);
    });
    const has = hasIdx >= 0 ? out[hasIdx] : null;
    if (has && has.kind !== 'open') continue;
    // 两边的房间：都是开放空间 → 那里没有墙，不加
    const mid = { x: horiz ? (a + b) / 2 : c, y: horiz ? c : (a + b) / 2 };
    const side = (s) => rooms.find((r) => {
      const x = mid.x + (horiz ? 0 : s * 0.1);
      const y = mid.y + (horiz ? s * 0.1 : 0);
      return x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.d;
    });
    const p = side(-1);
    const q = side(1);
    if (p && q && open(p) && open(q)) continue;
    const w = wallInk(ink, mPerPx, { axis: horiz ? 'x' : 'y', c, a: a - 0.6, b: b + 0.6 }, { dx, dy });
    const swing = o.kind === 'door' ? doorSwing(ink, mPerPx, { axis: horiz ? 'x' : 'y', c: w.c, a, b }, { dx, dy }) : { ok: false };
    const m = (b - a) * 0.2;
    const wallD = Math.max(w.dens(a - 0.6, a - 0.05), w.dens(b + 0.05, b + 0.6));
    const inD = w.dens(a + m, b - m);
    const gap = w.at(a + m, b - m) < 0.4 && Math.max(w.at(a - 0.6, a - 0.05), w.at(b + 0.05, b + 0.6)) >= 0.5;
    // 推拉门：墙里画着几条细线（玻璃）—— 比旁边的墙淡、又不是空的
    const glazing = o.kind === 'slider' && wallD > 0 && inD > 0.5 && inD < 0.6 * wallD;
    if (has) {
      // 墙优先放了「打通」，图上却有门的开启弧线 / 推拉门的玻璃线 → 用 AI 的门种类（位置用墙优先的）
      if (swing.ok || glazing) {
        const hh = Math.abs(has.y1 - has.y2) < 1e-6;
        const [ha, hb] = hh ? [Math.min(has.x1, has.x2), Math.max(has.x1, has.x2)] : [Math.min(has.y1, has.y2), Math.max(has.y1, has.y2)];
        const extra = { ...(swing.ok ? { arc: true } : {}), restored: true };
        if (hb - ha <= 1.5 * (b - a)) out[hasIdx] = { ...has, kind: o.kind, ...extra };
        else {
          // 长长的「打通」里只有一段是门：切开（门 = AI 的那一段，两边还是打通）
          const da = Math.max(ha, a);
          const db = Math.min(hb, b);
          const seg2 = (p0, q0, kind, id, more = {}) => ({ ...has, ...more, id, kind, ...(hh ? { x1: r2(p0), x2: r2(q0) } : { y1: r2(p0), y2: r2(q0) }) });
          const pieces = [seg2(da, db, o.kind, uid('o'), extra)];
          if (da - ha >= 0.3) pieces.push(seg2(ha, da, 'open', has.id));
          if (hb - db >= 0.3) pieces.push(seg2(db, hb, 'open', uid('o')));
          out.splice(hasIdx, 1, ...pieces);
        }
        restored++;
      }
      continue;
    }
    if (!swing.ok && !gap && !glazing) continue;
    out.push({ ...o, id: uid('o'), restored: true, ...(swing.ok ? { arc: true } : {}) });
    restored++;
  }
  return { openings: out, restored };
}

/**
 * 墙优先的结果里的细条（< min，常见在 AI 的楼梯框和图上的墙差一点的地方）：细条一边的邻居正好落在细条的长度里、又把它铺满
 * → 邻居往细条那边伸过去（还是矩形），细条不要了。锁住的房间（楼上钉住的楼梯间）不动。→ { rooms, merged }
 */
export function cleanSlivers(rooms, { min = 0.4, locked = () => false, wallAt = null } = {}) {
  const out = rooms.map((r) => ({ ...r }));
  let merged = 0;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const s of out) {
      if (s.dead || Math.min(s.w, s.d) >= min) continue;
      const horiz = s.w >= s.d; // 横的细条：上下两边找邻居
      const t = horiz ? s.d : s.w;
      const [a, b] = horiz ? [s.x, s.x + s.w] : [s.y, s.y + s.d];
      const range = (r) => (horiz ? [r.x, r.x + r.w] : [r.y, r.y + r.d]);
      // 先往图上没有墙的那条边伸（图上有墙的那条边要留着）
      const edgeOf = (side) => (horiz ? (side < 0 ? s.y : s.y + s.d) : side < 0 ? s.x : s.x + s.w);
      const sides = wallAt ? [-1, 1].sort((p, q) => wallAt({ axis: horiz ? 'x' : 'y', c: edgeOf(p), a, b }) - wallAt({ axis: horiz ? 'x' : 'y', c: edgeOf(q), a, b })) : [-1, 1];
      for (const side of sides) {
        const edge = edgeOf(side);
        const nb = out.filter((r) => {
          if (r === s || r.dead) return false;
          const e = horiz ? (side < 0 ? r.y + r.d : r.y) : side < 0 ? r.x + r.w : r.x;
          const [ra, rb] = range(r);
          return Math.abs(e - edge) < 0.03 && Math.min(b, rb) - Math.max(a, ra) > 0.01;
        });
        if (!nb.length || nb.some((r) => locked(r) || range(r)[0] < a - 0.03 || range(r)[1] > b + 0.03)) continue;
        const cov = nb.reduce((acc, r) => acc + Math.min(b, range(r)[1]) - Math.max(a, range(r)[0]), 0);
        if (cov < b - a - 0.05) continue;
        for (const r of nb) {
          if (horiz) {
            if (side > 0) r.y = r3(r.y - t);
            r.d = r3(r.d + t);
          } else {
            if (side > 0) r.x = r3(r.x - t);
            r.w = r3(r.w + t);
          }
        }
        s.dead = true;
        merged++;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return { rooms: out.filter((r) => !r.dead).map(({ dead, ...r }) => r), merged };
}

// ───────────── 楼梯复查（墙优先之后） ─────────────

/** 楼梯矩形的跑长够不够：rise = 这一层的楼层高（0 = 顶层，不查）。info = AI 读到的 { up, shape } */
function stairFit(r, info, rise) {
  if (!(rise > 0)) return { fits: true, need: 0, avail: 0 };
  const shape = info?.shape || defaultStairShape(r.w, r.d);
  // AI 的 up 只在和矩形的长边一致时才用（直跑：沿长边上）
  let up = info?.up || defaultStairUp(r.w, r.d);
  if (shape === 'straight' && (r.d >= r.w) !== (up === 'N' || up === 'S')) up = defaultStairUp(r.w, r.d);
  return stairFlights({ x: r.x, y: r.y, w: r.w, d: r.d, shape, up, ...(shape === 'L' ? { width: Math.min(1.0, r.w, r.d) } : {}) }, rise);
}

/** 共一整条边的矩形（并起来还是矩形）合成一块：楼梯被墙线切成两段时用 → [{ x, y, w, d, parts: [原来的] }] */
export function mergeTouching(rects, eps = 0.03) {
  let out = rects.map((r) => ({ x: r.x, y: r.y, w: r.w, d: r.d, parts: [r] }));
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i++)
      for (let j = i + 1; j < out.length && !changed; j++) {
        const a = out[i];
        const b = out[j];
        const sameX = Math.abs(a.x - b.x) < eps && Math.abs(a.w - b.w) < eps;
        const sameY = Math.abs(a.y - b.y) < eps && Math.abs(a.d - b.d) < eps;
        let m = null;
        if (sameX && (Math.abs(a.y + a.d - b.y) < eps || Math.abs(b.y + b.d - a.y) < eps)) m = { x: a.x, y: Math.min(a.y, b.y), w: a.w, d: a.d + b.d };
        else if (sameY && (Math.abs(a.x + a.w - b.x) < eps || Math.abs(b.x + b.w - a.x) < eps)) m = { x: Math.min(a.x, b.x), y: a.y, w: a.w + b.w, d: a.d };
        if (!m) continue;
        out.splice(j, 1);
        out[i] = { ...m, x: r3(m.x), y: r3(m.y), w: r3(m.w), d: r3(m.d), parts: [...a.parts, ...b.parts] };
        changed = true;
      }
  }
  return out;
}

/**
 * 图上的一条线（墙的中线、楼梯的细边线）：在 c ± search（米）里找沿 [a, b] 有墨的比例最高的平行线；
 * 实心墙是一片 → 取那一片的中间。比例 < minFrac → null。
 */
export function inkLineNear(ink, mPerPx, seg, { dx = 0, dy = 0, search = 0.2, minFrac = 0.75 } = {}) {
  if (!ink?.mask || !(mPerPx > 0)) return null;
  const { mask, width: W, height: H } = ink;
  const k = 1 / mPerPx;
  const horiz = seg.axis === 'x';
  const c0 = (seg.c - (horiz ? dy : dx)) * k;
  const a = (Math.min(seg.a, seg.b) - (horiz ? dx : dy)) * k;
  const b = (Math.max(seg.a, seg.b) - (horiz ? dx : dy)) * k;
  const m = (b - a) * 0.1;
  const lo = Math.max(0, Math.round(a + m));
  const hi = Math.min((horiz ? W : H) - 1, Math.round(b - m));
  if (hi - lo < 4) return null;
  const on = (u, v) => {
    const x = horiz ? u : v;
    const y = horiz ? v : u;
    return x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
  };
  const sr = Math.max(2, Math.round(search * k));
  const fr = [];
  for (let o = -sr; o <= sr; o++) {
    const v = Math.round(c0 + o);
    let n = 0;
    let t = 0;
    for (let u = lo; u <= hi; u += 2) {
      t++;
      if (on(u, v) || on(u, v - 1) || on(u, v + 1)) n++;
    }
    fr.push(t ? n / t : 0);
  }
  // 够强的线里离原来最近的那条（楼梯的踏步线也是平行的细线，所以不取「最强」的）；连成一片的取中间
  let best = -1;
  for (let i = 0; i < fr.length; i++) if (fr[i] >= minFrac && (best < 0 || Math.abs(i - sr) < Math.abs(best - sr))) best = i;
  if (best < 0) return null;
  let i0 = best;
  let i1 = best;
  while (i0 > 0 && fr[i0 - 1] >= minFrac) i0--;
  while (i1 < fr.length - 1 && fr[i1 + 1] >= minFrac) i1++;
  const v = c0 + (i0 + i1) / 2 - sr;
  return r3(v / k + (horiz ? dy : dx));
}

/** extractWalls 的墙（裁图像素）→ 米的中线：{ h: [{ c, a, b }], v: [...] } */
function wallLinesM(walls, mPerPx, dx = 0, dy = 0) {
  const out = { h: [], v: [] };
  for (const w of walls?.walls || []) {
    const horiz = Math.abs(w.y1 - w.y2) <= Math.abs(w.x1 - w.x2);
    if (horiz) out.h.push({ c: ((w.y1 + w.y2) / 2) * mPerPx + dy, a: Math.min(w.x1, w.x2) * mPerPx + dx, b: Math.max(w.x1, w.x2) * mPerPx + dx });
    else out.v.push({ c: ((w.x1 + w.x2) / 2) * mPerPx + dx, a: Math.min(w.y1, w.y2) * mPerPx + dy, b: Math.max(w.y1, w.y2) * mPerPx + dy });
  }
  return out;
}

/**
 * AI 的楼梯框吸到图上：每条边先找 0.35 m 内平行的墙中线；没有墙 → 0.2 m 内的细线（楼梯的边线 / 栏杆）；
 * 都没有 → 0.15 m 内的房间边（edges：{ h: [y…], v: [x…] }，旧楼梯块的外框、邻居的边）；再没有 → 不动
 */
export function snapStairBox(B, { lines = { h: [], v: [] }, ink = null, mPerPx = 0, dx = 0, dy = 0, edges = { h: [], v: [] } } = {}) {
  const edge = (horiz, c, a, b) => {
    let best = null;
    for (const l of horiz ? lines.h : lines.v) {
      const ov = Math.min(b, l.b) - Math.max(a, l.a);
      const d = Math.abs(l.c - c);
      if (d <= 0.35 && ov >= 0.3 * (b - a) && (!best || d < best.d)) best = { c: l.c, d };
    }
    if (best) return best.c;
    const v = inkLineNear(ink, mPerPx, { axis: horiz ? 'x' : 'y', c, a, b }, { dx, dy });
    if (v != null) return v;
    let e = null;
    for (const q of horiz ? edges.h : edges.v) if (Math.abs(q - c) <= 0.15 && (e == null || Math.abs(q - c) < Math.abs(e - c))) e = q;
    return e ?? c;
  };
  const x0 = edge(false, B.x, B.y, B.y + B.d);
  const x1 = edge(false, B.x + B.w, B.y, B.y + B.d);
  const y0 = edge(true, B.y, B.x, B.x + B.w);
  const y1 = edge(true, B.y + B.d, B.x, B.x + B.w);
  const out = { x: x0, y: y0, w: x1 - x0, d: y1 - y0 };
  // 吸歪了（宽 / 深变了 40 % 以上、或者 < 0.6 m）→ 那个方向不吸
  if (!(out.w >= 0.6 && Math.abs(out.w / B.w - 1) <= 0.4)) Object.assign(out, { x: B.x, w: B.w });
  if (!(out.d >= 0.6 && Math.abs(out.d / B.d - 1) <= 0.4)) Object.assign(out, { y: B.y, d: B.d });
  return { ...B, x: r3(out.x), y: r3(out.y), w: r3(out.w), d: r3(out.d) };
}

/** 房间 id 的「本体」：L 形房间的两块是 id 和 id-2（同类型）→ 同一个房间 */
export function partBase(r, rooms) {
  const m = /^(.*)-(\d+)$/.exec(String(r.id || ''));
  if (m && rooms.some((q) => q.id === m[1] && q.type === r.type)) return m[1];
  return r.id;
}

/**
 * 在一层不重叠的房间里放进新的矩形（楼梯）：盖住的部分从邻居挖掉；remove 里的旧房间（切坏的楼梯块）让出来的、
 * 新矩形没盖住的地方 → 给共边最长的邻居（开放空间优先）。没碰到的房间原样不动。→ rooms
 */
export function carveRects(rooms, boxes, { remove = new Set(), make = (B, i) => ({ id: `stair${i + 1}`, type: 'stair', name: '', ...B }) } = {}) {
  const keep = rooms.filter((r) => !remove.has(r));
  const touched = new Set();
  const inter = (p, q) => Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 0.01 && Math.min(p.y + p.d, q.y + q.d) - Math.max(p.y, q.y) > 0.01;
  for (const r of keep) if (boxes.some((B) => inter(r, B))) touched.add(r);
  // 旧块让出的地方的邻居也要重新分
  const freed = rooms.filter((r) => remove.has(r));
  const touch = (p, q) => Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > -0.02 && Math.min(p.y + p.d, q.y + q.d) - Math.max(p.y, q.y) > -0.02;
  for (const r of keep) if (freed.some((f) => touch(r, f))) touched.add(r);
  // 同一个房间的几块一起重新分
  const base = (r) => partBase(r, rooms);
  for (const r of [...touched]) for (const q of keep) if (base(q) === base(r)) touched.add(q);
  const work = [...touched];
  const all = [...work, ...freed, ...boxes];
  // 差 1 cm 以内的边当成同一条（不然中间多一条 1 mm 的空格，房间被切碎）
  const lines = (vals) => {
    const out = [];
    for (const v of vals.map(r3).sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > 0.012) out.push(v);
    return out;
  };
  const xs = lines(all.flatMap((r) => [r.x, r.x + r.w]));
  const ys = lines(all.flatMap((r) => [r.y, r.y + r.d]));
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  if (nx < 1 || ny < 1) return rooms;
  const keys = [...new Set(work.map(base))];
  const protos = keys.map((key) => work.find((r) => r.id === key) || work.find((r) => base(r) === key));
  const BOX = 1 << 20;
  // own: 0.. = 房间本体（keys）；BOX + i = 新矩形 i；-3 = 让出来的；-1 = 外面
  const own = new Int32Array(nx * ny).fill(-1);
  const at = (i, j) => j * nx + i;
  const inside = (r, x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.d;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      const bi = boxes.findIndex((B) => inside(B, cx, cy));
      if (bi >= 0) own[at(i, j)] = BOX + bi;
      else if (freed.some((r) => inside(r, cx, cy))) own[at(i, j)] = -3;
      else {
        const r = work.find((q) => inside(q, cx, cy));
        if (r) own[at(i, j)] = keys.indexOf(base(r));
      }
    }
  // 让出来的格子：一片一片给共边最长的房间（开放空间稍微优先）；没有邻居 → 走廊
  const seen = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (own[at(i, j)] !== -3 || seen[at(i, j)]) continue;
      const comp = [];
      const st = [[i, j]];
      seen[at(i, j)] = 1;
      while (st.length) {
        const [a, b] = st.pop();
        comp.push([a, b]);
        for (const [p, q] of [
          [a + 1, b],
          [a - 1, b],
          [a, b + 1],
          [a, b - 1],
        ])
          if (p >= 0 && q >= 0 && p < nx && q < ny && !seen[at(p, q)] && own[at(p, q)] === -3) {
            seen[at(p, q)] = 1;
            st.push([p, q]);
          }
      }
      const len = new Map();
      const set = new Set(comp.map(([a, b]) => at(a, b)));
      for (const [a, b] of comp)
        for (const [p, q, l] of [
          [a + 1, b, ys[b + 1] - ys[b]],
          [a - 1, b, ys[b + 1] - ys[b]],
          [a, b + 1, xs[a + 1] - xs[a]],
          [a, b - 1, xs[a + 1] - xs[a]],
        ]) {
          if (p < 0 || q < 0 || p >= nx || q >= ny || set.has(at(p, q))) continue;
          const o = own[at(p, q)];
          if (o < 0 || o >= BOX) continue;
          len.set(o, (len.get(o) || 0) + l + (ROOM_TYPES[protos[o]?.type]?.open ? 0.05 : 0));
        }
      let best = -1;
      for (const [o, l] of len) if (best < 0 || l > len.get(best)) best = o;
      if (best < 0) {
        keys.push(`gapc${keys.length}`);
        protos.push({ type: 'corridor', name: '', gap: true });
        best = keys.length - 1;
      }
      for (const [a, b] of comp) own[at(a, b)] = best;
    }
  const rectsOf = (k) => {
    const runs = [];
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; ) {
        if (own[at(i, j)] !== k) {
          i++;
          continue;
        }
        let e = i;
        while (e + 1 < nx && own[at(e + 1, j)] === k) e++;
        runs.push({ i0: i, i1: e, j0: j, j1: j });
        i = e + 1;
      }
    const out = [];
    for (const r of runs) {
      const prev = out.find((q) => q.i0 === r.i0 && q.i1 === r.i1 && q.j1 === r.j0 - 1);
      if (prev) prev.j1 = r.j1;
      else out.push({ ...r });
    }
    return out.map((q) => ({ x: r3(xs[q.i0]), y: r3(ys[q.j0]), w: r3(xs[q.i1 + 1] - xs[q.i0]), d: r3(ys[q.j1 + 1] - ys[q.j0]) })).sort((p, q) => q.w * q.d - p.w * p.d);
  };
  const out = rooms.filter((r) => !touched.has(r) && !remove.has(r));
  const used = new Set(out.map((r) => r.id));
  keys.forEach((key, k) => {
    rectsOf(k).forEach((q, n) => {
      let id = n ? `${key}-${n + 1}` : key;
      while (used.has(id)) id = `${id}b`;
      used.add(id);
      const { pin, ...room } = protos[k];
      out.push({ ...room, id, ...q });
    });
  });
  boxes.forEach((B, i) => {
    const rs = rectsOf(BOX + i);
    if (rs.length) out.push(make({ ...B, ...rs[0] }, i));
  });
  return out;
}

/**
 * 墙优先以后的楼梯复查（walls.js 偶尔把一座楼梯切成两三块、或者把楼梯旁边的地方也算进楼梯）：
 * 这一层没钉住的楼梯块 → 先把共一整条边的合起来；然后只要 (a) 块数比 AI 的楼梯多、(b) 有一块跑不下（编辑器会说「楼梯太短」）、
 * (c) 和 AI 第二遍的楼梯框重叠 < 0.5 —— 就用 AI 的框（吸到图上的墙 / 细线）换掉，邻居让位置、旧块让出的地方给邻居。
 * rooms：fuse 之后的房间；ai：AI 的楼梯框 [{ x, y, w, d, up?, shape? }]（米，同一个坐标）；rise：这一层的楼层高（顶层 0）。
 * → { rooms, replaced, why }
 */
export function fixStairs(rooms, ai, { walls = null, ink = null, mPerPx = 0, dx = 0, dy = 0, rise = 0, uid = defaultUid } = {}) {
  const pins = rooms.filter((r) => r.type === 'stair' && r.pin);
  const mine = rooms.filter((r) => r.type === 'stair' && !r.pin);
  const boxes = (ai || []).filter((b) => b && b.w >= 0.5 && b.d >= 0.5 && !pins.some((p) => iouRect(p, b) > 0.3));
  if (!mine.length) return { rooms, replaced: 0, why: null };
  const groups = mergeTouching(mine);
  const why = [];
  if (groups.length > Math.max(1, boxes.length)) why.push('split');
  const infoOf = (g) => boxes.map((b) => ({ b, v: iouRect(b, g) })).sort((p, q) => q.v - p.v)[0];
  for (const g of groups) {
    const best = infoOf(g);
    const fit = stairFit(g, best && best.v > 0.3 ? best.b : null, rise);
    if (!fit.fits) why.push('short');
    if (boxes.length && (!best || best.v < 0.5)) why.push('offAI');
  }
  if (!why.length) {
    // 都可信：只是被切成两块的合回一块
    if (groups.every((g) => g.parts.length === 1)) return { rooms, replaced: 0, why: null };
    const remove = new Set(groups.filter((g) => g.parts.length > 1).flatMap((g) => g.parts));
    const out = rooms.filter((r) => !remove.has(r));
    for (const g of groups.filter((q) => q.parts.length > 1)) out.push({ ...g.parts[0], x: g.x, y: g.y, w: g.w, d: g.d });
    return { rooms: out, replaced: 0, merged: remove.size, why: null };
  }
  if (!boxes.length) return { rooms, replaced: 0, why: why.join(',') + ':noAI' };
  const lines = wallLinesM(walls, mPerPx, dx, dy);
  // 没有墙 / 线可吸的边：吸到旧楼梯块的外框、邻居的边（AI 的框常常差几厘米，留下一条细缝）
  const others = rooms.filter((r) => !mine.includes(r));
  const ux = [Math.min(...mine.map((r) => r.x)), Math.max(...mine.map((r) => r.x + r.w))];
  const uy = [Math.min(...mine.map((r) => r.y)), Math.max(...mine.map((r) => r.y + r.d))];
  const edges = { v: [...ux, ...others.flatMap((r) => [r.x, r.x + r.w])], h: [...uy, ...others.flatMap((r) => [r.y, r.y + r.d])] };
  const snapped = boxes.map((b) => snapStairBox(b, { lines, ink, mPerPx, dx, dy, edges }));
  // 钉住的楼梯间（楼下上来的）不挖
  if (snapped.some((B) => pins.some((p) => Math.min(p.x + p.w, B.x + B.w) - Math.max(p.x, B.x) > 0.05 && Math.min(p.y + p.d, B.y + B.d) - Math.max(p.y, B.y) > 0.05))) return { rooms, replaced: 0, why: why.join(',') + ':pinned' };
  const out = carveRects(rooms, snapped, { remove: new Set(mine), make: (B) => ({ id: uid('r'), type: 'stair', name: '', label: '', ...B, x: B.x, y: B.y, w: B.w, d: B.d, fromAI: true }) });
  return { rooms: out.map(({ up, shape, fromAI, ...r }) => r), replaced: snapped.length, why: [...new Set(why)].join(',') };
}

/**
 * 差不到 3 cm 的房间边对齐成一条（墙优先的面、钉住的楼梯各自取整，会差几毫米 → buildWalls 当成两条墙线，中间多出两道外墙）。
 * pins 的边（楼梯的矩形，上下层要一样）优先，否则取平均。门窗跟着一起挪。原地不改，→ { rooms, openings }
 */
export function snapEdges(rooms, openings = [], { tol = 0.03, pins = [] } = {}) {
  const mk = (vals, pinVals) => {
    const all = [...vals.map((v) => ({ v, pin: false })), ...pinVals.map((v) => ({ v, pin: true }))].sort((a, b) => a.v - b.v);
    const groups = [];
    for (const e of all) {
      const g = groups[groups.length - 1];
      if (g && e.v - g[0].v <= tol) g.push(e);
      else groups.push([e]);
    }
    const map = new Map();
    for (const g of groups) {
      if (g.length < 2) continue;
      const p = g.find((e) => e.pin);
      const val = p ? p.v : r3(g.reduce((t, e) => t + e.v, 0) / g.length);
      for (const e of g) map.set(r3(e.v), val);
    }
    return (v) => (map.has(r3(v)) ? map.get(r3(v)) : v);
  };
  const fx = mk(rooms.flatMap((r) => [r.x, r.x + r.w]), pins.flatMap((p) => [p.x, p.x + p.w]));
  const fy = mk(rooms.flatMap((r) => [r.y, r.y + r.d]), pins.flatMap((p) => [p.y, p.y + p.d]));
  const out = rooms.map((r) => {
    const x0 = fx(r.x);
    const y0 = fy(r.y);
    const x1 = fx(r.x + r.w);
    const y1 = fy(r.y + r.d);
    return x0 === r.x && y0 === r.y && x1 === r.x + r.w && y1 === r.y + r.d ? r : { ...r, x: x0, y: y0, w: r3(x1 - x0), d: r3(y1 - y0) };
  });
  const ops = openings.map((o) => {
    const horiz = Math.abs(o.y1 - o.y2) < 1e-6;
    return horiz ? { ...o, y1: fy(o.y1), y2: fy(o.y2) } : { ...o, x1: fx(o.x1), x2: fx(o.x2) };
  });
  return { rooms: out, openings: ops };
}

/**
 * 开放空间里 L 形房间的细的那一块（< min，常见：AI 的餐厅框画长了一点，客厅剩一条 0.6 m 的边）：
 * 长边整条贴着另一个开放空间、图上那里没有墙 → 并给那个房间（编辑器就不会说「客厅 太小了」）。→ { rooms, merged }
 */
export function absorbThinParts(rooms, { min = 0.8, wallAt = null } = {}) {
  const out = rooms.map((r) => ({ ...r }));
  const open = (r) => !!ROOM_TYPES[r?.type]?.open && r.type !== 'stair';
  let merged = 0;
  for (const s of out) {
    if (s.dead || Math.min(s.w, s.d) >= min || !open(s)) continue;
    const base = partBase(s, out);
    if (out.filter((q) => !q.dead && partBase(q, out) === base).length < 2) continue;
    const horiz = s.w >= s.d;
    const t = horiz ? s.d : s.w;
    const [a, b] = horiz ? [s.x, s.x + s.w] : [s.y, s.y + s.d];
    for (const side of [-1, 1]) {
      const edge = horiz ? (side < 0 ? s.y : s.y + s.d) : side < 0 ? s.x : s.x + s.w;
      const nb = out.filter((r) => {
        if (r === s || r.dead) return false;
        const e = horiz ? (side < 0 ? r.y + r.d : r.y) : side < 0 ? r.x + r.w : r.x;
        const [ra, rb] = horiz ? [r.x, r.x + r.w] : [r.y, r.y + r.d];
        return Math.abs(e - edge) < 0.03 && Math.min(b, rb) - Math.max(a, ra) > 0.01;
      });
      if (nb.length !== 1) continue;
      const r = nb[0];
      const [ra, rb] = horiz ? [r.x, r.x + r.w] : [r.y, r.y + r.d];
      if (!open(r) || partBase(r, out) === base || Math.abs(ra - a) > 0.03 || Math.abs(rb - b) > 0.03) continue;
      if (wallAt && wallAt({ axis: horiz ? 'x' : 'y', c: edge, a, b }) > 0.5) continue;
      if (horiz) {
        if (side > 0) r.y = r3(r.y - t);
        r.d = r3(r.d + t);
      } else {
        if (side > 0) r.x = r3(r.x - t);
        r.w = r3(r.w + t);
      }
      s.dead = true;
      merged++;
      break;
    }
  }
  return { rooms: out.filter((r) => !r.dead).map(({ dead, ...r }) => r), merged };
}

/**
 * L 形房间（id 和 id-2，同类型）的两块之间不砌墙：buildWalls 在两个不同 id 的房间之间都会砌墙（两边都是开放类型除外），
 * 所以在整条共边上放一个「打通」—— 除非图上那里真的有墙（wallInk 的比例 > 0.6）。→ { openings, opened }
 */
export function openLParts(rooms, openings, { ink = null, mPerPx = 0, dx = 0, dy = 0, uid = defaultUid } = {}) {
  const out = [...openings];
  let opened = 0;
  const E = 0.02;
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (a.type !== b.type || partBase(a, rooms) !== partBase(b, rooms)) continue;
      if (ROOM_TYPES[a.type]?.open) continue; // 开放类型之间本来就不砌墙
      let e = null;
      const ox = [Math.max(a.x, b.x), Math.min(a.x + a.w, b.x + b.w)];
      const oy = [Math.max(a.y, b.y), Math.min(a.y + a.d, b.y + b.d)];
      if ((Math.abs(a.x + a.w - b.x) < E || Math.abs(b.x + b.w - a.x) < E) && oy[1] - oy[0] > 0.05) e = { axis: 'y', c: Math.abs(a.x + a.w - b.x) < E ? b.x : a.x, a: oy[0], b: oy[1] };
      else if ((Math.abs(a.y + a.d - b.y) < E || Math.abs(b.y + b.d - a.y) < E) && ox[1] - ox[0] > 0.05) e = { axis: 'x', c: Math.abs(a.y + a.d - b.y) < E ? b.y : a.y, a: ox[0], b: ox[1] };
      if (!e) continue;
      if (ink?.mask && mPerPx > 0 && wallInk(ink, mPerPx, e, { dx, dy, search: 0.1 }).frac > 0.6) continue;
      const horiz = e.axis === 'x';
      // 那条边上已有的门窗 / 打通：先拿掉（整条都打通）
      for (let k = out.length - 1; k >= 0; k--) {
        const o = out[k];
        const oh = Math.abs(o.y1 - o.y2) < 1e-6;
        if (oh !== horiz) continue;
        const c = oh ? o.y1 : o.x1;
        const [p, q] = oh ? [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)] : [Math.min(o.y1, o.y2), Math.max(o.y1, o.y2)];
        if (Math.abs(c - e.c) < 0.03 && Math.min(q, e.b) - Math.max(p, e.a) > 0.05) out.splice(k, 1);
      }
      out.push(horiz ? { id: uid('o'), kind: 'open', x1: r3(e.a), x2: r3(e.b), y1: r3(e.c), y2: r3(e.c) } : { id: uid('o'), kind: 'open', x1: r3(e.c), x2: r3(e.c), y1: r3(e.a), y2: r3(e.b) });
      opened++;
    }
  return { openings: out, opened };
}

/**
 * 房间框铺法（低清）丢掉的门：AI 的门落在一个房间的中间（房间框画大了，盖住了门口的凹位 —— 老板 TYPE B 的大门在厨房框里）。
 * 图上门那里有一条墙线、门有开启弧线（doorSwing ok）→ 沿那条墙线把房间切开：门开向的那边是屋里；另一边那一块
 * （墙线有墨的那一段 × 到房间边）别的边上没有门 = 门口的凹位 → 不要（屋外）；还有门 = 另一个房间（玄关）。门留在墙线上。
 * 看不到弧线：门吸到最近的墙线（房间边 0.35 m 内），标 review。→ { rooms, openings（救回来的门）, split, review }
 */
export function rescueDoors(rooms, lost, ink, mPerPx, { dx = 0, dy = 0, uid = defaultUid, aiOpenings = [] } = {}) {
  let out = rooms;
  const kept = [];
  let split = 0;
  let review = 0;
  if (!ink?.mask || !(mPerPx > 0)) return { rooms, openings: kept, split, review };
  for (const o of lost || []) {
    if (o.kind !== 'door' && o.kind !== 'slider') continue;
    const horiz = Math.abs(o.x2 - o.x1) >= Math.abs(o.y2 - o.y1);
    const axis = horiz ? 'x' : 'y';
    const c0 = horiz ? (o.y1 + o.y2) / 2 : (o.x1 + o.x2) / 2;
    const [a, b] = horiz ? [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)] : [Math.min(o.y1, o.y2), Math.max(o.y1, o.y2)];
    if (b - a < 0.4) continue;
    const w = wallInk(ink, mPerPx, { axis, c: c0, a: a - 0.6, b: b + 0.6 }, { dx, dy, search: 0.3 });
    const beside = Math.max(w.at(a - 0.6, a - 0.05), w.at(b + 0.05, b + 0.6));
    if (beside < 0.5) continue; // 门旁边没有墙：不是门（或者框歪太多）
    const c = w.c;
    const mid = (a + b) / 2;
    const at = horiz ? { x: mid, y: c } : { x: c, y: mid };
    const R = out.find((r) => at.x > r.x + 0.05 && at.x < r.x + r.w - 0.05 && at.y > r.y + 0.05 && at.y < r.y + r.d - 0.05);
    // 照片 / 扫描：门扇的线不一定连得那么好 → 门扇 ≥ 0.6 + 弧线 ≥ 0.3 + 墙上真的有缺口 也算
    const sw = o.kind === 'door' ? doorSwing(ink, mPerPx, { axis, c, a, b }, { dx, dy, minLeaf: 0.6, peaks: 3 }) : { ok: false };
    const gapHere = w.at(a + (b - a) * 0.2, b - (b - a) * 0.2) < 0.4;
    const swing = { ...sw, ok: sw.ok || (sw.arc >= 0.3 && sw.leaf >= 0.6 && gapHere) };
    if (R && swing.ok) {
      // 墙线在这个房间里有墨的那一段（从门往两边走）
      const [lo, hi] = horiz ? [R.x, R.x + R.w] : [R.y, R.y + R.d];
      const run = wallInk(ink, mPerPx, { axis, c, a: lo, b: hi }, { dx, dy, search: 0.04 });
      let ra = a;
      let rb = b;
      while (ra - 0.1 >= lo - 1e-6 && run.at(ra - 0.1, ra) >= 0.5) ra -= 0.1;
      while (rb + 0.1 <= hi + 1e-6 && run.at(rb, rb + 0.1) >= 0.5) rb += 0.1;
      if (ra - lo < 0.2) ra = lo;
      if (hi - rb < 0.2) rb = hi;
      // 门开向屋里：弧线那边（side）是屋里，另一边切出去
      const inSide = swing.side || 1;
      const [f0, f1] = horiz ? [R.y, R.y + R.d] : [R.x, R.x + R.w];
      const far = inSide > 0 ? f0 : f1; // 切出去的那块到房间的这条边
      const P = horiz ? { x: ra, y: Math.min(c, far), w: rb - ra, d: Math.abs(far - c) } : { x: Math.min(c, far), y: ra, w: Math.abs(far - c), d: rb - ra };
      if (P.w < 0.3 || P.d < 0.3) continue;
      // 切出去那块：别的边上还有 AI 读到的门 / 开口 → 是一个房间（玄关，真正的大门在外面）；没有 → 门口的凹位（屋外，不要）
      const onP = (q) => {
        if (q === o) return false;
        const qh = Math.abs(q.x2 - q.x1) >= Math.abs(q.y2 - q.y1);
        const qc = qh ? (q.y1 + q.y2) / 2 : (q.x1 + q.x2) / 2;
        const [qa, qb] = qh ? [Math.min(q.x1, q.x2), Math.max(q.x1, q.x2)] : [Math.min(q.y1, q.y2), Math.max(q.y1, q.y2)];
        const edgesP = [
          [true, P.y, P.x, P.x + P.w],
          [true, P.y + P.d, P.x, P.x + P.w],
          [false, P.x, P.y, P.y + P.d],
          [false, P.x + P.w, P.y, P.y + P.d],
        ].filter(([h, ec]) => !(h === horiz && Math.abs(ec - c) < 0.05));
        return edgesP.some(([h, ec, ea, eb]) => h === qh && Math.abs(qc - ec) < 0.3 && Math.min(qb, eb) - Math.max(qa, ea) > 0.2);
      };
      const enclosed = (aiOpenings || []).some((q) => q.kind !== 'window' && onP(q));
      const rest = subtractRect(R, P);
      const base = R.id;
      const pieces = rest.sort((p, q) => q.w * q.d - p.w * p.d).map((q, n) => ({ ...R, ...q, x: r3(q.x), y: r3(q.y), w: r3(q.w), d: r3(q.d), id: n ? `${base}-${n + 1}` : base }));
      if (enclosed) pieces.push({ id: uid('r'), type: 'foyer', name: '', label: '', x: r3(P.x), y: r3(P.y), w: r3(P.w), d: r3(P.d) });
      out = [...out.filter((r) => r !== R), ...pieces];
      const da = Math.max(a, ra);
      const db = Math.min(b, rb);
      kept.push(horiz ? { ...o, x1: r2(da), x2: r2(db), y1: r3(c), y2: r3(c), arc: true, rescued: true } : { ...o, x1: r3(c), x2: r3(c), y1: r2(da), y2: r2(db), arc: true, rescued: true });
      split++;
      continue;
    }
    // 没有弧线：墙上真的有门那么宽的缺口 → 吸到最近的墙线（房间边），标出来让设计师看；墙是连着的 = AI 多加的，不要
    if (!gapHere) continue;
    const moved = horiz ? { ...o, y1: c, y2: c } : { ...o, x1: c, x2: c };
    const sn = snapOpenings(out, [moved], 0.35);
    if (sn.openings.length) {
      kept.push({ ...sn.openings[0], review: true });
      review++;
    }
  }
  return { rooms: out, openings: kept, split, review };
}

/** 矩形 r 减掉 s → 0–4 块矩形（米） */
function subtractRect(r, s) {
  const ix0 = Math.max(r.x, s.x);
  const iy0 = Math.max(r.y, s.y);
  const ix1 = Math.min(r.x + r.w, s.x + s.w);
  const iy1 = Math.min(r.y + r.d, s.y + s.d);
  if (ix1 - ix0 <= 1e-6 || iy1 - iy0 <= 1e-6) return [{ x: r.x, y: r.y, w: r.w, d: r.d }];
  // 两种切法：先横切（上下整条）/ 先竖切（左右整列）。挑最大那块的短边更长的那种
  // （例：厨房框盖住门口凹位 → 横切只剩两条 1.3 m 的细条，竖切留一块 2.4 × 2.6 m、放得下台面）
  const h = [];
  if (iy0 > r.y) h.push({ x: r.x, y: r.y, w: r.w, d: iy0 - r.y });
  if (iy1 < r.y + r.d) h.push({ x: r.x, y: iy1, w: r.w, d: r.y + r.d - iy1 });
  if (ix0 > r.x) h.push({ x: r.x, y: iy0, w: ix0 - r.x, d: iy1 - iy0 });
  if (ix1 < r.x + r.w) h.push({ x: ix1, y: iy0, w: r.x + r.w - ix1, d: iy1 - iy0 });
  const v = [];
  if (ix0 > r.x) v.push({ x: r.x, y: r.y, w: ix0 - r.x, d: r.d });
  if (ix1 < r.x + r.w) v.push({ x: ix1, y: r.y, w: r.x + r.w - ix1, d: r.d });
  if (iy0 > r.y) v.push({ x: ix0, y: r.y, w: ix1 - ix0, d: iy0 - r.y });
  if (iy1 < r.y + r.d) v.push({ x: ix0, y: iy1, w: ix1 - ix0, d: r.y + r.d - iy1 });
  const ok = (l) => l.filter((q) => q.w > 0.05 && q.d > 0.05);
  const short = (l) => {
    const b = l.reduce((m, q) => (!m || q.w * q.d > m.w * m.d ? q : m), null);
    return b ? Math.min(b.w, b.d) : 0;
  };
  const [H, V] = [ok(h), ok(v)];
  return short(V) > short(H) + 0.05 ? V : H;
}

/** 一楼（或单独的一户）有没有大门：围合部分的外墙（外面 = 没有房间 / 车廊）上有门或推拉门通进屋里的房间 */
export function hasEntrance(floor) {
  const indoor = (r) => r && !ROOM_TYPES[r.type]?.outdoor && r.type !== 'void';
  const outside = (r) => !r || r.type === 'porch';
  for (const w of buildWalls(floor)) {
    const ok = (indoor(w.neg) && outside(w.pos)) || (indoor(w.pos) && outside(w.neg));
    if (ok && w.pieces.some((p) => p.kind === 'door' || p.kind === 'slider')) return true;
  }
  return false;
}

/**
 * 图上围出来、AI 却没认出名字的房间（gap）：≥ 6 ㎡、两边都 ≥ 2 m、外墙上有窗 → 多半是卧室（AI 漏了 BEDROOM 2）→ 卧室，标 review；
 * 小的照旧（储物间 / 走廊）。→ { rooms, unnamed（没认出名字的房间数） }
 */
export function guessUnnamed(rooms, openings) {
  let unnamed = 0;
  const out = rooms.map((r) => {
    if (!r.gap || r.type === 'stair') return r;
    const big = r.w * r.d >= 6 && Math.min(r.w, r.d) >= 2;
    // 这个房间的边上、另一边没有房间（或是阳台 / 车廊）的窗
    const winOut = (openings || []).some((o) => {
      if (o.kind !== 'window') return false;
      const horiz = Math.abs(o.y1 - o.y2) < 1e-6;
      const c = horiz ? o.y1 : o.x1;
      const mid = horiz ? (o.x1 + o.x2) / 2 : (o.y1 + o.y2) / 2;
      const onEdge = horiz ? (Math.abs(c - r.y) < 0.05 || Math.abs(c - r.y - r.d) < 0.05) && mid > r.x && mid < r.x + r.w : (Math.abs(c - r.x) < 0.05 || Math.abs(c - r.x - r.w) < 0.05) && mid > r.y && mid < r.y + r.d;
      if (!onEdge) return false;
      const outSide = horiz ? (Math.abs(c - r.y) < 0.05 ? -1 : 1) : Math.abs(c - r.x) < 0.05 ? -1 : 1;
      const p = horiz ? { x: mid, y: c + outSide * 0.1 } : { x: c + outSide * 0.1, y: mid };
      const q = roomAt(rooms, p.x, p.y);
      return !q || !!ROOM_TYPES[q.type]?.outdoor;
    });
    if (big && winOut) {
      unnamed++;
      return { ...r, type: 'bedroom', name: '', review: true };
    }
    if (r.type === 'store' && !r.name) unnamed++;
    return r;
  });
  return { rooms: out, unnamed };
}

/** 房间改过以后：门窗只留在还是房间边（或外墙）上的；落在楼梯框里面 / 房间中间的去掉 */
export function keepOnEdges(rooms, openings) {
  const E = 0.03;
  return openings.filter((o) => {
    const horiz = Math.abs(o.y1 - o.y2) < 1e-6;
    const c = horiz ? o.y1 : o.x1;
    const [a, b] = horiz ? [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)] : [Math.min(o.y1, o.y2), Math.max(o.y1, o.y2)];
    const mid = (a + b) / 2;
    // 门窗中点两边（各 0.05 m）是不是同一个房间本体 → 在房间中间
    const p = horiz ? { x: mid, y: c - 0.05 } : { x: c - 0.05, y: mid };
    const q = horiz ? { x: mid, y: c + 0.05 } : { x: c + 0.05, y: mid };
    const rp = roomAt(rooms, p.x, p.y);
    const rq = roomAt(rooms, q.x, q.y);
    if (!rp && !rq) return false;
    if (rp && rq && (rp === rq || partBase(rp, rooms) === partBase(rq, rooms))) return false;
    // 至少要贴着一个房间的边
    return rooms.some((r) => (horiz ? Math.abs(r.y - c) < E || Math.abs(r.y + r.d - c) < E : Math.abs(r.x - c) < E || Math.abs(r.x + r.w - c) < E));
  });
}

/** 读出来的楼层的天花高 / 楼层高（马来西亚双层排屋：一楼 3.0 / 3.35，楼上 2.9 / 3.2；单层 2.8 / 3.15） */
const FLOOR_H = (i, n) => (n > 1 ? { ceil: i === 0 ? 3.0 : 2.9, height: i === 0 ? 3.35 : 3.2 } : { ceil: 2.8, height: 3.15 });

/** assemblePlan 的核心：按给定比例把每层变成米、铺好、自下而上对齐、配楼梯 */
function buildFloors(input, mPerPx, uid, opts) {
  const floors = [];
  let aligned = null;
  // 楼梯要爬的高度 = 这一层的楼层高（和 assemblePlan 给的一样）；最上一层没有往上的楼梯 → 0
  const riseOf = (i) => (i + 1 < input.length ? FLOOR_H(i, input.length).height : 0);
  for (let i = 0; i < input.length; i++) {
    const f = input[i];
    if (!f.read) {
      // 没读到（跳过 / 自己描）：只有底图，摆在下一层的同一个位置（同一页、同一个像素比例）
      const prev = floors[floors.length - 1];
      floors.push({ level: f.level, title: f.title, page: f.page, box: f.box, src: f.src, cropW: f.cropW, cropH: f.cropH, imgH: f.imgH, dx: prev?.dx || 0, dy: prev?.dy || 0, rooms: [], openings: [], fixes: null, wallsReport: null, stairs: [], arrivals: [] });
      continue;
    }
    const m = readToMetres(f.read, f.cropW, f.cropH, mPerPx, uid);
    const fuse = opts.fuse && f.walls && f.walls.quality?.score >= (opts.fuseMin ?? 0.6) ? opts.fuse : null;
    // rooms / m 都在这一层对齐以后的坐标里：图上的点 = 裁图像素 × mPerPx + (dx, dy)
    const layout = (rooms, dx = 0, dy = 0) => {
      const t = tileRooms(rooms, { footprint: m.footprint, snap: 0.2 });
      let rejected = null;
      if (fuse) {
        try {
          const r = fuse({ m: { ...m, rooms }, rooms: rooms.filter((q) => !q.pin), walls: f.walls, mPerPx, dx, dy, cropW: f.cropW, cropH: f.cropH, pins: rooms.filter((q) => q.pin), uid });
          // 两个来源要对得上（图上的墙 vs AI 的房间框）：外框差 > 8 %、或者一半以上的房间对不上 → 不信墙，用房间框
          const agree = r && Array.isArray(r.rooms) && r.rooms.length ? roomsAgree(r.rooms, t.rooms) : { ok: false, why: 'empty' };
          if (agree.ok) {
            // 细条并给邻居（楼上钉住的楼梯间不动）
            const pins = rooms.filter((q) => q.pin);
            const wallAt = f.ink ? (seg) => wallInk(f.ink, mPerPx, seg, { dx, dy, search: 0.05 }).frac : null;
            const cs = cleanSlivers(r.rooms, { locked: (q) => q.type === 'stair' && pins.some((p) => iouRect(p, q) > 0.5), wallAt });
            // 楼梯复查：墙优先把楼梯切成几块 / 跑不下 / 和 AI 的楼梯框对不上 → 用 AI 的框（吸到图上的墙）
            const aiStairs = m.stairs.length ? m.stairs : rooms.filter((q) => q.type === 'stair' && !q.pin);
            const fx = fixStairs(cs.rooms, aiStairs, { walls: f.walls, ink: f.ink, mPerPx, dx, dy, rise: riseOf(i), uid });
            // 开放空间里 L 形房间细的那一块 → 并给旁边的开放空间
            const thin = absorbThinParts(fx.rooms, { wallAt });
            let fusedOpenings = r.openings || [];
            if (fx.replaced || thin.merged) fusedOpenings = keepOnEdges(thin.rooms, fusedOpenings);
            // AI 说有门、图上也看得到门（开启弧线 + 门扇，或者墙上真的有缺口），墙优先却没放 → 放回去（两个来源都同意的门不丢）
            const back = f.ink ? restoreDoors(thin.rooms, fusedOpenings, m.openings, f.ink, mPerPx, { dx, dy, uid }) : { openings: fusedOpenings, restored: 0 };
            // L 形房间两块之间：图上没有墙 → 打通
            const lp = openLParts(thin.rooms, back.openings, { ink: f.ink, mPerPx, dx, dy, uid });
            return { ...r, rooms: thin.rooms, openings: lp.openings, fused: true, wallsReport: { ...(r.wallsReport || {}), agree: agree.score, slivers: cs.merged + thin.merged, stairFixed: fx.replaced ? fx.why : null, doorsRestored: back.restored, doorsRemoved: Math.max(0, (r.wallsReport?.doorsDropped || 0) - back.restored) } };
          }
          rejected = agree.why;
        } catch {
          rejected = 'error'; // 墙读坏了：退回按房间框铺
        }
      }
      // 开放空间里 L 形房间细的那一块 → 并给旁边的开放空间（编辑器就不会说「太小了」）
      const thinT = absorbThinParts(t.rooms, { wallAt: f.ink ? (seg) => wallInk(f.ink, mPerPx, seg, { dx, dy, search: 0.05 }).frac : null });
      const so = snapOpenings(thinT.rooms, m.openings);
      let openings = so.openings;
      let tRooms = thinT.rooms;
      // 落在房间中间、没有墙边可放的门（房间框盖住了门口的凹位）：图上有门 → 沿墙线切开房间，门留下
      const rescue = f.ink ? rescueDoors(tRooms, so.lost, f.ink, mPerPx, { dx, dy, uid, aiOpenings: m.openings }) : null;
      if (rescue && (rescue.split || rescue.review)) {
        tRooms = rescue.rooms;
        openings = [...(rescue.split ? keepOnEdges(tRooms, openings) : openings), ...rescue.openings];
      }
      let ink = null;
      if (f.ink) {
        const ic = inkCheck(tRooms, openings, f.ink, mPerPx, { dx, dy, srcPxPerM: 1 / (mPerPx * (f.srcScale || 1)) });
        openings = ic.openings;
        ink = ic.report;
      } else {
        // 没有图的像素：至少把落在开放空间之间（不会有墙）的门窗去掉
        const ic = inkCheck(tRooms, openings, { mask: null }, mPerPx);
        openings = ic.openings;
      }
      // L 形房间两块之间：图上没有墙 → 打通（没有图：一律打通）
      const lp = openLParts(tRooms, openings, { ink: f.ink, mPerPx, dx, dy, uid });
      openings = lp.openings;
      const wr = ink || rejected ? { wallsDetected: null, openConnections: (ink?.openConnections || 0) + lp.opened, doorsDropped: ink ? ink.doorsDropped + ink.offWall : 0, doorsAdded: 0, doorsRescued: rescue?.split || 0, doorsReview: rescue?.review || 0, lowQuality: true, quality: f.walls?.quality?.score ?? null, rejected } : null;
      return { rooms: tRooms, openings, fixes: { ...t.report, openingsDropped: so.dropped - (rescue ? rescue.split + rescue.review : 0) + (ink ? ink.doorsDropped + ink.offWall : 0), ink }, wallsReport: wr };
    };
    let dx = 0;
    let dy = 0;
    let lay;
    if (!floors.length || !floors[floors.length - 1].rooms.length) lay = layout(m.rooms);
    else {
      const lower = floors[floors.length - 1];
      const first = layout(m.rooms);
      const a = alignFloors(lower, { rooms: first.rooms });
      dx = a.dx;
      dy = a.dy;
      if (!aligned || a.by === 'walls') aligned = a.by;
      // 移过去以后：楼梯间对上下层的楼梯 → 用下层的矩形（钉住），再重新铺一次
      const rooms = m.rooms.map((r) => shiftRoom(r, dx, dy));
      m.openings = m.openings.map((o) => shiftOpening(o, dx, dy));
      m.stairs = m.stairs.map((s) => shiftRoom(s, dx, dy));
      if (m.footprint) m.footprint = shiftRoom(m.footprint, dx, dy);
      // 下层的楼梯间：上层有对得上的 → 用下层的矩形；没有、又不是从更下面上来的到达口 → 在上层补一个楼梯间
      const pinned = [];
      for (const ls of lower.rooms.filter((r) => r.type === 'stair')) {
        let best = null;
        for (const r of rooms)
          if (r.type === 'stair' && !r.pin) {
            const v = iouRect(ls, r);
            if (v >= 0.3 && (!best || v > best.v)) best = { r, v };
          }
        if (best) Object.assign(best.r, { x: ls.x, y: ls.y, w: ls.w, d: ls.d, pin: true });
        else if (!lower.arrivals.some((q) => iouRect(q, ls) > 0.5)) rooms.push({ id: uid('r'), type: 'stair', name: '', label: '', x: ls.x, y: ls.y, w: ls.w, d: ls.d, pin: true });
        else continue;
        pinned.push(ls);
      }
      lay = layout(rooms, dx, dy);
      lay.arrivals = pinned;
    }
    floors.push({ level: f.level, title: f.title, page: f.page, box: f.box, src: f.src, cropW: f.cropW, cropH: f.cropH, imgH: f.imgH, dx, dy, rooms: lay.rooms, openings: lay.openings, fixes: lay.fixes, wallsReport: lay.wallsReport, stairs: m.stairs, arrivals: lay.arrivals || [] });
  }
  // 楼梯：相邻两层配对（钉过的矩形两层完全一样）
  const st = stairsFromRooms(floors.map((f, i) => ({ id: i, rooms: f.rooms, stairs: f.stairs, rise: riseOf(i) })));
  tidyStairRooms(floors, st);
  floors.forEach((f, i) => {
    if (!f.rooms.length) return;
    const pins = st.filter((s) => s.from === i || s.to === i);
    const sn = snapEdges(f.rooms, f.openings, { pins });
    // 图上围出来、AI 没认出名字的房间：大、外墙有窗 → 卧室（标 review）
    const gu = guessUnnamed(sn.rooms, sn.openings);
    f.rooms = gu.rooms;
    f.openings = sn.openings;
    f.unnamed = gu.unnamed;
  });
  return { floors, aligned, stairs: st };
}

// ───────────── 图像（纯：ImageData 一样的 { width, height, data }） ─────────────

/**
 * 截图去掉手机 / 浏览器 / PDF 阅读器的外框：找两边留白处的阅读器底色（≥ 70 % 的最外 1 % 列，不是白、低饱和），
 * 纸的范围 = 底色 < 50 % 的行 / 列；在第一条两边都是底色的行（状态栏下面）和最后一条（网址栏上面）之间。找不到 → null。
 */
export function trimChrome(img) {
  const { width: W, height: H, data } = img || {};
  if (!W || !H || !data) return null;
  const mW = Math.max(2, Math.round(W * 0.01));
  const px = (x, y) => {
    const i = (y * W + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  // 两边留白最多的颜色（量化到 16 级）
  const hist = new Map();
  let total = 0;
  for (let y = 0; y < H; y++)
    for (const x of [...Array(mW).keys(), ...Array.from({ length: mW }, (_, i) => W - 1 - i)]) {
      const [r, g, b] = px(x, y);
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      hist.set(key, (hist.get(key) || 0) + 1);
      total++;
    }
  let best = -1;
  let cnt = 0;
  for (const [k, c] of hist) if (c > cnt) [best, cnt] = [k, c];
  if (best < 0) return null;
  // 同一个颜色附近（±1 级）都算
  let near = 0;
  const bq = [(best >> 8) & 15, (best >> 4) & 15, best & 15];
  for (const [k, c] of hist) if (Math.abs(((k >> 8) & 15) - bq[0]) <= 1 && Math.abs(((k >> 4) & 15) - bq[1]) <= 1 && Math.abs((k & 15) - bq[2]) <= 1) near += c;
  if (near / total < 0.7) return null;
  // 真实颜色 = 这些像素的平均
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sn = 0;
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < mW; x++) {
      const [r, g, b] = px(x, y);
      if (Math.abs((r >> 4) - bq[0]) <= 1 && Math.abs((g >> 4) - bq[1]) <= 1 && Math.abs((b >> 4) - bq[2]) <= 1) {
        sr += r;
        sg += g;
        sb += b;
        sn++;
      }
    }
  if (!sn) return null;
  const bg = [sr / sn, sg / sn, sb / sn];
  const lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
  const sat = Math.max(...bg) - Math.min(...bg);
  if (lum > 238 || sat > 40) return null; // 白底（就是纸）/ 有颜色的：不是阅读器
  const isBg = (x, y) => {
    const i = (y * W + x) * 4;
    return Math.abs(data[i] - bg[0]) <= 20 && Math.abs(data[i + 1] - bg[1]) <= 20 && Math.abs(data[i + 2] - bg[2]) <= 20;
  };
  // 状态栏 / 网址栏：两边留白都是底色的第一行、最后一行
  const marginBg = (y) => {
    let l = 0;
    let r = 0;
    for (let x = 0; x < mW; x++) {
      if (isBg(x, y)) l++;
      if (isBg(W - 1 - x, y)) r++;
    }
    return l >= mW * 0.6 && r >= mW * 0.6;
  };
  let top = -1;
  let bot = -1;
  for (let y = 0; y < H; y++)
    if (marginBg(y)) {
      top = y;
      break;
    }
  for (let y = H - 1; y >= 0; y--)
    if (marginBg(y)) {
      bot = y;
      break;
    }
  if (top < 0 || bot - top < H * 0.2) return null;
  const rowFrac = new Float32Array(H);
  for (let y = top; y <= bot; y++) {
    let c = 0;
    for (let x = 0; x < W; x += 2) if (isBg(x, y)) c++;
    rowFrac[y] = c / Math.ceil(W / 2);
  }
  let y0 = -1;
  let y1 = -1;
  for (let y = top; y <= bot; y++)
    if (rowFrac[y] < 0.5) {
      if (y0 < 0) y0 = y;
      y1 = y;
    }
  if (y0 < 0) return null;
  let x0 = -1;
  let x1 = -1;
  for (let x = 0; x < W; x++) {
    let c = 0;
    let n = 0;
    for (let y = y0; y <= y1; y += 2) {
      n++;
      if (isBg(x, y)) c++;
    }
    if (c / n < 0.5) {
      if (x0 < 0) x0 = x;
      x1 = x;
    }
  }
  if (x0 < 0) return null;
  const rect = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  if (rect.w * rect.h < W * H * 0.08 || (rect.w * rect.h > W * H * 0.97)) return null;
  // 中间被底色隔开的几页（PDF 阅读器一页接一页）
  const bands = [];
  let s = -1;
  for (let y = y0; y <= y1 + 1; y++) {
    const content = y <= y1 && rowFrac[y] < 0.5;
    if (content && s < 0) s = y;
    if (!content && s >= 0) {
      if (y - s > 20) bands.push({ y: s, h: y - s });
      s = -1;
    }
  }
  return { ...rect, bands, bg: bg.map(Math.round) };
}

/**
 * 截图 / 照片变清楚一点：亮度拉开（第 1 – 99 百分位 → 0–255），轻微去色（灰底的蓝绿色偏去掉）。返回新的图（不改原图）。
 */
export function enhance(img, { desat = 0.5, lo = 0.01, hi = 0.99 } = {}) {
  const { width: W, height: H, data } = img;
  const n = W * H;
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    hist[(0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) | 0]++;
  }
  const pct = (p) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= p * n) return v;
    }
    return 255;
  };
  let a = pct(lo);
  let b = pct(hi);
  if (b - a < 16) {
    a = 0;
    b = 255;
  }
  const k = 255 / (b - a);
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const y = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    for (let c = 0; c < 3; c++) {
      const v = data[j + c] * (1 - desat) + y * desat;
      out[j + c] = (v - a) * k;
    }
    out[j + 3] = data[j + 3];
  }
  return { width: W, height: H, data: out };
}

// ───────────── 拍歪的照片：找横线、竖线 → 两个消失点 → 透视矫正（纯函数） ─────────────
//
// 手机拍纸本的平面图：纸和手机不平行 → 竖墙往上收（梯形）、横墙微微斜。墙、尺寸线、轴线都是长直线：
// 只在「接近竖」「接近横」的 ±12° 里做 Hough，找出几十条长线，各自交出一个消失点（最小二乘，3×3 特征向量，无穷远也行），
// 消失线送到无穷远（投影）+ 两个方向转成 x / y 轴（仿射），中心的局部比例不变。墙就横平竖直了，walls.js 和 AI 的框都准。

/** 亮度（RGBA / RGB / 灰度） */
function lumArray(img) {
  const { width: W, height: H, data } = img;
  const n = W * H;
  const ch = Math.max(1, Math.round(data.length / n));
  const L = new Uint8Array(n);
  if (ch === 1) L.set(data.subarray ? data.subarray(0, n) : data.slice(0, n));
  else for (let i = 0, j = 0; i < n; i++, j += ch) L[i] = (data[j] * 77 + data[j + 1] * 151 + data[j + 2] * 28) >> 8;
  return L;
}

/** 墨迹：比附近的纸色暗 28 % 以上（纸色 = 3×3 块里最亮的；照片的纸是灰的、不均匀） */
export function inkMask(img, { dark = 0.72 } = {}) {
  const { width: W, height: H } = img;
  const L = lumArray(img);
  const B = Math.max(12, Math.round(Math.min(W, H) / 40));
  const bw = Math.ceil(W / B);
  const bh = Math.ceil(H / B);
  const bmax = new Uint8Array(bw * bh);
  for (let y = 0; y < H; y++) {
    const r = ((y / B) | 0) * bw;
    for (let x = 0; x < W; x++) {
      const v = L[y * W + x];
      const k = r + ((x / B) | 0);
      if (v > bmax[k]) bmax[k] = v;
    }
  }
  const paper = new Uint8Array(bw * bh);
  for (let j = 0; j < bh; j++)
    for (let i = 0; i < bw; i++) {
      let m = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const a = i + di;
          const b = j + dj;
          if (a >= 0 && b >= 0 && a < bw && b < bh && bmax[b * bw + a] > m) m = bmax[b * bw + a];
        }
      paper[j * bw + i] = m;
    }
  const M = new Uint8Array(W * H);
  let ink = 0;
  for (let y = 0; y < H; y++) {
    const r = ((y / B) | 0) * bw;
    for (let x = 0; x < W; x++) {
      const p = paper[r + ((x / B) | 0)];
      if (p > 40 && L[y * W + x] < p * dark) {
        M[y * W + x] = 1;
        ink++;
      }
    }
  }
  return { mask: M, width: W, height: H, ink };
}

/** 3×3 对称矩阵最小特征值的特征向量（Jacobi） */
function smallestEigvec(A) {
  const a = A.map((r) => [...r]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let it = 0; it < 50; it++) {
    let p = 0;
    let q = 1;
    let mx = Math.abs(a[0][1]);
    if (Math.abs(a[0][2]) > mx) [p, q, mx] = [0, 2, Math.abs(a[0][2])];
    if (Math.abs(a[1][2]) > mx) [p, q, mx] = [1, 2, Math.abs(a[1][2])];
    if (mx < 1e-15) break;
    const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const tt = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
    const c = 1 / Math.sqrt(tt * tt + 1);
    const s = tt * c;
    for (let k = 0; k < 3; k++) {
      const akp = a[k][p];
      const akq = a[k][q];
      a[k][p] = c * akp - s * akq;
      a[k][q] = s * akp + c * akq;
    }
    for (let k = 0; k < 3; k++) {
      const apk = a[p][k];
      const aqk = a[q][k];
      a[p][k] = c * apk - s * aqk;
      a[q][k] = s * apk + c * aqk;
    }
    for (let k = 0; k < 3; k++) {
      const vkp = v[k][p];
      const vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq;
      v[k][q] = s * vkp + c * vkq;
    }
  }
  let m = 0;
  for (let k = 1; k < 3; k++) if (a[k][k] < a[m][m]) m = k;
  return [v[0][m], v[1][m], v[2][m]];
}

/**
 * 一族接近竖（fam 'v'）或接近横（'h'）的长直线：Hough（法线式 x·cosθ + y·sinθ = ρ），θ 在 ±maxDeg 里，步长 step°。
 * → [{ theta, rho, votes, a, b }]（a / b = 线上墨迹的头尾，沿线方向的像素坐标）
 */
export function houghLines(ink, fam, { maxDeg = 12, step = 0.12, minFrac = 0.16, max = 40 } = {}) {
  const { mask, width: W, height: H } = ink;
  const nA = Math.round((2 * maxDeg) / step) + 1;
  const base = fam === 'v' ? 0 : 90;
  const cs = new Float32Array(nA);
  const sn = new Float32Array(nA);
  for (let i = 0; i < nA; i++) {
    const t = ((base - maxDeg + i * step) * Math.PI) / 180;
    cs[i] = Math.cos(t);
    sn[i] = Math.sin(t);
  }
  const R = Math.ceil(Math.hypot(W, H)) + 2;
  const nR = 2 * R + 1;
  const acc = new Int32Array(nA * nR);
  // 只用「墨迹的边」：竖线族用左右有一边是纸的像素（横线族：上下），省时间，粗墙的两条边各成一条线
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      if (fam === 'v' ? mask[i - 1] && mask[i + 1] : mask[i - W] && mask[i + W]) continue;
      for (let a = 0; a < nA; a++) acc[a * nR + Math.round(x * cs[a] + y * sn[a]) + R]++;
    }
  const len = fam === 'v' ? H : W;
  const minV = Math.max(20, Math.round(minFrac * len));
  const peaks = [];
  for (let a = 0; a < nA; a++)
    for (let r = 1; r < nR - 1; r++) {
      const v = acc[a * nR + r];
      if (v < minV) continue;
      let ok = true;
      for (let da = -2; da <= 2 && ok; da++)
        for (let dr = -2; dr <= 2; dr++) {
          if (!da && !dr) continue;
          const b = a + da;
          if (b < 0 || b >= nA) continue;
          const w = acc[b * nR + r + dr];
          if (w > v || (w === v && (da < 0 || (da === 0 && dr < 0)))) {
            ok = false;
            break;
          }
        }
      if (ok) peaks.push({ a, r: r - R, votes: v });
    }
  peaks.sort((p, q) => q.votes - p.votes);
  // 同一条线附近（±1.5°、±6 px）只留最强的
  const keep = [];
  for (const p of peaks) {
    if (keep.some((q) => Math.abs(q.a - p.a) * step <= 1.5 && Math.abs(q.r - p.r) <= 6)) continue;
    keep.push(p);
    if (keep.length >= max) break;
  }
  return keep.map((p) => {
    const theta = ((base - maxDeg + p.a * step) * Math.PI) / 180;
    // 线上墨迹的范围（沿线方向）
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = -R; t <= R; t += 2) {
      const x = Math.round(p.r * c - t * s);
      const y = Math.round(p.r * s + t * c);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (mask[y * W + x] || (x + 1 < W && mask[y * W + x + 1]) || (y + 1 < H && mask[(y + 1) * W + x])) {
        if (t < lo) lo = t;
        if (t > hi) hi = t;
      }
    }
    return { theta, rho: p.r, votes: p.votes, a: lo, b: hi };
  });
}

/** 一族线的消失点（齐次坐标，归一化像素：(x − cx) / s）。lines 太少 / 太集中 → null */
function vanishing(lines, cx, cy, s) {
  if (lines.length < 3) return null;
  const L = lines.map((l) => {
    const c = Math.cos(l.theta);
    const sn = Math.sin(l.theta);
    return { v: [c, sn, -(l.rho - cx * c - cy * sn) / s], w: l.votes, l };
  });
  let use = L;
  let V = null;
  for (let it = 0; it < 3; it++) {
    const M = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (const { v, w } of use) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += w * v[i] * v[j];
    V = smallestEigvec(M);
    // 离群的线（和消失点差 > 0.35°）不要，再算一次
    const res = (q) => {
      // 线到消失点的角度残差：消失点方向 vs 线的方向
      const [a, b, c] = q.v;
      const dir = [-b, a];
      const mid = [-a * c, -b * c]; // 线上离原点最近的点
      let d = [V[0] - mid[0] * V[2], V[1] - mid[1] * V[2]];
      const n = Math.hypot(d[0], d[1]) || 1;
      d = [d[0] / n, d[1] / n];
      return Math.asin(Math.min(1, Math.abs(dir[0] * d[1] - dir[1] * d[0])));
    };
    const next = use.filter((q) => res(q) < (0.35 * Math.PI) / 180);
    if (next.length === use.length || next.length < 3) break;
    use = next;
  }
  return { V, used: use.length };
}

/**
 * 照片的透视：→ { H（原图像素 → 矫正后像素，3×3 行优先）, Hinv, width, height, significant, tiltV, tiltH, lines }，没把握 → null。
 * significant = 矫正以后角上的点移动超过图宽的 0.4 %（不明显就不矫正，PDF 截图之类的直接用）。
 */
export function rectifyEstimate(img, opts = {}) {
  const W = img.width;
  const H = img.height;
  if (!W || !H) return null;
  const ink = opts.ink || inkMask(img);
  if (ink.ink < 200) return null;
  const vl = houghLines(ink, 'v', opts);
  const hl = houghLines(ink, 'h', opts);
  const cx = W / 2;
  const cy = H / 2;
  const s = Math.max(W, H) / 2;
  const deg = (r) => (r * 180) / Math.PI;
  // 线的角度要分得开（跨过图的一半以上）才敢算透视；否则只算平均转角
  const spread = (ls, fam) => {
    if (ls.length < 2) return 0;
    const pos = ls.map((l) => (fam === 'v' ? l.rho / Math.cos(l.theta) : l.rho / Math.sin(l.theta)));
    return (Math.max(...pos) - Math.min(...pos)) / (fam === 'v' ? W : H);
  };
  const meanDir = (ls) => {
    const w = ls.reduce((t, l) => t + l.votes, 0);
    return ls.reduce((t, l) => t + l.theta * l.votes, 0) / (w || 1);
  };
  if (vl.length < 2 || hl.length < 2) return null;
  const persp = (ls, fam) => {
    const vp = spread(ls, fam) >= 0.45 ? vanishing(ls, cx, cy, s) : null;
    if (vp && vp.used >= 3) return vp.V;
    // 平行：消失点在无穷远，方向 = 平均方向
    const t = meanDir(ls);
    return [-Math.sin(t), Math.cos(t), 0];
  };
  let V1 = persp(vl, 'v'); // 竖线族（方向 ≈ (0, 1)）
  let V2 = persp(hl, 'h'); // 横线族（方向 ≈ (1, 0)）
  // 消失线 l = V1 × V2；消失点太近（< 1.2 倍图大小）→ 不像是纸（可能读错线）→ 只用平均方向
  const near = (V) => Math.abs(V[2]) > 1e-9 && Math.hypot(V[0] / V[2], V[1] / V[2]) < 2.4;
  if (near(V1)) V1 = [-Math.sin(meanDir(vl)), Math.cos(meanDir(vl)), 0];
  if (near(V2)) V2 = [-Math.sin(meanDir(hl)), Math.cos(meanDir(hl)), 0];
  let l = [V1[1] * V2[2] - V1[2] * V2[1], V1[2] * V2[0] - V1[0] * V2[2], V1[0] * V2[1] - V1[1] * V2[0]];
  if (Math.abs(l[2]) < 1e-12) l = [0, 0, 1];
  l = [l[0] / l[2], l[1] / l[2], 1];
  if (Math.hypot(l[0], l[1]) > 0.6) l = [0, 0, 1]; // 消失线穿过图附近：不合理
  // P：消失线 → 无穷远（归一化坐标）
  const P = [
    [1, 0, 0],
    [0, 1, 0],
    [l[0], l[1], 1],
  ];
  const mul = (A, v) => [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]];
  const dirOf = (V) => {
    const p = mul(P, V);
    let d = [p[0], p[1]];
    const n = Math.hypot(d[0], d[1]) || 1;
    return [d[0] / n, d[1] / n];
  };
  let u1 = dirOf(V1); // 竖
  let u2 = dirOf(V2); // 横
  if (u1[1] < 0) u1 = [-u1[0], -u1[1]];
  if (u2[0] < 0) u2 = [-u2[0], -u2[1]];
  const det = u2[0] * u1[1] - u1[0] * u2[1];
  if (Math.abs(det) < 0.5) return null; // 两族线几乎平行：读错了
  // A = [u2 u1]⁻¹：u2 → x 轴、u1 → y 轴，长度不变（中心的局部比例不变）
  const A = [
    [u1[1] / det, -u1[0] / det],
    [-u2[1] / det, u2[0] / det],
  ];
  // 归一化像素 → … → 输出（先不平移），再按四个角定输出范围
  const N = [
    [1 / s, 0, -cx / s],
    [0, 1 / s, -cy / s],
    [0, 0, 1],
  ];
  const AP = [
    [A[0][0], A[0][1], 0],
    [A[1][0], A[1][1], 0],
    [0, 0, 1],
  ];
  const mm = (X, Y) => X.map((r, i) => [0, 1, 2].map((j) => r[0] * Y[0][j] + r[1] * Y[1][j] + r[2] * Y[2][j]));
  const Sback = [
    [s, 0, 0],
    [0, s, 0],
    [0, 0, 1],
  ];
  let Hm = mm(Sback, mm(AP, mm(P, N)));
  const apply = (M, x, y) => {
    const p = mul(M, [x, y, 1]);
    return [p[0] / p[2], p[1] / p[2]];
  };
  const corners = [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
  ].map(([x, y]) => apply(Hm, x, y));
  const x0 = Math.min(...corners.map((c) => c[0]));
  const y0 = Math.min(...corners.map((c) => c[1]));
  const x1 = Math.max(...corners.map((c) => c[0]));
  const y1 = Math.max(...corners.map((c) => c[1]));
  const T = [
    [1, 0, -x0],
    [0, 1, -y0],
    [0, 0, 1],
  ];
  Hm = mm(T, Hm);
  const outW = Math.round(x1 - x0);
  const outH = Math.round(y1 - y0);
  if (!(outW > 0 && outH > 0) || outW * outH > W * H * 2.5) return null;
  // 角上的点移动多少（去掉平移以后）：判断要不要矫正
  const c0 = apply(Hm, cx, cy);
  let moved = 0;
  for (const [x, y] of [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
  ]) {
    const p = apply(Hm, x, y);
    moved = Math.max(moved, Math.hypot(p[0] - c0[0] - (x - cx), p[1] - c0[1] - (y - cy)));
  }
  const inv = invert3(Hm);
  if (!inv) return null;
  const tilt = (ls) => (ls.length ? Math.max(...ls.map((q) => Math.abs(deg(q.theta) - (q.theta > 0.8 ? 90 : 0)))) : 0);
  return {
    H: Hm.flat(),
    Hinv: inv.flat(),
    width: outW,
    height: outH,
    significant: moved > 0.004 * Math.max(W, H) && moved > 2,
    moved: r2(moved),
    tiltV: r2(tilt(vl)),
    tiltH: r2(tilt(hl)),
    lines: { v: vl.length, h: hl.length },
  };
}

function invert3(M) {
  const [a, b, c] = M[0];
  const [d, e, f] = M[1];
  const [g, h, i] = M[2];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

/** 点过 3×3 矩阵（行优先 9 个数） */
export function applyH(Hf, x, y) {
  const w = Hf[6] * x + Hf[7] * y + Hf[8];
  return [(Hf[0] * x + Hf[1] * y + Hf[2]) / w, (Hf[3] * x + Hf[4] * y + Hf[5]) / w];
}

/**
 * 按 Hinv（输出像素 → 原图像素）把图拉正：双线性取样，出了原图 = 白。
 * out = { width, height }，scale = 输出像素 / 矫正坐标（> 1 放大）。返回新的 RGBA 图。
 */
export function warpImage(img, Hinv, outW, outH, { scale = 1 } = {}) {
  const { width: W, height: H, data } = img;
  const ch = Math.max(1, Math.round(data.length / (W * H)));
  const out = new Uint8ClampedArray(outW * outH * 4);
  const [a, b, c, d, e, f, g, h, i] = Hinv;
  const k = 1 / scale;
  for (let v = 0; v < outH; v++) {
    const yy = (v + 0.5) * k;
    for (let u = 0; u < outW; u++) {
      const xx = (u + 0.5) * k;
      const w = g * xx + h * yy + i;
      const sx = (a * xx + b * yy + c) / w - 0.5;
      const sy = (d * xx + e * yy + f) / w - 0.5;
      const o = (v * outW + u) * 4;
      if (sx < 0 || sy < 0 || sx > W - 1 || sy > H - 1) {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 255;
        continue;
      }
      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const x1 = Math.min(W - 1, x0 + 1);
      const y1 = Math.min(H - 1, y0 + 1);
      const p00 = (y0 * W + x0) * ch;
      const p10 = (y0 * W + x1) * ch;
      const p01 = (y1 * W + x0) * ch;
      const p11 = (y1 * W + x1) * ch;
      for (let q = 0; q < 3; q++) {
        const qq = ch === 1 ? 0 : q;
        const top = data[p00 + qq] * (1 - fx) + data[p10 + qq] * fx;
        const bot = data[p01 + qq] * (1 - fx) + data[p11 + qq] * fx;
        out[o + q] = top * (1 - fy) + bot * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { width: outW, height: outH, data: out };
}

/** 设计师填的已知尺寸（6.1 / 6100 / 20' / 20 ft）→ 米；读不懂 → null */
export function knownMetres(text) {
  const s = String(text ?? '').trim();
  // 只填数字、小于 40：是米（6 → 6 m）；其他照图上的写法（6100、20'、20 ft）
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) < 40) return Number(s) >= 0.3 ? Number(s) : null;
  const mm = parseDimText(s);
  return mm ? mm / 1000 : null;
}

/**
 * 没有 AI（客人版没有 key、或者设计师选「自己框」）：每层只有底图。设计师沿外墙框出每一层（house = 裁图里的框，像素）；
 * 比例 = 一楼框的宽 = widthM（没填 → 按形状猜）；每层的框左上角对齐到 (0, 0)。
 * floors: [{ level, title, cropW, cropH, src, page, box, house: { x0, y0, x1, y1 } }] → { plan, underlays, report }
 */
export function manualPlan(floorsIn, { widthM = null, name = '' } = {}) {
  const floors = (floorsIn || []).filter((f) => f && f.src && f.house);
  if (!floors.length) return { plan: migratePlan(null), underlays: {}, report: { manual: true, scale: null, warnings: [] } };
  const g = floors[0].house;
  const gw = Math.max(1, g.x1 - g.x0);
  const gh = Math.max(1, g.y1 - g.y0);
  const guessed = !(widthM > 0);
  // 整体宽 = 一楼框的左右宽；没填 → 短边按形状猜（排屋 6.1 m…）
  const k = guessed ? guessWidth(Math.max(gw, gh) / Math.min(gw, gh)) / Math.min(gw, gh) : widthM / gw;
  const multi = floors.length > 1;
  const ids = new Set();
  const plan = migratePlan({
    v: 2,
    name,
    north: 0,
    floors: floors.map((f, i) => {
      let id = LEVEL_IDS[f.level] || `f${i}`;
      while (ids.has(id)) id = `${id}${i}`;
      ids.add(id);
      f.id = id;
      return { id, level: i, name: '', ceil: multi ? (i ? 2.9 : 3.0) : 2.8, height: multi ? (i ? 3.2 : 3.35) : 3.15, rooms: [], openings: [], meta: { import: { page: f.page ?? 1, box: f.box || null, scale: +k.toPrecision(6), title: f.title || '' } } };
    }),
    stairs: [],
  });
  const underlays = {};
  for (const f of floors) underlays[f.id] = { src: f.src, x: r3(-f.house.x0 * k), y: r3(-f.house.y0 * k), w: r3(f.cropW * k), h: r3(f.cropH * k), opacity: 0.55, iw: f.cropW, ih: f.cropH };
  return { plan, underlays, report: { manual: true, scale: { source: guessed ? 'guess' : 'known', widthM: r2(gw * k), depthM: r2(gh * k), mPerPx: k }, warnings: [] } };
}
