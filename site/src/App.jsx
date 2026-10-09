// TORA by Riccione Reka · 现场报告 —— 路由 + 底部导航
import Icon from './components/ui/Icon.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
import Home from './components/Home.jsx';
import Editor from './components/Editor.jsx';
import ExportScreen from './components/ExportScreen.jsx';
import { ProjectList, ProjectEdit } from './components/Projects.jsx';
import Settings from './components/Settings.jsx';
import { useEffect } from 'react';
import { UIProvider, Spinner, useUI } from './components/ui/UI.jsx';
import { StoreProvider, useStore } from './lib/store.jsx';
import { useRoute, match, navigate } from './lib/router.js';
import { takeInterrupted } from './lib/pickerGuard.js';
import './lib/install.js';

// 拍照时被系统关掉、整页重新加载：在任何页面渲染前取出记录，编辑页打开后滚回原来的检查项
let interrupted = takeInterrupted();
if (interrupted?.anchor) window.__siteScrollTo = interrupted.anchor;

function InterruptNotice() {
  const { confirm } = useUI();
  useEffect(() => {
    const info = interrupted;
    interrupted = null;
    if (!info) return;
    const what = info.kind === 'video' ? '视频' : '照片';
    const act = info.kind === 'video' ? '录像' : info.kind === 'library' ? '选照片' : '拍照';
    confirm({
      title: `刚才的${what}没收到`,
      message:
        `${act}时手机运行内存不够，浏览器被系统暂时关掉了，所以这次的${what}没传回来。报告已自动保存，填过的内容都在。\n\n` +
        '这样做就不会再丢：\n' +
        '• 先用手机相机拍好，再点「相册」一次选多张（最稳）\n' +
        '• 拍照前把后台其他 App 关掉\n' +
        '• 用 Chrome 打开并加到主屏幕使用，不要在 WhatsApp 里直接打开',
      okText: '知道了',
      alert: true,
    });
  }, [confirm]);
  return null;
}

const TABS = [
  { path: '/', label: '报告', icon: 'ClipboardList' },
  { path: '/projects', label: '项目', icon: 'Building2' },
  { path: '/settings', label: '设置', icon: 'Settings' },
];

function TabBar({ path }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur pb-[var(--safe-bottom)]">
      <div className="mx-auto flex max-w-lg">
        {TABS.map((t) => {
          const on = t.path === '/' ? path === '/' : path.startsWith(t.path);
          return (
            <button
              key={t.path}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${on ? 'text-terra' : 'text-ink-mute'}`}
              onClick={() => navigate(t.path, { replace: true })}
            >
              <Icon name={t.icon} size={22} strokeWidth={on ? 2.4 : 2} />
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Screens() {
  const path = useRoute();
  const { ready, error } = useStore();

  if (error) {
    return (
      <div className="mx-auto max-w-md p-6 pt-20 text-center">
        <div className="text-[17px] font-bold text-ink">无法打开本机存储</div>
        <div className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          {String(error.message || error)}
          <br />
          如果是无痕 / 隐私模式，请换成普通模式打开。
        </div>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="flex h-[100dvh] items-center justify-center text-terra">
        <Spinner size={28} />
      </div>
    );
  }

  let m;
  if ((m = match('/r/:id/export', path))) return <ExportScreen reportId={m.id} />;
  if ((m = match('/r/:id', path))) return <Editor key={m.id} reportId={m.id} />;
  if ((m = match('/projects/:id', path))) return <ProjectEdit key={m.id} projectId={m.id} />;

  let page;
  if (path === '/projects') page = <ProjectList />;
  else if (path === '/settings') page = <Settings />;
  else page = <Home />;
  return (
    <>
      {page}
      <TabBar path={path} />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <UIProvider>
        <ErrorBoundary>
          <Screens />
          <InterruptNotice />
        </ErrorBoundary>
      </UIProvider>
    </StoreProvider>
  );
}
