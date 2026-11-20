// 在 Node 里载入 VISI 的纯逻辑脚本（不开浏览器）：给一个假的 window / document / location，
// 照 visi.html 的顺序跑 IIFE，回传 window.MB。只测规则（需求卡解析、称呼、文案、体检），不测画面。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../invite');
const FILES = [
  'assets/js/config.js', 'assets/js/link-sign.js', 'assets/js/cases.js', 'assets/js/visi/data.js', 'assets/js/visi/case-vocab.js',
  'assets/js/visi/photos.js', 'assets/js/visi/photos-sail.js', 'assets/js/visi/store.js', 'assets/js/visi/model.js', 'assets/js/brief-card.js',
  'assets/js/visi/brief-parse.js', 'assets/js/visi/brand.js', 'assets/js/visi/deck.js',
  'assets/js/visi/copy.js', 'assets/js/visi/check.js'
];

function stubEl() {
  const el = { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, appendChild() {}, addEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, textContent: '', innerHTML: '' };
  return el;
}

/** @param {{ now?: Date, sail?: object[] }} [opt] now = 假的「今天」，测日期规则用；
 *  sail = 假的溪岸真实案例清单（换掉 photos-sail.js 里 BEGIN / END 中间那段） */
export function loadVisi(opt = {}) {
  const RealDate = Date;
  const fixed = opt.now ? opt.now.getTime() : null;
  class FakeDate extends RealDate {
    constructor(...a) { if (!a.length && fixed != null) super(fixed); else super(...a); }
    static now() { return fixed != null ? fixed : RealDate.now(); }
  }
  const document = { documentElement: stubEl(), createElement: stubEl, getElementById() { return null; }, querySelector() { return null; },
    querySelectorAll() { return []; }, addEventListener() {}, head: stubEl(), body: stubEl() };
  const window = { document, location: { hostname: 'visi-riccione-reka.vercel.app', protocol: 'https:',
    origin: 'https://visi-riccione-reka.vercel.app', pathname: '/visi', search: '' },
    navigator: { userAgent: 'node' }, addEventListener() {}, matchMedia() { return { matches: false, addListener() {} }; },
    localStorage: { getItem() { return null; }, setItem() {} } };
  window.window = window;
  const ctx = vm.createContext(Object.assign(window, { console, Date: FakeDate, setTimeout, clearTimeout,
    URLSearchParams, URL, Intl, Math, JSON, RegExp, String, Number, Array, Object, encodeURIComponent, decodeURIComponent }));
  for (const f of FILES) {
    let code = readFileSync(path.join(ROOT, f), 'utf8');
    if (opt.sail && f.endsWith('photos-sail.js')) {
      const a = code.indexOf('/* SAIL-PHOTOS-BEGIN */') + '/* SAIL-PHOTOS-BEGIN */'.length, b = code.indexOf('/* SAIL-PHOTOS-END */');
      code = code.slice(0, a) + JSON.stringify(opt.sail) + code.slice(b);
    }
    vm.runInContext(code, ctx, { filename: f });
  }
  return ctx.MB;
}
