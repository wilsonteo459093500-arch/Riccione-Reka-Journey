// 运行时材质库：每个「表面」一个共享材质（换一次，整屋同一表面一起换）＋ 固定材质（玻璃、电视、灯罩…）。
//
// 每个表面材质都是完整的 PBR：底色 + 切线空间法线（来自独立高度场）+ 粗糙度 / 微遮蔽（ORM）贴图，
// 再按材质类型调好：丝绒 / 羊羔绒的绒面光泽（sheen）、烤漆 / 抛光石材 / 釉面砖的清漆层（clearcoat）、
// 拉丝金属的条纹粗糙度、金属和亮面在环境里的反射强度。
//
// 贴图生成是纯 CPU 的（textures.js）。为了换情绪 / 拖材质时不卡：第一次用到某个材质时先给一张小图
// （几毫秒），完整分辨率的放到空闲时一张一张生成，生成好再换上（pulse() 通知引擎重画）。
//
// 显存（大 iPad 上 WebGL 上下文被挤掉的主因之一）：同一材质 + 变体 + 分辨率的一套贴图所有表面共用；
// 缓存按「显存预算」淘汰 —— 正在用的永远留着，其余按最久没用的先释放（GPU 上的贴图一起 dispose）。
// 只是路过的材质（拖着经过、换情绪时一闪而过）不会去生成完整分辨率。
//
// 溪岸板材（真实板材的照片贴图）：全部逻辑在 boardTex.js（BoardTextures），这里只有几个小钩子 ——
// textureFor 第一行、setBytes / apply 的 e.bytes / e.ns、trim / dispose 交给 boards.evict、setQuality 跳过照片、swapEntry
// （诊断 / 测试看 lib.boards.stats()）。

import * as THREE from 'three';
import { BoardTextures } from './boardTex.js';
import { MAT_BY_ID, SLOTS } from '../../shared/materials.js';
import { generateMaps, variantFor } from '../../shared/textures.js';
import { PALETTE } from '../../shared/palette.js';

// 完整分辨率：地面 / 主题墙 / 台面 1024，其余 512；触屏设备（fast）主题墙、台面降到 512
const RES = {
  high: { floor: 1024, feature: 1024, countertop: 1024 },
  fast: { floor: 1024, feature: 512, countertop: 512 },
};
const PREVIEW = 128; // 先顶上的小图
// 贴图显存预算（字节；一套 = 底色 + 法线 + ORM 三张 RGBA，含 mipmap）：正在用的大约 'high' 90MB、'fast' 65MB，
// 预算里多出来的留给「刚换掉、可能马上换回来」的
const BUDGET = { high: 176e6, fast: 104e6 };
const MAX_SETS = 20; // 套数上限（小图也算）
const setBytes = (e) => e.bytes ?? ((e.R * e.R * 4 * 4) / 3) * 3;

// 法线强度（按贴图类型）—— 高度场是按毫米算的物理值，这里只做一点「看得见」的放大
const NORMAL = {
  wood: 1.25,
  marble: 0.6,
  travertine: 1,
  terrazzo: 0.7,
  concrete: 1,
  limewash: 1,
  paint: 0.7,
  tile: 1,
  linen: 1.1,
  boucle: 1,
  knit: 1,
  velvet: 0.8,
  felt: 0.9,
  leather: 1.1,
  rattan: 1,
  metal: 0.6,
};

// 绒面光泽的粗糙度 / 颜色（越低越像丝绒的「流光」）
const SHEEN = {
  velvet: { rough: 0.32, lift: 0.28, spec: 0.35 },
  boucle: { rough: 0.55, lift: 0.4, spec: 0.5 },
  knit: { rough: 0.6, lift: 0.4, spec: 0.5 },
  felt: { rough: 0.6, lift: 0.35, spec: 0.5 },
  linen: { rough: 0.7, lift: 0.45, spec: 0.55 },
};

