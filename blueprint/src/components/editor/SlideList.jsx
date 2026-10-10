import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye, EyeOff, MoreHorizontal, Copy, Trash2, ImagePlus, ArrowUp, ArrowDown, TriangleAlert, ChevronRight, Box,
} from 'lucide-react';
import SlideCanvas from '../SlideCanvas.jsx';
import { groupSections, canDelete, canDuplicate, canInsertViewAfter } from './ops.js';
import { requestThumbs, thumbUrl, useThumbsSig } from './thumbs.js';
import { useInViewOnce, useStableCallback } from './hooks.js';
import { MenuList } from './ui.jsx';

// 左侧页面列表：按章节分组的缩略图（懒渲染 + 小图缓存）、页码、提醒点、显示 / 隐藏、拖放排序、右键菜单。
// 拖放与菜单都以 slideId 为单位（本案材料分页的第 2 页拖动 = 拖整页）。

const EMPTY = [];
const MENU_W = 216;

/** 缩略图：进入视口才渲染；用 480px 小图；只在本页内容或小图就绪状态变化时重绘 */
export const SlideThumb = memo(function SlideThumb({ page, width, rootRef }) {
  const ref = useRef(null);
  const visible = useInViewOnce(ref, { root: rootRef, rootMargin: '400px' });
  const srcs = useMemo(() => (page.els || []).filter((e) => e.t === 'img' && e.src).map((e) => e.src), [page]);
  const sig = useThumbsSig(visible ? srcs : EMPTY);
  useEffect(() => {
    if (visible) requestThumbs(srcs);
  }, [visible, srcs]);
  // sig 变化 → 新的 resolve 函数 → SlideCanvas 重绘（换上刚生成好的小图）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resolve = useCallback((src) => thumbUrl(src), [sig]);
  return (
    <div ref={ref} style={{ width, height: (width * 9) / 16, background: `#${page.bg || 'F5F0E6'}` }} className="overflow-hidden rounded-md ring-1 ring-black/[0.07]">
      {visible && <SlideCanvas slide={page} width={width} resolveUrl={resolve} />}
    </div>
  );
});

