// 户型图编辑器的纯逻辑测试：房间轮廓、点选、拖拽、吸附、校验、修改操作、撤销重做。界面不在这里测。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from './harness.mjs';
import * as edit from '../src/plan3d/edit.js';
import { boundaryEdges, hitTest, dragRect, snapBox, snapOpening, guessFacing, renderGeo, validateGeo, transformGeo, applyOp, newItemId, histInit, histPush, histUndo, histRedo, iou, normBox } from '../src/plan3d/edit.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(path.join(dir, '../src/plan3d', f), 'utf8');
const STUDY = JSON.parse(src('sample-study-room.json'));
const snapshot = (v) => JSON.parse(JSON.stringify(v));

/** 一个 400 x 300 的方盒子房间 */
const room = (extra = {}) => ({
  mmPerPx: 10,
  wallT: 20,
  source: { w: 600, h: 500 },
  rooms: [{ name: 'ROOM', rects: [[100, 100, 500, 400]] }],
  openings: [],
  items: [],
  ...extra,
});
/** L 形房间：主矩形 + 左上角的凹位（和样本一个形状） */
const ell = (extra = {}) => room({ rooms: [{ name: 'L', rects: [[200, 100, 500, 400], [100, 100, 200, 220]] }], ...extra });
const total = (edges) => edges.reduce((n, e) => n + (e.b - e.a), 0);
const pick = (edges, side) => edges.filter((e) => e.side === side).map((e) => [e.at, e.a, e.b]);
const idx = (geo, id) => geo.items.findIndex((it) => it.id === id);

test('boundaryEdges：方盒子房间 = 四条边，总长 = 周长', () => {
  const edges = boundaryEdges(room());
  assert.deepEqual(edges, [
    { side: 'top', at: 100, a: 100, b: 500, room: 0 },
    { side: 'right', at: 500, a: 100, b: 400, room: 0 },
    { side: 'bottom', at: 400, a: 100, b: 500, room: 0 },
    { side: 'left', at: 100, a: 100, b: 400, room: 0 },
  ]);
  assert.equal(total(edges), 1400);
});

test('boundaryEdges：L 形房间沿并集的外轮廓走 —— 凹位和主矩形之间没有边，同一直线上的上边合并成一条', () => {
  const edges = boundaryEdges(STUDY);
  assert.equal(total(edges), 2 * (1070 - 186) + 2 * (856 - 133), 'L 形的周长 = 外包矩形的周长');
  assert.deepEqual(pick(edges, 'top'), [[133, 186, 1070]], '凹位的上边和主矩形的上边连成一条');
  assert.deepEqual(pick(edges, 'left'), [[186, 133, 365], [305, 365, 856]], '凹位的左边 + 主矩形左边露出来的那一段');
  assert.deepEqual(pick(edges, 'bottom'), [[365, 186, 305], [856, 305, 1070]], '凹位的下边 + 主矩形的下边');
  assert.deepEqual(pick(edges, 'right'), [[1070, 133, 856]], '凹位的右边整条被主矩形盖住');
  assert.ok(edges.every((e) => e.room === 0 && e.a < e.b));

  const small = boundaryEdges(ell());
  assert.equal(total(small), 2 * 400 + 2 * 300);
  assert.deepEqual(pick(small, 'left'), [[100, 100, 220], [200, 220, 400]]);
});

test('boundaryEdges：同一房间里重叠的矩形只留外轮廓；两个房间各算各的；面积为 0 的矩形不算', () => {
  // 十字形：横条 + 竖条互相穿过
  const cross = { rooms: [{ name: 'X', rects: [[0, 40, 120, 80], [40, 0, 80, 120]] }] };
  const edges = boundaryEdges(cross);
  assert.equal(total(edges), 480, '十字形的周长 = 12 段 x 40');
  assert.deepEqual(pick(edges, 'top'), [[0, 40, 80], [40, 0, 40], [40, 80, 120]]);
  // 一模一样的两个矩形：只算一份
  assert.equal(total(boundaryEdges({ rooms: [{ rects: [[0, 0, 10, 10], [0, 0, 10, 10]] }] })), 40);
  // 两个房间共用一条边：各出现一次，方向相反
  const two = boundaryEdges({ rooms: [{ rects: [[0, 0, 100, 100]] }, { rects: [[100, 0, 200, 100]] }] });
  assert.equal(two.length, 8);
  assert.deepEqual(two.filter((e) => e.at === 100 && (e.side === 'left' || e.side === 'right')).map((e) => [e.side, e.room]), [['right', 0], ['left', 1]]);
  assert.deepEqual(boundaryEdges({ rooms: [{ rects: [[10, 10, 10, 90], [5, 5, 5, 5]] }] }), [], '没有面积');
  assert.deepEqual(pick(boundaryEdges({ rooms: [{ rects: [[500, 400, 100, 100]] }] }), 'top'), [[100, 100, 500]], '坐标写反也行');
});

test('boundaryEdges：坐标只差一点点（浮点误差）的两条线各算各的，夹在中间的那段不会被吞掉', () => {
  // 左右两个矩形的上边在 y = 10，中间那个在 y = 10.0000001：三段首尾相接，总长 30
  const geo = { rooms: [{ name: 'F', rects: [[0, 10, 5, 20], [20, 10, 30, 20], [5, 10.0000001, 20, 20]] }] };
  const top = boundaryEdges(geo).filter((e) => e.side === 'top');
  assert.deepEqual(pick(top, 'top'), [[10, 0, 5], [10, 20, 30], [10.0000001, 5, 20]]);
  assert.equal(total(top), 30);
  assert.equal(total(boundaryEdges(geo).filter((e) => e.side === 'bottom')), 30);
});

test('hitTest：先家具、再门窗、再房间矩形的边；点在空地板上什么都不选；可以只看某一层', () => {
  const geo = room({
    openings: [{ type: 'window', side: 'top', a: 200, b: 300 }],
    items: [{ id: 'cab', kind: 'low', box: [180, 100, 320, 160] }],
  });
  assert.deepEqual(hitTest(geo, [250, 130]), { type: 'item', index: 0, handle: 'move' });
  assert.deepEqual(hitTest(geo, [250, 97]), { type: 'item', index: 0, handle: 'move' }, '框外 6 像素以内也算点中家具，优先于窗');
  assert.deepEqual(hitTest(geo, [250, 90]), { type: 'opening', index: 0, handle: 'move' }, '墙厚里面');
  assert.deepEqual(hitTest(geo, [250, 75]), { type: 'opening', index: 0, handle: 'move' }, '墙外沿再往外 6 像素以内');
  assert.equal(hitTest(geo, [250, 73]), null);
  assert.deepEqual(hitTest(geo, [400, 103]), { type: 'room', index: 0, rect: 0, handle: 'move' }, '房间的边');
  assert.deepEqual(hitTest(geo, [506, 250]), { type: 'room', index: 0, rect: 0, handle: 'move' });
  assert.equal(hitTest(geo, [400, 250]), null, '空地板');
  assert.equal(hitTest(geo, [507, 250]), null);
  assert.equal(hitTest(geo, [400, 110], { tol: 12 }).type, 'room', '容差可调');
  // 分层
  assert.deepEqual(hitTest(geo, [250, 97], { layer: 'structure' }), { type: 'opening', index: 0, handle: 'move' });
  assert.equal(hitTest(geo, [250, 90], { layer: 'items' }), null);
  assert.equal(hitTest(geo, [400, 103], { layer: 'items' }), null);
  assert.equal(hitTest(geo, [250, 130], { layer: 'structure' }), null, '家具层关掉后点在柜子中间 = 空地板');
  // 带 at 的门窗：按 at 找墙
  const withAt = room({ openings: [{ type: 'door', side: 'left', a: 150, b: 250, at: 100 }] });
  assert.deepEqual(hitTest(withAt, [90, 200]), { type: 'opening', index: 0, handle: 'move' });
  // L 形：点凹位的下边选中凹位那个矩形
  assert.deepEqual(hitTest(STUDY, [240, 367], { layer: 'structure' }), { type: 'room', index: 0, rect: 1, handle: 'move' });
  assert.deepEqual(hitTest(STUDY, [305, 300], { layer: 'structure' }), { type: 'room', index: 0, rect: 1, handle: 'move' }, '两个矩形共用的边：取小的那个');
});

