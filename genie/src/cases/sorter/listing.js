// 把员工选的 / 拖进来的文件夹列出来：只要名字、路径、大小、修改时间（不读文件内容）→ 9 000 张也是一眨眼。
//   · <input type=file webkitdirectory>：浏览器给一个 FileList，每个文件有 webkitRelativePath（「顶层/上海/…/a.jpg」）
//   · 拖进来：DataTransfer → webkitGetAsEntry() → 一层一层读（readEntries 一次最多 100 个，要一直读到空）
//   · iPad：多选照片（没有路径）→ 当成一个「平」的文件夹

/** FileList / File[] → [{ path, name, size, mtime, file }] */
export function fromFiles(list) {
  const out = [];
  for (const f of Array.from(list || [])) out.push({ path: f.webkitRelativePath || f.name, name: f.name, size: f.size, mtime: f.lastModified, file: f });
  return out;
}

function readAll(reader) {
  return new Promise((res, rej) => {
    const all = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) res(all);
        else {
          all.push(...batch);
          next();
        }
      }, rej);
    next();
  });
}
const fileOf = (entry) => new Promise((res, rej) => entry.file(res, rej));

/**
 * 拖进来的东西 → 同样的列表。拖了好几个文件夹 → 前面加一层虚拟的顶层（「_drop」），每个文件夹各算各的。
 * onCount(n)：读到多少个了（界面上跳数字）
 */
export async function fromDrop(dataTransfer, { onCount } = {}) {
  const items = Array.from(dataTransfer?.items || []);
  const roots = items.map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
  if (!roots.length) return fromFiles(dataTransfer?.files);
  const prefix = roots.length > 1 ? '_drop' : '';
  const files = [];
  const stack = [...roots];
  const pendingFiles = [];
  while (stack.length) {
    const e = stack.pop();
    if (e.isDirectory) stack.push(...(await readAll(e.createReader())));
    else if (e.isFile) pendingFiles.push(e);
  }
  // 一批一批拿 File（每一个都是异步的；一次 64 个）
  for (let i = 0; i < pendingFiles.length; i += 64) {
    const batch = pendingFiles.slice(i, i + 64);
    const got = await Promise.all(batch.map((e) => fileOf(e).then((f) => ({ e, f }), () => null)));
    for (const x of got) {
      if (!x) continue;
      const path = (prefix ? prefix : '') + (x.e.fullPath || '/' + x.f.name);
      files.push({ path: path.replace(/^\/+/, ''), name: x.f.name, size: x.f.size, mtime: x.f.lastModified, file: x.f });
    }
    onCount?.(files.length);
  }
  return files;
}

/** 这个浏览器能不能选整个文件夹（iPad / 手机不行 → 只能多选照片） */
export function canPickFolder() {
  if (typeof document === 'undefined') return false;
  const i = document.createElement('input');
  return 'webkitdirectory' in i && !/iPad|iPhone|Android/i.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}

/** 文件夹的指纹（存「做到哪儿了」用）：顶层名字 + 文件数 —— 不存名字本身 */
export function rootOf(entries) {
  const first = entries[0]?.path || '';
  const top = first.includes('/') ? first.split('/')[0] : '';
  return top;
}
