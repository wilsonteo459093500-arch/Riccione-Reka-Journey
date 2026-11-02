// 「AI 帮我填」（员工自己按、自己同意才会用）：把一个项目挑好的照片（≈ 512 px 小图）发给 Google Gemini，
// 用这台设备上已经设置好的 key（3D 工作室的设置），帮忙预填：每张照片是哪个房间、风格、主要材质、颜色。
//
// 发出去的只有：那几张小图 + 下面这段固定的英文说明（可选的房间 / 风格 / 材质 id）。
// 不发：文件夹名字、城市、人名、文件名、EXIF（小图是重新画出来的，没有任何元数据）。
// 真正叫 Gemini 的函数是外面传进来的（src/studio/plan/ai.js 的 callGemini）；测试里换成假的，沙盒里永远不会真的连出去。

import { getData } from './data.js';

export const AI_SLOTS = ['floor', 'walls', 'cabinetry', 'countertop', 'upholstery'];

/** 允许 AI 回答的词表：房间 id、风格 id（用英文名说明）、每个表面的材质 id */
export function vocab({ rooms, mats }) {
  const d = getData();
  return {
    rooms: rooms.filter((r) => r !== 'plan3d'),
    styles: d.styles.map((s) => ({ id: s.id, en: s.en })),
    mats,
  };
}

export function promptOf(n, v) {
  const styleList = v.styles.map((s, i) => `S${i + 1} = ${s.en}`).join('; ');
  const matLines = AI_SLOTS.filter((s) => v.mats[s]?.length)
    .map((s) => `${s}: ${v.mats[s].join(', ')}`)
    .join('\n');
  return `You are helping an interior-design firm tag photos of ONE finished home project (${n} photos, in order, numbered from 1).
For each photo say which room it shows, using exactly one of: ${v.rooms.join(', ')} (use "other" if none fits).
For the whole project choose 1–2 style codes from: ${styleList}.
For the whole project pick the closest material id for each surface from these lists (or null if not visible):
${matLines}
Also give up to 3 dominant colours of the project as simple words (white, cream, oak, walnut, grey, black, green, blue, ochre, terracotta, pink).
Return ONLY JSON: {"photos":[{"i":1,"room":"living"}],"styles":["S1"],"materials":{"floor":"…"},"colours":["walnut"]}.`;
}

export const SCHEMA = {
  type: 'OBJECT',
  properties: {
    photos: { type: 'ARRAY', items: { type: 'OBJECT', properties: { i: { type: 'INTEGER' }, room: { type: 'STRING' } }, required: ['i', 'room'] } },
    styles: { type: 'ARRAY', items: { type: 'STRING' } },
    materials: { type: 'OBJECT', properties: Object.fromEntries(AI_SLOTS.map((s) => [s, { type: 'STRING', nullable: true }])) },
    colours: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['photos', 'styles'],
};

/** AI 的回答 → 只留下认得的值（不认得的一律丢掉）。→ { rooms:[room|null]（每张）, styles:[id], materials:{slot:id}, colours:[word] } */
export function parseAnswer(json, n, v) {
  const rooms = new Array(n).fill(null);
  for (const p of Array.isArray(json?.photos) ? json.photos : []) {
    const i = Number(p?.i) - 1;
    if (i >= 0 && i < n && v.rooms.includes(p.room)) rooms[i] = p.room;
  }
  const styles = [];
  for (const s of Array.isArray(json?.styles) ? json.styles : []) {
    const m = /^S(\d+)$/i.exec(String(s).trim());
    const st = m ? v.styles[+m[1] - 1] : v.styles.find((x) => x.en.toLowerCase() === String(s).toLowerCase() || x.id === s);
    if (st && !styles.includes(st.id)) styles.push(st.id);
  }
  const materials = {};
  for (const slot of AI_SLOTS) {
    const id = json?.materials?.[slot];
    if (id && v.mats[slot]?.includes(id)) materials[slot] = id;
  }
  const COL = ['white', 'cream', 'oak', 'walnut', 'grey', 'black', 'green', 'blue', 'ochre', 'terracotta', 'pink'];
  const colours = (Array.isArray(json?.colours) ? json.colours : []).map((c) => String(c).toLowerCase()).filter((c) => COL.includes(c)).slice(0, 3);
  return { rooms, styles: styles.slice(0, 2), materials, colours };
}

/**
 * 一个项目：images = [dataURL（JPEG ≈ 512 px，没有元数据）…]
 * call = callGemini(settings, { tier, parts, schema, signal })；imagePart = ai.js 的 imagePart
 */
export async function autoTagGroup({ images, settings, call, imagePart, v, signal }) {
  const parts = [...images.map((src) => imagePart(src)), { text: promptOf(images.length, v) }];
  const r = await call(settings, { tier: 'flash', parts, schema: SCHEMA, signal, timeoutMs: 60000 });
  return parseAnswer(r?.json, images.length, v);
}
