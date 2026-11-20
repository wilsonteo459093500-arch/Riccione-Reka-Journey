// 卧室：放了衣柜还放不放得下床（先留床位再放衣柜）
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { findBed, bedSizeFor, wardrobeZone, doorZone, windowBand, overlaps } from '../src/planner/bedFit.js';

const ROOM = [0, 0, 3000, 3400]; // 3.0 × 3.4 m 卧室

test('bedFit: empty 3.0 × 3.4 room takes a 1.5 × 2.0 bed with walkways', () => {
  const r = findBed(ROOM, [], [1500, 2000]);
  assert.ok(r);
  assert.deepEqual(bedSizeFor(ROOM), [1500, 2000]);
  assert.deepEqual(bedSizeFor([0, 0, 2600, 1900]), [1000, 2000]); // 小房间（1.9 m 宽）：退到单人床
  assert.equal(bedSizeFor([0, 0, 1500, 1500]), null);              // 连单人床都放不下：不判断
  assert.deepEqual(bedSizeFor([0, 0, 3600, 4600], { master: true }), [1800, 2000]);
});

test('bedFit: wardrobe on the short wall leaves room; wardrobe along the long wall that the bed needs → no bed', () => {
  // 衣柜放在下面短墙（3.0 m 墙中间 2.2 m）：床头贴上墙照样放得下
  const short = wardrobeZone([400, 2800, 2600, 3400], [0, -1]);
  assert.deepEqual(short, [400, 2200, 2600, 3400]);
  assert.ok(findBed(ROOM, [short], [1500, 2000]));
  // 2.6 × 3.4 房间，衣柜沿右边长墙：剩 2.0 m 宽，1.5 m 床 + 柜门前 0.6 m 放不下 → null
  const room = [0, 0, 2600, 3400];
  const body = [2000, 200, 2600, 2400];
  assert.equal(findBed(room, { bedAvoid: [wardrobeZone(body, [-1, 0])], walkAvoid: [body] }, [1500, 2000]), null);
  // 3.0 m 宽就放得下（床边到柜门还有 0.9 m）；走道可以经过柜门前面
  const wide = [0, 0, 3000, 3400], body2 = [2400, 200, 3000, 2400];
  assert.ok(findBed(wide, { bedAvoid: [wardrobeZone(body2, [-1, 0])], walkAvoid: [body2] }, [1500, 2000]));
});

test('bedFit: door zones go into the room on the right side; windows become a band on the wall', () => {
  assert.deepEqual(doorZone(ROOM, [2400, 0, 2900, 0]), [2400, 0, 2900, 800]);         // 上墙的门 → 往下
  assert.deepEqual(doorZone(ROOM, [3000, 1000, 3000, 1800]), [2200, 1000, 3000, 1800]); // 右墙的门 → 往左
  assert.equal(doorZone(ROOM, [1000, 1700, 1600, 1700]), null);                          // 房间中间：不是这间房的门
  assert.deepEqual(windowBand([0, 1000, 0, 2000]), [-250, 1000, 250, 2000]);
  assert.ok(overlaps([0, 0, 100, 100], [50, 50, 200, 200]));
  assert.ok(!overlaps([0, 0, 100, 100], [90, 0, 200, 100])); // 只贴边 1 cm：不算
});
