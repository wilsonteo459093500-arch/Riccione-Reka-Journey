// ============================================================
// 户型图「AI 识图」→ 建议柜子（纯逻辑，Node 测试）
//
// 服务器（api/plan-ai.js）回传 AI 的读图结果，坐标 = 送去的那张缩图的像素：
//   { scale?: { a:[x,y], b:[x,y], mm }, rooms:[{ type, name, box:[x0,y0,x1,y1] }],
//     suggestions:[{ template, room, segments:[[x0,y0,x1,y1]…], confidence, note }], notes }
//   segments = 柜子靠的那几段墙线（厨房 L / U / 二字有 2–3 段，按顺序接起来）。
// 送去的图可能是原图裁过的一块（去黑边 / 白边、或业务框选的范围）：crop = { x, y, w, h }（原图 px），
//   原图 px = crop.x + 送去 px × crop.w / sentW。没有 crop = 整张图。
// 位置：可选 snap(seg, roomBox, template) 先把 AI 线段贴到图上真正的墙（wallSnap.js，送去那张图的 px）。
// 这里把它变成「可以勾选的建议」：每个建议已经是一个做好的柜子（模板尺寸）+ 图上的位置。
// 深度 / 高度一律由模板决定（AI 只给沿墙的长度），长度对齐、夹在常用范围。
// 摆放：试 4 个方向 × 墙的两种顺序，选「墙线和 AI 线段最贴合、柜门朝房间」的那个。
// 加入报价（applySuggestions）由业务勾选后才做；价钱照常由柜子尺寸算。
// ============================================================
import { newCabinet, updateSpec, cabinetWalls, nextCode } from './templates.js';
import { mmPerPx, normRot, rotPt, setPlanSize, placedFootprint } from './plan.js';

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const snapTo = (v, g) => Math.round(v / g) * g;

export const AI_TEMPLATES = ['wardrobe', 'kitchen', 'tv', 'shoe'];
export const AI_ROOM_TYPES = ['kitchen', 'master', 'bedroom', 'living', 'dining', 'entrance', 'bathroom', 'other'];
// 每段墙的常用长度（mm）：超出就夹住、写一句理由
export const AI_LIMITS = {
  wardrobe: { min: 900, max: 4000, snap: 50 },
  shoe: { min: 600, max: 2400, snap: 50 },
  tv: { min: 1500, max: 5000, snap: 50 },
  kitchen: { min: 1200, max: 6000, snap: 10 },
};
const T = (en, zh) => ({ en, zh });