test('hitTest：叠在一起的家具选面积最小的（桌子轮廓里的椅子、桌子上方的吊柜都点得到）', () => {
  const geo = room({
    items: [
      { id: 'chair', kind: 'chair', box: [200, 200, 240, 240] },
      { id: 'desk', kind: 'desk', box: [150, 150, 400, 300] },
      { id: 'twin', kind: 'chair', box: [200, 200, 240, 240] },
    ],
  });
  assert.deepEqual(hitTest(geo, [220, 220]), { type: 'item', index: 2, handle: 'move' }, '面积一样：取后画的那个');
  assert.deepEqual(hitTest(geo, [300, 220]), { type: 'item', index: 1, handle: 'move' });
  assert.equal(hitTest(STUDY, [340, 500]).index, idx(STUDY, 'hung-left'), '吊柜比书桌小');
  assert.equal(hitTest(STUDY, [390, 500]).index, idx(STUDY, 'desk-left'));
  assert.equal(hitTest(STUDY, [650, 720]).index, idx(STUDY, 'chair-3'));
  assert.equal(hitTest(STUDY, [600, 500]), null, '房间中间的空地');
});

test('hitTest：选中的对象先看手柄 —— 框的四角 / 四边、门窗的两端；不在当前层的选中对象不算', () => {
  const geo = room({
    openings: [{ type: 'window', side: 'top', a: 200, b: 300 }, { type: 'door', side: 'right', a: 350, b: 250 }],
    items: [{ id: 'cab', kind: 'low', box: [200, 200, 300, 260] }, { id: 'dot', kind: 'block', box: [400, 300, 409, 309] }],
  });
  const sel = { selected: { type: 'item', index: 0 } };
  const at = (x, y, o = sel) => (hitTest(geo, [x, y], o) || {}).handle;
  assert.deepEqual(hitTest(geo, [198, 203], sel), { type: 'item', index: 0, handle: 'nw' });
  assert.deepEqual([at(303, 197), at(300, 262), at(196, 258)], ['ne', 'se', 'sw']);
  assert.deepEqual([at(250, 204), at(304, 230), at(250, 255), at(195, 230)], ['n', 'e', 's', 'w']);
  assert.equal(at(250, 230), 'move', '中间是移动');
  assert.equal(hitTest(geo, [250, 193], sel), null, '超出容差');
  assert.equal(at(250, 204, {}), 'move', '没选中就没有手柄');
  assert.equal(at(250, 204, { selected: { type: 'item', index: 0 }, layer: 'structure' }), undefined, '家具层关掉');
  // 很小的框：手柄只占到框内三分之一，正中间还能拖着移动
  const dot = { selected: { type: 'item', index: 1 } };
  assert.equal(at(404.5, 304.5, dot), 'move');
  assert.equal(at(401, 301, dot), 'nw');
  // 房间矩形
  const rsel = { selected: { type: 'room', index: 0, rect: 0 } };
  assert.deepEqual(hitTest(geo, [497, 402], rsel), { type: 'room', index: 0, rect: 0, handle: 'se' });
  assert.equal(at(350, 398, rsel), 's');
  assert.equal(at(350, 398), 'move', '没选中房间时点在边上 = 选中并移动');
  assert.equal(at(350, 398, { selected: rsel.selected, layer: 'items' }), undefined);
  // 门窗：a / b 两端（手柄跟着数据里的 a、b，不管谁大谁小）
  const osel = { selected: { type: 'opening', index: 0 } };
  assert.deepEqual(hitTest(geo, [202, 95], osel), { type: 'opening', index: 0, handle: 'a' });
  assert.equal(at(297, 100, osel), 'b');
  assert.equal(at(250, 90, osel), 'move');
  const dsel = { selected: { type: 'opening', index: 1 } };
  assert.equal(at(510, 348, dsel), 'a', 'a = 350 在下面');
  assert.equal(at(510, 252, dsel), 'b');
  assert.equal(at(510, 300, dsel), 'move');
  assert.equal(at(202, 95, { selected: osel.selected, layer: 'items' }), undefined);
});

test('dragRect 移动：整体平移、大小不变、夹在范围里；没有范围就不夹', () => {
  const b = [100, 100, 200, 160];
  assert.deepEqual(dragRect(b, 'move', 30, -20, null), [130, 80, 230, 140]);
  assert.deepEqual(dragRect(b, 'move', -500, -500, [0, 0, 600, 500]), [0, 0, 100, 60]);
  assert.deepEqual(dragRect(b, 'move', 5000, 5000, [0, 0, 600, 500]), [500, 440, 600, 500]);
  assert.deepEqual(dragRect(b, 'move', 10, 10, [0, 0, 600, 500]), [110, 110, 210, 170]);
  assert.deepEqual(dragRect([200, 160, 100, 100], 'move', 1, 1), [101, 101, 201, 161], '坐标写反先整理');
  assert.deepEqual(b, [100, 100, 200, 160], '不改原数组');
  assert.notEqual(dragRect(b, 'move', 0, 0, null), b, '返回新数组');
  assert.deepEqual(dragRect(b, '没有这个手柄', 50, 50, null), b);
  assert.equal(dragRect(null, 'move', 1, 1), null);
});

test('dragRect 缩放：只动被拖的边；到最小尺寸就停、不翻面；不出范围', () => {
  const b = [100, 100, 200, 160];
  const bounds = [0, 0, 600, 500];
  assert.deepEqual(dragRect(b, 'e', 30, 99, bounds), [100, 100, 230, 160], '拖右边：dy 不管');
  assert.deepEqual(dragRect(b, 'n', 99, -40, bounds), [100, 60, 200, 160]);
  assert.deepEqual(dragRect(b, 'nw', -10, -20, bounds), [90, 80, 200, 160]);
  assert.deepEqual(dragRect(b, 'se', 10, 20, bounds), [100, 100, 210, 180]);
  assert.deepEqual(dragRect(b, 'sw', -10, 20, bounds), [90, 100, 200, 180]);
  assert.deepEqual(dragRect(b, 'ne', 10, -20, bounds), [100, 80, 210, 160]);
  // 往里拖过头：停在最小尺寸
  assert.deepEqual(dragRect(b, 'w', 500, 0, bounds), [196, 100, 200, 160], '默认最小 4');
  assert.deepEqual(dragRect(b, 'e', -500, 0, bounds, 10), [100, 100, 110, 160]);
  assert.deepEqual(dragRect(b, 's', 0, -500, bounds, 20), [100, 100, 200, 120]);
  assert.deepEqual(dragRect(b, 'nw', 500, 500, null, 0), [200, 160, 200, 160], '最小为 0 也不翻面');
  // 出范围：停在范围边上
  assert.deepEqual(dragRect(b, 'w', -500, 0, bounds), [0, 100, 200, 160]);
  assert.deepEqual(dragRect(b, 'se', 5000, 5000, bounds), [100, 100, 600, 500]);
  assert.deepEqual(dragRect(b, 'se', 5000, 5000, null), [100, 100, 5200, 5160]);
  // 本来就比最小尺寸小的框：不许再往里，也不会被弹大
  assert.deepEqual(dragRect([100, 100, 102, 160], 'e', -1, 0, bounds), [100, 100, 102, 160]);
  assert.deepEqual(dragRect([100, 100, 102, 160], 'e', 5, 0, bounds), [100, 100, 107, 160]);
});

