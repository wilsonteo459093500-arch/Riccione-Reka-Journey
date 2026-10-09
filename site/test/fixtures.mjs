// Node 测试夹具：fill.js 的填报逻辑 + 从 test/assets 读入真实照片 / 签名。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export { SAMPLE_PROJECT, SAMPLE_SETTINGS, fillReport } from './fill.js';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), 'assets');

/** 读 JPEG / PNG 尺寸（不依赖解码库） */
export function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return { w: 800, h: 600 };
}

/**
 * 生成媒体库（Map<id, Media>），Media.blob 为 Node Blob。
 */
export function sampleMedia() {
  const media = new Map();
  for (let i = 1; i <= 7; i += 1) {
    const buf = readFileSync(join(ASSETS, `photo${i}.jpg`));
    const { w, h } = imageSize(buf);
    const blob = new Blob([buf], { type: 'image/jpeg' });
    media.set(`m_photo${i}`, { id: `m_photo${i}`, kind: 'photo', blob, thumb: blob, w, h, caption: i % 3 === 0 ? `现场照片 ${i}` : '' });
  }
  const sig = readFileSync(join(ASSETS, 'signature.png'));
  const s = imageSize(sig);
  media.set('m_sig', { id: 'm_sig', kind: 'signature', blob: new Blob([sig], { type: 'image/png' }), w: s.w, h: s.h });
  const poster = media.get('m_photo3');
  media.set('m_video', {
    id: 'm_video', kind: 'video', blob: new Blob([new Uint8Array(16)], { type: 'video/mp4' }),
    thumb: poster.blob, poster: poster.blob, w: poster.w, h: poster.h, duration: 42, name: 'exit.mp4',
  });
  return media;
}

/** 媒体加载器（与浏览器 createMediaLoader 同接口的 get） */
export function mediaLoader(media) {
  return { get: async (id) => media.get(id) || null };
}

