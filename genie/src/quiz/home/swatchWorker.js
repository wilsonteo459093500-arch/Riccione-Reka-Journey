// 材质色卡放到后台线程画（kit.jsx 的 requestSwatch 用）：renderSwatch 一张 96–112 px 在 iPad 上要 50–250 ms，
// 放在主线程，案例详情 / 保留 / 生成那几屏会一下一下地卡。纯计算，不碰 DOM、不连网。
//
// 消息：{ key, id, px } → { key, blob }   （24 位 BMP：自己写文件头，不经过 canvas —— 不用 OffscreenCanvas、
//                                           不用 GPU 回读，旧 Safari 也一样快；112 px ≈ 37 KB，一页几十张也只有一两 MB）
//                       → { key, error }
// 起不来（旧 Safari 不支持 module worker）→ kit.jsx 还是在主线程空闲时一张一张画（和以前一样）。

import { renderSwatch } from '../../shared/textures.js';

/** RGBA（第 0 行在上）→ 24 位 BMP（文件里由下往上存，每行补齐到 4 字节） */
export function bmpBlob(rgba, R) {
  const row = (R * 3 + 3) & ~3;
  const size = 54 + row * R;
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  u8[0] = 0x42; // 'B'
  u8[1] = 0x4d; // 'M'
  dv.setUint32(2, size, true);
  dv.setUint32(10, 54, true); // 像素从第 54 字节开始
  dv.setUint32(14, 40, true); // BITMAPINFOHEADER
  dv.setInt32(18, R, true);
  dv.setInt32(22, R, true); // 正数 = 由下往上
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, row * R, true);
  dv.setInt32(38, 2835, true); // 72 dpi
  dv.setInt32(42, 2835, true);
  for (let y = 0; y < R; y++) {
    const src = (R - 1 - y) * R * 4;
    let o = 54 + y * row;
    for (let x = 0; x < R; x++, o += 3) {
      const i = src + x * 4;
      u8[o] = rgba[i + 2];
      u8[o + 1] = rgba[i + 1];
      u8[o + 2] = rgba[i];
    }
  }
  return new Blob([buf], { type: 'image/bmp' });
}

self.onmessage = (e) => {
  const { key, id, px } = e.data || {};
  try {
    const R = Math.max(32, Math.round(px) || 96);
    const rgba = renderSwatch(id, R);
    if (!rgba) throw new Error('no material');
    self.postMessage({ key, blob: bmpBlob(rgba, R) });
  } catch (err) {
    self.postMessage({ key, error: String(err?.message || err) });
  }
};
