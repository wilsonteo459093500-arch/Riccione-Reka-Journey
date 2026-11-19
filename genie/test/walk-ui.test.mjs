// 走进去 · 界面这一层（src/studio/walk/WalkMode.jsx、Joystick.jsx、Minimap.jsx、ToolWheel.jsx、walk.css —— docs/walk/SPEC.md §5 · §10）：
//   「回到全屋」（data-walk="exit"）、WalkMode 第一个 import words.js、七个工具都在（中 / 英）、
//   小地图：condo3 画出这一层的每个房间、semid2 两层的楼层标签都在、手机上缩成圆；摇杆：死区、推出圆盘外按边算、方向；
//   许愿模式没有任何下载；样式：触控 ≥ 44px、整层 z < 110、选择器都带 walk、没有写死的颜色。
//   走进去失败（enter() 抛错）一定说一声「走进去出了点问题」（wireWalk + 假的控制器）；小地图量得出放得下多高（矮的横屏上
//   楼层标签不出画面、不伸到工具轮下面）；手机上展开的小地图盖在最上面；矮的屏幕上潘吉的泡泡不盖住「回到全屋」（按 walk.css 算）、
//   摇杆不顶到「回到全屋」、许愿模式的工具轮不钻到胶囊下面；样式表没下载成（ensureWalkCss 再挂一次）；studio.css 的 .walk-wait 在 320 宽放得下。
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

// ── 控制器 → 界面（wireWalk）：走进去失败一定说一声（客人自己按了回到全屋就不说） ──

