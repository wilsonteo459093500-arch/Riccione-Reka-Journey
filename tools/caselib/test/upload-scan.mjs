/* ============================================================
   caselib 的 scan.js / worker.js 单元测试（在真的 Chromium 里跑）
   node --test tools/caselib/test/upload-scan.mjs
   - 拖放：假的 FileSystemEntry，readEntries 一次给 100 / 100 / 50 / 0
   - 哪一层是项目、略过哪些档
   - 照片处理：worker 和主执行绪后备做法结果一样、太大会再压、坏档回 decode
   - pid 跟伺服器算的一样
   - 拖放路径（假的 entries）和主执行绪后备做法，各完整上传一次
   ============================================================ */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMock } from '../mock-server.mjs';
import { launch, newPage, loginOk, waitHashed, startAndWait, index, photoBlobs, byName, PASSWORD } from './upload-kit.mjs';

// 这个档不用 upload-fixtures.py 的假文件夹：图都在页面里用 canvas 画
let browser, m, page, ctx;
before(async () => {
  browser = await launch();
  m = await startMock({ port: 0, blobPort: 0, password: PASSWORD });
  ({ ctx, page } = await newPage(browser));
  await page.goto(m.url + '/caselib');
  await page.waitForFunction(() => window.MB && MB.clScan && MB.clWork && MB.cl);
  // 页面里共用的假 entry 工具
  await page.evaluate(() => {
    window.T = {
      file(name, size) { return new File([new Uint8Array(size == null ? 10 : size)], name, { lastModified: 1700000000000 }); },
      fe(name, file) { return { isFile: true, isDirectory: false, name, file(ok) { setTimeout(() => ok(file || T.file(name)), 0); } }; },
      de(name, kids, batch) {
        const e = {
          isFile: false, isDirectory: true, name, reads: 0,
          createReader() {
            let i = 0;
            return { readEntries(ok) { e.reads++; const chunk = kids.slice(i, i + (batch || 100)); i += chunk.length; setTimeout(() => ok(chunk), 0); } };
          }
        };
        return e;
      },
      many(n, prefix) { const out = []; for (let i = 1; i <= n; i++) out.push(T.fe((prefix || 'IMG_') + String(i).padStart(4, '0') + '.jpg')); return out; },
      summary(r) { return { mode: r.mode, projects: r.projects.map((p) => ({ name: p.name, n: p.files.length, loose: !!p.loose, f: p.files.map((x) => x.f) })), skipped: r.skipped.map((s) => s.reason + ':' + s.rel) }; }
    };
  });
});
after(async () => {
  if (browser) await browser.close();
  if (m) await m.close();
});

test('readAllEntries keeps calling readEntries until it returns [] (250 files = 100/100/50/0)', async () => {
  const r = await page.evaluate(async () => {
    const dir = T.de('big', T.many(250), 100);
    const list = await MB.clScan.readAllEntries(dir);
    return { n: list.length, reads: dir.reads, first: list[0].name, last: list[249].name };
  });
  assert.deepEqual(r, { n: 250, reads: 4, first: 'IMG_0001.jpg', last: 'IMG_0250.jpg' });
});

test('fromEntries: a dropped root folder with project sub-folders (one has 250 photos + nested 厨房/)', async () => {
  const r = await page.evaluate(async () => {
    const big = T.de('Setia Alam 原木 测试客户', T.many(250).concat([T.de('厨房', T.many(3, 'K_'), 2), T.fe('Thumbs.db')]), 100);
    const two = T.de('Bangsar 轻法式 测试', [T.fe('a.jpg'), T.fe('b.HEIC'), T.fe('c.mp4'), T.fe('d.png')], 100);
    const root = T.de('案例', [big, two, T.fe('desktop.ini')], 100);
    const res = await MB.clScan.fromEntries([root]);
    return T.summary(res);
  });
  assert.equal(r.mode, 'split');
  assert.deepEqual(r.projects.map((p) => [p.name, p.n]), [['Bangsar 轻法式 测试', 2], ['Setia Alam 原木 测试客户', 253]]);
  const setia = r.projects[1];
  assert.ok(setia.f.includes('厨房/K_0003.jpg'), 'nested folder stays inside the project, f = path inside the project');
  assert.ok(setia.f.includes('IMG_0250.jpg'));
  assert.deepEqual(r.skipped.sort(), [
    'heic:案例/Bangsar 轻法式 测试/b.HEIC', 'junk:案例/Setia Alam 原木 测试客户/Thumbs.db', 'junk:案例/desktop.ini', 'video:案例/Bangsar 轻法式 测试/c.mp4'
  ].sort());
});

