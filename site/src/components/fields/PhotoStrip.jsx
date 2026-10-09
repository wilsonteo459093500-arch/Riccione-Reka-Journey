// 照片：拍照 / 相册多选 → 本地压缩入库；点缩略图看大图、写说明、删除、调顺序
import { useRef, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import { Sheet, Spinner, useUI } from '../ui/UI.jsx';
import { useStore } from '../../lib/store.jsx';
import { useMediaUrl, useMediaRecord, setCaption, forgetMedia } from './media.js';

function Thumb({ id, onClick, size = 'md' }) {
  const url = useMediaUrl(id, 'thumb');
  const dim = size === 'sm' ? 'h-14 w-14' : 'h-[76px] w-[76px]';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${dim} shrink-0 overflow-hidden rounded-xl bg-cream-deep ring-1 ring-line active:scale-95`}
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" draggable={false} /> : <Spinner className="m-auto text-ink-faint" />}
    </button>
  );
}

function Viewer({ id, index, total, onClose, onDelete, onMove }) {
  const url = useMediaUrl(id, 'full');
  const [m] = useMediaRecord(id);
  const [cap, setCap] = useState(null);
  const caption = cap ?? m?.caption ?? '';
  return (
    <Sheet
      open
      onClose={async () => {
        if (cap != null && cap !== (m?.caption || '')) await setCaption(id, cap.trim());
        onClose();
      }}
      title={`照片 ${index + 1} / ${total}`}
      footer={
        <div className="flex gap-2">
          <button className="btn-ghost px-3" disabled={index === 0} onClick={() => onMove(-1)} aria-label="前移">
            <Icon name="ChevronLeft" />
          </button>
          <button className="btn-ghost px-3" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="后移">
            <Icon name="ChevronRight" />
          </button>
          <button className="btn flex-1 bg-fail/10 text-fail" onClick={onDelete}>
            <Icon name="Trash2" size={18} /> 删除照片
          </button>
        </div>
      }
    >
      <div className="overflow-hidden rounded-2xl bg-black/5">
        {url ? <img src={url} alt="" className="mx-auto max-h-[52dvh] w-auto object-contain" /> : <div className="flex h-60 items-center justify-center"><Spinner /></div>}
      </div>
      <label className="label mt-4">照片说明（可选，会印在报告上）</label>
      <input
        className="input"
        value={caption}
        placeholder="例：主卧衣柜左门板缝隙"
        onChange={(e) => setCap(e.target.value)}
        onBlur={() => cap != null && setCaption(id, cap.trim())}
      />
    </Sheet>
  );
}

/**
 * onChange 收到的是 updater：(prevIds) => nextIds（基于最新状态，避免异步回写旧数据）
 * @param {{ ids: string[], onChange: (updater)=>void, reportId: string, max?: number,
 *           compact?: boolean, label?: string }} props
 */
export default function PhotoStrip({ ids = [], onChange, reportId, max = 30, compact = false, label }) {
  const { addMediaFile, removeMedia } = useStore();
  const { toast, confirm } = useUI();
  const camRef = useRef(null);
  const libRef = useRef(null);
  const [busy, setBusy] = useState(0);
  const [open, setOpen] = useState(-1);
  const list = ids || [];
  const left = Math.max(0, max - list.length);

  const addFiles = async (fileList) => {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (!files.length) return;
    const take = files.slice(0, left);
    if (files.length > left) toast(`最多 ${max} 张，已加入前 ${take.length} 张`, 'warn');
    setBusy(take.length);
    const added = [];
    for (const f of take) {
      try {
        added.push(await addMediaFile(reportId, f, 'photo'));
      } catch (e) {
        toast(e.message || '照片处理失败', 'error');
      }
      setBusy((b) => b - 1);
    }
    // 用最新列表追加（处理期间用户可能改了别的东西）
    if (added.length) onChange((prev) => [...(prev || []), ...added]);
  };

  const del = async (i) => {
    const ok = await confirm({ title: '删除这张照片？', message: '删除后无法恢复。', okText: '删除', danger: true });
    if (!ok) return;
    const id = list[i];
    onChange((prev) => (prev || []).filter((x) => x !== id));
    forgetMedia(id);
    removeMedia([id]);
    setOpen(-1);
  };

  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const id = list[i];
    onChange((prev) => {
      const next = (prev || []).slice();
      const a = next.indexOf(id);
      const b = a + d;
      if (a < 0 || b < 0 || b >= next.length) return next;
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
    setOpen(j);
  };

  return (
    <div>
      {label && <div className="label">{label}</div>}
      <div className="flex flex-wrap items-center gap-2">
        {list.map((id, i) => (
          <Thumb key={id} id={id} size={compact ? 'sm' : 'md'} onClick={() => setOpen(i)} />
        ))}
        {Array.from({ length: busy }).map((_, i) => (
          <div key={`b${i}`} className={`${compact ? 'h-14 w-14' : 'h-[76px] w-[76px]'} flex items-center justify-center rounded-xl bg-cream-deep`}>
            <Spinner className="text-terra" />
          </div>
        ))}
        {left > 0 && (
          <>
            <button
              type="button"
              className={`${compact ? 'h-14 w-14' : 'h-[76px] w-[76px]'} flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-terra/40 bg-terra-soft/50 text-terra active:scale-95`}
              onClick={() => camRef.current?.click()}
            >
              <Icon name="Camera" size={compact ? 18 : 22} />
              {!compact && <span className="text-[11px] font-semibold">拍照</span>}
            </button>
            <button
              type="button"
              className={`${compact ? 'h-14 w-14' : 'h-[76px] w-[76px]'} flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-line bg-white text-ink-mute active:scale-95`}
              onClick={() => libRef.current?.click()}
            >
              <Icon name="ImagePlus" size={compact ? 18 : 22} />
              {!compact && <span className="text-[11px] font-semibold">相册</span>}
            </button>
          </>
        )}
      </div>
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={libRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {open >= 0 && list[open] && (
        <Viewer
          id={list[open]}
          index={open}
          total={list.length}
          onClose={() => setOpen(-1)}
          onDelete={() => del(open)}
          onMove={(d) => move(open, d)}
        />
      )}
    </div>
  );
}
