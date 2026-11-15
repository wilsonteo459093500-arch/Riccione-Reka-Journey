// 登录门 —— 凭据不落明文：代码里只存 SHA-256(用户名大写:密码) 的哈希，
// 登录成功后在本机 localStorage 记一个通行票（同样是哈希，不含密码）。

const AUTH_KEY = 'blueprint.auth.v1'; // 账号 2026-11 重设过：和旧版 UKIR STUDIO（render/）不再是同一组，所有设备要用新账号登录一次
const AUTH_HASH = '6f910b33d131f1d6ba5eb446af4fa027cfd38116c1c9b0e0b5d2a3016b3c8bc8';

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const LEGACY_AUTH_KEY = 'sailrender.auth.v1'; // 旧版 UKIR STUDIO 的通行票：哈希和现在的一样才沿用（账号重设后旧票对不上，要重新登录）

export function isAuthed() {
  try {
    if (localStorage.getItem(AUTH_KEY) === AUTH_HASH) return true;
    if (localStorage.getItem(LEGACY_AUTH_KEY) === AUTH_HASH) {
      localStorage.setItem(AUTH_KEY, AUTH_HASH);
      return true;
    }
    return false;
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
  localStorage.removeItem(LEGACY_AUTH_KEY);
}
