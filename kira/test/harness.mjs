// 极简测试框架：test(name, fn) 收集，run.mjs 统一执行。
export const tests = [];
export function test(name, fn) {
  tests.push({ name, fn, file: currentFile });
}
let currentFile = '';
export function setFile(f) {
  currentFile = f;
}
