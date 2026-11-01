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
