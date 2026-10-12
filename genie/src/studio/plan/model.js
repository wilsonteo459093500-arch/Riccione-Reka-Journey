// 平面图数据模型（纯函数，Node 可测）—— v2：多层（双层排屋、半独立、独立式）
//
// plan = {
//   v: 2, name, north,                           // north：北方在平面图上的角度（0 = 图纸上方），所有楼层共用（日照）
//   floors: [                                     // 由下往上；数组顺序就是楼层顺序（level = 下标）
//     { id, level, name,                          // name '' = 按楼层的默认名（一楼 / 二楼…）；有字 = 设计师自己取的（夹层）
//       height,                                   // 楼层高（m）：这一层地面 → 上一层地面（含楼板 + 天花里的空间）
//       ceil,                                     // 天花高（m）= 3D 里的墙高（旧版的 wallH）
//       rooms:    [{ id, type, name, x, y, w, d, stairId? }],  // 米；x 向右、y 向下（= 3D 的 z，朝向镜头）
//       openings: [{ id, kind, x1, y1, x2, y2, sill?, head? }], // 落在墙线上的一段：door 门 / window 窗 / slider 落地趟门 / open 打通
//       meta? },                                  // 选填：AI 从哪一页、哪一块读出来的
//   ],
//   stairs: [{ id, from, to, x, y, w, d, shape, up, turn?, width? }],   // 楼梯 = 两层之间的连接（走进去模式就沿着它上楼）
// }
//
// 楼层的地面高度不存，算出来（floorElev）。房间 id 在所有楼层之间唯一（家具按房间 id 找房间）。
// 楼梯在上下两层各有一个 type 'stair' 的房间（id = `${stair.id}-${floor.id}`），由 syncStairs 保持和楼梯的矩形一致，
// 所以墙、重叠检查、自动摆家具、楼板开洞每一层都照旧算。
// 房间只用矩形（L 形房间 = 两个同类型矩形）。概念阶段够用，也让 AI 识别 + 人工校正都很快。
// 旧版 v1（{ v:1, wallH, rooms, openings }）在每个读的地方用 migratePlan 变成一层的 v2。

export const PLAN_V = 2;
export const SLAB = 0.15; // 结构楼板厚（m）
export const MAX_FLOORS = 4; // 这一版最多 4 层（编辑器的楼层标签）

// 房间底色（平面图编辑器用）：VI「晨光溪岸」的柔和纸色系 —— 陶土、鼠尾草、溪水、砂石；不用紫 / 靛蓝
export const ROOM_TYPES = {
  living: { zh: '客厅', en: 'Living', color: '#E9C9A1', floor: 'floor', open: true },
  dining: { zh: '餐厅', en: 'Dining', color: '#EBD6A8', floor: 'floor', open: true },
  family: { zh: '起居厅', en: 'Family hall', color: '#E3CFA9', floor: 'floor', open: true },
  kitchen: { zh: '厨房', en: 'Kitchen', color: '#C9D9C2', floor: 'tile' },
  master: { zh: '主卧', en: 'Master bedroom', color: '#DCC0B0', floor: 'floor' },
  bedroom: { zh: '卧室', en: 'Bedroom', color: '#C8D2CF', floor: 'floor' },
  kids: { zh: '儿童房', en: 'Kids room', color: '#F2CFC9', floor: 'floor' },
  study: { zh: '书房', en: 'Study', color: '#D9E3C7', floor: 'floor' },
  bath: { zh: '浴室', en: 'Bathroom', color: '#BFDDE6', floor: 'tile', wet: true },
  foyer: { zh: '玄关', en: 'Foyer', color: '#E6DCCB', floor: 'floor', open: true },
  corridor: { zh: '走廊', en: 'Corridor', color: '#E3DED5', floor: 'floor', open: true },
  balcony: { zh: '阳台', en: 'Balcony', color: '#CFE3D3', floor: 'tile', outdoor: true },
  porch: { zh: '车廊 / 前院', en: 'Car porch', color: '#DAD6CC', floor: 'tile', outdoor: true },
  utility: { zh: '晒衣处', en: 'Yard', color: '#D3DADC', floor: 'tile', wet: true },
  walkin: { zh: '衣帽间', en: 'Walk-in', color: '#E2CFB6', floor: 'floor' },
  store: { zh: '储物间', en: 'Store', color: '#D9D4CC', floor: 'floor' },
  // 楼梯间：只用楼梯工具画（类型选单里不出现）；和客厅 / 餐厅 / 玄关 / 走廊 / 起居厅之间不砌墙（开放楼梯）
  stair: { zh: '楼梯', en: 'Stairs', color: '#D8CDBB', floor: 'floor', open: true, stair: true, nofurn: true },
  // 挑空（双层高 / 天井）：没有楼板、不放家具、开放的边有栏杆；只能在楼上
  void: { zh: '挑空', en: 'Void', color: '#EFEAE0', open: true, void: true, nofurn: true },
};

export const OPENING_KINDS = {
  door: { zh: '门', en: 'Door', width: 0.9, head: 2.1 },
  window: { zh: '窗', en: 'Window', width: 1.5, sill: 0.9, head: 2.2 },
  slider: { zh: '落地趟门', en: 'Sliding door', width: 2.4, sill: 0, head: 2.4 },
  open: { zh: '打通', en: 'Open', width: 1.2 },
};

export const EXT_T = 0.2;
export const INT_T = 0.12;
const EPS = 0.03;

// 楼层的默认名（马来西亚：一楼 = 地面层 = Ground floor；二楼 = First floor）
export const FLOOR_NAMES = ['一楼', '二楼', '三楼', '四楼', '五楼', '六楼'];

export const uid = (p = 'r') => `${p}${Math.random().toString(36).slice(2, 8)}`;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const num = (v, d) => (v === null || v === '' || v === undefined || !Number.isFinite(Number(v)) ? d : Number(v));
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

/** 是不是 v2（有 floors 数组） */
export const isV2 = (p) => isObj(p) && Array.isArray(p.floors);
/** 有没有一层以上 */
export const isMultiFloor = (plan) => isObj(plan) && Array.isArray(plan.floors) && plan.floors.length > 1;

// ───────────────────────── 迁移 / 规范化 ─────────────────────────

const SHAPES = ['straight', 'L', 'U'];
const DIRS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const RIGHT = { N: 'E', E: 'S', S: 'W', W: 'N' }; // 面向 up，右手边是哪个方向
const LEFT = { N: 'W', W: 'S', S: 'E', E: 'N' };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };

/** 楼梯矩形的默认形状：长宽比 ≥ 2.5 → 直跑；两边都 ≥ 2m 且比 < 1.6 → U 形；其他 → L 形 */
export function defaultStairShape(w, d) {
  const lo = Math.min(w, d);
  const ratio = Math.max(w, d) / Math.max(0.01, lo);
  if (ratio >= 2.5) return 'straight';
  if (lo >= 2.0 && ratio < 1.6) return 'U';
  return 'L';
}
/** 默认上楼方向：沿长边，竖的往北（图纸上方）、横的往东 */
export const defaultStairUp = (w, d) => (d >= w ? 'N' : 'E');

function normRoom(r) {
  return { ...r, x: num(r.x, 0), y: num(r.y, 0), w: num(r.w, 1), d: num(r.d, 1) };
}

function normFloor(f, i, ids, roomIds) {
  let id = typeof f?.id === 'string' && f.id && !ids.has(f.id) ? f.id : null;
  if (!id) {
    id = `f${i}`;
    while (ids.has(id)) id = uid('f');
  }
  ids.add(id);
  const ceil = r2(clamp(num(f?.ceil, 2.8), 2.4, 4.5));
  const height = r2(Math.max(num(f?.height, ceil + 0.35), ceil + 0.2));
  const rooms = (Array.isArray(f?.rooms) ? f.rooms : []).filter(isObj).map((r) => {
    const room = normRoom(r);
    let rid = typeof room.id === 'string' && room.id ? room.id : uid('r');
    if (roomIds.has(rid) && !room.stairId) rid = `${rid}-${id}`;
    while (roomIds.has(rid) && !room.stairId) rid = uid('r');
    roomIds.add(rid);
    return rid === room.id ? room : { ...room, id: rid };
  });
  const openings = (Array.isArray(f?.openings) ? f.openings : []).filter(isObj);
  const out = { ...(isObj(f) ? f : {}), id, level: i, name: typeof f?.name === 'string' ? f.name : '', height, ceil, rooms, openings };
  if (!isObj(out.meta)) delete out.meta;
  return out;
}

function normStair(s, ids) {
  if (!isObj(s) || typeof s.from !== 'string') return null;
  const x = num(s.x, NaN);
  const y = num(s.y, NaN);
  const w = num(s.w, NaN);
  const d = num(s.d, NaN);
  if (![x, y, w, d].every(Number.isFinite) || w < 0.3 || d < 0.3) return null;
  let id = typeof s.id === 'string' && s.id && !ids.has(s.id) ? s.id : null;
  if (!id) {
    id = `s${ids.size + 1}`;
    while (ids.has(id)) id = uid('s');
  }
  ids.add(id);
  const shape = SHAPES.includes(s.shape) ? s.shape : defaultStairShape(w, d);
  const up = DIRS[s.up] ? s.up : defaultStairUp(w, d);
  const out = { ...s, id, from: s.from, to: typeof s.to === 'string' ? s.to : null, x, y, w, d, shape, up };
  if (shape === 'straight') {
    delete out.turn;
    delete out.width;
  } else {
    out.turn = s.turn === 'left' ? 'left' : 'right';
    if (shape === 'L') out.width = clamp(num(s.width, 1.0), 0.6, Math.min(w, d));
    else delete out.width;
  }
  return out;
}

/**
 * 任何版本的 plan → v2（幂等、不抛错）：
 *   null → 空白一层；v2 → 规范化（id、level、名字、高度、楼梯同步；去掉顶层的旧版镜像 rooms / openings / wallH）；
 *   v1（或没写 v）→ 一层：{ id:'f0', ceil: wallH, height: ceil + 0.35, rooms, openings }。
 */
