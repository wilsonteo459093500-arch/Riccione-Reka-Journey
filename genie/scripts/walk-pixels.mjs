// 走进去的「鸟瞰不变」像素守门（SPEC §1 末尾、§9）：打包好的 studio.html 在无头 Chromium（SwiftShader）里打开冻结样本，
// 等引擎完全静下来（贴图补完、板材照片、日光小图、取景动画、主点平移都结束），只截 WebGL 画布（界面全部藏起来），
// 同时记下引擎的取景状态 { insets, vo, voTo, 镜头位置 / 朝向, controls.target, fov, floorView … }。
// 每一张都截两次、一模一样才算数（截图前后引擎一帧都没画）。
//
// 用法（在 genie/ 里）：
//   node scripts/walk-pixels.mjs --save  --out <目录> [--dist dist]   拍基准：<目录>/baseline.json + 每个情形一张 PNG
//   node scripts/walk-pixels.mjs --check --out <目录> [--dist dist]   拍同样的一组，和基准比（哈希 + JSON）；不一样 → 差异图、退出 1
//   node scripts/walk-pixels.mjs --walk  --out <目录> [--scenario enter|stairs|rotate|all]
//        模式 B：走进去之前截一张 → 点「走进去」→ （走一段）→ 点「回到全屋」→ 静下来再截一张，必须和之前的一模一样
//        （rotate：走着的时候把画面转成竖的再退出，要和不走进去、直接转成竖的一模一样）。还没有「走进去」的按钮 → 跳过。
//   其他：--only <子串>（只跑 id 含这个子串的情形）· --jobs <n>（同时开几个浏览器，默认 1）· --list（只列出情形）
//         --init <file.js>（调试用：在页面脚本之前多注入一段，比如模拟的走进去控制器）· --verbose
//         --check 和 --walk 可以一起用（先比基准，再跑模式 B）。
//
// 情形：样本 {condo3, semid2} × 楼层 {全部, 一楼}（单层的 condo3 只有「全部」）× 画质 {fast, high} × 画面 {1180×820, 820×1180}，
//       员工版（?staff=1）；另外 condo3 / fast / 1180×820 的许愿模式（?mode=wish）、semid2 / fast / 1180×820 的晚上 20:30。
// 稳定性：只放行本机静态服务器的请求（网页字体、外网一律挡掉 → 每次都是同一套后备字体）；Math.random 固定种子（GTAO 的噪声）；
//        语言固定中文；画质写进设置（引擎开机时读 genie.settings.v1）；楼层写在方案的 floorView 上
//        （和 StudioApp 开机时一样：setScene → setFloorView(id, { instant, quiet })）。
// 很慢：SwiftShader 上 fast 一帧 ~1 秒、high ~4 秒，开机还要补十几张贴图（每张一帧）。整组 14 个情形 --jobs 3 约 12 分钟；
//        别和其他吃 CPU 的事同时跑（开机会超时，超时的情形自动再试一次）。
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = join(ROOT, 'test', 'fixtures', 'walk');

// ───────────────────────── 参数 ─────────────────────────

