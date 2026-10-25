// 一层的墙 → 一个封闭、法线朝外的网格（SPEC §4.3；照设计师原型 run-dae.mjs 的 wallMesh）。
// 每段墙（不含阳台 / 车廊那种只在室外一侧的边）按开口切成高度段：实心 [0, H]；窗 / 趟门 [0, 窗台] + [窗顶, H]；门 [门顶, H]；打通没有。
// 所有矩形的边、所有高度切成一个三维网格，标出实心的格子，只出边界面（同材质的连续格子合并成一块）。
// 侧面的材质看面外 1cm 是什么：室内房间 → 墙面（walls），湿区（浴室、晒衣处）→ 墙地砖（tile），室外或什么都没有 → 外墙（fixed__exterior）。
// 挨着楼梯井 / 挑空的墙往下接一个楼板厚（和 house.js 一样），楼上楼下之间不留缝。

import { ROOM_TYPES } from '../plan/model.js';
import { Mesh } from './mesh.js';
import { isOutdoorEdge } from './scene.js';

const mmI = (v) => Math.round(v * 1000);
const uniq = (a) => [...new Set(a)].sort((p, q) => p - q);

/** 一层墙的实心格子（整数毫米，平面坐标：x 向右、y 向下） */
export function wallCells(F) {
  const H = F.ceil;
  const pieces = [];
  const isHole = (id) => !!id && F.rooms.some((r) => r.id === id && r.hole);
  for (const w of F.walls) {
    if (isOutdoorEdge(w)) continue;
    const down = F.below > 0 && (isHole(w.neg?.id) || isHole(w.pos?.id));
    for (const p of w.pieces) {
      const a = p.a - (Math.abs(p.a - w.a) < 0.01 ? w.t / 2 : 0);
      const b = p.b + (Math.abs(p.b - w.b) < 0.01 ? w.t / 2 : 0);
      const rect = (a0, b0) => (w.axis === 'x' ? { x0: mmI(a0), x1: mmI(b0), y0: mmI(w.c - w.t / 2), y1: mmI(w.c + w.t / 2) } : { x0: mmI(w.c - w.t / 2), x1: mmI(w.c + w.t / 2), y0: mmI(a0), y1: mmI(b0) });
      let solid;
      if (p.kind === 'solid') solid = [[0, H]];
      else if (p.kind === 'window' || p.kind === 'slider') {
        const sill = p.sill ?? 0.9;
        const head = Math.min(p.head ?? 2.2, H - 0.05);
        solid = [[0, sill], [head, H]];
      } else if (p.kind === 'door') solid = [[Math.min(p.head ?? 2.1, H - 0.05), H]];
      else solid = [];
      solid = solid.filter(([u, v]) => v - u > 0.005);
      if (solid.length) pieces.push({ r: rect(a, b), solid });
      // 往下接的那一段（楼板厚）：两端不外伸（门那一段也不接，门槛下面是楼板）
      if (down && p.kind !== 'door') pieces.push({ r: rect(p.a, p.b), solid: [[-F.below, 0]] });
    }
  }
  const xs = uniq(pieces.flatMap((p) => [p.r.x0, p.r.x1]));
  const ys = uniq(pieces.flatMap((p) => [p.r.y0, p.r.y1]));
  const zs = uniq([0, mmI(H), ...pieces.flatMap((p) => p.solid.flat().map(mmI))]);
  const W = Math.max(0, xs.length - 1);
  const D = Math.max(0, ys.length - 1);
  const Z = Math.max(0, zs.length - 1);
  const grid = new Uint8Array(W * D * Z);
  const ix = new Map(xs.map((v, i) => [v, i]));
  const iy = new Map(ys.map((v, i) => [v, i]));
  const iz = new Map(zs.map((v, i) => [v, i]));
  for (const p of pieces) {
    const i0 = ix.get(p.r.x0);
    const i1 = ix.get(p.r.x1);
    const j0 = iy.get(p.r.y0);
    const j1 = iy.get(p.r.y1);
    for (const [u, v] of p.solid) {
      const k0 = iz.get(mmI(u));
      const k1 = iz.get(mmI(v));
      for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) grid[(k * D + j) * W + i] = 1;
    }
  }
  const at = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= W || j >= D || k >= Z ? 0 : grid[(k * D + j) * W + i]);
  return { xs, ys, zs, W, D, Z, at };
}

/** 实心格子的体积（m³）：测试拿它对网格的有向体积 */
export function cellVolume(C) {
  let v = 0;
  for (let k = 0; k < C.Z; k++)
    for (let j = 0; j < C.D; j++)
      for (let i = 0; i < C.W; i++) if (C.at(i, j, k)) v += ((C.xs[i + 1] - C.xs[i]) * (C.ys[j + 1] - C.ys[j]) * (C.zs[k + 1] - C.zs[k])) / 1e9;
  return v;
}

