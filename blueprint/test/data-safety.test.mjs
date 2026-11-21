// 体检第 4 阶段「资料不丢」的规则（纯函数，Node 跑）：
//   备份提醒（7 天）、自动清图片 / 画板（只清确定没人用的）、备份档的文件名 / 索引 / 合并、导入可以取消
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import {
  backupStatus, boardsBackupStatus, dueProjects, withBackups, withBoardsBackup, withAllBackup, pruneLog, normalizeLog, folderUpToDate, emptyLog,
  BACKUP_DUE_DAYS,
} from '../src/lib/backupLog.js';
import { findOrphanAssets, findOrphanBoards, referencedAssetIds, CLEAN_MIN_AGE } from '../src/lib/cleanup.js';
import {
  folderFileName, tailOfFileName, idTail, parseAllIndex, parseBoardsIndex, planBoardsMerge, newLibraryItems, boardsChangedAtOf,
  buildBundleManifest, parseBundleManifest, ALL_FORMAT, BOARDS_FORMAT,
} from '../src/lib/bundle.js';
import { extractPdf } from '../src/import/pdfExtract.js';
import { STANDALONE_ID } from '../src/moodboard/constants.js';

const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 10, 21, 10);

// ---------------------------------------------------------------------------
// 备份提醒
// ---------------------------------------------------------------------------

test('备份提醒：没备份过 → 「还没备份」，建好 7 天还没备份 → 该备份了', () => {
  assert.equal(BACKUP_DUE_DAYS, 7);
  const fresh = { id: 'p1', rev: 3, createdAt: NOW - 2 * DAY };
  assert.deepEqual(backupStatus(fresh, null, { now: NOW }), { state: 'never', at: null, due: false });
  const old = { id: 'p1', rev: 3, createdAt: NOW - 8 * DAY };
  assert.deepEqual(backupStatus(old, null, { now: NOW }), { state: 'due', at: null, due: true });
});

test('备份提醒：备份之后没改过 → 不管多久都不提醒；改过 → 备份满 7 天才提醒', () => {
  const p = { id: 'p1', rev: 5, createdAt: NOW - 60 * DAY };
  assert.equal(backupStatus(p, { at: NOW - 30 * DAY, rev: 5 }, { now: NOW }).state, 'fresh');
  assert.equal(backupStatus(p, { at: NOW - 3 * DAY, rev: 4 }, { now: NOW }).state, 'changed');
  const due = backupStatus(p, { at: NOW - 7 * DAY, rev: 4 }, { now: NOW });
  assert.equal(due.state, 'due');
  assert.equal(due.at, NOW - 7 * DAY);
  // 首页那句「N 个项目该备份了」
  const log = withBackups(emptyLog(), [{ id: 'a', rev: 1 }], { now: NOW - 10 * DAY });
  const list = [
    { id: 'a', rev: 2, createdAt: NOW - 20 * DAY }, // 备份后改过，10 天
    { id: 'b', rev: 1, createdAt: NOW - 1 * DAY }, // 新的
    { id: 'c', rev: 1, createdAt: NOW - 9 * DAY }, // 9 天没备份过
  ];
  assert.deepEqual(dueProjects(list, log, { now: NOW }).map((p) => p.id), ['a', 'c']);
});

test('备份记录：资料夹备份另记一笔；没改过的不用重写；删掉的项目不再记', () => {
  let log = withBackups(emptyLog(), [{ id: 'a', rev: 3 }], { now: NOW });
  assert.equal(folderUpToDate({ id: 'a', rev: 3 }, log.projects.a), false, '只是下载过，资料夹里还没有');
  log = withBackups(log, [{ id: 'a', rev: 3 }], { now: NOW, folder: true });
  assert.equal(folderUpToDate({ id: 'a', rev: 3 }, log.projects.a), true);
  assert.equal(folderUpToDate({ id: 'a', rev: 4 }, log.projects.a), false, '改过就要重写');
  // 之后单独下载一次：资料夹那份的记录不变
  log = withBackups(log, [{ id: 'a', rev: 5 }], { now: NOW + DAY });
  assert.equal(log.projects.a.rev, 5);
  assert.equal(log.projects.a.folderRev, 3);
  log = withAllBackup(log, { now: NOW, via: 'folder', folder: 'UKIR 备份' });
  assert.deepEqual(log.all, { at: NOW, via: 'folder', folder: 'UKIR 备份' });
  log = pruneLog(withBackups(log, [{ id: 'gone', rev: 1 }]), ['a']);
  assert.deepEqual(Object.keys(log.projects), ['a']);
  // 坏掉的记录不会让首页出错
  assert.deepEqual(normalizeLog('nope'), emptyLog());
  assert.deepEqual(normalizeLog({ projects: { x: null, y: { at: 0 } } }).projects, {});
});

