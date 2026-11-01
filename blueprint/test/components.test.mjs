// 编辑器组件（JSX）的结构测试：用 vite 自带的 esbuild 把组件连同 React 打包成一个 ESM 文件再导入 —— Node 里跑，不需要浏览器
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { test } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadComponent(rel) {
  const out = await build({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    jsx: 'automatic',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const file = path.join(os.tmpdir(), `bp-test-${path.basename(rel, path.extname(rel))}-${process.pid}.mjs`);
  writeFileSync(file, out.outputFiles[0].text);
  return import(pathToFileURL(file).href);
}

test('EnAlias：on 变来变去，外面那层 div 一直在 —— React 不会拆掉重建里面的输入框（打「20 隐框」「刘府」时不丢焦点）', async () => {
  const { EnAlias } = await loadComponent('src/components/editor/EnInput.jsx');
  const input = { $$typeof: Symbol.for('react.element'), type: 'input', key: null, ref: null, props: { 'data-field': 'notes.0.text' } };
  const off = EnAlias({ field: 'notes.0.textEn', on: false, children: input });
  const on = EnAlias({ field: 'notes.0.textEn', on: true, children: input });
  // 同一种外层元素、输入框在同一个位置：字从英文变中文（on 跟着变）时只改属性
  assert.equal(off.type, 'div');
  assert.equal(on.type, off.type);
  assert.equal(off.props.children, input);
  assert.equal(on.props.children, input);
  // on = 画布上点英文时落到这里：带英文字段名、能拿焦点；off = 只是一层普通的 div
  assert.equal(on.props['data-field'], 'notes.0.textEn');
  assert.equal(on.props.tabIndex, -1);
  assert.equal(typeof on.props.onFocus, 'function');
  assert.equal(off.props['data-field'], undefined);
  assert.equal(off.props.tabIndex, undefined);
  assert.equal(off.props.onFocus, undefined);
});

test('SlideCanvas（编辑器）：托字渐变、logo 这些不能编辑的元素不接点击 —— 点照片上有托字的地方，落到下面的照片栏位', async () => {
  const mod = await loadComponent('src/components/SlideCanvas.jsx');
  const Canvas = mod.default.type || mod.default; // memo 包着的原函数（没有 hook，直接调用拿元素树）
  const slide = {
    bg: 'F3EEE7',
    els: [
      { t: 'img', x: 0, y: 0, w: 1022, h: 1080, src: '/a.jpg', crop: { l: 0, r: 0, t: 0, b: 0 }, edit: { field: 'image.photo' } },
      { t: 'rect', x: 0, y: 0, w: 1022, h: 340, name: 'shade', grad: { angle: 90, stops: [{ color: '1C1915', alpha: 0.32, pos: 0 }, { color: '1C1915', alpha: 0, pos: 100 }] } },
      { t: 'text', x: 112, y: 92, w: 600, h: 60, edit: { field: 'overrides.title' }, paras: [{ runs: [{ text: 'BRAND', font: 'ogg', size: 30, color: 'FFFFFF' }] }] },
    ],
  };
  const kids = (n) => [].concat(n?.props?.children ?? []).flat().filter(Boolean);
  const nodesOf = (tree) => kids(kids(tree)[0]);
  const style = (n) => n?.props?.style || {};
  // 编辑器里
  const [photo, shade, title] = nodesOf(Canvas({ slide, width: 960, interactive: true, resolveUrl: (s) => s, onPick: () => {} }));
  assert.equal(photo.props.className, 'bp-pick');
  assert.equal(title.props.className, 'bp-pick');
  assert.equal(kids(photo).find((c) => c.props?.className === 'bp-pick-hit')?.props.style.pointerEvents, 'auto', '照片的点击区接点击');
  assert.equal(style(shade).pointerEvents, 'none', '托字渐变（不能编辑）不接点击，点下去落到照片上');
  assert.equal(style(shade).position, 'absolute');
  assert.equal(style(shade).inset, 0, '外面这层和画布一样大，里面的坐标不变');
  // 缩略图 / 导出预览（不可交互）：照旧直接画，不多包一层
  const plain = nodesOf(Canvas({ slide, width: 320, resolveUrl: (s) => s }));
  assert.equal(plain.length, 3);
  assert.ok(plain.every((n) => n.props?.className !== 'bp-pick' && style(n).pointerEvents === undefined));
});

test('SlideCanvas（编辑器）：edit.zones —— 同一段里另一栏的字（订单周期「60–75 天 days」的单位）点下去落到它自己的栏位', async () => {
  const mod = await loadComponent('src/components/SlideCanvas.jsx');
  const Canvas = mod.default.type || mod.default;
  const zones = [{ field: 'overrides.s1Unit', x: 600, y: 600, w: 40, h: 130 }, { field: 'overridesEn.s1Unit', x: 640, y: 600, w: 60, h: 130 }];
  const slide = {
    bg: 'F3EEE7',
    els: [{ t: 'text', x: 112, y: 600, w: 788, h: 130, edit: { field: 'overrides.s1N', zones }, paras: [{ runs: [{ text: '60–75', font: 'ogg', size: 116, color: '7B593D' }, { text: '天', font: 'hosM', size: 22, color: '7B593D' }] }] }],
  };
  const kids = (n) => [].concat(n?.props?.children ?? []).flat().filter(Boolean);
  const picked = [];
  const [fig] = kids(kids(Canvas({ slide, width: 960, interactive: true, resolveUrl: (s) => s, onPick: (f) => picked.push(f) }))[0]);
  const hits = kids(fig).filter((c) => c.props?.className === 'bp-pick-hit');
  assert.equal(hits.length, 3, '整段一个点击区 + 每个单位一个');
  const stop = { stopPropagation() {} };
  hits[1].props.onClick(stop);
  hits[2].props.onClick(stop);
  fig.props.onClick(stop);
  assert.deepEqual(picked, ['overrides.s1Unit', 'overridesEn.s1Unit', 'overrides.s1N']);
  assert.deepEqual([hits[1].props.style.left, hits[1].props.style.width], [600, 40]);
  // 正在编辑单位栏：这一段也高亮
  const [active] = kids(kids(Canvas({ slide, width: 960, interactive: true, activeField: 'overridesEn.s1Unit', resolveUrl: (s) => s }))[0]);
  assert.equal(active.props['data-active'], '1');
});
