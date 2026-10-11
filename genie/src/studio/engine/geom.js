// 几何小工具：按「米」铺 UV（所以贴图比例是真的）、带缓存的圆角盒子、常用网格。
// 家具用的「软」几何也在这里：鼓起的软垫、抱枕、圆角台面（可开孔）、旋转体（花瓶 / 灯罩 / 盆）、
// 锥形脚、弯管、叶片、自然褶皱的窗帘、会垂下来的被子。全部按参数缓存（同尺寸的家具共用一份几何）。

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
const f3 = (v) => (+v).toFixed(3);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function cached(key, make) {
  let g = cache.get(key);
  if (!g) {
    g = make();
    g.userData.cached = true;
    cache.set(key, g);
  }
  return g;
}

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

/** 摆好位置的盒子几何（非缓存，用来合并）；rz / ry：绕自身底面中心转（斜靠的书） */
export function placedBox(w, h, d, x, y, z, color, { rz = 0, ry = 0, rx = 0 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
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

/**
 * 法线平滑：同一位置（不同 UV 面）的顶点，法线夹角小于 angle° 的取平均 ——
 * 软垫、被子这种按面分开 UV 的几何，接缝处不会出折痕；真正的硬边（大于 angle）保留。
 */
export function smoothNormals(geo, angle = 80) {
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const src = nor.array.slice();
  const out = nor.array;
  const cosA = Math.cos((angle * Math.PI) / 180);
  const groups = new Map();
  const q = (v) => Math.round(v * 2e4);
  for (let i = 0; i < pos.count; i++) {
    const k = `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`;
    const a = groups.get(k);
    if (a) a.push(i);
    else groups.set(k, [i]);
  }
  for (const ids of groups.values()) {
    if (ids.length < 2) {
      const i = ids[0];
      if (Math.hypot(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]) < 1e-6) out[i * 3 + 1] = 1;
      continue;
    }
    for (const i of ids) {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      const ax = src[i * 3];
      const ay = src[i * 3 + 1];
      const az = src[i * 3 + 2];
      for (const j of ids) {
        const bx = src[j * 3];
        const by = src[j * 3 + 1];
        const bz = src[j * 3 + 2];
        if (ax * bx + ay * by + az * bz >= cosA) {
          sx += bx;
          sy += by;
          sz += bz;
        }
      }
      let l = Math.hypot(sx, sy, sz);
      if (l < 1e-6) {
        // 退化三角形（零面积）上的顶点：取同一位置所有法线的平均，再不行就朝上
        sx = sy = sz = 0;
        for (const j of ids) {
          sx += src[j * 3];
          sy += src[j * 3 + 1];
          sz += src[j * 3 + 2];
        }
        l = Math.hypot(sx, sy, sz);
        if (l < 1e-6) {
          sx = 0;
          sy = 1;
          sz = 0;
          l = 1;
        }
      }
      out[i * 3] = sx / l;
      out[i * 3 + 1] = sy / l;
      out[i * 3 + 2] = sz / l;
    }
  }
  nor.needsUpdate = true;
  return geo;
}

/** 法线归一化（LatheGeometry 最后一个点的法线没有归一化；零向量改成朝上） */
function unitNormals(geo) {
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i);
    const y = n.getY(i);
    const z = n.getZ(i);
    const l = Math.hypot(x, y, z);
    if (l < 1e-6) n.setXYZ(i, 0, 1, 0);
    else n.setXYZ(i, x / l, y / l, z / l);
  }
  n.needsUpdate = true;
  return geo;
}

/** 按「原始面的朝向」铺米制 UV（变形后的软几何用：同一面上 UV 连续，不会在圆角处拉花） */
function faceUV(geo, nor0) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor0[i * 3]);
    const ay = Math.abs(nor0[i * 3 + 1]);
    const az = Math.abs(nor0[i * 3 + 2]);
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (ay >= ax && ay >= az) uv.setXY(i, x, z);
    else if (ax >= az) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
}

