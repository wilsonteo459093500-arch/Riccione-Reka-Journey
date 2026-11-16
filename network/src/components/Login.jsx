import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { Button, Field, Input } from './ui.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(error.message === 'Invalid login credentials' ? '邮箱或密码不对' : error.message);
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <Logo className="mx-auto h-14 w-14" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">人脉簿</h1>
          <p className="mt-1 text-sm text-muted">只有你看得到的人脉资料库</p>
        </div>
        <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
          <Field label="邮箱">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="密码">
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {err && <p className="text-sm text-danger">{err}</p>}
          <Button type="submit" className="w-full" busy={busy}><Lock className="h-4 w-4" />登入</Button>
        </div>
        <p className="text-center text-xs text-faint">帐号在 Supabase 后台建立（见 DEPLOY.md），这里不开放注册。</p>
      </form>
    </div>
  );
}

export function Logo({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#1C1917" />
      <path d="M32 9 L46 25 L32 55 L18 25 Z" fill="#22A55B" />
      <path d="M32 9 L46 25 L32 28 Z" fill="#fff" opacity=".35" />
      <circle cx="16" cy="44" r="4" fill="#F7F5F0" opacity=".9" />
      <circle cx="48" cy="44" r="4" fill="#F7F5F0" opacity=".9" />
      <path d="M19 43 L29 36 M45 43 L35 36" stroke="#F7F5F0" strokeWidth="2" opacity=".6" />
    </svg>
  );
}
