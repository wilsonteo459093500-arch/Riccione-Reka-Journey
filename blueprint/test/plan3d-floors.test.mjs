// 3D 户型图的地面：每个房间各铺各的（木地板 / 地砖）。清单里怎么带着走、画的时候各画各的；画布像素不在这里测（用一个只记账的假画布）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from './harness.mjs';
import { floorOf, roomRects } from '../src/plan3d/geometry.js';
import { buildScene } from '../src/plan3d/scene.js';
import { PALETTES, paletteOf } from '../src/plan3d/palette.js';
import { paintScene, mix } from '../src/plan3d/paint.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const STUDY = JSON.parse(readFileSync(path.join(dir, '../src/plan3d/sample-study-room.json'), 'utf8'));
const VIEWS = [{ view: 'top' }, { view: 'persp' }, { view: 'iso', corner: 'nw' }, { view: 'iso', corner: 'se' }];

/** 两室一卫（1 像素 = 10 毫米）：客厅和卧室之间有墙，客厅和厨房直接相接；卫生间是两块互相重叠的矩形拼的 L 形 */
const flat = (floors = {}, extra = {}) => ({
  mmPerPx: 10,
  wallT: 15,
  source: { w: 900, h: 700 },
  rooms: [
    { name: 'LIVING', rects: [[100, 100, 500, 400]] },
    { name: 'KITCHEN', rects: [[500, 100, 800, 400]] },
    { name: 'BATH', rects: [[100, 415, 420, 600], [300, 415, 560, 500]] },
    { name: 'BEDROOM', rects: [[615, 415, 800, 600]] },
  ].map((r) => (r.name in floors ? { ...r, floor: floors[r.name] } : r)),
  openings: [{ type: 'door', side: 'bottom', a: 150, b: 240, at: 400 }],
  items: [{ id: 'wc', label: 'WC', kind: 'fixture', box: [110, 520, 150, 590], against: 'bottom' }],
  ...extra,
});
const area = (scene, name) => scene.floorAreas.find((a) => a.name === name);
const finishes = (scene) => scene.floorAreas.map((a) => a.floor);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/** 只记账的假画布：每次调用记下 [方法, 参数, 当时的 fillStyle / strokeStyle]；渐变、图案给个空壳 */
function fakeCanvas(log) {
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 1 };
  const stub = { addColorStop() {} };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args) => {
        log.push({ fn: prop, args, fill: target.fillStyle, stroke: target.strokeStyle, lineWidth: target.lineWidth });
        return stub;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  return { width: 0, height: 0, getContext: () => ctx };
}

/** 画一遍，返回主画布上的调用记录（影子用的离屏画布另记，不混进来） */
function paintLog(geo, opts, palette) {
  const scene = buildScene(geo, opts);
  const log = [];
  paintScene(fakeCanvas(log), scene, palette || paletteOf('warm'), { createCanvas: () => fakeCanvas([]) });
  return { scene, log };
}

/** 木板：fillRect 的尺寸正好是 一块板的长 x 宽（或 宽 x 长） */
function planks(scene, log) {
  const pal = PALETTES.warm;
  const L = Math.max(40, pal.floor.plankMm[0] * scene.zs);
  const W = Math.max(8, pal.floor.plankMm[1] * scene.zs);
  return log.filter((c) => c.fn === 'fillRect' && ((near(c.args[2], L) && near(c.args[3], W)) || (near(c.args[2], W) && near(c.args[3], L))));
}

/** 地砖：fillRect 的尺寸是 砖长 + 0.5（相邻两块多盖半个像素） */
function tiles(scene, log) {
  const T = Math.max(8, PALETTES.warm.tile.sizeMm * scene.zs);
  return log.filter((c) => c.fn === 'fillRect' && near(c.args[2], T + 0.5) && near(c.args[3], T + 0.5));
}

const plankKey = (c) => [c.args.map((v) => v.toFixed(4)).join(','), c.fill].join('|');