/**
 * 软垫：圆角盒子，面中间微微鼓起（底面中心为原点）。
 * r 圆角；cx 左右两面鼓起；cy 顶面隆起、cyb 底面；cz 正面、czb 背面（米）；rs 圆角分段；seg 中间分段长度
 */
export function softBoxGeo(w, h, d, { r = 0.04, cx = 0, cy = 0, cyb = 0, cz = 0, czb, rs = 3, seg = 0.08 } = {}) {
  const czB = czb === undefined ? cz : czb;
  const key = `sb${f3(w)}|${f3(h)}|${f3(d)}|${f3(r)}|${f3(cx)}|${f3(cy)}|${f3(cyb)}|${f3(cz)}|${f3(czB)}|${rs}|${f3(seg)}`;
  return cached(key, () => {
    const H = [w / 2, h / 2, d / 2];
    const R = Math.max(0.0008, Math.min(r, H[0] * 0.98, H[1] * 0.98, H[2] * 0.98));
    const ins = H.map((hh) => Math.max(1, Math.ceil((hh - R) / seg)));
    const g = new THREE.BoxGeometry(2, 2, 2, 2 * (ins[0] + rs), 2 * (ins[1] + rs), 2 * (ins[2] + rs));
    const p = g.attributes.position;
    const nor0 = g.attributes.normal.array.slice();
    const axis = (t, a) => {
      const k = t * (ins[a] + rs);
      const m = Math.abs(k);
      const v = m <= ins[a] + 1e-6 ? (m / ins[a]) * (H[a] - R) : H[a] - R + ((m - ins[a]) / rs) * R;
      return Math.sign(k) * v;
    };
    const bump = (a, c) => Math.max(0, 1 - a * a) * Math.max(0, 1 - c * c);
    for (let i = 0; i < p.count; i++) {
      let x = axis(p.getX(i), 0);
      let y = axis(p.getY(i), 1);
      let z = axis(p.getZ(i), 2);
      const ix = clamp(x, -(H[0] - R), H[0] - R);
      const iy = clamp(y, -(H[1] - R), H[1] - R);
      const iz = clamp(z, -(H[2] - R), H[2] - R);
      const dx = x - ix;
      const dy = y - iy;
      const dz = z - iz;
      const l = Math.hypot(dx, dy, dz);
      if (l > 1e-9) {
        x = ix + (dx / l) * R;
        y = iy + (dy / l) * R;
        z = iz + (dz / l) * R;
      }
      const u = x / H[0];
      const v = y / H[1];
      const t = z / H[2];
      const nx = x + (cx ? cx * bump(v, t) * u : 0);
      const ny = y + (v > 0 ? cy : cyb) * bump(u, t) * v;
      const nz = z + (t > 0 ? cz : czB) * bump(u, v) * t;
      p.setXYZ(i, nx, ny + H[1], nz);
    }
    faceUV(g, nor0);
    smoothNormals(g, 80);
    return g;
  });
}

/** 抱枕 / 枕头：立着的「刀边枕」，中间鼓、四角薄（底边中点为原点；w 宽、h 高、t 厚） */
export function pillowGeo(w, h, t, { pinch = 0.06, ear = 0.55, n = 12 } = {}) {
  const key = `pw${f3(w)}|${f3(h)}|${f3(t)}|${f3(pinch)}|${f3(ear)}|${n}`;
  return cached(key, () => {
    const side = (back) => {
      const g = new THREE.PlaneGeometry(2, 2, n, n);
      if (back) g.rotateY(Math.PI);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        // 网格往边上加密（边上鼓起得快）
        const su = p.getX(i);
        const sv = p.getY(i);
        const u = Math.sign(su) * (1 - Math.pow(1 - Math.abs(su), 1.6));
        const v = Math.sign(sv) * (1 - Math.pow(1 - Math.abs(sv), 1.6));
        const zz = (t / 2) * Math.pow(Math.max(0, (1 - u * u) * (1 - v * v)), ear);
        const x = u * (w / 2) * (1 - pinch * (1 - v * v));
        const y = v * (h / 2) * (1 - pinch * (1 - u * u));
        p.setXYZ(i, x, y + h / 2, back ? -zz : zz);
      }
      return g;
    };
    const a = side(false);
    const b = side(true);
    const g = mergeGeometries([a, b], false);
    a.dispose();
    b.dispose();
    const uv = g.attributes.uv;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getY(i));
    smoothNormals(g, 75);
    return g;
  });
}

