import React, { useCallback, useEffect, useRef } from 'react';
import { Copy, Trash2, ImagePlus, Image as ImageIcon, Layers, BookOpen, Palette, Users, Building2, Box } from 'lucide-react';
import { KIND_LABELS, canDelete, canDuplicate, canInsertViewAfter, inputFieldFor } from './ops.js';
import { Toggle, btnGhost } from './ui.jsx';
import { isTypingTarget } from './hooks.js';
import ViewInspector from './inspectors/ViewInspector.jsx';
import FloorInspector from './inspectors/FloorInspector.jsx';
import CoverInspector from './inspectors/CoverInspector.jsx';
import MaterialsInspector from './inspectors/MaterialsInspector.jsx';
import CompanyInspector from './inspectors/CompanyInspector.jsx';
import TeamInspector from './inspectors/TeamInspector.jsx';

// 右侧检查器：按页面类型给表单；所有修改走 change(p => …)（不可变更新，外壳负责撤销 / 自动保存）。
// 画布点选 → 定位到 data-field 对应的输入框；输入框获得焦点 → 画布高亮对应元素（data-hl 优先）。

const KIND_ICON = { view: ImageIcon, floor: Layers, designCover: BookOpen, materials: Palette, team: Users, company: Building2 };

/** 把焦点放到 data-field 输入框上（滚到中间 + 金色闪一下） */
export function focusFieldIn(root, field) {
  if (!root || !field) return false;
  const el = root.querySelector(`[data-field="${CSS.escape(field)}"]`);
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  try {
    el.focus({ preventScroll: true });
    if (typeof el.select === 'function' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      const len = el.value?.length ?? 0;
      el.setSelectionRange?.(len, len);
    }
  } catch {
    /* ignore */
  }
  el.animate?.(
    [{ boxShadow: '0 0 0 4px rgba(184,153,90,0.55)' }, { boxShadow: '0 0 0 0 rgba(184,153,90,0)' }],
    { duration: 900, easing: 'ease-out' }
  );
  return true;
}

/**
 * @param {{ project, page, slide, layout?:string, change(updater), notify, onGoTab, activeField?:string, pickNonce:number,
 *   onHighlight(field|null), openPolish(onlySlideIds?), onDuplicate(id), onDelete(id), onInsertAfter(id), onToggle(id),
 *   pageNo?:number }} props
 */
export default function Inspector({
  project, page, slide, layout, change, notify, onGoTab, activeField, pickNonce, onHighlight, openPolish, onDuplicate, onDelete,
  onInsertAfter, onToggle, pageNo,
}) {
  const rootRef = useRef(null);
  const focusField = useCallback((field) => focusFieldIn(rootRef.current, field), []);

  // 画布点选 → 定位输入框（pickNonce 每次点击 +1，重复点同一处也会再定位）
  useEffect(() => {
    if (!pickNonce || !activeField || !slide) return;
    const target = inputFieldFor(activeField, slide, project, layout);
    const raf = requestAnimationFrame(() => focusField(target));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickNonce]);

  if (!slide || !page) {
    return <div className="p-6 text-sm text-bp-faint">在左边选一页开始编辑</div>;
  }

  const Icon = slide.tag === '3d' ? Box : KIND_ICON[slide.kind] || ImageIcon;
  const props = { project, slide, page, change, notify, onGoTab, openPolish, layout, focusField };
  let body = null;
  switch (slide.kind) {
    case 'view':
      body = <ViewInspector {...props} />;
      break;
    case 'floor':
      body = <FloorInspector {...props} />;
      break;
    case 'designCover':
      body = <CoverInspector {...props} />;
      break;
    case 'materials':
      body = <MaterialsInspector {...props} />;
      break;
    case 'company':
      body = <CompanyInspector {...props} />;
      break;
    case 'team':
      body = <TeamInspector {...props} />;
      break;
    default:
      body = <p className="text-xs text-bp-faint">这种页面暂时不能在这里编辑。</p>;
  }

  const enabled = slide.enabled !== false;

  return (
    <div
      ref={rootRef}
      className="h-full min-h-0 overflow-y-auto thin-scroll"
      onFocusCapture={(e) => {
        const el = e.target.closest?.('[data-hl],[data-field]');
        if (el && rootRef.current?.contains(el)) onHighlight?.(el.dataset.hl || el.dataset.field || null);
      }}
      onKeyDown={(e) => {
        // Esc：离开输入框，← → 又可以翻页
        if (e.key === 'Escape' && isTypingTarget(e.target)) {
          e.target.blur();
          onHighlight?.(null);
        }
      }}
    >
      <div className="sticky top-0 z-30 bg-bp-paper border-b border-bp-line/70 px-4 pt-3 pb-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-bp-eyebrow">
              <Icon className="w-3.5 h-3.5" />
              {slide.tag === '3d' ? 'AI 立体图页' : KIND_LABELS[slide.kind] || '页面'}
              {pageNo ? <span className="text-bp-faint font-normal">· 第 {pageNo} 页</span> : <span className="text-bp-faint font-normal">· 已隐藏</span>}
            </div>
            <div className="mt-0.5 text-sm font-medium text-bp-ink truncate" title={page.label}>
              {page.label}
            </div>
          </div>
          <Toggle checked={enabled} onChange={() => onToggle(slide.id)} label={enabled ? '导出' : '不导出'} title="关掉 = 隐藏这一页，导出时跳过" />
        </div>
        {(canDuplicate(slide) || canInsertViewAfter(slide) || canDelete(slide)) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {canDuplicate(slide) && (
              <button type="button" className={btnGhost} onClick={() => onDuplicate(slide.id)}>
                <Copy className="w-3.5 h-3.5" />
                复制
              </button>
            )}
            {canInsertViewAfter(slide) && (
              <button type="button" className={btnGhost} onClick={() => onInsertAfter(slide.id)} title="上传效果图，插在这一页后面">
                <ImagePlus className="w-3.5 h-3.5" />
                后面加一页
              </button>
            )}
            {canDelete(slide) && (
              <button type="button" className={`${btnGhost} hover:!text-bp-danger hover:!border-bp-danger/40`} onClick={() => onDelete(slide.id)}>
                <Trash2 className="w-3.5 h-3.5" />
                删除
              </button>
            )}
          </div>
        )}
      </div>
      <div className="p-3 pb-10">{body}</div>
    </div>
  );
}
