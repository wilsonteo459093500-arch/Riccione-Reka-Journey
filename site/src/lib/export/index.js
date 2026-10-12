// 导出统一入口：按需加载 PDF / Word / Excel 引擎（首屏不背这几 MB 的库）
import { buildDocModel } from '../docmodel.js';

export const FORMATS = {
  pdf: { ext: 'pdf', zh: 'PDF', en: 'PDF', icon: 'FileDown', mime: 'application/pdf' },
  docx: {
    ext: 'docx',
    zh: 'Word',
    en: 'Word',
    icon: 'FileText',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  xlsx: {
    ext: 'xlsx',
    zh: 'Excel',
    en: 'Excel',
    icon: 'FileSpreadsheet',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
};

const ENGINE_MSG = '导出组件还没下载到手机上：请连上网络再点一次「生成」（之后离线也能用）';
const load = (fn) =>
  fn().catch((e) => {
    if (/dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk/i.test(String(e?.message || e))) {
      throw new Error(ENGINE_MSG);
    }
    throw e;
  });

let logoPromise = null;
function loadLogo() {
  if (!logoPromise) {
    logoPromise = fetch('/sail-logo.png')
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
  }
  return logoPromise;
}

/**
 * @param {'pdf'|'docx'|'xlsx'} format
 * @returns {Promise<{ blob: Blob, filename: string, file: File }>}
 */
export async function exportReport(format, { template, report, project, settings, media, onProgress }) {
  const model = buildDocModel({ template, report, project, settings });
  const f = FORMATS[format];
  let blob;
  if (format === 'pdf') {
    const { exportPdf } = await load(() => import('./pdf.js'));
    blob = await exportPdf(model, media, { onProgress });
  } else if (format === 'docx') {
    const [{ exportDocx }, logo] = await Promise.all([load(() => import('./docx.js')), loadLogo()]);
    blob = await exportDocx(model, media, { logo });
  } else if (format === 'xlsx') {
    const [{ exportXlsx }, logo] = await Promise.all([load(() => import('./xlsx.js')), loadLogo()]);
    blob = await exportXlsx(model, media, { logo });
  } else {
    throw new Error(`未知格式：${format}`);
  }
  const filename = `${model.meta.filename}.${f.ext}`;
  const file = new File([blob], filename, { type: f.mime });
  return { blob, filename, file };
}
