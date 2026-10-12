// 文档测试台（浏览器）：/test/harness.html?t=<templateId>&v=full|empty|pass|stress|long|english|enraw|enempty&lang=zh|en|both
// 自动填一份报告 + 真实照片，渲染 DocPreview，并暴露 window.__exportPdf()。
// lang = 文件语言（不给 = 双语）；v=english = 用户填写的内容全是英文（项目 / 备注 / 名字 / 照片说明，没有一个中文字），
// 配 lang=en 检查生成的文件里一个中文字都没有。enraw = 同上，但自动带入的项目资料保持 App 生成的原样（「项目（客户）」全角括号）；
// enempty = 英文项目、出厂设置新建，一个字没填（App 写进去的默认值原样）。window.__docText() = 页面上的全部文字（截图前的 DOM）。
import { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { fillReport, SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fill.js';
import { buildDocModel } from '../src/lib/docmodel.js';
import { createReport, resolveBind } from '../src/lib/report.js';
import { resolveScale } from '../src/templates/schema.js';
import { normLang } from '../src/lib/lang.js';
import DocPreview from '../src/components/doc/DocPreview.jsx';
import DocPages from '../src/components/doc/DocPages.jsx';
import { createUrlPool } from '../src/components/doc/media.js';
import { PAGE_W } from '../src/components/doc/theme.js';
import { exportPdf, renderPagesToImages } from '../src/lib/export/pdf.js';

// 逐个加载模板文件（某个模板还没写好 / 报错就跳过）
const MODULES = import.meta.glob(['../src/templates/*.js', '!../src/templates/index.js', '!../src/templates/schema.js', '!../src/templates/helpers.js']);

async function loadTemplates() {
  const out = [];
  for (const [path, load] of Object.entries(MODULES)) {
    try {
      const mod = await load();
      const t = mod.default;
      if (t && t.id && Array.isArray(t.sections)) out.push(t);
    } catch (e) {
      console.warn('skip template', path, e?.message);
    }
  }
  return out.sort((a, b) => (a.stage || 99) - (b.stage || 99));
}

function imageSize(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ w: 800, h: 600 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

async function fetchBlob(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`fetch ${path} → ${r.status}`);
  return r.blob();
}

/** 与 test/fixtures.mjs sampleMedia() 相同的媒体库（english = 照片说明也是英文） */
async function sampleMedia({ english = false } = {}) {
  const media = new Map();
  for (let i = 1; i <= 7; i += 1) {
    const blob = await fetchBlob(`/test/assets/photo${i}.jpg`);
    const { w, h } = await imageSize(blob);
    const caption = i % 3 === 0 ? (english ? `Site photo ${i}` : `现场照片 ${i}`) : '';
    media.set(`m_photo${i}`, { id: `m_photo${i}`, kind: 'photo', blob, thumb: blob, w, h, caption });
  }
  const sig = await fetchBlob('/test/assets/signature.png');
  const s = await imageSize(sig);
  media.set('m_sig', { id: 'm_sig', kind: 'signature', blob: sig, thumb: sig, w: s.w, h: s.h });
  const poster = media.get('m_photo3');
  media.set('m_video', {
    id: 'm_video',
    kind: 'video',
    blob: new Blob([new Uint8Array(16)], { type: 'video/mp4' }),
    thumb: poster.blob,
    poster: poster.blob,
    w: poster.w,
    h: poster.h,
    duration: 42,
    name: 'exit.mp4',
  });
  // 坏媒体（long 变体用）：没抓到封面的视频 → 「视频 Video」占位；0 字节照片 → 「照片缺失」占位
  media.set('m_video_np', { id: 'm_video_np', kind: 'video', blob: new Blob([new Uint8Array(2048)], { type: 'video/mp4' }), thumb: null, poster: null, w: 640, h: 360, duration: 12 });
  media.set('m_zero', { id: 'm_zero', kind: 'photo', blob: new Blob([], { type: 'image/jpeg' }), thumb: new Blob([], { type: 'image/jpeg' }), w: 1600, h: 1200 });
  return media;
}

/** 与 lib/db.js createMediaLoader 同接口、同取图规则（视频只给封面，0 字节当作没有） */
function createLoader(media) {
  const urls = [];
  return {
    async get(id) {
      return media.get(id) || null;
    },
    async url(id, which = 'blob') {
      const m = media.get(id);
      const ok = (x) => (x && x.size !== 0 ? x : null);
      const b =
        m &&
        (m.kind === 'video' || which === 'poster'
          ? ok(m.poster) || ok(m.thumb)
          : which === 'thumb'
            ? ok(m.thumb) || ok(m.blob)
            : ok(m.blob) || ok(m.thumb));
      if (!b) return null;
      const u = URL.createObjectURL(b);
      urls.push(u);
      return u;
    },
    dispose() {
      urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    },
  };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** stress：超长文字 / 大量照片 / 长备注 —— 检查分页不溢出、不死循环 */
function stressReport(template, report) {
  const P = (n, k = 0) => Array.from({ length: n }, (_, i) => `m_photo${((i + k) % 7) + 1}`);
  const para = (i) => `第 ${i + 1} 段：今日完成鞋柜与主卧衣柜柜体安装，门板明天到场；现场已清理，保护膜完好。Cabinet carcasses installed, doors arrive tomorrow. `.repeat(3);
  const long = Array.from({ length: 30 }, (_, i) => para(i)).join('\n');
  for (const s of template.sections) {
    if (s.type === 'fields') {
      for (const f of s.fields) {
        if (f.type === 'textarea') report.values[f.key] = long;
        if (f.type === 'photos') report.values[f.key] = P(14);
        if (f.type === 'list') report.values[f.key] = Array.from({ length: 30 }, (_, i) => `第 ${i + 1} 条规定：走廊、电梯、单位地面先铺保护垫再搬运`);
        if (f.type === 'text' && !report.values[f.key]) report.values[f.key] = '很长的一行文字没有空格'.repeat(12);
      }
    }
    if (s.type === 'checklist' && s.items.length) {
      const it = s.items[0];
      const a = report.items[it.id] || {};
      report.items[it.id] = { ...a, note: '整改说明：'.concat('左侧门板缝隙偏大 3mm，已通知工厂补件并约定 10 月 12 日复查。'.repeat(6)), photos: P(9, 2) };
    }
    if (s.type === 'table') {
      const rows = report.tables[s.id] || [];
      rows.forEach((r) => {
        r.photos = P(5, 1);
        for (const slot of s.photoSlots || []) r[slot.key] = P(3, 3);
      });
    }
  }
  return report;
}

/**
 * long：审查复现的超长内容 —— 不合格备注 1225 字、填写项 2400 字、整改描述 1800 字、
 * textarea 60 行短句（< 520 字）、14 条长规定。每段末尾一个【ENDn】标记：
 * test:browser 检查每页内容不溢出、每个标记都在页面可见区域里（没被裁掉）。
 */
function longReport(template, report) {
  const marks = [];
  const end = () => {
    const m = `【END${marks.length + 1}】`;
    marks.push(m);
    return m;
  };
  const long = (n) => '现场检查发现柜门铰链松动需要重新调整并复检确认安装位置正确。'.repeat(Math.ceil(n / 30)).slice(0, n) + end();
  for (const s of template.sections) {
    if (s.hidden) continue;
    if (s.type === 'fields') {
      for (const f of s.fields) {
        if (f.hidden) continue;
        if (f.type === 'textarea') report.values[f.key] = `${Array.from({ length: 60 }, (_, i) => `${i + 1}. 好`).join('\n')}\n${end()}`;
        if (f.type === 'list') {
          report.values[f.key] = Array.from({ length: 14 }, (_, i) => `第 ${i + 1} 条：${'走廊、电梯、单位地面先铺保护垫再搬运；垃圾当天清走；'.repeat(8)}`);
          report.values[f.key][13] += end();
        }
      }
    }
    if (s.type === 'checklist') {
      const it = s.items.find((x) => !x.input);
      if (it) {
        const opts = resolveScale(it.scale || s.scale).options;
        const r = (opts.find((o) => o.tone === 'fail') || opts[0]).v;
        report.items[it.id] = { r, note: long(1225), photos: ['m_photo1', 'm_video_np', 'm_zero'] };
      }
      const inp = s.items.find((x) => x.input && ['text', 'textarea'].includes(x.input.type));
      if (inp) report.items[inp.id] = { value: long(2400) };
    }
    if (s.type === 'table') {
      const rows = report.tables[s.id] || [];
      const col = s.columns.find((c) => c.type === 'textarea') || s.columns.find((c) => c.type === 'text');
      if (rows[0] && col) rows[0][col.key] = long(1800);
    }
  }
  return marks;
}

// ---- 英文内容夹具（与 test/doc-paginate.test.mjs englishReport 同一套规则） ----
const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/;
const EN_PROJECT = { ...SAMPLE_PROJECT, entryNote: 'Register at the guard house, bring your passport', parking: 'Visitor car park' };
const EN_SETTINGS = { ...SAMPLE_SETTINGS, dept: 'Installation', company: 'Sail by Riccione Reka' };
const EN_LINES = [
  'Checked against the drawings, no issues',
  'Left door gap 3mm too wide, adjusted on site',
  'Punch #12 - factory notified for a replacement panel',
  'Client asked for an additional sensor light',
];
const EN_BLOCK = 'Shoe cabinet and master wardrobe carcasses installed; doors arrive tomorrow.\nSite cleaned, protective film intact.';
// 全角括号 / 标点换成半角（自动带入的「Tuai Timur Residence 17-3（Hailey）」），还有中文字的整句换成英文
const halfWidth = (v) => v.replace(/\s*（/g, ' (').replace(/）/g, ')').replace(/，/g, ', ').replace(/：/g, ': ');
const enStr = (v, i = 0) => {
  if (typeof v !== 'string' || !CJK.test(v)) return v;
  const h = halfWidth(v);
  return CJK.test(h) ? EN_LINES[i % EN_LINES.length] : h;
};
const enVal = (v, type, i = 0) => {
  if (Array.isArray(v)) return v.map((x, k) => enStr(x, i + k));
  if (type === 'textarea' && typeof v === 'string' && CJK.test(v)) return EN_BLOCK;
  return enStr(v, i);
};
// 选项类字段存的是选项 key（显示的是模板里的固定文字），不是用户打的字：不换
const isChoice = (f) => !!f && ['select', 'radio', 'chips'].includes(f.type);

/**
 * 用户填写的内容全换成英文（自动带入的项目资料 / 默认值也算用户数据）。
 * raw = 自动带入项目资料的字段保持 App 生成的原样（英文项目 → 「Tuai Timur Residence 17-3（Hailey）」，带全角括号）
 */
function englishReport(template, report, { raw = false } = {}) {
  let k = 0;
  for (const s of template.sections) {
    if (s.type === 'fields') {
      for (const f of s.fields) {
        if (isChoice(f)) continue;
        if (raw && f.bind?.startsWith('project.')) {
          report.values[f.key] = resolveBind(f.bind, { project: EN_PROJECT, settings: EN_SETTINGS }) ?? report.values[f.key];
          k += 1;
          continue;
        }
        report.values[f.key] = enVal(report.values[f.key], f.type, k++);
      }
    }
    if (s.type === 'checklist') {
      for (const it of s.items) {
        const a = report.items[it.id];
        if (!a) continue;
        a.note = enStr(a.note, k++);
        if (it.input && !isChoice(it.input)) a.value = enVal(a.value, it.input.type, k++);
      }
    }
    if (s.type === 'table') {
      for (const row of report.tables[s.id] || []) for (const c of s.columns) if (!isChoice(c)) row[c.key] = enVal(row[c.key], c.type, k++);
    }
    if (s.type === 'signatures') for (const sg of Object.values(report.signatures || {})) sg.name = enStr(sg.name, k++);
  }
  // report.title 是自动生成的「模板中文名 · 项目 · 日期」（不是用户打的字），原样留着：纯英文文件的页脚自己换成英文
  return report;
}

/** 每个文字字段 / 备注 / 填写 / 单元格都很长（几十页）：预览缩放检查用，正好装满一页的原子多 */
function allLongReport(template, report) {
  let seq = 0;
  const txt = (n) => {
    const tag = `§${seq++}`;
    let s = '';
    for (let k = 0; s.length < n; k += 1) s += `【${tag}_${k}】柜门铰链松动，需要调整，`;
    return `${s}【${tag}_E】`;
  };
  const lines = (n) => {
    const tag = `¶${seq++}`;
    return Array.from({ length: n }, (_, i) => `〔${tag}_${i}〕好`).join('\r\n');
  };
  const P = (n, k = 0) => Array.from({ length: n }, (_, i) => `m_photo${((i + k) % 7) + 1}`);
  for (const s of template.sections) {
    if (s.hidden) continue;
    if (s.type === 'fields') {
      for (const f of s.fields) {
        if (f.hidden) continue;
        if (f.type === 'textarea') report.values[f.key] = `${txt(1500)}\n${lines(40)}`;
        if (f.type === 'text') report.values[f.key] = txt(500);
        if (f.type === 'list') report.values[f.key] = Array.from({ length: 16 }, () => txt(200));
        if (f.type === 'photos') report.values[f.key] = P(9);
      }
    }
    if (s.type === 'checklist') {
      s.items.forEach((it, i) => {
        if (it.input) {
          if (['text', 'textarea'].includes(it.input.type)) report.items[it.id] = { value: txt(1200), photos: P(2, i) };
          return;
        }
        if (i % 2 === 0) report.items[it.id] = { ...(report.items[it.id] || {}), note: i % 4 === 0 ? txt(800) : lines(50), photos: P(i % 3 === 0 ? 5 : 0, i) };
      });
    }
    if (s.type === 'table') {
      (report.tables[s.id] || []).forEach((row) => {
        for (const c of s.columns) if (['text', 'textarea'].includes(c.type)) row[c.key] = txt(c.type === 'textarea' ? 1200 : 400);
        row.photos = P(5, 1);
      });
    }
  }
  return report;
}

/** DocPages 套 transform: scale(s) 排版（s = 1 即 PDF 导出时的样子）→ 每页内容文字、溢出的页 */
async function layoutAt(model, loader, scale) {
  const pool = createUrlPool(loader);
  const host = document.createElement('div');
  host.style.cssText = `position:absolute;left:-10000px;top:0;width:${PAGE_W}px;transform:scale(${scale});transform-origin:0 0`;
  let root = null;
  try {
    const { urls, info } = await pool.load(model);
    document.body.appendChild(host);
    root = createRoot(host);
    await new Promise((resolve) => root.render(<DocPages model={model} urls={urls} info={info} onLayout={resolve} />));
    const bodies = [...host.querySelectorAll('[data-page-body]')];
    return {
      texts: bodies.map((b) => b.textContent),
      over: bodies.map((b, i) => (b.scrollHeight > b.clientHeight ? i + 1 : 0)).filter(Boolean),
    };
  } finally {
    if (root) root.unmount();
    host.remove();
    pool.release();
  }
}

function App({ templates, template, variant, lang, model, loader }) {
  const ids = useMemo(() => templates.map((t) => t.id), [templates]);
  const href = (t, v, l) => `?t=${t}&v=${v}${l === 'both' ? '' : `&lang=${l}`}`;
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '12px 12px 40px' }}>
      <div style={{ fontSize: 12, color: '#8A857C', marginBottom: 8, lineHeight: '18px' }}>
        {ids.map((id) => (
          <a key={id} href={href(id, variant, lang)} style={{ marginRight: 10, color: id === template?.id ? '#B5623A' : '#55524B', fontWeight: id === template?.id ? 700 : 400 }}>
            {id}
          </a>
        ))}
        <span style={{ marginLeft: 6 }}>
          {['full', 'pass', 'empty', 'stress', 'long', 'english', 'enraw', 'enempty'].map((v) => (
            <a key={v} href={href(template?.id || '', v, lang)} style={{ marginRight: 8, color: v === variant ? '#B5623A' : '#8A857C' }}>
              {v}
            </a>
          ))}
        </span>
        <span style={{ marginLeft: 6 }}>
          {['both', 'zh', 'en'].map((l) => (
            <a key={l} href={href(template?.id || '', variant, l)} style={{ marginRight: 8, color: l === lang ? '#B5623A' : '#8A857C' }}>
              {l}
            </a>
          ))}
        </span>
      </div>
      {model ? <DocPreview model={model} media={loader} /> : <div>找不到模板</div>}
    </div>
  );
}

