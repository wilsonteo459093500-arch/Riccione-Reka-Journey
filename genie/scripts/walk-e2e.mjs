// 走进去 · 真浏览器端到端（docs/walk/SPEC.md；I4）：打包好的 studio.html 在无头 Chromium（SwiftShader）里，
// 用真的点击 / 拖动 / 按键把「走进去」从头到尾走一遍，每一步都检查引擎和控制器的状态。
//
// 用法（在 genie/ 里，先 npx vite build）：
//   node scripts/walk-e2e.mjs [--dist <打包目录>] [--out <截图目录>] [--only condo3,semid2,condo3-wish] [--verbose]
//
// 情形：condo3（员工）、semid2（员工，两层）、condo3 许愿模式（?mode=wish）。画质 fast、1180×820。
// 每个情形：
//   金色「走进去」→ 飞进去 → 'walking'，镜头落在大门里面、眼睛高（地面 + 1.55 ± 0.05）、离 nav.start 不远；
//   第一次走进去潘吉自动带逛：有字幕、「下一站」换下一句、「跳过」停下；
//   拖动画面 → 转头；点地板 → 走过去；点小地图上另一个房间 → 走过去；
//   摇杆 / W 键朝一面墙一直推 → 走到墙前停下，一步都不穿墙（每一次采样都离墙 ≥ 半径、没过墙线、还在原来的房间）；
//   点一扇关着的门 → 门开（朝离人远的那一边），人走到门那一边的房间；
//   刷颜色点厨房柜子 → 托盘是「柜体」（'cabinetry'），换一个 → 柜体变了、墙面没变（以前「只能换墙面」的回归）；
//   地板 → 脚下这间的地板 / 地砖换了；家具：点中 → 转 90° → 按住拖 → 都经过 api 记进方案，左上角撤销撤掉挪动；
//   量尺：点两下 → 「… mm · 约 … 尺 / ft」；灯光：晚上 → 时间是晚上、再回白天；
//   拍照：收藏这个角度 → 列表多一行、跟着方案存下来；员工版「下载这张」真的下载；许愿模式从头到尾没有任何下载、没有选文件；
//   semid2：走到楼上的房间 → pose.fi = 1、楼上那一层画着；点收藏的角度 → 回到那里（两层：从楼上回到楼下）；
//   「回到全屋」→ 'out'、engine.walk / onTick / __genieWalk = null，镜头回到走进去之前（1e-6 以内）；
//   再走进去一次：潘吉不再自动带逛、照样能走、能出来。
// 摆位置（推墙的地方、门前、柜子前）用 goto（收藏角度的那条路，淡出淡入）；之后的点、拖、按键都是真的鼠标 / 键盘。
// Node 里按同一个方案另建一份导航（nav.js），用来挑地方、检查有没有穿墙。截图在 --out，结果在 <out>/report.json。
// 很慢：SwiftShader 上 fast 一帧 ~1 秒（走路按帧走：dt 最多 0.25 秒）。一个情形 10–13 分钟，整组 ~35 分钟；别和别的浏览器活同时跑。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { serve, openCase, launch, settle, waitPhase, sleep, loadFixture, stairTarget } from './walk-pixels.mjs';
import * as N from '../src/studio/walk/nav.js';
import { fromStoredProject } from '../src/studio/store.js';
import { footprintOf } from '../src/studio/engine/furnish.js';
import { ROOM_TYPES } from '../src/studio/plan/model.js';
import { doorList } from '../src/studio/walk/doors.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EYE = 1.55;

function args(argv) {
  const o = { dist: join(ROOT, 'dist'), out: join(tmpdir(), 'walk-e2e'), only: '', verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dist') o.dist = resolve(argv[++i]);
    else if (a === '--out') o.out = resolve(argv[++i]);
    else if (a === '--only') o.only = argv[++i];
    else if (a === '--verbose' || a === '-v') o.verbose = true;
    else throw new Error(`不认识的参数 ${a}`);
  }
  return o;
}

const CASES = [
  { id: 'condo3', fixture: 'condo3', view: 'all', quality: 'fast', w: 1180, h: 820, mode: 'staff' },
  { id: 'semid2', fixture: 'semid2', view: 'all', quality: 'fast', w: 1180, h: 820, mode: 'staff' },
  { id: 'condo3-wish', fixture: 'condo3', view: 'all', quality: 'fast', w: 1180, h: 820, mode: 'wish' },
];

// ───────────────────────── 小工具 ─────────────────────────

class Fail extends Error {}
const check = (ok, msg) => {
  if (!ok) throw new Fail(msg);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const r2 = (v) => Math.round(v * 100) / 100;
const fmtP = (p) => (p ? `fi${p.fi} (${r2(p.x)}, ${r2(p.z)})` : '—');

/** 等 fn() 返回真值（每 ms 毫秒问一次）→ 那个值；超时 → Fail */
async function until(fn, timeout, what, ms = 300) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    last = await fn();
    if (last) return last;
    await sleep(ms);
  }
  throw new Fail(`${Math.round(timeout / 1000)} 秒还没${what}（最后：${JSON.stringify(last)?.slice(0, 200)}）`);
}

// 页面里读的
const pagePose = () => {
  const w = window.__genieWalk;
  const e = window.__genie;
  if (!w || !e) return null;
  const p = w.pose();
  const F = w.nav?.floors?.[p.fi];
  return { ...p, camY: e.camera.position.y, elev: F ? F.elev : null, phase: w.phase, tool: w.tool, active: e.activeIdx };
};

/** 人停下来了：连续 quiet 毫秒位置不变 → 最后的 pose */
async function still(page, { quiet = 2500, timeout = 180e3, samples = null } = {}) {
  const t0 = Date.now();
  let last = null;
  let since = Date.now();
  while (Date.now() - t0 < timeout) {
    const p = await page.evaluate(pagePose);
    if (samples && p) samples.push(p);
    const moved = !last || !p || Math.hypot(p.x - last.x, p.z - last.z) > 1e-3 || p.fi !== last.fi || Math.abs(p.yaw - last.yaw) > 1e-3;
    if (moved) since = Date.now();
    else if (Date.now() - since >= quiet) return p;
    last = p;
    await sleep(300);
  }
  throw new Fail(`${Math.round(timeout / 1000)} 秒还没停下（最后在 ${fmtP(last)}）`);
}

/**
 * 在一组世界坐标点里找第一个：投影在画面里、最上面是画布、hitAt 打中的东西满足 want（'floor' { y, x, z, tol } | 'slot' 名 | 'item' id）
 * → { x, y（页面像素）, hit: { slot, item, point } } | null（'door' { door: id }：打中那一扇走进去时建的门扇）
 */
function findHit({ pts, want }) {
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
    if (x < r.left + 30 || y < r.top + 30 || x > r.right - 30 || y > r.bottom - 30) continue;
    if (document.elementFromPoint(x, y) !== canvas) continue;
    const h = e.hitAt(x, y);
    if (!h) continue;
    const m = h.material;
    const info = { slot: m?.userData?.fixed ? null : (m?.userData?.slot ?? null), item: h.object.userData?.itemId ?? null, point: { x: h.point.x, y: h.point.y, z: h.point.z } };
    let ok = false;
    if (want.kind === 'floor') ok = Math.abs(h.point.y - want.y) < 0.03 && Math.hypot(h.point.x - v.x, h.point.z - v.z) < (want.tol ?? 0.25);
    else if (want.kind === 'slot') ok = info.slot === want.slot && (!want.item || info.item === want.item);
    else if (want.kind === 'item') ok = info.item === want.item;
    else if (want.kind === 'door') {
      for (let o = h.object; o; o = o.parent) if (o.userData?.walkDoor != null) ok = o.userData.walkDoor === want.door;
    }
    if (ok) return { x, y, hit: info };
  }
  return null;
}

// ───────────────────────── 导航（Node 里另建一份，和页面里同一个方案） ─────────────────────────

