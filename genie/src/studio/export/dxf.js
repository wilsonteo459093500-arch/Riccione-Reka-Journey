// AutoCAD DXF 写出器：R2000（AC1015）ASCII，带句柄（SPEC §3.1–3.3）。
// AutoCAD 2007+ 直接打开；SketchUp Pro 的 AutoCAD 导入、酷家乐的「导入 CAD 户型」都读 R2000。
// 骨架（HEADER / TABLES / BLOCKS / ENTITIES / OBJECTS 的组码顺序）照设计师的原型写，已用 ezdxf 严格读 + 审计（0 错 0 修）验证过。
//
// 坐标：毫米，X 向右、Y 向上；所有 Z = 0（纯二维）。数字：最多 4 位小数、不用科学计数、没有 -0、NaN 直接报错。
// 文字：text 'u' → 所有 ≥ U+0080 的字写成 \U+XXXX（整个文件是纯 ASCII，AutoCAD 自己的写法）；
//       text 'gbk' → GBK 里有的字照写（输出时编成 GBK 字节），没有的才写 \U+XXXX。超出 BMP 的字（表情）→ ?

import { gbkTable } from './gbk.js';
import { textWidth, rot } from './geom2d.js';

const NL = '\r\n';

export function num(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`dxf: bad number ${v}`);
  let s = (Math.round(v * 1e4) / 1e4).toFixed(4).replace(/\.?0+$/, '');
  if (s === '-0' || s === '') s = '0';
  return s;
}