function roundRectPath(path, w, d, r, cx = 0, cy = 0) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - d / 2;
  const y1 = cy + d / 2;
  const rr = Math.max(0, Math.min(r, w / 2 - 0.0005, d / 2 - 0.0005));
  if (rr < 0.0008) {
    path.moveTo(x0, y0);
    path.lineTo(x1, y0);
    path.lineTo(x1, y1);
    path.lineTo(x0, y1);
    path.lineTo(x0, y0);
    return path;
  }
  path.moveTo(x0 + rr, y0);
  path.lineTo(x1 - rr, y0);
  path.absarc(x1 - rr, y0 + rr, rr, -Math.PI / 2, 0, false);
  path.lineTo(x1, y1 - rr);
  path.absarc(x1 - rr, y1 - rr, rr, 0, Math.PI / 2, false);
  path.lineTo(x0 + rr, y1);
  path.absarc(x0 + rr, y1 - rr, rr, Math.PI / 2, Math.PI, false);
  path.lineTo(x0, y0 + rr);
  path.absarc(x0 + rr, y0 + rr, rr, Math.PI, Math.PI * 1.5, false);
  return path;
}

/**
 * 板：圆角矩形（平面上的四角 r）、上下边倒角 bevel、可开一个圆角矩形孔（台盆）。底面在 y=0，中心在原点。
 * hole = { x, z, w, d, r }
 */
export function slabGeo(w, d, t, { r = 0, bevel = 0.003, hole = null, seg = 6 } = {}) {
  const hk = hole ? `${f3(hole.x || 0)},${f3(hole.z || 0)},${f3(hole.w)},${f3(hole.d)},${f3(hole.r || 0)}` : '';
  const key = `sl${f3(w)}|${f3(d)}|${f3(t)}|${f3(r)}|${f3(bevel)}|${hk}|${seg}`;
  return cached(key, () => {
    const shape = roundRectPath(new THREE.Shape(), w, d, r);
    if (hole) shape.holes.push(roundRectPath(new THREE.Path(), hole.w, hole.d, hole.r || 0, hole.x || 0, -(hole.z || 0)));
    const b = Math.max(0, Math.min(bevel, t / 2 - 0.0004, r > 0 ? r : 1));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.0004, t - 2 * b),
      bevelEnabled: b > 0.0004,
      bevelThickness: b,
      bevelSize: b,
      bevelOffset: -b,
      bevelSegments: 2,
      curveSegments: seg,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, b, 0);
    unitNormals(g);
    worldUV(g);
    return g;
  });
}

/** 旋转体：profile = [[r, y], …]（从底部中心往外、往上；重复一个点 = 硬边） */
export function latheGeo(profile, seg = 32, { phi = Math.PI * 2 } = {}) {
  const key = `l${seg}|${f3(phi)}|${profile.map(([r, y]) => `${f3(r)},${f3(y)}`).join(';')}`;
  return cached(key, () => {
    const g = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)),
      seg,
      0,
      phi
    );
    unitNormals(g);
    worldUV(g);
    return g;
  });
}

/** 锥形方脚：底 wb×db、顶 wt×dt、高 h（底面中心为原点） */
export function taperBoxGeo(wb, db, wt, dt, h) {
  const key = `tb${f3(wb)}|${f3(db)}|${f3(wt)}|${f3(dt)}|${f3(h)}`;
  return cached(key, () => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = p.getY(i) + 0.5;
      p.setXYZ(i, p.getX(i) * (wb + (wt - wb) * k), k * h, p.getZ(i) * (db + (dt - db) * k));
    }
    g.computeVertexNormals();
    worldUV(g);
    return g;
  });
}

