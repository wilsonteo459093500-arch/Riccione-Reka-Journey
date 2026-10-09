// 元素规格 → 可编辑 .pptx（OOXML）。浏览器与 Node 通用（只依赖 JSZip）。
// 每个文字都是真正的文本框、每张图都是可替换的图片、每条线都是形状 —— 导出后在 PowerPoint / WPS / Keynote 里随便改。

import JSZip from 'jszip';
import { EMU_PER_PX, FONTS, SLIDE_W, SLIDE_H } from '../../theme.js';
import { placeImage } from '../spec.js';
import {
  SLIDE_MASTER, SLIDE_MASTER_RELS, SLIDE_LAYOUT, SLIDE_LAYOUT_RELS, THEME, DEFAULT_TEXT_STYLE,
  PRES_PROPS, VIEW_PROPS, TABLE_STYLES,
} from './baseParts.js';

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const emu = (px) => Math.round(px * EMU_PER_PX);
const pct = (v) => Math.round(v * 100000); // 0–1 → OOXML 1/1000 %

/** XML 转义 + 去掉 XML 1.0 不允许的控制字符；落单的 UTF-16 代理项（坏掉的 PDF 文字）换成 �，否则浏览器里会写出非法 UTF-8 */
export function esc(s) {
  return String(s ?? '')
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (m) => (m.length === 2 ? m : '\uFFFD'))
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const hex = (c) => String(c || '000000').replace('#', '').toUpperCase().slice(0, 6).padEnd(6, '0');

function srgb(color, alpha = 1) {
  const a = alpha < 1 ? `<a:alpha val="${Math.max(0, Math.round(alpha * 100000))}"/>` : '';
  return `<a:srgbClr val="${hex(color)}">${a}</a:srgbClr>`;
}

const xfrm = (x, y, w, h) =>
  `<a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${Math.max(1, emu(w))}" cy="${Math.max(1, emu(h))}"/></a:xfrm>`;

// ---------------------------------------------------------------------------
// 元素 → XML
// ---------------------------------------------------------------------------

function rectXml(el, id) {
  let fill = '<a:noFill/>';
  if (el.grad) {
    const stops = el.grad.stops
      .map((s) => `<a:gs pos="${Math.round((s.pos ?? 0) * 1000)}">${srgb(s.color, s.alpha ?? 1)}</a:gs>`)
      .join('');
    fill = `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst><a:lin ang="${Math.round((el.grad.angle ?? 90) * 60000) % 21600000}" scaled="0"/></a:gradFill>`;
  } else if (el.fill) {
    fill = `<a:solidFill>${srgb(el.fill, el.alpha ?? 1)}</a:solidFill>`;
  }
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(el.name || `Shape ${id}`)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(el.x, el.y, el.w, el.h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}<a:ln><a:noFill/></a:ln></p:spPr></p:sp>`
  );
}

function runProps(r, tag = 'a:rPr') {
  const font = FONTS[r.font] || FONTS.sans;
  const sz = Math.round((r.size || 18) * 100);
  const spc = r.spacing ? ` spc="${Math.round(r.spacing * 100)}"` : '';
  const b = r.bold ? ' b="1"' : '';
  const face = esc(font.pptx);
  return (
    `<${tag} lang="zh-CN" altLang="en-US" sz="${sz}"${b}${spc} kern="0" dirty="0">` +
    `<a:solidFill>${srgb(r.color || '241C12', r.alpha ?? 1)}</a:solidFill>` +
    `<a:latin typeface="${face}" pitchFamily="34" charset="0"/><a:ea typeface="${face}" pitchFamily="34" charset="-122"/>` +
    `<a:cs typeface="${face}" pitchFamily="34" charset="-120"/></${tag}>`
  );
}

function paraXml(p) {
  const algn = p.align === 'ctr' || p.align === 'r' || p.align === 'just' ? p.align : 'l';
  const ln = p.lineSpacing ? `<a:lnSpc><a:spcPct val="${Math.round(p.lineSpacing * 1000)}"/></a:lnSpc>` : '';
  const runs = (p.runs || []).filter((r) => r.text !== undefined);
  let body = '';
  for (const r of runs) {
    const parts = String(r.text ?? '').split('\n');
    parts.forEach((piece, i) => {
      if (i > 0) body += `<a:br>${runProps(r)}</a:br>`;
      if (piece !== '') body += `<a:r>${runProps(r)}<a:t>${esc(piece)}</a:t></a:r>`;
    });
  }
  const last = runs[runs.length - 1] || { size: 18 };
  return `<a:p><a:pPr algn="${algn}" indent="0" marL="0">${ln}<a:buNone/></a:pPr>${body}${runProps(last, 'a:endParaRPr')}</a:p>`;
}

function textXml(el, id) {
  const anchor = el.valign === 'ctr' || el.valign === 'b' ? el.valign : 't';
  const paras = (el.paras && el.paras.length ? el.paras : [{ runs: [{ text: '' }] }]).map(paraXml).join('');
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(el.name || `Text ${id}`)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(el.x, el.y, el.w, el.h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="${el.nowrap ? 'none' : 'square'}" lIns="25400" tIns="25400" rIns="25400" bIns="25400" rtlCol="0" anchor="${anchor}">` +
    `${el.autofit === 'shrink' ? '<a:normAutofit/>' : '<a:noAutofit/>'}</a:bodyPr>` +
    `<a:lstStyle/>${paras}</p:txBody></p:sp>`
  );
}