// 引擎总会传画质档进来；这里只是兜底，规则和 Engine.resolveQuality 一样：触屏（含大 iPad）= 'fast'
const quality0 = () => {
  try {
    return matchMedia('(pointer: coarse)').matches ? 'fast' : 'high';
  } catch {
    return 'high';
  }
};

const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 120 }) : setTimeout(fn, 16));

export class MatLib {
  constructor(renderer, quality) {
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.quality = quality === 'high' || quality === 'fast' ? quality : quality0();
    this.aniso = this.quality === 'high' ? this.maxAniso : Math.min(4, this.maxAniso);
    this.boards = new BoardTextures(renderer, this, { safe: quality === 'safe' }); // 溪岸板材的照片贴图（兼容档只用 256）
    this.slots = {};
    this.current = {};
    this.tex = new Map(); // key → { map, normal, orm, size, rotation, full, used }
    this.queue = [];
    this.pumping = false;
    this.upgraded = false;
    this.fixed = {};
    this.night = 0;
    this.highlighted = null;
    for (const s of SLOTS) {
      const m = new THREE.MeshPhysicalMaterial({ color: 0xdddddd, roughness: 0.8 });
      m.userData.slot = s.id;
      m.userData.envBoost = 1;
      envHook(m);
      this.slots[s.id] = m;
    }
    this.buildFixed();
  }

  slot(id) {
    return this.slots[id];
  }

  /** 引擎换画质档：各向异性跟着换（已有的贴图重新上传一次）；分辨率不同的表面重新套一次（先小图、空闲时补完整的） */
  setQuality(q, { safe = false } = {}) {
    const nq = q === 'fast' ? 'fast' : 'high';
    this.boards?.setTier(nq, { safe }); // 板材：兼容档 → 256；照片贴图不在下面重新上传（它们自己重新读）
    if (nq === this.quality) return;
    this.quality = nq;
    this.aniso = nq === 'high' ? this.maxAniso : Math.min(4, this.maxAniso);
    for (const e of this.tex.values()) {
      if (e.photo) continue;
      for (const t of [e.map, e.normal, e.orm])
        if (t.anisotropy !== this.aniso) {
          t.anisotropy = this.aniso;
          t.needsUpdate = true;
        }
    }
    for (const [slotId, matId] of Object.entries(this.current)) this.apply(slotId, matId);
    this.upgraded = true;
  }

  /** 这一套贴图现在有没有表面在用 */
  inUse(key) {
    for (const m of Object.values(this.slots)) if (m.userData.texKey === key) return true;
    return false;
  }

  resFor(mat, slotId) {
    return RES[this.quality][slotId] || 512;
  }

