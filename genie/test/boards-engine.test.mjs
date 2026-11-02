// 溪岸板材 · 3D 这一侧（builder A）：登记表、材质对象、照片贴图怎么铺、MatLib 的钩子（显存账、淘汰、换画质、上下文丢失）。
// 全部用假的显卡 / 假的 ImageBitmap 在 Node 里跑（真的浏览器检查在 scratch 的 headless 脚本里）。板材都是这里编出来的（不是品牌的图）。
// 跑：node test/boards-engine.test.mjs

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CONFIG } from '../src/shared/config.js';
import { MATERIALS, MAT_BY_ID, SLOTS, fits, misfitHint, defaultSlotFor, registerBoards, unregisterBoards, BOARDS, boardsFor, onBoards, boardInfo } from '../src/shared/materials.js';
import {
  BOARD_SLOTS,
  boardMat,
  boardLabel,
  twinTex,
  photoSource,
  chipURL,
  addImageSource,
  boardPath,
  isColourCode,
  loadBoardImage,
  resetBoards,
  normRecord,
  netURL,
  TEST_ID_PREFIX,
} from '../src/shared/boards/library-api.js';
import { LIBRARY } from '../src/shared/boards/library.js';
import { bundledBoards, bundledLoaded } from '../src/shared/boards/bundled.js';
import { tagsOf } from '../src/shared/moods.js';
import { swatchURL } from '../src/shared/textures.js';
import { MatLib } from '../src/studio/engine/matlib.js';
import { BoardTextures } from '../src/studio/engine/boardTex.js';
import { photoUV, photoUVAt, tierDims, texBytes, partShift, shiftPartUV, partSize, SHEET, CLEAN } from '../src/studio/engine/boardUV.js';

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

console.log('溪岸板材 · 3D 引擎（boards-engine）');

// 合进真实板材之后测试也要是绿的：一开头把登记表清空（随网站的、这台设备的、贴图来源都拿掉），
// 这里编的板材一律用保留前缀 'sail-t-'（导入器永远不会给出这种 id，不会和真实的 sail-7 之类撞在一起）
resetBoards();
assert.equal(TEST_ID_PREFIX, 'sail-t-');

// ───────────── 编出来的板材（颜色 / 尺寸是假的，名字只用词表里的通用词） ─────────────
const rec = (id, o = {}) => ({
  id,
  rev: 1,
  seq: null,
  code: '',
  name: { zh: '测试木纹', en: 'Test wood' },
  kind: 'wood',
  finish: 'matte',
  hex: '#5E4433',
  dark: '#4C362A',
  light: 0.22,
  warm: 0.37,
  mood: [0.5, 0.1, 0.7],
  tags: ['darkwood'],
  mm: [1220, 2440],
  tiers: { 256: [128, 256], 1024: [512, 1024] },
  seam: { u: 'ok', v: 'fail' },
  uses: ['cabinetry', 'feature'],
  hash: `h-${id}`,
  near: 'walnut',
  ...o,
});

// 假的显卡：initTexture 记下来并像 three 一样在「上传完」时调 onUpdate
const uploaded = [];
const renderer = {
  capabilities: { getMaxAnisotropy: () => 16 },
  initTexture(t) {
    uploaded.push(t);
    t.onUpdate?.(t);
  },
};

// 假的 ImageBitmap（close 了记下来）
const bitmaps = [];
const decode = async (blob) => {
  const b = {
    width: blob.w,
    height: blob.h,
    closed: false,
    close() {
      this.closed = true;
    },
  };
  bitmaps.push(b);
  return b;
};

// 手动的「空闲」：settle() 把排着的空闲任务和 Promise 都跑完
const idleQ = [];
const idle = (fn) => idleQ.push(fn);
async function settle(rounds = 400) {
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setImmediate(r));
    if (idleQ.length) idleQ.splice(0).forEach((f) => f());
  }
}

// 网络：数一下有没有人去 fetch
let fetches = 0;
globalThis.fetch = async () => {
  fetches++;
  throw new Error('no network in tests');
};

// 本机贴图来源（像 boards/device.js 那样）
const DEVICE = new Map(); // id → hash
let blobCalls = 0;
let blobFail = new Set();
addImageSource({
  name: 'device',
  has: (id, hash) => DEVICE.has(id) && (!hash || DEVICE.get(id) === hash),
  blob: async (id, tier) => {
    blobCalls++;
    if (blobFail.has(id)) throw new Error('read failed');
    const m = MAT_BY_ID[id];
    const [w, h] = tier === 'chip' ? [128, 128] : tierDims(m, tier);
    return { w, h, tier };
  },
  chip: (id) => `blob:chip-${id}`,
});

function newLib(quality = 'fast') {
  const lib = new MatLib(renderer, quality);
  lib.boards = new BoardTextures(renderer, lib, {
    safe: quality === 'safe',
    decode,
    idle,
    fetchBlob: async () => {
      fetches++;
      throw new Error('offline');
    },
  });
  return lib;
}

// ───────────────────────────── 资料 ─────────────────────────────

await test('MATERIALS never contains a board (bundled or device); the shipped LIBRARY (any size) is valid and never uses the test prefix', async () => {
  for (const r of LIBRARY) {
    assert.ok(normRecord(r), `library record ${r?.id} normalises`);
    assert.ok(!String(r.id).startsWith(TEST_ID_PREFIX), `library id ${r.id} uses the reserved test prefix`);
  }
  assert.ok(!MATERIALS.some((m) => m.board), 'no board in MATERIALS at start');
  const before = MATERIALS.length;
  registerBoards([rec('sail-t-1')], { src: 'device' });
  assert.equal(MATERIALS.length, before);
  assert.ok(MAT_BY_ID['sail-t-1']?.board, 'board lands in MAT_BY_ID');
  assert.ok(!MATERIALS.some((m) => m.board));
});

