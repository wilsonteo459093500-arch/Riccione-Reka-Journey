import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { ROLES } from '../constants.js';

// Soft accountability login — not real security. Manager configures via Users tab.
export default function LoginScreen({ users, onLogin }) {
  const [selected, setSelected] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const attempt = () => {
    const user = users.find(u => u.username === selected);
    if (!user) { setError('Please select your name'); return; }
    if (user.pin && pin !== user.pin) { setError('Incorrect PIN'); return; }
    onLogin(user);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 grid-bg">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sail-green to-sail-green-deep flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="font-display text-white text-3xl font-semibold">溪</span>
          </div>
          <h1 className="font-display text-2xl text-sail-ink font-semibold">Sail CRM</h1>
          <p className="text-sm text-sail-muted mt-1">by Riccione Reka</p>
        </div>

        <div className="bg-white border border-sail-line rounded-xl p-6 shadow-sm">
          <label className="text-xs uppercase tracking-wider text-sail-muted font-medium">Who are you?</label>
          <div className="grid grid-cols-1 gap-1.5 mt-2 mb-4">
            {users.map(u => {
              const rm = ROLES[u.role] || {};
              const active = selected === u.username;
              return (
                <button
                  key={u.username}
                  type="button"
                  onClick={() => { setSelected(u.username); setError(''); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    active ? 'border-sail-green bg-sail-green/5' : 'border-sail-line hover:border-sail-faint'
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                    style={{ background: rm.color || '#9A8F7E' }}
                  >
                    {u.username[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-sail-ink">{u.username}</div>
                    <div className="text-[11px] text-sail-muted">{rm.label || u.role}</div>
                  </div>
                  {active && <CheckCircle2 className="w-4 h-4 text-sail-green ml-auto" />}
                </button>
              );
            })}
          </div>

          <label className="text-xs uppercase tracking-wider text-sail-muted font-medium">PIN</label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && attempt()}
            placeholder="Default 1234"
            className="mt-1 w-full bg-sail-tint border border-sail-line rounded-lg px-3 py-2.5 text-sm text-sail-ink placeholder:text-sail-faint focus:outline-none focus:border-sail-green focus:bg-white"
          />
          {error && <p className="text-xs text-sail-danger mt-2">{error}</p>}

          <button
            type="button"
            onClick={attempt}
            className="mt-4 w-full bg-sail-green hover:bg-sail-green-deep text-white text-sm font-semibold rounded-lg py-2.5 transition-colors"
          >
            Sign in
          </button>
        </div>
        <p className="text-[10px] text-sail-faint text-center mt-4 leading-relaxed">
          Workflow login for team accountability & audit trails — not bank-grade security.<br />
          The manager can manage users & PINs under the Users tab.
        </p>
      </div>
    </div>
  );
}
