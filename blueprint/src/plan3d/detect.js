// 把看图模型（Gemini）看户型图的回复整理成几何数据：两次看图（先房间和门窗，再柜子家具）的 JSON → 图纸像素坐标。
// 回复可能带代码围栏、写到一半被截断、形状不对、甚至全是废话 —— 这里绝不抛错，能救多少救多少；
// 拿不准的框标 unsure 留给设计师在编辑器里改，明显是垃圾的才丢掉（丢了什么记在 notes 里）。
// 纯函数，ES5 写法 —— 以后要原样搬到没有构建步骤的 VISI。不改传进来的数据。
import { KINDS } from './geometry.js';
import { boundaryEdges, snapOpening, snapBox, guessFacing, iou, normBox, newItemId } from './edit.js';
import { KIND_ALIASES } from './prompt.js';

var MAX_ROOMS = 20;
var MAX_RECTS = 6;
var MAX_OPENINGS = 60;
var MAX_COLUMNS = 40;
var MAX_ITEMS = 120;
var MAX_LABEL = 40;
// buildGeo 自己的上限（parse 的 4 倍）：正常走 parse 过来的到不了；别处直接传进来一大堆时不至于卡死
var HARD_ROOMS = 80;
var HARD_RECTS = 24;
var HARD_OPENINGS = 240;
var HARD_COLUMNS = 160;
var HARD_ITEMS = 480;
var LOW_CONFIDENCE = 0.6;

/** 门窗种类的别名（小写；下划线、连字符先换成空格） */
var OPENING_ALIASES = {
  'window': 'window',
  'windows': 'window',
  'door': 'door',
  'doors': 'door',
  'hidden door': 'hidden-door',
  'hiddendoor': 'hidden-door',
  'secret door': 'hidden-door',
  'concealed door': 'hidden-door',
  'gap': 'gap',
  'opening': 'gap',
  'doorway': 'gap',
  'archway': 'gap',
  'passage': 'gap',
  '窗': 'window',
  '窗户': 'window',
  '门': 'door',
  '暗门': 'hidden-door',
  '隐形门': 'hidden-door',
  '门洞': 'gap',
  '垭口': 'gap',
};

function isNum(v) {
  return typeof v === 'number' && isFinite(v);
}

function isArr(v) {
  return Array.isArray(v);
}

function isObj(v) {
  return !!v && typeof v === 'object';
}

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** 数字，或者写成字符串的数字；别的 = null */
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string' && v.replace(/\s+/g, '') !== '') {
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  return null;
}

function r3(v) {
  var out = Math.round(v * 1000) / 1000;
  return isFinite(out) ? out : v; // 大到乘 1000 就溢出的数原样返回
}

/** 比例尺留三位小数；小到会被舍成 0 的原样返回（比例尺不能是 0） */
function roundScale(m) {
  var out = r3(m);
  return out > 0 ? out : m;
}

/** 一段文字：压成一行、去掉首尾空白、最多 max 个字 */
function text(v, max) {
  var s = typeof v === 'string' ? v : typeof v === 'number' && isFinite(v) ? String(v) : '';
  return s.replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

/** 种类 / 类型的写法统一：小写、下划线和连字符换成空格 */
function normWord(v) {
  if (typeof v !== 'string') return '';
  return v.toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 别名表的键，长的在前（模糊匹配时先认更具体的写法） */
function keysByLength(table) {
  var keys = [];
  for (var k in table) if (has(table, k)) keys.push(k);
  keys.sort(function (a, b) {
    return b.length - a.length || (a < b ? -1 : a > b ? 1 : 0);
  });
  return keys;
}

var KIND_KEYS = keysByLength(KIND_ALIASES);
var OPENING_KEYS = keysByLength(OPENING_ALIASES);

/** 一个写法里包含的别名（英文按整词，中文按字）：取最长的；一样长取靠后的（英文的中心词在后面，glass table 是桌子） */
function findAlias(table, keys, s) {
  var padded = ' ' + s + ' ';
  var best = null;
  var bestLen = 0;
  var bestPos = -1;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.length < bestLen) break;
    var ascii = /^[\x00-\x7f]+$/.test(k);
    var pos = ascii ? padded.lastIndexOf(' ' + k + ' ') : s.lastIndexOf(k);
    if (pos < 0 || (k.length === bestLen && pos <= bestPos)) continue;
    best = k;
    bestLen = k.length;
    bestPos = pos;
  }
  return best === null ? null : table[best];
}

/** 查别名：先整个对上，再看里面有没有包含某个别名；英文复数（chairs）去掉 s 再试一次 */
function lookupAlias(table, keys, raw) {
  var s = normWord(raw);
  if (!s) return null;
  if (has(table, s)) return table[s];
  var found = findAlias(table, keys, s);
  if (found === null && s.length > 2 && s.charAt(s.length - 1) === 's') {
    s = s.slice(0, s.length - 1);
    found = has(table, s) ? table[s] : findAlias(table, keys, s);
  }
  return found;
}

/** 把握不大（confidence < 0.6；写成百分数的也认） */
function lowConfidence(entry) {
  var c = isObj(entry) ? num(entry.confidence) : null;
  if (c === null) return false;
  if (c > 1.5) c = c / 100;
  return c < LOW_CONFIDENCE;
}

/** 图纸大小（不对 = null） */
function sizeOf(size) {
  if (!isObj(size) || !isNum(size.w) || !isNum(size.h) || !(size.w > 0) || !(size.h > 0)) return null;
  return { w: size.w, h: size.h };
}

