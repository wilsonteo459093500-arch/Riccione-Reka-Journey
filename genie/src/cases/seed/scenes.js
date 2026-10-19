// 种子案例（3D 风格方案）的「照片」—— 用直觉牌同一台离线摄影棚（src/quiz/vignettes/stage.js）、同一套工作室家具和材质拍。
// 只用我们自己的引擎画；不用任何网上 / Pinterest / IKEA / 别家公司的照片。真实项目的照片明天由老板给，换掉这些。
//
// 每个种子两张平视图：客厅（封面）+ 一个最有特色的房间（SHOTS）；另外一张整个家的 3D 鸟瞰在 engine-shot.js（3D 工作室）。
// 场景 id = case-<案例 id>-<房间>；材质 = 案例自己的 13 个表面（manifest.json），家具款式 = case.furniture，光 = case.mood / time。
// 颜色：只用材质 id（MAT_BY_ID）和 stage.js 的默认光色；需要特别的光色时用 palette.js（这个文件里没有写死的颜色）。
//
// 用法（只在开发时）：src/cases/seed/render.html 载入 stage.js 后 VG.register(SCENES)，再 VG.shoot('case-seed-zen-condo-living')。

import { STAGE_KIT as K } from '../../quiz/vignettes/sets.js';
import { PALETTE } from '../../shared/palette.js';
import MANIFEST from '../manifest.json';

/** 每个种子拍哪两个房间（第一个 = 封面）。尽量每种场景都用到：玄关、卧室、厨房、餐厅、书房、展示柜、儿童房 */
export const SHOTS = {
  'seed-zen-condo': ['living', 'foyer'],
  'seed-nordic-studio': ['living', 'bedroom'],
  'seed-urban-condo': ['living', 'kitchen'],
  'seed-softluxe-semid': ['living', 'dining'],
  'seed-forest-terrace': ['living', 'kitchen'],
  'seed-wander-terrace': ['living', 'kitchen'],
  'seed-library-semid': ['living', 'study'],
  'seed-jazz-condo': ['living', 'master'],
  'seed-architect-bungalow': ['living', 'display'],
  'seed-cosy-townhouse': ['living', 'kids'],
};
/** 场景 → 照片的房间标签（manifest images[].room） */
export const ROOM_OF = { living: 'living', foyer: 'foyer', bedroom: 'bedroom', master: 'master', kitchen: 'kitchen', dining: 'dining', study: 'study', display: 'living', kids: 'kids' };

export const sceneId = (caseId, shot) => `case-${caseId}-${shot}`;

// ───────────────────────── 光：按案例的情绪 / 时间 ─────────────────────────

/** 先决定窗外（盖房间之前要知道） */
function outsideOf(c) {
  const t = c.time ?? 14;
  if (c.mood === 'moody' || t >= 20) return 'night';
  if (t >= 16.5) return 'evening';
  if (t < 12 && (c.style?.axes?.temp ?? 50) < 50) return 'morning';
  return 'day';
}

function lightFor(S, c, lib, outside, { lampAt } = {}) {
  if (outside === 'night') {
    S.ceilingGlow = 0;
    S.sky({ intensity: 0 });
    lib.setNight(1);
    if (lampAt) S.lamp({ pos: lampAt, intensity: 3.4, radius: 0.07 });
    S.hemi = { sky: PALETTE.dusk, ground: PALETTE.shade, intensity: 0.14 };
    S.scene.environmentIntensity = 0.06;
    S.exposure = 1.25;
  } else if (outside === 'evening') {
    K.lightWarmEvening(S);
    lib.setNight(0.55);
    if (lampAt) S.lamp({ pos: lampAt, intensity: 1.5, radius: 0.06 });
  } else if (outside === 'morning') K.lightCoolMorning(S);
  else K.lightDay(S);
}

const mats = (c) => ({ ...c.materials });
const backOf = (R) => -R.d;

/** 一盏放在桌上 / 柜上的小台灯（夜里会亮：灯罩用 lib.fixed.lampShade） */
function tableLamp(S, h, [x, y, z], { on = false } = {}) {
  S.lathe([[0.001, 0], [0.06, 0], [0.075, 0.08], [0.06, 0.2], [0.02, 0.24], [0.001, 0.24]], h.pbr(S.caseMats.woodwork || 'walnut', { R: 256 }), [x, y, z]);
  S.lathe([[0.15, 0], [0.11, 0.18]], h.lib.fixed.lampShade, [x, y + 0.26, z], {}, 48);
  if (on) S.lamp({ pos: [x, y + 0.34, z], intensity: 1.4, radius: 0.04 });
}

/** 墙上一组挂画（feature 墙前面的画要离墙远一点） */
function artOn(S, { x, y, z, w = 0.82, h = 0.62 }) {
  S.item('art', { w, h, x, y, z });
}

