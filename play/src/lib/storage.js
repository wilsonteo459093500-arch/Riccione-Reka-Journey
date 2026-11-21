// localStorage 包一层：读不到 / 写不进（无痕模式）也不会坏。
// 开发测试时网址加 ?as=名字，同一个浏览器可以模拟好几个人（各用各的储存）。

function readAs() {
  try {
    const q = new URLSearchParams(globalThis.location?.search || '');
    const as = q.get('as');
    if (as) sessionStorage.setItem('play.as', as);
    return sessionStorage.getItem('play.as') || '';
  } catch {
    return '';
  }
}

const NS = typeof window === 'undefined' ? '' : readAs();
const key = (k) => (NS ? `play.${NS}.${k}` : `play.${k}`);

export function load(k, fallback = null) {
  try {
    const raw = localStorage.getItem(key(k));
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(k, value) {
  try {
    if (value === undefined || value === null) localStorage.removeItem(key(k));
    else localStorage.setItem(key(k), JSON.stringify(value));
  } catch {
    /* 存不进就算了 */
  }
}
