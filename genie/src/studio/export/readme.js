// README.txt（中英对照的说明 + 材质表 + 柜子家具清单）和 <base>_schedule.csv（Excel 打开）。
// README：UTF-8 带 BOM、CRLF、每行 ≤ 100 列（中文一个字算 2 列）；每一句中文后面跟一行词典里的英文。
// 两份都只从 designerBrief() 生成（v2 换一份更完整的 brief 进来也一样能用）。

import { bi, biFill, both, SAIL_LINE } from './names.js';
import { catLabel, CATEGORY, UNCERTAIN } from './catalog.js';
import { LAYERS } from './plan.js';
import { CATALOG } from '../engine/furniture.js';
import { BRAND } from '../../shared/config.js';

const COLS = 100;
const wide = (ch) => /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch);
export const cols = (s) => [...s].reduce((n, ch) => n + (wide(ch) ? 2 : 1), 0);

// 一个字一个记号的：中日韩文字和全角标点；其他（英文、数字、“ ” 这种引号）跟着单词走
const TOKEN = /[⺀-鿿　-〿豈-﫿︰-﹏＀-￯]|[^\s⺀-鿿　-〿豈-﫿︰-﹏＀-￯]+|\s+/g;
// 不能放在行首的标点（避头）：折行时把前一个字一起带到下一行
const NO_START = /^[。，、；：！？）」』》〉％,.;:!?)]$/;

/** 按显示宽度折行（英文在空格处断，中文任意处断，句号逗号不放行首） */
function wrap(s, indent = '') {
  const out = [];
  let line = '';
  let w = 0;
  const max = COLS - cols(indent);
  const tokens = s.match(TOKEN) || [];
  for (const tk of tokens) {
    const tw = cols(tk);
    if (/^\s+$/.test(tk)) {
      if (w && w + 1 <= max) {
        line += ' ';
        w += 1;
      }
      continue;
    }
    if (w + tw > max && w) {
      let carry = '';
      if (NO_START.test(tk)) {
        const chars = [...line];
        carry = chars.pop() || '';
        line = chars.join('');
      }
      out.push(indent + line.trimEnd());
      line = carry;
      w = cols(carry);
    }
    if (tw > max) {
      // 很长的英文词（文件名）：硬切
      for (const ch of tk) {
        if (w + 1 > max) {
          out.push(indent + line);
          line = '';
          w = 0;
        }
        line += ch;
        w += cols(ch);
      }
      continue;
    }
    line += tk;
    w += tw;
  }
  if (line.trim()) out.push(indent + line.trimEnd());
  return out;
}

/** 一句中文 + 它的英文（两行，各自折行） */
function say(L, b, indent = '') {
  L.push(...wrap(b.zh, indent));
  if (b.en && b.en !== b.zh) L.push(...wrap(b.en, indent));
}

const rule = (ch = '-') => ch.repeat(COLS);
const sizeStr = (s) => s.join('×');
const matsStr = (ms) => ms.map((m) => `${m.slotZh} ${m.zh}`).join('、');

/**
 * @param {object} brief designerBrief()
 * @param {{ files: string[], base: string, kujiale: boolean, dxf: boolean, model3d: boolean }} o
 * @returns {string} README（还没加 BOM、换行是 \n；toBytes 时转 CRLF）
 */
