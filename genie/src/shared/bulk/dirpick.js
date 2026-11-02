// 选整个文件夹（Chrome / Edge 的 showDirectoryPicker）→ 和 src/cases/sorter/listing.js 一样的列表：
//   [{ path, name, size, mtime, file }]（只读名字、大小、日期 —— 不读内容，几百个文件也是一眨眼）
// 浏览器没有 showDirectoryPicker（Safari / Firefox）→ 调用的人退回 <input webkitdirectory>（listing.js fromFiles）。
// path 只在这一页里用（排序、显示子文件夹）；永远不存、不导出（Windows 的路径里有用户名）。
// 板材导入先用；案例整理以后也可以用（见 boards/coord.md）。

/** 这个浏览器有没有「选文件夹」的新接口（不在 iframe 里、也不是 iPad） */
export function canDirPicker() {
  if (typeof window === 'undefined' || typeof window.showDirectoryPicker !== 'function') return false;
  try {
    if (window.self !== window.top) return false;
  } catch {
    return false;
  }
  return !/iPad|iPhone|Android/i.test(navigator.userAgent);
}

/** 一层一层读（子文件夹也读）；onCount(n) 跳数字。员工按了「取消」→ null */
export async function pickDirectory({ id = 'wish-folder', onCount } = {}) {
  let root;
  try {
    root = await window.showDirectoryPicker({ id, mode: 'read' });
  } catch (e) {
    if (e?.name === 'AbortError') return null;
    throw e;
  }
  return { name: root.name, entries: await fromDirectoryHandle(root, { onCount }) };
}

/** FileSystemDirectoryHandle → 列表（最多 depth 层；隐藏文件、系统文件跳过） */
export async function fromDirectoryHandle(dir, { onCount, depth = 4 } = {}) {
  const out = [];
  const walk = async (h, prefix, d) => {
    for await (const entry of h.values()) {
      if (entry.name.startsWith('.') || /^(thumbs\.db|desktop\.ini)$/i.test(entry.name)) continue;
      if (entry.kind === 'directory') {
        if (d < depth) await walk(entry, `${prefix}${entry.name}/`, d + 1);
      } else {
        try {
          const f = await entry.getFile();
          out.push({ path: `${prefix}${f.name}`, name: f.name, size: f.size, mtime: f.lastModified, file: f });
          if (out.length % 32 === 0) onCount?.(out.length);
        } catch {
          /* 读不了的文件（被别的程序锁着）跳过 */
        }
      }
    }
  };
  await walk(dir, `${dir.name}/`, 0);
  onCount?.(out.length);
  return out;
}