function navFor(fixture) {
  const project = fromStoredProject(loadFixture(fixture));
  const nd = N.navDataOf(project.plan);
  return { project, nd, nav: N.buildNav(nd, project.furniture) };
}

const cellAt = (F, x, z) => {
  const ix = Math.floor((x - F.x0) / F.cell);
  const iz = Math.floor((z - F.z0) / F.cell);
  if (ix < 0 || iz < 0 || ix >= F.nx || iz >= F.nz) return 1;
  return F.grid[iz * F.nx + ix];
};
const dirOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const isHole = (r) => !!(r?.stairId || ROOM_TYPES[r?.type]?.stair || ROOM_TYPES[r?.type]?.void);

const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** 从 p 朝 yaw 看，地上空着（clearance ≥ 半径 + 0.08）能看多远（前 0.6m 不算：人可能正贴着家具站） */
function freeRun(nav, p, yaw, max = 5) {
  const d = dirOf(yaw);
  let t = 0.6;
  for (; t <= max; t += 0.1) if (N.clearance(nav, { fi: p.fi, x: p.x + d.x * t, z: p.z + d.z * t }) < nav.radius + 0.08) break;
  return t;
}

/** 地面最空的方向（离现在的朝向近的优先）→ { yaw, run } */
function openDir(nav, p) {
  let best = null;
  for (let k = 0; k < 24; k++) {
    const yaw = wrapA(p.yaw + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 12));
    const run = freeRun(nav, p, yaw);
    if (!best || run > best.run + 0.3) best = { yaw, run };
  }
  return best;
}

/**
 * 推墙的地方：这一层所有房间里找一个站的地方 + 四个正方向之一（墙都是横平竖直的），要求：
 * 正前方 1.1–2.4m 是墙（第一格结构）、一路走得过去、墙左右各 0.8m 都是实墙（推的时候不会滑进门洞）、墙后面是另一个房间。
 * → [{ fi, x, z, yaw, s, behind, room }]（离 near 近的在前）
 */
function wallSpots(nav, nd, fi, near) {
  const F = nav.floors[fi];
  const out = [];
  for (const r of nd.floors[fi].rooms) {
    if (isHole(r) || ROOM_TYPES[r.type]?.outdoor) continue;
    for (let x = r.x + 0.4; x <= r.x + r.w - 0.4; x += 0.25)
      for (let z = r.y + 0.4; z <= r.y + r.d - 0.4; z += 0.25) {
        const p = { fi, x, z };
        if (N.clearance(nav, p) < 0.45) continue;
        const nq = N.nearest(nav, p);
        if (!nq || Math.hypot(nq.x - x, nq.z - z) > 1e-6) continue;
        for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          const d = dirOf(yaw);
          let s = null;
          for (let t = 0; t <= 2.6; t += 0.02) {
            const v = cellAt(F, x + d.x * t, z + d.z * t);
            if (v === 1) {
              s = t;
              break;
            }
            if (v === 2) break;
          }
          if (s == null || s < 1.1 || s > 2.4) continue;
          let ok = true;
          // 一路走得过去、一路都在这个房间里（不从门洞穿到别的房间去）
          for (let t = 0; t <= s - nav.radius - 0.03 && ok; t += 0.05) {
            const q = { fi, x: x + d.x * t, z: z + d.z * t };
            if (N.clearance(nav, q) < nav.radius + 0.02 || N.roomAt(nav, q)?.id !== r.id) ok = false;
          }
          // 墙那一段左右 0.8m 都是实墙
          for (let u = -0.8; u <= 0.8 && ok; u += 0.1) if (cellAt(F, x + d.x * (s + 0.03) - d.z * u, z + d.z * (s + 0.03) + d.x * u) !== 1) ok = false;
          if (!ok) continue;
          let behind = null;
          for (let t = s + 0.05; t <= s + 0.6; t += 0.05) {
            const q = { fi, x: x + d.x * t, z: z + d.z * t };
            if (cellAt(F, q.x, q.z) === 1) continue;
            const rb = N.roomAt(nav, q);
            if (rb && rb.id !== r.id && !isHole(rb)) behind = rb.id;
            break;
          }
          if (behind) out.push({ fi, x, z, yaw, s, behind, room: r.id, far: near ? Math.hypot(x - near.x, z - near.z) : 0 });
        }
      }
  }
  return out.sort((a, b) => a.far - b.far);
}

/**
 * 试门的地方：一扇门扇（doorList 的 id）+ 它一边的房间里一个站的地方：离门洞 1.7–2.8m（门还关着）、走得过去、
 * 到门洞正中一路没有墙和家具（看得见门）、门那边 0.9m 走得过去。
 * → [{ id, fi, axis, c, a, b, side（人在墙的哪一边：+1 = pos）, x, z, yaw, room, other, dist }]（每扇门、每一边取最近的那一个）
 */
function doorSpots(nav, nd, fi) {
  const F = nav.floors[fi];
  const out = [];
  for (const L of doorList(nd)) {
    if (L.fi !== fi) continue;
    const u = (L.a + L.b) / 2;
    const mid = L.axis === 'x' ? { x: u, z: L.c } : { x: L.c, z: u };
    const byId = (r) => r && nd.floors[fi].rooms.find((x) => x.id === r.id);
    for (const side of [1, -1]) {
      // 墙上记的房间只有 { id, type }：到这一层的房间表里拿整个矩形
      const room = byId(side > 0 ? L.wall.pos : L.wall.neg);
      const other = byId(side > 0 ? L.wall.neg : L.wall.pos);
      if (!room || !other || isHole(room) || isHole(other)) continue;
      const far = L.axis === 'x' ? { fi, x: u, z: L.c - side * 0.9 } : { fi, x: L.c - side * 0.9, z: u };
      if (!N.passable(nav, far)) continue;
      let best = null;
      for (let x = room.x + 0.25; x <= room.x + room.w - 0.25; x += 0.15)
        for (let z = room.y + 0.25; z <= room.y + room.d - 0.25; z += 0.15) {
          const sp = { fi, x, z };
          const v = (L.axis === 'x' ? z : x) - L.c;
          if (Math.sign(v) !== side) continue;
          const along = L.axis === 'x' ? x : z;
          const dist = Math.hypot(Math.max(L.a - along, 0, along - L.b), v);
          if (dist < 1.7 || dist > 2.8 || (best && dist >= best.dist)) continue;
          if (N.clearance(nav, sp) < nav.radius + 0.05 || N.roomAt(nav, sp)?.id !== room.id) continue;
          const nq = N.nearest(nav, sp);
          if (!nq || Math.hypot(nq.x - x, nq.z - z) > 1e-6) continue;
          const len = Math.hypot(mid.x - x, mid.z - z);
          let ok = true;
          for (let t = 0.1; t <= len - 0.2 && ok; t += 0.05) {
            const k = t / len;
            if (cellAt(F, x + (mid.x - x) * k, z + (mid.z - z) * k)) ok = false;
          }
          if (ok) best = { id: L.id, fi, axis: L.axis, c: L.c, a: L.a, b: L.b, side, x, z, yaw: yawTo(mid.x - x, mid.z - z), room: room.id, other: other.id, dist };
        }
      if (best) out.push(best);
    }
  }
  return out;
}

/** 站在离物件 dist 米、朝着它看的地方（往房间中心那边退，走得过去）→ { x, z, yaw } */
function standFor(nav, fi, item, room, dist = 1.6) {
  const b = footprintOf(item);
  const c = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 };
  const rc = room ? { x: room.x + room.w / 2, z: room.y + room.d / 2 } : c;
  let dx = rc.x - c.x;
  let dz = rc.z - c.z;
  const L = Math.hypot(dx, dz) || 1;
  dx /= L;
  dz /= L;
  let best = null;
  for (let t = dist; t >= 0.6; t -= 0.1) {
    const q = { fi, x: c.x + dx * t, z: c.z + dz * t };
    if (N.clearance(nav, q) >= nav.radius + 0.05) {
      best = q;
      break;
    }
  }
  const q = best || N.nearest(nav, { fi, x: c.x + dx * dist, z: c.z + dz * dist });
  return { x: q.x, z: q.z, yaw: yawTo(c.x - q.x, c.z - q.z) };
}

