// 走进去 · 静态守门（docs/walk/SPEC.md「House rules」、§5、§6 —— 读源码，不跑浏览器）：
//   ① 整块懒加载：src/studio/walk/ 外面没有任何地方 import 它，只有 StudioApp 的那一个 import('./walk/WalkMode.jsx')；
//   ② 英文词典 en-walk*.js 只有 walk/words.js 可以 import（WalkMode 第一个 import 的就是 words.js）；
//   ③ three.js：只用工作室第一块里已经有的（外加 Quaternion / Euler / Spherical），不用 three/addons ——
//      走进去才用的新类会被打进第一块（three 在第一块里），每个人第一次打开 3D 都要多下载；
//   ④ 不碰这台设备的存储和文件：localStorage / sessionStorage / indexedDB / 下载 / createObjectURL / 选文件（许愿模式的展厅 iPad）；
//   ⑤ StudioApp：许愿模式 shoot = null、接口齐全、「走进去」胶囊是底部那一列的第一个孩子而且不占位置、
//      is-walk 只藏不改排版（取景留白不变 → 回到全屋一模一样）、守门（键盘、日光小图、外壳传来的户型图）；
//   ⑥ walk 的样式只管走进去自己的元素：那一块在界面好了 4 秒后就在后台载入，样式表一进来就生效，不能碰鸟瞰的界面。
// 跑法：node test/walk.test.mjs（npm test 会一起跑）

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import traverseMod from '@babel/traverse';

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const WALK = path.join(SRC, 'studio', 'walk');
const STUDIO_APP = path.join(SRC, 'studio', 'StudioApp.jsx');
const WALK_MODE = path.join(WALK, 'WalkMode.jsx');
const WORDS = path.join(WALK, 'words.js');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const inWalk = (f) => f.startsWith(WALK + path.sep);
const read = (f) => fs.readFileSync(f, 'utf8');

