/* ============================================================
   VISI × 案例库测试的假资料（测试时才产生，不进 git）
   ------------------------------------------------------------
   6 个假项目、约 60 张照片：用伺服器真的 catalog.js（addPhotos / patch / setHidden）建清单，
   照片是 Chromium 画出来的色块 JPEG（不是真的照片），缩图包也照正式格式做。
   文件夹名照真的样子「区域 风格 客户名」—— 客户名都是假的（陈先生、李小姐…），
   测试就是要确认这些字绝不会出现在 VISI 的任何输出里。
   用法：const fx = await buildSeed(browser) → { seed:{index, blobs}, photos:[…], projects:[…], names:[…], fpaths:[…] }
   ============================================================ */
import { createHash, randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const API = pathToFileURL(join(ROOT, 'invite', 'api')).href + '/';
const catalog = await import(API + '_lib/catalog.js');

/* 假项目：name = 文件夹名（含假的客户名）；每张照片 [空间, 柜类[], 选项]
   选项：hero 可当主图 · unsure 不确定 · hide 隐藏 · twin 跟上一张同一个镜头（dHash 差 2 bit）· portrait 直幅 · small 小图 */
export const PROJECTS = [
  { name: 'Setia Alam 原木 陈先生', area: 'Setia Alam', ptype: 'terrace', traits: ['elderly'], style: 'wood', hue: 32,
    photos: [['kitchen', ['kitchen', 'island'], 'hero'], ['kitchen', ['kitchen', 'island'], 'twin'], ['kitchen', ['kitchen']], ['kitchen', ['island'], 'unsure hero'],
      ['living', ['tvwall', 'tvcab'], 'hero'], ['living', ['display']], ['foyer', ['shoe'], 'portrait'], ['foyer', ['shoe']],
      ['master', ['wardrobe'], 'portrait'], ['master', ['bed']]] },
  { name: 'Setia Alam 原木 黄太太', area: 'Setia Alam', ptype: 'terrace', traits: ['kids'], style: 'wood', hue: 40,
    photos: [['kitchen', ['kitchen', 'island'], 'hero hide'], ['kitchen', ['kitchen']], ['kitchen', ['island']], ['bedroom', ['wardrobe']],
      ['bedroom', ['bed'], 'portrait'], ['living', ['display'], 'hero'], ['living', ['tvwall']], ['study', ['bookcase']], ['study', ['bookcase'], 'small'], ['foyer', ['shoe']]] },
  { name: 'Shah Alam 奶油风 李小姐', area: 'Shah Alam', ptype: 'semid', traits: ['elderly', 'helper'], style: 'cream', hue: 18,
    photos: [['kitchen', ['kitchen'], 'hero'], ['kitchen', ['island'], 'unsure'], ['kitchen', ['kitchen']], ['dining', ['sideboard']],
      ['dining', ['sideboard', 'display']], ['master', ['wardrobe']], ['master', ['dresser']], ['bathroom', ['bathvanity'], 'portrait'],
      ['bathroom', ['bathvanity']], ['foyer', ['shoe']]] },
  { name: 'Mont Kiara 现代简约 Tan 先生', area: 'Mont Kiara', ptype: 'condo', traits: ['pets'], style: 'modern', hue: 210,
    photos: [['kitchen', ['kitchen', 'island'], 'hero'], ['kitchen', ['kitchen']], ['living', ['tvwall']], ['living', ['tvcab']],
      ['master', ['wardrobe']], ['master', ['bedend']], ['study', ['bookcase']], ['walkin', ['wardrobe']], ['bathroom', ['bathvanity']], ['foyer', ['shoe']]] },
  { name: 'Puchong 日式 Lim Family', area: 'Puchong', ptype: 'terrace', traits: ['kids', 'elderly'], style: 'japandi', hue: 95,
    photos: [['kitchen', ['kitchen'], 'hero'], ['kitchen', ['island']], ['foyer', ['shoe']], ['foyer', ['shoe', 'wallpanel']],
      ['walkin', ['wardrobe']], ['walkin', ['wardrobe']], ['living', ['tvwall']], ['bedroom', ['wardrobe']], ['guest', ['wardrobe']], ['dining', ['sideboard']]] },
  { name: 'Bangsar 轻奢 王先生', area: 'Bangsar', ptype: 'bungalow', traits: [], style: 'luxe', hue: 280,
    photos: [['kitchen', ['kitchen', 'island'], 'hero'], ['kitchen', ['kitchen']], ['living', ['display']], ['living', ['tvwall']],
      ['master', ['wardrobe']], ['master', ['dresser']], ['walkin', ['wardrobe']], ['dining', ['sideboard']], ['study', ['bookcase']], ['bathroom', ['bathvanity']]] }
];

/* 房间 → 华文资料夹名（照片的 f 路径会带着它，也不能外流） */
const DIR = { kitchen: '厨房', living: '客厅', foyer: '玄关', master: '主卧', bedroom: '儿童房', study: '书房', dining: '餐厅',
  bathroom: '浴室', walkin: '衣帽间', guest: '客房', laundry: '洗衣房', vanity: '梳妆台', altar: '神台' };

/** 在浏览器里画一张 JPEG（色块 + 大字），回 base64（不含 data: 头） */
async function drawJpegs(page, specs) {
  return page.evaluate((specs) => specs.map((s) => {
    const c = document.createElement('canvas');
    c.width = s.w; c.height = s.h;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, s.w, s.h);
    grd.addColorStop(0, 'hsl(' + s.hue + ',35%,' + (70 - s.i) + '%)');
    grd.addColorStop(1, 'hsl(' + ((s.hue + 30) % 360) + ',30%,' + (38 + s.i) + '%)');
    g.fillStyle = grd; g.fillRect(0, 0, s.w, s.h);
    // 一点「家具」的块面：每张不一样，缩图看得出差别
    g.fillStyle = 'rgba(255,255,255,.35)';
    for (let k = 0; k < 4; k++) g.fillRect((s.i * 37 + k * 211) % (s.w - 200), s.h * (0.35 + k * 0.12), 160 + k * 40, s.h * 0.08);
    g.fillStyle = 'rgba(20,20,20,.75)';
    g.font = 'bold ' + Math.round(s.h / 7) + 'px sans-serif';
    g.fillText(s.text, s.w * 0.08, s.h * 0.25);
    g.font = Math.round(s.h / 16) + 'px sans-serif';
    g.fillText(s.sub, s.w * 0.08, s.h * 0.9);
    const full = c.toDataURL('image/jpeg', 0.8);
    const t = document.createElement('canvas');
    const k = 320 / Math.max(s.w, s.h);
    t.width = Math.round(s.w * k); t.height = Math.round(s.h * k);
    t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
    return { full: full.split(',')[1], thumb: t.toDataURL('image/jpeg', 0.72) };
  }), specs);
}

