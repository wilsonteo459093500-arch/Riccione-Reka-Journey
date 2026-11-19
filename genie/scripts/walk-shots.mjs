// 走进去 · 截图（docs/walk/SPEC.md；I5 视觉检查）：打包好的 studio.html 在无头 Chromium（SwiftShader）里，
// 四种画面 × 中 / 英，把「走进去」每一个要看的样子拍下来，再拼成几张对照图（ImageMagick montage）。
//
// 用法（在 genie/ 里，先 npx vite build）：
//   node scripts/walk-shots.mjs [--dist <打包目录>] [--out <目录>] [--sizes 1180x820,820x1180,412x860,1440x900]
//        [--langs zh,en] [--cases living,paint-after,…] [--quality fast|high] [--high] [--jobs 2] [--sheets] [--verbose]
//   --high：另外用高清档在 1180×820（中文）拍一组（HIGH_CASES），放在 <out>/high/。
//   --sheets：不开浏览器，只用 <out> 里已经有的图重新拼对照图（<out>/sheets/）。
//   每张图：<out>/<情形>-<宽x高>-<语言>.png；排版检查（按钮 < 44px、互相盖住、出了画面、字被截掉、盖住提示的位置 /
//   许愿模式外壳的胶囊）写进 <out>/report.json，有问题的在最后列出来。
//
// 情形（员工版 semid2，两层；许愿模式 condo3）：
//   pill 鸟瞰里的金色「走进去」· flyin 飞进去的半路 · tour 潘吉带逛的字幕 · living 站在客厅 · minimap 小地图（手机上展开）
//   · path 点了地板、正在走（路和目的地的圈）· tools 工具轮（刷颜色，还没点）· paint-before / paint-after 刷厨房柜子之前 / 之后
//   · floor 地板托盘 · furnish 选中沙发 · measure 量了一段 · night 灯光面板、晚上 · stairs 楼梯半路 · upstairs 楼上
//   · wish-walk / wish-photo 许愿模式：走着 / 收藏角度的面板（没有「下载这张」）。
// 「半路」靠时间放慢 / 定住：页面的 requestAnimationFrame 换成一个可以调快慢的钟（window.__warp），引擎、飞行、走路都按它走。
// 语言：和工作室的 ⋯ → 语言 一样（i18n.setLang：网址带 ?lang=en 重新载入）—— 直接用带 ?lang=en 的网址打开。
// 很慢：SwiftShader 上 fast 一帧 ~1 秒。一组（一种画面 × 一种语言）员工 ~8 分钟 + 许愿 ~3 分钟；整套 --jobs 2 约一小时。
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { serve, initScript, launch, loadFixture, settle, sleep, stairTarget } from './walk-pixels.mjs';
import * as N from '../src/studio/walk/nav.js';
import { tourStops } from '../src/studio/walk/tour.js';
import { fromStoredProject } from '../src/studio/store.js';
import { footprintOf } from '../src/studio/engine/furnish.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EYE = 1.55;

const SIZES = {
  '1180x820': { w: 1180, h: 820, touch: true },
  '820x1180': { w: 820, h: 1180, touch: true },
  '412x860': { w: 412, h: 860, touch: true, mobile: true },
  '1440x900': { w: 1440, h: 900, touch: false },
};
const STAFF_CASES = ['pill', 'flyin', 'tour', 'living', 'minimap', 'path', 'tools', 'paint-before', 'paint-after', 'floor', 'furnish', 'measure', 'night', 'stairs', 'upstairs'];
const WISH_CASES = ['wish-walk', 'wish-photo'];
const HIGH_CASES = ['flyin', 'tour', 'living', 'paint-after', 'furnish', 'night', 'stairs', 'upstairs'];
// 对照图：每张 3 × 2
const SHEETS = [
  ['a', ['pill', 'flyin', 'tour', 'living', 'minimap', 'path']],
  ['b', ['tools', 'paint-before', 'paint-after', 'floor', 'furnish', 'measure']],
  ['c', ['night', 'stairs', 'upstairs', 'minimap-zoom', 'wish-walk', 'wish-photo']],
];
const FLY_K = 1.1; // 「飞进去的半路」：飞了这么多秒（到 P1 是 1.6 秒：这时还在楼外面往下降，看得到整栋楼的正面）
const STAIR_RISE = 2.3; // 「楼梯半路」：眼睛比楼下高出这么多米时定住（U 形楼梯第二跑的一半：前面是往上的台阶、看得到楼上；第一跑对着平台那面墙）