function args(argv) {
  const o = { save: false, check: false, walk: false, list: false, out: '', dist: join(ROOT, 'dist'), only: '', jobs: 1, scenario: 'enter', init: '', verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} 后面要跟一个值`);
      return argv[++i];
    };
    if (a === '--save') o.save = true;
    else if (a === '--check') o.check = true;
    else if (a === '--walk') o.walk = true;
    else if (a === '--list') o.list = true;
    else if (a === '--verbose' || a === '-v') o.verbose = true;
    else if (a === '--out') o.out = resolve(val());
    else if (a === '--dist') o.dist = resolve(val());
    else if (a === '--only') o.only = val();
    else if (a === '--jobs') o.jobs = Math.max(1, Number(val()) || 1);
    else if (a === '--scenario') o.scenario = val();
    else if (a === '--init') o.init = resolve(val());
    else throw new Error(`不认识的参数 ${a}`);
  }
  if (!o.out) o.out = join(tmpdir(), 'walk-pixels');
  return o;
}

// ───────────────────────── 情形 ─────────────────────────

const VIEWPORTS = [
  { w: 1180, h: 820 },
  { w: 820, h: 1180 },
];
const QUALITIES = ['fast', 'high'];

function loadFixture(id) {
  return JSON.parse(readFileSync(join(FIX, `${id}.json`), 'utf8'));
}

/** 全部情形（顺序固定）：{ id, fixture, view, quality, w, h, mode: 'staff' | 'wish', time? } */
function matrix() {
  const out = [];
  for (const fixture of ['condo3', 'semid2']) {
    const floors = loadFixture(fixture).plan.floors;
    // 单层：引擎把任何楼层都当「全部」（setScene 里 stack.floors.length > 1 才认），一楼那一张和「全部」是同一张
    const views = floors.length > 1 ? ['all', floors[0].id] : ['all'];
    for (const view of views)
      for (const quality of QUALITIES)
        for (const { w, h } of VIEWPORTS) out.push({ id: `${fixture}-${view}-${quality}-${w}x${h}`, fixture, view, quality, w, h, mode: 'staff' });
  }
  out.push({ id: 'condo3-all-fast-1180x820-wish', fixture: 'condo3', view: 'all', quality: 'fast', w: 1180, h: 820, mode: 'wish' });
  out.push({ id: 'semid2-all-fast-1180x820-night', fixture: 'semid2', view: 'all', quality: 'fast', w: 1180, h: 820, mode: 'staff', time: 20.5 });
  return out;
}

/** 模式 B 的情形：每个样本 fast / 1180×820 / 员工版 */
function walkCases(scenarios) {
  const out = [];
  for (const fixture of ['condo3', 'semid2'])
    for (const scenario of scenarios) out.push({ id: `walk-${scenario}-${fixture}`, fixture, view: 'all', quality: 'fast', w: 1180, h: 820, mode: 'staff', scenario });
  return out;
}

// ───────────────────────── 静态服务器（打包目录） ─────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

function serve(dist) {
  const base = resolve(dist);
  const srv = createServer((req, res) => {
    let file = null;
    try {
      const p = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      file = normalize(join(base, p));
      if (file !== base && !file.startsWith(base + sep)) file = null;
      else if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    } catch {
      file = null;
    }
    if (!file || !existsSync(file)) {
      res.writeHead(404, { 'cache-control': 'no-store' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ srv, origin: `http://127.0.0.1:${srv.address().port}` })));
}

// ───────────────────────── PNG（只认 Chromium 截出来的：8 位 RGB / RGBA、不隔行） ─────────────────────────

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function decodePNG(buf) {
  let pos = 8;
  let w = 0;
  let h = 0;
  let depth = 0;
  let type = 0;
  let lace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      lace = data[12];
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
  }
  if (depth !== 8 || lace !== 0 || (type !== 2 && type !== 6)) throw new Error(`PNG 格式不支持（位深 ${depth}、类型 ${type}、隔行 ${lace}）`);
  const bpp = type === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      rgba[o] = line[x * bpp];
      rgba[o + 1] = line[x * bpp + 1];
      rgba[o + 2] = line[x * bpp + 2];
      rgba[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { w, h, rgba };
}

