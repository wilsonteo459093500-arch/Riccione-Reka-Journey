// UKIR STUDIO 应用外壳：登录门 → 首页（项目列表 / 导入 PDF）↔ 编辑器（#/p/<项目 id>，刷新可回到原项目）
// ↔ 独立 Material Board（#/boards）。启动时把旧版 UKIR STUDIO 的材质库 / 画板搬过来（同一网址时）。

import React, { useCallback, useEffect, useRef, useState } from 'react';
import LoginGate from './components/LoginGate.jsx';
import Home from './components/Home.jsx';
import Editor from './components/Editor.jsx';
import BoardsPage from './components/BoardsPage.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import Toaster, { useToasts } from './components/Toaster.jsx';
import { isAuthed, logout } from './store/auth.js';
import { requestPersistence } from './store/db.js';
import { loadSettings, saveSettings, SETTINGS_KEY } from './ai/settings.js';
import { migrateOnce } from './moodboard/migrate.js';
import { hasUnsavedEdits } from './lib/useProjectState.js';

/** '#/p/<id>' → id */
function parseHash() {
  const m = /^#\/p\/([^/?#]+)/.exec(window.location.hash || '');
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

const isBoardsHash = () => /^#\/boards\b/.test(window.location.hash || '');

let persistenceAsked = false;
let migrationStarted = false;

export default function App() {
  const [authed, setAuthed] = useState(isAuthed);
  if (!authed) return <LoginGate onSuccess={() => setAuthed(true)} />;
  return (
    <Workspace
      onLogout={() => {
        logout();
        setAuthed(false);
      }}
    />
  );
}

function Workspace({ onLogout }) {
  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [projectId, setProjectId] = useState(parseHash);
  const [boardsOpen, setBoardsOpen] = useState(isBoardsHash);
  // 当前打开的项目（app 自己切页面时立即更新；浏览器后退只改网址，靠它判断是不是从编辑器离开）
  const current = useRef(projectId);
  const { toasts, notify, dismiss } = useToasts();

  // 申请持久化存储（避免浏览器空间紧张时清掉项目），只问一次
  useEffect(() => {
    if (persistenceAsked) return;
    persistenceAsked = true;
    requestPersistence();
  }, []);

  // 旧版 UKIR STUDIO 的材质库 / 画板（同一网址时读得到）→ 搬到独立 Material Board，只搬一次
  useEffect(() => {
    if (migrationStarted) return;
    migrationStarted = true;
    migrateOnce()
      .then(({ library, boards }) => {
        if (!library && !boards) return;
        const parts = [library ? `${library} 个材质` : '', boards ? `${boards} 块画板` : ''].filter(Boolean).join('、');
        notify({ type: 'ok', text: `已从旧版 UKIR STUDIO 搬来 ${parts} —— 在首页「Material Board」里` });
      })
      .catch(() => {});
  }, [notify]);

  // 浏览器前进 / 后退
  useEffect(() => {
    const onHash = () => {
      const next = parseHash();
      const cur = current.current;
      // 保存失败 / 冲突时还有没写进去的修改：浏览器后退也先问一句（← 按钮在编辑器里自己问）
      if (cur && next !== cur && hasUnsavedEdits() && !window.confirm('最近的修改没能保存（浏览器存储空间可能不足，或项目在别的窗口改过）。现在离开，这些修改会丢失。确定离开？')) {
        window.history.pushState(null, '', `#/p/${encodeURIComponent(cur)}`); // 不触发 hashchange
        return;
      }
      current.current = next;
      setProjectId(next);
      setBoardsOpen(isBoardsHash());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 另一个标签页改了设置 → 同步
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === SETTINGS_KEY) setSettings(loadSettings());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const openProject = useCallback((id) => {
    if (!id) return;
    const hash = `#/p/${encodeURIComponent(id)}`;
    current.current = id;
    if (window.location.hash !== hash) window.location.hash = hash;
    setProjectId(id);
  }, []);

  const goHome = useCallback(() => {
    current.current = null;
    if (parseHash() || isBoardsHash()) window.location.hash = '#/';
    setProjectId(null);
    setBoardsOpen(false);
  }, []);

  const openBoards = useCallback(() => {
    current.current = null;
    if (!isBoardsHash()) window.location.hash = '#/boards';
    setProjectId(null);
    setBoardsOpen(true);
  }, []);

  const openSettings = useCallback(() => setShowSettings(true), []);

  function handleSaveSettings(next) {
    setSettings(next);
    saveSettings(next);
    setShowSettings(false);
    notify({ type: 'ok', text: next.apiKey ? '设置已保存' : '设置已保存（没填 AI key，AI 功能先不可用）' });
  }

  return (
    <>
      {projectId ? (
        <Editor
          key={projectId}
          projectId={projectId}
          settings={settings}
          notify={notify}
          onOpenSettings={openSettings}
          onExit={goHome}
        />
      ) : boardsOpen ? (
        <BoardsPage settings={settings} notify={notify} onOpenSettings={openSettings} onBack={goHome} onOpenProject={openProject} />
      ) : (
        <Home notify={notify} onOpenProject={openProject} onOpenBoards={openBoards} onOpenSettings={openSettings} hasKey={!!settings.apiKey} />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
          onLogout={() => {
            setShowSettings(false);
            onLogout();
          }}
        />
      )}

      <Toaster toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
