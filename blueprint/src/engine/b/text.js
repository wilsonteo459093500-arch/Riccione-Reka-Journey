// B 格物 · 均衡断行（方案页 design.js、公司页 company.js 共用）
//
// 折成 2–3 行时各行长短接近，断在好的地方：
//   最好 = 标点后（，。、；：— 以及「·」—— 行尾的「·」会去掉）；
//   次好 = 中文连词前（与 和 及 或 跟 并）、「的 / 之」后，中英文之间的空格；
//   好的断点允许比最均衡的多长 30%，其余只允许 12%；一样均衡时英文断在虚词前（and with of to the …），再一样就第一行长一点。
// 断点写成换行（每行都比栏窄，预览与 PPT 不会再自己折行）。英文按词，中文按字，标点不放行首。
// 行数不变（和贪心折行一样多），只是把字分得均匀些：不会出现「Mr & Mrs Lau Chee Keong and / Family」这种落单的一个词。

import { styleOf, runsOf, lineWidth, hasCJK } from './kit.js';

/** 一行（不折行）的宽度 px（over = 字级覆盖，如 { px, lh }） */
export const widthOf = (text, lang, role, over) => lineWidth(runsOf(String(text ?? ''), styleOf(lang, role, over), lang, role));

/** 栏宽 w 里一行实际能排的宽度（与 kit wrapCount 一致：字宽表是实测的，按 98% 算） */
export const room = (w) => w * 0.98;

const STICK_PREV = /^[，。、；：！？）」』〉》…,.;:!?)\]·・—]/;
const STICK_NEXT = /[（「『〈《(\[]$/;
const PUNCT_END = /[，。、；：！？,.;:!?—·・]$/;
const ZH_SOFT_BEFORE = /^[与和及或跟并兼暨]/;
const ZH_SOFT_AFTER = /[的之]$/;
const EN_SOFT_BEFORE = /^(&|\+|and|or|with|of|for|in|on|at|to|by|from|the|a|an)\s/i;
const SEP_END = /\s*[·・•]$/u;
const SEP_START = /^[·・•]\s*/u;

function breakTokens(line) {
  const raw = String(line).match(/[A-Za-z0-9&'’\-./%]+\s*|\s+|./gu) || [];
  const out = [];
  for (const t of raw) {
    const prev = out[out.length - 1];
    if (prev !== undefined && (STICK_PREV.test(t) || /^\s+$/.test(t) || STICK_NEXT.test(prev))) out[out.length - 1] = prev + t;
    else out.push(t);
  }
  return out;
}

/**
 * 在 prev 与 next 两个片段之间断行好不好：2 = 标点后，1 = 中文词与词之间（连词前、「的」后、中英文交界），0 = 其它。
 * 英文本来就只在词间断，虚词前断（Open to / the Garden）只在一样均衡时才优先 —— 不为它牺牲均衡
 * （样张 p6：A dining room / open to the garden，而不是 A dining room open / to the garden）
 */
function cutQuality(prev, next) {
  const p = prev.replace(/\s+$/, '');
  if (/^(the|a|an)$/i.test(p)) return -1; // 行尾不留冠词（…side of the / island）
  if (PUNCT_END.test(p)) return 2;
  if (ZH_SOFT_BEFORE.test(next) || ZH_SOFT_AFTER.test(p)) return 1;
  if (/\s$/.test(prev) && hasCJK(p.slice(-1)) !== hasCJK(next.charAt(0))) return 1;
  return 0;
}

/** 一段（不含 \n）在宽 w 的栏里均衡断行；排一行放得下、或要折 4 行以上时原样返回（over = 字级覆盖） */
export function balanceLine(line, lang, role, w, over) {
  const toks = breakTokens(line);
  if (toks.length < 2) return line;
  const tw = toks.map((t) => widthOf(t, lang, role, over));
  const trail = toks.map((t) => {
    const sp = /\s+$/.exec(t);
    return sp ? widthOf(sp[0], lang, role, over) : 0;
  });
  const pre = [0];
  tw.forEach((x, i) => pre.push(pre[i] + x));
  const span = (i, j) => pre[j + 1] - pre[i] - trail[j];
  const avail = room(w);
  let n = 1;
  let start = 0;
  for (let j = 0; j < toks.length; j++) {
    if (j > start && span(start, j) > avail) {
      n += 1;
      start = j;
    }
  }
  if (n < 2 || n > 3) return line;
  const T = toks.length;
  const q = toks.map((t, j) => (j === 0 ? 0 : cutQuality(toks[j - 1], t)));
  const qe = toks.map((t) => (EN_SOFT_BEFORE.test(t) ? 1 : 0));
  const cands = [];
  const consider = (cuts) => {
    const b = [0, ...cuts, T];
    let mx = 0;
    for (let k = 0; k < b.length - 1; k++) {
      const wk = span(b[k], b[k + 1] - 1);
      if (wk > avail) return;
      mx = Math.max(mx, wk);
    }
    const qs = cuts.map((c) => q[c]);
    cands.push({
      cuts,
      mx: Math.round(mx * 10) / 10,
      qual: qs.reduce((a, c) => a + c, 0),
      soft: qs.every((x) => x > 0),
      en: cuts.reduce((a, c) => a + qe[c], 0),
      first: span(0, b[1] - 1),
    });
  };
  if (n === 2) for (let a = 1; a < T; a++) consider([a]);
  else for (let a = 1; a < T - 1; a++) for (let c = a + 1; c < T; c++) consider([a, c]);
  if (!cands.length) return line;
  const opt = Math.min(...cands.map((c) => c.mx));
  const ok = cands.filter((c) => c.mx <= opt * (c.soft ? 1.3 : 1.12) + 0.01);
  ok.sort((a, b) => b.qual - a.qual || a.mx - b.mx || b.en - a.en || b.first - a.first);
  const bounds = [0, ...ok[0].cuts, T];
  return bounds
    .slice(0, -1)
    .map((s, k) =>
      toks
        .slice(s, bounds[k + 1])
        .join('')
        .trim()
        .replace(SEP_END, '')
        .replace(SEP_START, ''),
    )
    .join('\n');
}

/** 整段（\n 分段）均衡断行 */
export const balanceText = (text, lang, role, w, over) =>
  String(text ?? '')
    .split('\n')
    .map((p) => balanceLine(p, lang, role, w, over))
    .join('\n');