function args(argv) {
  const o = {
    dist: join(ROOT, 'dist'),
    out: join(tmpdir(), 'walk-shots'),
    sizes: Object.keys(SIZES),
    langs: ['zh', 'en'],
    cases: null,
    quality: 'fast',
    high: false,
    jobs: 1,
    sheets: false,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} 后面要跟一个值`);
      return argv[++i];
    };
    if (a === '--dist') o.dist = resolve(val());
    else if (a === '--out') o.out = resolve(val());
    else if (a === '--sizes') o.sizes = val().split(',');
    else if (a === '--langs') o.langs = val().split(',');
    else if (a === '--cases') o.cases = val().split(',');
    else if (a === '--quality') o.quality = val();
    else if (a === '--high') o.high = true;
    else if (a === '--jobs') o.jobs = Math.max(1, Number(val()) || 1);
    else if (a === '--sheets') o.sheets = true;
    else if (a === '--verbose' || a === '-v') o.verbose = true;
    else throw new Error(`不认识的参数 ${a}`);
  }
  for (const s of o.sizes) if (!SIZES[s]) throw new Error(`不认识的画面 ${s}（${Object.keys(SIZES).join(' | ')}）`);
  return o;
}

// ───────────────────────── 导航（Node 里另建一份，挑站的地方） ─────────────────────────

function navFor(fixture) {
  const project = fromStoredProject(loadFixture(fixture));
  const nd = N.navDataOf(project.plan);
  const nav = N.buildNav(nd, project.furniture);
  const stops = Object.fromEntries(tourStops(project.plan, project.furniture, nav).map((s) => [s.id, s]));
  return { project, nd, nav, stops };
}

const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const dirOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

/** 站在离物件 dist 米、朝着它看的地方（往房间中心那边退，走得过去）→ { x, z, yaw } */
function standFor(nav, fi, item, room, dist = 1.8) {
  const b = footprintOf(item);
  const c = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 };
  const rc = room ? { x: room.x + room.w / 2, z: room.y + room.d / 2 } : c;
  let dx = rc.x - c.x;
  let dz = rc.z - c.z;
  const L = Math.hypot(dx, dz) || 1;
  dx /= L;
  dz /= L;
  for (let t = dist; t >= 0.6; t -= 0.1) {
    const q = { fi, x: c.x + dx * t, z: c.z + dz * t };
    if (N.clearance(nav, q) >= nav.radius + 0.05) return { x: q.x, z: q.z, yaw: yawTo(c.x - q.x, c.z - q.z) };
  }
  const q = N.nearest(nav, { fi, x: c.x + dx * dist, z: c.z + dz * dist });
  return { x: q.x, z: q.z, yaw: yawTo(c.x - q.x, c.z - q.z) };
}

const cellAt = (F, x, z) => {
  const ix = Math.floor((x - F.x0) / F.cell);
  const iz = Math.floor((z - F.z0) / F.cell);
  return ix < 0 || iz < 0 || ix >= F.nx || iz >= F.nz ? 1 : F.grid[iz * F.nx + ix];
};
/** 从 a 看得到 b 吗（中间没有墙；家具不算）：两头各让 skip 米 */
function sees(nav, fi, a, b, skip = 0.3) {
  const F = nav.floors[fi];
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  for (let s = skip; s < L - skip; s += 0.05) if (cellAt(F, a.x + ((b.x - a.x) * s) / L, a.z + ((b.z - a.z) * s) / L) === 1) return false;
  return true;
}
const roomy = (nav, q) => N.passable(nav, q) && N.clearance(nav, q) >= nav.radius + 0.08;

/** 房间的「对角线」视角：四个角、四边中点往里 inset 米，朝房间另一头看，中间没有墙、看得最远的那个 → { fi, x, z, yaw } | null */
function roomView(nav, fi, r, inset = 0.8) {
  const c = { x: r.x + r.w / 2, z: r.y + r.d / 2 };
  let best = null;
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]]) {
    const q = { fi, x: r.x + inset + (r.w - 2 * inset) * u, z: r.y + inset + (r.d - 2 * inset) * v };
    const t = { x: 2 * c.x - q.x, z: 2 * c.z - q.z };
    const L = Math.hypot(t.x - q.x, t.z - q.z);
    if (!roomy(nav, q) || !sees(nav, fi, q, t) || (best && L <= best.L)) continue;
    best = { ...q, yaw: yawTo(t.x - q.x, t.z - q.z), L };
  }
  return best;
}

/**
 * 物件正面前 dist 米、朝着它（CATALOG 的朝向：rot 0 → +z、90 → +x）：一个个距离试，要站得下、看得到它的正面 → { fi, x, z, yaw } | null
 */
function frontSpot(nav, fi, item, dists) {
  const b = footprintOf(item);
  const c = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 };
  const a = ((Number(item.rot) || 0) * Math.PI) / 180;
  const f = { x: Math.sin(a), z: Math.cos(a) };
  const half = Math.abs(f.x) > 0.5 ? (b.x1 - b.x0) / 2 : (b.z1 - b.z0) / 2;
  for (const d of dists) {
    const q = { fi, x: c.x + f.x * (half + d), z: c.z + f.z * (half + d) };
    if (roomy(nav, q) && sees(nav, fi, q, { x: c.x + f.x * half, z: c.z + f.z * half })) return { ...q, yaw: yawTo(c.x - q.x, c.z - q.z) };
  }
  return null;
}

// ───────────────────────── 页面里跑的 ─────────────────────────

/**
 * 可以调快慢的钟：requestAnimationFrame 给的时间 = base + (真时间 − anchor) × scale，最多到 cap（到了就定住）。
 * arm { when(), ms }：when() 第一次成立的那一帧起再走 ms 毫秒就定住；stop()：成立的那一帧就定住。frozenAt = 定住时画到第几帧。
 */
function warpInit() {
  const raf = window.requestAnimationFrame.bind(window);
  const W = (window.__warp = { scale: 1, base: 0, anchor: 0, cap: Infinity, arm: null, stop: null, frozen: false, frozenAt: -1 });
  W.now = (t) => Math.min(W.cap, W.base + (t - W.anchor) * W.scale);
  W.set = (scale, cap = Infinity) => {
    const t = performance.now();
    W.base = W.now(t);
    W.anchor = t;
    W.scale = scale;
    W.cap = cap;
    W.frozen = false;
    W.frozenAt = -1;
  };
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      const w = W.now(t);
      try {
        if (W.arm && W.arm.when()) {
          W.cap = w + W.arm.ms;
          W.arm = null;
        }
        if (W.stop && W.stop()) {
          W.cap = w;
          W.stop = null;
        }
      } catch {
        /* 条件里读的东西还没有 */
      }
      if (!W.frozen && w >= W.cap) {
        W.frozen = true;
        W.frozenAt = window.__genie?._frames || 0;
      }
      cb(W.now(t));
    });
}

/** 世界坐标点里找第一个：投影在画面里、最上面是画布、hitAt 打中的满足 want → { x, y, hit } | null（和 walk-e2e 一样） */
function findHit({ pts, want, margin = 40 }) {
  const e = window.__genie;
  const canvas = e.renderer.domElement;
  const r = canvas.getBoundingClientRect();
  const W = e.container.clientWidth || r.width;
  const H = e.container.clientHeight || r.height;
  for (const v of pts) {
    const p = window.__genieWalk.project(v);
    if (!p.visible) continue;
    const x = r.left + (p.x * r.width) / W;
    const y = r.top + (p.y * r.height) / H;
    if (x < r.left + margin || y < r.top + margin || x > r.right - margin || y > r.bottom - margin) continue;
    if (document.elementFromPoint(x, y) !== canvas) continue;
    const h = e.hitAt(x, y);
    if (!h) continue;
    const m = h.material;
    const info = { slot: m?.userData?.fixed ? null : (m?.userData?.slot ?? null), item: h.object.userData?.itemId ?? null, point: { x: h.point.x, y: h.point.y, z: h.point.z } };
    let ok = false;
    if (want.kind === 'floor') ok = Math.abs(h.point.y - want.y) < 0.03 && Math.hypot(h.point.x - v.x, h.point.z - v.z) < (want.tol ?? 0.3);
    else if (want.kind === 'slot') ok = info.slot === want.slot;
    else if (want.kind === 'item') ok = info.item === want.item;
    if (ok) return { x, y, hit: info };
  }
  return null;
}

/**
 * 排版检查（每张截图之后）：按钮 < 44px、几大块互相盖住、出了画面、字被截掉、盖住提示的位置（上面居中 safe-t + 60 / 手机 + 136）、
 * 许愿模式右下角外壳的胶囊（~288×60，手机上外壳有自己的底栏，不算）→ { issues: [...], notes: [...] }
 */
function layoutCheck({ wish }) {
  const W = innerWidth;
  const H = innerHeight;
  const root = document.querySelector('.walk-ui');
  const issues = [];
  const notes = [];
  if (!root) return { issues, notes };
  const shown = (el) => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const name = (el) => {
    const c = typeof el.className === 'string' ? el.className : el.className?.baseVal || '';
    const txt = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${c ? '.' + c.trim().split(/\s+/).join('.') : ''}${txt ? `「${txt}」` : ''}`;
  };
  const box = (el) => el.getBoundingClientRect();
  const hit = (a, b, tol = 1) => a.left < b.right - tol && b.left < a.right - tol && a.top < b.bottom - tol && b.top < a.bottom - tol;
  const inScroller = (el) => !!el.closest('.walk-tray-row, .walk-photo-list');

  // 按钮（能点的）≥ 44px
  for (const el of root.querySelectorAll('button, [role="button"], a[href], .walk-joy')) {
    if (!shown(el)) continue;
    const r = box(el);
    if (r.width < 43.5 || r.height < 43.5) issues.push(`小于 44px：${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  // 几大块
  const BLOCKS = ['.walk-top', '.walk-map', '.walk-joy', '.walk-tools', '.walk-panel-slot', '.walk-tour', '.walk-tour-start', '.walk-measure-bar'];
  const blocks = [];
  for (const sel of BLOCKS) for (const el of root.querySelectorAll(sel)) if (shown(el)) blocks.push({ sel, el, r: box(el) });
  for (let i = 0; i < blocks.length; i++)
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const b = blocks[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (hit(a.r, b.r)) issues.push(`互相盖住：${a.sel} × ${b.sel}`);
    }
  // 出了画面
  for (const { sel, r } of blocks) if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) issues.push(`出了画面：${sel} [${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)}]`);
  for (const el of root.querySelectorAll('button')) {
    if (!shown(el) || inScroller(el)) continue;
    const r = box(el);
    if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) issues.push(`按钮出了画面：${name(el)}`);
  }
  // 字被截掉 / 溢出
  for (const el of root.querySelectorAll('*')) {
    if (!shown(el) || el.closest('svg') || inScroller(el)) continue;
    const s = getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflowX) || /(auto|scroll)/.test(s.overflowY)) continue;
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && (el.tagName === 'BUTTON' || s.overflowX !== 'visible' || s.whiteSpace === 'nowrap')) {
      (s.textOverflow === 'ellipsis' ? notes : issues).push(`${s.textOverflow === 'ellipsis' ? '省略号' : '字溢出'}：${name(el)} ${el.scrollWidth} > ${el.clientWidth}`);
    }
  }
  // 样板的名字：一个词太长被切掉（只看横的；两行以内是故意的）
  for (const el of root.querySelectorAll('.walk-chip .chip-name b')) {
    if (!shown(el)) continue;
    if (el.scrollWidth > el.clientWidth + 1) issues.push(`样板名字被切掉：「${el.textContent.trim()}」 ${el.scrollWidth} > ${el.clientWidth}`);
  }
  // 提示的位置：上面居中
  const top = box(root.querySelector('.walk-top') || root).top;
  const phone = W <= 600;
  const tw = Math.min(460, W - 32);
  const toast = { left: (W - tw) / 2, right: (W + tw) / 2, top: top + (phone ? 136 : 60), bottom: top + (phone ? 136 : 60) + 48 };
  // 手机上点开的小地图是客人自己展开的（盖在上面一会儿，提示 z 110 在它上面）：只记一笔
  for (const b of blocks) if (hit(b.r, toast)) (b.el.matches('.walk-map.is-open') ? notes : issues).push(`盖住提示的位置：${b.sel}`);
  const realToast = document.querySelector('.s-toast.floating');
  if (realToast && shown(realToast)) {
    const tr = box(realToast);
    notes.push(`提示：「${realToast.textContent.trim().slice(0, 40)}」`);
    for (const b of blocks) if (hit(b.r, tr)) issues.push(`盖住提示：${b.sel}`);
  }
  // 许愿模式：右下角外壳的胶囊（手机上外壳有自己的底栏 → 不算）
  if (wish && W > 560) {
    const cap = { left: W - 16 - 288, right: W - 16, top: H - 16 - 60, bottom: H - 16 };
    for (const b of blocks) if (hit(b.r, cap)) issues.push(`盖住许愿模式的胶囊：${b.sel}`);
  }
  // 量出来的标签：别跑到按钮下面去
  const label = root.querySelector('.walk-measure-label');
  if (label && shown(label)) for (const b of blocks) if (hit(box(label), b.r)) notes.push(`量尺标签在 ${b.sel} 下面`);
  return { issues, notes };
}

/** 许愿模式：把外壳胶囊的位置画一个虚线框（只在截图里，看得出界面有没有让开） */
function capsuleGhost(on) {
  const old = document.getElementById('walk-shots-capsule');
  if (!on) return old?.remove();
  if (old || innerWidth <= 560) return;
  const d = document.createElement('div');
  d.id = 'walk-shots-capsule';
  d.style.cssText = 'position:fixed;right:16px;bottom:16px;width:288px;height:60px;border:1.5px dashed rgba(200,60,60,.7);border-radius:30px;z-index:200;pointer-events:none';
  document.body.appendChild(d);
}

// ───────────────────────── 一组（一种画面 × 一种语言 × 员工 / 许愿） ─────────────────────────

class Skip extends Error {}
const check = (ok, msg) => {
  if (!ok) throw new Skip(msg);
};

async function until(fn, timeout, what, ms = 300) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    last = await fn();
    if (last) return last;
    await sleep(ms);
  }
  throw new Skip(`${Math.round(timeout / 1000)} 秒还没${what}（最后：${JSON.stringify(last)?.slice(0, 160)}）`);
}

async function openJob(browser, origin, job, o) {
  const S = SIZES[job.size];
  const fx = loadFixture(job.fixture);
  const ctx = await browser.newContext({
    viewport: { width: S.w, height: S.h },
    deviceScaleFactor: 1,
    hasTouch: !!S.touch,
    isMobile: !!S.mobile,
    locale: job.lang === 'en' ? 'en-US' : 'zh-CN',
    timezoneId: 'Asia/Kuala_Lumpur',
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  // 只放行本机和网页字体（工作室自己的 Google Fonts：字宽和真机更像）
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(origin + '/') || /^(data|blob):/.test(u) || /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) return route.continue();
    return route.abort();
  });
  await ctx.addInitScript(initScript, { list: [fx], cur: fx.id, settings: { quality: job.quality }, lang: 'zh' });
  await ctx.addInitScript(warpInit);
  const page = await ctx.newPage();
  page.setDefaultTimeout(120e3);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource|AudioContext|play\(\)|NotAllowedError/.test(m.text())) errors.push(`console: ${m.text().slice(0, 240)}`);
  });
  const downloads = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  const qs = new URLSearchParams(job.wish ? { mode: 'wish' } : { staff: '1' });
  if (job.lang === 'en') qs.set('lang', 'en');
  await page.goto(`${origin}/studio.html?${qs}`, { waitUntil: 'load', timeout: 600e3 });
  await page.waitForFunction(() => !!window.__genie?.plan, null, { timeout: 600e3, polling: 250 });
  return { ctx, page, errors, downloads };
}

async function runJob(browser, origin, job, o) {
  const tag = `${job.size}-${job.lang}${job.quality === 'high' ? '-high' : ''}${job.wish ? '-wish' : ''}`;
  const log = (...a) => console.log(`  [${tag}]`, ...a);
  const dir = job.quality === 'high' ? join(o.out, 'high') : o.out;
  mkdirSync(dir, { recursive: true });
  const want = (id) => job.cases.includes(id);
  const res = { tag, shots: [], skipped: [], errors: [] };
  const { nav, nd, project, stops } = navFor(job.fixture);
  const { ctx, page, errors, downloads } = await openJob(browser, origin, job, o);
  const phone = SIZES[job.size].w <= 600;

  // ── 小工具 ──
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const pose = () => ev(() => window.__genieWalk?.pose?.() || null);
  /** 画面静下来：帧数不变、贴图补完（走着的时候飞行 / 路 / 门都停了），最多等 timeout（到时间照拍，记一笔） */
  const calm = async (quiet = 1500, timeout = 90e3) => {
    const t0 = Date.now();
    let last = null;
    let since = Date.now();
    while (Date.now() - t0 < timeout) {
      const s = await ev(() => {
        const e = window.__genie;
        const lib = e?.lib;
        const busy = !!(lib && (lib.queue?.length || lib.pumping)) || (lib?.boards?.stats?.()?.pending || 0) > 0;
        return `${e?._frames || 0}|${busy}`;
      });
      if (s !== last || s.endsWith('true')) {
        last = s;
        since = Date.now();
      } else if (Date.now() - since >= quiet) return true;
      await sleep(250);
    }
    log(`  （${Math.round(timeout / 1000)} 秒没静下来，照拍）`);
    return false;
  };
  const snap = async (id, { crop = null } = {}) => {
    const file = join(dir, `${id}-${job.size}-${job.lang}.png`);
    await page.screenshot({ path: file, timeout: 120e3, ...(crop ? { clip: crop } : {}) });
    const lay = crop ? { issues: [], notes: [] } : await ev(layoutCheck, { wish: !!job.wish });
    res.shots.push({ id, file, ...lay });
    log(`📷 ${id}${lay.issues.length ? `  ⚠ ${lay.issues.join(' | ')}` : ''}${o.verbose && lay.notes.length ? `  · ${lay.notes.join(' | ')}` : ''}`);
  };
  const step = async (id, fn) => {
    const t0 = Date.now();
    try {
      await fn();
      if (o.verbose) log(`✓ ${id} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    } catch (e) {
      const msg = e instanceof Skip ? e.message : String(e?.stack || e).split('\n').slice(0, 2).join(' | ');
      res.skipped.push({ id, msg });
      log(`✗ ${id} — ${msg}`);
    }
  };
  const tool = async (id) => {
    const cur = await ev(() => window.__genieWalk?.tool);
    if (cur !== id) await page.$eval(`[data-walk-tool="${id}"]`, (el) => el.click());
    await until(() => ev((t) => window.__genieWalk?.tool === t, id), 15e3, `换到工具 ${id}`);
    await sleep(400);
  };
  const gotoSpot = async (fi, s, pitch = 0) => {
    const ok = await ev(({ fi, s, pitch }) => {
      const w = window.__genieWalk;
      return w.goto({ floor: w.nav.floors[fi].id, x: s.x, z: s.z, yaw: s.yaw, pitch });
    }, { fi, s, pitch });
    check(ok === true, `goto 没成功（${ok}）`);
    await calm(1200);
  };
  /** 点画布（按下、抬起在同一个 evaluate 里：SwiftShader 一帧 ~1 秒，分开发会超过 TAP_MS 不算「点」） */
  const tap = (x, y) =>
    ev(([x, y]) => {
      const cv = document.querySelector('canvas.studio-canvas');
      const o = { clientX: x, clientY: y, pointerId: 31, pointerType: 'mouse', button: 0, buttons: 1, bubbles: true, isPrimary: true };
      cv.dispatchEvent(new PointerEvent('pointerdown', o));
      cv.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
    }, [x, y]);
  const click = (sel) => page.$eval(sel, (el) => el.click());
  const warp = (scale, cap) => ev(({ scale, cap }) => window.__warp.set(scale, cap ?? Infinity), { scale, cap });
  /** 定住以后画好了：定住那一帧之后又画过、再静一下 */
  const frozen = async (what, timeout = 240e3) => {
    await until(() => ev(() => window.__warp.frozen && (window.__genie._frames || 0) > window.__warp.frozenAt), timeout, what, 250);
    await calm(1200, 30e3);
  };
  /** 往前看的地上找能点的点（走得过去、离现在 d 米） */
  const floorAhead = (p, dists, spread = [0, 0.12, -0.12, 0.25, -0.25]) => {
    const pts = [];
    for (const d of dists)
      for (const da of spread) {
        const v = dirOf(p.yaw + da);
        const q = { fi: p.fi, x: p.x + v.x * d, z: p.z + v.z * d };
        if (N.passable(nav, q) && N.clearance(nav, q) >= nav.radius + 0.1) pts.push({ x: q.x, y: nd.floors[p.fi].elev, z: q.z });
      }
    return pts;
  };
  const room = (id) => {
    for (let fi = 0; fi < nd.floors.length; fi++) {
      const r = nd.floors[fi].rooms.find((x) => x.id === id);
      if (r) return { fi, r };
    }
    return null;
  };
  const liv = stops.tv || stops.living || stops.entrance;
  // 客厅：对角线看过去（带逛的电视那一站离电视墙太近，看不出是一间客厅）
  const lr = room(liv.room);
  const living = (lr && roomView(nav, lr.fi, lr.r)) || liv;

  try {
    await settle(page, `${tag} 开机`);
    await page.waitForSelector('[data-walk="enter"]', { state: 'visible', timeout: 60e3 });
    await sleep(5500); // 开机的提示（示范户型…）淡掉
    await calm(1500, 60e3);

    if (!job.wish && want('pill')) await step('pill', () => snap('pill'));

    // ── 飞进去（要拍半路：放慢 + 飞了 FLY_K 秒定住） ──
    if (!job.wish && want('flyin')) {
      await ev((ms) => {
        window.__warp.set(0.12);
        window.__warp.arm = { when: () => !!window.__genie.walk, ms };
      }, FLY_K * 1000);
    }
    await click('[data-walk="enter"]');
    if (!job.wish && want('flyin'))
      await step('flyin', async () => {
        await frozen('飞到半路');
        // 放慢了以后「飞太久」的保险（7 秒露出「回到全屋」）会先出来：这张图里不要它
        await ev(() => document.querySelector('.walk-ui')?.classList.remove('is-stuck'));
        await sleep(600);
        await snap('flyin');
      });
    await warp(1);
    await until(() => ev(() => window.__genieWalk?.phase === 'walking' && !!document.querySelector('.walk-ui.is-live')), 300e3, '走进去', 500);
    await sleep(800);

    // ── 潘吉带逛（第一次走进去自动开始） ──
    if (!job.wish && want('tour'))
      await step('tour', async () => {
        // 第一站（大门里面）开口就拍：不等太久（她说完会自己走去下一站）
        await until(
          () => ev(() => {
            const st = window.__genieWalk.tour.state();
            return st.running && st.phase === 'talking' && !!document.querySelector('.walk-tour-text')?.textContent.trim();
          }),
          120e3,
          '带逛开口',
          150,
        );
        await sleep(500);
        await snap('tour');
      });
    if (await ev(() => window.__genieWalk.tour.running)) {
      await click('.walk-tour-skip').catch(() => ev(() => window.__genieWalk.tour.stop()));
      await until(() => ev(() => !window.__genieWalk.tour.running), 30e3, '停下带逛');
    }

    if (job.wish) {
      await step('wish-walk', async () => {
        await gotoSpot(living.fi, living, -0.05);
        await ev(capsuleGhost, true);
        await snap('wish-walk');
      });
      await step('wish-photo', async () => {
        await tool('photo');
        await click('[data-walk-act="mark"]');
        await until(() => ev(() => document.querySelectorAll('.walk-photo-item').length >= 1), 15e3, '多一个收藏');
        check(!(await page.$('[data-walk-act="shoot"]')), '许愿模式出现了「下载这张」');
        await calm(1500);
        await snap('wish-photo');
        check(downloads.length === 0, `许愿模式下载了 ${downloads.join(', ')}`);
      });
      await ev(capsuleGhost, false);
      return res;
    }

    // ── 站在客厅 ──
    if (want('living') || want('minimap'))
      await step('living', async () => {
        await gotoSpot(living.fi, living, -0.05);
        if (want('living')) await snap('living');
      });

    // ── 小地图（手机上点开） ──
    if (want('minimap'))
      await step('minimap', async () => {
        if (phone) {
          await click('.walk-map.is-mini');
          await until(() => ev(() => !!document.querySelector('.walk-map.is-open')), 10e3, '展开小地图');
          await calm(1200);
        }
        await snap('minimap');
        const r = await ev(() => {
          const b = document.querySelector('.walk-map')?.getBoundingClientRect();
          return b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null;
        });
        if (r) {
          const pad = 24;
          const x = Math.max(0, r.x - pad);
          const y = Math.max(0, r.y - pad);
          await snap('minimap-zoom', { crop: { x, y, width: Math.min(SIZES[job.size].w - x, r.w + 2 * pad), height: Math.min(SIZES[job.size].h - y, r.h + 2 * pad) } });
        }
        if (phone) await click('.walk-map-close').catch(() => {});
      });

    // ── 点了地板、正在走：路 + 目的地的圈 ──
    if (want('path'))
      await step('path', async () => {
        await gotoSpot(living.fi, living, -0.16);
        const p = await pose();
        const h = await ev(findHit, { pts: floorAhead(p, [3.4, 3.0, 3.8, 2.6, 4.2, 2.2]), want: { kind: 'floor', y: nd.floors[p.fi].elev } });
        check(h, '画面里找不到点得到的地板');
        await ev((p0) => {
          window.__warp.set(0.1);
          window.__warp.stop = () => {
            const q = window.__genieWalk.pose();
            return Math.hypot(q.x - p0.x, q.z - p0.z) > 0.35;
          };
        }, p);
        await tap(h.x, h.y);
        await frozen('走起来');
        await snap('path');
        await warp(1);
        await until(async () => {
          const a = await pose();
          await sleep(1200);
          const b = await pose();
          return Math.hypot(a.x - b.x, a.z - b.z) < 1e-3;
        }, 120e3, '走到');
      });

    // ── 厨房：刷颜色 ──
    const kit = stops.kitchen;
    const run = project.furniture.find((f) => f.kind === 'kitchenRun' && kit && f.room === kit.room) || project.furniture.find((f) => f.kind === 'kitchenRun');
    const kroom = run ? room(run.room) : null;
    const cabinetHit = async () => {
      const b = footprintOf(run);
      const p = await pose();
      const elev = nd.floors[p.fi].elev;
      const fx = Math.abs(p.x - (b.x0 + b.x1) / 2) > Math.abs(p.z - (b.z0 + b.z1) / 2);
      const pts = [];
      for (const y of [0.45, 0.3, 0.6, 0.75])
        for (const k of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          const x = b.x0 + (b.x1 - b.x0) * k;
          const z = b.z0 + (b.z1 - b.z0) * k;
          pts.push(fx ? { x: p.x > (b.x0 + b.x1) / 2 ? b.x1 : b.x0, y: elev + y, z } : { x, y: elev + y, z: p.z > (b.z0 + b.z1) / 2 ? b.z1 : b.z0 });
        }
      return ev(findHit, { pts, want: { kind: 'slot', slot: 'cabinetry' } });
    };
    let kitSpot = null;
    const toKitchen = async () => {
      check(run && kroom, '方案里没有厨房柜');
      // 站在柜子正面前 ~2.6m（可以站到隔壁敞开的房间里）看整排；不行就用带逛的厨房那一站
      if (!kitSpot) kitSpot = frontSpot(nav, kroom.fi, run, [2.6, 2.3, 2.9, 2.0, 1.7]) || (kit && kit.room === run.room ? kit : { ...standFor(nav, kroom.fi, run, kroom.r, 1.9), fi: kroom.fi });
      await gotoSpot(kroom.fi, kitSpot, -0.2);
      if (!(await cabinetHit())) {
        kitSpot = { ...standFor(nav, kroom.fi, run, kroom.r, 1.9), fi: kroom.fi };
        await gotoSpot(kroom.fi, kitSpot, -0.28);
      }
    };
    const openCabinetTray = async () => {
      await tool('paint');
      const h = await cabinetHit();
      check(h, '画面里点不到柜体');
      await tap(h.x, h.y);
      const slot = await until(() => ev(() => document.querySelector('.walk-tray[data-walk-slot]')?.getAttribute('data-walk-slot')), 20e3, '出托盘');
      check(slot === 'cabinetry', `托盘是 ${slot}，不是 cabinetry`);
    };
    if (want('tools') || want('paint-before') || want('paint-after')) {
      await step('tools', async () => {
        await tool('walk');
        await toKitchen();
        await tool('paint');
        await calm(1200);
        if (want('tools')) await snap('tools');
      });
      await step('paint-before', async () => {
        await openCabinetTray();
        await calm(1500);
        if (want('paint-before')) await snap('paint-before');
      });
      if (want('paint-after'))
        await step('paint-after', async () => {
          if (!(await page.$('.walk-tray[data-walk-slot="cabinetry"]'))) await openCabinetTray();
          // 挑一个看得出变化、又好看的：漆那一组里有颜色的（鼠尾草绿 / 雾蓝…），没有就木那一组的最后一个
          const segs = await ev(() => [...document.querySelectorAll('.walk-tray .walk-seg button')].map((b) => b.textContent.trim()));
          if (segs.length > 1) {
            await page.$$eval('.walk-tray .walk-seg button', (bs) => bs[bs.length - 1].click());
            await sleep(500);
          }
          const mats = await ev(() => [...document.querySelectorAll('.walk-tray .walk-chip:not(.is-cur)')].map((b) => b.getAttribute('data-mat')));
          check(mats.length, '托盘里没有别的材质');
          const mat = mats.find((m) => /sage|green|olive|mist|blue|navy|clay|terracotta/.test(m)) || mats[mats.length - 1];
          await click(`.walk-tray .walk-chip[data-mat="${mat}"]`);
          await sleep(700);
          if (await page.$('.s-modal-wrap')) {
            const ok = await page.$('.s-modal-wrap .btn-gold, .s-modal-wrap button.primary, .s-modal-wrap [data-sfx="confirm"]');
            if (ok) await ok.evaluate((el) => el.click());
          }
          const f0 = await ev(() => window.__genie._frames || 0);
          await until(() => ev((id) => window.__genie.lib.current.cabinetry === id, mat), 30e3, `柜体换成 ${mat}`);
          // 提示（api.flash，~2.6 秒）还在的时候拍：新材质画上去了（过了两帧、贴图补完）就拍
          await until(
            () => ev((f0) => {
              const e = window.__genie;
              const lib = e.lib;
              // 引擎只在有变化时才画：站着不动、高亮也淡了（机器忙的时候）→ 叫它画，不然等不到「又画了两帧」
              e.dirty = true;
              return (e._frames || 0) >= f0 + 2 && !lib.queue?.length && !lib.pumping;
            }, f0),
            20e3,
            '画上新材质',
            150,
          );
          await snap('paint-after');
        });
    }

    // ── 客厅：地板 / 家具 / 量尺 / 晚上 ──
    if (want('floor'))
      await step('floor', async () => {
        await tool('walk');
        await gotoSpot(living.fi, living, -0.3);
        await tool('floor');
        await until(() => ev(() => !!document.querySelector('.walk-tray[data-walk-slot]')), 15e3, '出地板托盘');
        await calm(1500);
        await snap('floor');
      });
    const sofa = project.furniture.find((f) => f.kind === 'sofa' && f.room === living.room) || project.furniture.find((f) => f.kind === 'sofa');
    if (want('furnish'))
      await step('furnish', async () => {
        check(sofa, '没有沙发');
        const sr = room(sofa.room);
        await tool('walk');
        // 沙发正面前 ~2m（看得到坐垫），站不下就往房间中间退
        const s = frontSpot(nav, sr.fi, sofa, [2.0, 1.7, 2.3, 1.4]) || standFor(nav, sr.fi, sofa, sr.r, 2.4);
        await gotoSpot(sr.fi, s, -0.32);
        await tool('furnish');
        const at = await ev((id) => {
          const d = window.__genie.itemData.get(id);
          return d ? { x: d.x, z: d.z } : null;
        }, sofa.id);
        check(at, `引擎里没有 ${sofa.id}`);
        const elev = nd.floors[sr.fi].elev;
        const pts = [];
        for (const y of [0.35, 0.5, 0.25, 0.65]) for (const [ox, oz] of [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25], [0.5, 0], [-0.5, 0]]) pts.push({ x: at.x + ox, y: elev + y, z: at.z + oz });
        const h = await ev(findHit, { pts, want: { kind: 'item', item: sofa.id } });
        check(h, '画面里点不到沙发');
        await tap(h.x, h.y);
        await until(() => ev((id) => document.querySelector('.walk-furnish')?.getAttribute('data-walk-item') === id, sofa.id), 15e3, '选中沙发');
        await calm(1500);
        await snap('furnish');
      });
    if (want('measure'))
      await step('measure', async () => {
        await tool('walk');
        await gotoSpot(living.fi, living, -0.36);
        await tool('measure');
        const p = await pose();
        const elev = nd.floors[p.fi].elev;
        // 一点在左前方、一点在右前方远一些（斜着量一段 ~2m）
        const a = await ev(findHit, { pts: floorAhead(p, [1.8, 2.1, 1.5, 2.4], [0.3, 0.22, 0.38, 0.14]), want: { kind: 'floor', y: elev } });
        check(a, '找不到第一个地板点');
        const far = floorAhead(p, [3.0, 2.7, 3.4, 2.4, 3.8], [-0.2, -0.12, -0.28, -0.05, 0.05]).filter((q) => Math.hypot(q.x - a.hit.point.x, q.z - a.hit.point.z) > 1.2);
        const b = await ev(findHit, { pts: far, want: { kind: 'floor', y: elev } });
        check(b, '找不到第二个地板点');
        await tap(a.x, a.y);
        await sleep(1500);
        await tap(b.x, b.y);
        await until(() => ev(() => document.querySelector('.walk-measure-label')?.style.visibility === 'visible'), 30e3, '出量出来的标签');
        await calm(1500);
        await snap('measure');
        await ev(() => window.__genieWalk.clearMeasure());
      });
    if (want('night'))
      await step('night', async () => {
        await tool('walk');
        await gotoSpot(living.fi, living, -0.05);
        await tool('light');
        await click('[data-walk-light="night"]');
        await until(() => ev(() => window.__genie.day?.night >= 0.5), 20e3, '变成晚上');
        await sleep(1000);
        await calm(1500);
        await snap('night');
        await click('[data-walk-light="day"]');
        await until(() => ev(() => window.__genie.day?.night < 0.5), 20e3, '回到白天');
      });

    // ── 楼梯（两层）：楼梯半路定住 → 楼上 ──
    if (nd.floors.length > 1 && (want('stairs') || want('upstairs'))) {
      // 楼上：看得最远的那一间（不是浴室 / 阳台）的对角线；没有 → 最大的房间正中
      const views = nd.floors[1].rooms
        .filter((r) => !/bath|balcony|stair|void|walkin/.test(r.type) && !r.stairId)
        .map((r) => roomView(nav, 1, r))
        .filter(Boolean)
        .sort((a, b) => b.L - a.L);
      const up = views[0] || { ...stairTarget(job.fixture), yaw: 0 };
      await step('stairs', async () => {
        await tool('walk');
        const st = stops.stairs || nav.stairs[0]?.entry;
        if (st) await gotoSpot(0, { x: st.x, z: st.z, yaw: st.yaw ?? 0 }, 0);
        const elev0 = nd.floors[0].elev;
        if (want('stairs'))
          await ev((y) => {
            window.__warp.set(1);
            window.__warp.stop = () => window.__genie.camera.position.y >= y;
          }, elev0 + EYE + STAIR_RISE);
        await ev((t) => {
          window.__shots = { arrived: null };
          window.__genieWalk.walkTo(t).then((r) => (window.__shots.arrived = r));
        }, { fi: up.fi, x: up.x, z: up.z, yaw: up.yaw });
        if (want('stairs')) {
          await frozen('走到楼梯半路', 300e3);
          await snap('stairs');
          await warp(1);
        }
      });
      await step('upstairs', async () => {
        await until(() => ev(() => window.__shots?.arrived != null), 300e3, '走到楼上', 1000);
        const p = await pose();
        check(p.fi === 1, `到了以后 fi = ${p.fi}`);
        await calm(2000);
        if (want('upstairs')) await snap('upstairs');
      });
    }
  } finally {
    res.errors = errors;
    res.downloads = downloads.length;
    await ctx.close();
  }
  return res;
}

