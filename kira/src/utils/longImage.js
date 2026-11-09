// 报价单 → 一张长图（PNG）。手机：系统分享（可直接选 WhatsApp）；电脑：下载。
// html-to-image 只在点按钮时才载入（不进首屏包）。
const CAPTURE_WIDTH = 820; // 固定宽度截图：手机上截出来也和电脑一样排版

const blank = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

export async function renderLongImage(node) {
  const { toPng } = await import('html-to-image');
  const prev = { width: node.style.width, maxWidth: node.style.maxWidth };
  node.style.width = `${CAPTURE_WIDTH}px`;
  node.style.maxWidth = 'none';
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    return await toPng(node, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      width: node.scrollWidth,
      height: node.scrollHeight,
      style: { margin: '0', boxShadow: 'none', borderRadius: '0' },
      imagePlaceholder: blank, // 产品照片跨域读不到时用空白占位，不让整张图失败
      filter: (el) => !(el.classList && el.classList.contains('no-print')),
    });
  } finally {
    node.style.width = prev.width;
    node.style.maxWidth = prev.maxWidth;
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
