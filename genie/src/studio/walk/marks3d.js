// 走进去 · 地上的记号 —— docs/walk/SPEC.md §3（marks3d.js）
//
// 点了地板要去的那一圈（金色的环）、要走的那条路（贴着地面 1.5cm 的细管子，走过的那一段收起来，快到了慢慢淡掉）、
// 选中的家具脚下的一圈、量尺的两个点（小球）和一条线（细圆柱）。颜色都从 PALETTE 来；MeshBasicMaterial（不吃光、不进影子、
// 不参与环境光遮蔽 noAO），深度照常比（被墙 / 家具挡住的那一段看不见）。挂在 engine.scene 上（不在 root 里：点不到它们）。
// 每帧只改透明度 / 位置 / drawRange（不建新的东西）；路换了才重建那一根管子。dispose() 全部拿掉、几何体和材质都释放。

import * as THREE from 'three';
import { PALETTE } from '../../shared/palette.js';

const LIFT = 0.015; // 路 / 环离地面多高
const TUBE_R = 0.012; // 路的粗细（半径）
const RADIAL = 6; // 路的截面边数
const STEP = 0.08; // 路每隔多远一节
const CORNER = 0.18; // 转角前后各加一个点：曲线贴着折线拐弯，不切墙角
const FADE_IN = 0.15; // 出现（秒）
const FADE_OUT = 0.35; // 消失（秒）
const TAIL = 1.2; // 最后这么多米路慢慢淡掉
const DOT_R = 0.025; // 量尺的点
const LINE_R = 0.006; // 量尺的线
const UP = new THREE.Vector3(0, 1, 0);

function material(color, opacity) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: true, toneMapped: false });
  m.userData.base = opacity;
  return m;
}

/** 一样东西的淡入淡出：k 是现在的可见度（0–1），to 是要去的 */
function fader(objs, mats) {
  return { objs, mats, k: 0, to: 0, extra: 1 };
}

function setFade(f) {
  const vis = f.k > 1e-3;
  for (const o of f.objs) o.visible = vis;
  for (const m of f.mats) m.opacity = m.userData.base * f.k * f.extra;
}

/** 折线 → 管子用的点：去掉挨得太近的点，每个转角前后各加一个点 */
function tubePoints(pts) {
  const P = [];
  for (const p of pts) {
    const v = new THREE.Vector3(p.x, p.y, p.z);
    if (!P.length || P[P.length - 1].distanceTo(v) > 0.01) P.push(v);
  }
  if (P.length < 2) return P;
  const out = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1];
    const b = P[i];
    const c = P[i + 1];
    const ra = Math.min(CORNER, a.distanceTo(b) / 3);
    const rc = Math.min(CORNER, b.distanceTo(c) / 3);
    out.push(b.clone().lerp(a, ra / a.distanceTo(b)), b, b.clone().lerp(c, rc / b.distanceTo(c)));
  }
  out.push(P[P.length - 1]);
  return out;
}

/**
 * 建在 engine.scene 上。→ {
 *   target(p | null)           要去的地方（世界坐标 {x, y, z}，y = 那一层的地面）；null 淡掉
 *   path(pts | null)           要走的路（世界坐标的折线，y = 地面）；null 淡掉
 *   progress(k, left)          走了几分之几（走过的那一段收起来）、还剩几米（最后 1.2m 慢慢淡掉）
 *   select(p | null)           选中的家具脚下一圈：{ x, y, z, r }
 *   measure(a, b | null)       量尺：一个点 / 两个点加一条线；clearMeasure() 拿掉
 *   update(dt) → changed       每帧：淡入淡出（有东西在变 → true）
 *   dispose(), group
 * }
 */
