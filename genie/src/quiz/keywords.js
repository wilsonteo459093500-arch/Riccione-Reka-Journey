// 设计师版的「出图关键词」：牌面的英文关键词（dreamers.js 的 design.en），按这一位客人改写 ——
//   1. 雷区 / 生活方式换掉的材质，在关键词里也换掉（nero marquina marble → sintered stone）；
//   2. 换不掉、又踩到雷区的说法（glass display cabinets、open shelving…）整段拿掉；
//   3. 最后加上「avoid: …」（客人的雷区，英文）。
// 关键词永远是英文（贴给 AI 出图工具用）。复制按钮复制的也是这一段。
// 柜门那一行：换掉的材质如果正好写在柜门的说法里，或者换的是柜体，给一行小注（doorNotes）。

import { MAT_BY_ID } from '../shared/materials.js';
import { AVOID_LABEL } from '../shared/summary.js';
import EN from '../shared/i18n/en.js';

/** 关键词里怎么称呼某种材质（长的在前；[说法, 换成] 的「换成」里 {to} = 新材质）。没列的用英文名。 */
const ALIAS = {
  'white-oak': ['white oak', ['flat-panel oak cabinetry', 'flat-panel {to} cabinetry']],
  'light-oak': ['warm natural oak', 'natural oak'],
  'herringbone-oak': ['herringbone oak', ['herringbone floor', '{to} floor']],
  'greige-oak': ['greige oak'],
  teak: ['teak'],
  cherry: ['cherry wood', 'cherry'],
  'smoked-oak': ['smoked oak'],
  walnut: ['walnut'],
  'ebony-oak': ['ebonized oak'],
  maple: ['maple'],
  carrara: ['carrara marble', 'carrara'],
  calacatta: ['calacatta marble', 'calacatta gold', 'calacatta'],
  travertine: ['travertine'],
  terrazzo: ['terrazzo'],
  microcement: ['microcement'],
  sintered: ['sintered stone'],
  verde: ['verde marble'],
  nero: ['nero marquina marble', 'nero marquina'],
  'terracotta-tile': ['terracotta'],
  'gallery-white': [['white walls', '{to} walls']],
  'sand-limewash': ['sand limewash', 'limewash'],
  'dusty-blue': ['dusty blue'],
  terracotta: ['terracotta'],
  'navy-paint': ['midnight blue', ['navy feature wall', '{to} feature wall']],
  'white-lacquer': ['white lacquer'],
  'cream-lacquer': ['cream lacquer'],
  'sage-lacquer': ['sage green lacquer', 'sage lacquer'],
  linen: ['linen'],
  boucle: ['bouclé', 'boucle'],
  'ochre-velvet': ['ochre velvet'],
  'navy-velvet': ['navy velvet'],
  'emerald-velvet': ['emerald velvet'],
  'rust-wool': ['rust wool'],
  'cognac-leather': ['cognac leather'],
  'black-leather': ['black leather'],
  rattan: ['rattan cane', 'rattan'],
  'grey-wool': ['light grey wool', 'grey wool'],
  'sage-linen': ['sage linen'],
  brass: ['brushed brass', 'brass'],
  bronze: ['bronze'],
  gunmetal: ['gunmetal'],
  steel: ['stainless steel'],
};

/** 换进来的材质在关键词里的说法（英文名里有逗号、或太像产品名的，改成出图用的说法） */
const KW_NAME = {
  nero: 'nero marquina marble',
  carrara: 'carrara marble',
  calacatta: 'calacatta marble',
  verde: 'verde marble',
  'quartz-travertine': 'travertine-look quartz',
  'quartz-calacatta': 'calacatta-look quartz',
  'quartz-white': 'pure white quartz',
  'sintered-light': 'light sintered stone',
  'zellige-white': 'white zellige tile',
  'zellige-sage': 'sage zellige tile',
  'cream-tile': 'cream slab tile',
  'grey-tile': 'matte grey tile',
  'terracotta-tile': 'terracotta tile',
  steel: 'stainless steel',
  'black-matte': 'matte black',
  'matte-black': 'matte black metal',
  'navy-paint': 'midnight blue',
  'ebony-oak': 'ebonized oak',
};

/** 换不掉的材质 / 做法：关键词里出现就整段拿掉（只看原文，不看换进来的新词） */
const RULED_OUT = {
  glassdoor: /\bglass\b/i,
  openshelf: /\bopen (shel|book)|bookshel/i,
  herringbone: /herringbone/i,
  wallpaper: /wallpaper/i,
  marble: /\bmarble\b|calacatta|carrara|marquina/i,
  velvet: /velvet/i,
  leather: /leather/i,
  rattan: /rattan|\bcane\b/i,
  concrete: /concrete|cement/i,
  glossy: /lacquer|gloss/i,
  gold: /brass|\bgold\b|gilded/i,
};

