// 3D 户型图里的床、沙发、洁具：一个框拆成几个实体（和椅子的座面 + 靠背一样），朝向怎么定，退化的框不出错。画布像素不在这里测。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from './harness.mjs';
import { KINDS, bedHeadSide, sofaBackSide, bedParts, sofaParts, fixtureVariant, fixtureParts, boundaryGap, sideRect, boxOk, contentBox } from '../src/plan3d/geometry.js';
import { buildScene, recommendCorner, CORNERS } from '../src/plan3d/scene.js';
import { PALETTES, paletteOf } from '../src/plan3d/palette.js';
import { paintScene } from '../src/plan3d/paint.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const STUDY = JSON.parse(readFileSync(path.join(dir, '../src/plan3d/sample-study-room.json'), 'utf8'));
const VIEWS = ['top', 'persp', 'iso'];

/** 一个 4m x 3m 的方盒子房间（1 像素 = 10 毫米） */
const room = (items = [], extra = {}) => ({
  mmPerPx: 10,
  wallT: 20,
  source: { w: 600, h: 500 },
  rooms: [{ name: 'ROOM', rects: [[100, 100, 500, 400]] }],
  openings: [],
  items,
  ...extra,
});
const solid = (scene, id) => scene.solids.find((s) => s.id === id);
const order = (scene, id) => scene.solids.findIndex((s) => s.id === id);
const mm = (scene, sd) => [Math.round(sd.z0 / scene.zs), Math.round(sd.z1 / scene.zs)];
const boxOf = (pts) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
/** 实体的脚印换回图纸像素的外包矩形（四舍五入到 0.01） */
const planBox = (scene, sd) => {
  const b = boxOf(sd.base);
  return [b[0] / scene.s - scene.ox, b[1] / scene.s - scene.oy, b[2] / scene.s - scene.ox, b[3] / scene.s - scene.oy].map((v) => Math.round(v * 100) / 100);
};
const furniture = (scene) => scene.solids.filter((s) => s.kind !== 'wall');

test('床：一个框拆成 床垫 + 两个枕头 + 床头板，三种视角都一样；高度按 KINDS', () => {
  const geo = room([{ id: 'bed', label: 'BED', kind: 'bed', box: [200, 100, 360, 300], against: 'top', unsure: true }]);
  for (const view of VIEWS) {
    const scene = buildScene(geo, { view });
    assert.deepEqual(furniture(scene).map((s) => s.id).sort(), ['bed', 'bed-head', 'bed-pillow-1', 'bed-pillow-2'], view);
    const bed = solid(scene, 'bed');
    assert.equal(bed.kind, 'bed');
    assert.equal(bed.mat, 'fabric', '被子吃面料贴图');
    assert.equal(bed.label, 'BED');
    assert.equal(bed.unsure, true);
    assert.deepEqual(mm(scene, bed), [0, KINDS.bed.z1]);
    assert.deepEqual(planBox(scene, bed), [200, 100, 360, 300], '床垫 = 整个框');
    assert.equal(bed.detail.head, 'top');
    assert.equal(bed.detail.pillows.length, 2);
    const head = solid(scene, 'bed-head');
    assert.equal(head.kind, 'bed-head');
    assert.equal(head.mat, 'cabinet');
    assert.deepEqual(mm(scene, head), [KINDS.bed.z1, KINDS.bed.head], '床头板立在床垫上');
    assert.deepEqual(planBox(scene, head), [200, 100, 360, 107], '床头一侧 70 毫米厚的一条');
    for (const id of ['bed-pillow-1', 'bed-pillow-2']) {
      const p = solid(scene, id);
      assert.equal(p.kind, 'bed-pillow');
      assert.equal(p.mat, 'linen');
      assert.deepEqual(mm(scene, p), [480, 600]);
      const b = planBox(scene, p);
      assert.ok(b[1] > 107 && b[3] < 160, '枕头紧挨着床头板');
      assert.ok(Math.abs(b[2] - b[0] - 0.4 * 160) < 0.01 && Math.abs(b[3] - b[1] - 38) < 0.01, '每个约占床宽的 40%、长 380 毫米');
      assert.equal(p.on, 'bed');
    }
    assert.ok(order(scene, 'bed') < order(scene, 'bed-pillow-1') && order(scene, 'bed') < order(scene, 'bed-head'), `${view}: 床垫先画`);
    assert.equal(scene.shadows.filter((sh) => sh.id.indexOf('bed') === 0).length, 4, '每一块都有影子');
  }
  const top = buildScene(geo, { view: 'top' });
  assert.ok(top.solids.every((s) => s.faces.length === 1), '正俯视没有侧面');
  const iso = buildScene(geo, { view: 'iso', corner: 'se' });
  assert.equal(solid(iso, 'bed').faces.filter((f) => f.type === 'side').length, 2, '斜角立体：床垫看得到两个侧面');
});

test('床头朝向：against 是短边就用它；against 是长边 / 没写 → 离墙近的短边；判断不了 → 上 / 左；正方形 → against，否则离墙最近', () => {
  const g = room();
  const at = (box, against) => bedHeadSide(g, { box, against }, box);
  assert.equal(at([200, 150, 360, 350], 'bottom'), 'bottom', 'against 在短边上');
  assert.equal(at([200, 150, 360, 350], 'top'), 'top');
  assert.equal(at([200, 180, 360, 380], 'left'), 'bottom', 'against 在长边上：取离墙近的短边（下边离墙 20，上边 80）');
  assert.equal(at([200, 120, 360, 320], 'right'), 'top');
  assert.equal(at([120, 150, 320, 300]), 'left', '横放、没写 against：左边离墙 20，右边 180');
  assert.equal(at([300, 150, 480, 300]), 'right');
  assert.equal(at([200, 150, 400, 250]), 'left', '两头一样远 → 左');
  assert.equal(at([200, 150, 300, 350]), 'top', '两头一样远 → 上');
  const nowhere = { mmPerPx: 10, rooms: [], items: [] };
  assert.equal(bedHeadSide(nowhere, { box: [0, 0, 150, 200] }, [0, 0, 150, 200]), 'top', '没有房间：竖放 → 上');
  assert.equal(bedHeadSide(nowhere, { box: [0, 0, 200, 150] }, [0, 0, 200, 150]), 'left', '没有房间：横放 → 左');
  assert.equal(bedHeadSide(nowhere, { box: [0, 0, 200, 150], against: '乱写' }, [0, 0, 200, 150]), 'left', '不认识的 against 当没写');
  // 正方形
  assert.equal(at([200, 150, 350, 300], 'right'), 'right');
  assert.equal(at([200, 150, 350, 300], 'bottom'), 'bottom');
  assert.equal(at([320, 180, 470, 330]), 'right', '没写 against：右边离墙最近（30）');
  assert.equal(bedHeadSide(nowhere, { box: [0, 0, 150, 150] }, [0, 0, 150, 150]), 'top', '判断不了 → 上');
  // boundaryGap：穿过同一个房间里相连的矩形，一直量到墙面
  const lshape = [[305, 133, 1070, 856], [186, 133, 305, 365]];
  assert.equal(boundaryGap(lshape, [400, 200, 500, 300], 'left'), 400 - 186, '凹位那一段：量到凹位的墙');
  assert.equal(boundaryGap(lshape, [400, 500, 500, 600], 'left'), 400 - 305);
  assert.equal(boundaryGap(lshape, [2000, 2000, 2100, 2100], 'top'), Infinity, '不在任何房间里');
  // 场景里用的是同一个结论
  const scene = buildScene(room([{ id: 'b', kind: 'bed', box: [120, 150, 320, 300] }]), { view: 'top' });
  assert.equal(solid(scene, 'b').detail.head, 'left');
  assert.deepEqual(planBox(scene, solid(scene, 'b-head')), [120, 150, 127, 300]);
});

