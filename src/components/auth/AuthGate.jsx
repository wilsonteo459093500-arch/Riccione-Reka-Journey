import { useEffect, useState } from 'react';
import { LogIn } from 'lucide-react';
import { T } from '../../theme.js';
import { supabase } from '../../services/supabase.js';
import { LabeledInput } from '../ui/Inputs.jsx';

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signIn = async (e) => {
    e?.preventDefault();
    if (!email.trim() || !password) {
      setError('请输入邮箱和密码');
      return;
    }
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message || '登录失败');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 font-body" style={{ background: T.paper, color: T.ink }}>
      <form onSubmit={signIn} className="w-full max-w-sm fade-up">
        <div className="text-center mb-8">
          <div className="flex items-baseline justify-center gap-2 mb-2">
            <span className="font-display text-4xl" style={{ color: T.ink }}>溪岸</span>
            <span className="font-display italic text-2xl" style={{ color: T.wood }}>SAIL</span>
          </div>
          <div className="text-xs tracking-[0.3em] uppercase" style={{ color: T.inkSoft }}>Delivery OS · 团队登录</div>
        </div>

        <div className="space-y-3 p-6" style={{ background: T.cream, borderRadius: '2px' }}>
          <LabeledInput label="邮箱 Email" type="email" value={email} onChange={setEmail} placeholder="you@studio.com" />
          <div>
            <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>密码 Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 text-sm outline-none"
              style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
            />
          </div>

          {error && <div className="text-xs" style={{ color: T.terra }}>{error}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 text-sm flex items-center justify-center gap-2 mt-2"
            style={{ background: busy ? T.line : T.ink, color: T.paper, borderRadius: '2px' }}
          >
            <LogIn size={14} strokeWidth={1.5} />
            {busy ? '登录中…' : '登录'}
          </button>
        </div>

        <div className="text-[11px] mt-4 text-center leading-relaxed" style={{ color: T.inkSoft, opacity: 0.8 }}>
          账号由管理员在 Supabase 后台创建。
          <br />
          忘记密码请联系管理员重置。
        </div>
      </form>
    </div>
  );
}

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still checking

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center font-body" style={{ background: T.paper, color: T.inkSoft }}>
        <div className="font-display text-2xl">载入中…</div>
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return children({ user: session.user, signOut: () => supabase.auth.signOut() });
}
