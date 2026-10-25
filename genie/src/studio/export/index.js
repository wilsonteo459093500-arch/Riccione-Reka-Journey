// 导出给设计师（只在设计师版）：一个 zip（不压缩），里面是 AutoCAD 平面图、酷家乐户型（每层一个）、SketchUp 3D（DAE + OBJ/MTL）、
// 中英 README 和清单 CSV。全部在这台设备上用内存里的方案算出来：不联网、不读客人档案、不改方案。
// 许愿模式（客人在展厅 iPad 上）永远不导出：这里直接报错（面板那边也拦着）。
//
//   exportBundle(project, { name, dxf, kujiale, model3d, brief, now, onProgress }) → { blob, bytes, name, base, files, stats }
//   name：面板上「文件包名称」那一栏（客人名或地址）；图名、README、文件名都用它，不改方案。没传 → defaultPackName(project)；
//   空的 → 文件名用 project-<id>（模板名、「新方案」不拿来当名字：读进别的户型以后它们就不对了）
//   onProgress({ done, total, label, vars })：label 是中文句子（面板用 t(label, vars) 翻）

import { isWishMode } from '../../shared/zen.js';
import { buildScene } from './scene.js';
import { planBegin, planFloor } from './plan.js';
import { model3d as buildModel } from './model3d.js';
import { dae } from './dae.js';
import { obj as objWriter } from './obj.js';
import { zip } from './zip.js';
import { readme, scheduleCsv, textBytes } from './readme.js';
import { designerBrief } from './brief.js';
import { exportBase, packName, both } from './names.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const utf8 = (s) => new TextEncoder().encode(s);

export async function exportBundle(project, { name, dxf = true, kujiale = true, model3d = true, brief = null, now = new Date(), onProgress = null } = {}) {
  if (isWishMode()) throw new Error('export: wish mode');
  if (!project?.plan) throw new Error('export: no plan');
  if (!dxf && !kujiale && !model3d) throw new Error('export: nothing selected');
  const t0 = Date.now();
  const label = packName(project, name);
  const scene = buildScene(project, { now, name: label });
  const base = exportBase(project, now, label);
  const nF = scene.floors.length;
  const total = (dxf ? nF : 0) + (kujiale ? nF : 0) + (model3d ? 4 : 0) + 2;
  let done = 0;
  const step = async (label, vars) => {
    onProgress?.({ done, total, label, vars });
    await tick();
  };
  const finish = () => {
    done++;
  };
  const files = [];
  const add = (name, bytes) => files.push({ name, bytes });

  if (dxf) {
    const D = planBegin('full');
    for (const F of scene.floors) {
      await step('正在画{0}的平面…', [F.name]);
      planFloor(D, scene, F, 'full');
      finish();
    }
    add(`${base}_plan_all-floors.dxf`, D.bytes());
  }
  if (kujiale) {
    for (const F of scene.floors) {
      await step('正在画{0}的酷家乐户型…', [F.name]);
      const K = planBegin('kujiale');
      planFloor(K, scene, F, 'kujiale');
      add(`${base}_${F.code}_kujiale.dxf`, K.bytes());
      finish();
    }
  }
  let model = null;
  let objTris = 0;
  if (model3d) {
    await step('正在建 3D 墙体…');
    finish();
    await step('正在放柜子和家具…');
    model = buildModel(scene);
    finish();
    const title = both(scene.name, ' / ');
    await step('正在写 SketchUp 文件…');
    add(`${base}_3D.dae`, utf8(dae(model, { now, title })));
    finish();
    await step('正在写 SketchUp 文件…');
    const o = objWriter(model, { base, title });
    objTris = o.tris;
    add(`${base}_3D.obj`, utf8(o.obj));
    add(`${base}_3D.mtl`, utf8(o.mtl));
    finish();
  }
  await step('正在打包…');
  const b = brief || designerBrief(project, scene);
  const names = [...files.map((f) => f.name), 'README.txt', `${base}_schedule.csv`];
  const readmeText = readme(b, { files: names, base, dxf, kujiale, model3d });
  files.unshift({ name: `${base}_schedule.csv`, bytes: textBytes(scheduleCsv(b)) });
  files.unshift({ name: 'README.txt', bytes: textBytes(readmeText) });
  finish();
  await step('正在打包…');
  const entries = files.map((f) => ({ name: `${base}/${f.name}`, bytes: f.bytes }));
  const bytes = zip(entries, now);
  finish();
  onProgress?.({ done, total, label: '', vars: null });
  const blob = typeof Blob !== 'undefined' ? new Blob([bytes], { type: 'application/zip' }) : null;
  return {
    blob,
    bytes,
    name: `${base}.zip`,
    base,
    files: files.map((f) => ({ name: f.name, bytes: f.bytes.length })),
    entries,
    stats: {
      ms: Date.now() - t0,
      floors: nF,
      items: scene.stats.items,
      skipped: scene.stats.skipped,
      rooms: scene.stats.rooms,
      openings: scene.stats.openings,
      tris: model?.stats.tris || 0,
      objTris,
      components: model?.stats.components || 0,
      instances: model?.stats.instances || 0,
      maxComponentTris: model ? Math.max(0, ...Object.values(model.stats.perComponent)) : 0,
    },
  };
}