await test('material object: same shape as a procedural material + board block; twin from the measured colours', () => {
  const m = MAT_BY_ID['sail-t-1'];
  for (const k of Object.keys(MATERIALS[0])) assert.ok(k in m, `missing ${k}`);
  assert.equal(m.cat, 'wood');
  assert.equal(m.color, '#5E4433');
  assert.deepEqual(m.tex, { type: 'wood', base: '#5E4433', grain: '#4C362A', species: 'oak' });
  assert.equal(m.rough, 0.62);
  assert.equal(m.clearcoat, 0);
  assert.equal(boardMat(rec('sail-t-9', { kind: 'solid', finish: 'gloss' })).clearcoat, 0.6);
  assert.equal(boardMat(rec('sail-t-9', { kind: 'solid' })).cat, 'paint');
  assert.equal(boardMat(rec('sail-t-9', { kind: 'stone' })).cat, 'stone');
  assert.deepEqual(twinTex({ kind: 'solid', hex: '#2D453D' }), { type: 'paint', base: '#2D453D', smooth: true });
  assert.equal(twinTex({ kind: 'wood', hex: '#5E4433', proc: 'walnut' }).species, 'walnut');
  assert.equal(twinTex({ kind: 'wood', hex: '#5E4433', name: { en: 'Black walnut' } }).species, 'walnut');
  assert.equal(boardMat({ id: 'bad id', kind: 'wood' }), null);
  assert.equal(boardMat({ id: 'sail-x', kind: 'plastic' }), null);
});

await test('labels: 序号 first, colour numbers are guest-visible, factory codes never in the label', () => {
  assert.deepEqual(boardLabel({ id: 'sail-7', seq: 7, code: 'XA-TP-01', name: { zh: '黑胡桃', en: 'Black walnut' } }), { zh: '7号 · 黑胡桃', en: 'No. 7 · Black walnut' });
  assert.deepEqual(boardLabel({ id: 'sail-c2810', code: '2810', name: { zh: '墨绿', en: 'Deep green' } }), { zh: '2810 · 墨绿', en: '2810 · Deep green' });
  assert.equal(boardLabel({ id: 'sail-cp1', code: 'P1', name: { zh: '白' } }).zh, 'P1 · 白');
  assert.equal(boardLabel({ id: 'sail-x1', code: 'AG337', name: { zh: '檀雾橡' } }).zh, '檀雾橡');
  assert.equal(boardLabel({ id: 'sail-x2', code: 'XA-TP-01', name: { zh: '木皮' } }).zh, '木皮');
  assert.ok(isColourCode('6162') && isColourCode('P1') && !isColourCode('GKL018Y') && !isColourCode('XA-TP-01'));
  assert.equal(boardPath('sail-7', 1024), 'sail-7/1024.webp');
  assert.equal(boardPath('sail-7', 'chip'), 'sail-7/chip.webp');
});

await test('fits: boards only on cabinetry + feature (R1), weave nowhere (R6), stone-look only on the wall panel', () => {
  assert.deepEqual(BOARD_SLOTS, ['cabinetry', 'feature']);
  registerBoards([rec('sail-t-2', { kind: 'weave', uses: ['cabinetry'] }), rec('sail-t-3', { kind: 'stone', uses: undefined }), rec('sail-t-4', { kind: 'solid' })], { src: 'device' });
  for (const s of SLOTS) {
    assert.equal(fits('sail-t-1', s.id), BOARD_SLOTS.includes(s.id), `wood board on ${s.id}`);
    assert.equal(fits('sail-t-2', s.id), false, `weave on ${s.id}`);
    assert.equal(fits('sail-t-3', s.id), s.id === 'feature', `stone-look on ${s.id}`);
    assert.equal(fits('sail-t-4', s.id), BOARD_SLOTS.includes(s.id), `solid board on ${s.id}`);
  }
  assert.equal(fits('sail-t-1', 'woodwork'), false);
  assert.match(misfitHint('sail-t-1', 'woodwork'), /溪岸板材|sAil/);
  assert.equal(defaultSlotFor('sail-t-1'), 'cabinetry');
  assert.equal(defaultSlotFor('walnut'), 'floor');
  assert.ok(!boardsFor().some((m) => m.board.kind === 'weave'));
  assert.ok(boardsFor('feature').some((m) => m.id === 'sail-t-3') && !boardsFor('cabinetry').some((m) => m.id === 'sail-t-3'));
});

await test('registry: higher rev wins, tie keeps the bundled copy, unregister falls back, listeners fire', () => {
  let fired = 0;
  const off = onBoards(() => fired++);
  registerBoards([rec('sail-t-5', { name: { zh: '旧', en: 'old' } })], { src: 'bundled' });
  registerBoards([rec('sail-t-5', { name: { zh: '本机', en: 'device' } })], { src: 'device' });
  assert.equal(MAT_BY_ID['sail-t-5'].board.src, 'bundled');
  registerBoards([rec('sail-t-5', { rev: 2, name: { zh: '新', en: 'new' } })], { src: 'device' });
  assert.equal(MAT_BY_ID['sail-t-5'].board.src, 'device');
  assert.equal(MAT_BY_ID['sail-t-5'].board.name.zh, '新');
  unregisterBoards(['sail-t-5'], { src: 'device' });
  assert.equal(MAT_BY_ID['sail-t-5'].board.src, 'bundled');
  unregisterBoards(['sail-t-5'], { src: 'bundled' });
  assert.equal(MAT_BY_ID['sail-t-5'], undefined);
  assert.ok(!BOARDS.some((m) => m.id === 'sail-t-5'));
  assert.ok(fired >= 4);
  off();
  const r = registerBoards([{ id: 'NOPE', kind: 'wood' }, rec('sail-t-6'), rec('sail-t-7', { hex: undefined })], { src: 'device' });
  assert.deepEqual(r.skipped, ['NOPE', 'sail-t-7'], 'bad id / no measured colour → skipped');
  const m6 = MAT_BY_ID['sail-t-6'];
  let again = 0;
  const off2 = onBoards(() => again++);
  const r2 = registerBoards([rec('sail-t-6')], { src: 'device' });
  off2();
  assert.deepEqual([r2.added, r2.updated, again], [[], [], 0], 'registering the same record again changes nothing');
  assert.equal(MAT_BY_ID['sail-t-6'], m6, 'same material object');
});

