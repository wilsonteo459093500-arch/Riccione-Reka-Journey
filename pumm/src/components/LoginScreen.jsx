import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { APP_NAME, APP_TAGLINE, ROLES } from '../constants.js';
import { Button, inputCls } from './Shared.jsx';

// 软性登录 —— 目的是分清角色与责任，不是银行级安全。
// 真安全在 supabase/schema.sql 末尾的「加固」一节。
export default function LoginScreen({ members, onLogin }) {
  const [selected, setSelected] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const candidates = members.filter(m => m.status === 'active');

  const attempt = () => {
    const m = candidates.find(x => x.id === selected);
    if (!m) { setError('先选一下你是谁。'); return; }
    if (m.pin && pin !== m.pin) { setError('PIN 不对。'); return; }
    onLogin({ memberId: m.id, name: m.name, role: m.role });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 felt-bg">
      <div className="w-full max-w-sm">
        <div className="text-center mb-7">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pumm-brand to-pumm-brand-deep flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="font-display text-pumm-gold text-2xl font-semibold">P</span>
          </div>
          <h1 className="font-display text-xl text-pumm-ink font-semibold tracking-wide">{APP_NAME}</h1>
          <p className="text-sm text-pumm-brass mt-1 font-medium">{APP_TAGLINE}</p>
        </div>

        <div className="bg-white border border-pumm-line rounded-xl p-5 shadow-sm">
          <label className="text-[10px] uppercase tracking-wider text-pumm-muted font-semibold">你是哪一位？</label>
          <div className="grid grid-cols-1 gap-1.5 mt-2 mb-4 max-h-72 overflow-y-auto scrollbar-thin">
            {candidates.map(m => {
              const rm = ROLES[m.role] || ROLES.member;
              const active = selected === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setSelected(m.id); setError(''); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    active ? 'border-pumm-brand bg-pumm-brand/5' : 'border-pumm-line hover:border-pumm-faint'
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                    style={{ background: rm.color }}
                  >
                    {m.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-pumm-ink truncate">{m.name}</div>
                    <div className="text-[11px] text-pumm-muted truncate">{rm.label}{m.company ? ` · ${m.company}` : ''}</div>
                  </div>
                  {active && <CheckCircle2 className="w-4 h-4 text-pumm-brand flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          <label className="text-[10px] uppercase tracking-wider text-pumm-muted font-semibold">PIN</label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && attempt()}
            placeholder="输入你的 PIN"
            className={`mt-1 ${inputCls}`}
          />
          {error && <p className="text-xs text-pumm-danger mt-2">{error}</p>}

          <Button tone="primary" size="lg" className="mt-4 w-full" onClick={attempt}>进桌</Button>
        </div>

        <p className="text-[10px] text-pumm-faint text-center mt-4 leading-relaxed">
          登录是为了分清谁能看什么 —— 会员看不到别人的案例，理事会只看数字。<br />
          刚开桌？开局账号预设 PIN 是 1234，进去后请在「我的」页立刻改掉。
        </p>
      </div>
    </div>
  );
}
