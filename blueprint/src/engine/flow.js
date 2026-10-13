// 公司固定页的「栏内顺排」：English / 中英版的字比定稿长时，同一栏下面的元素跟着往下挪；
// 整栏超出底线就把这一栏改过的字缩小（先缩正文，不够再缩全部）。华文版不经过这里（定稿原样）。
// 纯函数：输入 / 输出都是元素数组（下标与模板一致，隐藏的元素为 null），Node 可测。

import { countLines, lineHeightPx, measureText } from './spec.js';
import { PX_PER_PT } from '../theme.js';

const INSET = (25400 / 9525) * 2; // 文字框上下内边距（与 SlideCanvas / PPT 一致）

// 每行实际占的高度。通用估算（spec.js lineHeightPx）按 1.2 × 字号，实际都更高：
//   PPT：按字体的上下伸算单倍行距 —— 定稿 PPT 里多行文字框的高度反推，思源宋体 ≈ 1.34–1.40 × 字号
//   网页预览：段落「支柱」（页面字体 Outfit 16px）与文字的基线位置不同，每行再多出约 (a × 字号px − b) / 2
// 顺排取两者大的，宁高勿低。
const PPT_PITCH = { serif: 1.4, sans: 1.3, display: 1.3 };
const STRUT = { serif: [1, 16], sans: [1, 18], display: [0.6, 9.6] };

/** 一行的实际高度（px） */
export function linePitch(font, sizePt, pct = 100) {
  const s = sizePt * PX_PER_PT;
  const k = pct / 100;
  const [a, b] = STRUT[font] || STRUT.serif;
  return Math.max(s * k * (PPT_PITCH[font] || 1.4), lineHeightPx(sizePt, pct) + Math.max(0, (a * s - b) / 2));
}

// 实际字宽 / measureText 估算（网页字体实测）：宋体英文 0.97–1.06、Outfit 0.87–0.91、Ogg（回退 Cormorant）≈ 0.7
const WIDTH_K = { serif: 1, sans: 0.92, display: 0.8 };

/** 一段文字一行排下来的实际宽度（估算） */
export const realWidth = (runs) => runs.reduce((w, r) => w + measureText(r.text, r.font, r.size || 18, r.spacing || 0) * (WIDTH_K[r.font] ?? 1), 0);

// 折行：countLines 本身按 94% 的宽折行（给缩字号用，偏保守）；顺排按实际字宽、97% 的宽折，
// 免得窄栏里平白多估一行、把整栏挤得缩字
const flowW = (w, font) => ((w - 5.3) * 0.97) / (0.94 * (WIDTH_K[font] ?? 1)) + 6;

/** 文字占的高度（估算） */
export function textHeight(el) {
  if (!el || el.t !== 'text') return el?.h || 0;
  let h = 0;
  for (const p of el.paras || []) {
    const runs = p.runs || [];
    const r0 = runs[0] || {};
    const size = Math.max(...runs.map((r) => r.size || 18), 1);
    const str = runs.map((r) => r.text).join('');
    const lines = el.nowrap ? 1 : countLines(str, r0.font, size, r0.spacing || 0, flowW(el.w, r0.font));
    h += lines * linePitch(r0.font, size, p.lineSpacing || 100);
  }
  return h + INSET;
}

/** 定稿原文的下沿（相对框顶）：按估算的行数，不超过原框高 */
const contentH = (el) => {
  if (!el) return 0;
  if (el.t !== 'text') return el.h;
  return Math.min(el.h, textHeight(el));
};

/** PPT 里一行的高度 */
const pptPitch = (font, sizePt, pct = 100) => sizePt * PX_PER_PT * (pct / 100) * (PPT_PITCH[font] || 1.4);

/**
 * 定稿原文在这套估算里占多高：估算的行数偶尔偏多（中文标点、折行规则）→ 用原框能装的行数封顶
 * （定稿的框是按 PPT 的实际行高量的，换算成这套估算的行高）
 */
function refTextHeight(ref) {
  const est = textHeight(ref);
  const p0 = ref.paras?.[0];
  const r0 = p0?.runs?.[0];
  if (!r0) return est;
  const size = Math.max(...p0.runs.map((r) => r.size || 18), 1);
  const pct = p0.lineSpacing || 100;
  return Math.min(est, (ref.h - INSET) * (linePitch(r0.font, size, pct) / pptPitch(r0.font, size, pct)) + INSET);
}

/**
 * 换过字的框：新的框高 h、内容下沿 bottom（相对框顶）
 *   English：放得进定稿的框 → 和定稿一样（不挪）；放不下 → 框加高，多出来的往下推
 *   中英（addedParas = 后面加了几段英文）：中文原样，英文接在中文下面
 */
