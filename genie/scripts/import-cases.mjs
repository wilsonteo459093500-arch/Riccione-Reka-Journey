#!/usr/bin/env node
// 把公司的案例照片批量放进 WISH 的案例库。
//
//   node scripts/import-cases.mjs <照片文件夹> [--out public/cases] [--manifest src/cases/manifest.json] [--base <网址>] [--engine auto|pillow|chromium] [--dry-run]
//   node scripts/import-cases.mjs --pack WISH-cases-YYYYMMDD.json [--out …] [--manifest …] [--base …]   ← 员工在 iPad 案例库「导出」的案例包合并回来
//
// <照片文件夹> 里一个项目一个子文件夹：
//   photos/
//     setia-alam-condo/          ← 文件夹名 = 案例编号（p-setia-alam-condo）
//       01 客厅.jpg  02-kitchen.jpg  主卧.heic …   ← 文件名里有房间名就自动认（客厅 / living、厨房 / kitchen、主卧 / master …）
//       case.txt                 ← 选填：第 1 行中文标题，第 2 行英文标题（第 3、4 行：中文 / 英文故事）
//       case.json                ← 选填：任何案例字段（property、style、materials、consent …），会盖过 case.txt
//
// 每张照片：转正（EXIF 方向）→ 1600 px 大图 + 480 px 小图，WebP（q ≈ 0.82，太大会自动降一点），
// EXIF / GPS / 相机资料全部去掉（重新编码，不复制任何元数据）。输出 <out>/<编号>/NN-1600.webp、NN-480.webp。
// manifest：新项目 = kind 'project'、status 'draft'（员工在案例库里打好标签、勾「业主同意」才上架）；
// 已有的项目只换照片，员工打过的标签（风格、材质、故事…）都保留。
//
// --base：照片放在别的公开空间（这个仓库是公开的，真实照片可以不进 git）—— manifest 里写完整网址 base + 编号/NN-1600.webp，
//         <out> 里生成的文件再自己上传到那里。也可以不写 --base，改 src/shared/config.js 的 CONFIG.cases.base（全部照片一起换）。
// 引擎：有 Python Pillow 就用 Pillow（快；装了 pillow-heif 还能读 HEIC），没有就用 headless Chromium（/opt/node-tools 的 playwright）。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG_EXT = /\.(jpe?g|png|webp|heic|heif|tiff?|avif)$/i;
const SIZES = [
  { tag: '1600', maxW: 1600, maxH: 1600, budget: 250 * 1024 },
  { tag: '480', maxW: 480, maxH: 640, budget: 60 * 1024 },
];
const QUALITIES = [0.82, 0.76, 0.7, 0.64];

// 文件名 → 房间（中文、英文、马来文都认一点）；顺序 = 先认更具体的
const ROOM_WORDS = [
  ['plan3d', ['3d', 'overview', 'dollhouse', '鸟瞰', '整体']],
  ['master', ['主卧', 'master', 'mbr']],
  ['kids', ['儿童', '小孩', 'kid', 'child', 'children', 'nursery']],
  ['walkin', ['衣帽', 'walk-in', 'walkin', 'wardrobe', 'closet']],
  ['study', ['书房', 'study', 'office', 'library']],
  ['bath', ['浴室', '卫生间', '厕所', '洗手间', 'bath', 'toilet', 'wc', 'powder', 'tandas']],
  ['kitchen', ['厨房', 'kitchen', 'pantry', 'dapur']],
  ['dining', ['餐厅', '饭厅', 'dining']],
  ['foyer', ['玄关', 'foyer', 'entry', 'entrance', 'shoe']],
  ['balcony', ['阳台', 'balcony', 'yard', 'patio']],
  ['family', ['起居', 'family', 'hall']],
  ['bedroom', ['卧室', '睡房', '房间', 'bedroom', 'bed', 'guest', 'bilik']],
  ['living', ['客厅', '大厅', 'living', 'lounge', 'tv', 'ruang tamu']],
];