export function migratePlan(p) {
  if (!isObj(p)) return emptyPlan();
  // 只传了一层（{ id, ceil, rooms, openings }，例如测试、旧的单层调用）：就是一层的 v2，保留它自己的 id 和天花高
  if (p.v == null && Array.isArray(p.rooms) && p.ceil != null && !Array.isArray(p.floors)) {
    return migratePlan({ v: 2, name: '', north: 0, floors: [{ ...p, id: typeof p.id === 'string' && p.id ? p.id : 'f0' }], stairs: [] });
  }
  const { rooms, openings, wallH, floors, stairs, ...rest } = p;
  let fl;
  if (p.v === 2 && Array.isArray(floors)) fl = floors.length ? floors : [{}];
  else {
    const ceil = clamp(num(wallH, 2.8), 2.4, 4.5);
    fl = [{ id: 'f0', level: 0, name: '', ceil, height: ceil + 0.35, rooms: Array.isArray(rooms) ? rooms : [], openings: Array.isArray(openings) ? openings : [] }];
  }
  const ids = new Set();
  const roomIds = new Set();
  const nf = fl.slice(0, 16).map((f, i) => normFloor(f, i, ids, roomIds));
  const sids = new Set();
  const ns = (p.v === 2 && Array.isArray(stairs) ? stairs : []).map((s) => normStair(s, sids)).filter(Boolean);
  const north = ((num(p.north, 0) % 360) + 360) % 360;
  return sync({ ...rest, v: 2, name: typeof p.name === 'string' ? p.name : '', north, floors: nf, stairs: ns });
}

export function emptyPlan() {
  return { v: 2, name: '新方案', north: 0, floors: [{ id: 'f0', level: 0, name: '', height: 3.15, ceil: 2.8, rooms: [], openings: [] }], stairs: [] };
}

// ───────────────────────── 楼层 ─────────────────────────

export const floorById = (plan, id) => plan?.floors?.find((f) => f.id === id) || null;
export const floorIndex = (plan, id) => (plan?.floors ? plan.floors.findIndex((f) => f.id === id) : -1);

/** 这一层地面的高度（m）= 下面每一层的楼层高加起来；一楼 = 0 */
export function floorElev(plan, id) {
  const i = floorIndex(plan, id);
  let e = 0;
  for (let k = 0; k < i; k++) e += plan.floors[k].height;
  return r3(e);
}

export function elevations(plan) {
  const out = {};
  let e = 0;
  for (const f of plan?.floors || []) {
    out[f.id] = r3(e);
    e += f.height;
  }
  return out;
}

/** 楼层名（中文 key，界面用 t() 包）：设计师取的名字优先，否则 一楼 / 二楼 / 三楼… */
export function floorName(plan, id) {
  const i = floorIndex(plan, id);
  const f = plan?.floors?.[i];
  if (f?.name) return f.name;
  return FLOOR_NAMES[Math.max(0, i)] || FLOOR_NAMES[FLOOR_NAMES.length - 1];
}

/** 房间在哪一层（找不到 → null） */
export function roomFloor(plan, roomId) {
  for (const f of plan?.floors || []) if (f.rooms.some((r) => r.id === roomId)) return f.id;
  return null;
}

const relevel = (floors) => floors.map((f, i) => (f.level === i ? f : { ...f, level: i }));

function newFloorId(plan) {
  const ids = new Set(plan.floors.map((f) => f.id));
  for (let k = plan.floors.length; k < 99; k++) if (!ids.has(`f${k}`)) return `f${k}`;
  return uid('f');
}

/**
 * 加一层（放在最上面）：
 *   copy 'blank' —— 空白，只带着楼梯（下面那层有楼梯上来 → 这一层也叠一座；下面那层画了还没连起来的楼梯间 → 用它连上来）；
 *   copy 'all'   —— 复制 from（默认最上一层）的房间和门窗（新 id；楼梯间、车廊不复制），楼梯同上。
 * 返回 { plan, floorId }；已经 MAX_FLOORS 层 → floorId null。
 */
export function addFloor(plan0, { copy = 'blank', from } = {}) {
  const plan = isV2(plan0) ? plan0 : migratePlan(plan0);
  if (plan.floors.length >= MAX_FLOORS) return { plan, floorId: null };
  const top = plan.floors[plan.floors.length - 1];
  const src = (copy === 'all' && floorById(plan, from)) || top;
  const id = newFloorId(plan);
  const ceil = r2(Math.min(top.ceil, 2.9));
  const nf = { id, level: plan.floors.length, name: '', height: r2(ceil + 0.35), ceil, rooms: [], openings: [] };
  const usedIds = new Set(plan.floors.flatMap((f) => f.rooms.map((r) => r.id)));
  const rid = () => {
    let k = uid('r');
    while (usedIds.has(k)) k = uid('r');
    usedIds.add(k);
    return k;
  };
  if (copy === 'all') {
    nf.rooms = src.rooms.filter((r) => !r.stairId && r.type !== 'stair' && r.type !== 'porch').map((r) => ({ ...r, id: rid() }));
    const walls = buildWalls({ rooms: nf.rooms, openings: src.openings });
    nf.openings = src.openings
      .filter((o) => walls.some((w) => w.pieces.some((p) => p.openingId === o.id)))
      .map((o) => ({ ...o, id: o.id === 'd-main' ? uid('o') : `${o.id}-${id}` }));
    if (src.ceil) {
      nf.ceil = src.ceil;
      nf.height = src.height;
    }
  }
  const stairs = [...plan.stairs];
  // 楼梯叠上来：到 top 的每一座楼梯，在同一个位置从 top 再上一层
  for (const s of plan.stairs.filter((x) => x.to === top.id)) stairs.push({ ...s, id: uid('s'), from: top.id, to: id });
  // top 上画了还没连的楼梯间（AI 识别的、自己选了「楼梯」类型的）：用它连上来
  if (!plan.stairs.some((x) => x.from === top.id))
    for (const r of top.rooms.filter((x) => x.type === 'stair' && !x.stairId)) {
      const shape = defaultStairShape(r.w, r.d);
      stairs.push(normStair({ id: uid('s'), from: top.id, to: id, x: r.x, y: r.y, w: r.w, d: r.d, shape, up: defaultStairUp(r.w, r.d) }, new Set()));
    }
  return { plan: sync({ ...plan, floors: [...plan.floors, nf], stairs }), floorId: id };
}

/** 删一层（至少留一层）；连着它的楼梯一起删 */
export function removeFloor(plan0, id) {
  const plan = isV2(plan0) ? plan0 : migratePlan(plan0);
  if (plan.floors.length <= 1 || !floorById(plan, id)) return plan;
  return sync({ ...plan, floors: relevel(plan.floors.filter((f) => f.id !== id)), stairs: plan.stairs.filter((s) => s.from !== id && s.to !== id) });
}

/** 楼层往上（dir = 1）/ 往下（dir = −1）挪一格（AI 把一楼二楼认反了的时候用） */
export function moveFloor(plan0, id, dir) {
  const plan = isV2(plan0) ? plan0 : migratePlan(plan0);
  const i = floorIndex(plan, id);
  const j = i + (dir > 0 ? 1 : -1);
  if (i < 0 || j < 0 || j >= plan.floors.length) return plan;
  const floors = [...plan.floors];
  [floors[i], floors[j]] = [floors[j], floors[i]];
  return sync({ ...plan, floors: relevel(floors) });
}

/** 改一层：patch 对象或 (floor) => floor。id / level 不能改；天花高夹在 2.4–4.5（楼层高不夹：太低 checkPlan 会提醒） */
export function updateFloor(plan0, id, patch) {
  const plan = isV2(plan0) ? plan0 : migratePlan(plan0);
  const i = floorIndex(plan, id);
  if (i < 0) return plan;
  const f = plan.floors[i];
  const next = typeof patch === 'function' ? patch(f) : { ...f, ...patch };
  const nf = { ...next, id: f.id, level: i };
  if (nf.ceil !== f.ceil) nf.ceil = r2(clamp(num(nf.ceil, f.ceil), 2.4, 4.5));
  if (nf.height !== f.height) nf.height = r2(Math.max(2.0, num(nf.height, f.height)));
  if (!Array.isArray(nf.rooms)) nf.rooms = f.rooms;
  if (!Array.isArray(nf.openings)) nf.openings = f.openings;
  const floors = [...plan.floors];
  floors[i] = nf;
  return sync({ ...plan, floors });
}

// ───────────────────────── 楼梯 ─────────────────────────

export const stairById = (plan, id) => plan?.stairs?.find((s) => s.id === id) || null;
/** 这一层的楼梯：up = 从这一层上去的，down = 从下面上到这一层的 */
export function stairsOf(plan, floorId) {
  const all = plan?.stairs || [];
  return { up: all.filter((s) => s.from === floorId), down: all.filter((s) => s.to === floorId) };
}

/** 加一座楼梯：to 默认是 from 的上一层；没有上一层 → stairId null（编辑器先问要不要加二楼） */
export function addStair(plan0, o = {}) {
  const plan = isV2(plan0) ? plan0 : migratePlan(plan0);
  const from = o.from ?? plan.floors[0].id;
  const a = floorIndex(plan, from);
  const to = o.to ?? plan.floors[a + 1]?.id;
  if (a < 0 || !to) return { plan, stairId: null };
  const ids = new Set(plan.stairs.map((s) => s.id));
  let id = uid('s');
  while (ids.has(id)) id = uid('s');
  const st = normStair({ ...o, id, from, to }, new Set());
  if (!st) return { plan, stairId: null };
  return { plan: sync({ ...plan, stairs: [...plan.stairs, st] }), stairId: id };
}

/** 改楼梯（移动 / 改大小 / 形状 / 方向）：上下两层的楼梯间一起动 */
export function updateStair(plan0, id, patch) {
  const plan = isV2(plan0) ? plan0 : migratePlan(plan0);
  const s = stairById(plan, id);
  if (!s) return plan;
  const st = normStair({ ...s, ...patch, id: s.id }, new Set());
  if (!st) return plan;
  return sync({ ...plan, stairs: plan.stairs.map((x) => (x.id === id ? st : x)) });
}

export function removeStair(plan0, id) {
  const plan = isV2(plan0) ? plan0 : migratePlan(plan0);
  return sync({ ...plan, stairs: plan.stairs.filter((s) => s.id !== id) });
}

const iouRect = (a, b) => {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
  if (ox <= 0 || oy <= 0) return 0;
  const i = ox * oy;
  return i / (a.w * a.d + b.w * b.d - i);
};

const stairRoom = (s, f) => ({ id: `${s.id}-${f.id}`, type: 'stair', stairId: s.id, name: '', x: s.x, y: s.y, w: s.w, d: s.d });

/** 楼层顺序反过来以后（moveFloor），楼梯从另一头上 */
function reverseStair(s) {
  if (s.shape === 'straight') return { ...s, up: OPP[s.up] };
  if (s.shape === 'U') return { ...s, turn: s.turn === 'left' ? 'right' : 'left' };
  const side = s.turn === 'left' ? LEFT[s.up] : RIGHT[s.up];
  return { ...s, up: OPP[side], turn: s.turn === 'left' ? 'right' : 'left' };
}

