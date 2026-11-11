// ============================================================
// 第三版「户型图框框」纯逻辑（不用 React / DOM，可在 Node 测试）
//
// Plan（存在记录 r.plans）
//   { id, name, image:{ path, w, h, kind:'img'|'pdf', page }, scale:{ a:[x,y], b:[x,y], mm } | null }
//   a / b = 图片像素坐标；mm = 用户打的真实长度 → mmPerPx = mm / 距离(px)
//
// 户型图坐标：一律用 mm（= 图片像素 × mmPerPx），x 向右、y 向下（同图片）。
// 柜子 cab.place = { planId, x, y, rot }：柜子世界原点（墙 0 起点的墙角）放在户型图 (x, y) mm，rot 0 / 90 / 180 / 270（顺时针）。
//   rot 0：墙在上、柜门朝下（+y）。
// 柜子俯视外框由现成的 cabinetWalls(cab) + 每个柜体 frame 的 x / W / D / wall 算（同 3D），不另存尺寸
//   → 在柜子编辑器改尺寸，图上的框自动跟着变。价钱不看 place。
// ============================================================
import { cabinetWalls, templateOf, updateSpecKeep } from './templates.js';

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const round1 = (v) => Math.round(v * 10) / 10;

// ---------------- 比例 ----------------
export const dist = (a, b) => Math.hypot(num(b?.[0]) - num(a?.[0]), num(b?.[1]) - num(a?.[1]));
export function mmPerPx(plan) {
  const s = plan?.scale;
  if (!s || !(num(s.mm) > 0)) return 0;
  const d = dist(s.a, s.b);
  return d > 0 ? num(s.mm) / d : 0;
}
export const planReady = (plan) => mmPerPx(plan) > 0;
// 图片整张的大小（mm）
export function planSizeMm(plan) {
  const k = mmPerPx(plan);
  return { w: num(plan?.image?.w) * k, h: num(plan?.image?.h) * k };
}

// ---------------- 旋转 ----------------
export const normRot = (r) => ((((Math.round(num(r) / 90)) % 4) + 4) % 4) * 90;
// 顺时针转（y 向下的画面里看是顺时针）
export function rotPt([x, y], rot) {
  switch (normRot(rot)) {
    case 90: return [-y, x];
    case 180: return [-x, -y];
    case 270: return [y, -x];
    default: return [x, y];
  }
}
const AX = [ // 墙的 angle（世界俯视 x 右、z 朝观众）→ u 沿墙、w 离墙朝外；同 render/axo.js wallAxes
  { ux: 1, uz: 0, wx: 0, wz: 1 },
  { ux: 0, uz: 1, wx: -1, wz: 0 },
  { ux: -1, uz: 0, wx: 0, wz: -1 },
  { ux: 0, uz: -1, wx: 1, wz: 0 },
];
const axes = (angle) => AX[(((Math.round(num(angle) / 90)) % 4) + 4) % 4];
const rectOf = (pts) => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [round1(Math.min(...xs)), round1(Math.min(...ys)), round1(Math.max(...xs)), round1(Math.max(...ys))];
};

// ---------------- 柜子俯视外框 ----------------
// → { parts:[{ id, kind, floor, rect:[x0,y0,x1,y1], front:[dx,dy] }], bbox }（世界俯视坐标，mm；y = 世界 z）
//   floor：会挡走道的柜体（地柜 / 高柜 / 落地的；吊柜、电视墙不算）
export function cabinetFootprint(cab) {
  let walls = [];
  try { walls = cabinetWalls(cab) || []; } catch { walls = []; }
  const parts = [];
  (cab?.frames || []).forEach((f) => {
    if (!f || f.kind === 'backdrop') return;
    const W = num(f.W), D = num(f.D);
    if (!(W > 0 && D > 0)) return;
    const wall = walls[Math.max(0, Math.round(num(f.wall)))] || walls[0] || { ox: 0, oz: 0, angle: 0 };
    const a = axes(wall.angle);
    const at = (u, w) => [num(wall.ox) + a.ux * u + a.wx * w, num(wall.oz) + a.uz * u + a.wz * w];
    const x0 = num(f.x);
    parts.push({
      id: f.id, kind: f.kind || 'tall',
      floor: f.kind !== 'wall' && num(f.y) < 1000,
      rect: rectOf([at(x0, 0), at(x0 + W, 0), at(x0, D), at(x0 + W, D)]),
      front: [a.wx, a.wz],
    });
  });
  return { parts, bbox: parts.length ? rectOf(parts.flatMap((p) => [[p.rect[0], p.rect[1]], [p.rect[2], p.rect[3]]])) : [0, 0, 0, 0] };
}