/** 不是材质、只是颜色的说法（黑框玻璃柜）：踩到颜色雷区时改成中性的说法 */
const RECOLOUR = {
  black: [
    [/\bblack metal frame\b/gi, 'slim metal frame'],
    [/\bblack[- ]framed\b/gi, 'slim-framed'],
  ],
};

const kwName = (id) => KW_NAME[id] || String(MAT_BY_ID[id]?.en || id).toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SLOT = '\u0000';

/** 客人的雷区 → 英文短语（「Yellow / gold」→「yellow, gold」） */
export function avoidWords(avoid = []) {
  return avoid.map((a) => String(EN[AVOID_LABEL[a]] || a).toLowerCase().replace(/\s*\/\s*/g, ', '));
}

/** 这一位客人的出图关键词（英文） */
export function renderKeywords(base, profile = {}) {
  // 同一个表面先按雷区换、再按生活方式换（岩板 → 黑金花 → 石英石）：只看最初和最后
  const chain = new Map();
  for (const sw of [...(profile.swaps || []), ...(profile.lifeSwaps || [])]) {
    if (!sw?.from || !sw?.to) continue;
    const k = sw.slot || `${sw.from}>${sw.to}`;
    chain.set(k, { from: chain.get(k)?.from || sw.from, to: sw.to });
  }
  const swaps = [...chain.values()].filter((s) => s.from !== s.to);
  // 先把要换的说法换成占位符，最后再填回去：新词不会再被下一条替换改到（walnut → smoked oak → teak）
  const fills = [];
  let s = String(base || '');
  for (const sw of swaps) {
    const to = kwName(sw.to);
    for (const a of ALIAS[sw.from] || [String(MAT_BY_ID[sw.from]?.en || '').toLowerCase()].filter(Boolean)) {
      const [from, tpl] = Array.isArray(a) ? a : [a, '{to}'];
      const re = new RegExp(`(^|[^a-z\\u00c0-\\u024f])(${esc(from)})(?=[^a-z\\u00c0-\\u024f]|$)`, 'gi');
      s = s.replace(re, (all, pre) => {
        fills.push(tpl.replace('{to}', to));
        return `${pre}${SLOT}${fills.length - 1}${SLOT}`;
      });
    }
  }
  const avoid = profile.avoid || [];
  for (const a of avoid) for (const [re, to] of RECOLOUR[a] || []) s = s.replace(re, to);
  const seen = new Set();
  const terms = s
    .split(/\s*,\s*/)
    .filter((term) => {
      const original = term.replace(new RegExp(`${SLOT}\\d+${SLOT}`, 'g'), ' ');
      return term.trim() && !avoid.some((a) => RULED_OUT[a]?.test(original));
    })
    .map((term) => term.replace(new RegExp(`${SLOT}(\\d+)${SLOT}`, 'g'), (all, i) => fills[+i]).trim())
    .filter((term) => {
      const k = term.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const out = terms.join(', ');
  const words = avoidWords(avoid);
  return words.length ? `${out}, avoid: ${words.join(', ')}` : out;
}

/**
 * 柜门那一行的小注：雷区换掉的材质正好是柜体，或写在柜门的说法里（黄铜拉手、玻璃展示柜…）。
 * → [{ kind: 'swap', from, to } | { kind: 'avoid', tag }]（文字在 Blueprint 里按当前语言组）
 */
export function doorNotes(doorsZh, profile = {}) {
  const doorsEn = String(EN[doorsZh] || '').toLowerCase();
  const out = [];
  const seen = new Set();
  // 同一种材质在几个表面都换了：柜体那一条优先（柜门说的就是柜体）
  const swaps = (profile.swaps || []).filter((sw) => sw?.from && sw?.to).sort((a, b) => (b.slot === 'cabinetry') - (a.slot === 'cabinetry'));
  for (const sw of swaps) {
    const names = (ALIAS[sw.from] || [String(MAT_BY_ID[sw.from]?.en || '').toLowerCase()]).map((a) => (Array.isArray(a) ? a[0] : a));
    const inDoors = names.some((n) => n && doorsEn.includes(n.replace(/ cabinetry$/, '')));
    if ((sw.slot === 'cabinetry' || inDoors) && !seen.has(sw.from)) {
      seen.add(sw.from);
      out.push({ kind: 'swap', from: sw.from, to: sw.to });
    }
  }
  for (const tag of profile.avoid || []) {
    if ((tag === 'glassdoor' || tag === 'openshelf') && RULED_OUT[tag].test(doorsEn)) out.push({ kind: 'avoid', tag });
  }
  return out;
}