test('snapBox 移动：离墙近就整体吸上去（每个方向最多一次、最近的优先），离得远不动；against = 接触最长的那面墙', () => {
  const geo = room();
  assert.deepEqual(snapBox(geo, [104, 200, 164, 300], 8), { box: [100, 200, 160, 300], against: 'left' });
  assert.deepEqual(snapBox(geo, [104, 200, 164, 300], 8, 'move'), { box: [100, 200, 160, 300], against: 'left' });
  assert.deepEqual(snapBox(geo, [104, 200, 164, 300], 3), { box: [104, 200, 164, 300], against: null }, '超过容差');
  assert.deepEqual(snapBox(geo, [300, 345, 360, 395], 8), { box: [300, 350, 360, 400], against: 'bottom' });
  assert.deepEqual(snapBox(geo, [436, 200, 496, 300], 8), { box: [440, 200, 500, 300], against: 'right' });
  assert.deepEqual(snapBox(geo, [300, 103, 360, 153], 8), { box: [300, 100, 360, 150], against: 'top' });
  // 墙角：两个方向各吸一次；贴得长的那面墙算 against
  assert.deepEqual(snapBox(geo, [103, 104, 163, 304], 8), { box: [100, 100, 160, 300], against: 'left' });
  assert.deepEqual(snapBox(geo, [103, 104, 303, 164], 8), { box: [100, 100, 300, 160], against: 'top' });
  // 比房间还宽一点的框：左右两面墙都在容差里，取近的
  assert.deepEqual(snapBox(geo, [103, 200, 505, 260], 8).box, [100, 200, 502, 260]);
  assert.deepEqual(snapBox(geo, [97, 200, 502, 260], 8).box, [95, 200, 500, 260]);
  // 不和那条边"面对面"（沿边方向没有重叠）不吸
  assert.deepEqual(snapBox(geo, [104, 500, 164, 560], 8), { box: [104, 500, 164, 560], against: null });
  // L 形：凹位里的柜子吸到凹位的左墙；主房间里靠凹位下方的柜子吸到主房间的左墙
  assert.deepEqual(snapBox(STUDY, [190, 158, 318, 290], 8), { box: [186, 158, 314, 290], against: 'left' });
  assert.deepEqual(snapBox(STUDY, [316, 338, 408, 641], 16), { box: [305, 338, 397, 641], against: 'left' }, '338 离凹位下边 365 超过容差');
  assert.deepEqual(snapBox(STUDY, [300, 380, 400, 500], 8), { box: [305, 380, 405, 500], against: 'left' });
  // 不传容差 = 不吸，只算 against
  assert.deepEqual(snapBox(geo, [100, 200, 160, 300]), { box: [100, 200, 160, 300], against: 'left' });
  assert.deepEqual(snapBox(geo, [104, 200, 164, 300]), { box: [104, 200, 164, 300], against: null });
  const input = [104, 200, 164, 300];
  snapBox(geo, input, 8);
  assert.deepEqual(input, [104, 200, 164, 300], '不改原数组');
});

test('snapBox 缩放：只有被拖的那几条边会吸；样本里贴墙的柜子 against 和样本一致', () => {
  const geo = room();
  assert.deepEqual(snapBox(geo, [104, 200, 164, 300], 8, 'w'), { box: [100, 200, 164, 300], against: 'left' }, '拖左边：右边不动，框变宽');
  assert.deepEqual(snapBox(geo, [104, 200, 164, 300], 8, 'e'), { box: [104, 200, 164, 300], against: null }, '拖右边：左边离墙再近也不动');
  assert.deepEqual(snapBox(geo, [104, 104, 164, 300], 8, 'n'), { box: [104, 100, 164, 300], against: 'top' });
  assert.deepEqual(snapBox(geo, [104, 104, 164, 300], 8, 'nw'), { box: [100, 100, 164, 300], against: 'left' });
  assert.deepEqual(snapBox(geo, [300, 300, 495, 396], 8, 'se'), { box: [300, 300, 500, 400], against: 'bottom' }, '两条边都吸；右墙贴 100、下墙贴 200 → 算贴下墙');
  assert.deepEqual(snapBox(geo, [300, 300, 495, 396], 8, 's'), { box: [300, 300, 495, 400], against: 'bottom' });
  assert.deepEqual(snapBox(geo, [104, 200, 164, 300], 8, '没有这个手柄'), { box: [104, 200, 164, 300], against: null });
  // 样本：把每个标了 against 的东西按 16 像素容差吸一下，贴的那面墙应该和样本写的一样
  for (const it of STUDY.items.filter((x) => x.against)) {
    const res = snapBox(STUDY, it.box, 16);
    assert.equal(res.against, it.against, `${it.id} 贴 ${it.against}`);
  }
  assert.equal(snapBox(STUDY, [418, 386, 494, 467], 4).against, null, '椅子哪面墙都不贴');
});

test('snapBox：对吸过的结果再吸一次不会又动（吸完一个方向后面对的墙变了，要接着看到不动为止）', () => {
  // 移动：先左右吸到 x = 29..51，这时才正对着下墙（y = 55），接着吸上去
  const geo = { rooms: [{ name: 'A', rects: [[29, 1, 51, 55], [44, 32, 53, 49]] }] };
  const moved = snapBox(geo, [31, 50, 53, 60], 4);
  assert.deepEqual(moved, { box: [29, 45, 51, 55], against: 'bottom' });
  assert.deepEqual(snapBox(geo, moved.box, 4), moved);
  // 缩放（拖左上角）：左边吸到 x = 300 以后，上边才和隔壁房间的下墙（y = 100，x 到 302 为止）对上
  const two = { rooms: [{ name: 'A', rects: [[100, 100, 300, 300]] }, { name: 'B', rects: [[250, 40, 302, 100]] }] };
  const sized = snapBox(two, [303, 104, 360, 200], 8, 'nw');
  assert.deepEqual(sized.box, [300, 100, 360, 200]);
  assert.deepEqual(snapBox(two, sized.box, 8, 'nw'), sized);
  // 样本和 L 形房间里扫一遍：吸两次 = 吸一次
  for (const g of [STUDY, ell(), geo, two]) {
    for (let x = 80; x < 1100; x += 37) {
      for (let y = 60; y < 900; y += 41) {
        for (const handle of ['move', 'nw', 'se']) {
          const once = snapBox(g, [x, y, x + 90, y + 60], 16, handle);
          assert.deepEqual(snapBox(g, once.box, 16, handle), once, `${handle} ${x},${y}`);
        }
      }
    }
  }
});

