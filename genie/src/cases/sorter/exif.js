// 只读照片文件开头的一小段（≤ 128 KB）：尺寸、拍摄时间、方向、相机 —— 不解码整张图。
// JPEG（EXIF APP1 + SOF）、PNG（IHDR）、WebP（VP8 / VP8L / VP8X）。读不到的字段就是 null。

const ascii = (dv, off, len) => {
  let s = '';
  for (let i = 0; i < len && off + i < dv.byteLength; i++) {
    const c = dv.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
};

/** 「2024:05:17 14:32:08」→ 毫秒（当成本地时间；只用来比前后、算间隔） */
export function exifDate(s) {
  const m = /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  const [, Y, M, D, h, mi, se] = m.map(Number);
  if (Y < 1990 || M < 1 || M > 12) return null;
  return Date.UTC(Y, M - 1, D, h, mi, se);
}

function readIFD(dv, tiff, off, le, out, depth = 0) {
  if (depth > 2 || off + 2 > dv.byteLength) return;
  const n = dv.getUint16(off, le);
  for (let i = 0; i < n; i++) {
    const e = off + 2 + i * 12;
    if (e + 12 > dv.byteLength) return;
    const tag = dv.getUint16(e, le);
    const type = dv.getUint16(e + 2, le);
    const count = dv.getUint32(e + 4, le);
    const valOff = e + 8;
    const ptr = () => tiff + dv.getUint32(valOff, le);
    const num = () => (type === 3 ? dv.getUint16(valOff, le) : type === 4 ? dv.getUint32(valOff, le) : null);
    const str = () => (count <= 4 ? ascii(dv, valOff, count) : ascii(dv, ptr(), count));
    switch (tag) {
      case 0x0112:
        out.orientation = num();
        break;
      case 0x010f:
        out.make = str();
        break;
      case 0x0110:
        out.model = str();
        break;
      case 0x0131:
        out.software = str();
        break;
      case 0x0132:
        out.dateTime = exifDate(str());
        break;
      case 0x9003:
        out.dto = exifDate(str());
        break;
      case 0xa002:
        out.exifW = num();
        break;
      case 0xa003:
        out.exifH = num();
        break;
      case 0x8769: // Exif sub-IFD
        readIFD(dv, tiff, ptr(), le, out, depth + 1);
        break;
      default:
    }
  }
}

function jpeg(dv, out) {
  let p = 2;
  while (p + 4 <= dv.byteLength) {
    if (dv.getUint8(p) !== 0xff) {
      p++;
      continue;
    }
    const marker = dv.getUint8(p + 1);
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
      p += marker === 0xff ? 1 : 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const len = dv.getUint16(p + 2);
    const seg = p + 4;
    if (marker === 0xe1 && ascii(dv, seg, 4) === 'Exif') {
      const tiff = seg + 6;
      if (tiff + 8 <= dv.byteLength) {
        const le = dv.getUint16(tiff) === 0x4949;
        const ifd0 = tiff + dv.getUint32(tiff + 4, le);
        try {
          readIFD(dv, tiff, ifd0, le, out);
        } catch {
          /* 坏的 EXIF：忽略 */
        }
      }
      out.exif = true;
    }
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      if (seg + 5 <= dv.byteLength) {
        out.h = dv.getUint16(seg + 1);
        out.w = dv.getUint16(seg + 3);
      }
      break;
    }
    p += 2 + len;
  }
}

/**
 * buf：ArrayBuffer（文件开头一段）。→ { type, w, h, orientation, dto, dateTime, make, model, software, exif }
 * w / h 是「转正以后」的尺寸（方向 5–8 = 竖着拍，宽高对调）。
 */
export function readMeta(buf) {
  const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer);
  const out = { type: null, w: null, h: null, orientation: null, dto: null, dateTime: null, make: '', model: '', software: '', exif: false };
  if (dv.byteLength < 12) return out;
  if (dv.getUint16(0) === 0xffd8) {
    out.type = 'jpeg';
    jpeg(dv, out);
  } else if (dv.getUint32(0) === 0x89504e47) {
    out.type = 'png';
    if (dv.byteLength >= 24) {
      out.w = dv.getUint32(16);
      out.h = dv.getUint32(20);
    }
  } else if (ascii(dv, 0, 4) === 'RIFF' && ascii(dv, 8, 4) === 'WEBP') {
    out.type = 'webp';
    const kind = ascii(dv, 12, 4);
    if (kind === 'VP8 ' && dv.byteLength >= 30) {
      out.w = dv.getUint16(26, true) & 0x3fff;
      out.h = dv.getUint16(28, true) & 0x3fff;
    } else if (kind === 'VP8L' && dv.byteLength >= 25) {
      const b = dv.getUint32(21, true);
      out.w = (b & 0x3fff) + 1;
      out.h = ((b >> 14) & 0x3fff) + 1;
    } else if (kind === 'VP8X' && dv.byteLength >= 30) {
      out.w = 1 + (dv.getUint8(24) | (dv.getUint8(25) << 8) | (dv.getUint8(26) << 16));
      out.h = 1 + (dv.getUint8(27) | (dv.getUint8(28) << 8) | (dv.getUint8(29) << 16));
    }
  } else if (ascii(dv, 4, 4) === 'ftyp') {
    const brand = ascii(dv, 8, 4).toLowerCase();
    out.type = /hei|mif|hev|msf/.test(brand) ? 'heic' : brand.startsWith('avi') ? 'avif' : 'iso';
  }
  if (out.w == null && out.exifW) {
    out.w = out.exifW;
    out.h = out.exifH;
  }
  if (out.orientation >= 5 && out.orientation <= 8 && out.w && out.h) [out.w, out.h] = [out.h, out.w];
  delete out.exifW;
  delete out.exifH;
  return out;
}
