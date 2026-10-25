// 溪岸板材的照片贴图（MatLib 的一个小帮手；所有板材的逻辑都在这里，matlib.js 只有几个小钩子）。
//
// 一块板材在 3D 里分三步变清楚，每一步都「原地」换上（MatLib.swapEntry，和程序化贴图的小图 → 完整图一样）：
//   twin    近似色：用板材自己量出来的颜色画的程序化贴图（64，一两毫秒）—— 点下去马上有东西；
//   preview 照片 256（顺纹方向 256 像素，约 2 KB）—— 省电档 / 显卡吃紧过以后就停在这里；
//   full    照片 1024（iPad 和电脑都一样，R10）。
// v1 的法线是共用的「平的」一张、ORM 按表面处理一个固定值（R10）：着色器开关和程序化材质完全一样，不会多编译着色器。
//
// 贴图从哪里来：本机板材包（IndexedDB，boards/device.js 登记）→ 网上（CONFIG.boards.base，记录 img !== false 时）。
// 都没有（只合了资料、关掉了照片）→ entryFor 返回 null，MatLib 照常走程序化的路（近似色，完整分辨率，不联网）。
// 拿不到（离线、404、解码失败）→ 停在近似色（并在空闲时补成完整分辨率的程序化贴图），客人看不到错误；?diag=1 看得到原因。
//
// 铺法（R3 / R5，boardUV.js photoUV）：图顺纹竖放存；横纹平铺、顺纹镜像（2.8m 高的墙板也没有横缝）；
// 每个零件以自己的中心落在图的正中间；尺寸按图盖住的真实毫米。ImageBitmap 不翻转，上下靠负的 repeat 摆正。
//
// 显存：照片贴图上传完马上 close() 掉 ImageBitmap（R9 e）；之后不再重新上传它 —— 换画质（各向异性）、显卡上下文丢失
// 都会重新读一次来源。上下文丢失时同步把正在用的板材换回近似色（DataTexture，three 恢复后能自己重新上传），
// 照片的全部丢掉，这个 3D 剩下的时间（和 15 分钟内在这个分页新开的）只用 256（R9 d）。

import * as THREE from 'three';
import { MAT_BY_ID, MATERIALS, fits } from '../../shared/materials.js';
import { variantFor } from '../../shared/textures.js';
import { CONFIG } from '../../shared/config.js';
import { photoSource, picVersion } from '../../shared/boards/library-api.js';
import { photoUV, texBytes } from './boardUV.js';

const PREVIEW = 64; // 近似色的小图：只顶几百毫秒（256 的照片马上就到），画 64 比 128 快一倍多（点下去 ≤ 100ms）
// 这个分页最近遇到过显卡上下文丢失（存的是那一刻的时间）→ 15 分钟内新开的 3D 只用 256（重新载入、许愿模式的下一页）。
// 只看最近的：展厅 iPad 一整天开着同一个分页，锁屏 / 切到后台常常丢一次上下文，不能让之后每一位客人都只看到 256
// （2.44m 的门板上 256 ≈ 每像素 9.5mm，木纹会糊）。许愿模式「下一位客人」也会把它删掉（WishShell）。
const LEAN_KEY = 'genie.boardsLean';
export const LEAN_MS = 15 * 60e3;
const RETRY_MS = 30000; // 拿不到的，30 秒内不再试

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const idle0 = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 120 }) : setTimeout(fn, 16));

/** 最近 15 分钟内丢过上下文？（旧版本存的 '1' 没有时间 = 很久以前，不算） */
export function sessionLean(at = Date.now()) {
  try {
    const t = Number(sessionStorage.getItem(LEAN_KEY));
    return Number.isFinite(t) && t > 1e12 && at - t >= 0 && at - t < LEAN_MS;
  } catch {
    return false;
  }
}
function saveLean() {
  try {
    sessionStorage.setItem(LEAN_KEY, String(Date.now()));
  } catch {
    /* 私密模式：只记在这次的内存里（this.lostOnce） */
  }
}