await test('no-go tags, swatch chip and designer info come from the board block', () => {
  assert.deepEqual([...tagsOf(MAT_BY_ID['sail-t-1'])], ['darkwood']);
  DEVICE.set('sail-t-1', 'h-sail-t-1');
  assert.equal(swatchURL('sail-t-1', 96), 'blob:chip-sail-t-1');
  DEVICE.delete('sail-t-1');
  const info = boardInfo('sail-t-1');
  assert.equal(info.label.zh, MAT_BY_ID['sail-t-1'].zh);
  assert.equal(typeof info.url, 'function');
});

await test('image sources (R10 / R11 c): device first (same id + dHash), network only with base + img, meta-only = none; photo:false kills both', () => {
  registerBoards([rec('sail-t-m1', { img: false }), rec('sail-t-n1')], { src: 'bundled' });
  assert.equal(photoSource('sail-t-m1'), null, 'meta-only, no device copy');
  assert.equal(chipURL('sail-t-m1'), null);
  assert.equal(photoSource('sail-t-n1').name, 'net');
  assert.equal(chipURL('sail-t-n1'), `${CONFIG.boards.base}sail-t-n1/chip.webp?v=h-sail-t`, 'network chip carries the picture version (dHash fallback)');
  DEVICE.set('sail-t-m1', 'h-sail-t-m1');
  assert.equal(photoSource('sail-t-m1').name, 'device', 'meta-only bundled record keeps the device images');
  DEVICE.set('sail-t-m1', 'other-hash');
  assert.equal(photoSource('sail-t-m1'), null, 'different picture under the same id is not used');
  DEVICE.delete('sail-t-m1');
  const base = CONFIG.boards.base;
  CONFIG.boards.base = '';
  assert.equal(photoSource('sail-t-n1'), null);
  CONFIG.boards.base = base;
  CONFIG.boards.photo = false;
  DEVICE.set('sail-t-n1', 'h-sail-t-n1');
  assert.equal(photoSource('sail-t-n1'), null);
  assert.equal(chipURL('sail-t-n1'), null);
  CONFIG.boards.photo = true;
  DEVICE.delete('sail-t-n1');
  assert.equal(photoSource('sail-t-2'), null, 'weave never loads a photo');
});

// ───────────────────────────── 怎么铺 ─────────────────────────────

await test('UV (R3 / R5): a 600 mm door centred on a 1220 mm board samples u ∈ [0.25, 0.75]; bottom of the part = bottom of the scan', () => {
  const m = MAT_BY_ID['sail-t-1'];
  const [u0, v0] = photoUVAt(m, -0.3, 0);
  const [u1, v1] = photoUVAt(m, 0.3, 2.44);
  assert.ok(Math.abs(u0 - (0.5 - 0.3 / 1.22)) < 1e-9 && u0 > 0.25 && u1 < 0.75, `${u0} … ${u1}`);
  // ImageBitmap 不翻转：贴图 t = 0 是图的第一行（最上面）→ 零件的底边（v = 0）要落在 t = 1（图的最下面一行）
  assert.equal(v0, 1);
  assert.ok(Math.abs(v1) < 1e-9);
  const uv = photoUV(m);
  assert.deepEqual(uv.offset, [0.5, 1]);
  assert.equal(uv.wrapT, 'mirror');
  assert.equal(uv.wrapS, 'repeat');
  assert.equal(photoUV(boardMat(rec('sail-t-9', { seam: { u: 'fail', v: 'ok' } }))).wrapS, 'mirror', 'across seam the importer could not fix → mirror across too');
  // 非方形尺寸：横纹、顺纹各自按毫米
  const sq = boardMat(rec('sail-t-9', { mm: [1133, 2440] }));
  assert.ok(Math.abs(photoUV(sq).repeat[0] - 1 / 1.133) < 1e-9);
});

await test('mirrored along the grain: a 2.8 m wall panel has no step at the 2.44 m line (raw repeat would)', () => {
  // 一条顺纹方向不能平铺的「图」：从下到上亮度 0 → 1（真实扫描图的上下两端就是对不上）
  const img = (t) => 1 - t; // t = 0 在图的最上面
  const mirror = (t) => {
    const f = ((t % 2) + 2) % 2;
    return f <= 1 ? f : 2 - f;
  };
  const repeat = (t) => ((t % 1) + 1) % 1;
  const m = MAT_BY_ID['sail-t-1'];
  const sample = (y, wrap) => img(wrap(photoUVAt(m, 0, y)[1]));
  const e = 1e-4;
  const stepMirror = Math.abs(sample(2.44 + e, mirror) - sample(2.44 - e, mirror));
  const stepRepeat = Math.abs(sample(2.44 + e, repeat) - sample(2.44 - e, repeat));
  assert.ok(stepMirror < 1e-3, `mirror step ${stepMirror}`);
  assert.ok(stepRepeat > 0.9, `repeat step ${stepRepeat}`);
  // 2.8m 高也一样连续
  let worst = 0;
  for (let y = 0; y < 2.8; y += 0.001) worst = Math.max(worst, Math.abs(sample(y + 0.001, mirror) - sample(y, mirror)));
  assert.ok(worst < 0.01, `largest step ${worst}`);
});

