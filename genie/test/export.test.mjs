// 导出给设计师（SPEC §7.1）：DXF（AutoCAD / 酷家乐）、COLLADA、OBJ / MTL、zip、README / 清单、隐私和开关 —— 纯函数，Node 跑。
// 跑法：node test/export.test.mjs（npm test 会一起跑）。真的用 AutoCAD / SketchUp / 酷家乐打开要公司的设计师做（SPEC §7.6）。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { templatePlan, addFloor, addStair, migratePlan, buildWalls, roomSides, bounds, EXT_T, ROOM_TYPES, stairFlights } from '../src/studio/plan/model.js';
import { createProject } from '../src/studio/store.js';
import { buildProfile } from '../src/shared/profile.js';
import { PAIRS, LIFE } from '../src/quiz/flow.js';
import { CATALOG } from '../src/studio/engine/furniture.js';
import { SLOTS } from '../src/shared/materials.js';
import { exportBundle } from '../src/studio/export/index.js';
import { buildScene, isOutdoorEdge, mergeOpenings } from '../src/studio/export/scene.js';
import { planDxf, LAYERS, KUJIALE_LAYERS, floorGap, floorStep } from '../src/studio/export/plan.js';
import { model3d, walk, apply } from '../src/studio/export/model3d.js';
import { dae } from '../src/studio/export/dae.js';
import { obj } from '../src/studio/export/obj.js';
import { wallMesh, cellVolume } from '../src/studio/export/walls3d.js';
import { massing, partsBox, LOOSE_FIT } from '../src/studio/export/massing.js';
import { CATEGORY, catOf, nominal, CAT_INFO, SOURCED, BOARD_CODE } from '../src/studio/export/catalog.js';
import { bi, both, enOf, exportBase, defaultPackName, isDefaultName, SAIL_LINE, ncName } from '../src/studio/export/names.js';
import { materialName } from '../src/studio/export/dae.js';
import { matInfo } from '../src/studio/export/scene.js';
import { templatePlan as tplPlan } from '../src/studio/plan/model.js';
import { crc32 } from '../src/studio/export/zip.js';
import { gbkTable } from '../src/studio/export/gbk.js';
import { FIXED, MATLIB_NAME } from '../src/studio/export/palette.js';
import { designerBrief } from '../src/studio/export/brief.js';
import { area2, textWidth } from '../src/studio/export/geom2d.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-10-19T06:30:00Z');
let n = 0;
let failed = 0;
async function test(name, fn) {
  n++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 4).join('\n    ')}`);
  }
}

// ── 测试数据 ──
function answers(o = {}) {
  const pairs = {};
  for (const p of PAIRS) pairs[p.id] = { pick: 'a', ms: 1200 };
  return {
    name: 'Peggy', players: 'couple', pairs,
    life: { saturday: 'kitchen', home: 'drop', cook: 'heavy', bell: 'shoes', who: ['kids', 'cat', 'altar', 'wfh'] },
    shoes: 70, wardrobeDoors: 4, wardrobeFit: 'full', longHang: 'many', books: 10,
    appliances: ['ricecooker', 'oven', 'steamoven'], bulky: ['luggage', 'festive'], ratio: 20,
    wishes: ['storage', 'clean', 'health'], splurge: 'kitchen', avoid: ['glossy'], oneWish: '玄关不再乱', ...o,
  };
}
const BUSY = buildProfile(answers(), {}, { PAIRS, LIFE });
function project(plan, profile = null, id = 'p-test') {
  const p = createProject({ plan, profile });
  p.id = id;
  p.createdAt = p.updatedAt = NOW.toISOString();
  return p;
}
const TPL = ['condo3', 'terrace2', 'semid2', 'studio', 'terrace'];

/** 三层：condo3 复制两层 + 两座 L 形楼梯 + 三楼一间挑空 */
function threeFloor() {
  let plan = templatePlan('condo3');
  plan = addFloor(plan, { copy: 'all' }).plan;
  plan = addFloor(plan, { copy: 'all' }).plan;
  plan = addStair(plan, { from: plan.floors[0].id, to: plan.floors[1].id, x: 0, y: 3, w: 2.6, d: 2.6, shape: 'L', up: 'N', turn: 'right' }).plan;
  plan = addStair(plan, { from: plan.floors[1].id, to: plan.floors[2].id, x: 0, y: 3, w: 2.6, d: 2.6, shape: 'L', up: 'N', turn: 'right' }).plan;
  plan.floors[2].rooms = plan.floors[2].rooms.map((r) => (r.type === 'dining' ? { ...r, type: 'void', name: '' } : r));
  return migratePlan(plan);
}

/** 单椅转 37°、弧形沙发、1.6m 双开大门、房间名带表情 */
function oddProject() {
  const plan = templatePlan('condo3');
  plan.floors[0].openings = plan.floors[0].openings.map((o) => (o.id === 'd-main' ? { ...o, x2: o.x1 + 1.6 } : o));
  plan.floors[0].rooms = plan.floors[0].rooms.map((r) => (r.id === 'mst' ? { ...r, name: '主卧🌙' } : r));
  const p = project(plan, null, 'p-odd');
  const f = plan.floors[0].id;
  p.furniture = [
    ...p.furniture,
    { id: 'x-arm', kind: 'armchair', variant: 'classic', x: 2.2, z: 4.6, rot: 37, w: 0.8, d: 0.8, floor: f, room: 'liv' },
    { id: 'x-sofa', kind: 'sofa', variant: 'curvy', x: 3.6, z: 6.4, rot: 180, w: 2.4, d: 1.0, floor: f, room: 'liv' },
  ];
  return p;
}

// ── DXF 读取（自己写的：一行组码、一行值）──
const latin1 = (b) => Buffer.from(b).toString('latin1');
const unU = (s) => s.replace(/\\U\+([0-9A-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const GBK = new TextDecoder('gbk');
const decodeText = (raw, gbk) => unU(gbk ? GBK.decode(Buffer.from(raw, 'latin1')) : raw);

function parseDxf(bytes) {
  const s = latin1(bytes);
  assert.ok(s.endsWith('EOF\r\n'), 'ends with EOF + CRLF');
  const lines = s.split('\r\n');
  lines.pop();
  assert.equal(lines.length % 2, 0, 'even number of lines');
  const pairs = [];
  for (let i = 0; i < lines.length; i += 2) {
    assert.match(lines[i], /^\s*-?\d+$/, `group code at line ${i + 1}`);
    pairs.push([+lines[i], lines[i + 1]]);
  }
  const objects = [];
  let section = null;
  let cur = null;
  for (const [c, v] of pairs) {
    if (c === 0) {
      if (v === 'ENDSEC') section = null;
      cur = { type: v, pairs: [], section };
      objects.push(cur);
      continue;
    }
    if (cur) cur.pairs.push([c, v]);
    if (cur?.type === 'SECTION' && c === 2 && cur.pairs.length === 1) {
      section = v;
      cur.name = v;
    }
  }
  const get = (o, c) => o.pairs.find((p) => p[0] === c)?.[1];
  const all = (o, c) => o.pairs.filter((p) => p[0] === c).map((p) => p[1]);
  const header = {};
  const H = objects.find((o) => o.type === 'SECTION' && o.name === 'HEADER');
  for (let i = 0; i < H.pairs.length; i++) if (H.pairs[i][0] === 9) header[H.pairs[i][1]] = H.pairs[i + 1]?.[1];
  const tbl = (type) => objects.filter((o) => o.section === 'TABLES' && o.type === type).map((o) => get(o, 2));
  // 图块：BLOCK … ENDBLK
  const blocks = new Map();
  let blk = null;
  for (const o of objects.filter((x) => x.section === 'BLOCKS')) {
    if (o.type === 'BLOCK') blocks.set(get(o, 2), (blk = { name: get(o, 2), flags: +get(o, 70), ents: [] }));
    else if (o.type === 'ENDBLK') blk = null;
    else if (blk) blk.ents.push(o);
  }
  const entities = objects.filter((o) => o.section === 'ENTITIES');
  return { s, pairs, objects, header, layers: tbl('LAYER'), styles: tbl('STYLE'), records: tbl('BLOCK_RECORD'), blocks, entities, get, all };
}
const pts = (D, o) => {
  const xs = D.all(o, 10).map(Number);
  const ys = D.all(o, 20).map(Number);
  return xs.map((x, i) => [x, ys[i]]);
};

function checkStructure(D) {
  const order = D.objects.filter((o) => o.type === 'SECTION').map((o) => o.name);
  assert.deepEqual(order, ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']);
  assert.equal(D.objects[D.objects.length - 1].type, 'EOF');
  assert.equal(D.header.$ACADVER, 'AC1015');
  assert.equal(D.header.$INSUNITS, '4');
  assert.equal(D.header.$MEASUREMENT, '1');
  assert.equal(D.header.$DWGCODEPAGE, 'ANSI_936');
  const seed = parseInt(D.header.$HANDSEED, 16);
  const handles = new Set();
  const body = D.objects.filter((o) => !(o.type === 'SECTION' && o.name === 'HEADER')).flatMap((o) => o.pairs);
  for (const [c, v] of body)
    if (c === 5 || c === 105) {
      assert.match(v, /^[0-9A-F]+$/, `handle ${v}`);
      assert.ok(!handles.has(v), `duplicate handle ${v}`);
      assert.ok(parseInt(v, 16) < seed, `handle ${v} < $HANDSEED`);
      handles.add(v);
    }
  for (const [c, v] of body) if (c === 330) assert.ok(v === '0' || handles.has(v), `owner ${v} exists`);
  const layers = new Set(D.layers);
  const styles = new Set(D.styles);
  const records = new Set(D.records);
  const ents = [...D.entities, ...[...D.blocks.values()].flatMap((b) => b.ents)];
  for (const e of ents) {
    const l = D.get(e, 8);
    if (l != null) assert.ok(layers.has(l), `layer ${l} in table`);
    if (['TEXT', 'ATTRIB', 'ATTDEF'].includes(e.type)) assert.ok(styles.has(D.get(e, 7)), `style ${D.get(e, 7)}`);
    if (e.type === 'INSERT') {
      const b = D.get(e, 2);
      assert.ok(D.blocks.has(b) && records.has(b), `block ${b} + record`);
    }
    if (e.type === 'DIMENSION') assert.ok(/^\*D\d+$/.test(D.get(e, 2)) && D.blocks.has(D.get(e, 2)), 'dimension block');
  }
  // ATTRIB 只出现在 INSERT（66 1）和 SEQEND 之间
  let open = false;
  for (const e of D.entities) {
    if (e.type === 'INSERT') open = D.get(e, 66) === '1';
    else if (e.type === 'ATTRIB') assert.ok(open, 'ATTRIB after INSERT 66 1');
    else if (e.type === 'SEQEND') {
      assert.ok(open, 'SEQEND closes an INSERT');
      open = false;
    } else assert.ok(!open, `${e.type} inside INSERT/SEQEND`);
  }
  // 数字：不用科学计数法、没有 NaN / Infinity / -0
  for (const [c, v] of D.pairs) {
    const isFloat = (c >= 10 && c <= 59) || (c >= 110 && c <= 149) || (c >= 210 && c <= 239);
    if (!isFloat) continue;
    assert.ok(!/e[+-]?\d|NaN|Infinity|^-0$/i.test(v), `number ${c}=${v}`);
    assert.match(v, /^-?\d+(\.\d+)?$/, `number ${c}=${v}`);
  }
}

const texts = (D, gbk = false, layer = null) =>
  D.entities.filter((e) => (e.type === 'TEXT' || e.type === 'ATTRIB') && (!layer || D.get(e, 8) === layer)).map((e) => ({ e, s: decodeText(D.get(e, 1) ?? '', gbk) }));
const attribsOf = (D) => {
  const out = [];
  let ins = null;
  for (const e of D.entities) {
    if (e.type === 'INSERT') ins = { e, att: {} };
    if (e.type === 'ATTRIB' && ins) ins.att[D.get(e, 2)] = decodeText(D.get(e, 1) ?? '', false);
    if (e.type === 'SEQEND' && ins) {
      out.push(ins);
      ins = null;
    }
  }
  return out;
};
const inserts = (D, re) => D.entities.filter((e) => e.type === 'INSERT' && re.test(D.get(e, 2)));

/** 实心墙段的矩形（毫米，导出坐标；和 SPEC §3.5.1 一样的端头外伸） */
function solidRects(scene, F) {
  const out = [];
  for (const w of F.walls) {
    if (isOutdoorEdge(w)) continue;
    for (const p of w.pieces) {
      if (p.kind !== 'solid') continue;
      const a = p.a - (Math.abs(p.a - w.a) < 0.01 ? w.t / 2 : 0);
      const b = p.b + (Math.abs(p.b - w.b) < 0.01 ? w.t / 2 : 0);
      const [x0, x1, y0, y1] = w.axis === 'x' ? [a, b, w.c - w.t / 2, w.c + w.t / 2] : [w.c - w.t / 2, w.c + w.t / 2, a, b];
      out.push({ x0: scene.tx(x0), x1: scene.tx(x1), y0: scene.ty(y1), y1: scene.ty(y0) });
    }
  }
  return out;
}
const pip = (p, loop) => {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i];
    const [xj, yj] = loop[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inRegion = (p, loops) => loops.reduce((k, l) => k + (pip(p, l) ? 1 : 0), 0) % 2 === 1;

// ── 跑一遍所有的样本 ──
const FIX = [];
for (const id of TPL) for (const prof of [null, BUSY]) FIX.push({ tag: `${id}${prof ? '-busy' : ''}`, p: project(templatePlan(id), prof, `p-${id}${prof ? 'b' : ''}`) });
FIX.push({ tag: 'three-floor', p: project(threeFloor(), BUSY, 'p-3f') });
FIX.push({ tag: 'odd', p: oddProject() });
const RUN = {};
const t0 = Date.now();
for (const f of FIX) {
  const ts = Date.now();
  const r = await exportBundle(f.p, { now: NOW });
  const scene = buildScene(f.p, { now: NOW });
  const file = (suffix) => r.entries.find((e) => e.name.endsWith(suffix))?.bytes;
  RUN[f.tag] = { ...f, r, scene, ms: Date.now() - ts, file };
}
console.log(`导出 ${FIX.length} 个样本：${Date.now() - t0} ms`);
for (const [tag, x] of Object.entries(RUN)) console.log(`    ${tag.padEnd(14)} ${String(x.ms).padStart(5)} ms · ${x.r.stats.items} 件 · ${x.r.stats.tris} 三角形 · ${x.r.stats.components} 组件 · ${(x.r.bytes.length / 1024).toFixed(0)} KB`);

console.log('DXF 结构（T1）');
for (const [tag, x] of Object.entries(RUN)) {
  await test(`${tag}：所有 DXF 结构对、句柄唯一、图层 / 字体 / 图块都在表里`, () => {
    const dxfs = x.r.entries.filter((e) => e.name.endsWith('.dxf'));
    assert.equal(dxfs.length, 1 + x.scene.floors.length);
    for (const e of dxfs) checkStructure(parseDxf(e.bytes));
  });
}

console.log('文字编码（T2）');
await test('AutoCAD 文件纯 ASCII；\\U+ 解出来就是房间名、楼层名、家具名（中英）', () => {
  for (const tag of ['condo3', 'terrace2-busy', 'semid2', 'three-floor', 'odd']) {
    const x = RUN[tag];
    const bytes = x.file('_plan_all-floors.dxf');
    assert.ok(!bytes.some((b) => b >= 0x80), `${tag}: ASCII only`);
    const D = parseDxf(bytes);
    const all = new Set(texts(D).map((t) => t.s));
    for (const F of x.scene.floors) {
      for (const r of F.rooms) {
        assert.ok(all.has(r.name.zh.replace(/[\u{10000}-\u{10FFFF}]/gu, '?')), `${tag}: room ${r.name.zh}`);
        if (r.name.en !== r.name.zh) assert.ok(all.has(r.name.en.replace(/[\u{10000}-\u{10FFFF}]/gu, '?')), `${tag}: room ${r.name.en}`);
      }
      assert.ok(all.has(`${F.name.zh}  ${F.name.en.toUpperCase()}`), `${tag}: floor title ${F.name.zh}`);
    }
    const names = attribsOf(D).map((a) => a.att.NAME).filter(Boolean).sort();
    const want = x.scene.floors.flatMap((F) => F.items.map((it) => it.name.zh)).sort();
    assert.deepEqual(names, want, `${tag}: item NAME attributes`);
  }
});
await test('酷家乐文件是 GBK：解出来是中文房间名，GBK 里有的字不写 \\U+', () => {
  const G = gbkTable();
  assert.ok(G.size > 20000, 'GBK table');
  for (const tag of ['terrace2', 'semid2-busy', 'condo3']) {
    const x = RUN[tag];
    for (const F of x.scene.floors) {
      const D = parseDxf(x.file(`_${F.code}_kujiale.dxf`));
      const raw = texts(D).map((t) => Buffer.from(D.get(t.e, 1), 'latin1'));
      const got = new Set(texts(D, true).map((t) => t.s));
      for (const r of F.rooms.filter((r) => !r.stair && !r.void)) assert.ok(got.has(r.name.zh), `${tag} ${F.code}: ${r.name.zh}`);
      for (const b of raw) {
        const s = GBK.decode(b);
        for (const m of s.matchAll(/\\U\+([0-9A-F]{4})/g)) assert.ok(!G.has(String.fromCharCode(parseInt(m[1], 16))), `GBK char escaped: ${m[0]}`);
      }
      assert.ok(texts(D).length > 0 && raw.some((b) => b.some((c) => c >= 0x80)), `${tag}: GBK bytes present`);
    }
  }
});
await test('房间名里的表情（U+10000 以上）→ ?', () => {
  const D = parseDxf(RUN.odd.file('_plan_all-floors.dxf'));
  assert.ok(texts(D).some((t) => t.s === '主卧?'));
  assert.ok(!texts(D).some((t) => /[\u{10000}-\u{10FFFF}]/u.test(t.s)));
});

console.log('单位、原点（T3）');
await test('每层 A-WALL 外框 = 实心墙段的外框（毫米）；二楼往右挪 W + 间距（图名长的时候更宽）', () => {
  for (const tag of ['condo3', 'terrace2', 'semid2', 'three-floor']) {
    const x = RUN[tag];
    const D = parseDxf(x.file('_plan_all-floors.dxf'));
    const shift = floorStep(x.scene);
    assert.ok(shift >= x.scene.W + floorGap(x.scene.W), 'step ≥ W + gap');
    const titleW = Math.max(...texts(D, false, 'A-ANNO-TTLB').map((t) => textWidth(t.s, +D.get(t.e, 40))));
    assert.ok(shift >= titleW + 2000, `titles (${titleW}) fit before the next floor`);
    const wallPts = D.entities.filter((e) => e.type === 'LWPOLYLINE' && D.get(e, 8) === 'A-WALL').flatMap((e) => pts(D, e));
    for (const F of x.scene.floors) {
      const rs = solidRects(x.scene, F);
      const want = [Math.min(...rs.map((r) => r.x0)), Math.min(...rs.map((r) => r.y0)), Math.max(...rs.map((r) => r.x1)), Math.max(...rs.map((r) => r.y1))];
      const mine = wallPts.filter(([px]) => Math.round((px - x.scene.W / 2) / shift) === F.level);
      const got = [Math.min(...mine.map((p) => p[0])) - F.level * shift, Math.min(...mine.map((p) => p[1])), Math.max(...mine.map((p) => p[0])) - F.level * shift, Math.max(...mine.map((p) => p[1]))];
      got.forEach((v, i) => assert.ok(Math.abs(v - want[i]) <= 1, `${tag} ${F.code} bbox[${i}] ${v} vs ${want[i]}`));
      // 酷家乐那一层：原点不挪，墙的顶点 + shift = 平面图里那一层的顶点
      const K = parseDxf(x.file(`_${F.code}_kujiale.dxf`));
      const kp = K.entities.filter((e) => e.type === 'LWPOLYLINE' && K.get(e, 8) === 'A-WALL').flatMap((e) => pts(K, e).map(([a, b]) => `${a + F.level * shift},${b}`)).sort();
      assert.deepEqual(kp, mine.map(([a, b]) => `${a},${b}`).sort(), `${tag} ${F.code}: kujiale walls = shifted full walls`);
    }
    const B = bounds(x.scene.plan);
    assert.equal(x.scene.tx(B.x0 - EXT_T / 2), 0);
    assert.equal(x.scene.ty(B.y1 + EXT_T / 2), 0);
  }
});
await test('condo3 客厅：名字在 (tx 3.3, ty 5.25)；净尺寸 = roomSides 算出来的', () => {
  const x = RUN.condo3;
  const F = x.scene.floors[0];
  const K = parseDxf(x.file('_F1_kujiale.dxf'));
  const liv = texts(K, true).find((t) => t.s === '客厅');
  assert.ok(liv);
  assert.equal(+K.get(liv.e, 11), x.scene.tx(3.3));
  assert.equal(+K.get(liv.e, 21), x.scene.ty(5.25));
  const room = x.scene.plan.floors[0].rooms.find((r) => r.id === 'liv');
  const walls = buildWalls(x.scene.plan.floors[0]);
  const ins = Object.fromEntries(roomSides(room, walls).map((s) => [s.side, s.walled ? s.thick : 0]));
  const w = Math.round((room.w - ins.W - ins.E) * 1000);
  const d = Math.round((room.d - ins.N - ins.S) * 1000);
  const D = parseDxf(x.file('_plan_all-floors.dxf'));
  const area = texts(D, false, 'A-AREA').map((t) => t.s);
  assert.ok(area.some((s) => s.startsWith(`${w} × ${d}  ·  ${((w * d) / 1e6).toFixed(1)} m²`)), `net ${w} × ${d} in ${area.join(' | ')}`);
  assert.equal(F.rooms.find((r) => r.id === 'liv').net.w * 1000, w);
});
await test('房间名、面积放得进房间（窄房间：字缩小 → 只写面积 → 不写）；整叠字在墙里面（压到字时挪到上 / 下三分之一、再往旁边）', () => {
  for (const tag of ['terrace2', 'semid2', 'semid2-busy', 'condo3', 'studio']) {
    const x = RUN[tag];
    const D = parseDxf(x.file('_plan_all-floors.dxf'));
    const shift = floorStep(x.scene);
    for (const F of x.scene.floors)
      for (const r of F.rooms.filter((q) => q.net)) {
        const x0 = x.scene.tx(r.inner.x0) + F.level * shift;
        const x1 = x.scene.tx(r.inner.x1) + F.level * shift;
        const yTop = x.scene.ty(r.inner.y0);
        const yBot = x.scene.ty(r.inner.y1);
        const inside = (t) => +D.get(t.e, 11) > x0 && +D.get(t.e, 11) < x1 && +D.get(t.e, 21) < yTop && +D.get(t.e, 21) > yBot;
        const name = texts(D, false, 'A-AREA-IDEN').filter((t) => t.s === r.name.zh && inside(t));
        assert.equal(name.length, 1, `${tag} ${r.name.zh}: one name label inside the room`);
        const lx = +D.get(name[0].e, 11);
        // 同一叠字：同一个 x
        const mine = [...texts(D, false, 'A-AREA'), ...texts(D, false, 'A-AREA-IDEN')].filter((t) => +D.get(t.e, 11) === lx && inside(t));
        // 标签在轴线中间时：两边都要放得下（× 0.92）；挪过的：整叠字离墙内皮 60 以上
        const centred = lx === x.scene.tx(r.label[0]) + F.level * shift;
        const half = Math.min(lx - x0, x1 - lx) * (centred ? 0.92 : 1);
        for (const t of mine) {
          const h = +D.get(t.e, 40);
          const area = D.get(t.e, 8) === 'A-AREA';
          assert.ok(textWidth(t.s, h) / 2 <= half + 1 || (!area && h <= 100), `${tag} ${r.name.zh}: "${t.s}" h ${h} too wide for ${Math.round(2 * half)}`);
          if (area) assert.ok(h >= Math.min(80, Math.round(150 * Math.min(Math.max(Math.sqrt(r.rect.w * r.rect.d) / 3, 0.6), 1))), `${tag} ${r.name.zh}: area text h ${h} too small`);
        }
        const area = mine.filter((t) => D.get(t.e, 8) === 'A-AREA');
        assert.ok(area.length <= 1, `${tag} ${r.name.zh}: one area line`);
        const long = `${Math.round(r.net.w * 1000)} × ${Math.round(r.net.d * 1000)}  ·  `;
        // 只写面积：整行放不下，或者房间里有看得见的柜子字 / 楼梯字（躲不开时改短）
        const busy = D.entities.some((e) => ((e.type === 'ATTRIB' && !(+D.get(e, 70) & 1)) || (e.type === 'TEXT' && D.get(e, 8) === 'A-FLOR-STRS')) && inside({ e }));
        if (area.length && !area[0].s.startsWith(long)) assert.ok(textWidth(`${long}${area[0].s}`, 80) > 2 * half || busy, `${tag} ${r.name.zh}: short form only when the long one does not fit or the room has cabinet / stair labels`);
      }
  }
  // 900 宽的玄关、走廊：面积那一行不会比房间还宽（以前 1074 宽压过两边的墙）
  const t2 = RUN['terrace2'];
  const D = parseDxf(t2.file('_plan_all-floors.dxf'));
  const sh = floorStep(t2.scene);
  let narrow = 0;
  for (const F of t2.scene.floors)
    for (const r of F.rooms.filter((q) => q.net && q.net.w < 1)) {
      const x0 = t2.scene.tx(r.inner.x0) + F.level * sh;
      const x1 = t2.scene.tx(r.inner.x1) + F.level * sh;
      const lines = texts(D, false, 'A-AREA').filter((t) => +D.get(t.e, 11) > x0 && +D.get(t.e, 11) < x1 && +D.get(t.e, 21) < t2.scene.ty(r.inner.y0) && +D.get(t.e, 21) > t2.scene.ty(r.inner.y1));
      for (const t of lines) {
        const w = textWidth(t.s, +D.get(t.e, 40));
        assert.ok(+D.get(t.e, 11) - w / 2 >= x0 && +D.get(t.e, 11) + w / 2 <= x1, `${r.name.zh}: ${t.s}`);
        narrow++;
      }
    }
  assert.ok(narrow >= 2, 'narrow rooms checked');
});

/** 看得见的字的外框（毫米，西文 0.6h、中文 1.0h；TEXT / ATTRIB 都是中心对齐，转 50 度） */
function visibleTextBoxes(D) {
  const out = [];
  let ins = -1;
  for (const e of D.entities) {
    if (e.type === 'INSERT') ins++;
    const layer = D.get(e, 8);
    const isText = e.type === 'TEXT' && ['A-AREA-IDEN', 'A-AREA', 'A-FLOR-STRS'].includes(layer);
    const isAtt = e.type === 'ATTRIB' && !(+D.get(e, 70) & 1);
    if (!isText && !isAtt) continue;
    const s = decodeText(D.get(e, 1) ?? '', false);
    const h = +D.get(e, 40);
    const w = textWidth(s, h);
    const p = [+D.get(e, 11), +D.get(e, 21)];
    const a = ((+D.get(e, 50) || 0) * Math.PI) / 180;
    const c = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([u, v]) => [p[0] + u * Math.cos(a) - v * Math.sin(a), p[1] + u * Math.sin(a) + v * Math.cos(a)]);
    out.push({ s, layer: isAtt ? `${layer}:${D.get(e, 2)}` : layer, owner: isAtt ? ins : null, x0: Math.min(...c.map((q) => q[0])), x1: Math.max(...c.map((q) => q[0])), y0: Math.min(...c.map((q) => q[1])), y1: Math.max(...c.map((q) => q[1])) });
  }
  return out;
}
await test('看得见的字不互相压：房间名 / 面积、楼梯「上 / 下」、定制柜的名字 / 尺寸；洁具电器、家具的名字不显示', () => {
  for (const tag of ['terrace2', 'semid2-busy', 'condo3']) {
    const x = RUN[tag];
    const D = parseDxf(x.file('_plan_all-floors.dxf'));
    const boxes = visibleTextBoxes(D);
    assert.ok(boxes.some((b) => b.layer === 'A-FLOR-STRS') || tag === 'condo3');
    // 只有定制柜的 NAME / SIZE 看得见
    for (const b of boxes) if (b.owner != null) assert.match(b.layer, /^A-CASE:(NAME|SIZE)$/, `${tag}: visible ${b.layer} ${b.s}`);
    const bad = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.owner != null && a.owner === b.owner) continue; // 同一个柜子的名字和尺寸（上下叠好的）
        const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        const room = (q) => q.layer === 'A-AREA' || q.layer === 'A-AREA-IDEN';
        // 房间名那一叠字对上楼梯的字、柜子的字：一点都不能压；柜子对柜子（靠在一起的两个柜子）：压到一半以上才算
        const limit = room(a) || room(b) ? 20 : Math.min(a.y1 - a.y0, b.y1 - b.y0) / 2;
        if (w > 20 && h > limit) bad.push(`${a.layer} "${a.s}" × ${b.layer} "${b.s}" (${Math.round(w)}×${Math.round(h)} at ${Math.round(a.x0)},${Math.round(a.y0)})`);
      }
    assert.ok(!bad.length, `${tag}: overlapping text: ${bad.join(' | ')}`);
  }
});

console.log('完整（T4）');
for (const tag of ['condo3', 'terrace2-busy', 'semid2-busy', 'studio', 'terrace', 'three-floor', 'odd']) {
  await test(`${tag}：门 / 窗 / 趟门 / 打通、房间名、家具 ITEM_ID、楼梯踏步、图名都齐`, () => {
    const x = RUN[tag];
    const D = parseDxf(x.file('_plan_all-floors.dxf'));
    let want = { door: 0, window: 0, slider: 0, open: 0 };
    let treads = 0;
    for (const F of x.scene.floors) {
      const c = { door: 0, window: 0, slider: 0, open: 0 };
      for (const w of buildWalls(x.scene.plan.floors[F.level])) if (!isOutdoorEdge(w)) for (const p of w.pieces) if (p.kind !== 'solid') c[p.kind]++;
      const K = parseDxf(x.file(`_${F.code}_kujiale.dxf`));
      assert.equal(inserts(K, /^WISH_DOOR/).length, c.door, `${F.code} doors`);
      assert.equal(inserts(K, /^WISH_WIN_/).length, c.window, `${F.code} windows`);
      assert.equal(inserts(K, /^WISH_SLD_/).length, c.slider, `${F.code} sliders`);
      assert.equal(texts(K, true, 'A-AREA-IDEN').length, F.rooms.filter((r) => !r.stair && !r.void).length, `${F.code} room names`);
      // 酷家乐文件：只有六个图层；没有填充、尺寸、家具
      for (const e of K.entities) assert.ok(KUJIALE_LAYERS.has(K.get(e, 8)) || e.type === 'SEQEND', `${F.code} kujiale layer ${K.get(e, 8)}`);
      assert.ok(!K.entities.some((e) => e.type === 'HATCH' || e.type === 'DIMENSION'));
      assert.equal(inserts(K, /^WISH_(?!DOOR|WIN_|SLD_)/).length, 0, 'no furniture in kujiale');
      for (const k in c) want[k] += c[k];
      for (const s of F.stairs) {
        for (const fl of s.flights) treads += Math.max(0, fl.risers - 2);
        if ((s.path?.points?.length || 0) >= 2) treads += 2; // 箭头两笔
      }
    }
    assert.equal(inserts(D, /^WISH_DOOR/).length, want.door);
    assert.equal(inserts(D, /^WISH_WIN_/).length, want.window);
    assert.equal(inserts(D, /^WISH_SLD_/).length, want.slider);
    assert.equal(D.entities.filter((e) => e.type === 'LINE' && D.get(e, 8) === 'A-OPEN').length, 2 * want.open, 'two dashed lines per open piece');
    assert.equal(D.entities.filter((e) => e.type === 'LINE' && D.get(e, 8) === 'A-FLOR-STRS').length, treads, 'tread + arrow lines');
    // 家具：ITEM_ID 的多重集合 = 方案里每层的家具；图层 = 分类
    const att = attribsOf(D).filter((a) => a.att.ITEM_ID);
    assert.deepEqual(att.map((a) => a.att.ITEM_ID).sort(), x.scene.floors.flatMap((F) => F.items.map((it) => String(it.id))).sort());
    const shift = floorStep(x.scene);
    const byId = new Map(x.scene.floors.flatMap((F) => F.items.map((it) => [String(it.id), { it, dx: F.level * shift }])));
    for (const a of att) {
      const { it, dx } = byId.get(a.att.ITEM_ID);
      assert.equal(D.get(a.e, 8), CAT_INFO[it.cat].layer, `${it.kind} layer`);
      assert.equal(a.att.SIZE, `${it.W}x${it.D}x${it.H}`);
      assert.equal(+D.get(a.e, 10), x.scene.tx(it.x) + dx, `${it.kind} X`);
      assert.equal(+D.get(a.e, 20), x.scene.ty(it.z), `${it.kind} Y`);
      assert.equal(+D.get(a.e, 50), ((it.rot % 360) + 360) % 360, `${it.kind} rotation`);
    }
    assert.equal(D.entities.filter((e) => e.type === 'TEXT' && D.get(e, 8) === 'A-ANNO-TTLB' && +D.get(e, 40) === 450).length, x.scene.floors.length, 'one title per floor');
    assert.equal(inserts(D, /^WISH_NORTH$/).length, x.scene.floors.length);
    assert.ok(D.entities.filter((e) => e.type === 'DIMENSION').length >= 4 * x.scene.floors.length);
  });
}

console.log('墙的并集（T5）');
await test('墙环简单、外环逆时针 / 洞顺时针；实心段在墙里、门窗洞在墙外；面积合理', () => {
  for (const tag of ['condo3', 'terrace2', 'semid2', 'studio', 'terrace', 'three-floor']) {
    const x = RUN[tag];
    for (const F of x.scene.floors) {
      const K = parseDxf(x.file(`_${F.code}_kujiale.dxf`));
      const loops = K.entities.filter((e) => e.type === 'LWPOLYLINE' && K.get(e, 8) === 'A-WALL').map((e) => pts(K, e));
      for (const L of loops) {
        assert.equal(new Set(L.map((p) => `${p[0]},${p[1]}`)).size, L.length, 'no repeated vertex');
        for (let i = 0; i < L.length; i++) {
          const [a, b] = [L[i], L[(i + 1) % L.length]];
          assert.ok(a[0] === b[0] || a[1] === b[1], 'rectilinear');
          for (let j = i + 2; j < L.length; j++) {
            if (i === 0 && j === L.length - 1) continue;
            const [c, d] = [L[j], L[(j + 1) % L.length]];
            const hx = a[1] === b[1];
            const vx = c[0] === d[0];
            if (hx === !vx) {
              const [h0, h1, v0, v1] = hx ? [a, b, c, d] : [c, d, a, b];
              const X = v0[0];
              const Y = h0[1];
              const strict = X > Math.min(h0[0], h1[0]) && X < Math.max(h0[0], h1[0]) && Y > Math.min(v0[1], v1[1]) && Y < Math.max(v0[1], v1[1]);
              assert.ok(!strict, `${tag} ${F.code}: self-intersection`);
            }
          }
        }
        const depth = loops.filter((o) => o !== L && pip([L[0][0] + 0.5 * Math.sign(L[1][0] - L[0][0] || 0), L[0][1] + 0.5 * Math.sign(L[1][1] - L[0][1] || 0)], o)).length;
        if (depth % 2 === 0) assert.ok(area2(L) > 0, 'outer CCW');
        else assert.ok(area2(L) < 0, 'hole CW');
      }
      const rects = solidRects(x.scene, F);
      for (const r of rects) assert.ok(inRegion([(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2], loops), `${tag} ${F.code}: solid centre inside`);
      for (const o of F.openings) {
        const w = o.wall;
        const m = (o.a + o.b) / 2;
        const p = w.axis === 'x' ? [x.scene.tx(m), x.scene.ty(w.c)] : [x.scene.tx(w.c), x.scene.ty(m)];
        assert.ok(!inRegion(p, loops), `${tag} ${F.code}: ${o.kind} centre outside`);
      }
      const area = loops.reduce((s, l) => s + area2(l), 0);
      const sum = rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
      assert.ok(area <= sum + 1 && area >= Math.max(...rects.map((r) => (r.x1 - r.x0) * (r.y1 - r.y0))) - 1, 'union area');
    }
  }
});

console.log('门的开向（T6）');
await test('门图块的铰链 + 开向（从 _L / _R、转角、插入点反推）= 方案里的；1.6m 门是双开', () => {
  let doors = 0;
  for (const tag of ['condo3', 'terrace2', 'semid2', 'studio', 'odd']) {
    const x = RUN[tag];
    for (const F of x.scene.floors) {
      const K = parseDxf(x.file(`_${F.code}_kujiale.dxf`));
      const list = inserts(K, /^WISH_DOOR/);
      for (const o of F.openings.filter((q) => q.kind === 'door')) {
        const w = o.wall;
        const A = w.axis === 'x' ? [x.scene.tx(o.a), x.scene.ty(w.c)] : [x.scene.tx(w.c), x.scene.ty(o.a)];
        const B = w.axis === 'x' ? [x.scene.tx(o.b), x.scene.ty(w.c)] : [x.scene.tx(w.c), x.scene.ty(o.b)];
        const nPos = w.axis === 'x' ? [0, -1] : [1, 0];
        const swing = o.swing > 0 ? nPos : [-nPos[0], -nPos[1]];
        const len = Math.round(Math.hypot(B[0] - A[0], B[1] - A[1]));
        const hit = list.find((e) => {
          const P = [+K.get(e, 10), +K.get(e, 20)];
          const a = (+K.get(e, 50) * Math.PI) / 180;
          const u = [Math.cos(a), Math.sin(a)];
          const nv = [-Math.sin(a), Math.cos(a)];
          const name = K.get(e, 2);
          const dbl = name.startsWith('WISH_DOOR2_');
          const far = name.endsWith('_R') ? [P[0] - len * u[0], P[1] - len * u[1]] : [P[0] + len * u[0], P[1] + len * u[1]];
          const ends = [P, far].map((q) => q.map(Math.round).join(',')).sort().join('|');
          const want = [A, B].map((q) => q.join(',')).sort().join('|');
          if (ends !== want) return false;
          if (!dbl) assert.deepEqual(P.map(Math.round), A, `hinge at piece start (${o.id})`);
          assert.equal(dbl, len > 1300, `double door ${len}`);
          assert.ok(Math.abs(nv[0] - swing[0]) < 1e-6 && Math.abs(nv[1] - swing[1]) < 1e-6, `swing side ${o.id}`);
          return true;
        });
        assert.ok(hit, `${tag} ${F.code}: door ${o.id} found`);
        doors++;
      }
    }
  }
  assert.ok(doors > 30);
  const D = parseDxf(RUN.odd.file('_F1_kujiale.dxf'));
  assert.equal(inserts(D, /^WISH_DOOR2_1600x/).length, 1, 'the 1.6 m main door');
  // x 墙、pos 房间在下面（平面 +y）：弧在 DXF −Y 那一边
  const b = D.blocks.get(D.get(inserts(D, /^WISH_DOOR_/)[0], 2));
  assert.ok(b.ents.some((e) => e.type === 'ARC'));
});

console.log('COLLADA（T7、T8）');
function xmlCheck(s) {
  const ids = new Set();
  const refs = [];
  const stack = [];
  const re = /<\?xml[^?]*\?>|<(\/)?([A-Za-z_][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*="[^"<]*")*)\s*(\/)?>|([^<]+)/g;
  let m;
  let last = 0;
  while ((m = re.exec(s))) {
    assert.equal(m.index, last, `xml token at ${last}`);
    last = re.lastIndex;
    if (m[5] !== undefined) {
      assert.ok(!/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(m[5]), 'raw & in text');
      continue;
    }
    if (m[0].startsWith('<?')) continue;
    const [, close, tag, attrs, self] = m;
    for (const [, k, v] of attrs.matchAll(/([\w.:-]+)="([^"]*)"/g)) {
      assert.ok(!/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(v), `raw & in ${k}`);
      if (k === 'id') {
        assert.ok(!ids.has(v), `duplicate id ${v}`);
        ids.add(v);
      }
      if ((k === 'url' || k === 'source' || k === 'target') && v.startsWith('#')) refs.push(v.slice(1));
    }
    if (close) assert.equal(stack.pop(), tag, `close ${tag}`);
    else if (!self) stack.push(tag);
  }
  assert.equal(last, s.length);
  assert.equal(stack.length, 0);
  for (const r of refs) assert.ok(ids.has(r), `ref #${r}`);
  return ids;
}
for (const tag of ['condo3', 'terrace2', 'semid2-busy', 'studio', 'terrace', 'three-floor', 'odd']) {
  await test(`${tag}：DAE 是规整的 XML，引用都找得到，数组长度对`, () => {
    const x = RUN[tag];
    const s = new TextDecoder().decode(x.file('_3D.dae'));
    assert.ok(!s.startsWith('﻿'));
    xmlCheck(s);
    assert.match(s, /<COLLADA xmlns="http:\/\/www\.collada\.org\/2005\/11\/COLLADASchema" version="1\.4\.1">/);
    assert.match(s, /<up_axis>Z_UP<\/up_axis>/);
    assert.match(s, /<unit name="meter" meter="1"\/>/);
    for (const [, gid, body] of s.matchAll(/<geometry id="([^"]+)"[^>]*>([\s\S]*?)<\/geometry>/g)) {
      const arr = {};
      for (const [, id, cnt, nums] of body.matchAll(/<float_array id="([^"]+)" count="(\d+)">([^<]*)<\/float_array>/g)) {
        const v = nums.trim().split(/\s+/).map(Number);
        assert.equal(v.length, +cnt, `${id} count`);
        assert.ok(v.every(Number.isFinite));
        arr[id] = v.length / 3;
      }
      const np = arr[`${gid}-p-a`];
      const nn = arr[`${gid}-n-a`];
      for (const [, cnt, inner] of body.matchAll(/<triangles material="[^"]+" count="(\d+)">([\s\S]*?)<\/triangles>/g)) {
        const inputs = (inner.match(/<input /g) || []).length;
        assert.equal(inputs, 2);
        const p = inner.match(/<p>([^<]*)<\/p>/)[1].trim().split(/\s+/).map(Number);
        assert.equal(p.length, +cnt * 3 * inputs, `${gid} indices`);
        p.forEach((v, i) => assert.ok(Number.isInteger(v) && v >= 0 && v < (i % 2 ? nn : np), `${gid} index ${v}`));
      }
    }
    const model = model3d(x.scene);
    const inst = (s.match(/<instance_node /g) || []).length;
    const nOpen = x.scene.floors.reduce((k, F) => k + F.openings.filter((o) => o.kind !== 'open').length, 0);
    assert.equal(inst, x.r.stats.items + nOpen, 'one instance per item + door/window/slider');
    const keys = new Set([...x.scene.floors.flatMap((F) => F.items.map((it) => it.key))]);
    const libNodes = s.match(/<library_nodes>([\s\S]*?)<\/library_nodes>/)[1];
    const nComp = (libNodes.match(/<node /g) || []).length;
    assert.equal(nComp, model.comps.size);
    assert.ok(nComp >= keys.size, 'components ≥ distinct item keys');
    assert.equal(model.stats.tris, x.r.stats.tris);
    // 材质名：slot__id 中文
    assert.match(s, /<material id="m-cabinetry" name="cabinetry__[a-z0-9-]+ 柜体·[^"]+"/);
    assert.match(s, /<transparency><float>0\.3<\/float><\/transparency>/);
  });
}
await test('3D：外框 = 平面外框、顶 = 最高一层的天花；三角形数在预算里；墙是封闭朝外的实体', () => {
  for (const tag of Object.keys(RUN)) {
    const x = RUN[tag];
    const model = model3d(x.scene);
    const comps = new Map([...model.comps.values()].map((c) => [c.id, c]));
    const box = () => [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const all = box();
    const wallsBy = {};
    walk(model.root, (nd, M) => {
      const gid = nd.geom || (nd.inst && comps.get(nd.inst)?.geom);
      if (!gid) return;
      const wm = /^(F\d+)-walls$/.exec(gid);
      const bs = wm ? [all, (wallsBy[wm[1]] ||= box())] : [all];
      for (const g of model.geoms.get(gid).groups.values())
        for (let i = 0; i < g.length; i += 3) {
          const p = apply(M, g[i], g[i + 1], g[i + 2]);
          for (const b of bs)
            for (let k = 0; k < 3; k++) {
              b[k] = Math.min(b[k], p[k]);
              b[k + 3] = Math.max(b[k + 3], p[k]);
            }
        }
    });
    const W = x.scene.W / 1000;
    const Dp = x.scene.D / 1000;
    const top = Math.max(...x.scene.floors.map((F) => F.elev + F.ceil));
    // 每层的墙：XY 外框 = DXF 那一层的实心墙段外框（同一个原点，米）；顶 = 这一层的天花高
    for (const F of x.scene.floors) {
      const rs = solidRects(x.scene, F);
      const want = [Math.min(...rs.map((r) => r.x0)), Math.min(...rs.map((r) => r.y0)), Math.max(...rs.map((r) => r.x1)), Math.max(...rs.map((r) => r.y1))].map((v) => v / 1000);
      const b = wallsBy[F.code];
      [b[0], b[1], b[3], b[4]].forEach((v, i) => assert.ok(Math.abs(v - want[i]) <= 0.002, `${tag} ${F.code} walls bbox[${i}] ${v} vs ${want[i]}`));
      assert.ok(Math.abs(b[5] - (F.elev + F.ceil)) <= 0.002, `${tag} ${F.code} wall top`);
    }
    // 整个模型：在平面外框里（临街门柱的帽子比外墙皮多 8.5cm），顶 = 最高一层的天花，最低 = 一楼地面饰面下 4cm
    assert.ok(all[0] >= -0.09 && all[1] >= -0.09 && all[3] <= W + 0.09 && all[4] <= Dp + 0.09, `${tag} bbox ${all.map((v) => v.toFixed(3))} vs ${W} × ${Dp}`);
    assert.ok(Math.abs(all[5] - top) <= 0.02, `${tag} top ${all[5]} vs ${top}`);
    assert.ok(Math.abs(all[2] + 0.04) <= 0.001, `${tag} bottom ${all[2]}`);
    assert.ok(Math.abs(all[3] - all[0] - W) <= 0.2 && Math.abs(all[4] - all[1] - Dp) <= 0.2, `${tag} size ≈ plan`);
    assert.ok(model.stats.tris < 150000, `${tag} tris ${model.stats.tris}`);
    for (const [k, v] of Object.entries(model.stats.perComponent)) assert.ok(v <= 1500, `${k} ${v} tris`);
    for (const F of x.scene.floors) {
      const { mesh, cells } = wallMesh(F, x.scene);
      const v = mesh.volume();
      const c = cellVolume(cells);
      assert.ok(v > 0 && Math.abs(v - c) < 1e-6 * Math.max(1, c), `${tag} ${F.code} wall volume ${v} vs ${c}`);
    }
  }
});

console.log('体块配方（T9）');
await test('每种家具都有配方和分类；默认尺寸的外框 ≈ W × D、顶 ≈ 名义高度', () => {
  const kinds = Object.keys(CATALOG);
  for (const k of kinds) assert.ok(catOf(k), `${k} has a category`);
  assert.equal(new Set(Object.values(CATEGORY).flat()).size, kinds.length, 'every kind in exactly one category');
  for (const k of kinds) {
    const def = CATALOG[k];
    for (const v of def.variants || [undefined]) {
      const item = { kind: k, variant: v, w: def.size[0], d: def.size[1], h: ['wardrobe', 'tallUnit', 'shoeCabinet', 'bookshelf', 'displayCabinet', 'tvWall', 'featureWall', 'curtains', 'kitchenRun'].includes(k) ? 2.6 : undefined, seats: 6 };
      const nm = nominal(item, 2.8);
      const parts = massing(item, nm, 2.8);
      assert.ok(parts?.length, `${k}/${v} recipe`);
      const b = partsBox(parts);
      const loose = LOOSE_FIT[k] === true || (Array.isArray(LOOSE_FIT[k]) && LOOSE_FIT[k].includes(v));
      if (!loose) {
        assert.ok(Math.abs(b.x1 - b.x0 - nm.W) <= 0.0201, `${k}/${v} W ${(b.x1 - b.x0).toFixed(3)} vs ${nm.W}`);
        assert.ok(Math.abs(b.z1 - b.z0 - nm.D) <= 0.0201, `${k}/${v} D ${(b.z1 - b.z0).toFixed(3)} vs ${nm.D}`);
      }
      if (k !== 'art' && k !== 'pendant') assert.ok(Math.abs(b.y1 - nm.H) <= 0.0201, `${k}/${v} H ${b.y1.toFixed(3)} vs ${nm.H}`);
      for (const p of parts) assert.ok(['box', 'cyl', 'ell'].includes(p.s) && [p.x, p.y, p.z].every(Number.isFinite) && (p.m.startsWith('fixed__') ? FIXED[p.m.slice(7)] : SLOTS.some((s) => s.id === p.m)), `${k}/${v} part material ${p.m}`);
    }
  }
});

console.log('OBJ / MTL（T10）');
for (const tag of ['condo3', 'terrace2-busy', 'three-floor']) {
  await test(`${tag}：OBJ 的面都指向存在的顶点，三角形数 = DAE；MTL 的材质都有`, () => {
    const x = RUN[tag];
    const o = new TextDecoder().decode(x.file('_3D.obj')).split('\n');
    const m = new TextDecoder().decode(x.file('_3D.mtl')).split('\n');
    assert.equal(o.find((l) => l && !l.startsWith('#')), `mtllib ${x.r.base}_3D.mtl`);
    const nv = o.filter((l) => l.startsWith('v ')).length;
    const faces = o.filter((l) => l.startsWith('f '));
    for (const f of faces) {
      const idx = f.slice(2).split(' ').map(Number);
      assert.equal(idx.length, 3);
      assert.ok(idx.every((i) => Number.isInteger(i) && i >= 1 && i <= nv), f);
    }
    assert.equal(faces.length, x.r.stats.tris);
    const newm = new Set(m.filter((l) => l.startsWith('newmtl ')).map((l) => l.slice(7)));
    for (const u of o.filter((l) => l.startsWith('usemtl '))) assert.ok(newm.has(u.slice(7)), u);
    const gi = m.indexOf('newmtl fixed__glass');
    assert.ok(gi >= 0 && m.slice(gi, gi + 9).includes('d 0.3'));
    assert.ok([...newm].every((s) => /^[A-Za-z0-9_.-]+$/.test(s)));
  });
}

console.log('zip（T11）');
await test('zip：本地头 + 中央目录，CRC 对、大小对、都在 <base>/ 下、不压缩、UTF-8 标志', () => {
  for (const tag of ['condo3', 'semid2-busy']) {
    const { r } = RUN[tag];
    const b = r.bytes;
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const eocd = b.length - 22;
    assert.equal(v.getUint32(eocd, true), 0x06054b50);
    const count = v.getUint16(eocd + 10, true);
    assert.equal(count, r.entries.length);
    let cd = v.getUint32(eocd + 16, true);
    for (let i = 0; i < count; i++) {
      assert.equal(v.getUint32(cd, true), 0x02014b50);
      const flags = v.getUint16(cd + 8, true);
      const method = v.getUint16(cd + 10, true);
      const crc = v.getUint32(cd + 16, true);
      const size = v.getUint32(cd + 20, true);
      const nl = v.getUint16(cd + 28, true);
      const off = v.getUint32(cd + 42, true);
      const name = new TextDecoder().decode(b.subarray(cd + 46, cd + 46 + nl));
      assert.ok(flags & 0x0800, 'UTF-8 flag');
      assert.equal(method, 0);
      assert.ok(name.startsWith(`${r.base}/`), name);
      assert.equal(v.getUint32(off, true), 0x04034b50);
      const lnl = v.getUint16(off + 26, true);
      const data = b.subarray(off + 30 + lnl + v.getUint16(off + 28, true), off + 30 + lnl + v.getUint16(off + 28, true) + size);
      assert.equal(crc32(data), crc, `${name} crc`);
      assert.equal(v.getUint32(off + 14, true), crc);
      assert.equal(v.getUint32(off + 18, true), size);
      cd += 46 + nl + v.getUint16(cd + 30, true) + v.getUint16(cd + 32, true);
    }
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  }
});

console.log('名字（T12）');
await test('文件名 ASCII；「双层排屋 · 20×70」→ WISH_Double-storey-terrace-20x70_20261019；纯中文名退回 id', () => {
  assert.equal(exportBase({ name: '双层排屋 · 20×70', id: 'p-x' }, NOW), 'WISH_Double-storey-terrace-20x70_20261019');
  assert.equal(exportBase({ name: '陈家', id: 'p-abc123456' }, NOW), 'WISH_project-123456_20261019');
  assert.equal(exportBase({ name: 'Peggy 的梦想家', id: 'p' }, NOW), 'WISH_Peggy-s-dream-home_20261019');
  for (const x of Object.values(RUN)) for (const e of x.r.entries) assert.match(e.name, /^[\x21-\x7e]+$/, e.name);
});
await test('文件里用到的固定词都有英文（bi 查得到词典）', () => {
  const fixed = [
    ...Object.values(CAT_INFO).flatMap((c) => [c.group, c.label]),
    ...LAYERS.map((l) => l[4]),
    ...Object.values(FIXED).map((f) => f.zh),
    '墙体', '地面', '楼板', '车廊屋顶', '门窗', '楼梯', '栏杆', '门', '窗', '趟门', '上', '下', '一楼', '二楼', '三楼',
    '概念示意 · 尺寸以现场量尺为准', '概念示意，尺寸以现场量尺为准', '设计师文件包', '待确认', '仅供公司内部设计使用。',
    ...SLOTS.map((s) => s.zh),
    ...Object.values(CATALOG).map((d) => d.zh),
    ...Object.values(ROOM_TYPES).map((t) => t.zh),
  ];
  for (const zh of fixed) {
    const b = bi(zh);
    assert.ok(b.en && b.en !== b.zh, `no English for ${zh}`);
  }
});
await test('README：带 BOM、CRLF、每行 ≤ 100 列；家具示意（不是我们做）、待确认都在；清单 CSV 带 BOM', () => {
  const { r } = RUN['terrace2-busy'];
  const rd = r.entries.find((e) => e.name.endsWith('/README.txt')).bytes;
  assert.deepEqual([...rd.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const s = new TextDecoder().decode(rd.subarray(3));
  assert.ok(!/[^\r]\n/.test(s), 'CRLF only');
  const cols = (l) => [...l].reduce((k, ch) => k + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1), 0);
  for (const l of s.split('\r\n')) assert.ok(cols(l) <= 100, `line too long: ${l}`);
  for (const want of ['Furniture for illustration', '家具示意', 'A-CASE', '待确认 / To confirm', 'Kujiale', 'cabinetry__', 'Concept only']) assert.ok(s.includes(want), want);
  const csv = r.entries.find((e) => e.name.endsWith('_schedule.csv')).bytes;
  assert.deepEqual([...csv.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const rows = new TextDecoder().decode(csv.subarray(3)).trim().split('\r\n');
  assert.equal(rows[0], 'floor,room_zh,room_en,category,ours,kind,name_zh,name_en,W_mm,D_mm,H_mm,ft_run,materials,item_id');
  assert.equal(rows.length - 1, r.stats.items + RUN['terrace2-busy'].scene.floors.reduce((k, F) => k + F.openings.filter((o) => o.kind === 'door').length, 0));
});

console.log('可重复（T13）');
await test('同一个 now 跑两次：zip 一个字节都不差', async () => {
  const p = RUN['semid2-busy'].p;
  const a = await exportBundle(p, { now: NOW });
  const b = await exportBundle(p, { now: NOW });
  assert.ok(Buffer.from(a.bytes).equals(Buffer.from(b.bytes)));
});

console.log('隐私 / 开关（T14）');
await test('只有设计师版有入口；许愿模式拦两道；导出代码不联网、不读 key', async () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/studio/StudioApp.jsx'), 'utf8');
  assert.ok(app.includes("modal === 'export' && staffView && !WISH"));
  assert.ok(app.includes('onExport={staffView && !WISH'));
  assert.match(app, /lazy\(\(\) => import\('\.\/export\/ExportSheet\.jsx'\)\)/);
  assert.ok(!/from '\.\/export\//.test(app), 'StudioApp never imports export code statically');
  const tb = fs.readFileSync(path.join(ROOT, 'src/studio/ui/Toolbar.jsx'), 'utf8');
  assert.match(tb, /\{p\.onExport && <MenuItem [^\n]*data-export/);
  const sheet = fs.readFileSync(path.join(ROOT, 'src/studio/export/ExportSheet.jsx'), 'utf8');
  assert.ok(sheet.includes('isWishMode'));
  for (const f of fs.readdirSync(path.join(ROOT, 'src/studio/export'))) {
    const src = fs.readFileSync(path.join(ROOT, 'src/studio/export', f), 'utf8');
    for (const bad of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'apiKey', 'gemini']) assert.ok(!src.toLowerCase().includes(bad.toLowerCase()), `${f}: ${bad}`);
    assert.ok(!/import\(\s*['"`]https?:/.test(src), `${f}: remote import`);
  }
  // 许愿模式：exportBundle 直接报错
  const had = Object.getOwnPropertyDescriptor(globalThis, 'location');
  globalThis.location = { search: '?mode=wish', href: 'http://x/studio.html?mode=wish' };
  try {
    await assert.rejects(() => exportBundle(RUN.condo3.p, { now: NOW }), /wish mode/);
  } finally {
    if (had) Object.defineProperty(globalThis, 'location', had);
    else delete globalThis.location;
  }
});
await test('没按导出的人不多下载：export/ 和 en-export.js 只从懒加载的面板进来；面板的图标不和客人的页面共用（共用会拆出一个小块，客人的页面多下载一个文件）', () => {
  const all = [];
  const walkDir = (d) => {
    for (const f of fs.readdirSync(d)) {
      const q = path.join(d, f);
      if (fs.statSync(q).isDirectory()) walkDir(q);
      else if (/\.(jsx?|mjs)$/.test(f)) all.push(q);
    }
  };
  walkDir(path.join(ROOT, 'src'));
  const EXPORT_DIR = path.join(ROOT, 'src/studio/export') + path.sep;
  for (const f of all.filter((q) => !q.startsWith(EXPORT_DIR))) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f);
    assert.ok(!/(?:^|\n)\s*import\s[^;]*?from\s*['"][^'"]*\/export\/[^'"]*['"]/.test(src) && !/(?:^|\n)\s*import\s*['"][^'"]*\/export\//.test(src), `${rel} imports export code statically`);
    assert.ok(!/['"][^'"]*en-export(\.js)?['"]/.test(src), `${rel} imports en-export.js`);
  }
  const lucide = (files) => new Set(files.flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(/import\s*\{([^}]+)\}\s*from\s*'lucide-react'/g)].flatMap((m) => m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean))));
  const sheetIcons = lucide([path.join(ROOT, 'src/studio/export/ExportSheet.jsx')]);
  const guest = lucide(all.filter((q) => /[\\/]src[\\/](quiz|launcher|wish|shared|cases)[\\/]/.test(q)));
  const studio = lucide(all.filter((q) => /[\\/]src[\\/]studio[\\/]/.test(q) && !q.startsWith(EXPORT_DIR)));
  assert.ok(sheetIcons.size >= 5);
  for (const i of sheetIcons) assert.ok(!guest.has(i) || studio.has(i), `ExportSheet icon ${i} is used by a guest page but not by the studio`);
});
await test('文件里没有客人档案里的东西（愿望、雷区、一句话心愿）', async () => {
  const p = project(templatePlan('terrace2'), BUSY, 'p-priv');
  p.profile = { ...p.profile, oneWish: 'MARKERONEWISH', wishes: ['MARKERWISH'], avoid: ['MARKERAVOID'], notes: 'MARKERNOTE', budget: 'MARKERBUDGET' };
  const r = await exportBundle(p, { now: NOW });
  const all = latin1(r.bytes);
  for (const m of ['MARKERONEWISH', 'MARKERWISH', 'MARKERAVOID', 'MARKERNOTE', 'MARKERBUDGET']) assert.ok(!all.includes(m), m);
  const brief = designerBrief(p);
  assert.equal(brief.v, 1);
  assert.equal(brief.profile, null);
  assert.equal(brief.property, null);
  assert.equal(brief.chosenCase, null);
  assert.deepEqual(brief.kept, []);
});
await test('扩展点：exportBundle(project, { brief }) 用传进来的 brief 写 README / 清单', async () => {
  const p = RUN.condo3.p;
  const b = designerBrief(p);
  const items = b.items.slice(0, 1).map((it) => ({ ...it, name: { zh: '试验柜', en: 'TESTCAB' } }));
  const r = await exportBundle(p, { now: NOW, brief: { ...b, items }, dxf: false, kujiale: false, model3d: true });
  const rd = new TextDecoder().decode(r.entries.find((e) => e.name.endsWith('/README.txt')).bytes);
  assert.ok(rd.includes('TESTCAB'));
  assert.deepEqual(r.files.map((f) => f.name.replace(r.base, '')).sort(), ['README.txt', '_3D.dae', '_3D.mtl', '_3D.obj', '_schedule.csv'].sort());
  await assert.rejects(() => exportBundle(p, { dxf: false, kujiale: false, model3d: false }), /nothing selected/);
});

console.log('颜色（T15）');
await test('palette.js 的固定材质色 = matlib buildFixed 的颜色', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/studio/engine/matlib.js'), 'utf8');
  const lib = Object.fromEntries([...src.matchAll(/F\('(\w+)', \{ color: 0x([0-9a-f]{6})/gi)].map(([, k, v]) => [k, `#${v.toUpperCase()}`]));
  for (const [k, f] of Object.entries(FIXED)) {
    if (f.own) continue;
    const name = MATLIB_NAME[k] || k;
    assert.equal(f.hex.toUpperCase(), lib[name], `${k} ↔ matlib ${name}`);
  }
});

console.log('速度（T16）');
await test('双层半独立 + 忙碌档案：完整导出 < 2 秒', async () => {
  const t1 = Date.now();
  await exportBundle(RUN['semid2-busy'].p, { now: NOW });
  const ms = Date.now() - t1;
  console.log(`    semid2-busy 完整导出 ${ms} ms`);
  assert.ok(ms < 2000, `${ms} ms`);
});

console.log('品牌、外购的台面（T17）');
await test('品牌行「SAIL BY RICCIONE REKA」在 README 第一行、每层图名下面、DAE / OBJ / MTL；「溪岸 SAIL」不再出现', () => {
  const x = RUN['terrace2-busy'];
  const rd = new TextDecoder().decode(x.file('/README.txt').subarray(3));
  assert.equal(rd.split('\r\n')[0], `WISH by RICCIONE REKA · ${SAIL_LINE} — 设计师文件包 / Designer pack`);
  const D = parseDxf(x.file('_plan_all-floors.dxf'));
  const tt = texts(D, false, 'A-ANNO-TTLB').map((t) => t.s);
  assert.equal(tt.filter((s) => s.endsWith(`WISH by RICCIONE REKA · ${SAIL_LINE}`)).length, x.scene.floors.length, tt.join(' | '));
  const dae = new TextDecoder().decode(x.file('_3D.dae'));
  assert.ok(dae.includes(`<authoring_tool>WISH by RICCIONE REKA · ${SAIL_LINE}</authoring_tool>`));
  const obj = new TextDecoder().decode(x.file('_3D.obj'));
  const mtl = new TextDecoder().decode(x.file('_3D.mtl'));
  assert.ok(obj.startsWith(`# WISH by RICCIONE REKA · ${SAIL_LINE}`) && mtl.startsWith(`# WISH by RICCIONE REKA · ${SAIL_LINE}`));
  for (const tag of Object.keys(RUN)) for (const e of RUN[tag].r.entries) assert.ok(!decodeText(latin1(e.bytes), false).includes('溪岸 SAIL') && !new TextDecoder().decode(e.bytes).includes('溪岸 SAIL'), `${tag} ${e.name}`);
});
await test('台面：还在 A-CASE / 定制柜组里，但处处写「外购」—— README 材质表和清单、CSV、DXF MATERIALS、DAE / MTL 材质名；没有板材编号', () => {
  const x = RUN['terrace2-busy'];
  const ct = x.scene.materials.countertop;
  const rd = new TextDecoder().decode(x.file('/README.txt').subarray(3));
  // 材质表：countertop <id> 台面·外购·<材质> — Worktop (sourced) · <English>
  assert.ok(rd.includes(`countertop ${ct.id} 台面·外购·${ct.mat.zh} — Worktop (sourced) · ${ct.mat.en}`), 'README material row');
  // 清单：台面（外购） <材质>；定制柜那一组下面一句说明（中英）
  assert.ok(rd.includes(`台面（外购） ${ct.mat.zh}`), 'README schedule line');
  assert.ok(rd.includes('台面由我们配，向别的厂家采购（外购），没有 sAil 板材编号。'));
  assert.ok(rd.includes('We supply the worktop but buy it in from another maker (sourced), so it has no sAil board code.'));
  const csv = new TextDecoder().decode(x.file('_schedule.csv').subarray(3));
  const kitchen = csv.split('\r\n').filter((l) => l.includes(',kitchenRun,'));
  assert.ok(kitchen.length && kitchen.every((l) => l.includes(`countertop=${ct.id} 台面（外购） ${ct.mat.zh}`) && l.includes(',yes,')), kitchen.join('\n'));
  const D = parseDxf(x.file('_plan_all-floors.dxf'));
  const runs = attribsOf(D).filter((a) => /^WISH_KITCHENRUN_/.test(D.get(a.e, 2)));
  assert.ok(runs.length);
  for (const a of runs) {
    assert.equal(D.get(a.e, 8), 'A-CASE', 'worktop stays with the cabinets');
    assert.ok(a.att.MATERIALS.includes(`countertop=${ct.id} 外购 ${ct.mat.zh}`), a.att.MATERIALS);
  }
  const dae = new TextDecoder().decode(x.file('_3D.dae'));
  assert.match(dae, new RegExp(`<material id="m-countertop" name="countertop__${ct.id} 台面·外购·${ct.mat.zh}"`));
  // 台面的部件在「定制柜」组里
  const caseGroup = dae.slice(dae.indexOf('name="定制柜（我们做） Cabinetry (ours)"'));
  assert.ok(dae.includes('name="定制柜（我们做） Cabinetry (ours)"') && caseGroup.includes('KITCHENRUN'));
  const mtl = new TextDecoder().decode(x.file('_3D.mtl')).split('\n');
  const i = mtl.indexOf(`newmtl countertop__${ct.id}`);
  assert.ok(i >= 0 && mtl[i + 1].endsWith('· Worktop (sourced)'), mtl[i + 1]);
  // 以后填 sAil 板材编号：柜体会带上，台面不会
  const m = model3d(x.scene).materials;
  try {
    BOARD_CODE[x.scene.materials.cabinetry.id] = 'SA-TEST-1';
    BOARD_CODE[ct.id] = 'SA-TEST-2';
    assert.ok(materialName(m.find((q) => q.sym === 'cabinetry')).endsWith(' SA-TEST-1'));
    assert.ok(!materialName(m.find((q) => q.sym === 'countertop')).includes('SA-TEST'));
  } finally {
    for (const k of Object.keys(BOARD_CODE)) delete BOARD_CODE[k];
  }
  assert.deepEqual(Object.keys(SOURCED), ['countertop']);
});

console.log('文件包名称（T18）');
await test('读进来的户型盖在 condo3 模板上：文件包不叫「Condo-3-bed-2-bath」；面板的名字（客人名 / 地址）用在文件名、图名、README；方案不被改', async () => {
  const p = project(templatePlan('condo3'), null, 'p-imp-9f3k2q');
  assert.equal(p.name, '公寓 · 3 房 2 卫');
  // PlanEditor 读进别的户型：plan.name 换成「新方案」（或读出来的户型标签），方案名还是模板的
  p.plan = { ...templatePlan('terrace2'), name: '新方案' };
  const before = JSON.stringify(p);
  assert.equal(defaultPackName(p), '');
  const r = await exportBundle(p, { now: NOW, dxf: true, kujiale: false, model3d: true });
  assert.equal(r.name, 'WISH_project-9f3k2q_20261019.zip');
  const all = r.entries.map((e) => new TextDecoder().decode(e.bytes)).join('\n');
  for (const bad of ['Condo-3-bed-2-bath', '公寓 · 3 房 2 卫', 'Condo · 3']) assert.ok(!all.includes(bad), bad);
  // 读出来的户型标签 → 预填它
  p.plan.name = 'TYPE B';
  assert.equal(defaultPackName(p), 'TYPE B');
  const r1 = await exportBundle(p, { now: NOW, dxf: false, kujiale: true, model3d: false });
  assert.equal(r1.name, 'WISH_TYPE-B_20261019.zip');
  p.plan.name = '新方案';
  // 设计师在面板上填的名字
  const r2 = await exportBundle(p, { now: NOW, name: '  Tan · Setia Alam ', dxf: true, kujiale: false, model3d: true });
  assert.equal(r2.name, 'WISH_Tan-Setia-Alam_20261019.zip');
  const rd = new TextDecoder().decode(r2.entries.find((e) => e.name.endsWith('/README.txt')).bytes.subarray(3));
  assert.ok(rd.includes('方案 / Project: Tan · Setia Alam'), rd.split('\r\n')[2]);
  const D = parseDxf(r2.entries.find((e) => e.name.endsWith('_plan_all-floors.dxf')).bytes);
  assert.ok(texts(D, false, 'A-ANNO-TTLB').some((t) => t.s === `Tan · Setia Alam · WISH by RICCIONE REKA · ${SAIL_LINE}`));
  assert.ok(new TextDecoder().decode(r2.entries.find((e) => e.name.endsWith('_3D.dae')).bytes).includes('<visual_scene id="scene" name="Tan · Setia Alam">'));
  // 中文名：文件名退回 id，图名 / README 还是中文
  const r3 = await exportBundle(p, { now: NOW, name: '陈先生', dxf: false, kujiale: false, model3d: true });
  assert.equal(r3.name, 'WISH_project-9f3k2q_20261019.zip');
  assert.ok(new TextDecoder().decode(r3.entries.find((e) => e.name.endsWith('/README.txt')).bytes).includes('Project: 陈先生'));
  assert.equal(JSON.stringify(p), JSON.stringify({ ...JSON.parse(before), plan: { ...JSON.parse(before).plan } }), 'project not mutated');
});
await test('哪些名字算「没取过」：模板名（中 / 英）、新方案、分享来的模板；客人的名字留着', () => {
  for (const tp of ['condo3', 'terrace2', 'semid2', 'studio', 'terrace']) {
    const pl = tplPlan(tp);
    assert.ok(isDefaultName(pl.name), pl.name);
    assert.ok(isDefaultName(enOf(pl.name) || pl.name), enOf(pl.name));
    assert.ok(isDefaultName(`${pl.name}（分享）`));
  }
  for (const d of ['', '  ', '新方案', 'New project', '分享的方案']) assert.ok(isDefaultName(d), d);
  for (const n of ['Peggy 的梦想家', 'TYPE B', 'Tan · Setia Alam', '陈先生']) assert.ok(!isDefaultName(n), n);
  assert.equal(defaultPackName({ name: 'Peggy 的梦想家', plan: { name: '双层排屋 · 20×70' } }), 'Peggy 的梦想家');
  assert.equal(defaultPackName({ name: '双层排屋 · 20×70', plan: { name: '双层排屋 · 20×70' } }), '');
});

console.log('家具挪到别的房间（T19）');
await test('衣柜从卧室 3 拖进卧室 2：ROOM 属性、清单 CSV、3D 节点名都写卧室 2（看位置，不看存着的 item.room）', async () => {
  const p = project(templatePlan('terrace2'), null, 'p-move');
  const ff = p.plan.floors.find((f) => f.id === 'ff');
  const bd2 = ff.rooms.find((r) => r.id === 'f-bd2');
  const ward = p.furniture.find((f) => f.kind === 'wardrobe' && f.room === 'f-bd3');
  assert.ok(ward && bd2);
  ward.x = +(bd2.x + bd2.w / 2).toFixed(3);
  ward.z = +(bd2.y + bd2.d / 2).toFixed(3);
  assert.equal(ward.room, 'f-bd3', 'the engine only moves x / z');
  const r = await exportBundle(p, { now: NOW });
  const name = buildScene(p, { now: NOW }).floors.find((F) => F.id === 'ff').rooms.find((q) => q.id === 'f-bd2').name;
  assert.equal(name.zh, '卧室 2');
  const D = parseDxf(r.entries.find((e) => e.name.endsWith('_plan_all-floors.dxf')).bytes);
  assert.equal(attribsOf(D).find((a) => a.att.ITEM_ID === ward.id).att.ROOM, '卧室 2');
  const csv = new TextDecoder().decode(r.entries.find((e) => e.name.endsWith('_schedule.csv')).bytes.subarray(3)).split('\r\n');
  const row = csv.find((l) => l.endsWith(`,${ward.id}`)).split(',');
  assert.deepEqual([row[1], row[2]], ['卧室 2', name.en]);
  const dae = new TextDecoder().decode(r.entries.find((e) => e.name.endsWith('_3D.dae')).bytes);
  const node = new RegExp(`<node id="[^"]*-${ncName(ward.id)}" name="([^"]+)"`).exec(dae);
  assert.ok(node && node[1].endsWith(`· ${both(name)}`), node?.[1]);
  // 中心正好在墙线上的（窗帘）还是用存着的房间
  const cur = p.furniture.find((f) => f.kind === 'curtains');
  if (cur) {
    const sc = buildScene(p, { now: NOW });
    const it = sc.floors.flatMap((F) => F.items).find((q) => q.id === cur.id);
    assert.ok(it.roomId, 'curtain keeps a room');
  }
});

console.log('门窗跨过 T 字口（T20）');
let OWNER = null;
async function ownerPlan() {
  if (OWNER) return OWNER;
  const S = await import('../src/studio/plan/sheet.js');
  const WALLS = await import('../src/studio/plan/walls.js');
  const { JpegImage } = await import('../node_modules/pdfjs-dist/image_decoders/pdf.image_decoders.mjs');
  const FX = path.join(ROOT, 'test/fixtures/ai');
  const J = (f) => JSON.parse(fs.readFileSync(path.join(FX, f), 'utf8'));
  const jp = new JpegImage();
  jp.parse(new Uint8Array(fs.readFileSync(path.join(FX, 'owner-type-b-photo.jpg'))));
  const img = { width: jp.width, height: jp.height, data: jp.getData({ width: jp.width, height: jp.height, forceRGB: true, isSourcePDF: false }) };
  const rr = S.rectifyEstimate(img);
  const rect = S.warpImage(img, rr.Hinv, rr.width, rr.height);
  const found = S.normalizeFound(J('pass1-owner.json'), rect.width, rect.height);
  const pg = found.plans[0];
  const f = Math.max(pg.crop.x1 - pg.crop.x0, pg.crop.y1 - pg.crop.y0) < 1400 ? 2 : 1;
  const CW = Math.round((pg.crop.x1 - pg.crop.x0) * f);
  const CH = Math.round((pg.crop.y1 - pg.crop.y0) * f);
  const crop = S.enhance(S.warpImage(rect, [1 / f, 0, pg.crop.x0, 0, 1 / f, pg.crop.y0, 0, 0, 1], CW, CH));
  const read = J('pass2-owner.json');
  const scale = S.pageScale([{ read, cropW: CW, cropH: CH, photo: true }]);
  const H2 = Math.round(CH * scale.aspect);
  const sq = S.warpImage(crop, [1, 0, 0, 0, CH / H2, 0, 0, 0, 1], CW, H2);
  let walls = null;
  try {
    walls = WALLS.extractWalls(sq, { pxPerM: 1 / scale.mPerPx });
  } catch {
    walls = null;
  }
  OWNER = S.assemblePlan([{ level: pg.level, title: pg.title, read, cropW: CW, cropH: CH, src: 'data:image/jpeg;base64,x', srcScale: f, page: 1, photo: true, walls, ink: S.inkMask(sq) }], { scale, screenshot: found.screenshot }).plan;
  return OWNER;
}
await test('老板的 TYPE B（pass2-owner）：跨过 T 字口的门是一扇 1000 的门，没有短过 300 的窗；DXF 图块、酷家乐、3D 门扇都一样', async () => {
  const plan = await ownerPlan();
  const p = project(templatePlan('condo3'), null, 'p-owner');
  p.plan = { ...plan, name: '新方案' };
  p.furniture = [];
  const scene = buildScene(p, { now: NOW });
  // 原始的墙段：gf-o12 / gf-o27 确实被 T 字口切成两块（不然这个测试就没意义）
  const raw = scene.floors[0].walls.flatMap((w) => w.pieces.filter((q) => q.openingId === 'gf-o12' || q.openingId === 'gf-o27'));
  assert.ok(raw.filter((q) => q.openingId === 'gf-o12').length === 2 && raw.filter((q) => q.openingId === 'gf-o27').length === 2, 'fixture still splits the two openings');
  const ops = scene.floors.flatMap((F) => F.openings);
  const door = ops.filter((o) => o.id === 'gf-o12');
  assert.equal(door.length, 1);
  assert.equal(Math.round((door[0].b - door[0].a) * 1000), 1000);
  assert.equal(ops.filter((o) => o.id === 'gf-o27').length, 1);
  assert.equal(Math.round((ops.find((o) => o.id === 'gf-o27').b - ops.find((o) => o.id === 'gf-o27').a) * 1000), 860);
  for (const o of ops) if (o.kind === 'window') assert.ok(o.b - o.a >= 0.3, `window ${o.id} ${o.b - o.a}`);
  const r = await exportBundle(p, { now: NOW });
  for (const e of r.entries.filter((q) => q.name.endsWith('.dxf'))) {
    const D = parseDxf(e.bytes);
    const names = inserts(D, /^WISH_(DOOR|WIN|SLD)/).map((q) => D.get(q, 2));
    assert.ok(names.includes('WISH_DOOR_1000x120_L') || names.includes('WISH_DOOR_1000x120_R'), `${e.name}: ${names.join(' ')}`);
    for (const nm of names) {
      const len = +/_(\d+)x\d+/.exec(nm)[1];
      assert.ok(len >= 300, `${e.name}: ${nm}`);
    }
  }
  const dae = new TextDecoder().decode(r.entries.find((e) => e.name.endsWith('_3D.dae')).bytes);
  assert.ok(!/WISH_WIN_(\d{1,2}|[12]\d\d)x/.test(dae), 'no 3D window under 300');
  assert.ok(/<instance_node url="#c-WISH_DOOR_1000x/.test(dae), '3D door 1000');
  assert.equal(r.stats.openings.door, scene.stats.openings.door);
});
await test('门窗合并的规则：同一个 id 首尾相接 → 一扇；同一种首尾相接 → 一扇；比墙厚短的碎块 → 并进邻居；隔开的不合', () => {
  const w1 = { id: 'a', axis: 'z', c: 3, t: 0.12, pos: { id: 'r1' } };
  const w2 = { id: 'b', axis: 'z', c: 3, t: 0.12, pos: { id: 'r2' } };
  const pc = (wall, a, b, kind, oid) => ({ id: oid || `${wall.id}-${a}`, oid: oid || null, kind, wall, a, b, t: wall.t, sill: 0, head: 2.1, hinge: a, swing: 1, room: null });
  const m1 = mergeOpenings([pc(w1, 3.42, 3.75, 'door', 'o1'), pc(w2, 3.75, 4.42, 'door', 'o1')]);
  assert.equal(m1.length, 1);
  assert.deepEqual([m1[0].a, m1[0].b, m1[0].wall.id, m1[0].id], [3.42, 4.42, 'b', 'o1']);
  assert.equal(mergeOpenings([pc(w1, 1, 2, 'window'), pc(w2, 2, 3, 'window')]).length, 1);
  assert.equal(mergeOpenings([pc(w1, 1, 2, 'window', 'x'), pc(w2, 2, 3, 'door', 'y')]).length, 2, 'door next to a window stays two');
  const m2 = mergeOpenings([pc(w1, 1, 1.08, 'window', 'p'), pc(w2, 1.15, 2, 'window', 'q')]);
  assert.equal(m2.length, 1, 'sliver folds into its neighbour');
  assert.deepEqual([m2[0].a, m2[0].b, m2[0].id], [1, 2, 'q']);
  assert.equal(mergeOpenings([pc(w1, 1, 2, 'window'), pc(w2, 2.5, 3, 'window')]).length, 2, 'gap → two windows');
  assert.ok(mergeOpenings([pc(w1, 1, 2, 'window'), pc({ ...w2, c: 4 }, 2, 3, 'window')]).length === 2, 'other wall line');
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