// AI 有时在字符串里又写一段 JSON（`…window."}],"notes":""}`）→ 从那里截掉，去掉多余的引号括号
export function cleanText(v, max = 200) {
  let t = String(v ?? '').replace(/\s+/g, ' ');
  const cut = t.search(/"\s*[}\]]|"\s*,\s*"|\\"|[{[]\s*"/);
  if (cut >= 0) t = t.slice(0, cut);
  t = t.replace(/["{}[\]\\]+$/g, '').replace(/^["{}[\]\\]+/g, '').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// 送去的图 → 原图 px 的换算
export function sentToPlan(plan, sentW, crop) {
  const W = num(plan?.image?.w);
  const c = crop && num(crop.w) > 0 ? { x: num(crop.x), y: num(crop.y), w: num(crop.w) } : { x: 0, y: 0, w: W };
  const k = c.w / num(sentW, 1);
  return { k, pt: (p) => [c.x + num(p[0]) * k, c.y + num(p[1]) * k] };
}

// ---------------- 比例 ----------------
// AI 读到的尺寸标注（缩图像素）→ 原图像素的 plan.scale；读不到 / 不合理 → null
export function aiScaleToPlan(ai, sentW, plan, crop = null) {
  const s = ai?.scale;
  const { k, pt: map } = sentToPlan(plan, sentW, crop);
  if (!s || s.found === false || !(num(s.mm) > 100) || !(k > 0)) return null;
  const pt = (p) => (Array.isArray(p) && p.length === 2 && p.every((v) => Number.isFinite(Number(v))) ? map(p).map((v) => Math.round(v * 10) / 10) : null);
  const a = pt(s.a), b = pt(s.b);
  if (!a || !b || Math.hypot(b[0] - a[0], b[1] - a[1]) < 20) return null;
  return { a, b, mm: Math.round(num(s.mm)) };
}

// ---------------- 房间 → 报价里的房间名（同旧工具的房间下拉）----------------
export function roomZoneName(room, nth = 0) {
  const type = room?.type;
  const nm = String(room?.name || '');
  if (type === 'kitchen') return /wet|湿/i.test(nm) ? 'Wet Kitchen 湿厨' : 'Dry Kitchen 干厨';
  if (type === 'master') return 'Master Bedroom 主卧';
  if (type === 'bedroom') return `Bedroom ${nth + 2} 卧室${nth + 2}`;
  if (type === 'living') return 'Living Room 客厅';
  if (type === 'dining') return 'Dining 餐厅';
  if (type === 'entrance') return 'Foyer 玄关';
  if (type === 'bathroom') return 'Bathroom 卫生间';
  return nm.trim().slice(0, 40) || 'Room 房间';
}

// ---------------- 摆放：候选柜子的墙线贴到 AI 线段 ----------------
// 世界坐标里的墙线（mm）+ 每面墙柜门朝的方向（同 plan.js / render/axo.js 的墙轴）
const AX = [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0]]; // ux, uz, wx, wz
function wallLines(cab) {
  return cabinetWalls(cab).map((w) => {
    const [ux, uz, wx, wz] = AX[(((Math.round(num(w.angle) / 90)) % 4) + 4) % 4];
    const a = [num(w.ox), num(w.oz)];
    return { a, b: [a[0] + ux * num(w.len), a[1] + uz * num(w.len)], front: [wx, wz] };
  });
}
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1];

// 候选（已转 rot）的墙线对上 AI 线段（mm）→ { place:{x,y}, err }；roomC = 房间中心（mm）
function fitLines(lines, segs, roomC) {
  if (lines.length !== segs.length) return null;
  const pairs = [];
  lines.forEach((l, i) => {
    const s = segs[i];
    const dl = sub(l.b, l.a), ds = sub(s.b, s.a);
    // 同方向的端点配对（AI 线段方向不一定和模板一样）
    if (dot(dl, ds) >= 0) pairs.push([l.a, s.a], [l.b, s.b]); else pairs.push([l.a, s.b], [l.b, s.a]);
  });
  const t = pairs.reduce((m, [p, q]) => [m[0] + (q[0] - p[0]) / pairs.length, m[1] + (q[1] - p[1]) / pairs.length], [0, 0]);
  const err = Math.sqrt(pairs.reduce((m, [p, q]) => m + (p[0] + t[0] - q[0]) ** 2 + (p[1] + t[1] - q[1]) ** 2, 0) / pairs.length);
  // 柜门要朝房间：每面墙的门向量和「墙中点 → 房间中心」同向；反了重罚
  let away = 0;
  if (roomC) {
    lines.forEach((l) => {
      const mid = [(l.a[0] + l.b[0]) / 2 + t[0], (l.a[1] + l.b[1]) / 2 + t[1]];
      if (dot(l.front, sub(roomC, mid)) < 0) away += 1;
    });
  }
  return { t, err: err + away * 1e6 };
}

function bestPlacement(cab, segs, roomC, planId) {
  let best = null;
  for (const rot of [0, 90, 180, 270]) {
    const lines = wallLines(cab).map((l) => ({ a: rotPt(l.a, rot), b: rotPt(l.b, rot), front: rotPt(l.front, rot).map((v) => (v === 0 ? 0 : v)) }));
    const r = fitLines(lines, segs, roomC);
    if (r && (!best || r.err < best.err)) best = { ...r, rot };
  }
  if (!best) return null;
  return { place: { planId, x: Math.round(best.t[0]), y: Math.round(best.t[1]), rot: normRot(best.rot) }, err: best.err };
}

// ---------------- 建议 ----------------
function area(a, b) { return Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])); }
const segOk = (s) => Array.isArray(s) && s.length === 4 && s.every((v) => Number.isFinite(Number(v)));

