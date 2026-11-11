import { Component } from 'react';
import { T } from '../../theme.js';

// 出错兜底：某个画面出错时不让整个 app 变白屏。资料都在本机（和云端），重新载入就好。
//   <ErrorBoundary>…</ErrorBoundary>                 整页：提示 + 重新载入
//   <ErrorBoundary inline onReset={…}>…</ErrorBoundary> 只包一块（例如一份报价）：提示 + 再试一次
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('KIRA error', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const msg = String(this.state.error?.message || this.state.error || '').slice(0, 160);
    const btn = { background: T.ink, color: T.paper, borderRadius: 2 };
    if (this.props.inline) {
      return (
        <div role="alert" className="p-6 text-sm" style={{ background: T.cream, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 2 }}>
          <div className="font-display text-xl mb-1">This quote could not be shown 这份报价打不开</div>
          <div style={{ color: T.inkSoft }}>
            Your other quotes are fine and still saved. Pick another customer, or try again.
            其他报价没受影响、资料仍在；可以选别的客户，或再试一次。
          </div>
          {msg && <div className="text-[11px] mt-2" style={{ color: T.inkSoft, opacity: 0.8 }}>{msg}</div>}
          <button className="mt-4 px-4 py-2" style={btn}
            onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}>
            Try again 再试一次
          </button>
        </div>
      );
    }
    return (
      <div role="alert" className="min-h-screen flex items-center justify-center p-6 font-body text-center" style={{ background: T.paper, color: T.ink }}>
        <div className="max-w-sm">
          <div className="font-display text-3xl tracking-[0.12em] mb-2">KIRA</div>
          <div className="font-display text-xl mb-2">Something went wrong — please reload 出错了，请重新载入</div>
          <div className="text-sm" style={{ color: T.inkSoft }}>
            Your quotes are still safe on this device (and in the cloud once synced).
            报价资料仍安全地存在本机（同步过的也在云端），重新载入即可。
          </div>
          {msg && <div className="text-[11px] mt-3" style={{ color: T.inkSoft, opacity: 0.8 }}>{msg}</div>}
          <button className="mt-5 px-5 py-2.5 text-sm" style={btn} onClick={() => window.location.reload()}>
            Reload 重新载入
          </button>
        </div>
      </div>
    );
  }
}