function encodePNG(w, h, rgba) {
  const chunk = (kind, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(kind, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** 两张截图逐像素比：{ changed, max, png（变了的像素标红，其余是变暗的灰度底图） } */
function pixelDiff(aBuf, bBuf) {
  const A = decodePNG(aBuf);
  const B = decodePNG(bBuf);
  if (A.w !== B.w || A.h !== B.h) return { changed: -1, max: 255, size: `${A.w}×${A.h} → ${B.w}×${B.h}`, png: null };
  const out = Buffer.alloc(A.w * A.h * 4);
  let changed = 0;
  let max = 0;
  for (let i = 0; i < out.length; i += 4) {
    const d = Math.max(Math.abs(A.rgba[i] - B.rgba[i]), Math.abs(A.rgba[i + 1] - B.rgba[i + 1]), Math.abs(A.rgba[i + 2] - B.rgba[i + 2]), Math.abs(A.rgba[i + 3] - B.rgba[i + 3]));
    if (d) {
      changed++;
      if (d > max) max = d;
      out[i] = 255;
      out[i + 1] = Math.max(0, 64 - d);
      out[i + 2] = Math.max(0, 64 - d);
    } else {
      const g = Math.round((A.rgba[i] * 0.3 + A.rgba[i + 1] * 0.59 + A.rgba[i + 2] * 0.11) * 0.35);
      out[i] = out[i + 1] = out[i + 2] = g;
    }
    out[i + 3] = 255;
  }
  return { changed, max, png: encodePNG(A.w, A.h, out) };
}

// ───────────────────────── 浏览器里跑的小段 ─────────────────────────

/**
 * 开机前：样本方案、现在的方案、画质、语言写进 localStorage；钩住 window.__genie（数日光小图）和 window.__genieWalk（听 state）。
 * Math.random 换成固定种子的：高清档的 GTAO 用 SimplexNoise（Math.random）生成噪声贴图，不固定的话每次打开 AO 的颗粒都不一样。
 * 建 WebGL 上下文（引擎的构造函数里、后期链之前）时再重新播种一次：之前页面上用掉多少个随机数都不影响引擎。
 */
function initScript({ list, cur, settings, lang }) {
  const seeded = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  Math.random = seeded(0x2545f491);
  const getContext = HTMLCanvasElement.prototype.getContext;
  const gl = new WeakSet();
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if ((type === 'webgl2' || type === 'webgl') && !gl.has(this)) {
      gl.add(this);
      Math.random = seeded(0x9e3779b9);
    }
    return getContext.call(this, type, ...rest);
  };
  try {
    localStorage.setItem('genie.studio.projects.v1', JSON.stringify(list));
    localStorage.setItem('genie.studio.current', cur);
    localStorage.setItem('genie.settings.v1', JSON.stringify(settings));
    localStorage.setItem('genie.lang', lang);
  } catch {
    /* 存不进去：开机会退回示范户型，下面 boot 检查会报出来 */
  }
  const W = (window.__px = { thumbs: 0, thumbsAt: 0, phase: null, phases: [], walk: false });
  let g = null;
  Object.defineProperty(window, '__genie', {
    configurable: true,
    enumerable: true,
    get: () => g,
    set(v) {
      g = v;
      if (v && typeof v.thumbs === 'function' && !v.__pxThumbs) {
        const thumbs = v.thumbs;
        v.thumbs = function (...a) {
          try {
            return thumbs.apply(this, a);
          } finally {
            W.thumbs++;
            W.thumbsAt = performance.now();
          }
        };
        v.__pxThumbs = true;
      }
    },
  });
  let c = null;
  Object.defineProperty(window, '__genieWalk', {
    configurable: true,
    enumerable: true,
    get: () => c,
    set(v) {
      c = v;
      if (v) W.walk = true;
      if (v && typeof v.on === 'function') {
        try {
          v.on('state', (s) => {
            const ph = s && typeof s === 'object' ? s.phase : s;
            W.phase = ph;
            W.phases.push(ph);
          });
        } catch {
          /* 控制器的接口变了：下面 walkPhase 还会读它身上的 phase / state */
        }
      }
    },
  });
}

/** 引擎静下来了没有：{ ok, busy: [...], frames } —— 所有会让下一帧不一样的异步工作都要结束 */
function idleProbe() {
  const e = window.__genie;
  const W = window.__px || {};
  if (!e || !e.plan) return { ok: false, busy: ['boot'], frames: -1 };
  const busy = [];
  if (!e.running || e.contextLost) busy.push('stopped');
  if (e.dirty) busy.push('dirty');
  if (e.tween) busy.push('tween');
  if (e._refitT) busy.push('refit');
  if (e.walk) busy.push('walk');
  if (e.onTick) busy.push('onTick');
  if (e._degrading) busy.push('degrading');
  // 主点平移：引擎自己在 |差| ≤ 0.25px 时停（loop 里的规则），这里用同一条
  if (Math.abs(e.voTo.x - e.vo.x) > 0.25 || Math.abs(e.voTo.y - e.vo.y) > 0.25) busy.push('vo');
  if (e.roomKey && Math.abs(e.roomKey.to - e.roomKey.now) > 1e-3) busy.push('roomKey');
  const lib = e.lib;
  if (lib) {
    if (lib.queue?.length || lib.pumping || lib.upgraded) busy.push('textures');
    const b = lib.boards?.stats?.();
    if (b && b.pending) busy.push('boards');
  }
  if (e.blankWatch?.timer) busy.push('blankWatch');
  if (!W.thumbs) busy.push('thumbs');
  if (document.fonts && document.fonts.status !== 'loaded') busy.push('fonts');
  return { ok: !busy.length, busy, frames: e._frames || 0, thumbs: W.thumbs };
}

/** 取景状态（模式 A / B 都比这个）：浮点原样，不取整 */
function viewState() {
  const e = window.__genie;
  const v3 = (v) => [v.x, v.y, v.z];
  const cam = e.camera;
  return {
    insets: e.insets,
    vo: e.vo,
    voTo: e.voTo,
    position: v3(cam.position),
    quaternion: [cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w],
    target: v3(e.controls.target),
    fov: cam.fov,
    view: cam.view && cam.view.enabled ? { fullWidth: cam.view.fullWidth, fullHeight: cam.view.fullHeight, offsetX: cam.view.offsetX, offsetY: cam.view.offsetY, width: cam.view.width, height: cam.view.height } : null,
    floorView: e.floorView,
    activeIdx: e.activeIdx,
    lastView: e.lastView,
    framed: e.isFramed(),
    quality: e.quality,
    pr: e.renderer.getPixelRatio(),
    size: [e.container.clientWidth, e.container.clientHeight],
    time: e.time,
  };
}

function gpuInfo() {
  const gl = window.__genie?.renderer?.getContext();
  if (!gl) return '';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
}

const HIDE_ID = 'walk-pixels-hide';
// 只藏、不改排版（visibility）：界面量出来的 insets、引擎的取景都不动；画布单独显示回来
const HIDE_CSS = 'body *{visibility:hidden!important}canvas.studio-canvas{visibility:visible!important}';

// ───────────────────────── 等待 + 截图 ─────────────────────────

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const QUIET = 2500; // 静下来以后至少这么久一帧都没画，才截
const GAP = 1500; // 两次截图之间
const BOOT_MS = 600e3; // 机器忙（别的打包 / 测试同时在跑）时，高清档开机编译着色器要好几分钟
const IDLE_MS = 900e3; // SwiftShader 很慢：high 的后期链一帧要好几秒，开机要补十几张贴图（每张一帧）

/** 等到 idleProbe 通过、而且连续 QUIET 毫秒帧数不变 */
async function settle(page, label, timeout = IDLE_MS) {
  const t0 = Date.now();
  let frames = null;
  let since = 0;
  let last = null;
  while (Date.now() - t0 < timeout) {
    const s = await page.evaluate(idleProbe);
    last = s;
    if (s.ok && s.frames === frames) {
      if (Date.now() - since >= QUIET) return s;
    } else {
      frames = s.frames;
      since = Date.now();
    }
    await sleep(250);
  }
  throw new Error(`${label}：${Math.round(timeout / 1000)} 秒还没静下来（${JSON.stringify(last)}）`);
}

async function hide(page, on) {
  await page.evaluate(
    ({ id, css, on }) => {
      const old = document.getElementById(id);
      if (!on) return old?.remove();
      if (old) return;
      const s = document.createElement('style');
      s.id = id;
      s.textContent = css;
      document.head.appendChild(s);
    },
    { id: HIDE_ID, css: HIDE_CSS, on },
  );
}

/** 截一次：画布 PNG + 取景状态；截图前后帧数一样才算 */
async function grab(page) {
  await hide(page, true);
  const f0 = await page.evaluate(() => window.__genie._frames || 0);
  const png = await page.locator('canvas.studio-canvas').screenshot({ timeout: 120e3 });
  const json = await page.evaluate(viewState);
  const f1 = await page.evaluate(() => window.__genie._frames || 0);
  return { png, json, frames: f0, clean: f0 === f1 };
}

const J = (o) => JSON.stringify(o);
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/** 静下来 → 截两次（中间隔 GAP、再静一次），两次一模一样才返回 */
async function stableShot(page, label) {
  let why = '';
  for (let i = 0; i < 6; i++) {
    await settle(page, label);
    const a = await grab(page);
    await sleep(GAP);
    await settle(page, label);
    const b = await grab(page);
    if (a.clean && b.clean && a.frames === b.frames && a.png.equals(b.png) && !jsonDiff(a.json, b.json).length) return { ...a, hash: sha(a.png), tries: i + 1 };
    why = !a.clean || !b.clean ? '截图时画了一帧' : a.frames !== b.frames ? `中间画了 ${b.frames - a.frames} 帧` : !a.png.equals(b.png) ? '两次截图不一样' : '两次取景状态不一样';
    console.log(`    … ${label}：${why}，重来（${i + 1}）`);
  }
  throw new Error(`${label}：截不到两次一样的（${why}）`);
}

// ───────────────────────── 打开一个情形 ─────────────────────────

function seedFor(c) {
  const fx = loadFixture(c.fixture);
  const proj = { ...fx };
  if (c.view && c.view !== 'all') proj.floorView = c.view;
  else delete proj.floorView;
  if (c.time != null) proj.time = c.time;
  return { list: [proj], cur: fx.id, settings: { quality: c.quality }, lang: 'zh' };
}

async function openCase(browser, origin, c, o) {
  const log = o.verbose ? console.log : null;
  const ctx = await browser.newContext({
    viewport: { width: c.w, height: c.h },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    timezoneId: 'Asia/Kuala_Lumpur',
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    hasTouch: false,
    isMobile: false,
  });
  const blocked = new Set();
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(origin + '/') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    blocked.add(new URL(u).host);
    return route.abort();
  });
  await ctx.addInitScript(initScript, seedFor(c));
  if (o.init) await ctx.addInitScript({ path: o.init });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  const qs = c.mode === 'wish' ? '?mode=wish' : '?staff=1';
  await page.goto(`${origin}/studio.html${qs}`, { waitUntil: 'load', timeout: BOOT_MS });
  await page.waitForFunction(() => !!window.__genie?.plan, null, { timeout: BOOT_MS, polling: 250 });
  // 开机读的是不是样本（不是示范户型 / 别的方案）
  const want = loadFixture(c.fixture).id;
  const got = await page.evaluate(() => ({ rooms: window.__genie.plan.floors.map((f) => f.rooms.length), quality: window.__genie.quality, cur: localStorage.getItem('genie.studio.current') }));
  if (got.cur !== want) throw new Error(`${c.id}：开机后现在的方案是 ${got.cur}，不是样本 ${want}`);
  if (got.quality !== c.quality) throw new Error(`${c.id}：画质是 ${got.quality}，不是 ${c.quality}`);
  if (log) log(`    ${c.id}：开机 ${got.rooms.join('+')} 个房间，画质 ${got.quality}`);
  return { ctx, page, errors, blocked };
}

