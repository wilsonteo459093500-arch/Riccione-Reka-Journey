// ============================================================
// Excel 导出 XLSX EXPORT
// ------------------------------------------------------------
// 只读文档模型（lib/docmodel.js → { meta, blocks }），与 PDF / Word 内容一致。
// 浏览器（Vite 动态 import）与 Node（测试）通用：writeBuffer → Blob。
//
// 两张表：
//   ① 报告：可直接打印的 A4 表单（抬头 / 信息栏 / 章节 / 检查表 / 照片 / 统计 / 签名）
//   ② 数据 Data：一行一个检查项 + 字段 + 表格，方便筛选、统计、导入 Lark
//
// exportXlsx(model, media, { logo }) → Promise<Blob>
//   media.get(id) → { kind, blob, thumb, poster?, w, h, duration?, caption? } | null
//
// 语言（lib/lang.js）：model.meta.lang = 'zh' | 'en' | 'both'（没有 = 双语）。模型里的 { zh, en } 标签已按语言规整
// （zh 模式 en 为空，en 模式 zh 为空），这里一律经 lab() → labelParts() 取「主 / 副」两行：单语时只有主行，不留空的副行。
// 写死的成对文字（表头、「续」、照片占位、页脚页码、生成时间、表名、数据页表头…）走 say() / tx()；
// 纯英文文件里不用全角标点（：（）　），连主题里的字体名也换成英文名（latinTheme）。双语（both）的输出必须和以前逐字节一样。
// 单语排版：表头只有一行粗体主行，窄格放不下长英文单词时降字号（headSize）；数据页 8 列，表格列按需要合并（dataSpans）。
// ============================================================
import { modelMedia } from '../docmodel.js';
import { labelParts, localize, normLang, tx } from '../lang.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ---------- 品牌色 ----------
const C = {
  ink: 'FF2B2A27',
  body: 'FF55524B',
  muted: 'FF8A857C',
  faint: 'FFB3ACA0',
  line: 'FFE4DCCB',
  cream: 'FFF8F4EB',
  cream2: 'FFF1EBDE',
  white: 'FFFFFFFF',
  terra: 'FFB5623A',
};
// warn 用 PDF（components/doc/theme.js）的琥珀色：与 fail 的红区分开（有条件开工 ≠ NO-GO）
const TONE = { pass: 'FF3F7A4F', fail: 'FFB8452F', na: 'FF8A857C', warn: 'FFB7791F', neutral: 'FF55524B' };
const TINT = { pass: 'FFEAF2EC', fail: 'FFF8E5E0', na: 'FFF1EFEA', warn: 'FFFBF3E1', neutral: 'FFF8F4EB' };
const FONT = 'Microsoft YaHei';

// ---------- 版式：8 列网格 ----------
// A 序号 | B 检查项 | C 标准 | D 方法 | E F G 结果 | H 备注
const COLS = [6, 30, 22, 15, 8, 8, 8, 24];
const NCOL = COLS.length;
const colPx = (w) => Math.round(w * 7 + 5); // Excel 默认字体下的列宽像素（近似）
const COL_PX = COLS.map(colPx);
const COL_X = COL_PX.map((_, i) => COL_PX.slice(0, i).reduce((s, w) => s + w, 0)); // 每列左边缘 px
const EMU_PX = 9525;
const EMU_PT = 12700;
const PHOTO_H = 96; // 照片高度 px
const PHOTO_MAX_W = 150;
const GAP = 8;

// ---------- 小工具 ----------
const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const clean = (s) => (s == null ? '' : String(s).replace(BAD, ''));

/**
 * 标签 → { main, sub }：主行 / 副行（labelParts：主 = 中文，没有中文就是英文；副 = 有中文时的英文）。
 * 双语时 = 中文 / 英文；纯中文 / 纯英文文件只有主行。
 */
function lab(x) {
  if (x == null || x === '') return { main: '', sub: '' };
  if (typeof x === 'string' || typeof x === 'number') return { main: clean(x).trim(), sub: '' };
  const { primary, secondary } = labelParts({ zh: clean(x.zh || '').trim(), en: clean(x.en || '').trim() });
  return secondary === primary ? { main: primary, sub: '' } : { main: primary, sub: secondary };
}
/** 标签拼成一段（双语「中文 English」，sep 可换成换行） */
const oneLine = (x, sep = ' ') => {
  const l = lab(x);
  return [l.main, l.sub].filter(Boolean).join(sep);
};
/**
 * 抬头小字 / 图例 / 页脚（meta.kicker / legend / footer）：一般是字符串（原样写，双语逐字节不变）；
 * 核心按语言规整后也可能是 { zh, en }（PDF / Word 的 textOf 同样接受）→ 拼成一行，不会把对象当文字写出来
 */
const metaText = (x) => (x == null ? '' : typeof x === 'string' ? x : oneLine(x));
/**
 * 「中文位 / 英文位」：双语 = 主 / 副；单语时整段放进对应语言的位置
 * （节标题「EN · 中文」这种排法用：英文位照旧大写，纯英文文件的节标题也大写）
 */
function slots(x, lang) {
  const l = lab(x);
  if (l.sub) return { zh: l.main, en: l.sub };
  return lang === 'en' ? { zh: '', en: l.main } : { zh: l.main, en: '' };
}
/**
 * 写死的文字按语言取：zh / en 各一种；双语给 both（不给 = 「中文 English」）。
 * 双语文件里原来只写中文的（如「（续）」「共 n 项」「生成于」）用 both 保持逐字不变。
 */
const say = (lang, zh, en, both) => (lang === 'both' && both != null ? both : tx(lang, zh, en));
/** 全角 / 半角标点：纯英文文件不出现全角（：（）　） */
const colonOf = (lang) => (lang === 'en' ? ': ' : '：');
const sepOf = (lang) => (lang === 'en' ? '  ·  ' : '　·　');
const contOf = (lang) => (lang === 'en' ? '(cont.)' : '（续）');
const parens = (lang, s) => (lang === 'en' ? `(${s})` : `（${s}）`);
const mediaTag = (lang) => (lang === 'en' ? '[PHOTO]' : '【影像】');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;

/**
 * 单语文件：模板给了 zhOnly / enOnly（原表只有中文的标签配的英文整句、「中英写在一行」的图例行、
 * 「厨房 Kitchen」这种选项的单语写法）就用它 —— zh → { zh: zhOnly, en: '' }，en → { zh: '', en: enOnly }。
 * lib/lang.js 的 localize 已经处理过的，这里结果不变（幂等）；双语原样返回同一个对象。
 */
function pickOnly(model, lang) {
  if (lang === 'both' || !model) return model;
  const key = lang === 'zh' ? 'zhOnly' : 'enOnly';
  const walk = (n) => {
    if (n == null || typeof n !== 'object') return n;
    if (Array.isArray(n)) {
      const arr = n.map(walk);
      return arr.some((x, i) => x !== n[i]) ? arr : n;
    }
    let out = n;
    for (const [k, v] of Object.entries(n)) {
      const w = walk(v);
      if (w !== v) {
        if (out === n) out = { ...n };
        out[k] = w;
      }
    }
    const only = n[key];
    if (typeof only === 'string' && only.trim()) {
      const zh = lang === 'zh' ? only : '';
      const en = lang === 'en' ? only : '';
      if (out.zh !== zh || out.en !== en) out = { ...out, zh, en };
    }
    return out;
  };
  return walk(model);
}

/**
 * 页脚 / 文件属性里的报告名。自动生成的是「模板中文名 · 项目（客户）· 日期」：纯英文文件里开头的模板名
 * 换成英文标题，自动加的全角括号换成半角（项目名 / 客户 / 日期本身原样）。与 PDF 页脚同一规则。
 */
function reportName(meta, lang) {
  const rt = clean(metaText(meta.reportTitle));
  if (lang !== 'en' || !CJK.test(rt)) return rt;
  const parts = rt.split(' · ');
  const name = oneLine(meta.title);
  if (CJK.test(parts[0]) && name) parts[0] = name;
  return parts.join(' · ').replace(/\s*（([^（）]*)）/g, ' ($1)');
}

