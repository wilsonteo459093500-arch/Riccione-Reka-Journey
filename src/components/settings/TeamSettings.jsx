import { Plus, Trash2, MessageCircle } from 'lucide-react';
import { T } from '../../theme.js';
import { avatarFor } from '../../utils/helpers.js';
import { ROLE_CODES, getRoleMeta } from '../../constants/team.js';
import { useConfirm } from '../ui/UIProvider.jsx';

export default function TeamSettings({ team, onAdd, onUpdate, onRemove }) {
  const confirm = useConfirm();

  const handleDelete = async (member) => {
    if (
      await confirm({
        title: '移除团队成员',
        message: `从团队列表中移除「${member.name || 'Unnamed'}」？此操作不会影响已分配给 ta 的旧项目记录。`,
        danger: true,
        confirmText: '移除',
      })
    ) {
      onRemove(member.id);
    }
  };

  return (
    <div className="space-y-4">
      {/* Helper text */}
      <div className="p-3 text-xs leading-relaxed" style={{ background: T.cream, color: T.inkSoft, borderRadius: '2px' }}>
        <div className="font-medium mb-1" style={{ color: T.ink }}>怎么用</div>
        每个成员有一个默认岗位（销售设计 / 现场主管 / 仓储 / 采购）。新建项目时, 自动按这里的列表填入默认负责人。WhatsApp 留好之后, 项目详情可一键拨打或发消息（功能后续接通）。
      </div>

      {/* Members grouped by role */}
      {ROLE_CODES.map((code) => {
        const role = getRoleMeta(team, code);
        const members = team.members.filter((m) => m.role === code);
        return (
          <div key={code}>
            <div className="flex items-baseline justify-between mb-2">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs px-1.5 py-0.5" style={{ background: role.color, color: T.paper, borderRadius: '2px' }}>
                  {code}
                </span>
                <span className="font-display text-lg" style={{ color: T.ink }}>{role.full}</span>
                <span className="text-xs" style={{ color: T.inkSoft }}>{members.length} 人</span>
              </div>
              <button
                onClick={() => onAdd({ role: code })}
                className="text-xs flex items-center gap-1 hover:opacity-100 opacity-70"
                style={{ color: role.color }}
              >
                <Plus size={12} strokeWidth={1.5} />添加
              </button>
            </div>

            {members.length === 0 ? (
              <div
                className="text-xs px-3 py-2.5"
                style={{ background: T.paper, color: T.inkSoft, opacity: 0.7, border: `1px dashed ${T.line}`, borderRadius: '2px' }}
              >
                此岗位还没人 — 点上面「添加」加成员。
              </div>
            ) : (
              <div className="space-y-1.5">
                {members.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    team={team}
                    onUpdate={(updates) => onUpdate(m.id, updates)}
                    onDelete={() => handleDelete(m)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MemberRow({ member, team, onUpdate, onDelete }) {
  const av = avatarFor(member.name);
  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: '2px' }}
    >
      {av ? (
        <div
          className="flex items-center justify-center flex-shrink-0 font-mono text-xs"
          style={{ width: 28, height: 28, borderRadius: '50%', background: av.color, color: T.paper, fontWeight: 600 }}
        >
          {av.initial}
        </div>
      ) : (
        <div className="flex-shrink-0" style={{ width: 28, height: 28, borderRadius: '50%', background: T.lineSoft }} />
      )}

      <input
        type="text"
        value={member.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        placeholder="姓名 Name"
        className="px-2 py-1 text-sm outline-none flex-1 min-w-[100px]"
        style={{ background: 'transparent', color: T.ink, border: `1px solid transparent`, borderRadius: '2px' }}
        onFocus={(e) => (e.target.style.borderColor = T.line)}
        onBlur={(e) => (e.target.style.borderColor = 'transparent')}
      />

      <select
        value={member.role}
        onChange={(e) => onUpdate({ role: e.target.value })}
        className="px-2 py-1 text-xs outline-none flex-shrink-0"
        style={{ background: 'transparent', color: T.inkSoft, border: `1px solid ${T.line}`, borderRadius: '2px' }}
        title="岗位 Role"
      >
        {ROLE_CODES.map((code) => {
          const meta = (team.roleLabels || {})[code];
          return (
            <option key={code} value={code}>
              {code} · {meta?.short || code}
            </option>
          );
        })}
      </select>

      <div className="flex items-center gap-1 flex-shrink-0" style={{ minWidth: 0 }}>
        <MessageCircle size={12} strokeWidth={1.5} style={{ color: T.inkSoft, opacity: 0.6 }} />
        <input
          type="text"
          value={member.whatsapp || ''}
          onChange={(e) => onUpdate({ whatsapp: e.target.value })}
          placeholder="WhatsApp"
          className="px-1 py-1 text-xs outline-none w-32"
          style={{ background: 'transparent', color: T.ink, border: `1px solid transparent`, borderRadius: '2px' }}
          onFocus={(e) => (e.target.style.borderColor = T.line)}
          onBlur={(e) => (e.target.style.borderColor = 'transparent')}
        />
      </div>

      <button
        onClick={onDelete}
        className="flex-shrink-0 opacity-40 hover:opacity-100"
        style={{ color: T.terra }}
        title="移除"
      >
        <Trash2 size={13} strokeWidth={1.5} />
      </button>
    </div>
  );
}
