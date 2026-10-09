// 选项目（可就地新建）
import { useState } from 'react';
import Icon from './ui/Icon.jsx';
import ProjectForm from './ProjectForm.jsx';
import { useStore } from '../lib/store.jsx';
import { siteLabel } from '../lib/report.js';

export default function ProjectPicker({ currentId, onPick, allowNone = true }) {
  const { projects, saveProject } = useStore();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(projects.length === 0);
  const list = projects.filter((p) => !p.archived && (!q || `${siteLabel(p)} ${p.so || ''} ${p.address || ''}`.toLowerCase().includes(q.toLowerCase())));

  if (creating) {
    return (
      <div>
        <div className="mb-3 text-[13px] leading-relaxed text-ink-mute">新项目：先填基本资料，之后可在「项目」页补充导航、进场须知、预计天数等。</div>
        <ProjectForm
          compact
          onCancel={projects.length ? () => setCreating(false) : undefined}
          onSave={async (p) => {
            const saved = await saveProject(p);
            onPick(saved);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {projects.length > 5 && (
        <input className="input" placeholder="搜索项目 / 单位 / SO" value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      <button className="btn-soft w-full justify-start" onClick={() => setCreating(true)}>
        <Icon name="FolderPlus" size={18} /> 新建项目
      </button>
      {list.map((p) => (
        <button
          key={p.id}
          className={`card flex w-full items-center gap-3 p-3 text-left active:bg-cream ${p.id === currentId ? 'ring-2 ring-terra' : ''}`}
          onClick={() => onPick(p)}
        >
          <div className="rounded-xl bg-pine/10 p-2 text-pine">
            <Icon name="Building2" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-ink">{siteLabel(p)}</div>
            <div className="truncate text-[12px] text-ink-mute">{[p.so, p.address].filter(Boolean).join(' · ') || '—'}</div>
          </div>
          {p.id === currentId && <Icon name="Check" size={18} className="text-terra" />}
        </button>
      ))}
      {allowNone && (
        <button className="w-full py-3 text-center text-[14px] font-semibold text-ink-mute" onClick={() => onPick(null)}>
          不选项目，手动填写
        </button>
      )}
    </div>
  );
}