export function guessRoom(name) {
  const s = String(name).toLowerCase();
  for (const [room, words] of ROOM_WORDS) if (words.some((w) => s.includes(w))) return room;
  return null;
}

export function slugOf(folder) {
  const name = String(folder);
  const ascii = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (ascii.length >= 2 && !/[^\x00-\x7f]/.test(name)) return ascii;
  // 中文文件夹名：留下英文部分 + 一段短 hash（同一个名字永远得到同一个编号）
  const h = crypto.createHash('sha1').update(name).digest('hex').slice(0, 6);
  return ascii ? `${ascii}-${h}` : `case-${h}`;
}

const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function parseArgs(argv) {
  const o = { src: null, out: path.join(ROOT, 'public/cases'), manifest: path.join(ROOT, 'src/cases/manifest.json'), base: '', engine: 'auto', dry: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = path.resolve(argv[++i]);
    else if (a === '--manifest') o.manifest = path.resolve(argv[++i]);
    else if (a === '--base') o.base = argv[++i] || '';
    else if (a === '--engine') o.engine = argv[++i] || 'auto';
    else if (a === '--pack') o.pack = path.resolve(argv[++i]);
    else if (a === '--dry-run') o.dry = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (!o.src) o.src = path.resolve(a);
  }
  if (o.base && !o.base.endsWith('/')) o.base += '/';
  return o;
}

// ───────────────────────── 两个编码引擎 ─────────────────────────

// Pillow：EXIF 方向转正 → 复制像素到一张全新的图（不带任何 info / EXIF / XMP / ICC）→ WebP
const PY = String.raw`
import sys, json, io
from PIL import Image, ImageOps
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:
    pass
jobs = json.load(sys.stdin)
out = []
for j in jobs:
    try:
        im = Image.open(j['src'])
        im = ImageOps.exif_transpose(im)
        if im.mode not in ('RGB',):
            bg = Image.new('RGB', im.size, (255, 255, 255))
            rgba = im.convert('RGBA')
            bg.paste(rgba, mask=rgba.split()[3])
            im = bg
        W, H = im.size
        res = {'src': j['src'], 'w0': W, 'h0': H, 'files': []}
        for s in j['sizes']:
            k = min(1.0, s['maxW'] / W, s['maxH'] / H)
            w, h = max(1, round(W * k)), max(1, round(H * k))
            r = im.resize((w, h), Image.LANCZOS) if k < 1 else im.copy()
            clean = Image.new('RGB', (w, h))
            clean.paste(r)
            data = None
            for q in j['qualities']:
                buf = io.BytesIO()
                clean.save(buf, 'WEBP', quality=int(round(q * 100)), method=6)
                data = buf.getvalue()
                if len(data) <= s['budget']:
                    break
            with open(s['dest'], 'wb') as f:
                f.write(data)
            res['files'].append({'dest': s['dest'], 'w': w, 'h': h, 'bytes': len(data)})
        out.append(res)
    except Exception as e:
        out.append({'src': j['src'], 'error': str(e)})
json.dump(out, sys.stdout)
`;

function havePillow() {
  const r = spawnSync('python3', ['-I', '-c', 'import PIL, PIL.features; assert PIL.features.check("webp")'], { encoding: 'utf8' });
  return r.status === 0;
}