// 改动之前（floorAreas 还不存在时）从 buildScene(样例书房) 取下来的地面数据：以后怎么改，这些数都不能变
const STUDY_FLOORS = {
  top: { w: 2400, h: 2133, s: 2.17296827466319, zs: 0.31492293835698404, fm: [1, 0, 0, 1, 0, 0], floors: [[498.1312472837897, 322.1208170360713, 2160.45197740113, 1893.1768796175577], [239.5480225988701, 322.1208170360713, 498.1312472837897, 826.2494567579314]] },
  persp: { w: 2400, h: 2133, s: 2.17296827466319, zs: 0.31492293835698404, fm: [1, 0, 0, 1, 0, 0], floors: [[498.1312472837897, 322.1208170360713, 2160.45197740113, 1893.1768796175577], [239.5480225988701, 322.1208170360713, 498.1312472837897, 826.2494567579314]] },
  iso: { w: 2400, h: 2093, s: 1.6445777973347617, zs: 0.23834460830938575, fm: [-0.7071067811865475, -0.5416752204197018, 0.7071067811865476, -0.5416752204197018, 1377.3410471843474, 2113.632191458377], floors: [[501.5962281871023, 218.7288470455233, 1759.6982431481952, 1407.758594518556], [305.8914703042657, 218.7288470455233, 501.5962281871023, 600.270896027188]] },
};

test('地面：清单里每个房间一块 floorAreas，带着铺的是什么；矩形按顺序连起来就是 floors，三种视角都一样', () => {
  const geo = flat({ KITCHEN: 'tile', BATH: 'tile' });
  for (const opts of VIEWS) {
    const scene = buildScene(geo, opts);
    const tag = `${opts.view} ${opts.corner || ''}`;
    assert.deepEqual(scene.floorAreas.map((a) => a.name), ['LIVING', 'KITCHEN', 'BATH', 'BEDROOM'], tag);
    assert.deepEqual(finishes(scene), ['wood', 'tile', 'tile', 'wood'], tag);
    assert.deepEqual(scene.floorAreas.flatMap((a) => a.rects), scene.floors, `${tag}：和 floors 是同一批矩形、同一个顺序`);
    assert.equal(scene.floors.length, roomRects(geo).length);
    // 矩形 = 图纸坐标换算到平面坐标；外包矩形的左上角就是房间的左上角（地砖从这里铺起）
    const k = area(scene, 'KITCHEN');
    assert.ok(near(k.rects[0][0], (500 + scene.ox) * scene.s) && near(k.rects[0][3], (400 + scene.oy) * scene.s), tag);
    assert.deepEqual(k.box, k.rects[0], tag);
  }
  assert.deepEqual(buildScene(geo, { view: 'persp' }).floorAreas, buildScene(geo, { view: 'top' }).floorAreas, '立体俯视的地面和正俯视一样（不动）');
});

test('地面：不写 / 不认识的 floor 都按木地板；只有 tile 是地砖', () => {
  assert.equal(floorOf({}), 'wood');
  assert.equal(floorOf({ floor: 'wood' }), 'wood');
  assert.equal(floorOf({ floor: 'tile' }), 'tile');
  for (const odd of ['marble', 'TILE', ' tile', '', null, undefined, 0, 1, true, {}, ['tile']]) assert.equal(floorOf({ floor: odd }), 'wood', JSON.stringify(odd));
  assert.equal(floorOf(null), 'wood');
  assert.equal(floorOf(undefined), 'wood');
  for (const opts of VIEWS) {
    assert.deepEqual(finishes(buildScene(flat(), opts)), ['wood', 'wood', 'wood', 'wood'], '都不写');
    assert.deepEqual(finishes(buildScene(flat({ LIVING: 'marble', KITCHEN: null, BATH: 'TILE', BEDROOM: 7 }), opts)), ['wood', 'wood', 'wood', 'wood'], '都不认识');
  }
  assert.deepEqual(finishes(buildScene(STUDY)), ['wood'], '样例书房没写 floor');
});

test('地面：两块互相重叠的矩形拼成的房间是一块，铺的东西一致，外包矩形包住两块', () => {
  for (const floor of ['tile', 'wood']) {
    for (const opts of VIEWS) {
      const scene = buildScene(flat({ BATH: floor }), opts);
      const bath = area(scene, 'BATH');
      assert.equal(scene.floorAreas.filter((a) => a.name === 'BATH').length, 1, '一个房间一块，不按矩形拆开');
      assert.equal(bath.floor, floor);
      assert.equal(bath.rects.length, 2);
      const X = (x) => (x + scene.ox) * scene.s;
      const Y = (y) => (y + scene.oy) * scene.s;
      [X(100), Y(415), X(560), Y(600)].forEach((v, i) => assert.ok(near(bath.box[i], v), `box[${i}]`));
      assert.ok(bath.rects[0][2] > bath.rects[1][0] && bath.rects[0][3] > bath.rects[1][1], '两块确实重叠');
    }
  }
  // 画的时候：重叠的地方不会铺两遍砖（每一格只画一次），整间用同一张网格
  const { scene, log } = paintLog(flat({ BATH: 'tile' }), { view: 'top' });
  const drawn = tiles(scene, log);
  const cells = new Set(drawn.map((c) => `${c.args[0].toFixed(3)},${c.args[1].toFixed(3)}`));
  assert.equal(cells.size, drawn.length, '没有重复的格子');
  const bath = area(scene, 'BATH');
  const T = PALETTES.warm.tile.sizeMm * scene.zs;
  for (const c of drawn) {
    const i = (c.args[0] - bath.box[0]) / T;
    const j = (c.args[1] - bath.box[1]) / T;
    assert.ok(near(i, Math.round(i), 1e-6) && near(j, Math.round(j), 1e-6), '每块砖都落在从房间左上角起的 600 毫米网格上');
  }
  // L 形缺的那一角（右下）没有砖：4.6m x 1.85m 的外包矩形是 8 x 4 格，缺角里整格落空的是右下 2 x 2 格（x ≥ 3.6m 且 y ≥ 1.2m）
  assert.equal(drawn.length, 8 * 4 - 2 * 2);
});