function picXml(el, id, rId) {
  const pl = placeImage(el);
  const c = pl.crop;
  const src = ['l', 't', 'r', 'b'].some((k) => Math.abs(c[k]) > 1e-6)
    ? `<a:srcRect l="${pct(c.l)}" t="${pct(c.t)}" r="${pct(c.r)}" b="${pct(c.b)}"/>`
    : '';
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(el.name || `Picture ${id}`)}" descr="${esc(el.alt || '')}"/>` +
    `<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${rId}"/>${src}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${xfrm(pl.x, pl.y, pl.w, pl.h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

// ---------------------------------------------------------------------------
// 包结构
// ---------------------------------------------------------------------------

const EXT_BY_MIME = { 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/png': 'png', 'image/gif': 'gif' };

function contentTypes(nSlides) {
  const slides = Array.from({ length: nSlides }, (_, i) =>
    `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('');
  return (
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Default Extension="gif" ContentType="image/gif"/>' +
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>' +
    '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>' +
    '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    slides +
    '</Types>'
  );
}

function presentationXml(nSlides) {
  const ids = Array.from({ length: nSlides }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('');
  return (
    XML_HEAD +
    `<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1" autoCompressPictures="0">` +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    `<p:sldIdLst>${ids}</p:sldIdLst>` +
    `<p:sldSz cx="${emu(SLIDE_W)}" cy="${emu(SLIDE_H)}"/><p:notesSz cx="6858000" cy="9144000"/>` +
    `${DEFAULT_TEXT_STYLE}</p:presentation>`
  );
}

function presentationRels(nSlides) {
  let rels = `<Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>`;
  for (let i = 0; i < nSlides; i++) rels += `<Relationship Id="rId${i + 2}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`;
  const n = nSlides + 2;
  rels +=
    `<Relationship Id="rId${n}" Type="${REL}/presProps" Target="presProps.xml"/>` +
    `<Relationship Id="rId${n + 1}" Type="${REL}/viewProps" Target="viewProps.xml"/>` +
    `<Relationship Id="rId${n + 2}" Type="${REL}/theme" Target="theme/theme1.xml"/>` +
    `<Relationship Id="rId${n + 3}" Type="${REL}/tableStyles" Target="tableStyles.xml"/>`;
  return `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

const ROOT_RELS =
  `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/>` +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  `<Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`;

function coreXml(title, author, isoDate) {
  return (
    XML_HEAD +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
    'xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${esc(title)}</dc:title><dc:creator>${esc(author)}</dc:creator><cp:lastModifiedBy>${esc(author)}</cp:lastModifiedBy><cp:revision>1</cp:revision>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${isoDate}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${isoDate}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}

function appXml(nSlides) {
  return (
    XML_HEAD +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    `<TotalTime>0</TotalTime><Application>Microsoft Office PowerPoint</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>${nSlides}</Slides><Notes>0</Notes><HiddenSlides>0</HiddenSlides>` +
    '<ScaleCrop>false</ScaleCrop><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion></Properties>'
  );
}

function slideXml(slide, elXml, title) {
  return (
    XML_HEAD +
    `<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld name="${esc(title)}">` +
    `<p:bg><p:bgPr><a:solidFill>${srgb(slide.bg || 'F5F0E6')}</a:solidFill><a:effectLst/></p:bgPr></p:bg>` +
    '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    `${elXml}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  );
}