test('snapOpening：画的一段落到最近的轮廓边上，四面墙都行；超出边的部分夹掉；太短 / 太远 / 没有房间 = null', () => {
  const geo = room();
  assert.deepEqual(snapOpening(geo, [300, 92], [200, 96], 20), { side: 'top', at: 100, a: 200, b: 300, room: 0 }, 'a、b 排好序');
  assert.deepEqual(snapOpening(geo, [512, 150], [508, 250], 20), { side: 'right', at: 500, a: 150, b: 250, room: 0 });
  assert.deepEqual(snapOpening(geo, [200, 410], [320, 410], 20), { side: 'bottom', at: 400, a: 200, b: 320, room: 0 });
  assert.deepEqual(snapOpening(geo, [90, 150], [90, 250], 20), { side: 'left', at: 100, a: 150, b: 250, room: 0 });
  assert.deepEqual(snapOpening(geo, [60, 90], [200, 90], 20), { side: 'top', at: 100, a: 100, b: 200, room: 0 }, '伸出墙角的部分夹掉');
  assert.deepEqual(snapOpening(geo, [450, 410], [900, 410], Infinity), { side: 'bottom', at: 400, a: 450, b: 500, room: 0 }, '中点在房间外也取最近的边');
  assert.equal(snapOpening(geo, [200, 50], [300, 50], 20), null, '离墙 50，超过容差');
  assert.deepEqual(snapOpening(geo, [200, 50], [300, 50], Infinity).side, 'top', '容差无穷大 = 总是取最近的');
  assert.deepEqual(snapOpening(geo, [200, 50], [300, 50]).side, 'top', '不传容差 = 无穷大');
  assert.equal(snapOpening(geo, [200, 95], [201, 95], 20), null, '不到 2 像素');
  assert.equal(snapOpening(geo, [300, 90], [300, 110], 20), null, '垂直于墙画的一段：投影太短');
  assert.equal(snapOpening({ rooms: [] }, [0, 0], [100, 0], Infinity), null);
  assert.equal(snapOpening(geo, null, [100, 0], Infinity), null);
  // 中点正好在墙角：取和画的方向一致的那条边
  assert.equal(snapOpening(geo, [60, 100], [140, 100], 20).side, 'top');
  assert.equal(snapOpening(geo, [100, 60], [100, 140], 20).side, 'left');
  // 样本的三个门窗：从墙厚中线上画，能还原出样本的数据
  assert.deepEqual(snapOpening(STUDY, [309, 120], [697, 120], 26), { side: 'top', at: 133, a: 309, b: 697, room: 0 });
  assert.deepEqual(snapOpening(STUDY, [292, 732], [292, 856], 26), { side: 'left', at: 305, a: 732, b: 856, room: 0 });
  assert.deepEqual(snapOpening(STUDY, [305, 869], [458, 869], 26), { side: 'bottom', at: 856, a: 305, b: 458, room: 0 });
  assert.deepEqual(snapOpening(STUDY, [173, 150], [173, 300], 26), { side: 'left', at: 186, a: 150, b: 300, room: 0 }, '凹位的左墙');
});

test('guessFacing：椅子朝最近的书桌（和样本里四把椅子写的朝向一致）；没有书桌 = null', () => {
  const chairs = STUDY.items.filter((it) => it.kind === 'chair');
  assert.equal(chairs.length, 4);
  for (const c of chairs) assert.equal(guessFacing(STUDY, c.box), c.facing, c.id);
  const desk = (box) => ({ items: [{ id: 'd', kind: 'desk', box }] });
  assert.equal(guessFacing(desk([100, 100, 300, 160]), [150, 170, 200, 220]), 'top', '桌子在上面');
  assert.equal(guessFacing(desk([100, 100, 300, 160]), [150, 30, 200, 80]), 'bottom');
  assert.equal(guessFacing(desk([100, 100, 160, 300]), [170, 150, 220, 200]), 'left');
  assert.equal(guessFacing(desk([100, 100, 160, 300]), [30, 150, 80, 200]), 'right');
  assert.equal(guessFacing(desk([100, 100, 160, 160]), [200, 170, 240, 210]), 'left', '斜对角：看中心差得多的方向');
  // 长桌子的一头：按框之间的距离找最近的桌子，而不是按中心
  const two = { items: [{ id: 'long', kind: 'desk', box: [0, 0, 1000, 60] }, { id: 'near', kind: 'desk', box: [300, 300, 360, 360] }] };
  assert.equal(guessFacing(two, [900, 70, 950, 120]), 'top');
  assert.equal(guessFacing(room({ items: [{ id: 'c', kind: 'low', box: [0, 0, 10, 10] }] }), [20, 20, 30, 30]), null);
  assert.equal(guessFacing({}, [20, 20, 30, 30]), null);
  assert.equal(guessFacing(STUDY, null), null);
});

test('renderGeo：不在任何房间里的东西、贴不到墙的门窗不交给画图程序；墙里的柱子留着；没变就是原对象', () => {
  assert.equal(renderGeo(STUDY), STUDY, '样本全部有效（包括两根在墙里的柱子）：原样返回');
  const geo = room({
    openings: [{ type: 'window', side: 'top', a: 200, b: 300 }, { type: 'door', side: 'top', a: 900, b: 990 }, { type: 'door', side: 'top', a: 250, b: 250 }],
    items: [
      { id: 'in', kind: 'low', box: [120, 120, 180, 180] },
      { id: 'out', kind: 'low', box: [520, 120, 580, 180] },
      { id: 'half', kind: 'low', box: [460, 120, 560, 180] },
      { id: 'col-wall', kind: 'column', box: [300, 60, 340, 100] },
      { id: 'col-far', kind: 'column', box: [300, 10, 340, 70] },
      { id: 'bad', kind: 'low', box: [1, 2, 3] },
    ],
  });
  const before = snapshot(geo);
  const out = renderGeo(geo);
  assert.deepEqual(out.items.map((it) => it.id), ['in', 'col-wall'], '中心在房间外的去掉；贴着墙的柱子留着');
  assert.deepEqual(out.openings, [geo.openings[0]]);
  assert.equal(out.items[0], geo.items[0], '留下来的是同一个对象');
  assert.equal(out.rooms, geo.rooms);
  assert.equal(out.source, geo.source);
  assert.equal(out.wallT, 20);
  assert.deepEqual(geo, before, '不改原数据');
  // 带 at 的门窗：那个位置真有一条同侧的轮廓边才算贴着墙
  const two = { wallT: 20, rooms: [{ name: 'A', rects: [[0, 0, 100, 100]] }, { name: 'B', rects: [[120, 0, 300, 100]] }], items: [] };
  const inner = { type: 'door', side: 'right', a: 20, b: 60, at: 100 };
  const withInner = { ...two, openings: [inner, { ...inner, at: 110 }, { ...inner, side: 'left' }, { ...inner, a: 200, b: 260 }, { ...inner, at: 300 }] };
  assert.deepEqual(renderGeo(withInner).openings, [inner, withInner.openings[4]], '两个房间之间的内墙：at 对得上才留');
  assert.deepEqual(validateGeo(withInner).map((p) => [p.code, p.index]), [['opening-off-wall', 1], ['opening-off-wall', 2], ['opening-off-wall', 3]]);
  // 没有房间：什么都画不了
  assert.deepEqual(renderGeo({ openings: [inner] }).openings, []);
  const none = renderGeo({ items: [{ id: 'a', kind: 'low', box: [0, 0, 10, 10] }], openings: [{ type: 'door', side: 'top', a: 0, b: 10 }] });
  assert.deepEqual(none, { rooms: [], items: [], openings: [] });
  assert.deepEqual(renderGeo({}), { rooms: [], items: [], openings: [] }, '缺数组不报错，补成空的');
  assert.equal(renderGeo(null), null);
});