function fourNums(list) {
  if (!isArr(list) || list.length < 4) return null;
  var out = [];
  for (var i = 0; i < 4; i++) {
    var n = num(list[i]);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

/** 应该是一个列表的东西：数组原样；单独一个对象 / 一个光秃秃的框 → 包成一项；别的 = 空 */
function listOf(v) {
  if (isArr(v)) return fourNums(v) && v.length === 4 ? [v] : v;
  if (isObj(v)) return [v];
  return [];
}

function tryParse(s) {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e) {
    return { ok: false, value: null };
  }
}

/** 去掉 ] / } 前面多写的逗号（字符串里的不动） */
function dropTrailingCommas(s) {
  var out = '';
  var inStr = false;
  var esc = false;
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    if (c === ',') {
      var j = i + 1;
      while (j < s.length && /\s/.test(s.charAt(j))) j++;
      if (j < s.length && (s.charAt(j) === ']' || s.charAt(j) === '}')) continue;
    }
    out += c;
  }
  return out;
}

/**
 * 从 start（一个 { 或 [）往后扫一份 JSON：认字符串、转义和括号层数。
 * end = 这份文档结束的位置（没写完 = -1）；stack = 没合上的括号，各自记着最后一个写完整的值到哪里（cut）
 */
function scanDoc(s, start) {
  var stack = [];
  var inStr = false;
  var esc = false;
  var prim = false; // 正在读数字 / true / false / null
  var done = function (end) {
    if (!stack.length) return;
    var t = stack[stack.length - 1];
    if (t.arr) t.cut = end;
    else if (t.colon) {
      t.cut = end;
      t.colon = false;
    }
  };
  for (var i = start; i < s.length; i++) {
    var c = s.charAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') {
        inStr = false;
        done(i + 1);
      }
      continue;
    }
    var space = c === ' ' || c === '\n' || c === '\r' || c === '\t';
    var mark = c === ',' || c === ':' || c === '{' || c === '}' || c === '[' || c === ']';
    if (prim && (space || mark || c === '"')) {
      prim = false;
      done(i);
    }
    if (space) continue;
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{' || c === '[') {
      stack.push({ arr: c === '[', open: i, cut: -1, colon: false });
      continue;
    }
    if (c === '}' || c === ']') {
      stack.pop();
      if (!stack.length) return { end: i + 1, stack: stack };
      done(i + 1);
      continue;
    }
    if (c === ':') {
      if (!stack[stack.length - 1].arr) stack[stack.length - 1].colon = true;
      continue;
    }
    if (c === ',') {
      stack[stack.length - 1].colon = false;
      continue;
    }
    prim = true;
  }
  return { end: -1, stack: stack };
}

/** 写到一半的 JSON：退回到最里面那层最后一个写完整的值，再把没合上的括号补齐 */
function repairDoc(s, start, stack) {
  var k = stack.length - 1;
  while (k > 0 && stack[k].cut < 0) k--;
  var body = stack[k].cut >= 0 ? s.slice(start, stack[k].cut) : s.slice(start, stack[k].open + 1);
  for (; k >= 0; k--) body += stack[k].arr ? ']' : '}';
  return body;
}

/** 宽松地读 JSON：已经是对象就原样；去掉代码围栏和前面的废话；截断的补齐（partial = true）；读不出来 = null */
function looseJson(input) {
  if (isObj(input)) return { value: input, partial: false };
  if (typeof input !== 'string') return { value: null, partial: true };
  var partial = false;
  var from = 0;
  var cut = 0; // 截断的那种每次都要扫到结尾，最多试 20 次
  for (var tries = 0; tries < 500 && cut < 20; tries++) {
    var a = input.indexOf('{', from);
    var b = input.indexOf('[', from);
    var start = a < 0 ? b : b < 0 ? a : Math.min(a, b);
    if (start < 0) break;
    var sc = scanDoc(input, start);
    var doc = sc.end > 0 ? input.slice(start, sc.end) : repairDoc(input, start, sc.stack);
    if (sc.end < 0) {
      partial = true;
      cut++;
    }
    var res = tryParse(doc);
    if (!res.ok) res = tryParse(dropTrailingCommas(doc));
    if (res.ok && isObj(res.value)) return { value: res.value, partial: partial };
    // 合上了但不是 JSON（比如说明文字里的方括号）→ 跳过它；截断又救不回来 → 往里面再找
    from = sc.end > 0 ? sc.end : start + 1;
  }
  return { value: null, partial: true };
}

/** 模型给的框 → 图纸像素 [x0,y0,x1,y1]。认 [ymin,xmin,ymax,xmax]（0–1000 或 0–1）、{ box_2d }、{ box }、{ x, y, w, h } */
function toPxBox(raw, size) {
  var sz = sizeOf(size);
  if (!sz || !isObj(raw)) return null;
  var q = null;
  if (isArr(raw)) q = fourNums(raw);
  else q = fourNums(raw.box_2d) || fourNums(raw.box) || fourNums(raw.bbox); // 前一个写坏了就看后一个
  if (!q && !isArr(raw)) {
    var x = num(raw.x);
    var y = num(raw.y);
    var w = num(raw.w);
    var h = num(raw.h);
    if (x !== null && y !== null && w !== null && h !== null) q = [y, x, y + h, x + w];
  }
  if (!q) return null;
  // 有一个值明显大于 1 → 是 0–1000 的写法；否则当 0–1 的小数
  var k = 1;
  for (var i = 0; i < 4; i++) if (Math.abs(q[i]) > 1.5) k = 1000;
  var x0 = Math.max(0, Math.min(sz.w, (Math.min(q[1], q[3]) / k) * sz.w));
  var x1 = Math.max(0, Math.min(sz.w, (Math.max(q[1], q[3]) / k) * sz.w));
  var y0 = Math.max(0, Math.min(sz.h, (Math.min(q[0], q[2]) / k) * sz.h));
  var y1 = Math.max(0, Math.min(sz.h, (Math.max(q[0], q[2]) / k) * sz.h));
  if (!(x1 - x0 >= 1) || !(y1 - y0 >= 1)) return null;
  return [r3(x0), r3(y0), r3(x1), r3(y1)];
}

