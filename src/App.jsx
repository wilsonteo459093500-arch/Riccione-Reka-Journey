import { useMemo, useState } from 'react';
import { T } from './theme.js';
import { useProjects } from './hooks/useProjects.js';
import { useAppointments } from './hooks/useAppointments.js';
import { useTeam } from './hooks/useTeam.js';
import { defaultAssignmentFromTeam } from './constants/team.js';
import { cloudConfigured } from './services/supabase.js';
import { createLocalRepo, createCloudRepo } from './services/repo.js';
import { UIProvider, useToast, useConfirm } from './components/ui/UIProvider.jsx';
import { LangProvider, useT } from './i18n/LangProvider.jsx';
import AuthGate from './components/auth/AuthGate.jsx';
import Nav from './components/Nav.jsx';
import ReminderBar from './components/ReminderBar.jsx';
import EmptyState from './components/EmptyState.jsx';
import MethodView from './components/MethodView.jsx';
import KanbanView from './components/kanban/KanbanView.jsx';
import ProjectDetail from './components/project/ProjectDetail.jsx';
import NewProjectModal from './components/project/NewProjectModal.jsx';
import FormEditor from './components/forms/FormEditor.jsx';
import TeamView from './components/team/TeamView.jsx';
import RisksView from './components/risks/RisksView.jsx';
import BriefingView from './components/briefing/BriefingView.jsx';
import CalendarView from './components/calendar/CalendarView.jsx';
import DesignDashboard from './components/design/DesignDashboard.jsx';
import SettingsView from './components/settings/SettingsView.jsx';
import ClientShareView from './components/client/ClientShareView.jsx';

function AppInner({ repo, user, onSignOut }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { t } = useT();
  const store = useProjects(repo, { onToast: toast });
  const {
    projects, loading, saveStatus,
    loadSample, clearAll, updateProject, toggleGate, addProject, deleteProject,
    addRisk, removeRisk, updateNote, updateForm, addAttachment, removeAttachment,
    saveDailyReport, deleteDailyReport,
    saveDefect, deleteDefect,
    saveAfterSale, deleteAfterSale, resolveAfterSale,
    startDesignFlow, completeDesignStep, addPresentation, updatePresentation, removePresentation,
  } = store;

  const { appointments, addAppointment, deleteAppointment } = useAppointments(repo, { onToast: toast });
  const { team, addMember, updateMember, removeMember, updateRoleLabel, resetToDefaults } = useTeam(repo, { onToast: toast });

  const [view, setView] = useState('kanban');
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [clientViewProject, setClientViewProject] = useState(null);
  const [formContext, setFormContext] = useState(null); // { projectId, formCode }
  const [calendarSeed, setCalendarSeed] = useState(null);

  const selected = selectedId ? projects.find((p) => p.id === selectedId) : null;
  const formProject = formContext ? projects.find((p) => p.id === formContext.projectId) : null;
  const storageLabel = repo.mode === 'cloud' ? '云端同步 (Supabase)' : '数据本地存储 (this device)';

  const handleCreate = (data) => {
    const proj = addProject({ ...data, assigned: defaultAssignmentFromTeam(team) });
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

      <ReminderBar
        projects={projects}
        appointments={appointments}
        onJump={(target) => { setSelectedId(null); setView(target); }}
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
            onAddAttachment={(g, a) => addAttachment(selected.id, g, a)}
            onRemoveAttachment={(g, a) => removeAttachment(selected.id, g, a)}
            onClientView={() => setClientViewProject(selected)}
            onOpenForm={(formCode) => setFormContext({ projectId: selected.id, formCode })}
            onSaveDailyReport={(report) => saveDailyReport(selected.id, report)}
            onDeleteDailyReport={(rid) => deleteDailyReport(selected.id, rid)}
            onSaveDefect={(d) => saveDefect(selected.id, d)}
            onDeleteDefect={(did) => deleteDefect(selected.id, did)}
            onSaveAfterSale={(t) => saveAfterSale(selected.id, t)}
            onDeleteAfterSale={(asId) => deleteAfterSale(selected.id, asId)}
            onResolveAfterSale={(asId, payload) => resolveAfterSale(selected.id, asId, payload)}
            onStartDesignFlow={() => startDesignFlow(selected.id)}
            onCompleteDesignStep={(stepId, decision) => completeDesignStep(selected.id, stepId, decision)}
            onAddPresentation={(payload) => addPresentation(selected.id, payload)}
            onUpdatePresentation={(presId, updates) => updatePresentation(selected.id, presId, updates)}
            onRemovePresentation={(presId) => removePresentation(selected.id, presId)}
            onScheduleAppointment={(type) => {
              setCalendarSeed({
                type: type || 'site_visit',
                projectId: selected.id,
                projectName: selected.name,
                address: selected.address || '',
                pic: selected.assigned?.SS || selected.assigned?.SD || '',
                date: new Date().toISOString().slice(0, 10),
              });
              setSelectedId(null);
              setView('calendar');
            }}
          />
        ) : view === 'settings' ? (
          <SettingsView
            team={team}
            addMember={addMember}
            updateMember={updateMember}
            removeMember={removeMember}
            updateRoleLabel={updateRoleLabel}
            resetToDefaults={resetToDefaults}
          />
        ) : view === 'design' ? (
          <DesignDashboard projects={projects} onOpen={(id) => { setSelectedId(id); setView('project'); }} />
        ) : view === 'briefing' ? (
          <BriefingView projects={projects} onOpen={(id) => { setSelectedId(id); setView('project'); }} />
        ) : view === 'calendar' ? (
          <CalendarView
            appointments={appointments}
            projects={projects}
            onAdd={addAppointment}
            onDelete={deleteAppointment}
            onOpenProject={(p) => { setSelectedId(p.id); setView('project'); }}
            seed={calendarSeed}
            clearSeed={() => setCalendarSeed(null)}
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
              <button onClick={handleClearAll} className="underline hover:no-underline opacity-50 hover:opacity-100">{t('footer_clear')}</button>
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
    <LangProvider>
      <UIProvider>
        {cloudConfigured ? (
          <AuthGate>{({ user, signOut }) => <AppInner repo={cloudRepo} user={user} onSignOut={signOut} />}</AuthGate>
        ) : (
          <AppInner repo={localRepo} />
        )}
      </UIProvider>
    </LangProvider>
  );
}