test('单人床（宽不到 1.2 米）一个枕头，双人床两个；太小的框不像床，按普通方块画', () => {
  const single = room([{ id: 's', kind: 'bed', box: [200, 100, 300, 300], against: 'top' }]);
  const double = room([{ id: 'd', kind: 'bed', box: [200, 100, 320, 300], against: 'top' }]);
  const s = buildScene(single, { view: 'top' });
  assert.deepEqual(furniture(s).map((x) => x.id).sort(), ['s', 's-head', 's-pillow-1']);
  const pb = planBox(s, solid(s, 's-pillow-1'));
  assert.ok(Math.abs((pb[0] + pb[2]) / 2 - 250) < 0.01, '居中');
  assert.equal(bedParts(single, single.items[0], single.items[0].box).single, true);
  const d = buildScene(double, { view: 'top' });
  assert.deepEqual(furniture(d).map((x) => x.id).sort(), ['d', 'd-head', 'd-pillow-1', 'd-pillow-2']);
  const p1 = planBox(d, solid(d, 'd-pillow-1'));
  const p2 = planBox(d, solid(d, 'd-pillow-2'));
  assert.ok(p1[2] < p2[0], '两个枕头不重叠');
  assert.equal(bedParts(double, double.items[0], double.items[0].box).single, false);
  // 太小
  const tiny = room([{ id: 't', kind: 'bed', box: [200, 200, 230, 240] }]);
  assert.equal(bedParts(tiny, tiny.items[0], tiny.items[0].box), null);
  const t = buildScene(tiny, { view: 'iso' });
  assert.deepEqual(furniture(t).map((x) => x.id), ['t']);
  assert.equal(solid(t, 't').kind, 'bed');
  assert.equal(solid(t, 't').detail, null);
});

test('沙发：底座 + 靠背 + 两个扶手；坐垫按长度分块；太小的框只画方块', () => {
  const geo = room([{ id: 'sofa', label: 'SOFA', kind: 'sofa', box: [200, 310, 430, 400], against: 'bottom' }]);
  for (const view of VIEWS) {
    const scene = buildScene(geo, { view });
    assert.deepEqual(furniture(scene).map((s) => s.id).sort(), ['sofa', 'sofa-arm-1', 'sofa-arm-2', 'sofa-back'], view);
    const seat = solid(scene, 'sofa');
    assert.equal(seat.kind, 'sofa');
    assert.equal(seat.mat, 'fabric');
    assert.deepEqual(mm(scene, seat), [0, KINDS.sofa.z1]);
    assert.deepEqual(planBox(scene, seat), [200, 310, 430, 400], '底座 = 整个框');
    assert.equal(seat.detail.back, 'bottom');
    assert.equal(seat.detail.cushions.length, 3, '2.3 米的沙发：三块坐垫');
    const back = solid(scene, 'sofa-back');
    assert.equal(back.kind, 'sofa-back');
    assert.equal(back.mat, 'fabric');
    assert.deepEqual(mm(scene, back), [KINDS.sofa.z1, KINDS.sofa.back]);
    assert.deepEqual(planBox(scene, back), [200, 380.2, 430, 400], '靠背 = 沙发进深的 22%');
    const arms = ['sofa-arm-1', 'sofa-arm-2'].map((id) => solid(scene, id));
    arms.forEach((a) => {
      assert.equal(a.kind, 'sofa-arm');
      assert.deepEqual(mm(scene, a), [KINDS.sofa.z1, KINDS.sofa.arm]);
    });
    assert.deepEqual(planBox(scene, arms[0]), [200, 310, 215, 380.2], '左扶手 150 毫米宽，从靠背到前沿');
    assert.deepEqual(planBox(scene, arms[1]), [415, 310, 430, 380.2]);
    assert.ok(order(scene, 'sofa') < order(scene, 'sofa-arm-1') && order(scene, 'sofa') < order(scene, 'sofa-back'), `${view}: 底座先画`);
  }
  const count = (len) => sofaParts(room(), { box: [150, 310, 150 + len, 400], against: 'bottom' }, [150, 310, 150 + len, 400]).cushions.length;
  assert.equal(count(90), 1, '单人沙发');
  assert.equal(count(160), 2);
  assert.equal(count(230), 3);
  assert.equal(count(340), 4, '最多四块');
  const parts = sofaParts(room(), { box: [200, 310, 430, 400], against: 'bottom' }, [200, 310, 430, 400]);
  assert.deepEqual(parts.seat, [215, 310, 415, 380.2]);
  assert.ok(Math.abs(parts.cushions[0][0] - 215) < 1e-9 && Math.abs(parts.cushions[2][2] - 415) < 1e-9, '坐垫正好铺满扶手之间');
  const tiny = room([{ id: 't', kind: 'sofa', box: [200, 200, 240, 230] }]);
  assert.equal(sofaParts(tiny, tiny.items[0], tiny.items[0].box), null);
  assert.deepEqual(furniture(buildScene(tiny, { view: 'persp' })).map((x) => x.id), ['t']);
});

