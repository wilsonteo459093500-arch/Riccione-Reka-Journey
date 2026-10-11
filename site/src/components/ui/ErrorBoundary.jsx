// 出错兜底：某块（如预览）加载失败时只影响那一块，不让整个 App 白屏
import { Component } from 'react';
import { t, tb } from '../../lib/i18n.js';

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
        <div className="text-[17px] font-bold text-ink">{offline ? t('需要联网加载一次', 'Needs internet once') : t('页面出错了', 'Something went wrong')}</div>
        <div className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-soft">
          {offline
            ? tb('这一部分还没下载到手机上（或 App 刚更新）。连上网络后点「重新加载」。', 'This part has not been downloaded to the phone yet (or the app was just updated). Connect to the internet, then tap "Reload".')
            : String(error.message || error)}
          <br />
          {tb('你的报告都保存在手机里，不会丢。', 'Your reports are saved on this phone and will not be lost.')}
        </div>
        <div className="mt-5 flex justify-center gap-2">
          <button className="btn-ghost" onClick={this.retry}>
            {t('重试', 'Retry')}
          </button>
          <button className="btn-primary" onClick={() => window.location.reload()}>
            {t('重新加载', 'Reload')}
          </button>
        </div>
      </div>
    );
  }
}
