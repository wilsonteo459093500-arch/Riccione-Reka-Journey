// 可重现的随机数（测试用固定种子；正式用 crypto 当种子）

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 2 ** 32);
}

export function makeRng(seed = randomSeed()) {
  return mulberry32(seed);
}

// 房号：去掉容易看错的字（0/O、1/I/L）
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function roomCode(rng, length = 4) {
  let s = '';
  for (let i = 0; i < length; i++) s += CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)];
  return s;
}

export function normalizeRoomCode(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export function isRoomCode(s) {
  return typeof s === 'string' && s.length >= 4 && s.length <= 8 && [...s].every((c) => CODE_CHARS.includes(c));
}

export function randomId(rng = makeRng()) {
  let s = '';
  for (let i = 0; i < 12; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rng() * 36)];
  return s;
}
