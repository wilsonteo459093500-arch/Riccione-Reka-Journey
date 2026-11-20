// VISI 第 3 阶段：案例库「导出给 VISI」→ 内置图库。跑法：node --test tools/visi/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadVisi } from './load.mjs';
import { check, entryOf, jpegMeta, readList } from '../import-builtin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../invite');
const MB = loadVisi();

/** 案例库那边的导出逻辑（纯函数）：在 Node 里载入 */
function loadExport() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  for (const f of ['assets/js/visi/case-vocab.js', 'assets/js/visi/data.js', 'assets/js/caselib/visi-export.js']) {
    vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx.MB;
}

const H = (n) => n.toString(16).padStart(16, 'a');
const CAT = {
  base: 'http://x/local-cases/',
  projects: {
    p1: { name: '20210513-上海-方女士-原木', style: 'wood' },
    p2: { name: '陈先生 Bangsar', style: 'modern', hidden: { by: 'x', ts: 1 } }
  },
  photos: {
    [H(1)]: { p: 'p1', k: 'c/' + H(1) + '-r.jpg', w: 1200, h: 800, f: '方女士/厨房/IMG_1.jpg', room: 'kitchen', cabinets: ['kitchen'], hero: true, status: 'confirmed', desc: { zh: '方女士家的厨房' } },
    [H(2)]: { p: 'p1', k: 'c/' + H(2) + '-r.jpg', w: 800, h: 1200, f: '方女士/浴室/IMG_2.jpg', room: 'bathroom', style: 'wabi', status: 'unsure' },
    [H(3)]: { p: 'p1', k: 'c/' + H(3) + '-r.jpg', w: 800, h: 1200, f: 'x', room: '' },
    [H(4)]: { p: 'p2', k: 'c/' + H(4) + '-r.jpg', w: 800, h: 1200, f: 'x', room: 'kitchen' },
    [H(5)]: { p: 'p1', k: 'c/' + H(5) + '-r.jpg', w: 800, h: 1200, f: 'x', room: 'altar', hidden: { by: 'x', ts: 1 } }
  }
};

test('导出：只带空间、风格、柜类；不带客户名字、项目名、档名、AI 说明', () => {
  const X = loadExport().clVisiExport;
  const pl = JSON.parse(JSON.stringify(X.plan(CAT, [H(1), H(2), H(3), H(4), H(5), "nope"])));
  assert.deepEqual(pl.items.map((x) => x.id), [H(1), H(2)]);
  assert.deepEqual(pl.skipped.map((x) => x.why).sort(), ['已经隐藏', '已经隐藏', '找不到这张', '还没分空间'].sort());
  assert.equal(pl.items[0].style, 'wood', '照片没标风格 → 跟项目');
  assert.equal(pl.items[1].unsure, true);
  const json = JSON.stringify(X.manifest(pl, 1));
  for (const leak of ['方女士', '上海', 'IMG_', '陈先生', 'Bangsar', 'local-cases', 'desc', '"k"']) assert.ok(!json.includes(leak), '漏出：' + leak);
  const sum = X.summary(pl);
  assert.match(sum, /厨房 1 张/);
  assert.match(sum, /还是 0 张的空间：玄关/);
  assert.match(sum, /不确定/);
});

/** 做一个解压后的导出资料夹：照片用 PIL 画，exif = true 的那张带 GPS */
function fixture(photos) {
  const dir = mkdtempSync(path.join(tmpdir(), 'sail-'));
  const py = [];
  for (const p of photos) {
    mkdirSync(path.join(dir, 'photos', p.room), { recursive: true });
    py.push(`im=Image.new('RGB',(${p.w},${p.h}),(120,90,60))` + (p.exif
      ? `;ex=Image.Exif();ex[0x8825]={1:'N',2:(3.0,8.0,0.0)};ex[0x010f]='Apple';im.save(${JSON.stringify(path.join(dir, p.file))},exif=ex)`
      : `;im.save(${JSON.stringify(path.join(dir, p.file))},quality=85)`));
  }
  execFileSync('python3', ['-I', '-c', 'from PIL import Image\n' + py.join('\n')]);
  writeFileSync(path.join(dir, 'visi-photos.json'), JSON.stringify({ kind: 'visi-builtin-export', v: 1, photos }));
  return dir;
}
const P = (n, room, more) => Object.assign({ id: H(n), file: `photos/${room}/${H(n)}.jpg`, room, style: 'wood', style2: '', cabinets: [], product: '', hero: false, unsure: false, w: 64, h: 48 }, more);

test('放进内置图库：说明只写风格 + 空间；不确定的、已经有的跳过', () => {
  const dir = fixture([P(1, 'kitchen'), P(2, 'bathroom', { style: '' }), P(3, 'altar', { unsure: true })]);
  const man = JSON.parse(readFileSync(path.join(dir, 'visi-photos.json'), 'utf8'));
  const res = check(MB, dir, man, { have: [{ id: 'b:s-' + H(1) }] });
  assert.equal(res.bad.length, 0);
  assert.deepEqual(res.ok.map((x) => x.p.id), [H(2)]);
  assert.deepEqual(res.skip.map((x) => x.why).sort(), ['已经在内置图库', '分类标了「不确定」'].sort());
  const e = entryOf(MB, P(1, 'kitchen'));
  assert.equal(e.id, 'b:s-' + H(1));
  assert.equal(e.zh, '原木厨房');
  assert.equal(e.en, 'Natural wood kitchen');
  assert.equal(e.series, '');
  assert.equal(entryOf(MB, P(2, 'bathroom', { style: '' })).zh, '浴室实景');
});

test('照片里还有拍摄资料（GPS）、路径不对、空间不认得 → 不合格', () => {
  const dir = fixture([P(1, 'kitchen', { exif: true }), P(2, 'kitchen')]);
  assert.ok(jpegMeta(readFileSync(path.join(dir, 'photos/kitchen', H(1) + '.jpg'))).includes('EXIF'));
  assert.deepEqual(jpegMeta(readFileSync(path.join(dir, 'photos/kitchen', H(2) + '.jpg'))), []);
  const man = { kind: 'visi-builtin-export', photos: [P(1, 'kitchen'), P(2, 'kitchen', { file: '../../etc/passwd' }), P(4, 'garage')] };
  const res = check(MB, dir, man);
  assert.deepEqual(res.bad.map((x) => x.why.slice(0, 4)).sort(), ['VISI', '档案路径', '照片里还'].sort());
  assert.equal(check(MB, dir, { kind: 'other' }).bad.length, 1);
});

test('内置图库清单读得出来；新照片的空间都是 VISI 认得的', () => {
  const list = readList();
  assert.ok(Array.isArray(list));
  list.forEach((e) => assert.ok(e.rooms.every((r) => MB.ROOM[r]), e.id));
});
