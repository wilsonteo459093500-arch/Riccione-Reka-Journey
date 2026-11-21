// 柜子细节 · 引擎那一半（点到才下载；和 model.js 分开：这里碰 three 和引擎）。
//
// 做法（.claude/plans/wish-cabinet.md「地基」）：
//   · 每组（每个部分）一个自己的材质，放进 MatLib.slots（钥匙 'cab:<组>:<部分>'）—— 贴图、画质、显存淘汰、空闲时补高清全部走 MatLib 原来的路，
//     同一块板的贴图各组共用。材质的 userData.slot 写原来的颜色位（compact() 给板材错开纹理、Engine.slotAt、走进去的刷色都认它），
//     另外记 userData.cab = 哪一组。
//   · furniture.js 的口子 CAB.h：建一件柜子时每个部分来问一次；这里记下「问了什么、答了什么」，设定变了只重建答案变了的那几件。
//   · 没设的组用「跟着原来颜色位」的材质：MatLib.apply 换柜体色时它们一起换（下面包了一层 apply）。
//   · 关掉（deactivate）：口子拿掉、柜子重建回原来的材质、这里建的材质全部释放 —— 和没装过一样。

import * as THREE from 'three';
import { CAB } from '../engine/furniture.js';
import { boxGeo } from '../engine/geom.js';
import { MAT_BY_ID, BOARDS, fits } from '../../shared/materials.js';
import { boardMat } from '../../shared/boards/library-api.js';
import { PALETTE } from '../../shared/palette.js';
import { decide, matIdOf, parseKey, groupOf, cleanCab, FOLLOW, KIND_GROUP, SEED, seedId, seedRecord, realOf } from './model.js';

/** 认得的材质 id（方案是别人给的链接里来的：'constructor' 这种也不能当成材质） */
export const known = (id) => typeof id === 'string' && Object.hasOwn(MAT_BY_ID, id);

/** 手册颜色的 6 块板放进材质表（只有资料、没有贴图；不进板材栏、不进板材库）。幂等 */
export function ensureSeeds() {
  for (const key of Object.keys(SEED)) {
    const id = seedId(key);
    if (!known(id)) {
      const m = boardMat(seedRecord(key), { src: 'seed' });
      if (m) MAT_BY_ID[id] = m;
    }
  }
}

/** 和 matlib.js 的 envHook 一样：环境反射强度 = 场景的 × 这个材质的倍数 */
function envHook(m) {
  m.onBeforeRender = (renderer, scene) => {
    const env = scene && scene.environment;
    if (!env) return;
    if (m.envMap !== env) m.envMap = env;
    m.envMapIntensity = (scene.environmentIntensity ?? 1) * (m.userData.envBoost ?? 1);
  };
}

export class CabRuntime {
  constructor(engine) {
    this.e = engine;
    this.lib = engine.lib;
    this.on = false;
    this.cab = undefined;
    this.materials = {};
    this.keys = new Set(); // 这里建的材质的钥匙
    this.calls = new Map(); // itemId → [[part, legacyKey, groupOv, 答的钥匙], …]
    this.glowing = []; // 正在发金光的材质
    this.ptr = null; // 最后一次指针的位置
    this.tapGroup = null; // 最后一次在画布上「点一下」（不是拖）点的是哪一组：走进去刷色用
    this.sel = null; // 面板上选着的 { group, part }
    this.onSet = null; // (group, part, matId) → 面板那边存进方案
    this.locked = false; // 柜子是客人家里留下来的（方案的 locked.cabinetry）
  }

  // ───────────── 开 / 关 ─────────────