test('classify: what is skipped and why', async () => {
  const r = await page.evaluate(() => {
    const big = 61 * 1024 * 1024;
    const cases = [['a.jpg', 10], ['b.JPEG', 10], ['c.png', 10], ['d.webp', 10], ['e.jfif', 10], ['f.heic', 10], ['g.HEIF', 10],
      ['h.CR2', 10], ['i.nef', 10], ['j.ARW', 10], ['k.dng', 10], ['l.mov', 10], ['m.MP4', 10], ['Thumbs.db', 10], ['desktop.ini', 10],
      ['.DS_Store', 10], ['._a.jpg', 10], ['n.pdf', 10], ['o.psd', 10], ['p.tif', 10], ['q.gif', 10], ['r.jpg', big], ['s.jpg', 0], ['t.txt', 10]];
    return cases.map(([n, s]) => n + '=' + (MB.clScan.classify(n, s, '') || 'ok'));
  });
  assert.deepEqual(r, ['a.jpg=ok', 'b.JPEG=ok', 'c.png=ok', 'd.webp=ok', 'e.jfif=ok', 'f.heic=heic', 'g.HEIF=heic', 'h.CR2=raw', 'i.nef=raw',
    'j.ARW=raw', 'k.dng=raw', 'l.mov=video', 'm.MP4=video', 'Thumbs.db=junk', 'desktop.ini=junk', '.DS_Store=junk', '._a.jpg=junk',
    'n.pdf=other', 'o.psd=other', 'p.tif=other', 'q.gif=other', 'r.jpg=big', 's.jpg=empty', 't.txt=other']);
  // 浏览器标的 MIME 也算（没有副档名的 HEIC）
  assert.equal(await page.evaluate(() => MB.clScan.classify('IMG_1', 10, 'image/heic')), 'heic');
});