// ───────────────────────── 客厅（封面） ─────────────────────────

function living(S, c, h) {
  const f = c.furniture || {};
  const outside = outsideOf(c);
  const m = mats(c);
  S.caseMats = m;
  const lshape = f.sofa === 'lshape';
  const { backZ } = K.living(S, { mats: m, sofa: f.sofa || 'classic', sofaW: lshape ? 2.5 : 2.2, outside, art: 'none', table: f.coffeeTable || 'round', plant: f.plants !== 'few', lamp: true, curtains: true });
  // 主题墙：沙发后面一整片（feature 表面），画挂在它前面
  const featureDifferent = m.feature && m.feature !== m.walls;
  if (featureDifferent) S.item('featureWall', { w: 2.9, x: 0.15, z: backZ + 0.03 });
  artOn(S, { x: 0.15, y: 1.36, z: backZ + (featureDifferent ? 0.075 : 0.019) });
  // 展示多的家：沙发左边一个书墙 / 玻璃展示柜（RICCIONE 做的柜子）
  const disp = f.displayPct ?? 15;
  if (disp >= 40) {
    if ((c.style?.features || []).includes('glassdoor')) S.item('displayCabinet', { w: 0.9, h: 2.3, x: -1.72, z: backZ + 0.22 });
    else S.item('bookshelf', { w: 1.0, h: 2.3, x: -1.7, z: backZ + 0.18, seed: 4 });
  } else if (disp >= 18) {
    S.item('sideboard', { w: 1.2, x: -1.6, z: backZ + 0.24 });
    S.item('plant', { variant: 'small', seed: 5, x: -1.35, y: 0.78, z: backZ + 0.22, s: 0.8 });
  }
  if (f.plants === 'many') {
    S.item('plant', { variant: 'tall', seed: 8, x: 2.0, z: backZ + 1.35 });
    S.item('plant', { variant: 'small', seed: 1, x: 1.6, y: 0.55, z: backZ + 0.82, s: 0.7 });
  }
  // 丰的家多一张单椅
  if ((c.style?.axes?.density ?? 50) < 50) S.item('armchair', { variant: f.armchair || 'lounge', x: -1.15, z: backZ + 2.2, rot: 62 });
  lightFor(S, c, h.lib, outside, { lampAt: [1.62, 1.36, backZ + 0.32] });
  if (outside === 'night') tableLamp(S, h, [-1.25, 0, backZ + 0.45], { on: true });
}

// ───────────────────────── 厨房 ─────────────────────────

function kitchen(S, c, h) {
  const open = (c.style?.axes?.storage ?? 50) < 50 || (c.style?.features || []).includes('openshelf');
  K.kitchenScene(S, h, open);
  S.caseMats = mats(c);
  S.slots(mats(c)); // 场景自己的材质 → 换成这个案例的
  const outside = outsideOf(c);
  if (outside === 'night' || outside === 'evening') {
    K.lightWarmEvening(S);
    S.exposure = outside === 'night' ? 1.12 : 1.06;
  }
}

// ───────────────────────── 餐厅 ─────────────────────────

function dining(S, c, h) {
  const f = c.furniture || {};
  const m = mats(c);
  S.caseMats = m;
  S.slots(m);
  const R = { w: 4.4, d: 4.2, h: 2.8 };
  const win = [{ wall: 'left', a: -3.4, b: -1.2, y0: 0.35, y1: 2.5, mullions: 2 }];
  const outside = outsideOf(c);
  S.room({ ...R, windows: win, outside });
  const bz = backOf(R);
  const cz = -2.45;
  const cx = 0.15;
  const round = f.diningTable === 'round';
  S.item('rug', { variant: round ? 'round' : 'rect', w: 2.8, d: 2.2, x: cx, z: cz });
  // 餐桌自己带椅子（工作室的 diningTable：seats 张）；招待多的圆桌做八人
  const eight = round && (c.style?.wishes || []).includes('host');
  S.item('diningTable', { variant: f.diningTable || 'rect', w: round ? (eight ? 1.5 : 1.3) : 1.9, d: round ? (eight ? 1.5 : 1.3) : 0.95, seats: eight ? 8 : 6, x: cx, z: cz });
  S.item('pendant', { drop: 1.05, x: cx, z: cz });
  S.item('sideboard', { w: 1.9, x: cx, z: bz + 0.24 });
  artOn(S, { x: cx, y: 1.32, z: bz + 0.019, w: 0.95, h: 0.68 });
  S.item('plant', { variant: 'tall', seed: 3, x: 1.8, z: bz + 0.42 });
  S.item('curtains', { w: 2.2, h: 2.8, x: -R.w / 2 + 0.09, z: (win[0].a + win[0].b) / 2, rot: 90 });
  S.look({ pos: [1.25, 1.5, -0.2], target: [-0.05, 0.8, -2.75], fov: 46 });
  lightFor(S, c, h.lib, outside);
  if (outside === 'night') S.lamp({ pos: [cx, 1.6, cz], intensity: 3, radius: 0.08 });
}