test('validateGeo：没有房间、东西在房间外、重复、门窗不贴墙、拿不准、太窄 —— 每条都带中文说明', () => {
  assert.deepEqual(validateGeo(STUDY).map((p) => [p.code, STUDY.items[p.index].id]), [['unsure', 'shelf-niche'], ['unsure', 'block-dark'], ['unsure', 'block-light']]);
  assert.deepEqual(validateGeo(room()), []);
  const geo = room({
    openings: [{ type: 'window', side: 'top', a: 200, b: 300 }, { type: 'door', side: 'left', a: 900, b: 990 }],
    items: [
      { id: 'a', label: 'BOOK CABINET', kind: 'tall', box: [120, 120, 220, 180] },
      { id: 'b', label: '', kind: 'tall', box: [121, 121, 221, 181] },
      { id: 'c', label: '', kind: 'low', box: [120, 120, 220, 180] },
      { id: 'd', label: '', kind: 'low', box: [600, 120, 700, 180], unsure: true },
      { id: 'e', label: '', kind: 'shelf', box: [300, 300, 302, 380] },
    ],
  });
  const problems = validateGeo(geo);
  assert.deepEqual(problems.map((p) => [p.level, p.code, p.type, p.index]), [
    ['warn', 'item-duplicate', 'item', 1],
    ['warn', 'item-outside', 'item', 3],
    ['warn', 'unsure', 'item', 3],
    ['warn', 'tiny', 'item', 4],
    ['warn', 'opening-off-wall', 'opening', 1],
  ]);
  assert.ok(problems.every((p) => typeof p.zh === 'string' && /[一-鿿]/.test(p.zh)));
  assert.ok(problems[0].zh.includes('BOOK CABINET'), '说明里带着和谁重复');
  const empty = validateGeo({ items: [{ id: 'x', kind: 'low', box: [0, 0, 50, 50] }], openings: [{ type: 'door', side: 'top', a: 0, b: 10 }] });
  assert.deepEqual(empty.map((p) => [p.level, p.code]), [['error', 'no-room']], '没有房间时只报这一条，不再逐个说东西在房间外');
  assert.equal(empty[0].type, undefined);
  assert.deepEqual(validateGeo({ rooms: [{ name: 'x', rects: [] }] }).map((p) => p.code), ['no-room']);
  assert.deepEqual(validateGeo(room({ items: [{ id: 'bad', kind: 'low', box: [1, 2, NaN, 4] }] })).map((p) => p.code), ['item-outside'], '坐标不对的东西也算画不出来');
});

test('transformGeo：所有坐标按轴缩放 + 平移，墙厚 / 圆角 / 比例尺按平均缩放换算；来回一趟还原', () => {
  const geo = { ...STUDY, openings: STUDY.openings.map((o, i) => (i === 1 ? { ...o, at: 305 } : o)) };
  const before = snapshot(geo);
  const out = transformGeo(geo, 2, 4, 10, 20);
  assert.deepEqual(out.rooms[0].rects[0], [620, 552, 2150, 3444]);
  assert.deepEqual(out.items[idx(geo, 'desk-left')].box, [642, 1372, 826, 2584]);
  assert.deepEqual(out.items[idx(geo, 'desk-left')].round, { tr: 66, br: 66 }, '圆角 x 平均缩放 3');
  assert.deepEqual(out.openings[0], { type: 'window', side: 'top', a: 628, b: 1404 }, '上墙的窗：a、b 在 x 轴上');
  assert.deepEqual(out.openings[1], { type: 'door', side: 'left', a: 2948, b: 3444, at: 620 }, '左墙的门：a、b 在 y 轴上，at 在 x 轴上');
  assert.equal(out.wallT, 78);
  assert.ok(Math.abs(out.mmPerPx - 6.9 / 3) < 1e-12);
  assert.equal(out.source, geo.source, 'source 不动');
  assert.equal(out.note, geo.note);
  assert.deepEqual(geo, before, '不改原数据');
  const back = transformGeo(transformGeo(geo, 2, 2, 16, -32), 0.5, 0.5, -8, 16);
  assert.deepEqual(back, geo, '来回一趟还原');
  assert.deepEqual(transformGeo(geo, 1, 1, 0, 0), geo);
  assert.equal(transformGeo(geo, 0, 1, 0, 0), geo, '缩放不是正数：不动');
  assert.equal(transformGeo(geo, NaN, 1, 0, 0), geo);
  assert.deepEqual(transformGeo({}, 2, 2, 1, 1), {});
  assert.deepEqual(transformGeo({ rooms: [{ name: 'x' }], items: [{ id: 'a' }], openings: [{}] }, 2, 2, 1, 1), { rooms: [{ name: 'x' }], items: [{ id: 'a' }], openings: [{}] });
});

test('applyOp 家具：加 / 改 / 删都返回新对象、不改原数据；没变的部分共用；改过框或种类 = 已确认', () => {
  const before = snapshot(STUDY);
  const added = applyOp(STUDY, { type: 'addItem', item: { kind: 'chair', box: [700, 300, 650, 250] } });
  assert.notEqual(added, STUDY);
  assert.equal(added.items.length, STUDY.items.length + 1);
  assert.deepEqual(added.items[added.items.length - 1], { kind: 'chair', box: [650, 250, 700, 300], label: '', id: 'chair-5' }, '自动编号、框整理好');
  assert.equal(added.items[0], STUDY.items[0], '原来的东西是同一个对象');
  assert.equal(added.rooms, STUDY.rooms);
  assert.equal(applyOp(STUDY, { type: 'addItem', item: { id: 'mine', kind: 'low', box: [0, 0, 1, 1] } }).items[18].id, 'mine');
  assert.equal(applyOp(STUDY, { type: 'addItem', item: { id: 'book', kind: 'tall', box: [0, 0, 1, 1] } }).items[18].id, 'tall-1', '编号撞了就换一个');
  assert.equal(applyOp(STUDY, { type: 'addItem', item: { box: [0, 0, 1, 1] } }).items[18].kind, 'block');

  const i = idx(STUDY, 'shelf-niche');
  const moved = applyOp(STUDY, { type: 'updateItem', index: i, patch: { box: [190, 290, 318, 338] } });
  assert.deepEqual(moved.items[i], { id: 'shelf-niche', label: '', kind: 'shelf', box: [190, 290, 318, 338], against: 'left' }, '动过框：unsure 去掉');
  assert.equal(moved.items[i + 1], STUDY.items[i + 1]);
  assert.equal('unsure' in applyOp(STUDY, { type: 'updateItem', index: i, patch: { kind: 'shelf' } }).items[i], false, '确认种类（哪怕没变）也算确认');
  assert.equal(applyOp(STUDY, { type: 'updateItem', index: i, patch: { label: 'SHELF' } }).items[i].unsure, true, '只改名字不算');
  assert.equal(applyOp(STUDY, { type: 'updateItem', index: i, patch: { box: [1, 1, 9, 9], unsure: true } }).items[i].unsure, true, '修改自己带着 unsure：听它的');
  const cleared = applyOp(STUDY, { type: 'updateItem', index: i, patch: { against: undefined, facing: 'top' } });
  assert.equal('against' in cleared.items[i], false, '值为 undefined 的键删掉');
  assert.equal(cleared.items[i].facing, 'top');

  const removed = applyOp(STUDY, { type: 'removeItem', index: 0 });
  assert.equal(removed.items.length, 17);
  assert.equal(removed.items[0], STUDY.items[1]);
  assert.deepEqual(STUDY, before, '样本没被改动');
});

