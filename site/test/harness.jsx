// 文档测试台（浏览器）：/test/harness.html?t=<templateId>&v=full|empty|pass
// 自动填一份报告 + 真实照片，渲染 DocPreview，并暴露 window.__exportPdf()。
import { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { fillReport, SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fill.js';
import { buildDocModel } from '../src/lib/docmodel.js';
import DocPreview from '../src/components/doc/DocPreview.jsx';
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
  return media;
}

/** 与 lib/db.js createMediaLoader 同接口 */
function createLoader(media) {
  const urls = [];
  return {
    async get(id) {
      return media.get(id) || null;
    },
    async url(id, which = 'blob') {
      const m = media.get(id);
      const b = m && (which === 'thumb' ? m.thumb || m.blob : m.blob || m.thumb);
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
          {['full', 'pass', 'empty', 'stress'].map((v) => (
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
  const report = template ? (variant === 'stress' ? stressReport(template, fillReport(template, 'full')) : fillReport(template, variant)) : null;
  const model = template ? buildDocModel({ template, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS }) : null;
  window.__model = model;
  window.__progress = [];
  window.__exportPdf = async () => {
    const t0 = performance.now();
    const blob = await exportPdf(model, loader, { onProgress: (d, n) => window.__progress.push(`${d}/${n}`) });
    window.__exportMs = Math.round(performance.now() - t0);
    return blobToBase64(blob);
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