test('地面：改铺地砖不影响画框、缩放、墙和家具 —— 只有 floorAreas 里的 floor 变了', () => {
  for (const opts of VIEWS) {
    const wood = buildScene(flat(), opts);
    const mixed = buildScene(flat({ KITCHEN: 'tile', BATH: 'tile' }), opts);
    const all = buildScene(flat({ LIVING: 'tile', KITCHEN: 'tile', BATH: 'tile', BEDROOM: 'tile' }), opts);
    for (const scene of [mixed, all]) {
      for (const key of ['w', 'h', 'view', 's', 'zs', 'ox', 'oy', 'fm', 'vp', 'wallZ', 'floors', 'patches', 'shadows', 'solids', 'plan']) {
        assert.deepEqual(scene[key], wood[key], `${opts.view}: ${key}`);
      }
      assert.deepEqual(
        scene.floorAreas.map((a) => ({ ...a, floor: 'wood' })),
        wood.floorAreas,
        '矩形和外包矩形也不变'
      );
    }
    assert.ok(mixed.patches.some((p) => p.kind === 'threshold'), '门槛照旧');
    assert.ok(mixed.shadows.some((sh) => sh.id === 'wc'), '地砖上的东西照样有影子');
  }
});

test('地面：全是地砖、没有房间、房间没有矩形 —— 清单和画的程序都不出错', () => {
  const allTile = flat({ LIVING: 'tile', KITCHEN: 'tile', BATH: 'tile', BEDROOM: 'tile' });
  const cases = {
    全是地砖: allTile,
    没有房间: flat({}, { rooms: [], openings: [] }),
    '没有 rooms': { mmPerPx: 10, wallT: 15, items: [{ id: 'a', kind: 'low', box: [0, 0, 100, 50] }] },
    空的: {},
    房间没有矩形: flat({}, { rooms: [{ name: 'EMPTY', floor: 'tile', rects: [] }, { name: 'NONE', floor: 'tile' }, { name: 'OK', floor: 'tile', rects: [[100, 100, 400, 300]] }], openings: [] }),
    一块砖都放不下: flat({}, { rooms: [{ name: 'TINY', floor: 'tile', rects: [[100, 100, 130, 120]] }], openings: [], items: [] }),
    矩形写反了: flat({}, { rooms: [{ name: 'FLIP', floor: 'tile', rects: [[400, 300, 100, 100]] }, { name: 'W', rects: [[430, 300, 700, 100]] }], openings: [], items: [] }),
  };
  for (const [name, geo] of Object.entries(cases)) {
    for (const opts of VIEWS) {
      let scene;
      assert.doesNotThrow(() => (scene = buildScene(geo, opts)), `${name} ${opts.view}`);
      assert.ok(Array.isArray(scene.floors) && Array.isArray(scene.floorAreas), name);
      assert.ok(scene.floorAreas.every((a) => a.rects.length > 0 && a.box.every((v) => Number.isFinite(v))), `${name}：没有矩形的房间不进清单`);
      assert.doesNotThrow(() => paintScene(fakeCanvas([]), scene, paletteOf('warm'), { createCanvas: () => fakeCanvas([]) }), `画 ${name} ${opts.view}`);
    }
  }
  assert.deepEqual(buildScene(cases.没有房间).floorAreas, []);
  assert.deepEqual(buildScene(cases.没有房间).floors, []);
  assert.deepEqual(buildScene(cases.房间没有矩形).floorAreas.map((a) => a.name), ['OK']);
  // 全是地砖：一块木板都不画
  const { scene, log } = paintLog(allTile, { view: 'top' });
  assert.equal(planks(scene, log).length, 0);
  assert.ok(tiles(scene, log).length > 40);
  // 旧的清单（没有 floorAreas）、没有地砖配色的配色表：都按木地板画，不出错
  const old = buildScene(allTile, { view: 'top' });
  delete old.floorAreas;
  const oldLog = [];
  assert.doesNotThrow(() => paintScene(fakeCanvas(oldLog), old, paletteOf('warm'), { createCanvas: () => fakeCanvas([]) }));
  assert.ok(planks(old, oldLog).length > 0 && tiles(old, oldLog).length === 0);
  const noTile = { ...PALETTES.warm };
  delete noTile.tile;
  const bare = paintLog(allTile, { view: 'top' }, noTile);
  assert.ok(planks(bare.scene, bare.log).length > 0, '配色里没有地砖：退回木地板');
});