// ───────────────────────── 模式 A ─────────────────────────

async function captureCase(browser, origin, c, o) {
  const t0 = Date.now();
  const { ctx, page, errors, blocked } = await openCase(browser, origin, c, o);
  try {
    const shot = await stableShot(page, c.id);
    const gpu = await page.evaluate(gpuInfo);
    if (o.verbose && blocked.size) console.log(`    ${c.id}：挡掉的外网 ${[...blocked].join(', ')}`);
    return { id: c.id, png: shot.png, hash: shot.hash, json: shot.json, tries: shot.tries, gpu, errors, ms: Date.now() - t0 };
  } finally {
    await ctx.close();
  }
}

// ───────────────────────── 模式 B（走进去 → 回到全屋） ─────────────────────────

/** 现在走到哪一步：'flying-in' | 'walking' | 'flying-out' | 'out' | null（听到的 state 优先，其次控制器身上的） */
function walkPhase() {
  const W = window.__px || {};
  const c = window.__genieWalk;
  const own = c && (c.phase ?? c.state?.phase ?? (typeof c.state === 'string' ? c.state : null));
  return { phase: W.phase ?? own ?? null, phases: W.phases || [], ctrl: !!c, exitBtn: !!document.querySelector('[data-walk="exit"]'), enterBtn: !!document.querySelector('[data-walk="enter"]') };
}

