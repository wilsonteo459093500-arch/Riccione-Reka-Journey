// ============================================================
// 户型图图片（第三版）：报价记录里只存路径 plan.image.path，图片本身放这里。
//   · 云端（已登录 + 设了 Supabase）：私有 bucket「kira-plans」，路径 `${userId}/${uid}.jpg`；读用 signed URL
//   · 本机模式 / 预览版 / 离线：存 IndexedDB，路径 `local:${uid}`；登录有网后自动补传（QuoteApp flush 调 promoteLocalPlans）
//   · 不管哪一种，看过的图都在 IndexedDB 留一份（离线也看得到；印报价单时也从这里拿 data URL）
//   · 上传前压缩：长边 ≤ 3000 px、JPEG 0.85（白底，透明 PNG 不会变黑）
//   · PDF：pdfjs-dist 只在打开 PDF 时动态载入，把选的那一页渲成图片
//   · 删除：云端删失败 → 记在 localStorage 排队，有网再删（同报价的 tombstone 写法）
// ============================================================
import { supabase, cloudConfigured } from './supabase.js';

export const BUCKET = 'kira-plans';
export const MAX_SIDE = 3000;
export const JPEG_Q = 0.85;
const DB_NAME = 'kira-plans';
const STORE = 'images';
const DEL_KEY = 'kira.planImageDeletes.v1';

export const isLocalPath = (p) => typeof p === 'string' && p.startsWith('local:');
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ---------------- IndexedDB（极简 promise 包装）----------------
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}
async function idb(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
const idbGet = (key) => idb('readonly', (s) => s.get(key)).catch(() => undefined);
const idbPut = (key, blob) => idb('readwrite', (s) => s.put(blob, key)).catch(() => undefined);
const idbDel = (key) => idb('readwrite', (s) => s.delete(key)).catch(() => undefined);

// ---------------- 压缩 ----------------
function canvasToBlob(canvas, type = 'image/jpeg', q = JPEG_Q) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, q));
}
// 任何可以画的来源（Image / ImageBitmap / canvas）→ 压缩后的 JPEG { blob, w, h }
async function drawCompressed(src, sw, sh) {
  const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, w, h);
  return { blob: await canvasToBlob(c), w, h };
}
function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 0); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read the image 读不到这张图片')); };
    img.src = url;
  });
}
export const isPdf = (file) => file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');

// 照片 / 截图 → 压缩
export async function prepareImage(file) {
  const img = await loadImage(file);
  return drawCompressed(img, img.naturalWidth, img.naturalHeight);
}

// ---------------- PDF ----------------
let pdfjsP = null;
async function pdfjs() {
  if (!pdfjsP) {
    pdfjsP = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
    pdfjsP.catch(() => { pdfjsP = null; });
  }
  return pdfjsP;
}
export async function openPdf(file) {
  const lib = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  return lib.getDocument({ data }).promise;
}
// 渲某一页：长边约 MAX_SIDE（户型线条看得清）
export async function renderPdfPage(doc, page = 1) {
  const p = await doc.getPage(page);
  const v1 = p.getViewport({ scale: 1 });
  const scale = Math.min(6, MAX_SIDE / Math.max(v1.width, v1.height));
  const vp = p.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  await p.render({ canvasContext: g, viewport: vp }).promise;
  return drawCompressed(c, c.width, c.height);
}
// 小缩图（选页用）
export async function pdfThumb(doc, page, side = 220) {
  const p = await doc.getPage(page);
  const v1 = p.getViewport({ scale: 1 });
  const vp = p.getViewport({ scale: side / Math.max(v1.width, v1.height) });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await p.render({ canvasContext: g, viewport: vp }).promise;
  return c.toDataURL('image/jpeg', 0.7);
}

// ---------------- 云端 ----------------
async function cloudUser() {
  if (!cloudConfigured || !supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  } catch { return null; }
}
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

async function uploadCloud(blob, user) {
  const path = `${user}/${uid()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

// 存一张（已压缩的）图 → 路径。能上云就上云；不行就本机（以后补传）。两种都在本机留一份。
export async function savePlanImage(blob) {
  const user = online() ? await cloudUser() : null;
  if (user) {
    try {
      const path = await uploadCloud(blob, user);
      await idbPut(path, blob);
      return path;
    } catch { /* 云端失败 → 先存本机，有网再补传 */ }
  }
  const path = `local:${uid()}`;
  await idbPut(path, blob);
  return path;
}

// 读图：本机有就用本机；没有就从云端拿（signed URL）再存一份 → Blob（拿不到 = null）
export async function getPlanBlob(path) {
  if (!path) return null;
  const hit = await idbGet(path);
  if (hit) return hit;
  if (isLocalPath(path) || !supabase || !online()) return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return null;
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    await idbPut(path, blob);
    return blob;
  } catch { return null; }
}
// 给 <image href> 用：object URL（同一路径重复用，不重复解码）
const urlCache = new Map();
export async function planImageUrl(path) {
  if (urlCache.has(path)) return urlCache.get(path);
  const b = await getPlanBlob(path);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urlCache.set(path, u);
  return u;
}
// 印报价单 / 长图：data URL（截图时不用再下载）
export async function planImageDataUrl(path) {
  const b = await getPlanBlob(path);
  if (!b) return null;
  return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(null); r.readAsDataURL(b); });
}

// 本机模式存的图（local:…）→ 登录有网后补传。返回 Map(旧路径 → 新路径)；没东西要传 = 空 Map
export async function promoteLocalPlans(plans = []) {
  const out = new Map();
  const locals = [...new Set((plans || []).map((p) => p?.image?.path).filter(isLocalPath))];
  if (!locals.length || !online()) return out;
  const user = await cloudUser();
  if (!user) return out;
  for (const path of locals) {
    const blob = await idbGet(path);
    if (!blob) continue;
    try {
      const np = await uploadCloud(blob, user);
      await idbPut(np, blob);
      out.set(path, np);
    } catch { /* 下次再试 */ }
  }
  return out;
}
// 换掉记录里的路径
export const replacePlanPaths = (plans = [], map) => (map?.size
  ? plans.map((p) => (map.has(p?.image?.path) ? { ...p, image: { ...p.image, path: map.get(p.image.path) } } : p))
  : plans);

// ---------------- 删除（先删报价里的引用，再删图片）----------------
const readDel = () => { try { const v = JSON.parse(localStorage.getItem(DEL_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeDel = (v) => { try { localStorage.setItem(DEL_KEY, JSON.stringify([...new Set(v)])); } catch { /* ignore */ } };
export async function deletePlanImage(path) {
  if (!path) return;
  const u = urlCache.get(path);
  if (u) { URL.revokeObjectURL(u); urlCache.delete(path); }
  await idbDel(path);
  if (isLocalPath(path)) return;
  try {
    if (!online() || !(await cloudUser())) throw new Error('offline');
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  } catch { writeDel([...readDel(), path]); }
}
// 有网时重试排队的删除
export async function retryPlanDeletes() {
  const q = readDel();
  if (!q.length || !online() || !(await cloudUser())) return;
  const { error } = await supabase.storage.from(BUCKET).remove(q);
  if (!error) writeDel([]);
}
