// 项目编辑器：载入项目（先预加载图片）→ 顶栏 + 五个标签页（页面 / 材料清单 / Material Board 封面 / 3D 立体图 / 项目信息）
// 项目状态在 useProjectState：onChange(updater) 不可变更新、⌘Z 撤销 / ⇧⌘Z 重做、600 ms 防抖自动保存。
// 标签页首次打开时才挂载；之后隐藏而不卸载（Material Board 的画布 / 画板状态得以保留），隐藏时不随项目改动重渲染。

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { LayoutTemplate, Palette, Stamp, Box, ClipboardList, Loader2, ArrowLeft, FileQuestion } from 'lucide-react';
import Header from './Header.jsx';
import PagesTab from './editor/PagesTab.jsx';
import MaterialsPanel from './MaterialsPanel.jsx';
import InfoPanel from './InfoPanel.jsx';
import ExportDialog from './ExportDialog.jsx';
import DollhousePanel from './DollhousePanel.jsx';
import MoodBoard from '../moodboard/MoodBoard.jsx';
import { getProject } from '../store/db.js';
import { preloadProjectAssets, onAssetsChanged, storeBlob } from '../store/assets.js';
import { useProjectState, waitForSaves } from '../lib/useProjectState.js';
import { designCoverSlideId, coverLayoutFor, projectStats, ensureDesignCoverSlide } from '../lib/project.js';
import { cls } from '../lib/ui.jsx';

export const TABS = [
  { id: 'pages', label: '页面', icon: LayoutTemplate },
  { id: 'materials', label: '材料清单', icon: Palette },
  { id: 'board', label: 'Material Board 封面', short: '封面', icon: Stamp },
  { id: '3d', label: '3D 立体图', short: '3D', icon: Box },
  { id: 'info', label: '项目信息', short: '信息', icon: ClipboardList },
];
const TAB_IDS = TABS.map((t) => t.id);

/** 载入项目 + 预加载图片，之后交给 Workspace */
export default function Editor({ projectId, settings, notify, onOpenSettings, onExit }) {
  const [loaded, setLoaded] = useState(null); // null | { project } | { missing:true } | { error }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await waitForSaves();
        const project = await getProject(projectId);
        if (!alive) return;
        if (!project) {
          setLoaded({ missing: true });
          return;
        }
        const { missing } = await preloadProjectAssets(project);
        if (!alive) return;
        if (missing) {
          notify({ type: 'warn', text: `有 ${missing} 张图片在本机找不到了（可能清理过浏览器数据），对应位置会显示灰块。` });
        }
        setLoaded({ project });
      } catch (e) {
        if (alive) setLoaded({ error: e?.message || String(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId, notify]);

  if (!loaded) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center gap-3 text-sm text-bp-faint bg-bp-paper">
        <Loader2 size={22} className="animate-spin text-bp-gold" />
        正在打开项目…
      </div>
    );
  }
  if (!loaded.project) {
    return (
      <div className="h-[100dvh] flex items-center justify-center px-4 bg-bp-paper">
        <div className={`${cls.card} max-w-sm w-full p-8 text-center`}>
          <FileQuestion size={30} className="mx-auto text-bp-rule" />
          <div className="mt-3 font-serif text-lg text-bp-ink">{loaded.missing ? '找不到这个项目' : '项目打不开'}</div>
          <div className="mt-1 text-sm text-bp-muted">
            {loaded.missing ? '它可能已经被删除，或者是在另一台电脑 / 另一个浏览器里做的。' : loaded.error}
          </div>
          <button type="button" onClick={onExit} className={`${cls.btnPrimary} mt-6`}>
            <ArrowLeft size={15} /> 回到项目列表
          </button>
        </div>
      </div>
    );
  }
  return <Workspace initial={loaded.project} settings={settings} notify={notify} onOpenSettings={onOpenSettings} onExit={onExit} />;
}

/** 隐藏的标签页：保持挂载，但不随父组件重渲染（切回来时再用最新的项目渲染） */
const Pane = memo(
  function Pane({ active, children }) {
    return (
      <div role="tabpanel" className={active ? 'h-full' : 'hidden'}>
        {children}
      </div>
    );
  },
  (prev, next) => !prev.active && !next.active
);

