// 首页：选报告类型 + 最近报告
import { useMemo, useState } from 'react';
import Icon from './ui/Icon.jsx';
import { Sheet, useUI, Empty } from './ui/UI.jsx';
import ProjectPicker from './ProjectPicker.jsx';
import { useStore } from '../lib/store.jsx';
import { TEMPLATES, GROUPS, getTemplate } from '../templates/index.js';
import { createReport, duplicateReport, progress, siteLabel } from '../lib/report.js';
import { fmtStamp } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { useInstallPrompt } from '../lib/install.js';
import { CREW_TEMPLATE } from '../lib/crew.js';
import { openCrewToday, CrewPaste } from './CrewLink.jsx';

function TemplateCard({ t, onClick, wide }) {
  return (
    <button onClick={onClick} className={`card flex items-start gap-3 p-3.5 text-left transition active:scale-[0.98] ${wide ? '' : ''}`}>
      <div className="shrink-0 rounded-2xl p-2.5 text-white" style={{ background: t.accent }}>
        <Icon name={t.icon} size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold leading-tight text-ink">{t.name.zh}</div>
        <div className="mt-0.5 truncate text-[11px] text-ink-mute">{t.name.en}</div>
        <div className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-ink-soft">{t.desc}</div>
      </div>
    </button>
  );
}

function ReportRow({ r, onMenu }) {
  const { projectById } = useStore();
  const t = getTemplate(r.templateId);
  if (!t) return null;
  const p = r.projectId ? projectById(r.projectId) : null;
  const prog = progress(t, r);
  const date = r.values?.date || '';
  return (
    <div className="card flex items-center gap-3 p-3">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => navigate(`/r/${r.id}`)}>
        <div className="shrink-0 rounded-xl p-2 text-white" style={{ background: t.accent }}>
          <Icon name={t.icon} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold text-ink">{t.name.zh}</span>
            {r.status === 'done' ? (
              <span className="shrink-0 rounded-full bg-pass/10 px-1.5 py-0.5 text-[10px] font-bold text-pass">已完成</span>
            ) : (
              <span className="shrink-0 rounded-full bg-cream-deep px-1.5 py-0.5 text-[10px] font-bold text-ink-mute">草稿 {prog.pct}%</span>
            )}
          </div>
          <div className="truncate text-[12px] text-ink-mute">
            {[p ? siteLabel(p) : r.values?.project || r.values?.address, date].filter(Boolean).join(' · ') || '未填项目'}
          </div>
        </div>
      </button>
      <div className="shrink-0 text-right text-[11px] text-ink-faint">{fmtStamp(r.updatedAt)}</div>
      <button className="-mr-1 shrink-0 rounded-full p-2 text-ink-mute active:bg-cream-deep" onClick={() => onMenu(r)} aria-label="更多">
        <Icon name="EllipsisVertical" size={18} />
      </button>
    </div>
  );
}