// ───────────────────────── 对照图 ─────────────────────────

function sheets(o) {
  const out = join(o.out, 'sheets');
  mkdirSync(out, { recursive: true });
  const have = new Set(existsSync(o.out) ? readdirSync(o.out) : []);
  const made = [];
  const build = (name, files, labels) => {
    if (!files.length) return;
    const file = join(out, `${name}.png`);
    const a = ['-font', 'DejaVu-Sans', '-pointsize', '15', '-background', 'gray86', '-fill', 'gray15'];
    files.forEach((f, i) => a.push('-label', labels[i], f));
    a.push('-tile', '3x', '-geometry', '620x620>+10+10', file);
    execFileSync('montage', a);
    made.push(file);
  };
  for (const size of Object.keys(SIZES))
    for (const lang of ['zh', 'en'])
      for (const [k, list] of SHEETS) {
        const ids = list.filter((id) => have.has(`${id}-${size}-${lang}.png`));
        build(`${size}-${lang}-${k}`, ids.map((id) => join(o.out, `${id}-${size}-${lang}.png`)), ids.map((id) => `${id} · ${size} · ${lang}`));
      }
  // 同一个情形、四种画面放一起（中文 / 英文各一张）：几个重要的
  for (const id of ['living', 'paint-after', 'night', 'tour', 'wish-photo'])
    for (const lang of ['zh', 'en']) {
      const sz = Object.keys(SIZES).filter((s) => have.has(`${id}-${s}-${lang}.png`));
      if (sz.length > 1) build(`by-case-${id}-${lang}`, sz.map((s) => join(o.out, `${id}-${s}-${lang}.png`)), sz.map((s) => `${id} · ${s} · ${lang}`));
    }
  const hd = join(o.out, 'high');
  if (existsSync(hd)) {
    const files = readdirSync(hd).filter((f) => f.endsWith('.png')).sort((a, b) => HIGH_CASES.indexOf(a.split('-1180')[0]) - HIGH_CASES.indexOf(b.split('-1180')[0]));
    for (let i = 0; i < files.length; i += 6) build(`high-${i / 6 + 1}`, files.slice(i, i + 6).map((f) => join(hd, f)), files.slice(i, i + 6).map((f) => `high · ${f.replace(/\.png$/, '')}`));
  }
  return made;
}

