// 产生 elev-baseline.json：第二版改 elevation.js 之前，drawing 样式输出的 sha1（每个基准柜子 × 3 种语言 × 有无尺寸）
import { writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { elevationScene } from '../../src/render/elevation.js';
import { baselineCases } from './baseline-cases.mjs';

export const elevHash = (c, o) => createHash('sha1').update(JSON.stringify(elevationScene(c, { style: 'drawing', ...o }))).digest('hex').slice(0, 16);
export const ELEV_OPTS = [{ lang: 'both' }, { lang: 'zh', dims: false }, { lang: 'en' }];

if (process.argv[1] && process.argv[1].endsWith('make-elev-baseline.mjs')) {
  const out = {};
  baselineCases().cabs.forEach((c) => ELEV_OPTS.forEach((o, i) => { out[`${c.id}#${i}`] = elevHash(c, o); }));
  writeFileSync(new URL('./elev-baseline.json', import.meta.url), JSON.stringify(out));
  console.log(`wrote ${Object.keys(out).length} hashes`);
}
