// 报告填写页：按节渲染，自动保存，底部「预览 / 导出」
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './ui/Icon.jsx';
import { TopBar, Sheet, Empty, useUI } from './ui/UI.jsx';
import FieldInput, { FieldLabel } from './fields/FieldInput.jsx';
import ChecklistItem from './fields/ChecklistItem.jsx';
import TableSection from './fields/TableSection.jsx';
import SignaturesSection from './fields/SignaturesSection.jsx';
import SummaryCard from './SummaryCard.jsx';
import ProjectPicker from './ProjectPicker.jsx';
import { useStore } from '../lib/store.jsx';
import { getTemplate } from '../templates/index.js';
import { L, resolveScale } from '../templates/schema.js';
import { applyProject, isOptionalItem, makeCtx, progress, refreshAuto, reportTitle, siteLabel } from '../lib/report.js';
import { navigate, goBack } from '../lib/router.js';

function sectionCount(section, report) {
  if (section.type === 'checklist') {
    const items = section.items.filter((it) => !isOptionalItem(it));
    const done = items.filter((it) => {
      const a = report.items?.[it.id];
      if (it.input) return a?.value && (!Array.isArray(a.value) || a.value.length);
      return !!a?.r;
    }).length;
    return `${done}/${items.length}`;
  }
  if (section.type === 'table') return String((report.tables?.[section.id] || []).length);
  if (section.type === 'signatures') {
    const n = section.roles.filter((r) => report.signatures?.[r.id]?.image).length;
    return `${n}/${section.roles.length}`;
  }
  return '';
}

function sectionFails(section, report) {
  if (section.type !== 'checklist') return 0;
  return section.items.filter((it) => {
    const r = report.items?.[it.id]?.r;
    return resolveScale(it.scale || section.scale).options.find((o) => o.v === r)?.tone === 'fail';
  }).length;
}

