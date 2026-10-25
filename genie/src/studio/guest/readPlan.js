// 客人的户型图 → 平面图（SPEC §5.4）—— 设计师的「上传平面图」（ImportFlow）那一条流水线，去掉所有要人点的地方：
//   最准（这台设备设置过读图的 key：展厅 iPad、设计师电脑）：打开 → 选页（PDF 的文字层；扫描件让模型看所有页）→ 找出每一层的图
//     → 按同一个比例裁图 → 每一层读房间 / 门窗 / 尺寸 → 图上的墙（walls.js）对照 → 拼成多层平面图（sheet.js assemblePlan）。
//   粗读（没有 key：客人自己的手机）：只用图上的墙（walls.js extractWalls）—— 比例按「你的家」答的大小估（sq ft × 0.0929 ÷ 层数 = 一层的面积），
//     墙围出来的面 = 房间，房间类型按大小猜 → status 'rough'，R 屏请客人点一下改名字。
//   墙读得太差（quality < 0.45）或什么都没读到 → 'unreadable'（原图仍然留给设计师，handoff.putPlanFile）。
// 客人看得到的文字（issues[].zh、进度）永远不提 AI、key、模型、设置。
//
// readPlan(file, { hint, onProgress, signal, ai, img, settings }) →
//   { status:'ok'|'rough'|'unreadable'|'cancelled'|'error', source:'ai'|'cv'|null, plan, underlays, confidence, summary, issues, ms }
// ai（测试注入）：{ findPlans(settings, image, opts), readFloors(settings, items, opts), findPlanPagesAI?(settings, sheet, opts) }，形状和 plan/ai.js 一样；
//   ai: false = 只用粗读。img（测试注入）：planImage.js 的那几个函数（openPlanFile、renderPage、renderRegion、cropPixels、cvWalls、
//   findPlanPagesText、contactSheet、closePlanFile）。

import { loadSettings } from '../store.js';
import { migratePlan, ROOM_TYPES, carveFloor, FLOOR_NAMES } from '../plan/model.js';

/** 客人在 R 屏能改成的房间类型 */
export const GUEST_ROOM_TYPES = ['living', 'dining', 'kitchen', 'master', 'bedroom', 'kids', 'study', 'bath', 'foyer', 'balcony', 'utility', 'store', 'walkin', 'family'];

/** 一层大约要读多久（秒）—— 进度条和「大约还要 {0} 秒」 */
export const SEC_PER_FLOOR = 45;
const SEC_FIND = 12;
/** 墙读得比这个差 → 读不清 */
export const QUALITY_MIN = 0.45;
const SQFT_PER_M2 = 10.7639;

/** 这台设备能不能用最准的方式读（展厅 iPad / 设计师电脑上设置过 key） */
export function canReadWithAI() {
  try {
    return !!loadSettings().apiKey;
  } catch {
    return false;
  }
}

const LEVELS = ['ground', 'mezzanine', 'first', 'second', 'third', 'roof', 'other'];
const order = (lv) => (LEVELS.indexOf(lv) < 0 ? 99 : LEVELS.indexOf(lv));
const now = () => Date.now();
const cancelled = (signal) => !!signal?.aborted;
class Cancel extends Error {
  constructor() {
    super('cancel');
    this.code = 'cancel';
  }
}
const check = (signal) => {
  if (cancelled(signal)) throw new Cancel();
};
const tick = () => new Promise((r) => setTimeout(r, 0));

/** 平面图的数字：几层、几个房间、几房几卫、室内面积（sq ft） */
export function planSummary(plan) {
  if (!plan?.floors?.length) return { floors: 0, rooms: 0, bedrooms: 0, bathrooms: 0, areaSqft: 0 };
  const rooms = plan.floors.flatMap((f) => f.rooms || []).filter((r) => !r.stairId && r.type !== 'stair' && r.type !== 'void');
  // L 形房间的几块（id、id-2…）算一间
  const one = new Map();
  for (const r of rooms) one.set(`${r.type}:${String(r.id).replace(/-\d+$/, '')}`, r);
  const list = [...one.values()];
  const indoor = rooms.filter((r) => !ROOM_TYPES[r.type]?.outdoor);
  const area = indoor.reduce((s, r) => s + (r.w || 0) * (r.d || 0), 0);
  return {
    floors: plan.floors.length,
    rooms: list.filter((r) => r.type !== 'corridor').length,
    bedrooms: list.filter((r) => r.type === 'master' || r.type === 'bedroom' || r.type === 'kids').length,
    bathrooms: list.filter((r) => r.type === 'bath').length,
    areaSqft: Math.round((area * SQFT_PER_M2) / 10) * 10,
  };
}

const result = (status, extra = {}) => ({
  status,
  source: null,
  plan: null,
  underlays: null,
  confidence: 0,
  summary: { floors: 0, rooms: 0, bedrooms: 0, bathrooms: 0, areaSqft: 0 },
  issues: [],
  ...extra,
});

/** 一份 PDF 最多读几页（每一页当一层或几层）、一个家最多几层 */
export const MAX_PAGES = 4;
const MAX_FLOORS = 4;
const okStatus = (r) => !!r && (r.status === 'ok' || r.status === 'rough') && !!r.plan?.floors?.some((f) => f.rooms?.length);
const wantFloorsOf = (hint) => Math.max(0, Math.min(MAX_FLOORS, Math.round(Number(hint?.storeys) || 0)));

/**
 * 要读哪几页（按页码）→ [{ page, levels }]。客人说只有一层 → 只读最像平面图的那一页（和以前一样）；
 * 两层以上 / 没说：每一页像平面图的都读（PDF 的文字层分数 ≥ 5；扫描件让模型看所有页；都没有 → 前几页都试，读不清的页会被跳过）。
 */
