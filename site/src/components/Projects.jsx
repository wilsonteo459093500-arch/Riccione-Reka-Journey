// 项目页：项目列表 / 新建 / 编辑；项目下的报告一览
import { useEffect, useMemo, useRef } from 'react';
import Icon from './ui/Icon.jsx';
import { TopBar, Empty, useUI } from './ui/UI.jsx';
import ProjectForm from './ProjectForm.jsx';
import { CrewShare } from './CrewLink.jsx';
import { useStore } from '../lib/store.jsx';
import { siteLabel } from '../lib/report.js';
import { getTemplate } from '../templates/index.js';
import { navigate, goBack } from '../lib/router.js';
import { fmtStamp } from '../lib/format.js';

export function ProjectList() {
  const { projects, reports } = useStore();
  const counts = useMemo(() => {
    const m = {};
    for (const r of reports) if (r.projectId) m[r.projectId] = (m[r.projectId] || 0) + 1;
    return m;
  }, [reports]);
  return (
    <div className="pb-28">
      <TopBar
        title="项目"
        sub="项目资料填一次，所有报告自动带入"
        right={
          <button className="btn-primary mr-1 px-3 py-2 text-[14px]" onClick={() => navigate('/projects/new')}>
            <Icon name="Plus" size={17} /> 新项目
          </button>
        }
      />
      <main className="mx-auto max-w-lg space-y-2 px-3 pt-3">
        {projects.map((p) => (
          <button key={p.id} className="card flex w-full items-center gap-3 p-3 text-left active:bg-cream" onClick={() => navigate(`/projects/${p.id}`)}>
            <div className="rounded-xl bg-pine/10 p-2.5 text-pine">
              <Icon name="Building2" size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-ink">{siteLabel(p)}</div>
              <div className="truncate text-[12px] text-ink-mute">{[p.so, p.address].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[15px] font-bold text-ink">{counts[p.id] || 0}</div>
              <div className="text-[10px] text-ink-mute">份报告</div>
            </div>
          </button>
        ))}
        {projects.length === 0 && (
          <Empty
            icon="Building2"
            title="还没有项目"
            hint="建一个项目：楼盘、单位、客户、SO、地址、导航链接、预计安装天数。之后所有报告一键带入。"
            action={
              <button className="btn-primary" onClick={() => navigate('/projects/new')}>
                <Icon name="Plus" size={18} /> 新建项目
              </button>
            }
          />
        )}
      </main>
    </div>
  );
}

export function ProjectEdit({ projectId }) {
  const store = useStore();
  const { confirm, toast } = useUI();
  const isNew = projectId === 'new';
  const dirty = useRef(false);
  const draft = useRef(null);
  const discard = useRef(false);
  // 安卓返回键 / 手势返回不会经过页头的确认：已有项目离开时自动保存修改
  useEffect(
    () => () => {
      const d = draft.current;
      if (dirty.current && !discard.current && !isNew && d && (d.name || '').trim()) {
        store.saveProject({ ...d, name: d.name.trim() });
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const p = isNew ? {} : store.projectById(projectId);
  const projReports = useMemo(
    () => store.reports.filter((r) => r.projectId === projectId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [store.reports, projectId],
  );
  if (!store.ready) return null;
  if (!isNew && !p) {
    return (
      <>
        <TopBar title="项目" onBack={() => navigate('/projects', { replace: true })} />
        <Empty icon="CircleAlert" title="找不到这个项目" />
      </>
    );
  }
  return (
    <div className="pb-16">
      <TopBar
        title={isNew ? '新建项目' : siteLabel(p)}
        onBack={async () => {
          if (dirty.current && isNew) {
            const ok = await confirm({ title: '新项目还没保存', message: '离开后填写的内容会丢失。', okText: '不保存，离开', cancelText: '继续编辑', danger: true });
            if (!ok) return;
            discard.current = true;
          }
          goBack('/projects'); // 已有项目：离开时自动保存
        }}
      />
      <main className="mx-auto max-w-lg px-3 pt-3">
        <div className="card p-4">
          <ProjectForm
            key={projectId}
            initial={p}
            onDirty={(v) => {
              dirty.current = v;
            }}
            onChange={(next) => {
              draft.current = next;
            }}
            onSave={async (data) => {
              dirty.current = false;
              await store.saveProject(data);
              toast('项目已保存');
              goBack('/projects');
            }}
            onDelete={
              isNew
                ? undefined
                : async () => {
                    const ok = await confirm({
                      title: '删除这个项目？',
                      message: projReports.length ? `项目下的 ${projReports.length} 份报告会保留，但不再关联项目。` : '',
                      okText: '删除',
                      danger: true,
                    });
                    if (!ok) return;
                    await store.deleteProject(projectId);
                    for (const r of projReports) await store.saveReport({ ...r, projectId: null }, { touch: false });
                    navigate('/projects', { replace: true });
                  }
            }
          />
        </div>
        {!isNew && !p.shared && (
          <CrewShare
            project={p}
            ensureSaved={async () => {
              const d = draft.current;
              if (!dirty.current || !d || !(d.name || '').trim()) return null;
              dirty.current = false;
              return store.saveProject({ ...d, name: d.name.trim() });
            }}
          />
        )}
        {!isNew && projReports.length > 0 && (
          <section className="mt-6">
            <div className="mb-2 px-1 text-[15px] font-bold text-ink">这个项目的报告</div>
            <div className="space-y-2">
              {projReports.map((r) => {
                const t = getTemplate(r.templateId);
                if (!t) return null;
                return (
                  <button key={r.id} className="card flex w-full items-center gap-3 p-3 text-left active:bg-cream" onClick={() => navigate(`/r/${r.id}`)}>
                    <div className="rounded-xl p-2 text-white" style={{ background: t.accent }}>
                      <Icon name={t.icon} size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-ink">{t.name.zh}</div>
                      <div className="text-[12px] text-ink-mute">{r.values?.date || ''}</div>
                    </div>
                    <div className="text-[11px] text-ink-faint">{fmtStamp(r.updatedAt)}</div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