/** 一个点 [y, x]（或 { x, y }）→ [x, y]，还是模型的单位 */
function rawPoint(raw) {
  var x = null;
  var y = null;
  if (isArr(raw) && raw.length >= 2) {
    y = num(raw[0]);
    x = num(raw[1]);
  } else if (isObj(raw)) {
    x = num(raw.x);
    y = num(raw.y);
  }
  return x === null || y === null ? null : [x, y];
}

/** 尺寸线两个端点之间的距离（图纸像素）。两个点用同一个单位：四个数里有一个明显大于 1 就都是 0–1000，否则都是 0–1 */
function spanPx(a, b, sz) {
  var p = rawPoint(a);
  var q = rawPoint(b);
  if (!p || !q) return 0;
  var k = Math.abs(p[0]) > 1.5 || Math.abs(p[1]) > 1.5 || Math.abs(q[0]) > 1.5 || Math.abs(q[1]) > 1.5 ? 1000 : 1;
  var dx = ((q[0] - p[0]) / k) * sz.w;
  var dy = ((q[1] - p[1]) / k) * sz.h;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 模型把整个回复多包了一层数组（[{ rooms: … }]）→ 取出里面那个对象；数组里本来就是一个个框的不动 */
function unwrapReply(raw, keys) {
  if (!isArr(raw)) return raw;
  for (var i = 0; i < raw.length; i++) {
    var e = raw[i];
    if (!isObj(e) || isArr(e) || hasBox(e)) continue;
    for (var k = 0; k < keys.length; k++) if (e[keys[k]] != null) return e;
  }
  return raw;
}

/** 条目自己带着框 */
function hasBox(e) {
  return !!(fourNums(e.box_2d) || fourNums(e.box) || fourNums(e.bbox));
}

/** 回复里装柜子家具的那个字段（没有 = null） */
function itemsIn(obj) {
  return obj.items != null ? obj.items : obj.item != null ? obj.item : obj.furniture != null ? obj.furniture : obj.objects != null ? obj.objects : null;
}

function emptyStructure() {
  return { rooms: [], openings: [], columns: [], wallT: null, dimension: null, notes: [] };
}

function readRoom(entry, size, out, n) {
  var rects = [];
  var main = toPxBox(entry, size);
  if (main) rects.push(main);
  var niches = isObj(entry) && !isArr(entry) ? listOf(entry.niches) : [];
  var cut = false;
  for (var i = 0; i < niches.length; i++) {
    var box = toPxBox(niches[i], size);
    if (!box) continue;
    if (rects.length >= MAX_RECTS) {
      cut = true;
      break;
    }
    rects.push(box);
  }
  if (!rects.length) {
    out.notes.push('第 ' + n + ' 个房间没有可用的框，已丢掉');
    return;
  }
  if (cut) out.notes.push('第 ' + n + ' 个房间的凹位太多，只留了前 ' + (MAX_RECTS - 1) + ' 个');
  var room = { name: isArr(entry) ? '' : text(entry.name != null ? entry.name : entry.label, MAX_LABEL), rects: rects };
  if (lowConfidence(entry)) room.unsure = true;
  out.rooms.push(room);
}

function readOpening(entry, size, out) {
  var box = toPxBox(entry, size);
  if (!box) return false;
  var type = isArr(entry) ? null : lookupAlias(OPENING_ALIASES, OPENING_KEYS, entry.type != null ? entry.type : entry.kind);
  var o = { type: type || 'gap', box: box };
  if (!type || lowConfidence(entry)) o.unsure = true;
  out.openings.push(o);
  return true;
}

function fillStructure(out, raw, size) {
  var sz = sizeOf(size);
  if (!sz) {
    out.notes.push('不知道图纸的大小，没法换算坐标');
    return;
  }
  if (!isObj(raw)) {
    out.notes.push('AI 第一次看图（房间和门窗）的回复读不出来');
    return;
  }
  raw = unwrapReply(raw, ['rooms', 'room', 'openings', 'opening', 'columns', 'column']);
  var rooms = [];
  var openings = [];
  var columns = [];
  var i;
  if (isArr(raw)) {
    // 整个回复就是一个数组：带门窗种类的当门窗，其余当房间
    var flat = listOf(raw);
    for (i = 0; i < flat.length; i++) {
      var e = flat[i];
      if (isObj(e) && !isArr(e) && lookupAlias(OPENING_ALIASES, OPENING_KEYS, e.type)) openings.push(e);
      else rooms.push(e);
    }
  } else {
    // 没有 rooms，回复本身就带着一个框 → 整个回复就是一个房间
    rooms = raw.rooms != null || raw.room != null ? listOf(raw.rooms != null ? raw.rooms : raw.room) : toPxBox(raw, sz) ? [raw] : [];
    openings = listOf(raw.openings != null ? raw.openings : raw.opening);
    columns = listOf(raw.columns != null ? raw.columns : raw.column);
  }

  var extra = 0;
  for (i = 0; i < rooms.length; i++) {
    if (!isObj(rooms[i])) continue;
    if (out.rooms.length >= MAX_ROOMS) extra++;
    else readRoom(rooms[i], sz, out, i + 1);
  }
  if (extra) out.notes.push('房间太多，只留了前 ' + MAX_ROOMS + ' 个');

  var bad = 0;
  extra = 0;
  for (i = 0; i < openings.length; i++) {
    if (!isObj(openings[i])) continue;
    if (out.openings.length >= MAX_OPENINGS) extra++;
    else if (!readOpening(openings[i], sz, out)) bad++;
  }
  if (bad) out.notes.push(bad + ' 个门窗的框不对，已丢掉');
  if (extra) out.notes.push('门窗太多，只留了前 ' + MAX_OPENINGS + ' 个');

  extra = 0;
  for (i = 0; i < columns.length; i++) {
    var col = toPxBox(columns[i], sz);
    if (!col) continue;
    if (out.columns.length >= MAX_COLUMNS) extra++;
    else out.columns.push(col);
  }
  if (extra) out.notes.push('柱子太多，只留了前 ' + MAX_COLUMNS + ' 个');

  if (isArr(raw)) return;
  // 墙厚：和框一样是 0–1000 的单位（图不是正方形时取横竖两个方向的平均）
  var t = num(raw.wall_thickness != null ? raw.wall_thickness : raw.wallThickness);
  var wt = t !== null && t > 0 ? r3(((t < 1 ? t : t / 1000) * (sz.w + sz.h)) / 2) : 0;
  if (isFinite(wt) && wt > 0) out.wallT = wt;

  var d = raw.dimension;
  if (isArr(d)) d = d.length ? d[0] : null; // 只要一条，却给了一个列表 → 用第一条
  if (isObj(d) && !isArr(d)) {
    var mm = num(d.mm != null ? d.mm : d.value);
    var px = r3(spanPx(d.p1, d.p2, sz));
    if (mm !== null && mm > 0 && isFinite(px) && px > 0) out.dimension = { mm: mm, px: px };
    else out.notes.push('尺寸线读不出来，比例尺改用别的办法估');
  }
}

/** 第一次看图的回复 → { rooms, openings, columns, wallT, dimension, notes }（坐标都是图纸像素；门窗还只是框，没有贴到墙上） */
function parseStructure(raw, size) {
  var out = emptyStructure();
  try {
    fillStructure(out, raw, size);
  } catch (e) {
    out.notes.push('整理房间和门窗时出错，只留了已经读到的部分');
  }
  return out;
}

function fillItems(out, raw, size) {
  var sz = sizeOf(size);
  if (!sz) {
    out.notes.push('不知道图纸的大小，没法换算坐标');
    return;
  }
  if (!isObj(raw)) return;
  var held = isArr(raw) ? raw : itemsIn(raw);
  // 没有 items，回复本身就带着一个框 → 整个回复就是一件东西
  var list = held != null ? listOf(held) : toPxBox(raw, sz) ? [raw] : [];
  // 条目自己没有框、里面又装着一组（多包了一层数组，或者按房间分了组）→ 摊平一层
  var flat = [];
  for (var f = 0; f < list.length; f++) {
    var inner = isObj(list[f]) && !isArr(list[f]) && !hasBox(list[f]) ? itemsIn(list[f]) : null;
    if (inner != null) flat = flat.concat(listOf(inner));
    else flat.push(list[f]);
  }
  list = flat;
  var bad = 0;
  var huge = 0;
  var extra = 0;
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!isObj(e)) continue;
    var box = toPxBox(e, sz);
    if (!box) {
      bad++;
      continue;
    }
    // 一个框就占了大半张图 = 把房间当成了家具
    if ((box[2] - box[0]) * (box[3] - box[1]) > 0.6 * sz.w * sz.h) {
      huge++;
      continue;
    }
    if (out.items.length >= MAX_ITEMS) {
      extra++;
      continue;
    }
    var named = isArr(e) ? null : e.kind != null ? e.kind : e.type != null ? e.type : e.category;
    var kind = lookupAlias(KIND_ALIASES, KIND_KEYS, named);
    var unsure = !kind || lowConfidence(e);
    if (!kind) kind = 'block';
    // 虚线画的柜子 = 吊在上面的
    if (!isArr(e) && (e.dashed === true || e.dashed === 'true') && (kind === 'tall' || kind === 'low' || kind === 'block' || kind === 'shelf')) kind = 'hung';
    var item = { kind: kind, label: isArr(e) ? '' : text(e.label != null ? e.label : e.name, MAX_LABEL), box: box };
    if (unsure) item.unsure = true;
    out.items.push(item);
  }
  if (bad) out.notes.push(bad + ' 个柜子家具的框不对，已丢掉');
  if (huge) out.notes.push(huge + ' 个框占了大半张图（多半是把房间当成了家具），已丢掉');
  if (extra) out.notes.push('柜子家具太多，只留了前 ' + MAX_ITEMS + ' 个');
}