/** 楼梯 ↔ 楼梯间房间保持一致（plan 已经是规范化过的 v2） */
function sync(plan) {
  const floors = plan.floors;
  const n = floors.length;
  const lvl = (id) => floors.findIndex((f) => f.id === id);
  const stairs = [];
  for (const s0 of plan.stairs || []) {
    let s = s0;
    let a = lvl(s.from);
    let b = s.to != null ? lvl(s.to) : -1;
    if (a < 0) continue; // 起点那层没了
    if (b < 0 || b === a) b = a + 1 < n ? a + 1 : -1; // 终点没写 / 没了 → 上一层
    if (b < 0) continue;
    if (b < a) {
      s = reverseStair(s);
      [a, b] = [b, a];
    }
    if (b !== a + 1) b = a + 1; // 只连相邻两层
    if (s.from !== floors[a].id || s.to !== floors[b].id) s = { ...s, from: floors[a].id, to: floors[b].id };
    stairs.push(s);
  }
  const live = new Map(stairs.map((s) => [s.id, s]));
  let changed = stairs.length !== (plan.stairs || []).length || stairs.some((s, i) => s !== plan.stairs[i]);
  const nf = floors.map((f) => {
    const mine = stairs.filter((s) => s.from === f.id || s.to === f.id);
    const placed = new Set();
    const rooms = [];
    for (const r of f.rooms) {
      if (r.stairId) {
        const s = live.get(r.stairId);
        if (!s || !mine.includes(s) || placed.has(s.id)) continue; // 楼梯删了 / 不在这一层 / 重复 → 去掉
        rooms.push(stairRoom(s, f));
        placed.add(s.id);
        continue;
      }
      if (r.type === 'stair') {
        // 模板、AI 识别出来的楼梯间：和楼梯矩形重叠一半以上就认领
        const s = mine.find((x) => !placed.has(x.id) && iouRect(r, x) >= 0.5);
        if (s) {
          rooms.push(stairRoom(s, f));
          placed.add(s.id);
          continue;
        }
      }
      rooms.push(r);
    }
    for (const s of mine) if (!placed.has(s.id)) rooms.push(stairRoom(s, f));
    const same = rooms.length === f.rooms.length && rooms.every((r, i) => {
      const o = f.rooms[i];
      return r === o || (o && r.id === o.id && r.type === o.type && r.stairId === o.stairId && r.x === o.x && r.y === o.y && r.w === o.w && r.d === o.d && r.name === o.name && Object.keys(o).length === Object.keys(r).length);
    });
    if (same) return f;
    changed = true;
    return { ...f, rooms };
  });
  if (!changed) return plan;
  return { ...plan, floors: nf, stairs };
}

/** 公开版：任何 plan → 楼梯和楼梯间一致的 v2 */
export function syncStairs(plan) {
  return isV2(plan) && plan.floors.every((f, i) => f && f.level === i && Array.isArray(f.rooms) && Array.isArray(f.openings)) && Array.isArray(plan.stairs) ? sync(plan) : migratePlan(plan);
}

// ── 楼梯几何（参考 floors/proto/stairs.mjs，已测）──
export const RISER_MAX = 0.18; // UBBL 1984 第 168 条：踏步高 ≤ 180mm
export const TREAD = 0.255; // 踏步宽 ≥ 255mm
export const TREAD_MIN = 0.22; // 小于这个编辑器就说「楼梯太短」
export const U_GAP = 0.1; // U 形楼梯两跑之间的缝
export const STEP_OFF = 0.3; // 上下楼的点在楼梯矩形外面多远

/** 矩形的「楼梯坐标」：along = 上楼方向，across = 右手方向；原点 = 起步那条边的左端（面向上楼方向） */
function stairFrame(st) {
  const [ux, uy] = DIRS[st.up];
  const right = RIGHT[st.up];
  const [rx, ry] = DIRS[right];
  const alongLen = ux ? st.w : st.d;
  const acrossLen = ux ? st.d : st.w;
  const sx = ux ? (ux > 0 ? st.x : st.x + st.w) : rx > 0 ? st.x : st.x + st.w;
  const sy = uy ? (uy > 0 ? st.y : st.y + st.d) : ry > 0 ? st.y : st.y + st.d;
  const P = (a, c) => ({ x: r3(sx + ux * a + rx * c), y: r3(sy + uy * a + ry * c) });
  const rect = (a0, a1, c0, c1) => {
    const p = P(a0, c0);
    const q = P(a1, c1);
    return { x0: Math.min(p.x, q.x), y0: Math.min(p.y, q.y), x1: Math.max(p.x, q.x), y1: Math.max(p.y, q.y) };
  };
  return { alongLen, acrossLen, P, rect, right };
}

/** 楼梯每一跑的宽度：直跑 = 整个矩形宽；U = 一半减缝；L = width */
export function flightWidth(st) {
  const C = DIRS[st.up]?.[0] ? st.d : st.w;
  if (st.shape === 'U') return r3((C - U_GAP) / 2);
  if (st.shape === 'L') return r3(Math.min(st.width || 1.0, C, DIRS[st.up]?.[0] ? st.w : st.d));
  return r3(C);
}

function flightsOf(st, rise) {
  const shape = st.shape || 'straight';
  let n = Math.max(2, Math.ceil(rise / RISER_MAX - 1e-9));
  if (shape === 'U' && n % 2) n += 1; // U：两跑一样长，在中间平台交接（踏步高还是 ≤ 180mm）
  const r = rise / n;
  const F = stairFrame(st);
  const turnRight = (st.turn || 'right') === 'right';
  const flights = [];
  const landings = [];
  let fits = true;
  let tread = TREAD;
  let entry;
  let exit;
  let need;
  let avail;
  const A = F.alongLen;
  const C = F.acrossLen;
  if (shape === 'straight') {
    // 最上一级贴着楼上楼板的边（出口）；多出来的长度留在下面当地面
    tread = Math.min(TREAD, A / (n - 1));
    fits = tread >= TREAD_MIN - 1e-9 && C >= 0.8;
    const going = (n - 1) * tread;
    flights.push({ rect: F.rect(A - going, A, 0, C), dir: st.up, risers: n, z0: 0, z1: rise, tread });
    entry = { edge: OPP[st.up], seg: F.rect(0, 0, 0, C) };
    exit = { edge: st.up, seg: F.rect(A, A, 0, C) };
    need = (n - 1) * TREAD;
    avail = A;
  } else if (shape === 'U') {
    const fw = (C - U_GAP) / 2;
    const half = n / 2;
    tread = Math.min(TREAD, (A - Math.max(fw, 0.9)) / (half - 1));
    const going = (half - 1) * tread;
    fits = tread >= TREAD_MIN - 1e-9 && fw >= 0.8;
    // 右转 → 第一跑在左半边（面向上楼方向），第二跑沿右半边回来
    const [c1a, c1b, c2a, c2b] = turnRight ? [0, fw, fw + U_GAP, C] : [fw + U_GAP, C, 0, fw];
    flights.push({ rect: F.rect(0, going, c1a, c1b), dir: st.up, risers: half, z0: 0, z1: half * r, tread });
    landings.push({ rect: F.rect(going, A, 0, C), z: half * r });
    flights.push({ rect: F.rect(0, going, c2a, c2b), dir: OPP[st.up], risers: half, z0: half * r, z1: rise, tread });
    entry = { edge: OPP[st.up], seg: F.rect(0, 0, c1a, c1b) };
    exit = { edge: OPP[st.up], seg: F.rect(0, 0, c2a, c2b) };
    need = (half - 1) * TREAD + Math.max(fw, 0.9);
    avail = A;
  } else {
    // L：第一跑沿 up、在转弯的另一侧 → 方形转角平台 → 第二跑朝转弯那一侧，最上一级贴着侧边（出口）
    const fw = Math.min(st.width || 1.0, C, A);
    const a1 = A - fw;
    const a2 = C - fw;
    let n1 = Math.round((n * a1) / Math.max(0.01, a1 + a2));
    n1 = Math.min(n - 2, Math.max(2, n1));
    const n2 = n - n1;
    tread = Math.max(0, Math.min(TREAD, a1 / (n1 - 1), a2 / (n2 - 1)));
    fits = tread >= TREAD_MIN - 1e-9 && fw >= 0.8;
    const g1 = (n1 - 1) * tread;
    const g2 = (n2 - 1) * tread;
    const [c1a, c1b] = turnRight ? [0, fw] : [C - fw, C];
    flights.push({ rect: F.rect(A - fw - g1, A - fw, c1a, c1b), dir: st.up, risers: n1, z0: 0, z1: n1 * r, tread });
    const side = turnRight ? F.right : OPP[F.right];
    const land = turnRight ? F.rect(A - fw, A, 0, C - g2) : F.rect(A - fw, A, g2, C);
    landings.push({ rect: land, z: n1 * r });
    flights.push({ rect: turnRight ? F.rect(A - fw, A, C - g2, C) : F.rect(A - fw, A, 0, g2), dir: side, risers: n2, z0: n1 * r, z1: rise, tread });
    entry = { edge: OPP[st.up], seg: F.rect(0, 0, c1a, c1b) };
    exit = { edge: side, seg: turnRight ? F.rect(A - fw, A, C, C) : F.rect(A - fw, A, 0, 0) };
    need = (n - 2) * TREAD + 2 * fw;
    avail = A + C;
  }
  return { risers: n, rise: r, tread, fits, flights, landings, entry, exit, width: flightWidth(st), need: r2(need), avail: r2(avail) };
}

const riseOf = (plan, s) => floorById(plan, s.from)?.height || 3.2;

/**
 * 楼梯的跑、平台、上下口：stairFlights(plan, stairId)（踏步总高 = from 那层的楼层高），或者 stairFlights(stairRect, rise)。
 * → { risers, rise, tread, fits, width, need, avail, flights:[{ rect, dir, risers, z0, z1, tread }], landings:[{ rect, z }],
 *     entry:{ edge, seg }, exit:{ edge, seg } }；rect = { x0, y0, x1, y1 }（平面图米）；z 从 from 那层的地面量起。
 */
export function stairFlights(a, b) {
  if (isV2(a)) {
    const s = stairById(a, b);
    return s ? flightsOf(s, riseOf(a, s)) : null;
  }
  return a ? flightsOf(a, b) : null;
}

const midSeg = (s) => ({ x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2 });
const outOf = (p, edge, k) => ({ x: r3(p.x + DIRS[edge][0] * k), y: r3(p.y + DIRS[edge][1] * k) });

/**
 * 走进去模式的上楼路线：entry（下层地面，z 0，楼梯口外 0.3m）→ 每一跑的起点 / 终点 → 平台 → exit（上层，z = rise）。
 * → { id, from, to, elev, entry:{x,y,z}, exit:{x,y,z}, points:[{x,y,z}], width, fits, risers, rise, tread }
 *   z 从 from 那层的地面量起；elev = from 那层的地面高度（加上去就是绝对高度）。
 */
