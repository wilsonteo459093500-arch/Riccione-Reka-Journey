// 走进去 · 纯函数（src/studio/walk/paint.js、measure.js、marks.js、words.js —— docs/walk/SPEC.md §2）：
//   刷颜色点到的是哪一面（slotOfHit 只看那个面的材质，从不退回网格上的 'walls'）、脚下的地面（floorSlotOf）、
//   量尺（measureText / wallDims，中英文）、收藏的角度（addMark / removeMark：取整、最多 12 个）；
//   walkMarks 跟着方案存在这台设备上，但不进分享链接 / 设计师导出；下一位客人时跟着方案一起删掉（forget.js）。
// 集成：真的家具（furniture.buildItem）+ 真的合并墙（house.buildFloorShell），用 three.js 的 Raycaster 点下去 ——
//   以前走进去「点哪里都只换墙面」的回归测试。
// 纯 Node（localStorage、canvas 用假的），不需要浏览器。跑法：node test/walk-pure.test.mjs

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { slotOfHit, floorSlotOf, hitMaterial, isGlass } from '../src/studio/walk/paint.js';
import { measureText, wallDims } from '../src/studio/walk/measure.js';
import { addMark, removeMark, marksOf, MAX_MARKS } from '../src/studio/walk/marks.js';
import '../src/studio/walk/words.js';
import WALK from '../src/shared/i18n/en-walk.js';
import TOUR from '../src/shared/i18n/en-walktour.js';
import TOOLS from '../src/shared/i18n/en-walktools.js';
import EN from '../src/shared/i18n/en.js';
import { setLang as setLang0, t, missing } from '../src/shared/i18n.js';
import { ROOM_TYPES, templatePlan, buildWalls } from '../src/studio/plan/model.js';
import { SLOT_BY_ID } from '../src/shared/materials.js';
import { MatLib } from '../src/studio/engine/matlib.js';
import { buildItem, useLib, CATALOG } from '../src/studio/engine/furniture.js';
import { buildFloorShell } from '../src/studio/engine/house.js';
import { furnish } from '../src/studio/engine/furnish.js';