test('地面：样例书房的地面数据和改动之前的快照一模一样；只多了一块木地板的 floorAreas', () => {
  const views = { top: { view: 'top' }, persp: { view: 'persp' }, iso: { view: 'iso', corner: 'nw' } };
  for (const [name, opts] of Object.entries(views)) {
    const scene = buildScene(STUDY, opts);
    const snap = STUDY_FLOORS[name];
    assert.deepEqual({ w: scene.w, h: scene.h, s: scene.s, zs: scene.zs, fm: scene.fm, floors: scene.floors }, snap, name);
    assert.deepEqual(JSON.parse(JSON.stringify(scene.floors)), snap.floors, `${name}：floors 仍是一组 [x0, y0, x1, y1]`);
    assert.equal(scene.floorAreas.length, 1);
    assert.equal(scene.floorAreas[0].floor, 'wood');
    assert.deepEqual(scene.floorAreas[0].rects, snap.floors);
  }
  // 全是木地板时，木板一块不少、一块不多：画进去的每一块都碰得到房间，碰得到房间的每一格都画了
  const { scene, log } = paintLog(STUDY, { view: 'top' });
  assert.equal(tiles(scene, log).length, 0);
  assert.ok(!log.some((c) => c.fill === PALETTES.warm.tile.base || c.fill === PALETTES.warm.tile.gap), '用不到地砖的颜色');
  assert.ok(planks(scene, log).length > 400);
});

