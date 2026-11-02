// 材料清单：色板 / 名称 / 编号 / 待确认 / 用在哪几页；拖动排序（= 「本案材料」页顺序）、合并、删除、新增；右侧实时预览「本案材料」页
// English / 中英版：名称、编号下面多一行英文名（和名称一样大，跨名称 + 编号两栏；写进翻译记忆，所有页一起变；编号另外印，不用写进英文名）

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Trash2, Merge, GripVertical, ChevronUp, ChevronDown, ImagePlus, Loader2, Eye, EyeOff, CircleAlert, ArrowUpRight, X,
} from 'lucide-react';
import SlideCanvas from './SlideCanvas.jsx';
import EnInput from './editor/EnInput.jsx';
import { renderDeck } from '../engine/deck.js';
import { findFloor } from '../engine/model.js';
import { langOf, missingInPages, isMissWarning } from '../engine/lang.js';
import { needsEnglish, isLatinSource, materialsMissText, LANG_VERSION } from '../lib/langUi.js';
import { resolveUrl, metaOf } from '../store/assets.js';
import { uploadImage } from './editor/upload.js';
import {
  materialUsage, addMaterial, updateMaterial, moveMaterial, mergeMaterials, deleteMaterials,
} from '../lib/materials.js';
import { ensureMaterialsSlide, kindState, setKindEnabled } from '../lib/project.js';
import { ConfirmDialog, cls } from '../lib/ui.jsx';

const DRAG_TYPE = 'application/x-bp-material';
const matLabel = (m) => [m?.name, m?.code].map((s) => (s || '').trim()).filter(Boolean).join(' ') || '未命名材料';
const viewLabel = (s, project) => {
  const floor = findFloor(project, s.floorId);
  const title = [s.room, s.subtitle].filter(Boolean).join(' · ') || '效果图';
  return floor?.zh ? `${floor.zh} · ${title}` : title;
};

/** 量容器宽度（预览按宽度缩放） */
function useWidth(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** 表格列（宽屏）：English / 中英版的英文名在第二行，跨名称 + 编号两栏，列宽和华文版一样 */
const COLS = 'md:grid-cols-[28px_24px_64px_minmax(0,1.3fr)_minmax(0,1fr)_88px_92px_76px]';
/** English / 中英版：宽屏时这些放在第一行（和中文名称那一行对齐）；Tailwind 要看到完整的 class 名，所以逐个写出来 */
const AT_ROW1 = {
  4: 'md:col-start-4 md:row-start-1',
  5: 'md:col-start-5 md:row-start-1',
  6: 'md:col-start-6 md:row-start-1',
  7: 'md:col-start-7 md:row-start-1',
  8: 'md:col-start-8 md:row-start-1',
};

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'pending', label: '待确认' },
  { id: 'unused', label: '未使用' },
];