// ───────────────────────── 卧室 / 主卧 ─────────────────────────

function bedroom(S, c, h) {
  const m = mats(c);
  S.caseMats = m;
  S.slots(m);
  const R = { w: 4.4, d: 4.4, h: 2.8 };
  const win = [{ wall: 'left', a: -2.3, b: -0.5, y0: 0.45, y1: 2.45, mullions: 1 }];
  const outside = outsideOf(c);
  S.room({ ...R, windows: win, outside });
  const bz = backOf(R);
  const bx = 0.4;
  const featureDifferent = m.feature && m.feature !== m.walls;
  if (featureDifferent) S.item('featureWall', { w: 2.9, x: bx, z: bz + 0.03 });
  const fz = featureDifferent ? 0.06 : 0;
  S.item('rug', { w: 2.6, d: 2.0, x: bx, z: bz + 1.55 + fz });
  S.item('bed', { w: 1.8, d: 2.1, x: bx, z: bz + 1.08 + fz });
  S.item('nightstand', { x: bx - 1.2, z: bz + 0.24 + fz });
  S.item('nightstand', { x: bx + 1.2, z: bz + 0.24 + fz });
  if (outside === 'night' || outside === 'evening') S.lamp({ pos: [bx - 1.2, 0.9, bz + 0.26 + fz], intensity: 1.3, radius: 0.04 });
  artOn(S, { x: bx, y: 1.32, z: bz + 0.019 + (featureDifferent ? 0.056 : 0), w: 1.0, h: 0.5 });
  // 衣柜（RICCIONE 做的）：左墙靠里那一段，正面朝房间
  S.item('wardrobe', { w: 1.9, h: 2.6, handle: c.furniture?.handle || 'none', x: -R.w / 2 + 0.31, z: bz + 1.02, rot: 90 });
  S.item('curtains', { w: 2.0, h: 2.8, x: -R.w / 2 + 0.09, z: (win[0].a + win[0].b) / 2, rot: 90 });
  if (c.furniture?.plants !== 'few') S.item('plant', { variant: 'tall', seed: 2, x: 1.95, z: bz + 1.55 });
  S.look({ pos: [1.55, 1.35, -0.2], target: [-0.45, 0.85, -3.9], fov: 52 });
  lightFor(S, c, h.lib, outside);
}

// ───────────────────────── 书房 ─────────────────────────

function study(S, c, h) {
  const m = mats(c);
  S.caseMats = m;
  S.slots(m);
  const R = { w: 4.0, d: 3.8, h: 2.8 };
  const win = [{ wall: 'left', a: -3.0, b: -1.0, y0: 0.5, y1: 2.45, mullions: 1 }];
  const outside = outsideOf(c);
  S.room({ ...R, windows: win, outside });
  const bz = backOf(R);
  S.item('bookshelf', { w: 2.6, h: 2.5, x: 0.35, z: bz + 0.18, seed: 7 });
  S.item('rug', { w: 2.2, d: 1.6, x: 0.2, z: bz + 1.45 });
  S.item('desk', { w: 1.5, d: 0.7, x: 0.2, z: bz + 1.25, rot: 180 }); // 书桌自己带一张办公椅（面朝相机）
  S.item('armchair', { variant: c.furniture?.armchair || 'classic', x: -1.25, z: bz + 2.2, rot: 55 });
  S.item('floorLamp', { x: -1.65, z: bz + 1.75 });
  S.item('plant', { variant: 'tall', seed: 4, x: 1.6, z: bz + 1.9 });
  S.item('curtains', { w: 2.2, h: 2.8, x: -R.w / 2 + 0.09, z: (win[0].a + win[0].b) / 2, rot: 90 });
  S.look({ pos: [1.05, 1.3, -0.2], target: [-0.05, 1.0, -3.6], fov: 48 });
  lightFor(S, c, h.lib, outside, { lampAt: [-1.65, 1.4, bz + 1.75] });
}

// ───────────────────────── 玄关 ─────────────────────────