/** 第二次看图的回复 → { items:[{ kind, label, box, unsure? }], notes }（种类按别名表认，不认识的当「其他」并标 unsure） */
function parseItems(raw, size) {
  var out = { items: [], notes: [] };
  try {
    fillItems(out, raw, size);
  } catch (e) {
    out.notes.push('整理柜子家具时出错，只留了已经读到的部分');
  }
  return out;
}

/** 一组坐标里挨得很近的（一簇的跨度不超过 tol）归成一个值（取平均） */
function clusters(values, tol) {
  var sorted = values.slice().sort(function (a, b) {
    return a - b;
  });
  var out = [];
  var cur = null;
  for (var i = 0; i < sorted.length; i++) {
    var v = sorted[i];
    if (cur && v - cur.lo <= tol + 1e-9) {
      cur.hi = v;
      cur.sum += v;
      cur.n++;
    } else {
      cur = { lo: v, hi: v, sum: v, n: 1 };
      out.push(cur);
    }
  }
  return out;
}

/** v 落在哪一簇 → 那一簇的值（簇是排好序的，二分查找）；簇里只有一个值就原样返回，不然取平均 */
function clusterValue(list, v) {
  var lo = 0;
  var hi = list.length - 1;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    var c = list[mid];
    if (v < c.lo) hi = mid - 1;
    else if (v > c.hi) lo = mid + 1;
    else return c.lo === c.hi ? c.lo : c.sum / c.n;
  }
  return v;
}

/** 一组坐标里挨得近的归成同一个值。归完一遍，新的值之间可能又挨近了 → 再归，直到任何两个不同的值都差得比 tol 多 */
function mergeClose(values, tol) {
  var cur = values.slice();
  for (var pass = 0; pass < values.length; pass++) {
    var list = clusters(cur, tol);
    var moved = false;
    var i;
    for (i = 0; i < list.length && !moved; i++) moved = list[i].hi > list[i].lo;
    if (!moved) break;
    for (i = 0; i < cur.length; i++) cur[i] = clusterValue(list, cur[i]);
  }
  return cur;
}

