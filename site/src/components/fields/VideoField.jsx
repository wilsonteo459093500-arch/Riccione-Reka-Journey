// 视频（如退场视频）：录像 / 选择 → 保留原文件供分享，截一帧做报告封面
import { useRef, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import { Spinner, useUI } from '../ui/UI.jsx';
import { useStore } from '../../lib/store.jsx';
import { useMediaUrl, useMediaRecord, forgetMedia } from './media.js';
import { fmtDuration, fmtBytes } from '../../lib/images.js';
import { markPicker, clearPicker, anchorOf } from '../../lib/pickerGuard.js';
import { t, tb, getUiLang } from '../../lib/i18n.js';

const BIG = 150 * 1024 * 1024;

export default function VideoField({ value, onChange, reportId }) {
  const { addMediaFile, removeMedia } = useStore();
  const { toast, confirm } = useUI();
  const recRef = useRef(null);
  const pickRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const poster = useMediaUrl(value, 'poster');
  const [m] = useMediaRecord(value);
  // 中英时按钮文字中文 / English 各一行（不然「录视频 Record」「video」折得很难看）
  const stack = getUiLang() === 'both' ? 'whitespace-pre-line text-center leading-tight' : undefined;

  const add = async (file) => {
    if (!file) return;
    if (file.size > BIG) {
      const size = fmtBytes(file.size);
      const ok = await confirm({
        title: t('视频比较大', 'Large video'),
        message: tb(
          `这个视频 ${size}，存进手机浏览器会占不少空间。\n建议录 30–60 秒的短视频。要继续吗？`,
          `This video is ${size} and will take up a lot of space in the phone's browser.\nShort clips of 30–60 seconds are recommended. Continue?`,
          '\n\n',
        ),
        okText: t('继续', 'Continue'),
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
      toast(e.message || t('视频处理失败', 'Could not process this video'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    const ok = await confirm({ title: t('删除这个视频？', 'Delete this video?'), okText: t('删除', 'Delete'), danger: true });
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
            <div className="font-semibold text-ink">{t('已添加视频', 'Video added')}</div>
            <div>
              {fmtDuration(m?.duration)} {m?.blob ? `· ${fmtBytes(m.blob.size)}` : ''}
            </div>
            <div className="whitespace-pre-line text-[12px] text-ink-mute">
              {tb('分享时会一起发出；报告里显示封面', 'Sent along when you share; the report shows a still frame')}
            </div>
          </div>
          <button className="rounded-full p-2 text-fail active:bg-fail/10" onClick={del} aria-label={t('删除视频', 'Delete video')}>
            <Icon name="Trash2" size={18} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" className="btn-soft flex-1 py-2.5 text-[14px]" disabled={busy} onClick={(e) => { markPicker(recRef.current, { reportId, anchor: anchorOf(e.currentTarget), kind: 'video' }); recRef.current?.click(); }}>
            {busy ? <Spinner /> : <Icon name="Video" size={18} />} <span className={stack}>{tb('录视频', 'Record video')}</span>
          </button>
          <button type="button" className="btn-ghost flex-1 py-2.5 text-[14px]" disabled={busy} onClick={(e) => { markPicker(pickRef.current, { reportId, anchor: anchorOf(e.currentTarget), kind: 'video' }); pickRef.current?.click(); }}>
            <Icon name="FolderOpen" size={18} /> <span className={stack}>{tb('选择视频', 'Choose video')}</span>
          </button>
        </div>
      )}
      <input ref={recRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => { clearPicker(); add(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={pickRef} type="file" accept="video/*" className="hidden" onChange={(e) => { clearPicker(); add(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