// 放到户型图上：先转 rot，再移到 (place.x, place.y)
export function placeOnPlan(fp, place) {
  const rot = normRot(place?.rot);
  const ox = num(place?.x), oy = num(place?.y);
  const mv = ([x, y]) => { const [rx, ry] = rotPt([x, y], rot); return [rx + ox, ry + oy]; };
  const parts = (fp?.parts || []).map((p) => ({
    ...p,
    rect: rectOf([mv([p.rect[0], p.rect[1]]), mv([p.rect[2], p.rect[3]])]),
    front: rotPt(p.front, rot).map((v) => (v === 0 ? 0 : v)),
  }));
  return { parts, bbox: parts.length ? rectOf(parts.flatMap((p) => [[p.rect[0], p.rect[1]], [p.rect[2], p.rect[3]]])) : [ox, oy, ox, oy] };
}

export const placedFootprint = (cab) => placeOnPlan(cabinetFootprint(cab), cab?.place);

// 让柜子在 rot 下的外框左上角刚好落在 (x, y)：→ place
export function placeAt(cab, x, y, rot = 0, planId = cab?.place?.planId) {
  const r = normRot(rot);
  const b = placeOnPlan(cabinetFootprint(cab), { x: 0, y: 0, rot: r }).bbox;
  return { ...(planId != null ? { planId } : {}), x: Math.round(num(x) - b[0]), y: Math.round(num(y) - b[1]), rot: r };
}

// 转 90°：绕外框中心转（转完中心不动）
export function rotatePlace(cab, by = 90) {
  const p = cab?.place || { x: 0, y: 0, rot: 0 };
  const b = placedFootprint(cab).bbox;
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  const r = normRot(num(p.rot) + by);
  const nb = placeOnPlan(cabinetFootprint(cab), { x: 0, y: 0, rot: r }).bbox;
  return { ...p, rot: r, x: Math.round(cx - (nb[0] + nb[2]) / 2), y: Math.round(cy - (nb[1] + nb[3]) / 2) };
}

// ---------------- 图上的尺寸 ↔ 模板设定 ----------------
// 每个模板「沿墙长度」和「深」对应 spec 的哪一项
export function planSize(cab) {
  const s = cab?.spec || {};
  if (cab?.template === 'kitchen') return { W: num(s.walls?.[0]?.len), D: num(s.baseD) };
  if (cab?.template === 'tv') return { W: num(s.W), D: Math.max(num(s.lowD), s.sides?.on ? num(s.sides.D) : 0) };
  return { W: num(s.W), D: num(s.D) };
}
function sizePatch(cab, { W, D } = {}) {
  const s = cab?.spec || {};
  const p = {};
  if (cab?.template === 'kitchen') {
    if (W != null) p.walls = (s.walls || []).map((w, i) => (i === 0 ? { ...w, len: Math.round(W) } : w));
    if (D != null) p.baseD = Math.round(D);
  } else if (cab?.template === 'tv') {
    if (W != null) p.W = Math.round(W);
    if (D != null) p.lowD = Math.round(D);
  } else {
    if (W != null) p.W = Math.round(W);
    if (D != null) p.D = Math.round(D);
  }
  return p;
}
// 图上拖边改尺寸 → 走第二版 updateSpecKeep（手画的框框照样保留）→ { cab, rebuilt }
export function setPlanSize(cab, size) {
  const p = sizePatch(cab, size);
  if (!Object.keys(p).length) return { cab, rebuilt: [] };
  return updateSpecKeep(cab, p);
}