const ListItem = memo(function ListItem({ page, pageNo, selected, dropPlace, menuOpen, dragging, horizontal, thumbW, rootRef, is3d, actions }) {
  const warn = page.warnings?.length ? page.warnings : null;
  const id = page.slideId;
  return (
    <div
      data-key={page.key}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', id);
        } catch {
          /* 部分浏览器限制 */
        }
        actions.dragStart(id);
      }}
      onDragOver={(e) => {
        if (!actions.isDragging()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = e.currentTarget.getBoundingClientRect();
        const before = horizontal ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
        actions.dragOver(page.key, before ? 'before' : 'after');
      }}
      onDrop={(e) => {
        e.preventDefault();
        actions.drop(id);
      }}
      onDragEnd={() => actions.dragEnd()}
      onContextMenu={(e) => {
        e.preventDefault();
        actions.select(page.key);
        actions.openMenu(page.key, { x: e.clientX, y: e.clientY });
      }}
      className={`group relative shrink-0 rounded-xl p-1.5 transition-colors ${
        selected ? 'bg-white ring-2 ring-bp-gold shadow-sm' : 'hover:bg-white/70'
      } ${dragging ? 'opacity-40' : ''}`}
      style={horizontal ? { width: thumbW + 12 } : undefined}
    >
      {dropPlace && (
        <div
          className={`absolute z-10 bg-bp-gold rounded-full pointer-events-none ${
            horizontal
              ? `top-1 bottom-1 w-[3px] ${dropPlace === 'before' ? '-left-[2px]' : '-right-[2px]'}`
              : `left-1 right-1 h-[3px] ${dropPlace === 'before' ? '-top-[2px]' : '-bottom-[2px]'}`
          }`}
        />
      )}
      {/* 用 div 而不是 button：Firefox 不允许从 button 上开始拖动 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => actions.select(page.key)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.altKey) {
            e.preventDefault();
            actions.select(page.key);
          }
        }}
        className="block w-full text-left rounded-md cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-bp-gold"
        title={page.label}
      >
        <span className="relative block">
          <span className={`block ${page.enabled ? '' : 'opacity-40 grayscale'}`}>
            <SlideThumb page={page} width={thumbW} rootRef={rootRef} />
          </span>
          {!page.enabled && (
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="inline-flex items-center gap-1 text-[10px] text-bp-muted bg-white/90 rounded-full px-2 py-0.5 shadow-sm">
                <EyeOff className="w-3 h-3" />
                已隐藏
              </span>
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5 mt-1 px-0.5 min-w-0">
          <span className={`text-[10px] tabular-nums w-5 shrink-0 ${page.enabled ? 'text-bp-faint' : 'text-bp-line'}`}>{pageNo || '—'}</span>
          <span className={`text-[11px] truncate ${page.enabled ? 'text-bp-ink' : 'text-bp-faint line-through'}`}>{page.label}</span>
          {is3d && (
            <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-semibold text-bp-eyebrow border border-bp-gold/50 rounded px-1">
              <Box className="w-2.5 h-2.5" />
              3D
            </span>
          )}
        </span>
      </div>

      {warn && (
        <span
          className="absolute left-3 top-3 w-2.5 h-2.5 rounded-full bg-bp-warn ring-2 ring-white"
          title={warn.join('\n')}
          aria-label={`提醒：${warn.join('；')}`}
        />
      )}

      <div
        className={`absolute right-2.5 top-2.5 flex gap-1 transition-opacity ${
          menuOpen || !page.enabled ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
        }`}
      >
        <button
          type="button"
          onClick={() => actions.toggle(id)}
          title={page.enabled ? '隐藏这一页（导出时跳过）' : '显示这一页'}
          className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-white/95 text-bp-muted hover:text-bp-ink shadow-sm"
        >
          {page.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          data-menu-trigger
          onClick={(e) => {
            if (menuOpen) return actions.closeMenu();
            const r = e.currentTarget.getBoundingClientRect();
            actions.select(page.key);
            return actions.openMenu(page.key, { x: r.right - MENU_W, y: r.bottom + 4, anchorTop: r.top });
          }}
          title="更多操作"
          className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-white/95 text-bp-muted hover:text-bp-ink shadow-sm"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});

/** 菜单（fixed 定位，不会被滚动容器裁掉；靠近底部时向上弹） */
function ItemMenu({ menu, page, slide, actions }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y, visible: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = menu.y;
    if (top + h > vh - 8) top = Math.max(8, (menu.anchorTop ?? menu.y) - h - 4);
    const left = Math.max(8, Math.min(menu.x, vw - MENU_W - 8));
    setPos({ left, top, visible: true });
  }, [menu]);
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || e.target.closest?.('[data-menu-trigger]')) return;
      actions.closeMenu();
    };
    const onKey = (e) => e.key === 'Escape' && actions.closeMenu();
    const onResize = () => actions.closeMenu();
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [actions]);

  const id = page.slideId;
  const items = [
    canDuplicate(slide) && { label: '复制本页', icon: Copy, onClick: () => actions.duplicate(id) },
    canInsertViewAfter(slide) && {
      label: '在此后新增效果图页…', hint: '上传效果图，可一次选多张', icon: ImagePlus, onClick: () => actions.insertAfter(id),
    },
    (canDuplicate(slide) || canInsertViewAfter(slide)) && 'sep',
    { label: '上移一页', icon: ArrowUp, hint: 'Alt + ↑', onClick: () => actions.moveBy(id, -1) },
    { label: '下移一页', icon: ArrowDown, hint: 'Alt + ↓', onClick: () => actions.moveBy(id, 1) },
    'sep',
    { label: page.enabled ? '隐藏（不导出）' : '显示（导出这一页）', icon: page.enabled ? EyeOff : Eye, onClick: () => actions.toggle(id) },
    canDelete(slide)
      ? { label: '删除本页', icon: Trash2, danger: true, onClick: () => actions.remove(id) }
      : { label: '删除本页', icon: Trash2, disabled: true, hint: '公司固定页、方案封面、本案材料、服务团队只能隐藏' },
  ];
  return (
    <div
      ref={ref}
      className="fixed z-50"
      style={{ left: pos.left, top: pos.top, width: MENU_W, visibility: pos.visible ? 'visible' : 'hidden' }}
    >
      <MenuList items={items} onDone={() => actions.closeMenu()} />
    </div>
  );
}