test('which level is the project', async () => {
  const r = await page.evaluate(async () => {
    const out = {};
    // 一个项目文件夹：里面直接有照片 + 厨房/ → 它自己是项目
    out.single = T.summary(await MB.clScan.fromEntries([T.de('Setia Alam 原木 测试', [T.fe('a.jpg'), T.de('厨房', [T.fe('k.jpg')])])]));
    // 只有子文件夹，但子文件夹都像空间名 → 还是一个项目
    out.rooms = T.summary(await MB.clScan.fromEntries([T.de('Cheras 现代 测试', [T.de('厨房', [T.fe('k.jpg')]), T.de('主卧', [T.fe('m.jpg')]), T.de('Living Room', [T.fe('l.jpg')])])]));
    // 拖进好几个文件夹 → 每个都是项目；散的档案略过
    out.multi = T.summary(await MB.clScan.fromEntries([T.de('P1', [T.fe('a.jpg'), T.de('sub', [T.fe('b.jpg')])]), T.de('P2', [T.fe('c.jpg')]), T.fe('loose.jpg')]));
    // 只拖散的照片 → 一个要填名字的项目
    out.loose = T.summary(await MB.clScan.fromEntries([T.fe('x.jpg'), T.fe('y.png'), T.fe('z.mov')]));
    // 手动切换
    const auto = await MB.clScan.fromEntries([T.de('总', [T.de('甲 项目', [T.fe('a.jpg')]), T.de('乙 项目', [T.fe('b.jpg')])])]);
    out.split = T.summary(auto);
    out.forcedSingle = T.summary(MB.clScan.regroup(auto, 'single'));
    out.back = T.summary(MB.clScan.regroup(MB.clScan.regroup(auto, 'single'), 'split'));
    // <input webkitdirectory> 的 FileList
    const fl = [['总/甲/a.jpg', 5], ['总/甲/厨房/b.jpg', 5], ['总/乙/c.jpg', 5], ['总/Thumbs.db', 5]].map(([p, s]) => {
      const f = T.file(p.split('/').pop(), s);
      Object.defineProperty(f, 'webkitRelativePath', { value: p });
      return f;
    });
    out.input = T.summary(MB.clScan.fromFileList(fl));
    return out;
  });
  assert.equal(r.single.mode, 'single');
  assert.deepEqual(r.single.projects.map((p) => [p.name, p.f]), [['Setia Alam 原木 测试', ['a.jpg', '厨房/k.jpg']]]);
  assert.equal(r.rooms.mode, 'single');
  assert.deepEqual(r.rooms.projects.map((p) => [p.name, p.n]), [['Cheras 现代 测试', 3]]);
  assert.deepEqual(r.multi.projects.map((p) => [p.name, p.f]), [['P1', ['a.jpg', 'sub/b.jpg']], ['P2', ['c.jpg']]]);
  assert.deepEqual(r.multi.skipped, ['loose:loose.jpg']);
  assert.deepEqual(r.loose.projects.map((p) => [p.name, p.loose, p.n]), [['', true, 2]]);
  assert.deepEqual(r.loose.skipped, ['video:z.mov']);
  assert.equal(r.split.mode, 'split');
  assert.deepEqual(r.split.projects.map((p) => p.name).sort(), ['乙 项目', '甲 项目']);
  assert.deepEqual(r.forcedSingle.projects.map((p) => [p.name, p.n]), [['总', 2]]);
  assert.deepEqual(r.back.projects.length, 2);
  assert.deepEqual(r.input.projects.map((p) => [p.name, p.f]), [['乙', ['c.jpg']], ['甲', ['a.jpg', '厨房/b.jpg']]]);
  assert.deepEqual(r.input.skipped, ['junk:总/Thumbs.db']);
});

test('entriesOf reads webkitGetAsEntry from a drop event', async () => {
  const r = await page.evaluate(() => {
    const e1 = T.de('A', []), e2 = T.de('B', []);
    const dt = { items: [{ kind: 'file', webkitGetAsEntry: () => e1 }, { kind: 'string', webkitGetAsEntry: () => null }, { kind: 'file', webkitGetAsEntry: () => e2 }] };
    const got = MB.clScan.entriesOf(dt);
    return got.entries.map((e) => e.name);
  });
  assert.deepEqual(r, ['A', 'B']);
});

/* ---------- 照片处理 ---------- */
async function makeJpeg(page, seed, w, h, q) {
  // 在页面里画一张有大块面的图 → JPEG File
  return page.evaluate(async ([seed, w, h, q]) => {
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgb(' + [200, 190, 170].map((v) => Math.round(v * rnd())).join(',') + ')');
    grad.addColorStop(1, 'rgb(' + [60, 50, 40].map((v) => Math.round(v + 80 * rnd())).join(',') + ')');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { g.fillStyle = 'hsl(' + Math.round(360 * rnd()) + ',50%,' + Math.round(30 + 40 * rnd()) + '%)'; g.fillRect(rnd() * w * 0.7, rnd() * h * 0.7, w * (0.1 + 0.4 * rnd()), h * (0.1 + 0.4 * rnd())); }
    if (q < 0) {   // 满是杂讯：压不小
      const d = g.getImageData(0, 0, w, h);
      for (let i = 0; i < d.data.length; i++) if (i % 4 !== 3) d.data[i] = Math.floor(Math.random() * 256);
      g.putImageData(d, 0, 0);
    }
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', q < 0 ? 0.98 : q));
    window.__files = window.__files || {};
    window.__files[seed] = new File([b], 'gen-' + seed + '.jpg', { type: 'image/jpeg' });
    return b.size;
  }, [seed, w, h, q]);
}