function extent(el, refEl) {
  const zhBottom = contentH(refEl);
  if (el.t !== 'text') return { h: el.h, bottom: el.h, refBottom: zhBottom };
  if (!el.changed) return { h: el.h, bottom: zhBottom, refBottom: zhBottom };
  if (el.addedParas) {
    const extra = textHeight({ ...el, paras: el.paras.slice(-el.addedParas) }) - INSET;
    const bottom = zhBottom + extra;
    return { h: Math.max(el.h, bottom), bottom, refBottom: zhBottom };
  }
  // 能用的高度：定稿的框；定稿原文本身就比框高（大字号在预览里行距更大）时以原文为准 —— 行数和定稿一样就不挪
  const room = Math.max(refEl.h, refTextHeight(refEl));
  const over = textHeight(el) - room;
  if (over <= 0) return { h: el.h, bottom: zhBottom, refBottom: zhBottom };
  // 英文把框占满还多出来：和下一块的间距从「框底」量（定稿里字没占满框时，空着的那截不算间距）
  return { h: el.h + over, bottom: room + over, refBottom: room };
}

// 中英版里的英文最小缩到这么大（再小就看不清了）：放不下说明这一页的英文该写短 / 换版式，不靠缩字
const BI_MIN_PT = 13;

/** 把改过的文字框的字号乘 k（只缩不超过 maxSize 的字；中英版只缩英文 run，中文保持定稿字号） */
function scaleEl(el, k, maxSize = Infinity) {
  if (!el || el.t !== 'text') return el;
  const bi = el.addedParas !== undefined;
  const scaleRun = (r) => {
    if ((bi && !r.en) || (r.size || 18) > maxSize) return r;
    const size = Math.round((r.size || 18) * k * 2) / 2;
    const floor = bi && r.text ? Math.min(r.size || 18, BI_MIN_PT) : 0;
    const kk = Math.max(size, floor) / (r.size || 18);
    return { ...r, size: Math.max(size, floor), ...(r.spacing ? { spacing: Math.round(r.spacing * kk * 100) / 100 } : {}) };
  };
  return { ...el, paras: el.paras.map((p) => ({ ...p, runs: p.runs.map(scaleRun) })) };
}

/**
 * 一栏顺排：返回新的元素数组（只改这一栏里元素的 y / h）和最后的下沿
 * @param {Array<object|null>} cur   当前元素（换过字；隐藏的 = null）
 * @param {Array<object>} ref        参照元素（同样的位置，定稿原文）—— 用来量原来的间距
 * @param {{ items:Array<number|number[]>, bottom?:number, minGap?:number }} flow
 * @param {number} c                 被往下推时，原来的间距保留几成（1 = 全留；不够放再压，最少压到 minGap）
 */
function runFlow(cur, ref, flow, c = 1) {
  const out = [...cur];
  let prevBottom = null;
  let prevRefBottom = null;
  for (const item of flow.items) {
    const idxs = (Array.isArray(item) ? item : [item]).filter((i) => ref[i]);
    if (!idxs.length) continue;
    const refTop = Math.min(...idxs.map((i) => ref[i].y));
    // 隐藏的元素也按定稿占着位置（版面其余不动）
    const exs = idxs.map((i) => (out[i] ? extent(out[i], ref[i]) : null));
    const refBottom = Math.max(...idxs.map((i, k) => ref[i].y + (exs[k] ? exs[k].refBottom : contentH(ref[i]))));
    let top = refTop;
    if (prevBottom != null) {
      // 定稿里的间距（重叠的框保持原样重叠）；往下推时可以压，但不往上挪
      const gap = refTop - prevRefBottom;
      const g = gap > 0 ? Math.max(Math.min(gap, flow.minGap ?? gap), gap * c) : gap;
      top = Math.max(refTop, prevBottom + g);
    }
    const shift = top - refTop;
    let bottom = refBottom + shift;
    idxs.forEach((i, k) => {
      if (!out[i]) return;
      const y = ref[i].y + shift;
      out[i] = { ...out[i], y, h: exs[k].h };
      bottom = Math.max(bottom, y + exs[k].bottom);
    });
    prevBottom = bottom;
    prevRefBottom = refBottom;
  }
  return { els: out, bottom: prevBottom ?? 0 };
}

/**
 * 按页面的栏定义顺排；超出底线：先把被推开的间距往回压（最少到 minGap），还不够再缩改过的字（正文 → 全部）
 * @param {Array<object|null>} cur
 * @param {Array<object>} ref
 * @param {Array<object>} flows
 */
export function applyFlows(cur, ref, flows = []) {
  let els = cur;
  for (const flow of flows) {
    const members = new Set(flow.items.flat());
    const limit = (flow.bottom ?? 960) + 0.5;
    let attempt = runFlow(els, ref, flow, 1);
    for (const c of [0.75, 0.5, 0.25, 0]) {
      if (attempt.bottom <= limit) break;
      attempt = runFlow(els, ref, flow, c);
    }
    if (attempt.bottom > limit) {
      const base = els;
      const tryScale = (k, maxSize) => runFlow(base.map((el, i) => (members.has(i) && el?.changed ? scaleEl(el, k, maxSize) : el)), ref, flow, 0);
      let done = false;
      // 先只缩正文（≤ 24pt），再连标题一起缩
      for (const maxSize of [24, Infinity]) {
        for (let k = 0.96; k >= (maxSize === 24 ? 0.7 : 0.6) - 1e-9; k = Math.round((k - 0.04) * 100) / 100) {
          attempt = tryScale(k, maxSize);
          if (attempt.bottom <= limit) {
            done = true;
            break;
          }
        }
        if (done) break;
      }
    }
    els = attempt.els;
  }
  return els;
}