test('沙发靠背朝向：against 是长边就用它；否则 贴墙的长边 → 背对茶几 → 离墙近的长边 → 上 / 左；正方形 → against', () => {
  const at = (box, against, items = []) => {
    const it = { id: 's', kind: 'sofa', box, against };
    return sofaBackSide(room([it, ...items]), it, box);
  };
  assert.equal(at([200, 200, 400, 290], 'bottom'), 'bottom', 'against 在长边上');
  assert.equal(at([200, 200, 290, 380], 'left'), 'left');
  assert.equal(at([200, 150, 400, 240], 'left'), 'top', 'against 在短边上：取离墙近的长边（上 50，下 160）');
  assert.equal(at([200, 250, 400, 340]), 'bottom', '没写 against：下边离墙 60，上边 150');
  assert.equal(at([200, 105, 400, 195]), 'top', '离墙不到 10 厘米 = 贴着墙');
  assert.equal(at([200, 205, 400, 295]), 'top', '两边一样远 → 上');
  assert.equal(at([205, 100, 295, 400]), 'left', '竖放、两边都贴墙 / 一样 → 左');
  // 茶几：沙发朝着茶几，靠背在另一边（即使那一边离墙更远）
  const table = { id: 't', kind: 'desk', box: [240, 130, 360, 180] };
  assert.equal(at([200, 200, 400, 290], undefined, [table]), 'bottom', '茶几在上面 20 厘米处 → 靠背在下');
  assert.equal(at([200, 200, 400, 290], undefined, [{ id: 't', kind: 'low', box: [240, 130, 360, 180] }]), 'top', '矮柜不算茶几');
  assert.equal(at([200, 300, 400, 390], undefined, [{ id: 't', kind: 'desk', box: [240, 110, 360, 160] }]), 'bottom', '离得太远（1.4 米）的桌子不算，按离墙近的');
  assert.equal(at([200, 200, 400, 290], 'top', [table]), 'top', 'against 优先');
  // 正方形（单人沙发）
  assert.equal(at([300, 200, 390, 290], 'right'), 'right');
  assert.equal(at([400, 200, 490, 290]), 'right', '没写 against：离墙最近的一边');
  const nowhere = { mmPerPx: 10, rooms: [], items: [] };
  assert.equal(sofaBackSide(nowhere, { box: [0, 0, 90, 90] }, [0, 0, 90, 90]), 'top');
  assert.equal(sofaBackSide(nowhere, { box: [0, 0, 200, 90] }, [0, 0, 200, 90]), 'top');
  assert.equal(sofaBackSide(nowhere, { box: [0, 0, 90, 200] }, [0, 0, 90, 200]), 'left');
  // 场景：靠背在右的单人沙发
  const scene = buildScene(room([{ id: 'a', kind: 'sofa', box: [410, 200, 500, 290], against: 'right' }]), { view: 'top' });
  assert.deepEqual(planBox(scene, solid(scene, 'a-back')), [480.2, 200, 500, 290]);
  assert.deepEqual(planBox(scene, solid(scene, 'a-arm-1')), [410, 200, 480.2, 215]);
});

test('洁具：按图上的名字分种类；马桶 = 座便 + 水箱，浴缸 / 洗手盆 / 淋浴盘各有高度；名字认不出或没有名字 = 圆角的盆', () => {
  assert.equal(fixtureVariant('WC'), 'toilet');
  assert.equal(fixtureVariant('w.c.'), 'toilet');
  assert.equal(fixtureVariant('Toilet'), 'toilet');
  assert.equal(fixtureVariant('马桶'), 'toilet');
  assert.equal(fixtureVariant('BATHTUB'), 'tub');
  assert.equal(fixtureVariant('bath'), 'tub');
  assert.equal(fixtureVariant('浴缸'), 'tub');
  assert.equal(fixtureVariant('BASIN'), 'basin');
  assert.equal(fixtureVariant('BATHROOM VANITY'), 'basin', '先认洗手盆，再认浴缸');
  assert.equal(fixtureVariant('洗手盆'), 'basin');
  assert.equal(fixtureVariant('SINK'), 'sink');
  assert.equal(fixtureVariant('SHOWER TRAY'), 'tray');
  assert.equal(fixtureVariant('HOB'), 'hob');
  assert.equal(fixtureVariant('NEWCASTLE'), '', '单词里碰巧有 WC 不算');
  [undefined, null, '', 42, 'ABC'].forEach((label) => assert.equal(fixtureVariant(label), '', String(label)));

  const geo = room([
    { id: 'wc', label: 'WC', kind: 'fixture', box: [110, 320, 160, 390] },
    { id: 'tub', label: 'BATHTUB', kind: 'fixture', box: [100, 100, 180, 270], against: 'left' },
    { id: 'basin', label: 'BASIN', kind: 'fixture', box: [450, 330, 500, 380], against: 'right' },
    { id: 'tray', label: 'SHOWER', kind: 'fixture', box: [300, 310, 390, 400] },
    { id: 'plain', label: '', kind: 'fixture', box: [300, 200, 350, 250] },
    { id: 'nolabel', kind: 'fixture', box: [220, 200, 270, 250] },
  ]);
  for (const view of VIEWS) {
    const scene = buildScene(geo, { view });
    assert.deepEqual(furniture(scene).map((s) => s.id).sort(), ['basin', 'nolabel', 'plain', 'tray', 'tub', 'wc', 'wc-tank'], view);
    furniture(scene).forEach((s) => assert.equal(s.mat, 'ceramic', s.id));
    const wc = solid(scene, 'wc');
    assert.equal(wc.kind, 'fixture');
    assert.equal(wc.detail.variant, 'toilet');
    assert.equal(wc.detail.back, 'bottom', '没写 against：水箱在离墙近的短边（下）');
    assert.deepEqual(mm(scene, wc), [0, KINDS.fixture.z1]);
    const tank = solid(scene, 'wc-tank');
    assert.equal(tank.kind, 'fixture-tank');
    assert.deepEqual(mm(scene, tank), [0, KINDS.fixture.tank]);
    const tb = planBox(scene, tank);
    const wb = planBox(scene, wc);
    assert.ok(tb[3] === 390 && Math.abs(tb[1] - wb[3]) < 0.02, '水箱贴着框的下边，座便紧挨着它');
    assert.ok(wb[1] === 320 && wb[0] > 110 && wb[2] < 160, '座便比框窄一点，伸到框的另一头');
    assert.ok(wc.base.length > 12 && wc.detail.bowl.length > 12, '座便和内圈都是圆的');
    const tub = solid(scene, 'tub');
    assert.equal(tub.detail.variant, 'tub');
    assert.equal(tub.detail.back, 'top', 'against 在长边上：龙头在离墙近的短边');
    assert.deepEqual(planBox(scene, tub), [100, 100, 180, 270]);
    assert.deepEqual(mm(scene, tub), [0, 450]);
    const inner = boxOf(tub.detail.bowl);
    const outer = boxOf(tub.base);
    assert.ok(inner[0] > outer[0] && inner[1] > outer[1] && inner[2] < outer[2] && inner[3] < outer[3], '缸的内沿在本体里面');
    assert.ok(tub.detail.drain && tub.detail.tap, '有下水口和龙头');
    const basin = solid(scene, 'basin');
    assert.equal(basin.detail.variant, 'basin');
    assert.equal(basin.detail.back, 'right');
    assert.deepEqual(mm(scene, basin), [0, KINDS.fixture.basin], '写明是洗手盆：台面那么高');
    assert.ok(basin.detail.tap[0] > basin.detail.drain[0], '龙头在靠墙一侧');
    const tray = solid(scene, 'tray');
    assert.equal(tray.detail.variant, 'tray');
    assert.deepEqual(mm(scene, tray), [0, KINDS.fixture.tray], '淋浴盘只有几厘米高');
    for (const id of ['plain', 'nolabel']) {
      const g = solid(scene, id);
      assert.equal(g.kind, 'fixture');
      assert.equal(g.detail.variant, 'basin', '认不出 = 圆角的盆');
      assert.deepEqual(mm(scene, g), [0, KINDS.fixture.z1]);
      assert.ok(g.base.length >= 4 * 7, '四个角都是圆的');
      assert.ok(g.detail.bowl && g.detail.bowl.length > 8);
      assert.equal(g.label, '');
    }
  }
  // 圆角半径 = 短边的 28%
  const fp = fixtureParts(geo, geo.items[4], geo.items[4].box);
  assert.equal(fp.body.round.tl, 50 * 0.28);
  assert.equal(fp.named, false);
  assert.equal(fixtureParts(geo, { box: [0, 0, 0, 10] }, [0, 0, 0, 10]), null, '空的框');
});