export function stairPath(plan, stairId) {
  const s = isV2(plan) ? stairById(plan, stairId) : null;
  if (!s) return null;
  const rise = riseOf(plan, s);
  const f = flightsOf(s, rise);
  const pts = [];
  pts.push({ ...outOf(midSeg(f.entry.seg), f.entry.edge, STEP_OFF), z: 0 });
  for (let i = 0; i < f.flights.length; i++) {
    const fl = f.flights[i];
    const c = midSeg({ x0: fl.rect.x0, y0: fl.rect.y0, x1: fl.rect.x1, y1: fl.rect.y1 });
    const [dx, dy] = DIRS[fl.dir];
    const half = (dx ? fl.rect.x1 - fl.rect.x0 : fl.rect.y1 - fl.rect.y0) / 2;
    pts.push({ x: r3(c.x - dx * half), y: r3(c.y - dy * half), z: r3(fl.z0) });
    pts.push({ x: r3(c.x + dx * half), y: r3(c.y + dy * half), z: r3(fl.z1) });
    if (f.landings[i]) pts.push({ ...midSeg(f.landings[i].rect), z: r3(f.landings[i].z) });
  }
  pts.push({ ...outOf(midSeg(f.exit.seg), f.exit.edge, STEP_OFF), z: r3(rise) });
  return { id: s.id, from: s.from, to: s.to, elev: floorElev(plan, s.from), entry: pts[0], exit: pts[pts.length - 1], points: pts, width: f.width, fits: f.fits, risers: f.risers, rise: f.rise, tread: f.tread };
}

// ───────────────────────── 墙 ─────────────────────────

/**
 * 由一层的房间矩形生成墙（传一层：{ rooms, openings }；旧版 v1 plan 也行）。每段墙：
 * { id, axis:'x'|'z', c, a, b, t, exterior, neg: room|null, pos: room|null, outward: -1|1|0, pieces:[{a,b,kind,sill,head,openingId}] }
 * axis 'x' = 沿 x 方向的墙（平面图上的横线，y = c）；neg = 线上方的房间，pos = 线下方的房间。
 * axis 'z' = 沿 y 方向的墙（竖线，x = c）；neg = 线左边，pos = 线右边。
 */
export function buildWalls(plan) {
  if (plan && Array.isArray(plan.floors) && !Array.isArray(plan.rooms)) throw new Error('buildWalls takes a floor');
  const lines = new Map();
  const push = (axis, c, a, b, room, side) => {
    const key = `${axis}:${Math.round(c * 100)}`;
    if (!lines.has(key)) lines.set(key, { axis, c: r2(c), edges: [] });
    lines.get(key).edges.push({ a: Math.min(a, b), b: Math.max(a, b), room, side });
  };
  for (const r of plan?.rooms || []) {
    push('x', r.y, r.x, r.x + r.w, r, 'pos');
    push('x', r.y + r.d, r.x, r.x + r.w, r, 'neg');
    push('z', r.x, r.y, r.y + r.d, r, 'pos');
    push('z', r.x + r.w, r.y, r.y + r.d, r, 'neg');
  }
  const openType = (r) => !!ROOM_TYPES[r?.type]?.open;
  const walls = [];
  for (const line of lines.values()) {
    const pts = [...new Set(line.edges.flatMap((e) => [e.a, e.b]).map(r2))].sort((a, b) => a - b);
    let cur = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      if (q - p < EPS) continue;
      const cover = (side) => line.edges.find((e) => e.side === side && e.a <= p + EPS && e.b >= q - EPS)?.room || null;
      const neg = cover('neg');
      const pos = cover('pos');
      if (!neg && !pos) {
        cur = null;
        continue;
      }
      const exists = !(neg && pos && openType(neg) && openType(pos));
      const key = `${neg?.id || '-'}|${pos?.id || '-'}|${exists}`;
      if (cur && cur.key === key && Math.abs(cur.b - p) < EPS) {
        cur.b = q;
      } else {
        cur = { key, axis: line.axis, c: line.c, a: p, b: q, neg, pos, exists };
        walls.push(cur);
      }
    }
  }
  const openings = plan?.openings || [];
  return walls
    .filter((w) => w.exists)
    .map((w, i) => {
      const exterior = !w.neg || !w.pos;
      const outward = exterior ? (w.neg ? 1 : -1) : 0;
      const ops = openings
        .filter((o) => {
          const horiz = Math.abs(o.y1 - o.y2) < EPS;
          if (w.axis === 'x' && !(horiz && Math.abs(o.y1 - w.c) < EPS)) return false;
          if (w.axis === 'z' && !(!horiz && Math.abs(o.x1 - w.c) < EPS)) return false;
          const [oa, ob] = w.axis === 'x' ? [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)] : [Math.min(o.y1, o.y2), Math.max(o.y1, o.y2)];
          return ob > w.a + EPS && oa < w.b - EPS;
        })
        .map((o) => {
          const [oa, ob] = w.axis === 'x' ? [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)] : [Math.min(o.y1, o.y2), Math.max(o.y1, o.y2)];
          const k = OPENING_KINDS[o.kind] || OPENING_KINDS.door;
          return { a: Math.max(w.a, oa), b: Math.min(w.b, ob), kind: o.kind, sill: o.sill ?? k.sill ?? 0, head: o.head ?? k.head ?? 2.1, openingId: o.id };
        })
        .sort((x, y) => x.a - y.a);
      const pieces = [];
      let at = w.a;
      for (const o of ops) {
        if (o.a > at + EPS) pieces.push({ a: at, b: o.a, kind: 'solid' });
        pieces.push(o);
        at = Math.max(at, o.b);
      }
      if (w.b > at + EPS) pieces.push({ a: at, b: w.b, kind: 'solid' });
      return {
        id: `w${i}`,
        axis: w.axis,
        c: w.c,
        a: r2(w.a),
        b: r2(w.b),
        t: exterior ? EXT_T : INT_T,
        exterior,
        outward,
        neg: w.neg ? { id: w.neg.id, type: w.neg.type } : null,
        pos: w.pos ? { id: w.pos.id, type: w.pos.type } : null,
        pieces,
      };
    });
}

/** 每一层的墙：{ [floorId]: walls } */
export function buildAllWalls(plan0) {
  const plan = isV2(plan0) ? plan0 : migratePlan(plan0);
  const out = {};
  for (const f of plan.floors) out[f.id] = buildWalls(f);
  return out;
}

/** 某房间四条边上「可以靠墙放家具」的整段（扣掉门、窗、打通） */
export function roomSides(room, walls, { allowWindow = false } = {}) {
  const sides = [
    { side: 'N', axis: 'x', c: room.y, a: room.x, b: room.x + room.w, inward: [0, 1] },
    { side: 'S', axis: 'x', c: room.y + room.d, a: room.x, b: room.x + room.w, inward: [0, -1] },
    { side: 'W', axis: 'z', c: room.x, a: room.y, b: room.y + room.d, inward: [1, 0] },
    { side: 'E', axis: 'z', c: room.x + room.w, a: room.y, b: room.y + room.d, inward: [-1, 0] },
  ];
  return sides.map((s) => {
    const mine = walls.filter((w) => w.axis === s.axis && Math.abs(w.c - s.c) < EPS && w.b > s.a + EPS && w.a < s.b - EPS);
    const stretches = [];
    let windows = 0;
    let doors = 0;
    let thick = INT_T;
    for (const w of mine) {
      thick = Math.max(thick, w.t);
      for (const p of w.pieces) {
        const a = Math.max(p.a, s.a);
        const b = Math.min(p.b, s.b);
        if (b - a < EPS) continue;
        if (p.kind === 'window') windows += b - a;
        if (p.kind === 'door' || p.kind === 'slider' || p.kind === 'open') doors += b - a;
        const ok = p.kind === 'solid' || (allowWindow && p.kind === 'window');
        if (!ok) continue;
        const last = stretches[stretches.length - 1];
        if (last && Math.abs(last.b - a) < EPS) last.b = b;
        else stretches.push({ a, b });
      }
    }
    const covered = mine.reduce((t, w) => t + Math.max(0, Math.min(w.b, s.b) - Math.max(w.a, s.a)), 0);
    return {
      ...s,
      len: s.b - s.a,
      walled: covered > (s.b - s.a) * 0.5,
      windows,
      doors,
      thick: thick / 2,
      stretches: stretches.map((x) => ({ ...x, len: x.b - x.a })).sort((x, y) => y.len - x.len),
    };
  });
}

/** 吸附（一层）：相近的边对齐（AI 识别 / 手画后用），让墙线干净 */
export function snapPlan(plan, tol = 0.12) {
  const xs = [];
  const ys = [];
  for (const r of plan.rooms) {
    xs.push(r.x, r.x + r.w);
    ys.push(r.y, r.y + r.d);
  }
  const cluster = (vals) => {
    const sorted = [...vals].sort((a, b) => a - b);
    const groups = [];
    for (const v of sorted) {
      const g = groups[groups.length - 1];
      if (g && v - g[g.length - 1] <= tol) g.push(v);
      else groups.push([v]);
    }
    return (v) => {
      const g = groups.find((gg) => v >= gg[0] - 1e-9 && v <= gg[gg.length - 1] + 1e-9);
      return g ? Math.round((g.reduce((a, b) => a + b, 0) / g.length) * 20) / 20 : v;
    };
  };
  const sx = cluster(xs);
  const sy = cluster(ys);
  const rooms = plan.rooms.map((r) => {
    const x = sx(r.x);
    const y = sy(r.y);
    const x2 = sx(r.x + r.w);
    const y2 = sy(r.y + r.d);
    return { ...r, x: r2(x), y: r2(y), w: r2(Math.max(0.6, x2 - x)), d: r2(Math.max(0.6, y2 - y)) };
  });
  // 开口吸到最近的墙线上
  const lines = { h: [...new Set(rooms.flatMap((r) => [r.y, r.y + r.d]).map(r2))], v: [...new Set(rooms.flatMap((r) => [r.x, r.x + r.w]).map(r2))] };
  const near = (arr, v) => arr.reduce((best, a) => (Math.abs(a - v) < Math.abs(best - v) ? a : best), arr[0] ?? v);
  const openings = (plan.openings || []).map((o) => {
    if (Math.abs(o.y1 - o.y2) < Math.abs(o.x1 - o.x2)) {
      const y = near(lines.h, (o.y1 + o.y2) / 2);
      return { ...o, y1: y, y2: y, x1: r2(o.x1), x2: r2(o.x2) };
    }
    const x = near(lines.v, (o.x1 + o.x2) / 2);
    return { ...o, x1: x, x2: x, y1: r2(o.y1), y2: r2(o.y2) };
  });
  return { ...plan, rooms, openings };
}