/**
 * @param {Array<{bg:string, els:object[], label?:string}>} slides  renderDeck 输出（已过滤启用页）
 * @param {object} opts
 * @param {(src:string)=>Promise<{data:Uint8Array|ArrayBuffer|Blob, mime:string}|null>} opts.loadImage
 *        取图：返回 JPEG/PNG 字节；返回 null 则跳过该图（并记 warning）
 * @param {'blob'|'uint8array'|'nodebuffer'} [opts.type='blob']
 * @param {string} [opts.title]  @param {string} [opts.author]
 * @param {(done:number,total:number)=>void} [opts.onProgress]
 * @returns {Promise<{ file: Blob|Uint8Array, warnings: string[] }>}
 */
export async function buildPptx(slides, { loadImage, type = 'blob', title = 'Dreamhouse Blueprint', author = 'Riccione Reka', onProgress, now = new Date() } = {}) {
  const zip = new JSZip();
  const warnings = [];
  const media = new Map(); // src → { path, ext } | null
  let mediaNo = 0;

  async function mediaFor(src) {
    if (media.has(src)) return media.get(src);
    let entry = null;
    try {
      const res = await loadImage(src);
      if (res && res.data) {
        const ext = EXT_BY_MIME[String(res.mime || '').toLowerCase()];
        if (!ext) throw new Error(`不支持的图片格式 ${res.mime}`);
        mediaNo += 1;
        entry = { path: `ppt/media/image${mediaNo}.${ext}`, target: `../media/image${mediaNo}.${ext}` };
        zip.file(entry.path, res.data, { binary: true, compression: 'STORE' });
      } else {
        warnings.push(`图片缺失：${src}`);
      }
    } catch (e) {
      warnings.push(`图片读取失败：${src}（${e.message}）`);
    }
    media.set(src, entry);
    return entry;
  }

  const total = slides.length;
  // [Content_Types].xml 放在压缩包第一位（部分阅读器要求）
  zip.file('[Content_Types].xml', contentTypes(total));
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('docProps/core.xml', coreXml(title, author, now.toISOString().replace(/\.\d+Z$/, 'Z')));
  zip.file('docProps/app.xml', appXml(total));
  zip.file('ppt/presentation.xml', presentationXml(total));
  zip.file('ppt/_rels/presentation.xml.rels', presentationRels(total));
  zip.file('ppt/slideMasters/slideMaster1.xml', `${XML_HEAD}${SLIDE_MASTER.replace(/^<\?xml[^>]*>/, '')}`);
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `${XML_HEAD}${SLIDE_MASTER_RELS.replace(/^<\?xml[^>]*>/, '')}`);
  zip.file('ppt/slideLayouts/slideLayout1.xml', `${XML_HEAD}${SLIDE_LAYOUT.replace(/^<\?xml[^>]*>/, '')}`);
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `${XML_HEAD}${SLIDE_LAYOUT_RELS.replace(/^<\?xml[^>]*>/, '')}`);
  zip.file('ppt/theme/theme1.xml', `${XML_HEAD}${THEME.replace(/^<\?xml[^>]*>/, '')}`);
  zip.file('ppt/presProps.xml', `${XML_HEAD}${PRES_PROPS.replace(/^<\?xml[^>]*>/, '')}`);
  zip.file('ppt/viewProps.xml', `${XML_HEAD}${VIEW_PROPS.replace(/^<\?xml[^>]*>/, '')}`);
  zip.file('ppt/tableStyles.xml', `${XML_HEAD}${TABLE_STYLES.replace(/^<\?xml[^>]*>/, '')}`);

  for (let i = 0; i < total; i++) {
    const s = slides[i];
    const rels = [`<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`];
    const relBySrc = new Map();
    let id = 2;
    let body = '';
    for (const el of s.els || []) {
      if (el.t === 'rect') body += rectXml(el, id++);
      else if (el.t === 'text') body += textXml(el, id++);
      else if (el.t === 'img' && el.src) {
        const m = await mediaFor(el.src);
        if (!m) continue;
        let rId = relBySrc.get(el.src);
        if (!rId) {
          rId = `rId${rels.length + 1}`;
          relBySrc.set(el.src, rId);
          rels.push(`<Relationship Id="${rId}" Type="${REL}/image" Target="${m.target}"/>`);
        }
        body += picXml(el, id++, rId);
      }
    }
    zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(s, body, s.label || `Slide ${i + 1}`));
    zip.file(
      `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`
    );
    onProgress?.(i + 1, total);
  }

  const file = await zip.generateAsync({
    type,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  return { file, warnings };
}