/** 解码：ImageBitmap（不翻转、不做色彩转换 —— 我们的 WebP 是没标色彩空间的 sRGB）；旧 Safari 没有就用 <img> */
async function decode0(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    } catch {
      try {
        return await createImageBitmap(blob);
      } catch {
        /* 往下用 <img> */
      }
    }
  }
  if (typeof Image === 'undefined') throw new Error('no image decoder');
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 网上读一张（离线不去读 —— 不在控制台留下一串红字；404 被改写成首页的也当拿不到） */
async function fetch0(url) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!/^image\//.test(type)) throw new Error(`not an image (${type || 'no type'})`);
  return res.blob();
}

const sizeOf = (img) => [img?.width || img?.naturalWidth || 0, img?.height || img?.naturalHeight || 0];
const closeImg = (img) => {
  try {
    img?.close?.();
  } catch {
    /* 已经关了 */
  }
};

export class BoardTextures {
  /**
   * @param renderer three 的 WebGLRenderer（用 initTexture 在空闲时先上传，不卡第一帧）
   * @param lib      MatLib（tex / slots / build / swapEntry / inUse / aniso）
   * @param opts     { safe }（兼容档 = 只用 256）；测试可以换 decode / fetch / idle
   */
  constructor(renderer, lib, { safe = false, decode = decode0, fetchBlob = fetch0, idle = idle0 } = {}) {
    this.r = renderer;
    this.lib = lib;
    this.decode = decode;
    this.fetchBlob = fetchBlob;
    this.idle = idle;
    this.safe = !!safe;
    this.lostOnce = sessionLean();
    this.lean = this.safe || this.lostOnce;
    this.lost = false;
    this.aniso = lib.aniso;
    this.uploads = []; // 解码好、等空闲上传的 { e, px, img, gen, t0 }
    this.pumping = false;
    this.loads = 0; // 正在读 / 解码的
    this.open = 0; // 还没 close 的 ImageBitmap
    this.fails = 0;
    this.reason = '';
    this.log = []; // 最近几次 { id, px, ms, src }（诊断 / 量速度用）
    this.flat = this.constTex([128, 128, 255, 255], 'flat');
    this.netDownUntil = 0;
    // 网络回来了：停在近似色的板材马上再试一次
    this.onOnline = () => {
      this.netDownUntil = 0;
      for (const e of this.lib.tex.values()) if (e.photo && e.failedAt && this.lib.inUse(e.key)) this.want(e, { force: true });
    };
    if (typeof window !== 'undefined') window.addEventListener?.('online', this.onOnline);
    this.orms = new Map();
  }

  /** 'lean'（只用 256：兼容档 / 显卡吃紧过）| 'full'（1024） */
  tier() {
    return this.lean ? 'lean' : 'full';
  }

  /** 共用的 1×1 贴图（平的法线 / 固定的 ORM）：所有板材共用，trim / evict 永远不释放 */
  constTex(rgba, name) {
    const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.userData.shared = name;
    t.needsUpdate = true;
    return t;
  }

  /** 这种表面处理的 ORM：R 遮蔽 1 · G 粗糙度 · B 1（同一个粗糙度共用一张） */
  ormFor(mat) {
    const g = Math.max(8, Math.min(255, Math.round((mat.rough ?? 0.62) * 255)));
    let t = this.orms.get(g);
    if (!t) this.orms.set(g, (t = this.constTex([255, g, 255, 255], `orm${g}`)));
    return t;
  }

  /** 近似色的一套（程序化，MatLib.build） */
  twin(mat, slotId, R = PREVIEW) {
    const g = this.lib.build(mat.id, variantFor(mat, slotId || 'cabinetry'), R);
    return { ...g, ns: undefined, state: 'twin', px: 0, bytes: texBytes(R, R) * 3, twinR: R };
  }