/** 每一层都吸附一遍；楼梯跟着它在下层的楼梯间走（上下两层还是同一个位置） */
export function snapAll(plan0, tol = 0.06) {
  const plan = isV2(plan0) ? plan0 : migratePlan(plan0);
  const floors = plan.floors.map((f) => snapPlan(f, tol));
  const stairs = plan.stairs.map((s) => {
    const r = floors.find((f) => f.id === s.from)?.rooms.find((x) => x.stairId === s.id);
    return r ? { ...s, x: r.x, y: r.y, w: r.w, d: r.d } : s;
  });
  return sync({ ...plan, floors, stairs });
}

/** 外框：一层 → 这一层的房间；v2 plan → 所有楼层合起来 */
export function bounds(plan) {
  const rooms = plan && Array.isArray(plan.floors) ? plan.floors.flatMap((f) => f?.rooms || []) : plan?.rooms || [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rooms) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.d);
  }
  if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 10, y1: 8, w: 10, d: 8, cx: 5, cy: 4 };
  return { x0, y0, x1, y1, w: x1 - x0, d: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** 这一层「围起来」的部分（不含阳台、车廊）的外框 */
export function envelope(floor) {
  const rooms = (floor?.rooms || []).filter((r) => !ROOM_TYPES[r.type]?.outdoor);
  return rooms.length ? bounds({ rooms }) : bounds(floor);
}

// ───────────────────────── 楼板、车廊屋顶、天花、栏杆（给 3D 用，纯函数） ─────────────────────────

const inRect = (r, x, y, g = 0) => x > r.x - g && x < r.x + r.w + g && y > r.y - g && y < r.y + r.d + g;
const uniq = (vals) => [...new Set(vals.map(r3))].sort((a, b) => a - b);

/** 网格（xs × ys 切出来的格子）里 inside(cx, cy) 为真的格子 → 合并成尽量少的矩形 [{ x, y, w, d }] */
function cellRects(xs, ys, inside) {
  const out = [];
  let open = new Map();
  for (let j = 0; j < ys.length - 1; j++) {
    const y0 = ys[j];
    const y1 = ys[j + 1];
    if (y1 - y0 < 1e-6) continue;
    const cy = (y0 + y1) / 2;
    const runs = [];
    let run = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      if (x1 - x0 < 1e-6) continue;
      if (inside((x0 + x1) / 2, cy)) {
        if (run && Math.abs(run[1] - x0) < 1e-6) run[1] = x1;
        else runs.push((run = [x0, x1]));
      } else run = null;
    }
    const next = new Map();
    for (const [a, b] of runs) {
      const k = `${a}|${b}`;
      const o = open.get(k);
      if (o && Math.abs(o.y1 - y0) < 1e-6) {
        o.y1 = y1;
        next.set(k, o);
        open.delete(k);
      } else next.set(k, { x0: a, x1: b, y0, y1 });
    }
    for (const o of open.values()) out.push(o);
    open = next;
  }
  for (const o of open.values()) out.push(o);
  return out.map((o) => ({ x: r3(o.x0), y: r3(o.y0), w: r3(o.x1 - o.x0), d: r3(o.y1 - o.y0) })).sort((a, b) => a.y - b.y || a.x - b.x);
}

/** 这一层楼板上的洞：挑空 + 从下面上来的楼梯间 */
function holesOf(plan, f) {
  const up = new Set((plan.stairs || []).filter((s) => s.to === f.id).map((s) => s.id));
  return f.rooms.filter((r) => ROOM_TYPES[r.type]?.void || (r.stairId && up.has(r.stairId)));
}

function platePred(plan, f) {
  const holes = holesOf(plan, f);
  const holeIds = new Set(holes.map((r) => r.id));
  const slab = f.rooms.filter((r) => !holeIds.has(r.id) && !(r.type === 'stair' && !r.stairId && f.level > 0));
  const G = EXT_T / 2;
  // 房间外面一圈 G：贴着边的那一条算（外墙下面）；转角那一小格只有旁边没有洞的时候才算（楼梯间的外墙一路通下去，不用楼板）
  const strip = (r, x, y) => (x > r.x && x < r.x + r.w) || (y > r.y && y < r.y + r.d);
  const pred = (x, y) => {
    if (holes.some((r) => inRect(r, x, y))) return false;
    if (slab.some((r) => inRect(r, x, y))) return true;
    if (f.rooms.some((r) => inRect(r, x, y))) return false;
    return slab.some((r) => inRect(r, x, y, G) && (strip(r, x, y) || !holes.some((h) => inRect(h, x, y, G))));
  };
  const xs = slab.flatMap((r) => [r.x - G, r.x, r.x + r.w, r.x + r.w + G]).concat(holes.flatMap((r) => [r.x, r.x + r.w]), f.rooms.flatMap((r) => [r.x, r.x + r.w]));
  const ys = slab.flatMap((r) => [r.y - G, r.y, r.y + r.d, r.y + r.d + G]).concat(holes.flatMap((r) => [r.y, r.y + r.d]), f.rooms.flatMap((r) => [r.y, r.y + r.d]));
  return { pred, xs, ys };
}

/** 这一层的楼板（矩形）：房间扣掉楼梯间 / 挑空，外墙那一边多出半个外墙厚（楼板到外墙的外皮） */
export function floorPlate(plan0, id) {
  const plan = isV2(plan0) ? plan0 : migratePlan(plan0);
  const f = floorById(plan, id);
  if (!f) return [];
  const { pred, xs, ys } = platePred(plan, f);
  return cellRects(uniq(xs), uniq(ys), pred);
}

/** 二楼以上：下面一层的车廊上面、这一层没盖到的部分 → 车廊的平屋顶（在这一层的地面高度） */
export function porchRoofs(plan0, id) {
  const plan = isV2(plan0) ? plan0 : migratePlan(plan0);
  const i = floorIndex(plan, id);
  if (i < 1) return [];
  const f = plan.floors[i];
  const porches = plan.floors[i - 1].rooms.filter((r) => r.type === 'porch');
  if (!porches.length) return [];
  const P = platePred(plan, f);
  const xs = uniq([...porches.flatMap((r) => [r.x, r.x + r.w]), ...P.xs]);
  const ys = uniq([...porches.flatMap((r) => [r.y, r.y + r.d]), ...P.ys]);
  return cellRects(xs, ys, (x, y) => porches.some((r) => inRect(r, x, y)) && !P.pred(x, y) && !f.rooms.some((r) => inRect(r, x, y)));
}

/** 这一层的天花：室内房间，扣掉往上的楼梯间、扣掉楼上挑空的下面（双层高） */
export function ceilingRects(plan0, id) {
  const plan = isV2(plan0) ? plan0 : migratePlan(plan0);
  const i = floorIndex(plan, id);
  if (i < 0) return [];
  const f = plan.floors[i];
  const rooms = f.rooms.filter((r) => !ROOM_TYPES[r.type]?.outdoor);
  const ups = (plan.stairs || []).filter((s) => s.from === f.id);
  const voids = (plan.floors[i + 1]?.rooms || []).filter((r) => ROOM_TYPES[r.type]?.void);
  const cut = [...ups, ...voids];
  const xs = uniq([...rooms, ...cut].flatMap((r) => [r.x, r.x + r.w]));
  const ys = uniq([...rooms, ...cut].flatMap((r) => [r.y, r.y + r.d]));
  return cellRects(xs, ys, (x, y) => rooms.some((r) => inRect(r, x, y)) && !cut.some((r) => inRect(r, x, y)));
}

/** [a, b] 扣掉一串 [p, q] */
function minus(a, b, blocks) {
  const bs = blocks.filter(([p, q]) => q > a + 1e-6 && p < b - 1e-6).sort((x, y) => x[0] - y[0]);
  const out = [];
  let cur = a;
  for (const [p, q] of bs) {
    if (p > cur + 1e-6) out.push([cur, p]);
    cur = Math.max(cur, q);
  }
  if (b > cur + 1e-6) out.push([cur, b]);
  return out.filter(([p, q]) => q - p > 0.05);
}

/**
 * 栏杆线：这一层楼板上的洞（挑空、从下面上来的楼梯间）四边没有墙的地方，扣掉楼梯的出口（上楼走出来那一段）。
 * → [{ axis, c, a, b, inward, room }]：axis 'x' = 横线 y = c（x 从 a 到 b）；axis 'z' = 竖线 x = c。
 *   inward = 洞在线的哪一边（+1：y / x 变大的那一边；−1：另一边）。
 */
export function voidEdges(plan0, id, walls) {
  const plan = isV2(plan0) ? plan0 : migratePlan(plan0);
  const f = floorById(plan, id);
  if (!f) return [];
  const ws = walls || buildWalls(f);
  const holes = holesOf(plan, f);
  const out = [];
  for (const h of holes) {
    const st = h.stairId ? stairById(plan, h.stairId) : null;
    const exit = st ? flightsOf(st, riseOf(plan, st)).exit : null;
    const sides = [
      { axis: 'x', c: h.y, a: h.x, b: h.x + h.w, inward: 1 },
      { axis: 'x', c: h.y + h.d, a: h.x, b: h.x + h.w, inward: -1 },
      { axis: 'z', c: h.x, a: h.y, b: h.y + h.d, inward: 1 },
      { axis: 'z', c: h.x + h.w, a: h.y, b: h.y + h.d, inward: -1 },
    ];
    for (const s of sides) {
      const blocks = ws.filter((w) => w.axis === s.axis && Math.abs(w.c - s.c) < EPS).map((w) => [w.a, w.b]);
      // 隔壁也是洞（楼梯间旁边的挑空）：不用栏杆
      for (const o of holes) {
        if (o === h) continue;
        const edge = s.axis === 'x' ? (s.inward > 0 ? o.y + o.d : o.y) : s.inward > 0 ? o.x + o.w : o.x;
        if (Math.abs(edge - s.c) < EPS) blocks.push(s.axis === 'x' ? [o.x, o.x + o.w] : [o.y, o.y + o.d]);
      }
      if (exit) {
        const sg = exit.seg;
        const onLine = s.axis === 'x' ? Math.abs(sg.y0 - s.c) < EPS && Math.abs(sg.y1 - s.c) < EPS : Math.abs(sg.x0 - s.c) < EPS && Math.abs(sg.x1 - s.c) < EPS;
        if (onLine) blocks.push(s.axis === 'x' ? [sg.x0, sg.x1] : [sg.y0, sg.y1]);
      }
      for (const [a, b] of minus(s.a, s.b, blocks)) out.push({ axis: s.axis, c: r3(s.c), a: r3(a), b: r3(b), inward: s.inward, room: h.id });
    }
  }
  return out;
}