  activate() {
    if (this.on) return;
    this.on = true;
    ensureSeeds();
    const lib = this.lib;
    this.orig = { apply: lib.apply, highlight: lib.highlight, pulse: lib.pulse };
    const apply = (slot, id) => this.orig.apply.call(lib, slot, id);
    // 换柜体色（一键情绪、拖板材、撤销）：跟着它的那些组一起换
    lib.apply = (slot, id) => {
      apply(slot, id);
      if (FOLLOW.includes(slot)) for (const k of this.keys) if (k.endsWith(`:~${slot}`)) apply(k, id);
    };
    // 拖着板材经过柜子：只有指着的那一组发光（没指着柜子 = 原来的整面发光）
    lib.highlight = (slot) => {
      const g = slot && FOLLOW.includes(slot) ? this.groupAtPointer() : null;
      this.glow(g);
      this.orig.highlight.call(lib, g ? null : slot);
    };
    lib.pulse = (t) => {
      const r = this.orig.pulse.call(lib, t);
      if (!this.glowing.length) return r;
      const k = 0.22 + 0.18 * Math.sin(t * 0.008);
      for (const m of this.glowing) m.emissiveIntensity = k;
      return true;
    };
    // 这里出任何错都不能让一件柜子建不出来：退回原来的材质
    CAB.h = (item, part, key, group) => {
      try {
        return typeof part === 'object' ? this.post(item, part) : this.ask(item, part, key, group);
      } catch {
        return null;
      }
    };
    CAB.drop = (matId, slot) => this.drop(matId, slot);
    this.onMove = (ev) => {
      this.ptr = { x: ev.clientX, y: ev.clientY };
    };
    this.onDown = (ev) => {
      this.ptr = { x: ev.clientX, y: ev.clientY };
      this.down = ev.target === this.e.renderer?.domElement ? { x: ev.clientX, y: ev.clientY } : null;
    };
    // 在画布上点一下（按下、抬起没挪开）：记下点的是哪一组（没点到柜子 = 没有）；拖着转镜头不算
    this.onUp = (ev) => {
      const d = this.down;
      this.down = null;
      if (!d || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 8) return;
      this.ptr = { x: ev.clientX, y: ev.clientY };
      this.tapGroup = this.groupAt(ev.clientX, ev.clientY);
    };
    window.addEventListener('pointermove', this.onMove, true);
    window.addEventListener('pointerdown', this.onDown, true);
    window.addEventListener('pointerup', this.onUp, true);
  }

  deactivate() {
    if (!this.on) return;
    this.on = false;
    const lib = this.lib;
    this.glow(null);
    CAB.h = null;
    CAB.drop = null;
    lib.apply = this.orig.apply;
    lib.highlight = this.orig.highlight;
    lib.pulse = this.orig.pulse;
    window.removeEventListener('pointermove', this.onMove, true);
    window.removeEventListener('pointerdown', this.onDown, true);
    window.removeEventListener('pointerup', this.onUp, true);
    this.cab = undefined;
    // 柜子重建回原来的材质（引擎还在的话），再释放这里建的
    try {
      this.rebuild([...this.calls.keys()]);
    } catch {
      /* 引擎已经收掉了 */
    }
    this.drop0([...this.keys]);
  }

  // ───────────── 材质 ─────────────

  /** 这把钥匙的材质（没有就建一个，套上现在该有的板材） */
  mat(key) {
    const lib = this.lib;
    if (lib.slots[key]) return lib.slots[key];
    const k = parseKey(key);
    const m = new THREE.MeshPhysicalMaterial({ color: 0xdddddd, roughness: 0.8 });
    m.userData.slot = k.follow || 'cabinetry';
    m.userData.cab = k.group;
    m.userData.cabKey = key;
    m.userData.envBoost = 1;
    envHook(m);
    lib.slots[key] = m;
    this.keys.add(key);
    this.paint(key);
    return m;
  }

  /** 这把钥匙现在该是哪块板：手册颜色的板在这台设备上有真的就用真的；这台设备不认识的板材先顶一个（MatLib 的规矩） */
  matIdFor(key) {
    let id = realOf(matIdOf(key, this.cab, this.materials), BOARDS);
    if (!known(id)) id = this.lib.boards?.stand?.(id, 'cabinetry') ?? id;
    if (!known(id)) id = this.lib.current.cabinetry || this.materials.cabinetry;
    return known(id) ? id : null;
  }

  paint(key) {
    const id = this.matIdFor(key);
    if (id && this.lib.current[key] !== id) this.orig.apply.call(this.lib, key, id);
  }