test('applyOp 房间 / 门窗 / 比例 / 全部确认', () => {
  const geo = room({ openings: [{ type: 'window', side: 'top', a: 200, b: 300 }], items: [{ id: 'a', kind: 'low', box: [120, 120, 180, 180], unsure: true }, { id: 'b', kind: 'low', box: [220, 120, 280, 180] }] });
  const before = snapshot(geo);
  const g1 = applyOp(geo, { type: 'addRoom', name: 'BATH', box: [700, 300, 600, 100] });
  assert.deepEqual(g1.rooms[1], { name: 'BATH', rects: [[600, 100, 700, 300]] });
  assert.equal(g1.rooms[0], geo.rooms[0]);
  assert.equal(applyOp(geo, { type: 'addRoom', box: [600, 100, 700, 300] }).rooms[1].name, '房间 2');
  const g2 = applyOp(geo, { type: 'addRoomRect', room: 0, box: [40, 100, 100, 200] });
  assert.deepEqual(g2.rooms[0].rects, [[100, 100, 500, 400], [40, 100, 100, 200]]);
  assert.equal(g2.rooms[0].rects[0], geo.rooms[0].rects[0]);
  const g3 = applyOp(g2, { type: 'setRoomRect', room: 0, rect: 1, box: [30, 100, 100, 220] });
  assert.deepEqual(g3.rooms[0].rects[1], [30, 100, 100, 220]);
  const g4 = applyOp(g3, { type: 'removeRoomRect', room: 0, rect: 0 });
  assert.deepEqual(g4.rooms, [{ name: 'ROOM', rects: [[30, 100, 100, 220]] }]);
  assert.deepEqual(applyOp(g4, { type: 'removeRoomRect', room: 0, rect: 0 }).rooms, [], '删掉最后一个矩形 = 删掉房间');
  assert.equal(applyOp(geo, { type: 'setRoomName', room: 0, name: 'STUDY' }).rooms[0].name, 'STUDY');
  assert.equal(applyOp(geo, { type: 'setRoomName', room: 0, name: 'STUDY' }).rooms[0].rects, geo.rooms[0].rects);

  const o1 = applyOp(geo, { type: 'addOpening', opening: { type: 'door', side: 'left', a: 150, b: 250, at: 100 } });
  assert.deepEqual(o1.openings[1], { type: 'door', side: 'left', a: 150, b: 250, at: 100 });
  assert.equal(o1.openings[0], geo.openings[0]);
  assert.equal(applyOp(geo, { type: 'addOpening', opening: { side: 'top', a: 1, b: 9 } }).openings[1].type, 'door');
  const o2 = applyOp(o1, { type: 'updateOpening', index: 1, patch: { a: 300, type: 'gap', at: undefined } });
  assert.deepEqual(o2.openings[1], { type: 'gap', side: 'left', a: 300, b: 250 }, 'a、b 不自动对调：拖哪一端就改哪个');
  assert.deepEqual(applyOp(o2, { type: 'removeOpening', index: 0 }).openings, [o2.openings[1]]);

  assert.equal(applyOp(geo, { type: 'setScale', mmPerPx: 5.5 }).mmPerPx, 5.5);
  assert.equal(applyOp(geo, { type: 'setWallT', wallT: 24 }).wallT, 24);
  const confirmed = applyOp(geo, { type: 'confirmAll' });
  assert.deepEqual(confirmed.items[0], { id: 'a', kind: 'low', box: [120, 120, 180, 180] });
  assert.equal(confirmed.items[1], geo.items[1]);
  assert.equal(confirmed.rooms, geo.rooms);
  assert.deepEqual(validateGeo(confirmed), []);
  // 从空数据开始也能加
  assert.deepEqual(applyOp({}, { type: 'addRoom', name: 'A', box: [0, 0, 10, 10] }), { rooms: [{ name: 'A', rects: [[0, 0, 10, 10]] }] });
  assert.deepEqual(applyOp(null, { type: 'addItem', item: { kind: 'low', box: [0, 0, 10, 10] } }).items[0].id, 'low-1');
  assert.deepEqual(geo, before, '不改原数据');
});

test('applyOp：不认识的操作 / 序号不对 / 数值不对 / 其实没变 → 返回原来那个对象', () => {
  const geo = room({ openings: [{ type: 'window', side: 'top', a: 200, b: 300 }], items: [{ id: 'a', kind: 'low', box: [120, 120, 180, 180] }] });
  const before = snapshot(geo);
  const noops = [
    null,
    {},
    { type: '没有这个操作' },
    { type: 'addItem' },
    { type: 'addItem', item: { kind: 'low' } },
    { type: 'addItem', item: { kind: 'low', box: [0, 0, NaN, 1] } },
    { type: 'updateItem', index: 1, patch: { kind: 'tall' } },
    { type: 'updateItem', index: -1, patch: { kind: 'tall' } },
    { type: 'updateItem', index: 0.5, patch: { kind: 'tall' } },
    { type: 'updateItem', index: '0', patch: { kind: 'tall' } },
    { type: 'updateItem', index: 0 },
    { type: 'updateItem', index: 0, patch: {} },
    { type: 'updateItem', index: 0, patch: { box: [120, 120, 180, 180], kind: 'low' } },
    { type: 'updateItem', index: 0, patch: { box: [180, 180, 120, 120] } },
    { type: 'updateItem', index: 0, patch: { box: [1, 2, 3] } },
    { type: 'updateItem', index: 0, patch: { facing: undefined } },
    { type: 'removeItem', index: 1 },
    { type: 'removeItem' },
    { type: 'addRoom', name: 'X' },
    { type: 'addRoom', name: 'X', box: [5, 5, 5, 90] },
    { type: 'addRoomRect', room: 1, box: [0, 0, 10, 10] },
    { type: 'addRoomRect', room: 0, box: null },
    { type: 'setRoomRect', room: 0, rect: 1, box: [0, 0, 10, 10] },
    { type: 'setRoomRect', room: 0, rect: 0, box: [100, 100, 500, 400] },
    { type: 'removeRoomRect', room: 0, rect: 3 },
    { type: 'removeRoomRect', room: 2, rect: 0 },
    { type: 'setRoomName', room: 0, name: 'ROOM' },
    { type: 'setRoomName', room: 0 },
    { type: 'setRoomName', room: 5, name: 'X' },
    { type: 'addOpening', opening: { type: 'door', side: 'north', a: 1, b: 2 } },
    { type: 'addOpening', opening: { type: 'door', side: 'top', a: 1 } },
    { type: 'addOpening' },
    { type: 'updateOpening', index: 1, patch: { a: 1 } },
    { type: 'updateOpening', index: 0, patch: { a: 200 } },
    { type: 'updateOpening', index: 0, patch: { side: 'up' } },
    { type: 'updateOpening', index: 0, patch: { a: undefined } },
    { type: 'removeOpening', index: 7 },
    { type: 'setScale', mmPerPx: 0 },
    { type: 'setScale', mmPerPx: -3 },
    { type: 'setScale', mmPerPx: Infinity },
    { type: 'setScale', mmPerPx: '7' },
    { type: 'setScale', mmPerPx: 10 },
    { type: 'setWallT', wallT: NaN },
    { type: 'setWallT', wallT: 0 },
    { type: 'setWallT', wallT: 20 },
    { type: 'confirmAll' },
  ];
  for (const op of noops) assert.equal(applyOp(geo, op), geo, JSON.stringify(op));
  assert.deepEqual(geo, before);
  assert.equal(applyOp(null, { type: 'removeItem', index: 0 }), null);
  const empty = {};
  assert.equal(applyOp(empty, { type: 'confirmAll' }), empty);
});

