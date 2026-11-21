// 密码机的规则（纯逻辑，不碰画面）。FoloToy 版照 shared/codebreaker-vectors.json 对答案。
//
// 一组密码 = 几格颜色，每格是 0..colors-1 的数字。
// 每猜一次给两个数字：
//   exact = 颜色和位置都对
//   near  = 颜色对、位置不对（每个颜色最多算到它在密码里出现的次数）

export const DIFFICULTIES = {
  easy: { slots: 3, colors: 4, repeat: false, tries: 8 },
  normal: { slots: 4, colors: 6, repeat: false, tries: 10 },
  hard: { slots: 5, colors: 8, repeat: true, tries: 12 },
};

export const DIFFICULTY_IDS = Object.keys(DIFFICULTIES);

export function config(id) {
  const c = DIFFICULTIES[id];
  if (!c) throw new Error(`unknown difficulty: ${id}`);
  return c;
}

/** 这组密码合不合规则（格数、颜色范围、能不能重复） */
export function isValidCode(cfg, code) {
  if (!Array.isArray(code) || code.length !== cfg.slots) return false;
  for (const c of code) {
    if (!Number.isInteger(c) || c < 0 || c >= cfg.colors) return false;
  }
  if (!cfg.repeat && new Set(code).size !== code.length) return false;
  return true;
}

/** 打分：{ exact, near } */
export function score(secret, guess) {
  if (secret.length !== guess.length) throw new Error('length mismatch');
  let exact = 0;
  const restS = new Map();
  const restG = new Map();
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) exact++;
    else {
      restS.set(secret[i], (restS.get(secret[i]) || 0) + 1);
      restG.set(guess[i], (restG.get(guess[i]) || 0) + 1);
    }
  }
  let near = 0;
  for (const [color, n] of restG) near += Math.min(n, restS.get(color) || 0);
  return { exact, near };
}

export function isSolved(cfg, result) {
  return result.exact === cfg.slots;
}

/** 随机出题。rng() 回传 [0,1) */
export function randomCode(cfg, rng) {
  if (cfg.repeat) {
    return Array.from({ length: cfg.slots }, () => Math.floor(rng() * cfg.colors));
  }
  const pool = Array.from({ length: cfg.colors }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, cfg.slots);
}