test('worker pool and main-thread fallback give the same result', async () => {
  await makeJpeg(page, 11, 2400, 1600, 0.9);
  const r = await page.evaluate(async () => {
    const f = window.__files[11];
    MB.clWork.forceMain = false;
    const a = await MB.clWork.process(f);
    const statsA = MB.clWork.stats();
    MB.clWork.forceMain = true;
    const b = await MB.clWork.process(f);
    const statsB = MB.clWork.stats();
    MB.clWork.forceMain = false;
    const h2 = (await MB.clWork.hash(f)).h;
    // 自己算一次 sha256 对照
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', await f.arrayBuffer()));
    const want = [...d].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16);
    const pick = (x) => ({ h: x.h, w: x.w, ht: x.ht, dh: x.dh, jpegType: x.jpeg.type, thumb: x.thumb.slice(0, 23), sz: x.sz === x.jpeg.size });
    return { a: pick(a), b: pick(b), h2, want, workers: statsA.workers, mainUsed: statsB.main };
  });
  assert.equal(r.a.h, r.want, 'h = first 16 hex of sha256(original bytes)');
  assert.equal(r.b.h, r.want);
  assert.equal(r.h2, r.want);
  assert.deepEqual([r.a.w, r.a.ht], [1200, 800], 'long side 1200px (free plan: ~150–250 KB a photo)');
  assert.deepEqual([r.b.w, r.b.ht], [1200, 800]);
  assert.equal(r.a.jpegType, 'image/jpeg');
  assert.equal(r.a.thumb, 'data:image/jpeg;base64,');
  assert.equal(r.a.sz, true);
  assert.ok(r.workers >= 1, 'a Web Worker was used');
  assert.ok(r.mainUsed >= 1, 'forceMain ran on the main thread');
  let d = 0;
  for (let i = 0; i < 16; i++) { let x = parseInt(r.a.dh[i], 16) ^ parseInt(r.b.dh[i], 16); while (x) { d += x & 1; x >>= 1; } }
  assert.ok(d <= 2, 'same dHash either way (distance ' + d + ')');
});

test('dHash: same picture → same hash; different pictures → far apart; thumbs ≤ 320px', async () => {
  await makeJpeg(page, 21, 1800, 1200, 0.9);
  await makeJpeg(page, 22, 1800, 1200, 0.9);
  const r = await page.evaluate(async () => {
    const a = await MB.clWork.process(window.__files[21]);
    const a2 = await MB.clWork.process(window.__files[21]);
    const b = await MB.clWork.process(window.__files[22]);
    const im = new Image();
    await new Promise((ok) => { im.onload = ok; im.src = a.thumb; });
    return { a: a.dh, a2: a2.dh, b: b.dh, tw: im.naturalWidth, th: im.naturalHeight };
  });
  assert.equal(r.a, r.a2);
  let d = 0;
  for (let i = 0; i < 16; i++) { let x = parseInt(r.a[i], 16) ^ parseInt(r.b[i], 16); while (x) { d += x & 1; x >>= 1; } }
  assert.ok(d > 12, 'different pictures differ by ' + d + ' bits');
  assert.deepEqual([r.tw, r.th], [320, 213]);
});