// 在图上拖柜子外框的一条边（户型图 mm）：left / right / top / bottom 按画面方向；
// 换算成「沿墙长度」或「深」，靠墙那一边 / 起点不动 → { cab, rebuilt }
//   rot 0：左右 = 长、上下 = 深（墙在上：拖下边改深，拖上边 = 墙那边，改深时整个往上挪）
export function dragPlanEdge(cab, edge, delta) {
  const rot = normRot(cab?.place?.rot);
  const horiz = edge === 'left' || edge === 'right';
  const alongW = (rot === 0 || rot === 180) ? horiz : !horiz; // 这条边改的是长还是深
  const sign = edge === 'right' || edge === 'bottom' ? 1 : -1;
  const cur = planSize(cab);
  const size = alongW ? { W: Math.max(300, cur.W + sign * num(delta)) } : { D: Math.max(100, cur.D + sign * num(delta)) };
  const before = placedFootprint(cab).bbox;
  const r = setPlanSize(cab, size);
  // 拖的是左 / 上边：另一边（右 / 下）不动 → 把外框挪回去
  const after = placedFootprint({ ...r.cab, place: cab.place }).bbox;
  let { x, y } = cab.place || { x: 0, y: 0 };
  if (edge === 'left') x += before[2] - after[2];
  else if (edge === 'top') y += before[3] - after[3];
  else if (edge === 'right') x += before[0] - after[0];
  else y += before[1] - after[1];
  return { cab: { ...r.cab, place: { ...(cab.place || {}), x: Math.round(x), y: Math.round(y) } }, rebuilt: r.rebuilt };
}

// 画了一个框（户型图 mm）：长边 = 沿墙长度、短边 = 深；墙在哪一边由 rot 决定（默认：横的墙在上、竖的墙在左）
export function rectToSpec(rect) {
  const w = Math.abs(num(rect.w)), h = Math.abs(num(rect.h));
  const horiz = w >= h;
  return { W: Math.round(horiz ? w : h), D: Math.round(horiz ? h : w), rot: horiz ? 0 : 270,
    x: Math.min(num(rect.x), num(rect.x) + num(rect.w)), y: Math.min(num(rect.y), num(rect.y) + num(rect.h)) };
}
// 新柜子按画的框定尺寸 + 放好（模板的深度规范化后可能和框不一样：以模板为准，左上角对齐）
export function fitCabinetToRect(cab, rect, planId) {
  const r = rectToSpec(rect);
  const t = templateOf(cab.template);
  const sized = t ? setPlanSize(cab, { W: r.W, D: r.D }).cab : cab;
  return { ...sized, place: placeAt(sized, r.x, r.y, r.rot, planId) };
}

// ---------------- 走道检查 ----------------
// 数字依据 interior-design-expert skill：厨房走道 ≥ 1000 舒适、< 900 太窄；衣柜开门前要 ≥ 600
export const AISLE = {
  kitchen: { warn: 900, tight: 1000 },
  wardrobe: { warn: 600 },
  other: { warn: 600 },
  minOverlap: 150,  // 两柜正面相对、重叠的长度至少这么多才算「对着」
  maxCheck: 2500,   // 超过这个距离不检查
  overlapArea: 100 * 100, // 重叠面积超过这个（mm²）算「柜子互相重叠」
};
const roleOf = (cab) => (cab?.template === 'kitchen' ? 'kitchen' : cab?.template === 'wardrobe' ? 'wardrobe' : 'other');
const T = (en, zh) => ({ en, zh });

// 正面朝 +y 的 A 和朝 −y 的 B（或 x 方向同理）：两个正面之间的距离 + 量线
function facing(A, B) {
  const [ax, ay] = A.front, [bx, by] = B.front;
  if (ax + bx !== 0 || ay + by !== 0 || (ax === 0 && ay === 0)) return null; // 不是正面相对
  const vert = ay !== 0;
  const [a0, a1, b0, b1] = vert ? [A.rect[0], A.rect[2], B.rect[0], B.rect[2]] : [A.rect[1], A.rect[3], B.rect[1], B.rect[3]];
  const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
  if (hi - lo < AISLE.minOverlap) return null;
  // A 朝正方向：A 的正面 = 外框的大边；B 的正面 = 小边；B 要在 A 前面
  const s = vert ? ay : ax;
  const aFace = vert ? (s > 0 ? A.rect[3] : A.rect[1]) : (s > 0 ? A.rect[2] : A.rect[0]);
  const bFace = vert ? (s > 0 ? B.rect[1] : B.rect[3]) : (s > 0 ? B.rect[0] : B.rect[2]);
  const gap = s > 0 ? bFace - aFace : aFace - bFace;
  if (!(gap >= 0) || gap > AISLE.maxCheck) return null;
  const m = (lo + hi) / 2;
  const line = vert ? [[m, aFace], [m, bFace]] : [[aFace, m], [bFace, m]];
  return { gap: Math.round(gap), line };
}
const area = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

