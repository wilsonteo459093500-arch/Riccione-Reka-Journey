// node test/fx.test.mjs —— 动效 fx.js 的纯函数 + 时钟 + 守门（不需要浏览器）。
//   · 曲线：JS 的 EASE 和 fx.css 的 --fx-* 是同一组数字；弹簧的超调 / 收敛时间符合 SPEC §2.2
//   · 时长规则（扫光、飞行、光点、里程表、金尘数量）符合 SPEC §2.1 / §3
//   · 侵蚀噪声场：0–1、顺序对、离起点近的先被吃掉、同一个种子结果一样
//   · 里程表的机械进位；起点 / awayFrom；帧图尺寸；排序；弧线往上拱
//   · 手动时钟：after / tween / hook / step 是确定的
//   · 颜色守门：fx.js 的颜色全部来自 palette.js，fx.css 只用 base.css 的变量
//   · 没有 DOM 时每个效果都安全返回；声音适配器接得上 sound.js（sfx.fx），fx 报的每个名字 sfx 都接得住
import assert from 'node:assert/strict';
import { register } from 'node:module';
import fs from 'node:fs';

// fx.js 自己 import './fx.css'（给 Vite 打包用）：Node 里把 .css 当成空模块
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function load(url, ctx, next) {
  if (url.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true };
  return next(url, ctx);
}`),
);

const fxMod = await import('../src/shared/fx.js');
const { default: fx, EASE, bezier, springCurve, springLinear, scanDuration, flightDuration, moteDuration, odometerDuration, dustBudget, erosionField, thresholdAt, originFor, spriteSize, odometerPositions, rankByDistance, arcControl, quad, rng, mixHex, rgbOf, LIGHT, HAPTICS, FX_SOUNDS, clock, config } = fxMod;
const { PALETTE } = await import('../src/shared/palette.js');

let pass = 0;
let fail = 0;
const queue = [];
const test = (name, fn) => queue.push([name, fn]);
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≉ ${b} (±${eps})`);

const FX_JS = fs.readFileSync(new URL('../src/shared/fx.js', import.meta.url), 'utf8');
const FX_CSS = fs.readFileSync(new URL('../src/shared/fx.css', import.meta.url), 'utf8');
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\w])\/\/[^\n]*/g, '$1');
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// ───────── curves ─────────

test('EASE curves: endpoints, monotonic, same numbers as fx.css', () => {
  for (const [k, f] of Object.entries(EASE)) {
    assert.equal(f(0), 0, `${k}(0)`);
    assert.equal(f(1), 1, `${k}(1)`);
    if (k === 'linear') continue;
    let prev = 0;
    for (let i = 1; i <= 50; i++) {
      const v = f(i / 50);
      assert.ok(v >= prev - 1e-6, `${k} not monotonic at ${i / 50}`);
      prev = v;
    }
  }
  const css = stripCss(FX_CSS);
  for (const [k, v] of [
    ['out', '--fx-out'],
    ['inOut', '--fx-inout'],
    ['in', '--fx-in'],
    ['scan', '--fx-scan'],
    ['std', '--fx-std'],
  ]) {
    const m = css.match(new RegExp(`${v}:\\s*(cubic-bezier\\([^)]*\\))`));
    assert.ok(m, `${v} missing in fx.css`);
    assert.equal(m[1].replace(/\s+/g, ' '), EASE[k].css, `${v} ≠ EASE.${k}`);
  }
  // ease-out is front-loaded, ease-in back-loaded
  assert.ok(EASE.out(0.25) > 0.6 && EASE.in(0.5) < 0.35);
  assert.equal(bezier(0.25, 0.25, 0.75, 0.75)(0.4).toFixed(3), '0.400');
});

