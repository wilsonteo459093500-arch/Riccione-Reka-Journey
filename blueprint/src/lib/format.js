// 显示与文件名小工具（纯函数，Node 可测）

/** 字节数 → '12.3 MB' */
export function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let x = v / 1024;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  return `${x >= 100 || i === 0 ? Math.round(x) : x.toFixed(1)} ${units[i]}`;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** 时间戳 → 'YYYY-MM-DD' */
export function formatDay(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 相对时间：刚刚 / 5 分钟前 / 3 小时前 / 昨天 / 4 天前 / 2026-08-06 */
export function timeAgo(ts, now = Date.now()) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return '刚刚';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d === 1) return '昨天';
  if (d < 7) return `${d} 天前`;
  return formatDay(ts);
}

/** 项目日期 → 文件名用的紧凑写法：'2026 · 08' → '2026.08'，'2026.8.6' → '2026.08.06' */
export function compactDate(date) {
  const nums = String(date || '').match(/\d+/g);
  if (!nums) return '';
  return nums
    .slice(0, 3)
    .map((n, i) => (i === 0 ? n : pad2(Number(n))))
    .join('.');
}

/** 文件名清洗：去掉 Windows / macOS 不允许的字符，压缩空白，限制长度 */
export function sanitizeFileName(name, fallback = 'Dreamhouse Blueprint') {
  const out = String(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 150)
    .trim();
  return out || fallback;
}

const clean = (s) => String(s || '').trim();

/** 导出 PPT 的文件名：'2026.08 Muar - Mr Lau - Dreamhouse Blueprint.pptx'（缺客户信息时退回项目名） */
export function pptxFileName(project) {
  const info = project?.info || {};
  const head = [compactDate(info.date), clean(info.location)].filter(Boolean).join(' ');
  const who = [head, clean(info.client)].filter(Boolean);
  const hasWho = !!(clean(info.location) || clean(info.client));
  const base = hasWho ? who.join(' - ') : clean(project?.name);
  return `${sanitizeFileName(base ? `${base} - Dreamhouse Blueprint` : 'Dreamhouse Blueprint')}.pptx`;
}

/** 项目备份文件名：'Muar · Mr Lau.blueprint.zip' */
export function bundleFileName(project) {
  const info = project?.info || {};
  const base = clean(project?.name) || [clean(info.location), clean(info.client)].filter(Boolean).join(' · ') || 'Dreamhouse Blueprint';
  return `${sanitizeFileName(base)}.blueprint.zip`;
}
