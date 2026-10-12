// 首页：选报告类型 + 最近报告
import { useMemo, useState } from 'react';
import Icon from './ui/Icon.jsx';
import { Sheet, useUI, Empty } from './ui/UI.jsx';
import LangSwitch from './ui/LangSwitch.jsx';
import ProjectPicker from './ProjectPicker.jsx';
import { useStore } from '../lib/store.jsx';
import { TEMPLATES, GROUPS, getTemplate } from '../templates/index.js';
import { createReport, duplicateReport, progress, siteLabelUi } from '../lib/report.js';
import { fmtStamp } from '../lib/format.js';
import { t, tb, uiLabel, uiText, getUiLang } from '../lib/i18n.js';
import { navigate } from '../lib/router.js';
import { useInstallPrompt } from '../lib/install.js';
import { CREW_TEMPLATE } from '../lib/crew.js';
import { openCrewToday, CrewPaste } from './CrewLink.jsx';
import { isHuawei } from '../lib/camera.js';

// 中 / EN / 中英：带粗体等格式的一段话（中英 = 中文一段 + 英文另起一段）
function Bi({ zh, en, className = 'mt-1.5' }) {
  const lang = getUiLang();
  if (lang === 'zh') return zh;
  if (lang === 'en') return en;
  return (
    <>
      {zh}
      <div className={className}>{en}</div>
    </>
  );
}

// 弹层标题：中英时中文主行 + 英文小字
function TwoLine({ label }) {
  const { primary, secondary } = uiLabel(label);
  if (!secondary) return primary;
  return (
    <>
      <div className="leading-tight">{primary}</div>
      <div className="mt-0.5 text-[12px] font-medium leading-tight text-ink-mute">{secondary}</div>
    </>
  );
}

function TemplateCard({ t: tpl, onClick, wide }) {
  const name = uiLabel(tpl.name);
  // 英文模式下副标题（原来的英文名）不再重复；中文模式照旧显示英文名小字
  const sub = getUiLang() === 'zh' ? tpl.name.en : name.secondary;
  return (
    <button onClick={onClick} className={`card flex items-start gap-3 p-3.5 text-left transition active:scale-[0.98] ${wide ? '' : ''}`}>
      <div className="shrink-0 rounded-2xl p-2.5 text-white" style={{ background: tpl.accent }}>
        <Icon name={tpl.icon} size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold leading-tight text-ink">{name.primary}</div>
        {sub && <div className="mt-0.5 truncate text-[11px] text-ink-mute">{sub}</div>}
        <div className={`mt-1.5 text-[12px] leading-snug text-ink-soft ${getUiLang() === 'both' ? 'line-clamp-4 whitespace-pre-line' : 'line-clamp-2'}`}>
          {uiText(tpl.desc, '\n')}
        </div>
      </div>
    </button>
  );
}