/**
 * @param {object} F scene 的一层
 * @param {object} scene buildScene() 的结果（X / Y：平面米 → 导出坐标）
 * @returns {{ mesh: Mesh, cells }}
 */
export function wallMesh(F, scene) {
  const C = wallCells(F);
  const { xs, ys, zs, W, D, Z, at } = C;
  const mesh = new Mesh();
  const roomAt = (x, y) => F.rooms.find((r) => x > r.rect.x && x < r.rect.x + r.rect.w && y > r.rect.y && y < r.rect.y + r.rect.d);
  const matAt = (x, y) => {
    const r = roomAt(x, y);
    const t = r && ROOM_TYPES[r.type];
    if (!r || t?.outdoor) return 'fixed__exterior';
    return t?.wet ? 'tile' : 'walls';
  };
  const X = (v) => scene.X(v / 1000);
  const Y = (v) => scene.Y(v / 1000);
  const Zm = (v) => v / 1000;
  for (let k = 0; k < Z; k++) {
    // 垂直于平面 x 的面（导出坐标里法线 ±X）
    for (const dir of [-1, 1])
      for (let i = 0; i < W; i++) {
        let run = null;
        const xf = dir < 0 ? xs[i] : xs[i + 1];
        const flush = () => {
          if (!run) return;
          const ya = ys[run.j0];
          const yb = ys[run.j1];
          const A = [X(xf), Y(ya), Zm(zs[k])];
          const B = [X(xf), Y(yb), Zm(zs[k])];
          const Cc = [X(xf), Y(yb), Zm(zs[k + 1])];
          const Dd = [X(xf), Y(ya), Zm(zs[k + 1])];
          if (dir > 0) mesh.quad(run.mat, B, A, Dd, Cc);
          else mesh.quad(run.mat, A, B, Cc, Dd);
          run = null;
        };
        for (let j = 0; j < D; j++) {
          const face = at(i, j, k) && !at(i + dir, j, k);
          const mat = face ? matAt(xf / 1000 + dir * 0.01, (ys[j] + ys[j + 1]) / 2000) : null;
          if (face && run && run.mat === mat) run.j1 = j + 1;
          else {
            flush();
            if (face) run = { j0: j, j1: j + 1, mat };
          }
        }
        flush();
      }
    // 垂直于平面 y 的面（平面 +y = 导出 −Y）
    for (const dir of [-1, 1])
      for (let j = 0; j < D; j++) {
        let run = null;
        const yf = dir < 0 ? ys[j] : ys[j + 1];
        const flush = () => {
          if (!run) return;
          const xa = xs[run.i0];
          const xb = xs[run.i1];
          const A = [X(xa), Y(yf), Zm(zs[k])];
          const B = [X(xb), Y(yf), Zm(zs[k])];
          const Cc = [X(xb), Y(yf), Zm(zs[k + 1])];
          const Dd = [X(xa), Y(yf), Zm(zs[k + 1])];
          if (dir > 0) mesh.quad(run.mat, A, B, Cc, Dd);
          else mesh.quad(run.mat, B, A, Dd, Cc);
          run = null;
        };
        for (let i = 0; i < W; i++) {
          const face = at(i, j, k) && !at(i, j + dir, k);
          const mat = face ? matAt((xs[i] + xs[i + 1]) / 2000, yf / 1000 + dir * 0.01) : null;
          if (face && run && run.mat === mat) run.i1 = i + 1;
          else {
            flush();
            if (face) run = { i0: i, i1: i + 1, mat };
          }
        }
        flush();
      }
    // 顶面 / 底面（每一行连续的合并）
    for (const up of [1, -1])
      for (let j = 0; j < D; j++) {
        let run = null;
        const flush = () => {
          if (!run) return;
          const z = Zm(up > 0 ? zs[k + 1] : zs[k]);
          const xa = X(xs[run.i0]);
          const xb = X(xs[run.i1]);
          const y0 = Y(ys[j + 1]);
          const y1 = Y(ys[j]);
          if (up > 0) mesh.quad('walls', [xa, y0, z], [xb, y0, z], [xb, y1, z], [xa, y1, z]);
          else mesh.quad('walls', [xa, y1, z], [xb, y1, z], [xb, y0, z], [xa, y0, z]);
          run = null;
        };
        for (let i = 0; i < W; i++) {
          const face = at(i, j, k) && !at(i, j, k + up);
          if (face && run) run.i1 = i + 1;
          else {
            flush();
            if (face) run = { i0: i, i1: i + 1 };
          }
        }
        flush();
      }
  }
  return { mesh, cells: C };
}
