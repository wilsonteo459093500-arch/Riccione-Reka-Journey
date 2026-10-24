// COLLADA 1.4.1 写出器（SPEC §4.6）：Z 向上、米；SketchUp「文件 › 导入 › COLLADA」原生支持，不用转轴，和 DXF 同一个原点。
// 重复的家具 / 门窗写在 <library_nodes>（SketchUp → 组件定义），场景里用 <instance_node>（→ 组件实例）。
// 每个几何体：位置、法线各一个 source（去重），每种材质一个 <triangles>。材质只有漫反射颜色（sRGB，不做线性化）。

import { boardCode } from './catalog.js';
import { BRAND } from '../../shared/config.js';
import { SAIL_LINE } from './names.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function f4(v) {
  if (!Number.isFinite(v)) throw new Error(`dae: bad number ${v}`);
  let s = (Math.round(v * 1e4) / 1e4).toFixed(4).replace(/\.?0+$/, '');
  if (s === '-0' || s === '') s = '0';
  return s;
}

const rgb = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f4(v / 255)).join(' ');
};

/**
 * 材质在文件里的名字：cabinetry__white-lacquer 柜体·白色烤漆；固定材质：fixed__glass 玻璃；
 * 外购的台面：countertop__quartz-travertine 台面·外购·石英石·洞石纹（slotZh 已经是「台面·外购」）。
 * 以后有 sAil 板材编号（catalog.js BOARD_CODE）就接在后面；外购的表面不接。
 */
export function materialName(m) {
  if (m.fixed) return `${m.sym} ${m.zh}`;
  const code = boardCode(m.sym, m.id);
  return `${m.sym}__${m.id} ${m.slotZh}·${m.zh}${code ? ` ${code}` : ''}`;
}

/** 一个网格 → 去重后的位置 / 法线 + 每种材质的索引 */
export function indexMesh(mesh) {
  const pos = [];
  const nor = [];
  const pk = new Map();
  const nk = new Map();
  const groups = [];
  const vid = (x, y, z) => {
    const k = `${f4(x)} ${f4(y)} ${f4(z)}`;
    let i = pk.get(k);
    if (i === undefined) {
      i = pos.length;
      pk.set(k, i);
      pos.push(k);
    }
    return i;
  };
  const nid = (x, y, z) => {
    const k = `${f4(x)} ${f4(y)} ${f4(z)}`;
    let i = nk.get(k);
    if (i === undefined) {
      i = nor.length;
      nk.set(k, i);
      nor.push(k);
    }
    return i;
  };
  for (const [sym, g] of mesh.groups) {
    const p = [];
    for (let i = 0; i < g.length; i += 9) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = g.slice(i, i + 9);
      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const vx = cx - ax;
      const vy = cy - ay;
      const vz = cz - az;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const L = Math.hypot(nx, ny, nz) || 1;
      nx /= L;
      ny /= L;
      nz /= L;
      const n = nid(nx, ny, nz);
      p.push(vid(ax, ay, az), n, vid(bx, by, bz), n, vid(cx, cy, cz), n);
    }
    groups.push({ sym, p, count: p.length / 6 });
  }
  return { pos, nor, groups };
}

const bind = (syms) => `<bind_material><technique_common>${syms.map((s) => `<instance_material symbol="${esc(s)}" target="#m-${esc(s)}"/>`).join('')}</technique_common></bind_material>`;

/**
 * @param {object} model model3d() 的结果
 * @param {{ now: Date, title: string }} o
 * @returns {string} XML（UTF-8，没有 BOM）
 */
export function dae(model, { now = new Date(), title = 'WISH' } = {}) {
  const iso = new Date(now).toISOString().replace(/\.\d+Z$/, 'Z');
  const out = [];
  out.push('<?xml version="1.0" encoding="utf-8"?>');
  out.push('<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">');
  out.push(`<asset><contributor><authoring_tool>${esc(`${BRAND.full} · ${SAIL_LINE}`)}</authoring_tool></contributor><created>${iso}</created><modified>${iso}</modified><unit name="meter" meter="1"/><up_axis>Z_UP</up_axis></asset>`);
  out.push('<library_effects>');
  for (const m of model.materials) {
    const glass = m.opacity < 1;
    const tr = glass ? `<transparent opaque="A_ONE"><color>1 1 1 1</color></transparent><transparency><float>${f4(m.opacity)}</float></transparency>` : '';
    out.push(`<effect id="e-${esc(m.sym)}"><profile_COMMON><technique sid="common"><lambert><diffuse><color>${rgb(m.hex)} 1</color></diffuse>${tr}</lambert></technique></profile_COMMON></effect>`);
  }
  out.push('</library_effects>');
  out.push('<library_materials>');
  for (const m of model.materials) out.push(`<material id="m-${esc(m.sym)}" name="${esc(materialName(m))}"><instance_effect url="#e-${esc(m.sym)}"/></material>`);
  out.push('</library_materials>');
  out.push('<library_geometries>');
  const syms = new Map();
  for (const [gid, mesh] of model.geoms) {
    const { pos, nor, groups } = indexMesh(mesh);
    syms.set(gid, groups.map((g) => g.sym));
    const src = (sid, arr) => `<source id="${sid}"><float_array id="${sid}-a" count="${arr.length * 3}">${arr.join(' ')}</float_array><technique_common><accessor source="#${sid}-a" count="${arr.length}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>`;
    const tri = groups.map((g) => `<triangles material="${esc(g.sym)}" count="${g.count}"><input semantic="VERTEX" source="#${gid}-v" offset="0"/><input semantic="NORMAL" source="#${gid}-n" offset="1"/><p>${g.p.join(' ')}</p></triangles>`).join('');
    out.push(`<geometry id="${gid}" name="${gid}"><mesh>${src(`${gid}-p`, pos)}${src(`${gid}-n`, nor)}<vertices id="${gid}-v"><input semantic="POSITION" source="#${gid}-p"/></vertices>${tri}</mesh></geometry>`);
  }
  out.push('</library_geometries>');
  out.push('<library_nodes>');
  for (const c of model.comps.values()) out.push(`<node id="${c.id}" name="${esc(c.name)}"><instance_geometry url="#${c.geom}">${bind(syms.get(c.geom) || [])}</instance_geometry></node>`);
  out.push('</library_nodes>');
  const node = (n) => {
    const parts = [`<node id="${esc(n.id)}" name="${esc(n.name)}">`];
    if (n.translate) parts.push(`<translate>${n.translate.map(f4).join(' ')}</translate>`);
    if (n.rotate) parts.push(`<rotate>0 0 1 ${f4(n.rotate)}</rotate>`);
    if (n.geom) parts.push(`<instance_geometry url="#${n.geom}">${bind(syms.get(n.geom) || [])}</instance_geometry>`);
    if (n.inst) parts.push(`<instance_node url="#${n.inst}"/>`);
    for (const c of n.children || []) parts.push(node(c));
    parts.push('</node>');
    return parts.join('');
  };
  out.push(`<library_visual_scenes><visual_scene id="scene" name="${esc(title)}">`);
  out.push(node(model.root));
  out.push('</visual_scene></library_visual_scenes>');
  out.push('<scene><instance_visual_scene url="#scene"/></scene>');
  out.push('</COLLADA>');
  return out.join('\n') + '\n';
}
