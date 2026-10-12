// TORA by Riccione Reka · 现场报告 —— 路由 + 底部导航
import Icon from './components/ui/Icon.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
import Home from './components/Home.jsx';
import Editor from './components/Editor.jsx';
import ExportScreen from './components/ExportScreen.jsx';
import { ProjectList, ProjectEdit } from './components/Projects.jsx';
import Settings from './components/Settings.jsx';
import CrewLink from './components/CrewLink.jsx';
import { InAppBanner } from './components/fields/CameraHelp.jsx';
import { Fragment, useEffect } from 'react';
import { UIProvider, Spinner, useUI } from './components/ui/UI.jsx';
import { StoreProvider, useStore } from './lib/store.jsx';
import { useRoute, match, navigate } from './lib/router.js';
import { takeInterrupted } from './lib/pickerGuard.js';
import { t, tb, getUiLang } from './lib/i18n.js';
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
    const video = info.kind === 'video';
    const what = video ? '视频' : '照片';
    const act = video ? '录像' : info.kind === 'library' ? '选照片' : '拍照';
    const whatEn = video ? 'video' : 'photo';
    const actEn = video ? 'recording' : info.kind === 'library' ? 'picking photos' : 'taking the photo';
    // iPhone 的主屏幕 App / Chrome 和 Safari 资料分开，不建议换地方；安卓 Chrome 与主屏幕 App 共用资料
    const android = /android/i.test(navigator.userAgent);
    const zh =
      `${act}时手机运行内存不够，浏览器被系统暂时关掉了，所以这次的${what}没传回来。报告已自动保存，填过的内容都在。\n\n` +
      '这样做就不会再丢：\n' +
      '• 先用手机相机拍好，再点「相册」一次选多张（最稳）\n' +
      '• 拍照前把后台其他 App 关掉' +
      (android ? '\n• 用 Chrome 打开并加到主屏幕使用，不要在 WhatsApp 里直接打开' : '');
    const en =
      `The phone ran low on memory while ${actEn}, so the system briefly closed the browser and this ${whatEn} didn't come back. The report was saved automatically — everything you filled in is still there.\n\n` +
      'To avoid losing it again:\n' +
      '• Take the photos with the phone camera first, then tap "Gallery" and pick several at once (most reliable)\n' +
      '• Close other apps running in the background before taking photos' +
      (android ? '\n• Open in Chrome and add it to the home screen — don\'t open it inside WhatsApp' : '');
    confirm({
      title: t(`刚才的${what}没收到`, `The ${whatEn} didn't come through`),
      message: tb(zh, en, '\n\n'),
      okText: t('知道了', 'Got it'),
      alert: true,
    });
  }, [confirm]);
  return null;
}

const TABS = [
  { path: '/', zh: '报告', en: 'Reports', icon: 'ClipboardList' },
  { path: '/projects', zh: '项目', en: 'Projects', icon: 'Building2' },
  { path: '/settings', zh: '设置', en: 'Settings', icon: 'Settings' },
];

// 底部导航文字：中英时上下两行（中文 + 小号英文），不挤
function tab(x) {
  if (getUiLang() !== 'both') return t(x.zh, x.en);
  return (
    <span className="flex flex-col items-center leading-tight">
      <span>{x.zh}</span>
      <span className="text-[9px] font-medium opacity-80">{x.en}</span>
    </span>
  );
}

function TabBar({ path }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur pb-[var(--safe-bottom)]">
      <div className="mx-auto flex max-w-lg">
        {TABS.map((x) => {
          const on = x.path === '/' ? path === '/' : path.startsWith(x.path);
          return (
            <button
              key={x.path}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${on ? 'text-terra' : 'text-ink-mute'}`}
              onClick={() => navigate(x.path, { replace: true })}
            >
              <Icon name={x.icon} size={22} strokeWidth={on ? 2.4 : 2} />
              {tab(x)}
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
        <div className="text-[17px] font-bold text-ink">{t('无法打开本机存储', "Can't open this phone's storage")}</div>
        <div className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-soft">
          {String(error.message || error)}
          <br />
          {tb('如果是无痕 / 隐私模式，请换成普通模式打开。', 'If you are in incognito / private mode, please open it in a normal window.')}
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
  if ((m = match('/crew/:payload', path))) return <CrewLink key={m.payload} payload={m.payload} />;
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

// 换界面语言时整页重新挂载，所有文字按新语言重画（语言开关只放在首页 / 项目 / 设置这些列表页，不会打断正在填的报告）
function LangScreens() {
  const { settings } = useStore();
  return (
    <Fragment key={settings.uiLang || 'zh'}>
      <InAppBanner />
      <Screens />
    </Fragment>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <UIProvider>
        <ErrorBoundary>
          <LangScreens />
          <InterruptNotice />
        </ErrorBoundary>
      </UIProvider>
    </StoreProvider>
  );
}