  /**
   * MatLib.textureFor 的第一行：这块板有照片可用 → 给它的那一套（MatLib 的形状，多 photo / state / px / bytes / ns）；
   * 不是板材、关掉了照片、没有任何贴图来源 → null（MatLib 照常走程序化的路）。
   */
  entryFor(matId, slotId) {
    const mat = MAT_BY_ID[matId];
    if (!mat?.board || CONFIG.boards?.photo === false) return null;
    if (!photoSource(matId)) return null;
    // 只看会改变贴图的字段（图的指纹 + 内容版本、尺寸、横纹接缝、粗糙度）：员工打个星、改个名字（rev + 1）不用重新读图
    const b = mat.board;
    const key = `${matId}|photo|${b.hash || ''}|${picVersion(b)}|${b.mm.join('x')}|${b.seam?.u || ''}|${mat.rough}`;
    let e = this.lib.tex.get(key);
    if (!e) {
      e = { ...this.twin(mat, slotId), key, matId, variant: 'photo', res: 0, full: false, photo: true, slot: slotId, gen: 0, want: 0, used: 0 };
      this.lib.tex.set(key, e);
    }
    e.used = now();
    this.want(e);
    return e;
  }

  /**
   * MatLib.applyAll 的钩子：方案里有这台设备不认识的板材 id（'sail-…'，别人分享的、板材包还没导入）→ 先顶一个：
   * 这个表面现在的材质（还认识的话），不然是能放这个表面的第一个程序化材质；别的 id 原样返回（以前的行为不变）。
   */
  stand(matId, slotId) {
    if (MAT_BY_ID[matId] || !/^sail-/.test(String(matId || ''))) return matId;
    const cur = this.lib.current[slotId];
    if (MAT_BY_ID[cur] && fits(cur, slotId)) return cur;
    return MATERIALS.find((m) => fits(m.id, slotId))?.id ?? matId;
  }

  /** 这一套现在该到多清楚（顺纹像素）：lean 256，否则 1024；记录里没有那么大的就用有的最大的 */
  targetFor(e) {
    const tiers = Object.keys(MAT_BY_ID[e.matId]?.board?.tiers || {})
      .map(Number)
      .filter((n) => n === 256 || n === 1024);
    const have = tiers.length ? tiers : [256, 1024];
    const cap = this.lean ? 256 : 1024;
    const ok = have.filter((n) => n <= cap);
    return ok.length ? Math.max(...ok) : Math.min(...have);
  }

  /** 排上「读到目标清晰度」（已经在那里 / 正在读 / 刚失败过就不动） */
  want(e, { force = false } = {}) {
    if (this.lost) return;
    const target = this.targetFor(e);
    if (!force && (e.px === target || e.want === target)) return;
    if (!force && e.failedAt && now() - e.failedAt < RETRY_MS) return;
    e.want = target;
    e.full = false;
    const gen = ++e.gen;
    const steps = target > 256 && e.px < 256 && e.state === 'twin' ? [256, target] : [target];
    this.run(e, steps, gen);
  }

  /** 读一张图（本机 / 网上）→ Blob；网络不通（请求直接失败，不是 404）：30 秒内所有板材都不再去试 —— 换十块板也只在控制台留一行 */
  async getBlob(src, px) {
    if (src.blob) return src.blob(px);
    if (now() < this.netDownUntil) throw new Error('network down');
    try {
      return await this.fetchBlob(src.url(px));
    } catch (err) {
      if (err?.name === 'TypeError' || /offline/.test(err?.message || '')) this.netDownUntil = now() + RETRY_MS;
      throw err;
    }
  }

  async run(e, steps, gen) {
    const src = photoSource(e.matId);
    const t0 = now();
    // 读图和解码 / 上传错开：256 一读到就开始读 1024（本机的两张一起读）；网上的等 256 读成功才读下一张 —— 网络不通时只失败一次
    const reads = [];
    for (const px of steps) {
      const prev = reads[reads.length - 1];
      const go = () => (src ? this.getBlob(src, px) : Promise.reject(new Error('no source')));
      const p = (prev && !src?.blob ? prev.then((r) => (r.err ? Promise.reject(r.err) : go())) : go()).then(
        (blob) => ({ blob }),
        (err) => ({ err }),
      );
      this.loads++;
      p.then(() => this.loads--);
      reads.push(p);
    }
    for (let i = 0; i < steps.length; i++) {
      const px = steps[i];
      let img = null;
      try {
        const r = await reads[i];
        if (r.err) throw r.err;
        if (!r.blob) throw new Error('missing');
        if (gen !== e.gen) return;
        img = await this.decode(r.blob);
        this.open++;
      } catch (err) {
        this.fail(e, px, err, gen);
        return;
      }
      if (gen !== e.gen || this.lost) {
        this.closeJob({ img });
        return;
      }
      await new Promise((resolve) => {
        this.uploads.push({ e, px, img, gen, t0, src: src?.name || '', done: resolve });
        this.pump();
      });
    }
  }