test('analyze (curated mode): same h / w / ht / dh as process, no JPEG; preview: a small JPEG Blob; both on the main-thread fallback too', async () => {
  await makeJpeg(page, 61, 2400, 1600, 0.9);
  await makeJpeg(page, 62, 900, 1350, 0.9);
  const r = await page.evaluate(async () => {
    const out = {};
    for (const k of [61, 62]) {
      const f = window.__files[k];
      const p = await MB.clWork.process(f);
      const a = await MB.clWork.analyze(f);
      const a2 = await MB.clWork.analyze(f, { h: p.h });
      MB.clWork.forceMain = true;
      const am = await MB.clWork.analyze(f);
      const pm = await MB.clWork.preview(f, { long: 200 });
      MB.clWork.forceMain = false;
      const pv = await MB.clWork.preview(f, { long: 200 });
      const im = new Image();
      const url = URL.createObjectURL(pv.blob);
      await new Promise((ok) => { im.onload = ok; im.src = url; });
      URL.revokeObjectURL(url);
      out[k] = {
        p: [p.h, p.w, p.ht, p.dh], a: [a.h, a.w, a.ht, a.dh], a2: [a2.h, a2.w, a2.ht, a2.dh], am: [am.h, am.w, am.ht], amDh: am.dh, aDh: a.dh,
        noJpeg: !a.jpeg && !a.thumb, orig: [a.ow, a.oh],
        pv: [pv.blob.type, pv.blob.size < 30000, im.naturalWidth, im.naturalHeight], pm: [pm.blob.type, pm.w, pm.ht]
      };
    }
    out.stats = MB.clWork.stats();
    let err = '';
    try { await MB.clWork.analyze(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], 'bad.jpg', { type: 'image/jpeg' })); } catch (e) { err = e.code; }
    out.err = err;
    return out;
  });
  for (const k of ['61', '62']) {
    assert.deepEqual(r[k].a, r[k].p, 'analyze = process (h, w, ht, dh) for ' + k);
    assert.deepEqual(r[k].a2, r[k].p, 'analyze with a known h');
    assert.deepEqual(r[k].am, r[k].p.slice(0, 3), 'main-thread fallback: same h / size');
    let d = 0;
    for (let i = 0; i < 16; i++) { let x = parseInt(r[k].amDh[i], 16) ^ parseInt(r[k].aDh[i], 16); while (x) { d += x & 1; x >>= 1; } }
    assert.ok(d <= 2, 'same dHash on the main thread (distance ' + d + ')');
    assert.equal(r[k].noJpeg, true, 'analyze does not encode anything');
  }
  assert.deepEqual(r['61'].orig, [2400, 1600]);
  assert.deepEqual(r['61'].pv, ['image/jpeg', true, 200, 133]);
  assert.deepEqual(r['62'].pv, ['image/jpeg', true, 133, 200]);
  assert.deepEqual(r['62'].pm, ['image/jpeg', 133, 200]);
  assert.ok(r.stats.analyze >= 6 && r.stats.preview >= 4, JSON.stringify(r.stats));
  assert.equal(r.err, 'decode');
});

test('too large after q0.82 → re-encoded smaller; corrupt file → decode error', async () => {
  await makeJpeg(page, 31, 1600, 1200, -1);
  const r = await page.evaluate(async () => {
    const f = window.__files[31];
    const normal = await MB.clWork.process(f);
    // 把上限压到正常结果以下，走「再压」的路
    const lim = Math.floor(normal.sz * 0.8);
    const smaller = await MB.clWork.process(f, { maxBytes: lim });
    let err = '';
    try { await MB.clWork.process(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5])], 'bad.jpg', { type: 'image/jpeg' })); } catch (e) { err = e.code; }
    let err2 = '';
    MB.clWork.forceMain = true;
    try { await MB.clWork.process(new File([new Uint8Array(50)], 'bad2.jpg')); } catch (e) { err2 = e.code; }
    MB.clWork.forceMain = false;
    return { normal: normal.sz, lim, smaller: smaller.sz, q: smaller.q, w: smaller.w, err, err2 };
  });
  assert.ok(r.smaller <= r.lim, r.smaller + ' ≤ ' + r.lim);
  assert.ok(r.q < 0.82, 'quality lowered to ' + r.q);
  assert.equal(r.err, 'decode');
  assert.equal(r.err2, 'decode');
});

