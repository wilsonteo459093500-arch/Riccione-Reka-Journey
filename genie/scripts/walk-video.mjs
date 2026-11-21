// 走进去 · 预览视频（~1 分钟，给老板看的；docs/walk/SPEC.md §9）：打包好的 studio.html 在无头 Chromium 里，
// 一帧一帧地走（window.__warp：每拍一张，页面的钟只往前走 1/FPS 秒），拍下来用 ffmpeg 拼成 MP4。
//   鸟瞰的「走进去」→ 飞进去 → 潘吉带逛（字幕）→ 转头看 → 点地板走过去 → 厨房刷柜子 → 换地板 → 转沙发
//   → 晚上开灯 → 量一段 → 收藏角度 → 走楼梯上楼 → 回到全屋。
// 字幕、提示是真时间走的（潘吉说完一句、提示淡掉）：要看清楚的地方「停住」几秒（同一张图重复几帧）。
//
// 用法（在 genie/ 里，先 npx vite build）：
//   node scripts/walk-video.mjs [--dist <打包目录>] [--out <目录>] [--size 1180x820] [--lang zh] [--quality fast|high]
//   → <out>/walk-preview-<size>-<lang>.mp4（帧在 <out>/frames-…/）。很慢：SwiftShader 上 fast 一帧 ~1–2 秒，整段 ~40 分钟。
import { mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { serve, launch, settle, sleep } from './walk-pixels.mjs';
import { openJob, findHit, navFor, roomView, frontSpot, standFor, dirOf } from './walk-shots.mjs';
import * as N from '../src/studio/walk/nav.js';
import { footprintOf } from '../src/studio/engine/furnish.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 12; // 拍 12 帧 / 秒（SwiftShader 一帧要 ~10 秒），ffmpeg 再混合成 24 帧
const STEP = 1000 / FPS;

function args(argv) {
  const o = { dist: join(ROOT, 'dist'), out: join(tmpdir(), 'walk-video'), size: '1180x820', lang: 'zh', quality: 'fast' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dist') o.dist = resolve(argv[++i]);
    else if (a === '--out') o.out = resolve(argv[++i]);
    else if (a === '--size') o.size = argv[++i];
    else if (a === '--lang') o.lang = argv[++i];
    else if (a === '--quality') o.quality = argv[++i];
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  if (!existsSync(join(o.dist, 'studio.html'))) throw new Error(`${o.dist} 里没有 studio.html —— 先 npx vite build`);
  const tag = `${o.size}-${o.lang}`;
  const frames = join(o.out, `frames-${tag}`);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const { project, nd, nav, stops } = navFor('semid2');
  const { srv, origin } = await serve(o.dist);
  const browser = await launch();
  let n = 0;
  const T0 = Date.now();
  try {
    const { ctx, page, errors } = await openJob(browser, origin, { size: o.size, lang: o.lang, quality: o.quality, fixture: 'semid2', wish: false }, {});
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const pose = () => ev(() => window.__genieWalk?.pose?.() || null);
    const log = (...a) => console.log(`  [${((Date.now() - T0) / 1000).toFixed(0)}s · 第 ${n} 帧 · ${(n / FPS).toFixed(1)}s]`, ...a);
    // 等页面上的东西（托盘、贴图…）：先让页面接着画（拍完上一帧时停住了），贴图要靠它一帧帧补
    const until = async (fn, timeout, what, ms = 250) => {
      await page.evaluate(() => window.__warp && (window.__warp.idle = false)).catch(() => {});
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        const v = await fn();
        if (v) return v;
        await sleep(ms);
      }
      throw new Error(`${Math.round(timeout / 1000)} 秒还没${what}`);
    };

    // ── 一帧：页面的钟往前走 dt 毫秒、画好、拍下来 ──
    const shoot = async () => {
      const file = join(frames, `${String(n).padStart(5, '0')}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 90, timeout: 120e3 });
      n++;
      return file;
    };
    // 引擎只在有变化时才画（dirty）：每一帧都叫它画，定住以后至少再画一次（画的就是定住那一刻）
    const frame = async (dt = STEP) => {
      await ev((dt) => {
        const W = window.__warp;
        // 一下子跳到这一帧的时间（scale 很大）：下一次 requestAnimationFrame 就定住，只画一次
        W.set(1e6, W.now(performance.now()) + dt);
        W.idle = false;
        window.__genie.dirty = true;
      }, dt);
      // 别一直叫它画（SwiftShader 一帧 ~1 秒，叫多了截图要排队）：定住了、1 秒还没画新的才再叫一次
      await until(
        () =>
          ev(() => {
            const W = window.__warp;
            const e = window.__genie;
            const f = e._frames || 0;
            if (W.frozen && f > W.frozenAt) {
              W.idle = true; // 画好了：拍照的时候别再画
              return true;
            }
            const now = performance.now();
            if (W.frozen && f !== W.lastF) {
              W.lastF = f;
              W.lastT = now;
            } else if (W.frozen && now - (W.lastT || 0) > 1000) {
              W.lastT = now;
              e.dirty = true;
            }
            return false;
          }),
        120e3,
        '画好这一帧',
        150,
      );
      return shoot();
    };
    /** 拍 ms 毫秒（页面的钟）；speed > 1 = 快进 */
    const rec = async (ms, speed = 1) => {
      for (let t = 0; t < ms; t += STEP) await frame(STEP * speed);
    };
    /** 一直拍到 done() 成立（最多 maxMs 页面时间） */
    const recUntil = async (done, maxMs, speed = 1) => {
      for (let t = 0; t < maxMs; t += STEP) {
        await frame(STEP * speed);
        if (await done()) return true;
      }
      return false;
    };
    /** 停住：同一张图重复 ms 毫秒（字幕、面板要看清楚） */
    const hold = async (ms) => {
      const last = join(frames, `${String(n - 1).padStart(5, '0')}.jpg`);
      const src = n > 0 ? last : await shoot();
      for (let t = 0; t < ms; t += STEP) {
        copyFileSync(src, join(frames, `${String(n).padStart(5, '0')}.jpg`));
        n++;
      }
    };
    const fresh = async (ms) => {
      await frame(STEP);
      await hold(ms - STEP);
    };
    const click = (sel) => page.$eval(sel, (el) => el.click());
    const tool = async (id) => {
      const cur = await ev(() => window.__genieWalk?.tool);
      if (cur !== id) await click(`[data-walk-tool="${id}"]`);
      await until(() => ev((t) => window.__genieWalk?.tool === t, id), 15e3, `换到 ${id}`);
    };
    const tap = (x, y) =>
      ev(([x, y]) => {
        const cv = document.querySelector('canvas.studio-canvas');
        const p = { clientX: x, clientY: y, pointerId: 31, pointerType: 'mouse', button: 0, buttons: 1, bubbles: true, isPrimary: true };
        cv.dispatchEvent(new PointerEvent('pointerdown', p));
        cv.dispatchEvent(new PointerEvent('pointerup', { ...p, buttons: 0 }));
      }, [x, y]);
    /** 走过去（真的走，路线 + 圈），拍到走到 */
    const walkTo = async (t, maxMs = 20e3, speed = 1) => {
      await ev((t) => {
        window.__vid = { arrived: null };
        window.__genieWalk.walkTo(t).then((r) => (window.__vid.arrived = r));
      }, t);
      await recUntil(() => ev(() => window.__vid.arrived != null), maxMs, speed);
    };
    /** 一下子过去（淡出淡入）：不拍 */
    const jump = async (fi, s, pitch = 0) => {
      const ok = await ev(({ fi, s, pitch }) => {
        const w = window.__genieWalk;
        return w.goto({ floor: w.nav.floors[fi].id, x: s.x, z: s.z, yaw: s.yaw, pitch });
      }, { fi, s, pitch });
      if (ok !== true) throw new Error(`goto 没成功（${ok}）`);
      await rec(400);
    };
    const room = (id) => {
      for (let fi = 0; fi < nd.floors.length; fi++) {
        const r = nd.floors[fi].rooms.find((x) => x.id === id);
        if (r) return { fi, r };
      }
      return null;
    };

    // ── 开机：等鸟瞰静下来 ──
    await settle(page, `${tag} 开机`);
    await page.waitForSelector('[data-walk="enter"]', { state: 'visible', timeout: 60e3 });
    await sleep(6000);
    log('鸟瞰');
    await fresh(1800);

    // ── 走进去：飞进去 ──
    await ev(() => window.__warp.set(1, window.__warp.now(performance.now())));
    await click('[data-walk="enter"]');
    log('飞进去');
    await recUntil(() => ev(() => window.__genieWalk?.phase === 'walking' && !!document.querySelector('.walk-ui.is-live')), 12e3);
    await rec(300);

    // ── 潘吉带逛：前两句（字幕停住看清楚） ──
    log('带逛');
    let said = 0;
    let lastText = '';
    for (let t = 0; t < 30e3 && said < 2; t += STEP) {
      await frame();
      const st = await ev(() => {
        const s = window.__genieWalk.tour.state();
        return { running: s.running, phase: s.phase, text: document.querySelector('.walk-tour-text')?.textContent.trim() || '' };
      });
      if (!st.running) break;
      if (st.phase === 'talking' && st.text && st.text !== lastText) {
        lastText = st.text;
        said++;
        await hold(3600);
      }
    }
    if (await ev(() => window.__genieWalk.tour.running)) {
      await click('.walk-tour-skip').catch(() => ev(() => window.__genieWalk.tour.stop()));
      await rec(400);
    }

    // ── 客厅：转头看一圈（拖动画布） ──
    const liv = stops.tv || stops.living || stops.entrance;
    const lr = room(liv.room);
    const living = (lr && roomView(nav, lr.fi, lr.r)) || liv;
    await jump(living.fi, living, -0.05);
    log('转头看');
    const box = await ev(() => {
      const r = document.querySelector('canvas.studio-canvas').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    // 往左转 ~20°、低一点头（pitch −0.18：dy < 0 = 低头，k = 视角 / 画布高）
    for (let i = 1; i <= 36; i++) {
      await page.mouse.move(box.x - i * 7, box.y - i * 3.8);
      await frame();
    }
    await page.mouse.up();
    await rec(300);

    // ── 点地板走过去 ──
    log('点地板走过去');
    await tool('walk');
    {
      const p = await pose();
      const pts = [];
      for (const d of [3.0, 2.6, 3.4, 2.2])
        for (const da of [0, 0.15, -0.15]) {
          const v = dirOf(p.yaw + da);
          const q = { fi: p.fi, x: p.x + v.x * d, z: p.z + v.z * d };
          if (N.passable(nav, q) && N.clearance(nav, q) >= nav.radius + 0.1) pts.push({ x: q.x, y: nd.floors[p.fi].elev, z: q.z });
        }
      const h = await ev(findHit, { pts, want: { kind: 'floor', y: nd.floors[p.fi].elev } });
      if (h) {
        await tap(h.x, h.y);
        let prev = p;
        let still = 0;
        await recUntil(async () => {
          const a = await pose();
          const moved = Math.hypot(a.x - prev.x, a.z - prev.z);
          prev = a;
          still = moved < 1e-4 ? still + 1 : 0;
          return Math.hypot(a.x - p.x, a.z - p.z) > 0.3 && still >= 3;
        }, 8e3);
      } else log('（画面里找不到能点的地板，跳过）');
    }

    // ── 厨房：刷柜子 ──
    const run = project.furniture.find((f) => f.kind === 'kitchenRun');
    if (run) {
      const kr = room(run.room);
      const spot = frontSpot(nav, kr.fi, run, [2.6, 2.3, 2.0, 1.7]) || { ...standFor(nav, kr.fi, run, kr.r, 1.9), fi: kr.fi };
      log('走去厨房');
      await walkTo({ fi: kr.fi, x: spot.x, z: spot.z, yaw: spot.yaw }, 14e3, 1.5);
      await jump(kr.fi, spot, -0.22);
      await tool('paint');
      await rec(300);
      const b = footprintOf(run);
      const p = await pose();
      const elev = nd.floors[p.fi].elev;
      const fx = Math.abs(p.x - (b.x0 + b.x1) / 2) > Math.abs(p.z - (b.z0 + b.z1) / 2);
      const pts = [];
      for (const y of [0.45, 0.3, 0.6])
        for (const k of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          const x = b.x0 + (b.x1 - b.x0) * k;
          const z = b.z0 + (b.z1 - b.z0) * k;
          pts.push(fx ? { x: p.x > (b.x0 + b.x1) / 2 ? b.x1 : b.x0, y: elev + y, z } : { x, y: elev + y, z: p.z > (b.z0 + b.z1) / 2 ? b.z1 : b.z0 });
        }
      const h = await ev(findHit, { pts, want: { kind: 'slot', slot: 'cabinetry' } });
      if (h) {
        log('刷柜子');
        await tap(h.x, h.y);
        await until(() => ev(() => !!document.querySelector('.walk-tray[data-walk-slot="cabinetry"]')), 20e3, '出托盘');
        await fresh(1500);
        const segs = await ev(() => document.querySelectorAll('.walk-tray .walk-seg button').length);
        if (segs > 1) await page.$$eval('.walk-tray .walk-seg button', (bs) => bs[bs.length - 1].click());
        await fresh(700);
        const mats = await ev(() => [...document.querySelectorAll('.walk-tray .walk-chip:not(.is-cur)')].map((b) => b.getAttribute('data-mat')));
        const mat = mats.find((m) => /sage|green|olive|mist|blue|navy|clay/.test(m)) || mats[mats.length - 1];
        if (mat) {
          await click(`.walk-tray .walk-chip[data-mat="${mat}"]`);
          await until(() => ev((id) => window.__genie.lib.current.cabinetry === id, mat), 30e3, '柜体换好');
          await until(() => ev(() => !window.__genie.lib.queue?.length && !window.__genie.lib.pumping), 30e3, '贴图补完');
          await fresh(2600);
        }
      }
    }

    // ── 客厅：换地板 ──
    await tool('walk');
    await jump(living.fi, living, -0.3);
    log('换地板');
    await tool('floor');
    await until(() => ev(() => !!document.querySelector('.walk-tray[data-walk-slot]')), 15e3, '出地板托盘');
    await fresh(1200);
    {
      const mats = await ev(() => [...document.querySelectorAll('.walk-tray .walk-chip:not(.is-cur)')].map((b) => b.getAttribute('data-mat')));
      if (mats.length) {
        const slot = await ev(() => document.querySelector('.walk-tray')?.getAttribute('data-walk-slot'));
        await click(`.walk-tray .walk-chip[data-mat="${mats[Math.min(2, mats.length - 1)]}"]`);
        await until(() => ev((s) => !window.__genie.lib.queue?.length && !window.__genie.lib.pumping && !!s, slot), 30e3, '地板换好');
        await fresh(2200);
      }
    }

    // ── 沙发：选中、转一转 ──
    const sofa = project.furniture.find((f) => f.kind === 'sofa' && f.room === liv.room) || project.furniture.find((f) => f.kind === 'sofa');
    if (sofa) {
      const sr = room(sofa.room);
      const s = frontSpot(nav, sr.fi, sofa, [2.0, 1.7, 2.3, 1.4]) || standFor(nav, sr.fi, sofa, sr.r, 2.4);
      await tool('walk');
      await jump(sr.fi, s, -0.32);
      await tool('furnish');
      const at = await ev((id) => {
        const d = window.__genie.itemData.get(id);
        return d ? { x: d.x, z: d.z } : null;
      }, sofa.id);
      const elev = nd.floors[sr.fi].elev;
      const pts = [];
      for (const y of [0.35, 0.5, 0.25]) for (const [ox, oz] of [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) pts.push({ x: at.x + ox, y: elev + y, z: at.z + oz });
      const h = await ev(findHit, { pts, want: { kind: 'item', item: sofa.id } });
      if (h) {
        log('转沙发');
        await tap(h.x, h.y);
        await until(() => ev(() => !!document.querySelector('.walk-furnish[data-walk-item]')), 15e3, '选中沙发');
        await fresh(1400);
        const rot = await page.$('[data-walk-act="rotate"], .walk-furnish button[data-act="rotate"]');
        if (rot) {
          await rot.evaluate((el) => el.click());
          await rec(600);
          await hold(1200);
          await rot.evaluate((el) => el.click());
          await rec(600);
          await rot.evaluate((el) => el.click());
          await rec(600);
          await rot.evaluate((el) => el.click());
          await rec(400);
        }
      }
    }

    // ── 晚上开灯 ──
    await tool('walk');
    await jump(living.fi, living, -0.05);
    log('晚上');
    await tool('light');
    await fresh(900);
    await click('[data-walk-light="night"]');
    await recUntil(() => ev(() => window.__genie.day?.night >= 0.95), 4e3);
    await fresh(2400);
    await click('[data-walk-light="day"]');
    await recUntil(() => ev(() => window.__genie.day?.night < 0.05), 3e3);

    // ── 量尺 ──
    log('量尺');
    await jump(living.fi, living, -0.36);
    await tool('measure');
    {
      const p = await pose();
      const elev = nd.floors[p.fi].elev;
      const ahead = (dists, spread) => {
        const pts = [];
        for (const d of dists)
          for (const da of spread) {
            const v = dirOf(p.yaw + da);
            const q = { fi: p.fi, x: p.x + v.x * d, z: p.z + v.z * d };
            if (N.passable(nav, q) && N.clearance(nav, q) >= nav.radius + 0.1) pts.push({ x: q.x, y: elev, z: q.z });
          }
        return pts;
      };
      const a = await ev(findHit, { pts: ahead([1.8, 2.1, 1.5], [0.3, 0.22, 0.38]), want: { kind: 'floor', y: elev } });
      const far = ahead([3.0, 2.7, 3.4, 2.4], [-0.2, -0.12, -0.28]).filter((q) => !a || Math.hypot(q.x - a.hit.point.x, q.z - a.hit.point.z) > 1.2);
      const b = await ev(findHit, { pts: far, want: { kind: 'floor', y: elev } });
      if (a && b) {
        await tap(a.x, a.y);
        await rec(500);
        await tap(b.x, b.y);
        await until(() => ev(() => document.querySelector('.walk-measure-label')?.style.visibility === 'visible'), 30e3, '量出来');
        await rec(300);
        await hold(2200);
        await ev(() => window.__genieWalk.clearMeasure());
      }
    }

    // ── 收藏这个角度 ──
    log('收藏角度');
    await tool('photo');
    await fresh(600);
    await click('[data-walk-act="mark"]');
    await rec(300);
    await hold(1600);

    // ── 走楼梯上楼（快进） ──
    if (nd.floors.length > 1) {
      log('上楼');
      await tool('walk');
      const views = nd.floors[1].rooms
        .filter((r) => !/bath|balcony|stair|void|walkin/.test(r.type) && !r.stairId)
        .map((r) => roomView(nav, 1, r))
        .filter(Boolean)
        .sort((a, b) => b.L - a.L);
      const up = views[0];
      if (up) {
        await walkTo({ fi: 1, x: up.x, z: up.z, yaw: up.yaw }, 30e3, 2);
        await rec(400);
        await hold(1200);
      }
    }

    // ── 回到全屋 ──
    log('回到全屋');
    await click('[data-walk="exit"], .walk-exit');
    await recUntil(() => ev(() => !window.__genie.walk && !window.__genieWalk), 10e3);
    await rec(600);
    await hold(1800);
    if (errors.length) console.log(`页面错误：\n  ${errors.join('\n  ')}`);
    await ctx.close();
  } finally {
    await browser.close();
    srv.close();
  }
  const mp4 = join(o.out, `walk-preview-${tag}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, '%05d.jpg'), '-vf', 'minterpolate=fps=24:mi_mode=blend', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4]);
  console.log(`✓ ${n} 帧 = ${(n / FPS).toFixed(1)} 秒 → ${mp4}（用时 ${((Date.now() - T0) / 60000).toFixed(0)} 分钟）`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`✗ ${err?.stack || err}`);
      process.exit(2);
    },
  );