async function main() {
  const q = new URLSearchParams(location.search);
  const variant = q.get('v') || 'full';
  const lang = normLang(q.get('lang'));
  // 英文项目的几种夹具：english = 全部英文（自动带入的全角括号也换半角）；enraw = 同上但自动带入的项目资料保持 App 原样；
  // enempty = 英文项目 + 出厂设置（公司 / 部门是默认的中文）新建、一个字没填（App 自己写进去的默认值原样）
  const english = ['english', 'enraw', 'enempty'].includes(variant);
  const templates = await loadTemplates();
  window.__templateIds = templates.map((t) => t.id);
  const template = templates.find((t) => t.id === q.get('t')) || templates.find((t) => t.id === 'quality-check') || templates[0];
  const media = await sampleMedia({ english });
  const loader = createLoader(media);
  let report = null;
  window.__longMarkers = [];
  if (template) {
    if (variant === 'stress') report = stressReport(template, fillReport(template, 'full'));
    else if (variant === 'long') {
      report = fillReport(template, 'full');
      window.__longMarkers = longReport(template, report);
    } else if (variant === 'english' || variant === 'enraw') report = englishReport(template, fillReport(template, 'full'), { raw: variant === 'enraw' });
    else if (variant === 'enempty') report = createReport(template, { project: EN_PROJECT, settings: SAMPLE_SETTINGS, previous: [] });
    else report = fillReport(template, variant);
  }
  const project = english ? EN_PROJECT : SAMPLE_PROJECT;
  const settings = english && variant !== 'enempty' ? EN_SETTINGS : SAMPLE_SETTINGS;
  // 双语不传 lang（= 以前的调用方式，输出必须和以前一样）
  const docModel = (r) => buildDocModel({ template, report: r, project, settings, ...(lang === 'both' ? {} : { lang }) });
  const model = template ? docModel(report) : null;
  window.__model = model;
  window.__lang = lang;
  // 页面上的全部文字（DocPreview 的 A4 页，截图前的 DOM；图片 alt 不算）。逐个文字节点、换行隔开：
  // 相邻两个元素的字不会粘成一个词（方便判断一段字出自模型里的哪个字符串）
  window.__docText = () => {
    const out = [];
    for (const p of document.querySelectorAll('[data-page]')) {
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) if (n.data.trim()) out.push(n.data);
    }
    return out.join('\n');
  };
  // 模型里出现过的全部字符串（模板固定文字 + 用户数据 + 照片说明，含大写形式）：页面上的文字在这里面 = 不是渲染器自己加的
  const strings = (node, out = []) => {
    if (typeof node === 'string') out.push(node, node.toUpperCase());
    else if (Array.isArray(node)) node.forEach((x) => strings(x, out));
    else if (node && typeof node === 'object') Object.values(node).forEach((x) => strings(x, out));
    return out;
  };
  // 用户填写的内容（模型里的填写值 / 备注 / 单元格 / 签名人 / 照片说明）；选项类字段显示的是模板固定文字，不算
  const choiceKeys = new Set();
  for (const sec of template?.sections || []) {
    if (sec.type === 'fields') sec.fields.filter(isChoice).forEach((f) => choiceKeys.add(`f:${f.key}`));
    if (sec.type === 'checklist') sec.items.filter((it) => isChoice(it.input)).forEach((it) => choiceKeys.add(`i:${it.id}`));
    if (sec.type === 'table') sec.columns.filter(isChoice).forEach((c) => choiceKeys.add(`c:${sec.id}:${c.key}`));
  }
  const userData = (m) => {
    const out = [];
    for (const b of m?.blocks || []) {
      if (b.type === 'fields') for (const f of b.fields) if (!choiceKeys.has(`f:${f.key}`)) out.push(f.value || '', ...(f.lines || []));
      if (b.type === 'checklist') for (const r of b.rows) out.push(r.remark || '', ...(r.input && !choiceKeys.has(`i:${r.id}`) ? [r.value || '', ...(r.lines || [])] : []));
      if (b.type === 'table') for (const r of b.rows) for (const [k, v] of Object.entries(r.cells)) if (!choiceKeys.has(`c:${b.id}:${k}`)) out.push(v || '');
      if (b.type === 'signatures') for (const r of b.roles) out.push(r.name || '');
    }
    for (const md of media.values()) out.push(md.caption || '');
    return out.filter(Boolean);
  };
  /**
   * 语言检查要的数据（test/browser.mjs）：
   *   text 页面文字；modelStrings 模型里的全部字符串；userCJK 用户填写里的中文（english 夹具应为空）；
   *   enHalves 双语模型里每个双语标签的英文那一半（中文文件里不该出现；中文那一半本身就带的词如「登记 Punch」、
   *   用户填写里出现的词不算）；own 中文文件里「本来就该有」的文字（中文标签 + 用户填写 + 公司 / 报告名 / 项目名）
   */
  window.__langData = () => {
    const zhs = [];
    const ens = [];
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(walk);
      const zh = typeof n.zh === 'string' ? n.zh : '';
      const en = typeof n.en === 'string' ? n.en.trim() : '';
      if (zh) zhs.push(zh);
      if (zh && en && /[a-z]/.test(en) && en.length >= 3) ens.push(en);
      Object.values(n).forEach(walk);
    };
    if (template) walk(buildDocModel({ template, report, project, settings }));
    const own = [...zhs, ...userData(model), model?.meta?.company || '', model?.meta?.dept || '', model?.meta?.reportTitle || ''];
    const ownText = own.join('\n');
    return {
      text: window.__docText(),
      modelStrings: strings([model, [...media.values()].map((m) => m.caption || '')]),
      userCJK: userData(model).filter((x) => CJK.test(x)),
      enHalves: [...new Set(ens)].filter((en) => !ownText.includes(en)),
      own,
    };
  };
  window.__progress = [];
  window.__exportPdf = async () => {
    const t0 = performance.now();
    const blob = await exportPdf(model, loader, { onProgress: (d, n) => window.__progress.push(`${d}/${n}`) });
    window.__exportMs = Math.round(performance.now() - t0);
    window.__exportClipped = blob.clipped;
    return blobToBase64(blob);
  };
  // 截图失败（模拟 iOS canvas 内存用完：getContext('2d') 返回 null）：
  // 一直失败 → 中文提示、不留 html2canvas 克隆 iframe；只失败一次 → 降分辨率重试成功
  window.__exportFailures = async () => {
    const proto = HTMLCanvasElement.prototype;
    const orig = proto.getContext;
    const leaked = () => document.querySelectorAll('iframe.html2canvas-container').length;
    let calls = 0;
    const patch = (fail) => {
      proto.getContext = function getContext(type, ...rest) {
        if (type === '2d') {
          calls += 1;
          if (fail(calls)) return null;
        }
        return orig.call(this, type, ...rest);
      };
    };
    const out = {};
    try {
      patch(() => false);
      await exportPdf(model, loader);
      const clean = calls; // 正常导出时 2d context 的调用次数（最后一次 = 最后一页的渲染画布）
      for (let k = 0; k < 2; k += 1) {
        calls = 0;
        patch(() => true);
        try {
          await exportPdf(model, loader);
          out.permanent = 'ok';
        } catch (e) {
          out.permanent = e.message;
        }
      }
      out.leakedAfterPermanent = leaked();
      calls = 0;
      patch((n) => n === clean);
      const blob = await exportPdf(model, loader);
      out.transient = blob.size > 0 ? 'ok' : 'empty';
      out.transientRetried = calls === clean + 1;
      out.leakedAfterTransient = leaked();
    } finally {
      proto.getContext = orig;
    }
    return out;
  };
  // 手机预览（transform 缩放）和 PDF（不缩放）分页必须一模一样：当前报告 + 全部超长报告，
  // 几个手机宽度下每页内容都和不缩放时相同 → 返回不一样的地方（空数组 = 通过）
  window.__scaleCheck = async (widths = [343, 366, 390]) => {
    const models = [['当前报告', model]];
    if (template) models.push(['全部超长', docModel(allLongReport(template, fillReport(template, 'full')))]);
    const diffs = [];
    for (const [name, m] of models) {
      const base = await layoutAt(m, loader, 1);
      if (base.over.length) diffs.push(`${name}：第 ${base.over.join('、')} 页溢出`);
      for (const w of widths) {
        const s = await layoutAt(m, loader, w / PAGE_W);
        const p = s.texts.length === base.texts.length ? s.texts.findIndex((t, i) => t !== base.texts[i]) : -2;
        if (p === -2) diffs.push(`${name} @${w}px：${s.texts.length} 页 ≠ PDF ${base.texts.length} 页`);
        else if (p >= 0) diffs.push(`${name} @${w}px：第 ${p + 1} 页内容和 PDF 不一样`);
      }
    }
    return diffs;
  };
  window.__exportImages = async () => {
    const blobs = await renderPagesToImages(model, loader);
    return Promise.all(blobs.map(blobToBase64));
  };
  createRoot(document.getElementById('app')).render(
    <App templates={templates} template={template} variant={variant} lang={lang} model={model} loader={loader} />,
  );
}

main().catch((e) => {
  console.error(e);
  document.body.textContent = `harness error: ${e?.stack || e}`;
});
