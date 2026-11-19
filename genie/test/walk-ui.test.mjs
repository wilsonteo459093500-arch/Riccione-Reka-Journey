// 走进去 · 界面这一层（src/studio/walk/WalkMode.jsx、Joystick.jsx、Minimap.jsx、ToolWheel.jsx、walk.css —— docs/walk/SPEC.md §5 · §10）：
//   「回到全屋」（data-walk="exit"）、WalkMode 第一个 import words.js、七个工具都在（中 / 英）、
//   小地图：condo3 画出这一层的每个房间、semid2 两层的楼层标签都在、手机上缩成圆；摇杆：死区、推出圆盘外按边算、方向；
//   许愿模式没有任何下载；样式：触控 ≥ 44px、整层 z < 110、选择器都带 walk、没有写死的颜色。
// .jsx 用 esbuild 打包成临时的 ESM（react-dom/server 画成 HTML，不跑 effect）；controller.js 换成一个假的（U6 在另外写真的）；
// src 里 Node 自己 import 得了的 .js 不打进去（和这里 setLang 的是同一份词典）。
// 跑法：node test/walk-ui.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { setLang as setLang0 } from '../src/shared/i18n.js';
import EN from '../src/shared/i18n/en.js';
import EW from '../src/shared/i18n/en-walk.js';
import { fromStoredProject } from '../src/studio/store.js';
import '../src/studio/walk/words.js'; // 和 WalkMode 一样：先把走进去的英文并进词典

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src') + path.sep;
const WALK = path.join(ROOT, 'src/studio/walk');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const setLang = (l) => setLang0(l, { reload: false });

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

console.log('走进去 · 界面（walk-ui）');

// ───────────────────────── 打包 ─────────────────────────

/** src 里的 .js（连它 import 的）Node 自己 import 得了吗 */
const SAFE = new Map();
function nodeSafe(abs) {
  if (SAFE.has(abs)) return SAFE.get(abs);
  SAFE.set(abs, true);
  const deps = [...fs.readFileSync(abs, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?['"](\.\.?\/[^'"]+)['"]/g)].map((m) => path.resolve(path.dirname(abs), m[1]));
  const ok = deps.every((d) => /\.m?js$/.test(d) && fs.existsSync(d) && nodeSafe(d));
  SAFE.set(abs, ok);
  return ok;
}

// 假的 controller（SPEC §3 的形状）：SSR 不跑 effect，所以只要 import 得到；记下被叫了什么，给以后用浏览器跑的时候看
const MOCK = `
export const made = [];
export function createWalk(engine, opts) {
  const on = new Map();
  const ctl = {
    calls: [], phase: 'out', opts,
    enter() { ctl.calls.push(['enter']); return Promise.resolve(); },
    exit() { ctl.calls.push(['exit']); return Promise.resolve(); },
    dispose() { ctl.calls.push(['dispose']); },
    setTool(id) { ctl.calls.push(['setTool', id]); },
    joystick(x, y) { ctl.calls.push(['joystick', x, y]); },
    walkTo(p) { ctl.calls.push(['walkTo', p]); return Promise.resolve(true); },
    goFloor(fi) { ctl.calls.push(['goFloor', fi]); },
    pose() { return { fi: 0, floor: 'f0', x: 1, z: 1, yaw: 0, pitch: 0, room: null }; },
    project() { return { x: 0, y: 0, visible: false }; },
    photo() { return null; }, goto() {}, update(p) { ctl.calls.push(['update', p]); },
    tour: { running: false, start() {}, stop() {}, next() {}, state: () => ({ running: false, index: -1, total: 0, stop: null, line: null, phase: 'idle' }) },
    on(evt, fn) { (on.get(evt) || on.set(evt, new Set()).get(evt)).add(fn); return () => on.get(evt).delete(fn); },
  };
  made.push(ctl);
  return ctl;
}`;

