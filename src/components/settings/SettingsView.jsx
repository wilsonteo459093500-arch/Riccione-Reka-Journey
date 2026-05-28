import { useState } from 'react';
import { Users, Tags, RefreshCw } from 'lucide-react';
import { T } from '../../theme.js';
import { useConfirm } from '../ui/UIProvider.jsx';
import TeamSettings from './TeamSettings.jsx';
import RoleSettings from './RoleSettings.jsx';

const TABS = [
  { id: 'team',  label: '团队成员', en: 'Team Members', Icon: Users },
  { id: 'roles', label: '岗位标签', en: 'Role Labels',  Icon: Tags },
];

export default function SettingsView({ team, addMember, updateMember, removeMember, updateRoleLabel, resetToDefaults }) {
  const [tab, setTab] = useState('team');
  const confirm = useConfirm();

  const handleReset = async () => {
    if (
      await confirm({
        title: '恢复默认设置',
        message: '将清空全部自定义的团队成员 + 岗位标签, 恢复初始配置。确定继续?',
        danger: true,
        confirmText: '恢复',
      })
    ) {
      resetToDefaults();
    }
  };

  return (
    <div className="fade-up space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] mb-1" style={{ color: T.wood }}>Settings · 设置</div>
          <h1 className="font-display text-5xl mb-2" style={{ color: T.ink }}>团队设置</h1>
          <p className="text-sm" style={{ color: T.inkSoft }}>
            管理团队成员、岗位标签。这些数据全员共享, 修改后立即生效在所有项目里。
          </p>
        </div>
        <button
          onClick={handleReset}
          className="text-xs flex items-center gap-1.5 px-3 py-1.5"
          style={{ background: 'transparent', color: T.inkSoft, border: `1px solid ${T.line}`, borderRadius: '2px' }}
        >
          <RefreshCw size={12} strokeWidth={1.5} />恢复默认
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 flex-wrap" style={{ borderBottom: `1px solid ${T.line}` }}>
        {TABS.map((t) => {
          const Icon = t.Icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors"
              style={{
                color: active ? T.ink : T.inkSoft,
                borderBottom: `2px solid ${active ? T.wood : 'transparent'}`,
                marginBottom: -1,
                fontWeight: active ? 600 : 400,
              }}
            >
              <Icon size={14} strokeWidth={1.5} />
              {t.label}
              <span className="text-[10px] opacity-60">{t.en}</span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      {tab === 'team' ? (
        <TeamSettings team={team} onAdd={addMember} onUpdate={updateMember} onRemove={removeMember} />
      ) : (
        <RoleSettings team={team} onUpdate={updateRoleLabel} />
      )}
    </div>
  );
}