/** 弯管（水龙头、灯臂、花茎）：pts = [[x,y,z], …] 经过的点 */
export function tubeGeo(pts, radius, { seg = 24, radial = 8, closed = false } = {}) {
  const key = `tu${f3(radius)}|${seg}|${radial}|${closed}|${pts.map((p) => p.map(f3).join(',')).join(';')}`;
  return cached(key, () => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), closed, 'centripetal');
    const g = new THREE.TubeGeometry(curve, seg, radius, radial, closed);
    worldUV(g);
    return g;
  });
}

/** 环（圆环 / 脚踏圈 / 炉架） */
export function torusGeo(R, r, seg = 32, radial = 8, arc = Math.PI * 2) {
  const key = `to${f3(R)}|${f3(r)}|${seg}|${radial}|${f3(arc)}`;
  return cached(key, () => {
    const g = new THREE.TorusGeometry(R, r, radial, seg, arc);
    worldUV(g);
    return g;
  });
}

// ───────────────────────── 叶片 ─────────────────────────

const LEAF = {
  // 宽度轮廓（s: 0 叶柄 → 1 叶尖，返回半宽 / 叶长）
  fig: (s) => 0.4 * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.72)), 0.85) * (0.62 + 0.45 * s),
  paddle: (s) => 0.2 * Math.pow(Math.sin(Math.PI * s), 0.55),
  lance: (s) => 0.11 * Math.pow(Math.sin(Math.PI * s), 0.8),
  olive: (s) => 0.085 * Math.pow(Math.sin(Math.PI * s), 0.75),
  round: (s) => 0.42 * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.85)), 0.7),
  sword: (s) => 0.075 * Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * s)), 0.35) * (1 - 0.35 * s),
};

/**
 * 一片叶子：叶柄在原点，沿 +z 长 1（实例缩放成真实长度），叶面朝 +y；
 * fold 沿主脉对折成 V，curl 叶尖往下弯，wave 叶缘起伏
 */