  makeTex(data, R, srgb, size, rotation) {
    const t = new THREE.DataTexture(data, R, R, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = this.aniso;
    t.repeat.set(1 / size, 1 / size);
    t.rotation = rotation;
    t.needsUpdate = true;
    return t;
  }

  build(matId, variant, R) {
    const g = generateMaps(matId, variant, R);
    return {
      map: this.makeTex(g.albedo, R, true, g.size, g.rotation),
      normal: this.makeTex(g.normal, R, false, g.size, g.rotation),
      orm: this.makeTex(g.orm, R, false, g.size, g.rotation),
      size: g.size,
      rotation: g.rotation,
      R,
    };
  }

  /** 某材质在某表面上的一套贴图（第一次先给小图，完整的排队生成） */
  textureFor(matId, slotId) {
    const board = this.boards?.entryFor(matId, slotId); // 溪岸板材有照片 → 它的那一套（没有照片 = null，往下走近似色的程序化贴图）
    if (board) return board;
    const mat = MAT_BY_ID[matId];
    const variant = variantFor(mat, slotId);
    const res = this.resFor(mat, slotId);
    const key = `${matId}|${variant}|${res}`;
    let e = this.tex.get(key);
    if (!e) {
      e = { ...this.build(matId, variant, PREVIEW), full: false, key, matId, variant, res };
      this.tex.set(key, e);
    }
    if (!e.full && !this.queue.includes(e)) {
      this.queue.push(e);
      this.pump();
    }
    e.used = performance.now();
    return e;
  }

  /** 空闲时一张一张把完整分辨率的贴图做出来（已经没有表面在用的跳过 —— 下次用到会再排队） */
  pump() {
    if (this.pumping) return;
    this.pumping = true;
    idle(() => {
      this.pumping = false;
      let e = this.queue.shift();
      while (e && !this.inUse(e.key)) e = this.queue.shift();
      if (!e) return;
      if (this.tex.get(e.key) === e && !e.full) {
        const hi = this.build(e.matId, e.variant, e.res);
        const old = [e.map, e.normal, e.orm];
        Object.assign(e, hi, { full: true });
        for (const [slotId, m] of Object.entries(this.slots)) {
          if (m.userData.texKey === e.key) {
            m.map = e.map;
            m.normalMap = e.normal;
            m.roughnessMap = e.orm;
            m.aoMap = e.orm;
          }
          void slotId;
        }
        old.forEach((t) => t.dispose());
        this.upgraded = true;
      }
      if (this.queue.length) this.pump();
    });
  }

  /** 原地换掉一套贴图（板材：近似色 → 照片 256 → 1024，和 pump() 换完整分辨率一样）；被换下来的释放（共用的 1×1 不动） */
  swapEntry(e, next) {
    const old = [e.map, e.normal, e.orm];
    Object.assign(e, next);
    const keep = new Set([e.map, e.normal, e.orm]);
    const ns = e.ns ?? NORMAL[MAT_BY_ID[e.matId]?.tex?.type] ?? 1;
    for (const [slotId, m] of Object.entries(this.slots)) {
      // 走进去（paint-scan）留着做「旧的那一面」的贴图也跟着换 —— 每个表面都要问（和 pump() 一样）：
      // 客人点了板材、照片还没到又换走了，这个表面已经不显示它，但扫描还钉着它当旧的一面
      this.scans?.[slotId]?.refreshOld?.(e);
      if (m.userData.texKey !== e.key) continue;
      m.map = e.map;
      m.normalMap = e.normal;
      m.roughnessMap = e.orm;
      m.aoMap = e.orm;
      m.normalScale.set(ns, ns);
    }
    for (const t of old) if (t && !keep.has(t) && !t.userData?.shared) t.dispose();
    this.upgraded = true;
  }

  /** 超出显存预算（或套数上限）时，释放最久没用、也没有表面在用的 */
  trim() {
    let total = 0;
    for (const e of this.tex.values()) total += setBytes(e);
    const budget = BUDGET[this.quality];
    if (total <= budget && this.tex.size <= MAX_SETS) return;
    const inUse = new Set(Object.values(this.slots).map((m) => m.userData.texKey));
    const old = [...this.tex.values()].filter((e) => !inUse.has(e.key)).sort((a, b) => a.used - b.used);
    while ((total > budget || this.tex.size > MAX_SETS) && old.length) {
      const e = old.shift();
      total -= setBytes(e);
      // 板材：共用的平法线 / ORM 不能释放，没上传的 ImageBitmap 要关掉
      if (e.photo) this.boards.evict(e);
      else {
        e.map.dispose();
        e.normal.dispose();
        e.orm.dispose();
      }
      this.tex.delete(e.key);
      const qi = this.queue.indexOf(e);
      if (qi >= 0) this.queue.splice(qi, 1);
    }
  }

  /** 现在缓存了多少（调试 / 测试用） */
  stats() {
    let bytes = 0;
    for (const e of this.tex.values()) bytes += setBytes(e);
    return { sets: this.tex.size, mb: Math.round(bytes / 1e6), queued: this.queue.length };
  }

  /** 把材质 matId 套到表面 slotId */
  apply(slotId, matId) {
    const mat = MAT_BY_ID[matId];
    const m = this.slots[slotId];
    if (!mat || !m) return;
    const e = this.textureFor(matId, slotId);
    const type = mat.tex.type;
    const before = sig(m);
    m.userData.texKey = e.key;
    m.map = e.map;
    m.normalMap = e.normal;
    const ns = e.ns ?? NORMAL[type] ?? 1; // 板材的照片：法线是平的，强度 1
    m.normalScale.set(ns, ns);
    m.roughnessMap = e.orm; // G = 粗糙度（绝对值）
    m.roughness = 1;
    m.aoMap = e.orm; // R = 缝、导管、织物间隙里的微遮蔽（只压环境光）
    m.aoMapIntensity = 1;
    m.bumpMap = null;
    m.color.set(0xffffff);
    m.metalness = mat.metal;
    // 绒面
    const sh = SHEEN[type];
    m.sheen = mat.sheen || 0;
    if (m.sheen) {
      const sp = sh || SHEEN.linen;
      m.sheenColor.set(mat.color).lerp(new THREE.Color(0xffffff), sp.lift);
      m.sheenRoughness = sp.rough;
    }
    m.specularIntensity = mat.cat === 'fabric' && type !== 'leather' && type !== 'rattan' ? (sh?.spec ?? 0.6) : 1;
    // 清漆层（烤漆、抛光石材、釉面砖）
    m.clearcoat = mat.clearcoat || 0;
    m.clearcoatRoughness = mat.ccRough ?? 0.08;
    // 拉丝金属：拉丝感来自粗糙度 / 法线贴图里的长条纹（不开 anisotropy，少编译一个着色器）
    // 环境反射：金属、亮面更亮一些
    m.userData.envBoost = mat.metal >= 0.5 ? 2.4 : m.clearcoat >= 0.3 ? 1.5 : type === 'leather' ? 1.2 : 1;
    if (sig(m) !== before) m.needsUpdate = true;
    this.current[slotId] = matId;
    this.trim();
  }

  applyAll(materials) {
    // 这台设备还没有的溪岸板材（别人分享的方案、还没导入板材包）：不留一块没贴图的灰板 —— 先用近似的，登记好后再套一次就对了
    for (const s of SLOTS) if (materials[s.id]) this.apply(s.id, this.boards?.stand(materials[s.id], s.id) ?? materials[s.id]);
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
      this.slots[slotId].emissive.set(PALETTE.gold);
      this.slots[slotId].emissiveIntensity = 0.35;
    }
  }

