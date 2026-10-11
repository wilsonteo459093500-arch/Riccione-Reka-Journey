// 几何小工具：按「米」铺 UV（所以贴图比例是真的）、带缓存的圆角盒子、常用网格。

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 按顶点所在面的朝向，用局部坐标（米）当 UV：顶面 (x,z)、侧面 (z,y)、正面 (x,y) */
export function worldUV(geo) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (ay >= ax && ay >= az) uv.setXY(i, x, z);
    else if (ax >= az) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
  return geo;
}

const cache = new Map();

/** 盒子几何（底面中心为原点，向上长）—— 缓存共享 */
export function boxGeo(w, h, d, r = 0) {
  const key = `b${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}`;
  let g = cache.get(key);
  if (!g) {
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    g = rr > 0.002 ? new RoundedBoxGeometry(w, h, d, 3, rr) : new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    worldUV(g);
    g.userData.cached = true;
    cache.set(key, g);
  }
  return g;
}

export function cylGeo(rt, rb, h, seg = 24, open = false) {
  const key = `c${rt.toFixed(3)}|${rb.toFixed(3)}|${h.toFixed(3)}|${seg}|${open}`;
  let g = cache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
    g.translate(0, h / 2, 0);
    worldUV(g);
    g.userData.cached = true;
    cache.set(key, g);
  }
  return g;
}

export function sphereGeo(r, seg = 16) {
  const key = `s${r.toFixed(3)}|${seg}`;
  let g = cache.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2));
    worldUV(g);
    g.userData.cached = true;
    cache.set(key, g);
  }
  return g;
}

/** 合并多个已摆好的几何成一个（书本、百叶这种很多小件的东西，减少 draw call） */
export function merge(geos) {
  const g = mergeGeometries(geos, false);
  geos.forEach((x) => x.dispose());
  return g;
}

/** 摆好位置的盒子几何（非缓存，用来合并） */
export function placedBox(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  worldUV(g);
  if (color) {
    const c = new THREE.Color(color);
    const arr = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = c.r;
      arr[i + 1] = c.g;
      arr[i + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return g;
}

/** 窗帘：有褶皱的竖向面片 */
export function curtainGeo(w, h, folds = 6, depth = 0.05) {
  const key = `cur${w.toFixed(2)}|${h.toFixed(2)}|${folds}`;
  let g = cache.get(key);
  if (!g) {
    g = new THREE.PlaneGeometry(w, h, folds * 6, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setZ(i, Math.sin(((x + w / 2) / w) * Math.PI * 2 * folds) * depth * 0.5);
    }
    g.translate(0, h / 2, 0);
    g.computeVertexNormals();
    worldUV(g);
    g.userData.cached = true;
    cache.set(key, g);
  }
  return g;
}

export function disposeCache() {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