export default function MaterialsPanel({ project, onChange, notify, onGoTab, assetsVersion }) {
  const materials = project.materials || [];
  const usage = useMemo(() => materialUsage(project), [project]);
  const lang = langOf(project);
  const en = needsEnglish(lang);
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState('all');
  const [openUsage, setOpenUsage] = useState(null); // materialId
  const [confirm, setConfirm] = useState(null); // { kind:'delete'|'merge', ids }
  const [focusId, setFocusId] = useState(null); // 新增后聚焦名称
  const [uploading, setUploading] = useState(null); // materialId
  const [drag, setDrag] = useState(null); // { from, over, after }
  const fileRef = useRef(null);
  const fileTarget = useRef(null);

  // 已删除的材料从选择里去掉
  useEffect(() => {
    setSelected((sel) => {
      const ids = new Set(materials.map((m) => m.id));
      const next = new Set([...sel].filter((id) => ids.has(id)));
      return next.size === sel.size ? sel : next;
    });
  }, [materials]);

  const counts = {
    all: materials.length,
    pending: materials.filter((m) => m.pending).length,
    unused: materials.filter((m) => !(usage.get(m.id) || []).length).length,
  };
  const visible = materials
    .map((m, index) => ({ m, index }))
    .filter(({ m }) => (filter === 'pending' ? m.pending : filter === 'unused' ? !(usage.get(m.id) || []).length : true));
  const canDrag = filter === 'all';

  const toggleSel = (id) =>
    setSelected((sel) => {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allVisibleSelected = visible.length > 0 && visible.every(({ m }) => selected.has(m.id));

  const patch = (id, p) => onChange((proj) => updateMaterial(proj, id, p));

  function handleAdd() {
    let added = null;
    onChange((p) => {
      const r = addMaterial(p);
      added = r.material;
      return r.project;
    });
    if (added) {
      setFilter('all');
      setFocusId(added.id);
    }
  }

  async function replaceImage(id, file) {
    if (!file || !/^image\//.test(file.type || '')) {
      notify?.({ type: 'warn', text: '请选择图片文件（JPG / PNG）' });
      return;
    }
    setUploading(id);
    try {
      const src = await uploadImage(file, { projectId: project.id, maxEdge: 1600 });
      patch(id, { image: src });
    } catch (e) {
      notify?.({ type: 'error', text: `换图失败：${e?.message || e}` });
    } finally {
      setUploading(null);
    }
  }

  function doConfirm() {
    if (!confirm) return;
    const { kind, ids } = confirm;
    if (kind === 'delete') {
      onChange((p) => deleteMaterials(p, ids));
      notify?.({ type: 'ok', text: ids.length > 1 ? `已删除 ${ids.length} 种材料（可撤销）` : '已删除（可撤销）' });
    } else {
      onChange((p) => mergeMaterials(p, ids));
      notify?.({ type: 'ok', text: `已合并 ${ids.length} 种材料（可撤销）` });
    }
    setSelected(new Set());
    setConfirm(null);
  }

  // ---- 拖动排序 ----
  function onDragStart(e, index, rowEl) {
    if (!canDrag) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DRAG_TYPE, String(index));
    if (rowEl) e.dataTransfer.setDragImage(rowEl, 24, 24);
    setDrag({ from: index, over: null, after: false });
  }
  function onDragOver(e, index) {
    if (!drag || !Array.from(e.dataTransfer.types || []).includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    if (drag.over !== index || drag.after !== after) setDrag({ ...drag, over: index, after });
  }
  function onDrop(e) {
    if (!drag || drag.over == null) return;
    e.preventDefault();
    const ins = drag.over + (drag.after ? 1 : 0); // 插入到原列表的第 ins 个位置之前
    const to = ins > drag.from ? ins - 1 : ins;
    if (to !== drag.from) onChange((p) => moveMaterial(p, drag.from, to));
    setDrag(null);
  }

  const selIds = materials.filter((m) => selected.has(m.id)).map((m) => m.id);
  const confirmMats = confirm ? materials.filter((m) => confirm.ids.includes(m.id)) : [];
  const confirmRefs = confirmMats.reduce((n, m) => n + (usage.get(m.id) || []).length, 0);

  return (
    <div className="h-full overflow-y-auto thin-scroll">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px] items-start">
        {/* ---------------- 左：清单 ---------------- */}
        <div className="min-w-0 space-y-4">
          <div>
            <div className={cls.eyebrow}>Material Palette</div>
            <h2 className="font-serif text-2xl text-bp-ink mt-1">材料清单</h2>
            <p className="mt-1.5 text-xs text-bp-muted max-w-3xl leading-relaxed">
              这里的顺序就是「本案材料」页上的顺序（拖动左侧把手调整）；改名称、编号会同步到所有效果图页。同一种材料识别成了两条？勾选后「合并」。
              {en && ` ${LANG_VERSION[lang]}：名称下面的 EN 是英文名，用简单的英文（如 Light Oak），编号会另外印出来。`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleAdd} className={cls.btnPrimary}>
              <Plus size={15} /> 新增材料
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ kind: 'merge', ids: selIds })}
              disabled={selIds.length < 2}
              className={cls.btnGhost}
              title="勾选两种以上：并入清单里排在最前面的那一种"
            >
              <Merge size={15} /> 合并所选{selIds.length >= 2 ? `（${selIds.length}）` : ''}
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ kind: 'delete', ids: selIds })}
              disabled={!selIds.length}
              className={`${cls.btnGhost} hover:!text-bp-danger`}
            >
              <Trash2 size={15} /> 删除所选{selIds.length ? `（${selIds.length}）` : ''}
            </button>
            {selIds.length > 0 && (
              <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-bp-faint hover:text-bp-ink inline-flex items-center gap-0.5">
                <X size={13} /> 取消选择
              </button>
            )}
            <div className="flex-1" />
            <div className="flex gap-1 rounded-xl border border-bp-line bg-white p-1" role="group" aria-label="筛选">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                    filter === f.id ? 'bg-bp-dark text-bp-light' : 'text-bp-muted hover:bg-bp-tint'
                  }`}
                >
                  {f.label}
                  <span className="ml-1 opacity-70 tabular-nums">{counts[f.id]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={`${cls.card} overflow-hidden`}>
            {/* 表头 */}
            <div className={`hidden md:grid ${COLS} gap-3 items-center px-3 py-2 border-b border-bp-line bg-bp-tint/60 text-[11px] text-bp-faint`}>
              <span />
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={() =>
                  setSelected((sel) => {
                    const next = new Set(sel);
                    visible.forEach(({ m }) => (allVisibleSelected ? next.delete(m.id) : next.add(m.id)));
                    return next;
                  })
                }
                className="w-4 h-4 accent-[#B8995A]"
                aria-label="全选"
                disabled={!visible.length}
              />
              <span>色板</span>
              <span>名称</span>
              <span>编号</span>
              <span>状态</span>
              <span>用在</span>
              <span className="text-right">排序</span>
            </div>

            {visible.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-bp-faint">
                {materials.length ? '没有符合筛选的材料' : 'PDF 里没有识别到材料 —— 点「新增材料」手动添加'}
              </div>
            ) : (
              <ul onDragEnd={() => setDrag(null)}>
                {visible.map(({ m, index }) => (
                  <MaterialRow
                    key={m.id}
                    m={m}
                    index={index}
                    total={materials.length}
                    project={project}
                    used={usage.get(m.id) || []}
                    selected={selected.has(m.id)}
                    onToggleSel={() => toggleSel(m.id)}
                    onPatch={(p) => patch(m.id, p)}
                    onMove={(d) => onChange((p) => moveMaterial(p, index, index + d))}
                    onDelete={() => setConfirm({ kind: 'delete', ids: [m.id] })}
                    onPickImage={() => {
                      fileTarget.current = m.id;
                      fileRef.current?.click();
                    }}
                    onDropImage={(file) => replaceImage(m.id, file)}
                    uploading={uploading === m.id}
                    usageOpen={openUsage === m.id}
                    onToggleUsage={() => setOpenUsage((o) => (o === m.id ? null : m.id))}
                    onGoSlide={(slideId) => onGoTab?.('pages', slideId)}
                    autoFocus={focusId === m.id}
                    onFocused={() => setFocusId(null)}
                    canDrag={canDrag}
                    dragState={drag}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    en={en}
                    change={onChange}
                  />
                ))}
              </ul>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f && fileTarget.current) replaceImage(fileTarget.current, f);
            }}
          />
          <p className="text-[11px] text-bp-faint">
            小技巧：把图片文件直接拖到色板上就能换图；「待确认」的材料在页面上会标注（待确认），方便和客户确认。
          </p>
        </div>

        {/* ---------------- 右：「本案材料」页预览 ---------------- */}
        <MaterialsPreview project={project} onChange={onChange} onGoTab={onGoTab} assetsVersion={assetsVersion} />
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'delete' ? (confirmMats.length > 1 ? `删除 ${confirmMats.length} 种材料？` : '删除这种材料？') : `合并 ${confirmMats.length} 种材料？`}
          danger={confirm.kind === 'delete'}
          confirmText={confirm.kind === 'delete' ? '删除' : '合并'}
          onConfirm={doConfirm}
          onCancel={() => setConfirm(null)}
        >
          {confirm.kind === 'delete' ? (
            <>
              <p>
                {confirmMats.map((m) => `「${matLabel(m)}」`).join('、')}
                {confirmRefs ? `在 ${confirmRefs} 处效果图页上被引用，删除后这些页面上的这一条材料也会去掉。` : '没有被任何页面引用。'}
              </p>
              <p className="text-xs text-bp-faint">删错了可以按 ⌘Z / Ctrl+Z 撤销。</p>
            </>
          ) : (
            <>
              <p>
                保留「<span className="text-bp-ink">{matLabel(confirmMats[0])}</span>」，其余{' '}
                {confirmMats
                  .slice(1)
                  .map((m) => `「${matLabel(m)}」`)
                  .join('、')}{' '}
                的引用都会改成它。
              </p>
              <p className="text-xs text-bp-faint">保留项缺图 / 缺编号时会从其余的补上；任一「待确认」→ 合并后仍待确认。</p>
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

function MaterialRow({
  m, index, total, project, used, selected, onToggleSel, onPatch, onMove, onDelete, onPickImage, onDropImage, uploading,
  usageOpen, onToggleUsage, onGoSlide, autoFocus, onFocused, canDrag, dragState, onDragStart, onDragOver, onDrop, en = false, change,
}) {
  const rowRef = useRef(null);
  const nameRef = useRef(null);
  const [fileOver, setFileOver] = useState(false);
  const url = m.image ? resolveUrl(m.image) : null;

  useEffect(() => {
    if (!autoFocus) return;
    nameRef.current?.focus();
    rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    onFocused?.();
  }, [autoFocus, onFocused]);

  const isOver = dragState && dragState.over === index && dragState.from !== index;
  const dragging = dragState && dragState.from === index;
  // English / 中英版：英文名占第二行（名称本来就是英文 / 还没名称时没有）；宽屏时左边三列跨两行居中，右边三列对齐第一行
  const showEn = en && !!String(m.name || '').trim() && !isLatinSource(project, m.name, 'material');
  const span = showEn ? 'md:row-span-2' : '';
  const at = (col) => (en ? AT_ROW1[col] : '');

  return (
    <li
      ref={rowRef}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={onDrop}
      className={`relative border-b border-bp-line last:border-b-0 ${selected ? 'bg-bp-gold/5' : 'bg-white'} ${dragging ? 'opacity-40' : ''}`}
    >
      {isOver && <div className={`absolute left-0 right-0 h-0.5 bg-bp-gold z-10 ${dragState.after ? '-bottom-px' : '-top-px'}`} />}
      <div className={`grid grid-cols-[28px_24px_64px_minmax(0,1fr)] ${COLS} gap-x-3 gap-y-2 items-center px-3 py-2.5`}>
        <span
          draggable={canDrag}
          onDragStart={(e) => onDragStart(e, index, rowRef.current)}
          className={`flex items-center justify-center h-8 rounded-md text-bp-faint ${span} ${canDrag ? 'cursor-grab active:cursor-grabbing hover:bg-bp-tint hover:text-bp-ink' : 'opacity-30'}`}
          title={canDrag ? '拖动排序' : '筛选时不能拖动排序'}
          aria-hidden="true"
        >
          <GripVertical size={16} />
        </span>
        <input type="checkbox" checked={selected} onChange={onToggleSel} className={`w-4 h-4 accent-[#B8995A] ${span}`} aria-label={`选择 ${matLabel(m)}`} />
        <button
          type="button"
          onClick={onPickImage}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.types || []).includes('Files')) {
              e.preventDefault();
              e.stopPropagation();
              setFileOver(true);
            }
          }}
          onDragLeave={() => setFileOver(false)}
          onDrop={(e) => {
            const f = e.dataTransfer.files?.[0];
            setFileOver(false);
            if (!f) return;
            e.preventDefault();
            e.stopPropagation();
            onDropImage(f);
          }}
          className={`relative w-16 h-16 rounded-lg overflow-hidden border bg-bp-tint group focus:outline-none focus-visible:ring-2 focus-visible:ring-bp-gold ${span} ${
            fileOver ? 'border-bp-gold ring-2 ring-bp-gold/40' : 'border-bp-line'
          }`}
          title="点击或拖入图片更换色板"
          aria-label={`更换「${matLabel(m)}」的色板图`}
        >
          {url ? <img src={url} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" /> : null}
          <span
            className={`absolute inset-0 flex items-center justify-center transition-opacity ${
              uploading ? 'bg-black/40 text-white opacity-100' : url ? 'bg-black/35 text-white opacity-0 group-hover:opacity-100' : 'text-bp-faint'
            }`}
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
          </span>
        </button>

        {/* 名称 +（English / 中英版）英文名 +（窄屏）编号；宽屏时英文名在第二行，跨名称、编号两栏 */}
        <div className="min-w-0 md:contents">
          <input
            ref={nameRef}
            value={m.name || ''}
            onChange={(e) => onPatch({ name: e.target.value })}
            placeholder="材料名称，如：浅川橡"
            className={`${cls.input} font-serif ${at(4)}`}
            aria-label="材料名称"
          />
          {showEn && (
            <div className="mt-1.5 md:mt-0 min-w-0 md:col-start-4 md:col-span-2 md:row-start-2">
              <EnInput project={project} zh={m.name} kind="material" change={change} size="md" inputClass="font-serif" />
            </div>
          )}
          <input
            value={m.code || ''}
            onChange={(e) => onPatch({ code: e.target.value })}
            placeholder="编号，如 AG273"
            className={`${cls.input} mt-2 md:mt-0 font-mono text-xs uppercase ${at(5)}`}
            aria-label="材料编号"
          />
        </div>

        <div className={`col-start-4 ${en ? at(6) : 'md:col-start-auto'} flex md:block items-center gap-2 flex-wrap`}>
          <button
            type="button"
            onClick={() => onPatch({ pending: !m.pending })}
            aria-pressed={!!m.pending}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-colors ${
              m.pending ? 'bg-bp-warn/15 border-bp-warn/60 text-bp-warn' : 'bg-white border-bp-line text-bp-faint hover:text-bp-ink hover:border-bp-rule'
            }`}
            title="切换「待确认」"
          >
            <CircleAlert size={12} />
            {m.pending ? '待确认' : '已确认'}
          </button>
          <button
            type="button"
            onClick={onToggleUsage}
            aria-expanded={usageOpen}
            className={`md:hidden inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border ${used.length ? 'border-bp-line text-bp-muted' : 'border-dashed border-bp-line text-bp-faint'}`}
          >
            {used.length ? `用在 ${used.length} 页` : '未使用'}
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleUsage}
          aria-expanded={usageOpen}
          disabled={!used.length}
          className={`hidden md:inline-flex ${at(7)} items-center justify-between gap-1 px-2 py-1 rounded-lg text-xs border transition-colors ${
            used.length
              ? usageOpen
                ? 'bg-bp-dark text-bp-light border-bp-dark'
                : 'border-bp-line text-bp-muted hover:border-bp-rule hover:text-bp-ink'
              : 'border-dashed border-bp-line text-bp-faint cursor-default'
          }`}
          title={used.length ? '看看用在了哪些页面' : '没有效果图页引用它'}
        >
          {used.length ? `${used.length} 页` : '未使用'}
          {used.length > 0 && (usageOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
        </button>

        <div className={`hidden md:flex ${at(8)} items-center justify-end gap-0.5`}>
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className={`${cls.iconBtn} !w-6`} aria-label="上移" title="上移">
            <ChevronUp size={15} />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className={`${cls.iconBtn} !w-6`} aria-label="下移" title="下移">
            <ChevronDown size={15} />
          </button>
          <button type="button" onClick={onDelete} className={`${cls.iconBtn} !w-7 hover:!text-bp-danger`} aria-label="删除" title="删除">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {usageOpen && used.length > 0 && (
        <div className="px-3 pb-3 md:pl-[152px]">
          <div className="flex flex-wrap gap-1.5">
            {used.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onGoSlide(s.id)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-colors ${
                  s.enabled === false ? 'border-dashed border-bp-line text-bp-faint' : 'border-bp-line bg-bp-tint text-bp-muted hover:text-bp-ink hover:border-bp-rule'
                }`}
                title="到「页面」里打开这一页"
              >
                {viewLabel(s, project)}
                {s.enabled === false && <span className="text-[10px]">（已隐藏）</span>}
                <ArrowUpRight size={12} />
              </button>
            ))}
          </div>
        </div>
      )}
      {/* 窄屏：排序 / 删除放在行尾 */}
      <div className="md:hidden flex items-center justify-end gap-0.5 px-3 pb-2 -mt-1">
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className={cls.iconBtn} aria-label="上移">
          <ChevronUp size={15} />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className={cls.iconBtn} aria-label="下移">
          <ChevronDown size={15} />
        </button>
        <button type="button" onClick={onDelete} className={`${cls.iconBtn} hover:!text-bp-danger`} aria-label="删除">
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}

