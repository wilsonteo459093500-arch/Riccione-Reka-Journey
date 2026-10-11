import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Plus, Check, Upload, Loader2, X, TriangleAlert } from 'lucide-react';
import { uid } from '../../engine/model.js';
import { resolveUrl } from '../../store/assets.js';
import { newMaterial } from './ops.js';
import { requestThumbs, thumbUrl, useThumbsSig } from './thumbs.js';
import { uploadImage } from './upload.js';
import { useDismiss } from './hooks.js';
import { inputCls, btnGhost, card } from './ui.jsx';

// 材料选择：可搜索的下拉（色板缩略图 + 名称 + 编号），底部「新建材料」就地添加。
// onPick(materialId)；onCreate(material) —— 由上层一步完成「加进材料清单 + 放进这一行」。

export function Swatch({ mat, size = 28 }) {
  const url = mat?.image ? thumbUrl(mat.image) : null;
  return (
    <span className="shrink-0 rounded-[4px] overflow-hidden bg-[#E9E5DC] border border-black/5 inline-block" style={{ width: size, height: size }}>
      {url && <img src={url} alt="" className="w-full h-full object-cover" draggable={false} />}
    </span>
  );
}

const matText = (m) => [m?.name, m?.code].filter(Boolean).join(' ');

function CreateForm({ project, initialName, notify, onCreate, onCancel }) {
  const [name, setName] = useState(initialName || '');
  const [code, setCode] = useState('');
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const ok = name.trim() || code.trim();

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      setImage(await uploadImage(file, { projectId: project.id, maxEdge: 900 }));
    } catch (err) {
      notify?.({ type: 'error', text: err.message || '色板上传失败' });
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    if (!ok) return;
    onCreate(newMaterial(uid('m'), { name, code, image }));
  }

  return (
    <div className="p-2.5 space-y-2 border-t border-bp-line bg-bp-tint/60">
      <div className="text-[11px] font-semibold text-bp-muted">新建材料</div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title="上传色板照片（可选）"
          className="relative w-14 h-14 shrink-0 rounded-md overflow-hidden border border-dashed border-bp-rule bg-white text-bp-faint hover:text-bp-ink inline-flex items-center justify-center"
        >
          {image ? <img src={resolveUrl(image) || undefined} alt="" className="w-full h-full object-cover" /> : <Upload className="w-4 h-4" />}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 className="w-4 h-4 animate-spin" />
            </span>
          )}
        </button>
        <div className="flex-1 min-w-0 space-y-1.5">
          <input
            autoFocus
            className={inputCls}
            placeholder="名称，如 浅川橡"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <input
            className={`${inputCls} uppercase`}
            placeholder="编号，如 AG273（可空）"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
      </div>
      <div className="flex justify-end gap-1.5">
        <button type="button" className={btnGhost} onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          disabled={!ok || busy}
          onClick={submit}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-bp-dark text-bp-light text-xs disabled:opacity-50"
        >
          <Check className="w-3.5 h-3.5" />
          添加并选用
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </div>
  );
}

/**
 * @param {{ project, value?:string|null, onPick(id), onCreate(mat), notify, field?:string, addMode?:boolean,
 *   open?:boolean, onOpenChange?(open) }} props
 *   addMode：按钮显示「＋ 添加材料」，选中后新增一行
 */