function foyer(S, c, h) {
  const m = mats(c);
  S.caseMats = m;
  S.slots(m);
  const R = { w: 3.4, d: 3.4, h: 2.8 };
  const win = [{ wall: 'left', a: -2.6, b: -1.4, y0: 0.9, y1: 2.4, mullions: 0 }];
  const outside = outsideOf(c);
  S.room({ ...R, windows: win, outside });
  const bz = backOf(R);
  S.item('shoeCabinet', { w: 2.2, h: 2.6, x: 0.3, z: bz + 0.19 });
  S.item('bench', { w: 1.1, x: -0.95, z: bz + 1.35, rot: 90 });
  S.item('rug', { w: 1.9, d: 0.8, x: 0.3, z: bz + 1.2 });
  S.item('plant', { variant: 'tall', seed: 6, x: -1.35, z: bz + 0.35 });
  S.item('plant', { variant: 'small', seed: 2, x: 0.95, y: 1.0, z: bz + 0.2, s: 0.7 });
  S.look({ pos: [0.95, 1.4, -0.1], target: [-0.05, 1.0, -3.2], fov: 50 });
  lightFor(S, c, h.lib, outside);
}

// ───────────────────────── 儿童房 ─────────────────────────

function kids(S, c, h) {
  const m = mats(c);
  S.caseMats = m;
  S.slots(m);
  const R = { w: 4.0, d: 3.8, h: 2.8 };
  const win = [{ wall: 'left', a: -3.0, b: -1.2, y0: 0.6, y1: 2.4, mullions: 1 }];
  const outside = outsideOf(c) === 'night' ? 'evening' : outsideOf(c);
  S.room({ ...R, windows: win, outside });
  const bz = backOf(R);
  S.item('rug', { variant: 'round', w: 1.8, d: 1.8, x: 0.3, z: bz + 2.0 });
  S.item('kidsBed', { w: 1.0, d: 2.0, x: -1.4, z: bz + 1.1 });
  S.item('toyStorage', { w: 1.5, x: 0.75, z: bz + 0.2 });
  S.item('wardrobe', { w: 1.0, h: 2.6, handle: c.furniture?.handle || 'bar', x: 1.45 + 0.05, z: bz + 0.31 });
  S.item('desk', { w: 1.1, d: 0.55, x: 1.55, z: bz + 1.9, rot: -90 });
  S.item('plant', { variant: 'small', seed: 1, x: 0.4, y: 0.62, z: bz + 0.2, s: 0.7 });
  artOn(S, { x: 0.65, y: 1.3, z: bz + 0.019, w: 0.6, h: 0.45 });
  S.item('curtains', { w: 2.0, h: 2.8, x: -R.w / 2 + 0.09, z: (win[0].a + win[0].b) / 2, rot: 90 });
  S.look({ pos: [1.0, 1.35, -0.1], target: [-0.1, 0.75, -3.6], fov: 50 });
  lightFor(S, c, h.lib, outside);
}

// ───────────────────────── 展示柜（收藏） ─────────────────────────

function display(S, c, h) {
  const m = mats(c);
  S.caseMats = m;
  S.slots(m);
  const R = { w: 4.4, d: 3.8, h: 2.8 };
  const win = [{ wall: 'left', a: -3.2, b: -1.2, y0: 0.3, y1: 2.5, mullions: 2 }];
  const outside = outsideOf(c);
  S.room({ ...R, windows: win, outside });
  const bz = backOf(R);
  for (const x of [-0.75, 0.35, 1.45]) S.item('displayCabinet', { w: 1.0, h: 2.45, x, z: bz + 0.22 });
  // 柜里的灯带（每格一点暖光）
  for (const x of [-0.75, 0.35, 1.45]) for (const y of [0.9, 1.5, 2.05]) S.lamp({ pos: [x, y, bz + 0.3], intensity: 0.22, radius: 0.02, shadow: false });
  S.item('rug', { w: 2.6, d: 1.8, x: 0.3, z: bz + 1.75 });
  S.item('bench', { w: 1.4, x: 0.3, z: bz + 1.75 });
  S.item('plant', { variant: 'tall', seed: 3, x: -1.75, z: bz + 0.45 });
  S.item('curtains', { w: 2.2, h: 2.8, x: -R.w / 2 + 0.09, z: (win[0].a + win[0].b) / 2, rot: 90 });
  S.look({ pos: [1.15, 1.35, -0.1], target: [0.0, 1.05, -3.6], fov: 48 });
  lightFor(S, c, h.lib, outside);
}

const BUILD = { living, kitchen, dining, bedroom, master: bedroom, study, foyer, kids, display };

/** 所有种子的场景：{ 'case-<id>-<shot>': (S, h) => … }（stage.js 的 VG.register 认这个形状） */
export const SCENES = {};
for (const c of MANIFEST.cases.filter((x) => x.kind === 'concept')) {
  for (const shot of SHOTS[c.id] || ['living']) {
    SCENES[sceneId(c.id, shot)] = (S, h) => {
      S.size = [1600, 1200];
      S.outs = [
        [1600, 1200, '1600'],
        [480, 360, '480'],
      ];
      S.quality = 0.8;
      BUILD[shot](S, c, h);
    };
  }
}