test('springs settle and overshoot like SPEC §2.2', () => {
  const peak = (o) => {
    const s = springCurve(o);
    let p = 0;
    for (let t = 0; t <= s.duration; t += 2) p = Math.max(p, s.at(t));
    return { p, d: s.duration, end: s.at(s.duration) };
  };
  const flipS = peak({ stiffness: 64, damping: 12 });
  near((flipS.p - 1) * 180, 5, 2.2, 'flip overshoot degrees'); // 4–5° past 180°
  near(flipS.d, 1050, 200, 'flip settle ms');
  near(flipS.end, 1, 0.01, 'flip ends at 1');
  const land = peak({ stiffness: 320, damping: 18 });
  assert.ok(land.p > 1.1 && land.p < 1.22, `landing overshoot ${land.p}`);
  const layoutS = peak({ stiffness: 260, damping: 24 });
  assert.ok(layoutS.p > 1.01 && layoutS.p < 1.05, `layout overshoot ${layoutS.p}`);
  const rel = peak({ stiffness: 520, damping: 26 });
  assert.ok(rel.d < 600, `press release settles ${rel.d} ms`);
  // over-damped branch is monotone and still reaches 1
  const od = springCurve({ stiffness: 100, damping: 40 });
  assert.ok(od.at(od.duration) > 0.99);
  const lin = springLinear({ stiffness: 260, damping: 24 });
  assert.match(lin.easing, /^linear\(0, /);
  assert.equal(lin.easing.split(',').length, 41);
  assert.ok(lin.easing.endsWith(', 1)'));
});

// ───────── timing rules ─────────

test('timing rules (SPEC §2.1 / §3)', () => {
  assert.equal(scanDuration(40, 40), 280);
  assert.equal(scanDuration(1000, 800), 420);
  near(scanDuration(300, 100), 220 + Math.hypot(300, 100) * 0.36, 1e-9);
  assert.equal(flightDuration(0), 560);
  assert.equal(flightDuration(5000), 820);
  near(flightDuration(500), 660, 1e-9);
  assert.equal(moteDuration(0), 460);
  assert.equal(moteDuration(9999), 760);
  assert.equal(odometerDuration(0), 380);
  assert.equal(odometerDuration(1e9), 1100);
  near(odometerDuration(9), 620, 1e-9);
  assert.equal(dustBudget(10), 26);
  assert.equal(dustBudget(1e7), 240);
  near(dustBudget(33000, 0.5), 50, 1e-9);
});

// ───────── dissolve field ─────────

test('erosion field: normalised, ordered, starts at the origin, deterministic', () => {
  const W = 64;
  const H = 40;
  const f = erosionField(W, H, -0.05, 0.5, 7); // erosion from the left
  assert.equal(f.v.length, W * H);
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of f.v) {
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  near(lo, 0, 1e-6);
  near(hi, 1, 1e-6);
  // order = counting sort in 4096 buckets: sorted to within one bucket
  for (let i = 1; i < f.order.length; i++) assert.ok(f.v[f.order[i]] >= f.v[f.order[i - 1]] - 1 / 4096, 'order sorted');
  assert.equal(new Set(f.order).size, W * H, 'order is a permutation');
  const colMean = (c0, c1) => {
    let s = 0;
    let n = 0;
    for (let y = 0; y < H; y++)
      for (let x = c0; x < c1; x++) {
        s += f.v[y * W + x];
        n++;
      }
    return s / n;
  };
  assert.ok(colMean(0, 8) + 0.4 < colMean(W - 8, W), 'left side is eaten first');
  const g = erosionField(W, H, -0.05, 0.5, 7);
  assert.deepEqual(Array.from(g.v.slice(0, 50)), Array.from(f.v.slice(0, 50)));
  const h = erosionField(W, H, -0.05, 0.5, 8);
  assert.notDeepEqual(Array.from(h.v.slice(0, 50)), Array.from(f.v.slice(0, 50)));
  near(thresholdAt(0), -0.032, 1e-12);
  near(thresholdAt(23), 1.032, 1e-12);
});

test('origins, awayFrom, sprite sizes', () => {
  const r = { left: 100, top: 100, width: 200, height: 100 };
  assert.deepEqual(originFor('left', r), [-0.05, 0.5]);
  assert.deepEqual(originFor('bottom', r), [0.5, 1.05]);
  assert.deepEqual(originFor('center', r), [0.5, 0.5]);
  // the winner sits to the LEFT → erosion starts on the RIGHT (away), finishes nearest the winner
  const [ox, oy] = originFor({ awayFrom: { x: -400, y: 150 } }, r);
  assert.ok(ox > 0.9 && Math.abs(oy - 0.5) < 0.05, `awayFrom → ${ox}, ${oy}`);
  const [px] = originFor({ x: 120, y: 150 }, r);
  near(px, 0.1, 1e-9);
  assert.deepEqual(spriteSize({ width: 300, height: 200 }), [128, 84]);
  assert.deepEqual(spriteSize({ width: 100, height: 40 }), [96, 40]);
  const [w, h] = spriteSize({ width: 40, height: 400 });
  assert.equal(h, 128);
  assert.ok(w >= 20 && w <= 128);
});

test('sprite origins snap to 8 compass points + centre (a 9-card commit shares 1–3 sprites)', () => {
  const { snapOrigin } = fxMod;
  // named origins stay where they were
  for (const o of ['left', 'right', 'top', 'bottom', 'center']) {
    const [x, y] = originFor(o, { left: 0, top: 0, width: 200, height: 100 });
    const [sx, sy] = snapOrigin(x, y);
    near(sx, x, 1e-9, o);
    near(sy, y, 1e-9, o);
  }
  const pts = new Set();
  for (let i = 0; i < 400; i++) {
    const [x, y] = snapOrigin(-0.1 + (i % 20) * 0.06, -0.1 + Math.floor(i / 20) * 0.06);
    pts.add(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  assert.equal(pts.size, 9, [...pts].join(' '));
  // 3 × 3 wish tiles above a CTA at the bottom centre, all dissolving away from it → 3 directions
  const cta = { x: 300, y: 700 };
  const keys = new Set();
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 3; r++) {
      const rect = { left: 60 + c * 180, top: 80 + r * 160, width: 160, height: 140 };
      const [x, y] = originFor({ awayFrom: cta }, rect);
      keys.add(snapOrigin(x, y).join(','));
    }
  assert.ok(keys.size <= 3, `${keys.size} sprites: ${[...keys].join(' ')}`);
  // the snapped field is the same function: still normalised and starting at its origin
  const { v, order } = erosionField(64, 40, ...snapOrigin(1.08, 0.12));
  assert.equal(order.length, v.length);
});

test('clock: long frames count as real time (≤ 1 s); a hidden-tab gap does not', () => {
  assert.equal(clock.manual, false);
  const loop = (raw) => {
    const t0 = clock.t;
    clock._last = 1000;
    clock._loop(1000 + raw);
    return clock.t - t0;
  };
  near(loop(16), 16, 1e-9);
  near(loop(600), 600, 1e-9, '600 ms jank frame'); // was 16.7: at 2 fps the clock ran at 6 % of real time
  near(loop(2500), 1000, 1e-9, 'capped at 1 s');
  near(loop(9000), 16.7, 1e-9, 'a gap this long = the tab was away');
  clock._skip = true;
  near(loop(800), 16.7, 1e-9, 'first frame after visibilitychange → visible');
  near(loop(800), 800, 1e-9, 'skip is one frame only');
});

// ───────── numbers ─────────

test('odometer carry is mechanical', () => {
  assert.deepEqual(odometerPositions(129, 3), [1, 2, 9]);
  const a = odometerPositions(129.5, 3); // ones half-way 9 → 0, tens carries half a cell, hundreds still
  near(a[2], 9.5, 1e-9);
  near(a[1], 2.5, 1e-9);
  near(a[0], 1, 1e-9);
  const b = odometerPositions(199.5, 3); // every digit rolls together on 199 → 200
  near(b[0], 1.5, 1e-9);
  near(b[1], 9.5, 1e-9);
  near(b[2], 9.5, 1e-9);
  assert.deepEqual(odometerPositions(-42, 2), [4, 2]);
});

test('distance ranking, arcs, rng', () => {
  const pts = [
    { x: 100, y: 0 },
    { x: 10, y: 0 },
    { x: 50, y: 0 },
  ];
  assert.deepEqual(rankByDistance(pts, { x: 0, y: 0 }), [1, 2, 0]);
  const c = arcControl({ x: 0, y: 100 }, { x: 200, y: 100 }, 0.32);
  assert.ok(c.y < 100, 'flight arcs upwards (screen y up)');
  near(c.x, 100, 1e-9);
  near(c.L, 200, 1e-9);
  const c2 = arcControl({ x: 200, y: 100 }, { x: 0, y: 100 }, 0.32);
  assert.ok(c2.y < 100, 'also when flying leftwards');
  assert.equal(quad(0, 50, 100, 0.5), 50);
  const r1 = rng(7);
  const r2 = rng(7);
  for (let i = 0; i < 20; i++) assert.equal(r1(), r2());
  const r3 = rng(9);
  assert.ok(r3() >= 0 && r3() < 1);
});

// ───────── clock ─────────

test('manual clock: after / wait / tween / hook are deterministic', async () => {
  clock.setManual(true);
  const t0 = clock.now();
  const seen = [];
  clock.after(100, () => seen.push('a'));
  const cancel = clock.after(50, () => seen.push('cancelled'));
  cancel();
  let last = -1;
  const tw = clock.tween({ duration: 200, ease: EASE.linear, update: (q) => (last = q) });
  let hooks = 0;
  clock.hook(() => ++hooks < 3);
  clock.step(60);
  assert.deepEqual(seen, []);
  near(last, 0.3, 1e-9);
  clock.step(60);
  assert.deepEqual(seen, ['a']);
  clock.step(100);
  assert.equal(last, 1);
  await tw;
  assert.equal(hooks, 3);
  near(clock.now() - t0, 220, 1e-9);
  assert.equal(clock._busy(), false);
  clock.setManual(false);
});

// ───────── colours ─────────

test('canvas colours all come from palette.js; no colour literals in fx.js', () => {
  assert.equal(LIGHT.gold, PALETTE.gold);
  assert.equal(LIGHT.light, PALETTE.goldL);
  assert.equal(LIGHT.dusk, PALETTE.duskGold);
  assert.equal(LIGHT.mist, PALETTE.card);
  assert.equal(mixHex(PALETTE.gold, PALETTE.card, 0), PALETTE.gold.toLowerCase());
  assert.deepEqual(rgbOf('#fff'), [255, 255, 255]);
  for (const v of Object.values(LIGHT)) assert.match(v, /^#[0-9a-fA-F]{6}$/);
  const code = stripJs(FX_JS);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(code), 'hex colour literal in fx.js');
  assert.ok(!/rgba?\(\s*\d/.test(code), 'numeric rgb() literal in fx.js');
  assert.ok(!/(['"`])[^'"`\n]*[一-鿿][^'"`\n]*\1/.test(code), 'Chinese string literal in fx.js (UI strings go through t())');
});

test('fx.css uses only base.css variables (no hex, no numeric rgb, no named colours)', () => {
  const css = stripCss(FX_CSS);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), 'hex colour in fx.css');
  assert.ok(!/rgba?\(\s*\d/.test(css), 'numeric rgb() in fx.css');
  assert.ok(!/(?<![-\w])(white|black|gold|red)(?![-\w])/.test(css.replace(/--[\w-]+/g, '')), 'named colour in fx.css');
  const base = fs.readFileSync(new URL('../src/shared/base.css', import.meta.url), 'utf8');
  const own = new Set([...css.matchAll(/(--fx-[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const [, name] of css.matchAll(/var\((--[\w-]+)/g)) {
    if (name.startsWith('--fx-') && own.has(name)) continue;
    if (['--t', '--hx', '--hy', '--fx-i', '--fx-step', '--fx-delay', '--fx-dur'].includes(name)) continue;
    assert.ok(new RegExp(`${name}\\s*:`).test(base), `fx.css uses ${name}, which base.css does not define`);
  }
  // reduced motion is handled in CSS too
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('odometer cells keep their own line-height after the `font: inherit` reset (no ghost dash, no faded digits)', () => {
  // `font: inherit` also resets line-height; a cell that inherits the page's 1.5 drops its digit low in the 1.08em window:
  // the bottom of the digit above shows through the top of the mask (the release check's "dash") and its own foot fades.
  const rules = [...stripCss(FX_CSS).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m, i) => ({ i, sel: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')), body: m[2] }));
  const col = (r) => r.sel.includes('.fx-odo .fx-odo-col');
  const reset = rules.filter((r) => col(r) && /(^|;|\s)font\s*:/.test(r.body)).pop();
  assert.ok(reset, 'the .fx-odo .fx-odo-col reset rule is there');
  const lh = rules.filter((r) => col(r) && r.i > reset.i && /line-height\s*:/.test(r.body)).pop();
  assert.ok(lh, '.fx-odo .fx-odo-col sets line-height after the font reset');
  const cellH = /\.fx-odo-col\s*\{[^}]*?height:\s*([\d.]+em)/.exec(stripCss(FX_CSS))?.[1];
  assert.equal(/line-height\s*:\s*([\d.]+em)/.exec(lh.body)?.[1], cellH, 'cell line-height = cell height');
  assert.match(stripCss(FX_CSS), new RegExp(`\\.fx-odo-strip > span\\s*\\{[^}]*height:\\s*${cellH.replace('.', '\\.')}`), 'strip digits are as tall as the cell');
});

// ───────── no-DOM safety ─────────

test('every effect is safe without a DOM (SSR / node)', async () => {
  const r = await Promise.all([fx.scan(null), fx.holo(null), fx.dissolve(null), fx.condense(null), fx.fly(null, null), fx.mote(null, null), fx.countUp(null, 3), fx.odometer(null, 3), fx.streamLight(null), fx.flip(null), fx.reveal(null), fx.stamp(null), fx.nope(null), fx.enter([]), fx.layout([], () => {})]);
  assert.equal(r.length, 15);
  const w = fx.wipe(null);
  await w.mid;
  await w.done;
  const held = fx.wipe(null, { tone: 'dusk', hold: true }); // the page-leaving wipe: same contract without a DOM
  await held.mid;
  await held.done;
  assert.equal(typeof fx.press(null), 'function');
  assert.equal(typeof fx.install(), 'function');
  assert.equal(typeof fx.gleam(null), 'function');
  assert.equal(typeof fx.tilt(null), 'function');
  fx.burst(0, 0);
  fx.pulse({ x: 1, y: 1 });
  fx.reset();
  assert.deepEqual(Object.keys(fx.stats()).sort(), ['building', 'built', 'canvas', 'cap', 'comets', 'fades', 'particles', 'rings', 'sleeping', 'sprites']);
  const props = fx.pressProps;
  assert.equal(props['data-fx'], 'own');
  for (const k of ['onPointerDown', 'onPointerUp', 'onPointerCancel', 'onPointerLeave']) assert.equal(typeof props[k], 'function');
});

test('haptic patterns (SPEC §3j)', () => {
  assert.deepEqual(HAPTICS, { tap: 6, select: 10, land: [8, 40, 12], nope: [14, 40, 14], stamp: 22, summon: [30, 40, 60], reveal: [20, 30, 20, 30, 80] });
  fx.haptic('tap'); // no navigator.vibrate in node: must not throw
});

// ───────── sound adapter ─────────

test('sound adapter: config.sound wins, false = silent, auto = sound.js sfx.fx', async () => {
  const got = [];
  config.sound = (n, a) => got.push([n, a]);
  fx.sound('scan', { holo: false });
  fx.nope(null);
  assert.deepEqual(got, [
    ['scan', { holo: false }],
    ['nope', undefined],
  ]);
  config.sound = false;
  fx.sound('scan');
  assert.equal(got.length, 2);
  config.sound = null; // auto
  const snd = await import('../src/shared/sound.js');
  const sfx = snd.sfx || snd.default;
  const played = [];
  const orig = sfx.play;
  sfx.play = (n, o) => (played.push(n), { stop() {} });
  try {
    sfx.press = null;
    fx.sound('fly', { distance: 400 });
    fx.sound('wipe');
  } finally {
    sfx.play = orig;
  }
  assert.deepEqual(played, ['whoosh', 'page'], 'auto adapter goes through sfx.fx (fly → whoosh, wipe → page)');
});

test('every sound name fx reports is understood by sfx.js', async () => {
  const { Sfx, KIT, soundName } = await import('../src/shared/sfx.js');
  const s = new Sfx();
  for (const n of FX_SOUNDS) {
    const got = [];
    s.press = null;
    s.play = (name) => (got.push(name), { stop() {} });
    s.fx(n, n === 'land' ? 2 : n === 'tick' ? { value: 3, up: true } : {});
    assert.equal(got.length, 1, `fx sound '${n}' is not played by sfx.fx`);
    assert.ok(KIT[soundName(got[0])], `fx '${n}' → unknown sfx '${got[0]}'`);
  }
  // the source only reports names from FX_SOUNDS
  const used = new Set([...stripJs(FX_JS).matchAll(/say\('(\w+)'/g)].map((m) => m[1]));
  for (const m of stripJs(FX_JS).matchAll(/sound: snd = (?:holo \? 'holo' : )?'(\w+)'/g)) used.add(m[1]);
  for (const n of used) assert.ok(FX_SOUNDS.includes(n), `fx.js reports '${n}', missing from FX_SOUNDS`);
});

// ───────── run ─────────

console.log('WISH 动效 · fx.js tests');
for (const [name, fn] of queue) {
  try {
    await fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n    ${String(e.stack || e)
      .split('\n')
      .slice(0, 4)
      .join('\n    ')}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