export default function MaterialPicker({ project, value, onPick, onCreate, notify, field, addMode = false, open: openProp, onOpenChange }) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v) => {
    setOpenState(v);
    onOpenChange?.(v);
  };
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [creating, setCreating] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);
  useDismiss(ref, open, () => close());

  const materials = project.materials || [];
  const current = value ? materials.find((m) => m.id === value) || null : null;
  const missing = !!value && !current;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return materials;
    return materials.filter((m) => matText(m).toLowerCase().includes(s));
  }, [materials, q]);
  const srcs = useMemo(() => materials.map((m) => m.image).filter(Boolean), [materials]);
  useThumbsSig(open || current ? srcs : []);
  useEffect(() => {
    if (open) requestThumbs(srcs);
    else if (current?.image) requestThumbs([current.image]);
  }, [open, srcs, current]);
  useEffect(() => setHi(0), [q]);

  function close() {
    setOpen(false);
    setQ('');
    setCreating(false);
  }

  function pick(id) {
    onPick(id);
    close();
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[hi]) pick(filtered[hi].id);
      else if (q.trim()) setCreating(true);
    }
  }

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  // 打开时把整个下拉滚进检查器的可见区
  const dropRef = useRef(null);
  useEffect(() => {
    if (open) requestAnimationFrame(() => dropRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }, [open, creating]);

  return (
    <div ref={ref} className="relative min-w-0">
      {addMode ? (
        <button type="button" data-field={field} onClick={() => (open ? close() : setOpen(true))} className={`${btnGhost} w-full !justify-start`}>
          <Plus className="w-3.5 h-3.5" />
          添加材料
        </button>
      ) : (
        <button
          type="button"
          data-field={field}
          onClick={() => (open ? close() : setOpen(true))}
          className={`w-full flex items-center gap-2 rounded-lg border bg-white px-2 py-1.5 text-left hover:border-bp-rule focus:outline-none focus:border-bp-gold focus:ring-2 focus:ring-bp-gold/20 ${
            missing ? 'border-bp-danger/60' : 'border-bp-line'
          }`}
        >
          {missing ? (
            <TriangleAlert className="w-4 h-4 text-bp-danger shrink-0" />
          ) : (
            <Swatch mat={current} size={24} />
          )}
          <span className="flex-1 min-w-0">
            {missing ? (
              <span className="block text-xs text-bp-danger">材料已被删除 · 重新选择</span>
            ) : current ? (
              <span className="block text-sm text-bp-ink truncate">
                {current.name || '未命名材料'}
                {current.code && <span className="ml-1.5 text-[11px] tracking-wider text-bp-muted">{current.code}</span>}
                {current.pending && <span className="ml-1.5 text-[10px] text-bp-warn">待确认</span>}
              </span>
            ) : (
              <span className="block text-sm text-bp-faint">选择材料</span>
            )}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-bp-faint shrink-0" />
        </button>
      )}

      {open && (
        <div ref={dropRef} className={`${card} absolute z-40 left-0 right-0 mt-1 shadow-xl overflow-hidden min-w-[260px]`}>
          {!creating && (
            <>
              <div className="p-2 border-b border-bp-line">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-bp-faint absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    autoFocus
                    className={`${inputCls} pl-8`}
                    placeholder={`搜索 ${materials.length} 种材料（名称 / 编号）`}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={onKey}
                  />
                </div>
              </div>
              <div ref={listRef} className="max-h-64 overflow-y-auto thin-scroll py-1">
                {filtered.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    data-i={i}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => pick(m.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left ${i === hi ? 'bg-bp-tint' : ''}`}
                  >
                    <Swatch mat={m} size={30} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-bp-ink truncate">{m.name || '未命名材料'}</span>
                      <span className="block text-[11px] tracking-wider text-bp-muted">
                        {m.code || '—'}
                        {m.pending && <span className="ml-1.5 tracking-normal text-bp-warn">待确认</span>}
                      </span>
                    </span>
                    {m.id === value && <Check className="w-4 h-4 text-bp-gold shrink-0" />}
                  </button>
                ))}
                {!filtered.length && (
                  <p className="px-3 py-3 text-xs text-bp-faint">{materials.length ? '没有找到，可以直接新建 ↓' : '材料清单还是空的，先新建一种 ↓'}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-bp-eyebrow font-medium border-t border-bp-line hover:bg-bp-tint"
              >
                <Plus className="w-3.5 h-3.5" />
                新建材料{q.trim() ? `「${q.trim()}」` : ''}
              </button>
            </>
          )}
          {creating && (
            <CreateForm
              project={project}
              initialName={q.trim()}
              notify={notify}
              onCancel={() => setCreating(false)}
              onCreate={(mat) => {
                onCreate(mat);
                close();
              }}
            />
          )}
          {creating && (
            <button type="button" onClick={close} className="absolute right-2 top-2 text-bp-faint hover:text-bp-ink" title="关闭">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