/** 「本案材料」页实时预览（与导出同一份渲染） */
function MaterialsPreview({ project, onChange, onGoTab, assetsVersion }) {
  const boxRef = useRef(null);
  const width = useWidth(boxRef);
  const state = kindState(project, 'materials');
  const pages = useMemo(() => {
    // 只渲染「本案材料」页，省去整套排版
    const slide = (project.slides || []).find((s) => s.kind === 'materials');
    if (!slide) return [];
    return renderDeck({ ...project, slides: [{ ...slide, enabled: true }] }, { meta: metaOf });
    // translations：English / 中英版改了英文名要马上反映；assetsVersion：新图入库后重新取尺寸 / URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.materials, project.info, project.slides, project.translations, assetsVersion]);
  const slideId = (project.slides || []).find((s) => s.kind === 'materials')?.id;
  // 缺英文那条提醒换成这个标签页的说法（引擎那句说「在右侧填」，这里不对）；其余提醒原样
  const warnings = [...new Set(pages.flatMap((pg) => (pg.warnings || []).filter((w) => !isMissWarning(w))))];
  const missText = materialsMissText(langOf(project), missingInPages(pages));

  return (
    <aside className="min-w-0 xl:sticky xl:top-6 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-bp-faint">「本案材料」页预览{pages.length > 1 ? ` · ${pages.length} 页` : ''}</div>
        {slideId && (
          <button type="button" onClick={() => onGoTab?.('pages', slideId)} className="inline-flex items-center gap-0.5 text-xs text-bp-eyebrow hover:underline">
            在「页面」里打开 <ArrowUpRight size={12} />
          </button>
        )}
      </div>
      <div ref={boxRef} className="space-y-3">
        {state === 'none' ? (
          <div className={`${cls.card} p-5 text-sm text-bp-muted`}>
            整套里没有「本案材料」页。
            <button type="button" onClick={() => onChange((p) => ensureMaterialsSlide(p))} className={`${cls.btnGhost} mt-3 w-full`}>
              <Plus size={15} /> 加回「本案材料」页
            </button>
          </div>
        ) : (
          <>
            {state === 'off' && (
              <div className="flex items-center gap-2 rounded-xl border border-bp-line bg-bp-tint px-3 py-2 text-xs text-bp-muted">
                <EyeOff size={14} className="shrink-0" />
                <span className="flex-1">这一页已隐藏，不会导出</span>
                <button type="button" onClick={() => onChange((p) => setKindEnabled(p, 'materials', true))} className="inline-flex items-center gap-1 text-bp-eyebrow hover:underline">
                  <Eye size={13} /> 显示
                </button>
              </div>
            )}
            {width > 0 &&
              pages.map((pg) => (
                <div key={pg.key} className={`rounded-xl overflow-hidden border border-bp-line shadow-sm ${state === 'off' ? 'opacity-50' : ''}`}>
                  <SlideCanvas slide={pg} width={width} resolveUrl={resolveUrl} />
                </div>
              ))}
            {(warnings.length > 0 || missText) && (
              <ul className="text-[11px] text-bp-warn leading-relaxed space-y-0.5">
                {warnings.map((w) => (
                  <li key={w}>· {w}</li>
                ))}
                {missText && (
                  <li>
                    · {missText}
                    <button type="button" onClick={() => onGoTab?.('pages')} className="ml-1 inline-flex items-center gap-0.5 text-bp-eyebrow hover:underline">
                      去页面 <ArrowUpRight size={11} />
                    </button>
                  </li>
                )}
              </ul>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
