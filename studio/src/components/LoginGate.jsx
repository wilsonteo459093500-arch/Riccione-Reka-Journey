import React, { useState } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { login } from '../services/auth.js';
import Wordmark from './Wordmark.jsx';

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
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-sail-card border border-sail-line rounded-2xl p-8 shadow-sm">
        <div className="mb-7">
          <Wordmark size="lg" />
          <p className="text-xs text-sail-muted mt-5">内部工具 · 与「UKIR STUDIO」同一套账号密码</p>
        </div>

        <label className="block mb-3">
          <span className="text-xs font-semibold text-sail-faint">用户名</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            className="mt-1 w-full rounded-xl border border-sail-line px-3 py-2.5 text-sm focus:outline-none focus:border-sail-green"
          />
        </label>

        <label className="block mb-4">
          <span className="text-xs font-semibold text-sail-faint">密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full rounded-xl border border-sail-line px-3 py-2.5 text-sm focus:outline-none focus:border-sail-green"
          />
        </label>

        {error && <div className="mb-4 text-sm text-sail-danger bg-sail-danger/10 rounded-xl px-3 py-2">{error}</div>}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-sail-green-deep text-white font-semibold hover:bg-sail-green disabled:opacity-60"
        >
          {busy ? <Loader2 size={17} className="animate-spin" /> : <LogIn size={17} />}
          进入工作台
        </button>

        <div className="text-[11px] text-sail-faint text-center mt-4">登录状态只记在这台设备上</div>
      </form>
    </div>
  );
}
