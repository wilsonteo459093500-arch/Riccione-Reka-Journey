// OBJ + MTL（SPEC §4.7）：给 3ds Max / Blender / D5 / Lumion / 酷家乐模型上传用。OBJ 的习惯是 Y 向上：(X, Z, −Y)。
// OBJ 没有实例：组件按每个实例的位置展开；三角形数和 DAE 的场景一样。不写法线（导入的软件自己算平面法线）。

import { walk, apply } from './model3d.js';
import { f4, materialName } from './dae.js';
import { SAIL_LINE } from './names.js';
import { BRAND } from '../../shared/config.js';

/**
 * @returns {{ obj: string, mtl: string, tris: number }}
 */
export function obj(model, { base = 'WISH', title = '' } = {}) {
  const L = [];
  L.push(`# ${BRAND.full} · ${SAIL_LINE} — ${title.replace(/[\r\n]+/g, ' ') || 'WISH'} — metres, Y up, origin = lower-left outer corner`);
  L.push(`mtllib ${base}_3D.mtl`);
  let vBase = 1;
  let tris = 0;
  const comps = new Map([...model.comps.values()].map((c) => [c.id, c]));
  walk(model.root, (n, M) => {
    const gid = n.geom || (n.inst && comps.get(n.inst)?.geom);
    if (!gid) return;
    const mesh = model.geoms.get(gid);
    if (!mesh || mesh.empty) return;
    const name = (n.objName || gid).replace(/[^A-Za-z0-9_.-]/g, '_');
    L.push(`# ${n.name.replace(/[\r\n]+/g, ' ')}`);
    L.push(`o ${name}`);
    L.push(`g ${name}`);
    const vk = new Map();
    const vs = [];
    const faces = [];
    for (const [sym, g] of mesh.groups) {
      const f = [];
      for (let i = 0; i < g.length; i += 3) {
        const [x, y, z] = apply(M, g[i], g[i + 1], g[i + 2]);
        const k = `${f4(x)} ${f4(z)} ${f4(-y)}`;
        let id = vk.get(k);
        if (id === undefined) {
          id = vs.length;
          vk.set(k, id);
          vs.push(k);
        }
        f.push(vBase + id);
      }
      faces.push([sym, f]);
    }
    for (const v of vs) L.push(`v ${v}`);
    for (const [sym, f] of faces) {
      L.push(`usemtl ${sym === undefined ? 'default' : symName(model, sym)}`);
      L.push('s off');
      for (let i = 0; i < f.length; i += 3) {
        L.push(`f ${f[i]} ${f[i + 1]} ${f[i + 2]}`);
        tris++;
      }
    }
    vBase += vs.length;
  });
  const M = [];
  M.push(`# ${BRAND.full} · ${SAIL_LINE} — materials (plain colours, named after our material ids)`);
  for (const m of model.materials) {
    const n = parseInt(String(m.hex).replace('#', ''), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f4(v / 255)).join(' ');
    M.push('');
    M.push(`newmtl ${symName(model, m.sym)}`);
    M.push(`# ${m.fixed ? m.zh : `${m.slotZh} · ${m.zh} · ${m.en}${m.sourced ? ` · ${m.slotEn}` : ''}`}`.replace(/[\r\n]+/g, ' '));
    M.push(`Kd ${c}`);
    M.push('Ka 0 0 0');
    M.push('Ks 0.04 0.04 0.04');
    M.push('Ns 20');
    if (m.opacity < 1) {
      M.push(`d ${f4(m.opacity)}`);
      M.push(`Tr ${f4(1 - m.opacity)}`);
    } else M.push('d 1');
    M.push('illum 2');
  }
  return { obj: L.join('\n') + '\n', mtl: M.join('\n') + '\n', tris };
}

/** OBJ / MTL 里的材质名（ASCII，没有空格）：cabinetry__white-lacquer、fixed__glass */
function symName(model, sym) {
  const m = model.materials.find((x) => x.sym === sym);
  if (!m) return sym;
  return materialName(m).split(' ')[0];
}