// ---------- 行数估算 ----------
// 字宽单位：1 ≈ 1/1.1 个 Excel 列宽字符。中文 2；大写字母、数字、m / w 这类宽字母更宽
// （全大写、编号多的英文按 1 算会少算行，文字掉出格子底部）
const wide = (ch) => ch.charCodeAt(0) > 0x2e7f;
const unitsOf = (ch) => (wide(ch) ? 2 : /[A-Zmw@%#&]/.test(ch) ? 1.4 : /[0-9]/.test(ch) ? 1.25 : 1);
const NO_START = /[，。、；：！？）」』】》〉]/; // 避头：中文标点不放行首，跟着前一个字
// 每行能放几个单位。Excel / LibreOffice 按整数像素画字：9.5pt 和 10pt 一样大（13px），8pt 是 11px
const capOf = (widthChars, fontPt) => Math.max(4, widthChars * 1.1) / (Math.round((fontPt * 4) / 3) / 13);

/**
 * 一段文字（不含换行）按每行 cap 个单位贪心折行，返回每行开头的下标（chars 里的位置）。
 * 和 Excel 一样只在空格后、中文字前后换行；英文单词放不下整个挪到下一行，比一整行还长的串（网址等）才按字断。
 */
function wrapStarts(chars, cap) {
  const starts = [0];
  let x = 0;
  let i = 0;
  while (i < chars.length) {
    let j = i;
    if (wide(chars[j])) j += 1;
    else while (j < chars.length && chars[j] !== ' ' && !wide(chars[j])) j += 1;
    while (j < chars.length && NO_START.test(chars[j])) j += 1;
    let k = j;
    while (k < chars.length && chars[k] === ' ') k += 1; // 行尾的空格不占地方
    let body = 0;
    for (let t = i; t < j; t += 1) body += unitsOf(chars[t]);
    if (x > 0 && x + body > cap) {
      starts.push(i);
      x = 0;
    }
    if (body > cap) {
      for (let t = i; t < j; t += 1) {
        const u = unitsOf(chars[t]);
        if (x > 0 && x + u > cap) {
          starts.push(t);
          x = 0;
        }
        x += u;
      }
    } else x += body;
    x += k - j;
    i = k;
  }
  return starts;
}

/** 文本在给定列宽（字符）里大约占几行 */
function lines(text, widthChars, fontPt = 10) {
  if (!text) return 1;
  const cap = capOf(widthChars, fontPt);
  let n = 0;
  for (const para of String(text).split('\n')) n += wrapStarts([...para], cap).length;
  return n;
}
const spanWidth = (c1, c2) => COLS.slice(c1 - 1, c2).reduce((s, w) => s + w, 0);

/** 最长的一个英文「词」有多宽（单位同上）：空格、中文字前后、连字符后都能换行（「Re-inspection」= Re- + inspection） */
function longestWord(text) {
  let best = 0;
  for (const seg of String(text || '').split(/\s+|(?<=-)/)) {
    let u = 0;
    for (const ch of seg) {
      if (wide(ch)) {
        best = Math.max(best, u);
        u = 0;
      } else u += unitsOf(ch);
    }
    best = Math.max(best, u);
  }
  return best;
}
/**
 * 单语表头只有一行粗体主行（双语时英文是 7.5pt 的副行）：窄格放不下最长的英文单词时（如终检整改表 G 列的
 * 「Re-inspection」），字号往下降到放得下为止，免得 Excel / LibreOffice 把单词从中间断开（inspectio / n）。
 * 粗体按宽 8% 算。返回 { pt, lh }：字号和每行高度（pt）。
 */
const BOLD_W = 1.08;
function headSize(text, widthChars, pt = 9) {
  const u = longestWord(text) * BOLD_W;
  const size = [pt, 8, 7.5, 7].find((p) => u <= capOf(widthChars, p)) || 7;
  return { pt: size, lh: Math.round((size * 4) / 3) };
}

// Excel 行高上限 409pt（≈ 28 行 10pt 字）：更长的文字切成几段，每段一行（续行），不会被截掉
const MAX_LINES = 26;

/**
 * 把文字切成每段不超过 max 行（和 lines() 同一套折行）。在估算的换行处切，
 * 所以英文单词 / 编号（如 Q020、3mm）不会从中间断开。first = 第一段的行数上限（同格里前面还有别的文字时用）。
 */
function chunks(text, widthChars, fontPt = 10, max = MAX_LINES, first = max) {
  const s = text == null ? '' : String(text);
  if (lines(s, widthChars, fontPt) <= first) return [s];
  const cap = capOf(widthChars, fontPt);
  const out = [];
  let cur = [];
  let used = 0;
  let budget = Math.max(1, first);
  for (const para of s.split('\n')) {
    const chars = [...para];
    const st = wrapStarts(chars, cap);
    let a = 0;
    while (a < st.length) {
      if (used >= budget) {
        out.push(cur.join('\n'));
        cur = [];
        used = 0;
        budget = max;
      }
      const b = Math.min(st.length, a + budget - used);
      cur.push(chars.slice(st[a], b < st.length ? st[b] : chars.length).join(''));
      used += b - a;
      a = b;
    }
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

/** 按宽度截断（中文算 2、其余算 1），尽量断在空格处，末尾加「…」（单语文件的页脚报告名用） */
function clip(s, max) {
  const chars = [...String(s || '')];
  let u = 0;
  for (let i = 0; i < chars.length; i += 1) {
    u += wide(chars[i]) ? 2 : 1;
    if (u > max) {
      let cut = chars.slice(0, i).join('');
      const sp = cut.lastIndexOf(' ');
      if (sp > cut.length * 0.6) cut = cut.slice(0, sp);
      return `${cut.replace(/[\s·]+$/, '')}…`;
    }
  }
  return chars.join('');
}

function sheetName(s, fallback) {
  const full = clean(s).replace(/[[\]:*?/\\]/g, ' ').trim();
  let n = full.slice(0, 31);
  // 表名最多 31 个字：英文标题（如 FINAL MEASUREMENT & CONFIRMATION CHECKLIST）断在单词之间，不留半个词 / 落单的 &
  if (full.length > 31 && /[A-Za-z]/.test(full[31] || '') && n.lastIndexOf(' ') > 12) n = n.slice(0, n.lastIndexOf(' '));
  n = full.length > 31 ? n.replace(/[\s&·\-–—,;]+$/, '') : n;
  return n || fallback;
}

// ---------- 媒体 ----------
async function bytesOf(src) {
  if (!src) return null;
  if (src instanceof Uint8Array) return src;
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  if (ArrayBuffer.isView(src)) return new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
  if (typeof src.arrayBuffer === 'function') return new Uint8Array(await src.arrayBuffer());
  return null;
}

function imageInfo(b) {
  if (!b || b.length < 26) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { ext: 'png', w: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0 };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i += 1;
        continue;
      }
      const m = b[i + 1];
      if (m === 0xff || m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        i += m === 0xff ? 1 : 2;
        continue;
      }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { ext: 'jpeg', h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return { ext: 'jpeg', w: 0, h: 0 };
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { ext: 'gif', w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
  return null;
}

/** 预加载文档引用的媒体 → Map<id, { kind, data, ext, w, h, caption, duration }> */
async function loadMedia(model, media) {
  const M = new Map();
  if (!media || typeof media.get !== 'function') return M;
  await Promise.all(
    modelMedia(model).map(async (ref) => {
      try {
        const m = await media.get(ref.id);
        if (!m) return;
        const kind = m.kind || ref.kind || 'photo';
        // Excel 里照片约 100px 高：用缩略图足够清楚、文件小；签名用原图（透明 PNG）
        const cands = kind === 'video' ? [m.poster, m.thumb] : kind === 'signature' ? [m.blob, m.thumb] : [m.thumb, m.blob];
        for (const c of cands) {
          const data = await bytesOf(c);
          const info = imageInfo(data);
          if (!info) continue;
          const w = info.w || m.w || 4;
          const h = info.h || m.h || 3;
          M.set(ref.id, { kind, data, ext: info.ext, w, h, caption: clean(m.caption || '').trim(), duration: m.duration });
          return;
        }
        // 视频没截到封面：没有图可放，但仍记下来，文档里写「▶ 视频（时长）请见群组」
        if (kind === 'video') M.set(ref.id, { kind, data: null, caption: clean(m.caption || '').trim(), duration: m.duration });
      } catch {
        /* 单张出错不影响整份 */
      }
    }),
  );
  return M;
}

function fmtDur(sec) {
  if (!sec) return '';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
// 视频没封面：▶ 视频（0:42）请见群组 / ▶ Video (0:42) shared separately
const videoText = (m, lang) =>
  lang === 'en'
    ? `▶ Video${m.duration ? ` (${fmtDur(m.duration)})` : ''} shared separately`
    : `▶ 视频${m.duration ? `（${fmtDur(m.duration)}）` : ''}请见群组`;
// 照片行下方的视频说明
const videoCaption = (m, lang) => (lang === 'en' ? `▶ Video ${fmtDur(m.duration)} (shared separately)` : `▶ 视频 ${fmtDur(m.duration)}（请见群组）`);

// ---------- 写表 ----------
function createWriter(wb, ws, M, accent, lang = 'both') {
  let r = 0; // 当前行号（1 起；r = 最后写过的行）
  const imageIds = new Map();
  const thin = { style: 'thin', color: { argb: C.line } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };

  const font = (o = {}) => ({ name: FONT, size: o.size || 10, bold: !!o.bold, italic: !!o.italic, color: { argb: o.color || C.ink } });
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  function row(height) {
    r += 1;
    const rw = ws.getRow(r);
    if (height) rw.height = Math.min(409, Math.max(12, height));
    return r;
  }

  /** 写单元格（可合并 c1..c2） */
  function cell(rr, c1, c2, value, o = {}) {
    if (c2 > c1) ws.mergeCells(rr, c1, rr, c2);
    const cl = ws.getCell(rr, c1);
    cl.value = value;
    cl.font = font(o);
    cl.alignment = {
      vertical: o.valign || 'top',
      horizontal: o.align || 'left',
      wrapText: o.wrap !== false,
      indent: o.indent || 0,
    };
    if (o.fill) cl.fill = fill(o.fill);
    if (o.border) {
      for (let c = c1; c <= c2; c += 1) {
        const x = ws.getCell(rr, c);
        x.border = { ...box, ...(o.leftBar && c === c1 ? { left: { style: 'thick', color: { argb: typeof o.leftBar === 'string' ? o.leftBar : accent } } } : {}) };
        if (o.fill && c > c1) x.fill = fill(o.fill);
      }
    }
    return cl;
  }

  const rich = (parts) => ({ richText: parts.filter((p) => p && p.text).map((p) => ({ text: clean(p.text), font: font(p) })) });

  function imageId(m) {
    if (imageIds.has(m)) return imageIds.get(m);
    const id = wb.addImage({ buffer: m.data, extension: m.ext });
    imageIds.set(m, id);
    return id;
  }

  // exceljs 4.4.0 的坑：相邻两个锚点用同一个 imageId 时，第二个会指到别的图
  // （worksheet-xform 按位置存 rel，却按 imageId 取）。如两个签名同一张图 → 第二个显示成柜子照片。
  // 所以和上一个锚点同 id 时，另登记一份新的。
  let lastId = -1;

  /** 在第 rr 行从像素 x 处放图（oneCellAnchor：起点在所在列内，宽度可跨列） */
  function placeImage(m, rr, x, y, w, h) {
    let col = 0;
    while (col < NCOL - 1 && x >= COL_X[col] + COL_PX[col]) col += 1;
    const off = Math.max(0, Math.min(x - COL_X[col], COL_PX[col] - 2));
    let id = imageId(m);
    if (id === lastId) id = wb.addImage({ buffer: m.data, extension: m.ext });
    lastId = id;
    ws.addImage(id, {
      tl: { nativeCol: col, nativeColOff: Math.round(off * EMU_PX), nativeRow: rr - 1, nativeRowOff: Math.round(y * EMU_PX) },
      ext: { width: Math.round(w), height: Math.round(h) },
      editAs: 'oneCell',
    });
  }

  /**
   * 照片行：从第 startCol 列开始横排，放不下自动换行。
   * label 写在 startCol 之前的单元格里。返回写了几行。
   */
  function photos(ids, { label = say(lang, '照片', 'Photos'), startCol = 2, labelFill = C.cream } = {}) {
    const all = (ids || []).map((ref) => ({ ref, m: M.get(ref.id) }));
    const items = all.filter((x) => x.m && x.m.data);
    // 放不进图的（视频没封面 / 照片已删除）也要写一句，不能整行消失（PDF 显示 Missing，Word 保留文字）
    const lost = all.filter((x) => !(x.m && x.m.data));
    const lostTxt = lost.filter((x) => x.m).map((x) => videoText(x.m, lang));
    const nPhoto = lost.filter((x) => !x.m && x.ref.kind !== 'video').length;
    if (nPhoto) {
      lostTxt.push(lang === 'en' ? (nPhoto > 1 ? `${nPhoto} photos missing` : 'Photo missing') : nPhoto > 1 ? `照片缺失 ×${nPhoto}` : '照片缺失');
    }
    if (lost.some((x) => !x.m && x.ref.kind === 'video')) lostTxt.push(say(lang, '视频缺失', 'Video missing', '视频缺失'));
    const sep = sepOf(lang);
    if (!items.length) {
      if (!lostTxt.length) return 0;
      const rr = row(Math.max(startCol > 1 ? lines(label, spanWidth(1, startCol - 1), 8) * 11 + 6 : 0, 20));
      if (startCol > 1) cell(rr, 1, startCol - 1, label, { size: 8, color: C.muted, fill: labelFill, border: true });
      cell(rr, startCol, NCOL, lostTxt.join(sep), { size: 9, color: C.muted, valign: 'middle', border: true, fill: 'FFFCFAF6' });
      return 1;
    }
    const x0 = COL_X[startCol - 1] + 6;
    const xMax = COL_X[NCOL - 1] + COL_PX[NCOL - 1] - 6;
    const sized = items.map(({ m }) => {
      const s = Math.min(PHOTO_H / m.h, PHOTO_MAX_W / m.w);
      return { m, w: m.w * s, h: m.h * s };
    });
    // 分行
    const rowsOf = [];
    let cur = [];
    let x = x0;
    for (const it of sized) {
      if (cur.length && x + it.w > xMax) {
        rowsOf.push(cur);
        cur = [];
        x = x0;
      }
      cur.push({ ...it, x });
      x += it.w + GAP;
    }
    if (cur.length) rowsOf.push(cur);

    rowsOf.forEach((list, i) => {
      const caps = list
        .map((it) => (it.m.kind === 'video' ? videoCaption(it.m, lang) : it.m.caption))
        .filter(Boolean);
      if (i === 0) caps.push(...lostTxt);
      const hPx = PHOTO_H + 10 + (caps.length ? 4 + lines(caps.join(sep), spanWidth(startCol, NCOL), 8) * 12 : 0);
      const rr = row(hPx * 0.75);
      if (startCol > 1) cell(rr, 1, startCol - 1, i === 0 ? label : '', { size: 8, color: C.muted, fill: labelFill, border: true });
      cell(rr, startCol, NCOL, caps.join(sep), { size: 8, color: C.muted, valign: 'bottom', border: true, fill: 'FFFCFAF6' });
      for (const it of list) placeImage(it.m, rr, it.x, 5, it.w, it.h);
    });
    return rowsOf.length;
  }

  return { lang, row, cell, rich, photos, placeImage, font, fill, get r() { return r; }, set r(v) { r = v; } };
}

// ---------- 各块 ----------
function writeHeader(w, ws, model, logoImg) {
  const meta = model.meta || {};
  const title = lab(meta.title);
  const accent = `FF${String(meta.accent || '#B5623A').replace('#', '').toUpperCase()}`;

  // 第 1 行：logo + 角标
  const r1 = w.row(48);
  if (logoImg) {
    const h = 54;
    w.placeImage(logoImg, r1, 4, 6, (logoImg.w / logoImg.h) * h, h);
  }
  const badge = meta.badge ? lab(meta.badge) : meta.brand === 'vsmooth' ? { main: 'V-SMOOTH', sub: '' } : null;
  if (badge && badge.main) {
    w.cell(r1, 6, 8, w.rich([
      { text: badge.main, bold: true, color: accent, size: 9 },
      badge.sub ? { text: `\n${badge.sub}`, italic: true, color: C.muted, size: 8 } : null,
    ]), { align: 'right', valign: 'middle' });
  }
  const kicker = metaText(meta.kicker);
  if (kicker) {
    const rr = w.row(16);
    w.cell(rr, 1, NCOL, kicker, { size: 8, color: C.muted });
  }
  // 标题（双语：中文大字 + 英文大写小字；单语只有一行大字）
  const rt = w.row(30);
  w.cell(rt, 1, NCOL, w.rich([
    { text: title.main, bold: true, size: 18 },
    title.sub ? { text: `   ${title.sub.toUpperCase()}`, bold: true, size: 10, color: accent } : null,
  ]), { valign: 'middle' });
  if (meta.subtitle) {
    const txt = oneLine(meta.subtitle, '   ');
    const rr = w.row(lines(txt, spanWidth(1, NCOL), 9) * 13 + 4);
    w.cell(rr, 1, NCOL, txt, { italic: true, size: 9, color: accent });
  }
  for (const p of meta.intro || []) {
    const l = lab(p);
    const width = spanWidth(1, NCOL);
    const h = lines(l.main, width, 9.5) * 14 + (l.sub ? lines(l.sub, width * 1.15, 8.5) * 12 : 0) + 6;
    const rr = w.row(h);
    w.cell(rr, 1, NCOL, w.rich([
      { text: l.main, size: 9.5, color: C.body },
      l.sub ? { text: `\n${l.sub}`, size: 8.5, color: C.muted, italic: true } : null,
    ]));
  }
  const legend = metaText(meta.legend);
  if (legend) {
    const rr = w.row(18);
    w.cell(rr, 1, NCOL, legend, { size: 9, color: C.body, fill: C.cream, valign: 'middle', indent: 1 });
  }
  w.row(8);
  return accent;
}

function writeHeading(w, block, accent, extra) {
  const t = slots(block.title, w.lang);
  if (!t.zh && !t.en && !block.no) return;
  const name = [t.en ? t.en.toUpperCase() : '', t.zh].filter(Boolean).join(' · ');
  const head = [block.no, name].filter(Boolean).join('   ');
  const rr = w.row(22);
  w.cell(rr, 1, extra ? 5 : NCOL, head, { bold: true, size: 11, color: accent, fill: C.cream2, border: true, leftBar: true, valign: 'middle', indent: 1 });
  if (extra) w.cell(rr, 6, NCOL, extra, { size: 8, color: C.muted, fill: C.cream2, border: true, valign: 'middle', align: 'right' });
  if (block.note) {
    const notes = Array.isArray(block.note) ? block.note : [block.note];
    for (const n of notes) {
      const txt = oneLine(n, '\n');
      const rr2 = w.row(lines(txt, spanWidth(1, NCOL), 9) * 13 + 4);
      // 双语文件里没有中文的说明用斜体（照旧）；单语文件的说明就是主行，不斜
      const zh = n && typeof n === 'object' ? clean(n.zh || '').trim() : clean(n).trim();
      w.cell(rr2, 1, NCOL, txt, { size: 9, color: C.body, italic: w.lang === 'both' && !zh });
    }
  }
}

function writeFields(w, block, accent) {
  writeHeading(w, block, accent);
  const grid = block.layout === 'grid' && (block.columns || 2) >= 2;
  const labelCell = (rr, c1, c2, f) => {
    const l = lab(f.label);
    w.cell(rr, c1, c2, w.rich([{ text: l.main, bold: true, size: 9, color: C.body }, l.sub ? { text: `\n${l.sub}`, size: 7.5, color: C.muted } : null]), {
      fill: C.cream,
      border: true,
    });
  };
  // 标签（主行 9pt 粗 + 副行 7.5pt）的高度也算进行高，窄格（E:F）里的长标签不会被截
  const labelH = (f, c1, c2) => {
    const l = lab(f.label);
    const width = spanWidth(c1, c2);
    return lines(l.main, width, 9) * 12 + (l.sub ? lines(l.sub, width, 7.5) * 10 : 0) + 6;
  };
  const valueOf = (f) => (f.kind === 'list' ? (f.lines || []).map((s) => `• ${s}`).join('\n') : f.value || '');
  // 行高下限：双语标签两行（中文 + 英文）→ 32pt；单语标签只有一行 → 20pt（不留空的第二行）
  const minRow = w.lang === 'both' ? 32 : 20;
  const pending = [];
  const flushPair = () => {
    if (!pending.length) return;
    const [a, b] = pending.splice(0);
    const va = valueOf(a);
    const vb = b ? valueOf(b) : '';
    const h = Math.max(
      Math.max(lines(va, spanWidth(3, 4), 10), b ? lines(vb, spanWidth(7, 8), 10) : 1) * 14 + 4,
      labelH(a, 1, 2),
      b ? labelH(b, 5, 6) : 0,
      minRow,
    );
    const rr = w.row(h);
    labelCell(rr, 1, 2, a);
    w.cell(rr, 3, 4, va, { border: true });
    if (b) {
      labelCell(rr, 5, 6, b);
      w.cell(rr, 7, 8, vb, { border: true });
    } else {
      w.cell(rr, 5, 8, '', { border: true });
    }
  };
  for (const f of block.fields) {
    if (f.kind === 'photos' || f.kind === 'video') {
      flushPair();
      const refs = f.kind === 'video' ? (f.video ? [f.video] : []) : f.photos || [];
      if (!refs.length) {
        const rr = w.row(Math.max(labelH(f, 1, 2), 18));
        labelCell(rr, 1, 2, f);
        w.cell(rr, 3, NCOL, '—', { border: true, color: C.faint });
        continue;
      }
      w.photos(refs, { label: oneLine(f.label, '\n'), startCol: 3 });
      continue;
    }
    const long = f.kind === 'block' || f.kind === 'list' || !grid || (f.value || '').length > 40;
    if (long) {
      flushPair();
      // 太长的值切成几行（续行），每行不超过 Excel 行高上限
      chunks(valueOf(f), spanWidth(3, NCOL), 10).forEach((v, i) => {
        const rr = w.row(Math.max(lines(v, spanWidth(3, NCOL), 10) * 14 + 4, i ? 0 : Math.max(labelH(f, 1, 2), minRow)));
        if (i) w.cell(rr, 1, 2, contOf(w.lang), { size: 8, color: C.faint, fill: C.cream, border: true });
        else labelCell(rr, 1, 2, f);
        w.cell(rr, 3, NCOL, v, { border: true });
      });
      continue;
    }
    pending.push(f);
    if (pending.length === 2) flushPair();
  }
  flushPair();
  w.row(6);
}

function itemRich(w, row) {
  const t = lab(row.title);
  const d = row.desc ? lab(row.desc) : null;
  return w.rich([
    row.key ? { text: '★ ', bold: true, color: C.terra } : null,
    { text: t.main, bold: true, size: 10 },
    row.media ? { text: ` ${mediaTag(w.lang)}`, size: 8, color: C.terra } : null,
    t.sub ? { text: `\n${t.sub}`, size: 8, color: C.muted } : null,
    d && d.main ? { text: `\n${d.main}`, size: 9, color: C.body } : null,
    d && d.sub ? { text: `\n${d.sub}`, size: 8, color: C.muted, italic: true } : null,
  ]);
}
/** 富文本格的行数：每段按自己的字号估（英文 8pt 按 10pt 估会多出好几行空白）。parts = [[文字, 字号], …] */
const richLines = (parts, width) => parts.reduce((n, [text, pt]) => n + (text ? lines(text, width, pt) : 0), 0);
// 与 itemRich 对应（desc = false 时只有标题）
const itemParts = (row, lang, desc = true) => {
  const t = lab(row.title);
  const d = desc && row.desc ? lab(row.desc) : {};
  return [[`${row.key ? '★ ' : ''}${t.main}${row.media ? ` ${mediaTag(lang)}` : ''}`, 10], [t.sub, 8], [d.main, 9], [d.sub, 8]];
};
const labParts = (x) => {
  const l = lab(x);
  return [[l.main, 9], [l.sub, 8]];
};

function writeChecklist(w, block, accent) {
  const { lang } = w;
  const total = block.counts?.total ?? block.rows.length;
  const extra = block.counts?.key
    ? say(lang, `共 ${block.counts.total} 项 · 其中关键项 ${block.counts.key} 项`, `${plural(block.counts.total, 'item')} · ${plural(block.counts.key, 'key item')}`, `共 ${block.counts.total} 项 · 其中关键项 ${block.counts.key} 项`)
    : say(lang, `共 ${total} 项`, plural(total, 'item'), `共 ${total} 项`);
  writeHeading(w, block, accent, extra);
  const opts = block.options || [];
  const layout = block.resultLayout;
  const cont = contOf(lang);

  if (layout === 'ticks') {
    const width = spanWidth(2, NCOL);
    for (const row of block.rows) {
      const on = !!row.result;
      const t = lab(row.title);
      // 纯英文：「[PHOTO] 标题」中间空一格；中文 / 双语照旧「【影像】标题」
      const tag = row.media ? (lang === 'en' ? `${mediaTag(lang)} ` : mediaTag(lang)) : '';
      // 备注太长切成续行；第一段和标题同一格，少放几行（行数按实际写进去的文字算，含影像标记）
      const head = lines([`${tag}${t.main}`, t.sub].filter(Boolean).join('\n'), width, 10);
      const rem = row.remark ? chunks(`${say(lang, '备注', 'Remarks', '备注')}${colonOf(lang)}${row.remark}`, width, 10, MAX_LINES, MAX_LINES - head) : [];
      const txt = [`${tag}${t.main}`, t.sub, rem[0] || ''].filter(Boolean).join('\n');
      const rr = w.row(Math.max(lines(txt, width, 10), 1) * 14 + 6);
      w.cell(rr, 1, 1, on ? '☑' : '☐', { align: 'center', bold: on, size: 12, color: on ? TONE.pass : C.faint, border: true });
      w.cell(rr, 2, NCOL, w.rich([
        tag ? { text: tag, size: 8, color: C.terra } : null,
        { text: t.main, size: 10 },
        t.sub ? { text: `\n${t.sub}`, size: 8, color: C.muted } : null,
        rem[0] ? { text: `\n${rem[0]}`, size: 9, color: C.body, italic: true } : null,
      ]), { border: true });
      for (const part of rem.slice(1)) {
        const r2 = w.row(lines(part, width, 10) * 14 + 6);
        w.cell(r2, 1, 1, '', { border: true });
        w.cell(r2, 2, NCOL, part, { size: 9, color: C.body, italic: true, border: true });
      }
      w.photos(row.photos);
    }
    w.row(6);
    return;
  }

  // 列分配：序号 A；检查项 B..；标准 / 方法可选；结果 E–G；备注 H
  const itemEnd = block.showStandard ? 2 : block.showMethod ? 3 : 4;
  const stdCols = block.showStandard ? [3, block.showMethod ? 3 : 4] : null;
  const methodCols = block.showMethod ? [4, 4] : null;
  const resCols = layout === 'columns' && opts.length <= 3 ? opts.map((_, i) => 5 + i) : null;

  // 表头（行高按最高的表头文字算）。写死的表头按语言规整成主 / 副两行（单语只有一行）
  const hd = (zh, en) => lab(localize({ zh, en }, lang));
  const heads = [[1, 1, hd('序号', 'No.'), 'center'], [2, itemEnd, hd('检查项', 'Check Item')]];
  if (stdCols) heads.push([stdCols[0], stdCols[1], hd('标准要求', 'Standard')]);
  if (methodCols) heads.push([4, 4, hd('检查方法', 'Method')]);
  if (resCols) {
    resCols.forEach((c, i) => heads.push([c, c, lab(opts[i]), 'center']));
    for (let c = 5 + resCols.length; c <= 7; c += 1) heads.push([c, c, lab('')]);
  } else heads.push([5, 7, hd('结果', 'Result'), 'center']);
  // 备注列名：模板给的（已按语言规整）；双语缺哪半边照旧补「备注」/「Remarks」
  const rl = lab(block.remarkLabel);
  heads.push([8, 8, lang === 'both' ? { main: rl.main || '备注', sub: rl.sub || 'Remarks' } : rl.main ? rl : hd('备注', 'Remarks')]);
  // 主行字号：双语照旧 9pt；单语窄格放不下长单词时降字号（headSize）
  const fs = heads.map(([c1, c2, l]) => (lang === 'both' ? { pt: 9, lh: 12 } : headSize(l.main, spanWidth(c1, c2))));
  const hr = w.row(Math.max(28, ...heads.map(([c1, c2, l], i) => lines(l.main, spanWidth(c1, c2), fs[i].pt) * fs[i].lh + (l.sub ? lines(l.sub, spanWidth(c1, c2), 7.5) * 10 : 0) + 6)));
  for (const [i, [c1, c2, l, align = 'left']] of heads.entries()) {
    w.cell(hr, c1, c2, w.rich([{ text: l.main, bold: true, size: fs[i].pt }, l.sub ? { text: `\n${l.sub}`, size: 7.5, color: C.muted } : null]), {
      fill: C.cream,
      border: true,
      align,
      valign: 'middle',
    });
  }

  for (const row of block.rows) {
    const failed = row.result?.tone === 'fail';
    const tint = failed ? TINT.fail : null;
    const valueTxt = row.input ? (row.lines?.length ? row.lines.map((s) => `• ${s}`).join('\n') : row.value || '') : '';
    // 备注（H）/ 填写内容（E:H）太长 → 切成续行
    const rc = chunks(row.input ? '' : row.remark, 24, 9);
    const vc = row.input ? chunks(valueTxt, spanWidth(5, 8), 10) : [''];
    const h = Math.max(
      Math.max(
        richLines(itemParts(row, lang, !block.showStandard), spanWidth(2, itemEnd)),
        row.desc && stdCols ? richLines(labParts(row.desc), spanWidth(stdCols[0], stdCols[1])) : 1,
        row.method && methodCols ? richLines(labParts(row.method), 15) : 1,
        lines(rc[0], 24, 9),
        resCols ? 1 : opts.length,
      ) *
        13 +
        8,
      // 下限：双语检查项至少两行（中文 + 英文）→ 34pt；单语一行 → 21pt
      lang === 'both' ? 34 : 21,
      row.input ? lines(vc[0], spanWidth(5, 8), 10) * 14 + 6 : 0,
    );
    const rr = w.row(h);
    w.cell(rr, 1, 1, row.no, { align: 'center', border: true, color: C.body, fill: tint });
    if (block.showStandard) {
      const t = lab(row.title);
      w.cell(rr, 2, itemEnd, w.rich([
        row.key ? { text: '★ ', bold: true, color: C.terra } : null,
        { text: t.main, bold: true },
        row.media ? { text: ` ${mediaTag(lang)}`, size: 8, color: C.terra } : null,
        t.sub ? { text: `\n${t.sub}`, size: 8, color: C.muted } : null,
      ]), { border: true, fill: tint });
      const d = lab(row.desc);
      w.cell(rr, stdCols[0], stdCols[1], w.rich([{ text: d.main, size: 9, color: C.body }, d.sub ? { text: `\n${d.sub}`, size: 8, color: C.muted, italic: true } : null]), {
        border: true,
        fill: tint,
      });
    } else {
      w.cell(rr, 2, itemEnd, itemRich(w, row), { border: true, fill: tint });
    }
    if (methodCols) {
      const m = lab(row.method);
      w.cell(rr, 4, 4, w.rich([{ text: m.main, size: 9, color: C.body }, m.sub ? { text: `\n${m.sub}`, size: 8, color: C.muted, italic: true } : null]), {
        border: true,
        fill: tint,
      });
    }
    const rOpts = row.options || opts;
    const ticks = resCols && rOpts.length <= resCols.length;
    if (row.input) {
      const il = lab(row.inputLabel);
      w.cell(rr, 5, 8, vc[0] || (il.main ? parens(lang, il.main) : ''), { border: true, color: valueTxt ? C.ink : C.faint, fill: tint });
    } else {
      if (ticks) {
        resCols.forEach((c, i) => {
          const o = rOpts[i];
          const on = o && row.result?.v === o.v;
          w.cell(rr, c, c, o ? (on ? '☑' : '☐') : '', {
            align: 'center',
            valign: 'middle',
            size: 12,
            bold: on,
            color: on ? TONE[o.tone] || C.ink : C.faint,
            fill: on ? TINT[o.tone] || null : tint,
            border: true,
          });
        });
        for (let c = 5 + resCols.length; c <= 7; c += 1) w.cell(rr, c, c, '', { border: true, fill: tint });
      } else {
        w.cell(rr, 5, 7, w.rich(
          rOpts.map((o, i) => {
            const on = row.result?.v === o.v;
            return { text: `${i ? '\n' : ''}${on ? '☑' : '☐'} ${oneLine(o)}`, bold: on, size: 9, color: on ? TONE[o.tone] || C.ink : C.faint };
          }),
        ), { border: true, fill: row.result ? TINT[row.result.tone] || tint : tint, valign: 'middle' });
      }
      w.cell(rr, 8, 8, rc[0], { border: true, size: 9, color: failed ? TONE.fail : C.ink, fill: tint });
    }
    // 续行：同样的合并格 / 边框 / 底色；序号、结果留空，检查项写「（续）」
    for (let k = 1; k < Math.max(rc.length, vc.length); k += 1) {
      const r2 = w.row(Math.max(lines(rc[k] || '', 24, 9) * 13 + 8, row.input ? lines(vc[k] || '', spanWidth(5, 8), 10) * 14 + 6 : 0));
      w.cell(r2, 1, 1, '', { border: true, fill: tint });
      w.cell(r2, 2, itemEnd, cont, { size: 8, color: C.faint, border: true, fill: tint });
      if (stdCols) w.cell(r2, stdCols[0], stdCols[1], '', { border: true, fill: tint });
      if (methodCols) w.cell(r2, 4, 4, '', { border: true, fill: tint });
      if (row.input) {
        w.cell(r2, 5, 8, vc[k] || '', { border: true, fill: tint });
        continue;
      }
      if (ticks) for (let c = 5; c <= 7; c += 1) w.cell(r2, c, c, '', { border: true, fill: tint });
      else w.cell(r2, 5, 7, '', { border: true, fill: tint });
      w.cell(r2, 8, 8, rc[k] || '', { border: true, size: 9, color: failed ? TONE.fail : C.ink, fill: tint });
    }
    w.photos(row.photos);
  }
  w.row(6);
}

/**
 * 表格列 → 第 c0..H 格。列比格多时才把相邻的列合并成一格（上下叠写「列名：值」），而且只合并必要的次数；
 * 哪几列合并、每格占几列都试一遍（列少，很快），按实际列宽挑：每列分到的宽度 ÷ 权重（width，合并的几列分摊），
 * 从最窄的比起，越宽越好。这样「问题描述」（width 2）这种主要内容列不会落进 15 字的窄格。
 */
function fitColumns(cols, c0 = 2) {
  // 列太多时（模板不会这样），超出的先并进最后一列，免得组合数爆炸
  const keys = cols.length > 12 ? [...cols.slice(0, 11).map((c) => [c]), cols.slice(11)] : cols.map((c) => [c]);
  const wt = keys.map((g) => g.reduce((s, c) => s + (c.width || 1), 0));
  const n = Math.min(keys.length, NCOL - c0 + 1); // 分成几格
  const better = (x, y) => {
    for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
  };
  let best = null;
  // 一组 = { i0, i1：第 i0..i1-1 列；a, b：占第 a..b 格 }；正好 n 组，所有格都用上
  const walk = (i, slot, groups) => {
    const left = n - groups.length;
    if (!left) {
      if (i !== keys.length || slot !== NCOL + 1) return;
      const score = [];
      for (const g of groups) {
        let sum = 0;
        for (let k = g.i0; k < g.i1; k += 1) sum += wt[k];
        for (let k = g.i0; k < g.i1; k += 1) score.push(spanWidth(g.a, g.b) / sum);
      }
      score.sort((p, q) => p - q);
      if (!best || better(score, best.score)) best = { score, groups: groups.map((g) => ({ ...g })) };
      return;
    }
    for (let i1 = i + 1; i1 <= keys.length - left + 1; i1 += 1) {
      for (let b = slot; b <= NCOL - left + 1; b += 1) {
        groups.push({ i0: i, i1, a: slot, b });
        walk(i1, b + 1, groups);
        groups.pop();
      }
    }
  };
  if (n > 0) walk(0, c0, []);
  return (best ? best.groups : []).map((g) => ({ a: g.a, b: g.b, cols: keys.slice(g.i0, g.i1).flat() }));
}

function writeTable(w, block, accent) {
  const { lang } = w;
  writeHeading(w, block, accent);
  const cols = block.columns || [];
  // A 列 = 行号 #（与 PDF / Word 一致，填写提醒里的「整改第 n 项」才对得上）；表格列从 B 起
  const groups = fitColumns(cols, 2);
  const ranges = groups.map((g) => [g.a, g.b]);
  // 合并格的表头：主行 / 副行各自用「 / 」连起来（单语只有主行）
  const join = (g, k) => g.cols.map((x) => lab(x.label)[k]).filter(Boolean).join(' / ');
  // 主行字号：双语照旧 9pt；单语窄格放不下长单词（如 G 列「Re-inspection」）时降字号（headSize）
  const heads = groups.map((g) => {
    const main = join(g, 'main');
    return { a: g.a, b: g.b, main, sub: join(g, 'sub'), ...(lang === 'both' ? { pt: 9, lh: 12 } : headSize(main, spanWidth(g.a, g.b))) };
  });
  // 表头行高按最高的表头文字算（窄列里的长表头不会被截）
  const hr = w.row(Math.max(28, ...heads.map((x) => lines(x.main, spanWidth(x.a, x.b), x.pt) * x.lh + (x.sub ? lines(x.sub, spanWidth(x.a, x.b), 7.5) * 10 : 0) + 6)));
  w.cell(hr, 1, 1, '#', { bold: true, size: 9, fill: C.cream, border: true, align: 'center', valign: 'middle' });
  for (const x of heads) {
    w.cell(hr, x.a, x.b, w.rich([{ text: x.main, bold: true, size: x.pt }, x.sub ? { text: `\n${x.sub}`, size: 7.5, color: C.muted } : null]), {
      fill: C.cream,
      border: true,
      valign: 'middle',
    });
  }
  if (block.empty) {
    const rr = w.row(20);
    w.cell(rr, 1, NCOL, oneLine(block.emptyText) || say(lang, '无', 'None', '无'), { color: C.muted, border: true, align: 'center', valign: 'middle' });
    w.row(6);
    return;
  }
  block.rows.forEach((r, ri) => {
    const texts = groups.map((g) => {
      if (g.cols.length > 1) return g.cols.map((x) => `${lab(x.label).main}${colonOf(lang)}${r.cells[x.key] || '—'}`).join('\n');
      return r.cells[g.cols[0].key] || '';
    });
    // 太长的格子切成续行（行号只写在第一行）
    const parts = texts.map((t, i) => chunks(t, spanWidth(ranges[i][0], ranges[i][1]), 9.5));
    for (let k = 0; k < Math.max(1, ...parts.map((p) => p.length)); k += 1) {
      const rr = w.row(Math.max(...parts.map((p, i) => lines(p[k] || '', spanWidth(ranges[i][0], ranges[i][1]), 9.5)), 1) * 13 + 8);
      w.cell(rr, 1, 1, k ? '' : String(ri + 1), { border: true, align: 'center', bold: true, size: 9, color: C.muted });
      ranges.forEach(([a, b], i) => w.cell(rr, a, b, parts[i][k] || '', { border: true, size: 9.5 }));
    }
    // 照片组标签放 A:B（A 列太窄，「复验照片 Re-inspection photo」会被截）
    for (const g of r.photoGroups || []) w.photos(g.photos, { label: oneLine(g.label, '\n'), startCol: 3 });
  });
  w.row(6);
}

const LONG_VALUE = 22; // 与 PDF 一致：超过这个长度的统计值不放小卡片，改成整行

/** 把 8 列切成 k 段连续的列：按实际列宽，让最窄的一段尽量宽（列宽不均，平均分会出现很窄的格） */
function splitCols(k) {
  let best = null;
  const walk = (start, left, acc) => {
    if (left === 1) {
      const all = [...acc, [start, NCOL]];
      const min = Math.min(...all.map(([a, b]) => spanWidth(a, b)));
      if (!best || min > best.min) best = { min, all };
      return;
    }
    for (let end = start; end <= NCOL - left + 1; end += 1) walk(end + 1, left - 1, [...acc, [start, end]]);
  };
  walk(1, Math.max(1, Math.min(k, NCOL)), []);
  return best.all;
}

function writeSummary(w, block, accent) {
  const { lang } = w;
  writeHeading(w, { title: block.title || localize({ zh: '结果统计', en: 'Summary' }, lang) }, accent);
  const items = block.items || [];
  const valueOf = (it) => clean(typeof it.value === 'string' ? it.value : oneLine(it.value));
  const tiles = items.filter((it) => valueOf(it).length <= LONG_VALUE);
  const longs = items.filter((it) => valueOf(it).length > LONG_VALUE);
  // 小卡片：每行最多 4 张、各行张数尽量平均；行高按最高的一张（标签 + 值）算
  const per = tiles.length ? Math.ceil(tiles.length / Math.ceil(tiles.length / 4)) : 1;
  for (let i = 0; i < tiles.length; i += per) {
    const chunk = tiles.slice(i, i + per);
    const ranges = splitCols(chunk.length);
    const texts = chunk.map((it) => [oneLine(it.label), valueOf(it)]);
    const rr = w.row(Math.max(34, ...texts.map(([lt, v], k) => lines(lt, spanWidth(...ranges[k]), 8) * 11 + lines(v, spanWidth(...ranges[k]), 11) * 15 + 8)));
    chunk.forEach((it, k) => {
      w.cell(rr, ranges[k][0], ranges[k][1], w.rich([
        { text: texts[k][0], size: 8, color: C.muted },
        { text: `\n${texts[k][1]}`, bold: true, size: 11, color: TONE[it.tone] || C.ink },
      ]), { fill: TINT[it.tone] || C.cream, border: true, align: 'center', valign: 'middle' });
    });
  }
  // 长的（如「待处理」列出不合格项和备注）：整行，标签 A:B + 值 C:H，太长切成续行
  for (const it of longs) {
    const l = lab(it.label);
    const tone = TONE[it.tone] ? it.tone : 'neutral';
    const lh = lines(l.main, spanWidth(1, 2), 9) * 12 + (l.sub ? lines(l.sub, spanWidth(1, 2), 7.5) * 10 : 0) + 6;
    chunks(valueOf(it), spanWidth(3, NCOL), 10).forEach((v, k) => {
      const rr = w.row(Math.max(lines(v, spanWidth(3, NCOL), 10) * 14 + 6, k ? 0 : lh));
      const head = w.rich([{ text: l.main, bold: true, size: 9, color: C.body }, l.sub ? { text: `\n${l.sub}`, size: 7.5, color: C.muted } : null]);
      w.cell(rr, 1, 2, k ? contOf(lang) : head, { size: 8, color: C.faint, fill: TINT[tone], border: true, leftBar: TONE[tone] });
      w.cell(rr, 3, NCOL, v, { color: TONE[tone], fill: TINT[tone], border: true });
    });
  }
  if (block.conclusion) {
    const cn = block.conclusion;
    const value = typeof cn.value === 'string' ? cn.value : oneLine(cn.value);
    const note = cn.note ? (typeof cn.note === 'string' ? cn.note : oneLine(cn.note, '\n')) : '';
    const label = oneLine(cn.label) || say(lang, '结论', 'Conclusion');
    const width = spanWidth(1, NCOL) - 2;
    const rr = w.row(Math.max(26, lines(`${label}${colonOf(lang)}${value}`, width, 12) * 17 + (note ? lines(note, width, 9) * 12 : 0) + 8));
    w.cell(rr, 1, NCOL, w.rich([
      { text: `${label}${colonOf(lang)}`, size: 9, color: C.white },
      { text: clean(value), bold: true, size: 12, color: C.white },
      note ? { text: `\n${note}`, size: 9, color: C.white } : null,
    ]), { fill: TONE[cn.tone] || TONE.neutral, valign: 'middle', indent: 1 });
  }
  w.row(6);
}

function writeNote(w, block, accent) {
  if (block.title) writeHeading(w, block, accent);
  for (const ln of block.lines || []) {
    const l = lab(ln);
    const width = spanWidth(1, NCOL);
    const rr = w.row(lines(l.main, width, 9) * 13 + (l.sub ? lines(l.sub, width * 1.15, 8) * 11 : 0) + 4);
    w.cell(rr, 1, NCOL, w.rich([
      { text: l.main, size: 9, color: block.tone === 'warn' ? C.terra : C.body },
      l.sub ? { text: `\n${l.sub}`, size: 8, color: C.muted, italic: true } : null,
    ]));
  }
  w.row(4);
}

function writeSignatures(w, block, accent, M) {
  const { lang } = w;
  writeHeading(w, { title: block.title || localize({ zh: '签名确认', en: 'SIGN-OFF' }, lang) }, accent);
  if (block.declaration) {
    const l = lab(block.declaration);
    const width = spanWidth(1, NCOL);
    const rr = w.row(lines(l.main, width, 9) * 13 + (l.sub ? lines(l.sub, width * 1.15, 8) * 11 : 0) + 6);
    w.cell(rr, 1, NCOL, w.rich([{ text: l.main, size: 9, color: C.body }, l.sub ? { text: `\n${l.sub}`, size: 8, color: C.muted, italic: true } : null]), {
      fill: C.cream,
    });
  }
  const roles = block.roles || [];
  if (!roles.length) return;
  const n = roles.length;
  const base = Math.floor(NCOL / n);
  const ranges = roles.map((_, i) => [1 + i * base, i === n - 1 ? NCOL : (i + 1) * base]);
  const r1 = w.row(28);
  roles.forEach((ro, i) => {
    const l = lab(ro.label);
    w.cell(r1, ranges[i][0], ranges[i][1], w.rich([{ text: l.main, bold: true, size: 9.5 }, l.sub ? { text: `\n${l.sub}`, size: 7.5, color: C.muted } : null]), {
      fill: C.cream,
      border: true,
      valign: 'middle',
    });
  });
  const r2 = w.row(52);
  roles.forEach((ro, i) => {
    w.cell(r2, ranges[i][0], ranges[i][1], '', { border: true });
    const m = ro.image ? M.get(ro.image.id) : null;
    if (m && m.data) {
      const maxW = COL_X[ranges[i][1] - 1] + COL_PX[ranges[i][1] - 1] - COL_X[ranges[i][0] - 1] - 16;
      const s = Math.min(58 / m.h, Math.min(220, maxW) / m.w);
      w.placeImage(m, r2, COL_X[ranges[i][0] - 1] + 8, 6, m.w * s, m.h * s);
    }
  });
  const r3 = w.row(30);
  roles.forEach((ro, i) => {
    w.cell(r3, ranges[i][0], ranges[i][1], w.rich([
      { text: `${say(lang, '姓名', 'Name')}${colonOf(lang)}${ro.name || ''}`, size: 9 },
      { text: `\n${say(lang, '日期', 'Date')}${colonOf(lang)}${ro.date || ''}`, size: 9, color: C.body },
    ]), { border: true });
  });
  w.row(6);
}

// ---------- 数据表 ----------
const EXTRA_W = 14; // 单语表格不够分时在右边加的列宽

/**
 * 单语数据页的表格：A 列是行号 #，表格的 k 列 → B 列起 k 段连续的列（每段合并成一格）；列不够分时右边再加几列。
 * 和 fitColumns 一样：每列分到的宽度 ÷ 权重（width）从窄到宽比，越宽越好。返回含 # 的 [[起列, 止列], …]（1 起）
 */
function dataSpans(weights, widths) {
  const k = weights.length;
  const all = [...widths, ...Array(Math.max(0, k + 5 - widths.length)).fill(EXTRA_W)];
  const m = all.length;
  const better = (x, y) => {
    for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
  };
  let best = null;
  const walk = (i, start, acc) => {
    if (i === k) {
      if (start !== m) return;
      const score = acc.map(([a, b], j) => all.slice(a, b + 1).reduce((s, w) => s + w, 0) / weights[j]).sort((p, q) => p - q);
      if (!best || better(score, best.score)) best = { score, ranges: acc.map(([a, b]) => [a + 1, b + 1]) };
      return;
    }
    for (let end = start; end <= m - (k - i); end += 1) walk(i + 1, end + 1, [...acc, [start, end]]);
  };
  walk(0, 1, []);
  return [[1, 1], ...(best ? best.ranges : weights.map((_, i) => [i + 2, i + 2]))];
}

// 双语：检查项 / 结果各有中文、英文两列（10 列，与以前一样）；纯中文 / 纯英文各只要一列（8 列），表头也只写一种语言
function writeData(ws, model, M, lang = 'both') {
  const thin = { style: 'thin', color: { argb: C.line } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const headFont = { name: FONT, size: 10, bold: true, color: { argb: C.ink } };
  const bodyFont = { name: FONT, size: 10, color: { argb: C.ink } };
  const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.cream2 } };
  const bi = lang === 'both';
  const NC = bi ? 10 : 8; // 检查项表的列数（字段 / 签名也合并到这一列）
  const RES = bi ? 7 : 6; // 结果列（按结果上色）
  // 纯英文：节名是大写英文（如「Ⅵ PROTECTION & CLOSING」），A 列 18 会折成两行、每个检查项都变两倍高 → 放宽到 28
  const widths = bi ? [18, 8, 34, 30, 7, 7, 12, 12, 36, 9] : [lang === 'en' ? 28 : 18, 8, lang === 'en' ? 40 : 34, 7, 7, 14, 36, 9, 14, 14];
  ws.columns = widths.map((width) => ({ width }));
  const hd = (zh, en) => tx(lang, zh, en);
  const pad = (values) => [...values, ...Array(Math.max(0, NC - values.length)).fill('')];
  let r = 0;
  const put = (values, { head = false } = {}) => {
    r += 1;
    const rw = ws.getRow(r);
    values.forEach((v, i) => {
      const c = rw.getCell(i + 1);
      c.value = typeof v === 'string' ? clean(v) : v;
      c.font = head ? headFont : bodyFont;
      c.alignment = { vertical: 'top', wrapText: true };
      c.border = border;
      if (head) c.fill = headFill;
    });
    return r;
  };

  const checklists = model.blocks.filter((b) => b.type === 'checklist');
  let itemStart = 0;
  let itemEnd = 0;
  if (checklists.length) {
    itemStart = put(
      bi
        ? ['节 Section', '序号 No.', '检查项 Item', 'Item (EN)', '关键 Key', '影像 Media', '结果 Result', 'Result (EN)', '备注 Remarks', '照片数 Photos']
        : [hd('节', 'Section'), hd('序号', 'No.'), hd('检查项', 'Item'), hd('关键', 'Key'), hd('影像', 'Media'), hd('结果', 'Result'), hd('备注', 'Remarks'), hd('照片数', 'Photos')],
      { head: true },
    );
    for (const b of checklists) {
      const sec = [b.no, lab(b.title).main].filter(Boolean).join(' ');
      for (const row of b.rows) {
        const t = lab(row.title);
        const value = row.lines?.length ? row.lines.join(' / ') : row.value || '';
        const nPhotos = row.photos.filter((p) => M.has(p.id)).length;
        let rr;
        if (bi) {
          const res = row.input ? [value, ''] : row.result ? [row.result.zh || row.result.v, row.result.en || ''] : ['', ''];
          rr = put([sec, String(row.no ?? ''), t.main, t.sub, row.key ? '★' : '', row.media ? '✓' : '', res[0], res[1], row.remark || '', nPhotos]);
        } else {
          const res = row.input ? value : row.result ? oneLine(row.result) || row.result.v : '';
          rr = put([sec, String(row.no ?? ''), t.main, row.key ? '★' : '', row.media ? '✓' : '', res, row.remark || '', nPhotos]);
        }
        if (row.result) {
          const tone = row.result.tone;
          ws.getCell(rr, RES).font = { ...bodyFont, bold: true, color: { argb: TONE[tone] || C.ink } };
        }
      }
    }
    itemEnd = r;
    ws.autoFilter = { from: { row: itemStart, column: 1 }, to: { row: itemEnd, column: NC } };
    ws.views = [{ state: 'frozen', ySplit: itemStart, showGridLines: true }];
    r += 1;
  }

  const fieldBlocks = model.blocks.filter((b) => b.type === 'fields');
  if (fieldBlocks.length) {
    r += 1;
    put(pad([hd('字段', 'Field'), '', hd('内容', 'Value')]), { head: true });
    ws.mergeCells(r, 1, r, 2);
    ws.mergeCells(r, 3, r, NC);
    for (const b of fieldBlocks) {
      for (const f of b.fields) {
        let v = f.kind === 'list' ? (f.lines || []).join('\n') : f.value || '';
        if (f.kind === 'photos') {
          const n = (f.photos || []).filter((p) => M.has(p.id)).length;
          v = say(lang, `${n} 张照片`, plural(n, 'photo'), `${n} 张照片`);
        }
        if (f.kind === 'video') v = f.video ? say(lang, '已附视频', 'Video attached', '已附视频') : '';
        put(pad([oneLine(f.label), '', v]));
        ws.mergeCells(r, 1, r, 2);
        ws.mergeCells(r, 3, r, NC);
      }
    }
  }

  for (const b of model.blocks.filter((x) => x.type === 'table')) {
    r += 2;
    ws.getCell(r, 1).value = clean([b.no, oneLine(b.title)].filter(Boolean).join(' '));
    ws.getCell(r, 1).font = { ...headFont, size: 11 };
    const cols = b.columns.slice(0, 9);
    const empty = oneLine(b.emptyText) || say(lang, '无', 'None', '无');
    if (bi) {
      put(['#', ...cols.map((c) => lab(c.label).main)], { head: true });
      b.rows.forEach((row, i) => put([String(i + 1), ...cols.map((c) => row.cells[c.key] || '')]));
      if (b.empty) put(['', empty]);
      continue;
    }
    // 单语：数据页的列宽是按检查项表定的（D / E 列只有 7 宽），表格直接一列对一列会把「问题描述」挤进 7 宽的格、
    // 英文表头从单词中间断开 → 每个表格列按需要合并几列（不够时在右边加几列），主要内容列（width 2）分得宽些
    const ranges = dataSpans(cols.map((c) => c.width || 1), widths);
    for (let c = widths.length + 1; c <= ranges[ranges.length - 1][1]; c += 1) ws.getColumn(c).width = EXTRA_W;
    const putSpans = (values, head = false) => {
      r += 1;
      values.forEach((v, i) => {
        const [a, z] = ranges[i];
        for (let c = a; c <= z; c += 1) {
          const x = ws.getCell(r, c);
          x.font = head ? headFont : bodyFont;
          x.alignment = { vertical: 'top', wrapText: true };
          x.border = border;
          if (head) x.fill = headFill;
        }
        ws.getCell(r, a).value = clean(v);
        if (z > a) ws.mergeCells(r, a, r, z);
      });
    };
    putSpans(['#', ...cols.map((c) => lab(c.label).main)], true);
    b.rows.forEach((row, i) => putSpans([String(i + 1), ...cols.map((c) => row.cells[c.key] || '')]));
    if (b.empty) putSpans(['', empty, ...cols.slice(1).map(() => '')]);
  }

  const sig = model.blocks.find((x) => x.type === 'signatures');
  if (sig) {
    r += 2;
    if (bi) {
      put(pad([hd('签名', 'Sign-off'), '', hd('姓名', 'Name'), '', hd('日期', 'Date'), '', hd('已签', 'Signed')]), { head: true });
      for (const ro of sig.roles) put(pad([oneLine(ro.label), '', ro.name || '', '', ro.date || '', '', ro.image && M.has(ro.image.id) ? '✓' : '']));
    } else {
      // 单语：签名 A:B、姓名 C:E、日期放 F 列（E 列只有 7 宽，「2026-10-09」会折行）、已签 G
      const sigRow = (values, o) => {
        put(pad(values), o);
        ws.mergeCells(r, 1, r, 2);
        ws.mergeCells(r, 3, r, 5);
      };
      sigRow([hd('签名', 'Sign-off'), '', hd('姓名', 'Name'), '', '', hd('日期', 'Date'), hd('已签', 'Signed')], { head: true });
      for (const ro of sig.roles) sigRow([oneLine(ro.label), '', ro.name || '', '', '', ro.date || '', ro.image && M.has(ro.image.id) ? '✓' : '']);
    }
  }
}

// ---------- 入口 ----------
async function loadExcel() {
  const mod = await import('exceljs');
  const X = mod.default || mod;
  const Workbook = X.Workbook || X.default?.Workbook;
  if (!Workbook) throw new Error('Excel 引擎加载失败');
  return Workbook;
}

// exceljs 自带的主题（xl/theme/theme1.xml）里写着日 / 中 / 韩文字体名（ＭＳ Ｐゴシック、宋体、新細明體、맑은 고딕）：
// 看不见，但纯英文文件里不该有一个中文字 → 换成这几种字体的英文名（Excel 认得，效果一样）。
// 主题原文取自 exceljs 本身：写一个空工作簿再读回来（只做一次，缓存）；拿不到就照旧用默认主题。
const THEME_FONTS = { 'ＭＳ Ｐゴシック': 'MS PGothic', '宋体': 'SimSun', '新細明體': 'PMingLiU', '맑은 고딕': 'Malgun Gothic' };
const NON_LATIN = /[^\x00-\u024f]/; // 拉丁字母以外（中日韩、谚文…）
let latinThemeP = null;
function latinTheme(Workbook) {
  if (!latinThemeP) {
    latinThemeP = (async () => {
      const tmp = new Workbook();
      tmp.addWorksheet('x');
      const back = new Workbook();
      await back.xlsx.load(await tmp.xlsx.writeBuffer());
      const xml = back._themes && back._themes.theme1;
      if (typeof xml !== 'string' || !xml.includes('<a:theme')) return null;
      // 认识的换成英文名；不认识的非拉丁字体名（新版 exceljs 若多了）整条去掉（a:font 是可选的按文种字体）
      return xml
        .replace(/<a:font script="[^"]*" typeface="([^"]*)"\s*\/>/g, (m, name) => (THEME_FONTS[name] ? m.replace(name, THEME_FONTS[name]) : NON_LATIN.test(name) ? '' : m))
        .replace(/typeface="([^"]*)"/g, (m, name) => (NON_LATIN.test(name) ? `typeface="${THEME_FONTS[name] || 'Arial'}"` : m));
    })().catch(() => null);
  }
  return latinThemeP;
}

/**
 * @param {DocModel} input  文档模型；input.meta.lang = 'zh' | 'en' | 'both'（没有 = 双语）决定固定文字的语言
 * @param {{ get(id): Promise<Media|null> }} media
 * @param {{ logo?: ArrayBuffer|Uint8Array|Blob }} opts
 * @returns {Promise<Blob>}
 */
export async function exportXlsx(input, media, { logo } = {}) {
  const Workbook = await loadExcel();
  const lang = normLang(input?.meta?.lang);
  const model = pickOnly(input, lang);
  const meta = model.meta || {};
  const company = meta.company || (lang === 'en' ? 'Sail by Riccione Reka' : '溪岸 Sail by Riccione Reka');
  const rname = reportName(meta, lang);
  const [M, logoImg] = await Promise.all([
    loadMedia(model, media),
    (async () => {
      const data = await bytesOf(logo).catch(() => null);
      const info = imageInfo(data);
      return info ? { data, ext: info.ext, w: info.w || 700, h: info.h || 268 } : null;
    })(),
  ]);

  const wb = new Workbook();
  wb.creator = company;
  wb.created = new Date();
  wb.title = rname;

  const title = lab(meta.title);
  const ws = wb.addWorksheet(sheetName(title.main, say(lang, '报告', 'Report', '报告')), {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.25 },
    },
    headerFooter: {
      // 报告名：双语照旧截前 60 个字；单语按宽度截、断在空格处（英文标题长，60 个字会把「(Mr Tan)」切成半个括号）
      oddFooter: `&L&8${clean(company).replace(/&/g, '&&')} · ${lang === 'both' ? rname.replace(/&/g, '&&').slice(0, 60) : clip(rname, 96).replace(/&/g, '&&')}&R&8${say(lang, '第 &P / &N 页', 'Page &P of &N', '第 &P / &N 页')}`,
    },
    properties: { defaultRowHeight: 16 },
  });
  ws.columns = COLS.map((width) => ({ width }));

  const w = createWriter(wb, ws, M, `FF${String(meta.accent || '#B5623A').replace('#', '').toUpperCase()}`, lang);
  const accent = writeHeader(w, ws, model, logoImg);
  for (const b of model.blocks) {
    if (b.type === 'fields') writeFields(w, b, accent);
    else if (b.type === 'checklist') writeChecklist(w, b, accent);
    else if (b.type === 'table') writeTable(w, b, accent);
    else if (b.type === 'summary') writeSummary(w, b, accent);
    else if (b.type === 'note') writeNote(w, b, accent);
    else if (b.type === 'signatures') writeSignatures(w, b, accent, M);
  }
  const footer = metaText(meta.footer);
  if (footer) {
    const rr = w.row(18);
    w.cell(rr, 1, NCOL, footer, { size: 8, color: C.muted, align: 'center' });
  }
  const rr = w.row(16);
  const stamp = String(meta.generatedAt || '').slice(0, 16).replace('T', ' ');
  w.cell(rr, 1, NCOL, `${clean(company)} · ${say(lang, '生成于', 'Generated', '生成于')} ${stamp}`, {
    size: 7.5,
    color: C.faint,
    align: 'right',
  });
  ws.pageSetup.printArea = `A1:H${w.r}`;

  writeData(wb.addWorksheet(tx(lang, '数据', 'Data')), model, M, lang);

  // 纯英文：主题里的字体名也不带中日韩文字（中文 / 双语照旧用 exceljs 默认主题）
  if (lang === 'en') {
    const theme = await latinTheme(Workbook);
    if (theme) wb._themes = { theme1: theme };
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: XLSX_MIME });
}
