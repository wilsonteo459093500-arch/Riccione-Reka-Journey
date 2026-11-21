// 柜子细节 · 规则（纯 JS：Node 和浏览器都能跑，不碰 three）。
//
// 方案上多一块 `cab`（没有 = 旧方案，画面一个像素都不变）：
//   cab = { v: 1, g: { <组>: { door, drawer, body, side, plinth, open } } }      每一项 = 材质 id（溪岸板材 / 程序化材质）
// 「没填就照旧」：某一组的某个部分没填 → 顺着 CHAIN 找（抽屉面 → 柜门，柜体 → 柜门，侧板 → 柜门，开放格 → 柜体 → 柜门）；
// 一路都没填 → 这件柜子原来的颜色位（cabinetry / woodwork / feature），踢脚 → 原来的黑色。
//
// 引擎问的是 decide()：给一个「材质钥匙」——
//   'cab:<组>:<部分>'    这组这个部分自己设了板材
//   'cab:<组>:~<颜色位>'  没设，跟着原来的颜色位（单独一个材质：点一行那组能发光、拖板材能认出是哪一组）
//   null                 不归我们管（活动家具、踢脚没设）→ 原来的材质
// matIdOf(key, cab, materials) 再把钥匙换成材质 id。

import { SEED } from './seed.js';

/** 12 组。slot = 没设时跟哪个颜色位（书柜跟它自己的：自动摆的是 woodwork，设计师加的是 cabinetry） */
export const GROUPS = [
  { id: 'base', zh: '地柜', en: 'Base cabinets' },
  { id: 'wall', zh: '吊柜', en: 'Wall cabinets' },
  { id: 'tall', zh: '高柜', en: 'Tall units' },
  { id: 'island', zh: '中岛', en: 'Island' },
  { id: 'tv', zh: '电视柜', en: 'TV cabinet' },
  { id: 'wardrobe', zh: '衣柜', en: 'Wardrobes' },
  { id: 'shoe', zh: '鞋柜', en: 'Shoe cabinet' },
  { id: 'book', zh: '书柜', en: 'Bookshelves' },
  { id: 'vanity', zh: '浴室柜', en: 'Vanity' },
  { id: 'other', zh: '其他柜', en: 'Other cabinets' },
];
export const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

/** 家具种类（CATALOG 的 kind）→ 组。橱柜（kitchenRun）下面那排 = 地柜，上面那排由 furniture.js 标成 'wall' */
export const KIND_GROUP = {
  kitchenRun: 'base',
  tallUnit: 'tall',
  island: 'island',
  tvWall: 'tv',
  wardrobe: 'wardrobe',
  shoeCabinet: 'shoe',
  bookshelf: 'book',
  vanity: 'vanity',
  sideboard: 'other',
  displayCabinet: 'other',
  altar: 'other',
  toyStorage: 'other',
};

/** 部分。zh 是面板上的名字；follow = 没设时写的那句 */
export const PARTS = [
  { id: 'door', zh: '柜门', en: 'Doors' },
  { id: 'drawer', zh: '抽屉面', en: 'Drawer fronts' },
  { id: 'body', zh: '柜体', en: 'Carcass' },
  { id: 'side', zh: '侧板', en: 'End panels' },
  { id: 'open', zh: '开放格', en: 'Open shelves' },
  { id: 'plinth', zh: '踢脚', en: 'Plinth' },
];
export const PART_BY_ID = Object.fromEntries(PARTS.map((p) => [p.id, p]));

/** furniture.js 的 K() 用一个字母：b 柜体 d 柜门 w 抽屉面 p 踢脚 o 开放格；s 侧板（runtime 后补的） */
const CODE = { b: 'body', d: 'door', w: 'drawer', p: 'plinth', o: 'open', s: 'side' };
/** 没设时往哪里找 */
export const CHAIN = {
  door: ['door'],
  drawer: ['drawer', 'door'],
  body: ['body', 'door'],
  side: ['side', 'door'],
  open: ['open', 'body', 'door'],
  plinth: ['plinth'],
};
/** 能跟的颜色位（柜子原来用的那几个） */
const FOLLOW = { cabinetry: 1, woodwork: 1, feature: 1 };

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

/** 这件家具的这一段算哪一组（groupOv：furniture.js 标的，橱柜上面那排 = 'wall'）；不是定制柜 = null */
export function groupOf(kind, groupOv) {
  return KIND_GROUP[kind] ? groupOv || KIND_GROUP[kind] : null;
}

/** 这组这个部分实际用的是哪一个设定（'door' | 'body' …）；一路都没设 = null */
export function sourcePart(cab, group, part) {
  const g = cab?.g?.[group];
  if (!isObj(g)) return null;
  for (const p of CHAIN[part] || []) if (typeof g[p] === 'string' && g[p]) return p;
  return null;
}