export function leafGeo(type = 'fig', { fold = 0.12, curl = 0.18, wave = 0, nz = 10, nx = 2 } = {}) {
  const key = `lf${type}|${f3(fold)}|${f3(curl)}|${f3(wave)}|${nz}|${nx}`;
  return cached(key, () => {
    const hw = LEAF[type] || LEAF.fig;
    const cols = nx * 2 + 1;
    const pos = [];
    const idx = [];
    for (let j = 0; j <= nz; j++) {
      const s = j / nz;
      const half = Math.max(hw(s), 0.004);
      for (let i = 0; i < cols; i++) {
        const c = (i - nx) / nx; // -1 … 1
        const x = c * half;
        const y = fold * Math.abs(x) - curl * s * s + wave * Math.sin(s * 19 + c * 2) * Math.abs(c) * half;
        pos.push(x, y, s);
      }
    }
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < cols - 1; i++) {
        const a = j * cols + i;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    unitNormals(g);
    const uv = new Float32Array((pos.length / 3) * 2);
    for (let k = 0; k < pos.length / 3; k++) {
      uv[k * 2] = pos[k * 3];
      uv[k * 2 + 1] = pos[k * 3 + 2];
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  });
}

// ───────────────────────── 窗帘 ─────────────────────────

/**
 * 窗帘：自然的褶（每个褶宽窄、深浅都不一样），顶部褶紧、下摆稍微张开，底边有一道折边，落地处微微外翻。
 * 底面在 y=0，中心在原点，面朝 +z。
 */
export function curtainGeo(w, h, folds = 6, depth = 0.05, seed = 1) {
  const key = `cur${w.toFixed(2)}|${h.toFixed(2)}|${folds}|${f3(depth)}|${seed}`;
  let g = cache.get(key);
  if (g) return g;
  let a = (seed * 9301 + 49297) >>> 0;
  const rnd = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
  const amp = [];
  const ph = [];
  for (let k = 0; k <= folds + 2; k++) {
    amp.push(0.75 + rnd() * 0.5);
    ph.push((rnd() - 0.5) * 0.5);
  }
  const nx = folds * 8;
  // 竖向：顶部、底边附近加密（底边折边上沿 y≈7cm 压一道线）
  const hem = 0.07;
  const rows = [0, 0.012, 0.03, 0.05, hem - 0.008, hem, hem + 0.008, 0.12, 0.2, 0.3, 0.42, 0.55, 0.68, 0.8, 0.9, 0.95, 0.98, 1].map((v) => (v > 0.11 ? v : v / h));
  rows.sort((p, q) => p - q);
  const pos = [];
  const idx = [];
  for (let j = 0; j < rows.length; j++) {
    const v = rows[j];
    const y = v * h;
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const f = u * folds;
      const k = Math.floor(f);
      const fr = f - k;
      // 褶的深浅（每个褶不同），往下稍微张开
      const A = (amp[k] * (1 - fr) + amp[k + 1] * fr) * (0.82 + 0.3 * (1 - v));
      let z = Math.sin(2 * Math.PI * (f + ph[k] * (1 - v))) * depth * 0.5 * A;
      // 顶部褶裥更紧
      if (v > 0.95) z *= 0.7 + 0.3 * (1 - (v - 0.95) / 0.05);
      // 下摆张开 + 落地微翻
      const flare = (1 - v) * (1 - v);
      const x = (u - 0.5) * w * (1 + 0.05 * flare);
      if (y < 0.03) z += 0.012 * (1 - y / 0.03);
      // 底边折边：折边那一段稍微鼓出、上沿压一道
      if (y <= hem + 0.001) z += 0.003;
      if (Math.abs(y - hem) < 0.001) z -= 0.004;
      pos.push(x, y, z);
    }
  }
  const cols = nx + 1;
  for (let j = 0; j < rows.length - 1; j++)
    for (let i = 0; i < nx; i++) {
      const p0 = j * cols + i;
      const p1 = p0 + 1;
      const p2 = p0 + cols;
      const p3 = p2 + 1;
      idx.push(p0, p1, p2, p1, p3, p2);
    }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  worldUV(g);
  g.userData.cached = true;
  cache.set(key, g);
  return g;
}

// ───────────────────────── 变形：弯、垂 ─────────────────────────

/**
 * 沿 x 方向弯成弧（弧心在前方 z = +R）：弧形沙发、弯的椅背。
 * 以 z = zRef 那条线为不伸缩的「中性线」（保证 x 方向不超出原来的宽度）。会就地修改 geo。
 */
export function bendGeo(geo, R, zRef = 0) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const Rb = R - zRef;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const phi = x / Rb;
    const rho = R - z;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    p.setX(i, rho * s);
    p.setZ(i, R - rho * c);
    if (n) {
      const nx = n.getX(i);
      const nz = n.getZ(i);
      n.setX(i, nx * c - nz * s);
      n.setZ(i, nx * s + nz * c);
    }
  }
  p.needsUpdate = true;
  if (n) n.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * 被子 / 毯子垂下：geo 原本平铺在 y = top 之上；超出 |x| > fx 或 z > fz 的部分绕半径 R 的边弯下去，
 * 再竖直垂下（下摆微微外张、有几道波浪褶）。会就地修改 geo。
 */