test('台面上的水槽 / 灶：抬到台面高度、画在台面之后（否则被台面盖住）；落地的 SINK 按洗手盆', () => {
  const geo = room([
    { id: 'run', label: 'KITCHEN', kind: 'low', box: [200, 340, 480, 400], against: 'bottom' },
    { id: 'sink', label: 'SINK', kind: 'fixture', box: [240, 350, 300, 390] },
    { id: 'hob', label: 'HOB', kind: 'fixture', box: [360, 345, 420, 395] },
    { id: 'free', label: 'SINK', kind: 'fixture', box: [120, 120, 170, 170] },
  ]);
  for (const view of VIEWS) {
    for (const corner of view === 'iso' ? Object.keys(CORNERS) : ['se']) {
      const scene = buildScene(geo, { view, corner });
      const sink = solid(scene, 'sink');
      assert.equal(sink.detail.variant, 'sink');
      assert.equal(sink.detail.back, 'bottom', '跟着台面靠的那面墙');
      assert.equal(sink.on, 'run');
      assert.deepEqual(mm(scene, sink), [KINDS.low.z1, KINDS.low.z1 + 4]);
      assert.ok(order(scene, 'run') < order(scene, 'sink') && order(scene, 'run') < order(scene, 'hob'), `${view} ${corner}: 台面先画`);
      const hob = solid(scene, 'hob');
      assert.equal(hob.detail.variant, 'hob');
      assert.equal(hob.detail.rings.length, 4, '60 x 50 厘米的灶：四个灶眼');
      assert.equal(hob.detail.bowl, null);
      const free = solid(scene, 'free');
      assert.equal(free.detail.variant, 'basin');
      assert.equal(free.on, '');
      assert.deepEqual(mm(scene, free), [0, KINDS.fixture.basin]);
    }
  }
  const narrow = fixtureParts(geo, { label: 'HOB', box: [360, 350, 420, 380] }, [360, 350, 420, 380]);
  assert.equal(narrow.rings.length, 2, '窄的灶：两个灶眼');
});

test('别的种类不受影响：只有 bed / sofa / fixture 会拆开，其余（包括不认识的种类）还是一个方块', () => {
  const geo = room([
    { id: 'a', label: 'BED', kind: 'block', box: [200, 100, 360, 300] },
    { id: 'b', label: 'SOFA', kind: 'low', box: [200, 310, 430, 400] },
    { id: 'c', label: 'WC', kind: 'desk', box: [110, 320, 160, 390] },
    { id: 'd', label: 'BED', kind: '没有这个种类', box: [400, 120, 480, 200] },
    { id: 'e', label: 'BASIN', kind: 'tall', box: [420, 300, 500, 400] },
    { id: 'ch', kind: 'chair', box: [300, 150, 350, 200], facing: 'left' },
  ]);
  for (const view of VIEWS) {
    const scene = buildScene(geo, { view });
    assert.deepEqual(furniture(scene).map((s) => s.id).sort(), ['a', 'b', 'c', 'ch', 'ch-back', 'd', 'e'], view);
    furniture(scene).forEach((s) => {
      assert.equal(s.detail, null, s.id);
      assert.equal(s.piece, false, s.id);
      assert.equal(s.on, '', s.id);
    });
    assert.equal(solid(scene, 'd').mat, 'neutral', '不认识的种类按「其他」');
    assert.equal(solid(scene, 'd').zMm, KINDS.block.z1);
  }
});

