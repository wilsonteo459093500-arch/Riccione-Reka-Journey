// 很小的网址路由：/、/solo/codebreaker、/new/codebreaker、/j/ABCD、/r/名字
import { useEffect, useState } from 'react';

const listeners = new Set();

export function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  listeners.forEach((cb) => cb());
  window.scrollTo(0, 0);
}

export function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    listeners.add(on);
    window.addEventListener('popstate', on);
    return () => {
      listeners.delete(on);
      window.removeEventListener('popstate', on);
    };
  }, []);
  return path;
}

export function match(path, pattern) {
  const p = path.replace(/\/+$/, '') || '/';
  const parts = pattern.split('/');
  const segs = p.split('/');
  if (parts.length !== segs.length) return null;
  const out = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) out[parts[i].slice(1)] = decodeURIComponent(segs[i]);
    else if (parts[i] !== segs[i]) return null;
  }
  return out;
}

/** 给别人用的完整网址（开发测试的 ?net=local 也带上） */
export function absoluteUrl(path) {
  let q = '';
  try {
    if (sessionStorage.getItem('play.net') === 'local') q = '?net=local';
  } catch {
    /* ignore */
  }
  return `${location.origin}${path}${q}`;
}