function SectionHeader({ section, count, fails }) {
  return (
    <div className="mb-3 mt-7 flex items-end gap-2 px-1">
      {section.no && (
        <span className="rounded-md bg-terra px-1.5 py-0.5 text-[12px] font-bold text-white">{section.no}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[17px] font-bold leading-tight text-ink">{L(section.title, 'zh') || '基本信息'}</div>
        {section.title?.en && section.title?.zh && <div className="truncate text-[11px] uppercase tracking-wider text-ink-mute">{section.title.en}</div>}
      </div>
      {fails > 0 && <span className="rounded-full bg-fail/10 px-2 py-0.5 text-[12px] font-semibold text-fail">{fails} 不合格</span>}
      {count && <span className="rounded-full bg-cream-deep px-2 py-0.5 text-[12px] font-semibold text-ink-soft">{count}</span>}
    </div>
  );
}

function Note({ note, tone }) {
  if (!note) return null;
  const lines = Array.isArray(note) ? note : [note];
  return (
    <div className={`mb-3 rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${tone === 'warn' ? 'bg-terra-soft text-terra-dark' : 'bg-cream-deep/70 text-ink-soft'}`}>
      {lines.map((n, i) => (
        <div key={i} className={i ? 'mt-1.5' : ''}>
          {typeof n === 'string' ? n : n.zh}
          {typeof n !== 'string' && n.en && n.zh && <div className="mt-0.5 text-[12px] italic opacity-75">{n.en}</div>}
          {typeof n !== 'string' && !n.zh && n.en}
        </div>
      ))}
    </div>
  );
}

export default function Editor({ reportId }) {
  const store = useStore();
  const { toast, confirm } = useUI();
  const stored = store.reports.find((r) => r.id === reportId);
  const [report, setReport] = useState(stored || null);
  const [saved, setSaved] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [picking, setPicking] = useState(false);
  const dirty = useRef(false);
  const version = useRef(0); // 每次修改 +1；只有保存的快照仍是最新版本时才清 dirty
  const latest = useRef(stored || null); // 始终是最新状态（同步更新，组件卸载后迟到的照片也能写进来）
  const retryTimer = useRef(null);
  const mounted = useRef(true);
  const storeRef = useRef(store);
  storeRef.current = store;
  const previousFor = (r, projectId = r.projectId) =>
    storeRef.current.reports.filter((x) => x.id !== r.id && x.templateId === r.templateId && (x.projectId || null) === (projectId || null));

  const template = report ? getTemplate(report.templateId) : null;
  const project = report?.projectId ? store.projectById(report.projectId) : null;

  // 首次从 store 拿到报告（深链接打开时 store 可能晚一步就绪）
  useEffect(() => {
    if (!report && stored) {
      latest.current = stored;
      setReport(stored);
    }
  }, [stored, report]);

  // 项目资料在建报告之后补充过（如预计天数、设计师）→ 打开时补进还空着 / 仍是自动值的字段
  useEffect(() => {
    const r = latest.current;
    if (!r || !project || !template) return;
    if ((project.updatedAt || 0) <= (r.updatedAt || 0)) return;
    const next = applyProject(template, r, project, store.settings, project, previousFor(r));
    if (JSON.stringify(next.values) !== JSON.stringify(r.values) || JSON.stringify(next.signatures) !== JSON.stringify(r.signatures)) {
      update(() => next);
    }
  }, [report?.id, project?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // 从导出页的「填写提醒」跳回来：滚到对应项目
  useEffect(() => {
    const target = window.__siteScrollTo;
    if (!target || !report) return;
    window.__siteScrollTo = null;
    setTimeout(() => {
      const el = [].concat(target).map((id) => document.getElementById(id)).find(Boolean);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  }, [report?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 写入本机；返回 true = 已保存（或无需保存），false = 失败 */
  const flush = useCallback(async () => {
    if (!dirty.current || !latest.current) return true;
    const ver = version.current;
    const r = latest.current;
    const t = getTemplate(r.templateId);
    const p = r.projectId ? store.projectById(r.projectId) : null;
    try {
      await store.saveReport({ ...r, title: reportTitle(t, r, p) });
      if (version.current === ver) {
        dirty.current = false;
        setSaved(true);
      }
      setSaveError(false);
      clearTimeout(retryTimer.current);
      return true;
    } catch (e) {
      console.error(e);
      setSaved(false);
      setSaveError(true);
      toast('保存失败：手机存储空间不足或存储出错。请先别离开本页，清理空间后会自动重试', 'error');
      clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => flushRef.current?.(), 8000);
      return false;
    }
  }, [store, toast]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // 自动保存（停手 0.5 秒后写入）
  useEffect(() => {
    if (!dirty.current) return undefined;
    const t = setTimeout(flush, 500);
    return () => clearTimeout(t);
  }, [report, flush]);

  useEffect(() => {
    mounted.current = true;
    const onHide = () => document.visibilityState === 'hidden' && flushRef.current();
    const onPageHide = () => flushRef.current();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      clearTimeout(retryTimer.current);
      mounted.current = false;
      // 离开时：等处理中的照片 / 视频写完再存一次
      store.waitMedia().then(() => flushRef.current());
    };
  }, [store]);

  /** 所有修改都走这里：基于最新状态计算（避免照片处理完回写旧数据） */
  const update = useCallback((fn) => {
    const cur = latest.current;
    if (!cur) return;
    const n = fn(cur);
    const next = n.status === 'done' ? { ...n, status: 'draft' } : n;
    latest.current = next;
    version.current += 1;
    dirty.current = true;
    if (!mounted.current) {
      // 已离开编辑页（如照片晚到）：直接写入本机
      flushRef.current?.();
      return;
    }
    setSaved(false);
    setReport(next);
  }, []);

  const resolve = (v, prev) => (typeof v === 'function' ? v(prev) : v);
  const setValue = useCallback(
    (key, v) =>
      update((r) => {
        const next = { ...r, values: { ...r.values, [key]: resolve(v, r.values?.[key]) } };
        if (key !== 'date') return next;
        // 改了日期：回访日期 / 预计工期等按新日期重算（用户手改过的不动）
        const t = getTemplate(r.templateId);
        const p = r.projectId ? storeRef.current.projectById(r.projectId) : null;
        return refreshAuto(t, next, { project: p, settings: storeRef.current.settings, previous: previousFor(r) });
      }),
    [update],
  );
  /** patch 可以是对象或 (prevAnswer) => 对象；合并进最新的答案 */
  const setItem = useCallback(
    (id, patch) =>
      update((r) => {
        const prev = r.items?.[id] || {};
        return { ...r, items: { ...r.items, [id]: { ...prev, ...resolve(patch, prev) } } };
      }),
    [update],
  );
  const setTable = useCallback(
    (sid, rows) => update((r) => ({ ...r, tables: { ...r.tables, [sid]: resolve(rows, r.tables?.[sid] || []) } })),
    [update],
  );
  const setSigs = useCallback((sigs) => update((r) => ({ ...r, signatures: resolve(sigs, r.signatures || {}) })), [update]);

  /** 离开编辑页前：等照片处理完 + 保存成功；失败时让用户决定 */
  const leave = useCallback(
    async (go) => {
      if (store.pendingMedia() > 0) toast('照片 / 视频处理中，请稍候…', 'warn');
      await store.waitMedia();
      const ok = await flushRef.current();
      if (!ok) {
        const yes = await confirm({
          title: '这份报告还没保存成功',
          message: '手机存储可能已满。现在离开，最近的修改会丢失。\n建议先清理手机空间，留在本页等待自动重试。',
          okText: '仍然离开',
          cancelText: '留在本页',
          danger: true,
        });
        if (!yes) return;
      }
      go();
    },
    [store, toast, confirm],
  );

  const ctx = useMemo(
    () => (template && report ? makeCtx({ template, report, project, settings: store.settings }) : null),
    [template, report, project, store.settings],
  );
  const summary = useMemo(() => {
    if (!ctx || typeof template.summary !== 'function') return null;
    try {
      return template.summary(ctx);
    } catch {
      return null;
    }
  }, [ctx, template]);

  if (!store.ready) return null;
  if (!report || !template) {
    return (
      <>
        <TopBar title="报告" onBack={() => navigate('/', { replace: true })} />
        <Empty icon="CircleAlert" title="找不到这份报告" hint="可能已被删除。" action={<button className="btn-primary" onClick={() => navigate('/', { replace: true })}>回首页</button>} />
      </>
    );
  }

  const prog = progress(template, report);
  const hasSummarySlot = template.sections.some((s) => s.type === 'summary');
  const jump = (id) => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const navSections = template.sections.filter((s) => s.type !== 'note' && s.type !== 'summary');

  const changeProject = (p) => {
    setPicking(false);
    update((r) => applyProject(template, r, p, store.settings, project, previousFor(r, p?.id)));
  };

  return (
    <div className="min-h-[100dvh] pb-32">
      <TopBar
        title={template.name.zh}
        sub={`${project ? siteLabel(project) : '未选项目'} · ${saveError ? '⚠ 保存失败，自动重试中' : saved ? '已自动保存' : '保存中…'}`}
        onBack={() => leave(() => goBack('/'))}
        right={
          <div className="mr-1 flex items-center gap-1.5">
            <div className="relative h-9 w-9">
              <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#EFE9DC" strokeWidth="4" />
                <circle cx="18" cy="18" r="15" fill="none" stroke={prog.pct === 100 ? '#3F7A4F' : '#B5623A'} strokeWidth="4" strokeDasharray={`${(prog.pct / 100) * 94.2} 94.2`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-ink-soft">{prog.pct}</div>
            </div>
          </div>
        }
      />

      {navSections.length > 2 && (
        <div className="no-scrollbar sticky top-[calc(var(--safe-top)+56px)] z-30 flex gap-1.5 overflow-x-auto border-b border-line/60 bg-cream/95 px-3 py-2 backdrop-blur">
          {navSections.map((s) => {
            const c = sectionCount(s, report);
            return (
              <button key={s.id} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-ink-soft ring-1 ring-line active:bg-cream-deep" onClick={() => jump(s.id)}>
                {s.no ? `${s.no} ` : ''}
                {L(s.title, 'zh') || '信息'}
                {c && <span className="ml-1 text-ink-faint">{c}</span>}
              </button>
            );
          })}
        </div>
      )}

      <main className="mx-auto max-w-lg px-3">
        {/* 项目 */}
        <button className="card mt-3 flex w-full items-center gap-3 p-3 text-left active:bg-cream" onClick={() => setPicking(true)}>
          <div className="rounded-xl bg-pine/10 p-2 text-pine">
            <Icon name="Building2" size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-ink-mute">项目（自动带入地址 / SO / 客户）</div>
            <div className="truncate text-[15px] font-semibold text-ink">{project ? siteLabel(project) : '点此选择项目'}</div>
          </div>
          <span className="text-[13px] font-semibold text-terra">更换</span>
        </button>

        {template.sections.map((s) => {
          if (s.type === 'summary') {
            // 模板指定的统计位置（如场前审核：建议放在签核判定之前）
            return summary ? (
              <div key={s.id} id={`sec-${s.id}`} className="mt-6 scroll-mt-32">
                <SummaryCard summary={summary} />
              </div>
            ) : null;
          }
          if (s.type === 'note') {
            return (
              <div key={s.id} id={`sec-${s.id}`} className="mt-4 scroll-mt-32">
                {s.title && <div className="mb-1.5 px-1 text-[14px] font-bold text-ink">{L(s.title, 'zh')}{s.title.en && s.title.zh && <span className="ml-1.5 text-[11px] font-normal text-ink-mute">{s.title.en}</span>}</div>}
                <Note note={s.lines} tone={s.tone} />
              </div>
            );
          }
          return (
            <section key={s.id} id={`sec-${s.id}`} className="scroll-mt-32">
              <SectionHeader section={s} count={sectionCount(s, report)} fails={sectionFails(s, report)} />
              <Note note={s.note} />
              {s.type === 'fields' && (
                <div className="card space-y-4 p-3.5">
                  {s.fields.filter((f) => !f.hidden).map((f) => (
                    <div key={f.key} id={`field-${f.key}`} className="scroll-mt-32">
                      <FieldLabel field={f} />
                      <FieldInput field={f} value={report.values?.[f.key]} onChange={(v) => setValue(f.key, v)} reportId={report.id} />
                      {f.hint && <div className="mt-1 text-[12px] text-ink-mute">{f.hint}</div>}
                    </div>
                  ))}
                </div>
              )}
              {s.type === 'checklist' && (
                <div className="space-y-2.5">
                  {s.items.map((it) => (
                    <ChecklistItem key={it.id} section={s} item={it} answer={report.items?.[it.id]} onChange={setItem} reportId={report.id} />
                  ))}
                </div>
              )}
              {s.type === 'table' && (
                <TableSection template={template} section={s} report={report} rows={report.tables?.[s.id] || []} onChange={(rows) => setTable(s.id, rows)} reportId={report.id} />
              )}
              {s.type === 'signatures' && (
                <>
                  {summary && !hasSummarySlot && (
                    <div className="mb-3">
                      <SummaryCard summary={summary} />
                    </div>
                  )}
                  <SignaturesSection section={s} signatures={report.signatures || {}} onChange={setSigs} reportId={report.id} />
                </>
              )}
            </section>
          );
        })}

        {summary && !hasSummarySlot && !template.sections.some((s) => s.type === 'signatures') && (
          <div className="mt-6">
            <SummaryCard summary={summary} />
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-cream/95 px-3 pt-3 backdrop-blur pb-safe">
        <div className="mx-auto flex max-w-lg gap-2">
          <button
            className="btn-accent flex-1 py-3.5 text-[16px]"
            onClick={() => leave(() => navigate(`/r/${report.id}/export`))}
          >
            <Icon name={template.kind === 'message' ? 'Send' : 'FileDown'} size={19} />
            {template.kind === 'message' ? '生成文案 / 分享' : '预览 & 导出'}
          </button>
        </div>
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title="选择项目" tall>
        <ProjectPicker currentId={report.projectId} onPick={changeProject} />
      </Sheet>
    </div>
  );
}