/**
 * 引擎建一件柜子的一个部分时问：用哪个材质（钥匙）。
 * @param part 一个字母（CODE）或部分 id；legacyKey 原来的颜色位 / 固定材质名（'cabinetry' 'woodwork' 'feature' 'black'）
 */
export function decide(cab, kind, part, legacyKey, groupOv) {
  const group = groupOf(kind, groupOv);
  if (!group) return null;
  const p = CODE[part] || part;
  const src = sourcePart(cab, group, p);
  if (src) return `cab:${group}:${src}`;
  return p !== 'plinth' && FOLLOW[legacyKey] ? `cab:${group}:~${legacyKey}` : null;
}

/** 钥匙 → { group, part } 或 { group, follow }（不是我们的钥匙 = null） */
export function parseKey(key) {
  const m = /^cab:([a-z]+):(~?)([a-z]+)$/.exec(String(key || ''));
  if (!m) return null;
  return m[2] ? { group: m[1], follow: m[3] } : { group: m[1], part: m[3] };
}

/** 钥匙 → 材质 id（没有 = null） */
export function matIdOf(key, cab, materials) {
  const k = parseKey(key);
  if (!k) return null;
  if (k.follow) return materials?.[k.follow] || null;
  return cab?.g?.[k.group]?.[k.part] || null;
}

/** 面板上一行要显示的：这组这个部分现在是什么（own = 自己设的；from = 跟着哪个部分 / 颜色位） */
export function partInfo(cab, materials, group, part, legacySlot = 'cabinetry') {
  const src = sourcePart(cab, group, part);
  if (src) return { matId: cab.g[group][src], own: src === part, from: src === part ? null : src };
  if (part === 'plinth') return { matId: null, own: false, from: null };
  return { matId: materials?.[legacySlot] || null, own: false, from: part === 'door' ? null : 'door', slot: legacySlot };
}

/** 这个家里有哪几组（按 GROUPS 的顺序）+ 每组有几件、原来的颜色位（面板显示「没设」时的颜色用）。橱柜没有吊柜（upper === false）就没有吊柜组 */
export function groupsIn(furniture) {
  const n = {};
  const slot = {};
  const add = (g, s) => {
    n[g] = (n[g] || 0) + 1;
    slot[g] = slot[g] || s;
  };
  for (const it of Array.isArray(furniture) ? furniture : []) {
    const g = KIND_GROUP[it?.kind];
    if (!g) continue;
    add(g, it.kind === 'bookshelf' ? it.key || 'woodwork' : 'cabinetry');
    if (it.kind === 'kitchenRun' && it.upper !== false) add('wall', 'cabinetry');
  }
  return GROUPS.filter((g) => n[g.id]).map((g) => ({ ...g, count: n[g.id], slot: slot[g.id] }));
}

/** 整理：空的组拿掉、不认识的组 / 部分拿掉；什么都没剩 = undefined（方案上就没有 cab 这一块，回到旧方案的样子） */
export function cleanCab(cab) {
  if (!isObj(cab) || !isObj(cab.g)) return undefined;
  const g = {};
  for (const G of GROUPS) {
    const src = cab.g[G.id];
    if (!isObj(src)) continue;
    const out = {};
    for (const P of PARTS) if (typeof src[P.id] === 'string' && src[P.id]) out[P.id] = src[P.id];
    if (Object.keys(out).length) g[G.id] = out;
  }
  return Object.keys(g).length ? { v: 1, g } : undefined;
}

/** 设一组的一个部分（matId 空 = 拿掉，回到「跟着」）→ 新的 cab（或 undefined） */
export function setPart(cab, group, part, matId) {
  if (!GROUP_BY_ID[group] || !PART_BY_ID[part]) return cleanCab(cab);
  const g = { ...(isObj(cab?.g) ? cab.g : {}) };
  const cur = { ...(isObj(g[group]) ? g[group] : {}) };
  if (matId) cur[part] = matId;
  else delete cur[part];
  g[group] = cur;
  return cleanCab({ v: 1, g });
}

/** 方案里用到的全部材质 id（去重） */
export function cabMatIds(cab) {
  const out = new Set();
  for (const g of Object.values(isObj(cab?.g) ? cab.g : {})) for (const id of Object.values(isObj(g) ? g : {})) if (typeof id === 'string' && id) out.add(id);
  return [...out];
}

// ───────────────────────── 一键搭配 ─────────────────────────
//
// 板材是业主 2026-11-21 选的（软件不自己挑）：名字、编号、颜色照《SAIL 产品标准设计手册》的整理稿
// （src/shared/boards/catalog-seed.json；test/cabinet.test.mjs 逐项比，手册改了这里跟着红）。
// 这台设备导入了同一个编号的真板材 → 用真的；没导入 → 先用手册上的颜色，面板上标「示意色」（业主选的）。

export { SEED };