await test('tier dims + GPU bytes (R10): 256-along / 1024-along; a 2:1 wood board = 2.80 MB on the GPU at 1024', () => {
  const m = MAT_BY_ID['sail-t-1'];
  assert.deepEqual(tierDims(m, 1024), [512, 1024]);
  assert.deepEqual(tierDims(m, 256), [128, 256]);
  assert.deepEqual(tierDims(boardMat(rec('sail-t-9', { tiers: {}, mm: [600, 600] })), 1024), [1024, 1024]);
  assert.equal(Math.round(texBytes(512, 1024) / 1e4) / 100, 2.8);
  assert.ok(texBytes(512, 1024) < ((512 * 512 * 4 * 4) / 3) * 3, 'cheaper than a procedural 512 set');
});

// ───────────────────────────── MatLib + BoardTextures ─────────────────────────────

const PROC_KEYS = ['map', 'normal', 'orm', 'size', 'rotation', 'R', 'full', 'key', 'matId', 'variant', 'res', 'used'];

await test('meta-only board (R9 a): MatLib takes the normal procedural path of the twin at full resolution, zero fetches', async () => {
  const lib = newLib('fast');
  const f0 = fetches;
  const b0 = blobCalls;
  lib.apply('cabinetry', 'sail-t-m1');
  const e = lib.tex.get(lib.slots.cabinetry.userData.texKey);
  assert.ok(!e.photo, 'not a photo entry');
  assert.equal(e.key, 'sail-t-m1|veneer|512');
  for (let i = 0; i < 60 && !e.full; i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(e.full, 'full-resolution procedural twin');
  assert.equal(e.R, 512);
  assert.equal(fetches, f0);
  assert.equal(blobCalls, b0);
  assert.equal(await loadBoardImage('sail-t-m1', 1024), null);
  assert.equal(fetches, f0, 'loadBoardImage does not fetch a meta-only board either');
  lib.dispose();
});

await test('photo board: twin at once → 256 preview → 1024 full, swapped in place; sRGB, mipmaps, anisotropy, mirrored along, ImageBitmaps closed', async () => {
  DEVICE.set('sail-t-1', 'h-sail-t-1');
  const lib = newLib('fast');
  const m = lib.slots.cabinetry;
  lib.apply('cabinetry', 'white-oak');
  const v0 = m.version;
  lib.apply('cabinetry', 'sail-t-1');
  const e = lib.tex.get(m.userData.texKey);
  assert.ok(e.photo);
  assert.equal(e.state, 'twin');
  assert.ok(m.map.isDataTexture, 'twin is procedural (DataTexture) right away');
  for (const k of PROC_KEYS) assert.ok(k in e, `entry has ${k}`);
  await settle();
  assert.equal(e.state, 'full');
  assert.equal(e.px, 1024);
  assert.ok(e.full);
  const t = m.map;
  assert.ok(!t.isDataTexture && t.userData.board === 'sail-t-1');
  assert.equal(t.colorSpace, THREE.SRGBColorSpace);
  assert.equal(t.flipY, false);
  assert.equal(t.generateMipmaps, true);
  assert.equal(t.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(t.anisotropy, lib.aniso);
  assert.equal(lib.aniso, 4);
  assert.equal(t.wrapS, THREE.RepeatWrapping);
  assert.equal(t.wrapT, THREE.MirroredRepeatWrapping);
  assert.ok(Math.abs(t.repeat.x - 1 / 1.22) < 1e-9 && Math.abs(t.repeat.y + 1 / 2.44) < 1e-9);
  assert.deepEqual([t.offset.x, t.offset.y], [0.5, 1]);
  assert.equal(m.normalMap.userData.shared, 'flat');
  assert.equal(m.normalMap.colorSpace, THREE.NoColorSpace);
  assert.ok(m.roughnessMap.userData.shared && m.aoMap === m.roughnessMap);
  assert.equal(m.roughnessMap.image.data[1], Math.round(0.62 * 255));
  assert.equal(m.normalScale.x, 1);
  assert.equal(m.version, v0 + 0, 'no material recompile: procedural → board keeps the same shader switches');
  lib.apply('cabinetry', 'white-oak');
  assert.equal(m.version, v0, 'board → procedural: still no recompile');
  assert.ok(
    bitmaps.every((b) => b.closed),
    'every decoded bitmap closed after upload',
  );
  assert.equal(lib.boards.stats().bitmaps, 0);
  assert.equal(e.bytes, texBytes(512, 1024));
  lib.dispose();
});

await test('staff edits that do not change the picture (star, name → rev + 1) reuse the loaded texture; a new picture (dHash) loads again', async () => {
  registerBoards([rec('sail-t-r1')], { src: 'device' });
  DEVICE.set('sail-t-r1', 'h-sail-t-r1');
  const lib = newLib('fast');
  lib.apply('cabinetry', 'sail-t-r1');
  await settle();
  const key = lib.slots.cabinetry.userData.texKey;
  const b0 = blobCalls;
  registerBoards([rec('sail-t-r1', { rev: 2, fav: true, name: { zh: '改名', en: 'renamed' } })], { src: 'device' });
  lib.apply('cabinetry', 'white-oak');
  lib.apply('cabinetry', 'sail-t-r1');
  await settle();
  assert.equal(lib.slots.cabinetry.userData.texKey, key);
  assert.equal(blobCalls, b0, 'no re-read');
  registerBoards([rec('sail-t-r1', { rev: 3, hash: 'h-new' })], { src: 'device' });
  DEVICE.set('sail-t-r1', 'h-new');
  lib.apply('cabinetry', 'white-oak');
  lib.apply('cabinetry', 'sail-t-r1');
  await settle();
  assert.notEqual(lib.slots.cabinetry.userData.texKey, key);
  assert.ok(blobCalls > b0);
  lib.dispose();
});

await test('same board on two slots shares one texture set (slot-independent key)', async () => {
  const lib = newLib('fast');
  lib.apply('cabinetry', 'sail-t-1');
  lib.apply('feature', 'sail-t-1');
  assert.equal(lib.slots.cabinetry.userData.texKey, lib.slots.feature.userData.texKey);
  await settle();
  assert.equal(lib.slots.cabinetry.map, lib.slots.feature.map);
  lib.dispose();
});

await test('trim (R9 b): photo entries go through boards.evict — shared flat normal / ORM never disposed, in-use never evicted, budget + MAX_SETS kept', async () => {
  const ids = [];
  for (let i = 0; i < 30; i++) {
    const id = `sail-t-lru${i}`;
    ids.push(id);
    DEVICE.set(id, `h-${id}`);
  }
  registerBoards(
    ids.map((id) => rec(id)),
    { src: 'device' },
  );
  const lib = newLib('fast');
  const flat = lib.boards.flat;
  let sharedDisposed = 0;
  flat.addEventListener('dispose', () => sharedDisposed++);
  lib.apply('feature', 'sail-t-1');
  await settle(60);
  for (const t of lib.boards.orms.values()) t.addEventListener('dispose', () => sharedDisposed++);
  let photoDisposed = 0;
  for (const id of ids) {
    lib.apply('cabinetry', id);
    await settle(40);
    lib.slots.cabinetry.map.addEventListener('dispose', () => photoDisposed++);
  }
  assert.equal(sharedDisposed, 0);
  assert.ok(photoDisposed > 0, 'evicted board textures were released');
  assert.ok(lib.tex.size <= 20, `sets ${lib.tex.size}`);
  const st = lib.stats();
  assert.ok(st.mb <= 104, `${st.mb} MB`);
  assert.ok(lib.tex.has(lib.slots.feature.userData.texKey), 'in-use board kept');
  assert.equal(lib.slots.feature.map.userData.board, 'sail-t-1');
  assert.ok(lib.slots.cabinetry.map.userData.board === ids.at(-1));
  assert.equal(lib.boards.stats().bitmaps, 0, 'no ImageBitmap left open');
  lib.dispose();
});

await test('GPU accounting: 10 boards switched on 2 slots stays inside the iPad budget; a board in use costs less than the procedural set it replaces', async () => {
  const lib = newLib('fast');
  const inUseMB = () => {
    let b = 0;
    for (const e of lib.tex.values()) if (lib.inUse(e.key)) b += e.bytes ?? ((e.R * e.R * 4 * 4) / 3) * 3;
    return b / 1e6;
  };
  for (const s of SLOTS) lib.apply(s.id, MATERIALS.find((m) => fits(m.id, s.id)).id);
  lib.apply('cabinetry', 'walnut'); // 柜体、主题墙各自一套程序化贴图（不和木作家具共用），才看得出换成板材省了多少
  lib.apply('feature', 'teak');
  for (let i = 0; i < 400 && (lib.queue.length || [...lib.tex.values()].some((e) => lib.inUse(e.key) && !e.full)); i++) await new Promise((r) => setTimeout(r, 15));
  const before = inUseMB();
  for (let i = 0; i < 10; i++) {
    lib.apply(i % 2 ? 'feature' : 'cabinetry', `sail-t-lru${i}`);
    await settle(30);
  }
  const st = lib.stats();
  assert.ok(st.mb <= 104, `total ${st.mb} MB (in use + recently used, iPad budget 104 MB)`);
  assert.ok(lib.tex.size <= 20);
  const after = inUseMB();
  assert.ok(after < before, `in use ${before.toFixed(1)} → ${after.toFixed(1)} MB`);
  lib.dispose();
});

await test('setQuality (R9 c / f): photo textures are never re-uploaded in place; new anisotropy comes with a reload; safe → 256 (lean)', async () => {
  const lib = newLib('fast');
  const m = lib.slots.cabinetry;
  lib.apply('cabinetry', 'sail-t-1');
  await settle();
  const t = m.map;
  const ver = t.version;
  lib.setQuality('high');
  assert.equal(t.version, ver, 'not flagged needsUpdate (its bitmap is closed)');
  await settle();
  assert.notEqual(m.map, t);
  assert.equal(m.map.anisotropy, 16);
  assert.equal(lib.tex.get(m.userData.texKey).px, 1024);
  lib.setQuality('fast', { safe: true });
  await settle();
  const e = lib.tex.get(m.userData.texKey);
  assert.equal(lib.boards.tier(), 'lean');
  assert.equal(e.px, 256);
  assert.equal(e.bytes, texBytes(128, 256));
  lib.setQuality('fast', { safe: false });
  await settle();
  assert.equal(lib.tex.get(m.userData.texKey).px, 1024, 'back to full when safe is left');
  lib.dispose();
  const safeLib = newLib('safe');
  assert.equal(safeLib.boards.tier(), 'lean');
  safeLib.apply('cabinetry', 'sail-t-1');
  await settle();
  assert.equal(safeLib.tex.get(safeLib.slots.cabinetry.userData.texKey).px, 256);
  safeLib.dispose();
});

await test('context lost (R9 d): no slot keeps a photo texture, unused boards dropped, then restored at 256 only', async () => {
  const lib = newLib('fast');
  lib.apply('cabinetry', 'sail-t-1');
  lib.apply('feature', 'sail-t-lru1');
  await settle();
  lib.apply('feature', 'sail-t-lru2');
  await settle(3); // 还在读的时候丢了
  const unusedKey = [...lib.tex.values()].find((e) => e.photo && e.matId === 'sail-t-lru1').key;
  lib.boards.onContextLost();
  for (const s of Object.values(lib.slots)) assert.ok(!s.map || !s.map.userData?.board, `${s.userData.slot} still holds a photo`);
  assert.ok(lib.slots.cabinetry.map.isDataTexture, 'twin (re-uploadable DataTexture)');
  assert.ok(!lib.tex.has(unusedKey), 'unused board dropped');
  assert.ok(![...lib.tex.values()].some((e) => e.photo && e.state !== 'twin'));
  await settle();
  assert.ok(!lib.slots.feature.map.userData?.board, 'a load that finished after the loss is thrown away');
  assert.equal(lib.boards.stats().bitmaps, 0);
  lib.boards.onContextRestored();
  await settle();
  assert.equal(lib.tex.get(lib.slots.cabinetry.userData.texKey).px, 256);
  assert.equal(lib.tex.get(lib.slots.feature.userData.texKey).px, 256);
  lib.dispose();
});

await test('context-loss lean flag (genie.boardsLean): only a fresh stamp (< 15 min) starts a new engine at 256; a stale stamp, the old "1" or none → 1024; this engine stays lean after its own loss', async () => {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const pxOn = async (lib) => {
    lib.apply('cabinetry', 'sail-t-1');
    await settle();
    return lib.tex.get(lib.slots.cabinetry.userData.texKey).px;
  };
  try {
    const cases = [
      ['none', null, 'full', 1024],
      ['legacy "1" (older build, no time)', '1', 'full', 1024],
      ['stale (16 min ago)', String(Date.now() - 16 * 60e3), 'full', 1024],
      ['fresh (1 min ago)', String(Date.now() - 60e3), 'lean', 256],
      ['garbage', 'abc', 'full', 1024],
    ];
    for (const [name, v, tier, px] of cases) {
      if (v == null) store.delete('genie.boardsLean');
      else store.set('genie.boardsLean', v);
      const lib = newLib('fast');
      assert.equal(lib.boards.tier(), tier, name);
      assert.equal(await pxOn(lib), px, name);
      lib.dispose();
    }
    // 自己丢一次：记下现在的时间；这个引擎之后一直 256（恢复以后也是）
    store.delete('genie.boardsLean');
    const lib = newLib('fast');
    assert.equal(await pxOn(lib), 1024);
    const t0 = Date.now();
    lib.boards.onContextLost();
    const stamp = Number(store.get('genie.boardsLean'));
    assert.ok(stamp >= t0 - 5 && stamp <= Date.now() + 5, `stamp ${store.get('genie.boardsLean')}`);
    lib.boards.onContextRestored();
    await settle();
    assert.equal(lib.boards.tier(), 'lean');
    lib.setQuality('high');
    await settle();
    assert.equal(lib.boards.tier(), 'lean', 'a tier change does not undo the loss for this engine');
    assert.equal(lib.tex.get(lib.slots.cabinetry.userData.texKey).px, 256);
    lib.dispose();
    const next = newLib('fast');
    assert.equal(next.boards.tier(), 'lean', 'reload within 15 min → still careful');
    next.dispose();
    // 许愿模式「下一位客人」删掉它（WishShell restartChild）→ 新客人从 1024 开始
    store.delete('genie.boardsLean');
    const guest = newLib('fast');
    assert.equal(guest.boards.tier(), 'full');
    guest.dispose();
  } finally {
    delete globalThis.sessionStorage;
  }
  const fs = await import('node:fs');
  const shell = fs.readFileSync(new URL('../src/wish/WishShell.jsx', import.meta.url), 'utf8');
  assert.match(shell, /sessionStorage\.removeItem\('genie\.boardsLean'\)/, 'next guest clears the flag');
});

await test('walk-in paint scan (wt-walk contract): swapEntry calls refreshOld on EVERY slot, so a scan still pinning a board the slot has moved on from gets the new textures, never the disposed twin', async () => {
  const lib = newLib('fast');
  // wt-walk paintScan.refreshOld：只换 key 一样的旧的一面
  const mkScan = () => {
    const api = {
      old: null,
      calls: 0,
      refreshOld(o) {
        api.calls++;
        if (api.old && o && api.old.key === o.key) api.old = { ...api.old, map: o.map, normal: o.normal, orm: o.orm };
      },
    };
    return api;
  };
  lib.scans = { cabinetry: mkScan(), feature: mkScan() };
  // wt-walk 的 MatLib.isPinned：扫描钉着的 key 不淘汰（这个分支没有它，boardTex 用 lib.isPinned?.()）
  lib.isPinned = (key) => Object.values(lib.scans).some((sc) => sc.old?.key === key);
  lib.apply('cabinetry', 'sail-t-1');
  const e = lib.tex.get(lib.slots.cabinetry.userData.texKey);
  assert.equal(e.state, 'twin');
  // 扫描把板材的这一套钉成「旧的一面」，客人马上又点了程序化的木纹（照片还在读）
  lib.scans.cabinetry.old = { key: e.key, map: e.map, normal: e.normal, orm: e.orm };
  const twinMap = e.map;
  let twinDisposed = 0;
  twinMap.addEventListener('dispose', () => twinDisposed++);
  lib.apply('cabinetry', 'walnut');
  assert.notEqual(lib.slots.cabinetry.userData.texKey, e.key, 'slot moved on');
  await settle();
  assert.equal(e.state, 'full', 'the board finished loading after the slot moved on');
  assert.ok(twinDisposed > 0, 'its twin was disposed');
  assert.ok(lib.scans.cabinetry.calls >= 2, `refreshOld calls on the moved-on slot: ${lib.scans.cabinetry.calls}`);
  assert.notEqual(lib.scans.cabinetry.old.map, twinMap, 'scan does not keep the disposed twin');
  assert.equal(lib.scans.cabinetry.old.map.userData.board, 'sail-t-1', 'scan old side = the photo');
  assert.equal(lib.scans.feature.old, null, 'other slots: refreshOld is a no-op for keys they do not pin');
  // 上下文丢失也走同一条路：钉着的旧一面换回近似色（DataTexture），不留已经释放的照片
  lib.boards.onContextLost();
  assert.ok(!lib.scans.cabinetry.old.map.userData?.board, 'after a context loss the pinned side is the twin, not a dropped photo');
  delete lib.scans;
  delete lib.isPinned;
  lib.dispose();
});

await test('a board that cannot be read stays on its twin (then full-res procedural), records why, never throws', async () => {
  registerBoards([rec('sail-t-f1')], { src: 'device' });
  DEVICE.set('sail-t-f1', 'h-sail-t-f1');
  blobFail.add('sail-t-f1');
  const lib = newLib('fast');
  lib.apply('cabinetry', 'sail-t-f1');
  await settle();
  const e = lib.tex.get(lib.slots.cabinetry.userData.texKey);
  assert.equal(e.state, 'twin');
  assert.equal(e.twinR, 512, 'upgraded to the full-resolution procedural twin');
  assert.ok(lib.slots.cabinetry.map.isDataTexture);
  assert.match(lib.boards.stats().reason, /sail-t-f1/);
  assert.ok(e.full, 'settled (seed renders / stage do not wait forever)');
  blobFail.delete('sail-t-f1');
  lib.dispose();
});

await test('network board that fails (offline / 404): quiet twin, one attempt, no retry storm', async () => {
  const lib = newLib('fast');
  const f0 = fetches;
  lib.apply('cabinetry', 'sail-t-n1');
  await settle();
  const e = lib.tex.get(lib.slots.cabinetry.userData.texKey);
  assert.ok(e.photo && e.state === 'twin');
  assert.equal(fetches, f0 + 1, 'one attempt, then backoff');
  lib.apply('cabinetry', 'white-oak');
  lib.apply('cabinetry', 'sail-t-n1');
  await settle();
  assert.equal(fetches, f0 + 1, 'no retry storm within 30 s');
  registerBoards([rec('sail-t-n2')], { src: 'bundled' });
  lib.apply('feature', 'sail-t-n2');
  await settle();
  assert.equal(fetches, f0 + 1, 'network marked down: another board does not try either');
  assert.equal(lib.tex.get(lib.slots.feature.userData.texKey).state, 'twin');
  lib.boards.onOnline();
  await settle();
  assert.equal(fetches, f0 + 3, 'back online: the boards in use try again once');
  lib.dispose();
});

await test('a project that names a board this device does not have: no untextured grey slot — current or first fitting procedural material stands in; it applies for real once registered', async () => {
  const lib = newLib('fast');
  lib.applyAll({ cabinetry: 'sail-t-unknown-1', feature: 'walnut', floor: 'sail-t-nope' });
  assert.equal(lib.current.cabinetry, 'white-oak', 'first procedural wood that fits cabinetry');
  assert.ok(lib.slots.cabinetry.map, 'textured');
  assert.equal(lib.current.floor, 'white-oak');
  lib.applyAll({ cabinetry: 'cherry' });
  lib.applyAll({ cabinetry: 'sail-t-unknown-1' });
  assert.equal(lib.current.cabinetry, 'cherry', 'keeps what the slot already shows');
  registerBoards([rec('sail-t-unknown-1')], { src: 'device' });
  lib.applyAll({ cabinetry: 'sail-t-unknown-1' });
  assert.equal(lib.current.cabinetry, 'sail-t-unknown-1', 'registered → applied');
  lib.applyAll({ walls: 'no-such-paint' });
  assert.equal(lib.current.walls, undefined, 'other unknown ids behave as before (ignored)');
  lib.dispose();
});

await test('kill switch CONFIG.boards.photo = false: every board renders as its procedural twin, no reads', async () => {
  CONFIG.boards.photo = false;
  const lib = newLib('fast');
  const b0 = blobCalls;
  lib.apply('cabinetry', 'sail-t-1');
  const e = lib.tex.get(lib.slots.cabinetry.userData.texKey);
  assert.ok(!e.photo);
  assert.equal(e.key, 'sail-t-1|veneer|512');
  await settle(10);
  assert.equal(blobCalls, b0);
  CONFIG.boards.photo = true;
  lib.dispose();
});

await test('evicting a board with a decoded-but-not-uploaded bitmap closes it; dispose releases everything but nothing shared twice', async () => {
  const lib = newLib('fast');
  lib.apply('cabinetry', 'sail-t-lru5');
  await settle(4);
  const e = lib.tex.get(lib.slots.cabinetry.userData.texKey);
  lib.apply('cabinetry', 'white-oak');
  lib.boards.evict(e);
  await settle();
  assert.equal(lib.boards.stats().bitmaps, 0);
  assert.ok(!lib.tex.has(e.key));
  lib.dispose();
  assert.equal(lib.tex.size, 0);
});

await test('door grain variety (P1, §2.8): each part on cabinetry / feature gets its own fixed slice inside the clean middle of the sheet; same item id → same slices; shuffle:false → centred as before; other slots untouched', async () => {
  const sheet = { board: { mm: [1220, 2440] } };
  const room600 = (CLEAN.across * SHEET.across - 0.6) / 2;
  const m = CLEAN.along * SHEET.along;
  for (let i = 0; i < 300; i++) {
    const [du, dv] = partShift(`w${i}|${i * 600},0,0`, 0.6, 2.4);
    assert.ok(Math.abs(du) <= room600 + 1e-9, `du ${du}`);
    assert.equal(dv, 0, 'a full-height door keeps its bottom on the bottom of the board (no mirror line on the door)');
    const u0 = photoUVAt(sheet, -0.3 + du, 0)[0];
    const u1 = photoUVAt(sheet, 0.3 + du, 0)[0];
    assert.ok(u0 >= 0.12 - 1e-9 && u1 <= 0.88 + 1e-9, `600 mm door samples u ${u0.toFixed(3)}–${u1.toFixed(3)} (clean middle 76 %)`);
    const [, dv2] = partShift(`k${i}`, 0.6, 0.7);
    assert.ok(dv2 >= m - 1e-9 && dv2 + 0.7 <= SHEET.along - m + 1e-9, `0.7 m door v ${dv2}`);
  }
  assert.deepEqual(partShift('a|1', 0.6, 0.7), partShift('a|1', 0.6, 0.7), 'deterministic');
  assert.deepEqual(partShift('a|1', 1.0, 2.4), [0, 0], 'wider than the clean middle → centred, as before');
  const dus = new Set(Array.from({ length: 12 }, (_, i) => partShift(`w-1|${i * 600},0,300`, 0.6, 2.4)[0].toFixed(3)));
  assert.ok(dus.size >= 10, `12 doors in a row → ${dus.size} different slices`);
  const left = Array.from({ length: 200 }, (_, i) => partShift(`s${i}`, 0.6, 2.4)[0]).filter((d) => d < 0).length;
  assert.ok(left > 60 && left < 140, `both sides of the centre are used (${left} / 200 left)`);
  // 建一件真的衣柜：柜体的 UV 按家具 id 挪；同一个 id 每次一样；关掉 = 以前的样子；别的表面不动
  const { buildItem, useLib } = await import('../src/studio/engine/furniture.js');
  const fixed = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? t[k] || (t[k] = new THREE.MeshStandardMaterial()) : undefined) });
  const slots = {};
  useLib({ quality: 'fast', slot: (k) => slots[k] || (slots[k] = Object.assign(new THREE.MeshStandardMaterial(), { userData: { slot: k } })), fixed });
  const uvOf = (id, kind = 'wardrobe', slot = 'cabinetry') => {
    const g = buildItem({ id, kind, x: 0, z: 0, w: 2.4, d: 0.6, h: 2.6 }, { wallH: 2.8 });
    const out = [];
    g.traverse((o) => o.isMesh && o.userData.slot === slot && out.push(...o.geometry.attributes.uv.array));
    assert.ok(out.length, `${kind} has ${slot} parts`);
    return out;
  };
  const a = uvOf('w-1');
  assert.deepEqual(uvOf('w-1'), a, 'same item id → same slices (saved projects / share links open the same)');
  assert.notDeepEqual(uvOf('w-2'), a, 'two identical wardrobes side by side do not look stamped');
  CONFIG.boards.shuffle = false;
  const off1 = uvOf('w-1');
  const off2 = uvOf('w-2');
  CONFIG.boards.shuffle = true;
  assert.deepEqual(off1, off2, 'shuffle off → every wardrobe identical (the old centred UVs)');
  assert.notDeepEqual(a, off1);
  let maxShift = 0;
  for (let i = 0; i < a.length; i += 2) maxShift = Math.max(maxShift, Math.abs(a[i] - off1[i]));
  assert.ok(maxShift > 0.01 && maxShift <= room600 + 0.4, `largest u shift ${maxShift.toFixed(3)} m`);
  assert.deepEqual(uvOf('s-1', 'sofa', 'upholstery'), uvOf('s-2', 'sofa', 'upholstery'), 'loose furniture / other slots: untouched');
});

