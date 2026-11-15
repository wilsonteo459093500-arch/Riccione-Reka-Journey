// 撤销 / 重做时保留生成字段（平面图、3D 户型图的坐标、立体图历史）
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { GENERATED_FIELDS, keepGenerated } from '../src/lib/generated.js';

test('keepGenerated：撤销回来的楼层带上当前的生成字段；别的字段按快照', () => {
  const current = { name: '新名字', floors: [{ id: 'f1', name: '一楼改', plan: 'asset:p', renders3d: ['asset:r'], plan3d: { geo: { rooms: [] } } }] };
  const restored = { name: '旧名字', floors: [{ id: 'f1', name: '一楼', renders3d: [] }] };
  const out = keepGenerated(current, restored);
  assert.equal(out.name, '旧名字');
  assert.equal(out.floors[0].name, '一楼', '普通字段按快照');
  assert.equal(out.floors[0].plan, 'asset:p');
  assert.deepEqual(out.floors[0].renders3d, ['asset:r']);
  assert.equal(out.floors[0].plan3d, current.floors[0].plan3d, '3D 户型图的坐标不被撤销');
  assert.deepEqual(restored.floors[0], { id: 'f1', name: '一楼', renders3d: [] }, '不改快照');
});

test('keepGenerated：快照里没有、但带着生成内容的楼层（后来才建的「整套」）也带过去', () => {
  const all = { id: 'floor-all', name: '整套', plan: 'asset:p', renders3d: ['asset:r'], render3dInfo: { 'asset:r': { view: 'top' } } };
  const current = { floors: [{ id: 'f1' }, all, { id: 'f3', name: '刚加的空楼层' }] };
  const restored = { floors: [{ id: 'f1' }] };
  const out = keepGenerated(current, restored);
  assert.deepEqual(out.floors.map((f) => f.id), ['f1', 'floor-all'], '空楼层照常被撤销，带着图的不丢');
  assert.equal(out.floors[1], all);
});

test('keepGenerated：没有要带的东西就原样返回快照；没有楼层也不报错', () => {
  const restored = { floors: [{ id: 'f1', plan: 'asset:p' }] };
  assert.equal(keepGenerated({ floors: [{ id: 'f1', plan: 'asset:p' }] }, restored), restored);
  assert.deepEqual(keepGenerated({}, {}), {});
  assert.ok(GENERATED_FIELDS.includes('plan3d') && GENERATED_FIELDS.includes('render3dInfo'));
});