async function planPages(src, { IMG, AIM, set, useAI, signal, prog, hint }) {
  if (src.kind !== 'pdf' || !(src.pages > 1)) return [{ page: 1, levels: [] }];
  const want = wantFloorsOf(hint);
  const cap = want === 1 ? 1 : Math.min(MAX_PAGES, want ? want + 1 : MAX_PAGES);
  prog('pages', 8, { etaSec: useAI ? SEC_FIND + SEC_PER_FLOOR : 6 });
  const info = await IMG.findPlanPagesText(src);
  check(signal);
  const byPage = (list) => list.slice(0, cap).sort((a, b) => a.page - b.page).map((p) => ({ page: p.page, levels: Array.isArray(p.levels) ? p.levels : [] }));
  const scored = [...(info?.pages || [])].filter((p) => p.score >= 5).sort((a, b) => b.score - a.score || a.page - b.page);
  if (scored.length) return byPage(scored);
  if (useAI && !info?.hasText && AIM.findPlanPagesAI && IMG.contactSheet) {
    try {
      const sheet = await IMG.contactSheet(src);
      const pages = sheet ? await AIM.findPlanPagesAI(set, sheet, { pages: src.pages, signal }) : [];
      if (pages?.length) return byPage(pages);
    } catch (e) {
      if (e?.code === 'cancel') throw new Cancel();
    }
  }
  if (!info?.hasText && cap > 1) return Array.from({ length: Math.min(cap, src.pages) }, (_, i) => ({ page: i + 1, levels: [] }));
  return [{ page: 1, levels: [] }];
}

/**
 * 读客人的户型图。hint = planHint(home)：{ type, sizeSqft, bedrooms, bathrooms, storeys }。
 * onProgress({ stage:'open'|'pages'|'find'|'read'|'walls'|'assemble'|'done', pct, floor, floors, etaSec })。
 * 多页的 PDF（一楼一页、二楼一页）：每一页读成一层（或几层），按图名的楼层（GROUND / FIRST…）或页码自下而上叠好（stackPlans）。
 */
export async function readPlan(file, { hint = {}, onProgress, signal, ai, img, settings } = {}) {
  const t0 = now();
  const prog = (stage, pct, extra = {}) => {
    try {
      onProgress?.({ stage, pct: Math.max(0, Math.min(100, Math.round(pct))), floor: 0, floors: 0, etaSec: 0, ...extra });
    } catch {
      /* 界面的事 */
    }
  };
  const done = (r) => {
    prog('done', 100);
    const { levels, scaleInfo, ...out } = r;
    return { ...out, ms: now() - t0 };
  };
  let src = null;
  let IMG = img;
  try {
    if (!file) return done(result('error', { issues: [{ code: 'nofile', zh: '这张图打不开' }] }));
    IMG = IMG || (await import('../plan/planImage.js'));
    const set = settings || loadSettings();
    let AIM = ai;
    if (AIM === undefined) AIM = set?.apiKey ? await import('../plan/ai.js') : null;
    const useAI = !!AIM;
    prog('open', 3, { etaSec: useAI ? SEC_FIND + SEC_PER_FLOOR : 6 });
    src = await IMG.openPlanFile(file);
    check(signal);
    // ── 选页 ──
    const pages = await planPages(src, { IMG, AIM, set, useAI, signal, prog, hint });
    check(signal);
    const n = pages.length;
    const want = wantFloorsOf(hint);
    const perPage = useAI ? SEC_FIND + SEC_PER_FLOOR : 5;
    const parts = [];
    let bad = null;
    let carry = null; // 粗读：第一页的比例（PDF 单位 / 米）带给后面几页，几层一样大
    for (let i = 0; i < n; i++) {
      // 一页的进度（0–100）→ 整份的进度；只有一页时不变
      const sub =
        n === 1
          ? prog
          : (stage, pct, extra = {}) => prog(stage, 10 + ((i + Math.max(0, Math.min(100, pct)) / 100) / n) * 85, { ...extra, floor: i + 1, floors: n, etaSec: (extra.etaSec || 0) + (n - i - 1) * perPage });
      const page = await IMG.renderPage(src, pages[i].page);
      check(signal);
      if (!page) continue;
      let r = null;
      if (useAI) r = await readAI({ src, page, IMG, AIM, set, signal, prog: sub, hint });
      check(signal);
      // 多页时：模型在这一页没找到平面图（立面、剖面、封面）而别的页读到了 → 这一页不算，不再粗读
      // 粗读猜房间类型要知道这是第几层（一楼有客厅、厨房；楼上是卧室、起居厅）
      const floorNo = (Number(hint.floor) || 0) + parts.reduce((s, p) => s + p.r.plan.floors.length, 0);
      const floorsAll = Math.max(n, want, floorNo + 1);
      if (!r && !(useAI && n > 1 && parts.some((p) => p.r.source === 'ai'))) r = await readCV({ src, page, IMG, signal, prog: sub, hint: { ...hint, floor: floorNo, floors: floorsAll }, carry });
      check(signal);
      if (okStatus(r)) {
        if (r.source === 'cv' && r.scaleInfo?.unitPerM > 0) carry = carry || r.scaleInfo;
        // 楼层：模型找图时认出来的；没有 → 这一页的文字只写到一层时用它（写到好几层的页，例如「楼梯通往 FIRST FLOOR」，不算）
        parts.push({ r, page: pages[i].page, levels: r.levels?.length ? r.levels : pages[i].levels.length === 1 ? pages[i].levels : [] });
      } else if (!bad) bad = r;
      if (want > 1 && parts.reduce((s, p) => s + p.r.plan.floors.length, 0) >= want) break;
    }
    if (!parts.length) return done(bad || result('error', { issues: [{ code: 'open', zh: '这张图打不开' }] }));
    if (parts.length === 1) return done(withFloorsIssue(parts[0].r, hint));
    return done(withFloorsIssue(await combineParts(parts, hint), hint));
  } catch (e) {
    if (e?.code === 'cancel' || cancelled(signal)) return done(result('cancelled'));
    return done(result('error', { issues: [{ code: 'open', zh: '这张图打不开，换一张试试？（JPG、PNG、PDF 都可以）' }] }));
  } finally {
    try {
      IMG?.closePlanFile?.(src);
    } catch {
      /* 关不掉也没关系 */
    }
  }
}