/**
 * @param {{ pages:object[], pageNos:Map, selectedKey:string, slidesById:Map, horizontal?:boolean,
 *   onSelect(key), onToggle(id), onMove(id, targetId, place), onMoveBy(id, delta), onDuplicate(id), onDelete(id),
 *   onInsertAfter(id), warningCount:number, onNextWarning() }} props
 */
export default function SlideList({
  pages, pageNos, selectedKey, slidesById, horizontal = false, onSelect, onToggle, onMove, onMoveBy, onDuplicate, onDelete,
  onInsertAfter, warningCount = 0, onNextWarning,
}) {
  const scrollRef = useRef(null);
  const [menu, setMenu] = useState(null); // { key, x, y, anchorTop }
  const [drag, setDrag] = useState(null); // slideId
  const [drop, setDrop] = useState(null); // { key, place }
  const dragRef = useRef(null);
  const dropRef = useRef(null);
  dropRef.current = drop;

  // 回调全部经 ref 转发 → actions 对象永远不变，列表项 memo 有效
  const handlers = useRef({});
  handlers.current = { onSelect, onToggle, onMove, onMoveBy, onDuplicate, onDelete, onInsertAfter };
  const selectedRef = useRef(selectedKey);
  selectedRef.current = selectedKey;
  const fromList = useRef(false); // 在列表里点选的：已经看得见，不必自动滚动
  const horizontalRef = useRef(horizontal);
  horizontalRef.current = horizontal;
  const scrollPos = () => (horizontalRef.current ? scrollRef.current?.scrollLeft : scrollRef.current?.scrollTop) || 0;
  const actions = useMemo(
    () => ({
      select: (key) => {
        if (key !== selectedRef.current) fromList.current = true;
        handlers.current.onSelect(key);
      },
      toggle: (id) => handlers.current.onToggle(id),
      duplicate: (id) => handlers.current.onDuplicate(id),
      remove: (id) => handlers.current.onDelete(id),
      insertAfter: (id) => handlers.current.onInsertAfter(id),
      moveBy: (id, d) => handlers.current.onMoveBy(id, d),
      openMenu: (key, pos) => setMenu({ key, ...pos, scroll: scrollPos() }),
      closeMenu: () => setMenu(null),
      isDragging: () => !!dragRef.current,
      dragStart: (id) => {
        dragRef.current = id;
        setMenu(null);
        // 延后一帧再变淡，否则拖拽影像也会是半透明的
        requestAnimationFrame(() => dragRef.current && setDrag(id));
      },
      dragOver: (key, place) => setDrop((d) => (d && d.key === key && d.place === place ? d : { key, place })),
      drop: (targetId) => {
        const id = dragRef.current;
        const place = dropRef.current?.place || 'before';
        dragRef.current = null;
        setDrag(null);
        setDrop(null);
        if (id && id !== targetId) handlers.current.onMove(id, targetId, place);
      },
      dragEnd: () => {
        dragRef.current = null;
        setDrag(null);
        setDrop(null);
      },
    }),
    []
  );

  // 选中项滚进可见区（键盘翻页 / 外部跳转时）；程序滚动期间不关菜单
  const autoScrollUntil = useRef(0);
  useEffect(() => {
    const box = scrollRef.current;
    if (fromList.current) {
      fromList.current = false;
      return;
    }
    if (!box || !selectedKey) return;
    const el = box.querySelector(`[data-key="${CSS.escape(selectedKey)}"]`);
    if (!el) return;
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (horizontal) {
      if (r.left < b.left || r.right > b.right) {
        autoScrollUntil.current = Date.now() + 800;
        box.scrollBy({ left: r.left - b.left - (b.width - r.width) / 2, behavior: 'smooth' });
      }
    } else if (r.top < b.top + 30 || r.bottom > b.bottom) {
      autoScrollUntil.current = Date.now() + 800;
      box.scrollBy({ top: r.top - b.top - (b.height - r.height) / 2, behavior: 'smooth' });
    }
  }, [selectedKey, horizontal]);

  // 用户把列表滚动了一段 → 菜单跟原位置对不上了，关掉
  const closeOnScroll = useStableCallback(() => {
    if (menu && Date.now() > autoScrollUntil.current && Math.abs(scrollPos() - (menu.scroll || 0)) > 40) setMenu(null);
  });
  const groups = useMemo(() => groupSections(pages), [pages]);
  const menuPage = menu ? pages.find((p) => p.key === menu.key) : null;
  const thumbW = horizontal ? 150 : 200;

  const item = (page) => {
    const slide = slidesById.get(page.slideId);
    return (
      <ListItem
        key={page.key}
        page={page}
        pageNo={pageNos.get(page.key)}
        selected={page.key === selectedKey}
        dropPlace={drop && drop.key === page.key ? drop.place : null}
        menuOpen={menu?.key === page.key}
        dragging={drag === page.slideId}
        horizontal={horizontal}
        thumbW={thumbW}
        rootRef={scrollRef}
        is3d={slide?.tag === '3d'}
        actions={actions}
      />
    );
  };

  const header = (
    <div className={`flex items-center justify-between gap-2 ${horizontal ? 'pb-1.5' : 'px-3 pt-3 pb-2'}`}>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-bp-ink">页面</div>
        <div className="text-[10px] text-bp-faint">
          共 {pages.length} 页 · 导出 {pageNos.size} 页
        </div>
      </div>
      {warningCount > 0 && (
        <button
          type="button"
          onClick={onNextWarning}
          title="跳到下一处需要留意的页"
          className="inline-flex items-center gap-1 text-[11px] text-bp-warn bg-bp-warn/10 hover:bg-bp-warn/20 rounded-full pl-2 pr-1.5 py-0.5"
        >
          <TriangleAlert className="w-3 h-3" />
          {warningCount} 页留意
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );

  const menuNode = menu && menuPage && (
    <ItemMenu menu={menu} page={menuPage} slide={slidesById.get(menuPage.slideId)} actions={actions} />
  );

  if (horizontal) {
    return (
      <div className="bg-bp-tint/60 border-b border-bp-line px-3 pt-2 pb-2">
        {header}
        <div ref={scrollRef} onScroll={closeOnScroll} className="flex gap-1 overflow-x-auto thin-scroll pb-1">
          {pages.map(item)}
        </div>
        {menuNode}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {header}
      <div ref={scrollRef} onScroll={closeOnScroll} className="flex-1 min-h-0 overflow-y-auto thin-scroll px-2 pb-6">
        {groups.map((g, gi) => (
          <div key={`${g.section}-${gi}`}>
            <div className="sticky top-0 z-20 bg-bp-paper px-1.5 pt-2.5 pb-1 text-[10px] font-semibold tracking-[0.12em] text-bp-eyebrow">
              {g.label}
            </div>
            <div className="space-y-0.5">{g.items.map(({ page }) => item(page))}</div>
          </div>
        ))}
      </div>
      {menuNode}
    </div>
  );
}