/** 把差不多对齐的边拉到完全对齐：所有矩形的 x 坐标（y 坐标）里相差不超过 tol 的取平均；压扁了的（< 2 像素）丢掉 */
function alignRects(rects, tol) {
  var t = isNum(tol) && tol > 0 ? tol : 0;
  var list = [];
  var xs = [];
  var ys = [];
  var src = isArr(rects) ? rects : [];
  var i;
  for (i = 0; i < src.length; i++) {
    var b = normBox(src[i]);
    if (!b) continue;
    list.push(b);
    xs.push(b[0], b[2]);
    ys.push(b[1], b[3]);
  }
  if (t > 0) {
    xs = mergeClose(xs, t);
    ys = mergeClose(ys, t);
  }
  var out = [];
  for (i = 0; i < list.length; i++) {
    var r = [xs[2 * i], ys[2 * i], xs[2 * i + 1], ys[2 * i + 1]];
    if (r[2] - r[0] >= 2 && r[3] - r[1] >= 2) out.push(r);
  }
  return out;
}

/** 去掉重复的框（同一种类、交并比 > 0.6 的后一个）和「一组」的框（里面完整包着两个以上同种类、比它小的东西） */
function dedupeItems(items) {
  var src = isArr(items) ? items : [];
  var kept = [];
  var boxes = [];
  var kinds = [];
  var areas = [];
  var i;
  var j;
  var o;
  for (i = 0; i < src.length; i++) {
    var it = src[i];
    var b = isObj(it) ? normBox(it.box) : null;
    if (!b) continue;
    var dup = false;
    for (j = 0; j < kept.length && !dup; j++) {
      o = boxes[j];
      // 不相交的不用算交并比（东西很多时省时间）
      dup = o[0] < b[2] && o[2] > b[0] && o[1] < b[3] && o[3] > b[1] && kinds[j] === it.kind && iou(o, b) > 0.6;
    }
    if (dup) continue;
    kept.push(it);
    boxes.push(b);
    kinds.push(it.kind);
    areas.push((b[2] - b[0]) * (b[3] - b[1]));
  }
  var out = [];
  for (i = 0; i < kept.length; i++) {
    var g = boxes[i];
    var x0 = g[0] - 2;
    var y0 = g[1] - 2;
    var x1 = g[2] + 2;
    var y1 = g[3] + 2;
    var inside = 0;
    for (j = 0; j < kept.length && inside < 2; j++) {
      o = boxes[j];
      if (o[0] < x0 || o[2] > x1 || o[1] < y0 || o[3] > y1 || j === i) continue;
      // 只数同种类、比它小的：只有两三个像素大的框放宽 2 像素之后会互相「包着」，不能一起丢光
      if (kinds[j] === kinds[i] && areas[j] < areas[i]) inside++;
    }
    if (inside < 2) out.push(kept[i]);
  }
  return out;
}