await test('network URLs carry ?v=<picture version> (content v from the merge, else the dHash) so /boards/* can be cached immutable', () => {
  registerBoards([rec('sail-t-v1', { v: 'abcd1234', hash: '79f8aa0011223344' }), rec('sail-t-v2', { hash: '79f8aa0011223344' }), rec('sail-t-v3', { hash: '' })], { src: 'bundled' });
  const base = CONFIG.boards.base;
  assert.equal(netURL('sail-t-v1', 1024), `${base}sail-t-v1/1024.webp?v=abcd1234`);
  assert.equal(netURL('sail-t-v2', 256), `${base}sail-t-v2/256.webp?v=79f8aa00`);
  assert.equal(netURL('sail-t-v3', 'chip'), `${base}sail-t-v3/chip.webp`, 'no version known → plain path');
  assert.equal(boardPath('sail-t-v1', 1024), 'sail-t-v1/1024.webp', 'file path on disk has no query');
  // 换了图（新的 v）→ 网址变、引擎的贴图 key 也变（不会拿到旧的缓存）
  registerBoards([rec('sail-t-v1', { rev: 2, v: 'ffff0000', hash: '79f8aa0011223344' })], { src: 'bundled' });
  assert.equal(netURL('sail-t-v1', 1024), `${base}sail-t-v1/1024.webp?v=ffff0000`);
  unregisterBoards(['sail-t-v1', 'sail-t-v2', 'sail-t-v3'], { src: 'bundled' });
});

