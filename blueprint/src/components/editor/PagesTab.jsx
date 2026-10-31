import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, FileQuestion } from 'lucide-react';
import { renderDeck } from '../../engine/deck.js';
import { planViews } from '../../engine/b/design.js';
import { uid } from '../../engine/model.js';
import { missingInPages, addTranslations } from '../../engine/lang.js';
import { metaOf } from '../../store/assets.js';
import { applyPolishPatches } from '../../ai/polish.js';
import PolishDialog from '../PolishDialog.jsx';
import TranslateDialog from '../TranslateDialog.jsx';
import SlideList from './SlideList.jsx';
import Stage from './Stage.jsx';
import Inspector from './Inspector.jsx';
import {
  stabilizePages, pageNumbers, warningPageCount, nextWarningIndex, findSlide, toggleSlide, moveSlideRelative, moveSlideBy,
  duplicateSlide, deleteSlide, insertViewsAfter, setAllViewLayouts, countLayoutChanges, applyFix, resolveViewLayout, canDelete,
  canDuplicate, setLang, NOW,
} from './ops.js';
import { useMediaQuery, useFillViewport, useStableCallback, isTypingTarget } from './hooks.js';
import { uploadImage, imageFiles } from './upload.js';

// 「页面」标签：左 页面列表 / 中 大画布 / 右 检查器。设计师在这里逐页检查自动生成的提案并修改，所见即所得。
// props: { project, onChange(updater), settings, notify, onOpenSettings, onGoTab(tab), focusSlideId, assetsVersion }

const LAYOUT_NAMES = { auto: '自动排版', full: '满版大图', framed: '图文' };

const store = {
  get(k) {
    try {
      return window.sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      window.sessionStorage.setItem(k, v);
    } catch {
      /* 隐私模式等 */
    }
  },
};

/** 渲染整套 + 内容没变的页沿用旧对象（缩略图不重绘）；素材版本变化时整体刷新 */
function useRenderedPages(project, assetsVersion) {
  const cacheRef = useRef({ ver: undefined, map: null });
  const rendered = useMemo(() => renderDeck(project, { meta: metaOf }), [project, assetsVersion]);
  return useMemo(() => {
    const c = cacheRef.current;
    const { pages, cache } = stabilizePages(c.ver === assetsVersion ? c.map : null, rendered);
    cacheRef.current = { ver: assetsVersion, map: cache };
    return pages;
  }, [rendered, assetsVersion]);
}

