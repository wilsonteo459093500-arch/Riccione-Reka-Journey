import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { repo } from './services/repo.js';
import { ROLE_TABS, SESSION_KEY, can } from './constants.js';
import { buildReminders } from './utils.js';
import { demoDataset } from './seed.js';

import LoginScreen from './components/LoginScreen.jsx';
import Header from './components/Header.jsx';
import { PermissionWall } from './components/Shared.jsx';

import DashboardView   from './components/views/Dashboard.jsx';
import MembersView     from './components/views/Members.jsx';
import ProspectsView   from './components/views/Prospects.jsx';
import ScheduleView    from './components/views/Schedule.jsx';
import RunSessionView  from './components/views/RunSession.jsx';
import CommitmentsView from './components/views/Commitments.jsx';
import CasesView       from './components/views/Cases.jsx';
import RemindersView   from './components/views/Reminders.jsx';
import RulesView       from './components/views/Rules.jsx';
import MyPageView      from './components/views/MyPage.jsx';

export default function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [session, setSession] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
  });
  const [view, setView] = useState('dashboard');
  const [runningId, setRunningId] = useState(null);

  // 登录状态只存在这个页签里，关掉就要重登
  useEffect(() => {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  }, [session]);

  useEffect(() => {
    let unsub = null;
    repo.init()
      .then(() => { unsub = repo.subscribe(setSnapshot); })
      .catch(err => {
        console.error('Repo init failed', err);
        setSnapshot({ members: [], sessions: [], cases: [], commitments: [], prospects: [] });
      });
    return () => { if (unsub) unsub(); };
  }, []);

  const role = session?.role || 'member';
  const tabs = ROLE_TABS[role] || ROLE_TABS.member;

  // 角色变了就把视图拉回它能看的第一页
  useEffect(() => {
    if (!session) return;
    if (!tabs.includes(view)) setView(tabs[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.role]);

  // 载入示范数据会整批换掉 members，中间有一瞬间「当前登录的人」不在名单里。
  // 这个 ref 让下面那条踢人规则在换数据期间闭嘴，不然按一下示范数据就被登出。
  const switchingRef = useRef(false);

  // 登录的人如果被改成出局／被删掉，直接踢出去
  useEffect(() => {
    if (!snapshot || !session || switchingRef.current) return;
    const me = snapshot.members.find(m => m.id === session.memberId);
    if (!me || me.status === 'removed') setSession(null);
    else if (me.role !== session.role) setSession({ ...session, role: me.role, name: me.name });
  }, [snapshot, session]);

  // ---------- 写入 ----------
  const saveMember     = useCallback((m) => repo.upsert('members', m), []);
  const saveProspect   = useCallback((p) => repo.upsert('prospects', p), []);
  const removeProspect = useCallback((id) => repo.remove('prospects', id), []);
  const saveSession    = useCallback((s) => repo.upsert('sessions', s), []);
  const saveSessions   = useCallback((rows) => repo.upsertMany('sessions', rows), []);
  const saveCase       = useCallback((c) => repo.upsert('cases', c), []);
  const saveCommitment = useCallback((c) => repo.upsert('commitments', c), []);
  // 示范数据会覆盖整份名单，所以顺手把你切成示范桌的桌长 —— 否则你登录用的
  // 那个账号被换掉，人就被弹回登录页了。
  const loadDemo = useCallback(async () => {
    switchingRef.current = true;
    try {
      const data = demoDataset();
      await repo.replaceAll(data);
      const chair = data.members.find(m => m.role === 'chair');
      if (chair) setSession({ memberId: chair.id, name: chair.name, role: chair.role });
    } finally {
      switchingRef.current = false;
    }
  }, []);

  const reminders = useMemo(
    () => (snapshot && can(role, 'viewReminders') ? buildReminders(snapshot) : []),
    [snapshot, role]
  );

  if (!snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center felt-bg">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-pumm-brand flex items-center justify-center mx-auto mb-3 animate-pulse">
            <span className="font-display text-pumm-gold text-lg font-semibold">P</span>
          </div>
          <p className="text-sm text-pumm-muted">载入中…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen members={snapshot.members} onLogin={setSession} />;
  }

  // 主持模式盖住整个页面 —— 开会时不需要别的东西分心
  const inRunMode = view === 'run' && runningId && can(role, 'runSession');

  return (
    <div className="min-h-screen bg-pumm-paper">
      <Header
        tabs={tabs}
        view={view}
        setView={(v) => { setView(v); if (v !== 'run') setRunningId(null); }}
        session={session}
        onLogout={() => setSession(null)}
        reminderCount={reminders.filter(r => r.level === 'urgent').length}
      />

      <main className="max-w-6xl mx-auto px-4 py-5 pb-16 safe-bottom">
        {inRunMode ? (
          <RunSessionView
            snapshot={snapshot}
            sessionId={runningId}
            onBack={() => { setRunningId(null); setView('schedule'); }}
            onSaveSession={saveSession}
            onSaveCase={saveCase}
            onSaveCommitment={saveCommitment}
          />
        ) : (
          <Views
            view={view} role={role} session={session} snapshot={snapshot}
            reminders={reminders}
            actions={{ saveMember, saveProspect, removeProspect, saveSession, saveSessions, saveCase, saveCommitment, loadDemo }}
            onRun={(id) => { setRunningId(id); setView('run'); }}
          />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------
// 视图分发。每一页进来前先过权限 —— 规格第 5 节不是建议，是硬线。
// ---------------------------------------------------------------------
function Views({ view, role, session, snapshot, actions, onRun }) {
  switch (view) {
    case 'dashboard':
      return can(role, 'viewStats')
        ? <DashboardView snapshot={snapshot} role={role} />
        : <PermissionWall what="看板" />;

    case 'members':
      return can(role, 'viewMemberList')
        ? <MembersView
            snapshot={snapshot}
            onSaveMember={actions.saveMember}
            onLoadDemo={actions.loadDemo}
            canManage={can(role, 'manageMembers')}
          />
        : <PermissionWall what="会员名单" />;

    case 'prospects':
      return can(role, 'manageProspects')
        ? <ProspectsView
            snapshot={snapshot}
            onSaveProspect={actions.saveProspect}
            onRemoveProspect={actions.removeProspect}
          />
        : <PermissionWall what="招募名单" />;

    case 'schedule':
      return (
        <ScheduleView
          snapshot={snapshot}
          session={session}
          canManage={can(role, 'manageSchedule')}
          canRecordAttendance={can(role, 'recordAttendance')}
          onSaveSession={actions.saveSession}
          onSaveSessions={actions.saveSessions}
          onRun={onRun}
        />
      );

    case 'run':
      // 没选场次就直接进「会议运行」页 —— 引导回排期页去挑一场
      return can(role, 'runSession')
        ? <ScheduleView
            snapshot={snapshot}
            session={session}
            canManage={can(role, 'manageSchedule')}
            canRecordAttendance
            onSaveSession={actions.saveSession}
            onSaveSessions={actions.saveSessions}
            onRun={onRun}
          />
        : <PermissionWall what="会议运行" />;

    case 'commitments':
      return can(role, 'viewAllCommitments')
        ? <CommitmentsView
            snapshot={snapshot}
            onSaveCommitment={actions.saveCommitment}
            canReview={can(role, 'reviewCommitment')}
          />
        : <PermissionWall what="全桌的承诺" />;

    case 'cases':
      // ★ 案例正文的唯一入口。会员与理事会永远走不到这里。
      return can(role, 'viewCaseContent')
        ? <CasesView snapshot={snapshot} onSaveCase={actions.saveCase} canEdit={can(role, 'editCase')} />
        : <PermissionWall what="案例内容" />;

    case 'reminders':
      return can(role, 'viewReminders')
        ? <RemindersView snapshot={snapshot} />
        : <PermissionWall what="提醒" />;

    case 'me':
      return <MyPageView snapshot={snapshot} session={session} />;

    case 'rules':
    default:
      return <RulesView />;
  }
}
