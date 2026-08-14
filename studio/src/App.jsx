import React, { useEffect, useState } from 'react';
import Header from './components/Header.jsx';
import LoginGate from './components/LoginGate.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import ProjectsPanel from './components/ProjectsPanel.jsx';
import IdeateView from './components/IdeateView.jsx';
import EditView from './components/EditView.jsx';
import PostView from './components/PostView.jsx';
import TrendView from './components/TrendView.jsx';
import { isAuthed, logout } from './services/auth.js';
import { loadSettings, saveSettings } from './services/gemini.js';
import { listProjects, saveProject, deleteProject } from './services/store.js';
import { uid } from './services/media.js';

export default function App() {
  const [authed, setAuthed] = useState(isAuthed);
  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [projects, setProjects] = useState([]);
  const [notice, setNotice] = useState(null);

  const [view, setView] = useState('ideate');
  const [platformId, setPlatformId] = useState('xhs');

  // 三个阶段的产物 —— 在 view 之间共享
  const [projectId, setProjectId] = useState(() => uid());
  const [recipe, setRecipe] = useState(null);
  const [assets, setAssets] = useState([]);
  const [plan, setPlan] = useState(null);
  const [seedBrief, setSeedBrief] = useState(''); // 从「趋势」带过来的选题

  useEffect(() => {
    listProjects().then(setProjects);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.type === 'error' ? 7000 : 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // 离开页面前提醒：素材和方案都在内存里
  useEffect(() => {
    const handler = (e) => {
      if (!recipe && !plan) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [recipe, plan]);

  function handleSaveSettings(next) {
    setSettings(next);
    saveSettings(next);
    setShowSettings(false);
    setNotice({ type: 'ok', text: '设置已保存' });
  }

  async function handleSaveProject() {
    const name = recipe?.title || plan?.summary?.slice(0, 24) || `未命名 ${new Date().toLocaleDateString('zh-CN')}`;
    const saved = await saveProject({ id: projectId, name, platformId, recipe, plan, assets });
    setProjects(await listProjects());
    setNotice(saved ? { type: 'ok', text: '已存档' } : { type: 'error', text: '存档失败（浏览器存储可能满了）' });
  }

  function handleLoadProject(p) {
    setProjectId(p.id);
    setPlatformId(p.platformId || 'xhs');
    setRecipe(p.recipe || null);
    setPlan(p.plan || null);
    // 存档里的素材没有原文件 —— 保留元数据，用户重新拖入即可恢复预览
    setAssets((p.assets || []).map((a) => ({ ...a, file: null, url: null })));
    setShowProjects(false);
    setView(p.plan ? 'edit' : 'ideate');
    setNotice({
      type: 'ok',
      text: p.assets?.length ? '已打开 —— 想预览或导出的话，把原素材文件再拖进来' : '已打开',
    });
  }

  async function handleDeleteProject(id) {
    await deleteProject(id);
    setProjects(await listProjects());
  }

  /** 从「趋势」里挑一个选题，带进「构思」 */
  function handleUseAngle(angle) {
    setSeedBrief(
      `选题：${angle.title}\n格式：${angle.format}\n开场：${angle.hook}\n结构：${(angle.beats || []).join(' → ')}\n素材：${angle.asset_need}`
    );
    if (angle.platform) setPlatformId(angle.platform);
    setView('ideate');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setNotice({ type: 'ok', text: '选题已带到「构思」—— 选「没有，用模板」那一栏' });
  }

  if (!authed) return <LoginGate onSuccess={() => setAuthed(true)} />;

  const noticeStyle =
    notice?.type === 'error'
      ? 'bg-sail-danger text-white'
      : notice?.type === 'warn'
        ? 'bg-sail-warn text-white'
        : 'bg-sail-ink text-sail-paper';

  return (
    <div className="min-h-screen">
      <Header
        view={view}
        setView={setView}
        onOpenSettings={() => setShowSettings(true)}
        onOpenProjects={() => setShowProjects(true)}
        hasKey={!!settings.apiKey}
        projectCount={projects.length}
        stage={{ ideate: !!recipe, edit: !!plan, post: false, trend: false }}
      />

      {notice && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium max-w-[90vw] text-center ${noticeStyle}`}
        >
          {notice.text}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 pb-24 pt-6">
        {view === 'ideate' && (
          <IdeateView
            settings={settings}
            notify={setNotice}
            platformId={platformId}
            setPlatformId={setPlatformId}
            recipe={recipe}
            setRecipe={setRecipe}
            seedBrief={seedBrief}
            onOpenSettings={() => setShowSettings(true)}
            onGoEdit={() => {
              setView('edit');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {view === 'edit' && (
          <EditView
            settings={settings}
            notify={setNotice}
            recipe={recipe}
            platformId={platformId}
            assets={assets}
            setAssets={setAssets}
            plan={plan}
            setPlan={setPlan}
            onOpenSettings={() => setShowSettings(true)}
            onGoIdeate={() => setView('ideate')}
            onGoPost={() => {
              setView('post');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {view === 'post' && (
          <PostView
            settings={settings}
            notify={setNotice}
            recipe={recipe}
            plan={plan}
            assets={assets}
            platformId={platformId}
            setPlatformId={setPlatformId}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}

        {view === 'trend' && (
          <TrendView
            settings={settings}
            notify={setNotice}
            platformId={platformId}
            setPlatformId={setPlatformId}
            onOpenSettings={() => setShowSettings(true)}
            onUseAngle={handleUseAngle}
          />
        )}
      </main>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
          onLogout={() => {
            logout();
            setShowSettings(false);
            setAuthed(false);
          }}
        />
      )}

      {showProjects && (
        <ProjectsPanel
          projects={projects}
          onClose={() => setShowProjects(false)}
          onLoad={handleLoadProject}
          onDelete={handleDeleteProject}
          onSaveCurrent={handleSaveProject}
          canSave={!!(recipe || plan)}
        />
      )}
    </div>
  );
}