function median(list) {
  if (!list.length) return 0;
  var s = list.slice().sort(function (a, b) {
    return a - b;
  });
  var m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 面积最大的那个房间矩形的长边（没有房间 = 0） */
function largestRoomSide(geo) {
  var rooms = isObj(geo) && isArr(geo.rooms) ? geo.rooms : [];
  var best = 0;
  var side = 0;
  for (var i = 0; i < rooms.length; i++) {
    var rects = isObj(rooms[i]) && isArr(rooms[i].rects) ? rooms[i].rects : [];
    for (var k = 0; k < rects.length; k++) {
      var b = normBox(rects[k]);
      if (!b) continue;
      var area = (b[2] - b[0]) * (b[3] - b[1]);
      if (area > best) {
        best = area;
        side = Math.max(b[2] - b[0], b[3] - b[1]);
      }
    }
  }
  return side;
}

/** 这个比例尺说得通：最大的房间长边在 1.5 米到 20 米之间（没有房间就没法核对，先信） */
function plausibleScale(m, side) {
  if (!isNum(m) || !(m > 0)) return false;
  return !(side > 0) || (side * m >= 1500 && side * m <= 20000);
}

/**
 * 估比例尺（1 像素 = 多少毫米），依次取第一个说得通的：设计师给的 → 图上读到的尺寸线 → 门宽当 850 →
 * 椅子窄边当 520 → 最大的房间长边当 4500 → 5。from = 用的是哪一个
 */
function estimateScale(geo, dimension, hints) {
  var g = isObj(geo) ? geo : {};
  if (isObj(hints) && isNum(hints.mmPerPx) && hints.mmPerPx > 0) return { mmPerPx: hints.mmPerPx, from: 'user' };
  var side = largestRoomSide(g);
  var m;
  var i;
  if (isObj(dimension) && isNum(dimension.mm) && isNum(dimension.px) && dimension.mm > 0 && dimension.px > 0) {
    m = dimension.mm / dimension.px;
    if (plausibleScale(m, side)) return { mmPerPx: roundScale(m), from: 'dimension' };
  }
  var spans = [];
  var openings = isArr(g.openings) ? g.openings : [];
  for (i = 0; i < openings.length; i++) {
    var o = openings[i];
    if (isObj(o) && o.type === 'door' && isNum(o.a) && isNum(o.b) && Math.abs(o.b - o.a) > 0) spans.push(Math.abs(o.b - o.a));
  }
  if (spans.length) {
    m = 850 / median(spans);
    if (plausibleScale(m, side)) return { mmPerPx: roundScale(m), from: 'door' };
  }
  var seats = [];
  var items = isArr(g.items) ? g.items : [];
  for (i = 0; i < items.length; i++) {
    var b = isObj(items[i]) && items[i].kind === 'chair' ? normBox(items[i].box) : null;
    if (b && Math.min(b[2] - b[0], b[3] - b[1]) > 0) seats.push(Math.min(b[2] - b[0], b[3] - b[1]));
  }
  if (seats.length) {
    m = 520 / median(seats);
    if (plausibleScale(m, side)) return { mmPerPx: roundScale(m), from: 'chair' };
  }
  m = side > 0 ? 4500 / side : 0;
  if (isNum(m) && m > 0) return { mmPerPx: roundScale(m), from: 'room' };
  return { mmPerPx: 5, from: 'default' };
}

/** 墙厚（像素，取整）：AI 量的折成毫米在 80–350 之间就用它，否则按 180 毫米算；知道图纸大小时夹在 3 像素到短边的 6% 之间 */
function deriveWallT(geo, hintPx) {
  var g = isObj(geo) ? geo : {};
  var m = isNum(g.mmPerPx) && g.mmPerPx > 0 ? g.mmPerPx : 5;
  var t = isNum(hintPx) && hintPx * m >= 80 && hintPx * m <= 350 ? hintPx : 180 / m;
  t = Math.round(t);
  if (!isFinite(t)) t = 36; // 比例尺小得离谱，算出来的墙厚溢出了 → 按默认的算
  var s = sizeOf(g.source);
  if (s) t = Math.min(t, Math.floor(0.06 * Math.min(s.w, s.h)));
  return Math.max(3, t);
}

/** 有面积的框（整理过）；坐标不对、压成一条线的 = null */
function solidBox(box) {
  var b = normBox(box);
  return b && b[2] - b[0] > 0 && b[3] - b[1] > 0 ? b : null;
}

/** 坐标取整（宽高至少留 1 像素） */
function roundBox(b) {
  var out = [Math.round(b[0]), Math.round(b[1]), Math.round(b[2]), Math.round(b[3])];
  if (out[2] - out[0] < 1) out[2] = out[0] + 1;
  if (out[3] - out[1] < 1) out[3] = out[1] + 1;
  return out;
}

/** 凹位和主矩形连着：一个方向上有重叠，另一个方向上贴着或重叠（差不超过 tol） */
function attached(main, r, tol) {
  var gx = Math.max(main[0] - r[2], r[0] - main[2], 0);
  var gy = Math.max(main[1] - r[3], r[1] - main[3], 0);
  var ox = Math.min(main[2], r[2]) - Math.max(main[0], r[0]);
  var oy = Math.min(main[3], r[3]) - Math.max(main[1], r[1]);
  return (gx <= tol + 1e-9 && oy > 0) || (gy <= tol + 1e-9 && ox > 0);
}

/** 连着的凹位和主矩形之间还剩一条缝（对齐、取整之后差的那一点）→ 把凹位那条边拉到主矩形上，免得中间多出一道薄墙 */
function glued(main, r) {
  var out = r.slice();
  if (out[0] > main[2]) out[0] = main[2];
  else if (out[2] < main[0]) out[2] = main[0];
  else if (out[1] > main[3]) out[1] = main[3];
  else if (out[3] < main[1]) out[3] = main[1];
  return out;
}

function contains(outer, inner) {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}

/** 没认出房间时先猜一个：设计师框选的范围，否则整张图往里缩 4% */
function guessRoom(sz, hints) {
  var b = isObj(hints) ? normBox(hints.mainRoom) : null;
  if (b) {
    b = [Math.max(0, b[0]), Math.max(0, b[1]), Math.min(sz.w, b[2]), Math.min(sz.h, b[3])];
    if (b[2] - b[0] >= 8 && b[3] - b[1] >= 8) return roundBox(b);
  }
  return roundBox([0.04 * sz.w, 0.04 * sz.h, 0.96 * sz.w, 0.96 * sz.h]);
}

/** 离一个点最近的轮廓边是不是横的（没有轮廓边 = fallback） */
function nearestEdgeHorizontal(edges, x, y, fallback) {
  var best = null;
  var horiz = fallback;
  for (var i = 0; i < edges.length; i++) {
    var e = edges[i];
    var h = e.side === 'top' || e.side === 'bottom';
    var p = h ? x : y;
    var q = h ? y : x;
    var along = p < e.a ? e.a - p : p > e.b ? p - e.b : 0;
    var d = Math.sqrt(along * along + (q - e.at) * (q - e.at));
    if (best === null || d < best) {
      best = d;
      horiz = h;
    }
  }
  return horiz;
}

/** 门窗的框 → 贴到最近的墙边上：沿框的长轴过中心画一段；框接近正方形时（可能连门扇的弧线一起框了）按最近的墙的方向 */
function placeOpening(geo, edges, box, tol) {
  var w = box[2] - box[0];
  var h = box[3] - box[1];
  var cx = (box[0] + box[2]) / 2;
  var cy = (box[1] + box[3]) / 2;
  var horiz = w >= h;
  if (Math.max(w, h) < 1.25 * Math.min(w, h)) horiz = nearestEdgeHorizontal(edges, cx, cy, horiz);
  var so = horiz ? snapOpening(geo, [box[0], cy], [box[2], cy], tol) : snapOpening(geo, [cx, box[1]], [cx, box[3]], tol);
  if (!so) so = horiz ? snapOpening(geo, [cx, box[1]], [cx, box[3]], tol) : snapOpening(geo, [box[0], cy], [box[2], cy], tol);
  if (!so) return null;
  var a = Math.round(so.a);
  var b = Math.round(so.b);
  if (b - a < 2) return null;
  return { side: so.side, at: so.at, a: a, b: b, room: so.room };
}

/** 东西在不在房间里：中心落在某个房间矩形里；柱子只要碰到房间外扩一个墙厚的范围就算（柱子常在墙里） */
function insideRooms(rects, kind, box, wallT) {
  var cx = (box[0] + box[2]) / 2;
  var cy = (box[1] + box[3]) / 2;
  var i;
  var r;
  for (i = 0; i < rects.length; i++) {
    r = rects[i];
    if (cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3]) return true;
  }
  if (kind !== 'column') return false;
  for (i = 0; i < rects.length; i++) {
    r = rects[i];
    if (box[0] <= r[2] + wallT && box[2] >= r[0] - wallT && box[1] <= r[3] + wallT && box[3] >= r[1] - wallT) return true;
  }
  return false;
}