async function waitPhase(page, want, label, timeout = 300e3) {
  const t0 = Date.now();
  let s = null;
  while (Date.now() - t0 < timeout) {
    s = await page.evaluate(walkPhase);
    if (s.phase === want) return s;
    // 退出以后控制器可能已经拆掉（听不到 'out'）：「回到全屋」不见了、「走进去」回来了也算出来了
    if (want === 'out' && s.phases.length && !s.exitBtn && s.enterBtn && s.phase !== 'flying-out') return s;
    await sleep(250);
  }
  throw new Error(`${label}：${Math.round(timeout / 1000)} 秒还没到 ${want}（${JSON.stringify(s)}）`);
}

/** 楼梯情形的目的地：楼上最大的室内房间的中心（单层：主卧，没有就最大的房间）。z = 平面图的 y（SPEC §2） */
function stairTarget(fixture) {
  const plan = loadFixture(fixture).plan;
  const fi = plan.floors.length > 1 ? 1 : 0;
  const skip = new Set(['stair', 'void', 'porch', 'balcony', 'carporch', 'yard', 'utility']);
  const rooms = plan.floors[fi].rooms.filter((r) => !skip.has(r.type)).sort((a, b) => b.w * b.d - a.w * a.d);
  const r = (!fi && rooms.find((x) => x.type === 'master')) || rooms[0];
  return { fi, x: r.x + r.w / 2, z: r.y + r.d / 2, room: r.id };
}