function ReportRow({ r, onMenu }) {
  const { projectById } = useStore();
  const tpl = getTemplate(r.templateId);
  if (!tpl) return null;
  const p = r.projectId ? projectById(r.projectId) : null;
  const prog = progress(tpl, r);
  const date = r.values?.date || '';
  const where = [p ? siteLabelUi(p) : r.values?.project || r.values?.address, date].filter(Boolean).join(' · ') || t('未填项目', 'No project');
  const badge =
    r.status === 'done' ? (
      <span className="shrink-0 rounded-full bg-pass/10 px-1.5 py-0.5 text-[10px] font-bold text-pass">{t('已完成', 'Done')}</span>
    ) : (
      <span className="shrink-0 rounded-full bg-cream-deep px-1.5 py-0.5 text-[10px] font-bold text-ink-mute">{t('草稿', 'Draft')} {prog.pct}%</span>
    );
  const more = (
    <button className="-mr-1 shrink-0 rounded-full p-2 text-ink-mute active:bg-cream-deep" onClick={() => onMenu(r)} aria-label={t('更多', 'More')}>
      <Icon name="EllipsisVertical" size={18} />
    </button>
  );
  // English / 中英：报告名较长，名字占整行（最多两行），状态和时间放第三行
  if (getUiLang() !== 'zh') {
    return (
      <div className="card flex items-center gap-3 p-3">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => navigate(`/r/${r.id}`)}>
          <div className="shrink-0 rounded-xl p-2 text-white" style={{ background: tpl.accent }}>
            <Icon name={tpl.icon} size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-[14px] font-semibold leading-snug text-ink">{uiText(tpl.name)}</div>
            <div className="truncate text-[12px] text-ink-mute">{where}</div>
            <div className="mt-1 flex items-center gap-2">
              {badge}
              <span className="text-[11px] text-ink-faint">{fmtStamp(r.updatedAt)}</span>
            </div>
          </div>
        </button>
        {more}
      </div>
    );
  }
  return (
    <div className="card flex items-center gap-3 p-3">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => navigate(`/r/${r.id}`)}>
        <div className="shrink-0 rounded-xl p-2 text-white" style={{ background: tpl.accent }}>
          <Icon name={tpl.icon} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold text-ink">{uiText(tpl.name)}</span>
            {badge}
          </div>
          <div className="truncate text-[12px] text-ink-mute">{where}</div>
        </div>
      </button>
      <div className="shrink-0 text-right text-[11px] text-ink-faint">{fmtStamp(r.updatedAt)}</div>
      {more}
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
  const huawei = isHuawei(); // 华为没有谷歌 Chrome：说华为浏览器
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
  const sharedByText = (by) => {
    const who = [by.name, by.phone].filter(Boolean).join(' ');
    return t(`项目由 ${who} 分享`, `Shared by ${who}`);
  };
  const hasLoose = useMemo(() => store.reports.some((r) => !r.projectId || !store.projectById(r.projectId)), [store.reports, store.projectById]);
  const usedProjects = useMemo(() => {
    const ids = new Set(store.reports.map((r) => r.projectId).filter(Boolean));
    return store.projects.filter((p) => ids.has(p.id));
  }, [store.reports, store.projects]);

  const start = async (tpl, project) => {
    setPicking(null);
    const previous = store.reports.filter((r) => r.templateId === tpl.id && (r.projectId || null) === (project?.id || null));
    const report = createReport(tpl, { project, settings: store.settings, previous });
    await store.saveReport(report, { touch: false });
    navigate(`/r/${report.id}`);
  };

  const duplicate = async (r) => {
    setMenu(null);
    const tpl = getTemplate(r.templateId);
    const project = r.projectId ? store.projectById(r.projectId) : null;
    const previous = store.reports.filter((x) => x.templateId === tpl.id && (x.projectId || null) === (r.projectId || null));
    const copy = duplicateReport(tpl, r, { project, settings: store.settings, previous });
    await store.saveReport(copy, { touch: false });
    toast(t('已复制一份（文字保留，照片 / 判定 / 签名清空）', 'Copied. Text kept; photos, results and signatures cleared.'));
    navigate(`/r/${copy.id}`);
  };

  const remove = async (r) => {
    setMenu(null);
    const ok = await confirm({
      title: t('删除这份报告？', 'Delete this report?'),
      message: tb('报告和里面的照片会一起删除，无法恢复。', "The report and its photos will be deleted. This can't be undone."),
      okText: t('删除', 'Delete'),
      danger: true,
    });
    if (!ok) return;
    await store.deleteReport(r.id);
    toast(t('已删除', 'Deleted'));
  };

  const name = store.settings.name;
  const hello = uiLabel(
    name ? { zh: `${name}，今天做哪份？`, en: `Hi ${name}, which report today?` } : { zh: '今天做哪份报告？', en: 'Which report today?' },
  );
  const n = store.reports.length;
  const LANG = getUiLang();

  return (
    <div className="pb-28">
      <header className="bg-pine pt-safe text-white">
        <div className="mx-auto max-w-lg px-4 pb-6 pt-4">
          <div className="flex items-center gap-2">
            {/* 窄屏放不下时「by Riccione Reka」整行换到 TORA 下面，不拆开 */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <div className="text-[24px] font-bold leading-none tracking-[0.3em]">TORA</div>
              <div className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.18em] text-white/70">by Riccione Reka</div>
            </div>
            <div className="ml-auto shrink-0">
              <LangSwitch dark />
            </div>
          </div>
          <div className="mt-4 text-[22px] font-bold leading-tight">{hello.primary}</div>
          {hello.secondary && <div className="mt-1 text-[16px] font-semibold leading-tight text-white/85">{hello.secondary}</div>}
          <div className="mt-1 whitespace-pre-line text-[13px] text-white/70">
            {tb('手机填写 · 逐项拍照 · 一键出 PDF / Word / Excel / WhatsApp 文案', 'Fill in on your phone · Photo every item · PDF / Word / Excel / WhatsApp in one tap')}
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-3 max-w-lg px-3">
        {isIOS && !standalone && !hideInstall && !crew && (
          <div className="card mb-3 border-l-4 border-l-pine p-3">
            <div className="flex items-start gap-3">
              <Icon name="Smartphone" size={20} className="mt-0.5 shrink-0 text-pine" />
              <div className="flex-1 text-[13px] leading-relaxed text-ink-soft">
                <Bi
                  zh={
                    <>
                      <b className="text-ink">建议先加到主屏幕再开始用</b>：Safari 底部「分享」→「添加到主屏幕」。
                      <br />
                      iPhone 上主屏幕 App 和 Safari 的资料是<b>分开存的</b>；在 Safari 里填的报告不会自动出现在主屏幕 App 里（可用「设置 → 备份 / 恢复」搬过去）。
                    </>
                  }
                  en={
                    <>
                      <b className="text-ink">Add it to your Home Screen first</b>: in Safari, tap Share at the bottom → "Add to Home Screen".
                      <br />
                      On iPhone, the Home Screen app and Safari keep <b>separate data</b>. Reports filled in Safari won't show up in the Home Screen app
                      (move them with Settings → Backup / Restore).
                    </>
                  }
                />
              </div>
              <button className="shrink-0 rounded-full p-1 text-ink-faint" onClick={dismissInstall} aria-label={t('不再提示', "Don't show again")}>
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
                <Bi
                  zh={
                    <>
                      <b className="text-ink">建议装到主屏幕再用</b>：像 App 一样打开，没信号也能填。
                      {!install && (
                        <>
                          <br />
                          {huawei
                            ? '在 WhatsApp 里打开的：点右上角「⋮」→「在浏览器中打开」，再点华为浏览器的菜单 →「添加到桌面」。'
                            : '在 WhatsApp 里打开的：点右上角「⋮」→「在 Chrome 中打开」，再点 Chrome 右上角「⋮」→「添加到主屏幕」。'}
                        </>
                      )}
                    </>
                  }
                  en={
                    <>
                      <b className="text-ink">Install it on your Home Screen</b>: opens like an app and works without signal.
                      {!install && (
                        <>
                          <br />
                          {huawei
                            ? 'Opened from WhatsApp? Tap "⋮" (top right) → "Open in browser", then open Huawei Browser\'s menu → "Add to home screen".'
                            : 'Opened from WhatsApp? Tap "⋮" (top right) → "Open in Chrome", then tap Chrome\'s "⋮" → "Add to Home screen".'}
                        </>
                      )}
                    </>
                  }
                />
                {install && (
                  <button className="btn-primary mt-2 w-full py-2 text-[14px]" onClick={() => install().then((o) => o === 'accepted' && dismissInstall())}>
                    <Icon name="Download" size={16} /> {t('安装到主屏幕', 'Install to Home Screen')}
                  </button>
                )}
              </div>
              <button className="shrink-0 rounded-full p-1 text-ink-faint" onClick={dismissInstall} aria-label={t('不再提示', "Don't show again")}>
                <Icon name="X" size={16} />
              </button>
            </div>
          </div>
        )}
        {crew && (
          <div className="card mb-3 border-l-4 border-l-terra p-3">
            <div className="text-[13px] leading-relaxed text-ink-soft">
              <Bi
                zh={
                  <>
                    <b className="text-ink">安装师傅</b>：每天收工前填好每日汇报，点「分享文案 + 照片」发到群里。
                  </>
                }
                en={
                  <>
                    <b className="text-ink">Installer</b>: before you finish work each day, fill in the daily report and tap "Share message + photos" to send it to the
                    group.
                  </>
                }
              />
            </div>
            {isIOS && (
              <div className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-ink-mute">
                {standalone
                  ? tb(
                      'WhatsApp 里的链接会用 Safari 打开，和这里的资料不通：请固定在一个地方填（收到新链接就在下面粘贴）。',
                      "Links in WhatsApp open in Safari, which doesn't share data with this app. Always fill in from the same place (paste new links below).",
                    )
                  : tb(
                      '每天从 WhatsApp 点链接打开就行，不用加到主屏幕（主屏幕 App 和 Safari 的资料是分开的）。',
                      'Just open the link from WhatsApp each day. No need to add it to the Home Screen (the Home Screen app and Safari keep separate data).',
                    )}
              </div>
            )}
            {sharedProjects.map((p) => (
              <button key={p.id} className="btn-primary mt-2 w-full justify-start py-2.5 text-[14px]" onClick={() => openCrewToday(store, p)}>
                <Icon name="CalendarCheck" size={17} className="shrink-0" />
                <span className="truncate">
                  {t('填今天的汇报', "Fill in today's report")} · {siteLabelUi(p)}
                </span>
              </button>
            ))}
            <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-ink-mute">
              <span className="truncate">{sharedBy ? sharedByText(sharedBy) : ''}</span>
              <button className="shrink-0 font-semibold text-terra" onClick={() => store.updateSettings({ crew: false, crewChosen: true })}>
                {t('显示全部报告', 'Show all reports')}
              </button>
            </div>
          </div>
        )}
        {!crew && !store.settings.name && (
          <button className="card mb-3 flex w-full items-center gap-3 border-l-4 border-l-terra p-3 text-left" onClick={() => navigate('/settings')}>
            <Icon name="Info" size={20} className="shrink-0 text-terra" />
            <div className="flex-1 text-[13px] leading-snug text-ink-soft">
              <Bi
                className="mt-1"
                zh={
                  <>
                    先到「设置」填上你的<b>名字和电话</b>，进场通知、检查人、签名会自动带入。
                  </>
                }
                en={
                  <>
                    Add your <b>name and phone</b> in Settings first. They fill in the site notice, inspector and signatures automatically.
                  </>
                }
              />
            </div>
            <Icon name="ChevronRight" size={18} className="text-ink-faint" />
          </button>
        )}

        {GROUPS.map((g) => {
          const ts = TEMPLATES.filter((x) => g.kinds.includes(x.kind) && (!crew || x.id === CREW_TEMPLATE));
          if (!ts.length) return null;
          return (
            <section key={g.id} className="mb-5">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1 pt-2">
                <div className="text-[15px] font-bold text-ink">{uiText({ zh: g.zh, en: g.en })}</div>
                <div className="text-[12px] text-ink-mute">{uiText(g.hint)}</div>
              </div>
              <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
                {ts.map((x) => (
                  <TemplateCard key={x.id} t={x} onClick={() => setPicking(x)} />
                ))}
              </div>
            </section>
          );
        })}

        <section className="mb-4">
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 pt-2">
            <div className="text-[15px] font-bold text-ink">{t('最近报告', 'Recent reports')}</div>
            <div className="text-[12px] text-ink-mute">
              {LANG === 'zh'
                ? `${n} 份 · 只存在这台手机`
                : LANG === 'en'
                  ? `${n} ${n === 1 ? 'report' : 'reports'} · on this phone only`
                  : `${n} 份 · 只存在这台手机 · on this phone only`}
            </div>
          </div>
          {(usedProjects.length > 1 || (hasLoose && usedProjects.length > 0)) && (
            <div className="no-scrollbar -mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3">
              {[
                { id: 'all', label: t('全部', 'All') },
                ...usedProjects.map((p) => ({ id: p.id, label: siteLabelUi(p) })),
                ...(hasLoose ? [{ id: 'none', label: t('未关联项目', 'No project') }] : []),
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
              {t(`显示更多（还有 ${matching.length - recent.length} 份）`, `Show more (${matching.length - recent.length} more)`)}
            </button>
          )}
          {recent.length === 0 && (
            <Empty
              icon="ClipboardList"
              title={t('还没有报告', 'No reports yet')}
              hint={t('点上面任意一种报告开始填写。草稿会自动保存。', 'Tap any report type above to start. Drafts save automatically.')}
            />
          )}
        </section>
        {store.projects.length === 0 && store.reports.length === 0 ? (
          <CrewPaste />
        ) : (
          crew && <CrewPaste label={t('收到主管的新链接？点这里粘贴', 'New link from your supervisor? Tap here to paste')} />
        )}
      </main>

      <Sheet
        open={!!picking}
        onClose={() => setPicking(null)}
        title={picking ? <TwoLine label={{ zh: `新建：${picking.name.zh}`, en: `New: ${picking.name.en || picking.name.zh}` }} /> : ''}
        tall
      >
        {picking && (
          <>
            <div className="mb-3 whitespace-pre-line text-[13px] text-ink-mute">
              {tb('选择项目 —— 地址、SO、客户等会自动带入。', 'Choose a project. Address, SO, customer etc. fill in automatically.')}
            </div>
            <ProjectPicker onPick={(p) => start(picking, p)} />
          </>
        )}
      </Sheet>

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu ? <TwoLine label={getTemplate(menu.templateId)?.name} /> : ''}>
        {menu && (
          <div className="space-y-2 pb-2">
            <button className="btn-ghost w-full justify-start" onClick={() => { setMenu(null); navigate(`/r/${menu.id}`); }}>
              <Icon name="Pencil" size={18} /> {t('继续编辑', 'Continue editing')}
            </button>
            <button className="btn-ghost w-full justify-start" onClick={() => { setMenu(null); navigate(`/r/${menu.id}/export`); }}>
              <Icon name="FileDown" size={18} /> {t('预览 / 导出', 'Preview / Export')}
            </button>
            <button className="btn-ghost w-full justify-start" onClick={() => duplicate(menu)}>
              <Icon name="CopyPlus" size={18} /> {t('照这份再写一份（如明天的日报）', "Copy as a new report (e.g. tomorrow's daily report)")}
            </button>
            <button className="btn w-full justify-start bg-fail/10 text-fail" onClick={() => remove(menu)}>
              <Icon name="Trash2" size={18} /> {t('删除', 'Delete')}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