/**
 * 扶手：楼梯每一跑没有墙的那一边（下层的墙），从下往上：[{ x1, y1, x2, y2, z1, z2, flight }]（z 从 from 那层地面量起，
 * 是踏步的线；扶手再高 0.9m 由 3D 加）。
 */
export function flightRails(plan0, stairId, wallsByFloor) {
  const plan = isV2(plan0) ? plan0 : migratePlan(plan0);
  const s = stairById(plan, stairId);
  if (!s) return [];
  const lower = floorById(plan, s.from);
  const ws = wallsByFloor?.[s.from] || buildWalls(lower);
  const g = flightsOf(s, riseOf(plan, s));
  const out = [];
  g.flights.forEach((fl, k) => {
    const { x0, y0, x1, y1 } = fl.rect;
    const [dx, dy] = DIRS[fl.dir];
    const vertical = dx === 0; // 沿 y 走
    const sideLines = vertical ? [x0, x1] : [y0, y1];
    const [a, b] = vertical ? [y0, y1] : [x0, x1];
    const len = b - a;
    const zAt = (t) => {
      // t = 沿着走的坐标（平面图 y 或 x）→ 高度
      const u = (vertical ? dy : dx) > 0 ? (t - a) / len : (b - t) / len;
      return r3(fl.z0 + (fl.z1 - fl.z0) * clamp(u, 0, 1));
    };
    for (const c of sideLines) {
      const blocks = ws.filter((w) => w.axis === (vertical ? 'z' : 'x') && Math.abs(w.c - c) < EPS).map((w) => [w.a, w.b]);
      for (const [p, q] of minus(a, b, blocks)) {
        const [t1, t2] = (vertical ? dy : dx) > 0 ? [p, q] : [q, p];
        const P1 = vertical ? { x: c, y: t1 } : { x: t1, y: c };
        const P2 = vertical ? { x: c, y: t2 } : { x: t2, y: c };
        out.push({ x1: r3(P1.x), y1: r3(P1.y), x2: r3(P2.x), y2: r3(P2.y), z1: zAt(t1), z2: zAt(t2), flight: k });
      }
    }
  });
  return out;
}

const SLIVER = 0.35; // 比这个窄的一条不算房间

/**
 * 楼梯的矩形贴到它压到的房间的边上：差不到 tol（默认 0.35m —— 挖出来会是一条太窄、只好丢掉的缝，墙会变成两道）就对齐过去。
 * rooms = 上下两层的房间（楼梯间自己不算）。
 */
export function fitRectToRooms(rooms, rect, tol = SLIVER) {
  let x0 = rect.x;
  let y0 = rect.y;
  let x1 = rect.x + rect.w;
  let y1 = rect.y + rect.d;
  for (const r of rooms || []) {
    if (r.stairId) continue;
    const ox = Math.min(r.x + r.w, x1) - Math.max(r.x, x0);
    const oy = Math.min(r.y + r.d, y1) - Math.max(r.y, y0);
    if (ox <= 0.05 || oy <= 0.05) continue;
    if (y0 > r.y + 1e-6 && y0 - r.y < tol) y0 = r.y;
    if (y1 < r.y + r.d - 1e-6 && r.y + r.d - y1 < tol) y1 = r.y + r.d;
    if (x0 > r.x + 1e-6 && x0 - r.x < tol) x0 = r.x;
    if (x1 < r.x + r.w - 1e-6 && r.x + r.w - x1 < tol) x1 = r.x + r.w;
  }
  return { ...rect, x: r2(x0), y: r2(y0), w: r2(x1 - x0), d: r2(y1 - y0) };
}

/**
 * 从一层的房间里挖掉一个矩形（放楼梯时让出位置）：被挖的房间切成最多 4 块（上、下整条，左右两块夹在中间），
 * 太窄的（< 0.35m）不要：上 / 下那一条太窄时，左右两块就一直长到房间的边（不会多出一道墙）。
 */
export function carveFloor(floor, rect, { keep = [] } = {}) {
  const keepIds = new Set(keep);
  const rooms = [];
  const used = new Set(floor.rooms.map((r) => r.id));
  for (const r of floor.rooms) {
    const ox = Math.min(r.x + r.w, rect.x + rect.w) - Math.max(r.x, rect.x);
    const oy = Math.min(r.y + r.d, rect.y + rect.d) - Math.max(r.y, rect.y);
    if (keepIds.has(r.id) || r.stairId || ox <= 0.05 || oy <= 0.05) {
      rooms.push(r);
      continue;
    }
    const pieces = [];
    const top = rect.y - r.y;
    const bot = r.y + r.d - (rect.y + rect.d);
    const lft = rect.x - r.x;
    const rgt = r.x + r.w - (rect.x + rect.w);
    const yy0 = top >= SLIVER ? rect.y : r.y;
    const yy1 = bot >= SLIVER ? rect.y + rect.d : r.y + r.d;
    if (top >= SLIVER) pieces.push({ x: r.x, y: r.y, w: r.w, d: top });
    if (bot >= SLIVER) pieces.push({ x: r.x, y: rect.y + rect.d, w: r.w, d: bot });
    if (lft > 0.05) pieces.push({ x: r.x, y: yy0, w: lft, d: yy1 - yy0 });
    if (rgt > 0.05) pieces.push({ x: rect.x + rect.w, y: yy0, w: rgt, d: yy1 - yy0 });
    const ok = pieces.filter((p) => p.w >= SLIVER && p.d >= SLIVER).sort((p, q) => q.w * q.d - p.w * p.d);
    ok.forEach((p, i) => {
      let id = r.id;
      if (i) {
        id = `${r.id}-${i + 1}`;
        while (used.has(id)) id = uid('r');
        used.add(id);
      }
      rooms.push({ ...r, id, x: r2(p.x), y: r2(p.y), w: r2(p.w), d: r2(p.d) });
    });
  }
  return { ...floor, rooms };
}

// ───────────────────────── 检查 ─────────────────────────

const issue = (code, level, floor, ids, zh, vars) => ({ code, level, floor, ids, zh, vars });

/** 矩形 r 里没被 cover（矩形列表）盖到的面积 */
function uncovered(r, cover) {
  const cs = cover.filter((c) => c.x < r.x + r.w && c.x + c.w > r.x && c.y < r.y + r.d && c.y + c.d > r.y);
  const xs = uniq([r.x, r.x + r.w, ...cs.flatMap((c) => [c.x, c.x + c.w])].filter((v) => v >= r.x - 1e-9 && v <= r.x + r.w + 1e-9));
  const ys = uniq([r.y, r.y + r.d, ...cs.flatMap((c) => [c.y, c.y + c.d])].filter((v) => v >= r.y - 1e-9 && v <= r.y + r.d + 1e-9));
  let a = 0;
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      if (!cs.some((c) => inRect(c, cx, cy))) a += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    }
  return a;
}

/** 楼梯口（seg 外面）那一侧：有没有房间（不是洞）、有没有被实墙挡住 */
function mouthBlocked(plan, f, walls, seg, edge, stairRoomId) {
  const p = outOf(midSeg(seg), edge, 0.15);
  const room = f.rooms.find((r) => r.id !== stairRoomId && inRect(r, p.x, p.y));
  if (!room) return true;
  if (holesOf(plan, f).includes(room)) return true;
  const horiz = Math.abs(seg.y0 - seg.y1) < EPS;
  const axis = horiz ? 'x' : 'z';
  const c = horiz ? seg.y0 : seg.x0;
  const [a, b] = horiz ? [seg.x0, seg.x1] : [seg.y0, seg.y1];
  let pass = b - a;
  for (const w of walls) {
    if (w.axis !== axis || Math.abs(w.c - c) > EPS) continue;
    for (const pc of w.pieces) {
      if (pc.kind === 'door' || pc.kind === 'slider' || pc.kind === 'open') continue;
      pass -= Math.max(0, Math.min(b, pc.b) - Math.max(a, pc.a));
    }
  }
  return pass < Math.min(0.7, (b - a) * 0.6);
}

/**
 * 检查（编辑器里提示，不阻止）：v1 或 v2 都可以。→ Issue[]，[] = 没问题。
 * Issue = { code, level: 'warn' | 'error', floor: floorId | null, ids, zh: '…{0}…', vars: [{ room } | { floor } | 数字 | 字] }
 * 界面：t(issue.zh, vars.map(v => v.room ? 房间名 : v.floor ? t(floorName) : v))
 */