await test('bundle: materials.js / textures.js never import the board library (lazy chunk via boards/bundled.js); bundledBoards registers it, resetBoards clears it, bundledBoards again re-registers', async () => {
  const fs = await import('node:fs');
  for (const f of ['src/shared/materials.js', 'src/shared/textures.js', 'src/shared/moods.js', 'src/shared/boards/library-api.js']) {
    const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!/from\s+['"][^'"]*boards\/(library|bundled)\.js['"]/.test(src), `${f} imports the library statically`);
    assert.ok(!/import\(\s*['"][^'"]*library\.js['"]\s*\)/.test(src) || f.endsWith('bundled.js'), `${f} imports library.js`);
  }
  resetBoards();
  assert.ok(!bundledLoaded());
  const r = await bundledBoards();
  assert.equal(r.count, LIBRARY.length);
  assert.ok(bundledLoaded());
  for (const x of LIBRARY) if (normRecord(x)) assert.ok(MAT_BY_ID[x.id]?.board, `bundled ${x.id} registered`);
  assert.ok(!MATERIALS.some((m) => m.board), 'MATERIALS still has no board after the bundled library registered');
  const again = await bundledBoards();
  assert.equal(again.count, LIBRARY.length, 'second call: same answer, no re-download');
  resetBoards();
  assert.ok(!Object.values(MAT_BY_ID).some((m) => m.board), 'reset → no board row left in MAT_BY_ID');
  assert.ok(!bundledLoaded());
  await bundledBoards();
  assert.equal(Object.values(MAT_BY_ID).filter((m) => m.board).length, LIBRARY.filter((x) => normRecord(x)).length, 're-registered after a reset');
  resetBoards();
});

console.log(failed ? `✗ ${failed} / ${n} failed` : `✓ ${n} checks`);
if (failed) process.exit(1);