// ───────────────────────── 几页 / 几张 → 一个几层的家 ─────────────────────────

const r2m = (v) => Math.round(v * 100) / 100;
const LV_IDX = (lv) => (lv === 'other' || LEVELS.indexOf(lv) < 0 ? 99 : LEVELS.indexOf(lv));
const MULTI_H = (i) => (i === 0 ? { ceil: 3.0, height: 3.35 } : { ceil: 2.9, height: 3.2 }); // 和 sheet.js 读出来的两层一样

/**
 * 几份平面图（自下而上：一楼那一份在前）叠成一个家：上面那一份的最下一层对齐到下面那一份的最上一层（sheet.js alignFloors：
 * 楼梯对楼梯 / 外墙对外墙），两份交界处的楼梯间配成一座楼梯（stairsFromRooms），楼上被楼梯压到的房间挖开。
 * parts: [{ plan, underlays }] → { plan, underlays }（plan 是 v2；楼层、房间、楼梯的 id 都不重复；底图跟着楼层的位移走）。
 */
export async function stackPlans(parts) {
  const list = (parts || []).filter((p) => p?.plan?.floors?.some((f) => f.rooms?.length));
  if (!list.length) return { plan: null, underlays: {} };
  if (list.length === 1) return { plan: migratePlan(list[0].plan), underlays: list[0].underlays || {} };
  const S = await import('../plan/sheet.js');
  const floors = [];
  const stairs = [];
  const underlays = {};
  const fids = new Set();
  let sn = 0;
  const nextStairId = () => {
    let id;
    do id = `s${++sn}`;
    while (stairs.some((s) => s.id === id));
    return id;
  };
  for (const part of list) {
    const p = migratePlan(part.plan);
    const below = floors[floors.length - 1] || null;
    let dx = 0;
    let dy = 0;
    if (below) {
      const a = S.alignFloors({ rooms: below.rooms }, { rooms: p.floors[0].rooms.filter((r) => !r.stairId || r.type === 'stair') });
      dx = a.dx || 0;
      dy = a.dy || 0;
    }
    const idMap = {};
    const sidMap = {};
    for (const s of p.stairs || []) sidMap[s.id] = nextStairId();
    const first = floors.length;
    for (const f of p.floors) {
      if (floors.length >= MAX_FLOORS) break;
      let id = f.id && !fids.has(f.id) ? f.id : `f${floors.length}`;
      while (fids.has(id)) id = `${id}b`;
      fids.add(id);
      idMap[f.id] = id;
      const pre = first === 0 ? '' : `${id}-`;
      const rid = (x) => (pre && !String(x).startsWith(pre) ? `${pre}${x}` : x);
      floors.push({
        ...f,
        id,
        name: '',
        rooms: f.rooms.map((r) => ({ ...r, id: r.stairId ? r.id : rid(r.id), ...(r.stairId ? { stairId: sidMap[r.stairId] || r.stairId } : {}), x: r2m(r.x + dx), y: r2m(r.y + dy) })),
        openings: (f.openings || []).map((o) => ({ ...o, id: rid(o.id), x1: r2m(o.x1 + dx), x2: r2m(o.x2 + dx), y1: r2m(o.y1 + dy), y2: r2m(o.y2 + dy) })),
      });
      const u = part.underlays?.[f.id];
      if (u) underlays[id] = { ...u, x: r2m((u.x || 0) + dx), y: r2m((u.y || 0) + dy) };
    }
    for (const s of p.stairs || []) {
      if (!idMap[s.from] || (s.to && !idMap[s.to])) continue;
      stairs.push({ ...s, id: sidMap[s.id], from: idMap[s.from], to: s.to ? idMap[s.to] : null, x: r2m(s.x + dx), y: r2m(s.y + dy) });
    }
    // 两份交界：下面最上一层的楼梯间（不是从更下面上来的到达口）↔ 这一份最下一层的楼梯间
    const up = floors[first];
    if (below && up) {
      const arrivals = new Set(stairs.filter((s) => s.to === below.id).map((s) => s.id));
      const lo = below.rooms.filter((r) => r.type === 'stair' && !(r.stairId && arrivals.has(r.stairId)) && !stairs.some((s) => s.from === below.id && r.stairId === s.id));
      const hi = up.rooms.filter((r) => r.type === 'stair');
      if (lo.length) {
        const loIds = new Set(lo.map((r) => r.id));
        const st = S.stairsFromRooms([
          // 下面那一层：候选的楼梯间留着（去掉旧的楼梯编号），到达口当走廊（不往上），别的房间照旧（猜往哪边上要用）
          { id: 0, rooms: below.rooms.map((r) => (loIds.has(r.id) ? { ...r, stairId: undefined } : r.type === 'stair' ? { ...r, type: 'corridor', stairId: undefined } : r)), stairs: [], rise: MULTI_H(floors.indexOf(below)).height },
          { id: 1, rooms: [...up.rooms.filter((r) => r.type !== 'stair'), ...hi.map((r) => ({ ...r, stairId: undefined }))], stairs: [] },
        ]);
        for (const s of st) {
          const { matched, review, from, to, ...g } = s;
          const rect = { x: g.x, y: g.y, w: g.w, d: g.d };
          // 楼上：对得上的楼梯间拿掉（换成楼梯），别的房间被楼梯压到的挖开
          const iou = (a) => {
            const ox = Math.min(a.x + a.w, rect.x + rect.w) - Math.max(a.x, rect.x);
            const oy = Math.min(a.y + a.d, rect.y + rect.d) - Math.max(a.y, rect.y);
            return ox > 0 && oy > 0 ? (ox * oy) / (a.w * a.d + rect.w * rect.d - ox * oy) : 0;
          };
          const carved = carveFloor({ ...up, rooms: up.rooms.filter((r) => !(r.type === 'stair' && iou(r) >= 0.3)) }, rect);
          up.rooms = carved.rooms;
          stairs.push({ ...g, id: nextStairId(), from: below.id, to: up.id });
        }
      }
    }
  }
  const plan = migratePlan({
    v: 2,
    name: list[0].plan.name || '',
    north: Number(list[0].plan.north) || 0,
    floors: floors.map((f, i) => ({ ...f, level: i, ...MULTI_H(i) })),
    stairs,
  });
  return { plan, underlays };
}