test('applyOp updateItem：圆角换成内容一样的新对象 = 没变，返回原对象（不占一步撤销）', () => {
  const geo = room({ items: [{ id: 'a', kind: 'desk', box: [120, 120, 180, 180], round: { tl: 22, br: 4 } }] });
  assert.equal(applyOp(geo, { type: 'updateItem', index: 0, patch: { round: { tl: 22, br: 4 } } }), geo);
  assert.equal(applyOp(geo, { type: 'updateItem', index: 0, patch: { round: { br: 4, tl: 22 }, label: undefined } }), geo);
  assert.deepEqual(applyOp(geo, { type: 'updateItem', index: 0, patch: { round: { tl: 22 } } }).items[0].round, { tl: 22 }, '少了一个角：变了');
  assert.deepEqual(applyOp(geo, { type: 'updateItem', index: 0, patch: { round: { tl: 22, br: 5 } } }).items[0].round, { tl: 22, br: 5 });
  assert.notEqual(applyOp(geo, { type: 'updateItem', index: 0, patch: { round: [22, 4] } }), geo, '数组和对象不算一样');
});

test('newItemId：种类-N，不和已有的重复', () => {
  assert.equal(newItemId(STUDY, 'chair'), 'chair-5');
  assert.equal(newItemId(STUDY, 'tall'), 'tall-1');
  assert.equal(newItemId({ items: [{ id: 'low-1' }, { id: 'low-3' }, null, {}] }, 'low'), 'low-2', '取最小的空号');
  assert.equal(newItemId({}, 'desk'), 'desk-1');
  assert.equal(newItemId(null), 'block-1');
  let geo = room();
  for (let n = 0; n < 3; n++) geo = applyOp(geo, { type: 'addItem', item: { kind: 'low', box: [120 + n * 70, 120, 180 + n * 70, 180] } });
  geo = applyOp(geo, { type: 'removeItem', index: 1 });
  geo = applyOp(geo, { type: 'addItem', item: { kind: 'low', box: [120, 220, 180, 280] } });
  assert.deepEqual(geo.items.map((it) => it.id), ['low-1', 'low-3', 'low-2']);
});

test('撤销 / 重做：记一步清掉重做；同一个对象不记；最多留 limit 步；没得撤销 / 重做时返回原对象', () => {
  const a = { n: 'a' };
  const b = { n: 'b' };
  const c = { n: 'c' };
  const h0 = histInit(a);
  assert.deepEqual(h0, { past: [], present: a, future: [] });
  assert.equal(histUndo(h0), h0);
  assert.equal(histRedo(h0), h0);
  assert.equal(histPush(h0, a), h0, '没变不记');
  const h1 = histPush(h0, b);
  assert.deepEqual(h1, { past: [a], present: b, future: [] });
  assert.deepEqual(h0, { past: [], present: a, future: [] }, '不改原来的历史');
  const h2 = histPush(h1, c);
  const u1 = histUndo(h2);
  assert.deepEqual(u1, { past: [a], present: b, future: [c] });
  const u2 = histUndo(u1);
  assert.deepEqual(u2, { past: [], present: a, future: [b, c] });
  assert.equal(histUndo(u2), u2);
  assert.deepEqual(histRedo(u2), u1);
  assert.deepEqual(histRedo(histRedo(u2)), h2);
  assert.equal(histRedo(h2), h2);
  assert.deepEqual(histPush(u1, a), { past: [a, b], present: a, future: [] }, '撤销后再改：重做清掉');
  assert.equal(u1.present, b);
  // 上限
  let h = histInit(0);
  for (let n = 1; n <= 250; n++) h = histPush(h, n);
  assert.equal(h.past.length, 100);
  assert.equal(h.past[0], 150);
  assert.equal(h.present, 250);
  let small = histInit(0);
  for (let n = 1; n <= 5; n++) small = histPush(small, n, 2);
  assert.deepEqual(small, { past: [3, 4], present: 5, future: [] });
  // 和 applyOp 配合：没变化的操作不占一步
  const g = room();
  let hist = histInit(g);
  hist = histPush(hist, applyOp(hist.present, { type: 'setWallT', wallT: 20 }));
  assert.equal(hist.past.length, 0);
  hist = histPush(hist, applyOp(hist.present, { type: 'setWallT', wallT: 30 }));
  assert.equal(hist.past.length, 1);
  assert.equal(histUndo(hist).present, g);
});

test('撤销 / 重做：limit 可以是 Infinity（不设上限）；历史对象残缺也不报错', () => {
  let h = histInit(0);
  for (let n = 1; n <= 150; n++) h = histPush(h, n, Infinity);
  assert.equal(h.past.length, 150);
  assert.equal(histPush(histInit(0), 1, NaN).past.length, 1, '不是数的 limit 用默认值');
  for (const broken of [{ present: 1 }, { past: 'abc', present: 1, future: 5 }, { past: { length: 3 }, present: 1, future: { length: 3 } }]) {
    assert.equal(histUndo(broken), broken);
    assert.equal(histRedo(broken), broken);
    assert.deepEqual(histPush(broken, 2), { past: [1], present: 2, future: [] });
  }
});

test('iou / normBox', () => {
  assert.equal(iou([0, 0, 10, 10], [0, 0, 10, 10]), 1);
  assert.equal(iou([0, 0, 10, 10], [5, 0, 15, 10]), 50 / 150);
  assert.equal(iou([0, 0, 10, 10], [10, 0, 20, 10]), 0, '只是挨着');
  assert.equal(iou([0, 0, 10, 10], [20, 20, 30, 30]), 0);
  assert.equal(iou([0, 0, 0, 10], [0, 0, 0, 10]), 0, '没有面积');
  assert.equal(iou([10, 10, 0, 0], [0, 0, 10, 10]), 1, '坐标写反也行');
  assert.equal(iou(null, [0, 0, 10, 10]), 0);
  assert.equal(iou([0, 0, NaN, 10], [0, 0, 10, 10]), 0);
  assert.ok(iou([0, 0, 100, 100], [2, 2, 102, 102]) > 0.85);
  assert.deepEqual(normBox([10, 20, 0, 5]), [0, 5, 10, 20]);
  const b = [1, 2, 3, 4];
  assert.deepEqual(normBox(b), b);
  assert.notEqual(normBox(b), b, '新数组');
  assert.equal(normBox([1, 2, 3]), null);
  assert.equal(normBox([1, 2, 3, Infinity]), null);
  assert.equal(normBox([1, 2, '3', 4]), null, '字符串不算数');
  assert.equal(normBox(null), null);
  assert.equal(normBox('abcd'), null);
});