test('退化的框（零大小、很小、很大、反着写、不在房间里）在三种视角里都不出错，坐标都是有限的数', () => {
  const boxes = [
    [200, 200, 200, 200],
    [200, 200, 200, 300],
    [200, 200, 300, 200],
    [200, 200, 201, 201],
    [200, 200, 203, 260],
    [-5000, -5000, 9000, 9000],
    [300, 300, 200, 200],
    [2000, 2000, 2100, 2200],
    [100, 100, 500, 400],
  ];
  const labels = [undefined, '', 'WC', 'BATHTUB', 'BASIN', 'SINK', 'SHOWER', 'HOB', 'BED'];
  const sides = [undefined, 'top', 'right', 'bottom', 'left', 'nonsense'];
  const finite = (scene) => {
    for (const sd of scene.solids) {
      for (const f of sd.faces) for (const p of f.pts) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]), `${sd.id} 的面`);
      for (const p of sd.base) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]), `${sd.id} 的脚印`);
      assert.ok(Number.isFinite(sd.z0) && Number.isFinite(sd.z1) && sd.z1 >= sd.z0, `${sd.id} 的高度`);
      assert.ok(Number.isFinite(sd.near), `${sd.id} 的排序距离`);
    }
    for (const sh of scene.shadows) for (const p of sh.pts) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]), `${sh.id} 的影子`);
  };
  let n = 0;
  for (const kind of ['bed', 'sofa', 'fixture']) {
    boxes.forEach((box, bi) => {
      const items = [
        { id: 'low', kind: 'low', box: [100, 340, 500, 400], against: 'bottom' },
        { id: 'x', kind, box, label: labels[(bi + n) % labels.length], against: sides[(bi + n) % sides.length] },
      ];
      n += 1;
      for (const view of VIEWS) {
        // 第三种：连房间、比例尺都没有，只有这一件和一个垫底的方块（整个模型只有一个零大小的框时画框本身就定不下来，和这里要测的无关）
        for (const geo of [room(items), { mmPerPx: 10, wallT: 0, rooms: [], openings: [], items }, { rooms: [], items: [items[1], { id: 'pad', kind: 'block', box: [0, 0, 50, 50] }] }]) {
          let scene;
          assert.doesNotThrow(() => {
            scene = buildScene(geo, { view });
          }, `${kind} ${JSON.stringify(box)} ${view}`);
          finite(scene);
          assert.ok(solid(scene, 'x'), '主体总是在');
          assert.doesNotThrow(() => buildScene(geo, { view, cutMm: 300, hung: 'solid' }), '切面比床还低');
          assert.doesNotThrow(() => buildScene(geo, { view, cutMm: Infinity }));
        }
      }
    });
  }
  // 没有 label / against / id 的最简单写法
  assert.doesNotThrow(() => VIEWS.forEach((view) => buildScene(room([{ kind: 'fixture', box: [200, 200, 250, 250] }, { kind: 'bed', box: [300, 100, 460, 300] }, { kind: 'sofa', box: [120, 300, 300, 390] }]), { view })));
});

test('切面和吊柜照旧：床 / 沙发 / 洁具都在切面以下，不会被标成 tall；半透明的吊柜仍然最后画', () => {
  const geo = room([
    { id: 'bed', kind: 'bed', box: [200, 100, 360, 300], against: 'top' },
    { id: 'sofa', kind: 'sofa', box: [200, 310, 430, 400], against: 'bottom' },
    { id: 'wc', label: 'WC', kind: 'fixture', box: [110, 320, 160, 390] },
    { id: 'desk', kind: 'desk', box: [440, 150, 500, 300], against: 'right' },
    { id: 'hung', kind: 'hung', box: [470, 150, 500, 300], against: 'right' },
  ]);
  for (const view of VIEWS) {
    const scene = buildScene(geo, { view });
    assert.ok(furniture(scene).every((s) => !s.tall), view);
    if (view === 'iso') assert.ok(order(scene, 'desk') < order(scene, 'hung'), '斜角立体：吊柜的轮廓画在书桌之后');
    else assert.equal(scene.solids[scene.solids.length - 1].id, 'hung', `${view}: 吊柜的轮廓最后画`);
    assert.equal(solid(scene, 'hung').ghost, true);
    assert.ok(!scene.shadows.some((sh) => sh.id === 'hung'));
    const hidden = buildScene(geo, { view, hung: 'hide' });
    assert.equal(solid(hidden, 'hung'), undefined);
    assert.equal(furniture(hidden).length, furniture(scene).length - 1);
  }
  // 切面压得很低：每一块都切在切面处，不会翻过来
  const low = buildScene(geo, { view: 'iso', cutMm: 500 });
  assert.deepEqual(mm(low, solid(low, 'bed-head')), [480, 500]);
  assert.deepEqual(mm(low, solid(low, 'sofa-back')), [430, 500]);
  assert.deepEqual(mm(low, solid(low, 'wc-tank')), [0, 500]);
  const lower = buildScene(geo, { view: 'iso', cutMm: 300 });
  assert.deepEqual(mm(lower, solid(lower, 'bed-pillow-1')), [300, 300]);
  // 全高 + 实体吊柜
  const full = buildScene(geo, { view: 'iso', cutMm: Infinity, hung: 'solid' });
  assert.equal(solid(full, 'hung').ghost, false);
  assert.deepEqual(mm(full, solid(full, 'bed-head')), [480, 950]);
});