/** 读到的几层（自下而上）：一楼、二楼…（客人看的名字，和编辑器的楼层标签一样） */
export function floorsRead(plan) {
  return (plan?.floors || []).map((f, i) => ({ id: f.id, zh: FLOOR_NAMES[i] || FLOOR_NAMES[FLOOR_NAMES.length - 1], rooms: (f.rooms || []).filter((r) => !r.stairId && r.type !== 'stair').length }));
}

/** 客人说有几层、读到几层：少了 → issues 加一句（R 屏「你说两层，我只读到一层」，再拍下一层） */
function withFloorsIssue(r, hint) {
  if (!okStatus(r)) return r;
  const want = wantFloorsOf(hint);
  const got = r.plan.floors.length;
  const issues = (r.issues || []).filter((x) => x.code !== 'floors');
  if (want > got) issues.push({ code: 'floors', zh: '你说有 {0} 层，我只读到 {1} 层', vars: [want, got], want, got });
  return { ...r, summary: planSummary(r.plan), issues };
}

/** 几页读出来的结果 → 一个结果（叠好的平面图、最低的把握、合并的提示） */
async function combineParts(parts0, hint) {
  // 都知道是哪一层 → 按层排；不知道 → 按页码。同一层出现两次（两种户型各一页、同一层画了两遍）→ 留先读到的那页
  const known = parts0.every((p) => p.levels?.length && p.levels.every((l) => LV_IDX(l) < 99));
  let parts = [...parts0];
  if (known) {
    const taken = new Set();
    parts = parts
      .sort((a, b) => Math.min(...a.levels.map(LV_IDX)) - Math.min(...b.levels.map(LV_IDX)) || a.page - b.page)
      .filter((p) => {
        if (p.levels.every((l) => taken.has(l))) return false;
        p.levels.forEach((l) => taken.add(l));
        return true;
      });
  }
  if (parts.length === 1) return parts[0].r;
  const { plan, underlays } = await stackPlans(parts.map((p) => ({ plan: p.r.plan, underlays: p.r.underlays })));
  if (!plan) return parts[0].r;
  const rough = parts.some((p) => p.r.status === 'rough');
  const confidence = Math.round(Math.min(...parts.map((p) => p.r.confidence || 0)) * 100) / 100;
  const seen = new Set();
  const issues = [];
  for (const p of parts)
    for (const i of p.r.issues || []) {
      if (i.code === 'bedrooms' || seen.has(i.code)) continue;
      seen.add(i.code);
      issues.push(i);
    }
  const summary = planSummary(plan);
  if (hint?.bedrooms && summary.bedrooms && Number(hint.bedrooms) !== summary.bedrooms) issues.push({ code: 'bedrooms', zh: '房间数和你说的不一样' });
  return result(rough ? 'rough' : 'ok', { source: parts.some((p) => p.r.source === 'ai') ? 'ai' : 'cv', plan, underlays, confidence, summary, issues });
}

/**
 * 「再拍下一层」：已经读好的家（readPlan 的结果，或客人在 R 屏改过名字的 { plan, underlays }）+ 新读的一张（下一层）→ 叠在上面。
 * next 读不出来 → 原样还回去（status 不变），由界面说「这一张我读不清」。hint 同 readPlan（用来对层数）。
 */
export async function appendFloor(base, next, { hint = {} } = {}) {
  if (!okStatus(next)) return base;
  if (!okStatus(base)) return withFloorsIssue(next, hint);
  if (base.plan.floors.length >= MAX_FLOORS) return base;
  const { plan, underlays } = await stackPlans([
    { plan: base.plan, underlays: base.underlays || {} },
    { plan: next.plan, underlays: next.underlays || {} },
  ]);
  if (!plan) return base;
  const seen = new Set();
  const issues = [...(base.issues || []), ...(next.issues || [])].filter((i) => i.code !== 'bedrooms' && i.code !== 'floors' && !seen.has(i.code) && seen.add(i.code));
  const out = result(base.status === 'rough' || next.status === 'rough' ? 'rough' : 'ok', {
    source: base.source === 'ai' || next.source === 'ai' ? 'ai' : base.source || next.source,
    plan,
    underlays,
    confidence: Math.round(Math.min(base.confidence || 0, next.confidence || 0) * 100) / 100,
    summary: planSummary(plan),
    issues,
  });
  const keep = { ...base, ...out };
  return withFloorsIssue(keep, hint);
}

// ───────────────────────── 最准：设计师那一条流水线（不用人点） ─────────────────────────

let seq = 0;
const key = () => `g${++seq}`;