test('空数据不报错：{}、缺数组、数组里有 null', () => {
  const holes = { rooms: [null, {}, { name: 'x', rects: [null, [1, 2]] }], openings: [null, {}], items: [null, {}, { kind: 'desk' }] };
  for (const geo of [{}, { rooms: null, openings: null, items: null }, holes]) {
    assert.deepEqual(boundaryEdges(geo), []);
    assert.equal(hitTest(geo, [10, 10]), null);
    assert.equal(hitTest(geo, [10, 10], { selected: { type: 'item', index: 0 } }), null);
    assert.equal(hitTest(geo, [10, 10], { selected: { type: 'room', index: 2, rect: 0 } }), null);
    assert.equal(hitTest(geo, [10, 10], { selected: { type: 'opening', index: 1 } }), null);
    assert.deepEqual(snapBox(geo, [0, 0, 10, 10], 8), { box: [0, 0, 10, 10], against: null });
    assert.equal(snapOpening(geo, [0, 0], [10, 0], Infinity), null);
    assert.equal(guessFacing(geo, [0, 0, 10, 10]), null);
    assert.deepEqual(renderGeo(geo).items, []);
    assert.equal(validateGeo(geo)[0].code, 'no-room');
    assert.ok(transformGeo(geo, 2, 2, 0, 0));
    assert.equal(newItemId(geo, 'low'), 'low-1');
    assert.equal(applyOp(geo, { type: 'confirmAll' }), geo);
    assert.equal(applyOp(geo, { type: 'removeItem', index: 9 }), geo);
  }
  assert.deepEqual(boundaryEdges(null), []);
  assert.equal(hitTest(null, [1, 1]), null);
  assert.equal(hitTest(room(), null), null);
  assert.equal(hitTest(room(), [NaN, 1]), null);
  assert.deepEqual(snapBox(null, [0, 0, 10, 10], 8), { box: [0, 0, 10, 10], against: null });
  assert.deepEqual(snapBox(room(), null, 8), { box: null, against: null });
  assert.equal(validateGeo(null)[0].code, 'no-room');
  assert.equal(transformGeo(null, 1, 1, 0, 0), null);
});

test('数据坏了（该是数组的地方不是数组）也不报错：transformGeo / applyOp 和别的函数一样当成空的', () => {
  const junk = [
    { rooms: 'abc', items: 'abc', openings: 'abc' },
    { rooms: {}, items: {}, openings: {} },
    { rooms: 5, items: true, openings: 5 },
    { rooms: [{ name: 'x', rects: 'abcd' }, { rects: {} }, 7, 'x'], items: [5, 'x'], openings: [5, 'x'] },
  ];
  for (const geo of junk) {
    const before = snapshot(geo);
    assert.deepEqual(transformGeo(geo, 2, 2, 1, 1), geo, '没有能换算的坐标：内容不变');
    assert.equal(applyOp(geo, { type: 'confirmAll' }), geo);
    assert.equal(applyOp(geo, { type: 'updateItem', index: 0, patch: { kind: 'low' } }), geo, '那一项不是对象：不改');
    assert.equal(applyOp(geo, { type: 'updateOpening', index: 0, patch: { a: 3 } }), geo);
    assert.equal(applyOp(geo, { type: 'setRoomName', room: 2, name: 'N' }), geo);
    assert.equal(applyOp(geo, { type: 'removeOpening', index: 9 }), geo);
    assert.equal(applyOp(geo, { type: 'setRoomRect', room: 0, rect: 0, box: [0, 0, 9, 9] }), geo);
    assert.equal(applyOp(geo, { type: 'removeRoomRect', room: 1, rect: 0 }), geo);
    assert.deepEqual(boundaryEdges(geo), []);
    assert.equal(hitTest(geo, [1, 1]), null);
    assert.equal(validateGeo(geo)[0].code, 'no-room');
    assert.ok(renderGeo(geo));
    assert.equal(newItemId(geo, 'low'), 'low-1');
    assert.deepEqual(geo, before, '不改原数据');
  }
  // 往坏数据里加东西：坏掉的那一项换成正常的数组
  assert.deepEqual(applyOp(junk[1], { type: 'addItem', item: { kind: 'low', box: [0, 0, 9, 9] } }).items, [{ kind: 'low', box: [0, 0, 9, 9], label: '', id: 'low-1' }]);
  assert.deepEqual(applyOp(junk[0], { type: 'addRoom', name: 'A', box: [0, 0, 9, 9] }).rooms, [{ name: 'A', rects: [[0, 0, 9, 9]] }]);
  assert.deepEqual(applyOp(junk[2], { type: 'addOpening', opening: { type: 'gap', side: 'top', a: 1, b: 9 } }).openings, [{ type: 'gap', side: 'top', a: 1, b: 9 }]);
  assert.deepEqual(applyOp(junk[3], { type: 'addRoomRect', room: 0, box: [0, 0, 9, 9] }).rooms[0], { name: 'x', rects: [[0, 0, 9, 9]] });
});

test('edit.js 导出的名字是约定好的那些；ES5 写法、只引用 geometry.js、末尾一行 export', () => {
  assert.deepEqual(Object.keys(edit).sort(), ['applyOp', 'boundaryEdges', 'dragRect', 'guessFacing', 'histInit', 'histPush', 'histRedo', 'histUndo', 'hitTest', 'iou', 'newItemId', 'normBox', 'renderGeo', 'snapBox', 'snapOpening', 'transformGeo', 'validateGeo']);
  const code = src('edit.js');
  const bare = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  assert.ok(!/=>/.test(bare), '不用箭头函数');
  assert.ok(!/`/.test(bare), '不用模板字符串');
  assert.ok(!/\b(let|const|class)\s/.test(bare), '不用 let / const / class');
  assert.ok(!/\.\.\./.test(bare), '不用展开运算符');
  assert.ok(!/\bfor\s*\([^)]*\sof\s/.test(bare), '不用 for-of');
  assert.ok(!/Object\.assign|Array\.from|\.includes\(|\.find\(|\.findIndex\(|Number\.isFinite|Math\.(sign|hypot|trunc)|\bDate\b|Math\.random|\bwindow\s*\.|\bdocument\s*\./.test(bare), '不用 ES6 的方法、不碰 DOM / 时间 / 随机数');
  assert.ok(!/function\s*\w*\s*\([^)]*=[^)]*\)/.test(bare), '不用默认参数');
  const real = [...code.matchAll(/^\s*import\s[^;]*from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(real, ['./geometry.js']);
  assert.ok(!/\bimport\b[^;]*\bas\b/.test(bare), '不改名引用');
  assert.equal((code.match(/^export\s*\{[^}]*\};?\s*$/gm) || []).length, 1, '只有一行 export');
  assert.ok(!/^export\s+(function|var|default)/m.test(code), '不在声明处 export');
  assert.ok(/export \{[^}]*\};\n$/.test(code), 'export 在最后一行');
});

test('applyOp setRoomFloor：木地板 / 瓷砖；没变就原样返回；不认识的值当木地板', () => {
  const g = { rooms: [{ name: 'BATH', rects: [[0, 0, 10, 10]] }], openings: [], items: [] };
  const t = applyOp(g, { type: 'setRoomFloor', room: 0, floor: 'tile' });
  assert.equal(t.rooms[0].floor, 'tile');
  assert.equal(g.rooms[0].floor, undefined, '不改原数据');
  assert.equal(applyOp(t, { type: 'setRoomFloor', room: 0, floor: 'tile' }), t);
  assert.equal(applyOp(g, { type: 'setRoomFloor', room: 0, floor: 'wood' }), g, '没写 = 木地板');
  assert.equal(applyOp(t, { type: 'setRoomFloor', room: 0, floor: 'carpet' }).rooms[0].floor, 'wood');
  assert.equal(applyOp(g, { type: 'setRoomFloor', room: 3, floor: 'tile' }), g);
});
