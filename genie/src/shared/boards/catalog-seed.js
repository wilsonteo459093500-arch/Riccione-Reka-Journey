// 溪岸板材 · 目录种子（R10：v1 不读 PDF；名字 / 系列 / 表面从品牌手册的整理稿来 —— catalog-seed.json，147 条：
//   颗粒板 76（AG / AK 物料编码）· 烤漆 25（GKL 色卡 + 哑光 / 肤感色号 P1、6991…）· 木皮 XA-TP-01…14 · 原木 XA-SM-01…25 · 织系列 SG-BZ01…04 · 藤编 GZY012）。
// 名字、编号、表面都照手册印的写，不编；员工在导入器里一行一行「采用」，不会自动改。
//
// 为什么是 JSON：资料里是产品名字（晓山白、归雁胡桃……），不是界面文字，不进中英词典（和 cases/manifest.json、sorter/data.json 一样）。
// Node 的 ESM 读 JSON 要写 import 属性、Vite 开发服务器又不认，所以：浏览器动态 import（只有导入器要用，不进客人的页面），Node 用 fs 读。

let SEED = null;
let LOADING = null;

const IN_NODE = typeof window === 'undefined' && typeof process !== 'undefined' && !!process.versions?.node;

/** Node（测试 / 合并脚本）：直接读文件。模块名、路径故意拼出来，Vite 不会把它当成要打包的东西（同 cases.js） */
async function readInNode() {
  const fsName = ['node', 'fs'].join(':');
  const fs = await import(/* @vite-ignore */ fsName);
  const url = new URL(['.', 'catalog-seed.json'].join('/'), import.meta.url);
  return JSON.parse(fs.readFileSync(url, 'utf8'));
}

/** 读目录种子 → entries[]（读一次，之后直接给） */
export function loadSeed() {
  if (SEED) return Promise.resolve(SEED);
  if (!LOADING) {
    const p = IN_NODE ? readInNode() : import('./catalog-seed.json').then((m) => m.default || m);
    LOADING = p.then((j) => (SEED = Array.isArray(j?.entries) ? j.entries : [])).catch(() => (SEED = []));
  }
  return LOADING;
}

/** 已经读好的（没读过 = []） */
export const seedNow = () => SEED || [];

/** 测试 / 合并脚本直接给一份 */
export function setSeed(entries) {
  SEED = Array.isArray(entries) ? entries : [];
  return SEED;
}
