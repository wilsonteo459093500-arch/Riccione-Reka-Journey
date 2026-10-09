// 极简 hash 路由：手机返回键 / 浏览器后退都能用
import { useCallback, useEffect, useState } from 'react';

const read = () => (window.location.hash.replace(/^#/, '') || '/').split('?')[0];

export function useRoute() {
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => setPath(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}

export function navigate(to, { replace = false } = {}) {
  const hash = `#${to}`;
  // 弹层打开时会压一条占位历史记录：从弹层里跳页面时替换掉它，避免多一次「返回」
  if (replace || window.history.state?.sheet) window.location.replace(hash);
  else window.location.hash = hash;
  // 新页面从顶部开始（返回 / 前进保留浏览器恢复的位置）
  window.scrollTo(0, 0);
}

/** 返回上一页；如果是直接打开的深链接（没有历史），就回到 fallback */
export function goBack(fallback = '/') {
  if (window.history.length > 1 && window.__siteNavCount > 0) window.history.back();
  else navigate(fallback, { replace: true });
}

// 记录站内导航次数，用于判断 back 是否安全
if (typeof window !== 'undefined') {
  window.__siteNavCount = 0;
  window.addEventListener('hashchange', () => {
    window.__siteNavCount += 1;
  });
}

/** '/r/:id/export' 这类模式匹配 */
export function match(pattern, path) {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function useNavigate() {
  return useCallback((to, opts) => navigate(to, opts), []);
}