function buildCore(structure, items, size, hints) {
  var notes = [];
  var sz = sizeOf(size);
  if (!sz) {
    sz = { w: 1000, h: 1000 };
    notes.push('不知道图纸的大小，先按 1000 x 1000 算');
  }
  var st = isObj(structure) ? structure : {};
  var hint = isObj(hints) ? hints : {};
  var big = Math.max(sz.w, sz.h);
  var tol = Math.max(2, 0.004 * big);
  var i;
  var j;
  var k;

  // 房间：每个房间自己的矩形互相对齐（不同房间之间不对齐，免得把薄墙两侧并到一起）
  var rooms = [];
  var srcRooms = isArr(st.rooms) ? st.rooms : [];
  var over = false;
  for (i = 0; i < srcRooms.length; i++) {
    var sr = srcRooms[i];
    if (!isObj(sr)) continue;
    if (rooms.length >= HARD_ROOMS) {
      over = true;
      break;
    }
    var name = text(sr.name, MAX_LABEL);
    var shown = name ? '房间「' + name + '」' : '第 ' + (i + 1) + ' 个房间';
    var srcRects = isArr(sr.rects) ? sr.rects : [];
    if (srcRects.length > HARD_RECTS) {
      srcRects = srcRects.slice(0, HARD_RECTS);
      over = true;
    }
    var aligned = alignRects(srcRects, tol);
    if (!aligned.length) {
      notes.push(shown + '没有可用的框，已丢掉');
      continue;
    }
    var main = roundBox(aligned[0]);
    var same = false;
    for (j = 0; j < rooms.length && !same; j++) same = iou(rooms[j].rects[0], main) > 0.7;
    if (same) {
      notes.push(shown + '和前面的房间几乎重叠，已丢掉');
      continue;
    }
    var rects = [main];
    for (k = 1; k < aligned.length; k++) {
      var niche = roundBox(aligned[k]);
      if (contains(main, niche)) continue;
      if (attached(main, niche, tol)) rects.push(glued(main, niche));
      else notes.push(shown + '有一个凹位没有和房间连在一起，已丢掉');
    }
    rooms.push({ name: name, rects: rects });
    if (sr.unsure) notes.push(shown + 'AI 不太确定，请核对范围');
  }
  if (over) notes.push('房间 / 房间里的矩形太多，后面的没有要');
  var guess = false;
  if (!rooms.length) {
    guess = true;
    rooms.push({ name: '', rects: [guessRoom(sz, hint)] });
    notes.push('AI 没认出房间，先猜了一个范围，请把它拖到墙的内侧');
  }
  var allRects = [];
  for (i = 0; i < rooms.length; i++) allRects = allRects.concat(rooms[i].rects);

  // 柱子 + 柜子家具：坐标不对的、把整个房间当成家具的丢掉，再去重
  var raw = [];
  var cols = isArr(st.columns) ? st.columns : [];
  over = false;
  for (i = 0; i < cols.length; i++) {
    var cb = solidBox(cols[i]);
    if (!cb) continue;
    if (raw.length >= HARD_COLUMNS) {
      over = true;
      break;
    }
    raw.push({ kind: 'column', label: '', box: cb });
  }
  var srcItems = isArr(items) ? items : isObj(items) && isArr(items.items) ? items.items : [];
  var roomLike = 0;
  var taken = 0;
  for (i = 0; i < srcItems.length; i++) {
    var si = srcItems[i];
    var ib = isObj(si) ? solidBox(si.box) : null;
    if (!ib) continue;
    if (taken >= HARD_ITEMS) {
      over = true;
      break;
    }
    taken++;
    var asRoom = false;
    for (j = 0; j < rooms.length && !asRoom && !guess; j++) asRoom = iou(rooms[j].rects[0], ib) > 0.85;
    if (asRoom) {
      roomLike++;
      continue;
    }
    var known = typeof si.kind === 'string' && has(KINDS, si.kind);
    var ri = { kind: known ? si.kind : 'block', label: text(si.label, MAX_LABEL), box: ib };
    if (si.unsure || !known) ri.unsure = true;
    raw.push(ri);
  }
  if (over) notes.push('柱子 / 柜子家具太多，后面的没有要');
  if (roomLike) notes.push(roomLike + ' 个框和房间一样大（把房间当成了家具），已丢掉');
  var list = dedupeItems(raw);
  if (list.length < raw.length) notes.push((raw.length - list.length) + ' 个重复的框 / 把几件东西框在一起的框已去掉');

  // 比例尺、墙厚（这时门窗还没贴墙，门宽先按框的长边算）
  var srcOpenings = [];
  var allOpenings = isArr(st.openings) ? st.openings : [];
  for (i = 0; i < allOpenings.length; i++) {
    if (!isObj(allOpenings[i]) || !normBox(allOpenings[i].box)) continue;
    if (srcOpenings.length >= HARD_OPENINGS) {
      notes.push('门窗太多，后面的没有要');
      break;
    }
    srcOpenings.push(allOpenings[i]);
  }
  var rough = [];
  for (i = 0; i < srcOpenings.length; i++) {
    var rb = normBox(srcOpenings[i].box);
    rough.push({ type: srcOpenings[i].type, a: 0, b: Math.max(rb[2] - rb[0], rb[3] - rb[1]) });
  }
  var scale = estimateScale({ rooms: rooms, openings: rough, items: list }, st.dimension, hint);
  var geo = { source: { w: sz.w, h: sz.h }, mmPerPx: scale.mmPerPx, wallT: 0, rooms: rooms, openings: [], items: [] };
  geo.wallT = deriveWallT(geo, st.wallT);
  if (scale.from === 'room' || scale.from === 'default') notes.push('图上没有读到可靠的尺寸，比例尺是按房间大小估的，请核对');

  // 门窗：贴到最近的墙边上；同一段墙上重叠的同种门窗并成一个
  var edges = boundaryEdges(geo);
  // 房间是猜的 → 门窗先都留着（贴到猜的墙上），设计师把房间拖对之后它们会跟着最近的墙走
  var otol = guess ? Infinity : 3 * geo.wallT + 0.02 * big;
  var placed = [];
  var lost = 0;
  var doubt = 0;
  for (i = 0; i < srcOpenings.length; i++) {
    var so = srcOpenings[i];
    var p = placeOpening(geo, edges, normBox(so.box), otol);
    if (!p) {
      lost++;
      continue;
    }
    p.type = so.type === 'window' || so.type === 'door' || so.type === 'hidden-door' || so.type === 'gap' ? so.type : 'gap';
    // 和前面重叠的同种门窗并成一个，放在最早那个的位置上；一个新的可能把前面两个连起来 → 所有碰到的都并进来
    var first = -1;
    for (j = 0; j < placed.length; j++) {
      var q = placed[j];
      if (q.type !== p.type || q.side !== p.side || q.room !== p.room || !(Math.abs(q.at - p.at) < 1e-6) || !(Math.min(q.b, p.b) - Math.max(q.a, p.a) > 0)) continue;
      p.a = Math.min(q.a, p.a);
      p.b = Math.max(q.b, p.b);
      if (first < 0) first = j;
      else {
        placed.splice(j, 1);
        j--;
      }
    }
    if (first < 0) placed.push(p);
    else placed[first] = p;
    if (so.unsure) doubt++;
  }
  if (lost) notes.push(lost + ' 个门窗离墙太远，没有放上去');
  if (doubt) notes.push(doubt + ' 个门窗 AI 不太确定（种类或位置），请核对');
  for (i = 0; i < placed.length; i++) geo.openings.push({ type: placed[i].type, side: placed[i].side, a: placed[i].a, b: placed[i].b, at: placed[i].at });

  // 柜子家具：离墙只差一点点的（看图的误差）拉到墙面；贴哪面墙按画图时的贴墙容差判断，框本身不再动
  // （和 scene.js / settle.js 用同一个容差：编辑器打开时理一遍，结果不会变）
  var atol = Math.max(4, 0.0086 * big);
  var flags = [];
  var outside = 0;
  for (i = 0; i < list.length; i++) {
    var it = list[i];
    var box = it.box;
    var against = null;
    if (it.kind === 'column') box = roundBox(box);
    else {
      box = roundBox(snapBox(geo, box, tol, 'move').box);
      against = snapBox(geo, box, atol, 'move').against;
    }
    var item = { id: newItemId(geo, it.kind), label: it.label || '', kind: it.kind, box: box };
    if (against) item.against = against;
    var unsure = !!it.unsure;
    if (!insideRooms(allRects, it.kind, box, geo.wallT)) {
      unsure = true;
      outside++;
    }
    flags.push(unsure);
    geo.items.push(item);
  }
  if (outside && !guess) notes.push(outside + ' 个东西在房间外面，先留着并标成待确认');
  for (i = 0; i < geo.items.length; i++) {
    if (geo.items[i].kind === 'chair') {
      var facing = guessFacing(geo, geo.items[i].box);
      if (facing) geo.items[i].facing = facing;
    }
    if (flags[i]) geo.items[i].unsure = true;
  }

  geo.scaleFrom = scale.from;
  if (guess) geo.roomGuess = true;
  return { geo: geo, notes: notes, partial: false };
}

