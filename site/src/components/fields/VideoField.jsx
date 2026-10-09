// 视频（如退场视频）：录像 / 选择 → 保留原文件供分享，截一帧做报告封面
import { useRef, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import { Spinner, useUI } from '../ui/UI.jsx';
import { useStore } from '../../lib/store.jsx';
import { useMediaUrl, useMediaRecord, forgetMedia } from './media.js';
import { fmtDuration, fmtBytes } from '../../lib/images.js';

const BIG = 150 * 1024 * 1024;

export default function VideoField({ value, onChange, reportId }) {
  const { addMediaFile, removeMedia } = useStore();
  const { toast, confirm } = useUI();
  const recRef = useRef(null);
  const pickRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const poster = useMediaUrl(value, 'poster');
  const [m] = useMediaRecord(value);

  const add = async (file) => {
    if (!file) return;
    if (file.size > BIG) {
      const ok = await confirm({
        title: '视频比较大',
        message: `这个视频 ${fmtBytes(file.size)}，存进手机浏览器会占不少空间。\n建议录 30–60 秒的短视频。要继续吗？`,
        okText: '继续',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const id = await addMediaFile(reportId, file, 'video');
      if (value) {
        forgetMedia(value);
        removeMedia([value]);
      }
      onChange(id);
    } catch (e) {
      toast(e.message || '视频处理失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    const ok = await confirm({ title: '删除这个视频？', okText: '删除', danger: true });
    if (!ok) return;
    forgetMedia(value);
    removeMedia([value]);
    onChange('');
  };

  return (
    <div>
      {value ? (
        <div className="flex items-center gap-3 rounded-xl bg-white p-2 ring-1 ring-line">
          <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-black/80">
            {poster && <img src={poster} alt="" className="h-full w-full object-cover opacity-90" />}
            <Icon name="Play" size={22} className="absolute inset-0 m-auto text-white drop-shadow" />
          </div>
          <div className="min-w-0 flex-1 text-[13px] text-ink-soft">
            <div className="font-semibold text-ink">已添加视频</div>
            <div>
              {fmtDuration(m?.duration)} {m?.blob ? `· ${fmtBytes(m.blob.size)}` : ''}
            </div>
            <div className="text-[12px] text-ink-mute">分享时会一起发出；报告里显示封面</div>
          </div>
          <button className="rounded-full p-2 text-fail active:bg-fail/10" onClick={del} aria-label="删除视频">
            <Icon name="Trash2" size={18} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" className="btn-soft flex-1 py-2.5 text-[14px]" disabled={busy} onClick={() => recRef.current?.click()}>
            {busy ? <Spinner /> : <Icon name="Video" size={18} />} 录视频
          </button>
          <button type="button" className="btn-ghost flex-1 py-2.5 text-[14px]" disabled={busy} onClick={() => pickRef.current?.click()}>
            <Icon name="FolderOpen" size={18} /> 选择视频
          </button>
        </div>
      )}
      <input ref={recRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => { add(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={pickRef} type="file" accept="video/*" className="hidden" onChange={(e) => { add(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