function hex16(buf) { return createHash('sha256').update(buf).digest('hex').slice(0, 16); }
function dhOf(n) { return createHash('sha256').update('dh:' + n).digest('hex').slice(0, 16); }
function flip2(dh) { const b = BigInt('0x' + dh) ^ 0b101n; return b.toString(16).padStart(16, '0'); }
function suffix() { return randomBytes(12).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 21).padEnd(21, 'x'); }

/**
 * @param {import('playwright').Browser} browser
 * @returns {Promise<{seed, photos, projects, names, fpaths}>}
 *   photos = [{ h, pid, project, room, cabinets, hero, unsure, hidden, shotOf, k, bytes(base64) }]
 */
export async function buildSeed(browser) {
  const page = await browser.newPage();
  await page.goto('about:blank');
  const specs = [];
  PROJECTS.forEach((pr, pi) => pr.photos.forEach((ph, i) => {
    const opt = ph[2] || '';
    const portrait = /portrait/.test(opt), small = /small/.test(opt);
    const w = small ? 700 : portrait ? 900 : 1200, h = small ? 520 : portrait ? 1200 : 900;
    specs.push({ w, h, hue: pr.hue, i: i * 2, text: 'P' + (pi + 1) + ' #' + (i + 1), sub: ph[0] + ' · ' + ph[1].join('+') });
  }));
  const imgs = await drawJpegs(page, specs);
  await page.close();

  let index = catalog.emptyIndex();
  const blobs = {};
  const photos = [];
  const now = Date.UTC(2026, 9, 1);
  let n = 0;
  PROJECTS.forEach((pr, pi) => {
    const pid = catalog.pidOf(pr.name);
    const list = [], thumbs = {};
    let lastDh = '';
    pr.photos.forEach((ph, i) => {
      const img = imgs[n]; n++;
      const buf = Buffer.from(img.full, 'base64');
      const h = hex16(buf);
      const k = 'c/' + h + '-' + suffix() + '.jpg';
      blobs[k] = img.full;
      const opt = ph[2] || '';
      const dh = /twin/.test(opt) && lastDh ? flip2(lastDh) : dhOf(pr.name + i);
      lastDh = dh;
      const sp = specs[n - 1];
      const f = pr.name + '/' + DIR[ph[0]] + '/IMG_' + String(1000 + pi * 100 + i) + '.jpg';
      list.push({ h, k, w: sp.w, ht: sp.h, sz: buf.length, dh, f });
      thumbs[h] = img.thumb;
      photos.push({ h, pid, project: pi, room: ph[0], cabinets: ph[1], hero: /hero/.test(opt), unsure: /unsure/.test(opt),
        hidden: /hide/.test(opt), twin: /twin/.test(opt), k, f, w: sp.w, hgt: sp.h, bytes: img.full });
    });
    // 缩图包：每个项目一包（正式的是每批上传一包）
    const pack = 't/' + pid + '-' + Date.now().toString(36) + '-' + suffix() + '.json';
    blobs[pack] = Buffer.from(JSON.stringify(thumbs)).toString('base64');
    catalog.addPhotos(index, { project: { name: pr.name }, photos: list, pack }, 'Ana', now + pi);
  });
  // 分类结果：人工确认（不确定的照片明说 unsure）
  const P = {}, J = {};
  photos.forEach((ph) => {
    const x = { room: ph.room, cabinets: ph.cabinets, hero: ph.hero };
    if (ph.unsure) x.status = 'unsure';
    // 一部分照片有分类时写的一行描述
    if (ph.room === 'kitchen' && ph.hero) x.desc = { zh: '原木色厨房，中岛带收纳', en: 'Warm wood kitchen with a storage island' };
    P[ph.h] = x;
  });
  PROJECTS.forEach((pr) => { J[catalog.pidOf(pr.name)] = { area: pr.area, ptype: pr.ptype, traits: pr.traits, style: pr.style }; });
  catalog.patch(index, { source: 'human', photos: P, projects: J }, 'Ana', now + 100);
  catalog.setHidden(index, { photos: photos.filter((p) => p.hidden).map((p) => p.h) }, true, 'Ana', now + 200);
  // 每张照片的「镜头」：catalog 分好的 shot
  photos.forEach((ph) => { ph.shot = index.photos[ph.h].shot; ph.status = index.photos[ph.h].status; });
  return {
    seed: { index, blobs },
    photos,
    projects: PROJECTS.map((pr) => Object.assign({ pid: catalog.pidOf(pr.name) }, pr)),
    // 不能外流的字：文件夹名、客户名、档案路径
    names: PROJECTS.map((pr) => pr.name),
    clients: ['陈先生', '黄太太', '李小姐', 'Tan 先生', 'Lim Family', '王先生'],
    fpaths: photos.map((p) => p.f)
  };
}