async function readAI({ src, page, IMG, AIM, set, signal, prog, hint }) {
  const A = await import('../plan/sheet.js');
  const WALLS = await import('../plan/walls.js');
  // 1. 这一页上的每一张平面图
  const tFind = now();
  const findTick = setInterval(() => prog('find', 10 + Math.min(18, ((now() - tFind) / 1000 / SEC_FIND) * 18), { etaSec: Math.max(1, Math.round(SEC_FIND - (now() - tFind) / 1000)) + SEC_PER_FLOOR }), 1000);
  let found;
  try {
    prog('find', 10, { etaSec: SEC_FIND + SEC_PER_FLOOR });
    found = (await AIM.findPlans(set, page, { signal }))?.found;
  } catch (e) {
    if (e?.code === 'cancel') throw new Cancel();
    return null; // 找不到 → 退回粗读
  } finally {
    clearInterval(findTick);
  }
  check(signal);
  let plans = (found?.plans || []).filter((p) => p.include && p.level);
  // 好几户（TYPE A / TYPE B）：用平面图最多的那一户
  if ((found?.units || []).length > 1) {
    const count = (u) => plans.filter((p) => p.unit === u).length;
    const unit = [...found.units].sort((a, b) => count(b) - count(a))[0];
    plans = plans.filter((p) => !p.unit || p.unit === unit);
  }
  // 同一层两张：留大的那张
  const area = (p) => (p.box.x1 - p.box.x0) * (p.box.y1 - p.box.y0);
  const byLevel = new Map();
  for (const p of plans) if (!byLevel.has(p.level) || area(p) > area(byLevel.get(p.level))) byLevel.set(p.level, p);
  const list = [...byLevel.values()].sort((a, b) => order(a.level) - order(b.level)).map((p) => ({ ...p, key: key() }));
  if (!list.length) return null;
  // 2. 同一个比例裁图
  const crops = await IMG.renderRegion(src, page.page, list.map((c) => c.crop), page);
  check(signal);
  if (!crops?.length) return null;
  const map = {};
  list.forEach((c, i) => (map[c.key] = crops[i]));
  const hk = A.houseKind({ plans: list.map((x) => ({ ...x, include: true })), units: found.units || [] });
  const LV = { ground: 'GROUND FLOOR PLAN', first: 'FIRST FLOOR PLAN' };
  const items = list.map((c) => ({
    key: c.key,
    image: map[c.key],
    ctx: {
      title: c.title || LV[c.level] || 'FLOOR PLAN',
      level: c.level,
      houseKind: hk,
      otherTitles: [...list.filter((x) => x.key !== c.key).map((x) => x.title || x.level), ...(found.others || []).map((o) => String(o.kind || '').replace('_', ' '))].filter(Boolean),
    },
  }));
  // 3. 每一层读房间（同时最多 2 层）
  const n = items.length;
  const doneSet = new Set();
  const tRead = now();
  const eta = () => Math.max(1, Math.round((Math.ceil((n - doneSet.size) / 2) * SEC_PER_FLOOR) - ((now() - tRead) / 1000) % SEC_PER_FLOOR));
  const pctRead = () => 30 + Math.min(55, ((doneSet.size + Math.min(0.9, (now() - tRead) / 1000 / SEC_PER_FLOOR)) / n) * 55);
  prog('read', 30, { floor: 1, floors: n, etaSec: eta() });
  const readTick = setInterval(() => prog('read', pctRead(), { floor: Math.min(n, doneSet.size + 1), floors: n, etaSec: eta() }), 1000);
  let out;
  try {
    out = await AIM.readFloors(set, items, {
      signal,
      onProgress: (k, state) => {
        if (state === 'done' || state === 'error') doneSet.add(k);
        prog('read', pctRead(), { floor: Math.min(n, doneSet.size + 1), floors: n, etaSec: eta() });
      },
    });
  } catch (e) {
    if (e?.code === 'cancel') throw new Cancel();
    return null;
  } finally {
    clearInterval(readTick);
  }
  check(signal);
  const rs = {};
  (out || []).forEach((o) => (rs[o.key] = o.ok ? { state: 'done', read: o.read } : { state: 'fail' }));
  const ok = list.filter((c) => rs[c.key]?.state === 'done');
  if (!ok.length) return null;
  const floorsFor = (wallsBy = {}) =>
    ok.map((c) => {
      const cr = map[c.key];
      const px = wallsBy[c.key];
      return {
        key: c.key,
        level: c.level,
        title: c.title,
        read: rs[c.key].read,
        cropW: cr.width,
        cropH: cr.height,
        src: cr.src,
        srcScale: cr.srcScale,
        photo: !!src.photo,
        walls: px?.walls || null,
        ink: px?.ink || null,
        page: page.page,
        box: [c.crop.x0 / page.width, c.crop.y0 / page.height, c.crop.x1 / page.width, c.crop.y1 / page.height].map((v) => Math.round(v * 1e4) / 1e4),
      };
    });
  // 4. 图上的墙（后台线程；读不出来就按房间框铺）
  prog('walls', 88, { floors: n, etaSec: 3 });
  let scale = null;
  const wallsBy = {};
  try {
    scale = A.pageScale(floorsFor());
    if (scale) {
      for (const c of ok) {
        check(signal);
        await tick();
        try {
          const pix = await IMG.cropPixels(map[c.key], { aspect: scale.aspect });
          wallsBy[c.key] = await IMG.cvWalls(pix, 1 / scale.mPerPx, WALLS);
        } catch {
          wallsBy[c.key] = { ink: null, walls: null };
        }
      }
    }
  } catch (e) {
    if (e?.code === 'cancel') throw e;
    scale = null;
  }
  check(signal);
  // 5. 拼
  prog('assemble', 95, { floors: n, etaSec: 1 });
  const res = A.assemblePlan(floorsFor(wallsBy), { screenshot: !!found.screenshot || !!src.screenshot, scale: scale && scale.source !== 'guess' ? scale : null, fuse: typeof WALLS.fuseWalls === 'function' ? WALLS.fuseWalls : null });
  const plan = res.plan;
  const summary = planSummary(plan);
  if (!summary.rooms) return null;
  const rep = res.report || {};
  const srcW = { dims: 0.92, known: 0.92, doors: 0.72, guess: 0.5 }[rep.scale?.source] ?? 0.6;
  const wq = (rep.floors || []).map((f) => f.walls?.quality).filter((q) => Number.isFinite(q));
  const wallsW = wq.length ? 0.85 + 0.15 * Math.min(1, wq.reduce((a, b) => a + b, 0) / wq.length / 0.7) : 0.92;
  const warn = (code) => (rep.warnings || []).some((w) => w.code === code);
  let confidence = srcW * wallsW * (rep.overlapsLeft ? 0.85 : 1) * (rep.unnamed ? 0.92 : 1) * (warn('noEntrance') ? 0.96 : 1) * (warn('noStairs') ? 0.9 : 1);
  confidence = Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100;
  const issues = [];
  if (rep.scale?.source === 'guess') issues.push({ code: 'scale', zh: '尺寸是估的' });
  if (rep.unnamed) issues.push({ code: 'unnamed', zh: '有几处我看不太清，帮我点一下房间的名字' });
  if (hint?.bedrooms && summary.bedrooms && hint.bedrooms !== summary.bedrooms) issues.push({ code: 'bedrooms', zh: '房间数和你说的不一样' });
  const status = confidence >= QUALITY_MIN ? 'ok' : 'rough';
  return result(status, { source: 'ai', plan, underlays: res.underlays || {}, confidence, summary, issues, levels: ok.map((c) => c.level).filter((l) => l && l !== 'other') });
}