export default function PagesTab({ project, onChange, settings, notify, onOpenSettings, onGoTab, focusSlideId, assetsVersion }) {
  const rootRef = useRef(null);
  const fileRef = useRef(null);
  const insertAfterRef = useRef(null);
  const lastIndexRef = useRef(0);
  const selKeyStore = `bp.pages.sel.${project.id}`;

  const pages = useRenderedPages(project, assetsVersion);
  const pageNos = useMemo(() => pageNumbers(pages), [pages]);
  const slidesById = useMemo(() => new Map((project.slides || []).map((s) => [s.id, s])), [project.slides]);
  const warningCount = useMemo(() => warningPageCount(pages), [pages]);
  // English / 中英版：整套（会导出的页）还缺英文的中文 → 顶栏「AI 翻译 · N」与翻译弹窗
  const missing = useMemo(() => missingInPages(pages), [pages]);

  const [selectedKey, setSelectedKey] = useState(() => focusSlideId || store.get(selKeyStore) || null);
  const [activeField, setActiveField] = useState(null);
  const [pickNonce, setPickNonce] = useState(0);
  const [compare, setCompare] = useState(() => store.get('bp.pages.compare') === '1');
  const [polish, setPolish] = useState(null); // { only?: string[] }
  const [translate, setTranslate] = useState(null); // { items:[{zh,kind}] }
  const [busy, setBusy] = useState('');

  const wide = useMediaQuery('(min-width: 1024px)');
  const xl = useMediaQuery('(min-width: 1280px)');
  const height = useFillViewport(rootRef, wide);

  // 当前页：选中的 key 暂时不在（刚删除 / 分页变化）→ 显示原来位置附近那页；不改 selectedKey，撤销删除后会回到原页
  let selIndex = selectedKey ? pages.findIndex((p) => p.key === selectedKey) : -1;
  if (selIndex < 0) selIndex = Math.min(lastIndexRef.current, pages.length - 1);
  const page = selIndex >= 0 ? pages[selIndex] : null;
  const slide = page ? slidesById.get(page.slideId) || null : null;
  // 'auto' 的效果图页要看整套才知道是满版还是图文（与 renderDeck 同一个计划）
  const plan = useMemo(() => planViews(project, metaOf), [project, assetsVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const layout = slide?.kind === 'view' ? resolveViewLayout(slide, metaOf, plan) : null;

  useEffect(() => {
    if (selIndex >= 0) lastIndexRef.current = selIndex;
  }, [selIndex]);

  useEffect(() => {
    if (page?.key) store.set(selKeyStore, page.key);
  }, [page?.key, selKeyStore]);

  // 外部要求定位到某页（例如从材料清单 / 3D 面板跳过来）
  const handledFocus = useRef(null);
  useEffect(() => {
    if (!focusSlideId) {
      handledFocus.current = null;
      return;
    }
    if (handledFocus.current === focusSlideId) return;
    const pg = pages.find((p) => p.key === focusSlideId) || pages.find((p) => p.slideId === focusSlideId);
    if (!pg) return;
    handledFocus.current = focusSlideId;
    setSelectedKey(pg.key);
    setActiveField(null);
  }, [focusSlideId, pages]);

  // ---------------------------------------------------------------------------
  // 动作（全部稳定引用，列表项 memo 不受影响）
  // ---------------------------------------------------------------------------

  // 打字：外壳会把同一字段的连续修改合并成一步撤销；按钮类操作（删 / 移 / 插 / 版式…）各算一步
  const change = useStableCallback((fn, opts) => onChange(fn, opts));
  const act = useStableCallback((fn) => onChange(fn, { coalesce: false }));

  const select = useStableCallback((key) => {
    setSelectedKey(key);
    setActiveField(null);
  });

  const go = useStableCallback((delta) => {
    const i = Math.max(0, Math.min(pages.length - 1, selIndex + delta));
    if (pages[i]) select(pages[i].key);
  });

  const toggle = useStableCallback((id) => act((p) => toggleSlide(p, id)));

  const move = useStableCallback((id, targetId, place) => act((p) => moveSlideRelative(p, id, targetId, place)));

  const moveBy = useStableCallback((id, delta) => act((p) => moveSlideBy(p, id, delta)));

  const duplicate = useStableCallback((id) => {
    const s = findSlide(project, id);
    if (!canDuplicate(s)) return;
    const newId = uid('s');
    act((p) => duplicateSlide(p, id, newId));
    select(newId);
    notify?.({ type: 'ok', text: '已复制，新的一页在原页后面' });
  });

  const remove = useStableCallback((id) => {
    const s = findSlide(project, id);
    if (!canDelete(s)) {
      notify?.({ type: 'warn', text: '这一页只能隐藏，不能删除' });
      return;
    }
    const label = pages.find((p) => p.slideId === id)?.label || '这一页';
    act((p) => deleteSlide(p, id));
    notify?.({ type: 'ok', text: `已删除「${label}」（可以撤销）` });
  });

  const insertAfter = useStableCallback((id) => {
    insertAfterRef.current = id;
    fileRef.current?.click();
  });

  async function onInsertFiles(e) {
    const files = imageFiles(e.target.files);
    e.target.value = '';
    const afterId = insertAfterRef.current;
    insertAfterRef.current = null;
    if (!files.length || !afterId) return;
    const items = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setBusy(files.length > 1 ? `正在添加效果图 ${i + 1} / ${files.length}…` : '正在添加效果图…');
        try {
          items.push({ id: uid('s'), image: await uploadImage(files[i], { projectId: project.id }) });
        } catch (err) {
          notify?.({ type: 'error', text: err.message || '图片添加失败' });
        }
      }
    } finally {
      setBusy('');
    }
    if (!items.length) return;
    act((p) => insertViewsAfter(p, afterId, items));
    select(items[0].id);
    notify?.({ type: 'ok', text: items.length > 1 ? `已新增 ${items.length} 页效果图页` : '已新增一页效果图页 —— 在右边补上视角名和材料' });
  }

  const pick = useStableCallback((field) => {
    if (!field) return;
    if (field.startsWith('material:')) {
      onGoTab?.('materials');
      return;
    }
    setActiveField(field);
    setPickNonce((n) => n + 1);
  });

  const focusInspector = (field) => {
    setActiveField(field);
    setPickNonce((n) => n + 1);
  };

  // 提案语言：整套一起切（单独一步撤销）
  const changeLang = useStableCallback((lang) => onChange((p) => setLang(p, lang), NOW));

  // 「AI 翻译」：顶栏按钮（整套会导出的页）/ 缺英文提醒的一键修复（再加上这一页自己的 —— 隐藏页不在整套的统计里）
  const openTranslate = useStableCallback((extra) => {
    const items = [...missing, ...(Array.isArray(extra) ? extra : [])];
    if (items.length) setTranslate({ items });
    else notify?.({ type: 'ok', text: '英文已经齐了，没有需要翻译的地方' });
  });

  const applyTranslations = useStableCallback((pairs) => {
    if (!pairs?.length) return;
    onChange((p) => addTranslations(p, pairs), NOW);
    notify?.({ type: 'ok', text: `已套用 ${pairs.length} 条英文 —— 记进了这份提案的翻译记忆，用到的页都已更新（可以撤销）` });
  });

  const onFix = useStableCallback((fix) => {
    if (!slide) return;
    switch (fix.id) {
      case 'framed':
      case 'removeMissing':
        act((p) => applyFix(p, fix.id, slide.id));
        break;
      case 'split': {
        const newId = uid('s');
        act((p) => applyFix(p, 'split', slide.id, { newId }));
        notify?.({ type: 'ok', text: '已拆成两页（同一张图，材料 / 说明各放一半）' });
        break;
      }
      case 'gotoMaterials':
        onGoTab?.('materials');
        break;
      case 'translate':
        openTranslate(page?.missing);
        break;
      default:
        if (fix.field) focusInspector(fix.field);
    }
  });

  const globalLayout = useStableCallback((mode) => {
    const next = setAllViewLayouts(project, mode);
    if (next === project) {
      notify?.({ type: 'ok', text: `效果图页已经全部是${LAYOUT_NAMES[mode]}` });
      return;
    }
    // n = 实际换了版式的页数（'auto' 按整套计划换算成满版 / 图文）
    const n = countLayoutChanges(project, next, metaOf);
    act((p) => setAllViewLayouts(p, mode));
    notify?.({
      type: 'ok',
      text:
        mode === 'auto'
          ? n
            ? `已交给自动排版：${n} 页换了版式`
            : '已交给自动排版（这次排出来的版式没有变化）'
          : `效果图页已全部设为${LAYOUT_NAMES[mode]}${n ? `（${n} 页有变化）` : ''}，AI 立体图页不变`,
    });
  });

  const openPolish = useStableCallback((only) => setPolish({ only: Array.isArray(only) && only.length ? only : undefined }));

  const nextWarning = useStableCallback(() => {
    const i = nextWarningIndex(pages, selIndex);
    if (i >= 0) select(pages[i].key);
  });

  const toggleCompare = useStableCallback(() => {
    setCompare((c) => {
      store.set('bp.pages.compare', c ? '0' : '1');
      return !c;
    });
  });

  // 键盘：← → 翻页；Alt + ↑ ↓ 调整顺序；焦点在列表里时 ↑ ↓ 也翻页
  useEffect(() => {
    const onKey = (e) => {
      if (polish || translate || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
      const root = rootRef.current;
      if (!root || root.offsetParent === null) return; // 标签页被隐藏
      if (isTypingTarget(document.activeElement)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const inList = !!document.activeElement?.closest?.('[data-slide-list]');
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (!slide) return;
        e.preventDefault();
        moveBy(slide.id, e.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      if (e.altKey || e.shiftKey) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageUp' || (inList && e.key === 'ArrowUp')) {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || (inList && e.key === 'ArrowDown')) {
        e.preventDefault();
        go(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [polish, translate, slide, go, moveBy]);

  // 列表获得焦点的项跟随选中（键盘翻页后，焦点留在列表里继续用 ↑ ↓）
  useEffect(() => {
    const el = document.activeElement;
    if (!page || !el?.closest?.('[data-slide-list]')) return;
    const item = rootRef.current?.querySelector(`[data-slide-list] [data-key="${CSS.escape(page.key)}"] [role="button"]`);
    if (item && item !== el) item.focus({ preventScroll: true });
  }, [page]);

  const list = (
    <SlideList
      pages={pages}
      pageNos={pageNos}
      selectedKey={page?.key}
      slidesById={slidesById}
      horizontal={!wide}
      onSelect={select}
      onToggle={toggle}
      onMove={move}
      onMoveBy={moveBy}
      onDuplicate={duplicate}
      onDelete={remove}
      onInsertAfter={insertAfter}
      warningCount={warningCount}
      onNextWarning={nextWarning}
    />
  );

  const stage = pages.length ? (
    <Stage
      page={page}
      slide={slide}
      project={project}
      navIndex={selIndex}
      navTotal={pages.length}
      pageNo={page ? pageNos.get(page.key) : undefined}
      exportTotal={pageNos.size}
      onPrev={() => go(-1)}
      onNext={() => go(1)}
      onPick={pick}
      activeField={activeField}
      onClearPick={() => setActiveField(null)}
      compare={compare}
      onToggleCompare={toggleCompare}
      onFix={onFix}
      onPolish={(onlyThis) => openPolish(onlyThis && slide ? [slide.id] : undefined)}
      onGlobalLayout={globalLayout}
      onToggleEnabled={() => slide && toggle(slide.id)}
      onLang={changeLang}
      missingCount={missing.length}
      onTranslate={() => openTranslate()}
    />
  ) : (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-bp-faint">
      <FileQuestion className="w-8 h-8" />
      <p className="text-sm">这份提案还没有页面</p>
    </div>
  );

  const inspector = (
    <Inspector
      key={slide?.id || 'none'}
      project={project}
      page={page}
      slide={slide}
      layout={layout}
      change={change}
      notify={notify}
      onGoTab={onGoTab}
      activeField={activeField}
      pickNonce={pickNonce}
      onHighlight={setActiveField}
      openPolish={openPolish}
      onDuplicate={duplicate}
      onDelete={remove}
      onInsertAfter={insertAfter}
      onToggle={toggle}
      pageNo={page ? pageNos.get(page.key) : undefined}
    />
  );

  return (
    // 桌面：撑满外壳给的高度（h-full）；外壳没给定高度时用「到视口底部」兜底（maxHeight）。窄屏：上下堆叠，自己滚动
    <div
      ref={rootRef}
      className={`relative h-full bg-bp-paper ${wide ? 'flex' : 'flex flex-col overflow-y-auto thin-scroll'}`}
      style={wide && height ? { maxHeight: height } : undefined}
    >
      {wide ? (
        <aside data-slide-list className="w-[248px] shrink-0 border-r border-bp-line bg-bp-paper min-h-0">
          {list}
        </aside>
      ) : (
        <div data-slide-list>{list}</div>
      )}

      <main
        className={`relative min-w-0 bg-[#EDE7DC] ${wide ? 'flex-1 min-h-0' : 'shrink-0'}`}
        style={wide ? undefined : { height: 'min(78vh, calc(56.25vw + 150px))', minHeight: 320 }}
      >
        {stage}
        {busy && (
          <div className="absolute left-1/2 bottom-16 -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-bp-dark text-bp-light text-xs px-3.5 py-1.5 shadow-lg">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {busy}
          </div>
        )}
      </main>

      <aside className={wide ? `${xl ? 'w-[360px]' : 'w-[320px]'} shrink-0 border-l border-bp-line bg-bp-paper min-h-0` : 'border-t border-bp-line'}>
        {inspector}
      </aside>

      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onInsertFiles} />

      {polish && (
        <PolishDialog
          project={project}
          settings={settings}
          notify={notify}
          onOpenSettings={onOpenSettings}
          onlySlideIds={polish.only}
          onApply={(patches) => act((p) => applyPolishPatches(p, patches))}
          onClose={() => setPolish(null)}
        />
      )}

      {translate && (
        <TranslateDialog
          project={project}
          items={translate.items}
          settings={settings}
          notify={notify}
          onOpenSettings={onOpenSettings}
          onApply={applyTranslations}
          onClose={() => setTranslate(null)}
        />
      )}
    </div>
  );
}
