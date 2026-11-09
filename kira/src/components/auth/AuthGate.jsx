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
            <span className="font-display text-4xl tracking-[0.15em]" style={{ color: T.ink }}>KIRA</span>
            <span className="font-display italic text-xl" style={{ color: T.wood }}>by Riccione Reka</span>
          </div>
          <div className="text-xs tracking-[0.3em] uppercase" style={{ color: T.inkSoft }}>柜子规划报价 · 团队登录</div>
          <div className="text-[11px] mt-2" style={{ color: T.inkSoft }}>和旧报价工具同一个账号 Same account as the old quote tool</div>
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

// 本机存着的登录（supabase-js 存在 localStorage 的 sb-<ref>-auth-token）。离线时只拿来认人，不拿来上云。
function storedUser() {
  try {
    const key = supabase.auth.storageKey;
    const s = JSON.parse(localStorage.getItem(key) || 'null');
    const u = s?.user || JSON.parse(localStorage.getItem(`${key}-user`) || 'null')?.user;
    return s?.refresh_token && u?.id ? u : null;
  } catch (e) { return null; }
}
const OFFLINE_AFTER_MS = 2500; // 有本机登录记录时最多等这么久，就先用本机资料打开（离线 / token 过期正在刷新）

// 状态：checking（载入中）· online（登录有效，可上云）· offline（有本机登录记录，但现在确认不了 →
// 照样打开、用本机资料报价，改动排队等有网再上云）· out（确定没登录 → 登录页）
export default function AuthGate({ children }) {
  const [auth, setAuth] = useState(() => {
    const u = storedUser();
    if (u && typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline', user: u };
    return { status: 'checking', user: null };
  });

  useEffect(() => {
    let alive = true;
    // 有 session → online；没有：本机还留着登录记录（离线 / 刷新失败可重试）→ offline；
    // 只有 SIGNED_OUT 或本机根本没有登录记录才回登录页
    const apply = (session, { signedOut = false } = {}) => {
      if (!alive) return;
      if (session?.user) { setAuth((a) => (a.status === 'online' && a.user?.id === session.user.id ? a : { status: 'online', user: session.user })); return; }
      const u = signedOut ? null : storedUser();
      setAuth((a) => (u ? (a.status === 'offline' && a.user?.id === u.id ? a : { status: 'offline', user: u }) : { status: 'out', user: null }));
    };
    const check = () => supabase.auth.getSession().then(({ data }) => apply(data?.session), () => apply(null));
    check();
    const t = setTimeout(() => {
      const u = storedUser();
      if (alive && u) setAuth((a) => (a.status === 'checking' ? { status: 'offline', user: u } : a));
    }, OFFLINE_AFTER_MS);
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') apply(null, { signedOut: true });
      else apply(s);
    });
    // 有网 / 回到前台 / 每 30 秒（离线模式时）→ 再确认一次登录（过期的 token 在这里刷新）
    const recheck = () => { if (navigator.onLine !== false) check(); };
    const onVis = () => { if (document.visibilityState === 'visible') recheck(); };
    const onStorage = (e) => { if (e.key === supabase.auth.storageKey && !e.newValue) apply(null, { signedOut: true }); };
    const iv = setInterval(() => { setAuth((a) => { if (a.status === 'offline') recheck(); return a; }); }, 30000);
    window.addEventListener('online', recheck);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('storage', onStorage);
    return () => {
      alive = false;
      clearTimeout(t);
      clearInterval(iv);
      window.removeEventListener('online', recheck);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('storage', onStorage);
      sub.subscription.unsubscribe();
    };
  }, []);

  // 退出这台设备（scope local：离线也能退；不会把同一账号在别的设备上也踢下线）
  const signOut = async () => {
    try {
      await Promise.race([supabase.auth.signOut({ scope: 'local' }), new Promise((r) => setTimeout(r, 4000))]);
    } catch (e) { /* ignore */ }
    try { localStorage.removeItem(supabase.auth.storageKey); localStorage.removeItem(`${supabase.auth.storageKey}-user`); } catch (e) { /* ignore */ }
    setAuth({ status: 'out', user: null });
  };

  if (auth.status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center font-body" style={{ background: T.paper, color: T.inkSoft }}>
        <div className="font-display text-2xl">Loading 载入中…</div>
      </div>
    );
  }

  if (auth.status === 'out' || !auth.user) return <LoginScreen />;

  return children({ user: auth.user, signOut, cloudReady: auth.status === 'online' });
}