test('Material Board 备份提醒：没东西不提醒；备份后又改了、满 7 天才提醒', () => {
  assert.equal(boardsBackupStatus(0, null, { now: NOW }).state, 'empty');
  assert.equal(boardsBackupStatus(NOW - DAY, null, { now: NOW }).state, 'never');
  assert.equal(boardsBackupStatus(NOW - 8 * DAY, null, { now: NOW }).state, 'due');
  const rec = withBoardsBackup(emptyLog(), NOW - 9 * DAY, { now: NOW - 9 * DAY }).boards;
  assert.equal(boardsBackupStatus(NOW - 9 * DAY, rec, { now: NOW }).state, 'fresh');
  assert.equal(boardsBackupStatus(NOW - DAY, rec, { now: NOW }).state, 'due');
});

// ---------------------------------------------------------------------------
// 自动清图片
// ---------------------------------------------------------------------------

const proj = (id, srcs) => ({ id, slides: srcs.map((s, i) => ({ id: `s${i}`, image: s })), pages: [] });
const asset = (id, projectId, ageH, size = 1000) => ({ id, projectId, ts: NOW - ageH * 3600 * 1000, size });

test('自动清图片：只清哪个项目都没用到、存了 1 小时以上的', () => {
  const projects = [proj('p1', ['asset:a1', 'asset:a2']), proj('p2', ['asset:b1'])];
  const assets = [
    asset('a1', 'p1', 50), // 用着
    asset('a2', 'p1', 50), // 用着
    asset('a3', 'p1', 50, 2000), // 换掉的图
    asset('b1', 'p2', 50),
    asset('x1', 'p-deleted', 50, 3000), // 删掉 / 导入失败的项目留下的
    asset('x2', 'p-importing', 0.2), // 刚存的：可能正在导入
    asset('x3', null, 50, 500), // 没记项目的旧图
    { id: 'x4', projectId: 'p1', size: 10 }, // 没记时间：不碰
  ];
  const r = findOrphanAssets(assets, projects, { now: NOW });
  assert.deepEqual(r.ids.sort(), ['a3', 'x1', 'x3']);
  assert.equal(r.bytes, 5500);
  assert.equal(CLEAN_MIN_AGE, 3600 * 1000);
});

test('自动清图片：正在编辑的项目整个跳过（撤销历史里可能还用着换掉的图）；别的项目用到的也不清', () => {
  const projects = [proj('p1', ['asset:a1']), proj('p2', ['asset:shared'])];
  const assets = [asset('a9', 'p1', 50), asset('shared', 'p1', 50), asset('z', 'p2', 50)];
  const r = findOrphanAssets(assets, projects, { now: NOW, editing: new Set(['p1']) });
  assert.deepEqual(r.ids, ['z']);
});

test('自动清图片：项目里每一处图片都算用到（页面、楼层、材料、封面、原稿缩略图、3D 贴图）；手动调整里的记号不算', () => {
  const p = {
    id: 'p1',
    slides: [{ id: 's1', image: 'asset:v1', adjust: { img: { src: 'asset:old' } } }],
    floors: [{ id: 'f1', image: 'asset:f1', plan: 'asset:plan1', plan3d: { textures: { floor: { src: 'asset:tex1' } } } }],
    materials: [{ id: 'm1', image: 'asset:m1' }],
    cover: { image: 'asset:cover' },
    pages: [{ n: 1, thumb: 'asset:t1' }],
  };
  const used = referencedAssetIds([p]);
  for (const id of ['v1', 'f1', 'plan1', 'tex1', 'm1', 'cover', 't1']) assert.ok(used.has(id), id);
  assert.ok(!used.has('old'), '换掉的图不会因为取景记号被留着');
});

test('自动清画板：项目已经不在了的画板才清；独立 Material Board 的、刚建的都不动', () => {
  const projects = [{ id: 'p1' }];
  const boards = [
    { id: 'b1', projectId: 'p1', ts: NOW - 50 * 3600e3 },
    { id: 'b2', projectId: 'p-gone', ts: NOW - 50 * 3600e3 },
    { id: 'b3', projectId: STANDALONE_ID, ts: NOW - 50 * 3600e3 },
    { id: 'b4', projectId: 'p-restoring', createdAt: NOW - 60e3 },
  ];
  assert.deepEqual(findOrphanBoards(boards, projects, { now: NOW }), ['b2']);
});

// ---------------------------------------------------------------------------
// 备份档
// ---------------------------------------------------------------------------

test('资料夹里的文件名：项目名 + id 尾巴；改了名也认得出是同一个项目', () => {
  const p = { id: 'p-lx3k2a-q9z7w', name: 'Muar · Mr Lau', info: {} };
  const name = folderFileName(p);
  assert.equal(idTail(p.id), 'aq9z7w');
  assert.equal(name, 'Muar · Mr Lau · aq9z7w.blueprint.zip');
  const renamed = folderFileName({ ...p, name: 'Muar / Mr Lau 第二版' });
  assert.notEqual(renamed, name);
  assert.equal(tailOfFileName(renamed), tailOfFileName(name));
  assert.equal(tailOfFileName('Material Board · 画板与材质库.blueprint.zip'), null, 'Material Board 那份不是项目');
  assert.equal(tailOfFileName('随便一个.zip'), null);
  assert.match(folderFileName({ id: 'p-1', name: '', info: { location: 'Puchong', client: 'Mr Tan' } }), /^Puchong · Mr Tan · /);
});