export function checkPlan(raw) {
  const out = [];
  const plan = migratePlan(raw);
  const v2raw = isV2(raw) ? raw : null;
  const n = plan.floors.length;
  // 原样的数字（规范化之前）：楼层高太低、楼梯间和楼梯对不上
  if (v2raw) {
    v2raw.floors.forEach((f, i) => {
      if (!isObj(f) || i >= n - 1) return;
      const h = num(f.height, NaN);
      const c = num(f.ceil, NaN);
      if (Number.isFinite(h) && Number.isFinite(c) && h < c + 0.2 - 1e-9) out.push(issue('heights', 'warn', plan.floors[i].id, [], '{0}的楼层高 {1} m 比天花高 {2} m 加楼板还低', [{ floor: plan.floors[i].id }, r2(h), r2(c)]));
    });
    for (const s of Array.isArray(v2raw.stairs) ? v2raw.stairs : []) {
      if (!isObj(s)) continue;
      const bad = [s.from, s.to].some((fid) => {
        const f = v2raw.floors.find((x) => isObj(x) && x.id === fid);
        if (!f) return false;
        const rs = (f.rooms || []).filter((r) => isObj(r) && r.stairId === s.id);
        return rs.length !== 1 || ['x', 'y', 'w', 'd'].some((k) => Math.abs(num(rs[0][k], 0) - num(s[k], 0)) > 0.02);
      });
      if (bad && floorById(plan, s.from) && floorById(plan, s.to)) out.push(issue('stairMismatch', 'error', s.from, [s.id], '楼梯在{0}和{1}的位置不一样', [{ floor: s.from }, { floor: s.to }]));
    }
  }
  for (const f of plan.floors) {
    const rs = f.rooms;
    for (let i = 0; i < rs.length; i++) {
      const a = rs[i];
      if (!a.stairId && (a.w < 0.8 || a.d < 0.8)) out.push(issue('tiny', 'warn', f.id, [a.id], '{0} 太小了', [{ room: a.id }]));
      for (let j = i + 1; j < rs.length; j++) {
        const b = rs[j];
        if (a.stairId && b.stairId) continue; // 叠起来的楼梯（下来的、上去的）在同一个楼梯间
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
        if (ox > 0.1 && oy > 0.1) out.push(issue('overlap', 'error', f.id, [a.id, b.id], '{0} 和 {1} 重叠了', [{ room: a.id }, { room: b.id }]));
      }
      if (f.level === 0 && ROOM_TYPES[a.type]?.void) out.push(issue('voidLow', 'error', f.id, [a.id], '{0}在一楼，不能做挑空', [{ room: a.id }]));
    }
  }
  // 楼上：有没有楼梯上来；有没有悬空
  for (let k = 1; k < n; k++) {
    const f = plan.floors[k];
    const lo = plan.floors[k - 1];
    if (!plan.stairs.some((s) => s.to === f.id)) out.push(issue('noStairs', 'warn', f.id, [], '{0}没有楼梯连到{1}', [{ floor: f.id }, { floor: lo.id }]));
    const support = lo.rooms;
    const reach = support.map((r) => ({ x: r.x - 1.5, y: r.y - 1.5, w: r.w + 3, d: r.d + 3 }));
    for (const r of f.rooms) {
      const t = ROOM_TYPES[r.type];
      if (r.stairId || t?.void || r.type === 'stair') continue;
      const a = uncovered(r, r.type === 'balcony' ? reach : support);
      if (a > 0.5) out.push(issue('overhang', 'warn', f.id, [r.id], '{0}的 {1} 下面是空的（约 {2} ㎡）', [{ floor: f.id }, { room: r.id }, +a.toFixed(1)]));
    }
  }
  // 楼梯：够不够长、够不够宽、上下口有没有被墙挡住
  const wallsBy = {};
  const wallsOf = (f) => (wallsBy[f.id] ||= buildWalls(f));
  for (const s of plan.stairs) {
    const g = flightsOf(s, riseOf(plan, s));
    if (g.tread < TREAD_MIN - 1e-9) out.push(issue('stairShort', 'warn', s.from, [`${s.id}-${s.from}`], '楼梯太短：{0} 级踏步需要 {1} m，现在只有 {2} m', [g.risers, g.need, g.avail]));
    if (g.width < 0.85 - 1e-9) out.push(issue('stairNarrow', 'warn', s.from, [`${s.id}-${s.from}`], '楼梯太窄：{0} m', [r2(g.width)]));
    const lo = floorById(plan, s.from);
    const hi = floorById(plan, s.to);
    // 还没画房间的一层（刚加的空白二楼）不算「被墙挡住」：编辑器会提示沿着虚线画
    const drawn = (f) => f.rooms.some((r) => !r.stairId && r.type !== 'stair');
    if (drawn(lo) && mouthBlocked(plan, lo, wallsOf(lo), g.entry.seg, g.entry.edge, `${s.id}-${lo.id}`)) out.push(issue('stairBlocked', 'error', lo.id, [`${s.id}-${lo.id}`], '{0}的楼梯口被墙挡住了', [{ floor: lo.id }]));
    if (drawn(hi) && mouthBlocked(plan, hi, wallsOf(hi), g.exit.seg, g.exit.edge, `${s.id}-${hi.id}`)) out.push(issue('stairBlocked', 'error', hi.id, [`${s.id}-${hi.id}`], '{0}的楼梯口被墙挡住了', [{ floor: hi.id }]));
  }
  return out;
}

// ───────────────────────── 户型模板 ─────────────────────────

const R = (id, type, x, y, w, d, name) => ({ id, type, name: name || ROOM_TYPES[type].zh, x, y, w, d });
const O = (id, kind, x1, y1, x2, y2, extra = {}) => ({ id, kind, x1, y1, x2, y2, ...extra });
const one = (p) => migratePlan({ ...p, v: 1 });

const CONDO3 = one({
  name: '公寓 · 3 房 2 卫',
  wallH: 2.8,
  north: 0,
  rooms: [
    R('kit', 'kitchen', 0, 0, 3.0, 3.0),
    R('din', 'dining', 3.0, 0, 3.6, 3.0),
    R('liv', 'living', 0, 3.0, 6.6, 4.5),
    R('bal', 'balcony', 0, 7.5, 4.2, 1.5),
    R('foy', 'foyer', 4.2, 7.5, 2.4, 1.5),
    R('bd2', 'bedroom', 6.6, 0, 3.0, 3.2, '次卧'),
    R('std', 'study', 9.6, 0, 2.4, 3.2),
    R('cor', 'corridor', 6.6, 3.2, 5.4, 1.0),
    R('bth', 'bath', 6.6, 4.2, 1.8, 2.4, '公共浴室'),
    R('mst', 'master', 8.4, 4.2, 3.6, 4.8),
    R('mbt', 'bath', 6.6, 6.6, 1.8, 2.4, '主卧浴室'),
  ],
  openings: [
    O('d-main', 'door', 4.95, 9.0, 5.95, 9.0),
    O('d-kit', 'door', 3.0, 1.6, 3.0, 2.5),
    O('s-bal', 'slider', 0.5, 7.5, 3.7, 7.5),
    O('d-bd2', 'door', 6.85, 3.2, 7.75, 3.2),
    O('d-std', 'door', 10.6, 3.2, 11.5, 3.2),
    O('d-bth', 'door', 6.85, 4.2, 7.65, 4.2),
    O('d-mst', 'door', 8.7, 4.2, 9.6, 4.2),
    O('d-mbt', 'door', 8.4, 7.9, 8.4, 8.7),
    O('w-kit', 'window', 0.7, 0, 2.2, 0),
    O('w-din', 'window', 3.9, 0, 5.7, 0),
    O('w-liv', 'window', 0, 3.6, 0, 6.6, { sill: 0.45 }),
    O('w-bd2', 'window', 7.4, 0, 8.9, 0),
    O('w-std', 'window', 12.0, 0.6, 12.0, 2.4),
    O('w-mst', 'window', 12.0, 5.0, 12.0, 7.8, { sill: 0.45 }),
    O('w-mst2', 'window', 9.4, 9.0, 11.2, 9.0),
  ],
});

// 旧的「排屋一楼」：不在模板列表里出现（hidden），但旧方案 / 链接里写着 'terrace' 的还找得到
const TERRACE_LEGACY = one({
  name: '排屋一楼',
  wallH: 3.0,
  north: 90,
  rooms: [
    R('por', 'porch', 0, 12.4, 6.6, 1.8, '前院 / 车廊'),
    R('liv', 'living', 0, 7.2, 6.6, 5.2),
    R('din', 'dining', 0, 3.8, 4.2, 3.4),
    // 客房 2.4 × 3.0：床（2.05 + 床尾 0.6）放得下，床头靠楼梯那面墙、不背浴室
    R('stair', 'store', 4.2, 4.8, 2.4, 2.4, '楼梯 / 储物'),
    R('kit', 'kitchen', 0, 0, 4.2, 3.8, '干湿厨房'),
    R('bth', 'bath', 4.2, 0, 2.4, 1.8, '浴室'),
    R('gst', 'bedroom', 4.2, 1.8, 2.4, 3.0, '客房'),
  ],
  openings: [
    O('d-main', 'slider', 1.6, 12.4, 4.6, 12.4),
    O('o-dk', 'open', 0.6, 3.8, 3.6, 3.8),
    O('d-stair', 'open', 4.4, 7.2, 6.2, 7.2),
    O('d-gst', 'door', 4.2, 3.9, 4.2, 4.7),
    O('d-bth', 'door', 4.2, 0.9, 4.2, 1.7),
    O('w-kit', 'window', 0.8, 0, 3.4, 0),
    O('w-gst', 'window', 6.6, 2.2, 6.6, 3.4, { sill: 1.2 }),
  ],
});

const STUDIO = one({
  name: '小公寓 · 1 房',
  wallH: 2.8,
  north: 0,
  rooms: [
    R('kit', 'kitchen', 0, 0, 2.6, 2.6, '开放厨房'),
    R('din', 'dining', 2.6, 0, 2.2, 2.6),
    R('liv', 'living', 0, 2.6, 4.8, 4.0, '客厅'),
    R('mst', 'master', 4.8, 0, 3.6, 4.0, '卧室'),
    R('foy', 'foyer', 4.8, 4.0, 1.8, 2.6),
    R('bth', 'bath', 6.6, 4.0, 1.8, 2.6),
  ],
  openings: [
    O('o-kit', 'open', 0.3, 2.6, 2.3, 2.6),
    O('o-kd', 'open', 2.6, 0.3, 2.6, 2.3),
    O('d-main', 'door', 5.25, 6.6, 6.15, 6.6),
    O('d-mst', 'door', 5.25, 4.0, 6.15, 4.0),
    O('d-bth', 'door', 6.6, 4.6, 6.6, 5.4),
    O('w-liv', 'slider', 0, 3.2, 0, 6.0),
    O('w-mst', 'window', 5.4, 0, 7.8, 0, { sill: 0.45 }),
    O('w-mst2', 'window', 8.4, 1.0, 8.4, 3.0),
    O('w-kit', 'window', 0.5, 0, 2.0, 0),
    O('w-bth', 'window', 8.4, 4.6, 8.4, 5.4, { sill: 1.5 }),
  ],
});