function Workspace({ initial, settings, notify, onOpenSettings, onExit }) {
  const projectId = initial.id;
  const onSaveError = useCallback(
    (e) => notify({ type: 'error', text: `保存失败：${e?.message || '浏览器存储出错'} —— 空间不足时可先删掉旧项目。` }),
    [notify]
  );
  const { project, onChange, undo, redo, canUndo, canRedo, saveState, flush } = useProjectState(initial, { onSaveError });

  const [tab, setTab] = useState('pages');
  const [visited, setVisited] = useState(() => new Set(['pages']));
  const [focusSlideId, setFocusSlideId] = useState(null);
  const [assetsVersion, setAssetsVersion] = useState(0);
  const [showExport, setShowExport] = useState(false);

  const tabRef = useRef(tab);
  tabRef.current = tab;
  const visitedRef = useRef(visited);
  visitedRef.current = visited;
  const pendingFocus = useRef(null); // 设了封面但还没切到「页面」：切过去时再定位
  const focusFrame = useRef(0);

  // 素材缓存变化（新存的图、预加载完成）→ 让预览重渲染
  useEffect(() => onAssetsChanged(() => setAssetsVersion((v) => v + 1)), []);
  useEffect(() => () => cancelAnimationFrame(focusFrame.current), []);

  /** 让「页面」定位到某页：先清空再设置，同一页也能再次触发 */
  const focusSlide = useCallback((slideId) => {
    cancelAnimationFrame(focusFrame.current);
    if (!visitedRef.current.has('pages')) {
      setFocusSlideId(slideId);
      return;
    }
    setFocusSlideId(null);
    focusFrame.current = requestAnimationFrame(() => setFocusSlideId(slideId));
  }, []);

  /** 切标签页；切到「页面」时可带上要定位的页 */
  const goTab = useCallback(
    (tabId, slideId) => {
      if (!TAB_IDS.includes(tabId)) return;
      setTab(tabId);
      setVisited((v) => (v.has(tabId) ? v : new Set(v).add(tabId)));
      if (tabId === 'pages') {
        const target = slideId || pendingFocus.current;
        pendingFocus.current = null;
        if (target) focusSlide(target);
      }
    },
    [focusSlide]
  );

  /** Material Board → 方案封面（MoodBoard 自己弹成功 / 失败提示；这里出错直接抛出） */
  const onUseAsCover = useCallback(
    async (blob, meta) => {
      const src = await storeBlob(blob, { projectId });
      let id = null;
      onChange((p) => {
        const withSlide = ensureDesignCoverSlide(p); // 方案封面页被删掉了就补回来
        id = designCoverSlideId(withSlide);
        return { ...withSlide, cover: { ...withSlide.cover, image: src, layout: coverLayoutFor(withSlide.cover?.layout, meta?.orientation) } };
      });
      if (!id) return;
      if (tabRef.current === 'pages') focusSlide(id);
      else {
        pendingFocus.current = id;
        // 「页面」还没打开过：它第一次挂载时就会定位到方案封面
        if (!visitedRef.current.has('pages')) setFocusSlideId(id);
      }
    },
    [projectId, onChange, focusSlide]
  );

  const handleBack = useCallback(async () => {
    await flush();
    onExit();
  }, [flush, onExit]);

  // 键盘：⌘Z 撤销 / ⇧⌘Z（Ctrl+Y）重做 / ⌘S 立即保存
  useEffect(() => {
    const onKey = (e) => {
      if (e.isComposing || e.altKey || !(e.metaKey || e.ctrlKey)) return;
      const k = (e.key || '').toLowerCase();
      if (k === 's') {
        e.preventDefault();
        flush().then(() => notify({ type: 'ok', text: '已保存到本机' }));
        return;
      }
      const isUndo = k === 'z';
      const isRedo = (k === 'z' && e.shiftKey) || (k === 'y' && e.ctrlKey && !e.metaKey);
      if (!isUndo && !isRedo) return;
      if (tabRef.current === 'board') return; // Material Board 的画板状态不在项目历史里
      if (e.target?.closest?.('[data-native-undo]')) return; // 自带草稿的输入框（如项目名）用浏览器自己的撤销
      if (document.querySelector('[role="dialog"]')) return; // 弹窗里不撤销项目
      e.preventDefault();
      if (isRedo) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, flush, notify]);

  // 文件拖到没有接收区的地方：拦下来，免得浏览器直接打开图片 / PDF 把编辑器替换掉
  useEffect(() => {
    const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
    const onOver = (e) => {
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'none';
    };
    const onDrop = (e) => {
      if (hasFiles(e)) e.preventDefault();
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const onRename = useCallback((name) => onChange((p) => ({ ...p, name }), { coalesce: false }), [onChange]);

  const stats = projectStats(project);
  const counts = { pages: stats.slides, materials: stats.materials };

  function onTabKey(e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = TAB_IDS.indexOf(tab);
    const next = TAB_IDS[(i + (e.key === 'ArrowRight' ? 1 : TAB_IDS.length - 1)) % TAB_IDS.length];
    goTab(next);
    requestAnimationFrame(() => document.getElementById(`bp-tab-${next}`)?.focus());
  }

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-bp-paper">
      <Header
        onOpenSettings={onOpenSettings}
        hasKey={!!settings?.apiKey}
        editor={{
          name: project.name,
          onRename,
          onBack: handleBack,
          saveState,
          onRetrySave: flush,
          onExport: () => setShowExport(true),
          canUndo,
          canRedo,
          onUndo: undo,
          onRedo: redo,
        }}
      />

      <nav className="shrink-0 border-b border-bp-line bg-bp-paper px-3 sm:px-4">
        <div role="tablist" aria-label="编辑器" onKeyDown={onTabKey} className="flex gap-1 overflow-x-auto thin-scroll -mb-px">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                id={`bp-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => goTab(t.id)}
                className={`relative shrink-0 inline-flex items-center gap-1.5 px-3 h-11 text-sm border-b-2 transition-colors focus:outline-none focus-visible:bg-bp-tint ${
                  active ? 'border-bp-gold text-bp-ink font-medium' : 'border-transparent text-bp-muted hover:text-bp-ink'
                }`}
              >
                <Icon size={15} className={active ? 'text-bp-gold' : ''} />
                {t.short ? (
                  <>
                    <span className="hidden md:inline">{t.label}</span>
                    <span className="md:hidden">{t.short}</span>
                  </>
                ) : (
                  t.label
                )}
                {counts[t.id] != null && <span className="text-[11px] text-bp-faint tabular-nums">{counts[t.id]}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="flex-1 min-h-0 relative">
        {visited.has('pages') && (
          <Pane active={tab === 'pages'}>
            <PagesTab
              project={project}
              onChange={onChange}
              settings={settings}
              notify={notify}
              onOpenSettings={onOpenSettings}
              onGoTab={goTab}
              focusSlideId={focusSlideId}
              assetsVersion={assetsVersion}
            />
          </Pane>
        )}
        {visited.has('materials') && (
          <Pane active={tab === 'materials'}>
            <MaterialsPanel project={project} onChange={onChange} notify={notify} onGoTab={goTab} assetsVersion={assetsVersion} />
          </Pane>
        )}
        {visited.has('board') && (
          <Pane active={tab === 'board'}>
            <div className="h-full overflow-y-auto thin-scroll">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
                <div>
                  <div className={cls.eyebrow}>Material Board</div>
                  <h2 className="font-serif text-2xl text-bp-ink mt-1">Material Board 封面</h2>
                  <p className="mt-1.5 text-xs text-bp-muted max-w-3xl leading-relaxed">
                    把本案材料排成一张大片：手动摆好，或用 AI 拍成实景平铺照。设为方案封面后，它就是「03 方案」章节的第一页 —— 公司封面保持原样。
                  </p>
                </div>
                <MoodBoard project={project} settings={settings} notify={notify} onOpenSettings={onOpenSettings} onUseAsCover={onUseAsCover} />
              </div>
            </div>
          </Pane>
        )}
        {visited.has('3d') && (
          <Pane active={tab === '3d'}>
            <DollhousePanel project={project} settings={settings} notify={notify} onOpenSettings={onOpenSettings} onChange={onChange} />
          </Pane>
        )}
        {visited.has('info') && (
          <Pane active={tab === 'info'}>
            <InfoPanel project={project} onChange={onChange} />
          </Pane>
        )}
      </main>

      {showExport && (
        <ExportDialog
          project={project}
          notify={notify}
          onClose={() => setShowExport(false)}
          onGoTab={(tabId, slideId) => {
            setShowExport(false);
            goTab(tabId, slideId);
          }}
        />
      )}
    </div>
  );
}
