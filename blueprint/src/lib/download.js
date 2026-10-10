// 触发浏览器下载（Blob → 本机文件）

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 大文件写盘较慢，晚点再回收
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
