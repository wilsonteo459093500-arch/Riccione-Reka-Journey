import React, { useState } from 'react';
import { UserPlus, Trash2 } from 'lucide-react';
import { ROLES, ROLE_TABS } from '../../constants.js';
import { Card, ExportMenu, inputCls } from '../Shared.jsx';

export default function UsersView({ users, auditLog, currentUser, onAdd, onUpdate, onRemove }) {
  const [tab, setTab] = useState('users');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('sales');
  const [newPin, setNewPin] = useState('1234');
  const [newEmail, setNewEmail] = useState('');

  const submitNew = () => {
    if (!newName.trim()) { alert('Enter a name'); return; }
    if (users.some(u => u.username.toLowerCase() === newName.trim().toLowerCase())) {
      alert('That name already exists'); return;
    }
    onAdd({ username: newName.trim(), role: newRole, pin: newPin || '1234', email: newEmail.trim() });
    setNewName(''); setNewRole('sales'); setNewPin('1234'); setNewEmail(''); setAdding(false);
  };

  return (
    <div className="space-y-4 pt-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-sail-ink font-semibold">Users & Audit</h1>
          <p className="text-xs text-sail-muted mt-0.5">Manage team roles and review every change made in the system</p>
        </div>
        <ExportMenu
          rows={auditLog.map(a => ({
            Time: new Date(a.timestamp).toLocaleString('en-MY'),
            User: a.user, Role: ROLES[a.role]?.label || a.role,
            Action: a.action, Detail: a.detail,
          }))}
          title="Audit Log" filename="Sail_AuditLog"
        />
      </div>

      <div className="flex items-center gap-1.5">
        {[
          { id: 'users', label: 'Team Members' },
          { id: 'audit', label: `Audit Trail (${auditLog.length})` },
        ].map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md ${
              tab === t.id ? 'bg-sail-ink text-sail-paper' : 'bg-white border border-sail-line text-sail-muted hover:text-sail-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setAdding(!adding)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sail-green hover:bg-sail-green-deep text-white text-sm font-medium rounded-md"
            >
              <UserPlus className="w-4 h-4" /> Add user
            </button>
          </div>

          {adding && (
            <Card>
              <h3 className="font-display text-base text-sail-ink font-semibold mb-3">New team member</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">Name</label>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} className={inputCls} placeholder="e.g. Aiman" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">Role</label>
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className={inputCls}>
                    {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">PIN</label>
                  <input value={newPin} onChange={(e) => setNewPin(e.target.value)} className={inputCls} placeholder="4-digit PIN" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">Email (for reminders)</label>
                  <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={inputCls} placeholder="name@company.com" />
                </div>
              </div>
              <p className="text-[11px] text-sail-muted mt-2">{ROLES[newRole]?.desc}</p>
              <div className="flex items-center justify-end gap-2 mt-3">
                <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 text-sm text-sail-muted">Cancel</button>
                <button type="button" onClick={submitNew}
                  className="px-4 py-1.5 bg-sail-green text-white text-sm font-medium rounded-md">Add</button>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {users.map(u => {
              const rm = ROLES[u.role] || {};
              return (
                <div key={u.username} className="bg-white border border-sail-line rounded-lg p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
                    style={{ background: rm.color || '#9A8F7E' }}>
                    {u.username[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-sail-ink">
                      {u.username}
                      {u.username === currentUser && <span className="text-[10px] text-sail-faint ml-1">(you)</span>}
                    </div>
                    <div className="text-[11px] text-sail-muted">{u.email || 'no email'}</div>
                  </div>
                  <select
                    value={u.role}
                    onChange={(e) => onUpdate(u.username, { role: e.target.value })}
                    className="bg-sail-tint border border-sail-line rounded px-2 py-1.5 text-xs text-sail-ink focus:outline-none"
                  >
                    {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  {u.username !== currentUser && (
                    <button type="button"
                      onClick={() => { if (confirm(`Remove ${u.username}?`)) onRemove(u.username); }}
                      className="text-sail-faint hover:text-sail-danger p-1" aria-label="Remove">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="bg-sail-tint border border-sail-line rounded-lg p-4 text-xs text-sail-muted leading-relaxed">
            <div className="font-semibold text-sail-ink mb-1.5">What each role can see</div>
            {Object.entries(ROLES).map(([k, v]) => (
              <div key={k} className="flex items-start gap-2 mb-1">
                <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: v.color }} />
                <span>
                  <span className="font-medium text-sail-ink">{v.label}:</span> {v.desc}.
                  Tabs: {ROLE_TABS[k].join(', ')}.
                </span>
              </div>
            ))}
            <div className="mt-2 pt-2 border-t border-sail-line">
              Site Supervisor & Designer never see un-paid pipeline customer data — only confirmed sales.
              Dashboard & Analytics are manager-only.
            </div>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <Card>
          {auditLog.length === 0 ? (
            <p className="text-sm text-sail-muted text-center py-8">No activity recorded yet.</p>
          ) : (
            <div className="space-y-1 max-h-[60vh] overflow-y-auto scrollbar-thin">
              {auditLog.map(a => {
                const rm = ROLES[a.role] || {};
                return (
                  <div key={a.id} className="flex items-start gap-3 py-2 border-b border-sail-line last:border-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                      style={{ background: rm.color || '#9A8F7E' }}>
                      {a.user[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-sail-ink">
                        <span className="font-medium">{a.user}</span>{' '}
                        <span className="text-sail-muted">{a.action.toLowerCase()}</span> — {a.detail}
                      </div>
                      <div className="text-[10px] text-sail-faint">
                        {rm.label || a.role} · {new Date(a.timestamp).toLocaleString('en-MY')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