  /** 释放几把钥匙的材质（没有柜子在用了） */
  drop0(keys) {
    const lib = this.lib;
    for (const k of keys) {
      const m = lib.slots[k];
      if (m) {
        m.dispose();
        delete lib.slots[k];
        delete lib.current[k];
      }
      this.keys.delete(k);
    }
    lib.trim?.();
  }

  // ───────────── furniture.js 来问 ─────────────

  ask(item, part, legacyKey, groupOv) {
    const key = decide(this.cab, item?.kind, part, legacyKey, groupOv);
    this.note(item, [part, legacyKey, groupOv, key]);
    return key ? this.mat(key) : null;
  }

  note(item, call) {
    const id = item?.id;
    if (id == null) return;
    // 一件家具重建时第一问（IT 换了）：清掉上一次记的
    if (this.building !== id) {
      this.building = id;
      this.calls.set(id, []);
    }
    this.calls.get(id).push(call);
  }

  /**
   * 一件柜子的零件都建好了、还没合并：侧板和柜体不是同一块板 → 柜体的两头贴一片 2mm 的侧板；
   * 本来就是一片竖板的（展示柜 / 书柜的侧板、鞋柜开放格的两边）直接换成侧板的材质。
   */
  post(item, raw) {
    this.building = null;
    const kind = item?.kind;
    if (!KIND_GROUP[kind]) return null;
    for (const g of kind === 'kitchenRun' ? [0, 'wall'] : [0]) {
      const legacy = kind === 'bookshelf' ? item.key || 'woodwork' : 'cabinetry';
      const kb = decide(this.cab, kind, 'b', legacy, g);
      const ks = decide(this.cab, kind, 's', legacy, g);
      if (item.id != null) {
        if (!this.calls.has(item.id)) this.calls.set(item.id, []);
        this.calls.get(item.id).push(['s', legacy, g, ks]);
      }
      const mb = kb && this.lib.slots[kb];
      if (!mb || !ks || kb === ks) continue;
      const ms = this.mat(ks);
      const list = [];
      raw.traverse((o) => o.isMesh && o.material === mb && list.push(o));
      for (const o of list) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        const w = b.max.x - b.min.x;
        const h = b.max.y - b.min.y;
        const d = b.max.z - b.min.z;
        if (h < 0.2 || d < 0.2) continue;
        if (w <= 0.04) {
          o.material = ms;
          continue;
        }
        if (w < 0.1) continue;
        // 和柜体并排放（不是放在柜体里面：compact() 遇到「这个材质只有一个网格」会原样留着它，里面的侧板就画了两次）
        o.updateMatrix();
        for (const s of [-1, 1]) {
          const slab = new THREE.Mesh(boxGeo(0.002, h, d), ms);
          slab.position.set(s > 0 ? b.max.x + 0.001 : b.min.x - 0.001, b.min.y, (b.min.z + b.max.z) / 2);
          slab.applyMatrix4(o.matrix);
          slab.castShadow = false;
          slab.receiveShadow = true;
          (o.parent || raw).add(slab);
        }
      }
    }
    return null;
  }

  // ───────────── 方案变了 ─────────────

  /** 方案的柜子设定 / 材质 / 家具变了：能原地换板材的原地换，答案变了的那几件重建 */
  sync({ cab, materials, furniture }) {
    if (!this.on) return;
    void furniture;
    this.cab = cleanCab(cab);
    cab = this.cab;
    this.materials = materials || {};
    const e = this.e;
    const redo = [];
    for (const [id, calls] of this.calls) {
      const it = e.itemData.get(id);
      if (!it) this.calls.delete(id);
      else if (calls.some((c) => decide(cab, it.kind, c[0], c[1], c[2]) !== c[3])) redo.push(id);
    }
    for (const [id, it] of e.itemData) if (KIND_GROUP[it.kind] && !this.calls.has(id)) redo.push(id);
    for (const k of this.keys) this.paint(k);
    if (redo.length) this.rebuild(redo);
    // 没有柜子再用的材质：释放
    const used = new Set();
    for (const calls of this.calls.values()) for (const c of calls) if (c[3]) used.add(c[3]);
    this.drop0([...this.keys].filter((k) => !used.has(k)));
    if (this.glowGroup) this.glow(this.glowGroup);
    e.blankWatch?.poke?.();
    e.dirty = true;
  }

  /**
   * 这几件柜子重建（引擎的 setFurniture：资料没变的那几件不动，所以先让引擎「忘记」它们）。
   * 用引擎自己手上的那份家具，不用方案的：换方案时引擎先换（setScene）、这里后知道 —— 用旧方案的家具会把上一个家画出来。
   */
  rebuild(ids) {
    const e = this.e;
    if (!ids.length || !e?.itemData) return;
    const list = [...e.itemData.values()];
    for (const id of ids) {
      e.itemData.delete(id);
      this.calls.delete(id);
    }
    e.setFurniture(list);
  }

  // ───────────── 发金光 / 认出哪一组 ─────────────

  /** 这一组的全部材质发金光（null = 关） */
  glow(group) {
    for (const m of this.glowing) {
      m.emissive.set(0x000000);
      m.emissiveIntensity = 1;
    }
    this.glowGroup = group || null;
    this.glowing = group ? [...this.keys].filter((k) => parseKey(k)?.group === group).map((k) => this.lib.slots[k]).filter(Boolean) : [];
    for (const m of this.glowing) {
      m.emissive.set(PALETTE.gold);
      m.emissiveIntensity = 0.35;
    }
    this.e.dirty = true;
  }

  /** 点一行：那一组亮一下（900ms） */
  flashGroup(group) {
    clearTimeout(this.flashT);
    this.glow(group);
    this.flashT = setTimeout(() => this.glow(null), 900);
  }

  groupAt(x, y) {
    const h = this.e.hitAt?.(x, y);
    return h?.material?.userData?.cab || null;
  }

  /** 指针现在是不是直接指着 3D 画布（不是盖在上面的面板、标签） */
  onCanvas() {
    return !!this.ptr && typeof document !== 'undefined' && document.elementFromPoint(this.ptr.x, this.ptr.y) === this.e.renderer?.domElement;
  }

  /** 指针指着的那一组（指着的是界面、不是画布 = 没有） */
  groupAtPointer() {
    return this.onCanvas() ? this.groupAt(this.ptr.x, this.ptr.y) : null;
  }

  // ───────────── 板材栏 / 走进去的刷色 ─────────────

  /**
   * StudioApp.dropMaterial 先问这里：这一下换的是不是某一组。
   *   · 拖到画布上的柜子（slot = 柜体那两个颜色位）→ 指着的那一组的柜门（面板上正选着这一组的某个部分 → 那个部分）；
   *   · 走进去刷色是先点一下柜子、再在托盘里选：用点那一下记的那一组；
   *   · 拖到标签 / 材质板上的「柜体」（不在画布上、也不是走进去）→ 不接：那是换全屋的柜体色；
   *   · 在板材栏点一下（没有 slot）→ 面板上选着的那一组那个部分。
   * 不接的（返回 false，照原来的路走）：不能上柜子的材质（布、石、砖…：原来的路会说为什么 / 换到它该去的表面）、
   * 柜子是客人家里留下来的（locked.cabinetry：原来的路会先问一句，换了才解锁）。
   */
  drop(matId, slot) {
    if (!this.on || !this.onSet || this.locked || !fits(matId, 'cabinetry')) return false;
    let group = null;
    if (slot) {
      if (!FOLLOW.includes(slot)) return false;
      if (this.onCanvas()) group = this.groupAtPointer();
      else if (this.e.renderer?.domElement?.closest?.('.is-walk')) group = this.tapGroup;
    } else if (this.sel) group = this.sel.group;
    if (!group) return false;
    this.onSet(group, this.sel?.group === group ? this.sel.part : 'door', matId);
    return true;
  }
}

/** 这件家具属于哪几组（面板 / 测试用） */
export const groupsOfItem = (item) => (KIND_GROUP[item?.kind] ? [groupOf(item.kind), ...(item.kind === 'kitchenRun' && item.upper !== false ? ['wall'] : [])] : []);