// ai：服务器回传；sentW：送去的缩图宽（px）；plan 要已定比例
// crop：送去那块在原图的位置；snap：贴墙（可选）；existing：图上已经有的柜子（检查重复 / 重叠）
// → [{ id, template, room, roomName, cab, lenMm:[…], ok, pick, reason?, note, notes }]
//   ok = 做得出来；pick = 默认勾选（AI 不太确定 / 位置可疑 / 和已有柜子重叠 → 不勾，写原因）
export function buildSuggestions(ai, plan, { sentW, crop = null, snap = null, existing = [], ceilingH = null } = {}) {
  const mmpp = mmPerPx(plan);
  const { k, pt: toPlan } = sentToPlan(plan, sentW, crop); // 送去 px → 原图 px
  if (!(mmpp > 0) || !(k > 0)) return [];
  const W = num(plan.image.w), H = num(plan.image.h);
  const toMm = (p) => toPlan(p).map((v) => v * mmpp);
  const rooms = Array.isArray(ai?.rooms) ? ai.rooms : [];
  const bedroomNth = new Map();
  let nBed = 0;
  rooms.forEach((r, i) => { if (r?.type === 'bedroom') bedroomNth.set(i, nBed++); });
  const roomOf = (name) => {
    const i = rooms.findIndex((r) => r && r.name === name);
    return i >= 0 ? { room: rooms[i], i } : null;
  };
  const out = [];
  (Array.isArray(ai?.suggestions) ? ai.suggestions : []).forEach((sg, idx) => {
    const id = `ai${idx + 1}`;
    const template = AI_TEMPLATES.includes(sg?.template) ? sg.template : null;
    const segsPx = (Array.isArray(sg?.segments) ? sg.segments : []).filter(segOk).map((s) => s.map(Number));
    const hit = roomOf(sg?.room);
    const room = hit?.room || { type: 'other', name: String(sg?.room || '') };
    const roomName = roomZoneName(room, hit ? bedroomNth.get(hit.i) || 0 : 0);
    const low = sg?.confidence === 'low';
    const base = { id, template, room: cleanText(room.name, 40), roomName, note: cleanText(sg?.note), low };
    if (!template) { out.push({ ...base, ok: false, reason: T('Unknown cabinet type', '不认识的柜子种类') }); return; }
    if (!segsPx.length || segsPx.length > 3 || (template !== 'kitchen' && segsPx.length !== 1)) {
      out.push({ ...base, ok: false, reason: T('Wall position unclear', '墙的位置看不清楚') }); return;
    }
    // 线段要在图里（容许 3% 出界）
    const inside = segsPx.every((s) => [0, 2].every((j) => s[j] * k >= -W * 0.03 && s[j] * k <= W * 1.03 && s[j + 1] * k >= -H * 0.03 && s[j + 1] * k <= H * 1.03));
    if (!inside) { out.push({ ...base, ok: false, reason: T('Outside the floor plan', '落在户型图外面') }); return; }
    const roomBoxPx = Array.isArray(room.box) && room.box.length === 4 && room.box.every((v) => Number.isFinite(Number(v))) ? room.box.map(Number) : null;
    // 贴墙：AI 的线常常偏十几 px（压在墙上 / 跑到墙外）
    let snappedAll = !snap;
    if (snap) {
      const rs = segsPx.map((sgm) => snap(sgm, roomBoxPx, template));
      snappedAll = rs.every((r) => r?.snapped);
      rs.forEach((r, j) => { if (r?.snapped) segsPx[j] = r.seg.map(Number); });
    }
    const segs = segsPx.map((s) => ({ a: toMm([s[0], s[1]]), b: toMm([s[2], s[3]]) }));
    const lens = segs.map((s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]));
    const lim = AI_LIMITS[template];
    const notes = [];
    if (!snappedAll) notes.push(T('No wall found here — check the position', '图上找不到这面墙 —— 位置请确认'));
    const fixLen = (L) => {
      const v = clamp(snapTo(L, lim.snap), lim.min, lim.max);
      if (L < lim.min * 0.6) return null; // 太短：不像这种柜子
      if (Math.abs(v - snapTo(L, lim.snap)) > 1) notes.push(T(`AI measured ${(L / 1000).toFixed(2)} m, using ${(v / 1000).toFixed(2)} m`, `AI 量到 ${(L / 1000).toFixed(2)} m，先按 ${(v / 1000).toFixed(2)} m`));
      return v;
    };
    const lenMm = lens.map(fixLen);
    if (lenMm.some((v) => v == null)) { out.push({ ...base, ok: false, reason: T('Too short for this cabinet', '这段墙太短，放不下这种柜子') }); return; }

    const opts = ceilingH > 0 ? { ceilingH } : {};
    let cabs = [];
    if (template === 'kitchen') {
      const kc = newCabinet('kitchen', opts);
      // 二字：两段平行 → galley，走道 = 两条墙线的距离 − 两边深度
      const parallel = segs.length === 2 && Math.abs(dot(sub(segs[0].b, segs[0].a), sub(segs[1].b, segs[1].a))) / (lens[0] * lens[1]) > 0.9;
      const shape = segs.length === 3 ? 'U' : segs.length === 2 ? (parallel ? 'galley' : 'L') : 'I';
      const wall = (j, len) => ({ ...(kc.spec.walls[j] || kc.spec.walls[0]), len, units: [], upperUnits: [] });
      const orders = segs.length === 1 ? [[0]] : segs.length === 2 ? [[0, 1], [1, 0]] : [[0, 1, 2], [2, 1, 0]];
      cabs = orders.map((o) => {
        const patch = { shape, walls: o.map((i, j) => wall(j, lenMm[i])) };
        if (shape === 'galley') {
          const n = [-(segs[0].b[1] - segs[0].a[1]) / lens[0], (segs[0].b[0] - segs[0].a[0]) / lens[0]];
          patch.aisle = clamp(Math.round(Math.abs(dot(sub(segs[1].a, segs[0].a), n)) - 2 * kc.spec.baseD), 600, 3000);
        }
        return { cab: updateSpec(kc, patch), segs: o.map((i) => segs[i]) };
      });
    } else {
      const c = newCabinet(template, opts);
      const sized = setPlanSize(c, { W: lenMm[0] }).cab;
      cabs = [{ cab: sized, segs }];
    }
    const roomC = roomBoxPx ? toMm([(roomBoxPx[0] + roomBoxPx[2]) / 2, (roomBoxPx[1] + roomBoxPx[3]) / 2]) : null;
    let best = null;
    cabs.forEach(({ cab, segs: ss }) => {
      const p = bestPlacement(cab, ss, roomC, plan.id);
      if (p && (!best || p.err < best.err)) best = { cab, ...p };
    });
    if (!best) { out.push({ ...base, ok: false, reason: T('Could not place it', '放不上去') }); return; }
    const cab = { ...best.cab, place: best.place };
    const why = [];
    if (best.err >= 1e6) notes.push(T('Check which side the doors face', '请确认柜门朝哪边'));
    if (low) why.push(T('AI is not sure about this one', 'AI 不太确定'));
    // 柜子大部分跑出房间框 → 位置可疑
    const fp = placedFootprint(cab);
    if (roomBoxPx) {
      const [a, b] = [toMm([roomBoxPx[0], roomBoxPx[1]]), toMm([roomBoxPx[2], roomBoxPx[3]])];
      const rb = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
      const pad = 300; // AI 的房间框也不准：放宽 0.3 m
      const parts = fp.parts.filter((p) => p.floor);
      const tot = parts.reduce((m, p) => m + (p.rect[2] - p.rect[0]) * (p.rect[3] - p.rect[1]), 0);
      const inn = parts.reduce((m, p) => m + area(p.rect, [rb[0] - pad, rb[1] - pad, rb[2] + pad, rb[3] + pad]), 0);
      if (tot > 0 && inn / tot < 0.6) why.push(T('Mostly outside the room — check the position', '大部分在房间外面 —— 位置请确认'));
    }
    // 和图上已有的柜子重叠（例如主卧已经放了 K1）
    const mine = fp.parts.filter((p) => p.floor);
    const clash = (existing || []).find((c) => c?.place?.planId === plan.id && placedFootprint(c).parts.filter((p) => p.floor).some((o) => mine.some((p) => area(p.rect, o.rect) > 100 * 100)));
    if (clash) why.push(T(`Overlaps ${clash.code || 'a cabinet'} already on the plan`, `和图上已有的 ${clash.code || '柜子'} 重叠`));
    out.push({ ...base, cab, lenMm, ok: true, pick: !why.length, why, notes });
  });
  // 默认勾的排前面（不勾的留着、写原因，业务自己决定）
  return out.map((x, i) => [x, i]).sort((p, q) => ((q[0].ok && q[0].pick) - (p[0].ok && p[0].pick)) || (q[0].ok - p[0].ok) || (p[1] - q[1])).map(([x]) => x);
}

