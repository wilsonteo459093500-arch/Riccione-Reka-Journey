import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Images, X, Loader2, RotateCcw, Check, ImageOff } from 'lucide-react';
import { metaOf, resolveUrl } from '../../store/assets.js';
import { projectImages } from './ops.js';
import { requestThumbs, thumbUrl, useThumbsSig } from './thumbs.js';
import { uploadImage } from './upload.js';
import { btnGhost } from './ui.jsx';

// 图片字段：预览 + 上传新图 + 从本案已用过的图片里挑 + 移除 / 恢复自动。
// onChange(src | null)；上传的图存进 IndexedDB（storeBlob），只把 'asset:<id>' 写进项目。

const GROUPS = [
  { id: 'all', label: '全部' },
  { id: 'view', label: '效果图' },
  { id: 'floor', label: '楼层 / 平面' },
  { id: '3d', label: '3D' },
  { id: 'board', label: 'Board' },
];

function Picker({ project, current, onPick, onClose }) {
  const [group, setGroup] = useState('all');
  const all = useMemo(() => projectImages(project), [project]);
  const list = all.filter((im) => group === 'all' || im.group === group || (group === 'floor' && im.group === 'plan'));
  const srcs = useMemo(() => list.map((im) => im.src), [list]);
  useThumbsSig(srcs);
  useEffect(() => requestThumbs(srcs), [srcs]);
  const groups = GROUPS.filter((g) => g.id === 'all' || all.some((im) => im.group === g.id || (g.id === 'floor' && im.group === 'plan')));
  return (
    <div className="mt-2 rounded-xl border border-bp-line bg-bp-tint/60 p-2">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap gap-1">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroup(g.id)}
              className={`px-2 py-0.5 rounded-md text-[11px] ${group === g.id ? 'bg-bp-dark text-bp-light' : 'text-bp-muted hover:bg-white'}`}
            >
              {g.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="text-bp-faint hover:text-bp-ink" title="收起">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {list.length ? (
        <div className="grid grid-cols-3 gap-1.5 max-h-64 overflow-y-auto thin-scroll pr-0.5">
          {list.map((im) => {
            const url = thumbUrl(im.src);
            const active = im.src === current;
            return (
              <button
                key={im.src}
                type="button"
                title={im.label}
                onClick={() => onPick(im.src)}
                className={`relative aspect-[16/10] rounded-md overflow-hidden bg-bp-line/40 ring-offset-1 ${
                  active ? 'ring-2 ring-bp-gold' : 'hover:ring-2 hover:ring-bp-rule'
                }`}
              >
                {url ? <img src={url} alt="" className="w-full h-full object-cover" draggable={false} /> : <span className="absolute inset-0 shimmer" />}
                {active && (
                  <span className="absolute right-1 top-1 w-4 h-4 rounded-full bg-bp-gold text-white inline-flex items-center justify-center">
                    <Check className="w-3 h-3" />
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 pt-3 pb-0.5 text-[9px] text-white truncate text-left">
                  {im.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-bp-faint py-3 text-center">这一类还没有图片</p>
      )}
    </div>
  );
}

/**
 * @param {{ project, src:string|null, onChange(src|null), notify, field?:string, autoSrc?:string|null, autoLabel?:string,
 *   removeLabel?:string, onRemove?:()=>void, hint?:string, lowResWidth?:number, maxEdge?:number }} props
 *   autoSrc：src 为空时实际显示的图（楼层页 = 该层第一张效果图），配合 removeLabel = '恢复自动'
 */
export default function ImageField({
  project, src, onChange, notify, field = 'image', autoSrc = null, autoLabel = '', removeLabel, onRemove, hint, lowResWidth = 1600,
  maxEdge = 3840,
}) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const shown = src || autoSrc;
  const url = shown ? resolveUrl(shown) : null;
  const meta = shown ? metaOf(shown) : null;
  const low = meta?.w && meta.w < lowResWidth;

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const next = await uploadImage(file, { projectId: project.id, maxEdge });
      onChange(next);
      setPicking(false);
    } catch (err) {
      notify?.({ type: 'error', text: err.message || '图片上传失败' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex gap-3">
        <button
          type="button"
          data-field={field}
          onClick={() => setPicking((p) => !p)}
          title="点一下从本案图片里换"
          className="relative w-32 shrink-0 aspect-video rounded-lg overflow-hidden bg-bp-tint border border-bp-line hover:ring-2 hover:ring-bp-gold/60 focus:outline-none focus:ring-2 focus:ring-bp-gold"
        >
          {url ? (
            <img src={url} alt="" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[10px] text-bp-faint">
              <ImageOff className="w-4 h-4" />
              还没有图
            </span>
          )}
          {!src && autoSrc && (
            <span className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[9px] text-bp-muted">{autoLabel || '自动'}</span>
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 className="w-4 h-4 animate-spin text-bp-muted" />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={btnGhost} onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="w-3.5 h-3.5" />
              上传新图
            </button>
            <button type="button" className={`${btnGhost} ${picking ? '!border-bp-gold !text-bp-ink' : ''}`} onClick={() => setPicking((p) => !p)}>
              <Images className="w-3.5 h-3.5" />
              本案图片
            </button>
            {removeLabel && src && (
              <button type="button" className={btnGhost} onClick={() => (onRemove ? onRemove() : onChange(null))}>
                <RotateCcw className="w-3.5 h-3.5" />
                {removeLabel}
              </button>
            )}
          </div>
          {meta?.w ? (
            <span className={`text-[11px] ${low ? 'text-bp-warn' : 'text-bp-faint'}`}>
              {meta.w} × {meta.h}
              {low ? ' · 分辨率偏低，满版可能会糊' : ''}
            </span>
          ) : null}
          {hint && <span className="text-[11px] text-bp-faint leading-snug">{hint}</span>}
        </div>
      </div>
      {picking && (
        <Picker
          project={project}
          current={src}
          onPick={(s) => {
            onChange(s);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </div>
  );
}