export function createMarks(engine) {
  const group = new THREE.Group();
  group.name = 'walk-marks';
  group.renderOrder = 4;
  group.userData.noAO = true;
  engine?.scene?.add(group);
  const geos = [];
  const mats = [];
  const own = (g) => (geos.push(g), g);
  const mat = (c, o) => {
    const m = material(c, o);
    mats.push(m);
    return m;
  };
  const flat = (mesh) => {
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 4;
    return mesh;
  };

  // 要去的地方：一圈
  const ringMat = mat(PALETTE.goldL, 0.95);
  const ring = flat(new THREE.Mesh(own(new THREE.RingGeometry(0.16, 0.22, 48)), ringMat));
  ring.visible = false;
  group.add(ring);
  const fTarget = fader([ring], [ringMat]);

  // 选中的家具：比要去的那一圈细一点、白一点
  const selMat = mat(PALETTE.card, 0.5); // 0.85 太抢眼（一大圈白的压在地板上）
  const sel = flat(new THREE.Mesh(own(new THREE.RingGeometry(0.95, 1, 72)), selMat));
  sel.visible = false;
  group.add(sel);
  const fSel = fader([sel], [selMat]);

  // 路：一根细管子（第一次有路才建；换路只换几何体）
  const pathMat = mat(PALETTE.goldL, 0.8);
  let tube = null;
  const fPath = fader([], [pathMat]);
  let segs = 0;

  // 量尺：两个小球 + 一根细圆柱（高 1，按长度拉）
  const mMat = mat(PALETTE.amber, 1);
  const dotGeo = own(new THREE.SphereGeometry(DOT_R, 14, 10));
  const dotA = new THREE.Mesh(dotGeo, mMat);
  const dotB = new THREE.Mesh(dotGeo, mMat);
  const line = new THREE.Mesh(own(new THREE.CylinderGeometry(LINE_R, LINE_R, 1, 8)), mMat);
  for (const o of [dotA, dotB, line]) {
    o.visible = false;
    o.renderOrder = 5;
    group.add(o);
  }
  const fMeasure = fader([dotA, dotB, line], [mMat]);
  const _d = new THREE.Vector3();

  const all = [fTarget, fSel, fPath, fMeasure];
  const show = (f, on) => {
    f.to = on ? 1 : 0;
  };

  return {
    group,
    target(p) {
      if (p) {
        ring.position.set(p.x, p.y + LIFT, p.z);
        fTarget.k = 0;
      }
      show(fTarget, !!p);
    },
    path(pts) {
      if (!pts || pts.length < 2) return show(fPath, false);
      const P = tubePoints(pts.map((p) => ({ x: p.x, y: p.y + LIFT + TUBE_R, z: p.z })));
      if (P.length < 2) return show(fPath, false);
      const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal');
      const len = curve.getLength();
      segs = Math.max(2, Math.min(600, Math.ceil(len / STEP)));
      const g = new THREE.TubeGeometry(curve, segs, TUBE_R, RADIAL, false);
      if (tube) {
        tube.geometry.dispose();
        tube.geometry = g;
      } else {
        tube = new THREE.Mesh(g, pathMat);
        tube.renderOrder = 4;
        group.add(tube);
        fPath.objs.push(tube);
      }
      fPath.extra = 1;
      fPath.k = 0;
      show(fPath, true);
    },
    /** 走过的那一段收起来（TubeGeometry 的三角形按路的方向排：从头切掉几节就行）；最后 TAIL 米淡掉 */
    progress(k, left = Infinity) {
      if (!tube || !segs) return;
      const cut = Math.max(0, Math.min(segs, Math.floor(Math.max(0, Math.min(1, k)) * segs)));
      tube.geometry.setDrawRange(cut * RADIAL * 6, (segs - cut) * RADIAL * 6);
      fPath.extra = Math.max(0, Math.min(1, left / TAIL));
      setFade(fPath);
    },
    select(p) {
      if (p) {
        sel.position.set(p.x, p.y + LIFT, p.z);
        sel.scale.setScalar(Math.max(0.35, p.r || 0.5));
      }
      show(fSel, !!p);
    },
    measure(a, b = null) {
      if (!a) return this.clearMeasure();
      dotA.position.set(a.x, a.y, a.z);
      fMeasure.objs = b ? [dotA, dotB, line] : [dotA];
      dotB.visible = false;
      line.visible = false;
      if (b) {
        dotB.position.set(b.x, b.y, b.z);
        _d.set(b.x - a.x, b.y - a.y, b.z - a.z);
        const len = _d.length();
        line.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        if (len > 1e-6) line.quaternion.setFromUnitVectors(UP, _d.multiplyScalar(1 / len));
        line.scale.set(1, Math.max(len, 1e-4), 1);
      }
      fMeasure.k = 1;
      show(fMeasure, true);
      setFade(fMeasure);
    },
    clearMeasure() {
      show(fMeasure, false);
    },
    /** 每帧：淡入淡出走一步 → 有东西在变就 true */
    update(dt = 0) {
      let changed = false;
      for (const f of all) {
        if (f.k === f.to) continue;
        const rate = f.to > f.k ? 1 / FADE_IN : 1 / FADE_OUT;
        f.k = f.to > f.k ? Math.min(f.to, f.k + rate * dt) : Math.max(f.to, f.k - rate * dt);
        setFade(f);
        changed = true;
      }
      return changed;
    },
    /** 现在看得见的：给测试 / 调试看 */
    get visible() {
      return { target: fTarget.to > 0, path: fPath.to > 0, select: fSel.to > 0, measure: fMeasure.to > 0 && fMeasure.objs.length > 1 ? 2 : fMeasure.to > 0 ? 1 : 0 };
    },
    dispose() {
      group.removeFromParent();
      tube?.geometry.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      geos.length = 0;
      mats.length = 0;
    },
  };
}