async function walkTo(page, target, label) {
  // walkTo 可能返回 Promise（走到了才 resolve），也可能不返回：两种都等「到了、而且停下来」
  await page.evaluate((t) => {
    const r = window.__genieWalk.walkTo({ fi: t.fi, x: t.x, z: t.z });
    if (r && typeof r.then === 'function') r.then(() => (window.__px.arrived = true), (e) => (window.__px.arrived = String(e?.message || e)));
  }, target);
  const t0 = Date.now();
  let last = null;
  let still = 0;
  let went = false;
  while (Date.now() - t0 < 600e3) {
    await sleep(500);
    const p = await page.evaluate(() => ({ pose: window.__genieWalk?.pose?.() || null, arrived: window.__px.arrived ?? null }));
    if (typeof p.arrived === 'string') throw new Error(`${label}：walkTo 失败（${p.arrived}）`);
    const pose = p.pose;
    if (!pose) continue;
    const moved = !!last && (Math.hypot(pose.x - last.x, pose.z - last.z) > 1e-3 || pose.fi !== last.fi);
    if (moved) went = true;
    still = moved || !last ? 0 : still + 500;
    last = pose;
    const near = pose.fi === target.fi && Math.hypot(pose.x - target.x, pose.z - target.z) < 1.2;
    // 到了：walkTo 的 Promise 说到了 / 停在目的地附近；目的地被家具挡住、停在别处（nearest）：到了那一层、走过、停了 5 秒
    if ((p.arrived === true || near) && still >= 2000) return pose;
    if (went && pose.fi === target.fi && still >= 5000) return pose;
  }
  throw new Error(`${label}：10 分钟还没走到 ${J(target)}（最后在 ${J(last)}）`);
}

const NO_PILL = '没有「走进去」按钮 [data-walk="enter"]（走进去还没做好）';

async function walkCase(browser, origin, c, o) {
  const t0 = Date.now();
  if (o.noPill) return { id: c.id, skip: NO_PILL };
  const { ctx, page, errors } = await openCase(browser, origin, c, o);
  try {
    // 「走进去」的按钮在界面 ready 以后出现：先等引擎静下来（机器忙时开机很慢），这时还没有 = 还没做好 → 跳过
    // （不算失败；同一个打包目录剩下的情形也不用再开）
    await settle(page, `${c.id} 开机`);
    const pill = await page.waitForSelector('[data-walk="enter"]', { state: 'attached', timeout: 10e3 }).catch(() => null);
    if (!pill) {
      o.noPill = true;
      return { id: c.id, skip: NO_PILL, ms: Date.now() - t0 };
    }
    const before = await stableShot(page, `${c.id} 走进去之前`);
    await hide(page, false);
    let ref = before;
    if (c.scenario === 'rotate') {
      // 参照：不走进去、直接把画面转成竖的；再转回来，走进去以后再转
      await page.setViewportSize({ width: c.h, height: c.w });
      ref = await stableShot(page, `${c.id} 直接转成竖的`);
      await hide(page, false);
      await page.setViewportSize({ width: c.w, height: c.h });
      await settle(page, `${c.id} 转回横的`);
    }
    // 用 DOM 的 click()：鼠标不动，退出以后不会有悬停光圈（真的指针停在画布上会）
    await page.$eval('[data-walk="enter"]', (el) => el.click());
    await waitPhase(page, 'walking', `${c.id} 走进去`);
    await sleep(1500);
    let pose = null;
    if (c.scenario === 'stairs') pose = await walkTo(page, stairTarget(c.fixture), `${c.id} 走到楼上`);
    if (c.scenario === 'rotate') {
      await page.setViewportSize({ width: c.h, height: c.w });
      await sleep(4000);
    }
    await page.waitForSelector('[data-walk="exit"]', { state: 'attached', timeout: 30e3 });
    await page.$eval('[data-walk="exit"]', (el) => el.click());
    const ph = await waitPhase(page, 'out', `${c.id} 回到全屋`);
    const after = await stableShot(page, `${c.id} 回到全屋之后`);
    return { id: c.id, before: ref, after, pose, phases: ph.phases, errors, ms: Date.now() - t0 };
  } finally {
    await ctx.close();
  }
}

// ───────────────────────── 跑一组（可以同时开几个浏览器） ─────────────────────────

async function launch() {
  let pw;
  try {
    pw = await import('playwright');
  } catch {
    pw = createRequire(import.meta.url)('playwright');
  }
  return (pw.chromium || pw.default.chromium).launch();
}

async function runAll(cases, jobs, fn) {
  const results = new Array(cases.length);
  let next = 0;
  const worker = async () => {
    const browser = await launch();
    try {
      while (next < cases.length) {
        const i = next++;
        const c = cases[i];
        // 出错（多半是机器太忙超时）再试一次；第二次还错才算。比对本身不放宽
        for (let k = 0; k < 2; k++) {
          try {
            results[i] = await fn(browser, c);
            break;
          } catch (err) {
            results[i] = { id: c.id, error: String(err?.message || err).split('\n')[0] };
            if (!k) console.log(`  … ${c.id}：${results[i].error}，再试一次`);
          }
        }
        const r = results[i];
        console.log(`  ${r.error ? '✗' : r.skip ? '–' : '·'} ${c.id}  ${r.ms ? `${(r.ms / 1000).toFixed(0)}s` : ''}${r.error ? `  ${r.error}` : r.skip ? `  跳过：${r.skip}` : ''}`);
      }
    } finally {
      await browser.close();
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, cases.length) }, worker));
  return results;
}

