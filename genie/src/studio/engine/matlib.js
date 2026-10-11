// 运行时材质库：每个「表面」一个共享材质（换一次，整屋同一表面一起换）＋ 固定材质（玻璃、电视、灯罩…）。

import * as THREE from 'three';
import { MAT_BY_ID, SLOTS } from '../../shared/materials.js';
import { generateTexture, variantFor } from '../../shared/textures.js';

const RES = { floor: 1024, walls: 256, feature: 512, tile: 512 };
const BUMP = { wood: 1.2, stone: 0.6, tile: 0.8, fabric: 2.4, paint: 0.6, metal: 0.4 };

export class MatLib {
  constructor(renderer) {
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.slots = {};
    this.current = {};
    this.tex = new Map();
    this.fixed = {};
    this.night = 0;
    this.highlighted = null;
    for (const s of SLOTS) {
      this.slots[s.id] = new THREE.MeshPhysicalMaterial({ color: 0xdddddd, roughness: 0.8 });
      this.slots[s.id].userData.slot = s.id;
    }
    this.buildFixed();
  }

  slot(id) {
    return this.slots[id];
  }

  textureFor(matId, slotId) {
    const mat = MAT_BY_ID[matId];
    const variant = variantFor(mat, slotId);
    const res = RES[slotId] || (mat.cat === 'paint' ? 256 : 512);
    const key = `${matId}|${variant}|${res}`;
    if (!this.tex.has(key)) {
      const { canvas, size, rotation } = generateTexture(matId, variant, res);
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(1 / size, 1 / size);
      map.rotation = rotation;
      map.anisotropy = this.aniso;
      const bump = new THREE.CanvasTexture(canvas);
      bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
      bump.repeat.copy(map.repeat);
      bump.rotation = rotation;
      this.tex.set(key, { map, bump });
    }
    return this.tex.get(key);
  }

  /** 把材质 matId 套到表面 slotId */
  apply(slotId, matId) {
    const mat = MAT_BY_ID[matId];
    const m = this.slots[slotId];
    if (!mat || !m) return;
    const { map, bump } = this.textureFor(matId, slotId);
    const hadMap = !!m.map;
    m.map = map;
    m.bumpMap = mat.cat === 'paint' && mat.tex.type === 'paint' ? null : bump;
    m.bumpScale = BUMP[mat.cat] ?? 1;
    m.color.set(0xffffff);
    m.roughness = mat.rough;
    m.metalness = mat.metal;
    m.sheen = mat.sheen;
    if (mat.sheen) {
      m.sheenColor.set(mat.color).lerp(new THREE.Color(0xffffff), 0.35);
      m.sheenRoughness = 0.45;
    }
    m.clearcoat = mat.clearcoat;
    m.clearcoatRoughness = 0.25;
    m.envMapIntensity = mat.cat === 'metal' ? 1 : mat.clearcoat ? 0.7 : 0.35;
    if (!hadMap) m.needsUpdate = true;
    this.current[slotId] = matId;
  }

  applyAll(materials) {
    for (const s of SLOTS) if (materials[s.id]) this.apply(s.id, materials[s.id]);
  }

  /** 拖材质经过时，整组表面发金光 */
  highlight(slotId) {
    if (this.highlighted === slotId) return;
    if (this.highlighted && this.slots[this.highlighted]) {
      const prev = this.slots[this.highlighted];
      prev.emissive.set(0x000000);
      prev.emissiveIntensity = 1;
    }
    this.highlighted = slotId || null;
    if (slotId && this.slots[slotId]) {
      this.slots[slotId].emissive.set(0xd7a54a);
      this.slots[slotId].emissiveIntensity = 0.35;
    }
  }

  pulse(t) {
    if (!this.highlighted) return false;
    const m = this.slots[this.highlighted];
    if (m) m.emissiveIntensity = 0.22 + 0.18 * Math.sin(t * 0.008);
    return true;
  }

  buildFixed() {
    const F = (name, params, Ctor = THREE.MeshStandardMaterial) => {
      this.fixed[name] = new Ctor(params);
      this.fixed[name].userData.fixed = name;
    };
    F('glass', { color: 0xdbe8ee, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.18, envMapIntensity: 1.2, depthWrite: false }, THREE.MeshPhysicalMaterial);
    F('frame', { color: 0x1d1d1f, roughness: 0.45, metalness: 0.6 });
    F('tv', { color: 0x0b0b0d, roughness: 0.15, metalness: 0.3, envMapIntensity: 1.2 });
    F('screen', { color: 0x10141c, roughness: 0.08, metalness: 0.1, emissive: 0x24304a, emissiveIntensity: 0.0, envMapIntensity: 1.4 });
    F('porcelain', { color: 0xf6f4f0, roughness: 0.18, metalness: 0, envMapIntensity: 0.8 });
    F('mattress', { color: 0xf3efe8, roughness: 0.9 });
    F('leaf', { color: 0x5c7a50, roughness: 0.75, side: THREE.DoubleSide });
    F('leaf2', { color: 0x7d9966, roughness: 0.75, side: THREE.DoubleSide });
    F('pot', { color: 0xc9b79d, roughness: 0.85 });
    F('terracotta', { color: 0xb4694a, roughness: 0.85 });
    F('chrome', { color: 0xdcdcdc, roughness: 0.15, metalness: 1 });
    F('black', { color: 0x1a1a1a, roughness: 0.6 });
    F('steel', { color: 0xc4c6c8, roughness: 0.32, metalness: 0.9 });
    F('mirror', { color: 0xe6eef2, roughness: 0.02, metalness: 1, envMapIntensity: 1.5 });
    F('books', { vertexColors: true, roughness: 0.8 });
    F('art', { color: 0xb3552e, roughness: 0.9 });
    F('art2', { color: 0xd8c3a0, roughness: 0.9 });
    F('exterior', { color: 0xe8e2d8, roughness: 0.95 });
    F('cap', { color: 0x2a2523, roughness: 0.9 });
    F('plinth', { color: 0x1d1d18, roughness: 0.55, metalness: 0.15 });
    F('water', { color: 0x9fc3cf, roughness: 0.05, transparent: true, opacity: 0.6 });
    F('rail', { color: 0x2a2a2c, roughness: 0.4, metalness: 0.7 });
    F('altarRed', { color: 0x6e1c18, roughness: 0.55, emissive: 0xff4a2a, emissiveIntensity: 0 });
    // 会在夜里亮的
    F('lampShade', { color: 0xf3e6cf, roughness: 0.85, emissive: 0xffc27a, emissiveIntensity: 0, side: THREE.DoubleSide });
    F('bulb', { color: 0xfff2d8, emissive: 0xffd7a0, emissiveIntensity: 0.2 });
    F('led', { color: 0xffe2b0, emissive: 0xffc27a, emissiveIntensity: 0 });
  }

  /** k: 0 白天 → 1 深夜，灯慢慢亮起来 */
  setNight(k) {
    this.night = k;
    this.fixed.lampShade.emissiveIntensity = 1.6 * k;
    this.fixed.bulb.emissiveIntensity = 0.3 + 3 * k;
    this.fixed.led.emissiveIntensity = 3.2 * k;
    this.fixed.altarRed.emissiveIntensity = 0.08 + 0.55 * k;
    this.fixed.screen.emissiveIntensity = 0;
  }

  dispose() {
    for (const m of Object.values(this.slots)) m.dispose();
    for (const m of Object.values(this.fixed)) m.dispose();
    for (const t of this.tex.values()) {
      t.map.dispose();
      t.bump.dispose();
    }
  }
}