// 20 × 70 尺中间排屋（地 6.10 × 21.34m）：屋宽 6.1（分户墙中线），一楼深 15.2 + 车廊 5.5；直跑楼梯沿分户墙
const TERRACE2 = migratePlan({
  v: 2,
  name: '双层排屋 · 20×70',
  north: 90,
  floors: [
    {
      id: 'gf',
      level: 0,
      name: '',
      height: 3.35,
      ceil: 3.0,
      rooms: [
        R('g-yard', 'utility', 0, 0, 6.1, 1.8, '后院 / 晒衣处'),
        R('g-wkit', 'kitchen', 0, 1.8, 3.3, 2.6, '湿厨房'),
        R('g-gbth', 'bath', 3.3, 1.8, 2.8, 1.5, '客浴'),
        R('g-gbd', 'bedroom', 3.3, 3.3, 2.8, 3.3, '客房'),
        R('g-dkit', 'kitchen', 0, 4.4, 3.3, 2.2, '干厨房'),
        R('g-din', 'dining', 0, 6.6, 5.1, 3.4),
        R('g-stair', 'stair', 5.1, 6.6, 1.0, 4.6),
        R('g-liv', 'living', 0, 10.0, 5.1, 5.2),
        R('g-foy', 'foyer', 5.1, 11.2, 1.0, 4.0),
        R('g-por', 'porch', 0, 15.2, 6.1, 5.5, '车廊'),
      ],
      openings: [
        O('d-main', 'door', 5.15, 15.2, 6.05, 15.2),
        O('s-liv', 'slider', 0.5, 15.2, 4.5, 15.2),
        O('o-dk', 'open', 0.3, 6.6, 3.0, 6.6),
        O('d-wk', 'door', 1.2, 4.4, 2.1, 4.4),
        O('d-yard', 'door', 1.2, 1.8, 2.1, 1.8),
        O('d-gbd', 'door', 3.6, 6.6, 4.5, 6.6),
        // 客浴（2.8 × 1.5）的门在南墙东头：淋浴放得进离门最远的西北角，马桶、浴室柜也都放得下
        O('d-gbth', 'door', 5.15, 3.3, 5.95, 3.3),
        O('d-back', 'door', 4.6, 0, 5.5, 0),
        O('w-yard', 'window', 0.8, 0, 3.8, 0, { sill: 1.0 }),
        O('w-wk', 'window', 2.2, 1.8, 3.1, 1.8, { sill: 1.05 }),
        O('w-gbth', 'window', 4.0, 1.8, 4.8, 1.8, { sill: 1.5 }),
      ],
    },
    {
      id: 'ff',
      level: 1,
      name: '',
      height: 3.2,
      ceil: 2.9,
      rooms: [
        R('f-bd3', 'bedroom', 0, 1.8, 3.3, 3.6, '卧室 3'),
        R('f-bd2', 'bedroom', 3.3, 1.8, 2.8, 3.6, '卧室 2'),
        R('f-cbth', 'bath', 0, 5.4, 2.1, 2.2, '公共浴室'),
        R('f-cor1', 'corridor', 2.1, 5.4, 3.0, 2.2),
        R('f-cor2', 'corridor', 5.1, 5.4, 1.0, 1.2),
        R('f-stair', 'stair', 5.1, 6.6, 1.0, 4.6),
        R('f-fam', 'family', 0, 7.6, 5.1, 3.6),
        R('f-mst', 'master', 0, 11.2, 4.1, 4.0),
        R('f-wir', 'walkin', 4.1, 11.2, 2.0, 2.0),
        R('f-mbth', 'bath', 4.1, 13.2, 2.0, 2.0, '主卧浴室'),
        R('f-bal', 'balcony', 0, 15.2, 6.1, 1.4),
      ],
      openings: [
        O('d-bd3', 'door', 2.25, 5.4, 3.15, 5.4),
        O('d-bd2', 'door', 3.5, 5.4, 4.4, 5.4),
        O('d-cbth', 'door', 2.1, 6.0, 2.1, 6.8),
        O('d-mst', 'door', 3.0, 11.2, 3.9, 11.2),
        O('d-wir', 'door', 4.1, 11.6, 4.1, 12.4),
        // 主卧浴室（2.0 × 2.0）的门靠北一点：淋浴、马桶、浴室柜三样才都放得下
        O('d-mbth', 'door', 4.1, 13.45, 4.1, 14.25),
        O('s-bal', 'slider', 0.5, 15.2, 3.6, 15.2),
        O('w-bd3', 'window', 0.8, 1.8, 2.6, 1.8),
        O('w-bd2', 'window', 3.9, 1.8, 5.5, 1.8),
        O('w-mbth', 'window', 4.6, 15.2, 5.6, 15.2, { sill: 1.5 }),
      ],
    },
  ],
  stairs: [{ id: 's1', from: 'gf', to: 'ff', x: 5.1, y: 6.6, w: 1.0, d: 4.6, shape: 'straight', up: 'N' }],
});

// 40 × 80 尺半独立（地 12.19 × 24.38m）：屋宽 9.6（x = 0 是分户墙，x = 9.6 外面是侧院），深 14.4 + 双车位车廊 6.0；U 形楼梯
const SEMID2 = migratePlan({
  v: 2,
  name: '双层半独立 · 40×80',
  north: 90,
  floors: [
    {
      id: 'gf',
      level: 0,
      name: '',
      height: 3.4,
      ceil: 3.0,
      rooms: [
        R('g-yard', 'utility', 0, 0, 3.6, 1.6, '后院 / 晒衣处'),
        R('g-wkit', 'kitchen', 0, 1.6, 3.6, 2.4, '湿厨房'),
        R('g-gbth', 'bath', 3.6, 0, 2.2, 2.2, '客浴'),
        R('g-hall', 'corridor', 3.6, 2.2, 2.2, 4.2),
        R('g-gbd', 'bedroom', 5.8, 0, 3.8, 4.0, '客房'),
        R('g-stair', 'stair', 0, 4.0, 3.6, 2.4),
        R('g-dkit', 'kitchen', 5.8, 4.0, 3.8, 2.4, '干厨房'),
        R('g-din', 'dining', 0, 6.4, 5.8, 4.0),
        R('g-fam', 'family', 5.8, 6.4, 3.8, 4.0),
        R('g-liv', 'living', 0, 10.4, 9.6, 4.0),
        R('g-por', 'porch', 0, 14.4, 9.6, 6.0, '车廊'),
      ],
      openings: [
        O('d-main', 'door', 6.6, 14.4, 7.6, 14.4),
        O('s-liv', 'slider', 0.6, 14.4, 5.6, 14.4),
        O('d-yard', 'door', 0.4, 1.6, 1.3, 1.6),
        // 湿厨房的门靠北一点：门扇不压到南墙那一排台面（冰箱 + 水槽 + 灶台都在那一排）
        O('d-wk', 'door', 3.6, 2.3, 3.6, 3.2),
        O('d-gbth', 'door', 3.9, 2.2, 4.7, 2.2),
        O('d-gbd', 'door', 5.8, 2.5, 5.8, 3.4),
        O('o-dk', 'open', 6.2, 6.4, 9.2, 6.4),
        O('o-hk', 'open', 5.8, 4.4, 5.8, 6.0),
        O('w-wk', 'window', 1.2, 1.6, 2.6, 1.6, { sill: 1.05 }),
        O('w-gbth', 'window', 4.2, 0, 5.2, 0, { sill: 1.5 }),
        O('w-gbd', 'window', 9.6, 1.0, 9.6, 3.0),
        O('w-dk', 'window', 9.6, 4.6, 9.6, 5.8, { sill: 1.05 }),
        O('w-fam', 'window', 9.6, 7.2, 9.6, 9.6, { sill: 0.45 }),
        O('w-liv', 'window', 9.6, 11.0, 9.6, 13.6, { sill: 0.45 }),
        O('w-yard', 'window', 0.6, 0, 3.0, 0, { sill: 1.0 }),
      ],
    },
    {
      id: 'ff',
      level: 1,
      name: '',
      height: 3.2,
      ceil: 2.9,
      rooms: [
        R('f-bd3', 'bedroom', 0, 0, 3.6, 4.0, '卧室 3'),
        R('f-cbth', 'bath', 3.6, 0, 2.2, 2.2, '公共浴室'),
        R('f-bd2', 'bedroom', 5.8, 0, 3.8, 4.0, '卧室 2'),
        R('f-hall', 'corridor', 3.6, 2.2, 2.2, 4.2),
        R('f-stair', 'stair', 0, 4.0, 3.6, 2.4),
        R('f-bth2', 'bath', 5.8, 4.0, 3.8, 2.4, '浴室'),
        R('f-fam', 'family', 0, 6.4, 5.8, 4.0),
        R('f-bd4', 'bedroom', 5.8, 6.4, 3.8, 4.0, '卧室 4'),
        R('f-mst', 'master', 0, 10.4, 5.8, 4.0),
        R('f-wir', 'walkin', 5.8, 10.4, 3.8, 2.0),
        R('f-mbth', 'bath', 5.8, 12.4, 3.8, 2.0, '主卧浴室'),
        R('f-bal', 'balcony', 0, 14.4, 5.8, 1.4),
      ],
      openings: [
        O('d-bd3', 'door', 3.6, 2.6, 3.6, 3.5),
        O('d-cbth', 'door', 4.2, 2.2, 5.0, 2.2),
        O('d-bd2', 'door', 5.8, 2.6, 5.8, 3.5),
        O('d-bth2', 'door', 5.8, 4.6, 5.8, 5.4),
        O('d-bd4', 'door', 5.8, 7.0, 5.8, 7.9),
        O('d-mst', 'door', 4.2, 10.4, 5.1, 10.4),
        O('d-wir', 'door', 5.8, 10.8, 5.8, 11.6),
        O('d-mbth', 'door', 5.8, 12.9, 5.8, 13.7),
        O('s-bal', 'slider', 0.6, 14.4, 4.6, 14.4),
        O('w-bd3', 'window', 0.8, 0, 2.8, 0),
        O('w-cbth', 'window', 4.2, 0, 5.2, 0, { sill: 1.5 }),
        O('w-bd2', 'window', 6.4, 0, 8.8, 0),
        O('w-bd2s', 'window', 9.6, 1.0, 9.6, 3.0),
        O('w-bth2', 'window', 9.6, 4.6, 9.6, 5.8, { sill: 1.5 }),
        O('w-bd4', 'window', 9.6, 7.2, 9.6, 9.6),
        O('w-wir', 'window', 9.6, 10.8, 9.6, 11.8, { sill: 1.5 }),
        O('w-mbth', 'window', 9.6, 12.8, 9.6, 13.8, { sill: 1.5 }),
        O('w-mbth2', 'window', 6.6, 14.4, 8.8, 14.4, { sill: 1.5 }),
      ],
    },
  ],
  stairs: [{ id: 's1', from: 'gf', to: 'ff', x: 0, y: 4.0, w: 3.6, d: 2.4, shape: 'U', up: 'W', turn: 'right' }],
});

// 规格段：中文卡片第二行就是英文全名（房 / 卫 + 面积）
export const TEMPLATES = [
  { id: 'condo3', zh: '公寓 · 3 房 2 卫', en: 'Condo · 3R2B · ~1,100 sqft', plan: CONDO3 },
  { id: 'terrace2', zh: '双层排屋 · 20×70', en: 'Double-storey terrace · 20×70 ft · 4R3B · ~1,880 sqft', plan: TERRACE2 },
  { id: 'semid2', zh: '双层半独立 · 40×80', en: 'Double-storey semi-D · 40×80 ft · 5R4B · ~2,980 sqft', plan: SEMID2 },
  { id: 'studio', zh: '小公寓 · 1 房', en: 'Studio · 1R1B · ~650 sqft', plan: STUDIO },
  // 一楼 6.6 × 14.2m（含车廊）≈ 94㎡；22×70 是地皮尺寸（英尺）。旧版的模板，列表里不出现
  { id: 'terrace', zh: '排屋一楼 · 22×70', en: 'Terrace house · Ground floor · 1R1B · ~1,000 sqft', plan: TERRACE_LEGACY, hidden: true },
];

/** 模板的 plan（v2，一份新的拷贝）；找不到 id → 第一个（condo3） */
export function templatePlan(id) {
  const t = TEMPLATES.find((x) => x.id === id) || TEMPLATES[0];
  return JSON.parse(JSON.stringify(t.plan));
}