test('pid in the browser = pid on the server (Chinese, Malay, spaces, case, NFD)', async () => {
  const { pidOf } = await import(new URL('../../../invite/api/_lib/catalog.js', import.meta.url).href);
  const names = ['Setia Alam 原木 测试客户', '  Setia   Alam 原木 测试客户 ', 'SETIA ALAM 原木 测试客户', 'Taman Tun Dr Ismail · Rumah Teres',
    'Café Bangsar 轻法式', 'Café Bangsar 轻法式', 'M Vertica 奶油风\t测试', 'a​b 隐形字元', 'x'.repeat(150)];
  const got = await page.evaluate((ns) => Promise.all(ns.map((n) => MB.cl.pidOf(n))), names);
  const cleanText = (await import(new URL('../../../invite/api/_lib/catalog.js', import.meta.url).href)).cleanText;
  assert.deepEqual(got, names.map((n) => pidOf(cleanText(n, 120))));
  assert.equal(got[0], got[1]);
  assert.equal(got[0], got[2]);
  assert.equal(got[4], got[5], 'NFC and NFD spellings are the same project');
});

/* ---------- 完整走一次：拖放（假的 entries）+ 主执行绪后备做法 ---------- */
test('drag-and-drop path (fake entries) uploads on the main-thread fallback too', async () => {
  await loginOk(page, null, 'Dee');
  await makeJpeg(page, 41, 1200, 900, 0.9);
  await makeJpeg(page, 42, 900, 1200, 0.9);
  await makeJpeg(page, 43, 1000, 1000, 0.9);
  await page.evaluate(() => {
    MB.clWork.forceMain = true;
    const f = window.__files;
    const proj = T.de('Kajang 北欧 测试', [T.fe('a.jpg', f[41]), T.de('客厅', [T.fe('b.jpg', f[42]), T.fe('c.jpg', f[43])]), T.fe('v.mov')], 2);
    MB.clUpload.dropEntries({ entries: [proj] });
  });
  await waitHashed(page);
  assert.match(await page.textContent('#plan-body'), /Kajang 北欧 测试/);
  await startAndWait(page);
  const idx = index(m);
  const p = byName(idx, 'Kajang 北欧 测试');
  assert.equal(p.n, 3);
  assert.deepEqual(Object.values(idx.photos).map((x) => x.f).sort(), ['a.jpg', '客厅/b.jpg', '客厅/c.jpg']);
  assert.equal(photoBlobs(m).length, 3);
  assert.ok(await page.evaluate(() => MB.clWork.stats().main) >= 3, 'processed on the main thread');
  await page.evaluate(() => { MB.clWork.forceMain = false; });
  assert.deepEqual(page.errors, []);
});

test('phone path: loose photos need a project name before starting', async () => {
  await makeJpeg(page, 51, 800, 600, 0.9);
  await page.evaluate(() => {
    const f = window.__files[51];
    MB.clUpload.dropEntries({ files: [new File([f], 'phone1.jpg', { type: 'image/jpeg' })] });
  });
  await waitHashed(page);
  await page.click('#start');
  assert.equal(await page.evaluate(() => MB.clUpload.busy()), false, 'cannot start without a name');
  await page.fill('#plan input.loose-name', 'Seremban 原木 测试');
  await page.waitForFunction(() => MB.clUpload.state().projects[0].pid);
  await startAndWait(page);
  const p = byName(index(m), 'Seremban 原木 测试');
  assert.ok(p, 'project created from the typed name');
  assert.equal(p.n, 1);
  assert.deepEqual(page.errors, []);
});

test('team password not set on the server → «还没启用» screen (503)', async () => {
  const old = process.env.VISI_TEAM_PASSWORD;
  process.env.VISI_TEAM_PASSWORD = '';
  try {
    const one = await newPage(browser);
    await one.page.goto(m.url + '/caselib');
    await one.page.waitForSelector('#not-config:not([hidden])');
    assert.match(await one.page.textContent('#not-config'), /VISI_TEAM_PASSWORD/);
    assert.equal(await one.page.isHidden('#login'), true);
    assert.equal(await one.page.isHidden('#tabs'), true);
    await one.ctx.close();
  } finally {
    process.env.VISI_TEAM_PASSWORD = old;
  }
});