test('立体俯视的顺序：压在上面的小件跟着主体排；靠着远处长墙的床 / 洁具画在那段墙之后（不被墙的内侧面盖住）', () => {
  const geo = room([
    { id: 'wc', label: 'WC', kind: 'fixture', box: [110, 320, 160, 390] }, // 左下角，离镜头正下方（房间中心）远
    { id: 'bed', kind: 'bed', box: [330, 100, 490, 300], against: 'top' }, // 床头靠上墙、偏右
  ]);
  const scene = buildScene(geo, { view: 'persp' });
  const Y = (y) => (y + scene.oy) * scene.s;
  const wallBelow = scene.solids.filter((s) => s.kind === 'wall' && Math.min(...s.base.map((p) => p[1])) >= Y(400) - 1e-6);
  const wallAbove = scene.solids.filter((s) => s.kind === 'wall' && Math.max(...s.base.map((p) => p[1])) <= Y(100) + 1e-6);
  assert.ok(wallBelow.length > 0 && wallAbove.length > 0);
  // 下墙是一整段，离镜头最近的点在正下方，比马桶「近」；按最近点排会把墙排在马桶后面
  const longWall = wallBelow.find((w) => boxOf(w.base)[2] - boxOf(w.base)[0] > 300 * scene.s);
  assert.ok(longWall && longWall.near < solid(scene, 'wc').near, '这正是要补一步的情形');
  wallBelow.forEach((w) => {
    assert.ok(order(scene, w.id) < order(scene, 'wc'), '马桶在它背后的墙之后');
    assert.ok(order(scene, w.id) < order(scene, 'wc-tank'), '水箱也是');
  });
  assert.ok(order(scene, 'wc-tank') < order(scene, 'wc'), '座便比水箱靠近镜头，后画');
  wallAbove.forEach((w) => ['bed', 'bed-pillow-1', 'bed-pillow-2', 'bed-head'].forEach((id) => assert.ok(order(scene, w.id) < order(scene, id), `${id} 在上墙之后`)));
  assert.ok(order(scene, 'bed') < order(scene, 'bed-pillow-1'));
  assert.ok(order(scene, 'bed-pillow-2') < order(scene, 'bed-head'), '同一张床：床垫 → 枕头 → 床头板');
  assert.equal(solid(scene, 'bed-pillow-1').near, solid(scene, 'bed').near, '枕头和床算一样远');
  // 隔墙另一边的东西：墙在它前面，墙后画（墙顶往外倒，盖住它的一角）—— 不能因为补这一步反过来
  const two = {
    mmPerPx: 10,
    wallT: 20,
    rooms: [{ name: 'A', rects: [[100, 100, 300, 400]] }, { name: 'B', rects: [[320, 100, 700, 400]] }],
    openings: [],
    items: [{ id: 'basin', label: 'BASIN', kind: 'fixture', box: [250, 200, 300, 250], against: 'right' }],
  };
  const s2 = buildScene(two, { view: 'persp' });
  const X2 = (x) => (x + s2.ox) * s2.s;
  assert.ok(s2.vp[0] > X2(320), '镜头在右边的房间上方');
  const Y2 = (y) => (y + s2.oy) * s2.s;
  const partition = s2.solids.filter((s) => {
    const b = boxOf(s.base);
    return s.kind === 'wall' && b[0] >= X2(300) - 1e-6 && b[2] <= X2(320) + 1e-6 && b[1] < Y2(250) && b[3] > Y2(200); // 洗手盆正对着的那一段隔墙
  });
  assert.equal(partition.length, 1);
  partition.forEach((w) => assert.ok(order(s2, 'basin') < order(s2, w.id), '隔墙在洗手盆之后画'));
  // 正俯视 / 斜角立体不走这一步，顺序只看高度 / 前后
  const top = buildScene(geo, { view: 'top' });
  const nonGhost = top.solids.filter((s) => !s.ghost);
  for (let i = 1; i < nonGhost.length; i++) assert.ok(nonGhost[i - 1].z1 <= nonGhost[i].z1 + 1e-9, '正俯视按高度从矮到高');
  for (const corner of Object.keys(CORNERS)) {
    const iso = buildScene(geo, { view: 'iso', corner });
    assert.ok(order(iso, 'bed') < order(iso, 'bed-pillow-1') && order(iso, 'bed') < order(iso, 'bed-head'), corner);
    assert.ok(order(iso, 'bed') < order(iso, 'bed-pillow-2'), corner);
  }
});

test('配色和辅助函数：linen / ceramic 两种新材质；sideRect 按「贴着哪条边」取一块', () => {
  for (const [id, pal] of Object.entries(PALETTES)) {
    for (const m of ['linen', 'ceramic']) assert.ok(/^#[0-9A-F]{6}$/i.test(pal[m].top) && /^#[0-9A-F]{6}$/i.test(pal[m].side), `${id}.${m}`);
    assert.ok(pal.linen.sheet && pal.ceramic.bowl && pal.ceramic.metal && pal.ceramic.steel && pal.ceramic.hob, id);
    // 都是偏暖的浅色：红 ≥ 绿 ≥ 蓝，而且够亮
    for (const hex of [pal.linen.top, pal.ceramic.top]) {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      assert.ok(c[0] >= c[1] && c[1] >= c[2] && c[2] > 200, hex);
    }
  }
  assert.equal(KINDS.fixture.mat, 'ceramic');
  assert.equal(KINDS.bed.mat, 'fabric');
  assert.equal(KINDS.sofa.mat, 'fabric');
  const b = [100, 200, 300, 260];
  assert.deepEqual(sideRect(b, 'top', 0, 10, 0, 1), [100, 200, 300, 210]);
  assert.deepEqual(sideRect(b, 'bottom', 0, 10, 0, 0.5), [100, 250, 200, 260]);
  assert.deepEqual(sideRect(b, 'left', 5, 20, 0.5, 1), [105, 230, 120, 260]);
  assert.deepEqual(sideRect(b, 'right', 0, 10, 0, 1), [290, 200, 300, 260]);
});

test('书房样本（没有床 / 沙发 / 洁具）：实体的个数和名字一个不变', () => {
  const ids = [
    'block-dark', 'block-light', 'book', 'chair-1', 'chair-1-back', 'chair-2', 'chair-2-back', 'chair-3', 'chair-3-back', 'chair-4', 'chair-4-back',
    'col-bottom', 'col-top', 'desk-bottom', 'desk-left', 'glass', 'glass-end', 'hung-bottom', 'hung-left', 'opening-0-glass', 'opening-0-sill', 'opening-2',
    'shelf-niche', 'storage-bottom', 'storage-niche',
    'wall-0', 'wall-1', 'wall-10', 'wall-11', 'wall-12', 'wall-13', 'wall-14', 'wall-15', 'wall-16', 'wall-18', 'wall-19', 'wall-2', 'wall-23', 'wall-24', 'wall-25',
    'wall-3', 'wall-7', 'wall-8', 'wall-9',
  ];
  assert.equal(ids.length, 44);
  for (const view of VIEWS) {
    for (const corner of view === 'iso' ? Object.keys(CORNERS) : ['se']) {
      const scene = buildScene(STUDY, { view, corner });
      assert.equal(scene.solids.length, 44, `${view} ${corner}`);
      assert.deepEqual(scene.solids.map((s) => s.id).sort(), ids, `${view} ${corner}`);
      assert.ok(scene.solids.every((s) => s.detail === null && s.piece === false && s.on === ''), '没有新的细节');
      assert.equal(scene.shadows.length, 42, '两个吊柜不投影');
    }
  }
});

// ---------------------------------------------------------------------------
// 审查时补的回归测试：画的那一步（用一个只记账、但对数字很严格的假画布）和坏输入
// ---------------------------------------------------------------------------

/** 严格的假画布：记下每次调用；任何一个数字参数不是有限的数（NaN / Infinity）就记到 bad 里 */
function strictCanvas(log, bad) {
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 1 };
  const check = (name, args) => {
    for (const a of args) {
      if ((typeof a === 'number' && !Number.isFinite(a)) || (typeof a === 'string' && /NaN|Infinity|undefined/.test(a))) {
        bad.push(`${name}(${args.map(String).join(', ')})`);
        return;
      }
    }
  };
  const stub = { addColorStop: (offset, color) => check('addColorStop', [offset, color]) };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args) => {
        check(String(prop), args);
        log.push({ fn: prop, args });
        return stub;
      };
    },
    set(target, prop, value) {
      check(`set ${String(prop)}`, [value]);
      target[prop] = value;
      return true;
    },
  });
  const canvas = { getContext: () => ctx };
  for (const key of ['width', 'height']) {
    let v = 0;
    Object.defineProperty(canvas, key, { get: () => v, set: (x) => (check(`canvas.${key}`, [x]), (v = x)) });
  }
  return canvas;
}