// ───────────────────────── 主程序 ─────────────────────────

async function main() {
  const o = args(process.argv.slice(2));
  mkdirSync(o.out, { recursive: true });
  if (o.sheets) {
    for (const f of sheets(o)) console.log(f);
    return 0;
  }
  if (!existsSync(join(o.dist, 'studio.html'))) throw new Error(`${o.dist} 里没有 studio.html —— 先 npx vite build（--dist 指到打包目录）`);
  const pick = (all) => (o.cases ? all.filter((c) => o.cases.includes(c)) : all);
  const jobs = [];
  for (const size of o.sizes)
    for (const lang of o.langs) {
      const staff = pick(STAFF_CASES);
      if (staff.length) jobs.push({ size, lang, quality: o.quality, fixture: 'semid2', wish: false, cases: staff });
      const wish = pick(WISH_CASES);
      if (wish.length) jobs.push({ size, lang, quality: o.quality, fixture: 'condo3', wish: true, cases: wish });
    }
  if (o.high) jobs.push({ size: '1180x820', lang: 'zh', quality: 'high', fixture: 'semid2', wish: false, cases: o.cases ? HIGH_CASES.filter((c) => o.cases.includes(c)) : HIGH_CASES });
  const { srv, origin } = await serve(o.dist);
  console.log(`打包目录 ${o.dist} → ${origin}；截图 ${o.out}；${jobs.length} 组，${o.jobs} 个浏览器`);
  const T0 = Date.now();
  const all = [];
  let next = 0;
  const worker = async () => {
    const browser = await launch();
    try {
      while (next < jobs.length) {
        const job = jobs[next++];
        const t0 = Date.now();
        console.log(`▶ ${job.size} ${job.lang} ${job.quality}${job.wish ? ' 许愿模式' : ''}：${job.cases.join(' ')}`);
        try {
          const r = await runJob(browser, origin, job, o);
          all.push(r);
          console.log(`■ ${r.tag}：${r.shots.length} 张，${((Date.now() - t0) / 1000).toFixed(0)} 秒${r.skipped.length ? `，${r.skipped.length} 个没拍成` : ''}`);
        } catch (e) {
          console.log(`✗ ${job.size} ${job.lang}${job.wish ? ' 许愿' : ''}：${String(e?.message || e).split('\n')[0]}`);
          all.push({ tag: `${job.size}-${job.lang}${job.wish ? '-wish' : ''}`, shots: [], skipped: [{ id: '*', msg: String(e?.message || e) }], errors: [] });
        }
      }
    } finally {
      await browser.close();
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(o.jobs, jobs.length) }, worker));
  } finally {
    srv.close();
  }
  writeFileSync(join(o.out, 'report.json'), `${JSON.stringify({ at: new Date().toISOString(), dist: o.dist, jobs: all }, null, 2)}\n`);
  const made = sheets(o);
  let bad = 0;
  console.log('\n排版检查：');
  for (const r of all) {
    for (const s of r.shots) if (s.issues.length) (bad++, console.log(`  ⚠ ${s.id}-${r.tag}：${s.issues.join(' | ')}`));
    for (const s of r.skipped) (bad++, console.log(`  ✗ ${r.tag} ${s.id}：${s.msg}`));
    for (const e of r.errors || []) console.log(`  ! ${r.tag} ${e}`);
  }
  console.log(`${bad ? `✗ ${bad} 处要看` : '✓ 没有排版问题'}；对照图 ${made.length} 张在 ${join(o.out, 'sheets')}；用时 ${((Date.now() - T0) / 1000).toFixed(0)} 秒`);
  return bad ? 1 : 0;
}

// 别的脚本（视频、调试）也用这些
export { SIZES, warpInit, openJob, findHit, layoutCheck, navFor, roomView, frontSpot, standFor, dirOf, capsuleGhost };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`✗ ${err?.stack || err}`);
      process.exit(2);
    },
  );