  fail(e, px, err, gen) {
    if (gen !== e.gen) return;
    this.fails++;
    this.reason = `${e.matId} ${px}: ${String(err?.message || err).slice(0, 80)}`;
    e.failedAt = now();
    e.want = 0;
    e.full = true;
    // 停在近似色：空闲时补成完整分辨率的程序化贴图（不要一直是 64 的小图）
    if (e.state === 'twin' && e.twinR === PREVIEW) {
      this.idle(() => {
        if (gen !== e.gen || this.lib.tex.get(e.key) !== e || e.state !== 'twin') return;
        const mat = MAT_BY_ID[e.matId];
        if (!mat) return;
        this.lib.swapEntry(e, this.twin(mat, e.slot, this.lib.resFor(mat, e.slot)));
      });
    }
  }

  closeJob(j) {
    if (j?.img) {
      closeImg(j.img);
      this.open = Math.max(0, this.open - 1);
      j.img = null;
    }
    j?.done?.();
  }

  /** 空闲时一次只上传一张（renderer.initTexture：材质换上之前就在显卡上了，不卡那一帧） */
  pump() {
    if (this.pumping || !this.uploads.length) return;
    this.pumping = true;
    this.idle(() => {
      this.pumping = false;
      const j = this.uploads.shift();
      if (j) this.upload(j);
      this.pump();
    });
  }

  upload(j) {
    const { e, px, img, gen } = j;
    const mat = MAT_BY_ID[e.matId];
    if (gen !== e.gen || this.lost || !mat || this.lib.tex.get(e.key) !== e) {
      this.closeJob(j);
      return;
    }
    const uv = photoUV(mat);
    const [w, h] = sizeOf(img);
    const t = new THREE.Texture(img);
    t.flipY = false;
    t.premultiplyAlpha = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = uv.wrapS === 'mirror' ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    t.wrapT = THREE.MirroredRepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = this.aniso;
    t.repeat.set(uv.repeat[0], uv.repeat[1]);
    t.offset.set(uv.offset[0], uv.offset[1]);
    t.userData.board = e.matId;
    // 上传完马上放掉 ImageBitmap（R9 e）：之后不会再拿它上传（换画质 / 上下文丢失都会重新读来源）
    t.onUpdate = () => {
      t.onUpdate = null;
      if (!t.userData.closed) {
        t.userData.closed = true;
        closeImg(img);
        this.open = Math.max(0, this.open - 1);
      }
    };
    t.needsUpdate = true;
    try {
      this.r?.initTexture?.(t);
    } catch (err) {
      t.onUpdate?.();
      t.dispose();
      this.fail(e, px, err, gen);
      j.done?.();
      return;
    }
    const final = px >= this.targetFor(e);
    this.lib.swapEntry(e, {
      map: t,
      normal: this.flat,
      orm: this.ormFor(mat),
      size: uv.along,
      rotation: 0,
      R: Math.max(w, h),
      ns: 1,
      state: px >= 1024 ? 'full' : 'preview',
      px,
      bytes: texBytes(w, h),
      twinR: 0,
      full: final,
      want: final ? 0 : e.want,
      failedAt: 0,
    });
    this.log.push({ id: e.matId, px, ms: Math.round(now() - j.t0), src: j.src });
    if (this.log.length > 12) this.log.shift();
    j.done?.();
  }