test('地砖：从房间自己的左上角铺起、600 毫米见方、深浅只差一点；不画在木地板的房间里，也不用木纹贴图', () => {
  const pal = PALETTES.warm;
  assert.equal(pal.tile.sizeMm, 600);
  for (const key of ['base', 'light', 'dark', 'gap']) assert.match(pal.tile[key], /^#[0-9A-F]{6}$/i, key);
  const lum = (hex) => [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0) / 3;
  assert.ok(lum(pal.tile.light) > lum(pal.tile.base) && lum(pal.tile.base) > lum(pal.tile.dark) && lum(pal.tile.dark) > lum(pal.tile.gap));
  assert.ok((lum(pal.tile.light) - lum(pal.tile.dark)) / lum(pal.tile.base) < 0.1, '最亮和最暗的砖差不到一成');
  assert.ok(lum(pal.tile.base) > lum(pal.floor.light), '比橡木地板浅');

  for (const opts of VIEWS) {
    const geo = flat({ KITCHEN: 'tile', BATH: 'tile' });
    const { scene, log } = paintLog(geo, opts);
    const T = pal.tile.sizeMm * scene.zs;
    const drawn = tiles(scene, log);
    const kitchen = area(scene, 'KITCHEN');
    const bath = area(scene, 'BATH');
    const inBox = (c, b) => c.args[0] >= b[0] - 1e-6 && c.args[0] < b[2] && c.args[1] >= b[1] - 1e-6 && c.args[1] < b[3];
    const kTiles = drawn.filter((c) => inBox(c, kitchen.box));
    // 厨房 3m x 3m = 5 x 5 块整砖，第一块的角正好在房间的左上角
    assert.equal(kTiles.length, 25, opts.view);
    assert.ok(near(kTiles[0].args[0], kitchen.box[0]) && near(kTiles[0].args[1], kitchen.box[1]), '顶着左上角');
    assert.ok(near(kTiles[1].args[0] - kTiles[0].args[0], T), '一格 600 毫米');
    assert.ok(drawn.every((c) => inBox(c, kitchen.box) || inBox(c, bath.box)), '木地板的房间里没有砖');
    // 深浅：都在 light 和 dark 之间，不是一个颜色
    const tones = new Set(drawn.map((c) => c.fill));
    assert.ok(tones.size > 5);
    const range = [mix(pal.tile.base, pal.tile.light, 1), mix(pal.tile.base, pal.tile.dark, 1)].map((c) => Number(c.match(/\d+/)[0]));
    for (const tone of tones) {
      const r = Number(tone.match(/\d+/)[0]);
      assert.ok(r <= range[0] && r >= range[1], tone);
    }
    // 同一份坐标每次画出来一样（固定种子），换个视角每块砖的深浅也不变
    assert.deepEqual(tiles(scene, paintLog(geo, opts).log).map((c) => c.fill), drawn.map((c) => c.fill));
    assert.deepEqual(drawn.map((c) => c.fill), tiles(buildScene(geo, VIEWS[0]), paintLog(geo, VIEWS[0]).log).map((c) => c.fill), opts.view);
    // 地面的变换和木地板是同一个（斜角下跟着斜过去）
    const fmCalls = log.filter((c) => c.fn === 'transform' && c.args.every((v, i) => near(v, scene.fm[i])));
    assert.ok(fmCalls.length >= 4, '垫底、木地板、每间地砖、整体明暗都套地面的变换');
  }
  // 木纹贴图只贴木地板
  const scene = buildScene(flat({ KITCHEN: 'tile', BATH: 'tile' }), { view: 'top' });
  const log = [];
  const img = { width: 64, height: 64 };
  paintScene(fakeCanvas(log), scene, paletteOf('warm'), { createCanvas: () => fakeCanvas([]), textures: { floor: img } });
  const draws = log.filter((c) => c.fn === 'drawImage' && c.args.length === 9);
  assert.ok(draws.length > 100, '木板从贴图上取木纹');
  assert.equal(tiles(scene, log).length, 25 + 28, '地砖照样是手画的');
});

test('木地板：旁边的房间改铺地砖，这边的木纹一块都不变；地砖房间底下不再画木板', () => {
  for (const opts of VIEWS) {
    const wood = paintLog(flat(), opts);
    const mixed = paintLog(flat({ KITCHEN: 'tile', BATH: 'tile' }), opts);
    const before = planks(wood.scene, wood.log);
    const after = planks(mixed.scene, mixed.log);
    const keys = new Set(before.map(plankKey));
    assert.ok(after.length > 100 && after.length < before.length * 0.75, `${opts.view}: ${after.length} / ${before.length}`);
    assert.ok(after.every((c) => keys.has(plankKey(c))), '留下来的每块板位置和颜色都和原来一样');
    // 木板在转了 45° 的坐标里：换回平面坐标，中心落在木地板房间里的一块都没少，落在厨房正中的一块都没有
    const all = wood.scene.floors.reduce((b, r) => [Math.min(b[0], r[0]), Math.min(b[1], r[1]), Math.max(b[2], r[2]), Math.max(b[3], r[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    const cx = (all[0] + all[2]) / 2;
    const cy = (all[1] + all[3]) / 2;
    const centre = (c) => {
      const mx = c.args[0] + c.args[2] / 2;
      const my = c.args[1] + c.args[3] / 2;
      return [cx + (mx - my) * Math.SQRT1_2, cy + (mx + my) * Math.SQRT1_2];
    };
    const inside = (p, r, pad) => p[0] > r[0] + pad && p[0] < r[2] - pad && p[1] > r[1] + pad && p[1] < r[3] - pad;
    const living = area(mixed.scene, 'LIVING').rects[0];
    const bedroom = area(mixed.scene, 'BEDROOM').rects[0];
    const kitchen = area(mixed.scene, 'KITCHEN').rects[0];
    const kept = new Set(after.map(plankKey));
    const onWood = before.filter((c) => inside(centre(c), living, 0) || inside(centre(c), bedroom, 0));
    assert.ok(onWood.length > 80);
    assert.ok(onWood.every((c) => kept.has(plankKey(c))), opts.view);
    const L = Math.max(40, PALETTES.warm.floor.plankMm[0] * mixed.scene.zs);
    assert.equal(after.filter((c) => inside(centre(c), kitchen, L)).length, 0, '厨房中间没有木板');
    // 全是木地板时：没碰到任何房间的木板也不画（画框外面那一圈），但碰得到的都在
    const rects = wood.scene.floors;
    assert.ok(before.every((c) => rects.some((r) => inside(centre(c), r, -L))), '画了的木板都挨着某个房间');
  }
});