/** 手册条目 → 材质 id（'sail-m-…'：导入器只会给 sail-<数字> / sail-c… / sail-x…，测试用 sail-t-…，不会撞） */
export const seedId = (key) => `sail-m-${String(key).toLowerCase()}`;
const SEED_BY_ID = Object.fromEntries(Object.keys(SEED).map((k) => [seedId(k), k]));
/** 这个 id 是不是「手册颜色」的板（还没导入贴图的示意色）；是 → 手册条目的 key */
export const seedKeyOf = (id) => SEED_BY_ID[id] || null;

/** 手册条目 → 板材记录（library-api.js 的形状；img: false = 只有资料，3D 用这个颜色的近似贴图；hidden：不进板材栏） */
export function seedRecord(key) {
  const e = SEED[key];
  if (!e) return null;
  return { id: seedId(key), rev: 1, seq: null, code: e.code, name: { zh: e.name, en: '' }, series: e.series, kind: e.kind, grain: e.grain, finish: e.finish, ...(e.proc ? { proc: e.proc } : {}), hex: e.hex, img: false, hidden: true };
}

const slug = (c) =>
  String(c || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/**
 * 手册颜色的板 → 这台设备上同一个编号的真板材（有 = 它的 id；没有 = 原样）。
 * boards = 登记的板材（materials.js 的 BOARDS：材质对象，.board.code）。别的 id 原样返回。
 */
export function realOf(id, boards) {
  const key = seedKeyOf(id);
  if (!key) return id;
  const want = new Set(SEED[key].codes.map(slug));
  const hit = (Array.isArray(boards) ? boards : []).find((m) => m?.board && !m.board.hidden && m.board.kind !== 'weave' && want.has(slug(m.board.code)));
  return hit ? hit.id : id;
}

/**
 * 4 个一键搭配。roles：每个角色用哪块（手册条目的 key；null = 现在柜子上那个色）；set：哪一组的哪个部分用哪个角色。
 * only：只动这几组（别的组原样留着）；没有 only = 整套换掉（没列到的组回到「跟着」）。
 */
export const PRESETS = [
  { id: 'one', zh: '全屋统一', en: 'One colour', roles: {}, set: {} },
  {
    id: 'updown',
    zh: '上浅下深',
    en: 'Light above, dark below',
    roles: { light: 'pb-AK096', dark: 'pb-AG275' },
    set: { wall: { door: 'light' }, wardrobe: { door: 'light' }, shoe: { door: 'light' }, base: { door: 'dark' }, island: { door: 'dark' }, tall: { door: 'dark' }, tv: { door: 'dark' }, vanity: { door: 'dark' } },
  },
  {
    id: 'kitchen',
    zh: '双色厨房',
    en: 'Two-tone kitchen',
    roles: { upper: 'pb-AG294', lower: 'pb-AG150' },
    only: ['base', 'wall', 'tall', 'island'],
    set: { wall: { door: 'upper' }, tall: { door: 'upper' }, base: { door: 'lower' }, island: { door: 'lower' } },
  },
  {
    id: 'wabi',
    zh: '原木侘寂',
    en: 'Natural wood wabi-sabi',
    roles: { wood: 'vn-XA-TP-03', dark: 'pb-AK141' },
    set: Object.fromEntries(GROUPS.map((g) => [g.id, { door: 'wood', body: 'dark', open: 'dark' }])),
  },
];
export const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

/** 搭配的色卡（面板上的小色条）：每个角色一块 → [{ role, id }] */
export const presetBoards = (preset) => Object.entries(preset?.roles || {}).map(([role, key]) => ({ role, id: seedId(key) }));

/**
 * 套一个搭配 → 新的 cab（undefined = 回到没有分组）。只设这个家里有的组。
 * 「全屋统一」= 全部拿掉：每个柜子都回到现在柜子上那一个色。
 */
export function applyPreset(presetId, { cab, furniture } = {}) {
  const P = PRESET_BY_ID[presetId];
  if (!P) return cleanCab(cab);
  const here = new Set(groupsIn(furniture).map((g) => g.id));
  const g = {};
  if (P.only) for (const [k, v] of Object.entries(isObj(cab?.g) ? cab.g : {})) if (!P.only.includes(k)) g[k] = v;
  for (const [gid, parts] of Object.entries(P.set)) {
    if (!here.has(gid)) continue;
    g[gid] = Object.fromEntries(Object.entries(parts).map(([part, role]) => [part, seedId(P.roles[role])]));
  }
  return cleanCab({ v: 1, g });
}

/** 现在的 cab 是不是正好等于某个搭配（面板上把那一个标成选中）→ 搭配 id | null */
export function presetOf(cab, furniture) {
  const J = (x) => JSON.stringify(x ?? null);
  const cur = J(cleanCab(cab));
  for (const P of PRESETS) if (J(applyPreset(P.id, { cab, furniture })) === cur && (P.id !== 'one' || !cleanCab(cab))) return P.id;
  return null;
}