let n = 0;
let failed = 0;
async function test(name, fn) {
  n++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 6).join('\n    ')}`);
  }
}

// ───────────────────────── 读源码 ─────────────────────────

function files(dir, re = /\.(jsx?|mjs)$/, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) files(p, re, acc);
    else if (re.test(f)) acc.push(p);
  }
  return acc;
}
const SRC_FILES = files(SRC);
const WALK_FILES = SRC_FILES.filter(inWalk);

const AST = new Map();
function ast(file) {
  if (!AST.has(file)) AST.set(file, parse(read(file), { sourceType: 'module', plugins: ['jsx'] }));
  return AST.get(file);
}

/** 相对路径 → 真的文件（Vite 的写法：可以不带扩展名、可以是文件夹的 index） */
function resolve(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const p of [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, path.join(base, 'index.js'), path.join(base, 'index.jsx')]) if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  return base;
}

/** 一个文件里所有的 import：{ spec, kind: 'static' | 'dynamic', to（解析好的文件，包名是 null）, line } */
function importsOf(file) {
  const out = [];
  const add = (spec, kind, node) => void out.push({ spec, kind, to: resolve(file, spec), line: node.loc.start.line });
  traverse(ast(file), {
    ImportDeclaration(p) {
      add(p.node.source.value, 'static', p.node);
    },
    ExportNamedDeclaration(p) {
      if (p.node.source) add(p.node.source.value, 'static', p.node);
    },
    ExportAllDeclaration(p) {
      add(p.node.source.value, 'static', p.node);
    },
    CallExpression(p) {
      const a = p.node.arguments[0];
      if (p.node.callee.type === 'Import') {
        if (a?.type === 'StringLiteral') add(a.value, 'dynamic', p.node);
        else if (a?.type === 'TemplateLiteral' && !a.expressions.length) add(a.quasis[0].value.cooked, 'dynamic', p.node);
        else out.push({ spec: '<expression>', kind: 'dynamic', to: null, line: p.node.loc.start.line });
      }
    },
  });
  return out;
}

/** 从 entry 出发、顺着 import 走到的 src 文件（dynamic = 连懒加载的也走） */
function graph(entry, { dynamic = false } = {}) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !fs.existsSync(f) || !/\.(jsx?|mjs)$/.test(f)) continue;
    seen.add(f);
    for (const im of importsOf(f)) if (im.to && im.to.startsWith(SRC) && (dynamic || im.kind === 'static')) stack.push(im.to);
  }
  return seen;
}

/** 一个文件用到的 three.js 名字 + 用不清楚的地方（THREE[x]、把整个 THREE 传出去）+ three/ 下面的模块 */
function threeOf(file) {
  const names = new Set();
  const unclear = [];
  const subpaths = [];
  const ns = new Set();
  const tree = ast(file);
  traverse(tree, {
    ImportDeclaration(p) {
      const src = p.node.source.value;
      if (src.startsWith('three/')) subpaths.push(`${src} (line ${p.node.loc.start.line})`);
      if (src !== 'three') return;
      for (const s of p.node.specifiers) {
        if (s.type === 'ImportSpecifier') names.add(s.imported.name ?? s.imported.value);
        else ns.add(s.local.name);
      }
    },
    CallExpression(p) {
      const a = p.node.arguments[0];
      if (p.node.callee.type === 'Import' && a?.type === 'StringLiteral' && a.value.startsWith('three')) subpaths.push(`import('${a.value}') (line ${p.node.loc.start.line})`);
    },
  });
  if (ns.size) {
    traverse(tree, {
      Identifier(p) {
        if (!ns.has(p.node.name) || p.parent.type === 'ImportNamespaceSpecifier') return;
        const par = p.parent;
        if (par.type === 'MemberExpression' && par.object === p.node && !par.computed) names.add(par.property.name);
        else if (par.type === 'MemberExpression' && par.property === p.node && !par.computed) return; // x.THREE：只是同名的属性
        else if (par.type === 'VariableDeclarator' && par.init === p.node && par.id.type === 'ObjectPattern') par.id.properties.forEach((q) => q.key && names.add(q.key.name));
        else unclear.push(`line ${p.node.loc.start.line}`);
      },
    });
  }
  return { names, unclear, subpaths };
}

// ───────────────────────── CSS（没有嵌套：一层 @media / @supports，@keyframes 跳过） ─────────────────────────

function splitTop(s, sep = ',') {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const c of s) {
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    if (c === sep && !depth) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** → [{ at: ['@media …'], selectors: [...], decls: { prop: value } }] */
function cssRules(text) {
  const s = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const skip = (i) => {
    let d = 0;
    for (; i < s.length; i++) {
      if (s[i] === '{') d++;
      else if (s[i] === '}' && !--d) return i + 1;
    }
    return i;
  };
  const block = (i, at) => {
    let buf = '';
    while (i < s.length) {
      const c = s[i];
      if (c === '}') return i + 1;
      if (c === ';' && buf.trim().startsWith('@')) {
        buf = ''; // @import / @charset
        i++;
        continue;
      }
      if (c !== '{') {
        buf += c;
        i++;
        continue;
      }
      const pre = buf.trim();
      buf = '';
      if (/^@(-\w+-)?keyframes\b/.test(pre) || /^@font-face\b/.test(pre)) {
        i = skip(i);
        continue;
      }
      if (pre.startsWith('@')) {
        i = block(i + 1, [...at, pre]);
        continue;
      }
      const end = s.indexOf('}', i);
      const body = s.slice(i + 1, end);
      if (body.includes('{')) throw new Error(`CSS 嵌套没法读：${pre}`);
      const decls = {};
      for (const d of body.split(';')) {
        const k = d.indexOf(':');
        if (k > 0) decls[d.slice(0, k).trim().toLowerCase()] = d.slice(k + 1).trim();
      }
      out.push({ at, selectors: splitTop(pre), decls });
      i = end + 1;
    }
    return i;
  };
  block(0, []);
  return out;
}

// ───────────────────────── ① 懒加载 ─────────────────────────

await test('① src/studio/walk/ 外面不 import 它，只有 StudioApp 懒加载 WalkMode.jsx', () => {
  const bad = [];
  const lazyHits = [];
  for (const f of SRC_FILES) {
    if (inWalk(f)) continue;
    for (const im of importsOf(f)) {
      if (!im.to || !inWalk(im.to)) continue;
      if (f === STUDIO_APP && im.kind === 'dynamic' && im.to === WALK_MODE) lazyHits.push(im);
      else bad.push(`${rel(f)}:${im.line}  ${im.kind} import '${im.spec}'`);
    }
  }
  assert.deepEqual(bad, []);
  assert.equal(lazyHits.length, 1, "StudioApp.jsx 里要有、而且只有一个 import('./walk/WalkMode.jsx')");
  assert.ok(fs.existsSync(WALK_MODE), 'src/studio/walk/WalkMode.jsx 要在');
  // 工作室第一块（main.jsx 顺着静态 import 走到的）里一个 walk 文件都没有
  const entry = graph(path.join(SRC, 'studio', 'main.jsx'));
  assert.deepEqual([...entry].filter(inWalk).map(rel), []);
  assert.match(read(STUDIO_APP), /lazy\(\s*loadWalk\s*\)|lazy\(\s*\(\)\s*=>\s*import\(\s*['"]\.\/walk\/WalkMode\.jsx['"]\s*\)\s*\)/, 'WalkMode 用 React.lazy 载入');
});

// ───────────────────────── ② 英文词典 ─────────────────────────

await test('② en-walk*.js 只有 walk/words.js import；WalkMode.jsx 第一个 import words.js', () => {
  const bad = [];
  for (const f of SRC_FILES) {
    for (const im of importsOf(f)) {
      const base = path.basename(im.to || im.spec);
      if (!/^en-walk\w*(\.js)?$/.test(base)) continue;
      if (f !== WORDS) bad.push(`${rel(f)}:${im.line}  imports ${im.spec}`);
    }
  }
  assert.deepEqual(bad, []);
  // 三个词典都在（words.js 把它们并进来）
  for (const d of ['en-walk.js', 'en-walktour.js', 'en-walktools.js']) {
    assert.ok(fs.existsSync(path.join(SRC, 'shared', 'i18n', d)), `${d} 要在`);
    assert.ok(importsOf(WORDS).some((im) => path.basename(im.to || '') === d), `walk/words.js 要 import ${d}`);
  }
  const first = ast(WALK_MODE).program.body.find((s) => s.type === 'ImportDeclaration');
  assert.equal(first?.source.value, './words.js', 'WalkMode.jsx 的第一个 import 是 ./words.js（别的 walk 模块顶上的 t() 才查得到英文）');
});

// ───────────────────────── ③ three.js ─────────────────────────

await test('③ walk 只用第一块里已经有的 three.js（+ Quaternion / Euler / Spherical），不用 three/addons', () => {
  const entry = graph(path.join(SRC, 'studio', 'main.jsx'));
  const have = new Set(['Quaternion', 'Euler', 'Spherical']);
  for (const f of entry) for (const x of threeOf(f).names) have.add(x);
  assert.ok(have.has('Mesh') && have.has('Vector3') && have.size > 40, `第一块里认出来的 three.js 太少（${have.size}）：读法坏了？`);
  // 要查的：walk 文件夹里的全部 + 从 WalkMode 走到、但不在第一块里的（走进去那一块新带进来的模块）
  const lazy = fs.existsSync(WALK_MODE) ? [...graph(WALK_MODE, { dynamic: true })].filter((f) => !entry.has(f)) : [];
  const check = [...new Set([...WALK_FILES, ...lazy])];
  const bad = [];
  for (const f of check) {
    const { names, unclear, subpaths } = threeOf(f);
    for (const x of names) if (!have.has(x)) bad.push(`${rel(f)}  THREE.${x}（工作室第一块里没有）`);
    for (const u of unclear) bad.push(`${rel(f)}  ${u}：THREE 的用法看不清（THREE[x] / 整个传出去）`);
    for (const s of subpaths) bad.push(`${rel(f)}  ${s}：不用 three/ 下面的模块`);
  }
  assert.deepEqual(bad, []);
});

// ───────────────────────── ④ 存储 / 文件 ─────────────────────────

await test('④ walk 里没有 localStorage / sessionStorage / indexedDB / 下载 / createObjectURL / 选文件', () => {
  const BANNED = new Set(['localStorage', 'sessionStorage', 'indexedDB', 'createObjectURL', 'showSaveFilePicker', 'showOpenFilePicker', 'showDirectoryPicker']);
  const bad = [];
  for (const f of WALK_FILES) {
    const hit = (node, what) => bad.push(`${rel(f)}:${node.loc.start.line}  ${what}`);
    const str = (v) => (v?.type === 'StringLiteral' ? v.value : v?.type === 'TemplateLiteral' && !v.expressions.length ? v.quasis[0].value.cooked : null);
    traverse(ast(f), {
      Identifier(p) {
        if (BANNED.has(p.node.name)) hit(p.node, p.node.name);
      },
      StringLiteral(p) {
        if (BANNED.has(p.node.value)) hit(p.node, `'${p.node.value}'`);
      },
      MemberExpression(p) {
        const prop = p.node.computed ? str(p.node.property) : p.node.property.name;
        if (prop === 'download') hit(p.node, '.download');
      },
      AssignmentExpression(p) {
        const l = p.node.left;
        if (l.type === 'MemberExpression' && !l.computed && l.property.name === 'type' && str(p.node.right) === 'file') hit(p.node, ".type = 'file'");
      },
      ObjectProperty(p) {
        const k = p.node.key.name ?? p.node.key.value;
        if (k === 'type' && str(p.node.value) === 'file') hit(p.node, "type: 'file'");
        if (k === 'download') hit(p.node, 'download:');
      },
      JSXAttribute(p) {
        const k = p.node.name.name;
        const v = p.node.value?.type === 'JSXExpressionContainer' ? str(p.node.value.expression) : p.node.value?.value;
        if (k === 'download') hit(p.node, 'download=');
        if (k === 'type' && v === 'file') hit(p.node, 'type="file"');
        if (k === 'accept' || k === 'capture') hit(p.node, `${k}=（选文件 / 相机）`);
      },
      CallExpression(p) {
        const c = p.node.callee;
        const name = c.type === 'MemberExpression' && !c.computed ? c.property.name : c.name;
        const a0 = str(p.node.arguments[0]);
        if (name === 'setAttribute' && (a0 === 'download' || (a0 === 'type' && str(p.node.arguments[1]) === 'file'))) hit(p.node, `setAttribute('${a0}')`);
      },
    });
  }
  assert.deepEqual(bad, []);
  assert.ok(WALK_FILES.length >= 2, '读到的 walk 文件太少');
});

// ───────────────────────── ⑤ StudioApp ─────────────────────────

const APP = read(STUDIO_APP);
/** 从 start 那一句到它后面第一个 end（含） */
const slice = (start, end) => {
  const i = APP.indexOf(start);
  assert.ok(i >= 0, `StudioApp.jsx 里找不到：${start}`);
  const j = APP.indexOf(end, i + start.length);
  assert.ok(j > i, `StudioApp.jsx：${start} 后面找不到 ${end}`);
  return APP.slice(i, j + end.length);
};

await test('⑤ StudioApp：许愿模式 shoot = null；给 WalkMode 的接口齐全', () => {
  assert.match(APP, /\bshoot:\s*WISH\s*\?\s*null\s*:/, 'api.shoot 在许愿模式是 null（展厅 iPad 不下载）');
  assert.match(APP, /onShot=\{WISH\s*\?\s*null\s*:/, '工具条的下载也一样');
  const api = slice('const walkApi = useMemo(', '}, []);');
  for (const k of ['dropMaterial', 'setTime', 'moveItem', 'rotateItem', 'removeItem', 'undo', 'canUndo', 'flash', 'setMarks', 'shoot']) assert.match(api, new RegExp(`\\b${k}[:,]`), `api.${k}`);
  // 收藏的角度不进撤销（只 setProject，不 commit）
  assert.match(api, /setMarks:[^\n]*setProject\(/);
  assert.doesNotMatch(api.match(/setMarks:[^\n]*/)[0], /commit\(/);
  // WalkMode 拿到的东西（SPEC §5）
  const el = slice('<WalkMode ', '/>');
  for (const p of ['engine=', 'project=', 'api={walkApi}', 'wish={WISH}', 'staff=', 'onExit=']) assert.ok(el.includes(p), `<WalkMode ${p}…>`);
});

await test('⑤ 「走进去」胶囊：.dock-wrap 的第一个孩子，data-walk="enter"，脚印图标；什么时候出现、点下去做什么', () => {
  let wrap = null;
  traverse(ast(STUDIO_APP), {
    JSXElement(p) {
      const cls = p.node.openingElement.attributes.find((a) => a.name?.name === 'className');
      if (cls?.value?.value === 'dock-wrap') wrap = p.node;
    },
  });
  assert.ok(wrap, '找不到 <div className="dock-wrap">');
  const kids = wrap.children.filter((c) => c.type !== 'JSXText' || c.value.trim());
  // 第一个孩子：{canWalk && (<button …>)}（注释 {/* */} 不算）
  const first = kids.find((c) => !(c.type === 'JSXExpressionContainer' && c.expression.type === 'JSXEmptyExpression'));
  const btn = first?.type === 'JSXElement' ? first : first?.expression?.right;
  assert.equal(btn?.type, 'JSXElement', '.dock-wrap 的第一个孩子是「走进去」按钮');
  const attr = (k) => btn.openingElement.attributes.find((a) => a.name?.name === k)?.value?.value;
  assert.equal(btn.openingElement.name.name, 'button');
  assert.equal(attr('data-walk'), 'enter');
  assert.equal(attr('className'), 'walk-pill');
  assert.equal(attr('type'), 'button');
  const icon = btn.children.find((c) => c.type === 'JSXElement' && c.openingElement.name.name === 'Icon');
  assert.equal(icon?.openingElement.attributes.find((a) => a.name?.name === 'name')?.value?.value, 'walk');
  assert.match(read(path.join(SRC, 'studio', 'ui', 'kit.jsx')), /\n\s*walk:\s*Footprints\b/, 'kit.jsx ICONS 里 walk = Footprints');
  // 什么时候出现：鸟瞰、什么都没打开
  const can = slice('const canWalk =', ';');
  for (const k of ['!walk', '!demo', '!showroom', '!planDraft', '!modal', '!ask', 'cmp.mode']) assert.ok(can.includes(k), `canWalk 要看 ${k}`);
  // 点下去：解锁声音、取消选择、进 walk
  const enter = slice('const enterWalk = () => {', '\n  };');
  for (const k of ['voice.unlock', 'select(null)', 'setWalk(true)']) assert.ok(enter.includes(k), `enterWalk：${k}`);
  // 根节点 is-walk；后台先取那一块（展厅、演示不取）
  assert.match(APP, /\$\{walk \? 'is-walk' : ''\}/);
  const pre = slice('const walkFetched = useRef(false);', '}, [ready, showroom, demo]);');
  assert.ok(pre.includes('loadWalk()') && /setTimeout\([\s\S]*4000\)/.test(pre), '界面好了 4 秒后先取');
});

await test('⑤ 走进去时的守门：键盘快捷键、日光小图、外壳传来的户型图', () => {
  assert.match(slice('keyRef.current = (ev) => {', '\n  };'), /walkRef\.current\)\s*return;/, '键盘：走进去时不做快捷键');
  assert.match(slice('const scheduleThumbs = useCallback(', '}, []);'), /walkRef\.current[^\n]*thumbsLater\.current = true/, '日光小图：等回到全屋');
  const msg = slice("ev.data.type === 'plan-file'", '\n    };');
  assert.ok(msg.includes('walkRef.current') && msg.includes('planAfterWalk.current') && msg.includes('setWalk(false)'), '户型图：先回到全屋再读');
  const back = slice('walkRef.current = walk;', '}, [walk, scheduleThumbs]);');
  assert.ok(back.includes('scheduleThumbs()') && back.includes('readRef.current?.(f)'), '回到全屋：补画小图、读户型图');
});

await test('⑤ studio.css：is-walk 只用 opacity / visibility / pointer-events 藏鸟瞰界面；胶囊不占位置、≥ 44px、金色', () => {
  const rules = cssRules(read(path.join(SRC, 'studio', 'studio.css')));
  const LAYOUT_SAFE = new Set(['opacity', 'visibility', 'pointer-events', 'transition']);
  const BIRD = ['.mood-panel', '.toolbar', '.dock-wrap', '.floor-switch', '.callouts', '.foot', '.st-split', '.st-pip', '.st-seg', '.st-cmp-phone', '.st-banner', '.day-panel', '.dock', '.selbar', '.hovertip'];
  const hidden = new Set();
  const bad = [];
  for (const r of rules) {
    for (const sel of r.selectors) {
      if (!sel.includes('.is-walk')) continue;
      const target = BIRD.find((b) => new RegExp(`${b.replace('.', '\\.')}(?![\\w-])`).test(sel.split(/\s+/).pop()));
      if (!target) continue;
      for (const k of Object.keys(r.decls)) if (!LAYOUT_SAFE.has(k)) bad.push(`${sel} { ${k} }`);
      if (r.decls.visibility === 'hidden') hidden.add(target);
      // 情绪面板、工具条：freeBand 读它们的 opacity，opacity 不能变
      if ((target === '.mood-panel' || target === '.toolbar') && 'opacity' in r.decls) bad.push(`${sel} { opacity }：freeBand 读这个`);
    }
  }
  assert.deepEqual(bad, []);
  for (const b of ['.mood-panel', '.toolbar', '.dock-wrap', '.floor-switch', '.callouts', '.foot', '.st-split', '.st-pip']) assert.ok(hidden.has(b), `.is-walk ${b} 要 visibility: hidden`);
  // 胶囊：绝对定位（不占底部那一列的位置）、≥ 44px、金色
  const pill = rules.find((r) => !r.at.length && r.selectors.includes('.walk-pill'));
  assert.ok(pill, '.walk-pill 的样式');
  assert.equal(pill.decls.position, 'absolute');
  assert.ok(parseFloat(pill.decls['min-height']) >= 44, 'min-height ≥ 44px');
  assert.equal(pill.decls.background, 'var(--gold-btn)');
  for (const k of ['display', 'width', 'height', 'flex', 'order']) assert.ok(!rules.some((r) => r.selectors.some((s) => s.includes('.is-walk') && BIRD.some((b) => s.endsWith(b))) && k in r.decls), `.is-walk 不改 ${k}`);
});

// ───────────────────────── ⑥ walk 的样式、WalkMode 的约定 ─────────────────────────

await test('⑥ src/studio/walk/*.css 每一条选择器都只管走进去的元素（含 walk）', () => {
  const bad = [];
  for (const f of files(WALK, /\.css$/)) {
    for (const r of cssRules(read(f))) for (const sel of r.selectors) if (!/walk/i.test(sel)) bad.push(`${rel(f)}  ${sel}`);
  }
  assert.deepEqual(bad, []);
});

await test('⑥ WalkMode：默认导出；「回到全屋」按钮 data-walk="exit"', () => {
  const body = ast(WALK_MODE).program.body;
  assert.ok(body.some((s) => s.type === 'ExportDefaultDeclaration'), 'WalkMode.jsx 默认导出一个组件');
  const exit = WALK_FILES.filter((f) => f.endsWith('.jsx')).some((f) => /data-walk=["']exit["']/.test(read(f)));
  assert.ok(exit, 'walk 里要有 data-walk="exit" 的按钮（脚本点它回到全屋）');
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
