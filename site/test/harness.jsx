// 文档测试台（浏览器）：/test/harness.html?t=<templateId>&v=full|empty|pass|stress|long
// 自动填一份报告 + 真实照片，渲染 DocPreview，并暴露 window.__exportPdf()。
import { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { fillReport, SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fill.js';
import { buildDocModel } from '../src/lib/docmodel.js';
import { resolveScale } from '../src/templates/schema.js';
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

/** 与 test/fixtures.mjs sampleMedia() 相同的媒体库 */
async function sampleMedia() {
  const media = new Map();
  for (let i = 1; i <= 7; i += 1) {
    const blob = await fetchBlob(`/test/assets/photo${i}.jpg`);
    const { w, h } = await imageSize(blob);
    media.set(`m_photo${i}`, { id: `m_photo${i}`, kind: 'photo', blob, thumb: blob, w, h, caption: i % 3 === 0 ? `现场照片 ${i}` : '' });
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

function App({ templates, template, variant, model, loader }) {
  const ids = useMemo(() => templates.map((t) => t.id), [templates]);
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '12px 12px 40px' }}>
      <div style={{ fontSize: 12, color: '#8A857C', marginBottom: 8, lineHeight: '18px' }}>
        {ids.map((id) => (
          <a key={id} href={`?t=${id}&v=${variant}`} style={{ marginRight: 10, color: id === template?.id ? '#B5623A' : '#55524B', fontWeight: id === template?.id ? 700 : 400 }}>
            {id}
          </a>
        ))}
        <span style={{ marginLeft: 6 }}>
          {['full', 'pass', 'empty', 'stress', 'long'].map((v) => (
            <a key={v} href={`?t=${template?.id || ''}&v=${v}`} style={{ marginRight: 8, color: v === variant ? '#B5623A' : '#8A857C' }}>
              {v}
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
  const templates = await loadTemplates();
  window.__templateIds = templates.map((t) => t.id);
  const template = templates.find((t) => t.id === q.get('t')) || templates.find((t) => t.id === 'quality-check') || templates[0];
  const media = await sampleMedia();
  const loader = createLoader(media);
  let report = null;
  window.__longMarkers = [];
  if (template) {
    if (variant === 'stress') report = stressReport(template, fillReport(template, 'full'));
    else if (variant === 'long') {
      report = fillReport(template, 'full');
      window.__longMarkers = longReport(template, report);
    } else report = fillReport(template, variant);
  }
  const model = template ? buildDocModel({ template, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS }) : null;
  window.__model = model;
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
    if (template) models.push(['全部超长', buildDocModel({ template, report: allLongReport(template, fillReport(template, 'full')), project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS })]);
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
    <App templates={templates} template={template} variant={variant} model={model} loader={loader} />,
  );
}

main().catch((e) => {
  console.error(e);
  document.body.textContent = `harness error: ${e?.stack || e}`;
});
