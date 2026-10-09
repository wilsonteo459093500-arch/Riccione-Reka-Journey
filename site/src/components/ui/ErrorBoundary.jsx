// 出错兜底：某块（如预览）加载失败时只影响那一块，不让整个 App 白屏
import { Component } from 'react';

const isChunkError = (e) => /dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk/i.test(String(e?.message || e));

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, key: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  retry = () => this.setState((s) => ({ error: null, key: s.key + 1 }));

  render() {
    const { error, key } = this.state;
    if (!error) return <div key={key} style={{ display: 'contents' }}>{this.props.children}</div>;
    const offline = isChunkError(error);
    if (this.props.fallback) return this.props.fallback({ error, offline, retry: this.retry });
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-[17px] font-bold text-ink">{offline ? '需要联网加载一次' : '页面出错了'}</div>
        <div className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          {offline ? '这一部分还没下载到手机上（或 App 刚更新）。连上网络后点「重新加载」。' : String(error.message || error)}
          <br />
          你的报告都保存在手机里，不会丢。
        </div>
        <div className="mt-5 flex justify-center gap-2">
          <button className="btn-ghost" onClick={this.retry}>
            重试
          </button>
          <button className="btn-primary" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </div>
      </div>
    );
  }
}
