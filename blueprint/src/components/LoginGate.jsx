// 登录门 —— 沿用 UKIR STUDIO 的流程与账号（凭据只存哈希，登录状态只记在这台设备）

import React, { useState } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { login } from '../store/auth.js';

export default function LoginGate({ onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (await login(username, password)) {
        onSuccess();
      } else {
        setError('用户名或密码不对，再试一次');
      }
    } catch {
      setError('登录出错了，刷新页面再试一次');
    } finally {
      setBusy(false);
    }
  }

  const field =
    'mt-1 w-full rounded-xl border border-bp-line bg-white px-3 py-2.5 text-sm text-bp-ink focus:outline-none focus:border-bp-gold focus:ring-2 focus:ring-bp-gold/20';

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 bg-bp-paper">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-bp-card border border-bp-line rounded-2xl p-8 shadow-sm">
        <div className="text-center mb-7">
          <div className="w-10 h-[3px] bg-bp-gold mx-auto mb-5" />
          <div className="font-display text-[32px] leading-tight font-semibold text-bp-ink tracking-wide">UKIR STUDIO</div>
          <div className="text-[11px] text-bp-faint mt-2 tracking-[0.3em] uppercase">by Riccione Reka</div>
          <div className="text-xs text-bp-muted mt-4">方案 PDF → 品牌提案 PPT · Material Board</div>
        </div>

        <label className="block mb-3">
          <span className="text-xs font-semibold text-bp-faint">用户名</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            className={field}
          />
        </label>

        <label className="block mb-4">
          <span className="text-xs font-semibold text-bp-faint">密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className={field}
          />
        </label>

        {error && <div className="mb-4 text-sm text-bp-danger bg-bp-danger/10 rounded-xl px-3 py-2">{error}</div>}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-bp-dark text-bp-light font-semibold hover:opacity-90 disabled:opacity-60"
        >
          {busy ? <Loader2 size={17} className="animate-spin" /> : <LogIn size={17} />}
          进入工作台
        </button>

        <div className="text-[11px] text-bp-faint text-center mt-4">与 UKIR STUDIO 同一组账号 · 登录状态只记在这台设备上</div>
      </form>
    </div>
  );
}