// ---------------- 加入报价 ----------------

// picked：勾选的建议；makeZone(name) → 新房间（由画面传 blankZone 进来，这里保持纯函数）
// → { zones, added:[cabId…], skipped:[{ id, reason }] }
export function applySuggestions(zones, picked, { makeZone, uid } = {}) {
  let zs = zones.map((z) => ({ ...z, cabinets: [...(z.cabinets || [])] }));
  const added = [], skipped = [];
  const placedParts = () => zs.flatMap((z) => z.cabinets).filter((c) => c.place).flatMap((c) => placedFootprint(c).parts.filter((p) => p.floor).map((p) => ({ ...p, cabId: c.id })));
  for (const s of picked || []) {
    if (!s?.ok || !s.cab) continue;
    const mine = placedFootprint(s.cab).parts.filter((p) => p.floor);
    const others = placedParts();
    if (mine.some((p) => others.some((o) => area(p.rect, o.rect) > 100 * 100))) { skipped.push({ id: s.id, reason: T('Overlaps another cabinet', '和别的柜子重叠') }); continue; }
    let z = zs.find((x) => x.name === s.roomName);
    if (!z) {
      z = makeZone ? makeZone(s.roomName) : { id: `zone_${s.id}`, name: s.roomName, items: [], cabinets: [], ceilingH: null, collapsed: false };
      z = { ...z, cabinets: [...(z.cabinets || [])] };
      zs = [...zs, z];
    }
    const id = uid ? uid() : `cab_${s.id}`;
    const pre = `${s.cab.id}-`;
    const cab = {
      ...s.cab, id, code: nextCode(zs), name: '',
      frames: (s.cab.frames || []).map((f, i) => ({ ...f, id: typeof f.id === 'string' && f.id.startsWith(pre) ? `${id}-${f.id.slice(pre.length)}` : `${id}-f${i}` })),
    };
    z.cabinets.push(cab);
    zs = zs.map((x) => (x.id === z.id ? z : x));
    added.push(id);
  }
  return { zones: zs, added, skipped };
}