// cabinets：整份报价里的柜子（只看放在这张图上的）→ [{ level:'warn'|'info', kind:'aisle'|'overlap', a, b, gap?, line?, rect?, msg }]
export function aisleWarnings(plan, cabinets = []) {
  const on = (cabinets || []).filter((c) => c?.place && c.place.planId === plan?.id);
  const parts = on.flatMap((c) => placedFootprint(c).parts.map((p) => ({ ...p, cab: c })));
  const out = [];
  const seen = new Set();
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const A = parts[i], B = parts[j];
      if (!A.floor || !B.floor) continue;
      const same = A.cab === B.cab;
      if (!same) {
        const ov = area(A.rect, B.rect);
        if (ov > AISLE.overlapArea) {
          const k = `o:${A.cab.id}:${B.cab.id}`;
          if (!seen.has(k)) {
            seen.add(k);
            out.push({ level: 'warn', kind: 'overlap', a: A.cab.id, b: B.cab.id,
              rect: [Math.max(A.rect[0], B.rect[0]), Math.max(A.rect[1], B.rect[1]), Math.min(A.rect[2], B.rect[2]), Math.min(A.rect[3], B.rect[3])],
              msg: T(`${A.cab.code} and ${B.cab.code} overlap on the floor plan`, `${A.cab.code} 和 ${B.cab.code} 在户型图上重叠了`) });
          }
          continue;
        }
      }
      const f = facing(A, B);
      if (!f) continue;
      const roles = [roleOf(A.cab), roleOf(B.cab)];
      const kitchen = roles.includes('kitchen');
      const lim = kitchen ? AISLE.kitchen : roles.includes('wardrobe') ? AISLE.wardrobe : AISLE.other;
      const names = same ? A.cab.code : `${A.cab.code} ↔ ${B.cab.code}`;
      let w = null;
      if (f.gap < lim.warn) {
        w = kitchen ? T(`${names}: kitchen aisle only ${f.gap} mm — too narrow (< ${lim.warn})`, `${names}：厨房走道只有 ${f.gap}，太窄（< ${lim.warn}）`)
          : roles.includes('wardrobe') ? T(`${names}: only ${f.gap} mm in front of the wardrobe — doors need ≥ ${lim.warn}`, `${names}：衣柜前只有 ${f.gap}，开门要 ≥ ${lim.warn}`)
            : T(`${names}: only ${f.gap} mm between the fronts (< ${lim.warn})`, `${names}：两柜正面只隔 ${f.gap}（< ${lim.warn}）`);
      } else if (lim.tight && f.gap < lim.tight) {
        w = T(`${names}: kitchen aisle ${f.gap} mm is a bit narrow (${lim.warn}–${lim.tight})`, `${names}：厨房走道 ${f.gap}，偏窄（${lim.warn}–${lim.tight}）`);
      }
      if (!w) continue;
      const k = `a:${A.cab.id}:${B.cab.id}:${f.gap}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ level: f.gap < lim.warn ? 'warn' : 'info', kind: 'aisle', a: A.cab.id, b: B.cab.id, gap: f.gap, line: f.line, msg: w });
    }
  }
  return out;
}

// 某个柜子相关的提醒（给柜子编辑器的「提醒」区）
export function aisleWarningsFor(cab, plans = [], cabinets = []) {
  if (!cab?.place) return [];
  const plan = (plans || []).find((p) => p.id === cab.place.planId);
  if (!plan) return [];
  const others = (cabinets || []).filter((c) => c.id !== cab.id);
  return aisleWarnings(plan, [...others, cab]).filter((w) => w.a === cab.id || w.b === cab.id);
}

// ---------------- 记录清洗 ----------------
export function cleanPlans(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((p) => p && typeof p === 'object' && typeof p.id === 'string' && p.image && typeof p.image.path === 'string').map((p) => {
    const s = p.scale;
    const okPt = (q) => Array.isArray(q) && q.length === 2 && q.every((v) => Number.isFinite(Number(v)));
    const scale = s && okPt(s.a) && okPt(s.b) && num(s.mm) > 0 ? { a: s.a.map(Number), b: s.b.map(Number), mm: num(s.mm) } : null;
    return { ...p, name: typeof p.name === 'string' ? p.name : '', scale,
      image: { ...p.image, w: num(p.image.w), h: num(p.image.h), kind: p.image.kind === 'pdf' ? 'pdf' : 'img', page: Math.max(1, Math.round(num(p.image.page, 1))) } };
  });
}