export function drapeGeo(geo, { fx, fz, top, R = 0.05, T = 0.06, wave = 0.012, waveLen = 0.32, flare = 0.03 }) {
  const p = geo.attributes.position;
  const Rm = R + T / 2;
  const arc = (Math.PI / 2) * Rm;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const ox = Math.abs(x) - fx;
    const oz = z - fz;
    if (ox <= 0 && oz <= 0) continue;
    let dx = 0;
    let dz = 0;
    let s = 0;
    if (ox > 0 && oz > 0) {
      s = Math.hypot(ox, oz);
      dx = (Math.sign(x) * ox) / s;
      dz = oz / s;
    } else if (ox > 0) {
      s = ox;
      dx = Math.sign(x);
    } else {
      s = oz;
      dz = 1;
    }
    const ex = x - dx * s;
    const ez = z - dz * s;
    const o = y - top; // 离床面的高度（厚度方向）
    const rr = R + o;
    let px;
    let py;
    let pz;
    if (s <= arc) {
      const th = s / Rm;
      px = ex + dx * rr * Math.sin(th);
      pz = ez + dz * rr * Math.sin(th);
      py = top - R + rr * Math.cos(th);
    } else {
      const drop = s - arc;
      // 下摆：微微外张 + 沿边的波浪褶（靠近转角渐弱，转角处没有）
      let wv = 0;
      if (dz === 0) wv = Math.sin(z * ((2 * Math.PI) / waveLen)) * Math.min(1, (fz - z) / 0.18);
      else if (dx === 0) wv = Math.sin(x * ((2 * Math.PI) / waveLen)) * Math.min(1, (fx - Math.abs(x)) / 0.18);
      const out = rr + flare * Math.min(1, drop / 0.2) ** 2 + wave * wv * Math.min(1, drop / 0.12);
      px = ex + dx * out;
      pz = ez + dz * out;
      py = top - R - drop;
    }
    p.setXYZ(i, px, py, pz);
  }
  p.needsUpdate = true;
  smoothNormals(geo, 70);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/** 已缓存的几何上做一次变形 → 另存一份缓存（同参数的床、同尺寸的弧形沙发共用） */
export function derived(key, base, fn) {
  return cached(`dv${key}`, () => {
    const g = base.clone();
    g.userData = {};
    fn(g);
    return g;
  });
}

/** 竖向凹槽（拱形 / 圆槽）门板：w 宽、h 高、t 厚、pitch 槽距；底面中心为原点，凹凸朝 +z */
export function flutedGeo(w, h, t, pitch = 0.025) {
  const key = `fl${f3(w)}|${f3(h)}|${f3(t)}|${f3(pitch)}`;
  return cached(key, () => {
    const n = Math.max(2, Math.round(w / pitch));
    const p = w / n;
    const rr = p / 2;
    const bump = Math.min(rr * 0.95, t * 0.6);
    // 截面在 xy 里画（y = -z），沿 y 方向挤出 h
    const s = new THREE.Shape();
    const back = t - bump;
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, -back);
    for (let i = n - 1; i >= 0; i--) {
      const cx = -w / 2 + p * (i + 0.5);
      // 半椭圆凸起（k=0 和上一个槽的终点重合，跳过）
      const steps = 6;
      for (let k = 1; k <= steps; k++) {
        const a = (k / steps) * Math.PI;
        s.lineTo(cx + Math.cos(a) * rr, -back - Math.sin(a) * bump);
      }
    }
    s.lineTo(-w / 2, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 2 });
    // 挤出方向 z → y：(x, y, z) → (x, z, -y)
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -t / 2);
    smoothNormals(g, 50);
    worldUV(g);
    return g;
  });
}

/** 拱形板（拱形镜）：w 宽、h 总高（上面半圆）、t 厚；底面中心为原点，面朝 +z */
export function archGeo(w, h, t, bevel = 0.002) {
  const key = `ar${f3(w)}|${f3(h)}|${f3(t)}|${f3(bevel)}`;
  return cached(key, () => {
    const r = w / 2;
    const s = new THREE.Shape();
    s.moveTo(-r, 0);
    s.lineTo(r, 0);
    s.lineTo(r, h - r);
    s.absarc(0, h - r, r, 0, Math.PI, false);
    s.lineTo(-r, 0);
    const b = Math.min(bevel, t / 2 - 0.0004);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0004, t - 2 * b), bevelEnabled: b > 0.0004, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2, curveSegments: 24 });
    g.translate(0, 0, b - t / 2);
    unitNormals(g);
    worldUV(g);
    return g;
  });
}

export function disposeCache() {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