/** 一个 .jsx 的几个导出 + renderToStaticMarkup 打包在一起（同一份 React） */
async function bundle(entries) {
  const lines = entries.map(([name, rel]) => `export * as ${name} from './${rel}';`);
  const r = await build({
    stdin: {
      contents: `${lines.join('\n')}\nimport { createElement } from 'react';\nimport { renderToStaticMarkup } from 'react-dom/server.browser';\nexport const render = (C, p) => renderToStaticMarkup(createElement(C, p));`,
      resolveDir: ROOT,
      loader: 'jsx',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    logLevel: 'silent',
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'mock-controller',
        setup(b) {
          b.onResolve({ filter: /^\.\/controller\.js$/ }, (a) => (path.resolve(a.resolveDir) === WALK ? { path: 'controller', namespace: 'walk-mock' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 'walk-mock' }, () => ({ contents: MOCK, loader: 'js' }));
        },
      },
      {
        name: 'src-js-external',
        setup(b) {
          b.onResolve({ filter: /^\.\.?\// }, (a) => {
            const abs = path.resolve(a.resolveDir, a.path);
            if (abs.startsWith(SRC) && /\.m?js$/.test(abs) && fs.existsSync(abs) && nodeSafe(abs)) return { path: pathToFileURL(abs).href, external: true };
            return undefined;
          });
        },
      },
    ],
  });
  const file = path.join(os.tmpdir(), `walk-ui-${process.pid}.mjs`);
  fs.writeFileSync(file, r.outputFiles[0].text);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

const B = await bundle([
  ['WM', 'src/studio/walk/WalkMode.jsx'],
  ['JOY', 'src/studio/walk/Joystick.jsx'],
  ['MAP', 'src/studio/walk/Minimap.jsx'],
  ['TW', 'src/studio/walk/ToolWheel.jsx'],
  ['PHOTO', 'src/studio/walk/PhotoPanel.jsx'],
]);
const { render } = B;

const fixture = (f) => fromStoredProject(JSON.parse(read(`test/fixtures/walk/${f}.json`)));
const CONDO = fixture('condo3');
const SEMID = fixture('semid2');
const noop = () => {};
/** StudioApp 给的接口（SPEC §6）；wish → shoot = null */
const apiOf = (wish) => ({
  dropMaterial: () => true,
  setTime: noop,
  moveItem: noop,
  rotateItem: noop,
  removeItem: noop,
  undo: noop,
  canUndo: () => false,
  flash: noop,
  setMarks: noop,
  shoot: wish ? null : () => Promise.resolve(),
});
const walkMode = (project, { wish = false, staff = !wish } = {}) => render(B.WM.default, { engine: {}, project, api: apiOf(wish), wish, staff, onExit: noop });
const count = (html, re) => (html.match(re) || []).length;
const HAN = /[㐀-鿿]/;
const textOf = (html) =>
  html
    .replace(/<svg class="lucide[\s\S]*?<\/svg>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/g, ' ');

// ───────────────────────── 1. WalkMode ─────────────────────────

await test('WalkMode.jsx：第一个 import 是 ./words.js；默认导出；不碰存储', () => {
  const src = read('src/studio/walk/WalkMode.jsx');
  const first = src.match(/^import\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/m);
  assert.equal(first?.[1], './words.js');
  assert.match(src, /export default function WalkMode\(/);
  assert.match(src, /^let toured = false;/m, '第一次走进去才自动带逛：只记在这一页（模块里的一个变量）');
  for (const f of ['WalkMode.jsx', 'Joystick.jsx', 'Minimap.jsx', 'ToolWheel.jsx']) assert.doesNotMatch(read(`src/studio/walk/${f}`), /localStorage|sessionStorage|indexedDB|createObjectURL|download=|type="file"/, f);
  assert.doesNotMatch(read('src/studio/walk/Minimap.jsx'), /from\s+['"][^'"]*\/export\//, '小地图不 import 导出那一块');
});

for (const lang of ['zh', 'en']) {
  await test(`WalkMode（${lang}）：「回到全屋」data-walk="exit"、七个工具、小地图、摇杆；飞进来之前界面先藏着`, () => {
    setLang(lang);
    try {
      const html = walkMode(CONDO);
      const exit = html.match(/<button[^>]*data-walk="exit"[^>]*>([\s\S]*?)<\/button>/);
      assert.ok(exit, 'data-walk="exit" 的按钮');
      assert.ok(exit[1].includes(lang === 'en' ? 'Back to whole home' : '回到全屋'), exit[1]);
      // 七个工具，顺序、字
      const tools = [...html.matchAll(/data-walk-tool="(\w+)"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g)].map((m) => [m[1], m[2]]);
      const want = lang === 'en' ? ['Walk', 'Paint', 'Floor', 'Furniture', 'Lighting', 'Measure', 'Take photo'] : ['走', '刷颜色', '地板', '家具', '灯光', '量尺', '拍照'];
      assert.deepEqual(
        tools.map((x) => x[0]),
        ['walk', 'paint', 'floor', 'furnish', 'light', 'measure', 'photo'],
      );
      assert.deepEqual(
        tools.map((x) => x[1]),
        want,
      );
      assert.match(html, /data-walk-tool="walk" aria-pressed="true"/, '一开始是「走」');
      assert.equal(count(html, /aria-pressed="true"/g), 1);
      assert.match(html, /class="walk-tools glass" role="toolbar"/);
      // 小地图：condo3 一层 11 个房间
      assert.equal(count(html, /class="walk-map-room /g), CONDO.plan.floors[0].rooms.length);
      assert.match(html, /class="walk-joy"/);
      // 飞进来之前（phase 'flying-in'）：根节点没有 is-live → walk.css 把界面都藏着
      assert.match(html, /^<div class="walk-ui [^"]*tool-walk"/);
      assert.doesNotMatch(html.match(/^<div class="([^"]*)"/)[1], /is-live/);
      // 英文版：除了图标，看得到的字都是英文
      if (lang === 'en') assert.ok(!HAN.test(textOf(html)), `英文版里有中文：${textOf(html).match(/\S*[㐀-鿿]\S*/g)}`);
      assert.ok(!/#[0-9a-f]{3,8}\b/i.test(html.replace(/<svg class="lucide[\s\S]*?<\/svg>/g, '')), '没有写死的颜色');
    } finally {
      setLang('zh');
    }
  });
}

await test('许愿模式：WalkMode、拍照面板都没有下载（没有 download、没有「下载」）', () => {
  for (const lang of ['zh', 'en']) {
    setLang(lang);
    try {
      const wish = walkMode(SEMID, { wish: true });
      const photo = render(B.PHOTO.default, { ctl: null, engine: {}, project: { ...SEMID, walkMarks: [] }, api: apiOf(true), wish: true, staff: false, room: null, fi: 0, mode: 'photo', onClose: noop });
      for (const html of [wish, photo]) {
        assert.doesNotMatch(html, /\sdownload(=|\s|>)/i);
        assert.doesNotMatch(textOf(html), /下载|Download/i);
        assert.doesNotMatch(html, /type="file"/);
      }
    } finally {
      setLang('zh');
    }
  }
});

await test('事件的几种写法（{ phase } / 直接给值；房间 id → 房间）', () => {
  const { phaseOf, floorOf, roomOf, PANELS } = B.WM;
  assert.equal(phaseOf({ phase: 'walking' }), 'walking');
  assert.equal(phaseOf('flying-out'), 'flying-out');
  assert.equal(phaseOf(null), null);
  assert.equal(floorOf({ fi: 1 }), 1);
  assert.equal(floorOf(0), 0);
  assert.equal(floorOf({}), null);
  assert.equal(roomOf(SEMID.plan, { room: 'f-mst' })?.type, 'master');
  assert.equal(roomOf(SEMID.plan, 'g-liv')?.type, 'living');
  const obj = { id: 'x', type: 'bath' };
  assert.equal(roomOf(SEMID.plan, { room: obj }), obj);
  assert.equal(roomOf(SEMID.plan, { room: null }), null);
  assert.equal(roomOf(SEMID.plan, 'nope'), null);
  // 刷颜色和地板共用一个托盘；量尺另外画在整层上
  assert.equal(PANELS.paint, PANELS.floor);
  assert.deepEqual(Object.keys(PANELS).sort(), ['floor', 'furnish', 'light', 'paint', 'photo']);
});

// ───────────────────────── 2. 工具轮 ─────────────────────────

await test('工具轮：七个工具（id = controller.setTool 的 id）、再点一次正在用的 = 回到「走」、图标都是第一块里有的', () => {
  const { WALK_TOOLS, TOOL_IDS, nextTool } = B.TW;
  assert.deepEqual(TOOL_IDS, ['walk', 'paint', 'floor', 'furnish', 'light', 'measure', 'photo']);
  assert.deepEqual(
    WALK_TOOLS.map((x) => x.label),
    ['走', '刷颜色', '地板', '家具', '灯光', '量尺', '拍照'],
  );
  for (const x of WALK_TOOLS) assert.ok(EN[x.label] ?? EW[x.label], `${x.label} 要有英文`);
  assert.equal(nextTool('walk', 'paint'), 'paint');
  assert.equal(nextTool('paint', 'paint'), 'walk');
  assert.equal(nextTool('paint', 'floor'), 'floor');
  assert.equal(nextTool('walk', 'walk'), 'walk');
  assert.equal(nextTool('walk', 'nope'), 'walk');
  const kit = read('src/studio/ui/kit.jsx');
  for (const x of WALK_TOOLS) assert.ok(x.furn ? new RegExp(`\\n\\s*${x.furn}:`).test(kit) : new RegExp(`\\n\\s*${x.icon}:\\s*\\w+`).test(kit), `${x.id} 的图标在 kit.jsx 里`);
  const html = render(B.TW.default, { tool: 'measure', onPick: noop });
  assert.match(html, /data-walk-tool="measure" aria-pressed="true"/);
  assert.equal(count(html, /<button /g), 7);
});

// ───────────────────────── 3. 小地图 ─────────────────────────

await test('小地图 condo3：一层的每个房间都画出来、放得下的写房间名（短的）、你站的房间亮起来；单层没有楼层标签', () => {
  const html = render(B.MAP.default, { ctl: null, plan: CONDO.plan, fi: 0, room: 'liv', size: 'wide', onWalk: noop, onFloor: noop });
  const rooms = CONDO.plan.floors[0].rooms;
  assert.equal(count(html, /class="walk-map-room /g), rooms.length);
  for (const r of rooms) assert.ok(html.includes(`x="${Math.round(r.x * 1000) / 1000}" y="${Math.round(r.y * 1000) / 1000}" width="${Math.round(r.w * 1000) / 1000}" height="${Math.round(r.d * 1000) / 1000}"`), r.id);
  assert.match(html, /class="walk-map-room is-room is-here"/);
  assert.equal(count(html, /is-here/g), 2, '客厅：矩形 + 名字');
  const labels = [...html.matchAll(/class="walk-map-label[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.ok(labels.includes('客厅') && labels.includes('主卧'), labels.join(' '));
  assert.ok(labels.length >= 6, `放得下名字的房间太少：${labels}`);
  assert.ok(labels.every((s) => !s.includes('/')), '名字是短的');
  assert.doesNotMatch(html, /walk-map-floors/);
  assert.match(html, /class="walk-map-room-name">客厅</);
  // 你：一开始藏着（等 pose 事件）
  assert.match(html, /class="walk-map-me" style="display:none"/);
  // 阳台是户外（虚线）
  assert.match(html, /class="walk-map-room is-out"/);
});

await test('小地图 semid2：两层的楼层标签都在（中 / 英）、这一层的房间、楼梯间另外画；换层外框不变', () => {
  for (const lang of ['zh', 'en']) {
    setLang(lang);
    try {
      for (const fi of [0, 1]) {
        const html = render(B.MAP.default, { ctl: null, plan: SEMID.plan, fi, room: null, size: 'compact', onWalk: noop, onFloor: noop });
        const tabs = [...html.matchAll(/<button[^>]*class="walk-map-floor[^"]*"[^>]*aria-pressed="(true|false)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]);
        assert.deepEqual(
          tabs.map((x) => x[1]),
          lang === 'en' ? ['Ground floor', 'First floor'] : ['一楼', '二楼'],
        );
        assert.deepEqual(
          tabs.map((x) => x[0]),
          fi === 0 ? ['true', 'false'] : ['false', 'true'],
        );
        assert.equal(count(html, /class="walk-map-room /g), SEMID.plan.floors[fi].rooms.length);
        assert.equal(count(html, /class="walk-map-room is-stair/g), 1);
        assert.match(html, /viewBox="-0.5 -0.5 10.6 21.4"/, '所有楼层同一个外框');
        if (lang === 'en') assert.ok(!HAN.test(textOf(html)), textOf(html));
      }
    } finally {
      setLang('zh');
    }
  }
  // 点了「二楼」、还在楼梯上：那一个标签先变色（还没 aria-pressed）
  const going = render(B.MAP.default, { ctl: null, plan: SEMID.plan, fi: 0, going: 1, size: 'wide', onWalk: noop, onFloor: noop });
  assert.match(going, /class="walk-map-floor is-going" aria-pressed="false">二楼</);
  assert.doesNotMatch(render(B.MAP.default, { ctl: null, plan: SEMID.plan, fi: 1, going: 1, size: 'wide' }), /is-going/);
});

await test('小地图：手机上缩成 120px 的圆（按钮「展开小地图」，没有房间名）；展开后有「收起小地图」', () => {
  const mini = render(B.MAP.default, { ctl: null, plan: SEMID.plan, fi: 0, size: 'phone', onWalk: noop, onFloor: noop });
  assert.match(mini, /^<button type="button" class="walk-map glass is-mini" aria-label="展开小地图" aria-expanded="false"/);
  assert.match(mini, /width="120" height="120"/);
  assert.doesNotMatch(mini, /walk-map-label|walk-map-floors/);
  const { mapBox, mapRooms, mapScale, labelFits, shortName, roomKind, meTransform, textWidth, MAP_SIZES } = B.MAP;
  // 纯函数
  assert.deepEqual(mapBox(CONDO.plan), { x: -0.5, y: -0.5, w: 13, h: 10 });
  assert.deepEqual(mapBox({ floors: [] }), { x: 0, y: 0, w: 10, h: 8 });
  const sc = mapScale(mapBox(CONDO.plan), 'wide');
  assert.ok(sc.W <= MAP_SIZES.wide.w && sc.H <= MAP_SIZES.wide.h && (sc.W === MAP_SIZES.wide.w || sc.H === MAP_SIZES.wide.h));
  assert.equal(shortName('后院 / 晒衣处'), '后院');
  assert.equal(shortName('Back yard / drying'), 'Back yard');
  assert.equal(shortName('客厅'), '客厅');
  assert.equal(roomKind({ type: 'stair' }), 'stair');
  assert.equal(roomKind({ type: 'living', stairId: 's1' }), 'stair');
  assert.equal(roomKind({ type: 'void' }), 'void');
  assert.equal(roomKind({ type: 'porch' }), 'out');
  assert.equal(roomKind({ type: 'kitchen' }), 'room');
  const semi = mapRooms(SEMID.plan, 0);
  assert.equal(semi.find((r) => r.id === 'g-yard').name, '后院');
  assert.equal(mapRooms(SEMID.plan, 5).length, 0);
  assert.ok(textWidth('客厅', 10) === 20 && Math.abs(textWidth('Ab', 10) - 11.6) < 1e-9);
  assert.ok(labelFits('客厅', { w: 3, d: 2 }, 20, 11));
  assert.ok(!labelFits('公共浴室', { w: 1.8, d: 2.4 }, 10, 11), '太窄');
  assert.ok(!labelFits('客厅', { w: 3, d: 0.5 }, 20, 11), '太矮');
  assert.ok(!labelFits('', { w: 3, d: 2 }, 20, 11));
  // 看的方向 = (−sin yaw, −cos yaw)；扇形画成朝上（−y）→ rotate(−yaw)
  assert.equal(meTransform({ x: 1, z: 2, yaw: 0 }), 'translate(1 2) rotate(0)');
  assert.equal(meTransform({ x: 1, z: 2, yaw: Math.PI / 2 }), 'translate(1 2) rotate(-90)', '朝 −x（地图左边）');
  assert.equal(meTransform({ x: 0, z: 0, yaw: -Math.PI / 2 }), 'translate(0 0) rotate(90)', '朝 +x');
});

// ───────────────────────── 4. 摇杆 ─────────────────────────

await test('摇杆：死区里不动；推出圆盘外按边算（单位圆）；往上推 = 往前（y > 0）、往右 = x > 0；长度从死区边上平滑地长', () => {
  const { joyVector, knobOffset, JOY_DEAD, JOY_SIZE } = B.JOY;
  const R = JOY_SIZE / 2;
  assert.equal(JOY_SIZE, 120);
  assert.deepEqual(joyVector(0, 0, R), { x: 0, y: 0 });
  assert.deepEqual(joyVector(R * JOY_DEAD * 0.9, 0, R), { x: 0, y: 0 }, '死区');
  assert.deepEqual(joyVector(3, -4, R), { x: 0, y: 0 }, '手指轻轻放上去');
  const up = joyVector(0, -R, R);
  assert.deepEqual(up, { x: 0, y: 1 }, '推到边 = 1');
  assert.deepEqual(joyVector(R, 0, R), { x: 1, y: 0 });
  assert.deepEqual(joyVector(0, R * 3, R), { x: 0, y: -1 }, '往下推 = 后退；推出圆盘外按边算');
  const far = joyVector(R * 4, -R * 4, R);
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - 1) < 2e-3 && far.x > 0 && far.y > 0, `斜着推出去：长度 1（${JSON.stringify(far)}）`);
  for (let a = 0; a < 2 * Math.PI; a += 0.37)
    for (const m of [0.2, 0.5, 0.99, 1.5, 9]) {
      const v = joyVector(Math.cos(a) * m * R, Math.sin(a) * m * R, R);
      assert.ok(Math.hypot(v.x, v.y) <= 1 + 1e-9, `单位圆：${a} ${m}`);
    }
  // 死区外：长度从 0 开始长，单调
  const just = joyVector(0, -R * (JOY_DEAD + 0.01), R);
  assert.ok(just.y > 0 && just.y < 0.03, `刚出死区：${just.y}`);
  let prev = 0;
  for (let m = JOY_DEAD + 0.02; m <= 1; m += 0.05) {
    const v = joyVector(0, -m * R, R).y;
    assert.ok(v > prev, `单调：${m}`);
    prev = v;
  }
  // 没有 −0、不是 NaN
  assert.ok(Object.is(joyVector(-R, 0, R).y, 0));
  assert.deepEqual(joyVector(NaN, undefined, R), { x: 0, y: 0 });
  // 圆钮：跟着手指，最远 36px
  assert.deepEqual(knobOffset(10, -5), { x: 10, y: -5 });
  const k = knobOffset(300, 400);
  assert.ok(Math.abs(Math.hypot(k.x, k.y) - 36) < 1e-9);
  const html = render(B.JOY.default, { onMove: noop });
  assert.match(html, /^<div class="walk-joy" aria-hidden="true"/);
  assert.match(html, /class="walk-joy-knob"/);
});

// ───────────────────────── 5. 样式 ─────────────────────────

/** walk.css → [{ at, selectors, decls }]（一层 @media；@keyframes 跳过） */
function cssRules(text) {
  const s = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}|(@[^{}]+)\{|\}/g;
  const at = [];
  let skip = 0;
  for (const m of s.matchAll(re)) {
    if (m[3]) {
      if (/^@(-\w+-)?keyframes/.test(m[3].trim()) || skip) skip++;
      else at.push(m[3].trim());
      continue;
    }
    if (!m[1]) {
      if (skip) skip--;
      else at.pop();
      continue;
    }
    if (skip) continue;
    const decls = {};
    for (const d of m[2].split(';')) {
      const k = d.indexOf(':');
      if (k > 0) decls[d.slice(0, k).trim()] = d.slice(k + 1).trim();
    }
    out.push({ at: [...at], selectors: m[1].split(',').map((x) => x.trim()), decls });
  }
  return out;
}

await test('walk.css：选择器都带 walk；整层 z < 110、不接指针；触控 ≥ 44px；摇杆 touch-action: none；手机缩成圆；许愿模式让开右下角；没有写死的颜色', () => {
  const css = read('src/studio/walk/walk.css');
  const rules = cssRules(css);
  assert.ok(rules.length > 30, `读到的规则太少：${rules.length}`);
  for (const r of rules) for (const sel of r.selectors) assert.match(sel, /walk/, sel);
  const top = (sel) => rules.filter((r) => !r.at.length && r.selectors.includes(sel)).reduce((a, r) => ({ ...a, ...r.decls }), {});
  const ui = top('.walk-ui');
  assert.ok(+ui['z-index'] < 110, `z-index ${ui['z-index']}`);
  assert.equal(ui['pointer-events'], 'none');
  assert.equal(ui.position, 'absolute');
  const px = (v) => parseFloat(v);
  assert.ok(px(top('.walk-exit')['min-height']) >= 44);
  assert.ok(px(top('.walk-undo').width) >= 44 && px(top('.walk-undo').height) >= 44);
  assert.ok(px(top('.walk-tool')['min-height']) >= 44);
  assert.ok(px(top('.walk-map-floor')['min-height']) >= 44);
  assert.ok(px(top('.walk-map-close').width) >= 44 && px(top('.walk-map-close').height) >= 44);
  const phoneTool = rules.find((r) => r.at.some((a) => /max-width:\s*600px/.test(a)) && r.selectors.includes('.walk-tool'));
  assert.ok(px(phoneTool.decls['min-height']) >= 44, '手机上的工具也 ≥ 44px');
  const joy = top('.walk-joy');
  assert.equal(joy['touch-action'], 'none');
  assert.equal(joy.width, 'var(--walk-joy)');
  assert.equal(ui['--walk-joy'], '120px');
  const mini = top('.walk-map.is-mini');
  assert.equal(mini.width, '120px');
  assert.equal(mini['border-radius'], '50%');
  // 飞的时候藏起来（不改排版：opacity / visibility）
  const hid = top('.walk-ui:not(.is-live) > *');
  assert.equal(hid.visibility, 'hidden');
  assert.equal(hid['pointer-events'], 'none');
  // 许愿模式：右下角的胶囊 —— 窄一点的屏幕整列抬高
  const wish = rules.find((r) => r.selectors.includes('.is-wish .walk-ui'));
  assert.ok(wish && /min-width:\s*561px/.test(wish.at[0]) && /calc\(var\(--safe-b\) \+ \d+px\)/.test(wish.decls['--walk-dock-b']), '许愿模式抬高工具轮');
  // 上面居中（提示）：小地图、回到全屋都在角上
  assert.equal(top('.walk-map').right, 'var(--safe-r)');
  assert.equal(top('.walk-top').left, 'var(--safe-l)');
  // 潘吉带逛：位置在这里给（TourBubble 自己不定位）
  assert.ok(rules.some((r) => r.selectors.includes('.walk-ui > .walk-tour') && r.selectors.includes('.walk-ui > .walk-tour-start') && r.decls.position === 'absolute'));
  assert.ok(!/(?<![\w&#/-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), '没有写死的颜色');
});

await test('英文：这一块的字都在 en-walk.js 或总表；en-walk.js 不和总表打架', () => {
  for (const k of ['走', '刷颜色', '量尺', '小地图', '展开小地图', '收起小地图', '按住拖动来走 · 键盘 W A S D']) assert.ok(EW[k], k);
  for (const k of ['地板', '家具', '灯光', '拍照', '工具', '楼层', '撤销', '回到全屋', '走进去出了点问题，已回到全屋']) assert.ok(EN[k], `${k} 在总表`);
  for (const [k, v] of Object.entries(EW)) if (EN[k] != null) assert.equal(EN[k], v, k);
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