function encodePillow(jobs) {
  const r = spawnSync('python3', ['-I', '-c', PY], { input: JSON.stringify(jobs), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`Pillow failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try {
      return req(p);
    } catch {
      /* next */
    }
  }
  return null;
}

async function encodeChromium(jobs) {
  const pw = loadPlaywright();
  if (!pw) throw new Error('no playwright (npm i -D playwright, or install Python Pillow)');
  const browser = await pw.chromium.launch({ args: ['--disable-gpu'] });
  const out = [];
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>enc</title>');
    for (const j of jobs) {
      try {
        const b64 = fs.readFileSync(j.src).toString('base64');
        const type = /\.png$/i.test(j.src) ? 'image/png' : /\.webp$/i.test(j.src) ? 'image/webp' : /\.avif$/i.test(j.src) ? 'image/avif' : 'image/jpeg';
        const r = await page.evaluate(
          async ({ b64, type, sizes, qualities }) => {
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const bmp = await createImageBitmap(new Blob([bytes], { type }), { imageOrientation: 'from-image' });
            const W = bmp.width;
            const H = bmp.height;
            const files = [];
            for (const s of sizes) {
              const k = Math.min(1, s.maxW / W, s.maxH / H);
              const w = Math.max(1, Math.round(W * k));
              const h = Math.max(1, Math.round(H * k));
              const cv = document.createElement('canvas');
              cv.width = w;
              cv.height = h;
              const g = cv.getContext('2d');
              g.fillStyle = 'white';
              g.fillRect(0, 0, w, h);
              g.imageSmoothingQuality = 'high';
              g.drawImage(bmp, 0, 0, w, h);
              let url = '';
              for (const q of qualities) {
                url = cv.toDataURL('image/webp', q);
                if ((url.length - 23) * 0.75 <= s.budget) break;
              }
              files.push({ w, h, url });
            }
            return { W, H, files };
          },
          { b64, type, sizes: j.sizes, qualities: j.qualities },
        );
        const res = { src: j.src, w0: r.W, h0: r.H, files: [] };
        r.files.forEach((f, i) => {
          const data = Buffer.from(f.url.split(',')[1], 'base64');
          fs.writeFileSync(j.sizes[i].dest, data);
          res.files.push({ dest: j.sizes[i].dest, w: f.w, h: f.h, bytes: data.length });
        });
        out.push(res);
      } catch (e) {
        out.push({ src: j.src, error: String(e?.message || e) });
      }
    }
  } finally {
    await browser.close();
  }
  return out;
}

/** WebP 里有没有 EXIF / XMP 块（测试也用） */
export function webpMeta(buf) {
  const chunks = [];
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return { ok: false, chunks };
  let i = 12;
  while (i + 8 <= buf.length) {
    const id = buf.toString('ascii', i, i + 4);
    const len = buf.readUInt32LE(i + 4);
    chunks.push(id);
    i += 8 + len + (len & 1);
  }
  return { ok: true, chunks, exif: chunks.includes('EXIF'), xmp: chunks.includes('XMP '), icc: chunks.includes('ICCP') };
}

// ───────────────────────── 主流程 ─────────────────────────

function readCaseText(dir) {
  const o = {};
  const txt = path.join(dir, 'case.txt');
  if (fs.existsSync(txt)) {
    const lines = fs.readFileSync(txt, 'utf8').split(/\r?\n/).map((s) => s.trim());
    o.title = { zh: lines[0] || '', en: lines[1] || '' };
    if (lines[2] || lines[3]) o.story = { zh: lines[2] || '', en: lines[3] || '' };
  }
  const js = path.join(dir, 'case.json');
  if (fs.existsSync(js)) Object.assign(o, JSON.parse(fs.readFileSync(js, 'utf8')));
  return o;
}

const sameImages = (a = [], b = []) => a.length === b.length && a.every((x, i) => x.src === b[i].src && x.w === b[i].w && x.h === b[i].h && x.room === b[i].room);

export async function importCases(opts) {
  const o = { ...parseArgs([]), ...opts };
  const log = o.quiet ? () => {} : (...a) => console.log(...a);
  if (!o.src || !fs.existsSync(o.src)) throw new Error(`photo folder not found: ${o.src}`);
  const manifest = fs.existsSync(o.manifest) ? JSON.parse(fs.readFileSync(o.manifest, 'utf8')) : { kind: 'wish-cases', v: 1, updatedAt: '', cases: [] };
  const byId = new Map(manifest.cases.map((c) => [c.id, c]));
  const folders = fs
    .readdirSync(o.src, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort(natural);
  const engine = o.engine === 'auto' ? (havePillow() ? 'pillow' : 'chromium') : o.engine;
  const report = { engine, added: [], updated: [], unchanged: [], errors: [] };
  const now = new Date().toISOString();
  let maxOrder = Math.max(0, ...manifest.cases.map((c) => c.order || 0));

  for (const folder of folders) {
    const dir = path.join(o.src, folder);
    const extra = readCaseText(dir);
    const id = extra.id || `p-${slugOf(folder)}`;
    const files = fs.readdirSync(dir).filter((f) => IMG_EXT.test(f) && !f.startsWith('.')).sort(natural);
    if (!files.length) {
      report.errors.push({ id, error: 'no photos' });
      continue;
    }
    const coverIdx = Math.max(0, files.findIndex((f) => /cover|封面/i.test(f)));
    const outDir = path.join(o.out, id);
    if (!o.dry) fs.mkdirSync(outDir, { recursive: true });
    const jobs = files.map((f, i) => {
      const nn = String(i + 1).padStart(2, '0');
      return { src: path.join(dir, f), nn, file: f, sizes: SIZES.map((s) => ({ ...s, dest: path.join(outDir, `${nn}-${s.tag}.webp`) })), qualities: QUALITIES };
    });
    let results;
    if (o.dry) results = jobs.map((j) => ({ src: j.src, files: [{ w: 1600, h: 1200 }, { w: 480, h: 360 }] }));
    else results = engine === 'pillow' ? encodePillow(jobs) : await encodeChromium(jobs);
    const prev = byId.get(id);
    const prevImgs = new Map((prev?.images || []).map((im) => [im.id, im]));
    const images = [];
    results.forEach((r, i) => {
      const j = jobs[i];
      if (r.error) {
        report.errors.push({ id, file: j.file, error: /heic|heif|cannot identify/i.test(r.error) && /\.hei[cf]$/i.test(j.file) ? 'HEIC: pip install pillow-heif, or export the photo as JPG' : r.error });
        return;
      }
      const old = prevImgs.get(j.nn);
      const rel = (tag) => `${o.base}${id}/${j.nn}-${tag}.webp`;
      const big = r.files[0];
      images.push({
        id: j.nn,
        room: guessRoom(j.file) || old?.room || '', // 认不出来 = 空着（案例库显示「房间？」），不要猜成客厅
        kind: old?.kind || (guessRoom(j.file) === 'plan3d' ? 'plan3d' : 'photo'),
        w: big.w,
        h: big.h,
        src: rel('1600'),
        thumb: rel('480'),
        alt: old?.alt || { zh: '', en: '' },
        cover: i === coverIdx,
      });
      for (const f of r.files) if (f.bytes != null && !o.quiet) log(`  ${id}/${path.basename(f.dest)}  ${f.w}×${f.h}  ${(f.bytes / 1024).toFixed(0)} KB`);
    });
    if (!images.length) continue;
    // 如果员工已经在 manifest 里挑过封面，保留
    const keptCover = prev?.images?.find((im) => im.cover)?.id;
    if (keptCover && images.some((im) => im.id === keptCover)) images.forEach((im) => (im.cover = im.id === keptCover));
    const rooms = [...new Set(images.map((im) => im.room).filter((r) => r && r !== 'plan3d'))];
    if (prev) {
      const changed = !sameImages(prev.images, images) || (extra.title && JSON.stringify(extra.title) !== JSON.stringify(prev.title));
      if (!changed) {
        report.unchanged.push(id);
        continue;
      }
      const next = { ...prev, ...extra, id, images, rooms: [...new Set([...(prev.rooms || []), ...rooms])], rev: (prev.rev || 1) + 1, updatedAt: now };
      // 员工打过的标签不被 case.json 以外的东西盖掉
      byId.set(id, next);
      report.updated.push(id);
    } else {
      maxOrder += 10;
      const c = {
        id,
        kind: 'project',
        v: 1,
        rev: 1,
        status: 'draft',
        order: maxOrder,
        consent: false,
        title: { zh: folder, en: '' },
        story: { zh: '', en: '' },
        place: { zh: '', en: '' },
        property: { type: 'other', sizeSqft: null, bedrooms: null, bathrooms: null, storeys: 1 },
        scope: 'whole',
        rooms,
        template: null,
        style: { dreamers: [], axes: { temp: 50, density: 50, texture: 50, storage: 50 }, hidden: { light: 50, curve: 50, social: 50 }, wishes: [], features: [] },
        materials: {},
        mood: 'cozy',
        time: null,
        furniture: {},
        supplies: { firm: [], context: [] },
        products: [],
        wishNotes: {},
        images,
        createdAt: now,
        updatedAt: now,
        ...extra,
      };
      c.id = id;
      c.images = images;
      if (extra.status === 'live' && !extra.consent) c.status = 'draft'; // 没有业主同意不能直接上架
      byId.set(id, c);
      report.added.push(id);
    }
  }
  const next = { kind: 'wish-cases', v: 1, updatedAt: now, cases: [...byId.values()] };
  if (!o.dry) fs.writeFileSync(o.manifest, JSON.stringify(next, null, 2) + '\n');
  return { ...report, manifest: next };
}

// ───────────────────────── 案例包 → manifest（员工在 iPad 上打的标签，合并回网站） ─────────────────────────

/**
 * node scripts/import-cases.mjs --pack WISH-cases-20261018.json [--out public/cases] [--manifest …] [--base …]
 * 案例库「导出」的文件：按 id + rev 合并（rev 大的赢，一样或更小 = 跳过）；
 * 只存在 iPad 上的照片（内嵌的 1600 WebP）重新编码成 NN-1600 / NN-480.webp（同样去掉所有元数据），换成文件路径。
 * 真实项目没有勾「业主同意」的，一律存成草稿。
 */
export async function mergePack(opts) {
  const o = { ...parseArgs([]), ...opts };
  const log = o.quiet ? () => {} : (...a) => console.log(...a);
  const pack = typeof o.pack === 'string' && !o.pack.trim().startsWith('{') ? JSON.parse(fs.readFileSync(o.pack, 'utf8')) : typeof o.pack === 'string' ? JSON.parse(o.pack) : o.pack;
  if (pack?.kind !== 'wish-cases' || !Array.isArray(pack.cases)) throw new Error('not a WISH case pack');
  const manifest = fs.existsSync(o.manifest) ? JSON.parse(fs.readFileSync(o.manifest, 'utf8')) : { kind: 'wish-cases', v: 1, updatedAt: '', cases: [] };
  const byId = new Map(manifest.cases.map((c) => [c.id, c]));
  const engine = o.engine === 'auto' ? (havePillow() ? 'pillow' : 'chromium') : o.engine;
  const report = { engine, added: [], updated: [], skipped: [], errors: [], warnings: [] };
  const now = new Date().toISOString();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wish-pack-'));
  try {
    for (const raw of pack.cases) {
      if (!raw?.id) {
        report.errors.push({ id: null, error: 'case without id' });
        continue;
      }
      const prev = byId.get(raw.id);
      if (prev && (raw.rev || 1) <= (prev.rev || 1)) {
        report.skipped.push(raw.id);
        continue;
      }
      const { origin, ...c } = JSON.parse(JSON.stringify(raw));
      // 溪岸板材（R11 e）：旧版本存过的案例不认得 boards / boardsAlso，存的时候整个丢了 → 留着 manifest 里的那一份，并提醒
      const had = (x) => (Array.isArray(x) ? x.length > 0 : !!x && typeof x === 'object' && Object.keys(x).length > 0);
      if (prev && had(prev.boards) && !('boards' in raw)) {
        c.boards = prev.boards;
        if (had(prev.boardsAlso) && !('boardsAlso' in raw)) c.boardsAlso = prev.boardsAlso;
        report.warnings.push({ id: c.id, warning: 'newer rev has no boards (saved by an old build?): kept the boards from the manifest' });
      }
      const outDir = path.join(o.out, c.id);
      const used = new Set((c.images || []).filter((im) => !im.device).map((im) => im.id));
      let n = 0;
      const nextId = () => {
        let id;
        do id = String(++n).padStart(2, '0');
        while (used.has(id));
        used.add(id);
        return id;
      };
      const images = [];
      for (const im of c.images || []) {
        if (!im.device) {
          images.push(im);
          continue;
        }
        const url = pack.photos?.[`${c.id}/${im.id}`];
        const m = /^data:image\/(webp|jpeg|png);base64,(.*)$/s.exec(url || '');
        if (!m) {
          report.errors.push({ id: c.id, file: im.id, error: 'photo missing in the pack' });
          continue;
        }
        const src = path.join(tmp, `${c.id}-${im.id}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
        fs.writeFileSync(src, Buffer.from(m[2], 'base64'));
        const nn = nextId();
        if (!o.dry) fs.mkdirSync(outDir, { recursive: true });
        const job = { src, nn, file: im.id, sizes: SIZES.map((s) => ({ ...s, dest: path.join(outDir, `${nn}-${s.tag}.webp`) })), qualities: QUALITIES };
        const [r] = o.dry ? [{ files: [{ w: im.w, h: im.h }] }] : engine === 'pillow' ? encodePillow([job]) : await encodeChromium([job]);
        if (r.error) {
          report.errors.push({ id: c.id, file: im.id, error: r.error });
          continue;
        }
        const { device, url: _u, thumbUrl: _t, ...rest } = im;
        images.push({ ...rest, id: nn, w: r.files[0].w, h: r.files[0].h, src: `${o.base}${c.id}/${nn}-1600.webp`, thumb: `${o.base}${c.id}/${nn}-480.webp` });
        log(`  ${c.id}/${nn}  ← iPad photo ${im.id}`);
      }
      if (images.length && !images.some((im) => im.cover)) images[0].cover = true;
      c.images = images;
      if (c.kind === 'project' && c.status === 'live' && !c.consent) c.status = 'draft';
      c.updatedAt = c.updatedAt || now;
      byId.set(c.id, c);
      (prev ? report.updated : report.added).push(c.id);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const next = { kind: 'wish-cases', v: 1, updatedAt: now, cases: [...byId.values()] };
  if (!o.dry) fs.writeFileSync(o.manifest, JSON.stringify(next, null, 2) + '\n');
  return { ...report, manifest: next };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || (!o.src && !o.pack)) {
    console.log('usage: node scripts/import-cases.mjs <photo folder> [--out public/cases] [--manifest src/cases/manifest.json] [--base https://…/] [--engine auto|pillow|chromium] [--dry-run]');
    console.log('       node scripts/import-cases.mjs --pack WISH-cases-YYYYMMDD.json [--out public/cases] [--manifest src/cases/manifest.json] [--base https://…/]');
    process.exit(o.help ? 0 : 1);
  }
  if (o.pack) {
    mergePack(o)
      .then((r) => {
        console.log(`\n✓ ${r.engine}: 案例包 新增 ${r.added.length} · 更新 ${r.updated.length} · 跳过 ${r.skipped.length}${r.errors.length ? ` · 出错 ${r.errors.length}` : ''}`);
        for (const e of r.errors) console.log(`  ✗ ${e.id}${e.file ? '/' + e.file : ''}: ${e.error}`);
        for (const w of r.warnings || []) console.log(`  ! ${w.id}: ${w.warning}`);
      })
      .catch((e) => {
        console.error('✗', e.message);
        process.exit(1);
      });
  } else
  importCases(o)
    .then((r) => {
      console.log(`\n✓ ${r.engine}: 新增 ${r.added.length} · 更新 ${r.updated.length} · 没变 ${r.unchanged.length}${r.errors.length ? ` · 出错 ${r.errors.length}` : ''}`);
      for (const e of r.errors) console.log(`  ✗ ${e.id}${e.file ? '/' + e.file : ''}: ${e.error}`);
      if (r.added.length) console.log('  新项目是「草稿」：在 /cases.html（入口页「员工 · 案例库」）打好标签、勾「业主同意」，再上架。');
      if (o.base) console.log(`  记得把 ${path.relative(process.cwd(), o.out)}/ 里的文件上传到 ${o.base}`);
    })
    .catch((e) => {
      console.error('✗', e.message);
      process.exit(1);
    });
}