/** 假的控制器：on / emit、go(phase) = setPhase（同步发 'state'，和 controller.js 一样）；enter 由每个测试给 */
function fakeCtl(enter) {
  const subs = new Map();
  const c = {
    phase: 'out',
    disposed: 0,
    on(e, fn) {
      (subs.get(e) || subs.set(e, new Set()).get(e)).add(fn);
      return () => subs.get(e).delete(fn);
    },
    emit(e, p) {
      for (const fn of [...(subs.get(e) || [])]) fn(p);
    },
    go(p) {
      c.phase = p;
      c.emit('state', { phase: p });
    },
    enter: () => enter(c),
    dispose() {
      c.disposed++;
    },
    pose: () => ({ fi: 1, x: 0, z: 0, yaw: 0 }),
    tour: { state: () => ({ running: false }) },
  };
  return c;
}
/** WalkMode 给 wireWalk 的那些（leave = 设 exiting + 记一次 onExit） */
function rig(c) {
  const log = { flash: [], leave: 0, phase: [], fi: [] };
  const exiting = { current: false };
  const userExit = { current: false };
  const h = {
    api: { flash: (m, ms) => log.flash.push([m, ms]) },
    set: { phase: (p) => log.phase.push(typeof p === 'function' ? p('flying-in') : p), fi: (f) => log.fi.push(f), room: noop, tour: noop },
    leave: () => {
      exiting.current = true;
      log.leave++;
    },
    exiting,
    userExit,
  };
  return { log, h, off: B.WM.wireWalk(c, h) };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const OOPS = '走进去出了点问题，已回到全屋';

await test('wireWalk：走进去失败（controller 先自己退回 out 再抛错）→ 一定说一声「走进去出了点问题」、只关一次、dispose', async () => {
  // 和 controller.js 的 enter() 一样：setPhase('flying-in') → 出错 → finishOut（setPhase('out')）→ throw。同步出错、飞到一半出错都试
  const fails = {
    sync: (c) => {
      c.go('flying-in');
      c.go('out');
      return Promise.reject(new Error('navData'));
    },
    later: async (c) => {
      c.go('flying-in');
      await null;
      await null;
      c.go('out');
      throw new Error('flyIn');
    },
  };
  for (const [name, enter] of Object.entries(fails)) {
    const c = fakeCtl(enter);
    const { log } = rig(c);
    await settle();
    assert.deepEqual(log.flash, [[OOPS, 4200]], `${name}：要说一声（'state' out 先把 exiting 设了，以前这里就不说了）`);
    assert.equal(log.leave, 1, `${name}：只关一次`);
    assert.equal(c.disposed, 1, name);
    assert.deepEqual(log.phase, ['flying-in', 'out'], name);
  }
  // 英文
  setLang('en');
  try {
    const { log } = rig(fakeCtl(fails.sync));
    await settle();
    assert.equal(log.flash.length, 1);
    assert.equal(log.flash[0][0], EN[OOPS]);
    assert.ok(!HAN.test(log.flash[0][0]), log.flash[0][0]);
  } finally {
    setLang('zh');
  }
});

await test('wireWalk：客人自己按了「回到全屋」以后才失败 → 不说「出了点问题」；飞行被别人停了（不是出错）→ 不说、关一次', async () => {
  // 飞到一半客人按了回到全屋（WalkMode 的 exit()：exiting + userExit），然后 enter() 抛错
  const c = fakeCtl(async (c) => {
    c.go('flying-in');
    await null;
    await null;
    c.go('flying-out');
    c.go('out');
    throw new Error('late');
  });
  const r = rig(c);
  r.h.exiting.current = true;
  r.h.userExit.current = true;
  await settle();
  assert.deepEqual(r.log.flash, []);
  assert.equal(r.log.leave, 0, 'exit() 自己会 onExit');
  // 飞行被停了：enter() 回 false（'out' 已经发过）
  const c2 = fakeCtl(async (c) => {
    c.go('flying-in');
    await null;
    c.go('out');
    return false;
  });
  const r2 = rig(c2);
  await settle();
  assert.deepEqual(r2.log.flash, []);
  assert.equal(r2.log.leave, 1);
  // 卸下以后才失败：什么都不做
  const c3 = fakeCtl(async (c) => {
    c.go('flying-in');
    await null;
    c.go('out');
    throw new Error('gone');
  });
  const r3 = rig(c3);
  r3.off();
  await settle();
  assert.deepEqual(r3.log.flash, []);
  assert.equal(r3.log.leave, 0);
  assert.deepEqual(r3.log.phase, []);
  // WalkMode 的 exit()：exiting 和 userExit 一起设
  assert.match(read('src/studio/walk/WalkMode.jsx'), /exiting\.current = true;\s*userExit\.current = true;/);
});

await test('wireWalk：走进去了 → phase walking、楼层 = pose；走着走着出错（error 事件）→ 说一声、只说一次、关一次', async () => {
  const c = fakeCtl((c) => {
    c.go('flying-in');
    c.go('walking');
    return Promise.resolve(true);
  });
  const { log } = rig(c);
  await settle();
  assert.deepEqual(log.phase, ['flying-in', 'walking', 'walking']);
  assert.deepEqual(log.fi, [1]);
  assert.deepEqual(log.flash, []);
  assert.equal(log.leave, 0);
  // controller.js 的 fail()：emit('error') → exit({ instant }) → flying-out → out
  c.emit('error', { error: new Error('tick') });
  c.go('flying-out');
  c.go('out');
  await settle();
  assert.deepEqual(log.flash, [[OOPS, 4200]]);
  assert.equal(log.leave, 1);
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

await test('小地图放得下多高（mapRoomH）：卡片不出画面、横着叠到工具轮就停在它上面；矮的横屏上 semid2 的楼层标签看得到', () => {
  const { mapRoomH, mapScale, mapBox, MAP_GAP, MAP_MIN_H, MAP_SIZES } = B.MAP;
  assert.equal(mapRoomH({ uiH: 0 }), null, '还没排版：不限');
  assert.equal(mapRoomH({ uiH: 800, top: 16, chrome: 100 }), 800 - MAP_GAP - 16 - 100);
  assert.equal(mapRoomH({ uiH: 320, top: 16, chrome: 100, tools: 240 }), 240 - MAP_GAP - 16 - 100, '工具轮在上面一点');
  assert.equal(mapRoomH({ uiH: 320, top: 16, chrome: 100, tools: 400 }), 320 - MAP_GAP - 16 - 100, '工具轮在画面外：照画面算');
  assert.equal(mapRoomH({ uiH: 200, top: 16, chrome: 180 }), MAP_MIN_H, '再挤也有一点');
  // 不限 / 放得下：和以前一样大
  const box = mapBox(SEMID.plan);
  for (const size of ['wide', 'compact', 'phone']) {
    assert.deepEqual(mapScale(box, size, null), mapScale(box, size));
    assert.deepEqual(mapScale(box, size, 5000), mapScale(box, size));
  }
  // iPhone SE 横着（667×320，compact，多层）：卡片 = 顶 16 + 名字 / 楼层标签 / 边距 ≈ 100 + 地图；工具轮顶边 240
  const full = mapScale(box, 'compact');
  assert.ok(16 + 100 + full.H > 320, `没缩的时候本来就出画面：${full.H}`);
  for (const [uiH, tools] of [
    [320, 240],
    [340, null],
    [390, null],
  ]) {
    const maxH = mapRoomH({ uiH, top: 16, chrome: 100, tools });
    const sc = mapScale(box, 'compact', maxH);
    assert.ok(16 + 100 + sc.H <= (tools ?? uiH) - MAP_GAP, `${uiH}：卡片底边 ${16 + 100 + sc.H}`);
    assert.ok(Math.abs(sc.W / sc.H - box.w / box.h) < 0.03, '缩的时候不变形');
    assert.ok(sc.W <= MAP_SIZES.compact.w && sc.H <= MAP_SIZES.compact.h);
  }
  // 多层的卡片带 is-multi（walk.css 让两个楼层标签并排放得下）；单层、手机缩起来的圆不带
  assert.match(render(B.MAP.default, { ctl: null, plan: SEMID.plan, fi: 0, size: 'compact' }), /^<div class="walk-map glass is-compact is-multi"/);
  assert.match(render(B.MAP.default, { ctl: null, plan: CONDO.plan, fi: 0, size: 'compact' }), /^<div class="walk-map glass is-compact"/);
  assert.doesNotMatch(render(B.MAP.default, { ctl: null, plan: SEMID.plan, fi: 0, size: 'phone' }), /is-multi/);
  // Minimap 真的量了（useLayoutEffect → mapRoomH → mapScale 的 maxH）；手机上展开的那张不让工具轮（盖在最上面）
  const src = read('src/studio/walk/Minimap.jsx');
  assert.match(src, /useLayoutEffect\(/);
  assert.match(src, /mapRoomH\(\{ uiH: ui\.clientHeight, top: el\.offsetTop, chrome, tools \}\)/);
  assert.match(src, /mapScale\(box, size, maxH\)/);
  assert.match(src, /const tw = phone \? null : ui\.querySelector\('\.walk-tools'\)/);
  assert.match(src, /onOpen\?\.\(phone && open\)/);
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

/** 某个画面大小下生效的声明（同一条选择器、按源码顺序后面的盖前面的；只认宽 / 高的 @media，别的（hover、减少动画）当不成立） */
function activeDecls(rules, sel, W, H) {
  const feat = ([, mm, dim, v]) => {
    const x = dim === 'width' ? W : H;
    return mm === 'min' ? x >= +v : x <= +v;
  };
  const query = (q) =>
    q
      .replace(/^@media\s*/, '')
      .split(/\s*,\s*/)
      .some((alt) => {
        const parts = alt.split(/\s+and\s+/);
        return parts.every((p) => {
          const m = p.match(/^\((min|max)-(width|height):\s*(\d+)px\)$/);
          return m ? feat(m) : false;
        });
      });
  return rules.filter((r) => r.selectors.includes(sel) && r.at.every(query)).reduce((a, r) => ({ ...a, ...r.decls }), {});
}
/** calc() → px（var() 换成给的值，100vw / 100dvh / 100vh 换成画面大小） */
function calcPx(expr, vars, W, H) {
  let s = String(expr);
  for (let i = 0; i < 6 && /var\(/.test(s); i++)
    s = s.replace(/var\((--[\w-]+)\)/g, (_, k) => {
      assert.ok(k in vars, `${k} 没有值`);
      return `(${vars[k]})`;
    });
  s = s
    .replace(/100dvh|100vh/g, String(H))
    .replace(/100vw/g, String(W))
    .replace(/calc\(/g, '(')
    .replace(/\bmin\(/g, 'Math.min(')
    .replace(/\bmax\(/g, 'Math.max(')
    .replace(/(\d)px/g, '$1');
  assert.match(s, /^[\d\s.+\-*/(),]*(?:(?:Math\.(?:min|max))[\d\s.+\-*/(),]*)*$/, s);
  return Function(`return ${s}`)();
}

await test('walk.css：手机上展开的小地图盖在最上面（潘吉的泡泡藏起来）；多层的卡片放得下两个楼层标签', () => {
  const rules = cssRules(read('src/studio/walk/walk.css'));
  const top = (sel) => rules.filter((r) => !r.at.length && r.selectors.includes(sel)).reduce((a, r) => ({ ...a, ...r.decls }), {});
  const z = +top('.walk-map.is-open')['z-index'];
  assert.ok(z >= 1 && z < 110, `展开的小地图 z-index ${z}`);
  // 整层里别的东西都没有更高的 z（泡泡、工具轮、面板、摇杆按 DOM 顺序画，在它下面）
  for (const r of rules) if ('z-index' in r.decls && !r.selectors.includes('.walk-ui') && !r.selectors.includes('.walk-map.is-open')) assert.ok(+r.decls['z-index'] < z, r.selectors.join());
  const toolsCss = cssRules(read('src/studio/walk/walk-tools.css'));
  for (const r of toolsCss) if ('z-index' in r.decls) assert.ok(+r.decls['z-index'] < z, `walk-tools.css ${r.selectors.join()}`);
  const hidden = top('.walk-ui.is-map-open > .walk-tour');
  assert.equal(hidden.visibility, 'hidden');
  assert.equal(hidden['pointer-events'], 'none');
  assert.match(read('src/studio/walk/WalkMode.jsx'), /mapOpen && 'is-map-open'/);
  assert.match(read('src/studio/walk/WalkMode.jsx'), /onOpen=\{setMapOpen\}/);
  // 两个楼层标签（各 ≥ 44px）+ 间隔 2 + 底衬 3×2 + 卡片边距 8×2
  assert.ok(parseFloat(top('.walk-ui .walk-map.is-multi:not(.is-mini)')['min-width']) >= 2 * 44 + 2 + 6 + 16);
});

await test('walk.css：矮的屏幕上潘吉的泡泡最高到「回到全屋」那一行下面、不盖摇杆 / 工具轮 / 小地图（按 CSS 算：横着的 iPhone SE / 14、小安卓、许愿模式）', () => {
  const rules = cssRules(read('src/studio/walk/walk.css'));
  // 泡泡最矮多高：上下边距 12 + 10、边框 2、字幕至少一行（1.5em × 16px）、按钮那一行 44 + 10
  const MIN_BUBBLE = 22 + 2 + 24 + 54;
  const NATURAL = 22 + 2 + 4 * 24 + 54; // 四行字的泡泡（没有限高的时候；最长的英文台词在手机上是三行）
  const TOOLS_W = 7 * 60 + 6 * 2 + 2 * 5; // 居中的工具轮最窄多宽（七个 ≥ 60px、间隔 2、边距 5）
  // 内联样式里不再定最宽（交给 walk.css：矮的横屏上要换）
  assert.doesNotMatch(read('src/studio/walk/TourBubble.jsx'), /maxWidth/);
  const sizes = [
    [667, 320],
    [844, 340],
    [844, 390],
    [640, 360],
    [568, 320],
    [561, 320],
    [600, 400],
    [533, 320],
    [375, 548],
    [390, 660],
    [412, 860],
    [820, 1180],
    [1180, 820],
    [1440, 900],
    [1280, 520],
  ];
  for (const wish of [false, true])
    for (const [W, H] of sizes) {
      const tag = `${W}×${H}${wish ? ' 许愿' : ''}`;
      const gap = W <= 599 ? 12 : 16;
      const ui = activeDecls(rules, '.walk-ui', W, H);
      const wishUi = wish ? activeDecls(rules, '.is-wish .walk-ui', W, H) : {};
      const vars = { '--safe-t': gap, '--safe-b': gap, '--safe-l': gap, '--safe-r': gap, ...ui, ...wishUi };
      vars['--walk-dock-h'] = vars['--walk-tools-h']; // 带逛的时候没有打开的面板
      const v = (k) => calcPx(vars[k], vars, W, H);
      // 许愿模式另外的规则（.is-wish …：选择器更具体，盖过同一条的普通规则）
      const pick = (sel) => ({ ...activeDecls(rules, sel, W, H), ...(wish ? activeDecls(rules, `.is-wish ${sel}`, W, H) : {}) });
      const tour = pick('.walk-ui > .walk-tour');
      const bub = pick('.walk-ui > .walk-tour .walk-tour-bubble');
      const bottom = calcPx(tour.bottom, vars, W, H);
      const left = calcPx(tour.left, vars, W, H);
      const maxW = calcPx(tour['max-width'], vars, W, H);
      const maxH = bub['max-height'] ? calcPx(bub['max-height'], vars, W, H) : Infinity;
      const h = Math.max(MIN_BUBBLE, Math.min(NATURAL, maxH));
      const topY = H - bottom - h;
      const exitBottom = v('--safe-t') + 44;
      assert.ok(topY >= exitBottom, `${tag}：泡泡顶 ${topY} 盖住「回到全屋」（到 ${exitBottom}）`);
      if (H <= 560) assert.ok(maxH < Infinity, `${tag}：矮的屏幕要限高`);
      // 摇杆：左下 safe-l..+120，底边 --walk-joy-b
      const joyTop = H - v('--walk-joy-b') - 120;
      const joyRight = v('--safe-l') + 120;
      const bubBottom = H - bottom;
      assert.ok(left >= joyRight || bubBottom <= joyTop, `${tag}：泡泡盖住摇杆`);
      // 工具轮：底边 --walk-dock-b、高 --walk-tools-h（手机整行宽；别的居中 / 在摇杆右边）
      const toolsTop = H - v('--walk-dock-b') - v('--walk-tools-h');
      assert.ok(bubBottom <= toolsTop, `${tag}：泡泡底 ${bubBottom} 伸到工具轮（${toolsTop}）下面`);
      // 摇杆（左边）不顶到「回到全屋」那一行（也在左边）
      assert.ok(joyTop >= exitBottom, `${tag}：摇杆顶 ${joyTop} 盖住「回到全屋」（到 ${exitBottom}）`);
      // 摇杆和工具轮：工具轮在摇杆右边，或者整个在摇杆下面（居中的工具轮按 7 × 60 + 间隔 + 边距 ≈ 442 宽算）
      const dock = pick('.walk-dock');
      const centered = dock.left === '0';
      const toolsLeft = centered ? (W - TOOLS_W) / 2 : calcPx(dock.left, vars, W, H);
      const toolsRight = centered ? (W + TOOLS_W) / 2 : W - v('--safe-r');
      assert.ok(toolsLeft >= joyRight || toolsTop >= H - v('--walk-joy-b'), `${tag}：摇杆和工具轮叠在一起`);
      // 许愿模式：右下角外壳的胶囊（288×60，离边 16；≤ 560 宽时外壳自己在底下留一条栏、iframe 变矮，碰不到）
      //   → 工具轮整个在胶囊上面，或者在它左边
      if (wish && W >= 561) {
        const capTop = H - 16 - 60;
        const capLeft = W - 16 - 288;
        const toolsBottom = H - v('--walk-dock-b');
        assert.ok(toolsBottom <= capTop || toolsRight <= capLeft, `${tag}：工具轮（底 ${toolsBottom}、右 ${toolsRight}）钻到外壳的胶囊（顶 ${capTop}、左 ${capLeft}）下面`);
        // 量尺的控制条（摇杆旁边那几种排版里）：不盖摇杆、不伸到工具轮下面、不顶到「回到全屋」
        const bar = pick('.walk-measure-bar');
        if (bar.left && bar.left !== '0' && /walk-panel-b/.test(bar.bottom || '')) {
          const barBottom = H - calcPx(bar.bottom, vars, W, H);
          assert.ok(calcPx(bar.left, vars, W, H) >= joyRight || barBottom <= joyTop, `${tag}：量尺的控制条盖住摇杆`);
          assert.ok(barBottom <= toolsTop && barBottom - 52 >= exitBottom, `${tag}：量尺的控制条（底 ${barBottom}）放不下`);
          const barRight = calcPx(bar.left, vars, W, H) + calcPx(bar['max-width'], vars, W, H);
          assert.ok(barRight <= W - v('--safe-r') - (W <= 600 ? 120 : 162) || barBottom - 52 >= v('--safe-t') + (W <= 600 ? 120 : 400), `${tag}：量尺的控制条伸到小地图下面`);
        }
      }
      // 小地图（右上，最宽 162 / 248；手机上缩成 120 的圆）：和泡泡横着叠到时，泡泡在地图下面
      const mapW = W <= 600 ? 120 : W <= 1023 ? 162 : 248;
      const mapLeft = W - v('--safe-r') - mapW;
      if (left + maxW > mapLeft) assert.ok(topY >= v('--safe-t') + (W <= 600 ? 120 : 400), `${tag}：泡泡伸到小地图下面（右边到 ${left + maxW}，地图从 ${mapLeft}）`);
    }
});

// ───────────────────────── 样式表没下载成（ensureWalkCss） ─────────────────────────

/** 假的 document：getComputedStyle 量到的记号、页面上的 <link>（querySelectorAll 照选择器的意思筛）、<head> 收到了什么 */
function fakeDoc({ mark = '', links = [] } = {}) {
  const doc = {
    asked: [],
    head: { kids: [], appendChild: (n) => (doc.head.kids.push(n), n) },
    defaultView: { getComputedStyle: () => ({ getPropertyValue: (k) => (k === '--walk-css' ? mark : '') }) },
    querySelectorAll(sel) {
      doc.asked.push(sel);
      assert.match(sel, /rel="?stylesheet"?/);
      assert.match(sel, /href\*="\/assets\/WalkMode-"/);
      return links.filter((l) => l.rel === 'stylesheet' && l.href.includes('/assets/WalkMode-'));
    },
  };
  return { doc, root: { ownerDocument: doc } };
}
const linkOf = (href, rel = 'stylesheet') => ({
  rel,
  href,
  crossOrigin: '',
  cloneNode(deep) {
    assert.equal(deep, false);
    return { rel: this.rel, href: this.href, crossOrigin: this.crossOrigin, clone: true };
  },
});

await test('样式表没下载成（Vite 不会再加）：挂上去量不到 --walk-css 就把 WalkMode 的 <link> 复制一份、换个参数再挂；量得到 / 找不到就什么都不做', () => {
  const { ensureWalkCss } = B.WM;
  assert.equal(typeof ensureWalkCss, 'function');
  // 样式在（新的浏览器给 "1"，旧的 Chrome 前面带空格）
  for (const mark of ['1', ' 1']) {
    const { doc, root } = fakeDoc({ mark, links: [linkOf('https://x.test/assets/WalkMode-abc.css')] });
    assert.equal(ensureWalkCss(root), null, `记号 ${JSON.stringify(mark)}`);
    assert.equal(doc.head.kids.length, 0);
    assert.equal(doc.asked.length, 0, '样式在：不用去找 <link>');
  }
  // 样式不在：复制最后一个（别的样式表、预取的 JS 不算），网址换一个参数
  const first = linkOf('https://x.test/assets/WalkMode-abc.css');
  const { doc, root } = fakeDoc({ links: [linkOf('https://x.test/assets/studio-1.css'), linkOf('https://x.test/assets/WalkMode-abc.js', 'modulepreload'), first] });
  const made = ensureWalkCss(root);
  assert.ok(made?.clone, '挂的是复制出来的那一份');
  assert.deepEqual(doc.head.kids, [made]);
  assert.equal(made.rel, 'stylesheet');
  assert.match(made.href, /^https:\/\/x\.test\/assets\/WalkMode-abc\.css\?retry=\d+$/);
  assert.equal(first.href, 'https://x.test/assets/WalkMode-abc.css', '原来那个不动');
  // 又没成（上一次复制的那个也在页面上）：参数换掉、不越叠越长
  const { doc: doc2, root: root2 } = fakeDoc({ links: [first, linkOf('https://x.test/assets/WalkMode-abc.css?retry=1')] });
  assert.match(ensureWalkCss(root2).href, /^https:\/\/x\.test\/assets\/WalkMode-abc\.css\?retry=\d+$/);
  assert.equal(doc2.head.kids.length, 1);
  // 页面上没有那个 <link>（开发模式：样式是 JS 插进来的）/ 没挂上：什么都不做、不说
  const said = [];
  const keep = { error: console.error, warn: console.warn, log: console.log };
  Object.assign(console, { error: (...a) => said.push(a), warn: (...a) => said.push(a), log: (...a) => said.push(a) });
  try {
    const { doc: doc3, root: root3 } = fakeDoc({ links: [linkOf('https://x.test/assets/studio-1.css')] });
    assert.equal(ensureWalkCss(root3), null);
    assert.equal(doc3.head.kids.length, 0);
    assert.equal(ensureWalkCss(null), null);
    assert.equal(ensureWalkCss({}), null);
  } finally {
    Object.assign(console, keep);
  }
  assert.deepEqual(said, [], '不说话');
  // 记号在 walk.css 的 .walk-ui 上（不在 @media 里）；WalkMode 挂上去时（layout effect）就量
  const rules = cssRules(read('src/studio/walk/walk.css'));
  assert.ok(rules.some((r) => !r.at.length && r.selectors.length === 1 && r.selectors[0] === '.walk-ui' && r.decls['--walk-css'] === '1'), 'walk.css：.walk-ui { --walk-css: 1 }');
  assert.match(read('src/studio/walk/WalkMode.jsx'), /useLayoutEffect\(\(\) => \{\s*ensureWalkCss\(root\.current\);\s*\}, \[\]\);/);
});

await test('studio.css .walk-wait（等下载的那一颗）：宽 = 一行的宽、最宽到画面减 32px，放不下就折行（320 宽的英文不被切掉）', () => {
  const rules = cssRules(read('src/studio/studio.css')).filter((r) => !r.at.length && r.selectors.includes('.walk-wait'));
  const d = rules.reduce((a, r) => ({ ...a, ...r.decls }), {});
  assert.equal(d['max-width'], 'calc(100% - 32px)');
  assert.equal(d.width, 'max-content', 'left: 50% 的缩到合适只量得到半屏：不定宽的话折行折得太早');
  assert.equal(d['flex-wrap'], 'wrap');
});

await test('英文：这一块的字都在 en-walk.js 或总表；en-walk.js 不和总表打架', () => {
  for (const k of ['走', '刷颜色', '量尺', '小地图', '展开小地图', '收起小地图', '按住拖动来走 · 键盘 W A S D']) assert.ok(EW[k], k);
  for (const k of ['地板', '家具', '灯光', '拍照', '工具', '楼层', '撤销', '回到全屋', '走进去出了点问题，已回到全屋']) assert.ok(EN[k], `${k} 在总表`);
  for (const [k, v] of Object.entries(EW)) if (EN[k] != null) assert.equal(EN[k], v, k);
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
