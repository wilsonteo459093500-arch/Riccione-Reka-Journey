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
          <h1 className="mt-4 text-3xl font-semibold tracking-[0.2em]">SPACE</h1>
          <p className="mt-1 text-sm italic text-muted">Give Every Tie Its Space</p>
          <MeaningRow className="mt-4" />
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

/** SPACE 的五个阶段：寻 → 识 → 助 → 连 → 长（找到人 → 看懂人 → 先帮人 → 连起来 → 一起成长） */
export const SPACE_WORDS = [
  { letter: 'S', word: 'Seek', zh: '寻' },
  { letter: 'P', word: 'Profile', zh: '识' },
  { letter: 'A', word: 'Assist', zh: '助' },
  { letter: 'C', word: 'Connect', zh: '连' },
  { letter: 'E', word: 'Evolve', zh: '长' },
];

export function MeaningRow({ className = '' }) {
  return (
    <div className={`grid grid-cols-5 gap-1 ${className}`}>
      {SPACE_WORDS.map((w) => (
        <div key={w.letter} className="text-center">
          <div className="text-lg font-semibold text-plum-deep">{w.letter}</div>
          <div className="text-[11px] font-medium text-ink">{w.word}</div>
          <div className="text-[11px] text-faint">{w.zh}</div>
        </div>
      ))}
    </div>
  );
}

/** 图示：中间一颗星（你），周围的点是人脉，连线 = 关系，椭圆 = 轨道（每个人在你的 SPACE 里都有一个位置） */
export function Logo({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="SPACE">
      <rect width="64" height="64" rx="16" fill="#1C1917" />
      <ellipse cx="32" cy="33" rx="25" ry="11" transform="rotate(-18 32 33)" fill="none" stroke="#F7F5F0" strokeWidth="1.2" opacity=".28" />
      <g stroke="#F7F5F0" strokeWidth="1.3" opacity=".55">
        <path d="M32 32 L10 42" /><path d="M32 32 L54 22" /><path d="M32 32 L47 46" /><path d="M32 32 L18 19" />
      </g>
      <g fill="#F7F5F0">
        <circle cx="10" cy="42" r="3.2" /><circle cx="54" cy="22" r="3.2" /><circle cx="47" cy="46" r="2.6" /><circle cx="18" cy="19" r="2.4" />
      </g>
      <path d="M32 15 L36.2 27.8 L49 32 L36.2 36.2 L32 49 L27.8 36.2 L15 32 L27.8 27.8 Z" fill="#22A55B" />
      <path d="M32 15 L36.2 27.8 L32 32 Z M49 32 L36.2 27.8 L32 32 Z" fill="#fff" opacity=".32" />
    </svg>
  );
}
