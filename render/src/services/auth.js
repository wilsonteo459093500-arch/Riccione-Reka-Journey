// 登录门 —— 凭据不落明文：代码里只存 SHA-256(用户名大写:密码) 的哈希，
// 登录成功后在本机 localStorage 记一个通行票（同样是哈希，不含密码）。

const AUTH_KEY = 'sailrender.auth.v1';
const AUTH_HASH = '351a011641198a2ab04b35e22c5cf55fb1d81cd4cce829d5f3795b4565025ad2';

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isAuthed() {
  try {
    return localStorage.getItem(AUTH_KEY) === AUTH_HASH;
  } catch {
    return false;
  }
}

/** 校验用户名（不分大小写）+ 密码；成功则记住本机 */
export async function login(username, password) {
  const hash = await sha256Hex(`${(username || '').trim().toUpperCase()}:${password || ''}`);
  if (hash === AUTH_HASH) {
    localStorage.setItem(AUTH_KEY, hash);
    return true;
  }
  return false;
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
}
