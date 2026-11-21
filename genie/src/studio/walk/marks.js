// 走进去 · 拍照 = 收藏这个角度（SPEC §2）：只记站在哪、朝哪看、几点钟，之后可以跳回来；不存图片、不下载。
// 存在方案上（project.walkMarks，跟着方案自动保存在这台设备上）；分享链接 / 导出都不带（store.packProject 只挑固定的几样）；
// 下一位客人时跟着方案一起删掉（shared/forget.js）。最多 12 个，满了丢掉最早的。列表从旧到新。

import { uid } from '../plan/model.js';

export const MAX_MARKS = 12;

const num = (v) => (Number.isFinite(+v) ? +v : 0);
const r2 = (v) => Math.round(num(v) * 100) / 100;
const r3 = (v) => Math.round(num(v) * 1000) / 1000;
const isMark = (m) => !!m && typeof m === 'object' && typeof m.id === 'string' && m.id !== '';

/** 方案里存着的角度（坏掉的那几个不要；最多 12 个） */
export function marksOf(project) {
  const l = project?.walkMarks;
  return Array.isArray(l) ? l.filter(isMark).slice(-MAX_MARKS) : [];
}

/**
 * 加一个角度 → 新的列表（不改原来的）。
 * pose = { floor: 楼层 id, x, z（平面坐标，米）, yaw, pitch（弧度）, hour, room（房间 id；给房间对象也行） }
 * 角度 = { id, floor, x, z, yaw, pitch, hour, room, at }：位置取到 0.01、角度取到 0.001、at = ISO 时间
 */
export function addMark(list, pose, { at = new Date() } = {}) {
  const prev = Array.isArray(list) ? list.filter(isMark) : [];
  const used = new Set(prev.map((m) => m.id));
  let id = uid('m');
  while (used.has(id)) id = uid('m');
  const room = pose?.room;
  const mark = {
    id,
    floor: pose?.floor ?? null,
    x: r2(pose?.x),
    z: r2(pose?.z),
    yaw: r3(pose?.yaw),
    pitch: r3(pose?.pitch),
    hour: r2(pose?.hour),
    room: room && typeof room === 'object' ? (room.id ?? null) : (room ?? null),
    at: (at instanceof Date ? at : new Date(at)).toISOString(),
  };
  return [...prev, mark].slice(-MAX_MARKS);
}

/** 删掉一个角度 → 新的列表 */
export function removeMark(list, id) {
  return Array.isArray(list) ? list.filter((m) => isMark(m) && m.id !== id) : [];
}
