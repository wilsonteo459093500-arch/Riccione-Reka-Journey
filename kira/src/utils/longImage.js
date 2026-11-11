// 报价单 → 一张长图（PNG）。手机：系统分享（可直接选 WhatsApp）；电脑：下载。
// html-to-image 只在点按钮时才载入（不进首屏包）。
const CAPTURE_WIDTH = 820; // 固定宽度截图：手机上截出来也和电脑一样排版

const blank = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

export async function renderLongImage(node) {
  const { toPng } = await import('html-to-image');
  // 报价单是 flex 子项：只设 width 会被 flex 缩回手机屏宽（366 px、小图变成点）→ 一起锁 flexShrink / minWidth
  const keys = ['width', 'maxWidth', 'minWidth', 'flexShrink'];
  const prev = Object.fromEntries(keys.map((k) => [k, node.style[k]]));
  node.style.width = `${CAPTURE_WIDTH}px`;
  node.style.minWidth = `${CAPTURE_WIDTH}px`;
  node.style.maxWidth = 'none';
  node.style.flexShrink = '0';
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    return await toPng(node, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      width: node.scrollWidth,
      height: node.scrollHeight,
      style: { margin: '0', boxShadow: 'none', borderRadius: '0' },
      imagePlaceholder: blank, // 产品照片跨域读不到时用空白占位，不让整张图失败
      // 截图固定 820 宽 = 宽版排版 → 手机窄版的那一份（kq-n，隐藏着）不用复制，长图快一倍多
      filter: (el) => !(el.classList && (el.classList.contains('no-print') || el.classList.contains('kq-n'))),
    });
  } finally {
    keys.forEach((k) => { node.style[k] = prev[k]; });
  }
}

async function dataUrlToFile(dataUrl, name) {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: 'image/png' });
}

export async function exportLongImage(node, baseName) {
  const dataUrl = await renderLongImage(node);
  // Chromium 会丢掉含中文的下载文件名 → 下载用的文件名只留英文数字（分享时照样带原名）
  const ascii = String(baseName || 'quotation').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').replace(/_ | _/g, '_').trim() || 'quotation';
  const fileName = `${ascii}.png`;
  const file = await dataUrlToFile(dataUrl, fileName);
  const isTouch = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: baseName }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return 'downloaded';
}