let n = 0;
let failed = 0;
async function test(name, fn) {
  n++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 5).join('\n    ')}`);
  }
}

// Node 没有 localStorage：方案列表、档案都写在这里（和浏览器一样的接口）
const LS = new Map();
globalThis.localStorage = {
  getItem: (k) => (LS.has(k) ? LS.get(k) : null),
  setItem: (k, v) => LS.set(k, String(v)),
  removeItem: (k) => LS.delete(k),
  clear: () => LS.clear(),
};
// 假的 canvas：house.js 的底座石纹（stoneTextures）只用 createImageData / putImageData
const ctx2d = { createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} };
globalThis.document = { documentElement: {}, createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d }) };

const setLang = (l) => setLang0(l, { reload: false });
setLang('zh');

// 假的显卡（像 boards-engine.test.mjs）：只要各向异性 + initTexture
const renderer = { capabilities: { getMaxAnisotropy: () => 16 }, initTexture() {} };
const lib = new MatLib(renderer, 'fast');
useLib(lib);

/** 以前的 Engine.slotAt：材质没有 slot 就退回网格上的（合并墙 = 'walls'） */
const oldSlot = (h) => hitMaterial(h)?.userData?.slot || h.object.userData.slot || null;
/** 和 Engine.hitAt 一样：看不见的（切低时收起来的墙、主题墙的另一种模式）不算，玻璃 / 天光卡点穿 */
const shown = (o) => {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
};
const rc = new THREE.Raycaster();
function firstHit(objs, origin, dir) {
  rc.set(origin, dir.clone().normalize());
  return rc.intersectObjects(objs, true).find((h) => shown(h.object) && !isGlass(hitMaterial(h))) || null;
}
const within = (o, g) => {
  for (let p = o; p; p = p.parent) if (p === g) return true;
  return false;
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);

console.log('走进去 · 纯函数（walk-pure）');

// ───────────────────────────── 刷颜色：点到哪一面 ─────────────────────────────

console.log('slotOfHit（合成的网格）');
const cap = new THREE.MeshStandardMaterial();
cap.userData.fixed = 'cap';
/** 像 house.wallBox 那样的一块墙（沿 x，厚 0.12）：BoxGeometry 的材质顺序 +x, -x, +y, -y, +z, -z；网格上 userData.slot = 'walls' */
function wallLike(pos, neg) {
  const geo = new THREE.BoxGeometry(2, 2.8, 0.12);
  geo.translate(0, 1.4, 0);
  const end = lib.slot('walls');
  const m = new THREE.Mesh(geo, [end, end, cap, cap, pos, neg]);
  m.userData.slot = 'walls';
  m.updateMatrixWorld(true);
  return m;
}

await test('合并墙的一面是厨卫砖 → tile；外墙 → null；墨色切口 → null；墙头的端面 → walls', () => {
  const w = wallLike(lib.slot('tile'), lib.fixed.exterior);
  const tile = firstHit([w], V(0, 1.4, 2), V(0, 0, -1));
  assert.equal(tile.face.materialIndex, 4);
  assert.equal(slotOfHit(tile), 'tile');
  const ext = firstHit([w], V(0, 1.4, -2), V(0, 0, 1));
  assert.equal(slotOfHit(ext), null, '外墙是固定材质');
  assert.equal(oldSlot(ext), 'walls', '以前退回网格上的 slot：点外墙也会换墙面');
  const top = firstHit([w], V(0.3, 5, 0), V(0, -1, 0));
  assert.equal(hitMaterial(top), cap);
  assert.equal(slotOfHit(top), null, '切口是固定材质');
  const end = firstHit([w], V(3, 1.4, 0), V(-1, 0, 0));
  assert.equal(slotOfHit(end), 'walls');
});

await test('玻璃 / 半透明的天光卡 → null（网格上写着 walls 也一样）', () => {
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.01), lib.fixed.glass);
  glass.userData.slot = 'walls';
  glass.updateMatrixWorld(true);
  rc.set(V(0, 0, 1), V(0, 0, -1));
  const hg = rc.intersectObject(glass)[0];
  assert.ok(hg, 'ray hits the glass');
  assert.ok(isGlass(lib.fixed.glass));
  assert.equal(slotOfHit(hg), null);
  // 没标 fixed 的透明薄片（像窗外的天光卡）也点穿
  const pane = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.12 });
  pane.userData.slot = 'walls';
  assert.ok(isGlass(pane));
  assert.equal(slotOfHit({ object: { material: pane }, face: { materialIndex: 0 } }), null);
  // 透明但几乎不透（例如淡出的地面）不算玻璃
  assert.ok(!isGlass(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 })));
});

await test('从不退回 object.userData.slot：材质没有 slot（家具自己的材质）→ null', () => {
  const own = new THREE.MeshStandardMaterial();
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), own);
  m.userData.slot = 'cabinetry';
  m.updateMatrixWorld(true);
  rc.set(V(0, 0, 3), V(0, 0, -1));
  const h = rc.intersectObject(m)[0];
  assert.equal(oldSlot(h), 'cabinetry');
  assert.equal(slotOfHit(h), null);
  // 多材质网格：按这个面的 materialIndex 取，不是第一个
  const multi = { object: { material: [lib.slot('walls'), lib.slot('countertop')], userData: { slot: 'walls' } }, face: { materialIndex: 1 } };
  assert.equal(slotOfHit(multi), 'countertop');
  assert.equal(slotOfHit({ ...multi, face: { materialIndex: 7 } }), null, 'materialIndex 越界 → null');
  // Engine.hitAt 的形状（没有 face，material 已经按面取好）也认；多材质网格什么都没给 → null，不拿第一个充数
  assert.equal(slotOfHit({ object: multi.object, point: V(0, 0, 0), material: lib.slot('countertop') }), 'countertop');
  assert.equal(slotOfHit({ object: multi.object, material: lib.fixed.exterior }), null, 'hitAt material that is fixed');
  assert.equal(slotOfHit({ object: multi.object, material: lib.slot('rugs') }), null, 'material not on this mesh');
  assert.equal(slotOfHit({ object: multi.object }), null);
});

await test('单一材质的表面 → 它的 slot；不认识的 slot / 空的输入 → null', () => {
  for (const id of Object.keys(SLOT_BY_ID)) assert.equal(slotOfHit({ object: { material: lib.slot(id) }, face: { materialIndex: 0 } }), id);
  const odd = new THREE.MeshStandardMaterial();
  odd.userData.slot = 'nope';
  assert.equal(slotOfHit({ object: { material: odd } }), null);
  for (const x of [null, undefined, {}, { object: null }, { object: {} }]) assert.equal(slotOfHit(x), null);
  for (const name of Object.keys(lib.fixed)) assert.equal(slotOfHit({ object: { material: lib.fixed[name] } }), null, `fixed ${name}`);
});

console.log('floorSlotOf');
await test('铺砖的房间（厨房、浴室、阳台、车廊、晒衣处）→ tile；其余 → floor；和 ROOM_TYPES 一致', () => {
  for (const [type, def] of Object.entries(ROOM_TYPES)) assert.equal(floorSlotOf(type), def.floor === 'tile' ? 'tile' : 'floor', type);
  for (const type of ['kitchen', 'bath', 'balcony', 'porch', 'utility']) assert.equal(floorSlotOf(type), 'tile', type);
  for (const type of ['living', 'master', 'bedroom', 'corridor', 'stair', 'void']) assert.equal(floorSlotOf(type), 'floor', type);
  assert.equal(floorSlotOf('nope'), 'floor');
  assert.equal(floorSlotOf(undefined), 'floor');
  assert.equal(floorSlotOf({ type: 'bath' }), 'tile', '给房间对象也行');
});

// ───────────────────────────── 集成：真的墙、真的家具 ─────────────────────────────

console.log('slotOfHit（真的合并墙 + 家具，Raycaster）');
const WANT_ROOM = (room) => (!room || ROOM_TYPES[room.type]?.outdoor ? null : ROOM_TYPES[room.type]?.wet ? 'tile' : 'walls');
const PLANS = ['condo3', 'semid2'].map((id) => ({ id, plan: templatePlan(id) }));
const SHELLS = new Map(); // `${plan}|${floor}` → { shell, walls }
function shellOf(pid, f) {
  const key = `${pid}|${f.id}`;
  if (!SHELLS.has(key)) {
    const walls = buildWalls(f);
    const shell = buildFloorShell(f, walls, lib, {}).group;
    shell.updateMatrixWorld(true);
    SHELLS.set(key, { shell, walls });
  }
  return SHELLS.get(key);
}

await test('合并墙的每一面：房间这边是墙面 / 厨卫砖，外面 / 车廊阳台那边（固定的外墙）→ null（以前都当成 walls）', () => {
  const seen = { walls: 0, tile: 0, null: 0, oldWalls: 0, skipped: 0 };
  for (const { id, plan } of PLANS)
    for (const f of plan.floors) {
      const { shell, walls } = shellOf(id, f);
      for (const w of walls) {
        const outdoorSide = (w.neg && ROOM_TYPES[w.neg.type]?.outdoor && !w.pos) || (w.pos && ROOM_TYPES[w.pos.type]?.outdoor && !w.neg);
        if (outdoorSide) continue; // 阳台栏杆 / 车廊矮墙，不是墙体
        for (const p of w.pieces) {
          if (p.kind !== 'solid' || p.b - p.a < 0.4) continue;
          const along = (p.a + p.b) / 2;
          for (const [side, s] of [['neg', -1], ['pos', 1]]) {
            const off = w.c + s * (w.t / 2 + 0.5);
            const origin = w.axis === 'x' ? V(along, 1.3, off) : V(off, 1.3, along);
            const dir = w.axis === 'x' ? V(0, 0, -s) : V(-s, 0, 0);
            const h = firstHit([shell], origin, dir);
            if (!h || h.object.userData.slot !== 'walls') {
              seen.skipped++; // 开着的门扇挡在前面
              continue;
            }
            const want = WANT_ROOM(w[side]);
            assert.equal(slotOfHit(h), want, `${id} ${f.id} ${w.id} ${side} (${w[side]?.type || 'outside'})`);
            seen[String(want)]++;
            if (want === null && oldSlot(h) === 'walls') seen.oldWalls++;
          }
        }
      }
    }
  assert.ok(seen.walls > 40 && seen.tile > 5 && seen.null > 20, JSON.stringify(seen));
  assert.ok(seen.oldWalls === seen.null, 'every fixed face used to fall back to walls');
  assert.ok(seen.skipped < (seen.walls + seen.tile + seen.null) / 10, JSON.stringify(seen));
});

await test('每个房间的地面：从上往下点 → floorSlotOf(房间类型)', () => {
  let k = 0;
  for (const { id, plan } of PLANS)
    for (const f of plan.floors) {
      const { shell } = shellOf(id, f);
      for (const r of f.rooms) {
        if (ROOM_TYPES[r.type]?.void) continue;
        const h = firstHit([shell], V(r.x + r.w / 2, 1.0, r.y + r.d / 2), V(0, -1, 0));
        assert.ok(h, `${id} ${r.id}: hits the floor`);
        assert.equal(slotOfHit(h), floorSlotOf(r.type), `${id} ${f.id} ${r.id} (${r.type})`);
        k++;
      }
    }
  assert.ok(k > 20, `${k} rooms`);
});

// 每种家具从哪里点：front = 从正面（本地 +z）水平点过去，这几个高度；top = 从上往下，前后只点这一段（0 = 靠墙那边，1 = 正面）
const AIM = {
  kitchenRun: { front: [0.45] },
  wardrobe: { front: [0.8, 1.6] },
  sofa: { front: [0.3], top: [0.1, 0.9] },
  bed: { top: [0.4, 0.65] }, // 被子那一段（床头是枕头，床尾搭着一条毯子 = 点缀）
  rug: { top: [0.1, 0.9] },
  curtains: { front: [1.0, 1.6] },
  tvWall: { front: [2.2] },
};
const lerp = (a, b, k) => a + (b - a) * k;

await test('真的家具（橱柜、衣柜、沙发、床、地毯、窗帘、电视墙）摆在真的墙前面：点下去是它自己的表面，从不是 walls', () => {
  const tally = {};
  for (const { id, plan } of PLANS) {
    const items = furnish(plan);
    for (const f of plan.floors) {
      const { shell } = shellOf(id, f);
      for (const it of items.filter((i) => i.floor === f.id && AIM[i.kind])) {
        const g = buildItem(it, { wallH: f.ceil });
        // 本地外框（摆好之前量）
        const pos = g.position.clone();
        const ry = g.rotation.y;
        g.position.set(0, 0, 0);
        g.rotation.y = 0;
        g.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(g);
        g.position.copy(pos);
        g.rotation.y = ry;
        g.updateMatrixWorld(true);
        const own = CATALOG[it.kind].slot;
        const T = (tally[it.kind] ||= { items: 0, rays: 0, hits: 0, own: 0, other: {} });
        T.items++;
        const shoot = (o, d) => {
          T.rays++;
          const h = firstHit([shell, g], g.localToWorld(o), d.transformDirection(g.matrixWorld));
          if (!h || !within(h.object, g)) return;
          T.hits++;
          const s = slotOfHit(h);
          assert.notEqual(s, 'walls', `${id} ${it.id} ${it.kind}: a hit on the item resolved to walls`);
          if (s === own) T.own++;
          else T.other[s] = (T.other[s] || 0) + 1;
        };
        const aim = AIM[it.kind];
        for (const y of aim.front || [])
          for (let i = 0; i <= 10; i++) shoot(V(lerp(box.min.x + 0.04, box.max.x - 0.04, i / 10), y, box.max.z + 0.6), V(0, 0, -1));
        if (aim.top)
          for (let i = 0; i <= 6; i++)
            for (let j = 0; j <= 4; j++) shoot(V(lerp(box.min.x, box.max.x, 0.1 + 0.8 * (i / 6)), box.max.y + 0.5, lerp(box.min.z, box.max.z, lerp(aim.top[0], aim.top[1], j / 4))), V(0, -1, 0));
      }
    }
  }
  for (const kind of Object.keys(AIM)) {
    const T = tally[kind];
    assert.ok(T && T.items > 0, `${kind}: no item in the templates`);
    assert.ok(T.own >= 2 * T.items, `${kind}: ${JSON.stringify(T)}`);
    assert.ok(T.own / T.hits >= 0.85, `${kind}: own slot ${CATALOG[kind].slot} on ${T.own}/${T.hits} hits ${JSON.stringify(T.other)}`);
  }
});

// ───────────────────────────── 量尺 ─────────────────────────────

console.log('量尺（measure.js）');
const O = { x: 0, y: 0, z: 0 };
await test('measureText：毫米取到 10，后面跟着尺（中文）', () => {
  setLang('zh');
  assert.deepEqual(measureText(O, { x: 2.1, y: 0, z: 0 }), { mm: 2100, text: '2,100 mm · 约 7 尺 / ft' });
  assert.equal(measureText(O, { x: 1.234, y: 0, z: 0 }).mm, 1230);
  assert.equal(measureText(O, { x: 1.236, y: 0, z: 0 }).mm, 1240);
  assert.equal(measureText({ x: 1, y: 1.55, z: 2 }, { x: 4, y: 1.55, z: 6 }).mm, 5000, '3-4-5，高度一样');
  assert.equal(measureText(O, { x: 0, y: 2.4, z: 0 }).mm, 2400, '竖着量也行');
  assert.equal(measureText(O, { x: 1, y: 1, z: 1 }).mm, 1730);
  assert.deepEqual(measureText(O, O), { mm: 0, text: '—' });
});

await test('measureText / wallDims：英文（words.js 并进了 en-walk.js）', () => {
  setLang('en');
  try {
    assert.equal(measureText(O, { x: 2.1, y: 0, z: 0 }).text, '2,100 mm · about 7 ft');
    assert.equal(wallDims({ a: 1, b: 4.6 }, 2.8).text, '3,600 mm · about 12 ft long · 2,800 mm · about 9 ft high');
    assert.equal(t('{0} 长 · {1} 高', ['a', 'b']), 'a long · b high');
  } finally {
    setLang('zh');
  }
});

await test('wallDims：长 = 墙的 a → b，高 = 天花；文字用 mmFt', () => {
  assert.deepEqual(wallDims({ a: 1, b: 4.6 }, 2.8), { lengthMm: 3600, heightMm: 2800, text: '3,600 mm · 约 12 尺 / ft 长 · 2,800 mm · 约 9 尺 / ft 高' });
  const f = templatePlan('condo3').floors[0];
  for (const w of buildWalls(f)) {
    const d = wallDims(w, f.ceil);
    assert.equal(d.lengthMm, Math.round((w.b - w.a) * 100) * 10, w.id);
    assert.equal(d.heightMm, Math.round(f.ceil * 100) * 10);
    assert.ok(d.text.includes(`${d.lengthMm.toLocaleString('en-US')} mm`), d.text);
  }
});

await test('en-walk*.js：三个都是 { 中文: English }，占位符对得上，和总表重复的词一样；words.js 并进来以后都查得到', () => {
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  for (const [name, d] of Object.entries({ WALK, TOUR, TOOLS })) {
    assert.equal(typeof d, 'object', name);
    for (const [k, v] of Object.entries(d)) {
      assert.match(k, /[一-鿿]/, `${name}: key ${k}`);
      assert.equal(typeof v, 'string', `${name}: ${k}`);
      assert.equal(ph(k), ph(v), `${name}: ${k} → ${v}`);
      if (EN[k] != null) assert.equal(EN[k], v, `${name}: ${k} differs from en.js`);
      assert.equal(missing(k), null, `${name}: ${k} not merged by words.js`);
    }
  }
  assert.ok('{0} 长 · {1} 高' in WALK);
});

// ───────────────────────────── 收藏的角度 ─────────────────────────────

console.log('收藏的角度（marks.js）');
const POSE = { floor: 'f0', x: 1.23456, z: -2.34567, yaw: 1.23456789, pitch: -0.1234567, hour: 18.456, room: 'liv' };

await test('addMark：位置取到 0.01、角度取到 0.001、at 是 ISO 时间；不改原来的列表', () => {
  const at = new Date('2026-11-19T09:30:00.000Z');
  const l0 = Object.freeze([]);
  const l1 = addMark(l0, POSE, { at });
  assert.equal(l0.length, 0);
  assert.equal(l1.length, 1);
  const { id, ...m } = l1[0];
  assert.match(id, /^m[a-z0-9]+$/);
  assert.deepEqual(m, { floor: 'f0', x: 1.23, z: -2.35, yaw: 1.235, pitch: -0.123, hour: 18.46, room: 'liv', at: '2026-11-19T09:30:00.000Z' });
  assert.deepEqual(Object.keys(l1[0]), ['id', 'floor', 'x', 'z', 'yaw', 'pitch', 'hour', 'room', 'at'], 'the SPEC shape, nothing else');
  // 默认 at = 现在
  const now = addMark(l1, { ...POSE, room: { id: 'kit', name: '厨房' } });
  assert.ok(Math.abs(Date.parse(now[1].at) - Date.now()) < 5000);
  assert.match(now[1].at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.equal(now[1].room, 'kit', '房间对象 → 房间 id');
  assert.notEqual(now[1].id, now[0].id);
  // 缺的数字 → 0，房间没有 → null；JSON 来回不变
  const bare = addMark(undefined, { floor: 'gf', x: NaN, z: '2.5' })[0];
  assert.deepEqual([bare.floor, bare.x, bare.z, bare.yaw, bare.pitch, bare.hour, bare.room], ['gf', 0, 2.5, 0, 0, 0, null]);
  assert.deepEqual(JSON.parse(JSON.stringify(now)), now);
});

await test('最多 12 个：满了丢掉最早的；removeMark 按 id 删，返回新的列表', () => {
  let l = [];
  const ids = [];
  for (let i = 0; i < 15; i++) {
    l = addMark(l, { ...POSE, x: i });
    ids.push(l[l.length - 1].id);
  }
  assert.equal(MAX_MARKS, 12);
  assert.equal(l.length, 12);
  assert.deepEqual(l.map((m) => m.x), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], 'oldest three dropped, order oldest → newest');
  assert.deepEqual(l.map((m) => m.id), ids.slice(3));
  assert.equal(new Set(l.map((m) => m.id)).size, 12);
  const before = l.slice();
  const r = removeMark(l, ids[5]);
  assert.equal(r.length, 11);
  assert.ok(!r.some((m) => m.id === ids[5]));
  assert.deepEqual(l, before, 'removeMark does not mutate');
  assert.deepEqual(removeMark(l, 'nope'), l);
  assert.deepEqual(removeMark(null, 'x'), []);
  // 坏掉的条目不要
  const junk = [null, 'x', { x: 1 }, { id: '' }, ...l.slice(0, 2)];
  assert.deepEqual(addMark(junk, POSE).slice(0, 2), l.slice(0, 2));
  assert.equal(addMark(junk, POSE).length, 3);
  assert.deepEqual(marksOf({ walkMarks: junk }), l.slice(0, 2));
  assert.deepEqual(marksOf({ walkMarks: [...l, ...l] }).length, 12);
  assert.deepEqual(marksOf({}), []);
  assert.deepEqual(marksOf(null), []);
});

// ───────────────────────────── walkMarks：存在本机，不分享，下一位客人删掉 ─────────────────────────────

console.log('walkMarks（store.js / forget.js）');
const S = await import('../src/studio/store.js');
const { unpackJSON } = await import('../src/shared/profile.js');
const { buildScene } = await import('../src/studio/export/scene.js');
const { designerBrief } = await import('../src/studio/export/brief.js');
const withMarks = (p) => ({ ...p, walkMarks: addMark(addMark([], POSE), { ...POSE, x: 3, floor: p.plan.floors.at(-1).id }) });

await test('分享链接（packProject）、设计师接手（designerFacts）、导出（buildScene / designerBrief）都不带 walkMarks', async () => {
  for (const tpl of ['condo3', 'semid2']) {
    const p = withMarks(S.createProject({ plan: templatePlan(tpl) }));
    assert.equal(p.walkMarks.length, 2);
    const packed = await S.packProject(p);
    const raw = await unpackJSON(packed);
    assert.ok(!('walkMarks' in raw), `${tpl}: share link has walkMarks`);
    assert.ok(!JSON.stringify(raw).includes('walkMarks'));
    const back = await S.unpackProject(packed);
    assert.ok(!('walkMarks' in back), `${tpl}: opened share link has walkMarks`);
    assert.ok(!JSON.stringify(S.designerFacts(p)).includes('walkMarks'));
    const scene = buildScene(p);
    assert.ok(!JSON.stringify(scene).includes('walkMarks'));
    assert.ok(!JSON.stringify(designerBrief(p, scene)).includes('walkMarks'));
  }
});

await test('跟着方案自动保存在这台设备上：saveProject → loadProjects 原样回来', () => {
  LS.clear();
  const p = withMarks(S.createProject({ plan: templatePlan('semid2') }));
  S.saveProject(p);
  const raw = JSON.parse(LS.get('genie.studio.projects.v1'));
  assert.deepEqual(raw[0].walkMarks, p.walkMarks, 'stored with the project');
  assert.deepEqual(S.currentProject().walkMarks, p.walkMarks);
  assert.deepEqual(S.migrateProject(p).walkMarks, p.walkMarks);
  assert.deepEqual(S.fromStoredProject(S.toStoredProject(p)).walkMarks, p.walkMarks);
});

await test('下一位客人（forgetGuests）：上一位客人的方案连同 walkMarks 一起删掉；别人的方案不动', async () => {
  LS.clear();
  const F = await import('../src/shared/forget.js');
  const now = new Date().toISOString();
  const guest = withMarks(S.createProject({ plan: templatePlan('condo3'), profile: { id: 'q_walk', name: 'Ann', createdAt: now } }));
  const other = withMarks(S.createProject({ plan: templatePlan('condo3'), profile: { id: 'q_other', name: 'Bo', createdAt: now } }));
  S.saveProject(other);
  S.saveProject(guest);
  assert.equal(JSON.parse(LS.get('genie.studio.projects.v1')).filter((x) => x.walkMarks?.length === 2).length, 2);
  assert.equal(LS.get('genie.studio.current'), guest.id);
  const r = await F.forgetGuests(['q_walk']);
  assert.equal(r.projects, 1);
  const left = JSON.parse(LS.get('genie.studio.projects.v1'));
  assert.deepEqual(left.map((x) => x.id), [other.id], "only the other guest's project is left");
  assert.ok(![...LS.values()].some((v) => v.includes(guest.id) || v.includes('q_walk')), 'nothing of the guest left in storage');
  assert.equal(LS.get('genie.studio.current'), undefined);
  assert.equal(S.currentProject(), null);
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