/** 画一遍，返回 { scene, log（主画布和离屏画布的全部调用）, bad } */
function paintStrict(geo, opts) {
  const scene = buildScene(geo, opts);
  const log = [];
  const bad = [];
  paintScene(strictCanvas(log, bad), scene, paletteOf('warm'), { createCanvas: () => strictCanvas(log, bad) });
  return { scene, log, bad };
}

const ALL_VIEWS = [{ view: 'top' }, { view: 'persp' }, ...Object.keys(CORNERS).map((corner) => ({ view: 'iso', corner })), { view: 'iso', cutMm: Infinity, hung: 'solid' }, { view: 'iso', wallMm: 400 }];

test('斜角立体：床、床头板、沙发、洁具每个朝镜头的侧面都画得出来 —— 侧面的渐变不能没有长度（法线沿 x 的面以前是透明的）', () => {
  // 没有房间 = 没有墙，画出来的侧面全是这三种东西的
  const geo = {
    mmPerPx: 10,
    rooms: [],
    items: [
      { id: 'bed', kind: 'bed', box: [0, 0, 160, 200], against: 'top' },
      { id: 'bed2', kind: 'bed', box: [200, 0, 400, 150], against: 'left' },
      { id: 'sofa', kind: 'sofa', box: [0, 260, 230, 350] },
      { id: 'wc', label: 'WC', kind: 'fixture', box: [300, 260, 345, 330] },
      { id: 'tub', label: 'BATHTUB', kind: 'fixture', box: [380, 200, 455, 370] },
    ],
  };
  for (const corner of Object.keys(CORNERS)) {
    const { scene, log, bad } = paintStrict(geo, { view: 'iso', corner });
    assert.deepEqual(bad, [], corner);
    for (const id of ['bed', 'bed-head', 'bed2', 'bed2-head']) {
      const sides = solid(scene, id).faces.filter((f) => f.type === 'side');
      assert.equal(sides.length, 2, `${corner} ${id}：方盒子看得到两个侧面`);
      assert.ok(sides.some((f) => Math.abs(f.nx) === 1) && sides.some((f) => Math.abs(f.ny) === 1), '一个法线沿 x，一个沿 y');
    }
    const flat = log.filter((c) => c.fn === 'createLinearGradient' && c.args[0] === c.args[2] && c.args[1] === c.args[3]);
    assert.deepEqual(flat, [], `${corner}：起点和终点重合的渐变什么都画不出来`);
  }
});

test('没写 id、id 是数字的东西：三种视角都能画，不出错（顶面影子按 id 认「同一件」时不能假定它是字符串）', () => {
  const items = [
    { kind: 'bed', box: [200, 100, 360, 300], against: 'top' },
    { kind: 'sofa', box: [120, 310, 300, 400] },
    { kind: 'fixture', label: 'WC', box: [440, 110, 490, 180] },
    { id: 7, kind: 'low', box: [380, 340, 500, 400], against: 'bottom' },
    { id: 8, kind: 'fixture', label: 'SINK', box: [400, 350, 460, 390] },
    { id: 9, kind: 'chair', box: [300, 200, 345, 245], facing: 'left' },
  ];
  for (const opts of ALL_VIEWS) {
    let res;
    assert.doesNotThrow(() => {
      res = paintStrict(room(items), opts);
    }, JSON.stringify(opts));
    assert.deepEqual(res.bad, [], JSON.stringify(opts));
  }
});

test('坏的框（整项是 null、没有 box、NaN、Infinity、写成字符串）：这一件不画，别的照常；整个模型只是一个点也算得出缩放', () => {
  assert.equal(boxOk({ box: [1, 2, 3, 4] }), true);
  assert.equal(boxOk({ box: [3, 4, 1, 2] }), true, '反着写的框还是数，照原来的办法处理');
  for (const it of [null, undefined, {}, { box: null }, { box: [1, 2, 3] }, { box: [1, 2, NaN, 4] }, { box: [1, 2, Infinity, 4] }, { box: ['1', '2', '3', '4'] }, { box: 'x' }]) {
    assert.equal(boxOk(it), false, JSON.stringify(it));
  }
  const good = { id: 'bed', kind: 'bed', box: [200, 100, 360, 300], against: 'top' };
  const badItems = [
    null,
    { id: 'nobox', kind: 'sofa' },
    { id: 'nan', kind: 'bed', box: [NaN, 100, 300, 300] },
    { id: 'inf', kind: 'fixture', box: [100, 100, Infinity, 300], against: 'right' },
    { id: 'str', kind: 'bed', box: ['200', '100', '360', '300'] },
    { id: 'short', kind: 'tall', box: [100, 100], against: 'left' },
  ];
  const geo = room([...badItems, good]);
  assert.deepEqual(contentBox(geo), contentBox(room([good])), '坏的框不参与算画框');
  assert.doesNotThrow(() => recommendCorner(geo));
  assert.equal(recommendCorner(geo), recommendCorner(room([good])));
  for (const opts of ALL_VIEWS) {
    const { scene, bad } = paintStrict(geo, opts);
    assert.deepEqual(bad, [], JSON.stringify(opts));
    assert.deepEqual(furniture(scene).map((s) => s.id).sort(), ['bed', 'bed-head', 'bed-pillow-1', 'bed-pillow-2'], JSON.stringify(opts));
    const clean = buildScene(room([good]), opts);
    assert.deepEqual(scene.solids.map((s) => [s.id, s.base]), clean.solids.map((s) => [s.id, s.base]), '和没有坏数据时一模一样');
  }
  // 没有房间、只有一个零大小的框：以前缩放是 Infinity，NaN 一路进了画布
  for (const kind of ['bed', 'sofa', 'fixture', 'low']) {
    const dot = { items: [{ id: 'dot', kind, box: [5, 5, 5, 5] }] };
    assert.deepEqual(contentBox(dot), [4.5, 4.5, 5.5, 5.5]);
    for (const opts of ALL_VIEWS) {
      const { scene, bad } = paintStrict(dot, opts);
      assert.ok(Number.isFinite(scene.s) && scene.s > 0 && Number.isFinite(scene.w) && Number.isFinite(scene.h), `${kind} ${JSON.stringify(opts)}`);
      assert.deepEqual(bad, [], `${kind} ${JSON.stringify(opts)}`);
    }
  }
  assert.deepEqual(contentBox({}), [0, 0, 1, 1], '什么都没有：照旧');
  assert.deepEqual(contentBox({ items: [{ box: [5, 5, 5, 60] }] }), [5, 5, 5, 60], '一条线有长度，不用撑开');
});

