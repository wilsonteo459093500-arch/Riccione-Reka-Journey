// 案例整理的缓存（IndexedDB 'genie-sorter'，只在这台电脑上）：
//   analysis  key（路径 + 大小 + 修改时间的指纹）→ 分析结果（几百字节）
//   thumbs    key → 长边 240 的小图（WebP / JPEG，几 KB）
//   sessions  文件夹的指纹 → 员工做到哪儿了（每个项目的决定）
//   notes     案例 id → 整理时记下的、只给员工看的笔记（城市、提到的材料 / 系列、认不出来的风格词）
// 存的 key 都是指纹，不存文件路径（路径里有人名）。同一个文件夹再打开一次 → 直接用缓存，几秒就回到上次的进度。

const DB = 'genie-sorter';
const STORES = ['analysis', 'thumbs', 'sessions', 'notes'];
let dbp = null;

function open() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    let req;
    try {
      req = indexedDB.open(DB, 1);
    } catch {
      res(null);
      return;
    }
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => res(null);
    req.onblocked = () => res(null);
  });
  return dbp;
}

/** 一次读很多个（一个事务）→ Map<key, value> */
export async function getMany(store, keys) {
  const out = new Map();
  const db = await open();
  if (!db || !keys.length) return out;
  return new Promise((res) => {
    const tx = db.transaction(store, 'readonly');
    const os = tx.objectStore(store);
    for (const k of keys) {
      const r = os.get(k);
      r.onsuccess = () => {
        if (r.result !== undefined) out.set(k, r.result);
      };
    }
    tx.oncomplete = () => res(out);
    tx.onerror = () => res(out);
    tx.onabort = () => res(out);
  });
}

/** 整个仓库一次读出来（键很多的时候比一个一个 get 快很多）→ Map */
export async function getAllMap(store) {
  const out = new Map();
  const db = await open();
  if (!db) return out;
  return new Promise((res) => {
    const tx = db.transaction(store, 'readonly');
    const os = tx.objectStore(store);
    const rk = os.getAllKeys();
    const rv = os.getAll();
    tx.oncomplete = () => {
      const ks = rk.result || [];
      const vs = rv.result || [];
      for (let i = 0; i < ks.length; i++) out.set(ks[i], vs[i]);
      res(out);
    };
    tx.onerror = () => res(out);
    tx.onabort = () => res(out);
  });
}

export async function get(store, key) {
  return (await getMany(store, [key])).get(key);
}

/** 一次写很多个：[[key, value]…] */
export async function putMany(store, entries) {
  const db = await open();
  if (!db || !entries.length) return;
  await new Promise((res) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const [k, v] of entries) os.put(v, k);
    tx.oncomplete = res;
    tx.onerror = res;
    tx.onabort = res;
  });
}

export const put = (store, key, value) => putMany(store, [[key, value]]);

/** 攒一下再写（分析结果一秒几十个，不要一个一个开事务） */
export function batcher(store, ms = 400) {
  let buf = [];
  let timer = null;
  const flush = async () => {
    clearTimeout(timer);
    timer = null;
    const b = buf;
    buf = [];
    await putMany(store, b);
  };
  return {
    add(k, v) {
      buf.push([k, v]);
      if (!timer) timer = setTimeout(flush, ms);
      if (buf.length >= 200) flush();
    },
    flush,
  };
}

/** 清掉缓存（员工「重新分析」时） */
export async function clearStore(store) {
  const db = await open();
  if (!db) return;
  await new Promise((res) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = res;
    tx.onerror = res;
  });
}