  /** MatLib.trim / dispose 的钩子：释放这一套（共用的平法线 / ORM 不动），没上传的 ImageBitmap 一起关掉 */
  evict(e) {
    e.gen++;
    e.want = 0;
    for (const t of [e.map, e.normal, e.orm]) {
      if (!t || t.userData?.shared) continue;
      if (t.userData?.board && !t.userData.closed) t.onUpdate?.();
      t.dispose();
    }
    if (this.lib.tex.get(e.key) === e) this.lib.tex.delete(e.key);
    this.uploads = this.uploads.filter((j) => (j.e === e ? (this.closeJob(j), false) : true));
  }

  /** MatLib.setQuality 的钩子：兼容档 → 256；各向异性变了 → 正在用的重新读一次（照片贴图不会被重新上传，R9 c） */
  setTier(quality, { safe = false } = {}) {
    const lib = this.lib;
    const aniso = quality === 'high' ? lib.maxAniso : Math.min(4, lib.maxAniso);
    const lean = !!safe || this.lostOnce;
    const anisoChanged = aniso !== this.aniso;
    if (lean === this.lean && !anisoChanged) {
      this.safe = !!safe;
      return;
    }
    this.safe = !!safe;
    this.lean = lean;
    this.aniso = aniso;
    for (const e of [...lib.tex.values()]) {
      if (!e.photo) continue;
      if (lib.inUse(e.key) || lib.isPinned?.(e.key)) this.want(e, { force: true });
      else this.evict(e);
    }
  }

  /**
   * Engine._onLost 的钩子（同步）：正在用的板材换回近似色（DataTexture，three 恢复后自己会重新上传），
   * 没在用的整套丢掉；照片一张都不留 —— 恢复时 three 不会去上传已经关掉的 ImageBitmap（R9 d）。
   * 这个引擎剩下的时间只用 256（lostOnce）；记下时间，15 分钟内这个分页新开的 3D 也先用 256（sessionLean）。
   */
  onContextLost() {
    this.lost = true;
    this.lostOnce = true;
    this.lean = true;
    saveLean();
    for (const j of this.uploads) this.closeJob(j);
    this.uploads = [];
    for (const e of [...this.lib.tex.values()]) {
      if (!e.photo) continue;
      e.gen++;
      e.want = 0;
      if (!(this.lib.inUse(e.key) || this.lib.isPinned?.(e.key))) {
        this.evict(e);
        continue;
      }
      const mat = MAT_BY_ID[e.matId];
      if (e.state !== 'twin' && mat) this.lib.swapEntry(e, { ...this.twin(mat, e.slot), full: false, failedAt: 0 });
    }
  }

  /** Engine._onRestored 的钩子：正在用的重新读（256） */
  onContextRestored() {
    this.lost = false;
    for (const e of this.lib.tex.values()) if (e.photo && this.lib.inUse(e.key)) this.want(e, { force: true });
  }

  /** 照片贴图占的显存（字节；共用的 1×1 不算） */
  bytes() {
    let b = 0;
    for (const e of this.lib.tex.values()) if (e.photo) b += e.bytes || 0;
    return b;
  }

  /** 诊断 / 测试：{ boards, inUse, full, preview, twin, mb, pending, lean, lost, bitmaps, fails, reason, last } */
  stats() {
    const out = {
      boards: 0,
      inUse: 0,
      full: 0,
      preview: 0,
      twin: 0,
      mb: 0,
      pending: this.loads + this.uploads.length,
      lean: this.lean,
      lost: this.lost,
      bitmaps: this.open,
      fails: this.fails,
      reason: this.reason,
      last: this.log.slice(-3),
    };
    for (const e of this.lib.tex.values()) {
      if (!e.photo) continue;
      out.boards++;
      if (this.lib.inUse(e.key)) out.inUse++;
      out[e.state]++;
      out.mb += (e.bytes || 0) / 1e6;
    }
    out.mb = Math.round(out.mb * 10) / 10;
    return out;
  }

  dispose() {
    if (typeof window !== 'undefined') window.removeEventListener?.('online', this.onOnline);
    for (const j of this.uploads) this.closeJob(j);
    this.uploads = [];
    for (const e of [...this.lib.tex.values()]) if (e.photo) this.evict(e);
    this.flat.dispose();
    for (const t of this.orms.values()) t.dispose();
    this.orms.clear();
  }
}