/**
 * 两次看图整理好的结果 → 一份完整的几何数据。hints = { mainRoom:[x0,y0,x1,y1]|null（像素）, mmPerPx? }。
 * 房间对齐、估比例尺和墙厚、门窗贴墙、柜子家具去重并判断贴哪面墙 / 椅子朝向；房间外面的东西留着但标 unsure。
 * @returns {{ geo:object, notes:string[], partial:boolean }}
 */
function buildGeo(structure, items, size, hints) {
  try {
    return buildCore(structure, items, size, hints);
  } catch (e) {
    var sz = sizeOf(size) || { w: 1000, h: 1000 };
    var geo = { source: sz, mmPerPx: 5, wallT: 3, rooms: [{ name: '', rects: [guessRoom(sz, null)] }], openings: [], items: [] };
    geo.scaleFrom = 'default';
    geo.roomGuess = true;
    return { geo: geo, notes: ['整理 AI 的回复时出错，只留了一个猜的房间范围，请自己框'], partial: true };
  }
}

/** 数一数：几个房间、几个门窗、几个柜子家具、其中几个待确认（和编辑器里数的一样，只数柜子家具） */
function detectSummary(geo) {
  var g = isObj(geo) ? geo : {};
  var items = isArr(g.items) ? g.items : [];
  var unsure = 0;
  for (var i = 0; i < items.length; i++) if (items[i] && items[i].unsure) unsure++;
  return { rooms: isArr(g.rooms) ? g.rooms.length : 0, openings: isArr(g.openings) ? g.openings.length : 0, items: items.length, unsure: unsure };
}

/** 房间换回模型的坐标（每个房间的主矩形 → [ymin,xmin,ymax,xmax]，0–1000 的整数），写进第二次看图的提示词 */
function roomsForPrompt(structure, size) {
  var sz = sizeOf(size);
  var rooms = isObj(structure) && isArr(structure.rooms) ? structure.rooms : [];
  var out = [];
  if (!sz) return out;
  var unit = function (v, full) {
    return Math.max(0, Math.min(1000, Math.round((v / full) * 1000)));
  };
  for (var i = 0; i < rooms.length; i++) {
    var b = isObj(rooms[i]) && isArr(rooms[i].rects) ? normBox(rooms[i].rects[0]) : null;
    if (!b) continue;
    out.push({ name: text(rooms[i].name, MAX_LABEL), box_2d: [unit(b[1], sz.h), unit(b[0], sz.w), unit(b[3], sz.h), unit(b[2], sz.w)] });
  }
  return out;
}

export { looseJson, toPxBox, parseStructure, parseItems, alignRects, dedupeItems, estimateScale, deriveWallT, buildGeo, detectSummary, roomsForPrompt };