/** 这一层最大的房间正中（走得到的点） */
function roomyPoint(nav, nd, fi) {
  const r = nd.floors[fi].rooms.filter((x) => !isHole(x) && !ROOM_TYPES[x.type]?.outdoor).sort((a, b) => b.w * b.d - a.w * a.d)[0];
  return N.nearest(nav, { fi, x: r.x + r.w / 2, z: r.y + r.d / 2 });
}

// ───────────────────────── 一个情形 ─────────────────────────

async function runCase(browser, origin, c, o) {
  const log = (...a) => console.log(`  [${c.id}]`, ...a);
  const res = { id: c.id, steps: [], downloads: 0, errors: [], shots: [] };
  const { nav, project, nd } = navFor(c.fixture);
  const { ctx, page, errors } = await openCase(browser, origin, c, o);
  page.setDefaultTimeout(120e3);
  const downloads = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  let dead = false;
  const shot = async (name) => {
    try {
      const f = join(o.out, `${c.id}-${name}.png`);
      writeFileSync(f, await page.screenshot({ timeout: 60e3 }));
      res.shots.push(f);
    } catch {
      /* 截不到不算失败 */
    }
  };
  const step = async (name, fn, { fatal = false } = {}) => {
    if (dead) return res.steps.push({ name, ok: false, msg: '前面的步骤失败，没跑' });
    const t0 = Date.now();
    try {
      const note = await fn();
      res.steps.push({ name, ok: true, msg: note || '', ms: Date.now() - t0 });
      log(`✓ ${name}${note ? ` — ${note}` : ''} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    } catch (e) {
      const msg = e instanceof Fail ? e.message : `出错：${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`;
      res.steps.push({ name, ok: false, msg, ms: Date.now() - t0 });
      log(`✗ ${name} — ${msg}`);
      await shot(`fail-${res.steps.length}`);
      if (fatal) dead = true;
    }
  };
  const tool = async (id) => {
    await page.click(`[data-walk-tool="${id}"]`);
    await until(() => page.evaluate((t) => window.__genieWalk?.tool === t, id), 10e3, `换到工具 ${id}`);
  };
  const goto = async (fi, s, pitch = 0) => {
    const ok = await page.evaluate(({ fi, s, pitch }) => {
      const w = window.__genieWalk;
      return w.goto({ floor: w.nav.floors[fi].id, x: s.x, z: s.z, yaw: s.yaw, pitch });
    }, { fi, s, pitch });
    check(ok === true, `goto 没成功（${ok}）`);
    await sleep(2500); // 画两帧（SwiftShader）
  };
  const walkToP = async (t, timeout = 300e3) => {
    await page.evaluate((t) => {
      window.__e2e = { res: null };
      window.__genieWalk.walkTo(t).then((r) => (window.__e2e.res = r));
    }, t);
    return until(() => page.evaluate(() => (window.__e2e.res == null ? null : { r: window.__e2e.res })), timeout, `走到 ${fmtP(t)}`, 500).then((x) => x.r);
  };
  /** 拖动画面转到 (yaw, pitch)：每次从画布正中拖最多 300px（真的鼠标拖动） → 转完的 pose */
  const look = async (yaw, pitch) => {
    for (let i = 0; i < 6; i++) {
      const s = await page.evaluate(() => {
        const e = window.__genie;
        const p = window.__genieWalk.pose();
        const r = e.renderer.domElement.getBoundingClientRect();
        return { yaw: p.yaw, pitch: p.pitch, fov: e.walk.fov, H: e.container.clientHeight, cx: r.left + r.width * 0.5, cy: r.top + r.height * 0.42 };
      });
      const k = ((s.fov * Math.PI) / 180) / s.H;
      let dx = wrapA(yaw - s.yaw) / k;
      let dy = (pitch - s.pitch) / k;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      if (m > 300) {
        dx *= 300 / m;
        dy *= 300 / m;
      }
      const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y) === window.__genie.renderer.domElement, { x: s.cx, y: s.cy });
      check(top, '画布正中被界面挡住了');
      await page.mouse.move(s.cx, s.cy);
      await page.mouse.down();
      await page.mouse.move(s.cx + dx, s.cy + dy, { steps: 6 });
      await page.mouse.up();
      await sleep(400);
    }
    await sleep(2000);
    return page.evaluate(pagePose);
  };
  /** 转向地上最空的方向、稍微低头 → 那个方向上可以点的地板点 */
  const faceFloor = async (pitch = -0.32) => {
    let p0 = await still(page, { quiet: 1200 });
    let o2 = openDir(nav, p0);
    if (!o2 || o2.run < 2.2) {
      // 站的地方太挤：先跳到这一层最大的房间正中
      const q = roomyPoint(nav, nd, p0.fi);
      await goto(p0.fi, { x: q.x, z: q.z, yaw: p0.yaw });
      p0 = await page.evaluate(pagePose);
      o2 = openDir(nav, p0);
    }
    check(o2 && o2.run >= 2.2, `${fmtP(p0)} 四周都太挤（最空的方向只有 ${r2(o2?.run || 0)}m）`);
    const p = await look(o2.yaw, pitch);
    const pts = [];
    for (const dist of [2.2, 1.9, 2.6, 3.0, 1.6, 3.4])
      for (const da of [0, 0.15, -0.15, 0.3, -0.3]) {
        const d = dirOf(p.yaw + da);
        const q = { fi: p.fi, x: p.x + d.x * dist, z: p.z + d.z * dist };
        if (dist <= o2.run && N.clearance(nav, q) >= nav.radius + 0.1) pts.push({ x: q.x, y: p.elev, z: q.z });
      }
    check(pts.length, '前面没有能走的地板');
    return { p, pts, run: o2.run };
  };
  let before = null;

  try {
    // ── 开机 → 走进去 ──
    await step(
      '开机、金色「走进去」',
      async () => {
        await settle(page, `${c.id} 开机`);
        await page.waitForSelector('[data-walk="enter"]', { state: 'visible', timeout: 30e3 });
        before = await page.evaluate(() => {
          const e = window.__genie;
          return { pos: e.camera.position.toArray(), quat: e.camera.quaternion.toArray(), target: e.controls.target.toArray(), vo: { ...e.vo }, floorView: e.floorView, active: e.activeIdx, time: e.time };
        });
        const pn = await page.evaluate(() => document.querySelector('[data-walk="enter"]').textContent.trim());
        return `按钮「${pn}」`;
      },
      { fatal: true },
    );

    await step(
      '飞进去 → walking，落在大门里面、眼睛高',
      async () => {
        await page.click('[data-walk="enter"]');
        await waitPhase(page, 'walking', `${c.id} 走进去`, 240e3);
        const p = await page.evaluate(pagePose);
        const st = await page.evaluate(() => ({ start: window.__genieWalk.nav.start, walk: !!window.__genie.walk, tick: typeof window.__genie.onTick, ceil: window.__genie.floors.map((F) => !!F.ceiling?.visible) }));
        check(st.walk && st.tick === 'function', `engine.walk / onTick 没接上（${JSON.stringify(st)}）`);
        check(near(p.camY, p.elev + EYE, 0.05), `眼睛高 ${r2(p.camY)}，应该 ${r2(p.elev + EYE)}`);
        const ns = st.start;
        check(ns && ns.fi === p.fi && Math.hypot(p.x - ns.x, p.z - ns.z) < 1.2, `落点 ${fmtP(p)} 离 nav.start ${fmtP(ns)} 太远`);
        check(N.passable(nav, p), `落点走不过去 ${fmtP(p)}`);
        const nsNode = nav.start;
        check(Math.hypot(nsNode.x - ns.x, nsNode.z - ns.z) < 1e-6, `Node 里的导航和页面里的不一样（start ${fmtP(nsNode)} / ${fmtP(ns)}）`);
        await shot('landed');
        return `落在 ${fmtP(p)}，眼睛 ${r2(p.camY)}m，nav.start ${fmtP(ns)}，天花 ${st.ceil.join('/')}`;
      },
      { fatal: true },
    );

    // ── 潘吉带逛（第一次走进去自动开始） ──
    await step('带逛：第一次走进去自动开始，有字幕', async () => {
      await until(() => page.evaluate(() => window.__genieWalk.tour.running && !!document.querySelector('.walk-tour')), 15e3, '开始带逛');
      const s = await until(
        () => page.evaluate(() => {
          const st = window.__genieWalk.tour.state();
          const txt = document.querySelector('.walk-tour-text')?.textContent.trim() || '';
          return st.phase === 'talking' && txt ? { ...st, stop: st.stop?.id, txt } : null;
        }),
        120e3,
        '说第一句',
      );
      await shot('tour-1');
      return `第 ${s.index + 1}/${s.total} 站 ${s.stop}：「${s.txt.slice(0, 24)}…」`;
    });
    await step('带逛：「下一站」→ 下一句', async () => {
      const s0 = await page.evaluate(() => ({ ...window.__genieWalk.tour.state(), stop: null, txt: document.querySelector('.walk-tour-text')?.textContent.trim() }));
      check(s0.running, '没在带逛');
      await page.click('.walk-tour-next');
      const s = await until(
        () => page.evaluate((i0) => {
          const st = window.__genieWalk.tour.state();
          const txt = document.querySelector('.walk-tour-text')?.textContent.trim() || '';
          return st.index > i0 && st.phase === 'talking' && txt ? { ...st, stop: st.stop?.id, txt } : null;
        }, s0.index),
        240e3,
        '到下一站开口',
        500,
      );
      check(s.txt !== s0.txt, '字幕没换');
      await shot('tour-2');
      return `第 ${s.index + 1}/${s.total} 站 ${s.stop}：「${s.txt.slice(0, 24)}…」`;
    });
    await step('带逛：「跳过」→ 停下', async () => {
      await page.click('.walk-tour-skip');
      await until(() => page.evaluate(() => !window.__genieWalk.tour.running && !document.querySelector('.walk-tour') && !!document.querySelector('.walk-tour-start')), 15e3, '停下带逛');
      await still(page, { quiet: 1500, timeout: 60e3 });
      return '停了，「带我逛逛」回来了';
    });

    // ── 拖动转头 ──
    await step('拖动画面 → 转头（左右 / 上下）', async () => {
      const p = await still(page, { quiet: 1200 });
      const want = { yaw: wrapA(p.yaw + 0.6), pitch: -0.3 };
      const got = await look(want.yaw, want.pitch);
      check(Math.abs(wrapA(got.yaw - want.yaw)) < 0.03 && Math.abs(got.pitch - want.pitch) < 0.03, `转到 yaw ${r2(got.yaw)} pitch ${r2(got.pitch)}，应该 ${r2(want.yaw)} / ${r2(want.pitch)}`);
      check(Math.hypot(got.x - p.x, got.z - p.z) < 1e-3, '拖动的时候人走动了');
      return `yaw ${r2(p.yaw)} → ${r2(got.yaw)}，pitch ${r2(p.pitch)} → ${r2(got.pitch)}`;
    });

    // ── 点地板走过去 ──
    await step('点地板 → 走过去', async () => {
      const { p, pts } = await faceFloor();
      const h = await page.evaluate(findHit, { pts, want: { kind: 'floor', y: p.elev, tol: 0.25 } });
      check(h, '画面里找不到点得到的地板');
      await page.mouse.click(h.x, h.y);
      await until(() => page.evaluate((p0) => {
        const q = window.__genieWalk.pose();
        return Math.hypot(q.x - p0.x, q.z - p0.z) > 0.2;
      }, p), 30e3, '开始走');
      const q = await still(page);
      const tgt = h.hit.point;
      const d = Math.hypot(q.x - tgt.x, q.z - tgt.z);
      check(d < 0.35, `停在 ${fmtP(q)}，离点的地方 (${r2(tgt.x)}, ${r2(tgt.z)}) 还有 ${r2(d)}m`);
      check(near(q.camY, q.elev + EYE, 0.02), `走完眼睛高 ${r2(q.camY)}`);
      return `从 ${fmtP(p)} 走到 ${fmtP(q)}（点的地方差 ${r2(d)}m）`;
    });

    // ── 小地图：点另一个房间 → 走过去 ──
    await step('小地图：点另一个房间 → 走过去', async () => {
      const p = await still(page, { quiet: 1200 });
      const here = N.roomAt(nav, p)?.id;
      const rooms = nd.floors[p.fi].rooms.filter((r) => r.id !== here && !isHole(r) && !ROOM_TYPES[r.type]?.outdoor);
      let pick = null;
      for (const r of rooms) {
        const q = { fi: p.fi, x: r.x + r.w / 2, z: r.y + r.d / 2 };
        const nq = N.nearest(nav, q);
        if (!nq || Math.hypot(nq.x - q.x, nq.z - q.z) > 0.05 || N.clearance(nav, q) < nav.radius + 0.1) continue;
        const route = N.path(nav, p, q);
        if (!route || route.legs.length > 1 || route.length > 9) continue;
        if (!pick || route.length < pick.len) pick = { r, q, len: route.length };
      }
      check(pick, '找不到能点的房间');
      const box = await page.evaluate(() => {
        const r = document.querySelector('.walk-map-svg').getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, vb: document.querySelector('.walk-map-svg').getAttribute('viewBox').split(/\s+/).map(Number) };
      });
      const [vx, vy, vw, vh] = box.vb;
      const sx = box.x + ((pick.q.x - vx) / vw) * box.w;
      const sy = box.y + ((pick.q.z - vy) / vh) * box.h;
      await page.mouse.click(sx, sy);
      await until(() => page.evaluate((p0) => {
        const q = window.__genieWalk.pose();
        return Math.hypot(q.x - p0.x, q.z - p0.z) > 0.2;
      }, p), 30e3, '开始走');
      const q = await still(page, { timeout: 240e3 });
      const d = Math.hypot(q.x - pick.q.x, q.z - pick.q.z);
      check(d < 0.3, `停在 ${fmtP(q)}，离 ${pick.r.id} 正中 ${fmtP(pick.q)} 还有 ${r2(d)}m`);
      const label = await page.evaluate(() => document.querySelector('.walk-map-room-name')?.textContent || '');
      return `点 ${pick.r.id} → 走到 ${fmtP(q)}（差 ${r2(d)}m），地图上写着「${label}」`;
    });

    // ── 摇杆 / W 键朝墙推：走到墙前停下，不穿墙 ──
    const spots = (fi, near_) => wallSpots(nav, nd, fi, near_);
    const pushWall = async (how, avoid) => {
      const p0 = await still(page, { quiet: 1200 });
      const list = spots(p0.fi, p0).filter((w) => !avoid || w.room !== avoid.room || w.yaw !== avoid.yaw);
      check(list.length, `第 ${p0.fi} 层找不到可以推的墙`);
      const w = list[0];
      await goto(w.fi, w);
      const p = await page.evaluate(pagePose);
      check(Math.hypot(p.x - w.x, p.z - w.z) < 1e-3, `goto 没到 (${r2(w.x)}, ${r2(w.z)})`);
      const d = dirOf(w.yaw);
      const samples = [];
      // 页面里每一个 'pose'（最多 100ms 一次）都记下来：采样不靠这边轮询（SwiftShader 上一次 evaluate 要等一帧）
      await page.evaluate(() => {
        const e2e = (window.__e2e = window.__e2e || {});
        e2e.poses = [];
        e2e.off = window.__genieWalk.on('pose', (q) => e2e.poses.push({ fi: q.fi, x: q.x, z: q.z }));
      });
      if (how === 'joystick') {
        const box = await page.locator('.walk-joy').boundingBox();
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx, cy - 48, { steps: 4 });
      } else await page.keyboard.down('w');
      const t0 = Date.now();
      let lastMove = Date.now();
      let last = p;
      try {
        while (Date.now() - t0 < 120e3) {
          await sleep(300);
          const q = await page.evaluate(pagePose);
          samples.push(q);
          if (Math.hypot(q.x - last.x, q.z - last.z) > 2e-3) lastMove = Date.now();
          last = q;
          if (Date.now() - lastMove > 3000 && Date.now() - t0 > 4000) break;
        }
      } finally {
        if (how === 'joystick') await page.mouse.up();
        else await page.keyboard.up('w');
      }
      const end = await still(page, { quiet: 1500, timeout: 30e3 });
      samples.push(
        ...(await page.evaluate(() => {
          window.__e2e.off?.();
          return window.__e2e.poses;
        })),
      );
      let worst = Infinity;
      let maxAlong = -Infinity;
      let maxSide = 0;
      for (const q of [...samples, end]) {
        worst = Math.min(worst, N.clearance(nav, q));
        maxAlong = Math.max(maxAlong, (q.x - p.x) * d.x + (q.z - p.z) * d.z);
        maxSide = Math.max(maxSide, Math.abs((q.x - p.x) * -d.z + (q.z - p.z) * d.x));
        check(q.fi === p.fi, `推着推着换了楼层 fi${q.fi}`);
      }
      check(maxAlong > 0.4, `${how} 推了也没走（只走了 ${r2(maxAlong)}m）`);
      check(maxAlong < w.s - 0.05, `穿过墙了：沿着推的方向走了 ${r2(maxAlong)}m，墙在 ${r2(w.s)}m`);
      check(worst >= nav.radius - 0.03, `贴进墙里了：最近离障碍 ${r2(worst)}m（半径 ${nav.radius}）`);
      check(maxAlong > w.s - nav.radius - 0.35, `没走到墙前面（走了 ${r2(maxAlong)}m，墙在 ${r2(w.s)}m）`);
      check(N.roomAt(nav, end)?.id === w.room, `推完不在原来的房间 ${w.room}（在 ${N.roomAt(nav, end)?.id}）`);
      return { msg: `${w.room} 朝隔壁 ${w.behind} 的墙（${r2(w.s)}m）推，走了 ${r2(maxAlong)}m（横着 ${r2(maxSide)}m）停在 ${fmtP(end)}，离障碍最近 ${r2(worst)}m，${samples.length} 次采样`, w };
    };
    let pushed = null;
    await step('摇杆朝墙推：走到墙前停下、不穿墙', async () => {
      const r = await pushWall('joystick', null);
      pushed = r.w;
      await shot('joystick-wall');
      return r.msg;
    });
    await step('W 键朝另一面墙走：不穿墙', async () => (await pushWall('keys', pushed)).msg);

    // ── 门：点关着的门 → 走过去，门朝离人远的那一边开 ──
    await step('点一扇关着的门 → 门开（朝离人远的那一边）、走过去', async () => {
      const p0 = await still(page, { quiet: 1200 });
      const state = await page.evaluate(() => Object.fromEntries(window.__genieWalk.doors.leaves.map((L) => [L.id, { s: L.s, t: L.target }])));
      const list = doorSpots(nav, nd, p0.fi).filter((d) => state[d.id] && !state[d.id].s && !state[d.id].t);
      check(list.length, '找不到关着、能站在前面的门');
      list.sort((a, b) => Math.hypot(a.x - p0.x, a.z - p0.z) - Math.hypot(b.x - p0.x, b.z - p0.z));
      const D = list[0];
      await goto(D.fi, D, -0.1);
      await sleep(1000);
      const s0 = await page.evaluate((id) => window.__genieWalk.doors.leaves.find((x) => x.id === id).s, D.id);
      check(s0 === 0, `站在 1.9m 外门就开了（s ${s0}）`);
      const elev = nd.floors[D.fi].elev;
      const pts = [];
      for (const y of [1.0, 1.3, 0.7, 1.6]) for (const k of [0.5, 0.3, 0.7]) {
        const u = D.a + (D.b - D.a) * k;
        pts.push(D.axis === 'x' ? { x: u, y: elev + y, z: D.c + D.side * 0.03 } : { x: D.c + D.side * 0.03, y: elev + y, z: u });
      }
      const h = await page.evaluate(findHit, { pts, want: { kind: 'door', door: D.id } });
      check(h, `画面里点不到门 ${D.id}`);
      await shot('door-before');
      await page.mouse.click(h.x, h.y);
      let maxS = 0;
      const t0 = Date.now();
      let q = null;
      let lastP = null;
      let since = Date.now();
      while (Date.now() - t0 < 180e3) {
        await sleep(350);
        const x = await page.evaluate((id) => ({ s: window.__genieWalk.doors.leaves.find((L) => L.id === id).s, p: window.__genieWalk.pose() }), D.id);
        if (Math.abs(x.s) > Math.abs(maxS)) maxS = x.s;
        if (!lastP || Math.hypot(x.p.x - lastP.x, x.p.z - lastP.z) > 1e-3) since = Date.now();
        lastP = x.p;
        if (Date.now() - since > 2500 && Date.now() - t0 > 3000) {
          q = x.p;
          break;
        }
      }
      check(q, '3 分钟还没停下');
      check(Math.abs(maxS) >= 0.95, `门 ${D.id} 只开到 ${r2(maxS)}`);
      check(Math.sign(maxS) === -D.side, `门朝人这一边开了（s ${r2(maxS)}、人在 ${D.side > 0 ? 'pos' : 'neg'} 边）`);
      const nowSide = Math.sign((D.axis === 'x' ? q.z : q.x) - D.c);
      check(nowSide === -D.side, `没走到门那一边（${fmtP({ fi: D.fi, ...q })}）`);
      check(N.roomAt(nav, { fi: D.fi, x: q.x, z: q.z })?.id === D.other, `走到了 ${N.roomAt(nav, { fi: D.fi, x: q.x, z: q.z })?.id}，不是门那边的 ${D.other}`);
      await shot('door-after');
      return `${D.room} → 点门 ${D.id} → 门开到 ${r2(maxS)}（离人远的那一边），走到 ${D.other} ${fmtP({ fi: D.fi, ...q })}`;
    });

    // ── 刷颜色：厨房柜子 → 柜体换了，墙面没变 ──
    const kitchen = (() => {
      for (const it of project.furniture.filter((f) => f.kind === 'kitchenRun')) {
        const fi = nd.floors.findIndex((f) => f.rooms.some((r) => r.id === it.room));
        if (fi < 0) continue;
        const room = nd.floors[fi].rooms.find((r) => r.id === it.room);
        return { it, fi, room };
      }
      return null;
    })();
    await step('刷颜色：点厨房柜子 → 托盘是柜体，换一个 → 柜体变了、墙面没变', async () => {
      check(kitchen, '方案里没有厨房柜');
      const { it, fi, room } = kitchen;
      const s = standFor(nav, fi, it, room, 1.7);
      await goto(fi, s, -0.32);
      await tool('paint');
      const elev = nd.floors[fi].elev;
      const b = footprintOf(it);
      const pts = [];
      for (const y of [0.45, 0.3, 0.6, 0.75])
        for (const k of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          const x = b.x0 + (b.x1 - b.x0) * k;
          const z = b.z0 + (b.z1 - b.z0) * k;
          // 柜子正面：朝人的那一边
          const fx = Math.abs(s.x - (b.x0 + b.x1) / 2) > Math.abs(s.z - (b.z0 + b.z1) / 2);
          pts.push(fx ? { x: s.x > (b.x0 + b.x1) / 2 ? b.x1 : b.x0, y: elev + y, z } : { x, y: elev + y, z: s.z > (b.z0 + b.z1) / 2 ? b.z1 : b.z0 });
        }
      const h = await page.evaluate(findHit, { pts, want: { kind: 'slot', slot: 'cabinetry' } });
      check(h, `画面里点不到柜体（站在 ${r2(s.x)}, ${r2(s.z)}）`);
      const m0 = await page.evaluate(() => ({ ...window.__genie.lib.current }));
      await page.mouse.click(h.x, h.y);
      const slot = await until(() => page.evaluate(() => document.querySelector('.walk-tray[data-walk-slot]')?.getAttribute('data-walk-slot')), 15e3, '出托盘');
      check(slot === 'cabinetry', `托盘是 ${slot}，不是 cabinetry（以前「点哪都只换墙面」）`);
      await shot('paint-tray');
      const mat = await page.evaluate(() => [...document.querySelectorAll('.walk-tray .walk-chip:not(.is-cur)')].map((b) => b.getAttribute('data-mat'))[0]);
      check(mat, '托盘里没有别的材质');
      await page.click(`.walk-tray .walk-chip[data-mat="${mat}"]`);
      // 可能要确认（锁住的表面、踩雷提醒）
      await sleep(600);
      if (await page.$('.s-modal-wrap')) {
        const ok = await page.$('.s-modal-wrap .btn-gold, .s-modal-wrap button.primary, .s-modal-wrap [data-sfx="confirm"]');
        if (ok) await ok.click();
      }
      const m1 = await until(() => page.evaluate((id) => (window.__genie.lib.current.cabinetry === id ? { ...window.__genie.lib.current } : null), mat), 20e3, `柜体换成 ${mat}`);
      check(m1.walls === m0.walls, `墙面也变了：${m0.walls} → ${m1.walls}`);
      for (const k of Object.keys(m0)) if (k !== 'cabinetry') check(m1[k] === m0[k], `${k} 也变了：${m0[k]} → ${m1[k]}`);
      await sleep(1500);
      await shot('paint-after');
      return `点中 ${h.hit.item || '?'} 的柜体：${m0.cabinetry} → ${mat}，墙面还是 ${m1.walls}`;
    });

    // ── 地板：脚下这间（厨房 → 地砖） ──
    await step('地板：换脚下这间的地板 / 地砖', async () => {
      const p = await page.evaluate(pagePose);
      const r = N.roomAt(nav, p);
      const want = ROOM_TYPES[r?.type]?.floor === 'tile' ? 'tile' : 'floor';
      await tool('floor');
      const slot = await until(() => page.evaluate(() => document.querySelector('.walk-tray[data-walk-slot]')?.getAttribute('data-walk-slot')), 15e3, '出托盘');
      check(slot === want, `托盘是 ${slot}，站在 ${r?.id}（${r?.type}）应该是 ${want}`);
      const m0 = await page.evaluate(() => ({ ...window.__genie.lib.current }));
      const mat = await page.evaluate(() => [...document.querySelectorAll('.walk-tray .walk-chip:not(.is-cur)')].map((b) => b.getAttribute('data-mat'))[0]);
      check(mat, '托盘里没有别的材质');
      await page.click(`.walk-tray .walk-chip[data-mat="${mat}"]`);
      await sleep(600);
      if (await page.$('.s-modal-wrap')) {
        const ok = await page.$('.s-modal-wrap .btn-gold, .s-modal-wrap button.primary, .s-modal-wrap [data-sfx="confirm"]');
        if (ok) await ok.click();
      }
      const m1 = await until(() => page.evaluate(({ s, id }) => (window.__genie.lib.current[s] === id ? { ...window.__genie.lib.current } : null), { s: want, id: mat }), 20e3, `${want} 换成 ${mat}`);
      for (const k of Object.keys(m0)) if (k !== want) check(m1[k] === m0[k], `${k} 也变了`);
      return `${r?.id}（${r?.type}）的 ${want}：${m0[want]} → ${mat}`;
    });

    // ── 家具：点中 → 转 90° → 拖 ──
    const sofa = (() => {
      for (const kind of ['sofa', 'diningTable', 'bed', 'coffeeTable']) {
        const it = project.furniture.find((f) => f.kind === kind && nd.floors.findIndex((fl) => fl.rooms.some((r) => r.id === f.room)) === 0);
        if (it) return { it, fi: 0, room: nd.floors[0].rooms.find((r) => r.id === it.room) };
      }
      return null;
    })();
    await step('家具：点中 → 转 90° → 按住拖，都经过 api', async () => {
      check(sofa, '没有沙发 / 餐桌');
      const { it, fi, room } = sofa;
      const s = standFor(nav, fi, it, room, 2.2);
      await goto(fi, s, -0.38);
      await tool('furnish');
      const elev = nd.floors[fi].elev;
      const ptsFor = (x, z) => {
        const pts = [];
        for (const y of [0.3, 0.45, 0.2, 0.6]) for (const [ox, oz] of [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) pts.push({ x: x + ox, y: elev + y, z: z + oz });
        return pts;
      };
      const at0 = await page.evaluate((id) => {
        const d = window.__genie.itemData.get(id);
        return d ? { x: d.x, z: d.z, rot: d.rot } : null;
      }, it.id);
      check(at0, `引擎里没有 ${it.id}`);
      let h = await page.evaluate(findHit, { pts: ptsFor(at0.x, at0.z), want: { kind: 'item', item: it.id } });
      check(h, `画面里点不到 ${it.kind}`);
      await page.mouse.click(h.x, h.y);
      await until(() => page.evaluate((id) => document.querySelector('.walk-furnish')?.getAttribute('data-walk-item') === id, it.id), 15e3, `选中 ${it.id}`);
      await page.click('[data-walk-act="rotate"]');
      const at1 = await until(() => page.evaluate(({ id, r0 }) => {
        const d = window.__genie.itemData.get(id);
        return d && d.rot !== r0 ? { x: d.x, z: d.z, rot: d.rot } : null;
      }, { id: it.id, r0: at0.rot }), 20e3, '转过来');
      await sleep(2500);
      h = await page.evaluate(findHit, { pts: ptsFor(at1.x, at1.z), want: { kind: 'item', item: it.id } });
      check(h, '转过以后画面里点不到它');
      await page.mouse.move(h.x, h.y);
      await page.mouse.down();
      await page.mouse.move(h.x + 25, h.y + 4, { steps: 3 });
      await sleep(1200);
      await page.mouse.move(h.x + 70, h.y + 10, { steps: 4 });
      await sleep(1500);
      await page.mouse.up();
      const at2 = await until(() => page.evaluate(({ id, a }) => {
        const d = window.__genie.itemData.get(id);
        return d && (Math.abs(d.x - a.x) > 0.02 || Math.abs(d.z - a.z) > 0.02) ? { x: d.x, z: d.z, rot: d.rot } : null;
      }, { id: it.id, a: at1 }), 20e3, '挪过去');
      const sel = await page.evaluate(() => document.querySelector('.walk-furnish')?.getAttribute('data-walk-item'));
      check(sel === it.id, `拖完以后选中的是 ${sel}`);
      await shot('furnish');
      // 左上角的撤销：撤掉这一次挪动（转的那一下还在）
      await page.click('.walk-undo');
      const at3 = await until(() => page.evaluate(({ id, a }) => {
        const d = window.__genie.itemData.get(id);
        return d && Math.abs(d.x - a.x) < 1e-6 && Math.abs(d.z - a.z) < 1e-6 ? { x: d.x, z: d.z, rot: d.rot } : null;
      }, { id: it.id, a: at1 }), 20e3, '撤销回到挪之前');
      check(at3.rot === at1.rot, `撤销多撤了一步（rot ${at3.rot}）`);
      return `${it.kind} 转 ${at0.rot}° → ${at1.rot}°，挪到 (${r2(at2.x)}, ${r2(at2.z)})（原来 ${r2(at1.x)}, ${r2(at1.z)}），撤销 → 回到 (${r2(at3.x)}, ${r2(at3.z)})`;
    });

    // ── 量尺：点两下 ──
    await step('量尺：点两下 → 「… mm · 约 … 尺 / ft」', async () => {
      await tool('measure');
      const { p, pts } = await faceFloor(-0.4);
      const a = await page.evaluate(findHit, { pts, want: { kind: 'floor', y: p.elev, tol: 0.3 } });
      check(a, '画面里找不到地板点');
      const rest = pts.filter((q) => Math.hypot(q.x - a.hit.point.x, q.z - a.hit.point.z) > 1);
      const b = await page.evaluate(findHit, { pts: rest, want: { kind: 'floor', y: p.elev, tol: 0.3 } });
      check(b, '找不到第二个地板点');
      await page.mouse.click(a.x, a.y);
      await sleep(1500);
      await page.mouse.click(b.x, b.y);
      const txt = await until(
        () => page.evaluate(() => {
          const el = document.querySelector('.walk-measure-label');
          return el && el.style.visibility === 'visible' ? el.textContent : null;
        }),
        20e3,
        '出量出来的标签',
      );
      check(/mm/.test(txt) && /ft/.test(txt), `标签「${txt}」没有 mm + ft`);
      const q = await page.evaluate(pagePose);
      check(Math.hypot(q.x - p.x, q.z - p.z) < 0.01, '量尺的时候人走动了');
      const mm = Math.round(Math.hypot(a.hit.point.x - b.hit.point.x, a.hit.point.z - b.hit.point.z) * 100) * 10;
      check(txt.includes(mm.toLocaleString('en-US')), `标签「${txt}」和两点的距离 ${mm} mm 对不上`);
      await shot('measure');
      return `「${txt}」`;
    });

    // ── 拍照：收藏这个角度（员工：下载这张；许愿：没有下载） ──
    await step(`拍照：收藏这个角度${c.mode === 'wish' ? '（许愿：没有「下载这张」）' : ''}`, async () => {
      await tool('photo');
      const n0 = await page.evaluate(() => document.querySelectorAll('.walk-photo-item').length);
      await page.click('[data-walk-act="mark"]');
      await until(() => page.evaluate((n) => document.querySelectorAll('.walk-photo-item').length === n + 1, n0), 10e3, '多一个收藏');
      const marks = await until(
        () => page.evaluate((id) => {
          try {
            const list = JSON.parse(localStorage.getItem('genie.studio.projects.v1') || '[]');
            const p = list.find((x) => x.id === id);
            return p?.walkMarks?.length ? p.walkMarks : null;
          } catch {
            return null;
          }
        }, project.id),
        15e3,
        '收藏跟着方案存下来',
      );
      const shootBtn = await page.$('[data-walk-act="shoot"]');
      const file = await page.$('.walk-ui input[type="file"]');
      check(!file, '走进去的界面里有选文件');
      if (c.mode === 'wish') check(!shootBtn, '许愿模式出现了「下载这张」');
      else {
        check(shootBtn, '员工版没有「下载这张」');
        if (c.id === 'condo3') {
          const n = downloads.length;
          await shootBtn.click();
          await until(() => downloads.length > n, 240e3, '下载这张', 1000);
        }
      }
      await shot('photo');
      const m = marks[marks.length - 1];
      return `收藏了 ${marks.length} 个（最后一个 ${m.floor} (${m.x}, ${m.z}) ${m.room}）${c.mode === 'wish' ? '' : c.id === 'condo3' ? `，下载了 ${downloads.join(', ')}` : ''}`;
    });

    // ── 灯光：晚上 → 再回白天 ──
    await step('灯光：晚上 → 时间是晚上；白天 → 回到原来的钟点', async () => {
      await tool('light');
      const t0 = await page.evaluate(() => window.__genie.time);
      await page.click('[data-walk-light="night"]');
      const t1 = await until(() => page.evaluate(() => (window.__genie.day?.night >= 0.5 ? window.__genie.time : null)), 15e3, '变成晚上');
      await sleep(2500);
      await shot('night');
      await page.click('[data-walk-light="day"]');
      const t2 = await until(() => page.evaluate(() => (window.__genie.day?.night < 0.5 ? window.__genie.time : null)), 15e3, '回到白天');
      check(near(t2, t0, 0.01), `回白天是 ${t2}，原来是 ${t0}`);
      return `${t0} → ${t1} → ${t2}`;
    });

    // ── 楼梯（两层） ──
    if (nd.floors.length > 1)
      await step('楼梯：走到楼上的房间 → fi 1、楼上画着', async () => {
        await tool('walk');
        const t = stairTarget(c.fixture);
        const ys = [];
        const p0 = await page.evaluate(pagePose);
        const job = walkToP({ fi: t.fi, x: t.x, z: t.z }, 600e3);
        let maxJump = 0;
        let prev = null;
        let on = true;
        const poll = (async () => {
          while (on) {
            const q = await page.evaluate(pagePose).catch(() => null);
            if (q) {
              if (prev) maxJump = Math.max(maxJump, Math.abs(q.camY - prev.camY));
              prev = q;
              ys.push(q.camY);
            }
            await sleep(300);
          }
        })();
        const r = await job;
        on = false;
        await poll;
        const q = await still(page, { quiet: 1500 });
        check(r === true, `walkTo 结果 ${r}`);
        check(q.fi === 1, `到了以后 fi = ${q.fi}`);
        check(q.active === 1, `引擎看的是第 ${q.active} 层`);
        check(near(q.camY, q.elev + EYE, 0.02), `楼上眼睛高 ${r2(q.camY)}，应该 ${r2(q.elev + EYE)}`);
        check(maxJump < 0.6, `走楼梯时高度一下子跳了 ${r2(maxJump)}m`);
        const vis = await page.evaluate(() => {
          const e = window.__genie;
          const F = e.floors[1];
          let shown = 0;
          let meshes = 0;
          F.group.traverse((o) => {
            if (!o.isMesh) return;
            meshes++;
            let v = true;
            for (let p = o; p; p = p.parent) if (p.visible === false) v = false;
            if (v && o.layers.test(e.camera.layers)) shown++;
          });
          return { group: F.group.visible, shown, meshes, furn: !!F.furn?.visible, ceil: !!F.ceiling?.visible, f0furn: !!e.floors[0].furn?.visible };
        });
        check(vis.group && vis.shown > 0, `楼上没画出来（${JSON.stringify(vis)}）`);
        check(vis.furn, '楼上的家具没画');
        const hit = await page.evaluate(findHit, { pts: [{ x: q.x + dirOf(q.yaw).x * 2, y: q.elev, z: q.z + dirOf(q.yaw).z * 2 }, { x: q.x + dirOf(q.yaw).x * 1.5, y: q.elev, z: q.z + dirOf(q.yaw).z * 1.5 }], want: { kind: 'floor', y: q.elev, tol: 0.3 } });
        await shot('upstairs');
        return `从 ${fmtP(p0)} 走到 ${fmtP(q)}（${t.room}），眼睛 ${r2(q.camY)}m，高度 ${r2(Math.min(...ys))}→${r2(Math.max(...ys))}，一步最多 ${r2(maxJump)}m；楼上 ${vis.shown}/${vis.meshes} 个网格画着，楼上家具 ${vis.furn}、楼下家具 ${vis.f0furn}${hit ? '，点得到楼上的地板' : ''}`;
      });

    // ── 收藏的角度：点一下回到那里（两层：从楼上回到楼下） ──
    await step('收藏的角度：点一下回到那里', async () => {
      const mk = await page.evaluate((id) => {
        const p = JSON.parse(localStorage.getItem('genie.studio.projects.v1') || '[]').find((x) => x.id === id);
        return p?.walkMarks?.[p.walkMarks.length - 1] || null;
      }, project.id);
      check(mk, '没有收藏的角度');
      const fi = nd.floors.findIndex((f) => f.id === mk.floor);
      let p0 = await page.evaluate(pagePose);
      if (p0.fi === fi && Math.hypot(p0.x - mk.x, p0.z - mk.z) < 1) {
        const q = nav.start;
        await goto(q.fi, { x: q.x, z: q.z, yaw: 0 });
        p0 = await page.evaluate(pagePose);
      }
      await tool('photo');
      await page.click(`[data-mark="${mk.id}"] .walk-photo-go`);
      const q = await until(() => page.evaluate(({ m, fi }) => {
        const p = window.__genieWalk.pose();
        return p.fi === fi && Math.hypot(p.x - m.x, p.z - m.z) < 0.02 && Math.abs(p.yaw - m.yaw) < 0.01 ? p : null;
      }, { m: mk, fi }), 20e3, '回到收藏的角度');
      await sleep(2000);
      const e = await page.evaluate(() => ({ active: window.__genie.activeIdx, y: window.__genie.camera.position.y }));
      check(e.active === fi, `引擎看的是第 ${e.active} 层，不是 ${fi}`);
      check(near(e.y, nd.floors[fi].elev + EYE, 0.02), `眼睛高 ${r2(e.y)}`);
      await tool('walk');
      return `从 ${fmtP(p0)} 回到 ${fmtP(q)}（${mk.room}）`;
    });

    // ── 回到全屋 ──
    await step(
      '回到全屋 → out、engine.walk / onTick = null、镜头回到原样',
      async () => {
        await page.click('[data-walk="exit"]');
        await waitPhase(page, 'out', `${c.id} 回到全屋`, 120e3);
        const s = await until(
          () => page.evaluate(() => {
            const e = window.__genie;
            // 卸下 WalkMode（dispose → __genieWalk = null）是 React 提交以后的副作用：等它也做完
            if (document.querySelector('[data-walk="exit"]') || !document.querySelector('[data-walk="enter"]') || window.__genieWalk) return null;
            return { walk: e.walk, tick: e.onTick, ctl: window.__genieWalk ?? null, pos: e.camera.position.toArray(), quat: e.camera.quaternion.toArray(), target: e.controls.target.toArray(), vo: { ...e.vo }, floorView: e.floorView, active: e.activeIdx, ceil: e.floors.map((F) => !!F.ceiling?.visible), controls: e.controls.enabled };
          }),
          60e3,
          '回到鸟瞰的界面',
        );
        check(s.walk === null, 'engine.walk 不是 null');
        check(s.tick === null, 'engine.onTick 不是 null');
        check(s.ctl === null, 'window.__genieWalk 没清掉');
        check(s.controls, 'OrbitControls 没打开');
        check(!s.ceil.some(Boolean), '天花还盖着');
        check(s.floorView === before.floorView && s.active === before.active, `楼层没回去：${s.floorView}/${s.active}，原来 ${before.floorView}/${before.active}`);
        const d = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
        check(d(s.pos, before.pos) < 1e-6 && d(s.quat, before.quat) < 1e-6 && d(s.target, before.target) < 1e-6, `镜头没回到原样（位置差 ${d(s.pos, before.pos)}）`);
        check(near(s.vo.x, before.vo.x, 1e-6) && near(s.vo.y, before.vo.y, 1e-6), `主点偏移没回去 ${JSON.stringify(s.vo)} / ${JSON.stringify(before.vo)}`);
        await sleep(1500);
        await shot('out');
        return '鸟瞰原样回来了';
      },
      { fatal: true },
    );

    await step(c.mode === 'wish' ? '许愿模式：从头到尾没有任何下载' : '下载只有员工按「下载这张」那一次', async () => {
      if (c.mode === 'wish') check(downloads.length === 0, `许愿模式下载了 ${downloads.join(', ')}`);
      else check(downloads.length === (c.id === 'condo3' ? 1 : 0), `下载了 ${downloads.length} 个：${downloads.join(', ')}`);
      return `${downloads.length} 个下载`;
    });

    // ── 再走进去一次：潘吉不再自动带逛，照样能走、能出来 ──
    await step('再走进去一次：不自动带逛、照样能走、能出来', async () => {
      await settle(page, `${c.id} 回到全屋之后`);
      await page.click('[data-walk="enter"]');
      await waitPhase(page, 'walking', `${c.id} 再走进去`, 240e3);
      await sleep(3000);
      const st = await page.evaluate(() => ({ running: window.__genieWalk.tour.running, start: !!document.querySelector('.walk-tour-start'), leaves: window.__genieWalk.doors.leaves.length }));
      check(!st.running && st.start, `第二次走进去又自动带逛了（${JSON.stringify(st)}）`);
      const { p, pts } = await faceFloor();
      const h = await page.evaluate(findHit, { pts, want: { kind: 'floor', y: p.elev, tol: 0.25 } });
      check(h, '画面里找不到点得到的地板');
      await page.mouse.click(h.x, h.y);
      const q = await until(() => page.evaluate((p0) => {
        const x = window.__genieWalk.pose();
        return Math.hypot(x.x - p0.x, x.z - p0.z) > 0.3 ? x : null;
      }, p), 60e3, '走起来');
      await page.click('[data-walk="exit"]');
      await waitPhase(page, 'out', `${c.id} 再回到全屋`, 120e3);
      await until(() => page.evaluate(() => !window.__genie.walk && !window.__genie.onTick && !window.__genieWalk && !!document.querySelector('[data-walk="enter"]')), 60e3, '回到鸟瞰');
      return `${st.leaves} 扇门，走到 ${fmtP(q)}，出来了`;
    });
  } finally {
    res.downloads = downloads.length;
    res.errors = errors.filter((e) => !/AudioContext|play\(\)|NotAllowedError|autoplay/i.test(e));
    await ctx.close();
  }
  return res;
}

// ───────────────────────── 主程序 ─────────────────────────

async function main() {
  const o = args(process.argv.slice(2));
  mkdirSync(o.out, { recursive: true });
  let cases = CASES;
  if (o.only) cases = cases.filter((c) => o.only.split(',').includes(c.id));
  const { srv, origin } = await serve(o.dist);
  console.log(`打包目录 ${o.dist} → ${origin}；截图 ${o.out}`);
  const T0 = Date.now();
  const all = [];
  const browser = await launch();
  try {
    for (const c of cases) {
      console.log(`▶ ${c.id}（${c.mode === 'wish' ? '许愿模式' : '员工'}，${c.quality}，${c.w}×${c.h}）`);
      try {
        all.push(await runCase(browser, origin, c, o));
      } catch (e) {
        console.log(`  ✗ ${c.id} 出错：${e?.message || e}`);
        all.push({ id: c.id, steps: [{ name: '整个情形', ok: false, msg: String(e?.message || e) }], errors: [], shots: [] });
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
  let bad = 0;
  console.log('\n结果：');
  for (const r of all) {
    const fails = r.steps.filter((s) => !s.ok);
    bad += fails.length + (r.errors?.length ? 1 : 0);
    console.log(`  ${fails.length || r.errors?.length ? '✗' : '✓'} ${r.id}：${r.steps.length - fails.length}/${r.steps.length} 步通过`);
    for (const s of fails) console.log(`      ✗ ${s.name}：${s.msg}`);
    for (const e of r.errors || []) console.log(`      ! ${e}`);
  }
  writeFileSync(join(o.out, 'report.json'), `${JSON.stringify({ at: new Date().toISOString(), dist: o.dist, cases: all }, null, 2)}\n`);
  console.log(`用时 ${((Date.now() - T0) / 1000).toFixed(0)} 秒；${bad ? `✗ ${bad} 处不对` : '✓ 全部通过'}（${join(o.out, 'report.json')}）`);
  return bad ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`✗ ${err?.stack || err}`);
      process.exit(2);
    },
  );

export { runCase, CASES, navFor, wallSpots, doorSpots, openDir };
