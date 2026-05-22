import { useMemo, useState } from 'react';
import { T } from './theme.js';
import { useProjects } from './hooks/useProjects.js';
import { cloudConfigured } from './services/supabase.js';
import { createLocalRepo, createCloudRepo } from './services/repo.js';
import { UIProvider, useToast, useConfirm } from './components/ui/UIProvider.jsx';
import AuthGate from './components/auth/AuthGate.jsx';
import Nav from './components/Nav.jsx';
import EmptyState from './components/EmptyState.jsx';
import MethodView from './components/MethodView.jsx';
import KanbanView from './components/kanban/KanbanView.jsx';
import ProjectDetail from './components/project/ProjectDetail.jsx';
import NewProjectModal from './components/project/NewProjectModal.jsx';
import FormEditor from './components/forms/FormEditor.jsx';
import TeamView from './components/team/TeamView.jsx';
import RisksView from './components/risks/RisksView.jsx';
import ClientShareView from './components/client/ClientShareView.jsx';

function AppInner({ repo, user, onSignOut }) {
  const toast = useToast();
  const confirm = useConfirm();
  const store = useProjects(repo, { onToast: toast });
  const {
    projects, loading, saveStatus,
    loadSample, clearAll, updateProject, toggleGate, addProject, deleteProject,
    addRisk, removeRisk, updateNote, updateForm, addAttachment, removeAttachment, fetchAttachment,
  } = store;

  const [view, setView] = useState('kanban');
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [clientViewProject, setClientViewProject] = useState(null);
  const [formContext, setFormContext] = useState(null); // { projectId, formCode }

  const selected = selectedId ? projects.find((p) => p.id === selectedId) : null;
  const formProject = formContext ? projects.find((p) => p.id === formContext.projectId) : null;
  const storageLabel = repo.mode === 'cloud' ? '云端同步 (Supabase)' : '数据本地存储 (this device)';

  const handleCreate = (data) => {
    const proj = addProject(data);
    setShowNew(false);
    setSelectedId(proj.id);
    setView('project');
  };

  const handleDelete = async (id) => {
    await deleteProject(id);
    setSelectedId(null);
    setView('kanban');
  };

  const handleClearAll = async () => {
    if (await confirm({ title: '清空全部项目', message: '将删除所有项目及其附件，且无法恢复。确定继续?', danger: true, confirmText: '清空' })) {
      await clearAll();
    }
  };

  return (
    <div className="min-h-screen font-body" style={{ background: T.paper, color: T.ink }}>
      <Nav
        view={view}
        setView={(v) => { setView(v); setSelectedId(null); }}
        onNew={() => setShowNew(true)}
        saveStatus={saveStatus}
        user={user}
        onSignOut={onSignOut}
      />

      <main className={view === 'kanban' && !selected ? '' : 'max-w-7xl mx-auto px-6 lg:px-10 py-10'}>
        {loading ? (
          <div className="text-center py-20" style={{ color: T.inkSoft }}>
            <div className="font-display text-2xl">载入中…</div>
          </div>
        ) : projects.length === 0 ? (
          <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
            <EmptyState onLoadSample={loadSample} onNew={() => setShowNew(true)} onSeeMethod={() => setView('method')} />
          </div>
        ) : view === 'project' && selected ? (
          <ProjectDetail
            project={selected}
            onBack={() => { setSelectedId(null); setView('kanban'); }}
            onToggleGate={(g) => toggleGate(selected.id, g)}
            onUpdate={(p) => updateProject(selected.id, p)}
            onDelete={() => handleDelete(selected.id)}
            onUpdateNote={(g, n) => updateNote(selected.id, g, n)}
            onAddRisk={(r) => addRisk(selected.id, r)}
            onRemoveRisk={(r) => removeRisk(selected.id, r)}
            onAddAttachment={(g, a, c) => addAttachment(selected.id, g, a, c)}
            onRemoveAttachment={(g, a) => removeAttachment(selected.id, g, a)}
            fetchAttachment={fetchAttachment}
            onClientView={() => setClientViewProject(selected)}
            onOpenForm={(formCode) => setFormContext({ projectId: selected.id, formCode })}
          />
        ) : view === 'method' ? (
          <MethodView />
        ) : view === 'team' ? (
          <TeamView projects={projects} onOpen={(id) => { setSelectedId(id); setView('project'); }} />
        ) : view === 'risks' ? (
          <RisksView projects={projects} onOpen={(id) => { setSelectedId(id); setView('project'); }} />
        ) : (
          <KanbanView projects={projects} onOpen={(id) => { setSelectedId(id); setView('project'); }} />
        )}

        {projects.length > 0 && view !== 'kanban' && view !== 'method' && (
          <footer className="mt-24 pt-8" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
            <div className="flex items-center justify-between text-xs" style={{ color: T.inkSoft }}>
              <div>溪岸 SAIL · Delivery OS · {storageLabel}</div>
              <button onClick={handleClearAll} className="underline hover:no-underline opacity-50 hover:opacity-100">清空全部</button>
            </div>
          </footer>
        )}
      </main>

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreate={handleCreate} />}
      {clientViewProject && <ClientShareView project={clientViewProject} onClose={() => setClientViewProject(null)} />}
      {formContext && formProject && (
        <FormEditor
          project={formProject}
          formCode={formContext.formCode}
          onClose={() => setFormContext(null)}
          onSave={(answers) => {
            updateForm(formProject.id, formContext.formCode, answers);
            setFormContext(null);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  // Repos are stable singletons so the data hook doesn't reload each render.
  const localRepo = useMemo(() => createLocalRepo(), []);
  const cloudRepo = useMemo(() => (cloudConfigured ? createCloudRepo() : null), []);

  return (
    <UIProvider>
      {cloudConfigured ? (
        <AuthGate>{({ user, signOut }) => <AppInner repo={cloudRepo} user={user} onSignOut={signOut} />}</AuthGate>
      ) : (
        <AppInner repo={localRepo} />
      )}
    </UIProvider>
  );
}
