// 照片：拍照 / 相册多选 / 网页相机 → 本地压缩入库；点缩略图看大图、写说明、删除、调顺序
import { useEffect, useRef, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import { Sheet, Spinner, useUI } from '../ui/UI.jsx';
import { useStore } from '../../lib/store.jsx';
import { useMediaUrl, useMediaRecord, setCaption, forgetMedia } from './media.js';
import { markPicker, clearPicker, anchorOf } from '../../lib/pickerGuard.js';
import { watchPicker, offerWebCamera, canWebCamera } from '../../lib/camera.js';
import PickerButton from './PickerButton.jsx';
import WebCamera from './WebCamera.jsx';
import { NoShowCard } from './CameraHelp.jsx';
import { t, tb, uiText, getUiLang } from '../../lib/i18n.js';

// 「照片 2 / 5」：中英时名称合在一起，序号只写一次
function counter(zh, en, n) {
  const l = getUiLang();
  return `${l === 'en' ? en : l === 'both' ? `${zh} ${en}` : zh} ${n}`;
}

function Thumb({ id, onClick, size = 'md' }) {
  const url = useMediaUrl(id, 'thumb');
  const [m] = useMediaRecord(id);
  const dim = size === 'sm' ? 'h-14 w-14' : 'h-[76px] w-[76px]';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${dim} relative shrink-0 overflow-hidden rounded-xl bg-cream-deep ring-1 ring-line active:scale-95`}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : url === null ? (
        <Icon name={m?.kind === 'video' ? 'Video' : 'Image'} size={22} className="m-auto text-ink-faint" />
      ) : (
        <Spinner className="m-auto text-ink-faint" />
      )}
      {m?.kind === 'video' && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Icon name="Play" size={18} className="text-white drop-shadow" />
        </span>
      )}
    </button>
  );
}

function Viewer({ id, index, total, onClose, onDelete, onMove }) {
  const url = useMediaUrl(id, 'full');
  const [m] = useMediaRecord(id);
  const [cap, setCap] = useState(null);
  const caption = cap ?? m?.caption ?? '';
  // 弹层被返回键关掉时也保存说明
  const capRef = useRef({ cap, orig: m?.caption || '' });
  capRef.current = { cap, orig: m?.caption || '' };
  useEffect(
    () => () => {
      const { cap: c, orig } = capRef.current;
      if (c != null && c.trim() !== orig) setCaption(id, c.trim());
    },
    [id],
  );
  return (
    <Sheet
      open
      onClose={async () => {
        if (cap != null && cap !== (m?.caption || '')) await setCaption(id, cap.trim());
        onClose();
      }}
      title={counter('照片', m?.kind === 'video' ? 'Video' : 'Photo', `${index + 1} / ${total}`)}
      footer={
        <div className="flex gap-2">
          <button className="btn-ghost px-3" disabled={index === 0} onClick={() => onMove(-1)} aria-label={t('前移', 'Move earlier')}>
            <Icon name="ChevronLeft" />
          </button>
          <button className="btn-ghost px-3" disabled={index === total - 1} onClick={() => onMove(1)} aria-label={t('后移', 'Move later')}>
            <Icon name="ChevronRight" />
          </button>
          <button className="btn flex-1 bg-fail/10 text-fail" onClick={() => onDelete(m?.kind)}>
            <Icon name="Trash2" size={18} /> {t('删除照片', m?.kind === 'video' ? 'Delete video' : 'Delete photo')}
          </button>
        </div>
      }
    >
      <div className="overflow-hidden rounded-2xl bg-black/5">
        {url && m?.kind === 'video' ? (
          <video src={url} controls playsInline className="mx-auto max-h-[52dvh] w-full bg-black" />
        ) : url ? (
          <img src={url} alt="" className="mx-auto max-h-[52dvh] w-auto object-contain" />
        ) : (
          <div className="flex h-60 items-center justify-center">{url === null ? t('无法预览', 'Preview not available') : <Spinner />}</div>
        )}
      </div>
      <label className="label mt-4">{t('照片说明（可选，会印在报告上）', 'Caption (optional, printed on the report)')}</label>
      <input
        className="input"
        value={caption}
        placeholder={t('例：主卧衣柜左门板缝隙', 'e.g. Gap at wardrobe left door')}
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
export default function PhotoStrip({ ids = [], onChange, reportId, max = 30, compact = false, label, acceptVideo = false }) {
  const { addMediaFile, removeMedia, track } = useStore();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const { toast, confirm } = useUI();
  const [cam, setCam] = useState(false); // 网页相机
  const [noShow, setNoShow] = useState(false); // 点了却没弹出相机 / 相册
  const webCam = offerWebCamera();
  const stopWatch = useRef(null);
  useEffect(() => () => stopWatch.current?.(), []);
  const [busy, setBusy] = useState(0);
  const [open, setOpen] = useState(-1);
  const list = ids || [];
  const left = Math.max(0, max - list.length);
  // 中英时按钮文字分两行（中文 / English）
  const tileText = `whitespace-pre-line text-center text-[11px] font-semibold${getUiLang() === 'both' ? ' leading-tight' : ''}`;

  const addFiles = (fileList) => {
    const isVideo = (f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name);
    // 有的手机相册给的文件没有类型也没有扩展名：也收下，交给压缩去认（认不出会提示）
    const unknown = (f) => !f.type && !/\.[a-z0-9]{2,5}$/i.test(f.name || '');
    const files = [...(fileList || [])].filter(
      (f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name) || (acceptVideo && isVideo(f)) || unknown(f),
    );
    if (!files.length) return;
    const take = files.slice(0, left);
    if (files.length > left) toast(t(`最多 ${max} 张，已加入前 ${take.length} 张`, `Max ${max} photos: added ${take.length} of ${files.length}`), 'warn');
    setBusy((b) => b + take.length);
    // 整批作为一个任务登记：离开编辑页时会等整批处理完；每张处理好就立刻挂上（基于最新列表）
    track(
      (async () => {
        for (const f of take) {
          const kind = acceptVideo && isVideo(f) ? 'video' : 'photo';
          try {
            const id = await addMediaFile(reportId, f, kind);
            onChange((prev) => [...(prev || []), id]);
          } catch (e) {
            toast(e.message || t('照片处理失败', kind === 'video' ? 'Could not process this video' : 'Could not process this photo'), 'error');
          } finally {
            if (alive.current) setBusy((b) => Math.max(0, b - 1));
          }
        }
      })(),
    );
  };

  // 点了「拍照 / 相册」：记一笔（被系统关掉时回来能提示）；看一会儿有没有弹出东西，没有就提示用网页相机
  const picked = (input, btn, kind) => {
    markPicker(input, { reportId, anchor: anchorOf(btn), kind });
    setNoShow(false);
    stopWatch.current?.();
    stopWatch.current = watchPicker(input, () => {
      clearPicker();
      if (alive.current) setNoShow(true);
    });
  };
  const gotFiles = (files) => {
    clearPicker();
    setNoShow(false);
    addFiles(files);
  };

  const del = async (i, kind) => {
    const ok = await confirm({
      title: t('删除这张照片？', kind === 'video' ? 'Delete this video?' : 'Delete this photo?'),
      message: tb('删除后无法恢复。', 'This cannot be undone.'),
      okText: t('删除', 'Delete'),
      danger: true,
    });
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
      {label && <div className="label">{uiText(label)}</div>}
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
            <PickerButton
              label={t('拍照', 'Take photo')}
              accept="image/*"
              capture="environment"
              onPick={(input, btn) => picked(input, btn, 'camera')}
              onFiles={gotFiles}
              className={`${compact ? 'h-14 w-14' : 'h-[76px] w-[76px]'} flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-terra/40 bg-terra-soft/50 text-terra active:scale-95`}
            >
              <Icon name="Camera" size={compact ? 18 : 22} />
              {!compact && <span className={tileText}>{tb('拍照', 'Camera')}</span>}
            </PickerButton>
            <PickerButton
              label={acceptVideo ? t('相册/视频', 'Gallery / Video') : t('相册', 'Gallery')}
              accept={acceptVideo ? 'image/*,video/*' : 'image/*'}
              multiple
              onPick={(input, btn) => picked(input, btn, 'library')}
              onFiles={gotFiles}
              className={`${compact ? 'h-14 w-14' : 'h-[76px] w-[76px]'} flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-line bg-white text-ink-mute active:scale-95`}
            >
              <Icon name="ImagePlus" size={compact ? 18 : 22} />
              {!compact && (
                <span className={tileText}>
                  {acceptVideo ? tb('相册/视频', 'Gallery / Video') : tb('相册', 'Gallery')}
                </span>
              )}
            </PickerButton>
            {/* 华为 / App 内置浏览器：多给一个「网页相机」（在页面里直接拍，不经过系统相机） */}
            {webCam && (
              <button
                type="button"
                className={`${compact ? 'h-14 w-14' : 'h-[76px] w-[76px]'} flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-pine/40 bg-pine/5 text-pine active:scale-95`}
                onClick={() => setCam(true)}
                aria-label={t('网页相机', 'Web camera')}
              >
                <Icon name="Smartphone" size={compact ? 16 : 22} />
                {/* 小格子也写字：只有图标看不出是什么 */}
                <span className={compact ? 'whitespace-pre-line text-center text-[9px] font-semibold leading-[1.1]' : tileText}>{tb('网页相机', 'Web cam')}</span>
              </button>
            )}
          </>
        )}
      </div>
      {noShow && left > 0 && (
        <NoShowCard onWebCamera={canWebCamera() ? () => { setNoShow(false); setCam(true); } : null} onClose={() => setNoShow(false)} />
      )}
      {cam && (
        <WebCamera
          open
          left={left}
          onClose={() => setCam(false)}
          onPhoto={(file) => addFiles([file])}
        />
      )}
      {open >= 0 && list[open] && (
        <Viewer
          id={list[open]}
          index={open}
          total={list.length}
          onClose={() => setOpen(-1)}
          onDelete={(kind) => del(open, kind)}
          onMove={(d) => move(open, d)}
        />
      )}
    </div>
  );
}