  /** 每帧调用：发光脉冲；完整分辨率的贴图刚换上时也要重画 */
  pulse(t) {
    let redraw = false;
    if (this.upgraded) {
      this.upgraded = false;
      redraw = true;
    }
    if (!this.highlighted) return redraw;
    const m = this.slots[this.highlighted];
    if (m) m.emissiveIntensity = 0.22 + 0.18 * Math.sin(t * 0.008);
    return true;
  }

  buildFixed() {
    const F = (name, params, Ctor = THREE.MeshStandardMaterial, boost = 0) => {
      const m = new Ctor(params);
      m.userData.fixed = name;
      if (boost) {
        m.userData.envBoost = boost;
        envHook(m);
      }
      this.fixed[name] = m;
    };
    // 固定材质保持 MeshStandardMaterial（玻璃除外）：不多编译着色器，iPad 首次打开不卡；
    // 质感靠更准的粗糙度 / 金属度 + 环境反射倍数（envBoost）
    F('glass', { color: 0xdbe8ee, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false }, THREE.MeshPhysicalMaterial, 1.8);
    F('frame', { color: 0x2a2a2c, roughness: 0.38, metalness: 0.75 }, THREE.MeshStandardMaterial, 1.6);
    F('tv', { color: 0x0b0b0d, roughness: 0.1, metalness: 0.3 }, THREE.MeshStandardMaterial, 1.6);
    F('screen', { color: 0x10141c, roughness: 0.06, metalness: 0.1, emissive: 0x24304a, emissiveIntensity: 0.0 }, THREE.MeshStandardMaterial, 1.8);
    F('porcelain', { color: 0xf6f4f0, roughness: 0.14, metalness: 0 }, THREE.MeshStandardMaterial, 1.4);
    F('mattress', { color: 0xf3efe8, roughness: 0.92 });
    F('leaf', { color: 0x5c7a50, roughness: 0.62, side: THREE.DoubleSide });
    F('leaf2', { color: 0x7d9966, roughness: 0.62, side: THREE.DoubleSide });
    F('pot', { color: 0xc9b79d, roughness: 0.78 });
    F('terracotta', { color: 0xb4694a, roughness: 0.85 });
    F('chrome', { color: 0xe4e5e6, roughness: 0.1, metalness: 1 }, THREE.MeshStandardMaterial, 2.6);
    F('black', { color: 0x1a1a1a, roughness: 0.55 });
    // 拉丝不锈钢：比镜面粗一点（反射的是糊开的柔光箱和房间，不是一整块白 / 天空的颜色），本色是中性的钢灰
    F('steel', { color: 0xc4c4c2, roughness: 0.4, metalness: 1 }, THREE.MeshStandardMaterial, 1.35);
    F('mirror', { color: 0xeef2f4, roughness: 0.02, metalness: 1 }, THREE.MeshStandardMaterial, 2.6);
    F('books', { vertexColors: true, roughness: 0.8 });
    F('art', { color: 0xb3552e, roughness: 0.9 });
    F('art2', { color: 0xd8c3a0, roughness: 0.9 });
    F('exterior', { color: 0xe8e2d8, roughness: 0.95 });
    // 天花（批荡 + 白漆）：平时看不见（模型是掀了顶的），走进去的时候盖上（Engine.setCeilings）
    F('ceiling', { color: new THREE.Color(PALETTE.card), roughness: 0.92 });
    F('cap', { color: 0x2a2523, roughness: 0.9 });
    F('plinth', { color: 0x1d1d18, roughness: 0.55, metalness: 0.15 });
    F('water', { color: 0x9fc3cf, roughness: 0.05, transparent: true, opacity: 0.6 }, THREE.MeshStandardMaterial, 1.6);
    F('rail', { color: 0x2a2a2c, roughness: 0.35, metalness: 0.8 }, THREE.MeshStandardMaterial, 1.8);
    F('altarRed', { color: 0x6e1c18, roughness: 0.35, emissive: 0xff4a2a, emissiveIntensity: 0 }, THREE.MeshStandardMaterial, 1.2);
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
    this.boards?.dispose();
    this.queue = [];
    for (const m of Object.values(this.slots)) m.dispose();
    for (const m of Object.values(this.fixed)) m.dispose();
    for (const t of this.tex.values()) {
      t.map.dispose();
      t.normal.dispose();
      t.orm.dispose();
    }
    this.tex.clear();
  }
}

/** 着色器开关（换了才需要重新编译） */
function sig(m) {
  return `${!!m.map}${!!m.normalMap}${!!m.roughnessMap}${!!m.aoMap}${!!m.bumpMap}${m.sheen > 0}${m.clearcoat > 0}`;
}

/**
 * 场景环境（scene.environment）默认用 scene.environmentIntensity，材质自己的 envMapIntensity 不起作用。
 * 这里在渲染前把同一张环境图挂到材质上，强度 = 场景强度 × 这个材质的倍数 —— 金属、亮面才有像样的反射，
 * 白天黑夜的整体变化也照样跟着场景走。
 */
function envHook(m) {
  m.onBeforeRender = (renderer, scene) => {
    const env = scene && scene.environment;
    if (!env) return;
    if (m.envMap !== env) m.envMap = env;
    m.envMapIntensity = (scene.environmentIntensity ?? 1) * (m.userData.envBoost ?? 1);
  };
}
