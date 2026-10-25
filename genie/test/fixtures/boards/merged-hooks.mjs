// Node 的模块钩子：把 src/shared/boards/library.js 换成 test/fixtures/boards/merged-library.js（见 merged.mjs）
const FIXTURE = new URL('./merged-library.js', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  const r = await nextResolve(specifier, context);
  if (/\/src\/shared\/boards\/library\.js(\?.*)?$/.test(r.url)) return { ...r, url: FIXTURE, shortCircuit: true };
  return r;
}