test('项目备份带着备份时间（恢复时比较「这台电脑上的比较新」）', () => {
  const p = { id: 'p1', name: 'X', slides: [] };
  const { manifest } = buildBundleManifest(p, [], { now: NOW });
  assert.equal(parseBundleManifest(JSON.stringify(manifest)).exportedAt, NOW);
  assert.equal(parseBundleManifest(JSON.stringify({ ...manifest, exportedAt: undefined })).exportedAt, 0, '很旧的备份没写时间也能恢复');
});

test('全部备份 / Material Board 备份的索引：认得出、认不出就说清楚', () => {
  const idx = parseAllIndex(JSON.stringify({ format: ALL_FORMAT, version: 1, exportedAt: new Date(NOW).toISOString(), projects: [{ id: 'p1', name: 'A', file: 'projects/a.zip', updatedAt: 5 }, { id: 'p2' }], boards: 'material-board.blueprint.zip' }));
  assert.equal(idx.exportedAt, NOW);
  assert.deepEqual(idx.projects, [{ id: 'p1', name: 'A', file: 'projects/a.zip', updatedAt: 5 }], '没有文件的那条丢掉');
  assert.equal(idx.boards, 'material-board.blueprint.zip');
  assert.throws(() => parseAllIndex('{'), /JSON/);
  assert.throws(() => parseAllIndex(JSON.stringify({ format: 'x', projects: [] })), /不是/);
  assert.throws(() => parseAllIndex(JSON.stringify({ format: ALL_FORMAT, version: 2, projects: [] })), /更新版本/);
  assert.equal(parseBoardsIndex(JSON.stringify({ format: BOARDS_FORMAT, exportedAt: new Date(NOW).toISOString() })).exportedAt, NOW);
  assert.throws(() => parseBoardsIndex(JSON.stringify({ format: 'nope' })), /Material Board/);
});

test('恢复 Material Board 备份：同一块画板这里比较新就不动；材质库只加没有的', () => {
  const here = [{ id: 'b1', ts: 200 }, { id: 'b2', ts: 100 }];
  const incoming = [{ id: 'b1', ts: 150 }, { id: 'b2', ts: 300 }, { id: 'b3', ts: 50 }, { ts: 1 }];
  const { put, skip } = planBoardsMerge(here, incoming);
  assert.deepEqual(put.map((b) => b.id), ['b2', 'b3']);
  assert.equal(skip, 1);
  const lib = newLibraryItems([{ id: 'm1' }], [{ id: 'm1', dataUrl: 'd' }, { id: 'm2', dataUrl: 'd' }, { id: 'm3' }]);
  assert.deepEqual(lib.map((x) => x.id), ['m2']);
  assert.equal(boardsChangedAtOf([{ ts: 5, items: [{}], shots: [{ ts: 9 }] }, { ts: 7, items: [{}] }], [{ ts: 8 }]), 9);
  assert.equal(boardsChangedAtOf([{ ts: 20, items: [] }], [{ ts: 8 }]), 8, '空画板不算（打开 Material Board 自动建的那块）');
  assert.equal(boardsChangedAtOf([], []), 0);
});

// ---------------------------------------------------------------------------
// 导入可以取消
// ---------------------------------------------------------------------------

test('导入 PDF 可以取消：做完手上这一页就停，抛 AbortError（没有往下读）', async () => {
  let opened = 0;
  let destroyed = false;
  const page = () => ({
    getViewport: () => ({ width: 100, height: 100, transform: [1, 0, 0, -1, 0, 100] }),
    getTextContent: async () => ({ items: [] }),
    getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
    cleanup: () => {},
  });
  const pdfjs = {
    OPS: {},
    Util: { applyTransform: (p) => p },
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 10,
        getMetadata: async () => ({ info: {} }),
        getPage: async () => {
          opened += 1;
          return page();
        },
        destroy: async () => {
          destroyed = true;
        },
      }),
    }),
  };
  const ctrl = new AbortController();
  await assert.rejects(
    extractPdf(pdfjs, new Uint8Array(4), {
      signal: ctrl.signal,
      onProgress: (_s, n) => {
        if (n === 2) ctrl.abort(); // 读完第 2 页时按了「取消」
      },
    }),
    (e) => e.name === 'AbortError'
  );
  assert.equal(opened, 2, '第 3 页起没再读');
  assert.equal(destroyed, true, 'pdf.js 的文件照样关掉');
  // 不取消：10 页都读完
  opened = 0;
  const r = await extractPdf(pdfjs, new Uint8Array(4), {});
  assert.equal(r.pages.length, 10);
});