// ───────────────────────── 粗读：只用图上的墙 ─────────────────────────

/** 墨迹的外框（去掉零星的点：行 / 列的墨少于 0.4 % 不算）→ { x0, y0, x1, y1 } 或 null */
export function inkBox(ink) {
  const { mask, width: W, height: H } = ink;
  const rows = new Uint32Array(H);
  const cols = new Uint32Array(W);
  let tot = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (mask[y * W + x]) {
        rows[y]++;
        cols[x]++;
        tot++;
      }
  if (tot < 50) return null;
  const span = (arr, len, other) => {
    const thr = Math.max(2, other * 0.004);
    let a = 0;
    let b = len - 1;
    while (a < len && arr[a] < thr) a++;
    while (b > a && arr[b] < thr) b--;
    return [a, b];
  };
  const [x0, x1] = span(cols, W, H);
  const [y0, y1] = span(rows, H, W);
  if (x1 - x0 < 20 || y1 - y0 < 20) return null;
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** 一层的面积（m²）：「你的家」答的大小 ÷ 层数 */
export function footprintM2(hint = {}) {
  const sq = Number(hint.sizeSqft);
  if (!(sq > 0)) return null;
  const st = Math.max(1, Math.min(4, Number(hint.storeys) || 1));
  return (sq * 0.0929) / st;
}

const areaR = (r) => r.w * r.d;
const touches = (a, b, E = 0.06) => {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
  return (ox > 0.3 && (Math.abs(a.y + a.d - b.y) < E || Math.abs(b.y + b.d - a.y) < E)) || (oy > 0.3 && (Math.abs(a.x + a.w - b.x) < E || Math.abs(b.x + b.w - a.x) < E));
};

/**
 * 墙围出来的房间（类型还没有）→ 按大小、形状、相邻关系猜类型（都标 review: true，R 屏请客人确认）：
 * 最大的 = 客厅；又窄又长 = 走廊；很小 = 储物间；2–6.5 ㎡ = 浴室（按答的卫生间数）；7 ㎡ 以上 = 卧室（最大的是主卧，按答的房数）；
 * 挨着客厅的中等房间 = 厨房；剩下挨着客厅的 = 餐厅，其他 = 书房 / 储物间。
 * 两层以上的家（hint.floor = 第几层，0 起；hint.floors = 一共几层）：
 *   一楼 = 客厅、厨房、餐厅、一间浴室（四房以上再加一间客房）；楼上 = 起居厅（挨着楼梯的最大一间）、其余的卧室（二楼那一间最大的是主卧）、其余的浴室，没有厨房 / 餐厅。
 */
export function guessRoomTypes(rooms0, hint = {}) {
  const floors = Math.max(1, Math.round(Number(hint.floors) || Number(hint.storeys) || 1));
  const fi = Math.max(0, Math.round(Number(hint.floor) || 0));
  if (fi > 0) return guessUpper(rooms0, hint, fi, floors);
  const rooms = rooms0.map((r) => ({ ...r }));
  const free = rooms.filter((r) => r.type !== 'stair' && !r.stairId);
  // 同一间（L 形的几块）一起算：按 id 前缀
  const base = (r) => String(r.id).replace(/-\d+$/, '');
  const groups = new Map();
  for (const r of free) {
    const k = base(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const G = [...groups.values()].map((rs) => {
    const core = [...rs].sort((a, b) => areaR(b) - areaR(a))[0];
    return { rs, area: rs.reduce((s, r) => s + areaR(r), 0), min: Math.min(...rs.map((r) => Math.min(r.w, r.d))), max: Math.max(...rs.map((r) => Math.max(r.w, r.d))), coreMin: Math.min(core.w, core.d) };
  });
  const set = (g, type) => {
    g.type = type;
    for (const r of g.rs) Object.assign(r, { type, name: '', review: true });
  };
  const open = G.filter((g) => !g.type);
  for (const g of open) {
    if (g.area < 1.6) set(g, 'store');
    else if (g.area < 9 && g.rs.every((r) => Math.min(r.w, r.d) < 1.3) && g.max / Math.max(0.1, g.min) >= 2.4) set(g, 'corridor');
  }
  const rest = () => G.filter((g) => !g.type).sort((a, b) => b.area - a.area);
  const living = rest()[0];
  if (living) set(living, 'living');
  const near = (g, h) => g.rs.some((a) => h.rs.some((b) => touches(a, b)));
  // 浴室：小的、方的（几层的家：一楼一间）
  const multi = floors > 1;
  const nBath = multi ? 1 : Math.max(1, Math.min(6, Number(hint.bathrooms) || 2));
  const baths = rest()
    .filter((g) => g.area >= 1.6 && g.area <= 6.5 && g.min >= 1.1)
    .sort((a, b) => a.area - b.area)
    .slice(0, nBath);
  baths.forEach((g) => set(g, 'bath'));
  // 厨房：挨着客厅的中等房间（4–14 ㎡），没有就最近的
  const kc = rest().filter((g) => g.area >= 3.5 && g.area <= 14);
  const kitchen = kc.find((g) => living && near(g, living)) || null;
  if (kitchen) set(kitchen, 'kitchen');
  // 卧室：≥ 7 ㎡、两边都 ≥ 2.2 m
  const nBedAll = Math.max(1, Math.min(7, Number(hint.bedrooms) || 3));
  const nBed = multi ? (nBedAll >= 4 ? 1 : 0) : nBedAll;
  const beds = rest()
    .filter((g) => g.area >= 7 && g.coreMin >= 2.2)
    .slice(0, nBed);
  beds.forEach((g, i) => set(g, i === 0 && !multi ? 'master' : 'bedroom'));
  if (!kitchen) {
    const k2 = rest().find((g) => g.area >= 3.5 && g.area <= 14);
    if (k2) set(k2, 'kitchen');
  }
  for (const g of rest()) {
    if (living && near(g, living) && g.area >= 5) set(g, 'dining');
    else if (g.area >= 6 && g.coreMin >= 2) set(g, 'study');
    else set(g, 'store');
  }
  return rooms;
}

/** 楼上（第 fi 层，0 起）：楼梯旁最大的一间 = 起居厅；卧室、浴室按一楼以外的数分到每一层；没有厨房 / 餐厅 / 客厅 */
function guessUpper(rooms0, hint, fi, floors) {
  const rooms = rooms0.map((r) => ({ ...r }));
  const stairs = rooms.filter((r) => r.type === 'stair' || r.stairId);
  const free = rooms.filter((r) => r.type !== 'stair' && !r.stairId);
  const base = (r) => String(r.id).replace(/-\d+$/, '');
  const groups = new Map();
  for (const r of free) {
    const k = base(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const G = [...groups.values()].map((rs) => {
    const core = [...rs].sort((a, b) => areaR(b) - areaR(a))[0];
    return { rs, area: rs.reduce((s, r) => s + areaR(r), 0), min: Math.min(...rs.map((r) => Math.min(r.w, r.d))), max: Math.max(...rs.map((r) => Math.max(r.w, r.d))), coreMin: Math.min(core.w, core.d) };
  });
  const set = (g, type) => {
    g.type = type;
    for (const r of g.rs) Object.assign(r, { type, name: '', review: true });
  };
  for (const g of G) {
    if (g.area < 1.6) set(g, 'store');
    else if (g.area < 9 && g.rs.every((r) => Math.min(r.w, r.d) < 1.3) && g.max / Math.max(0.1, g.min) >= 2.4) set(g, 'corridor');
  }
  const rest = () => G.filter((g) => !g.type).sort((a, b) => b.area - a.area);
  const ups = Math.max(1, floors - 1);
  const nBedAll = Math.max(1, Math.min(7, Number(hint.bedrooms) || 3));
  const nBed = Math.max(1, Math.ceil((nBedAll - (nBedAll >= 4 ? 1 : 0)) / ups));
  const nBath = Math.max(1, Math.ceil((Math.max(2, Math.min(6, Number(hint.bathrooms) || 2)) - 1) / ups));
  rest()
    .filter((g) => g.area >= 1.6 && g.area <= 6.5 && g.min >= 1.1)
    .sort((a, b) => a.area - b.area)
    .slice(0, nBath)
    .forEach((g) => set(g, 'bath'));
  // 起居厅：挨着楼梯、≥ 6 ㎡ 的最大一间（卧室比它多的时候才留给它）
  const byStair = rest().filter((g) => g.area >= 6 && g.rs.some((a) => stairs.some((b) => touches(a, b))));
  if (byStair.length && rest().filter((g) => g.area >= 7 && g.coreMin >= 2.2).length > nBed) set(byStair[0], 'family');
  rest()
    .filter((g) => g.area >= 7 && g.coreMin >= 2.2)
    .slice(0, nBed)
    .forEach((g, i) => set(g, i === 0 && fi === 1 ? 'master' : 'bedroom'));
  for (const g of rest()) {
    if (g.area >= 6 && g.coreMin >= 2) set(g, byStair.includes(g) && !G.some((h) => h.type === 'family') ? 'family' : 'study');
    else if (g.area >= 2.5) set(g, 'walkin');
    else set(g, 'store');
  }
  return rooms;
}

async function readCV({ src, page, IMG, signal, prog, hint, carry = null }) {
  const A = await import('../plan/sheet.js');
  const WALLS = await import('../plan/walls.js');
  prog('walls', 20, { etaSec: 5 });
  // 1. 先在预览上找图的范围（截掉标题栏、空白）
  let rect = { x0: 0, y0: 0, x1: page.width, y1: page.height };
  try {
    const pv = await IMG.cropPixels(page);
    const box = inkBox(A.inkMask(pv));
    if (box) {
      const px = (box.x1 - box.x0) * 0.03;
      const py = (box.y1 - box.y0) * 0.03;
      rect = { x0: Math.max(0, box.x0 - px), y0: Math.max(0, box.y0 - py), x1: Math.min(page.width, box.x1 + px), y1: Math.min(page.height, box.y1 + py) };
    }
  } catch {
    /* 用整页 */
  }
  check(signal);
  const [crop] = (await IMG.renderRegion(src, page.page, [rect], page)) || [];
  check(signal);
  if (!crop) return result('unreadable', { source: 'cv', issues: [{ code: 'open', zh: '这张我读不清' }] });
  prog('walls', 40, { etaSec: 4 });
  const pix = await IMG.cropPixels(crop);
  check(signal);
  // 2. 比例：先让 walls.js 自己按墙厚 / 门宽估；墙围出来的面积和「你的家」答的大小（一层）差很多 → 按面积再校一次。
  //    自己估不出来 → 用「一层的面积 ÷ 墨迹外框的面积」（外框含尺寸线，多算 15 %）。几次里取「墙读得好 × 面积对得上」最好的。
  const fp = footprintM2(hint);
  const extract = async (k) => {
    await tick();
    check(signal);
    const r = await IMG.cvWalls(pix, k > 0 ? k : undefined, WALLS);
    return r?.walls || null;
  };
  const faceM2 = (w) => {
    const k = w?.pxPerM;
    return k > 0 && w.faces?.length ? w.faces.reduce((s, f) => s + (f.area || 0), 0) / (k * k) : 0;
  };
  const fit = (w) => (fp && faceM2(w) > 0 ? Math.exp(-Math.abs(Math.log(faceM2(w) / fp)) * 1.5) : 1);
  const rank = (w) => (w ? (w.quality?.score ?? 0) * (0.35 + 0.65 * fit(w)) * (w === wc ? 1.15 : 1) : -1);
  const cands = [];
  // 同一份 PDF 前面一页读好的比例（PDF 单位 / 米 × 这张裁图的 像素 / PDF 单位）：几层一样大，优先用
  let wc = null;
  const kc = carry?.unitPerM > 0 && crop.pxPerUnit > 0 ? carry.unitPerM * crop.pxPerUnit : 0;
  if (kc >= 8 && kc <= 600) {
    wc = await extract(kc);
    if (wc) cands.push(wc);
  }
  const w0 = await extract(0);
  if (w0) cands.push(w0);
  if (fp) {
    let k1 = 0;
    if (w0 && faceM2(w0) > 5) {
      const ratio = fp / faceM2(w0);
      if (Math.abs(ratio - 1) > 0.2 && ratio > 0.3 && ratio < 3.5) k1 = w0.pxPerM / Math.sqrt(ratio);
    } else {
      try {
        const inkB = inkBox(A.inkMask(pix));
        if (inkB) k1 = Math.sqrt(((inkB.x1 - inkB.x0) * (inkB.y1 - inkB.y0)) / (fp * 1.15));
      } catch {
        k1 = 0;
      }
    }
    if (k1 >= 8 && k1 <= 600) {
      prog('walls', 65, { etaSec: 3 });
      const w1 = await extract(k1);
      if (w1) cands.push(w1);
    }
  }
  check(signal);
  const walls = cands.sort((a, b) => rank(b) - rank(a))[0] || null;
  const q = walls?.quality?.score ?? 0;
  const k = walls?.pxPerM || 0;
  if (!walls || !(k > 0) || q < QUALITY_MIN || !walls.faces?.length) {
    return result('unreadable', { source: 'cv', confidence: Math.round(q * 100) / 100, issues: [{ code: 'quality', zh: '这张我读不清' }] });
  }
  // 3. 墙围出来的面 = 房间（类型按大小猜）
  prog('assemble', 85, { etaSec: 1 });
  const mPerPx = 1 / k;
  const fw = WALLS.fuseWalls({ m: { rooms: [], openings: [] }, walls, mPerPx, pins: [] });
  if (!fw?.rooms?.length) return result('unreadable', { source: 'cv', confidence: Math.round(q * 100) / 100, issues: [{ code: 'quality', zh: '这张我读不清' }] });
  let rooms = guessRoomTypes(
    fw.rooms.map(({ gap, label, ...r }) => r),
    hint,
  );
  const ox = Math.min(...rooms.map((r) => r.x));
  const oy = Math.min(...rooms.map((r) => r.y));
  const r2 = (v) => Math.round(v * 100) / 100;
  rooms = rooms.map((r) => ({ ...r, x: r2(r.x - ox), y: r2(r.y - oy) }));
  const openings = (fw.openings || []).map((o) => ({ ...o, x1: r2(o.x1 - ox), y1: r2(o.y1 - oy), x2: r2(o.x2 - ox), y2: r2(o.y2 - oy) }));
  const plan = migratePlan({ v: 2, name: '', north: 0, floors: [{ id: 'f0', level: 0, name: '', ceil: 2.8, height: 3.15, rooms, openings }], stairs: [] });
  const summary = planSummary(plan);
  if (summary.rooms < 2) return result('unreadable', { source: 'cv', confidence: Math.round(q * 100) / 100, issues: [{ code: 'quality', zh: '这张我读不清' }] });
  const underlays = crop.src
    ? { f0: { src: crop.src, x: r2(-ox), y: r2(-oy), w: r2(crop.width * mPerPx), h: r2(crop.height * mPerPx), opacity: 0.55, iw: crop.width, ih: crop.height } }
    : {};
  const confidence = Math.round(Math.min(0.6, q * 0.8) * 100) / 100;
  const scaleInfo = crop.pxPerUnit > 0 ? { unitPerM: k / crop.pxPerUnit } : null;
  return result('rough', { source: 'cv', plan, underlays, confidence, summary, issues: [{ code: 'labels', zh: '有几处我看不太清，帮我点一下房间的名字' }], scaleInfo });
}

// ───────────────────────── R 屏：改名字 / 不是房间 ─────────────────────────

const mapRooms = (plan, fn) => {
  const p = migratePlan(plan);
  return { ...p, floors: p.floors.map((f) => ({ ...f, rooms: fn(f.rooms, f) })) };
};
const sameRoom = (r, roomId) => r.id === roomId || String(r.id).replace(/-\d+$/, '') === String(roomId).replace(/-\d+$/, '');

/** 改一个房间的类型（L 形的几块一起改；名字清掉，显示时按类型叫；不再标 review） */
export function relabelRoom(plan, roomId, type) {
  if (!GUEST_ROOM_TYPES.includes(type)) return plan;
  return mapRooms(plan, (rooms) =>
    rooms.map((r) => {
      if (!sameRoom(r, roomId) || r.stairId) return r;
      const { review, ...rest } = r;
      return { ...rest, type, name: '' };
    }),
  );
}

/** 「不是房间」：拿掉它（楼梯间不动；落在它边上的门窗留着，buildWalls 会当外墙上的） */
export function removeRoom(plan, roomId) {
  return mapRooms(plan, (rooms) => rooms.filter((r) => !sameRoom(r, roomId) || r.stairId));
}
