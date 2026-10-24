// 案例整理的资料表（data.json）放在这里统一取用。
//
// 为什么不直接 import JSON：Node 的 ESM 读 JSON 要写 import 属性，Vite 开发服务器又不认那个写法。
// 所以：浏览器那边（Sorter.jsx、worker）import data.json 再 setData()；Node 测试用 fs 读出来再 setData()。
// 纯逻辑的文件（parse / group / build …）都从 getData() 拿，不自己 import。

let DATA = null;
let IDX = null;

export function setData(d) {
  DATA = d;
  IDX = null;
  return d;
}

export function getData() {
  if (!DATA) throw new Error('sorter data not loaded — call setData(json) first');
  return DATA;
}

const lower = (s) => String(s || '').toLowerCase();

/** 一次算好的查找表（长词优先，免得「极简」抢走「极简原木」） */
export function index() {
  if (IDX) return IDX;
  const d = getData();
  const styleWords = [];
  for (const s of d.styles) for (const w of [s.id, s.zh, ...(s.words || [])]) styleWords.push({ w: lower(w), id: s.id });
  styleWords.sort((a, b) => b.w.length - a.w.length);
  const seriesWords = [];
  for (const s of d.series) for (const w of s.words || []) seriesWords.push({ w: lower(w), id: s.id });
  seriesWords.sort((a, b) => b.w.length - a.w.length);
  const boards = [...d.boards].sort((a, b) => b.name.length - a.name.length);
  const roomWords = [];
  for (const r of d.rooms) for (const w of r.words) roomWords.push({ w: lower(w), room: r.room });
  roomWords.sort((a, b) => b.w.length - a.w.length);
  const viewWords = [];
  for (const v of d.views) for (const w of v.words) viewWords.push({ w: lower(w), view: v.view });
  viewWords.sort((a, b) => b.w.length - a.w.length);
  const specials = [];
  for (const s of d.special) for (const w of s.words) specials.push({ w: lower(w), id: s.id });
  specials.sort((a, b) => b.w.length - a.w.length);
  IDX = {
    styleWords,
    seriesWords,
    boards,
    roomWords,
    viewWords,
    specials,
    cities: new Set(d.cities.map(lower)),
    styleById: Object.fromEntries(d.styles.map((s) => [s.id, s])),
    seriesById: Object.fromEntries(d.series.map((s) => [s.id, s])),
    familyById: Object.fromEntries(d.families.map((f) => [f.id, f])),
    specialById: Object.fromEntries(d.special.map((s) => [s.id, s])),
  };
  return IDX;
}