export default function Home() {
  const store = useStore();
  const { toast, confirm } = useUI();
  const [picking, setPicking] = useState(null); // template
  const [menu, setMenu] = useState(null); // report
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(40);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  const install = useInstallPrompt();
  const crew = !!store.settings.crew;
  const sharedProjects = store.projects.filter((p) => p.shared);
  const sharedBy = sharedProjects.find((p) => p.shared?.by?.name)?.shared.by;
  const [hideInstall, setHideInstall] = useState(() => {
    try {
      return localStorage.getItem('site.hideInstall') === '1';
    } catch {
      return false;
    }
  });
  const dismissInstall = () => {
    setHideInstall(true);
    try {
      localStorage.setItem('site.hideInstall', '1');
    } catch {
      /* ignore */
    }
  };

  const matching = useMemo(
    () =>
      store.reports
        .filter((r) => getTemplate(r.templateId))
        .filter((r) => filter === 'all' || (filter === 'none' ? !r.projectId || !store.projectById(r.projectId) : r.projectId === filter))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [store.reports, filter, store.projectById],
  );
  const recent = matching.slice(0, limit);
  const hasLoose = useMemo(() => store.reports.some((r) => !r.projectId || !store.projectById(r.projectId)), [store.reports, store.projectById]);
  const usedProjects = useMemo(() => {
    const ids = new Set(store.reports.map((r) => r.projectId).filter(Boolean));
    return store.projects.filter((p) => ids.has(p.id));
  }, [store.reports, store.projects]);

  const start = async (t, project) => {
    setPicking(null);
    const previous = store.reports.filter((r) => r.templateId === t.id && (r.projectId || null) === (project?.id || null));
    const report = createReport(t, { project, settings: store.settings, previous });
    await store.saveReport(report, { touch: false });
    navigate(`/r/${report.id}`);
  };

  const duplicate = async (r) => {
    setMenu(null);
    const t = getTemplate(r.templateId);
    const project = r.projectId ? store.projectById(r.projectId) : null;
    const previous = store.reports.filter((x) => x.templateId === t.id && (x.projectId || null) === (r.projectId || null));
    const copy = duplicateReport(t, r, { project, settings: store.settings, previous });
    await store.saveReport(copy, { touch: false });
    toast('已复制一份（文字保留，照片 / 判定 / 签名清空）');
    navigate(`/r/${copy.id}`);
  };

  const remove = async (r) => {
    setMenu(null);
    const ok = await confirm({ title: '删除这份报告？', message: '报告和里面的照片会一起删除，无法恢复。', okText: '删除', danger: true });
    if (!ok) return;
    await store.deleteReport(r.id);
    toast('已删除');
  };

  const hello = store.settings.name ? `${store.settings.name}，今天做哪份？` : '今天做哪份报告？';

  return (
    <div className="pb-28">
      <header className="bg-pine pt-safe text-white">
        <div className="mx-auto max-w-lg px-4 pb-6 pt-4">
          <div className="flex items-center gap-2">
            <div className="text-[24px] font-bold leading-none tracking-[0.3em]">TORA</div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/70">by Riccione Reka</div>
          </div>
          <div className="mt-4 text-[22px] font-bold leading-tight">{hello}</div>
          <div className="mt-1 text-[13px] text-white/70">手机填写 · 逐项拍照 · 一键出 PDF / Word / Excel / WhatsApp 文案</div>
        </div>
      </header>

      <main className="mx-auto -mt-3 max-w-lg px-3">
        {isIOS && !standalone && !hideInstall && (
          <div className="card mb-3 border-l-4 border-l-pine p-3">
            <div className="flex items-start gap-3">
              <Icon name="Smartphone" size={20} className="mt-0.5 shrink-0 text-pine" />
              <div className="flex-1 text-[13px] leading-relaxed text-ink-soft">
                <b className="text-ink">建议先加到主屏幕再开始用</b>：Safari 底部「分享」→「添加到主屏幕」。
                <br />
                iPhone 上主屏幕 App 和 Safari 的资料是<b>分开存的</b>；在 Safari 里填的报告不会自动出现在主屏幕 App 里（可用「设置 → 备份 / 恢复」搬过去）。
              </div>
              <button className="shrink-0 rounded-full p-1 text-ink-faint" onClick={dismissInstall} aria-label="不再提示">
                <Icon name="X" size={16} />
              </button>
            </div>
          </div>
        )}
        {isAndroid && !standalone && !hideInstall && (
          <div className="card mb-3 border-l-4 border-l-pine p-3">
            <div className="flex items-start gap-3">
              <Icon name="Smartphone" size={20} className="mt-0.5 shrink-0 text-pine" />
              <div className="flex-1 text-[13px] leading-relaxed text-ink-soft">
                <b className="text-ink">建议装到主屏幕再用</b>：像 App 一样打开，没信号也能填。
                {install ? (
                  <button className="btn-primary mt-2 w-full py-2 text-[14px]" onClick={() => install().then((o) => o === 'accepted' && dismissInstall())}>
                    <Icon name="Download" size={16} /> 安装到主屏幕
                  </button>
                ) : (
                  <>
                    <br />
                    在 WhatsApp 里打开的：点右上角「⋮」→「在 Chrome 中打开」，再点 Chrome 右上角「⋮」→「添加到主屏幕」。
                  </>
                )}
              </div>
              <button className="shrink-0 rounded-full p-1 text-ink-faint" onClick={dismissInstall} aria-label="不再提示">
                <Icon name="X" size={16} />
              </button>
            </div>
          </div>
        )}
        {crew && (
          <div className="card mb-3 border-l-4 border-l-terra p-3">
            <div className="text-[13px] leading-relaxed text-ink-soft">
              <b className="text-ink">安装师傅</b>：每天收工前填好每日汇报，点「分享文案 + 照片」发到群里。
            </div>
            {sharedProjects.map((p) => (
              <button key={p.id} className="btn-primary mt-2 w-full justify-start py-2.5 text-[14px]" onClick={() => openCrewToday(store, p)}>
                <Icon name="CalendarCheck" size={17} className="shrink-0" />
                <span className="truncate">填今天的汇报 · {siteLabel(p)}</span>
              </button>
            ))}
            <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-ink-mute">
              <span className="truncate">{sharedBy ? `项目由 ${[sharedBy.name, sharedBy.phone].filter(Boolean).join(' ')} 分享` : ''}</span>
              <button className="shrink-0 font-semibold text-terra" onClick={() => store.updateSettings({ crew: false })}>
                显示全部报告
              </button>
            </div>
          </div>
        )}
        {!crew && !store.settings.name && (
          <button className="card mb-3 flex w-full items-center gap-3 border-l-4 border-l-terra p-3 text-left" onClick={() => navigate('/settings')}>
            <Icon name="Info" size={20} className="shrink-0 text-terra" />
            <div className="flex-1 text-[13px] leading-snug text-ink-soft">
              先到「设置」填上你的<b>名字和电话</b>，进场通知、检查人、签名会自动带入。
            </div>
            <Icon name="ChevronRight" size={18} className="text-ink-faint" />
          </button>
        )}

        {GROUPS.map((g) => {
          const ts = TEMPLATES.filter((t) => g.kinds.includes(t.kind) && (!crew || t.id === CREW_TEMPLATE));
          if (!ts.length) return null;
          return (
            <section key={g.id} className="mb-5">
              <div className="mb-2 flex items-baseline gap-2 px-1 pt-2">
                <div className="text-[15px] font-bold text-ink">{g.zh}</div>
                <div className="text-[12px] text-ink-mute">{g.hint}</div>
              </div>
              <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
                {ts.map((t) => (
                  <TemplateCard key={t.id} t={t} onClick={() => setPicking(t)} />
                ))}
              </div>
            </section>
          );
        })}

        <section className="mb-4">
          <div className="mb-2 flex items-center gap-2 px-1 pt-2">
            <div className="text-[15px] font-bold text-ink">最近报告</div>
            <div className="text-[12px] text-ink-mute">{store.reports.length} 份 · 只存在这台手机</div>
          </div>
          {(usedProjects.length > 1 || (hasLoose && usedProjects.length > 0)) && (
            <div className="no-scrollbar -mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3">
              {[
                { id: 'all', label: '全部' },
                ...usedProjects.map((p) => ({ id: p.id, label: siteLabel(p) })),
                ...(hasLoose ? [{ id: 'none', label: '未关联项目' }] : []),
              ].map((c) => (
                <button
                  key={c.id}
                  className={`chip shrink-0 ${filter === c.id ? 'bg-pine text-white ring-pine' : 'bg-white text-ink-soft ring-line'}`}
                  onClick={() => setFilter(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {recent.map((r) => (
              <ReportRow key={r.id} r={r} onMenu={setMenu} />
            ))}
          </div>
          {matching.length > recent.length && (
            <button className="btn-ghost mt-2 w-full text-[14px]" onClick={() => setLimit((n) => n + 40)}>
              显示更多（还有 {matching.length - recent.length} 份）
            </button>
          )}
          {recent.length === 0 && <Empty icon="ClipboardList" title="还没有报告" hint="点上面任意一种报告开始填写。草稿会自动保存。" />}
        </section>
        {store.projects.length === 0 && store.reports.length === 0 && <CrewPaste />}
      </main>

      <Sheet open={!!picking} onClose={() => setPicking(null)} title={picking ? `新建：${picking.name.zh}` : ''} tall>
        {picking && (
          <>
            <div className="mb-3 text-[13px] text-ink-mute">选择项目 —— 地址、SO、客户等会自动带入。</div>
            <ProjectPicker onPick={(p) => start(picking, p)} />
          </>
        )}
      </Sheet>

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu ? getTemplate(menu.templateId)?.name.zh : ''}>
        {menu && (
          <div className="space-y-2 pb-2">
            <button className="btn-ghost w-full justify-start" onClick={() => { setMenu(null); navigate(`/r/${menu.id}`); }}>
              <Icon name="Pencil" size={18} /> 继续编辑
            </button>
            <button className="btn-ghost w-full justify-start" onClick={() => { setMenu(null); navigate(`/r/${menu.id}/export`); }}>
              <Icon name="FileDown" size={18} /> 预览 / 导出
            </button>
            <button className="btn-ghost w-full justify-start" onClick={() => duplicate(menu)}>
              <Icon name="CopyPlus" size={18} /> 照这份再写一份（如明天的日报）
            </button>
            <button className="btn w-full justify-start bg-fail/10 text-fail" onClick={() => remove(menu)}>
              <Icon name="Trash2" size={18} /> 删除
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