export function readme(brief, { files = [], base = 'WISH', dxf = true, kujiale = true, model3d = true } = {}) {
  const L = [];
  const p = brief.project;
  L.push(`${BRAND.full} · ${SAIL_LINE} — ${bi('设计师文件包').zh} / ${bi('设计师文件包').en}`);
  L.push(rule('='));
  L.push(...wrap(`${both(bi('方案'), ' / ')}: ${p.name.zh ? both(p.name, ' / ') : '—'}`));
  L.push(`${both(bi('导出时间'), ' / ')}: ${p.exportedAt.slice(0, 16).replace('T', ' ')} UTC`);
  const st = brief.stats || {};
  const nOpen = st.openings ? st.openings.door + st.openings.window + st.openings.slider : 0;
  say(L, biFill('{0} 层 · {1} 个房间 · {2} 扇门窗 · {3} 件柜子和家具', [brief.floors.length, brief.rooms.length, nOpen, brief.items.length]));
  L.push('');
  const n = bi('概念示意，尺寸以现场量尺为准');
  say(L, { zh: `${n.zh}。`, en: n.en });
  say(L, bi('单位：DXF 用毫米（mm），3D 用米（m）。'));
  say(L, bi('原点：整栋楼左下角的外墙外皮，每个文件都一样，所以平面图和 3D 叠得上。'));
  say(L, bi('楼层：F1 = 一楼（Ground floor），F2 = 二楼（First floor），以此类推。'));
  L.push('');

  // ── 文件 ──
  L.push(both(bi('文件'), ' / '));
  L.push(rule());
  const list = (pred) => files.filter(pred);
  if (dxf) {
    L.push('');
    L.push(`[${both(bi('AutoCAD 平面图'), ' / ')}]`);
    for (const f of list((f) => f.endsWith('_plan_all-floors.dxf'))) L.push(`  ${f}`);
    say(L, bi('所有楼层并排放在一个文件里：一楼在原点，往右依次是二楼、三楼。'), '  ');
    say(L, bi('AutoCAD：文件 › 打开。中文用微软雅黑（文字样式 WISH-ZH）；想用 SHX 字体就把文字改成 WISH-SHX 样式。'), '  ');
    say(L, bi('柜子和家具都是图块，属性：NAME、NAME_EN、SIZE、CATEGORY、MATERIAL、MATERIALS、ROOM、ITEM_ID。'), '  ');
    say(L, bi('A-CASE 图层是我们做的定制柜；A-FURN、A-FURN-SOFT、A-EQPM 不是我们做的。'), '  ');
    say(L, bi('A-FURN 上的活动家具只是示意（通用的样子，不是我们的产品），尺寸和位置给你参考。'), '  ');
    say(L, bi('SketchUp：文件 › 导入 › AutoCAD 文件，单位选毫米，勾「保留绘图原点」。'), '  ');
    L.push('');
    L.push(`  ${both(bi('图层'), ' / ')}:`);
    for (const [name, , , , zh] of LAYERS) {
      const b = bi(zh);
      L.push(...wrap(`${name.padEnd(13)} ${b.zh} — ${b.en}`, '    '));
    }
  }
  if (kujiale) {
    L.push('');
    L.push(`[${both(bi('酷家乐户型'), ' / ')}]`);
    for (const f of list((f) => f.endsWith('_kujiale.dxf'))) L.push(`  ${f}`);
    say(L, bi('每层一个文件，原点和 3D 一样。'), '  ');
    say(L, bi('酷家乐：户型 › 导入 CAD 户型，一层一层导入，单位选毫米。'), '  ');
    say(L, bi('墙图层选 A-WALL（要阳台栏杆、车廊矮墙就再加 A-WALL-LOW）；门窗图层选 A-DOOR、A-DOOR-SLID、A-GLAZ。'), '  ');
    say(L, bi('楼梯用酷家乐自己的楼梯工具加。文字是 GBK 编码（中文版 AutoCAD 的写法）。'), '  ');
  }
  if (model3d) {
    L.push('');
    L.push(`[${both(bi('SketchUp 3D 模型'), ' / ')}]`);
    for (const f of list((f) => /_3D\.(dae|obj|mtl)$/.test(f))) L.push(`  ${f}`);
    say(L, bi('SketchUp：文件 › 导入 › COLLADA（*.dae），勾「合并共面」和「保留绘图原点」。'), '  ');
    say(L, bi('每层一个组，组里按墙体、地面、门窗、楼梯、栏杆、定制柜、家具分好；重复的柜子和家具是组件。'), '  ');
    say(L, bi('材质名是「表面__材质编号」（例如 cabinetry__white-lacquer），换材质一眼找到。'), '  ');
    say(L, bi('柜子和家具是真实外尺寸的简化体块；「家具示意」组里的活动家具不是我们的产品，换成你们自己的模型就好。天花没有导出。'), '  ');
    say(L, bi('OBJ + MTL 给 3ds Max、Blender、D5、Lumion、酷家乐模型上传用（Y 向上，米）。'), '  ');
  }
  L.push('');
  L.push(`[${both(bi('说明和清单'), ' / ')}]`);
  for (const f of list((f) => /README\.txt$|_schedule\.csv$/.test(f))) L.push(`  ${f}`);
  say(L, bi('用 Excel 打开清单（CSV）。'), '  ');
  L.push('');

  // ── 材质 ──
  L.push(both(bi('材质'), ' / '));
  L.push(rule());
  for (const m of brief.materials) L.push(...wrap(`${m.slot.padEnd(11)} ${m.id.padEnd(20)} ${m.slotName.zh}·${m.zh} — ${m.slotName.en} · ${m.en} — ${m.hex}`, ''));
  L.push('');

  // ── 清单 ──
  L.push(both(bi('柜子和家具清单'), ' / '));
  L.push(rule());
  const line = (it) => `${it.floor} · ${both(it.room)} · ${both(it.name)} · ${sizeStr(it.size)}${it.ours ? ` · ${it.ftRun} ft` : ''}${it.materials.length ? ` · ${matsStr(it.materials)}` : ''}`;
  for (const cat of ['case', 'fix', 'furn', 'soft']) {
    const rows = brief.items.filter((it) => it.category === cat);
    if (!rows.length) continue;
    const cl = catLabel(cat);
    L.push('');
    L.push(`${cl.zh} / ${cl.en} (${rows.length})`);
    for (const it of rows) L.push(...wrap(line(it), '  '));
    // 台面：我们配、向别的厂家买（外购），没有 sAil 板材编号（业主 2026-10-19）
    if (cat === 'case' && rows.some((it) => it.materials.some((m) => m.sourced))) say(L, bi('台面由我们配，向别的厂家采购（外购），没有 sAil 板材编号。'), '  ');
  }
  if (brief.doors.length) {
    const cl = catLabel('door');
    L.push('');
    L.push(`${cl.zh} / ${cl.en} (${brief.doors.length})`);
    for (const d of brief.doors) L.push(...wrap(`${d.floor} · ${both(d.room)} · ${both(bi('门'))} · ${sizeStr(d.size)}`, '  '));
  }
  L.push('');

  // ── 待确认 ──
  L.push(both(bi('待确认'), ' / '));
  L.push(rule());
  const names = (kinds) => ({ zh: kinds.map((k) => bi(CATALOG[k].zh).zh).join('、'), en: kinds.map((k) => bi(CATALOG[k].zh).en).join(', ') });
  say(L, biFill('这几样现在算定制柜（我们做）：{0}。不对的话告诉开发同事，只要改一个地方。', [names(UNCERTAIN.case.filter((k) => CATEGORY.case.includes(k)))]));
  say(L, biFill('这几样现在算成品家具（不是我们做）：{0}。', [names(UNCERTAIN.furn)]));
  if (st.skipped) say(L, biFill('有 {0} 件家具认不出来，没有导出。', [st.skipped]));
  L.push('');
  L.push(rule('='));
  say(L, bi('仅供公司内部设计使用。'));
  return L.join('\n') + '\n';
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 清单 CSV 的材质一段：表面 id = 材质 id + 表面名 + 材质名（cabinetry=white-oak 柜体 白橡；countertop=quartz-travertine 台面（外购） 石英石·洞石纹） */
const csvMat = (m) => `${m.slot}=${m.id} ${m.slotZh} ${m.zh}`;

/** schedule.csv：一行一件（定制柜在前），再是门扇（category = 门） */
export function scheduleCsv(brief) {
  const head = ['floor', 'room_zh', 'room_en', 'category', 'ours', 'kind', 'name_zh', 'name_en', 'W_mm', 'D_mm', 'H_mm', 'ft_run', 'materials', 'item_id'];
  const rows = [head];
  for (const it of brief.items) {
    const cl = catLabel(it.category);
    rows.push([it.floor, it.room.zh, it.room.en, `${cl.zh} / ${cl.en}`, it.ours ? 'yes' : 'no', it.kind, it.name.zh, it.name.en, it.size[0], it.size[1], it.size[2], it.ours ? it.ftRun : '', it.materials.map(csvMat).join('; '), it.id]);
  }
  const cl = catLabel('door');
  const door = bi('门');
  for (const d of brief.doors) rows.push([d.floor, d.room.zh, d.room.en, `${cl.zh} / ${cl.en}`, 'yes', 'door', door.zh, door.en, d.size[0], d.thick, d.size[1], '', '', d.id]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/** 文本 → UTF-8 带 BOM、CRLF 的字节 */
export function textBytes(s) {
  const body = new TextEncoder().encode(s.replace(/\r?\n/g, '\r\n'));
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(body, 3);
  return out;
}

