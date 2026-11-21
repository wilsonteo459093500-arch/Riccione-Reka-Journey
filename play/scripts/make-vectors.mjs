// 产生 shared/codebreaker-vectors.json：给 FoloToy 版密码机对答案用（npm run vectors）
import { writeFileSync } from 'node:fs';
import { DIFFICULTIES, config, randomCode, score } from '../src/games/codebreaker/rules.js';
import { mulberry32 } from '../src/lib/rng.js';

const rng = mulberry32(20261121);
const cases = [
  // 手挑的边界情况
  { secret: [0, 1, 2, 3], guess: [0, 1, 2, 3] },
  { secret: [0, 1, 2, 3], guess: [3, 2, 1, 0] },
  { secret: [0, 0, 1, 1], guess: [1, 1, 0, 0] },
  { secret: [0, 1, 2, 3], guess: [0, 0, 0, 0] },
  { secret: [1, 1, 1, 2, 2], guess: [2, 1, 2, 2, 1] },
  { secret: [7, 7, 7, 7, 7], guess: [7, 0, 7, 0, 7] },
];
for (const id of Object.keys(DIFFICULTIES)) {
  const cfg = config(id);
  for (let i = 0; i < 20; i++) cases.push({ secret: randomCode(cfg, rng), guess: randomCode(cfg, rng) });
}
const out = {
  about:
    'P.L.A.Y 密码机规则对照表。exact = 颜色和位置都对；near = 颜色对、位置不对（每个颜色最多算到它在密码里出现的次数）。颜色编号 0..colors-1，顺序见 colors。由 play/scripts/make-vectors.mjs 产生，play/test/codebreaker.test.mjs 会检查。',
  colors: ['red', 'yellow', 'blue', 'green', 'purple', 'orange', 'pink', 'teal'],
  difficulties: DIFFICULTIES,
  cases: cases.map((c) => ({ ...c, ...score(c.secret, c.guess) })),
};
writeFileSync(new URL('../shared/codebreaker-vectors.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`写了 ${out.cases.length} 组`);