// 鸟瞰静止时 OrbitControls.update() 每一帧都在两个只差最后一位（~1e-15）的相机值之间来回跳
// （target.clampLength 的往返误差，改代码之前就这样），所以相机这三项允许 1e-9 以内的差；图（哈希）还是要一模一样。
const NEAR_KEYS = new Set(['position', 'quaternion', 'target']);
const near = (x, y) => Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) <= 1e-9);
/** 两份取景状态哪些字段不一样 */
function jsonDiff(a, b) {
  const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])];
  return keys.filter((k) => J(a?.[k]) !== J(b?.[k]) && !(NEAR_KEYS.has(k) && near(a?.[k], b?.[k])));
}

function table(rows) {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  for (const r of rows) console.log('  ' + r.map((v, i) => String(v).padEnd(w[i])).join('  '));
}

// ───────────────────────── 主程序 ─────────────────────────

async function main() {
  const o = args(process.argv.slice(2));
  let cases = matrix();
  if (o.only) cases = cases.filter((c) => c.id.includes(o.only));
  if (o.list) {
    for (const c of cases) console.log(c.id);
    return 0;
  }
  if (!o.save && !o.check && !o.walk) {
    console.log('要说清楚做什么：--save（拍基准）、--check（和基准比）或 --walk（走进去 → 回到全屋）；--list 列出情形');
    return 2;
  }
  if (o.save && o.check) throw new Error('--save 和 --check 只能选一个');
  if (!existsSync(join(o.dist, 'studio.html'))) throw new Error(`${o.dist} 里没有 studio.html —— 先 npx vite build（--dist 指到打包目录）`);
  mkdirSync(o.out, { recursive: true });
  const { srv, origin } = await serve(o.dist);
  console.log(`打包目录 ${o.dist} → ${origin}；输出 ${o.out}`);
  let code = 0;
  const T0 = Date.now();
  try {
    if (o.save || o.check) {
      const basePath = join(o.out, 'baseline.json');
      if (o.check && !existsSync(basePath)) throw new Error(`没有基准 ${basePath} —— 先用 --save 拍一次（同一个 --out）`);
      const base = o.check ? JSON.parse(readFileSync(basePath, 'utf8')) : null;
      if (o.check) cases = cases.filter((c) => base.cases[c.id] || console.log(`  （基准里没有 ${c.id}，跳过）`));
      console.log(`模式 A：${cases.length} 个情形，${o.jobs} 个浏览器`);
      const res = await runAll(cases, o.jobs, (b, c) => captureCase(b, origin, c, o));
      const failed = res.filter((r) => r.error);
      for (const r of res) for (const e of r.errors || []) console.log(`  ! ${r.id} ${e}`);
      if (o.save) {
        if (failed.length) throw new Error(`${failed.length} 个情形没拍成，基准没写`);
        const out = { v: 1, at: new Date().toISOString(), dist: o.dist, gpu: res[0]?.gpu || '', cases: {} };
        for (const r of res) {
          writeFileSync(join(o.out, `${r.id}.png`), r.png);
          out.cases[r.id] = { hash: r.hash, json: r.json };
        }
        writeFileSync(basePath, `${JSON.stringify(out, null, 2)}\n`);
        table([['情形', '哈希', '用时', '截了几轮'], ...res.map((r) => [r.id, r.hash.slice(0, 12), `${(r.ms / 1000).toFixed(0)}s`, r.tries])]);
        console.log(`基准写好了：${basePath}（${res.length} 张）`);
      } else {
        const dir = join(o.out, 'check');
        mkdirSync(dir, { recursive: true });
        const rows = [['情形', '画面', '取景状态', '变了的像素', '用时']];
        const report = { at: new Date().toISOString(), dist: o.dist, cases: {} };
        let bad = 0;
        for (const r of res) {
          if (r.error) {
            bad++;
            rows.push([r.id, '出错', '', r.error.slice(0, 60), '']);
            report.cases[r.id] = { error: r.error };
            continue;
          }
          const b = base.cases[r.id];
          const sameImg = r.hash === b.hash;
          const diffKeys = jsonDiff(b.json, r.json);
          const ok = sameImg && !diffKeys.length;
          let px = '';
          writeFileSync(join(dir, `${r.id}.png`), r.png);
          if (!sameImg) {
            const bp = join(o.out, `${r.id}.png`);
            if (existsSync(bp)) {
              const d = pixelDiff(readFileSync(bp), r.png);
              px = d.changed < 0 ? `尺寸 ${d.size}` : `${d.changed}（最大差 ${d.max}）`;
              if (d.png) writeFileSync(join(dir, `${r.id}.diff.png`), d.png);
            } else px = '（没有基准 PNG）';
          }
          if (!ok) bad++;
          if (r.gpu && base.gpu && r.gpu !== base.gpu) console.log(`  ! ${r.id}：显卡不一样（基准 ${base.gpu}，这次 ${r.gpu}）`);
          rows.push([r.id, sameImg ? '=' : '≠', diffKeys.length ? `≠ ${diffKeys.join(',')}` : '=', px || '0', `${(r.ms / 1000).toFixed(0)}s`]);
          report.cases[r.id] = { ok, hash: r.hash, baseHash: b.hash, json: r.json, diffKeys, pixels: px || 0 };
        }
        writeFileSync(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
        table(rows);
        console.log(bad ? `✗ ${bad} / ${res.length} 个情形和基准不一样（差异图在 ${dir}）` : `✓ ${res.length} 个情形全部和基准一模一样`);
        if (bad) code = 1;
      }
    }
    if (o.walk) {
      const all = ['enter', 'stairs', 'rotate'];
      const scen = o.scenario === 'all' ? all : o.scenario.split(',');
      for (const s of scen) if (!all.includes(s)) throw new Error(`不认识的 --scenario ${s}（enter | stairs | rotate | all）`);
      let wc = walkCases(scen);
      if (o.only) wc = wc.filter((c) => c.id.includes(o.only) || c.fixture.includes(o.only));
      const dir = join(o.out, 'walk');
      mkdirSync(dir, { recursive: true });
      console.log(`模式 B：${wc.length} 个情形`);
      const res = await runAll(wc, o.jobs, (b, c) => walkCase(b, origin, c, o));
      const rows = [['情形', '画面', '取景状态', '变了的像素', '经过', '用时']];
      let bad = 0;
      let skipped = 0;
      for (const r of res) {
        for (const e of r.errors || []) console.log(`  ! ${r.id} ${e}`);
        if (r.skip) {
          skipped++;
          rows.push([r.id, '跳过', '', r.skip, '', '']);
          continue;
        }
        if (r.error) {
          bad++;
          rows.push([r.id, '出错', '', r.error.slice(0, 80), '', '']);
          continue;
        }
        const sameImg = r.before.hash === r.after.hash;
        const diffKeys = jsonDiff(r.before.json, r.after.json);
        writeFileSync(join(dir, `${r.id}.before.png`), r.before.png);
        writeFileSync(join(dir, `${r.id}.after.png`), r.after.png);
        writeFileSync(join(dir, `${r.id}.json`), `${JSON.stringify({ before: r.before.json, after: r.after.json, diffKeys, pose: r.pose, phases: r.phases }, null, 2)}\n`);
        let px = '0';
        if (!sameImg) {
          const d = pixelDiff(r.before.png, r.after.png);
          px = d.changed < 0 ? `尺寸 ${d.size}` : `${d.changed}（最大差 ${d.max}）`;
          if (d.png) writeFileSync(join(dir, `${r.id}.diff.png`), d.png);
        }
        if (!sameImg || diffKeys.length) bad++;
        rows.push([r.id, sameImg ? '=' : '≠', diffKeys.length ? `≠ ${diffKeys.join(',')}` : '=', px, r.phases.join('→'), `${(r.ms / 1000).toFixed(0)}s`]);
      }
      table(rows);
      if (skipped === res.length) console.log('– 模式 B 跳过：还没有「走进去」（[data-walk="enter"] 不在页面上）');
      else console.log(bad ? `✗ 模式 B：${bad} 个情形回到全屋以后和走进去之前不一样（图在 ${dir}）` : `✓ 模式 B：回到全屋以后和走进去之前一模一样`);
      if (bad) code = 1;
    }
  } finally {
    srv.close();
  }
  console.log(`用时 ${((Date.now() - T0) / 1000).toFixed(0)} 秒`);
  return code;
}

export { matrix, walkCases, decodePNG, encodePNG, pixelDiff, stairTarget };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`✗ ${err?.message || err}`);
      process.exit(2);
    },
  );