test('坏输入画到画布上：零大小 / 反着写 / 在房间外面 / 没有名字 / 地砖房间互相重叠 / 房间没有矩形 / 没有 items —— 不出错，没有 NaN', () => {
  const rooms = [
    { name: 'MAIN', rects: [[100, 100, 500, 400]] },
    { name: 'TILE', floor: 'tile', rects: [[100, 420, 360, 560], [300, 420, 500, 480], [340, 440, 420, 560]] },
    { name: 'EMPTY', floor: 'tile', rects: [] },
    { name: 'NONE', floor: 'tile' },
    { floor: 'tile', rects: [[560, 300, 520, 100]] },
  ];
  const items = [
    { id: 'z1', kind: 'bed', box: [150, 150, 150, 150] },
    { id: 'z2', kind: 'sofa', box: [200, 150, 200, 150], against: 'top' },
    { id: 'z3', kind: 'fixture', box: [250, 150, 250, 150] },
    { id: 'line', label: 'WC', kind: 'fixture', box: [300, 150, 300, 220] },
    { id: 'inv1', kind: 'bed', box: [360, 400, 200, 200] },
    { id: 'inv2', label: 'TUB', kind: 'fixture', box: [480, 380, 400, 210] },
    { id: 'out1', kind: 'bed', box: [700, 100, 860, 300] },
    { id: 'out2', kind: 'sofa', box: [-300, 200, -70, 290], against: 'right' },
    { id: 'out3', label: 'WC', kind: 'fixture', box: [-200, 400, -150, 470] },
    { id: 'plain1', kind: 'bed', box: [110, 110, 260, 300] },
    { id: 'plain2', kind: 'sofa', box: [280, 300, 480, 390] },
    { id: 'plain3', kind: 'fixture', box: [120, 440, 170, 490] },
    { id: 'lab1', label: null, kind: 'fixture', box: [200, 440, 250, 490], against: null },
    { id: 'lab2', label: 42, kind: 'fixture', box: [260, 500, 300, 550], against: 7 },
    { id: 'lab3', label: { a: 1 }, kind: 'bed', box: [380, 110, 490, 290], against: 'diagonal' },
    { id: 'huge', kind: 'sofa', box: [-900, 600, 1500, 1400] },
    { id: 'host', kind: 'low', box: [330, 330, 330, 330] },
    { id: 'hosted', label: 'SINK', kind: 'fixture', box: [320, 320, 340, 340] },
  ];
  const openings = [{ type: 'window', side: 'top', a: 400, b: 150 }, { type: 'door', side: 'left', a: 9000, b: 9100 }];
  for (const geo of [{ mmPerPx: 10, wallT: 15, source: { w: 700, h: 600 }, rooms, openings, items }, { mmPerPx: 10, wallT: 15, rooms, openings }, { rooms, items }]) {
    assert.doesNotThrow(() => recommendCorner(geo));
    for (const opts of ALL_VIEWS) {
      let res;
      assert.doesNotThrow(() => {
        res = paintStrict(geo, opts);
      }, JSON.stringify(opts));
      assert.deepEqual(res.bad, [], JSON.stringify(opts));
      for (const sd of res.scene.solids) {
        for (const f of sd.faces) for (const pt of f.pts) assert.ok(Number.isFinite(pt[0]) && Number.isFinite(pt[1]), `${sd.id} 的面`);
        assert.ok(sd.tm.every(Number.isFinite), `${sd.id} 的变换`);
      }
      for (const a of res.scene.floorAreas) assert.ok(a.box.every(Number.isFinite) && a.rects.every((r) => r.every(Number.isFinite)), a.name);
    }
  }
});

test('斜角立体的顺序：框互相压着、排不出先后（循环）时，枕头 / 床头板 / 扶手 / 靠背 / 台面上的水槽也不会抢在主体前面画', () => {
  // 床尾凳压着床尾两个像素：床（480）比凳子（420）高 → 床在凳子之后；凳子在枕头前面 → 凳子在枕头之后；枕头在床之后 —— 一个循环
  const sub = (id) => id.replace(/-(pillow-\d|head|arm-\d|back)$/, '');
  const cases = [
    room([
      { id: 'bed', kind: 'bed', box: [200, 100, 360, 300], against: 'top' },
      { id: 'bench', kind: 'shelf', box: [220, 298, 340, 340] },
    ]),
    room([
      { id: 'sofa', kind: 'sofa', box: [150, 300, 380, 390], against: 'bottom' },
      { id: 'rug', kind: 'block', zMm: 20, box: [120, 200, 420, 395] },
      { id: 'stool', kind: 'shelf', box: [100, 320, 152, 370] },
    ]),
    room([
      { id: 'low', kind: 'low', box: [100, 340, 400, 400], against: 'bottom' },
      { id: 'sink', label: 'SINK', kind: 'fixture', box: [150, 350, 210, 390] },
      { id: 'bed', kind: 'bed', box: [180, 140, 340, 342] },
      { id: 'mat', kind: 'block', zMm: 10, box: [120, 300, 420, 398] },
    ]),
  ];
  for (const geo of cases) {
    for (const corner of Object.keys(CORNERS)) {
      const scene = buildScene(geo, { view: 'iso', corner });
      assert.equal(scene.solids.length, new Set(scene.solids.map((s) => s.id)).size, '每个实体只画一次');
      for (const sd of scene.solids) {
        if (!sd.on) continue;
        assert.equal(sd.on, sd.kind === 'fixture' ? 'low' : sub(sd.id));
        assert.ok(order(scene, sd.id) > order(scene, sd.on), `${corner}：${sd.id} 要画在 ${sd.on} 之后`);
      }
    }
  }
  // 第一个例子确实是循环：从右下角看，按老办法（剩下的里面挑最远的）会先画枕头
  const se = buildScene(cases[0], { view: 'iso', corner: 'se' });
  assert.ok(order(se, 'bed') < order(se, 'bed-pillow-1') && order(se, 'bed') < order(se, 'bed-pillow-2') && order(se, 'bed') < order(se, 'bed-head'));
  assert.ok(order(se, 'bench') > order(se, 'bed-pillow-1'), '凳子在枕头前面，后画');
});