/** DXF 里能放的一行字（去掉控制字符；按模式转义） */
export function dxfText(s, mode = 'u') {
  let out = '';
  const table = mode === 'gbk' ? gbkTable() : null;
  for (const ch of String(s ?? '').replace(/[\r\n\t]+/g, ' ')) {
    const c = ch.codePointAt(0);
    if (c < 0x20 || c === 0x7f) continue;
    if (c < 0x80) out += ch;
    else if (c > 0xffff) out += '?';
    else if (table && table.has(ch)) out += ch;
    else out += `\\U+${c.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return out;
}

/** 整个文件的字符串 → 字节（ASCII；或 GBK：dxfText 留下的中文编成两个字节） */
export function encode(str, mode = 'u') {
  if (mode !== 'gbk') {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c >= 0x80) throw new Error(`dxf: non-ASCII char U+${c.toString(16)}`);
      out[i] = c;
    }
    return out;
  }
  const t = gbkTable();
  const bytes = [];
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c < 0x80) bytes.push(c);
    else {
      const g = t.get(ch);
      if (!g) throw new Error(`dxf: not GBK: ${ch}`);
      bytes.push(g[0], g[1]);
    }
  }
  return Uint8Array.from(bytes);
}

const ALIGN = { l: 0, c: 1, r: 2 };
const VALIGN = { b: 0, m: 2, t: 3 };

export class Dxf {
  constructor({ text = 'u' } = {}) {
    this.mode = text;
    this.h = 0x100; // 我们的句柄从 0x100 开始；骨架的表用固定的小句柄
    this.layers = [];
    this.ltypes = [];
    this.styles = [];
    this.blocks = [];
    this.blockByName = new Map();
    this.ents = [];
    this.dimstyles = [];
    this.ext = [Infinity, Infinity, -Infinity, -Infinity];
    this.dimN = 0;
  }
  handle() {
    return (this.h++).toString(16).toUpperCase();
  }
  t(s) {
    return dxfText(s, this.mode);
  }
  layer(name, { color = 7, ltype = 'Continuous', lw = -3, plot = 1 } = {}) {
    this.layers.push({ name, color, ltype, lw, plot, h: this.handle() });
  }
  ltype(name, desc, pattern) {
    this.ltypes.push({ name, desc, pattern, h: this.handle() });
  }
  style(name, { font = 'txt', big = '', family = '', h = 0, w = 1 } = {}) {
    const s = { name, font, big, family, height: h, width: w, h: this.handle() };
    this.styles.push(s);
    return s;
  }
  styleHandle(name) {
    return this.styles.find((s) => s.name === name)?.h;
  }
  dimstyle(name, vars, txstyle) {
    this.dimstyles.push({ name, h: this.handle(), vars, txsty: this.styleHandle(txstyle) || '13' });
  }
  hasBlock(name) {
    return this.blockByName.has(name);
  }
  block(name) {
    const b = { name, recH: this.handle(), beginH: this.handle(), endH: this.handle(), ents: [], box: [Infinity, Infinity, -Infinity, -Infinity] };
    this.blocks.push(b);
    this.blockByName.set(name, b);
    return b;
  }
  grow(to, x, y) {
    const e = to ? to.box : this.ext;
    e[0] = Math.min(e[0], x);
    e[1] = Math.min(e[1], y);
    e[2] = Math.max(e[2], x);
    e[3] = Math.max(e[3], y);
  }
  push(to, layer, type, sub, pairs, xs = [], o = {}) {
    for (const [x, y] of xs) this.grow(to, x, y);
    const e = { type, layer, sub, pairs, ltype: o.ltype || null };
    (to ? to.ents : this.ents).push(e);
    return e;
  }
  line(to, layer, a, b, o = {}) {
    return this.push(to, layer, 'LINE', 'AcDbLine', [[10, a[0]], [20, a[1]], [30, 0], [11, b[0]], [21, b[1]], [31, 0]], [a, b], o);
  }
  poly(to, layer, pts, closed = true, o = {}) {
    const pairs = [[90, pts.length], [70, closed ? 1 : 0], [43, 0]];
    for (const [x, y] of pts) pairs.push([10, x], [20, y]);
    return this.push(to, layer, 'LWPOLYLINE', 'AcDbPolyline', pairs, pts, o);
  }
  arc(to, layer, c, r, a0, a1, o = {}) {
    return this.push(to, layer, 'ARC', 'AcDbCircle', [[10, c[0]], [20, c[1]], [30, 0], [40, r], ['SUB', 'AcDbArc'], [50, a0], [51, a1]], [[c[0] - r, c[1] - r], [c[0] + r, c[1] + r]], o);
  }
  circle(to, layer, c, r, o = {}) {
    return this.push(to, layer, 'CIRCLE', 'AcDbCircle', [[10, c[0]], [20, c[1]], [30, 0], [40, r]], [[c[0] - r, c[1] - r], [c[0] + r, c[1] + r]], o);
  }
  point(to, layer, p) {
    return this.push(to, layer, 'POINT', 'AcDbPoint', [[10, p[0]], [20, p[1]], [30, 0]], to ? [] : [p]);
  }
  /** 单行 TEXT：align 'mc'（中心）| 'ml' | 'bl'（左下基线）| 'bc'；rot 度 */
  text(to, layer, s, p, height, { align = 'mc', rot: r = 0, style = 'WISH-ZH' } = {}) {
    const H = ALIGN[align[1]];
    const V = VALIGN[align[0]];
    const pairs = [[10, p[0]], [20, p[1]], [30, 0], [40, height], [1, this.t(s)], [50, r], [7, style]];
    if (align !== 'bl') pairs.push([72, H], [11, p[0]], [21, p[1]], [31, 0]);
    pairs.push(['SUB', 'AcDbText'], [73, align === 'bl' ? 0 : V]);
    return this.push(to, layer, 'TEXT', 'AcDbText', pairs, textBox(s, p, height, align, r));
  }
  /** 实心填充：loops = [[[x, y], …], …]（第一个 = 外轮廓，其余按 outer 标记），奇偶规则 */
  hatch(to, layer, loopList, outerFlags = null) {
    const pairs = [[10, 0], [20, 0], [30, 0], [210, 0], [220, 0], [230, 1], [2, 'SOLID'], [70, 1], [71, 0], [91, loopList.length]];
    loopList.forEach((L, i) => {
      const outer = outerFlags ? outerFlags[i] : i === 0;
      pairs.push([92, outer ? 1 + 2 + 16 : 2], [72, 0], [73, 1], [93, L.length]);
      for (const [x, y] of L) pairs.push([10, x], [20, y]);
      pairs.push([97, 0]);
    });
    pairs.push([75, 0], [76, 1], [98, 0]);
    return this.push(to, layer, 'HATCH', 'AcDbHatch', pairs, loopList.flat());
  }
  /** 图块引用（可带属性 [{ tag, value, p, h, invisible, rot, style }]） */
  insert(to, layer, name, p, { rot: r = 0, attribs = [] } = {}) {
    const b = this.blockByName.get(name);
    if (!b) throw new Error(`dxf: no block ${name}`);
    const pairs = [];
    if (attribs.length) pairs.push([66, 1]);
    pairs.push([2, name], [10, p[0]], [20, p[1]], [30, 0], [41, 1], [42, 1], [43, 1], [50, r]);
    const corners = Number.isFinite(b.box[0])
      ? [[b.box[0], b.box[1]], [b.box[2], b.box[1]], [b.box[2], b.box[3]], [b.box[0], b.box[3]]].map((c) => {
          const q = rot(c, r);
          return [p[0] + q[0], p[1] + q[1]];
        })
      : [p];
    const e = this.push(to, layer, 'INSERT', 'AcDbBlockReference', pairs, corners);
    e.attribs = attribs.map((a) => ({ style: 'WISH-ZH', rot: 0, ...a, layer }));
    for (const a of e.attribs) if (!a.invisible) for (const [x, y] of textBox(a.value, a.p, a.h, 'mc', a.rot)) this.grow(to, x, y);
    return e;
  }
  attdef(b, tag, p, height, { invisible = false, prompt = tag, value = '', style = 'WISH-ZH' } = {}) {
    const pairs = [[10, p[0]], [20, p[1]], [30, 0], [40, height], [1, this.t(value)], [7, style], [72, 1], [11, p[0]], [21, p[1]], [31, 0], ['SUB', 'AcDbAttributeDefinition'], [3, this.t(prompt)], [2, tag], [70, invisible ? 1 : 0], [74, 2]];
    return this.push(b, '0', 'ATTDEF', 'AcDbText', pairs);
  }
  /** 线性尺寸 + 它画好的匿名块 *D<n>（建筑斜杠、尺寸界线、文字）。rot 0 = 水平，90 = 竖直 */
  dim(layer, p1, p2, base, rot0, style, { txtH = 250, tick = 100, exo = 100, exe = 100, dle = 100, txtAlong = 0 } = {}) {
    this.dimN++;
    const b = this.block(`*D${this.dimN}`);
    b.anon = true;
    const v = rot0 === 90;
    const d1 = v ? [base[0], p1[1]] : [p1[0], base[1]];
    const d2 = v ? [base[0], p2[1]] : [p2[0], base[1]];
    const meas = Math.round(v ? Math.abs(p2[1] - p1[1]) : Math.abs(p2[0] - p1[0]));
    const ext = (p, d) => {
      const s = v ? Math.sign(d[0] - p[0]) || 1 : Math.sign(d[1] - p[1]) || 1;
      return v ? [[p[0] + s * exo, p[1]], [d[0] + s * exe, d[1]]] : [[p[0], p[1] + s * exo], [d[0], d[1] + s * exe]];
    };
    for (const [p, d] of [[p1, d1], [p2, d2]]) {
      const [a, c] = ext(p, d);
      this.line(b, '0', a, c);
    }
    const u = v ? [0, Math.sign(d2[1] - d1[1]) || 1] : [Math.sign(d2[0] - d1[0]) || 1, 0];
    this.line(b, '0', [d1[0] - u[0] * dle, d1[1] - u[1] * dle], [d2[0] + u[0] * dle, d2[1] + u[1] * dle]);
    for (const d of [d1, d2]) this.line(b, '0', [d[0] - tick / 2, d[1] - tick / 2], [d[0] + tick / 2, d[1] + tick / 2]);
    const mid = [(d1[0] + d2[0]) / 2, (d1[1] + d2[1]) / 2];
    // txtAlong：段太短、数字放不下时，把数字沿尺寸线挪到段外（70 加 128 = 文字位置是指定的，AutoCAD 重生成也不动）
    const tp = v ? [mid[0] - txtH * 0.8, Math.round(mid[1] + txtAlong)] : [Math.round(mid[0] + txtAlong), mid[1] + txtH * 0.8];
    this.text(b, '0', String(meas), tp, txtH, { align: 'mc', rot: v ? 90 : 0, style: 'WISH-EN' });
    for (const p of [d2, p1, p2]) this.point(b, 'Defpoints', p);
    const pairs = [[2, b.name], [10, d2[0]], [20, d2[1]], [30, 0], [11, tp[0]], [21, tp[1]], [31, 0], [70, txtAlong ? 160 : 32], [71, 5], [1, ''], [3, style], ['SUB', 'AcDbAlignedDimension'], [13, p1[0]], [23, p1[1]], [33, 0], [14, p2[0]], [24, p2[1]], [34, 0], [50, rot0], ['SUB', 'AcDbRotatedDimension']];
    const e = this.push(null, layer, 'DIMENSION', 'AcDbDimension', pairs, [p1, p2, d1, d2, [tp[0] - txtH, tp[1] - txtH], [tp[0] + txtH, tp[1] + txtH]]);
    e.meas = meas;
    return e;
  }

  // ── 输出 ──
  toString() {
    const L = [];
    const g = (c, v) => {
      L.push(String(c).padStart(3, ' '), typeof v === 'number' ? num(v) : String(v));
    };
    const MS = { rec: '1F', begin: '20', end: '21' };
    const PS = { rec: '1B', begin: '1C', end: '1D' };
    const writeEnt = (e, owner) => {
      const h = this.handle();
      g(0, e.type);
      g(5, h);
      g(330, owner);
      g(100, 'AcDbEntity');
      g(8, e.layer);
      if (e.ltype) g(6, e.ltype);
      g(100, e.sub);
      for (const [c, v] of e.pairs) {
        if (c === 'SUB') g(100, v);
        else g(c, v);
      }
      if (e.attribs?.length) {
        for (const a of e.attribs) {
          g(0, 'ATTRIB');
          g(5, this.handle());
          g(330, h);
          g(100, 'AcDbEntity');
          g(8, a.layer);
          g(100, 'AcDbText');
          g(10, a.p[0]);
          g(20, a.p[1]);
          g(30, 0);
          g(40, a.h);
          g(1, this.t(a.value));
          g(50, a.rot || 0);
          g(7, a.style);
          g(72, 1);
          g(11, a.p[0]);
          g(21, a.p[1]);
          g(31, 0);
          g(100, 'AcDbAttribute');
          g(2, a.tag);
          g(70, a.invisible ? 1 : 0);
          g(74, 2);
        }
        g(0, 'SEQEND');
        g(5, this.handle());
        g(330, h);
        g(100, 'AcDbEntity');
        g(8, e.layer);
      }
    };
    const ex = Number.isFinite(this.ext[0]) ? this.ext : [0, 0, 1000, 1000];
    // HEADER
    g(0, 'SECTION');
    g(2, 'HEADER');
    const hv = [
      ['$ACADVER', 1, 'AC1015'],
      ['$ACADMAINTVER', 70, 6],
      ['$DWGCODEPAGE', 3, 'ANSI_936'],
      ['$INSBASE', 'P', [0, 0]],
      ['$EXTMIN', 'P', [ex[0], ex[1]]],
      ['$EXTMAX', 'P', [ex[2], ex[3]]],
      ['$LTSCALE', 40, 1],
      ['$TEXTSTYLE', 7, 'WISH-ZH'],
      ['$CLAYER', 8, '0'],
      ['$DIMSTYLE', 2, this.dimstyles[0]?.name || 'Standard'],
      ['$LUNITS', 70, 2],
      ['$LUPREC', 70, 0],
      ['$AUNITS', 70, 0],
      ['$INSUNITS', 70, 4],
      ['$MEASUREMENT', 70, 1],
      ['$LWDISPLAY', 290, 1],
      ['$PSLTSCALE', 70, 1],
      ['$HANDSEED', 5, '~SEED~'],
    ];
    for (const [k, c, v] of hv) {
      g(9, k);
      if (c === 'P') {
        g(10, v[0]);
        g(20, v[1]);
        g(30, 0);
      } else g(c, v);
    }
    g(0, 'ENDSEC');
    g(0, 'SECTION');
    g(2, 'CLASSES');
    g(0, 'ENDSEC');
    // TABLES
    g(0, 'SECTION');
    g(2, 'TABLES');
    const table = (name, h, n, body, extraSub) => {
      g(0, 'TABLE');
      g(2, name);
      g(5, h);
      g(330, 0);
      g(100, 'AcDbSymbolTable');
      g(70, n);
      if (extraSub) g(100, extraSub);
      body();
      g(0, 'ENDTAB');
    };
    const rec = (type, h, owner, sub) => {
      g(0, type);
      g(type === 'DIMSTYLE' ? 105 : 5, h);
      g(330, owner);
      g(100, 'AcDbSymbolTableRecord');
      g(100, sub);
    };
    table('VPORT', '8', 1, () => {
      rec('VPORT', '22', '8', 'AcDbViewportTableRecord');
      g(2, '*Active');
      g(70, 0);
      const cx = (ex[0] + ex[2]) / 2;
      const cy = (ex[1] + ex[3]) / 2;
      const vh = Math.max(1000, (ex[3] - ex[1]) * 1.1, ((ex[2] - ex[0]) * 1.1) / 1.6);
      for (const [c, v] of [[10, 0], [20, 0], [11, 1], [21, 1], [12, cx], [22, cy], [13, 0], [23, 0], [14, 10], [24, 10], [15, 10], [25, 10], [16, 0], [26, 0], [36, 1], [17, 0], [27, 0], [37, 0], [40, vh], [41, 1.6], [42, 50], [43, 0], [44, 0], [50, 0], [51, 0], [71, 0], [72, 1000], [73, 1], [74, 3], [75, 0], [76, 0], [77, 0], [78, 0]]) g(c, v);
    });
    table('LTYPE', '2', 3 + this.ltypes.length, () => {
      for (const [h, n] of [['14', 'ByBlock'], ['15', 'ByLayer'], ['16', 'Continuous']]) {
        rec('LTYPE', h, '2', 'AcDbLinetypeTableRecord');
        g(2, n);
        g(70, 0);
        g(3, n === 'Continuous' ? 'Solid line' : '');
        g(72, 65);
        g(73, 0);
        g(40, 0);
      }
      for (const lt of this.ltypes) {
        rec('LTYPE', lt.h, '2', 'AcDbLinetypeTableRecord');
        g(2, lt.name);
        g(70, 0);
        g(3, lt.desc);
        g(72, 65);
        g(73, lt.pattern.length);
        g(40, lt.pattern.reduce((s, v) => s + Math.abs(v), 0));
        for (const v of lt.pattern) {
          g(49, v);
          g(74, 0);
        }
      }
    });
    table('LAYER', '1', 2 + this.layers.length, () => {
      for (const ly of [{ name: '0', color: 7, ltype: 'Continuous', lw: -3, plot: 1, h: '10' }, { name: 'Defpoints', color: 7, ltype: 'Continuous', lw: -3, plot: 0, h: '11' }, ...this.layers]) {
        rec('LAYER', ly.h, '1', 'AcDbLayerTableRecord');
        g(2, ly.name);
        g(70, 0);
        g(62, ly.color);
        g(6, ly.ltype);
        if (!ly.plot) g(290, 0);
        g(370, ly.lw);
        g(390, '12');
      }
    });
    table('STYLE', '3', 1 + this.styles.length, () => {
      rec('STYLE', '13', '3', 'AcDbTextStyleTableRecord');
      for (const [c, v] of [[2, 'Standard'], [70, 0], [40, 0], [41, 1], [50, 0], [71, 0], [42, 250], [3, 'txt'], [4, '']]) g(c, v);
      for (const s of this.styles) {
        rec('STYLE', s.h, '3', 'AcDbTextStyleTableRecord');
        for (const [c, v] of [[2, s.name], [70, 0], [40, s.height], [41, s.width], [50, 0], [71, 0], [42, 250], [3, s.font], [4, s.big]]) g(c, v);
        if (s.family) {
          g(1001, 'ACAD');
          g(1000, s.family);
          g(1071, 0);
        }
      }
    });
    table('VIEW', '6', 0, () => {});
    table('UCS', '7', 0, () => {});
    table('APPID', '9', 1, () => {
      rec('APPID', '17', '9', 'AcDbRegAppTableRecord');
      g(2, 'ACAD');
      g(70, 0);
    });
    table(
      'DIMSTYLE',
      'A',
      1 + this.dimstyles.length,
      () => {
        rec('DIMSTYLE', '18', 'A', 'AcDbDimStyleTableRecord');
        for (const [c, v] of [[2, 'Standard'], [70, 0], [40, 1], [41, 2.5], [42, 0.625], [43, 3.75], [44, 1.25], [140, 2.5], [141, 2.5], [147, 0.625], [77, 0], [271, 4], [277, 2]]) g(c, v);
        for (const d of this.dimstyles) {
          rec('DIMSTYLE', d.h, 'A', 'AcDbDimStyleTableRecord');
          g(2, d.name);
          g(70, 0);
          for (const [c, v] of d.vars) g(c, v);
          g(340, d.txsty);
        }
      },
      'AcDbDimStyleTable'
    );
    table('BLOCK_RECORD', 'B', 2 + this.blocks.length, () => {
      for (const [r, n, layoutH] of [[MS.rec, '*Model_Space', '1E'], [PS.rec, '*Paper_Space', '1A']]) {
        rec('BLOCK_RECORD', r, 'B', 'AcDbBlockTableRecord');
        g(2, n);
        g(340, layoutH);
      }
      for (const b of this.blocks) {
        rec('BLOCK_RECORD', b.recH, 'B', 'AcDbBlockTableRecord');
        g(2, b.name);
        g(340, 0);
      }
    });
    g(0, 'ENDSEC');
    // BLOCKS
    g(0, 'SECTION');
    g(2, 'BLOCKS');
    const blockHead = (rec2, begin, name, flags) => {
      g(0, 'BLOCK');
      g(5, begin);
      g(330, rec2);
      g(100, 'AcDbEntity');
      g(8, '0');
      g(100, 'AcDbBlockBegin');
      g(2, name);
      g(70, flags);
      g(10, 0);
      g(20, 0);
      g(30, 0);
      g(3, name);
      g(1, '');
    };
    const blockEnd = (rec2, end) => {
      g(0, 'ENDBLK');
      g(5, end);
      g(330, rec2);
      g(100, 'AcDbEntity');
      g(8, '0');
      g(100, 'AcDbBlockEnd');
    };
    blockHead(MS.rec, MS.begin, '*Model_Space', 0);
    blockEnd(MS.rec, MS.end);
    blockHead(PS.rec, PS.begin, '*Paper_Space', 0);
    blockEnd(PS.rec, PS.end);
    for (const b of this.blocks) {
      const hasAtt = b.ents.some((e) => e.type === 'ATTDEF');
      blockHead(b.recH, b.beginH, b.name, (b.anon ? 1 : 0) | (hasAtt ? 2 : 0));
      for (const e of b.ents) writeEnt(e, b.recH);
      blockEnd(b.recH, b.endH);
    }
    g(0, 'ENDSEC');
    // ENTITIES
    g(0, 'SECTION');
    g(2, 'ENTITIES');
    for (const e of this.ents) writeEnt(e, MS.rec);
    g(0, 'ENDSEC');
    // OBJECTS：根字典 + ACAD_GROUP + ACAD_LAYOUT（Model、Layout1）+ 打印样式占位
    g(0, 'SECTION');
    g(2, 'OBJECTS');
    const dict = (h, owner, entries) => {
      g(0, 'DICTIONARY');
      g(5, h);
      g(330, owner);
      g(100, 'AcDbDictionary');
      g(281, 1);
      for (const [k, v] of entries) {
        g(3, k);
        g(350, v);
      }
    };
    dict('C', '0', [['ACAD_GROUP', 'D'], ['ACAD_LAYOUT', '19'], ['ACAD_PLOTSTYLENAME', 'E']]);
    dict('D', 'C', []);
    dict('19', 'C', [['Layout1', '1A'], ['Model', '1E']]);
    g(0, 'ACDBDICTIONARYWDFLT');
    g(5, 'E');
    g(330, 'C');
    g(100, 'AcDbDictionary');
    g(281, 1);
    g(3, 'Normal');
    g(350, '12');
    g(100, 'AcDbDictionaryWithDefault');
    g(340, '12');
    g(0, 'ACDBPLACEHOLDER');
    g(5, '12');
    g(330, 'E');
    const layout = (h, name, order, rec2) => {
      g(0, 'LAYOUT');
      g(5, h);
      g(330, '19');
      g(100, 'AcDbPlotSettings');
      for (const [c, v] of [[1, ''], [2, 'none_device'], [4, ''], [6, ''], [40, 0], [41, 0], [42, 0], [43, 0], [44, 0], [45, 0], [46, 0], [47, 0], [48, 0], [49, 0], [140, 0], [141, 0], [142, 1], [143, 1], [70, 688], [72, 1], [73, 0], [74, 5], [7, ''], [75, 16], [147, 1], [148, 0], [149, 0]]) g(c, v);
      g(100, 'AcDbLayout');
      for (const [c, v] of [[1, name], [70, 1], [71, order], [10, 0], [20, 0], [11, 420], [21, 297], [12, 0], [22, 0], [32, 0], [14, 0], [24, 0], [34, 0], [15, 0], [25, 0], [35, 0], [146, 0], [13, 0], [23, 0], [33, 0], [16, 1], [26, 0], [36, 0], [17, 0], [27, 1], [37, 0], [76, 0], [330, rec2]]) g(c, v);
    };
    layout('1A', 'Layout1', 1, PS.rec);
    layout('1E', 'Model', 0, MS.rec);
    g(0, 'ENDSEC');
    g(0, 'EOF');
    const seed = this.h.toString(16).toUpperCase();
    return (L.join(NL) + NL).replace('~SEED~', seed);
  }

  /** 字节（ASCII 或 GBK） */
  bytes() {
    return encode(this.toString(), this.mode);
  }
}

/** 文字的外框（估计，西文 0.6h、中文 1.0h）：给 $EXTMIN / $EXTMAX、AutoCAD 打开时的视口、平面图的字互相躲开用 */
export function textBox(s, p, h, align, r) {
  const w = textWidth(s, h);
  const x0 = align[1] === 'c' ? -w / 2 : align[1] === 'r' ? -w : 0;
  const y0 = align[0] === 'm' ? -h / 2 : align[0] === 't' ? -h : 0;
  return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]].map((c) => {
    const q = rot(c, r || 0);
    return [p[0] + q[0], p[1] + q[1]];
  });
}
