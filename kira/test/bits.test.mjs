// bits.jsx 的纯逻辑：米 / 毫米输入换算 + 手机返回键护栏（用 esbuild 把 .jsx 打包成 Node 可读的模块）
import assert from 'node:assert/strict';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { build } from 'esbuild';
import { test } from './harness.mjs';
import { parseMetersToMm } from '../src/planner/model.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out', 'bits.bundle.mjs');
mkdirSync(path.dirname(out), { recursive: true });
await build({
  entryPoints: [path.join(here, '..', 'src', 'components', 'planner', 'bits.jsx')],
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: out, logLevel: 'silent',
  external: ['react', 'react/*', 'react-dom', 'lucide-react'],
});
const { parseMeters, createBackGuard } = await import(`${pathToFileURL(out).href}?t=${Date.now()}`);

test('metre input: plain metres are unchanged (same as parseMetersToMm)', () => {
  for (const s of ['2.7', '2.86+2.6', '0.6', '1.2', '2.4+1.2', ' 3 ', '0.35', '', '99.9']) {
    const r = parseMeters(s);
    assert.equal(r.mm, parseMetersToMm(s), s);
    assert.equal(r.note, '', s);
  }
});

test('metre input: a value >= 100 is millimetres, per term, with a visible note', () => {
  assert.deepEqual(parseMeters('2700'), { mm: 2700, note: '2700 mm → 2.70 m' });
  assert.equal(parseMeters('2400+1200').mm, 3600);
  assert.equal(parseMeters('2.4+600').mm, 3000);
  assert.equal(parseMeters('2.4+600').note, '2.4 m + 600 mm → 3.00 m');
  assert.equal(parseMeters('100').mm, 100);   // 100 → 100 mm（踢脚 / 架空高）
  assert.equal(parseMeters('2862.5').mm, 2863); // 整数 mm
  assert.equal(parseMeters('27').mm, 27000);  // 10–99 不猜（只有 ≥ 100 这一条规则）
});

// ---- 返回键护栏：假的 window.history（popstate 异步，像浏览器一样）----
function fakeWin() {
  const entries = [{ state: null }];
  let idx = 0;
  const listeners = [];
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const win = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    addEventListener: (ev, fn) => { if (ev === 'popstate') listeners.push(fn); },
    history: {
      get state() { return entries[idx].state; },
      get length() { return entries.length; },
      pushState(state) { entries.splice(idx + 1); entries.push({ state: structuredClone(state) }); idx += 1; },
      back() { setTimeout(() => { if (idx > 0) { idx -= 1; listeners.forEach((f) => f({ state: entries[idx].state })); } }, 1); },
    },
    get idx() { return idx; },
    tick,
    // 用户按返回键
    userBack: async () => { win.history.back(); await tick(); await tick(); },
  };
  return win;
}

test('back guard: Back closes the open modal and stays in the app', async () => {
  const w = fakeWin();
  const g = createBackGuard(w);
  let closed = 0;
  const ref = { current: () => { closed += 1; off(); } };
  const off = g.open(ref);
  await w.tick();
  assert.equal(w.idx, 1, 'one guard entry pushed');
  await w.userBack();
  assert.equal(closed, 1, 'modal closed by Back');
  assert.equal(w.idx, 0, 'still on the app entry (did not leave)');
  await w.tick();
  assert.equal(w.idx, 0, 'no guard re-pushed after the modal closed');
});

test('back guard: normal close removes the guard (no stray history entry)', async () => {
  const w = fakeWin();
  const g = createBackGuard(w);
  const off = g.open({ current: () => assert.fail('not called') });
  await w.tick();
  assert.equal(w.idx, 1);
  off();
  await w.tick(); await w.tick();
  assert.equal(w.idx, 0, 'guard popped by our own history.back()');
  assert.equal(w.history.state, null);
});

test('back guard: picker → editor in one render keeps exactly one guard', async () => {
  const w = fakeWin();
  const g = createBackGuard(w);
  const offPicker = g.open({ current: () => {} });
  await w.tick();
  let editorClosed = 0;
  offPicker(); // 同一轮：选模板关掉、编辑器打开
  const offEditor = g.open({ current: () => { editorClosed += 1; offEditor(); } });
  await w.tick(); await w.tick();
  assert.equal(w.idx, 1, 'still exactly one guard');
  assert.equal(editorClosed, 0, 'editor not closed by the picker closing');
  await w.userBack();
  assert.equal(editorClosed, 1, 'Back closes the editor');
  assert.equal(w.idx, 0);
});

test('back guard: Back with unsaved draft asks first; "keep editing" re-arms the guard', async () => {
  const w = fakeWin();
  const g = createBackGuard(w);
  let asked = 0;
  const off = g.open({ current: () => { asked += 1; /* 弹确认框，没关 */ } });
  await w.tick();
  await w.userBack();
  assert.equal(asked, 1);
  await w.tick();
  assert.equal(w.idx, 1, 'guard pushed again while the editor stays open');
  // 之后选「不保存」→ 正常关闭 → 护栏退掉
  off();
  await w.tick(); await w.tick();
  assert.equal(w.idx, 0);
});
