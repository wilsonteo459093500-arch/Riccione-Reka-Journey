// 不压缩（stored）的 zip + CRC-32：几行代码、不用任何依赖；文件名 UTF-8（标志位 11）。时间取导出时间（UTC），同样的输入 → 一样的字节。

let CRC = null;
function table() {
  if (CRC) return CRC;
  CRC = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC[n] = c >>> 0;
  }
  return CRC;
}

export function crc32(bytes) {
  const t = table();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const utf8 = (s) => new TextEncoder().encode(s);

/** DOS 时间 / 日期（2 秒精度） */
function dos(now) {
  const d = new Date(now);
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  const date = ((Math.max(1980, d.getUTCFullYear()) - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}

/**
 * @param {Array<{ name: string, bytes: Uint8Array }>} files
 * @param {Date} now
 * @returns {Uint8Array}
 */
export function zip(files, now = new Date()) {
  const { time, date } = dos(now);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = utf8(f.name);
    const data = f.bytes;
    const crc = crc32(data);
    const lh = new Uint8Array(30 + name.length);
    const v = new DataView(lh.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true);
    v.setUint16(8, 0, true);
    v.setUint16(10, time, true);
    v.setUint16(12, date, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true);
    v.setUint16(28, 0, true);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length);
    const w = new DataView(ch.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x0800, true);
    w.setUint16(10, 0, true);
    w.setUint16(12, time, true);
    w.setUint16(14, date, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, data.length, true);
    w.setUint32(24, data.length, true);
    w.setUint16(28, name.length, true);
    w.setUint16(30, 0, true);
    w.setUint16(32, 0, true);
    w.setUint16(34, 0, true);
    w.setUint16(36, 0, true);
    w.setUint32(38, 0, true);
    w.setUint32(42, offset, true);
    ch.set(name, 46);
    locals.push(lh, data);
    centrals.push(ch);
    offset += lh.length + data.length;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
